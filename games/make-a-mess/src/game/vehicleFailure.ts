export type VehicleFailureReason =
  | "structureLost"
  | "invalidState"
  | "unsafeAltitude"
  | "criticalAttitude"
  | "routeDivergence"
  | "controlMismatch"
  | "stalled"
  | "goAroundLimit"
  | "correctionLimit"
  | "trimExhausted"
  /**
   * МАШИНУ ДЕРЖИТ ЧУЖОЕ ТЕЛО, и она не смогла освободиться за отпущенный срок.
   *
   * Отдельное имя, а не `controlMismatch`, — по прямому вердикту Igor
   * (12.08.2026): «с одной стороны машина не вполне слушается управления, с
   * другой — причина снаружи, а не внутри, и это нужно различать». Симптом
   * действительно тот же: заказали отклонение, получили ноль. Но у зацепа
   * ДРУГОЕ лечение — не разбор машины, а высвобождение, — и пока причина
   * названа неверно, правильное лечение не может даже начаться.
   */
  | "entangled"
  | "dockingTimeout";

/** One transport-neutral failure notification for HUDs, logs and dispatchers. */
/**
 * Один орган управления глазами автоматики: чего от него ждали и что он
 * дал. Именно этот разрыв и снимает машину с рейса, поэтому он должен быть
 * читаемым, а не выводиться постфактум из симптома.
 */
export interface VehicleControlReading {
  /** Что это за орган: «тяга 0», «руль», «подъём», «дифферент». */
  readonly organ: string;
  readonly expected: number;
  readonly actual: number;
  /** Обязателен ли орган для продолжения рейса. */
  readonly required: boolean;
  /** Короткая причина, если орган не отвечает. */
  readonly note?: string;
}

export interface VehicleFailureEvent {
  readonly sourceId: string;
  readonly sourceLabel: string;
  readonly reason: VehicleFailureReason;
  /** Полный набор органов на момент отказа. */
  readonly readings?: readonly VehicleControlReading[];
  /** Числа маршрута и позы, по которым судили. */
  readonly metrics?: readonly VehicleControlReading[];
}

export type VehicleFailureDisposition =
  | "escapeRoute"
  | "descendBelowFog"
  | "settleInPlace"
  /**
   * Уцелевшие движители физически не могут удержать машину горизонтально:
   * её центр масс вышел за выпуклую оболочку оставшихся точек тяги. Мягкой
   * посадки не будет — машина падает. Исход возможен только там, где подъём
   * делают сами движители: газовая оболочка держит корабль без всякого
   * управления и опускает его плавно при любом отказе.
   */
  | "tumble";

export type VehicleRecoveryPhase =
  | "escape"
  | "descent"
  | "landing"
  | "waiting"
  | "rebuilding"
  | "arrival"
  /**
   * ЛЕЖИТ, НО ЖИВА И ПРОБУЕТ ВСТАТЬ.
   *
   * Вердикт Igor (12.08.2026) на упавшего вверх пузом охотника: «прикол в том,
   * что охотник в безвыходное положение попал только в силу нашей логики.
   * Если бы он упал, но технически функционален и может реверсом подняться и
   * вернуться к заданию — он мог бы это сделать».
   *
   * Ошибка была не в числах, а в МОМЕНТЕ ВОПРОСА: исход рейса выбирался ОДИН
   * РАЗ, в миг отказа, когда машина кувыркалась и всё выглядело безнадёжно.
   * Эта фаза задаёт тот же вопрос ЗАНОВО — когда всё уже остановилось и видно,
   * что цело. Ответ часто другой.
   */
  | "righting"
  | "settled";

export const VEHICLE_REBUILD_DELAY_SECONDS = 30;
/**
 * Сколько машине дано на то, чтобы встать своим ходом. Не больше: попытка,
 * растянутая на полминуты, — это не самовосстановление, а лежание с
 * работающими двигателями, и подмену тогда лучше вызвать сразу.
 */
export const VEHICLE_RIGHTING_TIMEOUT_SECONDS = 8;
/**
 * Сколько машина обязана продержаться исправной в воздухе, прежде чем авария
 * будет признана миновавшей. Не мгновенно: отказ снимают по устойчивому
 * признаку, а не по одному удачному кадру — иначе состояние будет мигать на
 * каждом покачивании.
 */
export const VEHICLE_RECOVERY_HEALTHY_SECONDS = 4;
export const VEHICLE_LANDING_STABLE_SECONDS = 3;
/** A bounce is not enough to command a full emergency lift dump. */
export const VEHICLE_GROUND_CONTACT_CONFIRM_SECONDS = 0.4;

export interface VehicleGroundLiftAutomationState {
  readonly targetFraction: number;
  /** Lowest fraction that has not produced a growing tip on this landing. */
  readonly learnedMinimumFraction: number;
  readonly previousTilt: number;
  readonly recoveringFromTilt: boolean;
}

export interface VehicleGroundLiftAutomationObservation {
  readonly deltaSeconds: number;
  readonly contactConfirmed: boolean;
  readonly supportContacts: number;
  readonly groundSpeed: number;
  readonly pitch: number;
  readonly roll: number;
  readonly tiltAngularSpeed: number;
  readonly liftFraction: number;
  /** Feed-forward floor derived from support footprint and live mass centre. */
  readonly movingLiftFloor: number;
}

export function createVehicleGroundLiftAutomation(): VehicleGroundLiftAutomationState {
  return {
    targetFraction: 1,
    learnedMinimumFraction: 0,
    previousTilt: 0,
    recoveringFromTilt: false,
  };
}

/**
 * Ground-lift feedback never edits pose or velocity. It searches downward
 * with the valve, watches the resulting tip, and remembers the lowest lift
 * that kept this particular surviving carrier stable.
 */
