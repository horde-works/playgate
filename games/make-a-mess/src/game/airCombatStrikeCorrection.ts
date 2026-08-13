import type { SceneVector3 } from "./destructionScene.ts";
import { postureDemand } from "./airCombatPosture.ts";
import {
  evasionRadius,
  extrapolateTrack,
  maximumEffectiveRange,
  type AirCombatTrack,
} from "./vehicleGunnery.ts";

/**
 * ЖИВАЯ КОРРЕКЦИЯ УЖЕ НАЧАТОГО БРОСКА.
 *
 * Бросок, его сторона, ритм и конец принадлежат `airCombatPilot`. Этот модуль
 * не ищет другой заход и не выбирает манёвр. Он берёт скорость, которую уже
 * заказала кривая броска, и задаёт более узкий вопрос:
 *
 *   КАКОЕ ПРОДОЛЖЕНИЕ — ВКЛЮЧАЯ ЕГО СКОРОСТЬ — ПОКУПАЕТ БОЛЬШЕ РЕАЛЬНОГО
 *   ОГНЕВОГО ОКНА, ЧЕМ ЧЕСТНОЕ ПРОДОЛЖЕНИЕ НЫНЕШНЕГО БРОСКА?
 *
 * Ноль всегда первый кандидат и мера всех остальных. Коррекция применяется
 * только за измеримый выигрыш относительно него. Если ни одно физически
 * доступное продолжение не приближает решение, модуль советует бросок закрыть;
 * сам переход по-прежнему делает автомат.
 */

const GRAVITY = 9.81;
const VELOCITY_GAIN = 1.6;
const EPSILON = 1e-8;
export const STRIKE_CORRECTION_HORIZON = 1.5;
const DEFAULT_STEP = 0.25;
const TANGENT_DIRECTIONS = 8;
/** Скорости — доли полного хода, а не именованные режимы атаки. */
const SPEED_SHARES = [1 / 6, 0.35, 0.5, 0.65, 0.8, 1] as const;
/** Меньшее — шум дискретной модели, а не основание трогать живой бросок. */
const MINIMUM_FIRE_GAIN_SAMPLES = 1;

export interface StrikeCorrectionOwnState {
  readonly centre: SceneVector3;
  readonly velocity: SceneVector3;
  readonly gunAxis: SceneVector3;
}

export interface StrikeCorrectionCapability {
  readonly maximumSpeed: number;
  readonly lateralAcceleration: number;
  readonly yawRate: number;
  readonly liftReserve: number;
  readonly surgeAcceleration: number;
}

export interface StrikeCorrectionWeapons {
  readonly cannonRange: number;
  readonly rocketRange: number;
  readonly rocketSpeed: number;
  readonly rocketLethalRadius: number;
  readonly rocketsAvailable: boolean;
  readonly minimumRange: number;
}

export interface StrikeCorrectionInput {
  readonly own: StrikeCorrectionOwnState;
  readonly target: AirCombatTrack;
  /** Скорость, которую без коррекции заказывает нынешняя кривая броска. */
  readonly baselineVelocity: SceneVector3;
  /** Прошлая поправка нужна только для связности между равными ответами. */
  readonly previousOffset: SceneVector3 | null;
  readonly capability: StrikeCorrectionCapability;
  readonly weapons: StrikeCorrectionWeapons;
  readonly floor: number;
  readonly horizon?: number;
  readonly step?: number;
}

export type StrikeRejection = "none" | "floor" | "minimum-range" | "body";

export interface StrikeContinuationEstimate {
  readonly desiredVelocity: SceneVector3;
  readonly velocityOffset: SceneVector3;
  readonly feasible: boolean;
  readonly fireSeconds: number;
  readonly firstFireSeconds: number;
  readonly minimumAimError: number;
  readonly bodyMargin: number;
  readonly targetBinding: number;
  readonly exitRoom: number;
  readonly continuity: number;
  readonly rejectedBy: StrikeRejection;
}

export interface StrikeCorrectionResult extends StrikeContinuationEstimate {
  readonly selected: boolean;
  /** Сколько секунд окна куплено относительно неизменённого броска. */
  readonly gainedFireSeconds: number;
  /** Было ли нулевое окно спасено коррекцией. */
  readonly salvaged: boolean;
  /** Есть ли на горизонте огонь либо физическое сближение прицела с решением. */
  readonly salvageable: boolean;
  readonly baselineFireSeconds: number;
  readonly candidates: number;
}

const add = (a: SceneVector3, b: SceneVector3): SceneVector3 => [
  a[0] + b[0],
  a[1] + b[1],
  a[2] + b[2],
];

const subtract = (a: SceneVector3, b: SceneVector3): SceneVector3 => [
  a[0] - b[0],
  a[1] - b[1],
  a[2] - b[2],
];

