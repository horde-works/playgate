// SPDX-License-Identifier: CC-BY-NC-ND-4.0
// SPDX-FileCopyrightText: 2026 Igor Kirisiuk
//
// Грубая пространственная рамка следующей планировки. Короткие цветные
// секции показывают только занятую полосу и взаимосвязь сред; это не готовое
// мощение, не дорога и не основание будущего здания.

import type { MutableGroup } from "./astanaAuthoring.ts";
import { groundSeatBox, primitive } from "./astanaAuthoring.ts";
import {
  ARCH_CENTRE,
  BAITEREK_CENTRE,
  KHAN_SHATYR_CENTRE,
  NURZHOL_ACROSS_VECTOR,
  NURZHOL_ALONG_VECTOR,
  NUR_ALEM_CENTRE,
  OPERA_CENTRE,
  PYRAMID_CENTRE,
  PYRAMID_YAW,
  VIRGIN_LANDS_PALACE_CENTRE,
} from "./astanaLayout.ts";
import {
  RING_PATH_LENGTH,
  RING_RADIUS,
  astanaBridges,
  astanaStationById,
  ringPathPoint,
  stationDistance,
  valleyHalfWidth,
  type PlanPoint,
} from "./astanaPlan.ts";
import { stationApproach } from "./astanaStation.ts";
import {
  PYRAMID_ENTRANCE_OUTER_DISTANCE,
  PYRAMID_MOUND_BOTTOM_HALF_SIZE,
} from "./astanaPyramidPodium.ts";
import {
  groundUnder,
  riverAxisZ,
} from "./astanaShell.ts";

const FRAME_HEIGHT = 0.16;
const FRAME_CELL = 1.1;
const FRAME_GAP = 0.015;
const FRAME_TOP = 0.34;

export const PEDESTRIAN_PALETTE = {
  pyramid: "#b18c55",
  expo: "#3e7d86",
  riverUrban: "#80959b",
  riverPark: "#78866d",
  pier: "#4e8290",
  oldCity: "#aa7656",
  outerRoad: "#555d5d",
  // Это не четыре близких серых образца, а четыре читаемые среды.
  // Белая ось совпадает по значению с белыми лестницами Пирамиды; дальше
  // камень теплеет и темнеет, Нур Алем уже лежит в холодном асфальте.
  ceremonialWhite: "#ffffff",
  coreStone: "#eeeae0",
  civicStone: "#c5c4bf",
  quayGranite: "#8f887e",
  expoAsphalt: "#858d90",
  junctionPlanting: "#68784d",
} as const;
const COLOURS = PEDESTRIAN_PALETTE;

function normalize([x, z]: PlanPoint): PlanPoint {
  const length = Math.hypot(x, z) || 1;
  return [x / length, z / length];
}

function add(a: PlanPoint, direction: PlanPoint, distance: number): PlanPoint {
  return [a[0] + direction[0] * distance, a[1] + direction[1] * distance];
}

function localPoint(
  centre: PlanPoint,
  yaw: number,
  localX: number,
  localZ: number,
): PlanPoint {
  const cosine = Math.cos(yaw);
  const sine = Math.sin(yaw);
  return [
    centre[0] + cosine * localX - sine * localZ,
    centre[1] + sine * localX + cosine * localZ,
  ];
}

function rectangle(
  centre: PlanPoint,
  halfX: number,
  halfZ: number,
  yaw: number,
): readonly PlanPoint[] {
  return [
    localPoint(centre, yaw, -halfX, -halfZ),
    localPoint(centre, yaw, halfX, -halfZ),
    localPoint(centre, yaw, halfX, halfZ),
    localPoint(centre, yaw, -halfX, halfZ),
    localPoint(centre, yaw, -halfX, -halfZ),
  ];
}

function ellipse(
  centre: PlanPoint,
  radiusX: number,
  radiusZ: number,
  yaw = 0,
  steps = 48,
): readonly PlanPoint[] {
  const points: PlanPoint[] = Array.from({ length: steps + 1 }, (_, step) => {
    const angle = Math.PI * 2 * step / steps;
    return localPoint(
      centre,
      yaw,
      Math.cos(angle) * radiusX,
      Math.sin(angle) * radiusZ,
    );
  });
  points[steps] = points[0];
  return points;
}

/**
 * Вставляет узлы примыкающих дорожек в сам контур. Подмена ближайших
 * выборок почти не меняет эллипс, зато исключает микрозазоры между двумя
 * независимо рассчитанными линиями.
 */
function ellipseIncluding(
  centre: PlanPoint,
  radiusX: number,
  radiusZ: number,
  yaw: number,
  anchors: readonly PlanPoint[],
  steps = 48,
): readonly PlanPoint[] {
  const entries = ellipse(centre, radiusX, radiusZ, yaw, steps)
    .slice(0, -1)
    .map((point, index) => ({ point, parameter: Math.PI * 2 * index / steps }));
  anchors.forEach((point) => {
    const raw = ellipseParameterToward(centre, radiusX, radiusZ, yaw, point);
    entries.push({
      point,
      parameter: (raw + Math.PI * 2) % (Math.PI * 2),
    });
  });
  entries.sort((left, right) => left.parameter - right.parameter);
  const points = entries.map(({ point }) => point);
  points.push(points[0]);
  return points;
}

function ellipseParameterToward(
  centre: PlanPoint,
  radiusX: number,
  radiusZ: number,
  yaw: number,
  target: PlanPoint,
): number {
  const cosine = Math.cos(yaw);
  const sine = Math.sin(yaw);
  const dx = target[0] - centre[0];
  const dz = target[1] - centre[1];
  const localX = cosine * dx + sine * dz;
  const localZ = -sine * dx + cosine * dz;
  return Math.atan2(localZ / radiusZ, localX / radiusX);
}

/** A long horseshoe whose deliberate opening faces the primary destination. */
function openEllipseFacing(
  centre: PlanPoint,
  radiusX: number,
  radiusZ: number,
  yaw: number,
  target: PlanPoint,
  opening = Math.PI * 0.34,
  steps = 64,
): readonly PlanPoint[] {
  const facing = ellipseParameterToward(centre, radiusX, radiusZ, yaw, target);
  const start = facing + opening / 2;
  const sweep = Math.PI * 2 - opening;
  return Array.from({ length: steps + 1 }, (_, step) => {
    const angle = start + sweep * step / steps;
    return localPoint(
      centre,
      yaw,
      Math.cos(angle) * radiusX,
      Math.sin(angle) * radiusZ,
    );
  });
}

function pathIncluding(
  source: readonly PlanPoint[],
  anchors: readonly PlanPoint[],
): readonly PlanPoint[] {
  const points = [...source];
  for (const anchor of anchors) {
    let nearest = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    points.forEach((point, index) => {
      const candidate = Math.hypot(point[0] - anchor[0], point[1] - anchor[1]);
      if (candidate < nearestDistance) {
        nearest = index;
        nearestDistance = candidate;
      }
    });
    points[nearest] = anchor;
  }
  return points;
}

type GateMouth = {
  point: PlanPoint;
  neighbour: PlanPoint;
};