export function advanceVehicleGroundLiftAutomation(
  current: VehicleGroundLiftAutomationState,
  observation: VehicleGroundLiftAutomationObservation,
): VehicleGroundLiftAutomationState {
  const delta = Math.max(0, observation.deltaSeconds);
  const tilt = Math.max(
    Math.abs(observation.pitch),
    Math.abs(observation.roll),
  );
  if (!observation.contactConfirmed) {
    return {
      ...current,
      targetFraction: 1,
      previousTilt: tilt,
      recoveringFromTilt: false,
    };
  }
  if (observation.supportContacts <= 0) {
    return { ...current, previousTilt: tilt };
  }

  const tiltGrowth = delta > 0 ? (tilt - current.previousTilt) / delta : 0;
  const authoredMovingFloor = Math.max(
    0,
    Math.min(1, observation.movingLiftFloor),
  );
  const unstable =
    tilt > 0.22 ||
    observation.tiltAngularSpeed > 0.16 ||
    (tilt > 0.06 && tiltGrowth > 0.015);
  if (current.recoveringFromTilt) {
    const recovered =
      observation.tiltAngularSpeed < 0.05 &&
      (tilt < 0.08 || tiltGrowth <= 0.002);
    if (!recovered) {
      return {
        ...current,
        targetFraction: 1,
        previousTilt: tilt,
      };
    }
  }
  // Do not blame the valve for the first landing impact. While still moving,
  // feedback starts learning only after actual lift reaches the geometric
  // feed-forward estimate. Once nearly stopped, every further reduction is
  // an intentional probe and can teach a higher floor.
  const valveReductionIsBeingTested =
    observation.groundSpeed > 0.25
      ? observation.liftFraction <= authoredMovingFloor + 0.08
      : observation.liftFraction <= current.targetFraction + 0.05;
  if (
    unstable &&
    valveReductionIsBeingTested &&
    observation.liftFraction < 0.96
  ) {
    const learnedMinimumFraction = Math.max(
      current.learnedMinimumFraction,
      Math.min(0.96, Math.max(0, observation.liftFraction - 0.03)),
    );
    return {
      // Full neutral lift is a real restoring force through the high lift
      // centre. Hold it until the measured tip has actually subsided; do not
      // ratchet the learned floor upward on every frame of the same event.
      targetFraction: 1,
      learnedMinimumFraction,
      previousTilt: tilt,
      recoveringFromTilt: true,
    };
  }

  const movingFloor = observation.groundSpeed > 0.25 ? authoredMovingFloor : 0;
  const floor = Math.max(current.learnedMinimumFraction, movingFloor);
  const searchRate = observation.groundSpeed > 0.25 ? 0.45 : 0.12;
  return {
    targetFraction: Math.max(
      floor,
      current.targetFraction - searchRate * delta,
    ),
    learnedMinimumFraction: current.learnedMinimumFraction,
    previousTilt: tilt,
    recoveringFromTilt: false,
  };
}

export function vehicleGroundLiftAutomationSettled(
  state: VehicleGroundLiftAutomationState,
  liftFraction: number,
): boolean {
  return (
    !state.recoveringFromTilt &&
    state.targetFraction <= state.learnedMinimumFraction + 0.01 &&
    Math.abs(liftFraction - state.targetFraction) <= 0.03
  );
}

export interface VehicleLandingStabilityState {
  readonly lastPosition: readonly [number, number, number];
  readonly lastOrientation: readonly [number, number, number, number];
  readonly stableSeconds: number;
  readonly landed: boolean;
}

export interface VehicleLandingStabilityObservation {
  readonly deltaSeconds: number;
  readonly supportContacts: number;
  readonly position: readonly [number, number, number];
  readonly orientation: readonly [number, number, number, number];
  readonly velocity: readonly [number, number, number];
  readonly angularVelocity: readonly [number, number, number];
}

export function createVehicleLandingStability(
  position: readonly [number, number, number],
  orientation: readonly [number, number, number, number],
): VehicleLandingStabilityState {
  return {
    lastPosition: [...position],
    lastOrientation: [...orientation],
    stableSeconds: 0,
    landed: false,
  };
}

/**
 * Grounding is a latched physical observation: support alone may be a bounce,
 * and a motionless hover is not a landing. Both must remain true long enough.
 */
export function advanceVehicleLandingStability(
  current: VehicleLandingStabilityState,
  observation: VehicleLandingStabilityObservation,
): VehicleLandingStabilityState {
  if (current.landed) {
    return current;
  }
  const delta = Math.max(0, observation.deltaSeconds);
  const positionDelta = Math.hypot(
    observation.position[0] - current.lastPosition[0],
    observation.position[1] - current.lastPosition[1],
    observation.position[2] - current.lastPosition[2],
  );
  const quaternionDot = Math.min(
    1,
    Math.abs(
      observation.orientation[0] * current.lastOrientation[0] +
        observation.orientation[1] * current.lastOrientation[1] +
        observation.orientation[2] * current.lastOrientation[2] +
        observation.orientation[3] * current.lastOrientation[3],
    ),
  );
  const orientationDelta = 2 * Math.acos(quaternionDot);
  const linearSpeed = Math.hypot(...observation.velocity);
  const angularSpeed = Math.hypot(...observation.angularVelocity);
  const stable =
    observation.supportContacts > 0 &&
    positionDelta <= 0.01 &&
    orientationDelta <= 0.015 &&
    linearSpeed <= 0.14 &&
    angularSpeed <= 0.035;
  const stableSeconds = stable ? current.stableSeconds + delta : 0;
  return {
    lastPosition: [...observation.position],
    lastOrientation: [...observation.orientation],
    stableSeconds,
    landed: stableSeconds >= VEHICLE_LANDING_STABLE_SECONDS,
  };
}

export interface VehicleRecoveryLifecycle {
  readonly reason: VehicleFailureReason;
  readonly disposition: VehicleFailureDisposition;
  readonly phase: VehicleRecoveryPhase;
  readonly phaseSeconds: number;
  /**
   * Попытка встать уже была. Одна на аварию: машина, которая раз не смогла,
   * не смогла и не сможет, а бесконечные попытки — это тот же вечный лежачий
   * борт, только с шумом.
   */
  readonly rightingAttempted?: boolean;
  /** Сколько машина уже держится исправной в воздухе, с. */
  readonly healthySeconds?: number;
}

export interface VehicleRecoveryObservation {
  readonly deltaSeconds: number;
  readonly escapeComplete: boolean;
  readonly belowFog: boolean;
  readonly landingComplete: boolean;
  readonly rebuildComplete: boolean;
  readonly arrivalComplete: boolean;
  /**
   * МАШИНА МОЖЕТ ЛЕТЕТЬ ОТСЮДА. Не «была исправна», а именно СЕЙЧАС: цела,
   * подъёма хватает на собственный вес, органы на месте. Спрашивается там,
   * где она уже лежит неподвижно, и потому отвечает про реальность, а не про
   * миг катастрофы.
   */
  readonly flightworthy?: boolean;
  /** Встала и оторвалась от грунта: попытка удалась. */
  readonly uprightAgain?: boolean;
  /**
   * МАШИНА В ВОЗДУХЕ И СНОВА ЦЕЛА. Не то же, что `flightworthy`: тот отвечает
   * «сможет ли», а этот — «летит и держится», то есть беда позади прямо сейчас.
   */
  readonly flyingWell?: boolean;
}

