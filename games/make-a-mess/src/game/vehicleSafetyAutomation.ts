export type VehicleSafetyRisk = "clear" | "caution" | "intervention";
export type VehicleSafetyMode = "off" | "advisory" | "assisted";

export interface VehicleObstacleSample {
  readonly distance: number;
  /** Positive when the two sampled surface points are approaching. */
  readonly relativeClosingSpeed: number;
}

export interface VehicleObstacleReading extends VehicleObstacleSample {
  readonly probeIndex: number;
  /** Authored hull direction, used by the cockpit display. */
  readonly localNormal: readonly [number, number, number];
  /** Present direction after the carrier attitude has been applied. */
  readonly worldNormal: readonly [number, number, number];
  /** Probe point relative to the current centre of mass, in world axes. */
  readonly lever: readonly [number, number, number];
}

export interface VehicleDirectionalGuidance {
  readonly forwardSpeed: number;
  readonly lateralSpeed: number;
  readonly yawRate: number;
  readonly liftFraction: number;
}

export interface RotorcraftSafetyContext {
  readonly forward: readonly [number, number];
  readonly starboard: readonly [number, number];
  readonly verticalSpeed: number;
  readonly horizontalDeceleration: number;
  readonly verticalDeceleration: number;
  readonly liftTrimRange: number;
  readonly grounded: boolean;
  /** Explicit descent turns the lower proximity channel into landing radar. */
  readonly landingIntent: boolean;
}

export interface RotorcraftSafetyResult {
  readonly guidance: VehicleDirectionalGuidance;
  readonly intervenedProbeIndices: readonly number[];
}

export interface VehicleSafetyAdvisory {
  readonly risk: VehicleSafetyRisk;
  readonly distance: number;
  readonly relativeClosingSpeed: number;
  readonly timeToImpact: number;
  readonly stoppingDistance: number;
  readonly maximumSpeed: number;
  /** Route-altitude offset which remains a request for the autopilot. */
  readonly altitudeOffset: number;
}

const COLLISION_MARGIN = 1.5;

/**
 * Maximum closing speed which can still stop outside the margin after the
 * controller's short sensing/actuation latency. Solves
 * d = margin + v·latency + v²/(2a), rather than pretending braking begins now.
 */
export function vehicleSafeClosingSpeed(
  distance: number,
  availableDeceleration: number,
  margin = COLLISION_MARGIN,
  latencySeconds = 0.22,
): number {
  const room = Math.max(0, distance - Math.max(0, margin));
  const deceleration = Math.max(0.25, availableDeceleration);
  const latency = Math.max(0, latencySeconds);
  return Math.max(
    0,
    -deceleration * latency +
      Math.sqrt(
        deceleration * deceleration * latency * latency +
          2 * deceleration * room,
      ),
  );
}

/**
 * Proximity assistance edits neutral guidance, never motors or body forces.
 * Each obstacle contributes one velocity half-space: motion along the wall or
 * away from it remains untouched, while only the inward component is capped.
 */
export function constrainRotorcraftGuidance(
  requested: VehicleDirectionalGuidance,
  readings: readonly VehicleObstacleReading[],
  context: RotorcraftSafetyContext,
): RotorcraftSafetyResult {
  let worldX =
    context.forward[0] * requested.forwardSpeed +
    context.starboard[0] * requested.lateralSpeed;
  let worldZ =
    context.forward[1] * requested.forwardSpeed +
    context.starboard[1] * requested.lateralSpeed;
  let yawRate = requested.yawRate;
  let liftFraction = requested.liftFraction;
  const intervened = new Set<number>();

  for (const reading of readings) {
    const [nx, ny, nz] = reading.worldNormal;
    const horizontalLength = Math.hypot(nx, nz);
    if (horizontalLength >= 0.45) {
      const hx = nx / horizontalLength;
      const hz = nz / horizontalLength;
      const safeClosing = vehicleSafeClosingSpeed(
        reading.distance,
        context.horizontalDeceleration,
      );
      const translationClosing = worldX * hx + worldZ * hz;
      if (translationClosing > safeClosing) {
        const excess = translationClosing - safeClosing;
        worldX -= hx * excess;
        worldZ -= hz * excess;
        intervened.add(reading.probeIndex);
      }

      // A rotating duct can hit a wall while the centre is stationary. Clamp
      // only yaw which closes this particular probe; never reverse the turn.
      const yawClosingPerRate =
        reading.lever[2] * hx - reading.lever[0] * hz;
      const translated = worldX * hx + worldZ * hz;
      const yawClosing = yawRate * yawClosingPerRate;
      const yawAllowance = Math.max(0, safeClosing - translated);
      if (yawClosing > yawAllowance + 1e-6) {
        yawRate = Math.abs(yawClosingPerRate) > 1e-6
          ? yawAllowance / yawClosingPerRate
          : 0;
        intervened.add(reading.probeIndex);
      }
    }

    if (ny <= -0.65) {
      const margin = context.landingIntent ? 0.08 : 1.1;
      const sensedSafeDown = vehicleSafeClosingSpeed(
        reading.distance,
        context.verticalDeceleration,
        margin,
        0.16,
      );
      const safeDown =
        context.landingIntent && !context.grounded
          ? Math.max(0.18, sensedSafeDown)
          : sensedSafeDown;
      const desiredVerticalSpeed = context.landingIntent ? -safeDown : 0;
      const neededFraction =
        (desiredVerticalSpeed - context.verticalSpeed) / 9.81;
      if (
        -context.verticalSpeed > safeDown + 0.05 ||
        (requested.liftFraction < neededFraction &&
          reading.distance <= margin + 2.5)
      ) {
        liftFraction = Math.max(
          liftFraction,
          Math.min(context.liftTrimRange, neededFraction),
        );
        intervened.add(reading.probeIndex);
      }
    } else if (ny >= 0.65) {
      const safeUp = vehicleSafeClosingSpeed(
        reading.distance,
        context.verticalDeceleration,
        1.1,
        0.16,
      );
      const desiredVerticalSpeed = safeUp;
      const neededFraction =
        (desiredVerticalSpeed - context.verticalSpeed) / 9.81;
      if (
        context.verticalSpeed > safeUp + 0.05 ||
        (requested.liftFraction > neededFraction && reading.distance <= 3.6)
      ) {
        liftFraction = Math.min(
          liftFraction,
          Math.max(-context.liftTrimRange, neededFraction),
        );
        intervened.add(reading.probeIndex);
      }
    }
  }

  return {
    guidance: {
      forwardSpeed:
        worldX * context.forward[0] + worldZ * context.forward[1],
      lateralSpeed:
        worldX * context.starboard[0] + worldZ * context.starboard[1],
      yawRate,
      liftFraction,
    },
    intervenedProbeIndices: [...intervened],
  };
}

