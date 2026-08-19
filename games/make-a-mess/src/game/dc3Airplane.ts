import type {
  BreakableMaterial,
  BreakablePieceDefinition,
  BreakableShape,
  CommandActuatorTag,
  SceneVector3,
} from "./destructionScene.ts";
import { structuralMaterialProfiles } from "./destructionScene.ts";
import type {
  AirplaneControlChannel,
  AirplaneControlSurface,
  AirplaneEmpennage,
  AirplanePropeller,
  AirplanePassport,
  AirplaneStation,
  AirplaneSurfaceCommand,
  AirplaneWingSection,
} from "./airplaneDynamics.ts";
import { AIR_DENSITY, GRAVITY, airplaneReferenceSpeed } from "./airplaneDynamics.ts";
import type { VehicleLiftSource } from "./vehicleLiftGeometry.ts";
import type {
  ShipLimits,
  VehicleFrameDefinition,
  VehicleSupportStrutDefinition,
} from "./vehicleFrames.ts";
import { massProperties, type MassProperties } from "./clusterDynamics.ts";
import {
  STRUT_DEFAULT_GRIP,
  WHEEL_STEER_RANGE,
  type StrutRetraction,
} from "./supportStrut.ts";
import { dc3AirframeParts } from "../content/objects/aircraft/dc3AirframeParts.ts";
import { dc3BlockoutObject } from "../content/objects/aircraft/dc3BlockoutObject.ts";
import type { ObjectLabPart } from "../content/objects/dutchWindmills/objectModel.ts";
import {
  DC3_LENGTH,
  DC3_WING_AREA,
  DC3_WINGSPAN,
} from "../content/objects/aircraft/dc3Dimensions.ts";

/**
 * Класс DC-3: крылатая машина.
 *
 * Геометрия живёт в Object Lab (`dc3BlockoutObject`). Этот файл объявляет
 * вид судна, читает из объекта куски с актуаторами и собирает кадр.
 * Посадка в мир — `islandAirportDc3.ts`: полоса 09, нос на восток.
 * В `airVehicles` и `vehicleFrames` машины ещё нет — стоит, не летает.
 * Силовой стенд гоняет скомпилированные куски напрямую.
 */

export interface Dc3AirplanePlacement {
  readonly sceneId: string;
  readonly clusterId: string;
  readonly position: SceneVector3;
  readonly yaw: number;
}

export const DC3_ENGINE_HALF_SPAN = 5.79;
export const DC3_WING_PANEL_COUNT = 4;

const CL_MAX = 1.48;

export const DC3_WING_PANELS = [
  [-10.2, 0.18, 1.1],
  [-10.2, 0.18, -2.2],
  [10.2, 0.18, 1.1],
  [10.2, 0.18, -2.2],
] as const;

export const DC3_ACTUATOR_PIECES: readonly {
  readonly id: string;
  readonly actuator: CommandActuatorTag;
}[] = [
  { id: "engine-left-crankcase", actuator: { id: "engine-left", commandChannel: "throttle:0", required: true } },
  { id: "engine-right-crankcase", actuator: { id: "engine-right", commandChannel: "throttle:1", required: true } },
  { id: "aileron-left", actuator: { id: "aileron", commandChannel: "aileron", contribution: 1 } },
  { id: "aileron-right", actuator: { id: "aileron", commandChannel: "aileron", contribution: 1 } },
  { id: "elevator-left", actuator: { id: "elevator", commandChannel: "elevator", contribution: 1 } },
  { id: "elevator-right", actuator: { id: "elevator", commandChannel: "elevator", contribution: 1 } },
  { id: "rudder", actuator: { id: "rudder", commandChannel: "rudder", required: true } },
  { id: "flap-left-inner", actuator: { id: "flap", commandChannel: "flap", contribution: 1 } },
  { id: "flap-left-outer", actuator: { id: "flap", commandChannel: "flap", contribution: 1 } },
  { id: "flap-right-inner", actuator: { id: "flap", commandChannel: "flap", contribution: 1 } },
  { id: "flap-right-outer", actuator: { id: "flap", commandChannel: "flap", contribution: 1 } },
];

export const DC3_ACTUATOR_TAGS: readonly CommandActuatorTag[] =
  DC3_ACTUATOR_PIECES.map((piece) => piece.actuator);

/**
 * Куски, которых нет во внешнем обводе компаунда.
 *
 * Сопоставление — `id.includes`, как у остальных машин. `fuselage:` (панели
 * обшивки) сюда не входит: двоеточие и дефис в `fuselage-frame-` нарочно
 * разные. `wing-` целиком нельзя: это сняло бы панели консоли.
 */
export const DC3_CONTACT_MEMBER_EXCLUDES = [
  "gear-",
  "stringer-",
  "longeron-",
  "fuselage-frame-",
  "cabin-",
  "cockpit-",
  "centre-tank-",
  "nose-equipment-",
  "mount-",
  "wing-spar-",
  "wing-former-",
  "fin-spar-",
  "stab-spar-",
] as const;

export const DC3_STAND_CLUSTER_ID = "dc3-stand:vehicle";
export const DC3_STAND_PLACEMENT: Dc3AirplanePlacement = {
  sceneId: "dc3-stand",
  clusterId: DC3_STAND_CLUSTER_ID,
  position: [0, 0, 0],
  yaw: 0,
};
const SKIN_THICKNESS = 0.012;

function rotated(value: SceneVector3, yaw: number): SceneVector3 {
  const cosine = Math.cos(yaw);
  const sine = Math.sin(yaw);
  return [
    value[0] * cosine + value[2] * sine,
    value[1],
    -value[0] * sine + value[2] * cosine,
  ];
}

export function dc3AirplaneVector(
  placement: Dc3AirplanePlacement,
  local: SceneVector3,
): SceneVector3 {
  return rotated(local, placement.yaw);
}

export function dc3AirplanePoint(
  placement: Dc3AirplanePlacement,
  local: SceneVector3,
): SceneVector3 {
  const offset = dc3AirplaneVector(placement, local);
  return [
    placement.position[0] + offset[0],
    placement.position[1] + offset[1],
    placement.position[2] + offset[2],
  ];
}

/** Inverse of `dc3AirplanePoint`: world → object-lab (pitched) coordinates. */
export function dc3AirplaneUnpoint(
  placement: Dc3AirplanePlacement,
  world: SceneVector3,
): SceneVector3 {
  const dx = world[0] - placement.position[0];
  const dz = world[2] - placement.position[2];
  const cosine = Math.cos(placement.yaw);
  const sine = Math.sin(placement.yaw);
  return [
    dx * cosine - dz * sine,
    world[1] - placement.position[1],
    dx * sine + dz * cosine,
  ];
}

function subtract(a: SceneVector3, b: SceneVector3): SceneVector3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function normalize(value: SceneVector3): SceneVector3 {
  const length = Math.hypot(...value) || 1;
  return [value[0] / length, value[1] / length, value[2] / length];
}

function cross(a: SceneVector3, b: SceneVector3): SceneVector3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function triangleArea(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  c: readonly [number, number, number],
): number {
  const ab = subtract(b, a);
  const ac = subtract(c, a);
  return 0.5 * Math.hypot(...cross(ab, ac));
}