export interface VehicleRecoveryResult {
  readonly lifecycle: VehicleRecoveryLifecycle | null;
  readonly requestRebuild: boolean;
  readonly recovered: boolean;
}

/**
 * Успешный уход или самостоятельный подъём продолжают прежнее задание.
 * Только прибытие подменной машины завершает аварийный рейс целиком.
 */
export function recoveryKeepsFlightTask(phase: VehicleRecoveryPhase): boolean {
  return phase !== "arrival";
}

export interface VehicleRecoveryCapability {
  readonly structureFlightworthy: boolean;
  /** Maximum lift divided by current weight. Values above one can climb. */
  readonly liftToWeight: number;
  /** Fractions of commanded authority still attached to this carrier. */
  readonly requiredActuatorFractions: readonly number[];
  /**
   * Способность уцелевших ДВИЖИТЕЛЕЙ держать машину, если подъём делают они.
   * У плавучей машины поля нет: её держит газ, и вопрос не возникает.
   */
  readonly rotorLift?: "flying" | "sinking" | "tumbling";
}

export interface VehicleFailureObservation {
  /**
   * Доля заказанного отклонения позы, принятая в прошлом кадре. Пока машина
   * откликается, поза не объявляется отказом (см. `vehicleAttitudeCritical`).
   */
  readonly responding?: number;
  readonly deltaSeconds: number;
  readonly relativeAltitude: number;
  readonly pitch: number;
  readonly roll: number;
  /**
   * Машина исполняет объявленную маршрутом фигуру: поза ей ЗАДАНА. Абсолютный
   * угол в это время не значит ничего, судить можно только исполнение.
   */
  readonly executingFigure?: boolean;
  readonly headingError: number;
  /**
   * Курс машины задаётся её носом.
   *
   * Верно для корпуса, который умеет идти только туда, куда смотрит: у него
   * отвёрнутый нос и есть сход с линии. Машина с векторной тягой держит
   * линию телом, а нос ведёт отдельно — упреждая поворот или разглядывая
   * причал, — и мерить её сход по носу значит судить исправную машину за
   * то, ради чего эта тяга и сделана. Для таких машин поле выставляется в
   * false: сход считается по самой траектории, а нос остаётся наблюдением.
   */
  readonly courseFollowsNose?: boolean;
  /** Actual yaw rate minus the turn rate explicitly requested by autopilot. */
  readonly yawRateError: number;
  /**
   * Lateral error guidance can NOT remove in the distance left before the
   * stage has to be met, in metres. Raw distance from the line is not a
   * failure: a craft thirty metres off with half a circuit to fly is doing
   * fine, and the watchdog must not answer a question guidance already
   * answered better.
   */
  readonly crossTrackError: number;
  /**
   * Полуширина коридора УЧАСТКА, если трасса её объявила. Точность — свойство
   * траектории: городской пролёт судится метрами, открытый воздух — десятками.
   * Не задана — действует общий конверт.
   */
  readonly corridorLimit?: number;
  /** Vertical error that cannot be removed in that distance, in metres. */
  readonly altitudeError?: number;
  readonly progress: number;
  /**
   * False when the current controller has no route at all. Manual flight may
   * still use attitude and actuator supervision, but a synthetic progress
   * value must never feed the route-stall timers.
   */
  readonly routeProgressTracked?: boolean;
  /** False when a required control channel is physically inoperative. */
  readonly requiredControlAvailable: boolean;
  /**
   * False when the measured actuator response belongs to a different guidance
   * owner than the command fields in this observation. Comparing a combat
   * command delivered last frame with the authored route request of this frame
   * is not a control mismatch; it is two controllers speaking in turn.
   */
  readonly controlResponseTracked?: boolean;
  readonly requestedControlEffort: number;
  readonly deliveredControlFraction: number;
  /** Positive lift/ballonet command, independent of propulsive effort. */
  readonly requestedLiftEffort?: number;
  /** Reachable fraction of that lift command after envelope loss. */
  readonly deliveredLiftFraction?: number;
  readonly goArounds: number;
  /** Trajectory corrections attempted during this flight, of any kind. */
  readonly corrections?: number;
  /**
   * Every trim car is at a stop or gone and the hull still hangs outside the
   * corridor it must fly in. The machine has done everything it physically
   * can about its own balance.
   */
  readonly trimAuthorityExhausted?: boolean;
  /** Route progress may pause while the craft deliberately pivots in place. */
  readonly turning: boolean;
  /** The vehicle is deliberately completing a low-speed terminal manoeuvre. */
  readonly inFinalManeuver: boolean;
  /** Three-dimensional distance from the target base pose, in metres. */
  readonly dockingDistance?: number;
  /** Seconds without measurable docking progress allowed by the target base. */
  readonly dockingTimeoutSeconds?: number;
  /** Distance improvement that counts as fresh docking progress. */
  readonly dockingProgressMetres?: number;
  /** The vehicle has reached its landing pose and is expected to settle. */
  readonly inDockingCapture: boolean;
  readonly dockingComplete: boolean;
  /** A physically feasible stabilization manoeuvre currently owns the craft. */
  readonly recoveringDisturbance?: boolean;
  /**
   * ЧУЖОЕ ТЕЛО ФИЗИЧЕСКИ ДЕРЖИТ ЛЕТЯЩУЮ МАШИНУ.
   *
   * Пока держит, внутренние таймеры сторожа стоят: машина не слушается не
   * потому, что сломана. Взамен идёт СВОЙ срок (`entangledSeconds`), и
   * исчерпать его — отдельный отказ с отдельным именем.
   */
  readonly externallyHeld?: boolean;
}

export interface VehicleDisturbanceRecoveryInput {
  readonly pitch: number;
  readonly roll: number;
  readonly tiltAngularSpeed: number;
  readonly rightingAngularAcceleration: number;
  readonly liftToWeight: number;
  readonly requiredControlAvailable: boolean;
  readonly deliveredControlFraction: number;
  readonly relativeAltitude: number;
  readonly verticalSpeed: number;
  readonly minimumRelativeAltitude: number;
  readonly maximumRecoverySeconds?: number;
}

