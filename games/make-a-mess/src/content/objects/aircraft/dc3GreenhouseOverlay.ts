/**
 * DIAGNOSTIC ONLY. A DC-3 greenhouse as one connected house, then sat on
 * the unchanged B01 loft.
 *
 * Do not sample the oval. The real greenhouse is a riveted cage: one sill,
 * posts, one head, glass in the openings. Authored in body axes, then given
 * the same three-point sit as the airframe. This file must not enter the
 * world adapter or `dc3BlockoutObject.parts`.
 */

import type {
  ObjectLabPart,
  ObjectPoint,
  ObjectTriangle,
} from "../dutchWindmills/objectModel.ts";
import { dc3BlockoutObject } from "./dc3BlockoutObject.ts";

const GROUP = "greenhouse-overlay";
const FRAME_WIDTH = 0.05;
const FRAME_DEPTH = 0.055;
const GLASS_INSET = 0.028;
const GLASS_REBATE = 0.012;

// Same sit as dc3BlockoutObject. Duplicated so the airframe file stays closed.
const GEAR_BODY_Y = -2.7;
const GEAR_BODY_Z = 0.2;
const TAILWHEEL_BODY_Y = -0.52;
const TAILWHEEL_BODY_Z = -11.05;
const PITCH = Math.atan2(
  TAILWHEEL_BODY_Y - GEAR_BODY_Y,
  GEAR_BODY_Z - TAILWHEEL_BODY_Z,
);
const COS = Math.cos(PITCH);
const SIN = Math.sin(PITCH);

type Vector = ObjectPoint;

const add = (a: Vector, b: Vector): Vector => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vector, b: Vector): Vector => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Vector, s: number): Vector => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: Vector, b: Vector): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const length = (a: Vector): number => Math.hypot(a[0], a[1], a[2]);
const normalize = (a: Vector): Vector => {
  const size = length(a);
  return size > 1e-9 ? scale(a, 1 / size) : [0, 1, 0];
};
const cross = (a: Vector, b: Vector): Vector => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

function sit(body: Vector): Vector {
  const yR = body[1] - GEAR_BODY_Y;
  const zR = body[2] - GEAR_BODY_Z;
  return [body[0], yR * COS + zR * SIN, zR * COS - yR * SIN];
}

/**
 * NASM A19530075000: two raked windshields on a straight deck sill, heavy
 * centre mullion, a small cheek pane, then a rectangular sliding side light.
 * The house sits on the nose deck; the roof is metal, not glass.
 */
const node = {
  sillCenter: [0, 0.8, 6.5] as Vector,
  sillFrontRight: [0.56, 0.8, 6.44] as Vector,
  sillFrontLeft: [-0.56, 0.8, 6.44] as Vector,
  sillCornerRight: [0.94, 0.9, 6.08] as Vector,
  sillCornerLeft: [-0.94, 0.9, 6.08] as Vector,
  sillAftRight: [1.1, 1.0, 5.08] as Vector,
  sillAftLeft: [-1.1, 1.0, 5.08] as Vector,
  headCenter: [0, 1.5, 5.94] as Vector,
  headFrontRight: [0.6, 1.48, 5.9] as Vector,
  headFrontLeft: [-0.6, 1.48, 5.9] as Vector,
  headCornerRight: [0.98, 1.4, 5.68] as Vector,
  headCornerLeft: [-0.98, 1.4, 5.68] as Vector,
  headAftRight: [1.12, 1.36, 5.12] as Vector,
  headAftLeft: [-1.12, 1.36, 5.12] as Vector,
};

const SILL_EDGES: readonly (readonly [keyof typeof node, keyof typeof node])[] = [
  ["sillAftLeft", "sillCornerLeft"],
  ["sillCornerLeft", "sillFrontLeft"],
  ["sillFrontLeft", "sillCenter"],
  ["sillCenter", "sillFrontRight"],
  ["sillFrontRight", "sillCornerRight"],
  ["sillCornerRight", "sillAftRight"],
];

const HEAD_EDGES: readonly (readonly [keyof typeof node, keyof typeof node])[] = [
  ["headAftLeft", "headCornerLeft"],
  ["headCornerLeft", "headFrontLeft"],
  ["headFrontLeft", "headCenter"],
  ["headCenter", "headFrontRight"],
  ["headFrontRight", "headCornerRight"],
  ["headCornerRight", "headAftRight"],
];

const POSTS: readonly (readonly [keyof typeof node, keyof typeof node])[] = [
  ["sillCenter", "headCenter"],
  ["sillFrontLeft", "headFrontLeft"],
  ["sillFrontRight", "headFrontRight"],
  ["sillCornerLeft", "headCornerLeft"],
  ["sillCornerRight", "headCornerRight"],
  ["sillAftLeft", "headAftLeft"],
  ["sillAftRight", "headAftRight"],
];

const OPENINGS: readonly {
  readonly id: string;
  readonly corners: readonly (keyof typeof node)[];
}[] = [
  {
    id: "windshield-left",
    corners: ["sillCenter", "sillFrontLeft", "headFrontLeft", "headCenter"],
  },
  {
    id: "windshield-right",
    corners: ["sillCenter", "sillFrontRight", "headFrontRight", "headCenter"],
  },
  {
    id: "cheek-left",
    corners: ["sillFrontLeft", "sillCornerLeft", "headCornerLeft", "headFrontLeft"],
  },
  {
    id: "cheek-right",
    corners: ["sillFrontRight", "sillCornerRight", "headCornerRight", "headFrontRight"],
  },
  {
    id: "side-left",
    corners: ["sillCornerLeft", "sillAftLeft", "headAftLeft", "headCornerLeft"],
  },
  {
    id: "side-right",
    corners: ["sillCornerRight", "sillAftRight", "headAftRight", "headCornerRight"],
  },
];

