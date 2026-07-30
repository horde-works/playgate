import type { VehicleFailureEnvelope } from "./vehicleFailure.ts";
import type { ApproachGate, ShipLimits } from "./vehicleFrames.ts";

const GRAVITY = 9.81;

/**
 * How close a guidance limit may come to the failure limit of the same
 * physical quantity. Guidance must always act before the watchdog gives up;
 * clamping every derived corridor here makes that ordering a property of the
 * construction instead of a coincidence between two hand-authored tables.
 */
export const GUIDANCE_HEADROOM = 0.95;

/** Deviation the navigation computer still owns without changing mode. */
export interface VehicleGuidanceCorridor {
  readonly crossTrack: number;
  readonly predictedCrossTrack: number;
  readonly altitude: number;
  readonly predictedAltitude: number;
  readonly heading: number;
  readonly velocityHeading: number;
  readonly tilt: number;
  readonly tiltRate: number;
}

/** Rigid-body state at which a hold begins, and at which it may end. */
export interface VehicleGuidanceAttitudeGate {
  readonly tilt: number;
  readonly tiltRate: number;
  readonly verticalSpeed: number;
  readonly yawRate: number;
}

/** Physical proof that the craft is back on the authored line. */
export interface VehicleGuidanceMergeGate {
  readonly position: number;
  readonly height: number;
  readonly heading: number;
  readonly velocityHeading: number;
  readonly tilt: number;
  readonly tiltRate: number;
}

export interface VehicleGuidanceEnvelope {
  readonly cruise: VehicleGuidanceCorridor;
  readonly disturbed: VehicleGuidanceCorridor;
  readonly stabilizationEntry: VehicleGuidanceAttitudeGate;
  readonly stabilizationExit: VehicleGuidanceAttitudeGate;
  readonly merge: VehicleGuidanceMergeGate;
}

/**
 * The three physical knobs a machine passport may need. Everything else is
 * derived, so a new carrier inherits a correct corridor from its own failure
 * envelope, approach gate and trim authority without authoring a table.
 */
export interface VehicleGuidanceOverrides {
  /** Scales every corridor limit; a nimble hull may hold a tighter line. */
  readonly corridorScale?: number;
  /** Scales the merge gate derived from this machine's approach gate. */
  readonly mergeScale?: number;
  /** Vertical speed the trim can arrest; defaults to g × liftTrimRange. */
  readonly arrestableVerticalSpeed?: number;
}

interface CorridorFractions {
  readonly crossTrack: number;
  readonly predictedCrossTrack: number;
  readonly altitude: number;
  readonly predictedAltitude: number;
  readonly heading: number;
  readonly velocityHeading: number;
  readonly tilt: number;
  readonly tiltRate: number;
}

/**
 * Undisturbed flight. Route following aims ahead and large hulls are inertial,
 * so a wide corridor is normal; it still has to close well before the failure
 * envelope so that a correction is always attempted first.
 */
const CRUISE_FRACTIONS: CorridorFractions = {
  crossTrack: 0.72,
  predictedCrossTrack: 0.93,
  altitude: 0.83,
  predictedAltitude: 0.95,
  heading: 0.55,
  velocityHeading: 0.61,
  tilt: 0.55,
  tiltRate: 0.55,
};

/**
 * After a measured external impulse the same machine is held to a much
 * narrower corridor: the disturbance is known, so tracking error is evidence
 * of an upset rather than of ordinary guidance lag.
 */
const DISTURBED_FRACTIONS: CorridorFractions = {
  crossTrack: 0.115,
  predictedCrossTrack: 0.16,
  altitude: 0.23,
  predictedAltitude: 0.33,
  heading: 0.105,
  velocityHeading: 0.175,
  tilt: 0.16,
  tiltRate: 0.13,
};

/** Attitude at which no durable intercept can be planned yet. */
const STABILIZATION_ENTRY = {
  tilt: 0.22,
  tiltRate: 0.17,
  verticalSpeed: 0.98,
  yawRate: 0.36,
} as const;

/** Hysteresis out of the hold, as a share of the entry gate. */
const STABILIZATION_EXIT = {
  tilt: 0.75,
  tiltRate: 0.59,
  verticalSpeed: 0.61,
  yawRate: 0.66,
} as const;

/**
 * A merge is half an approach: the same authored gate that decides whether a
 * berth may be entered, tightened because the craft is rejoining a line it is
 * expected to keep flying rather than a place where it stops.
 */
const MERGE_FRACTIONS = {
  position: 0.45,
  heightOfPosition: 0.55,
  heading: 0.47,
  velocityHeading: 0.8,
  tiltOfDisturbed: 1.3,
  tiltRateOfDisturbed: 1.15,
} as const;

