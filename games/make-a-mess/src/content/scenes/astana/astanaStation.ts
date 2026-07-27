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
import { groundSeatBox, primitive } from "./astanaAuthoring.ts";
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

// Вертикаль станции: ЕДИНОЕ ЯДРО.
//
// Первая схема разносила подъём на мезонин и разворот, три вертикали стояли в
// разных полосах, а марши въезжали в сплошные плиты палуб. Аудит показал, что
// пройти по станции нельзя ни одним из трёх заявленных маршрутов. Настоящая
// станция линии двухэтажная и читается одной фразой: касса и турникеты внизу,
// платформа наверху, между ними ОДНА видимая группа подъёма.
//
// Отсюда правила, которые здесь держит геометрия:
//   - подъём один и непрерывный, вдоль платформы: 12 м подъёма требуют 21 м
//     разбега, и они укладываются в длину станции;
//   - марш кончается ТАМ, где начинается площадка. Плиту не надо дырявить,
//     если под неё не заезжать;
//   - где шахта всё же проходит сквозь палубу, палуба собирается из плит
//     ВОКРУГ шахты, а не кладётся сплошным прямоугольником;
//   - колонны выносятся за габарит коридоров, а не ставятся по сетке.
//
// Пассажирский маршрут: улица → дверь → кассы → турникеты поперёк потока →
// прямая видимость ядра → лестница или эскалатор (или лифт) → верхняя
// площадка встык с платформой.

/** Ось лестницы, отсчёт по ширине от оси пути внутрь кольца. */
export const STAIR_LANE = 9.6;
const STAIR_WIDTH = 2.8;
/** Ось эскалатора. */
export const ESCALATOR_LANE = 12.9;
const ESCALATOR_WIDTH = 1.9;
/** Ось лифтовой шахты. */
export const LIFT_LANE = 15.2;
const LIFT_HALF = 1.3;
/** Внутренняя кромка верхней площадки — она же задняя кромка платформы. */
const DECK_INNER = PLATFORM_EDGE + PLATFORM_WIDTH;
const DECK_OUTER = 16.8;
/** Где начинается подъём и где он выходит на площадку. */
export const CORE_START_T = 7;
export const DECK_TOP_T = -14;
/** Верхняя площадка: от кромки марша вдоль платформы. */
const DECK_FROM_T = -21;
/** Оплаченный коридор по земле вдоль ядра — к лифту и под площадку. */
const PAID_LANE_INNER = 14.2;
const PAID_LANE_OUTER = 16.2;
/** Вестибюль: за концом ядра, лицом к центру острова. */
const HALL_FROM_T = 7.6;
const HALL_TO_T = 20;
const HALL_INNER = 8;
const HALL_OUTER = 22;
/** Линия турникетов — поперёк потока, а не вдоль него. */
const FARE_LINE_W = 16;

/**
 * Марш: каскад ступеней. Каждая ступень глубже проступи вдвое и заходит под
 * предыдущую — так у неё есть настоящая опорная площадка, а не касание
 * торцами, которое решатель (справедливо) не считает опиранием.
 *
 * Марш задаётся ОТРЕЗКОМ пути, а не числом ступеней: подъём и разбег заданы
 * станцией, а проступь выводится из них. Так лестница и эскалатор кончаются
 * ровно в одной точке — на кромке верхней площадки, и заезжать под плиту
 * им нечем.
 */
function createStairFlight(
  target: MutableGroup,
  frame: StationFrame,
  id: (s: string) => string,
  name: string,
  options: {
    readonly fromT: number;
    readonly toT: number;
    readonly fromY: number;
    readonly toY: number;
    readonly lane: number;
  },
): void {
  const rotation: readonly [number, number, number] = [0, frame.yaw, 0];
  const rise = options.toY - options.fromY;
  const run = Math.abs(options.toT - options.fromT);
  const direction = Math.sign(options.toT - options.fromT) as 1 | -1;
  // Подступенков на один больше числа ступеней: последний — вход на площадку.
  const steps = Math.max(2, Math.round(rise / 0.177) - 1);
  const riser = rise / (steps + 1);
  const tread = run / steps;
  const { lane } = options;

  for (let step = 0; step < steps; step += 1) {
    const centre = options.fromT + direction * tread * step;
    const [sx, sz] = point(frame, centre, lane);
    primitive(target, id(`${name}:step:${step}`), "concrete", "stoneBlock",
      [sx, options.fromY + riser * (step + 0.5), sz],
      [tread * 2, riser, STAIR_WIDTH], step % 2 === 0 ? CONCRETE : "#c9ccd0",
      { rotation, bearingArea: 2.4, volume: 0.22, carriesAttachments: true,
        attachmentSupportMode: "cable", sideAttachmentReach: 0.6 });
  }

  createBalustrade(target, frame, id, name, {
    fromT: options.fromT,
    toT: options.toT,
    fromY: options.fromY + riser,
    toY: options.toY,
    lane,
    halfWidth: STAIR_WIDTH / 2 + 0.09,
    railMaterial: "steel",
    railColour: IRON,
  });
}

