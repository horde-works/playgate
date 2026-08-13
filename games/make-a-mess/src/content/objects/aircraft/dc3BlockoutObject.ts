import type {
  ObjectLabModel,
  ObjectLabPart,
  ObjectLabView,
  ObjectMaterialId,
  ObjectPoint,
  ObjectTriangle,
} from "../dutchWindmills/objectModel.ts";
import {
  DC3_HEIGHT_TAIL_DOWN,
  DC3_LENGTH,
  DC3_PROPELLER_DIAMETER,
  DC3_WINGSPAN,
} from "./dc3Dimensions.ts";

type Dc3View = ObjectLabView & { readonly up?: ObjectPoint };
type SurfaceHinge = {
  readonly group: string;
  readonly pivot: ObjectPoint;
  readonly axis: ObjectPoint;
  readonly range: { readonly minDegrees: number; readonly maxDegrees: number };
  readonly restDegrees: number;
};
type Dc3BlockoutModel = Omit<ObjectLabModel, "views"> & {
  readonly captureFrame: readonly [width: number, height: number];
  readonly materialOverrides: Readonly<
    Record<string, Readonly<Record<string, number | boolean>>>
  >;
  readonly surfaceHinges: Readonly<Record<string, SurfaceHinge>>;
  readonly views: readonly Dc3View[];
};

/**
 * Shape-only DC-3 sitting three-point. Published span, length, tail-down
 * height and propeller diameter own the envelope. Station tables, dihedral
 * and nacelle placement are authored from the type, not a manufacturer
 * drawing. The nose follows NASM stills: blunt snout, raked greenhouse,
 * no hanging chin. The fin follows NASM A19530075000: long convex
 * dorsal, rounded tip, nearly vertical trailing edge — one loft, not
 * a trapezoid slab. The core is a skin-on-frame cage inside the
 * lofts: three spars, wing formers, frames, longerons and stringers.
 * Skins stay filled and sit outside the cage. Ailerons, flaps,
 * elevator and rudder are cut from the lofts as hinged leaves.
 * Windows, doors, livery and world placement stay out.
 */

const RING = 20;
const AIRFOIL = 12;
const ROOT_CHORD = 4.42;
const TIP_CHORD = 1.56;
const ROOT_LE = 1.18;
const TIP_LE = 0.22;
const WING_BREAK = 5.2;
const OUTER_DIHEDRAL = (5 * Math.PI) / 180;
const ENGINE_X = 5.79;
const PROP_RADIUS = DC3_PROPELLER_DIAMETER / 2;
const PROP_BLADES = 3;
const PROP_PHASE = (22 * Math.PI) / 180;
const PROP_PITCH = (24 * Math.PI) / 180;
const PROP_HUB_Y = -0.52;
const PROP_HUB_Z = 3.1;
const COWL_OUTER = 0.68;
const COWL_INNER = 0.57;
const COWL_FRONT_Z = 2.72;
const COWL_AFT_Z = 1.2;
const ENGINE_CYLINDERS = 9;
const ENGINE_Z = 1.88;
const NOSE_Z = 7.4;
const TAIL_Z = NOSE_Z - DC3_LENGTH;
const SKIN_INSET = 0.12;
const SPAR_FRONT = 0.18;
const SPAR_MAIN = 0.38;
const SPAR_REAR = 0.7;
const SPAR_WEB = 0.08;
const LONGERON_HALF = 0.028;
const STRINGER_HALF = 0.016;
const WING_JOINT = ENGINE_X + 0.85;
const HINGE_GAP_T = 0.012;
const FLAP_INNER_IN = 1.58;
const FLAP_INNER_OUT = 5;
const FLAP_OUTER_IN = 6.58;
const FLAP_OUTER_OUT = 8.55;
const AILERON_IN = 8.72;
const AILERON_OUT = DC3_WINGSPAN / 2 - 0.52;
const FIN_HINGE_T = 0.6;
const RUDDER_Y0 = 1.25;
const RUDDER_Y1 = 4.55;
const STAB_HINGE_T = 0.72;
const ELEV_IN = 0.42;
const ELEV_OUT = 3.12;
const FLAP_DOWN_DEGREES = -42;
const AILERON_RANGE = 25;
const ELEVATOR_DOWN = -22;
const ELEVATOR_UP = 18;
const RUDDER_RANGE = 25;
const FLOOR_Y = 0.36;
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

type Station = {
  readonly z: number;
  readonly halfWidth: number;
  readonly crown: number;
  readonly keel: number;
  readonly upperPower?: number;
  readonly faceForward?: number;
};

const FUSELAGE_STATIONS: readonly Station[] = [
  { z: NOSE_Z, halfWidth: 0.42, crown: 0.44, keel: -0.48 },
  { z: 7, halfWidth: 0.74, crown: 0.66, keel: -0.7 },
  { z: 6.5, halfWidth: 0.98, crown: 0.72, keel: -0.92, upperPower: 2.8, faceForward: 0.08 },
  { z: 6.15, halfWidth: 1.08, crown: 1.16, keel: -1.06, upperPower: 3.6, faceForward: 0.18 },
  { z: 5.8, halfWidth: 1.14, crown: 1.48, keel: -1.14, upperPower: 3.8, faceForward: 0.1 },
  { z: 5.15, halfWidth: 1.18, crown: 1.44, keel: -1.22, upperPower: 2.2 },
  { z: 4.3, halfWidth: 1.24, crown: 1.4, keel: -1.26 },
  { z: 2.35, halfWidth: 1.37, crown: 1.4, keel: -1.36 },
  { z: 0, halfWidth: 1.37, crown: 1.38, keel: -1.36 },
  { z: -2.85, halfWidth: 1.32, crown: 1.32, keel: -1.3 },
  { z: -6.15, halfWidth: 1.08, crown: 1.12, keel: -1.0 },
  { z: -9.15, halfWidth: 0.68, crown: 0.84, keel: -0.48 },
  { z: -11.35, halfWidth: 0.3, crown: 0.54, keel: -0.16 },
  { z: TAIL_Z, halfWidth: 0.1, crown: 0.4, keel: -0.05 },
];

function sampleStation(z: number): Station {
  if (z >= FUSELAGE_STATIONS[0].z) return FUSELAGE_STATIONS[0];
  const last = FUSELAGE_STATIONS[FUSELAGE_STATIONS.length - 1];
  if (z <= last.z) return last;
  for (let index = 0; index < FUSELAGE_STATIONS.length - 1; index += 1) {
    const a = FUSELAGE_STATIONS[index];
    const b = FUSELAGE_STATIONS[index + 1];
    if (z <= a.z && z >= b.z) {
      const t = (a.z - z) / (a.z - b.z);
      return {
        z,
        halfWidth: a.halfWidth * (1 - t) + b.halfWidth * t,
        crown: a.crown * (1 - t) + b.crown * t,
        keel: a.keel * (1 - t) + b.keel * t,
        upperPower: a.upperPower,
        faceForward: a.faceForward,
      };
    }
  }
  return last;
}

