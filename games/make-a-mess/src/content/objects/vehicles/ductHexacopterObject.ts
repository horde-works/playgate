/**
 * VX-8 «Yaqui» — integrated-duct combat hexacopter. Revision `d4a-rig`.
 *
 * The designation continues the line RAX-8 Tonkawa started: the index alludes to
 * the ducted-fan VTOLs this airframe descends from — Piasecki's VZ-8 Airgeep,
 * the Bell X-22 — and to its own eight propulsors, while the name is a people
 * the army naming tradition never took. The Yaqui were subdued by neither Spain
 * nor Mexico, which is this machine's character: it is not fast, it is
 * impossible to shift.
 *
 * Steel core only: survival cell, keels, frame grid, chined outer rail, six
 * annular duct cells, the cored structural deck, the dorsal spine, both
 * yaw-tunnel shells with their saddles and the four gear trunnion boxes. Skin,
 * fans, legs and weapons are later revisions.
 *
 * Passport: games/make-a-mess/docs/duct-hexacopter/evidence-card-01-duct-hexacopter.md.
 * The owner-selected concept owns visual character only; every dimension, hidden
 * member and joint here is authored and testable.
 *
 * TWO IDEAS CARRY THE WHOLE CORE.
 *
 * 1. The six rings are packed so that the clear band left between the front and
 *    middle rows — and between the middle and rear rows — is exactly where a
 *    full-span transverse frame can pass. The duct pack and the frame grid are
 *    one decision. Move a station and the frame it feeds has nowhere to live.
 *
 * 2. The body is a LOFT, not a slab. The first draft built both deck flanges as
 *    flat planes and cut the plan with a stencil, and the owner named the
 *    result exactly: a cake. A real airframe carries a crown line that dives
 *    forward and a belly that lifts toward every chine, so the section is a
 *    lens — thick on the axis, thin at the edge — and the nose is a blade
 *    rather than a wall. Both flanges, every ring plate, every frame cap and
 *    the rail now read their Y from `deckTopAt`/`bellyAt`. Nothing in this file
 *    may hold a hand-typed deck height again.
 */

import type {
  ObjectLabModel,
  ObjectLabPart,
  ObjectLabView,
  ObjectMaterialId,
  ObjectPoint,
  ObjectTriangle,
} from "../dutchWindmills/objectModel.ts";
import {
  buildRevolution,
  buildSlab,
  buildTorqueBox,
  facetsToPart,
  type Facet,
  type PlanPoint,
} from "../authoring/solidBuilders.ts";

type DuctHexacopterView = ObjectLabView & { readonly up?: ObjectPoint };
type MaterialOverride = Readonly<Record<string, number | boolean>>;

/** A rotating assembly: one pivot, one axis, one closed motion class. */
type KinematicGroup = {
  readonly id: string;
  readonly pivot: ObjectPoint;
  readonly axis: ObjectPoint;
  readonly spin: "cw" | "ccw";
  readonly motion: "constant-rotation-only";
  readonly reversible: boolean;
  readonly sweptRadius: number;
  /** Parts arrive with the rig revision; the axis is already owned by the ring. */
  readonly members: readonly string[];
};

type DuctHexacopterModel = Omit<ObjectLabModel, "views"> & {
  readonly captureFrame: readonly [width: number, height: number];
  readonly materialOverrides: Readonly<Record<string, MaterialOverride>>;
  readonly kinematicGroups: readonly KinematicGroup[];
  readonly views: readonly DuctHexacopterView[];
};

const TAU = Math.PI * 2;
const parts: ObjectLabPart[] = [];

const point = (x: number, y: number, z: number): ObjectPoint => [x, y, z];
const plan = (x: number, z: number): PlanPoint => ({ x, z });
const lerp = (from: number, to: number, ratio: number) => from + (to - from) * ratio;
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

const addBox = (
  id: string,
  group: string,
  material: ObjectMaterialId,
  center: ObjectPoint,
  size: ObjectPoint,
  rotation?: ObjectPoint,
) => parts.push({ kind: "box", id, group, material, center, size, rotation });

const addCylinder = (
  id: string,
  group: string,
  material: ObjectMaterialId,
  from: ObjectPoint,
  to: ObjectPoint,
  radius: number,
  radialSegments = 20,
) => parts.push({ kind: "cylinder", id, group, material, from, to, radius, radialSegments });

const addMeshPart = (
  id: string,
  group: string,
  material: ObjectMaterialId,
  vertices: readonly ObjectPoint[],
  triangles: readonly ObjectTriangle[],
) => parts.push({ kind: "mesh", id, group, material, vertices, triangles, showEdges: false });

const addEllipsoid = (
  id: string,
  group: string,
  material: ObjectMaterialId,
  centre: ObjectPoint,
  radii: ObjectPoint,
  longitudeSegments = 18,
  latitudeSegments = 9,
) => {
  const vertices: ObjectPoint[] = [];
  const triangles: ObjectTriangle[] = [];
  for (let latitude = 0; latitude <= latitudeSegments; latitude += 1) {
    const phi = (latitude / latitudeSegments) * Math.PI;
    for (let longitude = 0; longitude < longitudeSegments; longitude += 1) {
      const theta = (longitude / longitudeSegments) * TAU;
      vertices.push(point(
        centre[0] + Math.sin(phi) * Math.cos(theta) * radii[0],
        centre[1] + Math.cos(phi) * radii[1],
        centre[2] + Math.sin(phi) * Math.sin(theta) * radii[2],
      ));
    }
  }
  for (let latitude = 0; latitude < latitudeSegments; latitude += 1) {
    for (let longitude = 0; longitude < longitudeSegments; longitude += 1) {
      const next = (longitude + 1) % longitudeSegments;
      const a = latitude * longitudeSegments + longitude;
      const b = latitude * longitudeSegments + next;
      const c = (latitude + 1) * longitudeSegments + longitude;
      const d = (latitude + 1) * longitudeSegments + next;
      if (latitude === 0) triangles.push([a, c, d]);
      else if (latitude === latitudeSegments - 1) triangles.push([a, d, b]);
      else triangles.push([a, c, d], [a, d, b]);
    }
  }
  addMeshPart(id, group, material, vertices, triangles);
};

const addFacets = (
  id: string,
  group: string,
  material: ObjectMaterialId,
  facets: readonly Facet[],
  options: { readonly showEdges?: boolean; readonly doubleSided?: boolean } = {},
) => parts.push(facetsToPart(id, group, material, facets, options));

/**
 * Flat plate of a given thickness through four corners, thickness laid off along
 * the quad's own normal. A surface of revolution looks like a ring but is one
 * piece, so nothing leaning on it survives losing it; a ring assembled from
 * separate plates behaves like a real assembly.
 */
const steelPlate = (
  a: ObjectPoint,
  b: ObjectPoint,
  c: ObjectPoint,
  d: ObjectPoint,
  thickness: number,
  tag: string,
): Facet[] => {
  const edge1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const edge2 = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
  const normal = [
    edge1[1] * edge2[2] - edge1[2] * edge2[1],
    edge1[2] * edge2[0] - edge1[0] * edge2[2],
    edge1[0] * edge2[1] - edge1[1] * edge2[0],
  ];
  const length = Math.hypot(normal[0], normal[1], normal[2]) || 1;
  const half = thickness / 2;
  const offset = (p: ObjectPoint, sign: number): ObjectPoint => point(
    p[0] + (normal[0] / length) * half * sign,
    p[1] + (normal[1] / length) * half * sign,
    p[2] + (normal[2] / length) * half * sign,
  );
  const [a0, b0, c0, d0] = [a, b, c, d].map((p) => offset(p, -1));
  const [a1, b1, c1, d1] = [a, b, c, d].map((p) => offset(p, 1));
  return [
    { points: [a1, b1, c1, d1], tag },
    { points: [d0, c0, b0, a0], tag },
    { points: [a0, b0, b1, a1], tag },
    { points: [b0, c0, c1, b1], tag },
    { points: [c0, d0, d1, c1], tag },
    { points: [d0, a0, a1, d1], tag },
  ];
};

/** Chain of torque-box segments through a polyline: one member, real joints. */
const boxChain = (
  points: readonly ObjectPoint[],
  width: number,
  height: number | ((index: number) => number),
  tag: string,
): Facet[] => {
  const facets: Facet[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const segmentHeight = typeof height === "number" ? height : height(index);
    facets.push(...buildTorqueBox({
      from: points[index],
      to: points[index + 1],
      width,
      height: segmentHeight,
      chamfer: Math.min(width, segmentHeight) * 0.22,
      tag,
    }));
  }
  return facets;
};

/** Arc of an arch in the X-Y plane at a fixed Z, as a polyline of joint points. */
const archPoints = (
  halfSpan: number,
  footY: number,
  crownY: number,
  z: number,
  segments: number,
): ObjectPoint[] => Array.from({ length: segments + 1 }, (_, index) => {
  const angle = Math.PI * (index / segments);
  return point(-halfSpan * Math.cos(angle), footY + (crownY - footY) * Math.sin(angle), z);
});

// ---------------------------------------------------------------------------
// 1. Stations and the two control surfaces.
// ---------------------------------------------------------------------------

/** Structural outer radius of a lift duct ring. */
const LIFT_RING_OUTER = 0.9;
/** Duct throat radius: the working inner surface of the tunnel. */
const LIFT_THROAT = 0.79;
/** Rotor tip radius. The swept disc never touches the throat. */
const LIFT_TIP = 0.72;
const LIFT_RING_SEGMENTS = 12;
/** Plan offset of the armoured force-contour from a duct centre. */
const HULL_LOBE_RADIUS = 1.06;
const HALF_WIDTH_MAX = 3.62;

const NOSE_Z = 4.1;
const TRANSOM_Z = -3.3;
const BAND_FRAME_Z = 1.01;
const BAND_FRAME_WIDTH = 0.18;
const NOSE_FRAME_Z = 3.05;
const TAIL_FRAME_Z = -3.05;
const KEEL_X = 0.62;
/** Thickness of one structural deck flange. */
const FLANGE = 0.075;

const CABIN_FRONT_Z = 3.05;
const CABIN_REAR_Z = 1.05;
const CABIN_HALF_WIDTH = 0.62;
const CABIN_FLOOR_Y = 0.94;
/**
 * The cabin used to be cut off square across the front. Seen from above that
 * fought the hull, whose whole plan is a wedge, so the canopy now runs forward
 * to a point of its own and its rails carry on into it.
 */
const CABIN_NOSE_Z = 3.42;
const CABIN_NOSE_HALF_WIDTH = 0.07;
/**
 * The cabin is cut off by a raked plane, not by a station normal to the keel:
 * the top of the cut stands 0.6 m aft of its foot. That rake is the whole
 * "sense of speed" the owner asked for, so it is a named number with a test,
 * not a shape that happens in the skin.
 */
const CANOPY_CUT_SILL_Z = 1.75;
const CANOPY_CUT_CROWN_Z = 1.15;

type ProfileRow = { readonly z: number; readonly y: number };

/**
 * Crown line: the top of the structure on the centreline. It dives from the
 * dorsal shoulder to the nose — this one table is the forward rake, and the
 * later hull only follows it.
 */
const CROWN_LINE: readonly ProfileRow[] = [
  { z: 4.1, y: 0.95 },
  { z: 3.05, y: 1.3 },
  { z: 2.02, y: 1.47 },
  { z: 1.05, y: 1.53 },
  { z: 0, y: 1.55 },
  { z: -2.02, y: 1.5 },
  { z: -3.3, y: 1.38 },
];

/** Keel line: the bottom of the structure on the centreline. Deepest amidships. */
const BELLY_LINE: readonly ProfileRow[] = [
  { z: 4.1, y: 0.73 },
  { z: 3.05, y: 0.685 },
  { z: 2.02, y: 0.645 },
  { z: 1.05, y: 0.615 },
  { z: 0, y: 0.6 },
  { z: -2.02, y: 0.655 },
  { z: -3.3, y: 0.78 },
];

/** Fall of the deck from crown to chine, and lift of the belly to the chine. */
const CROWN_EDGE_FALL = 0.3;
const BELLY_EDGE_LIFT = 0.2;

const sampleLine = (line: readonly ProfileRow[], z: number): number => {
  const clamped = clamp(z, line[line.length - 1].z, line[0].z);
  for (let index = 0; index < line.length - 1; index += 1) {
    const upper = line[index];
    const lower = line[index + 1];
    if (clamped <= upper.z && clamped >= lower.z) {
      return lerp(upper.y, lower.y, (upper.z - clamped) / (upper.z - lower.z));
    }
  }
  return line[line.length - 1].y;
};

/**
 * Lateral falloff. Flat over the spine, then a rising ramp to the chine — the
 * exponent is what keeps the middle of the body full while the edge goes thin.
 */
const lateralRamp = (x: number) =>
  Math.pow(clamp((Math.abs(x) - 0.6) / (HALF_WIDTH_MAX - 0.6), 0, 1), 1.6);

/**
 * The two dorsal channels are sunk into the body, not laid on top of it: the
 * deck itself carries a trough under each tunnel. Without it the tunnel shells
 * simply crossed the deck flange — two solids sharing the same volume, which no
 * amount of later armour would have made honest. The trough fades in ahead of
 * the intake, so the deck rises in front of each mouth exactly where the
 * concept shows an intake let into the upper surface.
 */
const TROUGH_X = 0.98;
const TROUGH_HALF_WIDTH = 0.4;
const TROUGH_DEPTH = 0.26;
const TROUGH_FADE_FROM = 0.8;
const TROUGH_FADE_TO = 0.45;

