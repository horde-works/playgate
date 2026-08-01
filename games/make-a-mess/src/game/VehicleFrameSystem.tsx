"use client";

import { useKeyboardControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import {
  useBeforePhysicsStep,
  useRapier,
  type RapierRigidBody,
} from "@react-three/rapier";
import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  Euler,
  InstancedBufferAttribute,
  InstancedMesh,
  NormalBlending,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  Vector3,
} from "three";
import {
  departureSignalColor,
  structuralMaterialProfiles,
  type BreakablePieceDefinition,
  type LampEventState,
} from "./destructionScene";
import { setSignalGlassGlow } from "./materialTextures";
import { VEHICLE_CONTACT_QUERY } from "./physicsInteractionGroups";
import {
  RESTING_BODY,
  applyImpulseAtPoint,
  bodyPointVelocity,
  massProperties,
  pointEffectiveMass,
  principalMassProperties,
  rebaseBodyMassProperties,
  rotateVector as rotateByQuaternion,
  type BodyState,
  type MassProperties,
} from "./clusterDynamics";
import {
  RESTING_POSE,
  departureLightGlow,
  engineValuesPortToStarboard,
  advanceDrivePhase,
  advanceVehicleRouteProgress,
  autopilot,
  shipForces,
  isDockingSettleWindow,
  isDockingComplete,
  hullDrag,
  isMooringCaptureEligible,
  isRestingPose,
  mooringForce,
  multiplyQuaternions,
  oarStrokePose,
  allocateAutopilotEngineCommands,
  rejoinVehicleRouteProgress,
  shipLocalPoint,
  vehicleAttitude,
  vehicleMooringState,
  vehiclePiecePosition,
  vehicleProximitySensorEnabled,
  vehicleRouteHeading,
  vehicleRouteAltitudeTarget,
  vehicleVerticalArrivalCaptured,
  vehicleRotation,
  vehicleSpoolCommand,
  type VehicleRoutePlan,
  type VehiclePose,
  type ApproachGate,
  type VehicleGuidanceDemand,
  type ShipModel,
} from "./vehicleFrames";
import {
  DEFAULT_VEHICLE_LIFT_RESERVE,
  airVehicleFlightEventState,
  airVehicles,
  type AirVehicleDefinition,
} from "./airVehicles";
import {
  SKY_TRAIN_DRIVER_SEAT,
  TOWN_HEXACOPTER_PILOT_SEAT,
  TOWN_HEXACOPTER_PILOT_SEAT_ID,
  passengerSeatContextAction,
  passengerSeatIsIntact,
} from "./passengerSeats";
import { CompoundKinematicClusterBodies } from "./CompoundKinematicClusterBodies";
import {
  compoundCarrierOwnsMemberPose,
  PHYSICS_TIME_STEP,
  queueCompoundKinematicImpulse,
  type CompoundKinematicClusterRegistry,
  type CompoundKinematicImpulse,
  type CompoundKinematicImpulseRegistry,
} from "./compoundKinematicCluster";
import {
  entryInteractionMatches,
  type EntryInteractionTarget,
} from "./entryInteraction";
import {
  isInterIslandArrivalKind,
  isInterIslandTransferKind,
} from "./interIslandRoutes.ts";
import {
  carrierVector,
  vectorFromCarrier,
  type InterIslandPassengerHandoff,
  type InterIslandPassengerTransit,
} from "./interIslandPassenger.ts";
import type {
  MotionTelemetryImpact,
  MotionTelemetryMetric,
  MotionTelemetryUpdate,
} from "./motionTelemetry";
import { motionTelemetryAvailable } from "./motionTelemetry";
import { createVehicleImpactTelemetry } from "./vehicleImpactTelemetry";
import { runtimeDiagnosticsEnabled } from "./runtimeDiagnostics";
import { countUpwardSupportContacts } from "./vehiclePhysicalContact";
import {
  compileCommandActuators,
  deliveredCommandValue,
  executeCommandActuators,
  type CommandActuatorBinding,
} from "./vehicleActuation";
import {
  isRotorLandingComplete,
  liftApplicationPoint,
  liftHoldVerdict,
  rotorLiftState,
  type RotorLiftState,
} from "./vehicleLiftGeometry.ts";
import {
  advanceRotorMotorOutput,
  NEUTRAL_ROTORCRAFT_TRIM,
  rotorcraftCommandsExecute,
  rotorcraftFlightStep,
  type RotorcraftAuthority,
  type RotorcraftTrimState,
} from "./rotorcraftDynamics.ts";
import {
  advanceRotorcraftPilot,
  consumeRotorcraftPilotCommands,
  createRotorcraftPilotCommandBuffer,
  createRotorcraftPilotReturnPlan,
  createRotorcraftPilotState,
  rotorcraftPilotNeedsFlightSupervision,
  ROTORCRAFT_PILOT_SAFE_ALTITUDE,
  type RotorcraftPilotState,
} from "./rotorcraftPilot.ts";
import {
  resolveVehicleContact,
  type ContactMaterialProfile,
  type VehicleContactBody,
  type VehicleContactDamageRequest,
} from "./vehicleContactDamage.ts";
import type { CompoundClusterContact } from "./CompoundKinematicClusterBodies";
import {
  propulsionHealth,
  updatePropulsionFeedback,
} from "./vehiclePropulsionAutomation";
import {
  propulsionFlightClearance,
  supervisedFailureEnvelope,
} from "./vehicleFlightSupervisor";
import {
  constrainRotorcraftGuidance,
  safetyInterventionForMode,
  vehicleSafetyAdvisory,
  vehicleSafetySensingSuppressed,
  type VehicleObstacleReading,
  type VehicleObstacleSample,
  type VehicleSafetyAdvisory,
} from "./vehicleSafetyAutomation";
import {
  vehicleGuidanceEnvelope,
  type VehicleGuidanceEnvelope,
} from "./vehicleGuidanceEnvelope";
import {
  advanceVehicleTrimRail,
  createVehicleTrimRailState,
  isVehicleTrimChannel,
  vehicleTrimAuthorityExhausted,
  vehicleTrimCarPosition,
  type VehicleTrimRailState,
} from "./vehicleTrimAutomation";
import {
  assessVehicleTrajectory,
  planVehicleTrajectoryCorrection,
  requestedVehicleTrajectoryMode,
  vehicleTrajectoryMergeReady,
  vehicleCorrectionAllowanceSeconds,
  vehicleTrajectoryStabilizationPlan,
  vehicleUnrecoverableDeviation,
  vehicleUpsetSettled,
  type VehicleTrajectoryCorrectionPlan,
  type VehicleTrajectoryDeviationReason,
} from "./vehicleTrajectoryCorrection";
import {
  advanceVehicleGroundLiftAutomation,
  advanceVehicleLandingStability,
  advanceVehicleFailureWatchdog,
  advanceVehicleRecoveryLifecycle,
  createVehicleGroundLiftAutomation,
  createVehicleLandingStability,
  createVehicleFailureWatchdog,
  createVehicleRecoveryLifecycle,
  DEFAULT_VEHICLE_FAILURE_ENVELOPE,
  deliveredLiftControlFraction,
  normalizedLiftTrimRequest,
  rebaseVehicleFailureWatchdog,
  VEHICLE_GROUND_CONTACT_CONFIRM_SECONDS,
  vehicleGroundLiftAutomationSettled,
  vehicleDisturbanceRecoveryFeasible,
  vehicleFailureDisposition,
  type VehicleFailureDisposition,
  type VehicleFailureWatchdogState,
  type VehicleFailureEvent,
  type VehicleGroundLiftAutomationState,
  type VehicleLandingStabilityState,
  type VehicleRecoveryLifecycle,
} from "./vehicleFailure";

/** An intercept is flown for at least this long before anything may take it. */
const INTERCEPT_COMMITMENT = 4;
/** Continuous seconds of settled rates that end a hold. */
const UPSET_SETTLE_SECONDS = 0.6;
/** An escape that gains no route progress for this long is not an escape. */
const ESCAPE_STALL_SECONDS = 18;
/** Кто отправляет рейс: пока единственный кадр, у которого есть расписание. */
const SCHEDULED_FRAME = "sky-train";
type ScheduledInteraction = "board" | "ride" | "seat" | "stand";
type PilotControlName =
  | "forward"
  | "backward"
  | "left"
  | "right"
  | "run"
  | "jump";

/** Тяжесть. Плотности в движке свои, но она одна для всех. */
const GRAVITY = 9.81;

/** Предельный наклон винтокрылой машины, если паспорт молчит. */
const DEFAULT_ROTOR_TILT = (30 * Math.PI) / 180;
/** Наибольшая угловая скорость рыскания по полному рулю, рад/с. */
const ROTOR_YAW_RATE = 0.9;
/** Spinning visibly while leaving more than four fifths of the weight on gear. */
const ROTOR_GROUND_IDLE_THROTTLE = 0.04;
/** Ниже этой скорости сближения удар не рассматривается вовсе. */
const CONTACT_MINIMUM_CLOSING_SPEED = 0.35;

/**
 * Насколько машина может отстоять от авторской стоянки, чтобы пост площадки
 * всё ещё считал её «домашней». Покрывает разброс штатной парковки после
 * рейса; машина, заглушенная пилотом на крыше, в него заведомо не попадает.
 */
const DEPARTURE_HOME_RADIUS = 6;

/**
 * ВИНТЫ ВМЕСТО ОБОЛОЧКИ И БОКОВЫХ МОТОРОВ.
 *
 * Переходник между общим guidance и винтовой моделью. Слои выше не меняются:
 * маршрут остаётся требованием, автопилот просит скорость, подъём и темп
 * рыскания. Здесь собственный каскад коптера переводит их в наклон и моменты,
 * mixer — в шесть throttle-команд, актуаторы — в доставленную команду, а
 * инерционные моторы — в реальные силы.
 *
 * У дирижабля две независимых силы: моторы толкают вбок, оболочка держит вес,
 * и поза корпуса — их побочный результат. У коптера горизонтальной силы нет
 * вовсе. Он умеет ровно одно — наклониться и подставить под себя винты.
 * Корабельных органов здесь нет: горизонтальная сила появляется только после
 * наклона общей оси винтов, а рыскание — из реактивного момента встречных пар.
 */
function rotorcraftFlightForces(
  frame: VehicleFrameRuntime,
  state: FrameState,
  mass: MassProperties,
  centre: readonly [number, number, number],
  liftCommand: number,
  guidance: VehicleGuidanceDemand | null,
  availability: readonly number[],
  attachedMembers: ReadonlySet<string>,
  enabled: boolean,
  step: number,
): {
  readonly forces: readonly {
    readonly force: [number, number, number];
    readonly point: [number, number, number];
  }[];
} | null {
  const limits = frame.flight.limits;
  const points = limits.enginePoints;
  if (points.length === 0) {
    return null;
  }
  const trim = state.rotorTrim ?? NEUTRAL_ROTORCRAFT_TRIM;
  const flightStep = rotorcraftFlightStep(
    {
      points,
      centreOfMass: mass.centre,
      nose: frame.nose,
      mass: mass.mass,
      inertia: [mass.inertia[0], mass.inertia[4], mass.inertia[8]],
      availability: points.map((_, index) => availability[index] ?? 1),
      motorOutput: points.map((_, index) => state.rotorMotorOutput[index] ?? 0),
      liftCapacity: mass.mass * GRAVITY * (frame.flight.liftReserve ?? 1.35),
      maximumTilt: frame.flight.maximumTilt ?? DEFAULT_ROTOR_TILT,
    },
    {
      orientation: state.body.orientation,
      centre,
      velocity: state.body.velocity,
      angularVelocity: state.body.angularVelocity,
    },
    {
      forwardSpeed: guidance?.forwardSpeed ?? 0,
      lateralSpeed: guidance?.lateralSpeed ?? 0,
      yawRate: guidance?.yawRate ?? 0,
      collective:
        state.flight?.pilot && !state.flight.castOff
          ? -limits.liftTrimRange
          : (guidance?.liftFraction ?? liftCommand * limits.liftTrimRange),
    },
    trim,
    step,
    ROTOR_YAW_RATE,
  );
  const pilotGroundIdle = Boolean(state.flight?.pilot && !state.flight.castOff);
  const requestedThrottle = enabled
    ? pilotGroundIdle
      ? points.map(() => ROTOR_GROUND_IDLE_THROTTLE)
      : [...flightStep.result.commandedThrottle]
    : points.map(() => 0);
  const actuation = executeCommandActuators(
    frame.actuators,
    attachedMembers,
    Object.fromEntries(
      requestedThrottle.map((value, index) => [`throttle:${index}`, value]),
    ),
  );
  const deliveredTargets = requestedThrottle.map((value, index) =>
    deliveredCommandValue(actuation, `throttle:${index}`, value),
  );
  const runUpFraction =
    state.flight && !state.flight.castOff
      ? Math.max(
          0,
          Math.min(1, state.flight.time / Math.max(0.001, frame.flight.spoolSeconds)),
        )
      : 1;
  state.rotorMotorOutput = points.map((_, index) =>
    advanceRotorMotorOutput(
      state.rotorMotorOutput[index] ?? 0,
      (deliveredTargets[index] ?? 0) * runUpFraction,
      step,
      frame.flight.spoolSeconds,
    ),
  );
  // The adaptive balance term may learn only from a freely responding craft.
  // During run-up the gear/mast answers the attitude error while motor output
  // is deliberately attenuated; integrating that error stores a false moment
  // which is released all at once on lift-off (classic controller wind-up).
  const trimMayLearn =
    enabled &&
    state.supportContacts === 0 &&
    (state.flight?.castOff ?? false);
  state.rotorTrim = !enabled
    ? NEUTRAL_ROTORCRAFT_TRIM
    : trimMayLearn
      ? flightStep.trim
      : trim;
  state.rotorAuthority = enabled ? flightStep.result.authority : null;
  state.rotorAcceptedYawRate = enabled
    ? flightStep.result.acceptedYawRate
    : null;
  state.rotorYawRateLimits = enabled
    ? flightStep.result.yawRateLimits
    : null;

  for (let engine = 0; engine < state.spinAngles.length; engine += 1) {
    state.spinAngles[engine] = advanceDrivePhase(
      state.spinAngles[engine] ?? 0,
      frame.flight.driveAnimation.phaseSpeed,
      state.rotorMotorOutput[engine] ?? 0,
      step,
    );
  }
  if (state.flight) {
    state.flight.driveThrottle = requestedThrottle;
    state.flight.throttle = [...state.rotorMotorOutput];
    state.flight.propulsionFeedback = updatePropulsionFeedback(
      state.flight.propulsionFeedback,
      actuation,
      points.length,
    );
  }
  return {
    forces: flightStep.forces.map((entry) => ({
      force: [entry.force[0], entry.force[1], entry.force[2]] as [
        number,
        number,
        number,
      ],
      point: [entry.point[0], entry.point[1], entry.point[2]] as [
        number,
        number,
        number,
      ],
    })),
  };
}

/**
 * Успокоение свободно висящего корабля. Гасит качку и снос, но не «в ноль»
 * мгновенно: маятник должен быть виден.
 */
// Сопротивление среды подобрано по машине: при полной тяге установившаяся
// скорость выходит около 14 м/с, то есть чуть выше маршрутной. Раньше здесь
// стояло вчетверо больше, и корабль просто не мог разогнаться до задания.
/**
 * Мягкая швартовка: корабль у причала не должен уплывать за смену. Держит
 * только по горизонтали — цепь тянет, но не подпирает, поэтому потерявший
 * подъём корабль спокойно садится на путь.
 */
const RECOVERY_LANDING_DESCENT_SPEED = -0.8;
const RECOVERY_LANDING_VERTICAL_RESPONSE = 0.8;
// Full-speed forward flight needs roughly 32 m after sensing latency with the
// rotorcraft's weakest intact horizontal axis. Range must exceed that claim.
const OBSTACLE_SENSOR_RANGE = 42;
const OBSTACLE_ESCAPE_CLEARANCE = 8;
/**
 * Высота, ниже которой маршрут считается ИДУЩИМ ПО ЗЕМЛЕ и контакт опор с ней
 * штатен. Взлётный и посадочный участки любой машины требуют нуля, поэтому
 * порог отделяет их от настоящего полёта, а не назначает допуск.
 */
const ROUTE_GROUND_ALTITUDE = 1.5;

const densityOf = (material: BreakablePieceDefinition["material"]): number =>
  structuralMaterialProfiles[material].density;

/**
 * Чей это винт. Считаем по ближайшей точке приложения тяги из паспорта: ось
 * винта и есть мотор, и сопоставление не сломается, если гондолу подвинут
 * или переименуют.
 */
function engineIndexOf(
  hub: readonly [number, number, number] | undefined,
  enginePoints: readonly (readonly [number, number, number])[],
): number {
  if (!hub) {
    return 0;
  }
  let best = 0;
  let bestDistance = Infinity;
  enginePoints.forEach((point, index) => {
    const distance =
      (point[0] - hub[0]) ** 2 +
      (point[1] - hub[1]) ** 2 +
      (point[2] - hub[2]) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  });
  return best;
}

/** Лопасть винта: `…:engine:<сторона>:blade:<номер>`. */
function bladePropeller(pieceId: string): string | null {
  const match = pieceId.match(/^(.*:engine:-?\d+):blade:/);
  return match ? match[1] : null;
}

function driveUsesPropulsionFeedback(
  drive: AirVehicleDefinition["flight"]["driveAnimation"],
): boolean {
  return drive.kind === "propeller" || drive.kind === "furnace";
}

interface OarMemberIdentity {
  readonly key: string;
  readonly side: -1 | 1;
  readonly index: number;
  readonly blade: boolean;
}

/** Articulated oar member: `…:oar:<side>:<station>[:blade]:piece`. */
function oarMemberIdentity(pieceId: string): OarMemberIdentity | null {
  const match = pieceId.match(/^(.*):oar:(-1|1):(\d+)(:blade)?:piece$/);
  if (!match) {
    return null;
  }
  const side = Number(match[2]) as -1 | 1;
  const index = Number(match[3]);
  return {
    key: `${match[1]}:oar:${side}:${index}`,
    side,
    index,
    blade: Boolean(match[4]),
  };
}

/** Physical fulcrum authored between the two thole pins. */
function oarlockIdentity(pieceId: string): string | null {
  const match = pieceId.match(/^(.*):oarlock:(-1|1):(\d+):pivot:piece$/);
  return match ? `${match[1]}:oar:${match[2]}:${match[3]}` : null;
}

interface OarStrokeBinding {
  readonly pivot: readonly [number, number, number];
  readonly side: -1 | 1;
  readonly phaseOffset: number;
  readonly blade: boolean;
}

const WORLD_UP_AXIS = new Vector3(0, 1, 0);
const OAR_LOCAL_SHAFT_AXIS = new Vector3(0, 1, 0);

interface FrameMember {
  readonly piece: BreakablePieceDefinition;
  /** Собственный покой куска: поворот кадра накладывается ПОВЕРХ него. */
  readonly baseQuaternion: Quaternion;
  /** Ось винта, вокруг которой этот кусок вращается сверх позы кадра. */
  readonly spinHub: readonly [number, number, number] | null;
  /** Index into the frame's trim rails when this piece is a travelling car. */
  readonly trimRailIndex: number | null;
  /** Чей это винт: индекс мотора в паспорте машины, чью тягу он показывает. */
  readonly engineIndex: number;
  /** Oar and blade rotate together around the physical inboard oarlock. */
  readonly oarStroke: OarStrokeBinding | null;
}

interface VehicleFrameRuntime extends AirVehicleDefinition {
  readonly actuators: readonly CommandActuatorBinding[];
  readonly members: readonly FrameMember[];
  /** Conservative local bounds used while own debris clears the hull. */
  readonly localBounds: {
    readonly minimum: readonly [number, number, number];
    readonly maximum: readonly [number, number, number];
  };
}


/**
 * Может ли уцелевший набор движителей ещё держать ЭТУ машину.
 *
 * Вопрос имеет смысл только там, где подъём делают сами движители. Для
 * плавучей машины возвращается null, и всё выше по течению работает ровно
 * так, как работало до появления винтокрылой.
 */
function rotorHoldState(
  frame: VehicleFrameRuntime,
  intactMass: number,
  mass: MassProperties,
  fractions: readonly number[],
): RotorLiftState | null {
  if ((frame.flight.liftSource ?? "buoyant") !== "rotor") {
    return null;
  }
  const points = frame.flight.limits.enginePoints;
  const capacity =
    (intactMass *
      GRAVITY *
      (frame.flight.liftReserve ?? DEFAULT_VEHICLE_LIFT_RESERVE)) /
    Math.max(1, points.length);
  return rotorLiftState(
    liftHoldVerdict(
      "rotor",
      points.map((point, index) => ({
        point,
        available: fractions[index] ?? 0,
      })),
      mass.centre as [number, number, number],
      capacity,
      mass.mass * GRAVITY,
    ),
  );
}

/** Поза подвижного кадра для внешних систем вроде общего пула света. */
export interface VehicleFramePoseState {
  readonly clusterId: string;
  readonly origin: readonly [number, number, number];
  readonly nose: readonly [number, number, number];
  readonly pose: VehiclePose;
  /** Motion belongs to the carrier, so occupied places can release naturally. */
  readonly linearVelocity: readonly [number, number, number];
  readonly angularVelocity: readonly [number, number, number];
  readonly centreOfMass: readonly [number, number, number];
}

/** Ход рейса: null — стоим у причала. */
interface FlightState {
  kind: string;
  /** How this flight was called; route kind alone does not imply occupancy. */
  occupancy: "uncrewed" | "passenger";
  /** Present only when a seated pilot, rather than a route, owns guidance. */
  pilot: RotorcraftPilotState | null;
  time: number;
  castOff: boolean;
  /** Доля пройденного маршрута: её двигает сам корабль, а не таймер. */
  progress: number;
  /** Фактически доставленная тяга каждого мотора после потерь actuator-а. */
  throttle: readonly number[];
  /** Signed shaft command автопилота; по ней же крутится видимый винт. */
  driveThrottle: readonly number[];
  /** Оценка доступной тяги, выученная по паре «запрос → исполнение». */
  propulsionFeedback: readonly number[];
  /** Sensor report; only the autopilot may turn it into control requests. */
  safetyAdvisory: VehicleSafetyAdvisory | null;
  /** Full proximity field is retained only for an occupied manual cockpit. */
  pilotObstacleReadings: readonly VehicleObstacleReading[];
  readonly pilotIntervenedSensors: Set<number>;
  /** Когда последний раз уходили на второй круг: решение принимается один раз. */
  lastGoAround: number;
  /** Счётчик для диагностики реального рейса. */
  goArounds: number;
  /** Every trajectory correction this flight has attempted, of any kind. */
  corrections: number;
  watchdog: VehicleFailureWatchdogState;
  /** A confirmed off-berth support contact owns propulsion shutdown. */
  unexpectedGroundContactSeconds: number;
  /**
   * Non-null while the one autopilot is in stabilizing or intercepting mode.
   * The mode has explicit entry, dwell and route-capture exit criteria.
   */
  trajectoryCorrection: {
    phase: "stabilizing" | "intercepting";
    reason: VehicleTrajectoryDeviationReason;
    sourceProgress: number;
    elapsedSeconds: number;
    stableSeconds: number;
    correction: VehicleTrajectoryCorrectionPlan | null;
    correctionProgress: number;
    goAroundCounted: boolean;
    /** Time this episode is allowed, derived from the plan it must fly. */
    allowanceSeconds: number;
  } | null;
  /** Boundary handoff is emitted once while the page transition catches up. */
  handoffRequested: boolean;
}

interface FrameRecoveryState {
  lifecycle: VehicleRecoveryLifecycle;
  progress: number;
  escapePlan: VehicleRoutePlan | null;
  arrivalInitialized: boolean;
  landingStability: VehicleLandingStabilityState;
  /** Seconds the escape has spent without gaining route progress. */
  escapeStallSeconds: number;
  /** Best escape progress reached so far. */
  escapeBestProgress: number;
  /** Continuous underside contact awaiting lift-dump confirmation. */
  groundContactSeconds: number;
  /** Confirmed underside contact has opened the emergency lift-dump valve. */
  groundContactLatched: boolean;
  /** Closed-loop valve search for this carrier's lowest stable ground lift. */
  groundLiftAutomation: VehicleGroundLiftAutomationState;
}

