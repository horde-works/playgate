import type { SceneVector3 } from "./destructionScene.ts";
import {
  vehicleGuidanceCorridor,
  type VehicleGuidanceEnvelope,
} from "./vehicleGuidanceEnvelope.ts";
import {
  balancedEngineYawAuthority,
  rejoinVehicleRouteProgress,
  rotateVector,
  rudderEffectiveness,
  vehicleAttitude,
  vehicleRouteHeading,
  type Quaternion,
  type ShipModel,
  type VehicleRoutePlan,
} from "./vehicleFrames.ts";

export type VehicleTrajectoryDeviationReason =
  "track" | "heading" | "velocity" | "altitude" | "attitude" | "angularRate";

export interface VehicleNavigationState {
  readonly position: SceneVector3;
  readonly orientation: Quaternion;
  readonly velocity: SceneVector3;
  readonly angularVelocity: SceneVector3;
}

export interface VehicleTrajectoryAssessment {
  readonly correctionRequired: boolean;
  /**
   * Minor errors can be intercepted while continuing the flight. A stop is
   * reserved for a hull that is tumbling or leaving its controllable envelope.
   */
  readonly requiresStabilization: boolean;
  readonly reason: VehicleTrajectoryDeviationReason | null;
  readonly crossTrackError: number;
  readonly predictedCrossTrackError: number;
  readonly headingError: number;
  readonly velocityDirectionError: number;
  readonly altitudeError: number;
  readonly predictedAltitudeError: number;
  /** Planned chord excursion inside the active guidance lookahead. */
  readonly routeTurnExcursion: number;
  readonly tilt: number;
  readonly tiltAngularSpeed: number;
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

/**
 * Route following deliberately aims ahead. On a bend, the dynamically valid
 * flight corridor therefore includes part of the chord inside that lookahead;
 * judging it against the same tube as a straight line creates false mode
 * transitions for large, inertial hulls.
 */
function routeTurnExcursion(plan: VehicleRoutePlan, progress: number): number {
  const guidanceDistance = Math.max(
    8,
    plan.guidanceLookahead?.(progress) ??
      (progress >= plan.finalFrom ? 30 : 52),
  );
  const window = Math.min(0.18, guidanceDistance / Math.max(1, plan.length));
  const before = plan.point(Math.max(0, progress - window));
  const current = plan.point(progress);
  const after = plan.point(Math.min(1, progress + window));
  const chordX = after[0] - before[0];
  const chordZ = after[2] - before[2];
  const chordLengthSquared = chordX * chordX + chordZ * chordZ;
  if (chordLengthSquared < 1e-8) {
    return 0;
  }
  const projection = Math.max(
    0,
    Math.min(
      1,
      ((current[0] - before[0]) * chordX + (current[2] - before[2]) * chordZ) /
        chordLengthSquared,
    ),
  );
  return Math.min(
    32,
    Math.hypot(
      current[0] - (before[0] + chordX * projection),
      current[2] - (before[2] + chordZ * projection),
    ),
  );
}

/**
 * Navigation-computer view of the route. A recent impact narrows the corridor,
 * but loss of the corridor is also detected without an impact event:
 * collisions, wind and damaged propulsion must all reach the same supervisor.
 *
 * Every threshold comes from the machine's guidance envelope, which is derived
 * from its failure envelope. Guidance therefore always reacts before the
 * watchdog declares the same deviation a loss.
 */
export function assessVehicleTrajectory(
  plan: VehicleRoutePlan,
  progress: number,
  state: VehicleNavigationState,
  nose: SceneVector3,
  recentExternalImpulse: boolean,
  guidance: VehicleGuidanceEnvelope,
): VehicleTrajectoryAssessment {
  const forward = rotateVector(state.orientation, nose);
  const requiredHeading = vehicleRouteHeading(plan, progress);
  const actualHeading = horizontalDirection(forward, requiredHeading);
  const movementHeading = routeMovementHeading(plan, progress);
  const groundSpeed = Math.hypot(state.velocity[0], state.velocity[2]);
  const velocityHeading = horizontalDirection(state.velocity, movementHeading);
  const headingError = angleBetween(actualHeading, requiredHeading);
  const velocityDirectionError =
    groundSpeed > 0.75 ? angleBetween(velocityHeading, movementHeading) : 0;
  const current = routeDistance(plan, progress, state.position, 0.025, 0.08);
  const horizon = Math.max(1.5, Math.min(4, 1.4 + groundSpeed * 0.28));
  const predictedPosition: SceneVector3 = [
    state.position[0] + state.velocity[0] * horizon,
    state.position[1] + state.velocity[1] * horizon,
    state.position[2] + state.velocity[2] * horizon,
  ];
  const predicted = routeDistance(
    plan,
    progress,
    predictedPosition,
    0.02,
    0.12,
  );
  const attitude = vehicleAttitude(state.orientation, nose);
  const tilt = Math.hypot(attitude.pitch, attitude.roll);
  const tiltAngularSpeed = Math.hypot(
    state.angularVelocity[0],
    state.angularVelocity[2],
  );
  const plannedTurnExcursion = routeTurnExcursion(plan, progress);

  // The corridor is the machine's; the widening terms are geometry and speed,
  // which belong to the manoeuvre rather than to the passport.
  const corridor = vehicleGuidanceCorridor(guidance, recentExternalImpulse);
  const excursionGain = recentExternalImpulse ? 0.78 : 0.28;
  const predictedExcursionGain = recentExternalImpulse ? 0.9 : 0.34;
  const speedGain = recentExternalImpulse ? 0.72 : 1.9;
  const predictedSpeedGain = recentExternalImpulse ? 1.05 : 2.8;
  const trackLimit = Math.max(
    corridor.crossTrack + plannedTurnExcursion * excursionGain,
    groundSpeed * speedGain,
  );
  const predictedTrackLimit = Math.max(
    corridor.predictedCrossTrack + plannedTurnExcursion * predictedExcursionGain,
    groundSpeed * predictedSpeedGain,
  );
  const headingLimit = corridor.heading;
  const velocityLimit = corridor.velocityHeading;
  const altitudeLimit = corridor.altitude;
  const predictedAltitudeLimit = corridor.predictedAltitude;
  const tiltLimit = corridor.tilt;
  const angularRateLimit = corridor.tiltRate;
  const headingRelevant = groundSpeed > 1.2 || recentExternalImpulse;

  const reason: VehicleTrajectoryDeviationReason | null =
    current.horizontal > trackLimit
      ? "track"
      : predicted.horizontal > predictedTrackLimit
        ? "track"
        : headingRelevant && headingError > headingLimit
          ? "heading"
          : velocityDirectionError > velocityLimit
            ? "velocity"
            : Math.abs(current.vertical) > altitudeLimit ||
                Math.abs(predicted.vertical) > predictedAltitudeLimit
              ? "altitude"
              : tilt > tiltLimit
                ? "attitude"
                : tiltAngularSpeed > angularRateLimit
                  ? "angularRate"
                  : null;
  // Horizontal position and yaw are not reasons to stop by themselves. The
  // candidate search below knows the ship's turning/braking authority and can
  // choose a broad intercept. Stabilization is reserved for a state that is
  // changing too quickly to make one durable route prediction.
  const entry = guidance.stabilizationEntry;
  const requiresStabilization =
    tilt > entry.tilt ||
    tiltAngularSpeed > entry.tiltRate ||
    Math.abs(state.velocity[1]) > entry.verticalSpeed ||
    Math.abs(state.angularVelocity[1]) > entry.yawRate;

  return {
    correctionRequired: reason !== null,
    requiresStabilization,
    reason,
    crossTrackError: current.horizontal,
    predictedCrossTrackError: predicted.horizontal,
    headingError,
    velocityDirectionError,
    altitudeError: current.vertical,
    predictedAltitudeError: predicted.vertical,
    routeTurnExcursion: plannedTurnExcursion,
    tilt,
    tiltAngularSpeed,
  };
}

/**
 * Selects the mode requested from the one autopilot state machine. Course and
 * velocity errors alone do not justify leaving the authored-route mode: that
 * mode already closes both loops, including a scheduled sternway/forward
 * pivot. Spatial route loss requests an intercept; actual pitch/roll upset
 * requests stabilization.
 */
export function requestedVehicleTrajectoryMode(
  assessment: VehicleTrajectoryAssessment,
  guidance: VehicleGuidanceEnvelope,
): VehicleTrajectoryRequestedMode {
  if (!assessment.correctionRequired) {
    return "authoredRoute";
  }
  if (
    assessment.tilt > guidance.stabilizationEntry.tilt ||
    assessment.tiltAngularSpeed > guidance.stabilizationEntry.tiltRate
  ) {
    return "stabilizing";
  }
  if (assessment.reason === "attitude" || assessment.reason === "angularRate") {
    return "authoredRoute";
  }
  return assessment.reason === "track" || assessment.reason === "altitude"
    ? assessment.requiresStabilization
      ? "stabilizing"
      : "intercepting"
    : "authoredRoute";
}

/**
 * The hull has stopped tumbling enough to construct one stable intercept.
 *
 * A hold waits for a transient, not for a number. Structural loss moves the
 * live centre of mass permanently, and once the trim cars have done what they
 * can the hull hangs at a new equilibrium that is simply not level. Demanding
 * a small angle there would keep a perfectly controllable ship in a hold
 * forever, so a settled attitude ends the hold at whatever angle it settled.
 * Whether that angle is still flyable is the trim and watchdog's question.
 */
export function vehicleTrajectoryStabilized(
  assessment: VehicleTrajectoryAssessment,
  state: VehicleNavigationState,
  guidance: VehicleGuidanceEnvelope,
  /** The measured inclination is still falling; the transient is not over. */
  tiltImproving = false,
): boolean {
  const exit = guidance.stabilizationExit;
  return (
    (assessment.tilt < exit.tilt || !tiltImproving) &&
    assessment.tiltAngularSpeed < exit.tiltRate &&
    Math.abs(state.velocity[1]) < exit.verticalSpeed &&
    Math.abs(state.angularVelocity[1]) < exit.yawRate
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
  const attitude = vehicleAttitude(state.orientation, nose);
  const merge = guidance.merge;
  return (
    Math.hypot(point[0] - state.position[0], point[2] - state.position[2]) <
      merge.position &&
    Math.abs(point[1] - state.position[1]) < merge.height &&
    angleBetween(actualHeading, requiredHeading) < merge.heading &&
    (groundSpeed < 0.8 ||
      angleBetween(velocityHeading, movementHeading) < merge.velocityHeading) &&
    Math.hypot(attitude.pitch, attitude.roll) < merge.tilt &&
    Math.hypot(state.angularVelocity[0], state.angularVelocity[2]) <
      merge.tiltRate
  );
}

/** A zero-speed route lets the ordinary autopilot brake without inventing a
 * second set of actuators while the passive hull restores pitch and roll. */
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
