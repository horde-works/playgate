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

/**
 * Ось Атырау — Байтерек — Хан Шатыр. Мост лежит на северо-западном луче,
 * шатёр — на точном продолжении той же линии к юго-востоку.
 */
export const KHAN_SHATYR_CENTRE = [49, -41] as const;
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
export const PYRAMID_CENTRE = [-42, 42 * 41 / 49] as const;
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
export const NUR_ALEM_CENTRE = [-43, -58] as const;

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
    // Пирамида заменяет прежний мост Атырау над Есилем и остаётся строго
    // на продолжении линии Хан Шатыр — Байтерек.
    center: PYRAMID_CENTRE,
    radius: [13, 13],
    // Одна сторона квадрата ортогональна Нуржолу; для квадратного пятна
    // это абсолют, а не визуальный доворот.
    rotation: PYRAMID_YAW,
    status: "primary-reserve",
    clearVegetation: true,
    elevated: true,
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
    return (localX / rx) ** 2 + (localZ / rz) ** 2 <= 1;
  });
}
