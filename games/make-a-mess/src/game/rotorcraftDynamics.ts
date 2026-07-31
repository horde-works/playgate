import type { SceneVector3 } from "./destructionScene.ts";

/**
 * ФИЗИКА ВИНТОКРЫЛОЙ МАШИНЫ: МИКШЕР ВИНТОВ И НАКЛОН ВМЕСТО БОКОВОГО ТОЛЧКА
 *
 * Дирижабль и коптер держатся в воздухе по-разному, и из этого следует разная
 * физика движения, а не разная настройка одной.
 *
 * У ДИРИЖАБЛЯ подъём приложен вертикально в центре объёма газа, а горизонт
 * даёт тяга вдоль корпуса. Корпус при этом горизонтален: наклон ему не нужен и
 * ничего не даёт.
 *
 * У КОПТЕРА горизонтальной силы без наклона НЕ БЫВАЕТ. Каждый винт толкает
 * вдоль оси корпуса; сумма — подъём, разность — моменты по крену и тангажу.
 * Наклонив корпус, машина наклоняет и вектор подъёма, и его горизонтальная
 * составляющая и есть весь её ход. Отсюда три следствия, которых нет ни у
 * одной другой машины проекта:
 *
 *   - предел горизонтального ускорения равен `g·tan(θmax)` — одно число,
 *     выведенное из предельного наклона, а не назначенное отдельно;
 *   - наклон забирает вертикаль: `cos θ`. Резкий манёвр роняет высоту, если
 *     не добавить оборотов. Эта связанность и делает полёт коптерным;
 *   - между командой и силой стоит УГОЛ. Сила не появляется мгновенно —
 *     сначала машина должна повернуться. Отсюда её собственная инерция
 *     реакции, без которой аппарат выглядит резким и неживым.
 *
 * Курс к этому отношения не имеет: рыскание — независимый четвёртый канал,
 * ровно как у дирижабля. Отличается только чем создаётся момент: у дирижабля
 * пером и разнотягом моторов, у коптера — реактивным моментом встречных пар
 * винтов, поэтому он не создаёт паразитной горизонтальной силы.
 *
 * Модуль чистый: ни three, ни rapier, ни знания о конкретной машине.
 */

/** Задание автоматике: чего от машины хотят в ЕЁ осях. */
export interface RotorcraftDemand {
  /** Продольное ускорение, м/с²: плюс — вперёд по носу. */
  readonly forward: number;
  /** Боковое ускорение, м/с²: плюс — на правый борт. */
  readonly lateral: number;
  /** Вертикальная составляющая сверх веса, доля веса. */
  readonly collective: number;
  /**
   * Желаемая угловая скорость рыскания, рад/с: плюс — нос вправо.
   *
   * Именно СКОРОСТЬ, а не момент. У дрона есть лицевая сторона, поэтому
   * автопилот держит курс, а не угол: внешний контур переводит «куда смотреть»
   * в «с какой скоростью доворачивать», а этот — в перекос реактивных моментов.
   */
  readonly yaw: number;
}

/** Углы, которые из этого следуют. Их и отрабатывает контур угловой скорости. */
export interface RotorcraftAttitudeTarget {
  /** Тангаж, рад: ПЛЮС — нос вниз, потому что вперёд машина едет клюнув. */
  readonly pitch: number;
  /** Крен, рад: плюс — правый борт вниз. */
  readonly roll: number;
}

/**
 * Внешний контур: желаемое ускорение → желаемый наклон.
 *
 * `tan θ = a / g` — прямо из разложения наклонённого вектора подъёма. Предел
 * наклона и есть предел манёвра: больше `g·tan(θmax)` машина не выжмет, сколько
 * бы оборотов у неё ни было.
 */
