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

/**
 * Where the machine has to be by the end of the stage it is flying.
 *
 * A carrier does not care who pushed it or how hard. It cares whether the
 * push leaves it able to meet the next requirement, and that requirement is a
 * property of the stage: leaving a berth tolerates tens of metres, arriving at
 * one tolerates almost nothing. The corridor is therefore indexed by route
 * phase, never by the impact that happened to cause the error.
 */
export type VehicleGuidancePhase = "departure" | "cruise" | "approach";

export interface VehicleGuidanceCorridor {
  /** Lateral accuracy required by the end of this stage, in metres. */
  readonly crossTrack: number;
  /** Vertical accuracy required by the end of this stage, in metres. */
  readonly altitude: number;
}

/**
 * A rigid-body upset large enough to be its own event: the hull is changing
 * attitude fast, ordinary control is not what answers it, and speed must come
 * off while the ballast settles. Ordinary swinging never reaches this.
 */
export interface VehicleGuidanceUpsetGate {
  /** Pitch/roll angular speed that marks a genuine upset, rad/s. */
  readonly tiltRate: number;
  /** Yaw rate that marks a genuine upset, rad/s. */
  readonly yawRate: number;
}

/** Physical proof that the craft is back on the authored line. */
export interface VehicleGuidanceMergeGate {
  readonly position: number;
  readonly height: number;
  readonly heading: number;
  readonly velocityHeading: number;
}

export interface VehicleGuidanceEnvelope {
  readonly departure: VehicleGuidanceCorridor;
  readonly cruise: VehicleGuidanceCorridor;
  readonly approach: VehicleGuidanceCorridor;
  /** Entry into a hold; deliberately far above ordinary pendulum motion. */
  readonly upsetEntry: VehicleGuidanceUpsetGate;
  /** The upset has passed. Attitude itself is not asked about again. */
  readonly upsetExit: VehicleGuidanceUpsetGate;
  readonly merge: VehicleGuidanceMergeGate;
  /**
   * Inclination the machine is still worth flying with. Attitude is no longer
   * a reason to leave the route, but a hull that hangs past this after its
   * trim has run out of travel is no longer executing the flight task.
   */
  readonly flyableTilt: number;
  /**
   * Share of the physically reachable closure that guidance is allowed to
   * count on. The craft must also arrive aligned, not merely at the point.
   */
  readonly closureMargin: number;
}

/**
 * The physical knobs a machine passport may need. Everything else is derived,
 * so a new carrier inherits a correct corridor from its own failure envelope,
 * approach gate and trim authority without authoring a table.
 */
export interface VehicleGuidanceOverrides {
  /** Scales every corridor limit; a nimble hull may hold a tighter line. */
  readonly corridorScale?: number;
  /** Scales the merge gate derived from this machine's approach gate. */
  readonly mergeScale?: number;
  /** Vertical speed the trim can arrest; defaults to g × liftTrimRange. */
  readonly arrestableVerticalSpeed?: number;
  /** Pitch/roll rate beyond this machine's own manoeuvre envelope, rad/s. */
  readonly upsetTiltRate?: number;
  /** Yaw rate beyond this machine's own manoeuvre envelope, rad/s. */
  readonly upsetYawRate?: number;
}

/**
 * Cruise accuracy as a share of the failure envelope. Route following aims
 * ahead and large hulls are inertial, so this is wide on purpose: it still
 * has to close well before the watchdog gives up on the same quantity.
 */
const CRUISE_FRACTIONS = { crossTrack: 0.72, altitude: 0.83 } as const;
/** Leaving a berth is the loosest stage: the craft is still gathering way. */
const DEPARTURE_SCALE = 1.25;

/**
 * Arriving is judged by the machine's own approach gate rather than by the
 * failure envelope: the gate is what the berth physically demands.
 */
const APPROACH_FRACTIONS = {
  crossTrack: 0.55,
  altitudeOfCrossTrack: 0.45,
} as const;

/**
 * An upset is a rate event. These are far above the pendulum motion an
 * airship shows all the time, so an ordinary swinging gondola never enters a
 * hold — the trim cars and the ordinary controls simply keep working.
 */
// An upset is a rotation event. Climbing fast is a route requirement, not an
// upset, and a vertical shove is answered by the lift and trim loops that run
// all the time — so vertical speed is deliberately not part of this gate.
const UPSET_ENTRY = { tiltRate: 0.55, yawRate: 0.62 } as const;
/** Hysteresis out of the hold, as a share of the entry gate. */
const UPSET_EXIT = { tiltRate: 0.3, yawRate: 0.32 } as const;

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
} as const;

function capped(value: number, failureLimit: number): number {
  return Math.min(value, failureLimit * GUIDANCE_HEADROOM);
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
  const upsetEntry: VehicleGuidanceUpsetGate = {
    tiltRate: Math.max(0.05, overrides.upsetTiltRate ?? UPSET_ENTRY.tiltRate),
    yawRate: Math.max(0.05, overrides.upsetYawRate ?? UPSET_ENTRY.yawRate),
  };
  const cruise: VehicleGuidanceCorridor = {
    crossTrack: capped(
      failure.maximumCrossTrackError * CRUISE_FRACTIONS.crossTrack *
        corridorScale,
      failure.maximumCrossTrackError,
    ),
    altitude: capped(
      failure.maximumAltitudeError * CRUISE_FRACTIONS.altitude * corridorScale,
      failure.maximumAltitudeError,
    ),
  };
  const approachCrossTrack =
    approach.tolerance.position * APPROACH_FRACTIONS.crossTrack * corridorScale;
  const mergePosition =
    approach.tolerance.position * MERGE_FRACTIONS.position * mergeScale;
  return {
    departure: {
      crossTrack: capped(
        cruise.crossTrack * DEPARTURE_SCALE,
        failure.maximumCrossTrackError,
      ),
      altitude: capped(
        cruise.altitude * DEPARTURE_SCALE,
        failure.maximumAltitudeError,
      ),
    },
    cruise,
    approach: {
      crossTrack: approachCrossTrack,
      altitude: approachCrossTrack * APPROACH_FRACTIONS.altitudeOfCrossTrack,
    },
    upsetEntry,
    upsetExit: {
      tiltRate: upsetEntry.tiltRate * UPSET_EXIT.tiltRate,
      yawRate: upsetEntry.yawRate * UPSET_EXIT.yawRate,
    },
    flyableTilt: capped(
      Math.min(failure.maximumPitch, failure.maximumRoll) * 0.55,
      Math.min(failure.maximumPitch, failure.maximumRoll),
    ),
    merge: {
      position: mergePosition,
      height: mergePosition * MERGE_FRACTIONS.heightOfPosition,
      heading: approach.tolerance.heading * MERGE_FRACTIONS.heading * mergeScale,
      velocityHeading:
        approach.tolerance.heading * MERGE_FRACTIONS.velocityHeading *
        mergeScale,
    },
    closureMargin: 0.55,
  };
}

/** Accuracy the stage in progress demands. */
export function vehicleGuidanceCorridor(
  envelope: VehicleGuidanceEnvelope,
  phase: VehicleGuidancePhase,
): VehicleGuidanceCorridor {
  return phase === "approach"
    ? envelope.approach
    : phase === "departure"
      ? envelope.departure
      : envelope.cruise;
}
