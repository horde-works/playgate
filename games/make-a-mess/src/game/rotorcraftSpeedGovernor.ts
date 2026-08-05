/**
 * ОГРАНИЧИТЕЛЬ СКОРОСТИ ПО ДОПУСТИМОМУ ЗАНОСУ
 *
 * Почему он вообще понадобился. Скорость на маршруте раньше была АВТОРСКИМ
 * числом: полосы по progress, выставленные руками. Это неверно по устройству, а
 * не по исполнению — трасса не знает машину, а машина не знает трассу. Один и
 * тот же круг для дирижабля и для боевого коптера требует разных чисел, и
 * держать их в маршруте значит переписывать маршрут при каждой правке паспорта.
 * На замерах это стоило двух промахов подряд: 92 метра мимо трассы, потом 48.
 *
 * Здесь скорость СЧИТАЕТСЯ из геометрии трассы и физики машины. Трасса несёт
 * только форму, паспорт — только способности, а их встреча даёт предел.
 *
 * ЗАНОС — центральная величина, и она физическая, а не выдуманная. Это угол
 * между тем, куда смотрит нос, и тем, куда машина едет:
 * `β = atan2(боковая скорость, продольная)`. У автомобиля это ровно то, что
 * ограничивают системы устойчивости; у винтокрылой машины смысл тот же.
 *
 * Откуда он берётся в вираже. Вектор скорости поворачивается с темпом `v/r` —
 * это чистая кинематика окружности. Нос поворачивается не быстрее, чем машина
 * умеет, то есть `ω_max`. Пока `v/r` больше, разница копится:
 *
 *     dβ/dt = v/r − ω_max
 *
 * За дугу поворота `Δψ` (время прохождения `Δψ·r/v`) накопится
 *
 *     β = Δψ · (1 − ω_max·r/v)
 *
 * Отсюда прямо получается предельная скорость по заносу — она ниже. И отдельно
 * стоит жёсткий предел по крену: поперечная сила у коптера берётся только
 * наклоном, `v ≤ √(a·r)`.
 *
 * МОДУЛЬ НЕ ЗНАЕТ НИ ОДНОЙ МАШИНЫ И НИ ОДНОГО МАРШРУТА, и это здесь главное
 * ограничение, а не общая опрятность. Ограничитель скорости — ровно тот сорт
 * кода, который обрастает ветками «если это боевой гексакоптер, то…»: у каждой
 * машины свои виражи, у каждой трассы свои неудобные места, и соблазн
 * подкрутить конкретный случай возникает при первом же промахе. Здесь на входе
 * только числа — способности аппарата и геометрия трассы, — а на выходе одно
 * число. Любая машина, которая умеет сообщить свой темп рыскания и поперечное
 * ускорение, получает этот закон целиком и без исключений.
 */

export interface RotorcraftTurnCapability {
  /**
   * Располагаемый темп рыскания, рад/с. Приходит СНИЗУ, из аллокатора
   * (`yawRateLimits`), а не из паспорта: выбитый тоннель сужает его сам, и
   * ограничитель обязан узнать об этом тем же путём, что и всё остальное.
   */
  readonly yawRate: number;
  /**
   * Располагаемое ПОПЕРЕЧНОЕ ускорение, м/с². У коптера это `g·tg(θmax)` и
   * ничто иное: тоннели толкают вдоль носа и в вираже не помогают.
   */
  readonly lateralAcceleration: number;
  /**
   * Располагаемое ТОРМОЖЕНИЕ, м/с². У машины с реверсивными тоннелями оно
   * заметно больше разгонного наклона, и не считать его — значит без нужды
   * подползать к каждому виражу.
   */
  readonly braking: number;
  /**
   * Постоянная отклика контура скорости, с. Пока команда «тормози» доходит до
   * фактической силы, машина летит прежним ходом — и эту дистанцию надо
   * вычитать из запаса до виража. Без неё ограничитель считал аппарат
   * идеальным: «до поворота четыре метра, сброшу» — и в восьмёрку машина
   * входила на 25 м/с при вираже на 14.7.
   */
  readonly responseSeconds?: number;
}

/** Сколько заносить разрешено. Двойной: маршрут терпит, створ — нет. */
export interface RotorcraftSlipPolicy {
  /** Допустимый занос на маршруте, рад. */
  readonly enRoute: number;
  /** Допустимый занос от входа в створ до касания, рад. */
  readonly onApproach: number;
}