export function rotorcraftAttitudeTarget(
  demand: Pick<RotorcraftDemand, "forward" | "lateral">,
  maximumTilt: number,
  gravity = 9.81,
): RotorcraftAttitudeTarget {
  const limit = Math.tan(maximumTilt);
  const clamp = (value: number): number =>
    Math.max(-limit, Math.min(limit, value / gravity));
  return {
    pitch: Math.atan(clamp(demand.forward)),
    roll: Math.atan(clamp(demand.lateral)),
  };
}

/**
 * Доступное горизонтальное ускорение машины. Не паспортная выдумка, а прямое
 * следствие предельного наклона — и его же надо показывать в телеметрии.
 */
export function rotorcraftMaximumAcceleration(
  maximumTilt: number,
  gravity = 9.81,
): number {
  return gravity * Math.tan(maximumTilt);
}

/**
 * Внешний контур курса: «куда смотреть» → «с какой скоростью доворачивать».
 *
 * Оба вектора — горизонтальные, в мировых осях. Ошибка берётся знаковой через
 * правый борт, поэтому доворот всегда идёт короткой стороной, а не наматывает
 * лишний круг на переходе через ±180°.
 */
export function rotorcraftHeadingRate(
  wanted: readonly [number, number, number],
  actual: readonly [number, number, number],
  maximumRate: number,
  gain = 1.8,
): number {
  const wantedLength = Math.hypot(wanted[0], wanted[2]);
  const actualLength = Math.hypot(actual[0], actual[2]);
  if (wantedLength < 1e-6 || actualLength < 1e-6) return 0;
  const fx = actual[0] / actualLength;
  const fz = actual[2] / actualLength;
  const wx = wanted[0] / wantedLength;
  const wz = wanted[2] / wantedLength;
  // Правый борт от носа (fx, fz) — это (fz, −fx): та же формула, что в микшере.
  const error = Math.atan2(wx * fz - wz * fx, wx * fx + wz * fz);
  return Math.max(-maximumRate, Math.min(maximumRate, error * gain));
}

export interface RotorMixInput {
  /** Точки винтов в авторских координатах, в порядке каналов тяги. */
  readonly points: readonly SceneVector3[];
  /** Центр масс: плечи считаются от него, а не от геометрического центра. */
  readonly centreOfMass: SceneVector3;
  /** Единичный вектор носа в тех же координатах. */
  readonly nose: SceneVector3;
  /** Доля тяги, которую каждый винт ещё может дать: 0…1. */
  readonly availability: readonly number[];
  /** Суммарная тяга, которую дают ВСЕ исправные винты, в единицах силы. */
  readonly capacity: number;
}

export interface RotorMixDemand {
  /** Доля суммарной тяги: 1 — вся располагаемая. Висение — заметно меньше. */
  readonly collective: number;
  /** Момент по тангажу, Н·м: плюс — нос вниз. */
  readonly pitchMoment: number;
  /** Момент по крену, Н·м: плюс — правый борт вниз. */
  readonly rollMoment: number;
  /** Момент рыскания, Н·м: плюс — нос вправо. */
  readonly yawMoment?: number;
}

/**
 * МИКШЕР. Переводит «общая тяга плюс три момента» в тягу каждого винта.
 *
 * Работает для любого числа винтов и любой их раскладки: плечи берутся из
 * настоящих точек, а не из предположения о симметрии.
 *
 * Момент доступен ВСЕГДА, в том числе на полном газе: если прибавить одной
 * стороне нельзя, его создаёт убавление противоположной. Поэтому зажимается
 * только сам винт — ни тянуть вниз, ни превысить свой предел он не умеет, — а
 * общий газ не трогается. Ужимать газ ради момента нельзя: на манёвре это
 * отнимает подъём ровно тогда, когда он нужен, и получается разгон ошибки
 * вместо её отработки. Цена насыщения — недобор момента и недобор тяги, и оба
 * возвращаются наверх, чтобы автоматика знала, чего не получила.
 *
 * Рыскание у мультиротора — реактивный момент винтов: одна пара ускоряется,
 * встречная замедляется, и суммарная тяга не меняется. Поэтому оно тоже
 * тратит запас оборотов и честно конкурирует с креном и тангажом.
 */
