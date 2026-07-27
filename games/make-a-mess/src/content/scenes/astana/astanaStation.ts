// SPDX-License-Identifier: CC-BY-NC-ND-4.0
// SPDX-FileCopyrightText: 2026 Igor Kirisiuk
//
// Типовая станция кольца. В жизни станции отличаются друг от друга — здесь
// они собраны по одному чертежу, и разница только в надписях и в том, куда
// ведёт причал. Платформа ОДНА и всегда на внутренней стороне кольца: путь
// один, движение одностороннее, двери и платформенные стенки работают только
// со стороны центра острова.
//
// Референс просмотрен: вход «Әуежай» со скошенным стеклянным фасадом и
// козырьком, вестибюль с кассовой линией и турникетами, реечный потолок с
// бирюзовыми вставками, платформа с раздвижными стенками и орнаментом по
// низу стекла, подвесное табло с часами.

import type { MutableGroup } from "./astanaAuthoring.ts";
import { primitive } from "./astanaAuthoring.ts";
import { groundUnder } from "./astanaShell.ts";
import {
  RING_STRAIGHT_LENGTH,
  TRAIN_LENGTH,
  astanaStations,
  ringPathPoint,
  stationDistance,
  type AstanaStation,
} from "./astanaPlan.ts";
import { PLATFORM_Y } from "./astanaRing.ts";

export { PLATFORM_Y };
export const PLATFORM_LENGTH = TRAIN_LENGTH + 4;
const PLATFORM_WIDTH = 5.4;
/** Отступ кромки платформы от оси пути — габарит вагона плюс зазор. */
const PLATFORM_EDGE = 1.62;
const CANOPY_HEIGHT = 4.6;
/** Дверей у состава из трёх секций: по две на секцию. */
export const DOORWAYS = 6;

const CONCRETE = "#cfd2d6";
const CONCRETE_DEEP = "#b3b7bb";
const GRANITE = "#c6c3bd";
const GRANITE_DARK = "#8f8d88";
const TEAL = "#2f97a4";
const TEAL_DEEP = "#1f7a86";
const GLASS = "#8fb6bd";
const STEEL = "#b9bcbe";
const IRON = "#4f5457";
const WHITE_PANEL = "#f1f3f4";
const SIGN_BLUE = "#1f5fbf";

interface StationFrame {
  readonly station: AstanaStation;
  /** Единичный вектор вдоль платформы. */
  readonly along: readonly [number, number];
  /** Единичный вектор к центру острова. */
  readonly inward: readonly [number, number];
  readonly yaw: number;
  readonly centre: readonly [number, number];
}

function frameOf(station: AstanaStation): StationFrame {
  const distance = stationDistance(station.compass);
  const centre = ringPathPoint(distance);
  const ahead = ringPathPoint(distance + 1);
  const behind = ringPathPoint(distance - 1);
  const dx = ahead[0] - behind[0];
  const dz = ahead[1] - behind[1];
  const length = Math.hypot(dx, dz);
  const along = [dx / length, dz / length] as const;
  const radial = Math.hypot(centre[0], centre[1]);
  const inward = [-centre[0] / radial, -centre[1] / radial] as const;
  return { station, along, inward, yaw: Math.atan2(-along[1], along[0]), centre };
}

/** Точка станции: t вдоль платформы, w внутрь от оси пути. */
function point(
  frame: StationFrame,
  t: number,
  w: number,
): readonly [number, number] {
  return [
    frame.centre[0] + frame.along[0] * t + frame.inward[0] * w,
    frame.centre[1] + frame.along[1] * t + frame.inward[1] * w,
  ];
}

