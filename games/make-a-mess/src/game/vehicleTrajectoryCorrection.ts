import type { SceneVector3 } from "./destructionScene.ts";
import {
  vehicleGuidanceCorridor,
  type VehicleGuidanceEnvelope,
  type VehicleGuidancePhase,
} from "./vehicleGuidanceEnvelope.ts";
import {
  balancedEngineYawAuthority,
  rejoinVehicleRouteProgress,
  rotateVector,
  rudderEffectiveness,
  vehicleRouteHeading,
  type Quaternion,
  type ShipModel,
  type VehicleRoutePlan,
} from "./vehicleFrames.ts";

export type VehicleTrajectoryDeviationReason = "track" | "altitude" | "upset";

export interface VehicleNavigationState {
  readonly position: SceneVector3;
  readonly orientation: Quaternion;
  readonly velocity: SceneVector3;
  readonly angularVelocity: SceneVector3;
}

export interface VehicleTrajectoryAssessment {
  /**
   * Ordinary guidance cannot meet the accuracy this stage requires by the
   * time the stage ends. This is the only reason to leave the authored route:
   * not "how far off am I" but "can I still get back in the distance left".
   */
  readonly correctionRequired: boolean;
  /** A rate event large enough to own the craft for a moment. */
  readonly upset: boolean;
  readonly reason: VehicleTrajectoryDeviationReason | null;
  readonly phase: VehicleGuidancePhase;
  readonly crossTrackError: number;
  readonly altitudeError: number;
  /** Route distance left before the present stage has to be met, in metres. */
  readonly distanceToGate: number;
  /** Lateral error ordinary turning can still remove in that distance. */
  readonly reachableClosure: number;
  /** Vertical error the trim can still remove in that distance. */
  readonly reachableAltitudeClosure: number;
  readonly tiltRate: number;
  readonly yawRate: number;
}

export type VehicleTrajectoryRequestedMode =
  "authoredRoute" | "intercepting" | "stabilizing";

export interface VehicleTrajectoryCorrectionPlan {
  readonly plan: VehicleRoutePlan;
  readonly mergeProgress: number;
  readonly countsAsGoAround: boolean;
}

function clamp01(value: number): number {
  return value <= 0 ? 0 : value >= 1 ? 1 : value;
}

function angleBetween(
  left: readonly [number, number],
  right: readonly [number, number],
): number {
  const leftLength = Math.hypot(...left) || 1;
  const rightLength = Math.hypot(...right) || 1;
  const cosine = Math.max(
    -1,
    Math.min(
      1,
      (left[0] * right[0] + left[1] * right[1]) / (leftLength * rightLength),
    ),
  );
  return Math.acos(cosine);
}

function horizontalDirection(
  vector: SceneVector3,
  fallback: readonly [number, number],
): readonly [number, number] {
  const length = Math.hypot(vector[0], vector[2]);
  return length > 1e-5 ? [vector[0] / length, vector[2] / length] : fallback;
}

function routeMovementHeading(
  plan: VehicleRoutePlan,
  progress: number,
): readonly [number, number] {
  const noseHeading = vehicleRouteHeading(plan, progress);
  const travelDirection = plan.travelDirection?.(progress) ?? 1;
  return [noseHeading[0] * travelDirection, noseHeading[1] * travelDirection];
}

function routeDistance(
  plan: VehicleRoutePlan,
  progress: number,
  point: SceneVector3,
  backwardWindow: number,
  forwardWindow: number,
): {
  readonly progress: number;
  readonly horizontal: number;
  readonly vertical: number;
} {
  const nearest = rejoinVehicleRouteProgress(
    plan,
    progress,
    point,
    backwardWindow,
    forwardWindow,
  );
  const routePoint = plan.point(nearest);
  return {
    progress: nearest,
    horizontal: Math.hypot(point[0] - routePoint[0], point[2] - routePoint[2]),
    vertical: point[1] - routePoint[1],
  };
}

/** The first stretch after cast-off, where the craft is still gathering way. */
const DEPARTURE_PROGRESS = 0.06;

export function vehicleGuidancePhaseAt(
  plan: VehicleRoutePlan,
  progress: number,
): VehicleGuidancePhase {
  if (progress >= plan.finalFrom) {
    return "approach";
  }
  return progress < DEPARTURE_PROGRESS ? "departure" : "cruise";
}

/**
 * Route distance still available before the present stage must be met: the
 * berth on final, the start of the approach otherwise.
 */
