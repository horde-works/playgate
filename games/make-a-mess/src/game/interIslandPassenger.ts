import { ISLAND_CHART, type IslandId } from "./islandTopology.ts";

export interface CarrierVector {
  readonly forward: number;
  readonly right: number;
  readonly up: number;
}

export interface InterIslandPassengerTransit {
  readonly version: 1;
  readonly origin: IslandId;
  readonly destination: IslandId;
  /** Eye offset from the authored passenger point, in the carrier frame. */
  readonly eyeOffset: CarrierVector;
  /** Velocity relative to the moving carrier, in the carrier frame. */
  readonly relativeVelocity: CarrierVector;
  /** View direction in the carrier frame. */
  readonly lookDirection: CarrierVector;
}

/** Physical passenger state captured at the last source-scene simulation step. */
export interface InterIslandPassengerHandoff {
  readonly eyeOffset: CarrierVector;
  readonly relativeVelocity: CarrierVector;
  readonly lookDirection: CarrierVector;
}

export interface InterIslandPassengerAccess {
  readonly inertialFrame: "carrier" | "world";
  readonly ignoreWorldBoundary: boolean;
  readonly weaponEnabled: boolean;
}

export const INTER_ISLAND_PASSENGER_STORAGE_KEY =
  "make-a-mess:inter-island-passenger";

function horizontalBasis(
  nose: readonly [number, number, number],
): {
  readonly forward: readonly [number, 0, number];
  readonly right: readonly [number, 0, number];
} {
  const length = Math.hypot(nose[0], nose[2]) || 1;
  const forward = [nose[0] / length, 0, nose[2] / length] as const;
  return {
    forward,
    right: [forward[2], 0, -forward[0]],
  };
}

export function carrierVector(
  vector: readonly [number, number, number],
  nose: readonly [number, number, number],
): CarrierVector {
  const basis = horizontalBasis(nose);
  return {
    forward: vector[0] * basis.forward[0] + vector[2] * basis.forward[2],
    right: vector[0] * basis.right[0] + vector[2] * basis.right[2],
    up: vector[1],
  };
}

export function vectorFromCarrier(
  vector: CarrierVector,
  nose: readonly [number, number, number],
): readonly [number, number, number] {
  const basis = horizontalBasis(nose);
  return [
    basis.forward[0] * vector.forward + basis.right[0] * vector.right,
    vector.up,
    basis.forward[2] * vector.forward + basis.right[2] * vector.right,
  ];
}

export function interIslandPassengerAccess(
  flightActive: boolean,
  passengerInsideCarrier: boolean,
): InterIslandPassengerAccess {
  return {
    inertialFrame: flightActive ? "carrier" : "world",
    ignoreWorldBoundary: flightActive && passengerInsideCarrier,
    weaponEnabled: !flightActive,
  };
}

export function interIslandWeaponSelectionBlocked(
  flightActive: boolean,
  requestedWeapon: string,
): boolean {
  return flightActive && requestedWeapon !== "none";
}

function finiteCarrierVector(value: unknown): value is CarrierVector {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<CarrierVector>;
  return Number.isFinite(candidate.forward) &&
    Number.isFinite(candidate.right) &&
    Number.isFinite(candidate.up);
}

export function parseInterIslandPassengerTransit(
  value: string | null,
): InterIslandPassengerTransit | null {
  if (!value) {
    return null;
  }
  try {
    const candidate = JSON.parse(value) as Partial<InterIslandPassengerTransit>;
    if (
      candidate.version !== 1 ||
      !candidate.origin ||
      !candidate.destination ||
      !Object.hasOwn(ISLAND_CHART, candidate.origin) ||
      !Object.hasOwn(ISLAND_CHART, candidate.destination) ||
      candidate.origin === candidate.destination ||
      !finiteCarrierVector(candidate.eyeOffset) ||
      !finiteCarrierVector(candidate.relativeVelocity) ||
      !finiteCarrierVector(candidate.lookDirection)
    ) {
      return null;
    }
    return candidate as InterIslandPassengerTransit;
  } catch {
    return null;
  }
}
