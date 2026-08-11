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
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  DynamicDrawUsage,
  Euler,
  InstancedBufferAttribute,
  InstancedInterleavedBuffer,
  InstancedMesh,
  InterleavedBufferAttribute,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  Vector2,
  Vector3,
} from "three";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import {
  structuralMaterialProfiles,
  type BreakablePieceDefinition,
  type LampEventState,
} from "./destructionScene";
import { setSignalGlassGlow } from "./materialTextures";
import {
  AIM_BASE_CAPTURE_ANGLE,
  IDLE_AIM_SELECTION,
  advanceAimSelection,
  aimDwellProgress,
  type AimCandidate,
} from "./vehicleAimSelection";
import { VEHICLE_CONTACT_QUERY } from "./physicsInteractionGroups";
import { createSoftSmokeMaterial } from "./softSmokeMaterial";
import {
  vehicleDamageSmokeRate,
  vehicleEngineDamageSmoke,
} from "./vehicleDamageSmoke";
import {
  RESTING_BODY,
  applyImpulseAtPoint,
  bodyPointVelocity,
  eulerFromQuaternion,
  massProperties,
  pointEffectiveMass,
  principalMassProperties,
  rebaseBodyMassProperties,
  rotateVector as rotateByQuaternion,
  type BodyState,
  type MassProperties,
} from "./clusterDynamics";
import type { RemnantDefinition } from "./destructionRuntime";
import {
  RESTING_POSE,
  departureLightGlow,
  engineValuesBySide,
  engineValuesPortToStarboard,
  advanceDrivePhase,
  advanceVehicleRouteProgress,
  PROGRESS_SEARCH_ARC,
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
  passengerSeatContextAction,
  passengerSeatForCluster,
  passengerSeatIsIntact,
  seatCommandsCarrier,
  seatCommandsRotorcraft,
} from "./passengerSeats";
import { CompoundKinematicClusterBodies } from "./CompoundKinematicClusterBodies";
import {
  compoundCarrierOwnsMemberPose,
  compoundMemberNeedsPoseBody,
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
import {
  carrierHullPoint,
  createVehicleImpactTelemetry,
} from "./vehicleImpactTelemetry";
import { runtimeDiagnosticsEnabled } from "./runtimeDiagnostics";
import { countActiveUpwardSupportContacts } from "./vehiclePhysicalContact";
import {
  buildSupportStruts,
  strutClosingSpeed,
  strutFoldAngle,
  strutFoldOffset,
  strutPadFriction,
  strutReaction,
  strutVisualSlide,
  type StrutRetraction,
  type SupportStrut,
} from "./supportStrut";
import {
  clearMemberArticulation,
  setMemberArticulation,
} from "./clusterMemberArticulation";
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
  advanceReversibleThrusterOutput,
  advanceRotorMotorOutput,
  NEUTRAL_ROTORCRAFT_TRIM,
  rotorcraftCommandsExecute,
  rotorcraftFlightStep,
  rotorcraftMaximumAcceleration,
  rotorcraftSurgeAcceleration,
  type RotorcraftAuthority,
  type RotorcraftLimitReport,
  type RotorcraftTrimState,
} from "./rotorcraftDynamics.ts";
import {
  patchRouteLineFragmentShader,
  patchRouteLineVertexShader,
  routeInstanceBuffers,
} from "./routeLineShader.ts";
import {
  ROUTE_ACTUAL_COLOR,
  routeAltitudeDiscGeometry,
  routeCraftContourGeometry,
  routeCraftPlumbGeometry,
  routeDropLineGeometry,
  routeGateGeometry,
  routeGroundDatum,
  routeGroundTrackGeometry,
  routePlanLineGeometry,
  routePlannedSchedule,
  routePlannedTickGeometry,
  ROUTE_TICK_TIERS,
  routeSemanticMarkers,
  routeTickInterval,
  routeTickScale,
  routeTrailAlpha,
  routeTrailTickGeometry,
  type RouteVector3,
} from "./routeRibbon.ts";
import {
  advanceRotorcraftGovernor,
  DEFAULT_SLIP_POLICY,
  measuredSlipAngle,
  NEUTRAL_GOVERNOR,
  type RotorcraftGovernorState,
} from "./rotorcraftSpeedGovernor.ts";
import { dispatchedFlightKind } from "./entryInteraction.ts";
import {
  createAirCombatState,
  stepAirCombat,
  type AirCombatState,
} from "./airCombatPilot.ts";
import type { BodyReport } from "./airCombatPosture.ts";
import {
  createEvasionState,
  stepEvasion,
  type EvasionState,
} from "./airCombatEvasion.ts";
import {
  pilotStatusKey,
  rotorcraftPilotStatusOf,
  type RotorcraftPilotStatus,
} from "./rotorcraftPilotStatus.ts";
import {
  airCombatOwnState,
  airCombatTracks,
  type SightedWorld,
} from "./airCombatSensing.ts";
import { allegianceOf } from "./vehicleAllegiance.ts";
import type { VehicleWeaponFireEvent } from "./vehicleGunnery.ts";
import { resolveVehicleWeaponShot } from "./vehicleGunnery.ts";
import {
  advanceRouteFigureFrame,
  figureCapabilityOf,
  IDLE_ROUTE_FIGURE,
  type RouteFigureFlight,
} from "./flightFigures.ts";
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
  vehicleFailureEnvelopeFor,
  deliveredLiftControlFraction,
  normalizedLiftTrimRequest,
  rebaseVehicleFailureWatchdog,
  VEHICLE_GROUND_CONTACT_CONFIRM_SECONDS,
  vehicleGroundLiftAutomationSettled,
  vehicleDisturbanceRecoveryFeasible,
  vehicleFailureDisposition,
  type VehicleFailureDisposition,
  type VehicleControlReading,
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
type ScheduledInteraction = "board" | "ride" | "seat" | "stand";
type PilotControlName =
  "forward" | "backward" | "left" | "right" | "run" | "jump";

/** Тяжесть. Плотности в движке свои, но она одна для всех. */
const GRAVITY = 9.81;
/** Пустое множество датчиков: общее и неизменяемое, чтобы не лить мусор на кадр. */
const EMPTY_SENSOR_SET: ReadonlySet<number> = new Set<number>();

