import type {
  BreakablePieceDefinition,
  LampEventState,
  SceneVector3,
} from "./destructionScene.ts";
import { PLAYER_CAPSULE_FOOT_OFFSET } from "./playerMovement.ts";
import type { RotorcraftYawThruster } from "./rotorcraftDynamics.ts";
import type { StrutRetraction, SupportStrutPlan } from "./supportStrut.ts";
import {
  corneringSpeed,
  DEFAULT_SLIP_POLICY,
  VECTORED_SLIP_POLICY,
  slipAllowanceForCorridor,
  pathSpeedCeiling,
  pathTurnAngle,
  pathTurnRadius,
  type RotorcraftPathSample,
  type RotorcraftSlipPolicy,
  type RotorcraftTurnCapability,
} from "./rotorcraftSpeedGovernor.ts";
import type { VehicleRecoveryLifecycle } from "./vehicleFailure.ts";
import type { VehicleSafetyAdvisory } from "./vehicleSafetyAutomation.ts";
import {
  trimCommandChannel,
  type VehicleTrimRailDefinition,
} from "./vehicleTrimAutomation.ts";
import {
  flightPlan,
  skyTrainRoutePhase,
  type SkyTrainFlightKind,
  type VehicleRoutePlan,
} from "./skyTrainRoutes.ts";
import {
  BASALT_SKY_RAM_CLUSTER_ID,
  BASALT_SKY_RAM_LIFT_CENTRE,
  BASALT_SKY_RAM_MOORING_POINT,
  BASALT_SKY_RAM_NOSE,
  BASALT_SKY_RAM_ORIGIN,
  basaltSkyRamPoint,
} from "./basaltSkyRam.ts";
import {
  HEXACOPTER_DUCTS,
  HEXACOPTER_LIFT_CENTRE,
  HEXACOPTER_MOORING_POINT,
  HEXACOPTER_NOSE,
  HEXACOPTER_ORIGIN,
  HEX_ARM_RADIUS,
  HEX_CANOPY_TOP_Y,
  HEX_DISC_Y,
  HEX_GONDOLA_BOTTOM_Y,
  HEX_KEEL_BOTTOM_Y,
  HEX_LIP_OUTER_RADIUS,
  HEX_LIP_TOP_Y,
  HEX_SHROUD_BOTTOM_Y,
  TOWN_HEXACOPTER_CLUSTER_ID,
  hexacopterPoint,
} from "./townHexacopter.ts";
import { rangeHexacopterPointFromTown } from "./rangeHexacopter.ts";
import {
  NIMBUS_HEXACOPTER_CLUSTER_ID,
  NIMBUS_HEXACOPTER_LIFT_CENTRE,
  NIMBUS_HEXACOPTER_MOORING_POINT,
  NIMBUS_HEXACOPTER_NOSE,
  NIMBUS_HEXACOPTER_ORIGIN,
  nimbusHexacopterPointFromTown,
  nimbusHexacopterVectorFromTown,
} from "./nimbusHexacopter.ts";
import {
  SR6_SKAT_CLUSTER_ID,
  SR6_SKAT_LIFT_CENTRE,
  SR6_SKAT_MOORING_POINT,
  SR6_SKAT_NOSE,
  SR6_SKAT_ORIGIN,
  sr6SkatPoint,
  sr6SkatVector,
} from "./sr6Skat.ts";
import { SR6_ROTOR_STATIONS } from "../content/objects/vehicles/sr6SkatObject.ts";
import { combatHexacopterRangeFrame } from "./combatHexacopter.ts";
import { ductHexacopterRangeFrame } from "./rangeDuctHexacopter.ts";

// Kept as re-exports for callers while the authored routes themselves live in
// their own artifact module.
export {
  finalLegFrom,
  emergencyEscapePlan,
  flightPlan,
  routeLength,
  routePoint,
  routeSpeed,
  skyTrainRoutePhase,
  terminalArrivalPlan,
  SKY_TRAIN_UNSTICK_HEIGHT as UNSTICK_HEIGHT,
  type FlightPlan,
  type SkyTrainFlightKind,
  type VehicleRoutePlan,
} from "./skyTrainRoutes.ts";

/**
 * Кадр отсчёта транспорта: кластер, который умеет двигаться целиком.
 *
 * Куски авторятся в мировых координатах, как и всё остальное, но пока кадр
 * не в покое, их мировое положение считается заново от позы кадра. Это тот
 * же приём, которым система дверей возит створку, только кусков не два, а
 * пятьсот, и вместе с позой кадр несёт СКОРОСТЬ: отломанная в манёвре
 * панель обязана улететь с той скоростью, с какой шёл корабль, иначе всё
 * дальнейшее — падение сбитого судна, авария машины — будет мёртвым.
 *
 * Модуль намеренно чистый: ни three, ни rapier. Всё, что здесь есть, можно
 * посчитать в тесте.
 */
/**
 * Опора машины в терминах КАДРА: физический паспорт стойки плюс то, какими
 * кусками она нарисована.
 *
 * Закону стойки о кусках знать нечего — он о газе, масле и ходе. Но живой
 * машине нужно и то и другое: по чему судить, цела ли нога, и что двигать,
 * чтобы ход было видно. Это знание принадлежит кадру, поэтому здесь оно и
 * лежит — совпадением по вхождению в id куска, как и все прочие маски кадра.
 */
export interface VehicleSupportStrutDefinition {
  readonly plan: SupportStrutPlan;
  /** Без этих кусков опоры нет: угол проваливается на грунт. */
  readonly requiredMembers: readonly string[];
  /** Ходят вместе со штоком на весь ход. */
  readonly travellingMembers: readonly string[];
  /**
   * Ходят на половину хода. Шлиц-шарнир не едет, а складывается: его середина
   * проходит половину пути концов, и это ближе к правде, чем неподвижность.
   */
  readonly halfTravellingMembers?: readonly string[];
  /**
   * Цапфа уборки. Есть — нога складывается к корпусу на крейсерской фазе и
   * возвращается на подходе; нет — стойка неубирающаяся, и это нормальный
   * вариант, а не недоделка.
   */
  readonly retraction?: StrutRetraction;
  /**
   * Что именно поворачивается вокруг цапфы. Сама цапфа сюда НЕ ВХОДИТ: она и
   * есть ось, вокруг которой ходит остальное.
   */
  readonly foldingMembers?: readonly string[];
}

export interface VehicleFrameDefinition {
  readonly id: string;
  readonly clusterId: string;
  /** Human-readable callsign used by the generic movement telemetry HUD. */
  readonly telemetryLabel?: string;
  /** Внутренние механизмы, которые двигаются относительно общего корпуса. */
  readonly independentMemberMatches?: readonly string[];
  /** Inserted fittings omitted from the carrier's outer contact envelope. */
  readonly contactMemberExcludes?: readonly string[];
  /**
   * Точка, вокруг которой кадр кренится и разворачивается. Для небесного
   * поезда это центр подъёмного сердца — центр объёма оболочки, а не
   * геометрический центр состава: корабль качается вокруг того, что его
   * держит.
   */
  readonly origin: SceneVector3;
  /** Куда смотрит нос в покое. Продольная ось — она же ось крена. */
  readonly nose: SceneVector3;
  /** Физическая точка носового узла, совпадающая с захватом причала в покое. */
  readonly mooringPoint: SceneVector3;
  /**
   * Подъёмная сила: она приложена в центре объёма оболочки — ВЫШЕ центра
   * масс, и именно эта пара сама даёт кораблю маятник, отвисающую гондолу и
   * клевок на торможении. Величина считается от целого корабля: целым он
   * нейтрально плавуч, а рвётся полотно — подъём падает пропорционально.
   */
  readonly liftCentre: SceneVector3;
  /** Кусок оболочки, по доле уцелевших считается подъём. */
  readonly envelopeMatch: string;
  /**
   * Physical proximity sensors mounted on the carrier. They never create a
   * force or contact. Downward sensors are powered by default for height and
   * landing estimation; every other direction is opt-in equipment.
   */
  readonly proximitySensors: readonly VehicleProximitySensor[];
  /**
   * Опоры машины. Объявившая их машина стоит на грунте СТОЙКАМИ, а не
   * коллайдерами ног: реакцию, ход и осадку считает `supportStrut`, а сами
   * ноги обязаны быть исключены из обвода компаунда — иначе луч стойки найдёт
   * опору в собственной пятке.
   */
  readonly supportStruts?: readonly VehicleSupportStrutDefinition[];
  /**
   * Подвижные грузы дифферентовки внутри оболочки. Единственный орган, который
   * вообще создаёт момент по крену и тангажу: своей массой, а не силой.
   */
  readonly trimRails?: readonly VehicleTrimRailDefinition[];
}

/**
 * Пара рельсов в килевом коридоре: продольный ведёт груз к носу, поперечный —
 * на правый борт. Направления берутся из носа кадра, поэтому знаки закона
 * управления в `vehicleTrimAutomation` верны для любой машины.
 */
interface KeelTrimRail {
  /** Exact scene piece id of the travelling car. */
  readonly carPieceId: string;
  readonly zero: SceneVector3;
  readonly travel: number;
  readonly speed: number;
}

function keelTrimRails(
  nose: SceneVector3,
  pitch: KeelTrimRail,
  roll: KeelTrimRail,
): readonly VehicleTrimRailDefinition[] {
  const noseLength = Math.hypot(nose[0], nose[2]) || 1;
  const forward: SceneVector3 = [nose[0] / noseLength, 0, nose[2] / noseLength];
  const starboardAxis = pitchAxisOf(forward);
  const starboardLength = Math.hypot(starboardAxis[0], starboardAxis[2]) || 1;
  const starboard: SceneVector3 = [
    starboardAxis[0] / starboardLength,
    0,
    starboardAxis[2] / starboardLength,
  ];
  return [
    {
      axis: "pitch",
      commandChannel: trimCommandChannel("pitch"),
      carPieceId: pitch.carPieceId,
      zero: pitch.zero,
      direction: forward,
      travel: pitch.travel,
      speed: pitch.speed,
    },
    {
      axis: "roll",
      commandChannel: trimCommandChannel("roll"),
      carPieceId: roll.carPieceId,
      zero: roll.zero,
      direction: starboard,
      travel: roll.travel,
      speed: roll.speed,
    },
  ];
}

/** Physical sensor mount and viewing direction in authored coordinates. */
/**
 * ЧЕЙ ЭТО ДАТЧИК — привязка датчиков приближения к деталям машины.
 *
 * Датчики объявлены точками в осях кадра и про свои детали не знают: оторванная
 * гондола улетает, а её датчик остаётся висеть в идеальном обводе. Снаружи это
 * читается как «сенсоры образуют собственный геометрический контур, а не
 * закреплены к своим деталям» (наблюдение Igor, 12.08.2026).
 *
 * Привязка ГЕОМЕТРИЧЕСКАЯ, а не авторская: датчик принадлежит ближайшему куску.
 * Так она достаётся даром всем машинам сразу и не расходится с паспортом, когда
 * деталь переименуют.
 *
 * Расстояние меряется до ПОВЕРХНОСТИ куска (центр минус полудиагональ), а не до
 * его центра: датчик на обшивке гондолы обязан достаться гондоле, а не корпусу,
 * чей центр к началу координат ближе.
 */
export function vehicleSensorPieces(
  sensors: readonly { readonly point: SceneVector3 }[],
  pieces: readonly {
    readonly id: string;
    readonly position: SceneVector3;
    readonly size: SceneVector3;
  }[],
): string[] {
  return sensors.map((sensor) => {
    let bestId = pieces[0]?.id ?? "";
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const piece of pieces) {
      const radius = Math.hypot(piece.size[0], piece.size[1], piece.size[2]) / 2;
      const distance =
        Math.hypot(
          sensor.point[0] - piece.position[0],
          sensor.point[1] - piece.position[1],
          sensor.point[2] - piece.position[2],
        ) - radius;
      if (distance < bestDistance) {
        bestDistance = distance;
        bestId = piece.id;
      }
    }
    return bestId;
  });
}

export interface VehicleProximitySensor {
  readonly point: SceneVector3;
  readonly normal: SceneVector3;
  readonly enabledByDefault?: boolean;
}

export function vehicleProximitySensorEnabled(
  sensor: VehicleProximitySensor,
): boolean {
  return sensor.enabledByDefault ?? sensor.normal[1] < -0.35;
}

/**
 * Оболочка небесного поезда. Числа продублированы из сцены намеренно — как и
 * origin: политика транспорта не тянет за собой терминал, а тест сверяет их
 * с настоящей геометрией.
 */
const HULL = { from: -10.2, to: 21.4, y: 9.4, z: 77.6, radius: 3 } as const;

export function skyTrainHullRadiusAt(x: number): number {
  const length = HULL.to - HULL.from;
  const t = (x - HULL.from) / length;
  if (t < 0.2) {
    return HULL.radius * Math.sqrt(Math.max(0, 1 - ((0.2 - t) / 0.2) ** 2));
  }
  if (t > 0.64) {
    return (
      HULL.radius * Math.pow(Math.max(0, 1 - ((t - 0.64) / 0.36) ** 2), 0.55)
    );
  }
  return HULL.radius;
}

function skyTrainProximitySensors(): readonly VehicleProximitySensor[] {
  const sensors: VehicleProximitySensor[] = [];
  // Нос и корма: ими он и въедет во что-нибудь первым делом.
  sensors.push({ point: [HULL.from - 0.2, HULL.y, HULL.z], normal: [-1, 0, 0] });
  sensors.push({ point: [HULL.to + 0.2, HULL.y, HULL.z], normal: [1, 0, 0] });
  // Борта и верх оболочки по станциям.
  for (const x of [-6, -1, 4, 9, 14, 18.5]) {
    const radius = skyTrainHullRadiusAt(x);
    sensors.push({ point: [x, HULL.y, HULL.z - radius], normal: [0, 0, -1] });
    sensors.push({ point: [x, HULL.y, HULL.z + radius], normal: [0, 0, 1] });
    sensors.push({ point: [x, HULL.y + radius, HULL.z], normal: [0, 1, 0] });
  }
  // Круги винтов: они вынесены дальше бортов оболочки и цепляют первыми.
  for (const side of [-1, 1] as const) {
    sensors.push({
      point: [5.6, 7.6, HULL.z + side * 5.75],
      normal: [0, 0, side],
    });
  }
  // Борта вагонов: ими корабль трётся о перрон.
  for (const x of [-6, -1.5, 3.5, 8.5, 13.5, 17.5]) {
    sensors.push({ point: [x, 2.6, HULL.z - 1.55], normal: [0, 0, -1] });
    sensors.push({ point: [x, 2.6, HULL.z + 1.55], normal: [0, 0, 1] });
  }
  // Низкая кабина выступает перед вагоном: оболочка над ней не заметит
  // буфер или фасад на уровне стекла, поэтому у эркера свои сенсоры.
  sensors.push({ point: [-9.34, 2.78, HULL.z], normal: [-1, 0, 0] });
  sensors.push({ point: [-8.25, 2.78, HULL.z - 1.28], normal: [0, 0, -1] });
  sensors.push({ point: [-8.25, 2.78, HULL.z + 1.28], normal: [0, 0, 1] });
  // Dedicated landing altimeters. These are measurements, not suspension.
  for (const x of [-6.3, 4.1, 17.5]) {
    sensors.push({ point: [x, 0.94, HULL.z], normal: [0, -1, 0] });
  }
  return sensors;
}

const VIKING_LONGSHIP = {
  centreX: 8.25,
  centreZ: -102.5,
  course: (6 * Math.PI) / 180,
  liftY: 8.1,
} as const;

/** World-authored point in the longship's keel/starboard coordinate frame. */
function vikingLongshipPoint(a: number, b: number, y: number): SceneVector3 {
  const cosine = Math.cos(VIKING_LONGSHIP.course);
  const sine = Math.sin(VIKING_LONGSHIP.course);
  return [
    VIKING_LONGSHIP.centreX + a * cosine - b * sine,
    y,
    VIKING_LONGSHIP.centreZ + a * sine + b * cosine,
  ];
}

function vikingLongshipProximitySensors(): readonly VehicleProximitySensor[] {
  const cosine = Math.cos(VIKING_LONGSHIP.course);
  const sine = Math.sin(VIKING_LONGSHIP.course);
  const nose: SceneVector3 = [-cosine, 0, -sine];
  const tail: SceneVector3 = [cosine, 0, sine];
  const starboard: SceneVector3 = [-sine, 0, cosine];
  const port: SceneVector3 = [sine, 0, -cosine];
  const sensors: VehicleProximitySensor[] = [
    { point: vikingLongshipPoint(-7.95, 0, 8.1), normal: nose },
    { point: vikingLongshipPoint(7.55, 0, 8.1), normal: tail },
  ];
  // Balloon skin: three stations per side plus crown and belly.
  for (const a of [-4.2, 0, 4.2]) {
    sensors.push(
      { point: vikingLongshipPoint(a, 2.38, 8.1), normal: starboard },
      { point: vikingLongshipPoint(a, -2.38, 8.1), normal: port },
      { point: vikingLongshipPoint(a, 0, 10.48), normal: [0, 1, 0] },
      { point: vikingLongshipPoint(a, 0, 5.72), normal: [0, -1, 0] },
    );
  }
  // Clinker hull and the outboard oars are the first low obstacles to touch.
  for (const a of [-4.4, -2.2, 0, 2.2, 4.4]) {
    sensors.push(
      { point: vikingLongshipPoint(a, 1.9, 1.55), normal: starboard },
      { point: vikingLongshipPoint(a, -1.9, 1.55), normal: port },
    );
  }
  return sensors;
}

const TOWN_AIRSHIP = {
  noseX: -22.6,
  noseZ: -15.29,
  heading: -1.451,
  liftA: 6.25,
  liftY: 12.7,
} as const;

/** World-authored point in the city airship's longitudinal/lateral frame. */
export function townAirshipPoint(
  a: number,
  b: number,
  y: number,
): SceneVector3 {
  const cosine = Math.cos(TOWN_AIRSHIP.heading);
  const sine = Math.sin(TOWN_AIRSHIP.heading);
  return [
    TOWN_AIRSHIP.noseX + a * cosine - b * sine,
    y,
    TOWN_AIRSHIP.noseZ + a * sine + b * cosine,
  ];
}

function townAirshipProximitySensors(): readonly VehicleProximitySensor[] {
  const cosine = Math.cos(TOWN_AIRSHIP.heading);
  const sine = Math.sin(TOWN_AIRSHIP.heading);
  const nose: SceneVector3 = [-cosine, 0, -sine];
  const tail: SceneVector3 = [cosine, 0, sine];
  const positiveB: SceneVector3 = [-sine, 0, cosine];
  const negativeB: SceneVector3 = [sine, 0, -cosine];
  const sensors: VehicleProximitySensor[] = [
    // The docking socket intentionally surrounds the mooring pin. Sensor from
    // the upper nose skin so the intended berth is not read as an obstacle.
    { point: townAirshipPoint(0.8, 0, 13.75), normal: nose },
    { point: townAirshipPoint(15.35, 0, 12.6), normal: tail },
  ];
  for (const a of [2.5, 7, 11.5]) {
    sensors.push(
      { point: townAirshipPoint(a, 2.42, 12.6), normal: positiveB },
      { point: townAirshipPoint(a, -2.42, 12.6), normal: negativeB },
      { point: townAirshipPoint(a, 0, 15.02), normal: [0, 1, 0] },
      { point: townAirshipPoint(a, 0, 10.18), normal: [0, -1, 0] },
    );
  }
  // The motor circles and the low gondola meet obstacles before the skin.
  for (const side of [-1, 1] as const) {
    sensors.push({
      point: townAirshipPoint(7, side * 5.75, 11.4),
      normal: side > 0 ? positiveB : negativeB,
    });
  }
  for (const a of [3.4, 5.8, 8.2]) {
    sensors.push(
      { point: townAirshipPoint(a, 1.25, 8.15), normal: positiveB },
      { point: townAirshipPoint(a, -1.25, 8.15), normal: negativeB },
    );
  }
  return sensors;
}


