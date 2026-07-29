import type { PropulsionHealth } from "./vehiclePropulsionAutomation.ts";
import {
  DEFAULT_VEHICLE_FAILURE_ENVELOPE,
  type VehicleFailureEnvelope,
} from "./vehicleFailure.ts";

export interface PropulsionFlightClearance {
  readonly speedFactor: number;
  readonly controlAuthorityFactor: number;
  readonly uncrewedAllowed: boolean;
  readonly passengerAllowed: boolean;
}

/** Operational policy above the route autopilot and physical actuators. */
export function propulsionFlightClearance(
  health: PropulsionHealth,
): PropulsionFlightClearance {
  const weakest = health.fractions.length > 0
    ? Math.min(...health.fractions)
    : 1;
  return {
    // Every current propeller has two equal blades. One retained blade is a
    // controllable half-power engine; no retained blade is no engine.
    speedFactor: health.mode === "nominal" ? 1 : weakest,
    controlAuthorityFactor: health.mode === "nominal" ? 1 : weakest,
    uncrewedAllowed: weakest >= 0.5,
    passengerAllowed: health.mode === "nominal",
  };
}

/** A reduced-authority craft gets more time, never a larger safe envelope. */
export function supervisedFailureEnvelope(
  clearance: PropulsionFlightClearance,
  base: VehicleFailureEnvelope = DEFAULT_VEHICLE_FAILURE_ENVELOPE,
): VehicleFailureEnvelope {
  const factor = Math.max(0.25, clearance.controlAuthorityFactor);
  if (factor >= 1 - 1e-6) {
    return base;
  }
  return {
    ...base,
    attitudeGraceSeconds: base.attitudeGraceSeconds / factor,
    routeGraceSeconds: base.routeGraceSeconds / factor,
    stallGraceSeconds: base.stallGraceSeconds / factor,
    maneuverTimeoutSeconds: base.maneuverTimeoutSeconds / factor,
    finalManeuverTimeoutSeconds:
      base.finalManeuverTimeoutSeconds / factor,
    dockingTimeoutSeconds: base.dockingTimeoutSeconds / factor,
    minimumProgressPerSecond: base.minimumProgressPerSecond * factor,
  };
}
