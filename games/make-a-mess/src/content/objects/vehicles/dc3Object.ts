/**
 * Douglas DC-3 — документальный объект. Ревизия `c1-core`.
 *
 * Паспорт: games/make-a-mess/docs/dc3/evidence-card-01-dc3.md.
 * Обвод снят с чертежа C-47 в общественном достоянии
 * (docs/dc3/reference/c47-3view.svg), масштаб — ТОЛЬКО с напечатанных размеров
 * DC-3. Числа с разных панелей чертежа не смешиваются: у каждой панели свой
 * масштаб, и это записано в паспорте.
 *
 * ТРИ РЕШЕНИЯ ДЕРЖАТ ВЕСЬ ФАЙЛ.
 *
 * 1. МАШИНА АВТОРИТСЯ В САМОЛЁТНОЙ РАМЕ, А ВЫПУСКАЕТСЯ В СТОЯНОЧНОЙ ПОЗЕ.
 *    Все таблицы живут в координатах чертежа: `fs` — назад от кончика носа,
 *    `bl` — от плоскости симметрии, `wl` — вверх от горизонтали через нос.
 *    Единственный поворот `toModel` наклоняет машину носом вверх и сажает её
 *    на землю. Никакая деталь не имеет права считать наклон сама.
 *
 * 2. УГОЛ СТОЯНКИ НЕ ВПИСАН РУКОЙ. Он решается из геометрии шасси: оба колеса
 *    обязаны касаться одной горизонтали. Бриф говорил «около 11°», чертёж
 *    измеряется в 9.63°, шасси даёт 9.66° — и в файле стоит именно решение
 *    уравнения, а не любое из трёх чисел.
 *
 * 3. ФЮЗЕЛЯЖ, КРЫЛО, ГОНДОЛА И КИЛЬ — ЛОФТЫ ПО ТАБЛИЦАМ СТАНЦИЙ. Ни один
 *    шпангоут, ни одна нервюра не держит вписанную от руки высоту: все читают
 *    `fuselageSection` и `airfoilSection`. Профиль крыла считается по формуле
 *    NACA 4-значной серии от напечатанных 2215 и 2206, а не рисуется на глаз.
 *
 * Эта ревизия — только стальное ядро: шпангоуты, стрингеры, лонжероны, пол,
 * лонжероны и нервюры крыла, рамы моторов, узлы шасси, силовая схема хвоста.
 * Обшивки, агрегатов и остекления здесь нет.
 */

import type {
  ObjectLabModel,
  ObjectLabPart,
  ObjectLabView,
  ObjectMaterialId,
  ObjectPoint,
} from "../dutchWindmills/objectModel.ts";
import {
  buildLoft,
  buildTorqueBox,
  facetVolume,
  facetsToPart,
  type Facet,
} from "../authoring/solidBuilders.ts";

type Dc3View = ObjectLabView & { readonly up?: ObjectPoint };
type MaterialOverride = Readonly<Record<string, number | boolean>>;

/** Одна подвижная сборка: один шарнир, одна ось, один закрытый класс движения. */
type MotionGroup = {
  readonly id: string;
  readonly pivot: ObjectPoint;
  readonly axis: ObjectPoint;
  readonly motion: "constant-rotation-only" | "revolute";
  readonly rangeDegrees: readonly [number, number];
  readonly restDegrees: number;
  readonly members: readonly string[];
};

type Dc3Model = Omit<ObjectLabModel, "views"> & {
  readonly captureFrame: readonly [width: number, height: number];
  readonly materialOverrides: Readonly<Record<string, MaterialOverride>>;
  readonly motionGroups: readonly MotionGroup[];
  readonly views: readonly Dc3View[];
};

const parts: ObjectLabPart[] = [];
const point = (x: number, y: number, z: number): ObjectPoint => [x, y, z];
const lerp = (from: number, to: number, ratio: number) => from + (to - from) * ratio;
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
const degrees = (radians: number) => (radians * 180) / Math.PI;
const radians = (value: number) => (value * Math.PI) / 180;

// ---------------------------------------------------------------------------
// 1. Напечатанные размеры (ярус B). Всё остальное считается от них.
// ---------------------------------------------------------------------------

/** 95 ft 0 in. */
export const DC3_SPAN = 28.956;
/** 64 ft 5 in. */
export const DC3_LENGTH = 19.66;
/** 987 ft², для сверки восстановленной планформы. */
export const DC3_PUBLISHED_WING_AREA = 91.7;
/** 16 ft 9 in — верх киля над землёй в стояночной позе. */
export const DC3_PUBLISHED_HEIGHT = 5.16;
/** Hamilton Standard 23E50, 11 ft 6 in. */
export const DC3_PROPELLER_DIAMETER = 3.505;
/** Ширина салона 92 in — нижняя граница для внешней ширины фюзеляжа. */
export const DC3_CABIN_WIDTH = 2.337;

const SEMI_SPAN = DC3_SPAN / 2;

// ---------------------------------------------------------------------------
// 2. Таблицы станций фюзеляжа.
//
// `u` — доля длины от носа, как снято с чертежа; `fs = u * DC3_LENGTH`.
// `half` снята с плановой панели (масштаб по размаху), `top`/`bottom` — с
// боковой (масштаб по длине боковой панели). Строки, где обвод перекрыт
// зализом крыла, помечены: там таблица держит фюзеляж, а зализ строится
// отдельным телом в ревизии обводов.
// ---------------------------------------------------------------------------

type FuselageRow = {
  readonly fs: number;
  readonly half: number;
  readonly top: number;
  readonly bottom: number;
};

/**
 * Станции фюзеляжа. КАЖДАЯ КОЛОНКА СНЯТА СО СВОЕЙ ПАНЕЛИ и приведена на общую
 * сетку интерполяцией СВОИХ измерений: `half` с плановой, `top` и `bottom` — с
 * боковой. В ревизии c4 колонки сводились руками и сошлись не по станции —
 * носовой профиль растянулся назад на метр, а фонарь уехал за ним.
 * Сборка: docs/dc3/reference/fuselage-table.mjs.
 *
 * Участки, где трасса села на чужую деталь (мачта антенны, диск винта, зализ
 * крыла, гондола, оперение), объявлены окнами отбраковки в скрипте и заполнены
 * интерполяцией между чистыми краями. Хвостовой конус за станцией 13.2 —
 * авторский: там фюзеляж закрыт килём и стабилизатором на всех трёх панелях.
 *
 * Крутой участок `top` между 1.171 и 1.62 — это НЕ кривизна обтекателя, а само
 * лобовое стекло, наклон 44.6° от вертикали.
 */
const FUSELAGE_TABLE: readonly FuselageRow[] = [
  { fs: 0.000, half: 0.020, top: 0.020, bottom: -0.020 },
  { fs: 0.100, half: 0.204, top: 0.309, bottom: -0.204 },
  { fs: 0.220, half: 0.327, top: 0.422, bottom: -0.332 },
  { fs: 0.360, half: 0.436, top: 0.524, bottom: -0.417 },
  { fs: 0.520, half: 0.527, top: 0.590, bottom: -0.500 },
  { fs: 0.700, half: 0.616, top: 0.670, bottom: -0.570 },
  { fs: 0.900, half: 0.685, top: 0.754, bottom: -0.631 },
  { fs: 1.060, half: 0.738, top: 0.814, bottom: -0.679 },
  { fs: 1.171, half: 0.775, top: 0.866, bottom: -0.713 },
  { fs: 1.340, half: 0.815, top: 1.045, bottom: -0.765 },
  { fs: 1.500, half: 0.852, top: 1.215, bottom: -0.798 },
  { fs: 1.620, half: 0.876, top: 1.320, bottom: -0.930 },
  { fs: 1.780, half: 0.945, top: 1.437, bottom: -0.868 },
  { fs: 1.900, half: 0.978, top: 1.500, bottom: -0.890 },
  { fs: 2.100, half: 1.019, top: 1.546, bottom: -0.935 },
  { fs: 2.350, half: 1.066, top: 1.584, bottom: -0.981 },
  { fs: 2.620, half: 1.097, top: 1.622, bottom: -1.009 },
  { fs: 2.900, half: 1.130, top: 1.636, bottom: -1.010 },
  { fs: 3.250, half: 1.160, top: 1.658, bottom: -1.010 },
  { fs: 3.700, half: 1.181, top: 1.674, bottom: -1.010 },
  { fs: 4.200, half: 1.208, top: 1.673, bottom: -1.010 },
  { fs: 4.800, half: 1.224, top: 1.658, bottom: -1.010 },
  { fs: 5.500, half: 1.234, top: 1.649, bottom: -1.010 },
  { fs: 6.300, half: 1.248, top: 1.637, bottom: -1.010 },
  { fs: 7.200, half: 1.263, top: 1.610, bottom: -1.011 },
  { fs: 8.100, half: 1.272, top: 1.597, bottom: -1.011 },
  { fs: 9.000, half: 1.281, top: 1.578, bottom: -1.011 },
  { fs: 9.900, half: 1.290, top: 1.556, bottom: -1.011 },
  { fs: 10.800, half: 1.299, top: 1.544, bottom: -1.012 },
  { fs: 11.700, half: 1.271, top: 1.515, bottom: -1.012 },
  { fs: 12.500, half: 1.221, top: 1.484, bottom: -1.012 },
  { fs: 13.200, half: 1.160, top: 1.519, bottom: -0.947 },
  { fs: 14.400, half: 1.045, top: 1.470, bottom: -0.880 },
  { fs: 15.600, half: 0.930, top: 1.395, bottom: -0.720 },
  { fs: 16.600, half: 0.820, top: 1.300, bottom: -0.545 },
  { fs: 17.600, half: 0.660, top: 1.170, bottom: -0.330 },
  { fs: 18.600, half: 0.450, top: 1.010, bottom: -0.120 },
  { fs: 19.300, half: 0.230, top: 0.900, bottom: 0.060 },
  { fs: 19.550, half: 0.120, top: 0.840, bottom: 0.140 },
];

const FUSELAGE_NOSE_FS = 0;
const FUSELAGE_TAIL_FS = FUSELAGE_TABLE[FUSELAGE_TABLE.length - 1].fs;

const sampleFuselage = (fs: number): FuselageRow => {
  const station = clamp(fs, FUSELAGE_TABLE[0].fs, FUSELAGE_TABLE[FUSELAGE_TABLE.length - 1].fs);
  let index = 0;
  while (index < FUSELAGE_TABLE.length - 2 && FUSELAGE_TABLE[index + 1].fs < station) index += 1;
  const a = FUSELAGE_TABLE[index];
  const b = FUSELAGE_TABLE[index + 1];
  const ratio = (station - a.fs) / (b.fs - a.fs);
  return {
    fs: station,
    half: lerp(a.half, b.half, ratio),
    top: lerp(a.top, b.top, ratio),
    bottom: lerp(a.bottom, b.bottom, ratio),
  };
};

/** Максимальные габариты сечения — восстанавливаются, а не объявляются. */
export const DC3_FUSELAGE_MAX_WIDTH = 2 * Math.max(...FUSELAGE_TABLE.map((row) => row.half));
export const DC3_FUSELAGE_MAX_DEPTH = Math.max(...FUSELAGE_TABLE.map((row) => row.top - row.bottom));

const SECTION_SEGMENTS = 24;

/**
 * Сечение фюзеляжа на станции: овал, у которого верхний и нижний радиусы свои.
 * `inset` уводит контур внутрь — так шпангоут садится ПОД обшивку, а не вровень
 * с ней. Отрицательный inset даёт наружную поверхность.
 */
const fuselageSection = (fs: number, inset: number): { bl: number; wl: number }[] => {
  const row = sampleFuselage(fs);
  const centre = (row.top + row.bottom) / 2;
  const half = Math.max(row.half - inset, 0.012);
  const upper = Math.max(row.top - centre - inset, 0.012);
  const lower = Math.max(centre - row.bottom - inset, 0.012);
  return Array.from({ length: SECTION_SEGMENTS }, (_, index) => {
    const angle = (index / SECTION_SEGMENTS) * Math.PI * 2;
    const sin = Math.sin(angle);
    const cos = Math.cos(angle);
    return { bl: half * sin, wl: centre + (cos >= 0 ? upper : lower) * cos };
  });
};

// ---------------------------------------------------------------------------
// 3. Планформа крыла.
//
// Задняя кромка прямая — это инвариант, а не следствие: с чертежа она уходит
// вперёд на 0.7° от корня к концу и держится прямой на всём размахе.
// Излом (стык центроплана с консолью) — там же, где ломается поперечное V.
// ---------------------------------------------------------------------------

/** Стык центроплана и консоли по размаху. */
export const DC3_WING_KINK_BL = 4.05;
/** Поперечное V консоли; центроплан горизонтален. */
export const DC3_WING_DIHEDRAL_DEGREES = 5.55;
/** Установочный угол в корне и крутка к концу — авторские (см. паспорт §6). */
const WING_INCIDENCE_ROOT = 2.0;
const WING_WASHOUT = -1.5;
/** Плоскость хорды в корне. */
const WING_ROOT_WL = -0.70;

type WingRow = { readonly bl: number; readonly leadingFs: number; readonly chord: number };

// Строки — прямо с обмера чертежа: доля полуразмаха → `bl`, доля длины → метры.
// Ничего не «подправлено к красивому»: пересчитанная по этой таблице площадь
// расходится с напечатанной на +3.4 %, и это объявлено, а не спрятано.
const WING_TABLE: readonly WingRow[] = [
  // Строка на bl≈1.6 из обмера отброшена: там трассировщик сел на зализ крыла,
  // а не на заднюю кромку, и давал ступеньку 0.11 м. Корень восстановлен
  // продолжением прямой задней кромки — фактом об объекте, а не на глаз.
  { bl: 0.000, leadingFs: 4.864, chord: 4.426 },
  { bl: 1.593, leadingFs: 4.864, chord: 4.425 },
  { bl: 1.969, leadingFs: 4.864, chord: 4.418 },
  { bl: 3.866, leadingFs: 4.943, chord: 4.323 },
  { bl: 4.242, leadingFs: 5.039, chord: 4.211 },
  { bl: 4.633, leadingFs: 5.133, chord: 4.117 },
  { bl: 5.010, leadingFs: 5.245, chord: 4.005 },
  { bl: 5.386, leadingFs: 5.340, chord: 3.911 },
  { bl: 5.762, leadingFs: 5.436, chord: 3.798 },
  { bl: 6.139, leadingFs: 5.531, chord: 3.704 },
  { bl: 6.515, leadingFs: 5.627, chord: 3.608 },
  { bl: 6.906, leadingFs: 5.737, chord: 3.482 },
  { bl: 7.282, leadingFs: 5.833, chord: 3.386 },
  { bl: 7.659, leadingFs: 5.927, chord: 3.291 },
  { bl: 8.035, leadingFs: 6.024, chord: 3.195 },
  { bl: 8.412, leadingFs: 6.118, chord: 3.085 },
  { bl: 8.788, leadingFs: 6.215, chord: 2.988 },
  { bl: 9.179, leadingFs: 6.325, chord: 2.878 },
  { bl: 9.556, leadingFs: 6.421, chord: 2.766 },
  { bl: 9.932, leadingFs: 6.516, chord: 2.672 },
  { bl: 10.308, leadingFs: 6.612, chord: 2.576 },
  { bl: 10.685, leadingFs: 6.706, chord: 2.481 },
  { bl: 11.061, leadingFs: 6.818, chord: 2.353 },
  { bl: 11.452, leadingFs: 6.914, chord: 2.257 },
  { bl: 11.828, leadingFs: 7.009, chord: 2.163 },
  { bl: 12.205, leadingFs: 7.105, chord: 2.049 },
  { bl: 12.581, leadingFs: 7.199, chord: 1.954 },
  { bl: 12.958, leadingFs: 7.312, chord: 1.842 },
  { bl: 13.334, leadingFs: 7.406, chord: 1.748 },
  { bl: 13.725, leadingFs: 7.502, chord: 1.589 },
  { bl: 14.102, leadingFs: 7.677, chord: 1.239 },
  { bl: SEMI_SPAN, leadingFs: 8.137, chord: 0.222 },
];

const sampleWing = (bl: number): WingRow => {
  const value = clamp(Math.abs(bl), 0, SEMI_SPAN);
  let index = 0;
  while (index < WING_TABLE.length - 2 && WING_TABLE[index + 1].bl < value) index += 1;
  const a = WING_TABLE[index];
  const b = WING_TABLE[index + 1];
  const ratio = (value - a.bl) / (b.bl - a.bl);
  return {
    bl: value,
    leadingFs: lerp(a.leadingFs, b.leadingFs, ratio),
    chord: lerp(a.chord, b.chord, ratio),
  };
};