function sampleCrown(z: number): number {
  return sampleStation(z).crown;
}

function wingAt(x: number): {
  readonly chord: number;
  readonly leading: number;
  readonly thickness: number;
  readonly y0: number;
} {
  const spanT = Math.min(1, Math.abs(x) / (DC3_WINGSPAN / 2));
  const chord = ROOT_CHORD * (1 - spanT) + TIP_CHORD * spanT;
  return {
    chord,
    leading: ROOT_LE * (1 - spanT) + TIP_LE * spanT,
    thickness: (0.15 * (1 - spanT) + 0.07 * spanT) * chord,
    y0: -0.12 + Math.max(0, Math.abs(x) - WING_BREAK) * Math.tan(OUTER_DIHEDRAL),
  };
}

const parts: ObjectLabPart[] = [];
const point = (x: number, y: number, z: number): ObjectPoint => [x, y, z];
const add = (a: ObjectPoint, b: ObjectPoint): ObjectPoint => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: ObjectPoint, s: number): ObjectPoint => [a[0] * s, a[1] * s, a[2] * s];
const cross = (a: ObjectPoint, b: ObjectPoint): ObjectPoint => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
function rotateAxis(vector: ObjectPoint, axis: ObjectPoint, angle: number): ObjectPoint {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const aligned = vector[0] * axis[0] + vector[1] * axis[1] + vector[2] * axis[2];
  return add(
    add(scale(vector, cosine), scale(cross(axis, vector), sine)),
    scale(axis, aligned * (1 - cosine)),
  );
}

function bodyToWorld(body: ObjectPoint): ObjectPoint {
  const yR = body[1] - GEAR_BODY_Y;
  const zR = body[2] - GEAR_BODY_Z;
  return [body[0], yR * COS + zR * SIN, zR * COS - yR * SIN];
}

function bodyDirection(dir: ObjectPoint): ObjectPoint {
  const origin = bodyToWorld(point(0, 0, 0));
  const tip = bodyToWorld(dir);
  return [tip[0] - origin[0], tip[1] - origin[1], tip[2] - origin[2]];
}

function addBodyBox(
  id: string,
  group: string,
  material: ObjectMaterialId,
  center: ObjectPoint,
  size: ObjectPoint,
): void {
  const [cx, cy, cz] = center;
  const [sx, sy, sz] = size;
  const hx = sx / 2;
  const hy = sy / 2;
  const hz = sz / 2;
  const corners: ObjectPoint[] = [
    point(cx - hx, cy - hy, cz - hz),
    point(cx + hx, cy - hy, cz - hz),
    point(cx + hx, cy + hy, cz - hz),
    point(cx - hx, cy + hy, cz - hz),
    point(cx - hx, cy - hy, cz + hz),
    point(cx + hx, cy - hy, cz + hz),
    point(cx + hx, cy + hy, cz + hz),
    point(cx - hx, cy + hy, cz + hz),
  ];
  addClosedMesh(id, group, material, corners, [
    [0, 1, 2], [0, 2, 3],
    [4, 6, 5], [4, 7, 6],
    [0, 4, 5], [0, 5, 1],
    [3, 2, 6], [3, 6, 7],
    [0, 3, 7], [0, 7, 4],
    [1, 5, 6], [1, 6, 2],
  ]);
}

function addCylinder(
  id: string,
  group: string,
  material: ObjectMaterialId,
  from: ObjectPoint,
  to: ObjectPoint,
  radius: number,
  radialSegments = 20,
): void {
  parts.push({
    kind: "cylinder",
    id,
    group,
    material,
    from: bodyToWorld(from),
    to: bodyToWorld(to),
    radius,
    radialSegments,
  });
}

function addBeam(
  id: string,
  group: string,
  material: ObjectMaterialId,
  from: ObjectPoint,
  to: ObjectPoint,
  width: number,
  depth: number,
): void {
  parts.push({
    kind: "beam",
    id,
    group,
    material,
    from: bodyToWorld(from),
    to: bodyToWorld(to),
    width,
    depth,
  });
}

function signedVolume(
  vertices: readonly ObjectPoint[],
  triangles: readonly ObjectTriangle[],
): number {
  let volume = 0;
  for (const [a, b, c] of triangles) {
    const [ax, ay, az] = vertices[a];
    const [bx, by, bz] = vertices[b];
    const [cx, cy, cz] = vertices[c];
    volume += ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx);
  }
  return volume / 6;
}

function addClosedMesh(
  id: string,
  group: string,
  material: ObjectMaterialId,
  vertices: readonly ObjectPoint[],
  triangles: readonly ObjectTriangle[],
): void {
  const volume = signedVolume(vertices, triangles);
  const wound = volume < -1e-6
    ? triangles.map(([a, b, c]) => [a, c, b] as ObjectTriangle)
    : triangles;
  parts.push({
    kind: "mesh",
    id,
    group,
    material,
    vertices: vertices.map(bodyToWorld),
    triangles: wound,
    showEdges: true,
  });
}

function loftRings(
  rings: readonly (readonly ObjectPoint[])[],
  caps: { readonly start?: boolean; readonly end?: boolean } = { start: true, end: true },
): {
  vertices: ObjectPoint[];
  triangles: ObjectTriangle[];
} {
  const vertices: ObjectPoint[] = rings.flatMap((ring) => [...ring]);
  const triangles: ObjectTriangle[] = [];
  const count = rings[0].length;
  for (let ring = 0; ring < rings.length - 1; ring += 1) {
    const a = ring * count;
    const b = (ring + 1) * count;
    for (let i = 0; i < count; i += 1) {
      const j = (i + 1) % count;
      triangles.push([a + i, a + j, b + j], [a + i, b + j, b + i]);
    }
  }
  const first = 0;
  const last = (rings.length - 1) * count;
  for (let i = 1; i < count - 1; i += 1) {
    if (caps.start) triangles.push([first, first + i + 1, first + i]);
    if (caps.end) triangles.push([last, last + i, last + i + 1]);
  }
  return { vertices, triangles };
}

function ellipseRing(station: Station): ObjectPoint[] {
  const cy = (station.crown + station.keel) / 2;
  const ry = (station.crown - station.keel) / 2;
  const power = station.upperPower ?? 2;
  return Array.from({ length: RING }, (_, index) => {
    const angle = (index / RING) * Math.PI * 2;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    const yUnit = sine >= 0 ? Math.pow(sine, 2 / power) : sine;
    const face = (station.faceForward ?? 0) * Math.max(0, cosine) * Math.max(0, sine);
    return point(
      station.halfWidth * cosine,
      cy + ry * yUnit,
      station.z + face,
    );
  });
}