function cubicBezier(
  start: PlanPoint,
  controlA: PlanPoint,
  controlB: PlanPoint,
  end: PlanPoint,
  steps = 12,
): readonly PlanPoint[] {
  return Array.from({ length: steps + 1 }, (_, step) => {
    const t = step / steps;
    const inverse = 1 - t;
    const startWeight = inverse ** 3;
    const controlAWeight = 3 * inverse ** 2 * t;
    const controlBWeight = 3 * inverse * t ** 2;
    const endWeight = t ** 3;
    return [
      start[0] * startWeight + controlA[0] * controlAWeight
        + controlB[0] * controlBWeight + end[0] * endWeight,
      start[1] * startWeight + controlA[1] * controlAWeight
        + controlB[1] * controlBWeight + end[1] * endWeight,
    ];
  });
}

function forkArms(
  split: PlanPoint,
  previous: PlanPoint,
  mouth: readonly [GateMouth, GateMouth],
): readonly [readonly PlanPoint[], readonly PlanPoint[]] {
  const incoming = normalize([split[0] - previous[0], split[1] - previous[1]]);
  const commonControl = add(split, incoming, 5.5);
  return mouth.map(({ point, neighbour }) => {
    const away = normalize([neighbour[0] - point[0], neighbour[1] - point[1]]);
    return cubicBezier(
      split,
      commonControl,
      add(point, away, -4),
      point,
      14,
    );
  }) as unknown as readonly [readonly PlanPoint[], readonly PlanPoint[]];
}

function forkedGate(
  source: readonly PlanPoint[],
  mouth: readonly [GateMouth, GateMouth],
  gateAtStart = false,
  backSamples = 3,
): {
  trunk: readonly PlanPoint[];
  arms: readonly [readonly PlanPoint[], readonly PlanPoint[]];
} {
  const towardGate = gateAtStart ? [...source].reverse() : [...source];
  const splitIndex = Math.max(1, towardGate.length - backSamples - 1);
  const trunkTowardGate = towardGate.slice(0, splitIndex + 1);
  const split = trunkTowardGate[trunkTowardGate.length - 1];
  const previous = trunkTowardGate[trunkTowardGate.length - 2];
  return {
    trunk: gateAtStart ? [...trunkTowardGate].reverse() : trunkTowardGate,
    arms: forkArms(split, previous, mouth),
  };
}

function forkIsland(
  arms: readonly [readonly PlanPoint[], readonly PlanPoint[]],
): readonly PlanPoint[] {
  const sample = Math.max(2, Math.floor(Math.min(arms[0].length, arms[1].length) * 0.56));
  const left = arms[0][sample];
  const right = arms[1][sample];
  const split = arms[0][0];
  const centre: PlanPoint = [(left[0] + right[0]) / 2, (left[1] + right[1]) / 2];
  const along = normalize([centre[0] - split[0], centre[1] - split[1]]);
  const length = Math.hypot(centre[0] - split[0], centre[1] - split[1]);
  const separation = Math.hypot(left[0] - right[0], left[1] - right[1]);
  return ellipse(
    centre,
    Math.max(1.2, length * 0.32),
    Math.max(0.7, separation * 0.18),
    Math.atan2(along[1], along[0]),
    24,
  );
}

function stationForecourt(
  gateway: PlanPoint,
  inward: PlanPoint,
  targetA: PlanPoint,
  targetB: PlanPoint,
  options: {
    readonly trunk?: number;
    readonly arms?: number;
    readonly mouths?: readonly [PlanPoint, PlanPoint];
  } = {},
): {
  trunk: readonly PlanPoint[];
  arms: readonly [readonly PlanPoint[], readonly PlanPoint[]];
  mouths: readonly [PlanPoint, PlanPoint];
  island: readonly PlanPoint[];
} {
  const lateral: PlanPoint = [-inward[1], inward[0]];
  const trunkDepth = options.trunk ?? 6;
  const armDepth = options.arms ?? 5;
  const split = add(gateway, inward, trunkDepth);
  const lateralScore = (target: PlanPoint): number =>
    (target[0] - gateway[0]) * lateral[0] + (target[1] - gateway[1]) * lateral[1];
  const scores = [lateralScore(targetA), lateralScore(targetB)] as const;
  const sides = scores.map((score) => Math.sign(score)) as [number, number];
  if (sides[0] === 0) sides[0] = sides[1] || 1;
  if (sides[1] === 0) sides[1] = sides[0] || -1;
  let offsets: number[];
  if (sides[0] === sides[1]) {
    // Оба назначения действительно лежат по одну сторону портала. Не
    // выдумываем ради симметрии встречную ветвь: ближний и дальний маршруты
    // последовательно раскрываются в одном направлении.
    const firstFarther = Math.abs(scores[0]) >= Math.abs(scores[1]);
    offsets = firstFarther
      ? [sides[0] * 9.6, sides[1] * 4.8]
      : [sides[0] * 4.8, sides[1] * 9.6];
  } else {
    offsets = [sides[0] * 4.8, sides[1] * 4.8];
  }
  const mouths = options.mouths
    ? [...options.mouths] as [PlanPoint, PlanPoint]
    : offsets.map((offset) =>
      add(add(split, inward, armDepth), lateral, offset)) as [PlanPoint, PlanPoint];
  const arms = mouths.map((mouth) => cubicBezier(
    split,
    add(split, inward, 2.4),
    add(mouth, inward, -2.2),
    mouth,
    12,
  )) as [readonly PlanPoint[], readonly PlanPoint[]];
  return {
    trunk: [gateway, split],
    arms,
    mouths,
    island: forkIsland(arms),
  };
}

function fromNurzhol(along: number, across: number): PlanPoint {
  return [
    BAITEREK_CENTRE[0]
      + NURZHOL_ALONG_VECTOR[0] * along
      + NURZHOL_ACROSS_VECTOR[0] * across,
    BAITEREK_CENTRE[1]
      + NURZHOL_ALONG_VECTOR[1] * along
      + NURZHOL_ACROSS_VECTOR[1] * across,
  ];
}

function toNurzhol(point: PlanPoint): PlanPoint {
  const dx = point[0] - BAITEREK_CENTRE[0];
  const dz = point[1] - BAITEREK_CENTRE[1];
  return [
    dx * NURZHOL_ALONG_VECTOR[0] + dz * NURZHOL_ALONG_VECTOR[1],
    dx * NURZHOL_ACROSS_VECTOR[0] + dz * NURZHOL_ACROSS_VECTOR[1],
  ];
}

function pointOnEllipseToward(
  centre: PlanPoint,
  radiusX: number,
  radiusZ: number,
  yaw: number,
  target: PlanPoint,
): PlanPoint {
  const cosine = Math.cos(yaw);
  const sine = Math.sin(yaw);
  const dx = target[0] - centre[0];
  const dz = target[1] - centre[1];
  const localX = cosine * dx + sine * dz;
  const localZ = -sine * dx + cosine * dz;
  const scale = 1 / Math.sqrt(
    (localX / radiusX) ** 2 + (localZ / radiusZ) ** 2,
  );
  return localPoint(centre, yaw, localX * scale, localZ * scale);
}

