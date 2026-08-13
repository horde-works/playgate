// SPDX-License-Identifier: CC-BY-NC-ND-4.0
// SPDX-FileCopyrightText: 2026 Igor Kirisiuk
//
// Единственный источник координат крупных объектов острова. Он не зависит
// ни от плана дорог, ни от генератора ландшафта: поэтому и здание, и его
// резерв, и просека в зелёном поясе всегда переезжают одной операцией.

export type LayoutPoint = readonly [x: number, z: number];

export type AstanaSiteStatus =
  | "built"
  | "protected-reserve"
  | "primary-reserve"
  | "secondary-reserve"
  | "experimental-reserve";

export interface AstanaLandmarkSite {
  readonly id: string;
  readonly center: LayoutPoint;
  /** Полуразмеры всего композиционного резерва, а не только здания. */
  readonly radius: LayoutPoint;
  /** Поворот главной продольной оси в плане, от +x к +z. */
  readonly rotation?: number;
  readonly status: AstanaSiteStatus;
  readonly clearVegetation?: boolean;
  /** Пятно держится собственной конструкцией над долиной, а не на грунте. */
  readonly elevated?: boolean;
}

export const BAITEREK_CENTRE = [0, 0] as const;

function unit([x, z]: LayoutPoint): LayoutPoint {
  const length = Math.hypot(x, z);
  return [x / length, z / length];
}

function onAxis(direction: LayoutPoint, distance: number): LayoutPoint {
  return [direction[0] * distance, direction[1] * distance];
}

/**
 * Две композиционные оси существовали до полуостровов. Их направления
 * зафиксированы прежними центрами, поэтому перенос доминант меняет только
 * расстояние от Байтерека, но не географический компас и не городской жест.
 */
export const CAPITAL_AXIS_DIRECTION = unit([49, -41]);
export const MEMORY_EXPO_AXIS_DIRECTION = unit([-43, -58]);

/**
 * Градостроительный профиль внешних доминант. Кольцо ЛРТ остаётся на
 * радиусе 98 м; его настил шириной 8.6 м заканчивается на 102.3 м. Каждый
 * следующий разрыв измеряется от этой внешней кромки до реального корпуса
 * или полного построенного комплекса, а не до центра участка.
 */
export const LRT_OUTER_DECK_EDGE_RADIUS = 98 + 8.6 / 2;
export const LANDMARK_LRT_CLEARANCES = {
  khan: 40,
  pyramid: 32,
  expo: 35,
  virginLands: 34,
} as const;
export const LANDMARK_RADIAL_HALF_EXTENTS = {
  // Полный бетонный овал Хан Шатыра, включая принятую площадку.
  khan: 25.5,
  // Реальное основание Пирамиды 24 × 24 м без удалённого подиума.
  pyramid: 12,
  // Сфера вместе с четырьмя низкими павильонами EXPO.
  expo: 22,
  // Радиальная половина 34-метровой глубины самого Дворца.
  virginLands: 17,
} as const;
export const KHAN_SHATYR_DISTANCE = LRT_OUTER_DECK_EDGE_RADIUS
  + LANDMARK_LRT_CLEARANCES.khan + LANDMARK_RADIAL_HALF_EXTENTS.khan;
export const PYRAMID_DISTANCE = LRT_OUTER_DECK_EDGE_RADIUS
  + LANDMARK_LRT_CLEARANCES.pyramid + LANDMARK_RADIAL_HALF_EXTENTS.pyramid;
export const NUR_ALEM_DISTANCE = LRT_OUTER_DECK_EDGE_RADIUS
  + LANDMARK_LRT_CLEARANCES.expo + LANDMARK_RADIAL_HALF_EXTENTS.expo;
export const VIRGIN_LANDS_PALACE_DISTANCE = LRT_OUTER_DECK_EDGE_RADIUS
  + LANDMARK_LRT_CLEARANCES.virginLands
  + LANDMARK_RADIAL_HALF_EXTENTS.virginLands;

/**
 * Ось Атырау — Байтерек — Хан Шатыр. Мост лежит на северо-западном луче,
 * шатёр — на точном продолжении той же линии к юго-востоку.
 */
