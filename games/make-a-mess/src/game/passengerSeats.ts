import type { SceneVector3 } from "./destructionScene.ts";
import type { EntryInteractionCue } from "./entryInteraction.ts";
import {
  rotateVector,
  vehiclePiecePosition,
  vehicleRotation,
  type VehiclePose,
} from "./vehicleFrames.ts";
import { supportVelocityAtPoint } from "./movingSupportDynamics.ts";
import {
  HEX_ARM_RADIUS,
  HEX_FOOT_BOTTOM_Y,
  HEX_LIP_OUTER_RADIUS,
  HEX_SEAT_Y,
  TOWN_HEXACOPTER_CLUSTER_ID,
  hexacopterPoint,
} from "./townHexacopter.ts";
import {
  NIMBUS_HEXACOPTER_CLUSTER_ID,
  nimbusHexacopterPointFromTown,
  nimbusHexacopterVectorFromTown,
} from "./nimbusHexacopter.ts";
import {
  DS_CLUSTER_ID,
  DS_DOOR_POST,
  DS_DRIVER_HEAD,
  DS_DRIVER_STEP_OUT,
  DS_NOSE,
  dsPoint,
} from "./townCitroenDs.ts";
import { PLAYER_CAPSULE_FOOT_OFFSET, PLAYER_CAPSULE_RADIUS } from "./playerMovement.ts";

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
  /** Presentation-only cue for the stand hint; mechanics stay seat-neutral. */
  readonly hintCue?: EntryInteractionCue;
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
export const NIMBUS_HEXACOPTER_PILOT_SEAT_ID =
  "nimbus:hexacopter:pilot-seat";

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

/**
 * Пилот встаёт РЯДОМ с машиной, а не в кабине: фонарь закрыт, изнутри делать
 * нечего. Выход идёт через дверной просвет 300° левого борта (ровно под ним
 * стоит нога — см. townHexacopter) и заканчивается за габаритом колец, чтобы
 * капсула не родилась в губе кольца. Высота — подошвы на земле под машиной.
 */
const HEX_EXIT_ANGLE = (300 * Math.PI) / 180;
const HEX_EXIT_RADIUS =
  HEX_ARM_RADIUS + HEX_LIP_OUTER_RADIUS + PLAYER_CAPSULE_RADIUS + 0.2;

export const TOWN_HEXACOPTER_PILOT_SEAT: PassengerSeatDefinition = {
  id: TOWN_HEXACOPTER_PILOT_SEAT_ID,
  carrierClusterId: TOWN_HEXACOPTER_CLUSTER_ID,
  interactionPoint: hexacopterPoint(-0.15, 0, HEX_SEAT_Y + 0.42),
  // Collision is muted while seated. The camera rides 0.54 m above this
  // point, at eye height behind the instrument screen and below the canopy.
  occupantPoint: hexacopterPoint(-0.18, 0, HEX_SEAT_Y + 0.16),
  exitPoint: hexacopterPoint(
    HEX_EXIT_RADIUS * Math.cos(HEX_EXIT_ANGLE),
    HEX_EXIT_RADIUS * Math.sin(HEX_EXIT_ANGLE),
    HEX_FOOT_BOTTOM_Y + PLAYER_CAPSULE_FOOT_OFFSET + 0.04,
  ),
  hintCue: "town-hexacopter-pilot-seat",
  facing: [-1, 0, 0],
  requiredPieceIds: [
    "town-vertipad:hexacopter:seat:pedestal:piece",
    "town-vertipad:hexacopter:seat:cushion:piece",
    "town-vertipad:hexacopter:seat:back:piece",
  ],
  approachRadius: 1.2,
  releaseRadius: 1.6,
};

export const NIMBUS_HEXACOPTER_PILOT_SEAT: PassengerSeatDefinition = {
  ...TOWN_HEXACOPTER_PILOT_SEAT,
  id: NIMBUS_HEXACOPTER_PILOT_SEAT_ID,
  carrierClusterId: NIMBUS_HEXACOPTER_CLUSTER_ID,
  interactionPoint: nimbusHexacopterPointFromTown(
    TOWN_HEXACOPTER_PILOT_SEAT.interactionPoint,
  ),
  occupantPoint: nimbusHexacopterPointFromTown(
    TOWN_HEXACOPTER_PILOT_SEAT.occupantPoint,
  ),
  exitPoint: nimbusHexacopterPointFromTown(
    TOWN_HEXACOPTER_PILOT_SEAT.exitPoint,
  ),
  facing: nimbusHexacopterVectorFromTown(TOWN_HEXACOPTER_PILOT_SEAT.facing),
  requiredPieceIds: [
    `${NIMBUS_HEXACOPTER_CLUSTER_ID}:seat:pedestal:piece`,
    `${NIMBUS_HEXACOPTER_CLUSTER_ID}:seat:cushion:piece`,
    `${NIMBUS_HEXACOPTER_CLUSTER_ID}:seat:back:piece`,
  ],
};

/**
 * МЕСТО ВОДИТЕЛЯ. У машины оно слева — она французская, и руль у неё слева.
 *
 * Отличие от кресла пилота коптера одно и принципиальное: в коптер СНАЧАЛА
 * залезают, и действие живёт внутри кабины. К машине подходят снаружи, к
 * водительской двери, и предложение обязано появляться там же — иначе игрок
 * ходит вокруг корпуса и не понимает, что делать. Поэтому точка предложения
 * стоит СНАРУЖИ, у двери, а не на подушке сиденья.
 */
export const TOWN_DS_DRIVER_SEAT_ID = "town:ds:driver-seat";

export const TOWN_DS_DRIVER_SEAT: PassengerSeatDefinition = {
  id: TOWN_DS_DRIVER_SEAT_ID,
  carrierClusterId: DS_CLUSTER_ID,
  interactionPoint: dsPoint(...DS_DOOR_POST),
  occupantPoint: dsPoint(...DS_DRIVER_HEAD),
  exitPoint: dsPoint(
    DS_DRIVER_STEP_OUT[0],
    DS_DRIVER_STEP_OUT[1] + PLAYER_CAPSULE_FOOT_OFFSET,
    DS_DRIVER_STEP_OUT[2],
  ),
  hintCue: "town-ds-driver-seat",
  facing: DS_NOSE,
  requiredPieceIds: [
    // Спереди у машины ДВА РАЗДЕЛЬНЫХ кресла, а не диван: место водителя
    // держится на левом. Диван во всю ширину был ошибкой прежней сборки.
    "town-boulevard:ds:seat:front:left:cushion:piece",
    "town-boulevard:ds:seat:front:left:back:piece",
    // Руль собран из обода, спицы и ступицы — цельного куска «steering:wheel»
    // больше нет. Место водителя держится на СТУПИЦЕ: обод можно смять, а
    // рулить она не перестанет.
    "town-boulevard:ds:steering:boss:piece",
  ],
  // Радиус подхода щедрый намеренно: у машины длинный борт, и человек
  // подходит к ней откуда угодно, а не по створу, как к посту площадки.
  approachRadius: 1.8,
  releaseRadius: 2.4,
};

export const passengerSeats: readonly PassengerSeatDefinition[] = [
  SKY_TRAIN_DRIVER_SEAT,
  TOWN_HEXACOPTER_PILOT_SEAT,
  NIMBUS_HEXACOPTER_PILOT_SEAT,
  TOWN_DS_DRIVER_SEAT,
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