/** Physical sensor layout of the wide, low hexacopter. */
function hexacopterProximitySensors(): readonly VehicleProximitySensor[] {
  const fore: SceneVector3 = HEXACOPTER_NOSE;
  const aft: SceneVector3 = [-fore[0], 0, -fore[2]];
  const sensors: VehicleProximitySensor[] = [
    // Нос гондолы. Приёмный стакан площадки стоит НИЖЕ этой точки, поэтому
    // штатный причал не читается как внезапное препятствие.
    { point: hexacopterPoint(1.16, 0, HEX_GONDOLA_BOTTOM_Y + 0.12), normal: fore },
    { point: hexacopterPoint(-1.1, 0, HEX_GONDOLA_BOTTOM_Y + 0.12), normal: aft },
    { point: hexacopterPoint(0, 0, HEX_CANOPY_TOP_Y), normal: [0, 1, 0] },
    { point: hexacopterPoint(0, 0, HEX_KEEL_BOTTOM_Y), normal: [0, -1, 0] },
  ];
  for (const station of HEXACOPTER_DUCTS) {
    const outward: SceneVector3 = [
      -Math.cos(station.angle),
      0,
      -Math.sin(station.angle),
    ];
    const rim = HEX_ARM_RADIUS + HEX_LIP_OUTER_RADIUS;
    sensors.push(
      {
        point: hexacopterPoint(
          rim * Math.cos(station.angle),
          rim * Math.sin(station.angle),
          HEX_DISC_Y,
        ),
        normal: outward,
      },
      {
        point: hexacopterPoint(station.a, station.b, HEX_LIP_TOP_Y),
        normal: [0, 1, 0],
      },
      {
        point: hexacopterPoint(station.a, station.b, HEX_SHROUD_BOTTOM_Y),
        normal: [0, -1, 0],
      },
    );
  }
  return sensors;
}

function nimbusHexacopterProximitySensors(): readonly VehicleProximitySensor[] {
  return hexacopterProximitySensors().map((sensor) => ({
    ...sensor,
    point: nimbusHexacopterPointFromTown(sensor.point),
    normal: nimbusHexacopterVectorFromTown(sensor.normal),
  }));
}

function sr6SkatProximitySensors(): readonly VehicleProximitySensor[] {
  const sensors: VehicleProximitySensor[] = [
    { point: sr6SkatPoint([0, 0.82, 2.43]), normal: SR6_SKAT_NOSE },
    { point: sr6SkatPoint([0, 1.12, -2.08]), normal: sr6SkatVector([0, 0, -1]) },
    { point: sr6SkatPoint([0, 1.82, -0.2]), normal: [0, 1, 0] },
    { point: sr6SkatPoint([0, 0.05, 0]), normal: [0, -1, 0] },
  ];
  for (const station of SR6_ROTOR_STATIONS) {
    const length = Math.hypot(station.x, station.z) || 1;
    const outward: SceneVector3 = [station.x / length, 0, station.z / length];
    sensors.push(
      {
        point: sr6SkatPoint([
          station.x + outward[0] * station.radius,
          station.planeY,
          station.z + outward[2] * station.radius,
        ]),
        normal: sr6SkatVector(outward),
      },
      {
        point: sr6SkatPoint([station.x, station.planeY + 0.18, station.z]),
        normal: [0, 1, 0],
      },
    );
  }
  return sensors;
}

function basaltSkyRamProximitySensors(): readonly VehicleProximitySensor[] {
  const sensors: VehicleProximitySensor[] = [
    // The cast point sits inside its berth jaw. Its upper brace is the first
    // forward obstacle sensor, so the intended socket is not rejected.
    { point: basaltSkyRamPoint(9.35, 0, 6.55), normal: [0, 0, 1] },
    { point: basaltSkyRamPoint(-17.2, 0, 12.8), normal: [0, 0, -1] },
  ];
  for (const [a, lateral, top, bottom] of [
    [-11.2, 3.15, 16.1, 9.55],
    [-5.2, 3.92, 16.75, 9.0],
    [0.5, 4.02, 16.85, 8.98],
    [6.1, 3.68, 16.75, 9.18],
  ] as const) {
    sensors.push(
      { point: basaltSkyRamPoint(a, -lateral, 12.8), normal: [-1, 0, 0] },
      { point: basaltSkyRamPoint(a, lateral, 12.8), normal: [1, 0, 0] },
      { point: basaltSkyRamPoint(a, 0, top), normal: [0, 1, 0] },
      { point: basaltSkyRamPoint(a, 0, bottom), normal: [0, -1, 0] },
    );
  }
  for (const side of [-1, 1] as const) {
    for (const a of [-5.6, 0, 5.4]) {
      sensors.push({
        point: basaltSkyRamPoint(a, side * 1.98, 6.15),
        normal: [side, 0, 0],
      });
    }
  }
  return sensors;
}

export const vehicleFrames: readonly VehicleFrameDefinition[] = [
  {
    id: "sky-train",
    clusterId: "terminal:sky-train",
    telemetryLabel: "SKY TRAIN 01",
    independentMemberMatches: [":blade:", ":trim:"],
    // Нос корабля смотрит на −x: от этого зависит, вокруг чего он кренится,
    // а вокруг чего задирает нос.
    nose: [-1, 0, 0],
    // = [(hullFrom + hullTo) / 2, hullY, trackZ] из skyBerthMetrics.
    // Совпадение проверяет тест: числа здесь дублируются намеренно, чтобы
    // политика транспорта не тянула за собой всю сцену терминала.
    origin: [5.6, 9.4, 77.6],
    // Центр видимого носового конуса внутри швартовочного узла перрона.
    mooringPoint: [-10.65, 9.4, 77.6],
    liftCentre: [5.6, 9.4, 77.6],
    envelopeMatch: ":skin:",
    proximitySensors: skyTrainProximitySensors(),
    // Килевой коридор внутри оболочки: продольная тележка низко под газовым
    // сердцем, поперечная — выше, у самой широкой хорды. Обе стоят над
    // измеренным центром масс, поэтому целая машина остаётся сбалансированной.
    trimRails: keelTrimRails(
      [-1, 0, 0],
      {
        carPieceId: "terminal:sky-train:trim:pitch:car",
        zero: [5.6, 6.88, 77.6],
        travel: 6,
        speed: 0.32,
      },
      {
        carPieceId: "terminal:sky-train:trim:roll:car",
        zero: [5.6, 7.68, 77.6],
        travel: 2.15,
        speed: 0.26,
      },
    ),
  },
  {
    id: "sky-longship",
    clusterId: "viking-village:sky-longship",
    telemetryLabel: "SKY LONGSHIP 01",
    // Oars articulate around their own oarlocks instead of being baked into
    // the rigid hull collider. Their shafts still remain live actuators.
    independentMemberMatches: [":oar:-1:", ":oar:1:", ":trim:"],
    origin: vikingLongshipPoint(0, 0, VIKING_LONGSHIP.liftY),
    nose: [
      -Math.cos(VIKING_LONGSHIP.course),
      0,
      -Math.sin(VIKING_LONGSHIP.course),
    ],
    // Точка носовой обвязки, от которой уходят причальные концы.
    mooringPoint: vikingLongshipPoint(-6.1, 0, 2.3),
    liftCentre: vikingLongshipPoint(0, 0, VIKING_LONGSHIP.liftY),
    envelopeMatch: ":gore:",
    proximitySensors: vikingLongshipProximitySensors(),
    trimRails: keelTrimRails(
      [
        -Math.cos(VIKING_LONGSHIP.course),
        0,
        -Math.sin(VIKING_LONGSHIP.course),
      ],
      {
        carPieceId: "viking-village:sky-longship:trim:pitch:car:piece",
        zero: vikingLongshipPoint(0.05, -0.05, 5.74),
        travel: 4,
        speed: 0.3,
      },
      {
        carPieceId: "viking-village:sky-longship:trim:roll:car:piece",
        zero: vikingLongshipPoint(0.05, -0.05, 6.14),
        travel: 1.25,
        speed: 0.24,
      },
    ),
  },
  {
    id: "town-airship",
    clusterId: "sky-mooring:airship",
    telemetryLabel: "AIRSHIP 07",
    independentMemberMatches: [":blade:", ":trim:"],
    // The authored mast cup is a visible solid proxy for a hollow socket.
    // Its inserted nose fitting must not become part of the outer envelope;
    // the cap immediately behind it remains a normal physical collider.
    contactMemberExcludes: [":nose:cone:"],
    origin: townAirshipPoint(TOWN_AIRSHIP.liftA, 0, TOWN_AIRSHIP.liftY),
    nose: [-Math.cos(TOWN_AIRSHIP.heading), 0, -Math.sin(TOWN_AIRSHIP.heading)],
    // Передний конец швартового конуса входит в вертикальный стакан мачты.
    mooringPoint: townAirshipPoint(-1.65, 0, 12.6),
    liftCentre: townAirshipPoint(TOWN_AIRSHIP.liftA, 0, TOWN_AIRSHIP.liftY),
    envelopeMatch: ":gore:",
    proximitySensors: townAirshipProximitySensors(),
    // Короткое маятниковое плечо и моторы на выносах: этой машине трима не
    // хватит на потерю целой мотогондолы, и она честно повиснет с креном.
    trimRails: keelTrimRails(
      [-Math.cos(TOWN_AIRSHIP.heading), 0, -Math.sin(TOWN_AIRSHIP.heading)],
      {
        carPieceId: "sky-mooring:airship:trim:pitch:car:piece",
        zero: townAirshipPoint(6.17, 0, 10.27),
        travel: 3,
        speed: 0.3,
      },
      {
        carPieceId: "sky-mooring:airship:trim:roll:car:piece",
        zero: townAirshipPoint(6.17, 0, 10.87),
        travel: 1.25,
        speed: 0.22,
      },
    ),
  },
  {
    id: "basalt-sky-ram",
    clusterId: BASALT_SKY_RAM_CLUSTER_ID,
    telemetryLabel: "SKY RAM 01",
    independentMemberMatches: [":gallery:ramp:", ":trim:"],
    origin: BASALT_SKY_RAM_ORIGIN,
    nose: BASALT_SKY_RAM_NOSE,
    mooringPoint: BASALT_SKY_RAM_MOORING_POINT,
    liftCentre: BASALT_SKY_RAM_LIFT_CENTRE,
    envelopeMatch: ":skin:",
    proximitySensors: basaltSkyRamProximitySensors(),
    trimRails: keelTrimRails(
      BASALT_SKY_RAM_NOSE,
      {
        carPieceId: `${BASALT_SKY_RAM_CLUSTER_ID}:trim:pitch:car`,
        zero: basaltSkyRamPoint(-0.68, -0.02, 5.0),
        travel: 5.5,
        speed: 0.28,
      },
      {
        carPieceId: `${BASALT_SKY_RAM_CLUSTER_ID}:trim:roll:car`,
        zero: basaltSkyRamPoint(-0.68, -0.02, 5.32),
        travel: 1.05,
        speed: 0.22,
      },
    ),
  },

  {
    id: "town-hexacopter",
    clusterId: TOWN_HEXACOPTER_CLUSTER_ID,
    telemetryLabel: "HX-6",
    independentMemberMatches: [":blade:", ":trim:"],
    // Машина переехала на полигон Tonkawa (фишка №1, вердикт Igor
    // 07.08.2026) чистой трансляцией с сохранением всех идентификаторов:
    // якоря кадра переезжают той же суммой, что и куски кластера.
    origin: rangeHexacopterPointFromTown(HEXACOPTER_ORIGIN),
    nose: HEXACOPTER_NOSE,
    // Носовой штырь под гондолой входит в приёмный стакан площадки.
    mooringPoint: rangeHexacopterPointFromTown(HEXACOPTER_MOORING_POINT),
    // Подъём приложен в плоскости входных губ — единственной точке машины,
    // которая выше центра масс. Это и есть весь её маятник: у винтокрылой
    // машины он короткий, и таким он и должен быть.
    liftCentre: rangeHexacopterPointFromTown(HEXACOPTER_LIFT_CENTRE),
    // Подъём этой машины делают ЛОПАСТИ, а не оболочка. Поэтому доля
    // уцелевших лопастей и есть доля располагаемого подъёма: восемнадцать
    // лопастей в шести кольцах, потеря кольца — минус 1/6 подъёма.
    envelopeMatch: ":blade:",
    proximitySensors: hexacopterProximitySensors().map((sensor) => ({
      ...sensor,
      point: rangeHexacopterPointFromTown(sensor.point),
    })),
    // ДИФФЕРЕНТОВКИ У КОПТЕРА НЕТ И БЫТЬ НЕ ДОЛЖНО.
    //
    // Подвижный груз — орган ГАЗОВОЙ машины: у неё момент по крену и тангажу
    // больше взять неоткуда, тяга идёт вдоль корпуса, а подъём приложен в
    // одной точке. Винтокрылая машина создаёт тот же момент разнотягом
    // винтов — быстро, непрерывно и в обе стороны, — и возить ради этого
    // свинец по рельсам значит противоречить её собственной физике.
  },
  {
    id: "nimbus-hexacopter",
    clusterId: NIMBUS_HEXACOPTER_CLUSTER_ID,
    telemetryLabel: "HX-6 NIMBUS",
    independentMemberMatches: [":blade:", ":trim:"],
    origin: NIMBUS_HEXACOPTER_ORIGIN,
    nose: NIMBUS_HEXACOPTER_NOSE,
    mooringPoint: NIMBUS_HEXACOPTER_MOORING_POINT,
    liftCentre: NIMBUS_HEXACOPTER_LIFT_CENTRE,
    envelopeMatch: ":blade:",
    proximitySensors: nimbusHexacopterProximitySensors(),
  },
  {
    id: "sr6-skat",
    clusterId: SR6_SKAT_CLUSTER_ID,
    telemetryLabel: "SR-6 SKAT",
    independentMemberMatches: [":blade:"],
    origin: SR6_SKAT_ORIGIN,
    nose: SR6_SKAT_NOSE,
    mooringPoint: SR6_SKAT_MOORING_POINT,
    liftCentre: SR6_SKAT_LIFT_CENTRE,
    envelopeMatch: ":blade:",
    proximitySensors: sr6SkatProximitySensors(),
  },
  combatHexacopterRangeFrame,
  ductHexacopterRangeFrame,
];

const frameByCluster = new Map(
  vehicleFrames.map((frame) => [frame.clusterId, frame] as const),
);

export function vehicleFrameForCluster(
  clusterId: string,
): VehicleFrameDefinition | null {
  return frameByCluster.get(clusterId) ?? null;
}

export function isVehicleFramePiece(piece: BreakablePieceDefinition): boolean {
  return frameByCluster.has(piece.clusterId);
}

/**
 * Поза кадра: смещение от авторского положения и углы ПО-САМОЛЁТНОМУ, то
 * есть относительно самого корабля, а не мировых осей:
 *   yaw   — разворот вокруг вертикали;
 *   pitch — нос вверх (плюс) или вниз (минус);
 *   roll  — крен, плюс = правый борт вниз.
 * Мина, на которой я уже посидел: у этого корабля продольная ось — мировая
 * X, поэтому «тангаж вокруг X» кренил бы его, а не задирал нос. Оси берутся
 * от носа кадра, а не угадываются.
 */
export interface VehiclePose {
  readonly position: SceneVector3;
  readonly yaw: number;
  readonly pitch: number;
  readonly roll: number;
  /**
   * Готовый поворот. Его отдаёт физика тела: там ориентация живёт
   * кватернионом, и раскладывать её в углы, чтобы тут же собрать обратно,
   * незачем. Если задан — углы игнорируются.
   */
  readonly rotation?: Quaternion;
}

export const RESTING_POSE: VehiclePose = {
  position: [0, 0, 0],
  yaw: 0,
  pitch: 0,
  roll: 0,
};

export function isRestingPose(pose: VehiclePose): boolean {
  if (pose.rotation) {
    const [x, y, z, w] = pose.rotation;
    if (
      Math.abs(x) + Math.abs(y) + Math.abs(z) > 1e-4 ||
      Math.abs(w) < 0.999999
    ) {
      return false;
    }
  }
  return (
    Math.abs(pose.position[0]) < 1e-4 &&
    Math.abs(pose.position[1]) < 1e-4 &&
    Math.abs(pose.position[2]) < 1e-4 &&
    Math.abs(pose.yaw) < 1e-4 &&
    Math.abs(pose.pitch) < 1e-4 &&
    Math.abs(pose.roll) < 1e-4
  );
}

export type Quaternion = readonly [number, number, number, number];

const IDENTITY: Quaternion = [0, 0, 0, 1];

export function multiplyQuaternions(a: Quaternion, b: Quaternion): Quaternion {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

function aboutAxis(axis: SceneVector3, angle: number): Quaternion {
  const length = Math.hypot(axis[0], axis[1], axis[2]) || 1;
  const half = angle / 2;
  const s = Math.sin(half) / length;
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(half)];
}

/** Ось тангажа корабля: поперечная, она же направление на правый борт. */
export function pitchAxisOf(nose: SceneVector3): SceneVector3 {
  // nose × up, где up = (0, 1, 0). Прибавленный ноль убирает -0: он не влияет
  // на математику, но портит сравнения в тестах.
  return [-nose[2] + 0, 0, nose[0] + 0];
}

/** Longitudinal and transverse inclination in the carrier's own frame. */
export function vehicleAttitude(
  orientation: Quaternion,
  nose: SceneVector3,
): { readonly pitch: number; readonly roll: number } {
  const forward = rotateVector(orientation, nose);
  const forwardLength = Math.hypot(...forward) || 1;
  const starboard = rotateVector(orientation, pitchAxisOf(nose));
  const starboardLength = Math.hypot(...starboard) || 1;
  return {
    pitch: Math.asin(Math.max(-1, Math.min(1, forward[1] / forwardLength))),
    // Positive roll means starboard down, matching VehiclePose and the
    // authored controls. The starboard vector's world Y has the opposite sign.
    roll: -Math.asin(Math.max(-1, Math.min(1, starboard[1] / starboardLength))),
  };
}

/**
 * Values attached to engine points in physical port-to-starboard order.
 * Authoring order is not a side contract: this keeps telemetry and future
 * control panels correct even when engines are rearranged in the model.
 */
/**
 * Значения по БОРТАМ, внутри борта — С ПЕРЕДНИХ. Для гексакоптеров плоский
 * список из шести чисел с двумя подписями путал стороны; здесь каждая
 * сторона — своя строка, и порядок в ней тот, каким машину видит глаз:
 * переднее кольцо, среднее, заднее.
 */
export function engineValuesBySide(
  values: readonly number[],
  enginePoints: readonly SceneVector3[],
  bodyCentre: SceneVector3,
  nose: SceneVector3,
): { readonly port: readonly number[]; readonly starboard: readonly number[] } {
  const starboardAxis = pitchAxisOf(nose);
  const lateralLength = Math.hypot(starboardAxis[0], starboardAxis[2]) || 1;
  const sx = starboardAxis[0] / lateralLength;
  const sz = starboardAxis[2] / lateralLength;
  const forwardLength = Math.hypot(nose[0], nose[2]) || 1;
  const fx = nose[0] / forwardLength;
  const fz = nose[2] / forwardLength;
  const tagged = enginePoints.map((point, index) => ({
    index,
    lateral: (point[0] - bodyCentre[0]) * sx + (point[2] - bodyCentre[2]) * sz,
    forward: (point[0] - bodyCentre[0]) * fx + (point[2] - bodyCentre[2]) * fz,
  }));
  const pick = (side: -1 | 1) =>
    tagged
      .filter((entry) => (side < 0 ? entry.lateral < 0 : entry.lateral >= 0))
      .sort((a, b) => b.forward - a.forward || a.index - b.index)
      .map((entry) => values[entry.index] ?? 0);
  return { port: pick(-1), starboard: pick(1) };
}