function createPlatform(deck: MutableGroup, frame: StationFrame, id: (s: string) => string): void {
  const rotation: readonly [number, number, number] = [0, frame.yaw, 0];
  const axis = PLATFORM_EDGE + PLATFORM_WIDTH / 2;
  const [cx, cz] = point(frame, 0, axis);

  // Платформа стоит на собственных колоннах — по паре под каждой секцией
  // плиты. Схема «плита на двух продольных балках» не прошла: секция висела
  // центром между балками, и решатель отвергал пару по центру масс.
  // Портальные рамы при этом остаются несущими для пути: станция и эстакада
  // по-прежнему одна конструкция, просто нагрузки разведены честно.
  const bays = 5;
  const bayLength = PLATFORM_LENGTH / bays;
  for (let bay = 0; bay < bays; bay += 1) {
    const centre = -PLATFORM_LENGTH / 2 + bayLength * (bay + 0.5);
    for (const lane of [PLATFORM_EDGE + 1.1, PLATFORM_EDGE + PLATFORM_WIDTH - 1.1]) {
      const [px, pz] = point(frame, centre, lane);
      const base = groundUnder(px, pz).top;
      const height = PLATFORM_Y - 0.36 - base;
      primitive(deck, id(`column:${bay}:${lane > PLATFORM_EDGE + 2.7 ? "in" : "out"}`),
        "concrete", "stoneBlock",
        [px, base + height / 2, pz], [0.9, height, 0.9], CONCRETE_DEEP,
        { rotation, bearingArea: 10, volume: height * 0.3 });
    }
    // Ригель под секцией: на нём лежит плита, он же связывает пару колонн.
    const [rx, rz] = point(frame, centre, axis);
    primitive(deck, id(`bent:${bay}`), "concrete", "panel",
      [rx, PLATFORM_Y - 0.51, rz], [1.1, 0.3, PLATFORM_WIDTH - 0.4], CONCRETE_DEEP,
      { rotation, bearingArea: 8, volume: 1.2, carriesAttachments: true,
        attachmentSupportMode: "wall", sideAttachmentReach: 1.2 });
  }

  // Плита платформы, пол и тактильная полоса — СЕКЦИЯМИ по десять метров:
  // цельная плита принимает лишь часть навесок, и отделка на её концах
  // повисает. Тот же урок, что с парапетом эстакады.
  for (let bay = 0; bay < bays; bay += 1) {
    const centre = -PLATFORM_LENGTH / 2 + bayLength * (bay + 0.5);
    const [sx, sz] = point(frame, centre, axis);
    primitive(deck, id(`slab:${bay}`), "concrete", "groundTile",
      [sx, PLATFORM_Y - 0.21, sz], [bayLength + 0.04, 0.3, PLATFORM_WIDTH], CONCRETE,
      { rotation, carriesAttachments: true, attachmentSupportMode: "wall",
        bearingArea: 12, volume: bayLength * 0.12 });

    const tiles = 4;
    for (let tile = 0; tile < tiles; tile += 1) {
      const t = centre - bayLength / 2 + (bayLength * (tile + 0.5)) / tiles;
      const [tx, tz] = point(frame, t, axis);
      primitive(deck, id(`floor:${bay}:${tile}`), "stone", "groundTile",
        [tx, PLATFORM_Y - 0.03, tz],
        [bayLength / tiles - 0.04, 0.06, PLATFORM_WIDTH - 0.24],
        (bay + tile) % 2 === 0 ? GRANITE : "#c1beb8",
        { rotation, volume: 0.08, bearingArea: 6, contactBearingOrder: true,
          carriesAttachments: true, attachmentSupportMode: "wall",
          sideAttachmentReach: 1.4 });
    }

    // Тактильная полоса и жёлтая линия у кромки — в той же секции.
    for (let strip = 0; strip < 6; strip += 1) {
      const t = centre - bayLength / 2 + (bayLength * (strip + 0.5)) / 6;
      const [wx, wz] = point(frame, t, PLATFORM_EDGE + 0.42);
      primitive(deck, id(`tactile:${bay}:${strip}`), "stone", "groundTile",
        [wx, PLATFORM_Y + 0.025, wz],
        [bayLength / 6 - 0.04, 0.05, 0.5], GRANITE_DARK,
        { rotation, bearsLoad: false, volume: 0.05, contactBearingOrder: true,
          sideAttachmentReach: 1.2 });
    }
    const [ex, ez] = point(frame, centre, PLATFORM_EDGE + 0.1);
    primitive(deck, id(`edge-line:${bay}`), "concrete", "groundTile",
      [ex, PLATFORM_Y + 0.025, ez], [bayLength, 0.05, 0.16], "#d8ab2c",
      { rotation, bearsLoad: false, volume: 0.05, sideAttachmentReach: 1.2 });
  }
  void cx;
  void cz;
}

/**
 * Платформенные двери: сплошная стеклянная стенка по кромке с шестью
 * проёмами в створ вагонных. Над проёмом — подсвеченная лента с названием
 * следующей станции, по низу стекла — орнаментальный пояс.
 */
