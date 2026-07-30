import type {
  BreakablePieceDefinition,
  LampEventState,
  SceneVector3,
} from "./destructionScene.ts";
import { PLAYER_CAPSULE_FOOT_OFFSET } from "./playerMovement.ts";
import type { VehicleRecoveryLifecycle } from "./vehicleFailure.ts";
import type { VehicleSafetyAdvisory } from "./vehicleSafetyAutomation.ts";
import {
  flightPlan,
  skyTrainRoutePhase,
  type SkyTrainFlightKind,
  type VehicleRoutePlan,
} from "./skyTrainRoutes.ts";
import {
  BASALT_SKY_RAM_CLUSTER_ID,
  BASALT_SKY_RAM_LIFT_CENTRE,
  BASALT_SKY_RAM_MOORING_POINT,
  BASALT_SKY_RAM_NOSE,
  BASALT_SKY_RAM_ORIGIN,
  basaltSkyRamPoint,
} from "./basaltSkyRam.ts";

// Kept as re-exports for callers while the authored routes themselves live in
// their own artifact module.
export {
  finalLegFrom,
  emergencyEscapePlan,
  flightPlan,
  routeLength,
  routePoint,
  routeSpeed,
  skyTrainRoutePhase,
  terminalArrivalPlan,
  SKY_TRAIN_UNSTICK_HEIGHT as UNSTICK_HEIGHT,
  type FlightPlan,
  type SkyTrainFlightKind,
  type VehicleRoutePlan,
} from "./skyTrainRoutes.ts";

/**
 * Кадр отсчёта транспорта: кластер, который умеет двигаться целиком.
 *
 * Куски авторятся в мировых координатах, как и всё остальное, но пока кадр
 * не в покое, их мировое положение считается заново от позы кадра. Это тот
 * же приём, которым система дверей возит створку, только кусков не два, а
 * пятьсот, и вместе с позой кадр несёт СКОРОСТЬ: отломанная в манёвре
 * панель обязана улететь с той скоростью, с какой шёл корабль, иначе всё
 * дальнейшее — падение сбитого судна, авария машины — будет мёртвым.
 *
 * Модуль намеренно чистый: ни three, ни rapier. Всё, что здесь есть, можно
 * посчитать в тесте.
 */
export interface VehicleFrameDefinition {
  readonly id: string;
  readonly clusterId: string;
  /** Human-readable callsign used by the generic movement telemetry HUD. */
  readonly telemetryLabel?: string;
  /** Внутренние механизмы, которые двигаются относительно общего корпуса. */
  readonly independentMemberMatches?: readonly string[];
  /**
   * Точка, вокруг которой кадр кренится и разворачивается. Для небесного
   * поезда это центр подъёмного сердца — центр объёма оболочки, а не
   * геометрический центр состава: корабль качается вокруг того, что его
   * держит.
   */
  readonly origin: SceneVector3;
  /** Куда смотрит нос в покое. Продольная ось — она же ось крена. */
  readonly nose: SceneVector3;
  /** Физическая точка носового узла, совпадающая с захватом причала в покое. */
  readonly mooringPoint: SceneVector3;
  /**
   * Подъёмная сила: она приложена в центре объёма оболочки — ВЫШЕ центра
   * масс, и именно эта пара сама даёт кораблю маятник, отвисающую гондолу и
   * клевок на торможении. Величина считается от целого корабля: целым он
   * нейтрально плавуч, а рвётся полотно — подъём падает пропорционально.
   */
  readonly liftCentre: SceneVector3;
  /** Кусок оболочки, по доле уцелевших считается подъём. */
  readonly envelopeMatch: string;
  /**
   * Точки опоры на днище, в авторских координатах. Через них кластер
   * чувствует настоящий мир: потеряв подъём, он садится на путь и
   * выравнивается, потому что земля принимает нагрузку — и принимает её в
   * нескольких разнесённых точках, а не в одной.
   */
  readonly supports: readonly SceneVector3[];
  /** Coulomb friction of the loaded underside against a contacted surface. */
  readonly supportFriction: VehicleSupportFriction;
  /**
   * Обшивка корабля глазами физики. Куски кластера — кинематические тела, а
   * нетронутый мир — статические; такая пара контактов в движке не даёт
   * ВООБЩЕ, поэтому раньше корабль замечал только выбитые из конструкций
   * (динамические) куски, а сквозь целый навес проходил насквозь. Щупы это
   * чинят: каждый смотрит наружу из своей точки борта и, наткнувшись на
   * что-либо, толкает корабль от препятствия. Точка приложения — сам щуп,
   * поэтому удар носом разворачивает, а не только тормозит.
   */
  readonly hullProbes: readonly HullProbe[];
}

/** Точка обшивки и наружная нормаль в ней, в авторских координатах. */
export interface HullProbe {
  readonly point: SceneVector3;
  readonly normal: SceneVector3;
}

export interface VehicleSupportFriction {
  readonly staticCoefficient: number;
  readonly dynamicCoefficient: number;
}

/**
 * Residual lift that keeps a friction-limited ground stop inside the support
 * polygon. A short, tall gondola must load its skids more gradually than a
 * long train; the final stable landing still dumps lift completely.
 */
export function vehicleGroundBrakingLiftFraction(
  supports: readonly SceneVector3[],
  massCentre: SceneVector3,
  nose: SceneVector3,
  friction: VehicleSupportFriction,
): number {
  const noseLength = Math.hypot(nose[0], nose[2]) || 1;
  const longitudinal = supports.map((point) =>
    (point[0] - massCentre[0]) * nose[0] / noseLength +
    (point[2] - massCentre[2]) * nose[2] / noseLength,
  );
  const forwardArm = Math.max(0, ...longitudinal);
  const aftArm = Math.max(0, ...longitudinal.map((value) => -value));
  const shortestArm = Math.min(forwardArm, aftArm);
  const supportY = Math.min(...supports.map((point) => point[1]));
  const centreHeight = Math.max(0.1, massCentre[1] - supportY);
  const dynamicFriction = Math.max(0.01, friction.dynamicCoefficient);
  const stabilityMargin = 0.72;
  const safeGroundLoadFraction = Math.min(
    1,
    stabilityMargin * shortestArm / (dynamicFriction * centreHeight),
  );
  return Math.max(0, Math.min(0.85, 1 - safeGroundLoadFraction));
}

/**
 * A contact probe sweeps the clearance plus the distance its surface point
 * can close during this fixed step. Positive speed means motion outwards from
 * the hull and therefore towards an obstacle along the probe normal.
 */
export function vehicleProbeReach(
  clearance: number,
  relativeClosingSpeed: number,
  deltaSeconds: number,
): number {
  return Math.max(0, clearance) +
    Math.max(0, relativeClosingSpeed) * Math.max(0, deltaSeconds);
}

/** Spring/damper magnitude opposing penetration at one authored hull probe. */
export function vehicleProbeReaction(
  stiffness: number,
  damping: number,
  clearance: number,
  surfaceGap: number,
  relativeClosingSpeed: number,
  deltaSeconds: number,
): number {
  const penetration = Math.max(
    0,
    vehicleProbeReach(clearance, relativeClosingSpeed, deltaSeconds) -
      surfaceGap,
  );
  return Math.max(
    0,
    Math.max(0, stiffness) * penetration +
      Math.max(0, damping) * relativeClosingSpeed,
  );
}

/**
 * Tangential Coulomb force at one loaded support probe. The normal reaction
 * is the only source of available friction: in free air this returns zero.
 * `supportedMass` is the share of the body carried by this contact and caps
 * the discrete impulse at exactly stopping the slip, never reversing it.
 */
export function vehicleProbeFriction(
  normalReaction: number,
  relativeVelocity: SceneVector3,
  normal: SceneVector3,
  friction: VehicleSupportFriction,
  supportedMass: number,
  deltaSeconds: number,
): SceneVector3 {
  const normalLength = Math.hypot(normal[0], normal[1], normal[2]);
  const delta = Math.max(0, deltaSeconds);
  if (normalReaction <= 0 || normalLength <= 1e-9 || delta <= 0) {
    return [0, 0, 0];
  }
  const unitNormal: SceneVector3 = [
    normal[0] / normalLength,
    normal[1] / normalLength,
    normal[2] / normalLength,
  ];
  const normalSpeed =
    relativeVelocity[0] * unitNormal[0] +
    relativeVelocity[1] * unitNormal[1] +
    relativeVelocity[2] * unitNormal[2];
  const tangent: SceneVector3 = [
    relativeVelocity[0] - unitNormal[0] * normalSpeed,
    relativeVelocity[1] - unitNormal[1] * normalSpeed,
    relativeVelocity[2] - unitNormal[2] * normalSpeed,
  ];
  const speed = Math.hypot(tangent[0], tangent[1], tangent[2]);
  if (speed <= 1e-9) {
    return [0, 0, 0];
  }

  const stoppingForce = Math.max(0, supportedMass) * speed / delta;
  const staticLimit =
    Math.max(0, friction.staticCoefficient) * normalReaction;
  const dynamicLimit =
    Math.max(0, friction.dynamicCoefficient) * normalReaction;
  const magnitude = stoppingForce <= staticLimit
    ? stoppingForce
    : Math.min(stoppingForce, dynamicLimit);
  return [
    -tangent[0] / speed * magnitude,
    -tangent[1] / speed * magnitude,
    -tangent[2] / speed * magnitude,
  ];
}

/**
 * Оболочка небесного поезда. Числа продублированы из сцены намеренно — как и
 * origin: политика транспорта не тянет за собой терминал, а тест сверяет их
 * с настоящей геометрией.
 */
const HULL = { from: -10.2, to: 21.4, y: 9.4, z: 77.6, radius: 3 } as const;

export function skyTrainHullRadiusAt(x: number): number {
  const length = HULL.to - HULL.from;
  const t = (x - HULL.from) / length;
  if (t < 0.2) {
    return HULL.radius * Math.sqrt(Math.max(0, 1 - ((0.2 - t) / 0.2) ** 2));
  }
  if (t > 0.64) {
    return HULL.radius * Math.pow(Math.max(0, 1 - ((t - 0.64) / 0.36) ** 2), 0.55);
  }
  return HULL.radius;
}