export function mixRotorThrust(
  input: RotorMixInput,
  demand: RotorMixDemand,
): {
  readonly thrust: readonly number[];
  readonly deliveredPitchMoment: number;
  readonly deliveredRollMoment: number;
  readonly deliveredYawMoment: number;
  readonly deliveredThrust: number;
} {
  const count = input.points.length;
  const noseLength = Math.hypot(input.nose[0], input.nose[2]) || 1;
  const forward: readonly [number, number] = [
    input.nose[0] / noseLength,
    input.nose[2] / noseLength,
  ];
  // Правый борт = up × forward в правой системе координат. Знак здесь стоит
  // разноса: с перевёрнутым бортом контур угла становится положительной
  // обратной связью, и машина раскручивается за полторы секунды.
  const starboard: readonly [number, number] = [forward[1], -forward[0]];
  // Плечи каждого винта: продольное создаёт тангаж, поперечное — крен.
  const arms = input.points.map((point) => {
    const dx = point[0] - input.centreOfMass[0];
    const dz = point[2] - input.centreOfMass[2];
    return {
      longitudinal: dx * forward[0] + dz * forward[1],
      lateral: dx * starboard[0] + dz * starboard[1],
    };
  });
  const share = count > 0 ? input.capacity / count : 0;
  const perRotorLimit = input.availability.map(
    (fraction) => share * Math.max(0, Math.min(1, fraction)),
  );
  const commonThrust = (input.capacity * demand.collective) / Math.max(1, count);

  const denominatorPitch = arms.reduce(
    (sum, arm) => sum + arm.longitudinal * arm.longitudinal,
    0,
  );
  const denominatorRoll = arms.reduce(
    (sum, arm) => sum + arm.lateral * arm.lateral,
    0,
  );
  // Направление вращения чередуется по кругу, как у всякого мультиротора:
  // соседние винты крутятся навстречу, и сумма их реактивных моментов у целой
  // машины равна нулю. Рыскание — это перекос ЭТОЙ суммы.
  const spin = input.points.map((_, index) => (index % 2 === 0 ? 1 : -1));
  const yawMoment = demand.yawMoment ?? 0;
  const yawShare = count > 0 ? yawMoment / count : 0;

  // ПОРЯДОК ПРИОРИТЕТА: газ, потом крен с тангажом, и только потом рыскание.
  //
  // Реактивный канал в двенадцать раз слабее моментного, поэтому просьба
  // довернуть на полтора радиана в секунду стоит больше тяги, чем есть у всей
  // машины. Пока рыскание зажималось наравне со всеми, оно забирало запас
  // оборотов целиком: половина винтов упиралась в потолок, половина в ноль, и
  // машина теряла не курс, а позу — за секунду уходила в пятьдесят градусов
  // тангажа. Поэтому рыскание получает РОВНО ТО, что осталось после позы, и
  // честно сообщает наверх, сколько это оказалось.
  const attitude = arms.map((arm, index) => {
    const pitchPart =
      denominatorPitch > 1e-9
        ? (-demand.pitchMoment * arm.longitudinal) / denominatorPitch
        : 0;
    const rollPart =
      denominatorRoll > 1e-9
        ? (-demand.rollMoment * arm.lateral) / denominatorRoll
        : 0;
    return Math.max(
      0,
      Math.min(perRotorLimit[index] ?? 0, commonThrust + pitchPart + rollPart),
    );
  });
  const yawScale = attitude.reduce((scale, base, index) => {
    const wanted = spin[index] * yawShare * YAW_TORQUE_PER_THRUST_INVERSE;
    if (Math.abs(wanted) < 1e-9) return scale;
    const room = wanted > 0 ? (perRotorLimit[index] ?? 0) - base : base;
    return Math.min(scale, Math.max(0, room / Math.abs(wanted)));
  }, 1);

  const thrust = attitude.map((base, index) => {
    // Реактивный момент пропорционален тяге винта, поэтому «прибавить одной
    // паре и убавить встречной» и есть команда рыскания.
    const yawPart =
      spin[index] * yawShare * YAW_TORQUE_PER_THRUST_INVERSE * yawScale;
    return Math.max(0, Math.min(perRotorLimit[index] ?? 0, base + yawPart));
  });
  return {
    thrust,
    deliveredPitchMoment: thrust.reduce(
      (sum, value, index) => sum - value * arms[index].longitudinal,
      0,
    ),
    deliveredRollMoment: thrust.reduce(
      (sum, value, index) => sum - value * arms[index].lateral,
      0,
    ),
    deliveredYawMoment: thrust.reduce(
      (sum, value, index) =>
        sum + (value * spin[index]) / YAW_TORQUE_PER_THRUST_INVERSE,
      0,
    ),
    deliveredThrust: thrust.reduce((sum, value) => sum + value, 0),
  };
}