function createScreenDoors(
  screens: MutableGroup,
  frame: StationFrame,
  id: (s: string) => string,
): void {
  const rotation: readonly [number, number, number] = [0, frame.yaw, 0];
  const doorPitch = TRAIN_LENGTH / DOORWAYS;
  const doorWidth = 1.9;
  const line = PLATFORM_EDGE + 0.16;
  const BELT_Y = PLATFORM_Y + 2.78;

  // Каркас стенки — это СТОЙКИ. Стекло, створки и ленты на них навешены и
  // сами ничего не несут; стойка стоит пяткой на полу платформы и доходит до
  // верхнего пояса. Пока стойки были декоративными, пояс и ленты над
  // проёмами держаться было не за что.
  const posts = DOORWAYS + 1;
  for (let post = 0; post < posts; post += 1) {
    const t = -TRAIN_LENGTH / 2 + doorPitch * post;
    const [sx, sz] = point(frame, t, line);
    const height = BELT_Y - 0.09 - PLATFORM_Y;
    primitive(screens, id(`psd:mullion:${post}`), "steel", "panel",
      [sx, PLATFORM_Y + height / 2, sz], [0.16, height, 0.24], STEEL,
      { rotation, bearingArea: 1.2, volume: 0.16, carriesAttachments: true,
        attachmentSupportMode: "wall", sideAttachmentReach: 0.5 });
  }

  for (let door = 0; door < DOORWAYS; door += 1) {
    const centreT = -TRAIN_LENGTH / 2 + doorPitch * (door + 0.5);
    // Глухая секция между проёмами.
    const wallLength = (doorPitch - doorWidth) / 2;
    for (const side of [-1, 1] as const) {
      const t = centreT + side * (doorWidth / 2 + wallLength / 2);
      const [px, pz] = point(frame, t, line);
      primitive(screens, id(`psd:wall:${door}:${side > 0 ? "b" : "a"}`), "glass", "glassPane",
        [px, PLATFORM_Y + 1.15, pz], [wallLength, 2.3, 0.12], GLASS,
        { rotation, bearsLoad: false, volume: 0.3, sideAttachmentReach: 1.6 });
      // Орнаментальный пояс по низу стекла.
      primitive(screens, id(`psd:frieze:${door}:${side > 0 ? "b" : "a"}`), "plastic", "panel",
        [px, PLATFORM_Y + 0.34, pz], [wallLength, 0.62, 0.14], TEAL,
        { rotation, bearsLoad: false, volume: 0.08, sideAttachmentReach: 1.6 });
    }

    // Створки проёма: две половинки, разъезжающиеся в стороны.
    for (const leaf of [-1, 1] as const) {
      const [lx, lz] = point(frame, centreT + leaf * doorWidth / 4, line);
      primitive(screens, id(`psd:leaf:${door}:${leaf > 0 ? "r" : "l"}`), "glass", "glassPane",
        [lx, PLATFORM_Y + 1.15, lz], [doorWidth / 2 - 0.04, 2.3, 0.1], GLASS,
        { rotation, bearsLoad: false, volume: 0.2, sideAttachmentReach: 2.6 });
    }

    // Перемычка над проёмом и подсвеченная лента с названием следующей
    // станции: обе держатся за соседние стойки, а не за воздух.
    const [hx, hz] = point(frame, centreT, line);
    primitive(screens, id(`psd:header:${door}`), "plastic", "panel",
      [hx, PLATFORM_Y + 2.52, hz], [doorPitch - 0.1, 0.42, 0.22], WHITE_PANEL,
      { rotation, bearsLoad: false, volume: 0.1, sideAttachmentReach: 0.6,
        carriesAttachments: true, attachmentSupportMode: "cable" });
    primitive(screens, id(`psd:sign:${door}`), "plastic", "panel",
      [hx, PLATFORM_Y + 2.52, hz], [doorPitch - 0.9, 0.24, 0.26], SIGN_BLUE,
      { rotation, bearsLoad: false, volume: 0.04, sideAttachmentReach: 0.4 });
  }

  // Верхний пояс стенки по всей длине — он лежит на стойках и тянется за
  // крайние проёмы коротким свесом.
  const [tx, tz] = point(frame, 0, line);
  primitive(screens, id("psd:top"), "steel", "panel",
    [tx, BELT_Y, tz], [TRAIN_LENGTH + 1.4, 0.18, 0.3], STEEL,
    { rotation, volume: 0.6, bearingArea: 4, sideAttachmentReach: 1.2,
      carriesAttachments: true, attachmentSupportMode: "cable" });
}

/** Навес над платформой: реечный потолок с бирюзовыми вставками на колоннах. */
function createCanopy(
  canopy: MutableGroup,
  frame: StationFrame,
  id: (s: string) => string,
): void {
  const rotation: readonly [number, number, number] = [0, frame.yaw, 0];
  const axis = PLATFORM_EDGE + PLATFORM_WIDTH / 2;
  // Навес несёт ОДИН ряд колонн по оси платформы, и кровля разбита на секции
  // по колоннам: каждая секция сидит на своей. Ряд у задней кромки означал бы
  // семиметровый вылет в одну сторону — такой навес не стоит ни в жизни, ни
  // в расчёте. Заодно колонна опирается на плиту, а не на гранитную плитку в
  // шесть сантиметров: нагрузка идёт по конструкции, а не по отделке.
  const bays = 6;
  const bayLength = PLATFORM_LENGTH / bays;
  const roofBottom = PLATFORM_Y + CANOPY_HEIGHT;
  const columnBase = PLATFORM_Y - 0.06;
  for (let bay = 0; bay < bays; bay += 1) {
    const t = -PLATFORM_LENGTH / 2 + bayLength * (bay + 0.5);
    const [px, pz] = point(frame, t, axis);
    primitive(canopy, id(`column:${bay}`), "steel", "cylinder",
      [px, columnBase + (roofBottom - columnBase) / 2, pz],
      [0.42, roofBottom - columnBase, 0.42], STEEL,
      { rotation, bearingArea: 4, volume: 0.6, carriesAttachments: true,
        attachmentSupportMode: "wall", sideAttachmentReach: 0.6 });
    // Капитель: колонна раскрывается под кровлю, чтобы секция садилась на
    // пятно, а не на торец трубы.
    primitive(canopy, id(`capital:${bay}`), "steel", "panel",
      [px, roofBottom - 0.16, pz], [1.6, 0.32, 1.6], STEEL,
      { rotation, bearingArea: 2.4, volume: 0.5, carriesAttachments: true,
        attachmentSupportMode: "wall", sideAttachmentReach: 0.6 });

    primitive(canopy, id(`roof:${bay}`), "concrete", "panel",
      [px, roofBottom + 0.18, pz],
      [bayLength + 0.04, 0.36, PLATFORM_WIDTH + 1.8], CONCRETE,
      { rotation, volume: bayLength * 0.1, bearingArea: 10,
        carriesAttachments: true, attachmentSupportMode: "wall",
        sideAttachmentReach: 1.6 });

    // Реечный потолок: ламели заведены в подшивку кровли и свисают из неё
    // на десять сантиметров — снизу читается именно рейка с бирюзовой
    // вставкой, а держатся они за кровлю, а не за воздух.
    const slats = Math.round(bayLength / 0.55);
    for (let slat = 0; slat < slats; slat += 1) {
      const t2 = t - bayLength / 2 + (bayLength * (slat + 0.5)) / slats;
      const [sx, sz] = point(frame, t2, axis);
      primitive(canopy, id(`slat:${bay}:${slat}`), "plastic", "panel",
        [sx, roofBottom - 0.02, sz],
        [0.3, 0.16, PLATFORM_WIDTH + 1.4],
        (bay * slats + slat) % 5 === 2 ? TEAL : WHITE_PANEL,
        { rotation, bearsLoad: false, volume: 0.06, sideAttachmentReach: 0.4 });
    }

    // Светильник в подшивке — по одному на секцию.
    const [lx, lz] = point(frame, t, axis);
    primitive(canopy, id(`lamp:${bay}`), "steel", "panel",
      [lx, roofBottom - 0.04, lz], [1.4, 0.14, 0.3], WHITE_PANEL,
      {
        rotation, bearsLoad: false, volume: 0.03, sideAttachmentReach: 0.4,
        light: { color: "#eef4ff", distance: 12, intensity: 0.7, position: [0, -0.3, 0] },
      });
  }
}