/**
 * Predicts whether the surviving craft can arrest its present disturbance.
 * Large attitude or altitude error is not itself a failure: the question is
 * whether attached lift/control authority can stop the measured motion before
 * inversion, the safety floor, or an unbounded recovery time.
 */
export function vehicleDisturbanceRecoveryFeasible(
  input: VehicleDisturbanceRecoveryInput,
): boolean {
  if (
    ![
      input.pitch,
      input.roll,
      input.tiltAngularSpeed,
      input.rightingAngularAcceleration,
      input.liftToWeight,
      input.deliveredControlFraction,
      input.relativeAltitude,
      input.verticalSpeed,
      input.minimumRelativeAltitude,
    ].every(Number.isFinite) ||
    !input.requiredControlAvailable ||
    input.deliveredControlFraction < 0.5 ||
    input.liftToWeight < 0.82
  ) {
    return false;
  }

  const tilt = Math.hypot(input.pitch, input.roll);
  const rightingAcceleration = Math.max(
    0.015,
    input.rightingAngularAcceleration,
  );
  const angularStopSeconds = input.tiltAngularSpeed / rightingAcceleration;
  const angularStopAngle =
    input.tiltAngularSpeed ** 2 / (2 * rightingAcceleration);
  const maximumRecoverySeconds = input.maximumRecoverySeconds ?? 30;
  if (
    tilt >= Math.PI * 0.47 ||
    tilt + angularStopAngle >= Math.PI * 0.49 ||
    angularStopSeconds > maximumRecoverySeconds
  ) {
    return false;
  }

  // A craft whose maximum lift is below its weight may still be level or
  // moving upward for an instant, but it cannot hold the stabilization mode.
  if (input.liftToWeight < 1) {
    return false;
  }
  if (input.verticalSpeed >= 0) {
    return true;
  }
  const upwardAcceleration = 9.81 * Math.max(0, input.liftToWeight - 1);
  if (upwardAcceleration <= 0.02) {
    return false;
  }
  const verticalStopDistance =
    input.verticalSpeed ** 2 / (2 * upwardAcceleration);
  return (
    input.relativeAltitude - verticalStopDistance >=
    input.minimumRelativeAltitude
  );
}

/**
 * Delivery feedback for the lift channel. Reducing lift is always reachable;
 * increasing it is capped by the surviving envelope's lift-to-weight ratio.
 */
export function deliveredLiftControlFraction(
  requestedTrim: number,
  liftTrimRange: number,
  liftToWeight: number,
): number {
  const requestedAuthority =
    Math.max(0, requestedTrim) * Math.max(0, liftTrimRange);
  if (requestedAuthority < 1e-6) {
    return 1;
  }
  const availableAuthority = Math.max(0, liftToWeight - 1);
  return Math.max(0, Math.min(1, availableAuthority / requestedAuthority));
}

/** Converts guidance's fraction-of-weight request to the normalized trim channel. */
export function normalizedLiftTrimRequest(
  requestedLiftFraction: number,
  liftTrimRange: number,
): number {
  if (liftTrimRange <= 1e-6) {
    return 0;
  }
  return Math.max(
    -1,
    Math.min(1, requestedLiftFraction / liftTrimRange),
  );
}

export interface VehicleFailureEnvelope {
  readonly minimumRelativeAltitude: number;
  readonly maximumPitch: number;
  readonly maximumRoll: number;
  readonly maximumHeadingError: number;
  readonly maximumYawRate: number;
  /** Unrecoverable lateral error that ends the flight, in metres. */
  readonly maximumCrossTrackError: number;
  /** Unrecoverable vertical error that ends the flight, in metres. */
  readonly maximumAltitudeError: number;
  readonly attitudeGraceSeconds: number;
  readonly routeGraceSeconds: number;
  readonly controlMismatchGraceSeconds: number;
  readonly stallGraceSeconds: number;
  readonly maneuverTimeoutSeconds: number;
  readonly finalManeuverTimeoutSeconds: number;
  readonly dockingTimeoutSeconds: number;
  readonly maximumGoArounds: number;
  /** Trajectory corrections a single flight may attempt before it is a loss. */
  readonly maximumCorrections: number;
  /**
   * Total time a flight may spend under correction with the ordinary route and
   * attitude timers suspended. A corrector that keeps re-entering must not be
   * able to starve the watchdog it is supposed to answer to.
   */
  readonly correctionGraceSeconds: number;
  /** How long a fully deployed trim may fail to hold the hull before it is a loss. */
  readonly trimGraceSeconds: number;
  /**
   * Сколько машине дано на то, чтобы выбраться из зацепа своим ходом.
   * Щедрее прочих сроков намеренно: высвобождение — это раскачка, у неё нет
   * монотонного прогресса, и снимать машину на первой неудачной попытке
   * значит отнимать у неё ровно тот манёвр, ради которого срок и заведён.
   */
  readonly entanglementGraceSeconds: number;
  readonly minimumProgressPerSecond: number;
}

/**
 * КОНВЕРТ ОТКАЗОВ ВЫВОДИТСЯ ИЗ ПАСПОРТА МАШИНЫ, А НЕ НАЗНАЧАЕТСЯ РЯДОМ С НИМ.
 *
 * Числа ниже писались, когда у всех винтокрылых стоял предел наклона 34°, и
 * `maximumPitch = 39.6°` был честным запасом над ним. Потом одной машине
 * подняли паспортный крен до 56° — и она получила разрешение лететь в позе,
 * которую сторож считает аварией. На живом полёте это вышло мгновенно:
 * `CRITICALATTITUDE` при 53.1° тангажа, когда все шесть приводов доставляли
 * ровно заказанное и отказа не было вовсе.
 *
 * Ошибка не в числе, а в том, что его пришлось помнить отдельно. Предел позы —
 * СЛЕДСТВИЕ разрешённого манёвра, и считать его должен тот же паспорт:
 * машине, которой велено ходить виражом в 56°, нельзя объявлять аварией 40°.
 *
 * Запас берётся множителем, а не прибавкой: манёвренная машина промахивается
 * пропорционально своему углу, а не на фиксированные градусы. Нижняя граница
 * сохраняет прежнее поведение всех машин, которые про наклон ничего не
 * объявляют, — плавучих и рельсовых.
 */