const troughDrop = (x: number, z: number) => {
  const lateral = Math.min(Math.abs(Math.abs(x) - TROUGH_X) / TROUGH_HALF_WIDTH, 1);
  const across = Math.cos((lateral * Math.PI) / 2) ** 2;
  const along = clamp((TROUGH_FADE_FROM - z) / (TROUGH_FADE_FROM - TROUGH_FADE_TO), 0, 1);
  return TROUGH_DEPTH * across * along;
};

export const deckTopAt = (x: number, z: number) =>
  sampleLine(CROWN_LINE, z) - CROWN_EDGE_FALL * lateralRamp(x) - troughDrop(x, z);
export const bellyAt = (x: number, z: number) =>
  sampleLine(BELLY_LINE, z) + BELLY_EDGE_LIFT * lateralRamp(x);

const upperFlangeBottom = (x: number, z: number) => deckTopAt(x, z) - FLANGE;
const lowerFlangeTop = (x: number, z: number) => bellyAt(x, z) + FLANGE;

const liftBase = [
  { id: "front-left", x: -2.2, z: 2.02, spin: "cw" },
  { id: "front-right", x: 2.2, z: 2.02, spin: "ccw" },
  { id: "middle-left", x: -2.56, z: 0, spin: "ccw" },
  { id: "middle-right", x: 2.56, z: 0, spin: "cw" },
  { id: "rear-left", x: -2.2, z: -2.02, spin: "cw" },
  { id: "rear-right", x: 2.2, z: -2.02, spin: "ccw" },
] as const;

/**
 * The rear pair sits higher. Fore/aft interference is a measured effect, so the
 * stagger is an explicit number rather than a happy accident of the loft.
 */
const REAR_ROTOR_STAGGER = 0.04;

export const DUCT_HEX_LIFT_STATIONS = liftBase.map((station) => ({
  ...station,
  planeY: Math.round((
    (deckTopAt(station.x, station.z) + bellyAt(station.x, station.z)) / 2
    + (station.z < 0 ? REAR_ROTOR_STAGGER : 0)
  ) * 1000) / 1000,
}));

export const DUCT_HEX_YAW_STATIONS = [
  { id: "left", x: -0.98, y: 1.66, spin: "ccw" },
  { id: "right", x: 0.98, y: 1.66, spin: "cw" },
] as const;

const YAW_OUTER = 0.4;
const YAW_THROAT = 0.33;
const YAW_TIP = 0.3;
const YAW_INLET_Z = 0.55;
const YAW_EXIT_Z = -3.2;
const YAW_ROTOR_Z = -1.25;
const YAW_SEGMENTS = 10;

/** Crest structure: it rides OVER both tunnels rather than standing between
 *  them, which is what leaves room for the intakes. */
const CREST_HALF_WIDTH = 0.26;
const CREST_DEPTH = 0.2;

// ---------------------------------------------------------------------------
// 2. The armoured force-contour: three lobes per side joined by their own
//    external tangents, so clearance to every ring is a property of the
//    construction rather than of a traced outline.
// ---------------------------------------------------------------------------

type Circle = { readonly x: number; readonly z: number };

const arcPoints = (
  centre: Circle,
  radius: number,
  fromAngle: number,
  toAngle: number,
  steps: number,
): PlanPoint[] => Array.from({ length: steps + 1 }, (_, index) => {
  const angle = lerp(fromAngle, toAngle, index / steps);
  return plan(centre.x + Math.cos(angle) * radius, centre.z + Math.sin(angle) * radius);
});

const tangentAngleFromPoint = (from: PlanPoint, centre: Circle, radius: number, side: 1 | -1) => {
  const dx = from.x - centre.x;
  const dz = from.z - centre.z;
  const distance = Math.hypot(dx, dz);
  if (distance <= radius) throw new Error("tangent point lies inside the lobe");
  return Math.atan2(dz, dx) + side * Math.acos(radius / distance);
};

/** Starboard-outward normal of the centre line between two equal lobes. */
const externalTangentAngle = (first: Circle, second: Circle) => {
  const dx = second.x - first.x;
  const dz = second.z - first.z;
  const length = Math.hypot(dx, dz);
  return Math.atan2(dx / length, -dz / length);
};

const frontLobe: Circle = { x: 2.2, z: 2.02 };
const middleLobe: Circle = { x: 2.56, z: 0 };
const rearLobe: Circle = { x: 2.2, z: -2.02 };

const noseTip = plan(0, NOSE_Z);
const transomTip = plan(0, TRANSOM_Z);

const starboardContour: PlanPoint[] = [
  noseTip,
  ...arcPoints(frontLobe, HULL_LOBE_RADIUS,
    tangentAngleFromPoint(noseTip, frontLobe, HULL_LOBE_RADIUS, -1),
    externalTangentAngle(frontLobe, middleLobe), 5),
  ...arcPoints(middleLobe, HULL_LOBE_RADIUS,
    externalTangentAngle(frontLobe, middleLobe),
    externalTangentAngle(middleLobe, rearLobe), 4),
  ...arcPoints(rearLobe, HULL_LOBE_RADIUS,
    externalTangentAngle(middleLobe, rearLobe),
    tangentAngleFromPoint(transomTip, rearLobe, HULL_LOBE_RADIUS, 1), 5),
  transomTip,
];

export const DUCT_HEX_HULL_CONTOUR: readonly PlanPoint[] = [
  ...starboardContour,
  ...starboardContour.slice(1, -1).reverse().map((p) => plan(-p.x, p.z)),
];

/**
 * Half-width of the force-contour at a station, interpolated along the
 * starboard polyline. An earlier draft picked the nearest vertex inside a
 * window and returned zero where the contour has no vertex there; both band
 * frames came out as stubs, and only the render showed it.
 */
export const ductHexacopterHalfWidthAt = (z: number): number => {
  let half = 0;
  for (let index = 0; index < starboardContour.length - 1; index += 1) {
    const a = starboardContour[index];
    const b = starboardContour[index + 1];
    if ((a.z - z) * (b.z - z) > 0) continue;
    const ratio = Math.abs(b.z - a.z) < 1e-9 ? 0 : (z - a.z) / (b.z - a.z);
    half = Math.max(half, a.x + (b.x - a.x) * ratio);
  }
  return half;
};

const ringHole = (station: { x: number; z: number }, radius: number): PlanPoint[] =>
  Array.from({ length: 24 }, (_, index) => {
    const angle = (index / 24) * TAU;
    return plan(station.x + Math.cos(angle) * radius, station.z + Math.sin(angle) * radius);
  });

/**
 * The cabin void in the upper flange: a real opening, not a dark face. Its rear
 * edge stands clear of the front band frame — an opening that comes within two
 * chamfers of a bay boundary leaves a sliver the triangulator cannot close.
 */
const CABIN_HOLE_REAR_Z = CANOPY_CUT_SILL_Z;
const cabinHole: PlanPoint[] = [
  plan(-CABIN_HALF_WIDTH, CABIN_HOLE_REAR_Z + 0.12),
  plan(-CABIN_HALF_WIDTH + 0.06, CABIN_FRONT_Z - 0.1),
  plan(-CABIN_NOSE_HALF_WIDTH, CABIN_NOSE_Z),
  plan(CABIN_NOSE_HALF_WIDTH, CABIN_NOSE_Z),
  plan(CABIN_HALF_WIDTH - 0.06, CABIN_FRONT_Z - 0.1),
  plan(CABIN_HALF_WIDTH, CABIN_HOLE_REAR_Z + 0.12),
  plan(CABIN_HALF_WIDTH - 0.16, CABIN_HOLE_REAR_Z),
  plan(-CABIN_HALF_WIDTH + 0.16, CABIN_HOLE_REAR_Z),
];

// ---------------------------------------------------------------------------
// 3. The cored torque deck: two lofted flanges, six wells, one cabin void,
//    split into bay panels along the frame grid.
// ---------------------------------------------------------------------------

/**
 * Bay boundaries. They are the frame stations, so a deck panel is bounded by the
 * members that actually carry it.
 */
/** The nose bay boundary is the deck's, not the frame's: the cabin opening now
 *  reaches z = 3.42 and a hole may never touch a bay edge. */
const BAY_NOSE_Z = 3.62;
const BAY_Z = [NOSE_Z, BAY_NOSE_Z, BAND_FRAME_Z, -BAND_FRAME_Z, TAIL_FRAME_Z, TRANSOM_Z];
const BAY_Z_NAMES = ["nose", "front", "middle", "rear", "tail"] as const;
/**
 * Lane boundaries, mirrored about the axis. They are not decoration: a panel
 * only carries the loft at its own corners, so a channel crossed by one wide
 * panel is interpolated flat and the trough disappears from the emitted deck
 * even though the surface tables still describe it. The inner edges bracket the
 * cabin, the middle three straddle each dorsal channel, and the outer one keeps
 * every duct well inside a single panel.
 */
const LANE_EDGES = [0.68, 0.86, 1.04, 1.24];

/** Sutherland-Hodgman against one axis-aligned half-plane. The contour is convex,
 *  so every clipped bay stays a simple polygon. */
const clipAxis = (
  polygon: readonly PlanPoint[],
  axis: "x" | "z",
  value: number,
  keepGreater: boolean,
): PlanPoint[] => {
  const inside = (p: PlanPoint) => (keepGreater ? p[axis] >= value - 1e-9 : p[axis] <= value + 1e-9);
  const result: PlanPoint[] = [];
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index];
    const next = polygon[(index + 1) % polygon.length];
    const currentIn = inside(current);
    const nextIn = inside(next);
    if (currentIn) result.push(current);
    if (currentIn !== nextIn) {
      const ratio = (value - current[axis]) / (next[axis] - current[axis]);
      result.push(plan(
        current.x + (next.x - current.x) * ratio,
        current.z + (next.z - current.z) * ratio,
      ));
    }
  }
  return result;
};

/**
 * The deck is emitted BAY BY BAY rather than as one plate with seven holes.
 *
 * One plate looked equivalent and was not: the ear-clipped skin owns vertices
 * only on the contour and on the wells, so a triangle could run from the
 * transom to the cabin and the lofted crown sagged 0.16 m at the axis — the
 * surface tables said one thing and the emitted geometry said another. Panels
 * bounded by their own frames keep every triangle short, and each hole lives
 * wholly inside one bay so no well is ever cut by a bay edge.
 */
const laneRanges: readonly { readonly name: string; readonly from: number; readonly to: number }[] = [
  { name: "port-outer", from: -Infinity, to: -LANE_EDGES[3] },
  { name: "port-channel-outer", from: -LANE_EDGES[3], to: -LANE_EDGES[2] },
  { name: "port-channel", from: -LANE_EDGES[2], to: -LANE_EDGES[1] },
  { name: "port-channel-inner", from: -LANE_EDGES[1], to: -LANE_EDGES[0] },
  { name: "centre", from: -LANE_EDGES[0], to: LANE_EDGES[0] },
  { name: "starboard-channel-inner", from: LANE_EDGES[0], to: LANE_EDGES[1] },
  { name: "starboard-channel", from: LANE_EDGES[1], to: LANE_EDGES[2] },
  { name: "starboard-channel-outer", from: LANE_EDGES[2], to: LANE_EDGES[3] },
  { name: "starboard-outer", from: LANE_EDGES[3], to: Infinity },
];

const emitFlange = (
  prefix: string,
  group: string,
  topAt: (x: number, z: number) => number,
  bottomAt: (x: number, z: number) => number,
  holes: readonly (readonly PlanPoint[])[],
) => {
  for (let band = 0; band < BAY_Z_NAMES.length; band += 1) {
    const zHigh = BAY_Z[band];
    const zLow = BAY_Z[band + 1];
    for (const lane of laneRanges) {
      let outline = clipAxis(clipAxis(DUCT_HEX_HULL_CONTOUR, "z", zLow, true), "z", zHigh, false);
      if (Number.isFinite(lane.from)) outline = clipAxis(outline, "x", lane.from, true);
      if (Number.isFinite(lane.to)) outline = clipAxis(outline, "x", lane.to, false);
      if (outline.length < 3) continue;
      const area = Math.abs(outline.reduce((total, current, index) => {
        const next = outline[(index + 1) % outline.length];
        return total + current.x * next.z - next.x * current.z;
      }, 0) / 2);
      if (area < 4e-3) continue;

      const bayHoles = holes.filter((hole) => {
        const centreX = hole.reduce((total, q) => total + q.x, 0) / hole.length;
        const centreZ = hole.reduce((total, q) => total + q.z, 0) / hole.length;
        return centreX > lane.from && centreX < lane.to && centreZ < zHigh && centreZ > zLow;
      });

      addFacets(
        `${prefix}-${BAY_Z_NAMES[band]}-${lane.name}`,
        group,
        "paint-light",
        buildSlab({ outline, holes: bayHoles, topAt, bottomAt, chamfer: 0.022 }),
        { showEdges: false },
      );
    }
  }
};

const liftHoles = DUCT_HEX_LIFT_STATIONS.map((station) => ringHole(station, LIFT_RING_OUTER));

emitFlange("deck-upper-flange", "core-deck-upper", deckTopAt, upperFlangeBottom,
  [...liftHoles, cabinHole]);
emitFlange("deck-lower-flange", "core-deck-lower", lowerFlangeTop, bellyAt, liftHoles);

// ---------------------------------------------------------------------------
// 4. Six annular torque cells. Each ring is cored into the loft: its plates are
//    tall inboard and short at the chine, because that is where the body is.
// ---------------------------------------------------------------------------

