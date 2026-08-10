import type { SceneVector3 } from "./destructionScene.ts";
import { explosiveProfile, type ExplosiveKind } from "./destructionRuntime.ts";
import type { VehicleAllegiance } from "./vehicleAllegiance.ts";

/**
 * БОРТОВОЕ ВООРУЖЕНИЕ: где стволы, куда полетит и когда можно жать.
 *
 * Модуль отвечает на три вопроса и ни на один сверх: КУДА целиться (решение
 * встречи), МОЖНО ли стрелять (конверт и устойчивость сопровождения) и ЧТО
 * при этом вылетает (пуск как данные). Куда ВЕСТИ машину — не сюда: это
 * `airCombatPilot.ts`, и граница между ними ровно та же, что между автопилотом
 * и автоматом управления.
 *
 * Здесь нет ни Rapier, ни three, ни сцены: всё считается на числах, поэтому
 * тест исполняет ровно тот код, который летает.
 */

const EPSILON = 1e-6;

// ---------------------------------------------------------------------------
// Что известно о цели
// ---------------------------------------------------------------------------

/**
 * СНИМОК ЦЕЛИ. Ровно то, что видно снаружи: где она, как идёт, куда смотрит,
 * какого размера и где у неё движители.
 *
 * Чего здесь НЕТ и не будет: маршрута, прогресса по нему, будущих точек и
 * определения машины. Это единственная точка балансировки боя (см.
 * `docs/air-combat-lessons.md`, §2): экстраполятор, знающий план, берёт
 * идеальное упреждение и разбирает цель за два попадания.
 */
export interface AirCombatTrack {
  readonly id: string;
  readonly allegiance: VehicleAllegiance;
  /** Центр масс цели в мире. */
  readonly centre: SceneVector3;
  readonly velocity: SceneVector3;
  /**
   * ТЕКУЩИЙ МАНЁВР: темп разворота вектора скорости вокруг вертикали, рад/с.
   * Знак — как у угловой скорости вокруг +Y (поворот +Z к +X).
   */
  readonly turnRate: number;
  /** Радиус описанной сферы: попадание считается по габариту, не по точке. */
  readonly radius: number;
  /**
   * УЯЗВИМЫЕ ТОЧКИ — кольца движителей, и это не украшение прицела.
   *
   * Винтокрылую машину роняет не суммарный урон, а ПОТЕРЯ СТОРОНЫ: когда
   * центр масс выходит за выпуклую оболочку уцелевших движителей, держать позу
   * становится нечем. Значит бить надо в кольцо, и притом в СОСЕДНЕЕ с уже
   * выбитым, а не в ближайшее.
   *
   * Замер стенда, который это доказал: 55 попаданий пушкой из 63 выстрелов —
   * и ноль снятых лопастей. Прицел стоял в центроид, то есть в корпус, где у
   * восьмидесятишестикилограммовой машины ничего важного нет.
   */
  readonly weakPoints: readonly {
    readonly point: SceneVector3;
    /** Доля уцелевшего: 0 — кольцо снято. */
    readonly health: number;
  }[];
  /** Штатно стоит на опорах: атака снимается. */
  readonly landed: boolean;
  /** Уже отказала: бой закрыт. */
  readonly failed: boolean;
}

// ---------------------------------------------------------------------------
// Паспорт оружия
// ---------------------------------------------------------------------------

export interface WeaponMount {
  readonly id: string;
  /** Дульный срез в АВТОРСКОЙ позе покоя, как enginePoints. */
  readonly muzzle: SceneVector3;
}

/**
 * Пушка — hitscan. Вердикт Igor: мгновенный луч остаётся, значит у неё нет
 * баллистического упреждения. Своё упреждение у неё всё равно есть, но оно
 * живёт в контуре наведения (нос доворачивается не мгновенно), а не здесь.
 */
export interface CannonArmament {
  readonly kind: "cannon";
  readonly mounts: readonly WeaponMount[];
  readonly range: number;
  readonly fireInterval: number;
  /** Полуугол рассеивания, рад. */
  readonly dispersion: number;
  /**
   * Сколько секунд решение обязано держаться до открытия огня. Без этого
   * порога машина даёт одиночные щелчки на пролёте угла и читается автоматом,
   * а не стрелком.
   */
  readonly trackingSeconds: number;
}

