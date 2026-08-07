import type { SceneVector3 } from "./destructionScene.ts";
import {
  HEXACOPTER_LIFT_CENTRE,
  HEXACOPTER_MOORING_POINT,
  HEXACOPTER_NOSE,
  HEXACOPTER_ORIGIN,
  HEXACOPTER_PAD_TOP_Y,
  HEXACOPTER_PAD_X,
  HEXACOPTER_PAD_Z,
  HEXACOPTER_RUDDER_POINT,
  hexacopterPoint,
  isInsideHexacopter,
} from "./townHexacopter.ts";

/**
 * HX-6 на полигоне Tonkawa (фишка №1, вердикт Igor 07.08.2026): пассажирский
 * гексакоптер перенесён из города на плоский стальной мир, где нет ни
 * застройки, ни других потребителей кадра — наблюдение за исполнением
 * траектории (HUD-диск, amber-трасса, сама машина) не замусорено ни FPS, ни
 * городskim рельефом. Перенос — ЧИСТАЯ ТРАНСЛЯЦИЯ (yaw 0): нос машины, как и
 * в городе, смотрит на запад — с восточного края диска это взгляд в центр
 * полигона.
 *
 * Паттерн повторяет nimbusHexacopter.ts, но без поворота: одна константа
 * смещения, и любая точка города переезжает одной суммой.
 */
export const RANGE_HEXACOPTER_PAD_ID = "range-vertipad";
export const RANGE_HEXACOPTER_CLUSTER_ID =
  "combat-hexacopter-range:vertipad:hexacopter";

/** Пад на восточном краю диска, RAX стоит в центре — между ними ~33 м. */
export const RANGE_HEXACOPTER_PAD_X = 30;
export const RANGE_HEXACOPTER_PAD_Z = -14;
/** Палуба полигона — стальные плиты толщиной 0.08; пад стоит на них. */
export const RANGE_DECK_TOP_Y = 0.08;

const OFFSET: SceneVector3 = [
  RANGE_HEXACOPTER_PAD_X - HEXACOPTER_PAD_X,
  RANGE_DECK_TOP_Y,
  RANGE_HEXACOPTER_PAD_Z - HEXACOPTER_PAD_Z,
];

export const RANGE_HEXACOPTER_PAD_TOP_Y =
  HEXACOPTER_PAD_TOP_Y + RANGE_DECK_TOP_Y;

export function rangeHexacopterPointFromTown(
  point: SceneVector3,
): SceneVector3 {
  return [point[0] + OFFSET[0], point[1] + OFFSET[1], point[2] + OFFSET[2]];
}

export function rangeHexacopterPoint(
  forward: number,
  starboard: number,
  sourceY: number,
): SceneVector3 {
  return rangeHexacopterPointFromTown(
    hexacopterPoint(forward, starboard, sourceY),
  );
}

function townPointFromRange(point: SceneVector3): SceneVector3 {
  return [point[0] - OFFSET[0], point[1] - OFFSET[1], point[2] - OFFSET[2]];
}

export function isInsideRangeHexacopter(point: SceneVector3): boolean {
  return isInsideHexacopter(townPointFromRange(point));
}

/** Нос не вращался — это тот же западный нос города. */
export const RANGE_HEXACOPTER_NOSE = HEXACOPTER_NOSE;
export const RANGE_HEXACOPTER_ORIGIN =
  rangeHexacopterPointFromTown(HEXACOPTER_ORIGIN);
export const RANGE_HEXACOPTER_LIFT_CENTRE =
  rangeHexacopterPointFromTown(HEXACOPTER_LIFT_CENTRE);
export const RANGE_HEXACOPTER_MOORING_POINT =
  rangeHexacopterPointFromTown(HEXACOPTER_MOORING_POINT);
export const RANGE_HEXACOPTER_RUDDER_POINT =
  rangeHexacopterPointFromTown(HEXACOPTER_RUDDER_POINT);
