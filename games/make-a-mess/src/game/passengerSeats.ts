import type { SceneVector3 } from "./destructionScene.ts";
import {
  rotateVector,
  vehiclePiecePosition,
  vehicleRotation,
  type VehiclePose,
} from "./vehicleFrames.ts";
import { supportVelocityAtPoint } from "./movingSupportDynamics.ts";
import {
  HEX_SEAT_Y,
  TOWN_HEXACOPTER_CLUSTER_ID,
  hexacopterPoint,
} from "./townHexacopter.ts";

/**
 * A reusable place occupied inside a moving compound object.
 *
 * Every point is authored in the carrier's resting/world coordinates, just
 * like its breakable pieces. The runtime only supplies the carrier pose; no
 * seat needs a bespoke animation or knowledge of a particular vehicle.
 */
export interface PassengerSeatDefinition {
  readonly id: string;
  readonly carrierClusterId: string;
  /** Point from which the contextual "sit" action is offered. */
  readonly interactionPoint: SceneVector3;
  /** Centre of the player's capsule while the place is occupied. */
  readonly occupantPoint: SceneVector3;
  /** Safe capsule centre used when the passenger stands up. */
  readonly exitPoint: SceneVector3;
  /** Direction the passenger faces on taking the seat. */
  readonly facing: SceneVector3;
  /** Losing any of these physical members makes the place unusable. */
  readonly requiredPieceIds: readonly string[];
  readonly approachRadius: number;
  readonly releaseRadius: number;
}

export interface PassengerSeatCarrierPose {
  readonly clusterId: string;
  readonly origin: SceneVector3;
  readonly nose: SceneVector3;
  readonly pose: VehiclePose;
  readonly linearVelocity: SceneVector3;
  readonly angularVelocity: SceneVector3;
  readonly centreOfMass: SceneVector3;
}

export const SKY_TRAIN_DRIVER_SEAT_ID = "terminal:sky-train:driver-seat";
export const TOWN_HEXACOPTER_PILOT_SEAT_ID =
  "town:hexacopter:pilot-seat";

export const SKY_TRAIN_DRIVER_SEAT: PassengerSeatDefinition = {
  id: SKY_TRAIN_DRIVER_SEAT_ID,
  carrierClusterId: "terminal:sky-train",
  interactionPoint: [-6.2, 2.2, 77.6],
  // The physical capsule is collision-muted while occupied. Its centre is
  // kept above the cushion, placing the eyes in the middle of the bay.
  occupantPoint: [-7.08, 2.36, 77.6],
  // The chair faces the nose (-X); therefore "behind" it is toward +X,
  // inside the open head coach and clear of both backrest and console.
  exitPoint: [-6.08, 2.35, 77.6],
  facing: [-1, 0, 0],
  requiredPieceIds: [
    "terminal:sky-train:cab:driver-seat:pedestal",
    "terminal:sky-train:cab:driver-seat:cushion",
    "terminal:sky-train:cab:driver-seat:back",
  ],
  approachRadius: 2.4,
  releaseRadius: 3.4,
};

export const TOWN_HEXACOPTER_PILOT_SEAT: PassengerSeatDefinition = {
  id: TOWN_HEXACOPTER_PILOT_SEAT_ID,
  carrierClusterId: TOWN_HEXACOPTER_CLUSTER_ID,
  interactionPoint: hexacopterPoint(-0.15, 0, HEX_SEAT_Y + 0.42),
  // Collision is muted while seated. The camera rides 0.54 m above this
  // point, at eye height behind the instrument screen and below the canopy.
  occupantPoint: hexacopterPoint(-0.18, 0, HEX_SEAT_Y + 0.16),
  exitPoint: hexacopterPoint(-0.2, -0.38, 1.98),
  facing: [-1, 0, 0],
  requiredPieceIds: [
    "town-vertipad:hexacopter:seat:pedestal:piece",
    "town-vertipad:hexacopter:seat:cushion:piece",
    "town-vertipad:hexacopter:seat:back:piece",
  ],
  approachRadius: 1.2,
  releaseRadius: 1.6,
};

