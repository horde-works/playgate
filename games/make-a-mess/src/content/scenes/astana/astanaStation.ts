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

import type { SceneVector3 } from "../../../game/destructionScene.ts";
import type { MutableGroup } from "./astanaAuthoring.ts";
import { groundSeatBox, orient, primitive } from "./astanaAuthoring.ts";
import { groundUnder } from "./astanaShell.ts";
import {
  RING_STRAIGHT_LENGTH,
  TRAIN_LENGTH,
  astanaStations,
  ringPathPoint,
  stationDistance,
  type AstanaStation,
} from "./astanaPlan.ts";
import { GIRDER_HEIGHT, PLATFORM_Y, RING_DECK_Y } from "./astanaRing.ts";

export { PLATFORM_Y };
export const PLATFORM_LENGTH = TRAIN_LENGTH + 4;
const PLATFORM_WIDTH = 5.4;
/** Отступ кромки платформы от оси пути — габарит вагона плюс зазор. */
const PLATFORM_EDGE = 1.62;
/** Плоскость продольной климатической стены у пути. */
const PLATFORM_SCREEN_LINE = PLATFORM_EDGE + 0.16;
/** Нижняя грань внутренней кровли над платформой. */
const CANOPY_HEIGHT = 3.25;
/** Дверей у состава из трёх секций: по две на секцию. */
export const DOORWAYS = 6;
/** Первый внешний корпус собирается только на северной станции для приёмки силуэта. */
export const STATION_SHELL_PROTOTYPE = "zhibek-zholy";
export const STATION_SHELL_RIBS = 11;
export const STATION_SHELL_PROFILE_SEGMENTS = 8;
/** Наклонный рукав от платформы до наземного вестибюля. */
export const STATION_ACCESS_SHELL_RIBS = 14;
export const STATION_ACCESS_PROFILE_SEGMENTS = 6;
export const STATION_ENTRANCE_PORTAL_FRAMES = 2;

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
const SHELL_WHITE = "#eef1f3";
const SHELL_SILVER = "#d9dde1";
const SHELL_SILVER_SHADE = "#cbd1d6";
const SHELL_GLASS = "#79aeb8";
const SHELL_SKIRT = "#aeb5ba";

// У станции свой световой режим: холодный дневной спектр остаётся заметным
// даже днём, а ночью даёт рабочую освещённость вместо декоративных пятен.
// Группы включаются целиком, поэтому при движении пассажира секции одного
// помещения не мигают по очереди из-за общего пула источников света.
export const STATION_LIGHT_COLOR = "#dcefff";
const STATION_LIGHT_DAY_FACTOR = 0.35;
const STATION_LIGHT_POOL_CAPACITY = 12;
const STATION_LIGHT_TRANSITION = {
  fadeInSeconds: 0.25,
  fadeOutSeconds: 0.2,
} as const;

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

/**
 * `orient` сначала делает оси взаимно перпендикулярными. Поэтому передавать
 * ему произвольную опорную ось нельзя: если в ней есть доля направления
 * детали, её вычитание изменит направление детали и рассчитанные торцы уже
 * не попадут в заданные точки. Здесь эта доля удаляется заранее.
 */
function perpendicularReference(
  reference: SceneVector3,
  direction: SceneVector3,
): SceneVector3 {
  const squaredLength = direction[0] ** 2 + direction[1] ** 2 + direction[2] ** 2 || 1;
  const scale = (
    reference[0] * direction[0]
    + reference[1] * direction[1]
    + reference[2] * direction[2]
  ) / squaredLength;
  const projected: SceneVector3 = [
    reference[0] - direction[0] * scale,
    reference[1] - direction[1] * scale,
    reference[2] - direction[2] * scale,
  ];
  if (Math.hypot(...projected) > 1e-7) {
    return projected;
  }
  return [0, 0, 1];
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
      [sx, PLATFORM_Y - 0.21, sz], [bayLength, 0.3, PLATFORM_WIDTH], CONCRETE,
      { rotation, carriesAttachments: true, attachmentSupportMode: "wall",
        bearingArea: 12, volume: bayLength * 0.12 });

    const tiles = 4;
    for (let tile = 0; tile < tiles; tile += 1) {
      const t = centre - bayLength / 2 + (bayLength * (tile + 0.5)) / tiles;
      const [tx, tz] = point(frame, t, axis);
      primitive(deck, id(`floor:${bay}:${tile}`), "stone", "groundTile",
        [tx, PLATFORM_Y - 0.03, tz],
        [bayLength / tiles, 0.06, PLATFORM_WIDTH - 0.24],
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
        [bayLength / 6, 0.05, 0.5], GRANITE_DARK,
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
  const line = PLATFORM_SCREEN_LINE;
  const glassTopY = PLATFORM_Y + 2.3;
  const topBeltHeight = 0.18;
  const wallTopY = PLATFORM_Y + CANOPY_HEIGHT;
  const topBeltBottomY = wallTopY - topBeltHeight;
  const topBeltY = wallTopY - topBeltHeight / 2;
  const headerHeight = topBeltBottomY - glassTopY;
  const headerY = glassTopY + headerHeight / 2;

  // Каркас стенки — это СТОЙКИ. Стекло, створки и ленты на них навешены и
  // сами ничего не несут; стойка стоит пяткой на полу платформы и доходит до
  // верхнего пояса. Пока стойки были декоративными, пояс и ленты над
  // проёмами держаться было не за что.
  const posts = DOORWAYS + 1;
  for (let post = 0; post < posts; post += 1) {
    const t = -TRAIN_LENGTH / 2 + doorPitch * post;
    const [sx, sz] = point(frame, t, line);
    const height = topBeltBottomY - PLATFORM_Y;
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
      [hx, headerY, hz], [doorPitch - 0.1, headerHeight, 0.22], WHITE_PANEL,
      { rotation, bearsLoad: false, volume: 0.1, sideAttachmentReach: 0.6,
        carriesAttachments: true, attachmentSupportMode: "cable" });
    primitive(screens, id(`psd:sign:${door}`), "plastic", "panel",
      [hx, headerY, hz], [doorPitch - 0.9, 0.24, 0.26], SIGN_BLUE,
      { rotation, bearsLoad: false, volume: 0.04, sideAttachmentReach: 0.4 });
  }

  // По обе стороны дверной сетки поезд оставлял по два метра пустоты до
  // торца платформы. Это не выходы: климатический коридор должен замыкаться
  // на торцевой витраж. Две глухие стеклянные секции продолжают всю систему
  // до точной координаты края, а крайние стойки прячут торец стекла.
  const endWallLength = (PLATFORM_LENGTH - TRAIN_LENGTH) / 2;
  const endPostInset = 0.08;
  for (const [end, sign] of [["a", -1], ["b", 1]] as const) {
    const trainEndT = sign * TRAIN_LENGTH / 2;
    const platformEndT = sign * PLATFORM_LENGTH / 2;
    const centreT = (trainEndT + platformEndT) / 2;
    const [wallX, wallZ] = point(frame, centreT, line);
    primitive(screens, id(`psd:end-wall:${end}`), "glass", "glassPane",
      [wallX, PLATFORM_Y + 1.15, wallZ], [endWallLength, 2.3, 0.12], GLASS,
      { rotation, bearsLoad: false, volume: 0.22, sideAttachmentReach: 1.6 });
    primitive(screens, id(`psd:end-frieze:${end}`), "plastic", "panel",
      [wallX, PLATFORM_Y + 0.34, wallZ], [endWallLength, 0.62, 0.14], TEAL,
      { rotation, bearsLoad: false, volume: 0.06, sideAttachmentReach: 1.6 });
    primitive(screens, id(`psd:end-header:${end}`), "plastic", "panel",
      [wallX, headerY, wallZ], [endWallLength, headerHeight, 0.22], WHITE_PANEL,
      { rotation, bearsLoad: false, volume: 0.08, sideAttachmentReach: 0.6,
        carriesAttachments: true, attachmentSupportMode: "cable" });

    const endPostT = platformEndT - sign * endPostInset;
    const [postX, postZ] = point(frame, endPostT, line);
    const postHeight = topBeltBottomY - PLATFORM_Y;
    primitive(screens, id(`psd:end-mullion:${end}`), "steel", "panel",
      [postX, PLATFORM_Y + postHeight / 2, postZ], [0.16, postHeight, 0.24], STEEL,
      { rotation, bearingArea: 1.2, volume: 0.12, carriesAttachments: true,
        attachmentSupportMode: "wall", sideAttachmentReach: 0.5 });
  }

  // Верхняя грань пояса совпадает с нижней гранью внутренней кровли. Пояс
  // идёт от края до края платформы; прежний короткий свес оставлял по 1.3 м
  // открытого торца с каждой стороны.
  const [tx, tz] = point(frame, 0, line);
  primitive(screens, id("psd:top"), "steel", "panel",
    [tx, topBeltY, tz], [PLATFORM_LENGTH, topBeltHeight, 0.3], STEEL,
    { rotation, volume: 0.6, bearingArea: 4, sideAttachmentReach: 1.2,
      carriesAttachments: true, attachmentSupportMode: "cable" });
}

/** Навес над платформой: реечный потолок с бирюзовыми вставками на колоннах. */
function createCanopy(
  canopy: MutableGroup,
  frame: StationFrame,
  id: (s: string) => string,
  enclosed = false,
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
  // В климатической оболочке плоская кровля — только внутренний потолок.
  // Он ниже и уже наружной кожи, поэтому не может пробить её на низком конце
  // встречной волны. У открытых станций прежний габарит пока сохраняется.
  const canopyHeight = enclosed ? 3.25 : CANOPY_HEIGHT;
  const roofWidth = enclosed ? PLATFORM_WIDTH - 0.4 : PLATFORM_WIDTH + 1.8;
  const roofBottom = PLATFORM_Y + canopyHeight;
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
      [bayLength, 0.36, roofWidth], CONCRETE,
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
        [0.3, 0.16, roofWidth - 0.4],
        (bay * slats + slat) % 5 === 2 ? TEAL : WHITE_PANEL,
        { rotation, bearsLoad: false, volume: 0.06, sideAttachmentReach: 0.4 });
    }

    // Светильник в подшивке — по одному на секцию.
    const [lx, lz] = point(frame, t, axis);
    primitive(canopy, id(`lamp:${bay}`), "steel", "panel",
      [lx, roofBottom - 0.04, lz], [1.4, 0.14, 0.3], WHITE_PANEL,
      {
        rotation, bearsLoad: false, volume: 0.03, sideAttachmentReach: 0.4,
        light: {
          color: STATION_LIGHT_COLOR,
          distance: 18,
          intensity: 4.6,
          position: [0, -0.3, 0],
          dayIntensityFactor: STATION_LIGHT_DAY_FACTOR,
          poolPriority: 4,
          localPoolCapacity: STATION_LIGHT_POOL_CAPACITY,
          poolGroupId: id("lighting:platform"),
          transition: STATION_LIGHT_TRANSITION,
        },
      });
  }
}

