// SPDX-License-Identifier: CC-BY-NC-ND-4.0
// SPDX-FileCopyrightText: 2026 Igor Kirisiuk
//
// Состав TRITON: три секции по пятнадцать метров, сорок пять метров всего.
// Настоящий поезд линии — четырёхсекционный, но длина вставки в кольцо
// задаётся длиной состава, и трёх секций достаточно, чтобы вставка не съела
// дугу. Всё остальное — по паспорту (docs/astana-brief.md, B2).
//
// Референс просмотрен вблизи: презентация LRV 001, посадка на «Нұрлы жол»,
// вагон на мосту через Есиль, ночной состав на эстакаде.
//
// Главная узнаваемая вещь — ВОЛНА. Борт покрашен в два цвета, и граница
// между ними не горизонтальна: у хвоста она идёт низко, к кабине круто
// взмывает и обходит лобовое стекло. Поэтому борт собран вертикальными
// полосами: каждая знает, где в ней проходит волна, и делится на два куска.
//
// Секции — три отдельных кластера. Состав задуман составным кинематическим
// объектом (`compoundKinematicCluster`): у каждой секции своя поза на пути,
// и на дуге они разворачиваются друг относительно друга, как настоящие.

import type { MutableGroup } from "./astanaAuthoring.ts";
import type { SceneVector3 } from "../../../game/destructionScene.ts";
import { orient, primitive } from "./astanaAuthoring.ts";
import {
  TRAIN_LENGTH,
  ringPathPoint,
  stationDistance,
} from "./astanaPlan.ts";
import { PLATFORM_Y, RAIL_HEAD } from "./astanaRing.ts";

export { RAIL_HEAD };

/** Секций в составе и длина секции. */
export const TRAIN_SECTIONS = 3;
export const SECTION_LENGTH = TRAIN_LENGTH / TRAIN_SECTIONS;
export const CAR_WIDTH = 2.8;
/** Пол вагона: на два сантиметра выше платформы, посадка в один шаг. */
export const CAR_FLOOR = PLATFORM_Y + 0.02;
/** Колесо: диаметр 660 мм, как у настоящей тележки. */
const WHEEL_RADIUS = 0.33;
/** Рама тележки лежит на колёсах, рама кузова — на ней. */
const BOGIE_FRAME_TOP = RAIL_HEAD + WHEEL_RADIUS * 2 + 0.24;
const SILL = CAR_FLOOR + 0.72;
const HEADER = CAR_FLOOR + 2.02;
const ROOF = CAR_FLOOR + 2.35;
const SKIRT_BOTTOM = RAIL_HEAD + 0.34;
const DOOR_WIDTH = 1.9;
/** Где стоит состав: на эталонной станции, «Нұрлы жол». */
export const TRAIN_STATION = "west" as const;

const TURQUOISE = "#7fc6cc";
const GREY = "#8b9296";
const GREY_LIGHT = "#a3a9ac";
const DARK_GLASS = "#2b3338";
const BLACK = "#1b1f22";
const SKIRT = "#4d5356";
const IRON = "#3f4548";
const STEEL = "#b0b4b6";
const ORANGE = "#d4762f";
const YELLOW = "#e0b32c";
const WHITE = "#eef1f2";

export interface TrainFrame {
  /** Единичный вектор по ходу состава. */
  readonly along: readonly [number, number];
  /** Единичный вектор влево от хода — к центру острова. */
  readonly inward: readonly [number, number];
  readonly yaw: number;
  readonly centre: readonly [number, number];
}

/**
 * Кадр состава в точке пути. Он же понадобится физике: состав едет по
 * кольцу, и его поза в любой момент — это точка пути плюс курс в ней.
 */
export function trainFrameAt(distance: number): TrainFrame {
  const centre = ringPathPoint(distance);
  const ahead = ringPathPoint(distance + 1);
  const behind = ringPathPoint(distance - 1);
  const dx = ahead[0] - behind[0];
  const dz = ahead[1] - behind[1];
  const length = Math.hypot(dx, dz);
  const along = [dx / length, dz / length] as const;
  return {
    along,
    inward: [-along[1], along[0]] as const,
    yaw: Math.atan2(-along[1], along[0]),
    centre,
  };
}

/** Точка вагона: t вдоль состава, w влево от оси пути, y абсолютная. */
function point(
  frame: TrainFrame,
  t: number,
  w: number,
): readonly [number, number] {
  return [
    frame.centre[0] + frame.along[0] * t + frame.inward[0] * w,
    frame.centre[1] + frame.along[1] * t + frame.inward[1] * w,
  ];
}

/**
 * ПРОФИЛЬ КУЗОВА. Прямая коробка постоянного сечения — главное, чем состав не
 * похож на оригинал. У настоящего вагона борт поджимается к кабине на длине
 * около двух с половиной метров, крыша уже борта, юбка подобрана, а у стыка
 * секций кузов сужается и уходит в тёмную гармошку с теневым зазором.
 *
 * Всё это здесь — ОДНА функция полуширины по продольной координате, и по ней
 * же режутся полосы обшивки. Так силуэт получается из одного параметра, а не
 * из двух независимо слепленных морд.
 */
/** Сколько метров занимает широкая формованная кабина. */
const NOSE_LENGTH = 3;
/** Реальная морда широкая: борт у торца поджат, но не сходится в клин. */
const NOSE_TUCK = 0.24;
/** Половина ширины теневого зазора между секциями. */
const JOINT_GAP = 0.1;
/** На какой длине кузов поджимается к стыку и насколько. */
const JOINT_TAPER = 0.9;
const JOINT_TUCK = 0.13;

/** Расстояние до ближайшего межсекционного стыка. */
function distanceToJoint(t: number): number {
  let best = Infinity;
  for (let joint = 1; joint < TRAIN_SECTIONS; joint += 1) {
    const at = -TRAIN_LENGTH / 2 + SECTION_LENGTH * joint;
    best = Math.min(best, Math.abs(t - at));
  }
  return best;
}

/** Полуширина борта в этой точке состава. */
export function bodyHalfWidth(t: number): number {
  const base = CAR_WIDTH / 2;
  const fromEnd = Math.min(t + TRAIN_LENGTH / 2, TRAIN_LENGTH / 2 - t);
  let half = base;
  if (fromEnd < NOSE_LENGTH) {
    half -= NOSE_TUCK * Math.pow(1 - smoothstep(fromEnd / NOSE_LENGTH), 1.3);
  }
  const toJoint = distanceToJoint(t);
  if (toJoint < JOINT_TAPER) {
    half -= JOINT_TUCK * (1 - smoothstep(toJoint / JOINT_TAPER));
  }
  return half;
}