for (const station of DUCT_HEX_LIFT_STATIONS) {
  const group = `core-duct-${station.id}`;
  const wall = LIFT_RING_OUTER - LIFT_THROAT;
  const at = (radius: number, angle: number, y: number): ObjectPoint =>
    point(station.x + Math.cos(angle) * radius, y, station.z + Math.sin(angle) * radius);
  const surfaceAt = (angle: number, radius: number) => {
    const x = station.x + Math.cos(angle) * radius;
    const z = station.z + Math.sin(angle) * radius;
    return { top: deckTopAt(x, z), bottom: bellyAt(x, z) };
  };

  for (let segment = 0; segment < LIFT_RING_SEGMENTS; segment += 1) {
    const from = (segment / LIFT_RING_SEGMENTS) * TAU;
    const to = ((segment + 1) / LIFT_RING_SEGMENTS) * TAU;
    const mid = (from + to) / 2;
    const radius = LIFT_RING_OUTER - wall / 2;
    const start = surfaceAt(from, radius);
    const end = surfaceAt(to, radius);
    addFacets(
      `${group}-ring-plate-${segment}`,
      group,
      segment % 2 === 0 ? "timber-mid" : "timber-dark",
      steelPlate(
        at(radius, from, start.bottom),
        at(radius, to, end.bottom),
        at(radius, to, end.top),
        at(radius, from, start.top),
        wall,
        "ring-plate",
      ),
      { showEdges: false },
    );
    const splice = surfaceAt(from, LIFT_RING_OUTER + 0.012);
    addFacets(
      `${group}-ring-splice-${segment}`,
      group,
      "metal",
      buildTorqueBox({
        from: at(LIFT_RING_OUTER + 0.012, from, splice.bottom - 0.01),
        to: at(LIFT_RING_OUTER + 0.012, from, splice.top + 0.01),
        width: 0.05,
        height: 0.028,
        chamfer: 0.008,
        tag: "ring-splice",
      }),
      { showEdges: false },
    );
    // Paired root webs, top and bottom: a single plate would be the decorative
    // connection the passport rejects. Every second joint carries one, because
    // a web earns its mass only where it points at a frame, the rail or the
    // next ring.
    if (segment % 2 !== 0) continue;
    const inner = surfaceAt(mid, LIFT_RING_OUTER - wall);
    const outer = surfaceAt(mid, LIFT_RING_OUTER + 0.16);
    for (const [tag, innerY, outerY] of [
      ["upper", inner.top - FLANGE - 0.03, outer.top - FLANGE - 0.03],
      ["lower", inner.bottom + FLANGE + 0.03, outer.bottom + FLANGE + 0.03],
    ] as const) {
      addFacets(
        `${group}-root-web-${tag}-${segment}`,
        group,
        "metal",
        buildTorqueBox({
          from: at(LIFT_RING_OUTER - wall, mid, innerY),
          to: at(LIFT_RING_OUTER + 0.16, mid, outerY),
          width: 0.055,
          height: 0.05,
          chamfer: 0.012,
          tag: "root-web",
        }),
        { showEdges: false },
      );
    }
  }
}

// ---------------------------------------------------------------------------
// 5. Frame grid. The band frames run the whole span through the clear gap
//    between duct rows; every cap follows the loft, so a frame is deep on the
//    axis and shallow at the chine — like the body it stiffens.
// ---------------------------------------------------------------------------

for (const side of [-1, 1] as const) {
  for (const z of [BAND_FRAME_Z, -BAND_FRAME_Z]) {
    const outer = ductHexacopterHalfWidthAt(z) - 0.12;
    const id = `${z > 0 ? "front" : "rear"}-band-${side < 0 ? "port" : "starboard"}`;
    const capPoints = (surface: (x: number, z: number) => number, offset: number) =>
      Array.from({ length: 7 }, (_, index) => {
        const x = side * outer * (index / 6);
        return point(x, surface(x, z) + offset, z);
      });
    addFacets(`frame-${id}-upper-cap`, "core-frames", "metal", boxChain(
      capPoints(upperFlangeBottom, -0.05), BAND_FRAME_WIDTH, 0.09, "frame-cap",
    ), { showEdges: false });
    addFacets(`frame-${id}-lower-cap`, "core-frames", "metal", boxChain(
      capPoints(lowerFlangeTop, 0.05), BAND_FRAME_WIDTH, 0.09, "frame-cap",
    ), { showEdges: false });
    for (let cell = 0; cell < 5; cell += 1) {
      const from = lerp(0.18, outer - 0.12, cell / 5);
      const to = lerp(0.18, outer - 0.12, (cell + 1) / 5) - 0.07;
      addFacets(`frame-${id}-web-${cell}`, "core-frames", "paint-light", steelPlate(
        point(side * from, lowerFlangeTop(side * from, z), z),
        point(side * to, lowerFlangeTop(side * to, z), z),
        point(side * to, upperFlangeBottom(side * to, z), z),
        point(side * from, upperFlangeBottom(side * from, z), z),
        0.028,
        "frame-web",
      ), { showEdges: false });
    }
  }
}

/**
 * Centre frames pass inboard of the rings, where the span is free — but a
 * transverse arch may not cross the cabin, because the pilot is there. At a
 * cabin station the frame is emitted as two side pieces from the sill outboard;
 * the ring is closed above by the canopy bow at that station and below by the
 * tub, which is how a real cockpit carries its frames.
 */
for (const [id, z, half, crownLift] of [
  ["nose", NOSE_FRAME_Z, 1.02, 0.06],
  ["front-station", 2.02, 1.24, 0.1],
  ["mid-station", 0, 1.58, 0.02],
  ["rear-station", -2.02, 1.24, 0.06],
  ["tail", TAIL_FRAME_Z, 1.42, 0.04],
] as const) {
  const insideCabin = z > CABIN_REAR_Z + 0.05 && z < CABIN_FRONT_Z - 0.05;
  if (insideCabin) {
    for (const side of [-1, 1] as const) {
      const sillX = side * CABIN_HALF_WIDTH;
      const outerX = side * half;
      addFacets(
        `frame-centre-${id}-${side < 0 ? "port" : "starboard"}`,
        "core-frames",
        "metal",
        boxChain([
          point(sillX, deckTopAt(sillX, z) - 0.08, z),
          point(side * lerp(CABIN_HALF_WIDTH, half, 0.55), lerp(deckTopAt(sillX, z) - 0.08, bellyAt(outerX, z) + 0.14, 0.6), z),
          point(outerX, bellyAt(outerX, z) + 0.14, z),
        ], 0.13, 0.1, "centre-frame"),
        { showEdges: false },
      );
    }
    continue;
  }
  addFacets(`frame-centre-${id}`, "core-frames", "metal", boxChain(
    archPoints(half, bellyAt(half * 0.8, z) + 0.05, deckTopAt(0, z) + crownLift, z, 6),
    0.15,
    0.1,
    "centre-frame",
  ), { showEdges: false });
}

// ---------------------------------------------------------------------------
// 6. Keels, nose splices, transom and the chined outer rail.
// ---------------------------------------------------------------------------

const keelStations = [
  NOSE_FRAME_Z + 0.66, NOSE_FRAME_Z, 2.02, 1.05, 0, -1.05, -2.02, TAIL_FRAME_Z, TRANSOM_Z + 0.06,
];

for (const side of [-1, 1] as const) {
  const suffix = side < 0 ? "port" : "starboard";
  addFacets(`keel-${suffix}`, "core-keel", "metal", boxChain(
    keelStations.map((z) => point(side * KEEL_X, bellyAt(side * KEEL_X, z) + 0.16, z)),
    0.17,
    0.3,
    "keel",
  ), { showEdges: false });

  addFacets(`nose-splice-${suffix}`, "core-keel", "metal", boxChain([
    point(side * KEEL_X, bellyAt(side * KEEL_X, NOSE_FRAME_Z + 0.66) + 0.16, NOSE_FRAME_Z + 0.66),
    point(side * 0.34, bellyAt(side * 0.34, NOSE_Z - 0.42) + 0.13, NOSE_Z - 0.42),
    point(0, bellyAt(0, NOSE_Z - 0.06) + 0.1, NOSE_Z - 0.06),
  ], 0.12, 0.2, "nose-splice"), { showEdges: false });

  addFacets(`nose-diagonal-${suffix}`, "core-frames", "metal", buildTorqueBox({
    from: point(side * 1.02, lowerFlangeTop(side * 1.02, NOSE_FRAME_Z) + 0.02, NOSE_FRAME_Z),
    to: point(side * 0.2, bellyAt(side * 0.2, NOSE_Z - 0.24) + 0.1, NOSE_Z - 0.24),
    width: 0.1,
    height: 0.12,
    chamfer: 0.026,
    tag: "nose-diagonal",
  }), { showEdges: false });

  // The rail is the outboard boundary of every root web and the gear's carrier.
  // Its section shrinks with the body, so the chine reads as an edge.
  const railPoints = starboardContour.map((p) => {
    const x = side * (p.x - 0.08);
    return point(x, (deckTopAt(x, p.z) + bellyAt(x, p.z)) / 2, p.z);
  });
  addFacets(`outer-rail-${suffix}`, "core-rail", "metal", boxChain(
    railPoints,
    0.13,
    (index) => {
      const p = starboardContour[index];
      const x = side * (p.x - 0.08);
      return Math.max(0.16, (deckTopAt(x, p.z) - bellyAt(x, p.z)) * 0.82);
    },
    "outer-rail",
  ), { showEdges: false });
}

addFacets("nose-cap-frame", "core-frames", "metal", boxChain(
  archPoints(0.46, bellyAt(0.4, NOSE_Z - 0.5) + 0.06, deckTopAt(0, NOSE_Z - 0.5) - 0.03, NOSE_Z - 0.5, 4),
  0.1,
  0.1,
  "nose-cap",
), { showEdges: false });

addFacets("transom-beam", "core-frames", "metal", boxChain([
  point(-1.62, lowerFlangeTop(-1.62, -3.14) + 0.04, -3.14),
  point(0, lowerFlangeTop(0, TRANSOM_Z + 0.08) + 0.04, TRANSOM_Z + 0.08),
  point(1.62, lowerFlangeTop(1.62, -3.14) + 0.04, -3.14),
], 0.14, 0.16, "transom"), { showEdges: false });

// ---------------------------------------------------------------------------
// 7. Survival cell and the canopy structure the hull will glaze.
//
// The owner's second catch: the cell members did not describe the cabin they
// are supposed to carry. They were two arches at the ends of a hole plus a pair
// of longerons buried below the deck, and no line among them followed the shape
// the canopy will actually take. So the canopy's own control lines live HERE,
// in the core, and every bow, sill and rail is emitted from them. The hull
// revision glazes between the same lines and cannot drift.
// ---------------------------------------------------------------------------

/** Crown of the canopy on the centreline: rises off the nose deck, peaks just
 *  behind the pilot's head, then falls to meet the dorsal spine. */
const CANOPY_CROWN: readonly ProfileRow[] = [
  { z: CABIN_NOSE_Z, y: 1.21 },
  { z: 3.16, y: 1.42 },
  { z: 2.98, y: 1.6 },
  { z: 2.6, y: 1.97 },
  { z: 2.35, y: 2.1 },
  { z: 2.1, y: 2.15 },
  { z: 1.6, y: 2.14 },
  { z: CANOPY_CUT_CROWN_Z, y: 2.12 },
];

/**
 * Aft of the cut the crest does NOT come down to the deck. The cabin ends and
 * the body carries on at the same height to the tail, dipping gently between
 * the two tunnel humps. A crest that sloped back down to the deck read as a
 * boat transom, which is the owner's objection of 2026-08-08.
 */
const DORSAL_CREST: readonly ProfileRow[] = [
  { z: CANOPY_CUT_CROWN_Z, y: 2.12 },
  { z: 0.2, y: 2.1 },
  { z: -1, y: 2.05 },
  { z: -1.8, y: 1.98 },
  { z: -2.6, y: 1.92 },
  { z: TRANSOM_Z, y: 1.82 },
];

export const dorsalCrestAt = (z: number) => sampleLine(DORSAL_CREST, z);

export const canopyCrownAt = (z: number) => sampleLine(CANOPY_CROWN, z);
/** The canopy sits ON the deck: its lower edge is the deck crown at the sill. */
export const canopySillAt = (x: number, z: number) => deckTopAt(x, z);

const CANOPY_SHOULDER_X = 0.4;
/** Half width of the armoured strip laid over the canopy crown. */
const CANOPY_SPINE_HALF = 0.22;
const CANOPY_REAR_Z = CANOPY_CUT_SILL_Z;

/**
 * The cut frame. Its points do not share a station: each rides the raked plane,
 * so the frame leans back over the deck instead of standing square to the keel.
 */
const canopyCutSection = (): ObjectPoint[] => {
  const sill = canopySillAt(CABIN_HALF_WIDTH, CANOPY_CUT_SILL_Z);
  const crown = canopyCrownAt(CANOPY_CUT_CROWN_Z);
  const zAt = (y: number) =>
    lerp(CANOPY_CUT_SILL_Z, CANOPY_CUT_CROWN_Z, clamp((y - sill) / (crown - sill), 0, 1));
  const shoulder = lerp(sill, crown, 0.74);
  return [
    point(-CABIN_HALF_WIDTH, sill, zAt(sill)),
    point(-CANOPY_SHOULDER_X, shoulder, zAt(shoulder)),
    point(0, crown, zAt(crown)),
    point(CANOPY_SHOULDER_X, shoulder, zAt(shoulder)),
    point(CABIN_HALF_WIDTH, sill, zAt(sill)),
  ];
};

/** The cut frame's shoulder vertex: one row up from the sill, on the raked plane. */
const cutShoulderPoint = (): ObjectPoint => {
  const sill = canopySillAt(CABIN_HALF_WIDTH, CANOPY_CUT_SILL_Z);
  const crown = canopyCrownAt(CANOPY_CUT_CROWN_Z);
  const y = lerp(sill, crown, 0.74);
  return point(CANOPY_SHOULDER_X, y, lerp(CANOPY_CUT_SILL_Z, CANOPY_CUT_CROWN_Z, (y - sill) / (crown - sill)));
};