const pyramidToBaiterek = normalize([-PYRAMID_CENTRE[0], -PYRAMID_CENTRE[1]]);
const pyramidToBaiterekDistance = Math.hypot(...PYRAMID_CENTRE);
// Квадратное основание не допускает свободного веера. Центральный выход
// идёт по нормали грани, обращённой к Байтереку; два остальных — по нормалям
// соседних граней. Это три из четырёх ортогональных направлений основания.
const pyramidSideNormals = [
  NURZHOL_ACROSS_VECTOR,
  [-NURZHOL_ACROSS_VECTOR[0], -NURZHOL_ACROSS_VECTOR[1]],
] as const;

export const PYRAMID_FRAME = {
  mound: rectangle(
    PYRAMID_CENTRE,
    PYRAMID_MOUND_BOTTOM_HALF_SIZE,
    PYRAMID_MOUND_BOTTOM_HALF_SIZE,
    PYRAMID_YAW,
  ),
  rays: [
    [
      add(PYRAMID_CENTRE, pyramidToBaiterek, PYRAMID_ENTRANCE_OUTER_DISTANCE + 0.5),
      add(PYRAMID_CENTRE, pyramidToBaiterek, pyramidToBaiterekDistance - 18.5),
    ],
    [
      add(PYRAMID_CENTRE, pyramidSideNormals[0], PYRAMID_ENTRANCE_OUTER_DISTANCE + 0.5),
      add(PYRAMID_CENTRE, pyramidSideNormals[0], PYRAMID_ENTRANCE_OUTER_DISTANCE + 12),
    ],
    [
      add(PYRAMID_CENTRE, pyramidSideNormals[1], PYRAMID_ENTRANCE_OUTER_DISTANCE + 0.5),
      add(PYRAMID_CENTRE, pyramidSideNormals[1], PYRAMID_ENTRANCE_OUTER_DISTANCE + 12),
    ],
  ] as const,
} as const;

const NURZHOL_YAW = Math.atan2(
  NURZHOL_ALONG_VECTOR[1],
  NURZHOL_ALONG_VECTOR[0],
);
const BAITEREK_WALK_RING_RADIUS = 19.2;
const KHAN_WALK_RING_RADII = [25.5, 25] as const;
const OPERA_WALK_RING_RADII = [21, 16] as const;
const ARCH_WALK_RING_RADII = [10.5, 5.5] as const;
const NUR_ALEM_WALK_RING_RADII = [25.5, 22.5] as const;
const operaNurzhol = toNurzhol(OPERA_CENTRE);

/**
 * Проверяемый перенос, а не новая утверждённая координата: корпус подходит
 * к Нуржолу на 7 м. Вокруг него строится отдельная парковая «бусина», а не
 * прямая улица, прижатая к фронтону.
 */
export const OPERA_STUDY_CENTRE = fromNurzhol(operaNurzhol[0], operaNurzhol[1] + 7);
// До отдельного утверждения переноса дорожки обязаны обтекать существующий
// корпус. Черновая схема не имеет права «предвосхищать» переезд и проходить
// сквозь сегодняшнюю Оперу.
const OPERA_NECKLACE_CENTRE = OPERA_CENTRE;

interface StationGroundGateway {
  readonly point: PlanPoint;
  readonly inward: PlanPoint;
}

/**
 * Выход берётся из той же локальной системы, в которой собрана станция.
 * `stationApproach()` — точка непосредственно снаружи дверей наземного
 * портала: её продольное смещение принципиально, поэтому радиальная
 * аппроксимация здесь недопустима.
 */
function stationGroundGateway(
  id: keyof typeof astanaStationById,
): StationGroundGateway {
  const station = astanaStationById[id];
  const distance = stationDistance(station.compass);
  const centre = ringPathPoint(distance);
  const ahead = ringPathPoint(distance + 1);
  const behind = ringPathPoint(distance - 1);
  const along = normalize([ahead[0] - behind[0], ahead[1] - behind[1]]);
  const inward = normalize([-centre[0], -centre[1]]);
  const approach = stationApproach();
  return {
    point: [
      centre[0] + along[0] * approach.t + inward[0] * approach.w,
      centre[1] + along[1] * approach.t + inward[1] * approach.w,
    ],
    inward,
  };
}

export const STATION_GROUND_GATEWAYS = {
  arena: stationGroundGateway("astana-arena"),
  east: stationGroundGateway("auezhai"),
  west: stationGroundGateway("nurly-zhol"),
  north: stationGroundGateway("zhibek-zholy"),
} as const;

const arenaGateway = STATION_GROUND_GATEWAYS.arena.point;
const eastGateway = STATION_GROUND_GATEWAYS.east.point;
const westGateway = STATION_GROUND_GATEWAYS.west.point;
const northGateway = STATION_GROUND_GATEWAYS.north.point;
const atyrauPedestrianBridge = astanaBridges.find((bridge) => bridge.id === "footbridge");
if (!atyrauPedestrianBridge) throw new Error("Atyrau bridge must exist before its promenade");
const atyrauSouthLanding = atyrauPedestrianBridge.axis[0];
const atyrauNorthLanding =
  atyrauPedestrianBridge.axis[atyrauPedestrianBridge.axis.length - 1];

const baiterekPyramidJoin = fromNurzhol(-BAITEREK_WALK_RING_RADIUS, 0);
const baiterekKhanJoin = fromNurzhol(BAITEREK_WALK_RING_RADIUS, 0);
const baiterekOperaJoin = pointOnEllipseToward(
  BAITEREK_CENTRE, BAITEREK_WALK_RING_RADIUS, BAITEREK_WALK_RING_RADIUS,
  NURZHOL_YAW, fromNurzhol(11, -15.6),
);
const baiterekArchJoin = pointOnEllipseToward(
  BAITEREK_CENTRE, BAITEREK_WALK_RING_RADIUS, BAITEREK_WALK_RING_RADIUS,
  NURZHOL_YAW, fromNurzhol(-10.2, -16.1),
);
const baiterekAtyrauJoin = pointOnEllipseToward(
  BAITEREK_CENTRE, BAITEREK_WALK_RING_RADIUS, BAITEREK_WALK_RING_RADIUS,
  NURZHOL_YAW, fromNurzhol(8, 17.1),
);
const baiterekExpoJoin = pointOnEllipseToward(
  BAITEREK_CENTRE, BAITEREK_WALK_RING_RADIUS, BAITEREK_WALK_RING_RADIUS,
  NURZHOL_YAW, NUR_ALEM_CENTRE,
);
const baiterekVirginLandsJoin = pointOnEllipseToward(
  BAITEREK_CENTRE, BAITEREK_WALK_RING_RADIUS, BAITEREK_WALK_RING_RADIUS,
  NURZHOL_YAW, VIRGIN_LANDS_PALACE_CENTRE,
);

const khanAxisJoin = pointOnEllipseToward(
  KHAN_SHATYR_CENTRE, KHAN_WALK_RING_RADII[0], KHAN_WALK_RING_RADII[1],
  NURZHOL_YAW, BAITEREK_CENTRE,
);
const khanOperaJoin = pointOnEllipseToward(
  KHAN_SHATYR_CENTRE, KHAN_WALK_RING_RADII[0], KHAN_WALK_RING_RADII[1],
  NURZHOL_YAW, fromNurzhol(43, -23),
);
const khanArenaJoin = pointOnEllipseToward(
  KHAN_SHATYR_CENTRE, KHAN_WALK_RING_RADII[0], KHAN_WALK_RING_RADII[1],
  NURZHOL_YAW, arenaGateway,
);
const khanEastJoin = pointOnEllipseToward(
  KHAN_SHATYR_CENTRE, KHAN_WALK_RING_RADII[0], KHAN_WALK_RING_RADII[1],
  NURZHOL_YAW, eastGateway,
);
const khanAtyrauJoin = pointOnEllipseToward(
  KHAN_SHATYR_CENTRE, KHAN_WALK_RING_RADII[0], KHAN_WALK_RING_RADII[1],
  NURZHOL_YAW, atyrauSouthLanding,
);