/** Полуширина крыши: она заметно уже борта, плечи скруглены. */
export function roofHalfWidth(t: number): number {
  return bodyHalfWidth(t) - 0.16;
}

function smoothstep(value: number): number {
  const t = value <= 0 ? 0 : value >= 1 ? 1 : value;
  return t * t * (3 - 2 * t);
}

/** Широкий поперечный обвод кабины: u=0 торец, u=1 прямой кузов. */
export function cabSectionAt(u: number): {
  readonly halfWidth: number;
  readonly top: number;
  readonly bottom: number;
} {
  const eased = smoothstep(Math.min(1, Math.max(0, u)));
  return {
    halfWidth: (CAR_WIDTH / 2) * (0.82 + 0.18 * Math.pow(eased, 0.8)),
    top: ROOF - 0.48 * (1 - Math.pow(eased, 0.62)),
    bottom: SKIRT_BOTTOM + 0.18 * (1 - eased),
  };
}

/**
 * Высота волны на расстоянии `fromEnd` метров от ближайшей головы состава.
 * У кабины волна выше окон и обходит лобовое стекло, к середине сползает под
 * подоконный пояс и дальше идёт низко.
 */
export function liveryWaveY(fromEnd: number): number {
  const low = CAR_FLOOR + 0.24;
  const high = ROOF - 0.06;
  return low + (high - low) * Math.pow(smoothstep(1 - fromEnd / 11.5), 1.5);
}

/**
 * Вертикальная полоса борта между двумя отметками: если внутри неё проходит
 * волна, полоса делится надвое, если нет — красится целиком.
 */
function sidePanel(
  target: MutableGroup,
  id: (s: string) => string,
  frame: TrainFrame,
  name: string,
  t: number,
  width: number,
  side: 1 | -1,
  bottom: number,
  top: number,
  fromEnd: number,
): void {
  const rotation: readonly [number, number, number] = [0, frame.yaw, 0];
  const w = side * (bodyHalfWidth(t) - 0.05);
  const [px, pz] = point(frame, t, w);
  const wave = liveryWaveY(fromEnd);
  const paint = (
    suffix: string,
    from: number,
    to: number,
    colour: string,
  ): void => {
    // Кузов сварен из алюминиевого сплава. В общей физической таблице это
    // конструкционный металл с откалиброванным объёмом, а отдельный профиль
    // задаёт именно матовый окрашенный алюминий, не стальную ржавую жесть.
    primitive(target, id(`${name}:${suffix}`), "steel", "panel",
      [px, (from + to) / 2, pz], [width, to - from, 0.1], colour,
      { rotation, bearingArea: 1, volume: (to - from) * width * 0.00306,
        carriesAttachments: true, attachmentSupportMode: "cable",
        sideAttachmentReach: 0.9, textureProfile: "matte-aluminium" });
  };

  if (wave <= bottom + 0.02) {
    paint("grey", bottom, top, GREY);
    return;
  }
  if (wave >= top - 0.02) {
    paint("teal", bottom, top, TURQUOISE);
    return;
  }
  paint("teal", bottom, wave, TURQUOISE);
  paint("grey", wave, top, GREY);
}

/** Тележка: колёса, буксы, рама, тормозные цилиндры, ящик оборудования. */
function createBogie(
  target: MutableGroup,
  id: (s: string) => string,
  frame: TrainFrame,
  name: string,
  t: number,
): void {
  const rotation: readonly [number, number, number] = [0, frame.yaw, 0];
  const gauge = 1.435;
  const axleT = [-1.05, 1.05] as const;
  // Между колесом и полом вагона всего сорок сантиметров, поэтому стойка
  // короткая и честная: колесо — рама тележки — рама кузова. Букса и
  // тормозной цилиндр висят на раме, как на настоящей тележке, и в расчёте
  // держатся за неё, а не подпирают её снизу.
  for (const [index, offset] of axleT.entries()) {
    for (const side of [-1, 1] as const) {
      const [wx, wz] = point(frame, t + offset, side * gauge / 2);
      // Колесо катится по головке рельса. Ось колеса — поперёк пути, и
      // записать это надо через направление, а не «эйлером-скорописью»:
      // [PI/2, yaw, 0] уложил бы ось вдоль мировой Z при любом курсе.
      primitive(target, id(`${name}:wheel:${index}:${side > 0 ? "r" : "l"}`),
        "steel", "cylinder",
        [wx, RAIL_HEAD + WHEEL_RADIUS, wz],
        [WHEEL_RADIUS * 2, 0.11, WHEEL_RADIUS * 2], "#6d7376",
        { rotation: rodRotation(frame.inward), bearingArea: 1.4, volume: 0.24,
          carriesAttachments: true, attachmentSupportMode: "cable",
          sideAttachmentReach: 0.4 });
      // Между ступицей и бандажом виден тёмный упругий элемент — именно он
      // делает официально заявленное «эластичное колесо», а не резиновая
      // покрышка поверх рельсового бандажа.
      primitive(target,
        id(`${name}:wheel-elastomer:${index}:${side > 0 ? "r" : "l"}`),
        "plastic", "cylinder",
        [wx, RAIL_HEAD + WHEEL_RADIUS, wz],
        [WHEEL_RADIUS * 1.28, 0.125, WHEEL_RADIUS * 1.28], BLACK,
        { rotation: rodRotation(frame.inward), bearsLoad: false, volume: 0.035,
          sideAttachmentReach: 0.35 });
      primitive(target,
        id(`${name}:wheel-hub:${index}:${side > 0 ? "r" : "l"}`),
        "steel", "cylinder",
        [wx, RAIL_HEAD + WHEEL_RADIUS, wz],
        [WHEEL_RADIUS * 0.64, 0.14, WHEEL_RADIUS * 0.64], "#a5aaad",
        { rotation: rodRotation(frame.inward), bearsLoad: false, volume: 0.045,
          sideAttachmentReach: 0.35 });
      primitive(target, id(`${name}:brake:${index}:${side > 0 ? "r" : "l"}`),
        "steel", "cylinder",
        [wx, RAIL_HEAD + WHEEL_RADIUS + 0.02, wz],
        [0.24, 0.34, 0.24], "#8d9497",
        { rotation: rodRotation(frame.inward), bearsLoad: false, volume: 0.05,
          sideAttachmentReach: 0.5 });
    }
    // Ось между колёсами.
    const [ax, az] = point(frame, t + offset, 0);
    primitive(target, id(`${name}:axle:${index}`), "steel", "cylinder",
      [ax, RAIL_HEAD + WHEEL_RADIUS, az], [0.14, gauge, 0.14], "#5c6265",
      { rotation: rodRotation(frame.inward), bearsLoad: false, volume: 0.08,
        sideAttachmentReach: 0.5 });
  }

  // Рама тележки: лежит на колёсах и несёт всё, что выше.
  const [fx, fz] = point(frame, t, 0);
  const frameHeight = BOGIE_FRAME_TOP - (RAIL_HEAD + WHEEL_RADIUS * 2);
  primitive(target, id(`${name}:frame`), "steel", "panel",
    [fx, BOGIE_FRAME_TOP - frameHeight / 2, fz], [2.9, frameHeight, 1.3], IRON,
    { rotation, bearingArea: 3.4, volume: 0.9, carriesAttachments: true,
      attachmentSupportMode: "cable", sideAttachmentReach: 1.2 });
  // Буксы и ящик оборудования — на раме, вровень с колёсами.
  for (const side of [-1, 1] as const) {
    for (const [index, offset] of axleT.entries()) {
      const [bx, bz] = point(frame, t + offset, side * 0.6);
      primitive(target, id(`${name}:axlebox:${index}:${side > 0 ? "r" : "l"}`),
        "steel", "stoneBlock",
        [bx, RAIL_HEAD + WHEEL_RADIUS + 0.06, bz], [0.4, 0.3, 0.26], IRON,
        { rotation, bearsLoad: false, volume: 0.1, sideAttachmentReach: 0.5 });
    }
    const [ex, ez] = point(frame, t, side * 1.14);
    primitive(target, id(`${name}:box:${side > 0 ? "r" : "l"}`), "steel", "panel",
      [ex, RAIL_HEAD + 0.5, ez], [2.2, 0.56, 0.28], "#6b7174",
      { rotation, bearsLoad: false, volume: 0.3, sideAttachmentReach: 1.2 });
  }
}

