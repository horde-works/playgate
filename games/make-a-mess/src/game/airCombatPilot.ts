import type { SceneVector3 } from "./destructionScene.ts";
import { explosiveProfile } from "./destructionRuntime.ts";
import type { VehicleGuidanceDemand } from "./vehicleFrames.ts";
import {
  chooseAirManoeuvre,
  predictionHorizon,
  type AirManoeuvreEstimate,
  type AirManoeuvreKind,
} from "./airCombatManoeuvres.ts";
import { isHostileAllegiance, type VehicleAllegiance } from "./vehicleAllegiance.ts";
import {
  advanceGunnery,
  armGunneryForPass,
  closingSpeedTo,
  createGunneryState,
  extrapolateTrack,
  interceptSolution,
  raySolution,
  type AirCombatTrack,
  type GunneryShot,
  type GunneryState,
  type VehicleArmament,
} from "./vehicleGunnery.ts";

/**
 * АВТОМАТ ВОЗДУШНОГО БОЯ.
 *
 * Третий клиент границы `VehicleGuidanceDemand` наравне с автопилотом маршрута
 * и ручным пилотом: он владеет ТОЛЬКО наведением. Позу, микшер и стабилизацию
 * моторов по-прежнему держит контроллер винтокрылой, и ни одна строчка отсюда
 * не знает ни про кольца, ни про лопасти, ни про Rapier.
 *
 * Полный разбор с числами и источниками — `docs/air-combat-lessons.md`. Три
 * закона оттуда, которые объясняют, почему код выглядит именно так:
 *
 *  1. ЗАХОД — ЭТО ПРОХОД. Машина, пересчитывающая оптимальную траекторию
 *     каждый кадр, приклеивается к хвосту и висит там: оптимально и совершенно
 *     не смотрится. Поэтому у атаки есть ОБЯЗАТЕЛЬСТВО, взятое на входе, и
 *     кончается она срывом, а не доводкой.
 *  2. СВЯЗЫВАЕТ НОС, А НЕ ТЯГА. Поперечного ускорения хватает на вираж
 *     радиусом v²/14.5, но нос успевает за ним только на большой скорости.
 *  3. ПОЭТОМУ МАШИНА ХОДИТ КРАБОМ. Она голономна: скорость направляется мимо
 *     цели (проход), а нос держится на цели (огонь). Это не трюк, а
 *     единственный способ стрелять из неподвижного ствола, пока рыскание не
 *     поспевает за виражом.
 *
 * И одно физическое следствие, которое определяет всю вертикаль боя:
 * СТВОЛ ЖЁСТКО СВЯЗАН С КОРПУСОМ, А КОРПУС КРЕНИТСЯ ОТ РАЗГОНА. Наклонить
 * ствол отдельно нечем, команды тангажа в контракте наведения нет. Значит
 * вертикальное наведение делается ВЫСОТОЙ: машина встаёт на такую высоту,
 * чтобы её собственная — уже наклонённая — ось прошла через цель. Отсюда же
 * следует, чем цель защищается: перепад высоты сбивает наводку сильнее, чем
 * поворот.
 */

const EPSILON = 1e-6;

export type AirCombatMode =
  | "station"
  | "intercept"
  | "attack"
  | "break"
  | "reposition"
  | "disengage";

/** Периметр, который машина стережёт. */
export interface AirCombatStation {
  readonly centre: SceneVector3;
  readonly radius: number;
  /** Высота орбиты над центром периметра, м. */
  readonly altitude: number;
  readonly speed: number;
  /** Дальность, с которой чужой борт становится задачей, м. */
  readonly detectionRange: number;
}

/** Что машина знает о себе. Всё измеримо, ничего не «сообщается». */
export interface AirCombatOwnState {
  readonly allegiance: VehicleAllegiance;
  readonly centre: SceneVector3;
  readonly velocity: SceneVector3;
  /** Горизонтальный единичный нос. */
  readonly nose: readonly [number, number];
  /**
   * ФАКТИЧЕСКАЯ ось ствола в мире — с креном и тангажом, а не идеализированная
   * горизонталь. Именно по ней летит снаряд, поэтому именно она и решает.
   */
  readonly gunAxis: SceneVector3;
  readonly verticalSpeed: number;
  /** Радиус описанной сферы машины, м. */
  readonly radius: number;
}

export interface AirCombatLimits {
  readonly maximumSpeed: number;
  readonly yawRate: number;
  readonly liftTrimRange: number;
  /** Поперечное ускорение по наклону, м/с²: из него угловая скорость виража. */
  readonly lateralAcceleration: number;
  /** Секунды и цена высоты на разворот курса фигурой. `null` — фигур нет. */
  readonly reversal?: { readonly seconds: number; readonly cost: number } | null;
}

export interface AirCombatState {
  readonly mode: AirCombatMode;
  readonly modeSeconds: number;
  readonly targetId: string | null;
  /** Сколько заходов уже сделано по текущей цели. */
  readonly passes: number;
  /** Сторона обхода следующего захода: +1 правым бортом, −1 левым. */
  readonly passSide: number;
  /** Вертикальная плоскость следующего захода: +1 сверху, −1 снизу. */
  readonly passVertical: number;
  /**
   * ВЫБРАННОЕ КОЛЬЦО ДЕРЖИТСЯ ВЕСЬ ЗАХОД.
   *
   * Пересчёт каждый кадр телепортировал точку прицеливания между кольцами на
   * четыре метра и рвал сопровождение: доля кадров с лучом на цели упала с 40
   * до 9 процентов, хотя сама наводка стала «умнее». Обязательство, взятое на
   * входе в заход, распространяется и на то, КУДА бить.
   */
  readonly weakPointIndex: number | null;
  /** Скорость, с которой машина ВОШЛА в текущий заход, м/с. */
  readonly passEntrySpeed: number;
  readonly gunnery: GunneryState;
  readonly orbitPhase: number;
  /** Диагностика ритма: секунд в бою от первого обнаружения. */
  readonly engagementSeconds: number;
}