const scale = (v: SceneVector3, amount: number): SceneVector3 => [
  v[0] * amount,
  v[1] * amount,
  v[2] * amount,
];

const dot = (a: SceneVector3, b: SceneVector3): number =>
  a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

const cross = (a: SceneVector3, b: SceneVector3): SceneVector3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

const length = (v: SceneVector3): number => Math.hypot(v[0], v[1], v[2]);

const normalize = (
  v: SceneVector3,
  fallback: SceneVector3 = [0, 0, 1],
): SceneVector3 => {
  const magnitude = length(v);
  return magnitude <= EPSILON ? fallback : scale(v, 1 / magnitude);
};

const clampMagnitude = (v: SceneVector3, maximum: number): SceneVector3 => {
  const magnitude = length(v);
  return magnitude <= maximum || magnitude <= EPSILON
    ? v
    : scale(v, maximum / magnitude);
};

const angleBetween = (a: SceneVector3, b: SceneVector3): number =>
  Math.acos(Math.max(-1, Math.min(1, dot(normalize(a), normalize(b)))));

/** Единичный вектор, довёрнутый к цели не быстрее доступного темпа. */
function rotateToward(
  from: SceneVector3,
  to: SceneVector3,
  maximumAngle: number,
): SceneVector3 {
  const a = normalize(from);
  const b = normalize(to);
  const angle = angleBetween(a, b);
  if (angle <= maximumAngle || angle <= EPSILON) return b;
  // Нормированная линейная интерполяция достаточна на шагах меньше 11° и не
  // требует строить кватернион для каждой диагностической пробы.
  return normalize(add(scale(a, 1 - maximumAngle / angle), scale(b, maximumAngle / angle)));
}

function speedOffsets(input: StrikeCorrectionInput): SceneVector3[] {
  const line = normalize(subtract(input.target.centre, input.own.centre));
  // СКОРОСТЬ — ТАКАЯ ЖЕ КООРДИНАТА ПОЛЯ, КАК НАПРАВЛЕНИЕ.
  //
  // Прежде поле умело только слегка толкнуть уже назначенную скорость. Поэтому
  // внешний автомат был вынужден заранее держать бросок под потолком 21 м/с:
  // без него корректор физически не мог рассмотреть ни длинное медленное окно,
  // ни короткое быстрое пересечение. Теперь чистые продольные варианты входят
  // в тот же прогноз и обязаны купить окно на общих основаниях.
  const baselineSpeed = length(input.baselineVelocity);
  const travel = normalize(input.baselineVelocity, line);
  const offsets: SceneVector3[] = [];
  for (const share of SPEED_SHARES) {
    const wantedSpeed = input.capability.maximumSpeed * share;
    if (Math.abs(wantedSpeed - baselineSpeed) > EPSILON) {
      offsets.push(scale(travel, wantedSpeed - baselineSpeed));
    }
  }
  return offsets;
}

function correctionOffsets(input: StrikeCorrectionInput): SceneVector3[] {
  const { own, target, capability } = input;
  const line = normalize(subtract(target.centre, own.centre));
  let side = cross([0, 1, 0], line);
  if (length(side) <= EPSILON) side = cross([1, 0, 0], line);
  side = normalize(side);
  const crown = normalize(cross(line, side));
  const magnitude = capability.maximumSpeed * 0.18;
  const baselineSpeed = length(input.baselineVelocity);
  const offsets: SceneVector3[] = [[0, 0, 0], ...speedOffsets(input)];
  const directionOffset = (rawOffset: SceneVector3): SceneVector3 => {
    // Направление и ход — независимые координаты поля. Простое сложение
    // бокового вектора с малой скоростью нечаянно превращало поворот в
    // торможение вплоть до висения. Направляющая проба обязана сохранить ход;
    // изменить его могут только явные продольные кандидаты выше.
    const desired = scale(
      normalize(add(input.baselineVelocity, rawOffset), line),
      baselineSpeed,
    );
    return subtract(desired, input.baselineVelocity);
  };

  // Кольца вокруг линии огня дают равноправные направления, включая отвес и
  // перевёрнутый ответ. Мировая вертикаль нужна только чтобы начать базис; на
  // самом кольце она не имеет ни веса, ни привилегии.
  for (const axialShare of [0, 0.5, -0.5]) {
    const tangentShare = Math.sqrt(1 - axialShare * axialShare);
    for (let index = 0; index < TANGENT_DIRECTIONS; index += 1) {
      const phase = (index / TANGENT_DIRECTIONS) * Math.PI * 2;
      const tangent = add(scale(side, Math.cos(phase)), scale(crown, Math.sin(phase)));
      offsets.push(directionOffset(
        scale(add(scale(line, axialShare), scale(tangent, tangentShare)), magnitude),
      ));
    }
  }
  offsets.push(
    directionOffset(scale(line, magnitude)),
    directionOffset(scale(line, -magnitude)),
  );
  if (input.previousOffset && length(input.previousOffset) > EPSILON) {
    offsets.push(input.previousOffset);
  }
  return offsets;
}