/** Обстановка платформы: табло, схема линии, лавки, урны, указатели. */
function createPlatformFittings(
  fittings: MutableGroup,
  frame: StationFrame,
  id: (s: string) => string,
): void {
  const rotation: readonly [number, number, number] = [0, frame.yaw, 0];
  const axis = PLATFORM_EDGE + PLATFORM_WIDTH / 2;

  // Подвесное табло с часами — по одному на каждую треть платформы.
  for (let board = 0; board < 2; board += 1) {
    const t = -PLATFORM_LENGTH / 4 + (PLATFORM_LENGTH / 2) * board;
    const [bx, bz] = point(frame, t, axis - 0.6);
    primitive(fittings, id(`board-arm:${board}`), "steel", "cylinder",
      [bx, PLATFORM_Y + CANOPY_HEIGHT - 0.55, bz], [0.08, 0.9, 0.08], IRON,
      { rotation, bearsLoad: false, volume: 0.02, sideAttachmentReach: 0.5 });
    primitive(fittings, id(`board:${board}`), "steel", "panel",
      [bx, PLATFORM_Y + CANOPY_HEIGHT - 1.25, bz], [1.6, 0.9, 0.12], "#22262a",
      { rotation, bearsLoad: false, volume: 0.06, sideAttachmentReach: 0.6 });
    primitive(fittings, id(`board-face:${board}`), "plastic", "panel",
      [bx, PLATFORM_Y + CANOPY_HEIGHT - 1.25, bz], [1.44, 0.76, 0.16], SIGN_BLUE,
      { rotation, bearsLoad: false, volume: 0.02, sideAttachmentReach: 0.5 });
  }

  // Лайтбокс со схемой линии у лестницы.
  const [mx, mz] = point(frame, -PLATFORM_LENGTH / 2 + 4, PLATFORM_EDGE + PLATFORM_WIDTH - 0.9);
  primitive(fittings, id("map-case"), "steel", "panel",
    [mx, PLATFORM_Y + 1.15, mz], [0.14, 2.1, 1.3], STEEL,
    { rotation, bearingArea: 0.6, volume: 0.2, carriesAttachments: true,
      attachmentSupportMode: "cable", sideAttachmentReach: 0.4 });
  primitive(fittings, id("map-face"), "plastic", "panel",
    [mx, PLATFORM_Y + 1.3, mz], [0.06, 1.5, 1.1], WHITE_PANEL,
    { rotation, bearsLoad: false, volume: 0.02, sideAttachmentReach: 0.3 });

  // Лавки и урны вдоль глухой стороны.
  for (let bench = 0; bench < 3; bench += 1) {
    const t = -PLATFORM_LENGTH / 3 + (PLATFORM_LENGTH / 3) * bench;
    const [sx, sz] = point(frame, t, PLATFORM_EDGE + PLATFORM_WIDTH - 0.8);
    primitive(fittings, id(`bench:${bench}`), "wood", "plank",
      [sx, PLATFORM_Y + 0.44, sz], [1.8, 0.1, 0.44], "#a87d4e",
      { rotation, bearingArea: 0.5, volume: 0.12 });
    for (const side of [-1, 1] as const) {
      const [lx, lz] = point(frame, t + side * 0.7, PLATFORM_EDGE + PLATFORM_WIDTH - 0.8);
      primitive(fittings, id(`bench-leg:${bench}:${side > 0 ? "r" : "l"}`), "steel", "panel",
        [lx, PLATFORM_Y + 0.2, lz], [0.1, 0.42, 0.4], IRON,
        { rotation, bearingArea: 0.3, volume: 0.02 });
    }
    const [bx, bz] = point(frame, t + 1.5, PLATFORM_EDGE + PLATFORM_WIDTH - 0.8);
    primitive(fittings, id(`bin:${bench}`), "steel", "cylinder",
      [bx, PLATFORM_Y + 0.36, bz], [0.42, 0.72, 0.42], "#9ba0a2",
      { rotation, bearingArea: 0.3, volume: 0.08 });
  }
}