/**
 * Во сколько раз реактивный момент винта меньше его тяги. У настоящих
 * мультироторов рыскание — самый слабый канал именно поэтому: момент берётся
 * не плечом, а сопротивлением лопасти, и его на порядок меньше.
 */
const YAW_TORQUE_PER_THRUST_INVERSE = 12;

/**
 * Потолок общего газа. Пятнадцать процентов оборотов оставлены на моменты по
 * крену, тангажу и рысканию — без этого запаса машина теряет угол там, где он
 * нужнее всего. Настоящие мультироторы висят около 50–60% и по той же причине.
 */
const ROTOR_COLLECTIVE_CEILING = 0.85;

/**
 * Жёсткость контура угловой скорости рыскания. Канал слабый — момент берётся
 * сопротивлением лопасти, — поэтому просить у него резкости бессмысленно: он
 * всё равно упрётся в запас оборотов и отдаст меньше запрошенного.
 */
const YAW_RATE_GAIN = 2.4;


// ---------------------------------------------------------------------------
// ВНЕШНИЙ КОНТУР И САМОНАСТРОЙКА ПОД РАЗВЕСОВКУ
//
// Живое наблюдение, из которого это выросло: дрон на полном ходу идёт носом
// вниз под 20–30°, а на команду «назад» ВСТАЁТ НА ДЫБЫ — мгновенно
// перебрасывает момент на передние винты, сбрасывает на задних и затем
// стабилизируется по вектору движения. И отдельно: грузик на носу он
// отрабатывает сам — взлёт остаётся горизонтальным, характеристики
// деградируют, управляемость нет.
//
// Из этого следуют ровно две вещи, которых не было:
//
//   1. предел наклона — не стена, а ПОЛИТИКА РЕЖИМА. Торможение с хода честно
//      просит угол больше крейсерского, и запрещать это нельзя;
//   2. установившаяся ошибка угла должна уходить в НОЛЬ. Постоянный перекос
//      развесовки снимается интегралом, а не терпится: иначе машина с грузом
//      на носу всегда висит наклонённой.
// ---------------------------------------------------------------------------

/** Накопленная поправка на развесовку. Живёт между шагами. */
export interface RotorcraftTrimState {
  readonly pitch: number;
  readonly roll: number;
}

export const NEUTRAL_ROTORCRAFT_TRIM: RotorcraftTrimState = {
  pitch: 0,
  roll: 0,
};

/**
 * Внешний контур: ошибка СКОРОСТИ → требуемое ускорение.
 *
 * Именно он даёт «встал на дыбы»: команда назад означает большую
 * отрицательную ошибку скорости, из неё выходит большое отрицательное
 * ускорение, из него — большой угол носом вверх. Машина гасит ход и сама
 * ложится в горизонт, потому что ошибка ушла.
 */