export interface AirCombatTelemetry {
  readonly range: number;
  readonly closingSpeed: number;
  /** Угол между осью ствола и направлением на точку встречи, рад. */
  readonly aimError: number;
  /** Промах луча пушки по перпендикуляру, м. */
  readonly cannonMiss: number;
  /** Угол выхода: между курсом цели и линией визирования, рад. */
  readonly angleOff: number;
  readonly aimPoint: SceneVector3 | null;
  readonly minimumRange: number;
  readonly weaponsFree: boolean;
  /** Ракет в поду прямо сейчас. */
  readonly rocketsLeft: number;
  /** Под пуст и снаряжается. */
  readonly reloading: boolean;
  /** Сколько ещё снаряжаться, с. */
  readonly rearmSeconds: number;
  /** Что выбрал оценщик и за сколько секунд обещает решение. */
  readonly manoeuvre: AirManoeuvreKind | null;
  readonly manoeuvreSeconds: number;
}

export interface AirCombatOutput {
  readonly state: AirCombatState;
  readonly guidance: VehicleGuidanceDemand;
  readonly shots: readonly GunneryShot[];
  readonly telemetry: AirCombatTelemetry;
}

export function createAirCombatState(magazine = 0): AirCombatState {
  return {
    mode: "station",
    modeSeconds: 0,
    targetId: null,
    passes: 0,
    passSide: 1,
    passVertical: 1,
    weakPointIndex: null,
    passEntrySpeed: 0,
    gunnery: createGunneryState(magazine),
    orbitPhase: 0,
    engagementSeconds: 0,
  };
}

// ---------------------------------------------------------------------------
// Векторная мелочь
// ---------------------------------------------------------------------------

function subtract(a: SceneVector3, b: SceneVector3): SceneVector3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function length(v: SceneVector3): number {
  return Math.hypot(v[0], v[1], v[2]);
}

function normalize(v: SceneVector3): SceneVector3 {
  const l = length(v);
  return l < EPSILON ? [0, 0, 1] : [v[0] / l, v[1] / l, v[2] / l];
}

