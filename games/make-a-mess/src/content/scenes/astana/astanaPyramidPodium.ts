// SPDX-License-Identifier: CC-BY-NC-ND-4.0
// SPDX-FileCopyrightText: 2026 Igor Kirisiuk
//
// Фантазийное основание-мост Дворца мира и согласия. Сама Пирамида остаётся
// прежним габаритным объёмом; этот файл определяет только поднятую бетонную
// плиту и три входных подъёма. Опоры проектируются как часть цельного
// складчатого подиума, а не как отдельные стержни.

import type { SceneVector3 } from "../../../game/destructionScene.ts";
import type { MutableGroup } from "./astanaAuthoring.ts";
import { orient, primitive } from "./astanaAuthoring.ts";
import { ATYRAU_FRAME_WHITE } from "./astanaAtyrau.ts";
import {
  NURZHOL_ACROSS_VECTOR,
  NURZHOL_ALONG_VECTOR,
  PYRAMID_CENTRE,
  PYRAMID_YAW,
  type LayoutPoint,
} from "./astanaLayout.ts";
import { groundUnder } from "./astanaShell.ts";
import {
  ASTANA_LANDMARK_LIGHT_PRIORITY,
  ASTANA_LANDMARK_LOCAL_POOL_CAPACITY,
  ASTANA_PYRAMID_LIGHT_GROUP,
} from "./astanaLighting.ts";

export const PYRAMID_PODIUM_SIDE = 30;
export const PYRAMID_PODIUM_HALF_SIZE = PYRAMID_PODIUM_SIDE / 2;
export const PYRAMID_NAVIGATION_CLEARANCE = 4.2;
export const PYRAMID_PODIUM_THICKNESS = 1.2;
export const PYRAMID_PODIUM_TOP =
  PYRAMID_NAVIGATION_CLEARANCE + PYRAMID_PODIUM_THICKNESS;

// Реальный Дворец не начинает стеклянную грань прямо от мощения: он стоит
// на невысокой озеленённой насыпи, а входы прорезаны в её склонах. Здесь
// насыпь также разводит две независимые отметки — прогулочную плиту моста и
// основание стеклянной оболочки — не опуская судоходный просвет над Есилем.
export const PYRAMID_MOUND_HEIGHT = 3.2;
export const PYRAMID_MOUND_TOP = PYRAMID_PODIUM_TOP + PYRAMID_MOUND_HEIGHT;
export const PYRAMID_MOUND_BOTTOM_HALF_SIZE = 14.55;
export const PYRAMID_MOUND_TOP_HALF_SIZE = 12.3;
export const PYRAMID_MOUND_LAYERS = 14;

export const PYRAMID_ENTRANCE_LENGTH = 19;
export const PYRAMID_ENTRANCE_INNER_WIDTH = 6;
export const PYRAMID_ENTRANCE_OUTER_WIDTH = 13.5;
export const PYRAMID_ENTRANCE_OUTER_DISTANCE =
  PYRAMID_PODIUM_HALF_SIZE + PYRAMID_ENTRANCE_LENGTH;

const SLAB_COLOUR = ATYRAU_FRAME_WHITE;
const RAMP_COLOUR = ATYRAU_FRAME_WHITE;
const RAMP_EDGE_COLOUR = ATYRAU_FRAME_WHITE;
export const PYRAMID_RAIL_BRONZE = "#9b6a3a";
const RAMP_SEGMENTS = 8;
const RAMP_THICKNESS = 0.28;
const RAMP_EDGE_SIZE = 0.38;
const RAMP_EDGE_HEIGHT = 0.46;
const RAIL_POST_HEIGHT = 0.78;
const RAIL_POST_DIAMETER = 0.075;
const HANDRAIL_DIAMETER = 0.1;
const RAIL_POST_INTERVAL = 2;

const MOUND_COLOUR = "#707858";
const MOUND_CORRIDOR_INNER_DISTANCE = 9.35;
const MOUND_CORRIDOR_OUTER_WIDTH = 5.8;
const MOUND_CORRIDOR_TOP_WIDTH = 4.8;