// Вертикаль станции. Платформа поднята на двенадцать метров, и прямой марш
// до неё потребовал бы двадцати метров разбега — прежняя лестница уходила за
// кромку платформы прямо над путём. Поэтому подъём разбит промежуточным
// уровнем, как на настоящих эстакадных станциях: земля → мезонин на шести
// метрах → платформа. На каждом плече своя лестница и свой эскалатор, лифт
// идёт насквозь. Всё это стоит вдоль платформы, а не поперёк, — только так
// маршевые длины укладываются в пятно станции.
const MEZZANINE_RISE = 6;
/** Полоса лестницы по ширине (отсчёт от оси пути). */
const STAIR_LANE = 12.3;
const STAIR_WIDTH = 2.6;
const ESCALATOR_LOWER_LANE = 15.2;
const ESCALATOR_UPPER_LANE = 18;
const ESCALATOR_WIDTH = 1.9;
const DECK_INNER = 7;
const DECK_OUTER = 19.4;
const LIFT_LANE = 9;

/**
 * Марш: каскад ступеней. Каждая ступень глубже проступи вдвое и заходит под
 * предыдущую — так у неё есть настоящая опорная площадка, а не касание
 * торцами, которое решатель (справедливо) не считает опиранием.
 */
function createStairFlight(
  target: MutableGroup,
  frame: StationFrame,
  id: (s: string) => string,
  name: string,
  options: {
    readonly fromT: number;
    readonly fromY: number;
    readonly toY: number;
    readonly lane: number;
    readonly direction: 1 | -1;
  },
): { readonly topT: number } {
  const rotation: readonly [number, number, number] = [0, frame.yaw, 0];
  const rise = options.toY - options.fromY;
  // Последняя ступень — сама площадка, поэтому подступенков на один меньше.
  const steps = Math.max(2, Math.round(rise / 0.176) - 1);
  const riser = rise / (steps + 1);
  const tread = 0.29;
  const { direction, lane } = options;

  for (let step = 0; step < steps; step += 1) {
    const nose = options.fromT + direction * tread * step;
    const [sx, sz] = point(frame, nose + direction * tread * 0.5, lane);
    primitive(target, id(`${name}:step:${step}`), "concrete", "stoneBlock",
      [sx, options.fromY + riser * (step + 0.5), sz],
      [tread * 2, riser, STAIR_WIDTH], step % 2 === 0 ? CONCRETE : "#c9ccd0",
      { rotation, bearingArea: 2.2, volume: 0.34, carriesAttachments: true,
        attachmentSupportMode: "cable", sideAttachmentReach: 0.6 });
  }

  // Балюстрады: сплошные панели по обе стороны марша, наклон — третьим
  // эйлером, он крутит локальный x к локальному y ДО рыскания.
  const runLength = tread * steps;
  const slope = Math.atan2(rise - riser, runLength) * direction;
  const panelLength = Math.hypot(runLength, rise - riser);
  const midT = options.fromT + direction * runLength / 2;
  const midY = options.fromY + rise / 2;
  for (const side of [-1, 1] as const) {
    const laneSide = lane + side * (STAIR_WIDTH / 2 + 0.09);
    const [bx, bz] = point(frame, midT, laneSide);
    primitive(target, id(`${name}:balustrade:${side > 0 ? "o" : "i"}`),
      "glass", "glassPane",
      [bx, midY + 0.52, bz], [panelLength, 1.02, 0.1], GLASS,
      { rotation: [0, frame.yaw, slope], volume: 1.1, bearingArea: 1.2,
        carriesAttachments: true, attachmentSupportMode: "cable",
        sideAttachmentReach: 0.7 });
    primitive(target, id(`${name}:handrail:${side > 0 ? "o" : "i"}`),
      "steel", "cylinder",
      [bx, midY + 0.99, bz], [0.1, panelLength, 0.1], IRON,
      { rotation: [0, frame.yaw, slope - Math.PI / 2], bearsLoad: false,
        volume: 0.12, sideAttachmentReach: 0.4 });
  }

  return { topT: options.fromT + direction * runLength };
}

/**
 * Эскалатор: тот же каскад, но шаг мельче и наклон ровно тридцать градусов —
 * лента из плоских ступеней, стеклянная балюстрада и поручень поверх неё.
 */