/**
 * Эскалатор: тот же каскад, но шаг мельче — лента плоских ступеней со
 * стеклянной балюстрадой, поручнем и фартуком.
 */
function createEscalator(
  target: MutableGroup,
  frame: StationFrame,
  id: (s: string) => string,
  name: string,
  options: {
    readonly fromT: number;
    readonly toT: number;
    readonly fromY: number;
    readonly toY: number;
    readonly lane: number;
  },
): void {
  const rotation: readonly [number, number, number] = [0, frame.yaw, 0];
  const rise = options.toY - options.fromY;
  const run = Math.abs(options.toT - options.fromT);
  const direction = Math.sign(options.toT - options.fromT) as 1 | -1;
  const steps = Math.max(2, Math.round(rise / 0.21) - 1);
  const riser = rise / (steps + 1);
  const tread = run / steps;
  const { lane } = options;

  for (let step = 0; step < steps; step += 1) {
    const centre = options.fromT + direction * tread * step;
    const [sx, sz] = point(frame, centre, lane);
    primitive(target, id(`${name}:step:${step}`), "steel", "panel",
      [sx, options.fromY + riser * (step + 0.5), sz],
      [tread * 2, riser, ESCALATOR_WIDTH],
      step % 3 === 0 ? "#9aa0a4" : "#8b9195",
      { rotation, bearingArea: 1.8, volume: 0.1, carriesAttachments: true,
        attachmentSupportMode: "cable", sideAttachmentReach: 0.6 });
  }

  createBalustrade(target, frame, id, name, {
    fromT: options.fromT,
    toT: options.toT,
    fromY: options.fromY + riser,
    toY: options.toY,
    lane,
    halfWidth: ESCALATOR_WIDTH / 2 + 0.12,
    railMaterial: "plastic",
    railColour: "#31363a",
    skirt: true,
  });
}

/**
 * Балюстрада наклонного марша. Наклон задаётся третьим эйлером: он крутит
 * локальный x к локальному y ДО рыскания, поэтому знак зависит только от
 * направления марша, а не от курса станции.
 */
function createBalustrade(
  target: MutableGroup,
  frame: StationFrame,
  id: (s: string) => string,
  name: string,
  options: {
    readonly fromT: number;
    readonly toT: number;
    readonly fromY: number;
    readonly toY: number;
    readonly lane: number;
    readonly halfWidth: number;
    readonly railMaterial: "steel" | "plastic";
    readonly railColour: string;
    readonly skirt?: boolean;
  },
): void {
  const run = options.toT - options.fromT;
  const rise = options.toY - options.fromY;
  const slope = Math.atan2(rise, Math.abs(run)) * Math.sign(run);
  const panelLength = Math.hypot(run, rise);
  const midT = (options.fromT + options.toT) / 2;
  const midY = (options.fromY + options.toY) / 2;
  const rotation: readonly [number, number, number] = [0, frame.yaw, slope];

  for (const side of [-1, 1] as const) {
    const lane = options.lane + side * options.halfWidth;
    const [bx, bz] = point(frame, midT, lane);
    const suffix = side > 0 ? "o" : "i";
    primitive(target, id(`${name}:balustrade:${suffix}`), "glass", "glassPane",
      [bx, midY + 0.55, bz], [panelLength, 1.06, 0.1], GLASS,
      { rotation, volume: 1, bearingArea: 1.2, carriesAttachments: true,
        attachmentSupportMode: "cable", sideAttachmentReach: 0.7 });
    primitive(target, id(`${name}:handrail:${suffix}`),
      options.railMaterial, "cylinder",
      [bx, midY + 1.02, bz], [0.12, panelLength, 0.12], options.railColour,
      { rotation: [0, frame.yaw, slope - Math.PI / 2], bearsLoad: false,
        volume: 0.12, sideAttachmentReach: 0.4 });
    if (options.skirt) {
      primitive(target, id(`${name}:skirt:${suffix}`), "steel", "panel",
        [bx, midY - 0.42, bz], [panelLength, 0.9, 0.1], "#7d8286",
        { rotation, bearsLoad: false, volume: 0.5, sideAttachmentReach: 0.7 });
    }
  }
}