/** Предельный наклон винтокрылой машины, если паспорт молчит. */
const DEFAULT_ROTOR_TILT = (30 * Math.PI) / 180;
/**
 * Темп рыскания по полному отклонению ручки, рад/с.
 *
 * Это ЖЕЛАНИЕ пилота, а не возможность машины. Мультиротор разворачивается
 * вокруг вертикали вяло: момент ему даёт только реакция воздуха на вращение
 * винтов, и располагаемые для этой машины 0.19 рад/с вчетверо меньше числа,
 * которое здесь стояло как «предел». Разница стоила дорого: автомат просил
 * недостижимое, упирался в потолок и каждым шагом подкручивал машину, пока
 * она не наматывала лишние обороты вокруг себя прямо на маршруте. Настоящий
 * предел приходит снизу, из аллокатора (`yawRateLimits`), и именно им теперь
 * меряется любой запрос. Здесь остаётся только чувствительность ручки.
 */
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
  const yawThrusters = limits.yawThrusters ?? [];
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
      capacityWeights: limits.rotorCapacityWeights,
      spinDirections: limits.rotorSpinDirections,
      yawThrusters: limits.yawThrusters,
      yawThrusterAvailability: yawThrusters.map((_, index) =>
        state.yawThrustersProven ? (state.yawThrusterHealth[index] ?? 1) : 0,
      ),
      yawThrusterOutput: yawThrusters.map(
        (_, index) => state.yawThrusterOutput[index] ?? 0,
      ),
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
      pathAcceleration: guidance?.pathAcceleration,
      // Поза и её темп проходят насквозь: решение «фигура или обычный полёт»
      // принято выше, здесь только не теряется по дороге.
      attitude: guidance?.attitude ?? null,
      attitudeRate: guidance?.attitudeRate ?? null,
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
  // Тоннели рыскания идут ЧЕРЕЗ ТОТ ЖЕ слой актуаторов: их живучесть — такой
  // же физический факт, как живучесть подъёмного кольца, и узнаётся она из
  // членства кусков в теле, а не из отдельного флага. Команда знаковая:
  // реверсивный вентилятор дует в обе стороны.
  const requestedYawThrottle = enabled && !pilotGroundIdle
    ? yawThrusters.map((_, index) => {
        const commanded = flightStep.result.commandedYawThrusters[index] ?? 0;
        // Пробный импульс: непроверенный канал получает крохотный запрос,
        // чтобы живучесть выучилась ДО того, как тоннелям доверят разгон.
        return !state.yawThrustersProven && Math.abs(commanded) < 0.1
          ? 0.1
          : commanded;
      })
    : yawThrusters.map(() => 0);
  const actuation = executeCommandActuators(
    frame.actuators,
    attachedMembers,
    Object.fromEntries([
      ...requestedThrottle.map(
        (value, index) => [`throttle:${index}`, value] as const,
      ),
      ...requestedYawThrottle.map(
        (value, index) => [`yaw-throttle:${index}`, value] as const,
      ),
    ]),
  );
  const deliveredTargets = requestedThrottle.map((value, index) =>
    deliveredCommandValue(actuation, `throttle:${index}`, value),
  );
  const deliveredYawTargets = requestedYawThrottle.map((value, index) =>
    deliveredCommandValue(actuation, `yaw-throttle:${index}`, value),
  );
  const runUpFraction =
    state.flight && !state.flight.castOff
      ? Math.max(
          0,
          Math.min(
            1,
            state.flight.time / Math.max(0.001, frame.flight.spoolSeconds),
          ),
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
  state.yawThrusterOutput = yawThrusters.map((_, index) =>
    advanceReversibleThrusterOutput(
      state.yawThrusterOutput[index] ?? 0,
      (deliveredYawTargets[index] ?? 0) * runUpFraction,
      step,
      frame.flight.spoolSeconds,
    ),
  );
  // Живучесть — из СРАВНЕНИЯ просьбы с доставкой, как у винтов. Пока тоннель
  // ничего не просили, прежняя оценка сохраняется: молчащий канал не значит
  // сломанный.
  state.yawThrusterHealth = [
    ...updatePropulsionFeedback(
      state.yawThrusterHealth,
      actuation,
      yawThrusters.length,
      "yaw-throttle:",
    ),
  ];
  if (
    !state.yawThrustersProven &&
    requestedYawThrottle.some((value) => Math.abs(value) > 0.05)
  ) {
    state.yawThrustersProven = true;
  }
  if (!enabled) {
    state.yawThrustersProven = false;
  }
  // The adaptive balance term may learn only from a freely responding craft.
  // During run-up the gear/mast answers the attitude error while motor output
  // is deliberately attenuated; integrating that error stores a false moment
  // which is released all at once on lift-off (classic controller wind-up).
  const trimMayLearn =
    enabled && state.supportContacts === 0 && (state.flight?.castOff ?? false);
  state.rotorTrim = !enabled
    ? NEUTRAL_ROTORCRAFT_TRIM
    : trimMayLearn
      ? flightStep.trim
      : trim;
  // Отчёт тела — то же самое, что уже уходит сторожу, только адресат другой.
  // Боевому наведению он нужен, чтобы бросить заход, в котором машина
  // перестала держать заданную позу: «сейчас свалюсь» есть неравенство, а не
  // настроение (`airCombatPosture.ts`).
  state.rotorBody = {
    maneuverScale: flightStep.result.maneuverScale,
    thrust: flightStep.result.authority.thrust,
    pitch: flightStep.result.authority.pitch,
    roll: flightStep.result.authority.roll,
  };
  // ОБРАТНАЯ СВЯЗЬ ПО ФАКТИЧЕСКОМУ ЗАНОСУ.
  //
  // Всё, что считает автопилот вперёд по трассе, — предсказание. Оно не знает
  // ни ветра, ни удара, ни того, что аллокатор сегодня отдаёт меньше вчерашнего.
  // Здесь меряется РЕЗУЛЬТАТ: насколько нос отстал от вектора пути. Отстал
  // сильнее разрешённого — скорость режется, независимо от причины.
  state.governor = enabled
    ? advanceRotorcraftGovernor(
        state.governor,
        measuredSlipAngle(flightStep.forwardSpeed, flightStep.lateralSpeed),
        // Допуск считает автопилот из коридора участка; фаза — запасной путь
        // для маршрутов, не объявивших коридор.
        guidance?.slipAllowance ??
          (guidance?.approachPhase
            ? DEFAULT_SLIP_POLICY.onApproach
            : DEFAULT_SLIP_POLICY.enRoute),
        step,
      )
    : NEUTRAL_GOVERNOR;
  state.rotorAuthority = enabled ? flightStep.result.authority : null;
  state.rotorAcceptedYawRate = enabled
    ? flightStep.result.acceptedYawRate
    : null;
  state.rotorYawRateLimits = enabled ? flightStep.result.yawRateLimits : null;
  state.rotorLimits = enabled ? flightStep.result.limits : null;

  for (let engine = 0; engine < points.length; engine += 1) {
    state.spinAngles[engine] = advanceDrivePhase(
      state.spinAngles[engine] ?? 0,
      frame.flight.driveAnimation.phaseSpeed,
      state.rotorMotorOutput[engine] ?? 0,
      step,
    );
  }
  // Лопасти тоннеля крутит ЕГО СОБСТВЕННАЯ доставленная команда, поэтому
  // реверс виден так же ясно, как в физике: вентилятор действительно
  // отрабатывает назад, а не замирает.
  for (let fan = 0; fan < yawThrusters.length; fan += 1) {
    const angle = points.length + fan;
    state.spinAngles[angle] = advanceDrivePhase(
      state.spinAngles[angle] ?? 0,
      frame.flight.driveAnimation.phaseSpeed,
      state.yawThrusterOutput[fan] ?? 0,
      step,
    );
  }
  if (state.flight) {
    state.flight.driveThrottle = requestedThrottle;
    state.flight.throttle = [...state.rotorMotorOutput];
    state.flight.yawThrusterThrottle = [...state.yawThrusterOutput];
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

/** Стабильная пустота: машина без обрубков не пересчитывает массу зря. */
const EMPTY_FRAME_REMNANTS: readonly RemnantDefinition[] = [];

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

/**
 * Лопасть ВЕНТИЛЯТОРА РЫСКАНИЯ: `…:yaw-engine:<номер>:blade:<номер>`.
 *
 * Отдельный разбор, а не расширение прежнего, ровно потому, что это другой
 * орган: у него свой канал команды, свой знак и своя — наклонная — ось вала.
 * Слить их в одно выражение значило бы отдать вентилятор ближайшему подъёмному
 * кольцу и крутить его чужими оборотами.
 */
function yawFanBlade(pieceId: string): { key: string; index: number } | null {
  const match = pieceId.match(/^(.*:yaw-engine:(\d+)):blade:/);
  return match ? { key: match[1], index: Number(match[2]) } : null;
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
  /**
   * Направление этого вала в осях машины. Пусто — вал общий, из паспорта
   * анимации. Наклонный тоннель объявляет своё: у него ось не вертикальна и не
   * продольна, а развёрнута ровно на угол установки.
   */
  readonly spinAxis: readonly [number, number, number] | null;
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
  /** Знаковая доставленная команда каждого вентилятора рыскания, −1…1. */
  yawThrusterThrottle: readonly number[];
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
  /**
   * ОТЧЁТ ТЕЛА О ПРОШЛОМ КАДРЕ: сколько из заказанного микшер действительно
   * дал. Копится здесь потому, что винты считаются ПОСЛЕ наведения, а нужен он
   * наведению — то есть следующему кадру. Кадр запаздывания принципиален и
   * безвреден: чувство тела живёт десятыми долями секунды, а не кадрами.
   */
  rotorBody: BodyReport | null;
  /** Actual per-motor output after actuator delivery and spool inertia. */
  rotorMotorOutput: number[];
  /**
   * То же для вентиляторов рыскания, но ЗНАКОВОЕ: тоннель реверсивен, и минус
   * здесь означает обратную тягу, а не отсутствие команды.
   */
  yawThrusterOutput: number[];
  /** Доля тяги, которую каждый тоннель ещё способен дать: 0…1. */
  yawThrusterHealth: number[];
  /**
   * Состояние воздушного боя. Живёт здесь по той же причине, что и состояние
   * ручного пилота: это ТРЕТИЙ источник guidance, а не отдельная подсистема.
   * null — машина не воюет (безоружна, не на боевой задаче, некого атаковать).
   */
  combat: AirCombatState | null;
  /**
   * Фигуры высшего пилотажа этого круга. Живут рядом с боем и по той же
   * причине: это ЧЕТВЁРТЫЙ источник guidance. Всё решение — в чистой
   * `advanceRouteFigures`, здесь только память между кадрами.
   */
  figure: RouteFigureFlight;
  /** Доля трассы, с которой начался прошлый кадр: станция ловится между ними. */
  figureProgress: number | null;
  /**
   * Каналы тоннелей ПРОВЕРЕНЫ этим рейсом. Живучесть узнаётся только из пары
   * «запрос → доставка», и до первого запроса автоматика верит в единицы:
   * тоннель, выбитый у берта, на старте получал полный разгонный приказ, а
   * живой напарник валил машину некомпенсируемым моментом. До проверки
   * синфазная тяга закрыта; крохотный пробный импульс на первом кадре рейса
   * выучивает правду за 1/60 секунды.
   */
  /**
   * Машина уже провалилась ниже мира и пересборка запрошена. Защёлка живёт
   * между кадрами: пересборка проходит через состояние React, и до следующего
   * кадра машина всё ещё под миром.
   */
  fellOutOfWorld: boolean;
  /**
   * Состояние уклонения. `null` — машина не умеет уходить с прицела: это
   * объявляется паспортом, а не движком.
   */
  evasion: EvasionState | null;
  yawThrustersProven: boolean;
  /** Срезка ограничителя по фактическому заносу: живёт между кадрами. */
  governor: RotorcraftGovernorState;
  /** План, который автопилот фактически вёл в этом кадре, — для ленты. */
  activePlan: VehicleRoutePlan | null;
  /** Previous physical step, consumed by the common failure watchdog. */
  rotorAuthority: RotorcraftAuthority | null;
  /** Command the bounded rotor allocator actually accepted last step. */
  rotorAcceptedYawRate: number | null;
  /** Последнее требование автомата по рысканью — для разбора поведения носа. */
  lastGuidanceYawRate: number | null;
  /** Курс, который автомат хочет от носа, град. */
  lastHeadingTarget: number | null;
  /** Что именно ограничило каждый канал на прошлом шаге. */
  rotorLimits: RotorcraftLimitReport | null;
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
  /** Члены, съеденные carve/shatter, на последнем пересчёте массы. */
  damagedSeen: number;
  /** Обрубки кластера, вошедшие в текущую модель массы. */
  memberRemnantsSeen: readonly RemnantDefinition[] | null;
  /** Снимок условий watchdog для живой диагностики (dev-режим). */
  watchdogProbe: Record<string, unknown> | null;
  /** Из чего набралась масса: члены, обрубки, исключённые. */
  massBreakdown: {
    members: number;
    stumps: number;
    alive: number;
    skippedDamaged: number;
    remnantsSeen: number;
  } | null;
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
  const orientation = [rotation.x, rotation.y, rotation.z, rotation.w] as const;
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
const DAMAGE_PARTICLES_PER_SOURCE = 192;

type VehicleSmokeSource =
  | {
      readonly kind: "exhaust";
      readonly frame: VehicleFrameRuntime;
      readonly profile: NonNullable<AirVehicleDefinition["flight"]["exhaust"]>;
      readonly source: NonNullable<
        AirVehicleDefinition["flight"]["exhaust"]
      >["sources"][number];
      readonly offset: number;
      readonly capacity: number;
    }
  | {
      readonly kind: "damage";
      readonly frame: VehicleFrameRuntime;
      readonly engineIndex: number;
      readonly point: readonly [number, number, number];
      readonly electric: boolean;
      readonly offset: number;
      readonly capacity: number;
    };

/** Detached soft puffs using the same camera-facing smoke shader as hearths. */
function VehicleExhaustSmoke({
  frames,
  states,
  inactivePieces,
  damagedPieces,
  bodies,
}: {
  frames: readonly VehicleFrameRuntime[];
  states: { current: Map<string, FrameState> };
  inactivePieces: ReadonlySet<string>;
  damagedPieces: ReadonlySet<string>;
  bodies: { current: Map<string, RapierRigidBody> };
}) {
  const meshRef = useRef<InstancedMesh>(null);
  const sources = useMemo(
    () => {
      const collected: VehicleSmokeSource[] = [];
      let offset = 0;
      for (const frame of frames) {
        for (const source of frame.flight.exhaust?.sources ?? []) {
          collected.push({
            kind: "exhaust",
            frame,
            profile: frame.flight.exhaust!,
            source,
            offset,
            capacity: EXHAUST_PARTICLES_PER_SOURCE,
          });
          offset += EXHAUST_PARTICLES_PER_SOURCE;
        }
        const smokeFromDamage =
          frame.flight.driveAnimation.kind === "propeller" ||
          frame.flight.driveAnimation.kind === "furnace";
        if (!smokeFromDamage) {
          continue;
        }
        frame.flight.limits.enginePoints.forEach((point, engineIndex) => {
          if (
            !frame.actuators.some(
              (binding) => binding.commandChannel === `throttle:${engineIndex}`,
            )
          ) {
            return;
          }
          collected.push({
            kind: "damage",
            frame,
            engineIndex,
            point,
            electric: frame.flight.liftSource === "rotor",
            offset,
            capacity: DAMAGE_PARTICLES_PER_SOURCE,
          });
          offset += DAMAGE_PARTICLES_PER_SOURCE;
        });
      }
      return collected;
    },
    [frames],
  );
  const total = sources.reduce(
    (count, source) => count + source.capacity,
    0,
  );
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
      createSoftSmokeMaterial({
        denseColor: [0.075, 0.08, 0.085],
        agedColor: [0.235, 0.24, 0.245],
        minimumOpacity: 0.28,
        maximumOpacity: 0.74,
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
  /** Ни одной живой частицы: обход и заливка атрибутов спят до эмиссии. */
  const smokeAsleep = useRef(false);
  const damageAges = useRef(new Float32Array(sources.length));
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
      if (!state) {
        continue;
      }
      let power: number;
      let rate: number;
      let emitter: readonly [number, number, number];
      let sourceVelocity: readonly [number, number, number] = state.body.velocity;
      let direction: readonly [number, number, number] = [0, 0, 0];
      let exitSpeed = 0;
      let spread: number;
      let lifeSeconds: number;
      if (authored.kind === "exhaust") {
        if (inactivePieces.has(authored.source.outletPieceId)) {
          continue;
        }
        power = state.flight
          ? Math.abs(state.flight.throttle[authored.source.engineIndex] ?? 0)
          : state.recovery
            ? 0
            : 0.035;
        rate =
          authored.profile.idleRate +
          (authored.profile.fullRate - authored.profile.idleRate) *
            Math.pow(Math.min(1, power), 1.35);
        emitter = vehiclePiecePosition(
          authored.frame.origin,
          authored.source.point,
          state.pose,
          vehicleRotation(state.pose, authored.frame.nose),
        );
        direction = rotateByQuaternion(
          state.body.orientation,
          authored.source.direction,
        );
        exitSpeed = authored.profile.exitSpeed * (0.65 + power * 0.65);
        spread = authored.profile.spread;
        lifeSeconds = authored.profile.lifeSeconds;
      } else {
        const damage = vehicleEngineDamageSmoke(
          authored.frame.actuators,
          damagedPieces,
          authored.engineIndex,
        );
        if (damage.severity <= 1e-6) {
          damageAges.current[sourceIndex] = 0;
          continue;
        }
        damageAges.current[sourceIndex] += delta;
        rate = vehicleDamageSmokeRate(
          damage.severity,
          damageAges.current[sourceIndex],
          authored.electric,
        );
        power = 0.72 + damage.severity * 0.28;
        emitter = vehiclePiecePosition(
          authored.frame.origin,
          authored.point,
          state.pose,
          vehicleRotation(state.pose, authored.frame.nose),
        );
        const detachedBody = damage.detachedAnchorPieceId
          ? bodies.current.get(damage.detachedAnchorPieceId)
          : null;
        if (detachedBody) {
          const position = detachedBody.translation();
          const velocity = detachedBody.linvel();
          emitter = [position.x, position.y, position.z];
          sourceVelocity = [velocity.x, velocity.y, velocity.z];
        }
        spread = authored.electric ? 0.62 : 0.95;
        lifeSeconds = authored.electric ? 3.8 : 5.4;
      }
      accumulators.current[sourceIndex] += rate * delta;
      while (accumulators.current[sourceIndex] >= 1) {
        accumulators.current[sourceIndex] -= 1;
        const localIndex =
          cursors.current[sourceIndex] % authored.capacity;
        cursors.current[sourceIndex] = localIndex + 1;
        const particle = particles.current[authored.offset + localIndex];
        const serial = serials.current[sourceIndex]++;
        const seed =
          (((Math.sin(serial * 19.19 + sourceIndex * 7.31) * 43758.5) % 1) +
            1) %
          1;
        const seedB =
          (((Math.sin(serial * 43.17 + sourceIndex * 3.7) * 28641.3) % 1) + 1) %
          1;
        particle.position.set(emitter[0], emitter[1], emitter[2]);
        particle.velocity.set(
          sourceVelocity[0] + direction[0] * exitSpeed + (seed - 0.5) * spread,
          sourceVelocity[1] + 0.38 + seedB * 0.42,
          sourceVelocity[2] + direction[2] * exitSpeed + (seedB - 0.5) * spread,
        );
        particle.age = 0;
        particle.life = lifeSeconds * (0.82 + seed * 0.34);
        particle.power = power;
        particle.seed = seed;
        smokeAsleep.current = false;
      }
    }

    // Мёртвый дым не обходится и не заливается: у пришвартованной машины с
    // целыми моторами здесь тысячи частиц с age >= life, и их обход плюс
    // пять needsUpdate на кадр были чистым налогом на простой. Последний
    // живой кадр дозаливает нули размеров, дальше система спит до эмиссии.
    if (smokeAsleep.current) {
      return;
    }
    let liveCount = 0;
    for (const [index, particle] of particles.current.entries()) {
      particle.age += delta;
      if (particle.age >= particle.life) {
        sizeValues.current[index] = 0;
        continue;
      }
      liveCount += 1;
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
    if (liveCount === 0) {
      smokeAsleep.current = true;
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

function restingState(engineCount: number, yawThrusterCount = 0): FrameState {
  return {
    combat: null,
    figure: IDLE_ROUTE_FIGURE,
    figureProgress: null,
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
    rotorBody: null,
    rotorMotorOutput: Array.from({ length: engineCount }, () => 0),
    yawThrusterOutput: Array.from({ length: yawThrusterCount }, () => 0),
    yawThrusterHealth: Array.from({ length: yawThrusterCount }, () => 1),
    fellOutOfWorld: false,
    evasion: null,
    yawThrustersProven: false,
    governor: NEUTRAL_GOVERNOR,
    activePlan: null,
    rotorAuthority: null,
    rotorAcceptedYawRate: null,
    lastGuidanceYawRate: null,
    lastHeadingTarget: null,
    rotorLimits: null,
    rotorYawRateLimits: null,
    trimMassPositions: [],
    trimAvailable: [],
    trimExhaustedSeconds: 0,
    guidance: null,
    guidanceSource: null,
    telemetryImpact: null,
    liftNow: 0,
    // Вентиляторы рыскания продолжают этот же список: у каждого свой угол,
    // и по нему видно и знак команды, и её величину.
    spinAngles: Array.from(
      { length: engineCount + yawThrusterCount },
      () => 0,
    ),
    flight: null,
    recovery: null,
    supportContacts: 0,
    body: RESTING_BODY,
    mass: null,
    intactMass: 0,
    intactEnvelope: 0,
    trimCentre: null,
    brokenSeen: -1,
    damagedSeen: -1,
    memberRemnantsSeen: null,
    watchdogProbe: null,
    massBreakdown: null,
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
    yawThrusterThrottle: [],
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
 * Собранная опора: физический паспорт стойки плюс разрешённые в настоящие
 * id куски. Разрешение делается один раз на сборку, а не каждый шаг: масок в
 * ноге шесть, ног четыре, а членов у машины шестьсот с лишним.
 */
/**
 * Кусок ноги в терминах движения: сколько хода штока он проходит и ходит ли
 * вокруг цапфы. Разрешается один раз на сборку — масок в ноге дюжина, ног
 * четыре, а членов у машины шестьсот с лишним.
 */
interface CompiledStrutMember {
  readonly id: string;
  readonly centre: readonly [number, number, number];
  /** 1 — идёт со штоком, 0.5 — шлиц-шарнир, 0 — стоит на месте относительно ноги. */
  readonly travelShare: number;
  readonly folds: boolean;
}

interface CompiledSupportStrut {
  readonly strut: SupportStrut;
  readonly requiredMembers: readonly string[];
  readonly members: readonly CompiledStrutMember[];
  readonly retraction: StrutRetraction | null;
}

interface SupportStrutBuild {
  readonly mass: number;
  readonly struts: readonly CompiledSupportStrut[];
}

function compileSupportStruts(
  frame: VehicleFrameRuntime,
  mass: MassProperties,
): SupportStrutBuild {
  const definitions = frame.supportStruts ?? [];
  const struts = buildSupportStruts(
    definitions.map((definition) => definition.plan),
    mass.mass * GRAVITY,
    mass.centre,
  );
  const matching = (masks: readonly string[]) =>
    frame.members
      .filter((member) => masks.some((mask) => member.piece.id.includes(mask)))
      .map((member) => member.piece.id);
  return {
    mass: mass.mass,
    struts: struts.map((strut, index) => {
      const definition = definitions[index];
      const share = new Map<string, number>();
      const folding = new Set(matching(definition.foldingMembers ?? []));
      for (const id of matching(definition.travellingMembers)) {
        share.set(id, 1);
      }
      for (const id of matching(definition.halfTravellingMembers ?? [])) {
        share.set(id, 0.5);
      }
      const members: CompiledStrutMember[] = [];
      for (const member of frame.members) {
        const travelShare = share.get(member.piece.id) ?? 0;
        const folds = folding.has(member.piece.id);
        if (travelShare === 0 && !folds) {
          continue;
        }
        members.push({
          id: member.piece.id,
          centre: [
            member.piece.position[0],
            member.piece.position[1],
            member.piece.position[2],
          ],
          travelShare,
          folds,
        });
      }
      return {
        strut,
        requiredMembers: matching(definition.requiredMembers),
        members,
        retraction: definition.retraction ?? null,
      };
    }),
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
  showRouteOverlay = false,
  // Без выбора (undefined) оверлей ведёт себя по-старому — у всех летящих:
  // это путь сцен, не подключивших выбор прицелом. null — «выбрана никакая».
  selectedVehicleClusterId,
  onAimSelectionChange,
  aimIndicatorRef,
  pieces,
  bodies,
  brokenPieces,
  inactivePieces,
  damagedPieces,
  carvedPieces,
  remnants,
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
  onVehicleWeaponFire,
}: {
  /** Лента маршрута в мире — часть телеметрии, включается режимом по T. */
  readonly showRouteOverlay?: boolean;
  /** Выбранная прицелом машина: только её маршрут рисуется в небе. */
  readonly selectedVehicleClusterId?: string | null;
  /** Смена выбора прицелом (vehicleAimSelection) — наверх, к панели и T. */
  readonly onAimSelectionChange?: (clusterId: string | null) => void;
  /** Элемент перекрестья: накопление выбора пишется в его CSS-переменную. */
  readonly aimIndicatorRef?: { readonly current: HTMLElement | null };
  pieces: readonly BreakablePieceDefinition[];
  bodies: { current: Map<string, RapierRigidBody> };
  brokenPieces: { current: ReadonlySet<string> };
  /** Detached, shattered or carved members no longer owned by the compound. */
  inactivePieces: ReadonlySet<string>;
  /** Members physically consumed by damage, excluding healthy structural fallout. */
  damagedPieces: ReadonlySet<string>;
  /** Члены, съеденные carve: их масса и контактная форма — их обрубки. */
  carvedPieces?: ReadonlySet<string>;
  /** Обрубки мира; носимые этим кадром отбираются по clusterId. */
  remnants?: readonly RemnantDefinition[];
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
  /**
   * Выстрел бортового оружия. Система машин НЕ стреляет сама: она сообщает,
   * что оружие сработало, а превращение в луч и снаряд — дело сцены, где
   * живут физический мир и пул снарядов.
   */
  onVehicleWeaponFire?: (event: VehicleWeaponFireEvent) => void;
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
  /**
   * «Ушёл насовсем» для контактной формы компаунда: всё inactive, КРОМЕ
   * carved-но-не-отломанных членов — их форму дают обрубки. inactive
   * пересчитывается корнем игры на каждую смену broken, поэтому ref здесь
   * заведомо свеж.
   */
  const clusterDetachedPieces = useMemo(() => {
    if (!carvedPieces || carvedPieces.size === 0) {
      return inactivePieces;
    }
    const gone = new Set<string>();
    for (const id of inactivePieces) {
      if (!carvedPieces.has(id) || brokenPieces.current.has(id)) {
        gone.add(id);
      }
    }
    return gone;
  }, [brokenPieces, carvedPieces, inactivePieces]);
  /**
   * ЧЕМ ДЫМИТ ДВИГАТЕЛЬ — ТЕМ ЖЕ, ЧЕГО ЕМУ НЕ ХВАТАЕТ.
   *
   * Тяга канала считается по составу машины, а дым читал только
   * прогрызенное и разбитое. Оторванный узел в этот список не попадал, и
   * двигатель, потерявший обязательную деталь ОТЛОМОМ, замолкал молча:
   * тяга ноль, автоматика снимает рейс по «не слушает органов управления»,
   * а на машине ни струйки — догадаться не по чему. Дым обязан показывать
   * ту же утрату, что видит тяга.
   */
  const smokingDamage = useMemo(() => {
    const gone = new Set(damagedPieces);
    for (const id of brokenPieces.current) {
      gone.add(id);
    }
    return gone;
    // brokenPieces — ref, его содержимое меняет тот же поток разрушения,
    // что и damagedPieces; пересчёт по damagedPieces накрывает оба.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [damagedPieces, inactivePieces]);

  /**
   * Снимок органов для ЛЮБОЙ точки отказа. Разбор нужен одинаково, кто бы
   * ни снял машину с рейса: сторож, детектор контакта или потеря набора.
   */
  const controlReadings = useCallback(
    (
      frame: VehicleFrameRuntime,
      state: FrameState,
    ): readonly VehicleControlReading[] => {
      const flight = state.flight;
      const readings: VehicleControlReading[] = (
        flight?.driveThrottle ?? frame.flight.limits.enginePoints.map(() => 0)
      ).map((requested, index) => {
        const delivered = flight?.throttle[index] ?? 0;
        return {
          organ: `тяга ${index}`,
          expected: Number(requested.toFixed(2)),
          actual: Number(delivered.toFixed(2)),
          required: true,
          note:
            Math.abs(requested) > 0.05 &&
            Math.abs(delivered) < Math.abs(requested) * 0.5
              ? "не отвечает"
              : undefined,
        };
      });
      readings.push({
        organ: "оболочка",
        expected: state.intactEnvelope,
        actual: state.envelopeLeft,
        required: true,
        note:
          state.envelopeLeft < state.intactEnvelope
            ? "потеряны полотнища"
            : undefined,
      });
      readings.push({
        organ: "масса",
        expected: Number(state.intactMass.toFixed(1)),
        actual: Number((state.mass?.mass ?? 0).toFixed(1)),
        required: false,
      });
      readings.push({
        organ: "опора под днищем",
        expected: 0,
        actual: state.supportContacts,
        required: false,
        note: state.supportContacts > 0 ? "машина считает, что села" : undefined,
      });
      for (const [index, rail] of (frame.trimRails ?? []).entries()) {
        readings.push({
          organ: `дифферент ${rail.commandChannel}`,
          expected: 1,
          actual: state.trimAvailable[index] ? 1 : 0,
          required: true,
          note: state.trimAvailable[index] ? undefined : "тележка потеряна",
        });
      }
      return readings;
    },
    [],
  );

  /** Обрубки, носимые кластерами, по id кластера. */
  const clusterRemnants = useMemo(() => {
    const byCluster = new Map<string, RemnantDefinition[]>();
    for (const remnant of remnants ?? []) {
      if (!remnant.clusterId) {
        continue;
      }
      const list = byCluster.get(remnant.clusterId);
      if (list) {
        list.push(remnant);
      } else {
        byCluster.set(remnant.clusterId, [remnant]);
      }
    }
    return byCluster;
  }, [remnants]);

  useEffect(() => {
    if (seatCommandsRotorcraft(occupiedSeatId)) {
      return;
    }
    pilotStatusPublished.current = null;
    pilotStatusMode.current = null;
    onRotorcraftPilotStatusChange?.(null);
  }, [occupiedSeatId, onRotorcraftPilotStatusChange]);


  useEffect(() => {
    pilotCommands.current = createRotorcraftPilotCommandBuffer();
    if (!seatCommandsRotorcraft(occupiedSeatId)) {
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
      const engine = bladePropeller(piece.id) ?? yawFanBlade(piece.id)?.key;
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
      const yawFan = yawFanBlade(piece.id);
      const oar = oarMemberIdentity(piece.id);
      const vehicle = vehicleByCluster.get(piece.clusterId);
      const yawThruster = yawFan
        ? vehicle?.flight.limits.yawThrusters?.[yawFan.index]
        : undefined;
      const oarPivot = oar ? oarPivots.get(oar.key) : undefined;
      const trimRailIndex = vehicle?.trimRails?.findIndex(
        (rail) => rail.carPieceId === piece.id,
      );
      const member: FrameMember = {
        piece,
        baseQuaternion: new Quaternion().setFromEuler(new Euler(rx, ry, rz)),
        spinHub: engine
          ? (hubs.get(engine) ?? null)
          : yawThruster && yawFan
            ? (hubs.get(yawFan.key) ?? null)
            : null,
        spinAxis: yawThruster ? yawThruster.axis : null,
        trimRailIndex:
          trimRailIndex === undefined || trimRailIndex < 0
            ? null
            : trimRailIndex,
        engineIndex: engine
          ? engineIndexOf(
              hubs.get(engine),
              vehicle?.flight.limits.enginePoints ?? [],
            )
          : yawThruster && yawFan
            ? // Каналы углов идут подряд: сперва подъёмные кольца, затем
              // тоннели. Свой угол у каждого — иначе реверс одного тоннеля
              // читался бы как остановка другого.
              (vehicle?.flight.limits.enginePoints.length ?? 0) + yawFan.index
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
      const limits = frames.find((frame) => frame.id === id)?.flight.limits;
      const created = restingState(
        limits?.enginePoints.length ?? 0,
        limits?.yawThrusters?.length ?? 0,
      );
      states.current.set(id, created);
      return created;
    },
    [frames],
  );

  // Dev-хук телеметрии машин: снимок живого состояния рейса без HUD и без
  // догадок. Пара к __mamTeleport/__mamLook, только для чтения.
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return undefined;
    const scope = window as unknown as Record<string, unknown>;
    const snapshot = () =>
      frames.map((frame) => {
        const live = states.current.get(frame.id);
        const flight = live?.flight ?? null;
        return {
          id: frame.id,
          supportContacts: live?.supportContacts ?? null,
          recovery: live?.recovery
            ? {
                phase: live.recovery.lifecycle.phase,
                progress: live.recovery.progress,
                groundContactSeconds: live.recovery.groundContactSeconds,
              }
            : null,
          flight: flight
            ? {
                kind: flight.kind,
                // ЗА ШТУРВАЛОМ ЧЕЛОВЕК. Снаружи это не видно ничем другим:
                // вид рейса у ручного полёта тот же, что у автоматического
                // (`dispatchedFlightKind` намеренно не заводит вид `manual`),
                // а разница ровно здесь.
                pilot: flight.pilot !== null,
                time: flight.time,
                castOff: flight.castOff,
                progress: flight.progress,
                corrections: flight.corrections,
                goArounds: flight.goArounds,
                unexpectedGroundContactSeconds:
                  flight.unexpectedGroundContactSeconds,
                trajectoryCorrection: flight.trajectoryCorrection
                  ? {
                      phase: flight.trajectoryCorrection.phase,
                      reason: flight.trajectoryCorrection.reason,
                      elapsedSeconds: flight.trajectoryCorrection.elapsedSeconds,
                      stableSeconds: flight.trajectoryCorrection.stableSeconds,
                      allowanceSeconds:
                        flight.trajectoryCorrection.allowanceSeconds,
                    }
                  : null,
                safetyAdvisory: flight.safetyAdvisory,
                throttle: flight.throttle,
              }
            : null,
          pose: live?.pose ?? null,
          // Ноги: доля уборки и то, на скольких опорах машина стоит. Оба
          // числа отвечают на вопрос «убралось ли и выпустилось ли обратно»
          // без разглядывания машины на двадцатиметровой высоте.
          gear: frame.supportStruts?.length
            ? {
                retracted: supportStrutFold.current.get(frame.id) ?? 0,
                supports: live?.supportContacts ?? 0,
              }
            : null,
          body: live
            ? {
                position: live.body.position,
                velocity: live.body.velocity,
                angularVelocity: live.body.angularVelocity,
              }
            : null,
        };
      });
    scope.__mamVehicles = snapshot;
    return () => {
      if (scope.__mamVehicles === snapshot) {
        delete scope.__mamVehicles;
      }
    };
  }, [frames]);

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
      __mamAirCombat?: () => readonly {
        readonly id: string;
        readonly mode: string;
        readonly targetId: string | null;
        readonly modeSeconds: number;
        readonly passes: number;
      }[];
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
    // `__mamShipPose` снят: он был псевдонимом `__mamVehiclePose` с зашитым
    // именем состава, читателей в репозитории не имел, а общий хук умеет то
    // же самое и для любой машины.
    scope.__mamVehiclePose = setPose;
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
    /**
     * ЧТО СЕЙЧАС ДЕЛАЕТ АВТОМАТ БОЯ. Единственный способ увидеть это снаружи:
     * состояние боя живёт в карте состояний и наружу не публикуется вовсе,
     * поэтому «машина взлетела и полетела в ту сторону» до сих пор было
     * единственным наблюдением, а режим, цель и счёт заходов — только в трассе
     * стенда. Пустой список означает «никто не воюет», и это законный ответ.
     */
    scope.__mamAirCombat = () =>
      frames
        // ТОЛЬКО ЧТЕНИЕ: `frameState` создаёт состояние при промахе, и
        // диагностика, которая пишет, — уже не диагностика.
        .map((frame) => ({
          frame,
          combat: states.current.get(frame.id)?.combat ?? null,
        }))
        .filter(({ combat }) => combat !== null)
        .map(({ frame, combat }) => ({
          id: frame.id,
          mode: combat!.mode,
          targetId: combat!.targetId,
          modeSeconds: Number(combat!.modeSeconds.toFixed(2)),
          passes: combat!.passes,
        }));
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
      if (scope.__mamVehicleImpulse === applyDiagnosticImpulse) {
        delete scope.__mamVehicleImpulse;
      }
      delete scope.__mamVehicleContacts;
      if (scope.__mamVehicleDepart === departDiagnostic) {
        delete scope.__mamVehicleDepart;
      }
      delete scope.__mamAirCombat;
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
  /**
   * Ключ последней пересборки shipBodies: число тел в реестре, пока ни один
   * кусок не сломан. Целая машина не меняет состав тел — пересборка каждый
   * физический шаг была чистым налогом на простой (O(члены × кадры × 3 шага
   * догона) Map-обходов на кадр). Любая поломка сбрасывает ключ в -1 и
   * возвращает полный пересчёт с проверкой границ.
   */
  const shipBodiesIntactKey = useRef(-1);
  /**
   * Живые члены машины взаимодействия, кешированные по размерам входов:
   * реестр только худеет, brokenPieces только растёт — размеры ловят любую
   * перемену. Прежде Set в ~600 элементов собирался и фильтровался на
   * КАЖДОМ физическом шаге ради подсказки у причала.
   */
  const launchMembersCache = useRef<{ key: string; members: Set<string> }>({
    key: "",
    members: new Set(),
  });
  // Стойки собираются от измеренной массы, а масса машины меняется по ходу
  // боя. Пересобираются они не каждый шаг — только когда масса заметно уехала.
  const supportStrutBuilds = useRef<Map<string, SupportStrutBuild>>(new Map());
  /** Доля уборки ног, 0 — выпущены, 1 — убраны. Одна на машину. */
  const supportStrutFold = useRef<Map<string, number>>(new Map());
  const supportStrutRay = useRef<InstanceType<typeof rapier.Ray> | null>(null);
  const debrisLocalPoint = useRef(new Vector3());
  const debrisCarrierRotation = useRef(new Quaternion());
  const handoffLookDirection = useRef(new Vector3());
  const interIslandPassengerStatus = useRef({ active: false, inside: false });

  // Ход штока — состояние рендерера, а не машины: уехав со сцены, машина
  // обязана унести его с собой. Иначе следующая сцена платит за поиск
  // артикуляции у каждого несомого куска, ничего за это не получая.
  const strutBuildsForCleanup = supportStrutBuilds;
  useEffect(
    () => () => {
      for (const build of strutBuildsForCleanup.current.values()) {
        for (const compiled of build.struts) {
          for (const member of compiled.members) {
            clearMemberArticulation(member.id);
          }
        }
      }
      strutBuildsForCleanup.current.clear();
    },
    [strutBuildsForCleanup],
  );

  // Dev-прибор двигателей: по каждому каналу — РЕАЛЬНАЯ доставленная тяга,
  // состояние каждого его члена (цел / надкусан carve / отломан) и severity
  // дыма. Отвечает на вопрос «умерли двигатели или врёт дым» числом.
  useEffect(() => {
    if (process.env.NODE_ENV === "production") {
      return;
    }
    const scope = window as unknown as Record<string, unknown>;
    const report = (frameId?: string) =>
      frames
        .filter((frame) => !frameId || frame.id === frameId)
        .map((frame) => {
          const attached =
            clusterRegistry.current.get(frame.clusterId)?.attachedMemberIds ??
            new Set(frame.members.map((member) => member.piece.id));
          const health = propulsionHealth(
            frame.actuators,
            attached,
            frame.flight.limits.enginePoints.length,
          );
          return {
            frame: frame.id,
            mode: health.mode,
            fractions: health.fractions.map((value) =>
              Number(value.toFixed(3)),
            ),
            channels: frame.flight.limits.enginePoints.map((_, index) => {
              const smoke = vehicleEngineDamageSmoke(
                frame.actuators,
                damagedPieces,
                index,
              );
              const members = frame.actuators
                .filter(
                  (binding) => binding.commandChannel === `throttle:${index}`,
                )
                .flatMap((binding) => binding.members);
              return {
                channel: index,
                thrust: Number((health.fractions[index] ?? 0).toFixed(3)),
                smokeSeverity: Number(smoke.severity.toFixed(3)),
                required: members.filter((member) => member.required).length,
                requiredBroken: members.filter(
                  (member) =>
                    member.required && brokenPieces.current.has(member.pieceId),
                ).length,
                requiredDamagedOnly: members.filter(
                  (member) =>
                    member.required &&
                    damagedPieces.has(member.pieceId) &&
                    !brokenPieces.current.has(member.pieceId),
                ).length,
                sparesBroken: members.filter(
                  (member) =>
                    !member.required && brokenPieces.current.has(member.pieceId),
                ).length,
                sparesDamagedOnly: members.filter(
                  (member) =>
                    !member.required &&
                    damagedPieces.has(member.pieceId) &&
                    !brokenPieces.current.has(member.pieceId),
                ).length,
              };
            }),
          };
        });
    scope.__mamPropulsionReport = report;
    return () => {
      if (scope.__mamPropulsionReport === report) {
        delete scope.__mamPropulsionReport;
      }
    };
  }, [brokenPieces, clusterRegistry, damagedPieces, frames]);

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
      const registeredLaunchMembers = clusterRegistry.current.get(
        interactionFrame.clusterId,
      )?.attachedMemberIds;
      // Ключ по размерам входов: реестр только худеет, brokenPieces только
      // растёт. Совпал — прошлое множество верно, без пересборки на шаг.
      const launchMembersKey = `${interactionFrame.id}:${
        registeredLaunchMembers?.size ?? -1
      }:${brokenPieces.current.size}:${inactivePieces.size}`;
      if (launchMembersCache.current.key !== launchMembersKey) {
        const next = new Set<string>();
        for (const pieceId of registeredLaunchMembers ??
          interactionFrame.members.map((member) => member.piece.id)) {
          if (
            !brokenPieces.current.has(pieceId) &&
            !inactivePieces.has(pieceId)
          ) {
            next.add(pieceId);
          }
        }
        launchMembersCache.current = { key: launchMembersKey, members: next };
      }
      const launchMembers = launchMembersCache.current.members;
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
      // Место управления ищется ПО МАШИНЕ, а не по имени кресла: у каждой
      // винтокрылой кабина своя, и общий контур обязан находить её так же,
      // как находит саму машину, — по кластеру.
      const interactionSeat = passengerSeatForCluster(
        interactionFrame.clusterId,
      );
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
      // Встать можно, если это не место управления вовсе, либо человек
      // сидит ИМЕННО В ЭТОМ месте и машина не в воздухе. Второе условие про
      // это же кресло, а не про любое пилотское: пока кресло управления было
      // одно на проект, разницы между этими вопросами не существовало.
      const pilotMayStand =
        interactionSeat?.rotorcraftControls !== true ||
        (occupiedSeatId === interactionSeat.id &&
          interaction.flight === null);
      const seatAction =
        interactionSeat &&
        pilotMayStand &&
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
        if (
          process.env.NODE_ENV !== "production" &&
          typeof window !== "undefined"
        ) {
          // Диагноз поста для headless-проверок: какие ворота не пустили.
          (window as unknown as Record<string, unknown>).__mamDepartureDebug = {
            frame: interactionFrame.id,
            post,
            uncrewedLaunchAllowed,
            vehicleHome,
            boardDistance,
            approachRadius: departure?.approachRadius ?? null,
            eyeHeightDelta: departure
              ? Math.abs(eye[1] - departure.point[1])
              : null,
            eye: [eye[0], eye[1], eye[2]],
          };
        }
      } else if (interactionSeat) {
        // Место у машины есть — предложить сесть. Условия у предложения свои
        // (машина на месте, человек внутри её обвода), и решает их само место;
        // прежде эта ветка спрашивала имя состава и потому молчала у всех
        // остальных машин с креслом.
        //
        // Для ВИНТОКРЫЛОЙ эта ветка тождественно молчит, и это не случайность,
        // а следствие `pilotMayStand` выше: сюда попадают только рейсы в
        // воздухе (`interaction.flight !== null`), а встать за штурвалом в
        // воздухе запрещено. Связь косвенная и держится на тридцати строках
        // расстояния — если `pilotMayStand` когда-нибудь смягчат, здесь
        // появится предложение встать посреди полёта.
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
              interactionSeat?.rotorcraftControls === true &&
              passengerLaunchAllowed &&
              seatIntact;
            interaction.flight = createFlightState(
              // Решение «какой рейс начинается» вынесено в чистую функцию:
              // здесь уже была ошибка, которую нечем было поймать тестом.
              dispatchedFlightKind({
                post: post === "ride" ? "ride" : "board",
                requestedAction,
                departureKind: departure?.flightKind ?? null,
                passengerKind:
                  interactionFrame.passengerFlight?.flightKind ?? null,
                manualPilotLaunch,
              }),
              post === "ride" || manualPilotLaunch ? "passenger" : "uncrewed",
              interactionFrame.flight.limits.enginePoints.length,
              0,
              manualPilotLaunch
                ? createRotorcraftPilotState(interaction.body.position[1], true)
                : null,
            );
            if (manualPilotLaunch) {
              onOccupiedSeatChange(interactionSeat.id);
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
      // Каким стеклом светит отправление, объявляет ПАСПОРТ машины: лампы
      // принадлежат сцене, а чьё отправление они показывают — её свойство.
      const signalColor = scheduledFrame.departure?.signalColor;
      if (signalColor && glow !== departureGlow.current) {
        departureGlow.current = glow;
        setSignalGlassGlow(signalColor, glow);
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
        }
      }
    }

    // --- Тело корабля --------------------------------------------------
    // Контактный корпус кластера и его ещё не отделившиеся визуальные тела
    // принадлежат самому кораблю: сенсоры не принимают их за внешний мир.
    //
    // Пока ни один кусок не сломан, состав тел меняется только с реестром
    // (число тел). Совпал ключ — прошлые множества верны, пересборка не
    // нужна; сломанное возвращает полный путь с проверкой границ.
    const shipBodiesKey =
      brokenPieces.current.size === 0 ? bodies.current.size : -1;
    const shipBodiesFresh =
      shipBodiesKey !== -1 &&
      shipBodiesKey === shipBodiesIntactKey.current &&
      shipBodies.current.size > 0;
    shipBodiesIntactKey.current = shipBodiesKey;
    if (!shipBodiesFresh) {
      shipBodies.current.clear();
    }
    for (const frame of shipBodiesFresh ? [] : frames) {
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
      const physicalCarrier = clusterRegistry.current.get(
        frame.clusterId,
      )?.body;
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
            vehicleMassAdvantage: resolution.vehicleMassAdvantage,
            worldPieceId: obstacle?.pieceId ?? null,
            worldIntensity: resolution.obstacleIntensity,
            worldMassAdvantage: resolution.obstacleMassAdvantage,
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
      let frameDamaged = 0;
      // Пустые множества делают обход тождественным нулю — целая машина не
      // платит O(члены) за каждый шаг догона.
      if (brokenPieces.current.size > 0 || damagedPieces.size > 0) {
        for (const member of frame.members) {
          if (brokenPieces.current.has(member.piece.id)) {
            frameBroken += 1;
          }
          if (damagedPieces.has(member.piece.id)) {
            frameDamaged += 1;
          }
        }
      }
      const frameRemnants =
        clusterRemnants.get(frame.clusterId) ?? EMPTY_FRAME_REMNANTS;
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
      const membershipChanged =
        state.brokenSeen !== frameBroken ||
        state.damagedSeen !== frameDamaged ||
        state.memberRemnantsSeen !== frameRemnants ||
        !state.mass;
      if (membershipChanged || trimMoved) {
        const previousMass = state.mass;
        state.brokenSeen = frameBroken;
        state.damagedSeen = frameDamaged;
        state.memberRemnantsSeen = frameRemnants;
        if (membershipChanged) {
          // A repaired/reset member may detach again later and must inherit
          // the carrier's then-current motion as a fresh release.
          for (const releasedId of state.released) {
            if (!brokenPieces.current.has(releasedId)) {
              state.released.delete(releasedId);
            }
          }
          state.aliveMembers = frame.members.filter(
            (member) => !brokenPieces.current.has(member.piece.id),
          );
          // Уцелевшая оболочка — это то, что ещё НА машине. Надкусанное
          // carve полотнище или щербатая лопасть работают дальше: обнулять
          // их вклад значит объявлять машину без подъёма от царапины.
          state.envelopeLeft = state.aliveMembers.filter((member) =>
            member.piece.id.includes(frame.envelopeMatch),
          ).length;
        }
        state.trimMassPositions = trimRails.map(
          (_, index) => state.trim[index]?.position ?? 0,
        );
        // Масса машины — уцелевшие члены плюс ОБРУБКИ съеденных: дырка от
        // ракеты реально облегчает борт и сдвигает центр масс, а недобитый
        // кусок продолжает лететь с машиной своим настоящим остатком.
        const massPieces: BreakablePieceDefinition[] = [];
        for (const member of state.aliveMembers) {
          if (damagedPieces.has(member.piece.id)) {
            continue;
          }
          massPieces.push(
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
          );
        }
        for (const remnant of frameRemnants) {
          if (
            remnant.detached ||
            brokenPieces.current.has(remnant.parentId)
          ) {
            continue;
          }
          // ДЫРКА НЕ ПРИБАВЛЯЕТ ВЕСА. У обрубка объём считается по его
          // настоящим коробкам: габаритная коробка воксельного огрызка
          // заметно больше самого огрызка, и без этого попадание делало
          // корабль ТЯЖЕЛЕЕ целого — вес перерастал подъём, и машина
          // снималась с рейса «исчерпанным запасом» при целой оболочке.
          const remnantVolume =
            remnant.volume ??
            (remnant.boxes && remnant.boxes.length > 0
              ? remnant.boxes.reduce(
                  (sum, box) => sum + box.size[0] * box.size[1] * box.size[2],
                  0,
                )
              : remnant.size[0] * remnant.size[1] * remnant.size[2]);
          massPieces.push({
            id: remnant.id,
            clusterId: frame.clusterId,
            material: remnant.material,
            position: remnant.position,
            rotation: eulerFromQuaternion(remnant.quaternion),
            size: remnant.size,
            volume: remnantVolume,
            color: remnant.color,
          } as BreakablePieceDefinition);
        }
        // Разбор состава массы: из чего она набралась. Прирост веса от
        // локальной дырки означает двойной счёт, и увидеть его можно только
        // по числам «членов / обрубков / исключено».
        state.massBreakdown = {
          members: massPieces.length - frameRemnants.length,
          stumps: massPieces.length - (state.aliveMembers.length - 0),
          alive: state.aliveMembers.length,
          skippedDamaged: state.aliveMembers.filter((member) =>
            damagedPieces.has(member.piece.id),
          ).length,
          remnantsSeen: frameRemnants.length,
        };
        const nextMass = massProperties(massPieces, densityOf);
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
        // ТЯЖЕСТЬ НЕ ОТМЕНЯЕТСЯ ПОТЕРЕЙ ОБОЛОЧКИ.
        //
        // У составного тела gravityScale = 0: вес прикладывает этот код и
        // только он. Прежний ранний выход уносил вместе с управлением и
        // тяжесть — машина, потерявшая оболочку, продолжала лететь по
        // инерции «в закат», кувыркаясь от полученного момента, вместо того
        // чтобы упасть. Пока carrier существует, вес прикладывается всегда;
        // подъёма и управления у такой машины действительно больше нет.
        if (physicalCarrier && mass && mass.mass > 0) {
          const deadCentre: [number, number, number] = [
            mass.centre[0] + state.body.position[0],
            mass.centre[1] + state.body.position[1],
            mass.centre[2] + state.body.position[2],
          ];
          physicalCarrier.resetForces(false);
          physicalCarrier.resetTorques(false);
          physicalCarrier.addForceAtPoint(
            { x: 0, y: -mass.mass * GRAVITY, z: 0 },
            { x: deadCentre[0], y: deadCentre[1], z: deadCentre[2] },
            true,
          );
          const deadDamping =
            frame.flight.angularDamping * mass.inertia[4] * 0.35;
          physicalCarrier.addTorque(
            {
              x: -deadDamping * state.body.angularVelocity[0],
              y: -deadDamping * state.body.angularVelocity[1],
              z: -deadDamping * state.body.angularVelocity[2],
            },
            true,
          );
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

      // УПАЛА НИЖЕ МИРА — ПЕРЕСОБРАТЬ НА СВОЁМ МЕСТЕ.
      //
      // Глубина исчезновения до машин доходила, но спрашивалась ТОЛЬКО внутри
      // аварийного цикла и только в фазе снижения. Сбитая машина, которая
      // просто падает и в этот цикл не вошла, не удалялась никогда: она уходила
      // под мир и продолжала считаться там вечно, вместе со всеми своими
      // кусками. Обломки такой предел имеют давно.
      //
      // Пересборка, а не удаление, — вердикт Igor: полигон должен оставаться
      // рабочим, а не пустеть после первого же падения.
      //
      // Защёлка обязательна: пересборка проходит через состояние React, и до
      // следующего кадра машина всё ещё под миром. Без неё запрос уходил бы
      // каждый кадр падения.
      const belowWorld =
        centreNow[1] <= (recoveryServiceArea?.disappearY ?? -12);
      if (belowWorld && !state.fellOutOfWorld) {
        state.fellOutOfWorld = true;
        onVehicleRebuildRequest?.(frame.clusterId);
      } else if (!belowWorld && state.fellOutOfWorld) {
        state.fellOutOfWorld = false;
      }

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
        // Наклон винтового диска — это и есть способ перемещения мультиротора;
        // у машины с оболочкой боковые движители швартовые, и вести её тем же
        // законом значит отнимать у неё рейс: в прогоне дирижабль переставал
        // раскручивать валы, а базальтовый скай-рам доползал последние восемь
        // метров к причалу четырнадцать секунд.
        vectoredTranslation: frame.flight.liftSource === "rotor",
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
        flight?.pilot && seatCommandsCarrier(occupiedSeatId, frame.clusterId)
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
        flight?.pilot && seatCommandsCarrier(occupiedSeatId, frame.clusterId)
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
        const forward = rotateByQuaternion(state.body.orientation, frame.nose);
        onPassengerViewRestore?.(Math.atan2(-forward[0], -forward[2]), 0);
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
        ? rotorHoldState(
            frame,
            state.intactMass,
            state.mass,
            propulsion.fractions,
          )
        : null;
      const flightClearance = propulsionFlightClearance(propulsion, liftHold);
      const feedbackModel: ShipModel =
        driveUsesPropulsionFeedback(frame.flight.driveAnimation) && flight
          ? { ...shipModel, engineAvailability: flight.propulsionFeedback }
          : shipModel;
      // ПОВОРОТЛИВОСТЬ СООБЩАЕТСЯ АВТОПИЛОТУ ТАК ЖЕ, КАК ВСЁ ОСТАЛЬНОЕ:
      // замеренным числом снизу, а не паспортной догадкой сверху. Поперечное
      // ускорение у коптера равно g·tg(θmax) и ничему иному, а тормозит он
      // тем же, чем разгоняется, — вместе с реверсом тоннелей, если они есть.
      const autopilotModel: ShipModel =
        frame.flight.liftSource === "rotor"
          ? {
              ...feedbackModel,
              ...(state.rotorYawRateLimits
                ? { yawRateLimits: state.rotorYawRateLimits }
                : {}),
              turnCapability: {
                // Замеренное запаздывание контура: столько машина летит прежним
                // ходом, пока команда торможения становится силой.
                responseSeconds: 0.8,
                yawRate: ROTOR_YAW_RATE,
                lateralAcceleration: rotorcraftMaximumAcceleration(
                  frame.flight.maximumTilt ?? DEFAULT_ROTOR_TILT,
                ),
                braking:
                  rotorcraftMaximumAcceleration(
                    frame.flight.maximumTilt ?? DEFAULT_ROTOR_TILT,
                  ) +
                  (mass
                    ? rotorcraftSurgeAcceleration({
                        yawThrusters: frame.flight.limits.yawThrusters,
                        yawThrusterAvailability: state.yawThrusterHealth,
                        nose: frame.nose,
                        centreOfMass: mass.centre,
                        mass: mass.mass,
                      })
                    : 0),
              },
              governorScale: state.governor.scale,
            }
          : feedbackModel;
      // ОДИН ПАСПОРТ — ОДИН КОНВЕРТ. Предел позы выводится из разрешённого
      // машине наклона, а не помнится отдельным числом рядом с ним.
      const passportEnvelope = vehicleFailureEnvelopeFor(frame.flight);
      const failureEnvelope = driveUsesPropulsionFeedback(
        frame.flight.driveAnimation,
      )
        ? supervisedFailureEnvelope(flightClearance, passportEnvelope)
        : passportEnvelope;
      // One deviation model per machine, derived from the same envelope the
      // watchdog escalates on. Guidance is therefore always the first to act.
      // Supervision only stretches timers, never the limits themselves, so the
      // corridor is stable across damage and is derived once per carrier. A
      // reloaded passport brings a new approach gate and rebuilds it.
      if (!state.guidance || state.guidanceSource !== frame.flight.approach) {
        state.guidanceSource = frame.flight.approach;
        state.guidance = vehicleGuidanceEnvelope(
          passportEnvelope,
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
        state.activePlan = controlledPlan;
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
        // Считаются ТОЛЬКО тяговые каналы: углы вентиляторов рыскания идут
        // дальше по этому же списку, и владеет ими винтокрылый шаг.
        for (
          let engine = 0;
          engine < frame.flight.limits.enginePoints.length;
          engine += 1
        ) {
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
          state.supportContacts > 0 && requiredAltitude > ROUTE_GROUND_ALTITUDE
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
            readings: controlReadings(frame, state),
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
          Number(pilotControlsNow.forward) - Number(pilotControlsNow.backward);
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
            uprightCos:
              Math.cos(pilotAttitude.pitch) * Math.cos(pilotAttitude.roll),
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
              verticalDeceleration: GRAVITY * frame.flight.limits.liftTrimRange,
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
          flight.watchdog = rebaseVehicleFailureWatchdog(flight.watchdog, 0);
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
          !pilotStep.disarmRequested &&
          rotorcraftPilotNeedsFlightSupervision(
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
            readings: controlReadings(frame, state),
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
          failureEnvelope ?? passportEnvelope;
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
        // ФИГУРА ВЛАДЕЕТ МАШИНОЙ ЦЕЛИКОМ, И КОРРЕКТОР В НЕЁ НЕ ВМЕШИВАЕТСЯ.
        //
        // Возмущением объявляется большой угловой темп — «событие, которое
        // забрало машину себе». Фигура вращает машину БЫСТРО И ПО ТРЕБОВАНИЮ
        // МАРШРУТА, поэтому корректор читал каждую петлю как срыв, объявлял
        // `stabilizing`, подменял активный план своим — а у плана коррекции
        // фигур нет, и слой фигур выключался целиком. Живой замер: четыре
        // петли из шести номеров, обе разворачивающие фигуры не показаны, и
        // машина «приседала», стабилизируясь после каждой.
        //
        // Это третий случай одного и того же: детектор, не знающий, что поза
        // ЗАДАНА. Сторож позы и сторож высоты уже научены, теперь корректор.
        // Бросить фигуру на полпути нельзя ещё и потому, что перевёрнутая
        // машина обычному контуру читается как ровная — у неё и нос, и борт
        // горизонтальны. Свой поводок и свой срок у фигуры есть.
        if (
          !flight.trajectoryCorrection &&
          !state.figure.episode &&
          requestedTrajectoryMode !== "authoredRoute"
        ) {
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
          const groundSpeedNow = Math.hypot(
            state.body.velocity[0],
            state.body.velocity[2],
          );
          flight.progress = advanceVehicleRouteProgress(
            plan,
            flight.progress,
            centreNow,
            travelled,
            groundSpeedNow > 0.5
              ? [
                  state.body.velocity[0] / groundSpeedNow,
                  state.body.velocity[2] / groundSpeedNow,
                ]
              : undefined,
            // Срезать разворот позволено машине, которая перемещается наклоном
            // движителей: она проходит излом мимо кончика штатно. Крейсерское
            // судно идёт по линии, и та же поблажка уводит его счётчик вперёд
            // самой машины — до причала оно тогда не доходит, а доползает.
            frame.flight.liftSource === "rotor" ? PROGRESS_SEARCH_ARC : 0,
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
        if (process.env.NODE_ENV !== "production") {
          // Снимок ровно тех величин, по которым watchdog решает
          // «управление не доставлено». Три повода, и они различимы только
          // числами: нет органа, не доставлена тяга, не доставлен подъём.
          state.watchdogProbe = {
            requiredControlAvailable: propulsion.mode !== "inoperative",
            propulsionMode: propulsion.mode,
            requestedEffort: Number(requestedEffort.toFixed(2)),
            deliveredControl: Number(
              deliveredControlFraction(
                flight.driveThrottle,
                flight.throttle,
              ).toFixed(2),
            ),
            requestedLift: Number(requestedLiftEffort.toFixed(2)),
            deliveredLift: Number(liftDelivery.toFixed(2)),
            mismatchSeconds: Number(
              flight.watchdog.controlMismatchSeconds.toFixed(2),
            ),
          };
        }
        state.lastGuidanceYawRate = Number(
          piloted.guidance.yawRate.toFixed(3),
        );
        state.lastHeadingTarget = Number(
          (
            (Math.atan2(
              piloted.headingTarget[1],
              piloted.headingTarget[0],
            ) *
              180) /
            Math.PI
          ).toFixed(1),
        );
        const watchdogResult = advanceVehicleFailureWatchdog(
          flight.watchdog,
          {
            deltaSeconds: step,
            relativeAltitude: state.body.position[1],
            pitch: tracking.pitch,
            roll: tracking.roll,
            // Поза на фигуре задана маршрутом, а не потеряна машиной.
            executingFigure: state.figure.episode !== null,
            headingError: tracking.headingError,
            // Нос машины с векторной тягой курса не задаёт: тело держит линию
            // само, а нос ведётся отдельно. Судить её сход по носу — значит
            // выносить приговор исправной машине за то, ради чего эта тяга и
            // поставлена: в замере гексакоптер шёл в 4.7 м от линии при
            // полностью исправных органах и получал routeDivergence за 113°
            // отворота носа.
            courseFollowsNose: (frame.flight.limits.lateralThrust ?? 0) <= 1e-6,
            yawRateError:
              state.body.angularVelocity[1] -
              (usesRotorDynamics
                ? (state.rotorAcceptedYawRate ?? piloted.guidance.yawRate)
                : piloted.desiredYawRate),
            // What guidance cannot fix, not how far the burst pushed it.
            // Both numbers now come from the question the corrector asks, so
            // it always acts first by construction.
            crossTrackError: unrecoverable.crossTrack,
            // Порог ухода — местный: узкой улице метры, открытой воде десятки.
            corridorLimit: plan.corridor?.(flight.progress),
            altitudeError: unrecoverable.altitude,
            progress: flight.progress,
            requiredControlAvailable: usesRotorDynamics
              ? rotorControlAvailable
              : propulsion.mode !== "inoperative",
            requestedControlEffort: requestedEffort,
            deliveredControlFraction: usesRotorDynamics
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
          // ПОЛНЫЙ РАЗБОР ОТКАЗА. Вердикт называет класс беды, но снимает
          // машину с рейса конкретный разрыв «ожидалось / получено». Он
          // собирается по всем обязательным органам прямо в момент решения:
          // через полсекунды этих чисел уже не восстановить.
          const readings: VehicleControlReading[] = flight.driveThrottle.map(
            (requested, index) => {
              const delivered = flight.throttle[index] ?? 0;
              return {
                organ: `тяга ${index}`,
                expected: Number(requested.toFixed(2)),
                actual: Number(delivered.toFixed(2)),
                required: true,
                note:
                  Math.abs(requested) > 0.05 &&
                  Math.abs(delivered) < Math.abs(requested) * 0.5
                    ? "не отвечает"
                    : undefined,
              };
            },
          );
          readings.push({
            organ: "подъём",
            expected: Number(requestedLiftEffort.toFixed(2)),
            actual: Number(liftDelivery.toFixed(2)),
            required: true,
            note:
              requestedLiftEffort > 0.35 && liftDelivery < 0.5
                ? "запас исчерпан"
                : undefined,
          });
          readings.push({
            organ: "оболочка",
            expected: state.intactEnvelope,
            actual: state.envelopeLeft,
            required: true,
            note:
              state.envelopeLeft < state.intactEnvelope
                ? "потеряны полотнища"
                : undefined,
          });
          readings.push({
            organ: "масса",
            expected: Number(state.intactMass.toFixed(1)),
            actual: Number(mass.mass.toFixed(1)),
            required: false,
            note:
              mass.mass > state.intactMass * 1.01
                ? "ТЯЖЕЛЕЕ ЦЕЛОГО"
                : undefined,
          });
          if (state.massBreakdown) {
            readings.push({
              organ: "в массе: члены",
              expected: state.massBreakdown.alive,
              actual: state.massBreakdown.members,
              required: false,
            });
            readings.push({
              organ: "в массе: обрубки",
              expected: 0,
              actual: state.massBreakdown.remnantsSeen,
              required: false,
            });
            readings.push({
              organ: "исключено повреждённых",
              expected: state.massBreakdown.remnantsSeen > 0 ? 1 : 0,
              actual: state.massBreakdown.skippedDamaged,
              required: false,
              note:
                state.massBreakdown.remnantsSeen > 0 &&
                state.massBreakdown.skippedDamaged === 0
                  ? "ДВОЙНОЙ СЧЁТ"
                  : undefined,
            });
          }
          for (const [index, rail] of (frame.trimRails ?? []).entries()) {
            readings.push({
              organ: `дифферент ${rail.commandChannel}`,
              expected: 1,
              actual: state.trimAvailable[index] ? 1 : 0,
              required: true,
              note: state.trimAvailable[index]
                ? undefined
                : "тележка потеряна",
            });
          }
          const metrics: VehicleControlReading[] = [
            {
              organ: "курс, град",
              expected: 0,
              actual: Number(
                ((tracking.headingError * 180) / Math.PI).toFixed(1),
              ),
              required: false,
            },
            {
              organ: "уклонение, м",
              expected: 0,
              actual: Number(tracking.crossTrackError.toFixed(1)),
              required: false,
            },
            {
              organ: "высота, м",
              expected: 0,
              actual: Number(tracking.altitudeError.toFixed(1)),
              required: false,
            },
            {
              organ: "тангаж/крен, град",
              expected: 0,
              actual: Number(
                ((Math.hypot(tracking.pitch, tracking.roll) * 180) / Math.PI).toFixed(1),
              ),
              required: false,
            },
          ];
          onVehicleFailure?.({
            sourceId: frame.clusterId,
            sourceLabel: frame.telemetryLabel ?? frame.id.toUpperCase(),
            reason: watchdogResult.failure,
            readings,
            metrics,
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
          const spoolRequest = frame.flight.limits.enginePoints.map(
            () => spool,
          );
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

      if (
        process.env.NODE_ENV !== "production" &&
        typeof window !== "undefined"
      ) {
        // Самописец: что реально держит машину в момент отказа. Гадать по
        // симптому «мгновенный fail» дороже, чем прочитать ленту.
        const scope = window as unknown as Record<string, unknown>;
        const trace = (scope.__mamVehicleTraceLog ??= []) as unknown[];
        const sampler = (scope.__mamVehicleTraceAt ??= {}) as Record<
          string,
          number
        >;
        const nowMs = window.performance.now();
        if ((sampler[frame.id] ?? 0) + 250 <= nowMs) {
          sampler[frame.id] = nowMs;
          trace.push({
            at: Math.round(nowMs),
            frame: frame.id,
            alt: Number(state.body.position[1].toFixed(2)),
            vy: Number(state.body.velocity[1].toFixed(2)),
            mass: Number(mass.mass.toFixed(1)),
            intactMass: Number(state.intactMass.toFixed(1)),
            envelopeLeft: state.envelopeLeft,
            intactEnvelope: state.intactEnvelope,
            liftNow: Number(state.liftNow.toFixed(1)),
            liftCapacity: Number(liftCapacity.toFixed(1)),
            neutral: Number(neutral.toFixed(1)),
            broken: state.brokenSeen,
            damaged: state.damagedSeen,
            flight: state.flight ? state.flight.kind : null,
            progress: state.flight
              ? Number(state.flight.progress.toFixed(3))
              : null,
            recovery: state.recovery?.lifecycle.phase ?? null,
            // Режим ведения. Ход по маршруту двигает только штатный полёт:
            // в эпизоде коррекции прогресс намеренно стоит. Без этого поля
            // замерший счётчик неотличим от сломанного счётчика.
            correcting: state.flight?.trajectoryCorrection
              ? `${state.flight.trajectoryCorrection.phase}:${state.flight.trajectoryCorrection.reason}`
              : null,
            goArounds: state.flight?.goArounds ?? null,
            // Нос: сколько просит автомат, сколько разрешает распределитель
            // тяги и сколько из этого принято. Без этих трёх чисел «машина
            // не поворачивает нос» неотличимо от «машине нечем повернуть».
            yawWanted: state.lastGuidanceYawRate ?? null,
            yawLimit: state.rotorYawRateLimits
              ? Number(
                  Math.min(
                    Math.abs(state.rotorYawRateLimits.minimum),
                    Math.abs(state.rotorYawRateLimits.maximum),
                  ).toFixed(3),
                )
              : null,
            yawTaken: state.rotorAcceptedYawRate ?? null,
            // ПРИЧИНА, А НЕ ТОЛЬКО ВЕЛИЧИНА. Панель показывала «органы
            // отвечают — причина в маршруте или позе»: верно, но дальше
            // догадка. Здесь автомат называет, что именно упёрлось на каждом
            // канале, и разбор перестаёт быть гаданием.
            limitedBy: state.rotorLimits ?? null,
            // ФИГУРА: ЧТО ИДЁТ, ЧТО ПРОЙДЕНО И ПОЧЕМУ ПРОПУЩЕНО.
            //
            // Причина пропуска считалась с самого начала («пропуск не молчит»),
            // но наружу её никто не выводил, и разбор упирался в глаза: видно,
            // что фигуры нет, а почему — нет. Замер живьём: четыре петли из
            // шести номеров, обе разворачивающие фигуры не показаны, и назвать
            // причину было нечем.
            figure: state.figure.station?.key ?? null,
            figuresSpent: state.figure.spent.length
              ? state.figure.spent.join(",")
              : null,
            figureSkipped: state.figure.skipped,
            // Куда автомат хочет нос — против того, куда нос смотрит.
            noseWanted: state.lastHeadingTarget,
            disposition: state.recovery?.lifecycle.disposition ?? null,
            // Условия controlMismatch поимённо: вердикт один, а поводов три,
            // и по симптому «машина визуально цела» их не различить.
            mismatch: state.watchdogProbe,
            // Вес машины прикладывает НАШ код: у составного тела
            // gravityScale = 0. Нет носителя в реестре — нет ни веса, ни
            // подъёма, и тело летит по инерции «невзирая на тяжесть».
            hasCarrier: Boolean(
              clusterRegistry.current.get(frame.clusterId)?.body,
            ),
            vx: Number(state.body.velocity[0].toFixed(2)),
            vz: Number(state.body.velocity[2].toFixed(2)),
            // След на плане: по нему видно петли, которых нет в маршруте.
            x: Number((mass.centre[0] + state.body.position[0]).toFixed(2)),
            z: Number((mass.centre[2] + state.body.position[2]).toFixed(2)),
            yaw: Number(
              (
                (Math.atan2(
                  rotateByQuaternion(state.body.orientation, frame.nose)[0],
                  -rotateByQuaternion(state.body.orientation, frame.nose)[2],
                ) *
                  180) /
                Math.PI
              ).toFixed(1),
            ),
            yawRate: Number(state.body.angularVelocity[1].toFixed(3)),
            spin: Number(Math.hypot(...state.body.angularVelocity).toFixed(2)),
          });
          if (trace.length > 400) {
            trace.splice(0, trace.length - 400);
          }
        }
      }

      // ── ОПОРЫ ─────────────────────────────────────────────────────────────
      //
      // Машина, объявившая стойки, стоит на грунте ИМИ. Её ноги выключены из
      // обвода компаунда, поэтому Rapier о них не знает вовсе: луч ищет землю,
      // общий закон считает реакцию, а сюда возвращаются сила в пятке, число
      // опор под машиной и видимый ход штока.
      const strutForces: {
        force: [number, number, number];
        point: [number, number, number];
      }[] = [];
      let strutContacts = 0;
      if (frame.supportStruts?.length && mass && mass.mass > 0) {
        const cached = supportStrutBuilds.current.get(frame.id);
        // Пересборка от массы: пока она не уехала на процент, числа стойки
        // остаются верными, а бисекция газового столба стоит дороже луча.
        const build =
          cached && Math.abs(cached.mass - mass.mass) < mass.mass * 0.01
            ? cached
            : compileSupportStruts(frame, mass);
        supportStrutBuilds.current.set(frame.id, build);
        // УБОРКА ИДЁТ ПО ОБЩЕМУ ЖУРНАЛУ РЕЙСА, А НЕ ПО СВОЕМУ ТАЙМЕРУ.
        //
        // Нога уходит, когда рейс перешёл из взлётной фазы в крейсерскую, и
        // возвращается на подходе. Ни высоты, ни скорости, ни отдельного
        // расписания здесь нет: любая машина, у которой появится убирающаяся
        // опора, получит это правило даром. Отказ (`failed`) выпускает ноги —
        // машине, которая садится как умеет, они нужнее всего.
        const journey = airVehicleFlightEventState(
          frame,
          state.flight,
          state.recovery?.lifecycle ?? null,
        );
        const retractSeconds =
          build.struts.find((compiled) => compiled.retraction)?.retraction
            ?.seconds ?? 0;
        if (retractSeconds > 0) {
          const previous = supportStrutFold.current.get(frame.id) ?? 0;
          const rate = step / retractSeconds;
          supportStrutFold.current.set(
            frame.id,
            journey === "cruise"
              ? Math.min(1, previous + rate)
              : Math.max(0, previous - rate),
          );
        }
        const fold = supportStrutFold.current.get(frame.id) ?? 0;
        const ownBodies = shipBodies.current.get(frame.clusterId);
        supportStrutRay.current ??= new rapier.Ray(
          { x: 0, y: 0, z: 0 },
          { x: 0, y: 0, z: 0 },
        );
        const cast = supportStrutRay.current;
        const up = rotateByQuaternion(state.body.orientation, [0, 1, 0]);
        for (const compiled of build.struts) {
          const strut = compiled.strut;
          const foldAngle = compiled.retraction
            ? strutFoldAngle(compiled.retraction, fold)
            : 0;
          // УБРАННАЯ НОГА НЕ ДЕРЖИТ, И ПОЛУУБРАННАЯ ТОЖЕ. Опора считается
          // опорой только выпущенной до конца; всё остальное — брюхо и общий
          // закон материалов.
          const down = Math.abs(foldAngle) < 1e-4;
          const intact =
            down &&
            compiled.requiredMembers.every(
              (id) => attachedMembers.has(id) && !brokenPieces.current.has(id),
            );
          const mount = rotateByQuaternion(state.body.orientation, [
            strut.mount[0] - mass.centre[0],
            strut.mount[1] - mass.centre[1],
            strut.mount[2] - mass.centre[2],
          ]);
          const mountWorld: [number, number, number] = [
            centre[0] + mount[0],
            centre[1] + mount[1],
            centre[2] + mount[2],
          ];
          const axisWorld = rotateByQuaternion(
            state.body.orientation,
            strut.axis,
          );
          let probe = null as null | {
            distance: number;
            normal: [number, number, number];
          };
          if (intact && physicalCarrier) {
            cast.origin.x = mountWorld[0];
            cast.origin.y = mountWorld[1];
            cast.origin.z = mountWorld[2];
            cast.dir.x = axisWorld[0];
            cast.dir.y = axisWorld[1];
            cast.dir.z = axisWorld[2];
            const hit = rapierWorld.castRayAndGetNormal(
              cast,
              strut.extendedReach,
              true,
              undefined,
              VEHICLE_CONTACT_QUERY,
              undefined,
              physicalCarrier,
              (collider) => {
                const handle = collider.parent()?.handle;
                return (
                  handle === undefined ||
                  (handle !== physicalCarrier.handle && !ownBodies?.has(handle))
                );
              },
            );
            if (hit) {
              const flipped =
                hit.normal.x * up[0] +
                  hit.normal.y * up[1] +
                  hit.normal.z * up[2] <
                0;
              probe = {
                distance: hit.timeOfImpact,
                normal: flipped
                  ? [-hit.normal.x, -hit.normal.y, -hit.normal.z]
                  : [hit.normal.x, hit.normal.y, hit.normal.z],
              };
            }
          }
          const lever: [number, number, number] = [
            mountWorld[0] - centre[0],
            mountWorld[1] - centre[1],
            mountWorld[2] - centre[2],
          ];
          const mountVelocity: [number, number, number] = [
            state.body.velocity[0] +
              state.body.angularVelocity[1] * lever[2] -
              state.body.angularVelocity[2] * lever[1],
            state.body.velocity[1] +
              state.body.angularVelocity[2] * lever[0] -
              state.body.angularVelocity[0] * lever[2],
            state.body.velocity[2] +
              state.body.angularVelocity[0] * lever[1] -
              state.body.angularVelocity[1] * lever[0],
          ];
          const reaction = strutReaction(
            strut,
            probe,
            probe
              ? strutClosingSpeed(mountVelocity, axisWorld, probe.normal)
              : 0,
            step,
            intact ? 1 : 0,
          );
          if (probe && reaction.load > 0) {
            strutContacts += 1;
            const foot: [number, number, number] = [
              mountWorld[0] + axisWorld[0] * probe.distance,
              mountWorld[1] + axisWorld[1] * probe.distance,
              mountWorld[2] + axisWorld[2] * probe.distance,
            ];
            strutForces.push({
              force: [
                probe.normal[0] * reaction.load,
                probe.normal[1] * reaction.load,
                probe.normal[2] * reaction.load,
              ],
              point: foot,
            });
            // Пятка не катится: она держит во все стороны одинаково. Без неё
            // севшая машина уезжала бы по площадке от любого остатка хода.
            const footVelocity: [number, number, number] = [
              state.body.velocity[0] +
                state.body.angularVelocity[1] * (foot[2] - centre[2]) -
                state.body.angularVelocity[2] * (foot[1] - centre[1]),
              state.body.velocity[1] +
                state.body.angularVelocity[2] * (foot[0] - centre[0]) -
                state.body.angularVelocity[0] * (foot[2] - centre[2]),
              state.body.velocity[2] +
                state.body.angularVelocity[0] * (foot[1] - centre[1]) -
                state.body.angularVelocity[1] * (foot[0] - centre[0]),
            ];
            const along =
              footVelocity[0] * probe.normal[0] +
              footVelocity[1] * probe.normal[1] +
              footVelocity[2] * probe.normal[2];
            const friction = strutPadFriction(
              strut,
              reaction.load,
              [
                footVelocity[0] - probe.normal[0] * along,
                footVelocity[1] - probe.normal[1] * along,
                footVelocity[2] - probe.normal[2] * along,
              ],
            );
            strutForces.push({
              force: [friction[0], friction[1], friction[2]],
              point: foot,
            });
          }
          // Движение ноги в кадр. Сначала ход штока — разгруженная стойка
          // выпускается ниже авторской позы, потому что авторская нарисована
          // под весом машины, — и уже сдвинутый кусок складывается вокруг
          // цапфы. Порядок именно этот: шток ходит по СВОЕЙ оси, а она сама
          // повёрнута уборкой.
          const travel = strutVisualSlide(strut, reaction.compression);
          const turn = compiled.retraction
            ? { axis: compiled.retraction.hinge, angle: foldAngle }
            : undefined;
          for (const member of compiled.members) {
            const share = member.travelShare;
            const moved: [number, number, number] = [
              member.centre[0] + travel[0] * share,
              member.centre[1] + travel[1] * share,
              member.centre[2] + travel[2] * share,
            ];
            if (!member.folds || !compiled.retraction) {
              setMemberArticulation(member.id, {
                steer: 0,
                spin: 0,
                slide: [
                  moved[0] - member.centre[0],
                  moved[1] - member.centre[1],
                  moved[2] - member.centre[2],
                ],
              });
              continue;
            }
            const folded = strutFoldOffset(
              compiled.retraction,
              foldAngle,
              moved,
            );
            setMemberArticulation(member.id, {
              steer: 0,
              spin: 0,
              turn,
              slide: [
                moved[0] - member.centre[0] + folded[0],
                moved[1] - member.centre[1] + folded[1],
                moved[2] - member.centre[2] + folded[2],
              ],
            });
          }
        }
      }

      // Stable support is measured from Rapier contacts. The solver owns the
      // normal reaction and Coulomb friction; this channel reports only that
      // an upward-facing surface is persistently carrying the vehicle.
      const physicalRuntime = clusterRegistry.current.get(frame.clusterId);
      // Собственный свежий обломок ЗЕМЛЁЙ не является. Он рождается внутри
      // корпуса и упирается в него; засчитанный опорой, он убеждал летящую
      // машину, что она стоит на грунте, — и одно разбитое стекло обрывало
      // исправный рейс детектором «неожиданного контакта». Тот же реестр
      // собственных тел уже отсекает свои куски для лучей опоры.
      const ownDebrisBodies = shipBodies.current.get(frame.clusterId);
      // ОПОРА НА СТОЙКАХ — ТОЖЕ ОПОРА. У машины с ногами вне обвода компаунда
      // манифестов при штатной посадке не будет вовсе: она стоит на грунте
      // тем, чего Rapier не видит. Считать её при этом летящей значило бы
      // сорвать ей каждую посадку.
      state.supportContacts = strutContacts + (physicalRuntime
        ? countActiveUpwardSupportContacts(
            rapierWorld.narrowPhase,
            physicalRuntime.body,
            physicalRuntime.activePhysicalContacts,
            (otherCollider) => {
              const parent = rapierWorld.getCollider(otherCollider)?.parent();
              if (!parent) {
                return false;
              }
              if (ownDebrisBodies?.has(parent.handle)) {
                return true;
              }
              // ГРУНТА ВНУТРИ СОБСТВЕННОГО КОРПУСА НЕ БЫВАЕТ.
              //
              // Реестр своих тел знает только ЧЛЕНОВ машины, а разбитое
              // стекло рассыпается ОСКОЛКАМИ: у них собственные тела и
              // никакой связи с кластером. Осколки оседали на полу гондолы,
              // упирались в корпус снизу — и одна пулевая дырка в стекле
              // снимала исправный дирижабль с рейса «неожиданным контактом с
              // грунтом». Признак «своего» поэтому геометрический и покрывает
              // любой обломок: тело, чей центр внутри габарита корпуса, для
              // этой машины опорой быть не может. Настоящая земля, крыша или
              // мачта лежат снаружи габарита и опорой остаются.
              const carrierPosition = physicalRuntime.body.translation();
              const carrierRotation = physicalRuntime.body.rotation();
              const otherPosition = parent.translation();
              const local = debrisLocalPoint.current
                .set(
                  otherPosition.x - carrierPosition.x,
                  otherPosition.y - carrierPosition.y,
                  otherPosition.z - carrierPosition.z,
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
              return (
                local.x > frame.localBounds.minimum[0] &&
                local.x < frame.localBounds.maximum[0] &&
                local.y > frame.localBounds.minimum[1] &&
                local.y < frame.localBounds.maximum[1] &&
                local.z > frame.localBounds.minimum[2] &&
                local.z < frame.localBounds.maximum[2]
              );
            },
          )
        : 0);
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
      // ---------------------------------------------------------------
      // ВОЗДУШНЫЙ БОЙ — ТРЕТИЙ ИСТОЧНИК GUIDANCE.
      //
      // Врезка сознательно узкая: автомат боя ПЕРЕОПРЕДЕЛЯЕТ уже посчитанное
      // требование наведения и не трогает ничего больше — ни микшер, ни позу,
      // ни маршрутный прогресс. Ровно так же в этот контур входит человек
      // (`rotorcraftPilot`), и по той же причине: guidance — общая граница, а
      // не собственность автопилота.
      //
      // Условий работы три, и все объявлены ПАСПОРТОМ, а не именем машины:
      // у неё есть вооружение, паспорт объявил пост для этой задачи, и она в
      // воздухе. Прежде здесь стояло сравнение рейса с ИМЕНЕМ боевой задачи и
      // три константы полигона, приехавшие импортом из файла маршрутов, — то
      // есть движок знал имя машины и разметку конкретной карты. Имя задачи
      // сюда не возвращать даже в комментарии: сторож изоляции проверяет
      // литерал, и оправдаться «это же комментарий» не выйдет.
      // ---------------------------------------------------------------
      const combatStation = flight
        ? (frame.flight.combatStation?.(flight.kind, berth) ?? null)
        : null;
      if (
        frame.armament &&
        usesRotorDynamics &&
        mass &&
        combatStation &&
        flight?.castOff
      ) {
        // БОЕВОЕ ЗРЕНИЕ ОБЩЕЕ, РЕШЕНИЕ ЧАСТНОЕ. Сборка снимков живёт в
        // `airCombatSensing`, здесь остаётся ровно доступ к рантайму двумя
        // вопросами. Уклонению понадобятся ТЕ ЖЕ снимки — оно смотрит на
        // охотника вместо добычи, — и второй вывод осей в другом месте был бы
        // вторым шансом ошибиться знаком.
        const combatWorld: SightedWorld = {
          stateOf: (frameId) => states.current.get(frameId),
          attachedTo: (clusterId) =>
            clusterRegistry.current.get(clusterId)?.attachedMemberIds ??
            new Set<string>(),
        };
        const tracks = airCombatTracks(frame.id, frames, combatWorld);
        const own = airCombatOwnState(frame, state, mass.centre);
        const combatCentre = own.centre;
        const gunAxis = own.gunAxis;

        state.combat ??= createAirCombatState(
          frame.armament.rockets.mounts.length,
        );
        // Предельная скорость ВЫВОДИТСЯ, а не берётся из маршрута: это та, на
        // которой требуемый темп разворота ещё равен располагаемому.
        const combatLateral = GRAVITY * Math.tan(frame.flight.maximumTilt ?? 0);
        const combatStep = stepAirCombat({
          own,
          station: combatStation,
          armament: frame.armament,
          limits: {
            maximumSpeed: combatLateral / ROTOR_YAW_RATE,
            yawRate: ROTOR_YAW_RATE,
            liftTrimRange: frame.flight.limits.liftTrimRange,
            lateralAcceleration: combatLateral,
            // Фигур боевому пилоту пока не отдано: вход в них перекрыт на время
            // боя, и обещать разворот через верх было бы враньём оценщику.
            reversal: null,
            // Нос АВТОРСКИЙ — поза строится поворотом от позы покоя.
            authoredNose: [frame.nose[0], frame.nose[2]],
            liftReserve: frame.flight.liftReserve ?? DEFAULT_VEHICLE_LIFT_RESERVE,
            surgeAcceleration: rotorcraftSurgeAcceleration({
              centreOfMass: mass.centre,
              nose: frame.nose,
              mass: mass.mass,
              yawThrusters: frame.flight.limits.yawThrusters,
              yawThrusterAvailability: (
                frame.flight.limits.yawThrusters ?? []
              ).map((_, index) =>
                state.yawThrustersProven
                  ? (state.yawThrusterHealth[index] ?? 1)
                  : 0,
              ),
            }),
          },
          tracks,
          deltaSeconds: step,
          state: state.combat,
        });
        state.combat = combatStep.state;
        // Пока цели нет, машина идёт по СВОЕЙ трассе: сторожевая орбита —
        // маршрут, а не выдумка автомата боя. Требование перехватывается
        // только тогда, когда бой действительно начался.
        if (combatStep.state.mode !== "station") {
          rotorGuidance = combatStep.guidance;
          liftCommand = combatStep.guidance.liftFraction;
        }
        if (combatStep.shots.length > 0 && onVehicleWeaponFire) {
          const carrierPose = {
            centre: combatCentre,
            massCentre: mass.centre as [number, number, number],
            velocity: state.body.velocity as [number, number, number],
            gunAxis: gunAxis as [number, number, number],
            rotate: (local: [number, number, number]) =>
              rotateByQuaternion(state.body.orientation, local) as
                [number, number, number],
          };
          onVehicleWeaponFire({
            frameId: frame.id,
            clusterId: frame.clusterId,
            shots: combatStep.shots.map((shot) =>
              resolveVehicleWeaponShot(shot, frame.armament!, carrierPose),
            ),
          });
        }
      } else if (state.combat) {
        state.combat = null;
      }

      // ---------------------------------------------------------------
      // УКЛОНЕНИЕ — ПЯТЫЙ ИСТОЧНИК GUIDANCE, и самый скромный из них.
      //
      // Он не перехватывает требование, а ПОПРАВЛЯЕТ уже посчитанное: машина
      // продолжает лететь свою трассу, только сходит с линии огня. Отсюда и
      // возврат берётся даром — ошибка маршрута сама тянет обратно, и писать
      // «вернуться» не нужно.
      //
      // Условие одно и объявлено паспортом: у машины есть способность
      // уклоняться. Кто именно пуглив, движок не знает.
      // ---------------------------------------------------------------
      const evasion = frame.flight.evasion;
      if (evasion && usesRotorDynamics && mass && flight?.castOff && rotorGuidance) {
        const evasionWorld: SightedWorld = {
          stateOf: (frameId) => states.current.get(frameId),
          attachedTo: (clusterId) =>
            clusterRegistry.current.get(clusterId)?.attachedMemberIds ??
            new Set<string>(),
        };
        state.evasion ??= createEvasionState();
        const evasionStep = stepEvasion({
          own: {
            allegiance: allegianceOf(frame),
            centre: [
              mass.centre[0] + state.body.position[0],
              mass.centre[1] + state.body.position[1],
              mass.centre[2] + state.body.position[2],
            ],
            velocity: state.body.velocity,
          },
          tracks: airCombatTracks(frame.id, frames, evasionWorld),
          capability: evasion,
          deltaSeconds: step,
          state: state.evasion,
          deck: berth[1],
          boundary: recoveryServiceArea
            ? {
                centre: [
                  recoveryServiceArea.center[0],
                  0,
                  recoveryServiceArea.center[1],
                ],
                radius: recoveryServiceArea.radius,
              }
            : undefined,
        });
        state.evasion = evasionStep.state;
        const offset = evasionStep.velocityOffset;
        if (offset[0] !== 0 || offset[1] !== 0 || offset[2] !== 0) {
          // Поправка кладётся В ОСЯХ МАШИНЫ: контур принимает продольную и
          // боковую скорость, а не мировой вектор.
          const forward = rotateByQuaternion(state.body.orientation, frame.nose);
          const flat = Math.hypot(forward[0], forward[2]) || 1;
          const nose: [number, number] = [forward[0] / flat, forward[2] / flat];
          const starboard: [number, number] = [-nose[1], nose[0]];
          rotorGuidance = {
            ...rotorGuidance,
            forwardSpeed:
              rotorGuidance.forwardSpeed + offset[0] * nose[0] + offset[2] * nose[1],
            lateralSpeed:
              rotorGuidance.lateralSpeed +
              offset[0] * starboard[0] +
              offset[2] * starboard[1],
            // ТРАССА ОБЯЗАНА ОТПУСТИТЬ на время рывка. Без этого регулятор
            // возврата гасит поправку, и манёвр читается как «не работает»,
            // хотя работает как раз слишком хорошо.
            slipAllowance: Math.max(
              rotorGuidance.slipAllowance ?? 0,
              Math.PI / 3,
            ),
          };
          liftCommand = Math.max(
            0,
            Math.min(1, liftCommand + offset[1] * 0.02),
          );
        }
      } else if (state.evasion) {
        state.evasion = null;
      }

      // ---------------------------------------------------------------
      // ФИГУРЫ ВЫСШЕГО ПИЛОТАЖА — ЧЕТВЁРТЫЙ ИСТОЧНИК GUIDANCE.
      //
      // Врезка такая же узкая, как боевая, и по тому же правилу: решение
      // целиком в чистой `advanceRouteFigures`, здесь только состояние между
      // кадрами и подстановка результата. React-часть тестами не покрыта, и
      // обе поломки боевой задачи жили именно в ней — второй раз наступать
      // на это незачем.
      //
      // Пока фигура идёт, прогресс трассы ЗАМИРАЕТ: она не является функцией
      // горизонтального положения, и двигать по ней проекцию нечем.
      // ---------------------------------------------------------------
      const figurePlan = state.activePlan;
      // НАЧАТУЮ ФИГУРУ ДОВОДЯТ ДО КОНЦА. Условия входа проверяются один раз, а
      // дальше в силе только одно: машина, перевёрнутая на полпути, обязана
      // получить команду перевернуться обратно. Бросить её там нельзя — обычный
      // контур позы этого положения не различает: у перевёрнутой машины и нос,
      // и борт горизонтальны, то есть «тангаж ноль, крен ноль», и она читается
      // как ровная. Поэтому смена задачи, начало боя или потеря фигур
      // маршрутом обрывают ВХОД в фигуру, но не саму фигуру.
      const figureRunning = state.figure.episode !== null;
      if (
        usesRotorDynamics &&
        mass &&
        flight &&
        flight.castOff &&
        !state.recovery &&
        (!state.combat || figureRunning) &&
        (figurePlan?.figures?.length || figureRunning)
      ) {
        const figureLimits = frame.flight.limits;
        // ВЕСЬ КАДР ФИГУРЫ СЧИТАЕТ ОБЩАЯ ЧИСТАЯ ФУНКЦИЯ. Здесь остаётся ровно
        // то, что принадлежит компоненту: состояние тела на входе и подстановка
        // результата на выходе. Сборка паспорта фигуры, опора высоты, власть и
        // замирание прогресса — там же, где стенд их берёт, и разойтись им
        // больше нечем.
        const figured = advanceRouteFigureFrame({
          state: state.figure,
          frozenProgress: state.figureProgress,
          stations: figurePlan?.figures,
          berthAltitude: figurePlan?.point(1)[1] ?? 0,
          progress: flight.progress,
          attitude: state.body.orientation,
          centre: [
            mass.centre[0] + state.body.position[0],
            mass.centre[1] + state.body.position[1],
            mass.centre[2] + state.body.position[2],
          ],
          velocity: state.body.velocity,
          bodyNose: frame.nose,
          machine: {
            points: figureLimits.enginePoints,
            centreOfMass: mass.centre,
            nose: frame.nose,
            mass: mass.mass,
            inertia: [mass.inertia[0], mass.inertia[4], mass.inertia[8]],
            liftCapacity:
              mass.mass * GRAVITY * (frame.flight.liftReserve ?? 1.35),
            capacityWeights: figureLimits.rotorCapacityWeights,
            angularDamping: frame.flight.angularDamping,
          },
          authority: Math.min(
            1,
            ...(flight.propulsionFeedback ?? propulsion.fractions),
          ),
          deltaSeconds: step,
        });
        state.figure = figured.state;
        state.figureProgress = figured.frozenProgress;
        flight.progress = figured.progress;
        if (figured.guidance) {
          rotorGuidance = figured.guidance;
        }
      } else if (state.figure.episode) {
        state.figure = IDLE_ROUTE_FIGURE;
        state.figureProgress = null;
      }

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
        // Реакция грунта под пятками. Она приходит НЕ от солвера: ноги этой
        // машины вне обвода компаунда, и всё, чем она стоит, посчитано выше.
        ...strutForces,
        ...controls,
      ] as const;
      if (physicalCarrier) {
        const wakeForAppliedForces = Boolean(state.flight || state.recovery);
        // Rapier user forces are persistent, not per-step accumulators. Every
        // force below is a fresh measurement for this physics step, so keeping
        // the previous step would integrate the controller output a second
        // time and release the accumulated load when a sleeping berth wakes.
        physicalCarrier.resetForces(false);
        physicalCarrier.resetTorques(false);
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
          ];
          // Тип машины — тип строк. Ослабший и ВЫБИТЫЙ орган различаются:
          // warning деградировал, critical мёртв.
          const organState = (value: number) =>
            value <= 0.05
              ? ("critical" as const)
              : value < 1 - 1e-6
                ? ("warning" as const)
                : ("normal" as const);
          if (usesRotorDynamics) {
            // Гексакоптер читается по бортам: своя строка каждому борту,
            // внутри — с ПЕРЕДНЕГО кольца. Плоский список из шести чисел с
            // двумя подписями путал стороны.
            const ringOutputs = engineValuesBySide(
              state.rotorMotorOutput,
              frame.flight.limits.enginePoints,
              state.mass?.centre ?? frame.origin,
              frame.nose,
            );
            const ringHealth = engineValuesBySide(
              propulsion.fractions,
              frame.flight.limits.enginePoints,
              state.mass?.centre ?? frame.origin,
              frame.nose,
            );
            metrics.push(
              {
                id: "rotorRingsPort",
                value: ringOutputs.port.map((value) => value * 100),
                valueStates: ringHealth.port.map(organState),
                unit: "percent",
                precision: 0,
                activityDelta: 4,
              },
              {
                id: "rotorRingsStarboard",
                value: ringOutputs.starboard.map((value) => value * 100),
                valueStates: ringHealth.starboard.map(organState),
                unit: "percent",
                precision: 0,
                activityDelta: 4,
              },
            );
          } else {
            metrics.push({
              id: "propellerRevolutions",
              value: engineValuesPortToStarboard(
                telemetryFlight.driveThrottle,
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
              ).map(organState),
              unit: "percent",
              precision: 0,
              signed: true,
              activityDelta: 4,
            });
          }
          // Тоннели рыскания — отдельная строка отдельного органа: знак — это
          // реверс, и он часть показания, а не шум.
          const telemetryYawThrusters = frame.flight.limits.yawThrusters ?? [];
          if (telemetryYawThrusters.length > 0) {
            const tunnelOutputs = engineValuesBySide(
              state.yawThrusterOutput,
              telemetryYawThrusters.map((thruster) => thruster.point),
              state.mass?.centre ?? frame.origin,
              frame.nose,
            );
            const tunnelHealth = engineValuesBySide(
              state.yawThrusterHealth,
              telemetryYawThrusters.map((thruster) => thruster.point),
              state.mass?.centre ?? frame.origin,
              frame.nose,
            );
            metrics.push({
              id: "yawTunnels",
              value: [...tunnelOutputs.port, ...tunnelOutputs.starboard].map(
                (value) => value * 100,
              ),
              valueSides: ["left", "right"],
              valueStates: [...tunnelHealth.port, ...tunnelHealth.starboard].map(
                organState,
              ),
              unit: "percent",
              precision: 0,
              signed: true,
              activityDelta: 6,
            });
          }
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
          // Живой силуэт органов для панели и сферы удара — в ЕДИНОЙ
          // нормировке корпуса с точкой удара (carrierHullPoint).
          const telemetryMass = state.mass;
          const telemetryMachine =
            telemetryMass !== null
              ? {
                  kind: usesRotorDynamics
                    ? ("rotorcraft" as const)
                    : ("buoyant" as const),
                  engines: frame.flight.limits.enginePoints.map(
                    (point, index) => ({
                      point: carrierHullPoint(frame, telemetryMass, point),
                      output: usesRotorDynamics
                        ? (state.rotorMotorOutput[index] ?? 0)
                        : Math.abs(telemetryFlight.driveThrottle[index] ?? 0),
                      health: propulsion.fractions[index] ?? 1,
                    }),
                  ),
                  auxiliary:
                    telemetryYawThrusters.length > 0
                      ? telemetryYawThrusters.map((thruster, index) => ({
                          point: carrierHullPoint(
                            frame,
                            telemetryMass,
                            thruster.point,
                          ),
                          output: state.yawThrusterOutput[index] ?? 0,
                          health: state.yawThrusterHealth[index] ?? 1,
                          reversible: true,
                        }))
                      : undefined,
                }
              : undefined;
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
              machine: telemetryMachine,
            },
          });
        }
      }
    }

    for (const frame of frames) {
      const state = frameState(frame.id);
      const pose = state.pose;
      const authoredRest = isRestingPose(pose);
      const physicalCarrier = clusterRegistry.current.get(
        frame.clusterId,
      )?.body;
      const carrierSleeping = physicalCarrier?.isSleeping() ?? authoredRest;
      const pendingMemberRelease = state.brokenSeen > state.released.size;
      if (carrierSleeping && !state.moving && !pendingMemberRelease) {
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
        const needsPoseBody = compoundMemberNeedsPoseBody(frame, piece);
        if (brokenPieces.current.has(piece.id)) {
          // Отломанный кусок живёт своей жизнью — но улетает он ВМЕСТЕ с
          // кораблём: скорость кадра дарим ровно один раз.
          if (
            !state.released.has(piece.id) &&
            body.bodyType() === rapier.RigidBodyType.Dynamic
          ) {
            // Ordinary members never spent the flight writing an empty
            // kinematic body. Materialise one at the carrier's exact current
            // pose only now, when the member has actually detached.
            if (!needsPoseBody) {
              const placed = vehiclePiecePosition(
                frame.origin,
                piece.position,
                pose,
                rotation,
              );
              body.setTranslation(
                { x: placed[0], y: placed[1], z: placed[2] },
                false,
              );
              const composed = multiplyQuaternions(rotation, [
                member.baseQuaternion.x,
                member.baseQuaternion.y,
                member.baseQuaternion.z,
                member.baseQuaternion.w,
              ]);
              body.setRotation(
                {
                  x: composed[0],
                  y: composed[1],
                  z: composed[2],
                  w: composed[3],
                },
                false,
              );
            }
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
            state.released.add(piece.id);
          }
          continue;
        }
        if (!needsPoseBody) {
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

        if (authoredRest) {
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
          //
          // Собственная ось члена старше паспортной: у наклонного тоннеля вал
          // развёрнут на угол установки, и крутить его лопасти вокруг общей
          // вертикали значило бы показывать не тот механизм.
          const authoredShaft =
            member.spinAxis ??
            (frame.flight.driveAnimation.kind === "propeller"
              ? frame.flight.driveAnimation.shaftAxis
              : undefined);
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

      state.moving = !carrierSleeping;
      const clusterId = frame.clusterId;
      if (clusterId) {
        const eventState = airVehicleFlightEventState(
          frame,
          state.flight,
          state.recovery?.lifecycle ?? null,
        );
        if (movingVehicles) {
          if (carrierSleeping) {
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
      if (carrierSleeping) {
        state.velocity = [0, 0, 0];
      }
    }

    if (
      onRotorcraftPilotStatusChange &&
      seatCommandsRotorcraft(occupiedSeatId)
    ) {
      const pilotRuntime = frames
        .map((frame) => ({ frame, state: frameState(frame.id) }))
        .find(
          ({ state }) =>
            state.flight?.pilot !== null && state.flight?.pilot !== undefined,
        );
      const pilot = pilotRuntime?.state.flight?.pilot ?? null;
      if (pilot && pilotRuntime) {
        const now = performance.now();
        const { frame, state } = pilotRuntime;
        // Сборка доклада и разбор дальномеров живут в `rotorcraftPilotStatus`:
        // это приборная доска, по ней человек решает снижаться или уходить, и
        // покрыта она должна быть как расчёт, а не как кусок компонента.
        const status = rotorcraftPilotStatusOf({
          pilot,
          nose: frame.nose,
          forward: rotateByQuaternion(state.body.orientation, frame.nose),
          position: state.body.position,
          velocity: state.body.velocity,
          attitude: vehicleAttitude(state.body.orientation, frame.nose),
          obstacleReadings: state.flight?.pilotObstacleReadings ?? [],
          intervenedSensors:
            state.flight?.pilotIntervenedSensors ?? EMPTY_SENSOR_SET,
          motorOutput: state.rotorMotorOutput,
          propulsionFeedback: state.flight?.propulsionFeedback,
        });
        const key = pilotStatusKey(status);
        const modeChanged = pilotStatusMode.current !== status.mode;
        if (
          key !== pilotStatusPublished.current &&
          (modeChanged || now >= pilotStatusNextAt.current)
        ) {
          pilotStatusPublished.current = key;
          pilotStatusMode.current = status.mode;
          pilotStatusNextAt.current = now + 100;
          onRotorcraftPilotStatusChange(status);
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
        detachedPieces={clusterDetachedPieces}
        consumedPieces={carvedPieces}
        remnants={remnants}
        registry={clusterRegistry}
        onContact={collectContact}
      />
      <VehicleExhaustSmoke
        frames={frames}
        states={states}
        inactivePieces={inactivePieces}
        damagedPieces={smokingDamage}
        bodies={bodies}
      />
      <VehicleAimSelector
        frames={frames}
        states={states}
        onSelectionChange={onAimSelectionChange}
        indicatorRef={aimIndicatorRef}
      />
      <FlightRouteRibbons
        frames={frames}
        states={states}
        enabled={showRouteOverlay}
        selectedClusterId={selectedVehicleClusterId}
      />
    </>
  );
}

/**
 * ТРАССА В МИРЕ — ЖИРНАЯ ЛИНИЯ, А НЕ `gl.LINES`.
 *
 * `THREE.Line` рисуется через `gl.LINES`, а `linewidth` там игнорирует
 * ДРАЙВЕР: на всяком десктопном GL нить ровно в один пиксель, и никакой
 * материал этого не меняет. Отсюда и «маршруты — тонкие нитки», и то, что
 * дальнее не отличалось от ближнего: один пиксель в сорока метрах и в
 * четырёхстах — буквально одни и те же пиксели. Слои разведены по
 * `LineSegments2`, а ширина каждого — МИРОВАЯ, зажатая полом и потолком в
 * экранных пикселях (`createRouteLineMaterial`): близь жирная, даль тонкая,
 * но никогда не исчезает. Ленты по-прежнему нет — есть иерархия толщин.
 */
const ROUTE_TRAIL_COMMIT_METRES = 0.5;
const ROUTE_TRAIL_MAX_SAMPLES = 4000;

function routeVisualKey(plan: VehicleRoutePlan): string {
  const anchors = [0, 0.37, 0.73, 1].flatMap((progress) =>
    plan.point(progress).map((value) => Math.round(value * 100)),
  );
  return `${plan.id}:${Math.round(plan.length * 100)}:${anchors.join(",")}`;
}

type RouteRgbaGeometry = {
  readonly positions: Float32Array;
  readonly colors: Float32Array;
};

/** [метры начала затухания, метры конца, остаточная доля яркости]. */
type RouteFade = readonly [number, number, number];

const ROUTE_FADE_LINE: RouteFade = [90, 620, 0.4];
const ROUTE_FADE_SOFT: RouteFade = [120, 700, 0.55];
const ROUTE_FADE_UNDERLAY: RouteFade = [60, 420, 0.25];

interface RouteLineStyle {
  /** Мировая ширина нити, метры. */
  readonly world: number;
  /** Пол в экранных пикселях: даль тонкая, но не исчезает. */
  readonly minPixels: number;
  /** Потолок в экранных пикселях: близь жирная, но не колбаса. */
  readonly maxPixels: number;
  readonly opacity: number;
  /**
   * Сквозной проход: рисуется БЕЗ depth-теста и раньше основного, поэтому
   * скрытый за домом кусок трассы читается как «за домом», а не пропадает.
   * Перекрытие — сильнейшая подсказка глубины, и терять её нельзя.
   */
  readonly through?: boolean;
  readonly dash?: readonly [number, number];
  readonly fade?: RouteFade;
}

function createRouteLineMaterial(style: RouteLineStyle): LineMaterial {
  const material = new LineMaterial({
    color: 0xffffff,
    linewidth: style.maxPixels,
    worldUnits: false,
    vertexColors: true,
    transparent: true,
    opacity: style.opacity,
    depthWrite: false,
    depthTest: style.through !== true,
    toneMapped: false,
    dashed: style.dash !== undefined,
  });
  if (style.dash) {
    material.dashScale = 1;
    material.dashSize = style.dash[0];
    material.gapSize = style.dash[1];
  }
  material.resolution.set(1, 1);
  const fade = style.fade ?? ROUTE_FADE_LINE;
  material.uniforms.routeWidthWorld = { value: style.world };
  material.uniforms.routeWidthClamp = {
    value: new Vector2(style.minPixels, style.maxPixels),
  };
  material.uniforms.routeFade = {
    value: new Vector3(fade[0], fade[1], fade[2]),
  };
  material.vertexShader = patchRouteLineVertexShader(material.vertexShader);
  material.fragmentShader = patchRouteLineFragmentShader(
    material.fragmentShader,
  );
  return material;
}

/**
 * Слой трассы принимает `RouteLineGeometry` — либо полилинию (`strip`), либо
 * готовые пары вершин. Альфа уходит в собственный per-instance атрибут.
 */
function setRouteSegments(
  geometry: LineSegmentsGeometry,
  line: RouteRgbaGeometry,
  strip: boolean,
): number {
  const { positions, colors, alphas, segments } = routeInstanceBuffers(
    line,
    strip,
  );
  const positionBuffer = new InstancedInterleavedBuffer(positions, 6, 1);
  geometry.setAttribute(
    "instanceStart",
    new InterleavedBufferAttribute(positionBuffer, 3, 0),
  );
  geometry.setAttribute(
    "instanceEnd",
    new InterleavedBufferAttribute(positionBuffer, 3, 3),
  );
  const colorBuffer = new InstancedInterleavedBuffer(colors, 6, 1);
  geometry.setAttribute(
    "instanceColorStart",
    new InterleavedBufferAttribute(colorBuffer, 3, 0),
  );
  geometry.setAttribute(
    "instanceColorEnd",
    new InterleavedBufferAttribute(colorBuffer, 3, 3),
  );
  const alphaBuffer = new InstancedInterleavedBuffer(alphas, 2, 1);
  geometry.setAttribute(
    "instanceAlphaStart",
    new InterleavedBufferAttribute(alphaBuffer, 1, 0),
  );
  geometry.setAttribute(
    "instanceAlphaEnd",
    new InterleavedBufferAttribute(alphaBuffer, 1, 1),
  );
  geometry.instanceCount = segments;
  return segments;
}

const EMPTY_ROUTE_GEOMETRY: RouteRgbaGeometry = {
  positions: new Float32Array(6),
  colors: new Float32Array(8),
};

function createRouteLine(
  style: RouteLineStyle,
  renderOrder: number,
  shared?: LineSegmentsGeometry,
): LineSegments2 {
  const geometry = shared ?? new LineSegmentsGeometry();
  if (!shared) setRouteSegments(geometry, EMPTY_ROUTE_GEOMETRY, false);
  const line = new LineSegments2(geometry, createRouteLineMaterial(style));
  line.frustumCulled = false;
  line.renderOrder = renderOrder;
  line.visible = false;
  return line;
}

/**
 * Фактический след живёт в предвыделенных буферах: он растёт каждый кадр, а
 * пересобирать инстансную геометрию на четыре тысячи сегментов по кадру —
 * мусор и лишняя выгрузка. Меняется хвост, альфа переписывается только при
 * смене числа точек.
 */
interface RouteTrailBuffers {
  readonly geometry: LineSegmentsGeometry;
  readonly positions: Float32Array;
  readonly alphas: Float32Array;
  readonly positionBuffer: InstancedInterleavedBuffer;
  readonly alphaBuffer: InstancedInterleavedBuffer;
  readonly capacity: number;
  segments: number;
  points: number;
}

function createRouteTrailBuffers(capacity: number): RouteTrailBuffers {
  const geometry = new LineSegmentsGeometry();
  const positions = new Float32Array(capacity * 6);
  const colors = new Float32Array(capacity * 6);
  const alphas = new Float32Array(capacity * 2);
  for (let index = 0; index < capacity; index += 1) {
    colors.set(ROUTE_ACTUAL_COLOR, index * 6);
    colors.set(ROUTE_ACTUAL_COLOR, index * 6 + 3);
  }
  const positionBuffer = new InstancedInterleavedBuffer(positions, 6, 1);
  positionBuffer.setUsage(DynamicDrawUsage);
  const colorBuffer = new InstancedInterleavedBuffer(colors, 6, 1);
  const alphaBuffer = new InstancedInterleavedBuffer(alphas, 2, 1);
  alphaBuffer.setUsage(DynamicDrawUsage);
  geometry.setAttribute(
    "instanceStart",
    new InterleavedBufferAttribute(positionBuffer, 3, 0),
  );
  geometry.setAttribute(
    "instanceEnd",
    new InterleavedBufferAttribute(positionBuffer, 3, 3),
  );
  geometry.setAttribute(
    "instanceColorStart",
    new InterleavedBufferAttribute(colorBuffer, 3, 0),
  );
  geometry.setAttribute(
    "instanceColorEnd",
    new InterleavedBufferAttribute(colorBuffer, 3, 3),
  );
  geometry.setAttribute(
    "instanceAlphaStart",
    new InterleavedBufferAttribute(alphaBuffer, 1, 0),
  );
  geometry.setAttribute(
    "instanceAlphaEnd",
    new InterleavedBufferAttribute(alphaBuffer, 1, 1),
  );
  geometry.instanceCount = 0;
  return {
    geometry,
    positions,
    alphas,
    positionBuffer,
    alphaBuffer,
    capacity,
    segments: 0,
    points: 0,
  };
}

function updateRouteTrail(
  target: RouteTrailBuffers,
  committed: readonly RouteVector3[],
  live: RouteVector3,
  rewrite: boolean,
): number {
  const committedCount = Math.min(committed.length, target.capacity);
  if (committedCount === 0) {
    target.segments = 0;
    target.points = 0;
    target.geometry.instanceCount = 0;
    return 0;
  }
  const last = committed[committedCount - 1];
  const hasLive =
    committedCount < target.capacity &&
    Math.hypot(live[0] - last[0], live[1] - last[1], live[2] - last[2]) > 1e-4;
  const points = committedCount + (hasLive ? 1 : 0);
  const segments = Math.max(0, points - 1);
  const pointAt = (index: number) =>
    index < committedCount ? committed[index] : live;

  const from =
    rewrite || segments < target.segments
      ? 0
      : Math.max(0, target.segments - 1);
  for (let index = from; index < segments; index += 1) {
    target.positions.set(pointAt(index), index * 6);
    target.positions.set(pointAt(index + 1), index * 6 + 3);
  }
  target.positionBuffer.clearUpdateRanges();
  if (segments > from) {
    target.positionBuffer.addUpdateRange(from * 6, (segments - from) * 6);
    target.positionBuffer.needsUpdate = true;
  }

  if (rewrite || points !== target.points) {
    const span = Math.max(1, points - 1);
    for (let index = 0; index < segments; index += 1) {
      target.alphas[index * 2] = routeTrailAlpha(index / span);
      target.alphas[index * 2 + 1] = routeTrailAlpha((index + 1) / span);
    }
    target.alphaBuffer.clearUpdateRanges();
    if (segments > 0) {
      target.alphaBuffer.addUpdateRange(0, segments * 2);
      target.alphaBuffer.needsUpdate = true;
    }
    target.points = points;
  }
  target.segments = segments;
  target.geometry.instanceCount = segments;
  return segments;
}

function createRouteDiscMesh(
  renderOrder: number,
): Mesh<BufferGeometry, MeshBasicMaterial> {
  const mesh = new Mesh(
    new BufferGeometry(),
    new MeshBasicMaterial({
      color: 0x28cdbd,
      transparent: true,
      opacity: 0.58,
      depthWrite: false,
      toneMapped: false,
      side: DoubleSide,
    }),
  );
  mesh.frustumCulled = false;
  mesh.renderOrder = renderOrder;
  mesh.visible = false;
  return mesh;
}

function setRouteDiscGeometry(
  target: Mesh<BufferGeometry, MeshBasicMaterial>,
  geometryData: ReturnType<typeof routeAltitudeDiscGeometry>,
) {
  const geometry = target.geometry;
  geometry.setAttribute(
    "position",
    new BufferAttribute(geometryData.positions, 3),
  );
  geometry.setIndex(new BufferAttribute(geometryData.indices, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
}

interface RouteRenderBundle {
  /** Сквозные проходы: то же, что план и факт, но без depth-теста. */
  readonly planGhost: LineSegments2;
  readonly actualGhost: LineSegments2;
  /** Проекция задания на датум и частокол отвесов до него. */
  readonly groundTrack: LineSegments2;
  readonly dropLines: LineSegments2;
  /** Решётки времени: плановая и фактическая, одним шагом. */
  readonly planTicks: LineSegments2;
  readonly actualTicks: LineSegments2;
  readonly plan: LineSegments2;
  readonly actual: LineSegments2;
  /** Живой отвес машины и её тень на датуме. */
  readonly craftPlumb: LineSegments2;
  readonly gates: LineSegments2;
  readonly altitudeDiscs: Mesh<BufferGeometry, MeshBasicMaterial>;
  readonly craft: LineSegments2;
  readonly trail: RouteTrailBuffers;
  readonly objects: readonly (
    | Mesh<BufferGeometry, MeshBasicMaterial>
    | LineSegments2
  )[];
  readonly lineMaterials: readonly LineMaterial[];
  readonly materials: readonly (LineMaterial | MeshBasicMaterial)[];
  readonly geometries: readonly BufferGeometry[];
}

/**
 * ИЕРАРХИЯ ТОЛЩИН, а не «сделать всё пожирнее»: если жирное всё, не выделено
 * ничто. Факт — самая толстая нить, он и есть история; план тоньше; подложка
 * (наземный след, отвесы) тоньше всего; сквозные проходы — тусклые и узкие.
 */
function createRouteRenderBundle(): RouteRenderBundle {
  const planGeometry = new LineSegmentsGeometry();
  setRouteSegments(planGeometry, EMPTY_ROUTE_GEOMETRY, false);
  const trail = createRouteTrailBuffers(ROUTE_TRAIL_MAX_SAMPLES);
  const bundle = {
    planGhost: createRouteLine(
      {
        world: 0.1,
        minPixels: 1,
        maxPixels: 2,
        opacity: 0.34,
        through: true,
        dash: [3, 3],
        fade: ROUTE_FADE_UNDERLAY,
      },
      16,
      planGeometry,
    ),
    actualGhost: createRouteLine(
      {
        world: 0.14,
        minPixels: 1.2,
        maxPixels: 2.6,
        opacity: 0.3,
        through: true,
        fade: ROUTE_FADE_UNDERLAY,
      },
      17,
      trail.geometry,
    ),
    groundTrack: createRouteLine(
      {
        world: 0.07,
        minPixels: 1,
        maxPixels: 2.2,
        opacity: 0.8,
        fade: ROUTE_FADE_UNDERLAY,
      },
      18,
    ),
    dropLines: createRouteLine(
      {
        world: 0.05,
        minPixels: 1,
        maxPixels: 1.6,
        opacity: 0.75,
        fade: ROUTE_FADE_UNDERLAY,
      },
      19,
    ),
    planTicks: createRouteLine(
      { world: 0.09, minPixels: 1, maxPixels: 3, opacity: 0.9 },
      20,
    ),
    plan: createRouteLine(
      { world: 0.16, minPixels: 1.6, maxPixels: 4.5, opacity: 0.95 },
      21,
      planGeometry,
    ),
    actualTicks: createRouteLine(
      { world: 0.12, minPixels: 1.2, maxPixels: 4, opacity: 1 },
      22,
    ),
    actual: createRouteLine(
      { world: 0.24, minPixels: 2.4, maxPixels: 7, opacity: 1 },
      23,
      trail.geometry,
    ),
    gates: createRouteLine(
      {
        world: 0.1,
        minPixels: 1.2,
        maxPixels: 3,
        opacity: 0.7,
        fade: ROUTE_FADE_SOFT,
      },
      24,
    ),
    altitudeDiscs: createRouteDiscMesh(25),
    craftPlumb: createRouteLine(
      {
        world: 0.1,
        minPixels: 1.4,
        maxPixels: 3.5,
        opacity: 0.95,
        fade: ROUTE_FADE_SOFT,
      },
      26,
    ),
    craft: createRouteLine(
      {
        world: 0.12,
        minPixels: 1.6,
        maxPixels: 4,
        opacity: 0.75,
        fade: ROUTE_FADE_SOFT,
      },
      27,
    ),
  };
  const objects = [
    bundle.planGhost,
    bundle.actualGhost,
    bundle.groundTrack,
    bundle.dropLines,
    bundle.planTicks,
    bundle.plan,
    bundle.actualTicks,
    bundle.actual,
    bundle.gates,
    bundle.altitudeDiscs,
    bundle.craftPlumb,
    bundle.craft,
  ] as const;
  const materials = objects.map((object) => object.material);
  return {
    ...bundle,
    trail,
    objects,
    materials,
    lineMaterials: materials.filter(
      (material): material is LineMaterial => "resolution" in material,
    ),
    geometries: [...new Set(objects.map((object) => object.geometry))],
  };
}

/**
 * Выбор машины прицелом (правила и числа — vehicleAimSelection.ts). Здесь
 * только интеграция: углы от камеры, кандидаты из живых кадров, накопление
 * на перекрестье через CSS-переменную (без ре-рендеров), доклад наверх
 * при смене выбора.
 */
function VehicleAimSelector({
  frames,
  states,
  onSelectionChange,
  indicatorRef,
}: {
  readonly frames: readonly VehicleFrameRuntime[];
  readonly states: { readonly current: Map<string, FrameState> };
  readonly onSelectionChange?: (clusterId: string | null) => void;
  readonly indicatorRef?: { readonly current: HTMLElement | null };
}) {
  const selection = useRef(IDLE_AIM_SELECTION);
  const reported = useRef<string | null>(null);
  const aimDirection = useRef(new Vector3());
  const forced = useRef<string | null>(null);
  useEffect(() => {
    if (typeof window === "undefined" || process.env.NODE_ENV === "production") {
      return;
    }
    const scope = window as typeof window & {
      __mamVehicleSelect?: (clusterId: string | null) => boolean;
      __mamVehicleSelection?: () => string | null;
    };
    scope.__mamVehicleSelect = (clusterId: string | null) => {
      forced.current = clusterId;
      return true;
    };
    scope.__mamVehicleSelection = () => selection.current.selectedId;
    return () => {
      delete scope.__mamVehicleSelect;
      delete scope.__mamVehicleSelection;
    };
  }, []);
  useFrame(({ camera }, delta) => {
    camera.getWorldDirection(aimDirection.current);
    const candidates: AimCandidate[] = [];
    for (const frame of frames) {
      if (!frame.clusterId) {
        continue;
      }
      const state = states.current.get(frame.id);
      if (!state?.mass) {
        continue;
      }
      const dx = state.mass.centre[0] + state.body.position[0] - camera.position.x;
      const dy = state.mass.centre[1] + state.body.position[1] - camera.position.y;
      const dz = state.mass.centre[2] + state.body.position[2] - camera.position.z;
      const distance = Math.hypot(dx, dy, dz) || 1;
      const dot =
        (dx * aimDirection.current.x +
          dy * aimDirection.current.y +
          dz * aimDirection.current.z) /
        distance;
      candidates.push({
        id: frame.clusterId,
        angle: Math.acos(Math.max(-1, Math.min(1, dot))),
        // Полукорпус машины (~4 м) добавляется к базовому конусу: дальняя
        // остаётся выбираемой, ближняя не требует снайперства.
        captureAngle: AIM_BASE_CAPTURE_ANGLE + Math.atan(4 / distance),
        flying: Boolean(state.flight),
        piloted: Boolean(state.flight?.pilot),
      });
    }
    let next = advanceAimSelection(selection.current, candidates, delta);
    if (forced.current !== null) {
      next = { ...next, selectedId: forced.current };
      forced.current = null;
    }
    selection.current = next;
    indicatorRef?.current?.style.setProperty(
      "--aim-progress",
      aimDwellProgress(next).toFixed(3),
    );
    if (next.selectedId !== reported.current) {
      reported.current = next.selectedId;
      onSelectionChange?.(next.selectedId);
    }
  });
  return null;
}

function FlightRouteRibbons({
  frames,
  states,
  enabled,
  selectedClusterId,
}: {
  readonly frames: readonly VehicleFrameRuntime[];
  readonly states: { readonly current: Map<string, FrameState> };
  readonly enabled: boolean;
  /** Маршрут в небе рисуется только у выбранной машины: два плана — каша. */
  readonly selectedClusterId?: string | null;
}) {
  const routeVisuals = useMemo(
    () =>
      new Map(
        frames.map((frame) => [frame.id, createRouteRenderBundle()] as const),
      ),
    [frames],
  );
  const builtFor = useRef(new Map<string, string>());
  const trailActive = useRef(new Map<string, boolean>());
  const trailSamples = useRef(new Map<string, RouteVector3[]>());
  /** Секунда рейса на каждом коммите следа — из неё растёт решётка факта. */
  const trailTimes = useRef(new Map<string, number[]>());
  const trailClock = useRef(new Map<string, number>());
  const trailTicks = useRef(new Map<string, number>());
  /** Плоскость отсчёта, шаг и масштаб решётки — свойства задания. */
  const routeDatum = useRef(new Map<string, number>());
  const routeInterval = useRef(new Map<string, number>());
  const routeTickSize = useRef(new Map<string, number>());
  useEffect(
    () => () => {
      for (const visual of routeVisuals.values()) {
        for (const geometry of visual.geometries) geometry.dispose();
        for (const material of visual.materials) material.dispose();
      }
    },
    [routeVisuals],
  );

  useFrame(({ size }, delta) => {
    for (const frame of frames) {
      const state = states.current.get(frame.id);
      const visual = routeVisuals.get(frame.id);
      if (!visual) continue;
      for (const material of visual.lineMaterials) {
        material.resolution.set(size.width, size.height);
      }

      const flight = state?.flight;
      const plan = state?.activePlan;
      const underway = Boolean(
        state &&
          flight?.castOff &&
          flight.occupancy === "uncrewed" &&
          plan,
      );
      const visible =
        enabled &&
        underway &&
        (selectedClusterId === undefined ||
          frame.clusterId === selectedClusterId);
      for (const object of visual.objects) object.visible = visible;
      if (!underway || !state || !plan || !flight) {
        trailActive.current.set(frame.id, false);
        continue;
      }

      const visualKey = routeVisualKey(plan);
      if (builtFor.current.get(frame.id) !== visualKey) {
        builtFor.current.set(frame.id, visualKey);
        const sections = Math.max(
          480,
          Math.min(960, Math.ceil(plan.length / 0.9)),
        );
        // План и его сквозной проход делят одну геометрию: считать кривую
        // дважды незачем, а штрих ghost-а — свойство материала.
        setRouteSegments(
          visual.plan.geometry as LineSegmentsGeometry,
          routePlanLineGeometry(plan, sections),
          true,
        );
        visual.planGhost.computeLineDistances();

        const datum = routeGroundDatum(plan);
        routeDatum.current.set(frame.id, datum);
        setRouteSegments(
          visual.groundTrack.geometry as LineSegmentsGeometry,
          routeGroundTrackGeometry(plan, datum, sections),
          true,
        );
        setRouteSegments(
          visual.dropLines.geometry as LineSegmentsGeometry,
          routeDropLineGeometry(plan, datum),
          false,
        );

        const schedule = routePlannedSchedule(plan, sections);
        const interval = routeTickInterval(schedule.seconds);
        // Шаг и масштаб решётки — один на обе: их прикладывают друг к другу.
        const tickSize = routeTickScale(plan.length);
        routeInterval.current.set(frame.id, interval);
        routeTickSize.current.set(frame.id, tickSize);
        setRouteSegments(
          visual.planTicks.geometry as LineSegmentsGeometry,
          routePlannedTickGeometry(
            plan,
            interval,
            schedule,
            ROUTE_TICK_TIERS,
            tickSize,
          ),
          false,
        );

        const markers = routeSemanticMarkers(plan);
        setRouteSegments(
          visual.gates.geometry as LineSegmentsGeometry,
          routeGateGeometry(plan, markers),
          false,
        );
        setRouteDiscGeometry(
          visual.altitudeDiscs,
          routeAltitudeDiscGeometry(plan, markers),
        );
      }
      const datum = routeDatum.current.get(frame.id) ?? 0;
      const tickInterval = routeInterval.current.get(frame.id) ?? 1;
      const tickSize = routeTickSize.current.get(frame.id) ?? 1;

      const orientation = state.body.orientation;
      const massCentre = state.mass?.centre ?? [0, 0, 0];
      // Центр HUD — МИРОВОЙ центр масс тела: state.body.position — смещение
      // центра масс от авторского (readCarrierBody), восстанавливается
      // ПРОСТЫМ сложением, как во всех остальных потребителях state.body.
      // Здесь стояло rotate(orientation, massCentre) — вращение АБСОЛЮТНОЙ
      // мировой точки кватернионом машины. У машины с бертом вдали от начала
      // координат (город: |massCentre| ≈ 69 м) любое рыскание уводило диск и
      // янтарный след по рычагу той же длины — «HUD летает отдельно»; RAX в
      // (0,0) был иммунен, потому и «совпадал». Диск — отрисовка известного
      // о теле, а не вторая сущность (закон Igor, 07.08.2026).
      const centre: RouteVector3 = [
        massCentre[0] + state.body.position[0],
        massCentre[1] + state.body.position[1],
        massCentre[2] + state.body.position[2],
      ];
      let samples = trailSamples.current.get(frame.id);
      let times = trailTimes.current.get(frame.id);
      let rewriteTrail = false;
      if (!trailActive.current.get(frame.id) || !samples || !times) {
        trailActive.current.set(frame.id, true);
        samples = [[...centre] as RouteVector3];
        times = [0];
        trailSamples.current.set(frame.id, samples);
        trailTimes.current.set(frame.id, times);
        trailClock.current.set(frame.id, 0);
        trailTicks.current.set(frame.id, 0);
        rewriteTrail = true;
      }
      // Часы рейса, а не настенные: время копится тем же шагом, что и кадр,
      // и переживает паузу вкладки без разрыва решётки.
      const clock = (trailClock.current.get(frame.id) ?? 0) + delta;
      trailClock.current.set(frame.id, clock);
      // История + живой кончик: кончик каждый кадр на позе машины, новые
      // точки коммитятся часто — иначе след рисуется ступенями позади.
      const anchor = samples[samples.length - 1];
      if (
        Math.hypot(
          centre[0] - anchor[0],
          centre[1] - anchor[1],
          centre[2] - anchor[2],
        ) >= ROUTE_TRAIL_COMMIT_METRES
      ) {
        samples.push(centre);
        times.push(clock);
        if (samples.length > ROUTE_TRAIL_MAX_SAMPLES) {
          const excess = samples.length - ROUTE_TRAIL_MAX_SAMPLES;
          samples.splice(0, excess);
          times.splice(0, excess);
          rewriteTrail = true;
        }
      }
      const actualSegments = updateRouteTrail(
        visual.trail,
        samples,
        centre,
        rewriteTrail,
      );
      const actualVisible = visible && actualSegments >= 1;
      visual.actual.visible = actualVisible;
      visual.actualGhost.visible = actualVisible;

      // Решётка факта перестраивается только когда появилась новая засечка:
      // между ними ей нечего показывать, а геометрия инстансная.
      const ticks = Math.floor((times.at(-1) ?? 0) / tickInterval);
      if (rewriteTrail || ticks !== trailTicks.current.get(frame.id)) {
        trailTicks.current.set(frame.id, ticks);
        setRouteSegments(
          visual.actualTicks.geometry as LineSegmentsGeometry,
          routeTrailTickGeometry(
            samples,
            times,
            tickInterval,
            ROUTE_TICK_TIERS,
            tickSize,
          ),
          false,
        );
      }

      if (visible) {
        setRouteSegments(
          visual.craftPlumb.geometry as LineSegmentsGeometry,
          routeCraftPlumbGeometry(centre, datum),
          false,
        );
        const up = rotateByQuaternion(orientation, [0, 1, 0]);
        const heading = rotateByQuaternion(orientation, frame.nose);
        const tangentStep = Math.min(0.01, 2 / Math.max(1, plan.length));
        const tangentBefore = plan.point(
          Math.max(0, flight.progress - tangentStep),
        );
        const tangentAfter = plan.point(
          Math.min(1, flight.progress + tangentStep),
        );
        const routeDirection: RouteVector3 = [
          tangentAfter[0] - tangentBefore[0],
          tangentAfter[1] - tangentBefore[1],
          tangentAfter[2] - tangentBefore[2],
        ];
        const engines = frame.flight.limits.enginePoints.map((point, index) => {
          const local: RouteVector3 = [
            point[0] - massCentre[0],
            point[1] - massCentre[1],
            point[2] - massCentre[2],
          ];
          const offset = rotateByQuaternion(orientation, local);
          return {
            position: [
              centre[0] + offset[0],
              centre[1] + offset[1],
              centre[2] + offset[2],
            ] as RouteVector3,
            intensity: state.rotorMotorOutput[index] ?? 0,
          };
        });
        setRouteSegments(
          visual.craft.geometry as LineSegmentsGeometry,
          routeCraftContourGeometry({
            centre,
            heading,
            course: state.body.velocity,
            route: routeDirection,
            up,
            engines,
          }),
          false,
        );
      }
    }
  });

  return (
    <>
      {frames.map((frame) => (
        <group key={frame.id}>
          {routeVisuals.get(frame.id)?.objects.map((object, index) => (
            <primitive key={index} object={object} />
          ))}
        </group>
      ))}
    </>
  );
}