/** Высота плоскости хорды: центроплан горизонтален, консоль уходит вверх. */
const wingChordWl = (bl: number) => {
  const value = Math.abs(bl);
  if (value <= DC3_WING_KINK_BL) return WING_ROOT_WL;
  return WING_ROOT_WL + (value - DC3_WING_KINK_BL) * Math.tan(radians(DC3_WING_DIHEDRAL_DEGREES));
};

const wingTwist = (bl: number) => {
  const ratio = clamp(Math.abs(bl) / SEMI_SPAN, 0, 1);
  return WING_INCIDENCE_ROOT + WING_WASHOUT * ratio;
};

/** Относительная толщина: NACA 2215 в корне, NACA 2206 на конце (напечатано). */
const wingThicknessRatio = (bl: number) => lerp(0.15, 0.06, clamp(Math.abs(bl) / SEMI_SPAN, 0, 1));

/**
 * Профиль NACA 4-значной серии: 2 % кривизны на 20 % хорды, толщина из
 * `wingThicknessRatio`. Возвращает верх и низ в долях хорды.
 */
const naca4 = (position: number, thickness: number) => {
  const x = clamp(position, 0, 1);
  const halfThickness = 5 * thickness * (
    0.2969 * Math.sqrt(x)
    - 0.1260 * x
    - 0.3516 * x * x
    + 0.2843 * x * x * x
    - 0.1036 * x * x * x * x
  );
  const camberMax = 0.02;
  const camberPosition = 0.2;
  const camber = x < camberPosition
    ? (camberMax / (camberPosition * camberPosition)) * (2 * camberPosition * x - x * x)
    : (camberMax / ((1 - camberPosition) ** 2)) * ((1 - 2 * camberPosition) + 2 * camberPosition * x - x * x);
  return { upper: camber + halfThickness, lower: camber - halfThickness };
};

const AIRFOIL_STATIONS = [
  0, 0.0125, 0.025, 0.05, 0.075, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 1,
];

/**
 * Замкнутое сечение крыла на станции размаха, в самолётной раме.
 * `inset` уводит контур внутрь обшивки — нервюра садится ПОД неё.
 */
/** Минимальный просвет сечения набора: тоньше металл в наборе не бывает. */
const RIB_MIN_GAP = 0.016;

const airfoilSection = (
  bl: number,
  inset: number,
  range?: { readonly from: number; readonly to: number },
): { fs: number; wl: number }[] => {
  const row = sampleWing(bl);
  const thickness = wingThicknessRatio(bl);
  const chordWl = wingChordWl(bl);
  const twist = radians(wingTwist(bl));
  const chord = Math.max(row.chord, 0.05);
  const insetFraction = inset / chord;
  // Нервюра короче обшивки: у настоящей задней кромки её нет — там сходятся
  // сами обшивки. Постоянный отступ по нормали у острой кромки выворачивает
  // профиль наизнанку, поэтому хордовый диапазон урезается вместе с толщиной.
  const from = range ? range.from : (inset > 0 ? Math.min(1.4 * insetFraction, 0.06) : 0);
  const to = range ? range.to : (inset > 0 ? 1 - Math.min(2.4 * insetFraction, 0.10) : 1);
  const minGap = RIB_MIN_GAP / chord;
  const node = (position: number, side: 1 | -1) => {
    const surface = naca4(position, thickness);
    const camber = (surface.upper + surface.lower) / 2;
    const half = Math.max((surface.upper - surface.lower) / 2 - insetFraction, minGap / 2);
    return { position, offset: camber + side * half };
  };
  const stations = AIRFOIL_STATIONS.map((value) => lerp(from, to, value));
  const upper = stations.map((position) => node(position, 1));
  // Носок и острая задняя кромка — одна точка на две поверхности; срез по хорде
  // (лонжерон, ось навески) — настоящее ребро, и обе его точки нужны.
  const dropNose = from <= 1e-9 ? 1 : 0;
  const dropTail = to >= 1 - 1e-9 ? 1 : 0;
  const reversed = [...stations].reverse();
  const lower = reversed.slice(dropTail, reversed.length - dropNose)
    .map((position) => node(position, -1));
  return [...upper, ...lower].map(({ position, offset }) => {
    // Установочный угол поворачивает профиль вокруг четверти хорды.
    const along = (position - 0.25) * chord;
    const normal = offset * chord;
    const rotatedAlong = along * Math.cos(twist) + normal * Math.sin(twist);
    const rotatedNormal = -along * Math.sin(twist) + normal * Math.cos(twist);
    return { fs: row.leadingFs + 0.25 * chord + rotatedAlong, wl: chordWl + rotatedNormal };
  });
};

/** Наименьшая толщина сечения на станции — по ней решается, есть ли облегчение. */
const sectionMinGap = (bl: number, inset: number) => {
  const row = sampleWing(bl);
  const thickness = wingThicknessRatio(bl);
  const chord = Math.max(row.chord, 0.05);
  return Math.max(0, (naca4(0.3, thickness).upper - naca4(0.3, thickness).lower) * chord - 2 * inset);
};

/** Восстановленная площадь крыла: интеграл хорды по размаху, без объявлений. */
export const DC3_RECOVERED_WING_AREA = (() => {
  let total = 0;
  const steps = 400;
  for (let index = 0; index < steps; index += 1) {
    const blA = (index / steps) * SEMI_SPAN;
    const blB = ((index + 1) / steps) * SEMI_SPAN;
    total += ((sampleWing(blA).chord + sampleWing(blB).chord) / 2) * (blB - blA);
  }
  return total * 2;
})();

// ---------------------------------------------------------------------------
// 4. Шасси и стояночная поза.
//
// Угол не вписан: он решение уравнения «оба колеса на одной горизонтали».
// ---------------------------------------------------------------------------

export const DC3_MAIN_WHEEL = { fs: 5.868, bl: 2.820, wl: -2.611, radius: 0.550, width: 0.360 };
export const DC3_TAIL_WHEEL = { fs: 17.320, bl: 0, wl: -0.972, radius: 0.244, width: 0.180 };
export const DC3_ENGINE_BL = 2.980;

/**
 * Стояночный угол — решение уравнения «оба колеса касаются одной горизонтали».
 *
 * В уровневой раме `z = −fs`, поворот носом вверх даёт
 * `y' = wl·cosθ + z·sinθ`, а касание требует `y'_main − r_main = y'_tail − r_tail`,
 * то есть `Δwl·cosθ + Δz·sinθ = r_main − r_tail`. Приведение к одной гармонике
 * `A·cos(θ − φ) = target` даёт замкнутый ответ. Ни одно число выше не подогнано
 * под результат: бриф говорил ~11°, чертёж мерит 9.63°, шасси даёт своё.
 */
const solveGroundAngle = () => {
  const deltaWl = DC3_MAIN_WHEEL.wl - DC3_TAIL_WHEEL.wl;
  const deltaZ = -DC3_MAIN_WHEEL.fs + DC3_TAIL_WHEEL.fs;
  const target = DC3_MAIN_WHEEL.radius - DC3_TAIL_WHEEL.radius;
  const amplitude = Math.hypot(deltaWl, deltaZ);
  const phase = Math.atan2(deltaZ, deltaWl);
  // A·cos(θ − φ) = target → θ = φ ± acos(target/A). Второй корень даёт машину,
  // перевёрнутую через хвост, и отбрасывается.
  return phase - Math.acos(clamp(target / amplitude, -1, 1));
};

export const DC3_GROUND_ANGLE = solveGroundAngle();
export const DC3_GROUND_ANGLE_DEGREES = degrees(DC3_GROUND_ANGLE);
const PARK_COS = Math.cos(DC3_GROUND_ANGLE);
const PARK_SIN = Math.sin(DC3_GROUND_ANGLE);

const parkY = (fs: number, wl: number) => wl * PARK_COS + -fs * PARK_SIN;
const parkZ = (fs: number, wl: number) => -fs * PARK_COS - wl * PARK_SIN;

const GROUND_OFFSET_Y = parkY(DC3_MAIN_WHEEL.fs, DC3_MAIN_WHEEL.wl) - DC3_MAIN_WHEEL.radius;
const DATUM_OFFSET_Z = parkZ(DC3_MAIN_WHEEL.fs, DC3_MAIN_WHEEL.wl);

/**
 * Единственный переход из самолётной рамы в мировую. `y = 0` — земля,
 * `z = 0` — станция касания основных колёс, `+Z` — вперёд.
 */
export const toModel = (fs: number, bl: number, wl: number): ObjectPoint => point(
  bl,
  parkY(fs, wl) - GROUND_OFFSET_Y,
  parkZ(fs, wl) - DATUM_OFFSET_Z,
);

/** Пятно контакта колеса: центр в мировой раме, опущенный на радиус по вертикали. */
const wheelContact = (fs: number, bl: number, wl: number, radius: number): ObjectPoint => {
  const centre = toModel(fs, bl, wl);
  return point(centre[0], centre[1] - radius, centre[2]);
};

// ---------------------------------------------------------------------------
// 5. Помощники выпуска деталей.
// ---------------------------------------------------------------------------

const SKIN_THICKNESS = 0.028;
/** Набор садится ПОД обшивку: шпангоут не имеет права торчать наружу. */
const FRAME_INSET = SKIN_THICKNESS + 0.006;

/**
 * Кладёт набор граней в модель, выбросив вырожденные треугольники.
 *
 * Веерная триангуляция крышки у острой задней кромки неизбежно даёт лучи
 * нулевой площади: три подряд идущие точки схлопывающегося профиля почти
 * коллинеарны. Такой треугольник не рисует ничего, но ломает проверку
 * невырожденности — поэтому он не «прощается тестом», а не выпускается.
 */
const addFacets = (
  id: string,
  group: string,
  material: ObjectMaterialId,
  facets: readonly Facet[],
) => {
  const part = facetsToPart(id, group, material, facets, { showEdges: false });
  if (part.kind !== "mesh") {
    parts.push(part);
    return;
  }
  const kept = part.triangles.filter(([a, b, c]) => {
    const pa = part.vertices[a]; const pb = part.vertices[b]; const pc = part.vertices[c];
    const ux = pb[0] - pa[0]; const uy = pb[1] - pa[1]; const uz = pb[2] - pa[2];
    const vx = pc[0] - pa[0]; const vy = pc[1] - pa[1]; const vz = pc[2] - pa[2];
    return Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2 > 1e-8;
  });
  parts.push({ ...part, triangles: kept });
};

const addBox = (
  id: string,
  group: string,
  material: ObjectMaterialId,
  center: ObjectPoint,
  size: ObjectPoint,
  rotation?: ObjectPoint,
) => parts.push({ kind: "box", id, group, material, center, size, rotation });

const addCylinder = (
  id: string,
  group: string,
  material: ObjectMaterialId,
  from: ObjectPoint,
  to: ObjectPoint,
  radius: number,
  radialSegments = 14,
) => parts.push({ kind: "cylinder", id, group, material, from, to, radius, radialSegments });

/** Балка от узла к узлу: коробчатое сечение, реальные концы. */
const memberFacets = (
  from: ObjectPoint,
  to: ObjectPoint,
  width: number,
  height: number,
  tag: string,
): Facet[] => buildTorqueBox({ from, to, width, height, chamfer: Math.min(width, height) * 0.24, tag });

/** Цепь балок по ломаной: один член конструкции, настоящие стыки. */
const memberChain = (
  nodes: readonly ObjectPoint[],
  width: number,
  height: number | ((index: number) => number),
  tag: string,
): Facet[] => {
  const facets: Facet[] = [];
  for (let index = 0; index < nodes.length - 1; index += 1) {
    const value = typeof height === "number" ? height : height(index);
    facets.push(...memberFacets(nodes[index], nodes[index + 1], width, value, tag));
  }
  return facets;
};

/** Кольцо набора: замкнутый лофт между двумя контурами одной станции. */
const ringFacets = (
  outer: readonly { bl: number; wl: number }[],
  inner: readonly { bl: number; wl: number }[],
  fsFront: number,
  fsRear: number,
  tag: string,
): Facet[] => {
  const facets: Facet[] = [];
  const count = outer.length;
  const at = (list: readonly { bl: number; wl: number }[], index: number, fs: number) => {
    const node = list[index % count];
    return toModel(fs, node.bl, node.wl);
  };
  for (let index = 0; index < count; index += 1) {
    const next = index + 1;
    // наружная стенка
    facets.push({ points: [at(outer, index, fsFront), at(outer, index, fsRear), at(outer, next, fsRear), at(outer, next, fsFront)], tag });
    // внутренняя стенка (обратная навивка)
    facets.push({ points: [at(inner, next, fsFront), at(inner, next, fsRear), at(inner, index, fsRear), at(inner, index, fsFront)], tag });
    // передняя и задняя полки
    facets.push({ points: [at(outer, index, fsFront), at(outer, next, fsFront), at(inner, next, fsFront), at(inner, index, fsFront)], tag });
    facets.push({ points: [at(inner, index, fsRear), at(inner, next, fsRear), at(outer, next, fsRear), at(outer, index, fsRear)], tag });
  }
  return facets;
};

const CORE_GROUPS = [
  "core-frames",
  "core-stringers",
  "core-floor",
  "core-keel",
  "core-wing-spar",
  "core-wing-rib",
  "core-nacelle-mount",
  "core-gear-mount",
  "core-tail",
] as const;

// ---------------------------------------------------------------------------
// 6. Шпангоуты фюзеляжа.
// ---------------------------------------------------------------------------

/** Станции шпангоутов: сгущение там, где входят нагрузки. */
const FRAME_STATIONS = [
  0.60, 1.35, 2.10, 2.85, 3.60, 4.35, 5.10, 5.85, 6.60, 7.35, 8.10, 8.85,
  9.60, 10.35, 11.10, 11.85, 12.60, 13.35, 14.10, 14.85, 15.60, 16.40, 17.20, 18.00, 18.80,
];
const FRAME_DEPTH = 0.055;
const FRAME_WEB = 0.075;

for (const [index, fs] of FRAME_STATIONS.entries()) {
  const outer = fuselageSection(fs, FRAME_INSET);
  const inner = fuselageSection(fs, FRAME_INSET + FRAME_WEB);
  const tag = `frame-${index}`;
  addFacets(`frame-${String(index).padStart(2, "0")}`, "core-frames", "metal",
    ringFacets(outer, inner, fs - FRAME_DEPTH / 2, fs + FRAME_DEPTH / 2, tag));
}

// ---------------------------------------------------------------------------
// 7. Стрингеры и лонжероны фюзеляжа.
//
// Стрингер идёт по той же поверхности, что и шпангоут, — обе кривые читают
// `fuselageSection`, поэтому стрингер физически лежит на шпангоутах.
// ---------------------------------------------------------------------------

const STRINGER_ANGLES = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];
const STRINGER_FS = [0.55, 1.6, 2.7, 3.8, 5.0, 6.2, 7.4, 8.6, 9.8, 11.0, 12.2, 13.4, 14.6, 15.8, 16.9, 17.9, 18.8];

const sectionPointAt = (fs: number, angleDegrees: number, inset: number) => {
  const row = sampleFuselage(fs);
  const centre = (row.top + row.bottom) / 2;
  const angle = radians(angleDegrees);
  const sin = Math.sin(angle);
  const cos = Math.cos(angle);
  const half = Math.max(row.half - inset, 0.012);
  const upper = Math.max(row.top - centre - inset, 0.012);
  const lower = Math.max(centre - row.bottom - inset, 0.012);
  return { bl: half * sin, wl: centre + (cos >= 0 ? upper : lower) * cos };
};

for (const [index, angle] of STRINGER_ANGLES.entries()) {
  const nodes = STRINGER_FS.map((fs) => {
    const node = sectionPointAt(fs, angle, FRAME_INSET + FRAME_WEB * 0.35);
    return toModel(fs, node.bl, node.wl);
  });
  // Лонжероны — на уровне пола и по гребню; они толще рядовых стрингеров.
  const heavy = angle === 0 || angle === 180 || angle === 90 || angle === 270;
  addFacets(`stringer-${String(index).padStart(2, "0")}`, "core-stringers", "metal",
    memberChain(nodes, heavy ? 0.075 : 0.045, heavy ? 0.075 : 0.040, `stringer-${index}`));
}

// ---------------------------------------------------------------------------
// 8. Пол салона, кильбалка и рельсы кресел.
// ---------------------------------------------------------------------------

/** Пол салона: уровень выбран так, чтобы под ним прошли лонжероны центроплана. */
export const DC3_CABIN_FLOOR_WL = -0.34;
const CABIN_FRONT_FS = 3.25;
const CABIN_REAR_FS = 14.10;