export const DEFAULT_SLIP_POLICY: RotorcraftSlipPolicy = {
  // НА МАРШРУТЕ ЗАНОС ПОЧТИ СВОБОДЕН, И ЭТО НАМЕРЕННО.
  //
  // Голономная машина держит ТРАССУ, а не курс: она смещается вбок сколько
  // угодно, не разворачиваясь, и нос ей для полёта по линии не нужен. Требовать
  // от неё курс в вираже — значит навязывать ограничение самолёта и получить
  // рейсовый автобус: либо скучный ход, либо вылет с трассы. Спортивная машина
  // входит в поворот боком, и это норма, а не потеря управления.
  //
  // Поэтому семьдесят градусов: канал остаётся живым и поймает настоящую
  // потерю управления, но не станет тормозить машину за то, что она проходит
  // три резких манёвра подряд полубоком. Нос догонит курс, когда сможет
  // физически, — у обычного коптера это может быть и после манёвра.
  enRoute: (70 * Math.PI) / 180,
  // А вот на заходе он почти запрещён, и здесь разница принципиальная: створ
  // требует прийти В ПОЛОЖЕНИИ, а не просто в точке, и крабом в стакан не
  // попасть. Курс важен ровно там, где он физически что-то значит.
  onApproach: (6 * Math.PI) / 180,
};

/**
 * ДОПУСК ЗАНОСА ИЗ ШИРИНЫ КОРИДОРА. Точность — свойство траектории: узкий
 * коридор городской улицы (± метры) означает строгий занос и, через закон
 * виража, малую скорость; широкий над водой — «резвись, и пусть тебя заносит».
 * Створ перестаёт быть особым случаем: это просто участок с узким коридором.
 *
 * Границы: до 5 м — створовая строгость, от 20 м — маршрутная свобода, между
 * ними плавно. Числа осознанно грубые: это политика ощущения, не физика.
 */
export function slipAllowanceForCorridor(
  corridorHalfWidth: number,
  policy: RotorcraftSlipPolicy = DEFAULT_SLIP_POLICY,
): number {
  const strictBelow = 5;
  const freeAbove = 20;
  const raw =
    (corridorHalfWidth - strictBelow) / (freeAbove - strictBelow);
  const clamped = Math.max(0, Math.min(1, raw));
  const eased = clamped * clamped * (3 - 2 * clamped);
  return (
    policy.onApproach + (policy.enRoute - policy.onApproach) * eased
  );
}

/**
 * Радиус поворота трассы по трём последовательным точкам — радиус описанной
 * окружности. Прямая даёт бесконечность, и это правильный ответ: на прямой
 * вираж не ограничивает ничего.
 */
export function pathTurnRadius(
  previous: readonly [number, number],
  current: readonly [number, number],
  next: readonly [number, number],
): number {
  const ax = current[0] - previous[0];
  const az = current[1] - previous[1];
  const bx = next[0] - current[0];
  const bz = next[1] - current[1];
  const first = Math.hypot(ax, az);
  const second = Math.hypot(bx, bz);
  const third = Math.hypot(next[0] - previous[0], next[1] - previous[1]);
  // Удвоенная площадь треугольника через векторное произведение.
  const cross = Math.abs(ax * bz - az * bx);
  if (cross < 1e-9 || first < 1e-9 || second < 1e-9) {
    return Number.POSITIVE_INFINITY;
  }
  return (first * second * third) / (2 * cross);
}

/** Угол поворота трассы в этой точке, рад. */
export function pathTurnAngle(
  previous: readonly [number, number],
  current: readonly [number, number],
  next: readonly [number, number],
): number {
  const ax = current[0] - previous[0];
  const az = current[1] - previous[1];
  const bx = next[0] - current[0];
  const bz = next[1] - current[1];
  if (Math.hypot(ax, az) < 1e-9 || Math.hypot(bx, bz) < 1e-9) {
    return 0;
  }
  return Math.abs(Math.atan2(ax * bz - az * bx, ax * bx + az * bz));
}

/**
 * Скорость, на которой вираж проходится, НЕ ВЫЙДЯ за допустимый занос.
 *
 * Два предела, и берётся меньший:
 *
 *   по крену     `v ≤ √(a·r)` — поперечной силы больше просто нет;
 *   по рысканью  `v ≤ ω·r / (1 − β/Δψ)` — иначе нос отстанет сильнее, чем
 *                разрешено.
 *
 * Знаменатель второго объясняет, почему короткий излом можно проходить быстро:
 * если вся дуга короче допустимого заноса, нос не успеет отстать существенно —
 * ограничение снимается. Ровно так и ведёт себя живой пилот, который срезает
 * мелкую кривизну и тормозит перед настоящим поворотом.
 */
export function corneringSpeed(
  radius: number,
  turnAngle: number,
  capability: RotorcraftTurnCapability,
  slipAllowance: number,
): number {
  if (!Number.isFinite(radius) || radius <= 0) {
    return Number.POSITIVE_INFINITY;
  }
  const byBank = Math.sqrt(
    Math.max(0, capability.lateralAcceleration) * radius,
  );
  const coordinated = Math.max(0, capability.yawRate) * radius;
  if (turnAngle <= 1e-6) {
    return byBank;
  }
  const relief = 1 - Math.min(0.95, slipAllowance / turnAngle);
  const byYaw =
    relief <= 1e-6 ? Number.POSITIVE_INFINITY : coordinated / relief;
  return Math.min(byBank, byYaw);
}