function skyTrainHullProbes(): readonly HullProbe[] {
  const probes: HullProbe[] = [];
  // Нос и корма: ими он и въедет во что-нибудь первым делом.
  probes.push({ point: [HULL.from - 0.2, HULL.y, HULL.z], normal: [-1, 0, 0] });
  probes.push({ point: [HULL.to + 0.2, HULL.y, HULL.z], normal: [1, 0, 0] });
  // Борта и верх оболочки по станциям.
  for (const x of [-6, -1, 4, 9, 14, 18.5]) {
    const radius = skyTrainHullRadiusAt(x);
    probes.push({ point: [x, HULL.y, HULL.z - radius], normal: [0, 0, -1] });
    probes.push({ point: [x, HULL.y, HULL.z + radius], normal: [0, 0, 1] });
    probes.push({ point: [x, HULL.y + radius, HULL.z], normal: [0, 1, 0] });
  }
  // Круги винтов: они вынесены дальше бортов оболочки и цепляют первыми.
  for (const side of [-1, 1] as const) {
    probes.push({ point: [5.6, 7.6, HULL.z + side * 5.75], normal: [0, 0, side] });
  }
  // Борта вагонов: ими корабль трётся о перрон.
  for (const x of [-6, -1.5, 3.5, 8.5, 13.5, 17.5]) {
    probes.push({ point: [x, 2.6, HULL.z - 1.55], normal: [0, 0, -1] });
    probes.push({ point: [x, 2.6, HULL.z + 1.55], normal: [0, 0, 1] });
  }
  // Низкая кабина выступает перед вагоном: оболочка над ней не заметит
  // буфер или фасад на уровне стекла, поэтому у эркера свои щупы.
  probes.push({ point: [-9.34, 2.78, HULL.z], normal: [-1, 0, 0] });
  probes.push({ point: [-8.25, 2.78, HULL.z - 1.28], normal: [0, 0, -1] });
  probes.push({ point: [-8.25, 2.78, HULL.z + 1.28], normal: [0, 0, 1] });
  return probes;
}

const VIKING_LONGSHIP = {
  centreX: 8.25,
  centreZ: -102.5,
  course: (6 * Math.PI) / 180,
  liftY: 8.1,
} as const;

/** World-authored point in the longship's keel/starboard coordinate frame. */
function vikingLongshipPoint(a: number, b: number, y: number): SceneVector3 {
  const cosine = Math.cos(VIKING_LONGSHIP.course);
  const sine = Math.sin(VIKING_LONGSHIP.course);
  return [
    VIKING_LONGSHIP.centreX + a * cosine - b * sine,
    y,
    VIKING_LONGSHIP.centreZ + a * sine + b * cosine,
  ];
}

function vikingLongshipHullProbes(): readonly HullProbe[] {
  const cosine = Math.cos(VIKING_LONGSHIP.course);
  const sine = Math.sin(VIKING_LONGSHIP.course);
  const nose: SceneVector3 = [-cosine, 0, -sine];
  const tail: SceneVector3 = [cosine, 0, sine];
  const starboard: SceneVector3 = [-sine, 0, cosine];
  const port: SceneVector3 = [sine, 0, -cosine];
  const probes: HullProbe[] = [
    { point: vikingLongshipPoint(-7.95, 0, 8.1), normal: nose },
    { point: vikingLongshipPoint(7.55, 0, 8.1), normal: tail },
  ];
  // Balloon skin: three stations per side plus crown and belly.
  for (const a of [-4.2, 0, 4.2]) {
    probes.push(
      { point: vikingLongshipPoint(a, 2.38, 8.1), normal: starboard },
      { point: vikingLongshipPoint(a, -2.38, 8.1), normal: port },
      { point: vikingLongshipPoint(a, 0, 10.48), normal: [0, 1, 0] },
      { point: vikingLongshipPoint(a, 0, 5.72), normal: [0, -1, 0] },
    );
  }
  // Clinker hull and the outboard oars are the first low obstacles to touch.
  for (const a of [-4.4, -2.2, 0, 2.2, 4.4]) {
    probes.push(
      { point: vikingLongshipPoint(a, 1.9, 1.55), normal: starboard },
      { point: vikingLongshipPoint(a, -1.9, 1.55), normal: port },
    );
  }
  return probes;
}

const TOWN_AIRSHIP = {
  noseX: -22.6,
  noseZ: -15.29,
  heading: -1.451,
  liftA: 6.25,
  liftY: 12.7,
} as const;

/** World-authored point in the city airship's longitudinal/lateral frame. */
export function townAirshipPoint(a: number, b: number, y: number): SceneVector3 {
  const cosine = Math.cos(TOWN_AIRSHIP.heading);
  const sine = Math.sin(TOWN_AIRSHIP.heading);
  return [
    TOWN_AIRSHIP.noseX + a * cosine - b * sine,
    y,
    TOWN_AIRSHIP.noseZ + a * sine + b * cosine,
  ];
}

function townAirshipHullProbes(): readonly HullProbe[] {
  const cosine = Math.cos(TOWN_AIRSHIP.heading);
  const sine = Math.sin(TOWN_AIRSHIP.heading);
  const nose: SceneVector3 = [-cosine, 0, -sine];
  const tail: SceneVector3 = [cosine, 0, sine];
  const positiveB: SceneVector3 = [-sine, 0, cosine];
  const negativeB: SceneVector3 = [sine, 0, -cosine];
  const probes: HullProbe[] = [
    // The docking socket intentionally surrounds the mooring pin. Probe from
    // the upper nose skin so the intended berth is not read as an obstacle.
    { point: townAirshipPoint(0.8, 0, 13.75), normal: nose },
    { point: townAirshipPoint(15.35, 0, 12.6), normal: tail },
  ];
  for (const a of [2.5, 7, 11.5]) {
    probes.push(
      { point: townAirshipPoint(a, 2.42, 12.6), normal: positiveB },
      { point: townAirshipPoint(a, -2.42, 12.6), normal: negativeB },
      { point: townAirshipPoint(a, 0, 15.02), normal: [0, 1, 0] },
      { point: townAirshipPoint(a, 0, 10.18), normal: [0, -1, 0] },
    );
  }
  // The motor circles and the low gondola meet obstacles before the skin.
  for (const side of [-1, 1] as const) {
    probes.push({
      point: townAirshipPoint(7, side * 5.75, 11.4),
      normal: side > 0 ? positiveB : negativeB,
    });
  }
  for (const a of [3.4, 5.8, 8.2]) {
    probes.push(
      { point: townAirshipPoint(a, 1.25, 8.15), normal: positiveB },
      { point: townAirshipPoint(a, -1.25, 8.15), normal: negativeB },
    );
  }
  return probes;
}

function basaltSkyRamHullProbes(): readonly HullProbe[] {
  const probes: HullProbe[] = [
    // The cast point sits inside its berth jaw. Its upper brace is the first
    // forward obstacle probe, so the intended socket is not rejected.
    { point: basaltSkyRamPoint(9.35, 0, 6.55), normal: [0, 0, 1] },
    { point: basaltSkyRamPoint(-17.2, 0, 12.8), normal: [0, 0, -1] },
  ];
  for (const [a, lateral, top, bottom] of [
    [-11.2, 3.15, 16.1, 9.55],
    [-5.2, 3.92, 16.75, 9.0],
    [0.5, 4.02, 16.85, 8.98],
    [6.1, 3.68, 16.75, 9.18],
  ] as const) {
    probes.push(
      { point: basaltSkyRamPoint(a, -lateral, 12.8), normal: [-1, 0, 0] },
      { point: basaltSkyRamPoint(a, lateral, 12.8), normal: [1, 0, 0] },
      { point: basaltSkyRamPoint(a, 0, top), normal: [0, 1, 0] },
      { point: basaltSkyRamPoint(a, 0, bottom), normal: [0, -1, 0] },
    );
  }
  for (const side of [-1, 1] as const) {
    for (const a of [-5.6, 0, 5.4]) {
      probes.push({
        point: basaltSkyRamPoint(a, side * 1.98, 6.15),
        normal: [side, 0, 0],
      });
    }
  }
  return probes;
}