export function rotorcraftVelocityDemand(
  wanted: { readonly forward: number; readonly lateral: number },
  actual: { readonly forward: number; readonly lateral: number },
  maximumAcceleration: number,
  gain = 1.6,
): { readonly forward: number; readonly lateral: number } {
  const clamp = (value: number): number =>
    Math.max(-maximumAcceleration, Math.min(maximumAcceleration, value * gain));
  return {
    forward: clamp(wanted.forward - actual.forward),
    lateral: clamp(wanted.lateral - actual.lateral),
  };
}

/**
 * Интеграл угла: то самое «поставь грузик на нос — и он адаптируется».
 *
 * Копится только при малой угловой скорости и зажат по величине: интегратор,
 * набранный на манёвре, потом выталкивает машину из горизонта, а зажим не даёт
 * ему подменять собой управление.
 */
export function advanceRotorcraftTrim(
  trim: RotorcraftTrimState,
  error: { readonly pitch: number; readonly roll: number },
  rate: { readonly pitch: number; readonly roll: number },
  deltaSeconds: number,
  gain = 0.25,
  limit = 0.12,
): RotorcraftTrimState {
  // Ворота — по УГЛОВОЙ СКОРОСТИ, и только по ней.
  //
  // Интегратор снимает постоянный перекос развесовки: груз лежит криво по обеим
  // осям сразу, и куда именно — машина не знает, она это ВЫЯСНЯЕТ. Поэтому
  // ворота нельзя ставить на величину ошибки: с тяжёлым носом ошибка велика
  // ровно тогда, когда поправку и надо копить, и такие ворота её запирают
  // навсегда. А вот на перекладке машина крутится — там копить нечего, там
  // работает пропорциональный контур. Отсюда одно условие: машина спокойна.
  //
  // Тот же интегратор отвечает и за удар: попадание сбивает позу и раскручивает
  // машину, ворота закрываются, позу возвращает быстрый контур, и лишь когда
  // вращение улеглось — интегратор доучивает новый перекос, если тот остался.
  const SETTLED_RATE = 0.35;
  const settle = (
    current: number,
    errorValue: number,
    rateValue: number,
  ): number => {
    if (Math.abs(rateValue) > SETTLED_RATE) {
      return current;
    }
    return Math.max(
      -limit,
      Math.min(limit, current + errorValue * gain * deltaSeconds),
    );
  };
  return {
    pitch: settle(trim.pitch, error.pitch, rate.pitch),
    roll: settle(trim.roll, error.roll, rate.roll),
  };
}

/**
 * Контур угловой скорости: от требуемого угла к моменту.
 *
 * Это тот самый внутренний контур каскада. Он намеренно отдельный: внешний
 * знает про место и скорость, внутренний — только про угол, и никакой из них
 * не лезет в чужое.
 */
export function rotorcraftAttitudeMoment(
  target: number,
  actual: number,
  rate: number,
  inertia: number,
  stiffness = 6,
  // Слегка передемпфировано: критическое для этой жёсткости — 4.9, и меньшее
  // значение даёт заброс угла за паспортный предел наклона.
  damping = 5.2,
): number {
  return inertia * (stiffness * (target - actual) - damping * rate);
}

// ---------------------------------------------------------------------------
// СИЛЫ ВИНТОКРЫЛОЙ МАШИНЫ — ОДИН ИСТОЧНИК ПРАВДЫ
//
// Ниже — единственное место, где для коптера считаются силы. Его зовёт и
// рантайм, и тест: стенд, собирающий силы по-своему, отвечает на вопрос
// «сходится ли моя модель», а нужен ответ на вопрос «летит ли машина».
// ---------------------------------------------------------------------------

export interface RotorcraftForcePoint {
  readonly force: readonly [number, number, number];
  readonly point: readonly [number, number, number];
}