/** Всё изменяемое живёт в ref — как состояние створок в системе дверей. */
interface FrameState {
  pose: VehiclePose;
  previousPose: VehiclePose;
  /** Скорость кадра, м/с: её наследуют куски, отломанные в движении. */
  velocity: readonly [number, number, number];
  moving: boolean;
  suppressFrameVelocityOnce: boolean;
  released: Set<string>;
  /** Once a fragment clears the old hull it becomes an ordinary obstacle. */
  separated: Set<string>;
  /** Where each trim car stands on its rail, in metres from zero. */
  trim: VehicleTrimRailState[];
  /** Previous attitude sample; trim rates are measured, not assumed. */
  trimAttitude: { readonly pitch: number; readonly roll: number } | null;
  /**
   * Накопленный перекос винтокрылой машины, рад/с². Живёт между кадрами:
   * это ответ на «какой момент приходится держать постоянно, чтобы стоять
   * ровно» — криво положенный груз, выбитое кольцо. Плавучим машинам не
   * нужен и остаётся null.
   */
  rotorTrim: RotorcraftTrimState | null;
  /** Actual per-motor output after actuator delivery and spool inertia. */
  rotorMotorOutput: number[];
  /** Previous physical step, consumed by the common failure watchdog. */
  rotorAuthority: RotorcraftAuthority | null;
  /** Command the bounded rotor allocator actually accepted last step. */
  rotorAcceptedYawRate: number | null;
  /** Directional yaw envelope reported to the common autopilot. */
  rotorYawRateLimits: {
    readonly minimum: number;
    readonly maximum: number;
  } | null;
  /** Car positions the present mass model was built from. */
  trimMassPositions: number[];
  /** True while the car and its drive are still carried by this carrier. */
  trimAvailable: boolean[];
  /** Trim is at its stops and the hull still hangs outside its corridor. */
  trimExhaustedSeconds: number;
  /** Deviation model derived once from this machine's passport. */
  guidance: VehicleGuidanceEnvelope | null;
  /** Passport the cached corridor was derived from. */
  guidanceSource: ApproachGate | null;
  /** Latest measured weapon impulse; automation never writes this channel. */
  telemetryImpact: MotionTelemetryImpact | null;
  /**
   * Текущая подъёмная сила. Она НЕ константа: автоматика ведёт её к весу
   * ТОГО, ЧТО ОСТАЛОСЬ, и делает это инерционно — стравить газ и сбросить
   * балласт мгновенно нельзя. Потеряв вагон, корабль всплывёт, но не улетит
   * в космос: через несколько секунд подъём подстроится под новый вес.
   */
  liftNow: number;
  /**
   * Угол каждого винта отдельно: моторы работают вразнос — на развороте
   * внешний прибавляет, внутренний сбрасывает, — и видно это должно быть по
   * винтам, а не только по траектории.
   */
  spinAngles: number[];
  flight: FlightState | null;
  recovery: FrameRecoveryState | null;
  /** Number of upward-facing physical contact manifolds last step. */
  supportContacts: number;
  /** Свободное тело: им корабль живёт, пока не летит по маршруту. */
  body: BodyState;
  mass: MassProperties | null;
  /** Масса и подъём целого корабля: целым он нейтрально плавуч. */
  intactMass: number;
  intactEnvelope: number;
  /**
   * Точка приложения подъёма, ОТБАЛАНСИРОВАННАЯ по целому кораблю: по
   * горизонтали она совпадает с его центром масс, по высоте берётся с оси
   * оболочки. Это и есть «развесить балласт»: целый корабль висит ровно, а
   * любое повреждение сдвигает центр масс и само даёт дифферент.
   */
  trimCentre: readonly [number, number, number] | null;
  brokenSeen: number;
  /** Уцелевшие члены кадра; пересчитываются только со сменой brokenSeen. */
  aliveMembers: readonly FrameMember[];
  /** Сколько кусков оболочки уцелело — кэш от aliveMembers. */
  envelopeLeft: number;
}

function readCarrierBody(
  frame: VehicleFrameRuntime,
  mass: MassProperties,
  body: RapierRigidBody,
): Pick<FrameState, "body" | "pose"> {
  const translation = body.translation();
  const rotation = body.rotation();
  const centre = body.worldCom();
  const linear = body.linvel();
  const angular = body.angvel();
  const orientation = [
    rotation.x,
    rotation.y,
    rotation.z,
    rotation.w,
  ] as const;
  return {
    body: {
      position: [
        centre.x - mass.centre[0],
        centre.y - mass.centre[1],
        centre.z - mass.centre[2],
      ],
      orientation,
      velocity: [linear.x, linear.y, linear.z],
      angularVelocity: [angular.x, angular.y, angular.z],
    },
    pose: {
      position: [
        translation.x - frame.origin[0],
        translation.y - frame.origin[1],
        translation.z - frame.origin[2],
      ],
      yaw: 0,
      pitch: 0,
      roll: 0,
      rotation: orientation,
    },
  };
}

/** Explicit scene transitions may place a body; ordinary flight never does. */
function placeCarrierBody(
  frame: VehicleFrameRuntime,
  mass: MassProperties,
  state: BodyState,
  body: RapierRigidBody,
): void {
  const localCentre: [number, number, number] = [
    mass.centre[0] - frame.origin[0],
    mass.centre[1] - frame.origin[1],
    mass.centre[2] - frame.origin[2],
  ];
  const turnedCentre = rotateByQuaternion(state.orientation, localCentre);
  body.setTranslation(
    {
      x: mass.centre[0] + state.position[0] - turnedCentre[0],
      y: mass.centre[1] + state.position[1] - turnedCentre[1],
      z: mass.centre[2] + state.position[2] - turnedCentre[2],
    },
    true,
  );
  body.setRotation(
    {
      x: state.orientation[0],
      y: state.orientation[1],
      z: state.orientation[2],
      w: state.orientation[3],
    },
    true,
  );
  body.setLinvel(
    { x: state.velocity[0], y: state.velocity[1], z: state.velocity[2] },
    true,
  );
  body.setAngvel(
    {
      x: state.angularVelocity[0],
      y: state.angularVelocity[1],
      z: state.angularVelocity[2],
    },
    true,
  );
}

interface ExhaustParticle {
  age: number;
  life: number;
  power: number;
  readonly position: Vector3;
  readonly velocity: Vector3;
  seed: number;
}

// Full fire deliberately saturates the trail: each furnace can keep several
// seconds of overlapping smoke alive without recycling the nearest puffs.
const EXHAUST_PARTICLES_PER_SOURCE = 256;

/** Detached soft puffs using the same camera-facing smoke shader as hearths. */
function VehicleExhaustSmoke({
  frames,
  states,
  inactivePieces,
}: {
  frames: readonly VehicleFrameRuntime[];
  states: { current: Map<string, FrameState> };
  inactivePieces: ReadonlySet<string>;
}) {
  const meshRef = useRef<InstancedMesh>(null);
  const sources = useMemo(
    () =>
      frames.flatMap((frame) =>
        (frame.flight.exhaust?.sources ?? []).map((source) => ({
          frame,
          profile: frame.flight.exhaust!,
          source,
        })),
      ),
    [frames],
  );
  const total = sources.length * EXHAUST_PARTICLES_PER_SOURCE;
  // Buffers and their geometry must exist in the render that exposes a
  // non-zero instance count. Initialising them in a passive effect left one
  // legal render frame where useFrame saw the mesh but getAttribute() still
  // returned undefined (especially under Strict Mode and hot reload).
  const geometry = useMemo(() => {
    const created = new PlaneGeometry(1, 1);
    created.setAttribute(
      "aSource",
      new InstancedBufferAttribute(new Float32Array(total * 3), 3),
    );
    for (const name of ["aLife", "aSize", "aPower", "aSeed"] as const) {
      created.setAttribute(
        name,
        new InstancedBufferAttribute(new Float32Array(total), 1),
      );
    }
    return created;
  }, [total]);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: NormalBlending,
        vertexShader: /* glsl */ `
      attribute vec3 aSource;
      attribute float aLife;
      attribute float aSize;
      attribute float aPower;
      attribute float aSeed;
      varying vec2 vQuad;
      varying float vLife;
      varying float vPower;
      varying float vSeed;
      void main() {
        vQuad = position.xy;
        vLife = aLife;
        vPower = aPower;
        vSeed = aSeed;
        vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 camUp = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        vec3 world = aSource +
          camRight * position.x * aSize * 1.18 +
          camUp * position.y * aSize;
        gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
      }
    `,
        fragmentShader: /* glsl */ `
      precision mediump float;
      varying vec2 vQuad;
      varying float vLife;
      varying float vPower;
      varying float vSeed;
      void main() {
        float angle = atan(vQuad.y, vQuad.x);
        float softNoise = 1.0 + 0.075 * sin(
          angle * 5.0 + vSeed * 6.2832
        );
        float d = length(vQuad * 2.0) * softNoise;
        float alpha = smoothstep(1.0, 0.12, d);
        alpha *= smoothstep(0.0, 0.07, vLife) * smoothstep(1.0, 0.52, vLife);
        alpha *= mix(0.28, 0.74, vPower);
        vec3 smoke = mix(
          vec3(0.075, 0.08, 0.085),
          vec3(0.235, 0.24, 0.245),
          smoothstep(0.12, 1.0, vLife)
        );
        gl_FragColor = vec4(smoke, alpha);
      }
    `,
      }),
    [],
  );
  const particles = useRef<ExhaustParticle[]>(
    Array.from({ length: total }, () => ({
      age: Number.POSITIVE_INFINITY,
      life: 1,
      power: 0,
      position: new Vector3(),
      velocity: new Vector3(),
      seed: 0,
    })),
  );
  const accumulators = useRef(new Float32Array(sources.length));
  const cursors = useRef(new Uint16Array(sources.length));
  const serials = useRef(new Uint32Array(sources.length));
  const sourceValues = useRef(
    (geometry.getAttribute("aSource") as InstancedBufferAttribute)
      .array as Float32Array,
  );
  const lifeValues = useRef(
    (geometry.getAttribute("aLife") as InstancedBufferAttribute)
      .array as Float32Array,
  );
  const sizeValues = useRef(
    (geometry.getAttribute("aSize") as InstancedBufferAttribute)
      .array as Float32Array,
  );
  const powerValues = useRef(
    (geometry.getAttribute("aPower") as InstancedBufferAttribute)
      .array as Float32Array,
  );
  const seedValues = useRef(
    (geometry.getAttribute("aSeed") as InstancedBufferAttribute)
      .array as Float32Array,
  );

  useFrame((_, frameDelta) => {
    const mesh = meshRef.current;
    if (!mesh || total === 0) {
      return;
    }
    const delta = Math.min(0.05, frameDelta);
    for (const [sourceIndex, authored] of sources.entries()) {
      const state = states.current.get(authored.frame.id);
      if (!state || inactivePieces.has(authored.source.outletPieceId)) {
        continue;
      }
      const power = state.flight
        ? Math.abs(state.flight.throttle[authored.source.engineIndex] ?? 0)
        : state.recovery
          ? 0
          : 0.035;
      const rate =
        authored.profile.idleRate +
        (authored.profile.fullRate - authored.profile.idleRate) *
          Math.pow(Math.min(1, power), 1.35);
      accumulators.current[sourceIndex] += rate * delta;
      while (accumulators.current[sourceIndex] >= 1) {
        accumulators.current[sourceIndex] -= 1;
        const localIndex =
          cursors.current[sourceIndex] % EXHAUST_PARTICLES_PER_SOURCE;
        cursors.current[sourceIndex] = localIndex + 1;
        const particle =
          particles.current[
            sourceIndex * EXHAUST_PARTICLES_PER_SOURCE + localIndex
          ];
        const serial = serials.current[sourceIndex]++;
        const seed =
          (((Math.sin(serial * 19.19 + sourceIndex * 7.31) * 43758.5) % 1) +
            1) %
          1;
        const seedB =
          (((Math.sin(serial * 43.17 + sourceIndex * 3.7) * 28641.3) % 1) + 1) %
          1;
        const carrierRotation = vehicleRotation(
          state.pose,
          authored.frame.nose,
        );
        const emitter = vehiclePiecePosition(
          authored.frame.origin,
          authored.source.point,
          state.pose,
          carrierRotation,
        );
        const direction = rotateByQuaternion(
          state.body.orientation,
          authored.source.direction,
        );
        particle.position.set(emitter[0], emitter[1], emitter[2]);
        particle.velocity.set(
          state.body.velocity[0] +
            direction[0] * authored.profile.exitSpeed * (0.65 + power * 0.65) +
            (seed - 0.5) * authored.profile.spread,
          state.body.velocity[1] + 0.38 + seedB * 0.42,
          state.body.velocity[2] +
            direction[2] * authored.profile.exitSpeed * (0.65 + power * 0.65) +
            (seedB - 0.5) * authored.profile.spread,
        );
        particle.age = 0;
        particle.life = authored.profile.lifeSeconds * (0.82 + seed * 0.34);
        particle.power = power;
        particle.seed = seed;
      }
    }

    for (const [index, particle] of particles.current.entries()) {
      particle.age += delta;
      if (particle.age >= particle.life) {
        sizeValues.current[index] = 0;
        continue;
      }
      const life = particle.age / particle.life;
      particle.velocity.x *= Math.exp(-0.18 * delta);
      particle.velocity.z *= Math.exp(-0.18 * delta);
      particle.velocity.y += 0.22 * delta;
      particle.position.addScaledVector(particle.velocity, delta);
      const size =
        0.3 + particle.power * 0.38 + life * (1.35 + particle.power * 1.65);
      sourceValues.current[index * 3] = particle.position.x;
      sourceValues.current[index * 3 + 1] = particle.position.y;
      sourceValues.current[index * 3 + 2] = particle.position.z;
      lifeValues.current[index] = life;
      sizeValues.current[index] = size;
      powerValues.current[index] = particle.power;
      seedValues.current[index] = particle.seed;
    }
    for (const name of [
      "aSource",
      "aLife",
      "aSize",
      "aPower",
      "aSeed",
    ] as const) {
      // Attributes are installed in the same render that creates geometry;
      // unlike the former passive-effect setup, this lookup cannot race.
      const attribute = geometry.getAttribute(name) as InstancedBufferAttribute;
      attribute.needsUpdate = true;
    }
  });

  if (total === 0) {
    return null;
  }
  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, total]}
      frustumCulled={false}
    />
  );
}

function restingState(engineCount: number): FrameState {
  return {
    pose: RESTING_POSE,
    previousPose: RESTING_POSE,
    velocity: [0, 0, 0],
    moving: false,
    suppressFrameVelocityOnce: false,
    released: new Set<string>(),
    separated: new Set<string>(),
    trim: [],
    trimAttitude: null,
    rotorTrim: null,
    rotorMotorOutput: Array.from({ length: engineCount }, () => 0),
    rotorAuthority: null,
    rotorAcceptedYawRate: null,
    rotorYawRateLimits: null,
    trimMassPositions: [],
    trimAvailable: [],
    trimExhaustedSeconds: 0,
    guidance: null,
    guidanceSource: null,
    telemetryImpact: null,
    liftNow: 0,
    spinAngles: Array.from({ length: engineCount }, () => 0),
    flight: null,
    recovery: null,
    supportContacts: 0,
    body: RESTING_BODY,
    mass: null,
    intactMass: 0,
    intactEnvelope: 0,
    trimCentre: null,
    brokenSeen: -1,
    aliveMembers: [],
    envelopeLeft: 0,
  };
}

function createFlightState(
  kind: string,
  occupancy: FlightState["occupancy"],
  engineCount: number,
  underwayTime = 0,
  pilot: RotorcraftPilotState | null = null,
): FlightState {
  const zeroThrottle = Array.from({ length: engineCount }, () => 0);
  return {
    kind,
    occupancy,
    pilot,
    time: underwayTime,
    castOff: underwayTime > 0,
    progress: 0,
    throttle: zeroThrottle,
    driveThrottle: zeroThrottle,
    propulsionFeedback: Array.from({ length: engineCount }, () => 1),
    safetyAdvisory: null,
    pilotObstacleReadings: [],
    pilotIntervenedSensors: new Set<number>(),
    lastGoAround: -1e9,
    goArounds: 0,
    corrections: 0,
    watchdog: createVehicleFailureWatchdog(0),
    unexpectedGroundContactSeconds: 0,
    trajectoryCorrection: null,
    handoffRequested: false,
  };
}

function clampUnit(value: number): number {
  return Math.max(-1, Math.min(1, value));
}

function routeTrackingState(
  plan: VehicleRoutePlan,
  progress: number,
  centre: readonly [number, number, number],
  orientation: readonly [number, number, number, number],
  nose: readonly [number, number, number],
): {
  readonly pitch: number;
  readonly roll: number;
  readonly headingError: number;
  readonly crossTrackError: number;
  readonly altitudeError: number;
} {
  // While backing away the route advances one way, but the ship's nose must
  // correctly face the other. The watchdog judges that commanded attitude,
  // not the unsigned polyline tangent.
  const [tangentX, tangentZ] = vehicleRouteHeading(plan, progress);
  const here = plan.point(progress);
  const offsetX = centre[0] - here[0];
  const offsetZ = centre[2] - here[2];
  const forward = rotateByQuaternion(orientation, nose);
  const forwardLength = Math.hypot(forward[0], forward[2]) || 1;
  const headingDot = clampUnit(
    (forward[0] / forwardLength) * tangentX +
      (forward[2] / forwardLength) * tangentZ,
  );
  const attitude = vehicleAttitude(orientation, nose);
  const verticalArrivalCaptured = vehicleVerticalArrivalCaptured(
    plan,
    progress,
    centre as [number, number, number],
  );
  return {
    ...attitude,
    headingError: Math.acos(headingDot),
    crossTrackError: Math.abs(offsetX * tangentZ - offsetZ * tangentX),
    // A captured vertical arrival is timed as a landing manoeuvre below. It
    // is not a route-altitude divergence while the machine descends in place.
    altitudeError: verticalArrivalCaptured
      ? 0
      : centre[1] -
        vehicleRouteAltitudeTarget(
          plan,
          progress,
          centre as [number, number, number],
        ),
  };
}

function deliveredControlFraction(
  requested: readonly number[],
  delivered: readonly number[],
): number {
  const requestedTotal = requested.reduce(
    (sum, value) => sum + Math.abs(value),
    0,
  );
  if (requestedTotal < 1e-6) {
    return 1;
  }
  const deliveredTotal = delivered.reduce(
    (sum, value) => sum + Math.abs(value),
    0,
  );
  return Math.min(1, deliveredTotal / requestedTotal);
}

function speedLimitedPlan(
  plan: VehicleRoutePlan,
  factor: number,
): VehicleRoutePlan {
  if (factor >= 1 - 1e-6) {
    return plan;
  }
  return {
    ...plan,
    speedLimit(progress) {
      return plan.speedLimit(progress) * Math.max(0, factor);
    },
  };
}

/**
 * Слой подвижных кластеров. Пока поза кадра — покой, система не трогает
 * ничего: корабль стоит у причала своими авторскими телами. Как только поза
 * сдвинута, куски переводятся в кинематику и каждый кадр получают
 * `поза ∘ своё локальное смещение` — то же, что система дверей делает со
 * створкой, только кусков пятьсот.
 *
 * Разрушение при этом остаётся настоящим: кусок, который сломали в полёте,
 * становится динамическим сам по себе (это делает BreakablePiece), а мы лишь
 * дарим ему скорость кадра — иначе он падал бы как с нуля.
 */