export function vehicleFailureEnvelopeFor(
  passport: {
    /** Паспортный предел наклона винтокрылой машины, рад. */
    readonly maximumTilt?: number;
    /**
     * Паспортный пол безопасной высоты, метры ОТНОСИТЕЛЬНО СТОЯНКИ.
     *
     * Высота тела машины считается смещением от её причальной позы, и
     * общий порог −20 молча предполагает причал у поверхности. Машина,
     * чей причал стоит на горе, штатно уходит на десятки метров НИЖЕ
     * стоянки — её пол задаёт рельеф мира: до уровня поверхности и чуть
     * ниже (вердикт Igor, 21.08.2026, Каллур).
     */
    readonly minimumRelativeAltitude?: number;
  },
  base: VehicleFailureEnvelope = DEFAULT_VEHICLE_FAILURE_ENVELOPE,
): VehicleFailureEnvelope {
  const floor = passport.minimumRelativeAltitude;
  const floored = floor === undefined
    ? base
    : { ...base, minimumRelativeAltitude: floor };
  const tilt = passport.maximumTilt;
  if (!tilt || tilt <= 0) {
    return floored;
  }
  // Треть сверх разрешённого: меньше — и обычный энергичный вираж считается
  // аварией, больше — и настоящее опрокидывание замечается слишком поздно.
  const ATTITUDE_MARGIN = 1.33;
  const limit = Math.min(Math.PI * 0.45, tilt * ATTITUDE_MARGIN);
  return {
    ...floored,
    maximumPitch: Math.max(floored.maximumPitch, limit),
    // Крен у винтокрылой машины — тот же наклон, только вокруг другой оси, и
    // в координированном вираже он ровно паспортный. Держать его строже
    // тангажа значит объявлять аварией штатный вираж.
    maximumRoll: Math.max(floored.maximumRoll, limit),
  };
}

export const DEFAULT_VEHICLE_FAILURE_ENVELOPE: VehicleFailureEnvelope = {
  minimumRelativeAltitude: -20,
  maximumPitch: Math.PI * 0.22,
  maximumRoll: Math.PI * 0.2,
  maximumHeadingError: Math.PI * 0.55,
  maximumYawRate: Math.PI * 0.16,
  maximumCrossTrackError: 28,
  maximumAltitudeError: 12,
  attitudeGraceSeconds: 3,
  routeGraceSeconds: 5,
  controlMismatchGraceSeconds: 2,
  stallGraceSeconds: 12,
  maneuverTimeoutSeconds: 45,
  finalManeuverTimeoutSeconds: 35,
  dockingTimeoutSeconds: 10,
  // Three missed approaches are allowed to become real go-arounds. The
  // third one trips the common recovery chain before a fourth circuit starts.
  maximumGoArounds: 3,
  // A flight that has needed six intercepts is not being disturbed, it is
  // failing to hold its route; the sixth attempt hands the craft to recovery.
  maximumCorrections: 6,
  correctionGraceSeconds: 60,
  // Long enough for the cars to reach their stops and for the hull to settle
  // on whatever balance the survivors give it.
  trimGraceSeconds: 6,
  entanglementGraceSeconds: 12,
  minimumProgressPerSecond: 0.00008,
};

export interface VehicleFailureWatchdogState {
  readonly attitudeSeconds: number;
  readonly routeSeconds: number;
  readonly controlMismatchSeconds: number;
  readonly stalledSeconds: number;
  readonly maneuverSeconds: number;
  readonly finalManeuverSeconds: number;
  readonly dockingSeconds: number;
  /** Best three-dimensional capture distance reached in this docking episode. */
  readonly bestDockingDistance: number | null;
  /** Time already spent under correction during this flight. */
  readonly correctionSeconds: number;
  /** How long trim has been exhausted without the hull coming back. */
  readonly trimSeconds: number;
  /** Сколько машина уже висит в чужом теле, не сумев освободиться. */
  readonly entangledSeconds: number;
  readonly previousProgress: number;
  /** Best distance reached during the present final manoeuvre. */
  readonly bestFinalManeuverDistance: number | null;
}

export interface VehicleFailureWatchdogResult {
  readonly state: VehicleFailureWatchdogState;
  readonly failure: VehicleFailureReason | null;
}

export function createVehicleFailureWatchdog(
  initialProgress = 0,
): VehicleFailureWatchdogState {
  return {
    attitudeSeconds: 0,
    routeSeconds: 0,
    controlMismatchSeconds: 0,
    stalledSeconds: 0,
    maneuverSeconds: 0,
    finalManeuverSeconds: 0,
    dockingSeconds: 0,
    bestDockingDistance: null,
    correctionSeconds: 0,
    trimSeconds: 0,
    entangledSeconds: 0,
    previousProgress: initialProgress,
    bestFinalManeuverDistance: null,
  };
}

/**
 * Rejoining the authored route moves the progress reference, and only that.
 * Recreating the watchdog here would let a craft that keeps leaving its line
 * clear every accumulated timer and every spent second of correction grace.
 */
export function rebaseVehicleFailureWatchdog(
  current: VehicleFailureWatchdogState,
  progress: number,
): VehicleFailureWatchdogState {
  return {
    ...current,
    previousProgress: progress,
    bestFinalManeuverDistance: null,
    bestDockingDistance: null,
  };
}

function heldSeconds(
  condition: boolean,
  current: number,
  delta: number,
): number {
  return condition ? current + Math.max(0, delta) : 0;
}

function observationIsFinite(observation: VehicleFailureObservation): boolean {
  return [
    observation.deltaSeconds,
    observation.relativeAltitude,
    observation.pitch,
    observation.roll,
    observation.headingError,
    observation.yawRateError,
    observation.crossTrackError,
    observation.altitudeError ?? 0,
    observation.progress,
    observation.requestedControlEffort,
    observation.deliveredControlFraction,
    observation.requestedLiftEffort ?? 0,
    observation.deliveredLiftFraction ?? 1,
    observation.dockingDistance ?? 0,
    observation.dockingTimeoutSeconds ?? 0,
    observation.dockingProgressMetres ?? 0,
  ].every(Number.isFinite);
}

/**
 * Доля принятого отклонения, ниже которой машину считают потерявшей позу.
 * Половина — тот же порог, которым живёт чувство тела боевого автомата
 * (`airCombatPosture`): ниже него машина уже не доворачивается, а только
 * держится за нынешний угол.
 */
export const ATTITUDE_RESPONSE_FLOOR = 0.5;