export interface RotorcraftState {
  /** Кватернион позы: [x, y, z, w]. */
  readonly orientation: readonly [number, number, number, number];
  /** Мировой центр масс. */
  readonly centre: readonly [number, number, number];
  readonly velocity: readonly [number, number, number];
  readonly angularVelocity: readonly [number, number, number];
}

export interface RotorcraftMachine {
  /** Точки винтов в авторских координатах. */
  readonly points: readonly SceneVector3[];
  /** Авторский центр масс — начало плеч. */
  readonly centreOfMass: SceneVector3;
  readonly nose: SceneVector3;
  readonly mass: number;
  /** Моменты инерции по тангажу, рысканию и крену. */
  readonly inertia: readonly [number, number, number];
  /** Доля тяги каждого винта: 0…1. */
  readonly availability: readonly number[];
  /** Суммарная тяга ВСЕХ исправных винтов. */
  readonly liftCapacity: number;
  /** Предельный наклон, рад: он и есть предел горизонтального манёвра. */
  readonly maximumTilt: number;
}

export interface RotorcraftResult {
  readonly forces: readonly RotorcraftForcePoint[];
  readonly targetPitch: number;
  readonly targetRoll: number;
  readonly pitchError: number;
  readonly rollError: number;
  readonly pitchRate: number;
  readonly rollRate: number;
  readonly yawRate: number;
  readonly pitch: number;
  readonly roll: number;
  readonly collective: number;
  readonly thrust: readonly number[];
}

function rotateByQuaternion(
  quaternion: readonly [number, number, number, number],
  vector: readonly [number, number, number],
): [number, number, number] {
  const [x, y, z, w] = quaternion;
  const tx = 2 * (y * vector[2] - z * vector[1]);
  const ty = 2 * (z * vector[0] - x * vector[2]);
  const tz = 2 * (x * vector[1] - y * vector[0]);
  return [
    vector[0] + w * tx + (y * tz - z * ty),
    vector[1] + w * ty + (z * tx - x * tz),
    vector[2] + w * tz + (x * ty - y * tx),
  ];
}

const dot = (
  left: readonly number[],
  right: readonly number[],
): number => left[0] * right[0] + left[1] * right[1] + left[2] * right[2];

/**
 * Силы коптера за один шаг.
 *
 * Порядок ровно каскадный: желаемое ускорение → УГОЛ → момент → микшер →
 * тяга каждого винта → сила ВДОЛЬ ОСИ КОРПУСА в его точке. Горизонт получается
 * сам собой из наклона, потому что подъём наклоняется вместе с машиной.
 *
 * Рыскание не участвует в этой цепочке вовсе: у настоящего коптера его создаёт
 * реактивный момент встречных пар винтов, то есть чистая пара без продольной
 * силы. Здесь она и выдаётся парой.
 */
/**
 * СОСТОЯНИЕ РАБОТЫ. Функция уже даёт правильное висение (держит высоту, позу и
 * газ 0.74 от располагаемой тяги) и правильный ход от наклона: команда
 * «вперёд 2 м/с²» кладёт машину носом вниз и она едет. Микшер, приоритет угла
 * над газом и предел `g·tan θ` проверены отдельными тестами.
 *
 * НЕ ГОТОВО и потому в рантайм пока не подключено:
 *   - установившийся угол на разгоне выходит за паспортный предел наклона.
 *     Часть этого честна — чтобы держать заданное ускорение против растущего
 *     сопротивления, машине И НАДО класть нос сильнее, — но не вся: остаётся
 *     около восьми градусов, которым объяснения пока нет;
 *   - внешнего контура по скорости и месту у модели ещё нет вовсе, поэтому
 *     проверять её можно только постоянным заданием на ускорение.
 *
 * Пока это не вылечено, машина летает на прежней модели: она рабочая.
 */