const fuselage = loftRings(FUSELAGE_STATIONS.map(ellipseRing));
addClosedMesh("fuselage-loft", "fuselage", "paint-light", fuselage.vertices, fuselage.triangles);

function airfoilBand(x: number, t0: number, t1: number): ObjectPoint[] {
  const { chord, leading, thickness, y0 } = wingAt(x);
  const half = AIRFOIL / 2;
  return Array.from({ length: AIRFOIL }, (_, index) => {
    const upper = index <= half;
    const s = upper ? index / half : (AIRFOIL - index) / half;
    const t = t0 + s * (t1 - t0);
    const z = leading - t * chord;
    const bump = Math.sin(Math.PI * t) * thickness * 0.5;
    const y = y0 + (upper ? bump : -bump * 0.82);
    return point(x, y, z);
  });
}

function inFlapBay(x: number): boolean {
  const span = Math.abs(x);
  return (span >= FLAP_INNER_IN && span <= FLAP_INNER_OUT)
    || (span >= FLAP_OUTER_IN && span <= FLAP_OUTER_OUT);
}

function inAileronBay(x: number): boolean {
  const span = Math.abs(x);
  return span >= AILERON_IN && span <= AILERON_OUT;
}

function wingSkinEndT(x: number): number {
  return inFlapBay(x) || inAileronBay(x) ? SPAR_REAR - HINGE_GAP_T : 1;
}

function uniqueStations(values: readonly number[]): number[] {
  return [...new Set(values.map((value) => Math.round(value * 1000) / 1000))]
    .sort((a, b) => a - b);
}

function addWing(id: string, sign: 1 | -1): void {
  const stations = uniqueStations([
    0,
    1.4,
    FLAP_INNER_IN - 0.04,
    FLAP_INNER_IN,
    2.8,
    4.2,
    FLAP_INNER_OUT,
    FLAP_INNER_OUT + 0.04,
    ENGINE_X,
    FLAP_OUTER_IN - 0.04,
    FLAP_OUTER_IN,
    WING_JOINT,
    7.4,
    FLAP_OUTER_OUT,
    FLAP_OUTER_OUT + 0.04,
    AILERON_IN,
    10.2,
    12.6,
    AILERON_OUT,
    AILERON_OUT + 0.04,
    DC3_WINGSPAN / 2,
  ]).map((x) => airfoilBand(sign * x, 0, wingSkinEndT(sign * x)));
  const lofted = loftRings(stations);
  addClosedMesh(id, "wing", "paint-light", lofted.vertices, lofted.triangles);
}

addWing("wing-right", 1);
addWing("wing-left", -1);

function addSurface(
  id: string,
  group: string,
  xs: readonly number[],
  band: (x: number) => ObjectPoint[],
): void {
  const lofted = loftRings(xs.map(band));
  addClosedMesh(id, group, "paint-light", lofted.vertices, lofted.triangles);
}

for (const sign of [1, -1] as const) {
  const side = sign > 0 ? "right" : "left";
  const surface = (x: number) => airfoilBand(x, SPAR_REAR + HINGE_GAP_T, 1);
  addSurface(
    `flap-${side}-inner`,
    `flap-${side}-inner`,
    [FLAP_INNER_IN, 2.8, 4.2, FLAP_INNER_OUT].map((x) => sign * x),
    surface,
  );
  addSurface(
    `flap-${side}-outer`,
    `flap-${side}-outer`,
    [FLAP_OUTER_IN, 7.4, FLAP_OUTER_OUT].map((x) => sign * x),
    surface,
  );
  addSurface(
    `aileron-${side}`,
    `aileron-${side}`,
    [AILERON_IN, 10.2, 12.6, AILERON_OUT].map((x) => sign * x),
    surface,
  );
}

function circleRing(cx: number, cy: number, z: number, radius: number, count: number): ObjectPoint[] {
  return Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2;
    return point(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius, z);
  });
}