/**
 * Поворот цилиндра, чтобы его ось (локальный +y) легла вдоль направления.
 * Формула из плейбука транспорта: единственная запись, не зависящая от курса.
 */
function rodRotation(
  direction: readonly [number, number],
): readonly [number, number, number] {
  const [dx, dz] = direction;
  return [Math.atan2(dz, 0), 0, Math.atan2(-dx, Math.hypot(0, dz))];
}

/** Салон: кресла, поручни, петли, жёлтые панели у дверей, схема линии. */
function createInterior(
  target: MutableGroup,
  id: (s: string) => string,
  frame: TrainFrame,
  name: string,
  centreT: number,
): void {
  const rotation: readonly [number, number, number] = [0, frame.yaw, 0];
  const seatRows = 4;
  for (let row = 0; row < seatRows; row += 1) {
    const t = centreT - SECTION_LENGTH / 2 + 2.2 + (row * (SECTION_LENGTH - 4.6)) / (seatRows - 1);
    for (const side of [-1, 1] as const) {
      const [sx, sz] = point(frame, t, side * (CAR_WIDTH / 2 - 0.62));
      primitive(target, id(`${name}:seat:${row}:${side > 0 ? "r" : "l"}`),
        "plastic", "panel",
        [sx, CAR_FLOOR + 0.44, sz], [1.05, 0.09, 0.46], ORANGE,
        { rotation, bearingArea: 0.5, volume: 0.06, carriesAttachments: true,
          attachmentSupportMode: "cable", sideAttachmentReach: 0.5 });
      primitive(target, id(`${name}:seat-back:${row}:${side > 0 ? "r" : "l"}`),
        "plastic", "panel",
        [sx, CAR_FLOOR + 0.72, sz + 0], [1.05, 0.56, 0.08], "#c26a28",
        { rotation, bearsLoad: false, volume: 0.05, sideAttachmentReach: 0.6 });
      primitive(target, id(`${name}:seat-leg:${row}:${side > 0 ? "r" : "l"}`),
        "steel", "panel",
        [sx, CAR_FLOOR + 0.2, sz], [0.9, 0.4, 0.1], STEEL,
        { rotation, bearingArea: 0.4, volume: 0.05 });
    }
  }

  // Вертикальные стойки и потолочный поручень с петлями.
  const [rx, rz] = point(frame, centreT, 0);
  // У цилиндра размер — [диаметр, ДЛИНА, диаметр], и длина идёт по локальному
  // +y; горизонтальный поручень получается разворотом на четверть.
  primitive(target, id(`${name}:grabrail`), "steel", "cylinder",
    [rx, ROOF - 0.34, rz], [0.06, SECTION_LENGTH - 1.2, 0.06], STEEL,
    { rotation: [0, frame.yaw, Math.PI / 2], volume: 0.06, bearingArea: 0.5,
      carriesAttachments: true, attachmentSupportMode: "cable",
      sideAttachmentReach: 0.7 });
  for (let pole = 0; pole < 4; pole += 1) {
    const t = centreT - SECTION_LENGTH / 2 + 2.6 + (pole * (SECTION_LENGTH - 5.2)) / 3;
    for (const side of [-1, 1] as const) {
      const [px, pz] = point(frame, t, side * 0.62);
      primitive(target, id(`${name}:pole:${pole}:${side > 0 ? "r" : "l"}`),
        "steel", "cylinder",
        [px, CAR_FLOOR + (ROOF - 0.3 - CAR_FLOOR) / 2, pz],
        [0.05, ROOF - 0.3 - CAR_FLOOR, 0.05], STEEL,
        { rotation, bearingArea: 0.4, volume: 0.04, carriesAttachments: true,
          attachmentSupportMode: "cable", sideAttachmentReach: 0.4 });
    }
    const [hx, hz] = point(frame, t + 0.5, 0);
    primitive(target, id(`${name}:strap:${pole}`), "plastic", "panel",
      [hx, ROOF - 0.54, hz], [0.1, 0.42, 0.16], "#c8442c",
      { rotation, bearsLoad: false, volume: 0.01, sideAttachmentReach: 0.4 });
  }
  // Схема линии над дверью и жёлтая панель у дверного проёма.
  for (const door of [-1, 1] as const) {
    const t = centreT + door * (SECTION_LENGTH / 4);
    for (const side of [-1, 1] as const) {
      const [mx, mz] = point(frame, t, side * (CAR_WIDTH / 2 - 0.14));
      primitive(target, id(`${name}:linemap:${door > 0 ? "b" : "a"}:${side > 0 ? "r" : "l"}`),
        "plastic", "panel",
        [mx, HEADER + 0.14, mz], [1.7, 0.24, 0.05], WHITE,
        { rotation, bearsLoad: false, volume: 0.02, sideAttachmentReach: 0.5 });
      const [yx, yz] = point(frame, t + door * (DOOR_WIDTH / 2 + 0.22), side * (CAR_WIDTH / 2 - 0.12));
      primitive(target, id(`${name}:doorpanel:${door > 0 ? "b" : "a"}:${side > 0 ? "r" : "l"}`),
        "plastic", "panel",
        [yx, CAR_FLOOR + 0.9, yz], [0.4, 1.6, 0.06], YELLOW,
        { rotation, bearsLoad: false, volume: 0.03, sideAttachmentReach: 0.5 });
    }
  }
}