/** Обстановка платформы: табло, схема линии, лавки, урны, указатели. */
function createPlatformFittings(
  fittings: MutableGroup,
  frame: StationFrame,
  id: (s: string) => string,
  enclosed = false,
): void {
  const rotation: readonly [number, number, number] = [0, frame.yaw, 0];
  const axis = PLATFORM_EDGE + PLATFORM_WIDTH / 2;
  const fittingCanopyHeight = enclosed ? 3.25 : CANOPY_HEIGHT;

  // Подвесное табло с часами — по одному на каждую треть платформы.
  for (let board = 0; board < 2; board += 1) {
    const t = -PLATFORM_LENGTH / 4 + (PLATFORM_LENGTH / 2) * board;
    const [bx, bz] = point(frame, t, axis - 0.6);
    primitive(fittings, id(`board-arm:${board}`), "steel", "cylinder",
      [bx, PLATFORM_Y + fittingCanopyHeight - 0.55, bz], [0.08, 0.9, 0.08], IRON,
      { rotation, bearsLoad: false, volume: 0.02, sideAttachmentReach: 0.5 });
    primitive(fittings, id(`board:${board}`), "steel", "panel",
      [bx, PLATFORM_Y + fittingCanopyHeight - 1.25, bz], [1.6, 0.9, 0.12], "#22262a",
      { rotation, bearsLoad: false, volume: 0.06, sideAttachmentReach: 0.6 });
    primitive(fittings, id(`board-face:${board}`), "plastic", "panel",
      [bx, PLATFORM_Y + fittingCanopyHeight - 1.25, bz], [1.44, 0.76, 0.16], SIGN_BLUE,
      { rotation, bearsLoad: false, volume: 0.02, sideAttachmentReach: 0.5 });
  }

  // Лайтбокс со схемой линии у лестницы.
  // В закрытой станции схема не должна читаться отдельным «столбиком» на
  // полотне: разворачиваем её вдоль стены и прижимаем к глухой юбке.
  const mapW = enclosed
    ? PLATFORM_EDGE + PLATFORM_WIDTH - 0.12
    : PLATFORM_EDGE + PLATFORM_WIDTH - 0.9;
  const [mx, mz] = point(frame, -PLATFORM_LENGTH / 2 + 4, mapW);
  primitive(fittings, id("map-case"), "steel", "panel",
    [mx, PLATFORM_Y + 1.15, mz], enclosed ? [1.3, 2.1, 0.14] : [0.14, 2.1, 1.3], STEEL,
    { rotation, bearingArea: 0.6, volume: 0.2, carriesAttachments: true,
      attachmentSupportMode: "cable", sideAttachmentReach: 0.4 });
  const [mfx, mfz] = point(frame, -PLATFORM_LENGTH / 2 + 4, mapW - (enclosed ? 0.06 : 0));
  primitive(fittings, id("map-face"), "plastic", "panel",
    [mfx, PLATFORM_Y + 1.3, mfz], enclosed ? [1.1, 1.5, 0.06] : [0.06, 1.5, 1.1], WHITE_PANEL,
    { rotation, bearsLoad: false, volume: 0.02, sideAttachmentReach: 0.3 });

  // Лавки и урны вдоль глухой стороны. Комплект №0 попадал точно в
  // горловину входа на перрон (t между -21 и -14), поэтому здесь остаются
  // только два комплекта вне пассажирского прохода.
  for (let bench = 1; bench < 3; bench += 1) {
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
export const LIFT_HALF = 1.3;
/** Внутренняя кромка верхней площадки — она же задняя кромка платформы. */
const DECK_INNER = PLATFORM_EDGE + PLATFORM_WIDTH;
const DECK_OUTER = 16.8;
/** Где начинается подъём и где он выходит на площадку. */
export const CORE_START_T = 7;
export const DECK_TOP_T = -14;
/** Верхняя площадка: от кромки марша вдоль платформы. */
const DECK_FROM_T = -21;
export const LIFT_FROM_T = DECK_FROM_T + 1;
export const LIFT_TO_T = LIFT_FROM_T + 2.8;
export const STATION_SHELL_ENTRY_FROM_T = DECK_FROM_T;
export const STATION_SHELL_ENTRY_TO_T = DECK_TOP_T;
export const STATION_SHELL_ENTRY_TOP = PLATFORM_Y + 2.9;
const UPPER_VESTIBULE_OUTER = DECK_OUTER + 0.35;
const SHELL_HALF_LENGTH = PLATFORM_LENGTH / 2;
const SHELL_INNER_SKIN_W = PLATFORM_EDGE + PLATFORM_WIDTH + 1.13;
const SHELL_LOW_SPRING_Y = PLATFORM_Y + 3.08;
const SHELL_WAVE_RISE = 2.42;
const ACCESS_CEILING_DROP = 0.2;
const ACCESS_CEILING_THICKNESS = 0.07;
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
 * Та же встречная волна, по которой строится декоративная оболочка. Высоты
 * стоек лифта берутся не из отдельного числа, а из этой же функции: тогда
 * каждая стойка приходит именно в свой участок кривого потолка.
 */
function stationShellWave(t: number): number {
  const u = Math.max(0, Math.min(1, (t + SHELL_HALF_LENGTH) / (SHELL_HALF_LENGTH * 2)));
  return (1 - Math.cos(Math.PI * u)) / 2;
}

function upperVestibuleRoofY(t: number, w: number): number {
  const innerSpringY = SHELL_LOW_SPRING_Y + SHELL_WAVE_RISE * stationShellWave(t);
  const outerSpringY = PLATFORM_Y + 3.18;
  const outerRoofW = UPPER_VESTIBULE_OUTER - 0.52;
  const profile = Math.max(0, Math.min(1,
    (w - SHELL_INNER_SKIN_W) / (outerRoofW - SHELL_INNER_SKIN_W)));
  return innerSpringY + (outerSpringY - innerSpringY) * profile
    + 2.12 * Math.sin(Math.PI * profile);
}

function upperVestibuleCeilingUndersideY(t: number, w: number): number {
  return upperVestibuleRoofY(t, w)
    - ACCESS_CEILING_DROP
    - ACCESS_CEILING_THICKNESS / 2;
}

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

interface DeckSlab {
  readonly fromT: number;
  readonly toT: number;
  readonly fromW: number;
  readonly toW: number;
}

/**
 * Набор явно заданных плит. Верхний тамбур нельзя получать автоматическим
 * разрезанием прямоугольника по вырезу шахты: такой алгоритм породил пять
 * случайных фрагментов там, где конструктивная схема требует ровно два.
 */
function createDeckSlabs(
  target: MutableGroup,
  frame: StationFrame,
  id: (s: string) => string,
  name: string,
  top: number,
  slabs: readonly DeckSlab[],
): void {
  const rotation: readonly [number, number, number] = [0, frame.yaw, 0];
  for (const [index, slab] of slabs.entries()) {
    const centreT = (slab.fromT + slab.toT) / 2;
    const centreW = (slab.fromW + slab.toW) / 2;
    const lengthT = slab.toT - slab.fromT;
    const widthW = slab.toW - slab.fromW;
    const [dx, dz] = point(frame, centreT, centreW);
    primitive(target, id(`${name}:slab:${index}`), "concrete", "groundTile",
      [dx, top - 0.22, dz], [lengthT, 0.44, widthW], CONCRETE,
      { rotation, bearingArea: 16, volume: lengthT * widthW * 0.14,
        carriesAttachments: true, attachmentSupportMode: "wall",
        sideAttachmentReach: 1.2 });
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
    // На ровной площадке цоколь заходит в плиту пола, но не выходит на
    // отметку асфальта: прежние 14 см совпадали с дорогой грань-в-грань.
    const height = Math.max(0.1, options.top - base);
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
  enclosed = false,
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
  // У опытной станции это не наружная коробка, а внутренний тёплый объём.
  // Его плоское перекрытие целиком прячется под фасетной входной оболочкой.
  const hallHeight = enclosed ? 3 : 4.6;
  // Лифт стоит ВНУТРИ верхнего тамбура. Его передний торец смотрит в
  // свободную площадку перед началом маршей, задний — к глухому торцу.
  // Эти координаты одновременно задают вырез в плите и саму шахту.
  const liftFromT = LIFT_FROM_T;
  const liftToT = LIFT_TO_T;
  const liftCentreT = (liftFromT + liftToT) / 2;

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
  const vestibuleOuter = UPPER_VESTIBULE_OUTER;
  const liftInnerW = LIFT_LANE - LIFT_HALF;
  const deckSlabs: readonly DeckSlab[] = [
    // Главная плита идёт от платформы до внутренней грани шахты.
    { fromT: DECK_FROM_T, toT: DECK_TOP_T, fromW: DECK_INNER, toW: liftInnerW },
    // Вторая продолжает площадку только перед дверью лифта. Её задняя кромка
    // одновременно является порогом: отдельная третья плита здесь не нужна.
    { fromT: liftToT, toT: DECK_TOP_T, fromW: liftInnerW, toW: vestibuleOuter },
  ];
  createDeckSlabs(concourse, frame, id, "deck", PLATFORM_Y, deckSlabs);

  // Обе плиты висят на одном «грибе». Ось ствола — не условный центр
  // прямоугольника, а общий центр площади двух реальных плит: поэтому после
  // удаления лишних фрагментов опора сдвигается внутрь и назад симметрично
  // нагрузке. Три лепестка приходят в три разнесённые зоны этих двух плит.
  const slabArea = (slab: DeckSlab): number =>
    (slab.toT - slab.fromT) * (slab.toW - slab.fromW);
  const totalDeckArea = deckSlabs.reduce((sum, slab) => sum + slabArea(slab), 0);
  const supportT = deckSlabs.reduce((sum, slab) =>
    sum + ((slab.fromT + slab.toT) / 2) * slabArea(slab), 0) / totalDeckArea;
  const supportW = deckSlabs.reduce((sum, slab) =>
    sum + ((slab.fromW + slab.toW) / 2) * slabArea(slab), 0) / totalDeckArea;
  const [supportX, supportZ] = point(frame, supportT, supportW);
  const supportGround = groundUnder(supportX, supportZ).top;
  const stemTop = PLATFORM_Y - 2.65;
  primitive(concourse, id("deck:column:0"), "concrete", "cylinder",
    [supportX, supportGround + (stemTop - supportGround) / 2, supportZ],
    [1.35, stemTop - supportGround, 1.35], CONCRETE_DEEP,
    { bearingArea: 10, volume: 5.5, carriesAttachments: true,
      attachmentSupportMode: "wall", sideAttachmentReach: 1.1 });

  // Все три лепестка начинаются внутри одной головы ствола и заканчиваются
  // внутри нижней грани плит: это реальные пересечения, а не касания рядом.
  const stemHead: SceneVector3 = [supportX, stemTop - 0.48, supportZ];
  const innerTargetW = DECK_INNER + (liftInnerW - DECK_INNER) * 0.46;
  const petalTargets = [
    [DECK_FROM_T + 1.15, innerTargetW],
    [DECK_TOP_T - 0.85, innerTargetW],
    [(liftToT + DECK_TOP_T) / 2, (liftInnerW + vestibuleOuter) / 2],
  ] as const;
  for (const [index, [targetT, targetW]] of petalTargets.entries()) {
    const [targetX, targetZ] = point(frame, targetT, targetW);
    const target: SceneVector3 = [targetX, PLATFORM_Y - 0.38, targetZ];
    const chord: SceneVector3 = [
      target[0] - stemHead[0],
      target[1] - stemHead[1],
      target[2] - stemHead[2],
    ];
    const length = Math.hypot(chord[0], chord[1], chord[2]);
    primitive(concourse, id(`deck:column:${index + 1}`), "concrete", "panel",
      [
        (stemHead[0] + target[0]) / 2,
        (stemHead[1] + target[1]) / 2,
        (stemHead[2] + target[2]) / 2,
      ],
      [0.76, length, 0.86], CONCRETE_DEEP,
      { rotation: orient(
        perpendicularReference([frame.along[0], 0, frame.along[1]], chord),
        chord,
      ),
        bearingArea: 5, volume: length * 0.45, carriesAttachments: true,
        attachmentSupportMode: "wall", sideAttachmentReach: 2.2 });
  }
  // Ограждения открытых кромок площадки: дальний торец и наружная сторона до
  // шахты. Они стоят только над существующими плитами, поэтому не висят над
  // вырезом и не пересекают стекло лифта.
  const deckRailOuter = vestibuleOuter - 0.1;
  createEdgeRail(concourse, frame, id, "deck-end",
    [DECK_FROM_T + 0.1, DECK_INNER], [DECK_FROM_T + 0.1, liftInnerW - 0.1], PLATFORM_Y);
  createEdgeRail(concourse, frame, id, "deck-outer",
    [liftToT, deckRailOuter], [DECK_TOP_T, deckRailOuter], PLATFORM_Y);

  // --- Лифт ---------------------------------------------------------------
  // Шахта проходит через настоящий вырез в плите верхнего тамбура. Кабина
  // ещё не ездит (это работа движущихся объектов, вместе с составом), но
  // нижний и верхний проёмы теперь выходят в реальные пассажирские зоны.
  for (const [cornerT, cornerW] of [
    [liftFromT, LIFT_LANE - LIFT_HALF], [liftFromT, LIFT_LANE + LIFT_HALF],
    [liftToT, LIFT_LANE - LIFT_HALF], [liftToT, LIFT_LANE + LIFT_HALF],
  ] as const) {
    const [px, pz] = point(frame, cornerT, cornerW);
    const base = groundUnder(px, pz).top;
    // У каждой стойки собственная отметка: декоративный потолок здесь
    // одновременно гнётся поперёк и поднимается продольной волной.
    const top = upperVestibuleCeilingUndersideY(cornerT, cornerW);
    const height = top - base;
    primitive(concourse, id(`lift-post:${cornerT}:${cornerW}`), "steel", "panel",
      [px, base + height / 2, pz], [0.24, height, 0.24], STEEL,
      { rotation, bearingArea: 1.2, volume: 0.7, carriesAttachments: true,
        attachmentSupportMode: "wall", sideAttachmentReach: 1.4 });
  }
  // Остекление шахты: боковые полотна идут без горизонтальных щелей, оба
  // торца замкнуты. Внизу у оплаченного коридора оставлен дверной проём;
  // верхний торец закрыт до отметки платформы, выше выход открыт на площадку.
  const liftBands = 4;
  const liftRise = PLATFORM_Y - floorTop;
  for (let band = 0; band < liftBands; band += 1) {
    const height = liftRise / liftBands;
    const y = floorTop + height * (band + 0.5);
    for (const side of [-1, 1] as const) {
      const [gx, gz] = point(frame, liftCentreT, LIFT_LANE + side * LIFT_HALF);
      primitive(concourse, id(`lift-glass:${side > 0 ? "o" : "i"}:${band}`),
        "glass", "glassPane",
        [gx, y, gz], [liftToT - liftFromT, height, 0.08], GLASS,
        { rotation, bearsLoad: false, volume: 0.3, sideAttachmentReach: 1.4 });
    }
    const addLiftEnd = (end: "top" | "ground", t: number): void => {
      const [gx, gz] = point(frame, t, LIFT_LANE);
      primitive(concourse, id(`lift-glass:end-${end}:${band}`),
        "glass", "glassPane", [gx, y, gz],
        [0.08, height, LIFT_HALF * 2], GLASS,
        { rotation, bearsLoad: false, volume: 0.3, sideAttachmentReach: 1.4 });
    };
    addLiftEnd("top", liftFromT);
    if (band > 0) {
      addLiftEnd("ground", liftToT);
    }
  }
  // Над платформой шахта продолжается только тремя стенами. Передний торец
  // у liftToT полностью открыт — это дверь из лифта в верхний тамбур. Низ
  // всех трёх полотен и верх второй плиты имеют одну отметку PLATFORM_Y:
  // выход второго этажа поэтому не образует ни ступени, ни скрытого борта.
  for (const side of [-1, 1] as const) {
    const wallW = LIFT_LANE + side * LIFT_HALF;
    const wallTop = Math.min(
      upperVestibuleCeilingUndersideY(liftFromT, wallW),
      upperVestibuleCeilingUndersideY(liftToT, wallW),
    );
    const upperGlassHeight = wallTop - PLATFORM_Y;
    const [gx, gz] = point(frame, liftCentreT, wallW);
    primitive(concourse, id(`lift-glass:upper:${side > 0 ? "o" : "i"}`),
      "glass", "glassPane", [gx, PLATFORM_Y + upperGlassHeight / 2, gz],
      [liftToT - liftFromT, upperGlassHeight, 0.08], GLASS,
      { rotation, bearsLoad: false, volume: 0.2, sideAttachmentReach: 1.4 });
  }
  const upperBackTop = Math.min(
    upperVestibuleCeilingUndersideY(liftFromT, LIFT_LANE - LIFT_HALF),
    upperVestibuleCeilingUndersideY(liftFromT, LIFT_LANE + LIFT_HALF),
  );
  const upperBackHeight = upperBackTop - PLATFORM_Y;
  const [upperBackX, upperBackZ] = point(frame, liftFromT, LIFT_LANE);
  primitive(concourse, id("lift-glass:upper:back"), "glass", "glassPane",
    [upperBackX, PLATFORM_Y + upperBackHeight / 2, upperBackZ],
    [0.08, upperBackHeight, LIFT_HALF * 2], GLASS,
    { rotation, bearsLoad: false, volume: 0.2, sideAttachmentReach: 1.4 });

  // С наружной стороны между рамой шахты и витражом оболочки остаётся узкая
  // полоса. Закрываем её одной тонкой серой балкой точно до обеих кромок.
  // Балка заканчивается у t=liftToT и лишь стыкуется со второй плитой — её
  // верхняя грань не лежит поверх пола и потому не даёт ряби текстуры.
  const outerLiftEdge = LIFT_LANE + LIFT_HALF;
  const infillFromW = outerLiftEdge - 0.12;
  const infillWidth = vestibuleOuter - infillFromW;
  const [infillX, infillZ] = point(
    frame,
    liftToT - 0.06,
    infillFromW + infillWidth / 2,
  );
  primitive(concourse, id("lift-exit:outer-infill-beam"), "steel", "panel",
    [infillX, PLATFORM_Y - 0.18, infillZ], [0.12, 0.36, infillWidth],
    SHELL_SILVER_SHADE,
    { rotation, bearingArea: 1.2, volume: 0.16, carriesAttachments: true,
      attachmentSupportMode: "wall", sideAttachmentReach: 0.8 });
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
      light: {
        color: STATION_LIGHT_COLOR,
        distance: 7,
        intensity: 2,
        position: [0, -0.2, 0],
        dayIntensityFactor: STATION_LIGHT_DAY_FACTOR,
        poolPriority: 3,
        localPoolCapacity: STATION_LIGHT_POOL_CAPACITY,
        poolGroupId: id("lighting:lift"),
        transition: STATION_LIGHT_TRANSITION,
      },
    });
  // Панель вызова у нижнего проёма.
  const [callX, callZ] = point(frame, liftToT + 0.2, LIFT_LANE + LIFT_HALF - 0.4);
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
  const doorFromT = hallCentreT - doorHalf;
  const doorToT = hallCentreT + doorHalf;
  // Восемь стоек остаются только в глухих полотнах и на двух косяках.
  // Прежняя равномерная сетка оставляла две стойки прямо внутри двери.
  const facadePosts = [
    HALL_FROM_T,
    HALL_FROM_T + 1.55,
    HALL_FROM_T + 3.1,
    doorFromT,
    doorToT,
    HALL_TO_T - 3.1,
    HALL_TO_T - 1.55,
    HALL_TO_T,
  ] as const;
  for (const [post, t] of facadePosts.entries()) {
    const [gx, gz] = point(frame, t, HALL_OUTER);
    primitive(concourse, id(`hall-mullion:${post}`), "steel", "panel",
      [gx, floorTop + hallHeight / 2, gz], [0.16, hallHeight, 0.24], STEEL,
      { rotation, bearingArea: 0.9, volume: 0.3, carriesAttachments: true,
        attachmentSupportMode: "wall", sideAttachmentReach: 1.3 });
  }
  let facadePane = 0;
  for (let post = 0; post + 1 < facadePosts.length; post += 1) {
    const fromT = facadePosts[post];
    const toT = facadePosts[post + 1];
    if (fromT === doorFromT && toT === doorToT) {
      continue;
    }
    const [gx, gz] = point(frame, (fromT + toT) / 2, HALL_OUTER);
    primitive(concourse, id(`hall-glass:${facadePane}`), "glass", "glassPane",
      [gx, floorTop + hallHeight / 2, gz],
      [toT - fromT - 0.12, hallHeight - 0.3, 0.1], GLASS,
      { rotation, bearsLoad: false, volume: 0.4, sideAttachmentReach: 1.3 });
    facadePane += 1;
  }
  const [doorX, doorZ] = point(frame, hallCentreT, HALL_OUTER);
  const lintelHeight = enclosed ? 0.38 : 1;
  const lintelTop = floorTop + hallHeight - 0.05;
  primitive(concourse, id("hall-lintel"), "concrete", "panel",
    [doorX, lintelTop - lintelHeight / 2, doorZ],
    [doorHalf * 2 + 0.6, lintelHeight, 0.3],
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
    enclosed
      ? [hallLength - 0.3, 0.48, hallDepth - 0.3]
      : [hallLength + 0.5, 0.48, hallDepth + 0.5],
    CONCRETE_DEEP,
    { rotation, volume: 16, bearingArea: 30, carriesAttachments: true,
      attachmentSupportMode: "wall" });

  // Четыре широких светильника дают вестибюлю равномерный рабочий свет.
  // Они сидят нижней стороной перекрытия, а не висят отдельными точками в
  // воздухе; две линии перекрывают вход, турникеты и оплаченный коридор.
  const hallLampTs = [
    hallCentreT - hallLength * 0.25,
    hallCentreT + hallLength * 0.25,
  ] as const;
  const hallLampWs = [
    hallCentreW - hallDepth * 0.23,
    hallCentreW + hallDepth * 0.23,
  ] as const;
  let hallLamp = 0;
  for (const lampT of hallLampTs) {
    for (const lampW of hallLampWs) {
      const [lampX, lampZ] = point(frame, lampT, lampW);
      primitive(concourse, id(`hall-lamp:${hallLamp}`), "steel", "panel",
        // Верхние 4 см заведены в перекрытие: это настоящий монтажный
        // контакт, а не визуальное касание двух математических плоскостей.
        [lampX, floorTop + hallHeight - 0.02, lampZ], [2.2, 0.12, 0.38],
        WHITE_PANEL,
        {
          rotation, bearsLoad: false, volume: 0.05, sideAttachmentReach: 0.5,
          light: {
            color: STATION_LIGHT_COLOR,
            distance: 16,
            intensity: 4.8,
            position: [0, -0.3, 0],
            dayIntensityFactor: STATION_LIGHT_DAY_FACTOR,
            poolPriority: 4,
            localPoolCapacity: STATION_LIGHT_POOL_CAPACITY,
            poolGroupId: id("lighting:hall"),
            transition: STATION_LIGHT_TRANSITION,
          },
        });
      hallLamp += 1;
    }
  }
  // У прототипа эта деталь становится внутренней фрамугой и целиком
  // остаётся за скульптурным порталом. Так типовая опись станции сохраняется,
  // но прежняя плоская стеклянная плита больше не торчит наружу.
  const canopyW = enclosed ? HALL_OUTER - 0.45 : HALL_OUTER + 1.7;
  const [cx, cz] = point(frame, hallCentreT, canopyW);
  primitive(concourse, id("hall-canopy"), "glass", "glassPane",
    [cx, floorTop + hallHeight - 0.3, cz],
    enclosed ? [3.4, 0.1, 0.5] : [9, 0.14, 3.4], "#cfe2e6",
    { rotation, bearsLoad: false, volume: enclosed ? 0.15 : 0.6,
      sideAttachmentReach: 2 });

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
    { t: HALL_FROM_T + 1.6, width: 1 },
    { t: HALL_FROM_T + 3.4, width: 1 },
    { t: HALL_FROM_T + 5.2, width: 1 },
    { t: HALL_FROM_T + 7.6, width: 1.5 },
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
      const [gx, gz] = point(frame, gate.t + side * (gate.width / 2 + 0.18), FARE_LINE_W);
      primitive(concourse, id(`gate:${index}:${side > 0 ? "b" : "a"}`), "steel", "panel",
        [gx, floorTop + 0.55, gz], [0.28, 1, 1.35], STEEL,
        { rotation, bearingArea: 0.7, volume: 0.4, carriesAttachments: true,
          attachmentSupportMode: "cable", sideAttachmentReach: 0.5 });
    }
  }

  // Указатель «к поездам» над проходами: после турникетов ядро видно прямо.
  const [signX, signZ] = point(frame, hallCentreT, FARE_LINE_W - 1.6);
  primitive(concourse, id("way-sign"), "plastic", "panel",
    // Табличка заведена в подшивку кровли: крепление wall-режима требует
    // носитель в полтора раза выше навески, и кровля в 0.48 м держит только
    // указатель тоньше 0.32.
    [signX, floorTop + hallHeight - (enclosed ? 0.2 : 0.08), signZ],
    [3.2, 0.28, 0.14], SIGN_BLUE,
    { rotation, bearsLoad: false, volume: 0.08, sideAttachmentReach: 1.6 });

  // --- Оплаченный коридор -------------------------------------------------
  // Полоса по земле вдоль ядра: от турникетов к подножию маршей и дальше к
  // лифту. Это единственный наземный путь на оплаченной стороне, и колонны
  // площадки вынесены за его габарит.
  const corridorFrom = HALL_FROM_T;
  const corridorTo = liftToT;
  const [corrX, corrZ] = point(frame,
    (corridorFrom + corridorTo) / 2, (PAID_LANE_INNER + PAID_LANE_OUTER) / 2);
  primitive(concourse, id("paid-floor"), "concrete", "groundTile",
    [corrX, floorTop - 0.12, corrZ],
    [Math.abs(corridorTo - corridorFrom), 0.24, PAID_LANE_OUTER - PAID_LANE_INNER],
    "#c9ccd0",
    { rotation, bearingArea: 40, volume: 8, carriesAttachments: true,
      attachmentSupportMode: "wall" });
  // И площадка у подножия маршей, чтобы на первую ступень выходили с пола.
  const apronFromT = CORE_START_T;
  const apronToT = HALL_FROM_T;
  const apronInnerW = STAIR_LANE - STAIR_WIDTH / 2;
  const apronOuterW = PAID_LANE_INNER;
  const [footX, footZ] = point(frame,
    (apronFromT + apronToT) / 2, (apronInnerW + apronOuterW) / 2);
  primitive(concourse, id("core-apron"), "concrete", "groundTile",
    [footX, floorTop - 0.12, footZ],
    [apronToT - apronFromT, 0.24, apronOuterW - apronInnerW],
    "#c9ccd0",
    { rotation, bearingArea: 30, volume: 5, carriesAttachments: true,
      attachmentSupportMode: "wall" });
}

