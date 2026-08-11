import type { SceneVector3 } from "./destructionScene.ts";
import { explosiveProfile } from "./destructionRuntime.ts";
import type { VehicleGuidanceDemand } from "./vehicleFrames.ts";
import {
  advanceCombatTemper,
  approachCode,
  approachSide,
  approachVertical,
  chooseApproach,
  daredFloor,
  IDLE_COMBAT_TEMPER,
  pressedBreakRange,
  shadowing,
  thrift,
  type CombatTemper,
} from "./airCombatTemper.ts";
import {
  chooseAirManoeuvre,
  predictionHorizon,
  type AirManoeuvreEstimate,
  type AirManoeuvreKind,
} from "./airCombatManoeuvres.ts";
import {
  bodyHolding,
  lineOfSightRotation,
  solvePosture,
  BODY_UNREPORTED,
  type BodyReport,
  type PostureSolution,
} from "./airCombatPosture.ts";
import { isHostileAllegiance, type VehicleAllegiance } from "./vehicleAllegiance.ts";
import {
  advanceGunnery,
  armGunneryForPass,
  closingSpeedTo,
  createGunneryState,
  extrapolateTrack,
  interceptSolution,
  raySolution,
  maximumEffectiveRange,
  shotWorthTaking,
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
 * И четвёртый закон, которого здесь долго не было, а вместо него стояла ошибка.
 *
 *  4. ВЕРТИКАЛЬ — ТАКАЯ ЖЕ ОСЬ, КАК ОСТАЛЬНЫЕ. На этом месте было написано
 *     обратное: «ствол связан с корпусом, наклонить его отдельно нечем, значит
 *     вертикальное наведение делается ВЫСОТОЙ». Первая половина верна, вывод —
 *     нет, и цена ошибки измерена.
 *
 *     Курс у этого модуля был ПАРОЙ ЧИСЕЛ `[x, z]`, единственным органом
 *     наведения — рыскание. При этом ошибку прицеливания он считал честно
 *     трёхмерной, по настоящей оси ствола. Мерил в трёх измерениях, исправлял
 *     в одном: остаток по возвышению видел и обнулить не мог НИЧЕМ. Отсюда все
 *     шесть высотных отказов на карте конвертов — я записал их в свойства
 *     машины, а они были свойством этого пробела.
 *
 *     Наклонить ствол отдельно действительно нечем — его наклоняют ВМЕСТЕ С
 *     КОРПУСОМ, и контракт наведения умеет это с тех пор, как появились фигуры:
 *     `attitude` и `attitudeRate` ходят по нему наравне со скоростями. Машина
 *     летает петли и кульбиты именно ими. Разбор того, чем платят за
 *     наведённую позу и когда тела на неё не хватает, — `airCombatPosture.ts`.
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
/**
 * ДОЛЯ ВЫСОТЫ ПОСТА, НИЖЕ КОТОРОЙ БОЙ НЕ НАЧИНАЕТСЯ.
 *
 * Не «безопасная высота» и не клиренс: это ответ на вопрос «машина уже на
 * своём рабочем месте?». Две трети выбраны потому, что на этой доле трасса
 * уже вывела машину из зоны палубы и площадок, а ждать полной высоты значит
 * подарить противнику лишние секунды на ровном месте.
 */
const CLIMB_OUT_SHARE = 2 / 3;

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
  /**
   * ФАКТИЧЕСКИЙ правый борт машины в мире, соглашением ПРОЕКТА
   * (`pitchAxisOf(nose) = (−nz, nx)`). Нужен ровно затем, чтобы под заданной
   * позой честно доложить микшеру ИЗМЕРЕННЫЙ снос: боковой канал под позой не
   * работает — тягу вбок даёт наклон, то есть сама поза, — и просить им
   * что-либо значило бы завести второе мнение о том же. А ненулевая ошибка в
   * мёртвом канале не бесплатна: она ужимает эллипс разгона и отнимает у
   * тоннелей до трети продольной тяги.
   */
  readonly starboard: SceneVector3;
  readonly verticalSpeed: number;
  /** Радиус описанной сферы машины, м. */
  readonly radius: number;
  /**
   * ЧТО ТЕЛО ДОЛОЖИЛО, ОТРАБОТАВ ПРОШЛЫЙ КАДР. Необязательно: отсутствие
   * означает «мне не докладывают», и тогда машина считает, что держит себя.
   * Разбор порогов — `airCombatPosture.ts`.
   */
  readonly body?: BodyReport;
}

