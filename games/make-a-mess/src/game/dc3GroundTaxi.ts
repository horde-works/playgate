import type { SceneVector3 } from "./destructionScene";
import type { VehicleRoutePlan } from "./vehicleFrames";

const TAXI_SAMPLE_METRES = 0.1;
const TAXI_HEADING_TOLERANCE = (2 * Math.PI) / 180;
const TAXI_YAW_SETTLE_RATE = 0.015;
const TAXI_LINE_CAPTURE_METRES = 10;
const TAXI_PIVOT_STOP_SPEED = 0.03;

export interface Dc3GroundTaxiInput {
  readonly plan: VehicleRoutePlan;
  readonly progress: number;
  readonly centre: SceneVector3;
  readonly heading: readonly [number, number];
  readonly velocity: SceneVector3;
  readonly yawRate: number;
  readonly maximumYawRate: number;
  /** Pure propeller-couple angular acceleration, rad/s². */
  readonly pivotYawAcceleration?: number;
  /** Distance from the pivot axle to the tail wheel, m. */
  readonly pivotRadius?: number;
  /** Main axle position ahead of the mass centre, m. */
  readonly pivotPointAhead?: number;
  readonly acceleration?: number;
  readonly braking: number;
  readonly responseSeconds: number;
  readonly state?: Dc3GroundTaxiState | null;
}

export type Dc3GroundTaxiPhase =
  | "tracking"
  | "braking"
  | "pivoting"
  | "departing"
  | "finished";

export interface Dc3GroundTaxiState {
  readonly phase: Dc3GroundTaxiPhase;
  readonly at: number;
  readonly point: SceneVector3;
  readonly incoming: readonly [number, number];
  readonly outgoing: readonly [number, number];
  readonly endpoint: boolean;
  /** Index of the taxi-route vertex currently being executed. */
  readonly vertexIndex: number;
}

export interface Dc3GroundTaxiDemand {
  readonly forwardSpeed: number;
  readonly forwardAcceleration: number;
  readonly yawRate: number;
  /** Required body yaw acceleration during a stationary pivot, rad/s². */
  readonly yawAcceleration: number;
  readonly headingTarget: readonly [number, number];
  readonly pivoting: boolean;
  readonly distanceToTurn: number | null;
  readonly state: Dc3GroundTaxiState;
}

/**
 * Ground-only progress projection for the DC-3.
 *
 * The shared airborne projector deliberately scans at least 2% of a route;
 * on the 13.5 km survey that is hundreds of metres and can place progress on
 * the far side of a taxi corner in one frame. Taxi progress searches only the
 * distance the wheels could physically have covered, at centimetre-scale
 * sampling. Flight progress and every other vehicle keep their existing law.
 */
export function advanceDc3GroundTaxiProgress(
  plan: VehicleRoutePlan,
  progress: number,
  centre: SceneVector3,
  travelled: number,
): number {
  const length = Math.max(1, plan.length);
  const backMetres = 0.25;
  const forwardMetres = Math.max(0.5, travelled * 2 + 0.15);
  const from = Math.max(0, progress - backMetres / length);
  const to = Math.min(1, progress + forwardMetres / length);
  const samples = Math.max(8, Math.ceil((backMetres + forwardMetres) / 0.05));
  let nearest = progress;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index <= samples; index += 1) {
    const at = from + ((to - from) * index) / samples;
    const point = plan.point(at);
    const distance = Math.hypot(point[0] - centre[0], point[2] - centre[2]);
    if (distance < bestDistance) {
      bestDistance = distance;
      nearest = at;
    }
  }
  return Math.max(progress, nearest);
}

interface TaxiStopProfile {
  readonly distance: number;
  at(remaining: number): {
    readonly speed: number;
    readonly acceleration: number;
  };
}

function clamp(value: number, low: number, high: number): number {
  return value <= low ? low : value >= high ? high : value;
}

function normalized(x: number, z: number): readonly [number, number] | null {
  const length = Math.hypot(x, z);
  return length > 1e-6 ? [x / length, z / length] : null;
}

