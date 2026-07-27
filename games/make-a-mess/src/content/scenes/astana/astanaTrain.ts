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
import { primitive } from "./astanaAuthoring.ts";
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
const BLUE = "#2b4f9c";
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
/** Сколько метров от торца кузов формируется в «каплю». */
const NOSE_LENGTH = 2.6;
/** Насколько борт поджат у самого торца. */
const NOSE_TUCK = 0.52;
/** Половина ширины теневого зазора между секциями. */
const JOINT_GAP = 0.1;
/** На какой длине кузов поджимается к стыку и насколько. */
const JOINT_TAPER = 0.8;
const JOINT_TUCK = 0.16;

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
  return bodyHalfWidth(t) - 0.22;
}

function smoothstep(value: number): number {
  const t = value <= 0 ? 0 : value >= 1 ? 1 : value;
  return t * t * (3 - 2 * t);
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
    // Обшивка борта — СТАЛЬНАЯ и работающая: у настоящего кузова она часть
    // силовой схемы. Прямая замена пластика сталью утяжелила бы её в 6.55
    // раза (плотности 0.55 против 3.6), поэтому объём пересчитан: тот же
    // лист, та же масса, честный материал по виду, звуку и разрушению.
    primitive(target, id(`${name}:${suffix}`), "steel", "panel",
      [px, (from + to) / 2, pz], [width, to - from, 0.1], colour,
      { rotation, bearingArea: 1, volume: (to - from) * width * 0.00306,
        carriesAttachments: true, attachmentSupportMode: "cable",
        sideAttachmentReach: 0.9 });
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

  // МОРДА-«КАПЛЯ». Собирается слоями по высоте: чем выше слой, тем дальше
  // назад уходит его передняя грань — так получается завал лба примерно в
  // 38° от вертикали, а поджатие борта и крыши даёт скруглённые плечи.
  // Одна наклонная панель на торце коробки давала «коробку с козырьком», и
  // это было первым, что бросалось в глаза.
  // Слоёв много: при девяти завал читался лестницей, а не каплей.
  const layers = 18;
  const layerHeight = (ROOF - CAR_FLOOR) / layers;
  const bodyStartT = noseT - facing * NOSE_LENGTH;
  for (let layer = 0; layer < layers; layer += 1) {
    const y = CAR_FLOOR + layerHeight * (layer + 0.5);
    const frac = (y - CAR_FLOOR) / (ROOF - CAR_FLOOR);
    const setback = NOSE_LENGTH * 0.7 * smoothstep(frac);
    const frontT = noseT - facing * setback;
    const centreLayerT = (frontT + bodyStartT) / 2;
    const length = Math.abs(frontT - bodyStartT);
    if (length < 0.12) {
      continue;
    }
    // Ширина слоя: борт по профилю, кверху дополнительно поджат под крышу.
    const half = bodyHalfWidth(centreLayerT) - 0.22 * Math.pow(frac, 2.2);
    const [lx, lz] = point(frame, centreLayerT, 0);
    const wave = liveryWaveY(
      Math.min(centreLayerT + TRAIN_LENGTH / 2, TRAIN_LENGTH / 2 - centreLayerT),
    );
    primitive(target, id(`${name}:shell:${layer}`), "steel", "panel",
      [lx, y, lz], [length, layerHeight + 0.01, half * 2],
      y < wave ? TURQUOISE : GREY,
      { rotation, bearingArea: 2, volume: length * half * 0.05,
        carriesAttachments: true, attachmentSupportMode: "cable",
        sideAttachmentReach: 1.2 });
    // Скругление плеча слоя — узкая фаска по борту.
    if (frac > 0.55 && layer % 2 === 0) {
      for (const side of [-1, 1] as const) {
        const [sx, sz] = point(frame, centreLayerT, side * half);
        primitive(target, id(`${name}:fillet:${layer}:${side > 0 ? "r" : "l"}`),
          "steel", "panel",
          [sx, y, sz], [length, layerHeight, 0.18],
          y < wave ? TURQUOISE : GREY,
          { rotation, bearsLoad: false, volume: 0.02, sideAttachmentReach: 0.5 });
      }
    }
  }

  // Торцевая стенка кузова в глубине морды: салон не должен просвечивать.
  const [ex, ez] = point(frame, bodyStartT + facing * 0.1, 0);
  primitive(target, id(`${name}:bulkhead`), "steel", "panel",
    [ex, (CAR_FLOOR + ROOF) / 2, ez],
    [0.14, ROOF - CAR_FLOOR, bodyHalfWidth(bodyStartT) * 2 - 0.2], GREY,
    { rotation, bearsLoad: false, volume: 0.4, sideAttachmentReach: 1.2 });

  // Лобовое стекло по завалу лба: тёмная трапеция в чёрной рамке. За ним
  // пусто — GOA4, машиниста нет, и это видно в упор.
  const glassFrac = 0.72;
  const glassY = CAR_FLOOR + (ROOF - CAR_FLOOR) * glassFrac;
  const glassSetback = NOSE_LENGTH * 0.7 * smoothstep(glassFrac);
  const lean = facing * Math.atan2(NOSE_LENGTH * 0.7, ROOF - CAR_FLOOR);
  const [gx, gz] = point(frame, noseT - facing * (glassSetback - 0.06), 0);
  // Ширину берём по слою, в котором стекло сидит, с поджатием под крышу:
  // иначе рамка выпирает за борт отдельной коробкой.
  const glassHalf =
    bodyHalfWidth(noseT - facing * glassSetback) - 0.22 * Math.pow(glassFrac, 2.2);
  primitive(target, id(`${name}:windscreen-frame`), "steel", "panel",
    [gx, glassY, gz], [0.16, 1.3, glassHalf * 2 - 0.16],
    BLACK,
    { rotation: [0, frame.yaw, lean], bearsLoad: false, volume: 0.12,
      sideAttachmentReach: 1.2 });
  primitive(target, id(`${name}:windscreen`), "darkGlass", "glassPane",
    [gx, glassY, gz], [0.1, 1.06, glassHalf * 2 - 0.48],
    DARK_GLASS,
    { rotation: [0, frame.yaw, lean], bearsLoad: false, volume: 0.08,
      sideAttachmentReach: 1.2 });

  // Маршрутное табло узкой чёрной полосой над стеклом.
  const [bx, bz] = point(frame, noseT - facing * 0.5, 0);
  primitive(target, id(`${name}:route-board`), "plastic", "panel",
    [bx, ROOF - 0.24, bz], [0.14, 0.26, CAR_WIDTH - 1], BLACK,
    { rotation, bearsLoad: false, volume: 0.02, sideAttachmentReach: 0.8 });
  primitive(target, id(`${name}:route-text`), "plastic", "panel",
    [bx, ROOF - 0.24, bz], [0.1, 0.14, CAR_WIDTH - 1.5], "#e2a52a",
    { rotation, bearsLoad: false, volume: 0.01, sideAttachmentReach: 0.8 });

  // Большая чёрная панель сцепного закрытия и блоки фар по её краям.
  const [cx, cz] = point(frame, noseT - facing * 0.08, 0);
  primitive(target, id(`${name}:coupler-cover`), "plastic", "panel",
    [cx, CAR_FLOOR + 0.12, cz], [0.16, 0.86, CAR_WIDTH - 0.5], BLACK,
    { rotation, bearsLoad: false, volume: 0.12, sideAttachmentReach: 1.2 });
  for (const side of [-1, 1] as const) {
    const [lx, lz] = point(frame, noseT - facing * 0.12, side * (CAR_WIDTH / 2 - 0.5));
    primitive(target, id(`${name}:headlight:${side > 0 ? "r" : "l"}`),
      "glass", "glassPane",
      [lx, CAR_FLOOR + 0.46, lz], [0.1, 0.24, 0.24], "#f2f6f8",
      {
        rotation, bearsLoad: false, volume: 0.01, sideAttachmentReach: 0.6,
        light: {
          color: "#fff3d8", distance: 22, intensity: 1.1,
          position: [facing * 0.4, 0, 0],
        },
      });
    primitive(target, id(`${name}:marker:${side > 0 ? "r" : "l"}`),
      "plastic", "panel",
      [lx, CAR_FLOOR + 0.2, lz], [0.1, 0.08, 0.62], WHITE,
      { rotation, bearsLoad: false, volume: 0.01, sideAttachmentReach: 0.6 });
  }
  // Один стеклоочиститель — он и правда один.
  const [wx, wz] = point(frame, noseT - facing * 0.62, -0.35);
  primitive(target, id(`${name}:wiper`), "steel", "cylinder",
    [wx, SILL + 0.18, wz], [0.03, 0.9, 0.03], IRON,
    { rotation: [0, frame.yaw, Math.PI / 2.6], bearsLoad: false, volume: 0.01,
      sideAttachmentReach: 0.5 });
  // Сцепка со шлангами — под панелью, её видно с платформы.
  const [kx, kz] = point(frame, noseT + facing * 0.1, 0);
  primitive(target, id(`${name}:coupler`), "steel", "panel",
    [kx, CAR_FLOOR - 0.28, kz], [0.5, 0.28, 0.42], "#70767a",
    { rotation, volume: 0.06, bearingArea: 0.5, carriesAttachments: true,
      attachmentSupportMode: "cable", sideAttachmentReach: 0.7 });
  for (const [index, colour] of ["#b03a2e", "#2e6fb0"].entries()) {
    const [hx, hz] = point(frame, noseT + facing * 0.04, (index - 0.5) * 0.44);
    primitive(target, id(`${name}:hose:${index}`), "plastic", "cylinder",
      [hx, CAR_FLOOR - 0.44, hz], [0.07, 0.3, 0.07], colour,
      { rotation, bearsLoad: false, volume: 0.01, sideAttachmentReach: 0.5 });
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
    if (Math.min(t + TRAIN_LENGTH / 2, TRAIN_LENGTH / 2 - t) < NOSE_LENGTH * 0.72) {
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
        { rotation, bearsLoad: false, volume: 0.008, sideAttachmentReach: 0.9 });
      // Оконная лента: тёмное стекло на всю толщину борта, между простенками.
      if (!inDoor && strip % 7 !== 0) {
        const [gx, gz] = point(frame, t, side * (half - 0.06));
        primitive(target, id(`window:${suffix}`), "darkGlass", "glassPane",
          [gx, (SILL + HEADER) / 2, gz],
          [stripWidth + 0.01, HEADER - SILL, 0.12], DARK_GLASS,
          { rotation, bearsLoad: false, volume: 0.1, sideAttachmentReach: 0.9 });
      } else if (!inDoor) {
        const [px, pz] = point(frame, t, side * (half - 0.05));
        sidePanel(target, id, frame, `pier:${suffix}`, t, stripWidth + 0.01,
          side, SILL, HEADER, fromEnd);
        void px;
        void pz;
      }
    }
  }

  // Орнаментальный пояс по низу борта: ромбы, завитки, а на головной
  // секции — крупный синий шатёр с уступчатым контуром.
  for (const side of [-1, 1] as const) {
    for (let mark = 0; mark < 10; mark += 1) {
      const t = centreT - SECTION_LENGTH / 2 + 0.9 + (mark * (SECTION_LENGTH - 1.8)) / 9;
      const [mx, mz] = point(frame, t, side * (CAR_WIDTH / 2 + 0.005));
      primitive(target, id(`ornament:${mark}:${side > 0 ? "r" : "l"}`),
        "plastic", "panel",
        [mx, CAR_FLOOR + 0.06, mz], [0.34, 0.3, 0.03],
        mark % 3 === 0 ? BLUE : YELLOW,
        { rotation: [0, frame.yaw, Math.PI / 4], bearsLoad: false, volume: 0.004,
          sideAttachmentReach: 0.5 });
      primitive(target, id(`curl:${mark}:${side > 0 ? "r" : "l"}`),
        "plastic", "panel",
        [mx + 0.0, CAR_FLOOR + 0.3, mz], [0.5, 0.09, 0.03], WHITE,
        { rotation, bearsLoad: false, volume: 0.003, sideAttachmentReach: 0.5 });
    }
    if (index === 0) {
      const [sx, sz] = point(frame, centreT - 4.4, side * (CAR_WIDTH / 2 + 0.008));
      for (let tier = 0; tier < 3; tier += 1) {
        primitive(target, id(`tent:${tier}:${side > 0 ? "r" : "l"}`),
          "plastic", "panel",
          [sx, CAR_FLOOR + 0.1 + tier * 0.17, sz],
          [1.5 - tier * 0.44, 0.17, 0.03], BLUE,
          { rotation, bearsLoad: false, volume: 0.004, sideAttachmentReach: 0.6 });
      }
    }
    // Бортовой номер и служебная маркировка.
    const [nx, nz] = point(frame, centreT + SECTION_LENGTH / 2 - 1.5,
      side * (CAR_WIDTH / 2 + 0.008));
    primitive(target, id(`number:${side > 0 ? "r" : "l"}`), "plastic", "panel",
      [nx, CAR_FLOOR + 0.42, nz], [1.1, 0.2, 0.03], "#4a5155",
      { rotation, bearsLoad: false, volume: 0.004, sideAttachmentReach: 0.6 });
    const [dx, dz] = point(frame, centreT - SECTION_LENGTH / 4 + 1.3,
      side * (CAR_WIDTH / 2 + 0.008));
    primitive(target, id(`marking:${side > 0 ? "r" : "l"}`), "plastic", "panel",
      [dx, CAR_FLOOR + 0.2, dz], [0.42, 0.1, 0.03], "#4a5155",
      { rotation, bearsLoad: false, volume: 0.002, sideAttachmentReach: 0.6 });
  }

  // Двери: две створки, верх стеклянный, низ серый, кромка в чёрно-жёлтую
  // штриховку. По две на секцию с каждой стороны, в створ платформенных.
  for (const [doorIndex, doorT] of doorCentres.entries()) {
    for (const side of [-1, 1] as const) {
      for (const leaf of [-1, 1] as const) {
        const t = doorT + leaf * DOOR_WIDTH / 4;
        const [lx, lz] = point(frame, t, side * (CAR_WIDTH / 2 - 0.06));
        const suffix = `${doorIndex}:${side > 0 ? "r" : "l"}:${leaf > 0 ? "b" : "a"}`;
        primitive(target, id(`door-glass:${suffix}`), "darkGlass", "glassPane",
          [lx, SILL + 0.62, lz], [DOOR_WIDTH / 2 - 0.03, 1.22, 0.1], DARK_GLASS,
          { rotation, bearsLoad: false, volume: 0.08, sideAttachmentReach: 0.9 });
        primitive(target, id(`door-panel:${suffix}`), "plastic", "panel",
          [lx, CAR_FLOOR + 0.55, lz], [DOOR_WIDTH / 2 - 0.03, 1.36, 0.1], GREY_LIGHT,
          { rotation, bearsLoad: false, volume: 0.08, sideAttachmentReach: 0.9 });
        const [ex, ez] = point(frame, doorT + leaf * (DOOR_WIDTH / 2 - 0.04),
          side * (CAR_WIDTH / 2 - 0.02));
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
          light: { color: "#7de08f", distance: 4, intensity: 0.35 },
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
    if (Math.min(t + TRAIN_LENGTH / 2, TRAIN_LENGTH / 2 - t) < NOSE_LENGTH * 0.72) {
      continue;
    }
    const [rx, rz] = point(frame, t, 0);
    primitive(target, id(`roof:${part}`), "steel", "panel",
      [rx, ROOF + 0.08, rz],
      [roofStep + 0.02, 0.16, roofHalfWidth(t) * 2], GREY,
      { rotation, bearingArea: 5, volume: 0.12, carriesAttachments: true,
        attachmentSupportMode: "cable", sideAttachmentReach: 1.5 });
    // Скруглённое плечо: узкая фаска между бортом и крышей.
    for (const side of [-1, 1] as const) {
      const [sx, sz] = point(frame, t, side * (bodyHalfWidth(t) - 0.12));
      primitive(target, id(`shoulder:${part}:${side > 0 ? "r" : "l"}`),
        "steel", "panel",
        [sx, ROOF - 0.02, sz], [roofStep + 0.02, 0.2, 0.26], GREY,
        { rotation, bearsLoad: false, volume: 0.02, sideAttachmentReach: 0.6 });
    }
    if (part % 3 === 1) {
      primitive(target, id(`hvac:${part}`), "steel", "panel",
        [rx, ROOF + 0.28, rz], [roofStep * 2.2, 0.24, 1.7], GREY_LIGHT,
        { rotation, bearingArea: 2, volume: 0.4 });
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
    // Гармошка стоит В ЗАЗОРЕ и выходит НАРУЖУ поджатого кузова: снаружи она
    // и читается как стык. Спрятанная внутри линии борта, она давала
    // «сплошной объект» — состав без вагонов.
    const bellows = 3;
    for (let fold = 0; fold < bellows; fold += 1) {
      const foldT = t + (fold - 1) * 0.09;
      const [gx, gz] = point(frame, foldT, 0);
      const half = CAR_WIDTH / 2 - JOINT_TUCK + 0.04;
      primitive(target, id(`gangway:${end > 0 ? "b" : "a"}:${fold}`),
        "cloth", "panel",
        [gx, (CAR_FLOOR + ROOF) / 2 - 0.1, gz],
        [0.08, ROOF - CAR_FLOOR - 0.3, half * 2], "#31363a",
        { rotation, bearsLoad: false, volume: 0.05, sideAttachmentReach: 0.9 });
    }
    // Переходный мостик по полу — по нему и переходят из секции в секцию.
    const [bx, bz] = point(frame, t, 0);
    primitive(target, id(`gangway-floor:${end > 0 ? "b" : "a"}`),
      "steel", "panel",
      [bx, CAR_FLOOR - 0.05, bz], [0.44, 0.1, CAR_WIDTH - 1.2], "#585f63",
      { rotation, bearingArea: 0.6, volume: 0.1 });
  }

  createInterior(target, id, frame, "cabin", centreT);
  if (isHead) {
    // Салонное освещение головных секций — их видно с платформы насквозь.
    const [lx, lz] = point(frame, centreT, 0);
    primitive(target, id("cabin-light"), "plastic", "panel",
      [lx, ROOF - 0.12, lz], [SECTION_LENGTH - 2, 0.08, 0.9], WHITE,
      {
        rotation, bearsLoad: false, volume: 0.05, sideAttachmentReach: 1.2,
        light: { color: "#eef4ff", distance: 9, intensity: 0.8, position: [0, -0.4, 0] },
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