/** Морда-«капля»: наклонный лоб, тёмное стекло, фары, пустая кабина. */
function createCab(
  target: MutableGroup,
  id: (s: string) => string,
  frame: TrainFrame,
  name: string,
  noseT: number,
  facing: 1 | -1,
): void {
  const rotation: readonly [number, number, number] = [0, frame.yaw, 0];

  // МОРДА-«КАПЛЯ». Собирается как ПОВЕРХНОСТЬ, а не стопка коробок.
  //
  // Приём взят у оболочки дирижабля терминала: сетка «станция × клин», и
  // каждая панель ставится через `orient` по касательной вдоль оси и нормали
  // наружу, а хорда растянута на перекрытие, чтобы между кольцами не
  // открывались щели. Осевые коробки, поставленные лесенкой, давали и лишний
  // бюджет, и ступени вместо обвода — форму так не собирают.
  //
  // Сечение — не круг, а скруглённый прямоугольник (суперэллипс): у вагона
  // плоские борта, плоская крыша и мягкие углы. Главное исправление после
  // сверки фас/три четверти: торец остаётся широким. Это не остроконечная
  // капля — чёрная маска занимает почти всю ширину кузова.
  const stations = 10;
  const gores = 18;
  const SECTION_POWER = 0.62;
  const bodyStartT = noseT - facing * NOSE_LENGTH;

  /** Обвод сечения на длине u (0 — торец, 1 — начало прямого кузова). */
  const sectionOf = cabSectionAt;

  /** Точка поверхности: u вдоль носа, phi по обводу (0 — верх). */
  const surfacePoint = (u: number, phi: number): readonly [number, number, number] => {
    const section = sectionOf(u);
    const centreY = (section.top + section.bottom) / 2;
    const halfHeight = (section.top - section.bottom) / 2;
    const cosine = Math.cos(phi);
    const sine = Math.sin(phi);
    const y = centreY + halfHeight * Math.sign(cosine) * Math.pow(Math.abs(cosine), SECTION_POWER);
    const w = section.halfWidth * Math.sign(sine) * Math.pow(Math.abs(sine), SECTION_POWER);
    const t = noseT - facing * (NOSE_LENGTH * u);
    const [x, z] = point(frame, t, w);
    return [x, y, z];
  };

  const subtract = (
    a: readonly [number, number, number],
    b: readonly [number, number, number],
  ): SceneVector3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a: SceneVector3, b: SceneVector3): SceneVector3 => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
  const lengthOf = (v: SceneVector3): number => Math.hypot(v[0], v[1], v[2]);

  const dPhi = (Math.PI * 2) / gores;
  for (let station = 0; station < stations; station += 1) {
    const u = (station + 0.5) / stations;
    const section = sectionOf(u);
    const centreY = (section.top + section.bottom) / 2;
    for (let gore = 0; gore < gores; gore += 1) {
      const phi = gore * dPhi;
      const here = surfacePoint(u, phi);
      // Касательная вдоль оси и по обводу — из самой поверхности, а не из
      // предположений о ней.
      const along = subtract(
        surfacePoint(u + 0.5 / stations, phi),
        surfacePoint(u - 0.5 / stations, phi),
      );
      const around = subtract(
        surfacePoint(u, phi + dPhi / 2),
        surfacePoint(u, phi - dPhi / 2),
      );
      let normal = cross(along, around);
      const [cx0, cz0] = point(frame, noseT - facing * (NOSE_LENGTH * u), 0);
      const outward: SceneVector3 = [here[0] - cx0, here[1] - centreY, here[2] - cz0];
      if (normal[0] * outward[0] + normal[1] * outward[1] + normal[2] * outward[2] < 0) {
        normal = [-normal[0], -normal[1], -normal[2]];
      }
      const panelLength = lengthOf(along) * 1.1 + 0.02;
      const panelWidth = lengthOf(around) * 1.16 + 0.02;
      if (panelLength < 0.04 || panelWidth < 0.04) {
        continue;
      }

      // Большая единая чёрная маска заворачивается на боковые окна кабины.
      // Стекло уже маски: соседние чёрные ячейки дают настоящий толстый
      // клеевой/композитный кант, а не тонкий нарисованный импост.
      const vertical = Math.cos(phi);
      const lateral = Math.abs(Math.sin(phi));
      const windscreen = vertical > 0.38 && u > 0.11 && u < 0.64;
      const cabSideWindow =
        vertical > 0.02 && lateral > 0.72 && u > 0.34 && u < 0.9;
      const isGlass = windscreen || cabSideWindow;
      const isMask = vertical > 0.01 && u > 0.05 && u < 0.76;
      // Серым остаётся только крыша; окрашенный алюминий под маской идёт
      // широким подбородком, как на реальном LRV 001.
      const isRoof = vertical > 0.8 && !isGlass && !isMask;
      const colour = isGlass
        ? DARK_GLASS
        : isMask
          ? BLACK
        : isRoof
          ? GREY
          : TURQUOISE;
      primitive(target, id(`${name}:shell:${station}:${gore}`),
        isGlass ? "darkGlass" : isMask ? "plastic" : "steel",
        isGlass ? "glassPane" : "panel",
        [here[0], here[1], here[2]],
        [panelLength, isGlass ? 0.1 : 0.09, panelWidth], colour,
        {
          rotation: orient(along, normal),
          // Официально окна утолщённые; они вклеены в алюминиевый обвод.
          bearingArea: 0.6,
          volume: panelLength * panelWidth * (isGlass ? 0.026 : 0.008),
          carriesAttachments: true,
          attachmentSupportMode: "cable",
          sideAttachmentReach: 0.6,
          textureProfile:
            !isGlass && !isMask ? "matte-aluminium" : undefined,
        });
      // Раскладка остекления: чёрный импост по стыку соседних стёкол.
      if (isGlass) {
        const edge = surfacePoint(u, phi + dPhi / 2);
        primitive(target, id(`${name}:mullion:${station}:${gore}`),
          "steel", "panel",
          [edge[0], edge[1], edge[2]], [panelLength, 0.11, 0.07], BLACK,
          {
            rotation: orient(along, normal),
            bearsLoad: false, volume: 0.01, sideAttachmentReach: 0.4,
          });
      }
    }
  }

  // Торцевая крышка: обечайка по обводу самого узкого сечения — тем же
  // приёмом, что закрыт нос дирижабля, где панели уже расходятся лепестками.
  const tip = sectionOf(0);
  const [tipX, tipZ] = point(frame, noseT - facing * 0.08, 0);
  primitive(target, id(`${name}:snout`), "steel", "panel",
    [tipX, (tip.top + tip.bottom) / 2, tipZ],
    [0.18, tip.top - tip.bottom, tip.halfWidth * 2], GREY,
    { rotation, bearsLoad: false, volume: 0.12, sideAttachmentReach: 0.6,
      textureProfile: "matte-aluminium" });

  // Торцевая стенка кузова в глубине морды: салон не должен просвечивать.
  const [ex, ez] = point(frame, bodyStartT + facing * 0.1, 0);
  primitive(target, id(`${name}:bulkhead`), "steel", "panel",
    [ex, (CAR_FLOOR + ROOF) / 2, ez],
    [0.14, ROOF - CAR_FLOOR, bodyHalfWidth(bodyStartT) * 2 - 0.2], GREY,
    { rotation, bearsLoad: false, volume: 0.4, sideAttachmentReach: 1.2,
      textureProfile: "matte-aluminium" });

  // Обвес морды садится НА ПОВЕРХНОСТЬ, по тем же координатам обвода, а не
  // по отметкам прямого кузова: крыша у носа опущена, и табло, поставленное
  // «на высоте крыши», просто висело в воздухе перед составом.
  const onSurface = (
    u: number,
    phi: number,
    lift: number,
  ): readonly [number, number, number] => {
    const at = surfacePoint(u, phi);
    const inner = surfacePoint(u, phi === 0 ? 0.001 : phi * 0.98);
    void inner;
    return [at[0], at[1] + lift, at[2]];
  };
  const browAlong = subtract(surfacePoint(0.66, 0), surfacePoint(0.5, 0));
  const browNormal = (() => {
    const around = subtract(surfacePoint(0.58, 0.12), surfacePoint(0.58, -0.12));
    const n = cross(browAlong, around);
    return n[1] < 0 ? ([-n[0], -n[1], -n[2]] as SceneVector3) : n;
  })();

  // Маршрутное табло — узкой чёрной полосой над стеклом, по завалу лба.
  const board = onSurface(0.62, 0, 0.06);
  primitive(target, id(`${name}:route-board`), "plastic", "panel",
    [board[0], board[1], board[2]], [0.44, 0.1, sectionOf(0.62).halfWidth * 1.5],
    BLACK,
    { rotation: orient(browAlong, browNormal), bearsLoad: false, volume: 0.02,
      sideAttachmentReach: 0.8 });
  primitive(target, id(`${name}:route-text`), "plastic", "panel",
    [board[0], board[1] + 0.01, board[2]],
    [0.3, 0.1, sectionOf(0.62).halfWidth], "#e2a52a",
    { rotation: orient(browAlong, browNormal), bearsLoad: false, volume: 0.01,
      sideAttachmentReach: 0.8 });

  // Сцепное закрытие и блоки фар — по низу морды, где обвод уже отвесный.
  const tipSection = sectionOf(0.06);
  const [coverX, coverZ] = point(frame, noseT - facing * 0.14, 0);
  primitive(target, id(`${name}:coupler-cover`), "plastic", "panel",
    [coverX, tipSection.bottom + 0.42, coverZ],
    [0.16, 0.74, tipSection.halfWidth * 1.84], BLACK,
    { rotation, bearsLoad: false, volume: 0.1, sideAttachmentReach: 1 });
  for (const side of [-1, 1] as const) {
    const lamp = surfacePoint(0.16, side * (Math.PI / 2 + 0.34));
    primitive(target, id(`${name}:headlight:${side > 0 ? "r" : "l"}`),
      "glass", "glassPane",
      [lamp[0], tipSection.bottom + 0.85, lamp[2]], [0.36, 0.5, 0.12], "#f2f6f8",
      {
        rotation, bearsLoad: false, volume: 0.01, sideAttachmentReach: 0.7,
        light: {
          color: "#fff3d8", distance: 22, intensity: 1.1,
          position: [-facing * 0.5, 0, 0],
          followsGroup: true,
        },
      });
    primitive(target, id(`${name}:marker:${side > 0 ? "r" : "l"}`),
      "plastic", "panel",
      [lamp[0], tipSection.bottom + 0.48, lamp[2]], [0.4, 0.09, 0.12], WHITE,
      { rotation, bearsLoad: false, volume: 0.01, sideAttachmentReach: 0.7 });
  }

  // Один стеклоочиститель — он и правда один, и лежит по стеклу.
  const wipe = surfacePoint(0.3, -0.42);
  primitive(target, id(`${name}:wiper`), "steel", "cylinder",
    [wipe[0], wipe[1], wipe[2]], [0.03, 0.85, 0.03], IRON,
    { rotation: orient(browAlong, browNormal), bearsLoad: false, volume: 0.01,
      sideAttachmentReach: 0.5 });

  // Сцепка со шлангами под закрытием — её видно с платформы.
  const [kx, kz] = point(frame, noseT + facing * 0.08, 0);
  primitive(target, id(`${name}:coupler`), "steel", "panel",
    [kx, tipSection.bottom + 0.1, kz], [0.5, 0.28, 0.42], "#70767a",
    { rotation, volume: 0.06, bearingArea: 0.5, carriesAttachments: true,
      attachmentSupportMode: "cable", sideAttachmentReach: 0.7 });
  for (const [index, colour] of ["#b03a2e", "#2e6fb0"].entries()) {
    const [hx, hz] = point(frame, noseT + facing * 0.02, (index - 0.5) * 0.44);
    primitive(target, id(`${name}:hose:${index}`), "plastic", "cylinder",
      [hx, tipSection.bottom - 0.06, hz], [0.07, 0.3, 0.07], colour,
      { rotation, bearsLoad: false, volume: 0.01, sideAttachmentReach: 0.5 });
  }
}

