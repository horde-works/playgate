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
  | "dockingTimeout";

/** One transport-neutral failure notification for HUDs, logs and dispatchers. */
export interface VehicleFailureEvent {
  readonly sourceId: string;
  readonly sourceLabel: string;
  readonly reason: VehicleFailureReason;
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
  | "settled";

export const VEHICLE_REBUILD_DELAY_SECONDS = 30;
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
}

export interface VehicleRecoveryObservation {
  readonly deltaSeconds: number;
  readonly escapeComplete: boolean;
  readonly belowFog: boolean;
  readonly landingComplete: boolean;
  readonly rebuildComplete: boolean;
  readonly arrivalComplete: boolean;
}

export interface VehicleRecoveryResult {
  readonly lifecycle: VehicleRecoveryLifecycle | null;
  readonly requestRebuild: boolean;
  readonly recovered: boolean;
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
  readonly deltaSeconds: number;
  readonly relativeAltitude: number;
  readonly pitch: number;
  readonly roll: number;
  readonly headingError: number;
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
  /** Vertical error that cannot be removed in that distance, in metres. */
  readonly altitudeError?: number;
  readonly progress: number;
  /** False when a required control channel is physically inoperative. */
  readonly requiredControlAvailable: boolean;
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
  /** Horizontal distance from the physical mooring capture, in metres. */
  readonly dockingDistance?: number;
  /** The vehicle has reached its landing pose and is expected to settle. */
  readonly inDockingCapture: boolean;
  readonly dockingComplete: boolean;
  /** A physically feasible stabilization manoeuvre currently owns the craft. */
  readonly recoveringDisturbance?: boolean;
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
  readonly minimumProgressPerSecond: number;
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
  /** Time already spent under correction during this flight. */
  readonly correctionSeconds: number;
  /** How long trim has been exhausted without the hull coming back. */
  readonly trimSeconds: number;
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
    correctionSeconds: 0,
    trimSeconds: 0,
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
  ].every(Number.isFinite);
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
  const suspended =
    correcting && current.correctionSeconds < envelope.correctionGraceSeconds;
  const correctionSeconds = correcting
    ? current.correctionSeconds + delta
    : current.correctionSeconds;
  const attitudeSeconds = heldSeconds(
    !suspended &&
      (Math.abs(observation.pitch) > envelope.maximumPitch ||
        Math.abs(observation.roll) > envelope.maximumRoll ||
        Math.abs(observation.yawRateError) > envelope.maximumYawRate),
    current.attitudeSeconds,
    delta,
  );
  const routeSeconds = heldSeconds(
    !suspended &&
      !observation.turning &&
      (Math.abs(observation.headingError) > envelope.maximumHeadingError ||
        observation.crossTrackError > envelope.maximumCrossTrackError ||
        Math.abs(observation.altitudeError ?? 0) >
          envelope.maximumAltitudeError),
    current.routeSeconds,
    delta,
  );
  const controlMismatchSeconds = heldSeconds(
    !observation.requiredControlAvailable ||
      (observation.requestedControlEffort > 0.35 &&
        observation.deliveredControlFraction < 0.5) ||
      ((observation.requestedLiftEffort ?? 0) > 0.35 &&
        (observation.deliveredLiftFraction ?? 1) < 0.5),
    current.controlMismatchSeconds,
    delta,
  );
  const progressDelta = observation.progress - current.previousProgress;
  const stalledSeconds = heldSeconds(
    !suspended &&
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
    observation.trimAuthorityExhausted === true,
    current.trimSeconds,
    delta,
  );
  const dockingSeconds = heldSeconds(
    !suspended &&
      observation.inDockingCapture &&
      !observation.dockingComplete,
    current.dockingSeconds,
    delta,
  );
  const finalManeuverActive =
    !suspended &&
    observation.inFinalManeuver &&
    !observation.inDockingCapture &&
    !observation.dockingComplete;
  const measuredDockingDistance = observation.dockingDistance;
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
    correctionSeconds,
    trimSeconds,
    previousProgress: observation.progress,
    bestFinalManeuverDistance,
  };

  const failure =
    attitudeSeconds >= envelope.attitudeGraceSeconds
      ? "criticalAttitude"
      : trimSeconds >= envelope.trimGraceSeconds
        ? "trimExhausted"
        : routeSeconds >= envelope.routeGraceSeconds
        ? "routeDivergence"
        : controlMismatchSeconds >= envelope.controlMismatchGraceSeconds
          ? "controlMismatch"
          : stalledSeconds >= envelope.stallGraceSeconds ||
              maneuverSeconds >= envelope.maneuverTimeoutSeconds
            ? "stalled"
            : dockingSeconds >= envelope.dockingTimeoutSeconds ||
                finalManeuverSeconds >= envelope.finalManeuverTimeoutSeconds
              ? "dockingTimeout"
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
  if (current.phase === "settled") {
    return { lifecycle: current, requestRebuild: false, recovered: false };
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
    lifecycle: { ...current, phaseSeconds: elapsed },
    requestRebuild: false,
    recovered: false,
  };
}