export const passengerSeats: readonly PassengerSeatDefinition[] = [
  SKY_TRAIN_DRIVER_SEAT,
  TOWN_HEXACOPTER_PILOT_SEAT,
];

const seatsById = new Map(passengerSeats.map((seat) => [seat.id, seat] as const));

export function passengerSeatForId(id: string | null | undefined): PassengerSeatDefinition | null {
  return id ? seatsById.get(id) ?? null : null;
}

export function passengerSeatIsIntact(
  seat: PassengerSeatDefinition,
  inactivePieceIds: ReadonlySet<string>,
): boolean {
  return seat.requiredPieceIds.every((id) => !inactivePieceIds.has(id));
}

export type PassengerSeatContextAction = "seat" | "stand";

/**
 * Generic seat policy. The caller decides what "carrier active" means — a
 * train can use motion, an airship a flight, and a stationary turret a power
 * state — while occupation itself remains identical.
 */
export function passengerSeatContextAction({
  seat,
  occupiedSeatId,
  carrierActive,
  passengerInsideCarrier,
  distance,
  keepApproach,
  intact,
}: {
  readonly seat: PassengerSeatDefinition;
  readonly occupiedSeatId: string | null;
  readonly carrierActive: boolean;
  readonly passengerInsideCarrier: boolean;
  readonly distance: number;
  readonly keepApproach: boolean;
  readonly intact: boolean;
}): PassengerSeatContextAction | null {
  if (!intact) {
    return null;
  }
  if (occupiedSeatId === seat.id) {
    return "stand";
  }
  if (!carrierActive || !passengerInsideCarrier) {
    return null;
  }
  const radius = keepApproach ? seat.releaseRadius : seat.approachRadius;
  return distance <= radius ? "seat" : null;
}

export function passengerSeatWorldPoint(
  carrier: PassengerSeatCarrierPose,
  point: SceneVector3,
): SceneVector3 {
  return vehiclePiecePosition(
    carrier.origin,
    point,
    carrier.pose,
    vehicleRotation(carrier.pose, carrier.nose),
  );
}

export function passengerSeatWorldFacing(
  seat: PassengerSeatDefinition,
  carrier: PassengerSeatCarrierPose,
): SceneVector3 {
  return rotateVector(vehicleRotation(carrier.pose, carrier.nose), seat.facing);
}

/** Three's first-person camera looks down local -Z. */
export function passengerSeatViewYaw(
  seat: PassengerSeatDefinition,
  carrier: PassengerSeatCarrierPose,
): number {
  const facing = passengerSeatWorldFacing(seat, carrier);
  return Math.atan2(-facing[0], -facing[2]);
}

/**
 * Complete inertial hand-off for occupying or leaving a moving place.
 * Linear velocity alone is insufficient: without carrier yaw the passenger's
 * view immediately starts slipping when a train or airship is turning.
 */
export function passengerSeatWorldMotion(
  carrier: PassengerSeatCarrierPose,
  worldPoint: SceneVector3,
): {
  readonly linearVelocity: { readonly x: number; readonly y: number; readonly z: number };
  readonly yawVelocity: number;
} {
  return {
    linearVelocity: supportVelocityAtPoint(
      {
        linearVelocity: {
          x: carrier.linearVelocity[0],
          y: carrier.linearVelocity[1],
          z: carrier.linearVelocity[2],
        },
        angularVelocity: {
          x: carrier.angularVelocity[0],
          y: carrier.angularVelocity[1],
          z: carrier.angularVelocity[2],
        },
        centreOfMass: {
          x: carrier.centreOfMass[0],
          y: carrier.centreOfMass[1],
          z: carrier.centreOfMass[2],
        },
      },
      { x: worldPoint[0], y: worldPoint[1], z: worldPoint[2] },
    ),
    yawVelocity: carrier.angularVelocity[1],
  };
}
