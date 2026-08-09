import type { SceneVector3 } from "./destructionScene.ts";
import { extrapolateTrack } from "./vehicleGunnery.ts";

/**
 * ЧЕМ ЗАКРЫТЬ ВСТРЕЧУ: ОЦЕНЩИК МАНЁВРОВ.
 *
 * Модуль не летает и не стреляет. Он отвечает на один вопрос и ничего сверх:
 * ЕСЛИ НАЧАТЬ ЭТОТ МАНЁВР СЕЙЧАС, ЧЕРЕЗ СКОЛЬКО СЕКУНД БУДЕТ ОГНЕВОЕ РЕШЕНИЕ И
 * ЧЕМ ЗА НЕГО ПЛАТИТЬ. Дальше выбирается минимум.
 *
 * Почему так, а не перечнем случаев. Боевой автомат сегодня умеет ровно один
 * ответ — заход, — и он написан правильно для того, чем был: единственным, что
 * машина могла. Замер дуэли против VX-8 показал ему цену: атакующему объявлен
 * 21 м/с, соседу тридцать на прямых, и из полутораста секунд RAX простоял на
 * станции сто пять. Погоня за тем, кто быстрее, — это не плохой манёвр, это
 * ОТСУТСТВИЕ решения, и признать его отсутствием должен уметь сам автомат.
 *
 * Соблазн — дописать «если не догоняем, то срезать хорду». Так получился бы
 * тот же рудимент, только из восьми штук: перечень случаев не становится
 * разумностью оттого, что он длинный.
 *
 * ОБЩИЙ ЗАКОН, ИЗ КОТОРОГО ВСЁ ВЫВОДИТСЯ, ОДИН: ХОД, ВЫСОТА И УГОЛ — ТРИ
 * ВАЛЮТЫ, И КАЖДЫЙ МАНЁВР ЕСТЬ ОБМЕН ОДНОЙ НА ДРУГУЮ.
 *
 *   - высота → ход: сорок метров превышения дают на пикировании 28 м/с, и
 *     этого больше, чем всё преимущество VX-8 в прямой. Мотор такого не даст,
 *     тяжесть даст;
 *   - ход → угол: иммельман разворачивает курс БЕЗ горизонтального смещения,
 *     тогда как обычный разворот стоит радиуса `v²/a`;
 *   - угол → ход: кульбит тормозит с пяти с половиной g, и заход
 *     преследователя рассыпается сам;
 *   - а иногда не нужно менять ничего: на встречном курсе сближение есть сумма
 *     скоростей, и гнаться не приходится вовсе.
 *
 * И ещё одно, что оценщик обязан знать про этот мир: АРЕНА ЗАМКНУТА. Более
 * медленному не нужно догонять — ему нужно оказаться там, куда быстрый и так
 * обязан прийти. Поэтому базовый кандидат здесь не «догнать», а ВСТРЕТИТЬ:
 * решается уравнение встречи по экстраполяции чужого манёвра, и погоня
 * получается его частным случаем, когда цель идёт прямо.
 */

export type AirManoeuvreKind = "intercept" | "dive" | "headOn" | "reverse";

/** Что оценщик знает о встрече. Всё — в мировых осях, метры и секунды. */
export interface AirEngagementGeometry {
  readonly own: {
    readonly centre: SceneVector3;
    readonly velocity: SceneVector3;
    /** Горизонтальный курс, единичный. */
    readonly nose: readonly [number, number];
  };
  readonly target: {
    readonly centre: SceneVector3;
    readonly velocity: SceneVector3;
    /** Темп разворота вектора скорости цели, рад/с. Её текущий манёвр. */
    readonly turnRate: number;
  };
}

/**
 * Что машина может — в величинах манёвра. Ни одно число здесь не назначается
 * оценщиком: все приходят из паспорта, как приходят в фигуры.
 */