/**
 * КРИТИЧЕСКАЯ ПОЗА — ОДНО ПРАВИЛО, И ОНО ЖИВЁТ ЗДЕСЬ.
 *
 * Правило было переписано в стенде отдельной строкой, и это тот же дубль, что
 * уже стоил проекта одного молчаливого расхождения: тест проверял свою копию
 * условия и оставался зелёным, когда рантайм снимал машину. Здесь оно одно, и
 * все, кому нужно, вызывают его.
 *
 * СУДИТСЯ УПРАВЛЯЕМОСТЬ, А НЕ УГОЛ. Для машины, которой велено переворачиваться,
 * абсолютный тангаж не значит ничего: на петле он проходит все сто восемьдесят
 * градусов, и сторож честно снимал бы её каждый раз при исправных органах.
 * Пока поза ЗАДАНА фигурой, её исполнение проверяет сама фигура — у неё есть
 * поводок и срок; сторожу здесь судить нечего.
 *
 * РАССОГЛАСОВАНИЕ ТЕМПА РЫСКАНИЯ — признак ЗАКЛИНИВШЕГО канала, и потому
 * смотрится только на невращающейся машине. `acceptedYawRate` есть темп, к
 * которому приложенный момент машину разгоняет; разность с текущим темпом
 * равна самому моменту, делённому на инерцию, то есть велика ВСЕГДА, когда
 * машина энергично доворачивает. Живой замер: разворот носа на площадку при
 * тангаже и крене в 1.8°, уклонении 0.5 м и отклонении по высоте 1.4 м — и
 * `CRITICALATTITUDE` через три секунды. Тот же довод уже применён к таймеру
 * трассы ниже: просьба о повороте — намерение, а не движение.
 */
export function vehicleAttitudeCritical(
  observation: {
    readonly pitch: number;
    readonly roll: number;
    readonly yawRateError: number;
    readonly turning?: boolean;
    readonly executingFigure?: boolean;
    /**
     * МАШИНА ОТКЛИКАЕТСЯ НА УПРАВЛЕНИЕ — доля заказанного отклонения позы,
     * которую она приняла в прошлом кадре.
     *
     * Пока она откликается, ПОЗА НЕ ОТКАЗ, какой бы та ни была. Вердикт Igor
     * (12.08.2026): «машине реально плевать как ей летать — она робот. Если
     * перевернулась и упала — автомат выводит её из соответствующей позиции,
     * если органы управления исправны и откликаются манёвром. Если
     * перевернулась в воздухе — тоже так себе проблема».
     *
     * Строгой поза остаётся ровно там, где это физика, а не вкус: на взлёте и
     * посадке, и это проверяет не сторож, а допуски причаливания.
     */
    readonly responding?: number;
  },
  envelope: VehicleFailureEnvelope = DEFAULT_VEHICLE_FAILURE_ENVELOPE,
): boolean {
  if (observation.executingFigure === true) {
    return false;
  }
  // ОТКЛИКАЕТСЯ — ЗНАЧИТ ЛЕТИТ, А НЕ ПАДАЕТ. Перевёрнутая машина, принимающая
  // заказанное отклонение, занята манёвром; объявлять это отказом значит
  // отнимать у неё половину пространства поз без всякой причины.
  const responding = observation.responding ?? 0;
  if (
    responding < ATTITUDE_RESPONSE_FLOOR &&
    (Math.abs(observation.pitch) > envelope.maximumPitch ||
      Math.abs(observation.roll) > envelope.maximumRoll)
  ) {
    return true;
  }
  return (
    observation.turning !== true &&
    Math.abs(observation.yawRateError) > envelope.maximumYawRate
  );
}