function meshGeometry(part: Extract<ObjectLabPart, { kind: "mesh" }>): {
  readonly center: SceneVector3;
  readonly size: SceneVector3;
  readonly volume: number;
} {
  const minimum = [0, 1, 2].map((axis) =>
    Math.min(...part.vertices.map((vertex) => vertex[axis])),
  );
  const maximum = [0, 1, 2].map((axis) =>
    Math.max(...part.vertices.map((vertex) => vertex[axis])),
  );
  const center: SceneVector3 = [
    (minimum[0] + maximum[0]) / 2,
    (minimum[1] + maximum[1]) / 2,
    (minimum[2] + maximum[2]) / 2,
  ];
  const size: SceneVector3 = [
    Math.max(0.02, maximum[0] - minimum[0]),
    Math.max(0.02, maximum[1] - minimum[1]),
    Math.max(0.02, maximum[2] - minimum[2]),
  ];
  const area = part.triangles.reduce(
    (sum, [a, b, c]) =>
      sum + triangleArea(part.vertices[a], part.vertices[b], part.vertices[c]),
    0,
  );
  const thickness = part.group.startsWith("structure-") ? 0.04 : SKIN_THICKNESS;
  // Замкнутая плитка обшивки несёт свой объём сама: «площадь × толщина»
  // написана для одиночной оболочки и на плитке удваивает его — у неё две
  // поверхности и кромка вместо одной оболочки. Иначе стенд и мир снова
  // разойдутся, теперь по массе.
  return {
    center,
    size,
    volume: part.volume ?? Math.max(0.0002, area * thickness),
  };
}

function rodGeometry(part: Extract<ObjectLabPart, { kind: "cylinder" | "beam" }>): {
  readonly center: SceneVector3;
  readonly size: SceneVector3;
  readonly volume: number;
} {
  const center: SceneVector3 = [
    (part.from[0] + part.to[0]) / 2,
    (part.from[1] + part.to[1]) / 2,
    (part.from[2] + part.to[2]) / 2,
  ];
  const length = Math.hypot(
    part.to[0] - part.from[0],
    part.to[1] - part.from[1],
    part.to[2] - part.from[2],
  );
  if (part.kind === "cylinder") {
    return {
      center,
      size: [part.radius * 2, length, part.radius * 2],
      volume: Math.PI * part.radius * part.radius * length,
    };
  }
  return {
    center,
    size: [part.width, length, part.depth],
    volume: part.width * part.depth * length,
  };
}

function partGeometry(part: ObjectLabPart): {
  readonly center: SceneVector3;
  readonly size: SceneVector3;
  readonly volume: number;
} {
  if (part.kind === "mesh") return meshGeometry(part);
  if (part.kind === "box") {
    return {
      center: [part.center[0], part.center[1], part.center[2]],
      size: [part.size[0], part.size[1], part.size[2]],
      volume: part.volume ?? part.size[0] * part.size[1] * part.size[2],
    };
  }
  return rodGeometry(part);
}

function materialFor(part: ObjectLabPart): {
  readonly material: BreakableMaterial;
  readonly shape: BreakableShape;
  readonly color: string;
} {
  if (part.group === "gear" && /wheel$/.test(part.id)) {
    return { material: "wood", shape: "panel", color: "#2a2c2d" };
  }
  if (part.group === "window-glazing") {
    return { material: "glass", shape: "glassPane", color: "#2f3634" };
  }
  if (part.group === "window-frame") {
    return { material: "aluminium", shape: "steelSheet", color: "#8a8e8c" };
  }
  if (part.group === "centre-tanks") {
    return { material: "wood", shape: "panel", color: "#6c6f63" };
  }
  if (part.group === "cabin-floor") {
    return { material: "wood", shape: "panel", color: "#4a4038" };
  }
  if (part.group === "cockpit") {
    if (part.id === "cockpit-floor") {
      return { material: "wood", shape: "panel", color: "#4a4038" };
    }
    if (part.id.startsWith("cockpit-seat-") && !part.id.endsWith("-leg")) {
      return { material: "cloth", shape: "panel", color: "#3d454c" };
    }
    if (part.id.startsWith("cockpit-bulkhead")) {
      return { material: "cloth", shape: "panel", color: "#5a5248" };
    }
    if (part.id.startsWith("cockpit-lamp-") && part.id.endsWith("-shade")) {
      return { material: "aluminium", shape: "panel", color: "#7a6f5d" };
    }
    if (part.id.endsWith("-knob")) {
      return { material: "wood", shape: "panel", color: "#d8d0c4" };
    }
    if (part.id === "cockpit-panel") {
      return { material: "steel", shape: "panel", color: "#2a2d30" };
    }
    return { material: "steel", shape: "panel", color: "#3a3f42" };
  }
  if (part.material === "lamp-glass") {
    return { material: "glass", shape: "glassPane", color: "#b9c7c8" };
  }
  if (part.material === "lamp-bulb") {
    if (part.id.includes("nav-light-port")) {
      return { material: "glass", shape: "glassPane", color: "#f08a80" };
    }
    if (part.id.includes("nav-light-starboard")) {
      return { material: "glass", shape: "glassPane", color: "#7fd0a0" };
    }
    if (part.id.includes("nav-light-tail")) {
      return { material: "glass", shape: "glassPane", color: "#f4f1e2" };
    }
    return { material: "glass", shape: "panel", color: "#f4e4c4" };
  }
  if (part.group === "cabin-seats" || part.group === "cabin-trim") {
    return { material: "cloth", shape: "panel", color: "#4d5a63" };
  }
  if (part.group === "cabin-entry-overlay") {
    if (part.id.endsWith(":board:1")) {
      return { material: "wood", shape: "panel", color: "#1c201e" };
    }
    return { material: "aluminium", shape: "steelSheet", color: "#c9ccc6" };
  }
  if (part.group === "gear-fittings") {
    return { material: "steel", shape: "panel", color: "#7d6a4f" };
  }
  if (part.group === "cabin-frame") {
    return { material: "steel", shape: "panel", color: "#8d9a8e" };
  }
  // ОПЕРЕНИЕ — ЛЁГКИЙ СПЛАВ, КАК У НАСТОЯЩЕЙ МАШИНЫ. Стальные лонжероны
  // стабилизатора и киля на десятиметровом плече утащили центр масс назад
  // (замер 19.08.2026: −10.1 ед·м момента из общего сдвига −19.3, машина
  // отрывалась на закритических углах). Алюминий возвращает хвосту честный
  // вес: у DC-3 всё оперение дюралевое.
  if (part.group === "structure-empennage") {
    return { material: "aluminium", shape: "panel", color: "#5c6164" };
  }
  // Начинка носового отсека — сплошная сталь (батареи, радиостойки).
  if (part.group === "nose-equipment") {
    return { material: "steel", shape: "steelSheet", color: "#3a3f42" };
  }
  if (part.group.startsWith("structure-")) {
    return { material: "steel", shape: "panel", color: "#5c6164" };
  }
  if (part.material === "metal" && part.group.startsWith("engine-")) {
    return { material: "steel", shape: "steelSheet", color: "#5c6164" };
  }
  return { material: "aluminium", shape: "steelSheet", color: "#c9ccc6" };
}