export interface AirManoeuvreCapability {
  /** Наибольший установившийся ход, м/с. */
  readonly maximumSpeed: number;
  /** Поперечное ускорение по наклону, м/с². Оно же задаёт радиус виража. */
  readonly lateralAcceleration: number;
  /** Продольное ускорение прямой тягой, м/с². У машины без тоннелей ноль. */
  readonly surgeAcceleration: number;
  /** Располагаемый темп рыскания, рад/с. */
  readonly yawRate: number;
  /** Дальность, с которой оружие работает, м. */
  readonly firingRange: number;
  /** Ближе этого пускать нельзя: собственный радиус поражения. */
  readonly minimumRange: number;
  /** Полураствор конуса, в котором неподвижный ствол считается наведённым. */
  readonly gunCone: number;
  /**
   * Секунды на разворот курса фигурой (иммельман или петля вниз) и высота,
   * которой она за это платит. Приходят из `flightFigures`, а не отсюда:
   * оценщик не имеет права иметь СВОЁ мнение о том, сколько стоит фигура.
   */
  readonly reversal: { readonly seconds: number; readonly cost: number } | null;
  /** Насколько низко машине разрешено опускаться, м над бертом. */
  readonly floor: number;
}

export interface AirManoeuvreEstimate {
  readonly kind: AirManoeuvreKind;
  /**
   * Секунды до огневого решения. `Infinity` — решения нет: не «долго», а
   * НЕТ, и это главное, что оценщик обязан уметь сказать.
   */
  readonly seconds: number;
  /**
   * Чем платим, м высоты. Не штраф и не вес: это ровно та высота, которой
   * манёвр лишится, и сравнивать её надо с этажом, а не с другими манёврами.
   */
  readonly cost: number;
  readonly feasible: boolean;
  /** Почему нельзя. `null` — можно. */
  readonly reason: string | null;
}

const GRAVITY = 9.81;

const flat = (v: SceneVector3): number => Math.hypot(v[0], v[2]);
const distance = (a: SceneVector3, b: SceneVector3): number =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

const infeasible = (
  kind: AirManoeuvreKind,
  reason: string,
): AirManoeuvreEstimate => ({
  kind,
  seconds: Number.POSITIVE_INFINITY,
  cost: 0,
  feasible: false,
  reason,
});

/**
 * ВРЕМЯ ВСТРЕЧИ: за сколько секунд машина, идущая ходом `speed`, окажется на
 * огневой дистанции от цели, продолжающей СВОЙ манёвр.
 *
 * Решается перебором по времени, а не формулой, и это не лень. Цель разворачи-
 * вается: её положение — не прямая, а дуга, и уравнение встречи с дугой
 * трансцендентно. Перебор с шагом в пятую долю секунды даёт ответ с той же
 * точностью, с какой вообще известен чужой темп разворота.
 *
 * И здесь же лежит вся разница между «догнать» и «встретить». Догоняющий
 * целится в НЫНЕШНЕЕ положение и потому проигрывает всякому, кто быстрее.
 * Встречающий целится в БУДУЩЕЕ: цели, идущей по кругу, достаточно один раз
 * оказаться на хорде — и она сама приходит навстречу. Отдельного «срезания
 * хорды» писать не пришлось, оно выпало из этого перебора само.
 */
export function timeToReach(
  from: SceneVector3,
  speed: number,
  target: AirEngagementGeometry["target"],
  firingRange: number,
  horizon = 30,
  step = 0.2,
): number {
  if (speed <= 0.1) return Number.POSITIVE_INFINITY;
  for (let t = 0; t <= horizon; t += step) {
    const where = extrapolateTrack(target, t);
    const gap = distance(from, where);
    // Успеваю ли я к этому моменту оказаться на дистанции огня от той точки.
    if (gap - firingRange <= speed * t) {
      return t;
    }
  }
  return Number.POSITIVE_INFINITY;
}