const floorHalfWidthAt = (fs: number) => {
  const row = sampleFuselage(fs);
  const centre = (row.top + row.bottom) / 2;
  const upper = row.top - centre;
  const lower = centre - row.bottom;
  const reach = DC3_CABIN_FLOOR_WL - centre;
  const vertical = reach >= 0 ? upper : lower;
  const ratio = clamp(1 - (reach / vertical) ** 2, 0, 1);
  return Math.max((row.half - FRAME_INSET - FRAME_WEB) * Math.sqrt(ratio), 0.05);
};

for (const [index, fs] of FRAME_STATIONS.entries()) {
  if (fs < CABIN_FRONT_FS || fs > CABIN_REAR_FS) continue;
  const half = floorHalfWidthAt(fs);
  addFacets(`floor-beam-${String(index).padStart(2, "0")}`, "core-floor", "metal", memberFacets(
    toModel(fs, -half, DC3_CABIN_FLOOR_WL - 0.05),
    toModel(fs, half, DC3_CABIN_FLOOR_WL - 0.05),
    0.06, 0.11, `floor-beam-${index}`,
  ));
}

const floorRunNodes = (bl: number) => [CABIN_FRONT_FS, 6.0, 8.5, 11.0, CABIN_REAR_FS]
  .map((fs) => toModel(fs, bl, DC3_CABIN_FLOOR_WL - 0.05));
for (const [index, bl] of [-0.72, -0.24, 0.24, 0.72].entries()) {
  addFacets(`floor-run-${index}`, "core-floor", "metal", memberChain(floorRunNodes(bl), 0.055, 0.09, `floor-run-${index}`));
}

/** Кильбалка: непрерывный низ фюзеляжа под центропланом. */
const keelNodes = [2.6, 4.9, 7.2, 9.5, 11.8, 14.2].map((fs) => {
  const row = sampleFuselage(fs);
  return toModel(fs, 0, row.bottom + FRAME_INSET + 0.09);
});
addFacets("keel-beam-left", "core-keel", "metal",
  memberChain(keelNodes.map(([x, y, z]) => point(x - 0.30, y, z)), 0.09, 0.14, "keel-left"));
addFacets("keel-beam-right", "core-keel", "metal",
  memberChain(keelNodes.map(([x, y, z]) => point(x + 0.30, y, z)), 0.09, 0.14, "keel-right"));

// ---------------------------------------------------------------------------
// 9. Лонжероны и нервюры крыла.
//
// Двухлонжеронное крыло: передний на 20 % хорды, задний на 62 %. Оба читают
// профиль, поэтому высота лонжерона всюду равна реальной толщине крыла.
// ---------------------------------------------------------------------------

export const DC3_FRONT_SPAR_CHORD = 0.20;
export const DC3_REAR_SPAR_CHORD = 0.62;

const sparNode = (bl: number, chordFraction: number) => {
  const row = sampleWing(bl);
  const thickness = wingThicknessRatio(bl);
  const surface = naca4(chordFraction, thickness);
  const twist = radians(wingTwist(bl));
  const along = (chordFraction - 0.25) * row.chord;
  const centreOffset = ((surface.upper + surface.lower) / 2) * row.chord;
  const fs = row.leadingFs + 0.25 * row.chord + along * Math.cos(twist) + centreOffset * Math.sin(twist);
  const wl = wingChordWl(bl) - along * Math.sin(twist) + centreOffset * Math.cos(twist);
  const height = Math.max((surface.upper - surface.lower) * row.chord - 2 * FRAME_INSET, 0.05);
  return { fs, wl, height };
};

const SPAR_STATIONS = [0, 1.35, 2.70, DC3_WING_KINK_BL, 5.4, 6.8, 8.2, 9.6, 11.0, 12.3, 13.3, 14.1, 14.42];

for (const chordFraction of [DC3_FRONT_SPAR_CHORD, DC3_REAR_SPAR_CHORD]) {
  const name = chordFraction === DC3_FRONT_SPAR_CHORD ? "front" : "rear";
  for (const side of [-1, 1] as const) {
    const stations = side < 0 ? [...SPAR_STATIONS].reverse() : SPAR_STATIONS;
    const inboard = stations.filter((bl) => bl <= DC3_WING_KINK_BL + 1e-6);
    const outboard = stations.filter((bl) => bl >= DC3_WING_KINK_BL - 1e-6);
    for (const [segment, list] of [["centre", inboard], ["panel", outboard]] as const) {
      if (segment === "centre" && side < 0) continue; // центроплан неразъёмный: одна деталь
      const source = segment === "centre"
        ? SPAR_STATIONS.filter((bl) => bl <= DC3_WING_KINK_BL + 1e-6)
        : list;
      const nodes = segment === "centre"
        ? [...source].reverse().map((bl) => -bl).concat(source.slice(1)).map((bl) => {
          const node = sparNode(bl, chordFraction);
          return { bl, ...node };
        })
        : source.map((bl) => {
          const node = sparNode(bl * side, chordFraction);
          return { bl: bl * side, ...node };
        });
      const points = nodes.map((node) => toModel(node.fs, node.bl, node.wl));
      addFacets(
        `wing-spar-${name}-${segment === "centre" ? "centre" : side < 0 ? "left" : "right"}`,
        "core-wing-spar", "metal",
        memberChain(points, 0.10, (index) => Math.min(nodes[index].height, nodes[index + 1].height), `spar-${name}`),
      );
    }
  }
}

const RIB_STATIONS = [0.55, 1.35, 2.15, 2.95, 3.70, DC3_WING_KINK_BL, 4.9, 5.8, 6.7, 7.6, 8.5, 9.4, 10.3, 11.2, 12.1, 12.9, 13.6, 14.15];
const RIB_THICKNESS = 0.030;

for (const side of [-1, 1] as const) {
  for (const [index, bl] of RIB_STATIONS.entries()) {
    const station = bl * side;
    const outline = airfoilSection(station, FRAME_INSET);
    const front = outline.map((node) => toModel(node.fs, station - RIB_THICKNESS / 2, node.wl));
    const rear = outline.map((node) => toModel(node.fs, station + RIB_THICKNESS / 2, node.wl));
    const id = `wing-rib-${side < 0 ? "left" : "right"}-${String(index).padStart(2, "0")}`;
    // Облегчение прорезается только там, где сечение это выдерживает. Тонкая
    // концевая нервюра остаётся сплошной — так же, как на настоящей машине.
    if (sectionMinGap(station, FRAME_INSET) > 0.22) {
      const inner = airfoilSection(station, FRAME_INSET + 0.075);
      const frontInner = inner.map((node) => toModel(node.fs, station - RIB_THICKNESS / 2, node.wl));
      const rearInner = inner.map((node) => toModel(node.fs, station + RIB_THICKNESS / 2, node.wl));
      const facets: Facet[] = [];
      const count = outline.length;
      for (let node = 0; node < count; node += 1) {
        const next = (node + 1) % count;
        facets.push({ points: [front[node], rear[node], rear[next], front[next]], tag: "rib-skinline" });
        facets.push({ points: [frontInner[next], rearInner[next], rearInner[node], frontInner[node]], tag: "rib-lightening" });
        facets.push({ points: [front[node], front[next], frontInner[next], frontInner[node]], tag: "rib-web" });
        facets.push({ points: [rearInner[node], rearInner[next], rear[next], rear[node]], tag: "rib-web" });
      }
      addFacets(id, "core-wing-rib", "metal", facets);
    } else {
      addFacets(id, "core-wing-rib", "metal",
        buildLoft([front, rear], { tag: "rib-solid", capStart: true, capEnd: true }));
    }
  }
  // Законцовка: лобовая дужка замыкает набор консоли. Она стоит внутри
  // размаха — размах принадлежит обшивке, а не набору.
  const tipBl = (SEMI_SPAN - 0.03) * side;
  const tipOutline = airfoilSection(tipBl, FRAME_INSET);
  const tipNodes = [0, 2, 4, 8, 12, 16].map((index) => {
    const node = tipOutline[Math.min(index, tipOutline.length - 1)];
    return toModel(node.fs, tipBl, node.wl);
  });
  addFacets(`wing-tip-bow-${side < 0 ? "left" : "right"}`, "core-wing-rib", "metal",
    memberChain(tipNodes, 0.05, 0.05, "tip-bow"));
}

// ---------------------------------------------------------------------------
// 10. Рама мотора и набор мотогондолы.
// ---------------------------------------------------------------------------

export const DC3_ENGINE_FS = 3.55;
export const DC3_PROP_PLANE_FS = 2.90;
export const DC3_COWL_DIAMETER = 1.42;
const NACELLE_TAIL_FS = 8.70;

/** Ось тяги идёт почти по плоскости хорды центроплана — так же, как на чертеже. */
const engineWl = (bl: number) => wingChordWl(bl) - 0.05;

for (const side of [-1, 1] as const) {
  const bl = DC3_ENGINE_BL * side;
  const hub = { fs: DC3_ENGINE_FS, wl: engineWl(bl) };
  const attachFront = sparNode(bl, DC3_FRONT_SPAR_CHORD);
  const attachRear = sparNode(bl, DC3_REAR_SPAR_CHORD);
  const name = side < 0 ? "left" : "right";

  // Кольцо рамы мотора: на нём висит двигатель, оно же держит капот.
  const ringNodes = Array.from({ length: 10 }, (_, index) => {
    const angle = (index / 10) * Math.PI * 2;
    return toModel(hub.fs, bl + Math.sin(angle) * 0.44, hub.wl + Math.cos(angle) * 0.44);
  });
  addFacets(`engine-mount-ring-${name}`, "core-nacelle-mount", "metal",
    memberChain([...ringNodes, ringNodes[0]], 0.055, 0.055, `mount-ring-${name}`));

  // Подкосы рамы: четыре пути в передний лонжерон, два в задний.
  for (const [index, angle] of [45, 135, 225, 315].entries()) {
    const radian = radians(angle);
    const from = toModel(hub.fs, bl + Math.sin(radian) * 0.44, hub.wl + Math.cos(radian) * 0.44);
    const to = toModel(attachFront.fs, bl + Math.sin(radian) * 0.30, attachFront.wl + Math.cos(radian) * 0.16);
    addFacets(`engine-mount-strut-${name}-${index}`, "core-nacelle-mount", "metal",
      memberFacets(from, to, 0.05, 0.05, `mount-strut-${name}-${index}`));
  }
  for (const [index, offset] of [-0.30, 0.30].entries()) {
    addFacets(`nacelle-tie-${name}-${index}`, "core-nacelle-mount", "metal", memberFacets(
      toModel(attachFront.fs, bl + offset, attachFront.wl - 0.10),
      toModel(attachRear.fs, bl + offset, attachRear.wl - 0.06),
      0.05, 0.06, `nacelle-tie-${name}-${index}`,
    ));
  }
  // Шпангоуты гондолы: три кольца по её длине. Радиусы взяты не с потолка —
  // они повторяют обвод гондолы, уменьшенный на толщину обшивки.
  for (const [index, fs] of [4.60, 6.20, NACELLE_TAIL_FS - 0.35].entries()) {
    const radius = lerp(0.66, 0.22, index / 2);
    const centreWl = engineWl(bl) - lerp(0.30, 0.24, index / 2);
    const nodes = Array.from({ length: 12 }, (_, step) => {
      const angle = (step / 12) * Math.PI * 2;
      return toModel(fs, bl + Math.sin(angle) * radius, centreWl + Math.cos(angle) * radius);
    });
    addFacets(`nacelle-frame-${name}-${index}`, "core-nacelle-mount", "metal",
      memberChain([...nodes, nodes[0]], 0.05, 0.05, `nacelle-frame-${name}-${index}`));
  }
}

// ---------------------------------------------------------------------------
// 11. Узлы шасси.
//
// Опора убирается ВПЕРЁД в мотогондолу и колесо остаётся частично снаружи —
// подпись машины. Здесь только силовой узел; сама опора приходит в ревизии
// агрегатов.
// ---------------------------------------------------------------------------

/**
 * Убранное положение колеса — сплошной круг на чертеже; выпущенное — пунктирный.
 * Обе точки калиброваны, и шарнир из них ВЫЧИСЛЯЕТСЯ: он лежит на срединном
 * перпендикуляре отрезка между центрами. Станция подобрана так, чтобы шарнир сел
 * на задний лонжерон — и он туда садится сам, что и подтверждает построение.
 */
export const DC3_MAIN_WHEEL_FOLDED = { fs: 5.190, wl: -1.663 };

const gearHinge = (() => {
  const midFs = (DC3_MAIN_WHEEL.fs + DC3_MAIN_WHEEL_FOLDED.fs) / 2;
  const midWl = (DC3_MAIN_WHEEL.wl + DC3_MAIN_WHEEL_FOLDED.wl) / 2;
  const alongFs = DC3_MAIN_WHEEL_FOLDED.fs - DC3_MAIN_WHEEL.fs;
  const alongWl = DC3_MAIN_WHEEL_FOLDED.wl - DC3_MAIN_WHEEL.wl;
  const length = Math.hypot(alongFs, alongWl);
  const normalFs = -alongWl / length;
  const normalWl = alongFs / length;
  const spar = sparNode(DC3_ENGINE_BL, DC3_REAR_SPAR_CHORD);
  const travel = (spar.fs - midFs) / normalFs;
  const fs = midFs + normalFs * travel;
  const wl = midWl + normalWl * travel;
  const angleOf = (targetFs: number, targetWl: number) => Math.atan2(targetWl - wl, targetFs - fs);
  const sweep = angleOf(DC3_MAIN_WHEEL_FOLDED.fs, DC3_MAIN_WHEEL_FOLDED.wl)
    - angleOf(DC3_MAIN_WHEEL.fs, DC3_MAIN_WHEEL.wl);
  return { fs, wl, radius: Math.hypot(DC3_MAIN_WHEEL.fs - fs, DC3_MAIN_WHEEL.wl - wl), sweepDegrees: degrees(sweep) };
})();

/**
 * Размах уборки. Он положителен по построению, а направление живёт в ОСИ
 * группы: ось смотрит так, что 0° — выпущено, максимум — убрано. Знак,
 * спрятанный в диапазоне, — верный способ однажды убрать шасси наружу.
 */
export const DC3_GEAR_RETRACTION_DEGREES = Math.abs(gearHinge.sweepDegrees);
const GEAR_AXIS: ObjectPoint = [Math.sign(gearHinge.sweepDegrees), 0, 0];

export const DC3_GEAR_PIVOT = (side: -1 | 1) => ({
  fs: gearHinge.fs,
  bl: DC3_ENGINE_BL * side,
  wl: gearHinge.wl,
});

for (const side of [-1, 1] as const) {
  const pivot = DC3_GEAR_PIVOT(side);
  const name = side < 0 ? "left" : "right";
  addFacets(`gear-trunnion-${name}`, "core-gear-mount", "metal", memberFacets(
    toModel(pivot.fs, pivot.bl - 0.34, pivot.wl),
    toModel(pivot.fs, pivot.bl + 0.34, pivot.wl),
    0.16, 0.20, `gear-trunnion-${name}`,
  ));
  const front = sparNode(DC3_ENGINE_BL * side, DC3_FRONT_SPAR_CHORD);
  addFacets(`gear-drag-link-mount-${name}`, "core-gear-mount", "metal", memberFacets(
    toModel(pivot.fs - 0.10, pivot.bl, pivot.wl - 0.02),
    toModel(front.fs + 0.35, pivot.bl, front.wl - 0.12),
    0.07, 0.09, `gear-drag-${name}`,
  ));
}

// Узел хвостовой опоры: на шпангоуте, а не «где-то в хвосте».
addFacets("tail-gear-mount", "core-gear-mount", "metal", memberFacets(
  toModel(DC3_TAIL_WHEEL.fs - 0.45, -0.16, sampleFuselage(DC3_TAIL_WHEEL.fs - 0.45).bottom + FRAME_INSET + 0.06),
  toModel(DC3_TAIL_WHEEL.fs - 0.45, 0.16, sampleFuselage(DC3_TAIL_WHEEL.fs - 0.45).bottom + FRAME_INSET + 0.06),
  0.12, 0.14, "tail-gear-mount",
));

// ---------------------------------------------------------------------------
// 12. Силовая схема хвоста.
// ---------------------------------------------------------------------------

export const DC3_FIN_TOP = { fs: 17.90, wl: 4.030 };
export const DC3_STABILISER_SEMI_SPAN = 4.247;
const STABILISER_WL = 0.42;

type TailRow = { readonly wl: number; readonly leadingFs: number; readonly trailingFs: number };
const FIN_TABLE: readonly TailRow[] = [
  { wl: 1.520, leadingFs: 15.35, trailingFs: 19.43 },
  { wl: 2.090, leadingFs: 16.08, trailingFs: 19.40 },
  { wl: 2.540, leadingFs: 16.37, trailingFs: 19.35 },
  { wl: 3.130, leadingFs: 16.73, trailingFs: 19.28 },
  { wl: 3.570, leadingFs: 17.00, trailingFs: 19.18 },
  { wl: 3.890, leadingFs: 17.35, trailingFs: 18.90 },
  { wl: 4.030, leadingFs: 17.90, trailingFs: 18.30 },
];