export const PYRAMID_PORTAL_OUTER_WIDTH = 5.8;
export const PYRAMID_PORTAL_INNER_WIDTH = 4.4;
export const PYRAMID_PORTAL_HEIGHT = 2.78;
// The visible mouth is not the outer edge of the mound. It sits directly
// below the glass face, so the landscaped slope continues in front of it
// and the entrance reads as a cut through the Pyramid rather than a box
// attached to the end of a tunnel.
export const PYRAMID_PORTAL_MOUTH_DISTANCE = 12.02;
export const PYRAMID_PORTAL_DEPTH =
  PYRAMID_PORTAL_MOUTH_DISTANCE - MOUND_CORRIDOR_INNER_DISTANCE;
export const PYRAMID_ENTRANCE_LIGHT_COLOUR = "#ffd0a0";
export const PYRAMID_ENTRANCE_LIGHT_DISTANCE = 32;
export const PYRAMID_ENTRANCE_LIGHT_INTENSITY = 26;

const PORTAL_DARK = "#111820";
const PORTAL_SEGMENTS = 5;

interface EntranceTopology {
  // `nurzhol` names the axis, not the landmark at its far end. This keeps
  // generated ids inside the Pyramid namespace instead of being mistaken
  // for Baiterek's own architectural-lighting inventory.
  readonly id: "nurzhol" | "side-positive" | "side-negative";
  readonly normal: LayoutPoint;
  readonly tangent: LayoutPoint;
  readonly innerCentre: LayoutPoint;
  readonly outerCentre: LayoutPoint;
  readonly innerEdges: readonly [LayoutPoint, LayoutPoint];
  readonly outerEdges: readonly [LayoutPoint, LayoutPoint];
}

function add2(point: LayoutPoint, direction: LayoutPoint, distance: number): LayoutPoint {
  return [point[0] + direction[0] * distance, point[1] + direction[1] * distance];
}

function entrance(
  id: EntranceTopology["id"],
  normal: LayoutPoint,
  tangent: LayoutPoint,
): EntranceTopology {
  const innerCentre = add2(PYRAMID_CENTRE, normal, PYRAMID_PODIUM_HALF_SIZE);
  const outerCentre = add2(PYRAMID_CENTRE, normal, PYRAMID_ENTRANCE_OUTER_DISTANCE);
  return {
    id,
    normal,
    tangent,
    innerCentre,
    outerCentre,
    innerEdges: [
      add2(innerCentre, tangent, -PYRAMID_ENTRANCE_INNER_WIDTH / 2),
      add2(innerCentre, tangent, PYRAMID_ENTRANCE_INNER_WIDTH / 2),
    ],
    outerEdges: [
      add2(outerCentre, tangent, -PYRAMID_ENTRANCE_OUTER_WIDTH / 2),
      add2(outerCentre, tangent, PYRAMID_ENTRANCE_OUTER_WIDTH / 2),
    ],
  };
}

export const PYRAMID_ENTRANCES: readonly EntranceTopology[] = [
  entrance("nurzhol", NURZHOL_ALONG_VECTOR, NURZHOL_ACROSS_VECTOR),
  entrance(
    "side-positive",
    NURZHOL_ACROSS_VECTOR,
    [-NURZHOL_ALONG_VECTOR[0], -NURZHOL_ALONG_VECTOR[1]],
  ),
  entrance(
    "side-negative",
    [-NURZHOL_ACROSS_VECTOR[0], -NURZHOL_ACROSS_VECTOR[1]],
    NURZHOL_ALONG_VECTOR,
  ),
] as const;