function dot(a: SceneVector3, b: SceneVector3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function horizontalUnit(v: SceneVector3): readonly [number, number] {
  const l = Math.hypot(v[0], v[2]);
  return l < EPSILON ? [0, 1] : [v[0] / l, v[2] / l];
}

/** Ниже этого над бертом станции боевой автомат не опускается, м. */
const COMBAT_FLOOR = 8;

/**
 * Знаковая ошибка курса. Положительный результат требует ПОЛОЖИТЕЛЬНОГО темпа
 * рыскания: угловая скорость вокруг +Y поворачивает +Z к +X, то же соглашение,
 * что у `rotated()` в паспорте машины и у экстраполяции цели.
 */
function headingError(
  nose: readonly [number, number],
  desired: readonly [number, number],
): number {
  return Math.atan2(
    desired[0] * nose[1] - desired[1] * nose[0],
    desired[0] * nose[0] + desired[1] * nose[1],
  );
}

/**
 * Мировая горизонтальная скорость → оси машины. Правый борт по соглашению
 * ПРОЕКТА: `(−nz, nx)` (`rotorcraftDynamics.ts:1835-1852` — там же разобрано,
 * чего стоило разойтись в знаке).
 */
function bodyFrameSpeeds(
  world: SceneVector3,
  nose: readonly [number, number],
): { readonly forward: number; readonly lateral: number } {
  return {
    forward: world[0] * nose[0] + world[2] * nose[1],
    lateral: world[2] * nose[0] - world[0] * nose[1],
  };
}

// ---------------------------------------------------------------------------
// Выбор цели
// ---------------------------------------------------------------------------

/**
 * ЦЕЛЬ — БЛИЖАЙШИЙ ЧУЖОЙ БОРТ В ВОЗДУХЕ.
 *
 * Севшая цель не цель: штатно приземлившаяся машина снимает задачу. Признак
 * посадочный, а не «низко» — это тот же критерий, которым кончается рейс.
 */
export function selectAirCombatTarget(
  own: AirCombatOwnState,
  station: AirCombatStation,
  tracks: readonly AirCombatTrack[],
): AirCombatTrack | null {
  let best: AirCombatTrack | null = null;
  let bestRange = Infinity;
  for (const track of tracks) {
    if (track.failed || track.landed) {
      continue;
    }
    if (!isHostileAllegiance(own.allegiance, track.allegiance)) {
      continue;
    }
    const range = length(subtract(track.centre, own.centre));
    if (range > station.detectionRange) {
      continue;
    }
    if (range < bestRange) {
      best = track;
      bestRange = range;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Геометрия захода
// ---------------------------------------------------------------------------

/**
 * СКОЛЬКО ВРЕМЕНИ НОСУ ЕХАТЬ ДО ЦЕЛИ — и есть упреждение мгновенного луча.
 *
 * Снаряд пушки приходит в тот же кадр, поэтому баллистического упреждения у
 * неё нет. А вот нос доворачивается с конечным темпом, и целиться надо туда,
 * где цель окажется, когда он доедет. Это не «поправка», а полноценное
 * упреждение — просто его источник не время полёта, а инерция планера.
 */
export function noseLagSeconds(
  own: AirCombatOwnState,
  track: AirCombatTrack,
  limits: AirCombatLimits,
): number {
  const bearing = horizontalUnit(subtract(track.centre, own.centre));
  const error = Math.abs(headingError(own.nose, bearing));
  return Math.min(1.6, error / Math.max(limits.yawRate, 0.05));
}

/**
 * КУДА БИТЬ: выбор уязвимой точки.
 *
 * Требование Igor — «не худо бы понимать, что это за судно и какие его слабые
 * места». У винтокрылой машины они ВЫЧИСЛИМЫ, а не назначены: её роняет потеря
 * СТОРОНЫ, поэтому ценность кольца определяется не им самим, а состоянием
 * соседей. Одно выбитое кольцо делает решающими оба соседних.
 *
 * Соседство считается из геометрии — два ближайших кольца, — а не приходит
 * данными: атакующий видит машину снаружи и вправе разобраться в её раскладке
 * сам. Второе слагаемое — цена доворота: при равной ценности бьют в то кольцо,
 * которое ближе к оси.
 *
 * Зачем это вообще понадобилось: стенд дал 55 попаданий пушкой из 63 выстрелов
 * и НОЛЬ снятых лопастей. Прицел стоял в центроид, то есть в корпус, где у
 * машины ничего важного нет.
 */
const NEIGHBOUR_WEIGHT = 2.4;
const DEAD_RING = 0.2;
/**
 * ДЕРЖАТЬ ВЫБОР, НО НЕ ЦЕПЛЯТЬСЯ ЗА НЕГО.
 *
 * Пересчёт каждый кадр рвал сопровождение: точка прицеливания прыгала между
 * кольцами на четыре метра, и доля кадров с лучом на цели упала с 40 до 9
 * процентов. Жёсткая фиксация на весь заход оказалась ещё хуже — машина
 * держалась за кольцо, ушедшее на дальнюю сторону корпуса, семьдесят шесть
 * секунд не могла собрать решение и не сделала ни выстрела.
 *
 * Правильно — гистерезис: смена только тогда, когда другое кольцо заметно
 * выгоднее. Так выбор устойчив, но не слеп.
 */
const WEAK_POINT_HYSTERESIS = 0.55;

export function selectWeakPoint(
  own: AirCombatOwnState,
  track: AirCombatTrack,
  held: number | null = null,
): number | null {
  const rings = track.weakPoints;
  if (rings.length === 0) {
    return null;
  }
  const axis = normalize(own.gunAxis);
  let best: number | null = null;
  let bestScore = -Infinity;
  for (let index = 0; index < rings.length; index += 1) {
    const ring = rings[index];
    if (ring.health <= DEAD_RING) {
      continue;
    }
    const neighbourLoss = rings
      .map((other, otherIndex) => ({
        otherIndex,
        distance: length(subtract(other.point, ring.point)),
        health: other.health,
      }))
      .filter((entry) => entry.otherIndex !== index)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 2)
      .reduce((worst, entry) => Math.max(worst, 1 - entry.health), 0);
    const toRing = normalize(subtract(ring.point, own.centre));
    const angle = Math.acos(Math.max(-1, Math.min(1, dot(toRing, axis))));
    const score =
      NEIGHBOUR_WEIGHT * neighbourLoss -
      angle +
      (index === held ? WEAK_POINT_HYSTERESIS : 0);
    if (score > bestScore) {
      bestScore = score;
      best = index;
    }
  }
  return best;
}

/**
 * Ракурс: ноль — цель уходит от нас (погоня в хвост, лучшая стрелковая
 * геометрия), π — идёт в лоб. Большой ракурс означает быстрое сближение и
 * почти недостижимое огневое решение — это и есть повод переложить заход, а
 * не тянуть спуск.
 */
function aspectAngleOf(own: AirCombatOwnState, track: AirCombatTrack): number {
  const line = horizontalUnit(subtract(track.centre, own.centre));
  const course = horizontalUnit(track.velocity);
  const cosine = Math.max(-1, Math.min(1, line[0] * course[0] + line[1] * course[1]));
  return Math.acos(cosine);
}

/**
 * ВОРОТА ВХОДА В АТАКУ.
 *
 * Первый прогон стенда вошёл в атаку с ошибкой прицела 109° и провёл в ней
 * 51 секунду из девяноста, не сделав НИ ОДНОГО выстрела: конверт по дальности
 * выполнялся, а нос смотрел мимо всё это время. Атака — это проход по
 * стрелковой кривой, и объявлять её, когда решение недостижимо, значит
 * подменять бой его видимостью.
 */
const ATTACK_ENTRY_AIM = 0.5;
/** Заход развалился: решение ушло дальше, чем нос успеет вернуть за проход. */
const ATTACK_ABORT_AIM = 1.15;
/**
 * Жёсткая нижняя граница. Тот же прогон увёл машину на 35 метров ПОД палубу:
 * высотное упреждение считалось от наклона ствола на всей дальности, и на 70 м
 * качание тангажа давало команду в двадцать метров. Настоящая боевая
 * автоматика имеет пол, и он не обсуждается.
 */
const HARD_DECK = 6;
/**
 * Высотное упреждение работает только В ПУШЕЧНОМ КОНВЕРТЕ и ограничено.
 * Далеко оно физически верно (луч действительно уходит вниз на `range·gunY`),
 * но там оно и не нужно, а тангаж на подходе качается от разгона — команда
 * начинает мотать машину по вертикали вместо наведения.
 */
const AIM_ALTITUDE_LIMIT = 14;

// ---------------------------------------------------------------------------
// Автомат
// ---------------------------------------------------------------------------

export interface AirCombatInput {
  readonly own: AirCombatOwnState;
  readonly station: AirCombatStation;
  readonly armament: VehicleArmament;
  readonly limits: AirCombatLimits;
  readonly tracks: readonly AirCombatTrack[];
  readonly deltaSeconds: number;
}

/**
 * ГЕОМЕТРИЮ ПРОХОДА ДИКТУЕТ РЫСКАНИЕ, А НЕ ГАБАРИТ.
 *
 * Проход идёт мимо цели, а не в неё: скорость направляется в точку, отнесённую
 * поперёк линии визирования. Этот вынос и рождает краб — нос остаётся на цели,
 * пока машина проходит рядом.
 *
 * Но вынос нельзя брать от габаритов. Проходя мимо цели на расстоянии d со
 * скоростью v, машина обязана вращать нос с темпом примерно v/d, чтобы не
 * упустить её с оси. Замер первого прогона: вынос 12 м при 17 м/с требовал
 * 1.4 рад/с при располагаемых 0.72 — нос отставал на 24°, луч уходил мимо на
 * одиннадцать метров при габарите цели 3.1, и машина не попадала НИКОГДА,
 * оставаясь при этом формально в конверте.
 *
 *     d ≥ v / ω
 *
 * Это и есть настоящий радиус боя у машины с неподвижным стволом. Габарит
 * остаётся нижней границей — ближе просто нельзя, — но решает не он.
 */
const PASS_TRACKING_MARGIN = 1.2;
/**
 * Скорость прохода задаётся долей предельной, а НЕ текущей.
 *
 * От текущей получалась петля: медленнее идёшь — меньше вынос — меньше
 * разрешённая скорость. Стенд устоялся на 8.6 м/с при располагаемых 21 —
 * машина кралась вместо прохода, и заходов за полторы минуты вышло шесть.
 */
const PASS_SPEED_SHARE = 0.75;

function passOffsetDistance(
  own: AirCombatOwnState,
  track: AirCombatTrack,
  limits: AirCombatLimits,
): number {
  // ПЕЛЕНГ КРУТИТ ОТНОСИТЕЛЬНОЕ ДВИЖЕНИЕ, А НЕ СОБСТВЕННОЕ.
  //
  // Первый вывод учитывал только свою скорость и дал вынос 26 м. Замер: цель
  // идёт ещё одиннадцать метров в секунду, на встречных курсах составляющие
  // складываются, требуемый темп выходил 0.77 рад/с при располагаемых 0.72 —
  // и ошибка прицела держалась на 0.34 рад при воротах 0.12. Мажет не наводка,
  // мажет геометрия захода.
  const nominal = limits.maximumSpeed * PASS_SPEED_SHARE;
  const closing = nominal + Math.hypot(track.velocity[0], track.velocity[2]);
  const trackable = (closing / Math.max(limits.yawRate, 0.05)) * PASS_TRACKING_MARGIN;
  return Math.max(own.radius + track.radius + 4, trackable);
}


/**
 * И ОБРАТНОЕ СЛЕДСТВИЕ: скорость прохода ограничена тем же неравенством.
 * Проход быстрее, чем нос способен обслужить на выбранном выносе, — это заход
 * без единого выстрела, что стенд и показал.
 */
function passSpeed(
  offset: number,
  track: AirCombatTrack,
  limits: AirCombatLimits,
): number {
  const budget =
    (limits.yawRate * offset) / PASS_TRACKING_MARGIN -
    Math.hypot(track.velocity[0], track.velocity[2]);
  return Math.max(6, Math.min(limits.maximumSpeed, budget));
}

export interface AirCombatStepInput extends AirCombatInput {
  readonly state: AirCombatState;
}

export function stepAirCombat(input: AirCombatStepInput): AirCombatOutput {
  const { own, station, armament, limits, state, deltaSeconds } = input;
  const rocketSpeed = explosiveProfile(armament.rockets.explosive).projectile.speed;

  const target = selectAirCombatTarget(own, station, input.tracks);
  const holdsTarget = target !== null;

  // --- решение и геометрия -------------------------------------------------
  const cannonMuzzle = armament.cannon.mounts[0].muzzle;
  // Дульный срез едет с машиной: авторская точка переносится тем же выносом,
  // что и центр. Полной позы здесь не нужно — вынос ствола вдоль оси уже учтён
  // в дальности, а поперечная поправка на 3.4 м меньше габарита цели.
  const muzzleWorld: SceneVector3 = [
    own.centre[0] + own.gunAxis[0] * cannonMuzzle[2],
    own.centre[1] + own.gunAxis[1] * cannonMuzzle[2],
    own.centre[2] + own.gunAxis[2] * cannonMuzzle[2],
  ];

  let range = Infinity;
  let closingSpeed = 0;
  let aimPoint: SceneVector3 | null = null;
  // Упреждение, с которым строится ПРИЦЕЛ. Телу его нужно знать: вести
  // корпус с меньшим упреждением, чем ствол, — это шаг назад к погоне.
  let aimLead = 0;
  let rocketAim: SceneVector3 | null = null;
  let aimError = Math.PI;
  /**
   * Ошибка ПО ПЕЛЕНГУ, без вертикали.
   *
   * Вход в атаку решается ею, а не полной пространственной ошибкой, и это
   * важное разделение. На сближении машина разгоняется, от разгона опускается
   * нос, и вертикальная составляющая держит полную ошибку выше любых ворот —
   * замер: 136 секунд из ста пятидесяти машина провела в сближении, ни разу не
   * войдя в атаку по формально верному признаку.
   *
   * Между тем вертикаль на проходе лечится сама: проход идёт на постоянной
   * скорости (тангаж уходит), а остаток добирает высотная поправка. Вход же —
   * вопрос ГЕОМЕТРИИ: смотрю ли я в ту сторону.
   */
  let bearingError = Math.PI;
  let weakPointIndex: number | null = state.weakPointIndex;
  let cannonMiss = Infinity;
  let cannonSolved = false;
  let rocketSolved = false;
  let angleOff = 0;

  if (target) {
    range = length(subtract(target.centre, own.centre));
    closingSpeed = closingSpeedTo(own.centre, own.velocity, target);
    angleOff = aspectAngleOf(own, target);

    // ЦЕЛЯТСЯ В КОЛЬЦО, А НЕ В ЦЕНТРОИД. Кольцо едет вместе с телом, поэтому
    // решение считается по треку, у которого центр подменён уязвимой точкой:
    // скорость у неё та же, а за время полёта ракеты собственное вращение тела
    // сдвигает её меньше, чем на её же радиус.
    const held =
      state.weakPointIndex !== null &&
      state.weakPointIndex < target.weakPoints.length &&
      target.weakPoints[state.weakPointIndex].health > DEAD_RING
        ? state.weakPointIndex
        : null;
    weakPointIndex = selectWeakPoint(own, target, held);
    const weakPoint =
      weakPointIndex !== null ? target.weakPoints[weakPointIndex].point : null;
    const aimTrack: AirCombatTrack = weakPoint
      ? { ...target, centre: weakPoint }
      : target;
    // ЦЕЛЯТСЯ В КОЛЬЦО, А СТРЕЛЯЮТ ПО СИЛУЭТУ, и это не поблажка.
    //
    // Ворота огня по кольцу геометрически несовместимы с устойчивым
    // сопровождением: на 33 м пеленг уходит на 0.08 рад за окно 0.22 с, то
    // есть цель пересекает метровое кольцо ПОПЕРЁК быстрее, чем решение
    // успевает устояться. Стенд это и показал — луч ложился в кольцо в девяти
    // процентах кадров, а очередь не открывалась ни разу.
    //
    // Настоящая пушка работает иначе: наводятся в уязвимое место, а огонь
    // ведут, пока луч на МАШИНЕ. Тогда очередь ложится вокруг выбранного
    // кольца, и лопасти достаются ей сами.
    const hitRadius = target.radius;

    // Пушка: упреждение контура управления.
    const lag = noseLagSeconds(own, target, limits);
    aimLead = lag;
    aimPoint = extrapolateTrack(aimTrack, lag);

    // Ракета: честное решение встречи в системе стрелка.
    const solution = interceptSolution(muzzleWorld, own.velocity, aimTrack, rocketSpeed);
    rocketAim = solution.aimPoint;
    const toSolution = normalize(subtract(solution.aimPoint, muzzleWorld));
    aimError = Math.acos(
      Math.max(-1, Math.min(1, dot(toSolution, normalize(own.gunAxis)))),
    );
    rocketSolved = solution.converged;
    bearingError = Math.abs(
      headingError(own.nose, horizontalUnit(subtract(solution.aimPoint, own.centre))),
    );

    const ray = raySolution(
      muzzleWorld,
      own.gunAxis,
      aimTrack.centre,
      hitRadius,
      armament.cannon.range,
    );
    cannonMiss = ray.missDistance;
    cannonSolved = ray.onTarget;
  }

  // --- переходы ------------------------------------------------------------
  const passOffset = target ? passOffsetDistance(own, target, limits) : 0;
  const breakRange = target ? own.radius + target.radius + 6 : 0;
  // Дистанция нового захода. Прежние +34 м давали цикл в восемнадцать секунд:
  // машина уходила на шестьдесят метров и возвращалась. Вертолётный бой, по
  // источникам, «быстрый и яростный», и ритм обязан это показывать.
  const reattackRange = target ? passOffset + 12 : 0;

  let mode = state.mode;
  let passes = state.passes;
  let passSide = state.passSide;
  let passVertical = state.passVertical;
  let modeSeconds = state.modeSeconds + deltaSeconds;
  let passEntrySpeed = state.passEntrySpeed;
  let armed = false;

  const changeTo = (next: AirCombatMode) => {
    if (next !== mode) {
      mode = next;
      modeSeconds = 0;
    }
  };

  if (!holdsTarget) {
    changeTo(state.mode === "station" ? "station" : "disengage");
    if (mode === "disengage" && modeSeconds > 1.5) {
      changeTo("station");
    }
  } else {
    switch (mode) {
      case "station":
      case "disengage":
        changeTo("intercept");
        break;
      case "intercept":
        // ВХОД В АТАКУ — ЭТО РЕШЕНИЕ, А НЕ ДАЛЬНОСТЬ. Нужны все три: цель в
        // конверте, машина идёт на неё, и нос уже настолько близко к решению,
        // что проход имеет шанс кончиться выстрелом.
        if (
          range <= armament.rockets.range &&
          closingSpeed > 0 &&
          bearingError <= ATTACK_ENTRY_AIM
        ) {
          changeTo("attack");
          armed = true;
          passEntrySpeed = Math.max(
            8,
            Math.min(
              passSpeed(passOffset, target, limits),
              Math.hypot(own.velocity[0], own.velocity[2]),
            ),
          );
        }
        break;
      case "attack":
        // ЗАХОД КОНЧАЕТСЯ СРЫВОМ. Признаки конца прохода: подошли вплотную,
        // разошлись (проход состоялся), решение развалилось, время вышло.
        if (
          range <= breakRange ||
          (closingSpeed < 0 && range > armament.cannon.range * 0.5) ||
          bearingError > ATTACK_ABORT_AIM ||
          modeSeconds > 6
        ) {
          passes += 1;
          // Следующий заход — С ДРУГОЙ СТОРОНЫ И ИЗ ДРУГОЙ ПЛОСКОСТИ. Это и
          // разводит кадры, и мешает цели строить защиту под один шаблон.
          passSide = -passSide;
          passVertical = passes % 2 === 0 ? -passVertical : passVertical;
          weakPointIndex = null;
          changeTo("break");
        }
        break;
      case "break":
        if (range >= reattackRange || modeSeconds > 2.2) {
          changeTo("reposition");
        }
        break;
      case "reposition":
        if (range >= reattackRange || modeSeconds > 3) {
          changeTo("intercept");
        }
        break;
    }
  }

  // --- ЧЕМ ЗАКРЫТЬ ЭТУ ВСТРЕЧУ ----------------------------------------------
  const manoeuvre: AirManoeuvreEstimate | null = target
    ? chooseAirManoeuvre(
        {
          own: { centre: own.centre, velocity: own.velocity, nose: own.nose },
          target: {
            centre: target.centre,
            velocity: target.velocity,
            turnRate: target.turnRate,
          },
        },
        {
          maximumSpeed: limits.maximumSpeed,
          lateralAcceleration: limits.lateralAcceleration,
          surgeAcceleration: 0,
          yawRate: limits.yawRate,
          firingRange: armament.rockets.range,
          minimumRange: 0,
          gunCone: ATTACK_ENTRY_AIM,
          reversal: limits.reversal ?? null,
          floor: station.centre[1] + COMBAT_FLOOR,
        },
      )
    : null;

  // --- кривая --------------------------------------------------------------
  const desiredVelocity: [number, number, number] = [0, 0, 0];
  let desiredHeading: readonly [number, number] = own.nose;
  let desiredAltitude = station.centre[1] + station.altitude;

  const applyDirection = (direction: SceneVector3, speed: number) => {
    const unit = normalize(direction);
    desiredVelocity[0] = unit[0] * speed;
    desiredVelocity[1] = unit[1] * speed;
    desiredVelocity[2] = unit[2] * speed;
  };

  if (!target || mode === "station" || mode === "disengage") {
    // СТАНЦИЯ: орбита по периметру. Нос идёт по касательной — сторожевой
    // полёт, а не разглядывание центра.
    const toOwn = subtract(own.centre, station.centre);
    const bearing = Math.atan2(toOwn[0], toOwn[2]);
    const ahead = bearing + station.speed / Math.max(station.radius, 1) * 1.4;
    const goal: SceneVector3 = [
      station.centre[0] + Math.sin(ahead) * station.radius,
      station.centre[1] + station.altitude,
      station.centre[2] + Math.cos(ahead) * station.radius,
    ];
    applyDirection(subtract(goal, own.centre), station.speed);
    desiredHeading = horizontalUnit([desiredVelocity[0], 0, desiredVelocity[2]]);
    desiredAltitude = station.centre[1] + station.altitude;
  } else {
    const lead = rocketAim ?? aimPoint ?? target.centre;
    // Нос — ВСЕГДА на решение. Это единственная стрелковая кривая: чистое
    // преследование (нос на саму цель) промахивается по построению.
    desiredHeading = horizontalUnit(subtract(lead, own.centre));

    if (mode === "intercept") {
      // ТЕЛО ИДЁТ В ТОЧКУ ВСТРЕЧИ, А НОС — В ТОЧКУ ПРИЦЕЛИВАНИЯ, и это разные
      // точки. Прежде тело шло туда же, куда нос, то есть в саму цель, — а это
      // погоня, и она проигрывает всякому, кто быстрее.
      // УПРЕЖДЕНИЕ ТЕЛА НЕ МЕНЬШЕ УПРЕЖДЕНИЯ ПРИЦЕЛА, И ЭТО НЕ ОСТОРОЖНОСТЬ.
      //
      // Прежний код вёл тело в ТОЧКУ ПРИЦЕЛИВАНИЯ — то есть туда, где цель
      // окажется к приходу снаряда. Это упреждающее преследование, и против
      // медленной цели оно работает: корпус срезает угол сам собой.
      //
      // Первая редакция подключения вела тело в точку ВСТРЕЧИ и на этом
      // проиграла там, где выигрывала: у медленной цели встреча решается за
      // ноль-две секунды, точка встречи почти совпадает с самой целью, и
      // «улучшение» оказалось чистой погоней. Замер по HX-6: время в атаке
      // упало с шестидесяти секунд до сорока трёх, выстрелов со 184 до 116, и
      // цель, прежде сваливавшаяся на 87-й секунде, дожила до конца.
      //
      // Поэтому берётся БОЛЬШЕЕ из двух упреждений. Против медленного побеждает
      // прицельное — и поведение остаётся прежним; против быстрого побеждает
      // встреча — и появляется то, чего не было.
      const bodyLead = Math.max(
        aimLead,
        manoeuvre && Number.isFinite(manoeuvre.seconds) ? manoeuvre.seconds : 0,
      );
      const meeting = extrapolateTrack(target, bodyLead);
      applyDirection(subtract(meeting, own.centre), limits.maximumSpeed);
      // Высота остаётся ПРИЦЕЛЬНОЙ: ствол связан с корпусом, и вертикальное
      // наведение здесь делается именно ею.
      desiredAltitude = lead[1];
    } else if (mode === "attack") {
      // ПРОХОД: скорость мимо цели с выносом на закреплённую сторону.
      const line = normalize(subtract(target.centre, own.centre));
      const side: SceneVector3 = normalize([-line[2], 0, line[0]]);
      const aimAt: SceneVector3 = [
        lead[0] + side[0] * passOffset * passSide,
        lead[1],
        lead[2] + side[2] * passOffset * passSide,
      ];
      // ПРОХОД ИДЁТ НА ПОСТОЯННОЙ СКОРОСТИ, и это не стилистика.
      //
      // Ствол закреплён на корпусе, а корпус кренится ПРОДОЛЬНЫМ ускорением:
      // tg(тангаж) = a/g. Замер прохода: машина разгонялась, нос стоял на 29°
      // вниз, и луч на тридцати пяти метрах уходил на семнадцать метров ниже
      // цели — компенсировать столько высотой нельзя, да и незачем.
      //
      // Боковое ускорение при этом БЕЗВРЕДНО: оно даёт крен, а крен вращает
      // машину вокруг самой линии огня и никуда её не уводит. Поэтому на
      // проходе разрешён любой манёвр, кроме разгона и торможения: скорость
      // держится той, с какой машина в проход вошла.
      // Скорость берётся ТА, С КОТОРОЙ ВОШЛИ, а не «не больше текущей»:
      // второе — храповик, он умеет только снижать, и машина за несколько
      // проходов сползала на четыре метра в секунду.
      applyDirection(subtract(aimAt, own.centre), passEntrySpeed);
      desiredAltitude = lead[1];
    } else if (mode === "break") {
      // СРЫВ ИЗ ПЛОСКОСТИ: это и разрывает дистанцию быстрее всего, и даёт
      // следующему заходу другой кадр.
      const away = normalize(subtract(own.centre, target.centre));
      applyDirection(
        [away[0], 0.55 * passVertical, away[2]],
        limits.maximumSpeed,
      );
      desiredHeading = horizontalUnit(subtract(lead, own.centre));
      // Плоскость нового захода отсчитывается ОТ ЦЕЛИ, а не от себя. От себя
      // получался храповик: каждый срыв прибавлял свои четырнадцать метров, и
      // за несколько заходов машина уезжала на полсотни метров выше цели.
      desiredAltitude = target.centre[1] + 14 * passVertical;
    } else {
      // ОТСТАВАНИЕ: точка позади цели. Гасит сближение и копит разнос под
      // новый заход, не выпуская цель с оси.
      const course = normalize(target.velocity);
      const behind: SceneVector3 = [
        target.centre[0] - course[0] * reattackRange,
        target.centre[1] + 8 * passVertical,
        target.centre[2] - course[2] * reattackRange,
      ];
      applyDirection(subtract(behind, own.centre), limits.maximumSpeed * 0.85);
      desiredAltitude = behind[1];
    }
  }

  // --- вертикаль -----------------------------------------------------------
  //
  // ВЫСОТА — ЭТО ПРИЦЕЛ ПО ВЕРТИКАЛИ. Ствол смотрит вдоль корпуса, корпус
  // кренится от разгона, отдельного привода тангажа нет. Значит машина обязана
  // встать на такую высоту, чтобы её УЖЕ НАКЛОНЁННАЯ ось прошла через цель:
  // луч из среза поднимается на `range · gunAxis.y`, и ровно на столько же
  // машина обязана стоять ниже (или выше) точки встречи.
  if (target && (mode === "attack" || mode === "intercept")) {
    const lead = rocketAim ?? aimPoint ?? target.centre;
    // Поправка на наклон ствола — только там, где она наводит: в пушечном
    // конверте и в ограниченных пределах. За его границей она физически верна,
    // но бесполезна, а тангаж на подходе качается от разгона и превращает её
    // в раскачку по вертикали.
    const inGunEnvelope = range <= armament.cannon.range;
    const raw = inGunEnvelope ? -range * own.gunAxis[1] : 0;
    const compensation = Math.max(
      -AIM_ALTITUDE_LIMIT,
      Math.min(AIM_ALTITUDE_LIMIT, raw),
    );
    desiredAltitude = lead[1] + compensation;
  }
  // Пол не обсуждается ни в одном режиме.
  const deck = station.centre[1] + HARD_DECK;
  desiredAltitude = Math.max(deck, desiredAltitude);

  // ТА ЖЕ БОЛЕЗНЬ ПО ВЕРТИКАЛИ, И ТО ЖЕ ЛЕКАРСТВО. Цель идёт по высотной волне,
  // и демпфер по СОБСТВЕННОЙ вертикальной скорости гасит именно ту скорость,
  // которая нужна, чтобы за волной поспевать. Гасить надо РАССОГЛАСОВАНИЕ.
  const targetVerticalSpeed = target ? target.velocity[1] : 0;
  const altitudeError = desiredAltitude - own.centre[1];
  const wantedVerticalAcceleration = Math.max(
    -4.5,
    Math.min(
      5.5,
      altitudeError * 1.25 - (own.verticalSpeed - targetVerticalSpeed) * 1.5,
    ),
  );
  // Провалившись под пол, машина не «плавно доводит» — она вытаскивает себя
  // всем располагаемым. Пол на то и жёсткий.
  const liftFraction =
    own.centre[1] < deck
      ? limits.liftTrimRange
      : Math.max(
          -limits.liftTrimRange,
          Math.min(limits.liftTrimRange, wantedVerticalAcceleration / 9.81),
        );

  // --- курс ----------------------------------------------------------------
  //
  // ПРОПОРЦИОНАЛЬНЫЙ КОНТУР НЕ ВЕДЁТ ДВИЖУЩУЮСЯ ЦЕЛЬ. Это не настройка, а
  // теорема: гоняясь за пеленгом, который сам уходит с темпом ω, регулятор с
  // коэффициентом k держится с постоянным отставанием ω/k и никогда его не
  // выбирает. Замер: ошибка прицела стояла на 0.34 рад при воротах 0.12, и
  // никакие вынос, скорость и гистерезис этого не лечили — лечить было нечего,
  // контур работал ровно так, как устроен.
  //
  // Поэтому темп линии визирования подаётся ВПЕРЁД, а пропорциональная часть
  // остаётся только на возмущения:
  //
  //     ω = (v_отн ⊥ линии) / дальность  +  k · ошибка
  //
  const turnError = headingError(own.nose, desiredHeading);
  let lineOfSightRate = 0;
  if (target) {
    const line = horizontalUnit(subtract(target.centre, own.centre));
    const relative: readonly [number, number] = [
      target.velocity[0] - own.velocity[0],
      target.velocity[2] - own.velocity[2],
    ];
    // Перпендикуляр к линии в том же смысле, в каком считается ошибка курса.
    lineOfSightRate =
      (relative[0] * line[1] - relative[1] * line[0]) / Math.max(range, 1);
  }
  const yawRate = Math.max(
    -limits.yawRate,
    Math.min(limits.yawRate, lineOfSightRate + turnError * 2.4),
  );

  const body = bodyFrameSpeeds(desiredVelocity as SceneVector3, own.nose);

  // --- огонь ---------------------------------------------------------------
  //
  // ОГОНЬ РАЗРЕШЁН ТОЛЬКО В АТАКЕ. На срыве и на отставании машина стволом не
  // работает, даже если решение случайно сложилось: заход — это обязательство,
  // а не «стреляй, когда получится».
  const weaponsFree = Boolean(target) && mode === "attack";
  const gunnery = advanceGunnery(
    armed ? armGunneryForPass(state.gunnery) : state.gunnery,
    armament,
    {
      weaponsFree,
      cannonSolved,
      range,
      closingSpeed,
      ownRadius: own.radius,
      rocketAimError: aimError,
      // Ворота — ДОЛЯ углового размера цели на текущей дальности.
      //
      // Полный размер оказался слишком щедрым: он разрешает промах ровно по
      // краю силуэта, а сверху ложится ещё и разброс веера, и ракеты уходили
      // сквозь машину между лучами (медиана 2.5 м). Меньше половины габарита
      // ставит СРЕДНЮЮ ракету рипла в конструкцию, а крайние — по краям.
      rocketAimTolerance: target
        ? Math.atan(target.radius / Math.max(range, 1)) * 0.35
        : 0,
      rocketSolved,
    },
    deltaSeconds,
  );
  const minimumRange = target
    ? own.radius +
      explosiveProfile(armament.rockets.explosive).blastPushRadius +
      Math.max(0, closingSpeed) * armament.rockets.armSeconds
    : 0;

  return {
    state: {
      mode,
      modeSeconds,
      targetId: target?.id ?? null,
      passes,
      passSide,
      passVertical,
      weakPointIndex,
      passEntrySpeed,
      gunnery: gunnery.state,
      orbitPhase: state.orbitPhase,
      engagementSeconds: holdsTarget
        ? state.engagementSeconds + deltaSeconds
        : state.engagementSeconds,
    },
    guidance: {
      forwardSpeed: body.forward,
      lateralSpeed: body.lateral,
      yawRate,
      liftFraction,
      // Бой — сплошной занос по построению: машина идёт мимо цели, а смотрит
      // на неё. Створовый допуск здесь означал бы запрет краба.
      slipAllowance: Math.PI / 2,
    },
    shots: gunnery.shots,
    telemetry: {
      range,
      closingSpeed,
      aimError,
      cannonMiss,
      angleOff,
      aimPoint: rocketAim ?? aimPoint,
      minimumRange,
      weaponsFree,
      rocketsLeft: gunnery.state.magazine,
      reloading: gunnery.state.rearmSeconds > 0,
      manoeuvre: manoeuvre?.kind ?? null,
      manoeuvreSeconds: manoeuvre?.seconds ?? Number.POSITIVE_INFINITY,
      rearmSeconds: gunnery.state.rearmSeconds,
    },
  };
}
