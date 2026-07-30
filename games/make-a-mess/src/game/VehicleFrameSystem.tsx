"use client";

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
  rebaseBodyMassProperties,
  rotateVector as rotateByQuaternion,
  stepBody,
  type BodyState,
  type MassProperties,
} from "./clusterDynamics";
import {
  RESTING_POSE,
  departureLightGlow,
  engineValuesPortToStarboard,
  advanceDrivePhase,
  advanceVehicleRouteProgress,
  rejoinVehicleRouteProgress,
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
  shipLocalPoint,
  vehicleAttitude,
  vehicleGroundBrakingLiftFraction,
  vehicleMooringState,
  vehiclePiecePosition,
  vehicleProbeReach,
  vehicleProbeFriction,
  vehicleProbeReaction,
  vehicleRouteHeading,
  vehicleRotation,
  vehicleSpoolCommand,
  type VehicleRoutePlan,
  type VehiclePose,
  type ShipModel,
} from "./vehicleFrames";
import {
  airVehicleFlightEventState,
  airVehicles,
  type AirVehicleDefinition,
} from "./airVehicles";
import {
  SKY_TRAIN_DRIVER_SEAT,
  passengerSeatContextAction,
  passengerSeatIsIntact,
} from "./passengerSeats";
import { CompoundKinematicClusterBodies } from "./CompoundKinematicClusterBodies";
import {
  compoundCarrierOwnsMemberPose,
  PHYSICS_TIME_STEP,
  queueCompoundKinematicImpulse,
  type CompoundKinematicClusterRegistry,
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
  MotionTelemetryMetric,
  MotionTelemetryUpdate,
} from "./motionTelemetry";
import { motionTelemetryAvailable } from "./motionTelemetry";
import { runtimeDiagnosticsEnabled } from "./runtimeDiagnostics";
import {
  compileCommandActuators,
  deliveredCommandValue,
  executeCommandActuators,
  type CommandActuatorBinding,
} from "./vehicleActuation";
import {
  propulsionHealth,
  updatePropulsionFeedback,
} from "./vehiclePropulsionAutomation";
import {
  propulsionFlightClearance,
  supervisedFailureEnvelope,
} from "./vehicleFlightSupervisor";
import {
  safetyInterventionForMode,
  vehicleSafetyAdvisory,
  type VehicleObstacleSample,
  type VehicleSafetyAdvisory,
} from "./vehicleSafetyAutomation";
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
  VEHICLE_GROUND_CONTACT_CONFIRM_SECONDS,
  vehicleGroundLiftAutomationSettled,
  vehicleDisturbanceRecoveryFeasible,
  vehicleFailureDisposition,
  type VehicleFailureWatchdogState,
  type VehicleFailureEvent,
  type VehicleGroundLiftAutomationState,
  type VehicleLandingStabilityState,
  type VehicleRecoveryLifecycle,
} from "./vehicleFailure";

/** Кто отправляет рейс: пока единственный кадр, у которого есть расписание. */
const SCHEDULED_FRAME = "sky-train";
type ScheduledInteraction = "board" | "ride" | "seat" | "stand";

/** Тяжесть. Плотности в движке свои, но она одна для всех. */
const GRAVITY = 9.81;

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
/** Днище: те же щупы, только смотрят вниз. */
const DOWNWARD_PROBES = (
  supports: readonly (readonly [number, number, number])[],
): readonly { point: readonly [number, number, number]; normal: readonly [number, number, number] }[] =>
  supports.map((point) => ({ point, normal: [0, -1, 0] as const }));

/** Как глубоко продавливается опора, приняв полный вес. */
const SUPPORT_GIVE = 0.22;
const RECOVERY_LANDING_DESCENT_SPEED = -0.8;
const RECOVERY_LANDING_VERTICAL_RESPONSE = 0.8;
/** Extra query horizon used only to discover an obstacle moving at the hull. */
const CONTACT_RELATIVE_SPEED_MARGIN = 18;
const OBSTACLE_SENSOR_RANGE = 18;
const OBSTACLE_ESCAPE_CLEARANCE = 8;

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
      (point[0] - hub[0]) ** 2 + (point[1] - hub[1]) ** 2 + (point[2] - hub[2]) ** 2;
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
  const match = pieceId.match(
    /^(.*):oarlock:(-1|1):(\d+):pivot:piece$/,
  );
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
  /** Чей это винт: индекс мотора в паспорте машины, чью тягу он показывает. */
  readonly engineIndex: number;
  /** Oar and blade rotate together around the physical inboard oarlock. */
  readonly oarStroke: OarStrokeBinding | null;
}