function cross(a: readonly [number, number, number], b: readonly [number, number, number]): [number, number, number] {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function normalise(vector: SceneVector3): SceneVector3 {
  const length = Math.hypot(...vector);
  return length > 1e-9
    ? [vector[0] / length, vector[1] / length, vector[2] / length]
    : [1, 0, 0];
}

function addRailMember(
  target: MutableGroup,
  id: string,
  from: SceneVector3,
  to: SceneVector3,
  diameter: number,
): void {
  const chord: SceneVector3 = [
    to[0] - from[0],
    to[1] - from[1],
    to[2] - from[2],
  ];
  const length = Math.hypot(...chord);
  if (length < 0.02) return;
  const axis = normalise(chord);
  const helper: SceneVector3 = Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const transverse = normalise(cross(helper, axis));
  primitive(
    target,
    id,
    "steel",
    "cylinder",
    [
      (from[0] + to[0]) / 2,
      (from[1] + to[1]) / 2,
      (from[2] + to[2]) / 2,
    ],
    [diameter, length, diameter],
    PYRAMID_RAIL_BRONZE,
    {
      rotation: orient(transverse, axis),
      textureProfile: "painted-steel",
      bearsLoad: false,
      volume: length * diameter * diameter * 0.5,
    },
  );
}

function createSlab(target: MutableGroup): void {
  const centreY = PYRAMID_NAVIGATION_CLEARANCE + PYRAMID_PODIUM_THICKNESS / 2;
  primitive(
    target,
    "podium:slab",
    "steel",
    "panel",
    [PYRAMID_CENTRE[0], centreY, PYRAMID_CENTRE[1]],
    [PYRAMID_PODIUM_SIDE, PYRAMID_PODIUM_THICKNESS, PYRAMID_PODIUM_SIDE],
    SLAB_COLOUR,
    {
      rotation: [0, -PYRAMID_YAW, 0],
      textureProfile: "painted-steel",
      bearingArea: PYRAMID_PODIUM_SIDE ** 2,
      carriesAttachments: true,
      attachmentSupportMode: "cable",
      sideAttachmentReach: 1.1,
      volume: PYRAMID_PODIUM_SIDE ** 2 * PYRAMID_PODIUM_THICKNESS,
    },
  );

  // Ранее здесь лежала вторая тонкая плита с той же нижней плоскостью, что
  // и основной объём. Две поверхности спорили за один пиксель и давали рябь.
  // Теперь низ принадлежит ровно одной детали, а бронза существует только
  // как четыре вертикальные полосы по периметру.
  const stripDepth = 0.065;
  const stripHeight = 0.16;
  const stripY = PYRAMID_PODIUM_TOP - 0.15;
  const yaw = -PYRAMID_YAW;
  const localX: LayoutPoint = [Math.cos(yaw), -Math.sin(yaw)];
  const localZ: LayoutPoint = [Math.sin(yaw), Math.cos(yaw)];
  for (const side of [-1, 1] as const) {
    primitive(
      target,
      `podium:bronze-band:x:${side}`,
      "steel",
      "panel",
      [
        PYRAMID_CENTRE[0] + localX[0] * side * (PYRAMID_PODIUM_HALF_SIZE + stripDepth / 2),
        stripY,
        PYRAMID_CENTRE[1] + localX[1] * side * (PYRAMID_PODIUM_HALF_SIZE + stripDepth / 2),
      ],
      [stripDepth, stripHeight, PYRAMID_PODIUM_SIDE],
      PYRAMID_RAIL_BRONZE,
      {
        rotation: [0, yaw, 0],
        textureProfile: "painted-steel",
        bearsLoad: false,
        volume: stripDepth * stripHeight * PYRAMID_PODIUM_SIDE,
      },
    );
    primitive(
      target,
      `podium:bronze-band:z:${side}`,
      "steel",
      "panel",
      [
        PYRAMID_CENTRE[0] + localZ[0] * side * (PYRAMID_PODIUM_HALF_SIZE + stripDepth / 2),
        stripY,
        PYRAMID_CENTRE[1] + localZ[1] * side * (PYRAMID_PODIUM_HALF_SIZE + stripDepth / 2),
      ],
      [PYRAMID_PODIUM_SIDE, stripHeight, stripDepth],
      PYRAMID_RAIL_BRONZE,
      {
        rotation: [0, yaw, 0],
        textureProfile: "painted-steel",
        bearsLoad: false,
        volume: stripDepth * stripHeight * PYRAMID_PODIUM_SIDE,
      },
    );
  }
}

function moundPoint(along: number, across: number): SceneVector3 {
  return [
    PYRAMID_CENTRE[0]
      + NURZHOL_ALONG_VECTOR[0] * along
      + NURZHOL_ACROSS_VECTOR[0] * across,
    0,
    PYRAMID_CENTRE[1]
      + NURZHOL_ALONG_VECTOR[1] * along
      + NURZHOL_ACROSS_VECTOR[1] * across,
  ];
}

/**
 * Пять непересекающихся прямоугольников дают квадрат без трёх коридоров:
 * +along, +across и -across. Следующий слой уже предыдущего, поэтому их
 * наружные кромки образуют один регулярный склон, а не набор наложенных
 * поверхностей. Входы остаются физически свободными на всю глубину насыпи.
 */
function createMoundLayer(
  target: MutableGroup,
  layer: number,
  halfSize: number,
  corridorWidth: number,
): void {
  const layerHeight = PYRAMID_MOUND_HEIGHT / PYRAMID_MOUND_LAYERS;
  const centreY = PYRAMID_PODIUM_TOP + (layer + 0.5) * layerHeight;
  const halfCorridor = corridorWidth / 2;
  const inner = MOUND_CORRIDOR_INNER_DISTANCE;
  const regions = [
    { id: "back", along: [-halfSize, -halfCorridor], across: [-halfSize, halfSize] },
    { id: "core", along: [-halfCorridor, halfCorridor], across: [-inner, inner] },
    { id: "middle", along: [halfCorridor, inner], across: [-halfSize, halfSize] },
    { id: "front-positive", along: [inner, halfSize], across: [halfCorridor, halfSize] },
    { id: "front-negative", along: [inner, halfSize], across: [-halfSize, -halfCorridor] },
  ] as const;
  const yaw = -PYRAMID_YAW;

  for (const region of regions) {
    const alongCentre = (region.along[0] + region.along[1]) / 2;
    const acrossCentre = (region.across[0] + region.across[1]) / 2;
    const alongLength = region.along[1] - region.along[0];
    const acrossLength = region.across[1] - region.across[0];
    if (alongLength <= 0 || acrossLength <= 0) continue;
    const point = moundPoint(alongCentre, acrossCentre);
    primitive(
      target,
      `mound:layer:${layer}:${region.id}`,
      "grass",
      "panel",
      [point[0], centreY, point[2]],
      [acrossLength, layerHeight, alongLength],
      MOUND_COLOUR,
      {
        rotation: [0, yaw, 0],
        landscapeSurface: "city-ground",
        bearsLoad: true,
        carriesAttachments: true,
        attachmentSupportMode: "wall",
        sideAttachmentReach: 0.28,
        volume: acrossLength * layerHeight * alongLength,
      },
    );
  }
}

function createMound(target: MutableGroup): void {
  for (let layer = 0; layer < PYRAMID_MOUND_LAYERS; layer += 1) {
    const t = layer / Math.max(1, PYRAMID_MOUND_LAYERS - 1);
    const halfSize = PYRAMID_MOUND_BOTTOM_HALF_SIZE
      + (PYRAMID_MOUND_TOP_HALF_SIZE - PYRAMID_MOUND_BOTTOM_HALF_SIZE) * t;
    const corridorWidth = MOUND_CORRIDOR_OUTER_WIDTH
      + (MOUND_CORRIDOR_TOP_WIDTH - MOUND_CORRIDOR_OUTER_WIDTH) * t;
    createMoundLayer(target, layer, halfSize, corridorWidth);
  }
}

function portalPoint(
  topology: EntranceTopology,
  distance: number,
  tangentOffset = 0,
  y = 0,
): SceneVector3 {
  return [
    PYRAMID_CENTRE[0]
      + topology.normal[0] * distance
      + topology.tangent[0] * tangentOffset,
    y,
    PYRAMID_CENTRE[1]
      + topology.normal[1] * distance
      + topology.tangent[1] * tangentOffset,
  ];
}

function createPortalTunnel(
  target: MutableGroup,
  topology: EntranceTopology,
): void {
  const outerDistance = PYRAMID_PORTAL_MOUTH_DISTANCE;
  const innerDistance = MOUND_CORRIDOR_INNER_DISTANCE;
  const floorY = PYRAMID_PODIUM_TOP + 0.08;
  const ceilingY = floorY + PYRAMID_PORTAL_HEIGHT;
  const up: SceneVector3 = [0, 1, 0];
  const tangent: SceneVector3 = [topology.tangent[0], 0, topology.tangent[1]];
  const normal: SceneVector3 = [topology.normal[0], 0, topology.normal[1]];

  // Пол и потолок повторяют сужение блока в плане. Соседние модули сходятся
  // торцами: это не пять почти одинаковых плит, лежащих друг на друге.
  for (let segment = 0; segment < PORTAL_SEGMENTS; segment += 1) {
    const t0 = segment / PORTAL_SEGMENTS;
    const t1 = (segment + 1) / PORTAL_SEGMENTS;
    const tm = (t0 + t1) / 2;
    const distance0 = outerDistance
      + (innerDistance - outerDistance) * t0;
    const distance1 = outerDistance
      + (innerDistance - outerDistance) * t1;
    const distance = (distance0 + distance1) / 2;
    const width = PYRAMID_PORTAL_OUTER_WIDTH
      + (PYRAMID_PORTAL_INNER_WIDTH - PYRAMID_PORTAL_OUTER_WIDTH) * tm;
    const depth = Math.abs(distance1 - distance0);
    const point = portalPoint(topology, distance);
    for (const surface of ["floor", "ceiling"] as const) {
      const y = surface === "floor" ? floorY - 0.06 : ceilingY + 0.06;
      primitive(
        target,
        `portal:${topology.id}:${surface}:${segment}`,
        "steel",
        "panel",
        [point[0], y, point[2]],
        [width, 0.12, depth],
        SLAB_COLOUR,
        {
          rotation: orient(tangent, up),
          textureProfile: "painted-steel",
          bearsLoad: surface === "floor",
          carriesAttachments: surface === "ceiling",
          attachmentSupportMode: "wall",
          sideAttachmentReach: 0.3,
          volume: width * 0.12 * depth,
        },
      );
    }
  }

  // Две боковые стены лежат на точных прямых от широкой наружной кромки к
  // узкой внутренней. Значит, все три входа — один и тот же трапециевидный
  // блок, только в разных координатных базисах.
  for (const side of [-1, 1] as const) {
    const outer = portalPoint(
      topology,
      outerDistance,
      side * PYRAMID_PORTAL_OUTER_WIDTH / 2,
      (floorY + ceilingY) / 2,
    );
    const inner = portalPoint(
      topology,
      innerDistance,
      side * PYRAMID_PORTAL_INNER_WIDTH / 2,
      (floorY + ceilingY) / 2,
    );
    for (let wallSegment = 0; wallSegment < PORTAL_SEGMENTS; wallSegment += 1) {
      const t0 = wallSegment / PORTAL_SEGMENTS;
      const t1 = (wallSegment + 1) / PORTAL_SEGMENTS;
      const p0: SceneVector3 = [
        outer[0] + (inner[0] - outer[0]) * t0,
        outer[1],
        outer[2] + (inner[2] - outer[2]) * t0,
      ];
      const p1: SceneVector3 = [
        outer[0] + (inner[0] - outer[0]) * t1,
        inner[1],
        outer[2] + (inner[2] - outer[2]) * t1,
      ];
      const chord: SceneVector3 = [p1[0] - p0[0], 0, p1[2] - p0[2]];
      const length = Math.hypot(...chord);
      primitive(
        target,
        `portal:${topology.id}:side-wall:${side}:${wallSegment}`,
        "steel",
        "panel",
        [
          (p0[0] + p1[0]) / 2,
          (floorY + ceilingY) / 2,
          (p0[2] + p1[2]) / 2,
        ],
        [length + 0.025, PYRAMID_PORTAL_HEIGHT, 0.16],
        SLAB_COLOUR,
        {
          rotation: orient(chord, up),
          textureProfile: "painted-steel",
          bearsLoad: true,
          carriesAttachments: false,
          attachmentSupportMode: "wall",
          sideAttachmentReach: 0.42,
          bearingArea: length * 0.16,
          // Aluminium-faced hollow cassette on a bottom channel, not a
          // solid 160 mm steel billet.  The previous solid volume overloaded
          // the very floor that visibly carries the wall.
          volume: length * PYRAMID_PORTAL_HEIGHT * 0.16 * 0.08,
        },
      );
    }

    // The jamb is recessed under the Pyramid face. Its two physical ends
    // define one sloping member; no freestanding frame is allowed at the
    // outer edge of the mound.
    const frameDistance = outerDistance - 0.16;
    const bottom = portalPoint(
      topology,
      frameDistance,
      side * PYRAMID_PORTAL_OUTER_WIDTH / 2,
      floorY,
    );
    const top = portalPoint(
      topology,
      frameDistance,
      side * MOUND_CORRIDOR_TOP_WIDTH / 2,
      ceilingY,
    );
    const jambAxis: SceneVector3 = [
      top[0] - bottom[0],
      top[1] - bottom[1],
      top[2] - bottom[2],
    ];
    primitive(
      target,
      `portal:${topology.id}:sloped-jamb:${side}`,
      "steel",
      "panel",
      [
        (bottom[0] + top[0]) / 2,
        (bottom[1] + top[1]) / 2,
        (bottom[2] + top[2]) / 2,
      ],
      [0.52, Math.hypot(...jambAxis), 0.34],
      SLAB_COLOUR,
      {
        rotation: orient(normal, jambAxis),
        textureProfile: "painted-steel",
        bearsLoad: false,
        volume: 0.52 * Math.hypot(...jambAxis) * 0.34,
      },
    );
  }

  // The head is a shallow strip of the Pyramid plane itself. In section its
  // 1:2 run/rise is the same as the 12 m half-side to 24 m apex rise. That
  // is the missing sloping beam: it closes the roof joint without projecting
  // a horizontal lintel from the tunnel.
  const faceRun = 0.5;
  const faceRise = faceRun * PYRAMID_PORTAL_HEIGHT / 1.39;
  const faceSlope: SceneVector3 = [
    -topology.normal[0] * faceRun,
    faceRise,
    -topology.normal[1] * faceRun,
  ];
  const faceTangent: SceneVector3 = [
    topology.tangent[0],
    0,
    topology.tangent[1],
  ];
  const faceNormal = normalise(cross(faceSlope, faceTangent));
  const lintel = portalPoint(
    topology,
    outerDistance - faceRun / 2,
    0,
    ceilingY + faceRise / 2,
  );
  primitive(
    target,
    `portal:${topology.id}:sloped-head`,
    "steel",
    "panel",
    lintel,
    [MOUND_CORRIDOR_TOP_WIDTH + 0.35, 0.22, Math.hypot(...faceSlope)],
    SLAB_COLOUR,
    {
      rotation: orient(faceTangent, faceNormal),
      textureProfile: "painted-steel",
      bearsLoad: false,
      volume:
        (MOUND_CORRIDOR_TOP_WIDTH + 0.35) * 0.22 * Math.hypot(...faceSlope),
    },
  );

  const doors = portalPoint(
    topology,
    innerDistance - 0.03,
    0,
    floorY + (PYRAMID_PORTAL_HEIGHT - 0.22) / 2,
  );
  primitive(
    target,
    `portal:${topology.id}:dark-glass-doors`,
    "darkGlass",
    "glassPane",
    doors,
    [PYRAMID_PORTAL_INNER_WIDTH - 0.36, PYRAMID_PORTAL_HEIGHT - 0.22, 0.08],
    "#24343c",
    {
      rotation: orient(tangent, up),
      bearsLoad: false,
      sideAttachmentReach: 0.12,
      volume: 0.04,
    },
  );

  // Свет спрятан за тёмной потолочной диафрагмой. С улицы виден тёплый
  // объём входа, но не точка лампы и не самосветящаяся поверхность.
  const fixtureDistance = outerDistance
    + (innerDistance - outerDistance) * 0.58;
  const fixture = portalPoint(
    topology,
    fixtureDistance,
    0,
    ceilingY - 0.12,
  );
  primitive(
    target,
    `portal:${topology.id}:hidden-light-baffle`,
    "steel",
    "steelSheet",
    fixture,
    [1.35, 0.08, 0.72],
    PORTAL_DARK,
    {
      rotation: orient(tangent, up),
      textureProfile: "matte-aluminium",
      bearsLoad: false,
      volume: 0.04,
      light: {
        color: PYRAMID_ENTRANCE_LIGHT_COLOUR,
        distance: PYRAMID_ENTRANCE_LIGHT_DISTANCE,
        intensity: PYRAMID_ENTRANCE_LIGHT_INTENSITY,
        position: [0, -0.5, 0],
        dayIntensityFactor: 0,
        poolPriority: ASTANA_LANDMARK_LIGHT_PRIORITY,
        localPoolCapacity: ASTANA_LANDMARK_LOCAL_POOL_CAPACITY,
        poolGroupId: ASTANA_PYRAMID_LIGHT_GROUP,
        transition: { fadeInSeconds: 1.8, fadeOutSeconds: 1.5 },
      },
    },
  );
}

function createEntranceRamp(target: MutableGroup, topology: EntranceTopology): void {
  const outerGround = groundUnder(topology.outerCentre[0], topology.outerCentre[1]).top;
  const outerTop = outerGround + 0.16;
  const innerTop = PYRAMID_PODIUM_TOP + 0.02;
  const rise = innerTop - outerTop;
  const segmentLength = PYRAMID_ENTRANCE_LENGTH / RAMP_SEGMENTS;
  const alongFromOuter: SceneVector3 = [
    -topology.normal[0],
    rise / PYRAMID_ENTRANCE_LENGTH,
    -topology.normal[1],
  ];
  const across: SceneVector3 = [topology.tangent[0], 0, topology.tangent[1]];
  const surfaceNormal = cross(alongFromOuter, across);
  const surfaceLength = Math.hypot(...alongFromOuter);
  const unitNormal: SceneVector3 = [
    surfaceNormal[0] / Math.hypot(...surfaceNormal),
    surfaceNormal[1] / Math.hypot(...surfaceNormal),
    surfaceNormal[2] / Math.hypot(...surfaceNormal),
  ];

  for (let segment = 0; segment < RAMP_SEGMENTS; segment += 1) {
    const t = (segment + 0.5) / RAMP_SEGMENTS;
    const width = PYRAMID_ENTRANCE_OUTER_WIDTH
      + (PYRAMID_ENTRANCE_INNER_WIDTH - PYRAMID_ENTRANCE_OUTER_WIDTH) * t;
    const plan = add2(
      topology.outerCentre,
      [-topology.normal[0], -topology.normal[1]],
      PYRAMID_ENTRANCE_LENGTH * t,
    );
    const surfaceY = outerTop + rise * t;
    const centre: SceneVector3 = [
      plan[0] - unitNormal[0] * RAMP_THICKNESS / 2,
      surfaceY - unitNormal[1] * RAMP_THICKNESS / 2,
      plan[1] - unitNormal[2] * RAMP_THICKNESS / 2,
    ];
    const size = [width, RAMP_THICKNESS, segmentLength * surfaceLength] as const;
    primitive(
      target,
      `entrance:${topology.id}:floor:${segment}`,
      "steel",
      "panel",
      centre,
      size,
      RAMP_COLOUR,
      {
        rotation: orient(across, surfaceNormal),
        textureProfile: "painted-steel",
        bearingArea: width * segmentLength,
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.55,
        volume: width * segmentLength * RAMP_THICKNESS,
      },
    );

    // Борт не висит одной длинной балкой между двумя концами: каждый его
    // модуль стоит на соответствующем модуле наклонной плиты. Центры этих
    // модулей всё равно лежат на одной точной расходящейся прямой.
    for (const side of [-1, 1] as const) {
      const edgeOffset = side * (width / 2 - RAMP_EDGE_SIZE / 2);
      const riseAboveFloor = RAMP_THICKNESS / 2 + RAMP_EDGE_HEIGHT / 2;
      primitive(
        target,
        `entrance:${topology.id}:diverging-edge:${side}:${segment}`,
        "steel",
        "panel",
        [
          centre[0] + across[0] * edgeOffset + unitNormal[0] * riseAboveFloor,
          centre[1] + across[1] * edgeOffset + unitNormal[1] * riseAboveFloor,
          centre[2] + across[2] * edgeOffset + unitNormal[2] * riseAboveFloor,
        ],
        [RAMP_EDGE_SIZE, RAMP_EDGE_HEIGHT, segmentLength * surfaceLength],
        RAMP_EDGE_COLOUR,
        {
          rotation: orient(across, surfaceNormal),
          textureProfile: "painted-steel",
          bearsLoad: false,
          volume: RAMP_EDGE_SIZE * RAMP_EDGE_HEIGHT * segmentLength,
        },
      );
    }
  }

  // Белые расходящиеся борта получают лёгкий бронзовый верхний слой.
  // Стойки стоят только на каждом втором стыке: частая бронзовая гребёнка
  // читалась отдельным декоративным забором. Поручень при этом остаётся
  // одной точной линией без щелей и ступенчатых изломов.
  for (const side of [-1, 1] as const) {
    const handrailPoints: SceneVector3[] = [];
    for (let post = 0; post <= RAMP_SEGMENTS; post += 1) {
      const t = post / RAMP_SEGMENTS;
      const width = PYRAMID_ENTRANCE_OUTER_WIDTH
        + (PYRAMID_ENTRANCE_INNER_WIDTH - PYRAMID_ENTRANCE_OUTER_WIDTH) * t;
      const plan = add2(
        topology.outerCentre,
        [-topology.normal[0], -topology.normal[1]],
        PYRAMID_ENTRANCE_LENGTH * t,
      );
      const edgeOffset = side * (width / 2 - RAMP_EDGE_SIZE / 2);
      const surfaceY = outerTop + rise * t;
      const baseY = surfaceY + RAMP_EDGE_HEIGHT;
      const topY = baseY + RAIL_POST_HEIGHT;
      const x = plan[0] + topology.tangent[0] * edgeOffset;
      const z = plan[1] + topology.tangent[1] * edgeOffset;
      if (post % RAIL_POST_INTERVAL === 0) {
        primitive(
          target,
          `entrance:${topology.id}:rail-post:${side}:${post}`,
          "steel",
          "cylinder",
          [x, baseY + RAIL_POST_HEIGHT / 2, z],
          [RAIL_POST_DIAMETER, RAIL_POST_HEIGHT, RAIL_POST_DIAMETER],
          PYRAMID_RAIL_BRONZE,
          {
            textureProfile: "painted-steel",
            bearsLoad: false,
            volume: RAIL_POST_DIAMETER ** 2 * RAIL_POST_HEIGHT * 0.5,
          },
        );
      }
      handrailPoints.push([x, topY, z]);
    }
    addRailMember(
      target,
      `entrance:${topology.id}:handrail:${side}`,
      handrailPoints[0],
      handrailPoints[handrailPoints.length - 1],
      HANDRAIL_DIAMETER,
    );
  }
}

export function createAstanaPyramidPodium(
  slab: MutableGroup,
  entrances: MutableGroup,
  mound: MutableGroup,
): void {
  createSlab(slab);
  createMound(mound);
  PYRAMID_ENTRANCES.forEach((topology) => createEntranceRamp(entrances, topology));
  PYRAMID_ENTRANCES.forEach((topology) => createPortalTunnel(entrances, topology));
}