function createEscalator(
  target: MutableGroup,
  frame: StationFrame,
  id: (s: string) => string,
  name: string,
  options: {
    readonly fromT: number;
    readonly fromY: number;
    readonly toY: number;
    readonly lane: number;
    readonly direction: 1 | -1;
  },
): { readonly topT: number; readonly runLength: number } {
  const rotation: readonly [number, number, number] = [0, frame.yaw, 0];
  const rise = options.toY - options.fromY;
  const riser = 0.21;
  const steps = Math.max(2, Math.round(rise / riser) - 1);
  // Тридцать градусов — стандарт наклона эскалатора.
  const tread = riser * Math.sqrt(3);
  const { direction, lane } = options;

  for (let step = 0; step < steps; step += 1) {
    const nose = options.fromT + direction * tread * step;
    const [sx, sz] = point(frame, nose + direction * tread * 0.5, lane);
    primitive(target, id(`${name}:step:${step}`), "steel", "panel",
      [sx, options.fromY + riser * (step + 0.5), sz],
      [tread * 2, riser, ESCALATOR_WIDTH], step % 3 === 0 ? "#9aa0a4" : "#8b9195",
      { rotation, bearingArea: 1.6, volume: 0.14, carriesAttachments: true,
        attachmentSupportMode: "cable", sideAttachmentReach: 0.6 });
  }

  const runLength = tread * steps;
  const slope = Math.atan2(rise - riser, runLength) * direction;
  const panelLength = Math.hypot(runLength, rise - riser);
  const midT = options.fromT + direction * runLength / 2;
  const midY = options.fromY + rise / 2;
  for (const side of [-1, 1] as const) {
    const laneSide = lane + side * (ESCALATOR_WIDTH / 2 + 0.12);
    const [bx, bz] = point(frame, midT, laneSide);
    primitive(target, id(`${name}:balustrade:${side > 0 ? "o" : "i"}`),
      "glass", "glassPane",
      [bx, midY + 0.55, bz], [panelLength, 1.06, 0.12], GLASS,
      { rotation: [0, frame.yaw, slope], volume: 1.1, bearingArea: 1.2,
        carriesAttachments: true, attachmentSupportMode: "cable",
        sideAttachmentReach: 0.7 });
    primitive(target, id(`${name}:handrail:${side > 0 ? "o" : "i"}`),
      "plastic", "cylinder",
      [bx, midY + 1.02, bz], [0.14, panelLength, 0.14], "#31363a",
      { rotation: [0, frame.yaw, slope - Math.PI / 2], bearsLoad: false,
        volume: 0.12, sideAttachmentReach: 0.4 });
    // Фартук ленты снизу — иначе под эскалатором просвечивает пустота.
    primitive(target, id(`${name}:skirt:${side > 0 ? "o" : "i"}`),
      "steel", "panel",
      [bx, midY - 0.42, bz], [panelLength, 0.9, 0.1], "#7d8286",
      { rotation: [0, frame.yaw, slope], bearsLoad: false, volume: 0.5,
        sideAttachmentReach: 0.7 });
  }

  return { topT: options.fromT + direction * runLength, runLength };
}

/** Палуба на колоннах: мезонин и верхняя галерея собраны по одному правилу. */
function createDeck(
  target: MutableGroup,
  frame: StationFrame,
  id: (s: string) => string,
  name: string,
  options: {
    readonly centreT: number;
    readonly lengthT: number;
    readonly innerW: number;
    readonly outerW: number;
    readonly top: number;
    readonly ground: number;
  },
): void {
  const rotation: readonly [number, number, number] = [0, frame.yaw, 0];
  const sections = 3;
  const width = (options.outerW - options.innerW) / sections;
  for (let section = 0; section < sections; section += 1) {
    const w = options.innerW + width * (section + 0.5);
    const [dx, dz] = point(frame, options.centreT, w);
    primitive(target, id(`${name}:slab:${section}`), "concrete", "groundTile",
      [dx, options.top - 0.22, dz], [options.lengthT, 0.44, width + 0.02],
      CONCRETE,
      { rotation, bearingArea: 14, volume: options.lengthT * width * 0.16,
        carriesAttachments: true, attachmentSupportMode: "wall",
        sideAttachmentReach: 1.2 });
    // Колонны — по паре под каждой секцией, у её торцов.
    for (const end of [-1, 1] as const) {
      const t = options.centreT + end * (options.lengthT / 2 - 0.85);
      const [cx, cz] = point(frame, t, w);
      const base = groundUnder(cx, cz).top;
      const height = options.top - 0.44 - base;
      primitive(target, id(`${name}:column:${section}:${end > 0 ? "b" : "a"}`),
        "concrete", "stoneBlock",
        [cx, base + height / 2, cz], [0.62, height, 0.62], CONCRETE_DEEP,
        { rotation, bearingArea: 8, volume: height * 0.28 });
    }
  }
  // Ограждение по внешнему краю палубы.
  const [rx, rz] = point(frame, options.centreT, options.outerW - 0.06);
  primitive(target, id(`${name}:parapet`), "glass", "glassPane",
    [rx, options.top + 0.56, rz], [options.lengthT, 1.12, 0.1], GLASS,
    { rotation, bearsLoad: false, volume: 0.9, sideAttachmentReach: 1.2 });
  // Поручень — цилиндр, а у цилиндра размер [диаметр, ДЛИНА, диаметр]:
  // горизонтальный получается разворотом на четверть вокруг хода.
  primitive(target, id(`${name}:parapet-rail`), "steel", "cylinder",
    [rx, options.top + 1.14, rz], [0.09, options.lengthT, 0.09], IRON,
    { rotation: [0, frame.yaw, Math.PI / 2], bearsLoad: false, volume: 0.1,
      sideAttachmentReach: 0.4 });
}

/**
 * Вестибюль на земле и три вертикали до платформы: лестница, эскалатор и
 * лифт. Станция высокая, и маршрут «улица → платформа» обязан быть доступен
 * всеми тремя способами.
 */