export const vehicleFrames: readonly VehicleFrameDefinition[] = [
  {
    id: "sky-train",
    clusterId: "terminal:sky-train",
    telemetryLabel: "SKY TRAIN 01",
    independentMemberMatches: [":blade:"],
    // Нос корабля смотрит на −x: от этого зависит, вокруг чего он кренится,
    // а вокруг чего задирает нос.
    nose: [-1, 0, 0],
    // = [(hullFrom + hullTo) / 2, hullY, trackZ] из skyBerthMetrics.
    // Совпадение проверяет тест: числа здесь дублируются намеренно, чтобы
    // политика транспорта не тянула за собой всю сцену терминала.
    origin: [5.6, 9.4, 77.6],
    // Центр видимого носового конуса внутри швартовочного узла перрона.
    mooringPoint: [-10.65, 9.4, 77.6],
    liftCentre: [5.6, 9.4, 77.6],
    envelopeMatch: ":skin:",
    // Углы рам обоих вагонов: низ рамы на 0.94.
    supports: [
      [-9.0, 1.3, 76.68], [-9.0, 1.3, 78.52],
      [-6.3, 0.94, 76.2], [-6.3, 0.94, 79.0],
      [4.1, 0.94, 76.2], [4.1, 0.94, 79.0],
      [7.3, 0.94, 76.2], [7.3, 0.94, 79.0],
      [17.5, 0.94, 76.2], [17.5, 0.94, 79.0],
    ],
    supportFriction: { staticCoefficient: 1.18, dynamicCoefficient: 1.05 },
    hullProbes: skyTrainHullProbes(),
  },
  {
    id: "sky-longship",
    clusterId: "viking-village:sky-longship",
    telemetryLabel: "SKY LONGSHIP 01",
    // Oars articulate around their own oarlocks instead of being baked into
    // the rigid hull collider. Their shafts still remain live actuators.
    independentMemberMatches: [":oar:-1:", ":oar:1:"],
    origin: vikingLongshipPoint(0, 0, VIKING_LONGSHIP.liftY),
    nose: [
      -Math.cos(VIKING_LONGSHIP.course),
      0,
      -Math.sin(VIKING_LONGSHIP.course),
    ],
    // Точка носовой обвязки, от которой уходят причальные концы.
    mooringPoint: vikingLongshipPoint(-6.1, 0, 2.3),
    liftCentre: vikingLongshipPoint(0, 0, VIKING_LONGSHIP.liftY),
    envelopeMatch: ":gore:",
    // Keel and garboards: crash/landing contact follows the actual long hull.
    supports: [
      vikingLongshipPoint(-4.5, -0.55, 0.3),
      vikingLongshipPoint(-4.5, 0.55, 0.3),
      vikingLongshipPoint(-1.5, -0.55, 0.3),
      vikingLongshipPoint(-1.5, 0.55, 0.3),
      vikingLongshipPoint(1.5, -0.55, 0.3),
      vikingLongshipPoint(1.5, 0.55, 0.3),
      vikingLongshipPoint(4.3, -0.55, 0.3),
      vikingLongshipPoint(4.3, 0.55, 0.3),
    ],
    supportFriction: { staticCoefficient: 0.78, dynamicCoefficient: 0.6 },
    hullProbes: vikingLongshipHullProbes(),
  },
  {
    id: "town-airship",
    clusterId: "sky-mooring:airship",
    telemetryLabel: "AIRSHIP 07",
    independentMemberMatches: [":blade:"],
    origin: townAirshipPoint(
      TOWN_AIRSHIP.liftA,
      0,
      TOWN_AIRSHIP.liftY,
    ),
    nose: [
      -Math.cos(TOWN_AIRSHIP.heading),
      0,
      -Math.sin(TOWN_AIRSHIP.heading),
    ],
    // Передний конец швартового конуса входит в вертикальный стакан мачты.
    mooringPoint: townAirshipPoint(-1.65, 0, 12.6),
    liftCentre: townAirshipPoint(
      TOWN_AIRSHIP.liftA,
      0,
      TOWN_AIRSHIP.liftY,
    ),
    envelopeMatch: ":gore:",
    supports: [
      townAirshipPoint(3.35, -0.95, 6.88),
      townAirshipPoint(3.35, 0.95, 6.88),
      townAirshipPoint(5.8, -0.95, 6.88),
      townAirshipPoint(5.8, 0.95, 6.88),
      townAirshipPoint(8.25, -0.95, 6.88),
      townAirshipPoint(8.25, 0.95, 6.88),
    ],
    supportFriction: { staticCoefficient: 1.18, dynamicCoefficient: 1.05 },
    hullProbes: townAirshipHullProbes(),
  },
  {
    id: "basalt-sky-ram",
    clusterId: BASALT_SKY_RAM_CLUSTER_ID,
    telemetryLabel: "SKY RAM 01",
    independentMemberMatches: [":gallery:ramp:"],
    origin: BASALT_SKY_RAM_ORIGIN,
    nose: BASALT_SKY_RAM_NOSE,
    mooringPoint: BASALT_SKY_RAM_MOORING_POINT,
    liftCentre: BASALT_SKY_RAM_LIFT_CENTRE,
    envelopeMatch: ":skin:",
    supports: [
      basaltSkyRamPoint(-5.65, -1.1, 4.23),
      basaltSkyRamPoint(-5.65, 1.1, 4.23),
      basaltSkyRamPoint(-3.55, -1.1, 4.23),
      basaltSkyRamPoint(-3.55, 1.1, 4.23),
      basaltSkyRamPoint(3.15, -1.1, 4.23),
      basaltSkyRamPoint(3.15, 1.1, 4.23),
      basaltSkyRamPoint(5.25, -1.1, 4.23),
      basaltSkyRamPoint(5.25, 1.1, 4.23),
    ],
    supportFriction: { staticCoefficient: 0.96, dynamicCoefficient: 0.78 },
    hullProbes: basaltSkyRamHullProbes(),
  },
];

const frameByCluster = new Map(
  vehicleFrames.map((frame) => [frame.clusterId, frame] as const),
);

export function vehicleFrameForCluster(
  clusterId: string,
): VehicleFrameDefinition | null {
  return frameByCluster.get(clusterId) ?? null;
}

export function isVehicleFramePiece(piece: BreakablePieceDefinition): boolean {
  return frameByCluster.has(piece.clusterId);
}

/**
 * Поза кадра: смещение от авторского положения и углы ПО-САМОЛЁТНОМУ, то
 * есть относительно самого корабля, а не мировых осей:
 *   yaw   — разворот вокруг вертикали;
 *   pitch — нос вверх (плюс) или вниз (минус);
 *   roll  — крен, плюс = правый борт вниз.
 * Мина, на которой я уже посидел: у этого корабля продольная ось — мировая
 * X, поэтому «тангаж вокруг X» кренил бы его, а не задирал нос. Оси берутся
 * от носа кадра, а не угадываются.
 */
export interface VehiclePose {
  readonly position: SceneVector3;
  readonly yaw: number;
  readonly pitch: number;
  readonly roll: number;
  /**
   * Готовый поворот. Его отдаёт физика тела: там ориентация живёт
   * кватернионом, и раскладывать её в углы, чтобы тут же собрать обратно,
   * незачем. Если задан — углы игнорируются.
   */
  readonly rotation?: Quaternion;
}

export const RESTING_POSE: VehiclePose = {
  position: [0, 0, 0],
  yaw: 0,
  pitch: 0,
  roll: 0,
};

export function isRestingPose(pose: VehiclePose): boolean {
  if (pose.rotation) {
    const [x, y, z, w] = pose.rotation;
    if (Math.abs(x) + Math.abs(y) + Math.abs(z) > 1e-4 || Math.abs(w) < 0.999999) {
      return false;
    }
  }
  return (
    Math.abs(pose.position[0]) < 1e-4 &&
    Math.abs(pose.position[1]) < 1e-4 &&
    Math.abs(pose.position[2]) < 1e-4 &&
    Math.abs(pose.yaw) < 1e-4 &&
    Math.abs(pose.pitch) < 1e-4 &&
    Math.abs(pose.roll) < 1e-4
  );
}

export type Quaternion = readonly [number, number, number, number];

const IDENTITY: Quaternion = [0, 0, 0, 1];

export function multiplyQuaternions(a: Quaternion, b: Quaternion): Quaternion {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

function aboutAxis(axis: SceneVector3, angle: number): Quaternion {
  const length = Math.hypot(axis[0], axis[1], axis[2]) || 1;
  const half = angle / 2;
  const s = Math.sin(half) / length;
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(half)];
}

/** Ось тангажа корабля: поперечная, она же направление на правый борт. */
export function pitchAxisOf(nose: SceneVector3): SceneVector3 {
  // nose × up, где up = (0, 1, 0). Прибавленный ноль убирает -0: он не влияет
  // на математику, но портит сравнения в тестах.
  return [-nose[2] + 0, 0, nose[0] + 0];
}

/** Longitudinal and transverse inclination in the carrier's own frame. */
export function vehicleAttitude(
  orientation: Quaternion,
  nose: SceneVector3,
): { readonly pitch: number; readonly roll: number } {
  const forward = rotateVector(orientation, nose);
  const forwardLength = Math.hypot(...forward) || 1;
  const starboard = rotateVector(orientation, pitchAxisOf(nose));
  const starboardLength = Math.hypot(...starboard) || 1;
  return {
    pitch: Math.asin(Math.max(-1, Math.min(1, forward[1] / forwardLength))),
    // Positive roll means starboard down, matching VehiclePose and the
    // authored controls. The starboard vector's world Y has the opposite sign.
    roll: -Math.asin(Math.max(-1, Math.min(1, starboard[1] / starboardLength))),
  };
}

/**
 * Values attached to engine points in physical port-to-starboard order.
 * Authoring order is not a side contract: this keeps telemetry and future
 * control panels correct even when engines are rearranged in the model.
 */
export function engineValuesPortToStarboard(
  values: readonly number[],
  enginePoints: readonly SceneVector3[],
  bodyCentre: SceneVector3,
  nose: SceneVector3,
): readonly number[] {
  const starboard = pitchAxisOf(nose);
  const length = Math.hypot(starboard[0], starboard[2]) || 1;
  const sx = starboard[0] / length;
  const sz = starboard[2] / length;
  return enginePoints
    .map((point, index) => ({
      index,
      lateral:
        (point[0] - bodyCentre[0]) * sx +
        (point[2] - bodyCentre[2]) * sz,
    }))
    // Port is negative on the starboard axis, so ascending means L → R.
    .sort((a, b) => a.lateral - b.lateral || a.index - b.index)
    .map(({ index }) => values[index] ?? 0);
}

export interface OarStrokePose {
  /** -1 is the forward catch, +1 is the end of the power stroke. */
  readonly sweep: number;
  /** Negative immerses the blade; positive lifts it for the recovery. */
  readonly lift: number;
  /** 0 keeps the blade square; 1 feathers it through the air. */
  readonly feather: number;
}

/** The visual drive can never outrun or lag behind its delivered command. */
export function advanceDrivePhase(
  phase: number,
  phaseSpeed: number,
  deliveredThrottle: number,
  seconds: number,
): number {
  return phase + phaseSpeed * deliveredThrottle * seconds;
}

/** The berth run-up follows the first leg: a backing route must spool astern. */
export function vehicleSpoolCommand(
  plan: VehicleRoutePlan,
  elapsedSeconds: number,
  spoolSeconds: number,
): number {
  const direction = plan.travelDirection?.(0) ?? 1;
  return direction * 0.42 * Math.min(
    1,
    Math.max(0, elapsedSeconds) / Math.max(0.001, spoolSeconds),
  );
}

/**
 * One honest rowing cycle. The loaded pull occupies more of the cycle than
 * the light recovery; both ends ease into the oarlock instead of snapping.
 */
export function oarStrokePose(phase: number): OarStrokePose {
  const turn = Math.PI * 2;
  const wrapped = ((phase % turn) + turn) % turn;
  const cycle = wrapped / turn;
  const powerShare = 0.62;
  if (cycle < powerShare) {
    const linear = cycle / powerShare;
    const eased = linear * linear * (3 - 2 * linear);
    return {
      sweep: -1 + 2 * eased,
      lift: -Math.sin(Math.PI * linear),
      feather: 0,
    };
  }
  const linear = (cycle - powerShare) / (1 - powerShare);
  const eased = linear * linear * (3 - 2 * linear);
  const arch = Math.sin(Math.PI * linear);
  return {
    sweep: 1 - 2 * eased,
    lift: arch,
    feather: arch,
  };
}