export interface AirCombatLimits {
  readonly maximumSpeed: number;
  readonly yawRate: number;
  readonly liftTrimRange: number;
  /** Поперечное ускорение по наклону, м/с²: из него угловая скорость виража. */
  readonly lateralAcceleration: number;
  /** Секунды и цена высоты на разворот курса фигурой. `null` — фигур нет. */
  readonly reversal?: { readonly seconds: number; readonly cost: number } | null;
  /**
   * АВТОРСКИЙ нос машины, горизонтальный единичный `[x, z]` — не нынешний.
   * Поза строится как поворот ОТ авторской позы покоя, и подставить сюда
   * текущее направление значит вложить нынешний курс внутрь задания: слой фигур
   * на этом однажды получил упрямую бочку вместо петли.
   */
  readonly authoredNose: readonly [number, number];
  /** Во сколько раз располагаемая тяга больше веса. Паспортное. */
  readonly liftReserve: number;
  /** Продольное ускорение тоннелей, м/с². Ноль — тоннелей нет. */
  readonly surgeAcceleration: number;
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
  /** Скорость, с которой машина ВОШЛА в текущий заход, м/с. */
  readonly passEntrySpeed: number;
  /**
   * ПРЕВЫШЕНИЕ НАД ЦЕЛЬЮ, С КОТОРЫМ МАШИНА ВОШЛА В ЗАХОД, м.
   *
   * Тем же законом, что и скорость входа, и по той же причине. Первая редакция
   * трёхмерного прохода держала «нынешнее превышение», то есть брала уставку из
   * собственного положения, — а это интегратор без уставки: любой снос вверх
   * тут же объявляется новой целью и закрепляется. Замер: машина ушла со
   * своих тридцати восьми метров на сто восемнадцать и стреляла оттуда четыре
   * раза за девять секунд.
   */
  readonly passEntryAbove: number;
  readonly gunnery: GunneryState;
  /** Нрав: то, что бой ПОМНИТ. Разбор — `airCombatTemper.ts`. */
  readonly temper: CombatTemper;
  /** Был ли нынешний заход результативным. Нужно только нраву. */
  readonly passScored: boolean;
  /**
   * ВЁЛ ЛИ ПРОШЛЫЙ КАДР МАШИНУ ПОЗОЙ.
   *
   * Нужно затем, чтобы отчёт тела читать только тогда, когда он ОТНОСИТСЯ К
   * ПОЗЕ. Отчёт приходит с кадром запаздывания; на первом кадре атаки он
   * описывает исполнение команды сближения и про позу не говорит ничего.
   * Проверять его там — значит срывать заход по чужому недобору.
   */
  readonly postureHeld: boolean;
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
  /** Остаток тела под нынешней позой, 0..1. `null` — позой не ведут. */
  readonly postureMargin: number | null;
  /** Что упёрлось в разложении: подъём, тоннели или ничего. */
  readonly postureLimit: PostureSolution["limit"] | null;
  /** Заход сорван потому, что тело перестало держать позу. */
  readonly bodyLost: boolean;
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
    temper: IDLE_COMBAT_TEMPER,
    passScored: false,
    postureHeld: false,
    modeSeconds: 0,
    targetId: null,
    passes: 0,
    passSide: 1,
    passVertical: 1,
    passEntrySpeed: 0,
    passEntryAbove: 0,
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
 * УЯЗВИМАЯ ЗОНА: КУДА БИТЬ, ЕСЛИ НЕ ВЫИСКИВАТЬ ОТДЕЛЬНЫЕ ГОНДОЛЫ.
 *
 * Вердикт Igor, снявший предыдущую редакцию: стрелок читает ПАСПОРТ атакуемой
 * машины и понимает — «оооочень примерно» — где у неё уязвимо, а зона кладётся
 * на её НЫНЕШНЕЕ ПОЛОЖЕНИЕ. Выискивать ещё живые гондолы не надо; надо бить
 * туда, где у этого класса машин вообще находится жизнь.
 *
 * Почему прежний выбор оказался хуже, хотя выглядел умнее. Он брал ОДНО кольцо
 * по сумме «потеря соседей минус цена доворота», с гистерезисом, и требовал,
 * чтобы кольцо было ещё живым. Пока машина стреляла с одного яруса, это
 * работало. Как только автомат научился наводиться позой и пошёл работать с
 * превышения, замер обвалился: ровный круг дал 305 попаданий пушкой и ОДНО
 * снятое кольцо. Выбранная точка уезжала на дальнюю сторону корпуса, очередь
 * ложилась в обшивку, а живучесть держат статоры и ступица.
 *
 * Зона считается так, и в ней нет ни одного назначенного числа:
 *
 *   - паспортные уязвимые точки уже приходят В МИРОВЫХ ОСЯХ, повёрнутые вместе
 *     с телом. Посадка на положение цели, о которой речь, сделана там же, где
 *     собирается трек, и второй раз её делать не нужно;
 *   - берётся БЛИЖНЯЯ ПОЛОВИНА пояса — те точки, что на стороне стрелка.
 *     Именно она доступна лучу: дальние закрыты корпусом, и целиться в них
 *     значит целиться сквозь машину;
 *   - здоровье НЕ СПРАШИВАЕТСЯ вовсе. Снаружи его не видно, а бить надо по
 *     области, а не по конкретной уцелевшей гондоле.
 *
 * Гистерезис при этом становится не нужен: центр половины пояса перемещается
 * непрерывно, а прыгал прежде именно ВЫБОР между кольцами.
 */
export function weakZoneOf(
  own: AirCombatOwnState,
  track: AirCombatTrack,
): SceneVector3 | null {
  const points = track.weakPoints;
  if (points.length === 0) {
    return null;
  }
  const belt: [number, number, number] = [0, 0, 0];
  for (const entry of points) {
    belt[0] += entry.point[0] / points.length;
    belt[1] += entry.point[1] / points.length;
    belt[2] += entry.point[2] / points.length;
  }
  const toShooter = normalize(subtract(own.centre, belt));
  const near: [number, number, number] = [0, 0, 0];
  let count = 0;
  for (const entry of points) {
    if (dot(subtract(entry.point, belt), toShooter) > 0) {
      near[0] += entry.point[0];
      near[1] += entry.point[1];
      near[2] += entry.point[2];
      count += 1;
    }
  }
  // ЦЕНТР БЛИЖНЕЙ ПОЛОВИНЫ ПОПАДАЕТ В ПРОМЕЖУТОК МЕЖДУ ГОНДОЛАМИ, ТО ЕСТЬ В
  // КОРПУС, — И ЭТО НОРМАЛЬНО. Была написана и снята редакция, отмерявшая точку
  // РОВНО НА ПОЯС, в ближайшую его точку: против соседа она давала втрое больше
  // снятых кусков (25 против 8). И тем не менее снята, по двум причинам сразу.
  //
  // Вердикт Igor: «в корпус так в корпус, там ракеты — у них радиуса поражения
  // хватит на кольца тоже». Зона на то и зона, чтобы быть примерной; доводить
  // прицел до отдельной гондолы — это опять выискивать гондолы.
  //
  // И замер согласился, причём по главному числу. С точкой на поясе гость
  // города переживал обе программы по сто пятьдесят секунд; с грубым центром
  // ближней половины он падает — на 64.7-й секунде на ровном круге и на 76.8-й
  // на злом маршруте. Точность прицела оказалась не тем, чем платят за исход.
  //
  // Ровно с торца ближней половины может не оказаться вовсе — тогда бьют в
  // центр пояса.
  return count === 0
    ? belt
    : [near[0] / count, near[1] / count, near[2] / count];
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
/**
 * Усиление контура скорости, взятое у самой машины
 * (`rotorcraftVelocityDemand`, значение по умолчанию). Здесь оно нужно затем,
 * что под заданной позой ускорение приходится считать САМОМУ: разложить его на
 * тоннели и винты нельзя, не зная величины.
 */
const VELOCITY_GAIN = 1.6;

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
  /**
   * Попаданий, доставленных с прошлого кадра. Автомат не может знать этого сам:
   * стволы он отдаёт наружу, а разрешает их мир. Ноль — законное значение и
   * означает «мне не докладывают»: нрав тогда просто не разогревается, и
   * поведение остаётся прежним.
   */
  readonly hits?: number;
  /**
   * СКОЛЬКО С ЦЕЛИ РЕАЛЬНО СНЯТО за прошлый кадр — кусков, а не касаний.
   *
   * Различие несущее, и стоило оно прогона. Азарту довольно КОНТАКТА: попал —
   * горячо. А вот заход считается удавшимся только по РЕЗУЛЬТАТУ, иначе
   * одиночная царапина объявляет подход рабочим, зверь залипает на нём и
   * перестаёт перебирать. Замер: злой маршрут сравнялся с ровным кругом
   * (22.0 против 23.7 с) — уклонение обесценилось, потому что охотнику незачем
   * стало менять повадку.
   */
  readonly wounds?: number;
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
  let cannonMiss = Infinity;
  let cannonSolved = false;
  let rocketSolved = false;
  let angleOff = 0;

  if (target) {
    range = length(subtract(target.centre, own.centre));
    closingSpeed = closingSpeedTo(own.centre, own.velocity, target);
    angleOff = aspectAngleOf(own, target);

    // ЦЕЛЯТСЯ В УЯЗВИМУЮ ЗОНУ, А НЕ В ЦЕНТРОИД И НЕ В ОТДЕЛЬНУЮ ГОНДОЛУ.
    // Зона едет вместе с телом, поэтому решение считается по треку, у которого
    // центр подменён ею: скорость та же, а за время полёта ракеты собственное
    // вращение тела сдвигает зону меньше, чем на её же размер.
    const weakPoint = weakZoneOf(own, target);
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
  // Азарт подпускает ближе: зверь, попробовавший крови, рискует. Собственный
  // радиус поражения проверяется отдельно и азарту не подчиняется.
  const breakRange = target
    ? pressedBreakRange(state.temper, own.radius + target.radius + 6)
    : 0;
  // Дистанция нового захода. Прежние +34 м давали цикл в восемнадцать секунд:
  // машина уходила на шестьдесят метров и возвращалась. Вертолётный бой, по
  // источникам, «быстрый и яростный», и ритм обязан это показывать.
  // ПУСТОЙ ПОД — ЭТО ПОВЕДЕНИЕ, А НЕ СЧЁТЧИК. Зверь без яда не улетает: он
  // висит рядом и держит давление, пока снаряжается. Отходить дальше незачем —
  // всё равно нечем бить.
  const reattackRange = target
    ? (shadowing(state.gunnery.magazine, state.gunnery.rearmSeconds > 0)
        ? passOffset * 0.6
        : passOffset + 12)
    : 0;

  let mode = state.mode;
  let passes = state.passes;
  let passSide = state.passSide;
  // Нрав живёт между кадрами; здесь он только читается и обновляется событиями.
  let passScored = state.passScored;
  let passEnded = false;
  let passVertical = state.passVertical;
  let modeSeconds = state.modeSeconds + deltaSeconds;
  let passEntrySpeed = state.passEntrySpeed;
  let passEntryAbove = state.passEntryAbove;
  let armed = false;
  let bodyLost = false;

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
        // ПОСТ НЕЛЬЗЯ ПОКИНУТЬ, НЕ ЗАНЯВ ЕГО.
        //
        // Симптом (наблюдение Igor, 11.08.2026): если чужой борт уже в небе,
        // машина уходит на перехват ПРЯМО С ПЛОЩАДКИ — автомат берёт её на
        // первом же кадре после отрыва, ведёт к цели по прямой и цепляет
        // землю, после чего сторож отказов снимает её по «есть поверхность».
        // Замер той же пробой: выход с поста на 5.4 секунде, машина ещё у
        // самой палубы.
        //
        // Лечится не обходом земли и не отдельным взлётным маршрутом, а
        // порядком: у машины УЖЕ ЕСТЬ трасса на пост, и она поднимает её на
        // высоту поста. Пока высота не набрана, машина принадлежит трассе —
        // то есть автомат просто не выходит из `station`, и весь набор высоты
        // делает маршрутный автопилот, который умеет это давно.
        //
        // Порог — доля от ВЫСОТЫ ПОСТА, а не метры: пост объявлен паспортом, и
        // машина на другом полигоне получит своё число даром.
        if (own.centre[1] - station.centre[1] < station.altitude * CLIMB_OUT_SHARE) {
          changeTo("station");
          break;
        }
        changeTo("intercept");
        break;
      case "intercept":
        // ВХОД В АТАКУ — ЭТО РЕШЕНИЕ, А НЕ ДАЛЬНОСТЬ. Нужны все три: цель в
        // конверте, машина идёт на неё, и нос уже настолько близко к решению,
        // что проход имеет шанс кончиться выстрелом.
        // ДАЛЬНОСТЬ ВХОДА В ЗАХОД — СВОЙСТВО ЦЕЛИ, А НЕ ПАСПОРТА ОРУЖИЯ.
        //
        // Паспортные 85 м у ракеты подписаны так: «дальше время полёта
        // переваливает за 0.9 с и ошибка упреждения растёт быстрее, чем
        // помогает веер». Это верно — и это ответ ПРО СРЕДНЮЮ цель. Но ошибка
        // упреждения зависит не от оружия, а от того, чем цель сейчас занята:
        // связанная фигурой не уходит с точки вовсе, свободная на тридцати
        // уходит на полтора десятка метров за ту же секунду.
        //
        // Поэтому паспортное число остаётся ПОТОЛКОМ, а решение принимается по
        // выведенному: `R = v·√(2L/a_остаток)`. Против бодрой цели заход
        // начинается ближе, чем прежде, против связанной — с паспортного
        // предела, и ни одно из двух чисел не назначено.
        if (
          range <=
            maximumEffectiveRange(
              target,
              explosiveProfile(armament.rockets.explosive).projectile.speed,
              explosiveProfile(armament.rockets.explosive).blastRadius +
                target.radius,
              limits.lateralAcceleration,
              armament.rockets.range,
            ) &&
          closingSpeed > 0 &&
          bearingError <= ATTACK_ENTRY_AIM
        ) {
          changeTo("attack");
          armed = true;
          // Ярус захода берётся тот, на котором машина оказалась к моменту
          // решения, и дальше не меняется. Больше `passOffset` он быть не
          // может: это тот же единственный вынос прохода, только по вертикали.
          passEntryAbove = Math.max(
            -passOffset,
            Math.min(passOffset, own.centre[1] - target.centre[1]),
          );
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
        //
        // И ПЯТЫЙ ПРИЗНАК — ПОТЕРЯ ТЕЛА, у которого особое положение.
        //
        // Закон «заход есть обязательство» написан против СОМНЕНИЯ: зверь не
        // передумывает посреди прыжка оттого, что угол показался неудобным.
        // Против ФИЗИКИ он не написан. Кошка, почувствовавшая, что срывается,
        // прыжок бросает и решает заново — и это не малодушие, а то же самое
        // чувство тела, которым она прыжок и назначала.
        //
        // Признак берётся не из головы, а из отчёта самой машины: поза не
        // строится (`maneuverScale` в нуле) или команды не исполняются больше
        // чем наполовину. Срыв при этом считается ПУСТЫМ ЗАХОДОМ, и досада сама
        // уведёт следующий заход на другой подход — механизм уже есть, заводить
        // второй незачем.
        bodyLost =
          state.postureHeld && !bodyHolding(own.body ?? BODY_UNREPORTED);
        // «ПРОХОД СОСТОЯЛСЯ» БОЛЬШЕ НЕ ЧИТАЕТСЯ ПО СКОРОСТИ СБЛИЖЕНИЯ.
        //
        // Признак был `closingSpeed < 0 && range > дальность/2`, и он верен для
        // машины, которая может стрелять только вперёд-горизонтально: такая
        // либо сближается, либо уже разошлась, третьего нет. С наведённой позой
        // третье появилось — и появилось сразу же, как только клетку сняли.
        //
        // Замер с превышения: машина вставала стволом на 67° вниз и держала
        // цель на оси, идя вокруг неё по кругу на постоянной дальности в
        // пятьдесят четыре метра. Сближение при этом колеблется около нуля, и
        // прежний признак объявлял проход состоявшимся на 2.6-й секунде — с
        // прицелом, который ещё сходился, и одним выстрелом за весь заход.
        // Никакого прохода не было: машина не разошлась, она работала.
        //
        // Поэтому конец прохода — ВЫХОД ИЗ КОНВЕРТА, тем же выведенным числом,
        // каким проверяется вход. Заход по-прежнему остаётся проходом, а не
        // висением: его держит потолок в шесть секунд, и он не сдвинут.
        const leftEnvelope =
          range >
          maximumEffectiveRange(
            target,
            rocketSpeed,
            explosiveProfile(armament.rockets.explosive).blastRadius +
              target.radius,
            limits.lateralAcceleration,
            armament.rockets.range,
          );
        if (
          range <= breakRange ||
          leftEnvelope ||
          bearingError > ATTACK_ABORT_AIM ||
          bodyLost ||
          modeSeconds > 6
        ) {
          passes += 1;
          passEnded = true;
          // ЧЕМ ЗАХОДИТЬ ДАЛЬШЕ — РЕШАЕТ НРАВ, А НЕ ЧЁТНОСТЬ СЧЁТЧИКА.
          //
          // Прежде сторона переключалась каждый заход, а ярус — через раз: это
          // разводило кадры, но было слепо. Получилось — повторяй; не
          // получилось — не то же самое. Отвращение к повторению и есть весь
          // механизм разнообразия, и он дешевле любого перебора.
          {
            const chosen = chooseApproach(
              advanceCombatTemper(state.temper, {
                seconds: 0,
                hits: 0,
                passEnded: true,
                passScored,
                approach: approachCode(passSide, passVertical),
              }),
              approachCode(passSide, passVertical),
            );
            passSide = approachSide(chosen);
            passVertical = approachVertical(chosen);
          }
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
      // ВЫНОС ПРОХОДА ТЕПЕРЬ ТРЁХМЕРЕН — НО ОСТАЁТСЯ ОДНИМ ВЫНОСОМ.
      //
      // Пока наводило одно рыскание, проход обязан был идти на высоте цели:
      // ствол смотрел горизонтально, и свести луч с целью иначе было нечем.
      // Разнос по вертикали был чистой помехой, и карта конвертов показала это
      // шестью отказами подряд. С наведённой позой вертикаль перестала быть
      // особенной, и машина больше не тратит секунды на спуск к ярусу цели.
      //
      // ПЕРВАЯ РЕДАКЦИЯ ПРОСТО ДОБАВИЛА ВЕРТИКАЛЬ К ГОРИЗОНТАЛИ, и замер её
      // осудил. Вынос стал двойным: `passOffset` вбок И `passOffset` вверх, то
      // есть в полтора раза дальше от цели, чем нужно ему самому. В свободном
      // бою это встало в половину попаданий пушкой (23 против 49 за две минуты)
      // — и не потому, что стрелять сверху плохо, а потому, что срыв каждый раз
      // добавляет свои метры превышения, проход их теперь СОХРАНЯЕТ, и машина
      // расходилась с целью по ярусу от захода к заходу.
      //
      // Правильно — распределять ОДИН вынос между осями. Тогда превышение не
      // прибавляется к дистанции прохода, а тратит её: чем выше машина, тем
      // ближе она проходит по земле, и суммарный промах остаётся тем самым
      // `v/ω`, из которого он и выведен. Ноль превышения даёт в точности
      // прежний горизонтальный проход, полный — проход прямо над целью.
      const vertical = Math.max(
        -1,
        Math.min(1, passEntryAbove / Math.max(passOffset, 1)),
      );
      const horizontal = Math.sqrt(Math.max(0, 1 - vertical * vertical));
      const aimAt: SceneVector3 = [
        lead[0] + side[0] * passOffset * horizontal * passSide,
        lead[1] + passOffset * vertical,
        lead[2] + side[2] * passOffset * horizontal * passSide,
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
      desiredAltitude = aimAt[1];
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
  // ВЫСОТА КАК ПРИЦЕЛ — ЭТО КОСТЫЛЬ, И ОН ОСТАЛСЯ ТОЛЬКО ТАМ, ГДЕ ЧЕСТЕН.
  //
  // Приём такой: ствол смотрит вдоль корпуса, корпус наклонён разгоном, значит
  // встань на такую высоту, чтобы уже наклонённая ось прошла через цель. Он
  // работает — и он же есть та самая клетка, потому что заменяет наведение
  // выбором яруса и стоит на этом секунд.
  //
  // В АТАКЕ ЕГО БОЛЬШЕ НЕТ: там ствол наводится позой и стоит там, где нужно,
  // независимо от того, на каком ярусе машина. Оставить оба значило бы дать
  // вертикали двух хозяев — поза ведёт луч на цель, а высотный контур тут же
  // уводит машину с яруса, чтобы «доправить» тот же луч.
  //
  // В СБЛИЖЕНИИ ОН ОСТАЁТСЯ. Там позой не ведут: сближение — это про то, чтобы
  // ДОБРАТЬСЯ, и наклон корпуса там честно вытекает из разгона, а не задаётся.
  if (target && mode === "intercept") {
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
  // Страх земли выводится из высоты и памяти не требует — но азарт его
  // приглушает. Единственное место, где нрав трогает безопасность, и запас
  // никогда не падает ниже сорока процентов: земля не договаривается.
  const deck = station.centre[1] + daredFloor(state.temper, HARD_DECK);
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

  // --- ПОЗА -----------------------------------------------------------------
  //
  // ЗДЕСЬ СНИМАЕТСЯ КЛЕТКА. Всё, что выше, свело задачу к двум векторам:
  // КУДА СМОТРЕТЬ (решение стрельбы, честно трёхмерное) и КАК ИДТИ (кривая
  // прохода). Раньше первый из них терял вертикаль об `horizontalUnit`, потому
  // что исполнять её было нечем. Теперь он идёт целиком.
  //
  // Поза считается ТОЛЬКО В АТАКЕ, и это не осторожность, а разделение труда.
  // Наведённая поза покупает прицел и ПЛАТИТ боковым каналом: под ней тягу вбок
  // даёт наклон, то есть сама поза, и свободного бокового ускорения не остаётся.
  // В атаке это выгодно — там ценен ствол. В сближении невыгодно: там надо
  // ДОБРАТЬСЯ, и наклон полезнее как орган разгона, чем как прицел.
  //
  // И ВТОРОЕ УСЛОВИЕ, ВЫВЕДЕННОЕ ЗАМЕРОМ, А НЕ ОСТОРОЖНОСТЬЮ.
  //
  // Поза — ЕДИНСТВЕННЫЙ орган возвышения: рыскание не даёт его вовсе. Но она же
  // отбирает боковой канал и уводит курс из тщательно настроенного контура
  // рыскания в общий контур позы. Пока цель на одном ярусе, менять нечего —
  // возвышение и так ноль, а платить приходится. Замер по свободному бою с
  // гостем города: с позой на всей дистанции пушка дала 11 попаданий из 126
  // выстрелов против 13 из 27 прежде, ракет ушло три вместо шести, и цель
  // пережила две минуты вместо двадцати двух секунд.
  //
  // Поэтому позой пользуются ТОГДА, КОГДА ЕЙ ЕСТЬ ЧТО ДЕЛАТЬ: когда прицел
  // требует возвышения больше, чем терпит сам выстрел. Порог не назначен — это
  // тот же угловой размер цели, которым живут ворота огня. На одном ярусе
  // условие не выполняется никогда, с превышения — сразу.
  //
  // Это НЕ возврат клетки. Клетка была в том, что органа не существовало вовсе
  // и вертикаль исправляли выбором яруса. Орган есть, и он включается ровно по
  // своей работе.
  let posture: PostureSolution | null = null;
  let attitudeRate: SceneVector3 | null = null;
  if (target && mode === "attack") {
    const solution = rocketAim ?? aimPoint ?? target.centre;
    const aim = normalize(subtract(solution, muzzleWorld));
    const elevation = Math.abs(Math.asin(Math.max(-1, Math.min(1, aim[1]))));
    const tolerated = Math.atan(target.radius / Math.max(range, 1));
    // ПОЛ ОТМЕНЯЕТ ПОЗУ БЕЗ ОБСУЖДЕНИЯ. Провалившись под палубу, машина
    // вытаскивает себя всем располагаемым — а под заданной позой подъём
    // направлен куда велел прицел, и «всем располагаемым» означало бы тянуть
    // в землю. Земля не договаривается ни с прицелом, ни со зверем.
    const belowDeck = own.centre[1] < deck;
    if (elevation > tolerated && !belowDeck) {
      // Заказ ГЕОМЕТРИИ: ускорение, которым тело выходит на кривую прохода.
      // Усиление то же, каким живёт контур скорости внутри машины
      // (`rotorcraftVelocityDemand`, 1.6): два разных числа означали бы два
      // разных мнения о том, насколько резво исправлять одну и ту же ошибку.
      // Вертикаль берётся из высотного контура выше — он уже сведён с волной
      // цели и зажат, и считать её заново значило бы его продублировать.
      const wanted: SceneVector3 = [
        (desiredVelocity[0] - own.velocity[0]) * VELOCITY_GAIN,
        wantedVerticalAcceleration,
        (desiredVelocity[2] - own.velocity[2]) * VELOCITY_GAIN,
      ];
      posture = solvePosture(limits.authoredNose, aim, wanted, {
        liftReserve: limits.liftReserve,
        surgeAcceleration: limits.surgeAcceleration,
      });
      attitudeRate = lineOfSightRotation(
        subtract(target.centre, own.centre),
        subtract(target.velocity, own.velocity),
      );
    }
  }

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
      // ПУСК ПРОВЕРЯЕТСЯ НЕ ТОЛЬКО ГЕОМЕТРИЕЙ, НО И ТЕМ, УСПЕЕТ ЛИ ЦЕЛЬ УЙТИ.
      //
      // Угловые ворота выше отвечают на вопрос «лягут ли ракеты в силуэт
      // СЕЙЧАС». Этого мало: снаряд летит доли секунды, и за них цель может
      // сойти с точки. Но может — не всегда: машина, выгребающая всю власть в
      // фигуре, увернуться уже нечем, и по ней стрелять можно куда дальше, чем
      // по идущей ровно. Разбор и формула — `unusedLateralAcceleration`.
      rocketSolved:
        rocketSolved &&
        (!target ||
          shotWorthTaking(
            target,
            range,
            explosiveProfile(armament.rockets.explosive).projectile.speed,
            explosiveProfile(armament.rockets.explosive).blastRadius,
            limits.lateralAcceleration,
          )),
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
      passEntrySpeed,
      passEntryAbove,
      gunnery: gunnery.state,
      // НРАВ ОБНОВЛЯЕТСЯ ОДИН РАЗ ЗА КАДР И ПОСЛЕДНИМ: всё, что случилось,
      // уже случилось, и только теперь зверь про это узнаёт.
      temper: advanceCombatTemper(state.temper, {
        seconds: deltaSeconds,
        hits: Math.max(0, input.hits ?? 0),
        passEnded,
        passScored: passScored || (input.wounds ?? 0) > 0,
        approach: approachCode(state.passSide, state.passVertical),
      }),
      // Признак результативности живёт ВНУТРИ захода и гаснет вместе с ним.
      passScored: passEnded ? false : passScored || (input.wounds ?? 0) > 0,
      postureHeld: posture !== null,
      orbitPhase: state.orbitPhase,
      engagementSeconds: holdsTarget
        ? state.engagementSeconds + deltaSeconds
        : state.engagementSeconds,
    },
    guidance: posture
      ? {
          // ТОННЕЛЯМ ЗАКАЗЫВАЮТ РОВНО ТУ ПРОДОЛЬНУЮ СОСТАВЛЯЮЩУЮ, КОТОРУЮ ИМ
          // ОТДАЛО РАЗЛОЖЕНИЕ, — а не «желаемую скорость вдоль ствола».
          //
          // Разница вышла наружу замером. Разложение обещает: вдоль ствола
          // тоннели дают `surge`, поперёк винты дают остальное, и вместе они
          // равны потребной тяге. Первая редакция командовала сюда проекцию
          // ЖЕЛАЕМОЙ СКОРОСТИ, то есть тоннели давали не обещанное, а что
          // выйдет из ошибки хода. Равновесие не сходилось на разницу, и машина
          // за две секунды прохода уползала на семь метров вверх, а прицел
          // держался с постоянной ошибкой в 0.15 рад — ровно тем отставанием,
          // которым проявляется незакрытая невязка.
          //
          // Контур внутри машины линеен и известен: `a = (заказ − факт)·1.6`.
          // Значит заказать нужное ускорение можно точно, подставив
          // `факт + a/1.6`. Факт берётся вдоль НАСТОЯЩЕГО носа — под позой ход
          // меряется именно так, и «вдоль носа» вполне может означать «вниз».
          forwardSpeed:
            own.velocity[0] * own.gunAxis[0] +
            own.velocity[1] * own.gunAxis[1] +
            own.velocity[2] * own.gunAxis[2] +
            posture.surge / VELOCITY_GAIN,
          // БОКОВОЙ КАНАЛ ПОД ПОЗОЙ МЁРТВ, и ему докладывают ИЗМЕРЕННОЕ, чтобы
          // ошибка была нулевой. Не из аккуратности: ненулевая ошибка в мёртвом
          // канале проходит через эллипс разгона и отнимает у тоннелей до трети
          // продольной тяги, ничего не дав взамен.
          lateralSpeed:
            own.velocity[0] * own.starboard[0] +
            own.velocity[1] * own.starboard[1] +
            own.velocity[2] * own.starboard[2],
          // Курс приходит ИЗ ПОЗЫ. Держать его ещё и рысканием — второе мнение
          // о том же самом; микшер говорит это же в лоб.
          yawRate: 0,
          liftFraction: posture.liftFraction,
          slipAllowance: Math.PI / 2,
          attitude: posture.attitude,
          attitudeRate,
        }
      : {
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
      postureMargin: posture?.margin ?? null,
      postureLimit: posture?.limit ?? null,
      bodyLost,
      rearmSeconds: gunnery.state.rearmSeconds,
    },
  };
}