export function engineValuesPortToStarboard(
  values: readonly number[],
  enginePoints: readonly SceneVector3[],
  bodyCentre: SceneVector3,
  nose: SceneVector3,
): readonly number[] {
  const starboard = pitchAxisOf(nose);
  const length = Math.hypot(starboard[0], starboard[2]) || 1;
  const sx = starboard[0] / length;
  const sz = starboard[2] / length;
  return (
    enginePoints
      .map((point, index) => ({
        index,
        lateral:
          (point[0] - bodyCentre[0]) * sx + (point[2] - bodyCentre[2]) * sz,
      }))
      // Port is negative on the starboard axis, so ascending means L → R.
      .sort((a, b) => a.lateral - b.lateral || a.index - b.index)
      .map(({ index }) => values[index] ?? 0)
  );
}

export interface OarStrokePose {
  /** -1 is the forward catch, +1 is the end of the power stroke. */
  readonly sweep: number;
  /** Negative immerses the blade; positive lifts it for the recovery. */
  readonly lift: number;
  /** 0 keeps the blade square; 1 feathers it through the air. */
  readonly feather: number;
}

/** The visual drive can never outrun or lag behind its delivered command. */
export function advanceDrivePhase(
  phase: number,
  phaseSpeed: number,
  deliveredThrottle: number,
  seconds: number,
): number {
  return phase + phaseSpeed * deliveredThrottle * seconds;
}

/** The berth run-up follows the first leg: a backing route must spool astern. */
export function vehicleSpoolCommand(
  plan: VehicleRoutePlan,
  elapsedSeconds: number,
  spoolSeconds: number,
): number {
  const direction = plan.travelDirection?.(0) ?? 1;
  return (
    direction *
    0.42 *
    Math.min(1, Math.max(0, elapsedSeconds) / Math.max(0.001, spoolSeconds))
  );
}

/**
 * One honest rowing cycle. The loaded pull occupies more of the cycle than
 * the light recovery; both ends ease into the oarlock instead of snapping.
 */
export function oarStrokePose(phase: number): OarStrokePose {
  const turn = Math.PI * 2;
  const wrapped = ((phase % turn) + turn) % turn;
  const cycle = wrapped / turn;
  const powerShare = 0.62;
  if (cycle < powerShare) {
    const linear = cycle / powerShare;
    const eased = linear * linear * (3 - 2 * linear);
    return {
      sweep: -1 + 2 * eased,
      lift: -Math.sin(Math.PI * linear),
      feather: 0,
    };
  }
  const linear = (cycle - powerShare) / (1 - powerShare);
  const eased = linear * linear * (3 - 2 * linear);
  const arch = Math.sin(Math.PI * linear);
  return {
    sweep: 1 - 2 * eased,
    lift: arch,
    feather: arch,
  };
}

/**
 * Поворот кадра как кватернион: сперва рыскание вокруг мировой вертикали,
 * затем тангаж вокруг поперечной оси корабля, затем крен вокруг его носа —
 * обычная связка самолётных углов, только оси взяты у корпуса.
 */
export function vehicleRotation(
  pose: VehiclePose,
  nose: SceneVector3 = [-1, 0, 0],
): Quaternion {
  if (pose.rotation) {
    return pose.rotation;
  }
  if (pose.yaw === 0 && pose.pitch === 0 && pose.roll === 0) {
    return IDENTITY;
  }
  return multiplyQuaternions(
    multiplyQuaternions(
      aboutAxis([0, 1, 0], pose.yaw),
      aboutAxis(pitchAxisOf(nose), pose.pitch),
    ),
    aboutAxis(nose, pose.roll),
  );
}

export function rotateVector(
  rotation: Quaternion,
  vector: SceneVector3,
): SceneVector3 {
  const [qx, qy, qz, qw] = rotation;
  const [vx, vy, vz] = vector;
  // t = 2 · (q_vec × v); v' = v + q_w · t + q_vec × t
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);
  return [
    vx + qw * tx + qy * tz - qz * ty,
    vy + qw * ty + qz * tx - qx * tz,
    vz + qw * tz + qx * ty - qy * tx,
  ];
}

/** Мировое положение куска при данной позе кадра. */
export function vehiclePiecePosition(
  origin: SceneVector3,
  piecePosition: SceneVector3,
  pose: VehiclePose,
  rotation: Quaternion = vehicleRotation(pose),
): SceneVector3 {
  const local: SceneVector3 = [
    piecePosition[0] - origin[0],
    piecePosition[1] - origin[1],
    piecePosition[2] - origin[2],
  ];
  const turned = rotateVector(rotation, local);
  return [
    origin[0] + turned[0] + pose.position[0],
    origin[1] + turned[1] + pose.position[1],
    origin[2] + turned[2] + pose.position[2],
  ];
}

export interface VehicleMooringState {
  /** Фактическая мировая позиция носового узла. */
  readonly point: SceneVector3;
  /** Смещение узла от его авторской точки захвата в berth pose. */
  readonly offset: SceneVector3;
  /** Мировая скорость узла с учётом вращения корпуса. */
  readonly velocity: SceneVector3;
}

/**
 * Measured nose-capture state. Ground contact is intentionally absent: a
 * vehicle may land anywhere, but it is moored only when this point reaches
 * the authored berth capture.
 */
export function vehicleMooringState(
  frame: Pick<VehicleFrameDefinition, "mooringPoint">,
  bodyOffset: SceneVector3,
  orientation: Quaternion,
  linearVelocity: SceneVector3,
  angularVelocity: SceneVector3,
  bodyCentre: SceneVector3,
): VehicleMooringState {
  const arm = rotateVector(orientation, [
    frame.mooringPoint[0] - bodyCentre[0],
    frame.mooringPoint[1] - bodyCentre[1],
    frame.mooringPoint[2] - bodyCentre[2],
  ]);
  const point: SceneVector3 = [
    bodyCentre[0] + bodyOffset[0] + arm[0],
    bodyCentre[1] + bodyOffset[1] + arm[1],
    bodyCentre[2] + bodyOffset[2] + arm[2],
  ];
  const rotationalVelocity: SceneVector3 = [
    angularVelocity[1] * arm[2] - angularVelocity[2] * arm[1],
    angularVelocity[2] * arm[0] - angularVelocity[0] * arm[2],
    angularVelocity[0] * arm[1] - angularVelocity[1] * arm[0],
  ];
  return {
    point,
    offset: [
      point[0] - frame.mooringPoint[0],
      point[1] - frame.mooringPoint[1],
      point[2] - frame.mooringPoint[2],
    ],
    velocity: [
      linearVelocity[0] + rotationalVelocity[0],
      linearVelocity[1] + rotationalVelocity[1],
      linearVelocity[2] + rotationalVelocity[2],
    ],
  };
}

/** Inverse frame transform used by authored systems attached to a vehicle. */
export function shipLocalPoint(
  point: SceneVector3,
  origin: SceneVector3,
  pose: VehiclePose,
  nose: SceneVector3 = [-1, 0, 0],
): SceneVector3 {
  const rotation = vehicleRotation(pose, nose);
  const inverse: Quaternion = [
    -rotation[0],
    -rotation[1],
    -rotation[2],
    rotation[3],
  ];
  const turned = rotateVector(inverse, [
    point[0] - origin[0] - pose.position[0],
    point[1] - origin[1] - pose.position[1],
    point[2] - origin[2] - pose.position[2],
  ]);
  return [origin[0] + turned[0], origin[1] + turned[1], origin[2] + turned[2]];
}

function clamp01(value: number): number {
  return value <= 0 ? 0 : value >= 1 ? 1 : value;
}

function clampSigned(value: number): number {
  return value <= -1 ? -1 : value >= 1 ? 1 : value;
}

/**
 * Фазы рейса по времени — только для того, что физика знать не может:
 * когда отдать концы и когда считать швартовку состоявшейся.
 */
export const SKY_TRAIN_FLIGHT = {
  /** Раскрутка винтов на месте. */
  spool: 5,
  /** Отрыв: корабль всплывает выше навеса, ещё не трогаясь. */
  unstick: 6,
} as const;

export const SKY_TRAIN_CASTOFF_TIME = SKY_TRAIN_FLIGHT.spool;

/**
 * Перронные огни отправления. Пока корабль стоит — их нет. Отсчёт
 * отшвартовки они отмигивают, весь рейс горят ровно и гаснут, когда корабль
 * встал в посадочное положение: перрон снова людской.
 */
export const DEPARTURE_LIGHT = {
  /** Яркость свечения стекла: заметно ярче обычного сигнального. */
  glow: 5.2,
  /** Период мигания на отсчёте, с, и какую его долю огонь горит. */
  blinkPeriod: 0.5,
  blinkDuty: 0.55,
} as const;

export interface SkyTrainFlightLifecycle {
  readonly kind: SkyTrainFlightKind;
  readonly time: number;
  readonly castOff: boolean;
  readonly progress: number;
}

/** One journey state drives doors, boards, platform lamps and signals. */
export function skyTrainFlightEventState(
  flight: SkyTrainFlightLifecycle | null,
  recovery: Pick<VehicleRecoveryLifecycle, "phase"> | null = null,
): LampEventState {
  if (recovery) {
    return recovery.phase === "arrival" ? "approach" : "failed";
  }
  if (!flight) {
    return "docked";
  }
  if (!flight.castOff || flight.time < SKY_TRAIN_CASTOFF_TIME) {
    return "attention";
  }
  return skyTrainRoutePhase(flight.kind, flight.progress);
}

export function departureLightGlow(
  state: LampEventState,
  elapsedSeconds = 0,
): number {
  if (state === "docked") {
    return 0;
  }
  if (state === "attention") {
    const phase =
      (elapsedSeconds % DEPARTURE_LIGHT.blinkPeriod) /
      DEPARTURE_LIGHT.blinkPeriod;
    return phase < DEPARTURE_LIGHT.blinkDuty ? DEPARTURE_LIGHT.glow : 0;
  }
  // Не гасим огни только потому, что корабль оказался рядом с причалом:
  // физическая швартовка ещё может продолжаться. Они погаснут в тот же кадр,
  // когда рейс завершится и дверь станет доступна.
  return DEPARTURE_LIGHT.glow;
}
export const SKY_TRAIN_UNDERWAY_TIME =
  SKY_TRAIN_FLIGHT.spool + SKY_TRAIN_FLIGHT.unstick;

/**
 * Точка упреждения. Слишком близкая заставляет машину рыскать, слишком
 * далёкая — срезать повороты; для этих скоростей и радиусов вышло примерно
 * сорок метров.
 */
/** Крейсерская дальность упреждения вдоль линии, м. */
export const ROUTE_LOOKAHEAD = 52;

/**
 * За сколько секунд машина с векторной тягой ВЫРАВНИВАЕТ нос по курсу, если
 * власти хватает. Не «как быстро она может», а «как быстро ей стоит»: нос
 * идёт к курсу спокойно, а положение всё это время держит боковая тяга.
 * Меньше — дёрганый нос без выигрыша в траектории; больше — машина заметно
 * долго летит боком там, где могла бы уже смотреть вперёд.
 */
export const HEADING_ALIGN_SECONDS = 2.2;

/**
 * Ширина коридора трассы, метры. Снос штатен — трасса для машины с векторной
 * тягой ориентир, а не рельс, — но за пределами коридора упреждение носа
 * сворачивается: иначе снос и упреждение начинают накручивать друг друга.
 */
export const ROUTE_CORRIDOR = 18;

/**
 * Длина участка линии, который счётчик хода просматривает вперёд у МАНЁВРЕННОЙ
 * машины, метры. Берётся от геометрии разворота, а не от скорости: смысл окна
 * в том, чтобы шпилька помещалась в него целиком и срезанный разворот
 * засчитывался. Крейсерским судам это окно не выдаётся: они разворот не
 * срезают, а поблажка уводит их счётчик вперёд машины.
 */
export const PROGRESS_SEARCH_ARC = 40;

/**
 * Насколько близко к линии обязана быть машина, чтобы ей засчитали кусок
 * маршрута, который она срезала, метры. Взято от геометрии разворота: его
 * плечи проходят в паре метров друг от друга.
 */
export const PROGRESS_JUMP_PROXIMITY = 6;
/**
 * На посадочной прямой цель должна быть ближе: так корабль захватывает створ
 * до вокзала, а не идёт параллельно ему до последних метров.
 */
export const APPROACH_LOOKAHEAD = 30;

/**
 * Ход по маршруту — это ПРОЕКЦИЯ корабля на линию, а не таймер и не
 * пройденный путь: так рейс не может «закончиться», пока машина ещё за сто
 * метров, и не застревает, если её снесло с разметки.
 */
export function advanceRouteProgress(
  kind: SkyTrainFlightKind,
  progress: number,
  berth: SceneVector3,
  centre: SceneVector3,
  travelled: number,
): number {
  return advanceVehicleRouteProgress(
    flightPlan(kind, berth),
    progress,
    centre,
    travelled,
  );
}

export function advanceVehicleRouteProgress(
  plan: VehicleRoutePlan,
  progress: number,
  centre: SceneVector3,
  travelled: number,
  /**
   * Куда машина ИДЁТ, в осях мира. Нужен, чтобы отличить пройденный разворот
   * от разворота, к которому машина только подлетает: у обоих плечи проходят
   * рядом, и по одному расстоянию они неразличимы. Без этого довода срезанный
   * разворот не засчитывается вовсе — как было раньше.
   */
  course?: readonly [number, number],
  /**
   * Длина участка, на котором машине позволено засчитать СРЕЗАННЫЙ разворот,
   * метры. Ноль — счётчик идёт строго по пройденному, как у крейсерского
   * судна: оно разворот не срезает, и поблажка ему только вредит. Ненулевое
   * значение — привилегия манёвренной машины, которая честно проходит излом
   * мимо кончика.
   */
  turnBackArc = 0,
): number {
  // СЧЁТЧИК ОБЯЗАН УВИДЕТЬ СОСТОЯВШИЙСЯ РАЗВОРОТ.
  //
  // Срезать шпильку машине не запрещено — так и ведёт себя пилот, которому
  // важен не кончик разворота, а то, что он пройден. Но окно поиска шириной
  // в несколько метров смотрело только на ближайшее продолжение линии: у
  // разворота оба плеча идут рядом, машина оказывалась уже на обратном, а
  // окно всё ещё упиралось в несделанный кончик. Ход не засчитывался ни
  // вперёд (мешал кончик), ни назад (счётчик не умеет) — и застревал
  // навсегда: в замере аккуратная петля 7 м/с вокруг одной точки, прогресс
  // намертво 0.823, ни одного отказа.
  //
  // Окно поэтому всегда покрывает участок, на котором разворот помещается
  // целиком. Пропустить больше него счётчик по-прежнему не может: за раз
  // засчитывается не больше этого куска линии, и «срезать» половину рейса
  // машине это не даёт.
  // ОКНО ПОИСКА — ДОЛЯ РЕЙСА, И ЭТО ПРОВЕРЕНО ЗАМЕРОМ.
  //
  // Пол 0.02 выглядит подозрительно: на городском перегоне в 110 м это два
  // метра, а на круге полигона в 1408 м — двадцать восемь, то есть счётчику
  // позволено перепрыгнуть за кадр почти тридцать метров линии. Я счёл это
  // ошибкой масштаба и заменил долю метрами.
  //
  // ЗАМЕР СКАЗАЛ ОБРАТНОЕ: с двухметровым полом перестали садиться СЕМЬ машин
  // разом — дирижабль на мачте (в том числе с потерянными лопастями), дракар
  // на туре, охотник в дуэли. Широкое окно на длинной трассе не подарок, а
  // условие работы: счётчик обязан успевать за машиной, которая режет углы, и
  // отставший счётчик кончается тем же, чем убежавший, — машина гонится за
  // точкой, которой рядом нет.
  //
  // Оставлено как было. Запись здесь затем, чтобы следующий не переделывал
  // это второй раз: подозрительное число оказалось несущим.
  const stepWindow = Math.max(0.02, (travelled / plan.length) * 8);
  const window = Math.max(
    // Доля рейса — вторая граница того же окна: сорок метров это разворот на
    // трёхсотметровом круге и заметный кусок короткого перегона.
    Math.min(turnBackArc / plan.length, 0.12),
    stepWindow,
  );
  // Обычный ход ищется СВОЕЙ точностью. Растянуть один и тот же проход на всё
  // широкое окно нельзя: шаг выборки грубеет с трети метра до метра, прогресс
  // начинает убегать вперёд, профиль скорости кончается раньше машины — и она
  // доползает к причалу последние метры вместо того, чтобы прийти.
  const scan = (from: number, to: number, samples: number) => {
    let at = progress;
    let best = Number.POSITIVE_INFINITY;
    for (let step = 0; step <= samples; step += 1) {
      const s = Math.max(0, Math.min(1, from + ((to - from) * step) / samples));
      const point = plan.point(s);
      const distance = Math.hypot(point[0] - centre[0], point[2] - centre[2]);
      if (distance < best) {
        best = distance;
        at = s;
      }
    }
    return { at, best };
  };
  const stepScan = scan(progress - 0.004, progress + stepWindow, 24);
  const wideScan = scan(progress - 0.004, progress + window, 48);
  const nearest = wideScan.at;
  const bestDistance = wideScan.best;
  const nearestInStep = stepScan.at;
  // Обычный ход засчитывается по пройденному за шаг. Скачок дальше него — это
  // заявка «разворот уже позади», и принимается она по двум признакам сразу:
  // машина ДЕЙСТВИТЕЛЬНО стоит у той точки, и участок между ними действительно
  // завёрнут назад. Одной близости мало: плавная трасса тоже проходит рядом
  // сама с собой, и по одной близости патрульная машина «доходила» до причала
  // за десятки метров до него, а остаток ползла по кончившемуся профилю
  // скорости — в прогоне последние восемь метров занимали четырнадцать секунд.
  const jumped = nearest > progress + stepWindow;
  if (!jumped) {
    return Math.max(progress, nearest);
  }
  const tangentAt = (at: number): readonly [number, number] => {
    const span = Math.min(0.004, 2 / plan.length);
    const back = plan.point(Math.max(0, at - span));
    const ahead = plan.point(Math.min(1, at + span));
    const dx = ahead[0] - back[0];
    const dz = ahead[2] - back[2];
    const length = Math.hypot(dx, dz) || 1;
    return [dx / length, dz / length];
  };
  const here = tangentAt(progress);
  const there = tangentAt(nearest);
  const turnedBack = here[0] * there[0] + here[1] * there[1] < -0.2;
  // Машина обязана УЖЕ ИДТИ по тому плечу, которое просит себе засчитать.
  // Патрульная трасса разворачивается так же круто, как кольцевая, и её плечи
  // проходят так же близко: без этого довода машина, только подлетающая к
  // концу патруля, получала бы ход за обратное плечо и не доходила до цели.
  const goingThere =
    course !== undefined &&
    course[0] * there[0] + course[1] * there[1] > 0.3;
  return Math.max(
    progress,
    turnedBack && goingThere && bestDistance <= PROGRESS_JUMP_PROXIMITY
      ? nearest
      : nearestInStep,
  );
}

/** The route has handed navigation to its hover-and-land final manoeuvre. */
export function vehicleVerticalArrivalActive(
  plan: VehicleRoutePlan,
  progress: number,
): boolean {
  return Boolean(plan.verticalArrival && progress >= plan.verticalArrival.from);
}

/** The berth has been captured in plan and the route now owns a descent. */
export function vehicleVerticalArrivalCaptured(
  plan: VehicleRoutePlan,
  progress: number,
  centre: SceneVector3,
): boolean {
  const arrival = plan.verticalArrival;
  if (!arrival || !vehicleVerticalArrivalActive(plan, progress)) {
    return false;
  }
  const berth = plan.point(1);
  const horizontal = Math.hypot(centre[0] - berth[0], centre[2] - berth[2]);
  if (horizontal <= arrival.horizontalTolerance) {
    return true;
  }
  // ПОЛКА — ЭТО ПОРОГ, А НЕ ТОЧКА ВОЗВРАТА.
  //
  // Захват считался ЗАНОВО каждый кадр по одному расстоянию, и допуск у него
  // в десятки сантиметров (0.85 м у VX-8). Машина, уже снижающаяся над
  // площадкой, снесённая на метр, теряла захват — и получала приказ вернуться
  // на полку в четырнадцать метров. Сама себе отменяла посадку, а таймер
  // швартовки шёл: «Корабль не успел стабилизироваться у причала».
  //
  // Замер на стенде: машина, поставленная в метре над причалом и в 1.8 м вбок,
  // сходилась по горизонтали до 0.72 м — и одновременно набирала 14 м, после
  // чего уходила совсем.
  //
  // Гистерезис берётся ВЫСОТОЙ, а не памятью: функция чистая и прошлого не
  // помнит, но машина НИЖЕ полки могла попасть туда единственным способом —
  // снижаясь, то есть будучи однажды захваченной. Полка своё уже отработала,
  // и звать её обратно значит отменять состоявшуюся посадку.
  //
  // Радиус отпускания втрое шире радиуса захвата: захват остаётся точным, а
  // терять его машина начинает только по-настоящему уйдя с площадки.
  const RELEASE_FACTOR = 3;
  return (
    centre[1] < arrival.altitude - 0.5 &&
    horizontal <= arrival.horizontalTolerance * RELEASE_FACTOR
  );
}