/** Plan half-width of the canopy: full over the pilot, tapering into the nose. */
const canopyHalfWidthAt = (z: number) =>
  z <= CABIN_FRONT_Z - 0.1
    ? CABIN_HALF_WIDTH
    : lerp(CABIN_HALF_WIDTH, CABIN_NOSE_HALF_WIDTH,
      clamp((z - (CABIN_FRONT_Z - 0.1)) / (CABIN_NOSE_Z - (CABIN_FRONT_Z - 0.1)), 0, 1));

/** One faceted canopy station: sill, shoulder, crown, shoulder, sill. */
const canopySection = (z: number): ObjectPoint[] => {
  const half = canopyHalfWidthAt(z);
  const sill = canopySillAt(half, z);
  const crown = canopyCrownAt(z);
  const shoulder = lerp(sill, crown, 0.74);
  const shoulderX = Math.min(CANOPY_SHOULDER_X, half * 0.65);
  return [
    point(-half, sill, z),
    point(-shoulderX, shoulder, z),
    point(0, crown, z),
    point(shoulderX, shoulder, z),
    point(half, sill, z),
  ];
};

addFacets("cabin-tub-floor", "core-cell", "roof-dark", buildSlab({
  outline: [
    plan(-CABIN_HALF_WIDTH, CABIN_REAR_Z),
    plan(-CABIN_HALF_WIDTH + 0.1, CABIN_FRONT_Z),
    plan(-CABIN_NOSE_HALF_WIDTH - 0.04, CABIN_NOSE_Z - 0.04),
    plan(CABIN_NOSE_HALF_WIDTH + 0.04, CABIN_NOSE_Z - 0.04),
    plan(CABIN_HALF_WIDTH - 0.1, CABIN_FRONT_Z),
    plan(CABIN_HALF_WIDTH, CABIN_REAR_Z),
  ],
  topAt: () => CABIN_FLOOR_Y,
  bottomAt: () => CABIN_FLOOR_Y - 0.05,
  chamfer: 0.02,
}), { showEdges: false });

for (let can = 0; can < 3; can += 1) {
  const z = lerp(CABIN_REAR_Z + 0.34, CABIN_FRONT_Z - 0.34, can / 2);
  for (const side of [-1, 1] as const) {
    addFacets(`cabin-crush-can-${side < 0 ? "port" : "starboard"}-${can}`, "core-cell", "paint-accent",
      buildTorqueBox({
        from: point(side * 0.3, lowerFlangeTop(side * 0.3, z), z),
        to: point(side * 0.3, CABIN_FLOOR_Y - 0.05, z),
        width: 0.22,
        height: 0.22,
        chamfer: 0.05,
        tag: "crush-can",
      }), { showEdges: false });
  }
}

for (const side of [-1, 1] as const) {
  addBox(`cabin-seat-rail-${side < 0 ? "port" : "starboard"}`, "core-cell", "metal",
    point(side * 0.22, CABIN_FLOOR_Y + 0.05, 1.95), point(0.08, 0.06, 1.0));
}

/** Three bows. Each is the canopy section at its own station, so the frames and
 *  the glazing share one shape rather than two opinions. */
for (const [id, z, section, width] of [
  ["windscreen", 2.98, 0.11, 0.12],
  ["peak", 2.1, 0.1, 0.11],
  ["rear-cut", CANOPY_REAR_Z, 0.15, 0.16],
] as const) {
  addFacets(`cabin-bow-${id}`, "core-cell", "metal", boxChain(
    id === "rear-cut" ? canopyCutSection() : canopySection(z), section, width, `canopy-bow-${id}`,
  ), { showEdges: false });
  // Every bow stands on its own posts down to the tub, not on the glazing.
  for (const side of [-1, 1] as const) {
    const x = side * CABIN_HALF_WIDTH;
    addFacets(`cabin-bow-post-${id}-${side < 0 ? "port" : "starboard"}`, "core-cell", "metal",
      buildTorqueBox({
        from: point(x, CABIN_FLOOR_Y - 0.04, z),
        to: point(x, canopySillAt(x, z), z),
        width: section,
        height: width,
        chamfer: 0.026,
        tag: "bow-post",
      }), { showEdges: false });
  }
}

/** Longitudinal members: two sills on the deck crown, two shoulder rails and the
 *  crown rail. Together they are the wireframe the canopy skin will stretch on. */
const canopyStations = [CANOPY_CUT_SILL_Z, 2.1, 2.35, 2.6, 2.98, CABIN_FRONT_Z, 3.24, CABIN_NOSE_Z];

/**
 * The nose wedge of the cabin. Both sills run forward to one point and the
 * crown comes down to meet them, so from above the canopy rhymes with the hull
 * plan instead of being cut off square across the front.
 */
for (const side of [-1, 1] as const) {
  addFacets(`cabin-nose-rib-${side < 0 ? "port" : "starboard"}`, "core-cell", "metal", boxChain([
    point(side * CABIN_HALF_WIDTH, canopySillAt(side * CABIN_HALF_WIDTH, CABIN_FRONT_Z - 0.1) - 0.05, CABIN_FRONT_Z - 0.1),
    point(side * 0.34, canopySillAt(side * 0.34, 3.24) - 0.03, 3.24),
    point(side * CABIN_NOSE_HALF_WIDTH, canopyCrownAt(CABIN_NOSE_Z) - 0.02, CABIN_NOSE_Z),
  ], 0.1, 0.11, "cabin-nose-rib"), { showEdges: false });
}

addFacets("cabin-crown-rail", "core-cell", "metal", boxChain(
  [CANOPY_CUT_CROWN_Z, 1.6, ...canopyStations.slice(1)].map((z) => point(0, canopyCrownAt(z) - 0.05, z)),
  0.12,
  0.1,
  "crown-rail",
), { showEdges: false });

for (const side of [-1, 1] as const) {
  const suffix = side < 0 ? "port" : "starboard";
  addFacets(`cabin-sill-${suffix}`, "core-cell", "metal", boxChain(
    canopyStations.map((z) => {
      const half = canopyHalfWidthAt(z);
      return point(side * half, canopySillAt(side * half, z) - 0.06, z);
    }),
    0.12,
    0.14,
    "sill-rail",
  ), { showEdges: false });
  // The shoulder rail must land ON the cut frame's shoulder vertex. It used to
  // stop at the sill station and point at that vertex from 0.44 m away — a rail
  // aimed at a joint it never reaches is not a joint.
  addFacets(`cabin-shoulder-rail-${suffix}`, "core-cell", "metal", boxChain(
    [
      point(side * CANOPY_SHOULDER_X, cutShoulderPoint()[1] - 0.04, cutShoulderPoint()[2]),
      ...canopyStations.slice(1).map((z) => {
        const half = canopyHalfWidthAt(z);
        const sill = canopySillAt(half, z);
        return point(side * Math.min(CANOPY_SHOULDER_X, half * 0.65),
          lerp(sill, canopyCrownAt(z), 0.74) - 0.04, z);
      }),
    ],
    0.1,
    0.09,
    "shoulder-rail",
  ), { showEdges: false });
}

// ---------------------------------------------------------------------------
// 8. Dorsal spine and the two yaw tunnels. The spine is structure and an energy
//    bus. It is never an intake and never carries a blade.
// ---------------------------------------------------------------------------

/** Station of the transverse member the whole transition hangs off. */
const TRANSITION_Z = 0.45;
const crestStations = [CANOPY_CUT_CROWN_Z, TRANSITION_Z, 0.2, -1, -1.8, -2.6, TAIL_FRAME_Z];
addFacets("spine-crest", "core-spine", "timber-dark", boxChain(
  crestStations.map((z) => point(0, dorsalCrestAt(z) - CREST_DEPTH / 2, z)),
  CREST_HALF_WIDTH * 2,
  CREST_DEPTH,
  "crest",
), { showEdges: false });

/**
 * The transition does not run BETWEEN the two humps — it lies ACROSS them.
 * Three transverse members ride from the deck, over each tunnel top, and meet
 * the crest on the axis; the valley between the humps aft is the crest table
 * sinking below the tunnels, not a gap left by missing structure.
 */
const YAW_TOP_Y = DUCT_HEX_YAW_STATIONS[1].y + YAW_OUTER;
for (const z of [TRANSITION_Z, -1, -2.35]) {
  const crest = dorsalCrestAt(z);
  const id = z > 0 ? "front" : z > -2 ? "middle" : "rear";
  addFacets(`crest-overlay-${id}`, "core-spine", "metal", boxChain([
    point(-1.5, deckTopAt(-1.5, z) + 0.09, z),
    point(-0.98, YAW_TOP_Y + 0.06, z),
    point(-0.5, lerp(YAW_TOP_Y, crest, 0.55) + 0.02, z),
    point(0, crest - 0.03, z),
    point(0.5, lerp(YAW_TOP_Y, crest, 0.55) + 0.02, z),
    point(0.98, YAW_TOP_Y + 0.06, z),
    point(1.5, deckTopAt(1.5, z) + 0.09, z),
  ], 0.11, 0.1, "crest-overlay"), { showEdges: false });
}

for (const station of DUCT_HEX_YAW_STATIONS) {
  const group = `core-yaw-${station.id}`;
  const wall = YAW_OUTER - YAW_THROAT;
  const shellAt = (radius: number, angle: number, z: number): ObjectPoint =>
    point(station.x + Math.cos(angle) * radius, station.y + Math.sin(angle) * radius, z);

  for (let segment = 0; segment < YAW_SEGMENTS; segment += 1) {
    const from = (segment / YAW_SEGMENTS) * TAU;
    const to = ((segment + 1) / YAW_SEGMENTS) * TAU;
    addFacets(
      `${group}-shell-plate-${segment}`,
      group,
      segment % 2 === 0 ? "timber-mid" : "timber-dark",
      steelPlate(
        shellAt(YAW_OUTER - wall / 2, from, YAW_EXIT_Z),
        shellAt(YAW_OUTER - wall / 2, to, YAW_EXIT_Z),
        shellAt(YAW_OUTER - wall / 2, to, YAW_INLET_Z),
        shellAt(YAW_OUTER - wall / 2, from, YAW_INLET_Z),
        wall,
        "yaw-shell",
      ),
      { showEdges: false },
    );
  }
  // Two saddles per tunnel: the only path from the tunnel into the airframe.
  for (const [index, z] of [0.18, -2.35].entries()) {
    addFacets(`${group}-saddle-${index}`, "core-spine", "metal", boxChain(
      archPoints(YAW_OUTER + 0.06, deckTopAt(station.x, z) - 0.04, station.y + YAW_OUTER + 0.09, z, 7)
        .map((p) => point(p[0] + station.x, p[1], p[2])),
      0.1,
      0.09,
      "yaw-saddle",
    ), { showEdges: false });
  }
  addCylinder(`${group}-shaft-bearing`, group, "metal",
    point(station.x, station.y, YAW_ROTOR_Z + 0.16),
    point(station.x, station.y, YAW_ROTOR_Z - 0.22), 0.075, 14);
}

// ---------------------------------------------------------------------------
// 8b. The transition, and the first skin: the top silhouette.
//
// Owner direction, 2026-08-08: drop the rectangular frames at the tunnel
// mouths; instead tie the transverse member over the channels — the trapezoid —
// to the aft end of the cabin. Its top corners go to the cabin's SHOULDER
// vertices, and its top centre to the crown rail.
//
// The first attempt took the sills instead, one row too low, and the owner named
// the consequence exactly: the roof then dived from the channel down under the
// cabin, so the transition read as a ramp rather than a passage. Attached one
// row higher, the roof stays up: what is left under it is a central tunnel
// carrying the cabin's line aft, with a large air duct on either side of it
// feeding the mouths. Nobody draws those volumes — they are what remains between
// the cabin, the deck and the panels.
//
// The frames were already the top silhouette; they only lacked skin.
// ---------------------------------------------------------------------------

const TRANSITION_CREST = dorsalCrestAt(TRANSITION_Z) - 0.03;
const HUMP_CROWN_Y = YAW_TOP_Y + 0.06;
const CUT_SILL_Y = canopySillAt(CABIN_HALF_WIDTH, CANOPY_CUT_SILL_Z);
const CUT_CROWN_Y = canopyCrownAt(CANOPY_CUT_CROWN_Z);

const cutShoulder = (side: -1 | 1): ObjectPoint => {
  const base = cutShoulderPoint();
  return point(side * base[0], base[1], base[2]);
};

export const DUCT_HEX_CUT_SHOULDER = cutShoulder(1);

/** Grid of armour plates over a warped quad: a,b,c,d run around the patch. */
const skinPatch = (
  id: string,
  group: string,
  material: ObjectMaterialId,
  a: ObjectPoint,
  b: ObjectPoint,
  c: ObjectPoint,
  d: ObjectPoint,
  rows: number,
  columns: number,
  thickness: number,
) => {
  const at = (u: number, v: number): ObjectPoint => {
    const front: ObjectPoint = [
      lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u),
    ];
    const back: ObjectPoint = [
      lerp(d[0], c[0], u), lerp(d[1], c[1], u), lerp(d[2], c[2], u),
    ];
    return point(lerp(front[0], back[0], v), lerp(front[1], back[1], v), lerp(front[2], back[2], v));
  };
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const u0 = column / columns;
      const u1 = (column + 1) / columns;
      const v0 = row / rows;
      const v1 = (row + 1) / rows;
      addFacets(`${id}-${row}-${column}`, group, material, steelPlate(
        at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1), thickness, "skin",
      ), { showEdges: false });
    }
  }
};

/**
 * Sections of the dorsal skin. The transition roof reads the SAME points at the
 * trapezoid, so the two panel families share vertices instead of nearly
 * touching: a seam of a few centimetres is a hole from every camera that
 * matters.
 */
const SKIN_LIFT = 0.07;