function distanceToGate(
  plan: VehicleRoutePlan,
  progress: number,
  phase: VehicleGuidancePhase,
): number {
  const remaining =
    phase === "approach"
      ? (1 - progress) * plan.length
      : (Math.max(0, plan.finalFrom - progress)) * plan.length;
  return Math.max(1, remaining);
}

/**
 * Lateral offset ordinary route following can still remove.
 *
 * A coordinated turn out and back gives `omega x d^2 / (4 v)` of sideways
 * travel over a flown distance d. That is the whole reason a machine-gun
 * burst on the circuit is a non-event while the same push on final is not:
 * the physics is identical, the distance left to use it in is not.
 */
export function vehicleReachableClosure(
  holdableRate: number,
  distance: number,
  speed: number,
  margin: number,
): number {
  const flownSpeed = Math.max(0.6, speed);
  return Math.min(
    distance,
    (margin * holdableRate * distance * distance) / (4 * flownSpeed),
  );
}

/**
 * Navigation-computer view of the route. It asks one question — can ordinary
 * guidance still meet this stage's requirement — and never asks who caused
 * the error. Pitch and roll are not part of that question: they have their
 * own continuous owners in the trim cars and the pendulum.
 */
export function assessVehicleTrajectory(
  plan: VehicleRoutePlan,
  progress: number,
  state: VehicleNavigationState,
  nose: SceneVector3,
  model: ShipModel,
  guidance: VehicleGuidanceEnvelope,
): VehicleTrajectoryAssessment {
  const groundSpeed = Math.hypot(state.velocity[0], state.velocity[2]);
  const current = routeDistance(plan, progress, state.position, 0.025, 0.08);
  const phase = vehicleGuidancePhaseAt(plan, progress);
  const corridor = vehicleGuidanceCorridor(guidance, phase);
  const gate = distanceToGate(plan, progress, phase);
  const holdableRate = holdableYawRate(model, nose, Math.max(1.5, groundSpeed));
  const reachableClosure = vehicleReachableClosure(
    holdableRate,
    gate,
    groundSpeed,
    guidance.closureMargin,
  );
  // The trim channel answers altitude the same way, using the lift authority
  // the machine actually has rather than a fixed tube.
  const flownSeconds = gate / Math.max(0.6, groundSpeed);
  const reachableAltitudeClosure =
    guidance.closureMargin *
    0.5 *
    9.81 *
    Math.max(0.02, model.limits.liftTrimRange) *
    flownSeconds *
    flownSeconds;

  const trackResidual = Math.max(0, current.horizontal - reachableClosure);
  const altitudeResidual = Math.max(
    0,
    Math.abs(current.vertical) - reachableAltitudeClosure,
  );
  const tiltRate = Math.hypot(
    state.angularVelocity[0],
    state.angularVelocity[2],
  );
  const yawRate = Math.abs(state.angularVelocity[1]);
  const upset =
    tiltRate > guidance.upsetEntry.tiltRate ||
    yawRate > guidance.upsetEntry.yawRate;

  const reason: VehicleTrajectoryDeviationReason | null = upset
    ? "upset"
    : trackResidual > corridor.crossTrack
      ? "track"
      : altitudeResidual > corridor.altitude
        ? "altitude"
        : null;

  return {
    correctionRequired: reason === "track" || reason === "altitude",
    upset,
    reason,
    phase,
    crossTrackError: current.horizontal,
    altitudeError: current.vertical,
    distanceToGate: gate,
    reachableClosure,
    reachableAltitudeClosure,
    tiltRate,
    yawRate,
  };
}

/**
 * What the watchdog must judge: the part of the present error that ordinary
 * guidance cannot remove before the stage has to be met. Raw distance from
 * the line is not a failure — a craft thirty metres off with half a circuit
 * ahead is doing fine — and feeding the watchdog the raw number makes it
 * answer a question guidance has already answered better.
 */
export function vehicleUnrecoverableDeviation(
  assessment: VehicleTrajectoryAssessment,
  crossTrackError: number,
  altitudeError: number,
): { readonly crossTrack: number; readonly altitude: number } {
  return {
    crossTrack: Math.max(0, crossTrackError - assessment.reachableClosure),
    altitude:
      Math.sign(altitudeError) *
      Math.max(
        0,
        Math.abs(altitudeError) - assessment.reachableAltitudeClosure,
      ),
  };
}

/** A hold rides out an upset; it is never a long manoeuvre. */
export const VEHICLE_HOLD_ALLOWANCE_SECONDS = 12;