/**
 * Height currently owned by route guidance.
 *
 * A vertical departure and the horizontal half of a vertical arrival fly a
 * clearance shelf instead of the sloping profile stored in `point()`. Every
 * consumer must judge the same height the autopilot is actually commanding;
 * otherwise correction tries to put a correctly held craft back onto the
 * obsolete glide below it.
 */
export function vehicleRouteAltitudeTarget(
  plan: VehicleRoutePlan,
  progress: number,
  centre: SceneVector3,
): number {
  const routeAltitude = plan.altitude(progress);
  const departure = plan.verticalDeparture;
  if (departure && progress < departure.until) {
    return Math.max(routeAltitude, departure.altitude);
  }
  const arrival = plan.verticalArrival;
  if (
    arrival &&
    progress >= arrival.from &&
    !vehicleVerticalArrivalCaptured(plan, progress, centre)
  ) {
    return Math.max(routeAltitude, arrival.altitude);
  }
  return routeAltitude;
}

/**
 * Reacquires the nearest feasible part of a route after a disturbance hold.
 * Unlike ordinary progress this may move a little backwards: a displaced
 * craft must fly the line it can actually reach, not chase a stale percentage.
 * The bounded window prevents one coincident loop crossing from skipping an
 * entire circuit.
 */
export function rejoinVehicleRouteProgress(
  plan: VehicleRoutePlan,
  progress: number,
  centre: SceneVector3,
  backwardWindow = 0.04,
  forwardWindow = 0.1,
): number {
  const from = Math.max(0, progress - Math.max(0, backwardWindow));
  const to = Math.min(1, progress + Math.max(0, forwardWindow));
  const verticalArrivalCaptured = vehicleVerticalArrivalCaptured(
    plan,
    progress,
    centre,
  );
  let nearest = progress;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let sample = 0; sample <= 64; sample += 1) {
    const candidate = from + ((to - from) * sample) / 64;
    const point = plan.point(candidate);
    // During the vertical branch, height cannot select a point behind the
    // craft on the obsolete glide. In the preceding shelf phase, compare
    // against the shelf the autopilot really holds, not `point().y`.
    const verticalDistance =
      verticalArrivalCaptured &&
      plan.verticalArrival &&
      candidate >= plan.verticalArrival.from
        ? 0
        : vehicleRouteAltitudeTarget(plan, candidate, centre) - centre[1];
    const distance = Math.hypot(
      point[0] - centre[0],
      verticalDistance,
      point[2] - centre[2],
    );
    if (distance < bestDistance) {
      bestDistance = distance;
      nearest = candidate;
    }
  }
  return nearest;
}

/** Desired horizontal nose direction at a route position, including sternway. */
export function vehicleRouteHeading(
  plan: VehicleRoutePlan,
  progress: number,
): readonly [number, number] {
  const sample = Math.max(0.001, Math.min(0.012, 5 / Math.max(1, plan.length)));
  const before = plan.point(Math.max(0, progress - sample));
  const after = plan.point(Math.min(1, progress + sample));
  const routeX = after[0] - before[0];
  const routeZ = after[2] - before[2];
  const routeLength = Math.hypot(routeX, routeZ) || 1;
  const travelDirection = plan.travelDirection?.(progress) ?? 1;
  return [
    (routeX / routeLength) * travelDirection,
    (routeZ / routeLength) * travelDirection,
  ];
}

/**
 * Швартовка: трос дотягивается только вблизи и тянет с ограниченной силой.
 * Без обоих ограничений «пружина к причалу» на дальней стороне круга
 * разгоняла бы корабль до сотен метров в секунду.
 */
export const MOORING_REACH = 26;
/** Быстрее этого швартов корабль к причалу не потянет, м/с. */
export const MOORING_SPEED = 1.6;

/**
 * The winch may take the nose only from the authored approach side. Position
 * alone is insufficient: otherwise a craft that overshot the cup could be
 * pulled back by its nose and settle facing exactly backwards.
 */
export function isMooringCaptureEligible(
  captureOffset: SceneVector3,
  orientation: Quaternion,
  nose: SceneVector3 = [-1, 0, 0],
  approach: ApproachGate = SKY_TRAIN_APPROACH,
  reach = MOORING_REACH,
): boolean {
  const forward = rotateVector(orientation, nose);
  const flat = Math.hypot(forward[0], forward[2]) || 1;
  const alignment =
    (forward[0] * approach.heading[0] + forward[2] * approach.heading[1]) /
    flat;
  return (
    Math.hypot(captureOffset[0], captureOffset[2]) <= reach &&
    alignment >= Math.cos(approach.tolerance.heading)
  );
}

/**
 * Швартовка — это ЛЕБЁДКА, а не пружина: она выбирает слабину с ограниченной
 * скоростью и придерживает корабль, когда тот идёт быстрее. Пружина с
 * ограничением по силе вела себя иначе и неправильно: у причала ограничитель
 * срезал вектор целиком — вместе с демпфером, — и швартов разгонял махину до
 * шести метров в секунду, а потом качал её вокруг причала.
 */
export function mooringForce(
  offset: SceneVector3,
  velocity: SceneVector3,
  mass: number,
  reach = MOORING_REACH,
): SceneVector3 {
  const distance = Math.hypot(offset[0], offset[2]);
  if (distance > reach || distance < 1e-4) {
    return [0, 0, 0];
  }
  // Подходим тем медленнее, чем ближе: у самого причала скорость сходит в нуль.
  const closing = Math.min(MOORING_SPEED, distance * 0.25);
  const wanted: SceneVector3 = [
    (-offset[0] / distance) * closing,
    0,
    (-offset[2] / distance) * closing,
  ];
  // Сервопривод по скорости: тянет, если отстаём, и держит, если разогнались.
  const gain = 0.6;
  const pull: SceneVector3 = [
    mass * (wanted[0] - velocity[0]) * gain,
    0,
    mass * (wanted[2] - velocity[2]) * gain,
  ];
  const limit = 0.35 * mass * 9.81;
  const magnitude = Math.hypot(pull[0], pull[2]);
  if (magnitude <= limit) {
    return pull;
  }
  const scale = limit / magnitude;
  return [pull[0] * scale, 0, pull[2] * scale];
}

/**
 * ПАСПОРТ МАШИНЫ. Что она физически может: тяга каждого мотора, сила на
 * оперении, пределы дифферентовки подъёма и точки приложения всего этого.
 */
export interface ShipLimits {
  /** Тяга ОДНОГО мотора, Н. */
  readonly enginePower: number;
  /** Точки моторов в авторских координатах. */
  readonly enginePoints: readonly SceneVector3[];
  /** Relative maximum lift of each rotor; omitted means equal motors. */
  readonly rotorCapacityWeights?: readonly number[];
  /**
   * ДОЛЯ ТЯГИ ПОДЪЁМНЫХ ДВИГАТЕЛЕЙ В РЕВЕРСЕ, 0…1. Нет поля — машина толкает
   * только в одну сторону, как было.
   *
   * Вердикт Igor (12.08.2026): у всевекторной машины отсутствие реверса —
   * недосмотр. Без него ускорение вниз ровно одно, тяжесть, а перевёрнутая
   * машина вжимается в грунт вместо того, чтобы встать.
   *
   * Доля меньше единицы: канал рассчитан на один поток, назад вентилятор
   * работает хуже. Цена перехода моделью уже учтена — реверсивная раскрутка
   * проживает ноль целиком.
   */
  readonly rotorReverseShare?: number;
  /** Reaction-torque sign of each rotor; omitted keeps legacy alternation. */
  readonly rotorSpinDirections?: readonly (-1 | 1)[];
  /**
   * ОТДЕЛЬНЫЕ ДВИЖИТЕЛИ РЫСКАНИЯ, если они у машины есть.
   *
   * Обычному мультиротору курс даёт только реактивный момент винтов, и он слаб
   * по построению. Машина, от которой требуется резкий разворот вокруг оси,
   * получает для этого настоящий орган: реверсивные вентиляторы, вынесенные от
   * центра масс. Они канал НЕ ЗАМЕНЯЮТ — реактивный момент продолжает нести
   * свою долю, а их потеря лишь сужает располагаемый диапазон.
   *
   * Порядок этого списка — порядок каналов `yaw-throttle:<номер>`.
   */
  readonly yawThrusters?: readonly RotorcraftYawThruster[];
  /**
   * Боковая сила на оперении при опорной скорости. Перо руля работает
   * скоростным напором: сила падает как квадрат скорости, и на подходе, когда
   * корабль почти стоит, руля у него практически нет — доворачивать надо
   * моторами. Ровно так это и устроено на настоящих судах.
   */
  readonly maxRudderForce: number;
  readonly rudderReferenceSpeed: number;
  readonly rudderPoint: SceneVector3;
  /** Пределы дифферентовки подъёма: ±доля веса. */
  readonly liftTrimRange: number;
  /**
   * БОКОВАЯ ТЯГА одного движителя, Н. Ноль (или отсутствие) означает машину,
   * которая едет только туда, куда смотрит нос: дирижабль, драккар, состав.
   *
   * Ненулевая появляется у машины с векторируемыми движителями — кольцо в
   * кардане наклоняется не только вперёд-назад. Такая машина ГОЛОНОМНА: она
   * может сместиться вбок, не разворачиваясь, и автопилот обязан этим
   * пользоваться, а не превращать боковую ошибку в команду рыскания.
   */
  readonly lateralThrust?: number;
}

export const SKY_TRAIN_LIMITS: ShipLimits = {
  // Машина тяжёлая и тихоходная: полная тяга на её массу даёт разгон в
  // десятые доли g — ровно то, что имелось в виду под «с каким моментом
  // такая махина способна двигаться».
  // Пересчитано вместе с массой: дифферентовочные тележки — настоящие 36 кг
  // внутри оболочки, и тяга поднята ровно на их долю, чтобы располагаемое
  // ускорение осталось авторским. Оперение при этом НЕ трогали: тележки стоят
  // на самом центре масс, момент инерции по рысканию вырос на 0.05%, и
  // масштабировать руль по массе значило бы подарить машине лишнюю
  // управляемость на заходе.
  enginePower: 504,
  enginePoints: [
    [5.6, 7.6, 73.0],
    [5.6, 7.6, 82.2],
  ],
  /**
   * Оперение. Замерено по машине: при её моменте инерции и сопротивлении
   * такая сила даёт установившийся разворот около 0.3 рад/с — втрое больше
   * потребного для собственного круга, и это правильный запас. Стояло 900 Н,
   * то есть авторитет был завышен ВОСЕМЬКРАТНО: любая ошибка выбирала руль до
   * упора, и корабль вилял хвостом, почти не продвигаясь.
   */
  maxRudderForce: 300,
  /** Скорость, на которой оперение развивает полную силу — её крейсерская. */
  rudderReferenceSpeed: 7,
  rudderPoint: [19.5, 9.4, 77.6],
  liftTrimRange: 0.12,
};

/**
 * РЫЧАГИ. Положение органов управления — и всё; ни маршрута, ни решений тут
 * нет. Автоматика их двигает сейчас, игрок будет двигать потом: логика ниже
 * по течению от этого места не изменится.
 */
export interface ShipControls {
  /** Тяга каждого мотора, −1..1. Разные знаки дают разворот почти на месте. */
  readonly throttle: readonly number[];
  /** Руль, −1..1. */
  readonly rudder: number;
  /**
   * Боковая тяга, −1..1, плюс — на правый борт. У неголономной машины это
   * поле не задаётся вовсе: сдвинуться вбок ей нечем.
   */
  readonly sway?: number;
  /** Дифферентовка подъёма, −1..1 от предела. */
  readonly liftTrim: number;
}

export const IDLE_CONTROLS: ShipControls = {
  throttle: [0, 0],
  rudder: 0,
  liftTrim: 0,
};

export interface ForceAtPoint {
  readonly force: SceneVector3;
  readonly point: SceneVector3;
}

/**
 * МАШИНА. Превращает положение рычагов в силы. Никаких решений: сколько дали,
 * столько и тянет. Моторы разнесены по бортам, поэтому разная тяга сама даёт
 * разворот, а потерянный мотор сам даёт увод.
 */
/**
 * Доля силы оперения, доступная на этом ходу: скоростной напор ∝ v².
 * На малом ходу руля почти нет — и это не условность, а то, почему
 * причаливают моторами и швартовами, а не рулём.
 */
export function rudderEffectiveness(speed: number, limits: ShipLimits): number {
  const ratio = speed / Math.max(0.1, limits.rudderReferenceSpeed);
  return Math.max(0, Math.min(1, ratio * ratio));
}

export function shipForces(
  controls: ShipControls,
  centre: SceneVector3,
  /**
   * Центр масс в АВТОРСКИХ координатах: плечи считаются от него. Если брать
   * текущий мировой центр, на дальней стороне круга плечо станет в сотню
   * метров и корабль кувыркнётся от собственной тяги.
   */
  bodyCentre: SceneVector3,
  orientation: Quaternion,
  limits: ShipLimits,
  nose: SceneVector3,
  /** Путевая скорость: от неё зависит, сколько силы даёт оперение. */
  groundSpeed = limits.rudderReferenceSpeed,
): readonly ForceAtPoint[] {
  const forward = rotateVector(orientation, nose);
  const flatLength = Math.hypot(forward[0], forward[2]) || 1;
  const heading: readonly [number, number] = [
    forward[0] / flatLength,
    forward[2] / flatLength,
  ];

  const place = (point: SceneVector3): SceneVector3 => {
    const arm = rotateVector(orientation, [
      point[0] - bodyCentre[0],
      point[1] - bodyCentre[1],
      point[2] - bodyCentre[2],
    ]);
    return [centre[0] + arm[0], centre[1] + arm[1], centre[2] + arm[2]];
  };

  // Боковая составляющая раскладывается по ТЕМ ЖЕ точкам: у машины с
  // векторируемыми кольцами вбок толкает каждое кольцо, а не выдуманный
  // подруливающий агрегат. Для симметричной раскладки суммарного момента
  // рыскания это не даёт; для несимметричной даёт, и это честно.
  const lateralPower =
    (limits.lateralThrust ?? 0) * clampSigned(controls.sway ?? 0);
  const starboard: readonly [number, number] = [-heading[1], heading[0]];
  const forces: ForceAtPoint[] = limits.enginePoints.map((point, index) => {
    const power =
      limits.enginePower * clampSigned(controls.throttle[index] ?? 0);
    return {
      force: [
        forward[0] * power + starboard[0] * lateralPower,
        forward[1] * power,
        forward[2] * power + starboard[1] * lateralPower,
      ],
      point: place(point),
    };
  });

  // Руль в корме: направление подобрано так, чтобы момент относительно центра
  // масс совпал по знаку с командой. Знак здесь дважды был перепутан, и одна
  // ошибка маскировала другую.
  const side =
    Math.max(-1, Math.min(1, controls.rudder)) *
    limits.maxRudderForce *
    rudderEffectiveness(groundSpeed, limits);
  const push: readonly [number, number, number] = [-heading[1], 0, heading[0]];
  forces.push({
    force: [push[0] * side, 0, push[2] * side],
    point: place(limits.rudderPoint),
  });

  return forces;
}

/**
 * МАРШРУТ. Линия, разрешённая скорость на участке и требуемая высота с
 * допуском. Больше в задании ничего нет — ни углов, ни качки.
 */
/**
 * ЧТО АВТОПИЛОТ ЗНАЕТ О МАШИНЕ. Не захардкожено в его коде, а передано ему:
 * масса, момент инерции по рысканию, сопротивление среды и паспорт органов
 * управления. По этим числам он и предсказывает, где окажется.
 */
export interface ShipModel {
  /**
   * Машина перемещается наклоном движителей, а не тягой вдоль носа.
   * Мультиротор — да; дирижабль с швартовыми подруливающими — нет.
   */
  readonly vectoredTranslation?: boolean;
  readonly mass: number;
  readonly inertiaYaw: number;
  /** Центр масс в тех же авторских координатах, что точки органов управления. */
  readonly bodyCentre: SceneVector3;
  /** Сопротивление ВДОЛЬ корпуса. */
  readonly dragLinear: number;
  /** Сопротивление ПОПЕРЁК корпуса — оно и заставляет судно идти носом. */
  readonly dragLateral: number;
  readonly dragAngular: number;
  readonly limits: ShipLimits;
  /** Authority estimated by autopilot from its previous request and delivery. */
  readonly engineAvailability?: readonly number[];
  /**
   * Directional yaw rates the machine controller can accept while preserving
   * its present thrust and attitude. Damage may make them asymmetric.
   */
  /**
   * Поворотливость машины: чем она способна вести вираж. Есть только у той,
   * у которой вопрос «успеет ли нос» вообще стоит.
   */
  readonly turnCapability?: RotorcraftTurnCapability;
  /** Допустимый занос. Не задан — общий по проекту. */
  readonly slipPolicy?: RotorcraftSlipPolicy;
  /** Срезка от обратной связи по фактическому заносу, 0…1. */
  readonly governorScale?: number;
  readonly yawRateLimits?: {
    readonly minimum: number;
    readonly maximum: number;
  };
}

/**
 * Autopilot control allocation for any number of longitudinal engines.
 *
 * Start from the common delivered thrust needed for speed, then make the
 * smallest possible per-engine correction that produces the requested yaw
 * moment inside each engine's actual authority. The result is a signed shaft
 * command; the actuator layer only executes it and never reallocates it.
 */