/** Под: двенадцать труб, стреляет риплом. Одиночный пуск почти бесполезен. */
export interface RocketArmament {
  readonly kind: "podRocket";
  readonly mounts: readonly WeaponMount[];
  readonly explosive: ExplosiveKind;
  /**
   * Сколько труб уходит в одном рипле. ЭТО И ЕСТЬ МАГАЗИН.
   *
   * Полного боекомплекта у пода нет, и это осознанно. Сперва он был: двенадцать
   * труб — двенадцать ракет, счётчик и никакого способа его пополнить.
   * Отстрелявшись за четыре захода, машина НАВСЕГДА оставалась с одной пушкой,
   * а пушка кольца сквозь кожухи не берёт — то есть «не сбил, продолжает
   * охотиться» переставало быть выполнимым ровно тогда, когда становилось
   * нужным. Счётчик без пополнения — не механика, а тупик.
   *
   * У ручной ракетницы игрока магазина тоже нет, только перезарядка; держать
   * борт строже человека не за что. Расход ограничивают ТЕМП и правило «один
   * рипл на заход»: они дают бою длину, ничего не запирая.
   *
   * Если конечный боекомплект понадобится — его место в дозаправке на площадке,
   * а не в молчаливом счётчике.
   */
  readonly rippleSize: number;
  /** Пауза между трубами внутри рипла, с. */
  readonly rippleInterval: number;
  /** Пауза между риплами, с. */
  readonly reloadSeconds: number;
  /**
   * ПОПОЛНЕНИЕ ПУСТОГО ПОДА, с. Вердикт Igor: полминуты и заново.
   *
   * Боекомплект у пода конечный — двенадцать труб, — но пустой под это ПАУЗА,
   * а не тупик. Первая редакция запирала машину навсегда: счётчик был, способа
   * пополнить не было, и «не сбил — продолжает охотиться» переставало быть
   * выполнимым ровно тогда, когда становилось нужным.
   *
   * Полминуты — это примерно два-три захода на одной пушке: достаточно, чтобы
   * пустой под читался в бою как событие, и мало, чтобы бой не заглох.
   */
  readonly rearmSeconds: number;
  readonly range: number;
  /** Угловой шаг веера, рад: рипл закрывает ошибку упреждения шириной. */
  readonly rippleSpread: number;
  /**
   * НИЖНИЙ предел ворот пуска, рад: механический допуск неподвижной трубы.
   *
   * Сами ворота считаются от ДАЛЬНОСТИ и габарита цели, а не стоят числом:
   * промах ракеты равен `range · aimError`, поэтому осмысленный допуск — это
   * угловой размер цели, `atan(radius / range)`. Константа 0.052 рад была
   * верна ровно на сорока метрах и запирала пуск на всех остальных: за
   * полторы минуты боя не вышло НИ ОДНОЙ ракеты.
   */
  readonly aimTolerance: number;
  /**
   * ДАЛЬНОСТЬ СВЕДЕНИЯ, м.
   *
   * Трубы стоят в 1.18 м от оси корпуса. Стреляя параллельно, они проходят в
   * этом самом метре от точки прицеливания НА ЛЮБОЙ дальности — систематика,
   * которую не берёт никакая наводка: ворота выравнивают ось машины, а летит
   * ракета не из оси. Замер: медиана промаха 3.1 м при габарите цели 3.1.
   *
   * Настоящие поды сводят на выбранную дальность, и это ровно то же решение,
   * что пристрелка спарки. Сорок метров — середина рабочего конверта.
   */
  readonly harmonisationRange: number;
  /**
   * ВЫНОС ТОЧКИ СХОДА ВПЕРЁД ОТ УСТЬЯ ТРУБЫ, м.
   *
   * Труба сидит на своём авторском месте, а вот РОДИТЬСЯ снаряд обязан уже вне
   * машины. Устье пода лежит на z = 1.62, корпус тянется до 3.44, поэтому
   * снаряд, появлявшийся ровно в устье, возникал ВНУТРИ собственного габарита,
   * в трёх сантиметрах от пода, — и на манёвре машина подрывала себя (вердикт
   * Igor 08.08.2026, наблюдение в игре).
   *
   * У ручной ракетницы этот вынос есть с самого начала (`+direction · 1.05`);
   * у бортовой его просто забыли. Число выводится, а не выбирается: расстояние
   * от устья до передней кромки габарита плюс радиус неконтактного взрывателя
   * плюс запас. Иначе снаряд выйдет наружу, но тут же сработает по своей же
   * машине.
   *
   * Второй способ — как у истребителей, сбрасывать ракету вниз и запускать
   * мотор ниже корпуса — честнее физически, но требует отдельной фазы полёта
   * снаряда. Отложен сознательно.
   */
  readonly launchClearance: number;
  /** Запас на взведение до входа в собственный радиус поражения, с. */
  readonly armSeconds: number;
}

/**
 * Направление пуска из КОНКРЕТНОЙ трубы с учётом сведения: труба смотрит не
 * вдоль корпуса, а в точку сведения на его оси.
 */