/**
 * Time an episode may run with the route timers suspended. An intercept knows
 * its own length and speed, so the allowance follows the manoeuvre the machine
 * actually has to fly instead of an unrelated constant.
 */
export function vehicleCorrectionAllowanceSeconds(
  correction: VehicleTrajectoryCorrectionPlan | null,
  graceSeconds: number,
): number {
  if (!correction) {
    return Math.min(VEHICLE_HOLD_ALLOWANCE_SECONDS, graceSeconds);
  }
  const speed = Math.max(0.5, correction.plan.speedLimit(0));
  return Math.min(
    graceSeconds,
    Math.max(
      VEHICLE_HOLD_ALLOWANCE_SECONDS,
      (2 * correction.plan.length) / speed,
    ),
  );
}

/**
 * One autopilot, three modes. An upset owns the craft while it lasts; an
 * unreachable route state asks for an intercept; everything else is ordinary
 * route following, which is also where a small push gets corrected.
 */
export function requestedVehicleTrajectoryMode(
  assessment: VehicleTrajectoryAssessment,
): VehicleTrajectoryRequestedMode {
  if (assessment.upset) {
    return "stabilizing";
  }
  return assessment.correctionRequired ? "intercepting" : "authoredRoute";
}

/**
 * The upset has passed. Nothing is asked about the resulting attitude: the
 * flight simply continues, and whether it can still be flown or landed is
 * decided by the ordinary approach, go-around and failure machinery.
 */
export function vehicleUpsetSettled(
  state: VehicleNavigationState,
  guidance: VehicleGuidanceEnvelope,
): boolean {
  const exit = guidance.upsetExit;
  return (
    Math.hypot(state.angularVelocity[0], state.angularVelocity[2]) <
      exit.tiltRate && Math.abs(state.angularVelocity[1]) < exit.yawRate
  );
}

function holdableYawRate(
  model: ShipModel,
  nose: SceneVector3,
  speed: number,
): number {
  const noseLength = Math.hypot(nose[0], nose[2]) || 1;
  const localNose: readonly [number, number] = [
    nose[0] / noseLength,
    nose[2] / noseLength,
  ];
  const lateral: readonly [number, number] = [-localNose[1], localNose[0]];
  const yawArm = (
    point: SceneVector3,
    direction: readonly [number, number],
  ): number => {
    const rx = point[0] - model.bodyCentre[0];
    const rz = point[2] - model.bodyCentre[2];
    return rz * direction[0] - rx * direction[1];
  };
  const rudderArm = Math.abs(yawArm(model.limits.rudderPoint, lateral));
  const rudderMoment =
    model.limits.maxRudderForce *
    rudderEffectiveness(speed, model.limits) *
    rudderArm;
  const engineArms = model.limits.enginePoints.map((point) =>
    yawArm(point, localNose),
  );
  const engineMoment =
    model.limits.enginePower *
    balancedEngineYawAuthority(engineArms, model.engineAvailability);
  return Math.max(
    0.045,
    Math.min(
      0.42,
      (rudderMoment + engineMoment) / Math.max(1, model.dragAngular),
    ),
  );
}

function cubicPoint(
  start: SceneVector3,
  controlA: SceneVector3,
  controlB: SceneVector3,
  end: SceneVector3,
  progress: number,
): SceneVector3 {
  const t = clamp01(progress);
  const inverse = 1 - t;
  const a = inverse * inverse * inverse;
  const b = 3 * inverse * inverse * t;
  const c = 3 * inverse * t * t;
  const d = t * t * t;
  return [
    start[0] * a + controlA[0] * b + controlB[0] * c + end[0] * d,
    start[1] * a + controlA[1] * b + controlB[1] * c + end[1] * d,
    start[2] * a + controlA[2] * b + controlB[2] * c + end[2] * d,
  ];
}