export function allocateAutopilotEngineCommands(
  commonThrust: number,
  targetYawMomentPerPower: number,
  yawArms: readonly number[],
  availability: readonly number[] = yawArms.map(() => 1),
): readonly number[] {
  const count = yawArms.length;
  const fractions = Array.from({ length: count }, (_, index) =>
    clamp01(availability[index] ?? 1),
  );
  const delivered = fractions.map((fraction) =>
    Math.max(-fraction, Math.min(fraction, clampSigned(commonThrust))),
  );
  const free = new Set(
    fractions
      .map((fraction, index) => (fraction > 1e-6 ? index : -1))
      .filter((index) => index >= 0),
  );

  for (let iteration = 0; iteration <= count; iteration += 1) {
    const currentMoment = delivered.reduce(
      (sum, value, index) => sum + value * (yawArms[index] ?? 0),
      0,
    );
    const residual = targetYawMomentPerPower - currentMoment;
    if (Math.abs(residual) < 1e-7 || free.size === 0) {
      break;
    }
    const denominator = [...free].reduce(
      (sum, index) => sum + (yawArms[index] ?? 0) ** 2,
      0,
    );
    if (denominator < 1e-9) {
      break;
    }
    const proposals = new Map<number, number>();
    const saturated: number[] = [];
    for (const index of free) {
      const proposal =
        delivered[index] + (residual * (yawArms[index] ?? 0)) / denominator;
      proposals.set(index, proposal);
      if (Math.abs(proposal) > fractions[index] + 1e-9) {
        saturated.push(index);
      }
    }
    if (saturated.length === 0) {
      for (const [index, proposal] of proposals) {
        delivered[index] = proposal;
      }
      break;
    }
    for (const index of saturated) {
      delivered[index] = Math.max(
        -fractions[index],
        Math.min(fractions[index], proposals.get(index) ?? delivered[index]),
      );
      free.delete(index);
    }
  }

  // The requested yaw moment is now fixed. Inside that solution space, move
  // total delivered thrust as close as possible to the speed controller's
  // request. Corrections are projected onto the null-space of the authored
  // yaw arms, so improving speed can never silently undo heading control.
  const targetTotal = Math.max(
    -fractions.reduce((sum, fraction) => sum + fraction, 0),
    Math.min(
      fractions.reduce((sum, fraction) => sum + fraction, 0),
      clampSigned(commonThrust) * count,
    ),
  );
  const totalFree = new Set(fractions.map((_, index) => index));
  for (let iteration = 0; iteration <= count; iteration += 1) {
    const residualTotal =
      targetTotal - delivered.reduce((sum, value) => sum + value, 0);
    if (Math.abs(residualTotal) < 1e-7 || totalFree.size < 2) {
      break;
    }
    const freeIndices = [...totalFree];
    const armSum = freeIndices.reduce(
      (sum, index) => sum + (yawArms[index] ?? 0),
      0,
    );
    const armSquared = freeIndices.reduce(
      (sum, index) => sum + (yawArms[index] ?? 0) ** 2,
      0,
    );
    const direction = new Map<number, number>();
    for (const index of freeIndices) {
      const arm = yawArms[index] ?? 0;
      direction.set(
        index,
        armSquared > 1e-9 ? 1 - (arm * armSum) / armSquared : 1,
      );
    }
    const totalDirection = freeIndices.reduce(
      (sum, index) => sum + (direction.get(index) ?? 0),
      0,
    );
    if (Math.abs(totalDirection) < 1e-9) {
      break;
    }
    const fullScale = residualTotal / totalDirection;
    let stepFraction = 1;
    const saturated: number[] = [];
    for (const index of freeIndices) {
      const delta = fullScale * (direction.get(index) ?? 0);
      if (Math.abs(delta) < 1e-12) {
        continue;
      }
      const room =
        delta > 0
          ? fractions[index] - delivered[index]
          : delivered[index] + fractions[index];
      stepFraction = Math.min(
        stepFraction,
        Math.max(0, room / Math.abs(delta)),
      );
    }
    const appliedScale = fullScale * stepFraction;
    for (const index of freeIndices) {
      delivered[index] += appliedScale * (direction.get(index) ?? 0);
      if (Math.abs(Math.abs(delivered[index]) - fractions[index]) < 1e-7) {
        saturated.push(index);
      }
    }
    if (stepFraction >= 1 - 1e-9) {
      break;
    }
    for (const index of saturated) {
      totalFree.delete(index);
    }
    if (saturated.length === 0) {
      break;
    }
  }

  return delivered.map((value, index) =>
    fractions[index] > 1e-6 ? clampSigned(value / fractions[index]) : 0,
  );
}

/**
 * Differential yaw authority that does not create unwanted net thrust.
 * Pairing the lowest and highest authored yaw arms keeps this generic for any
 * engine count and prevents one unusually strong shaft from masquerading as
 * extra turning authority by pushing the whole craft along the route.
 */
export function balancedEngineYawAuthority(
  yawArms: readonly number[],
  availability: readonly number[] = yawArms.map(() => 1),
): number {
  const channels = yawArms
    .map((arm, index) => ({
      arm,
      remaining: clamp01(availability[index] ?? 1),
    }))
    .sort((left, right) => left.arm - right.arm);
  let low = 0;
  let high = channels.length - 1;
  let moment = 0;
  while (low < high) {
    const transfer = Math.min(
      channels[low].remaining,
      channels[high].remaining,
    );
    if (transfer <= 1e-9) {
      if (channels[low].remaining <= 1e-9) {
        low += 1;
      }
      if (channels[high].remaining <= 1e-9) {
        high -= 1;
      }
      continue;
    }
    moment += transfer * (channels[high].arm - channels[low].arm);
    channels[low].remaining -= transfer;
    channels[high].remaining -= transfer;
  }
  return moment;
}

/**
 * Сопротивление корпуса. Оно АНИЗОТРОПНО, и без этого весь полёт был
 * неправильным: корабль разворачивал нос, а скорость шла прежним курсом —
 * он крабился боком и «въезжал в платформу лагом». Дирижабль поперёк себя
 * почти не движется: боковое сопротивление в разы больше продольного.
 */
export function hullDrag(
  velocity: SceneVector3,
  heading: readonly [number, number],
  model: ShipModel,
): SceneVector3 {
  const along = velocity[0] * heading[0] + velocity[2] * heading[1];
  const alongX = heading[0] * along;
  const alongZ = heading[1] * along;
  const crossX = velocity[0] - alongX;
  const crossZ = velocity[2] - alongZ;
  return [
    -model.dragLinear * alongX - model.dragLateral * crossX,
    -model.dragLinear * velocity[1],
    -model.dragLinear * alongZ - model.dragLateral * crossZ,
  ];
}

/**
 * ОКНО ЗАХВАТА. Прийти «в зону» мало: в неё надо прийти в определённом
 * положении — по месту, по курсу и по скорости. Не уложился — уходишь на
 * второй круг, как и положено при промахе на заходе.
 */
export interface ApproachGate {
  /** Требуемый курс на входе, единичный вектор в плане. */
  readonly heading: readonly [number, number];
  readonly tolerance: {
    readonly position: number;
    readonly heading: number;
    readonly speed: number;
  };
}

export const SKY_TRAIN_APPROACH: ApproachGate = {
  // Причал лежит вдоль пути, нос корабля в покое смотрит на −x.
  heading: [-1, 0],
  // Допуск по скорости согласован с профилем торможения: на входе в окно
  // машина идёт примерно sqrt(2·a·s), и требовать меньше — значит гарантировать
  // вечный второй круг.
  tolerance: { position: 6, heading: 0.35, speed: 4.5 },
};

/**
 * Эксплуатационный допуск швартовки. Это не математический ноль и не датчик
 * конкретной опоры: длинный мягкий корабль считается принятым, когда он
 * устойчиво находится в посадочной позе и уже не несёт заметной энергии.
 */
export const SKY_TRAIN_DOCKING = {
  position: 0.6,
  height: 0.25,
  headingCos: 0.99,
  speed: 0.2,
  verticalSpeed: 0.12,
  uprightCos: 0.99,
  angularSpeed: 0.035,
} as const;

export interface DockingTolerance {
  readonly position: number;
  readonly height: number;
  readonly headingCos: number;
  readonly speed: number;
  readonly verticalSpeed: number;
  readonly uprightCos: number;
  readonly angularSpeed: number;
}

/**
 * A vehicle enters the settling timeout only after its nose point has entered
 * the berth capture. This is deliberately wider than the completed mooring,
 * but excludes both the approach and any ground-landing manoeuvre.
 */
export function isDockingSettleWindow(
  progress: number,
  captureOffset: SceneVector3,
  orientation: Quaternion,
  nose: SceneVector3 = [-1, 0, 0],
  approach: ApproachGate = SKY_TRAIN_APPROACH,
  tolerance: DockingTolerance = SKY_TRAIN_DOCKING,
): boolean {
  if (progress <= 0.985) {
    return false;
  }
  const forward = rotateVector(orientation, nose);
  const up = rotateVector(orientation, [0, 1, 0]);
  const flat = Math.hypot(forward[0], forward[2]) || 1;
  const alignment =
    (forward[0] * approach.heading[0] + forward[2] * approach.heading[1]) /
    flat;
  // Start the failure timer only after the craft enters the actual capture
  // around its own completed-pose tolerance. A fixed 1.5 m circle started the
  // city's ten-second timer 10.57 s before its soft mooring reached 0.48 m,
  // so a healthy airship was declared failed half a second before docking.
  const capturePosition = tolerance.position * 1.75;
  return (
    Math.hypot(captureOffset[0], captureOffset[2]) < capturePosition &&
    Math.abs(captureOffset[1]) < Math.max(0.5, tolerance.height * 3) &&
    alignment > 0.97 &&
    up[1] > 0.97
  );
}

/**
 * Требование к захваченному носовому узлу, отдельно от маршрута и автопилота.
 * Никакого переноса в ноль здесь нет: функция только измеряет результат сил.
 */
/**
 * ЗАВЕРШАЮЩЕЕ СНИЖЕНИЕ. Пол — чтобы машина дошла, потолок — чтобы не ударилась,
 * мёртвая зона — чтобы уже севшая не давила себя в площадку.
 *
 * Числа выведены из допусков швартовки, а не подобраны: 0.3 м/с меньше самого
 * строгого допуска вертикальной скорости во флотилии (0.22 у дирижабля — но он
 * этой ветки не касается вовсе, а у винтокрылых минимум 0.5), поэтому машина,
 * идущая на полу, гейту не противоречит.
 */
const TERMINAL_DESCENT_FLOOR = 0.3;
const TERMINAL_DESCENT_CEILING = 1.2;
const TERMINAL_DESCENT_DEADBAND = 0.05;

export function isDockedPose(
  captureOffset: SceneVector3,
  orientation: Quaternion,
  captureVelocity: SceneVector3,
  angularVelocity: SceneVector3,
  nose: SceneVector3 = [-1, 0, 0],
  approach: ApproachGate = SKY_TRAIN_APPROACH,
  tolerance: DockingTolerance = SKY_TRAIN_DOCKING,
): boolean {
  const forward = rotateVector(orientation, nose);
  const up = rotateVector(orientation, [0, 1, 0]);
  const flat = Math.hypot(forward[0], forward[2]) || 1;
  const alignment =
    (forward[0] * approach.heading[0] + forward[2] * approach.heading[1]) /
    flat;
  return (
    Math.hypot(captureOffset[0], captureOffset[2]) < tolerance.position &&
    Math.abs(captureOffset[1]) < tolerance.height &&
    alignment > tolerance.headingCos &&
    Math.hypot(captureVelocity[0], captureVelocity[2]) < tolerance.speed &&
    Math.abs(captureVelocity[1]) < tolerance.verticalSpeed &&
    up[1] > tolerance.uprightCos &&
    Math.hypot(...angularVelocity) < tolerance.angularSpeed
  );
}

/**
 * Route completion is accepted only after the measured nose capture has
 * settled. A ground support hit is deliberately absent: landing on terrain
 * and mooring to a berth are separate physical events.
 */
export function isDockingComplete(
  progress: number,
  captureOffset: SceneVector3,
  orientation: Quaternion,
  captureVelocity: SceneVector3,
  angularVelocity: SceneVector3,
  nose: SceneVector3 = [-1, 0, 0],
  approach: ApproachGate = SKY_TRAIN_APPROACH,
  tolerance: DockingTolerance = SKY_TRAIN_DOCKING,
): boolean {
  return (
    progress > 0.985 &&
    isDockedPose(
      captureOffset,
      orientation,
      captureVelocity,
      angularVelocity,
      nose,
      approach,
      tolerance,
    )
  );
}

/**
 * Куда корабль придёт через `horizon` секунд, если ничего не менять. Считаем
 * плоскую модель — ход, снос и рыскание: этого хватает, чтобы вести машину
 * с упреждением, а не догонять собственную ошибку.
 */
export function predictShip(
  centre: SceneVector3,
  heading: readonly [number, number],
  velocity: SceneVector3,
  yawRate: number,
  controls: ShipControls,
  model: ShipModel,
  horizon: number,
  nose: SceneVector3 = [-1, 0, 0],
): { position: readonly [number, number]; heading: readonly [number, number] } {
  const steps = 8;
  const dt = horizon / steps;
  let x = centre[0];
  let z = centre[2];
  let vx = velocity[0];
  let vz = velocity[2];
  let hx = heading[0];
  let hz = heading[1];
  let omega = yawRate;
  const localNoseLength = Math.hypot(nose[0], nose[2]) || 1;
  const localNose: readonly [number, number] = [
    nose[0] / localNoseLength,
    nose[2] / localNoseLength,
  ];
  const yawArm = (
    point: SceneVector3,
    direction: readonly [number, number],
  ): number => {
    const rx = point[0] - model.bodyCentre[0];
    const rz = point[2] - model.bodyCentre[2];
    return rz * direction[0] - rx * direction[1];
  };
  const engineCommands = model.limits.enginePoints.map((_, index) =>
    clampSigned(controls.throttle[index] ?? 0),
  );
  const engineYawArms = model.limits.enginePoints.map((point) =>
    yawArm(point, localNose),
  );
  const thrust =
    model.limits.enginePower *
    engineCommands.reduce((sum, value) => sum + value, 0);
  const engineMoment =
    model.limits.enginePower *
    engineCommands.reduce(
      (sum, value, index) => sum + value * engineYawArms[index],
      0,
    );
  const rudderCommand = Math.max(-1, Math.min(1, controls.rudder));
  const localRudderDirection: readonly [number, number] = [
    -localNose[1],
    localNose[0],
  ];
  const rudderArm = yawArm(model.limits.rudderPoint, localRudderDirection);

  for (let step = 0; step < steps; step += 1) {
    const drag = hullDrag([vx, 0, vz], [hx, hz], model);
    const ax = (thrust * hx + drag[0]) / model.mass;
    const az = (thrust * hz + drag[2]) / model.mass;
    vx += ax * dt;
    vz += az * dt;
    x += vx * dt;
    z += vz * dt;
    // Перо руля слабеет вместе с ходом — предсказание обязано это учитывать,
    // иначе автопилот верит в доворот, которого на подходе уже не будет.
    const rudder =
      rudderCommand *
      model.limits.maxRudderForce *
      rudderEffectiveness(Math.hypot(vx, vz), model.limits);
    const moment =
      engineMoment + rudder * rudderArm - model.dragAngular * omega;
    omega += (moment / model.inertiaYaw) * dt;
    const turn = omega * dt;
    const nx = hx * Math.cos(turn) - hz * Math.sin(turn);
    const nz = hx * Math.sin(turn) + hz * Math.cos(turn);
    const length = Math.hypot(nx, nz) || 1;
    hx = nx / length;
    hz = nz / length;
  }
  return { position: [x, z], heading: [hx, hz] };
}

/**
 * Единое требование guidance. В нём нет ни моторов, ни руля, ни углов корпуса:
 * только желаемое движение в осях машины и вертикальный баланс сверх веса.
 */
export interface VehicleGuidanceDemand {
  /** Желаемая путевая скорость вдоль носа, м/с. */
  readonly forwardSpeed: number;
  /** Желаемая скорость на правый борт, м/с. */
  readonly lateralSpeed: number;
  /** Требуемая угловая скорость рыскания, рад/с. */
  readonly yawRate: number;
  /** Требуемая вертикальная сила сверх веса, доля веса. */
  readonly liftFraction: number;
  /** Ускорение, которого требует кривая, в мировых осях [x, y, z]. */
  readonly pathAcceleration?: readonly [number, number, number];
  /**
   * Машина в посадочном створе. Фазу знает автопилот, а ПОЛИТИКА фазы —
   * например, какой занос терпим — применяется автоматом управления: занос на
   * маршруте почти свободен, а на заходе зажат до створовых шести градусов.
   */
  readonly approachPhase?: boolean;
  /** Допуск заноса, выведенный из коридора участка, рад. */
  readonly slipAllowance?: number;
  /**
   * ЗАДАННАЯ ПОЗА и темп её вращения — требование фигуры высшего пилотажа.
   *
   * Их наличие переворачивает задачу автомата: обычно поза ВЫВОДИТСЯ из
   * желаемого ускорения, здесь она приходит сверху, а ускорение получается
   * само. Ни одна другая часть требования при этом не меняется — ход остаётся
   * ходом вдоль носа, просто нос может смотреть в зенит.
   */
  readonly attitude?: readonly [number, number, number, number] | null;
  readonly attitudeRate?: SceneVector3 | null;
}

/** Что общий автопилот доложил о себе. */
/**
 * Машина перемещается НАКЛОНОМ ДВИЖИТЕЛЕЙ, а не тягой вдоль носа.
 *
 * Это про мультиротор: диск винтов кренится и тянет машину в любую сторону,
 * поэтому направление хода у неё не связано с носом. Боковая тяга сама по
 * себе такого не означает — у дирижабля есть подруливающие, но они швартовые,
 * а летит он носом вперёд, и вести его вектором значит ломать ему рейс.
 */
export interface AutopilotOutput {
  /** Корабельный контроллер: совместимый выход для плавучих машин. */
  readonly controls: ShipControls;
  /** Угловая скорость, которую корабельный контроллер реально запросил. */
  readonly desiredYawRate: number;
  /** Заход не сложился: в окно захвата не попадаем, идём на второй круг. */
  readonly goAround: boolean;
  /** Нейтральное требование, которое каждый вид машины исполняет сам. */
  readonly guidance: VehicleGuidanceDemand;
  /**
   * Куда автомат хочет нос, в осях мира. Отдаётся наружу именно потому, что
   * по поведению машины это неразличимо: нос, стоящий поперёк курса, может
   * означать и «прошу, но нечем повернуть», и «именно этого и прошу».
   */
  readonly headingTarget: readonly [number, number];
}

function shipControlsForGuidance(
  guidance: VehicleGuidanceDemand,
  heading: readonly [number, number],
  groundSpeed: number,
  velocity: SceneVector3,
  angularVelocity: SceneVector3,
  model: ShipModel,
  nose: SceneVector3,
  braking: number,
  allowFullReverse: boolean,
): { readonly controls: ShipControls; readonly desiredYawRate: number } {
  const limits = model.limits;
  const localNoseLength = Math.hypot(nose[0], nose[2]) || 1;
  const localNose: readonly [number, number] = [
    nose[0] / localNoseLength,
    nose[2] / localNoseLength,
  ];
  const yawArm = (
    point: SceneVector3,
    direction: readonly [number, number],
  ): number => {
    const rx = point[0] - model.bodyCentre[0];
    const rz = point[2] - model.bodyCentre[2];
    return rz * direction[0] - rx * direction[1];
  };
  const rudderDirection: readonly [number, number] = [
    -localNose[1],
    localNose[0],
  ];
  const rudderArm = Math.abs(yawArm(limits.rudderPoint, rudderDirection));
  const engineYawArms = limits.enginePoints.map((point) =>
    yawArm(point, localNose),
  );
  const rudderAuthority = rudderEffectiveness(groundSpeed, limits);
  const rudderCapacity =
    limits.maxRudderForce * rudderAuthority * rudderArm;
  const engineYawCapacity =
    limits.enginePower *
    balancedEngineYawAuthority(engineYawArms, model.engineAvailability);
  const holdableYawRate =
    (rudderCapacity + engineYawCapacity) / Math.max(1, model.dragAngular);
  const desiredYawRate = Math.max(
    -holdableYawRate,
    Math.min(holdableYawRate, guidance.yawRate),
  );
  const wantedYawAcceleration =
    (desiredYawRate - angularVelocity[1]) / 3;
  const wantedYawMoment =
    model.dragAngular * desiredYawRate +
    model.inertiaYaw * wantedYawAcceleration;
  const rudderMoment = Math.max(
    -rudderCapacity,
    Math.min(rudderCapacity, wantedYawMoment),
  );
  const signedRudderCapacity =
    limits.maxRudderForce *
    rudderAuthority *
    yawArm(limits.rudderPoint, rudderDirection);
  const rudder =
    Math.abs(signedRudderCapacity) > 1e-6
      ? rudderMoment / signedRudderCapacity
      : 0;
  const speedAlong = velocity[0] * heading[0] + velocity[2] * heading[1];
  const base = Math.max(
    allowFullReverse ? -1 : -0.45,
    Math.min(
      1,
      (guidance.forwardSpeed - speedAlong - braking * 0.15) * 0.22,
    ),
  );
  const engineMoment = wantedYawMoment - rudderMoment;
  const throttle = allocateAutopilotEngineCommands(
    base,
    limits.enginePower > 1e-6 ? engineMoment / limits.enginePower : 0,
    engineYawArms,
    model.engineAvailability,
  );
  const liftTrim =
    limits.liftTrimRange > 1e-6
      ? Math.max(-1, Math.min(1, guidance.liftFraction / limits.liftTrimRange))
      : 0;
  const swayCapacity =
    (limits.lateralThrust ?? 0) * limits.enginePoints.length;
  const starboardAxis: readonly [number, number] = [-heading[1], heading[0]];
  const lateralSpeed =
    velocity[0] * starboardAxis[0] + velocity[2] * starboardAxis[1];
  const sway =
    swayCapacity > 1e-6
      ? Math.max(
          -1,
          Math.min(
            1,
            (model.mass *
              (guidance.lateralSpeed - lateralSpeed) *
              1.6) /
              swayCapacity,
          ),
        )
      : 0;
  return {
    controls: { throttle, rudder, liftTrim, sway },
    desiredYawRate,
  };
}