export function VehicleFrameSystem({
  pieces,
  bodies,
  brokenPieces,
  inactivePieces,
  resetVersion,
  departRequestVersion = 0,
  departRequestTargetRef,
  initialArrivalFlightKind = null,
  initialArrivalPassengerTransit = null,
  onDepartureApproachChange = () => {},
  onInterIslandBoundary,
  onInterIslandArrivalReady,
  onInterIslandArrivalComplete,
  onInterIslandPassengerStateChange,
  onPassengerViewRestore,
  occupiedSeatId = null,
  onOccupiedSeatChange = () => {},
  movingVehicles,
  dockedVehicles,
  clusterEventStates,
  clusterRegistry,
  externalImpulses,
  recoveryServiceArea,
  onVehicleRebuildRequest,
  onFramePose,
  onMotionTelemetryUpdate,
  onRotorcraftPilotStatusChange,
  worldContactPieceAt,
  contactMaterialOf,
  onContactDamage,
  onVehicleFailure,
}: {
  pieces: readonly BreakablePieceDefinition[];
  bodies: { current: Map<string, RapierRigidBody> };
  brokenPieces: { current: ReadonlySet<string> };
  /** Detached, shattered or carved members no longer owned by the compound. */
  inactivePieces: ReadonlySet<string>;
  resetVersion: number;
  /** Растёт, когда игрок нажал «отправить» у табло. */
  departRequestVersion?: number;
  departRequestTargetRef?: { current: EntryInteractionTarget | null };
  /** Arrival kind restored after the destination scene has mounted. */
  initialArrivalFlightKind?: string | null;
  /** Passenger state expressed in carrier coordinates before transmutation. */
  initialArrivalPassengerTransit?: InterIslandPassengerTransit | null;
  onDepartureApproachChange?: (
    approached: EntryInteractionTarget | null,
  ) => void;
  onInterIslandBoundary?: (
    flightKind: string,
    passenger: InterIslandPassengerHandoff | null,
  ) => void;
  /** The carrier, passenger pose, momentum and view are ready to reveal. */
  onInterIslandArrivalReady?: (flightKind: string) => void;
  onInterIslandArrivalComplete?: (flightKind: string) => void;
  onInterIslandPassengerStateChange?: (
    flightActive: boolean,
    passengerInsideCarrier: boolean,
    /** Кадру нужен не только факт рейса, но и какой именно: по нему он
        отличает уход с этого острова от прилёта на него. */
    flightKind: string | null,
  ) => void;
  onPassengerViewRestore?: (yaw: number, pitch: number) => void;
  /** Occupancy is UI/player state; the vehicle only offers and validates it. */
  occupiedSeatId?: string | null;
  onOccupiedSeatChange?: (seatId: string | null) => void;
  /**
   * Кластеры, которые прямо сейчас везёт кадр. Система дверей по этому
   * списку молчит: иначе она каждый кадр возвращала бы створку на авторское
   * место — и корабль улетал бы без единственной своей двери.
   */
  movingVehicles?: { current: Set<string> };
  /** Кластеры, уже принятые швартовом: их двери снова доступны игроку. */
  dockedVehicles?: { current: Set<string> };
  /** Reusable lifecycle states consumed by linked lights and future systems. */
  clusterEventStates?: { current: Map<string, LampEventState> };
  /** Общий реестр составных контактных тел, не привязанный к типу машины. */
  clusterRegistry: CompoundKinematicClusterRegistry;
  /** Weapon/contact impulses consumed by the custom rigid-body integrator. */
  externalImpulses: CompoundKinematicImpulseRegistry;
  recoveryServiceArea?: {
    readonly center: readonly [number, number];
    readonly radius: number;
    readonly disappearY: number;
  };
  onVehicleRebuildRequest?: (clusterId: string) => void;
  /** Публикует физическую позу без переноса логики кадра наружу. */
  onFramePose?: (state: VehicleFramePoseState) => void;
  /** Общий числовой канал для HUD любого движущегося объекта. */
  onMotionTelemetryUpdate?: (update: MotionTelemetryUpdate) => void;
  onRotorcraftPilotStatusChange?: (
    status: RotorcraftPilotStatus | null,
  ) => void;
  /** Опознание встреченного куска мира по точке контакта. */
  worldContactPieceAt?: (
    point: readonly [number, number, number],
    reach: number,
  ) => VehicleContactBody | null;
  contactMaterialOf?: (material: string) => ContactMaterialProfile;
  /** Заявка на разрушение обеим сторонам через общий вход игры. */
  onContactDamage?: (request: VehicleContactDamageRequest) => void;
  /** One-shot failure fact; presentation stays outside the physics system. */
  onVehicleFailure?: (event: VehicleFailureEvent) => void;
}) {
  const { rapier, world: rapierWorld } = useRapier();
  const { camera } = useThree();
  const [, getPilotControls] = useKeyboardControls<PilotControlName>();
  const approachedPost = useRef<ScheduledInteraction | null>(null);
  /** Яркость перронных огней в прошлом кадре: переключаем только по смене. */
  const departureGlow = useRef<number | null>(null);
  const debugTelemetryAt = useRef(0);
  const vehicleDiagnostics = useMemo(
    () => runtimeDiagnosticsEnabled("vehicle"),
    [],
  );
  const telemetryNextAt = useRef(new Map<string, number>());
  const telemetryActiveSources = useRef(new Set<string>());
  const pilotStatusPublished = useRef<string | null>(null);
  const pilotStatusMode = useRef<RotorcraftPilotState["mode"] | null>(null);
  const pilotStatusNextAt = useRef(0);
  /** Удары, накопленные движком с прошлого физического шага. */
  const contactEvents = useRef<CompoundClusterContact[]>([]);
  /**
   * Наблюдение за ударом для проверки в живой сцене. Считаются ФАКТЫ, а не
   * намерения: сколько пар движок вообще дал, сколько из них оказались
   * сближением, сколько ушли заявкой на суд закона материалов и сколько
   * нашли кусок мира.
   */
  const contactStats = useRef({
    seen: 0,
    closing: 0,
    requests: 0,
    worldHits: 0,
    lastSpeed: 0,
  });
  const collectContact = useCallback((contact: CompoundClusterContact) => {
    // Очередь ограничена: один кадр не должен уносить память, если машина
    // легла бортом на длинную конструкцию и пар контактов сотни.
    if (contactEvents.current.length < 256) {
      contactEvents.current.push(contact);
    }
  }, []);
  const handledDepartRequest = useRef(departRequestVersion);
  const handledArrivalRequest = useRef<string | null>(null);
  const pilotCommands = useRef(createRotorcraftPilotCommandBuffer());

  useEffect(() => {
    if (occupiedSeatId === TOWN_HEXACOPTER_PILOT_SEAT_ID) {
      return;
    }
    pilotStatusPublished.current = null;
    pilotStatusMode.current = null;
    onRotorcraftPilotStatusChange?.(null);
  }, [occupiedSeatId, onRotorcraftPilotStatusChange]);

  useEffect(() => {
    pilotCommands.current = createRotorcraftPilotCommandBuffer();
    if (occupiedSeatId !== TOWN_HEXACOPTER_PILOT_SEAT_ID) {
      return undefined;
    }
    const handleWheel = (event: WheelEvent) => {
      // A conventional wheel notch is roughly 100 pixels; trackpads emit
      // smaller deltas and therefore accumulate smoothly instead of turning
      // every tiny event into a whole metre.
      const pixels =
        event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? event.deltaY * 16
          : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? event.deltaY * window.innerHeight
            : event.deltaY;
      pilotCommands.current.altitudeDelta += Math.max(
        -3,
        Math.min(3, -pixels / 100),
      );
      event.preventDefault();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (event.code === "KeyF") {
        pilotCommands.current.requestSafeClimb = true;
        event.preventDefault();
      } else if (event.code === "KeyH") {
        pilotCommands.current.requestReturn = true;
        event.preventDefault();
      } else if (event.code === "KeyO") {
        pilotCommands.current.requestToggleSensors = true;
        event.preventDefault();
      } else if (
        event.shiftKey &&
        (event.code === "ArrowDown" || event.code === "KeyS")
      ) {
        pilotCommands.current.requestDisarm = true;
      }
    };
    const handleMouseDown = (event: MouseEvent) => {
      if (event.button === 1) {
        pilotCommands.current.recenterView = true;
        event.preventDefault();
      }
    };
    window.addEventListener("wheel", handleWheel, { passive: false });
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("mousedown", handleMouseDown);
    return () => {
      window.removeEventListener("wheel", handleWheel);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("mousedown", handleMouseDown);
    };
  }, [occupiedSeatId, onPassengerViewRestore]);

  const frames = useMemo<readonly VehicleFrameRuntime[]>(() => {
    const vehicleByCluster = new Map(
      airVehicles.map((vehicle) => [vehicle.clusterId, vehicle] as const),
    );
    // Ось каждого винта — середина между его лопастями: так её не приходится
    // дублировать из сцены, и она не разъедется, если мотор подвинут.
    const bladeCentres = new Map<string, [number, number, number, number]>();
    for (const piece of pieces) {
      const engine = bladePropeller(piece.id);
      if (!engine) {
        continue;
      }
      const sum = bladeCentres.get(engine) ?? [0, 0, 0, 0];
      bladeCentres.set(engine, [
        sum[0] + piece.position[0],
        sum[1] + piece.position[1],
        sum[2] + piece.position[2],
        sum[3] + 1,
      ]);
    }
    const hubs = new Map<string, readonly [number, number, number]>();
    for (const [engine, sum] of bladeCentres) {
      hubs.set(engine, [sum[0] / sum[3], sum[1] / sum[3], sum[2] / sum[3]]);
    }

    const oarPivots = new Map<string, readonly [number, number, number]>();
    const oarEngines = new Map<string, number>();
    for (const piece of pieces) {
      const oarlock = oarlockIdentity(piece.id);
      if (oarlock) {
        oarPivots.set(oarlock, piece.position);
      }
      const oar = oarMemberIdentity(piece.id);
      const throttle = piece.actuator?.commandChannel.match(/^throttle:(\d+)$/);
      if (oar && throttle) {
        oarEngines.set(oar.key, Number(throttle[1]));
      }
    }

    const byCluster = new Map<string, FrameMember[]>();
    for (const piece of pieces) {
      const [rx, ry, rz] = piece.rotation ?? [0, 0, 0];
      const engine = bladePropeller(piece.id);
      const oar = oarMemberIdentity(piece.id);
      const vehicle = vehicleByCluster.get(piece.clusterId);
      const oarPivot = oar ? oarPivots.get(oar.key) : undefined;
      const trimRailIndex = vehicle?.trimRails?.findIndex(
        (rail) => rail.carPieceId === piece.id,
      );
      const member: FrameMember = {
        piece,
        baseQuaternion: new Quaternion().setFromEuler(new Euler(rx, ry, rz)),
        spinHub: engine ? (hubs.get(engine) ?? null) : null,
        trimRailIndex:
          trimRailIndex === undefined || trimRailIndex < 0 ? null : trimRailIndex,
        engineIndex: engine
          ? engineIndexOf(
              hubs.get(engine),
              vehicle?.flight.limits.enginePoints ?? [],
            )
          : oar
            ? (oarEngines.get(oar.key) ?? 0)
            : 0,
        oarStroke:
          oar && oarPivot && vehicle?.flight.driveAnimation.kind === "oars"
            ? {
                pivot: oarPivot,
                side: oar.side,
                // A crew rows together, but a tiny travelling imperfection
                // keeps ten wooden levers from reading as one rigid comb.
                phaseOffset: (oar.index - 2) * 0.035,
                blade: oar.blade,
              }
            : null,
      };
      const members = byCluster.get(piece.clusterId);
      if (members) {
        members.push(member);
      } else {
        byCluster.set(piece.clusterId, [member]);
      }
    }
    return airVehicles
      .filter((vehicle) => byCluster.has(vehicle.clusterId))
      .map((vehicle) => {
        const members = byCluster.get(vehicle.clusterId) ?? [];
        const minimum: [number, number, number] = [
          Infinity,
          Infinity,
          Infinity,
        ];
        const maximum: [number, number, number] = [
          -Infinity,
          -Infinity,
          -Infinity,
        ];
        for (const { piece } of members) {
          // The half diagonal is deliberately conservative for rotated and
          // custom-mesh members. Own debris is ignored a little too long,
          // never reclassified while it is still inside the carrier.
          const radius = Math.hypot(...piece.size) / 2;
          for (let axis = 0; axis < 3; axis += 1) {
            const local = piece.position[axis] - vehicle.origin[axis];
            minimum[axis] = Math.min(minimum[axis], local - radius);
            maximum[axis] = Math.max(maximum[axis], local + radius);
          }
        }
        return {
          ...vehicle,
          members,
          localBounds: { minimum, maximum },
          actuators: compileCommandActuators(
            members.map((member) => member.piece),
          ),
        };
      });
  }, [pieces]);

  const states = useRef(new Map<string, FrameState>());
  const frameState = useCallback(
    (id: string): FrameState => {
      const existing = states.current.get(id);
      if (existing) {
        return existing;
      }
      const engineCount =
        frames.find((frame) => frame.id === id)?.flight.limits.enginePoints
          .length ?? 0;
      const created = restingState(engineCount);
      states.current.set(id, created);
      return created;
    },
    [frames],
  );

  useEffect(() => {
    for (const sourceId of telemetryActiveSources.current) {
      onMotionTelemetryUpdate?.({ sourceId, snapshot: null });
    }
    telemetryActiveSources.current.clear();
    telemetryNextAt.current.clear();
    states.current.clear();
    movingVehicles?.current.clear();
    dockedVehicles?.current.clear();
    clusterEventStates?.current.clear();
    // Publish the authored resting state immediately. Consumers such as
    // boards and doors mount before the first physics tick and must not read
    // the generic in-transit fallback while the carrier is visibly docked.
    for (const frame of frames) {
      if (!frame.clusterId) {
        continue;
      }
      const state = frameState(frame.id);
      const eventState = airVehicleFlightEventState(
        frame,
        state.flight,
        state.recovery?.lifecycle ?? null,
      );
      if (eventState === "docked") {
        dockedVehicles?.current.add(frame.clusterId);
        clusterEventStates?.current.set(frame.clusterId, eventState);
      } else {
        movingVehicles?.current.add(frame.clusterId);
        clusterEventStates?.current.set(frame.clusterId, eventState);
      }
    }
  }, [
    clusterEventStates,
    dockedVehicles,
    frameState,
    frames,
    movingVehicles,
    onMotionTelemetryUpdate,
    resetVersion,
  ]);

  useEffect(
    () => () => {
      for (const sourceId of telemetryActiveSources.current) {
        onMotionTelemetryUpdate?.({ sourceId, snapshot: null });
      }
      telemetryActiveSources.current.clear();
    },
    [onMotionTelemetryUpdate],
  );

  // Dev-хук: поза кадра из консоли или по CDP — пара к __mamTeleport.
  useEffect(() => {
    if (process.env.NODE_ENV === "production") {
      return undefined;
    }
    const scope = window as Window & {
      __mamVehiclePose?: (
        id: string,
        x: number,
        y: number,
        z: number,
        yaw?: number,
        pitch?: number,
        roll?: number,
      ) => boolean;
      __mamShipPose?: (
        x: number,
        y: number,
        z: number,
        yaw?: number,
        pitch?: number,
        roll?: number,
      ) => boolean;
      __mamVehicleImpulse?: (
        id: string,
        impulseX: number,
        impulseY: number,
        impulseZ: number,
        pointX: number,
        pointY: number,
        pointZ: number,
      ) => boolean;
      __mamVehicleDepart?: (id: string, kind?: string) => boolean;
      __mamVehicleContacts?: () => {
        readonly seen: number;
        readonly closing: number;
        readonly requests: number;
        readonly worldHits: number;
        readonly lastSpeed: number;
      };
    };
    const setPose = (
      id: string,
      x: number,
      y: number,
      z: number,
      yaw = 0,
      pitch = 0,
      roll = 0,
    ): boolean => {
      if (!frames.some((frame) => frame.id === id)) {
        return false;
      }
      frameState(id).pose = { position: [x, y, z], yaw, pitch, roll };
      return true;
    };
    scope.__mamVehiclePose = setPose;
    scope.__mamShipPose = (x, y, z, yaw, pitch, roll) =>
      setPose("sky-train", x, y, z, yaw, pitch, roll);
    const applyDiagnosticImpulse = (
      id: string,
      impulseX: number,
      impulseY: number,
      impulseZ: number,
      pointX: number,
      pointY: number,
      pointZ: number,
    ): boolean => {
      const frame = frames.find((candidate) => candidate.id === id);
      if (
        !frame ||
        ![impulseX, impulseY, impulseZ, pointX, pointY, pointZ].every(
          Number.isFinite,
        )
      ) {
        return false;
      }
      queueCompoundKinematicImpulse(externalImpulses, frame.clusterId, {
        impulse: [impulseX, impulseY, impulseZ],
        point: [pointX, pointY, pointZ],
      });
      return true;
    };
    scope.__mamVehicleImpulse = applyDiagnosticImpulse;
    scope.__mamVehicleContacts = () => ({ ...contactStats.current });
    const departDiagnostic = (id: string, kind = "circuit"): boolean => {
      const frame = frames.find((candidate) => candidate.id === id);
      if (!frame?.departure) {
        return false;
      }
      const state = frameState(id);
      if (state.flight) {
        return false;
      }
      state.flight = createFlightState(
        kind,
        "uncrewed",
        frame.flight.limits.enginePoints.length,
      );
      return true;
    };
    scope.__mamVehicleDepart = departDiagnostic;
    const query = new URLSearchParams(window.location.search);
    const impulseRequest = query.get("mamVehicleImpulse");
    const impulseDelay = Math.max(
      0,
      Number(query.get("mamVehicleImpulseAt") ?? 0),
    );
    let impulseTimer: number | undefined;
    let departureTimer: number | undefined;
    if (impulseRequest) {
      const [id, ...values] = impulseRequest.split(",");
      if (
        id &&
        values.length === 6 &&
        values.map(Number).every(Number.isFinite)
      ) {
        const numeric = values.map(Number) as [
          number,
          number,
          number,
          number,
          number,
          number,
        ];
        impulseTimer = window.setTimeout(
          () => applyDiagnosticImpulse(id, ...numeric),
          impulseDelay * 1_000,
        );
      }
    }
    const departureRequest = query.get("mamVehicleDepart");
    if (departureRequest) {
      const [id, kind = "circuit"] = departureRequest.split(",");
      const departureDelay = Math.max(
        0,
        Number(query.get("mamVehicleDepartAt") ?? 0),
      );
      departureTimer = window.setTimeout(
        () => departDiagnostic(id, kind),
        departureDelay * 1_000,
      );
    }
    return () => {
      if (impulseTimer !== undefined) {
        window.clearTimeout(impulseTimer);
      }
      if (departureTimer !== undefined) {
        window.clearTimeout(departureTimer);
      }
      delete scope.__mamVehiclePose;
      delete scope.__mamShipPose;
      if (scope.__mamVehicleImpulse === applyDiagnosticImpulse) {
        delete scope.__mamVehicleImpulse;
      }
      delete scope.__mamVehicleContacts;
      if (scope.__mamVehicleDepart === departDiagnostic) {
        delete scope.__mamVehicleDepart;
      }
      delete document.documentElement.dataset.mamSkyTrain;
      delete document.documentElement.dataset.mamVehicle;
    };
  }, [externalImpulses, frameState, frames]);

  const composedQuaternion = useRef(new Quaternion());
  const driveMemberQuaternion = useRef(new Quaternion());
  const driveMemberOffset = useRef(new Vector3());
  const oarSweepQuaternion = useRef(new Quaternion());
  const oarLiftQuaternion = useRef(new Quaternion());
  const oarStrokeQuaternion = useRef(new Quaternion());
  const oarFeatherQuaternion = useRef(new Quaternion());
  const oarTailwardAxis = useRef(new Vector3());
  const oarPivotOffset = useRef(new Vector3());
  const obstacleRay = useRef<InstanceType<typeof rapier.Ray> | null>(null);
  /** Тела корабля: чтобы луч опоры не принял его же куски за землю. */
  const shipBodies = useRef<Map<string, Set<number>>>(new Map());
  const debrisLocalPoint = useRef(new Vector3());
  const debrisCarrierRotation = useRef(new Quaternion());
  const handoffLookDirection = useRef(new Vector3());
  const interIslandPassengerStatus = useRef({ active: false, inside: false });

  useBeforePhysicsStep(() => {
    const step = PHYSICS_TIME_STEP;

    // Кто ВЕДЁТ РЕЙС на этой карте: у него лампы причала, межостровная
    // передача и швартовка. Он один, и это осознанное ограничение.
    const scheduledFrame = frames.find((frame) => frame.departure);
    const scheduled = scheduledFrame ? frameState(scheduledFrame.id) : null;
    if (scheduled && scheduledFrame) {
      const eyeNow: readonly [number, number, number] = [
        camera.position.x,
        camera.position.y,
        camera.position.z,
      ];
      // А вот ВЗАИМОДЕЙСТВИЕ принадлежит той машине, рядом с которой человек
      // стоит. Раньше здесь была та же `frames.find`, и она молча съедала
      // вторую машину карты: в городе рядом с гексакоптером не появлялось
      // никакой подсказки, потому что первым в каталоге шёл дирижабль.
      //
      // Правило простое и без дребезга: если глаз внутри объёма какой-то
      // машины — она и есть выбранная (внутри двух машин сразу не бывает);
      // иначе берётся ближайшая по её собственной точке отправления. На
      // картах с одним кораблём выбор тождественно совпадает с прежним.
      const insideFrame = frames.find((frame) => {
        if (!frame.passengerFlight) {
          return false;
        }
        const state = frameState(frame.id);
        return frame.passengerFlight.contains(
          shipLocalPoint(
            eyeNow as [number, number, number],
            frame.origin,
            state.pose,
            frame.nose,
          ),
        );
      });
      let nearestFrame = insideFrame ?? null;
      if (!nearestFrame) {
        let nearestDistance = Number.POSITIVE_INFINITY;
        for (const frame of frames) {
          if (!frame.departure) {
            continue;
          }
          const distance = Math.hypot(
            eyeNow[0] - frame.departure.point[0],
            eyeNow[2] - frame.departure.point[2],
          );
          if (distance < nearestDistance) {
            nearestDistance = distance;
            nearestFrame = frame;
          }
        }
      }
      const interactionFrame = nearestFrame ?? scheduledFrame;
      const interaction = frameState(interactionFrame.id);
      const departure = interactionFrame.departure;
      const isTerminal = interactionFrame.id === SCHEDULED_FRAME;
      const registeredLaunchMembers = clusterRegistry.current.get(
        interactionFrame.clusterId,
      )?.attachedMemberIds;
      const launchMembers = new Set(
        (registeredLaunchMembers
          ? [...registeredLaunchMembers]
          : interactionFrame.members.map((member) => member.piece.id)
        ).filter(
          (pieceId) =>
            !brokenPieces.current.has(pieceId) && !inactivePieces.has(pieceId),
        ),
      );
      const launchPropulsionHealth = driveUsesPropulsionFeedback(
        interactionFrame.flight.driveAnimation,
      )
        ? propulsionHealth(
            interactionFrame.actuators,
            launchMembers,
            interactionFrame.flight.limits.enginePoints.length,
          )
        : null;
      const launchClearance = launchPropulsionHealth
        ? propulsionFlightClearance(
            launchPropulsionHealth,
            interaction.mass
              ? rotorHoldState(
                  interactionFrame,
                  interaction.intactMass,
                  interaction.mass,
                  launchPropulsionHealth.fractions,
                )
              : null,
          )
        : null;
      const uncrewedLaunchAllowed = launchClearance?.uncrewedAllowed ?? true;
      const passengerLaunchAllowed = launchClearance?.passengerAllowed ?? true;
      const eye = eyeNow;
      let post: ScheduledInteraction | null = null;
      const eyeInShip = shipLocalPoint(
        eye,
        interactionFrame.origin,
        interaction.pose,
        interactionFrame.nose,
      );
      const interactionSeat = isTerminal
        ? SKY_TRAIN_DRIVER_SEAT
        : interactionFrame.clusterId === TOWN_HEXACOPTER_PILOT_SEAT.carrierClusterId
          ? TOWN_HEXACOPTER_PILOT_SEAT
          : null;
      const seatIntact =
        interactionSeat !== null &&
        passengerSeatIsIntact(interactionSeat, inactivePieces);
      const seatDistance = interactionSeat
        ? Math.hypot(
            eyeInShip[0] - interactionSeat.interactionPoint[0],
            eyeInShip[1] - interactionSeat.interactionPoint[1],
            eyeInShip[2] - interactionSeat.interactionPoint[2],
          )
        : Number.POSITIVE_INFINITY;
      const hexacopterPilotMayStand =
        interactionSeat?.id !== TOWN_HEXACOPTER_PILOT_SEAT_ID ||
        (occupiedSeatId === TOWN_HEXACOPTER_PILOT_SEAT_ID &&
          interaction.flight === null);
      const seatAction =
        interactionSeat &&
        hexacopterPilotMayStand &&
        (passengerLaunchAllowed || occupiedSeatId === interactionSeat.id)
          ? passengerSeatContextAction({
              seat: interactionSeat,
              occupiedSeatId,
              carrierActive: interaction.flight !== null,
              passengerInsideCarrier:
                interactionFrame.passengerFlight?.contains(eyeInShip) ?? false,
              distance: seatDistance,
              keepApproach: approachedPost.current === "seat",
              intact: seatIntact,
            })
          : null;
      if (seatAction === "stand") {
        post = seatAction;
      } else if (interaction.flight === null) {
        const boardDistance = departure
          ? Math.hypot(eye[0] - departure.point[0], eye[2] - departure.point[2])
          : Number.POSITIVE_INFINITY;
        const passengerFlight = interactionFrame.passengerFlight;
        const rideDistance = passengerFlight
          ? Math.hypot(
              eyeInShip[0] - passengerFlight.point[0],
              eyeInShip[1] - passengerFlight.point[1],
              eyeInShip[2] - passengerFlight.point[2],
            )
          : Number.POSITIVE_INFINITY;
        const keepRide = approachedPost.current === "ride";
        const keepBoard = approachedPost.current === "board";
        // Стойка на паде — интерфейс ПЛОЩАДКИ, и она видит машину только
        // когда машина дома. Пульт без машины — призрак: он телепортировал
        // пилота в кресло через полкарты. За улетевшей машиной идут пешком;
        // вход в управление ждёт у самого кресла и едет вместе с ней.
        const vehicleHome =
          Math.hypot(
            interaction.pose.position[0],
            interaction.pose.position[1],
            interaction.pose.position[2],
          ) <= DEPARTURE_HOME_RADIUS;
        if (
          passengerFlight &&
          passengerLaunchAllowed &&
          passengerFlight.contains(eyeInShip) &&
          rideDistance <=
            (keepRide
              ? passengerFlight.releaseRadius
              : passengerFlight.approachRadius)
        ) {
          post = "ride";
        } else if (
          departure &&
          uncrewedLaunchAllowed &&
          vehicleHome &&
          Math.abs(eye[1] - departure.point[1]) < departure.heightTolerance &&
          boardDistance <=
            (keepBoard ? departure.releaseRadius : departure.approachRadius)
        ) {
          post = "board";
        }
      } else if (isTerminal) {
        post = seatAction;
      }
      const departureTarget =
        departure?.target.actions && !passengerLaunchAllowed
          ? {
              ...departure.target,
              actions: departure.target.actions.filter(
                (action) => action.id !== "manual",
              ),
            }
          : (departure?.target ?? null);
      const candidate: EntryInteractionTarget | null =
        post === "ride"
          ? (interactionFrame.passengerFlight?.target ?? null)
          : post === "board"
            ? departureTarget
            : post === "seat"
              ? { id: interactionSeat?.id ?? "seat", kind: "seat" }
              : post === "stand"
                ? {
                    id: interactionSeat?.id ?? "seat",
                    kind: "stand",
                    cue: interactionSeat?.hintCue,
                  }
                : null;
      if (post !== approachedPost.current) {
        approachedPost.current = post;
        onDepartureApproachChange(candidate);
      }
      if (handledDepartRequest.current !== departRequestVersion) {
        handledDepartRequest.current = departRequestVersion;
        if (
          post &&
          entryInteractionMatches(departRequestTargetRef?.current, candidate)
        ) {
          if (
            (post === "ride" || post === "board") &&
            interaction.flight === null
          ) {
            const requestedAction =
              departRequestTargetRef?.current?.selectedActionId;
            // За управление садятся с двух постов: со стойки площадки, пока
            // машина дома, и прямо у кресла — тогда машина может ждать
            // пилота где угодно, хоть на крыше.
            const manualPilotLaunch =
              requestedAction === "manual" &&
              interactionSeat?.id === TOWN_HEXACOPTER_PILOT_SEAT_ID &&
              passengerLaunchAllowed &&
              seatIntact;
            interaction.flight = createFlightState(
              manualPilotLaunch
                ? (departure?.flightKind ?? "circuit")
                : post === "ride"
                  ? (requestedAction ??
                      interactionFrame.passengerFlight?.flightKind ??
                      "tour")
                  : (departure?.flightKind ?? "circuit"),
              post === "ride" || manualPilotLaunch
                ? "passenger"
                : "uncrewed",
              interactionFrame.flight.limits.enginePoints.length,
              0,
              manualPilotLaunch
                ? createRotorcraftPilotState(interaction.body.position[1], true)
                : null,
            );
            if (manualPilotLaunch) {
              onOccupiedSeatChange(TOWN_HEXACOPTER_PILOT_SEAT_ID);
            }
          } else if (
            post === "seat" &&
            interaction.flight !== null &&
            seatIntact &&
            interactionSeat
          ) {
            onOccupiedSeatChange(interactionSeat.id);
          } else if (
            post === "stand" &&
            occupiedSeatId === interactionSeat?.id
          ) {
            onOccupiedSeatChange(null);
          }
          approachedPost.current = null;
          onDepartureApproachChange(null);
        }
      }

      const flight = scheduled.flight;
      const mooring = vehicleMooringState(
        scheduledFrame,
        scheduled.body.position,
        scheduled.body.orientation,
        scheduled.body.velocity,
        scheduled.body.angularVelocity,
        scheduled.mass?.centre ?? scheduledFrame.origin,
      );
      const interIslandKind = flight?.kind ?? initialArrivalFlightKind;
      const interIslandActive = Boolean(
        interIslandKind &&
        (isInterIslandTransferKind(interIslandKind) ||
          isInterIslandArrivalKind(interIslandKind)),
      );
      const interIslandInside =
        interIslandActive &&
        Boolean(scheduledFrame.passengerFlight?.contains(eyeInShip));
      if (
        interIslandPassengerStatus.current.active !== interIslandActive ||
        interIslandPassengerStatus.current.inside !== interIslandInside
      ) {
        interIslandPassengerStatus.current = {
          active: interIslandActive,
          inside: interIslandInside,
        };
        onInterIslandPassengerStateChange?.(
          interIslandActive,
          interIslandInside,
          interIslandActive ? interIslandKind : null,
        );
      }
      // ЖИЗНЕННЫЙ ЦИКЛ РЕЙСА ПРИНАДЛЕЖИТ ТОЙ МАШИНЕ, У КОТОРОЙ РЕЙС.
      //
      // Раньше раскрутка, отдача концов, фаза винтов и завершение швартовки
      // висели на единственном «запланированном» carrier-е карты. Пока машина
      // была одна, разницы не было. Как только в городе появилась вторая,
      // дефект стал наблюдаемым и злым: пробел у её таблички принимался, рейс
      // заводился — и навсегда оставался с `time = 0`, потому что тикали
      // чужой. Человек видит подсказку, жмёт, и ничего не происходит.
      //
      // Причал, огни и межостровная передача ниже по-прежнему принадлежат
      // одному carrier-у карты: это свойство МЕСТА, а не рейса.
      for (const liveFrame of frames) {
        const liveState = frameState(liveFrame.id);
        const liveFlight = liveState.flight;
        if (!liveFlight) {
          continue;
        }
        liveFlight.time += step;
        if (
          !liveFlight.castOff &&
          liveFlight.time >= liveFrame.flight.spoolSeconds &&
          (!liveFlight.pilot || liveFlight.pilot.takeoffAuthorized)
        ) {
          liveFlight.castOff = true;
          // Empty service flights cannot smuggle a player out of the map.
          const player = bodies.current.get("player");
          const liveEyeInShip = shipLocalPoint(
            eyeNow as [number, number, number],
            liveFrame.origin,
            liveState.pose,
            liveFrame.nose,
          );
          if (
            liveFlight.occupancy === "uncrewed" &&
            liveFrame.passengerFlight &&
            liveFrame.departure?.passengerDropPoint &&
            player &&
            liveFrame.passengerFlight.contains(liveEyeInShip)
          ) {
            const drop = liveFrame.departure.passengerDropPoint;
            player.setTranslation({ x: drop[0], y: drop[1], z: drop[2] }, true);
            player.setLinvel({ x: 0, y: 0, z: 0 }, true);
          }
        }
        // Рейс кончается не по таймеру, а когда корабль вернулся на место и
        // носовой узел вошёл в захват и успокоился: центр корпуса сам по себе
        // швартовкой не является.
        const liveMooring = vehicleMooringState(
          liveFrame,
          liveState.body.position,
          liveState.body.orientation,
          liveState.body.velocity,
          liveState.body.angularVelocity,
          liveState.mass?.centre ?? liveFrame.origin,
        );
        // КОПТЕР НЕ ШВАРТУЕТСЯ. У него нет ни мачты, ни носового узла: рейс
        // кончается посадкой, и признаки её ровно те, по которым её признаёт
        // автоматика настоящего дрона — я над своим пятном, подо мной опора,
        // я не еду вбок и стою ровно. Курс не проверяется вовсе: коптеру
        // безразлично, каким боком он сел.
        const landingTolerance = liveFrame.flight.landing;
        const up = rotateByQuaternion(liveState.body.orientation, [0, 1, 0]);
        // Прогресс маршрута — обязательное условие: машина, стоящая на своём
        // пятне и никуда не летавшая, всем признакам посадки удовлетворяет.
        const arrived = landingTolerance
          ? liveFlight.progress > 0.985 &&
            isRotorLandingComplete(
              landingTolerance,
              {
                horizontal: Math.hypot(
                  liveState.body.position[0],
                  liveState.body.position[2],
                ),
                height: Math.abs(liveState.body.position[1]),
              },
              {
                speed: Math.hypot(
                  liveState.body.velocity[0],
                  liveState.body.velocity[2],
                ),
                verticalSpeed: liveState.body.velocity[1],
                uprightCos: up[1],
                angularSpeed: Math.hypot(
                  liveState.body.angularVelocity[0],
                  liveState.body.angularVelocity[1],
                  liveState.body.angularVelocity[2],
                ),
              },
              liveState.supportContacts,
            )
          : isDockingComplete(
              liveFlight.progress,
              liveMooring.offset,
              liveState.body.orientation,
              liveMooring.velocity,
              liveState.body.angularVelocity as [number, number, number],
              liveFrame.nose,
              liveFrame.flight.approach,
              liveFrame.flight.docking,
            );
        if (!liveState.recovery && arrived) {
          if (isInterIslandArrivalKind(liveFlight.kind)) {
            onInterIslandArrivalComplete?.(liveFlight.kind);
          }
          liveState.flight = null;
        }
      }

      // Перронные огни. Материал стекла общий на цвет, поэтому яркость
      // задаётся одним вызовом на всю линейку — и только когда она реально
      // меняется: мигание это редкие переключения, а не работа каждый кадр.
      const scheduledEventState = airVehicleFlightEventState(
        scheduledFrame,
        scheduled.flight,
        scheduled.recovery?.lifecycle ?? null,
      );
      const glow = departureLightGlow(
        scheduledEventState,
        scheduled.flight?.time ?? 0,
      );
      if (isTerminal && glow !== departureGlow.current) {
        departureGlow.current = glow;
        setSignalGlassGlow(departureSignalColor, glow);
      }
      if (vehicleDiagnostics) {
        const now = performance.now();
        if (now >= debugTelemetryAt.current) {
          debugTelemetryAt.current = now + 250;
          const diagnostic = {
            id: scheduledFrame.id,
            flight: scheduled.flight
              ? {
                  kind: scheduled.flight.kind,
                  time: scheduled.flight.time,
                  progress: scheduled.flight.progress,
                  goArounds: scheduled.flight.goArounds,
                  throttle: scheduled.flight.throttle,
                  safety: scheduled.flight.safetyAdvisory,
                  trajectoryCorrection: scheduled.flight.trajectoryCorrection
                    ? {
                        phase: scheduled.flight.trajectoryCorrection.phase,
                        reason: scheduled.flight.trajectoryCorrection.reason,
                        sourceProgress:
                          scheduled.flight.trajectoryCorrection.sourceProgress,
                        mergeProgress:
                          scheduled.flight.trajectoryCorrection.correction
                            ?.mergeProgress ?? null,
                      }
                    : null,
                  watchdog: scheduled.flight.watchdog,
                }
              : null,
            recovery: scheduled.recovery
              ? {
                  reason: scheduled.recovery.lifecycle.reason,
                  disposition: scheduled.recovery.lifecycle.disposition,
                  phase: scheduled.recovery.lifecycle.phase,
                  phaseSeconds: scheduled.recovery.lifecycle.phaseSeconds,
                  progress: scheduled.recovery.progress,
                }
              : null,
            position: scheduled.body.position,
            velocity: scheduled.body.velocity,
            angularVelocity: scheduled.body.angularVelocity,
            orientation: scheduled.body.orientation,
            mooring,
            docking: scheduled.flight
              ? {
                  complete: isDockingComplete(
                    scheduled.flight.progress,
                    mooring.offset,
                    scheduled.body.orientation,
                    mooring.velocity,
                    scheduled.body.angularVelocity as [number, number, number],
                    scheduledFrame.nose,
                    scheduledFrame.flight.approach,
                    scheduledFrame.flight.docking,
                  ),
                  settling: isDockingSettleWindow(
                    scheduled.flight.progress,
                    mooring.offset,
                    scheduled.body.orientation,
                    scheduledFrame.nose,
                    scheduledFrame.flight.approach,
                    scheduledFrame.flight.docking,
                  ),
                  tolerance: scheduledFrame.flight.docking,
                }
              : null,
            brokenMembers: scheduledFrame.members
              .filter((member) => brokenPieces.current.has(member.piece.id))
              .map((member) => member.piece.id),
          };
          document.documentElement.dataset.mamVehicle =
            JSON.stringify(diagnostic);
          if (isTerminal) {
            document.documentElement.dataset.mamSkyTrain =
              JSON.stringify(diagnostic);
          }
        }
      }
    }

    // --- Тело корабля --------------------------------------------------
    // Контактный корпус кластера и его ещё не отделившиеся визуальные тела
    // принадлежат самому кораблю: сенсоры не принимают их за внешний мир.
    shipBodies.current.clear();
    for (const frame of frames) {
      const state = frameState(frame.id);
      const ownBodies = new Set<number>();
      const runtime = clusterRegistry.current.get(frame.clusterId);
      if (runtime) {
        ownBodies.add(runtime.body.handle);
      }
      for (const member of frame.members) {
        const body = bodies.current.get(member.piece.id);
        if (!body) {
          continue;
        }
        if (!brokenPieces.current.has(member.piece.id)) {
          ownBodies.add(body.handle);
          continue;
        }
        if (state.separated.has(member.piece.id) || !runtime) {
          continue;
        }
        const carrierPosition = runtime.body.translation();
        const carrierRotation = runtime.body.rotation();
        const bodyPosition = body.translation();
        const local = debrisLocalPoint.current
          .set(
            bodyPosition.x - carrierPosition.x,
            bodyPosition.y - carrierPosition.y,
            bodyPosition.z - carrierPosition.z,
          )
          .applyQuaternion(
            debrisCarrierRotation.current
              .set(
                carrierRotation.x,
                carrierRotation.y,
                carrierRotation.z,
                carrierRotation.w,
              )
              .invert(),
          );
        const margin = 0.45;
        const outside =
          local.x < frame.localBounds.minimum[0] - margin ||
          local.x > frame.localBounds.maximum[0] + margin ||
          local.y < frame.localBounds.minimum[1] - margin ||
          local.y > frame.localBounds.maximum[1] + margin ||
          local.z < frame.localBounds.minimum[2] - margin ||
          local.z > frame.localBounds.maximum[2] + margin;
        if (outside) {
          state.separated.add(member.piece.id);
        } else {
          ownBodies.add(body.handle);
        }
      }
      shipBodies.current.set(frame.clusterId, ownBodies);
    }
    // Удары, накопленные движком с прошлого шага. Очередь забирается целиком
    // и один раз: событие принадлежит шагу, а не кадру рендера.
    const contactsThisStep = contactEvents.current.splice(0);
    // Пока корабль не идёт по маршруту, его поза — не кривая, а следствие сил:
    // тяжесть в центре масс, подъём ВЫШЕ него в центре объёма оболочки, мягкая
    // швартовка и успокоение. Отсюда и маятник, и реакция на повреждения:
    // снесли хвостовой вагон — центр масс уехал вперёд, и нос задрался сам.
    for (const frame of frames) {
      const state = frameState(frame.id);
      const physicalCarrier = clusterRegistry.current.get(frame.clusterId)?.body;
      if (
        physicalCarrier &&
        state.mass &&
        physicalCarrier.bodyType() === rapier.RigidBodyType.Dynamic
      ) {
        const measured = readCarrierBody(frame, state.mass, physicalCarrier);
        state.body = measured.body;
        state.pose = measured.pose;
      }
      // УДАР О МИР.
      //
      // Мир видит КАЖДУЮ машину обычным физическим объектом — участие в
      // ударах не является возможностью и не выключается паспортом. Здесь
      // факт встречи становится импульсом (всегда) и заявкой на суд закона
      // материалов (обеим сторонам, каждой своим материалом). Штатную
      // швартовку и посадку от удара защищает сам закон: на их скоростях он
      // молчит. Автоматике полёта об ударе не сообщается ничем: она узнает о
      // нём так же, как о попадании ракеты — по изменившемуся движению.
      if (
        contactsThisStep.length > 0 &&
        state.mass &&
        state.mass.mass > 0 &&
        contactMaterialOf
      ) {
        const properties = state.mass;
        const worldCentre: [number, number, number] = [
          properties.centre[0] + state.body.position[0],
          properties.centre[1] + state.body.position[1],
          properties.centre[2] + state.body.position[2],
        ];
        // ПЕРВЫЙ ПРОХОД: чей это удар и какая доля кому.
        //
        // У удара один импульс. Раздать его каждой паре целиком означало бы
        // достать из корпуса вдесятеро больше, чем в нём было, и машина
        // отскочила бы от собственного касания. Доли считаются по вкладу
        // каждого контакта в общее сближение.
        const own = contactsThisStep.filter(
          (contact) => contact.clusterId === frame.clusterId,
        );
        const closingOf = (contact: CompoundClusterContact): number => {
          const lever = [
            contact.point[0] - worldCentre[0],
            contact.point[1] - worldCentre[1],
            contact.point[2] - worldCentre[2],
          ] as const;
          const spin = [
            state.body.angularVelocity[1] * lever[2] -
              state.body.angularVelocity[2] * lever[1],
            state.body.angularVelocity[2] * lever[0] -
              state.body.angularVelocity[0] * lever[2],
            state.body.angularVelocity[0] * lever[1] -
              state.body.angularVelocity[1] * lever[0],
          ] as const;
          return -(
            (state.body.velocity[0] + spin[0]) * contact.normal[0] +
            (state.body.velocity[1] + spin[1]) * contact.normal[1] +
            (state.body.velocity[2] + spin[2]) * contact.normal[2]
          );
        };
        const closingTotal = own.reduce(
          (sum, contact) => sum + Math.max(0, closingOf(contact)),
          0,
        );
        const contactImpulses: CompoundKinematicImpulse[] = [];
        for (const contact of own) {
          const member = frame.members.find(
            (candidate) => candidate.piece.id === contact.pieceId,
          );
          if (!member || brokenPieces.current.has(contact.pieceId)) {
            continue;
          }
          const lever: [number, number, number] = [
            contact.point[0] - worldCentre[0],
            contact.point[1] - worldCentre[1],
            contact.point[2] - worldCentre[2],
          ];
          // Скорость ИМЕННО ЭТОЙ точки: вращающийся корпус может встретить
          // стену краем, пока центр почти стоит.
          const spin: [number, number, number] = [
            state.body.angularVelocity[1] * lever[2] -
              state.body.angularVelocity[2] * lever[1],
            state.body.angularVelocity[2] * lever[0] -
              state.body.angularVelocity[0] * lever[2],
            state.body.angularVelocity[0] * lever[1] -
              state.body.angularVelocity[1] * lever[0],
          ];
          const relativeVelocity: [number, number, number] = [
            state.body.velocity[0] + spin[0],
            state.body.velocity[1] + spin[1],
            state.body.velocity[2] + spin[2],
          ];
          const obstacle =
            worldContactPieceAt?.(
              [
                contact.point[0] - contact.normal[0] * 0.3,
                contact.point[1] - contact.normal[1] * 0.3,
                contact.point[2] - contact.normal[2] * 0.3,
              ],
              1.1,
            ) ?? null;
          contactStats.current.seen += 1;
          const resolution = resolveVehicleContact(
            {
              point: contact.point as [number, number, number],
              normal: contact.normal as [number, number, number],
              relativeVelocity,
              effectiveMass: pointEffectiveMass(
                properties,
                state.body.orientation,
                lever,
                contact.normal as [number, number, number],
              ),
              normalImpulse: contact.normalImpulse,
              vehicle: {
                pieceId: member.piece.id,
                material: member.piece.material,
                volume:
                  member.piece.volume ??
                  member.piece.size[0] *
                    member.piece.size[1] *
                    member.piece.size[2],
              },
              obstacle,
              share:
                closingTotal > 1e-6
                  ? Math.max(0, closingOf(contact)) / closingTotal
                  : 1,
            },
            contactMaterialOf,
          );
          if (resolution.closingSpeed < CONTACT_MINIMUM_CLOSING_SPEED) {
            continue;
          }
          contactStats.current.closing += 1;
          contactStats.current.lastSpeed = resolution.closingSpeed;
          // Rapier уже передал этот импульс в contact solver. Здесь он только
          // измеряется для разрушения и телеметрии; повторное применение
          // удвоило бы физический удар.
          contactImpulses.push({
            impulse: resolution.impulse as [number, number, number],
            point: contact.point as [number, number, number],
          });
          if (obstacle) {
            contactStats.current.worldHits += 1;
          }
          // Вердикта здесь нет — только замер. Обе стороны судятся одним
          // законом материалов там, где он живёт, каждая своим материалом.
          contactStats.current.requests += 1;
          onContactDamage?.({
            point: contact.point as [number, number, number],
            direction: [
              -contact.normal[0],
              -contact.normal[1],
              -contact.normal[2],
            ],
            closingSpeed: resolution.closingSpeed,
            vehiclePieceId: member.piece.id,
            vehicleIntensity: resolution.vehicleIntensity,
            worldPieceId: obstacle?.pieceId ?? null,
            worldIntensity: resolution.obstacleIntensity,
          });
        }
        if (contactImpulses.length > 0) {
          const before: BodyState = { ...state.body, position: worldCentre };
          const after = contactImpulses.reduce<BodyState>(
            (body, impulse) => applyImpulseAtPoint(body, properties, impulse),
            before,
          );
          const impact = createVehicleImpactTelemetry({
            frame,
            properties,
            before,
            after,
            impulses: contactImpulses,
            sequence: (state.telemetryImpact?.sequence ?? 0) + 1,
            capturedAt: performance.now(),
          });
          if (impact) state.telemetryImpact = impact;
        }
      }
      const applyPendingImpulses = (properties: MassProperties) => {
        const pending = externalImpulses.current.get(frame.clusterId);
        if (!pending || pending.length === 0 || properties.mass <= 0) {
          return;
        }
        const physicalBody = clusterRegistry.current.get(frame.clusterId)?.body;
        if (!physicalBody) {
          return;
        }
        let worldBody: BodyState = {
          ...state.body,
          position: [
            state.body.position[0] + properties.centre[0],
            state.body.position[1] + properties.centre[1],
            state.body.position[2] + properties.centre[2],
          ],
        };
        const beforeImpulse = worldBody;
        for (const applied of pending) {
          worldBody = applyImpulseAtPoint(worldBody, properties, applied);
          physicalBody.applyImpulseAtPoint(
            {
              x: applied.impulse[0],
              y: applied.impulse[1],
              z: applied.impulse[2],
            },
            { x: applied.point[0], y: applied.point[1], z: applied.point[2] },
            true,
          );
        }
        const impact = createVehicleImpactTelemetry({
          frame,
          properties,
          before: beforeImpulse,
          after: worldBody,
          impulses: pending as readonly CompoundKinematicImpulse[],
          sequence: (state.telemetryImpact?.sequence ?? 0) + 1,
          capturedAt: performance.now(),
        });
        if (impact) state.telemetryImpact = impact;
        state.body = {
          ...worldBody,
          position: [
            worldBody.position[0] - properties.centre[0],
            worldBody.position[1] - properties.centre[1],
            worldBody.position[2] - properties.centre[2],
          ],
        };
        externalImpulses.current.delete(frame.clusterId);
      };
      // The blast reaches the intact rigid body first. Fracture is observed
      // in the same simulation step below, where the surviving mass and every
      // released member inherit this newly changed velocity field.
      if (state.mass) {
        applyPendingImpulses(state.mass);
      }
      // Ключ пересчёта — сломанные ИМЕННО этого кадра. Глобальный счётчик
      // разрушенного менялся от любого попадания в мире и пересчитывал массу
      // всех кусков корабля на каждую чужую пробоину; заодно список живых
      // членов собирался заново каждый физический шаг.
      let frameBroken = 0;
      for (const member of frame.members) {
        if (brokenPieces.current.has(member.piece.id)) {
          frameBroken += 1;
        }
      }
      // A trim car is real mass on a real rail: where it stands changes the
      // live centre of mass, so the mass model has to follow it. The car is
      // slow, so recomputing on every measurable centimetre of travel is
      // enough and keeps this off the per-frame path.
      const trimRails = frame.trimRails ?? [];
      let trimMoved = false;
      for (const [index, rail] of trimRails.entries()) {
        const position = state.trim[index]?.position ?? 0;
        if (Math.abs(position - (state.trimMassPositions[index] ?? 0)) > 0.05) {
          trimMoved = true;
        }
        void rail;
      }
      const membershipChanged = state.brokenSeen !== frameBroken || !state.mass;
      if (membershipChanged || trimMoved) {
        const previousMass = state.mass;
        state.brokenSeen = frameBroken;
        if (membershipChanged) {
          state.aliveMembers = frame.members.filter(
            (member) => !brokenPieces.current.has(member.piece.id),
          );
          state.envelopeLeft = state.aliveMembers.filter((member) =>
            member.piece.id.includes(frame.envelopeMatch),
          ).length;
        }
        state.trimMassPositions = trimRails.map(
          (_, index) => state.trim[index]?.position ?? 0,
        );
        const nextMass = massProperties(
          state.aliveMembers.map((member) =>
            member.trimRailIndex === null
              ? member.piece
              : {
                  ...member.piece,
                  position: vehicleTrimCarPosition(
                    trimRails[member.trimRailIndex],
                    state.trim[member.trimRailIndex] ??
                      createVehicleTrimRailState(),
                  ),
                },
          ),
          densityOf,
        );
        if (previousMass && previousMass.mass > 0 && nextMass.mass > 0) {
          const oldWorldBody: BodyState = {
            ...state.body,
            position: [
              state.body.position[0] + previousMass.centre[0],
              state.body.position[1] + previousMass.centre[1],
              state.body.position[2] + previousMass.centre[2],
            ],
          };
          const rebased = rebaseBodyMassProperties(
            oldWorldBody,
            previousMass,
            nextMass,
          );
          state.body = {
            ...rebased,
            position: [
              rebased.position[0] - nextMass.centre[0],
              rebased.position[1] - nextMass.centre[1],
              rebased.position[2] - nextMass.centre[2],
            ],
          };
        }
        state.mass = nextMass;
        if (physicalCarrier && nextMass.mass > 0) {
          const principal = principalMassProperties(nextMass, frame.origin);
          physicalCarrier.setAdditionalMassProperties(
            principal.mass,
            {
              x: principal.centre[0],
              y: principal.centre[1],
              z: principal.centre[2],
            },
            {
              x: principal.principalInertia[0],
              y: principal.principalInertia[1],
              z: principal.principalInertia[2],
            },
            {
              x: principal.inertiaFrame[0],
              y: principal.inertiaFrame[1],
              z: principal.inertiaFrame[2],
              w: principal.inertiaFrame[3],
            },
            true,
          );
          physicalCarrier.recomputeMassPropertiesFromColliders();
          if (previousMass) {
            physicalCarrier.setLinvel(
              {
                x: state.body.velocity[0],
                y: state.body.velocity[1],
                z: state.body.velocity[2],
              },
              true,
            );
            physicalCarrier.setAngvel(
              {
                x: state.body.angularVelocity[0],
                y: state.body.angularVelocity[1],
                z: state.body.angularVelocity[2],
              },
              true,
            );
          }
        }
        if (!previousMass) {
          applyPendingImpulses(nextMass);
        }
        if (state.intactMass === 0 && state.mass.mass > 0) {
          state.intactMass = state.mass.mass;
          state.intactEnvelope = frame.members.filter((member) =>
            member.piece.id.includes(frame.envelopeMatch),
          ).length;
          state.trimCentre = [
            state.mass.centre[0],
            frame.liftCentre[1],
            state.mass.centre[2],
          ];
        }
      }
      const alive = state.aliveMembers;
      const mass = state.mass;
      if (!mass || mass.mass <= 0 || state.envelopeLeft === 0) {
        if (state.flight && !state.recovery) {
          state.recovery = {
            lifecycle: createVehicleRecoveryLifecycle(
              "structureLost",
              "settleInPlace",
            ),
            progress: 0,
            escapePlan: null,
            arrivalInitialized: false,
            escapeStallSeconds: 0,
            escapeBestProgress: 0,
            landingStability: createVehicleLandingStability(
              state.body.position,
              state.body.orientation,
            ),
            groundContactSeconds: 0,
            groundContactLatched: false,
            groundLiftAutomation: createVehicleGroundLiftAutomation(),
          };
        }
        if (telemetryActiveSources.current.delete(frame.clusterId)) {
          telemetryNextAt.current.delete(frame.clusterId);
          onMotionTelemetryUpdate?.({
            sourceId: frame.clusterId,
            snapshot: null,
          });
        }
        continue;
      }
      if (
        initialArrivalFlightKind &&
        handledArrivalRequest.current !== initialArrivalFlightKind &&
        !state.flight &&
        !state.recovery &&
        frame.passengerFlight &&
        // Player registration is a React effect. Never consume the one-shot
        // arrival before there is a body to place aboard the carrier.
        bodies.current.has("player")
      ) {
        handledArrivalRequest.current = initialArrivalFlightKind;
        const berth = mass.centre as [number, number, number];
        const plan = frame.flight.routePlan(initialArrivalFlightKind, berth);
        const start = plan.point(0);
        const ahead = plan.point(Math.min(1, 6 / plan.length));
        const tangentLength =
          Math.hypot(ahead[0] - start[0], ahead[2] - start[2]) || 1;
        const tangent: readonly [number, number] = [
          (ahead[0] - start[0]) / tangentLength,
          (ahead[2] - start[2]) / tangentLength,
        ];
        const noseLength = Math.hypot(frame.nose[0], frame.nose[2]) || 1;
        const localNose: readonly [number, number] = [
          frame.nose[0] / noseLength,
          frame.nose[2] / noseLength,
        ];
        const yaw = Math.atan2(
          localNose[1] * tangent[0] - localNose[0] * tangent[1],
          localNose[0] * tangent[0] + localNose[1] * tangent[1],
        );
        const orientation = vehicleRotation(
          { position: [0, 0, 0], yaw, pitch: 0, roll: 0 },
          frame.nose,
        );
        state.body = {
          position: [
            start[0] - mass.centre[0],
            start[1] - mass.centre[1],
            start[2] - mass.centre[2],
          ],
          orientation,
          velocity: [tangent[0] * 6.5, 0, tangent[1] * 6.5],
          angularVelocity: [0, 0, 0],
        };
        if (physicalCarrier) {
          placeCarrierBody(frame, mass, state.body, physicalCarrier);
        }
        state.flight = createFlightState(
          initialArrivalFlightKind,
          "passenger",
          frame.flight.limits.enginePoints.length,
          frame.flight.underwaySeconds + 8,
        );
        state.liftNow = mass.mass * GRAVITY;
        state.released.clear();
        state.separated.clear();
        state.spinAngles.fill(0);
        state.rotorMotorOutput.fill(
          (frame.flight.liftSource ?? "buoyant") === "rotor"
            ? 1 / (frame.flight.liftReserve ?? 1.35)
            : 0,
        );
        state.suppressFrameVelocityOnce = true;

        const passenger = bodies.current.get("player");
        if (passenger) {
          const restoredEyeOffset = initialArrivalPassengerTransit
            ? vectorFromCarrier(
                initialArrivalPassengerTransit.eyeOffset,
                frame.nose,
              )
            : ([0, 0, 0] as const);
          const restoredEye: [number, number, number] = [
            frame.passengerFlight.point[0] + restoredEyeOffset[0],
            frame.passengerFlight.point[1] + restoredEyeOffset[1],
            frame.passengerFlight.point[2] + restoredEyeOffset[2],
          ];
          const localEye: [number, number, number] = [
            restoredEye[0] - mass.centre[0],
            restoredEye[1] - mass.centre[1],
            restoredEye[2] - mass.centre[2],
          ];
          const eyeOffset = rotateByQuaternion(orientation, localEye);
          passenger.setTranslation(
            {
              x: start[0] + eyeOffset[0],
              y: start[1] + eyeOffset[1] - 0.54,
              z: start[2] + eyeOffset[2],
            },
            true,
          );
          const restoredRelativeVelocity = initialArrivalPassengerTransit
            ? rotateByQuaternion(
                orientation,
                vectorFromCarrier(
                  initialArrivalPassengerTransit.relativeVelocity,
                  frame.nose,
                ) as [number, number, number],
              )
            : ([0, 0, 0] as const);
          passenger.setLinvel(
            {
              x: tangent[0] * 6.5 + restoredRelativeVelocity[0],
              y: restoredRelativeVelocity[1],
              z: tangent[1] * 6.5 + restoredRelativeVelocity[2],
            },
            true,
          );
          if (initialArrivalPassengerTransit) {
            const localLook = vectorFromCarrier(
              initialArrivalPassengerTransit.lookDirection,
              frame.nose,
            );
            const worldLook = rotateByQuaternion(
              orientation,
              localLook as [number, number, number],
            );
            const lookLength = Math.hypot(...worldLook) || 1;
            const lookX = worldLook[0] / lookLength;
            const lookY = worldLook[1] / lookLength;
            const lookZ = worldLook[2] / lookLength;
            onPassengerViewRestore?.(
              Math.atan2(-lookX, -lookZ),
              Math.asin(clampUnit(lookY)),
            );
          }
          onInterIslandArrivalReady?.(initialArrivalFlightKind);
        }
      }
      // Оболочка задаёт ПОТОЛОК подъёма: порвали полотно — больше столько и
      // не поднимешь. А внутри этого потолка автоматика тянет подъём к весу
      // уцелевшего, и тянет медленно.
      const envelopeLeft = state.envelopeLeft;
      // How much gas volume this machine carries over its own weight is a
      // property of the machine, not of the world: a taut little gondola and a
      // fortress-sized ram do not survive the same hole. Carriers that author
      // nothing keep the reserve every carrier had before.
      const liftCapacity =
        state.intactMass *
        GRAVITY *
        (envelopeLeft / state.intactEnvelope) *
        (frame.flight.liftReserve ?? DEFAULT_VEHICLE_LIFT_RESERVE);
      const neutral = mass.mass * GRAVITY;
      const berth = mass.centre as [number, number, number];
      let centreNow: [number, number, number] = [
        mass.centre[0] + state.body.position[0],
        mass.centre[1] + state.body.position[1],
        mass.centre[2] + state.body.position[2],
      ];

      if (state.recovery) {
        const previousPhase = state.recovery.lifecycle.phase;
        if (
          previousPhase === "landing" &&
          !state.recovery.groundContactLatched
        ) {
          state.recovery.groundContactSeconds =
            state.supportContacts > 0
              ? state.recovery.groundContactSeconds + step
              : 0;
          state.recovery.groundContactLatched =
            state.recovery.groundContactSeconds >=
            VEHICLE_GROUND_CONTACT_CONFIRM_SECONDS;
        }
        if (previousPhase === "landing") {
          const attitude = vehicleAttitude(state.body.orientation, frame.nose);
          state.recovery.groundLiftAutomation =
            advanceVehicleGroundLiftAutomation(
              state.recovery.groundLiftAutomation,
              {
                deltaSeconds: step,
                contactConfirmed: state.recovery.groundContactLatched,
                supportContacts: state.supportContacts,
                groundSpeed: Math.hypot(
                  state.body.velocity[0],
                  state.body.velocity[2],
                ),
                pitch: attitude.pitch,
                roll: attitude.roll,
                tiltAngularSpeed: Math.hypot(
                  state.body.angularVelocity[0],
                  state.body.angularVelocity[2],
                ),
                liftFraction: state.liftNow / Math.max(1, neutral),
                movingLiftFloor: 0,
              },
            );
        }
        state.recovery.landingStability = advanceVehicleLandingStability(
          state.recovery.landingStability,
          {
            deltaSeconds: step,
            supportContacts:
              state.recovery.groundContactLatched &&
              vehicleGroundLiftAutomationSettled(
                state.recovery.groundLiftAutomation,
                state.liftNow / Math.max(1, neutral),
              )
                ? state.supportContacts
                : 0,
            position: state.body.position,
            orientation: state.body.orientation,
            velocity: state.body.velocity,
            angularVelocity: state.body.angularVelocity,
          },
        );
        const arrivalCapture = vehicleMooringState(
          frame,
          state.body.position,
          state.body.orientation,
          state.body.velocity,
          state.body.angularVelocity,
          mass.centre,
        );
        const arrivalComplete =
          previousPhase === "arrival" &&
          isDockingComplete(
            state.recovery.progress,
            arrivalCapture.offset,
            state.body.orientation,
            arrivalCapture.velocity,
            state.body.angularVelocity as [number, number, number],
            frame.nose,
            frame.flight.approach,
            frame.flight.docking,
          );
        const rebuildComplete =
          previousPhase === "rebuilding" &&
          frame.members.every(
            (member) =>
              !inactivePieces.has(member.piece.id) &&
              !brokenPieces.current.has(member.piece.id),
          );
        const recoveryResult = advanceVehicleRecoveryLifecycle(
          state.recovery.lifecycle,
          {
            deltaSeconds: step,
            escapeComplete:
              previousPhase === "escape" && state.recovery.progress >= 0.985,
            belowFog:
              previousPhase === "descent" &&
              centreNow[1] <= (recoveryServiceArea?.disappearY ?? -12),
            landingComplete:
              previousPhase === "landing" &&
              state.recovery.landingStability.landed,
            rebuildComplete,
            arrivalComplete,
          },
        );
        if (recoveryResult.requestRebuild) {
          onVehicleRebuildRequest?.(frame.clusterId);
        }
        if (recoveryResult.recovered) {
          state.recovery = null;
          state.flight = null;
        } else if (recoveryResult.lifecycle) {
          state.recovery.lifecycle = recoveryResult.lifecycle;
          if (
            previousPhase !== "arrival" &&
            recoveryResult.lifecycle.phase === "arrival"
          ) {
            const arrival = frame.flight.arrivalPlan(berth);
            const start = arrival.point(0);
            const ahead = arrival.point(Math.min(1, 6 / arrival.length));
            const tangentLength =
              Math.hypot(ahead[0] - start[0], ahead[2] - start[2]) || 1;
            const tangent: readonly [number, number] = [
              (ahead[0] - start[0]) / tangentLength,
              (ahead[2] - start[2]) / tangentLength,
            ];
            const noseLength = Math.hypot(frame.nose[0], frame.nose[2]) || 1;
            const localNose: readonly [number, number] = [
              frame.nose[0] / noseLength,
              frame.nose[2] / noseLength,
            ];
            const yaw = Math.atan2(
              localNose[1] * tangent[0] - localNose[0] * tangent[1],
              localNose[0] * tangent[0] + localNose[1] * tangent[1],
            );
            const orientation = vehicleRotation(
              { position: [0, 0, 0], yaw, pitch: 0, roll: 0 },
              frame.nose,
            );
            state.body = {
              position: [
                start[0] - mass.centre[0],
                start[1] - mass.centre[1],
                start[2] - mass.centre[2],
              ],
              orientation,
              velocity: [tangent[0] * 6.5, 0, tangent[1] * 6.5],
              angularVelocity: [0, 0, 0],
            };
            if (physicalCarrier) {
              placeCarrierBody(frame, mass, state.body, physicalCarrier);
            }
            state.liftNow = neutral;
            state.released.clear();
            state.separated.clear();
            state.spinAngles.fill(0);
            state.rotorMotorOutput.fill(
              (frame.flight.liftSource ?? "buoyant") === "rotor"
                ? 1 / (frame.flight.liftReserve ?? 1.35)
                : 0,
            );
            state.recovery.progress = 0;
            state.recovery.arrivalInitialized = true;
            state.suppressFrameVelocityOnce = true;
            centreNow = [start[0], start[1], start[2]];
          }
        }
      }

      // --- Рейс: только маршрут и путевая скорость ------------------------
      // Ни дифферента, ни крена, ни клевка здесь не задаётся. Регулятор
      // просит идти в точку с такой-то скоростью, моторы и руль дают силы, а
      // положение корабля в пространстве — их следствие.
      const controls: {
        force: [number, number, number];
        point: [number, number, number];
      }[] = [];
      let liftCommand = 0;
      /**
       * У ВИНТОКРЫЛОЙ МАШИНЫ СИЛЫ РЕАЛИЗУЮТСЯ ИНАЧЕ.
       *
       * Маршрут, регулятор и органы управления общие — меняется только то, ЧЕМ
       * просьба исполняется. Дирижабль толкают моторы вбок, а подъём держит
       * оболочка: две независимые силы, и поза корабля — их побочный результат.
       * У коптера горизонтальной силы нет вовсе. Он умеет ровно одно —
       * наклониться и подставить под себя винты, поэтому НАКЛОН У НЕГО НЕ
       * СЛЕДСТВИЕ, А СПОСОБ ДВИГАТЬСЯ.
       *
       * Поэтому здесь корабельные силы не берутся: команда откладывается и
       * ниже раскладывается по кольцам вместе с подъёмом.
       */
      const usesRotorDynamics = frame.flight.liftSource === "rotor";
      let rotorGuidance: VehicleGuidanceDemand | null = null;
      const capture = vehicleMooringState(
        frame,
        state.body.position,
        state.body.orientation,
        state.body.velocity,
        state.body.angularVelocity,
        mass.centre,
      );
      const shipModel = {
        mass: mass.mass,
        inertiaYaw: mass.inertia[4],
        bodyCentre: mass.centre as [number, number, number],
        dragLinear: frame.flight.linearDamping * mass.mass,
        dragLateral:
          frame.flight.linearDamping *
          mass.mass *
          frame.flight.lateralDragRatio,
        dragAngular: frame.flight.angularDamping * mass.inertia[4],
        limits: frame.flight.limits,
      };
      // Сопротивление корпуса считаем сами и анизотропно: судно должно идти
      // носом, а не ехать боком.
      {
        const forward = rotateByQuaternion(
          state.body.orientation,
          frame.nose as [number, number, number],
        );
        const flat = Math.hypot(forward[0], forward[2]) || 1;
        controls.push({
          force: hullDrag(
            state.body.velocity as [number, number, number],
            [forward[0] / flat, forward[2] / flat],
            shipModel,
          ) as [number, number, number],
          point: [
            mass.centre[0] + state.body.position[0],
            mass.centre[1] + state.body.position[1],
            mass.centre[2] + state.body.position[2],
          ],
        });
      }
      const flight = state.flight;
      const pilotControlsNow =
        flight?.pilot &&
        occupiedSeatId === TOWN_HEXACOPTER_PILOT_SEAT_ID
          ? getPilotControls()
          : {
              forward: false,
              backward: false,
              left: false,
              right: false,
              run: false,
              jump: false,
            };
      const commands =
        flight?.pilot &&
        occupiedSeatId === TOWN_HEXACOPTER_PILOT_SEAT_ID
          ? consumeRotorcraftPilotCommands(pilotCommands.current)
          : null;
      const pilotManualOverride = Boolean(
        flight?.pilot &&
          (pilotControlsNow.forward ||
            pilotControlsNow.backward ||
            pilotControlsNow.left ||
            pilotControlsNow.right ||
            pilotControlsNow.jump ||
            Math.abs(commands?.altitudeDelta ?? 0) > 1e-6),
      );
      // Sensor presentation remains a pilot choice while H owns guidance.
      // The other one-shot flight-mode requests are intentionally consumed
      // above: replaying them after a later takeover would be stale input.
      if (
        flight?.pilot?.mode === "return" &&
        !pilotManualOverride &&
        commands?.requestToggleSensors
      ) {
        flight.pilot = {
          ...flight.pilot,
          sensorAssistEnabled: !flight.pilot.sensorAssistEnabled,
        };
      }
      if (flight?.pilot && commands?.recenterView) {
        const forward = rotateByQuaternion(
          state.body.orientation,
          frame.nose,
        );
        onPassengerViewRestore?.(
          Math.atan2(-forward[0], -forward[2]),
          0,
        );
      }
      const attachedMembers =
        clusterRegistry.current.get(frame.clusterId)?.attachedMemberIds ??
        new Set(alive.map((member) => member.piece.id));
      const propulsion = propulsionHealth(
        frame.actuators,
        attachedMembers,
        frame.flight.limits.enginePoints.length,
      );
      const liftHold = state.mass
        ? rotorHoldState(frame, state.intactMass, state.mass, propulsion.fractions)
        : null;
      const flightClearance = propulsionFlightClearance(propulsion, liftHold);
      const feedbackModel: ShipModel =
        driveUsesPropulsionFeedback(frame.flight.driveAnimation) && flight
          ? { ...shipModel, engineAvailability: flight.propulsionFeedback }
          : shipModel;
      const autopilotModel: ShipModel =
        frame.flight.liftSource === "rotor" && state.rotorYawRateLimits
          ? { ...feedbackModel, yawRateLimits: state.rotorYawRateLimits }
          : feedbackModel;
      const failureEnvelope = driveUsesPropulsionFeedback(
        frame.flight.driveAnimation,
      )
        ? supervisedFailureEnvelope(flightClearance)
        : undefined;
      // One deviation model per machine, derived from the same envelope the
      // watchdog escalates on. Guidance is therefore always the first to act.
      // Supervision only stretches timers, never the limits themselves, so the
      // corridor is stable across damage and is derived once per carrier. A
      // reloaded passport brings a new approach gate and rebuilds it.
      if (!state.guidance || state.guidanceSource !== frame.flight.approach) {
        state.guidanceSource = frame.flight.approach;
        state.guidance = vehicleGuidanceEnvelope(
          DEFAULT_VEHICLE_FAILURE_ENVELOPE,
          frame.flight.approach,
          frame.flight.limits,
          frame.flight.guidance,
        );
      }
      const guidance = state.guidance;

      // === Дифферентовка. Отдельный замкнутый контур: он не знает маршрута и
      // не выдаёт ни тяги, ни руля — только позиции тележек. Момент по крену
      // и тангажу возникает потому, что живой центр масс уезжает вместе с
      // настоящим балластом, а подъём остаётся приложен в trim centre.
      const trimRailDefinitions = frame.trimRails ?? [];
      if (trimRailDefinitions.length > 0) {
        const trimAttitude = vehicleAttitude(
          state.body.orientation,
          frame.nose,
        );
        const previousAttitude = state.trimAttitude;
        const sample = Math.max(1e-3, step);
        const pitchRate = previousAttitude
          ? (trimAttitude.pitch - previousAttitude.pitch) / sample
          : 0;
        const rollRate = previousAttitude
          ? (trimAttitude.roll - previousAttitude.roll) / sample
          : 0;
        state.trimAttitude = trimAttitude;
        const trimExecutions = executeCommandActuators(
          frame.actuators,
          attachedMembers,
          Object.fromEntries(
            trimRailDefinitions.map((rail) => [rail.commandChannel, 1]),
          ),
        );
        state.trimAvailable = trimRailDefinitions.map((rail) => {
          const matching = trimExecutions.filter(
            (execution) => execution.commandChannel === rail.commandChannel,
          );
          return (
            matching.length > 0 &&
            matching.every((execution) => execution.attachedFraction > 0)
          );
        });
        // Underway and during a recovery the cars work; at the berth they
        // crawl back to zero so the next flight starts from authored balance.
        const trimEngaged = Boolean(flight?.castOff) || state.recovery !== null;
        state.trim = trimRailDefinitions.map((rail, index) =>
          advanceVehicleTrimRail(
            rail,
            state.trim[index] ?? createVehicleTrimRailState(),
            {
              deltaSeconds: step,
              pitch: trimAttitude.pitch,
              roll: trimAttitude.roll,
              pitchRate,
              rollRate,
              available: state.trimAvailable[index] ?? false,
              engaged: trimEngaged,
            },
          ),
        );
        // Everything the machine physically has is already deployed and the
        // hull still hangs outside the corridor it must fly in.
        const trimTilt = Math.hypot(trimAttitude.pitch, trimAttitude.roll);
        const exhausted =
          trimEngaged &&
          vehicleTrimAuthorityExhausted({
            tilt: trimTilt,
            flyableTilt: guidance.flyableTilt,
            tiltRate: Math.hypot(
              state.body.angularVelocity[0],
              state.body.angularVelocity[2],
            ),
            authorityRemaining: state.trim.some(
              (railState, index) =>
                (state.trimAvailable[index] ?? false) && !railState.atStop,
            ),
          });
        state.trimExhaustedSeconds = exhausted
          ? state.trimExhaustedSeconds + step
          : 0;
      }

      // Predictive sensing is judged against the authored plan that owns the
      // berth. A temporary intercept ends at a route join, so asking it where
      // the berth is would let the mast read as an unexpected obstacle.
      const senseObstacleField = (
        scanClearDirections: boolean,
      ): {
        readonly readings: readonly VehicleObstacleReading[];
        readonly availableDeceleration: number;
        readonly climbClearance: number;
        readonly descentClearance: number;
      } => {
        const carrierBody = clusterRegistry.current.get(frame.clusterId)?.body;
        const ownBodyHandles = shipBodies.current.get(frame.clusterId);
        const rotationNow = vehicleRotation(state.pose, frame.nose);
        const readings: VehicleObstacleReading[] = [];
        let topPoint: readonly [number, number, number] | null = null;
        let bottomPoint: readonly [number, number, number] | null = null;

        for (const [sensorIndex, sensor] of frame.proximitySensors.entries()) {
          if (!vehicleProximitySensorEnabled(sensor)) {
            continue;
          }
          const point = vehiclePiecePosition(
            frame.origin,
            sensor.point as [number, number, number],
            state.pose,
            rotationNow,
          );
          if (!topPoint || point[1] > topPoint[1]) {
            topPoint = point;
          }
          if (!bottomPoint || point[1] < bottomPoint[1]) {
            bottomPoint = point;
          }
          const normal = rotateByQuaternion(
            state.body.orientation,
            sensor.normal as [number, number, number],
          );
          const lever = [
            point[0] - centreNow[0],
            point[1] - centreNow[1],
            point[2] - centreNow[2],
          ] as const;
          const spin = state.body.angularVelocity;
          const pointVelocity = [
            state.body.velocity[0] + spin[1] * lever[2] - spin[2] * lever[1],
            state.body.velocity[1] + spin[2] * lever[0] - spin[0] * lever[2],
            state.body.velocity[2] + spin[0] * lever[1] - spin[1] * lever[0],
          ] as const;
          const staticClosing =
            pointVelocity[0] * normal[0] +
            pointVelocity[1] * normal[1] +
            pointVelocity[2] * normal[2];
          if (!scanClearDirections && staticClosing <= 0.2) {
            continue;
          }

          obstacleRay.current ??= new rapier.Ray(
            { x: 0, y: 0, z: 0 },
            { x: 0, y: 0, z: 0 },
          );
          obstacleRay.current.origin.x = point[0];
          obstacleRay.current.origin.y = point[1];
          obstacleRay.current.origin.z = point[2];
          obstacleRay.current.dir.x = normal[0];
          obstacleRay.current.dir.y = normal[1];
          obstacleRay.current.dir.z = normal[2];
          const hit = rapierWorld.castRay(
            obstacleRay.current,
            OBSTACLE_SENSOR_RANGE,
            true,
            undefined,
            VEHICLE_CONTACT_QUERY,
            undefined,
            carrierBody,
            (collider) => {
              const handle = collider.parent()?.handle;
              return handle === undefined || !ownBodyHandles?.has(handle);
            },
          );
          if (!hit) {
            continue;
          }

          const obstacleVelocity: [number, number, number] = [0, 0, 0];
          const obstacleBody = hit.collider.parent();
          if (obstacleBody) {
            const linear = obstacleBody.linvel();
            const angular = obstacleBody.angvel();
            const obstacleCentre = obstacleBody.worldCom();
            const hitPoint = [
              point[0] + normal[0] * hit.timeOfImpact,
              point[1] + normal[1] * hit.timeOfImpact,
              point[2] + normal[2] * hit.timeOfImpact,
            ] as const;
            const obstacleLever = [
              hitPoint[0] - obstacleCentre.x,
              hitPoint[1] - obstacleCentre.y,
              hitPoint[2] - obstacleCentre.z,
            ] as const;
            obstacleVelocity[0] =
              linear.x +
              angular.y * obstacleLever[2] -
              angular.z * obstacleLever[1];
            obstacleVelocity[1] =
              linear.y +
              angular.z * obstacleLever[0] -
              angular.x * obstacleLever[2];
            obstacleVelocity[2] =
              linear.z +
              angular.x * obstacleLever[1] -
              angular.y * obstacleLever[0];
          }
          readings.push({
            sensorIndex: sensorIndex,
            localNormal: sensor.normal as [number, number, number],
            worldNormal: normal,
            lever,
            distance: hit.timeOfImpact,
            relativeClosingSpeed:
              (pointVelocity[0] - obstacleVelocity[0]) * normal[0] +
              (pointVelocity[1] - obstacleVelocity[1]) * normal[1] +
              (pointVelocity[2] - obstacleVelocity[2]) * normal[2],
          });
        }

        const verticalClearance = (
          point: readonly [number, number, number] | null,
          direction: 1 | -1,
        ): number => {
          if (!point) {
            return 0;
          }
          obstacleRay.current ??= new rapier.Ray(
            { x: 0, y: 0, z: 0 },
            { x: 0, y: direction, z: 0 },
          );
          obstacleRay.current.origin.x = point[0];
          obstacleRay.current.origin.y = point[1];
          obstacleRay.current.origin.z = point[2];
          obstacleRay.current.dir.x = 0;
          obstacleRay.current.dir.y = direction;
          obstacleRay.current.dir.z = 0;
          const hit = rapierWorld.castRay(
            obstacleRay.current,
            OBSTACLE_ESCAPE_CLEARANCE,
            true,
            undefined,
            VEHICLE_CONTACT_QUERY,
            undefined,
            carrierBody,
            (collider) => {
              const handle = collider.parent()?.handle;
              return handle === undefined || !ownBodyHandles?.has(handle);
            },
          );
          return hit?.timeOfImpact ?? Number.POSITIVE_INFINITY;
        };
        const availability =
          autopilotModel.engineAvailability ??
          frame.flight.limits.enginePoints.map(() => 1);
        const summedAvailability = availability.reduce(
          (sum, fraction) => sum + fraction,
          0,
        );
        const directionalPower = usesRotorDynamics
          ? Math.min(
              frame.flight.limits.enginePower,
              frame.flight.limits.lateralThrust ??
                frame.flight.limits.enginePower,
            )
          : frame.flight.limits.enginePower;
        return {
          readings,
          availableDeceleration:
            (directionalPower * summedAvailability) / Math.max(1, mass.mass),
          climbClearance: verticalClearance(topPoint, 1),
          descentClearance: verticalClearance(bottomPoint, -1),
        };
      };
      const senseObstacleSafety = (
        plan: VehicleRoutePlan,
        progress: number,
      ): VehicleSafetyAdvisory | null => {
        const berthPoint = plan.point(1);
        // A mast, platform or pier is expected geometry while casting off and
        // on final. Near-contact sensors remain active there; only predictive
        // intervention is suppressed.
        if (
          vehicleSafetySensingSuppressed({
            progress,
            finalFrom: plan.finalFrom,
            berthDistance: Math.hypot(
              centreNow[0] - berthPoint[0],
              centreNow[1] - berthPoint[1],
              centreNow[2] - berthPoint[2],
            ),
          })
        ) {
          return null;
        }
        const field = senseObstacleField(
          flight?.pilot?.sensorAssistEnabled === true,
        );
        if (field.readings.length === 0) {
          if (flight?.pilot) {
            flight.pilotObstacleReadings = [];
            flight.pilotIntervenedSensors.clear();
          }
          return null;
        }
        const advisory = vehicleSafetyAdvisory(
          field.readings as readonly VehicleObstacleSample[],
          field.availableDeceleration,
          field.climbClearance,
          field.descentClearance,
        );
        if (flight?.pilot?.sensorAssistEnabled) {
          flight.pilotObstacleReadings = field.readings;
          flight.pilotIntervenedSensors.clear();
          if (advisory?.risk === "intervention") {
            const threat = field.readings
              .filter((reading) => reading.relativeClosingSpeed > 0.2)
              .sort(
                (left, right) =>
                  left.distance / left.relativeClosingSpeed -
                  right.distance / right.relativeClosingSpeed,
              )[0];
            if (threat) {
              flight.pilotIntervenedSensors.add(threat.sensorIndex);
            }
          }
        }
        return advisory;
      };
      const flyRoutePlan = (
        plan: VehicleRoutePlan,
        progress: number,
        startRamp: number,
        /** Authored plan that owns the berth while a temporary plan is flown. */
        berthPlan: VehicleRoutePlan = plan,
        berthProgress: number = progress,
      ) => {
        const controlledPlan = driveUsesPropulsionFeedback(
          frame.flight.driveAnimation,
        )
          ? speedLimitedPlan(plan, flightClearance.speedFactor)
          : plan;
        const sensedSafety = senseObstacleSafety(berthPlan, berthProgress);
        // H owns a deliberately direct return. Proximity assistance may stop
        // that request, but climbing or diving around the obstruction would
        // already be route planning — a separate future capability.
        const safetyAdvisory =
          sensedSafety && flight?.pilot?.returnPlan === berthPlan
            ? { ...sensedSafety, altitudeOffset: 0 }
            : sensedSafety;
        if (flight) {
          flight.safetyAdvisory = safetyAdvisory;
        }
        const piloted = autopilot(
          controlledPlan,
          progress,
          centreNow,
          state.body.orientation,
          state.body.velocity,
          state.body.angularVelocity,
          autopilotModel,
          startRamp,
          frame.nose as [number, number, number],
          frame.flight.approach,
          safetyInterventionForMode("assisted", safetyAdvisory),
        );
        liftCommand = piloted.controls.liftTrim;
        if (usesRotorDynamics) {
          // Общий автопилот заканчивается здесь. Mixer коптера ниже сам
          // создаст шесть throttle-команд, проведёт их через физические
          // актуаторы и только затем превратит фактические обороты в силы.
          // Корабельные throttle/rudder к этим каналам больше не прикасаются.
          rotorGuidance = piloted.guidance;
          return piloted;
        }
        const driveThrottle = piloted.controls.throttle;
        const actuation = executeCommandActuators(
          frame.actuators,
          attachedMembers,
          {
            ...Object.fromEntries(
              driveThrottle.map((value, index) => [`throttle:${index}`, value]),
            ),
            rudder: piloted.controls.rudder,
          },
        );
        const deliveredThrottle = driveThrottle.map((value, index) =>
          deliveredCommandValue(actuation, `throttle:${index}`, value),
        );
        // Фаза винтов идёт за ДОСТАВЛЕННОЙ командой всегда, а не только в
        // рейсе. Пока это жило внутри `if (flight)`, машина на аварийном
        // снижении спускалась С ВЫКЛЮЧЕННЫМИ ВИНТАМИ: рейса уже нет, а
        // восстановление винты крутить не умело. Для плавучей машины это
        // всего лишь некрасиво, для винтокрылой — физически невозможно: она
        // снижается именно потому, что винты работают.
        for (let engine = 0; engine < state.spinAngles.length; engine += 1) {
          state.spinAngles[engine] = advanceDrivePhase(
            state.spinAngles[engine] ?? 0,
            frame.flight.driveAnimation.phaseSpeed,
            (frame.flight.driveAnimation.kind === "propeller"
              ? driveThrottle[engine]
              : deliveredThrottle[engine]) ?? 0,
            step,
          );
        }
        if (flight) {
          flight.driveThrottle = driveThrottle;
          flight.throttle = deliveredThrottle;
          if (driveUsesPropulsionFeedback(frame.flight.driveAnimation)) {
            flight.propulsionFeedback = updatePropulsionFeedback(
              flight.propulsionFeedback,
              actuation,
              frame.flight.limits.enginePoints.length,
            );
          }
        }
        // Боковая власть падает вместе с кольцами: она рождается теми же
        // движителями, поэтому масштабируется их средней уцелевшей долей.
        const swayAvailability =
          propulsion.fractions.length > 0
            ? propulsion.fractions.reduce((sum, value) => sum + value, 0) /
              propulsion.fractions.length
            : 1;
        const executedControls = {
          ...piloted.controls,
          throttle: deliveredThrottle,
          rudder: deliveredCommandValue(
            actuation,
            "rudder",
            piloted.controls.rudder,
          ),
          sway: (piloted.controls.sway ?? 0) * swayAvailability,
        };
        for (const applied of shipForces(
          executedControls,
          centreNow,
          mass.centre as [number, number, number],
          state.body.orientation,
          frame.flight.limits,
          frame.nose as [number, number, number],
          Math.hypot(state.body.velocity[0], state.body.velocity[2]),
        )) {
          controls.push({
            force: applied.force as [number, number, number],
            point: applied.point as [number, number, number],
          });
        }
        return piloted;
      };

      // A route-following aircraft has no legitimate reason to remain loaded
      // on terrain. Confirm contact long enough to reject a bounce, then let
      // the ground-recovery lifecycle own an unconditional propulsion cutoff.
      if (
        flight?.castOff &&
        !state.recovery &&
        (!flight.pilot ||
          (flight.pilot.mode === "return" && !pilotManualOverride))
      ) {
        // «Неожиданный контакт с грунтом» — это контакт там, где его не
        // предполагает МАРШРУТ. Спрашивать надо у него: профиль высоты он уже
        // несёт, и на взлётном и посадочном участках требуемая высота равна
        // нулю. Стоящая там на шасси машина не теряет маршрут — она взлетает.
        //
        // Пока карта возила только плавучие машины, разницы не было: дирижабль
        // висит у мачты и земли не касается вовсе. Винтокрылый аппарат стоит
        // на шасси и первые секунды после отдачи концов физически обязан
        // опираться на землю, пока подъём выходит на вес, — и правило,
        // спрашивавшее вместо маршрута сам факт контакта, объявляло ему
        // «потерял маршрут» прямо на площадке.
        //
        // То же самое даром получают все будущие классы: у поезда на рельсах
        // и у судна на воде требуемая высота нулевая на всём маршруте.
        const groundPlan =
          flight.pilot?.returnPlan ??
          frame.flight.routePlan(flight.kind, berth);
        const requiredAltitude =
          groundPlan.altitude(flight.progress) - berth[1];
        flight.unexpectedGroundContactSeconds =
          state.supportContacts > 0 &&
          requiredAltitude > ROUTE_GROUND_ALTITUDE
            ? flight.unexpectedGroundContactSeconds + step
            : 0;
        if (
          flight.unexpectedGroundContactSeconds >=
          VEHICLE_GROUND_CONTACT_CONFIRM_SECONDS
        ) {
          flight.trajectoryCorrection = null;
          state.recovery = {
            lifecycle: createVehicleRecoveryLifecycle(
              "routeDivergence",
              "settleInPlace",
            ),
            progress: 0,
            escapePlan: null,
            arrivalInitialized: false,
            escapeStallSeconds: 0,
            escapeBestProgress: 0,
            landingStability: createVehicleLandingStability(
              state.body.position,
              state.body.orientation,
            ),
            groundContactSeconds: VEHICLE_GROUND_CONTACT_CONFIRM_SECONDS,
            groundContactLatched: true,
            groundLiftAutomation: createVehicleGroundLiftAutomation(),
          };
          onVehicleFailure?.({
            sourceId: frame.clusterId,
            sourceLabel: frame.telemetryLabel ?? frame.id.toUpperCase(),
            reason: "routeDivergence",
          });
        }
      }

      // "Can it still fly away" is a question about propulsion, steering,
      // structure and lift. It is asked when a flight is lost — and asked
      // again while an escape is being flown, because losing the last engine
      // in the middle of one makes the original answer false.
      const currentDisposition = (): VehicleFailureDisposition => {
        const availability = executeCommandActuators(
          frame.actuators,
          attachedMembers,
          Object.fromEntries(
            frame.actuators.map((actuator) => [actuator.commandChannel, 1]),
          ),
        )
          .filter(
            (execution) => !isVehicleTrimChannel(execution.commandChannel),
          )
          .map((execution) => execution.attachedFraction);
        const overServiceArea = recoveryServiceArea
          ? Math.hypot(
              centreNow[0] - recoveryServiceArea.center[0],
              centreNow[2] - recoveryServiceArea.center[1],
            ) <= recoveryServiceArea.radius
          : true;
        return vehicleFailureDisposition(
          {
            structureFlightworthy:
              mass.mass / Math.max(1, state.intactMass) >= 0.55 &&
              envelopeLeft / Math.max(1, state.intactEnvelope) >= 0.5,
            liftToWeight: liftCapacity / Math.max(1, neutral),
            requiredActuatorFractions: availability,
            rotorLift: liftHold ?? undefined,
          },
          overServiceArea,
        );
      };

      const recovery = state.recovery;
      if (recovery && flight?.castOff) {
        if (recovery.lifecycle.phase === "escape") {
          // An escape is a claim that the machine can leave under its own
          // power. Re-ask it: a carrier that has lost its engines mid-escape
          // must come down, not hold the climb its route asks for.
          const disposition = currentDisposition();
          recovery.escapeStallSeconds =
            recovery.progress > recovery.escapeBestProgress + 0.002
              ? 0
              : recovery.escapeStallSeconds + step;
          recovery.escapeBestProgress = Math.max(
            recovery.escapeBestProgress,
            recovery.progress,
          );
          const goingNowhere =
            recovery.escapeStallSeconds >= ESCAPE_STALL_SECONDS;
          if (disposition !== "escapeRoute" || goingNowhere) {
            recovery.lifecycle = createVehicleRecoveryLifecycle(
              recovery.lifecycle.reason,
              disposition === "escapeRoute" ? "descendBelowFog" : disposition,
            );
            recovery.escapePlan = null;
          }
        }
        const phase = recovery.lifecycle.phase;
        const plan =
          phase === "escape"
            ? recovery.escapePlan
            : phase === "arrival"
              ? frame.flight.arrivalPlan(berth)
              : null;
        if (plan) {
          flyRoutePlan(plan, recovery.progress, 1);
          const travelled =
            Math.hypot(state.body.velocity[0], state.body.velocity[2]) * step;
          recovery.progress = advanceVehicleRouteProgress(
            plan,
            recovery.progress,
            centreNow,
            travelled,
          );
          flight.progress = recovery.progress;
        } else {
          flight.driveThrottle = frame.flight.limits.enginePoints.map(() => 0);
          flight.throttle = frame.flight.limits.enginePoints.map(() => 0);
          flight.safetyAdvisory = null;
          // A ground recovery still owns its lift valve even when propulsion
          // is gone. It regulates a safe descent speed through real force;
          // only an off-island descent deliberately keeps minimum lift.
          if (phase === "landing") {
            const wantedAcceleration =
              (RECOVERY_LANDING_DESCENT_SPEED - state.body.velocity[1]) *
              RECOVERY_LANDING_VERTICAL_RESPONSE;
            liftCommand = Math.max(
              -1,
              Math.min(
                1,
                wantedAcceleration /
                  (GRAVITY * frame.flight.limits.liftTrimRange),
              ),
            );
          } else {
            liftCommand = -1;
          }
        }
      } else if (
        flight &&
        flight.pilot &&
        (flight.pilot.mode !== "return" || pilotManualOverride)
      ) {
        const forwardAxis =
          Number(pilotControlsNow.forward) -
          Number(pilotControlsNow.backward);
        const horizontalAxis =
          Number(pilotControlsNow.right) - Number(pilotControlsNow.left);
        const manualDescent =
          (pilotControlsNow.run && forwardAxis < -1e-6) ||
          (commands?.altitudeDelta ?? 0) < -1e-6;
        const pilotAttitude = vehicleAttitude(
          state.body.orientation,
          frame.nose,
        );
        const pilotStep = advanceRotorcraftPilot(
          flight.pilot,
          {
            forwardAxis,
            horizontalAxis,
            translationModifier: pilotControlsNow.run,
            altitudeDelta: commands?.altitudeDelta ?? 0,
            brake: pilotControlsNow.jump,
            requestSafeClimb: commands?.requestSafeClimb ?? false,
            requestReturn: commands?.requestReturn ?? false,
            requestToggleSensors: commands?.requestToggleSensors ?? false,
            requestDisarm: commands?.requestDisarm ?? false,
          },
          {
            relativeAltitude: state.body.position[1],
            verticalSpeed: state.body.velocity[1],
            grounded: state.supportContacts > 0,
            groundSpeed: Math.hypot(
              state.body.velocity[0],
              state.body.velocity[2],
            ),
            uprightCos: Math.cos(pilotAttitude.pitch) * Math.cos(pilotAttitude.roll),
            angularSpeed: Math.hypot(...state.body.angularVelocity),
            deltaSeconds: step,
            liftTrimRange: frame.flight.limits.liftTrimRange,
            safeAltitude: ROTORCRAFT_PILOT_SAFE_ALTITUDE,
          },
        );
        flight.pilot = pilotStep.state;
        let manualGuidance = pilotStep.guidance;
        if (pilotStep.state.sensorAssistEnabled) {
          const field = senseObstacleField(true);
          const forward = rotateByQuaternion(
            state.body.orientation,
            frame.nose,
          );
          const forwardLength = Math.hypot(forward[0], forward[2]) || 1;
          const forwardFlat = [
            forward[0] / forwardLength,
            forward[2] / forwardLength,
          ] as const;
          const assisted = constrainRotorcraftGuidance(
            manualGuidance,
            field.readings,
            {
              forward: forwardFlat,
              starboard: [-forwardFlat[1], forwardFlat[0]],
              verticalSpeed: state.body.velocity[1],
              horizontalDeceleration: field.availableDeceleration,
              verticalDeceleration:
                GRAVITY * frame.flight.limits.liftTrimRange,
              liftTrimRange: frame.flight.limits.liftTrimRange,
              grounded: state.supportContacts > 0,
              landingIntent: manualDescent,
            },
          );
          manualGuidance = assisted.guidance;
          flight.pilotObstacleReadings = field.readings;
          flight.pilotIntervenedSensors.clear();
          for (const sensorIndex of assisted.intervenedSensorIndices) {
            flight.pilotIntervenedSensors.add(sensorIndex);
          }
        } else {
          flight.pilotObstacleReadings = [];
          flight.pilotIntervenedSensors.clear();
        }
        rotorGuidance = manualGuidance;
        liftCommand = manualGuidance.liftFraction;
        flight.safetyAdvisory = null;

        if (pilotStep.disarmRequested) {
          // Ending a manual flight is allowed on any stable physical support,
          // not only on the authored pad. The ordinary occupied-seat action
          // then becomes `stand`, so Space releases the pilot beside the craft.
          state.flight = null;
          liftCommand = -frame.flight.limits.liftTrimRange;
        }

        if (pilotStep.readyToBuildReturn) {
          const returnPlan = createRotorcraftPilotReturnPlan(
            centreNow,
            berth,
            ROTORCRAFT_PILOT_SAFE_ALTITUDE,
          );
          flight.pilot = {
            ...pilotStep.state,
            mode: "return",
            returnPlan,
          };
          flight.progress = 0;
          flight.watchdog = rebaseVehicleFailureWatchdog(
            flight.watchdog,
            0,
          );
        }

        // Manual guidance has no route deviation, but it has exactly the same
        // physical failure supervision as an automatic flight. Losing command
        // authority must still hand the craft to emergency recovery.
        const attitude = pilotAttitude;
        const rotorControlAvailable =
          state.rotorAuthority !== null &&
          rotorcraftCommandsExecute(state.rotorAuthority);
        const deliveredFraction = state.rotorAuthority
          ? Math.min(
              state.rotorAuthority.thrust,
              state.rotorAuthority.pitch,
              state.rotorAuthority.roll,
            )
          : 0;
        const requestedEffort = Math.max(
          Math.abs(manualGuidance.forwardSpeed) / 12,
          Math.abs(manualGuidance.lateralSpeed) / 8,
          Math.abs(manualGuidance.yawRate) / ROTOR_YAW_RATE,
        );
        const requestedLiftTrim = normalizedLiftTrimRequest(
          manualGuidance.liftFraction,
          frame.flight.limits.liftTrimRange,
        );
        const supervisingManualFlight =
          !pilotStep.disarmRequested && rotorcraftPilotNeedsFlightSupervision(
            pilotStep.state,
            flight.castOff,
            state.supportContacts > 0,
          );
        const watchdogResult = supervisingManualFlight
          ? advanceVehicleFailureWatchdog(
              flight.watchdog,
              {
                deltaSeconds: step,
                relativeAltitude: state.body.position[1],
                pitch: attitude.pitch,
                roll: attitude.roll,
                headingError: 0,
                yawRateError:
                  state.body.angularVelocity[1] -
                  (state.rotorAcceptedYawRate ?? manualGuidance.yawRate),
                crossTrackError: 0,
                altitudeError: 0,
                progress: 0.5,
                routeProgressTracked: false,
                requiredControlAvailable: rotorControlAvailable,
                requestedControlEffort: requestedEffort,
                deliveredControlFraction: deliveredFraction,
                requestedLiftEffort: Math.max(0, requestedLiftTrim),
                deliveredLiftFraction: deliveredLiftControlFraction(
                  requestedLiftTrim,
                  frame.flight.limits.liftTrimRange,
                  liftCapacity / Math.max(1, neutral),
                ),
                goArounds: 0,
                corrections: 0,
                trimAuthorityExhausted: state.trimExhaustedSeconds > 0,
                turning: Math.abs(state.body.angularVelocity[1]) > 0.1,
                inFinalManeuver: false,
                // Manual flight has no docking objective. Zero is a finite
                // inactive value; Infinity is an invalid physical state.
                dockingDistance: 0,
                inDockingCapture: false,
                dockingComplete: false,
                recoveringDisturbance: false,
              },
              failureEnvelope,
            )
          : {
              state: rebaseVehicleFailureWatchdog(flight.watchdog, 0.5),
              failure: null,
            };
        flight.watchdog = watchdogResult.state;
        if (watchdogResult.failure) {
          const disposition = currentDisposition();
          const forward = rotateByQuaternion(
            state.body.orientation,
            frame.nose,
          );
          state.recovery = {
            lifecycle: createVehicleRecoveryLifecycle(
              watchdogResult.failure,
              disposition,
            ),
            progress: 0,
            escapePlan:
              disposition === "escapeRoute"
                ? frame.flight.escapePlan(berth, {
                    start: state.body.position,
                    forward,
                  })
                : null,
            arrivalInitialized: false,
            escapeStallSeconds: 0,
            escapeBestProgress: 0,
            landingStability: createVehicleLandingStability(
              state.body.position,
              state.body.orientation,
            ),
            groundContactSeconds: 0,
            groundContactLatched: false,
            groundLiftAutomation: createVehicleGroundLiftAutomation(),
          };
          onVehicleFailure?.({
            sourceId: frame.clusterId,
            sourceLabel: frame.telemetryLabel ?? frame.id.toUpperCase(),
            reason: watchdogResult.failure,
          });
        }
      } else if (flight && flight.castOff) {
        const plan =
          flight.pilot?.returnPlan ??
          frame.flight.routePlan(flight.kind, berth);
        const beforeRecoveryTracking = routeTrackingState(
          plan,
          flight.progress,
          centreNow,
          state.body.orientation,
          frame.nose,
        );
        const tilt = Math.hypot(
          beforeRecoveryTracking.pitch,
          beforeRecoveryTracking.roll,
        );
        const tiltAngularSpeed = Math.hypot(
          state.body.angularVelocity[0],
          state.body.angularVelocity[2],
        );
        const tiltInertia = Math.max(1, mass.inertia[0], mass.inertia[8]);
        const rightingLever = Math.max(
          0,
          (state.trimCentre ?? frame.liftCentre)[1] - mass.centre[1],
        );
        const rightingAcceleration =
          (state.liftNow *
            rightingLever *
            Math.max(0.12, Math.sin(Math.min(Math.PI / 2, tilt)))) /
            tiltInertia +
          (frame.flight.angularDamping * mass.inertia[4] * tiltAngularSpeed) /
            tiltInertia;
        const previousDelivery =
          propulsion.mode === "inoperative"
            ? 0
            : deliveredControlFraction(flight.driveThrottle, flight.throttle);
        const activeFailureEnvelope =
          failureEnvelope ?? DEFAULT_VEHICLE_FAILURE_ENVELOPE;
        const disturbanceFeasible = vehicleDisturbanceRecoveryFeasible({
          pitch: beforeRecoveryTracking.pitch,
          roll: beforeRecoveryTracking.roll,
          tiltAngularSpeed,
          rightingAngularAcceleration: rightingAcceleration,
          liftToWeight: liftCapacity / Math.max(1, neutral),
          requiredControlAvailable: propulsion.mode !== "inoperative",
          deliveredControlFraction: previousDelivery,
          relativeAltitude: state.body.position[1],
          verticalSpeed: state.body.velocity[1],
          minimumRelativeAltitude:
            activeFailureEnvelope.minimumRelativeAltitude,
        });
        const navigationState = {
          position: centreNow,
          orientation: state.body.orientation,
          velocity: state.body.velocity,
          angularVelocity: state.body.angularVelocity,
        };
        const trajectoryAssessment = assessVehicleTrajectory(
          plan,
          flight.progress,
          navigationState,
          frame.nose,
          autopilotModel,
          guidance,
        );
        const requestedTrajectoryMode =
          requestedVehicleTrajectoryMode(trajectoryAssessment);
        if (!flight.trajectoryCorrection && requestedTrajectoryMode !== "authoredRoute") {
          // One autopilot changing modes. A route state ordinary guidance can
          // no longer reach in the distance left asks for an intercept; a rate
          // event large enough to own the craft asks for a hold. Being pushed
          // off the line, by bullets or anything else, is neither by itself:
          // the ordinary controls and the trim cars answer that all the time.
          const directCorrection =
            requestedTrajectoryMode === "intercepting"
              ? planVehicleTrajectoryCorrection(
                  plan,
                  flight.progress,
                  navigationState,
                  autopilotModel,
                  frame.nose,
                )
              : null;
          // An intercept is ordinary flying and needs no claim about arresting
          // anything. A hold does: it asserts the craft can still stop what is
          // happening to it. Without either, the present mode simply continues
          // and the transition is reconsidered from fresh navigation data.
          if (
            directCorrection ||
            (requestedTrajectoryMode === "stabilizing" && disturbanceFeasible)
          ) {
            flight.trajectoryCorrection = {
              phase: directCorrection ? "intercepting" : "stabilizing",
              reason: trajectoryAssessment.reason ?? "track",
              sourceProgress: flight.progress,
              elapsedSeconds: 0,
              stableSeconds: 0,
              correction: directCorrection,
              correctionProgress: 0,
              goAroundCounted: directCorrection?.countsAsGoAround ?? false,
              allowanceSeconds: vehicleCorrectionAllowanceSeconds(
                directCorrection,
                activeFailureEnvelope.correctionGraceSeconds,
              ),
            };
            if (directCorrection) {
              // Only a real re-approach is an attempt. Riding out an upset is
              // not, and must not spend the flight's budget.
              flight.corrections += 1;
              if (directCorrection.countsAsGoAround) {
                flight.lastGoAround = flight.time;
                flight.goArounds += 1;
              }
            }
          }
        }
        const trajectoryCorrection = flight.trajectoryCorrection;
        if (trajectoryCorrection) {
          trajectoryCorrection.elapsedSeconds += step;
          if (
            trajectoryCorrection.phase === "intercepting" &&
            trajectoryAssessment.upset
          ) {
            // Only a genuine upset may take an intercept away, and only after
            // it has had time to be flown. Discarding a valid plan on every
            // swing of the gondola is what made the machine change modes
            // instead of correcting.
            if (trajectoryCorrection.elapsedSeconds > INTERCEPT_COMMITMENT) {
              trajectoryCorrection.phase = "stabilizing";
              trajectoryCorrection.stableSeconds = 0;
              trajectoryCorrection.correction = null;
              trajectoryCorrection.correctionProgress = 0;
            }
          }
          if (trajectoryCorrection.phase === "stabilizing") {
            // The upset is over when the rates say so. Nothing is asked about
            // the attitude it left behind: the flight simply resumes, and the
            // ordinary approach, go-around and failure machinery decide
            // whether it can still be finished.
            trajectoryCorrection.stableSeconds = vehicleUpsetSettled(
              navigationState,
              guidance,
            )
              ? trajectoryCorrection.stableSeconds + step
              : 0;
            if (trajectoryCorrection.stableSeconds >= UPSET_SETTLE_SECONDS) {
              flight.trajectoryCorrection = null;
            }
          }
        }

        let piloted: ReturnType<typeof autopilot>;
        if (
          trajectoryCorrection?.phase === "intercepting" &&
          trajectoryCorrection.correction
        ) {
          const correction = trajectoryCorrection.correction;
          piloted = flyRoutePlan(
            correction.plan,
            trajectoryCorrection.correctionProgress,
            1,
            plan,
            flight.progress,
          );
          const travelled =
            Math.hypot(state.body.velocity[0], state.body.velocity[2]) * step;
          trajectoryCorrection.correctionProgress = advanceVehicleRouteProgress(
            correction.plan,
            trajectoryCorrection.correctionProgress,
            centreNow,
            travelled,
          );
          const actualMergeProgress = rejoinVehicleRouteProgress(
            plan,
            correction.mergeProgress,
            centreNow,
            0.04,
            0.12,
          );
          const sameAuthoredManeuver =
            (plan.travelDirection?.(actualMergeProgress) ?? 1) ===
            (plan.travelDirection?.(correction.mergeProgress) ?? 1);
          if (
            trajectoryCorrection.correctionProgress >= 0.8 &&
            sameAuthoredManeuver &&
            vehicleTrajectoryMergeReady(
              plan,
              actualMergeProgress,
              navigationState,
              frame.nose,
              guidance,
            )
          ) {
            flight.progress = actualMergeProgress;
            // Only the progress reference moves. Clearing the watchdog here
            // would hand a repeatedly deviating craft a fresh set of timers
            // and a fresh correction grace budget on every merge.
            flight.watchdog = rebaseVehicleFailureWatchdog(
              flight.watchdog,
              flight.progress,
            );
            flight.trajectoryCorrection = null;
          }
        } else if (trajectoryCorrection) {
          piloted = flyRoutePlan(
            vehicleTrajectoryStabilizationPlan(
              plan,
              trajectoryCorrection.sourceProgress,
              navigationState,
              frame.nose,
            ),
            0,
            1,
            plan,
            trajectoryCorrection.sourceProgress,
          );
        } else {
          // Authored-route mode uses the same autopilot and physical machine
          // passport as both recovery modes; only its active plan differs.
          piloted = flyRoutePlan(
            plan,
            flight.progress,
            Math.max(
              0,
              Math.min(1, (flight.time - frame.flight.underwaySeconds) / 8),
            ),
          );
          if (piloted.goAround && flight.time - flight.lastGoAround > 20) {
            flight.lastGoAround = flight.time;
            flight.goArounds += 1;
            flight.corrections += 1;
            flight.trajectoryCorrection = {
              phase: "stabilizing",
              reason: "track",
              sourceProgress: flight.progress,
              elapsedSeconds: 0,
              stableSeconds: 0,
              correction: null,
              correctionProgress: 0,
              goAroundCounted: true,
              allowanceSeconds: vehicleCorrectionAllowanceSeconds(
                null,
                activeFailureEnvelope.correctionGraceSeconds,
              ),
            };
          }
        }
        // The episode owns its own allowance; the flight-wide grace budget in
        // the watchdog remains the backstop against endless re-entry.
        const recoveringDisturbance =
          flight.trajectoryCorrection !== null &&
          flight.trajectoryCorrection.elapsedSeconds <
            flight.trajectoryCorrection.allowanceSeconds;
        // Ход по маршруту двигает сам корабль: сколько прошёл, на столько и
        // сдвинулась цель.
        if (
          !flight.trajectoryCorrection &&
          flight.time >= frame.flight.underwaySeconds
        ) {
          const travelled =
            Math.hypot(state.body.velocity[0], state.body.velocity[2]) * step;
          flight.progress = advanceVehicleRouteProgress(
            plan,
            flight.progress,
            centreNow,
            travelled,
          );
          if (
            !flight.handoffRequested &&
            flight.progress >= 0.985 &&
            isInterIslandTransferKind(flight.kind)
          ) {
            flight.handoffRequested = true;
            const passenger = bodies.current.get("player");
            const worldEye: [number, number, number] = [
              camera.position.x,
              camera.position.y,
              camera.position.z,
            ];
            const localEye = shipLocalPoint(
              worldEye,
              frame.origin,
              state.pose,
              frame.nose,
            );
            const passengerInsideCarrier = Boolean(
              passenger && frame.passengerFlight?.contains(localEye),
            );
            let passengerHandoff: InterIslandPassengerHandoff | null = null;
            if (passenger && frame.passengerFlight && passengerInsideCarrier) {
              const passengerPosition = passenger.translation();
              const worldLever: [number, number, number] = [
                passengerPosition.x - centreNow[0],
                passengerPosition.y - centreNow[1],
                passengerPosition.z - centreNow[2],
              ];
              const inheritedVelocity = bodyPointVelocity(
                state.body,
                worldLever,
              );
              const passengerVelocity = passenger.linvel();
              const inverseOrientation: [number, number, number, number] = [
                -state.body.orientation[0],
                -state.body.orientation[1],
                -state.body.orientation[2],
                state.body.orientation[3],
              ];
              const relativeVelocity = rotateByQuaternion(inverseOrientation, [
                passengerVelocity.x - inheritedVelocity[0],
                passengerVelocity.y - inheritedVelocity[1],
                passengerVelocity.z - inheritedVelocity[2],
              ]);
              camera.getWorldDirection(handoffLookDirection.current);
              const localLookDirection = rotateByQuaternion(
                inverseOrientation,
                [
                  handoffLookDirection.current.x,
                  handoffLookDirection.current.y,
                  handoffLookDirection.current.z,
                ],
              );
              passengerHandoff = {
                eyeOffset: carrierVector(
                  [
                    localEye[0] - frame.passengerFlight.point[0],
                    localEye[1] - frame.passengerFlight.point[1],
                    localEye[2] - frame.passengerFlight.point[2],
                  ],
                  frame.nose,
                ),
                relativeVelocity: carrierVector(relativeVelocity, frame.nose),
                lookDirection: carrierVector(localLookDirection, frame.nose),
              };
            }
            onInterIslandBoundary?.(flight.kind, passengerHandoff);
          }
        }

        const tracking = routeTrackingState(
          plan,
          flight.progress,
          centreNow,
          state.body.orientation,
          frame.nose,
        );
        const berthDistance = Math.hypot(capture.offset[0], capture.offset[2]);
        const dockingComplete = isDockingComplete(
          flight.progress,
          capture.offset,
          state.body.orientation,
          capture.velocity,
          state.body.angularVelocity as [number, number, number],
          frame.nose,
          frame.flight.approach,
          frame.flight.docking,
        );
        const requestedEffort = Math.max(
          0,
          ...flight.driveThrottle.map(Math.abs),
        );
        const rotorControlAvailable =
          !usesRotorDynamics ||
          (state.rotorAuthority !== null &&
            rotorcraftCommandsExecute(state.rotorAuthority));
        const rotorDeliveredControlFraction = state.rotorAuthority
          ? Math.min(
              state.rotorAuthority.thrust,
              state.rotorAuthority.pitch,
              state.rotorAuthority.roll,
            )
          : 0;
        const requestedLiftEffort = Math.max(0, liftCommand);
        const liftDelivery = deliveredLiftControlFraction(
          liftCommand,
          frame.flight.limits.liftTrimRange,
          liftCapacity / Math.max(1, neutral),
        );
        const unrecoverable = vehicleUnrecoverableDeviation(
          trajectoryAssessment,
          tracking.crossTrackError,
          tracking.altitudeError,
        );
        const watchdogResult = advanceVehicleFailureWatchdog(
          flight.watchdog,
          {
            deltaSeconds: step,
            relativeAltitude: state.body.position[1],
            pitch: tracking.pitch,
            roll: tracking.roll,
            headingError: tracking.headingError,
            yawRateError:
              state.body.angularVelocity[1] -
              (usesRotorDynamics
                ? (state.rotorAcceptedYawRate ?? piloted.guidance.yawRate)
                : piloted.desiredYawRate),
            // What guidance cannot fix, not how far the burst pushed it.
            // Both numbers now come from the question the corrector asks, so
            // it always acts first by construction.
            crossTrackError: unrecoverable.crossTrack,
            altitudeError: unrecoverable.altitude,
            progress: flight.progress,
            requiredControlAvailable:
              usesRotorDynamics
                ? rotorControlAvailable
                : propulsion.mode !== "inoperative",
            requestedControlEffort: requestedEffort,
            deliveredControlFraction:
              usesRotorDynamics
                ? rotorDeliveredControlFraction
                : propulsion.mode === "inoperative"
                ? 0
                : deliveredControlFraction(
                    flight.driveThrottle,
                    flight.throttle,
                  ),
            requestedLiftEffort,
            deliveredLiftFraction: liftDelivery,
            goArounds: flight.goArounds,
            corrections: flight.corrections,
            trimAuthorityExhausted: state.trimExhaustedSeconds > 0,
            // Requested yaw is intent, not motion. A jammed controller must
            // not hide route loss by asking forever for a turn that never came.
            turning: Math.abs(state.body.angularVelocity[1]) > 0.1,
            inFinalManeuver: flight.progress > 0.97 && berthDistance < 8,
            dockingDistance: berthDistance,
            inDockingCapture: isDockingSettleWindow(
              flight.progress,
              capture.offset,
              state.body.orientation,
              frame.nose,
              frame.flight.approach,
              frame.flight.docking,
            ),
            dockingComplete,
            recoveringDisturbance,
          },
          failureEnvelope,
        );
        flight.watchdog = watchdogResult.state;
        if (watchdogResult.failure) {
          const disposition = currentDisposition();
          const forward = rotateByQuaternion(
            state.body.orientation,
            frame.nose,
          );
          state.recovery = {
            lifecycle: createVehicleRecoveryLifecycle(
              watchdogResult.failure,
              disposition,
            ),
            progress: 0,
            escapePlan:
              disposition === "escapeRoute"
                ? frame.flight.escapePlan(berth, {
                    start: state.body.position,
                    forward,
                  })
                : null,
            arrivalInitialized: false,
            escapeStallSeconds: 0,
            escapeBestProgress: 0,
            landingStability: createVehicleLandingStability(
              state.body.position,
              state.body.orientation,
            ),
            groundContactSeconds: 0,
            groundContactLatched: false,
            groundLiftAutomation: createVehicleGroundLiftAutomation(),
          };
          onVehicleFailure?.({
            sourceId: frame.clusterId,
            sourceLabel: frame.telemetryLabel ?? frame.id.toUpperCase(),
            reason: watchdogResult.failure,
          });
        }
      } else if (!flight) {
        // У причала корабль держит высоту балластом и клапаном — как это и
        // делается на настоящем судне.
        liftCommand = Math.max(
          -1,
          Math.min(
            1,
            (-0.06 * state.body.position[1] - 0.18 * state.body.velocity[1]) /
              frame.flight.limits.liftTrimRange,
          ),
        );
      } else if (flight) {
        // На отрыве моторы раскручиваются одинаково, но в направлении
        // первого участка: задний ход нельзя начинать ударом тарана в захват.
        if (!usesRotorDynamics) {
          const spool = vehicleSpoolCommand(
            frame.flight.routePlan(flight.kind, berth),
            flight.time,
            frame.flight.spoolSeconds,
          );
          const spoolRequest = frame.flight.limits.enginePoints.map(() => spool);
          const spoolYawArms = frame.flight.limits.enginePoints.map((point) => {
            const rx = point[0] - mass.centre[0];
            const rz = point[2] - mass.centre[2];
            return rz * frame.nose[0] - rx * frame.nose[2];
          });
          flight.driveThrottle = driveUsesPropulsionFeedback(
            frame.flight.driveAnimation,
          )
            ? allocateAutopilotEngineCommands(
                spool,
                0,
                spoolYawArms,
                flight.propulsionFeedback,
              )
            : spoolRequest;
          const actuation = executeCommandActuators(
            frame.actuators,
            attachedMembers,
            Object.fromEntries(
              flight.driveThrottle.map((value, index) => [
                `throttle:${index}`,
                value,
              ]),
            ),
          );
          flight.throttle = flight.driveThrottle.map((value, index) =>
            deliveredCommandValue(actuation, `throttle:${index}`, value),
          );
          if (driveUsesPropulsionFeedback(frame.flight.driveAnimation)) {
            flight.propulsionFeedback = updatePropulsionFeedback(
              flight.propulsionFeedback,
              actuation,
              frame.flight.limits.enginePoints.length,
            );
          }
        }
        // ОТСЧЁТ. Пока швартов не отдан, тот же регулятор держит причальную
        // высоту. После отдачи концов маршрутный регулятор выше сразу получает
        // требование UNSTICK_HEIGHT — отдельного режима подъёма и скачка между
        // двумя законами управления больше нет.
        liftCommand = Math.max(
          -1,
          Math.min(
            1,
            (-0.06 * state.body.position[1] - 0.18 * state.body.velocity[1]) /
              frame.flight.limits.liftTrimRange,
          ),
        );
      }

      // Точка приложения подъёма едет вместе с корпусом.
      // Подъём идёт к цели инерционно: за секунду он меняется не больше чем
      // на четверть веса — стравить газ и сбросить балласт мгновенно нельзя.
      const commandedLiftTarget = Math.min(
        liftCapacity,
        neutral * (1 + liftCommand * frame.flight.limits.liftTrimRange),
      );
      // Ground recovery is not mooring. A real underside contact opens the
      // lift-dump valve; the usual rate limit transfers weight to the terrain
      // gradually, and only the resulting contact friction removes momentum.
      let liftTarget = state.recovery?.groundContactLatched
        ? Math.min(
            commandedLiftTarget,
            neutral * state.recovery.groundLiftAutomation.targetFraction,
          )
        : commandedLiftTarget;
      // Потерявшая удержание машина падает: держать её нечем, и никакой
      // «мягкий клапан» тут не поможет — уцелевшие кольца не могут дать
      // вертикальную силу без опрокидывающего момента.
      if (state.recovery?.lifecycle.disposition === "tumble") {
        // Не «стравливаем газ», а теряем силу: подъёма больше нет и рампа
        // здесь неуместна. Общая рампа в четверть веса в секунду описывает
        // КЛАПАН, а у винтокрылой машины клапана нет — есть винты, которые
        // уже не могут дать вертикаль без опрокидывающего момента. Машина
        // падает камнем, а не опускается.
        liftTarget = 0;
        state.liftNow = 0;
      }
      // СЕВШАЯ МАШИНА ГЛУШИТ МОТОРЫ. Дирижабль у мачты обязан держать газ —
      // он на нём висит; коптер, стоящий на опорах, обязан их выключить.
      if (
        (frame.flight.liftSource ?? "buoyant") === "rotor" &&
        !state.flight &&
        !state.recovery &&
        state.supportContacts > 0
      ) {
        liftTarget = 0;
      }
      if (state.liftNow === 0) {
        state.liftNow = liftTarget;
      }
      // Lift belongs to gas volume that is still attached to the carrier.
      // A torn-away cell cannot keep lifting a tiny surviving skeleton. Mass
      // loss elsewhere is different: the intact gas remains, so the lighter
      // craft genuinely rises while its valves work back toward trim.
      state.liftNow = Math.min(state.liftNow, liftCapacity);
      const liftRate = state.intactMass * GRAVITY * 0.25 * step;
      state.liftNow += Math.max(
        -liftRate,
        Math.min(liftRate, liftTarget - state.liftNow),
      );
      const lift = state.liftNow;

      // ГДЕ ПРИЛОЖЕН ПОДЪЁМ. У газовой оболочки — в центре её объёма, и он
      // намеренно заморожен (§6.2: бегать за центром масс запрещено, иначе
      // повреждение перестаёт быть наблюдаемым). У винтокрылой машины сила
      // рождается в самих кольцах, поэтому потеря одного из шести уводит
      // точку приложения к оставшимся пяти — и машина получает настоящий
      // момент от асимметрии, с которым потом дерётся дифферентовка.
      // Высота при этом остаётся паспортной: маятник задан геометрией машины.
      const liftCentre = liftApplicationPoint(
        frame.flight.liftSource ?? "buoyant",
        state.trimCentre ?? frame.liftCentre,
        frame.flight.limits.enginePoints.map((point, index) => ({
          point,
          available: propulsion.fractions[index] ?? 0,
        })),
      );
      const liftArm = rotateByQuaternion(state.body.orientation, [
        liftCentre[0] - mass.centre[0],
        liftCentre[1] - mass.centre[1],
        liftCentre[2] - mass.centre[2],
      ]);
      const centre: readonly [number, number, number] = [
        mass.centre[0] + state.body.position[0],
        mass.centre[1] + state.body.position[1],
        mass.centre[2] + state.body.position[2],
      ];
      const mooring = {
        force: (isMooringCaptureEligible(
          capture.offset,
          state.body.orientation,
          frame.nose,
          frame.flight.approach,
          frame.flight.mooringReach,
        )
          ? mooringForce(
              capture.offset,
              capture.velocity,
              mass.mass,
              frame.flight.mooringReach,
            )
          : [0, 0, 0]) as [number, number, number],
        point: capture.point,
      };

      // Stable support is measured from Rapier contacts. The solver owns the
      // normal reaction and Coulomb friction; this channel reports only that
      // an upward-facing surface is persistently carrying the vehicle.
      state.supportContacts = physicalCarrier
        ? countUpwardSupportContacts(rapierWorld.narrowPhase, physicalCarrier)
        : 0;
      // Винтокрылая машина несёт себя КОЛЬЦАМИ, а не одной вертикалью в точке
      // подъёма. Отсюда всё её поведение: тяга каждого кольца своя, суммарный
      // вектор наклоняется вместе с корпусом, и разностью тяг рождаются момент
      // и рыскание. Дирижабль этой ветки не касается.
      //
      // Берётся ПРОСЬБА (`liftCommand` — после арбитража автоматики), а не
      // `lift`. `lift` уже прополз через балластную рампу оболочки: «стравить
      // газ и сбросить балласт мгновенно нельзя» — это про дирижабль. У винтов
      // балласта нет, их инерция — это запаздывание раскрутки, и жить ей
      // внутри винтовой модели, а не в клапане чужой оболочки.
      const rotorRecoveryPhase = state.recovery?.lifecycle.phase ?? null;
      const rotorEnabled =
        Boolean(state.flight) &&
        (rotorRecoveryPhase === null ||
          rotorRecoveryPhase === "escape" ||
          rotorRecoveryPhase === "descent" ||
          rotorRecoveryPhase === "landing" ||
          rotorRecoveryPhase === "arrival");
      const rotorLift = usesRotorDynamics
        ? rotorcraftFlightForces(
            frame,
            state,
            mass,
            centre,
            liftCommand,
            rotorGuidance,
            flight?.propulsionFeedback ?? propulsion.fractions,
            attachedMembers,
            rotorEnabled,
            step,
          )
        : null;
      const physicalForces = [
        { force: [0, -mass.mass * GRAVITY, 0], point: centre },
        ...(rotorLift
          ? rotorLift.forces
          : [
              {
                force: [0, lift, 0] as [number, number, number],
                point: [
                  centre[0] + liftArm[0],
                  centre[1] + liftArm[1],
                  centre[2] + liftArm[2],
                ] as [number, number, number],
              },
            ]),
        // Швартовка работает и на подходе: последние метры корабль
        // добирает тросом, а не моторами.
        // Швартов держит на отсчёте, отпускает на отходе и снова
        // принимает корабль на подходе.
        ...(state.recovery
          ? state.recovery.lifecycle.phase === "arrival" &&
            state.recovery.progress >= 0.9
            ? [mooring]
            : []
          : flight && flight.castOff && flight.progress < 0.9
            ? []
            : [mooring]),
        ...controls,
      ] as const;
      if (physicalCarrier) {
        const wakeForAppliedForces = Boolean(state.flight || state.recovery);
        for (const applied of physicalForces) {
          physicalCarrier.addForceAtPoint(
            {
              x: applied.force[0],
              y: applied.force[1],
              z: applied.force[2],
            },
            { x: applied.point[0], y: applied.point[1], z: applied.point[2] },
            wakeForAppliedForces,
          );
        }
        // Medium damping remains a real torque. Rapier owns the angular
        // integration, including gyroscopic response and collision moments.
        const angularDamping = frame.flight.angularDamping * mass.inertia[4];
        physicalCarrier.addTorque(
          {
            x: -angularDamping * state.body.angularVelocity[0],
            y: -angularDamping * state.body.angularVelocity[1],
            z: -angularDamping * state.body.angularVelocity[2],
          },
          wakeForAppliedForces,
        );
      }
      onFramePose?.({
        clusterId: frame.clusterId,
        origin: frame.origin,
        nose: frame.nose,
        pose: state.pose,
        linearVelocity: state.body.velocity,
        angularVelocity: state.body.angularVelocity,
        centreOfMass: [
          state.body.position[0] + mass.centre[0],
          state.body.position[1] + mass.centre[1],
          state.body.position[2] + mass.centre[2],
        ],
      });

      // A publisher exposes measurements, never presentation. The same
      // callback can later receive a train, lift or another compound carrier.
      const sourceId = frame.clusterId;
      const telemetryFlight = state.flight;
      const telemetryRecoveryPhase = state.recovery?.lifecycle.phase ?? null;
      const groundSpeed = Math.hypot(
        state.body.velocity[0],
        state.body.velocity[2],
      );
      const telemetryAvailable = motionTelemetryAvailable({
        active: Boolean(telemetryFlight?.castOff),
        airborne: state.supportContacts === 0,
        moving:
          groundSpeed > 0.15 ||
          Math.abs(state.body.velocity[1]) > 0.12 ||
          Math.hypot(...state.body.angularVelocity) > 0.035,
        suppressed:
          telemetryRecoveryPhase === "waiting" ||
          telemetryRecoveryPhase === "rebuilding",
        reportWhileStopped:
          telemetryRecoveryPhase === "landing" ||
          telemetryRecoveryPhase === "settled",
      });
      if (!telemetryAvailable || !telemetryFlight) {
        if (telemetryActiveSources.current.delete(sourceId)) {
          telemetryNextAt.current.delete(sourceId);
          onMotionTelemetryUpdate?.({ sourceId, snapshot: null });
        }
      } else if (onMotionTelemetryUpdate) {
        const now = performance.now();
        const nextAt = telemetryNextAt.current.get(sourceId) ?? 0;
        telemetryActiveSources.current.add(sourceId);
        if (now >= nextAt) {
          telemetryNextAt.current.set(sourceId, now + 125);
          const forward = rotateByQuaternion(
            state.body.orientation,
            frame.nose as [number, number, number],
          );
          const heading =
            ((Math.atan2(forward[0], -forward[2]) * 180) / Math.PI + 360) % 360;
          const attitude = vehicleAttitude(state.body.orientation, frame.nose);
          const telemetryBerth =
            (state.mass?.centre as [number, number, number] | undefined) ??
            frame.origin;
          const telemetryPlan =
            telemetryRecoveryPhase === "escape"
              ? (state.recovery?.escapePlan ?? null)
              : telemetryRecoveryPhase === "arrival"
                ? frame.flight.arrivalPlan(telemetryBerth)
                : telemetryRecoveryPhase
                  ? null
                  : telemetryFlight.pilot
                    ? telemetryFlight.pilot.returnPlan
                    : frame.flight.routePlan(
                        telemetryFlight.kind,
                        telemetryBerth,
                      );
          const telemetryProgress =
            telemetryRecoveryPhase === "escape" ||
            telemetryRecoveryPhase === "arrival"
              ? (state.recovery?.progress ?? 0)
              : telemetryFlight.progress;
          const metrics: MotionTelemetryMetric[] = [
            {
              id: "groundSpeed",
              value: groundSpeed * 3.6,
              unit: "km/h",
              precision: 0,
              activityDelta: 0.8,
            },
            {
              id: "relativeAltitude",
              value: state.body.position[1],
              unit: "m",
              precision: 1,
              signed: true,
              activityDelta: 0.2,
            },
            {
              id: "verticalSpeed",
              value: state.body.velocity[1],
              unit: "m/s",
              precision: 1,
              signed: true,
              activityDelta: 0.2,
            },
            {
              id: "heading",
              value: heading,
              unit: "deg",
              precision: 0,
              activityDelta: 1.2,
              circularRange: 360,
            },
            {
              id: "pitch",
              value: (attitude.pitch * 180) / Math.PI,
              unit: "deg",
              precision: 1,
              signed: true,
              activityDelta: 0.45,
            },
            {
              id: "roll",
              value: (attitude.roll * 180) / Math.PI,
              unit: "deg",
              precision: 1,
              signed: true,
              activityDelta: 0.45,
            },
            {
              id: "propellerRevolutions",
              value: engineValuesPortToStarboard(
                usesRotorDynamics
                  ? state.rotorMotorOutput
                  : telemetryFlight.driveThrottle,
                frame.flight.limits.enginePoints,
                state.mass?.centre ?? frame.origin,
                frame.nose,
              ).map((value) => value * 100),
              valueSides: ["left", "right"],
              valueStates: engineValuesPortToStarboard(
                propulsion.fractions,
                frame.flight.limits.enginePoints,
                state.mass?.centre ?? frame.origin,
                frame.nose,
              ).map((value) =>
                value < 1 - 1e-6 ? ("warning" as const) : ("normal" as const),
              ),
              unit: "percent",
              precision: 0,
              signed: true,
              activityDelta: 4,
            },
          ];
          // Trim position is a measurement, like every other instrument: the
          // car's own metres from zero, marked warning once it sits on a stop
          // or the whole channel has been shot away.
          const telemetryTrimRails = frame.trimRails ?? [];
          if (telemetryTrimRails.length > 0) {
            metrics.push({
              id: "trimCar",
              value: telemetryTrimRails.map(
                (_, index) => state.trim[index]?.position ?? 0,
              ),
              valueStates: telemetryTrimRails.map((_, index) =>
                (state.trimAvailable[index] ?? false) &&
                !(state.trim[index]?.atStop ?? false)
                  ? ("normal" as const)
                  : ("warning" as const),
              ),
              unit: "m",
              precision: 2,
              signed: true,
              activityDelta: 0.05,
            });
          }
          if (telemetryPlan) {
            metrics.push(
              {
                id: "routeProgress",
                value: telemetryProgress * 100,
                unit: "percent",
                precision: 0,
                activityDelta: 0.5,
              },
              {
                id: "distanceRemaining",
                value: Math.max(
                  0,
                  (1 - telemetryProgress) * telemetryPlan.length,
                ),
                unit: "m",
                precision: 0,
                activityDelta: 5,
              },
            );
          }
          onMotionTelemetryUpdate({
            sourceId,
            snapshot: {
              sourceId,
              sourceLabel: frame.telemetryLabel ?? frame.id.toUpperCase(),
              capturedAt: now,
              mode: telemetryRecoveryPhase
                ? undefined
                : telemetryFlight.trajectoryCorrection?.phase,
              phase: airVehicleFlightEventState(
                frame,
                telemetryFlight,
                state.recovery?.lifecycle ?? null,
              ),
              impact:
                state.telemetryImpact &&
                now - state.telemetryImpact.capturedAt <= 2_200
                  ? state.telemetryImpact
                  : undefined,
              metrics,
            },
          });
        }
      }
    }

    for (const frame of frames) {
      const state = frameState(frame.id);
      const pose = state.pose;
      const resting = isRestingPose(pose);
      if (resting && !state.moving) {
        continue;
      }

      state.velocity = state.body.velocity;
      state.suppressFrameVelocityOnce = false;
      state.previousPose = pose;

      const rotation = vehicleRotation(pose, frame.nose);
      for (const member of frame.members) {
        const piece = member.piece;
        const body = bodies.current.get(piece.id);
        if (!body) {
          continue;
        }
        if (brokenPieces.current.has(piece.id)) {
          // Отломанный кусок живёт своей жизнью — но улетает он ВМЕСТЕ с
          // кораблём: скорость кадра дарим ровно один раз.
          if (!state.released.has(piece.id)) {
            state.released.add(piece.id);
            if (body.bodyType() === rapier.RigidBodyType.Dynamic) {
              const current = body.linvel();
              const currentAngular = body.angvel();
              const massCentre = state.mass?.centre ?? frame.origin;
              const worldLever = rotateByQuaternion(state.body.orientation, [
                piece.position[0] - massCentre[0],
                piece.position[1] - massCentre[1],
                piece.position[2] - massCentre[2],
              ]);
              const inherited = bodyPointVelocity(state.body, worldLever);
              body.setLinvel(
                {
                  x: current.x + inherited[0],
                  y: current.y + inherited[1],
                  z: current.z + inherited[2],
                },
                true,
              );
              body.setAngvel(
                {
                  x: currentAngular.x + state.body.angularVelocity[0],
                  y: currentAngular.y + state.body.angularVelocity[1],
                  z: currentAngular.z + state.body.angularVelocity[2],
                },
                true,
              );
            }
          }
          continue;
        }
        // A docked articulated member has its own mechanism controller. The
        // carrier still supplies its frame pose, but must not write the same
        // Rapier body in the same physics step. In flight the mechanism is
        // locked and the carrier owns it again. This applies to every hinged
        // member in every compound cluster, not just this vehicle's door.
        if (!compoundCarrierOwnsMemberPose(piece, state.flight === null)) {
          continue;
        }
        if (body.bodyType() === rapier.RigidBodyType.Dynamic) {
          continue;
        }

        if (resting) {
          // Кадр вернулся в покой: возвращаем куску его авторское место и
          // снова делаем его частью неподвижного мира.
          if (body.bodyType() !== rapier.RigidBodyType.Fixed) {
            body.setBodyType(rapier.RigidBodyType.Fixed, true);
          }
          body.setTranslation(
            {
              x: piece.position[0],
              y: piece.position[1],
              z: piece.position[2],
            },
            false,
          );
          body.setRotation(member.baseQuaternion, false);
          continue;
        }

        if (body.bodyType() !== rapier.RigidBodyType.KinematicPositionBased) {
          body.setBodyType(rapier.RigidBodyType.KinematicPositionBased, true);
        }
        // Движитель сперва работает в собственном креплении, и только потом
        // его несёт кадр: винт крутится вокруг ступицы, весло — в уключине.
        let localPosition = piece.position;
        let own = member.baseQuaternion;
        if (member.trimRailIndex !== null && frame.trimRails) {
          // The car has one pose owner: this rail. Its authored position is
          // the zero, and the automation below moves it along the rail.
          localPosition = vehicleTrimCarPosition(
            frame.trimRails[member.trimRailIndex],
            state.trim[member.trimRailIndex] ?? createVehicleTrimRailState(),
          );
        }
        const spinAngle = state.spinAngles[member.engineIndex] ?? 0;
        if (member.spinHub && spinAngle !== 0) {
          const hub = member.spinHub;
          const angle = spinAngle;
          // Ось вала принадлежит машине. У тянущего винта она продольная, у
          // подъёмного — вертикальная; паспорт говорит какая, и общий код
          // остаётся один для обеих.
          const authoredShaft =
            frame.flight.driveAnimation.kind === "propeller"
              ? frame.flight.driveAnimation.shaftAxis
              : undefined;
          const tailwardLength = Math.hypot(frame.nose[0], frame.nose[2]) || 1;
          const shaft = authoredShaft
            ? oarTailwardAxis.current
                .set(authoredShaft[0], authoredShaft[1], authoredShaft[2])
                .normalize()
            : oarTailwardAxis.current.set(
                -frame.nose[0] / tailwardLength,
                0,
                -frame.nose[2] / tailwardLength,
              );
          const offset = driveMemberOffset.current
            .set(
              piece.position[0] - hub[0],
              piece.position[1] - hub[1],
              piece.position[2] - hub[2],
            )
            .applyAxisAngle(shaft, angle);
          localPosition = [
            hub[0] + offset.x,
            hub[1] + offset.y,
            hub[2] + offset.z,
          ];
          own = driveMemberQuaternion.current
            .setFromAxisAngle(shaft, angle)
            .multiply(member.baseQuaternion);
        } else if (
          member.oarStroke &&
          frame.flight.driveAnimation.kind === "oars"
        ) {
          const stroke = member.oarStroke;
          const sample = oarStrokePose(spinAngle + stroke.phaseOffset);
          const blend = state.flight
            ? Math.min(1, state.flight.time / 0.8)
            : state.recovery
              ? 1
              : 0;
          const tailwardLength = Math.hypot(frame.nose[0], frame.nose[2]) || 1;
          const tailward = oarTailwardAxis.current.set(
            -frame.nose[0] / tailwardLength,
            0,
            -frame.nose[2] / tailwardLength,
          );
          const sweep = oarSweepQuaternion.current.setFromAxisAngle(
            WORLD_UP_AXIS,
            stroke.side *
              sample.sweep *
              frame.flight.driveAnimation.sweepAngle *
              blend,
          );
          const lift = oarLiftQuaternion.current.setFromAxisAngle(
            tailward,
            -stroke.side *
              sample.lift *
              frame.flight.driveAnimation.liftAngle *
              blend,
          );
          const strokeRotation = oarStrokeQuaternion.current
            .copy(sweep)
            .multiply(lift);
          const fromPivot = oarPivotOffset.current
            .set(
              piece.position[0] - stroke.pivot[0],
              piece.position[1] - stroke.pivot[1],
              piece.position[2] - stroke.pivot[2],
            )
            .applyQuaternion(strokeRotation);
          localPosition = [
            stroke.pivot[0] + fromPivot.x,
            stroke.pivot[1] + fromPivot.y,
            stroke.pivot[2] + fromPivot.z,
          ];
          own = driveMemberQuaternion.current
            .copy(strokeRotation)
            .multiply(member.baseQuaternion);
          if (stroke.blade && sample.feather !== 0) {
            // Local Y is the authored shaft axis: feathering twists the blade
            // without moving its centre away from the wooden lever.
            own.multiply(
              oarFeatherQuaternion.current.setFromAxisAngle(
                OAR_LOCAL_SHAFT_AXIS,
                sample.feather *
                  frame.flight.driveAnimation.featherAngle *
                  blend,
              ),
            );
          }
        }
        const placed = vehiclePiecePosition(
          frame.origin,
          localPosition,
          pose,
          rotation,
        );
        body.setNextKinematicTranslation({
          x: placed[0],
          y: placed[1],
          z: placed[2],
        });
        const composed = multiplyQuaternions(rotation, [
          own.x,
          own.y,
          own.z,
          own.w,
        ]);
        composedQuaternion.current.set(
          composed[0],
          composed[1],
          composed[2],
          composed[3],
        );
        body.setNextKinematicRotation({
          x: composedQuaternion.current.x,
          y: composedQuaternion.current.y,
          z: composedQuaternion.current.z,
          w: composedQuaternion.current.w,
        });
      }

      state.moving = !resting;
      const clusterId = frame.clusterId;
      if (clusterId) {
        const eventState = airVehicleFlightEventState(
          frame,
          state.flight,
          state.recovery?.lifecycle ?? null,
        );
        if (movingVehicles) {
          if (resting) {
            movingVehicles.current.delete(clusterId);
          } else {
            movingVehicles.current.add(clusterId);
          }
        }
        if (dockedVehicles) {
          if (eventState === "docked") {
            dockedVehicles.current.add(clusterId);
          } else {
            dockedVehicles.current.delete(clusterId);
          }
        }
        clusterEventStates?.current.set(clusterId, eventState);
      }
      if (resting) {
        state.velocity = [0, 0, 0];
        state.released.clear();
      }
    }

    if (
      onRotorcraftPilotStatusChange &&
      occupiedSeatId === TOWN_HEXACOPTER_PILOT_SEAT_ID
    ) {
      const pilotRuntime = frames
        .map((frame) => ({ frame, state: frameState(frame.id) }))
        .find(({ state }) => state.flight?.pilot !== null && state.flight?.pilot !== undefined);
      const pilot = pilotRuntime?.state.flight?.pilot ?? null;
      if (pilot && pilotRuntime) {
        const now = performance.now();
        const targetAltitude = Math.round(pilot.targetAltitude * 10) / 10;
        const { frame, state } = pilotRuntime;
        const attitude = vehicleAttitude(state.body.orientation, frame.nose);
        const forward = rotateByQuaternion(state.body.orientation, frame.nose);
        const heading =
          ((Math.atan2(forward[0], -forward[2]) * 180) / Math.PI + 360) % 360;
        const currentAltitude = Math.round(state.body.position[1] * 10) / 10;
        const verticalSpeed = Math.round(state.body.velocity[1] * 10) / 10;
        const groundSpeed =
          Math.round(Math.hypot(state.body.velocity[0], state.body.velocity[2]) * 10) /
          10;
        const proximity = rotorcraftProximitySectors(
          frame.nose,
          state.flight?.pilotObstacleReadings ?? [],
          state.flight?.pilotIntervenedSensors ?? new Set<number>(),
        );
        const motorOutput = state.rotorMotorOutput.map(
          (value) => Math.round(value * 100) / 100,
        );
        const motorAvailability = (
          state.flight?.propulsionFeedback ?? motorOutput.map(() => 0)
        ).map((value) => Math.round(value * 100) / 100);
        const key = JSON.stringify([
          pilot.mode,
          targetAltitude,
          currentAltitude,
          verticalSpeed,
          groundSpeed,
          Math.round(heading),
          Math.round((attitude.pitch * 180) / Math.PI),
          Math.round((attitude.roll * 180) / Math.PI),
          pilot.sensorAssistEnabled,
          pilot.landingStableSeconds >= 0.45,
          proximity,
          motorOutput,
          motorAvailability,
        ]);
        const modeChanged = pilotStatusMode.current !== pilot.mode;
        if (
          key !== pilotStatusPublished.current &&
          (modeChanged || now >= pilotStatusNextAt.current)
        ) {
          pilotStatusPublished.current = key;
          pilotStatusMode.current = pilot.mode;
          pilotStatusNextAt.current = now + 100;
          onRotorcraftPilotStatusChange({
            mode: pilot.mode,
            targetAltitude,
            currentAltitude,
            verticalSpeed,
            groundSpeed,
            heading,
            pitch: attitude.pitch,
            roll: attitude.roll,
            sensorAssistEnabled: pilot.sensorAssistEnabled,
            landingReady: pilot.landingStableSeconds >= 0.45,
            proximity,
            motorOutput,
            motorAvailability,
          });
        }
      } else if (pilotStatusPublished.current !== null) {
        pilotStatusPublished.current = null;
        pilotStatusMode.current = null;
        onRotorcraftPilotStatusChange(null);
      }
    }
  });

  return (
    <>
      <CompoundKinematicClusterBodies
        definitions={frames}
        pieces={pieces}
        brokenPieces={inactivePieces}
        registry={clusterRegistry}
        onContact={collectContact}
      />
      <VehicleExhaustSmoke
        frames={frames}
        states={states}
        inactivePieces={inactivePieces}
      />
    </>
  );
}