function addNacelle(side: "left" | "right", sign: 1 | -1): void {
  const group = `nacelle-${side}`;
  const engine = `engine-${side}`;
  const x = sign * ENGINE_X;
  const cowlSeg = 24;
  const body = loftRings([
    circleRing(x, PROP_HUB_Y, COWL_FRONT_Z, 0.71, cowlSeg),
    circleRing(x, PROP_HUB_Y, 1.95, COWL_OUTER, cowlSeg),
    circleRing(x, PROP_HUB_Y, COWL_AFT_Z, COWL_OUTER, cowlSeg),
    circleRing(x, PROP_HUB_Y, 0.35, 0.66, cowlSeg),
    circleRing(x, PROP_HUB_Y, -0.7, 0.58, cowlSeg),
    circleRing(x, PROP_HUB_Y, -1.9, 0.4, cowlSeg),
    circleRing(x, PROP_HUB_Y, -3.2, 0.16, cowlSeg),
  ], { start: false, end: true });
  addClosedMesh(`${group}-body`, group, "metal", body.vertices, body.triangles);
  const inner = loftRings([
    circleRing(x, PROP_HUB_Y, COWL_FRONT_Z, COWL_INNER, cowlSeg).reverse(),
    circleRing(x, PROP_HUB_Y, 1.95, COWL_INNER, cowlSeg).reverse(),
    circleRing(x, PROP_HUB_Y, COWL_AFT_Z, COWL_INNER, cowlSeg).reverse(),
  ], { start: false, end: false });
  addClosedMesh(`${group}-cowl-inner`, group, "metal", inner.vertices, inner.triangles);
  const lip = loftRings([
    circleRing(x, PROP_HUB_Y, COWL_FRONT_Z, 0.71, cowlSeg),
    circleRing(x, PROP_HUB_Y, COWL_FRONT_Z, COWL_INNER, cowlSeg),
  ], { start: false, end: false });
  addClosedMesh(`${group}-cowl-lip`, group, "metal", lip.vertices, lip.triangles);
  const firewall = loftRings([
    circleRing(x, PROP_HUB_Y, COWL_AFT_Z, COWL_INNER, 16),
    circleRing(x, PROP_HUB_Y, COWL_AFT_Z - 0.04, COWL_INNER, 16),
  ]);
  addClosedMesh(`${group}-firewall`, group, "metal", firewall.vertices, firewall.triangles);
  addCylinder(`${group}-spinner`, group, "paint-light", point(x, PROP_HUB_Y, 2.92), point(x, PROP_HUB_Y, 2.56), 0.32, 16);
  addCylinder(
    `${engine}-crankcase`,
    engine,
    "metal",
    point(x, PROP_HUB_Y, 2.48),
    point(x, PROP_HUB_Y, 1.34),
    0.26,
    16,
  );
  addCylinder(
    `${engine}-nose`,
    engine,
    "metal",
    point(x, PROP_HUB_Y, 2.56),
    point(x, PROP_HUB_Y, 2.46),
    0.18,
    12,
  );
  for (let cylinder = 0; cylinder < ENGINE_CYLINDERS; cylinder += 1) {
    const angle = (cylinder / ENGINE_CYLINDERS) * Math.PI * 2;
    const radial = point(Math.cos(angle), Math.sin(angle), 0);
    addCylinder(
      `${engine}-cylinder-${cylinder}`,
      engine,
      "metal",
      add(point(x, PROP_HUB_Y, ENGINE_Z), scale(radial, 0.26)),
      add(point(x, PROP_HUB_Y, ENGINE_Z), scale(radial, 0.5)),
      0.105,
      10,
    );
  }
  const hub = point(x, PROP_HUB_Y, PROP_HUB_Z);
  const axis = point(0, 0, 1);
  for (let blade = 0; blade < PROP_BLADES; blade += 1) {
    const theta = PROP_PHASE + (blade * 2 * Math.PI) / PROP_BLADES;
    const span = point(Math.sin(theta), Math.cos(theta), 0);
    const chord = rotateAxis(cross(span, axis), span, PROP_PITCH);
    const thick = cross(span, chord);
    const stations = [
      { radius: 0.34, chord: 0.2, thick: 0.055 },
      { radius: 1.12, chord: 0.34, thick: 0.046 },
      { radius: PROP_RADIUS, chord: 0.16, thick: 0.022 },
    ].map(({ radius, chord: width, thick: depth }) => {
      const centre = add(hub, scale(span, radius));
      return [
        add(add(centre, scale(chord, width / 2)), scale(thick, depth / 2)),
        add(add(centre, scale(chord, width / 2)), scale(thick, -depth / 2)),
        add(add(centre, scale(chord, -width / 2)), scale(thick, -depth / 2)),
        add(add(centre, scale(chord, -width / 2)), scale(thick, depth / 2)),
      ];
    });
    const lofted = loftRings(stations);
    addClosedMesh(
      `propeller-${side}-blade-${blade}`,
      `propeller-${side}`,
      "metal",
      lofted.vertices,
      lofted.triangles,
    );
  }
  addCylinder(
    `gear-${side}-strut`,
    "gear",
    "metal",
    point(x, -1.15, 0.22),
    point(x, -2.15, 0.2),
    0.08,
    10,
  );
  addCylinder(
    `gear-${side}-wheel`,
    "gear",
    "timber-dark",
    point(x - 0.12, -2.15, 0.2),
    point(x + 0.12, -2.15, 0.2),
    0.55,
    18,
  );
}

addNacelle("left", -1);
addNacelle("right", 1);

addCylinder(
  "gear-tail-strut",
  "gear",
  "metal",
  point(0, -0.2, -10.95),
  point(0, -0.36, -11.05),
  0.045,
  8,
);
addCylinder(
  "gear-tail-wheel",
  "gear",
  "timber-dark",
  point(-0.06, -0.36, -11.05),
  point(0.06, -0.36, -11.05),
  0.16,
  12,
);

function stabSection(x: number): {
  readonly chord: number;
  readonly leading: number;
  readonly y0: number;
  readonly thick: number;
} {
  const t = Math.abs(x) / 3.25;
  const chord = 1.82 * (1 - t) + 1.02 * t;
  return {
    chord,
    leading: -10.15 - t * 0.35,
    y0: 0.4,
    thick: 0.12 * chord,
  };
}

function stabBand(x: number, t0: number, t1: number): ObjectPoint[] {
  const { chord, leading, y0, thick } = stabSection(x);
  return Array.from({ length: 8 }, (_, index) => {
    const upper = index <= 4;
    const s = upper ? index / 4 : (8 - index) / 4;
    const t = t0 + s * (t1 - t0);
    const bump = Math.sin(Math.PI * t) * thick * 0.5;
    return point(x, y0 + (upper ? bump : -bump), leading - t * chord);
  });
}

function inElevatorBay(x: number): boolean {
  const span = Math.abs(x);
  return span >= ELEV_IN && span <= ELEV_OUT;
}

const stabStations = uniqueStations([
  -3.25,
  -(ELEV_OUT + 0.04),
  -ELEV_OUT,
  -2.1,
  -0.9,
  -ELEV_IN,
  -(ELEV_IN - 0.04),
  0,
  ELEV_IN - 0.04,
  ELEV_IN,
  0.9,
  2.1,
  ELEV_OUT,
  ELEV_OUT + 0.04,
  3.25,
]).map((x) => stabBand(x, 0, inElevatorBay(x) ? STAB_HINGE_T - HINGE_GAP_T : 1));
const stabilizer = loftRings(stabStations);
addClosedMesh("horizontal-stabilizer", "empennage", "paint-light", stabilizer.vertices, stabilizer.triangles);

for (const sign of [1, -1] as const) {
  const side = sign > 0 ? "right" : "left";
  addSurface(
    `elevator-${side}`,
    `elevator-${side}`,
    [ELEV_IN, 0.9, 2.1, ELEV_OUT].map((x) => sign * x),
    (x) => stabBand(x, STAB_HINGE_T + HINGE_GAP_T, 1),
  );
}

type FinStation = {
  readonly y: number | "crown";
  readonly leadZ: number;
  readonly trailZ: number;
  readonly half: number;
};

const FIN_STATIONS: readonly FinStation[] = [
  { y: "crown", leadZ: -8.25, trailZ: -12.16, half: 0.12 },
  { y: 1.05, leadZ: -8.7, trailZ: -12.16, half: 0.115 },
  { y: 1.25, leadZ: -9.15, trailZ: -12.155, half: 0.108 },
  { y: 1.55, leadZ: -9.6, trailZ: -12.15, half: 0.1 },
  { y: 1.95, leadZ: -10, trailZ: -12.145, half: 0.09 },
  { y: 2.4, leadZ: -10.35, trailZ: -12.14, half: 0.08 },
  { y: 2.9, leadZ: -10.65, trailZ: -12.13, half: 0.07 },
  { y: 3.4, leadZ: -10.92, trailZ: -12.12, half: 0.058 },
  { y: 3.85, leadZ: -11.15, trailZ: -12.1, half: 0.048 },
  { y: 4.25, leadZ: -11.35, trailZ: -12.06, half: 0.038 },
  { y: 4.55, leadZ: -11.52, trailZ: -11.96, half: 0.026 },
  { y: 4.75, leadZ: -11.66, trailZ: -11.88, half: 0.016 },
  { y: 4.85, leadZ: -11.76, trailZ: -11.8, half: 0.008 },
];