// Опера получает спокойный открытый двор, обращённый к Байтереку. Остальные
// направления входят в его наружную дугу и не превращают фронтон в развязку.
const operaBaiterekJoin = pointOnEllipseToward(
  OPERA_NECKLACE_CENTRE, OPERA_WALK_RING_RADII[0], OPERA_WALK_RING_RADII[1],
  NURZHOL_YAW, BAITEREK_CENTRE,
);
const operaKhanJoin = pointOnEllipseToward(
  OPERA_NECKLACE_CENTRE, OPERA_WALK_RING_RADII[0], OPERA_WALK_RING_RADII[1],
  NURZHOL_YAW, KHAN_SHATYR_CENTRE,
);
const operaArenaJoin = pointOnEllipseToward(
  OPERA_NECKLACE_CENTRE, OPERA_WALK_RING_RADII[0], OPERA_WALK_RING_RADII[1],
  NURZHOL_YAW, arenaGateway,
);
const operaExpoJoin = pointOnEllipseToward(
  OPERA_NECKLACE_CENTRE, OPERA_WALK_RING_RADII[0], OPERA_WALK_RING_RADII[1],
  NURZHOL_YAW, NUR_ALEM_CENTRE,
);

const archAxisDirection = normalize([
  NUR_ALEM_CENTRE[0] - ARCH_CENTRE[0],
  NUR_ALEM_CENTRE[1] - ARCH_CENTRE[1],
]);
const archAxisYaw = Math.atan2(archAxisDirection[1], archAxisDirection[0]);
const archFromBaiterek = add(ARCH_CENTRE, archAxisDirection, -ARCH_WALK_RING_RADII[0]);
const archToExpo = add(ARCH_CENTRE, archAxisDirection, ARCH_WALK_RING_RADII[0]);

const expoFromCore = pointOnEllipseToward(
  NUR_ALEM_CENTRE, NUR_ALEM_WALK_RING_RADII[0], NUR_ALEM_WALK_RING_RADII[1],
  NURZHOL_YAW, BAITEREK_CENTRE,
);

const baiterekNecklace = ellipseIncluding(
  BAITEREK_CENTRE,
  BAITEREK_WALK_RING_RADIUS,
  BAITEREK_WALK_RING_RADIUS,
  NURZHOL_YAW,
  [
    baiterekPyramidJoin,
    baiterekKhanJoin,
    baiterekOperaJoin,
    baiterekArchJoin,
    baiterekAtyrauJoin,
    baiterekExpoJoin,
    baiterekVirginLandsJoin,
  ],
  120,
);

const khanNecklace = pathIncluding(
  openEllipseFacing(
    KHAN_SHATYR_CENTRE,
    KHAN_WALK_RING_RADII[0],
    KHAN_WALK_RING_RADII[1],
    NURZHOL_YAW,
    BAITEREK_CENTRE,
    Math.PI * 0.3,
    72,
  ),
  [khanAtyrauJoin, khanEastJoin, khanArenaJoin, khanOperaJoin],
);

const operaNecklace = pathIncluding(
  openEllipseFacing(
    OPERA_NECKLACE_CENTRE,
    OPERA_WALK_RING_RADII[0],
    OPERA_WALK_RING_RADII[1],
    NURZHOL_YAW,
    BAITEREK_CENTRE,
    Math.PI * 0.42,
    64,
  ),
  [operaKhanJoin, operaArenaJoin, operaExpoJoin],
);

const expoNecklace = ellipse(
  NUR_ALEM_CENTRE,
  NUR_ALEM_WALK_RING_RADII[0],
  NUR_ALEM_WALK_RING_RADII[1],
  NURZHOL_YAW,
  84,
);
const expoOrbitSegments = [openEllipseFacing(
  NUR_ALEM_CENTRE,
  NUR_ALEM_WALK_RING_RADII[0],
  NUR_ALEM_WALK_RING_RADII[1],
  NURZHOL_YAW,
  BAITEREK_CENTRE,
  Math.PI * 0.34,
  84,
)] as const;

function openPathMouth(points: readonly PlanPoint[]): readonly [GateMouth, GateMouth] {
  return [
    { point: points[0], neighbour: points[1] },
    { point: points[points.length - 1], neighbour: points[points.length - 2] },
  ];
}

const khanAxisArms = forkArms(
  khanAxisJoin,
  baiterekKhanJoin,
  openPathMouth(khanNecklace),
);
const operaForecourtArms = forkArms(
  operaBaiterekJoin,
  baiterekOperaJoin,
  openPathMouth(operaNecklace),
);

const expoGateMouth = openPathMouth(expoOrbitSegments[0]);
const arenaForecourt = stationForecourt(
  arenaGateway, STATION_GROUND_GATEWAYS.arena.inward, OPERA_CENTRE, NUR_ALEM_CENTRE,
  {
    // Опера стоит почти перед самым порталом. Западная ветвь входит прямо
    // в её ожерелье, восточная оставляет свободный обход к EXPO.
    mouths: [operaArenaJoin, [19, -57.5]],
  },
);
const eastForecourt = stationForecourt(
  eastGateway, STATION_GROUND_GATEWAYS.east.inward,
  KHAN_SHATYR_CENTRE, atyrauSouthLanding,
);
const westForecourt = stationForecourt(
  westGateway, STATION_GROUND_GATEWAYS.west.inward, NUR_ALEM_CENTRE, PYRAMID_CENTRE,
);
const northForecourt = stationForecourt(
  northGateway, STATION_GROUND_GATEWAYS.north.inward,
  atyrauNorthLanding, PYRAMID_CENTRE, { trunk: 3.2, arms: 3.2 },
);
const baiterekExpoGate = forkedGate(cubicBezier(
  baiterekExpoJoin,
  [baiterekExpoJoin[0] * 2.2, baiterekExpoJoin[1] * 2.2],
  [expoFromCore[0] * 0.86, expoFromCore[1] * 0.86],
  expoFromCore,
  18,
), expoGateMouth, false, 4);
const operaExpoApproach = cubicBezier(
  operaExpoJoin,
  add(
    operaExpoJoin,
    normalize([
      operaExpoJoin[0] - OPERA_NECKLACE_CENTRE[0],
      operaExpoJoin[1] - OPERA_NECKLACE_CENTRE[1],
    ]),
    6,
  ),
  [-33, -27],
  baiterekExpoGate.trunk[Math.floor(baiterekExpoGate.trunk.length * 0.42)],
  14,
);
const khanAxisIsland = forkIsland(khanAxisArms);
const operaForecourtIsland = forkIsland(operaForecourtArms);
const expoGateIslands = [
  forkIsland(baiterekExpoGate.arms),
] as const;