export function advanceVehicleFailureWatchdog(
  current: VehicleFailureWatchdogState,
  observation: VehicleFailureObservation,
  envelope: VehicleFailureEnvelope = DEFAULT_VEHICLE_FAILURE_ENVELOPE,
): VehicleFailureWatchdogResult {
  if (!observationIsFinite(observation)) {
    return { state: current, failure: "invalidState" };
  }
  if (observation.relativeAltitude < envelope.minimumRelativeAltitude) {
    return { state: current, failure: "unsafeAltitude" };
  }
  if (observation.goArounds >= envelope.maximumGoArounds) {
    return { state: current, failure: "goAroundLimit" };
  }
  if ((observation.corrections ?? 0) >= envelope.maximumCorrections) {
    return { state: current, failure: "correctionLimit" };
  }

  const delta = Math.max(0, observation.deltaSeconds);
  // Correction is a legitimate departure from the authored line, so the route
  // and attitude timers stand down while it runs — but only for as long as
  // this flight's grace budget lasts. Beyond it the ordinary watchdog resumes
  // even though the corrector is still trying.
  const correcting = observation.recoveringDisturbance === true;
  // ПРИЧИНА СНАРУЖИ — ВНУТРЕННИЕ ТАЙМЕРЫ СТОЯТ.
  //
  // Зацепившаяся машина показывает разом все симптомы отказа: позу держать не
  // может, курс не держит, прогресса нет, заказанное отклонение не принимает.
  // Ни один из них не про машину. Сторож, вынесший здесь `controlMismatch`,
  // ставит неверный диагноз с уверенным видом — и это ровно тот случай,
  // который Igor разобрал на охотнике: «в безвыходное положение он попал
  // только в силу нашей логики».
  //
  // Взамен идёт СВОЙ срок. Он не бесконечен: машина, которую держат, обязана
  // выбраться, а не висеть вечно.
  const held = observation.externallyHeld === true;
  const entangledSeconds = heldSeconds(held, current.entangledSeconds, delta);
  const suspended =
    held ||
    (correcting && current.correctionSeconds < envelope.correctionGraceSeconds);
  const correctionSeconds = correcting
    ? current.correctionSeconds + delta
    : current.correctionSeconds;
  const attitudeSeconds = heldSeconds(
    !suspended && vehicleAttitudeCritical(observation, envelope),
    current.attitudeSeconds,
    delta,
  );
  const routeProgressTracked = observation.routeProgressTracked !== false;
  const routeSeconds = heldSeconds(
    !suspended &&
      routeProgressTracked &&
      !observation.turning &&
      ((observation.courseFollowsNose !== false &&
        Math.abs(observation.headingError) > envelope.maximumHeadingError) ||
        observation.crossTrackError >
          (observation.corridorLimit ?? envelope.maximumCrossTrackError) ||
        Math.abs(observation.altitudeError ?? 0) >
          envelope.maximumAltitudeError),
    current.routeSeconds,
    delta,
  );
  const controlMismatchSeconds = heldSeconds(
    !held &&
      observation.controlResponseTracked !== false &&
      (!observation.requiredControlAvailable ||
        (observation.requestedControlEffort > 0.35 &&
          observation.deliveredControlFraction < 0.5) ||
        ((observation.requestedLiftEffort ?? 0) > 0.35 &&
          (observation.deliveredLiftFraction ?? 1) < 0.5)),
    current.controlMismatchSeconds,
    delta,
  );
  const progressDelta = observation.progress - current.previousProgress;
  const stalledSeconds = heldSeconds(
    !suspended &&
      routeProgressTracked &&
      !observation.inFinalManeuver &&
      !observation.turning &&
      observation.requestedControlEffort > 0.5 &&
      progressDelta >= 0 &&
      progressDelta < envelope.minimumProgressPerSecond * delta,
    current.stalledSeconds,
    delta,
  );
  const maneuverSeconds = heldSeconds(
    !suspended &&
      routeProgressTracked &&
      observation.turning &&
      observation.requestedControlEffort > 0.35 &&
      progressDelta >= 0 &&
      progressDelta < envelope.minimumProgressPerSecond * delta,
    current.maneuverSeconds,
    delta,
  );
  // Trim exhaustion is never suspended by a correction: the corrector is what
  // asked the hull to level in the first place, and it cannot answer for a
  // balance the machine no longer has.
  const trimSeconds = heldSeconds(
    !held && observation.trimAuthorityExhausted === true,
    current.trimSeconds,
    delta,
  );
  const dockingActive =
    !suspended &&
    observation.inDockingCapture &&
    !observation.dockingComplete;
  const measuredDockingDistance = observation.dockingDistance;
  const dockingProgressMetres = Math.max(
    0,
    observation.dockingProgressMetres ?? 0.02,
  );
  const dockingImproved =
    dockingActive &&
    measuredDockingDistance !== undefined &&
    (current.bestDockingDistance === null ||
      measuredDockingDistance <= current.bestDockingDistance - dockingProgressMetres);
  // This is a STALL timer, not a total winch-time timer. A slow but visibly
  // converging physical capture is healthy; only a capture that stops making
  // measurable progress exhausts its base-owned allowance.
  const dockingSeconds = heldSeconds(
    dockingActive && !dockingImproved,
    current.dockingSeconds,
    delta,
  );
  const bestDockingDistance = !dockingActive
    ? null
    : measuredDockingDistance === undefined
      ? current.bestDockingDistance
      : current.bestDockingDistance === null || dockingImproved
        ? measuredDockingDistance
        : current.bestDockingDistance;
  const finalManeuverActive =
    !suspended &&
    observation.inFinalManeuver &&
    !observation.inDockingCapture &&
    !observation.dockingComplete;
  const finalManeuverImproved =
    finalManeuverActive &&
    measuredDockingDistance !== undefined &&
    (current.bestFinalManeuverDistance === null ||
      measuredDockingDistance <= current.bestFinalManeuverDistance - 0.02);
  const finalManeuverSeconds = heldSeconds(
    finalManeuverActive && !finalManeuverImproved,
    current.finalManeuverSeconds,
    delta,
  );
  const bestFinalManeuverDistance = !finalManeuverActive
    ? null
    : measuredDockingDistance === undefined
      ? current.bestFinalManeuverDistance
      : current.bestFinalManeuverDistance === null || finalManeuverImproved
        ? measuredDockingDistance
        : current.bestFinalManeuverDistance;
  const state: VehicleFailureWatchdogState = {
    attitudeSeconds,
    routeSeconds,
    controlMismatchSeconds,
    stalledSeconds,
    maneuverSeconds,
    finalManeuverSeconds,
    dockingSeconds,
    bestDockingDistance,
    correctionSeconds,
    trimSeconds,
    entangledSeconds,
    previousProgress: observation.progress,
    bestFinalManeuverDistance,
  };

  // ПОТЕРЯ ДИФФЕРЕНТОВКИ — НЕ ПРИГОВОР, А ОБСТОЯТЕЛЬСТВО.
  //
  // Грузило на рельсе выбито — двигать дифферент нечем, и это правда. Но
  // сам по себе этот факт рейса не отменяет: корабль остаётся в воздухе и
  // идёт дальше с тем креном, который у него получается. Приговор выносит
  // физика — критический угол в полёте или задетая платформа на посадке.
  // Не рухнул, значит долетел. Наблюдение сохраняется в состоянии и видно
  // в разборе отказа, приговором оно больше не является.
  const failure =
    attitudeSeconds >= envelope.attitudeGraceSeconds
      ? "criticalAttitude"
      : routeSeconds >= envelope.routeGraceSeconds
        ? "routeDivergence"
        : controlMismatchSeconds >= envelope.controlMismatchGraceSeconds
          ? "controlMismatch"
          : stalledSeconds >= envelope.stallGraceSeconds ||
              maneuverSeconds >= envelope.maneuverTimeoutSeconds
            ? "stalled"
            : dockingSeconds >=
                (observation.dockingTimeoutSeconds ?? envelope.dockingTimeoutSeconds) ||
                finalManeuverSeconds >= envelope.finalManeuverTimeoutSeconds
              ? "dockingTimeout"
              : // ПОСЛЕДНИМ В ЦЕПОЧКЕ НАМЕРЕННО. Пока машину держат снаружи,
                // все предыдущие ветви стоят, и добраться сюда можно только
                // одним способом: она не выбралась за отпущенный срок.
                entangledSeconds >= envelope.entanglementGraceSeconds
                ? "entangled"
                : null;
  return { state, failure };
}

export function vehicleFailureDisposition(
  capability: VehicleRecoveryCapability,
  overServiceArea: boolean,
): VehicleFailureDisposition {
  const actuatorsAvailable =
    capability.requiredActuatorFractions.length > 0 &&
    capability.requiredActuatorFractions.every((fraction) => fraction >= 0.5);
  // Винтокрылая машина, потерявшая удержание, не выбирает исход: её роняет
  // физика. Ни ухода, ни мягкой посадки — она падает там, где была.
  if (capability.rotorLift === "tumbling") {
    return "tumble";
  }
  const canFlyAway =
    capability.structureFlightworthy &&
    capability.liftToWeight >= 1.02 &&
    actuatorsAvailable &&
    capability.rotorLift !== "sinking";
  if (canFlyAway) {
    return "escapeRoute";
  }
  return overServiceArea ? "settleInPlace" : "descendBelowFog";
}

