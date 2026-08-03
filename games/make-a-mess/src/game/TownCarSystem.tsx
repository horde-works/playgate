"use client";

// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Igor Kirisiuk

import { useKeyboardControls } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import {
  useBeforePhysicsStep,
  useRapier,
  type RapierRigidBody,
} from "@react-three/rapier";
import { useCallback, useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { CompoundKinematicClusterBodies } from "./CompoundKinematicClusterBodies";
import type { CompoundClusterContact } from "./CompoundKinematicClusterBodies";
import {
  resolveVehicleContact,
  type ContactMaterialProfile,
  type VehicleContactBody,
  type VehicleContactDamageRequest,
} from "./vehicleContactDamage";
import {
  PHYSICS_TIME_STEP,
  type CompoundKinematicClusterDefinition,
  type CompoundKinematicClusterRegistry,
} from "./compoundKinematicCluster";
import {
  massProperties,
  pointEffectiveMass,
  principalMassProperties,
  type MassProperties,
} from "./clusterDynamics";
import {
  structuralMaterialProfiles,
  type BreakableMaterial,
  type BreakablePieceDefinition,
} from "./destructionScene";
import {
  advanceCarSteering,
  carForces,
  type CarControls,
  type CarGroundProbe,
  type CarMachine,
  type CarWheel,
} from "./carDynamics";
import { setMemberArticulation } from "./clusterMemberArticulation";
import {
  DS_BRAKE_DECELERATION,
  DS_CLUSTER_ID,
  DS_CORNERING_PER_SHARE,
  DS_DRIVE_ACCELERATION,
  DS_HEADLAMP_STEER_SHARE,
  DS_MAXIMUM_STEER,
  DS_NOSE,
  DS_ROLLING_RESISTANCE,
  DS_STEERING_RATE,
  DS_STEERING_RETURN,
  DS_SUSPENSION_TRAVEL,
  DS_TYRE_GRIP,
  DS_TYRE_HALF_WIDTH,
  DS_WHEEL_RADIUS,
  DS_WHEEL_STATIONS,
  dsCornerDamping,
  dsCornerStiffness,
  townDsClusterDefinition,
} from "./townCitroenDs";
import {
  TOWN_DS_DRIVER_SEAT,
  TOWN_DS_DRIVER_SEAT_ID,
  passengerSeatIsIntact,
} from "./passengerSeats";
import { VEHICLE_CONTACT_QUERY } from "./physicsInteractionGroups";
import type { EntryInteractionTarget } from "./entryInteraction";
import type { VehicleFramePoseState } from "./VehicleFrameSystem";
import {
  motionTelemetryAvailable,
  type MotionTelemetryUpdate,
} from "./motionTelemetry";

/**
 * РАНТАЙМ КОЛЁСНОЙ МАШИНЫ
 *
 * Своя система, а не ветка в общем транспортном кадре. Причина не в
 * аккуратности, а в том, что общий кадр целиком про РЕЙС: маршрут, заход,
 * швартовка, второй круг, беспилотный запуск. У машины ничего этого нет — у
 * неё есть человек за рулём и четыре пятна контакта. Прецедент ровно такой же:
 * состав ЛРТ живёт отдельной системой по той же причине.
 *
 * Что здесь происходит на шаге:
 *
 *   1. четыре луча подвески из ступиц вниз ПО ОСИ КОРПУСА — не по мировой
 *      вертикали: стойка наклоняется вместе с машиной;
 *   2. `carForces` считает реакцию, тягу, тормоз и снос — он про машину
 *      вообще и об этой не знает ничего;
 *   3. силы прикладываются в мировых точках контакта, и всё остальное —
 *      клевок, перенос веса, момент от несимметричной тяги — получается само;
 *   4. поза публикуется в общий реестр, и по нему за машиной едут кресло,
 *      камера и фары. Ни свет, ни человек об автомобиле не знают.
 *
 * Луч НЕ ВИДИТ СОБСТВЕННЫХ коллайдеров машины: иначе подвеска нашла бы опору
 * в собственном днище и машина повисла бы в воздухе на самой себе.
 */

const DENSITY = (material: BreakableMaterial): number =>
  structuralMaterialProfiles[material].density;

/**
 * ТЯЖЕСТЬ ПРИКЛАДЫВАЕТ ЭТОТ КОД.
 *
 * У составного тела кластера `gravityScale = 0`: летающие машины сами решают,
 * чем себя держать, и вес им добавляет их система. Машина, которой веса не
 * добавили, ведёт себя ровно так, как и было: пружины подвески толкают её
 * вверх, тянуть вниз нечему, колёса уходят от земли — и с ними уходит ВСЁ,
 * потому что и тяга, и тормоз рождаются только в пятне контакта. Сидишь в
 * салоне, а нажатия не делают ничего.
 */
const GRAVITY = 9.81;

/**
 * Ниже этой скорости сближения удара нет — есть контакт. Число общее с
 * транспортом: закон разрушения один, значит и порог входа в него один.
 */
const CONTACT_MINIMUM_CLOSING_SPEED = 0.35;

const CAR_CLUSTER: CompoundKinematicClusterDefinition = townDsClusterDefinition();

/**
 * Паспорт колёс в терминах силовой модели. Жёсткость и демпфирование каждого
 * угла выводятся из ДОЛИ ВЕСА на нём, поэтому перекос развесовки сам меняет
 * подвеску, а не требует правки четырёх чисел.
 */
const CAR_WHEELS: readonly CarWheel[] = DS_WHEEL_STATIONS.map((station) => ({
  id: station.id,
  axle: station.axle,
  hub: station.hub,
  radius: DS_WHEEL_RADIUS,
  travel: DS_SUSPENSION_TRAVEL,
  stiffness: dsCornerStiffness(station.weightShare),
  damping: dsCornerDamping(station.weightShare),
  steerShare: station.steerShare,
  brakeShare: station.brakeShare,
  grip: DS_TYRE_GRIP,
  cornering: DS_CORNERING_PER_SHARE * station.weightShare,
}));

const NEUTRAL_CONTROLS: CarControls = {
  throttle: 0,
  brake: 0,
  steer: 0,
  handbrake: false,
};

const DRIVER_TARGET: EntryInteractionTarget = {
  id: TOWN_DS_DRIVER_SEAT_ID,
  kind: "seat",
};

const STAND_TARGET: EntryInteractionTarget = {
  id: TOWN_DS_DRIVER_SEAT_ID,
  kind: "stand",
};

type ControlName = "forward" | "backward" | "left" | "right" | "run" | "jump";

interface TownCarSystemProps {
  readonly pieces: readonly BreakablePieceDefinition[];
  readonly brokenPieces: { current: ReadonlySet<string> };
  readonly inactivePieces: ReadonlySet<string>;
  readonly resetVersion: number;
  readonly clusterRegistry: CompoundKinematicClusterRegistry;
  /** Тела кусков: артикулированному колесу нужна собственная поза. */
  readonly bodies: { current: Map<string, RapierRigidBody> };
  readonly occupiedSeatId: string | null;
  readonly onOccupiedSeatChange: (seatId: string | null) => void;
  readonly onApproachChange: (target: EntryInteractionTarget | null) => void;
  /** Растёт, когда игрок нажал пробел у поста. */
  readonly entryRequestVersion: number;
  readonly entryRequestTargetRef: MutableRefObject<EntryInteractionTarget | null>;
  readonly onFramePose?: (state: VehicleFramePoseState) => void;
  /** Угол руля наружу: по нему доворачивается внутренняя пара фар. */
  readonly onSteeringChange?: (steer: number) => void;
  readonly onMotionTelemetryUpdate?: (update: MotionTelemetryUpdate) => void;
  /** Свойства материала для закона удара. Тот же каталог, что у транспорта. */
  readonly contactMaterialOf?: (material: string) => ContactMaterialProfile;
  /** Какой кусок мира стоит в этой точке — вторая сторона удара. */
  readonly worldContactPieceAt?: (
    point: readonly [number, number, number],
    radius: number,
  ) => VehicleContactBody | null;
  readonly onContactDamage?: (request: VehicleContactDamageRequest) => void;
}

export function TownCarSystem({
  pieces,
  brokenPieces,
  inactivePieces,
  resetVersion,
  clusterRegistry,
  bodies,
  occupiedSeatId,
  onOccupiedSeatChange,
  onApproachChange,
  entryRequestVersion,
  entryRequestTargetRef,
  onFramePose,
  onSteeringChange,
  onMotionTelemetryUpdate,
  contactMaterialOf,
  worldContactPieceAt,
  onContactDamage,
}: TownCarSystemProps) {
  const { rapier, world } = useRapier();
  const camera = useThree((state) => state.camera);
  const [, getControls] = useKeyboardControls<ControlName>();

  const carPieces = useMemo(
    () => pieces.filter((piece) => piece.clusterId === DS_CLUSTER_ID),
    [pieces],
  );
  const present = carPieces.length > 0;

  /**
   * УДАРЫ ЗА ШАГ. Rapier уже принял их в contact solver — здесь они только
   * ИЗМЕРЯЮТСЯ и переводятся в общий закон материалов. Без этого машина
   * останавливается о препятствие (контакт есть), но ничего не ломает ни в
   * себе, ни в нём: удар и контакт — разные события, и второе без первого
   * выглядит как резиновый мир.
   */
  const contactEvents = useRef<CompoundClusterContact[]>([]);
  const collectContact = useCallback((contact: CompoundClusterContact) => {
    if (contact.clusterId !== DS_CLUSTER_ID) return;
    if (contactEvents.current.length < 256) contactEvents.current.push(contact);
  }, []);
  const pieceById = useMemo(
    () => new Map(carPieces.map((piece) => [piece.id, piece] as const)),
    [carPieces],
  );

  const steer = useRef(0);
  /** Накопленный угол проката колеса, радианы. */
  const wheelSpin = useRef(0);
  const approached = useRef(false);
  const handledRequest = useRef(entryRequestVersion);
  const ray = useRef<InstanceType<typeof rapier.Ray> | null>(null);
  const mass = useRef<MassProperties | null>(null);
  const massKey = useRef("");
  /** Какая масса уже залита в Rapier: у коллайдеров density=0, без этого тело невесомо. */
  const appliedMassKey = useRef("");
  const telemetryActive = useRef(false);
  const telemetryNextAt = useRef(0);

  useEffect(() => {
    steer.current = 0;
    approached.current = false;
    mass.current = null;
    massKey.current = "";
    appliedMassKey.current = "";
    telemetryNextAt.current = 0;
    if (telemetryActive.current) {
      telemetryActive.current = false;
      onMotionTelemetryUpdate?.({ sourceId: DS_CLUSTER_ID, snapshot: null });
    }
  }, [onMotionTelemetryUpdate, resetVersion]);

  const definitions = useMemo(
    () => (present ? [CAR_CLUSTER] : []),
    [present],
  );

  /**
   * Живая масса: считается по УЦЕЛЕВШИМ кускам и пересчитывается только когда
   * их состав изменился. Отстрелили крыло — центр масс уехал, и машину повело.
   */
  const liveMass = useCallback((): MassProperties | null => {
    const attached = carPieces.filter(
      (piece) => !inactivePieces.has(piece.id) && !brokenPieces.current.has(piece.id),
    );
    const key = `${attached.length}:${inactivePieces.size}`;
    if (massKey.current !== key || !mass.current) {
      massKey.current = key;
      mass.current = attached.length > 0 ? massProperties(attached, DENSITY) : null;
    }
    return mass.current;
  }, [brokenPieces, carPieces, inactivePieces]);

  useBeforePhysicsStep(() => {
    if (!present) return;
    const runtime = clusterRegistry.current.get(DS_CLUSTER_ID);
    const body = runtime?.body;
    if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
      const scope = window as unknown as Record<string, unknown>;
      scope.__mamCarStep = ((scope.__mamCarStep as number) ?? 0) + 1;
      scope.__mamCarGuard = !runtime
        ? "нет кластера в реестре"
        : !body
          ? "нет тела"
          : body.bodyType() !== rapier.RigidBodyType.Dynamic
            ? `тип тела ${body.bodyType()}`
            : "проходит";
    }
    if (!body || body.bodyType() !== rapier.RigidBodyType.Dynamic) return;
    const properties = liveMass();
    if (!properties || properties.mass <= 0) return;

    // Составные тела рождаются с density=0 на коллайдерах. Летающие машины
    // заливают массу в VehicleFrameSystem; дорожная обязана делать то же
    // здесь, иначе addForce уходит в никуда, а сиденье всё равно «работает».
    if (appliedMassKey.current !== massKey.current) {
      appliedMassKey.current = massKey.current;
      const principal = principalMassProperties(properties, CAR_CLUSTER.origin);
      body.setAdditionalMassProperties(
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
      body.recomputeMassPropertiesFromColliders();
      body.wakeUp();
    }

    const translation = body.translation();
    const rotation = body.rotation();
    const linear = body.linvel();
    const angular = body.angvel();
    const orientation: [number, number, number, number] = [
      rotation.x,
      rotation.y,
      rotation.z,
      rotation.w,
    ];

    // Авторская точка -> мир. Тело стоит в авторском нуле машины, поэтому
    // локальное смещение куска — это его же авторская координата.
    const toWorld = (local: readonly [number, number, number]) => {
      const [x, y, z] = local;
      const [qx, qy, qz, qw] = orientation;
      const tx = 2 * (qy * z - qz * y);
      const ty = 2 * (qz * x - qx * z);
      const tz = 2 * (qx * y - qy * x);
      return [
        translation.x + x + qw * tx + (qy * tz - qz * ty),
        translation.y + y + qw * ty + (qz * tx - qx * tz),
        translation.z + z + qw * tz + (qx * ty - qy * tx),
      ] as [number, number, number];
    };

    const localCentre: [number, number, number] = [
      properties.centre[0] - CAR_CLUSTER.origin[0],
      properties.centre[1] - CAR_CLUSTER.origin[1],
      properties.centre[2] - CAR_CLUSTER.origin[2],
    ];
    const worldCentre = toWorld(localCentre);

    // --- Поза наружу --------------------------------------------------------
    // По ней за машиной едут кресло, камера и фары. Ни один из них не знает,
    // что это автомобиль, — им хватает кластера и позы.
    onFramePose?.({
      clusterId: DS_CLUSTER_ID,
      origin: CAR_CLUSTER.origin,
      nose: DS_NOSE,
      pose: {
        position: [
          translation.x - CAR_CLUSTER.origin[0],
          translation.y - CAR_CLUSTER.origin[1],
          translation.z - CAR_CLUSTER.origin[2],
        ],
        yaw: 0,
        pitch: 0,
        roll: 0,
        rotation: orientation,
      },
      linearVelocity: [linear.x, linear.y, linear.z],
      angularVelocity: [angular.x, angular.y, angular.z],
      centreOfMass: localCentre,
    });

    // --- Пост у водительской двери -----------------------------------------
    const seated = occupiedSeatId === TOWN_DS_DRIVER_SEAT_ID;
    const intact = passengerSeatIsIntact(TOWN_DS_DRIVER_SEAT, inactivePieces);
    const postPoint = toWorld([
      TOWN_DS_DRIVER_SEAT.interactionPoint[0] - CAR_CLUSTER.origin[0],
      TOWN_DS_DRIVER_SEAT.interactionPoint[1] - CAR_CLUSTER.origin[1],
      TOWN_DS_DRIVER_SEAT.interactionPoint[2] - CAR_CLUSTER.origin[2],
    ]);
    const reach = approached.current
      ? TOWN_DS_DRIVER_SEAT.releaseRadius
      : TOWN_DS_DRIVER_SEAT.approachRadius;
    const near =
      Math.hypot(
        camera.position.x - postPoint[0],
        camera.position.y - postPoint[1],
        camera.position.z - postPoint[2],
      ) <= reach;
    const offered = seated || (intact && near);
    if (offered !== approached.current) {
      approached.current = offered;
      onApproachChange(offered ? (seated ? STAND_TARGET : DRIVER_TARGET) : null);
    }
    if (handledRequest.current !== entryRequestVersion) {
      handledRequest.current = entryRequestVersion;
      const request = entryRequestTargetRef.current;
      if (request?.id === TOWN_DS_DRIVER_SEAT_ID && offered) {
        onOccupiedSeatChange(seated ? null : TOWN_DS_DRIVER_SEAT_ID);
      }
    }

    // --- Рычаги -------------------------------------------------------------
    // Пока за рулём никого — машина стоит на тормозе. Это не «выключенная
    // физика»: стоящий автомобиль действительно удерживается тормозом, и
    // толкнуть его ударом всё равно можно.
    let controls: CarControls = { ...NEUTRAL_CONTROLS, brake: 1 };
    if (seated) {
      const keys = getControls();
      const wantedSteer =
        (keys.right ? DS_MAXIMUM_STEER : 0) - (keys.left ? DS_MAXIMUM_STEER : 0);
      // АВТОВОЗВРАТ В НОЛЬ. Отпущенный руль у настоящей машины возвращается
      // сам — его выпрямляет кастор передней подвески, и возвращается он
      // БЫСТРЕЕ, чем водитель успевает выкрутить. Одна скорость на оба
      // движения дала бы вязкую баранку, которую все узнают как «не так».
      steer.current = advanceCarSteering(
        steer.current,
        wantedSteer,
        Math.abs(wantedSteer) > 1e-6
          ? DS_STEERING_RATE
          : DS_STEERING_RATE * DS_STEERING_RETURN,
        PHYSICS_TIME_STEP,
      );
      // Ход вдоль носа решает, что означает «назад»: на ходу это тормоз, на
      // месте — задняя передача. Так же, как у настоящей машины с одной
      // педалью под правой ногой.
      const forwardWorld = toWorld([DS_NOSE[0], 0, DS_NOSE[2]]);
      const heading: [number, number] = [
        forwardWorld[0] - translation.x,
        forwardWorld[2] - translation.z,
      ];
      const headingLength = Math.hypot(heading[0], heading[1]) || 1;
      const along =
        (linear.x * heading[0] + linear.z * heading[1]) / headingLength;
      controls = {
        throttle: keys.forward ? 1 : keys.backward && along < 0.5 ? -0.6 : 0,
        brake: keys.backward && along >= 0.5 ? 1 : 0,
        steer: steer.current,
        handbrake: keys.run,
      };
    } else if (steer.current !== 0) {
      // Брошенная машина тоже выпрямляет колёса: кастор работает и без
      // водителя.
      steer.current = advanceCarSteering(
        steer.current,
        0,
        DS_STEERING_RATE * DS_STEERING_RETURN,
        PHYSICS_TIME_STEP,
      );
    }
    onSteeringChange?.(steer.current * DS_HEADLAMP_STEER_SHARE);

    // --- Видимый поворот и прокат колёс --------------------------------------
    //
    // Пишется ТОЛЬКО В РЕНДЕР: у колеса нет ни тела, ни коллайдера, поэтому
    // подвеска об этом повороте не знает и знать не может. Именно так и надо:
    // три прежних захода сделать колесо телом развалили подвеску, разбор — в
    // шапке `clusterMemberArticulation.ts`.
    //
    // Угол проката копится из пройденного пути, а не из времени: тогда колесо
    // стоит на месте у стоящей машины и не «подкручивается» на паузе.
    const forwardWorldSpin = toWorld([DS_NOSE[0], 0, DS_NOSE[2]]);
    const spinHeading: [number, number] = [
      forwardWorldSpin[0] - translation.x,
      forwardWorldSpin[2] - translation.z,
    ];
    const spinLength = Math.hypot(spinHeading[0], spinHeading[1]) || 1;
    const signedSpeed =
      (linear.x * spinHeading[0] + linear.z * spinHeading[1]) / spinLength;
    wheelSpin.current =
      (wheelSpin.current + (signedSpeed * PHYSICS_TIME_STEP) / DS_WHEEL_RADIUS)
      % (Math.PI * 2);
    for (const wheel of CAR_WHEELS) {
      const angle = steer.current * wheel.steerShare;
      for (const part of ["tyre", "hub"] as const) {
        setMemberArticulation(
          `${DS_CLUSTER_ID}:wheel:${wheel.id}:${part}:piece`,
          { steer: angle, spin: wheelSpin.current },
        );
      }
    }

    // --- Лучи подвески ------------------------------------------------------
    const upWorld = toWorld([0, 1, 0]);
    const up: [number, number, number] = [
      upWorld[0] - translation.x,
      upWorld[1] - translation.y,
      upWorld[2] - translation.z,
    ];
    const down: [number, number, number] = [-up[0], -up[1], -up[2]];
    ray.current ??= new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });
    // СВОИ ТЕЛА — ЭТО НЕ ТОЛЬКО КУЗОВ.
    //
    // Колесо получило собственное тело, чтобы поворачиваться и катиться, и
    // тем самым перестало быть частью кузова для луча. Луч немедленно нашёл
    // опору в СОБСТВЕННОМ колесе в паре сантиметров под ступицей: подвеска
    // пробилась до упора на всех четырёх, машина просела в асфальт. Своими
    // считаются кузов и все его артикулированные члены.
    const ownHandles = new Set<number>([body.handle]);

    for (const wheel of CAR_WHEELS) {
      for (const part of ["hub", "tyre"] as const) {
        const own = bodies.current.get(
          `${DS_CLUSTER_ID}:wheel:${wheel.id}:${part}:piece`,
        );
        if (own) ownHandles.add(own.handle);
      }
    }
    const probes: (CarGroundProbe | null)[] = CAR_WHEELS.map((wheel) => {
      const hub = toWorld([
        wheel.hub[0],
        wheel.hub[1],
        wheel.hub[2],
      ]);
      const cast = ray.current!;
      cast.origin.x = hub[0];
      cast.origin.y = hub[1];
      cast.origin.z = hub[2];
      cast.dir.x = down[0];
      cast.dir.y = down[1];
      cast.dir.z = down[2];
      const hit = world.castRayAndGetNormal(
        cast,
        wheel.radius + wheel.travel,
        true,
        undefined,
        // Та же группа запроса, которой транспорт щупает мир: луч обязан
        // видеть землю и обломки и не видеть ни актёров, ни сам транспорт.
        VEHICLE_CONTACT_QUERY,
        undefined,
        body,
        (collider) => {
          const handle = collider.parent()?.handle;
          return handle === undefined || !ownHandles.has(handle);
        },
      );
      if (!hit) return null;
      // Нормаль опоры берётся у самой опоры: на бордюре и на откосе машина
      // обязана толкаться вдоль склона, а не вдоль мировой вертикали.
      const normal: [number, number, number] = [
        hit.normal.x,
        hit.normal.y,
        hit.normal.z,
      ];
      const flipped = normal[0] * up[0] + normal[1] * up[1] + normal[2] * up[2] < 0;
      return {
        distance: hit.timeOfImpact,
        normal: flipped ? [-normal[0], -normal[1], -normal[2]] : normal,
      };
    });

    // --- Силы ---------------------------------------------------------------
    const availability = CAR_WHEELS.map((wheel) => {
      const hub = `${DS_CLUSTER_ID}:wheel:${wheel.id}:hub:piece`;
      const tyre = `${DS_CLUSTER_ID}:wheel:${wheel.id}:tyre:piece`;
      if (inactivePieces.has(hub) || brokenPieces.current.has(hub)) return 0;
      return inactivePieces.has(tyre) || brokenPieces.current.has(tyre) ? 0 : 1;
    });
    const machine: CarMachine = {
      wheels: CAR_WHEELS,
      nose: DS_NOSE,
      centreOfMass: localCentre,
      mass: properties.mass,
      layout: "front",
      driveForce: properties.mass * DS_DRIVE_ACCELERATION,
      brakeForce: properties.mass * DS_BRAKE_DECELERATION,
      rollingResistance: DS_ROLLING_RESISTANCE,
      availability,
    };
    const result = carForces(
      machine,
      {
        orientation,
        centre: worldCentre,
        velocity: [linear.x, linear.y, linear.z],
        angularVelocity: [angular.x, angular.y, angular.z],
      },
      controls,
      probes,
    );
    // Силы шага собираются с нуля: остаток прошлого шага сложился бы с
    // нынешним и разогнал бы машину сам по себе.
    body.resetForces(false);
    body.resetTorques(false);
    body.addForceAtPoint(
      { x: 0, y: -properties.mass * GRAVITY, z: 0 },
      { x: worldCentre[0], y: worldCentre[1], z: worldCentre[2] },
      true,
    );
    for (const applied of result.forces) {
      body.addForceAtPoint(
        { x: applied.force[0], y: applied.force[1], z: applied.force[2] },
        { x: applied.point[0], y: applied.point[1], z: applied.point[2] },
        true,
      );
    }
    // Аэродинамика кузова: без неё машина разгоняется до бесконечности.
    const drag = properties.mass * 0.011;
    body.addForce({ x: -linear.x * drag, y: 0, z: -linear.z * drag }, true);
    // Угловое успокоение кузова. Без него машина, качнувшаяся на подвеске,
    // раскачивается всё сильнее: гасить её сцеплением шин нечем.
    const spin = properties.inertia[4] * 0.9;
    body.addTorque(
      { x: -angular.x * spin, y: -angular.y * spin * 0.25, z: -angular.z * spin },
      false,
    );

    // --- Удар о мир ---------------------------------------------------------
    //
    // Вердикта здесь нет и быть не должно: обе стороны судит ОДИН закон
    // материалов там, где он живёт. Здесь удар только меряется — скорость
    // сближения, импульс и интенсивность каждой стороне в той же калибровке,
    // в которой закон получает их от падающего обломка.
    const hits = contactEvents.current.splice(0);
    if (hits.length > 0 && contactMaterialOf && onContactDamage) {
      for (const hit of hits) {
        const piece = pieceById.get(hit.pieceId);
        if (!piece) continue;
        const lever: [number, number, number] = [
          hit.point[0] - worldCentre[0],
          hit.point[1] - worldCentre[1],
          hit.point[2] - worldCentre[2],
        ];
        // Скорость ИМЕННО ЭТОЙ точки: машина может встретить стену краем на
        // развороте, пока её центр почти стоит.
        const spin: [number, number, number] = [
          angular.y * lever[2] - angular.z * lever[1],
          angular.z * lever[0] - angular.x * lever[2],
          angular.x * lever[1] - angular.y * lever[0],
        ];
        const obstacle =
          worldContactPieceAt?.(
            [
              hit.point[0] - hit.normal[0] * 0.3,
              hit.point[1] - hit.normal[1] * 0.3,
              hit.point[2] - hit.normal[2] * 0.3,
            ],
            1.1,
          ) ?? null;
        const resolution = resolveVehicleContact(
          {
            point: hit.point as [number, number, number],
            normal: hit.normal as [number, number, number],
            relativeVelocity: [
              linear.x + spin[0],
              linear.y + spin[1],
              linear.z + spin[2],
            ],
            effectiveMass: pointEffectiveMass(
              properties,
              orientation,
              lever,
              hit.normal as [number, number, number],
            ),
            normalImpulse: hit.normalImpulse,
            vehicle: {
              pieceId: piece.id,
              material: piece.material,
              volume:
                piece.volume ??
                piece.size[0] * piece.size[1] * piece.size[2],
            },
            obstacle,
            share: 1 / hits.length,
          },
          contactMaterialOf,
        );
        if (resolution.closingSpeed < CONTACT_MINIMUM_CLOSING_SPEED) continue;
        onContactDamage({
          point: hit.point as [number, number, number],
          direction: [-hit.normal[0], -hit.normal[1], -hit.normal[2]],
          closingSpeed: resolution.closingSpeed,
          vehiclePieceId: piece.id,
          vehicleIntensity: resolution.vehicleIntensity,
          vehicleMassAdvantage: resolution.vehicleMassAdvantage,
          worldPieceId: obstacle?.pieceId ?? null,
          worldIntensity: resolution.obstacleIntensity,
          worldMassAdvantage: resolution.obstacleMassAdvantage,
        });
      }
    }

    // --- Диагноз для headless-проверок --------------------------------------
    // Телеметрия отвечает водителю: скорость и курс. На вопрос «почему НЕ
    // едет» она не отвечает вовсе, потому что все возможные причины лежат
    // ниже её: не открылся ли контакт, есть ли нагрузка, дошли ли рычаги.
    // Пара к `__mamDepartureDebug` транспорта.
    if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
      (window as unknown as Record<string, unknown>).__mamCarDebug = {
        seated,
        mass: properties.mass,
        bodyMass: body.mass(),
        bodyType: body.bodyType(),
        sleeping: body.isSleeping(),
        enabled: body.isEnabled(),
        numColliders: body.numColliders(),
        contacts: result.contacts,
        controls,
        speedAlong:
          linear.x * (toWorld([DS_NOSE[0], 0, DS_NOSE[2]])[0] - translation.x) +
          linear.z * (toWorld([DS_NOSE[0], 0, DS_NOSE[2]])[2] - translation.z),
        position: [translation.x, translation.y, translation.z],
        wheels: result.wheels.map((wheel, index) => ({
          id: wheel.id,
          contact: wheel.contact,
          load: wheel.load,
          compression: wheel.compression,
          longitudinal: wheel.longitudinal,
          lateral: wheel.lateral,
          slipping: wheel.slipping,
          available: availability[index],
          probe: probes[index]?.distance ?? null,
        })),
      };
    }

    // --- Телеметрия ---------------------------------------------------------
    // Пока человек за рулём — канал открыт даже на холостом ходу: иначе HUD
    // молчит и кажется, что машина «не подключена».
    const groundSpeed = Math.hypot(linear.x, linear.z);
    const telemetryOpen = motionTelemetryAvailable({
      active: seated,
      airborne: result.contacts === 0,
      moving:
        groundSpeed > 0.15 ||
        Math.abs(linear.y) > 0.12 ||
        Math.hypot(angular.x, angular.y, angular.z) > 0.035,
      reportWhileStopped: seated,
    });
    if (!telemetryOpen) {
      if (telemetryActive.current) {
        telemetryActive.current = false;
        onMotionTelemetryUpdate?.({ sourceId: DS_CLUSTER_ID, snapshot: null });
      }
    } else if (onMotionTelemetryUpdate) {
      const now = performance.now();
      telemetryActive.current = true;
      if (now >= telemetryNextAt.current) {
        telemetryNextAt.current = now + 125;
        const forwardWorld = toWorld([DS_NOSE[0], DS_NOSE[1], DS_NOSE[2]]);
        const heading = ((Math.atan2(
          forwardWorld[0] - translation.x,
          -(forwardWorld[2] - translation.z),
        ) *
          180) /
          Math.PI +
          360) %
          360;
        onMotionTelemetryUpdate({
          sourceId: DS_CLUSTER_ID,
          snapshot: {
            sourceId: DS_CLUSTER_ID,
            sourceLabel: "DS",
            capturedAt: now,
            priority: 40,
            phase: "cruise",
            metrics: [
              {
                id: "groundSpeed",
                value: groundSpeed * 3.6,
                unit: "km/h",
                precision: 0,
                activityDelta: 0.8,
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
                id: "relativeAltitude",
                value: translation.y - CAR_CLUSTER.origin[1],
                unit: "m",
                precision: 2,
                signed: true,
                activityDelta: 0.05,
              },
            ],
          },
        });
      }
    }
  });

  useEffect(() => {
    if (present) return;
    onApproachChange(null);
    if (telemetryActive.current) {
      telemetryActive.current = false;
      onMotionTelemetryUpdate?.({ sourceId: DS_CLUSTER_ID, snapshot: null });
    }
  }, [onApproachChange, onMotionTelemetryUpdate, present]);

  if (!present) return null;

  return (
    <CompoundKinematicClusterBodies
      definitions={definitions}
      pieces={pieces}
      brokenPieces={brokenPieces.current}
      detachedPieces={inactivePieces}
      registry={clusterRegistry}
      onContact={collectContact}
    />
  );
}

export { CAR_WHEELS as TOWN_CAR_WHEELS, DS_TYRE_HALF_WIDTH };