/** Ось навески руля направления — снята с чертежа как разделительная линия. */
export const DC3_RUDDER_HINGE = {
  low: { fs: 18.30, wl: 1.55 },
  high: { fs: 17.95, wl: 3.90 },
};

const finChordAt = (wl: number) => {
  const value = clamp(wl, FIN_TABLE[0].wl, FIN_TABLE[FIN_TABLE.length - 1].wl);
  let index = 0;
  while (index < FIN_TABLE.length - 2 && FIN_TABLE[index + 1].wl < value) index += 1;
  const a = FIN_TABLE[index];
  const b = FIN_TABLE[index + 1];
  const ratio = (value - a.wl) / (b.wl - a.wl);
  return {
    leadingFs: lerp(a.leadingFs, b.leadingFs, ratio),
    trailingFs: lerp(a.trailingFs, b.trailingFs, ratio),
  };
};

const FIN_STATIONS = [1.55, 1.95, 2.35, 2.75, 3.15, 3.55, 3.90];
// Передний и задний лонжероны киля.
for (const [index, fraction] of [0.18, 0.72].entries()) {
  const nodes = FIN_STATIONS.map((wl) => {
    const chord = finChordAt(wl);
    return toModel(lerp(chord.leadingFs, chord.trailingFs, fraction), 0, wl);
  });
  addFacets(`fin-spar-${index}`, "core-tail", "metal", memberChain(nodes, 0.10, 0.16, `fin-spar-${index}`));
}
// Нервюры киля.
for (const [index, wl] of FIN_STATIONS.entries()) {
  const chord = finChordAt(wl);
  addFacets(`fin-rib-${String(index).padStart(2, "0")}`, "core-tail", "metal", memberFacets(
    toModel(chord.leadingFs + 0.06, 0, wl),
    toModel(chord.trailingFs - 0.06, 0, wl),
    0.05, 0.09, `fin-rib-${index}`,
  ));
}
// Форкиль: киль не растёт из воздуха, он входит в фюзеляж наклонным членом.
addFacets("fin-root-fillet-spar", "core-tail", "metal", memberFacets(
  toModel(14.60, 0, sampleFuselage(14.60).top - 0.16),
  toModel(FIN_TABLE[0].leadingFs, 0, FIN_TABLE[0].wl),
  0.09, 0.12, "fin-fillet",
));

// Стабилизатор: два лонжерона и нервюры на каждый борт.
const STABILISER_TABLE: readonly { bl: number; leadingFs: number; chord: number }[] = [
  { bl: 0.00, leadingFs: 15.90, chord: 3.520 },
  { bl: 0.84, leadingFs: 16.28, chord: 3.130 },
  { bl: 1.68, leadingFs: 16.72, chord: 2.690 },
  { bl: 2.52, leadingFs: 17.16, chord: 2.250 },
  { bl: 3.36, leadingFs: 17.60, chord: 1.720 },
  { bl: 3.95, leadingFs: 18.05, chord: 1.050 },
  { bl: DC3_STABILISER_SEMI_SPAN, leadingFs: 18.45, chord: 0.320 },
];
const sampleStabiliser = (bl: number) => {
  const value = clamp(Math.abs(bl), 0, DC3_STABILISER_SEMI_SPAN);
  let index = 0;
  while (index < STABILISER_TABLE.length - 2 && STABILISER_TABLE[index + 1].bl < value) index += 1;
  const a = STABILISER_TABLE[index];
  const b = STABILISER_TABLE[index + 1];
  const ratio = (value - a.bl) / (b.bl - a.bl);
  return { leadingFs: lerp(a.leadingFs, b.leadingFs, ratio), chord: lerp(a.chord, b.chord, ratio) };
};

for (const [index, fraction] of [0.22, 0.68].entries()) {
  const nodes = [-DC3_STABILISER_SEMI_SPAN, -3.36, -2.52, -1.68, -0.84, 0, 0.84, 1.68, 2.52, 3.36, DC3_STABILISER_SEMI_SPAN]
    .map((bl) => {
      const row = sampleStabiliser(bl);
      return toModel(row.leadingFs + fraction * row.chord, bl, STABILISER_WL);
    });
  addFacets(`stabiliser-spar-${index}`, "core-tail", "metal", memberChain(nodes, 0.09, 0.13, `stab-spar-${index}`));
}
for (const side of [-1, 1] as const) {
  for (const [index, bl] of [0.84, 1.68, 2.52, 3.36, 3.95].entries()) {
    const row = sampleStabiliser(bl);
    addFacets(`stabiliser-rib-${side < 0 ? "left" : "right"}-${index}`, "core-tail", "metal", memberFacets(
      toModel(row.leadingFs + 0.05, bl * side, STABILISER_WL),
      toModel(row.leadingFs + row.chord - 0.05, bl * side, STABILISER_WL),
      0.04, 0.08, `stab-rib-${index}`,
    ));
  }
}

// ---------------------------------------------------------------------------
// 13. Обводы (ревизия c2).
//
// Обшивка ЛЕЖИТ НА НАБОРЕ: она читает те же таблицы с нулевым отступом, а набор
// сидит на `FRAME_INSET` внутрь. Ни один шпангоут не имеет права оказаться
// снаружи — это отдельный тест.
//
// Крыло проходит СКВОЗЬ фюзеляж, и два тела не делят объём: в полосе хорды
// центроплана обшивка фюзеляжа обрывается по линии стыка, а низ там образует
// сама обшивка крыла. Так построен настоящий низкоплан, и только так тест
// «вершина обшивки не лежит внутри чужого объёма» может быть честным.
// ---------------------------------------------------------------------------

const HULL_GROUPS = [
  "hull-fuselage",
  "glazing-cabin",
  "glazing-cockpit",
  "door",
  "interior",
  "hull-wing",
  "hull-fillet",
  "hull-nacelle",
  "hull-tail",
] as const;

const ROOT_CHORD = sampleWing(0).chord;
const ROOT_LEADING_FS = sampleWing(0).leadingFs;
/** Обшивка крыла кончается на линии навески; за ней живут рули и закрылки. */
export const DC3_CONTROL_HINGE_CHORD = 0.75;
/** Наружная граница зализа: дальше идёт чистая консоль. */
const WING_ROOT_BL = 1.30;

const ARC_POINTS = 33;

/**
 * Замкнутое сечение фюзеляжа: обход от киля через борт, верх и обратно. Первая
 * и последняя точка совпадают, поэтому оболочка сходится сама, и поперёк неё не
 * ложится фальшивая полоса.
 */
const fuselageArc = (fs: number): ObjectPoint[] => {
  const row = sampleFuselage(fs);
  const centre = (row.top + row.bottom) / 2;
  const upper = row.top - centre;
  const lower = centre - row.bottom;
  return Array.from({ length: ARC_POINTS }, (_, index) => {
    const angle = lerp(-Math.PI, Math.PI, index / (ARC_POINTS - 1));
    const cos = Math.cos(angle);
    return toModel(fs, row.half * Math.sin(angle), centre + (cos >= 0 ? upper : lower) * cos);
  });
};

/** Полуширина борта на станции и высоте — по ней садится зализ. */
const fuselageHalfAt = (fs: number, wl: number) => {
  const row = sampleFuselage(fs);
  const centre = (row.top + row.bottom) / 2;
  const radius = wl >= centre ? row.top - centre : centre - row.bottom;
  const ratio = clamp(1 - ((wl - centre) / radius) ** 2, 0, 1);
  return row.half * Math.sqrt(ratio);
};

/**
 * Крышка сечения ВЕЕРОМ ИЗ ЦЕНТРА, а не из первой вершины.
 *
 * Веер из вершины 0 по тонкому профилю неизбежно даёт лучи нулевой площади у
 * острой задней кромки. Их приходилось выбрасывать — и тело переставало быть
 * замкнутым, то есть теряло единственную честную проверку навивки. Веер из
 * центра сечения даёт широкие треугольники и оставляет тело замкнутым.
 */
const capFan = (section: readonly ObjectPoint[], reverse: boolean): Facet[] => {
  let x = 0; let y = 0; let z = 0;
  for (const node of section) { x += node[0]; y += node[1]; z += node[2]; }
  const centre = point(x / section.length, y / section.length, z / section.length);
  const facets: Facet[] = [];
  for (let index = 0; index < section.length; index += 1) {
    const next = (index + 1) % section.length;
    facets.push({
      points: reverse
        ? [centre, section[next], section[index]]
        : [centre, section[index], section[next]],
      tag: "cap",
    });
  }
  return facets;
};

/** Крышка сечения без вырожденного треугольника на сомкнутых концах. */
const capFacet = (section: readonly ObjectPoint[], reverse: boolean): Facet => {
  const last = section[section.length - 1];
  const first = section[0];
  const same = Math.hypot(last[0] - first[0], last[1] - first[1], last[2] - first[2]) < 1e-9;
  const points = same ? section.slice(0, -1) : [...section];
  return { points: reverse ? [...points].reverse() : points, tag: "cap" };
};

/**
 * Разворот оболочки нормалями НАРУЖУ.
 *
 * Односторонняя поверхность, вывёрнутая внутрь, исчезает из внешних кадров и
 * неотличима от прозрачности — ровно этим и притворилась обшивка фюзеляжа на
 * первом прогоне c2. Считать навивку в уме для каждого лофта бессмысленно:
 * знак зависит от направления обхода сечения И от направления самого лофта.
 * Поэтому он ПРОВЕРЯЕТСЯ по геометрии: если большинство нормалей смотрит на
 * опорную точку, весь набор переворачивается разом.
 */