function rejected(
  desiredVelocity: SceneVector3,
  offset: SceneVector3,
  reason: StrikeRejection,
  continuity: number,
): StrikeContinuationEstimate {
  return {
    desiredVelocity,
    velocityOffset: offset,
    feasible: false,
    fireSeconds: 0,
    firstFireSeconds: Number.POSITIVE_INFINITY,
    minimumAimError: Math.PI,
    bodyMargin: 0,
    targetBinding: -1,
    exitRoom: Number.NEGATIVE_INFINITY,
    continuity,
    rejectedBy: reason,
  };
}

export function evaluateStrikeContinuation(
  input: StrikeCorrectionInput,
  requestedOffset: SceneVector3,
): StrikeContinuationEstimate {
  const horizon = input.horizon ?? STRIKE_CORRECTION_HORIZON;
  const step = input.step ?? DEFAULT_STEP;
  const { own, target, capability, weapons } = input;
  const desiredVelocity = clampMagnitude(
    add(input.baselineVelocity, requestedOffset),
    capability.maximumSpeed,
  );
  const offset = subtract(desiredVelocity, input.baselineVelocity);
  const continuity = input.previousOffset
    ? Math.max(
        -1,
        Math.min(
          1,
          1 - length(subtract(offset, input.previousOffset)) / Math.max(capability.maximumSpeed, EPSILON),
        ),
      )
    : 0;

  let position: SceneVector3 = [...own.centre];
  let velocity: SceneVector3 = [...own.velocity];
  let gunAxis = normalize(own.gunAxis);
  let previousRange = length(subtract(target.centre, position));
  const initialAimError = angleBetween(gunAxis, subtract(target.centre, position));
  let minimumAimError = initialAimError;
  let fireSeconds = 0;
  let firstFireSeconds = Number.POSITIVE_INFINITY;
  let bodyMargin = 0;
  let targetBinding = 0;
  let samples = 0;

  for (let elapsed = step; elapsed <= horizon + EPSILON; elapsed += step) {
    const targetCentre = extrapolateTrack(target, elapsed);
    const aim = normalize(subtract(targetCentre, position));
    gunAxis = rotateToward(gunAxis, aim, capability.yawRate * step);

    const wanted = scale(subtract(desiredVelocity, velocity), VELOCITY_GAIN);
    const demand = postureDemand(aim, wanted, capability);
    if (!demand.feasible) {
      return rejected(desiredVelocity, offset, "body", continuity);
    }
    velocity = add(velocity, scale(demand.acceptedAcceleration, step));
    position = add(position, scale(velocity, step));

    // Вертикаль особенная только для земли. Проверяется тормозной путь уже
    // набранного падения, а не предпочтение позы или яруса.
    const upwardAcceleration = Math.max(
      (capability.liftReserve - 1) * GRAVITY,
      capability.surgeAcceleration,
      EPSILON,
    );
    const floorStoppingRoom =
      velocity[1] < 0
        ? (velocity[1] * velocity[1]) / (2 * upwardAcceleration)
        : 0;
    if (position[1] - input.floor < floorStoppingRoom) {
      return rejected(desiredVelocity, offset, "floor", continuity);
    }

    const range = length(subtract(targetCentre, position));
    const radialClosing = Math.max(0, (previousRange - range) / step);
    const brakingAcceleration = Math.max(
      capability.lateralAcceleration,
      capability.surgeAcceleration,
      EPSILON,
    );
    const stoppingRoom =
      (radialClosing * radialClosing) / (2 * brakingAcceleration);
    if (
      radialClosing > EPSILON &&
      range < weapons.minimumRange + stoppingRoom
    ) {
      return rejected(desiredVelocity, offset, "minimum-range", continuity);
    }
    previousRange = range;

    const aimError = angleBetween(gunAxis, aim);
    minimumAimError = Math.min(minimumAimError, aimError);
    const targetAngle = Math.atan(target.radius / Math.max(range, 1));
    const flight = range / Math.max(weapons.rocketSpeed, EPSILON);
    const escape = evasionRadius(target, flight, capability.lateralAcceleration);
    const lethalReach = weapons.rocketLethalRadius + target.radius;
    const binding = Math.max(-1, Math.min(1, 1 - escape / lethalReach));
    const rocketCeiling = weapons.rocketsAvailable
      ? maximumEffectiveRange(
          target,
          weapons.rocketSpeed,
          lethalReach,
          capability.lateralAcceleration,
          weapons.rocketRange,
        )
      : 0;
    const cannonSolution =
      range <= weapons.cannonRange && aimError <= targetAngle;
    const rocketSolution =
      weapons.rocketsAvailable &&
      range <= rocketCeiling &&
      escape <= lethalReach &&
      aimError <= targetAngle * 0.35;
    if (
      range >= weapons.minimumRange &&
      (cannonSolution || rocketSolution)
    ) {
      fireSeconds += step;
      firstFireSeconds = Math.min(firstFireSeconds, elapsed);
    }
    bodyMargin += demand.margin;
    targetBinding += binding;
    samples += 1;
  }

  return {
    desiredVelocity,
    velocityOffset: offset,
    feasible: true,
    fireSeconds,
    firstFireSeconds,
    minimumAimError,
    bodyMargin: samples > 0 ? bodyMargin / samples : 0,
    targetBinding: samples > 0 ? targetBinding / samples : -1,
    exitRoom: previousRange - weapons.minimumRange,
    continuity,
    rejectedBy: "none",
  };
}