const dorsalSection = (z: number): ObjectPoint[] => {
  // The skin lies ON the trusses, not flush with them: level panels let the
  // frames poke through by a few centimetres, and in plan the whole dorsal read
  // as if it were transparent.
  const crest = dorsalCrestAt(z) + SKIN_LIFT;
  const hump = HUMP_CROWN_Y + SKIN_LIFT;
  const shoulderY = (x: number) => deckTopAt(x, z);
  const flank = (x: number) => lerp(deckTopAt(x, z), hump, 0.62);
  const valley = lerp(crest, hump, 0.5);
  return [
    point(-1.62, shoulderY(-1.62), z),
    point(-1.3, flank(-1.3), z),
    point(-TROUGH_X, hump, z),
    point(-0.49, valley, z),
    point(0, crest, z),
    point(0.49, valley, z),
    point(TROUGH_X, hump, z),
    point(1.3, flank(1.3), z),
    point(1.62, shoulderY(1.62), z),
  ];
};

for (const side of [-1, 1] as const) {
  const suffix = side < 0 ? "port" : "starboard";
  const shoulder = cutShoulder(side);
  const humpCorner = point(side * TROUGH_X, HUMP_CROWN_Y, TRANSITION_Z);
  const crestFront = point(0, CUT_CROWN_Y - 0.02, CANOPY_CUT_CROWN_Z);

  // The member the owner asked for: shoulder of the cabin to the top corner of
  // the trapezoid. Everything above it is roof; everything under it is duct.
  addFacets(`transition-spine-${suffix}`, "core-spine", "metal", boxChain(
    [shoulder, point(
      side * lerp(CANOPY_SHOULDER_X, TROUGH_X, 0.55),
      lerp(shoulder[1], HUMP_CROWN_Y, 0.55),
      lerp(shoulder[2], TRANSITION_Z, 0.55),
    ), humpCorner],
    0.12,
    0.13,
    "transition-spine",
  ), { showEdges: false });

  // Lower edge of the intake, run along the hull surface from the cabin's aft
  // sill to the foot of the trapezoid. It is what finishes the intake visually,
  // and it is also the duct's outer floor line.
  const lowerEdge = [1.75, 1.45, 1.15, 0.85, TRANSITION_Z].map((z) => {
    const x = side * lerp(CABIN_HALF_WIDTH, 1.5, (1.75 - z) / (1.75 - TRANSITION_Z));
    return point(x, deckTopAt(x, z) + 0.07, z);
  });
  addFacets(`transition-lower-edge-${suffix}`, "core-spine", "metal",
    boxChain(lowerEdge, 0.11, 0.1, "intake-lower-edge"), { showEdges: false });

  // Inner wall of the duct: the tunnel's own inboard surface carried forward to
  // the cabin. Without it the side duct and the central tunnel are one cavity
  // and the central tunnel has a hole in its floor line.
  const wallX = side * (TROUGH_X - YAW_OUTER - 0.02);
  addFacets(`transition-inner-wall-${suffix}`, "hull-dorsal", "timber-mid", steelPlate(
    point(wallX, deckTopAt(wallX, TRANSITION_Z), TRANSITION_Z),
    point(side * CABIN_HALF_WIDTH, deckTopAt(side * CABIN_HALF_WIDTH, CANOPY_CUT_SILL_Z), CANOPY_CUT_SILL_Z),
    point(side * CABIN_HALF_WIDTH, shoulder[1] - 0.02, shoulder[2]),
    point(wallX, lerp(dorsalCrestAt(TRANSITION_Z), HUMP_CROWN_Y, 0.5), TRANSITION_Z),
    0.045,
    "duct-inner-wall",
  ), { showEdges: false });

  // Roof of the transition: ONE polygon per side, from the trapezoid to the
  // cabin and no further, as the owner asked. Its corners are the four vertices
  // that already exist — cabin crown, cabin shoulder, hump corner, crest — so
  // the panel cannot drift from the trusses it closes.
  const section = dorsalSection(TRANSITION_Z);
  const humpPoint = side < 0 ? section[2] : section[6];
  const crestPoint = section[4];
  addFacets(`hull-transition-roof-${suffix}`, "hull-dorsal", "timber-mid", steelPlate(
    crestFront,
    point(side * CANOPY_SHOULDER_X, shoulder[1] - 0.02, shoulder[2]),
    humpPoint,
    crestPoint,
    0.05,
    "transition-roof",
  ), { showEdges: false });
}

/**
 * The centre strip is laid OVER the canopy and carries on into the transition,
 * so the cabin and the dorsal centre read as one surface rather than two parts
 * that meet. This is the owner's "наложить сверху": an overlay, not a butt joint.
 */
{
  // The strip runs to the tip of the beak: stopping it at the windscreen left
  // the crown rail bare over the nose, and a bare rail reads as a spine sticking
  // out of the skin.
  const strip = [CABIN_NOSE_Z, 3.24, 2.98, 2.6, 2.35, 2.1, 1.6, CANOPY_CUT_CROWN_Z];
  for (let station = 0; station < strip.length - 1; station += 1) {
    const front = strip[station];
    const back = strip[station + 1];
    const halfAt = (z: number) => Math.min(CANOPY_SPINE_HALF, canopyHalfWidthAt(z) * 0.4);
    addFacets(`hull-canopy-spine-${station}`, "hull-dorsal", "timber-mid", steelPlate(
      point(-halfAt(front), canopyCrownAt(front) + 0.03, front),
      point(halfAt(front), canopyCrownAt(front) + 0.03, front),
      point(halfAt(back), canopyCrownAt(back) + 0.03, back),
      point(-halfAt(back), canopyCrownAt(back) + 0.03, back),
      0.05,
      "canopy-spine",
    ), { showEdges: false });
  }
}

/** Dorsal skin proper: outboard shoulder, over each hump, into the valley. */
const dorsalStations = [TRANSITION_Z, -0.3, -1, -1.8, -2.6, YAW_EXIT_Z];
for (let station = 0; station < dorsalStations.length - 1; station += 1) {
  const front = dorsalSection(dorsalStations[station]);
  const back = dorsalSection(dorsalStations[station + 1]);
  for (let lane = 0; lane < front.length - 1; lane += 1) {
    addFacets(`hull-dorsal-panel-${station}-${lane}`, "hull-dorsal", "timber-mid", steelPlate(
      front[lane], front[lane + 1], back[lane + 1], back[lane], 0.05, "dorsal-skin",
    ), { showEdges: false });
  }
}

/**
 * End faces of the dorsal skin. Only two openings are real here: the channel
 * mouth forward and its exhaust aft. Everywhere else the skin has to meet the
 * deck, otherwise the hump is an open box and the front and side projections
 * show straight through it.
 */
for (const side of [-1, 1] as const) {
  const suffix = side < 0 ? "port" : "starboard";
  const closeFace = (id: string, z: number, fromX: number, toX: number) => {
    const section = dorsalSection(z);
    // Interpolate along the section instead of snapping to its nearest vertex:
    // snapping landed both corners of the face on the same point where the skin
    // already meets the deck, and produced a zero-area plate.
    const at = (x: number): ObjectPoint => {
      const target = side * x;
      for (let index = 0; index < section.length - 1; index += 1) {
        const a = section[index];
        const b = section[index + 1];
        if ((a[0] - target) * (b[0] - target) > 0) continue;
        const ratio = Math.abs(b[0] - a[0]) < 1e-9 ? 0 : (target - a[0]) / (b[0] - a[0]);
        const y = lerp(a[1], b[1], ratio);
        return point(target, Math.max(y, deckTopAt(target, z) + 0.04), z);
      }
      return point(target, deckTopAt(target, z) + 0.04, z);
    };
    const outer = at(toX);
    const inner = at(fromX);
    addFacets(`hull-dorsal-face-${id}-${suffix}`, "hull-dorsal", "timber-mid", steelPlate(
      point(inner[0], deckTopAt(inner[0], z), z),
      point(outer[0], deckTopAt(outer[0], z), z),
      outer,
      inner,
      0.045,
      "dorsal-face",
    ), { showEdges: false });
  };
  closeFace("front-outer", TRANSITION_Z, 1.28, 1.58);
  closeFace("rear-outer", YAW_EXIT_Z, 1.28, 1.58);
  closeFace("rear-inner", YAW_EXIT_Z, 0.02, 0.5);
}

/**
 * Chine band. The two deck flanges were two plates with open air between them,
 * so the front and side projections looked straight through the hull edge. The
 * band is the side of the body: it closes the perimeter from the upper flange
 * down to the belly, following the same contour the rail does.
 */
for (let index = 0; index < DUCT_HEX_HULL_CONTOUR.length; index += 1) {
  const current = DUCT_HEX_HULL_CONTOUR[index];
  const next = DUCT_HEX_HULL_CONTOUR[(index + 1) % DUCT_HEX_HULL_CONTOUR.length];
  addFacets(`hull-chine-band-${index}`, "hull-side", "timber-mid", steelPlate(
    point(current.x, bellyAt(current.x, current.z), current.z),
    point(next.x, bellyAt(next.x, next.z), next.z),
    point(next.x, deckTopAt(next.x, next.z), next.z),
    point(current.x, deckTopAt(current.x, current.z), current.z),
    0.04,
    "chine-band",
  ), { showEdges: false });
}

// ---------------------------------------------------------------------------
// 9. Gear trunnions, gun hardpoint, sensor yoke. Each lands on the rail, the
//    keel or a frame — never on a duct wall.
// ---------------------------------------------------------------------------

for (const side of [-1, 1] as const) {
  for (const z of [2.02, -2.02]) {
    const id = `${side < 0 ? "port" : "starboard"}-${z > 0 ? "front" : "rear"}`;
    const railX = ductHexacopterHalfWidthAt(z) - 0.14;
    const inner = side * (railX - 0.34);
    const outer = side * (railX + 0.06);
    addFacets(`gear-trunnion-${id}`, "core-gear-mount", "metal", buildTorqueBox({
      from: point(inner, lowerFlangeTop(inner, z) - 0.02, z),
      to: point(outer, lowerFlangeTop(outer, z) - 0.04, z),
      width: 0.26,
      height: 0.24,
      chamfer: 0.05,
      tag: "trunnion",
    }), { showEdges: false });
    const pinX = side * (railX - 0.05);
    const pinY = lowerFlangeTop(pinX, z) - 0.04;
    addCylinder(`gear-trunnion-pin-${id}`, "core-gear-mount", "metal",
      point(pinX, pinY, z - 0.17), point(pinX, pinY, z + 0.17), 0.05, 14);
  }
}

addFacets("gun-keel-hardpoint", "core-hardpoints", "metal", buildTorqueBox({
  from: point(0, bellyAt(0, NOSE_FRAME_Z + 0.1) + 0.14, NOSE_FRAME_Z + 0.1),
  to: point(0, bellyAt(0, NOSE_FRAME_Z + 0.82) + 0.12, NOSE_FRAME_Z + 0.82),
  width: 0.3,
  height: 0.26,
  chamfer: 0.06,
  tag: "gun-hardpoint",
}), { showEdges: false });
const gunTrunnionY = bellyAt(0, NOSE_FRAME_Z + 0.72) + 0.12;
addCylinder("gun-recoil-trunnion", "core-hardpoints", "metal",
  point(-0.21, gunTrunnionY, NOSE_FRAME_Z + 0.72), point(0.21, gunTrunnionY, NOSE_FRAME_Z + 0.72), 0.07, 14);
addCylinder("sensor-yoke-mount", "core-hardpoints", "metal",
  point(-0.19, gunTrunnionY + 0.2, NOSE_FRAME_Z + 0.5),
  point(0.19, gunTrunnionY + 0.2, NOSE_FRAME_Z + 0.5), 0.05, 14);

// ---------------------------------------------------------------------------
// 9a. Canopy: glazing, armoured beak, rear bulkhead and the interior behind it.
//
// Glass is the one material here allowed to be transparent, and it is allowed
// only because it really is glass. Everything else about this canopy is
// ordinary construction: the panes sit in the frame the bows and rails already
// make, the void under them was cut in the deck two revisions ago, the beak
// ahead of the windscreen is armour rather than a tinted continuation, and
// there is a real seat behind the glass to look at.
// ---------------------------------------------------------------------------

/** Glazing runs from the raked cut forward to the windscreen bow, and no further. */
const GLAZING_FRONT_Z = 2.98;
const GLAZING_STATIONS = [CANOPY_CUT_SILL_Z, 2.1, 2.35, 2.6, GLAZING_FRONT_Z];
const BEAK_STATIONS = [GLAZING_FRONT_Z, 3.24, CABIN_NOSE_Z];

/**
 * A canopy station as four rails: sill, shoulder, spine edge, crown. The cut is
 * raked, so its points carry their own Z; every other station is planar.
 */
const canopyRails = (z: number, raked = false): ObjectPoint[] => {
  const half = canopyHalfWidthAt(z);
  const sillY = canopySillAt(half, z);
  const crownY = canopyCrownAt(raked ? CANOPY_CUT_CROWN_Z : z);
  const shoulderX = Math.min(CANOPY_SHOULDER_X, half * 0.65);
  const shoulderY = lerp(sillY, crownY, 0.74);
  const spineX = Math.min(CANOPY_SPINE_HALF, half * 0.4);
  const spineY = lerp(sillY, crownY, 0.93);
  const zAt = (y: number) => raked
    ? lerp(CANOPY_CUT_SILL_Z, CANOPY_CUT_CROWN_Z, clamp((y - sillY) / (crownY - sillY), 0, 1))
    : z;
  return [
    point(half, sillY, zAt(sillY)),
    point(shoulderX, shoulderY, zAt(shoulderY)),
    point(spineX, spineY, zAt(spineY)),
  ];
};

