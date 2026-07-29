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
} from "./astanaLayout.ts";
import {
  RING_PATH_LENGTH,
  RING_RADIUS,
  astanaBridges,
  ringPathPoint,
  valleyHalfWidth,
  type PlanPoint,
} from "./astanaPlan.ts";
import {
  PYRAMID_ENTRANCE_OUTER_DISTANCE,
  PYRAMID_PODIUM_HALF_SIZE,
} from "./astanaPyramidPodium.ts";
import {
  LAND_BASE_RADIUS,
  groundUnder,
  riverAxisZ,
} from "./astanaShell.ts";

const FRAME_HEIGHT = 0.16;
const FRAME_CELL = 2.35;
const FRAME_GAP = 0.12;
const FRAME_TOP = 0.34;

const COLOURS = {
  pyramid: "#b18c55",
  expo: "#3e7d86",
  riverUrban: "#80959b",
  riverPark: "#78866d",
  pier: "#4e8290",
  oldCity: "#aa7656",
  outerRoad: "#555d5d",
  coreGranite: "#ddd9cf",
  civicGranite: "#cac8c0",
  quayGranite: "#bcbab2",
  expoAsphalt: "#aeb3b3",
  parkOutline: "#8f9d82",
} as const;

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

function catmullRom(
  controls: readonly PlanPoint[],
  closed: boolean,
  stepsPerSpan = 6,
): readonly PlanPoint[] {
  const points: PlanPoint[] = [];
  const spanCount = closed ? controls.length : controls.length - 1;
  const at = (index: number): PlanPoint => {
    if (closed) return controls[(index + controls.length) % controls.length];
    return controls[Math.max(0, Math.min(controls.length - 1, index))];
  };
  for (let span = 0; span < spanCount; span += 1) {
    const p0 = at(span - 1);
    const p1 = at(span);
    const p2 = at(span + 1);
    const p3 = at(span + 2);
    for (let step = 0; step < stepsPerSpan; step += 1) {
      const t = step / stepsPerSpan;
      const t2 = t * t;
      const t3 = t2 * t;
      points.push([
        0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t
          + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2
          + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t
          + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2
          + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  points.push(closed ? points[0] : controls[controls.length - 1]);
  return points;
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

function rayToRadius(
  origin: PlanPoint,
  direction: PlanPoint,
  radius: number,
): PlanPoint {
  const projection = origin[0] * direction[0] + origin[1] * direction[1];
  const discriminant = projection ** 2 + radius ** 2
    - origin[0] ** 2 - origin[1] ** 2;
  return add(origin, direction, -projection + Math.sqrt(Math.max(0, discriminant)));
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

function pyramidQuayPoint(direction: PlanPoint): PlanPoint {
  const side = Math.sign(direction[1]) || 1;
  for (let distance = PYRAMID_ENTRANCE_OUTER_DISTANCE; distance <= 46; distance += 0.5) {
    const point = add(PYRAMID_CENTRE, direction, distance);
    const offset = point[1] - riverAxisZ(point[0]);
    if (side * offset >= valleyHalfWidth(point[0]) - 2) return point;
  }
  return add(PYRAMID_CENTRE, direction, 46);
}

export const PYRAMID_FRAME = {
  podium: rectangle(
    PYRAMID_CENTRE,
    PYRAMID_PODIUM_HALF_SIZE,
    PYRAMID_PODIUM_HALF_SIZE,
    PYRAMID_YAW,
  ),
  rays: [
    [
      add(PYRAMID_CENTRE, pyramidToBaiterek, PYRAMID_ENTRANCE_OUTER_DISTANCE + 0.5),
      add(PYRAMID_CENTRE, pyramidToBaiterek, pyramidToBaiterekDistance - 18.5),
    ],
    [
      add(PYRAMID_CENTRE, pyramidSideNormals[0], PYRAMID_ENTRANCE_OUTER_DISTANCE + 0.5),
      rayToRadius(PYRAMID_CENTRE, pyramidSideNormals[0], LAND_BASE_RADIUS - 6),
    ],
    [
      add(PYRAMID_CENTRE, pyramidSideNormals[1], PYRAMID_ENTRANCE_OUTER_DISTANCE + 0.5),
      rayToRadius(PYRAMID_CENTRE, pyramidSideNormals[1], LAND_BASE_RADIUS - 6),
    ],
  ] as const,
} as const;

const BAITEREK_WALK_RING_RADIUS = 19.2;
const ARCH_WALK_RING_RADII = [10.5, 5.5] as const;
const NUR_ALEM_WALK_RING_RADIUS = 24;
const operaNurzhol = toNurzhol(OPERA_CENTRE);
/**
 * Проверяемый перенос, а не новая утверждённая координата: корпус подходит
 * к Нуржолу на 7 м, оставляя перед фронтоном 9-метровый сад-променад.
 */
export const OPERA_STUDY_CENTRE = fromNurzhol(operaNurzhol[0], operaNurzhol[1] + 7);
const operaForecourt = fromNurzhol(operaNurzhol[0], operaNurzhol[1] + 16);
const khanToOpera = fromNurzhol(44, operaNurzhol[1] + 16);
const baiterekOperaJoin = fromNurzhol(0, -BAITEREK_WALK_RING_RADIUS);
const baiterekArchJoin = pointOnEllipseToward(
  BAITEREK_CENTRE,
  BAITEREK_WALK_RING_RADIUS,
  BAITEREK_WALK_RING_RADIUS,
  0,
  ARCH_CENTRE,
);
const archFromBaiterek = pointOnEllipseToward(
  ARCH_CENTRE,
  ARCH_WALK_RING_RADII[0],
  ARCH_WALK_RING_RADII[1],
  Math.atan2(NURZHOL_ALONG_VECTOR[1], NURZHOL_ALONG_VECTOR[0]),
  BAITEREK_CENTRE,
);
const archToExpo = pointOnEllipseToward(
  ARCH_CENTRE,
  ARCH_WALK_RING_RADII[0],
  ARCH_WALK_RING_RADII[1],
  Math.atan2(NURZHOL_ALONG_VECTOR[1], NURZHOL_ALONG_VECTOR[0]),
  NUR_ALEM_CENTRE,
);
const expoFromArch = pointOnEllipseToward(
  NUR_ALEM_CENTRE,
  NUR_ALEM_WALK_RING_RADIUS,
  NUR_ALEM_WALK_RING_RADIUS,
  0,
  ARCH_CENTRE,
);

const baiterekNecklace = catmullRom([
  fromNurzhol(-18.6, 0),
  fromNurzhol(-14, 13.5),
  fromNurzhol(-2, 19.8),
  fromNurzhol(10.5, 17),
  fromNurzhol(19, 8),
  fromNurzhol(20, -5),
  fromNurzhol(14, -15.2),
  fromNurzhol(4, -19.8),
  fromNurzhol(-9.5, -18),
  fromNurzhol(-17.5, -10),
], true, 7);

const khanNecklace = catmullRom([
  fromNurzhol(38.2, 0),
  fromNurzhol(41, 16),
  fromNurzhol(52, 25),
  fromNurzhol(69, 28),
  fromNurzhol(85, 20),
  fromNurzhol(92, 6),
  fromNurzhol(90, -12),
  fromNurzhol(80, -24),
  fromNurzhol(62, -28),
  fromNurzhol(46, -22),
  fromNurzhol(38, -10),
], true, 7);

const expoNecklace = catmullRom([
  fromNurzhol(4, -48),
  fromNurzhol(23, -54),
  fromNurzhol(29, -70),
  fromNurzhol(24, -86),
  fromNurzhol(8, -95),
  fromNurzhol(-12, -90),
  fromNurzhol(-22, -75),
  fromNurzhol(-19, -60),
  fromNurzhol(-7, -50),
], true, 7);

function quay(side: -1 | 1): readonly PlanPoint[] {
  return Array.from({ length: 49 }, (_, step) => {
    const x = -108 + step * 4.5;
    return [
      x,
      riverAxisZ(x) + side * (valleyHalfWidth(x) - 2),
    ];
  });
}

const atyrauSouthApproach = (() => {
  const bridge = astanaBridges.find((candidate) => candidate.id === "footbridge");
  if (!bridge) throw new Error("Atyrau bridge must exist before its promenade study");
  const start = bridge.axis[0];
  const khanJoin = pointOnEllipseToward(
    KHAN_SHATYR_CENTRE,
    25.5,
    25,
    0,
    start,
  );
  return cubicBezier(
    start,
    [start[0] - 4, start[1] - 8],
    [khanJoin[0] - 5, khanJoin[1] + 8],
    khanJoin,
    14,
  );
})();

const atyrauNorthApproach = (() => {
  const bridge = astanaBridges.find((candidate) => candidate.id === "footbridge");
  if (!bridge) throw new Error("Atyrau bridge must exist before its outer approach");
  const start = bridge.axis[bridge.axis.length - 1];
  const radius = Math.hypot(start[0], start[1]) || 1;
  const end: PlanPoint = [start[0] * 88 / radius, start[1] * 88 / radius];
  return cubicBezier(
    start,
    [start[0] + 1.5, start[1] + 3],
    [end[0] - 2, end[1] - 3],
    end,
    10,
  );
})();

export const PEDESTRIAN_STUDY = {
  rings: {
    baiterek: baiterekNecklace,
    khan: khanNecklace,
    arch: ellipse(ARCH_CENTRE, ARCH_WALK_RING_RADII[0], ARCH_WALK_RING_RADII[1],
      Math.atan2(NURZHOL_ALONG_VECTOR[1], NURZHOL_ALONG_VECTOR[0])),
    expo: expoNecklace,
  },
  civicLinks: {
    khanOperaBaiterek: catmullRom([
      khanToOpera,
      fromNurzhol(37, operaNurzhol[1] + 14),
      operaForecourt,
      fromNurzhol(17, -20.5),
      fromNurzhol(7, -21),
      baiterekOperaJoin,
    ], false, 6),
    baiterekArch: cubicBezier(
      baiterekArchJoin,
      add(baiterekArchJoin, normalize([
        ARCH_CENTRE[0] - BAITEREK_CENTRE[0],
        ARCH_CENTRE[1] - BAITEREK_CENTRE[1],
      ]), 4),
      add(archFromBaiterek, normalize([
        BAITEREK_CENTRE[0] - ARCH_CENTRE[0],
        BAITEREK_CENTRE[1] - ARCH_CENTRE[1],
      ]), 4),
      archFromBaiterek,
    ),
    archExpo: cubicBezier(
      archToExpo,
      add(archToExpo, normalize([
        NUR_ALEM_CENTRE[0] - ARCH_CENTRE[0],
        NUR_ALEM_CENTRE[1] - ARCH_CENTRE[1],
      ]), 5),
      add(expoFromArch, normalize([
        ARCH_CENTRE[0] - NUR_ALEM_CENTRE[0],
        ARCH_CENTRE[1] - NUR_ALEM_CENTRE[1],
      ]), 6),
      expoFromArch,
    ),
    pyramidBaiterek: [PYRAMID_FRAME.rays[0][0], PYRAMID_FRAME.rays[0][1]],
    pyramidSouthQuay: [
      PYRAMID_FRAME.rays[1][0],
      pyramidQuayPoint(pyramidSideNormals[0]),
    ],
    pyramidNorthQuay: [
      PYRAMID_FRAME.rays[2][0],
      pyramidQuayPoint(pyramidSideNormals[1]),
    ],
    atyrauKhan: atyrauSouthApproach,
    atyrauOuter: atyrauNorthApproach,
  },
  quays: {
    south: quay(-1),
    north: quay(1),
  },
  atyrauParks: [
    ellipse([40.5, -1.5], 7.5, 10, 0.12, 32),
    ellipse([57.5, -1], 7.5, 10, -0.12, 32),
  ],
} as const;

export const NUR_ALEM_FRAME_CENTRE = [-43, -58] as const;
const expoForward = normalize([
  NUR_ALEM_FRAME_CENTRE[0] - ARCH_CENTRE[0],
  NUR_ALEM_FRAME_CENTRE[1] - ARCH_CENTRE[1],
]);
const expoAcross: PlanPoint = [-expoForward[1], expoForward[0]];
const expoYaw = Math.atan2(expoForward[1], expoForward[0]);
const expoPoint = (along: number, across: number): PlanPoint => [
  NUR_ALEM_FRAME_CENTRE[0] + expoForward[0] * along + expoAcross[0] * across,
  NUR_ALEM_FRAME_CENTRE[1] + expoForward[1] * along + expoAcross[1] * across,
];

export const NUR_ALEM_FRAME = {
  /** Ось начинается за Аркой, проходит точно через её шестиметровый проём. */
  approach: [add(ARCH_CENTRE, expoForward, -8), ARCH_CENTRE, expoPoint(-15, 0)],
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

function addCellSegment(
  target: MutableGroup,
  id: string,
  from: PlanPoint,
  to: PlanPoint,
  width: number,
  colour: string,
  top = FRAME_TOP,
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
      "stone",
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
): void {
  for (let index = 1; index < points.length; index += 1) {
    addCellSegment(target, `${id}:${index - 1}`, points[index - 1], points[index], width,
      colour, top);
  }
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
): void {
  const spans = Math.max(1, points.length - 1);
  for (let index = 1; index < points.length; index += 1) {
    addCellSegment(
      target,
      `${id}:${index - 1}`,
      points[index - 1],
      points[index],
      width,
      blendColour(fromColour, toColour, (index - 0.5) / spans),
      top,
    );
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
    2.45, COLOURS.coreGranite, FRAME_TOP + 0.045);
  addPolyline(target, "pedestrian:khan-ring", PEDESTRIAN_STUDY.rings.khan,
    2.7, COLOURS.coreGranite, FRAME_TOP + 0.04);
  addPolyline(target, "pedestrian:arch-ring", PEDESTRIAN_STUDY.rings.arch,
    2.5, COLOURS.civicGranite, FRAME_TOP + 0.04);
  addPolyline(target, "pedestrian:expo-ring", PEDESTRIAN_STUDY.rings.expo,
    2.8, COLOURS.expoAsphalt, FRAME_TOP + 0.025);

  addPolyline(target, "pedestrian:khan-opera-baiterek",
    PEDESTRIAN_STUDY.civicLinks.khanOperaBaiterek,
    3.1, COLOURS.civicGranite, FRAME_TOP + 0.04);
  addPolyline(target, "pedestrian:baiterek-arch",
    PEDESTRIAN_STUDY.civicLinks.baiterekArch,
    3.1, COLOURS.civicGranite, FRAME_TOP + 0.04);
  addGradientPolyline(target, "pedestrian:arch-expo",
    PEDESTRIAN_STUDY.civicLinks.archExpo,
    3.35, COLOURS.civicGranite, COLOURS.expoAsphalt, FRAME_TOP + 0.03);

  addPolyline(target, "pedestrian:pyramid-baiterek",
    PEDESTRIAN_STUDY.civicLinks.pyramidBaiterek,
    3.35, COLOURS.coreGranite, FRAME_TOP + 0.05);
  addPolyline(target, "pedestrian:pyramid-south-quay",
    PEDESTRIAN_STUDY.civicLinks.pyramidSouthQuay,
    3.2, COLOURS.coreGranite, FRAME_TOP + 0.05);
  addPolyline(target, "pedestrian:pyramid-north-quay",
    PEDESTRIAN_STUDY.civicLinks.pyramidNorthQuay,
    3.2, COLOURS.coreGranite, FRAME_TOP + 0.05);

  addPolyline(target, "pedestrian:quay-south", PEDESTRIAN_STUDY.quays.south,
    3.45, COLOURS.quayGranite, FRAME_TOP + 0.02);
  addPolyline(target, "pedestrian:quay-north", PEDESTRIAN_STUDY.quays.north,
    3.45, COLOURS.quayGranite, FRAME_TOP + 0.02);
  addPolyline(target, "pedestrian:atyrau-khan",
    PEDESTRIAN_STUDY.civicLinks.atyrauKhan,
    3.1, COLOURS.coreGranite, FRAME_TOP + 0.035);
  addPolyline(target, "pedestrian:atyrau-outer",
    PEDESTRIAN_STUDY.civicLinks.atyrauOuter,
    3.1, COLOURS.expoAsphalt, FRAME_TOP + 0.02);
  PEDESTRIAN_STUDY.atyrauParks.forEach((park, index) =>
    addPolyline(target, `pedestrian:atyrau-park:${index}`, park,
      0.62, COLOURS.parkOutline, FRAME_TOP + 0.015));

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