/**
 * Крупное бортовое остекление из реальных оконных ПРОЁМОВ. Прежняя лента
 * была нарезана через каждые полметра и читалась пиксельной решёткой; здесь
 * один проём — одна чёрная вклеенная рамка и одна утолщённая стеклопанель.
 */
function createSideWindows(
  target: MutableGroup,
  id: (s: string) => string,
  frame: TrainFrame,
  index: number,
  centreT: number,
): void {
  const rotation: readonly [number, number, number] = [0, frame.yaw, 0];
  const sectionStart = centreT - SECTION_LENGTH / 2;
  const sectionEnd = centreT + SECTION_LENGTH / 2;
  const doorCentres = [-1, 1].map(
    (side) => centreT + side * (SECTION_LENGTH / 4),
  );
  const straightInsetAtStart = index === 0 ? NOSE_LENGTH + 0.18 : 0.5;
  const straightInsetAtEnd =
    index === TRAIN_SECTIONS - 1 ? NOSE_LENGTH + 0.18 : 0.5;
  const doorClear = DOOR_WIDTH / 2 + 0.22;
  const intervals = [
    [sectionStart + straightInsetAtStart, doorCentres[0] - doorClear],
    [doorCentres[0] + doorClear, doorCentres[1] - doorClear],
    [doorCentres[1] + doorClear, sectionEnd - straightInsetAtEnd],
  ] as const;

  for (const side of [-1, 1] as const) {
    let windowIndex = 0;
    for (const [from, to] of intervals) {
      const span = to - from;
      if (span < 0.55) {
        continue;
      }
      const panes = Math.max(1, Math.round(span / 1.72));
      const mullion = 0.16;
      const paneWidth = (span - mullion * (panes - 1)) / panes;
      for (let pane = 0; pane < panes; pane += 1) {
        const t = from + paneWidth / 2 + pane * (paneWidth + mullion);
        const half = bodyHalfWidth(t);
        const suffix = `${windowIndex}:${side > 0 ? "r" : "l"}`;
        const [maskX, maskZ] = point(frame, t, side * (half - 0.025));
        primitive(target, id(`window-mask:${suffix}`), "plastic", "panel",
          [maskX, (SILL + HEADER) / 2, maskZ],
          [paneWidth + 0.14, HEADER - SILL + 0.14, 0.075], BLACK,
          { rotation, bearsLoad: false, volume: 0.035,
            sideAttachmentReach: 0.9 });
        const [glassX, glassZ] = point(frame, t, side * (half + 0.012));
        primitive(target, id(`window:${suffix}`), "darkGlass", "glassPane",
          [glassX, (SILL + HEADER) / 2, glassZ],
          [paneWidth, HEADER - SILL, 0.085], DARK_GLASS,
          {
            rotation, bearsLoad: false,
            // Утолщённое многослойное стекло — официальный акустический пакет.
            volume: paneWidth * (HEADER - SILL) * 0.026,
            sideAttachmentReach: 0.9,
          });
        windowIndex += 1;
      }
    }
  }
}