function correctionCurve(
  sourcePlan: VehicleRoutePlan,
  mergeProgress: number,
  state: VehicleNavigationState,
  correctionSpeed: number,
  initialMovement: readonly [number, number],
): VehicleRoutePlan {
  const end = sourcePlan.point(mergeProgress);
  const travelDirection = sourcePlan.travelDirection?.(mergeProgress) ?? 1;
  const endDirection = routeMovementHeading(sourcePlan, mergeProgress);
  const horizontalDistance = Math.hypot(
    end[0] - state.position[0],
    end[2] - state.position[2],
  );
  const directDirection: readonly [number, number] =
    horizontalDistance > 1e-5
      ? [
          (end[0] - state.position[0]) / horizontalDistance,
          (end[2] - state.position[2]) / horizontalDistance,
        ]
      : endDirection;
  const initialProjection =
    initialMovement[0] * directDirection[0] +
    initialMovement[1] * directDirection[1];
  // A moving intercept begins on the measured course, so the ordinary
  // predictor can soften the turn instead of being handed an instantaneous
  // change of tangent. For a true reversal the candidate is deliberately a
  // direct go-around line; pointing the cubic behind its own chord would make
  // a geometric loop before the controller even sees it.
  const startDirection =
    initialProjection > 0.12 ? initialMovement : directDirection;
  // Handles longer than the intercept itself create a Bezier loop and a cusp:
  // the route heading can then jump by more than 90 degrees even though both
  // endpoints are close. Keep both tangents subordinate to the actual chord.
  const handle = Math.max(0.35, Math.min(horizontalDistance * 0.28, 24));
  const estimatedSeconds = Math.max(
    3,
    horizontalDistance / Math.max(1.5, correctionSpeed),
  );
  const controlA: SceneVector3 = [
    state.position[0] + startDirection[0] * handle,
    state.position[1] + (state.velocity[1] * estimatedSeconds) / 3,
    state.position[2] + startDirection[1] * handle,
  ];
  const controlB: SceneVector3 = [
    end[0] - endDirection[0] * handle,
    end[1],
    end[2] - endDirection[1] * handle,
  ];
  const point = (progress: number): SceneVector3 =>
    cubicPoint(state.position, controlA, controlB, end, progress);
  let length = 0;
  let previous = point(0);
  for (let sample = 1; sample <= 72; sample += 1) {
    const next = point(sample / 72);
    length += Math.hypot(
      next[0] - previous[0],
      next[1] - previous[1],
      next[2] - previous[2],
    );
    previous = next;
  }
  return {
    id: `${sourcePlan.id}:trajectory-correction`,
    length: Math.max(1, length),
    point,
    speedLimit(progress) {
      const mergeLimit = sourcePlan.speedLimit(mergeProgress);
      const endBlend = clamp01((progress - 0.72) / 0.28);
      return correctionSpeed * (1 - endBlend) + mergeLimit * endBlend;
    },
    altitude(progress) {
      return point(progress)[1];
    },
    travelDirection() {
      return travelDirection;
    },
    guidanceLookahead() {
      // The guidance target must remain beyond the controller's 2–3.5 second
      // predicted position. A look-ahead derived only from a short intercept's
      // length let the predicted fortress overtake its own target immediately;
      // the controller then quite rationally demanded a maximum turn back.
      // Terminal guidance below extends this horizon onto the source route.
      return Math.max(8, Math.min(24, correctionSpeed * 3.2));
    },
    terminalGuidanceHeading: endDirection,
    terminalGuidancePoint(distance) {
      const requestedProgress = Math.min(
        1,
        mergeProgress + Math.max(0, distance) / sourcePlan.length,
      );
      if (
        (sourcePlan.travelDirection?.(requestedProgress) ?? 1) ===
        travelDirection
      ) {
        return sourcePlan.point(requestedProgress);
      }
      // Guidance may look beyond the planned join, but never into a different
      // authored manoeuvre such as the sternway/forward pivot.
      let sameSide = mergeProgress;
      let otherSide = requestedProgress;
      for (let step = 0; step < 18; step += 1) {
        const middle = (sameSide + otherSide) / 2;
        if ((sourcePlan.travelDirection?.(middle) ?? 1) === travelDirection) {
          sameSide = middle;
        } else {
          otherSide = middle;
        }
      }
      return sourcePlan.point(sameSide);
    },
    finalFrom: Number.POSITIVE_INFINITY,
  };
}

interface MergeCandidate {
  readonly progress: number;
  readonly point: SceneVector3;
  readonly distance: number;
  readonly score: number;
}

/**
 * Selects the closest useful route state, not the geometrically closest point.
 * On final approach a candidate must leave enough flown distance to settle
 * heading and speed; otherwise the search walks back up the glide path.
 */