/**
 * Поворот кадра как кватернион: сперва рыскание вокруг мировой вертикали,
 * затем тангаж вокруг поперечной оси корабля, затем крен вокруг его носа —
 * обычная связка самолётных углов, только оси взяты у корпуса.
 */
export function vehicleRotation(
  pose: VehiclePose,
  nose: SceneVector3 = [-1, 0, 0],
): Quaternion {
  if (pose.rotation) {
    return pose.rotation;
  }
  if (pose.yaw === 0 && pose.pitch === 0 && pose.roll === 0) {
    return IDENTITY;
  }
  return multiplyQuaternions(
    multiplyQuaternions(
      aboutAxis([0, 1, 0], pose.yaw),
      aboutAxis(pitchAxisOf(nose), pose.pitch),
    ),
    aboutAxis(nose, pose.roll),
  );
}

export function rotateVector(
  rotation: Quaternion,
  vector: SceneVector3,
): SceneVector3 {
  const [qx, qy, qz, qw] = rotation;
  const [vx, vy, vz] = vector;
  // t = 2 · (q_vec × v); v' = v + q_w · t + q_vec × t
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);
  return [
    vx + qw * tx + qy * tz - qz * ty,
    vy + qw * ty + qz * tx - qx * tz,
    vz + qw * tz + qx * ty - qy * tx,
  ];
}

/** Мировое положение куска при данной позе кадра. */
export function vehiclePiecePosition(
  origin: SceneVector3,
  piecePosition: SceneVector3,
  pose: VehiclePose,
  rotation: Quaternion = vehicleRotation(pose),
): SceneVector3 {
  const local: SceneVector3 = [
    piecePosition[0] - origin[0],
    piecePosition[1] - origin[1],
    piecePosition[2] - origin[2],
  ];
  const turned = rotateVector(rotation, local);
  return [
    origin[0] + turned[0] + pose.position[0],
    origin[1] + turned[1] + pose.position[1],
    origin[2] + turned[2] + pose.position[2],
  ];
}

export interface VehicleMooringState {
  /** Фактическая мировая позиция носового узла. */
  readonly point: SceneVector3;
  /** Смещение узла от его авторской точки захвата в berth pose. */
  readonly offset: SceneVector3;
  /** Мировая скорость узла с учётом вращения корпуса. */
  readonly velocity: SceneVector3;
}

/**
 * Measured nose-capture state. Ground contact is intentionally absent: a
 * vehicle may land anywhere, but it is moored only when this point reaches
 * the authored berth capture.
 */
export function vehicleMooringState(
  frame: Pick<VehicleFrameDefinition, "mooringPoint">,
  bodyOffset: SceneVector3,
  orientation: Quaternion,
  linearVelocity: SceneVector3,
  angularVelocity: SceneVector3,
  bodyCentre: SceneVector3,
): VehicleMooringState {
  const arm = rotateVector(orientation, [
    frame.mooringPoint[0] - bodyCentre[0],
    frame.mooringPoint[1] - bodyCentre[1],
    frame.mooringPoint[2] - bodyCentre[2],
  ]);
  const point: SceneVector3 = [
    bodyCentre[0] + bodyOffset[0] + arm[0],
    bodyCentre[1] + bodyOffset[1] + arm[1],
    bodyCentre[2] + bodyOffset[2] + arm[2],
  ];
  const rotationalVelocity: SceneVector3 = [
    angularVelocity[1] * arm[2] - angularVelocity[2] * arm[1],
    angularVelocity[2] * arm[0] - angularVelocity[0] * arm[2],
    angularVelocity[0] * arm[1] - angularVelocity[1] * arm[0],
  ];
  return {
    point,
    offset: [
      point[0] - frame.mooringPoint[0],
      point[1] - frame.mooringPoint[1],
      point[2] - frame.mooringPoint[2],
    ],
    velocity: [
      linearVelocity[0] + rotationalVelocity[0],
      linearVelocity[1] + rotationalVelocity[1],
      linearVelocity[2] + rotationalVelocity[2],
    ],
  };
}

/** Inverse frame transform used by authored systems attached to a vehicle. */
export function shipLocalPoint(
  point: SceneVector3,
  origin: SceneVector3,
  pose: VehiclePose,
  nose: SceneVector3 = [-1, 0, 0],
): SceneVector3 {
  const rotation = vehicleRotation(pose, nose);
  const inverse: Quaternion = [-rotation[0], -rotation[1], -rotation[2], rotation[3]];
  const turned = rotateVector(inverse, [
    point[0] - origin[0] - pose.position[0],
    point[1] - origin[1] - pose.position[1],
    point[2] - origin[2] - pose.position[2],
  ]);
  return [origin[0] + turned[0], origin[1] + turned[1], origin[2] + turned[2]];
}

function clamp01(value: number): number {
  return value <= 0 ? 0 : value >= 1 ? 1 : value;
}

function clampSigned(value: number): number {
  return value <= -1 ? -1 : value >= 1 ? 1 : value;
}

/**
 * Фазы рейса по времени — только для того, что физика знать не может:
 * когда отдать концы и когда считать швартовку состоявшейся.
 */
export const SKY_TRAIN_FLIGHT = {
  /** Раскрутка винтов на месте. */
  spool: 5,
  /** Отрыв: корабль всплывает выше навеса, ещё не трогаясь. */
  unstick: 6,
} as const;

export const SKY_TRAIN_CASTOFF_TIME = SKY_TRAIN_FLIGHT.spool;

/**
 * Перронные огни отправления. Пока корабль стоит — их нет. Отсчёт
 * отшвартовки они отмигивают, весь рейс горят ровно и гаснут, когда корабль
 * встал в посадочное положение: перрон снова людской.
 */
export const DEPARTURE_LIGHT = {
  /** Яркость свечения стекла: заметно ярче обычного сигнального. */
  glow: 5.2,
  /** Период мигания на отсчёте, с, и какую его долю огонь горит. */
  blinkPeriod: 0.5,
  blinkDuty: 0.55,
} as const;

export interface SkyTrainFlightLifecycle {
  readonly kind: SkyTrainFlightKind;
  readonly time: number;
  readonly castOff: boolean;
  readonly progress: number;
}

/** One journey state drives doors, boards, platform lamps and signals. */
export function skyTrainFlightEventState(
  flight: SkyTrainFlightLifecycle | null,
  recovery: Pick<VehicleRecoveryLifecycle, "phase"> | null = null,
): LampEventState {
  if (recovery) {
    return recovery.phase === "arrival" ? "approach" : "failed";
  }
  if (!flight) {
    return "docked";
  }
  if (!flight.castOff || flight.time < SKY_TRAIN_CASTOFF_TIME) {
    return "attention";
  }
  return skyTrainRoutePhase(flight.kind, flight.progress);
}

export function departureLightGlow(
  state: LampEventState,
  elapsedSeconds = 0,
): number {
  if (state === "docked") {
    return 0;
  }
  if (state === "attention") {
    const phase = (elapsedSeconds % DEPARTURE_LIGHT.blinkPeriod) / DEPARTURE_LIGHT.blinkPeriod;
    return phase < DEPARTURE_LIGHT.blinkDuty ? DEPARTURE_LIGHT.glow : 0;
  }
  // Не гасим огни только потому, что корабль оказался рядом с причалом:
  // физическая швартовка ещё может продолжаться. Они погаснут в тот же кадр,
  // когда рейс завершится и дверь станет доступна.
  return DEPARTURE_LIGHT.glow;
}
export const SKY_TRAIN_UNDERWAY_TIME =
  SKY_TRAIN_FLIGHT.spool + SKY_TRAIN_FLIGHT.unstick;

/**
 * Точка упреждения. Слишком близкая заставляет машину рыскать, слишком
 * далёкая — срезать повороты; для этих скоростей и радиусов вышло примерно
 * сорок метров.
 */
/** Крейсерская дальность упреждения вдоль линии, м. */
export const ROUTE_LOOKAHEAD = 52;
/**
 * На посадочной прямой цель должна быть ближе: так корабль захватывает створ
 * до вокзала, а не идёт параллельно ему до последних метров.
 */
export const APPROACH_LOOKAHEAD = 30;

/**
 * Ход по маршруту — это ПРОЕКЦИЯ корабля на линию, а не таймер и не
 * пройденный путь: так рейс не может «закончиться», пока машина ещё за сто
 * метров, и не застревает, если её снесло с разметки.
 */
export function advanceRouteProgress(
  kind: SkyTrainFlightKind,
  progress: number,
  berth: SceneVector3,
  centre: SceneVector3,
  travelled: number,
): number {
  return advanceVehicleRouteProgress(
    flightPlan(kind, berth),
    progress,
    centre,
    travelled,
  );
}

export function advanceVehicleRouteProgress(
  plan: VehicleRoutePlan,
  progress: number,
  centre: SceneVector3,
  travelled: number,
): number {
  const window = Math.max(0.02, (travelled / plan.length) * 8);
  let nearest = progress;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let step = 0; step <= 24; step += 1) {
    const s = Math.max(0, Math.min(1, progress - 0.004 + (window * step) / 24));
    const point = plan.point(s);
    const distance = Math.hypot(
      point[0] - centre[0],
      point[2] - centre[2],
    );
    if (distance < bestDistance) {
      bestDistance = distance;
      nearest = s;
    }
  }
  return Math.max(progress, nearest);
}

/**
 * Reacquires the nearest feasible part of a route after a disturbance hold.
 * Unlike ordinary progress this may move a little backwards: a displaced
 * craft must fly the line it can actually reach, not chase a stale percentage.
 * The bounded window prevents one coincident loop crossing from skipping an
 * entire circuit.
 */
export function rejoinVehicleRouteProgress(
  plan: VehicleRoutePlan,
  progress: number,
  centre: SceneVector3,
  backwardWindow = 0.04,
  forwardWindow = 0.1,
): number {
  const from = Math.max(0, progress - Math.max(0, backwardWindow));
  const to = Math.min(1, progress + Math.max(0, forwardWindow));
  let nearest = progress;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let sample = 0; sample <= 64; sample += 1) {
    const candidate = from + (to - from) * sample / 64;
    const point = plan.point(candidate);
    const distance = Math.hypot(
      point[0] - centre[0],
      point[1] - centre[1],
      point[2] - centre[2],
    );
    if (distance < bestDistance) {
      bestDistance = distance;
      nearest = candidate;
    }
  }
  return nearest;
}

