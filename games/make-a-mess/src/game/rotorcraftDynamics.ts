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
  // Предел один — угол ОБЩЕГО вектора тяги, а не два независимых угла. При
  // старом покоординатном clamp машина могла одновременно попросить 30°
  // тангажа и 30° крена: настоящий наклон получался около 41°, вертикальный
  // запас исчезал именно на диагональном манёвре.
  const maximumAcceleration = rotorcraftMaximumAcceleration(maximumTilt, gravity);
  const requestedAcceleration = Math.hypot(demand.forward, demand.lateral);
  const scale =
    requestedAcceleration > maximumAcceleration && requestedAcceleration > 1e-9
      ? maximumAcceleration / requestedAcceleration
      : 1;
  const forward = demand.forward * scale;
  const lateral = demand.lateral * scale;
  const acceleration = Math.hypot(forward, lateral);
  // Компоненты целевого unit-up. Для чистого тангажа формула сводится к
  // atan(a/g); для диагонали сумма квадратов синусов даёт ровно общий θ.
  const length = Math.hypot(gravity, acceleration) || 1;
  return {
    pitch: Math.asin(Math.max(-1, Math.min(1, forward / length))),
    roll: Math.asin(Math.max(-1, Math.min(1, lateral / length))),
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
 * Продольное ускорение, которое машина берёт ПРЯМОЙ тягой тоннелей, без наклона.
 *
 * У обычного мультиротора это ноль, и весь его манёвр равен `g·tg(θmax)`. У
 * машины с синфазной парой к нему прибавляется вот это — и прибавляется даром,
 * потому что вертикаль остаётся нетронутой.
 */
export function rotorcraftSurgeAcceleration(
  machine: Pick<
    RotorcraftMachine,
    "yawThrusters" | "yawThrusterAvailability" | "nose" | "centreOfMass" | "mass"
  >,
): number {
  const thrusters = machine.yawThrusters ?? [];
  if (thrusters.length === 0 || machine.mass <= 1e-6) {
    return 0;
  }
  return (
    yawThrusterAllocation(
      thrusters,
      machine.centreOfMass,
      0,
      machine.yawThrusterAvailability,
      { force: 0, nose: machine.nose },
    ).maximumSurgeForce / machine.mass
  );
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
  // Знак тот же, что у общего автопилота: положительный темп поворачивает
  // фактический нос к требуемому в положительном направлении рыскания. Раньше
  // эта вспомогательная функция была зеркальной, а адаптер компенсировал её
  // ещё одним минусом — стенд держал курс, но настоящий автопилот поворачивал
  // аппарат от маршрута.
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
  /**
   * Relative passport capacity of each rotor. Omitted means equal motors.
   * Values are normalised internally, so their sum still equals `capacity`.
   */
  readonly capacityWeights?: readonly number[];
  /** Reaction-torque sign of each rotor. Omitted keeps legacy alternation. */
  readonly spinDirections?: readonly (-1 | 1)[];
  /**
   * Known thrust that is still present but can no longer be commanded.
   * A severed motor does not stop in one frame; living rotors must cancel its
   * decaying force instead of allocating as though it had already vanished.
   */
  readonly biasThrust?: readonly number[];
}

export function rotorCapacityByPoint(
  capacity: number,
  count: number,
  weights?: readonly number[],
): readonly number[] {
  if (count <= 0 || capacity <= 0) return [];
  const safe = Array.from({ length: count }, (_, index) =>
    Math.max(0, weights?.[index] ?? 1),
  );
  const total = safe.reduce((sum, value) => sum + value, 0);
  if (total <= 1e-9) return safe.map(() => 0);
  return safe.map((weight) => capacity * weight / total);
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
/** Решение системы три на три методом Крамера: матрица симметричная и малая. */
function solveThreeByThree(
  matrix: readonly (readonly number[])[],
  right: readonly number[],
): [number, number, number] {
  const determinant = (m: readonly (readonly number[])[]): number =>
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const base = determinant(matrix);
  if (Math.abs(base) < 1e-12) return [0, 0, 0];
  const replaced = (column: number): number[][] =>
    matrix.map((row, index) =>
      row.map((value, position) => (position === column ? right[index] : value)),
    );
  return [
    determinant(replaced(0)) / base,
    determinant(replaced(1)) / base,
    determinant(replaced(2)) / base,
  ];
}

function solveExactThreeByThree(
  matrix: readonly (readonly number[])[],
  right: readonly number[],
): [number, number, number] | null {
  const determinant = (m: readonly (readonly number[])[]): number =>
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const base = determinant(matrix);
  if (Math.abs(base) < 1e-10) return null;
  const replaced = (column: number): number[][] =>
    matrix.map((row, index) =>
      row.map((value, position) => (position === column ? right[index] : value)),
    );
  return [
    determinant(replaced(0)) / base,
    determinant(replaced(1)) / base,
    determinant(replaced(2)) / base,
  ];
}

export function mixRotorThrust(
  input: RotorMixInput,
  demand: RotorMixDemand,
): {
  readonly thrust: readonly number[];
  readonly deliveredPitchMoment: number;
  readonly deliveredRollMoment: number;
  readonly deliveredYawMoment: number;
  readonly deliveredThrust: number;
  readonly minimumYawMoment: number;
  readonly maximumYawMoment: number;
  /** Exact thrust, pitch and roll demand lies inside the bounded rotor set. */
  readonly attitudeFeasible: boolean;
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
  const capacityByPoint = rotorCapacityByPoint(
    input.capacity,
    count,
    input.capacityWeights,
  );
  const perRotorLimit = input.availability.map(
    (fraction, index) =>
      (capacityByPoint[index] ?? 0) * Math.max(0, Math.min(1, fraction)),
  );
  // Направление вращения чередуется по кругу, как у всякого мультиротора:
  // соседние винты крутятся навстречу, и сумма их реактивных моментов у целой
  // машины равна нулю. Рыскание — это перекос ЭТОЙ суммы.
  const spin = input.points.map(
    (_, index) => input.spinDirections?.[index] ?? (index % 2 === 0 ? 1 : -1),
  );
  const yawMoment = demand.yawMoment ?? 0;
  const biasThrust = input.points.map((_, index) =>
    Math.max(0, input.biasThrust?.[index] ?? 0),
  );
  const biasWrench = {
    thrust: biasThrust.reduce((sum, value) => sum + value, 0),
    pitch: biasThrust.reduce(
      (sum, value, index) => sum - value * arms[index].longitudinal,
      0,
    ),
    roll: biasThrust.reduce(
      (sum, value, index) => sum - value * arms[index].lateral,
      0,
    ),
    yaw: biasThrust.reduce(
      (sum, value, index) =>
        sum + (value * spin[index]) / YAW_TORQUE_PER_THRUST_INVERSE,
      0,
    ),
  };

  // ПОРЯДОК ПРИОРИТЕТА: газ, потом крен с тангажом, и только потом рыскание.
  //
  // Реактивный канал в двенадцать раз слабее моментного, поэтому просьба
  // довернуть на полтора радиана в секунду стоит больше тяги, чем есть у всей
  // машины. Пока рыскание зажималось наравне со всеми, оно забирало запас
  // оборотов целиком: половина винтов упиралась в потолок, половина в ноль, и
  // машина теряла не курс, а позу — за секунду уходила в пятьдесят градусов
  // тангажа. Поэтому рыскание получает РОВНО ТО, что осталось после позы, и
  // честно сообщает наверх, сколько это оказалось.
  // РАСПРЕДЕЛЕНИЕ. Тяга и оба момента считаются ОДНОЙ системой, а не по
  // очереди, и это принципиально.
  //
  // У целой машины сумма плеч равна нулю, поэтому «раздать поровну, потом
  // растащить моментами» работает: добавка газа моментов не создаёт, а моменты
  // не меняют суммарной тяги. У машины с выбитым кольцом ни то, ни другое уже
  // не верно — и раздельный счёт начинает врать молча. Замер показал ровно
  // это: тяга держалась заказанной, машина висела, а доставленный момент
  // отличался от запрошенного в СТО раз, и автоматика догоняла позу
  // случайными остатками вместо того, чтобы её держать.
  //
  // Решается это в лоб: три требования — суммарная тяга, момент по тангажу,
  // момент по крену — и раскладка тяги, которая удовлетворяет всем трём сразу
  // и при этом самая мягкая из возможных (минимум суммы квадратов). Это
  // обычная псевдообратная задача; матрица три на три, обращается формулой.
  // Для целой симметричной машины ответ в точности совпадает с прежним.
  const live: number[] = perRotorLimit.map((limit) => (limit > 1e-9 ? 1 : 0));
  const liveCount = live.reduce((sum, value) => sum + value, 0);
  const sumA = arms.reduce((sum, arm, index) => sum + live[index] * arm.longitudinal, 0);
  const sumB = arms.reduce((sum, arm, index) => sum + live[index] * arm.lateral, 0);
  const sumAA = arms.reduce(
    (sum, arm, index) => sum + live[index] * arm.longitudinal * arm.longitudinal,
    0,
  );
  const sumBB = arms.reduce(
    (sum, arm, index) => sum + live[index] * arm.lateral * arm.lateral,
    0,
  );
  const sumAB = arms.reduce(
    (sum, arm, index) => sum + live[index] * arm.longitudinal * arm.lateral,
    0,
  );
  // Строки: суммарная тяга, тангаж, крен. Момент тангажа равен −Σ T·a, крен
  // равен −Σ T·b — знаки те же, что в доставленных значениях ниже.
  const gram = [
    [liveCount, -sumA, -sumB],
    [-sumA, sumAA, sumAB],
    [-sumB, sumAB, sumBB],
  ];
  // Малая добавка к диагонали: она делает систему разрешимой и в вырожденных
  // раскладках, где моментов такой геометрией просто не создать.
  const ridge = Math.max(1e-9, (liveCount + sumAA + sumBB) * 1e-9);
  for (let index = 0; index < 3; index += 1) gram[index][index] += ridge;
  const want = [
    input.capacity * demand.collective - biasWrench.thrust,
    demand.pitchMoment - biasWrench.pitch,
    demand.rollMoment - biasWrench.roll,
  ];
  const multipliers = solveThreeByThree(gram, want);
  const attitude = arms.map((arm, index) => {
    if (!live[index]) return 0;
    const value =
      multipliers[0] -
      multipliers[1] * arm.longitudinal -
      multipliers[2] * arm.lateral;
    return Math.max(0, Math.min(perRotorLimit[index], value));
  });

  // Joint bounded allocation. With thrust, pitch and roll fixed, every
  // feasible rotor distribution forms a convex polytope. Yaw is linear on
  // it, so its minimum and maximum lie at vertices. A vertex has at most
  // three free rotors (one per equality); all others are at zero or their
  // physical limit. Six rotors mean at most 160 tiny 3×3 solves — exact,
  // deterministic and cheap enough to run every physics step.
  let minimumYaw:
    | { readonly yaw: number; readonly thrust: readonly number[] }
    | null = null;
  let maximumYaw:
    | { readonly yaw: number; readonly thrust: readonly number[] }
    | null = null;
  const coefficient = (row: number, index: number): number =>
    row === 0
      ? 1
      : row === 1
        ? -arms[index].longitudinal
        : -arms[index].lateral;
  const forceTolerance = Math.max(1e-5, input.capacity * 1e-6);
  const armScale = Math.max(
    1,
    ...arms.map((arm) => Math.hypot(arm.longitudinal, arm.lateral)),
  );
  const momentTolerance = forceTolerance * armScale;
  for (let first = 0; first < count; first += 1) {
    for (let second = first + 1; second < count; second += 1) {
      for (let third = second + 1; third < count; third += 1) {
        const free = [first, second, third] as const;
        const fixed = Array.from({ length: count }, (_, index) => index).filter(
          (index) => !free.includes(index as (typeof free)[number]),
        );
        for (let mask = 0; mask < 1 << fixed.length; mask += 1) {
          const candidate = Array.from({ length: count }, () => 0);
          for (let position = 0; position < fixed.length; position += 1) {
            const index = fixed[position];
            candidate[index] =
              mask & (1 << position) ? perRotorLimit[index] ?? 0 : 0;
          }
          const right = want.map(
            (value, row) =>
              value -
              fixed.reduce(
                (sum, index) => sum + coefficient(row, index) * candidate[index],
                0,
              ),
          );
          const solved = solveExactThreeByThree(
            [0, 1, 2].map((row) =>
              free.map((index) => coefficient(row, index)),
            ),
            right,
          );
          if (!solved) continue;
          let inside = true;
          for (let position = 0; position < free.length; position += 1) {
            const index = free[position];
            const value = solved[position];
            const limit = perRotorLimit[index] ?? 0;
            if (value < -forceTolerance || value > limit + forceTolerance) {
              inside = false;
              break;
            }
            candidate[index] = Math.max(0, Math.min(limit, value));
          }
          if (!inside) continue;
          const residuals = [0, 1, 2].map(
            (row) =>
              candidate.reduce(
                (sum, value, index) => sum + coefficient(row, index) * value,
                0,
              ) - want[row],
          );
          if (
            Math.abs(residuals[0]) > forceTolerance ||
            Math.abs(residuals[1]) > momentTolerance ||
            Math.abs(residuals[2]) > momentTolerance
          ) {
            continue;
          }
          const candidateYaw =
            biasWrench.yaw +
            candidate.reduce(
              (sum, value, index) =>
                sum +
                (value * spin[index]) / YAW_TORQUE_PER_THRUST_INVERSE,
              0,
            );
          if (!minimumYaw || candidateYaw < minimumYaw.yaw) {
            minimumYaw = { yaw: candidateYaw, thrust: candidate };
          }
          if (!maximumYaw || candidateYaw > maximumYaw.yaw) {
            maximumYaw = { yaw: candidateYaw, thrust: candidate };
          }
        }
      }
    }
  }

  let thrust = attitude;
  if (minimumYaw && maximumYaw) {
    const acceptedYaw = Math.max(
      minimumYaw.yaw,
      Math.min(maximumYaw.yaw, yawMoment),
    );
    const range = maximumYaw.yaw - minimumYaw.yaw;
    const blend = range > 1e-9 ? (acceptedYaw - minimumYaw.yaw) / range : 0;
    thrust = minimumYaw.thrust.map(
      (value, index) =>
        value * (1 - blend) + (maximumYaw?.thrust[index] ?? value) * blend,
    );
  }
  const deliveredPitchMoment =
    biasWrench.pitch +
    thrust.reduce(
      (sum, value, index) => sum - value * arms[index].longitudinal,
      0,
    );
  const deliveredRollMoment =
    biasWrench.roll +
    thrust.reduce(
      (sum, value, index) => sum - value * arms[index].lateral,
      0,
    );
  const deliveredYawMoment =
    biasWrench.yaw +
    thrust.reduce(
      (sum, value, index) =>
        sum + (value * spin[index]) / YAW_TORQUE_PER_THRUST_INVERSE,
      0,
    );
  const deliveredThrust =
    biasWrench.thrust + thrust.reduce((sum, value) => sum + value, 0);
  return {
    thrust,
    deliveredPitchMoment,
    deliveredRollMoment,
    deliveredYawMoment,
    deliveredThrust,
    // With no exact attitude solution there is no range to advertise. Report
    // the fallback distribution's actual yaw as the only accepted point.
    minimumYawMoment: minimumYaw?.yaw ?? deliveredYawMoment,
    maximumYawMoment: maximumYaw?.yaw ?? deliveredYawMoment,
    attitudeFeasible: minimumYaw !== null && maximumYaw !== null,
  };
}

/**
 * Во сколько раз реактивный момент винта меньше его тяги. У настоящих
 * мультироторов рыскание — самый слабый канал именно поэтому: момент берётся
 * не плечом, а сопротивлением лопасти, и его на порядок меньше.
 */
const YAW_TORQUE_PER_THRUST_INVERSE = 12;

// ---------------------------------------------------------------------------
// ОТДЕЛЬНЫЙ ОРГАН РЫСКАНИЯ
//
// Реактивный момент встречных пар — единственное, что есть у ОБЫЧНОГО
// мультиротора, и он слаб по построению: момент берётся сопротивлением
// лопасти, а не плечом. Машине, от которой требуется резкий разворот вокруг
// оси, этого мало, и настоящий ответ на это — не выкрутить коэффициент, а
// поставить ОТДЕЛЬНЫЙ ДВИЖИТЕЛЬ: реверсивный вентилятор в тоннеле, вынесенный
// от центра масс вбок, который создаёт момент ПЛЕЧОМ.
//
// Из этого следует то, чего у реактивного канала нет вовсе: у такого движителя
// есть настоящая сила в настоящей точке. Пара соосных вентиляторов дала бы
// чистый момент, а пара развёрнутых — момент И боковую силу, и эта сила
// физически неизбежна. Прятать её нельзя: её обязана снимать поза машины,
// ровно как снимается любое другое возмущение.
//
// Канал остаётся ДОПОЛНИТЕЛЬНЫМ. Реактивный момент никуда не девается и по
// умолчанию продолжает нести свою долю: тоннели помогают, а не подменяют.
// Отказ любого из них не выключает рыскание — он только сужает доступный
// диапазон, и автопилот узнаёт об этом обычным путём, через `yawRateLimits`.
// ---------------------------------------------------------------------------

/** Реверсивный движитель рыскания в авторских координатах машины. */
export interface RotorcraftYawThruster {
  /** Точка приложения тяги — ось вентилятора. */
  readonly point: SceneVector3;
  /** Единичная ось тяги. Команда со знаком: реверс — то же сопло назад. */
  readonly axis: SceneVector3;
  /** Тяга при полной команде, Н. */
  readonly maximumForce: number;
}

export interface RotorcraftYawThrusterAllocation {
  /** Команда каждому вентилятору, −1…1 от ЕГО ЖЕ располагаемой тяги. */
  readonly commands: readonly number[];
  /** Сила каждого вентилятора в авторских осях. */
  readonly forces: readonly SceneVector3[];
  /** Сумма сил: у развёрнутой пары она НЕ ноль, и это не ошибка. */
  readonly netForce: SceneVector3;
  readonly yawMoment: number;
  /** Наибольший момент, который эта раскладка ещё способна дать. */
  readonly maximumMoment: number;
  /** Доставленная продольная сила вдоль носа, Н. */
  readonly surgeForce: number;
  /** Наибольшая продольная сила этой раскладки при нулевом рыскании, Н. */
  readonly maximumSurgeForce: number;
}

const EMPTY_YAW_ALLOCATION: RotorcraftYawThrusterAllocation = {
  commands: [],
  forces: [],
  netForce: [0, 0, 0],
  yawMoment: 0,
  maximumMoment: 0,
  surgeForce: 0,
  maximumSurgeForce: 0,
};

/**
 * Раскладка момента по реверсивным вентиляторам с наименьшей затратой тяги.
 *
 * Плечо берётся из авторской точки и оси — `(r × F)y` вокруг ЦЕНТРА МАСС, а не
 * из назначенного множителя: подвинули тоннель — изменилось плечо. Решается
 * связкой Лагранжа с зажимом: у каждого вентилятора свой предел, поэтому доля
 * пропорциональна плечу, пока он в него не упрётся.
 */
export function yawThrusterAllocation(
  thrusters: readonly RotorcraftYawThruster[],
  centreOfMass: SceneVector3,
  requestedYawMoment: number,
  availability?: readonly number[],
  /**
   * Продольное требование и ось носа. Без них раскладка ведёт себя ровно как
   * прежде — только рыскание, — и ни одна машина без второго режима ничего не
   * замечает.
   */
  surge?: { readonly force: number; readonly nose: SceneVector3 },
): RotorcraftYawThrusterAllocation {
  if (thrusters.length === 0) {
    return EMPTY_YAW_ALLOCATION;
  }
  const limits = thrusters.map(
    (thruster, index) =>
      thruster.maximumForce *
      Math.max(0, Math.min(1, availability?.[index] ?? 1)),
  );
  const arms = thrusters.map((thruster) => {
    const rx = thruster.point[0] - centreOfMass[0];
    const rz = thruster.point[2] - centreOfMass[2];
    return rz * thruster.axis[0] - rx * thruster.axis[2];
  });
  const maximumMoment = arms.reduce(
    (sum, arm, index) => sum + Math.abs(arm) * limits[index],
    0,
  );
  const wanted = Math.max(
    -maximumMoment,
    Math.min(maximumMoment, requestedYawMoment),
  );
  let low = -1e6;
  let high = 1e6;
  for (let iteration = 0; iteration < 64; iteration += 1) {
    const lambda = (low + high) / 2;
    const delivered = arms.reduce((sum, arm, index) => {
      const force = Math.max(
        -limits[index],
        Math.min(limits[index], lambda * arm),
      );
      return sum + force * arm;
    }, 0);
    if (delivered < wanted) low = lambda;
    else high = lambda;
  }
  const lambda = (low + high) / 2;
  const yawForces = arms.map((arm, index) =>
    Math.max(-limits[index], Math.min(limits[index], lambda * arm)),
  );

  // СИНФАЗНАЯ ДОБАВКА. Рыскание уже разложено и трогать его нельзя, поэтому
  // тяга добавляется тем, что у каждого вентилятора ОСТАЛОСЬ до упора, и
  // добавляется поровну — иначе она создаст паразитный момент и съест курс.
  const noseLength = surge
    ? Math.hypot(surge.nose[0], surge.nose[1], surge.nose[2]) || 1
    : 1;
  const alongNose = thrusters.map((thruster) =>
    surge
      ? (thruster.axis[0] * surge.nose[0] +
          thruster.axis[1] * surge.nose[1] +
          thruster.axis[2] * surge.nose[2]) /
        noseLength
      : 0,
  );
  // ТЯГА ОБЯЗАНА ЖИТЬ В НУЛЕВОМ ПРОСТРАНСТВЕ РЫСКАНИЯ.
  //
  // Прибавить всем поровну можно только там, где плечи взаимно гасятся —
  // у зеркальной пары. Одиночный уцелевший тоннель, толкая вперёд, ОДНОВРЕМЕННО
  // разворачивает машину, и слабому реактивному каналу приходится это гасить:
  // на замере круг переставал проходиться вовсе. Поэтому синфазная добавка
  // берётся не как «всем поровну», а как та её часть, что не создаёт момента:
  // из единичного вектора вычитается его проекция на вектор плеч. У зеркальной
  // пары остаётся он весь, у одиночного тоннеля — ровно ноль. Курс не страдает
  // никогда, а тяга появляется ровно там, где она физически бесплатна.
  const armSquared = arms.reduce((sum, arm) => sum + arm * arm, 0);
  const uniformYawLeak = arms.reduce((sum, arm) => sum + arm, 0);
  const shape = arms.map((arm) =>
    armSquared > 1e-9 ? 1 - (uniformYawLeak / armSquared) * arm : 1,
  );
  const surgePerUnit = shape.reduce(
    (sum, value, index) => sum + value * alongNose[index],
    0,
  );
  let common = 0;
  if (surge && Math.abs(surgePerUnit) > 1e-9) {
    const wanted = surge.force / surgePerUnit;
    let headroom = Infinity;
    for (let index = 0; index < thrusters.length; index += 1) {
      const step = shape[index];
      if (Math.abs(step) < 1e-9) continue;
      const towards = wanted * step;
      const room =
        towards >= 0
          ? limits[index] - yawForces[index]
          : limits[index] + yawForces[index];
      headroom = Math.min(headroom, Math.max(0, room) / Math.abs(step));
    }
    common = Math.sign(wanted) * Math.min(Math.abs(wanted), headroom);
  }
  const scalarForces = yawForces.map((force, index) =>
    Math.max(
      -limits[index],
      Math.min(limits[index], force + common * shape[index]),
    ),
  );
  // Максимум синфазной тяги: все вентиляторы в упор по этой же форме.
  const maximumSurgeForce = surge
    ? Math.abs(
        surgePerUnit *
          Math.min(
            ...limits.map((limit, index) =>
              Math.abs(shape[index]) > 1e-9
                ? limit / Math.abs(shape[index])
                : Infinity,
            ),
          ),
      )
    : 0;
  const forces = thrusters.map((thruster, index) => [
    thruster.axis[0] * scalarForces[index],
    thruster.axis[1] * scalarForces[index],
    thruster.axis[2] * scalarForces[index],
  ] as SceneVector3);
  return {
    commands: scalarForces.map((force, index) =>
      limits[index] > 1e-9 ? force / limits[index] : 0,
    ),
    forces,
    netForce: forces.reduce<SceneVector3>(
      (sum, force) => [sum[0] + force[0], sum[1] + force[1], sum[2] + force[2]],
      [0, 0, 0],
    ),
    yawMoment: scalarForces.reduce(
      (sum, force, index) => sum + force * arms[index],
      0,
    ),
    maximumMoment,
    surgeForce: scalarForces.reduce(
      (sum, force, index) => sum + force * alongNose[index],
      0,
    ),
    maximumSurgeForce,
  };
}

/**
 * ВТОРОЙ РЕЖИМ ТОЙ ЖЕ ПАРЫ: СИНФАЗНАЯ ТЯГА.
 *
 * Развёрнутые тоннели стоят почти вдоль корпуса, и из этого следует не одно
 * свойство, а два, различающиеся только знаком команды:
 *
 *   дифференциально (один вперёд, другой назад) — плечи складываются,
 *     продольные составляющие гасятся: чистое рыскание;
 *   синфазно (оба вперёд) — плечи гасятся, продольные складываются: чистая
 *     тяга вдоль носа.
 *
 * Второе для винтокрылой машины принципиально. Обычный мультиротор
 * горизонтальной силы без наклона не имеет вовсе, его предел равен
 * `g·tg(θmax)` и ничему другому, а наклон ещё и отнимает вертикаль как `cos θ`.
 * Пара тоннелей даёт продольную силу ПРЯМО, не трогая ни позы, ни высоты, и на
 * этой машине она в разы больше наклонной.
 *
 * Поэтому распределение решается сразу по двум требованиям. Приоритет у
 * рыскания: курс — канал управления, а тяга — канал хода, и оставить машину
 * без курса ради разгона нельзя. Тяга берёт то, что осталось до упора каждого
 * вентилятора.
 */
export interface RotorcraftYawThrusterDemand {
  readonly yawMoment: number;
  /** Требуемая продольная сила вдоль носа, Н. Минус — назад. */
  readonly surgeForce?: number;
}

/**
 * Доля момента рыскания, которую НАМЕРЕННО оставляют реактивному каналу, когда
 * у машины есть отдельные вентиляторы.
 *
 * Ноль означал бы, что тоннели заменили собой обычное управление рысканьем, а
 * они его дополняют. Единица означала бы, что тоннели просто добирают остаток —
 * тогда шесть колец постоянно сидят в насыщении по рысканию и тратят на него
 * запас оборотов, нужный позе. Треть — это работающий обычный канал при
 * сохранённом запасе; остальное берёт орган, созданный ровно для этого.
 */
export const ROTORCRAFT_AUXILIARY_YAW_PRIMARY_SHARE = 0.35;

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
export const ROTORCRAFT_YAW_RATE_GAIN = 2.4;


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

/**
 * Накопленная поправка. Живёт между шагами. Единицы — рад/с², то есть УГЛОВОЕ
 * УСКОРЕНИЕ, а не угол: это ответ на вопрос «какой момент машине приходится
 * держать постоянно, чтобы стоять ровно».
 *
 * Почему момент, а не угол. Поправка углом задаёт цель мимо горизонта и ждёт,
 * что перекос её догонит; она не умеет отличить постоянный перекос от честного
 * манёвренного угла и наматывается на любой ступеньке задания — в замере она
 * набирала шесть градусов на обычном разгоне и держала их потом всю дорогу.
 * Поправка моментом самокорректируется: как только машина встала на заданный
 * угол, ошибка меняет знак и лишнее уходит.
 *
 * И она отвечает сразу на три случая, которые с виду разные, а по сути один —
 * «сколько какому двигателю давать, чтобы машина стояла ровно»:
 *   - криво положенный груз: перекос постоянный, поправка его выучивает;
 *   - выбитый двигатель: оставшиеся дают перекос своей раскладкой, и это тот
 *     же постоянный момент — характеристики падают, управляемость нет;
 *   - палец в зависший дрон: возмущение короткое, ворота по скорости закрыты,
 *     работает быстрый контур, а поправка не портится.
 */
export interface RotorcraftTrimState {
  /** Постоянное угловое ускорение по тангажу, рад/с². */
  readonly pitch: number;
  /** Постоянное угловое ускорение по крену, рад/с². */
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
  const forward = (wanted.forward - actual.forward) * gain;
  const lateral = (wanted.lateral - actual.lateral) * gain;
  const magnitude = Math.hypot(forward, lateral);
  const scale =
    magnitude > maximumAcceleration && magnitude > 1e-9
      ? maximumAcceleration / magnitude
      : 1;
  return {
    forward: forward * scale,
    lateral: lateral * scale,
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
  gain = 0.6,
  // Предел — порядка того, что микшер вообще способен выдать. Копить больше
  // бессмысленно: это была бы просьба к винтам, которую они не выполнят. Но и
  // жать нельзя: выбитому кольцу гексакоптера нужно около четырёх рад/с²
  // постоянного момента, и с пределом ровно в четыре машина не доходит до
  // горизонта, останавливаясь в трёх градусах от него.
  limit = 8,
): RotorcraftTrimState {
  // Ворота — по УГЛОВОЙ СКОРОСТИ, и только по ней. На перекладке машина
  // крутится: там нет постоянного перекоса, там переходный процесс, и копить
  // нечего. Как только вращение улеглось — снова учимся.
  const SETTLED_RATE = 0.35;
  const settle = (
    current: number,
    errorValue: number,
    rateValue: number,
  ): number => {
    if (Math.abs(rateValue) > SETTLED_RATE) return current;
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
  /**
   * Фактические обороты/тяга моторов после актуаторов и их инерции, 0…1 от
   * паспортной тяги одного исправного мотора. Если не заданы, чистый стенд
   * считает, что команда mixer исполнена мгновенно.
   */
  readonly motorOutput?: readonly number[];
  /** Суммарная тяга ВСЕХ исправных винтов. */
  readonly liftCapacity: number;
  /** Relative maximum thrust of each physical rotor. */
  readonly capacityWeights?: readonly number[];
  /** Reaction-torque sign of each physical rotor. */
  readonly spinDirections?: readonly (-1 | 1)[];
  /**
   * Отдельные реверсивные движители рыскания, если они у машины есть. Обычный
   * мультиротор их не имеет, и весь код ниже работает как работал.
   */
  readonly yawThrusters?: readonly RotorcraftYawThruster[];
  /** Доля тяги, которую каждый из них ещё может дать: 0…1. */
  readonly yawThrusterAvailability?: readonly number[];
  /**
   * Фактическая команда вентиляторов после актуаторов и инерции, −1…1. Как и у
   * винтов: если поля нет, чистый стенд исполняет команду мгновенно.
   */
  readonly yawThrusterOutput?: readonly number[];
  /** Предельный наклон, рад: он и есть предел горизонтального манёвра. */
  readonly maximumTilt: number;
}

/**
 * СКОЛЬКО ИЗ ЗАКАЗАННОГО МАШИНА ДЕЙСТВИТЕЛЬНО СДЕЛАЛА. Доля: единица — команда
 * выполнена целиком, ноль — не выполнена вовсе.
 *
 * Это и есть тот единственный признак отказа, которому можно верить. Считать
 * отказ по числу целых лопастей нельзя: бывают раскладки, где живых колец
 * много, а сделать ими нечего — если все они в одной половине круга, машина
 * обязана погасить встречные, чтобы не перевернуться, и любая команда повиснет
 * невыполненной при полностью исправной, с виду, машине. И наоборот: одно
 * выбитое кольцо стоит запаса оборотов, но команды выполняются все.
 */
/**
 * ЧТО ИМЕННО УПЁРЛОСЬ. Недобор без причины — половина ответа.
 *
 * `authority` говорит, какую долю заказанного машина дала. Этого достаточно
 * сторожу, чтобы объявить отказ, но недостаточно тому, кто просит: одна и та же
 * недостача по продольной оси означает совершенно разное, и реагировать на неё
 * надо по-разному.
 *
 *   "effector"  — орган в упоре. Просить меньше бесполезно, надо просить
 *                 ДРУГОЕ: снять часть требования на иной канал или сбавить ход;
 *   "attitude"  — поза уже на разрешённом пределе. Тяга есть, но подставить её
 *                 под нужным углом нельзя, и просить больше — копить ошибку;
 *   "envelope"  — упёрлись не в железо, а в правило: потолок темпа, запас
 *                 оборотов под моменты. Машина МОЖЕТ, но ей не разрешено;
 *   "none"      — заказ выполнен.
 *
 * Разница между первым и вторым и есть та обратная связь, ради которой канал
 * заводится: «не дам» против «не дам, потому что вот это».
 */
export type RotorcraftLimitCause =
  | "none"
  | "effector"
  | "attitude"
  | "envelope";

export interface RotorcraftLimitReport {
  readonly thrust: RotorcraftLimitCause;
  readonly pitch: RotorcraftLimitCause;
  readonly roll: RotorcraftLimitCause;
  readonly yaw: RotorcraftLimitCause;
  /** Продольная тяга отдельных движителей, если они есть. */
  readonly surge: RotorcraftLimitCause;
}

export interface RotorcraftAuthority {
  /** Доля заказанной суммарной тяги. */
  readonly thrust: number;
  /** Доля заказанного момента по тангажу. */
  readonly pitch: number;
  /** По крену. */
  readonly roll: number;
  /** По рысканию. Самый слабый канал, он же первый уходит в недобор. */
  readonly yaw: number;
}

/**
 * Выполняются ли команды. Порог — не «идеально», а «достаточно, чтобы машина
 * шла туда, куда просят»: недобор в четверть момента это ещё вялость, а вот
 * половина — уже потеря управления.
 */
export function rotorcraftCommandsExecute(
  authority: RotorcraftAuthority,
  tolerance = 0.5,
): boolean {
  return (
    authority.thrust >= tolerance &&
    authority.pitch >= tolerance &&
    authority.roll >= tolerance
  );
}

export interface RotorcraftResult {
  readonly forces: readonly RotorcraftForcePoint[];
  readonly authority: RotorcraftAuthority;
  /** Raw attitude asked by the velocity controller before capability limiting. */
  readonly requestedTargetPitch: number;
  readonly requestedTargetRoll: number;
  /** Attitude target accepted by the bounded rotor set. */
  readonly targetPitch: number;
  readonly targetRoll: number;
  /** Share of the requested attitude excursion the machine can accept now. */
  readonly maneuverScale: number;
  readonly pitchError: number;
  readonly rollError: number;
  readonly pitchRate: number;
  readonly rollRate: number;
  readonly yawRate: number;
  /** Yaw-rate demand accepted inside the current bounded rotor wrench. */
  readonly acceptedYawRate: number;
  /** Directional yaw rates reachable without surrendering thrust or attitude. */
  readonly yawRateLimits: {
    readonly minimum: number;
    readonly maximum: number;
  };
  readonly pitch: number;
  readonly roll: number;
  readonly collective: number;
  /** Команда каждому физическому throttle-каналу, 0…1. */
  readonly commandedThrottle: readonly number[];
  /** Фактическая доля паспортной тяги каждого мотора, 0…1. */
  readonly motorOutput: readonly number[];
  readonly thrust: readonly number[];
  /** Что именно ограничило каждый канал на этом шаге. */
  readonly limits: RotorcraftLimitReport;
  /** Знаковая команда каждому вентилятору рыскания, −1…1. Реверс — минус. */
  readonly commandedYawThrusters: readonly number[];
  /** Момент, доставленный ВЕНТИЛЯТОРАМИ, отдельно от реактивного. */
  readonly yawThrusterMoment: number;
  /** Их суммарная сила в мировых осях: её снимает поза, а не отдельный костыль. */
  readonly yawThrusterForce: readonly [number, number, number];
}

/**
 * Инерция одного электрического привода. Сам мотор отвечает за доли секунды:
 * иначе внутренний контур позы физически не может работать. Многосекундная
 * предполётная раскрутка — отдельное плавное открытие мощности до cast-off,
 * которое рантайм накладывает на цель всех шести приводов.
 */
export function advanceRotorMotorOutput(
  current: number,
  target: number,
  deltaSeconds: number,
  spoolSeconds: number,
): number {
  const from = Math.max(0, Math.min(1, current));
  const to = Math.max(0, Math.min(1, target));
  if (deltaSeconds <= 0 || Math.abs(to - from) < 1e-9) return from;
  const responseSeconds =
    to > from
      ? Math.max(0.05, Math.min(0.12, spoolSeconds / 40))
      : Math.max(0.06, Math.min(0.18, spoolSeconds / 30));
  const response = 1 - Math.exp(-deltaSeconds / responseSeconds);
  return from + (to - from) * response;
}

/**
 * Инерция РЕВЕРСИВНОГО привода. Отличий от подъёмного два, и оба физические:
 * команда знаковая, а «разгон» и «сброс» считаются по модулю — вентилятору
 * всё равно, в какую сторону он раскручивается, но проход через ноль он
 * проживает целиком, а не перескакивает.
 */
export function advanceReversibleThrusterOutput(
  current: number,
  target: number,
  deltaSeconds: number,
  spoolSeconds: number,
): number {
  const from = Math.max(-1, Math.min(1, current));
  const to = Math.max(-1, Math.min(1, target));
  if (deltaSeconds <= 0 || Math.abs(to - from) < 1e-9) return from;
  const responseSeconds =
    Math.abs(to) > Math.abs(from)
      ? Math.max(0.05, Math.min(0.12, spoolSeconds / 40))
      : Math.max(0.06, Math.min(0.18, spoolSeconds / 30));
  const response = 1 - Math.exp(-deltaSeconds / responseSeconds);
  return from + (to - from) * response;
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
 * команда каждого винта. Если передано физическое `motorOutput`, силу создаёт
 * именно оно после актуатора и инерции; чистый стенд без этого поля исполняет
 * команду мгновенно. Горизонт получается сам собой из наклона, потому что
 * подъём наклоняется вместе с машиной.
 *
 * Рыскание не участвует в этой цепочке вовсе: у настоящего коптера его создаёт
 * реактивный момент встречных пар винтов, то есть чистая пара без продольной
 * силы. Здесь она и выдаётся парой.
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
  const wantedYawMoment =
    machine.inertia[1] * ROTORCRAFT_YAW_RATE_GAIN * (demand.yaw - yawRate);

  // РАЗДЕЛ МОМЕНТА МЕЖДУ ДВУМЯ ОРГАНАМИ.
  //
  // Вентиляторы спрашиваются ПЕРВЫМИ и берут свою долю, а реактивному каналу
  // остаётся заказанная треть. Порядок именно такой, чтобы микшер решался ОДИН
  // раз за шаг: его собственный диапазон от заказа не зависит, поэтому остаток
  // догоняется вторым — дешёвым — обращением к тоннелям уже после того, как
  // стал известен принятый реактивный момент.
  const yawThrusters = machine.yawThrusters ?? [];
  const preferredAuxiliary = yawThrusterAllocation(
    yawThrusters,
    machine.centreOfMass,
    wantedYawMoment * (1 - ROTORCRAFT_AUXILIARY_YAW_PRIMARY_SHARE),
    machine.yawThrusterAvailability,
  );
  const yawMoment = wantedYawMoment - preferredAuxiliary.yawMoment;

  // ХОД БЕРЁТСЯ ТОННЕЛЯМИ ПРЕЖДЕ, ЧЕМ НАКЛОНОМ.
  //
  // Наклон — единственный способ разогнаться у обычного мультиротора, но он
  // дорогой: забирает вертикаль как `cos θ` и появляется не сразу, потому что
  // сперва машина должна повернуться. Прямая продольная тяга ни того, ни
  // другого не стоит. Поэтому она снимает с наклона столько требования,
  // сколько может, а винтам остаётся только остаток — и машина идёт быстро,
  // оставаясь заметно ровнее.
  const surgeCapacity = yawThrusterAllocation(
    yawThrusters,
    machine.centreOfMass,
    0,
    machine.yawThrusterAvailability,
    { force: 0, nose: machine.nose },
  ).maximumSurgeForce;
  const surgeAcceleration = machine.mass > 1e-6 ? surgeCapacity / machine.mass : 0;
  const fanForward =
    Math.sign(demand.forward) *
    Math.min(Math.abs(demand.forward), surgeAcceleration);
  const tiltDemand = {
    forward: demand.forward - fanForward,
    lateral: demand.lateral,
  };

  const requestedTarget = rotorcraftAttitudeTarget(
    tiltDemand,
    machine.maximumTilt,
    gravity,
  );

  // Общий газ держит ВЕС, а не «долю мощности»: наклон забирает вертикаль,
  // поэтому на манёвре его приходится добирать. Отсюда и связанность, которой
  // у плавучей машины нет вовсе.
  // Газ считается по ФАКТИЧЕСКОМУ наклону, и попытка забежать вперёд провалилась.
  //
  // Рассуждение было верным: в вираже тяга равна весу на косинус крена, и пока
  // тяга догоняет наклон, вертикаль проседает. А вот реализация «взять больший
  // из углов, нынешний или заказанный» означала добавлять газ под наклон,
  // которого ещё нет, — машина всплывала на разгоне на 7.13 м. На маршруте она
  // при этом не дала ничего: промах по высоте остался прежним, 19.8 м.
  //
  // Значит причина просадок не здесь, и лечить её надо там, где она есть, а не
  // компенсацией с обратным знаком.
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

  const capacityByPoint = rotorCapacityByPoint(
    machine.liftCapacity,
    machine.points.length,
    machine.capacityWeights,
  );
  const currentMotorOutput = machine.motorOutput
    ? machine.points.map((_, index) =>
        Math.max(0, Math.min(1, machine.motorOutput?.[index] ?? 0)),
      )
    : null;
  const uncontrollableThrust = machine.points.map((_, index) =>
    (machine.availability[index] ?? 1) <= 1e-6
      ? (currentMotorOutput?.[index] ?? 0) * (capacityByPoint[index] ?? 0)
      : 0,
  );

  const momentsFor = (target: {
    readonly pitch: number;
    readonly roll: number;
  }) => ({
    // Поправка прибавляется к МОМЕНТУ, а не к заданию: машина с криво лежащим
    // грузом висит ГОРИЗОНТАЛЬНО, просто её винты постоянно держат разную тягу.
    pitch:
      rotorcraftAttitudeMoment(
        target.pitch,
        pitchDown,
        pitchRate,
        machine.inertia[2],
      ) + machine.inertia[2] * trim.pitch,
    roll:
      rotorcraftAttitudeMoment(
        target.roll,
        rollStarboardDown,
        rollRate,
        machine.inertia[0],
      ) + machine.inertia[0] * trim.roll,
  });
  const allocate = (target: {
    readonly pitch: number;
    readonly roll: number;
  }) => {
    const moments = momentsFor(target);
    return {
      target,
      moments,
      mix: mixRotorThrust(
        {
          points: machine.points,
          centreOfMass: machine.centreOfMass,
          nose: machine.nose,
          availability: machine.availability,
          capacity: machine.liftCapacity,
          capacityWeights: machine.capacityWeights,
          spinDirections: machine.spinDirections,
          biasThrust: uncontrollableThrust,
        },
        {
          collective,
          pitchMoment: moments.pitch,
          rollMoment: moments.roll,
          // Рыскание тратит тот же запас оборотов, что крен и тангаж: у
          // коптера это не отдельный орган, а реактивный перекос винтов.
          yawMoment,
        },
      ),
    };
  };

  // Ограничитель манёвра не угадывает по номеру выбитого винта, «можно ли
  // теперь лететь вперёд». Он задаёт честный вопрос текущей геометрии: можно
  // ли одновременно держать вес, погасить уже имеющиеся угловые скорости и
  // создать требуемые pitch/roll-моменты при фактических пределах КАЖДОГО
  // мотора. Если нет, ищется ближайшая к просьбе выполнимая поза на отрезке
  // от удержания нынешнего угла до желаемого. Поэтому передний отказ сам
  // отрежет опасный разгон вперёд, но не запретит манёвр, который пять
  // оставшихся винтов действительно могут выполнить.
  let maneuverScale = 1;
  let allocation = allocate(requestedTarget);
  if (!allocation.mix.attitudeFeasible) {
    const holdTarget = {
      pitch: pitchDown,
      roll: rollStarboardDown,
    };
    const holdAllocation = allocate(holdTarget);
    allocation = holdAllocation;
    maneuverScale = 0;
    if (holdAllocation.mix.attitudeFeasible) {
      let feasible = holdAllocation;
      let lower = 0;
      let upper = 1;
      for (let iteration = 0; iteration < 7; iteration += 1) {
        const candidateScale = (lower + upper) / 2;
        const candidate = allocate({
          pitch:
            pitchDown +
            (requestedTarget.pitch - pitchDown) * candidateScale,
          roll:
            rollStarboardDown +
            (requestedTarget.roll - rollStarboardDown) * candidateScale,
        });
        if (candidate.mix.attitudeFeasible) {
          lower = candidateScale;
          feasible = candidate;
        } else {
          upper = candidateScale;
        }
      }
      maneuverScale = lower;
      allocation = feasible;
    }
  }
  const { target, moments, mix } = allocation;
  const pitchMoment = moments.pitch;
  const rollMoment = moments.roll;
  const acceptedYawMoment = Math.max(
    mix.minimumYawMoment,
    Math.min(mix.maximumYawMoment, yawMoment),
  );
  // Что реактивный канал не взял, добирают тоннели — и наоборот: выбитый
  // вентилятор просто возвращает недостачу винтам. Ни одна из сторон не знает
  // о другой ничего, кроме принятого момента.
  const auxiliary = yawThrusterAllocation(
    yawThrusters,
    machine.centreOfMass,
    wantedYawMoment - acceptedYawMoment,
    machine.yawThrusterAvailability,
    { force: fanForward * machine.mass, nose: machine.nose },
  );
  const commandedYawThrusters = auxiliary.commands;
  // Сила этого шага — фактическая, после актуатора и инерции вентилятора, как
  // у винтов. Чистый стенд без обратной связи исполняет команду мгновенно.
  const yawThrusterOutput = yawThrusters.map((_, index) =>
    machine.yawThrusterOutput
      ? Math.max(-1, Math.min(1, machine.yawThrusterOutput[index] ?? 0))
      : commandedYawThrusters[index] *
        Math.max(0, Math.min(1, machine.yawThrusterAvailability?.[index] ?? 1)),
  );
  const yawThrusterScalarForce = yawThrusters.map(
    (thruster, index) => yawThrusterOutput[index] * thruster.maximumForce,
  );
  const yawThrusterMoment = yawThrusters.reduce((sum, thruster, index) => {
    const rx = thruster.point[0] - machine.centreOfMass[0];
    const rz = thruster.point[2] - machine.centreOfMass[2];
    const arm = rz * thruster.axis[0] - rx * thruster.axis[2];
    return sum + yawThrusterScalarForce[index] * arm;
  }, 0);
  const yawMomentToRate = Math.max(1e-6, machine.inertia[1] * ROTORCRAFT_YAW_RATE_GAIN);
  // Автопилот меряет свою просьбу ЭТИМ числом, поэтому располагаемый диапазон
  // обязан считать оба органа. Иначе машина с полностью исправными тоннелями
  // продолжала бы просить только то, что может один реактивный момент.
  const yawRateLimits = {
    minimum:
      yawRate +
      (mix.minimumYawMoment - auxiliary.maximumMoment) / yawMomentToRate,
    maximum:
      yawRate +
      (mix.maximumYawMoment + auxiliary.maximumMoment) / yawMomentToRate,
  };
  const acceptedYawRate =
    yawRate + (acceptedYawMoment + auxiliary.yawMoment) / yawMomentToRate;

  // Mixer решает задачу в ДОСТАВЛЕННОЙ тяге. В throttle-канал надо отправить
  // больше ровно во столько раз, сколько актуатор ещё способен доставить:
  // слой актуаторов затем честно умножит просьбу на attachedFraction. Так
  // потеря лопасти не учитывается дважды и одновременно не обходится стороной.
  const commandedThrottle = mix.thrust.map((value, index) => {
    const available = Math.max(0, Math.min(1, machine.availability[index] ?? 1));
    const deliveredCapacity = (capacityByPoint[index] ?? 0) * available;
    return deliveredCapacity > 1e-9
      ? Math.max(0, Math.min(1, value / deliveredCapacity))
      : 0;
  });
  const motorOutput = currentMotorOutput
    ? currentMotorOutput
    : mix.thrust.map((value, index) =>
        (capacityByPoint[index] ?? 0) > 1e-9
          ? Math.max(0, Math.min(1, value / (capacityByPoint[index] ?? 1)))
          : 0,
      );
  const thrust = machine.motorOutput
    ? motorOutput.map((value, index) => value * (capacityByPoint[index] ?? 0))
    : [...mix.thrust];

  // Замер идёт ПОСЛЕ актуатора и инерции мотора. Именно эти моменты и тяга
  // попадают в authority/watchdog; решение mixer само себя подтвердить не
  // может. Геометрия та же, что выше: плечи от живого центра масс.
  const noseLengthForDelivery = Math.hypot(machine.nose[0], machine.nose[2]) || 1;
  const forwardForDelivery: readonly [number, number] = [
    machine.nose[0] / noseLengthForDelivery,
    machine.nose[2] / noseLengthForDelivery,
  ];
  const starboardForDelivery: readonly [number, number] = [
    forwardForDelivery[1],
    -forwardForDelivery[0],
  ];
  const deliveredPitchMoment = thrust.reduce((sum, value, index) => {
    const point = machine.points[index];
    const dx = point[0] - machine.centreOfMass[0];
    const dz = point[2] - machine.centreOfMass[2];
    const arm = dx * forwardForDelivery[0] + dz * forwardForDelivery[1];
    return sum - value * arm;
  }, 0);
  const deliveredRollMoment = thrust.reduce((sum, value, index) => {
    const point = machine.points[index];
    const dx = point[0] - machine.centreOfMass[0];
    const dz = point[2] - machine.centreOfMass[2];
    const arm = dx * starboardForDelivery[0] + dz * starboardForDelivery[1];
    return sum - value * arm;
  }, 0);
  const deliveredYawMoment = thrust.reduce(
    (sum, value, index) =>
      sum +
        (value *
          (machine.spinDirections?.[index] ?? (index % 2 === 0 ? 1 : -1))) /
          YAW_TORQUE_PER_THRUST_INVERSE,
    0,
  );
  const deliveredThrust = thrust.reduce((sum, value) => sum + value, 0);

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

  const forces: RotorcraftForcePoint[] = thrust.map((value, index) => ({
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
  const yawForce = deliveredYawMoment / (2 * yawArm);
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

  // ВЕНТИЛЯТОРЫ РЫСКАНИЯ — НАСТОЯЩАЯ СИЛА В НАСТОЯЩЕЙ ТОЧКЕ, и прикладывается
  // она именно там, где стоит тоннель. Момент из неё родится сам, плечом; ни
  // складывать его отдельно, ни выдавать парой, как реактивный, не нужно и
  // нельзя — иначе он посчитается дважды.
  //
  // Побочные следствия установки при этом появляются сами и остаются
  // физическими: развёрнутая пара даёт боковую силу, а вынос тоннелей над
  // центром масс превращает её в кренящий момент. Оба снимает поза машины.
  const yawThrusterForce: [number, number, number] = [0, 0, 0];
  yawThrusters.forEach((thruster, index) => {
    const scalar = yawThrusterScalarForce[index];
    if (Math.abs(scalar) < 1e-9) {
      return;
    }
    const worldAxis = rotateByQuaternion(state.orientation, thruster.axis);
    const force: [number, number, number] = [
      worldAxis[0] * scalar,
      worldAxis[1] * scalar,
      worldAxis[2] * scalar,
    ];
    yawThrusterForce[0] += force[0];
    yawThrusterForce[1] += force[1];
    yawThrusterForce[2] += force[2];
    forces.push({ force, point: place(thruster.point) });
  });

  // Порог заметности: у команды около нуля отношение бессмысленно — оно
  // скачет от знака шума. Считаем недобор только там, где машину ДЕЙСТВИТЕЛЬНО
  // о чём-то просят.
  // ПРИЧИНА СОБИРАЕТСЯ ИЗ ТОГО, ЧТО КАСКАД И ТАК ЗНАЕТ, а не угадывается по
  // величине недобора. Каждый признак ниже — уже принятое выше решение:
  // осуществима ли поза, какую долю манёвра приняли, упёрлась ли команда в
  // край многогранника раскладок или в паспортное правило.
  const noticeable = machine.liftCapacity * 0.01;
  const short = (delivered: number, wanted: number): boolean =>
    Math.abs(wanted) >= noticeable && Math.abs(delivered) < Math.abs(wanted) * 0.98;
  const attitudeCause: RotorcraftLimitCause = !mix.attitudeFeasible
    ? "attitude"
    : maneuverScale < 0.999
      ? "attitude"
      : "effector";
  // Рыскание: сперва смотрим, не правило ли это. Заказ, упершийся ровно в край
  // достижимого диапазона, ограничен ЖЕЛЕЗОМ; заказ, срезанный собственным
  // потолком темпа, ограничен ПРАВИЛОМ.
  const yawSaturated =
    Math.abs(wantedYawMoment) >= noticeable &&
    Math.abs(acceptedYawMoment + auxiliary.yawMoment - wantedYawMoment) >
      Math.abs(wantedYawMoment) * 0.02;
  const fanSaturated = commandedYawThrusters.some(
    (command) => Math.abs(command) > 0.995,
  );
  const limits: RotorcraftLimitReport = {
    thrust:
      collective >= ROTOR_COLLECTIVE_CEILING - 1e-6
        ? "envelope"
        : short(deliveredThrust, machine.liftCapacity * collective)
          ? "effector"
          : "none",
    pitch: short(deliveredPitchMoment, pitchMoment) ? attitudeCause : "none",
    roll: short(deliveredRollMoment, rollMoment) ? attitudeCause : "none",
    // Здесь различить «упёрлось железо» и «не разрешило правило» нельзя: темп
    // рыскания зажат ПОТОЛКОМ ещё до входа сюда, и в этот каскад приходит уже
    // урезанная просьба. Поэтому недобор на этом уровне всегда железный, а
    // правило распознаёт шаг полёта, где потолок и живёт.
    yaw: yawSaturated ? "effector" : "none",
    surge:
      yawThrusters.length === 0
        ? "none"
        : fanSaturated
          ? "effector"
          : "none",
  };
  const share = (delivered: number, wanted: number): number => {
    if (Math.abs(wanted) < noticeable) return 1;
    const ratio = delivered / wanted;
    return Math.max(0, Math.min(1, ratio));
  };

  return {
    forces,
    authority: {
      thrust: share(deliveredThrust, machine.liftCapacity * collective),
      pitch: share(deliveredPitchMoment, pitchMoment),
      roll: share(deliveredRollMoment, rollMoment),
      // Недобор рыскания меряется по ОБЩЕЙ просьбе и ОБЩЕЙ доставке: у машины
      // с тоннелями watchdog иначе судил бы её по одному из двух органов.
      yaw: share(deliveredYawMoment + yawThrusterMoment, wantedYawMoment),
    },
    yawRate,
    acceptedYawRate,
    yawRateLimits,
    requestedTargetPitch: requestedTarget.pitch,
    requestedTargetRoll: requestedTarget.roll,
    targetPitch: target.pitch,
    targetRoll: target.roll,
    maneuverScale,
    pitchError: target.pitch - pitchDown,
    rollError: target.roll - rollStarboardDown,
    pitchRate,
    rollRate,
    pitch: pitchDown,
    roll: rollStarboardDown,
    collective,
    commandedThrottle,
    motorOutput,
    thrust,
    limits,
    commandedYawThrusters,
    yawThrusterMoment,
    yawThrusterForce,
  };
}

// ---------------------------------------------------------------------------
// ОДИН ШАГ ПОЛЁТА — ЕДИНСТВЕННЫЙ ВХОД
//
// Раньше этого не было, и это была настоящая ошибка, а не недоделка. Контур по
// скорости жил В ТЕСТЕ: стенд сам считал ход вдоль носа, сам звал внешний
// контур, сам держал курс — и только потом обращался к силам. Рантайм вёл ту же
// машину иначе, через корабельные рычаги. Тест доказывал поведение, которого в
// игре не было ни секунды, и зеленел вечно.
//
// Поэтому вход один. Стенд и рантайм зовут ЭТУ функцию; расходиться им больше
// негде. Снаружи остаётся только перевод просьбы автопилота в требование —
// «идти с такой-то скоростью и смотреть туда», — а не в положение рычагов.
// ---------------------------------------------------------------------------

/** Что от машины хотят. Требование в физических величинах, не рычаги. */
export interface RotorcraftRequest {
  /** Путевая скорость вдоль носа, м/с. Минус — задний ход. */
  readonly forwardSpeed: number;
  /** Путевая скорость на правый борт, м/с. */
  readonly lateralSpeed: number;
  /**
   * С какой скоростью доворачивать нос, рад/с.
   *
   * Именно ТЕМП, а не курс: откуда он взялся — дело того, кто просит. Стенд
   * держит фиксированный курс и получает темп из `rotorcraftHeadingRate`;
   * автопилот считает свой `desiredYawRate`, зная маршрут и створ захода. Закон
   * «ошибка курса → темп» у обоих один и тот же, а вот источник курса разный, и
   * притворяться, будто он общий, было бы враньём.
   */
  readonly yawRate: number;
  /** Просьба по подъёму сверх веса, доля веса. */
  readonly collective: number;
  /**
   * УПРЕЖДЕНИЕ: ускорение, которого требует САМА ТРАССА, в мировых осях [x, z].
   *
   * Без него контур позы чисто реактивен: крен считается из ошибки боковой
   * скорости, а ошибка появляется только ПОСЛЕ того, как машину уже снесло.
   * Замер дал запаздывание в 1.30 с — на маршрутной скорости это двадцать шесть
   * метров, пройденных прежде чем аппарат начнёт крениться.
   *
   * Упреждается ТОЛЬКО КРЕН. Требовать вдобавок, чтобы нос шёл за креном, —
   * значит навязывать голономной машине ограничение самолёта: у него сила
   * только вдоль корпуса, у неё в любую сторону. Проверено дорого: упреждение
   * по рысканью съело всю власть по курсу и увело машину на 6232 м от трассы.
   */
  readonly pathAcceleration?: readonly [number, number, number];
}

export interface RotorcraftFlightStep {
  /** Силы колец: их и складывают с весом и сопротивлением. */
  readonly forces: readonly RotorcraftForcePoint[];
  /** Поправка на перекос для СЛЕДУЮЩЕГО шага. */
  readonly trim: RotorcraftTrimState;
  readonly result: RotorcraftResult;
  /** Замеренный ход вдоль носа, м/с: по нему и замкнут контур. */
  readonly forwardSpeed: number;
  /** Замеренный снос на правый борт, м/с. */
  readonly lateralSpeed: number;
}

export function rotorcraftFlightStep(
  machine: RotorcraftMachine,
  state: RotorcraftState,
  request: RotorcraftRequest,
  trim: RotorcraftTrimState,
  deltaSeconds: number,
  maximumYawRate = 0.8,
): RotorcraftFlightStep {
  const noseLength = Math.hypot(machine.nose[0], machine.nose[2]) || 1;
  const noseFlat: SceneVector3 = [
    machine.nose[0] / noseLength,
    0,
    machine.nose[2] / noseLength,
  ];
  const forwardWorld = rotateByQuaternion(state.orientation, noseFlat);
  const flat = Math.hypot(forwardWorld[0], forwardWorld[2]) || 1;
  const nx = forwardWorld[0] / flat;
  const nz = forwardWorld[2] / flat;
  // Ход РАСКЛАДЫВАЕТСЯ ПО НОСУ, а не берётся модулем: машина, летящая боком,
  // должна видеть это как снос, иначе она примет его за ход вперёд.
  const forwardSpeed = state.velocity[0] * nx + state.velocity[2] * nz;
  // ПРАВЫЙ БОРТ — ПО СОГЛАШЕНИЮ ПРОЕКТА, а не по внутреннему соглашению этого
  // модуля, и разница здесь не косметическая.
  //
  // Весь проект считает правым бортом `pitchAxisOf(nose) = (−nz, nx)`: при
  // правой тройке и носе вдоль −x это −z, и на том же знаке стоят
  // `vehicleAttitude` и боковой контур автопилота. Внутри этого модуля правым
  // бортом назван (nz, −nx) — противоположное направление. Само по себе это
  // безобидно, пока модуль замкнут на себя: его собственный крен, его же темпы
  // и его же микшер согласованы между собой, и тесты сходятся.
  //
  // Ломается всё ровно на стыке. В прогоне маршрута автопилот просил сместиться
  // к трассе, машина честно исполняла — и уезжала в противоположную сторону;
  // снос рос, крен вставал в предельные тридцать градусов и там оставался, и за
  // две минуты машину уносило на семьсот метров от круга.
  //
  // Поэтому снаружи этой функции борт ВСЕГДА проектный, а разворот знака живёт
  // здесь, в единственном месте, и больше нигде.
  const lateralSpeed = state.velocity[2] * nx - state.velocity[0] * nz;
  // Предел разгона у машины с тоннелями больше наклонного, и внешний контур
  // обязан это знать: иначе он сам зажимает просьбу цифрой обычного коптера, и
  // вся прямая тяга простаивает при формально исправном аппарате.
  // ПОТОЛОК РАЗГОНА — ЭЛЛИПС, А НЕ КРУГ. Тоннели толкают только вдоль носа:
  // вперёд машина берёт наклон плюс синфазную тягу, вбок — один наклон. Пока
  // потолок был кругом «наклон + тоннели», контур скорости разрешал себе вбок
  // 39 м/с² там, где физика даёт 14.5, — просил недостижимое и жил в насыщении
  // клампа позы вместо честного предела.
  const tiltCeiling = rotorcraftMaximumAcceleration(machine.maximumTilt);
  const surgeCeiling = rotorcraftSurgeAcceleration(machine);
  const corrective = rotorcraftVelocityDemand(
    { forward: request.forwardSpeed, lateral: request.lateralSpeed },
    { forward: forwardSpeed, lateral: lateralSpeed },
    Number.POSITIVE_INFINITY,
  );
  // Упреждение раскладывается ТОЙ ЖЕ проекцией, что и скорость: иначе знак
  // борта разъедется и машина начнёт входить в вираж наружу.
  const pathForward = request.pathAcceleration
    ? request.pathAcceleration[0] * nx + request.pathAcceleration[2] * nz
    : 0;
  const pathLateral = request.pathAcceleration
    ? request.pathAcceleration[2] * nx - request.pathAcceleration[0] * nz
    : 0;
  // ВЕРТИКАЛЬНАЯ ЧАСТЬ ТОГО ЖЕ ВЕКТОРА — В ГАЗ. Гребень горки прижимает,
  // впадина отпускает; исполняет это подъёмная тяга, как вираж исполняет
  // наклон. Доля веса, зажата собственным пределом дифферентовки газа.
  const pathVertical = request.pathAcceleration
    ? Math.max(-0.3, Math.min(0.3, request.pathAcceleration[1] / 9.81))
    : 0;
  const combined = {
    forward: corrective.forward + pathForward,
    lateral: corrective.lateral + pathLateral,
  };
  // РАЗГОНУ НАКЛОН ПОЧТИ НЕ ПОЛОЖЕН, ТОРМОЖЕНИЮ — ВЕСЬ БЮДЖЕТ.
  //
  // Симметричный потолок оставлял лазейку: при большой ошибке скорости контур
  // добирал наклоном сверх тоннелей, и машина разгонялась клювом в 35° — а
  // потом перекладывалась в горизонт со взмахом в 37°/с, который с земли
  // читается как «встала на дыбы перед манёвром». Скорость этой машине дают
  // тоннели; глубокий клевок на разгоне — только поза, и цена ей ноль.
  // Торможение — другое дело: это безопасность, ему наклон отдан целиком.
  // У машины без тоннелей асимметрии нет — наклон её единственный орган.
  const accelerationCeiling =
    surgeCeiling > 1e-6 ? surgeCeiling + tiltCeiling * 0.25 : tiltCeiling;
  const forwardCeiling =
    combined.forward >= 0 ? accelerationCeiling : tiltCeiling + surgeCeiling;
  const ellipse = Math.hypot(
    combined.forward / Math.max(1e-6, forwardCeiling),
    combined.lateral / Math.max(1e-6, tiltCeiling),
  );
  const scale = ellipse > 1 ? 1 / ellipse : 1;
  const acceleration = {
    forward: combined.forward * scale,
    lateral: combined.lateral * scale,
  };
  const result = rotorcraftForces(
    machine,
    state,
    {
      forward: acceleration.forward,
      lateral: -acceleration.lateral,
      collective: request.collective + pathVertical,
      yaw: Math.max(
        -maximumYawRate,
        Math.min(maximumYawRate, request.yawRate),
      ),
    },
    trim,
  );
  // ПОТОЛОК ТЕМПА — ЧАСТЬ ОБЪЯВЛЕННОГО ДИАПАЗОНА, А НЕ ОТДЕЛЬНЫЙ ЗАЖИМ ВНУТРИ.
  //
  // Аллокатор считает, сколько машина способна дать ЗА ОДИН ШАГ, и у машины с
  // отдельными тоннелями это число получается в разы больше того темпа, с
  // которым ей вообще разрешено крутиться. Если наверх уходит только оно,
  // автопилот снова просит недостижимое — на этот раз не из-за слабости
  // канала, а из-за собственного потолка машины, — и watchdog судит её по
  // команде, которой она никогда не получала. Поэтому объявляется пересечение
  // физической способности и разрешённого темпа.
  const limitedYawRates = {
    minimum: Math.max(-maximumYawRate, result.yawRateLimits.minimum),
    maximum: Math.min(maximumYawRate, result.yawRateLimits.maximum),
  };
  // ВОТ ЗДЕСЬ и распознаётся правило: просьбу срезал собственный потолок
  // машины, а не край её возможностей. Машина МОЖЕТ, но ей не разрешено — и
  // тому, кто просит, это надо знать отдельно, иначе он будет искать
  // несуществующую поломку.
  const cappedByPolicy =
    Math.abs(request.yawRate) > maximumYawRate + 1e-6 &&
    Math.abs(result.yawRate) < maximumYawRate;
  return {
    forces: result.forces,
    trim: advanceRotorcraftTrim(
      trim,
      { pitch: result.pitchError, roll: result.rollError },
      { pitch: result.pitchRate, roll: result.rollRate },
      deltaSeconds,
    ),
    result: {
      ...result,
      limits: cappedByPolicy
        ? { ...result.limits, yaw: "envelope" as const }
        : result.limits,
      yawRateLimits: limitedYawRates,
      acceptedYawRate: Math.max(
        limitedYawRates.minimum,
        Math.min(limitedYawRates.maximum, result.acceptedYawRate),
      ),
    },
    forwardSpeed,
    lateralSpeed,
  };
}
