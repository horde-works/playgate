import type { SceneVector3 } from "./destructionScene.ts";
import type { VehicleGuidanceDemand } from "./vehicleFrames.ts";
import type { VehicleRoutePlan } from "./skyTrainRoutes.ts";

export const ROTORCRAFT_PILOT_SAFE_ALTITUDE = 24;
export const ROTORCRAFT_PILOT_FORWARD_SPEED = 12;
export const ROTORCRAFT_PILOT_REVERSE_SPEED = 8;
export const ROTORCRAFT_PILOT_LATERAL_SPEED = 8;
export const ROTORCRAFT_PILOT_YAW_RATE = 0.9;
export const ROTORCRAFT_PILOT_ALTITUDE_RATE = 4;

/**
 * СКОЛЬКО МАШИНА ОБЯЗАНА ПРОСТОЯТЬ РОВНО, ПРЕЖДЕ ЧЕМ ПОСАДКА СЧИТАЕТСЯ ЦЕЛОЙ.
 *
 * Порог принадлежит КОНТУРУ ПОСАДКИ, а не приборам: он решает, принять ли
 * команду разоружения. Приборная доска берёт его же
 * (`rotorcraftPilotStatus.ts`), чтобы лампа «готов к посадке» и готовность
 * самой машины были ОДНИМ утверждением. Прежде число стояло двумя литералами
 * в двух файлах, и равенство между ними не держалось ничем: понизь одно — и
 * лампа начнёт врать ровно в тот момент, когда на неё смотрят.
 */
export const LANDING_READY_SECONDS = 0.45;

export type RotorcraftPilotMode =
  | "manual"
  | "safeClimb"
  | "returnClimb"
  | "return";

export interface RotorcraftPilotState {
  readonly mode: RotorcraftPilotMode;
  /** Relative to the authored pad/berth height, in metres. */
  readonly targetAltitude: number;
  /** Latched only by an explicit upward/automatic command. */
  readonly takeoffAuthorized: boolean;
  /** Pilot-selected proximity braking. Sensing and presentation share it. */
  readonly sensorAssistEnabled: boolean;
  /** Continuous stable support contact while an intentional landing is held. */
  readonly landingStableSeconds: number;
  readonly returnPlan: VehicleRoutePlan | null;
}

export interface RotorcraftPilotInput {
  /** Positive means forward. */
  readonly forwardAxis: number;
  /** Positive means turn/translate right. */
  readonly horizontalAxis: number;
  /** Shift changes the arrows from drive/yaw to vertical/lateral translation. */
  readonly translationModifier: boolean;
  /** Wheel contribution accumulated since the previous physical step. */
  readonly altitudeDelta: number;
  readonly brake: boolean;
  readonly requestSafeClimb: boolean;
  readonly requestReturn: boolean;
  readonly requestToggleSensors: boolean;
  /** A fresh Shift+back key-down; holding the descent key never disarms. */
  readonly requestDisarm: boolean;
}

/** One-shot DOM input waiting for the next physical pilot step. */
export interface RotorcraftPilotCommandBuffer {
  altitudeDelta: number;
  requestSafeClimb: boolean;
  requestReturn: boolean;
  requestToggleSensors: boolean;
  requestDisarm: boolean;
  recenterView: boolean;
}

export function createRotorcraftPilotCommandBuffer(): RotorcraftPilotCommandBuffer {
  return {
    altitudeDelta: 0,
    requestSafeClimb: false,
    requestReturn: false,
    requestToggleSensors: false,
    requestDisarm: false,
    recenterView: false,
  };
}

/**
 * Atomically drains one-shot input. A command pressed while another controller
 * owns the craft is either handled in that same step or deliberately ignored;
 * it can never surprise the pilot after a later manual takeover.
 */
export function consumeRotorcraftPilotCommands(
  buffer: RotorcraftPilotCommandBuffer,
): RotorcraftPilotCommandBuffer {
  const commands = { ...buffer };
  Object.assign(buffer, createRotorcraftPilotCommandBuffer());
  return commands;
}

export interface RotorcraftPilotNavigation {
  readonly relativeAltitude: number;
  readonly verticalSpeed: number;
  readonly grounded?: boolean;
  readonly groundSpeed?: number;
  readonly uprightCos?: number;
  readonly angularSpeed?: number;
  readonly deltaSeconds: number;
  readonly liftTrimRange: number;
  readonly safeAltitude?: number;
}