/** Desired horizontal nose direction at a route position, including sternway. */
export function vehicleRouteHeading(
  plan: VehicleRoutePlan,
  progress: number,
): readonly [number, number] {
  const sample = Math.max(0.001, Math.min(0.012, 5 / Math.max(1, plan.length)));
  const before = plan.point(Math.max(0, progress - sample));
  const after = plan.point(Math.min(1, progress + sample));
  const routeX = after[0] - before[0];
  const routeZ = after[2] - before[2];
  const routeLength = Math.hypot(routeX, routeZ) || 1;
  const travelDirection = plan.travelDirection?.(progress) ?? 1;
  return [
    (routeX / routeLength) * travelDirection,
    (routeZ / routeLength) * travelDirection,
  ];
}

/**
 * Швартовка: трос дотягивается только вблизи и тянет с ограниченной силой.
 * Без обоих ограничений «пружина к причалу» на дальней стороне круга
 * разгоняла бы корабль до сотен метров в секунду.
 */
export const MOORING_REACH = 26;
/** Быстрее этого швартов корабль к причалу не потянет, м/с. */
export const MOORING_SPEED = 1.6;

/**
 * The winch may take the nose only from the authored approach side. Position
 * alone is insufficient: otherwise a craft that overshot the cup could be
 * pulled back by its nose and settle facing exactly backwards.
 */
export function isMooringCaptureEligible(
  captureOffset: SceneVector3,
  orientation: Quaternion,
  nose: SceneVector3 = [-1, 0, 0],
  approach: ApproachGate = SKY_TRAIN_APPROACH,
  reach = MOORING_REACH,
): boolean {
  const forward = rotateVector(orientation, nose);
  const flat = Math.hypot(forward[0], forward[2]) || 1;
  const alignment =
    (forward[0] * approach.heading[0] + forward[2] * approach.heading[1]) / flat;
  return (
    Math.hypot(captureOffset[0], captureOffset[2]) <= reach &&
    alignment >= Math.cos(approach.tolerance.heading)
  );
}

/**
 * Швартовка — это ЛЕБЁДКА, а не пружина: она выбирает слабину с ограниченной
 * скоростью и придерживает корабль, когда тот идёт быстрее. Пружина с
 * ограничением по силе вела себя иначе и неправильно: у причала ограничитель
 * срезал вектор целиком — вместе с демпфером, — и швартов разгонял махину до
 * шести метров в секунду, а потом качал её вокруг причала.
 */
export function mooringForce(
  offset: SceneVector3,
  velocity: SceneVector3,
  mass: number,
  reach = MOORING_REACH,
): SceneVector3 {
  const distance = Math.hypot(offset[0], offset[2]);
  if (distance > reach || distance < 1e-4) {
    return [0, 0, 0];
  }
  // Подходим тем медленнее, чем ближе: у самого причала скорость сходит в нуль.
  const closing = Math.min(MOORING_SPEED, distance * 0.25);
  const wanted: SceneVector3 = [
    (-offset[0] / distance) * closing,
    0,
    (-offset[2] / distance) * closing,
  ];
  // Сервопривод по скорости: тянет, если отстаём, и держит, если разогнались.
  const gain = 0.6;
  const pull: SceneVector3 = [
    mass * (wanted[0] - velocity[0]) * gain,
    0,
    mass * (wanted[2] - velocity[2]) * gain,
  ];
  const limit = 0.35 * mass * 9.81;
  const magnitude = Math.hypot(pull[0], pull[2]);
  if (magnitude <= limit) {
    return pull;
  }
  const scale = limit / magnitude;
  return [pull[0] * scale, 0, pull[2] * scale];
}

/**
 * ПАСПОРТ МАШИНЫ. Что она физически может: тяга каждого мотора, сила на
 * оперении, пределы дифферентовки подъёма и точки приложения всего этого.
 */
export interface ShipLimits {
  /** Тяга ОДНОГО мотора, Н. */
  readonly enginePower: number;
  /** Точки моторов в авторских координатах. */
  readonly enginePoints: readonly SceneVector3[];
  /**
   * Боковая сила на оперении при опорной скорости. Перо руля работает
   * скоростным напором: сила падает как квадрат скорости, и на подходе, когда
   * корабль почти стоит, руля у него практически нет — доворачивать надо
   * моторами. Ровно так это и устроено на настоящих судах.
   */
  readonly maxRudderForce: number;
  readonly rudderReferenceSpeed: number;
  readonly rudderPoint: SceneVector3;
  /** Пределы дифферентовки подъёма: ±доля веса. */
  readonly liftTrimRange: number;
}

export const SKY_TRAIN_LIMITS: ShipLimits = {
  // Машина тяжёлая и тихоходная: полная тяга на её массу даёт разгон в
  // десятые доли g — ровно то, что имелось в виду под «с каким моментом
  // такая махина способна двигаться».
  enginePower: 450,
  enginePoints: [
    [5.6, 7.6, 73.0],
    [5.6, 7.6, 82.2],
  ],
  /**
   * Оперение. Замерено по машине: при её моменте инерции и сопротивлении
   * такая сила даёт установившийся разворот около 0.3 рад/с — втрое больше
   * потребного для собственного круга, и это правильный запас. Стояло 900 Н,
   * то есть авторитет был завышен ВОСЕМЬКРАТНО: любая ошибка выбирала руль до
   * упора, и корабль вилял хвостом, почти не продвигаясь.
   */
  maxRudderForce: 300,
  /** Скорость, на которой оперение развивает полную силу — её крейсерская. */
  rudderReferenceSpeed: 7,
  rudderPoint: [19.5, 9.4, 77.6],
  liftTrimRange: 0.12,
};

/**
 * РЫЧАГИ. Положение органов управления — и всё; ни маршрута, ни решений тут
 * нет. Автоматика их двигает сейчас, игрок будет двигать потом: логика ниже
 * по течению от этого места не изменится.
 */
export interface ShipControls {
  /** Тяга каждого мотора, −1..1. Разные знаки дают разворот почти на месте. */
  readonly throttle: readonly number[];
  /** Руль, −1..1. */
  readonly rudder: number;
  /** Дифферентовка подъёма, −1..1 от предела. */
  readonly liftTrim: number;
}

export const IDLE_CONTROLS: ShipControls = { throttle: [0, 0], rudder: 0, liftTrim: 0 };

export interface ForceAtPoint {
  readonly force: SceneVector3;
  readonly point: SceneVector3;
}

/**
 * МАШИНА. Превращает положение рычагов в силы. Никаких решений: сколько дали,
 * столько и тянет. Моторы разнесены по бортам, поэтому разная тяга сама даёт
 * разворот, а потерянный мотор сам даёт увод.
 */
/**
 * Доля силы оперения, доступная на этом ходу: скоростной напор ∝ v².
 * На малом ходу руля почти нет — и это не условность, а то, почему
 * причаливают моторами и швартовами, а не рулём.
 */
export function rudderEffectiveness(speed: number, limits: ShipLimits): number {
  const ratio = speed / Math.max(0.1, limits.rudderReferenceSpeed);
  return Math.max(0, Math.min(1, ratio * ratio));
}

export function shipForces(
  controls: ShipControls,
  centre: SceneVector3,
  /**
   * Центр масс в АВТОРСКИХ координатах: плечи считаются от него. Если брать
   * текущий мировой центр, на дальней стороне круга плечо станет в сотню
   * метров и корабль кувыркнётся от собственной тяги.
   */
  bodyCentre: SceneVector3,
  orientation: Quaternion,
  limits: ShipLimits,
  nose: SceneVector3,
  /** Путевая скорость: от неё зависит, сколько силы даёт оперение. */
  groundSpeed = limits.rudderReferenceSpeed,
): readonly ForceAtPoint[] {
  const forward = rotateVector(orientation, nose);
  const flatLength = Math.hypot(forward[0], forward[2]) || 1;
  const heading: readonly [number, number] = [forward[0] / flatLength, forward[2] / flatLength];

  const place = (point: SceneVector3): SceneVector3 => {
    const arm = rotateVector(orientation, [
      point[0] - bodyCentre[0],
      point[1] - bodyCentre[1],
      point[2] - bodyCentre[2],
    ]);
    return [centre[0] + arm[0], centre[1] + arm[1], centre[2] + arm[2]];
  };

  const forces: ForceAtPoint[] = limits.enginePoints.map((point, index) => {
    const power = limits.enginePower * clampSigned(controls.throttle[index] ?? 0);
    return {
      force: [forward[0] * power, forward[1] * power, forward[2] * power],
      point: place(point),
    };
  });

  // Руль в корме: направление подобрано так, чтобы момент относительно центра
  // масс совпал по знаку с командой. Знак здесь дважды был перепутан, и одна
  // ошибка маскировала другую.
  const side =
    Math.max(-1, Math.min(1, controls.rudder)) *
    limits.maxRudderForce *
    rudderEffectiveness(groundSpeed, limits);
  const push: readonly [number, number, number] = [-heading[1], 0, heading[0]];
  forces.push({
    force: [push[0] * side, 0, push[2] * side],
    point: place(limits.rudderPoint),
  });

  return forces;
}

/**
 * МАРШРУТ. Линия, разрешённая скорость на участке и требуемая высота с
 * допуском. Больше в задании ничего нет — ни углов, ни качки.
 */
/**
 * ЧТО АВТОПИЛОТ ЗНАЕТ О МАШИНЕ. Не захардкожено в его коде, а передано ему:
 * масса, момент инерции по рысканию, сопротивление среды и паспорт органов
 * управления. По этим числам он и предсказывает, где окажется.
 */
export interface ShipModel {
  readonly mass: number;
  readonly inertiaYaw: number;
  /** Центр масс в тех же авторских координатах, что точки органов управления. */
  readonly bodyCentre: SceneVector3;
  /** Сопротивление ВДОЛЬ корпуса. */
  readonly dragLinear: number;
  /** Сопротивление ПОПЕРЁК корпуса — оно и заставляет судно идти носом. */
  readonly dragLateral: number;
  readonly dragAngular: number;
  readonly limits: ShipLimits;
  /** Authority estimated by autopilot from its previous request and delivery. */
  readonly engineAvailability?: readonly number[];
}