/**
 * КУРС — ЭТО ТО, КУДА НАДО ПРИЙТИ К КОНЦУ МАНЁВРА, А НЕ КУДА СМОТРЕТЬ ВНУТРИ НЕГО.
 *
 * Гонщик не целится в касательную под собой. Он заранее ставит машину носом на
 * ВЫХОД из поворота и проезжает его боком — и это не лишняя работа, а меньшая:
 * один доворот вместо непрерывной погони за касательной, которая всё время
 * убегает. Голономной машине это подходит вдвойне: трассу она держит
 * перемещением, а рыскание у неё самый слабый канал и тратить его на погоню
 * незачем.
 *
 * Прежний закон целился в касательную под точкой упреждения. На плавной дуге
 * разница мала, а на перекладке принципиальна: точка упреждения попадает ровно
 * в середину смены знака кривизны, где касательная показывает направление,
 * которое через полсекунды станет противоположным. Нос получал цель, гнался за
 * ней и не успевал.
 *
 * Здесь трасса просматривается вперёд до места, где поворот КОНЧАЕТСЯ — где
 * касательная перестаёт вращаться, — и курс берётся оттуда. Просмотр ограничен
 * тем, что машина реально пролетит за время своего разворота: целиться дальше
 * значит ставить нос на манёвр, до которого ещё два других.
 *
 * ПОКА НЕ ПОДКЛЮЧЕНО, и причина не в месте включения, а в связанности.
 *
 * Первая попытка вставила закон в поздний `wanted` — вышло инертно: курс к тому
 * моменту уже потреблён. (Полезный признак: одинаковые до цифры числа почти
 * всегда значат «правка не работает», а не «правка нейтральна».)
 *
 * Вторая включила его там, где рождается `bearingError`, — и машина ушла на
 * 3905 м от трассы. От требуемого курса зависит НЕ ТОЛЬКО доворот: продольная и
 * боковая скорости просятся В ОСЯХ НОСА, и пока нос совпадал с касательной, эта
 * связь была незаметна. Поставив нос на выход из поворота, автопилот продолжил
 * просить ход «вперёд» — то есть в сторону выхода, по хорде, мимо трассы.
 *
 * Значит закон требует пересчёта СКОРОСТНОГО требования в новых осях: машина
 * обязана идти по касательной, глядя на выход, а не идти туда, куда смотрит.
 * Для голономной это выполнимо и физически честно — у неё сила в любую сторону,
 * — но это правка контура наведения целиком, а не подстановка курса.
 */
function turnExitHeading(
  plan: VehicleRoutePlan,
  progress: number,
  speed: number,
  yawAuthority: number,
): readonly [number, number] | undefined {
  if (plan.length <= 1 || speed < 1) {
    return undefined;
  }
  const step = Math.min(0.1, 20 / plan.length);
  const tangentAt = (at: number): readonly [number, number] | undefined => {
    const before = plan.point(Math.max(0, at - step));
    const after = plan.point(Math.min(1, at + step));
    const dx = after[0] - before[0];
    const dz = after[2] - before[2];
    const length = Math.hypot(dx, dz);
    return length < 1e-6 ? undefined : [dx / length, dz / length];
  };
  const start = tangentAt(progress);
  if (!start) {
    return undefined;
  }
  // Дальше того, что машина пролетит за собственный разворот, смотреть нельзя:
  // за этой границей начинается уже следующий манёвр.
  const reach = Math.min(
    0.35,
    Math.max(step * 2, (speed * (Math.PI / Math.max(0.1, yawAuthority))) / plan.length),
  );
  let previous = start;
  let turned = 0;
  for (let at = progress + step; at <= progress + reach && at < 1; at += step) {
    const here = tangentAt(at);
    if (!here) break;
    const delta = Math.atan2(
      previous[0] * here[1] - previous[1] * here[0],
      previous[0] * here[0] + previous[1] * here[1],
    );
    // Поворот кончился: касательная почти перестала вращаться, и дальше уже
    // прямая или начало следующего манёвра.
    if (Math.abs(delta) < 0.01 && Math.abs(turned) > 0.05) {
      return previous;
    }
    turned += delta;
    previous = here;
  }
  // Дошли до края просмотра внутри одного поворота — целимся в его дальний
  // край: это и есть «куда мы будем смотреть через несколько секунд».
  return Math.abs(turned) > 0.05 ? previous : undefined;
}

/**
 * КИНЕМАТИЧЕСКОЕ ТРЕБОВАНИЕ ТРАССЫ — ОДНО, ТРЁХМЕРНОЕ.
 *
 * Упреждение не делится по плоскостям. Траектория — одна кривая в
 * пространстве, и частица, идущая по ней с профилем скорости, испытывает одно
 * ускорение: центростремительное `v²·κ` вдоль нормали кривой — В ТРЁХ ОСЯХ,
 * гребень горки прижимает так же честно, как вираж уводит вбок, — плюс
 * продольное торможение вдоль касательной. Пока это жило тремя кусками (бок
 * отдельно, тормоз отдельно, вертикаль отдельной вставкой в контур подъёма и
 * даже в другой величине), каждая плоскость опаздывала по-своему.
 *
 * Здесь всё считается из ОДНИХ трёх точек кривой. Дальше машина сама
 * раскладывает вектор по своим органам: горизонталь — наклон и тоннели,
 * вертикаль — газ. Автопилот органов по-прежнему не знает.
 *
 * Торможение — от ФАКТИЧЕСКОЙ скорости к разрешённой впереди: машина медленнее
 * цели — упреждать нечего, и дедлок невозможен по построению.
 */
interface PathKinematicDemand {
  /** Мировое ускорение, которого требует кривая, [x, y, z] м/с². */
  readonly acceleration: readonly [number, number, number];
  /** Целевая вертикальная скорость профиля: уклон на путевую, м/с. */
  readonly verticalRate: number;
}

function pathKinematicDemand(
  plan: VehicleRoutePlan,
  progress: number,
  speed: number,
  model: ShipModel,
): PathKinematicDemand | undefined {
  if (speed < 1 || plan.length <= 1) {
    return undefined;
  }
  const step = Math.min(0.2, 30 / plan.length);
  const before = plan.point(Math.max(0, progress - step));
  const here = plan.point(progress);
  const after = plan.point(Math.min(1, progress + step));
  const tangentX = after[0] - before[0];
  const tangentY = after[1] - before[1];
  const tangentZ = after[2] - before[2];
  const tangentLength = Math.hypot(tangentX, tangentY, tangentZ);
  if (tangentLength < 1e-6) {
    return undefined;
  }
  const ux = tangentX / tangentLength;
  const uy = tangentY / tangentLength;
  const uz = tangentZ / tangentLength;
  const horizontalFine0 = Math.hypot(tangentX, tangentZ) || 1e-6;
  // Вертикальные полки владеют высотой сами — у столбов профиль молчит.
  const shelfFree =
    (!plan.verticalDeparture ||
      progress > plan.verticalDeparture.until + 0.02) &&
    (!plan.verticalArrival || progress < plan.verticalArrival.from - 0.02);
  // Первой производной — мелкое плечо: широкая база, нужная кривизне,
  // сглаживает уклон, и горка снова исполнялась лениво (замер: промах по
  // высоте вернулся с 6.5 к 9.7 м). Одна функция, одна кривая — но у первой
  // и второй производной разные шаги выборки, это числовая гигиена, а не
  // возврат к отдельным каналам.
  const fine = Math.min(0.02, 8 / plan.length);
  const beforeFine = plan.point(Math.max(0, progress - fine));
  const afterFine = plan.point(Math.min(1, progress + fine));
  const horizontalFine =
    Math.hypot(afterFine[0] - beforeFine[0], afterFine[2] - beforeFine[2]) ||
    1e-6;
  const verticalRate = shelfFree
    ? Math.max(
        -6,
        Math.min(
          6,
          ((afterFine[1] - beforeFine[1]) / horizontalFine) * speed,
        ),
      )
    : 0;
  // Вторая разность тех же трёх точек: её нормальная часть — кривизна В ТРЁХ
  // ОСЯХ. Плечо выборки — горизонтальная полухорда, которой параметризован
  // маршрут.
  const secondX = before[0] - 2 * here[0] + after[0];
  const secondY = before[1] - 2 * here[1] + after[1];
  const secondZ = before[2] - 2 * here[2] + after[2];
  const along = secondX * ux + secondY * uy + secondZ * uz;
  const normalX = secondX - along * ux;
  const normalY = shelfFree ? secondY - along * uy : 0;
  const normalZ = secondZ - along * uz;
  const normalLength = Math.hypot(normalX, normalY, normalZ);
  const arm = step * plan.length;
  const centripetal =
    normalLength > 1e-9 ? (speed * speed * normalLength) / (arm * arm) : 0;
  // Продольное торможение вдоль той же касательной.
  const deltaMetres = Math.max(8, speed * 0.6);
  const dp = deltaMetres / plan.length;
  let braking = 0;
  if (progress + dp < 1) {
    const ahead = Math.min(
      plan.speedLimit(progress + dp),
      governedRouteSpeed(plan, progress + dp, model, false, speed),
    );
    if (Number.isFinite(ahead) && ahead < speed) {
      braking = Math.max(
        -(model.turnCapability?.braking ?? 52),
        (ahead * ahead - speed * speed) / (2 * deltaMetres),
      );
    }
  }
  const scale = normalLength > 1e-9 ? centripetal / normalLength : 0;
  // Торможение — по ГОРИЗОНТАЛЬНОЙ касательной: профиль скорости мерян в
  // плане (plan.length — горизонталь), и вертикальная проекция замедления
  // воевала бы с пикированием — толкала вверх ровно там, где профиль ведёт
  // вниз. Замер это и показал: с 3D-торможением промах держался у 9.7 м.
  const hx = tangentX / horizontalFine0;
  const hz = tangentZ / horizontalFine0;
  return {
    acceleration: [
      normalX * scale + hx * braking,
      normalY * scale,
      normalZ * scale + hz * braking,
    ],
    verticalRate,
  };
}

/**
 * Политика заноса машины: явная из паспорта, иначе выводится из способа
 * тяги. Векторируемая машина (ротор) на маршруте носом не движется — ей
 * положена свободная маршрутная полоса и строгий створ; неголономная
 * получает общее правило. Производная величина, не отдельная константа.
 */
function slipPolicyOf(model: ShipModel) {
  return (
    model.slipPolicy ??
    (model.vectoredTranslation ? VECTORED_SLIP_POLICY : DEFAULT_SLIP_POLICY)
  );
}

/**
 * Устойчивая способность рыскания из полосы аллокатора. Полоса ЦЕНТРИРОВАНА
 * на текущем вращении корпуса: [ω−a, ω+a]. Способность машины — ПОЛУШИРИНА
 * `a`, а не min(|краёв|): прежнее чтение в вираже видело ближний к нулю
 * край (0.04–0.11 вместо честных ~0.19) и душило машину тем сильнее, чем
 * честнее она поворачивала — главный корень «HX-6 ползёт».
 */
function sustainedYawRate(
  limits: NonNullable<ShipModel["yawRateLimits"]>,
): number {
  return Math.max(0.05, (limits.maximum - limits.minimum) / 2);
}

/**
 * СКОЛЬКО РАЗРЕШАЕТ ФИЗИКА НА ЭТОМ УЧАСТКЕ ТРАССЫ.
 *
 * Трасса даёт форму, паспорт — способности, здесь они встречаются. Машина без
 * объявленной поворотливости (`turnCapability`) ограничений отсюда не получает
 * вовсе и летит ровно как летела: у дирижабля, состава и драккара вопроса
 * «успеет ли нос за виражом» просто не существует.
 *
 * Горизонт просмотра берётся по тормозному пути: дальше заглядывать
 * бессмысленно, ближе — поздно.
 */
function governedRouteSpeed(
  plan: VehicleRoutePlan,
  progress: number,
  model: ShipModel,
  onApproach: boolean,
  /** Фактический ход: разгон судится от него, а не от абстрактного нуля. */
  speed = 0,
): number {
  const capability = model.turnCapability;
  if (!capability) {
    return Number.POSITIVE_INFINITY;
  }
  // Темп рыскания берётся ИЗ АЛЛОКАТОРА, если он есть: выбитый движитель
  // сужает его сам, и ограничитель обязан узнать об этом тем же путём.
  const yawRate = model.yawRateLimits
    ? sustainedYawRate(model.yawRateLimits)
    : capability.yawRate;
  const limits = { ...capability, yawRate };
  const policy = slipPolicyOf(model);
  const corridorHere = plan.corridor?.(progress);
  const allowance = Math.min(
    onApproach ? policy.onApproach : Number.POSITIVE_INFINITY,
    corridorHere !== undefined
      ? slipAllowanceForCorridor(corridorHere, policy)
      : policy.enRoute,
  );
  const authoredHere = plan.speedLimit(progress);
  // ДВЕ РАЗНЫЕ ДЛИНЫ, И ПУТАТЬ ИХ НЕЛЬЗЯ — ЭТО УЖЕ СТОИЛО МОЛЧАЩЕГО ОГРАНИЧИТЕЛЯ.
  //
  // БАЗА ЗАМЕРА КРИВИЗНЫ — масштаб самого виража, `v/ω`: по трём точкам в
  // восьми метрах сплайн отдаёт радиусы в четыре метра там, где трасса
  // плавная, — считается рябь сглаживания, а не поворот (замер: база 8 м даёт
  // минимум 4.1 м, база 35 м — 14.9 м).
  //
  // ШАГ ВЫБОРКИ — сколько точек умещается в горизонте торможения. Когда обе
  // длины были одним числом, первая же точка выборки (~42 м) оказывалась за
  // горизонтом (~36 м), цикл выходил пустым и предел был бесконечностью:
  // ограничитель молчал весь полёт, а машина уходила с трассы на 84 метра.
  const turnScale = Math.max(
    25,
    Math.min(60, authoredHere / Math.max(0.1, yawRate)),
  );
  const base = plan.length > 1 ? turnScale / plan.length : 0.02;
  const horizon = Math.max(
    2 * turnScale,
    (authoredHere * authoredHere) / (2 * Math.max(0.5, capability.braking)) + 15,
  );
  const sampleMetres = Math.max(4, horizon / 24);
  const sampleStep = plan.length > 1 ? sampleMetres / plan.length : 0.02;
  const samples: RotorcraftPathSample[] = [];
  for (let index = 1; index <= 40; index += 1) {
    const at = progress + sampleStep * index;
    if (at >= 1) break;
    const distance = sampleMetres * index;
    if (distance > horizon) break;
    const here = plan.point(at);
    const before = plan.point(Math.max(0, at - base));
    const after = plan.point(Math.min(1, at + base));
    // Кривизна меряется ДВУМЯ базами, и берётся худший радиус. Большая база
    // гасит рябь сглаживания, но на вираже, чья дуга сравнима с ней самой,
    // хордит угол и завышает радиус — machine получала разрешение на 19 м/с
    // там, где физика виража держит 14. Короткая база честна на крутом, длинная
    // — на пологом; правду о вираже говорит меньший из двух радиусов.
    const tightBase = plan.length > 1 ? 18 / plan.length : base * 0.5;
    const beforeTight = plan.point(Math.max(0, at - tightBase));
    const afterTight = plan.point(Math.min(1, at + tightBase));
    samples.push({
      distance,
      speedCap: plan.speedLimit(at),
      radius: Math.min(
        pathTurnRadius(
          [before[0], before[2]],
          [here[0], here[2]],
          [after[0], after[2]],
        ),
        pathTurnRadius(
          [beforeTight[0], beforeTight[2]],
          [here[0], here[2]],
          [afterTight[0], afterTight[2]],
        ),
      ),
      // Угол ДУГИ, а не одного излома: занос копится по всему повороту, и
      // мерить его одной тройкой точек значит систематически его занижать.
      // Но не длиннее полуоборота: дуга за π — устойчивый вираж, в нём
      // отставание носа насыщается, а не копится, и накручивать угол дальше
      // (замерено до 716°) значит требовать координированного полёта — послаб-
      // ление β/Δψ исчезает, и скорость падает до ω·r, ползучего шага.
      turnAngle: Math.min(
        Math.PI,
        pathTurnAngle(
          [before[0], before[2]],
          [here[0], here[2]],
          [after[0], after[2]],
        ) * 4,
      ),
    });
  }
  if (samples.length === 0) {
    return Number.POSITIVE_INFINITY;
  }
  const braked =
    pathSpeedCeiling(samples, limits, allowance) * (model.governorScale ?? 1);
  // ГАЗ В ЩЕЛИ НЕ ОКУПАЕТСЯ. Тормозная парабола честно разрешает разогнаться
  // между двумя ограничениями — физика позволяет. Но на перекрестье восьмёрки
  // это давало пульс: пятнадцать метров «прямой», просьба прыгала с 15 до 30,
  // машина клевала — и тут же осаживалась перед следующей долей со взмахом
  // носа, который с земли читается как «встала на дыбы». Пилот держит фигуру
  // одним темпом: РАЗГОНЯТЬСЯ разрешено только до скорости, которая удержится
  // всё окно выгоды. Торможение параболе оставлено целиком.
  const gainWindow = Math.max(35, speed * 2.5);
  let sustained = Number.POSITIVE_INFINITY;
  for (const sample of samples) {
    if (sample.distance > gainWindow) break;
    const target = Math.min(
      corneringSpeed(sample.radius, sample.turnAngle, limits, allowance),
      sample.speedCap ?? Number.POSITIVE_INFINITY,
    );
    if (target < sustained) sustained = target;
  }
  return Math.min(braked, Math.max(speed, sustained));
}

/**
 * ОБЩИЙ АВТОПИЛОТ. Читает маршрут и состояние машины, формирует нейтральное
 * требование движения, затем корабельный контроллер переводит его в совместимые
 * рычаги. Винтокрылая машина берёт `guidance` и исполняет его своим каскадом;
 * раскладки её моторов здесь нет.
 */