export function dc3ActuatorFor(part: Pick<ObjectLabPart, "id" | "group">): CommandActuatorTag | undefined {
  const match = DC3_ACTUATOR_PIECES.find((entry) => entry.id === part.id);
  return match?.actuator;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Угол створки из команды автомата. Петля — `surfaceHinges` объекта, не
 * дверная физика: элерон и руль высоты ходят вокруг размаха (вверх-вниз),
 * руль направления — вокруг вертикали. Ноль команды — покой.
 */
export function dc3SurfaceDeflectionDegrees(
  partId: string,
  command: Pick<AirplaneSurfaceCommand, "aileron" | "elevator" | "rudder" | "flap">,
): number {
  const hinge = dc3BlockoutObject.surfaceHinges[partId];
  if (!hinge) return 0;
  const { minDegrees, maxDegrees } = hinge.range;
  const rest = hinge.restDegrees || 0;
  if (partId.startsWith("flap-")) {
    return rest + command.flap * (minDegrees - rest) || 0;
  }
  if (partId.startsWith("aileron-")) {
    const travel = Math.max(Math.abs(minDegrees), maxDegrees);
    const signed = (partId.includes("left") ? -1 : 1) * command.aileron * travel;
    return clamp(signed, minDegrees, maxDegrees) || 0;
  }
  if (partId.startsWith("elevator-")) {
    const degrees = command.elevator >= 0
      ? command.elevator * minDegrees
      : -command.elevator * maxDegrees;
    return clamp(degrees, minDegrees, maxDegrees) || 0;
  }
  if (partId === "rudder") {
    const travel = Math.max(Math.abs(minDegrees), maxDegrees);
    return clamp(-command.rudder * travel, minDegrees, maxDegrees) || 0;
  }
  return rest;
}

function loadBearing(part: ObjectLabPart): boolean {
  if (part.group.startsWith("propeller-")) return false;
  if (part.material === "lamp-glass" || part.material === "lamp-bulb" || part.id.endsWith("-bulb")) {
    return false;
  }
  if (
    part.group.startsWith("flap-") ||
    part.group.startsWith("aileron-") ||
    part.group.startsWith("elevator-") ||
    part.group === "rudder"
  ) {
    return false;
  }
  if (part.group === "cabin-entry-overlay") return false;
  return true;
}

/**
 * Object Lab → куски кадра. Актуаторы вешаются на те же id, что в объекте.
 * Это не сцена мира: кластер стендовый.
 */
export function compileDc3AirplanePieces(): BreakablePieceDefinition[] {
  // Состав берётся из общего модуля, а НЕ из блокаута: обшивка подменена
  // панелями, и стенд обязан летать ту же машину, что грузит карта.
  return dc3AirframeParts().map((part) => {
    const geometry = partGeometry(part);
    const binding = materialFor(part);
    return {
      id: part.id,
      clusterId: DC3_STAND_CLUSTER_ID,
      material: binding.material,
      shape: binding.shape,
      position: geometry.center,
      size: geometry.size,
      volume: geometry.volume,
      color: binding.color,
      actuator: dc3ActuatorFor(part),
      bearsLoad: loadBearing(part),
    };
  });
}

export const dc3AirplaneStandPieces = compileDc3AirplanePieces();

const densityOf = (material: BreakableMaterial) =>
  structuralMaterialProfiles[material].density;

/**
 * Объёмы блок-аута — не вес типа. Стенд летит тождество сваливания;
 * центр масс и форма инерции остаются с объекта.
 */
/**
 * Масса стенда — ТА ЖЕ, что у рантайма: свойства кусков и ничего сверх.
 *
 * Прежде здесь стояла подмена на «паспортную» массу, и ровно она прятала
 * расхождение с миром: стенд летал одну машину, карта грузила другую.
 */
export function dc3AirplaneStandMass(
  pieces: readonly BreakablePieceDefinition[] = dc3AirplaneStandPieces,
): MassProperties {
  return massProperties(pieces, densityOf);
}

function unitFrom(from: SceneVector3, to: SceneVector3): SceneVector3 {
  return normalize(subtract(to, from));
}

// ---------------------------------------------------------------------------
// АЭРОДИНАМИЧЕСКИЙ ПАСПОРТ: СНЯТ С ЧЕРТЕЖА, А НЕ НАЗНАЧЕН
//
// Площади, плечи и власть створок ЗАМЕРЯЮТСЯ по нарисованным поверхностям.
// Иначе паспорт живёт своей жизнью: правка киля в Object Lab не доходит до
// устойчивости, и машина расходится с собственной картинкой молча.
// ---------------------------------------------------------------------------

/**
 * ВЕС ТИПА — ЭТО ВЕС ЕГО КУСКОВ, А НЕ ЧИСЛО ИЗ СПРАВОЧНИКА.
 *
 * Первая редакция брала вес из тождества сваливания при справочной плотности
 * воздуха и получала 8143 — в двести восемь раз больше, чем весят
 * скомпилированные куски. Стенд этого не показывал, потому что сам же и
 * подменял массу; в мире подмены нет, и машина, к которой приложены силы на
 * двести восемь своих весов, разлетается на части в первом кадре после
 * загрузки карты. Симптом нашёл Igor, причину — сравнение паспортной массы с
 * той, которую рантайм считает по кускам.
 *
 * Поэтому направление вывода развёрнуто: масса приходит СНИЗУ, из объекта, а
 * тождество сваливания решается относительно плотности среды.
 */
const densityOfMaterial = (material: BreakableMaterial) =>
  structuralMaterialProfiles[material].density;

export const DC3_STALL_MASS = massProperties(
  dc3AirplaneStandPieces,
  densityOfMaterial,
).mass;
export const DC3_STALL_WEIGHT = DC3_STALL_MASS * GRAVITY;

/**
 * ВОЗДУХ — СВОЙСТВО МИРА, А НЕ САМОЛЁТА. Тождество развёрнуто (15.08.2026).
 *
 * Прежде решалась ПЛОТНОСТЬ: скорость сваливания 31 м/с считалась
 * паспортной, площадь крыла published, масса приходила из объекта. Пока масса
 * не менялась, это работало. Но масса — величина модели: как только из набора
 * убрали сплошные шпангоуты-переборки, которых на машине нет, она честно
 * упала на треть, а вместе с ней рухнула и плотность среды. Подъёма на
 * фиксированной скорости отрыва перестало хватать, и разбег вырос со 150 до
 * 183 м — при том, что машина стала ЛЕГЧЕ.
 *
 * Теперь наоборот: плотность закреплена (это то же значение, при котором
 * машина летала раньше, и менять воздух под каждую правку набора неправильно),
 * а скорость сваливания ВЫВОДИТСЯ из веса. Физика прямая: тот же воздух,
 * то же крыло, машина легче — сваливается медленнее.
 */
export const DC3_AIR_DENSITY = 0.00589;

/**
 * ЭКСПЛУАТАЦИОННАЯ скорость сваливания — паспортная, а не расчётная.
 *
 * Выводить её из веса пробовали: при массе 26.3 получается 25.4 м/с, и
 * машина по такому расписанию разбегается ХУЖЕ (203 м), потому что весь
 * автомат — стадии, закрылки, набор — построен вокруг паспортных чисел.
 *
 * И это не подгонка: на настоящей машине табличная скорость сваливания
 * объявляется для МАКСИМАЛЬНОГО веса. Пустой самолёт сваливается медленнее,
 * а лётчик всё равно летает по табличке. Наши 31 и 27 — та же табличка;
 * фактический запас у лёгкой машины просто больше.
 */
const STALL_SPEED = 31;
const STALL_SPEED_FLAPS = 27;

const DC3_MASS_PROPERTIES = dc3AirplaneStandMass();

/**
 * ВЫСОТА ЦЕНТРА МАСС НАД ПЛОСКОСТЬЮ СТОЯНКИ, м.
 *
 * Весь флот говорит планами про ЦЕНТР машины: рантайм ведёт по трассе
 * `mass.centre + body.position`, и причальные позы дирижаблей записаны для
 * центра. Трасса же крылатой машины была написана высотой КОЛЁС — глиссада
 * кончалась на бетоне. Контур честно держал центр на такой глиссаде, а
 * колёса всю дорогу шли на эти 2.7 м НИЖЕ — и встречали землю за ~38 м до
 * прицела: у кромки острова. Замер 15.08.2026: касание в край берега при
 * идеальном следовании профилю; «странный манёвр» перед ударом — это
 * выравнивание, начатое когда колёса уже цепляли грунт.
 *
 * Правило одно: план говорит центром, колёсная высота — внутренняя
 * арифметика трассы через эту константу.
 */
export const DC3_GUIDANCE_CENTRE_HEIGHT = DC3_MASS_PROPERTIES.centre[1];

/** Полуколея главных стоек, м — плечо якорного разворота. */
export const DC3_MAIN_WHEEL_HALF_TRACK = Math.abs(
  dc3BlockoutObject.anchors.leftMainWheel[0],
);

/**
 * Ось главных стоек ВПЕРЕДИ центра масс, м. Знак и величина следуют прямо
 * из центра массы и якорей колёс Object Lab.
 */
export const DC3_MAIN_AXLE_AHEAD_OF_CENTRE =
  dc3BlockoutObject.anchors.leftMainWheel[2] - DC3_MASS_PROPERTIES.centre[2];

/** Пневматик главных колёс на бетоне: доля нормальной реакции. */
const DC3_MAIN_WHEEL_ROLLING_RESISTANCE = 0.02;

type Axis = 0 | 1 | 2;

/**
 * Замер несущей поверхности по её сетке: площадь, размах, центр площади и
 * СРЕДНЯЯ ЧЕТВЕРТЬ ХОРДЫ. Полоски по размаху, в каждой — своя передняя кромка
 * и своя хорда; фокус поверхности есть взвешенное по хорде среднее их
 * четвертей. Это ровно то определение, которым фокус и вводится, поэтому
 * работать оно будет и на стреловидном киле, и на трапеции крыла.
 */
function measureSurface(
  ids: readonly string[],
  span: Axis,
  chord: Axis,
  /**
   * Окно по размаху: секция крыла — это ЧАСТЬ той же оболочки, а не отдельная
   * деталь. Треугольник попадает в окно по своему центроиду; шаг лофта у этого
   * крыла — 1.4 м, а граница элерона проходит между станциями 7.4 и 9.2, так
   * что ошибка деления меньше половины шага и не копится: сумма секций
   * нормируется обратно к полной площади там, где она собирается.
   */
  window: readonly [number, number] = [
    Number.NEGATIVE_INFINITY,
    Number.POSITIVE_INFINITY,
  ],
): {
  readonly area: number;
  readonly span: number;
  readonly spanLow: number;
  readonly spanHigh: number;
  readonly spanCentre: number;
  readonly meanChord: number;
  readonly focus: number;
  readonly height: number;
} {
  const vertices: (readonly [number, number, number])[] = [];
  for (const part of dc3BlockoutObject.parts) {
    if (part.kind !== "mesh" || !ids.includes(part.id)) continue;
    vertices.push(
      ...part.vertices.filter(
        (vertex) => vertex[span] >= window[0] && vertex[span] <= window[1],
      ),
    );
  }
  if (vertices.length === 0) {
    throw new Error(`DC-3: несущая поверхность ${ids.join(", ")} не нарисована`);
  }
  const low = Math.min(...vertices.map((vertex) => vertex[span]));
  const high = Math.max(...vertices.map((vertex) => vertex[span]));
  const strips = 24;
  const width = (high - low) / strips;
  let chordWeight = 0;
  let focusSum = 0;
  let spanSum = 0;
  let thicknessLow = Number.POSITIVE_INFINITY;
  let thicknessHigh = Number.NEGATIVE_INFINITY;
  const remaining = ([0, 1, 2] as Axis[]).find((axis) => axis !== span && axis !== chord)!;
  for (let index = 0; index < strips; index += 1) {
    const centre = low + (index + 0.5) * width;
    // Окно шире полоски: поверхность лофтится по считанным станциям, и узкая
    // полоска между ними пуста. Пустая полоска, выброшенная из суммы, съедала
    // у стабилизатора больше половины площади — и молча.
    const inside = vertices.filter(
      (vertex) => Math.abs(vertex[span] - centre) <= width,
    );
    if (inside.length < 2) continue;
    // Нос машины смотрит в +Z, поэтому передняя кромка — БОЛЬШАЯ координата.
    const leading = Math.max(...inside.map((vertex) => vertex[chord]));
    const trailing = Math.min(...inside.map((vertex) => vertex[chord]));
    const length = leading - trailing;
    chordWeight += length;
    focusSum += (leading - 0.25 * length) * length;
    spanSum += centre * length;
    thicknessLow = Math.min(thicknessLow, ...inside.map((vertex) => vertex[remaining]));
    thicknessHigh = Math.max(thicknessHigh, ...inside.map((vertex) => vertex[remaining]));
  }
  // ПЛОЩАДЬ БЕРЁТСЯ С САМОЙ СЕТКИ, А НЕ С ПОЛОСОК: проекция замкнутой оболочки
  // на плоскость считает верх и низ дважды, и это точная величина, а не оценка.
  let projected = 0;
  for (const part of dc3BlockoutObject.parts) {
    if (part.kind !== "mesh" || !ids.includes(part.id)) continue;
    for (const [a, b, c] of part.triangles) {
      const first = part.vertices[a];
      const second = part.vertices[b];
      const third = part.vertices[c];
      const middle = (first[span] + second[span] + third[span]) / 3;
      if (middle < window[0] || middle > window[1]) continue;
      const ab = subtract([...second], [...first]);
      const ac = subtract([...third], [...first]);
      projected += Math.abs(cross(ab, ac)[remaining]) / 2;
    }
  }
  const area = projected / 2;
  return {
    area,
    span: high - low,
    spanLow: low,
    spanHigh: high,
    spanCentre: spanSum / chordWeight,
    meanChord: area / Math.max(0.01, high - low),
    focus: focusSum / chordWeight,
    height: (thicknessLow + thicknessHigh) / 2,
  };
}

/** Точка объекта в терминах носа, от центра масс. */
function stationOf(local: {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}): AirplaneStation {
  return {
    ahead: local.z - DC3_MASS_PROPERTIES.centre[2],
    above: local.y - DC3_MASS_PROPERTIES.centre[1],
    right: local.x - DC3_MASS_PROPERTIES.centre[0],
  };
}

const WING_SURFACE = measureSurface(
  [
    "wing-left",
    "wing-right",
    "flap-left-inner",
    "flap-left-outer",
    "flap-right-inner",
    "flap-right-outer",
    "aileron-left",
    "aileron-right",
  ],
  0,
  2,
);
const RIGHT_WING_SURFACE = measureSurface(
  ["wing-right", "flap-right-inner", "flap-right-outer", "aileron-right"],
  0,
  2,
);
const AILERON_SURFACE = measureSurface(["aileron-left", "aileron-right"], 0, 2);

/**
 * КРЫЛО ДЕЛИТСЯ ТАМ, ГДЕ КОНЧАЕТСЯ ЭЛЕРОН, — И ЭТО ГРАНИЦА С ЧЕРТЕЖА.
 *
 * Правый элерон нарисован от 8.72 до 13.96 м по размаху при полуразмахе
 * 14.48: концевые 36%. Всё, что нужно секциям, читается прямо оттуда —
 * площадь полосы, её центроид и относительная хорда створки.
 */
const RIGHT_AILERON_SURFACE = measureSurface(["aileron-right"], 0, 2);
const RIGHT_WING_IDS = [
  "wing-right",
  "flap-right-inner",
  "flap-right-outer",
  "aileron-right",
] as const;
const RIGHT_WING_TIP = measureSurface(RIGHT_WING_IDS, 0, 2, [
  RIGHT_AILERON_SURFACE.spanLow,
  Number.POSITIVE_INFINITY,
]);
const RIGHT_WING_ROOT = measureSurface(RIGHT_WING_IDS, 0, 2, [
  Number.NEGATIVE_INFINITY,
  RIGHT_AILERON_SURFACE.spanLow,
]);
const RIGHT_FLAP_SURFACE = measureSurface(
  ["flap-right-inner", "flap-right-outer"],
  0,
  2,
);
const STABILIZER_SURFACE = measureSurface(
  ["horizontal-stabilizer", "elevator-left", "elevator-right"],
  0,
  2,
);
const ELEVATOR_SURFACE = measureSurface(["elevator-left", "elevator-right"], 0, 2);
const FIN_SURFACE = measureSurface(["vertical-fin", "rudder"], 1, 2);
const RUDDER_SURFACE = measureSurface(["rudder"], 1, 2);

/** Наклон кривой подъёма конечного крыла. Удлинение — из замера, не из головы. */
function liftSlopeFor(area: number, span: number): number {
  const aspect = (span * span) / Math.max(0.01, area);
  return (2 * Math.PI * aspect) / (aspect + 2);
}

/**
 * Власть створки. Доля площади даёт долю хорды, корень из неё — классический
 * коэффициент эффективности; остальное — полный ход петли, который нарисован
 * там же, в объекте.
 */
function controlPowerFor(
  liftSlope: number,
  surfaceArea: number,
  totalArea: number,
  travelDegrees: number,
): number {
  const ratio = Math.max(0, Math.min(1, surfaceArea / Math.max(0.01, totalArea)));
  return liftSlope * Math.sqrt(ratio) * ((travelDegrees * Math.PI) / 180);
}

const TAIL_LIFT_SLOPE = liftSlopeFor(STABILIZER_SURFACE.area, STABILIZER_SURFACE.span);
// Киль работает как полукрыло с концевой шайбой-фюзеляжем: эффективное
// удлинение примерно вдвое больше геометрического.
const FIN_LIFT_SLOPE = liftSlopeFor(FIN_SURFACE.area * 0.5, FIN_SURFACE.span);

const DC3_TAIL: AirplaneEmpennage = {
  area: STABILIZER_SURFACE.area,
  liftSlope: TAIL_LIFT_SLOPE,
  station: stationOf({
    x: 0,
    y: STABILIZER_SURFACE.height,
    z: STABILIZER_SURFACE.focus,
  }),
  controlPower: controlPowerFor(
    TAIL_LIFT_SLOPE,
    ELEVATOR_SURFACE.area,
    STABILIZER_SURFACE.area,
    22,
  ),
  // Скос за крылом: `2·Clα/(π·λ)` при удлинении, снятом с самого крыла.
  downwash:
    (2 * 4.6) / (Math.PI * ((DC3_WINGSPAN * DC3_WINGSPAN) / DC3_WING_AREA)),
};

const DC3_FIN: AirplaneEmpennage = {
  area: FIN_SURFACE.area,
  liftSlope: FIN_LIFT_SLOPE,
  station: stationOf({ x: 0, y: FIN_SURFACE.spanCentre, z: FIN_SURFACE.focus }),
  controlPower: controlPowerFor(
    FIN_LIFT_SLOPE,
    RUDDER_SURFACE.area,
    FIN_SURFACE.area,
    25,
  ),
};

/**
 * РАЗБЕГ ЗАДАЁТ ТЯГУ, А НЕ НАОБОРОТ.
 *
 * Полоса острова — 176 м, то есть впятеро короче настоящей. Чинить это
 * реализмом значило бы либо посадить машину на скорость игрушки, либо не
 * дать ей взлететь вовсе. Поправку берём с полосы: тип обязан отрываться на
 * своей `Vr` в пределах авторского разбега, а тяга получается делением.
 * Четверть сверху — на сопротивление качению и на разгонное сопротивление,
 * которых в тождестве `V² = 2·a·s` нет.
 *
 * Проверяет это `tests/island-airport-dc3.test.mjs`: разбег обязан уложиться
 * в НАСТОЯЩУЮ полосу той карты, где машина стоит.
 */
export const DC3_DESIGN_TAKEOFF_RUN = 110;
export const DC3_ROTATE_SPEED = STALL_SPEED * 1.15;
const TAKEOFF_ACCELERATION =
  (DC3_ROTATE_SPEED * DC3_ROTATE_SPEED) / (2 * DC3_DESIGN_TAKEOFF_RUN);
const DC3_ENGINE_THRUST = (DC3_STALL_MASS * TAKEOFF_ACCELERATION * 1.25) / 2;

/** Тангаж стоянки: машина хвостовая, и это её нарисованное положение. */
const DC3_GROUND_PITCH = Math.asin(
  unitFrom(dc3BlockoutObject.anchors.tail, dc3BlockoutObject.anchors.nose)[1],
);

/**
 * ЧЕТЫРЕ СЕКЦИИ КРЫЛА: ДВЕ КОРНЕВЫЕ СО ЩИТКАМИ, ДВЕ КОНЦЕВЫЕ С ЭЛЕРОНАМИ.
 *
 * Граница — начало элерона по чертежу. Площади нормируются к полной площади
 * крыла: тождество сваливания и плотность мира выведены из неё, и расходиться
 * им нельзя даже на процент.
 *
 * ДОЛЯ ЩИТКА БОЛЬШЕ ЕДИНИЦЫ, И ЭТО НЕ ОПЕЧАТКА. `clFlap` объявлен как
 * приращение CL ВСЕГО крыла, а щиток занимает только корневые секции: чтобы
 * суммарная прибавка осталась той же, местное приращение обязано быть больше
 * во столько раз, во сколько корень меньше консоли. Иначе выпуск щитка дал бы
 * 72% объявленной прибавки, и посадочная скорость поехала бы вслед.
 */
// Нормировка идёт к ПАСПОРТНОЙ площади, а не к замеренной по сетке: из неё
// выведены и тождество сваливания, и плотность мира. Оболочка даёт около 83 м²
// против авторских 91.7 — разница в центроплане, проходящем сквозь фюзеляж, —
// и секции, нормированные по сетке, отнимали у машины девять процентов подъёма.
const DC3_WING_SECTION_SCALE =
  DC3_WING_AREA / 2 / (RIGHT_WING_ROOT.area + RIGHT_WING_TIP.area);
const DC3_ROOT_AREA = RIGHT_WING_ROOT.area * DC3_WING_SECTION_SCALE;
const DC3_TIP_AREA = RIGHT_WING_TIP.area * DC3_WING_SECTION_SCALE;
const DC3_ROOT_FLAP_SHARE = (DC3_WING_AREA / 2) / DC3_ROOT_AREA;

function dc3WingSection(
  side: -1 | 1,
  strip: { area: number; spanCentre: number; focus: number; height: number },
  area: number,
  aileron: number,
  flap: number,
): AirplaneWingSection {
  return {
    station: stationOf({
      x: side * strip.spanCentre,
      y: strip.height,
      z: strip.focus,
    }),
    area,
    aileron,
    flap,
  };
}

export const DC3_WING_SECTIONS: readonly AirplaneWingSection[] = [
  dc3WingSection(-1, RIGHT_WING_ROOT, DC3_ROOT_AREA, 0, DC3_ROOT_FLAP_SHARE),
  dc3WingSection(-1, RIGHT_WING_TIP, DC3_TIP_AREA, 1, 0),
  dc3WingSection(1, RIGHT_WING_ROOT, DC3_ROOT_AREA, 0, DC3_ROOT_FLAP_SHARE),
  dc3WingSection(1, RIGHT_WING_TIP, DC3_TIP_AREA, 1, 0),
];

/** Щиток нарисован внутри корневой секции — проверка, а не пожелание. */
if (RIGHT_FLAP_SURFACE.spanHigh > RIGHT_AILERON_SURFACE.spanLow + 0.5) {
  throw new Error(
    "DC-3: щиток заходит на элеронную секцию — деление крыла больше не верно",
  );
}

/**
 * ПОТОЛОК ТОРМОЗА ПО ОПРОКИДЫВАНИЮ. Чертёж и сцепление, больше ничего:
 * главные колёса на `z=0`, центр масс на 1.03 м позади них и на 2.68 м выше
 * пятна контакта; сцепление стойки — 0.9. Отсюда `b ≤ Δx/(grip·h)`.
 */
const DC3_MAIN_WHEEL_AHEAD =
  dc3BlockoutObject.anchors.leftMainWheel[2] - DC3_MASS_PROPERTIES.centre[2];
const DC3_CENTRE_HEIGHT =
  DC3_MASS_PROPERTIES.centre[1] - dc3BlockoutObject.anchors.leftMainWheel[1];
/**
 * ЗАПАС ДО ОПРОКИДЫВАНИЯ, а не сам порог.
 *
 * Опрокидывание начинается, когда момент тормозной силы вокруг оси главных
 * колёс перебарывает момент веса: при доле тормоза `b > Δx/h`. У этой машины
 * Δx = 1.05 м, h = 2.59 м, то есть порог 0.406.
 *
 * Прежняя формула делила на сцепление и выдавала 0.451 — ВЫШЕ порога. Автомат
 * получал право тормозить ровно на грани, и садящаяся машина вставала на нос
 * от любого переходного процесса на касании: обжатие стойки на миг повышает
 * нормальную нагрузку, и грань переходится. Раньше это не вылезало только
 * потому, что посадка не доезжала до пробега вовсе.
 *
 * Поэтому потолок берётся ДОЛЕЙ от порога. 0.7 — обычный инженерный запас на
 * переходный процесс, и он оставляет тормоз сильным: 0.28 веса это пробег
 * заметно короче полосы.
 */
const DC3_TIP_OVER_MARGIN = 0.7;
const DC3_BRAKE_CEILING = Math.max(
  0.1,
  Math.min(1, DC3_TIP_OVER_MARGIN * (DC3_MAIN_WHEEL_AHEAD / DC3_CENTRE_HEIGHT)),
);

/**
 * ВЕРТИКАЛЬНАЯ ВЛАСТЬ, доля веса. Ею меряется не только набор: профиль трассы
 * обязан скругляться так, чтобы нормальная перегрузка на скруглении в неё
 * укладывалась, иначе излом остаётся изломом при любой длине.
 */
export const DC3_LIFT_TRIM_RANGE = 0.22;

export const DC3_AIRPLANE_PASSPORT: AirplanePassport = {
  airDensity: DC3_AIR_DENSITY,
  wingArea: DC3_WING_AREA,
  wingSpan: DC3_WINGSPAN,
  meanChord: DC3_WING_AREA / DC3_WINGSPAN,
  stallSpeed: STALL_SPEED,
  stallSpeedFlaps: STALL_SPEED_FLAPS,
  // Крейсер и потолок хода — от круга над островом, а не от справочника типа:
  // на 48 м/с вираж с паспортным креном ложится в 280 м радиуса.
  cruiseSpeed: 48,
  maximumSpeed: 62,
  cl0: 0.28,
  clAlpha: 4.6,
  clFlap: 0.55,
  clMax: CL_MAX,
  cd0: 0.032,
  inducedFactor: 0.055,
  enginePower: DC3_ENGINE_THRUST,
  engineStations: [
    stationOf({
      x: -DC3_ENGINE_HALF_SPAN,
      y: dc3BlockoutObject.anchors.leftProp[1],
      z: dc3BlockoutObject.anchors.leftProp[2],
    }),
    stationOf({
      x: DC3_ENGINE_HALF_SPAN,
      y: dc3BlockoutObject.anchors.rightProp[1],
      z: dc3BlockoutObject.anchors.rightProp[2],
    }),
  ],
  wingSections: DC3_WING_SECTIONS,
  // МЕСТНОЕ приращение на концевой полосе, а не среднее по консоли: доля
  // хорды берётся у полосы, где створка висит (0.27), а не у всей консоли.
  aileronPower: controlPowerFor(
    4.6,
    RIGHT_AILERON_SURFACE.area,
    RIGHT_WING_TIP.area,
    25,
  ),
  tail: DC3_TAIL,
  fin: DC3_FIN,
  maximumBank: (40 * Math.PI) / 180,
  maximumClimbAngle: (12 * Math.PI) / 180,
  rotateSpeed: DC3_ROTATE_SPEED,
  groundPitch: DC3_GROUND_PITCH,
  brakeCeiling: DC3_BRAKE_CEILING,
  // База и ход рулевого колеса — с чертежа и из общего закона опоры.
  wheelbase: Math.abs(
    dc3BlockoutObject.anchors.tailwheel[2] -
      dc3BlockoutObject.anchors.leftMainWheel[2],
  ),
  steerRange: WHEEL_STEER_RANGE,
  // Геометрия колеи — с чертежа: из неё автопилот считает точку начала
  // разворота вокруг блокируемого колеса.
  mainWheelHalfTrack: DC3_MAIN_WHEEL_HALF_TRACK,
  mainWheelRollingResistance: DC3_MAIN_WHEEL_ROLLING_RESISTANCE,
  mainAxleAheadOfCentre: DC3_MAIN_AXLE_AHEAD_OF_CENTRE,
};

export const DC3_AIRPLANE_CLASS = {
  id: "douglas-dc3",
  liftSource: "wing" as VehicleLiftSource,
  worldIntegration: true,
  envelope: {
    wingspan: DC3_WINGSPAN,
    length: DC3_LENGTH,
    wingArea: DC3_WING_AREA,
  },
  passport: DC3_AIRPLANE_PASSPORT,
  wingPanels: DC3_WING_PANELS,
  actuators: DC3_ACTUATOR_PIECES,
  landing: {
    // ── ПОСАДКА КРЫЛАТОЙ МАШИНЫ ЗАВЕРШАЕТСЯ ОСТАНОВКОЙ НА ПОЛОСЕ ─────────
    //
    // Радиус — НЕ пятно коптера. Восемь метров от стояночной точки требовали
    // от самолёта ДОЕХАТЬ до неё: вставший посреди полосы рейс не закрывался,
    // автопилот продолжал тянуть машину к точке, и она выкатывалась за торец,
    // крутя двигателями (замер 15.08.2026). Тормозной путь — свойство машины
    // и точки касания, а не константа; полоса целиком и есть посадочное
    // пятно самолёта… было переходной меркой, пока не появился рулёжный
    // хвост: теперь машина сама довозит себя к стартовой точке 09 по ВПП 08,
    // и прибытие — это стоянка У ТОЧКИ СТАРТА, носом на восток.
    radius: 12,
    height: 0.6,
    // Стоп есть стоп: рулёжный ход — уже не посадка.
    speed: 1.5,
    verticalSpeed: 1.2,
    uprightCos: 0.92,
    angularSpeed: 0.35,
  },
} as const;

// ---------------------------------------------------------------------------
// ШАССИ
//
// Три стойки, и ни одного собственного коллайдера: опору держит луч
// (`supportStrut.ts`), а куски `gear-` выключены из обвода компаунда — иначе
// луч нашёл бы землю в собственном колесе.
// ---------------------------------------------------------------------------

/** Ход олео. Снят с нарисованной стойки: метр колена на пятую часть хода. */
const DC3_OLEO_STROKE = 0.22;
const DC3_TAIL_OLEO_STROKE = 0.09;

function gearPart(id: string): Extract<ObjectLabPart, { kind: "cylinder" }> {
  const part = dc3BlockoutObject.parts.find(
    (candidate) => candidate.id === id && candidate.kind === "cylinder",
  );
  if (!part || part.kind !== "cylinder") {
    throw new Error(`DC-3: стойка ${id} не нарисована цилиндром`);
  }
  return part;
}

function strutFor(options: {
  readonly id: string;
  readonly strutPart: string;
  readonly wheelPart: string;
  readonly stroke: number;
  readonly brakeShare: number;
  readonly steerShare: number;
  readonly side: -1 | 0 | 1;
  readonly travelling: readonly string[];
  readonly halfTravelling?: readonly string[];
  readonly retraction?: {
    readonly retraction: StrutRetraction;
    readonly foldingMembers: readonly string[];
  };
  readonly placement: Dc3AirplanePlacement;
}): VehicleSupportStrutDefinition {
  const leg = gearPart(options.strutPart);
  const wheel = gearPart(options.wheelPart);
  // Верх стойки — точка, ИЗ КОТОРОЙ выходит шток, а не центр колеса.
  const mount = dc3AirplanePoint(options.placement, [
    leg.from[0],
    leg.from[1],
    leg.from[2],
  ]);
  const axis = dc3AirplaneVector(options.placement, [
    leg.to[0] - leg.from[0],
    leg.to[1] - leg.from[1],
    leg.to[2] - leg.from[2],
  ]);
  return {
    plan: {
      id: options.id,
      mount,
      axis,
      groundHeight: options.placement.position[1],
      stroke: options.stroke,
      staticSagShare: 0.28,
      // Потолок перегрузки, который стойка отдаёт корпусу.
      compressedLoadFactor: 4.5,
      designSinkRate: 2.5,
      oilShareAtDesignRate: 2,
      recoilSeconds: 1.1,
    },
    requiredMembers: [`:${options.strutPart}:`, `:${options.wheelPart}:`],
    // УБОРКА: ВПЕРЁД, ВОКРУГ РАЗМАХНОЙ ОСИ, И КОЛЕСО ОСТАЁТСЯ СНАРУЖИ.
    //
    // Приводится общим правилом рейса, а не своим таймером: нога уходит при
    // переходе в крейсер и возвращается на подходе; отказ выпускает её тоже.
    // Хвостовое колесо у этого типа НЕ убирается, поэтому уборки у него нет.
    //
    // Угол 101° — не круглое число и не вкус: он решён из условия «покрышка
    // торчит примерно на треть». При 95° снаружи 39%, при 107° — 21%.
    // Полностью в гондолу колесо не прячется никогда, и по этому силуэту
    // машину узнают.
    ...(options.retraction ?? {}),
    // ЧТО ИМЕННО ХОДИТ ПРИ ОБЖАТИИ.
    //
    // Раньше ездило одно колесо, потому что стойка и была одной палкой.
    // Теперь узел разобран, и амортизация обязана двигать ровно то, что
    // сидит на штоке: сам шток, ось, барабан и покрышку. Цилиндр, цапфа и
    // подкос стоят. Шлиц-шарнир ходит НА ПОЛХОДА — его колено делит ход
    // пополам, для того он и нужен.
    travellingMembers: options.travelling,
    halfTravellingMembers: options.halfTravelling,
    wheel: {
      radius: wheel.radius,
      brakeShare: options.brakeShare,
      steerShare: options.steerShare,
      side: options.side,
      // Пневматик на бетоне: доля веса, которая останавливает брошенную машину.
      // Поворотная хвостовая стойка не создаёт продольного сопротивления.
      rollingResistance:
        options.side === 0 ? 0 : DC3_MAIN_WHEEL_ROLLING_RESISTANCE,
      spinMember: `:${options.wheelPart}:`,
      spinAxis: dc3AirplaneVector(options.placement, [1, 0, 0]),
    },
  };
}

/**
 * Уборка основной стойки: вперёд на 101° вокруг размахной оси за 6.5 с.
 * Цапфа берётся из САМОЙ стойки, чтобы число жило в одном месте.
 */
const DC3_GEAR_RETRACT_ANGLE = (-101 * Math.PI) / 180;
const DC3_GEAR_RETRACT_SECONDS = 6.5;

export function createDc3LandingGear(
  placement: Dc3AirplanePlacement,
): readonly VehicleSupportStrutDefinition[] {
  return [
    strutFor({
      id: "gear-left",
      strutPart: "gear-left-strut",
      wheelPart: "gear-left-wheel",
      travelling: [
        ":gear-left-piston:",
        ":gear-left-axle:",
        ":gear-left-hub:",
        ":gear-left-wheel:",
      ],
      halfTravelling: [
        ":gear-left-scissor-upper:",
        ":gear-left-scissor-lower:",
      ],
      retraction: {
        retraction: {
          pivot: dc3AirplanePoint(placement, gearPart("gear-left-strut").from),
          hinge: dc3AirplaneVector(placement, [1, 0, 0]),
          angle: DC3_GEAR_RETRACT_ANGLE,
          seconds: DC3_GEAR_RETRACT_SECONDS,
        },
        foldingMembers: [
          ":gear-left-strut:",
          ":gear-left-piston:",
          ":gear-left-scissor-lug:",
          ":gear-left-scissor-upper:",
          ":gear-left-scissor-lower:",
          ":gear-left-drag-link:",
          ":gear-left-axle:",
          ":gear-left-hub:",
          ":gear-left-wheel:",
        ],
      },
      side: -1,
      stroke: DC3_OLEO_STROKE,
      brakeShare: 0.5,
      steerShare: 0,
      placement,
    }),
    strutFor({
      id: "gear-right",
      strutPart: "gear-right-strut",
      wheelPart: "gear-right-wheel",
      travelling: [
        ":gear-right-piston:",
        ":gear-right-axle:",
        ":gear-right-hub:",
        ":gear-right-wheel:",
      ],
      halfTravelling: [
        ":gear-right-scissor-upper:",
        ":gear-right-scissor-lower:",
      ],
      retraction: {
        retraction: {
          pivot: dc3AirplanePoint(placement, gearPart("gear-right-strut").from),
          hinge: dc3AirplaneVector(placement, [1, 0, 0]),
          angle: DC3_GEAR_RETRACT_ANGLE,
          seconds: DC3_GEAR_RETRACT_SECONDS,
        },
        foldingMembers: [
          ":gear-right-strut:",
          ":gear-right-piston:",
          ":gear-right-scissor-lug:",
          ":gear-right-scissor-upper:",
          ":gear-right-scissor-lower:",
          ":gear-right-drag-link:",
          ":gear-right-axle:",
          ":gear-right-hub:",
          ":gear-right-wheel:",
        ],
      },
      side: 1,
      stroke: DC3_OLEO_STROKE,
      brakeShare: 0.5,
      steerShare: 0,
      placement,
    }),
    // Хвостовое колесо не тормозит и не несёт: оно РУЛИТ. Тормоз на нём
    // поставил бы машину на нос на первом же пробеге.
    //
    // ДОЛЯ ХОДА ОТРИЦАТЕЛЬНА, И ЭТО НЕ ОПЕЧАТКА. Рулевое колесо, стоящее
    // ПОЗАДИ центра масс, разворачивает машину в обратную сторону от
    // носового: повёрнутое вправо, оно уводит вправо ХВОСТ, а нос идёт
    // влево. Общий закон опоры знака не знает и знать не должен — он считает
    // ось качения; знак принадлежит машине, у которой колесо сзади.
    //
    // Замер без него: машина касалась в двадцати сантиметрах от осевой и
    // уезжала на тридцать семь метров, разворачиваясь поперёк полосы, —
    // каждая поправка автопилота уводила её дальше от створа.
    strutFor({
      id: "gear-tail",
      strutPart: "gear-tail-strut",
      wheelPart: "gear-tail-wheel",
      travelling: [
        ":gear-tail-fork-left:",
        ":gear-tail-fork-right:",
        ":gear-tail-hub:",
        ":gear-tail-wheel:",
      ],
      side: 0,
      stroke: DC3_TAIL_OLEO_STROKE,
      brakeShare: 0,
      steerShare: -1,
      placement,
    }),
  ];
}


/**
 * СТВОРКИ И ВИНТЫ БЕРУТСЯ С ЧЕРТЕЖА, А НЕ ПЕРЕЧИСЛЯЮТСЯ РУКАМИ.
 *
 * Оси и ходы петель уже нарисованы в Object Lab (`surfaceHinges`), втулки —
 * в якорях. Здесь они только разворачиваются посадкой машины в мир: если
 * карта поставит DC-3 другим курсом, органы поедут вместе с ним сами.
 */
function surfaceChannelOf(partId: string): AirplaneControlChannel | null {
  if (partId.startsWith("flap-")) return "flap";
  if (partId.startsWith("aileron-")) return "aileron";
  if (partId.startsWith("elevator-")) return "elevator";
  if (partId === "rudder") return "rudder";
  return null;
}

export function createDc3ControlSurfaces(
  placement: Dc3AirplanePlacement,
): readonly AirplaneControlSurface[] {
  return Object.entries(dc3BlockoutObject.surfaceHinges).flatMap(([id, hinge]) => {
    const channel = surfaceChannelOf(id);
    if (!channel) return [];
    return [
      {
        memberMatch: `:${id}:`,
        channel,
        pivot: dc3AirplanePoint(placement, [
          hinge.pivot[0],
          hinge.pivot[1],
          hinge.pivot[2],
        ]),
        axis: dc3AirplaneVector(placement, [
          hinge.axis[0],
          hinge.axis[1],
          hinge.axis[2],
        ]),
        minDegrees: hinge.range.minDegrees,
        maxDegrees: hinge.range.maxDegrees,
        // Элероны ходят ПРОТИВОФАЗНО: правый вниз — левый вверх. Знак борта
        // читается из имени куска, как и везде у этой машины.
        sign: id.includes("left") ? -1 : 1,
      } satisfies AirplaneControlSurface,
    ];
  });
}

export function createDc3Propellers(
  placement: Dc3AirplanePlacement,
): readonly AirplanePropeller[] {
  return (["left", "right"] as const).map((side, engine) => {
    const shaft = dc3BlockoutObject.propellerShafts[side];
    return {
      memberMatch: `:${shaft.group}-blade-`,
      hub: dc3AirplanePoint(placement, shaft.pivot),
      axis: dc3AirplaneVector(placement, shaft.axis),
      phaseSign: shaft.phaseSign,
      engine,
    };
  });
}

export function createDc3AirplaneFrame(
  placement: Dc3AirplanePlacement = DC3_STAND_PLACEMENT,
): VehicleFrameDefinition {
  const anchors = dc3BlockoutObject.anchors;
  const wings = dc3AirplaneStandPieces.filter((piece) => piece.id.startsWith("wing-"));
  // ЦЕНТР ПОДЪЁМА ВЗВЕШИВАЕТСЯ ПО ОБЪЁМУ, А НЕ ПО ЧИСЛУ КУСКОВ.
  //
  // Пока крыло было двумя шкурами на двадцати двух элементах набора, среднее
  // по кускам случайно совпадало с центроидом. После панелизации семьдесят
  // мелких панелей перевесили набор, и точка уехала на 16 см ВПЕРЁД — разбег
  // вырос до 148 м, а посадка стала ударом. Величина обязана быть свойством
  // распределения материала, а не того, на сколько кусков он нарезан.
  const wingVolume = wings.reduce((sum, piece) => sum + (piece.volume ?? 0), 0);
  const localLift: SceneVector3 = wingVolume > 0
    ? [
        wings.reduce((sum, piece) => sum + piece.position[0] * (piece.volume ?? 0), 0) / wingVolume,
        wings.reduce((sum, piece) => sum + piece.position[1] * (piece.volume ?? 0), 0) / wingVolume,
        wings.reduce((sum, piece) => sum + piece.position[2] * (piece.volume ?? 0), 0) / wingVolume,
      ]
    : [0, 0.35, 0];
    const localNose = unitFrom(anchors.tail, anchors.nose);
    // Датчик сидел на якоре носа — на острие накладки. Колпачок (сфера 55 мм)
    // торчал наружу. Утоплен вдоль оси, чтобы весь визуал остался внутри
    // накладки; луч смотрит вперёд и свой корпус игнорирует.
    const noseSensorRecess = 0.095;
    const noseSensor: SceneVector3 = [
      anchors.nose[0] - localNose[0] * noseSensorRecess,
      anchors.nose[1] - localNose[1] * noseSensorRecess,
      anchors.nose[2] - localNose[2] * noseSensorRecess,
    ];
    return {
      id: DC3_AIRPLANE_CLASS.id,
      clusterId: placement.clusterId,
      telemetryLabel: "DC-3",
      // ВНЕШНИЙ ОБВОД — ОБШИВКА, НЕ НАБОР.
      //
      // Стойки уже выключены: их держит луч. Набор (стрингеры, лонжероны,
      // шпангоуты, лонжероны крыла) — длинные лофты, и Rapier берёт AABB.
      // Ящик на всю длину фюзеляжа в трёхточечной стоянке ещё проходит, а при
      // любом более плоском тангаже бьёт полосу под носом. Отсюда подскок,
      // клевок и «стоит на хвосте» при убранных стойках. Масса и картинка
      // набора не трогаются: из контакта его нет, как ног шасси.
      contactMemberExcludes: DC3_CONTACT_MEMBER_EXCLUDES,
      origin: placement.position,
      nose: dc3AirplaneVector(placement, localNose),
      mooringPoint: dc3AirplanePoint(placement, anchors.nose),
      liftCentre: dc3AirplanePoint(placement, localLift),
      envelopeMatch: "wing-",
      supportStruts: createDc3LandingGear(placement),
      controlSurfaces: createDc3ControlSurfaces(placement),
      propellers: createDc3Propellers(placement),
      // НИЖНИХ ДАТЧИКОВ ПРОСВЕТА НЕТ.
      //
      // Три датчика смотрели вниз из-под колёс — ровно туда, где стойка и так
      // меряет опору собственным лучом. Снято по вердикту владельца: лишний
      // измеритель у самой земли — это лишний повод машине об него запнуться,
      // а полезного он не давал ничего, чего не даёт стойка.
      proximitySensors: [
        {
          point: dc3AirplanePoint(placement, noseSensor),
          normal: dc3AirplaneVector(placement, localNose),
        },
      ],
    };
  }

export const dc3AirplaneStandFrame = createDc3AirplaneFrame();

export interface Dc3AirplaneStandVehicle extends VehicleFrameDefinition {
  readonly flight: {
    readonly liftSource: "wing";
    readonly airplane: AirplanePassport;
    readonly landing: (typeof DC3_AIRPLANE_CLASS)["landing"];
    readonly limits: ShipLimits;
    readonly spoolSeconds: number;
    readonly linearDamping: number;
    readonly angularDamping: number;
    readonly lateralDragRatio: number;
  };
}

export function createDc3AirplaneStandVehicle(): Dc3AirplaneStandVehicle {
  const frame = dc3AirplaneStandFrame;
  const anchors = dc3BlockoutObject.anchors;
  return {
    ...frame,
    flight: {
      liftSource: "wing",
      airplane: DC3_AIRPLANE_PASSPORT,
      landing: DC3_AIRPLANE_CLASS.landing,
      limits: {
        enginePower: DC3_AIRPLANE_PASSPORT.enginePower,
        // Пол лётной скорости: ниже Vref крыло не летит. Его обязан знать
        // каждый, кто строит машине план, — прежде всего корректор трассы,
        // чья полка 1.8–5.5 м/с писана для дирижаблей и коптеров.
        minimumSpeed: airplaneReferenceSpeed(DC3_AIRPLANE_PASSPORT, 1),
        // Общий корабельный контракт держит точки валов в осях кадра; паспорт
        // крыла считает их в терминах носа, поэтому здесь они разворачиваются
        // обратно — ровно один раз, на границе.
        enginePoints: DC3_AIRPLANE_PASSPORT.engineStations.map((station) => [
          station.right,
          station.above,
          station.ahead,
        ]) as SceneVector3[],
        maxRudderForce: 0,
        rudderReferenceSpeed: DC3_AIRPLANE_PASSPORT.cruiseSpeed,
        rudderPoint: [anchors.finTip[0], anchors.finTip[1], anchors.finTip[2]],
        liftTrimRange: DC3_LIFT_TRIM_RANGE,
        lateralThrust: 0,
      },
      spoolSeconds: 2.4,
      // ДЕМПФИРОВАНИЕ У ЭТОЙ МАШИНЫ ЖИВЁТ НА ПОВЕРХНОСТЯХ, А НЕ В КОНСТАНТЕ.
      //
      // Общий корабельный корпус гасит качку числом, потому что у дирижабля
      // нет ни киля, ни стабилизатора. У самолёта они есть, и считаются
      // честно, через `v + ω × r` на каждом плече. Оставить сверху прежние 0.42
      // значило бы задавить настоящую аэродинамику вчетверо более сильной
      // выдуманной. Остаётся малый остаток — на численную опрятность, — и
      // боковое сопротивление борта, которого в наборе поверхностей нет.
      linearDamping: 0.01,
      angularDamping: 0.05,
      lateralDragRatio: 25,
    },
  };
}

export const dc3AirplaneStandVehicle = createDc3AirplaneStandVehicle();