function capped(value: number, failureLimit: number): number {
  return Math.min(value, failureLimit * GUIDANCE_HEADROOM);
}

function corridor(
  fractions: CorridorFractions,
  failure: VehicleFailureEnvelope,
  scale: number,
): VehicleGuidanceCorridor {
  const tiltCeiling = Math.min(failure.maximumPitch, failure.maximumRoll);
  return {
    crossTrack: capped(
      failure.maximumCrossTrackError * fractions.crossTrack * scale,
      failure.maximumCrossTrackError,
    ),
    predictedCrossTrack: capped(
      failure.maximumCrossTrackError * fractions.predictedCrossTrack * scale,
      failure.maximumCrossTrackError,
    ),
    altitude: capped(
      failure.maximumAltitudeError * fractions.altitude * scale,
      failure.maximumAltitudeError,
    ),
    predictedAltitude: capped(
      failure.maximumAltitudeError * fractions.predictedAltitude * scale,
      failure.maximumAltitudeError,
    ),
    heading: capped(
      failure.maximumHeadingError * fractions.heading * scale,
      failure.maximumHeadingError,
    ),
    velocityHeading: capped(
      failure.maximumHeadingError * fractions.velocityHeading * scale,
      failure.maximumHeadingError,
    ),
    tilt: capped(tiltCeiling * fractions.tilt * scale, tiltCeiling),
    tiltRate: capped(
      failure.maximumYawRate * fractions.tiltRate * scale,
      failure.maximumYawRate,
    ),
  };
}

/**
 * One deviation model for a machine. The failure envelope is the source of
 * truth for "how wrong may this craft be"; guidance only decides how much
 * earlier it must start fixing that error itself.
 */
export function vehicleGuidanceEnvelope(
  failure: VehicleFailureEnvelope,
  approach: ApproachGate,
  limits: Pick<ShipLimits, "liftTrimRange">,
  overrides: VehicleGuidanceOverrides = {},
): VehicleGuidanceEnvelope {
  const corridorScale = Math.max(0.05, overrides.corridorScale ?? 1);
  const mergeScale = Math.max(0.05, overrides.mergeScale ?? 1);
  const cruise = corridor(CRUISE_FRACTIONS, failure, corridorScale);
  const disturbed = corridor(DISTURBED_FRACTIONS, failure, corridorScale);
  const tiltCeiling = Math.min(failure.maximumPitch, failure.maximumRoll);
  const arrestableVerticalSpeed = Math.max(
    0.2,
    overrides.arrestableVerticalSpeed ?? GRAVITY * limits.liftTrimRange,
  );
  const stabilizationEntry: VehicleGuidanceAttitudeGate = {
    tilt: capped(tiltCeiling * STABILIZATION_ENTRY.tilt, tiltCeiling),
    tiltRate: capped(
      failure.maximumYawRate * STABILIZATION_ENTRY.tiltRate,
      failure.maximumYawRate,
    ),
    verticalSpeed: arrestableVerticalSpeed * STABILIZATION_ENTRY.verticalSpeed,
    yawRate: capped(
      failure.maximumYawRate * STABILIZATION_ENTRY.yawRate,
      failure.maximumYawRate,
    ),
  };
  const mergePosition = approach.tolerance.position *
    MERGE_FRACTIONS.position * mergeScale;
  return {
    cruise,
    disturbed,
    stabilizationEntry,
    stabilizationExit: {
      tilt: stabilizationEntry.tilt * STABILIZATION_EXIT.tilt,
      tiltRate: stabilizationEntry.tiltRate * STABILIZATION_EXIT.tiltRate,
      verticalSpeed:
        stabilizationEntry.verticalSpeed * STABILIZATION_EXIT.verticalSpeed,
      yawRate: stabilizationEntry.yawRate * STABILIZATION_EXIT.yawRate,
    },
    merge: {
      position: mergePosition,
      height: mergePosition * MERGE_FRACTIONS.heightOfPosition,
      heading: approach.tolerance.heading * MERGE_FRACTIONS.heading * mergeScale,
      velocityHeading:
        approach.tolerance.heading * MERGE_FRACTIONS.velocityHeading *
        mergeScale,
      tilt: disturbed.tilt * MERGE_FRACTIONS.tiltOfDisturbed,
      tiltRate: disturbed.tiltRate * MERGE_FRACTIONS.tiltRateOfDisturbed,
    },
  };
}

/** The corridor in force right now; a known impulse narrows it. */
export function vehicleGuidanceCorridor(
  envelope: VehicleGuidanceEnvelope,
  disturbed: boolean,
): VehicleGuidanceCorridor {
  return disturbed ? envelope.disturbed : envelope.cruise;
}