const parts: ObjectLabPart[] = [];

function beam(id: string, from: Vector, to: Vector): void {
  parts.push({
    kind: "beam",
    id,
    group: GROUP,
    material: "metal",
    from: sit(from),
    to: sit(to),
    width: FRAME_WIDTH,
    depth: FRAME_DEPTH,
  });
}

for (const [from, to] of SILL_EDGES) {
  beam(`greenhouse-sill-${from}-${to}`, node[from], node[to]);
}
for (const [from, to] of HEAD_EDGES) {
  beam(`greenhouse-head-${from}-${to}`, node[from], node[to]);
}
for (const [from, to] of POSTS) {
  beam(`greenhouse-post-${from}`, node[from], node[to]);
}

const browAft = (head: Vector): Vector => [head[0], head[1] + 0.02, head[2] - 0.14];
parts.push({
  kind: "mesh",
  id: "greenhouse-brow",
  group: GROUP,
  material: "metal",
  vertices: [
    sit(node.headFrontLeft),
    sit(node.headFrontRight),
    sit(browAft(node.headFrontRight)),
    sit(browAft(node.headFrontLeft)),
  ],
  triangles: [[0, 1, 2], [0, 2, 3]] as ObjectTriangle[],
  showEdges: true,
});

function insetOpening(corners: readonly Vector[], margin: number): Vector[] {
  const centroid = scale(
    corners.reduce((sum, corner) => add(sum, corner), [0, 0, 0] as Vector),
    1 / corners.length,
  );
  return corners.map((corner) => {
    const offset = sub(corner, centroid);
    const size = length(offset);
    return add(centroid, scale(offset, Math.max(0.01, size - margin) / size));
  });
}

function paneNormal(corners: readonly Vector[]): Vector {
  const centroid = scale(
    corners.reduce((sum, corner) => add(sum, corner), [0, 0, 0] as Vector),
    1 / corners.length,
  );
  const normal = normalize(
    cross(sub(corners[1], corners[0]), sub(corners[2], corners[0])),
  );
  const away = sub(centroid, [0, 1.1, 6]);
  return dot(normal, away) < 0 ? scale(normal, -1) : normal;
}

for (const opening of OPENINGS) {
  const bodyCorners = opening.corners.map((name) => node[name]);
  const inset = insetOpening(bodyCorners, GLASS_INSET);
  const normal = paneNormal(inset);
  const glass = inset.map((corner) => add(corner, scale(normal, GLASS_REBATE)));
  parts.push({
    kind: "mesh",
    id: `greenhouse-${opening.id}`,
    group: GROUP,
    material: "glazing",
    vertices: glass.map(sit),
    triangles: [[0, 1, 2], [0, 2, 3]],
    showEdges: true,
    doubleSided: true,
    plateThickness: 0.008,
  });
}

export const dc3GreenhouseOverlayParts: readonly ObjectLabPart[] = parts;
export const dc3GreenhouseCageNodes = node;

const airframeGroups = [...new Set(dc3BlockoutObject.parts.map((part) => part.group))];
const noseDetail = dc3BlockoutObject.views.find((view) => view.id === "nose-detail");
if (!noseDetail) throw new Error("DC-3 greenhouse overlay: nose-detail view is missing");

export const dc3GreenhouseOverlayModel = {
  ...dc3BlockoutObject,
  id: "douglas-dc3-greenhouse-overlay",
  revision: "diagnostic-greenhouse-cage",
  title: "Douglas DC-3 — diagnostic greenhouse cage",
  parts: [...dc3BlockoutObject.parts, ...dc3GreenhouseOverlayParts],
  views: [
    {
      ...noseDetail,
      id: "greenhouse-cage",
      label: "DIAGNOSTIC · greenhouse cage alone",
      fov: 24,
      hiddenGroups: airframeGroups,
    },
    {
      ...noseDetail,
      id: "greenhouse-detail",
      label: "DIAGNOSTIC · cage sat on unchanged loft",
      fov: 22,
    },
    ...dc3BlockoutObject.views.filter((view) => (
      view.id === "nose-detail"
      || view.id === "three-quarter-left"
      || view.id === "left-profile"
      || view.id === "front"
    )),
  ],
  sourceNotes: [
    ...dc3BlockoutObject.sourceNotes,
    "DIAGNOSTIC SIDECAR: greenhouse authored as one connected cage (sill, posts, head, six openings) in body axes, then sat with the airframe. The B01 loft is not cut. Not a geometry source and not world geometry.",
  ],
  labMetrics: [
    ...dc3BlockoutObject.labMetrics.filter((metric) => metric.label !== "PARTS"),
    {
      label: "PARTS",
      value: dc3BlockoutObject.parts.length + dc3GreenhouseOverlayParts.length,
      decimals: 0,
      signed: false,
      unit: "",
    },
    {
      label: "OVERLAY",
      value: dc3GreenhouseOverlayParts.length,
      decimals: 0,
      signed: false,
      unit: "",
    },
  ],
};