/**
 * Autopilot control allocation for any number of longitudinal engines.
 *
 * Start from the common delivered thrust needed for speed, then make the
 * smallest possible per-engine correction that produces the requested yaw
 * moment inside each engine's actual authority. The result is a signed shaft
 * command; the actuator layer only executes it and never reallocates it.
 */
export function allocateAutopilotEngineCommands(
  commonThrust: number,
  targetYawMomentPerPower: number,
  yawArms: readonly number[],
  availability: readonly number[] = yawArms.map(() => 1),
): readonly number[] {
  const count = yawArms.length;
  const fractions = Array.from({ length: count }, (_, index) =>
    clamp01(availability[index] ?? 1));
  const delivered = fractions.map((fraction) =>
    Math.max(-fraction, Math.min(fraction, clampSigned(commonThrust))));
  const free = new Set(
    fractions.map((fraction, index) => fraction > 1e-6 ? index : -1)
      .filter((index) => index >= 0),
  );

  for (let iteration = 0; iteration <= count; iteration += 1) {
    const currentMoment = delivered.reduce(
      (sum, value, index) => sum + value * (yawArms[index] ?? 0),
      0,
    );
    const residual = targetYawMomentPerPower - currentMoment;
    if (Math.abs(residual) < 1e-7 || free.size === 0) {
      break;
    }
    const denominator = [...free].reduce(
      (sum, index) => sum + (yawArms[index] ?? 0) ** 2,
      0,
    );
    if (denominator < 1e-9) {
      break;
    }
    const proposals = new Map<number, number>();
    const saturated: number[] = [];
    for (const index of free) {
      const proposal = delivered[index] +
        residual * (yawArms[index] ?? 0) / denominator;
      proposals.set(index, proposal);
      if (Math.abs(proposal) > fractions[index] + 1e-9) {
        saturated.push(index);
      }
    }
    if (saturated.length === 0) {
      for (const [index, proposal] of proposals) {
        delivered[index] = proposal;
      }
      break;
    }
    for (const index of saturated) {
      delivered[index] = Math.max(
        -fractions[index],
        Math.min(fractions[index], proposals.get(index) ?? delivered[index]),
      );
      free.delete(index);
    }
  }

  // The requested yaw moment is now fixed. Inside that solution space, move
  // total delivered thrust as close as possible to the speed controller's
  // request. Corrections are projected onto the null-space of the authored
  // yaw arms, so improving speed can never silently undo heading control.
  const targetTotal = Math.max(
    -fractions.reduce((sum, fraction) => sum + fraction, 0),
    Math.min(
      fractions.reduce((sum, fraction) => sum + fraction, 0),
      clampSigned(commonThrust) * count,
    ),
  );
  const totalFree = new Set(fractions.map((_, index) => index));
  for (let iteration = 0; iteration <= count; iteration += 1) {
    const residualTotal = targetTotal - delivered.reduce(
      (sum, value) => sum + value,
      0,
    );
    if (Math.abs(residualTotal) < 1e-7 || totalFree.size < 2) {
      break;
    }
    const freeIndices = [...totalFree];
    const armSum = freeIndices.reduce(
      (sum, index) => sum + (yawArms[index] ?? 0),
      0,
    );
    const armSquared = freeIndices.reduce(
      (sum, index) => sum + (yawArms[index] ?? 0) ** 2,
      0,
    );
    const direction = new Map<number, number>();
    for (const index of freeIndices) {
      const arm = yawArms[index] ?? 0;
      direction.set(
        index,
        armSquared > 1e-9 ? 1 - arm * armSum / armSquared : 1,
      );
    }
    const totalDirection = freeIndices.reduce(
      (sum, index) => sum + (direction.get(index) ?? 0),
      0,
    );
    if (Math.abs(totalDirection) < 1e-9) {
      break;
    }
    const fullScale = residualTotal / totalDirection;
    let stepFraction = 1;
    const saturated: number[] = [];
    for (const index of freeIndices) {
      const delta = fullScale * (direction.get(index) ?? 0);
      if (Math.abs(delta) < 1e-12) {
        continue;
      }
      const room = delta > 0
        ? fractions[index] - delivered[index]
        : delivered[index] + fractions[index];
      stepFraction = Math.min(
        stepFraction,
        Math.max(0, room / Math.abs(delta)),
      );
    }
    const appliedScale = fullScale * stepFraction;
    for (const index of freeIndices) {
      delivered[index] += appliedScale * (direction.get(index) ?? 0);
      if (
        Math.abs(Math.abs(delivered[index]) - fractions[index]) < 1e-7
      ) {
        saturated.push(index);
      }
    }
    if (stepFraction >= 1 - 1e-9) {
      break;
    }
    for (const index of saturated) {
      totalFree.delete(index);
    }
    if (saturated.length === 0) {
      break;
    }
  }

  return delivered.map((value, index) =>
    fractions[index] > 1e-6 ? clampSigned(value / fractions[index]) : 0);
}

/**
 * Differential yaw authority that does not create unwanted net thrust.
 * Pairing the lowest and highest authored yaw arms keeps this generic for any
 * engine count and prevents one unusually strong shaft from masquerading as
 * extra turning authority by pushing the whole craft along the route.
 */
export function balancedEngineYawAuthority(
  yawArms: readonly number[],
  availability: readonly number[] = yawArms.map(() => 1),
): number {
  const channels = yawArms.map((arm, index) => ({
    arm,
    remaining: clamp01(availability[index] ?? 1),
  })).sort((left, right) => left.arm - right.arm);
  let low = 0;
  let high = channels.length - 1;
  let moment = 0;
  while (low < high) {
    const transfer = Math.min(
      channels[low].remaining,
      channels[high].remaining,
    );
    if (transfer <= 1e-9) {
      if (channels[low].remaining <= 1e-9) {
        low += 1;
      }
      if (channels[high].remaining <= 1e-9) {
        high -= 1;
      }
      continue;
    }
    moment += transfer * (channels[high].arm - channels[low].arm);
    channels[low].remaining -= transfer;
    channels[high].remaining -= transfer;
  }
  return moment;
}

/**
 * Сопротивление корпуса. Оно АНИЗОТРОПНО, и без этого весь полёт был
 * неправильным: корабль разворачивал нос, а скорость шла прежним курсом —
 * он крабился боком и «въезжал в платформу лагом». Дирижабль поперёк себя
 * почти не движется: боковое сопротивление в разы больше продольного.
 */
export function hullDrag(
  velocity: SceneVector3,
  heading: readonly [number, number],
  model: ShipModel,
): SceneVector3 {
  const along = velocity[0] * heading[0] + velocity[2] * heading[1];
  const alongX = heading[0] * along;
  const alongZ = heading[1] * along;
  const crossX = velocity[0] - alongX;
  const crossZ = velocity[2] - alongZ;
  return [
    -model.dragLinear * alongX - model.dragLateral * crossX,
    -model.dragLinear * velocity[1],
    -model.dragLinear * alongZ - model.dragLateral * crossZ,
  ];
}

/**
 * ОКНО ЗАХВАТА. Прийти «в зону» мало: в неё надо прийти в определённом
 * положении — по месту, по курсу и по скорости. Не уложился — уходишь на
 * второй круг, как и положено при промахе на заходе.
 */
export interface ApproachGate {
  /** Требуемый курс на входе, единичный вектор в плане. */
  readonly heading: readonly [number, number];
  readonly tolerance: {
    readonly position: number;
    readonly heading: number;
    readonly speed: number;
  };
}

export const SKY_TRAIN_APPROACH: ApproachGate = {
  // Причал лежит вдоль пути, нос корабля в покое смотрит на −x.
  heading: [-1, 0],
  // Допуск по скорости согласован с профилем торможения: на входе в окно
  // машина идёт примерно sqrt(2·a·s), и требовать меньше — значит гарантировать
  // вечный второй круг.
  tolerance: { position: 6, heading: 0.35, speed: 4.5 },
};

/**
 * Эксплуатационный допуск швартовки. Это не математический ноль и не датчик
 * конкретной опоры: длинный мягкий корабль считается принятым, когда он
 * устойчиво находится в посадочной позе и уже не несёт заметной энергии.
 */
export const SKY_TRAIN_DOCKING = {
  position: 0.6,
  height: 0.25,
  headingCos: 0.99,
  speed: 0.2,
  verticalSpeed: 0.12,
  uprightCos: 0.99,
  angularSpeed: 0.035,
} as const;

export interface DockingTolerance {
  readonly position: number;
  readonly height: number;
  readonly headingCos: number;
  readonly speed: number;
  readonly verticalSpeed: number;
  readonly uprightCos: number;
  readonly angularSpeed: number;
}

/**
 * A vehicle enters the settling timeout only after its nose point has entered
 * the berth capture. This is deliberately wider than the completed mooring,
 * but excludes both the approach and any ground-landing manoeuvre.
 */
export function isDockingSettleWindow(
  progress: number,
  captureOffset: SceneVector3,
  orientation: Quaternion,
  nose: SceneVector3 = [-1, 0, 0],
  approach: ApproachGate = SKY_TRAIN_APPROACH,
  tolerance: DockingTolerance = SKY_TRAIN_DOCKING,
): boolean {
  if (progress <= 0.985) {
    return false;
  }
  const forward = rotateVector(orientation, nose);
  const up = rotateVector(orientation, [0, 1, 0]);
  const flat = Math.hypot(forward[0], forward[2]) || 1;
  const alignment =
    (forward[0] * approach.heading[0] + forward[2] * approach.heading[1]) / flat;
  // Start the failure timer only after the craft enters the actual capture
  // around its own completed-pose tolerance. A fixed 1.5 m circle started the
  // city's ten-second timer 10.57 s before its soft mooring reached 0.48 m,
  // so a healthy airship was declared failed half a second before docking.
  const capturePosition = tolerance.position * 1.75;
  return (
    Math.hypot(captureOffset[0], captureOffset[2]) < capturePosition &&
    Math.abs(captureOffset[1]) < Math.max(0.5, tolerance.height * 3) &&
    alignment > 0.97 &&
    up[1] > 0.97
  );
}

/**
 * Требование к захваченному носовому узлу, отдельно от маршрута и автопилота.
 * Никакого переноса в ноль здесь нет: функция только измеряет результат сил.
 */
