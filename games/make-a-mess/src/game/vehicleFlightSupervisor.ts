import type { PropulsionHealth } from "./vehiclePropulsionAutomation.ts";
import type { RotorLiftState } from "./vehicleLiftGeometry.ts";
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

/**
 * Operational policy above the route autopilot and physical actuators.
 *
 * У ПЛАВУЧЕЙ машины допуск считается по самому слабому каналу, и это правда:
 * моторов два, потеря одного действительно калечит корабль, а держит его всё
 * равно газ.
 *
 * У ВИНТОКРЫЛОЙ то же правило ложно. Шесть колец, одно выбито — самый слабый
 * канал равен нулю, и старое правило объявляло рейс несостоявшимся, хотя
 * машина летит на пяти совершенно спокойно. Для неё допуск решает не счёт
 * каналов, а способность уцелевшего набора держать машину: она приходит
 * готовым вердиктом из геометрии подъёма.
 */
export function propulsionFlightClearance(
  health: PropulsionHealth,
  liftState: RotorLiftState | null = null,
): PropulsionFlightClearance {
  const weakest = health.fractions.length > 0
    ? Math.min(...health.fractions)
    : 1;
  if (liftState) {
    const available = health.fractions.length > 0
      ? health.fractions.reduce((sum, fraction) => sum + fraction, 0) /
        health.fractions.length
      : 1;
    return {
      // Ослабленный набор летит медленнее ровно во столько раз, во сколько
      // меньше стало тяги, а не «по самому слабому кольцу».
      speedFactor: available,
      controlAuthorityFactor: available,
      uncrewedAllowed: liftState === "flying",
      passengerAllowed: liftState === "flying" && health.mode === "nominal",
    };
  }
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
    correctionGraceSeconds: base.correctionGraceSeconds / factor,
    minimumProgressPerSecond: base.minimumProgressPerSecond * factor,
  };
}
