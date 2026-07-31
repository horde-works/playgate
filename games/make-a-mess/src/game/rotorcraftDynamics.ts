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
  /** Момент рыскания, доля предельного. */
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
  /** Доля суммарной тяги: 1 — режим висения целой машины. */
  readonly collective: number;
  /** Момент по тангажу, Н·м: плюс — нос вниз. */
  readonly pitchMoment: number;
  /** Момент по крену, Н·м: плюс — правый борт вниз. */
  readonly rollMoment: number;
}

/**
 * МИКШЕР. Переводит «общая тяга плюс два момента» в тягу каждого винта.
 *
 * Работает для любого числа винтов и любой их раскладки: плечи берутся из
 * настоящих точек, а не из предположения о симметрии. Насыщение зажимается —
 * винт не умеет ни тянуть вниз, ни дать больше своего предела, — и после
 * зажима моменты пересчитываются по фактически выданному, чтобы автоматика
 * знала, чего она НЕ получила.
 */
export function mixRotorThrust(
  input: RotorMixInput,
  demand: RotorMixDemand,
): {
  readonly thrust: readonly number[];
  readonly deliveredPitchMoment: number;
  readonly deliveredRollMoment: number;
  readonly deliveredThrust: number;
} {
  const count = input.points.length;
  const noseLength = Math.hypot(input.nose[0], input.nose[2]) || 1;
  const forward: readonly [number, number] = [
    input.nose[0] / noseLength,
    input.nose[2] / noseLength,
  ];
  const starboard: readonly [number, number] = [-forward[1], forward[0]];
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
  const thrust = arms.map((arm, index) => {
    // Нос вниз означает БОЛЬШЕ тяги сзади: знак момента и знак плеча
    // связаны через правило правой руки, и путать его тут дорого.
    const pitchPart =
      denominatorPitch > 1e-9
        ? (-demand.pitchMoment * arm.longitudinal) / denominatorPitch
        : 0;
    const rollPart =
      denominatorRoll > 1e-9
        ? (-demand.rollMoment * arm.lateral) / denominatorRoll
        : 0;
    const wanted = commonThrust + pitchPart + rollPart;
    return Math.max(0, Math.min(perRotorLimit[index] ?? 0, wanted));
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
    deliveredThrust: thrust.reduce((sum, value) => sum + value, 0),
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
  damping = 3.2,
): number {
  return inertia * (stiffness * (target - actual) - damping * rate);
}