interface DeckHole {
  readonly fromT: number;
  readonly toT: number;
  readonly fromW: number;
  readonly toW: number;
}

/**
 * Палуба на колоннах. Плиты кладутся ВОКРУГ шахт: прямоугольник режется по
 * кромкам вырезов, и каждая получившаяся плита садится на свою колонну.
 * Сплошной прямоугольник, сквозь который «как-нибудь» пройдёт лестница, —
 * это ровно то, из-за чего станция была непроходимой.
 */
function createDeck(
  target: MutableGroup,
  frame: StationFrame,
  id: (s: string) => string,
  name: string,
  options: {
    readonly fromT: number;
    readonly toT: number;
    readonly innerW: number;
    readonly outerW: number;
    readonly top: number;
    readonly holes?: readonly DeckHole[];
    readonly columns: readonly (readonly [number, number])[];
  },
): void {
  const rotation: readonly [number, number, number] = [0, frame.yaw, 0];
  const holes = options.holes ?? [];
  const edge = (from: number, to: number, cuts: readonly number[]): number[] => {
    const values = new Set([from, to]);
    for (const cut of cuts) {
      if (cut > from + 0.05 && cut < to - 0.05) {
        values.add(cut);
      }
    }
    return [...values].sort((left, right) => left - right);
  };
  const tEdges = edge(
    Math.min(options.fromT, options.toT),
    Math.max(options.fromT, options.toT),
    holes.flatMap((hole) => [hole.fromT, hole.toT]),
  );
  const wEdges = edge(
    options.innerW,
    options.outerW,
    holes.flatMap((hole) => [hole.fromW, hole.toW]),
  );

  let index = 0;
  for (let ti = 0; ti < tEdges.length - 1; ti += 1) {
    for (let wi = 0; wi < wEdges.length - 1; wi += 1) {
      const centreT = (tEdges[ti] + tEdges[ti + 1]) / 2;
      const centreW = (wEdges[wi] + wEdges[wi + 1]) / 2;
      const inHole = holes.some(
        (hole) =>
          centreT > hole.fromT && centreT < hole.toT &&
          centreW > hole.fromW && centreW < hole.toW,
      );
      if (inHole) {
        continue;
      }
      const [dx, dz] = point(frame, centreT, centreW);
      const lengthT = tEdges[ti + 1] - tEdges[ti];
      const widthW = wEdges[wi + 1] - wEdges[wi];
      primitive(target, id(`${name}:slab:${index}`), "concrete", "groundTile",
        [dx, options.top - 0.22, dz], [lengthT + 0.04, 0.44, widthW + 0.04],
        CONCRETE,
        { rotation, bearingArea: 16, volume: lengthT * widthW * 0.14,
          carriesAttachments: true, attachmentSupportMode: "wall",
          sideAttachmentReach: 1.2 });
      index += 1;
    }
  }

  for (const [columnIndex, [t, w]] of options.columns.entries()) {
    const [cx, cz] = point(frame, t, w);
    const base = groundUnder(cx, cz).top;
    const height = options.top - 0.44 - base;
    primitive(target, id(`${name}:column:${columnIndex}`), "concrete", "stoneBlock",
      [cx, base + height / 2, cz], [0.6, height, 0.6], CONCRETE_DEEP,
      { rotation, bearingArea: 8, volume: height * 0.26 });
  }
}

/**
 * Ограждение открытой кромки палубы между двумя точками станции. Кромка
 * бывает и вдоль платформы, и поперёк, поэтому задаётся отрезком, а не
 * «длиной и осью» — на такой записи предыдущая версия дала кусок нулевого
 * размера, и сцена не собралась.
 */
function createEdgeRail(
  target: MutableGroup,
  frame: StationFrame,
  id: (s: string) => string,
  name: string,
  from: readonly [number, number],
  to: readonly [number, number],
  top: number,
): void {
  const dt = to[0] - from[0];
  const dw = to[1] - from[1];
  const length = Math.hypot(dt, dw);
  const centreT = (from[0] + to[0]) / 2;
  const centreW = (from[1] + to[1]) / 2;
  // Локальный +x кромки смотрит вдоль отрезка: у станции оси t и w, поэтому
  // рыскание складывается из курса станции и наклона отрезка в её осях.
  const yaw = frame.yaw - Math.atan2(dw, dt);
  const rotation: readonly [number, number, number] = [0, yaw, 0];
  const [rx, rz] = point(frame, centreT, centreW);
  primitive(target, id(`${name}:rail-glass`), "glass", "glassPane",
    [rx, top + 0.56, rz], [length, 1.12, 0.1], GLASS,
    { rotation, bearsLoad: false, volume: length * 0.08,
      sideAttachmentReach: 1.2 });
  primitive(target, id(`${name}:rail-top`), "steel", "cylinder",
    [rx, top + 1.14, rz], [0.09, length, 0.09], IRON,
    { rotation: [0, yaw, Math.PI / 2], bearsLoad: false, volume: 0.1,
      sideAttachmentReach: 0.4 });
}

