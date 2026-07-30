// SPDX-License-Identifier: CC-BY-NC-ND-4.0
// SPDX-FileCopyrightText: 2026 Igor Kirisiuk
//
// Дворец мира и согласия. Реальный абсолют — 62 × 62 × 62 м и пять
// треугольных поясов фасада. На острове один коэффициент 24 / 62 даёт
// 24 × 24 × 24 м. Стекло и сталь строятся из одной барицентрической сетки:
// у каждой ячейки и каждого ребра есть вычисленные общие вершины.

import type { SceneVector3 } from "../../../game/destructionScene.ts";
import type { MutableGroup } from "./astanaAuthoring.ts";
import { orient, primitive } from "./astanaAuthoring.ts";
import { PYRAMID_CENTRE, PYRAMID_YAW } from "./astanaLayout.ts";
import {
  ASTANA_LANDMARK_LIGHT_PRIORITY,
  ASTANA_LANDMARK_LOCAL_POOL_CAPACITY,
  ASTANA_LANDMARK_MIN_LIGHT_DISTANCE,
  ASTANA_PYRAMID_LIGHT_GROUP,
} from "./astanaLighting.ts";
import { PYRAMID_MOUND_TOP } from "./astanaPyramidPodium.ts";

export const PYRAMID_REAL_SIZE_METRES = 62;
export const PYRAMID_SIDE = 24;
export const PYRAMID_HEIGHT = 24;
export const PYRAMID_GRID_DIVISIONS = 5;
export const PYRAMID_MODULE = PYRAMID_SIDE / PYRAMID_GRID_DIVISIONS;
export const PYRAMID_CELL_COUNT = 4 * PYRAMID_GRID_DIVISIONS ** 2;
export const PYRAMID_FRAME_EDGE_COUNT = 160;

const HALF_SIDE = PYRAMID_SIDE / 2;
const FRAME_COLOUR = "#dfe3e2";
// The Palace is dense blue-grey glass, not clear window glazing. Both zones
// use darkGlass so the city cannot be read through the shell by day; the
// upper cells carry the deeper blue programme visible in references.
export const PYRAMID_LOWER_GLASS = "#849aa4";
const STAINED_GLASS = ["#294d62", "#35687c", "#4c788a"] as const;
const INTERNAL_FRAME_DIAMETER = 0.17;
const BOUNDARY_FRAME_DIAMETER = 0.24;
const GLASS_THICKNESS = 0.055;
const GLASS_FILL = 0.956;
const GLASS_INSET = 0.035;
const EPSILON = 1e-8;
const INTERIOR_BAFFLE = "#131c24";
export const PYRAMID_UPPER_LIGHT_COUNT = 9;
export const PYRAMID_UPPER_LIGHT_COLOURS = [
  "#5d9fe8",
  "#58c8c5",
  "#826ca8",
] as const;

type PyramidFaceId = "south" | "east" | "north" | "west";
type FacePoint = readonly [x: number, y: number];

interface FaceDefinition {
  readonly id: PyramidFaceId;
  readonly a: SceneVector3;
  readonly b: SceneVector3;
  readonly apex: SceneVector3;
}

export interface PyramidGlassCellTopology {
  readonly id: string;
  readonly face: PyramidFaceId;
  readonly row: number;
  readonly inverted: boolean;
  readonly stained: boolean;
  readonly vertices: readonly [SceneVector3, SceneVector3, SceneVector3];
  readonly centre: SceneVector3;
  readonly rotation: SceneVector3;
  readonly faceNormal: SceneVector3;
}

export interface PyramidFrameEdgeTopology {
  readonly id: string;
  readonly from: SceneVector3;
  readonly to: SceneVector3;
  readonly boundary: boolean;
}

function add(a: SceneVector3, b: SceneVector3): SceneVector3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function subtract(a: SceneVector3, b: SceneVector3): SceneVector3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function scale(vector: SceneVector3, amount: number): SceneVector3 {
  return [vector[0] * amount, vector[1] * amount, vector[2] * amount];
}