export const KHAN_SHATYR_CENTRE = onAxis(
  CAPITAL_AXIS_DIRECTION,
  KHAN_SHATYR_DISTANCE,
);
const khanFrontX = BAITEREK_CENTRE[0] - KHAN_SHATYR_CENTRE[0];
const khanFrontZ = BAITEREK_CENTRE[1] - KHAN_SHATYR_CENTRE[1];
export const KHAN_SHATYR_YAW = Math.atan2(khanFrontZ, khanFrontX);

/**
 * Географический компас острова. Геометрия карты не вращается: её истинный
 * восток задаётся визуальной осью Байтерек → Хан Шатыр, а истинный север —
 * строго перпендикулярным ей вектором. Солнце и кибла используют только этот
 * базис; координаты зданий, реки и ЛРТ остаются прежними.
 */
const visualEastLength = Math.hypot(
  KHAN_SHATYR_CENTRE[0] - BAITEREK_CENTRE[0],
  KHAN_SHATYR_CENTRE[1] - BAITEREK_CENTRE[1],
);
export const ASTANA_TRUE_EAST_VECTOR = [
  (KHAN_SHATYR_CENTRE[0] - BAITEREK_CENTRE[0]) / visualEastLength,
  (KHAN_SHATYR_CENTRE[1] - BAITEREK_CENTRE[1]) / visualEastLength,
] as const;
export const ASTANA_TRUE_NORTH_VECTOR = [
  -ASTANA_TRUE_EAST_VECTOR[1],
  ASTANA_TRUE_EAST_VECTOR[0],
] as const;
export const ASTANA_TRUE_NORTH_SCENE_BEARING_DEGREES = (
  Math.atan2(ASTANA_TRUE_NORTH_VECTOR[0], ASTANA_TRUE_NORTH_VECTOR[1])
  * 180 / Math.PI + 360
) % 360;
export const ASTANA_LATITUDE_DEGREES = 51.1694;

/**
 * Локальная система цветочного бульвара. `along` идёт от Байтерека к Хан
 * Шатыру, `across` — поперёк оси. Все дорожки, клумбы и фонари считаются из
 * этих двух векторов, поэтому они не могут разъехаться при перестановке
 * шатра.
 */
export const NURZHOL_ALONG_VECTOR = ASTANA_TRUE_EAST_VECTOR;
export const NURZHOL_ACROSS_VECTOR = ASTANA_TRUE_NORTH_VECTOR;
export const NURZHOL_PLAN_ROTATION = Math.atan2(
  NURZHOL_ALONG_VECTOR[1],
  NURZHOL_ALONG_VECTOR[0],
);
// 35 см технологического допуска выводят точную плиту за внешний край
// полуметровых клеток круглого партера: поверхности сходятся торцами и не
// лежат одна на другой.
export const NURZHOL_START = 16.35;
export const NURZHOL_END = 38;
export const NURZHOL_LANE_OFFSET = 2.35;
export const NURZHOL_LANE_HALF_WIDTH = 0.95;
export const NURZHOL_BED_HALF_WIDTH = 1.28;
export const NURZHOL_BED_SEGMENTS = [
  [17.1, 22.15],
  [23.65, 30.05],
  [31.55, 37.35],
] as const;
export const NURZHOL_CROSSINGS = [22.9, 30.8] as const;

export function nurzholPoint(along: number, across = 0): LayoutPoint {
  return [
    BAITEREK_CENTRE[0]
      + NURZHOL_ALONG_VECTOR[0] * along
      + NURZHOL_ACROSS_VECTOR[0] * across,
    BAITEREK_CENTRE[1]
      + NURZHOL_ALONG_VECTOR[1] * along
      + NURZHOL_ACROSS_VECTOR[1] * across,
  ];
}

/**
 * Базовое направление вторичных зданий: длинная сторона идёт по касательной
 * к условной окружности вокруг Байтерека. Небольшой типологический `bias`
 * не даёт плану превратиться ни в веер, ни в параллельный строй к Есилю.
 */
export function compositionTangentYaw(
  centre: LayoutPoint,
  biasDegrees = 0,
): number {
  return Math.atan2(
    centre[1] - BAITEREK_CENTRE[1],
    centre[0] - BAITEREK_CENTRE[0],
  ) + Math.PI / 2 + biasDegrees * Math.PI / 180;
}