interface VehicleFrameRuntime extends AirVehicleDefinition {
  /** Щупы обшивки: ими корабль чувствует целый мир, а не только пол. */
  readonly actuators: readonly CommandActuatorBinding[];
  readonly members: readonly FrameMember[];
  /** Conservative local bounds used while own debris clears the hull. */
  readonly localBounds: {
    readonly minimum: readonly [number, number, number];
    readonly maximum: readonly [number, number, number];
  };
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
  /** Когда последний раз уходили на второй круг: решение принимается один раз. */
  lastGoAround: number;
  /** Счётчик для диагностики реального рейса. */
  goArounds: number;
  watchdog: VehicleFailureWatchdogState;
  /** Route is paused while the physical carrier damps a recoverable upset. */
  disturbanceRecovery: {
    elapsedSeconds: number;
    stableSeconds: number;
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
  /** Recent contact/blast impulse may legitimately interrupt route tracking. */
  disturbanceImpulseSeconds: number;
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
  /** Number of load-bearing underside probes touching the world last step. */
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
    () => frames.flatMap((frame) =>
      (frame.flight.exhaust?.sources ?? []).map((source) => ({
        frame,
        profile: frame.flight.exhaust!,
        source,
      }))),
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
  const material = useMemo(() => new ShaderMaterial({
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
  }), []);
  const particles = useRef<ExhaustParticle[]>(Array.from(
    { length: total },
    () => ({
      age: Number.POSITIVE_INFINITY,
      life: 1,
      power: 0,
      position: new Vector3(),
      velocity: new Vector3(),
      seed: 0,
    }),
  ));
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
      const rate = authored.profile.idleRate +
        (authored.profile.fullRate - authored.profile.idleRate) *
          Math.pow(Math.min(1, power), 1.35);
      accumulators.current[sourceIndex] += rate * delta;
      while (accumulators.current[sourceIndex] >= 1) {
        accumulators.current[sourceIndex] -= 1;
        const localIndex = cursors.current[sourceIndex] % EXHAUST_PARTICLES_PER_SOURCE;
        cursors.current[sourceIndex] = localIndex + 1;
        const particle = particles.current[
          sourceIndex * EXHAUST_PARTICLES_PER_SOURCE + localIndex
        ];
        const serial = serials.current[sourceIndex]++;
        const seed = ((Math.sin(serial * 19.19 + sourceIndex * 7.31) * 43758.5) % 1 + 1) % 1;
        const seedB = ((Math.sin(serial * 43.17 + sourceIndex * 3.7) * 28641.3) % 1 + 1) % 1;
        const carrierRotation = vehicleRotation(state.pose, authored.frame.nose);
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
          state.body.velocity[0] + direction[0] * authored.profile.exitSpeed * (0.65 + power * 0.65) + (seed - 0.5) * authored.profile.spread,
          state.body.velocity[1] + 0.38 + seedB * 0.42,
          state.body.velocity[2] + direction[2] * authored.profile.exitSpeed * (0.65 + power * 0.65) + (seedB - 0.5) * authored.profile.spread,
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
      const size = (0.3 + particle.power * 0.38) +
        life * (1.35 + particle.power * 1.65);
      sourceValues.current[index * 3] = particle.position.x;
      sourceValues.current[index * 3 + 1] = particle.position.y;
      sourceValues.current[index * 3 + 2] = particle.position.z;
      lifeValues.current[index] = life;
      sizeValues.current[index] = size;
      powerValues.current[index] = particle.power;
      seedValues.current[index] = particle.seed;
    }
    for (const name of ["aSource", "aLife", "aSize", "aPower", "aSeed"] as const) {
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
    disturbanceImpulseSeconds: 0,
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
): FlightState {
  const zeroThrottle = Array.from({ length: engineCount }, () => 0);
  return {
    kind,
    occupancy,
    time: underwayTime,
    castOff: underwayTime > 0,
    progress: 0,
    throttle: zeroThrottle,
    driveThrottle: zeroThrottle,
    propulsionFeedback: Array.from({ length: engineCount }, () => 1),
    safetyAdvisory: null,
    lastGoAround: -1e9,
    goArounds: 0,
    watchdog: createVehicleFailureWatchdog(0),
    disturbanceRecovery: null,
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
    forward[0] / forwardLength * tangentX +
      forward[2] / forwardLength * tangentZ,
  );
  const attitude = vehicleAttitude(orientation, nose);
  return {
    ...attitude,
    headingError: Math.acos(headingDot),
    crossTrackError: Math.abs(offsetX * tangentZ - offsetZ * tangentX),
  };
}

function deliveredControlFraction(
  requested: readonly number[],
  delivered: readonly number[],
): number {
  const requestedTotal = requested.reduce((sum, value) => sum + Math.abs(value), 0);
  if (requestedTotal < 1e-6) {
    return 1;
  }
  const deliveredTotal = delivered.reduce((sum, value) => sum + Math.abs(value), 0);
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
  /** One-shot failure fact; presentation stays outside the physics system. */
  onVehicleFailure?: (event: VehicleFailureEvent) => void;
}) {
  const { rapier, world: rapierWorld } = useRapier();
  const { camera } = useThree();
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
  const handledDepartRequest = useRef(departRequestVersion);
  const handledArrivalRequest = useRef<string | null>(null);

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
      const member: FrameMember = {
        piece,
        baseQuaternion: new Quaternion().setFromEuler(new Euler(rx, ry, rz)),
        spinHub: engine ? hubs.get(engine) ?? null : null,
        engineIndex: engine
          ? engineIndexOf(
              hubs.get(engine),
              vehicle?.flight.limits.enginePoints ?? [],
            )
          : oar
            ? oarEngines.get(oar.key) ?? 0
            : 0,
        oarStroke:
          oar &&
          oarPivot &&
          vehicle?.flight.driveAnimation.kind === "oars"
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
        const minimum: [number, number, number] = [Infinity, Infinity, Infinity];
        const maximum: [number, number, number] = [-Infinity, -Infinity, -Infinity];
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

  // Щупы кадра статичны (frames зависят только от pieces), поэтому общий
  // массив «днище + обшивка» собирается один раз, а не заново на каждый
  // физический шаг.
  const frameProbes = useMemo(
    () =>
      new Map(
        frames.map((frame) => {
          const supportProbes = DOWNWARD_PROBES(frame.supports);
          return [
            frame.id,
            {
              list: [...supportProbes, ...frame.hullProbes],
              supportCount: supportProbes.length,
            },
          ] as const;
        }),
      ),
    [frames],
  );

  const states = useRef(new Map<string, FrameState>());
  const frameState = useCallback((id: string): FrameState => {
    const existing = states.current.get(id);
    if (existing) {
      return existing;
    }
    const engineCount = frames.find((frame) => frame.id === id)?.flight.limits
      .enginePoints.length ?? 0;
    const created = restingState(engineCount);
    states.current.set(id, created);
    return created;
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

  useEffect(() => () => {
    for (const sourceId of telemetryActiveSources.current) {
      onMotionTelemetryUpdate?.({ sourceId, snapshot: null });
    }
    telemetryActiveSources.current.clear();
  }, [onMotionTelemetryUpdate]);

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
        ![
          impulseX,
          impulseY,
          impulseZ,
          pointX,
          pointY,
          pointZ,
        ].every(Number.isFinite)
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
      if (id && values.length === 6 && values.map(Number).every(Number.isFinite)) {
        const numeric = values.map(Number) as [number, number, number, number, number, number];
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
  const supportRay = useRef<InstanceType<typeof rapier.Ray> | null>(null);
  const obstacleRay = useRef<InstanceType<typeof rapier.Ray> | null>(null);
  /** Тела корабля: чтобы луч опоры не принял его же куски за землю. */
  const shipBodies = useRef<Map<string, Set<number>>>(new Map());
  const debrisLocalPoint = useRef(new Vector3());
  const debrisCarrierRotation = useRef(new Quaternion());
  const handoffLookDirection = useRef(new Vector3());
  const interIslandPassengerStatus = useRef({ active: false, inside: false });

  useBeforePhysicsStep(() => {
    const step = PHYSICS_TIME_STEP;

    // Every scene currently exposes one scheduled carrier. Its departure
    // point is data; the controller does not care whether it is a terminal
    // board or a coil of mooring rope on a wooden jetty.
    const scheduledFrame = frames.find((frame) => frame.departure);
    const scheduled = scheduledFrame ? frameState(scheduledFrame.id) : null;
    if (scheduled && scheduledFrame) {
      const departure = scheduledFrame.departure;
      const isTerminal = scheduledFrame.id === SCHEDULED_FRAME;
      const registeredLaunchMembers =
        clusterRegistry.current.get(scheduledFrame.clusterId)?.attachedMemberIds;
      const launchMembers = new Set(
        (registeredLaunchMembers
          ? [...registeredLaunchMembers]
          : scheduledFrame.members.map((member) => member.piece.id)
        ).filter(
          (pieceId) =>
            !brokenPieces.current.has(pieceId) && !inactivePieces.has(pieceId),
        ),
      );
      const launchPropulsionHealth = driveUsesPropulsionFeedback(
        scheduledFrame.flight.driveAnimation,
      )
        ? propulsionHealth(
            scheduledFrame.actuators,
            launchMembers,
            scheduledFrame.flight.limits.enginePoints.length,
          )
        : null;
      const launchClearance = launchPropulsionHealth
        ? propulsionFlightClearance(launchPropulsionHealth)
        : null;
      const uncrewedLaunchAllowed = launchClearance?.uncrewedAllowed ?? true;
      const passengerLaunchAllowed = launchClearance?.passengerAllowed ?? true;
      const eye: readonly [number, number, number] = [
        camera.position.x,
        camera.position.y,
        camera.position.z,
      ];
      let post: ScheduledInteraction | null = null;
      const eyeInShip = shipLocalPoint(
        eye,
        scheduledFrame.origin,
        scheduled.pose,
        scheduledFrame.nose,
      );
      const seatIntact = isTerminal && passengerSeatIsIntact(
        SKY_TRAIN_DRIVER_SEAT,
        inactivePieces,
      );
      const seatDistance = Math.hypot(
        eyeInShip[0] - SKY_TRAIN_DRIVER_SEAT.interactionPoint[0],
        eyeInShip[1] - SKY_TRAIN_DRIVER_SEAT.interactionPoint[1],
        eyeInShip[2] - SKY_TRAIN_DRIVER_SEAT.interactionPoint[2],
      );
      const seatAction = isTerminal &&
          (passengerLaunchAllowed || occupiedSeatId === SKY_TRAIN_DRIVER_SEAT.id)
        ? passengerSeatContextAction({
            seat: SKY_TRAIN_DRIVER_SEAT,
            occupiedSeatId,
            carrierActive: scheduled.flight !== null,
            passengerInsideCarrier:
              scheduledFrame.passengerFlight?.contains(eyeInShip) ?? false,
            distance: seatDistance,
            keepApproach: approachedPost.current === "seat",
            intact: seatIntact,
          })
        : null;
      if (seatAction === "stand") {
        post = seatAction;
      } else if (scheduled.flight === null) {
        const boardDistance = departure
          ? Math.hypot(
              eye[0] - departure.point[0],
              eye[2] - departure.point[2],
            )
          : Number.POSITIVE_INFINITY;
        const passengerFlight = scheduledFrame.passengerFlight;
        const rideDistance = passengerFlight
          ? Math.hypot(
              eyeInShip[0] - passengerFlight.point[0],
              eyeInShip[1] - passengerFlight.point[1],
              eyeInShip[2] - passengerFlight.point[2],
            )
          : Number.POSITIVE_INFINITY;
        const keepRide = approachedPost.current === "ride";
        const keepBoard = approachedPost.current === "board";
        if (
          passengerFlight &&
          passengerLaunchAllowed &&
          passengerFlight.contains(eyeInShip) &&
          rideDistance <= (
            keepRide
              ? passengerFlight.releaseRadius
              : passengerFlight.approachRadius
          )
        ) {
          post = "ride";
        } else if (departure && uncrewedLaunchAllowed &&
          Math.abs(eye[1] - departure.point[1]) < departure.heightTolerance &&
          boardDistance <= (
            keepBoard ? departure.releaseRadius : departure.approachRadius
          )
        ) {
          post = "board";
        }
      } else if (isTerminal) {
        post = seatAction;
      }
      const candidate: EntryInteractionTarget | null = post === "ride"
        ? scheduledFrame.passengerFlight?.target ?? null
        : post === "board"
          ? departure?.target ?? null
          : post === "seat"
            ? { id: SKY_TRAIN_DRIVER_SEAT.id, kind: "seat" }
            : post === "stand"
              ? { id: SKY_TRAIN_DRIVER_SEAT.id, kind: "stand" }
              : null;
      if (post !== approachedPost.current) {
        approachedPost.current = post;
        onDepartureApproachChange(candidate);
      }
      if (handledDepartRequest.current !== departRequestVersion) {
        handledDepartRequest.current = departRequestVersion;
        if (post && entryInteractionMatches(departRequestTargetRef?.current, candidate)) {
          if ((post === "ride" || post === "board") && scheduled.flight === null) {
            const requestedAction =
              departRequestTargetRef?.current?.selectedActionId;
            scheduled.flight = createFlightState(
              post === "ride"
                ? requestedAction ??
                  scheduledFrame.passengerFlight?.flightKind ??
                  "tour"
                : departure?.flightKind ?? "circuit",
              post === "ride" ? "passenger" : "uncrewed",
              scheduledFrame.flight.limits.enginePoints.length,
            );
          } else if (post === "seat" && scheduled.flight !== null && seatIntact) {
            onOccupiedSeatChange(SKY_TRAIN_DRIVER_SEAT.id);
          } else if (post === "stand" && occupiedSeatId === SKY_TRAIN_DRIVER_SEAT.id) {
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
          (
            isInterIslandTransferKind(interIslandKind) ||
            isInterIslandArrivalKind(interIslandKind)
          ),
      );
      const interIslandInside = interIslandActive && Boolean(
        scheduledFrame.passengerFlight?.contains(eyeInShip),
      );
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
        );
      }
      if (flight) {
        flight.time += step;
        if (!flight.castOff && flight.time >= scheduledFrame.flight.spoolSeconds) {
          flight.castOff = true;
          // Empty service flights cannot smuggle a player out of the map.
          const player = bodies.current.get("player");
          if (
            flight.occupancy === "uncrewed" &&
            scheduledFrame.passengerFlight &&
            departure?.passengerDropPoint &&
            player &&
            scheduledFrame.passengerFlight.contains(eyeInShip)
          ) {
            player.setTranslation(
              {
                x: departure.passengerDropPoint[0],
                y: departure.passengerDropPoint[1],
                z: departure.passengerDropPoint[2],
              },
              true,
            );
            player.setLinvel({ x: 0, y: 0, z: 0 }, true);
          }
        }
        // Фаза видимого движителя идёт за фактически дошедшей командой ЕГО
        // мотора: винт вращается, а вёсельный борт ускоряет свои гребки.
        for (let engine = 0; engine < scheduled.spinAngles.length; engine += 1) {
          scheduled.spinAngles[engine] = advanceDrivePhase(
            scheduled.spinAngles[engine] ?? 0,
            scheduledFrame.flight.driveAnimation.phaseSpeed,
            (scheduledFrame.flight.driveAnimation.kind === "propeller"
              ? flight.driveThrottle[engine]
              : flight.throttle[engine]) ?? 0,
            step,
          );
        }
        // Рейс кончается не по таймеру, а когда корабль вернулся на место и
        // носовой узел вошёл в захват и успокоился: центр корпуса сам по себе
        // швартовкой не является.
        if (
          !scheduled.recovery &&
          isDockingComplete(
            flight.progress,
            mooring.offset,
            scheduled.body.orientation,
            mooring.velocity,
            scheduled.body.angularVelocity as [number, number, number],
            scheduledFrame.nose,
            scheduledFrame.flight.approach,
            scheduledFrame.flight.docking,
          )
        ) {
          if (isInterIslandArrivalKind(flight.kind)) {
            onInterIslandArrivalComplete?.(flight.kind);
          }
          scheduled.flight = null;
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
                  disturbanceRecovery: scheduled.flight.disturbanceRecovery,
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
          document.documentElement.dataset.mamVehicle = JSON.stringify(diagnostic);
          if (isTerminal) {
            document.documentElement.dataset.mamSkyTrain = JSON.stringify(diagnostic);
          }
        }
      }
    }

    // --- Тело корабля --------------------------------------------------
    // Контактный корпус кластера и его ещё не отделившиеся визуальные тела
    // принадлежат самому кораблю: щупы не должны принимать их за внешний мир.
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
    // Пока корабль не идёт по маршруту, его поза — не кривая, а следствие сил:
    // тяжесть в центре масс, подъём ВЫШЕ него в центре объёма оболочки, мягкая
    // швартовка и успокоение. Отсюда и маятник, и реакция на повреждения:
    // снесли хвостовой вагон — центр масс уехал вперёд, и нос задрался сам.
    for (const frame of frames) {
      const state = frameState(frame.id);
      state.disturbanceImpulseSeconds = Math.max(
        0,
        state.disturbanceImpulseSeconds - step,
      );
      const applyPendingImpulses = (properties: MassProperties) => {
        const pending = externalImpulses.current.get(frame.clusterId);
        if (!pending || pending.length === 0 || properties.mass <= 0) {
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
        for (const applied of pending) {
          worldBody = applyImpulseAtPoint(worldBody, properties, applied);
        }
        state.body = {
          ...worldBody,
          position: [
            worldBody.position[0] - properties.centre[0],
            worldBody.position[1] - properties.centre[1],
            worldBody.position[2] - properties.centre[2],
          ],
        };
        externalImpulses.current.delete(frame.clusterId);
        state.disturbanceImpulseSeconds = 2.5;
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
      if (state.brokenSeen !== frameBroken || !state.mass) {
        const previousMass = state.mass;
        state.brokenSeen = frameBroken;
        state.aliveMembers = frame.members.filter(
          (member) => !brokenPieces.current.has(member.piece.id),
        );
        state.envelopeLeft = state.aliveMembers.filter((member) =>
          member.piece.id.includes(frame.envelopeMatch)).length;
        const nextMass = massProperties(
          state.aliveMembers.map((member) => member.piece),
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
        if (!previousMass) {
          applyPendingImpulses(nextMass);
        }
        if (state.intactMass === 0 && state.mass.mass > 0) {
          state.intactMass = state.mass.mass;
          state.intactEnvelope = frame.members.filter((member) =>
            member.piece.id.includes(frame.envelopeMatch)).length;
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
        const tangentLength = Math.hypot(
          ahead[0] - start[0],
          ahead[2] - start[2],
        ) || 1;
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
      const liftCapacity =
        state.intactMass * GRAVITY * (envelopeLeft / state.intactEnvelope) * 1.12;
      const neutral = mass.mass * GRAVITY;
      const berth = mass.centre as [number, number, number];
      let centreNow: [number, number, number] = [
        mass.centre[0] + state.body.position[0],
        mass.centre[1] + state.body.position[1],
        mass.centre[2] + state.body.position[2],
      ];

      if (state.recovery) {
        const previousPhase = state.recovery.lifecycle.phase;
        if (previousPhase === "landing" && !state.recovery.groundContactLatched) {
          state.recovery.groundContactSeconds = state.supportContacts > 0
            ? state.recovery.groundContactSeconds + step
            : 0;
          state.recovery.groundContactLatched =
            state.recovery.groundContactSeconds >=
              VEHICLE_GROUND_CONTACT_CONFIRM_SECONDS;
        }
        if (previousPhase === "landing") {
          const attitude = vehicleAttitude(
            state.body.orientation,
            frame.nose,
          );
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
                movingLiftFloor: vehicleGroundBrakingLiftFraction(
                  frame.supports,
                  mass.centre,
                  frame.nose,
                  frame.supportFriction,
                ),
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
        const arrivalComplete = previousPhase === "arrival" &&
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
        const rebuildComplete = previousPhase === "rebuilding" &&
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
            const tangentLength = Math.hypot(
              ahead[0] - start[0],
              ahead[2] - start[2],
            ) || 1;
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
            state.liftNow = neutral;
            state.released.clear();
            state.separated.clear();
            state.spinAngles.fill(0);
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
      const controls: { force: [number, number, number]; point: [number, number, number] }[] = [];
      let liftCommand = 0;
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
          frame.flight.linearDamping * mass.mass * frame.flight.lateralDragRatio,
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
      const attachedMembers =
        clusterRegistry.current.get(frame.clusterId)?.attachedMemberIds ??
        new Set(alive.map((member) => member.piece.id));
      const propulsion = propulsionHealth(
        frame.actuators,
        attachedMembers,
        frame.flight.limits.enginePoints.length,
      );
      const flightClearance = propulsionFlightClearance(propulsion);
      const autopilotModel: ShipModel =
        driveUsesPropulsionFeedback(frame.flight.driveAnimation) && flight
          ? { ...shipModel, engineAvailability: flight.propulsionFeedback }
          : shipModel;
      const failureEnvelope = driveUsesPropulsionFeedback(
        frame.flight.driveAnimation,
      )
        ? supervisedFailureEnvelope(flightClearance)
        : undefined;
      const senseObstacleSafety = (
        plan: VehicleRoutePlan,
        progress: number,
      ): VehicleSafetyAdvisory | null => {
        const berthPoint = plan.point(1);
        const berthDistance = Math.hypot(
          centreNow[0] - berthPoint[0],
          centreNow[1] - berthPoint[1],
          centreNow[2] - berthPoint[2],
        );
        // A mast, platform or pier is expected geometry while casting off and
        // on final. Near-contact probes remain active there; only predictive
        // intervention is suppressed.
        if (
          progress >= plan.finalFrom ||
          ((progress < 0.06 || progress > 0.94) && berthDistance < 30)
        ) {
          return null;
        }

        const carrierBody = clusterRegistry.current.get(frame.clusterId)?.body;
        const ownBodyHandles = shipBodies.current.get(frame.clusterId);
        const rotationNow = vehicleRotation(state.pose, frame.nose);
        const samples: VehicleObstacleSample[] = [];
        let topPoint: readonly [number, number, number] | null = null;
        let bottomPoint: readonly [number, number, number] | null = null;

        for (const probe of frame.hullProbes) {
          const point = vehiclePiecePosition(
            frame.origin,
            probe.point as [number, number, number],
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
            probe.normal as [number, number, number],
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
          if (staticClosing <= 0.2) {
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
              linear.x + angular.y * obstacleLever[2] - angular.z * obstacleLever[1];
            obstacleVelocity[1] =
              linear.y + angular.z * obstacleLever[0] - angular.x * obstacleLever[2];
            obstacleVelocity[2] =
              linear.z + angular.x * obstacleLever[1] - angular.y * obstacleLever[0];
          }
          samples.push({
            distance: hit.timeOfImpact,
            relativeClosingSpeed:
              (pointVelocity[0] - obstacleVelocity[0]) * normal[0] +
              (pointVelocity[1] - obstacleVelocity[1]) * normal[1] +
              (pointVelocity[2] - obstacleVelocity[2]) * normal[2],
          });
        }

        if (samples.length === 0) {
          return null;
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
        const availability = autopilotModel.engineAvailability ??
          frame.flight.limits.enginePoints.map(() => 1);
        const availableDeceleration =
          frame.flight.limits.enginePower *
          availability.reduce((sum, fraction) => sum + fraction, 0) /
          Math.max(1, mass.mass);
        return vehicleSafetyAdvisory(
          samples,
          availableDeceleration,
          verticalClearance(topPoint, 1),
          verticalClearance(bottomPoint, -1),
        );
      };
      const flyRoutePlan = (
        plan: VehicleRoutePlan,
        progress: number,
        startRamp: number,
      ) => {
        const controlledPlan = driveUsesPropulsionFeedback(
          frame.flight.driveAnimation,
        )
          ? speedLimitedPlan(plan, flightClearance.speedFactor)
          : plan;
        const safetyAdvisory = senseObstacleSafety(controlledPlan, progress);
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
        const driveThrottle = piloted.controls.throttle;
        const actuation = executeCommandActuators(
          frame.actuators,
          attachedMembers,
          {
            ...Object.fromEntries(
              driveThrottle.map((value, index) => [
                `throttle:${index}`,
                value,
              ]),
            ),
            rudder: piloted.controls.rudder,
          },
        );
        const deliveredThrottle = driveThrottle.map((value, index) =>
          deliveredCommandValue(actuation, `throttle:${index}`, value));
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
        const executedControls = {
          ...piloted.controls,
          throttle: deliveredThrottle,
          rudder: deliveredCommandValue(
            actuation,
            "rudder",
            piloted.controls.rudder,
          ),
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

      const recovery = state.recovery;
      if (recovery && flight?.castOff) {
        const phase = recovery.lifecycle.phase;
        const plan = phase === "escape"
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
      } else if (flight && flight.castOff) {
        const plan = frame.flight.routePlan(flight.kind, berth);
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
        const routePoint = plan.point(flight.progress);
        const altitudeError = centreNow[1] - routePoint[1];
        const tiltInertia = Math.max(1, mass.inertia[0], mass.inertia[8]);
        const rightingLever = Math.max(
          0,
          (state.trimCentre ?? frame.liftCentre)[1] - mass.centre[1],
        );
        const rightingAcceleration =
          state.liftNow * rightingLever *
            Math.max(0.12, Math.sin(Math.min(Math.PI / 2, tilt))) /
            tiltInertia +
          frame.flight.angularDamping * mass.inertia[4] *
            tiltAngularSpeed / tiltInertia;
        const previousDelivery = propulsion.mode === "inoperative"
          ? 0
          : deliveredControlFraction(
              flight.driveThrottle,
              flight.throttle,
            );
        const activeFailureEnvelope = failureEnvelope ??
          DEFAULT_VEHICLE_FAILURE_ENVELOPE;
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
        const disturbanceObserved =
          state.disturbanceImpulseSeconds > 0 &&
          (
            tilt > 0.28 ||
            tiltAngularSpeed > 0.18 ||
            Math.abs(altitudeError) > 4 ||
            Math.abs(state.body.velocity[1]) > 2.2
          );
        if (
          !flight.disturbanceRecovery &&
          disturbanceObserved &&
          disturbanceFeasible
        ) {
          flight.disturbanceRecovery = {
            elapsedSeconds: 0,
            stableSeconds: 0,
          };
        }
        if (flight.disturbanceRecovery) {
          const elapsedSeconds =
            flight.disturbanceRecovery.elapsedSeconds + step;
          const stable =
            tilt < 0.14 &&
            tiltAngularSpeed < 0.065 &&
            Math.abs(altitudeError) < 2.5 &&
            Math.abs(state.body.velocity[1]) < 0.75;
          const stableSeconds = stable
            ? flight.disturbanceRecovery.stableSeconds + step
            : 0;
          flight.disturbanceRecovery = {
            elapsedSeconds,
            stableSeconds,
          };
          if (
            !disturbanceFeasible ||
            elapsedSeconds >= 30
          ) {
            flight.disturbanceRecovery = null;
          } else if (stableSeconds >= 1.2) {
            flight.progress = rejoinVehicleRouteProgress(
              plan,
              flight.progress,
              centreNow,
            );
            flight.watchdog = createVehicleFailureWatchdog(flight.progress);
            flight.disturbanceRecovery = null;
          }
        }
        const recoveringDisturbance = flight.disturbanceRecovery !== null;
        // Автопилоту передаём ПАСПОРТ машины — массу, момент инерции и
        // сопротивление, — чтобы он мог предсказать, где окажется, а не
        // догонять собственную ошибку.
        const piloted = flyRoutePlan(
          recoveringDisturbance ? speedLimitedPlan(plan, 0) : plan,
          flight.progress,
          Math.max(
            0,
            Math.min(1, (flight.time - frame.flight.underwaySeconds) / 8),
          ),
        );
        if (
          !recoveringDisturbance &&
          piloted.goAround &&
          flight.time - flight.lastGoAround > 20
        ) {
          flight.progress = 0;
          flight.lastGoAround = flight.time;
          flight.goArounds += 1;
        }
        // Ход по маршруту двигает сам корабль: сколько прошёл, на столько и
        // сдвинулась цель.
        if (
          !recoveringDisturbance &&
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
              const relativeVelocity = rotateByQuaternion(
                inverseOrientation,
                [
                  passengerVelocity.x - inheritedVelocity[0],
                  passengerVelocity.y - inheritedVelocity[1],
                  passengerVelocity.z - inheritedVelocity[2],
                ],
              );
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
                relativeVelocity: carrierVector(
                  relativeVelocity,
                  frame.nose,
                ),
                lookDirection: carrierVector(
                  localLookDirection,
                  frame.nose,
                ),
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
        const watchdogResult = advanceVehicleFailureWatchdog(
          flight.watchdog,
          {
            deltaSeconds: step,
            relativeAltitude: state.body.position[1],
            pitch: tracking.pitch,
            roll: tracking.roll,
            headingError: tracking.headingError,
            yawRateError:
              state.body.angularVelocity[1] - piloted.desiredYawRate,
            crossTrackError: tracking.crossTrackError,
            progress: flight.progress,
            requiredControlAvailable: propulsion.mode !== "inoperative",
            requestedControlEffort: requestedEffort,
            deliveredControlFraction: propulsion.mode === "inoperative"
              ? 0
              : deliveredControlFraction(
                  flight.driveThrottle,
                  flight.throttle,
                ),
            goArounds: flight.goArounds,
            turning:
              Math.abs(piloted.desiredYawRate) > 0.1 ||
              Math.abs(state.body.angularVelocity[1]) > 0.1,
            inFinalManeuver: flight.progress > 0.97 && berthDistance < 8,
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
          const availability = executeCommandActuators(
            frame.actuators,
            attachedMembers,
            Object.fromEntries(
              frame.actuators.map((actuator) => [actuator.commandChannel, 1]),
            ),
          ).map((execution) => execution.attachedFraction);
          const overServiceArea = recoveryServiceArea
            ? Math.hypot(
                centreNow[0] - recoveryServiceArea.center[0],
                centreNow[2] - recoveryServiceArea.center[1],
              ) <= recoveryServiceArea.radius
            : true;
          const disposition = vehicleFailureDisposition(
            {
              structureFlightworthy:
                mass.mass / Math.max(1, state.intactMass) >= 0.55 &&
                envelopeLeft / Math.max(1, state.intactEnvelope) >= 0.5,
              liftToWeight: liftCapacity / Math.max(1, neutral),
              requiredActuatorFractions: availability,
            },
            overServiceArea,
          );
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
            escapePlan: disposition === "escapeRoute"
              ? frame.flight.escapePlan(berth, {
                  start: state.body.position,
                  forward,
                })
              : null,
            arrivalInitialized: false,
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
        const attachedMembers =
          clusterRegistry.current.get(frame.clusterId)?.attachedMemberIds ??
          new Set(alive.map((member) => member.piece.id));
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
          deliveredCommandValue(actuation, `throttle:${index}`, value));
        if (driveUsesPropulsionFeedback(frame.flight.driveAnimation)) {
          flight.propulsionFeedback = updatePropulsionFeedback(
            flight.propulsionFeedback,
            actuation,
            frame.flight.limits.enginePoints.length,
          );
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
      const liftTarget = state.recovery?.groundContactLatched
        ? Math.min(
            commandedLiftTarget,
            neutral * state.recovery.groundLiftAutomation.targetFraction,
          )
        : commandedLiftTarget;
      if (state.liftNow === 0) {
        state.liftNow = liftTarget;
      }
      // Lift belongs to gas volume that is still attached to the carrier.
      // A torn-away cell cannot keep lifting a tiny surviving skeleton. Mass
      // loss elsewhere is different: the intact gas remains, so the lighter
      // craft genuinely rises while its valves work back toward trim.
      state.liftNow = Math.min(state.liftNow, liftCapacity);
      const liftRate = state.intactMass * GRAVITY * 0.25 * step;
      state.liftNow += Math.max(-liftRate, Math.min(liftRate, liftTarget - state.liftNow));
      const lift = state.liftNow;

      const liftCentre = state.trimCentre ?? frame.liftCentre;
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

      // Касание настоящего мира. Днище щупает землю под собой, обшивка —
      // всё, во что можно упереться бортом, носом или крышей. Точка
      // приложения — сам щуп: поэтому упершийся нос разворачивает корабль, а
      // принявшая вес опора его выравнивает. Одна и та же пружина с
      // демпфером, разные направления.
      const contacts: { force: [number, number, number]; point: [number, number, number] }[] = [];
      const loadedGroundContacts: {
        readonly normalReaction: number;
        readonly relativeVelocity: [number, number, number];
        readonly normal: readonly [number, number, number];
        readonly point: [number, number, number];
      }[] = [];
      const probeCount = frame.supports.length + frame.hullProbes.length;
      const supportStiffness = (mass.mass * GRAVITY) / SUPPORT_GIVE / frame.supports.length;
      // A landing support carries one share of the body. Using every dormant
      // side/roof probe in this divisor under-damped the vertical suspension
      // and let a landing carrier bounce back out of frictional contact.
      const supportProbeDamping = 2 * Math.sqrt(
        (supportStiffness * mass.mass) / frame.supports.length,
      );
      const hullProbeDamping = 2 * Math.sqrt(
        (supportStiffness * mass.mass) / probeCount,
      );
      const rotationNow = vehicleRotation(state.pose, frame.nose);
      const probeSet = frameProbes.get(frame.id);
      const carrierBody = clusterRegistry.current.get(frame.clusterId)?.body;
      const ownBodyHandles = shipBodies.current.get(frame.clusterId);
      let supportContacts = 0;
      for (const [probeIndex, probe] of (probeSet?.list ?? []).entries()) {
        const world = vehiclePiecePosition(
          frame.origin,
          probe.point as [number, number, number],
          state.pose,
          rotationNow,
        );
        // Нормаль поворачивается вместе с кораблём: накренившись, он и
        // касается миром накренившимся бортом.
        const normal = rotateByQuaternion(
          state.body.orientation,
          probe.normal as [number, number, number],
        );
        // Speed at this exact point: a yawing nose can close on a wall while
        // the centre of mass is almost stationary.
        const lever: [number, number, number] = [
          world[0] - centre[0],
          world[1] - centre[1],
          world[2] - centre[2],
        ];
        const spin = state.body.angularVelocity;
        const pointVelocity: [number, number, number] = [
          state.body.velocity[0] + spin[1] * lever[2] - spin[2] * lever[1],
          state.body.velocity[1] + spin[2] * lever[0] - spin[0] * lever[2],
          state.body.velocity[2] + spin[0] * lever[1] - spin[1] * lever[0],
        ];
        const pointClosing =
          pointVelocity[0] * normal[0] +
          pointVelocity[1] * normal[1] +
          pointVelocity[2] * normal[2];
        supportRay.current ??= new rapier.Ray(
          { x: 0, y: 0, z: 0 },
          { x: 0, y: -1, z: 0 },
        );
        // Start one suspension travel inside the hull. The resulting hit
        // distance can then be converted to a signed surface gap, so a probe
        // that has crossed the surface gets a stronger reaction instead of
        // becoming blind inside the collider.
        supportRay.current.origin.x = world[0] - normal[0] * SUPPORT_GIVE;
        supportRay.current.origin.y = world[1] - normal[1] * SUPPORT_GIVE;
        supportRay.current.origin.z = world[2] - normal[2] * SUPPORT_GIVE;
        supportRay.current.dir.x = normal[0];
        supportRay.current.dir.y = normal[1];
        supportRay.current.dir.z = normal[2];
        const hit = rapierWorld.castRay(
          supportRay.current,
          vehicleProbeReach(
            SUPPORT_GIVE * 2,
            pointClosing + CONTACT_RELATIVE_SPEED_MARGIN,
            step,
          ),
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
        const obstacleBody = hit.collider.parent();
        const obstacleVelocity: [number, number, number] = [0, 0, 0];
        if (obstacleBody) {
          const linear = obstacleBody.linvel();
          const angular = obstacleBody.angvel();
          const obstacleCentre = obstacleBody.worldCom();
          const hitPoint = [
            supportRay.current.origin.x + normal[0] * hit.timeOfImpact,
            supportRay.current.origin.y + normal[1] * hit.timeOfImpact,
            supportRay.current.origin.z + normal[2] * hit.timeOfImpact,
          ] as const;
          const obstacleLever = [
            hitPoint[0] - obstacleCentre.x,
            hitPoint[1] - obstacleCentre.y,
            hitPoint[2] - obstacleCentre.z,
          ] as const;
          obstacleVelocity[0] =
            linear.x + angular.y * obstacleLever[2] - angular.z * obstacleLever[1];
          obstacleVelocity[1] =
            linear.y + angular.z * obstacleLever[0] - angular.x * obstacleLever[2];
          obstacleVelocity[2] =
            linear.z + angular.x * obstacleLever[1] - angular.y * obstacleLever[0];
        }
        const closing =
          (pointVelocity[0] - obstacleVelocity[0]) * normal[0] +
          (pointVelocity[1] - obstacleVelocity[1]) * normal[1] +
          (pointVelocity[2] - obstacleVelocity[2]) * normal[2];
        const push = vehicleProbeReaction(
          supportStiffness,
          probeIndex < (probeSet?.supportCount ?? 0)
            ? supportProbeDamping
            : hullProbeDamping,
          SUPPORT_GIVE,
          hit.timeOfImpact - SUPPORT_GIVE,
          closing,
          step,
        );
        if (push <= 0) {
          continue;
        }
        // Any actual part of the carrier can become its support after a hard
        // landing. Downward-facing hull probes therefore keep a tipped craft
        // on the terrain instead of letting it roll through the world.
        if (normal[1] < -0.35) {
          supportContacts += 1;
          loadedGroundContacts.push({
            normalReaction: push,
            relativeVelocity: [
              pointVelocity[0] - obstacleVelocity[0],
              pointVelocity[1] - obstacleVelocity[1],
              pointVelocity[2] - obstacleVelocity[2],
            ],
            normal,
            point: [world[0], world[1], world[2]],
          });
        }
        contacts.push({
          force: [-normal[0] * push, -normal[1] * push, -normal[2] * push],
          point: [world[0], world[1], world[2]],
        });
      }
      const totalSupportReaction = loadedGroundContacts.reduce(
        (sum, contact) => sum + contact.normalReaction,
        0,
      );
      if (totalSupportReaction > 0) {
        const weighted = loadedGroundContacts.reduce(
          (sum, contact) => {
            const weight = contact.normalReaction / totalSupportReaction;
            return {
              point: sum.point.map(
                (value, index) => value + contact.point[index] * weight,
              ) as [number, number, number],
              velocity: sum.velocity.map(
                (value, index) =>
                  value + contact.relativeVelocity[index] * weight,
              ) as [number, number, number],
              normal: sum.normal.map(
                (value, index) => value + contact.normal[index] * weight,
              ) as [number, number, number],
            };
          },
          {
            point: [0, 0, 0] as [number, number, number],
            velocity: [0, 0, 0] as [number, number, number],
            normal: [0, 0, 0] as [number, number, number],
          },
        );
        const normalLength = Math.hypot(...weighted.normal) || 1;
        const normalSpeed = weighted.velocity.reduce(
          (sum, value, index) =>
            sum + value * weighted.normal[index] / normalLength,
          0,
        );
        const tangent = weighted.velocity.map(
          (value, index) =>
            value - weighted.normal[index] / normalLength * normalSpeed,
        ) as [number, number, number];
        const lever = weighted.point.map(
          (value, index) => value - centre[index],
        ) as [number, number, number];
        const frictionForce = vehicleProbeFriction(
          totalSupportReaction,
          weighted.velocity,
          weighted.normal,
          frame.supportFriction,
          pointEffectiveMass(mass, state.body.orientation, lever, tangent),
          step,
        );
        if (Math.hypot(...frictionForce) > 0) {
          contacts.push({
            force: frictionForce as [number, number, number],
            point: weighted.point,
          });
        }
      }
      state.supportContacts = supportContacts;
      const stepped = stepBody(
        { ...state.body, position: centre },
        mass,
        [
          { force: [0, -mass.mass * GRAVITY, 0], point: centre },
          {
            force: [0, lift, 0],
            point: [
              centre[0] + liftArm[0],
              centre[1] + liftArm[1],
              centre[2] + liftArm[2],
            ],
          },
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
          ...contacts,
          ...controls,
        ],
        {
          // Продольное и боковое сопротивление уже приложены силой выше.
          linear: 0,
          angular: frame.flight.angularDamping * mass.inertia[4],
          // Демпфирование ФИЗИЧЕСКОЕ, к нулю: разворот удерживает руль,
          // преодолевая его. Раньше демпфер тянул к той же желаемой скорости,
          // что и руль, — два канала на одну ошибку, и машину раскачивало.
        },
        Math.min(step, 1 / 45),
      );
      state.body = {
        ...stepped,
        position: [
          stepped.position[0] - mass.centre[0],
          stepped.position[1] - mass.centre[1],
          stepped.position[2] - mass.centre[2],
        ],
      };

      // Поворот идёт вокруг ЦЕНТРА МАСС, а кадр вращает вокруг своей точки —
      // переводим одно в другое.
      const arm: readonly [number, number, number] = [
        mass.centre[0] - frame.origin[0],
        mass.centre[1] - frame.origin[1],
        mass.centre[2] - frame.origin[2],
      ];
      const turnedArm = rotateByQuaternion(state.body.orientation, [
        arm[0],
        arm[1],
        arm[2],
      ]);
      state.pose = {
        position: [
          arm[0] - turnedArm[0] + state.body.position[0],
          arm[1] - turnedArm[1] + state.body.position[1],
          arm[2] - turnedArm[2] + state.body.position[2],
        ],
        yaw: 0,
        pitch: 0,
        roll: 0,
        rotation: state.body.orientation,
      };
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
          const heading = (
            Math.atan2(forward[0], -forward[2]) * 180 / Math.PI + 360
          ) % 360;
          const attitude = vehicleAttitude(
            state.body.orientation,
            frame.nose,
          );
          const telemetryBerth =
            (state.mass?.centre as [number, number, number] | undefined) ??
            frame.origin;
          const telemetryPlan = telemetryRecoveryPhase === "escape"
            ? state.recovery?.escapePlan ?? null
            : telemetryRecoveryPhase === "arrival"
              ? frame.flight.arrivalPlan(telemetryBerth)
              : telemetryRecoveryPhase
                ? null
                : frame.flight.routePlan(telemetryFlight.kind, telemetryBerth);
          const telemetryProgress = telemetryRecoveryPhase === "escape" ||
              telemetryRecoveryPhase === "arrival"
            ? state.recovery?.progress ?? 0
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
              value: attitude.pitch * 180 / Math.PI,
              unit: "deg",
              precision: 1,
              signed: true,
              activityDelta: 0.45,
            },
            {
              id: "roll",
              value: attitude.roll * 180 / Math.PI,
              unit: "deg",
              precision: 1,
              signed: true,
              activityDelta: 0.45,
            },
            {
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
              ).map((value) =>
                value < 1 - 1e-6 ? "warning" as const : "normal" as const),
              unit: "percent",
              precision: 0,
              signed: true,
              activityDelta: 4,
            },
          ];
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
              phase: airVehicleFlightEventState(
                frame,
                telemetryFlight,
                state.recovery?.lifecycle ?? null,
              ),
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

      state.velocity = state.suppressFrameVelocityOnce
        ? state.body.velocity
        : [
            (pose.position[0] - state.previousPose.position[0]) / step,
            (pose.position[1] - state.previousPose.position[1]) / step,
            (pose.position[2] - state.previousPose.position[2]) / step,
          ];
      state.suppressFrameVelocityOnce = false;
      state.previousPose = pose;

      const rotation = vehicleRotation(pose, frame.nose);
      const clusterBody = clusterRegistry.current.get(frame.clusterId)?.body;
      if (clusterBody) {
        clusterBody.setNextKinematicTranslation({
          x: frame.origin[0] + pose.position[0],
          y: frame.origin[1] + pose.position[1],
          z: frame.origin[2] + pose.position[2],
        });
        clusterBody.setNextKinematicRotation({
          x: rotation[0],
          y: rotation[1],
          z: rotation[2],
          w: rotation[3],
        });
      }
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
              const worldLever = rotateByQuaternion(
                state.body.orientation,
                [
                  piece.position[0] - massCentre[0],
                  piece.position[1] - massCentre[1],
                  piece.position[2] - massCentre[2],
                ],
              );
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
            { x: piece.position[0], y: piece.position[1], z: piece.position[2] },
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
        const spinAngle = state.spinAngles[member.engineIndex] ?? 0;
        if (member.spinHub && spinAngle !== 0) {
          const hub = member.spinHub;
          const angle = spinAngle;
          const tailwardLength = Math.hypot(frame.nose[0], frame.nose[2]) || 1;
          const shaft = oarTailwardAxis.current.set(
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
          const tailwardLength =
            Math.hypot(frame.nose[0], frame.nose[2]) || 1;
          const tailward = oarTailwardAxis.current.set(
            -frame.nose[0] / tailwardLength,
            0,
            -frame.nose[2] / tailwardLength,
          );
          const sweep = oarSweepQuaternion.current.setFromAxisAngle(
            WORLD_UP_AXIS,
            stroke.side * sample.sweep *
              frame.flight.driveAnimation.sweepAngle * blend,
          );
          const lift = oarLiftQuaternion.current.setFromAxisAngle(
            tailward,
            -stroke.side * sample.lift *
              frame.flight.driveAnimation.liftAngle * blend,
          );
          const strokeRotation = oarStrokeQuaternion.current
            .copy(sweep)
            .multiply(lift);
          const fromPivot = oarPivotOffset.current.set(
            piece.position[0] - stroke.pivot[0],
            piece.position[1] - stroke.pivot[1],
            piece.position[2] - stroke.pivot[2],
          ).applyQuaternion(strokeRotation);
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
                  frame.flight.driveAnimation.featherAngle * blend,
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
  });

  return (
    <>
      <CompoundKinematicClusterBodies
        definitions={frames}
        pieces={pieces}
        brokenPieces={inactivePieces}
        registry={clusterRegistry}
      />
      <VehicleExhaustSmoke
        frames={frames}
        states={states}
        inactivePieces={inactivePieces}
      />
    </>
  );
}
