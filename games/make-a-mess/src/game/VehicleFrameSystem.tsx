"use client";

import { useThree } from "@react-three/fiber";
import {
  useBeforePhysicsStep,
  useRapier,
  type RapierRigidBody,
} from "@react-three/rapier";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { Euler, Quaternion } from "three";
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
  massProperties,
  rotateVector as rotateByQuaternion,
  stepBody,
  type BodyState,
  type MassProperties,
} from "./clusterDynamics";
import {
  DEPARTURE_APPROACH_RADIUS,
  DEPARTURE_RELEASE_RADIUS,
  RESTING_POSE,
  RIDE_APPROACH_RADIUS,
  RIDE_RELEASE_RADIUS,
  SKY_TRAIN_CASTOFF_TIME,
  departureLightGlow,
  SKY_TRAIN_DEPARTURE_BOARD,
  SKY_TRAIN_LIMITS,
  SKY_TRAIN_PLATFORM_DROP,
  SKY_TRAIN_RIDE_POST,
  SKY_TRAIN_UNDERWAY_TIME,
  advanceRouteProgress,
  autopilot,
  flightPlan,
  shipForces,
  skyTrainFlightEventState,
  isInsideCabin,
  isDockingComplete,
  hullDrag,
  isRestingPose,
  mooringForce,
  multiplyQuaternions,
  vehicleFrames,
  vehiclePiecePosition,
  vehicleRotation,
  type HullProbe,
  type SkyTrainFlightKind,
  type VehiclePose,
} from "./vehicleFrames";
import { CompoundKinematicClusterBodies } from "./CompoundKinematicClusterBodies";
import {
  compoundCarrierOwnsMemberPose,
  PHYSICS_TIME_STEP,
  type CompoundKinematicClusterRegistry,
} from "./compoundKinematicCluster";
import {
  entryInteractionMatches,
  type EntryInteractionTarget,
} from "./entryInteraction";

/** Кто отправляет рейс: пока единственный кадр, у которого есть расписание. */
const SCHEDULED_FRAME = "sky-train";

/** Обороты винта на полном ходу, рад/с. Вдвое быстрее «честного» шага: диск
 * винта на такой скорости читается как размытый круг, а не как палки. */
const PROPELLER_SPEED = 18.4;

/** Тяжесть. Плотности в движке свои, но она одна для всех. */
const GRAVITY = 9.81;

/**
 * Успокоение свободно висящего корабля. Гасит качку и снос, но не «в ноль»
 * мгновенно: маятник должен быть виден.
 */
// Сопротивление среды подобрано по машине: при полной тяге установившаяся
// скорость выходит около 14 м/с, то есть чуть выше маршрутной. Раньше здесь
// стояло вчетверо больше, и корабль просто не мог разогнаться до задания.
const HOVER_DAMPING = { linear: 0.22, angular: 0.55 };
/** Во сколько раз корпус хуже идёт боком, чем носом. */
const LATERAL_DRAG_RATIO = 7;
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

const densityOf = (material: BreakablePieceDefinition["material"]): number =>
  structuralMaterialProfiles[material].density;

/**
 * Чей это винт. Считаем по ближайшей точке приложения тяги из паспорта: ось
 * винта и есть мотор, и сопоставление не сломается, если гондолу подвинут
 * или переименуют.
 */