const emitCanopySkin = (
  prefix: string,
  group: string,
  material: ObjectMaterialId,
  stations: readonly number[],
  thickness: number,
) => {
  for (let station = 0; station < stations.length - 1; station += 1) {
    const rakedAft = stations[station] === CANOPY_CUT_SILL_Z;
    const aft = canopyRails(stations[station], rakedAft);
    const forward = canopyRails(stations[station + 1]);
    for (const side of [-1, 1] as const) {
      const suffix = side < 0 ? "port" : "starboard";
      const mirror = (p: ObjectPoint): ObjectPoint => point(side * p[0], p[1], p[2]);
      for (let rail = 0; rail < aft.length - 1; rail += 1) {
        addFacets(`${prefix}-${suffix}-${station}-${rail}`, group, material, steelPlate(
          mirror(aft[rail]),
          mirror(aft[rail + 1]),
          mirror(forward[rail + 1]),
          mirror(forward[rail]),
          thickness,
          prefix,
        ), { showEdges: false });
      }
    }
  }
};

emitCanopySkin("canopy-pane", "canopy-glazing", "glazing", GLAZING_STATIONS, 0.022);
emitCanopySkin("hull-nose-beak", "hull-nose", "timber-mid", BEAK_STATIONS, 0.045);

/**
 * Rear bulkhead. Without it the cockpit is open into the dorsal passage, and
 * the glass has a corridor behind it instead of a cabin.
 */
{
  const cut = canopyRails(CANOPY_CUT_SILL_Z, true);
  for (const side of [-1, 1] as const) {
    const suffix = side < 0 ? "port" : "starboard";
    const mirror = (p: ObjectPoint): ObjectPoint => point(side * p[0], p[1], p[2]);
    for (let rail = 0; rail < cut.length - 1; rail += 1) {
      const inner = mirror(cut[rail + 1]);
      const outer = mirror(cut[rail]);
      addFacets(`cabin-bulkhead-${suffix}-${rail}`, "core-cell", "roof-dark", steelPlate(
        point(outer[0], CABIN_FLOOR_Y, outer[2]),
        point(inner[0], CABIN_FLOOR_Y, inner[2]),
        inner,
        outer,
        0.05,
        "bulkhead",
      ), { showEdges: false });
    }
  }
  const crown = canopyCrownAt(CANOPY_CUT_CROWN_Z);
  addFacets("cabin-bulkhead-centre", "core-cell", "roof-dark", steelPlate(
    point(-CANOPY_SPINE_HALF, CABIN_FLOOR_Y, CANOPY_CUT_CROWN_Z),
    point(CANOPY_SPINE_HALF, CABIN_FLOOR_Y, CANOPY_CUT_CROWN_Z),
    point(CANOPY_SPINE_HALF, crown - 0.02, CANOPY_CUT_CROWN_Z),
    point(-CANOPY_SPINE_HALF, crown - 0.02, CANOPY_CUT_CROWN_Z),
    0.05,
    "bulkhead",
  ), { showEdges: false });
}

// Interior: what the glass is there to show. Reclined seat, headrest, binnacle
// and stick — enough depth that a pane reads as a pane.
addBox("seat-pan", "interior", "timber-dark", point(0, CABIN_FLOOR_Y + 0.16, 1.98), point(0.52, 0.12, 0.6), point(-0.13, 0, 0));
addBox("seat-back", "interior", "timber-dark", point(0, CABIN_FLOOR_Y + 0.52, 1.62), point(0.54, 0.72, 0.13), point(-0.26, 0, 0));
addBox("seat-headrest", "interior", "roof-dark", point(0, CABIN_FLOOR_Y + 0.92, 1.5), point(0.36, 0.2, 0.14), point(-0.26, 0, 0));
addBox("instrument-binnacle", "interior", "dark-recess", point(0, CABIN_FLOOR_Y + 0.34, 2.86), point(0.5, 0.24, 0.26), point(-0.18, 0, 0));
addCylinder("control-stick", "interior", "metal",
  point(0.14, CABIN_FLOOR_Y + 0.04, 2.42), point(0.17, CABIN_FLOOR_Y + 0.34, 2.5), 0.024, 12);
addBox("rudder-pedals", "interior", "metal", point(0, CABIN_FLOOR_Y + 0.08, 2.96), point(0.42, 0.06, 0.2), point(-0.2, 0, 0));

// ---------------------------------------------------------------------------
// 9b. Propulsion: flow paths, fans and blades.
//
// The rings and the axes were fixed by the core; nothing here may move them.
// Every fan is one mesh per rotor — a rotor turns as one body, and a part per
// blade would buy nothing but forty-eight ids.
// ---------------------------------------------------------------------------

/** One fan: `count` twisted, tapered blades around an axis, as a single mesh. */
const fanBlades = (
  centre: ObjectPoint,
  axis: "y" | "z",
  count: number,
  rootRadius: number,
  tipRadius: number,
  rootChord: number,
  tipChord: number,
  halfThickness: number,
  spinSign: number,
): { vertices: ObjectPoint[]; triangles: ObjectTriangle[] } => {
  const vertices: ObjectPoint[] = [];
  const triangles: ObjectTriangle[] = [];
  const place = (radial: number, tangential: number, axial: number, angle: number): ObjectPoint => {
    const across = Math.cos(angle) * radial - Math.sin(angle) * tangential;
    const along = Math.sin(angle) * radial + Math.cos(angle) * tangential;
    return axis === "y"
      ? point(centre[0] + across, centre[1] + axial, centre[2] + along)
      : point(centre[0] + across, centre[1] + along, centre[2] + axial);
  };
  const spans = [0, 0.42, 0.78, 1];
  for (let blade = 0; blade < count; blade += 1) {
    const base = (blade / count) * TAU;
    const first = vertices.length;
    for (const span of spans) {
      const radius = lerp(rootRadius, tipRadius, span);
      const chord = lerp(rootChord, tipChord, span);
      // Twist: the tip leads the root, so the disc reads as a working fan and
      // not as a paper pinwheel.
      const angle = base + spinSign * 0.24 * span;
      for (const axial of [-halfThickness, halfThickness]) {
        vertices.push(place(radius, -chord, axial, angle));
        vertices.push(place(radius, chord, axial, angle));
      }
    }
    for (let span = 0; span < spans.length - 1; span += 1) {
      const a = first + span * 4;
      const b = first + (span + 1) * 4;
      triangles.push(
        [a, b, b + 1], [a, b + 1, a + 1],
        [a + 2, a + 3, b + 3], [a + 2, b + 3, b + 2],
        [a + 1, b + 1, b + 3], [a + 1, b + 3, a + 3],
        [a + 2, b + 2, b], [a + 2, b, a],
      );
    }
    const last = first + (spans.length - 1) * 4;
    triangles.push([first, first + 1, first + 3], [first, first + 3, first + 2]);
    triangles.push([last, last + 2, last + 3], [last, last + 3, last + 1]);
  }
  return { vertices, triangles };
};

const LIFT_HUB_RADIUS = 0.17;
const LIFT_BLADE_COUNT = 10;

for (const station of DUCT_HEX_LIFT_STATIONS) {
  const group = `rotor-lift-${station.id}`;
  const flow = `duct-flow-${station.id}`;
  const centre = plan(station.x, station.z);
  const deck = deckTopAt(station.x, station.z);
  const belly = bellyAt(station.x, station.z);
  const spinSign = station.spin === "cw" ? 1 : -1;

  // Bell-mouth inlet: the lip is what makes a duct lift in the hover, and the
  // difference between a duct and a hole in a plate.
  addFacets(`${flow}-inlet-lip`, "duct-flow", "timber-mid", buildRevolution([
    { radius: LIFT_RING_OUTER, y: deck + 0.02 },
    { radius: LIFT_RING_OUTER - 0.03, y: deck - 0.04 },
    { radius: LIFT_THROAT + 0.05, y: deck - 0.12 },
    { radius: LIFT_THROAT, y: deck - 0.24 },
  ], centre, { segments: 36, tag: "inlet-lip" }), { showEdges: false });

  // Expanding diffuser: the exit is wider than the throat, or the duct is a pipe.
  addFacets(`${flow}-diffuser`, "duct-flow", "timber-dark", buildRevolution([
    { radius: LIFT_THROAT, y: station.planeY - 0.26 },
    { radius: LIFT_THROAT + 0.05, y: belly + 0.08 },
    { radius: LIFT_THROAT + 0.09, y: belly },
  ], centre, { segments: 36, tag: "diffuser" }), { showEdges: false });

  addCylinder(`${group}-motor`, group, "metal",
    point(station.x, station.planeY - 0.13, station.z),
    point(station.x, station.planeY + 0.06, station.z), LIFT_HUB_RADIUS, 20);
  addEllipsoid(`${group}-spinner`, group, "roof-dark",
    point(station.x, station.planeY + 0.09, station.z),
    point(LIFT_HUB_RADIUS, 0.16, LIFT_HUB_RADIUS), 20, 10);

  for (let pylon = 0; pylon < 3; pylon += 1) {
    const angle = (pylon / 3) * TAU + Math.PI / 6;
    addFacets(`${flow}-motor-pylon-${pylon}`, "duct-flow", "metal", buildTorqueBox({
      from: point(station.x + Math.cos(angle) * LIFT_THROAT, station.planeY - 0.12, station.z + Math.sin(angle) * LIFT_THROAT),
      to: point(station.x + Math.cos(angle) * LIFT_HUB_RADIUS, station.planeY - 0.1, station.z + Math.sin(angle) * LIFT_HUB_RADIUS),
      width: 0.07,
      height: 0.05,
      chamfer: 0.014,
      tag: "motor-pylon",
    }), { showEdges: false });
  }

  // Guard/stator plane below the disc: it takes a grazing strike and straightens
  // the wake. It never enters the swept disc — the offset is the contract.
  for (let vane = 0; vane < 6; vane += 1) {
    const angle = (vane / 6) * TAU + Math.PI / 12;
    addFacets(`${flow}-guard-vane-${vane}`, "duct-flow", "metal", buildTorqueBox({
      from: point(station.x + Math.cos(angle) * (LIFT_THROAT - 0.01), station.planeY - 0.28, station.z + Math.sin(angle) * (LIFT_THROAT - 0.01)),
      to: point(station.x - Math.cos(angle) * (LIFT_THROAT - 0.01), station.planeY - 0.28, station.z - Math.sin(angle) * (LIFT_THROAT - 0.01)),
      width: 0.055,
      height: 0.028,
      chamfer: 0.01,
      tag: "guard-vane",
    }), { showEdges: false });
  }

  const disc = fanBlades(
    point(station.x, station.planeY, station.z), "y",
    LIFT_BLADE_COUNT, LIFT_HUB_RADIUS + 0.02, LIFT_TIP, 0.15, 0.075, 0.018, spinSign,
  );
  addMeshPart(`${group}-blades`, group, "timber-dark", disc.vertices, disc.triangles);
}

for (const station of DUCT_HEX_YAW_STATIONS) {
  const group = `rotor-yaw-${station.id}`;
  const spinSign = station.spin === "cw" ? 1 : -1;
  addCylinder(`${group}-motor`, group, "metal",
    point(station.x, station.y, YAW_ROTOR_Z - 0.2),
    point(station.x, station.y, YAW_ROTOR_Z + 0.02), 0.1, 16);
  addEllipsoid(`${group}-spinner`, group, "roof-dark",
    point(station.x, station.y, YAW_ROTOR_Z + 0.06),
    point(0.1, 0.1, 0.14), 18, 9);
  const disc = fanBlades(
    point(station.x, station.y, YAW_ROTOR_Z), "z",
    6, 0.11, YAW_TIP, 0.09, 0.05, 0.014, spinSign,
  );
  addMeshPart(`${group}-blades`, group, "timber-dark", disc.vertices, disc.triangles);
  // Stator pack behind the fan: reverse thrust is only honest if the flow is
  // straightened on both sides of the disc.
  for (let vane = 0; vane < 4; vane += 1) {
    const angle = (vane / 4) * TAU + Math.PI / 8;
    addFacets(`${group}-stator-${vane}`, group, "metal", buildTorqueBox({
      from: point(station.x + Math.cos(angle) * YAW_THROAT, station.y + Math.sin(angle) * YAW_THROAT, YAW_ROTOR_Z - 0.3),
      to: point(station.x + Math.cos(angle) * 0.1, station.y + Math.sin(angle) * 0.1, YAW_ROTOR_Z - 0.26),
      width: 0.05,
      height: 0.04,
      chamfer: 0.012,
      tag: "yaw-stator",
    }), { showEdges: false });
  }
}

// ---------------------------------------------------------------------------
// 9c. Landing gear. Four splayed legs, and they retract.
//
// Where the legs may live was decided by the duct pack, not by taste: in plan
// the only volumes free of a ring are the nose, the tail and the two clear
// bands. So the legs stand at the nose and the tail, which also buys the
// longest wheelbase this airframe can have, and they fold into the same free
// volumes — the front pair forward into the nose, the rear pair inboard under
// the tail. A leg that folds into a ring is not retractable, it is broken.
//
// The stations are exported the way RAX-8 exports its own: the live machine
// builds its struts from knee and axle, so they are contract, not drawing.
// ---------------------------------------------------------------------------

export const DUCT_HEX_LANDING_STATIONS = [
  { id: "left-front", side: -1 as const, attachX: 1.52, attachZ: 2.95, padX: 2.06, padZ: 3.18 },
  { id: "right-front", side: 1 as const, attachX: 1.52, attachZ: 2.95, padX: 2.06, padZ: 3.18 },
  { id: "left-rear", side: -1 as const, attachX: 1.72, attachZ: -2.82, padX: 2.36, padZ: -3.04 },
  { id: "right-rear", side: 1 as const, attachX: 1.72, attachZ: -2.82, padX: 2.36, padZ: -3.04 },
].map((station) => {
  const attach = point(
    station.side * station.attachX,
    bellyAt(station.side * station.attachX, station.attachZ) - 0.04,
    station.attachZ,
  );
  const pad = point(station.side * station.padX, 0, station.padZ);
  const knee = point(
    lerp(attach[0], pad[0], 0.52),
    lerp(attach[1], 0, 0.55),
    lerp(attach[2], pad[2], 0.52),
  );
  const axle = point(lerp(knee[0], pad[0], 0.86), 0.17, lerp(knee[2], pad[2], 0.86));
  return { ...station, attach, knee, axle, pad };
});