export function isDockedPose(
  captureOffset: SceneVector3,
  orientation: Quaternion,
  captureVelocity: SceneVector3,
  angularVelocity: SceneVector3,
  nose: SceneVector3 = [-1, 0, 0],
  approach: ApproachGate = SKY_TRAIN_APPROACH,
  tolerance: DockingTolerance = SKY_TRAIN_DOCKING,
): boolean {
  const forward = rotateVector(orientation, nose);
  const up = rotateVector(orientation, [0, 1, 0]);
  const flat = Math.hypot(forward[0], forward[2]) || 1;
  const alignment =
    (forward[0] * approach.heading[0] + forward[2] * approach.heading[1]) / flat;
  return (
    Math.hypot(captureOffset[0], captureOffset[2]) < tolerance.position &&
    Math.abs(captureOffset[1]) < tolerance.height &&
    alignment > tolerance.headingCos &&
    Math.hypot(captureVelocity[0], captureVelocity[2]) < tolerance.speed &&
    Math.abs(captureVelocity[1]) < tolerance.verticalSpeed &&
    up[1] > tolerance.uprightCos &&
    Math.hypot(...angularVelocity) < tolerance.angularSpeed
  );
}

/**
 * Route completion is accepted only after the measured nose capture has
 * settled. A ground support hit is deliberately absent: landing on terrain
 * and mooring to a berth are separate physical events.
 */
export function isDockingComplete(
  progress: number,
  captureOffset: SceneVector3,
  orientation: Quaternion,
  captureVelocity: SceneVector3,
  angularVelocity: SceneVector3,
  nose: SceneVector3 = [-1, 0, 0],
  approach: ApproachGate = SKY_TRAIN_APPROACH,
  tolerance: DockingTolerance = SKY_TRAIN_DOCKING,
): boolean {
  return progress > 0.985 && isDockedPose(
    captureOffset,
    orientation,
    captureVelocity,
    angularVelocity,
    nose,
    approach,
    tolerance,
  );
}

/**
 * Куда корабль придёт через `horizon` секунд, если ничего не менять. Считаем
 * плоскую модель — ход, снос и рыскание: этого хватает, чтобы вести машину
 * с упреждением, а не догонять собственную ошибку.
 */
export function predictShip(
  centre: SceneVector3,
  heading: readonly [number, number],
  velocity: SceneVector3,
  yawRate: number,
  controls: ShipControls,
  model: ShipModel,
  horizon: number,
  nose: SceneVector3 = [-1, 0, 0],
): { position: readonly [number, number]; heading: readonly [number, number] } {
  const steps = 8;
  const dt = horizon / steps;
  let x = centre[0];
  let z = centre[2];
  let vx = velocity[0];
  let vz = velocity[2];
  let hx = heading[0];
  let hz = heading[1];
  let omega = yawRate;
  const localNoseLength = Math.hypot(nose[0], nose[2]) || 1;
  const localNose: readonly [number, number] = [
    nose[0] / localNoseLength,
    nose[2] / localNoseLength,
  ];
  const yawArm = (
    point: SceneVector3,
    direction: readonly [number, number],
  ): number => {
    const rx = point[0] - model.bodyCentre[0];
    const rz = point[2] - model.bodyCentre[2];
    return rz * direction[0] - rx * direction[1];
  };
  const engineCommands = model.limits.enginePoints.map((_, index) =>
    clampSigned(controls.throttle[index] ?? 0));
  const engineYawArms = model.limits.enginePoints.map((point) =>
    yawArm(point, localNose));
  const thrust =
    model.limits.enginePower * engineCommands.reduce((sum, value) => sum + value, 0);
  const engineMoment = model.limits.enginePower * engineCommands.reduce(
    (sum, value, index) => sum + value * engineYawArms[index],
    0,
  );
  const rudderCommand = Math.max(-1, Math.min(1, controls.rudder));
  const localRudderDirection: readonly [number, number] = [-localNose[1], localNose[0]];
  const rudderArm = yawArm(model.limits.rudderPoint, localRudderDirection);

  for (let step = 0; step < steps; step += 1) {
    const drag = hullDrag([vx, 0, vz], [hx, hz], model);
    const ax = (thrust * hx + drag[0]) / model.mass;
    const az = (thrust * hz + drag[2]) / model.mass;
    vx += ax * dt;
    vz += az * dt;
    x += vx * dt;
    z += vz * dt;
    // Перо руля слабеет вместе с ходом — предсказание обязано это учитывать,
    // иначе автопилот верит в доворот, которого на подходе уже не будет.
    const rudder =
      rudderCommand *
      model.limits.maxRudderForce *
      rudderEffectiveness(Math.hypot(vx, vz), model.limits);
    const moment = engineMoment + rudder * rudderArm - model.dragAngular * omega;
    omega += (moment / model.inertiaYaw) * dt;
    const turn = omega * dt;
    const nx = hx * Math.cos(turn) - hz * Math.sin(turn);
    const nz = hx * Math.sin(turn) + hz * Math.cos(turn);
    const length = Math.hypot(nx, nz) || 1;
    hx = nx / length;
    hz = nz / length;
  }
  return { position: [x, z], heading: [hx, hz] };
}

/** Что автопилот доложил о себе: рычаги плюс то, что нужно успокоению. */
export interface AutopilotOutput {
  readonly controls: ShipControls;
  /** Угловая скорость, которую машина сейчас держит в развороте. */
  readonly desiredYawRate: number;
  /** Заход не сложился: в окно захвата не попадаем, идём на второй круг. */
  readonly goAround: boolean;
}

/**
 * АВТОПИЛОТ. Читает маршрут и состояние корабля — двигает рычаги. Ровно на
 * это место потом встанет игрок: ниже по течению ничего не изменится.
 */