function engineIndexOf(hub: readonly [number, number, number] | undefined): number {
  if (!hub) {
    return 0;
  }
  let best = 0;
  let bestDistance = Infinity;
  SKY_TRAIN_LIMITS.enginePoints.forEach((point, index) => {
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

interface FrameMember {
  readonly piece: BreakablePieceDefinition;
  /** Собственный покой куска: поворот кадра накладывается ПОВЕРХ него. */
  readonly baseQuaternion: Quaternion;
  /** Ось винта, вокруг которой этот кусок вращается сверх позы кадра. */
  readonly spinHub: readonly [number, number, number] | null;
  /** Чей это винт: индекс мотора в паспорте машины, чью тягу он показывает. */
  readonly engineIndex: number;
}

interface VehicleFrameRuntime {
  readonly id: string;
  readonly clusterId: string;
  readonly independentMemberMatches?: readonly string[];
  readonly origin: readonly [number, number, number];
  readonly nose: readonly [number, number, number];
  readonly liftCentre: readonly [number, number, number];
  readonly envelopeMatch: string;
  readonly supports: readonly (readonly [number, number, number])[];
  /** Щупы обшивки: ими корабль чувствует целый мир, а не только пол. */
  readonly hullProbes: readonly HullProbe[];
  readonly members: readonly FrameMember[];
}

/** Поза подвижного кадра для внешних систем вроде общего пула света. */
export interface VehicleFramePoseState {
  readonly clusterId: string;
  readonly origin: readonly [number, number, number];
  readonly nose: readonly [number, number, number];
  readonly pose: VehiclePose;
}

/** Ход рейса: null — стоим у причала. */
interface FlightState {
  kind: SkyTrainFlightKind;
  time: number;
  castOff: boolean;
  /** Доля пройденного маршрута: её двигает сам корабль, а не таймер. */
  progress: number;
  /** Команда тяги каждому мотору, −1..1 — по ней же крутится его винт. */
  throttle: readonly number[];
  /** Когда последний раз уходили на второй круг: решение принимается один раз. */
  lastGoAround: number;
  /** Счётчик для диагностики реального рейса. */
  goArounds: number;
}

/** Всё изменяемое живёт в ref — как состояние створок в системе дверей. */
interface FrameState {
  pose: VehiclePose;
  previousPose: VehiclePose;
  /** Скорость кадра, м/с: её наследуют куски, отломанные в движении. */
  velocity: readonly [number, number, number];
  moving: boolean;
  released: Set<string>;
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
}

function restingState(): FrameState {
  return {
    pose: RESTING_POSE,
    previousPose: RESTING_POSE,
    velocity: [0, 0, 0],
    moving: false,
    released: new Set<string>(),
    liftNow: 0,
    spinAngles: [0, 0],
    flight: null,
    supportContacts: 0,
    body: RESTING_BODY,
    mass: null,
    intactMass: 0,
    intactEnvelope: 0,
    trimCentre: null,
    brokenSeen: -1,
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
  onDepartureApproachChange = () => {},
  movingVehicles,
  dockedVehicles,
  clusterEventStates,
  clusterRegistry,
  onFramePose,
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
  onDepartureApproachChange?: (approached: "board" | "ride" | null) => void;
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
  /** Публикует физическую позу без переноса логики кадра наружу. */
  onFramePose?: (state: VehicleFramePoseState) => void;
}) {
  const { rapier, world: rapierWorld } = useRapier();
  const { camera } = useThree();
  const approachedPost = useRef<"board" | "ride" | null>(null);
  /** Яркость перронных огней в прошлом кадре: переключаем только по смене. */
  const departureGlow = useRef<number | null>(null);
  const debugTelemetryAt = useRef(0);
  const handledDepartRequest = useRef(departRequestVersion);

  const frames = useMemo<readonly VehicleFrameRuntime[]>(() => {
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

    const byCluster = new Map<string, FrameMember[]>();
    for (const piece of pieces) {
      const [rx, ry, rz] = piece.rotation ?? [0, 0, 0];
      const engine = bladePropeller(piece.id);
      const member: FrameMember = {
        piece,
        baseQuaternion: new Quaternion().setFromEuler(new Euler(rx, ry, rz)),
        spinHub: engine ? hubs.get(engine) ?? null : null,
        engineIndex: engine ? engineIndexOf(hubs.get(engine)) : 0,
      };
      const members = byCluster.get(piece.clusterId);
      if (members) {
        members.push(member);
      } else {
        byCluster.set(piece.clusterId, [member]);
      }
    }
    return vehicleFrames
      .filter((frame) => byCluster.has(frame.clusterId))
      .map((frame) => ({
        id: frame.id,
        clusterId: frame.clusterId,
        independentMemberMatches: frame.independentMemberMatches,
        origin: frame.origin,
        nose: frame.nose,
        liftCentre: frame.liftCentre,
        envelopeMatch: frame.envelopeMatch,
        supports: frame.supports,
        hullProbes: frame.hullProbes,
        members: byCluster.get(frame.clusterId) ?? [],
      }));
  }, [pieces]);

  const states = useRef(new Map<string, FrameState>());
  const frameState = useCallback((id: string): FrameState => {
    const existing = states.current.get(id);
    if (existing) {
      return existing;
    }
    const created = restingState();
    states.current.set(id, created);
    return created;
  }, []);

  useEffect(() => {
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
      const eventState = skyTrainFlightEventState(state.flight);
      if (eventState === "docked") {
        dockedVehicles?.current.add(frame.clusterId);
        clusterEventStates?.current.set(frame.clusterId, eventState);
      } else {
        movingVehicles?.current.add(frame.clusterId);
        clusterEventStates?.current.set(frame.clusterId, eventState);
      }
    }
  }, [clusterEventStates, dockedVehicles, frameState, frames, movingVehicles, resetVersion]);

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
    return () => {
      delete scope.__mamVehiclePose;
      delete scope.__mamShipPose;
      delete document.documentElement.dataset.mamSkyTrain;
    };
  }, [frameState, frames]);

  const composedQuaternion = useRef(new Quaternion());
  const supportRay = useRef<InstanceType<typeof rapier.Ray> | null>(null);
  /** Тела корабля: чтобы луч опоры не принял его же куски за землю. */
  const shipBodies = useRef<Set<number>>(new Set());

  useBeforePhysicsStep(() => {
    const step = PHYSICS_TIME_STEP;

    // Два места посадки, один пробел. У ТАБЛО отправляют пустой круг — его
    // и вызывают с земли, чтобы точно не остаться на борту. У НОСА ГОЛОВНОГО
    // ВАГОНА, изнутри салона, берут обзорный облёт и летят вместе с кораблём.
    const scheduled = frames.some((frame) => frame.id === SCHEDULED_FRAME)
      ? frameState(SCHEDULED_FRAME)
      : null;
    const scheduledFrame = frames.find((frame) => frame.id === SCHEDULED_FRAME);
    if (scheduled && scheduledFrame) {
      const eye: readonly [number, number, number] = [
        camera.position.x,
        camera.position.y,
        camera.position.z,
      ];
      let post: "board" | "ride" | null = null;
      if (scheduled.flight === null) {
        const boardDistance = Math.hypot(
          eye[0] - SKY_TRAIN_DEPARTURE_BOARD[0],
          eye[2] - SKY_TRAIN_DEPARTURE_BOARD[2],
        );
        const rideDistance = Math.hypot(
          eye[0] - SKY_TRAIN_RIDE_POST[0],
          eye[1] - SKY_TRAIN_RIDE_POST[1],
          eye[2] - SKY_TRAIN_RIDE_POST[2],
        );
        const keepRide = approachedPost.current === "ride";
        const keepBoard = approachedPost.current === "board";
        if (
          isInsideCabin(eye) &&
          rideDistance <= (keepRide ? RIDE_RELEASE_RADIUS : RIDE_APPROACH_RADIUS)
        ) {
          post = "ride";
        } else if (
          Math.abs(eye[1] - SKY_TRAIN_DEPARTURE_BOARD[1]) < 3 &&
          boardDistance <= (keepBoard ? DEPARTURE_RELEASE_RADIUS : DEPARTURE_APPROACH_RADIUS)
        ) {
          post = "board";
        }
      }
      if (post !== approachedPost.current) {
        approachedPost.current = post;
        onDepartureApproachChange(post);
      }
      if (handledDepartRequest.current !== departRequestVersion) {
        handledDepartRequest.current = departRequestVersion;
        const candidate: EntryInteractionTarget | null = post
          ? post === "ride"
            ? { id: "terminal:sky-train:ride", kind: "ride" }
            : { id: "terminal:sky-train:departure", kind: "departure" }
          : null;
        if (
          post &&
          scheduled.flight === null &&
          entryInteractionMatches(departRequestTargetRef?.current, candidate)
        ) {
          scheduled.flight = {
            kind: post === "ride" ? "tour" : "circuit",
            time: 0,
            castOff: false,
            progress: 0,
            throttle: [0, 0],
            lastGoAround: -1e9,
            goArounds: 0,
          };
          approachedPost.current = null;
          onDepartureApproachChange(null);
        }
      }

      const flight = scheduled.flight;
      if (flight) {
        flight.time += step;
        if (!flight.castOff && flight.time >= SKY_TRAIN_CASTOFF_TIME) {
          flight.castOff = true;
          // С пустого рейса проводник ссаживает; на облёт — везёт.
          const player = bodies.current.get("player");
          if (flight.kind === "circuit" && player && isInsideCabin(eye)) {
            player.setTranslation(
              {
                x: SKY_TRAIN_PLATFORM_DROP[0],
                y: SKY_TRAIN_PLATFORM_DROP[1],
                z: SKY_TRAIN_PLATFORM_DROP[2],
              },
              true,
            );
            player.setLinvel({ x: 0, y: 0, z: 0 }, true);
          }
        }
        // Обороты каждого винта идут за командой ЕГО мотора.
        for (let engine = 0; engine < scheduled.spinAngles.length; engine += 1) {
          scheduled.spinAngles[engine] +=
            PROPELLER_SPEED * (flight.throttle[engine] ?? 0) * step;
        }
        // Рейс кончается не по таймеру, а когда корабль вернулся на место и
        // успокоился: физика могла пройти круг быстрее или медленнее.
        if (
          isDockingComplete(
            flight.progress,
            scheduled.body.position as [number, number, number],
            scheduled.body.orientation,
            scheduled.body.velocity as [number, number, number],
            scheduled.body.angularVelocity as [number, number, number],
            scheduledFrame.nose,
          )
        ) {
          scheduled.flight = null;
        }
      }

      // Перронные огни. Материал стекла общий на цвет, поэтому яркость
      // задаётся одним вызовом на всю линейку — и только когда она реально
      // меняется: мигание это редкие переключения, а не работа каждый кадр.
      const scheduledEventState = skyTrainFlightEventState(scheduled.flight);
      const glow = departureLightGlow(
        scheduledEventState,
        scheduled.flight?.time ?? 0,
      );
      if (glow !== departureGlow.current) {
        departureGlow.current = glow;
        setSignalGlassGlow(departureSignalColor, glow);
      }
      if (process.env.NODE_ENV !== "production") {
        const now = performance.now();
        if (now >= debugTelemetryAt.current) {
          debugTelemetryAt.current = now + 250;
          document.documentElement.dataset.mamSkyTrain = JSON.stringify({
            flight: scheduled.flight
              ? {
                  kind: scheduled.flight.kind,
                  time: scheduled.flight.time,
                  progress: scheduled.flight.progress,
                  goArounds: scheduled.flight.goArounds,
                  throttle: scheduled.flight.throttle,
                }
              : null,
            position: scheduled.body.position,
            velocity: scheduled.body.velocity,
            angularVelocity: scheduled.body.angularVelocity,
            orientation: scheduled.body.orientation,
          });
        }
      }
    }

    // --- Тело корабля --------------------------------------------------
    // Контактный корпус кластера и его ещё не отделившиеся визуальные тела
    // принадлежат самому кораблю: щупы не должны принимать их за внешний мир.
    shipBodies.current.clear();
    for (const runtime of clusterRegistry.current.values()) {
      shipBodies.current.add(runtime.body.handle);
    }
    for (const frame of frames) {
      for (const member of frame.members) {
        if (brokenPieces.current.has(member.piece.id)) {
          continue;
        }
        const body = bodies.current.get(member.piece.id);
        if (body) {
          shipBodies.current.add(body.handle);
        }
      }
    }
    // Пока корабль не идёт по маршруту, его поза — не кривая, а следствие сил:
    // тяжесть в центре масс, подъём ВЫШЕ него в центре объёма оболочки, мягкая
    // швартовка и успокоение. Отсюда и маятник, и реакция на повреждения:
    // снесли хвостовой вагон — центр масс уехал вперёд, и нос задрался сам.
    for (const frame of frames) {
      const state = frameState(frame.id);
      const alive = frame.members.filter(
        (member) => !brokenPieces.current.has(member.piece.id),
      );
      if (state.brokenSeen !== brokenPieces.current.size || !state.mass) {
        state.brokenSeen = brokenPieces.current.size;
        state.mass = massProperties(alive.map((member) => member.piece), densityOf);
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
      const mass = state.mass;
      if (!mass || mass.mass <= 0 || state.intactEnvelope === 0) {
        continue;
      }
      // Оболочка задаёт ПОТОЛОК подъёма: порвали полотно — больше столько и
      // не поднимешь. А внутри этого потолка автоматика тянет подъём к весу
      // уцелевшего, и тянет медленно.
      const envelopeLeft = alive.filter((member) =>
        member.piece.id.includes(frame.envelopeMatch)).length;
      const liftCapacity =
        state.intactMass * GRAVITY * (envelopeLeft / state.intactEnvelope) * 1.12;
      const neutral = mass.mass * GRAVITY;

      // --- Рейс: только маршрут и путевая скорость ------------------------
      // Ни дифферента, ни крена, ни клевка здесь не задаётся. Регулятор
      // просит идти в точку с такой-то скоростью, моторы и руль дают силы, а
      // положение корабля в пространстве — их следствие.
      const controls: { force: [number, number, number]; point: [number, number, number] }[] = [];
      let liftCommand = 0;
      const shipModel = {
        mass: mass.mass,
        inertiaYaw: mass.inertia[4],
        bodyCentre: mass.centre as [number, number, number],
        dragLinear: HOVER_DAMPING.linear * mass.mass,
        dragLateral: HOVER_DAMPING.linear * mass.mass * LATERAL_DRAG_RATIO,
        dragAngular: HOVER_DAMPING.angular * mass.inertia[4],
        limits: SKY_TRAIN_LIMITS,
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
      if (flight && flight.castOff) {
        // The route guides the body's centre of mass. Its zero must therefore
        // be the centre's authored resting position, not the lift-heart axis.
        // Using frame.origin.y held this craft about 1.9 m above the platform;
        // the old early-arrival event merely hid that by switching controllers.
        const berth = mass.centre as [number, number, number];
        const centreNow: [number, number, number] = [
          mass.centre[0] + state.body.position[0],
          mass.centre[1] + state.body.position[1],
          mass.centre[2] + state.body.position[2],
        ];
        const plan = flightPlan(flight.kind, berth);
        // Автопилоту передаём ПАСПОРТ машины — массу, момент инерции и
        // сопротивление, — чтобы он мог предсказать, где окажется, а не
        // догонять собственную ошибку.
        const piloted = autopilot(
          plan,
          flight.progress,
          centreNow,
          state.body.orientation,
          state.body.velocity,
          state.body.angularVelocity,
          shipModel,
          Math.max(
            0,
            Math.min(1, (flight.time - SKY_TRAIN_UNDERWAY_TIME) / 8),
          ),
          frame.nose as [number, number, number],
        );
        if (piloted.goAround && flight.time - flight.lastGoAround > 20) {
          // Второй круг начинается с того же створа, где корабль физически
          // находится. Откат на 45% ставил цель на противоположную сторону
          // петли — автопилот срезал всю карту по диагонали, хотя такого
          // требования у маршрута нет.
          flight.progress = 0;
          flight.lastGoAround = flight.time;
          flight.goArounds += 1;
        }
        liftCommand = piloted.controls.liftTrim;
        const response = {
          forces: shipForces(
            piloted.controls,
            centreNow,
            mass.centre as [number, number, number],
            state.body.orientation,
            SKY_TRAIN_LIMITS,
            frame.nose as [number, number, number],
            Math.hypot(state.body.velocity[0], state.body.velocity[2]),
          ),
          desiredYawRate: piloted.desiredYawRate,
          throttle: piloted.controls.throttle,
        };
        for (const applied of response.forces) {
          controls.push({
            force: applied.force as [number, number, number],
            point: applied.point as [number, number, number],
          });
        }
        flight.throttle = response.throttle;
        // Ход по маршруту двигает сам корабль: сколько прошёл, на столько и
        // сдвинулась цель.
        if (flight.time >= SKY_TRAIN_UNDERWAY_TIME) {
          const travelled =
            Math.hypot(state.body.velocity[0], state.body.velocity[2]) * step;
          flight.progress = advanceRouteProgress(
            flight.kind,
            flight.progress,
            berth,
            centreNow,
            travelled,
          );
        }

      } else if (!flight) {
        // У причала корабль держит высоту балластом и клапаном — как это и
        // делается на настоящем судне.
        liftCommand = Math.max(
          -1,
          Math.min(1, (-0.06 * state.body.position[1] - 0.18 * state.body.velocity[1]) / SKY_TRAIN_LIMITS.liftTrimRange),
        );
      } else if (flight) {
        // На отрыве моторы раскручиваются одинаково: доворачивать нечего.
        const spool = 0.42 * Math.min(1, flight.time / SKY_TRAIN_CASTOFF_TIME);
        flight.throttle = [spool, spool];
        // ОТСЧЁТ. Пока швартов не отдан, тот же регулятор держит причальную
        // высоту. После отдачи концов маршрутный регулятор выше сразу получает
        // требование UNSTICK_HEIGHT — отдельного режима подъёма и скачка между
        // двумя законами управления больше нет.
        liftCommand = Math.max(
          -1,
          Math.min(
            1,
            (-0.06 * state.body.position[1] - 0.18 * state.body.velocity[1]) /
              SKY_TRAIN_LIMITS.liftTrimRange,
          ),
        );
      }

      // Точка приложения подъёма едет вместе с корпусом.
      // Подъём идёт к цели инерционно: за секунду он меняется не больше чем
      // на четверть веса — стравить газ и сбросить балласт мгновенно нельзя.
      const liftTarget = Math.min(
        liftCapacity,
        neutral * (1 + liftCommand * SKY_TRAIN_LIMITS.liftTrimRange),
      );
      if (state.liftNow === 0) {
        state.liftNow = liftTarget;
      }
      const liftRate = neutral * 0.25 * step;
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
        force: mooringForce(
          state.body.position as [number, number, number],
          state.body.velocity as [number, number, number],
          mass.mass,
        ) as [number, number, number],
        point: centre,
      };

      // Касание настоящего мира. Днище щупает землю под собой, обшивка —
      // всё, во что можно упереться бортом, носом или крышей. Точка
      // приложения — сам щуп: поэтому упершийся нос разворачивает корабль, а
      // принявшая вес опора его выравнивает. Одна и та же пружина с
      // демпфером, разные направления.
      const contacts: { force: [number, number, number]; point: [number, number, number] }[] = [];
      const probeCount = frame.supports.length + frame.hullProbes.length;
      const supportStiffness = (mass.mass * GRAVITY) / SUPPORT_GIVE / frame.supports.length;
      const probeDamping = 2 * Math.sqrt((supportStiffness * mass.mass) / probeCount);
      const rotationNow = vehicleRotation(state.pose, frame.nose);
      const supportProbes = DOWNWARD_PROBES(frame.supports);
      let supportContacts = 0;
      for (const [probeIndex, probe] of [
        ...supportProbes,
        ...frame.hullProbes,
      ].entries()) {
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
        supportRay.current ??= new rapier.Ray(
          { x: 0, y: 0, z: 0 },
          { x: 0, y: -1, z: 0 },
        );
        supportRay.current.origin.x = world[0] + normal[0] * 0.06;
        supportRay.current.origin.y = world[1] + normal[1] * 0.06;
        supportRay.current.origin.z = world[2] + normal[2] * 0.06;
        supportRay.current.dir.x = normal[0];
        supportRay.current.dir.y = normal[1];
        supportRay.current.dir.z = normal[2];
        const hit =
          world[1] > 0
            ? rapierWorld.castRay(
                supportRay.current,
                SUPPORT_GIVE + 0.06,
                true,
                undefined,
                VEHICLE_CONTACT_QUERY,
              )
            : null;
        if (!hit) {
          continue;
        }
        const handle = hit.collider.parent()?.handle;
        if (handle !== undefined && shipBodies.current.has(handle)) {
          continue;   // собственный кусок — это не мир
        }
        const penetration = Math.max(0, SUPPORT_GIVE - hit.timeOfImpact);
        if (penetration <= 0) {
          continue;
        }
        if (probeIndex < supportProbes.length) {
          supportContacts += 1;
        }
        // Скорость ИМЕННО ЭТОЙ точки: у вращающегося корабля нос и корма
        // идут в разные стороны, и демпфировать надо то, что происходит здесь.
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
        const closing =
          pointVelocity[0] * normal[0] +
          pointVelocity[1] * normal[1] +
          pointVelocity[2] * normal[2];
        const push = Math.max(
          0,
          supportStiffness * penetration - probeDamping * Math.min(0, closing),
        );
        contacts.push({
          force: [-normal[0] * push, -normal[1] * push, -normal[2] * push],
          point: [world[0], world[1], world[2]],
        });
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
          ...(flight && flight.castOff && flight.progress < 0.9 ? [] : [mooring]),
          ...contacts,
          ...controls,
        ],
        {
          // Продольное и боковое сопротивление уже приложены силой выше.
          linear: 0,
          angular: HOVER_DAMPING.angular * mass.inertia[4],
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
      });
    }

    for (const frame of frames) {
      const state = frameState(frame.id);
      const pose = state.pose;
      const resting = isRestingPose(pose);
      if (resting && !state.moving) {
        continue;
      }

      state.velocity = [
        (pose.position[0] - state.previousPose.position[0]) / step,
        (pose.position[1] - state.previousPose.position[1]) / step,
        (pose.position[2] - state.previousPose.position[2]) / step,
      ];
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
              body.setLinvel(
                {
                  x: current.x + state.velocity[0],
                  y: current.y + state.velocity[1],
                  z: current.z + state.velocity[2],
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
        // Лопасть сперва крутится вокруг своей оси, и только потом её несёт
        // кадр: иначе винт вращался бы вокруг сердца корабля.
        let localPosition = piece.position;
        let spun: Quaternion | null = null;
        const spinAngle = state.spinAngles[member.engineIndex] ?? 0;
        if (member.spinHub && spinAngle !== 0) {
          const hub = member.spinHub;
          const angle = spinAngle;
          const sin = Math.sin(angle);
          const cos = Math.cos(angle);
          const dy = piece.position[1] - hub[1];
          const dz = piece.position[2] - hub[2];
          localPosition = [
            piece.position[0],
            hub[1] + dy * cos - dz * sin,
            hub[2] + dy * sin + dz * cos,
          ];
          spun = new Quaternion().setFromEuler(new Euler(angle, 0, 0));
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
        const own = spun
          ? spun.clone().multiply(member.baseQuaternion)
          : member.baseQuaternion;
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
        const eventState = skyTrainFlightEventState(state.flight);
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
    <CompoundKinematicClusterBodies
      definitions={frames}
      pieces={pieces}
      brokenPieces={inactivePieces}
      registry={clusterRegistry}
    />
  );
}