function finHeight(station: FinStation, z: number): number {
  return station.y === "crown" ? sampleCrown(z) : station.y;
}

function inRudderBay(station: FinStation): boolean {
  if (station.y === "crown") return false;
  return station.y >= RUDDER_Y0 && station.y <= RUDDER_Y1;
}

function finBand(station: FinStation, t0: number, t1: number): ObjectPoint[] {
  const steps = 10;
  const ring: ObjectPoint[] = [];
  for (let index = 0; index <= steps; index += 1) {
    const t = t0 + (index / steps) * (t1 - t0);
    const z = station.leadZ - t * (station.leadZ - station.trailZ);
    const thick = station.half * Math.sin(Math.PI * t);
    ring.push(point(-thick, finHeight(station, z), z));
  }
  for (let index = steps - 1; index >= 1; index -= 1) {
    const t = t0 + (index / steps) * (t1 - t0);
    const z = station.leadZ - t * (station.leadZ - station.trailZ);
    const thick = station.half * Math.sin(Math.PI * t);
    ring.push(point(thick, finHeight(station, z), z));
  }
  return ring;
}

const fin = loftRings(FIN_STATIONS.map((station) => (
  finBand(station, 0, inRudderBay(station) ? FIN_HINGE_T - HINGE_GAP_T : 1)
)));
addClosedMesh("vertical-fin", "empennage", "paint-light", fin.vertices, fin.triangles);

const rudderStations = FIN_STATIONS.filter(inRudderBay);
const rudder = loftRings(rudderStations.map((station) => (
  finBand(station, FIN_HINGE_T + HINGE_GAP_T, 1)
)));
addClosedMesh("rudder", "rudder", "paint-light", rudder.vertices, rudder.triangles);

const WING_SPAR_XS = [-DC3_WINGSPAN / 2 + 0.55, -12.6, -10.2, -7.4, -WING_JOINT, -ENGINE_X, -4.2, -2.8, -1.4, 0, 1.4, 2.8, 4.2, ENGINE_X, WING_JOINT, 7.4, 10.2, 12.6, DC3_WINGSPAN / 2 - 0.55];

function wingSkinInset(thickness: number): number {
  return Math.min(SKIN_INSET, thickness * 0.22);
}

function sparRing(x: number, chordT: number): ObjectPoint[] {
  const { chord, leading, thickness, y0 } = wingAt(x);
  const inset = wingSkinInset(thickness);
  const z = leading - chordT * chord;
  const up = Math.max(0.025, thickness * 0.5 - inset);
  const down = Math.max(0.02, thickness * 0.41 - inset);
  const half = Math.min(SPAR_WEB / 2, Math.max(0.018, thickness * 0.14));
  return [
    point(x, y0 + up, z + half),
    point(x, y0 + up, z - half),
    point(x, y0 - down, z - half),
    point(x, y0 - down, z + half),
  ];
}

for (const [id, chordT] of [["front", SPAR_FRONT], ["main", SPAR_MAIN], ["rear", SPAR_REAR]] as const) {
  const lofted = loftRings(WING_SPAR_XS.map((x) => sparRing(x, chordT)));
  addClosedMesh(`wing-spar-${id}`, "structure-wing", "metal", lofted.vertices, lofted.triangles);
}

function formerBand(x: number, t0: number, t1: number): ObjectPoint[] {
  const { chord, leading, thickness, y0 } = wingAt(x);
  const inset = wingSkinInset(thickness);
  const insetChord = Math.max(0.35, chord - inset * 2);
  const insetLead = leading - inset;
  const insetThick = Math.max(0.06, thickness - inset * 2);
  const half = AIRFOIL / 2;
  return Array.from({ length: AIRFOIL }, (_, index) => {
    const upper = index <= half;
    const s = upper ? index / half : (AIRFOIL - index) / half;
    const t = t0 + s * (t1 - t0);
    const z = insetLead - t * insetChord;
    const bump = Math.sin(Math.PI * t) * insetThick * 0.5;
    return point(x, y0 + (upper ? bump : -bump * 0.82), z);
  });
}

for (const x of [0, 1.4, 2.8, 4.2, ENGINE_X, WING_JOINT, 7.4, 9.2, 10.8, 12.4]) {
  const xs = x === 0 ? [0] : [-x, x];
  for (const station of xs) {
    const endT = wingSkinEndT(station);
    const lofted = loftRings([
      formerBand(station - 0.022, 0, endT),
      formerBand(station + 0.022, 0, endT),
    ]);
    const tag = station === 0 ? "0" : `${station < 0 ? "l" : "r"}-${Math.abs(station).toFixed(1)}`;
    addClosedMesh(`wing-former-${tag}`, "structure-wing", "metal", lofted.vertices, lofted.triangles);
  }
}

function insetStation(station: Station, inset: number): Station {
  return {
    ...station,
    halfWidth: Math.max(0.06, station.halfWidth - inset),
    crown: station.crown - inset,
    keel: station.keel + inset,
  };
}

function railPoint(station: Station, angle: number): ObjectPoint {
  const inner = insetStation(station, SKIN_INSET);
  const cy = (inner.crown + inner.keel) / 2;
  const ry = (inner.crown - inner.keel) / 2;
  const power = inner.upperPower ?? 2;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const yUnit = sine >= 0 ? Math.pow(sine, 2 / power) : sine;
  return point(inner.halfWidth * cosine, cy + ry * yUnit, station.z);
}

function railSection(station: Station, angle: number, half: number): ObjectPoint[] {
  const [x, y, z] = railPoint(station, angle);
  return [
    point(x - half, y - half, z),
    point(x + half, y - half, z),
    point(x + half, y + half, z),
    point(x - half, y + half, z),
  ];
}

for (const station of FUSELAGE_STATIONS.slice(1, -1)) {
  const inner = insetStation(station, SKIN_INSET);
  const lofted = loftRings([
    ellipseRing({ ...inner, z: station.z + 0.022 }),
    ellipseRing({ ...inner, z: station.z - 0.022 }),
  ]);
  addClosedMesh(`fuselage-frame-z${station.z}`, "structure-fuselage", "metal", lofted.vertices, lofted.triangles);
}

const RAIL_STATIONS = FUSELAGE_STATIONS.slice(2, -1);
const LONGERON_RAILS = [
  ["upper-right", (50 * Math.PI) / 180],
  ["upper-left", (130 * Math.PI) / 180],
  ["lower-left", (230 * Math.PI) / 180],
  ["lower-right", (310 * Math.PI) / 180],
] as const;
for (const [id, angle] of LONGERON_RAILS) {
  const lofted = loftRings(RAIL_STATIONS.map((station) => railSection(station, angle, LONGERON_HALF)));
  addClosedMesh(`longeron-${id}`, "structure-fuselage", "metal", lofted.vertices, lofted.triangles);
}