export function autopilot(
  plan: VehicleRoutePlan,
  progress: number,
  centre: SceneVector3,
  orientation: Quaternion,
  velocity: SceneVector3,
  angularVelocity: SceneVector3,
  model: ShipModel,
  /** Разгон после отрыва, 0..1 — по времени, а не по ходу. */
  startRamp = 1,
  nose: SceneVector3 = [-1, 0, 0],
  approach: ApproachGate = SKY_TRAIN_APPROACH,
  safety: VehicleSafetyAdvisory | null = null,
): AutopilotOutput {
  const limits = model.limits;
  const forward = rotateVector(orientation, nose);
  const flatLength = Math.hypot(forward[0], forward[2]) || 1;
  const heading: readonly [number, number] = [
    forward[0] / flatLength,
    forward[2] / flatLength,
  ];
  const groundSpeed = Math.hypot(velocity[0], velocity[2]);

  // Смотрим ВПЕРЁД: где мы окажемся через несколько секунд, если ничего не
  // менять. Вести машину надо от предсказанной ошибки, а не от текущей, —
  // иначе она вечно догоняет себя и приходит в зону боком.
  const horizon = Math.max(2, Math.min(3.5, groundSpeed * 0.4));
  const guess = predictShip(
    centre,
    heading,
    velocity,
    angularVelocity[1],
    IDLE_CONTROLS,
    model,
    horizon,
    nose,
  );

  // Заход — это створ, а не «последние проценты»: с этого места маршрут уже
  // прямая на причал, и корабль должен идти по ней, не разворачиваясь.
  const onApproach = progress >= plan.finalFrom;
  const berthPoint = plan.point(1);
  const berthDistance = Math.hypot(
    centre[0] - berthPoint[0],
    centre[2] - berthPoint[2],
  );

  // На всём маршруте, включая посадочную прямую, ведём на следующую точку
  // самой линии. Целью захода раньше сразу становился причал: корабль резал
  // створ по диагонали и физическая швартовка потом дотягивала его боком.
  const routeLookahead = plan.guidanceLookahead?.(progress) ?? ROUTE_LOOKAHEAD;
  const guidanceProgress = Math.min(
    1,
    progress + (onApproach ? APPROACH_LOOKAHEAD : routeLookahead) / plan.length,
  );
  const routeHere = plan.point(progress);
  let aim = plan.point(guidanceProgress);
  if (plan.terminalGuidanceHeading) {
    // A correction route ends at a join, not at a stopping point. Preserve
    // the ordinary look-ahead beyond that join so the predictive controller
    // keeps the source-route course instead of orbiting a consumed endpoint.
    const remaining = Math.max(0, (1 - progress) * plan.length);
    const terminalLength = Math.hypot(...plan.terminalGuidanceHeading) || 1;
    const terminalHeading: readonly [number, number] = [
      plan.terminalGuidanceHeading[0] / terminalLength,
      plan.terminalGuidanceHeading[1] / terminalLength,
    ];
    const endpoint = plan.point(1);
    // Once the predicted craft has passed the authored join, keep the target
    // one look-ahead ahead of that projection. A fixed virtual point merely
    // moves the orbit a few metres downstream.
    const predictedBeyond = Math.max(
      0,
      (guess.position[0] - endpoint[0]) * terminalHeading[0] +
        (guess.position[1] - endpoint[2]) * terminalHeading[1],
    );
    const extension = Math.max(
      0,
      routeLookahead - remaining,
      predictedBeyond + routeLookahead,
    );
    aim =
      plan.terminalGuidancePoint && extension > 0
        ? plan.terminalGuidancePoint(extension)
        : [
            aim[0] + terminalHeading[0] * extension,
            aim[1],
            aim[2] + terminalHeading[1] * extension,
          ];
  }
  const segmentX = aim[0] - routeHere[0];
  const segmentZ = aim[2] - routeHere[2];
  const segmentLength = Math.hypot(segmentX, segmentZ) || 1;
  const tangentX = segmentX / segmentLength;
  const tangentZ = segmentZ / segmentLength;
  const errorX = routeHere[0] - guess.position[0];
  const errorZ = routeHere[2] - guess.position[1];
  const alongError = errorX * tangentX + errorZ * tangentZ;
  const lateralErrorX = errorX - tangentX * alongError;
  const lateralErrorZ = errorZ - tangentZ * alongError;
  // Длинное упреждение успокаивает курс, но само по себе срезает дугу.
  // Усиливаем только ПОПЕРЕЧНУЮ поправку к ближайшей точке, не заставляя
  // судно догонять ход маршрута. Так оно держит линию и не рыскает.
  const CROSS_TRACK_GAIN = 1.2;
  const toAim = [
    aim[0] - guess.position[0] + lateralErrorX * (CROSS_TRACK_GAIN - 1),
    aim[2] - guess.position[1] + lateralErrorZ * (CROSS_TRACK_GAIN - 1),
  ] as const;
  const reach = Math.hypot(toAim[0], toAim[1]) || 1;
  let wanted: readonly [number, number] = [toAim[0] / reach, toAim[1] / reach];
  const travelDirection = plan.travelDirection?.(progress) ?? 1;
  if (travelDirection < 0) {
    // The path still points where the centre must travel; reversing changes
    // only which end of the craft faces that tangent. Motors remain the sole
    // source of the actual backwards motion.
    wanted = [-wanted[0], -wanted[1]];
  }
  if (onApproach) {
    // На оси причала последние метры — уже не навигация к точке, а
    // швартовочное положение. Подмешиваем требуемый курс только после
    // захвата створа: если сделать это при большом боковом сносе, корабль
    // пойдёт параллельно перрону и никогда не вернётся на линию.
    const finalOffsetX = centre[0] - berthPoint[0];
    const finalOffsetZ = centre[2] - berthPoint[2];
    const finalCrossTrack = Math.abs(
      finalOffsetX * approach.heading[1] - finalOffsetZ * approach.heading[0],
    );
    const positionBlend = clamp01(1 - berthDistance / 35);
    // Do not freeze onto the berth heading while still visibly off its axis.
    // The old four-metre blend traded away cross-track correction too early;
    // a fast, physically flown glide could then keep 1–2 m of lateral error
    // all the way to the platform. Heading hold takes over only after the
    // centreline is genuinely captured.
    const captureBlend = clamp01(1 - finalCrossTrack / 1.5);
    // Once the route is effectively complete and the craft has lost way, it
    // must still ask for the authored berth heading. Otherwise a small
    // cross-track error makes it turn sideways toward the centre point while
    // the zero endpoint speed leaves no translation to correct that error;
    // a real nose capture can then never engage. Differential thrust performs
    // the turn, after which the near-mast winch can finish the translation.
    const settleHeadingBlend = progress > 0.985 && groundSpeed < 1 ? 1 : 0;
    const blend = Math.max(positionBlend * captureBlend, settleHeadingBlend);
    const mixX = wanted[0] * (1 - blend) + approach.heading[0] * blend;
    const mixZ = wanted[1] * (1 - blend) + approach.heading[1] * blend;
    const mixLength = Math.hypot(mixX, mixZ) || 1;
    wanted = [mixX / mixLength, mixZ / mixLength];
  }

  // ГОЛОНОМНАЯ МАШИНА ПРАВИТ ПОЛОЖЕНИЕ ТЯГОЙ, А НЕ НОСОМ.
  //
  // Общий контур неголономный: он превращает ошибку положения в требование к
  // КУРСУ, потому что корпус едет туда, куда смотрит. Для машины с
  // векторируемыми движителями это ложь, и ложь дорогая: любой боковой снос
  // становился командой рыскания, машина доворачивала, тяга вдоль нового носа
  // тащила её вбок, следовал перелёт и доворот обратно — те самые непрерывные
  // коррекции. На посадке было хуже: причальный курс и направление на пятно
  // требовали от носа разного, а усиления pure pursuit на нулевой скорости
  // почти нет, и машина замирала в метре от стакана, развернувшись боком.
  //
  // Поэтому у неё нос идёт по касательной маршрута, а у причала — по
  // причальному курсу, и никакой связи с ошибкой положения у него нет.
  // Реальная власть машины по рысканию: сколько она СПОСОБНА, а не сколько
  // записано в паспорте. Всё, что просит автомат, меряется этим числом —
  // полушириной полосы аллокатора, устойчивым темпом (см. sustainedYawRate).
  const yawAuthority = model.yawRateLimits
    ? sustainedYawRate(model.yawRateLimits)
    : Infinity;
  if ((limits.lateralThrust ?? 0) > 1e-6) {
    // УПРЕЖДЕНИЕ НОСА ВО ВРЕМЕНИ. Разворот у этой машины длится секунды, и
    // целиться в касательную под собой значит опаздывать на весь этот срок:
    // к концу доворота трасса уже повернула, и нос снова догоняет. Поэтому
    // прицел берётся там, где машина ОКАЖЕТСЯ за время собственного
    // разворота. На плавном участке это почти ничего не меняет, а на изломе
    // машина начинает доворот заранее и входит в него боком — ровно так, как
    // это делает живой пилот дрона. У причала курс задаёт створ.
    const noseOff = Math.abs(
      Math.atan2(
        guess.heading[1] * tangentX - guess.heading[0] * tangentZ,
        guess.heading[0] * tangentX + guess.heading[1] * tangentZ,
      ),
    );
    // Упреждение — это ставка на будущее положение, и платит за неё снос.
    // Пока машина держит трассу, ставка полная; чем дальше её снесло, тем
    // ближе прицел возвращается под себя, иначе упреждение и снос начинают
    // накручивать друг друга и машина уходит от линии всё дальше.
    const driftPenalty = clamp01(
      1 -
        Math.hypot(lateralErrorX, lateralErrorZ) /
          (plan.corridor?.(progress) ?? ROUTE_CORRIDOR),
    );
    const turnSeconds =
      Math.min(6, Math.max(HEADING_ALIGN_SECONDS, noseOff / yawAuthority)) *
      driftPenalty;
    const leadProgress = Math.min(
      1,
      progress + (Math.max(groundSpeed, 1) * turnSeconds) / plan.length,
    );
    // НАПРАВЛЕНИЕ БЕРЁТСЯ ТАМ, ГДЕ ОНО ЕСТЬ.
    //
    // Касательная в точке под машиной определена не везде. На вертикальном
    // взлёте маршрут почти не смещается по горизонтали, и разность соседних
    // точек — это шум: у него есть направление, но смысла в нём нет. Нос
    // честно целился в этот шум, держал его весь подъём, а машина потом
    // уходила по настоящему курсу — в замере с девяноста градусами разворота
    // в долгу, которые она потом отрабатывала полминуты, идя боком.
    //
    // Поэтому прицел ищется вперёд по линии, пока горизонтальное смещение не
    // станет осмысленным. Тогда на подъёме нос заранее разворачивается туда,
    // куда машина полетит, и с площадки она уходит уже по курсу.
    const leadHere = plan.point(leadProgress);
    let leadX = 0;
    let leadZ = 0;
    let leadLength = 0;
    for (let probe = 1; probe <= 8; probe += 1) {
      const at = Math.min(1, leadProgress + (probe * 6) / plan.length);
      const point = plan.point(at);
      leadX = point[0] - leadHere[0];
      leadZ = point[2] - leadHere[2];
      leadLength = Math.hypot(leadX, leadZ);
      if (leadLength >= 4 || at >= 1) {
        break;
      }
    }
    const leadTangent: readonly [number, number] =
      leadLength > 1e-6
        ? [leadX / leadLength, leadZ / leadLength]
        : [tangentX, tangentZ];
    wanted = onApproach
      ? [approach.heading[0], approach.heading[1]]
      : leadTangent;
  }
  // ТРАССА МОЖЕТ ПОПРОСИТЬ КУРС НАПРЯМУЮ, и тогда он не выводится из движения.
  //
  // Просить об этом можно только у машины, которая умеет двигаться не туда,
  // куда смотрит: у неголономной сила лежит вдоль корпуса, и нос обязан идти
  // за движением. На заходе требование тоже не действует — там курс принадлежит
  // створу, и второе мнение о нём означало бы промах мимо площадки.
  const authoredHeading =
    !onApproach && (limits.lateralThrust ?? 0) > 1e-6
      ? plan.heading?.(progress)
      : null;
  if (authoredHeading) {
    const length = Math.hypot(authoredHeading[0], authoredHeading[1]);
    if (length > 1e-6) {
      wanted = [authoredHeading[0] / length, authoredHeading[1] / length];
    }
  }
  const turn = guess.heading[1] * wanted[0] - guess.heading[0] * wanted[1];
  const facing = guess.heading[0] * wanted[0] + guess.heading[1] * wanted[1];
  const bearingError = Math.atan2(turn, facing);
  // Геометрия pure pursuit: хорда остаётся конечной даже на точном маршруте,
  // поэтому кривизна не скачет от малой ошибки предсказания.
  // Pure pursuit has a real singularity at a half-turn: sin(PI) is zero, so
  // a craft that has just finished backing out would never ask for the pivot
  // needed to leave forwards. At manoeuvring speed, use the signed bearing
  // itself until the target returns to the forward hemisphere. Differential
  // thrust and the rudder still create every newton of the turn.
  // Геометрия pure pursuit: хорда остаётся конечной даже на точном маршруте,
  // поэтому кривизна не скачет от малой ошибки предсказания.
  // Pure pursuit has a real singularity at a half-turn: sin(PI) is zero, so
  // a craft that has just finished backing out would never ask for the pivot
  // needed to leave forwards. At manoeuvring speed, use the signed bearing
  // itself until the target returns to the forward hemisphere. Differential
  // thrust and the rudder still create every newton of the turn.
  //
  // ОТКРЫТО для всенаправленной машины: усиление этого закона пропорционально
  // ходу, потому что неголономный корпус и поворачивает только на ходу. Машина,
  // которая держит место сама, у причала почти стоит — и доворачивает на
  // причальный курс мучительно медленно, оставаясь боком. Прямой захват курса
  // вместо погони пробовался: он доворачивает быстро, но на располагаемом
  // моменте шести колец раскручивает машину до нескольких рад/с, и корпус
  // опрокидывается тягой, приложенной ниже центра масс. Нужен закон посадки,
  // который ведёт МЕСТО и КУРС согласованно, а не два контура порознь.
  // НОС ЦЕЛИТСЯ ТУДА, ГДЕ МАШИНА ОКАЖЕТСЯ, А НЕ ГДЕ ОНА СЕЙЧАС ДОЛЖНА БЫТЬ.
  //
  // Погоня выведена для корпуса, который едет туда, куда смотрит: она просит
  // темп, пропорциональный СКОРОСТИ, и не спрашивает, умеет ли машина так
  // поворачиваться. Мультиротор так не умеет и не должен: рыскание у него
  // рождается одним лишь реактивным моментом винтов и потому вяло, зато вбок
  // он уходит мгновенно. Прежний закон на маршрутной скорости просил около
  // 0.9 рад/с при физически доступных 0.19, упирался в потолок и каждым шагом
  // подкручивал машину дальше — она наматывала лишние обороты вокруг себя,
  // формально идя по трассе. На висении та же формула давала крохи, поэтому
  // взлёт и посадка выглядели чисто: беда включалась вместе со скоростью.
  //
  // Здесь требование пропорционально ОШИБКЕ КУРСА и обратно времени, за
  // которое машина реально успевает довернуть. Оно само убывает по мере
  // выравнивания, поэтому раскрутки не возникает, а на остром угле разворот
  // начинается заранее — корпус входит в поворот боком, на тяге, и нос
  // приходит к курсу к тому моменту, когда он там понадобится.
  const holonomic = (limits.lateralThrust ?? 0) > 1e-6;
  const pursuit = holonomic
    ? bearingError /
      Math.max(HEADING_ALIGN_SECONDS, Math.abs(bearingError) / yawAuthority)
    : Math.abs(bearingError) > Math.PI / 2 && groundSpeed < 4
      ? bearingError / 3
      : (2 * Math.max(groundSpeed, 1.5) * Math.sin(bearingError)) /
        Math.max(20, reach);
  // Guidance просит темп без знания органа управления. Корабельный контроллер
  // ниже зажмёт его располагаемым рулём и разнотягом; коптер — собственным
  // реактивным моментом винтов.
  let requestedYawRate = pursuit;
  const yawRateLimits = model.yawRateLimits;
  if (yawRateLimits) {
    const minimum = Math.min(yawRateLimits.minimum, yawRateLimits.maximum);
    const maximum = Math.max(yawRateLimits.minimum, yawRateLimits.maximum);
    const directionFloor = 0.025;
    if (
      requestedYawRate < -directionFloor &&
      minimum >= -directionFloor &&
      maximum > directionFloor
    ) {
      // The short turn is no longer physically available. A multirotor with
      // one spin direction depleted must take the long way around instead of
      // asking forever for the impossible sign and blaming its actuators.
      requestedYawRate = (bearingError + Math.PI * 2) / 3;
    } else if (
      requestedYawRate > directionFloor &&
      maximum <= directionFloor &&
      minimum < -directionFloor
    ) {
      requestedYawRate = (bearingError - Math.PI * 2) / 3;
    }
    requestedYawRate = Math.max(
      minimum,
      Math.min(maximum, requestedYawRate),
    );
  }

  // Тяга: держим разрешённую скорость участка, считая по ПРЕДСКАЗАННОМУ
  // ходу — иначе на торможении машина проскакивает.
  const speedAlong = velocity[0] * heading[0] + velocity[2] * heading[1];
  // До посадочной прямой близость к причалу ничего не означает: замкнутая
  // линия проходит рядом с ним и в середине рейса. Старый регулятор видел
  // малое евклидово расстояние и внезапно включал реверс прямо на круге.
  const braking = onApproach
    ? Math.max(0, speedAlong * speedAlong) / (2 * Math.max(1, berthDistance))
    : 0;
  // АВТОРСКИЙ ПРЕДЕЛ УЧАСТКА — ПОТОЛОК, А НЕ РАБОЧАЯ ТОЧКА.
  //
  // Он отвечает на вопрос «быстрее не надо по замыслу»: тихо у причала, шумно
  // на разгонном луче. На вопрос «быстрее НЕЛЬЗЯ» он не отвечает и ответить не
  // может — для этого надо знать радиус ближайшего виража и то, чем машина
  // располагает, а маршрут не знает ни того, ни другого. Пока это писалось
  // руками, промахи шли подряд: сперва на 92 метра мимо трассы, потом на 48.
  //
  // Поэтому предел считается ещё и физикой, и берётся меньшее из двух.
  // Считает его САМ автопилот по геометрии плана: у любого маршрута есть точки
  // и длина, больше ничего не нужно. Делать это свойством маршрута значило бы
  // раздать один и тот же закон по всем трассам и потерять его при следующей.
  const authored = Math.min(
    plan.speedLimit(progress),
    governedRouteSpeed(plan, progress, model, onApproach, groundSpeed),
  );
  const routeAllowed = onApproach
    ? Math.min(authored, Math.max(0.8, Math.sqrt(2 * 0.35 * berthDistance)))
    : authored;
  const safetyIntervention = safety?.risk === "intervention";
  const allowed = safetyIntervention
    ? Math.min(routeAllowed, safety?.maximumSpeed ?? routeAllowed)
    : routeAllowed;
  const verticalDeparture = plan.verticalDeparture;
  const onVerticalDeparture = Boolean(
    verticalDeparture && progress < verticalDeparture.until,
  );
  const verticalDepartureCleared = Boolean(
    !onVerticalDeparture ||
      (verticalDeparture &&
        centre[1] >= verticalDeparture.altitude - verticalDeparture.tolerance),
  );
  // ГОЛОНОМНАЯ МАШИНА У ПРИЧАЛА ДЕРЖИТ НЕ СКОРОСТЬ, А МЕСТО.
  //
  // Общий регулятор продольного хода — это регулятор СКОРОСТИ: маршрут ведёт
  // профиль к нулю, и машина останавливается там, где профиль кончился. Для
  // корабля, который дотягивает лебёдка причала, этого достаточно. Машина,
  // садящаяся на пятно, обязана держать САМО МЕСТО: иначе она замирает в
  // нескольких метрах, а недостающее приходится добирать захватом, который
  // тянет за нос и разворачивает лёгкий корпус рывком.
  //
  // Поэтому на финальном участке продольная команда выводится из оставшегося
  // расстояния до причальной точки вдоль причального курса, а не из профиля.
  const holonomicBerthHold =
    onApproach &&
    (limits.lateralThrust ?? 0) > 1e-6 &&
    model.vectoredTranslation === true;
  // ОШИБКА МЕСТА — ЭТО ВЕКТОР, И МЕРИТЬ ЕЁ НАДО ЦЕЛИКОМ.
  //
  // Прежде остаток до причала считался вдоль ПРИЧАЛЬНОГО курса, а боковой
  // контур — вдоль СВОЕГО борта. Пока нос смотрит на причал, эти две оси
  // образуют нормальный базис. Но всенаправленная машина приходит на финиш
  // как угодно повёрнутой, и при носе поперёк причального курса обе оси
  // встают перпендикулярно ошибке: тридцать метров промаха проецируются в
  // ноль СРАЗУ В ОБА КАНАЛА. Машина не «подходит медленно» — она вообще не
  // видит, что промахнулась, и висит рядом с бертом, пока её сносит ветром.
  //
  // Поэтому желаемое движение строится вектором в осях мира, ограничивается
  // по МОДУЛЮ и лишь затем раскладывается на нос и борт. Базис полный: любое
  // направление промаха представимо. Ограничение до разложения — не деталь:
  // именно одновременное насыщение обеих команд когда-то разносило машину,
  // прикладывая полную горизонтальную силу ниже центра масс.
  const berthErrorX = berthPoint[0] - centre[0];
  const berthErrorZ = berthPoint[2] - centre[2];
  const berthError = Math.hypot(berthErrorX, berthErrorZ);
  // Профиль маршрута в самом конце требует НУЛЯ скорости — он описывает рейс,
  // а не установку на место. Позиционной команде нужен собственный, малый
  // манёвренный предел, иначе машина честно останавливается ровно там, где
  // профиль кончился, и не доходит последние полметра до стакана.
  const berthHoldSpeed = Math.max(allowed, 0.6);
  const wantedSpeed =
    (verticalDepartureCleared ? allowed : 0) *
    clamp01(startRamp) *
    travelDirection;
  // Удержание места у причала: продольная команда выводится из оставшегося
  // расстояния до причальной точки, а не из скоростного профиля маршрута.
  //
  // ОТКРЫТО: контур считается в осях КОРПУСА, и доворот на курс частично сам
  // себя сбивает — нос повернулся, обе команды повернулись вместе с ним.
  // Попытка перевести его в оси причала (жёсткая PD по месту с проекцией на
  // органы) машину разносила: при насыщении обеих команд горизонтальная сила
  // приложена ниже центра масс, и на быстром вращении корпус опрокидывался.
  // Правильный закон посадки всенаправленной машины — отдельная работа, а не
  // подбор коэффициентов.
  // Желаемый ход вдоль носа — то, о чём автопилот на самом деле просит. Ниже
  // он сплющивается в тягу, но само требование остаётся и отдаётся наружу.
  // Темп подхода расписан по ОСТАВШЕМУСЯ РАССТОЯНИЮ, а не по профилю рейса.
  // Профиль в последней точке требует нуля — он описывает рейс, а не установку
  // на место, — и машина, промахнувшаяся мимо берта, добирала бы недостающие
  // метры швартовочным ползком по полметра в секунду. Тормозная кривая от
  // честного остатка сама сходится к этому ползку у самого стакана, но за
  // десяток метров даёт нормальный подходной ход. Потолком служит скорость,
  // с которой маршрут разрешает входить на посадочную прямую.
  const berthApproachSpeed = Math.min(
    Math.max(0.6, Math.sqrt(2 * 0.35 * berthError)),
    Math.max(0.6, plan.speedLimit(plan.finalFrom)),
  );
  const berthDemand = holonomicBerthHold
    ? Math.min(berthApproachSpeed, berthError * 0.7)
    : 0;
  const berthDemandX = berthError > 1e-6 ? (berthErrorX / berthError) * berthDemand : 0;
  const berthDemandZ = berthError > 1e-6 ? (berthErrorZ / berthError) * berthDemand : 0;
  // ТЕЛО ИДЁТ ПО ЛИНИИ, НОС СВОБОДЕН.
  //
  // Продольная команда — это ход ВДОЛЬ НОСА, и пока нос смотрел по касательной,
  // этого хватало. Но носу разрешено уходить на упреждение поворота, а тяга
  // мультиротора идёт следом за наклоном: машина честно выполняла «столько-то
  // вперёд» в сторону, куда смотрела, и выписывала собственный круг снаружи
  // маршрута — в замере до 82 м мимо трассы шириной 137 м, с раскачкой туда и
  // обратно. Боковой контур в одиночку такой снос не вытягивал.
  //
  // Поэтому у машины с векторной тягой требование к ходу задаётся ВЕКТОРОМ на
  // следующую точку линии и раскладывается на нос и борт. Кто куда смотрит,
  // на траекторию больше не влияет: упреждение остаётся чистым рысканьем,
  // а тело идёт по маршруту.
  const holonomicRoute =
    !onApproach &&
    (limits.lateralThrust ?? 0) > 1e-6 &&
    model.vectoredTranslation === true;
  const aimErrorX = aim[0] - centre[0];
  const aimErrorZ = aim[2] - centre[2];
  const aimError = Math.hypot(aimErrorX, aimErrorZ);
  // Знак хода несёт сам вектор: точка прицела лежит впереди по маршруту.
  const routeDemand = Math.abs(wantedSpeed);
  // ТЕЛО НЕ ОБГОНЯЕТ НОС.
  //
  // Требование-вектор машина исполняет наклоном винтов, то есть МГНОВЕННО, а
  // нос разворачивается сопротивлением лопастей — у этой машины около десяти
  // градусов в секунду. На изломе трассы курс движения переставлялся на
  // девяносто градусов за три секунды, нос оставался позади и уже не догонял
  // никогда: в замере он весь круг шёл на 60–90° в стороне, а к посадке летел
  // почти задом.
  //
  // Поэтому направление хода ограничено углом сноса относительно носа. Внутри
  // предела машина идёт крабом — это и просили: нос ведёт поворот, тело
  // срезает. За пределом ход отклоняется обратно к носу, и машина сперва
  // доворачивается, как всякий дрон. Предел не относится к причалу: там
  // подход медленный и заходить боком на пятно машине не мешает.
  //
  // И ОН НЕ ОТНОСИТСЯ К ОБЪЯВЛЕННОМУ КУРСУ. Предел сторожит ОТСТАВАНИЕ носа от
  // курса, который никто не назначал: там расхождение — это всегда промах, и
  // придержать ход правильно. Курс, объявленный участком, — не промах, а
  // замысел: «пяться от площадки, глядя на неё» и есть расхождение на сто
  // восемьдесят градусов. Прежний предел придерживал бы ход тем сильнее, чем
  // точнее машина выполняет требование, и на развороте спиной остановил бы её
  // совсем (множитель уходит в ноль уже на девяноста градусах).
  const crabLimit = authoredHeading ? Math.PI : Math.PI / 3;
  const noseAngle = Math.atan2(heading[1], heading[0]);
  const wantAngle = Math.atan2(aimErrorZ, aimErrorX);
  let crab = wantAngle - noseAngle;
  while (crab > Math.PI) crab -= Math.PI * 2;
  while (crab < -Math.PI) crab += Math.PI * 2;
  const heldAngle =
    noseAngle + Math.max(-crabLimit, Math.min(crabLimit, crab));
  // Пока нос отрабатывает, ход придерживается: гнать полным ходом в сторону,
  // отличную от требуемой, значит увозить машину с линии тем быстрее, чем
  // сильнее она промахивается носом.
  const crabExcess = Math.max(0, Math.abs(crab) - crabLimit);
  const heldSpeed = routeDemand * clamp01(1 - crabExcess / (Math.PI / 2));
  const routeDemandX = aimError > 1e-6 ? Math.cos(heldAngle) * heldSpeed : 0;
  const routeDemandZ = aimError > 1e-6 ? Math.sin(heldAngle) * heldSpeed : 0;
  const requestedForwardSpeed = holonomicBerthHold
    ? berthDemandX * heading[0] + berthDemandZ * heading[1]
    : holonomicRoute
      ? routeDemandX * heading[0] + routeDemandZ * heading[1]
      : wantedSpeed;
  // Высота остаётся требованием сверх веса. Чем его выполнить — клапаном
  // оболочки или общим газом винтов — решает видовой контроллер.
  const wantedAltitude =
    vehicleRouteAltitudeTarget(plan, progress, centre);
  const altitudeError =
    wantedAltitude +
    (safetyIntervention ? (safety?.altitudeOffset ?? 0) : 0) -
    centre[1];
  // Вертикальное упреждение — из ЕДИНОГО кинематического требования кривой:
  // та же величина, что вела горку до объединения, только источник теперь
  // один на все три плоскости. Реактивный контур без него летел ленивую
  // версию шоу — 9.5 м промаха из 9 возможных.
  const pathKinematics = pathKinematicDemand(plan, progress, groundSpeed, model);
  // ПОСЛЕДНИЕ ПОЛМЕТРА ВНИЗ НАДО ПРОЙТИ, А НЕ ПРИБЛИЖАТЬСЯ К НИМ.
  //
  // Вертикальный контур пропорционален остатку: чем ближе палуба, тем медленнее
  // машина к ней идёт. Это верно для ВЫХОДА НА ВЫСОТУ и неверно для ПОСАДКИ —
  // там получается асимптота, и машина не доходит никогда.
  //
  // Замер на стенде (VX-8, поставлен в метре над причалом): скорость снижения
  // затухает −0.20, −0.16, −0.10, −0.08, −0.07 м/с, а остаток стоит на 0.5 м
  // при допуске швартовки 0.5 — четыре сантиметра, которых не хватает. Десять
  // секунд таймера истекают, и рейс кончается сообщением «Корабль не успел
  // стабилизироваться у причала». У RAX-8 та же схема работает только потому,
  // что его вертикальной власти хватает продавить асимптоту за отпущенный
  // срок: он проходит тот же метр за три секунды вместо десяти.
  //
  // Горизонтальному подходу у причала пол скорости УЖЕ дан
  // (`berthApproachSpeed`, тормозная кривая с полом 0.6 м/с) — ровно затем,
  // чтобы машина «не останавливалась там, где кончился профиль». Вертикали его
  // не дали, и это единственная разница. Здесь она устраняется: та же форма —
  // тормозная кривая с полом, — и она включается только там, где машина уже
  // над своей площадкой и обязана сесть.
  const terminalDescent =
    holonomicBerthHold &&
    vehicleVerticalArrivalCaptured(plan, progress, centre) &&
    centre[1] > berthPoint[1] + TERMINAL_DESCENT_DEADBAND;
  const wantedVerticalRate = terminalDescent
    ? -Math.min(
        TERMINAL_DESCENT_CEILING,
        Math.max(
          TERMINAL_DESCENT_FLOOR,
          Math.sqrt(2 * 0.3 * (centre[1] - berthPoint[1])),
        ),
      )
    : (pathKinematics?.verticalRate ?? 0);
  const liftFraction = Math.max(
    -limits.liftTrimRange,
    Math.min(
      limits.liftTrimRange,
      // Остаток высоты остаётся в контуре и на посадке: снижение — это ПОЛ
      // темпа, а не замена закона. Без остатка контур теряет обратную связь по
      // месту и проскакивает палубу вниз; в замере это выходило снятием рейса
      // за `routeDivergence` уже ПОСЛЕ касания.
      altitudeError * 0.06 + (wantedVerticalRate - velocity[1]) * 0.12,
    ),
  );

  // Промах на заходе: не по месту, не по курсу или не по скорости — уходим на
  // второй круг. Домучивать посадку боком нельзя.
  // Окно захвата проверяется на ВХОДЕ в него и по предсказанному положению:
  // важно не то, как машина стоит сейчас, а как она будет стоять, когда
  // окажется у причала.
  // В зоне мы или нет — вопрос о том, где корабль СЕЙЧАС; а вот в каком он
  // будет положении — о том, где он ОКАЖЕТСЯ.
  const routeSample = Math.max(
    0.001,
    Math.min(0.012, 5 / Math.max(1, plan.length)),
  );
  const routeBefore = plan.point(Math.max(0, progress - routeSample));
  const routeAfter = plan.point(Math.min(1, progress + routeSample));
  const routeDx = routeAfter[0] - routeBefore[0];
  const routeDz = routeAfter[2] - routeBefore[2];
  const routeLength = Math.hypot(routeDx, routeDz) || 1;
  const routeTangentX = routeDx / routeLength;
  const routeTangentZ = routeDz / routeLength;
  const offsetX = centre[0] - routeHere[0];
  const offsetZ = centre[2] - routeHere[2];
  const crossTrack = Math.abs(
    offsetX * routeTangentZ - offsetZ * routeTangentX,
  );
  let goAround = false;
  // ПРОМАХ — ЭТО ЕЩЁ И «ПРИЧАЛ УДАЛЯЕТСЯ».
  //
  // Проверка качества ниже смотрит на машину ТОЛЬКО в узком окне у причала
  // (2.5 допуска места — у VX-8 это 10.5 м). Машина, идущая по створу мимо, в
  // это окно не попадает никогда: промах не объявляется, второй круг не
  // назначается, боковая поправка на заходе обнулена — и она честно летит по
  // оси створа в бесконечность с постоянным ходом. Замер на стенде конца
  // рейса: прогресс замирает на 0.983 при пороге швартовки 0.985, машина
  // уходит от причала со скоростью 3.5 м/с и не останавливается. Отсюда
  // наблюдение Igor: «VX не завершает полёт, висит и не отключается».
  //
  // Признак берётся ПРЕДСКАЗАНИЕМ, а не памятью: автопилот считается заново
  // каждый кадр и прошлого не помнит. Машина, доворачивающая на створ, имеет
  // скорость В СТОРОНУ причала, и предсказание у неё ближе; уходящая — дальше.
  // Это тот же `guess`, которым уже судится поза в окне захвата.
  // Предсказание плоское: [x, z]. Причал берётся теми же двумя осями.
  const predictedBerthDistance = Math.hypot(
    guess.position[0] - berthPoint[0],
    guess.position[1] - berthPoint[2],
  );
  //
  // Правило узкое НАМЕРЕННО, и первая редакция это доказала: без нижней
  // границы оно снимало с посадки исправные машины — дирижабль на мачте,
  // дракар на туре, охотника в дуэли, — потому что у любой машины на
  // доворотe предсказание на миг оказывается дальше причала. Восемь красных
  // тестов за одну правку.
  //
  // Поэтому два условия сверх расхождения: машина ВНЕ окна, в котором работает
  // проверка качества (иначе два судьи спорят об одном), и уходит она НА ХОД,
  // а не на дрожание — не меньше половины того, что унесёт её собственная
  // скорость за горизонт предсказания.
  const divergingFromBerth =
    onApproach &&
    berthDistance > approach.tolerance.position * 2.5 &&
    predictedBerthDistance >
      berthDistance + Math.max(1, groundSpeed * horizon * 0.5);
  if (onApproach && berthDistance < approach.tolerance.position * 2.5) {
    const headingOff = Math.acos(
      Math.max(
        -1,
        Math.min(
          1,
          guess.heading[0] * approach.heading[0] +
            guess.heading[1] * approach.heading[1],
        ),
      ),
    );
    goAround =
      crossTrack > approach.tolerance.position ||
      headingOff > approach.tolerance.heading ||
      groundSpeed > approach.tolerance.speed;
  } else if (divergingFromBerth) {
    goAround = true;
  }

  // Боковой контур: ошибка ПОПЕРЁК линии маршрута и демпфер по фактической
  // боковой скорости. Рыскания в нём нет вовсе — тем он и отличается от
  // общего. Ноль у машины без векторируемых движителей: сдвинуться вбок ей
  // нечем, и просить об этом бессмысленно.
  const starboardAxis: readonly [number, number] = [-heading[1], heading[0]];
  // Опора бокового контура. На маршруте это касательная, а У ПРИЧАЛА —
  // причальный курс: в последней точке маршрута касательная ВЫРОЖДАЕТСЯ
  // (сегмент схлопывается в ноль), её направление начинает скакать, и боковой
  // контур раскачивает машину вокруг случайной оси. В прогоне это выглядело
  // как разнос: 37 рад/с и корпус вверх ногами у самого пятна.
  const swayReferenceX = onApproach ? approach.heading[0] : tangentX;
  const swayReferenceZ = onApproach ? approach.heading[1] : tangentZ;
  const swayAlong =
    errorX * swayReferenceX + errorZ * swayReferenceZ;
  const swayCrossX = errorX - swayReferenceX * swayAlong;
  const swayCrossZ = errorZ - swayReferenceZ * swayAlong;
  const lateralOffset =
    swayCrossX * starboardAxis[0] + swayCrossZ * starboardAxis[1];
  const starboardOffsetX = -heading[1];
  const starboardOffsetZ = heading[0];
  const requestedLateralSpeed =
    (limits.lateralThrust ?? 0) <= 1e-6
      ? 0
      : holonomicBerthHold
        ? // Вторая половина того же вектора: борт добирает ту часть промаха,
          // которую нос не закрывает. Вместе они дают ровно `berthDemand`.
          berthDemandX * starboardOffsetX + berthDemandZ * starboardOffsetZ
        : holonomicRoute
          ? // На маршруте — та же пара: борт довозит поперечную часть хода.
            // Отдельного контура сноса здесь больше нет, он был бы вторым
            // счётом того же самого: прицел лежит НА линии, и вектор на него
            // сам возвращает машину к трассе.
            routeDemandX * starboardOffsetX + routeDemandZ * starboardOffsetZ
          : Math.max(
              -berthHoldSpeed,
              Math.min(berthHoldSpeed, (lateralOffset * 0.9) / 1.6),
            );
  const guidance: VehicleGuidanceDemand = {
    forwardSpeed: requestedForwardSpeed,
    lateralSpeed: requestedLateralSpeed,
    yawRate: requestedYawRate,
    liftFraction,
    approachPhase: onApproach,
    // Допуск объявляется ВСЕГДА: у политики один владелец — автопилот, и
    // реактивный губернатор заноса обязан жить той же политикой (в том числе
    // выведенной из векторируемости), а не запасными умолчаниями рантайма.
    slipAllowance: Math.min(
      onApproach
        ? slipPolicyOf(model).onApproach
        : Number.POSITIVE_INFINITY,
      plan.corridor !== undefined
        ? slipAllowanceForCorridor(plan.corridor(progress), slipPolicyOf(model))
        : slipPolicyOf(model).enRoute,
    ),
    // Только для машины с векторируемой тягой: неголономная поворачивает носом
    // и боковое ускорение исполнить не может. Боковое `v²/r` и продольное
    // торможение профиля складываются в ОДИН вектор: манёвр — единое целое.
    // ОДИН вектор в трёх осях из одного расчёта: вираж, гребень и торможение —
    // не отдельные каналы, а одно ускорение одной кривой.
    pathAcceleration:
      (limits.lateralThrust ?? 0) > 1e-6 && !onApproach
        ? pathKinematics?.acceleration
        : undefined,
  };
  const shipControl = shipControlsForGuidance(
    guidance,
    heading,
    groundSpeed,
    velocity,
    angularVelocity,
    model,
    nose,
    braking,
    safetyIntervention || holonomicBerthHold,
  );

  return {
    headingTarget: [wanted[0], wanted[1]],
    controls: shipControl.controls,
    desiredYawRate: shipControl.desiredYawRate,
    goAround,
    guidance,
  };
}