export function autopilot(
  plan: VehicleRoutePlan,
  progress: number,
  centre: SceneVector3,
  orientation: Quaternion,
  velocity: SceneVector3,
  angularVelocity: SceneVector3,
  model: ShipModel,
  /** Разгон после отрыва, 0..1 — по времени, а не по ходу. */
  startRamp = 1,
  nose: SceneVector3 = [-1, 0, 0],
  approach: ApproachGate = SKY_TRAIN_APPROACH,
  safety: VehicleSafetyAdvisory | null = null,
): AutopilotOutput {
  const limits = model.limits;
  const forward = rotateVector(orientation, nose);
  const flatLength = Math.hypot(forward[0], forward[2]) || 1;
  const heading: readonly [number, number] = [forward[0] / flatLength, forward[2] / flatLength];
  const groundSpeed = Math.hypot(velocity[0], velocity[2]);

  // Смотрим ВПЕРЁД: где мы окажемся через несколько секунд, если ничего не
  // менять. Вести машину надо от предсказанной ошибки, а не от текущей, —
  // иначе она вечно догоняет себя и приходит в зону боком.
  const horizon = Math.max(2, Math.min(3.5, groundSpeed * 0.4));
  const guess = predictShip(
    centre,
    heading,
    velocity,
    angularVelocity[1],
    IDLE_CONTROLS,
    model,
    horizon,
    nose,
  );

  // Заход — это створ, а не «последние проценты»: с этого места маршрут уже
  // прямая на причал, и корабль должен идти по ней, не разворачиваясь.
  const onApproach = progress >= plan.finalFrom;
  const berthPoint = plan.point(1);
  const berthDistance = Math.hypot(
    centre[0] - berthPoint[0],
    centre[2] - berthPoint[2],
  );

  // На всём маршруте, включая посадочную прямую, ведём на следующую точку
  // самой линии. Целью захода раньше сразу становился причал: корабль резал
  // створ по диагонали и физическая швартовка потом дотягивала его боком.
  const routeLookahead = plan.guidanceLookahead?.(progress) ?? ROUTE_LOOKAHEAD;
  const guidanceProgress = Math.min(
    1,
    progress + (onApproach ? APPROACH_LOOKAHEAD : routeLookahead) / plan.length,
  );
  const routeHere = plan.point(progress);
  const aim = plan.point(guidanceProgress);
  const segmentX = aim[0] - routeHere[0];
  const segmentZ = aim[2] - routeHere[2];
  const segmentLength = Math.hypot(segmentX, segmentZ) || 1;
  const tangentX = segmentX / segmentLength;
  const tangentZ = segmentZ / segmentLength;
  const errorX = routeHere[0] - guess.position[0];
  const errorZ = routeHere[2] - guess.position[1];
  const alongError = errorX * tangentX + errorZ * tangentZ;
  const lateralErrorX = errorX - tangentX * alongError;
  const lateralErrorZ = errorZ - tangentZ * alongError;
  // Длинное упреждение успокаивает курс, но само по себе срезает дугу.
  // Усиливаем только ПОПЕРЕЧНУЮ поправку к ближайшей точке, не заставляя
  // судно догонять ход маршрута. Так оно держит линию и не рыскает.
  const CROSS_TRACK_GAIN = 1.2;
  const toAim = [
    aim[0] - guess.position[0] + lateralErrorX * (CROSS_TRACK_GAIN - 1),
    aim[2] - guess.position[1] + lateralErrorZ * (CROSS_TRACK_GAIN - 1),
  ] as const;
  const reach = Math.hypot(toAim[0], toAim[1]) || 1;
  let wanted: readonly [number, number] = [toAim[0] / reach, toAim[1] / reach];
  const travelDirection = plan.travelDirection?.(progress) ?? 1;
  if (travelDirection < 0) {
    // The path still points where the centre must travel; reversing changes
    // only which end of the craft faces that tangent. Motors remain the sole
    // source of the actual backwards motion.
    wanted = [-wanted[0], -wanted[1]];
  }
  if (onApproach) {
    // На оси причала последние метры — уже не навигация к точке, а
    // швартовочное положение. Подмешиваем требуемый курс только после
    // захвата створа: если сделать это при большом боковом сносе, корабль
    // пойдёт параллельно перрону и никогда не вернётся на линию.
    const finalOffsetX = centre[0] - berthPoint[0];
    const finalOffsetZ = centre[2] - berthPoint[2];
    const finalCrossTrack = Math.abs(
      finalOffsetX * approach.heading[1] - finalOffsetZ * approach.heading[0],
    );
    const positionBlend = clamp01(1 - berthDistance / 35);
    // Do not freeze onto the berth heading while still visibly off its axis.
    // The old four-metre blend traded away cross-track correction too early;
    // a fast, physically flown glide could then keep 1–2 m of lateral error
    // all the way to the platform. Heading hold takes over only after the
    // centreline is genuinely captured.
    const captureBlend = clamp01(1 - finalCrossTrack / 1.5);
    // Once the route is effectively complete and the craft has lost way, it
    // must still ask for the authored berth heading. Otherwise a small
    // cross-track error makes it turn sideways toward the centre point while
    // the zero endpoint speed leaves no translation to correct that error;
    // a real nose capture can then never engage. Differential thrust performs
    // the turn, after which the near-mast winch can finish the translation.
    const settleHeadingBlend = progress > 0.985 && groundSpeed < 1 ? 1 : 0;
    const blend = Math.max(positionBlend * captureBlend, settleHeadingBlend);
    const mixX = wanted[0] * (1 - blend) + approach.heading[0] * blend;
    const mixZ = wanted[1] * (1 - blend) + approach.heading[1] * blend;
    const mixLength = Math.hypot(mixX, mixZ) || 1;
    wanted = [mixX / mixLength, mixZ / mixLength];
  }

  const turn = guess.heading[1] * wanted[0] - guess.heading[0] * wanted[1];
  const facing = guess.heading[0] * wanted[0] + guess.heading[1] * wanted[1];
  const bearingError = Math.atan2(turn, facing);
  // Просить у машины больше, чем она может держать, — верный путь к вилянию:
  // руль выбирается до упора и работает как переключатель. Ограничиваем
  // задание тем, что даёт установившийся разворот при полном руле.
  const localNoseLength = Math.hypot(nose[0], nose[2]) || 1;
  const localNose: readonly [number, number] = [
    nose[0] / localNoseLength,
    nose[2] / localNoseLength,
  ];
  const yawArm = (
    point: SceneVector3,
    direction: readonly [number, number],
  ): number => {
    const rx = point[0] - model.bodyCentre[0];
    const rz = point[2] - model.bodyCentre[2];
    return rz * direction[0] - rx * direction[1];
  };
  const localRudderDirection: readonly [number, number] = [-localNose[1], localNose[0]];
  const rudderArm = Math.abs(yawArm(limits.rudderPoint, localRudderDirection));
  const engineYawArms = limits.enginePoints.map((point) => yawArm(point, localNose));
  const authority = rudderEffectiveness(groundSpeed, limits);
  const rudderCapacity = limits.maxRudderForce * authority * rudderArm;
  const availableEngineYawCapacity = limits.enginePower *
    balancedEngineYawAuthority(
      engineYawArms,
      model.engineAvailability,
    );
  const holdableYawRate =
    (rudderCapacity + availableEngineYawCapacity) /
    Math.max(1, model.dragAngular);
  // Геометрия pure pursuit: хорда остаётся конечной даже на точном маршруте,
  // поэтому кривизна не скачет от малой ошибки предсказания.
  // Pure pursuit has a real singularity at a half-turn: sin(PI) is zero, so
  // a craft that has just finished backing out would never ask for the pivot
  // needed to leave forwards. At manoeuvring speed, use the signed bearing
  // itself until the target returns to the forward hemisphere. Differential
  // thrust and the rudder still create every newton of the turn.
  const pursuit =
    Math.abs(bearingError) > Math.PI / 2 && groundSpeed < 4
      ? bearingError / 3
      : (2 * Math.max(groundSpeed, 1.5) * Math.sin(bearingError)) /
        Math.max(20, reach);
  const desiredYawRate = Math.max(-holdableYawRate, Math.min(holdableYawRate, pursuit));
  // Запрашиваем МОМЕНТ, а не безразмерный «поворот». Сначала его даёт руль
  // (он ничего не стоит по продольной тяге), остаток — двигатели вразнос.
  const wantedYawAcceleration = (desiredYawRate - angularVelocity[1]) / 3;
  const wantedYawMoment =
    model.dragAngular * desiredYawRate + model.inertiaYaw * wantedYawAcceleration;
  const rudderMoment = Math.max(
    -rudderCapacity,
    Math.min(rudderCapacity, wantedYawMoment),
  );
  const signedRudderCapacity =
    limits.maxRudderForce * authority * yawArm(limits.rudderPoint, localRudderDirection);
  const rudder = Math.abs(signedRudderCapacity) > 1e-6
    ? rudderMoment / signedRudderCapacity
    : 0;

  // Тяга: держим разрешённую скорость участка, считая по ПРЕДСКАЗАННОМУ
  // ходу — иначе на торможении машина проскакивает.
  const speedAlong = velocity[0] * heading[0] + velocity[2] * heading[1];
  // До посадочной прямой близость к причалу ничего не означает: замкнутая
  // линия проходит рядом с ним и в середине рейса. Старый регулятор видел
  // малое евклидово расстояние и внезапно включал реверс прямо на круге.
  const braking = onApproach
    ? Math.max(0, speedAlong * speedAlong) / (2 * Math.max(1, berthDistance))
    : 0;
  const routeAllowed = onApproach
    ? Math.min(
        plan.speedLimit(progress),
        Math.max(0.8, Math.sqrt(2 * 0.35 * berthDistance)),
      )
    : plan.speedLimit(progress);
  const safetyIntervention = safety?.risk === "intervention";
  const allowed = safetyIntervention
    ? Math.min(routeAllowed, safety?.maximumSpeed ?? routeAllowed)
    : routeAllowed;
  const wantedSpeed = allowed * clamp01(startRamp) * travelDirection;
  // Реверс — настоящий орган управления: на торможении оба мотора могут дать
  // задний ход, а на малой скорости один работает вперёд, второй назад. Это
  // разворачивает судно без обязательного продвижения боком или вперёд.
  const base = Math.max(
    safetyIntervention ? -1 : -0.45,
    Math.min(1, (wantedSpeed - speedAlong - braking * 0.15) * 0.22),
  );
  const engineMoment = wantedYawMoment - rudderMoment;
  const throttle = allocateAutopilotEngineCommands(
    base,
    limits.enginePower > 1e-6 ? engineMoment / limits.enginePower : 0,
    engineYawArms,
    model.engineAvailability,
  );

  // Высота — тоже рычаг: подъём поддувают или стравливают.
  const altitudeError =
    plan.altitude(progress) +
    (safetyIntervention ? safety?.altitudeOffset ?? 0 : 0) -
    centre[1];
  const liftTrim = Math.max(
    -1,
    Math.min(1, (altitudeError * 0.06 - velocity[1] * 0.12) / limits.liftTrimRange),
  );

  // Промах на заходе: не по месту, не по курсу или не по скорости — уходим на
  // второй круг. Домучивать посадку боком нельзя.
  // Окно захвата проверяется на ВХОДЕ в него и по предсказанному положению:
  // важно не то, как машина стоит сейчас, а как она будет стоять, когда
  // окажется у причала.
  // В зоне мы или нет — вопрос о том, где корабль СЕЙЧАС; а вот в каком он
  // будет положении — о том, где он ОКАЖЕТСЯ.
  const routeSample = Math.max(0.001, Math.min(0.012, 5 / Math.max(1, plan.length)));
  const routeBefore = plan.point(Math.max(0, progress - routeSample));
  const routeAfter = plan.point(Math.min(1, progress + routeSample));
  const routeDx = routeAfter[0] - routeBefore[0];
  const routeDz = routeAfter[2] - routeBefore[2];
  const routeLength = Math.hypot(routeDx, routeDz) || 1;
  const routeTangentX = routeDx / routeLength;
  const routeTangentZ = routeDz / routeLength;
  const offsetX = centre[0] - routeHere[0];
  const offsetZ = centre[2] - routeHere[2];
  const crossTrack = Math.abs(offsetX * routeTangentZ - offsetZ * routeTangentX);
  let goAround = false;
  if (onApproach && berthDistance < approach.tolerance.position * 2.5) {
    const headingOff = Math.acos(
      Math.max(
        -1,
        Math.min(
          1,
          guess.heading[0] * approach.heading[0] + guess.heading[1] * approach.heading[1],
        ),
      ),
    );
    goAround =
      crossTrack > approach.tolerance.position ||
      headingOff > approach.tolerance.heading ||
      groundSpeed > approach.tolerance.speed;
  }

  return { controls: { throttle, rudder, liftTrim }, desiredYawRate, goAround };
}

/**
 * Место посадки на облёт: у самого носа головного вагона, изнутри салона.
 */
export const SKY_TRAIN_RIDE_POST: SceneVector3 = [-6.2, 2.2, 77.6];
export const RIDE_APPROACH_RADIUS = 2.4;
export const RIDE_RELEASE_RADIUS = 3.4;

/**
 * Салон корабля и точка, куда проводник ссаживает пассажира с ПУСТОГО рейса:
 * круг от табло уходит без людей. На обзорный облёт, наоборот, садятся.
 */
export const SKY_TRAIN_CABIN = {
  min: [-9.34, 1.2, 75.9] as SceneVector3,
  max: [18.8, 4.4, 79.4] as SceneVector3,
};
/**
 * Высадка задаётся ЦЕНТРОМ капсулы, а не полом под ней: настил перрона 1.3
 * (`skyBerthMetrics.platformTop`) плюс полувысота игрока. Раньше здесь стояла
 * сама высота настила, и на отходе — ровно когда огни перестают мигать и
 * загораются ровно — проводник ставил пассажира на полметра внутрь плиты.
 */
export const SKY_TRAIN_PLATFORM_DROP: SceneVector3 = [
  -1.1,
  1.3 + PLAYER_CAPSULE_FOOT_OFFSET + 0.04,
  74.6,
];

export function isInsideCabin(point: SceneVector3): boolean {
  return [0, 1, 2].every(
    (axis) =>
      point[axis] >= SKY_TRAIN_CABIN.min[axis] &&
      point[axis] <= SKY_TRAIN_CABIN.max[axis],
  );
}

/**
 * Табло отправления: подходя к нему, пассажир видит подсказку и может
 * отправить рейс. Радиусы подхода и отпускания — как у дверей.
 */
export const SKY_TRAIN_DEPARTURE_BOARD: SceneVector3 = [11.9, 2.6, 70.4];
export const DEPARTURE_APPROACH_RADIUS = 3.6;
export const DEPARTURE_RELEASE_RADIUS = 4.8;