/** Угол между носом и направлением на точку, рад. */
export function bearingTo(
  nose: readonly [number, number],
  from: SceneVector3,
  to: SceneVector3,
): number {
  const dx = to[0] - from[0];
  const dz = to[2] - from[2];
  const length = Math.hypot(dx, dz) || 1;
  const cosine = Math.max(
    -1,
    Math.min(1, (nose[0] * dx + nose[1] * dz) / length),
  );
  return Math.acos(cosine);
}

/**
 * РАКУРС: под каким углом цель видит меня. Ноль — идёт прямо на меня, π —
 * убегает. Из него одного следует, есть ли вообще встречный курс.
 */
export function aspectAngle(geometry: AirEngagementGeometry): number {
  const { own, target } = geometry;
  const speed = flat(target.velocity);
  if (speed < 0.5) return Math.PI / 2;
  const dx = own.centre[0] - target.centre[0];
  const dz = own.centre[2] - target.centre[2];
  const length = Math.hypot(dx, dz) || 1;
  const cosine = Math.max(
    -1,
    Math.min(
      1,
      (target.velocity[0] * dx + target.velocity[2] * dz) / (speed * length),
    ),
  );
  return Math.acos(cosine);
}

/**
 * СКОЛЬКО СЕКУНД ВОДИТЬ НОС ДО ЦЕЛИ — и почему это отдельная величина.
 *
 * Дистанция огня не есть огневое решение. Ствол неподвижен, и попасть в
 * дистанцию, не наведя нос, значит не попасть вовсе. Первая редакция этого не
 * различала: `intercept` возвращал ноль, едва цель оказывалась ближе огневой
 * дальности, и потому побеждал всех и всегда — то есть был прежним рудиментом
 * под новым именем.
 *
 * Скорость наведения — МОЙ темп минус ЕГО: цель тоже разворачивается, и её
 * разворот уводит нос из-под прицела. Если разница неположительна, ответ не
 * «долго», а НИКОГДА, и сказать надо именно это: большое число выбор рано или
 * поздно выберет, бесконечность — никогда.
 *
 * И собственный темп берётся не паспортным рысканием, а МЕНЬШИМ из двух:
 * рыскание и `a/v`. Второе — угловая скорость виража, и на большом ходу она
 * меньше: разворот радиусом `v²/a` тем ленивее, чем быстрее машина идёт. Отсюда
 * прямое следствие, которое дальше решает выбор между виражом и фигурой.
 */
export function secondsToBoresight(
  bearing: number,
  ownSpeed: number,
  targetTurnRate: number,
  capability: AirManoeuvreCapability,
): number {
  if (bearing <= capability.gunCone) return 0;
  const mine = Math.min(
    capability.yawRate,
    capability.lateralAcceleration / Math.max(1, ownSpeed),
  );
  const gain = mine - Math.abs(targetTurnRate);
  if (gain <= 0.02) return Number.POSITIVE_INFINITY;
  return (bearing - capability.gunCone) / gain;
}

/**
 * ВРЕМЯ ДО РЕШЕНИЯ ЕСТЬ БОЛЬШЕЕ ИЗ ДВУХ, А НЕ СУММА: место и угол набираются
 * ОДНОВРЕМЕННО. Машина не сперва долетает, а потом доворачивает — она
 * доворачивает по дороге.
 */
function solutionSeconds(
  travel: number,
  geometry: AirEngagementGeometry,
  capability: AirManoeuvreCapability,
): number {
  if (!Number.isFinite(travel)) return Number.POSITIVE_INFINITY;
  const meeting = extrapolateTrack(geometry.target, travel);
  const bearing = bearingTo(geometry.own.nose, geometry.own.centre, meeting);
  return Math.max(
    travel,
    secondsToBoresight(
      bearing,
      flat(geometry.own.velocity),
      geometry.target.turnRate,
      capability,
    ),
  );
}

/**
 * ВСТРЕЧА. Базовый кандидат: идти по прямой в точку, где цель окажется сама.
 * Погоня — его вырожденный случай, и потому отдельным кандидатом не значится.
 */
