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
// Главная узнаваемая вещь — цельный продольный обвод. Между дверями пояс,
// оконная лента и крыша идут строго прямо; формование начинается только у
// кабины. Орнамент ливреи остаётся текстурой и геометрию кузова не дробит.
//
// Секции — три отдельных кластера. Состав задуман составным кинематическим
// объектом (`compoundKinematicCluster`): у каждой секции своя поза на пути,
// и на дуге они разворачиваются друг относительно друга, как настоящие.

import type { MutableGroup } from "./astanaAuthoring.ts";
import type {
  SceneVector3,
  SpotLightDefinition,
} from "../../../game/destructionScene.ts";
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
const DOOR_WIDTH = 1.9;
/** Где стоит состав: на эталонной станции, «Нұрлы жол». */
export const TRAIN_STATION = "west" as const;

const TURQUOISE = "#7fc6cc";
const GREY_LIGHT = "#a3a9ac";
const DARK_GLASS = "#2b3338";
const WINDOW_MASK = "#41494d";
const ROOF_DARK = "#50585c";
const BLACK = "#1b1f22";
const SKIRT = "#4d5356";
const IRON = "#3f4548";
const STEEL = "#b0b4b6";
const ORANGE = "#d4762f";
const YELLOW = "#e0b32c";
const WHITE = "#eef1f2";

/** Two route-facing headlights; rebuilt on every authored-scene pass. */
export const astanaTrainSpotLights: SpotLightDefinition[] = [];

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
const NOSE_LENGTH = 3.45;
/** Реальная морда широкая: борт у торца поджат, но не сходится в клин. */
const NOSE_TUCK = 0.24;
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

type PrimitiveOptions = NonNullable<Parameters<typeof primitive>[7]>;