function createConcourse(
  concourse: MutableGroup,
  frame: StationFrame,
  id: (s: string) => string,
): void {
  const rotation: readonly [number, number, number] = [0, frame.yaw, 0];
  const [hx, hz] = point(frame, 0, (DECK_INNER + DECK_OUTER) / 2);
  const ground = groundUnder(hx, hz).top;
  const mezzanine = ground + MEZZANINE_RISE;

  // Мезонин — разворотная площадка на полпути, галерея — верхняя площадка
  // вровень с платформой, из неё пассажир выходит прямо на посадку.
  createDeck(concourse, frame, id, "mezzanine", {
    centreT: -15.8, lengthT: 5.2, innerW: DECK_INNER, outerW: DECK_OUTER,
    top: mezzanine, ground,
  });
  createDeck(concourse, frame, id, "gallery", {
    centreT: -7.9, lengthT: 3.4, innerW: DECK_INNER, outerW: DECK_OUTER,
    top: PLATFORM_Y, ground,
  });

  // Нижнее плечо: от вестибюля к мезонину, вверх по убыванию t.
  createStairFlight(concourse, frame, id, "stair-lower", {
    fromT: -3.6, fromY: ground, toY: mezzanine, lane: STAIR_LANE, direction: -1,
  });
  createEscalator(concourse, frame, id, "escalator-lower", {
    fromT: -3.6, fromY: ground, toY: mezzanine,
    lane: ESCALATOR_LOWER_LANE, direction: -1,
  });
  // Верхнее плечо: от мезонина к галерее, назад по возрастанию t.
  createStairFlight(concourse, frame, id, "stair-upper", {
    fromT: -17.6, fromY: mezzanine, toY: PLATFORM_Y,
    lane: STAIR_LANE, direction: 1,
  });
  createEscalator(concourse, frame, id, "escalator-upper", {
    fromT: -17.6, fromY: mezzanine, toY: PLATFORM_Y,
    lane: ESCALATOR_UPPER_LANE, direction: 1,
  });

  // Лифт: остеклённая шахта насквозь, от земли до галереи.
  const rise = PLATFORM_Y - ground;
  const [vx, vz] = point(frame, -7.9, LIFT_LANE);
  for (const corner of [-1, 1] as const) {
    for (const side of [-1, 1] as const) {
      const [px, pz] = point(frame, -7.9 + corner * 1.3, LIFT_LANE + side * 1.1);
      const base = groundUnder(px, pz).top;
      primitive(concourse, id(`lift-post:${corner > 0 ? "b" : "a"}:${side > 0 ? "o" : "i"}`),
        "steel", "panel",
        [px, base + (PLATFORM_Y + 1.4 - base) / 2, pz],
        [0.24, PLATFORM_Y + 1.4 - base, 0.24], STEEL,
        { rotation, bearingArea: 1.2, volume: 0.7, carriesAttachments: true,
          attachmentSupportMode: "wall", sideAttachmentReach: 1.4 });
    }
  }
  // Остекление шахты — панелями по этажу: цельное стекло в двенадцать метров
  // и в жизни не поставить, и стойке оно не по росту (крепление wall-режима
  // требует опору в полтора раза выше навески).
  const glassBands = 4;
  for (const side of [-1, 1] as const) {
    const [gx, gz] = point(frame, -7.9, LIFT_LANE + side * 1.1);
    for (let band = 0; band < glassBands; band += 1) {
      const height = (rise - 0.3) / glassBands;
      primitive(concourse,
        id(`lift-glass:${side > 0 ? "o" : "i"}:${band}`), "glass", "glassPane",
        [gx, ground + 0.15 + height * (band + 0.5), gz],
        [2.5, height - 0.06, 0.08], GLASS,
        { rotation, bearsLoad: false, volume: 0.3, sideAttachmentReach: 1.3 });
    }
  }
  primitive(concourse, id("lift-car"), "steel", "panel",
    [vx, ground + 1.2, vz], [2.1, 2.2, 1.9], WHITE_PANEL,
    { rotation, bearingArea: 1.4, volume: 1.6 });
  primitive(concourse, id("lift-head"), "steel", "panel",
    [vx, PLATFORM_Y + 1.5, vz], [2.9, 0.5, 2.6], STEEL,
    { rotation, bearsLoad: false, volume: 0.8, sideAttachmentReach: 1.4 });

  // Павильон входа на земле: пол, стеклянные грани, кровля, касса и турникеты.
  const hallCentreT = 0.6;
  const hallInner = STAIR_LANE - 1.6;
  const hallOuter = DECK_OUTER;
  const hallW = (hallInner + hallOuter) / 2;
  const hallHeight = 4.4;
  const [fx, fz] = point(frame, hallCentreT, hallW);
  primitive(concourse, id("hall-floor"), "concrete", "groundTile",
    [fx, ground + 0.1, fz], [9.6, 0.36, hallOuter - hallInner], CONCRETE,
    { rotation, carriesAttachments: true, attachmentSupportMode: "wall",
      bearingArea: 40, volume: 10 });
  for (const side of [-1, 1] as const) {
    const [wx, wz] = point(frame, hallCentreT + side * 4.7, hallW);
    primitive(concourse, id(`hall-end:${side > 0 ? "b" : "a"}`), "concrete", "panel",
      [wx, ground + hallHeight / 2, wz],
      [0.32, hallHeight, hallOuter - hallInner - 0.4], CONCRETE,
      { rotation, bearingArea: 6, volume: 5, carriesAttachments: true,
        attachmentSupportMode: "wall", sideAttachmentReach: 1.2 });
  }
  // Стеклянный фасад с импостами — лицо станции, оно смотрит от кольца.
  for (let bay = 0; bay < 6; bay += 1) {
    const t = hallCentreT - 3.9 + (7.8 * bay) / 5;
    const [gx, gz] = point(frame, t, hallOuter - 0.1);
    primitive(concourse, id(`hall-mullion:${bay}`), "steel", "panel",
      [gx, ground + hallHeight / 2, gz], [0.16, hallHeight, 0.22], STEEL,
      { rotation, bearingArea: 0.8, volume: 0.3, carriesAttachments: true,
        attachmentSupportMode: "wall", sideAttachmentReach: 1.1 });
    primitive(concourse, id(`hall-glass:${bay}`), "glass", "glassPane",
      [gx, ground + hallHeight / 2, gz], [1.5, hallHeight - 0.3, 0.1], GLASS,
      { rotation, bearsLoad: false, volume: 0.4, sideAttachmentReach: 1.1 });
  }
  primitive(concourse, id("hall-roof"), "concrete", "panel",
    [fx, ground + hallHeight + 0.22, fz],
    [10, 0.44, hallOuter - hallInner + 0.4], CONCRETE_DEEP,
    { rotation, volume: 11, bearingArea: 24, carriesAttachments: true,
      attachmentSupportMode: "wall", sideAttachmentReach: 1.4 });
  // Козырёк над входом.
  const [cx, cz] = point(frame, hallCentreT, hallOuter + 1.5);
  primitive(concourse, id("hall-canopy"), "glass", "glassPane",
    [cx, ground + hallHeight - 0.35, cz], [8.4, 0.14, 3], "#cfe2e6",
    { rotation, bearsLoad: false, volume: 0.6, sideAttachmentReach: 1.9 });

  // Кассовая линия и турникеты: вход снаружи, дальше по ходу — к маршам.
  for (let machine = 0; machine < 2; machine += 1) {
    const [mx, mz] = point(frame, hallCentreT + 2.6 + machine * 1.5, hallOuter - 1.4);
    primitive(concourse, id(`ticket:${machine}`), "steel", "panel",
      [mx, ground + 1.05, mz], [1.1, 1.6, 0.7], "#9ea3a6",
      { rotation, bearingArea: 0.8, volume: 0.6, carriesAttachments: true,
        attachmentSupportMode: "cable", sideAttachmentReach: 0.4 });
    primitive(concourse, id(`ticket-face:${machine}`), "plastic", "panel",
      [mx, ground + 1.25, mz], [0.9, 1, 0.76], SIGN_BLUE,
      { rotation, bearsLoad: false, volume: 0.1, sideAttachmentReach: 0.4 });
  }
  for (let gate = 0; gate < 3; gate += 1) {
    const [gx, gz] = point(frame, hallCentreT - 2.6, hallInner + 1.4 + gate * 1.4);
    primitive(concourse, id(`gate:${gate}`), "steel", "panel",
      [gx, ground + 0.7, gz], [1.5, 1.1, 0.5], STEEL,
      { rotation, bearingArea: 0.6, volume: 0.4, carriesAttachments: true,
        attachmentSupportMode: "cable", sideAttachmentReach: 0.4 });
    primitive(concourse, id(`gate-light:${gate}`), "plastic", "panel",
      [gx, ground + 1.19, gz], [1.2, 0.1, 0.4], "#37c15a",
      { rotation, bearsLoad: false, volume: 0.02, sideAttachmentReach: 0.4 });
  }
}