function quayPoint(side: -1 | 1, x: number): PlanPoint {
  return [x, riverAxisZ(x) + side * (valleyHalfWidth(x) - 2)];
}

const atyrauSouthQuayNode = quayPoint(-1, atyrauSouthLanding[0]);
const atyrauNorthQuayNode = quayPoint(1, atyrauNorthLanding[0]);

// Южный сход Атырау — не точка, из которой торчат четыре линии, а маленький
// садовый веер. Мост и набережная приходят в вершину, два обхода обнимают
// зелёный остров, а три сухопутных направления получают разные горловины:
// Байтерек слева, Хан Шатыр по оси, станция справа.
const atyrauBridgeDirection = normalize([
  atyrauNorthLanding[0] - atyrauSouthLanding[0],
  atyrauNorthLanding[1] - atyrauSouthLanding[1],
]);
const atyrauFanLeft: PlanPoint = [
  -atyrauBridgeDirection[1],
  atyrauBridgeDirection[0],
];
const atyrauFanBottom = add(atyrauSouthLanding, atyrauBridgeDirection, -11);
const atyrauSouthFanArms = [
  cubicBezier(
    atyrauSouthLanding,
    add(add(atyrauSouthLanding, atyrauBridgeDirection, -2), atyrauFanLeft, 5),
    add(add(atyrauFanBottom, atyrauBridgeDirection, 2), atyrauFanLeft, 5),
    atyrauFanBottom,
    12,
  ),
  cubicBezier(
    atyrauSouthLanding,
    add(add(atyrauSouthLanding, atyrauBridgeDirection, -2), atyrauFanLeft, -5),
    add(add(atyrauFanBottom, atyrauBridgeDirection, 2), atyrauFanLeft, -5),
    atyrauFanBottom,
    12,
  ),
] as const;
const atyrauBaiterekMouth = atyrauSouthFanArms[0][6];
const atyrauEastMouth = atyrauSouthFanArms[1][6];
const atyrauSouthFanIsland = ellipse(
  add(atyrauSouthLanding, atyrauBridgeDirection, -5.5),
  3.15,
  1.8,
  Math.atan2(atyrauBridgeDirection[1], atyrauBridgeDirection[0]),
  28,
);

function quay(side: -1 | 1): readonly PlanPoint[] {
  const points: PlanPoint[] = Array.from({ length: 49 }, (_, step) => {
    const x = -108 + step * 4.5;
    return quayPoint(side, x);
  });
  for (const anchor of [
    atyrauSouthQuayNode,
    atyrauNorthQuayNode,
  ]) {
    const offset = anchor[1] - riverAxisZ(anchor[0]);
    if ((Math.sign(offset) || 1) === side) points.push(anchor);
  }
  points.sort((a, b) => a[0] - b[0]);
  return points;
}

const atyrauSouthApproach = (() => {
  const start = atyrauFanBottom;
  return cubicBezier(
    start,
    add(start, atyrauBridgeDirection, -4),
    fromNurzhol(39, 23),
    khanAtyrauJoin,
    16,
  );
})();

const atyrauBaiterekApproach = cubicBezier(
  atyrauBaiterekMouth,
  fromNurzhol(27, 34),
  fromNurzhol(16, 23),
  baiterekAtyrauJoin,
  16,
);

const atyrauNorthApproach = cubicBezier(
  atyrauNorthLanding,
  fromNurzhol(-12, 82),
  fromNurzhol(-40, 72),
  northForecourt.mouths[0],
  16,
);

// У каждого вокзального входа два независимых понятных маршрута. Это не
// декоративные петли: человек может выбрать прямой путь к ближайшему месту
// или выйти на непрерывную набережную и сменить направление там.
const eastAtyrauApproach = cubicBezier(
  eastForecourt.mouths[1],
  [56, 8.2],
  [54, 5.2],
  atyrauEastMouth,
  12,
);
// Мосты и лестницы подходят к набережной короткими дельтами. Их посадочные
// точки не подмешиваются в основную кривую: иначе набережная делает острый
// зигзаг вглубь берега и выглядит связной только в массиве координат.
const atyrauSouthQuayConnector = cubicBezier(
  atyrauSouthLanding,
  [47.5, 12],
  [47.5, atyrauSouthQuayNode[1] - 3],
  atyrauSouthQuayNode,
  8,
);
const atyrauNorthQuayConnector = cubicBezier(
  atyrauNorthLanding,
  [50.5, 56],
  [50.5, atyrauNorthQuayNode[1] + 3],
  atyrauNorthQuayNode,
  8,
);

export const PEDESTRIAN_STUDY = {
  rings: {
    baiterek: baiterekNecklace,
    khan: khanNecklace,
    opera: operaNecklace,
    arch: ellipseIncluding(
      ARCH_CENTRE,
      ARCH_WALK_RING_RADII[0],
      ARCH_WALK_RING_RADII[1],
      archAxisYaw,
      [archFromBaiterek, archToExpo],
      56,
    ),
    expo: expoNecklace,
  },
  orbitSegments: {
    expo: expoOrbitSegments,
  },
  junctions: {
    khanAxis: khanAxisArms,
    operaForecourt: operaForecourtArms,
    atyrauSouth: atyrauSouthFanArms,
    stations: {
      arena: arenaForecourt.arms,
      east: eastForecourt.arms,
      west: westForecourt.arms,
      north: northForecourt.arms,
    },
    expo: {
      core: baiterekExpoGate.arms,
    },
  },
  junctionIslands: {
    khanAxis: khanAxisIsland,
    operaForecourt: operaForecourtIsland,
    atyrauSouth: atyrauSouthFanIsland,
    stations: {
      arena: arenaForecourt.island,
      east: eastForecourt.island,
      west: westForecourt.island,
      north: northForecourt.island,
    },
    expo: expoGateIslands,
  },
  civicLinks: {
    khanBaiterekAxis: [khanAxisJoin, baiterekKhanJoin],
    khanOpera: cubicBezier(
      khanOperaJoin, fromNurzhol(47, -19), fromNurzhol(46, -22), operaKhanJoin, 12,
    ),
    khanEastStation: cubicBezier(
      khanEastJoin,
      fromNurzhol(69, 31),
      fromNurzhol(70, 46),
      eastForecourt.mouths[0],
      12,
    ),
    operaBaiterek: cubicBezier(
      operaBaiterekJoin,
      [-0.35, -23],
      [-1.2, -20.4],
      baiterekOperaJoin,
      12,
    ),
    operaArena: [operaArenaJoin],
    operaExpo: operaExpoApproach,
    baiterekArch: cubicBezier(
      baiterekArchJoin,
      [-25, -2],
      add(archFromBaiterek, archAxisDirection, -4),
      archFromBaiterek,
      18,
    ),
    baiterekExpo: baiterekExpoGate.trunk,
    archPassage: [archFromBaiterek, ARCH_CENTRE, archToExpo],
    pyramidBaiterek: [
      PYRAMID_FRAME.rays[0][0],
      baiterekPyramidJoin,
    ],
    pyramidSideNorth: [
      PYRAMID_FRAME.rays[1][0],
      PYRAMID_FRAME.rays[1][1],
    ],
    pyramidSideSouth: [
      PYRAMID_FRAME.rays[2][0],
      PYRAMID_FRAME.rays[2][1],
    ],
    atyrauKhan: atyrauSouthApproach,
    atyrauBaiterek: atyrauBaiterekApproach,
    atyrauOuter: atyrauNorthApproach,
    eastAtyrau: eastAtyrauApproach,
    atyrauSouthQuayConnector,
    atyrauNorthQuayConnector,
    virginLandsBaiterek: [
      pointOnEllipseToward(
        VIRGIN_LANDS_PALACE_CENTRE,
        29,
        23,
        Math.atan2(VIRGIN_LANDS_PALACE_CENTRE[1], VIRGIN_LANDS_PALACE_CENTRE[0])
          + Math.PI / 2,
        BAITEREK_CENTRE,
      ),
      baiterekVirginLandsJoin,
    ],
  },
  quays: {
    south: quay(-1),
    north: quay(1),
  },
  stationForecourts: {
    arena: arenaForecourt.trunk,
    east: eastForecourt.trunk,
    west: westForecourt.trunk,
    north: northForecourt.trunk,
  },
} as const;