export function createVehicleRecoveryLifecycle(
  reason: VehicleFailureReason,
  disposition: VehicleFailureDisposition,
): VehicleRecoveryLifecycle {
  return {
    reason,
    disposition,
    phase:
      disposition === "escapeRoute"
        ? "escape"
        : disposition === "descendBelowFog"
          ? "descent"
          : "landing",
    phaseSeconds: 0,
  };
}

/**
 * Transport-neutral recovery sequence. Physics supplies completion facts;
 * this state machine only owns ordering and the off-screen rebuild delay.
 */
export function advanceVehicleRecoveryLifecycle(
  current: VehicleRecoveryLifecycle,
  observation: VehicleRecoveryObservation,
): VehicleRecoveryResult {
  const elapsed = current.phaseSeconds + Math.max(0, observation.deltaSeconds);
  if (current.phase === "righting") {
    // Встала и оторвалась — авария кончилась. Возврат к заданию, а не
    // подмена: машина цела, и ей есть чем лететь.
    if (observation.uprightAgain) {
      return { lifecycle: null, requestRebuild: false, recovered: true };
    }
    // Не встала за отпущенный срок — обычный порядок замены, без второй
    // попытки. Отсчёт до пересборки начинается с нуля: у неё был свой шанс.
    if (elapsed >= VEHICLE_RIGHTING_TIMEOUT_SECONDS) {
      return {
        lifecycle: {
          ...current,
          phase: "settled",
          phaseSeconds: 0,
          // Защёлка ставится и ЗДЕСЬ, а не только на входе в попытку. Иначе
          // инвариант «попытка одна» держится лишь на том, что в фазу попали
          // правильной дверью, — а `settled` увидит живую машину и пошлёт её
          // вставать снова, и так до конца мира, причём подмена не придёт
          // никогда.
          rightingAttempted: true,
        },
        requestRebuild: false,
        recovered: false,
      };
    }
    return {
      lifecycle: { ...current, phaseSeconds: elapsed },
      requestRebuild: false,
      recovered: false,
    };
  }
  if (current.phase === "settled") {
    // ЛЕЖИТ, НО ЖИВА — ПУСТЬ ВСТАНЁТ САМА.
    //
    // Вопрос задаётся здесь, а не в миг отказа, и в этом вся разница: тогда
    // машина кувыркалась, сейчас она лежит неподвижно, и видно, что цела.
    if (observation.flightworthy && !current.rightingAttempted) {
      return {
        lifecycle: {
          ...current,
          phase: "righting",
          phaseSeconds: 0,
          rightingAttempted: true,
        },
        requestRebuild: false,
        recovered: false,
      };
    }
    // СЕВШАЯ МАШИНА ТОЖЕ ВОЗВРАЩАЕТСЯ В СТРОЙ.
    //
    // Фаза была терминальной, и это читалось как поломка: разбитая машина
    // лежала на поле, и на замену ей не приходило ничего (наблюдение Igor,
    // 11.08.2026). Полигон после первой же аварии пустел навсегда.
    //
    // Ждёт она столько же, сколько ушедшая под мир: причина простоя разная, а
    // цена замены одна. Дальше — та же пересборка и то же прибытие с
    // горизонта, так что путь в строй у всех бед один.
    if (elapsed >= VEHICLE_REBUILD_DELAY_SECONDS) {
      return {
        lifecycle: { ...current, phase: "rebuilding", phaseSeconds: 0 },
        requestRebuild: true,
        recovered: false,
      };
    }
    return {
      lifecycle: { ...current, phaseSeconds: elapsed },
      requestRebuild: false,
      recovered: false,
    };
  }
  if (current.phase === "landing") {
    return observation.landingComplete
      ? {
          lifecycle: { ...current, phase: "settled", phaseSeconds: 0 },
          requestRebuild: false,
          recovered: false,
        }
      : {
          lifecycle: { ...current, phaseSeconds: elapsed },
          requestRebuild: false,
          recovered: false,
        };
  }
  // БЕДА МИНОВАЛА — ЗНАЧИТ БЕДЫ БОЛЬШЕ НЕТ.
  //
  // Вердикт Igor (12.08.2026): «RAX после восстановимого сбоя действительно
  // продолжает сражаться, но его состояние так и остаётся „сбой“. Он должен
  // возвращаться к заданию, если всё исправилось».
  //
  // Прежде выход из аварии был ровно один — доехать до конца её сценария и
  // быть заменённым. Машина, у которой отказ оказался мгновенным (задело,
  // качнуло, отпустило), всё равно списывалась. Тот же класс ошибки, что
  // «исход выбирается один раз, в миг катастрофы», только в воздухе.
  //
  // Признак устойчивый и судится только на УХОДЕ: там машина по построению
  // летит своим ходом. На спуске под туман и на посадке решение снижаться уже
  // принято, и отменять его на полпути значило бы метание.
  const healthySeconds =
    current.phase === "escape" && observation.flyingWell
      ? (current.healthySeconds ?? 0) + Math.max(0, observation.deltaSeconds)
      : 0;
  if (
    current.phase === "escape" &&
    healthySeconds >= VEHICLE_RECOVERY_HEALTHY_SECONDS
  ) {
    return { lifecycle: null, requestRebuild: false, recovered: true };
  }
  if (
    (current.phase === "escape" && observation.escapeComplete) ||
    (current.phase === "descent" && observation.belowFog)
  ) {
    return {
      lifecycle: { ...current, phase: "waiting", phaseSeconds: 0 },
      requestRebuild: false,
      recovered: false,
    };
  }
  if (current.phase === "waiting") {
    if (elapsed >= VEHICLE_REBUILD_DELAY_SECONDS) {
      return {
        lifecycle: { ...current, phase: "rebuilding", phaseSeconds: 0 },
        requestRebuild: true,
        recovered: false,
      };
    }
    return {
      lifecycle: { ...current, phaseSeconds: elapsed },
      requestRebuild: false,
      recovered: false,
    };
  }
  if (current.phase === "rebuilding" && observation.rebuildComplete) {
    return {
      lifecycle: { ...current, phase: "arrival", phaseSeconds: 0 },
      requestRebuild: false,
      recovered: false,
    };
  }
  if (current.phase === "arrival" && observation.arrivalComplete) {
    return { lifecycle: null, requestRebuild: false, recovered: true };
  }
  return {
    lifecycle: { ...current, phaseSeconds: elapsed, healthySeconds },
    requestRebuild: false,
    recovered: false,
  };
}