function betterCorrection(
  candidate: StrikeContinuationEstimate,
  incumbent: StrikeContinuationEstimate,
  step: number,
): boolean {
  if (!candidate.feasible) return false;
  if (candidate.fireSeconds > incumbent.fireSeconds + step / 2) return true;
  if (candidate.fireSeconds + step / 2 < incumbent.fireSeconds) return false;

  const candidateFires = Number.isFinite(candidate.firstFireSeconds);
  const incumbentFires = Number.isFinite(incumbent.firstFireSeconds);
  if (candidateFires !== incumbentFires) return candidateFires;
  if (
    candidateFires &&
    candidate.firstFireSeconds < incumbent.firstFireSeconds - step / 2
  ) {
    return true;
  }
  if (
    candidateFires &&
    candidate.firstFireSeconds > incumbent.firstFireSeconds + step / 2
  ) {
    return false;
  }
  if (candidate.minimumAimError < incumbent.minimumAimError - 0.03) return true;
  if (candidate.minimumAimError > incumbent.minimumAimError + 0.03) return false;
  if (candidate.bodyMargin > incumbent.bodyMargin + 0.08) return true;
  if (candidate.bodyMargin < incumbent.bodyMargin - 0.08) return false;
  if (candidate.continuity > incumbent.continuity + 0.25) return true;
  return false;
}

function chooseFromOffsets(
  input: StrikeCorrectionInput,
  offsets: readonly SceneVector3[],
): StrikeCorrectionResult {
  const step = input.step ?? DEFAULT_STEP;
  const baseline = evaluateStrikeContinuation(input, [0, 0, 0]);
  let best = baseline;
  for (const offset of offsets.slice(1)) {
    const candidate = evaluateStrikeContinuation(input, offset);
    if (betterCorrection(candidate, best, step)) best = candidate;
  }

  const predictedFireGain = best.fireSeconds - baseline.fireSeconds;
  const selected =
    best !== baseline &&
    best.feasible &&
    predictedFireGain >= step * MINIMUM_FIRE_GAIN_SAMPLES - EPSILON;
  // Прогноз имеет право СОВЕТОВАТЬ поправку только за целый отсчёт окна.
  // Всё меньшее оставляет управление исходной кривой броска.
  const continuation = selected ? best : baseline;
  const gainedFireSeconds = selected ? predictedFireGain : 0;
  // Даже без выстрела бросок ещё жив, если доступное продолжение реально
  // уменьшает ошибку прицела. «Ноль окна» не равен «бросай», пока тело сходится.
  const currentAimError = angleBetween(
    input.own.gunAxis,
    subtract(input.target.centre, input.own.centre),
  );
  const salvageable =
    best.fireSeconds > 0 || best.minimumAimError < currentAimError - 0.03;
  return {
    ...continuation,
    selected,
    gainedFireSeconds,
    salvaged: selected && baseline.fireSeconds <= EPSILON && best.fireSeconds > 0,
    salvageable,
    baselineFireSeconds: baseline.fireSeconds,
    candidates: offsets.length,
  };
}

/** Только скаляр хода: используется на подходе, пока направление ещё не отдано броску. */
export function chooseStrikeSpeed(
  input: StrikeCorrectionInput,
): StrikeCorrectionResult {
  return chooseFromOffsets(input, [[0, 0, 0], ...speedOffsets(input)]);
}

export function chooseStrikeCorrection(
  input: StrikeCorrectionInput,
): StrikeCorrectionResult {
  return chooseFromOffsets(input, correctionOffsets(input));
}