const STRINGER_ANGLES = [0, 30, 90, 150, 180, 210, 270, 330].map((deg) => (deg * Math.PI) / 180);
STRINGER_ANGLES.forEach((angle, index) => {
  const lofted = loftRings(RAIL_STATIONS.map((station) => railSection(station, angle, STRINGER_HALF)));
  addClosedMesh(`stringer-${index}`, "structure-fuselage", "metal", lofted.vertices, lofted.triangles);
});

const floorHalf = 1.02;
addClosedMesh("cabin-floor", "structure-fuselage", "metal", [
  point(-floorHalf, FLOOR_Y, 3.8),
  point(floorHalf, FLOOR_Y, 3.8),
  point(floorHalf, FLOOR_Y, -2.4),
  point(-floorHalf, FLOOR_Y, -2.4),
  point(-floorHalf, FLOOR_Y - 0.04, 3.8),
  point(floorHalf, FLOOR_Y - 0.04, 3.8),
  point(floorHalf, FLOOR_Y - 0.04, -2.4),
  point(-floorHalf, FLOOR_Y - 0.04, -2.4),
], [
  [0, 1, 2], [0, 2, 3],
  [4, 6, 5], [4, 7, 6],
  [0, 4, 5], [0, 5, 1],
  [3, 2, 6], [3, 6, 7],
  [0, 3, 7], [0, 7, 4],
  [1, 5, 6], [1, 6, 2],
]);
for (const [index, z] of [3.1, 1.1, -0.6, -2.1].entries()) {
  addBeam(`floor-beam-${index}`, "structure-fuselage", "metal", point(-floorHalf, FLOOR_Y - 0.03, z), point(floorHalf, FLOOR_Y - 0.03, z), 0.07, 0.05);
}

function addEngineMount(side: "left" | "right", sign: 1 | -1): void {
  const group = "structure-mount";
  const x = sign * ENGINE_X;
  const { y0, leading, chord } = wingAt(x);
  const sparZ = leading - SPAR_FRONT * chord;
  const hub = point(x, PROP_HUB_Y, ENGINE_Z);
  const firewall = loftRings([
    circleRing(x, PROP_HUB_Y, COWL_AFT_Z, COWL_INNER - 0.02, 14),
    circleRing(x, PROP_HUB_Y, COWL_AFT_Z - 0.05, COWL_INNER - 0.02, 14),
  ]);
  addClosedMesh(`mount-${side}-firewall`, group, "metal", firewall.vertices, firewall.triangles);
  const stays: readonly ObjectPoint[] = [
    point(x + sign * 0.38, PROP_HUB_Y + 0.28, COWL_AFT_Z),
    point(x + sign * 0.38, PROP_HUB_Y - 0.28, COWL_AFT_Z),
    point(x - sign * 0.22, PROP_HUB_Y + 0.32, COWL_AFT_Z),
    point(x - sign * 0.22, PROP_HUB_Y - 0.32, COWL_AFT_Z),
  ];
  stays.forEach((from, index) => {
    addCylinder(`mount-${side}-stay-${index}`, group, "metal", from, hub, 0.028, 8);
  });
  addCylinder(
    `mount-${side}-backstay`,
    group,
    "metal",
    point(x, PROP_HUB_Y - 0.3, COWL_AFT_Z),
    point(x, y0, sparZ),
    0.032,
    8,
  );
  addCylinder(
    `mount-${side}-trunnion`,
    group,
    "metal",
    point(x, y0, sparZ),
    point(x, -1.15, 0.22),
    0.04,
    8,
  );
}

addEngineMount("left", -1);
addEngineMount("right", 1);

function finSparRing(station: FinStation, which: "front" | "rear"): ObjectPoint[] {
  const chord = station.leadZ - station.trailZ;
  const t = which === "front" ? 0.28 : 0.72;
  const z = station.leadZ - t * chord;
  const y = station.y === "crown" ? sampleCrown(z) : station.y;
  const local = Math.max(0.01, station.half * Math.sin(Math.PI * t) - 0.02);
  const back = 0.04;
  return [
    point(-local, y, z + back),
    point(local, y, z + back),
    point(local, y, z - back),
    point(-local, y, z - back),
  ];
}

const finSparFront = loftRings(FIN_STATIONS.map((station) => finSparRing(station, "front")));
const finSparRear = loftRings(FIN_STATIONS.map((station) => finSparRing(station, "rear")));
addClosedMesh("fin-spar-front", "structure-empennage", "metal", finSparFront.vertices, finSparFront.triangles);
addClosedMesh("fin-spar-rear", "structure-empennage", "metal", finSparRear.vertices, finSparRear.triangles);

function stabSparRing(x: number, chordT: number): ObjectPoint[] {
  const t = Math.abs(x) / 3.25;
  const chord = 1.82 * (1 - t) + 1.02 * t;
  const leading = -10.15 - t * 0.35;
  const thick = 0.12 * chord;
  const z = leading - chordT * chord;
  const half = 0.022;
  const up = Math.max(0.018, thick * 0.35);
  return [
    point(x, 0.4 + up, z + half),
    point(x, 0.4 + up, z - half),
    point(x, 0.4 - up, z - half),
    point(x, 0.4 - up, z + half),
  ];
}

const STAB_XS = [-3.1, -2.1, -0.9, 0, 0.9, 2.1, 3.1];
for (const [id, chordT] of [["front", 0.22], ["rear", 0.72]] as const) {
  const lofted = loftRings(STAB_XS.map((x) => stabSparRing(x, chordT)));
  addClosedMesh(`stab-spar-${id}`, "structure-empennage", "metal", lofted.vertices, lofted.triangles);
}

const nose = bodyToWorld(point(0, 0.05, NOSE_Z));
const tail = bodyToWorld(point(0, 0.18, TAIL_Z));
const leftTip = bodyToWorld(point(-DC3_WINGSPAN / 2, -0.12 + (DC3_WINGSPAN / 2 - WING_BREAK) * Math.tan(OUTER_DIHEDRAL), TIP_LE - TIP_CHORD * 0.45));
const rightTip = bodyToWorld(point(DC3_WINGSPAN / 2, -0.12 + (DC3_WINGSPAN / 2 - WING_BREAK) * Math.tan(OUTER_DIHEDRAL), TIP_LE - TIP_CHORD * 0.45));
function wingHingePivot(x: number): ObjectPoint {
  const { chord, leading, y0 } = wingAt(x);
  return point(x, y0, leading - SPAR_REAR * chord);
}