const orientOutward = (facets: readonly Facet[], reference: ObjectPoint): Facet[] => {
  let outward = 0;
  let inward = 0;
  for (const facet of facets) {
    const [a, b, c] = facet.points;
    const ux = b[0] - a[0]; const uy = b[1] - a[1]; const uz = b[2] - a[2];
    const vx = c[0] - a[0]; const vy = c[1] - a[1]; const vz = c[2] - a[2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    let cx = 0; let cy = 0; let cz = 0;
    for (const node of facet.points) { cx += node[0]; cy += node[1]; cz += node[2]; }
    const count = facet.points.length;
    const dx = cx / count - reference[0];
    const dy = cy / count - reference[1];
    const dz = cz / count - reference[2];
    const dot = nx * dx + ny * dy + nz * dz;
    if (dot >= 0) outward += 1; else inward += 1;
  }
  if (outward >= inward) return [...facets];
  return facets.map((facet) => ({ points: [...facet.points].reverse(), tag: facet.tag }));
};

/** Опорная точка оболочки — её собственный центр масс по вершинам. */
const facetCentre = (facets: readonly Facet[]): ObjectPoint => {
  let x = 0; let y = 0; let z = 0; let count = 0;
  for (const facet of facets) {
    for (const node of facet.points) { x += node[0]; y += node[1]; z += node[2]; count += 1; }
  }
  return point(x / count, y / count, z / count);
};

/**
 * Замкнутое тело разворачивается по ЗНАКУ ОБЪЁМА, а не по центру масс.
 * У капота есть внутренний канал: его стенка обязана смотреть на ось, и
 * проверка «все нормали прочь от центра» на таком теле просто неверна.
 */
const addSolid = (
  id: string,
  group: string,
  material: ObjectMaterialId,
  facets: readonly Facet[],
) => addFacets(id, group, material,
  facetVolume(facets) >= 0 ? facets : facets.map((facet) => ({ points: [...facet.points].reverse(), tag: facet.tag })));

/** Кладёт оболочку в модель, развернув её нормалями наружу от собственного центра. */
const addShell = (
  id: string,
  group: string,
  material: ObjectMaterialId,
  facets: readonly Facet[],
  reference?: ObjectPoint,
) => addFacets(id, group, material, orientOutward(facets, reference ?? facetCentre(facets)));

/** Шаг станций обшивки салона: ровно половина окна, чтобы проём лёг по сетке. */
const SKIN_STEP = 0.255;
/** Первое окно салона снято с чертежа: центр на станции 4.41, шаг 1.02. */
export const DC3_WINDOW_FIRST_FS = 4.41;
export const DC3_WINDOW_PITCH = 1.02;
export const DC3_WINDOW_COUNT = 7;
export const DC3_WINDOW_SIDE = 0.51;
const CABIN_SKIN_FROM = DC3_WINDOW_FIRST_FS - SKIN_STEP;
const CABIN_SKIN_TO = CABIN_SKIN_FROM + SKIN_STEP * (DC3_WINDOW_PITCH / SKIN_STEP) * (DC3_WINDOW_COUNT - 1) + SKIN_STEP * 2;

/** Проём в обшивке: диапазон станций и диапазон ячеек сечения. */
type SkinHole = {
  readonly id: string;
  readonly fromStation: number;
  readonly toStation: number;
  readonly fromCell: number;
  readonly toCell: number;
  readonly kind: "cabin" | "cockpit" | "door";
  /**
   * Диапазон ячеек по станциям. Нужен там, где кромка проёма обязана идти по
   * ПРЯМОЙ, а сечение под ней растёт: у окон кабины подоконная линия
   * горизонтальна, пока гребень над ней поднимается на 0.93 м.
   */
  readonly cellSpans?: readonly { readonly from: number; readonly to: number }[];
  /**
   * Точные высоты кромок. Вырез обшивки неизбежно квантуется по ячейкам
   * сечения, а рама и стекло строятся ПО НИМ — поэтому видимая линия остаётся
   * прямой, а ступеньку выреза съедает четверть.
   */
  readonly sillWl?: number;
  readonly headWl?: number;
};

const holeCells = (hole: SkinHole, station: number) =>
  hole.cellSpans?.[station - hole.fromStation] ?? { from: hole.fromCell, to: hole.toCell };

/**
 * Обшивка отрезка фюзеляжа с настоящими проёмами.
 *
 * Панель не «затемняется» и не заклеивается стеклом поверх целой стенки: квад,
 * попавший в проём, ПРОСТО НЕ ВЫПУСКАЕТСЯ. Дальше проём получает четверти,
 * раму, стекло и глубину салона за ним — по цепочке, которую требует канон.
 */
const emitFuselageSkin = (
  id: string,
  from: number,
  to: number,
  options: {
    readonly step?: number; readonly capStart?: boolean; readonly capEnd?: boolean;
    readonly holes?: readonly SkinHole[]; readonly stations?: readonly number[];
  } = {},
) => {
  const step = options.step ?? 0.22;
  const steps = Math.max(2, Math.round((to - from) / step));
  // Явный список станций нужен там, где проём обязан лечь по своим границам:
  // фонарь разбит на панели с точностью до сантиметров, и подгонять его под
  // равномерную сетку значило бы двигать построение под удобство кода.
  const stations = options.stations
    ? [...options.stations]
    : Array.from({ length: steps + 1 }, (_, index) => lerp(from, to, index / steps));
  const sections = stations.map(fuselageArc);
  const holes = options.holes ?? [];
  const facets: Facet[] = [];
  for (let station = 0; station < sections.length - 1; station += 1) {
    for (let cell = 0; cell < ARC_POINTS - 1; cell += 1) {
      const inside = holes.some((hole) => {
        if (station < hole.fromStation || station >= hole.toStation) return false;
        const span = holeCells(hole, station);
        return cell >= span.from && cell < span.to;
      });
      if (inside) continue;
      facets.push({
        points: [sections[station][cell], sections[station + 1][cell], sections[station + 1][cell + 1], sections[station][cell + 1]],
        tag: id,
      });
    }
  }
  if (options.capStart) facets.push(capFacet(sections[0], false));
  if (options.capEnd) facets.push(capFacet(sections[sections.length - 1], true));
  const middle = lerp(from, to, 0.5);
  const row = sampleFuselage(middle);
  addShell(id, "hull-fuselage", "paint-light", facets, toModel(middle, 0, (row.top + row.bottom) / 2));
  return { stations, sections };
};

/** Точка на поверхности фюзеляжа по станции и ячейке, уведённая внутрь на `inset`. */
const skinPoint = (fs: number, cell: number, inset: number): ObjectPoint => {
  const row = sampleFuselage(fs);
  const centre = (row.top + row.bottom) / 2;
  const angle = lerp(-Math.PI, Math.PI, cell / (ARC_POINTS - 1));
  const cos = Math.cos(angle);
  const half = Math.max(row.half - inset, 0.02);
  const upper = Math.max(row.top - centre - inset, 0.02);
  const lower = Math.max(centre - row.bottom - inset, 0.02);
  return toModel(fs, half * Math.sin(angle), centre + (cos >= 0 ? upper : lower) * cos);
};

/** Ячейка сечения, на которой поверхность пересекает заданную высоту. */
const cellAtWl = (fs: number, wl: number, side: 1 | -1) => {
  const row = sampleFuselage(fs);
  const centre = (row.top + row.bottom) / 2;
  const radius = wl >= centre ? row.top - centre : centre - row.bottom;
  const angle = Math.acos(clamp((wl - centre) / radius, -1, 1));
  const signed = side > 0 ? angle : -angle;
  return (signed + Math.PI) / (Math.PI * 2) * (ARC_POINTS - 1);
};

const REVEAL_DEPTH = 0.10;
const GLASS_INSET = 0.045;

/**
 * Четверти, рама, стекло и стенка глубины за проёмом. Стекло — ordinary
 * transparent glazing; ничего не светится, за ним настоящий объём салона.
 */
const emitOpening = (
  hole: SkinHole,
  stations: readonly number[],
  material: ObjectMaterialId,
  group: string,
) => {
  const fs0 = stations[hole.fromStation];
  const fs1 = stations[hole.toStation];
  const spanAt = (station: number) => holeCells(hole, Math.min(station, hole.toStation - 1));
  const outer = (fs: number, cell: number) => skinPoint(fs, cell, 0);
  const inner = (fs: number, cell: number) => skinPoint(fs, cell, REVEAL_DEPTH);
  const reveal: { points: ObjectPoint[]; reference: ObjectPoint }[] = [];
  const push = (points: ObjectPoint[], reference: ObjectPoint) => reveal.push({ points, reference });
  {
    const first = spanAt(hole.fromStation);
    const last = spanAt(hole.toStation - 1);
    // Передняя и задняя стенки смотрят ВДОЛЬ станции, поэтому их разворачивает
    // центр самого проёма, а не точка на той же станции: там скалярное
    // произведение вырождается в ноль и знак становится шумом.
    const centre = skinPoint((fs0 + fs1) / 2, (first.from + first.to) / 2, REVEAL_DEPTH / 2);
    for (let cell = first.from; cell < first.to; cell += 1) {
      push([outer(fs0, cell), inner(fs0, cell), inner(fs0, cell + 1), outer(fs0, cell + 1)], centre);
    }
    for (let cell = last.from; cell < last.to; cell += 1) {
      push([outer(fs1, cell + 1), inner(fs1, cell + 1), inner(fs1, cell), outer(fs1, cell)], centre);
    }
  }
  for (const [index, key] of (["from", "to"] as const).entries()) {
    for (let station = hole.fromStation; station < hole.toStation; station += 1) {
      const a = stations[station];
      const b = stations[station + 1];
      const cellA = spanAt(station)[key];
      const cellB = spanAt(Math.min(station + 1, hole.toStation - 1))[key];
      const quad = [outer(a, cellA), inner(a, cellA), inner(b, cellB), outer(b, cellB)];
      const span = spanAt(station);
      push(index === 0 ? quad : [...quad].reverse(),
        skinPoint((a + b) / 2, (span.from + span.to) / 2, REVEAL_DEPTH / 2));
    }
  }
  // Стенка проёма смотрит В проём: снаружи в окно видно именно её, а не изнанку.
  // Разворачивается КАЖДАЯ грань, и к СВОЕЙ оси: у четырёх стенок нет общей
  // «наружи», а на длинном окне нет и общего центра.
  addFacets(`${hole.id}-reveal`, group, "metal", reveal.map(({ points, reference }) => {
    const [a, b, c] = points;
    const ux = b[0] - a[0]; const uy = b[1] - a[1]; const uz = b[2] - a[2];
    const vx = c[0] - a[0]; const vy = c[1] - a[1]; const vz = c[2] - a[2];
    const nx = uy * vz - uz * vy; const ny = uz * vx - ux * vz; const nz = ux * vy - uy * vx;
    let cx = 0; let cy = 0; let cz = 0;
    for (const node of points) { cx += node[0]; cy += node[1]; cz += node[2]; }
    const count = points.length;
    const dot = nx * (reference[0] - cx / count) + ny * (reference[1] - cy / count) + nz * (reference[2] - cz / count);
    return { points: dot >= 0 ? points : [...points].reverse(), tag: "reveal" };
  }));

  /**
   * Кромка рамы: ТОЧНАЯ высота, если проём её объявил, иначе граница ячейки.
   * Вырез обшивки неизбежно квантуется по сечению — видимую прямую держит рама,
   * а ступеньку выреза съедает четверть.
   */
  const edgeCell = (fs: number, key: "from" | "to", station: number) => {
    if (hole.sillWl === undefined || hole.headWl === undefined) return spanAt(station)[key];
    const side = (hole.fromCell + hole.toCell) / 2 > (ARC_POINTS - 1) / 2 ? 1 : -1;
    const sill = cellAtWl(fs, hole.sillWl, side);
    const head = cellAtWl(fs, hole.headWl, side);
    return key === "from" ? Math.min(sill, head) : Math.max(sill, head);
  };
  const firstSpan = spanAt(hole.fromStation);

  // Рама: тонкая накладка вокруг проёма, выступающая наружу на 12 мм.
  const frame: Facet[] = [];
  const framePoint = (fs: number, cell: number, out: number) => skinPoint(fs, cell, -out);
  const across = Math.max(2, firstSpan.to - firstSpan.from);
  const ring = [
    ...Array.from({ length: across + 1 }, (_, index) => ({
      fs: fs0,
      cell: lerp(edgeCell(fs0, "from", hole.fromStation), edgeCell(fs0, "to", hole.fromStation), index / across),
    })),
    ...Array.from({ length: hole.toStation - hole.fromStation }, (_, index) => ({
      fs: stations[hole.fromStation + index + 1],
      cell: edgeCell(stations[hole.fromStation + index + 1], "to", hole.fromStation + index),
    })),
    ...Array.from({ length: across }, (_, index) => ({
      fs: fs1,
      cell: lerp(edgeCell(fs1, "to", hole.toStation - 1), edgeCell(fs1, "from", hole.toStation - 1), (index + 1) / across),
    })),
    ...Array.from({ length: hole.toStation - hole.fromStation - 1 }, (_, index) => ({
      fs: stations[hole.toStation - index - 1],
      cell: edgeCell(stations[hole.toStation - index - 1], "from", hole.toStation - index - 1),
    })),
  ];
  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index];
    const next = ring[(index + 1) % ring.length];
    frame.push({
      points: [
        framePoint(current.fs, current.cell, 0.012), framePoint(next.fs, next.cell, 0.012),
        framePoint(next.fs, next.cell, -0.02), framePoint(current.fs, current.cell, -0.02),
      ],
      tag: "frame",
    });
  }
  addShell(`${hole.id}-frame`, group, "metal", frame,
    skinPoint((fs0 + fs1) / 2, (firstSpan.from + firstSpan.to) / 2, 0.5));

  // Стекло: обычная прозрачная панель внутри четвертей. Источников света нет.
  const glass: ObjectPoint[][] = [];
  const width = Math.max(2, firstSpan.to - firstSpan.from);
  for (let station = hole.fromStation; station <= hole.toStation; station += 1) {
    const index = Math.min(station, hole.toStation - 1);
    const fs = stations[station];
    const low = edgeCell(fs, "from", index);
    const high = edgeCell(fs, "to", index);
    glass.push(Array.from({ length: width + 1 }, (_, step) =>
      skinPoint(fs, lerp(low, high, step / width), GLASS_INSET)));
  }
  const pane: Facet[] = [];
  for (let station = 0; station < glass.length - 1; station += 1) {
    for (let cell = 0; cell < glass[station].length - 1; cell += 1) {
      pane.push({ points: [glass[station][cell], glass[station + 1][cell], glass[station + 1][cell + 1], glass[station][cell + 1]], tag: "pane" });
    }
  }
  const paneSuffix = material === "glazing" ? "glass" : "leaf";
  parts.push(facetsToPart(`${hole.id}-${paneSuffix}`, group, material, pane, { showEdges: false, doubleSided: true }));
};

const cabinWindowHoles = (side: 1 | -1): SkinHole[] => {
  const cellCentre = side > 0 ? 24 : 8;
  return Array.from({ length: DC3_WINDOW_COUNT }, (_, index) => {
    const start = index * Math.round(DC3_WINDOW_PITCH / SKIN_STEP);
    return {
      id: `window-${side > 0 ? "right" : "left"}-${index}`,
      fromStation: start,
      toStation: start + 2,
      fromCell: cellCentre - 1,
      toCell: cellCentre + 1,
      kind: "cabin" as const,
    };
  });
};

/**
 * Фонарь кабины по ведомости из docs/dc3/canopy-layout.png.
 *
 * Лобовое стекло — НЕ лента, вырезанная по сечению. Это плоская пара панелей
 * на своих станциях: 1.171 → 1.620, наклон 44.6° от вертикали, ширина по низу
 * 1.20 м. Боковые окна стоят на щеке отдельными проёмами, и подоконная линия
 * у них ПРЯМАЯ, пока гребень над ней поднимается на 0.93 м.
 */
const CANOPY_STATIONS = [
  1.060, 1.171, 1.300, 1.440, 1.620, 1.780, 1.900, 1.980,
  2.025, 2.160, 2.300, 2.450, 2.495, 2.620, 2.740, 2.860, 2.920,
];
const COCKPIT_FROM = CANOPY_STATIONS[0];
const COCKPIT_TO = CANOPY_STATIONS[CANOPY_STATIONS.length - 1];
/** Ячейки сечения: 16 — гребень, шаг 11.25°. */
const CREST_CELL = 16;
const WINDSCREEN_CELLS = { from: 12, to: 20 };           // ±45° от гребня
/** Подоконная линия и верх остекления кабины — прямые (ведомость, лист §1). */
export const DC3_COCKPIT_SILL_WL = 0.720;
export const DC3_COCKPIT_HEAD_WL = 1.050;

/**
 * Диапазоны ячеек считаются на КАЖДОЙ станции от постоянных высот. Фиксированный
 * диапазон гнал подоконник вверх вместе с сечением — на длине фонаря это дало
 * 0.19 м подъёма там, где на чертеже прямая.
 */
const cockpitWindowSpans = (stations: readonly number[], from: number, to: number, side: 1 | -1) =>
  Array.from({ length: to - from }, (_, index) => {
    const fs = (stations[from + index] + stations[from + index + 1]) / 2;
    // Кромку подоконника держим точно, а недостающую ширину добираем ВВЕРХ.
    // Обратный порядок опускал подоконник на тех станциях, где сечение выше, —
    // ровно та кривизна, которой на чертеже нет.
    const sill = Math.round(cellAtWl(fs, DC3_COCKPIT_SILL_WL, side));
    const head = Math.round(cellAtWl(fs, DC3_COCKPIT_HEAD_WL, side));
    return side > 0
      ? { from: Math.min(head, sill - 2), to: sill }
      : { from: sill, to: Math.max(head, sill + 2) };
  });
const WINDSCREEN_STATIONS = { from: 1, to: 4 };          // 1.171 → 1.620
const SIDE_WINDOW_STATIONS = [[3, 7], [8, 11], [12, 15]];

const canopyHoles: SkinHole[] = [
  {
    id: "windscreen", kind: "cockpit",
    fromStation: WINDSCREEN_STATIONS.from, toStation: WINDSCREEN_STATIONS.to,
    fromCell: WINDSCREEN_CELLS.from, toCell: WINDSCREEN_CELLS.to,
  },
  ...SIDE_WINDOW_STATIONS.flatMap(([from, to], index) => ([1, -1] as const).map((side) => {
    const spans = cockpitWindowSpans(CANOPY_STATIONS, from, to, side);
    return {
      id: `cockpit-window-${side > 0 ? "right" : "left"}-${index}`,
      kind: "cockpit" as const,
      fromStation: from, toStation: to,
      fromCell: spans[0].from, toCell: spans[0].to,
      cellSpans: spans,
      sillWl: DC3_COCKPIT_SILL_WL,
      headWl: DC3_COCKPIT_HEAD_WL,
    };
  })),
];

const DOOR_FROM = CABIN_SKIN_TO;
const DOOR_TO = 14.30;
const doorSteps = Math.max(2, Math.round((DOOR_TO - DOOR_FROM) / SKIN_STEP));
/** Пассажирская дверь DC-3 — левый борт, за крылом. */
const doorHoles: SkinHole[] = [
  { id: "cabin-door", fromStation: 2, toStation: 8, fromCell: 6, toCell: 10, kind: "door" },
];

emitFuselageSkin("hull-nose", 0.02, COCKPIT_FROM, { step: 0.13, capStart: true });
const cockpitSkin = emitFuselageSkin("hull-cockpit", COCKPIT_FROM, COCKPIT_TO, { stations: CANOPY_STATIONS, holes: canopyHoles });
emitFuselageSkin("hull-forward", COCKPIT_TO, CABIN_SKIN_FROM, { step: 0.21 });
const cabinSkin = emitFuselageSkin("hull-cabin", CABIN_SKIN_FROM, CABIN_SKIN_TO, { step: SKIN_STEP, holes: [...cabinWindowHoles(1), ...cabinWindowHoles(-1)] });
const doorSkin = emitFuselageSkin("hull-cabin-aft", DOOR_FROM, DOOR_TO, { step: (DOOR_TO - DOOR_FROM) / doorSteps, holes: doorHoles });
emitFuselageSkin("hull-aft", DOOR_TO, 15.20);
emitFuselageSkin("hull-tailcone", 15.20, FUSELAGE_TAIL_FS, { capEnd: true });

// ------------------------------------------------------------ лобовое стекло
/**
 * Проём фонаря закрывается ПЛОСКИМИ панелями, а не куском той же оболочки:
 * каждая панель идёт от кромки выреза к коньку по прямой, поэтому в сечении
 * появляется настоящая грань, а не продолжение круга. Кромки панели — те же
 * точки, по которым резана обшивка, поэтому щели не остаётся по построению.
 */
{
  const GLASS_SINK = 0.018;
  const ridgeAt = (fs: number, inset: number) => skinPoint(fs, CREST_CELL, inset);

  // Четверть по всему периметру выреза. Без неё снаружи видна изнанка
  // односторонней обшивки — та самая «дыра», которой на машине нет.
  {
    const hole = canopyHoles[0];
    const list = CANOPY_STATIONS;
    const reveal: Facet[] = [];
    const outer = (fs: number, cell: number) => skinPoint(fs, cell, 0);
    const inner = (fs: number, cell: number) => skinPoint(fs, cell, GLASS_SINK + 0.014);
    for (let cell = hole.fromCell; cell < hole.toCell; cell += 1) {
      const front = list[hole.fromStation]; const rear = list[hole.toStation];
      reveal.push({ points: [outer(front, cell), inner(front, cell), inner(front, cell + 1), outer(front, cell + 1)], tag: "reveal" });
      reveal.push({ points: [outer(rear, cell + 1), inner(rear, cell + 1), inner(rear, cell), outer(rear, cell)], tag: "reveal" });
    }
    for (const [index, cell] of [hole.fromCell, hole.toCell].entries()) {
      for (let station = hole.fromStation; station < hole.toStation; station += 1) {
        const a = list[station]; const b = list[station + 1];
        const quad = [outer(a, cell), inner(a, cell), inner(b, cell), outer(b, cell)];
        reveal.push({ points: index === 0 ? quad : [...quad].reverse(), tag: "reveal" });
      }
    }
    const centre = skinPoint((list[hole.fromStation] + list[hole.toStation]) / 2, CREST_CELL, GLASS_SINK);
    addFacets("windscreen-reveal", "glazing-cockpit", "metal", reveal.map((facet) => {
      const [a, b, c] = facet.points;
      const ux = b[0] - a[0]; const uy = b[1] - a[1]; const uz = b[2] - a[2];
      const vx = c[0] - a[0]; const vy = c[1] - a[1]; const vz = c[2] - a[2];
      const nx = uy * vz - uz * vy; const ny = uz * vx - ux * vz; const nz = ux * vy - uy * vx;
      let cx = 0; let cy = 0; let cz = 0;
      for (const node of facet.points) { cx += node[0]; cy += node[1]; cz += node[2]; }
      const count = facet.points.length;
      const dot = nx * (centre[0] - cx / count) + ny * (centre[1] - cy / count) + nz * (centre[2] - cz / count);
      return dot >= 0 ? facet : { points: [...facet.points].reverse(), tag: facet.tag };
    }));
  }
  const stations = CANOPY_STATIONS.slice(WINDSCREEN_STATIONS.from, WINDSCREEN_STATIONS.to + 1);
  for (const [side, cell] of [[1, WINDSCREEN_CELLS.to], [-1, WINDSCREEN_CELLS.from]] as const) {
    const name = side > 0 ? "right" : "left";
    const facets: Facet[] = [];
    for (let index = 0; index < stations.length - 1; index += 1) {
      const a = stations[index]; const b = stations[index + 1];
      const quad = [
        skinPoint(a, cell, GLASS_SINK), skinPoint(b, cell, GLASS_SINK),
        ridgeAt(b, GLASS_SINK), ridgeAt(a, GLASS_SINK),
      ];
      facets.push({ points: side > 0 ? quad : [...quad].reverse(), tag: "windscreen" });
    }
    parts.push(facetsToPart(`windscreen-${name}-glass`, "glazing-cockpit", "glazing", facets, { showEdges: false, doubleSided: true }));
  }
  // Центральная стойка по коньку и две угловые по кромкам выреза.
  addFacets("windscreen-centre-post", "glazing-cockpit", "metal",
    memberChain(stations.map((fs) => ridgeAt(fs, 0.016)), 0.052, 0.048, "post-centre"));
  for (const [side, cell] of [[1, WINDSCREEN_CELLS.to], [-1, WINDSCREEN_CELLS.from]] as const) {
    addFacets(`windscreen-corner-post-${side > 0 ? "right" : "left"}`, "glazing-cockpit", "metal",
      memberChain(stations.map((fs) => skinPoint(fs, cell, 0.016)), 0.048, 0.044, "post-corner"));
  }
  // Нижняя рама и козырёк: проём обрамлён со всех четырёх сторон.
  for (const [id, fs] of [["windscreen-sill", stations[0]], ["windscreen-brow", stations[stations.length - 1]]] as const) {
    const across = Array.from({ length: WINDSCREEN_CELLS.to - WINDSCREEN_CELLS.from + 1 }, (_, index) =>
      skinPoint(fs, WINDSCREEN_CELLS.from + index, 0.016));
    addFacets(id, "glazing-cockpit", "metal", memberChain(across, 0.048, 0.044, id));
  }
}