export function harmonisedLaunchDirection(
  mountWorld: SceneVector3,
  originWorld: SceneVector3,
  axis: SceneVector3,
  harmonisationRange: number,
): SceneVector3 {
  const unit = normalize(axis);
  const convergence: SceneVector3 = [
    originWorld[0] + unit[0] * harmonisationRange,
    originWorld[1] + unit[1] * harmonisationRange,
    originWorld[2] + unit[2] * harmonisationRange,
  ];
  return normalize(subtract(convergence, mountWorld));
}

export interface VehicleArmament {
  readonly cannon: CannonArmament;
  readonly rockets: RocketArmament;
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

function scaled(v: SceneVector3, k: number): SceneVector3 {
  return [v[0] * k, v[1] * k, v[2] * k];
}

function normalize(v: SceneVector3): SceneVector3 {
  const l = length(v);
  return l < EPSILON ? [0, 0, 1] : [v[0] / l, v[1] / l, v[2] / l];
}

function dot(a: SceneVector3, b: SceneVector3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

// ---------------------------------------------------------------------------
// Экстраполяция манёвра
// ---------------------------------------------------------------------------

/**
 * ГДЕ ЦЕЛЬ ОКАЖЕТСЯ, ЕСЛИ ПРОДОЛЖИТ ТО, ЧТО ДЕЛАЕТ.
 *
 * Модель постоянного разворота: горизонтальная скорость крутится с темпом
 * `turnRate`, вертикальная держится. Прямая — её частный случай при нулевом
 * темпе, и переход между ними непрерывен (`sin(ωt)/ω → t`).
 *
 * Это ровно та точность, которую даёт наблюдение без плана: пока цель держит
 * манёвр — попадание берётся, на смене знака кривизны — нет. Так и задумано.
 */
export function extrapolateTrack(
  track: Pick<AirCombatTrack, "centre" | "velocity" | "turnRate">,
  seconds: number,
): SceneVector3 {
  const [vx, vy, vz] = track.velocity;
  const omega = track.turnRate;
  let dx: number;
  let dz: number;
  if (Math.abs(omega) < 1e-4) {
    dx = vx * seconds;
    dz = vz * seconds;
  } else {
    // ∫R(ωτ)v dτ, где R — тот же поворот вокруг +Y, что и всюду в проекте:
    // x' = x·cos + z·sin, z' = −x·sin + z·cos.
    const sine = Math.sin(omega * seconds) / omega;
    const versine = (1 - Math.cos(omega * seconds)) / omega;
    dx = vx * sine + vz * versine;
    dz = -vx * versine + vz * sine;
  }
  return [
    track.centre[0] + dx,
    track.centre[1] + vy * seconds,
    track.centre[2] + dz,
  ];
}

// ---------------------------------------------------------------------------
// Решение встречи
// ---------------------------------------------------------------------------

export interface InterceptSolution {
  /** Точка, в которую надо послать снаряд. */
  readonly aimPoint: SceneVector3;
  /** Единичное направление пуска. */
  readonly direction: SceneVector3;
  readonly seconds: number;
  readonly distance: number;
  /** Решение не сошлось: цель уходит быстрее, чем снаряд догоняет. */
  readonly converged: boolean;
}

/**
 * РЕШЕНИЕ СЧИТАЕТСЯ В СИСТЕМЕ СТРЕЛКА.
 *
 * Снаряд наследует скорость носителя (он физически сходит с летящей машины),
 * поэтому задача решается относительно неё: из движения цели вычитается
 * движение стрелка, и остаётся честное «сколько лететь до точки встречи».
 * Иначе пришлось бы поправлять прицел на собственный ход — тот самый класс
 * ошибок, где машина мажет тем сильнее, чем быстрее идёт.
 *
 * Метод — простая итерация по времени полёта. Она сходится, пока снаряд
 * быстрее цели; четырёх проходов хватает с запасом (на 40 м расхождение
 * уходит под миллиметр уже к третьему).
 */
export function interceptSolution(
  origin: SceneVector3,
  carrierVelocity: SceneVector3,
  track: Pick<AirCombatTrack, "centre" | "velocity" | "turnRate">,
  projectileSpeed: number,
): InterceptSolution {
  const relative = {
    centre: track.centre,
    velocity: subtract(track.velocity, carrierVelocity) as SceneVector3,
    turnRate: track.turnRate,
  };
  let seconds = length(subtract(track.centre, origin)) / Math.max(projectileSpeed, EPSILON);
  let offset = subtract(extrapolateTrack(relative, seconds), origin);
  let converged = false;
  for (let pass = 0; pass < 4; pass += 1) {
    const next = length(offset) / Math.max(projectileSpeed, EPSILON);
    converged = Math.abs(next - seconds) < 1e-3;
    seconds = next;
    offset = subtract(extrapolateTrack(relative, seconds), origin);
    if (converged) {
      break;
    }
  }
  // Точка прицеливания — в МИРОВЫХ осях: относительное решение возвращается
  // обратно добавлением собственного хода за то же время.
  const aimPoint = extrapolateTrack(track, seconds);
  return {
    aimPoint,
    direction: normalize(offset),
    seconds,
    distance: length(offset),
    converged,
  };
}

// ---------------------------------------------------------------------------
// Огневое решение пушки
// ---------------------------------------------------------------------------

export interface RaySolution {
  /** Луч проходит через габарит цели. */
  readonly onTarget: boolean;
  /** Промах по перпендикуляру, м. Ноль означает попадание в центр. */
  readonly missDistance: number;
  /** Дальность вдоль луча до ближайшей к цели точки. */
  readonly range: number;
}

/**
 * Пересекает ли луч сферу габарита. Для мгновенного снаряда это и есть всё
 * огневое решение: упреждать нечего, снаряд приходит в тот же кадр.
 */
export function raySolution(
  origin: SceneVector3,
  direction: SceneVector3,
  targetCentre: SceneVector3,
  targetRadius: number,
  maximumRange: number,
): RaySolution {
  const axis = normalize(direction);
  const toTarget = subtract(targetCentre, origin);
  const along = dot(toTarget, axis);
  const distance = length(toTarget);
  if (along <= 0) {
    // Цель позади дульного среза: промах равен полной дистанции, чтобы
    // «сзади» никогда не читалось как «почти попал».
    return { onTarget: false, missDistance: distance, range: along };
  }
  const missDistance = Math.sqrt(Math.max(0, distance * distance - along * along));
  return {
    onTarget: missDistance <= targetRadius && along <= maximumRange,
    missDistance,
    range: along,
  };
}

// ---------------------------------------------------------------------------
// Минимальная дальность пуска
// ---------------------------------------------------------------------------

/**
 * МАШИНА ЗНАЕТ ПРО СВОЙ ВЗРЫВ (вердикт Igor).
 *
 * Число выводится, а не выбирается: собственный полугабарит плюс радиус
 * ударной волны боеприпаса плюс путь, который стрелок пройдёт на сближении,
 * пока ракета летит и взводится.
 */
/**
 * СКОЛЬКО ВЛАСТИ У ЦЕЛИ ОСТАЛОСЬ НА УВОРОТ.
 *
 * Тут перевёрнут знак, который легко поставить неверно, и я его сперва
 * поставил неверно. Кажется, что вёрткая цель непредсказуема и стрелять по ней
 * дальше нельзя. На самом деле наоборот: МАНЁВР — ЭТО ОБЯЗАТЕЛЬСТВО.
 *
 * Поперечное ускорение у машины одно и конечное. То, что уже потрачено на
 * нынешнюю кривую (`v·ω` — честное центростремительное), потрачено: увернуться
 * этим же ускорением второй раз нельзя. Остаётся `√(a² − (v·ω)²)`, и у машины,
 * выгребающей всю власть в фигуре, остаток близок к нулю. Она на рельсах.
 *
 * Замер по VX-8: в кульбите он идёт 10–13 м/с вместо тридцати и гнёт с темпом
 * до 2.6 рад/с — то есть в момент уклонения он и медленнее, и предсказуемее,
 * чем на прямой. Момент ухода есть момент уязвимости.
 *
 * ЧТО СЧИТАТЬ ПРЕДЕЛОМ ЦЕЛИ, стрелок не знает: чужого паспорта у него нет.
 * Поэтому он предполагает, что противник не хуже него самого, и берёт СВОЙ
 * предел. Свободного числа не появляется, а ошибка получается в безопасную
 * сторону: недооценив себя, промахнёшься дальше, чем надо.
 */
export function unusedLateralAcceleration(
  track: Pick<AirCombatTrack, "velocity" | "turnRate">,
  assumedLateral: number,
): number {
  const speed = Math.hypot(track.velocity[0], track.velocity[1], track.velocity[2]);
  const spent = speed * Math.abs(track.turnRate);
  const spare = assumedLateral * assumedLateral - spent * spent;
  return spare <= 0 ? 0 : Math.sqrt(spare);
}

/**
 * НА СКОЛЬКО ЦЕЛЬ МОЖЕТ СОЙТИ С ПРЕДСКАЗАННОЙ ТОЧКИ за время подлёта.
 *
 * `½·a·t²` — и ничего сверх. Тем и хорошо: величина считается по НЫНЕШНЕМУ
 * состоянию цели, без всякой накопленной о ней истории. Стрелку не нужно
 * изучать противника, ему нужно смотреть, что тот делает прямо сейчас.
 */
export function evasionRadius(
  track: Pick<AirCombatTrack, "velocity" | "turnRate">,
  seconds: number,
  assumedLateral: number,
): number {
  const spare = unusedLateralAcceleration(track, assumedLateral);
  return 0.5 * spare * seconds * seconds;
}

/**
 * ПРЕДЕЛЬНАЯ ДАЛЬНОСТЬ ОГНЯ ПРОТИВ ЭТОЙ ЦЕЛИ ПРЯМО СЕЙЧАС.
 *
 * Не паспортная дальность оружия и не назначенное число: решение уравнения
 * `½·a·(R/v)² = поражение` относительно `R`, то есть `R = v·√(2·L/a)`.
 *
 * Пример на замеренных числах. Ракета 96 м/с, радиус поражения 2.0 м плюс
 * габарит цели. Против свободно идущей машины с остатком 10.9 м/с² выходит
 * около семидесяти метров; против той же машины в кульбите остаток близок к
 * нулю, и предел уходит за дальность самого оружия. Одна формула объясняет и
 * «не стреляй издалека по бодрому», и «бей по связанному, пока он связан».
 */
export function maximumEffectiveRange(
  track: Pick<AirCombatTrack, "velocity" | "turnRate">,
  projectileSpeed: number,
  lethalRadius: number,
  assumedLateral: number,
  ceiling = Number.POSITIVE_INFINITY,
): number {
  const spare = unusedLateralAcceleration(track, assumedLateral);
  if (spare <= 1e-6) return ceiling;
  return Math.min(
    ceiling,
    projectileSpeed * Math.sqrt((2 * lethalRadius) / spare),
  );
}

/**
 * СТОИТ ЛИ ТРАТИТЬ РАКЕТУ ОТСЮДА.
 *
 * Ответ не «уверен ли я», а «уложится ли уход цели в радиус поражения к
 * моменту подлёта». Порог намеренно щедрый — в него входит и габарит цели:
 * ракета, легшая в полуметре от лопасти, лопасть снимает.
 *
 * И щедрость эта осознанная. Ракета дешева, окно дорого: пока решение держится,
 * пускают ещё одну и ещё. Осторожничать имеет смысл ровно там, где выстрел
 * заведомо в пустоту, — а это и есть проверяемое здесь условие.
 */
export function shotWorthTaking(
  track: Pick<AirCombatTrack, "velocity" | "turnRate" | "radius">,
  range: number,
  projectileSpeed: number,
  lethalRadius: number,
  assumedLateral: number,
): boolean {
  if (projectileSpeed <= 1e-6) return false;
  const flight = range / projectileSpeed;
  return (
    evasionRadius(track, flight, assumedLateral) <= lethalRadius + track.radius
  );
}

export function rocketMinimumRange(
  armament: RocketArmament,
  ownRadius: number,
  closingSpeed: number,
): number {
  const profile = explosiveProfile(armament.explosive);
  return (
    ownRadius +
    profile.blastPushRadius +
    Math.max(0, closingSpeed) * armament.armSeconds
  );
}

// ---------------------------------------------------------------------------
// Состояние огня
// ---------------------------------------------------------------------------

export interface GunneryState {
  /** Непрерывное время удержания решения пушкой, с. */
  readonly trackingSeconds: number;
  /** Ракет в поду. Ноль — идёт пополнение. */
  readonly magazine: number;
  /** Осталось до полного пода, с. Ноль — под снаряжён. */
  readonly rearmSeconds: number;
  /**
   * ОДИН РИПЛ НА ЗАХОД.
   *
   * Вердикт Igor: «нормально и даже желательно, чтобы атакующий не сбивал цель
   * с первого раза; не сбил — продолжает охотиться», и это НЕ про введение
   * ошибки, а про настойчивость и отсутствие цели убить сразу.
   *
   * Выражается это не разбросом, а расходом: заход — одна огневая
   * возможность, а не время, за которое можно вывалить весь боекомплект.
   * Двенадцать труб по три в рипле дают ровно четыре захода с ракетами,
   * дальше работает пушка. Бой получает длину и ритм по построению, а не по
   * подкрученной вероятности попадания.
   */
  readonly rippleSpentThisPass: boolean;
  readonly cannonCooldown: number;
  readonly cannonShots: number;
  /** Сколько труб осталось в рипле; ноль — рипл окончен. */
  readonly rippleRemaining: number;
  readonly rocketCooldown: number;
  readonly rocketsFired: number;
}

export function createGunneryState(magazine = 0): GunneryState {
  return {
    trackingSeconds: 0,
    magazine,
    rearmSeconds: 0,
    rippleSpentThisPass: false,
    cannonCooldown: 0,
    cannonShots: 0,
    rippleRemaining: 0,
    rocketCooldown: 0,
    rocketsFired: 0,
  };
}

export interface GunneryInput {
  /** Разрешён ли огонь вообще: только на стрелковой кривой (см. автомат боя). */
  readonly weaponsFree: boolean;
  /** Луч пушки прямо сейчас проходит через цель. */
  readonly cannonSolved: boolean;
  /** Дальность до цели, м. */
  readonly range: number;
  /** Скорость сближения, м/с (положительная — сходимся). */
  readonly closingSpeed: number;
  /** Собственный полугабарит, м. */
  readonly ownRadius: number;
  /** Угловая ошибка между осью корпуса и решением встречи ракеты, рад. */
  readonly rocketAimError: number;
  /** Ворота пуска на этой дальности: угловой размер цели. */
  readonly rocketAimTolerance: number;
  /** Решение встречи сошлось. */
  readonly rocketSolved: boolean;
}

export interface GunneryShot {
  readonly weapon: "cannon" | "podRocket";
  /** Индекс трубы или ствола в паспорте. */
  readonly mountIndex: number;
  /** Угловое отклонение этого выстрела от решения, рад. */
  readonly deflection: number;
  /** Номер выстрела: он же зерно детерминированного разброса. */
  readonly serial: number;
}

export interface GunneryStep {
  readonly state: GunneryState;
  readonly shots: readonly GunneryShot[];
  /** Пуск запрещён собственным радиусом поражения. */
  readonly rocketBlockedByMinimumRange: boolean;
}

/**
 * Детерминированный разброс. Тот же приём, что у визуала взрыва: числа обязаны
 * повторяться от прогона к прогону, иначе доля попаданий перестаёт быть
 * измеримой величиной и превращается в анекдот.
 */
export function gunneryRandom01(serial: number, salt: number): number {
  const value = Math.sin(serial * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

/** Симметричное отклонение в пределах полуугла. */
function deflectionFor(serial: number, salt: number, halfAngle: number): number {
  return (gunneryRandom01(serial, salt) * 2 - 1) * halfAngle;
}

export function advanceGunnery(
  state: GunneryState,
  armament: VehicleArmament,
  input: GunneryInput,
  deltaSeconds: number,
): GunneryStep {
  const shots: GunneryShot[] = [];
  const cannonCooldown = Math.max(0, state.cannonCooldown - deltaSeconds);
  const rocketCooldown = Math.max(0, state.rocketCooldown - deltaSeconds);

  // ПОПОЛНЕНИЕ ИДЁТ САМО, независимо от боя: под снаряжают, пока машина
  // работает пушкой. Досняряжения «наполовину» нет — под либо пуст, либо полон.
  const full = armament.rockets.mounts.length;
  let magazine = state.magazine;
  let rearmSeconds = state.rearmSeconds;
  if (rearmSeconds > 0) {
    rearmSeconds = Math.max(0, rearmSeconds - deltaSeconds);
    if (rearmSeconds === 0) {
      magazine = full;
    }
  }

  // Сопровождение копится, только пока решение ДЕРЖИТСЯ. Разрыв обнуляет —
  // именно этим устойчивое сопровождение отличается от суммы мгновений.
  const holding = input.weaponsFree && input.cannonSolved;
  const trackingSeconds = holding ? state.trackingSeconds + deltaSeconds : 0;

  let cannonShots = state.cannonShots;
  let nextCannonCooldown = cannonCooldown;
  if (
    holding &&
    trackingSeconds >= armament.cannon.trackingSeconds &&
    cannonCooldown <= 0 &&
    input.range <= armament.cannon.range
  ) {
    const mountIndex = cannonShots % armament.cannon.mounts.length;
    shots.push({
      weapon: "cannon",
      mountIndex,
      deflection: deflectionFor(cannonShots, 17, armament.cannon.dispersion),
      serial: cannonShots,
    });
    cannonShots += 1;
    nextCannonCooldown = armament.cannon.fireInterval;
  }

  const minimumRange = rocketMinimumRange(
    armament.rockets,
    input.ownRadius,
    input.closingSpeed,
  );
  const tooClose = input.range < minimumRange;
  let rocketsFired = state.rocketsFired;
  let rippleRemaining = state.rippleRemaining;
  let nextRocketCooldown = rocketCooldown;

  const mayLaunch =
    input.weaponsFree &&
    input.rocketSolved &&
    magazine > 0 &&
    !tooClose &&
    input.range <= armament.rockets.range &&
    input.rocketAimError <=
      Math.max(armament.rockets.aimTolerance, input.rocketAimTolerance);

  // Начатый рипл ДОСТРЕЛИВАЕТСЯ. Это часть закона захода: обязательство,
  // взятое на входе, не пересматривается на каждом кадре.
  if (rippleRemaining > 0 && rocketCooldown <= 0 && magazine > 0) {
    const indexInRipple = armament.rockets.rippleSize - rippleRemaining;
    const mountIndex = rocketsFired % armament.rockets.mounts.length;
    shots.push({
      weapon: "podRocket",
      mountIndex,
      // Веер РАСКЛАДЫВАЕТСЯ, а не случаен: ракеты рипла обязаны разойтись, а
      // не лечь одна в другую. Случайная добавка лишь ломает симметрию.
      deflection:
        (indexInRipple - (armament.rockets.rippleSize - 1) / 2) *
          armament.rockets.rippleSpread +
        deflectionFor(rocketsFired, 41, armament.rockets.rippleSpread * 0.25),
      serial: rocketsFired,
    });
    rocketsFired += 1;
    rippleRemaining -= 1;
    nextRocketCooldown =
      rippleRemaining > 0
        ? armament.rockets.rippleInterval
        : armament.rockets.reloadSeconds;
  } else if (
    rippleRemaining === 0 &&
    mayLaunch &&
    rocketCooldown <= 0 &&
    !state.rippleSpentThisPass
  ) {
    rippleRemaining = Math.min(armament.rockets.rippleSize, magazine);
    const mountIndex = rocketsFired % armament.rockets.mounts.length;
    shots.push({
      weapon: "podRocket",
      mountIndex,
      deflection:
        (0 - (armament.rockets.rippleSize - 1) / 2) *
          armament.rockets.rippleSpread +
        deflectionFor(rocketsFired, 41, armament.rockets.rippleSpread * 0.25),
      serial: rocketsFired,
    });
    rocketsFired += 1;
    rippleRemaining -= 1;
    nextRocketCooldown =
      rippleRemaining > 0
        ? armament.rockets.rippleInterval
        : armament.rockets.reloadSeconds;
  }

  const launched = shots.filter((shot) => shot.weapon === "podRocket").length;
  magazine = Math.max(0, magazine - launched);
  if (magazine === 0 && rearmSeconds === 0 && launched > 0) {
    rearmSeconds = armament.rockets.rearmSeconds;
    // Недострелянный рипл на пустом поду не «висит» до пополнения.
    rippleRemaining = 0;
  }

  return {
    state: {
      trackingSeconds,
      magazine,
      rearmSeconds,
      rippleSpentThisPass:
        state.rippleSpentThisPass ||
        shots.some((shot) => shot.weapon === "podRocket"),
      cannonCooldown: nextCannonCooldown,
      cannonShots,
      rippleRemaining,
      rocketCooldown: nextRocketCooldown,
      rocketsFired,
    },
    shots,
    rocketBlockedByMinimumRange: tooClose && input.weaponsFree && input.rocketSolved,
  };
}

/**
 * ВЫСТРЕЛ, ГОТОВЫЙ К ИСПОЛНЕНИЮ.
 *
 * Граница проведена там же, где и всюду в проекте: геометрию считает тот, у
 * кого есть ПОЗА (система машин), а физику — тот, у кого есть МИР (сцена).
 * Поэтому наружу уходит уже мировой луч, а не «машина выстрелила, разберитесь
 * сами»: сцена не знает ни про кривые преследования, ни про сведение подов, а
 * система машин — ни про Rapier, ни про пул снарядов.
 */
export interface VehicleWeaponShot {
  readonly weapon: "cannon" | "podRocket";
  /** Чем стреляет ракетная труба; у пушки не задано. */
  readonly explosive?: ExplosiveKind;
  /** Дульный срез в мире. */
  readonly origin: SceneVector3;
  /** Единичная ось выстрела в мире: уже с разбросом и сведением. */
  readonly direction: SceneVector3;
  /** Скорость носителя: снаряд физически сходит с летящей машины. */
  readonly inheritVelocity: SceneVector3;
}

export interface VehicleWeaponFireEvent {
  readonly frameId: string;
  readonly clusterId: string;
  readonly shots: readonly VehicleWeaponShot[];
}

/** Поза стреляющей машины: авторские точки едут в мир только через неё. */
export interface WeaponCarrierPose {
  /** Мировой центр масс. */
  readonly centre: SceneVector3;
  /** Центр масс в АВТОРСКИХ осях. */
  readonly massCentre: SceneVector3;
  readonly velocity: SceneVector3;
  /** Фактическая ось ствола в мире — с креном и тангажом. */
  readonly gunAxis: SceneVector3;
  /** Поворот авторского вектора в мировой. */
  rotate(local: SceneVector3): SceneVector3;
}

/**
 * Один `GunneryShot` → один мировой выстрел.
 *
 * Пушка бьёт вдоль оси корпуса с рассеиванием; труба — вдоль СВЕДЁННОГО
 * направления, иначе она систематически мажет на свой вынос от оси
 * (см. `harmonisationRange`).
 */
export function resolveVehicleWeaponShot(
  shot: GunneryShot,
  armament: VehicleArmament,
  pose: WeaponCarrierPose,
): VehicleWeaponShot {
  const cannon = shot.weapon === "cannon";
  const mounts = cannon ? armament.cannon.mounts : armament.rockets.mounts;
  const mount = mounts[shot.mountIndex % mounts.length];
  const local = subtract(mount.muzzle, pose.massCentre);
  const offset = pose.rotate(local);
  const origin: SceneVector3 = [
    pose.centre[0] + offset[0],
    pose.centre[1] + offset[1],
    pose.centre[2] + offset[2],
  ];
  const aligned = cannon
    ? normalize(pose.gunAxis)
    : harmonisedLaunchDirection(
        origin,
        pose.centre,
        pose.gunAxis,
        armament.rockets.harmonisationRange,
      );
  // Веер разводится вокруг СОБСТВЕННОГО «вверх» машины: пусковые сидят на
  // планере. У ровно летящей это мировая вертикаль, у наклонённой — нет.
  const direction = deflectHorizontally(
    aligned,
    shot.deflection,
    pose.rotate([0, 1, 0]),
  );
  // Пушка бьёт лучом от самого среза — ей выноситься некуда и незачем: срез
  // спарки и так вынесен в нос дальше всего. Ракета рождается ВПЕРЕДИ машины.
  const clearance = cannon ? 0 : armament.rockets.launchClearance;
  return {
    weapon: shot.weapon,
    explosive: cannon ? undefined : armament.rockets.explosive,
    origin: [
      origin[0] + direction[0] * clearance,
      origin[1] + direction[1] * clearance,
      origin[2] + direction[2] * clearance,
    ],
    direction,
    inheritVelocity: pose.velocity,
  };
}

/**
 * ВЕЕР РИПЛА РАЗВОДИТСЯ ВОКРУГ СОБСТВЕННОЙ ОСИ МАШИНЫ, А НЕ ВОКРУГ МИРОВОЙ.
 *
 * Пока машина умела летать только ровно, разницы не было: её «вверх» совпадало
 * с мировым, и поворот вокруг вертикали разводил залп поперёк силуэта цели, как
 * и задумано. Пусковые сидят на планере, и веер у них — телесный.
 *
 * Как только боевой автомат научился наводить ствол позой, эта подмена вылезла
 * и вылезла грубо. Машина, работающая с превышения, кренится под семьдесят
 * градусов и опускает ствол; поворот вокруг МИРОВОЙ вертикали разводит при этом
 * не поперёк цели, а по конусу вокруг неё. А на отвесном стволе вырождается
 * совсем: направление `[0,−1,0]` вокруг оси Y не поворачивается вовсе, и весь
 * рипл уходит в одну точку.
 *
 * Ось по умолчанию — мировая вертикаль: тогда для ровного полёта результат
 * побайтно прежний, и старые замеры остаются в силе.
 */
export function deflectHorizontally(
  direction: SceneVector3,
  radians: number,
  /** Ось разведения: «вверх» у корпуса. По умолчанию — мировая вертикаль. */
  axis: SceneVector3 = [0, 1, 0],
): SceneVector3 {
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const length = Math.hypot(axis[0], axis[1], axis[2]);
  if (length < 1e-9) {
    return direction;
  }
  const unit: SceneVector3 = [axis[0] / length, axis[1] / length, axis[2] / length];
  // Родригес: поворот вектора вокруг произвольной оси. Для оси `[0,1,0]` он
  // сводится ровно к прежним трём строкам, знак в знак.
  const dotted =
    unit[0] * direction[0] + unit[1] * direction[1] + unit[2] * direction[2];
  const crossed: SceneVector3 = [
    unit[1] * direction[2] - unit[2] * direction[1],
    unit[2] * direction[0] - unit[0] * direction[2],
    unit[0] * direction[1] - unit[1] * direction[0],
  ];
  return [
    direction[0] * cosine + crossed[0] * sine + unit[0] * dotted * (1 - cosine),
    direction[1] * cosine + crossed[1] * sine + unit[1] * dotted * (1 - cosine),
    direction[2] * cosine + crossed[2] * sine + unit[2] * dotted * (1 - cosine),
  ];
}

/**
 * Новый заход — новая огневая возможность. Боекомплект при этом НЕ
 * пополняется: заход снимает право на рипл, а не снаряжает под.
 */
export function armGunneryForPass(state: GunneryState): GunneryState {
  return { ...state, rippleSpentThisPass: false, rippleRemaining: 0 };
}

/** Скорость сближения: проекция относительной скорости на линию визирования. */
export function closingSpeedTo(
  origin: SceneVector3,
  ownVelocity: SceneVector3,
  track: Pick<AirCombatTrack, "centre" | "velocity">,
): number {
  const line = subtract(track.centre, origin);
  const distance = length(line);
  if (distance < EPSILON) {
    return 0;
  }
  const axis = scaled(line, 1 / distance);
  return dot(subtract(ownVelocity, track.velocity), axis);
}
