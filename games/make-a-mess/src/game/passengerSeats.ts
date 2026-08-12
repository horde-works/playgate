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
import { rangeHexacopterPointFromTown } from "./rangeHexacopter.ts";
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
  /**
   * С ЭТОГО МЕСТА ВИНТОКРЫЛОЙ МАШИНОЙ УПРАВЛЯЮТ РУКАМИ.
   *
   * Признак принадлежит МЕСТУ, а не карте и не рантайму: сидение в кабине —
   * это свойство кабины. Заведён потому, что общий покадровый контур
   * спрашивал вместо него ИМЯ одного конкретного кресла
   * (`TOWN_HEXACOPTER_PILOT_SEAT_ID`), и коптер Нимба, у которого кабина
   * такая же, а идентификатор свой, ручного управления не получал вовсе —
   * при том, что его собственный паспорт предлагает `manual` и на вылет, и
   * на поездку. Машина обещала то, чего не давала, и заметить это было
   * нечем: геометрия кресла проверена тестом, а проводка — нет.
   *
   * Узко по смыслу и намеренно: это НЕ «кресло водителя вообще». Место
   * машиниста состава и место водителя ситроена тоже управляющие, но их
   * ведут другие системы, и общий признак свёл бы их в один контур.
   */
  readonly rotorcraftControls?: boolean;
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

/**
 * Кресло АВТОРИЗОВАНО В ГОРОДСКИХ КООРДИНАТАХ машины и переезжает вместе с
 * ней — той же суммой, что её куски (rangeVertipadDocument), якоря кадра
 * (vehicleFrames) и посты (airVehicles).
 *
 * Так и появился дефект переезда на полигон: всё перечисленное перевели, а
 * кресло осталось в городе. Кластер и куски совпадают по имени, поэтому
 * рантайм признавал кресло своим и честно сажал в него пилота — по городским
 * координатам, то есть в 40.7 м от машины и в 69 м от центра полигона при
 * радиусе суши 50: человек оказывался в воздухе за кромкой мира и ехал за
 * машиной, как за игрушкой на пульте.
 */
const HEX_PILOT_SEAT_TOWN_INTERACTION = hexacopterPoint(
  -0.15,
  0,
  HEX_SEAT_Y + 0.42,
);
// Collision is muted while seated. The camera rides 0.54 m above this
// point, at eye height behind the instrument screen and below the canopy.
const HEX_PILOT_SEAT_TOWN_OCCUPANT = hexacopterPoint(
  -0.18,
  0,
  HEX_SEAT_Y + 0.16,
);
const HEX_PILOT_SEAT_TOWN_EXIT = hexacopterPoint(
  HEX_EXIT_RADIUS * Math.cos(HEX_EXIT_ANGLE),
  HEX_EXIT_RADIUS * Math.sin(HEX_EXIT_ANGLE),
  HEX_FOOT_BOTTOM_Y + PLAYER_CAPSULE_FOOT_OFFSET + 0.04,
);

export const TOWN_HEXACOPTER_PILOT_SEAT: PassengerSeatDefinition = {
  id: TOWN_HEXACOPTER_PILOT_SEAT_ID,
  carrierClusterId: TOWN_HEXACOPTER_CLUSTER_ID,
  interactionPoint: rangeHexacopterPointFromTown(
    HEX_PILOT_SEAT_TOWN_INTERACTION,
  ),
  occupantPoint: rangeHexacopterPointFromTown(HEX_PILOT_SEAT_TOWN_OCCUPANT),
  exitPoint: rangeHexacopterPointFromTown(HEX_PILOT_SEAT_TOWN_EXIT),
  hintCue: "town-hexacopter-pilot-seat",
  facing: [-1, 0, 0],
  requiredPieceIds: [
    "town-vertipad:hexacopter:seat:pedestal:piece",
    "town-vertipad:hexacopter:seat:cushion:piece",
    "town-vertipad:hexacopter:seat:back:piece",
  ],
  approachRadius: 1.2,
  releaseRadius: 1.6,
  rotorcraftControls: true,
};