/** Oleo travel; the live strut model takes the same number. */
export const DUCT_HEX_OLEO_STROKE = 0.13;

for (const gear of DUCT_HEX_LANDING_STATIONS) {
  const { attach, knee, axle, pad, side } = gear;
  const oleoAt = (t: number) => point(
    lerp(knee[0], axle[0], t), lerp(knee[1], axle[1], t), lerp(knee[2], axle[2], t),
  );

  addFacets(`landing-trunnion-${gear.id}`, "landing-gear", "metal", buildTorqueBox({
    from: point(attach[0], attach[1], attach[2] - 0.15),
    to: point(attach[0], attach[1], attach[2] + 0.15),
    width: 0.16,
    height: 0.17,
    chamfer: 0.036,
    tag: "landing-trunnion",
  }), { showEdges: false });

  addFacets(`landing-main-strut-${gear.id}`, "landing-gear", "timber-dark", [
    ...buildTorqueBox({
      from: attach,
      to: point(lerp(attach[0], knee[0], 0.5), lerp(attach[1], knee[1], 0.5), lerp(attach[2], knee[2], 0.5)),
      width: 0.13, height: 0.17, chamfer: 0.036, tag: "main-strut-upper",
    }),
    ...buildTorqueBox({
      from: point(lerp(attach[0], knee[0], 0.5), lerp(attach[1], knee[1], 0.5), lerp(attach[2], knee[2], 0.5)),
      to: knee,
      width: 0.1, height: 0.14, chamfer: 0.03, tag: "main-strut-lower",
    }),
  ], { showEdges: false });

  addFacets(`landing-drag-link-${gear.id}`, "landing-gear", "timber-mid", buildTorqueBox({
    from: point(attach[0] - side * 0.06, attach[1] - 0.02, attach[2] + (gear.attach[2] > 0 ? -0.42 : 0.42)),
    to: point(knee[0] - side * 0.02, knee[1] + 0.05, knee[2]),
    width: 0.06,
    height: 0.08,
    chamfer: 0.018,
    tag: "drag-link",
  }), { showEdges: false });

  addEllipsoid(`landing-knee-${gear.id}`, "landing-gear", "metal", knee, point(0.07, 0.065, 0.07), 14, 7);
  addCylinder(`landing-oleo-${gear.id}`, "landing-gear", "metal", knee, oleoAt(0.62), 0.05, 18);
  addCylinder(`landing-oleo-gland-${gear.id}`, "landing-gear", "paint-accent", oleoAt(0.58), oleoAt(0.71), 0.058, 18);
  addCylinder(`landing-oleo-piston-${gear.id}`, "landing-gear", "metal", oleoAt(0.42), axle, 0.038, 16);
  addCylinder(`landing-pad-pivot-${gear.id}`, "landing-gear", "metal",
    point(pad[0] - 0.1, 0.13, pad[2]), point(pad[0] + 0.1, 0.13, pad[2]), 0.034, 14);
  addFacets(`landing-pad-${gear.id}`, "landing-gear", "timber-dark", buildSlab({
    outline: [
      plan(pad[0] - 0.19, pad[2] - 0.15),
      plan(pad[0] + 0.19, pad[2] - 0.15),
      plan(pad[0] + 0.19, pad[2] + 0.15),
      plan(pad[0] - 0.19, pad[2] + 0.15),
    ],
    topAt: () => 0.11,
    bottomAt: () => 0.026,
    chamfer: 0.03,
  }), { showEdges: false });
  addBox(`landing-sole-${gear.id}`, "landing-gear", "dark-recess", point(pad[0], 0.01, pad[2]), point(0.34, 0.02, 0.26));
}

// ---------------------------------------------------------------------------
// 9d. Weapons along the belly centreline.
// ---------------------------------------------------------------------------

const GUN_Z = NOSE_FRAME_Z + 0.72;
const gunY = bellyAt(0, GUN_Z) + 0.06;

addFacets("gun-cradle", "weapons", "roof-dark", buildTorqueBox({
  from: point(0, gunY, GUN_Z - 0.3),
  to: point(0, gunY - 0.03, GUN_Z + 0.34),
  width: 0.22,
  height: 0.2,
  chamfer: 0.05,
  tag: "gun-cradle",
}), { showEdges: false });
addCylinder("gun-traverse", "weapons", "metal",
  point(-0.2, gunY + 0.02, GUN_Z - 0.06), point(0.2, gunY + 0.02, GUN_Z - 0.06), 0.09, 18);
for (const [index, offset] of [[0, 0, 0], [1, -0.045, 0.044], [2, 0.045, 0.044]].entries()) {
  const [, dx, dy] = offset as [number, number, number];
  addCylinder(`gun-barrel-${index}`, "weapons", "metal",
    point(dx, gunY - 0.05 + dy, GUN_Z + 0.26), point(dx, gunY - 0.07 + dy, GUN_Z + 0.92), 0.024, 14);
  addCylinder(`gun-muzzle-${index}`, "weapons", "dark-recess",
    point(dx, gunY - 0.07 + dy, GUN_Z + 0.87), point(dx, gunY - 0.072 + dy, GUN_Z + 0.96), 0.031, 14);
}
addEllipsoid("sensor-ball", "weapons", "roof-dark", point(0, bellyAt(0, GUN_Z - 0.62) - 0.06, GUN_Z - 0.62), point(0.19, 0.17, 0.19), 22, 11);

/**
 * Rocket launchers. Conformal, not slung: each bay's roof IS the belly surface,
 * its plan repeats the hull's own lobed contour scaled inboard, and its floor
 * falls away in the same taper. A box hung under this hull would read as
 * luggage; this reads as part of the body with tubes cut into it.
 */
const LAUNCHER_TUBE_ROWS = 2;
const LAUNCHER_TUBE_COLUMNS = 3;
for (const side of [-1, 1] as const) {
  const suffix = side < 0 ? "port" : "starboard";
  const outline = [
    plan(side * 0.72, -1.15),
    plan(side * 1.24, -0.55),
    plan(side * 1.24, 0.75),
    plan(side * 0.98, 1.52),
    plan(side * 0.72, 1.62),
  ];
  addFacets(`launcher-bay-${suffix}`, "weapons", "roof-dark", buildSlab({
    outline,
    topAt: (x, z) => bellyAt(x, z) + 0.02,
    // The floor tapers fore and aft like the body above it. A constant depth
    // made a suitcase; the taper makes it part of the hull.
    bottomAt: (x, z) => bellyAt(x, z) - lerp(0.34, 0.09,
      Math.min(1, Math.abs(z - 0.25) / 1.15) ** 1.4),
    chamfer: 0.05,
  }), { showEdges: false });

  for (let row = 0; row < LAUNCHER_TUBE_ROWS; row += 1) {
    for (let column = 0; column < LAUNCHER_TUBE_COLUMNS; column += 1) {
      const x = side * lerp(0.82, 1.14, column / (LAUNCHER_TUBE_COLUMNS - 1));
      const y = bellyAt(x, 1.3) - 0.09 - row * 0.13;
      addCylinder(`launcher-tube-${suffix}-${row}-${column}`, "weapons", "metal",
        point(x, y, 1.46), point(x, y + 0.02, 0.9), 0.055, 14);
      addCylinder(`launcher-muzzle-${suffix}-${row}-${column}`, "weapons", "dark-recess",
        point(x, y, 1.5), point(x, y, 1.44), 0.048, 14);
    }
  }

  addFacets(`launcher-hardpoint-${suffix}`, "weapons", "metal", buildTorqueBox({
    from: point(side * KEEL_X, bellyAt(side * KEEL_X, 0.5) + 0.08, 0.5),
    to: point(side * 1.0, bellyAt(side * 1.0, 0.5) + 0.02, 0.5),
    width: 0.12,
    height: 0.13,
    chamfer: 0.03,
    tag: "launcher-hardpoint",
  }), { showEdges: false });
}

// ---------------------------------------------------------------------------
// 10. Recovered envelope and the canonical model.
// ---------------------------------------------------------------------------

const rotateBoxCorner = (corner: ObjectPoint, rotation: ObjectPoint): ObjectPoint => {
  const [rx, ry, rz] = rotation;
  let [x, y, z] = corner;
  [y, z] = [y * Math.cos(rx) - z * Math.sin(rx), y * Math.sin(rx) + z * Math.cos(rx)];
  [x, z] = [x * Math.cos(ry) + z * Math.sin(ry), -x * Math.sin(ry) + z * Math.cos(ry)];
  [x, y] = [x * Math.cos(rz) - y * Math.sin(rz), x * Math.sin(rz) + y * Math.cos(rz)];
  return point(x, y, z);
};

export function ductHexacopterPartBounds(part: ObjectLabPart): { readonly min: ObjectPoint; readonly max: ObjectPoint } {
  const axes = [0, 1, 2] as const;
  if (part.kind === "mesh") {
    return {
      min: point(...(axes.map((axis) => Math.min(...part.vertices.map((v) => v[axis]))) as [number, number, number])),
      max: point(...(axes.map((axis) => Math.max(...part.vertices.map((v) => v[axis]))) as [number, number, number])),
    };
  }
  if (part.kind === "box") {
    const corners: ObjectPoint[] = [];
    for (const x of [-part.size[0] / 2, part.size[0] / 2]) {
      for (const y of [-part.size[1] / 2, part.size[1] / 2]) {
        for (const z of [-part.size[2] / 2, part.size[2] / 2]) {
          const rotated = part.rotation ? rotateBoxCorner(point(x, y, z), part.rotation) : point(x, y, z);
          corners.push(point(rotated[0] + part.center[0], rotated[1] + part.center[1], rotated[2] + part.center[2]));
        }
      }
    }
    return {
      min: point(...(axes.map((axis) => Math.min(...corners.map((c) => c[axis]))) as [number, number, number])),
      max: point(...(axes.map((axis) => Math.max(...corners.map((c) => c[axis]))) as [number, number, number])),
    };
  }
  const delta = [part.to[0] - part.from[0], part.to[1] - part.from[1], part.to[2] - part.from[2]];
  const length = Math.hypot(...delta) || 1;
  const axis = delta.map((component) => component / length);
  if (part.kind === "cylinder") {
    const radial = axis.map((component) => part.radius * Math.sqrt(Math.max(0, 1 - component * component)));
    return {
      min: point(...(axes.map((i) => Math.min(part.from[i], part.to[i]) - radial[i]) as [number, number, number])),
      max: point(...(axes.map((i) => Math.max(part.from[i], part.to[i]) + radial[i]) as [number, number, number])),
    };
  }
  const reach = Math.hypot(part.width, part.depth) / 2;
  return {
    min: point(...(axes.map((i) => Math.min(part.from[i], part.to[i]) - reach) as [number, number, number])),
    max: point(...(axes.map((i) => Math.max(part.from[i], part.to[i]) + reach) as [number, number, number])),
  };
}

const envelope = parts.reduce(
  (bounds, part) => {
    const partBounds = ductHexacopterPartBounds(part);
    return {
      min: point(...([0, 1, 2].map((axis) => Math.min(bounds.min[axis], partBounds.min[axis])) as [number, number, number])),
      max: point(...([0, 1, 2].map((axis) => Math.max(bounds.max[axis], partBounds.max[axis])) as [number, number, number])),
    };
  },
  { min: point(Infinity, Infinity, Infinity), max: point(-Infinity, -Infinity, -Infinity) },
);

const round = (value: number) => Math.round(value * 1000) / 1000;

export const DUCT_HEX_CORE_LENGTH = round(envelope.max[2] - envelope.min[2]);
export const DUCT_HEX_CORE_WIDTH = round(envelope.max[0] - envelope.min[0]);
export const DUCT_HEX_CORE_HEIGHT = round(envelope.max[1] - envelope.min[1]);
export const DUCT_HEX_HULL_LENGTH = round(NOSE_Z - TRANSOM_Z);
export const DUCT_HEX_PART_BUDGET = 820;
export const DUCT_HEX_BAND_FRAME_Z = BAND_FRAME_Z;
export const DUCT_HEX_BAND_FRAME_WIDTH = BAND_FRAME_WIDTH;
export const DUCT_HEX_LIFT_RING_OUTER = LIFT_RING_OUTER;
export const DUCT_HEX_LIFT_TIP = LIFT_TIP;
export const DUCT_HEX_LIFT_THROAT = LIFT_THROAT;
export const DUCT_HEX_HULL_LOBE_RADIUS = HULL_LOBE_RADIUS;
export const DUCT_HEX_YAW_TIP = YAW_TIP;
export const DUCT_HEX_YAW_ROTOR_Z = YAW_ROTOR_Z;
export const DUCT_HEX_FLANGE = FLANGE;
export const DUCT_HEX_CABIN = {
  frontZ: CABIN_FRONT_Z,
  rearZ: CABIN_REAR_Z,
  halfWidth: CABIN_HALF_WIDTH,
  floorY: CABIN_FLOOR_Y,
} as const;