export const NUR_ALEM_FRAME_CENTRE = NUR_ALEM_CENTRE;
const expoForward = normalize(NUR_ALEM_FRAME_CENTRE);
const expoAcross: PlanPoint = [-expoForward[1], expoForward[0]];
const expoYaw = Math.atan2(expoForward[1], expoForward[0]);
const expoPoint = (along: number, across: number): PlanPoint => [
  NUR_ALEM_FRAME_CENTRE[0] + expoForward[0] * along + expoAcross[0] * across,
  NUR_ALEM_FRAME_CENTRE[1] + expoForward[1] * along + expoAcross[1] * across,
];

export const NUR_ALEM_FRAME = {
  /** Главный подход продолжает точный вектор Байтерек — Нур Алем. */
  approach: [baiterekExpoJoin, expoPoint(-15, 0)],
  approachHalfWidth: 2.75,
  pavilions: [
    rectangle(expoPoint(1, -22), 15, 5, expoYaw),
    rectangle(expoPoint(1, 22), 15, 5, expoYaw),
    rectangle(expoPoint(-19, 0), 5, 8, expoYaw),
    rectangle(expoPoint(19, 0), 5, 8, expoYaw),
  ],
} as const;

const atyrau = astanaBridges.find((bridge) => bridge.id === "footbridge");
if (!atyrau) throw new Error("Atyrau bridge must exist before its bank framework");
const atyrauSouth = atyrau.axis[0];
const atyrauNorth = atyrau.axis[atyrau.axis.length - 1];
const atyrauDirection = normalize([
  atyrauNorth[0] - atyrauSouth[0],
  atyrauNorth[1] - atyrauSouth[1],
]);
const atyrauYaw = Math.atan2(atyrauDirection[1], atyrauDirection[0]);

export const ATYRAU_BANK_FRAME = {
  urban: rectangle(add(atyrauSouth, atyrauDirection, -6), 8, 9, atyrauYaw),
  park: [
    localPoint(add(atyrauNorth, atyrauDirection, 8), atyrauYaw, -10, -8),
    localPoint(add(atyrauNorth, atyrauDirection, 8), atyrauYaw, 8, -11),
    localPoint(add(atyrauNorth, atyrauDirection, 8), atyrauYaw, 13, 1),
    localPoint(add(atyrauNorth, atyrauDirection, 8), atyrauYaw, 7, 11),
    localPoint(add(atyrauNorth, atyrauDirection, 8), atyrauYaw, -11, 8),
    localPoint(add(atyrauNorth, atyrauDirection, 8), atyrauYaw, -10, -8),
  ],
  pier: {
    access: [[65, 14], [65, 29]] as const,
    landing: rectangle([65, 31], 4.5, 1.7, 0),
  },
} as const;

const OLD_CITY_CENTRE = [-58, 88] as const;
const oldCityYaw = Math.atan2(OLD_CITY_CENTRE[1], OLD_CITY_CENTRE[0]) + Math.PI / 2;
export const OLD_CITY_FRAME = {
  boundary: rectangle(OLD_CITY_CENTRE, 17, 12, oldCityYaw),
  houses: [
    rectangle(localPoint(OLD_CITY_CENTRE, oldCityYaw, 0, -8.6), 11, 2.5, oldCityYaw),
    rectangle(localPoint(OLD_CITY_CENTRE, oldCityYaw, 0, 8.6), 11, 2.5, oldCityYaw),
    rectangle(localPoint(OLD_CITY_CENTRE, oldCityYaw, -14, 0), 2.4, 5.2, oldCityYaw),
    rectangle(localPoint(OLD_CITY_CENTRE, oldCityYaw, 14, 0), 2.4, 5.2, oldCityYaw),
  ],
} as const;

const OUTER_ROAD_RADIUS = 119;
const OUTER_ROAD_SCALE = OUTER_ROAD_RADIUS / RING_RADIUS;
export const OUTER_ROAD_FRAME: readonly PlanPoint[] = Array.from(
  { length: 65 },
  (_, step) => {
    const point = ringPathPoint(RING_PATH_LENGTH * step / 64);
    return [point[0] * OUTER_ROAD_SCALE, point[1] * OUTER_ROAD_SCALE] as const;
  },
);

type PathMaterial = "stone" | "asphalt" | "concrete" | "grass";

function addCellSegment(
  target: MutableGroup,
  id: string,
  from: PlanPoint,
  to: PlanPoint,
  width: number,
  colour: string,
  top = FRAME_TOP,
  material: PathMaterial = "stone",
): void {
  const dx = to[0] - from[0];
  const dz = to[1] - from[1];
  const span = Math.hypot(dx, dz);
  if (span < 0.05) return;
  const pieces = Math.max(1, Math.ceil(span / FRAME_CELL));
  const pitch = span / pieces;
  const visibleLength = Math.max(0.35, pitch - FRAME_GAP);
  const yaw = Math.atan2(-dz, dx);
  for (let piece = 0; piece < pieces; piece += 1) {
    const amount = (piece + 0.5) / pieces;
    const x = from[0] + dx * amount;
    const z = from[1] + dz * amount;
    const ground = groundUnder(x, z).top;
    const renderTop = Math.max(top, ground + FRAME_HEIGHT + 0.03);
    const centreY = renderTop - FRAME_HEIGHT / 2;
    const size = [visibleLength, FRAME_HEIGHT, width] as const;
    primitive(
      target,
      `${id}:${piece}`,
      material,
      "groundTile",
      [x, centreY, z],
      size,
      colour,
      {
        rotation: [0, yaw, 0],
        bearsLoad: false,
        bearingArea: visibleLength * width,
        volume: visibleLength * width * 0.035,
        contactBoxes: [groundSeatBox(centreY, size, ground)],
      },
    );
  }
}

function addPolyline(
  target: MutableGroup,
  id: string,
  points: readonly PlanPoint[],
  width: number,
  colour: string,
  top = FRAME_TOP,
  material: PathMaterial = "stone",
): void {
  for (let index = 1; index < points.length; index += 1) {
    addCellSegment(target, `${id}:${index - 1}`, points[index - 1], points[index], width,
      colour, top, material);
  }
}