export function planVehicleTrajectoryCorrection(
  sourcePlan: VehicleRoutePlan,
  sourceProgress: number,
  state: VehicleNavigationState,
  model: ShipModel,
  nose: SceneVector3,
): VehicleTrajectoryCorrectionPlan | null {
  const speed = Math.hypot(state.velocity[0], state.velocity[2]);
  const forward3 = rotateVector(state.orientation, nose);
  const actualHeading = horizontalDirection(
    forward3,
    vehicleRouteHeading(sourcePlan, sourceProgress),
  );
  const yawRate = holdableYawRate(model, nose, Math.max(1.5, speed));
  const availability =
    model.engineAvailability ?? model.limits.enginePoints.map(() => 1);
  const deceleration = Math.max(
    0.18,
    (model.limits.enginePower *
      availability.reduce((sum, fraction) => sum + fraction, 0)) /
      Math.max(1, model.mass),
  );
  const onApproach = sourceProgress >= sourcePlan.finalFrom;
  const from = onApproach
    ? Math.max(0, sourcePlan.finalFrom)
    : Math.max(0, sourceProgress - 0.035);
  const to = onApproach
    ? 0.992
    : Math.min(0.985, sourceProgress + Math.max(0.12, 95 / sourcePlan.length));
  const candidates: MergeCandidate[] = [];
  const samples = 96;
  const sourceTravelDirection =
    sourcePlan.travelDirection?.(sourceProgress) ?? 1;
  const initialMovement =
    speed > 0.75
      ? horizontalDirection(state.velocity, [
          actualHeading[0] * sourceTravelDirection,
          actualHeading[1] * sourceTravelDirection,
        ])
      : ([
          actualHeading[0] * sourceTravelDirection,
          actualHeading[1] * sourceTravelDirection,
        ] as const);

  for (let sample = 0; sample <= samples; sample += 1) {
    const candidateProgress = from + ((to - from) * sample) / samples;
    // A correction may rejoin only the current authored manoeuvre. Crossing a
    // sternway/forward boundary would change the active manoeuvre before the
    // autopilot has met the current mode's exit criterion.
    if (
      (sourcePlan.travelDirection?.(candidateProgress) ?? 1) !==
      sourceTravelDirection
    ) {
      continue;
    }
    const point = sourcePlan.point(candidateProgress);
    const distance = Math.hypot(
      point[0] - state.position[0],
      point[2] - state.position[2],
    );
    const lineOfSight: readonly [number, number] =
      distance > 1e-5
        ? [
            (point[0] - state.position[0]) / distance,
            (point[2] - state.position[2]) / distance,
          ]
        : routeMovementHeading(sourcePlan, candidateProgress);
    const targetNose = vehicleRouteHeading(sourcePlan, candidateProgress);
    const candidateTravelDirection =
      sourcePlan.travelDirection?.(candidateProgress) ?? 1;
    const targetMovement: readonly [number, number] = [
      targetNose[0] * candidateTravelDirection,
      targetNose[1] * candidateTravelDirection,
    ];
    // An intercept has two turns: onto its chord and from that chord onto the
    // source route. Taking only the larger one let a twelve-metre shortcut
    // pass the feasibility test although the fortress had nearly 180 degrees
    // of combined course change to perform. Reserve flown distance for both,
    // plus one controller horizon in which the predictor can settle the yaw.
    const entryTurn = angleBetween(initialMovement, lineOfSight);
    const exitTurn = angleBetween(lineOfSight, targetMovement);
    const initialNoseForMovement: readonly [number, number] = [
      initialMovement[0] * sourceTravelDirection,
      initialMovement[1] * sourceTravelDirection,
    ];
    const noseCaptureTurn = angleBetween(actualHeading, initialNoseForMovement);
    const turnDemand = noseCaptureTurn + entryTurn + exitTurn * 0.7;
    const turnSeconds = turnDemand / yawRate;
    const turnLead = Math.max(
      12,
      speed * turnSeconds * 1.35 + Math.max(8, speed * 3.5),
    );
    const estimatedSeconds = Math.max(
      3,
      distance / Math.max(1.5, Math.min(5.5, Math.max(speed, 2.2))),
      turnSeconds,
    );
    const verticalAuthority = 9.81 * Math.max(0.04, model.limits.liftTrimRange);
    const verticalReach =
      Math.abs(state.velocity[1]) * estimatedSeconds +
      0.5 * verticalAuthority * estimatedSeconds * estimatedSeconds +
      1.5;
    if (Math.abs(point[1] - state.position[1]) > verticalReach) {
      continue;
    }
    if (distance + 2 < turnLead) {
      continue;
    }
    const candidateOnApproach = candidateProgress >= sourcePlan.finalFrom;
    if (candidateOnApproach) {
      const remaining = (1 - candidateProgress) * sourcePlan.length;
      const brakingDistance =
        (speed * speed) / (2 * deceleration) +
        Math.max(14, sourcePlan.speedLimit(candidateProgress) * 3.2);
      const alignmentReserve =
        ((speed * angleBetween(actualHeading, targetNose)) / yawRate) * 0.45;
      if (remaining < brakingDistance + alignmentReserve) {
        continue;
      }
    }
    const regression =
      Math.max(0, sourceProgress - candidateProgress) * sourcePlan.length;
    const missionPenalty = onApproach
      ? (1 - candidateProgress) * sourcePlan.length * 0.32
      : regression * 2.2 +
        Math.abs(candidateProgress - sourceProgress) * sourcePlan.length * 0.22;
    candidates.push({
      progress: candidateProgress,
      point,
      distance,
      score:
        distance +
        missionPenalty +
        entryTurn * Math.max(4, speed * 2) +
        exitTurn * Math.max(2, speed),
    });
  }

  candidates.sort((left, right) => left.score - right.score);
  const selected = candidates[0];
  if (!selected) {
    return null;
  }
  const correctionSpeed = Math.max(
    1.8,
    Math.min(
      5.5,
      sourcePlan.speedLimit(selected.progress),
      Math.max(2.2, speed),
    ),
  );
  return {
    plan: correctionCurve(
      sourcePlan,
      selected.progress,
      state,
      correctionSpeed,
      initialMovement,
    ),
    mergeProgress: selected.progress,
    countsAsGoAround: onApproach && selected.progress < sourceProgress - 0.002,
  };
}