/** Наружная вывеска: казахское название крупно, русское под ним. */
function createSignage(
  signage: MutableGroup,
  frame: StationFrame,
  id: (s: string) => string,
  integrated = false,
): void {
  // Вывеска висит на фасаде вестибюля — там, где к станции подходит человек.
  const rotation: readonly [number, number, number] = [0, frame.yaw, 0];
  const centreT = (HALL_FROM_T + HALL_TO_T) / 2;
  const [ax, az] = point(frame, centreT, HALL_OUTER - 0.2);
  const ground = groundUnder(ax, az).top;
  // На опытной станции табличка сидит внутри крайней портальной рамы;
  // прежняя семиметровая панель на фасаде тёплой коробки пробивала оболочку.
  const signW = integrated ? HALL_OUTER + 4.02 : HALL_OUTER + 0.12;
  const [sx, sz] = point(frame, centreT, signW);
  primitive(signage, id("name-plate"), "plastic", "panel",
    [sx, ground + (integrated ? 3.08 : 3.6), sz],
    integrated ? [3.05, 0.48, 0.16] : [7.4, 0.9, 0.16], WHITE_PANEL,
    { rotation, bearsLoad: false, volume: 0.3, sideAttachmentReach: 0.6 });
  primitive(signage, id("name-kazakh"), "plastic", "panel",
    [sx, ground + (integrated ? 3.17 : 3.82), sz],
    integrated ? [2.55, 0.18, 0.22] : [6.4, 0.34, 0.22], TEAL_DEEP,
    { rotation, bearsLoad: false, volume: 0.06, sideAttachmentReach: 0.5 });
  primitive(signage, id("name-russian"), "plastic", "panel",
    [sx, ground + (integrated ? 2.99 : 3.4), sz],
    integrated ? [2.1, 0.12, 0.22] : [5.2, 0.22, 0.22], "#5a6367",
      { rotation, bearsLoad: false, volume: 0.04, sideAttachmentReach: 0.5 });
}