function cross(a: SceneVector3, b: SceneVector3): SceneVector3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function normalise(vector: SceneVector3): SceneVector3 {
  const length = Math.hypot(...vector) || 1;
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

function midpoint(a: SceneVector3, b: SceneVector3): SceneVector3 {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
}

function centroid(
  vertices: readonly [SceneVector3, SceneVector3, SceneVector3],
): SceneVector3 {
  return [
    (vertices[0][0] + vertices[1][0] + vertices[2][0]) / 3,
    (vertices[0][1] + vertices[1][1] + vertices[2][1]) / 3,
    (vertices[0][2] + vertices[1][2] + vertices[2][2]) / 3,
  ];
}

function worldPoint(local: SceneVector3): SceneVector3 {
  const yaw = -PYRAMID_YAW;
  const cosine = Math.cos(yaw);
  const sine = Math.sin(yaw);
  return [
    PYRAMID_CENTRE[0] + cosine * local[0] + sine * local[2],
    PYRAMID_MOUND_TOP + local[1],
    PYRAMID_CENTRE[1] - sine * local[0] + cosine * local[2],
  ];
}

function addInteriorLighting(target: MutableGroup): void {
  const lights = [
    { face: "south", intensity: 32, distance: 36 },
    { face: "east", intensity: 28, distance: 34 },
    { face: "north", intensity: 24, distance: 32 },
  ] as const;
  for (let index = 0; index < lights.length; index += 1) {
    const light = lights[index];
    const cell = PYRAMID_GLASS_CELLS.find((candidate) =>
      candidate.face === light.face
        && candidate.row === PYRAMID_GRID_DIVISIONS - 2
        && !candidate.inverted);
    if (!cell) {
      throw new Error(`Pyramid upper light lost its ${light.face} stained cell`);
    }
    // faceNormal points into the volume. The former negative sign moved the
    // baffles in front of the glass and exposed three black boxes. The lamp
    // now sits behind the upper vertex, where a 0.24 m boundary member masks
    // a 0.10 m service node from every exterior view.
    const upperJoint = cell.vertices[2];
    const position = add(upperJoint, scale(cell.faceNormal, 0.19));
    primitive(
      target,
      `pyramid:lighting:hidden-upper-baffle:${index}`,
      "steel",
      "steelSheet",
      position,
      [0.1, 0.1, 0.1],
      INTERIOR_BAFFLE,
      {
        rotation: cell.rotation,
        textureProfile: "matte-aluminium",
        bearsLoad: false,
        sideAttachmentReach: 0.28,
        volume: 0.001,
        light: {
          color: PYRAMID_UPPER_LIGHT_COLOURS[index],
          distance: light.distance,
          intensity: light.intensity,
          position: [0, 0, 0],
          dayIntensityFactor: 0,
          poolPriority: ASTANA_LANDMARK_LIGHT_PRIORITY,
          localPoolCapacity: ASTANA_LANDMARK_LOCAL_POOL_CAPACITY,
          poolGroupId: ASTANA_PYRAMID_LIGHT_GROUP,
          transition: { fadeInSeconds: 2.2, fadeOutSeconds: 1.8 },
        },
      },
    );
  }

  // Six low-power fills sit well inside the upper volume. Their carriers
  // are smaller than the frame diameter and do not glow; together they wash
  // several stained cells instead of producing one bright reflected point.
  for (let fill = 0; fill < 6; fill += 1) {
    const angle = fill * Math.PI / 3 + (fill % 2) * Math.PI / 6;
    const radius = fill % 2 === 0 ? 3.2 : 2.25;
    const local: SceneVector3 = [
      radius * Math.cos(angle),
      fill % 2 === 0 ? 15.4 : 19.2,
      radius * Math.sin(angle),
    ];
    primitive(
      target,
      `pyramid:lighting:hidden-upper-baffle:${fill + lights.length}`,
      "steel",
      "steelSheet",
      worldPoint(local),
      [0.05, 0.05, 0.05],
      INTERIOR_BAFFLE,
      {
        textureProfile: "matte-aluminium",
        bearsLoad: false,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 1.8,
        volume: 0.0002,
        light: {
          color: PYRAMID_UPPER_LIGHT_COLOURS[fill % PYRAMID_UPPER_LIGHT_COLOURS.length],
          distance: ASTANA_LANDMARK_MIN_LIGHT_DISTANCE,
          intensity: fill % 2 === 0 ? 21 : 18,
          position: [0, 0, 0],
          dayIntensityFactor: 0,
          poolPriority: ASTANA_LANDMARK_LIGHT_PRIORITY,
          localPoolCapacity: ASTANA_LANDMARK_LOCAL_POOL_CAPACITY,
          poolGroupId: ASTANA_PYRAMID_LIGHT_GROUP,
          transition: { fadeInSeconds: 2.2, fadeOutSeconds: 1.8 },
        },
      },
    );
  }
}

const APEX = worldPoint([0, PYRAMID_HEIGHT, 0]);
const FACES: readonly FaceDefinition[] = [
  {
    id: "south",
    a: worldPoint([-HALF_SIDE, 0, -HALF_SIDE]),
    b: worldPoint([HALF_SIDE, 0, -HALF_SIDE]),
    apex: APEX,
  },
  {
    id: "east",
    a: worldPoint([HALF_SIDE, 0, HALF_SIDE]),
    b: worldPoint([HALF_SIDE, 0, -HALF_SIDE]),
    apex: APEX,
  },
  {
    id: "north",
    a: worldPoint([-HALF_SIDE, 0, HALF_SIDE]),
    b: worldPoint([HALF_SIDE, 0, HALF_SIDE]),
    apex: APEX,
  },
  {
    id: "west",
    a: worldPoint([-HALF_SIDE, 0, -HALF_SIDE]),
    b: worldPoint([-HALF_SIDE, 0, HALF_SIDE]),
    apex: APEX,
  },
] as const;

function boundaryCodes(point: FacePoint, slantHeight: number): readonly string[] {
  const result: string[] = [];
  if (Math.abs(point[1]) < EPSILON) result.push("base");
  const contraction = HALF_SIDE * point[1] / slantHeight;
  if (Math.abs(point[0] - (-HALF_SIDE + contraction)) < EPSILON) {
    result.push("left");
  }
  if (Math.abs(point[0] - (HALF_SIDE - contraction)) < EPSILON) {
    result.push("right");
  }
  return result;
}

function isBoundaryEdge(
  from: FacePoint,
  to: FacePoint,
  slantHeight: number,
): boolean {
  const fromCodes = boundaryCodes(from, slantHeight);
  const toCodes = new Set(boundaryCodes(to, slantHeight));
  return fromCodes.some((code) => toCodes.has(code));
}

function pointKey(point: SceneVector3): string {
  return point.map((coordinate) => coordinate.toFixed(7)).join(",");
}

function edgeKey(from: SceneVector3, to: SceneVector3): string {
  return [pointKey(from), pointKey(to)].sort().join("|");
}

function buildTopology(): {
  readonly cells: readonly PyramidGlassCellTopology[];
  readonly edges: readonly PyramidFrameEdgeTopology[];
} {
  const cells: PyramidGlassCellTopology[] = [];
  const edgeMap = new Map<
    string,
    { from: SceneVector3; to: SceneVector3; boundary: boolean }
  >();

  for (const face of FACES) {
    const baseDirection = normalise(subtract(face.b, face.a));
    const baseMidpoint = midpoint(face.a, face.b);
    const upDirection = normalise(subtract(face.apex, baseMidpoint));
    const faceNormal = normalise(cross(baseDirection, upDirection));
    const slantHeight = Math.hypot(...subtract(face.apex, baseMidpoint));
    const cellHeight = slantHeight / PYRAMID_GRID_DIVISIONS;

    const toWorld = ([x, y]: FacePoint): SceneVector3 => add(
      baseMidpoint,
      add(scale(baseDirection, x), scale(upDirection, y)),
    );

    const addCell = (
      row: number,
      index: number,
      inverted: boolean,
      localVertices: readonly [FacePoint, FacePoint, FacePoint],
    ): void => {
      const vertices = localVertices.map(toWorld) as unknown as readonly [
        SceneVector3,
        SceneVector3,
        SceneVector3,
      ];
      const exactCentre = centroid(vertices);
      const centre = add(exactCentre, scale(faceNormal, -GLASS_INSET));
      const xDirection = inverted ? scale(baseDirection, -1) : baseDirection;
      const yDirection = inverted ? scale(upDirection, -1) : upDirection;
      const stained = row >= PYRAMID_GRID_DIVISIONS - 2;
      cells.push({
        id: `${face.id}:row:${row}:${inverted ? "down" : "up"}:${index}`,
        face: face.id,
        row,
        inverted,
        stained,
        vertices,
        centre,
        rotation: orient(xDirection, yDirection),
        faceNormal,
      });

      const localEdges = [
        [0, 1],
        [1, 2],
        [2, 0],
      ] as const;
      for (const [fromIndex, toIndex] of localEdges) {
        const from = vertices[fromIndex];
        const to = vertices[toIndex];
        const key = edgeKey(from, to);
        const boundary = isBoundaryEdge(
          localVertices[fromIndex],
          localVertices[toIndex],
          slantHeight,
        );
        const existing = edgeMap.get(key);
        if (existing) {
          existing.boundary ||= boundary;
        } else {
          edgeMap.set(key, { from, to, boundary });
        }
      }
    };

    for (let row = 0; row < PYRAMID_GRID_DIVISIONS; row += 1) {
      const y0 = row * cellHeight;
      const y1 = (row + 1) * cellHeight;
      const left = -HALF_SIDE + row * PYRAMID_MODULE / 2;
      const upwardCount = PYRAMID_GRID_DIVISIONS - row;
      for (let column = 0; column < upwardCount; column += 1) {
        const x0 = left + column * PYRAMID_MODULE;
        const x1 = x0 + PYRAMID_MODULE;
        const apexX = (x0 + x1) / 2;
        addCell(row, column, false, [
          [x0, y0],
          [x1, y0],
          [apexX, y1],
        ]);
      }
      for (let column = 0; column < upwardCount - 1; column += 1) {
        const lowerX = left + (column + 1) * PYRAMID_MODULE;
        addCell(row, column, true, [
          [lowerX - PYRAMID_MODULE / 2, y1],
          [lowerX + PYRAMID_MODULE / 2, y1],
          [lowerX, y0],
        ]);
      }
    }
  }

  const edges = [...edgeMap.values()].map((edge, index) => ({
    id: `edge:${index}`,
    ...edge,
  }));
  return { cells, edges };
}

const topology = buildTopology();
export const PYRAMID_GLASS_CELLS = topology.cells;
export const PYRAMID_FRAME_EDGES = topology.edges;

function addFrameMember(
  target: MutableGroup,
  edge: PyramidFrameEdgeTopology,
): void {
  const chord = subtract(edge.to, edge.from);
  const length = Math.hypot(...chord);
  const axis = normalise(chord);
  const helper: SceneVector3 = Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const transverse = normalise(cross(helper, axis));
  const diameter = edge.boundary
    ? BOUNDARY_FRAME_DIAMETER
    : INTERNAL_FRAME_DIAMETER;
  primitive(
    target,
    `pyramid:frame:${edge.id}`,
    "steel",
    "cylinder",
    midpoint(edge.from, edge.to),
    [diameter, length, diameter],
    FRAME_COLOUR,
    {
      rotation: orient(transverse, axis),
      textureProfile: "painted-steel",
      bearingArea: diameter ** 2,
      carriesAttachments: true,
      attachmentSupportMode: "cable",
      sideAttachmentReach: 0.22,
      volume: length * diameter ** 2 * 0.55,
    },
  );
}

function addGlassCell(
  target: MutableGroup,
  cell: PyramidGlassCellTopology,
  index: number,
): void {
  const material = "darkGlass";
  const colour = cell.stained
    ? STAINED_GLASS[(index + cell.row) % STAINED_GLASS.length]
    : PYRAMID_LOWER_GLASS;
  const slantHeight = Math.sqrt(PYRAMID_HEIGHT ** 2 + HALF_SIDE ** 2);
  const cellHeight = slantHeight / PYRAMID_GRID_DIVISIONS;
  primitive(
    target,
    `pyramid:glass:${cell.id}`,
    material,
    "triangularSheet",
    cell.centre,
    [PYRAMID_MODULE * GLASS_FILL, cellHeight * GLASS_FILL, GLASS_THICKNESS],
    colour,
    {
      rotation: cell.rotation,
      bearsLoad: false,
      sideAttachmentReach: 0.16,
      volume:
        PYRAMID_MODULE * GLASS_FILL
        * cellHeight * GLASS_FILL
        * GLASS_THICKNESS / 2,
    },
  );
}

export function createAstanaPyramid(
  frame: MutableGroup,
  glass: MutableGroup,
  interior: MutableGroup,
): void {
  if (PYRAMID_GLASS_CELLS.length !== PYRAMID_CELL_COUNT) {
    throw new Error("Pyramid glass topology lost one of its triangular cells");
  }
  if (PYRAMID_FRAME_EDGES.length !== PYRAMID_FRAME_EDGE_COUNT) {
    throw new Error("Pyramid frame topology contains duplicate or missing edges");
  }
  PYRAMID_FRAME_EDGES.forEach((edge) => addFrameMember(frame, edge));
  PYRAMID_GLASS_CELLS.forEach((cell, index) => addGlassCell(glass, cell, index));
  addInteriorLighting(interior);
}
