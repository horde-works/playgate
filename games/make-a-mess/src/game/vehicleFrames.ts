import type {
  BreakablePieceDefinition,
  LampEventState,
  SceneVector3,
} from "./destructionScene.ts";
import { PLAYER_CAPSULE_FOOT_OFFSET } from "./playerMovement.ts";
import {
  routeLength,
  routePoint,
  skyTrainRoutePhase,
  type FlightPlan,
  type SkyTrainFlightKind,
} from "./skyTrainRoutes.ts";

// Kept as re-exports for callers while the authored routes themselves live in
// their own artifact module.
export {
  finalLegFrom,
  flightPlan,
  routeLength,
  routePoint,
  routeSpeed,
  skyTrainRoutePhase,
  SKY_TRAIN_UNSTICK_HEIGHT as UNSTICK_HEIGHT,
  type FlightPlan,
  type SkyTrainFlightKind,
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
  return probes;
}

export const vehicleFrames: readonly VehicleFrameDefinition[] = [
  {
    id: "sky-train",
    clusterId: "terminal:sky-train",
    independentMemberMatches: [":blade:"],
    // Нос корабля смотрит на −x: от этого зависит, вокруг чего он кренится,
    // а вокруг чего задирает нос.
    nose: [-1, 0, 0],
    // = [(hullFrom + hullTo) / 2, hullY, trackZ] из skyBerthMetrics.
    // Совпадение проверяет тест: числа здесь дублируются намеренно, чтобы
    // политика транспорта не тянула за собой всю сцену терминала.
    origin: [5.6, 9.4, 77.6],
    liftCentre: [5.6, 9.4, 77.6],
    envelopeMatch: ":skin:",
    // Углы рам обоих вагонов: низ рамы на 0.94.
    supports: [
      [-6.3, 0.94, 76.2], [-6.3, 0.94, 79.0],
      [4.1, 0.94, 76.2], [4.1, 0.94, 79.0],
      [7.3, 0.94, 76.2], [7.3, 0.94, 79.0],
      [17.5, 0.94, 76.2], [17.5, 0.94, 79.0],
    ],
    hullProbes: skyTrainHullProbes(),
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
): LampEventState {
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
  const window = Math.max(0.02, (travelled / routeLength(kind)) * 8);
  let nearest = progress;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let step = 0; step <= 24; step += 1) {
    const s = Math.max(0, Math.min(1, progress - 0.004 + (window * step) / 24));
    const point = routePoint(kind, s);
    const distance = Math.hypot(
      berth[0] + point[0] - centre[0],
      berth[2] + point[2] - centre[2],
    );
    if (distance < bestDistance) {
      bestDistance = distance;
      nearest = s;
    }
  }
  return Math.max(progress, nearest);
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
): SceneVector3 {
  const distance = Math.hypot(offset[0], offset[2]);
  if (distance > MOORING_REACH || distance < 1e-4) {
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

/**
 * Требование к посадочному положению, отдельно от маршрута и автопилота.
 * Никакого переноса в ноль здесь нет: функция только измеряет результат сил.
 */
export function isDockedPose(
  offset: SceneVector3,
  orientation: Quaternion,
  velocity: SceneVector3,
  angularVelocity: SceneVector3,
  nose: SceneVector3 = [-1, 0, 0],
  approach: ApproachGate = SKY_TRAIN_APPROACH,
  tolerance = SKY_TRAIN_DOCKING,
): boolean {
  const forward = rotateVector(orientation, nose);
  const up = rotateVector(orientation, [0, 1, 0]);
  const flat = Math.hypot(forward[0], forward[2]) || 1;
  const alignment =
    (forward[0] * approach.heading[0] + forward[2] * approach.heading[1]) / flat;
  return (
    Math.hypot(offset[0], offset[2]) < tolerance.position &&
    Math.abs(offset[1]) < tolerance.height &&
    alignment > tolerance.headingCos &&
    Math.hypot(velocity[0], velocity[2]) < tolerance.speed &&
    Math.abs(velocity[1]) < tolerance.verticalSpeed &&
    up[1] > tolerance.uprightCos &&
    Math.hypot(...angularVelocity) < tolerance.angularSpeed
  );
}

/**
 * Route completion is accepted from the settled vehicle state. A support-ray
 * hit is deliberately not part of the contract: it describes one collision
 * implementation, can miss a seam in the platform, and is not available to
 * every future moving object that will reuse this lifecycle.
 */
export function isDockingComplete(
  progress: number,
  offset: SceneVector3,
  orientation: Quaternion,
  velocity: SceneVector3,
  angularVelocity: SceneVector3,
  nose: SceneVector3 = [-1, 0, 0],
): boolean {
  return progress > 0.985 && isDockedPose(
    offset,
    orientation,
    velocity,
    angularVelocity,
    nose,
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
  plan: FlightPlan,
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
  const guidanceProgress = Math.min(
    1,
    progress + (onApproach ? APPROACH_LOOKAHEAD : ROUTE_LOOKAHEAD) / plan.length,
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
    const blend = positionBlend * captureBlend;
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
  const engineYawCapacity =
    limits.enginePower * engineYawArms.reduce((sum, arm) => sum + Math.abs(arm), 0);
  const holdableYawRate =
    (rudderCapacity + engineYawCapacity) / Math.max(1, model.dragAngular);
  // Геометрия pure pursuit: хорда остаётся конечной даже на точном маршруте,
  // поэтому кривизна не скачет от малой ошибки предсказания.
  const pursuit =
    (2 * Math.max(groundSpeed, 1.5) * Math.sin(bearingError)) /
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
  const allowed = onApproach
    ? Math.min(
        plan.speedLimit(progress),
        Math.max(0.8, Math.sqrt(2 * 0.35 * berthDistance)),
      )
    : plan.speedLimit(progress);
  const wantedSpeed = allowed * clamp01(startRamp);
  // Реверс — настоящий орган управления: на торможении оба мотора могут дать
  // задний ход, а на малой скорости один работает вперёд, второй назад. Это
  // разворачивает судно без обязательного продвижения боком или вперёд.
  const base = Math.max(
    -0.45,
    Math.min(1, (wantedSpeed - speedAlong - braking * 0.15) * 0.22),
  );
  const engineMoment = wantedYawMoment - rudderMoment;
  const differential = engineYawCapacity > 1e-6
    ? Math.max(-1, Math.min(1, engineMoment / engineYawCapacity))
    : 0;
  const throttle = limits.enginePoints.map((_, index) =>
    clampSigned(base + Math.sign(engineYawArms[index]) * differential));

  // Высота — тоже рычаг: подъём поддувают или стравливают.
  const altitudeError = plan.altitude(progress) - centre[1];
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
  min: [-7.6, 1.2, 75.9] as SceneVector3,
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