/** Перевод географического азимута в неизменённые координаты сцены. */
export function astanaGeographicBearingVector(
  bearingDegrees: number,
): LayoutPoint {
  const bearing = bearingDegrees * Math.PI / 180;
  return [
    ASTANA_TRUE_EAST_VECTOR[0] * Math.sin(bearing)
      + ASTANA_TRUE_NORTH_VECTOR[0] * Math.cos(bearing),
    ASTANA_TRUE_EAST_VECTOR[1] * Math.sin(bearing)
      + ASTANA_TRUE_NORTH_VECTOR[1] * Math.cos(bearing),
  ];
}

/**
 * Геодезический азимут Астана → Кааба: от истинного севера по часовой
 * стрелке. Он хранится отдельно от композиции острова: план не вправе
 * «докрутить» мечеть ради красивой улицы.
 */
export const PYRAMID_CENTRE = onAxis(
  CAPITAL_AXIS_DIRECTION,
  -PYRAMID_DISTANCE,
);
export const PYRAMID_YAW = NURZHOL_PLAN_ROTATION + Math.PI / 2;

/**
 * Южный фасад Нуржола. Опера стоит точно напротив середины цветочной части:
 * её длинный фасад параллелен бульвару, а фронтон смотрит к его оси. После
 * визуальной проверки корпус отнесён назад ещё на собственную полную
 * глубину 14 м. Арка не стоит перед фасадом: она находится справа от Оперы
 * на той же линии застройки.
 */
export const OPERA_NURZHOL_ALONG = (NURZHOL_START + NURZHOL_END) / 2;
export const OPERA_BODY_DEPTH = 14;
export const OPERA_NURZHOL_ACROSS = -18.5 - OPERA_BODY_DEPTH;
export const OPERA_CENTRE = nurzholPoint(
  OPERA_NURZHOL_ALONG,
  OPERA_NURZHOL_ACROSS,
);
export const OPERA_YAW = NURZHOL_PLAN_ROTATION;
export const OPERA_TO_NURZHOL_DISTANCE = Math.abs(OPERA_NURZHOL_ACROSS);
export const ARCH_BODY_LENGTH = 14;
export const ARCH_CENTRE = nurzholPoint(
  // В утверждённом верхнем виде правая рука фасада направлена против хода
  // оси Байтерек → Хан Шатыр. После визуальной проверки Арка отнесена ещё
  // на один собственный 14-метровый корпус вдоль этой продольной оси.
  OPERA_NURZHOL_ALONG - OPERA_TO_NURZHOL_DISTANCE - ARCH_BODY_LENGTH,
  OPERA_NURZHOL_ACROSS,
);
export const ARCH_YAW = NURZHOL_PLAN_ROTATION;

/** Северо-западная прибрежная группа у чернового автомобильного моста. */
export const CIRCUS_CENTRE = [-58, 63] as const;
/** Музей стоит за мостом, на суше между западной кромкой и эстакадой. */
export const MUSEUM_CENTRE = [-88, 10] as const;
export const NUR_ALEM_CENTRE = onAxis(
  MEMORY_EXPO_AXIS_DIRECTION,
  NUR_ALEM_DISTANCE,
);
export const VIRGIN_LANDS_PALACE_CENTRE = onAxis(
  MEMORY_EXPO_AXIS_DIRECTION,
  -VIRGIN_LANDS_PALACE_DISTANCE,
);