function addPlantedIsland(
  target: MutableGroup,
  id: string,
  perimeter: readonly PlanPoint[],
): void {
  const points = perimeter.slice(0, -1);
  const centre: PlanPoint = [
    points.reduce((sum, point) => sum + point[0], 0) / points.length,
    points.reduce((sum, point) => sum + point[1], 0) / points.length,
  ];
  const covariance = points.reduce((sum, point) => {
    const x = point[0] - centre[0];
    const z = point[1] - centre[1];
    return [sum[0] + x * x, sum[1] + x * z, sum[2] + z * z];
  }, [0, 0, 0]);
  const yaw = 0.5 * Math.atan2(2 * covariance[1], covariance[0] - covariance[2]);
  const forward: PlanPoint = [Math.cos(yaw), Math.sin(yaw)];
  const across: PlanPoint = [-forward[1], forward[0]];
  const radiusForward = Math.max(...points.map((point) => Math.abs(
    (point[0] - centre[0]) * forward[0] + (point[1] - centre[1]) * forward[1],
  )));
  const radiusAcross = Math.max(...points.map((point) => Math.abs(
    (point[0] - centre[0]) * across[0] + (point[1] - centre[1]) * across[1],
  )));
  const inset = 0.85;
  const height = 0.22;
  const ground = groundUnder(centre[0], centre[1]).top;
  const top = Math.max(FRAME_TOP + 0.095, ground + height + 0.035);
  const size = [
    Math.max(0.7, 2 * (radiusForward - inset)),
    height,
    Math.max(0.55, 2 * (radiusAcross - inset)),
  ] as const;
  primitive(
    target,
    `${id}:bed`,
    "grass",
    "cylinder",
    [centre[0], top - height / 2, centre[1]],
    size,
    COLOURS.junctionPlanting,
    {
      rotation: [0, -yaw, 0],
      bearsLoad: false,
      bearingArea: size[0] * size[2] * 0.7,
      volume: size[0] * size[2] * height * 0.55,
      contactBoxes: [groundSeatBox(top - height / 2, size, ground)],
    },
  );
  addPolyline(target, `${id}:edge`, perimeter,
    0.55, COLOURS.junctionPlanting, top + 0.01, "grass");
}