export function rotorcraftForces(
  machine: RotorcraftMachine,
  state: RotorcraftState,
  demand: RotorcraftDemand,
  trim: RotorcraftTrimState = NEUTRAL_ROTORCRAFT_TRIM,
  gravity = 9.81,
): RotorcraftResult {
  const up = rotateByQuaternion(state.orientation, [0, 1, 0]);
  const noseLength = Math.hypot(machine.nose[0], machine.nose[2]) || 1;
  const noseFlat: SceneVector3 = [
    machine.nose[0] / noseLength,
    0,
    machine.nose[2] / noseLength,
  ];
  const forwardWorld = rotateByQuaternion(state.orientation, noseFlat);
  const starboardLocal: SceneVector3 = [noseFlat[2], 0, -noseFlat[0]];
  const starboardWorld = rotateByQuaternion(state.orientation, starboardLocal);

  // Фактические углы. «Плюс» здесь означает НОС ВНИЗ и ПРАВЫЙ БОРТ ВНИЗ —
  // те же знаки, в которых считает микшер, чтобы их негде было перепутать.
  const pitchDown = -Math.asin(Math.max(-1, Math.min(1, forwardWorld[1])));
  const rollStarboardDown = -Math.asin(
    Math.max(-1, Math.min(1, starboardWorld[1])),
  );
  const pitchRate = dot(state.angularVelocity, starboardWorld);
  // Знак: положительное вращение вокруг ОСИ НОСА поднимает правый борт, а не
  // опускает. Угол мы меряем как «правый борт вниз», поэтому скорость надо
  // взять с обратным знаком — иначе демпфер контура работает как разгон, и
  // машина заваливается в крен за пару секунд, идеально держа тангаж.
  const rollRate = -dot(state.angularVelocity, forwardWorld);
  // Рыскание меряется вокруг ОСИ КОРПУСА, а не мировой вертикали: на наклонённой
  // машине это разные оси, и перепутать их — значит держать курс тем сильнее
  // мимо, чем резче манёвр.
  const yawRate = dot(state.angularVelocity, up);
  // Контур угловой скорости рыскания. Внутрь идёт скорость, а не угол: курс
  // держит внешний контур, здесь только его отработка.
  const yawMoment = machine.inertia[1] * YAW_RATE_GAIN * (demand.yaw - yawRate);

  const wanted = rotorcraftAttitudeTarget(demand, machine.maximumTilt, gravity);
  // Поправка на развесовку прибавляется к ЗАДАНИЮ: машина с грузом на носу
  // висит горизонтально, просто её винты держат разную тягу.
  const target = {
    pitch: wanted.pitch + trim.pitch,
    roll: wanted.roll + trim.roll,
  };
  const pitchMoment = rotorcraftAttitudeMoment(
    target.pitch,
    pitchDown,
    pitchRate,
    machine.inertia[2],
  );
  const rollMoment = rotorcraftAttitudeMoment(
    target.roll,
    rollStarboardDown,
    rollRate,
    machine.inertia[0],
  );

  // Общий газ держит ВЕС, а не «долю мощности»: наклон забирает вертикаль,
  // поэтому на манёвре его приходится добирать. Отсюда и связанность, которой
  // у плавучей машины нет вовсе.
  const tiltCosine = Math.max(0.35, up[1]);
  const wantedThrust =
    (machine.mass * gravity * (1 + demand.collective)) / tiltCosine;
  // ЗАПАС ОБОРОТОВ — ЭТО ЗАПАС УПРАВЛЯЕМОСТИ, и держать его должна автоматика,
  // а не микшер. Двигатели не выходят на сто процентов никогда: доля отсечки
  // оставляет место под моменты по всем трём осям. Ужимать вместо этого газ
  // ПОСЛЕ насыщения — значит отнимать подъём ровно на манёвре и разгонять
  // собственную ошибку.
  const collective =
    machine.liftCapacity > 1e-6
      ? Math.max(
          0,
          Math.min(
            ROTOR_COLLECTIVE_CEILING,
            wantedThrust / machine.liftCapacity,
          ),
        )
      : 0;

  const mix = mixRotorThrust(
    {
      points: machine.points,
      centreOfMass: machine.centreOfMass,
      nose: machine.nose,
      availability: machine.availability,
      capacity: machine.liftCapacity,
    },
    {
      collective,
      pitchMoment,
      rollMoment,
      // Рыскание тратит тот же запас оборотов, что крен и тангаж: у коптера
      // это не отдельный орган, а перекос реактивных моментов винтов.
      yawMoment,
    },
  );

  const place = (point: SceneVector3): [number, number, number] => {
    const arm = rotateByQuaternion(state.orientation, [
      point[0] - machine.centreOfMass[0],
      point[1] - machine.centreOfMass[1],
      point[2] - machine.centreOfMass[2],
    ]);
    return [
      state.centre[0] + arm[0],
      state.centre[1] + arm[1],
      state.centre[2] + arm[2],
    ];
  };

  const forces: RotorcraftForcePoint[] = mix.thrust.map((value, index) => ({
    force: [up[0] * value, up[1] * value, up[2] * value] as const,
    point: place(machine.points[index]),
  }));

  // РЕАКТИВНЫЙ МОМЕНТ — ЧИСТАЯ ПАРА, и её надо приложить.
  //
  // Тяга винта направлена вдоль оси корпуса, поэтому её плечо вокруг ЭТОЙ ЖЕ
  // оси равно нулю: сколько винты ни перекашивай, силами тяги рыскание не
  // родится. Оно рождается сопротивлением лопастей, которое возвращает микшер.
  // Пока эта пара не прикладывалась, машина не имела органа рыскания вовсе — и
  // на резкой перекладке её разворачивало гироскопической связью осей, а
  // держать курс было нечем: за секунду сто двадцать градусов и срыв.
  //
  // Пара выдаётся двумя встречными силами в плоскости корпуса: сумма сил ноль,
  // момент вокруг оси корпуса — доставленный. Плечо взято по разносу винтов,
  // чтобы силы были того же порядка, что тяга, а не числовым мусором.
  const yawArm = Math.max(
    0.5,
    machine.points.reduce(
      (sum, point) =>
        sum +
        Math.hypot(
          point[0] - machine.centreOfMass[0],
          point[2] - machine.centreOfMass[2],
        ),
      0,
    ) / Math.max(1, machine.points.length),
  );
  const yawForce = mix.deliveredYawMoment / (2 * yawArm);
  if (Math.abs(yawForce) > 1e-9) {
    const offset = (sign: number): [number, number, number] => [
      state.centre[0] + starboardWorld[0] * yawArm * sign,
      state.centre[1] + starboardWorld[1] * yawArm * sign,
      state.centre[2] + starboardWorld[2] * yawArm * sign,
    ];
    // Знак: у правой тройки forward × starboard = up, поэтому «нос вправо» —
    // это тяга ВПЕРЁД на левом борту и НАЗАД на правом.
    forces.push(
      {
        force: [
          -forwardWorld[0] * yawForce,
          -forwardWorld[1] * yawForce,
          -forwardWorld[2] * yawForce,
        ] as const,
        point: offset(1),
      },
      {
        force: [
          forwardWorld[0] * yawForce,
          forwardWorld[1] * yawForce,
          forwardWorld[2] * yawForce,
        ] as const,
        point: offset(-1),
      },
    );
  }

  return {
    forces,
    yawRate,
    targetPitch: wanted.pitch,
    targetRoll: wanted.roll,
    pitchError: target.pitch - pitchDown,
    rollError: target.roll - rollStarboardDown,
    pitchRate,
    rollRate,
    pitch: pitchDown,
    roll: rollStarboardDown,
    collective,
    thrust: mix.thrust,
  };
}