function stabHingePivot(x: number): ObjectPoint {
  const { chord, leading, y0 } = stabSection(x);
  return point(x, y0, leading - STAB_HINGE_T * chord);
}

const spanAxis = bodyDirection(point(1, 0, 0));
const surfaceHinges: Record<string, SurfaceHinge> = {};

function addHinge(
  id: string,
  group: string,
  pivot: ObjectPoint,
  axis: ObjectPoint,
  minDegrees: number,
  maxDegrees: number,
): void {
  surfaceHinges[id] = {
    group,
    pivot: bodyToWorld(pivot),
    axis,
    range: { minDegrees, maxDegrees },
    restDegrees: 0,
  };
}

for (const sign of [1, -1] as const) {
  const side = sign > 0 ? "right" : "left";
  addHinge(
    `flap-${side}-inner`,
    `flap-${side}-inner`,
    wingHingePivot(sign * (FLAP_INNER_IN + FLAP_INNER_OUT) / 2),
    spanAxis,
    FLAP_DOWN_DEGREES,
    0,
  );
  addHinge(
    `flap-${side}-outer`,
    `flap-${side}-outer`,
    wingHingePivot(sign * (FLAP_OUTER_IN + FLAP_OUTER_OUT) / 2),
    spanAxis,
    FLAP_DOWN_DEGREES,
    0,
  );
  addHinge(
    `aileron-${side}`,
    `aileron-${side}`,
    wingHingePivot(sign * (AILERON_IN + AILERON_OUT) / 2),
    spanAxis,
    -AILERON_RANGE,
    AILERON_RANGE,
  );
  addHinge(
    `elevator-${side}`,
    `elevator-${side}`,
    stabHingePivot(sign * (ELEV_IN + ELEV_OUT) / 2),
    spanAxis,
    ELEVATOR_DOWN,
    ELEVATOR_UP,
  );
}

addHinge(
  "rudder",
  "rudder",
  point(0, (RUDDER_Y0 + RUDDER_Y1) / 2, -10.65 - FIN_HINGE_T * 1.48),
  bodyDirection(point(0, 1, 0)),
  -RUDDER_RANGE,
  RUDDER_RANGE,
);

const flapDownArticulation = Object.fromEntries(
  Object.entries(surfaceHinges)
    .filter(([id]) => id.startsWith("flap-"))
    .map(([id, hinge]) => [id, hinge.range.minDegrees]),
);

const finTip = bodyToWorld(point(0, 4.85, -11.79));
const viewTarget = point(0, 2.15, -1.2);
const bodyUp = point(0, COS, -SIN);
const bodyForward = point(0, SIN, COS);
const planHeight = 48;
const planCamera = point(
  viewTarget[0] + bodyUp[0] * planHeight,
  viewTarget[1] + bodyUp[1] * planHeight,
  viewTarget[2] + bodyUp[2] * planHeight,
);

const views: readonly Dc3View[] = [
  {
    id: "front",
    label: "Front +Z · span, dihedral, three-blade props",
    projection: "orthographic",
    position: point(0, 2.4, 44),
    target: viewTarget,
    orthoHeight: 16,
  },
  {
    id: "right-profile",
    label: "Right +X · three-point sit and loft",
    projection: "orthographic",
    position: point(44, 2.4, -2),
    target: viewTarget,
    orthoHeight: 14,
  },
  {
    id: "right-profile-cutaway",
    label: "Cutaway · right profile, skins hidden",
    projection: "orthographic",
    position: point(44, 2.4, -2),
    target: viewTarget,
    orthoHeight: 14,
    hiddenGroups: ["fuselage", "wing", "nacelle-left", "nacelle-right", "empennage"],
  },
  {
    id: "right-profile-flaps-down",
    label: "Right +X · flaps down",
    projection: "orthographic",
    position: point(44, 2.4, -2),
    target: viewTarget,
    orthoHeight: 14,
    articulation: flapDownArticulation,
  },
  {
    id: "left-profile",
    label: "Left −X · greenhouse and door side",
    projection: "orthographic",
    position: point(-44, 2.4, -2),
    target: viewTarget,
    orthoHeight: 14,
  },
  {
    id: "rear",
    label: "Rear −Z · fin and stabilizer",
    projection: "orthographic",
    position: point(0, 2.4, -48),
    target: viewTarget,
    orthoHeight: 16,
  },
  {
    id: "top",
    label: "World top · sit-foreshortened plan",
    projection: "orthographic",
    position: point(0, 52, -2),
    target: point(0, 0, -2),
    up: point(0, 0, 1),
    orthoHeight: 34,
  },
  {
    id: "plan",
    label: "Body plan · true wing planform",
    projection: "orthographic",
    position: planCamera,
    target: viewTarget,
    up: bodyForward,
    orthoHeight: 34,
  },
  {
    id: "three-quarter-left",
    label: "3/4 left · nacelle and greenhouse",
    projection: "perspective",
    position: point(-28, 12, 24),
    target: viewTarget,
    fov: 32,
  },
  {
    id: "three-quarter-right",
    label: "3/4 right · wing taper and sit",
    projection: "perspective",
    position: point(30, 11, 22),
    target: viewTarget,
    fov: 32,
  },
  {
    id: "high-three-quarter",
    label: "High 3/4 · planform and twin engines",
    projection: "perspective",
    position: point(24, 22, 26),
    target: viewTarget,
    fov: 34,
  },
  {
    id: "high-three-quarter-flaps-down",
    label: "High 3/4 · flaps down",
    projection: "perspective",
    position: point(24, 22, 26),
    target: viewTarget,
    fov: 34,
    articulation: flapDownArticulation,
  },
  {
    id: "high-three-quarter-cutaway",
    label: "Cutaway · high 3/4, skins hidden",
    projection: "perspective",
    position: point(24, 22, 26),
    target: viewTarget,
    fov: 34,
    hiddenGroups: ["fuselage", "wing", "nacelle-left", "nacelle-right", "empennage"],
  },
  {
    id: "core-detail",
    label: "Joint · wing box through the belly",
    projection: "perspective",
    position: point(9.4, 1.05, 6.2),
    target: bodyToWorld(point(0, -0.05, 0.1)),
    fov: 32,
  },
  {
    id: "core-detail-cutaway",
    label: "Cutaway · three spars and frames at the carry-through",
    projection: "perspective",
    position: point(9.4, 1.05, 6.2),
    target: bodyToWorld(point(0, -0.05, 0.1)),
    fov: 32,
    hiddenGroups: ["fuselage", "wing", "nacelle-left", "nacelle-right", "empennage"],
  },
  {
    id: "nacelle-detail",
    label: "Joint · teardrop nacelle, open cowl and wing",
    projection: "perspective",
    position: point(12.4, 1.15, 4.8),
    target: bodyToWorld(point(ENGINE_X, PROP_HUB_Y, 0.2)),
    fov: 32,
  },
  {
    id: "flap-detail",
    label: "Joint · inner flap cut on the rear spar",
    projection: "perspective",
    position: point(8.8, 1.35, 5.4),
    target: bodyToWorld(point(3.3, -0.12, -2.1)),
    fov: 30,
  },
  {
    id: "flap-detail-flaps-down",
    label: "Joint · inner flap down",
    projection: "perspective",
    position: point(8.8, 1.35, 5.4),
    target: bodyToWorld(point(3.3, -0.12, -2.1)),
    fov: 30,
    articulation: flapDownArticulation,
  },
  {
    id: "tail-detail",
    label: "Joint · dorsal fillet, rudder cut and vertical TE",
    projection: "perspective",
    position: point(8.2, 3.4, -6.4),
    target: bodyToWorld(point(0, 2.6, -11.2)),
    fov: 32,
  },
  {
    id: "nose-detail",
    label: "Joint · blunt snout and raked greenhouse",
    projection: "perspective",
    position: point(5.8, 2.15, 12.6),
    target: bodyToWorld(point(0, 0.35, 6.15)),
    fov: 30,
  },
  {
    id: "silhouette",
    label: "Silhouette · type mass",
    projection: "orthographic",
    position: point(-26, 10, 22),
    target: viewTarget,
    orthoHeight: 18,
  },
];