export const astanaLandmarkSites: readonly AstanaLandmarkSite[] = [
  {
    id: "khan-shatyr-plot",
    center: KHAN_SHATYR_CENTRE,
    radius: [25.5, 25],
    rotation: KHAN_SHATYR_YAW,
    status: "built",
    clearVegetation: true,
  },
  {
    id: "pyramid-plot",
    // Пирамида стоит на сухом внешнем полуострове и остаётся строго на
    // продолжении линии Хан Шатыр — Байтерек.
    center: PYRAMID_CENTRE,
    radius: [13, 13],
    // Одна сторона квадрата ортогональна Нуржолу; для квадратного пятна
    // это абсолют, а не визуальный доворот.
    rotation: PYRAMID_YAW,
    status: "primary-reserve",
    clearVegetation: true,
  },
  {
    // Нур Алем занимает освобождённую южную среду бывшего резерва мечети.
    // Сфера снова стоит на земле и не требует фиктивного моста-подиума.
    id: "nur-alem-expo-plot",
    center: NUR_ALEM_CENTRE,
    // The reserved environment includes the four low Expo crescents, not
    // only the 26 m island-scale sphere.
    radius: [22, 22],
    rotation: 0,
    status: "primary-reserve",
    clearVegetation: true,
  },
  {
    id: "virgin-lands-palace-plot",
    center: VIRGIN_LANDS_PALACE_CENTRE,
    // Полный резерв держит низкое фойе, высокий зал и воздух Старой площади.
    // Published: 25 м высоты; сценический масштаб средних общественных 1:1.6.
    radius: [28, 22],
    rotation: compositionTangentYaw(VIRGIN_LANDS_PALACE_CENTRE),
    status: "primary-reserve",
    clearVegetation: true,
  },
  {
    // Плаза намеренно остаётся узкой меткой. Её высота будет решаться
    // отдельным способом визуализации, а не раздуванием основания.
    id: "abu-dhabi-plaza-plot",
    // Верхний тамбур лестничного подъёма западной станции подходит к южной
    // кромке поймы. Башня стоит сразу за ним на суше; короткий зазор остаётся
    // свободным для будущего перехода на уровне платформы.
    center: [-70, 8],
    radius: [4.5, 3],
    // Длинная сторона строго параллельна платформе ЛРТ, без композиционного
    // доворота: это функциональная связь, а не свободная посадка высотки.
    rotation: -Math.PI / 2,
    status: "experimental-reserve",
    clearVegetation: true,
  },
  {
    id: "arch-square",
    center: ARCH_CENTRE,
    // Арка — тонкая часть ансамбля Оперы, а не самостоятельный квартал.
    radius: [8, 2],
    rotation: ARCH_YAW,
    status: "secondary-reserve",
    clearVegetation: true,
  },
  {
    id: "opera-plot",
    center: OPERA_CENTRE,
    radius: [12, 8],
    rotation: OPERA_YAW,
    status: "secondary-reserve",
    clearVegetation: true,
  },
  {
    id: "circus-plot",
    center: CIRCUS_CENTRE,
    radius: [8, 8],
    rotation: compositionTangentYaw(CIRCUS_CENTRE, -12),
    status: "secondary-reserve",
    clearVegetation: true,
  },
  {
    // Музей сохраняется, но его пятно сознательно сжато: на острове важен
    // низкий горизонтальный силуэт, а не полный натуральный стилобат.
    id: "museum-plot",
    center: MUSEUM_CENTRE,
    radius: [7, 5],
    rotation: compositionTangentYaw(MUSEUM_CENTRE, -6),
    status: "secondary-reserve",
    clearVegetation: true,
  },
] as const;

export const astanaLandmarkSiteById: Readonly<Record<string, AstanaLandmarkSite>> =
  Object.fromEntries(astanaLandmarkSites.map((site) => [site.id, site]));

/** Точка попадает в композиционный резерв с заданным внешним воздухом. */
export function insideLandmarkReserve(
  x: number,
  z: number,
  margin = 0,
): boolean {
  return astanaLandmarkSites.some((site) => {
    if (!site.clearVegetation) return false;
    const yaw = site.rotation ?? 0;
    const dx = x - site.center[0];
    const dz = z - site.center[1];
    const localX = Math.cos(yaw) * dx + Math.sin(yaw) * dz;
    const localZ = -Math.sin(yaw) * dx + Math.cos(yaw) * dz;
    const rx = site.radius[0] + margin;
    const rz = site.radius[1] + margin;
    // The Palace is a 48 × 34 m rectilinear building inside a rectangular
    // civic forecourt. Treating this reserve as an ellipse leaves vegetation
    // in all four building corners even though the plan itself is valid.
    if (site.id === "virgin-lands-palace-plot") {
      return Math.abs(localX) <= rx && Math.abs(localZ) <= rz;
    }
    return (localX / rx) ** 2 + (localZ / rz) ** 2 <= 1;
  });
}