function blendColour(from: string, to: string, amount: number): string {
  const channel = (value: string, offset: number): number =>
    Number.parseInt(value.slice(offset, offset + 2), 16);
  const blended = [1, 3, 5].map((offset) => Math.round(
    channel(from, offset) + (channel(to, offset) - channel(from, offset)) * amount,
  ));
  return `#${blended.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function addGradientPolyline(
  target: MutableGroup,
  id: string,
  points: readonly PlanPoint[],
  width: number,
  fromColour: string,
  toColour: string,
  top = FRAME_TOP,
  fromMaterial: PathMaterial = "stone",
  toMaterial: PathMaterial = fromMaterial,
): void {
  const lengths = points.slice(1).map((point, index) =>
    Math.hypot(point[0] - points[index][0], point[1] - points[index][1]));
  const total = Math.max(0.001, lengths.reduce((sum, length) => sum + length, 0));
  let travelled = 0;
  for (let index = 1; index < points.length; index += 1) {
    const length = lengths[index - 1];
    const linear = (travelled + length / 2) / total;
    const local = Math.max(0, Math.min(1, (linear - 0.36) / 0.28));
    const amount = local * local * (3 - 2 * local);
    const transitionWidth = width * (1 + 0.1 * Math.sin(Math.PI * local));
    addCellSegment(
      target,
      `${id}:${index - 1}`,
      points[index - 1],
      points[index],
      transitionWidth,
      blendColour(fromColour, toColour, amount),
      top,
      amount < 0.5 ? fromMaterial : toMaterial,
    );
    travelled += length;
  }
}

function addCorridorEdges(
  target: MutableGroup,
  id: string,
  points: readonly PlanPoint[],
  halfWidth: number,
  colour: string,
): void {
  const direction = normalize([
    points[points.length - 1][0] - points[0][0],
    points[points.length - 1][1] - points[0][1],
  ]);
  const normal: PlanPoint = [-direction[1], direction[0]];
  for (const side of [-1, 1] as const) {
    addPolyline(
      target,
      `${id}:${side < 0 ? "left" : "right"}`,
      points.map((point) => add(point, normal, side * halfWidth)),
      0.58,
      colour,
      FRAME_TOP + 0.025,
    );
  }
}

export function createAstanaFramework(target: MutableGroup): void {
  addPolyline(target, "pedestrian:baiterek-ring", PEDESTRIAN_STUDY.rings.baiterek,
    4.4, COLOURS.ceremonialWhite, FRAME_TOP + 0.055);
  addPolyline(target, "pedestrian:khan-ring", PEDESTRIAN_STUDY.rings.khan,
    4.2, COLOURS.coreStone, FRAME_TOP + 0.045);
  addPolyline(target, "pedestrian:opera-ring", PEDESTRIAN_STUDY.rings.opera,
    4, COLOURS.civicStone, FRAME_TOP + 0.04);
  addPolyline(target, "pedestrian:arch-ring", PEDESTRIAN_STUDY.rings.arch,
    3.6, COLOURS.civicStone, FRAME_TOP + 0.035);
  PEDESTRIAN_STUDY.orbitSegments.expo.forEach((segment, index) =>
    addPolyline(target, `pedestrian:expo-orbit:${index}`, segment,
      4.8, COLOURS.expoAsphalt, FRAME_TOP + 0.02, "asphalt"));

  Object.entries(PEDESTRIAN_STUDY.stationForecourts).forEach(([station, trunk]) =>
    addPolyline(target, `pedestrian:station-forecourt:${station}:threshold`, trunk,
      6.6, COLOURS.expoAsphalt, FRAME_TOP + 0.035, "asphalt"));
  Object.entries(PEDESTRIAN_STUDY.junctions.stations).forEach(([station, arms]) =>
    arms.forEach((arm, index) =>
      addPolyline(target, `pedestrian:station-forecourt:${station}:arm:${index}`, arm,
        4.5, COLOURS.expoAsphalt, FRAME_TOP + 0.03, "asphalt")));
  Object.entries(PEDESTRIAN_STUDY.junctionIslands.stations).forEach(
    ([station, island]) => addPlantedIsland(
      target, `pedestrian:station-forecourt:${station}:island`, island,
    ),
  );

  // Ось Хан Шатыр — Байтерек уже существует как две белые гранитные
  // дорожки Нуржола с цветниками между ними. Повторная центральная лента
  // закрыла бы цветы и вернула наложение поверхностей; в графе ось хранится
  // только как проверяемая связь. У самого шатра она раскрывается в два
  // касательных рукава вокруг небольшого цветочного островка.
  PEDESTRIAN_STUDY.junctions.khanAxis.forEach((arm, index) =>
    addGradientPolyline(target, `pedestrian:khan-axis-arm:${index}`, arm,
      3.8, COLOURS.ceremonialWhite, COLOURS.coreStone, FRAME_TOP + 0.05));
  addPlantedIsland(target, "pedestrian:khan-axis-island",
    PEDESTRIAN_STUDY.junctionIslands.khanAxis,
  );
  addGradientPolyline(target, "pedestrian:khan-opera",
    PEDESTRIAN_STUDY.civicLinks.khanOpera,
    4, COLOURS.coreStone, COLOURS.civicStone, FRAME_TOP + 0.04);
  addGradientPolyline(target, "pedestrian:khan-east-station",
    PEDESTRIAN_STUDY.civicLinks.khanEastStation,
    4, COLOURS.coreStone, COLOURS.expoAsphalt, FRAME_TOP + 0.03,
    "stone", "asphalt");
  addGradientPolyline(target, "pedestrian:opera-baiterek",
    PEDESTRIAN_STUDY.civicLinks.operaBaiterek,
    4.2, COLOURS.civicStone, COLOURS.ceremonialWhite, FRAME_TOP + 0.05);
  PEDESTRIAN_STUDY.junctions.operaForecourt.forEach((arm, index) =>
    addGradientPolyline(target, `pedestrian:opera-forecourt-arm:${index}`, arm,
      3.8, COLOURS.ceremonialWhite, COLOURS.civicStone, FRAME_TOP + 0.045));
  addPlantedIsland(target, "pedestrian:opera-forecourt-island",
    PEDESTRIAN_STUDY.junctionIslands.operaForecourt,
  );
  addGradientPolyline(target, "pedestrian:opera-arena",
    PEDESTRIAN_STUDY.civicLinks.operaArena,
    4, COLOURS.civicStone, COLOURS.expoAsphalt, FRAME_TOP + 0.03,
    "stone", "asphalt");
  addGradientPolyline(target, "pedestrian:opera-expo",
    PEDESTRIAN_STUDY.civicLinks.operaExpo,
    4.1, COLOURS.civicStone, COLOURS.expoAsphalt, FRAME_TOP + 0.03,
    "stone", "asphalt");
  addGradientPolyline(target, "pedestrian:baiterek-arch",
    PEDESTRIAN_STUDY.civicLinks.baiterekArch,
    4.2, COLOURS.ceremonialWhite, COLOURS.civicStone, FRAME_TOP + 0.045);
  addPolyline(target, "pedestrian:arch-passage",
    PEDESTRIAN_STUDY.civicLinks.archPassage,
    3.8, COLOURS.civicStone, FRAME_TOP + 0.04);
  addGradientPolyline(target, "pedestrian:baiterek-expo",
    PEDESTRIAN_STUDY.civicLinks.baiterekExpo,
    4.2, COLOURS.ceremonialWhite, COLOURS.expoAsphalt, FRAME_TOP + 0.025,
    "stone", "asphalt");
  Object.entries(PEDESTRIAN_STUDY.junctions.expo).forEach(([gate, arms]) =>
    arms.forEach((arm, index) =>
      addPolyline(target, `pedestrian:expo-gate:${gate}:${index}`, arm,
        3.7, COLOURS.expoAsphalt, FRAME_TOP + 0.022, "asphalt")));
  PEDESTRIAN_STUDY.junctionIslands.expo.forEach((island, index) =>
    addPlantedIsland(target, `pedestrian:expo-gate-island:${index}`, island));
  addGradientPolyline(target, "pedestrian:virgin-lands-baiterek",
    PEDESTRIAN_STUDY.civicLinks.virginLandsBaiterek,
    4.4, COLOURS.civicStone, COLOURS.ceremonialWhite, FRAME_TOP + 0.04);

  addPolyline(target, "pedestrian:pyramid-baiterek",
    PEDESTRIAN_STUDY.civicLinks.pyramidBaiterek,
    5.2, COLOURS.ceremonialWhite, FRAME_TOP + 0.065);
  addPolyline(target, "pedestrian:pyramid-side-south",
    PEDESTRIAN_STUDY.civicLinks.pyramidSideSouth,
    4.4, COLOURS.ceremonialWhite, FRAME_TOP + 0.04);
  addPolyline(target, "pedestrian:pyramid-side-north",
    PEDESTRIAN_STUDY.civicLinks.pyramidSideNorth,
    4.4, COLOURS.ceremonialWhite, FRAME_TOP + 0.04);

  addPolyline(target, "pedestrian:quay-south", PEDESTRIAN_STUDY.quays.south,
    4.6, COLOURS.quayGranite, FRAME_TOP + 0.018);
  addPolyline(target, "pedestrian:quay-north", PEDESTRIAN_STUDY.quays.north,
    4.6, COLOURS.quayGranite, FRAME_TOP + 0.018);
  addPolyline(target, "pedestrian:atyrau-south-quay-connector",
    PEDESTRIAN_STUDY.civicLinks.atyrauSouthQuayConnector,
    4.2, COLOURS.quayGranite, FRAME_TOP + 0.02);
  PEDESTRIAN_STUDY.junctions.atyrauSouth.forEach((arm, index) =>
    addGradientPolyline(target, `pedestrian:atyrau-south-fan:${index}`, arm,
      4.2, COLOURS.quayGranite, COLOURS.coreStone, FRAME_TOP + 0.04));
  addPlantedIsland(target, "pedestrian:atyrau-south-fan-island",
    PEDESTRIAN_STUDY.junctionIslands.atyrauSouth,
  );
  addPolyline(target, "pedestrian:atyrau-north-quay-connector",
    PEDESTRIAN_STUDY.civicLinks.atyrauNorthQuayConnector,
    4.2, COLOURS.quayGranite, FRAME_TOP + 0.02);
  addGradientPolyline(target, "pedestrian:atyrau-khan",
    PEDESTRIAN_STUDY.civicLinks.atyrauKhan,
    4.2, COLOURS.ceremonialWhite, COLOURS.coreStone, FRAME_TOP + 0.04);
  addGradientPolyline(target, "pedestrian:atyrau-baiterek",
    PEDESTRIAN_STUDY.civicLinks.atyrauBaiterek,
    4.2, COLOURS.ceremonialWhite, COLOURS.coreStone, FRAME_TOP + 0.04);
  addPolyline(target, "pedestrian:atyrau-outer",
    PEDESTRIAN_STUDY.civicLinks.atyrauOuter,
    4, COLOURS.expoAsphalt, FRAME_TOP + 0.018, "asphalt");
  addGradientPolyline(target, "pedestrian:east-atyrau",
    PEDESTRIAN_STUDY.civicLinks.eastAtyrau,
    4, COLOURS.expoAsphalt, COLOURS.quayGranite, FRAME_TOP + 0.02,
    "asphalt", "stone");
  // The Expo wireframe retired when the real plaza and four crescent
  // pavilions were built. Keeping it would draw a second, conflicting set
  // of footprints through the finished complex.

  addCorridorEdges(target, "atyrau:pier-access", ATYRAU_BANK_FRAME.pier.access,
    1.1, COLOURS.pier);
  addPolyline(target, "atyrau:pier-landing", ATYRAU_BANK_FRAME.pier.landing,
    0.72, COLOURS.pier);

  addPolyline(target, "old-city:boundary", OLD_CITY_FRAME.boundary,
    0.7, COLOURS.oldCity);
  OLD_CITY_FRAME.houses.forEach((house, index) =>
    addPolyline(target, `old-city:house:${index}`, house, 0.82, COLOURS.oldCity,
      FRAME_TOP + 0.02));

  addPolyline(target, "outer-road", OUTER_ROAD_FRAME, 1.2, COLOURS.outerRoad,
    FRAME_TOP - 0.025);
}