export const NIMBUS_HEXACOPTER_PILOT_SEAT: PassengerSeatDefinition = {
  // Признак управления приезжает сюда РАССЫПЬЮ вместе с остальной кабиной, и
  // это правильно: кабина у Нимба та же самая, отличаются машина и место.
  ...TOWN_HEXACOPTER_PILOT_SEAT,
  id: NIMBUS_HEXACOPTER_PILOT_SEAT_ID,
  carrierClusterId: NIMBUS_HEXACOPTER_CLUSTER_ID,
  // Оба переезда считаются от ОДНОГО городского оригинала: брать точки уже
  // переехавшей машины значит складывать два переноса.
  interactionPoint: nimbusHexacopterPointFromTown(
    HEX_PILOT_SEAT_TOWN_INTERACTION,
  ),
  occupantPoint: nimbusHexacopterPointFromTown(HEX_PILOT_SEAT_TOWN_OCCUPANT),
  exitPoint: nimbusHexacopterPointFromTown(HEX_PILOT_SEAT_TOWN_EXIT),
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
const runtimeSeatsById = new Map<string, PassengerSeatDefinition>();

/** Runtime-built machines publish seats through the same passenger contract. */
export function registerRuntimePassengerSeat(
  seat: PassengerSeatDefinition,
): () => void {
  runtimeSeatsById.set(seat.id, seat);
  return () => {
    if (runtimeSeatsById.get(seat.id) === seat) runtimeSeatsById.delete(seat.id);
  };
}

export function clearRuntimePassengerSeats(): void {
  runtimeSeatsById.clear();
}

export function passengerSeatForId(id: string | null | undefined): PassengerSeatDefinition | null {
  return id ? seatsById.get(id) ?? runtimeSeatsById.get(id) ?? null : null;
}

/**
 * Занятое место даёт ручное управление винтокрылой машиной?
 *
 * Отдельная функция нужна затем же, зачем `allegianceOf`: чтобы «это кресло
 * пилота» читалось ОДИНАКОВО у всех потребителей и не превращалось в
 * сравнение с именем конкретного кресла в каждом месте вызова. Именно такое
 * сравнение и стоило Нимбу ручного управления.
 */
export function seatCommandsRotorcraft(
  id: string | null | undefined,
): boolean {
  return passengerSeatForId(id)?.rotorcraftControls === true;
}

/**
 * МЕСТО ЭТОЙ МАШИНЫ, какое бы оно ни было.
 *
 * Нужна общему контуру взаимодействия: он предлагает сесть тому, у кого есть
 * куда, и вопрос «есть ли у этой машины место» не должен превращаться в
 * перечисление машин. Прежде контур спрашивал `id === "sky-train"` и подставлял
 * кресло машиниста литералом, а всем остальным — кресло управления винтокрылой;
 * то есть знал поимённо и машину, и то, какие бывают кресла.
 *
 * Управляющее это место или пассажирское, решает уже само место
 * (`rotorcraftControls`), а не тот, кто его нашёл.
 */
export function passengerSeatForCluster(
  clusterId: string | null | undefined,
  /**
   * Список мест — доводом, а не только модульным. Иначе предпочтение ниже
   * недостижимо для теста: подсунуть два места на один кластер нечем, а
   * сторож реестров второе место как раз запрещает. Проверять защиту,
   * которую нельзя привести в действие, — то же самое, что не иметь её.
   */
  seats: readonly PassengerSeatDefinition[] = passengerSeats,
): PassengerSeatDefinition | null {
  if (!clusterId) {
    return null;
  }
  const mine = seats.filter((seat) => seat.carrierClusterId === clusterId);
  // МЕСТО УПРАВЛЕНИЯ ИМЕЕТ ПРЕИМУЩЕСТВО, и это не вкусовщина. Прежняя ветка
  // спрашивала именно управляющее место, а «первое попавшееся» стало бы
  // молчаливой заменой смысла: добавь машине пассажирское кресло, положи его
  // в списке выше пилотского — и ручной полёт умрёт, не сказав ни слова,
  // потому что `manualPilotLaunch` спрашивает способность НАЙДЕННОГО места.
  // Сегодня место у каждой машины одно (это сторожит
  // `tests/vehicle-registry-consistency.test.mjs`), и предпочтение ничего не
  // меняет — оно стоит здесь ровно на тот день, когда мест станет два.
  return mine.find((seat) => seat.rotorcraftControls === true) ?? mine[0] ?? null;
}

/**
 * Занятое место управляет ИМЕННО ЭТОЙ машиной?
 *
 * Нужна отдельно от `seatCommandsRotorcraft` там, где вопрос задаётся внутри
 * покадрового цикла по всем машинам: «человек сидит в каком-нибудь пилотском
 * кресле» и «человек сидит в кресле ВОТ ЭТОЙ машины» — разные вопросы, и пока
 * кресло управления было одно на весь проект, разницы между ними не было
 * видно. Как только их стало два, первый вопрос стал слабее нужного.
 */
export function seatCommandsCarrier(
  seatId: string | null | undefined,
  clusterId: string | null | undefined,
): boolean {
  const seat = passengerSeatForId(seatId);
  return (
    seat?.rotorcraftControls === true &&
    !!clusterId &&
    seat.carrierClusterId === clusterId
  );
}

/**
 * Место управления ЭТОЙ машины, если оно у неё есть.
 *
 * Ищется по машине, а не по имени места: у каждой винтокрылой кабина своя, и
 * общий контур обязан находить её так же, как находит саму машину, — по
 * кластеру.
 */
export function rotorcraftControlSeatForCluster(
  clusterId: string | null | undefined,
): PassengerSeatDefinition | null {
  if (!clusterId) {
    return null;
  }
  return (
    passengerSeats.find(
      (seat) =>
        seat.rotorcraftControls === true && seat.carrierClusterId === clusterId,
    ) ?? null
  );
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