for (const hole of canopyHoles.filter((hole) => hole.id.startsWith("cockpit-window-"))) {
  emitOpening(hole, cockpitSkin.stations, "glazing", "glazing-cockpit");
}
for (const hole of [...cabinWindowHoles(1), ...cabinWindowHoles(-1)]) emitOpening(hole, cabinSkin.stations, "glazing", "glazing-cabin");
for (const hole of doorHoles) emitOpening(hole, doorSkin.stations, "paint-light", "door");

// ------------------------------------------------------------- обшивка крыла
const WING_SKIN_STATIONS = [
  WING_ROOT_BL, 1.9, 2.5, 3.2, DC3_WING_KINK_BL, 4.7, 5.4, 6.1, 6.8, 7.5, 8.2,
  8.9, 9.6, 10.3, 11.0, 11.7, 12.4, 13.0, 13.5, 13.9, 14.2, 14.36, SEMI_SPAN,
];
const WING_SKIN_RANGE = { from: 0, to: DC3_CONTROL_HINGE_CHORD };

for (const side of [-1, 1] as const) {
  const name = side < 0 ? "left" : "right";
  const sections = WING_SKIN_STATIONS.map((bl) => {
    const station = bl * side;
    return airfoilSection(station, 0, WING_SKIN_RANGE)
      .map((node) => toModel(node.fs, station, node.wl));
  });
  const split = WING_SKIN_STATIONS.indexOf(DC3_WING_KINK_BL);
  addShell(`hull-wing-inner-${name}`, "hull-wing", "paint-light",
    buildLoft(side < 0 ? sections.slice(0, split + 1).reverse() : sections.slice(0, split + 1), { tag: `wing-inner-${name}` }));
  addShell(`hull-wing-outer-${name}`, "hull-wing", "paint-light",
    buildLoft(side < 0 ? sections.slice(split).reverse() : sections.slice(split), { tag: `wing-outer-${name}`, capEnd: side > 0, capStart: side < 0 }));
}

// --------------------------------------------------------------------- зализ
/**
 * Зализ корня — не декоративная лента, а поверхность перехода: каждая её линия
 * начинается ТОЧНО на борту фюзеляжа и приходит на обшивку крыла. Поэтому зализ
 * физически закрывает щель и при этом не залезает внутрь чужого объёма.
 */
for (const side of [-1, 1] as const) {
  const name = side < 0 ? "left" : "right";
  const rootSection = airfoilSection(side * WING_ROOT_BL, 0, WING_SKIN_RANGE);
  const inner: ObjectPoint[] = [];
  const outer: ObjectPoint[] = [];
  for (const node of rootSection) {
    outer.push(toModel(node.fs, side * WING_ROOT_BL, node.wl));
    const half = fuselageHalfAt(node.fs, node.wl);
    inner.push(toModel(node.fs, side * Math.min(half, WING_ROOT_BL - 0.02), node.wl));
  }
  const facets: Facet[] = [];
  for (let index = 0; index < rootSection.length; index += 1) {
    const next = (index + 1) % rootSection.length;
    facets.push(side > 0
      ? { points: [inner[index], outer[index], outer[next], inner[next]], tag: "fillet" }
      : { points: [inner[next], outer[next], outer[index], inner[index]], tag: "fillet" });
  }
  // Зализ — тонкая лента, у неё нет «внутри»: опорой служит плоскость симметрии.
  addShell(`hull-fillet-${name}`, "hull-fillet", "paint-light", facets,
    toModel(ROOT_LEADING_FS + ROOT_CHORD * 0.4, 0, wingChordWl(0)));
}

// ----------------------------------------------------------------- мотогондола
/**
 * Мотогондола — не труба вокруг оси тяги. По боковой проекции чертежа она
 * круглая у капота и ГЛУБОКО уходит вниз под крылом: там ниша колеса. Поэтому
 * сечение задаётся полушириной, верхом и низом по отдельности, а не радиусом.
 */
const NACELLE_TABLE: readonly { fs: number; half: number; top: number; bottom: number }[] = [
  { fs: 3.40, half: 0.71, top: 0.71, bottom: -0.71 }, // = DC3_COWL_FRONT_FS, объявлен ниже в агрегатах
  { fs: 4.30, half: 0.74, top: 0.70, bottom: -0.95 },
  { fs: 5.20, half: 0.72, top: 0.60, bottom: -1.05 },
  { fs: 6.20, half: 0.64, top: 0.45, bottom: -1.02 },
  { fs: 7.20, half: 0.50, top: 0.30, bottom: -0.90 },
  { fs: 8.10, half: 0.32, top: 0.15, bottom: -0.70 },
  { fs: NACELLE_TAIL_FS, half: 0.14, top: 0.03, bottom: -0.50 },
];
const NACELLE_SEGMENTS = 20;

for (const side of [-1, 1] as const) {
  const bl = DC3_ENGINE_BL * side;
  const name = side < 0 ? "left" : "right";
  const axis = engineWl(bl);
  const sections = NACELLE_TABLE.map((row) => {
    const centre = axis + (row.top + row.bottom) / 2;
    const upper = row.top - (row.top + row.bottom) / 2;
    const lower = (row.top + row.bottom) / 2 - row.bottom;
    return Array.from({ length: NACELLE_SEGMENTS }, (_, index) => {
      const angle = (index / NACELLE_SEGMENTS) * Math.PI * 2;
      const cos = Math.cos(angle);
      return toModel(row.fs, bl + Math.sin(angle) * row.half, centre + (cos >= 0 ? upper : lower) * cos);
    });
  });
  addSolid(`hull-nacelle-${name}`, "hull-nacelle", "paint-light", [
    ...buildLoft(sections, { tag: `nacelle-${name}` }),
    ...capFan(sections[0], false),
    ...capFan(sections[sections.length - 1], true),
  ]);
}

/** Низ мотогондолы на станции — по нему проверяется, что колесо выходит наружу. */
export const nacelleBottomAt = (fs: number) => {
  const value = clamp(fs, NACELLE_TABLE[0].fs, NACELLE_TABLE[NACELLE_TABLE.length - 1].fs);
  let index = 0;
  while (index < NACELLE_TABLE.length - 2 && NACELLE_TABLE[index + 1].fs < value) index += 1;
  const a = NACELLE_TABLE[index];
  const b = NACELLE_TABLE[index + 1];
  const ratio = (value - a.fs) / (b.fs - a.fs);
  return engineWl(DC3_ENGINE_BL) + lerp(a.bottom, b.bottom, ratio);
};

// ------------------------------------------------------------------- оперение
/** Симметричный профиль оперения: NACA 0009 в киле и стабилизаторе. */
const symmetricHalfThickness = (position: number, thickness: number) => {
  const x = clamp(position, 0, 1);
  return 5 * thickness * (
    0.2969 * Math.sqrt(x) - 0.1260 * x - 0.3516 * x * x + 0.2843 * x * x * x - 0.1036 * x * x * x * x
  );
};
const TAIL_THICKNESS = 0.09;
/** Рули отделяются по линии навески; здесь строится только неподвижная коробка. */
export const DC3_ELEVATOR_HINGE_CHORD = 0.66;
export const DC3_RUDDER_HINGE_CHORD = 0.62;

{
  // Киль: лофт по высоте, сечение — симметричный профиль до линии навески.
  const stations = [1.45, 1.85, 2.25, 2.65, 3.05, 3.40, 3.70, 3.90, 4.01];
  const sections = stations.map((wl) => {
    const chord = finChordAt(wl);
    const length = chord.trailingFs - chord.leadingFs;
    const nodes: ObjectPoint[] = [];
    for (const position of AIRFOIL_STATIONS) {
      const value = position * DC3_RUDDER_HINGE_CHORD;
      nodes.push(toModel(chord.leadingFs + value * length, symmetricHalfThickness(value, TAIL_THICKNESS) * length, wl));
    }
    for (const position of [...AIRFOIL_STATIONS].reverse().slice(0, -1)) {
      const value = position * DC3_RUDDER_HINGE_CHORD;
      nodes.push(toModel(chord.leadingFs + value * length, -symmetricHalfThickness(value, TAIL_THICKNESS) * length, wl));
    }
    return nodes;
  });
  addShell("hull-fin", "hull-tail", "paint-light",
    buildLoft(sections, { tag: "fin", capEnd: true }),
    toModel(18.0, 0, 2.7));
}

for (const side of [-1, 1] as const) {
  const name = side < 0 ? "left" : "right";
  const stations = [0, 0.6, 1.2, 1.8, 2.4, 3.0, 3.5, 3.85, 4.10, DC3_STABILISER_SEMI_SPAN];
  const sections = stations.map((bl) => {
    const row = sampleStabiliser(bl);
    const nodes: ObjectPoint[] = [];
    for (const position of AIRFOIL_STATIONS) {
      const value = position * DC3_ELEVATOR_HINGE_CHORD;
      nodes.push(toModel(row.leadingFs + value * row.chord, bl * side, STABILISER_WL + symmetricHalfThickness(value, TAIL_THICKNESS) * row.chord));
    }
    for (const position of [...AIRFOIL_STATIONS].reverse().slice(0, -1)) {
      const value = position * DC3_ELEVATOR_HINGE_CHORD;
      nodes.push(toModel(row.leadingFs + value * row.chord, bl * side, STABILISER_WL - symmetricHalfThickness(value, TAIL_THICKNESS) * row.chord));
    }
    return nodes;
  });
  addShell(`hull-stabiliser-${name}`, "hull-tail", "paint-light",
    buildLoft(side < 0 ? [...sections].reverse() : sections, { tag: `stabiliser-${name}`, capStart: side > 0, capEnd: side < 0 }),
    toModel(17.2, side * 2.0, STABILISER_WL));
}

/** Форкиль: киль не втыкается в фюзеляж, он выходит из него зализом. */
{
  const steps = 18;
  const left: ObjectPoint[] = [];
  const right: ObjectPoint[] = [];
  const crest: ObjectPoint[] = [];
  for (let index = 0; index <= steps; index += 1) {
    const ratio = index / steps;
    const fs = lerp(14.30, FIN_TABLE[0].leadingFs + 0.35, ratio);
    const row = sampleFuselage(fs);
    const width = lerp(0.30, 0.055, ratio ** 0.8);
    const height = lerp(row.top + 0.01, FIN_TABLE[0].wl + 0.10, ratio ** 1.6);
    left.push(toModel(fs, -width, row.top - 0.02));
    right.push(toModel(fs, width, row.top - 0.02));
    crest.push(toModel(fs, 0, height));
  }
  const facets: Facet[] = [];
  for (let index = 0; index < steps; index += 1) {
    facets.push({ points: [right[index], crest[index], crest[index + 1], right[index + 1]], tag: "dorsal" });
    facets.push({ points: [crest[index], left[index], left[index + 1], crest[index + 1]], tag: "dorsal" });
    // Низ форкиля закрывается по борту: открытая с исподу лента читается
    // дырой сверху и не проходит проверку навивки.
    facets.push({ points: [left[index], right[index], right[index + 1], left[index + 1]], tag: "dorsal-base" });
  }
  facets.push({ points: [left[0], crest[0], right[0]], tag: "dorsal-cap" });
  facets.push({ points: [right[steps], crest[steps], left[steps]], tag: "dorsal-cap" });
  addShell("hull-dorsal-fillet", "hull-tail", "paint-light", facets,
    toModel(15.2, 0, sampleFuselage(15.2).top - 0.30));
}

// ---------------------------------------------------------------------------
// 14. Агрегаты (ревизия c3).
//
// Каждая подвижная группа получает ТИПИЗИРОВАННЫЙ контракт: точка шарнира, ось,
// диапазон и покой. Булев флаг в мешке — это комментарий, а не контракт, и
// ометаемый объём по нему проверить нельзя.
//
// Подпись машины: основная опора убирается ВПЕРЁД в мотогондолу, и колесо
// остаётся частично снаружи. Это требование паспорта, а не небрежность.
// ---------------------------------------------------------------------------

const RIG_GROUPS = [
  "rig-engine",
  "rig-propeller-left",
  "rig-propeller-right",
  "rig-gear",
  "control-aileron-left",
  "control-aileron-right",
  "control-flap-left",
  "control-flap-right",
  "control-elevator-left",
  "control-elevator-right",
  "control-rudder",
  "control-fixed",
] as const;

const motionGroups: MotionGroup[] = [];

// ------------------------------------------------------------------ двигатель
export const DC3_COWL_FRONT_FS = 3.40;
const COWL_REAR_FS = 4.12;
const COWL_BORE = 0.40;

for (const side of [-1, 1] as const) {
  const bl = DC3_ENGINE_BL * side;
  const name = side < 0 ? "left" : "right";
  const centreWl = engineWl(bl);

  // Капот NACA: кольцо с настоящим внутренним каналом, а не сплошной колпак.
  const ring = (fs: number, radius: number) => Array.from({ length: 20 }, (_, index) => {
    const angle = (index / 20) * Math.PI * 2;
    return toModel(fs, bl + Math.sin(angle) * radius, centreWl + Math.cos(angle) * radius);
  });
  const outerFront = ring(DC3_COWL_FRONT_FS, DC3_COWL_DIAMETER / 2 - 0.06);
  const outerBulge = ring(DC3_COWL_FRONT_FS + 0.28, DC3_COWL_DIAMETER / 2);
  const outerRear = ring(COWL_REAR_FS, DC3_COWL_DIAMETER / 2 - 0.02);
  // Канал капота расширяется за входным кольцом: внутри должны поместиться
  // цилиндры, иначе два тела делят один объём.
  const innerFront = ring(DC3_COWL_FRONT_FS, COWL_BORE);
  const innerFlare = ring(DC3_COWL_FRONT_FS + 0.18, 0.63);
  const innerRear = ring(COWL_REAR_FS, 0.68);
  const cowl: Facet[] = [];
  cowl.push(...buildLoft([outerFront, outerBulge, outerRear], { tag: "cowl-outer" }));
  cowl.push(...buildLoft([innerRear, innerFlare, innerFront], { tag: "cowl-bore" }));
  for (let index = 0; index < 20; index += 1) {
    const next = (index + 1) % 20;
    cowl.push({ points: [outerFront[index], innerFront[index], innerFront[next], outerFront[next]], tag: "cowl-lip" });
    cowl.push({ points: [innerRear[index], outerRear[index], outerRear[next], innerRear[next]], tag: "cowl-flaps" });
  }
  addSolid(`cowl-${name}`, "rig-engine", "metal", cowl);

  // Мотор за капотом: картер и передний ряд цилиндров R-1830. Он виден в
  // канале капота, поэтому существует как геометрия, а не как тёмное пятно.
  addCylinder(`engine-case-${name}`, "rig-engine", "metal",
    toModel(3.62, bl, centreWl), toModel(4.30, bl, centreWl), 0.30, 16);
  for (let index = 0; index < 7; index += 1) {
    const angle = (index / 7) * Math.PI * 2 + Math.PI / 7;
    const from = toModel(3.72, bl + Math.sin(angle) * 0.26, centreWl + Math.cos(angle) * 0.26);
    const to = toModel(3.72, bl + Math.sin(angle) * 0.56, centreWl + Math.cos(angle) * 0.56);
    addCylinder(`engine-cylinder-${name}-${index}`, "rig-engine", "metal", from, to, 0.085, 10);
  }
  // Выхлопной коллектор и патрубок: газ уходит вниз-наружу, как на машине.
  addCylinder(`exhaust-stack-${name}`, "rig-engine", "metal",
    toModel(4.20, bl + side * 0.18, centreWl - 0.62),
    toModel(5.15, bl + side * 0.30, centreWl - 0.74), 0.09, 10);
}