function estimateIntercept(
  geometry: AirEngagementGeometry,
  capability: AirManoeuvreCapability,
): AirManoeuvreEstimate {
  const seconds = solutionSeconds(
    timeToReach(
      geometry.own.centre,
      capability.maximumSpeed,
      geometry.target,
      capability.firingRange,
    ),
    geometry,
    capability,
  );
  return {
    kind: "intercept",
    seconds,
    cost: 0,
    feasible: Number.isFinite(seconds),
    reason: Number.isFinite(seconds)
      ? null
      : "встречи нет: цель быстрее либо разворачивается не медленнее меня",
  };
}

/**
 * ПИКИРОВАНИЕ: высота, обменянная на ход.
 *
 * `v = √(v₀² + 2gh)` — закон сохранения и ничего больше. Ход берётся не у
 * мотора, а у тяжести, и потому не ограничен паспортной скоростью машины:
 * пикирующий RAX-8 с сорока метров превышения идёт 32 м/с там, где его
 * установившийся предел двадцать один.
 *
 * Платится ровно та высота, которую манёвр израсходует, и платится она
 * НАСОВСЕМ: обратно её поднимает мотор, медленно. Поэтому цена возвращается
 * числом, а не прячется в оценку времени.
 */
function estimateDive(
  geometry: AirEngagementGeometry,
  capability: AirManoeuvreCapability,
): AirManoeuvreEstimate {
  const advantage = geometry.own.centre[1] - geometry.target.centre[1];
  // Меньше десяти метров превышения разгона не дают: `√(2·9.81·10)` это
  // четырнадцать метров в секунду ДО вычета того, что уходит на разворот
  // вектора вниз и обратно.
  if (advantage < 10) {
    return infeasible("dive", "нет превышения");
  }
  const usable = Math.max(0, geometry.own.centre[1] - capability.floor);
  const spend = Math.min(advantage, usable);
  if (spend < 10) {
    return infeasible("dive", "под машиной этаж, а не воздух");
  }
  const start = flat(geometry.own.velocity);
  const dive = Math.sqrt(start * start + 2 * GRAVITY * spend);
  const seconds = solutionSeconds(
    timeToReach(
      geometry.own.centre,
      dive,
      geometry.target,
      capability.firingRange,
    ),
    geometry,
    capability,
  );
  return {
    kind: "dive",
    seconds,
    cost: spend,
    feasible: Number.isFinite(seconds),
    reason: Number.isFinite(seconds) ? null : "даже на разгоне не встречаемся",
  };
}

/**
 * ВСТРЕЧНЫЙ КУРС. Самый дешёвый способ выстрелить из неподвижного ствола:
 * сближение равно СУММЕ скоростей, гнаться не надо вовсе, а ракурс цели
 * наибольший из возможных.
 *
 * Годен только когда цель уже идёт на меня: при ракурсе больше шестидесяти
 * градусов «встречный курс» превращается в обычную погоню и врёт о своём
 * сближении.
 */
function estimateHeadOn(
  geometry: AirEngagementGeometry,
  capability: AirManoeuvreCapability,
): AirManoeuvreEstimate {
  const aspect = aspectAngle(geometry);
  if (aspect > Math.PI / 3) {
    return infeasible("headOn", "цель не идёт навстречу");
  }
  const range = distance(geometry.own.centre, geometry.target.centre);
  const closing =
    capability.maximumSpeed + flat(geometry.target.velocity) * Math.cos(aspect);
  if (closing <= 0.1) {
    return infeasible("headOn", "сближения нет");
  }
  const travel = Math.max(0, (range - capability.firingRange) / closing);
  const seconds = solutionSeconds(travel, geometry, capability);
  return {
    kind: "headOn",
    seconds,
    cost: 0,
    feasible: Number.isFinite(seconds),
    reason: Number.isFinite(seconds) ? null : "нос не успевает за ним",
  };
}