/** Authored berth structures are expected geometry within this radius. */
export const BERTH_SENSING_RADIUS = 30;

/**
 * Where predictive intervention stands down. This is always a question about
 * the authored plan that owns the berth: a temporary intercept ends at a route
 * join and knows nothing about the mast it may be passing, so answering it
 * from the flown plan would make the machine's own berth an obstacle.
 */
export interface VehicleBerthSensingContext {
  /** Progress along the authored plan, not along a temporary correction. */
  readonly progress: number;
  readonly finalFrom: number;
  /** Distance from the craft to the berth that authored plan ends at. */
  readonly berthDistance: number;
}

export function vehicleSafetySensingSuppressed(
  context: VehicleBerthSensingContext,
): boolean {
  return (
    context.progress >= context.finalFrom ||
    ((context.progress < 0.06 || context.progress > 0.94) &&
      context.berthDistance < BERTH_SENSING_RADIUS)
  );
}

/**
 * Sensor fusion only. It reports what is physically becoming unsafe and never
 * writes thrust, lift, route progress or pose.
 */
export function vehicleSafetyAdvisory(
  samples: readonly VehicleObstacleSample[],
  availableDeceleration: number,
  climbClearance: number,
  descentClearance: number,
): VehicleSafetyAdvisory | null {
  const deceleration = Math.max(0.25, availableDeceleration);
  const candidates = samples
    .filter(
      (sample) =>
        Number.isFinite(sample.distance) &&
        sample.distance >= 0 &&
        Number.isFinite(sample.relativeClosingSpeed) &&
        sample.relativeClosingSpeed > 0.2,
    )
    .map((sample) => {
      const timeToImpact = sample.distance / sample.relativeClosingSpeed;
      const stoppingDistance =
        (sample.relativeClosingSpeed * sample.relativeClosingSpeed) /
        (2 * deceleration);
      return { ...sample, timeToImpact, stoppingDistance };
    })
    .sort((left, right) => left.timeToImpact - right.timeToImpact);
  const threat = candidates[0];
  if (!threat) {
    return null;
  }

  const intervention =
    threat.timeToImpact <= 2.5 ||
    threat.distance <= threat.stoppingDistance + COLLISION_MARGIN;
  const caution =
    intervention ||
    threat.timeToImpact <= 5 ||
    threat.distance <= threat.stoppingDistance * 1.4 + COLLISION_MARGIN * 2;
  if (!caution) {
    return null;
  }

  const maximumSpeed = Math.sqrt(
    2 * deceleration * Math.max(0, threat.distance - COLLISION_MARGIN),
  ) * 0.8;
  const altitudeOffset = intervention
    ? climbClearance >= 6
      ? 6
      : descentClearance >= 5
        ? -4
        : 0
    : 0;
  return {
    risk: intervention ? "intervention" : "caution",
    distance: threat.distance,
    relativeClosingSpeed: threat.relativeClosingSpeed,
    timeToImpact: threat.timeToImpact,
    stoppingDistance: threat.stoppingDistance,
    maximumSpeed,
    altitudeOffset,
  };
}

/** Manual modes can consume the same advisory without creating new physics. */
export function safetyInterventionForMode(
  mode: VehicleSafetyMode,
  advisory: VehicleSafetyAdvisory | null,
): VehicleSafetyAdvisory | null {
  return mode === "assisted" && advisory?.risk === "intervention"
    ? advisory
    : null;
}