// -------------------------------------------------------------------- винты
const PROP_RADIUS = DC3_PROPELLER_DIAMETER / 2;
const BLADE_STATIONS = [0.18, 0.35, 0.55, 0.72, 0.86, 0.95, 1.0];
const BLADE_CHORD = [0.19, 0.31, 0.37, 0.35, 0.29, 0.19, 0.06];
const BLADE_TWIST = [42, 32, 24, 18, 14, 12, 11];

for (const side of [-1, 1] as const) {
  const bl = DC3_ENGINE_BL * side;
  const name = side < 0 ? "left" : "right";
  const centreWl = engineWl(bl);
  const group = side < 0 ? "rig-propeller-left" : "rig-propeller-right";

  // Кок винта: тело вращения, а не шар.
  const spinner: ObjectPoint[][] = [];
  for (const [index, fs] of [2.62, 2.72, 2.86, 3.02, 3.20].entries()) {
    const radius = [0.05, 0.16, 0.22, 0.24, 0.24][index];
    spinner.push(Array.from({ length: 16 }, (_, step) => {
      const angle = (step / 16) * Math.PI * 2;
      return toModel(fs, bl + Math.sin(angle) * radius, centreWl + Math.cos(angle) * radius);
    }));
  }
  addSolid(`prop-spinner-${name}`, group, "metal", [
    ...buildLoft(spinner, { tag: `spinner-${name}` }),
    ...capFan(spinner[0], false),
    ...capFan(spinner[spinner.length - 1], true),
  ]);

  for (let blade = 0; blade < 3; blade += 1) {
    const phase = (blade / 3) * Math.PI * 2;
    const sections = BLADE_STATIONS.map((fraction, index) => {
      const radius = PROP_RADIUS * fraction;
      const chord = BLADE_CHORD[index];
      const twist = radians(BLADE_TWIST[index]);
      const thickness = Math.max(chord * 0.10, 0.012);
      // Лопасть — не пластина: сечение имеет толщину и разворачивается по радиусу.
      return [
        [-chord / 2, thickness / 2], [chord / 2, thickness / 2],
        [chord / 2, -thickness / 2], [-chord / 2, -thickness / 2],
      ].map(([along, normal]) => {
        const fs = DC3_PROP_PLANE_FS + along * Math.sin(twist) + normal * Math.cos(twist);
        const span = along * Math.cos(twist) - normal * Math.sin(twist);
        return toModel(
          fs,
          bl + Math.sin(phase) * radius + Math.cos(phase) * span,
          centreWl + Math.cos(phase) * radius - Math.sin(phase) * span,
        );
      });
    });
    addSolid(`prop-blade-${name}-${blade}`, group, "metal", [
      ...buildLoft(sections, { tag: `blade-${name}-${blade}` }),
      ...capFan(sections[0], false),
      ...capFan(sections[sections.length - 1], true),
    ]);
  }
  motionGroups.push({
    id: `propeller-${name}`,
    pivot: toModel(DC3_PROP_PLANE_FS, bl, centreWl),
    axis: [0, Math.sin(DC3_GROUND_ANGLE), Math.cos(DC3_GROUND_ANGLE)],
    motion: "constant-rotation-only",
    rangeDegrees: [0, 360],
    restDegrees: 0,
    members: [`prop-spinner-${name}`, ...Array.from({ length: 3 }, (_, blade) => `prop-blade-${name}-${blade}`)],
  });
}

// -------------------------------------------------------------------- шасси
for (const side of [-1, 1] as const) {
  const name = side < 0 ? "left" : "right";
  const pivot = DC3_GEAR_PIVOT(side);
  const wheelBl = DC3_MAIN_WHEEL.bl * side;
  const wheelCentre = toModel(DC3_MAIN_WHEEL.fs, wheelBl, DC3_MAIN_WHEEL.wl);
  const pivotPoint = toModel(pivot.fs, pivot.bl, pivot.wl);

  // Амортстойка идёт от узла на лонжероне к оси колеса — это и есть её вектор.
  addFacets(`gear-oleo-${name}`, "rig-gear", "metal",
    memberFacets(pivotPoint, point(wheelCentre[0], wheelCentre[1] + 0.02, wheelCentre[2]), 0.13, 0.13, `oleo-${name}`));
  const frontSpar = sparNode(DC3_ENGINE_BL * side, DC3_FRONT_SPAR_CHORD);
  addFacets(`gear-drag-link-${name}`, "rig-gear", "metal", memberFacets(
    toModel(frontSpar.fs, pivot.bl, frontSpar.wl - 0.10),
    point(wheelCentre[0], wheelCentre[1] + 0.42, wheelCentre[2]),
    0.08, 0.09, `drag-${name}`,
  ));
  addCylinder(`gear-axle-${name}`, "rig-gear", "metal",
    point(wheelCentre[0] - side * 0.20, wheelCentre[1], wheelCentre[2]),
    point(wheelCentre[0] + side * 0.06, wheelCentre[1], wheelCentre[2]), 0.075, 10);
  // Колесо: диск и покрышка — разные тела, покрышка касается земли.
  addCylinder(`gear-hub-${name}`, "rig-gear", "metal",
    point(wheelCentre[0] - DC3_MAIN_WHEEL.width / 2 * 0.8, wheelCentre[1], wheelCentre[2]),
    point(wheelCentre[0] + DC3_MAIN_WHEEL.width / 2 * 0.8, wheelCentre[1], wheelCentre[2]), 0.30, 16);
  addCylinder(`gear-tyre-${name}`, "rig-gear", "timber-dark",
    point(wheelCentre[0] - DC3_MAIN_WHEEL.width / 2, wheelCentre[1], wheelCentre[2]),
    point(wheelCentre[0] + DC3_MAIN_WHEEL.width / 2, wheelCentre[1], wheelCentre[2]),
    DC3_MAIN_WHEEL.radius, 24);

  motionGroups.push({
    id: `main-gear-${name}`,
    pivot: pivotPoint,
    // Ось уборки — поперечная: опора складывается ВПЕРЁД в мотогондолу.
    axis: GEAR_AXIS,
    motion: "revolute",
    rangeDegrees: [0, DC3_GEAR_RETRACTION_DEGREES],
    restDegrees: 0,
    members: [`gear-oleo-${name}`, `gear-drag-link-${name}`, `gear-axle-${name}`, `gear-hub-${name}`, `gear-tyre-${name}`],
  });
}

// Хвостовая опора: вилка и колесо на своём узле.
{
  const centre = toModel(DC3_TAIL_WHEEL.fs, 0, DC3_TAIL_WHEEL.wl);
  const mount = toModel(DC3_TAIL_WHEEL.fs - 0.45, 0, sampleFuselage(DC3_TAIL_WHEEL.fs - 0.45).bottom + 0.02);
  addFacets("tailwheel-leg", "rig-gear", "metal", memberFacets(mount, point(centre[0], centre[1] + 0.10, centre[2]), 0.10, 0.12, "tail-leg"));
  for (const offset of [-1, 1]) {
    addFacets(`tailwheel-fork-${offset < 0 ? "left" : "right"}`, "rig-gear", "metal", memberFacets(
      point(centre[0] + offset * 0.10, centre[1] + 0.24, centre[2]),
      point(centre[0] + offset * 0.10, centre[1], centre[2]), 0.05, 0.05, "tail-fork",
    ));
  }
  addCylinder("tailwheel-tyre", "rig-gear", "timber-dark",
    point(centre[0] - DC3_TAIL_WHEEL.width / 2, centre[1], centre[2]),
    point(centre[0] + DC3_TAIL_WHEEL.width / 2, centre[1], centre[2]), DC3_TAIL_WHEEL.radius, 18);
}

// -------------------------------------------------------- рулевые поверхности
const AILERON_INNER_BL = 9.60;
const AILERON_OUTER_BL = 13.90;
const FLAP_INNER_BL = 1.35;
const FLAP_OUTER_BL = 9.15;
/** Зазор навески: поверхность не приварена к крылу, между ними есть щель. */
const HINGE_GAP = 0.030;

const wingSurfacePart = (
  id: string,
  group: string,
  side: -1 | 1,
  innerBl: number,
  outerBl: number,
  from: number,
  to: number,
) => {
  const stations = Array.from({ length: 7 }, (_, index) => lerp(innerBl, outerBl, index / 6));
  const sections = stations.map((bl) => {
    const station = bl * side;
    const inset = 0;
    return airfoilSection(station, inset, { from, to })
      .map((node) => toModel(node.fs, station, node.wl));
  });
  const ordered = side < 0 ? [...sections].reverse() : sections;
  addSolid(id, group, "paint-light", [
    ...buildLoft(ordered, { tag: id }),
    ...capFan(ordered[0], false),
    ...capFan(ordered[ordered.length - 1], true),
  ]);
  return { stations };
};

for (const side of [-1, 1] as const) {
  const name = side < 0 ? "left" : "right";
  const hingeFrom = DC3_CONTROL_HINGE_CHORD + HINGE_GAP / sampleWing(AILERON_INNER_BL).chord;

  wingSurfacePart(`aileron-${name}`, `control-aileron-${name}`, side, AILERON_INNER_BL, AILERON_OUTER_BL, hingeFrom, 1);
  wingSurfacePart(`flap-${name}`, `control-flap-${name}`, side, FLAP_INNER_BL, FLAP_OUTER_BL, hingeFrom, 1);
  // Неподвижные вставки: между закрылком и элероном и за элероном к законцовке.
  wingSurfacePart(`wing-trailing-gap-${name}`, "control-fixed", side, FLAP_OUTER_BL, AILERON_INNER_BL, DC3_CONTROL_HINGE_CHORD, 1);
  wingSurfacePart(`wing-trailing-tip-${name}`, "control-fixed", side, AILERON_OUTER_BL, SEMI_SPAN - 0.02, DC3_CONTROL_HINGE_CHORD, 1);
  wingSurfacePart(`wing-trailing-root-${name}`, "control-fixed", side, WING_ROOT_BL, FLAP_INNER_BL, DC3_CONTROL_HINGE_CHORD, 1);

  const hingeInner = sampleWing(AILERON_INNER_BL);
  const hingeOuter = sampleWing(AILERON_OUTER_BL);
  motionGroups.push({
    id: `aileron-${name}`,
    pivot: toModel(hingeInner.leadingFs + hingeInner.chord * DC3_CONTROL_HINGE_CHORD, AILERON_INNER_BL * side, wingChordWl(AILERON_INNER_BL)),
    axis: (() => {
      const a = toModel(hingeInner.leadingFs + hingeInner.chord * DC3_CONTROL_HINGE_CHORD, AILERON_INNER_BL * side, wingChordWl(AILERON_INNER_BL));
      const b = toModel(hingeOuter.leadingFs + hingeOuter.chord * DC3_CONTROL_HINGE_CHORD, AILERON_OUTER_BL * side, wingChordWl(AILERON_OUTER_BL));
      const length = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      return [(b[0] - a[0]) / length, (b[1] - a[1]) / length, (b[2] - a[2]) / length] as ObjectPoint;
    })(),
    motion: "revolute",
    rangeDegrees: [-20, 15],
    restDegrees: 0,
    members: [`aileron-${name}`],
  });
  const flapInner = sampleWing(FLAP_INNER_BL);
  const flapOuter = sampleWing(FLAP_OUTER_BL);
  motionGroups.push({
    id: `flap-${name}`,
    pivot: toModel(flapInner.leadingFs + flapInner.chord * DC3_CONTROL_HINGE_CHORD, FLAP_INNER_BL * side, wingChordWl(FLAP_INNER_BL)),
    axis: (() => {
      const a = toModel(flapInner.leadingFs + flapInner.chord * DC3_CONTROL_HINGE_CHORD, FLAP_INNER_BL * side, wingChordWl(FLAP_INNER_BL));
      const b = toModel(flapOuter.leadingFs + flapOuter.chord * DC3_CONTROL_HINGE_CHORD, FLAP_OUTER_BL * side, wingChordWl(FLAP_OUTER_BL));
      const length = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      return [(b[0] - a[0]) / length, (b[1] - a[1]) / length, (b[2] - a[2]) / length] as ObjectPoint;
    })(),
    motion: "revolute",
    rangeDegrees: [-40, 0],
    restDegrees: 0,
    members: [`flap-${name}`],
  });
}

// Рули высоты.
for (const side of [-1, 1] as const) {
  const name = side < 0 ? "left" : "right";
  const stations = [0.30, 1.0, 1.8, 2.6, 3.3, 3.9, 4.15, DC3_STABILISER_SEMI_SPAN - 0.02];
  const built = stations.map((bl) => {
    const row = sampleStabiliser(bl);
    const gap = HINGE_GAP / row.chord;
    const from = DC3_ELEVATOR_HINGE_CHORD + gap;
    const nodes: ObjectPoint[] = [];
    const list = AIRFOIL_STATIONS.map((value) => lerp(from, 1, value));
    for (const position of list) {
      nodes.push(toModel(row.leadingFs + position * row.chord, bl * side,
        STABILISER_WL + symmetricHalfThickness(position, TAIL_THICKNESS) * row.chord));
    }
    for (const position of [...list].reverse().slice(1)) {
      nodes.push(toModel(row.leadingFs + position * row.chord, bl * side,
        STABILISER_WL - symmetricHalfThickness(position, TAIL_THICKNESS) * row.chord));
    }
    return nodes;
  });
  const orderedElevator = side < 0 ? [...built].reverse() : built;
  addSolid(`elevator-${name}`, `control-elevator-${name}`, "paint-light", [
    ...buildLoft(orderedElevator, { tag: `elevator-${name}` }),
    ...capFan(orderedElevator[0], false),
    ...capFan(orderedElevator[orderedElevator.length - 1], true),
  ]);

  const rootRow = sampleStabiliser(0.30);
  const tipRow = sampleStabiliser(DC3_STABILISER_SEMI_SPAN - 0.02);
  const a = toModel(rootRow.leadingFs + rootRow.chord * DC3_ELEVATOR_HINGE_CHORD, 0.30 * side, STABILISER_WL);
  const b = toModel(tipRow.leadingFs + tipRow.chord * DC3_ELEVATOR_HINGE_CHORD, (DC3_STABILISER_SEMI_SPAN - 0.02) * side, STABILISER_WL);
  const length = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  motionGroups.push({
    id: `elevator-${name}`,
    pivot: a,
    axis: [(b[0] - a[0]) / length, (b[1] - a[1]) / length, (b[2] - a[2]) / length],
    motion: "revolute",
    rangeDegrees: [-25, 30],
    restDegrees: 0,
    members: [`elevator-${name}`],
  });
}

// Руль направления.
{
  const stations = [1.45, 1.90, 2.35, 2.80, 3.20, 3.55, 3.80, 3.96];
  const sections = stations.map((wl) => {
    const chord = finChordAt(wl);
    const length = chord.trailingFs - chord.leadingFs;
    const gap = HINGE_GAP / length;
    const from = DC3_RUDDER_HINGE_CHORD + gap;
    const list = AIRFOIL_STATIONS.map((value) => lerp(from, 1, value));
    const nodes: ObjectPoint[] = [];
    for (const position of list) {
      nodes.push(toModel(chord.leadingFs + position * length, symmetricHalfThickness(position, TAIL_THICKNESS) * length, wl));
    }
    for (const position of [...list].reverse().slice(1)) {
      nodes.push(toModel(chord.leadingFs + position * length, -symmetricHalfThickness(position, TAIL_THICKNESS) * length, wl));
    }
    return nodes;
  });
  addSolid("rudder", "control-rudder", "paint-light", [
    ...buildLoft(sections, { tag: "rudder" }),
    ...capFan(sections[0], false),
    ...capFan(sections[sections.length - 1], true),
  ]);
  const low = toModel(DC3_RUDDER_HINGE.low.fs, 0, DC3_RUDDER_HINGE.low.wl);
  const high = toModel(DC3_RUDDER_HINGE.high.fs, 0, DC3_RUDDER_HINGE.high.wl);
  const length = Math.hypot(high[0] - low[0], high[1] - low[1], high[2] - low[2]);
  motionGroups.push({
    id: "rudder",
    pivot: low,
    axis: [(high[0] - low[0]) / length, (high[1] - low[1]) / length, (high[2] - low[2]) / length],
    motion: "revolute",
    rangeDegrees: [-28, 28],
    restDegrees: 0,
    members: ["rudder"],
  });
}

