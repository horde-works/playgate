// SPDX-License-Identifier: CC-BY-NC-ND-4.0
// SPDX-FileCopyrightText: 2026 Igor Kirisiuk
//
// Наземная насыпь Дворца мира и согласия. Прежние поднятая бетонная плита и
// три длинных пандуса были компромиссом посадки над Есилем и больше не
// создаются: на внешнем полуострове Пирамида стоит на честном грунте.

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

export const PYRAMID_ENTRANCE_INNER_DISTANCE = 15;
export const PYRAMID_GROUND_TOP = groundUnder(
  PYRAMID_CENTRE[0],
  PYRAMID_CENTRE[1],
).top;

// Реальный Дворец не начинает стеклянную грань прямо от мощения: он стоит
// на невысокой озеленённой насыпи, а входы прорезаны в её склонах.
export const PYRAMID_MOUND_HEIGHT = 3.2;
export const PYRAMID_MOUND_TOP = PYRAMID_GROUND_TOP + PYRAMID_MOUND_HEIGHT;
export const PYRAMID_MOUND_BOTTOM_HALF_SIZE = 14.55;
export const PYRAMID_MOUND_TOP_HALF_SIZE = 12.3;
export const PYRAMID_MOUND_LAYERS = 14;

export const PYRAMID_ENTRANCE_LENGTH = 19;
export const PYRAMID_ENTRANCE_INNER_WIDTH = 6;
export const PYRAMID_ENTRANCE_OUTER_WIDTH = 13.5;
export const PYRAMID_ENTRANCE_OUTER_DISTANCE =
  PYRAMID_ENTRANCE_INNER_DISTANCE + PYRAMID_ENTRANCE_LENGTH;

const SLAB_COLOUR = ATYRAU_FRAME_WHITE;

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
  const innerCentre = add2(PYRAMID_CENTRE, normal, PYRAMID_ENTRANCE_INNER_DISTANCE);
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
  const centreY = PYRAMID_GROUND_TOP + (layer + 0.5) * layerHeight;
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
  const floorY = PYRAMID_GROUND_TOP + 0.08;
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


export function createAstanaPyramidGround(
  entrances: MutableGroup,
  mound: MutableGroup,
): void {
  createMound(mound);
  PYRAMID_ENTRANCES.forEach((topology) => createPortalTunnel(entrances, topology));
}