/**
 * Отметка, на которой строится здание на неровном грунте: САМАЯ ВЫСОКАЯ из
 * точек пятна. Восточная станция стоит на кромке речной террасы, перепад под
 * вестибюлем 0.67 м, и пол, положенный по центру пятна, наполовину уходил
 * под землю — а всё, что на нём стоит, теряло опору.
 */
function groundLevelOver(
  frame: StationFrame,
  samples: readonly (readonly [number, number])[],
): number {
  let top = -Infinity;
  for (const [t, w] of samples) {
    const [x, z] = point(frame, t, w);
    top = Math.max(top, groundUnder(x, z).top);
  }
  return top;
}

/** Цоколь под здание: секции следуют за грунтом, верх у всех общий. */
function createPlinth(
  target: MutableGroup,
  frame: StationFrame,
  id: (s: string) => string,
  name: string,
  options: {
    readonly fromT: number;
    readonly toT: number;
    readonly innerW: number;
    readonly outerW: number;
    readonly top: number;
  },
): void {
  const rotation: readonly [number, number, number] = [0, frame.yaw, 0];
  const sections = 5;
  const stepT = (options.toT - options.fromT) / sections;
  const stepW = (options.outerW - options.innerW) / sections;
  const runs: readonly (readonly [number, number, number, number])[] = [
    ...Array.from({ length: sections }, (_, index) => [
      options.fromT + stepT * (index + 0.5), options.innerW,
      Math.abs(stepT), 0.6,
    ] as const),
    ...Array.from({ length: sections }, (_, index) => [
      options.fromT + stepT * (index + 0.5), options.outerW,
      Math.abs(stepT), 0.6,
    ] as const),
    ...Array.from({ length: sections }, (_, index) => [
      options.fromT, options.innerW + stepW * (index + 0.5),
      0.6, Math.abs(stepW),
    ] as const),
    ...Array.from({ length: sections }, (_, index) => [
      options.toT, options.innerW + stepW * (index + 0.5),
      0.6, Math.abs(stepW),
    ] as const),
  ];
  for (const [index, [t, w, lengthT, widthW]] of runs.entries()) {
    const [px, pz] = point(frame, t, w);
    const base = groundUnder(px, pz).top;
    // Секцию не пропускаем даже на ровном месте: станции типовые, и опись
    // деталей у всех четырёх обязана совпадать до штуки. На ровном грунте
    // секция просто мелкая и наполовину закопана — как оно и бывает.
    const height = Math.max(0.14, options.top - base);
    primitive(target, id(`${name}:plinth:${index}`), "concrete", "stoneBlock",
      [px, base + height / 2, pz], [lengthT, height, widthW], CONCRETE_DEEP,
      { rotation, bearingArea: lengthT * widthW, volume: height * lengthT * widthW * 0.4,
        contactBoxes: [groundSeatBox(base + height / 2,
          [lengthT, height, widthW], base)] });
  }
}

/** Точка снаружи двери станции, откуда начинается пассажирский маршрут. */
export function stationApproach(): { readonly t: number; readonly w: number } {
  return { t: (HALL_FROM_T + HALL_TO_T) / 2, w: HALL_OUTER + 4 };
}

/**
 * Вестибюль на земле и единое вертикальное ядро до платформы.
 */