/**
 * Место посадки на облёт: у самого носа головного вагона, изнутри салона.
 */
export const SKY_TRAIN_RIDE_POST: SceneVector3 = [-6.2, 2.2, 77.6];
export const RIDE_APPROACH_RADIUS = 2.4;
export const RIDE_RELEASE_RADIUS = 3.4;

/**
 * Салон корабля и точка, куда проводник ссаживает пассажира с ПУСТОГО рейса:
 * круг от табло уходит без людей. На обзорный облёт, наоборот, садятся.
 */
export const SKY_TRAIN_CABIN = {
  min: [-9.34, 1.2, 75.9] as SceneVector3,
  max: [18.8, 4.4, 79.4] as SceneVector3,
};
/**
 * Высадка задаётся ЦЕНТРОМ капсулы, а не полом под ней: настил перрона 1.3
 * (`skyBerthMetrics.platformTop`) плюс полувысота игрока. Раньше здесь стояла
 * сама высота настила, и на отходе — ровно когда огни перестают мигать и
 * загораются ровно — проводник ставил пассажира на полметра внутрь плиты.
 */
export const SKY_TRAIN_PLATFORM_DROP: SceneVector3 = [
  -1.1,
  1.3 + PLAYER_CAPSULE_FOOT_OFFSET + 0.04,
  74.6,
];

export function isInsideCabin(point: SceneVector3): boolean {
  return [0, 1, 2].every(
    (axis) =>
      point[axis] >= SKY_TRAIN_CABIN.min[axis] &&
      point[axis] <= SKY_TRAIN_CABIN.max[axis],
  );
}

/**
 * Табло отправления: подходя к нему, пассажир видит подсказку и может
 * отправить рейс. Радиусы подхода и отпускания — как у дверей.
 */
export const SKY_TRAIN_DEPARTURE_BOARD: SceneVector3 = [11.9, 2.6, 70.4];
export const DEPARTURE_APPROACH_RADIUS = 3.6;
export const DEPARTURE_RELEASE_RADIUS = 4.8;