const subtract = (a: SceneVector3, b: SceneVector3): SceneVector3 =>
  [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

const add = (a: SceneVector3, b: SceneVector3): SceneVector3 =>
  [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

const scale = (v: SceneVector3, factor: number): SceneVector3 =>
  [v[0] * factor, v[1] * factor, v[2] * factor];

const dot = (a: SceneVector3, b: SceneVector3): number =>
  a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

const normalise = (v: SceneVector3): SceneVector3 => {
  const length = Math.hypot(...v) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
};

/**
 * Exact faceted skin. Unlike a scaled box, the polygon has precisely the
 * supplied perimeter, so a raked windscreen or tapered nose does not grow
 * rectangular corners beyond its engineering stations.
 */
function surfacePanel(
  target: MutableGroup,
  id: string,
  material: "steel" | "plastic" | "glass" | "darkGlass",
  shape: "panel" | "glassPane" | "steelSheet",
  vertices: readonly SceneVector3[],
  thickness: number,
  color: string,
  options: PrimitiveOptions = {},
): void {
  if (vertices.length < 3) {
    throw new Error(`${id}: surface requires at least three vertices`);
  }
  const origin = vertices[0];
  const xAxis = normalise(subtract(vertices[1], origin));
  const rawY = subtract(vertices.at(-1)!, origin);
  const yAxis = normalise(subtract(rawY, scale(xAxis, dot(rawY, xAxis))));
  const projected = vertices.map((vertex) => {
    const relative = subtract(vertex, origin);
    return [dot(relative, xAxis), dot(relative, yAxis)] as const;
  });
  const minX = Math.min(...projected.map(([x]) => x));
  const maxX = Math.max(...projected.map(([x]) => x));
  const minY = Math.min(...projected.map(([, y]) => y));
  const maxY = Math.max(...projected.map(([, y]) => y));
  const width = Math.max(0.015, maxX - minX);
  const height = Math.max(0.015, maxY - minY);
  const centre = add(
    add(origin, scale(xAxis, (minX + maxX) / 2)),
    scale(yAxis, (minY + maxY) / 2),
  );
  primitive(target, id, material, shape, centre, [width, height, thickness], color, {
    ...options,
    rotation: orient(xAxis, yAxis),
    visualProfile: {
      vertices: projected.map(([x, y]) => [
        (x - (minX + maxX) / 2) / width,
        (y - (minY + maxY) / 2) / height,
      ] as const),
    },
  });
}

type CabMeshPoint = readonly [inward: number, y: number, lateral: number];

function gridTriangles(rows: number, columns: number): readonly number[] {
  const indices: number[] = [];
  for (let row = 0; row < rows - 1; row += 1) {
    for (let column = 0; column < columns - 1; column += 1) {
      const a = row * columns + column;
      const b = a + 1;
      const c = a + columns + 1;
      const d = a + columns;
      indices.push(a, b, c, a, c, d);
    }
  }
  return indices;
}

function fanTriangles(vertices: number): readonly number[] {
  const indices: number[] = [];
  for (let index = 1; index < vertices - 1; index += 1) {
    indices.push(0, index, index + 1);
  }
  return indices;
}

function ringTriangles(verticesPerLoop: number): readonly number[] {
  const indices: number[] = [];
  for (let index = 0; index < verticesPerLoop; index += 1) {
    const next = (index + 1) % verticesPerLoop;
    indices.push(
      index, next, verticesPerLoop + next,
      index, verticesPerLoop + next, verticesPerLoop + index,
    );
  }
  return indices;
}

/**
 * One render shell may bend in all three local axes. The source coordinates
 * are metres from the cab tip: +inward points into the car, lateral points
 * left. The authored piece remains a compact box proxy for train physics.
 */
function cabSurfaceMesh(
  target: MutableGroup,
  id: string,
  frame: TrainFrame,
  noseT: number,
  facing: 1 | -1,
  material: "steel" | "plastic" | "glass" | "darkGlass",
  shape: "panel" | "glassPane" | "steelSheet",
  sourceVertices: readonly CabMeshPoint[],
  sourceIndices: readonly number[],
  color: string,
  options: PrimitiveOptions = {},
  doubleSided = true,
): void {
  if (sourceVertices.length < 3 || sourceIndices.length < 3) {
    throw new Error(`${id}: surface mesh is empty`);
  }
  const localVertices = sourceVertices.map(([inward, y, lateral]) =>
    [-facing * inward, y, lateral] as const);
  const mins = [0, 1, 2].map((axis) =>
    Math.min(...localVertices.map((vertex) => vertex[axis])));
  const maxs = [0, 1, 2].map((axis) =>
    Math.max(...localVertices.map((vertex) => vertex[axis])));
  const centre = [0, 1, 2].map((axis) => (mins[axis] + maxs[axis]) / 2);
  const size = [0, 1, 2].map((axis) =>
    Math.max(0.025, maxs[axis] - mins[axis])) as unknown as SceneVector3;
  const vertices = localVertices.map((vertex) =>
    [0, 1, 2].map((axis) =>
      (vertex[axis] - centre[axis]) / size[axis]) as unknown as SceneVector3);

  const [x, z] = point(frame, noseT + centre[0], centre[2]);
  primitive(target, id, material, shape, [x, centre[1], z], size, color, {
    ...options,
    rotation: [0, frame.yaw, 0],
    visualMesh: {
      vertices,
      indices: doubleSided || facing === -1
        ? sourceIndices
        : sourceIndices.flatMap((_, index) => index % 3 === 0
          ? [sourceIndices[index], sourceIndices[index + 2], sourceIndices[index + 1]]
          : []),
      doubleSided,
    },
  });
}

/** Широкий каплевидный обвод кабины: u=0 торец, u=1 прямой кузов. */
export function cabSectionAt(u: number): {
  readonly halfWidth: number;
  readonly top: number;
  readonly bottom: number;
} {
  const eased = smoothstep(Math.min(1, Math.max(0, u)));
  return {
    halfWidth: (CAR_WIDTH / 2) * (0.76 + 0.24 * Math.pow(eased, 0.68)),
    top: ROOF + 0.27 * (1 - Math.pow(eased, 0.62)),
    bottom: RAIL_HEAD + 0.36 + 0.4 * Math.pow(eased, 0.78),
  };
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
  // Буксы, литые боковины, пружины и демпферы — на раме, вровень с колёсами.
  for (const side of [-1, 1] as const) {
    for (const [index, offset] of axleT.entries()) {
      const [bx, bz] = point(frame, t + offset, side * 0.6);
      primitive(target, id(`${name}:axlebox:${index}:${side > 0 ? "r" : "l"}`),
        "steel", "stoneBlock",
        [bx, RAIL_HEAD + WHEEL_RADIUS + 0.06, bz], [0.4, 0.3, 0.26], IRON,
        { rotation, bearsLoad: false, volume: 0.1, sideAttachmentReach: 0.5 });
    }
    const sideName = side > 0 ? "r" : "l";
    const [sideX, sideZ] = point(frame, t, side * 0.82);
    primitive(target, id(`${name}:sideframe:${sideName}`), "steel", "panel",
      [sideX, RAIL_HEAD + 0.68, sideZ], [2.38, 0.18, 0.16], "#555c60",
      { rotation, bearsLoad: false, volume: 0.13, sideAttachmentReach: 1.1 });
    for (const [spring, springT] of [-0.46, 0.46].entries()) {
      const [springX, springZ] = point(frame, t + springT, side * 0.82);
      for (const lateral of [-0.07, 0.07] as const) {
        const springPosition = add(
          [springX, RAIL_HEAD + 0.77, springZ],
          scale([frame.inward[0], 0, frame.inward[1]], lateral * side),
        );
        primitive(target, id(`${name}:spring:${sideName}:${spring}:${lateral > 0 ? "o" : "i"}`),
          "steel", "cylinder", springPosition, [0.13, 0.26, 0.13], "#747b7e",
          { bearsLoad: false, volume: 0.018, sideAttachmentReach: 0.35 });
      }
    }
    const [damperX, damperZ] = point(frame, t + 0.18, side * 0.94);
    primitive(target, id(`${name}:yaw-damper:${sideName}`), "steel", "cylinder",
      [damperX, RAIL_HEAD + 0.79, damperZ], [0.075, 0.72, 0.075], "#8d9497",
      { rotation: [0, frame.yaw, Math.PI / 2 - 0.24 * side],
        bearsLoad: false, volume: 0.022, sideAttachmentReach: 0.5 });
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
  interiorFromT: number,
  interiorToT: number,
): void {
  const rotation: readonly [number, number, number] = [0, frame.yaw, 0];
  const interiorSpan = interiorToT - interiorFromT;
  const seatRows = 4;
  for (let row = 0; row < seatRows; row += 1) {
    const t = interiorFromT + 1 +
      (row * Math.max(0.4, interiorSpan - 2)) / (seatRows - 1);
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
  const interiorCentreT = (interiorFromT + interiorToT) / 2;
  const [rx, rz] = point(frame, interiorCentreT, 0);
  // У цилиндра размер — [диаметр, ДЛИНА, диаметр], и длина идёт по локальному
  // +y; горизонтальный поручень получается разворотом на четверть.
  primitive(target, id(`${name}:grabrail`), "steel", "cylinder",
    [rx, ROOF - 0.34, rz], [0.06, Math.max(0.5, interiorSpan - 0.8), 0.06], STEEL,
    { rotation: [0, frame.yaw, Math.PI / 2], volume: 0.06, bearingArea: 0.5,
      carriesAttachments: true, attachmentSupportMode: "cable",
      sideAttachmentReach: 0.7 });
  for (let pole = 0; pole < 4; pole += 1) {
    const t = interiorFromT + 1.1 +
      (pole * Math.max(0.4, interiorSpan - 2.2)) / 3;
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
      const panelOffset = DOOR_WIDTH / 2 + 0.22;
      const authoredPanelT = t + door * panelOffset;
      // At a cab-end doorway the outward jamb falls inside the taper, beyond
      // the straight interior frame.  Put that one panel on the inboard jamb
      // instead; otherwise it has no pillar or waist rail behind it.
      const mirroredPanelT = t - door * panelOffset;
      const panelT = authoredPanelT >= interiorFromT &&
          authoredPanelT <= interiorToT
        ? authoredPanelT
        : mirroredPanelT;
      const [yx, yz] = point(
        frame, panelT, side * (CAR_WIDTH / 2 - 0.12),
      );
      primitive(target, id(`${name}:doorpanel:${door > 0 ? "b" : "a"}:${side > 0 ? "r" : "l"}`),
        "plastic", "panel",
        [yx, CAR_FLOOR + 0.9, yz], [0.4, 1.6, 0.06], YELLOW,
        { rotation, bearsLoad: false, volume: 0.03, sideAttachmentReach: 0.5 });
    }
  }
}

/** Формованная кабина TRITON по продольным станциям и точным граням. */
function createCab(
  target: MutableGroup,
  id: (s: string) => string,
  frame: TrainFrame,
  name: string,
  noseT: number,
  facing: 1 | -1,
  spotLights: SpotLightDefinition[],
): void {
  const bodyStartT = noseT - facing * NOSE_LENGTH;
  const rotation: SceneVector3 = [0, frame.yaw, 0];
  const outward: SceneVector3 = [
    frame.along[0] * facing,
    0,
    frame.along[1] * facing,
  ];
  const shellOptions: PrimitiveOptions = {
    bearingArea: 0.55,
    carriesAttachments: true,
    attachmentSupportMode: "wall",
    sideAttachmentReach: 0.9,
    textureProfile: "matte-aluminium",
  };
  const trimOptions: PrimitiveOptions = {
    bearsLoad: false,
    volume: 0.012,
    sideAttachmentReach: 0.55,
  };

  interface CabStation {
    readonly d: number;
    readonly halfWidth: number;
    readonly bottom: number;
    readonly top: number;
  }
  const stations: readonly CabStation[] = [
    { d: 0.12, halfWidth: 0.72, bottom: RAIL_HEAD + 0.58, top: ROOF + 0.28 },
    { d: 0.34, halfWidth: 0.86, bottom: RAIL_HEAD + 0.6, top: ROOF + 0.3 },
    { d: 0.68, halfWidth: 1.04, bottom: RAIL_HEAD + 0.62, top: ROOF + 0.32 },
    { d: 1.08, halfWidth: 1.18, bottom: RAIL_HEAD + 0.65, top: ROOF + 0.34 },
    { d: 1.55, halfWidth: 1.32, bottom: RAIL_HEAD + 0.68, top: ROOF + 0.32 },
    { d: 2.08, halfWidth: 1.37, bottom: RAIL_HEAD + 0.71, top: ROOF + 0.27 },
    { d: 2.55, halfWidth: 1.4, bottom: RAIL_HEAD + 0.74, top: ROOF + 0.17 },
    { d: 3, halfWidth: 1.4, bottom: RAIL_HEAD + 0.755, top: ROOF + 0.085 },
    { d: NOSE_LENGTH, halfWidth: CAR_WIDTH / 2, bottom: RAIL_HEAD + 0.76, top: ROOF + 0.045 },
  ];

  const stationAt = (d: number): CabStation => {
    const clamped = Math.max(stations[0].d, Math.min(NOSE_LENGTH, d));
    const upperIndex = stations.findIndex((station) => station.d >= clamped);
    if (upperIndex <= 0) return stations[0];
    const a = stations[upperIndex - 1];
    const b = stations[upperIndex];
    const mix = (clamped - a.d) / Math.max(0.001, b.d - a.d);
    return {
      d: clamped,
      halfWidth: a.halfWidth + (b.halfWidth - a.halfWidth) * mix,
      bottom: a.bottom + (b.bottom - a.bottom) * mix,
      top: a.top + (b.top - a.top) * mix,
    };
  };
  const beltYAt = (d: number): number =>
    SILL - 0.34 * (1 - smoothstep(d / NOSE_LENGTH));

  const maskBottom = SILL - 0.28;
  const glassBottom = SILL + 0.18;
  const glassTop = ROOF - 0.08;
  // The crown sits behind the windscreen.  The mask begins below that crown,
  // so the longitudinal roof profile is already descending at the glass.
  const maskTop = ROOF + 0.1;
  const frontDepth = (y: number, w: number): number => {
    const vertical = Math.max(0, Math.min(1,
      (y - maskBottom) / (maskTop - maskBottom)));
    // The windscreen is laid back by roughly 45 degrees in profile.  Its
    // transverse term is deliberately weaker: the frontal taper is produced
    // by the outline, not by turning the mask into a faceted barrel.
    const longitudinalCurve = 0.25 * vertical +
      0.75 * vertical * vertical;
    const centre = 0.08 + 1.85 * longitudinalCurve;
    const transverseScale = 0.5 * (1 - 0.55 * Math.pow(vertical, 4));
    const transverse = transverseScale *
      Math.pow(Math.min(1, Math.abs(w) / 1.1), 1.15);
    return centre + transverse;
  };
  const lowerFrontDepth = (y: number, w: number): number => {
    const lowerTip = RAIL_HEAD + 0.31;
    const vertical = Math.max(0, Math.min(1,
      (y - lowerTip) / (maskBottom - lowerTip)));
    // Below the belt the tip curls back under the cab instead of continuing as
    // a vertical wall. At the belt it joins the windscreen depth continuously.
    const centre = 0.62 - 0.52 * smoothstep(vertical);
    const transverse = 0.44 * Math.pow(Math.min(1, Math.abs(w) / 1.08), 1.15);
    return centre + transverse;
  };

  const lowerCrossSection = (station: CabStation): readonly CabMeshPoint[] => {
    const w = station.halfWidth;
    const transition = smoothstep(station.d / NOSE_LENGTH);
    const waistWidth = w * (0.78 + 0.22 * transition);
    const lowerWidth = w * (0.6 + 0.35 * transition);
    const bottomWidth = w * (0.42 + 0.42 * transition);
    const pointAt = (y: number, lateral: number): CabMeshPoint => [
      Math.max(station.d, lowerFrontDepth(y, lateral)), y, lateral,
    ];
    return [
      pointAt(beltYAt(station.d) + 0.04, -w),
      pointAt(CAR_FLOOR + 0.32, -waistWidth),
      pointAt(station.bottom + 0.17, -lowerWidth),
      pointAt(station.bottom, -bottomWidth),
      pointAt(station.bottom - 0.045, 0),
      pointAt(station.bottom, bottomWidth),
      pointAt(station.bottom + 0.17, lowerWidth),
      pointAt(CAR_FLOOR + 0.32, waistWidth),
      pointAt(beltYAt(station.d) + 0.04, w),
    ];
  };
  const lowerVertices = stations.flatMap(lowerCrossSection);
  cabSurfaceMesh(
    target, id(`${name}:lower-shell`), frame, noseT, facing,
    "steel", "steelSheet", lowerVertices,
    gridTriangles(stations.length, lowerCrossSection(stations[0]).length),
    TURQUOISE, shellOptions,
  );

  const frontWorld = (w: number, y: number, outset = 0): SceneVector3 => {
    const [x, z] = point(frame, noseT - facing * (frontDepth(y, w) - outset), w);
    return [x, y, z];
  };
  const frontGrid = (
    rows: readonly (readonly [y: number, halfWidth: number, arcDrop?: number])[],
    outset = 0,
    columns = 13,
    depthAt: (y: number, w: number) => number = frontDepth,
  ): readonly CabMeshPoint[] => rows.flatMap(([y, halfWidth, arcDrop = 0]) =>
    Array.from({ length: columns }, (_, column) => {
      const q = -1 + (2 * column) / (columns - 1);
      const w = halfWidth * q;
      const curvedY = y - arcDrop * (1 - q * q);
      return [depthAt(curvedY, w) - outset, curvedY, w] as const;
    }));

  const maskSpan = maskTop - maskBottom;
  const maskRowCount = 17;
  const maskRows: readonly (readonly [number, number, number])[] =
    Array.from({ length: maskRowCount }, (_, row) => {
      const v = row / (maskRowCount - 1);
      const halfWidth = 0.82 + 0.14 * v +
        0.23 * Math.sin(Math.PI * Math.pow(v, 0.88));
      const lowerArc = 0.145 *
        (1 - smoothstep(Math.min(1, v / 0.32)));
      return [maskBottom + maskSpan * v, halfWidth, lowerArc] as const;
    });
  const maskColumns = 15;
  const maskVertices = frontGrid(maskRows, 0, maskColumns);
  cabSurfaceMesh(
    target, id(`${name}:front-mask`), frame, noseT, facing,
    "plastic", "panel", maskVertices,
    gridTriangles(maskRows.length, maskColumns), WINDOW_MASK,
    { ...shellOptions, textureProfile: undefined }, false,
  );

  const glassSpan = glassTop - glassBottom;
  const glassRowCount = 15;
  const glassRows: readonly (readonly [number, number, number])[] =
    Array.from({ length: glassRowCount }, (_, row) => {
      const v = row / (glassRowCount - 1);
      const halfWidth = 0.62 + 0.05 * v +
        0.15 * Math.sin(Math.PI * Math.pow(v, 0.92));
      const lowerArc = 0.085 *
        (1 - smoothstep(Math.min(1, v / 0.34)));
      return [glassBottom + glassSpan * v, halfWidth, lowerArc] as const;
    });
  cabSurfaceMesh(
    target, id(`${name}:windscreen`), frame, noseT, facing,
    "darkGlass", "glassPane", frontGrid(glassRows, 0.024, 15),
    gridTriangles(glassRows.length, 15), DARK_GLASS, trimOptions, false,
  );

  // The roof belt joins the mask above mid-height, descends along both sides,
  // and closes underneath. It intentionally does not run across the top.
  const accentJoinRow = Math.round((maskRows.length - 1) * 0.66);
  const accentPath = [
    ...Array.from({ length: accentJoinRow + 1 }, (_, index) =>
      maskVertices[(accentJoinRow - index) * maskColumns]),
    ...maskVertices.slice(1, maskColumns),
    ...Array.from({ length: accentJoinRow }, (_, index) =>
      maskVertices[(index + 1) * maskColumns + maskColumns - 1]),
  ];
  const accentInner = accentPath.map(([d, y, w]) =>
    [d - 0.032, y, w] as const);
  const accentOuter = accentPath.map(([, y, w]) => {
    const verticalSide = Math.abs(w) > 0.9;
    const expandedW = w === 0 ? 0 :
      w + Math.sign(w) * (verticalSide ? 0.13 : 0.09);
    const expandedY = y + (y < maskBottom + 0.02 ? -0.13 : 0);
    return [
      frontDepth(expandedY, expandedW) - 0.037,
      expandedY,
      expandedW,
    ] as const;
  });
  cabSurfaceMesh(
    target, id(`${name}:glass-accent`), frame, noseT, facing,
    "steel", "steelSheet", accentPath.flatMap((_, index) =>
      [accentOuter[index], accentInner[index]]),
    gridTriangles(accentPath.length, 2), TURQUOISE, {
      ...trimOptions,
      textureProfile: "matte-aluminium",
    },
  );

  // One continuous roof skin bridges the top of the mask to the first regular
  // body section.  Its low crown is the forward continuation of the car roof,
  // not a separate fairing placed on top of it.
  const domeBackD = NOSE_LENGTH;
  const domeBackStation = stationAt(domeBackD);
  const domeBackHalf = domeBackStation.halfWidth - 0.16;
  const roofSkinY = (u: number, q: number, frontY: number): number => {
    const edgeFactor = 1 - 0.22 * Math.abs(q);
    const p0 = frontY;
    const p1 = frontY + 0.14 * edgeFactor;
    const p2 = ROOF + 0.24 * edgeFactor;
    const p3 = ROOF + 0.06;
    const p4 = ROOF + 0.06;
    const inverse = 1 - u;
    return inverse ** 4 * p0 +
      4 * inverse ** 3 * u * p1 +
      6 * inverse ** 2 * u ** 2 * p2 +
      4 * inverse * u ** 3 * p3 +
      u ** 4 * p4;
  };
  const domeRows = 15;
  const domeVertices = Array.from({ length: domeRows }, (_, row) => {
    const u = row / (domeRows - 1);
    const blend = smoothstep(u);
    return Array.from({ length: maskColumns }, (_, column) => {
      const q = -1 + (2 * column) / (maskColumns - 1);
      const front = maskVertices[(maskRows.length - 1) * maskColumns + column];
      const backW = domeBackHalf * q;
      return [
        front[0] + (domeBackD - front[0]) * u,
        roofSkinY(u, q, front[1]),
        front[2] + (backW - front[2]) * blend,
      ] as const;
    });
  }).flat();
  const domeIndices = gridTriangles(domeRows, maskColumns);
  cabSurfaceMesh(
    target, id(`${name}:roof-dome`), frame, noseT, facing,
    "steel", "steelSheet", domeVertices,
    domeIndices, WINDOW_MASK, shellOptions, false,
  );

  // The return is one rounded surface. Its upper band belongs to the dark roof
  // cap; the light side skin ends below it without changing the geometry.
  for (const side of [-1, 1] as const) {
    const sideName = side > 0 ? "r" : "l";
    const returnRows = maskRows;
    const returnColumns = domeRows;
    const returnVertices = returnRows.flatMap(([y, halfWidth], row) => {
      const frontW = side * halfWidth;
      const edgeD = frontDepth(y, frontW);
      const backD = domeBackD;
      const backStation = stationAt(backD);
      const roofHalf = backStation.halfWidth - 0.16;
      const upperBlend = row <= accentJoinRow
        ? 0
        : smoothstep((row - accentJoinRow) /
          (returnRows.length - 1 - accentJoinRow));
      const backY = row < accentJoinRow
        ? y
        : HEADER + 0.08 +
          (ROOF + 0.06 - (HEADER + 0.08)) * upperBlend;
      const backHalfWidth = backStation.halfWidth +
        (roofHalf - backStation.halfWidth) * upperBlend;
      return Array.from({ length: returnColumns }, (_, column) => {
        const u = column / (returnColumns - 1);
        const longitudinalBlend = smoothstep(u);
        const baseY = y + (backY - y) * longitudinalBlend;
        const roofY = roofSkinY(u, side, maskTop);
        const roundedY = baseY + (roofY - baseY) * upperBlend ** 3;
        return [
          edgeD + 0.006 + (backD - edgeD - 0.006) * u,
          roundedY,
          frontW + (side * backHalfWidth - frontW) * longitudinalBlend,
        ] as const;
      });
    });
    const roofJoinRow = maskRows.length - 4;
    const lightReturnVertices = returnVertices.slice(
      0,
      (roofJoinRow + 1) * returnColumns,
    );
    const roofReturnVertices = returnVertices.slice(
      roofJoinRow * returnColumns,
    );
    cabSurfaceMesh(
      target, id(`${name}:mask-return:${sideName}`), frame, noseT, facing,
      "steel", "steelSheet", lightReturnVertices,
      gridTriangles(roofJoinRow + 1, returnColumns), GREY_LIGHT, {
        ...shellOptions,
        // These bonded returns are the actual side carriers of the large
        // moulded front mask.  A cable-like attachment permits that shared
        // vertical seam to transfer load without inventing a tall hidden wall.
        attachmentSupportMode: "cable",
      },
    );
    cabSurfaceMesh(
      target, id(`${name}:roof-return:${sideName}`), frame, noseT, facing,
      "steel", "steelSheet", roofReturnVertices,
      gridTriangles(returnRows.length - roofJoinRow, returnColumns),
      WINDOW_MASK, shellOptions,
    );
  }

  for (const side of [-1, 1] as const) {
    const sideName = side > 0 ? "r" : "l";
    const joinY = maskRows[accentJoinRow][0];
    const joinHalfWidth = maskRows[accentJoinRow][1];
    const nextY = maskRows[accentJoinRow - 1][0];
    const nextHalfWidth = maskRows[accentJoinRow - 1][1];
    const endD = frontDepth(joinY, side * joinHalfWidth);
    const nextD = frontDepth(nextY, side * nextHalfWidth);
    const controls = [
      [NOSE_LENGTH, HEADER + 0.08, CAR_WIDTH / 2 - 0.023],
      [NOSE_LENGTH - 0.48, HEADER + 0.08, 1.365],
      [
        endD + (endD - nextD) * 0.72,
        joinY + (joinY - nextY) * 0.72,
        joinHalfWidth + (joinHalfWidth - nextHalfWidth) * 0.72,
      ],
      [endD, joinY, joinHalfWidth],
    ] as const;
    const sweep = Array.from({ length: 19 }, (_, index) => {
      const u = index / 18;
      const inverse = 1 - u;
      return [0, 1, 2].map((axis) =>
        inverse ** 3 * controls[0][axis] +
        3 * inverse ** 2 * u * controls[1][axis] +
        3 * inverse * u ** 2 * controls[2][axis] +
        u ** 3 * controls[3][axis]) as unknown as CabMeshPoint;
    });
    const ribbon = sweep.flatMap(([d, y, halfWidth]) => {
      const w = side * (halfWidth + 0.035);
      return [
        [d - 0.012, y - 0.045, w],
        [d - 0.018, y + 0.045, w],
      ] as const;
    });
    cabSurfaceMesh(
      target, id(`${name}:roof-accent:${sideName}`), frame, noseT, facing,
      "steel", "steelSheet", ribbon, gridTriangles(sweep.length, 2),
      TURQUOISE, { ...trimOptions, textureProfile: "matte-aluminium" },
    );
  }

  // The white element is not a body-edge trim. It is the short frontal smile
  // between the two lamp pods, just below the windscreen.
  const frontStripeRows = [
    [glassBottom - 0.115, 0.69, 0.11],
    [glassBottom - 0.055, 0.69, 0.11],
  ] as const;
  cabSurfaceMesh(
    target, id(`${name}:smile-accent`), frame, noseT, facing,
    "steel", "steelSheet", frontGrid(frontStripeRows, 0.04, 15),
    gridTriangles(2, 15), WHITE, {
      ...trimOptions,
      textureProfile: "matte-aluminium",
    },
  );

  // Smooth turquoise cheek and the dark lower bowl replace the old bumper.
  const chinLowerRows = [
    [RAIL_HEAD + 0.62, 0.58],
    [RAIL_HEAD + 0.68, 0.64],
    [RAIL_HEAD + 0.76, 0.73],
    [RAIL_HEAD + 0.88, 0.84],
    [RAIL_HEAD + 1.02, 0.94],
    [maskBottom - 0.25, 1.0],
    [maskBottom - 0.115, 1.04],
    [maskBottom - 0.055, 0.95, 0.075],
  ] as const;
  const chinColumns = maskColumns;
  const chinVertices = [
    ...frontGrid(chinLowerRows, 0.008, chinColumns, lowerFrontDepth),
    ...maskVertices.slice(0, maskColumns),
  ];
  cabSurfaceMesh(
    target, id(`${name}:chin`), frame, noseT, facing,
    "steel", "steelSheet", chinVertices,
    gridTriangles(chinLowerRows.length + 1, chinColumns),
    TURQUOISE, shellOptions,
  );
  const apronRows = [
    [RAIL_HEAD + 0.34, 0.38],
    [RAIL_HEAD + 0.37, 0.45],
    [RAIL_HEAD + 0.42, 0.54],
    [RAIL_HEAD + 0.52, 0.63],
    [RAIL_HEAD + 0.62, 0.58],
  ] as const;
  cabSurfaceMesh(
    target, id(`${name}:front-apron`), frame, noseT, facing,
    "steel", "steelSheet",
    frontGrid(apronRows, 0.008, chinColumns, lowerFrontDepth),
    gridTriangles(apronRows.length, chinColumns), SKIRT, shellOptions,
  );

  // Continue the dark lower bowl along both cheeks and taper it out before
  // the leading axle. This keeps a visible chin in profile without copying
  // the full-length apron of the reference vehicle.
  const apronWrapSections = [
    [[lowerFrontDepth(RAIL_HEAD + 0.34, 0.38) - 0.008, RAIL_HEAD + 0.34, 0.38],
      [lowerFrontDepth(RAIL_HEAD + 0.62, 0.58) - 0.008, RAIL_HEAD + 0.62, 0.58]],
    [[0.9, RAIL_HEAD + 0.38, 0.55], [0.9, RAIL_HEAD + 0.66, 0.78]],
    [[1.2, RAIL_HEAD + 0.45, 0.66], [1.2, RAIL_HEAD + 0.68, 0.88]],
    [[1.5, RAIL_HEAD + 0.52, 0.76], [1.5, RAIL_HEAD + 0.7, 0.96]],
    [[1.75, RAIL_HEAD + 0.61, 0.85], [1.75, RAIL_HEAD + 0.71, 1.02]],
    [[1.9, RAIL_HEAD + 0.69, 0.91], [1.9, RAIL_HEAD + 0.72, 1.05]],
  ] as const;
  for (const side of [-1, 1] as const) {
    const sideName = side > 0 ? "r" : "l";
    const wrapVertices = apronWrapSections.flatMap((section) =>
      section.map(([d, y, halfWidth]) =>
        [d, y, side * halfWidth] as const));
    cabSurfaceMesh(
      target, id(`${name}:apron-wrap:${sideName}`), frame, noseT, facing,
      "steel", "steelSheet", wrapVertices,
      gridTriangles(apronWrapSections.length, 2), SKIRT, shellOptions,
    );
  }

  // One rounded trapezoidal cab window per side, bonded to the upper shell.
  for (const side of [-1, 1] as const) {
    const sideName = side > 0 ? "r" : "l";
    const onSide = (d: number, y: number, outset: number): CabMeshPoint => {
      return [d, y, side * (stationAt(d).halfWidth + outset)];
    };
    const resetOutset = (
      [d, y]: CabMeshPoint,
      outset: number,
    ): CabMeshPoint => [d, y, side * (stationAt(d).halfWidth + outset)];
    const outer = [
      onSide(1.9, SILL + 0.78, 0.02),
      onSide(1.94, SILL + 0.72, 0.02),
      onSide(2.55, SILL + 0.72, 0.02),
      onSide(2.62, SILL + 0.78, 0.02),
      onSide(2.62, HEADER - 0.14, 0.02),
      onSide(2.55, HEADER - 0.08, 0.02),
      onSide(2.13, HEADER - 0.08, 0.02),
      onSide(2.0, HEADER - 0.18, 0.02),
    ] as const;
    const inner = [
      onSide(1.99, SILL + 0.8, 0.038),
      onSide(2.03, SILL + 0.78, 0.038),
      onSide(2.49, SILL + 0.78, 0.038),
      onSide(2.54, SILL + 0.81, 0.038),
      onSide(2.54, HEADER - 0.17, 0.038),
      onSide(2.49, HEADER - 0.14, 0.038),
      onSide(2.17, HEADER - 0.14, 0.038),
      onSide(2.08, HEADER - 0.2, 0.038),
    ] as const;
    cabSurfaceMesh(
      target, id(`${name}:side-window-surround:${sideName}`),
      frame, noseT, facing, "plastic", "panel",
      [...outer, ...inner], ringTriangles(outer.length),
      WINDOW_MASK, trimOptions,
    );
    cabSurfaceMesh(
      target, id(`${name}:side-window-backing:${sideName}`),
      frame, noseT, facing, "plastic", "panel",
      inner.map((vertex) => resetOutset(vertex, 0.032)),
      fanTriangles(inner.length), BLACK, trimOptions,
    );
    cabSurfaceMesh(
      target, id(`${name}:side-window:${sideName}`),
      frame, noseT, facing, "darkGlass", "glassPane",
      inner.map((vertex) => resetOutset(vertex, 0.05)),
      fanTriangles(inner.length), DARK_GLASS, trimOptions,
    );
  }

  // Route display, lamp cassettes and wiper sit on the same curved front.
  const screenUp = subtract(
    frontWorld(0, glassTop - 0.01),
    frontWorld(0, glassBottom + 0.02),
  );
  const screenAcross: SceneVector3 = [frame.inward[0], 0, frame.inward[1]];
  const screenRotation = orient(screenAcross, screenUp);
  const routeY = glassTop - 0.07;
  const routeBoardRows = [
    [routeY - 0.038, 0.39],
    [routeY + 0.038, 0.39],
  ] as const;
  cabSurfaceMesh(
    target, id(`${name}:route-board`), frame, noseT, facing,
    "plastic", "panel", frontGrid(routeBoardRows, 0.045, 9),
    gridTriangles(2, 9), BLACK, trimOptions,
  );
  const routeTextRows = [
    [routeY - 0.013, 0.28],
    [routeY + 0.013, 0.28],
  ] as const;
  cabSurfaceMesh(
    target, id(`${name}:route-text`), frame, noseT, facing,
    "plastic", "panel", frontGrid(routeTextRows, 0.054, 9),
    gridTriangles(2, 9), "#e2a52a", trimOptions,
  );

  for (const side of [-1, 1] as const) {
    const sideName = side > 0 ? "r" : "l";
    const podY = glassBottom - 0.095;
    const podW = side * 0.83;
    surfacePanel(target, id(`${name}:lamp-pod:${sideName}`),
      "plastic", "panel", [
        frontWorld(podW - 0.13, podY - 0.08, 0.045),
        frontWorld(podW + 0.13, podY - 0.08, 0.045),
        frontWorld(podW + 0.12, podY + 0.08, 0.045),
        frontWorld(podW - 0.12, podY + 0.08, 0.045),
      ], 0.026, WINDOW_MASK, trimOptions);
    for (const [lamp, wOffset, color] of [
      ["headlight", -0.055, "#f2f6f8"],
      ["marker", 0.055, "#d6dde0"],
    ] as const) {
      const objectId = id(`${name}:${lamp}:${sideName}`);
      const lensPosition = frontWorld(podW + wOffset, podY, 0.076);
      primitive(target, id(`${name}:${lamp}:${sideName}`), "glass", "glassPane",
        lensPosition, [0.07, 0.072, 0.018], color,
        {
          rotation: screenRotation,
          ...trimOptions,
          ...(lamp === "headlight" ? {
            light: {
              color: "#fff3d8", distance: 22, intensity: 1.1,
              position: scale(outward, 0.5), followsGroup: true,
            },
          } : {}),
        });
      // The route is one-way, so only the leading cab casts forward. The
      // source starts at the lens and opens away from the train; it is not a
      // detached cone placed somewhere ahead of the nose.
      if (lamp === "headlight" && facing === 1) {
        const downAngle = 0.095;
        const direction: SceneVector3 = [
          outward[0] * Math.cos(downAngle),
          -Math.sin(downAngle),
          outward[2] * Math.cos(downAngle),
        ];
        const sourceOffset = 0.018 / 2 + 0.008;
        spotLights.push({
          id: `astana:${target.id}:${objectId}:piece`,
          position: [
            lensPosition[0] + direction[0] * sourceOffset,
            lensPosition[1] + direction[1] * sourceOffset,
            lensPosition[2] + direction[2] * sourceOffset,
          ],
          direction,
          carrierClusterId: `astana:${target.id}`,
          color: "#fff3d8",
          distance: 44,
          intensity: 280,
          angle: 0.16,
          penumbra: 0.52,
          decay: 1.8,
          dayIntensityFactor: 0,
          transition: {
            fadeInSeconds: 0.55,
            fadeOutSeconds: 0.4,
          },
          visibleBeam: {
            opacity: 0.085,
            sourceRadius: 0.038,
            length: 40,
            attenuation: 34,
            anglePower: 7,
          },
          fixtureGlow: {
            color,
            intensity: 5.2,
            halo: {
              physicalDiameter: 0.14,
              minScreenDiameter: 2.5,
              maxWorldDiameter: 0.3,
              dayOpacity: 0,
              nightOpacity: 0.88,
            },
          },
        });
      }
    }
  }

  const wiperStart = [-0.27, glassBottom + 0.06] as const;
  const wiperEnd = [0.24, glassTop - 0.16] as const;
  const wiperDw = wiperEnd[0] - wiperStart[0];
  const wiperDy = wiperEnd[1] - wiperStart[1];
  const wiperLength = Math.hypot(wiperDw, wiperDy);
  const wiperOffset = 0.011;
  const pw = (-wiperDy / wiperLength) * wiperOffset;
  const py = (wiperDw / wiperLength) * wiperOffset;
  surfacePanel(target, id(`${name}:wiper`), "steel", "panel", [
    frontWorld(wiperStart[0] + pw, wiperStart[1] + py, 0.06),
    frontWorld(wiperEnd[0] + pw, wiperEnd[1] + py, 0.06),
    frontWorld(wiperEnd[0] - pw, wiperEnd[1] - py, 0.06),
    frontWorld(wiperStart[0] - pw, wiperStart[1] - py, 0.06),
  ], 0.016, IRON, trimOptions);
  primitive(target, id(`${name}:wiper-pivot`), "steel", "cylinder",
    frontWorld(wiperStart[0], wiperStart[1], 0.065), [0.068, 0.04, 0.068], IRON,
    { rotation: rodRotation(frame.along), ...trimOptions });

  // The compact coupling lock lives inside the lower lip.  Its mounting
  // recess is a downward-pointing trapezoid: broad at the apron seam and
  // narrower at the bottom, so the equipment reads as part of the cab rather
  // than a separate block floating ahead of it.
  const couplerY = RAIL_HEAD + 0.49;
  const pocketBottom = RAIL_HEAD + 0.34;
  const pocketTop = RAIL_HEAD + 0.63;
  const pocket = [
    [lowerFrontDepth(pocketBottom, -0.25) - 0.034, pocketBottom, -0.25],
    [lowerFrontDepth(pocketBottom, 0.25) - 0.034, pocketBottom, 0.25],
    [lowerFrontDepth(pocketTop, 0.39) - 0.034, pocketTop, 0.39],
    [lowerFrontDepth(pocketTop, -0.39) - 0.034, pocketTop, -0.39],
  ] as const;
  cabSurfaceMesh(
    target, id(`${name}:coupler-pocket`), frame, noseT, facing,
    "plastic", "panel", pocket, fanTriangles(pocket.length), BLACK, trimOptions,
  );
  const pocketDepth = lowerFrontDepth(couplerY, 0) - 0.034;
  const shaftLength = 0.22;
  const shaftDepth = pocketDepth - shaftLength / 2;
  const [shaftX, shaftZ] = point(
    frame, noseT - facing * shaftDepth, 0,
  );
  primitive(target, id(`${name}:coupler-shaft`), "steel", "cylinder",
    [shaftX, couplerY, shaftZ], [0.1, shaftLength, 0.1], IRON,
    {
      rotation: rodRotation(frame.along), bearingArea: 0.35, volume: 0.04,
      carriesAttachments: true, attachmentSupportMode: "cable",
      sideAttachmentReach: 0.5,
    });
  const headDepth = pocketDepth - shaftLength - 0.055;
  const [headX, headZ] = point(
    frame, noseT - facing * headDepth, 0,
  );
  primitive(target, id(`${name}:coupler-head`), "steel", "panel",
    [headX, couplerY, headZ], [0.16, 0.17, 0.34], "#555b5e",
    { rotation, bearsLoad: false, volume: 0.045, sideAttachmentReach: 0.5 });
  const lockDepth = headDepth - 0.085;
  const [lockX, lockZ] = point(
    frame, noseT - facing * lockDepth, 0,
  );
  primitive(target, id(`${name}:coupler-lock`), "steel", "panel",
    [lockX, couplerY + 0.005, lockZ], [0.035, 0.09, 0.16], IRON,
    { rotation, bearsLoad: false, volume: 0.012, sideAttachmentReach: 0.3 });
  for (const side of [-1, 1] as const) {
    const hoseY = couplerY - 0.065;
    const hoseWidth = side * 0.22;
    const hoseDepth = lowerFrontDepth(hoseY, hoseWidth) - 0.065;
    const [hoseX, hoseZ] = point(
      frame, noseT - facing * hoseDepth, hoseWidth,
    );
    primitive(target, id(`${name}:coupler-hose:${side > 0 ? "r" : "l"}`),
      "plastic", "cylinder", [hoseX, hoseY, hoseZ],
      [0.032, 0.17, 0.032], BLACK,
      { rotation: [0, frame.yaw, 0], ...trimOptions });
  }

  const [bulkX, bulkZ] = point(frame, bodyStartT + facing * 0.14, 0);
  primitive(target, id(`${name}:bulkhead`), "plastic", "panel",
    [bulkX, (CAR_FLOOR + ROOF) / 2, bulkZ],
    [0.08, ROOF - CAR_FLOOR - 0.18, CAR_WIDTH - 0.4], "#d8dcde",
    { rotation, bearsLoad: false, volume: 0.16, sideAttachmentReach: 0.8 });
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
        // Вклеенный кант — только по периметру стекла. Сплошной чёрной
        // подложки за окном нет: она и создавала вид квадратной фермы.
        for (const [edge, edgeT, y, width, height] of [
          ["top", t, HEADER + 0.025, paneWidth + 0.1, 0.05],
          ["bottom", t, SILL - 0.025, paneWidth + 0.1, 0.05],
          ["front", t - paneWidth / 2 - 0.035, (SILL + HEADER) / 2,
            0.045, HEADER - SILL + 0.14],
          ["rear", t + paneWidth / 2 + 0.035, (SILL + HEADER) / 2,
            0.045, HEADER - SILL + 0.14],
        ] as const) {
          const [edgeX, edgeZ] = point(
            frame,
            edgeT,
            side * (bodyHalfWidth(edgeT) + 0.018),
          );
          primitive(target, id(`window-frame:${suffix}:${edge}`),
            "plastic", "panel", [edgeX, y, edgeZ],
            [width, height, 0.065], BLACK,
            { rotation, bearsLoad: false, volume: 0.009,
              sideAttachmentReach: 0.9 });
        }
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
  spotLights: SpotLightDefinition[],
): void {
  const rotation: readonly [number, number, number] = [0, frame.yaw, 0];
  const id = (suffix: string) => `${name}:${suffix}`;
  const centreT = -TRAIN_LENGTH / 2 + SECTION_LENGTH * (index + 0.5);
  const isHead = index === 0 || index === TRAIN_SECTIONS - 1;
  const sectionStart = centreT - SECTION_LENGTH / 2;
  const sectionEnd = centreT + SECTION_LENGTH / 2;
  const straightStart = sectionStart + (index === 0 ? NOSE_LENGTH : 0.3);
  const straightEnd = sectionEnd -
    (index === TRAIN_SECTIONS - 1 ? NOSE_LENGTH : 0.3);

  // Тележки под концами секции — на них стоит всё остальное.
  createBogie(target, id, frame, "bogie:a", centreT - SECTION_LENGTH / 2 + 3.2);
  createBogie(target, id, frame, "bogie:b", centreT + SECTION_LENGTH / 2 - 3.2);

  // Рама и пол: рама кузова лежит на тележках, пол — на раме. Между верхом
  // тележки и полом всего двадцать сантиметров, и обе детали в них живут.
  const frames = 3;
  const partLength = SECTION_LENGTH / frames;
  const underframeTop = CAR_FLOOR - 0.08;
  for (let part = 0; part < frames; part += 1) {
    const authoredFrom = centreT - SECTION_LENGTH / 2 + partLength * part;
    const authoredTo = authoredFrom + partLength;
    const frameFrom = index === 0 ? Math.max(authoredFrom, straightStart) : authoredFrom;
    const frameTo = index === TRAIN_SECTIONS - 1
      ? Math.min(authoredTo, straightEnd)
      : authoredTo;
    if (frameTo - frameFrom < 0.18) {
      continue;
    }
    const t = (frameFrom + frameTo) / 2;
    const [ux, uz] = point(frame, t, 0);
    primitive(target, id(`underframe:${part}`), "steel", "panel",
      [ux, (BOGIE_FRAME_TOP + underframeTop) / 2, uz],
      [frameTo - frameFrom + 0.04, underframeTop - BOGIE_FRAME_TOP, CAR_WIDTH - 0.2], IRON,
      { rotation, bearingArea: 6, volume: 1.1, carriesAttachments: true,
        attachmentSupportMode: "cable", sideAttachmentReach: 1.5 });
    primitive(target, id(`floor:${part}`), "plastic", "panel",
      [ux, CAR_FLOOR - 0.04, uz],
      [frameTo - frameFrom + 0.04, 0.08, CAR_WIDTH - 0.14], "#585f63",
      { rotation, bearingArea: 8, volume: 0.9, carriesAttachments: true,
        attachmentSupportMode: "cable", sideAttachmentReach: 1.5 });

    // Пояса борта: подоконный и надоконный. На них навешана вся обшивка —
    // без них панели держались бы за воздух, как жалюзи парапета до того,
    // как под ними появился цоколь.
    const partFrom = authoredFrom;
    const partTo = partFrom + partLength;
    const railFrom = Math.max(partFrom, straightStart);
    const railTo = Math.min(partTo, straightEnd);
    for (const side of [-1, 1] as const) {
      if (railTo - railFrom < 0.18) {
        continue;
      }
      const railT = (railFrom + railTo) / 2;
      const [wx, wz] = point(frame, railT, side * (CAR_WIDTH / 2 - 0.09));
      primitive(target, id(`waist:${part}:${side > 0 ? "r" : "l"}`),
        "steel", "panel",
        [wx, SILL - 0.05, wz], [railTo - railFrom, 0.18, 0.14], IRON,
        { rotation, bearingArea: 1.2, volume: 0.2, carriesAttachments: true,
          attachmentSupportMode: "cable", sideAttachmentReach: 1.2 });
      primitive(target, id(`cant:${part}:${side > 0 ? "r" : "l"}`),
        "steel", "panel",
        [wx, ROOF - 0.07, wz], [railTo - railFrom, 0.14, 0.14], IRON,
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
    const t = straightStart +
      ((straightEnd - straightStart) * pillar) / (pillars - 1);
    for (const side of [-1, 1] as const) {
      const [px, pz] = point(frame, t, side * (CAR_WIDTH / 2 - 0.09));
      primitive(target, id(`pillar:${pillar}:${side > 0 ? "r" : "l"}`),
        "steel", "panel",
        [px, (CAR_FLOOR + ROOF) / 2, pz], [0.11, ROOF - CAR_FLOOR, 0.16], IRON,
        { rotation, bearingArea: 0.8, volume: 0.16, carriesAttachments: true,
          attachmentSupportMode: "wall", sideAttachmentReach: 1.2 });
    }
  }

  // Прямой кузов между кабинами: несколько длинных алюминиевых панелей,
  // а не полуметровые вертикальные полосы. Бирюзовый пояс и тёмная зона над
  // окнами сохраняют одну высоту от двери до двери; наклон есть лишь у носа.
  const doorCentres = [-1, 1].map((side) => centreT + side * (SECTION_LENGTH / 4));
  const lowerIntervals = [
    [straightStart, doorCentres[0] - DOOR_WIDTH / 2],
    [doorCentres[0] + DOOR_WIDTH / 2, doorCentres[1] - DOOR_WIDTH / 2],
    [doorCentres[1] + DOOR_WIDTH / 2, straightEnd],
  ] as const;
  for (const side of [-1, 1] as const) {
    const sideName = side > 0 ? "r" : "l";
    const straightT = (straightStart + straightEnd) / 2;
    const straightLength = straightEnd - straightStart;
    const [bandX, bandZ] = point(
      frame,
      straightT,
      side * (bodyHalfWidth(straightT) - 0.05),
    );
    primitive(target, id(`window-band:${sideName}`), "steel", "panel",
      [bandX, (HEADER + ROOF) / 2, bandZ],
      [straightLength, ROOF - HEADER, 0.1], ROOF_DARK,
      { rotation, bearingArea: 1.2, volume: straightLength * 0.004,
        carriesAttachments: true, attachmentSupportMode: "wall",
        sideAttachmentReach: 1.2, textureProfile: "matte-aluminium" });
    const [beltX, beltZ] = point(
      frame,
      straightT,
      side * (bodyHalfWidth(straightT) + 0.012),
    );
    primitive(target, id(`upper-belt:${sideName}`), "steel", "panel",
      [beltX, HEADER + 0.08, beltZ], [straightLength, 0.16, 0.075], TURQUOISE,
      { rotation, bearsLoad: false, volume: straightLength * 0.0015,
        sideAttachmentReach: 0.8, textureProfile: "matte-aluminium" });
    // Узкая юбка прерывается над обеими тележками. За ней остаются видны
    // колёса, рессорное подвешивание и подвагонные шкафы — как на LRV 002.
    const bogieCentres = [sectionStart + 3.2, sectionEnd - 3.2] as const;
    const skirtIntervals = [
      [straightStart, bogieCentres[0] - 1.42],
      [bogieCentres[0] + 1.42, bogieCentres[1] - 1.42],
      [bogieCentres[1] + 1.42, straightEnd],
    ] as const;
    for (const [skirt, [from, to]] of skirtIntervals.entries()) {
      if (to - from < 0.16) continue;
      const skirtT = (from + to) / 2;
      const [skirtX, skirtZ] = point(
        frame,
        skirtT,
        side * (bodyHalfWidth(skirtT) - 0.12),
      );
      primitive(target, id(`skirt-side:${skirt}:${sideName}`), "steel", "panel",
        [skirtX, CAR_FLOOR - 0.235, skirtZ],
        [to - from, 0.23, 0.1], SKIRT,
        { rotation, bearsLoad: false, volume: (to - from) * 0.0012,
          sideAttachmentReach: 0.9, textureProfile: "matte-aluminium" });
    }
    for (const [panel, [from, to]] of lowerIntervals.entries()) {
      if (to - from < 0.18) {
        continue;
      }
      const t = (from + to) / 2;
      const [panelX, panelZ] = point(
        frame,
        t,
        side * (bodyHalfWidth(t) - 0.05),
      );
      primitive(target, id(`lower-side:${panel}:${sideName}`),
        "steel", "panel", [panelX, (CAR_FLOOR - 0.08 + SILL) / 2, panelZ],
        [to - from, SILL - CAR_FLOOR + 0.08, 0.1], TURQUOISE,
        { rotation, bearingArea: 1, volume: (to - from) * 0.003,
          carriesAttachments: true, attachmentSupportMode: "wall",
          sideAttachmentReach: 1, textureProfile: "matte-aluminium" });
    }
  }

  createSideWindows(target, id, frame, index, centreT);

  // ЛИВРЕЯ НЕ ДЕЛАЕТСЯ ГЕОМЕТРИЕЙ. Орнаментальный пояс, завитки, шатёр,
  // бортовой номер и служебная маркировка стояли здесь отдельными плоскими
  // деталями, налепленными на борт снаружи, — 138 кусков, 12% состава, и
  // читались наклейками. На настоящем вагоне это плёнка в уровень окраски.
  // Уходит в textureProfile отдельным шагом.

  // Двери: две широкие створки в одной тёмной вклеенной рамке. Жёлтый цвет
  // остаётся внутри проёма и с закрытой двери снаружи не рисует стойки.
  for (const [doorIndex, doorT] of doorCentres.entries()) {
    for (const side of [-1, 1] as const) {
      for (const leaf of [-1, 1] as const) {
        const t = doorT + leaf * DOOR_WIDTH / 4;
        const half = bodyHalfWidth(t);
        const suffix = `${doorIndex}:${side > 0 ? "r" : "l"}:${leaf > 0 ? "b" : "a"}`;
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
      }
      const sideName = side > 0 ? "r" : "l";
      for (const [edge, offset] of [["front", -0.5], ["seam", 0], ["rear", 0.5]] as const) {
        const edgeT = doorT + offset * DOOR_WIDTH;
        const [edgeX, edgeZ] = point(
          frame,
          edgeT,
          side * (bodyHalfWidth(edgeT) + 0.02),
        );
        primitive(target, id(`door-edge:${doorIndex}:${sideName}:${edge}`),
          "plastic", "panel", [edgeX, (CAR_FLOOR + HEADER) / 2, edgeZ],
          [0.045, HEADER - CAR_FLOOR + 0.08, 0.055], BLACK,
          { rotation, bearsLoad: false, volume: 0.009,
            sideAttachmentReach: 0.7 });
      }
      for (const [edge, y] of [["head", HEADER + 0.035], ["sill", SILL - 0.035]] as const) {
        const [edgeX, edgeZ] = point(
          frame,
          doorT,
          side * (bodyHalfWidth(doorT) + 0.02),
        );
        primitive(target, id(`door-frame-edge:${doorIndex}:${sideName}:${edge}`),
          "plastic", "panel", [edgeX, y, edgeZ],
          [DOOR_WIDTH + 0.08, 0.05, 0.055], BLACK,
          { rotation, bearsLoad: false, volume: 0.009,
            sideAttachmentReach: 0.7 });
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
  const roofParts = 6;
  const roofStep = (straightEnd - straightStart) / roofParts;
  const roofCorner = (t: number, side: 1 | -1, y = ROOF + 0.06): SceneVector3 => {
    const [x, z] = point(frame, t, side * roofHalfWidth(t));
    return [x, y, z];
  };
  for (let part = 0; part < roofParts; part += 1) {
    const from = straightStart + roofStep * part;
    const to = from + roofStep;
    surfacePanel(target, id(`roof:${part}`), "steel", "panel", [
      roofCorner(from, -1), roofCorner(to, -1),
      roofCorner(to, 1), roofCorner(from, 1),
    ], 0.1, ROOF_DARK, {
      bearingArea: 5, volume: 0.12, carriesAttachments: true,
      attachmentSupportMode: "cable", sideAttachmentReach: 1.5,
      textureProfile: "matte-aluminium",
    });
    // Настоящая наклонная фаска между плоским бортом и узкой крышей.
    for (const side of [-1, 1] as const) {
      const sideName = side > 0 ? "r" : "l";
      const bodyEdge = (t: number): SceneVector3 => {
        const [x, z] = point(frame, t, side * (bodyHalfWidth(t) - 0.045));
        return [x, ROOF - 0.16, z];
      };
      surfacePanel(target, id(`shoulder:${part}:${sideName}`), "steel", "panel", [
        bodyEdge(from), bodyEdge(to), roofCorner(to, side), roofCorner(from, side),
      ], 0.055, ROOF_DARK, {
        bearsLoad: false, volume: 0.02, sideAttachmentReach: 0.6,
        textureProfile: "matte-aluminium",
      });
    }
  }

  // Два низких климатических кожуха с фасками по углам и утопленными
  // воздухозаборниками. Это оборудование, а не прямоугольные плиты на крыше.
  for (const [unit, offset] of [-2.65, 2.65].entries()) {
    const fairingT = centreT + offset;
    const fairingLength = 3.25;
    const fairingHalfWidth = 0.78;
    const chamfer = 0.32;
    const plan = [
      [-fairingLength / 2 + chamfer, -fairingHalfWidth],
      [fairingLength / 2 - chamfer, -fairingHalfWidth],
      [fairingLength / 2, -fairingHalfWidth + chamfer],
      [fairingLength / 2, fairingHalfWidth - chamfer],
      [fairingLength / 2 - chamfer, fairingHalfWidth],
      [-fairingLength / 2 + chamfer, fairingHalfWidth],
      [-fairingLength / 2, fairingHalfWidth - chamfer],
      [-fairingLength / 2, -fairingHalfWidth + chamfer],
    ] as const;
    const fairingVertices = plan.map(([dt, w]) => {
      const [x, z] = point(frame, fairingT + dt, w);
      return [x, ROOF + 0.19, z] as const;
    });
    surfacePanel(target, id(`hvac:${unit}`), "steel", "panel",
      fairingVertices, 0.15, "#697175",
      { bearingArea: 1.4, volume: 0.24, textureProfile: "matte-aluminium" });
    for (const side of [-1, 1] as const) {
      const [ventX, ventZ] = point(frame, fairingT, side * 0.67);
      primitive(target, id(`hvac-intake:${unit}:${side > 0 ? "r" : "l"}`),
        "plastic", "panel", [ventX, ROOF + 0.275, ventZ],
        [fairingLength - 0.7, 0.035, 0.055], BLACK,
        { rotation, bearsLoad: false, volume: 0.01, sideAttachmentReach: 0.5 });
    }
  }

  // Торцы: у головной секции — морда, между секциями — гармошка перехода.
  if (index === 0) {
    createCab(target, id, frame, "cab", -TRAIN_LENGTH / 2, -1, spotLights);
  }
  if (index === TRAIN_SECTIONS - 1) {
    createCab(target, id, frame, "cab", TRAIN_LENGTH / 2, 1, spotLights);
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
          "plastic", "panel",
          [sideX, (bottom + top) / 2, sideZ], [0.085, top - bottom, 0.1],
          "#292e31",
          { rotation, bearsLoad: false, volume: 0.022,
            sideAttachmentReach: 0.7 });
      }
      const [topX, topZ] = point(frame, foldT, 0);
      primitive(target, id(`gangway:${end > 0 ? "b" : "a"}:${fold}:top`),
        "plastic", "panel",
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
    primitive(target, id(`gangway-roof-cover:${end > 0 ? "b" : "a"}`),
      "steel", "panel", [bx, ROOF + 0.055, bz],
      [0.46, 0.09, CAR_WIDTH - 0.48], ROOF_DARK,
      { rotation, bearsLoad: false, volume: 0.04,
        sideAttachmentReach: 0.8, textureProfile: "matte-aluminium" });
    for (const side of [-1, 1] as const) {
      const [coverX, coverZ] = point(frame, t, side * (CAR_WIDTH / 2 - 0.1));
      primitive(target, id(`gangway-side-cover:${end > 0 ? "b" : "a"}:${side > 0 ? "r" : "l"}`),
        "plastic", "panel", [coverX, CAR_FLOOR + 0.38, coverZ],
        [0.4, 0.62, 0.08], SKIRT,
        { rotation, bearsLoad: false, volume: 0.025, sideAttachmentReach: 0.6 });
    }
  }

  createInterior(
    target,
    id,
    frame,
    "cabin",
    centreT,
    straightStart + 0.35,
    straightEnd - 0.35,
  );
  if (isHead) {
    // Световая линия начинается за кабиной. Прежняя полноразмерная панель
    // проходила сквозь выгнутое лобовое стекло и читалась белыми полками.
    const lightFrom = straightStart + 0.45;
    const lightTo = straightEnd - 0.45;
    const lightT = (lightFrom + lightTo) / 2;
    const [lx, lz] = point(frame, lightT, 0);
    primitive(target, id("cabin-light"), "plastic", "panel",
      [lx, ROOF - 0.12, lz], [lightTo - lightFrom, 0.08, 0.9], WHITE,
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
  astanaTrainSpotLights.length = 0;
  const frame = trainFrameAt(trainStopDistance());
  for (let index = 0; index < TRAIN_SECTIONS; index += 1) {
    createSection(
      sections[index],
      frame,
      index,
      `lrv-001:${index}`,
      astanaTrainSpotLights,
    );
  }
}