function createConcourse(
  concourse: MutableGroup,
  frame: StationFrame,
  id: (s: string) => string,
): void {
  const rotation: readonly [number, number, number] = [0, frame.yaw, 0];
  const hallCentreT = (HALL_FROM_T + HALL_TO_T) / 2;
  const hallCentreW = (HALL_INNER + HALL_OUTER) / 2;
  // Отметку здания берём по САМОЙ ВЫСОКОЙ точке пятна, а пол кладём ровным
  // на цоколь: у восточной станции вестибюль стоит на кромке речной террасы.
  const ground = groundLevelOver(frame, [
    [HALL_FROM_T, HALL_INNER], [HALL_FROM_T, HALL_OUTER],
    [HALL_TO_T, HALL_INNER], [HALL_TO_T, HALL_OUTER],
    [hallCentreT, hallCentreW],
    [CORE_START_T, STAIR_LANE], [CORE_START_T, ESCALATOR_LANE],
  ]);
  /** Верх пола станции: единая отметка для всего наземного этажа. */
  const floorTop = ground + 0.24;
  const hallLength = HALL_TO_T - HALL_FROM_T;
  const hallDepth = HALL_OUTER - HALL_INNER;
  const hallHeight = 4.6;

  // --- Ядро подъёма -------------------------------------------------------
  // Лестница и эскалатор идут одним разбегом и кончаются в одной точке —
  // на кромке верхней площадки.
  createStairFlight(concourse, frame, id, "stair", {
    fromT: CORE_START_T, toT: DECK_TOP_T,
    fromY: floorTop, toY: PLATFORM_Y, lane: STAIR_LANE,
  });
  createEscalator(concourse, frame, id, "escalator", {
    fromT: CORE_START_T, toT: DECK_TOP_T,
    fromY: floorTop, toY: PLATFORM_Y, lane: ESCALATOR_LANE,
  });

  // --- Верхняя площадка ---------------------------------------------------
  // Она примыкает к задней кромке платформы всей длиной: пассажир сходит с
  // марша и оказывается на платформе, а не в очередном коридоре.
  createDeck(concourse, frame, id, "deck", {
    fromT: DECK_FROM_T, toT: DECK_TOP_T,
    innerW: DECK_INNER, outerW: 13.2, top: PLATFORM_Y,
    columns: [
      [DECK_FROM_T + 1.4, 8.4], [DECK_TOP_T - 1.4, 8.4],
      [DECK_FROM_T + 1.4, 12.2], [DECK_TOP_T - 1.4, 12.2],
    ],
  });
  // Отросток к лифту: он выходит из площадки вбок и упирается в шахту.
  createDeck(concourse, frame, id, "deck-lift", {
    fromT: -16.4, toT: -13.6,
    innerW: 13.2, outerW: DECK_OUTER, top: PLATFORM_Y,
    columns: [[-15, 14.1], [-15, 16.2]],
  });
  // Ограждения открытых кромок площадки: дальний торец и наружная сторона до
  // отростка к лифту.
  createEdgeRail(concourse, frame, id, "deck-end",
    [DECK_FROM_T + 0.1, DECK_INNER], [DECK_FROM_T + 0.1, 13.1], PLATFORM_Y);
  createEdgeRail(concourse, frame, id, "deck-outer",
    [DECK_FROM_T, 13.1], [-16.5, 13.1], PLATFORM_Y);

  // --- Лифт ---------------------------------------------------------------
  // Шахта стоит РЯДОМ с площадкой, а не под ней: сверху она выходит в торец
  // отростка, снизу — в оплаченный коридор. Кабина ещё не ездит (это работа
  // движущихся объектов, вместе с составом), но проём, пол и двери у неё
  // настоящие, и сплошным блоком она больше не стоит.
  const liftFromT = -13.5;
  const liftToT = -10.7;
  const liftCentreT = (liftFromT + liftToT) / 2;
  for (const [cornerT, cornerW] of [
    [liftFromT, LIFT_LANE - LIFT_HALF], [liftFromT, LIFT_LANE + LIFT_HALF],
    [liftToT, LIFT_LANE - LIFT_HALF], [liftToT, LIFT_LANE + LIFT_HALF],
  ] as const) {
    const [px, pz] = point(frame, cornerT, cornerW);
    const base = groundUnder(px, pz).top;
    const height = PLATFORM_Y + 1.6 - base;
    primitive(concourse, id(`lift-post:${cornerT}:${cornerW}`), "steel", "panel",
      [px, base + height / 2, pz], [0.24, height, 0.24], STEEL,
      { rotation, bearingArea: 1.2, volume: 0.7, carriesAttachments: true,
        attachmentSupportMode: "wall", sideAttachmentReach: 1.4 });
  }
  // Остекление шахты по трём глухим сторонам, панелями по этажу.
  const liftBands = 4;
  const liftRise = PLATFORM_Y - floorTop;
  for (let band = 0; band < liftBands; band += 1) {
    const height = liftRise / liftBands;
    const y = floorTop + 0.1 + height * (band + 0.5);
    for (const side of [-1, 1] as const) {
      const [gx, gz] = point(frame, liftCentreT, LIFT_LANE + side * LIFT_HALF);
      primitive(concourse, id(`lift-glass:${side > 0 ? "o" : "i"}:${band}`),
        "glass", "glassPane",
        [gx, y, gz], [liftToT - liftFromT - 0.2, height - 0.08, 0.08], GLASS,
        { rotation, bearsLoad: false, volume: 0.3, sideAttachmentReach: 1.4 });
    }
  }
  // Кабина: пол, задняя стенка и потолок — в неё можно войти.
  const [cabX, cabZ] = point(frame, liftCentreT, LIFT_LANE);
  primitive(concourse, id("lift-floor"), "steel", "panel",
    [cabX, floorTop + 0.08, cabZ], [2.4, 0.16, LIFT_HALF * 2 - 0.3], "#8d9295",
    { rotation, bearingArea: 3, volume: 0.6, carriesAttachments: true,
      attachmentSupportMode: "cable", sideAttachmentReach: 0.8 });
  primitive(concourse, id("lift-ceiling"), "steel", "panel",
    [cabX, floorTop + 2.44, cabZ], [2.4, 0.12, LIFT_HALF * 2 - 0.3], WHITE_PANEL,
    {
      rotation, bearsLoad: false, volume: 0.3, sideAttachmentReach: 1.4,
      light: { color: "#eef4ff", distance: 5, intensity: 0.6, position: [0, -0.2, 0] },
    });
  // Панель вызова у нижнего проёма.
  const [callX, callZ] = point(frame, liftToT - 0.2, LIFT_LANE + LIFT_HALF - 0.4);
  primitive(concourse, id("lift-call"), "plastic", "panel",
    [callX, floorTop + 1.1, callZ], [0.18, 0.36, 0.1], SIGN_BLUE,
    { rotation, bearsLoad: false, volume: 0.02, sideAttachmentReach: 0.5 });

  // --- Вестибюль ----------------------------------------------------------
  const [fx, fz] = point(frame, hallCentreT, hallCentreW);
  createPlinth(concourse, frame, id, "hall", {
    fromT: HALL_FROM_T, toT: HALL_TO_T,
    innerW: HALL_INNER, outerW: HALL_OUTER, top: floorTop - 0.3,
  });
  primitive(concourse, id("hall-floor"), "concrete", "groundTile",
    [fx, floorTop - 0.15, fz], [hallLength, 0.3, hallDepth], CONCRETE,
    { rotation, carriesAttachments: true, attachmentSupportMode: "wall",
      bearingArea: 60, volume: 14 });
  // Торцевые стены зала. Со стороны ядра стена стоит ТОЛЬКО на неоплаченной
  // половине: оплаченная сторона обязана открываться прямо на марши. Пока
  // здесь стоял глухой торец во всю глубину, зал был тупиком — спуститься с
  // платформы получалось, а выйти из зала к лестнице нет.
  const paidGapW = FARE_LINE_W;
  const [wx, wz] = point(frame, HALL_TO_T, hallCentreW);
  primitive(concourse, id("hall-end:b"), "concrete", "panel",
    [wx, floorTop + hallHeight / 2, wz], [0.32, hallHeight, hallDepth], CONCRETE,
    { rotation, bearingArea: 7, volume: 6, carriesAttachments: true,
      attachmentSupportMode: "wall", sideAttachmentReach: 1.2 });
  const outerDepth = HALL_OUTER - paidGapW;
  const [ox, oz] = point(frame, HALL_FROM_T, paidGapW + outerDepth / 2);
  primitive(concourse, id("hall-end:a"), "concrete", "panel",
    [ox, floorTop + hallHeight / 2, oz], [0.32, hallHeight, outerDepth], CONCRETE,
    { rotation, bearingArea: 7, volume: 4, carriesAttachments: true,
      attachmentSupportMode: "wall", sideAttachmentReach: 1.2 });
  // Над проходом к ядру остаётся балка, а не стена.
  const [bx2, bz2] = point(frame, HALL_FROM_T, (HALL_INNER + paidGapW) / 2);
  primitive(concourse, id("hall-end:beam"), "concrete", "panel",
    [bx2, floorTop + hallHeight - 0.35, bz2], [0.32, 0.7, paidGapW - HALL_INNER],
    CONCRETE,
    { rotation, bearingArea: 2, volume: 1.4, carriesAttachments: true,
      attachmentSupportMode: "wall", sideAttachmentReach: 1.2 });
  // Стеклянный фасад лицом к центру острова, с НАСТОЯЩИМ проёмом входа.
  // Прошлая сборка запечатывала вход шестью сплошными панелями — станция
  // была непроходима с первого метра.
  const doorHalf = 1.6;
  for (let bay = 0; bay < 8; bay += 1) {
    const t = HALL_FROM_T + 0.9 + ((hallLength - 1.8) * bay) / 7;
    const [gx, gz] = point(frame, t, HALL_OUTER);
    primitive(concourse, id(`hall-mullion:${bay}`), "steel", "panel",
      [gx, floorTop + hallHeight / 2, gz], [0.16, hallHeight, 0.24], STEEL,
      { rotation, bearingArea: 0.9, volume: 0.3, carriesAttachments: true,
        attachmentSupportMode: "wall", sideAttachmentReach: 1.3 });
    if (Math.abs(t - hallCentreT) < doorHalf) {
      // Створ входа: стекла нет, но есть притолока над проёмом.
      continue;
    }
    primitive(concourse, id(`hall-glass:${bay}`), "glass", "glassPane",
      [gx, floorTop + hallHeight / 2, gz], [1.6, hallHeight - 0.3, 0.1], GLASS,
      { rotation, bearsLoad: false, volume: 0.4, sideAttachmentReach: 1.3 });
  }
  const [doorX, doorZ] = point(frame, hallCentreT, HALL_OUTER);
  primitive(concourse, id("hall-lintel"), "concrete", "panel",
    [doorX, floorTop + hallHeight - 0.5, doorZ], [doorHalf * 2 + 0.6, 1, 0.3],
    CONCRETE_DEEP,
    { rotation, bearingArea: 2, volume: 1.2, carriesAttachments: true,
      attachmentSupportMode: "wall", sideAttachmentReach: 1.2 });
  // Створки входа стоят распахнутыми к стене — проём свободен.
  for (const leaf of [-1, 1] as const) {
    const [lx, lz] = point(frame, hallCentreT + leaf * (doorHalf + 0.5), HALL_OUTER - 0.4);
    primitive(concourse, id(`hall-door:${leaf > 0 ? "b" : "a"}`), "glass", "glassPane",
      [lx, floorTop + 1.25, lz], [0.1, 2.4, 0.9], "#a8c6cc",
      { rotation, bearsLoad: false, volume: 0.2, sideAttachmentReach: 0.8 });
  }
  primitive(concourse, id("hall-roof"), "concrete", "panel",
    [fx, floorTop + hallHeight + 0.24, fz],
    [hallLength + 0.5, 0.48, hallDepth + 0.5], CONCRETE_DEEP,
    { rotation, volume: 16, bearingArea: 30, carriesAttachments: true,
      attachmentSupportMode: "wall" });
  const [cx, cz] = point(frame, hallCentreT, HALL_OUTER + 1.7);
  primitive(concourse, id("hall-canopy"), "glass", "glassPane",
    [cx, floorTop + hallHeight - 0.3, cz], [9, 0.14, 3.4], "#cfe2e6",
    { rotation, bearsLoad: false, volume: 0.6, sideAttachmentReach: 2 });

  // --- Кассовая линия и турникеты ----------------------------------------
  // Автоматы стоят лицом к подходу, с рабочей зоной перед ними; турникеты
  // идут ПОПЕРЁК потока параллельными проходами, а не гуськом вдоль него.
  for (let machine = 0; machine < 2; machine += 1) {
    const [mx, mz] = point(frame, HALL_TO_T - 2.4 - machine * 1.6, HALL_OUTER - 1.2);
    primitive(concourse, id(`ticket:${machine}`), "steel", "panel",
      [mx, floorTop + 0.95, mz], [1.2, 1.7, 0.6], "#9ea3a6",
      { rotation, bearingArea: 0.9, volume: 0.6, carriesAttachments: true,
        attachmentSupportMode: "cable", sideAttachmentReach: 0.5 });
    primitive(concourse, id(`ticket-face:${machine}`), "plastic", "panel",
      [mx, floorTop + 1.25, mz], [1, 1, 0.68], SIGN_BLUE,
      { rotation, bearsLoad: false, volume: 0.1, sideAttachmentReach: 0.5 });
  }

  // Барьер по линии оплаты: сплошной, кроме проходов. Обойти турникеты
  // стороной нельзя — это и проверяется тестом.
  const gates = [
    { t: HALL_FROM_T + 1.6, width: 0.62 },
    { t: HALL_FROM_T + 3.4, width: 0.62 },
    { t: HALL_FROM_T + 5.2, width: 0.62 },
    { t: HALL_FROM_T + 7.6, width: 1.4 },
  ] as const;
  // Барьер упирается в торцевые стены зала и стоит на его полу: свесить его
  // за плиту значит подвесить в воздухе.
  const barrierEnds = [HALL_FROM_T + 0.2, HALL_TO_T - 0.2];
  const cuts: number[] = [barrierEnds[0]];
  for (const gate of gates) {
    cuts.push(gate.t - gate.width / 2, gate.t + gate.width / 2);
  }
  cuts.push(barrierEnds[1]);
  for (let index = 0; index + 1 < cuts.length; index += 2) {
    const from = cuts[index];
    const to = cuts[index + 1];
    if (to - from < 0.05) {
      continue;
    }
    const [bx, bz] = point(frame, (from + to) / 2, FARE_LINE_W);
    primitive(concourse, id(`fare-barrier:${index}`), "steel", "panel",
      [bx, floorTop + 0.6, bz], [to - from, 1.05, 0.36], STEEL,
      { rotation, bearingArea: 1.2, volume: 0.5, carriesAttachments: true,
        attachmentSupportMode: "cable", sideAttachmentReach: 0.5 });
  }
  for (const [index, gate] of gates.entries()) {
    for (const side of [-1, 1] as const) {
      const [gx, gz] = point(frame, gate.t + side * (gate.width / 2 + 0.22), FARE_LINE_W);
      primitive(concourse, id(`gate:${index}:${side > 0 ? "b" : "a"}`), "steel", "panel",
        [gx, floorTop + 0.55, gz], [0.4, 1, 1.5], STEEL,
        { rotation, bearingArea: 0.7, volume: 0.4, carriesAttachments: true,
          attachmentSupportMode: "cable", sideAttachmentReach: 0.5 });
    }
    const [lx, lz] = point(frame, gate.t, FARE_LINE_W - 0.6);
    primitive(concourse, id(`gate-light:${index}`), "plastic", "panel",
      [lx, floorTop + 1.08, lz], [gate.width, 0.09, 0.3],
      index === gates.length - 1 ? "#37c15a" : "#37c15a",
      { rotation, bearsLoad: false, volume: 0.02, sideAttachmentReach: 0.6 });
  }

  // Указатель «к поездам» над проходами: после турникетов ядро видно прямо.
  const [signX, signZ] = point(frame, hallCentreT, FARE_LINE_W - 1.6);
  primitive(concourse, id("way-sign"), "plastic", "panel",
    // Табличка заведена в подшивку кровли: крепление wall-режима требует
    // носитель в полтора раза выше навески, и кровля в 0.48 м держит только
    // указатель тоньше 0.32.
    [signX, floorTop + hallHeight - 0.08, signZ], [3.2, 0.28, 0.14], SIGN_BLUE,
    { rotation, bearsLoad: false, volume: 0.08, sideAttachmentReach: 1.6 });

  // --- Оплаченный коридор -------------------------------------------------
  // Полоса по земле вдоль ядра: от турникетов к подножию маршей и дальше к
  // лифту. Это единственный наземный путь на оплаченной стороне, и колонны
  // площадки вынесены за его габарит.
  const corridorFrom = HALL_FROM_T + 0.4;
  const corridorTo = liftToT - 0.4;
  const [corrX, corrZ] = point(frame,
    (corridorFrom + corridorTo) / 2, (PAID_LANE_INNER + PAID_LANE_OUTER) / 2);
  primitive(concourse, id("paid-floor"), "concrete", "groundTile",
    [corrX, floorTop - 0.12, corrZ],
    [Math.abs(corridorTo - corridorFrom), 0.24, PAID_LANE_OUTER - PAID_LANE_INNER],
    "#c9ccd0",
    { rotation, bearingArea: 40, volume: 8, carriesAttachments: true,
      attachmentSupportMode: "wall" });
  // И площадка у подножия маршей, чтобы на первую ступень выходили с пола.
  const [footX, footZ] = point(frame, CORE_START_T + 1.6, (STAIR_LANE + ESCALATOR_LANE) / 2);
  primitive(concourse, id("core-apron"), "concrete", "groundTile",
    [footX, floorTop - 0.12, footZ],
    [3.2, 0.24, ESCALATOR_LANE - STAIR_LANE + STAIR_WIDTH + ESCALATOR_WIDTH],
    "#c9ccd0",
    { rotation, bearingArea: 30, volume: 5, carriesAttachments: true,
      attachmentSupportMode: "wall" });
}

/** Наружная вывеска: казахское название крупно, русское под ним. */
function createSignage(
  signage: MutableGroup,
  frame: StationFrame,
  id: (s: string) => string,
): void {
  // Вывеска висит на фасаде вестибюля — там, где к станции подходит человек.
  const rotation: readonly [number, number, number] = [0, frame.yaw, 0];
  const centreT = (HALL_FROM_T + HALL_TO_T) / 2;
  const [ax, az] = point(frame, centreT, HALL_OUTER - 0.2);
  const ground = groundUnder(ax, az).top;
  const [sx, sz] = point(frame, centreT, HALL_OUTER + 0.12);
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