/**
 * Первый наружный корпус станции. Это отдельный приёмочный прототип на
 * «Жібек жолы»: остальные три станции пока сохраняют прежний открытый вид.
 *
 * У готовых станций Астаны кровля не является экструдированной бочкой.
 * Продольные кромки идут встречной волной: наружная сторона падает от одного
 * торца к другому, внутренняя в тот же момент поднимается. Поперечные рёбра
 * связывают эти кромки аркой и образуют одну скрученную оболочку. Плоский
 * реечный навес остаётся внутри неё как подвесной потолок.
 */
function createStationShellPrototype(
  shell: MutableGroup,
  frame: StationFrame,
): void {
  const id = (suffix: string) => `prototype-zhibek-zholy-shell:${suffix}`;
  const along: SceneVector3 = [frame.along[0], 0, frame.along[1]];
  const inward: SceneVector3 = [frame.inward[0], 0, frame.inward[1]];
  const vertical: SceneVector3 = [0, 1, 0];
  const deckTop = RING_DECK_Y + GIRDER_HEIGHT;
  const halfLength = SHELL_HALF_LENGTH;
  const outerFootW = -3.45;
  const outerSkinW = -3.75;
  const innerFootW = PLATFORM_EDGE + PLATFORM_WIDTH - 0.27;
  const innerSkinW = SHELL_INNER_SKIN_W;
  const lowSpring = SHELL_LOW_SPRING_Y;
  const waveRise = SHELL_WAVE_RISE;
  const archRise = 2.72;
  const entryFromT = STATION_SHELL_ENTRY_FROM_T;
  const entryToT = STATION_SHELL_ENTRY_TO_T;
  const entryTop = STATION_SHELL_ENTRY_TOP;

  const worldPoint = (t: number, w: number, y: number): SceneVector3 => {
    const [x, z] = point(frame, t, w);
    return [x, y, z];
  };
  const minus = (a: SceneVector3, b: SceneVector3): SceneVector3 =>
    [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const midpoint = (a: SceneVector3, b: SceneVector3): SceneVector3 =>
    [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  const average4 = (
    a: SceneVector3,
    b: SceneVector3,
    c: SceneVector3,
    d: SceneVector3,
  ): SceneVector3 => [
    (a[0] + b[0] + c[0] + d[0]) / 4,
    (a[1] + b[1] + c[1] + d[1]) / 4,
    (a[2] + b[2] + c[2] + d[2]) / 4,
  ];
  const lengthOf = (vector: SceneVector3): number =>
    Math.hypot(vector[0], vector[1], vector[2]);
  const projectedReference = (
    reference: SceneVector3,
    direction: SceneVector3,
  ): SceneVector3 => {
    const length = lengthOf(direction) || 1;
    const axis: SceneVector3 = [
      direction[0] / length,
      direction[1] / length,
      direction[2] / length,
    ];
    const dot = reference[0] * axis[0]
      + reference[1] * axis[1]
      + reference[2] * axis[2];
    const projected: SceneVector3 = [
      reference[0] - axis[0] * dot,
      reference[1] - axis[1] * dot,
      reference[2] - axis[2] * dot,
    ];
    if (lengthOf(projected) > 1e-7) {
      return projected;
    }
    const fallback: SceneVector3 = Math.abs(axis[1]) < 0.9 ? vertical : inward;
    const fallbackDot = fallback[0] * axis[0]
      + fallback[1] * axis[1]
      + fallback[2] * axis[2];
    return [
      fallback[0] - axis[0] * fallbackDot,
      fallback[1] - axis[1] * fallbackDot,
      fallback[2] - axis[2] * fallbackDot,
    ];
  };

  const addMember = (
    memberId: string,
    from: SceneVector3,
    to: SceneVector3,
    reference: SceneVector3,
    width: number,
    depth = width,
    loadBearing = true,
    color = SHELL_WHITE,
  ): void => {
    const chord = minus(to, from);
    const memberLength = lengthOf(chord);
    primitive(shell, id(memberId), "steel", "panel", midpoint(from, to),
      [depth, memberLength, width], color,
      {
        rotation: orient(projectedReference(reference, chord), chord),
        bearsLoad: loadBearing,
        bearingArea: loadBearing ? Math.max(0.7, width * 4) : undefined,
        volume: Math.max(0.03, memberLength * width * depth * 0.45),
        carriesAttachments: loadBearing,
        attachmentSupportMode: loadBearing ? "cable" : undefined,
        sideAttachmentReach: loadBearing ? 1.25 : 1.5,
      });
  };

  const addFacet = (
    facetId: string,
    p00: SceneVector3,
    p01: SceneVector3,
    p10: SceneVector3,
    p11: SceneVector3,
    material: "steel" | "glass",
    color: string,
    thickness: number,
    reach = 1.5,
  ): void => {
    const atA = midpoint(p00, p01);
    const atB = midpoint(p10, p11);
    const lower = midpoint(p00, p10);
    const upper = midpoint(p01, p11);
    const xDirection = minus(atB, atA);
    const rawY = minus(upper, lower);
    const xLength = lengthOf(xDirection) || 1;
    const xAxis: SceneVector3 = [
      xDirection[0] / xLength,
      xDirection[1] / xLength,
      xDirection[2] / xLength,
    ];
    const dot = rawY[0] * xAxis[0] + rawY[1] * xAxis[1] + rawY[2] * xAxis[2];
    const yDirection: SceneVector3 = [
      rawY[0] - xAxis[0] * dot,
      rawY[1] - xAxis[1] * dot,
      rawY[2] - xAxis[2] * dot,
    ];
    primitive(shell, id(facetId), material, material === "glass" ? "glassPane" : "panel",
      average4(p00, p01, p10, p11),
      // Кожа и стекло сходятся по расчётным кромкам. Прежние вычеты 8 и
      // 6 см создавали видимые щели между соседними фасетами.
      [Math.max(0.1, xLength), Math.max(0.1, lengthOf(yDirection)), thickness],
      color,
      {
        rotation: orient(xDirection, yDirection),
        bearsLoad: false,
        volume: material === "glass" ? 0.22 : 0.16,
        sideAttachmentReach: reach,
      });
  };

  const wave = stationShellWave;
  const springY = (t: number, side: "outer" | "inner"): number => {
    const rise = side === "outer" ? 1 - wave(t) : wave(t);
    return lowSpring + waveRise * rise;
  };
  const roofPoint = (t: number, profile: number): SceneVector3 => {
    const outerY = springY(t, "outer");
    const innerY = springY(t, "inner");
    const w = outerSkinW + (innerSkinW - outerSkinW) * profile;
    const y = outerY + (innerY - outerY) * profile
      + archRise * Math.sin(Math.PI * profile);
    return worldPoint(t, w, y);
  };
  const sidePoint = (
    t: number,
    side: "outer" | "inner",
    fraction: number,
  ): SceneVector3 => {
    const footW = side === "outer" ? outerFootW : innerFootW;
    const skinW = side === "outer" ? outerSkinW : innerSkinW;
    const baseY = side === "outer" ? deckTop + 0.02 : PLATFORM_Y - 0.06;
    const topY = springY(t, side);
    return worldPoint(
      t,
      footW + (skinW - footW) * fraction,
      baseY + (topY - baseY) * fraction,
    );
  };
  const sideFractionAtY = (
    t: number,
    side: "outer" | "inner",
    y: number,
  ): number => {
    const baseY = side === "outer" ? deckTop + 0.02 : PLATFORM_Y - 0.06;
    return Math.max(0, Math.min(1, (y - baseY) / (springY(t, side) - baseY)));
  };

  const ribTs = Array.from({ length: STATION_SHELL_RIBS }, (_, index) =>
    -halfLength + (PLATFORM_LENGTH * index) / (STATION_SHELL_RIBS - 1));

  // Белый внешний каркас. Торцевые рёбра толще промежуточных: именно они
  // рисуют крупный округлый портал на фотографиях готовых станций.
  for (let rib = 0; rib < ribTs.length; rib += 1) {
    const t = ribTs[rib];
    const endRib = rib === 0 || rib === ribTs.length - 1;
    const width = endRib ? 0.42 : 0.22;
    const depth = endRib ? 0.52 : 0.28;
    for (const side of ["outer", "inner"] as const) {
      const insideEntry = side === "inner" && t > entryFromT && t < entryToT;
      const fromFraction = insideEntry
        ? sideFractionAtY(t, side, entryTop)
        : 0;
      addMember(
        `rib:${rib}:leg:${side}`,
        sidePoint(t, side, fromFraction),
        sidePoint(t, side, 1),
        along,
        width,
        depth,
      );
    }
    for (let segment = 0; segment < STATION_SHELL_PROFILE_SEGMENTS; segment += 1) {
      addMember(
        `rib:${rib}:arch:${segment}`,
        roofPoint(t, segment / STATION_SHELL_PROFILE_SEGMENTS),
        roofPoint(t, (segment + 1) / STATION_SHELL_PROFILE_SEGMENTS),
        along,
        width,
        depth,
      );
    }
  }

  // Две белые продольные кромки показывают встречную волну даже издалека.
  for (let bay = 0; bay + 1 < ribTs.length; bay += 1) {
    const fromT = ribTs[bay];
    const toT = ribTs[bay + 1];
    for (const side of ["outer", "inner"] as const) {
      const profile = side === "outer" ? 0 : 1;
      addMember(
        `wave-rim:${side}:${bay}`,
        roofPoint(fromT, profile),
        roofPoint(toT, profile),
        inward,
        0.28,
        0.34,
      );
    }
  }

  // Продольные прогоны связывают каждую вершину соседних арок. Это не
  // декоративная сетка: без них отдельные поперечные рёбра лишь касаются
  // кровельной кожи, но не образуют пространственный несущий каркас.
  for (let bay = 0; bay + 1 < ribTs.length; bay += 1) {
    const fromT = ribTs[bay];
    const toT = ribTs[bay + 1];
    for (let profile = 1; profile < STATION_SHELL_PROFILE_SEGMENTS; profile += 1) {
      addMember(
        `roof-purlin:${bay}:${profile}`,
        roofPoint(fromT, profile / STATION_SHELL_PROFILE_SEGMENTS),
        roofPoint(toT, profile / STATION_SHELL_PROFILE_SEGMENTS),
        inward,
        0.14,
        0.18,
      );
    }
  }

  // Фасетная металлическая кожа кровли. Секции следуют реальной скрутке,
  // поэтому ни один поворот не задаётся эйлерами «на глаз».
  for (let bay = 0; bay + 1 < ribTs.length; bay += 1) {
    const fromT = ribTs[bay];
    const toT = ribTs[bay + 1];
    for (let segment = 0; segment < STATION_SHELL_PROFILE_SEGMENTS; segment += 1) {
      const fromProfile = segment / STATION_SHELL_PROFILE_SEGMENTS;
      const toProfile = (segment + 1) / STATION_SHELL_PROFILE_SEGMENTS;
      addFacet(
        `roof-skin:${bay}:${segment}`,
        roofPoint(fromT, fromProfile),
        roofPoint(fromT, toProfile),
        roofPoint(toT, fromProfile),
        roofPoint(toT, toProfile),
        "steel",
        (bay + segment) % 3 === 0 ? SHELL_SILVER_SHADE : SHELL_SILVER,
        0.12,
        1.8,
      );
    }
  }

  // Наклонные продольные витражи: низ — глухая металлическая юбка, выше —
  // три стеклянных пояса. Белые стойки рёбер закрывают ступень между секциями.
  const sideBands = [0, 0.24, 0.49, 0.74, 1] as const;
  for (let bay = 0; bay + 1 < ribTs.length; bay += 1) {
    const fromT = ribTs[bay];
    const toT = ribTs[bay + 1];
    for (const side of ["outer", "inner"] as const) {
      const cuts = [fromT, toT];
      if (side === "inner") {
        for (const cut of [entryFromT, entryToT]) {
          if (cut > fromT + 0.01 && cut < toT - 0.01) {
            cuts.push(cut);
          }
        }
      }
      cuts.sort((left, right) => left - right);
      for (let run = 0; run + 1 < cuts.length; run += 1) {
        const runFrom = cuts[run];
        const runTo = cuts[run + 1];
        // Крайнее стекло заводится под толстую торцевую раму. Так его
        // прозрачная коробка не выходит наружу за плоскость фасада, а рама
        // перекрывает стык без открытой щели.
        const cladFrom = Math.abs(runFrom + halfLength) < 0.01
          ? runFrom + 0.14
          : runFrom;
        const cladTo = Math.abs(runTo - halfLength) < 0.01
          ? runTo - 0.14
          : runTo;
        const runMiddle = (runFrom + runTo) / 2;
        const entryRun = side === "inner"
          && runMiddle > entryFromT
          && runMiddle < entryToT;
        const openingFrom = entryRun
          ? sideFractionAtY(runFrom, side, entryTop)
          : 0;
        const openingTo = entryRun
          ? sideFractionAtY(runTo, side, entryTop)
          : 0;

        for (let band = 0; band + 1 < sideBands.length; band += 1) {
          const fromBand = sideBands[band];
          const toBand = sideBands[band + 1];
          const lowerFrom = Math.max(fromBand, openingFrom);
          const lowerTo = Math.max(fromBand, openingTo);
          if (lowerFrom >= toBand - 0.01 && lowerTo >= toBand - 0.01) {
            continue;
          }
          addFacet(
            `side:${side}:${bay}:${run}:${band}`,
            sidePoint(cladFrom, side, Math.min(lowerFrom, toBand - 0.005)),
            sidePoint(cladFrom, side, toBand),
            sidePoint(cladTo, side, Math.min(lowerTo, toBand - 0.005)),
            sidePoint(cladTo, side, toBand),
            band === 0 ? "steel" : "glass",
            band === 0 ? SHELL_SKIRT : SHELL_GLASS,
            band === 0 ? 0.14 : 0.1,
            1.8,
          );
        }

        // Все горизонтальные швы закрыты белыми поясами. В зоне входа
        // пояса обрываются у косяков, а над проёмом остаётся только фрамуга.
        for (const [rail, fraction] of [0.24, 0.49, 0.74].entries()) {
          const railBehindOpening = entryRun
            && sidePoint(runMiddle, side, fraction)[1] < entryTop + 0.04;
          if (railBehindOpening) {
            continue;
          }
          addMember(
            `side-rail:${side}:${bay}:${run}:${rail}`,
            sidePoint(cladFrom, side, fraction),
            sidePoint(cladTo, side, fraction),
            inward,
            0.1,
            0.12,
            false,
          );
        }
      }
    }
  }

  // Проём в климатической стене — не место для приставного козырька, а
  // горловина второго рукава станции. Сначала замыкаем сам вырез рамой;
  // дальнейшая оболочка использует её же расчётные границы.
  const collarTop = (t: number): SceneVector3 =>
    sidePoint(t, "inner", sideFractionAtY(t, "inner", entryTop));
  for (const [edge, t] of [["a", entryFromT], ["b", entryToT]] as const) {
    addMember(
      `access:collar:jamb:${edge}`,
      sidePoint(t, "inner", 0),
      collarTop(t),
      along,
      0.3,
      0.34,
    );
  }
  addMember(
    "access:collar:header",
    collarTop(entryFromT),
    collarTop(entryToT),
    vertical,
    0.3,
    0.36,
  );

  // Отметка пола совпадает с createConcourse. Она нужна здесь не для
  // визуальной подгонки, а чтобы кровля шла одним постоянным просветом над
  // реальным маршем: площадка → лестница/эскалатор → наземный вестибюль.
  const hallCentreT = (HALL_FROM_T + HALL_TO_T) / 2;
  const hallCentreW = (HALL_INNER + HALL_OUTER) / 2;
  const accessGround = groundLevelOver(frame, [
    [HALL_FROM_T, HALL_INNER], [HALL_FROM_T, HALL_OUTER],
    [HALL_TO_T, HALL_INNER], [HALL_TO_T, HALL_OUTER],
    [hallCentreT, hallCentreW],
    [CORE_START_T, STAIR_LANE], [CORE_START_T, ESCALATOR_LANE],
  ]);
  const accessFloorTop = accessGround + 0.24;

  // Конструктивная плита наземного вестибюля остаётся внутри, но со стороны
  // спуска больше не виден её светлый бетон. Нижняя грань и четыре торца
  // закрыты тонкими серыми кассетами в палитре наружной металлической кожи.
  const liningTFrom = HALL_FROM_T + 0.18;
  const liningTTo = HALL_TO_T - 0.18;
  const liningWFrom = HALL_INNER + 0.18;
  const liningWTo = HALL_OUTER - 0.18;
  const liningTSpan = liningTTo - liningTFrom;
  const liningWSpan = liningWTo - liningWFrom;
  const liningRotation: SceneVector3 = [0, frame.yaw, 0];
  const liningY = accessFloorTop + 3 - 0.02;
  const liningRows = 4;
  const liningColumns = 4;
  for (let row = 0; row < liningRows; row += 1) {
    for (let column = 0; column < liningColumns; column += 1) {
      const t = liningTFrom + liningTSpan * (row + 0.5) / liningRows;
      const w = liningWFrom + liningWSpan * (column + 0.5) / liningColumns;
      primitive(shell, id(`entrance-lining:ceiling:${row}:${column}`),
        "steel", "panel", worldPoint(t, w, liningY),
        [liningTSpan / liningRows - 0.055, 0.08, liningWSpan / liningColumns - 0.055],
        (row + column) % 3 === 0 ? SHELL_SILVER_SHADE : SHELL_SILVER,
        { rotation: liningRotation, bearsLoad: false, volume: 0.16,
          sideAttachmentReach: 3, carriesAttachments: true,
          attachmentSupportMode: "cable" });
    }
  }
  const liningFasciaY = accessFloorTop + 3.24;
  for (const [edge, t] of [["a", liningTFrom], ["b", liningTTo]] as const) {
    primitive(shell, id(`entrance-lining:fascia:${edge}`), "steel", "panel",
      worldPoint(t, (liningWFrom + liningWTo) / 2, liningFasciaY),
      [0.08, 0.52, liningWSpan], SHELL_SILVER_SHADE,
      { rotation: liningRotation, bearsLoad: false, volume: 0.2,
        sideAttachmentReach: 1.2 });
  }
  for (const [edge, w] of [["inner", liningWFrom], ["outer", liningWTo]] as const) {
    primitive(shell, id(`entrance-lining:fascia:${edge}`), "steel", "panel",
      worldPoint((liningTFrom + liningTTo) / 2, w, liningFasciaY),
      [liningTSpan, 0.52, 0.08], SHELL_SILVER_SHADE,
      { rotation: liningRotation, bearsLoad: false, volume: 0.2,
        sideAttachmentReach: 1.2 });
  }
  primitive(shell, id("entrance-lining:sign-rail"), "steel", "panel",
    worldPoint(hallCentreT, FARE_LINE_W - 1.6, accessFloorTop + 2.99),
    [3.5, 0.2, 0.24], SHELL_SILVER_SHADE,
    { rotation: liningRotation, bearingArea: 0.8, volume: 0.08,
      carriesAttachments: true, attachmentSupportMode: "cable",
      sideAttachmentReach: 3 });

  const entranceDoorHalf = 1.8;
  const entranceDoorFromT = hallCentreT - entranceDoorHalf;
  const entranceDoorToT = hallCentreT + entranceDoorHalf;
  const entranceDoorTop = accessFloorTop + 2.72;

  const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
  const smoothstep = (value: number): number => {
    const x = clamp01(value);
    return x * x * (3 - 2 * x);
  };
  const mix = (from: number, to: number, amount: number): number =>
    from + (to - from) * amount;
  const lowered = (position: SceneVector3, amount: number): SceneVector3 =>
    [position[0], position[1] - amount, position[2]];

  const rampInnerW = STAIR_LANE - STAIR_WIDTH / 2 - 0.2;
  const rampOuterW = ESCALATOR_LANE + ESCALATOR_WIDTH / 2 + 0.2;
  const hallBlend = (t: number): number =>
    smoothstep((t - CORE_START_T) / (HALL_FROM_T + 2.2 - CORE_START_T));
  const accessFloorY = (t: number): number => {
    if (t <= DECK_TOP_T) {
      return PLATFORM_Y;
    }
    if (t >= CORE_START_T) {
      return accessFloorTop;
    }
    const descent = (t - DECK_TOP_T) / (CORE_START_T - DECK_TOP_T);
    return mix(PLATFORM_Y, accessFloorTop, descent);
  };
  const accessBaseW = (t: number, side: "inner" | "outer"): number => {
    const landingRelease = smoothstep((t - DECK_TOP_T) / 3.5);
    const core = side === "inner"
      ? mix(DECK_INNER + 0.14, rampInnerW, landingRelease)
      : mix(DECK_OUTER + 0.35, rampOuterW, landingRelease);
    const hallEdge = side === "inner" ? HALL_INNER + 0.05 : HALL_OUTER - 0.05;
    return mix(core, hallEdge, hallBlend(t));
  };
  const accessRoofW = (t: number, side: "inner" | "outer"): number => {
    if (side === "inner") {
      // В горловине эта точка ТОЧНО совпадает с внутренней кромкой
      // платформенной кровли; дальше рукав мягко становится самостоятельным.
      const independent = accessBaseW(t, side) + 0.42;
      const release = smoothstep((t - DECK_TOP_T) / 4);
      return mix(innerSkinW, independent, release);
    }
    return accessBaseW(t, side) - 0.52;
  };
  const accessSpringY = (t: number, side: "inner" | "outer"): number => {
    if (side === "inner" && t <= DECK_TOP_T) {
      return roofPoint(t, 1)[1];
    }
    return accessFloorY(t) + mix(3.18, 3.46, hallBlend(t));
  };
  const accessRoofPoint = (t: number, profile: number): SceneVector3 => {
    const innerY = accessSpringY(t, "inner");
    const outerY = accessSpringY(t, "outer");
    const w = mix(accessRoofW(t, "inner"), accessRoofW(t, "outer"), profile);
    const archRise = mix(2.12, 2.58, hallBlend(t));
    // В верхнем тамбуре это та же функция, которой вычислены торцы стоек
    // лифта. Так потолок и шахта не расходятся из-за двух похожих формул.
    const y = t <= DECK_TOP_T
      ? upperVestibuleRoofY(t, w)
      : mix(innerY, outerY, profile) + archRise * Math.sin(Math.PI * profile);
    return worldPoint(t, w, y);
  };
  const accessSidePoint = (
    t: number,
    side: "inner" | "outer",
    fraction: number,
  ): SceneVector3 => worldPoint(
    t,
    mix(accessBaseW(t, side), accessRoofW(t, side), fraction),
    mix(accessFloorY(t) + 0.04, accessSpringY(t, side), fraction),
  );
  const accessSideFractionAtY = (
    t: number,
    side: "inner" | "outer",
    y: number,
  ): number => clamp01(
    (y - accessFloorY(t) - 0.04)
      / (accessSpringY(t, side) - accessFloorY(t) - 0.04),
  );

  const accessRibTs = [
    entryFromT,
    (entryFromT + entryToT) / 2,
    entryToT,
    -10.5,
    -7,
    -3.5,
    0,
    3.5,
    CORE_START_T,
    HALL_FROM_T + 1.2,
    entranceDoorFromT,
    hallCentreT,
    entranceDoorToT,
    HALL_TO_T,
  ] as const;

  // Одна наклонная несущая плита объединяет лестницу и эскалатор. Её
  // верхняя грань проходит точно через отметки пола у нижнего и верхнего
  // концов марша; поэтому ступени, ограждения и оболочка имеют одну опору,
  // а под эскалатором больше нет второго бокового выхода наружу.
  const rampMiddleW = (rampInnerW + rampOuterW) / 2;
  const rampBottom = worldPoint(CORE_START_T, rampMiddleW, accessFloorTop);
  const rampTop = worldPoint(DECK_TOP_T, rampMiddleW, PLATFORM_Y);
  const rampDirection = minus(rampTop, rampBottom);
  const rampLength = lengthOf(rampDirection);
  const rawNormal = projectedReference(vertical, rampDirection);
  const normalLength = lengthOf(rawNormal) || 1;
  const rampNormal: SceneVector3 = [
    rawNormal[0] / normalLength,
    rawNormal[1] / normalLength,
    rawNormal[2] / normalLength,
  ];
  const rampThickness = 0.52;
  const rampCentre = midpoint(rampBottom, rampTop);
  primitive(shell, id("access:ramp-slab"), "concrete", "panel",
    [
      rampCentre[0] - rampNormal[0] * rampThickness / 2,
      rampCentre[1] - rampNormal[1] * rampThickness / 2,
      rampCentre[2] - rampNormal[2] * rampThickness / 2,
    ],
    [rampLength, rampThickness, rampOuterW - rampInnerW], CONCRETE_DEEP,
    { rotation: orient(rampDirection, vertical), bearingArea: 32,
      volume: rampLength * (rampOuterW - rampInnerW) * rampThickness,
      carriesAttachments: true, attachmentSupportMode: "wall",
      sideAttachmentReach: 1.4, contactBearingOrder: true });

  // Каркас рукава теперь начинается на общей плите/площадке, а не тянет
  // каждую фасадную стойку до земли. Арка начинается ровно в конце ноги:
  // это одна координатная цепь, а не три близко поставленные детали.
  for (let rib = 0; rib < accessRibTs.length; rib += 1) {
    const t = accessRibTs[rib];
    const endRib = rib === 0 || rib === accessRibTs.length - 1;
    const width = endRib ? 0.38 : 0.22;
    const depth = endRib ? 0.46 : 0.28;
    for (const side of ["inner", "outer"] as const) {
      const roofProfile = side === "inner" ? 0 : 1;
      addMember(
        `access:rib:${rib}:leg:${side}`,
        accessSidePoint(t, side, 0),
        accessRoofPoint(t, roofProfile),
        along,
        width,
        depth,
      );
    }
    for (let segment = 0; segment < STATION_ACCESS_PROFILE_SEGMENTS; segment += 1) {
      addMember(
        `access:rib:${rib}:arch:${segment}`,
        accessRoofPoint(t, segment / STATION_ACCESS_PROFILE_SEGMENTS),
        accessRoofPoint(t, (segment + 1) / STATION_ACCESS_PROFILE_SEGMENTS),
        along,
        width,
        depth,
      );
    }
  }

  for (let bay = 0; bay + 1 < accessRibTs.length; bay += 1) {
    const fromT = accessRibTs[bay];
    const toT = accessRibTs[bay + 1];
    for (let profile = 0; profile <= STATION_ACCESS_PROFILE_SEGMENTS; profile += 1) {
      addMember(
        `access:roof-run:${bay}:${profile}`,
        accessRoofPoint(fromT, profile / STATION_ACCESS_PROFILE_SEGMENTS),
        accessRoofPoint(toT, profile / STATION_ACCESS_PROFILE_SEGMENTS),
        inward,
        profile === 0 || profile === STATION_ACCESS_PROFILE_SEGMENTS ? 0.2 : 0.12,
        profile === 0 || profile === STATION_ACCESS_PROFILE_SEGMENTS ? 0.26 : 0.16,
      );
    }
    for (let segment = 0; segment < STATION_ACCESS_PROFILE_SEGMENTS; segment += 1) {
      const fromProfile = segment / STATION_ACCESS_PROFILE_SEGMENTS;
      const toProfile = (segment + 1) / STATION_ACCESS_PROFILE_SEGMENTS;
      const p00 = accessRoofPoint(fromT, fromProfile);
      const p01 = accessRoofPoint(fromT, toProfile);
      const p10 = accessRoofPoint(toT, fromProfile);
      const p11 = accessRoofPoint(toT, toProfile);
      addFacet(
        `access:roof-skin:${bay}:${segment}`,
        p00, p01, p10, p11,
        "steel",
        (bay + segment) % 3 === 1 ? SHELL_SILVER_SHADE : SHELL_SILVER,
        0.12,
        1.8,
      );
      // Подшивка повторяет наружную фасетную геометрию. Плоской плиты,
      // способной выглянуть через наклонную кровлю, здесь больше нет.
      addFacet(
        `access:ceiling-skin:${bay}:${segment}`,
        lowered(p00, ACCESS_CEILING_DROP), lowered(p01, ACCESS_CEILING_DROP),
        lowered(p10, ACCESS_CEILING_DROP), lowered(p11, ACCESS_CEILING_DROP),
        "steel",
        (bay + segment) % 5 === 2 ? TEAL : WHITE_PANEL,
        ACCESS_CEILING_THICKNESS,
        1.8,
      );
    }
  }

  // Свет спуска идёт по геометрии фасетного потолка. Для каждого прибора
  // нормаль вычисляется из двух касательных той же поверхности, поэтому он
  // лежит на подшивке и не пробивает декоративную крышу ни на одном изгибе.
  for (let lamp = 0; lamp < 4; lamp += 1) {
    const t = mix(DECK_TOP_T, CORE_START_T, (lamp + 0.5) / 4);
    const roof = accessRoofPoint(t, 0.5);
    const tangent = minus(
      accessRoofPoint(t + 0.12, 0.5),
      accessRoofPoint(t - 0.12, 0.5),
    );
    const across = minus(
      accessRoofPoint(t, 0.54),
      accessRoofPoint(t, 0.46),
    );
    const rawNormal: SceneVector3 = [
      tangent[1] * across[2] - tangent[2] * across[1],
      tangent[2] * across[0] - tangent[0] * across[2],
      tangent[0] * across[1] - tangent[1] * across[0],
    ];
    const normalLength = lengthOf(rawNormal) || 1;
    const normalSign = rawNormal[1] < 0 ? -1 : 1;
    const upwardNormal: SceneVector3 = [
      rawNormal[0] * normalSign / normalLength,
      rawNormal[1] * normalSign / normalLength,
      rawNormal[2] * normalSign / normalLength,
    ];
    const ceilingSurface = lowered(roof, ACCESS_CEILING_DROP);
    const fixtureOffset = ACCESS_CEILING_THICKNESS / 2 + 0.06;
    const fixtureCentre: SceneVector3 = [
      ceilingSurface[0] - upwardNormal[0] * fixtureOffset,
      ceilingSurface[1] - upwardNormal[1] * fixtureOffset,
      ceilingSurface[2] - upwardNormal[2] * fixtureOffset,
    ];
    primitive(shell, id(`access:lamp:${lamp}`), "steel", "panel",
      fixtureCentre, [1.8, 0.12, 0.38], WHITE_PANEL,
      {
        rotation: orient(tangent, upwardNormal),
        bearsLoad: false,
        volume: 0.04,
        sideAttachmentReach: 0.5,
        light: {
          color: STATION_LIGHT_COLOR,
          distance: 15,
          intensity: 4.2,
          position: [0, -0.3, 0],
          dayIntensityFactor: STATION_LIGHT_DAY_FACTOR,
          poolPriority: 4,
          localPoolCapacity: STATION_LIGHT_POOL_CAPACITY,
          poolGroupId: id("lighting:access"),
          transition: STATION_LIGHT_TRANSITION,
        },
      });
  }

  // Боковые стёкла режутся по тем же t-сечениям, что и каркас. В горловине
  // к платформе внутренняя сторона открыта полностью; у наземной двери во
  // внешней стороне остаётся лишь фрамуга выше чистого прохода.
  const accessSideBands = [0, 0.34, 0.67, 1] as const;
  for (let bay = 0; bay + 1 < accessRibTs.length; bay += 1) {
    const fromT = accessRibTs[bay];
    const toT = accessRibTs[bay + 1];
    for (const side of ["inner", "outer"] as const) {
      const middleT = (fromT + toT) / 2;
      const platformOpening = side === "inner"
        && middleT > entryFromT && middleT < entryToT;
      const streetOpening = side === "outer"
        && middleT > entranceDoorFromT && middleT < entranceDoorToT;
      const openingFrom = platformOpening
        ? 1
        : streetOpening
          ? accessSideFractionAtY(fromT, side, entranceDoorTop)
          : 0;
      const openingTo = platformOpening
        ? 1
        : streetOpening
          ? accessSideFractionAtY(toT, side, entranceDoorTop)
          : 0;

      for (let band = 0; band + 1 < accessSideBands.length; band += 1) {
        const bandFrom = accessSideBands[band];
        const bandTo = accessSideBands[band + 1];
        const lowerFrom = Math.max(bandFrom, openingFrom);
        const lowerTo = Math.max(bandFrom, openingTo);
        if (lowerFrom >= bandTo - 0.01 && lowerTo >= bandTo - 0.01) {
          continue;
        }
        addFacet(
          `access:side:${side}:${bay}:${band}`,
          accessSidePoint(fromT, side, Math.min(lowerFrom, bandTo - 0.005)),
          accessSidePoint(fromT, side, bandTo),
          accessSidePoint(toT, side, Math.min(lowerTo, bandTo - 0.005)),
          accessSidePoint(toT, side, bandTo),
          band === 0 ? "steel" : "glass",
          band === 0 ? SHELL_SKIRT : SHELL_GLASS,
          band === 0 ? 0.13 : 0.09,
          1.8,
        );
      }
      for (const [rail, fraction] of [0.34, 0.67].entries()) {
        if (platformOpening || (streetOpening
          && accessSidePoint(middleT, side, fraction)[1] < entranceDoorTop + 0.04)) {
          continue;
        }
        addMember(
          `access:side-rail:${side}:${bay}:${rail}`,
          accessSidePoint(fromT, side, fraction),
          accessSidePoint(toT, side, fraction),
          inward,
          0.1,
          0.12,
          false,
        );
      }
    }
  }

  // Оба глухих торца закрыты витражом по реальному контуру арки. Верхний
  // торец — та самая отсутствовавшая задняя стенка предварительного тамбура;
  // проход на платформу остаётся в его внутренней боковой стене.
  const accessEndBands = [0, 0.28, 0.62, 1] as const;
  const accessEndProfileSegments = STATION_ACCESS_PROFILE_SEGMENTS * 3;
  const addAccessEnd = (end: "top" | "ground", accessEndT: number): void => {
    for (let segment = 0; segment < accessEndProfileSegments; segment += 1) {
      const fromProfile = segment / accessEndProfileSegments;
      const toProfile = (segment + 1) / accessEndProfileSegments;
      const bottomAt = (profile: number): SceneVector3 => worldPoint(
        accessEndT,
        mix(
          accessBaseW(accessEndT, "inner"),
          accessBaseW(accessEndT, "outer"),
          profile,
        ),
        accessFloorY(accessEndT) + 0.04,
      );
      const verticalPoint = (profile: number, fraction: number): SceneVector3 => {
        const bottom = bottomAt(profile);
        const roof = accessRoofPoint(accessEndT, profile);
        return [
          mix(bottom[0], roof[0], fraction),
          mix(bottom[1], roof[1] - 0.08, fraction),
          mix(bottom[2], roof[2], fraction),
        ];
      };
      for (let band = 0; band + 1 < accessEndBands.length; band += 1) {
        const fromBand = accessEndBands[band];
        const toBand = accessEndBands[band + 1];
        addFacet(
          `access:end:${end}:${segment}:${band}`,
          verticalPoint(fromProfile, fromBand),
          verticalPoint(fromProfile, toBand),
          verticalPoint(toProfile, fromBand),
          verticalPoint(toProfile, toBand),
          band === 0 ? "steel" : "glass",
          band === 0 ? SHELL_SKIRT : SHELL_GLASS,
          band === 0 ? 0.13 : 0.09,
          5.2,
        );
      }
      if (segment > 0 && segment % 3 === 0) {
        addMember(
          `access:end-mullion:${end}:${segment}`,
          verticalPoint(fromProfile, 0),
          verticalPoint(fromProfile, 1),
          along,
          0.1,
          0.13,
          false,
        );
      }
    }
  };
  addAccessEnd("top", accessRibTs[0]);
  addAccessEnd("ground", accessRibTs[accessRibTs.length - 1]);

  // Наземный вход — короткий поперечный рукав, а не прямоугольный навес.
  // Его корневая арка совпадает с кромкой дверного выреза основной оболочки,
  // затем портал становится ниже и уже, образуя узнаваемый «нос».
  const portalBaseWs = [
    accessBaseW(hallCentreT, "outer"),
    HALL_OUTER + 4.35,
  ] as const;
  const portalRoofWs = [
    accessRoofW(hallCentreT, "outer"),
    HALL_OUTER + 3.9,
  ] as const;
  const portalHalfWidths = [entranceDoorHalf, 1.58] as const;
  const portalSpringYs = [
    accessSpringY(hallCentreT, "outer"),
    accessFloorTop + 2.72,
  ] as const;
  const portalArchRises = [1.62, 1.2] as const;
  const portalRoofPoint = (frameIndex: number, profile: number): SceneVector3 =>
    worldPoint(
      mix(
        hallCentreT - portalHalfWidths[frameIndex],
        hallCentreT + portalHalfWidths[frameIndex],
        profile,
      ),
      portalRoofWs[frameIndex],
      portalSpringYs[frameIndex]
        + portalArchRises[frameIndex] * Math.sin(Math.PI * profile),
    );
  const portalSidePoint = (
    frameIndex: number,
    side: -1 | 1,
    fraction: number,
  ): SceneVector3 => {
    const baseT = hallCentreT + side * portalHalfWidths[frameIndex];
    const roof = portalRoofPoint(frameIndex, side < 0 ? 0 : 1);
    return [
      mix(worldPoint(baseT, portalBaseWs[frameIndex], accessFloorTop + 0.04)[0], roof[0], fraction),
      mix(accessFloorTop + 0.04, roof[1], fraction),
      mix(worldPoint(baseT, portalBaseWs[frameIndex], accessFloorTop + 0.04)[2], roof[2], fraction),
    ];
  };

  for (let portal = 0; portal < STATION_ENTRANCE_PORTAL_FRAMES; portal += 1) {
    const endPortal = portal === STATION_ENTRANCE_PORTAL_FRAMES - 1;
    for (const side of [-1, 1] as const) {
      addMember(
        `portal:rib:${portal}:leg:${side < 0 ? "a" : "b"}`,
        portalSidePoint(portal, side, 0),
        portalSidePoint(portal, side, 1),
        inward,
        endPortal ? 0.34 : 0.22,
        endPortal ? 0.42 : 0.28,
      );
    }
    for (let segment = 0; segment < STATION_ACCESS_PROFILE_SEGMENTS; segment += 1) {
      addMember(
        `portal:rib:${portal}:arch:${segment}`,
        portalRoofPoint(portal, segment / STATION_ACCESS_PROFILE_SEGMENTS),
        portalRoofPoint(portal, (segment + 1) / STATION_ACCESS_PROFILE_SEGMENTS),
        inward,
        endPortal ? 0.34 : 0.22,
        endPortal ? 0.42 : 0.28,
      );
    }
  }
  for (let bay = 0; bay + 1 < STATION_ENTRANCE_PORTAL_FRAMES; bay += 1) {
    for (let profile = 0; profile <= STATION_ACCESS_PROFILE_SEGMENTS; profile += 1) {
      addMember(
        `portal:roof-run:${bay}:${profile}`,
        portalRoofPoint(bay, profile / STATION_ACCESS_PROFILE_SEGMENTS),
        portalRoofPoint(bay + 1, profile / STATION_ACCESS_PROFILE_SEGMENTS),
        along,
        profile === 0 || profile === STATION_ACCESS_PROFILE_SEGMENTS ? 0.18 : 0.11,
        profile === 0 || profile === STATION_ACCESS_PROFILE_SEGMENTS ? 0.24 : 0.15,
      );
    }
    for (let segment = 0; segment < STATION_ACCESS_PROFILE_SEGMENTS; segment += 1) {
      const fromProfile = segment / STATION_ACCESS_PROFILE_SEGMENTS;
      const toProfile = (segment + 1) / STATION_ACCESS_PROFILE_SEGMENTS;
      addFacet(
        `portal:roof-skin:${bay}:${segment}`,
        portalRoofPoint(bay, fromProfile),
        portalRoofPoint(bay, toProfile),
        portalRoofPoint(bay + 1, fromProfile),
        portalRoofPoint(bay + 1, toProfile),
        "steel",
        (bay + segment) % 2 === 0 ? SHELL_SILVER : SHELL_SILVER_SHADE,
        0.12,
        1.8,
      );
    }
    for (const side of [-1, 1] as const) {
      for (let band = 0; band < 3; band += 1) {
        const from = band / 3;
        const to = (band + 1) / 3;
        addFacet(
          `portal:cheek:${bay}:${side < 0 ? "a" : "b"}:${band}`,
          portalSidePoint(bay, side, from),
          portalSidePoint(bay, side, to),
          portalSidePoint(bay + 1, side, from),
          portalSidePoint(bay + 1, side, to),
          band === 0 ? "steel" : "glass",
          band === 0 ? SHELL_SKIRT : SHELL_GLASS,
          band === 0 ? 0.13 : 0.09,
          1.8,
        );
      }
    }
  }

  // Торцевые витражи. Проём шириной 3.6 м и высотой 3.35 м оставлен для
  // состава; над ним остаётся стеклянная фрамуга внутри большой белой арки.
  const portalHalfWidth = 1.8;
  const portalTop = PLATFORM_Y + 3.35;
  const endGlassSlices = STATION_SHELL_PROFILE_SEGMENTS * 12;
  for (const [end, t] of [["a", ribTs[0]], ["b", ribTs[ribTs.length - 1]]] as const) {
    // Стекло стоит за лицом торцевой рамы, а не в её осевой плоскости.
    // Прозрачная толщина поэтому не выглядывает сбоку ни на одном торце.
    const glassT = t + (end === "a" ? 0.16 : -0.16);
    // Узкие вертикальные полотна заканчиваются НИЖЕ соответствующего отрезка
    // арки. Большой прямоугольник по средней высоте неизбежно высовывал один
    // верхний угол наружу. Границы поездного проёма включены в сетку точно.
    const portalProfiles = [-portalHalfWidth, portalHalfWidth].map((w) =>
      (w - outerSkinW) / (innerSkinW - outerSkinW));
    const endProfiles = [...new Set([
      ...Array.from(
        { length: endGlassSlices + 1 },
        (_, index) => index / endGlassSlices,
      ),
      ...portalProfiles,
    ])].filter((profile) => profile >= 0 && profile <= 1)
      .sort((left, right) => left - right);
    for (let pane = 0; pane + 1 < endProfiles.length; pane += 1) {
      const fromProfile = endProfiles[pane];
      const toProfile = endProfiles[pane + 1];
      const fromRoof = roofPoint(t, fromProfile);
      const toRoof = roofPoint(t, toProfile);
      const fromW = outerSkinW + (innerSkinW - outerSkinW) * fromProfile;
      const toW = outerSkinW + (innerSkinW - outerSkinW) * toProfile;
      const middleW = (fromW + toW) / 2;
      const roofY = Math.min(fromRoof[1], toRoof[1]) - 0.12;
      const inTrackPortal = Math.abs(middleW) < portalHalfWidth;
      const bottomY = inTrackPortal ? portalTop : PLATFORM_Y + 0.04;
      if (roofY <= bottomY + 0.15) {
        continue;
      }
      const left = worldPoint(glassT, fromW, bottomY);
      const right = worldPoint(glassT, toW, bottomY);
      const upperLeft = worldPoint(glassT, fromW, roofY);
      const upperRight = worldPoint(glassT, toW, roofY);
      addFacet(
        `end-glass:${end}:${pane}`,
        left,
        upperLeft,
        right,
        upperRight,
        "glass",
        SHELL_GLASS,
        0.12,
        1.5,
      );
      // Прямоугольное стекло заканчивается по нижней из двух точек кривой,
      // иначе верхний угол вылезает сквозь кровлю. После мелкой нарезки
      // оставшийся клин не превышает 12 см и полностью прячется за этой
      // непрерывной серой фасцией, идущей по фактической кромке ската.
      addMember(
        `end-roof-fascia:${end}:${pane}`,
        worldPoint(glassT, fromW, fromRoof[1] - 0.12),
        worldPoint(glassT, toW, toRoof[1] - 0.12),
        along,
        0.22,
        0.16,
        false,
        SHELL_SILVER_SHADE,
      );
    }
    for (let mullion = 1; mullion < STATION_SHELL_PROFILE_SEGMENTS; mullion += 1) {
      const profile = mullion / STATION_SHELL_PROFILE_SEGMENTS;
      const w = outerSkinW + (innerSkinW - outerSkinW) * profile;
      const bottomY = Math.abs(w) < portalHalfWidth
        ? portalTop
        : PLATFORM_Y + 0.04;
      const topY = roofPoint(t, profile)[1] - 0.1;
      if (topY > bottomY + 0.12) {
        addMember(
          `end-mullion:${end}:${mullion}`,
          worldPoint(t, w, bottomY),
          worldPoint(t, w, topY),
          along,
          0.11,
          0.14,
          false,
        );
      }
    }
    const portalLeft = worldPoint(t, -portalHalfWidth, PLATFORM_Y + 0.02);
    const portalRight = worldPoint(t, portalHalfWidth, PLATFORM_Y + 0.02);
    const portalUpperLeft = worldPoint(t, -portalHalfWidth, portalTop);
    const portalUpperRight = worldPoint(t, portalHalfWidth, portalTop);
    addMember(`track-portal:${end}:left`, portalLeft, portalUpperLeft, along, 0.2, 0.24, false);
    addMember(`track-portal:${end}:right`, portalRight, portalUpperRight, along, 0.2, 0.24, false);
    const leftPortalProfile = (-portalHalfWidth - outerSkinW) / (innerSkinW - outerSkinW);
    const rightPortalProfile = (portalHalfWidth - outerSkinW) / (innerSkinW - outerSkinW);
    addMember(
      `track-portal:${end}:upper-left`,
      portalUpperLeft,
      worldPoint(t, -portalHalfWidth, roofPoint(t, leftPortalProfile)[1] - 0.12),
      along,
      0.18,
      0.22,
      false,
    );
    addMember(
      `track-portal:${end}:upper-right`,
      portalUpperRight,
      worldPoint(t, portalHalfWidth, roofPoint(t, rightPortalProfile)[1] - 0.12),
      along,
      0.18,
      0.22,
      false,
    );
    addMember(`track-portal:${end}:header`, portalUpperLeft, portalUpperRight, vertical,
      0.2, 0.24, false);

    // Верх продольной платформенной стены находится в другой плоскости,
    // чем торцевое стекло (разница равна заглублению витража). Нижняя часть
    // стыка закрыта самой стеной, а выше её пояса раньше оставалась высокая
    // щель. Этот короткий стеклянный возврат замыкает угол до ската; стойка
    // стоит именно в линии сгиба двух стёкол.
    const screenProfile = (PLATFORM_SCREEN_LINE - outerSkinW)
      / (innerSkinW - outerSkinW);
    const cornerBottomY = PLATFORM_Y + CANOPY_HEIGHT;
    const cornerFromBottom = worldPoint(glassT, PLATFORM_SCREEN_LINE, cornerBottomY);
    const cornerFromTop = worldPoint(
      glassT,
      PLATFORM_SCREEN_LINE,
      roofPoint(glassT, screenProfile)[1] - 0.12,
    );
    const cornerToBottom = worldPoint(t, PLATFORM_SCREEN_LINE, cornerBottomY);
    const cornerToTop = worldPoint(
      t,
      PLATFORM_SCREEN_LINE,
      roofPoint(t, screenProfile)[1] - 0.12,
    );
    addFacet(
      `platform-corner-return:${end}`,
      cornerFromBottom,
      cornerFromTop,
      cornerToBottom,
      cornerToTop,
      "glass",
      SHELL_GLASS,
      0.1,
      1.2,
    );
    addMember(
      `platform-corner-post:${end}`,
      cornerFromBottom,
      cornerFromTop,
      along,
      0.14,
      0.16,
      false,
    );
    // Нижняя балка идёт под обоими боковыми витражами. Проезд состава между
    // -1.8 и +1.8 остаётся полностью свободным.
    const sillY = PLATFORM_Y + 0.1;
    addMember(
      `track-portal:${end}:sill:outer`,
      worldPoint(t, outerSkinW, sillY),
      worldPoint(t, -portalHalfWidth, sillY),
      vertical,
      0.2,
      0.24,
      false,
    );
    addMember(
      `track-portal:${end}:sill:inner`,
      worldPoint(t, portalHalfWidth, sillY),
      worldPoint(t, innerSkinW, sillY),
      vertical,
      0.2,
      0.24,
      false,
    );
  }
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
    createCanopy(canopy, frame, id, station.id === STATION_SHELL_PROTOTYPE);
    createPlatformFittings(
      fittings,
      frame,
      id,
      station.id === STATION_SHELL_PROTOTYPE,
    );
    createConcourse(
      concourse,
      frame,
      id,
      station.id === STATION_SHELL_PROTOTYPE,
    );
    createSignage(
      fittings,
      frame,
      id,
      station.id === STATION_SHELL_PROTOTYPE,
    );
    if (station.id === STATION_SHELL_PROTOTYPE) {
      createStationShellPrototype(canopy, frame);
    }
    void RING_STRAIGHT_LENGTH;
  }
}