/**
 * РАЗВОРОТ ФИГУРОЙ. Годен ровно тогда, когда цель ЗА СПИНОЙ: я проскочил, и
 * дальше вопрос не в дистанции, а в курсе.
 *
 * Обычного разворота здесь НЕ СЧИТАЕТСЯ, и это важно: его уже считает
 * `secondsToBoresight` — там `a/v` и есть угловая скорость виража. Написать его
 * ещё раз значило бы завести у автомата два мнения об одном манёвре.
 *
 * Фигура же побеждает вираж не всегда, а ПО ХОДУ, и это самое красивое
 * следствие всей раскладки. Радиус виража растёт как `v²/a`, значит его
 * угловая скорость падает как `a/v`; время фигуры от хода не зависит вовсе.
 * Для RAX-8: на 21 м/с вираж разворачивает за 4.5 с против 5.1 у иммельмана —
 * вираж дешевле. На 30 м/с (а столько машина имеет после пикирования) вираж
 * уже 6.4 с, и фигура выигрывает.
 *
 * То есть: ЧЕМ БЫСТРЕЕ ИДЁШЬ, ТЕМ ВЫГОДНЕЕ РАЗВОРАЧИВАТЬСЯ ЧЕРЕЗ ВЕРХ. Этого
 * никто не задавал; это вышло из двух формул.
 */
function estimateReverse(
  geometry: AirEngagementGeometry,
  capability: AirManoeuvreCapability,
): AirManoeuvreEstimate {
  const bearing = bearingTo(
    geometry.own.nose,
    geometry.own.centre,
    geometry.target.centre,
  );
  if (bearing < (Math.PI * 2) / 3) {
    return infeasible("reverse", "цель не за спиной");
  }
  if (!capability.reversal) {
    return infeasible("reverse", "фигуры этой машине не объявлены");
  }
  const room = geometry.own.centre[1] - capability.floor;
  if (room < capability.reversal.cost) {
    return infeasible("reverse", "не хватает высоты на фигуру");
  }
  return {
    kind: "reverse",
    seconds: capability.reversal.seconds,
    cost: capability.reversal.cost,
    feasible: true,
    reason: null,
  };
}

/** Все кандидаты, оценённые на одной и той же геометрии. */
export function estimateAirManoeuvres(
  geometry: AirEngagementGeometry,
  capability: AirManoeuvreCapability,
): readonly AirManoeuvreEstimate[] {
  return [
    estimateIntercept(geometry, capability),
    estimateDive(geometry, capability),
    estimateHeadOn(geometry, capability),
    estimateReverse(geometry, capability),
  ];
}

/**
 * ВЫБОР — МИНИМУМ ПО ВРЕМЕНИ, и высота решает только при ничьей.
 *
 * Порядок именно такой, а не «взвешенная сумма». Сумма потребовала бы веса,
 * вес — подгонки, а подгонка — оправдания. Время до решения есть предмет боя;
 * высота есть ресурс, которым платят, и тратить его имеет смысл только тогда,
 * когда он покупает время. Если два манёвра дают одно время, берётся тот, что
 * дешевле, — и никакого третьего правила не нужно.
 *
 * `null` означает «решения нет ни одним манёвром». Это законный ответ и,
 * пожалуй, самый важный: именно его сегодняшний автомат сказать не умеет и
 * потому сто пять секунд из полутораста стоит на станции, делая вид, что
 * охотится.
 */
export function chooseAirManoeuvre(
  geometry: AirEngagementGeometry,
  capability: AirManoeuvreCapability,
): AirManoeuvreEstimate | null {
  let best: AirManoeuvreEstimate | null = null;
  for (const candidate of estimateAirManoeuvres(geometry, capability)) {
    if (!candidate.feasible) continue;
    if (
      !best ||
      candidate.seconds < best.seconds - 1e-9 ||
      (Math.abs(candidate.seconds - best.seconds) <= 1e-9 &&
        candidate.cost < best.cost)
    ) {
      best = candidate;
    }
  }
  return best;
}