function segmentHeading(
  plan: VehicleRoutePlan,
  at: number,
  metres = TAXI_SAMPLE_METRES,
): readonly [number, number] | null {
  const from = plan.point(clamp(at, 0, 1));
  const to = plan.point(clamp(at + metres / Math.max(1, plan.length), 0, 1));
  return normalized(to[0] - from[0], to[2] - from[2]);
}

function incomingHeading(
  plan: VehicleRoutePlan,
  progress: number,
): readonly [number, number] {
  const share = TAXI_SAMPLE_METRES / Math.max(1, plan.length);
  const from = plan.point(clamp(progress - share, 0, 1));
  const to = plan.point(clamp(progress, 0, 1));
  return (
    normalized(to[0] - from[0], to[2] - from[2]) ??
    segmentHeading(plan, progress) ??
    [1, 0]
  );
}

function signedAngle(
  from: readonly [number, number],
  to: readonly [number, number],
): number {
  return Math.atan2(
    from[1] * to[0] - from[0] * to[1],
    from[0] * to[0] + from[1] * to[1],
  );
}

/**
 * A jerk-bounded stop expressed as speed and acceleration by remaining
 * distance. Its acceleration and jerk come only from live reverse authority
 * and the engine response declared by the vehicle; the path follower owns no
 * authored deceleration or approach distance.
 */
function taxiStopProfile(
  cruiseSpeed: number,
  reverseAuthority: number,
  engineResponseSeconds: number,
): TaxiStopProfile {
  const speed = Math.max(0, cruiseSpeed);
  if (speed <= 1e-6) {
    return { distance: 0, at: () => ({ speed: 0, acceleration: 0 }) };
  }
  if (reverseAuthority <= 0 || engineResponseSeconds <= 0) {
    throw new Error("DC-3 taxi stop profile requires positive reverse authority and engine response");
  }
  const response = engineResponseSeconds;
  const jerk = reverseAuthority / response;
  // On a short stop the two response ramps meet before full reverse is
  // reached. On a longer one a constant-full-reverse middle section appears.
  const peak = Math.min(reverseAuthority, Math.sqrt(speed * jerk));
  const ramp = peak / jerk;
  const constant = Math.max(0, speed / peak - ramp);
  const duration = ramp * 2 + constant;

  const motionAt = (
    time: number,
  ): { speed: number; acceleration: number; travelled: number } => {
    if (time <= ramp) {
      return {
        speed: speed - 0.5 * jerk * time * time,
        acceleration: -jerk * time,
        travelled: speed * time - (jerk * time * time * time) / 6,
      };
    }
    const firstSpeed = speed - 0.5 * peak * ramp;
    const firstDistance = speed * ramp - (peak * ramp * ramp) / 6;
    if (time <= ramp + constant) {
      const elapsed = time - ramp;
      return {
        speed: firstSpeed - peak * elapsed,
        acceleration: -peak,
        travelled:
          firstDistance +
          firstSpeed * elapsed -
          0.5 * peak * elapsed * elapsed,
      };
    }
    const constantEndSpeed = 0.5 * peak * ramp;
    const constantEndDistance =
      firstDistance +
      firstSpeed * constant -
      0.5 * peak * constant * constant;
    const elapsed = Math.min(ramp, time - ramp - constant);
    return {
      speed:
        constantEndSpeed -
        peak * elapsed +
        0.5 * jerk * elapsed * elapsed,
      acceleration: -peak + jerk * elapsed,
      travelled:
        constantEndDistance +
        constantEndSpeed * elapsed -
        0.5 * peak * elapsed * elapsed +
        (jerk * elapsed * elapsed * elapsed) / 6,
    };
  };

  const distance = motionAt(duration).travelled;
  return {
    distance,
    at(remaining) {
      if (remaining >= distance) return { speed, acceleration: 0 };
      if (remaining <= 0) return { speed: 0, acceleration: 0 };
      const travelled = distance - remaining;
      let low = 0;
      let high = duration;
      for (let iteration = 0; iteration < 24; iteration += 1) {
        const middle = (low + high) / 2;
        if (motionAt(middle).travelled < travelled) low = middle;
        else high = middle;
      }
      const motion = motionAt((low + high) / 2);
      return {
        speed: Math.max(0, motion.speed),
        acceleration: motion.acceleration,
      };
    },
  };
}