/** Одна секция состава целиком. */
function createSection(
  target: MutableGroup,
  frame: TrainFrame,
  index: number,
  name: string,
): void {
  const rotation: readonly [number, number, number] = [0, frame.yaw, 0];
  const id = (suffix: string) => `${name}:${suffix}`;
  const centreT = -TRAIN_LENGTH / 2 + SECTION_LENGTH * (index + 0.5);
  const isHead = index === 0 || index === TRAIN_SECTIONS - 1;

  // Тележки под концами секции — на них стоит всё остальное.
  createBogie(target, id, frame, "bogie:a", centreT - SECTION_LENGTH / 2 + 3.2);
  createBogie(target, id, frame, "bogie:b", centreT + SECTION_LENGTH / 2 - 3.2);

  // Рама и пол: рама кузова лежит на тележках, пол — на раме. Между верхом
  // тележки и полом всего двадцать сантиметров, и обе детали в них живут.
  const frames = 3;
  const partLength = SECTION_LENGTH / frames;
  const underframeTop = CAR_FLOOR - 0.08;
  for (let part = 0; part < frames; part += 1) {
    const t = centreT - SECTION_LENGTH / 2 + partLength * (part + 0.5);
    const [ux, uz] = point(frame, t, 0);
    primitive(target, id(`underframe:${part}`), "steel", "panel",
      [ux, (BOGIE_FRAME_TOP + underframeTop) / 2, uz],
      [partLength + 0.04, underframeTop - BOGIE_FRAME_TOP, CAR_WIDTH - 0.2], IRON,
      { rotation, bearingArea: 6, volume: 1.1, carriesAttachments: true,
        attachmentSupportMode: "cable", sideAttachmentReach: 1.5 });
    primitive(target, id(`floor:${part}`), "plastic", "panel",
      [ux, CAR_FLOOR - 0.04, uz],
      [partLength + 0.04, 0.08, CAR_WIDTH - 0.14], "#585f63",
      { rotation, bearingArea: 8, volume: 0.9, carriesAttachments: true,
        attachmentSupportMode: "cable", sideAttachmentReach: 1.5 });

    // Пояса борта: подоконный и надоконный. На них навешана вся обшивка —
    // без них панели держались бы за воздух, как жалюзи парапета до того,
    // как под ними появился цоколь.
    for (const side of [-1, 1] as const) {
      const [wx, wz] = point(frame, t, side * (CAR_WIDTH / 2 - 0.09));
      primitive(target, id(`waist:${part}:${side > 0 ? "r" : "l"}`),
        "steel", "panel",
        [wx, SILL - 0.05, wz], [partLength + 0.04, 0.18, 0.14], IRON,
        { rotation, bearingArea: 1.2, volume: 0.2, carriesAttachments: true,
          attachmentSupportMode: "cable", sideAttachmentReach: 1.2 });
      primitive(target, id(`cant:${part}:${side > 0 ? "r" : "l"}`),
        "steel", "panel",
        [wx, ROOF - 0.07, wz], [partLength + 0.04, 0.14, 0.14], IRON,
        { rotation, bearingArea: 1.2, volume: 0.2, carriesAttachments: true,
          attachmentSupportMode: "cable", sideAttachmentReach: 1.2 });
    }
  }

  // Низкопольный кузов не лежит на одном условном сером бруске: между
  // тележками по бортам читаются отдельные тяговые, аккумуляторные и
  // пневматические шкафы, закрытые короткими съёмными крышками.
  for (const [pod, offset] of [-2.15, 0, 2.15].entries()) {
    for (const side of [-1, 1] as const) {
      const t = centreT + offset;
      const [boxX, boxZ] = point(frame, t, side * 1.02);
      primitive(target, id(`equipment:${pod}:${side > 0 ? "r" : "l"}`),
        "steel", "panel",
        [boxX, (BOGIE_FRAME_TOP + CAR_FLOOR - 0.16) / 2, boxZ],
        [1.78, CAR_FLOOR - 0.16 - BOGIE_FRAME_TOP, 0.42], "#555c60",
        { rotation, volume: 0.32,
          carriesAttachments: true, attachmentSupportMode: "wall",
          sideAttachmentReach: 1.1, textureProfile: "matte-aluminium" });
    }
  }

  // Стойки борта: от рамы до крыши, по простенкам между окнами. Они несут
  // крышу и держат пояса, как в настоящем кузове.
  const pillars = 5;
  for (let pillar = 0; pillar < pillars; pillar += 1) {
    const t = centreT - SECTION_LENGTH / 2 + (SECTION_LENGTH * pillar) / (pillars - 1);
    for (const side of [-1, 1] as const) {
      const [px, pz] = point(frame, t, side * (CAR_WIDTH / 2 - 0.09));
      primitive(target, id(`pillar:${pillar}:${side > 0 ? "r" : "l"}`),
        "steel", "panel",
        [px, (CAR_FLOOR + ROOF) / 2, pz], [0.11, ROOF - CAR_FLOOR, 0.16], IRON,
        { rotation, bearingArea: 0.8, volume: 0.16, carriesAttachments: true,
          attachmentSupportMode: "wall", sideAttachmentReach: 1.2 });
    }
  }

  // Борта полосами: волна, окна, двери и орнаментальный пояс. Полоса мельче
  // прежней — иначе поджатие к голове и к стыку читается ступеньками, а не
  // формой.
  const strips = 30;
  const stripWidth = SECTION_LENGTH / strips;
  const doorCentres = [-1, 1].map((side) => centreT + side * (SECTION_LENGTH / 4));
  for (let strip = 0; strip < strips; strip += 1) {
    const t = centreT - SECTION_LENGTH / 2 + stripWidth * (strip + 0.5);
    const fromEnd = Math.min(
      t + TRAIN_LENGTH / 2,
      TRAIN_LENGTH / 2 - t,
    );
    const inDoor = doorCentres.some(
      (centre) => Math.abs(t - centre) < DOOR_WIDTH / 2,
    );
    // Настоящий разрыв кузова у стыка: без силуэтного провала и тени состав
    // читается одним бруском, сколько его ни крась.
    if (distanceToJoint(t) < JOINT_GAP + stripWidth / 2) {
      continue;
    }
    // Зона морды формуется слоями по высоте, полосам борта там делать нечего.
    if (Math.min(t + TRAIN_LENGTH / 2, TRAIN_LENGTH / 2 - t) < NOSE_LENGTH) {
      continue;
    }
    const half = bodyHalfWidth(t);
    for (const side of [-1, 1] as const) {
      const suffix = `${strip}:${side > 0 ? "r" : "l"}`;
      // Подоконный пояс: он и несёт волну.
      if (!inDoor) {
        sidePanel(target, id, frame, `side:${suffix}`, t, stripWidth + 0.01,
          side, CAR_FLOOR - 0.08, SILL, fromEnd);
      }
      // Надоконный пояс до крыши.
      sidePanel(target, id, frame, `header:${suffix}`, t, stripWidth + 0.01,
        side, HEADER, ROOF, fromEnd);
      // Юбка под полом: под ней видны тележки.
      const [kx, kz] = point(frame, t, side * (half - 0.12));
      primitive(target, id(`skirt:${suffix}`), "steel", "panel",
        [kx, (SKIRT_BOTTOM + CAR_FLOOR - 0.12) / 2, kz],
        [stripWidth + 0.01, CAR_FLOOR - 0.12 - SKIRT_BOTTOM, 0.1], SKIRT,
        { rotation, bearsLoad: false, volume: 0.008, sideAttachmentReach: 0.9,
          textureProfile: "matte-aluminium" });
    }
  }

  createSideWindows(target, id, frame, index, centreT);

  // ЛИВРЕЯ НЕ ДЕЛАЕТСЯ ГЕОМЕТРИЕЙ. Орнаментальный пояс, завитки, шатёр,
  // бортовой номер и служебная маркировка стояли здесь отдельными плоскими
  // деталями, налепленными на борт снаружи, — 138 кусков, 12% состава, и
  // читались наклейками. На настоящем вагоне это плёнка в уровень окраски.
  // Уходит в textureProfile отдельным шагом.

  // Двери: две створки, верх стеклянный, низ серый, кромка в чёрно-жёлтую
  // штриховку. По две на секцию с каждой стороны, в створ платформенных.
  for (const [doorIndex, doorT] of doorCentres.entries()) {
    for (const side of [-1, 1] as const) {
      for (const leaf of [-1, 1] as const) {
        const t = doorT + leaf * DOOR_WIDTH / 4;
        const half = bodyHalfWidth(t);
        const [frameX, frameZ] = point(frame, t, side * (half - 0.025));
        const suffix = `${doorIndex}:${side > 0 ? "r" : "l"}:${leaf > 0 ? "b" : "a"}`;
        // Чёрный вклеенный кассетный кант связывает дверь с оконной лентой.
        primitive(target, id(`door-frame:${suffix}`), "plastic", "panel",
          [frameX, (CAR_FLOOR + HEADER) / 2, frameZ],
          [DOOR_WIDTH / 2 + 0.035, HEADER - CAR_FLOOR + 0.08, 0.075], BLACK,
          { rotation, bearsLoad: false, volume: 0.035,
            sideAttachmentReach: 0.9 });
        const [glassX, glassZ] = point(frame, t, side * (half + 0.012));
        primitive(target, id(`door-glass:${suffix}`), "darkGlass", "glassPane",
          [glassX, (SILL + HEADER) / 2, glassZ],
          [DOOR_WIDTH / 2 - 0.08, HEADER - SILL - 0.05, 0.085], DARK_GLASS,
          { rotation, bearsLoad: false,
            volume: (DOOR_WIDTH / 2 - 0.08) * (HEADER - SILL) * 0.026,
            sideAttachmentReach: 0.9 });
        const [panelX, panelZ] = point(frame, t, side * (half + 0.01));
        primitive(target, id(`door-panel:${suffix}`), "steel", "panel",
          [panelX, (CAR_FLOOR + SILL) / 2, panelZ],
          [DOOR_WIDTH / 2 - 0.08, SILL - CAR_FLOOR - 0.03, 0.08], GREY_LIGHT,
          { rotation, bearsLoad: false, volume: 0.018,
            sideAttachmentReach: 0.9, textureProfile: "matte-aluminium" });
        const [ex, ez] = point(frame, doorT + leaf * (DOOR_WIDTH / 2 - 0.04),
          side * (bodyHalfWidth(doorT) + 0.02));
        primitive(target, id(`door-edge:${suffix}`), "plastic", "panel",
          [ex, CAR_FLOOR + 0.9, ez], [0.08, 2, 0.06], YELLOW,
          { rotation, bearsLoad: false, volume: 0.01, sideAttachmentReach: 0.5 });
      }
      // Подсвеченная кромка проёма — она мигает на закрытие.
      const [wx, wz] = point(frame, doorT, side * (CAR_WIDTH / 2 - 0.02));
      primitive(target, id(`door-lamp:${doorIndex}:${side > 0 ? "r" : "l"}`),
        "plastic", "panel",
        [wx, HEADER + 0.06, wz], [DOOR_WIDTH, 0.07, 0.06], "#39c05a",
        {
          rotation, bearsLoad: false, volume: 0.004, sideAttachmentReach: 0.6,
          light: {
            color: "#7de08f", distance: 4, intensity: 0.35,
            followsGroup: true,
          },
        });
    }
  }

  // Крыша: гладкая, без пантографа — питание от контактного рельса; сверху
  // плоские обтекатели климата.
  // Крыша идёт теми же секциями, что борт, и повторяет его поджатие: у
  // настоящего вагона она заметно уже борта и скруглена по плечам.
  const roofParts = 10;
  const roofStep = SECTION_LENGTH / roofParts;
  for (let part = 0; part < roofParts; part += 1) {
    const t = centreT - SECTION_LENGTH / 2 + roofStep * (part + 0.5);
    if (distanceToJoint(t) < JOINT_GAP + roofStep / 2) {
      continue;
    }
    if (Math.min(t + TRAIN_LENGTH / 2, TRAIN_LENGTH / 2 - t) < NOSE_LENGTH) {
      continue;
    }
    const [rx, rz] = point(frame, t, 0);
    primitive(target, id(`roof:${part}`), "steel", "panel",
      [rx, ROOF + 0.08, rz],
      [roofStep + 0.02, 0.16, roofHalfWidth(t) * 2], GREY,
      { rotation, bearingArea: 5, volume: 0.12, carriesAttachments: true,
        attachmentSupportMode: "cable", sideAttachmentReach: 1.5,
        textureProfile: "matte-aluminium" });
    // Скруглённое плечо: узкая фаска между бортом и крышей.
    for (const side of [-1, 1] as const) {
      const [sx, sz] = point(frame, t, side * (bodyHalfWidth(t) - 0.12));
      primitive(target, id(`shoulder:${part}:${side > 0 ? "r" : "l"}`),
        "steel", "panel",
        [sx, ROOF - 0.02, sz], [roofStep + 0.02, 0.2, 0.26], GREY,
        { rotation, bearsLoad: false, volume: 0.02, sideAttachmentReach: 0.6,
          textureProfile: "matte-aluminium" });
    }
    if (part % 3 === 1) {
      primitive(target, id(`hvac:${part}`), "steel", "panel",
        [rx, ROOF + 0.28, rz], [roofStep * 2.2, 0.24, 1.7], GREY_LIGHT,
        { rotation, bearingArea: 2, volume: 0.4,
          textureProfile: "matte-aluminium" });
      // Тёмные продольные заборные решётки 35-кВт климатической установки.
      for (const side of [-1, 1] as const) {
        const [ventX, ventZ] = point(frame, t, side * 0.72);
        primitive(target, id(`hvac-intake:${part}:${side > 0 ? "r" : "l"}`),
          "plastic", "panel",
          [ventX, ROOF + 0.31, ventZ], [roofStep * 1.55, 0.09, 0.045], BLACK,
          { rotation, bearsLoad: false, volume: 0.012,
            sideAttachmentReach: 0.5 });
      }
    }
  }

  // Торцы: у головной секции — морда, между секциями — гармошка перехода.
  if (index === 0) {
    createCab(target, id, frame, "cab", -TRAIN_LENGTH / 2, -1);
  }
  if (index === TRAIN_SECTIONS - 1) {
    createCab(target, id, frame, "cab", TRAIN_LENGTH / 2, 1);
  }
  for (const end of [-1, 1] as const) {
    const t = centreT + end * SECTION_LENGTH / 2;
    if (Math.abs(t) >= TRAIN_LENGTH / 2 - 0.01) {
      continue;
    }
    // Гармошка — ПОЛЫЙ периметр, не чёрная торцевая стенка. Игрок видит
    // следующий вагон и проходит через открытый межсекционный портал, а
    // несколько вложенных рам перекрывают взаимный разворот секций на дуге.
    const bellows = 3;
    for (let fold = 0; fold < bellows; fold += 1) {
      const foldT = t + end * (0.04 + fold * 0.07);
      const half = CAR_WIDTH / 2 - JOINT_TUCK - 0.02 + fold * 0.025;
      const top = ROOF - 0.2 + fold * 0.015;
      const bottom = CAR_FLOOR - 0.02;
      for (const side of [-1, 1] as const) {
        const [sideX, sideZ] = point(frame, foldT, side * half);
        primitive(target,
          id(`gangway:${end > 0 ? "b" : "a"}:${fold}:side:${side > 0 ? "r" : "l"}`),
          "cloth", "panel",
          [sideX, (bottom + top) / 2, sideZ], [0.085, top - bottom, 0.1],
          "#292e31",
          { rotation, bearsLoad: false, volume: 0.022,
            sideAttachmentReach: 0.7 });
      }
      const [topX, topZ] = point(frame, foldT, 0);
      primitive(target, id(`gangway:${end > 0 ? "b" : "a"}:${fold}:top`),
        "cloth", "panel",
        [topX, top, topZ], [0.085, 0.11, half * 2], "#292e31",
        { rotation, bearsLoad: false, volume: 0.018,
          sideAttachmentReach: 0.7 });
    }
    // Переходный мостик по полу — по нему и переходят из секции в секцию.
    const [bx, bz] = point(frame, t, 0);
    primitive(target, id(`gangway-floor:${end > 0 ? "b" : "a"}`),
      "steel", "panel",
      [bx, CAR_FLOOR - 0.05, bz], [0.44, 0.1, CAR_WIDTH - 1.2], "#585f63",
      { rotation, bearingArea: 0.6, volume: 0.1 });
    primitive(target, id(`gangway-ceiling:${end > 0 ? "b" : "a"}`),
      "plastic", "panel",
      [bx, ROOF - 0.23, bz], [0.38, 0.08, CAR_WIDTH - 1.22], "#d9dde0",
      { rotation, bearsLoad: false, volume: 0.035,
        sideAttachmentReach: 0.7 });
  }

  createInterior(target, id, frame, "cabin", centreT);
  if (isHead) {
    // Салонное освещение головных секций — их видно с платформы насквозь.
    const [lx, lz] = point(frame, centreT, 0);
    primitive(target, id("cabin-light"), "plastic", "panel",
      [lx, ROOF - 0.12, lz], [SECTION_LENGTH - 2, 0.08, 0.9], WHITE,
      {
        rotation, bearsLoad: false, volume: 0.05, sideAttachmentReach: 1.2,
        light: {
          color: "#eef4ff", distance: 9, intensity: 0.8,
          position: [0, -0.4, 0], followsGroup: true,
        },
      });
  }
}

/**
 * Состав на станции. Точка остановки — та же, что у балис: нос состава
 * приходит на середину вставки плюс половину длины, значит центр состава
 * стоит ровно в середине станционной прямой.
 */
export function trainStopDistance(): number {
  return stationDistance(TRAIN_STATION);
}

export function createTrain(sections: readonly MutableGroup[]): void {
  const frame = trainFrameAt(trainStopDistance());
  for (let index = 0; index < TRAIN_SECTIONS; index += 1) {
    createSection(sections[index], frame, index, `lrv-001:${index}`);
  }
}