export function createRotorcraftPilotState(
  relativeAltitude: number,
  grounded = false,
): RotorcraftPilotState {
  return {
    mode: "manual",
    // ВСЕГДА от текущей высоты. «Стоим — значит ноль» было верно только на
    // родном паде: машина, принятая пилотом на крыше, с нулевой заданной
    // высотой после первой же команды вверх прижимала коллектив вниз и
    // вжималась в опору, пока набор не перерастал высоту крыши.
    targetAltitude: Math.max(0, relativeAltitude),
    takeoffAuthorized: !grounded,
    sensorAssistEnabled: false,
    landingStableSeconds: 0,
    returnPlan: null,
  };
}

export function rotorcraftPilotHasManualInput(
  input: RotorcraftPilotInput,
): boolean {
  return (
    Math.abs(input.forwardAxis) > 1e-6 ||
    Math.abs(input.horizontalAxis) > 1e-6 ||
    Math.abs(input.altitudeDelta) > 1e-6 ||
    input.brake
  );
}

export function rotorcraftPilotNeedsFlightSupervision(
  pilot: RotorcraftPilotState,
  castOff: boolean,
  grounded: boolean,
): boolean {
  return castOff && !(grounded && pilot.landingStableSeconds > 0);
}

/**
 * Turns digital keys and the altitude wheel into the same neutral guidance
 * contract consumed by the route autopilot. The pilot owns guidance; the
 * rotorcraft controller still owns attitude, mixer and motor stabilization.
 */
export function advanceRotorcraftPilot(
  previous: RotorcraftPilotState,
  input: RotorcraftPilotInput,
  navigation: RotorcraftPilotNavigation,
): {
  readonly state: RotorcraftPilotState;
  readonly guidance: VehicleGuidanceDemand;
  readonly readyToBuildReturn: boolean;
  readonly disarmRequested: boolean;
} {
  const safeAltitude =
    navigation.safeAltitude ?? ROTORCRAFT_PILOT_SAFE_ALTITUDE;
  const manualInput = rotorcraftPilotHasManualInput(input);
  const upwardManualCommand =
    input.altitudeDelta > 1e-6 ||
    (input.translationModifier && input.forwardAxis > 1e-6);
  const takeoffRequested =
    upwardManualCommand || input.requestSafeClimb || input.requestReturn;
  let mode = previous.mode;
  let returnPlan = previous.returnPlan;
  let targetAltitude = previous.targetAltitude;
  let takeoffAuthorized = previous.takeoffAuthorized;
  const sensorAssistEnabled = input.requestToggleSensors
    ? !previous.sensorAssistEnabled
    : previous.sensorAssistEnabled;

  if (input.requestReturn) {
    mode = "returnClimb";
    returnPlan = null;
    targetAltitude = Math.max(targetAltitude, safeAltitude);
  } else if (
    (mode === "return" || mode === "returnClimb") &&
    manualInput
  ) {
    // A deliberate pilot command always retakes the craft. Holding the last
    // route command after cancellation would make that promise false.
    mode = "manual";
    returnPlan = null;
    targetAltitude = navigation.relativeAltitude;
  } else if (input.requestSafeClimb && mode !== "return") {
    mode = "safeClimb";
    targetAltitude = Math.max(targetAltitude, safeAltitude);
  }

  const manualVertical =
    input.translationModifier && Math.abs(input.forwardAxis) > 1e-6;
  if (mode !== "return" && mode !== "returnClimb") {
    if (input.brake) {
      mode = "manual";
      targetAltitude = navigation.relativeAltitude;
    } else if (manualVertical || Math.abs(input.altitudeDelta) > 1e-6) {
      mode = "manual";
      targetAltitude +=
        input.altitudeDelta +
        (manualVertical
          ? input.forwardAxis *
            ROTORCRAFT_PILOT_ALTITUDE_RATE *
            navigation.deltaSeconds
          : 0);
    }
  }
  targetAltitude = Math.max(0, targetAltitude);
  if (takeoffRequested) {
    takeoffAuthorized = true;
  }
  // Authorization is a flight-lifecycle latch, not an airborne sensor. Once
  // the pilot has started the rotors it remains true until explicit disarm.
  // Clearing it on touchdown made a real take-off/landing cycle
  // indistinguishable from an untouched craft sitting on its original pad,
  // so the stable-landing timer could never complete.
  const landingIntent =
    navigation.grounded === true &&
    targetAltitude <= navigation.relativeAltitude + 0.15;
  const landingStable =
    landingIntent &&
    takeoffAuthorized &&
    (navigation.groundSpeed ?? 0) <= 0.35 &&
    (navigation.uprightCos ?? 1) >= Math.cos((12 * Math.PI) / 180) &&
    (navigation.angularSpeed ?? 0) <= 0.28;
  const landingStableSeconds = landingStable
    ? previous.landingStableSeconds + navigation.deltaSeconds
    : 0;
  const disarmRequested =
    input.requestDisarm && landingStableSeconds >= LANDING_READY_SECONDS;

  // Zero collective means hover in the rotorcraft controller. On any physical
  // support that would unload the gear and make contact flicker. Put real
  // weight on the supports both before take-off and after an intentional
  // landing; the latter must work on a roof as well as on the authored pad.
  const holdingOnGround =
    mode === "manual" &&
    (!takeoffAuthorized || landingIntent);

  const altitudeError = targetAltitude - navigation.relativeAltitude;
  const wantedVerticalAcceleration = Math.max(
    -2.4,
    Math.min(3.2, altitudeError * 1.15 - navigation.verticalSpeed * 1.35),
  );
  const liftFraction = holdingOnGround
    ? -navigation.liftTrimRange
    : Math.max(
        -navigation.liftTrimRange,
        Math.min(
          navigation.liftTrimRange,
          wantedVerticalAcceleration / 9.81,
        ),
      );

  const automaticReturn = mode === "return" || mode === "returnClimb";
  const controlsNeutral = automaticReturn || input.brake || holdingOnGround;
  const forwardAxis = controlsNeutral || input.translationModifier
    ? 0
    : Math.max(-1, Math.min(1, input.forwardAxis));
  const horizontalAxis = controlsNeutral
    ? 0
    : Math.max(-1, Math.min(1, input.horizontalAxis));
  const guidance: VehicleGuidanceDemand = {
    forwardSpeed:
      forwardAxis >= 0
        ? forwardAxis * ROTORCRAFT_PILOT_FORWARD_SPEED
        : forwardAxis * ROTORCRAFT_PILOT_REVERSE_SPEED,
    lateralSpeed: input.translationModifier
      ? horizontalAxis * ROTORCRAFT_PILOT_LATERAL_SPEED
      : 0,
    // Positive world-Y rotation is counter-clockwise from above, while the
    // right arrow promises the ordinary clockwise/right turn.
    yawRate: input.translationModifier || Math.abs(horizontalAxis) < 1e-6
      ? 0
      : -horizontalAxis * ROTORCRAFT_PILOT_YAW_RATE,
    liftFraction,
  };

  const climbSettled =
    Math.abs(targetAltitude - navigation.relativeAltitude) < 0.8 &&
    Math.abs(navigation.verticalSpeed) < 0.5;
  if (mode === "safeClimb" && climbSettled) {
    mode = "manual";
  }

  return {
    state: {
      mode,
      targetAltitude,
      takeoffAuthorized,
      sensorAssistEnabled,
      landingStableSeconds,
      returnPlan,
    },
    guidance,
    readyToBuildReturn: mode === "returnClimb" && climbSettled,
    disarmRequested,
  };
}