export function vehicleTrajectoryMergeReady(
  sourcePlan: VehicleRoutePlan,
  mergeProgress: number,
  state: VehicleNavigationState,
  nose: SceneVector3,
  guidance: VehicleGuidanceEnvelope,
): boolean {
  const point = sourcePlan.point(mergeProgress);
  const forward = rotateVector(state.orientation, nose);
  const actualHeading = horizontalDirection(
    forward,
    vehicleRouteHeading(sourcePlan, mergeProgress),
  );
  const requiredHeading = vehicleRouteHeading(sourcePlan, mergeProgress);
  const movementHeading = routeMovementHeading(sourcePlan, mergeProgress);
  const groundSpeed = Math.hypot(state.velocity[0], state.velocity[2]);
  const velocityHeading = horizontalDirection(state.velocity, movementHeading);
  const merge = guidance.merge;
  // Place, course and the direction of travel. How the gondola happens to be
  // swinging is not part of being back on the line.
  return (
    Math.hypot(point[0] - state.position[0], point[2] - state.position[2]) <
      merge.position &&
    Math.abs(point[1] - state.position[1]) < merge.height &&
    angleBetween(actualHeading, requiredHeading) < merge.heading &&
    (groundSpeed < 0.8 ||
      angleBetween(velocityHeading, movementHeading) < merge.velocityHeading)
  );
}

/**
 * A zero-speed route while an upset runs its course. It invents no actuator:
 * the ordinary autopilot brakes, the trim cars keep working as they always do,
 * and the pendulum keeps righting the hull. Taking speed off is the whole
 * point — it buys those continuous loops the seconds they need.
 */
export function vehicleTrajectoryStabilizationPlan(
  sourcePlan: VehicleRoutePlan,
  progress: number,
  state: VehicleNavigationState,
  nose: SceneVector3,
): VehicleRoutePlan {
  const requiredNose = vehicleRouteHeading(sourcePlan, progress);
  const forward = rotateVector(state.orientation, nose);
  const actualNose = horizontalDirection(forward, requiredNose);
  const travelDirection = sourcePlan.travelDirection?.(progress) ?? 1;
  const movement: readonly [number, number] = [
    actualNose[0] * travelDirection,
    actualNose[1] * travelDirection,
  ];
  const targetAltitude = Math.max(
    state.position[1],
    sourcePlan.altitude(progress),
  );
  return {
    id: `${sourcePlan.id}:stabilization`,
    length: 2,
    point(value) {
      const distance = clamp01(value) * 2;
      return [
        state.position[0] + movement[0] * distance,
        targetAltitude,
        state.position[2] + movement[1] * distance,
      ];
    },
    speedLimit() {
      return 0;
    },
    altitude() {
      return targetAltitude;
    },
    travelDirection() {
      return travelDirection;
    },
    guidanceLookahead() {
      return 2;
    },
    finalFrom: Number.POSITIVE_INFINITY,
  };
}