/**
 * DC-3 ground navigation only. It does not call or modify the shared flight
 * autopilot. The path supplies geometry and a speed ceiling; this controller
 * chooses the attainable speed, stops at the next authored taxi vertex, turns
 * onto its authored outgoing edge, then releases translation again.
 *
 * Flight overlays (`:stabilization`, intercept, escape) are not taxi routes:
 * they have no vertices. Touchdown latches rollout while an airborne hold is
 * still active; asking this controller for that overlay is a caller error.
 */
export function dc3GroundTaxiOwnsPlan(
  plan: Pick<VehicleRoutePlan, "taxiVertices">,
): boolean {
  return (plan.taxiVertices?.length ?? 0) > 0;
}

export function dc3GroundTaxiDemand(
  input: Dc3GroundTaxiInput,
): Dc3GroundTaxiDemand {
  const { plan, progress, centre, heading, velocity } = input;
  const centreReference = centre;
  const pivotAhead = input.pivotPointAhead ?? 0;
  const axleReference: SceneVector3 = [
    centre[0] + heading[0] * pivotAhead,
    centre[1],
    centre[2] + heading[1] * pivotAhead,
  ];
  const groundSpeed = Math.hypot(velocity[0], velocity[2]);
  const forwardVelocity = velocity[0] * heading[0] + velocity[2] * heading[1];
  const braking = input.braking;
  const acceleration = Math.max(0, input.acceleration ?? braking);
  const routeCeiling = Math.max(0, plan.speedLimit(progress));
  const responseSeconds = input.responseSeconds;
  const stopProfile = taxiStopProfile(
    routeCeiling,
    braking,
    responseSeconds,
  );
  // Cruise is held until the service stopping profile reaches the vertex.
  // The shorter emergency distance is still watched for an unexpected
  // overspeed, but it does not define normal taxi behaviour.
  // Steering response is intentionally absent here: it is not propeller
  // braking response and previously inserted two fictitious metres.
  const emergencyStopDistance = (groundSpeed * groundSpeed) / (2 * braking);
  const vertices = plan.taxiVertices;
  if (!dc3GroundTaxiOwnsPlan(plan) || !vertices) {
    throw new Error(`Taxi route ${plan.id} has no authored taxi vertices`);
  }
  let precedingVertex = -1;
  while (
    precedingVertex + 1 < vertices.length &&
    vertices[precedingVertex + 1].progress < progress
  ) {
    precedingVertex += 1;
  }
  let state: Dc3GroundTaxiState =
    input.state ?? {
      phase: "tracking",
      at: progress,
      point: plan.point(progress),
      incoming: incomingHeading(plan, progress),
      outgoing: incomingHeading(plan, progress),
      endpoint: false,
      vertexIndex: precedingVertex,
    };

  // Once physical route progress has left the executed vertex, the next
  // authored vertex becomes current. No release distance is invented here.
  const departedAlongOutgoing =
    (axleReference[0] - state.point[0]) * state.outgoing[0] +
    (axleReference[2] - state.point[2]) * state.outgoing[1];
  if (
    state.phase === "departing" &&
    (progress > state.at || departedAlongOutgoing > 0)
  ) {
    state = {
      phase: "tracking",
      at: progress,
      point: plan.point(progress),
      incoming: state.outgoing,
      outgoing: state.outgoing,
      endpoint: false,
      vertexIndex: state.vertexIndex,
    };
  }
  const nextVertex =
    state.phase === "tracking"
      ? (vertices[state.vertexIndex + 1] ?? null)
      : null;
  // Turn vertices belong to the point that actually remains stationary: the
  // main axle. Driving the mass centre to the crossing and then rotating about
  // an axle ahead of it deposited the centre off the outgoing line, forcing a
  // visible tail-wheel recapture after every otherwise correct turn. The final
  // berth is not a turn and remains a mass-centre target.
  const reference =
    (state.phase === "tracking" ? nextVertex?.endpoint : state.endpoint)
      ? centreReference
      : axleReference;
  const nextVertexDistance = nextVertex
    ? Math.hypot(
        nextVertex.point[0] - reference[0],
        nextVertex.point[2] - reference[2],
      )
    : null;
  if (
    state.phase === "tracking" &&
    nextVertex &&
    nextVertexDistance !== null &&
    nextVertexDistance <= Math.max(stopProfile.distance, emergencyStopDistance)
  ) {
    state = {
      phase: "braking",
      at: nextVertex.progress,
      point: nextVertex.point,
      incoming: nextVertex.incoming,
      outgoing: nextVertex.outgoing,
      endpoint: nextVertex.endpoint,
      vertexIndex: state.vertexIndex + 1,
    };
  }
  const activePoint = state.point;
  const activeDistance = Math.hypot(
    activePoint[0] - reference[0],
    activePoint[2] - reference[2],
  );
  const activeAlong =
    (activePoint[0] - reference[0]) * state.incoming[0] +
    (activePoint[2] - reference[2]) * state.incoming[1];
  const activeCorridor = plan.corridor?.(state.at);
  if (activeCorridor === undefined) {
    throw new Error("DC-3 ground taxi requires an authored route corridor");
  }
  if (
    state.phase === "braking" &&
    activeDistance <= activeCorridor &&
    groundSpeed < TAXI_PIVOT_STOP_SPEED &&
    Math.abs(input.yawRate) < 0.02
  ) {
    state = { ...state, phase: state.endpoint ? "finished" : "pivoting" };
  }
  if (state.phase === "pivoting") {
    const captured =
      groundSpeed < 0.3 &&
      Math.abs(signedAngle(heading, state.outgoing)) <=
        TAXI_HEADING_TOLERANCE &&
      Math.abs(input.yawRate) <= TAXI_YAW_SETTLE_RATE;
    if (captured) {
      state = { ...state, phase: state.endpoint ? "finished" : "departing" };
    }
  }

  let headingTarget: readonly [number, number];
  if (state.phase === "braking") {
    // Braking and pivot are separate physical actions. Hold the incoming
    // centreline until translation is gone; asking for the outgoing heading
    // here starts differential thrust while the aircraft is still rolling
    // and turns the stop into an arbitrary arc.
    headingTarget = state.incoming;
  } else if (
    state.phase === "pivoting" ||
    state.phase === "departing" ||
    state.phase === "finished"
  ) {
    headingTarget = state.outgoing;
  } else {
    // На прямой цель — касательная плюс ограниченная поправка сноса, а не
    // точка в двух метрах перед носом. Короткая pure-pursuit хорда превращала
    // два метра поперечной ошибки в 45° курса и раскачивала DC-3 от кромки к
    // кромке, не давая набрать рулёжный ход.
    const tangent = incomingHeading(plan, progress);
    const routeHere = plan.point(progress);
    const offsetX = reference[0] - routeHere[0];
    const offsetZ = reference[2] - routeHere[2];
    const crossTrack = tangent[1] * offsetX - tangent[0] * offsetZ;
    const correction = clamp(
      Math.atan2(-crossTrack, TAXI_LINE_CAPTURE_METRES),
      -Math.PI / 6,
      Math.PI / 6,
    );
    const cosine = Math.cos(correction);
    const sine = Math.sin(correction);
    headingTarget = [
      tangent[0] * cosine + tangent[1] * sine,
      -tangent[0] * sine + tangent[1] * cosine,
    ];
  }

  const headingError = signedAngle(heading, headingTarget);
  const maximumYawRate = Math.max(0, input.maximumYawRate);
  const pivotYawAcceleration = Math.max(
    1e-6,
    input.pivotYawAcceleration ?? maximumYawRate / responseSeconds,
  );
  const pivotRateCeiling =
    input.pivotRadius !== undefined && input.pivotRadius > 1e-6
      ? routeCeiling / input.pivotRadius
      : maximumYawRate;
  // Full opposed thrust is the physical authority, not the normal manoeuvre
  // command. Reaching the wheel-speed ceiling inside the real engine response
  // time defines the required acceleration; the smaller available value wins.
  const pivotManeuverAcceleration = Math.min(
    pivotYawAcceleration,
    pivotRateCeiling / responseSeconds,
  );
  // A stationary pivot is a rest-to-rest angular move. Its rate comes from
  // the smaller of two physical envelopes: braking distance v² = 2·a·s and
  // the rate at which the tail wheel stays within the authored taxi speed.
  // Unlike `angle / response`, sqrt(2·a·s) does not make the actuator vanish
  // linearly near the target; a small external disturbance is therefore
  // closed instead of becoming a permanent heading error.
  const pivotYawRate =
    Math.sign(headingError) *
    Math.min(
      Math.sqrt(2 * pivotManeuverAcceleration * Math.abs(headingError)),
      pivotRateCeiling,
    );
  // The navigator knows the remaining angle, current angular velocity and
  // available propeller-couple acceleration. Execute the rest-to-rest move
  // directly: accelerate while the remaining angle exceeds the physical
  // stopping angle ω²/(2a), then apply the opposite moment. Feeding only the
  // rate boundary to another slow P loop made every 90° turn cross its target
  // three times before settling.
  const pivotYawAccelerationDemand = (() => {
    if (state.phase !== "pivoting") return 0;
    if (Math.abs(headingError) <= TAXI_HEADING_TOLERANCE) {
      return Math.abs(input.yawRate) > TAXI_YAW_SETTLE_RATE
        ? -Math.sign(input.yawRate) * pivotManeuverAcceleration
        : 0;
    }
    const direction = Math.sign(headingError);
    const directedRate = direction * input.yawRate;
    if (directedRate < 0) return direction * pivotManeuverAcceleration;
    const stoppingAngle =
      (directedRate * directedRate) / (2 * pivotManeuverAcceleration);
    if (stoppingAngle >= Math.abs(headingError)) {
      return -direction * pivotManeuverAcceleration;
    }
    return directedRate < pivotRateCeiling
      ? direction * pivotManeuverAcceleration
      : 0;
  })();
  const demandedYawRate =
    state.phase === "braking" || state.phase === "finished"
    ? 0
    : state.phase === "pivoting" &&
        Math.abs(headingError) <= TAXI_HEADING_TOLERANCE
      ? 0
    : state.phase === "pivoting"
      ? pivotYawRate
      : clamp(headingError * 0.65, -maximumYawRate, maximumYawRate);

  // Progress is only a route-search cursor. The stop law closes the actual
  // pose error of the mass centre along the incoming leg, so a projection that
  // has already reached the vertex cannot make the controller blind to a
  // vehicle that has not.
  const remainingToActive = Math.max(0, activeAlong);
  const curve = stopProfile.at(remainingToActive);
  const forwardSpeed =
    state.phase === "pivoting" ||
    state.phase === "finished"
      ? 0
      : state.phase === "braking"
        ? curve.speed
      : routeCeiling;
  // The normal stop curve is one-sided because it approaches the vertex from
  // the incoming leg. If momentum carries the centre past the point, request
  // the reverse closing speed from the same kinematic identity v² = 2·a·s;
  // no minimum throttle or fitted recovery distance is needed.
  const targetForwardVelocity =
    state.phase === "braking" && activeAlong < 0
      ? -Math.sqrt(2 * braking * -activeAlong)
      : forwardSpeed;
  // The curve is spatial. Its time derivative must therefore use the actual
  // rate at which the centre advances through it. Scaling by v/v_ref is the
  // chain rule, and makes feed-forward vanish when the aircraft is stopped
  // short instead of commanding reverse forever at zero speed.
  const curveAcceleration =
    state.phase === "braking" && curve.speed > 1e-6
      ? curve.acceleration *
        (Math.max(0, forwardVelocity) / curve.speed)
      : 0;
  const forwardAcceleration =
    state.phase === "pivoting" || state.phase === "finished"
      ? 0
      : clamp(
          curveAcceleration +
            (targetForwardVelocity - forwardVelocity) / responseSeconds,
          -braking,
          acceleration,
        );

  return {
    forwardSpeed,
    forwardAcceleration,
    yawRate: demandedYawRate,
    yawAcceleration: pivotYawAccelerationDemand,
    headingTarget,
    pivoting: state.phase === "pivoting",
    distanceToTurn:
      state.endpoint || state.phase === "finished"
        ? null
        : state.phase === "tracking"
          ? nextVertexDistance
          : activeDistance,
    state,
  };
}