export const dc3BlockoutObject: Dc3BlockoutModel = {
  id: "douglas-dc3-blockout",
  revision: "b01-2026-08-13-surfaces",
  title: "Douglas DC-3 — B01 engineering prototype",
  units: "metres",
  coordinates: { up: "+Y", front: "+Z", origin: "ground-centre" },
  captureFrame: [1600, 1000],
  materialOverrides: {
    "paint-light": { color: 0xb7b8b2, roughness: 0.42, metalness: 0.22 },
    metal: { color: 0x5c6164, roughness: 0.38, metalness: 0.45 },
    "timber-dark": { color: 0x2a2c2d, roughness: 0.92 },
  },
  sourceNotes: [
    "Published type envelope: 95 ft span, 64 ft 6 in length, 16 ft 11 in tail-down height, 11 ft 6 in propeller, 987 sq ft wing.",
    "NASM A19530075000 owns the museum airframe identity; its 4.14 m move-contractor width is not used as fuselage diameter.",
    "Station tables, 5° outer dihedral and 19 ft engine half-span are authored. This is a three-point sit, not a level drawing.",
    "Each propeller is three Hamilton Standard paddle blades at the published 11 ft 6 in diameter; rotation is frozen.",
    "Nacelle is one metal teardrop the same diameter as the cowl, open at the lip around a Wright R-1820, then tapering through the wing to the trailing edge. Not a box behind a cylinder.",
    "Forward stations follow NASM A19530075000: flat snout face, a raked deck under the greenhouse, keel rising without a hanging chin. The rounded cap is off for now. Glass panes stay out.",
    "Vertical fin follows NASM2018-10067 and NASM2025-02160: one loft from the crown, long convex dorsal, rounded tip, nearly vertical trailing edge. Not a four-point slab. Rudder is cut from that loft as a hinged leaf. Frozen fin outline in docs/dc-3/blockout-b01-freeze-fin/.",
    "Skin-on-frame like the other air vehicles: the cage is inset from the loft (12 cm on the fuselage, a fraction of local thickness on the wing). Frames, four longerons and eight stringers carry the fuselage skin; three spars and wing formers carry the wing skin. Wright mounts and gear trunnions pick up the front spar. Tanks and cabin fit-out stay out.",
    "Ailerons, split flaps, elevator and rudder are real openings on the rear-spar / fin-hinge line, not painted seams. Flaps skip the nacelle afterbody. Hinges live on surfaceHinges; flaps-down is a posed second state of the same parts.",
  ],
  dimensions: {
    wingspan: DC3_WINGSPAN,
    length: DC3_LENGTH,
    heightTailDown: DC3_HEIGHT_TAIL_DOWN,
    propellerDiameter: DC3_PROPELLER_DIAMETER,
    propellerBladeCount: PROP_BLADES,
    engineHalfSpan: ENGINE_X,
    engineCylinders: ENGINE_CYLINDERS,
    cowlInnerRadius: COWL_INNER,
    threePointPitchDegrees: (PITCH * 180) / Math.PI,
    flapDownDegrees: FLAP_DOWN_DEGREES,
    aileronRangeDegrees: AILERON_RANGE,
    maximumOperatingHeight: DC3_HEIGHT_TAIL_DOWN,
  },
  labMetrics: [
    { label: "SPAN", value: DC3_WINGSPAN, decimals: 2, signed: false },
    { label: "LENGTH", value: DC3_LENGTH, decimals: 2, signed: false },
    { label: "SIT", value: DC3_HEIGHT_TAIL_DOWN, decimals: 2, signed: false },
    { label: "PROP", value: DC3_PROPELLER_DIAMETER, decimals: 2, signed: false },
    { label: "PARTS", value: parts.length, decimals: 0, signed: false, unit: "" },
  ],
  anchors: {
    groundCentre: point(0, 0, 0),
    nose,
    tail,
    leftWingTip: leftTip,
    rightWingTip: rightTip,
    finTip,
    leftProp: bodyToWorld(point(-ENGINE_X, PROP_HUB_Y, PROP_HUB_Z)),
    rightProp: bodyToWorld(point(ENGINE_X, PROP_HUB_Y, PROP_HUB_Z)),
    leftMainWheel: bodyToWorld(point(-ENGINE_X, GEAR_BODY_Y, GEAR_BODY_Z)),
    rightMainWheel: bodyToWorld(point(ENGINE_X, GEAR_BODY_Y, GEAR_BODY_Z)),
    tailwheel: bodyToWorld(point(0, TAILWHEEL_BODY_Y, TAILWHEEL_BODY_Z)),
    humanScale: point(0, 1.75, 0),
  },
  motionConstraints: {
    staticAirframe: true,
    propellerMotion: "constant-rotation-only-frozen",
    propellerBladeCount: PROP_BLADES,
    controlSurfaces: "hinged-leaves-lab-pose-only",
    retractionExcluded: true,
    aerodynamicsExcluded: true,
    worldIntegrationDeferred: true,
  },
  surfaceHinges,
  labEnvironment: {
    floorRadius: 34,
    gridSize: 64,
    gridDivisions: 64,
    fogNear: 72,
    fogFar: 118,
    floorY: -0.04,
  },
  parts,
  views,
};