/** Section depths that make the loft checkable: axis versus chine, nose versus waist. */
export const DUCT_HEX_SECTIONS = {
  noseDepth: round(deckTopAt(0, NOSE_Z - 0.1) - bellyAt(0, NOSE_Z - 0.1)),
  waistDepth: round(deckTopAt(0, 0) - bellyAt(0, 0)),
  chineDepth: round(deckTopAt(HALF_WIDTH_MAX, 0) - bellyAt(HALF_WIDTH_MAX, 0)),
  transomDepth: round(deckTopAt(0, TRANSOM_Z + 0.1) - bellyAt(0, TRANSOM_Z + 0.1)),
  crownDrop: round(deckTopAt(0, 0) - deckTopAt(0, NOSE_Z)),
  chineDrop: round(deckTopAt(0, 0) - deckTopAt(HALF_WIDTH_MAX, 0)),
} as const;

const kinematicGroups: readonly KinematicGroup[] = [
  ...DUCT_HEX_LIFT_STATIONS.map((station) => ({
    id: `lift-${station.id}`,
    pivot: point(station.x, station.planeY, station.z),
    axis: point(0, 1, 0),
    spin: station.spin,
    motion: "constant-rotation-only" as const,
    reversible: false,
    sweptRadius: LIFT_TIP,
    members: [`rotor-lift-${station.id}-blades`, `rotor-lift-${station.id}-spinner`] as readonly string[],
  })),
  ...DUCT_HEX_YAW_STATIONS.map((station) => ({
    id: `yaw-${station.id}`,
    pivot: point(station.x, station.y, YAW_ROTOR_Z),
    axis: point(0, 0, 1),
    spin: station.spin,
    motion: "constant-rotation-only" as const,
    reversible: true,
    sweptRadius: YAW_TIP,
    members: [`rotor-yaw-${station.id}-blades`, `rotor-yaw-${station.id}-spinner`] as readonly string[],
  })),
];

/**
 * Retraction contract. Pivot, axis, range and rest phase — a boolean would be a
 * comment. The fold direction differs front to rear because the free volume
 * differs: the nose has room ahead, the tail has room inboard.
 */
export const DUCT_HEX_GEAR_RETRACTION = DUCT_HEX_LANDING_STATIONS.map((gear) => {
  // The angle is not chosen, it is solved: the leg rotates about its fore-aft
  // trunnion until it lies horizontal pointing inboard. A splayed leg therefore
  // needs far more than the ninety degrees one might type from habit.
  const phi = Math.atan2(gear.pad[1] - gear.attach[1], gear.pad[0] - gear.attach[0]);
  const target = gear.side < 0 ? 0 : Math.PI;
  const fold = (target - phi) * 180 / Math.PI;
  return {
    id: gear.id,
    pivot: gear.attach,
    axis: point(0, 0, 1),
    rangeDegrees: [0, Math.round(fold * 10) / 10] as const,
    restDegrees: 0,
    motion: "hinge-retraction" as const,
    interlock: "gearDownWhenBelowFiftyMetres" as const,
  };
});

const structuralGroups = [
  "core-deck-upper",
  "core-deck-lower",
  "core-frames",
  "core-keel",
  "core-rail",
  "core-cell",
  "core-spine",
  "core-gear-mount",
  "core-hardpoints",
] as const;

export const ductHexacopterObject: DuctHexacopterModel = {
  id: "vx8-yaqui",
  revision: "duct-hex-d4a-rig-2026-08-08",
  title: "VX-8 «Yaqui» — eight fans, four retractable legs, centreline gun and launchers",
  units: "metres",
  coordinates: { up: "+Y", front: "+Z", origin: "ground-centre" },
  sourceNotes: [
    "The owner-selected concept owns visual character only; every dimension, hidden member and joint here is authored and testable.",
    "The body is a loft: a crown line that dives to the nose and a belly that lifts to every chine, so the section is a lens and the nose is a blade.",
    "The clear band between duct rows is exactly where the two full-span transverse frames pass: the duct pack and the frame grid are one decision.",
    "The armoured force-contour is three lobes per side joined by their own external tangents, so clearance to every ring is a property of the construction.",
    "Load path: blade -> hub -> pylons -> ring -> paired root webs -> deck flanges + frame grid -> keels -> survival cell.",
    "This revision is the steel core. Skin, fans, legs and weapons come later and may not move an accepted station.",
  ],
  dimensions: {
    coreLength: DUCT_HEX_CORE_LENGTH,
    coreWidth: DUCT_HEX_CORE_WIDTH,
    coreHeight: DUCT_HEX_CORE_HEIGHT,
    hullLength: DUCT_HEX_HULL_LENGTH,
    crownAtWaist: round(deckTopAt(0, 0)),
    crownAtNose: round(deckTopAt(0, NOSE_Z)),
    bellyAtWaist: round(bellyAt(0, 0)),
    waistDepth: DUCT_HEX_SECTIONS.waistDepth,
    chineDepth: DUCT_HEX_SECTIONS.chineDepth,
    noseDepth: DUCT_HEX_SECTIONS.noseDepth,
    liftTipDiameter: round(LIFT_TIP * 2),
    liftThroatDiameter: round(LIFT_THROAT * 2),
    liftRingOuterDiameter: round(LIFT_RING_OUTER * 2),
    yawTipDiameter: round(YAW_TIP * 2),
    yawTunnelLength: round(YAW_INLET_Z - YAW_EXIT_Z),
    bandFrameZ: BAND_FRAME_Z,
    rotorCount: 6,
    yawFanCount: 2,
  },
  labMetrics: [
    { label: "CORE LENGTH", value: DUCT_HEX_CORE_LENGTH, decimals: 2 },
    { label: "CORE WIDTH", value: DUCT_HEX_CORE_WIDTH, decimals: 2 },
    { label: "CORE HEIGHT", value: DUCT_HEX_CORE_HEIGHT, decimals: 2 },
    { label: "WAIST DEPTH", value: DUCT_HEX_SECTIONS.waistDepth, decimals: 2 },
    { label: "CHINE DEPTH", value: DUCT_HEX_SECTIONS.chineDepth, decimals: 2 },
    { label: "CROWN DROP", value: DUCT_HEX_SECTIONS.crownDrop, decimals: 2 },
    { label: "PARTS", value: parts.length, decimals: 0, unit: "" },
  ],
  anchors: {
    groundCentre: point(0, 0, 0),
    pilotEye: point(0, 1.88, 2.35),
    seatReference: point(0, CABIN_FLOOR_Y + 0.18, 1.95),
    gunHardpoint: point(0, gunTrunnionY, NOSE_FRAME_Z + 0.72),
    leftYawAxis: point(-0.98, 1.66, YAW_ROTOR_Z),
    rightYawAxis: point(0.98, 1.66, YAW_ROTOR_Z),
    frontBandFrame: point(0, lowerFlangeTop(0, BAND_FRAME_Z), BAND_FRAME_Z),
    rearBandFrame: point(0, lowerFlangeTop(0, -BAND_FRAME_Z), -BAND_FRAME_Z),
  },
  motionConstraints: {
    liftRotorCount: 6,
    yawFanCount: 2,
    liftAxesFixedToBody: true,
    yawAxesParallelToKeel: true,
    yawFansReversible: true,
    rotorBodiesForbidden: true,
    landingGearRetracts: true,
    gunFiringExcluded: true,
    launcherFiringExcluded: true,
    worldPlacementAllowed: false,
  },
  kinematicGroups,
  captureFrame: [1600, 1000] as const,
  labEnvironment: { floorRadius: 9, gridSize: 10, gridDivisions: 20, fogNear: 20, fogFar: 30, floorY: 0 },
  materialOverrides: {
    metal: { color: 0x8a8378, roughness: 0.32, metalness: 0.86 },
    "timber-mid": { color: 0x565b5c, roughness: 0.46, metalness: 0.52 },
    "timber-dark": { color: 0x33383a, roughness: 0.52, metalness: 0.4 },
    "paint-light": { color: 0x9aa0a2, roughness: 0.58, metalness: 0.18 },
    "paint-accent": { color: 0xd08a34, roughness: 0.5, metalness: 0.12 },
    "roof-dark": { color: 0x23282a, roughness: 0.5, metalness: 0.3 },
    "dark-recess": { color: 0x0a0d0e, roughness: 0.94, metalness: 0 },
    // The one transparent material in the object, and it is transparent because
    // it is glass. Every other surface stays opaque in every camera.
    glazing: { color: 0x0c1a20, roughness: 0.09, metalness: 0.06, transparent: true, opacity: 0.82 },
  },
  parts,
  views: [
    { id: "front", label: "Front orthographic — lens section, chine to chine", projection: "orthographic", position: point(0, 1.2, 14), target: point(0, 1.05, 0), orthoHeight: 5.4 },
    { id: "left", label: "Left profile — diving crown and lifting belly", projection: "orthographic", position: point(-14, 1.2, 0), target: point(0, 1.05, 0), orthoHeight: 5.8 },
    { id: "rear", label: "Rear orthographic — yaw tunnels and tail frame", projection: "orthographic", position: point(0, 1.2, -14), target: point(0, 1.05, 0), orthoHeight: 5.4 },
    { id: "top", label: "Top plan — frame grid in the duct band", projection: "orthographic", position: point(0, 16, 0), target: point(0, 1.05, 0), up: point(0, 0, 1), orthoHeight: 8.7 },
    { id: "front-three-quarter", label: "Front three-quarter — core identity", projection: "perspective", position: point(-8.4, 5.4, 9.2), target: point(0, 1.05, 0.1), fov: 32 },
    { id: "rear-three-quarter", label: "Rear three-quarter — spine, saddles, tail frame", projection: "perspective", position: point(8.6, 4.8, -8.8), target: point(0, 1.1, -0.4), fov: 33 },
    { id: "high-three-quarter", label: "High three-quarter — frame plan and cabin void", projection: "perspective", position: point(-8.2, 10.2, 8.0), target: point(0, 1.0, 0.1), fov: 33 },
    { id: "underside", label: "Low three-quarter — belly, lower flange and trunnions", projection: "perspective", position: point(4.9, 0.16, 5.6), target: point(0, 0.92, 0.15), fov: 38 },
    // Diagnostic pairs: the same camera twice, once whole and once with named
    // groups hidden. Hiding is a camera state — the flange stays a filled opaque
    // plate in the object, and nothing is ghosted or faded.
    { id: "top-cutaway", label: "Top plan, cutaway — deck flange and dorsal group hidden", projection: "orthographic", position: point(0, 16, 0), target: point(0, 1.05, 0), up: point(0, 0, 1), orthoHeight: 8.7, hiddenGroups: ["core-deck-upper", "core-spine", "core-yaw-left", "core-yaw-right"] },
    { id: "high-three-quarter-cutaway", label: "High three-quarter, cutaway — frame grid under the flange", projection: "perspective", position: point(-8.2, 10.2, 8.0), target: point(0, 1.0, 0.1), fov: 33, hiddenGroups: ["core-deck-upper"] },
    { id: "band-frame-detail", label: "Detail — the frame in the clear band between rows", projection: "perspective", position: point(-3.6, 2.6, 3.4), target: point(-2.35, 1.02, 1.05), fov: 26 },
    { id: "duct-cell-detail", label: "Detail — ring plates, splices and paired root webs", projection: "perspective", position: point(-4.4, 2.4, -0.4), target: point(-2.56, 1.04, 0), fov: 27 },
    { id: "cabin-detail", label: "Detail — canopy bows, sills and crown rail over the tub", projection: "perspective", position: point(-3.1, 2.35, 5.3), target: point(0, 1.62, 2.15), fov: 30 },
    { id: "cabin-profile", label: "Cabin profile — raked cut and the crest that carries on aft", projection: "orthographic", position: point(-12, 1.65, 1.6), target: point(0, 1.6, 1.6), orthoHeight: 3.2 },
    { id: "intake-detail", label: "Detail — transition to the cabin and the air duct beside it", projection: "perspective", position: point(-3.6, 2.6, 3.9), target: point(-0.86, 1.72, 0.9), fov: 32 },
    { id: "tail-detail", label: "Detail — the dip between the tunnels", projection: "perspective", position: point(-3.2, 3.4, -5.6), target: point(0, 1.85, -2.4), fov: 30 },
    { id: "rotor-detail", label: "Detail — inlet lip, ten-blade fan, guard plane and diffuser", projection: "perspective", position: point(-4.3, 2.5, 3.1), target: point(-2.2, 1.05, 2.02), fov: 28 },
    { id: "gear-detail", label: "Detail — nose leg, oleo and pad on the datum", projection: "perspective", position: point(-3.5, 1.1, 5.4), target: point(-1.9, 0.45, 3.0), fov: 30 },
    { id: "canopy-detail", label: "Detail — panes in their frame, seat and binnacle behind", projection: "perspective", position: point(-2.9, 2.3, 5.4), target: point(0, 1.5, 2.5), fov: 30 },
    { id: "canopy-detail-cutaway", label: "Detail, cutaway — the same camera with the glazing hidden", projection: "perspective", position: point(-2.9, 2.3, 5.4), target: point(0, 1.5, 2.5), fov: 30, hiddenGroups: ["canopy-glazing"] },
    { id: "belly", label: "Belly — gun, conformal launchers and four soles", projection: "perspective", position: point(4.4, -0.6, 6.2), target: point(0, 0.6, 0.9), fov: 36 },
    { id: "reference-match", label: "Reference-match camera — concept viewing angle", projection: "perspective", position: point(-6.6, 6.2, 8.4), target: point(0, 1.05, 0), fov: 30 },
    { id: "silhouette-top", label: "Silhouette control — plan", projection: "orthographic", position: point(0, 16, 0), target: point(0, 1.05, 0), up: point(0, 0, 1), orthoHeight: 8.7 },
  ],
};

export const DUCT_HEX_TRANSITION_Z = TRANSITION_Z;
export const DUCT_HEX_HUMP_CROWN_Y = HUMP_CROWN_Y;

export const ductHexacopterCoreParts = parts.filter((part) =>
  structuralGroups.includes(part.group as typeof structuralGroups[number])
  || part.group.startsWith("core-duct-")
  || part.group.startsWith("core-yaw-"));