// Антенная мачта и трос: у провода есть обе точки крепления.
{
  const mastBase = toModel(4.95, 0, sampleFuselage(4.95).top);
  const mastTop = toModel(4.95, 0, sampleFuselage(4.95).top + 0.42);
  addFacets("antenna-mast", "rig-engine", "metal", memberFacets(mastBase, mastTop, 0.05, 0.09, "mast"));
  addCylinder("antenna-wire", "rig-engine", "metal", mastTop,
    toModel(FIN_TABLE[0].leadingFs + 0.9, 0, 2.35), 0.012, 6);
}

// ---------------------------------------------------------------------------
// 15. Интерьер (ревизия c4).
//
// За стеклом обязан быть объём, иначе окно читается наклейкой. Здесь пол,
// кресла по обе стороны прохода, багажные полки, перегородки и кабина —
// ровно столько, чтобы глубина салона была видна снаружи.
// ---------------------------------------------------------------------------

const CABIN_INTERIOR_FROM = 1.95;
const CABIN_INTERIOR_TO = 13.80;

// Пол салона: настил между балками, с проходом посередине.
{
  const stations = [CABIN_INTERIOR_FROM, 3.2, 6.0, 8.5, 11.0, CABIN_INTERIOR_TO];
  const sections = stations.map((fs) => {
    const half = floorHalfWidthAt(fs);
    return [
      toModel(fs, -half, DC3_CABIN_FLOOR_WL),
      toModel(fs, half, DC3_CABIN_FLOOR_WL),
      toModel(fs, half, DC3_CABIN_FLOOR_WL - 0.04),
      toModel(fs, -half, DC3_CABIN_FLOOR_WL - 0.04),
    ];
  });
  addShell("interior-floor", "interior", "timber-mid",
    buildLoft(sections, { tag: "floor", capStart: true, capEnd: true }));
}

/** Проход между креслами — он и есть причина, по которой кресла стоят парами. */
export const DC3_AISLE_HALF_WIDTH = 0.24;
const SEAT_PITCH = 0.94;
const SEAT_ROWS = 10;

for (let row = 0; row < SEAT_ROWS; row += 1) {
  const fs = 4.30 + row * SEAT_PITCH;
  for (const side of [-1, 1] as const) {
    const inner = DC3_AISLE_HALF_WIDTH;
    const outer = Math.min(floorHalfWidthAt(fs) - 0.04, inner + 0.52);
    const centreBl = side * (inner + outer) / 2;
    const width = outer - inner;
    addBox(`seat-cushion-${row}-${side < 0 ? "left" : "right"}`, "interior", "timber-dark",
      toModel(fs, centreBl, DC3_CABIN_FLOOR_WL + 0.22), [width, 0.12, 0.48],
      [0, 0, 0]);
    addBox(`seat-back-${row}-${side < 0 ? "left" : "right"}`, "interior", "timber-dark",
      toModel(fs + 0.26, centreBl, DC3_CABIN_FLOOR_WL + 0.52), [width, 0.60, 0.10],
      [DC3_GROUND_ANGLE, 0, 0]);
  }
}

// Багажные полки над окнами: они и дают тень в глубине проёма.
for (const side of [-1, 1] as const) {
  const nodes = [4.2, 7.0, 10.0, 13.2].map((fs) => toModel(fs, side * 0.86, 0.86));
  addFacets(`interior-rack-${side < 0 ? "left" : "right"}`, "interior", "timber-mid",
    memberChain(nodes, 0.34, 0.06, "rack"));
}

// Перегородки: кабина отделена от салона, багажник — от салона.
for (const [id, fs] of [["interior-cockpit-bulkhead", 3.10], ["interior-rear-bulkhead", 13.86]] as const) {
  const row = sampleFuselage(fs);
  const centre = (row.top + row.bottom) / 2;
  const nodes = Array.from({ length: 20 }, (_, index) => {
    const angle = (index / 20) * Math.PI * 2;
    const cos = Math.cos(angle);
    const half = row.half - 0.06;
    const upper = row.top - centre - 0.06;
    const lower = centre - row.bottom - 0.06;
    return toModel(fs, half * Math.sin(angle), centre + (cos >= 0 ? upper : lower) * cos);
  });
  // Перегородка имеет толщину: сдвиг берётся тем же переходом, что и всё
  // остальное, а не вычитанием из координаты Z.
  const shifted = toModel(fs + 0.05, 0, 0);
  const base = toModel(fs, 0, 0);
  const back = nodes.map((node) =>
    point(node[0] + shifted[0] - base[0], node[1] + shifted[1] - base[1], node[2] + shifted[2] - base[2]));
  addShell(id, "interior", "timber-mid",
    buildLoft([nodes, back], { tag: id, capStart: true, capEnd: true }));
}

// Кабина: два кресла, приборная доска и штурвальные колонки.
for (const side of [-1, 1] as const) {
  const bl = side * 0.42;
  // Кресло стоит ПОД фонарём: глаз лётчика на 0.86 над полом попадает ровно в
  // подоконную линию 0.72…1.05, иначе окно смотрит в никуда.
  addBox(`cockpit-seat-${side < 0 ? "left" : "right"}`, "interior", "timber-dark",
    toModel(2.35, bl, DC3_CABIN_FLOOR_WL + 0.26), [0.46, 0.14, 0.46]);
  addBox(`cockpit-seat-back-${side < 0 ? "left" : "right"}`, "interior", "timber-dark",
    toModel(2.61, bl, DC3_CABIN_FLOOR_WL + 0.58), [0.46, 0.62, 0.10], [DC3_GROUND_ANGLE, 0, 0]);
  addFacets(`cockpit-column-${side < 0 ? "left" : "right"}`, "interior", "metal", memberFacets(
    toModel(2.05, bl, DC3_CABIN_FLOOR_WL + 0.10),
    toModel(2.20, bl, DC3_CABIN_FLOOR_WL + 0.62), 0.07, 0.07, "column"));
}
addBox("cockpit-panel", "interior", "timber-dark",
  toModel(1.86, 0, DC3_CABIN_FLOOR_WL + 0.84), [1.24, 0.44, 0.10], [DC3_GROUND_ANGLE + 0.25, 0, 0]);

// ---------------------------------------------------------------------------
// 16. Модель.
// ---------------------------------------------------------------------------

const allGroups = [...CORE_GROUPS, ...HULL_GROUPS, ...RIG_GROUPS] as const;
const hiddenExcept = (visible: readonly string[]) => allGroups.filter((group) => !visible.includes(group));

export const dc3CoreParts = parts.filter((part) => (CORE_GROUPS as readonly string[]).includes(part.group));
export const dc3HullParts = parts.filter((part) => (HULL_GROUPS as readonly string[]).includes(part.group));
export const dc3RigParts = parts.filter((part) => (RIG_GROUPS as readonly string[]).includes(part.group));

/** Верх киля в модельных координатах — восстанавливается тестом, не объявляется. */
const finTopModel = toModel(DC3_FIN_TOP.fs, 0, DC3_FIN_TOP.wl);
const noseModel = toModel(FUSELAGE_NOSE_FS, 0, 0);
const tailModel = toModel(FUSELAGE_TAIL_FS, 0, 0.9);

const views: readonly Dc3View[] = [
  { id: "front", label: "DC-3 · фронт, ортогональ", projection: "orthographic", position: point(0, 2.6, 46), target: point(0, 2.6, 0), orthoHeight: 17.6 },
  { id: "left", label: "DC-3 · левый борт, ортогональ", projection: "orthographic", position: point(-46, 2.6, -4.6), target: point(0, 2.6, -4.6), orthoHeight: 11.8 },
  { id: "rear", label: "DC-3 · корма, ортогональ", projection: "orthographic", position: point(0, 2.6, -46), target: point(0, 2.6, 0), orthoHeight: 17.6 },
  { id: "top", label: "DC-3 · план, ортогональ", projection: "orthographic", position: point(0, 44, -4.6), target: point(0, 0, -4.6), orthoHeight: 21.5, up: point(0, 0, -1) },
  { id: "front-three-quarter", label: "DC-3 · три четверти спереди", projection: "perspective", position: point(19, 8.4, 21), target: point(0, 1.9, -3.0), fov: 34 },
  { id: "rear-three-quarter", label: "DC-3 · три четверти сзади", projection: "perspective", position: point(-19, 7.4, -22), target: point(0, 1.9, -5.0), fov: 34 },
  { id: "high-three-quarter", label: "DC-3 · три четверти сверху", projection: "perspective", position: point(16, 20, 16), target: point(0, 1.2, -4.0), fov: 34 },
  { id: "underside", label: "DC-3 · снизу", projection: "perspective", position: point(6, -13, 13), target: point(0, 0.6, -3.6), fov: 38 },
  { id: "silhouette", label: "DC-3 · силуэт", projection: "orthographic", position: point(-46, 2.6, -4.6), target: point(0, 2.6, -4.6), orthoHeight: 11.8 },
  { id: "wing-root-detail", label: "DC-3 · корень крыла", projection: "perspective", position: point(7.2, 3.4, 5.6), target: point(1.6, 0.9, -1.2), fov: 34 },
  { id: "nacelle-detail", label: "DC-3 · мотогондола и узел рамы", projection: "perspective", position: point(7.4, 3.2, 7.4), target: point(2.98, 1.5, 2.0), fov: 32 },
  { id: "gear-bay-detail", label: "DC-3 · ниша шасси", projection: "perspective", position: point(6.6, 0.4, 5.4), target: point(2.82, 0.9, 0.4), fov: 34 },
  { id: "cockpit-detail", label: "DC-3 · нос и фонарь кабины", projection: "perspective", position: point(-5.2, 5.0, 9.4), target: point(0, 3.4, 4.3), fov: 30 },
  { id: "tail-detail", label: "DC-3 · оперение", projection: "perspective", position: point(-8.4, 5.4, -15.4), target: point(0, 3.0, -11.2), fov: 32 },
  { id: "cabin-section", label: "DC-3 · разрез салона (набор)", projection: "perspective", position: point(-11.4, 4.4, 3.4), target: point(0, 1.2, -2.4), fov: 34, hiddenGroups: [] },
  { id: "cabin-section-external", label: "DC-3 · тот же кадр без скрытий", projection: "perspective", position: point(-11.4, 4.4, 3.4), target: point(0, 1.2, -2.4), fov: 34 },
  { id: "window-detail", label: "DC-3 · окна салона, проём и глубина", projection: "perspective", position: point(-6.4, 3.2, -1.2), target: point(-1.1, 2.5, -2.6), fov: 30 },
  { id: "door-detail", label: "DC-3 · дверь салона, левый борт", projection: "perspective", position: point(-7.0, 2.6, -6.6), target: point(-1.0, 1.9, -7.4), fov: 30 },
  { id: "structure-only", label: "DC-3 · только силовой набор (разрез)", projection: "perspective", position: point(14, 9.4, 15), target: point(0, 1.4, -3.4), fov: 34, hiddenGroups: hiddenExcept([...CORE_GROUPS]) },
  { id: "structure-only-external", label: "DC-3 · тот же кадр без скрытий", projection: "perspective", position: point(14, 9.4, 15), target: point(0, 1.4, -3.4), fov: 34 },
];

export const dc3Object: Dc3Model = {
  id: "dc3",
  revision: "dc3-c5-nose-2026-08-09",
  title: "Douglas DC-3 · c5 нос и фонарь",
  units: "metres",
  coordinates: { up: "+Y", front: "+Z", origin: "ground-centre" },
  captureFrame: [1800, 1000],
  sourceNotes: [
    "Размах, длина, высота, площадь крыла, профиль, винт и мотор — опубликованные данные DC-3A.",
    "Обвод снят с чертежа C-47 в общественном достоянии; масштаб взят только с напечатанных размеров.",
    "Стояночный угол решён из геометрии шасси, а не вписан: бриф говорил ~11°, чертёж мерит 9.63°.",
    "Внутренний набор в источниках не показан: шаг шпангоутов и сечения авторские, силовая схема документальна.",
  ],
  dimensions: {
    span: DC3_SPAN,
    length: DC3_LENGTH,
    publishedHeight: DC3_PUBLISHED_HEIGHT,
    publishedWingArea: DC3_PUBLISHED_WING_AREA,
    recoveredWingArea: DC3_RECOVERED_WING_AREA,
    groundAngleDegrees: degrees(DC3_GROUND_ANGLE),
    fuselageMaxWidth: DC3_FUSELAGE_MAX_WIDTH,
    fuselageMaxDepth: DC3_FUSELAGE_MAX_DEPTH,
    wingKinkBl: DC3_WING_KINK_BL,
    dihedralDegrees: DC3_WING_DIHEDRAL_DEGREES,
    engineBl: DC3_ENGINE_BL,
    propellerDiameter: DC3_PROPELLER_DIAMETER,
    mainWheelRadius: DC3_MAIN_WHEEL.radius,
    tailWheelRadius: DC3_TAIL_WHEEL.radius,
    wheelTrack: 2 * DC3_MAIN_WHEEL.bl,
    wheelBase: DC3_TAIL_WHEEL.fs - DC3_MAIN_WHEEL.fs,
    stabiliserSpan: 2 * DC3_STABILISER_SEMI_SPAN,
    cabinFloorWl: DC3_CABIN_FLOOR_WL,
  },
  labMetrics: [
    { label: "SPAN", value: DC3_SPAN, decimals: 3, signed: false },
    { label: "LENGTH", value: DC3_LENGTH, decimals: 3, signed: false },
    { label: "GROUND ANGLE", value: degrees(DC3_GROUND_ANGLE), decimals: 2, signed: false, unit: "°" },
    { label: "WING AREA", value: DC3_RECOVERED_WING_AREA, decimals: 1, signed: false, unit: "m2" },
    { label: "CORE PARTS", value: dc3CoreParts.length, decimals: 0, signed: false, unit: "" },
    { label: "HULL PARTS", value: dc3HullParts.length, decimals: 0, signed: false, unit: "" },
    { label: "RIG PARTS", value: dc3RigParts.length, decimals: 0, signed: false, unit: "" },
  ],
  anchors: {
    noseTip: noseModel,
    tailCone: tailModel,
    finTop: finTopModel,
    // Пятна контакта ВЫЧИСЛЯЮТСЯ: центр колеса через `toModel`, минус радиус по
    // мировой вертикали. Если стояночный угол решён неверно, они разъедутся по Y,
    // и тест это увидит — объявить их нулями было бы подлогом.
    mainWheelContactLeft: wheelContact(DC3_MAIN_WHEEL.fs, -DC3_MAIN_WHEEL.bl, DC3_MAIN_WHEEL.wl, DC3_MAIN_WHEEL.radius),
    mainWheelContactRight: wheelContact(DC3_MAIN_WHEEL.fs, DC3_MAIN_WHEEL.bl, DC3_MAIN_WHEEL.wl, DC3_MAIN_WHEEL.radius),
    tailWheelContact: wheelContact(DC3_TAIL_WHEEL.fs, 0, DC3_TAIL_WHEEL.wl, DC3_TAIL_WHEEL.radius),
    engineHubLeft: toModel(DC3_ENGINE_FS, -DC3_ENGINE_BL, engineWl(-DC3_ENGINE_BL)),
    engineHubRight: toModel(DC3_ENGINE_FS, DC3_ENGINE_BL, engineWl(DC3_ENGINE_BL)),
  },
  motionConstraints: {
    poseAuthoredInAircraftFrame: true,
    emittedInParkedPose: true,
    aerodynamicsExcluded: true,
    worldPlacementExcluded: true,
    controlSurfacesFrozenThisRevision: true,
  },
  motionGroups,
  labEnvironment: { floorRadius: 34, gridSize: 68, gridDivisions: 68, fogNear: 70, fogFar: 130, floorY: -0.02 },
  materialOverrides: {
    // Полированный дюраль тридцатых: светлый, но не белый, и заметно
    // отражающий — иначе машина читается пластмассовой.
    "paint-light": { color: 0xb9bdbe, roughness: 0.38, metalness: 0.55 },
    metal: { color: 0x82898d, roughness: 0.52, metalness: 0.48 },
    "timber-dark": { color: 0x23262a, roughness: 0.92 },
    "timber-mid": { color: 0x5a5450, roughness: 0.86 },
  },
  parts,
  views,
};