/** Точка трассы впереди: как далеко до неё и какой там поворот. */
export interface RotorcraftPathSample {
  /** Расстояние по трассе от машины до этой точки, м. */
  readonly distance: number;
  readonly radius: number;
  readonly turnAngle: number;
  /**
   * Авторский предел В ЭТОЙ точке, если есть. Ступенька замысла — такое же
   * требование к профилю, как вираж: без неё машина мчалась до самой ступеньки
   * и осаживалась рывком, потому что тормозная парабола о ней не знала.
   */
  readonly speedCap?: number;
}

/**
 * ПРЕДЕЛ СКОРОСТИ ЗДЕСЬ И СЕЙЧАС по всему, что ждёт впереди.
 *
 * Мало знать, что вираж потребует двенадцати метров в секунду: до него надо
 * успеть замедлиться. Поэтому каждая точка впереди даёт своё требование к
 * ТЕКУЩЕЙ скорости через обычную формулу торможения `v² = v_цель² + 2·a·s`, и
 * берётся самое строгое. У машины с реверсивными тоннелями `a` велико, поэтому
 * она подходит к виражу поздно и резко — как и положено злой машине.
 */
export function pathSpeedCeiling(
  samples: readonly RotorcraftPathSample[],
  capability: RotorcraftTurnCapability,
  slipAllowance: number,
): number {
  let ceiling = Number.POSITIVE_INFINITY;
  const braking = Math.max(0.01, capability.braking);
  // За время отклика машина НЕ тормозит — она пролетает `v·τ` прежним ходом.
  // Отсюда квадратное уравнение `v² = target² + 2a·(d − v·τ)`, решённое ниже;
  // нижняя граница `target` — у самого виража формула иначе давала бы меньше
  // самой скорости виража.
  const lag = Math.max(0, capability.responseSeconds ?? 0) * braking;
  for (const sample of samples) {
    const target = Math.min(
      corneringSpeed(sample.radius, sample.turnAngle, capability, slipAllowance),
      sample.speedCap ?? Number.POSITIVE_INFINITY,
    );
    if (!Number.isFinite(target)) {
      continue;
    }
    const distance = Math.max(0, sample.distance);
    const allowed = Math.max(
      target,
      -lag + Math.sqrt(lag * lag + target * target + 2 * braking * distance),
    );
    if (allowed < ceiling) {
      ceiling = allowed;
    }
  }
  return ceiling;
}

/**
 * Замеренный занос: угол между носом и вектором пути.
 *
 * На малом ходу он бессмысленен — при почти нулевой скорости любой снос даёт
 * огромный угол, и реагировать на это значит зажимать машину на висении, где
 * заноса как явления нет. Поэтому ниже порога возвращается ноль.
 */
export function measuredSlipAngle(
  forwardSpeed: number,
  lateralSpeed: number,
  minimumSpeed = 1.5,
): number {
  const speed = Math.hypot(forwardSpeed, lateralSpeed);
  if (speed < minimumSpeed) {
    return 0;
  }
  return Math.atan2(lateralSpeed, Math.abs(forwardSpeed));
}

export interface RotorcraftGovernorState {
  /** Во сколько раз ограничитель сейчас режет разрешённую скорость, 0…1. */
  readonly scale: number;
}

export const NEUTRAL_GOVERNOR: RotorcraftGovernorState = { scale: 1 };

/**
 * ОБРАТНАЯ СВЯЗЬ ПО ФАКТИЧЕСКОМУ ЗАНОСУ.
 *
 * Всё выше — упреждение: оно считает по трассе и паспорту то, что МОЖНО
 * предсказать. Эта часть ловит то, чего предсказать нельзя, — ветер, удар,
 * выбитый тоннель, ошибку в собственной оценке радиуса. Если нос отстал
 * сильнее разрешённого, скорость режется независимо от того, почему.
 *
 * Режет быстро, отпускает медленно: занос — признак уже потерянного
 * управления, и торопиться возвращать скорость нельзя.
 */
export function advanceRotorcraftGovernor(
  state: RotorcraftGovernorState,
  measuredSlip: number,
  slipAllowance: number,
  deltaSeconds: number,
): RotorcraftGovernorState {
  const excess = Math.abs(measuredSlip) - Math.abs(slipAllowance);
  const wanted =
    excess <= 0
      ? 1
      : Math.max(
          0.25,
          Math.abs(slipAllowance) / Math.max(1e-6, Math.abs(measuredSlip)),
        );
  const response = wanted < state.scale ? 4 : 0.5;
  const blend = 1 - Math.exp(-Math.max(0, deltaSeconds) * response);
  return { scale: state.scale + (wanted - state.scale) * blend };
}