export interface RotorcraftPilotStatus {
  readonly mode: RotorcraftPilotState["mode"];
  readonly targetAltitude: number;
  readonly currentAltitude: number;
  readonly verticalSpeed: number;
  readonly groundSpeed: number;
  readonly heading: number;
  readonly pitch: number;
  readonly roll: number;
  readonly sensorAssistEnabled: boolean;
  readonly landingReady: boolean;
  readonly proximity: Readonly<Record<RotorcraftProximitySector, RotorcraftProximityReading>>;
  readonly motorOutput: readonly number[];
  readonly motorAvailability: readonly number[];
}

export type RotorcraftProximitySector =
  | "fore"
  | "aft"
  | "port"
  | "starboard"
  | "above"
  | "below";

export interface RotorcraftProximityReading {
  readonly distance: number | null;
  readonly intervening: boolean;
}

function rotorcraftProximitySectors(
  nose: readonly [number, number, number],
  readings: readonly VehicleObstacleReading[],
  intervened: ReadonlySet<number>,
): Readonly<Record<RotorcraftProximitySector, RotorcraftProximityReading>> {
  const empty = (): RotorcraftProximityReading => ({
    distance: null,
    intervening: false,
  });
  const sectors: Record<RotorcraftProximitySector, RotorcraftProximityReading> = {
    fore: empty(),
    aft: empty(),
    port: empty(),
    starboard: empty(),
    above: empty(),
    below: empty(),
  };
  const noseLength = Math.hypot(nose[0], nose[2]) || 1;
  const fore = [nose[0] / noseLength, nose[2] / noseLength] as const;
  const starboard = [-fore[1], fore[0]] as const;
  for (const reading of readings) {
    const normal = reading.localNormal;
    let sector: RotorcraftProximitySector;
    if (normal[1] >= 0.65) {
      sector = "above";
    } else if (normal[1] <= -0.65) {
      sector = "below";
    } else {
      const longitudinal = normal[0] * fore[0] + normal[2] * fore[1];
      const lateral = normal[0] * starboard[0] + normal[2] * starboard[1];
      sector = Math.abs(longitudinal) >= Math.abs(lateral)
        ? longitudinal >= 0 ? "fore" : "aft"
        : lateral >= 0 ? "starboard" : "port";
    }
    const previous = sectors[sector];
    if (previous.distance === null || reading.distance < previous.distance) {
      sectors[sector] = {
        distance: Math.round(reading.distance * 10) / 10,
        intervening: intervened.has(reading.sensorIndex),
      };
    } else if (intervened.has(reading.sensorIndex) && !previous.intervening) {
      sectors[sector] = { ...previous, intervening: true };
    }
  }
  return sectors;
}
