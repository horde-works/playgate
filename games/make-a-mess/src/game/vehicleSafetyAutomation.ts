export type VehicleSafetyRisk = "clear" | "caution" | "intervention";
export type VehicleSafetyMode = "off" | "advisory" | "assisted";

export interface VehicleObstacleSample {
  readonly distance: number;
  /** Positive when the two sampled surface points are approaching. */
  readonly relativeClosingSpeed: number;
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
