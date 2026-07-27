/**
 * Капсула игрока. Всё, что ставит игрока на пол или щупает мир от его
 * подошвы, считается ОТСЮДА. Высота капсулы уже один раз потерялась по
 * дороге: точку высадки на перрон задали высотой настила, и проводник
 * ссаживал пассажира на полметра внутрь бетона.
 */
export const PLAYER_CAPSULE_HALF_HEIGHT = 0.45;
export const PLAYER_CAPSULE_RADIUS = 0.36;
/** От центра капсулы до подошвы: центр = пол + это. */
export const PLAYER_CAPSULE_FOOT_OFFSET =
  PLAYER_CAPSULE_HALF_HEIGHT + PLAYER_CAPSULE_RADIUS;

/** Тяжесть игры. Из неё считаются и подъём автошага, и время в воздухе. */
export const PLAYER_GRAVITY = 14;

export const MAX_AUTO_STEP_HEIGHT = 0.72;
// Карабканье: выше обычного шага, но в пределах «подтянулся руками» —
// пороги, кромки воронок, лежащие плиты. Дальше только полёт.
export const MAX_AUTO_CLIMB_HEIGHT = 1.18;
export const MIN_WALKABLE_SURFACE_NORMAL_Y = 0.64;

export interface AutoStepProbe {
  readonly blockedAtFeet: boolean;
  readonly bodyClear: boolean;
  readonly landingFound: boolean;
  readonly landingNormalY: number;
  readonly stepHeight: number;
}

interface Direction3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

interface MutableDirection3 {
  x: number;
  y: number;
  z: number;
}

export function autoStepLiftSpeed(probe: AutoStepProbe): number {
  if (
    !probe.blockedAtFeet ||
    !probe.bodyClear ||
    !probe.landingFound ||
    probe.landingNormalY < MIN_WALKABLE_SURFACE_NORMAL_Y ||
    probe.stepHeight <= 0.04 ||
    probe.stepHeight > MAX_AUTO_STEP_HEIGHT
  ) {
    return 0;
  }

  return Math.min(5.4, Math.sqrt(2 * PLAYER_GRAVITY * (probe.stepHeight + 0.2)));
}

/**
 * Сколько длится подъём, начатый автошагом.
 *
 * Всё это время ноги продолжают толкать вперёд. Шаг — это ПЕРЕНОС ТЕЛА, а не
 * подскок на месте: подъём прикладывается вертикально, а кромка держит
 * капсулу в 0.35 м от себя, и без переноса игрок взлетает на 0.44 м строго
 * вверх и падает на ту же ступень. Взойти получалось только с разбега —
 * скорость приходилось приносить с собой, потому что сам шаг её не давал.
 *
 * Окно ровно на время полёта: это по-прежнему НЕ воздушное управление.
 * Сорвавшийся с борта или падающий в яму игрок его не получает — оно
 * открывается только тем шагом, который сам же и начался с найденной впереди
 * площадки.
 */
export function stepCarryWindow(liftSpeed: number): number {
  return liftSpeed > 0 ? (2 * liftSpeed) / PLAYER_GRAVITY : 0;
}

/**
 * Карабканье — «шагнуть или подпрыгнуть»: когда упёрся, а площадка выше
 * обычного шага, игрок сам вытягивает себя на кромку (порог, стенка ямы,
 * лежащая плита). Работает только там, где честный шаг уже отказал.
 */
export function autoClimbLiftSpeed(probe: AutoStepProbe): number {
  if (
    !probe.blockedAtFeet ||
    !probe.bodyClear ||
    !probe.landingFound ||
    probe.landingNormalY < MIN_WALKABLE_SURFACE_NORMAL_Y ||
    probe.stepHeight <= MAX_AUTO_STEP_HEIGHT ||
    probe.stepHeight > MAX_AUTO_CLIMB_HEIGHT
  ) {
    return 0;
  }

  return Math.min(6.3, Math.sqrt(2 * PLAYER_GRAVITY * (probe.stepHeight + 0.2)));
}

export function setFlightVelocityTarget(
  target: MutableDirection3,
  forward: Direction3,
  right: Direction3,
  inputX: number,
  inputZ: number,
  speed: number,
): MutableDirection3 {
  const x = right.x * inputX - forward.x * inputZ;
  const y = right.y * inputX - forward.y * inputZ;
  const z = right.z * inputX - forward.z * inputZ;
  const directionLength = Math.hypot(x, y, z);
  const inputStrength = Math.min(1, Math.hypot(inputX, inputZ));

  if (directionLength <= Number.EPSILON || inputStrength <= Number.EPSILON) {
    target.x = 0;
    target.y = 0;
    target.z = 0;
    return target;
  }

  const scale = (speed * inputStrength) / directionLength;
  target.x = x * scale;
  target.y = y * scale;
  target.z = z * scale;
  return target;
}