/** Наружная вывеска: казахское название крупно, русское под ним. */
function createSignage(
  signage: MutableGroup,
  frame: StationFrame,
  id: (s: string) => string,
): void {
  const rotation: readonly [number, number, number] = [0, frame.yaw, 0];
  const [ax, az] = point(frame, 0.6, DECK_OUTER - 0.2);
  const ground = groundUnder(ax, az).top;
  const [sx, sz] = point(frame, 0.6, DECK_OUTER + 0.05);
  primitive(signage, id("name-plate"), "plastic", "panel",
    [sx, ground + 3.6, sz], [7.4, 0.9, 0.16], WHITE_PANEL,
    { rotation, bearsLoad: false, volume: 0.3, sideAttachmentReach: 0.6 });
  primitive(signage, id("name-kazakh"), "plastic", "panel",
    [sx, ground + 3.82, sz], [6.4, 0.34, 0.22], TEAL_DEEP,
    { rotation, bearsLoad: false, volume: 0.06, sideAttachmentReach: 0.5 });
  primitive(signage, id("name-russian"), "plastic", "panel",
    [sx, ground + 3.4, sz], [5.2, 0.22, 0.22], "#5a6367",
    { rotation, bearsLoad: false, volume: 0.04, sideAttachmentReach: 0.5 });
}

export function createStations(
  deck: MutableGroup,
  screens: MutableGroup,
  canopy: MutableGroup,
  fittings: MutableGroup,
  concourse: MutableGroup,
): void {
  for (const station of astanaStations) {
    const frame = frameOf(station);
    const id = (suffix: string) => `${station.id}:${suffix}`;
    createPlatform(deck, frame, id);
    createScreenDoors(screens, frame, id);
    createCanopy(canopy, frame, id);
    createPlatformFittings(fittings, frame, id);
    createConcourse(concourse, frame, id);
    createSignage(fittings, frame, id);
    void RING_STRAIGHT_LENGTH;
  }
}