/** Direct safe-height return followed by the ordinary vertical-arrival law. */
export function createRotorcraftPilotReturnPlan(
  start: SceneVector3,
  berth: SceneVector3,
  safeAltitude = ROTORCRAFT_PILOT_SAFE_ALTITUDE,
): VehicleRoutePlan {
  // Returning from a roof or a manually climbed position never starts by
  // descending into the city. The current height is already a valid shelf.
  const safeY = Math.max(berth[1] + safeAltitude, start[1]);
  const dx = berth[0] - start[0];
  const dz = berth[2] - start[2];
  const horizontal = Math.max(0.1, Math.hypot(dx, dz));
  // Route progress is deliberately a horizontal projection. Encoding the
  // descent as a same-X/Z route segment makes every point on it identical to
  // that projection and progress stalls forever. As with the authored town
  // circuit, the last horizontal metre arms `verticalArrival`; once the pad
  // is captured the altitude requirement becomes the berth itself.
  const finalLeg = Math.min(1, horizontal * 0.25);
  const finalFrom = Math.max(0, 1 - finalLeg / horizontal);
  const length = horizontal;
  const clamp01 = (value: number): number =>
    value <= 0 ? 0 : value >= 1 ? 1 : value;

  const point = (progress: number): SceneVector3 => {
    const p = clamp01(progress);
    return [
      start[0] + dx * p,
      p >= finalFrom ? berth[1] : safeY,
      start[2] + dz * p,
    ];
  };

  return {
    id: `town-hexacopter:pilot-return:${start[0].toFixed(1)}:${start[2].toFixed(1)}`,
    length,
    finalFrom,
    point,
    speedLimit(progress) {
      const remaining = Math.max(0, horizontal * (1 - progress));
      return Math.min(9, Math.max(0.8, Math.sqrt(2 * 0.75 * remaining)));
    },
    altitude(progress) {
      return point(progress)[1];
    },
    verticalArrival: {
      altitude: safeY,
      from: finalFrom,
      horizontalTolerance: 0.9,
    },
    guidanceLookahead: () => Math.min(18, Math.max(8, horizontal * 0.35)),
  };
}
