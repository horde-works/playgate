import type {
  ObjectLabModel,
  ObjectLabPart,
  ObjectPoint,
  ObjectTriangle,
} from "../dutchWindmills/objectModel.ts";

/**
 * Kallur airship — canonical Object Lab study.
 *
 * Evidence: docs/kallur/airship-reference/evidence-card-01. Igor's verdict
 * owns the concept: a SMALL Hindenburg-form hull — slender (L/D ≈ 5.1,
 * against the terminal ship's chubby 3.2), sharp-ish elliptic nose, long
 * tail cone, cruciform fins; colour stylization after the Faroese
 * national-airline helicopters (red + white only, no exact livery); the
 * gondola is a rounded chin-and-belly loft whose glazing follows the
 * hull toward the nose (not a helicopter wrap visor); a tapering
 * tail boom that merges into the
 * hull belly — NOT a hut of flat slabs (a01 rejection) and NOT hung on
 * struts; no main rotor — thrust from two side pods; parking is a plank
 * platform, so the gear is skids and y = 0 is the skid plane.
 */

const TAU = Math.PI * 2;

// Authoring space: the hull is drawn at the a04 accepted proportions and
// the WHOLE ship is scaled uniformly at emission - Igor's verdict
// (21.08): keep the lines, grow the ship so a 1.62 m villager stands in
// the cabin with margin. 1.45 turns the 1.21 m centreline headroom into
// 1.76 m (1.87 m half a metre off-axis).
export const KALLUR_AIRSHIP_SCALE = 1.45;
const AUTHOR_LENGTH = 11.2;
const AUTHOR_RADIUS = 1.1;
const AUTHOR_AXIS_Y = 2.95;
export const KALLUR_AIRSHIP_LENGTH = AUTHOR_LENGTH * KALLUR_AIRSHIP_SCALE;
export const KALLUR_AIRSHIP_RADIUS = AUTHOR_RADIUS * KALLUR_AIRSHIP_SCALE;
export const KALLUR_AIRSHIP_AXIS_Y = AUTHOR_AXIS_Y * KALLUR_AIRSHIP_SCALE;

const HALF_LENGTH = AUTHOR_LENGTH / 2;
const NOSE_LENGTH = AUTHOR_LENGTH * 0.28;
const WEDGES = 28;

/** Hull radius as a function of distance from the nose — the one owner of
 * the loft; fins, pod boom and pylons read it too. Slender thirties
 * proportions: elliptic nose sharpened past the pure sqrt, midship at
 * 28%, long power-law tail cone. */
function authorHullRadius(a: number): number {
  if (a <= 0 || a >= AUTHOR_LENGTH) return 0;
  if (a <= NOSE_LENGTH) {
    const t = a / NOSE_LENGTH;
    return AUTHOR_RADIUS *
      Math.pow(Math.max(0, 1 - (1 - t) * (1 - t)), 0.62);
  }
  const t = (a - NOSE_LENGTH) / (AUTHOR_LENGTH - NOSE_LENGTH);
  return AUTHOR_RADIUS * Math.pow(Math.max(0, 1 - t * t), 0.62);
}

/** World-scale hull radius by world-scale distance from the nose. */
export const kallurAirshipHullRadius = (a: number): number =>
  authorHullRadius(a / KALLUR_AIRSHIP_SCALE) * KALLUR_AIRSHIP_SCALE;

const radiusAtZ = (z: number): number =>
  authorHullRadius(HALF_LENGTH - z);

/** Hull belly height at (x, z) — where the pod must bury its wall tops. */
const authorBellyY = (x: number, z: number): number => {
  const radius = radiusAtZ(z);
  const reach = radius * radius - x * x;
  if (reach <= 0) return AUTHOR_AXIS_Y;
  return AUTHOR_AXIS_Y - Math.sqrt(reach);
};

/** World-scale hull belly height at world-scale (x, z). */
export const kallurAirshipBellyY = (x: number, z: number): number =>
  authorBellyY(x / KALLUR_AIRSHIP_SCALE, z / KALLUR_AIRSHIP_SCALE) *
    KALLUR_AIRSHIP_SCALE;

const point = (x: number, y: number, z: number): ObjectPoint => [x, y, z];

const parts: ObjectLabPart[] = [];

const addBox = (
  id: string,
  group: string,
  material: ObjectLabPart["material"],
  center: ObjectPoint,
  size: ObjectPoint,
  rotation?: ObjectPoint,
) => {
  parts.push({ kind: "box", id, group, material, center, size, rotation });
};

const addBeam = (
  id: string,
  group: string,
  material: ObjectLabPart["material"],
  from: ObjectPoint,
  to: ObjectPoint,
  width: number,
  depth: number,
) => {
  parts.push({ kind: "beam", id, group, material, from, to, width, depth });
};

const addCylinder = (
  id: string,
  group: string,
  material: ObjectLabPart["material"],
  from: ObjectPoint,
  to: ObjectPoint,
  radius: number,
) => {
  parts.push({
    kind: "cylinder", id, group, material, from, to, radius,
    radialSegments: 14,
  });
};

const addMesh = (
  id: string,
  group: string,
  material: ObjectLabPart["material"],
  geometry: { vertices: ObjectPoint[]; triangles: ObjectTriangle[] },
) => {
  parts.push({ kind: "mesh", id, group, material, ...geometry });
};

// --- 1. Hull loft: one closed white skin ----------------------------------

const HULL_STATIONS = [
  0, 0.25, 0.6, 1.1, 1.7, 2.5, 3.14, 4.2, 5.4, 6.6, 7.8, 8.9, 9.9, 10.7,
  KALLUR_AIRSHIP_LENGTH,
] as const;

{
  const vertices: ObjectPoint[] = [];
  const gridIndex = (station: number, wedge: number): number => {
    const radius = authorHullRadius(HULL_STATIONS[station]);
    if (radius === 0) return station === 0 ? 0 : 1;
    return 2 + (station - 1) * WEDGES + (wedge % WEDGES);
  };
  vertices.push(point(0, AUTHOR_AXIS_Y, HALF_LENGTH));
  vertices.push(point(0, AUTHOR_AXIS_Y, -HALF_LENGTH));
  for (let station = 1; station < HULL_STATIONS.length - 1; station += 1) {
    const a = HULL_STATIONS[station];
    const radius = authorHullRadius(a);
    for (let wedge = 0; wedge < WEDGES; wedge += 1) {
      const phi = (wedge / WEDGES) * TAU;
      vertices.push(point(
        radius * Math.sin(phi),
        AUTHOR_AXIS_Y + radius * Math.cos(phi),
        HALF_LENGTH - a,
      ));
    }
  }
  const triangles: ObjectTriangle[] = [];
  for (let band = 0; band < HULL_STATIONS.length - 1; band += 1) {
    for (let wedge = 0; wedge < WEDGES; wedge += 1) {
      const a0 = gridIndex(band, wedge);
      const a1 = gridIndex(band, wedge + 1);
      const b0 = gridIndex(band + 1, wedge);
      const b1 = gridIndex(band + 1, wedge + 1);
      if (a0 === a1) {
        triangles.push([a0, b1, b0]);
      } else if (b0 === b1) {
        triangles.push([a0, a1, b0]);
      } else {
        triangles.push([a0, a1, b1], [a0, b1, b0]);
      }
    }
  }
  addMesh("hull-skin", "airship-hull", "paint-light", { vertices, triangles });
}

// Rigid envelope structure. The accepted outer loft stays untouched; rings
// and longitudinal stringers sit just inside it and are the distributed mass
// that keeps a planted airship from behaving like a light gondola under a
// weightless balloon.
{
  // Two end frames carry the long envelope; the top and bottom keels tie
  // them together. Four straight chords per ring are intentional: this is
  // the scene's physical frame, not another tessellation of the visual skin.
  const stations = [-4.45, 4.45] as const;
  const ringSegments = 4;
  const stringerCount = 2;
  const inset = 0.09;
  const framePoint = (z: number, phi: number): ObjectPoint => {
    const radius = Math.max(0.12, radiusAtZ(z) - inset);
    return point(
      radius * Math.sin(phi),
      AUTHOR_AXIS_Y + radius * Math.cos(phi),
      z,
    );
  };
  for (const [stationIndex, z] of stations.entries()) {
    for (let segment = 0; segment < ringSegments; segment += 1) {
      const from = framePoint(z, (segment / ringSegments) * TAU);
      const to = framePoint(z, ((segment + 1) / ringSegments) * TAU);
      addBeam(
        `frame:ring:${stationIndex}:${segment}`,
        "airship-frame",
        "metal",
        from,
        to,
        0.115,
        0.115,
      );
    }
  }
  for (let stringer = 0; stringer < stringerCount; stringer += 1) {
    const phi = (stringer / stringerCount) * TAU;
    for (let bay = 0; bay < stations.length - 1; bay += 1) {
      addBeam(
        `frame:stringer:${stringer}:${bay}`,
        "airship-frame",
        "metal",
        framePoint(stations[bay], phi),
        framePoint(stations[bay + 1], phi),
        0.115,
        0.115,
      );
    }
  }
}

// Cheatline: a raised trim strip riding the loft on both flanks — a real
// livery moulding (top face, two skirts, end caps), not an in-skin
// material seam.
{
  const LIFT = 0.014;
  const CHEAT_STATIONS = [1.2, 1.9, 2.8, 3.92, 5.1, 6.4, 7.7, 8.9, 9.9] as const;
  const lane = (phiFrom: number, phiTo: number): {
    vertices: ObjectPoint[]; triangles: ObjectTriangle[];
  } => {
    const vertices: ObjectPoint[] = [];
    const at = (a: number, phi: number, lift: number): ObjectPoint => {
      const radius = authorHullRadius(a) + lift;
      return point(
        radius * Math.sin(phi),
        AUTHOR_AXIS_Y + radius * Math.cos(phi),
        HALF_LENGTH - a,
      );
    };
    for (const a of CHEAT_STATIONS) {
      vertices.push(at(a, phiFrom, -0.002));
      vertices.push(at(a, phiFrom, LIFT));
      vertices.push(at(a, phiTo, LIFT));
      vertices.push(at(a, phiTo, -0.002));
    }
    const triangles: ObjectTriangle[] = [];
    for (let band = 0; band < CHEAT_STATIONS.length - 1; band += 1) {
      const s = band * 4;
      const n = s + 4;
      for (const [e0, e1] of [[0, 1], [1, 2], [2, 3]] as const) {
        triangles.push([s + e0, s + e1, n + e1], [s + e0, n + e1, n + e0]);
      }
    }
    const last = (CHEAT_STATIONS.length - 1) * 4;
    triangles.push([0, 3, 2], [0, 2, 1]);
    triangles.push([last, last + 1, last + 2], [last, last + 2, last + 3]);
    return { vertices, triangles };
  };
  const laneHalf = (6.4 / 2 / 180) * Math.PI;
  const laneCentre = (84 / 180) * Math.PI;
  addMesh("cheatline-l", "airship-hull", "paint-accent",
    lane(laneCentre - laneHalf, laneCentre + laneHalf));
  addMesh("cheatline-r", "airship-hull", "paint-accent",
    lane(TAU - laneCentre - laneHalf, TAU - laneCentre + laneHalf));
}

// --- 2. Cruciform tail fins: roots read the hull profile ------------------

const finPrism = (
  outline: readonly (readonly [z: number, span: number])[],
  toWorld: (z: number, span: number) => ObjectPoint,
  across: ObjectPoint,
  halfThickness: number,
): { vertices: ObjectPoint[]; triangles: ObjectTriangle[] } => {
  const vertices: ObjectPoint[] = [];
  for (const side of [1, -1] as const) {
    for (const [z, span] of outline) {
      const base = toWorld(z, span);
      vertices.push(point(
        base[0] + across[0] * halfThickness * side,
        base[1] + across[1] * halfThickness * side,
        base[2] + across[2] * halfThickness * side,
      ));
    }
  }
  const n = outline.length;
  const triangles: ObjectTriangle[] = [];
  for (let i = 1; i < n - 1; i += 1) {
    triangles.push([0, i, i + 1]);
    triangles.push([n, n + i + 1, n + i]);
  }
  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n;
    triangles.push([i, j, n + j], [i, n + j, n + i]);
  }
  return { vertices, triangles };
};

{
  const outline: readonly (readonly [number, number])[] = [
    [-3.3, radiusAtZ(-3.3) - 0.12],
    [-4.25, 1.45],
    [-5.42, 1.34],
    [-5.42, Math.max(0.1, radiusAtZ(-5.42) - 0.02)],
  ];
  const finDirections: readonly {
    id: string;
    dir: ObjectPoint;
    across: ObjectPoint;
  }[] = [
    { id: "fin-top", dir: point(0, 1, 0), across: point(1, 0, 0) },
    { id: "fin-bottom", dir: point(0, -1, 0), across: point(1, 0, 0) },
    { id: "fin-left", dir: point(1, 0, 0), across: point(0, 1, 0) },
    { id: "fin-right", dir: point(-1, 0, 0), across: point(0, 1, 0) },
  ];
  for (const fin of finDirections) {
    addMesh(fin.id, "airship-fins", "paint-accent", finPrism(
      outline,
      (z, span) => point(
        fin.dir[0] * span,
        AUTHOR_AXIS_Y + fin.dir[1] * span,
        z,
      ),
      fin.across,
      0.06,
    ));
  }
}

// --- 3. Gondola: chin/keel/width loft, glass pulled up onto the hull -----
//
// Rounded red chin, glazing that follows the balloon belly to the nose
// (not a helicopter visor), side window, a sliding door over a REAL
// doorway void, and a tail boom whose keel rises into the hull.

const FLOOR_Y = 0.55;

interface PodStation {
  readonly z: number;
  readonly w: number;
  readonly keel: number;
  readonly shoulder: number;
}

const POD_STATIONS: readonly PodStation[] = [
  { z: 2.68, w: 0.06, keel: 1.38, shoulder: 1.46 },
  { z: 2.58, w: 0.14, keel: 1.24, shoulder: 1.40 },
  { z: 2.48, w: 0.22, keel: 1.12, shoulder: 1.36 },
  { z: 2.32, w: 0.34, keel: 0.96, shoulder: 1.28 },
  { z: 2.2, w: 0.42, keel: 0.86, shoulder: 1.22 },
  { z: 1.85, w: 0.54, keel: 0.66, shoulder: 1.1 },
  { z: 1.4, w: 0.62, keel: 0.57, shoulder: 1.05 },
  { z: 0.9, w: 0.65, keel: 0.55, shoulder: 1.05 },
  { z: 0.3, w: 0.65, keel: 0.55, shoulder: 1.05 },
  { z: -0.5, w: 0.65, keel: 0.55, shoulder: 1.05 },
  { z: -1.3, w: 0.62, keel: 0.6, shoulder: 1.05 },
  { z: -2.2, w: 0.44, keel: 1.0, shoulder: 1.42 },
  { z: -3.1, w: 0.3, keel: 1.55, shoulder: 1.82 },
  { z: -4.0, w: 0.18, keel: 2.1, shoulder: 2.3 },
  { z: -4.6, w: 0.1, keel: 2.42, shoulder: 2.52 },
];

const SHELL_SEGMENTS = 16;
const SHELL_EXPONENT = 2.5;

/** Lower-shell point: superellipse arc from +shoulder around the keel to
 * -shoulder; segment 0 is the +x shoulder. */
const shellPoint = (station: PodStation, segment: number): ObjectPoint => {
  const theta = (segment / SHELL_SEGMENTS) * Math.PI;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const across = Math.sign(cos) * Math.pow(Math.abs(cos), 2 / SHELL_EXPONENT);
  const down = Math.pow(Math.abs(sin), 2 / SHELL_EXPONENT);
  return point(
    station.w * across,
    station.shoulder - (station.shoulder - station.keel) * down,
    station.z,
  );
};

const wallTopAt = (station: PodStation, side: 1 | -1): number =>
  authorBellyY(side * station.w, station.z) + 0.12;

const COCKPIT_Z_MIN = 0.9;
const COLLAR_Z = 1.85;
const WINDOW_Z = [0.3, 0.9] as const;
const DOORWAY_Z = [-1.3, -0.5] as const;
const WINDOW_SILL = 1.16;
const WINDOW_HEAD = 1.76;
const DOORWAY_HEAD = 1.9;

{
  const podVertices: ObjectPoint[] = [];
  const podTriangles: ObjectTriangle[] = [];
  const canopyVertices: ObjectPoint[] = [];
  const canopyTriangles: ObjectTriangle[] = [];
  const pushTriangle = (
    sink: "pod" | "canopy",
    a: ObjectPoint,
    b: ObjectPoint,
    c: ObjectPoint,
  ) => {
    const vertices = sink === "pod" ? podVertices : canopyVertices;
    const triangles = sink === "pod" ? podTriangles : canopyTriangles;
    const base = vertices.length;
    vertices.push(a, b, c);
    triangles.push([base, base + 1, base + 2]);
  };
  const pushQuad = (
    sink: "pod" | "canopy",
    a: ObjectPoint,
    b: ObjectPoint,
    c: ObjectPoint,
    d: ObjectPoint,
  ) => {
    pushTriangle(sink, a, b, c);
    pushTriangle(sink, a, c, d);
  };

  // Lower shell: red chin all the way. Glass does not claim these
  // facets — a glazed upper band here read as a helicopter visor.
  for (let band = 0; band < POD_STATIONS.length - 1; band += 1) {
    const near = POD_STATIONS[band];
    const far = POD_STATIONS[band + 1];
    for (let segment = 0; segment < SHELL_SEGMENTS; segment += 1) {
      const a = shellPoint(near, segment);
      const b = shellPoint(near, segment + 1);
      const c = shellPoint(far, segment + 1);
      const d = shellPoint(far, segment);
      pushQuad("pod", a, b, c, d);
    }
  }
  // Rounded red cap at the chin — one closed fan, not a keyhole shared
  // with a glass roof.
  {
    const nose = POD_STATIONS[0];
    const tip = point(0, (nose.keel + nose.shoulder) / 2, nose.z + 0.08);
    for (let segment = 0; segment < SHELL_SEGMENTS; segment += 1) {
      pushTriangle(
        "pod",
        shellPoint(nose, segment + 1),
        shellPoint(nose, segment),
        tip,
      );
    }
  }
  // Glass on the balloon's belly from the cabin merge forward, plus a
  // short lip down to the gondola brow at the nose — the glazing follows
  // the envelope instead of standing as a visor.
  const collarStations = POD_STATIONS.filter((station) => station.z >= COLLAR_Z);
  const COLLAR_SAMPLES = 10;
  const brow = (station: PodStation, t: number): ObjectPoint => {
    const x = station.w * (2 * t - 1);
    return point(x, station.shoulder, station.z);
  };
  const hull = (station: PodStation, t: number): ObjectPoint => {
    const x = station.w * (2 * t - 1);
    return point(x, authorBellyY(x, station.z) + 0.12, station.z);
  };
  for (let band = 0; band < collarStations.length - 1; band += 1) {
    const near = collarStations[band];
    const far = collarStations[band + 1];
    for (let sample = 0; sample < COLLAR_SAMPLES; sample += 1) {
      const t0 = sample / COLLAR_SAMPLES;
      const t1 = (sample + 1) / COLLAR_SAMPLES;
      pushQuad(
        "canopy",
        hull(near, t0),
        hull(far, t0),
        hull(far, t1),
        hull(near, t1),
      );
    }
  }
  {
    const nose = collarStations[0];
    for (let sample = 0; sample < COLLAR_SAMPLES; sample += 1) {
      const t0 = sample / COLLAR_SAMPLES;
      const t1 = (sample + 1) / COLLAR_SAMPLES;
      const upper0 = hull(nose, t0);
      const upper1 = hull(nose, t1);
      if (Math.min(upper0[1], upper1[1]) < nose.shoulder + 0.02) continue;
      pushQuad(
        "canopy",
        brow(nose, t0),
        brow(nose, t1),
        upper1,
        upper0,
      );
    }
  }

  // Walls: vertical strips from shoulder to the hull belly. Material by
  // z-band: cockpit side glazing, fixed window, blind panel, doorway void
  // under a red head strip.
  for (let band = 0; band < POD_STATIONS.length - 1; band += 1) {
    const near = POD_STATIONS[band];
    const far = POD_STATIONS[band + 1];
    for (const side of [1, -1] as const) {
      const nearTop = wallTopAt(near, side);
      const farTop = wallTopAt(far, side);
      if (nearTop < near.shoulder + 0.03 && farTop < far.shoulder + 0.03) {
        continue;
      }
      const strip = (
        sink: "pod" | "canopy",
        nearBottom: number,
        farBottom: number,
        nearCeil: number,
        farCeil: number,
      ) => {
        const a = point(side * near.w, nearBottom, near.z);
        const b = point(side * far.w, farBottom, far.z);
        const c = point(side * far.w, farCeil, far.z);
        const d = point(side * near.w, nearCeil, near.z);
        if (side > 0) pushQuad(sink, a, b, c, d);
        else pushQuad(sink, b, a, d, c);
      };
      const zMid = (near.z + far.z) / 2;
      if (zMid > COCKPIT_Z_MIN) {
        strip("canopy", near.shoulder, far.shoulder, nearTop, farTop);
      } else if (zMid > WINDOW_Z[0] && zMid < WINDOW_Z[1]) {
        strip("pod", near.shoulder, far.shoulder, WINDOW_SILL, WINDOW_SILL);
        strip("canopy", WINDOW_SILL, WINDOW_SILL, WINDOW_HEAD, WINDOW_HEAD);
        strip("pod", WINDOW_HEAD, WINDOW_HEAD, nearTop, farTop);
      } else if (zMid > DOORWAY_Z[0] && zMid < DOORWAY_Z[1]) {
        strip("pod", DOORWAY_HEAD, DOORWAY_HEAD, nearTop, farTop);
      } else {
        strip("pod", near.shoulder, far.shoulder, nearTop, farTop);
      }
    }
  }
  addMesh("gondola-pod", "airship-gondola", "paint-accent",
    { vertices: podVertices, triangles: podTriangles });
  addMesh("gondola-canopy", "airship-glazing", "glazing",
    { vertices: canopyVertices, triangles: canopyTriangles });
}

// Cabin fittings: floor, rear bulkhead, window posts, the sliding door
// riding OUTSIDE the wall plane over its real void.
addBox("cabin-floor", "airship-gondola", "paint-accent",
  point(0, FLOOR_Y + 0.06, 0.45), point(1.24, 0.12, 3.5));
addBox("cabin-rear", "airship-gondola", "paint-accent",
  point(0, 1.35, -1.3), point(1.22, 1.5, 0.08));
for (const [index, postZ] of [0.9, 0.3, -0.5].entries()) {
  for (const side of [1, -1] as const) {
    const tag = side > 0 ? "l" : "r";
    addBox(`post-${index}-${tag}`, "airship-gondola", "paint-accent",
      point(side * 0.665, 1.5, postZ), point(0.06, 1.05, 0.1));
  }
}
for (const side of [1, -1] as const) {
  const tag = side > 0 ? "l" : "r";
  const x = side * 0.71;
  const doorMid = (DOORWAY_Z[0] + DOORWAY_Z[1]) / 2;
  addBox(`door-low-${tag}`, "airship-gondola", "paint-accent",
    point(x, (0.6 + 1.16) / 2, doorMid),
    point(0.05, 1.16 - 0.6, DOORWAY_Z[1] - DOORWAY_Z[0] - 0.06));
  addBox(`door-pane-${tag}`, "airship-glazing", "glazing",
    point(x, (1.16 + 1.74) / 2, doorMid),
    point(0.03, 1.74 - 1.16, DOORWAY_Z[1] - DOORWAY_Z[0] - 0.14));
  addBox(`door-top-${tag}`, "airship-gondola", "paint-accent",
    point(x, (1.74 + 2.06) / 2, doorMid),
    point(0.05, 2.06 - 1.74, DOORWAY_Z[1] - DOORWAY_Z[0] - 0.06));
}

// --- 4. Motor pods on pylons, two separate blades per shaft ---------------
//
// IDs follow the fleet mask `…:engine:<±1>:blade:<±1>` so the kinematic
// split, shaft animation and throttle actuators all find the same pieces.
// A single slab named `engine:l:blade` matched the independent-member
// substring `:blade:` (via the compiled `:piece` suffix) but not the
// animation regex, so the props were extra Rapier bodies that lagged the
// hull and never spun.
//
// Shaft is canonical +Z. Two thin blades on one diameter, roots buried
// in the spinner, pitched around the span. A thick stick along the shaft
// (a06) sat in front of the hub and read as a V, not a propeller.
// Station of the disk is solved from hull radius + tip radius + gap.
//
// The pod hangs on a wing fairing plus three stays that bury into the
// nacelle. Two sticks that only kissed the cowling top left the motor
// floating beside the mount (town airship, skyMooringDocument: without
// the outrigger wing "мотор на таком выносе висел бы ни на чём").

const NACELLE_RADIUS = 0.19;
const NACELLE_NOSE_Z = -0.14;
const NACELLE_TAIL_Z = -1.08;
const SPINNER_NOSE_Z = 0.12;
const PROP_PLANE_Z = (NACELLE_NOSE_Z + SPINNER_NOSE_Z) / 2;
const BLADE_SPAN = 0.54;
const BLADE_CHORD = 0.15;
const BLADE_THICK = 0.04;
const BLADE_ROOT = -0.04;
const BLADE_PITCH = 0.32;
const PROP_DISK_CLEARANCE = 0.18;
const POD_Y = AUTHOR_AXIS_Y - 0.22;
const BLADE_CENTRE = BLADE_ROOT + BLADE_SPAN / 2;
const BLADE_TIP_RADIUS = BLADE_ROOT + BLADE_SPAN
  + 0.5 * Math.hypot(BLADE_CHORD, BLADE_THICK * Math.sin(BLADE_PITCH));
const POD_X = radiusAtZ(PROP_PLANE_Z) + BLADE_TIP_RADIUS + PROP_DISK_CLEARANCE;

const hullSkinXAt = (y: number, z: number): number => {
  const dy = y - AUTHOR_AXIS_Y;
  return Math.sqrt(Math.max(0.05, radiusAtZ(z) ** 2 - dy * dy));
};

for (const side of [-1, 1] as const) {
  const podX = side * POD_X;
  addCylinder(`engine:${side}:nacelle`, "airship-motors", "paint-light",
    point(podX, POD_Y, NACELLE_NOSE_Z),
    point(podX, POD_Y, NACELLE_TAIL_Z),
    NACELLE_RADIUS);
  addCylinder(`engine:${side}:spinner`, "airship-motors", "metal",
    point(podX, POD_Y, NACELLE_NOSE_Z),
    point(podX, POD_Y, SPINNER_NOSE_Z),
    0.11);
  for (const blade of [-1, 1] as const) {
    addBox(
      `engine:${side}:blade:${blade}`,
      "airship-motors",
      "metal",
      point(podX, POD_Y + blade * BLADE_CENTRE, PROP_PLANE_Z),
      point(BLADE_CHORD, BLADE_SPAN, BLADE_THICK),
      point(0, BLADE_PITCH, 0),
    );
  }
  const wingZ = (NACELLE_NOSE_Z + NACELLE_TAIL_Z) / 2;
  const hullX = hullSkinXAt(POD_Y, wingZ);
  const nacelleInboardX = POD_X - NACELLE_RADIUS;
  const wingGap = nacelleInboardX - hullX;
  addBox(
    `engine:${side}:wing`,
    "airship-motors",
    "metal",
    point(side * (hullX + nacelleInboardX) / 2, POD_Y, wingZ),
    point(wingGap + 0.08, 0.09, 0.62),
  );
  const buryIntoNacelle = (
    yOff: number,
    z: number,
  ): ObjectPoint => point(
    podX - side * NACELLE_RADIUS * 0.4,
    POD_Y + yOff,
    z,
  );
  const buryIntoHull = (y: number, z: number): ObjectPoint => point(
    side * (hullSkinXAt(y, z) - 0.07),
    y,
    z,
  );
  addBeam(`engine:${side}:pylon:front`, "airship-motors", "metal",
    buryIntoHull(AUTHOR_AXIS_Y + 0.16, -0.3),
    buryIntoNacelle(0.08, -0.38),
    0.055, 0.055);
  addBeam(`engine:${side}:pylon:rear`, "airship-motors", "metal",
    buryIntoHull(AUTHOR_AXIS_Y + 0.14, -0.9),
    buryIntoNacelle(0.08, -0.92),
    0.055, 0.055);
  addBeam(`engine:${side}:pylon:lower`, "airship-motors", "metal",
    buryIntoHull(AUTHOR_AXIS_Y - 0.32, -0.58),
    buryIntoNacelle(-0.1, -0.58),
    0.05, 0.05);
}

/** World-scale nacelle centres — the same stations as the thrust points. */
export const KALLUR_AIRSHIP_ENGINE_LOCAL: readonly [ObjectPoint, ObjectPoint] = [
  point(-POD_X, POD_Y, (NACELLE_NOSE_Z + NACELLE_TAIL_Z) / 2),
  point(POD_X, POD_Y, (NACELLE_NOSE_Z + NACELLE_TAIL_Z) / 2),
].map((local) => point(
  local[0] * KALLUR_AIRSHIP_SCALE,
  local[1] * KALLUR_AIRSHIP_SCALE,
  local[2] * KALLUR_AIRSHIP_SCALE,
)) as [ObjectPoint, ObjectPoint];

// --- 5. Skids: the platform gear; tube bottoms exactly at y = 0 -----------

const SKID_RADIUS = 0.05;
for (const side of [1, -1] as const) {
  const tag = side > 0 ? "l" : "r";
  const x = side * 0.72;
  addCylinder(`skid-${tag}`, "airship-skids", "metal",
    point(x, SKID_RADIUS, 1.8), point(x, SKID_RADIUS, -1.2), SKID_RADIUS);
  // Wall of the pod → skid axis, same z. A splay that fought the old
  // Euler made four short sticks pointing at the camera.
  addCylinder(`skid-strut-front-${tag}`, "airship-skids", "metal",
    point(side * 0.62, 0.7, 1.32),
    point(x, SKID_RADIUS, 1.32),
    0.035);
  addCylinder(`skid-strut-rear-${tag}`, "airship-skids", "metal",
    point(side * 0.62, 0.7, -0.75),
    point(x, SKID_RADIUS, -0.75),
    0.035);
}

// Uniform world scale at emission: proportions untouched by contract.
const S = KALLUR_AIRSHIP_SCALE;
const scalePoint = (p: ObjectPoint): ObjectPoint => [p[0] * S, p[1] * S, p[2] * S];
const scaledParts: ObjectLabPart[] = parts.map((part) => {
  if (part.kind === "box") {
    return { ...part, center: scalePoint(part.center), size: scalePoint(part.size) };
  }
  if (part.kind === "beam") {
    return {
      ...part, from: scalePoint(part.from), to: scalePoint(part.to),
      width: part.width * S, depth: part.depth * S,
    };
  }
  if (part.kind === "cylinder") {
    return {
      ...part, from: scalePoint(part.from), to: scalePoint(part.to),
      radius: part.radius * S,
    };
  }
  return { ...part, vertices: part.vertices.map(scalePoint) };
});

export const KALLUR_AIRSHIP_FLOOR_TOP = (FLOOR_Y + 0.12) * S;

export const kallurAirshipParts: readonly ObjectLabPart[] = scaledParts;

export const kallurAirshipObject: ObjectLabModel = {
  id: "kallur-airship",
  revision: "airship-a07-2026-08-22",
  title: "Kallur airship",
  units: "metres",
  coordinates: { up: "+Y", front: "+Z", origin: "ground-centre" },
  sourceNotes: [
    "Igor's verdict owns the concept: slender small-Hindenburg hull (a01's chubby L/D 3.9 read as the city zeppelin - rejected), red+white helicopter stylization WITHOUT exact livery, rounded pod merged into the hull, no main rotor, skids for a plank platform.",
    "a02: hull slimmed to L/D 5.1; gondola rebuilt as a crown/keel/width loft - rounded chin, tail boom rising into the hull (a01's flat-slab hut rejected: 'не вертолётных обводов ни с какой стороны').",
    "a06: fleet engine/blade ids so the props spin with the hull; thin blades on one diameter, roots in the spinner; disk station is hull+tip+gap; nacelle hangs on a wing and three buried stays; skid oleos bury into the tube axis; roll rail stays inside the envelope and on the compound hull (only the cars are independent members). Nose glass follows the hull belly toward the tip (helicopter wrap visor rejected).",
    "a07: the accepted loft now encloses a real ring-and-stringer frame; the white envelope is a rigid painted shell in physics and material response, not a weightless cloth balloon.",
    "Hull 11.2 m = terminal wagon-airship 15 m / 1.34; summit plateau 50-60 m keeps it noticeable, not dominant.",
  ],
  dimensions: {
    hullLength: KALLUR_AIRSHIP_LENGTH,
    hullDiameter: KALLUR_AIRSHIP_RADIUS * 2,
    axisHeight: KALLUR_AIRSHIP_AXIS_Y,
    cabinFloorY: FLOOR_Y * S,
    standingHeadroom: (authorBellyY(0, 0.3) - FLOOR_Y - 0.12) * S,
    finSpan: 1.45 * S,
  },
  labMetrics: [
    { label: "Hull length", value: KALLUR_AIRSHIP_LENGTH, unit: "m", decimals: 1 },
    { label: "Hull diameter", value: KALLUR_AIRSHIP_RADIUS * 2, unit: "m", decimals: 2 },
    { label: "Cabin headroom", value: (authorBellyY(0, 0.3) - FLOOR_Y - 0.12) * S, unit: "m", decimals: 2 },
    { label: "Parts", value: scaledParts.length, decimals: 0 },
  ],
  anchors: {
    "skid-plane": point(0, 0, 0),
    "cabin-door-l": point(0.71, 1.2, (DOORWAY_Z[0] + DOORWAY_Z[1]) / 2),
    "nose-tip": point(0, AUTHOR_AXIS_Y, HALF_LENGTH),
  },
  motionConstraints: {
    propellerShafts: "constant-rotation from signed shaft command",
    rigidEnvelopeFrame: true,
    excluded: "wind",
  },
  labEnvironment: { floorRadius: 20, gridSize: 28, gridDivisions: 28 },
  parts: scaledParts,
  views: [
    {
      id: "front",
      label: "Front: chin glazing, skids, pod symmetry",
      projection: "orthographic",
      position: scalePoint(point(0, 2.4, 18)),
      target: scalePoint(point(0, 2.4, 0)),
      orthoHeight: 6.0 * S,
    },
    {
      id: "profile",
      label: "Profile: hull program, cheatline, merged pod",
      projection: "orthographic",
      position: scalePoint(point(18, 2.3, 0)),
      target: scalePoint(point(0, 2.3, 0)),
      orthoHeight: 12.2 * S,
    },
    {
      id: "rear",
      label: "Rear: cruciform fins",
      projection: "orthographic",
      position: scalePoint(point(0, 2.7, -18)),
      target: scalePoint(point(0, 2.7, 0)),
      orthoHeight: 6.6 * S,
    },
    {
      id: "three-quarter",
      label: "Three-quarter: mass, fusion, livery",
      projection: "perspective",
      position: scalePoint(point(9.5, 4.2, 10.5)),
      target: scalePoint(point(0, 2.3, 0)),
      fov: 32,
    },
    {
      id: "tail-three-quarter",
      label: "Tail three-quarter: fins and boom run-out",
      projection: "perspective",
      position: scalePoint(point(-8.5, 4.4, -9.5)),
      target: scalePoint(point(0, 2.6, -1.5)),
      fov: 32,
    },
    {
      id: "high-three-quarter",
      label: "High three-quarter: no rotor, white back, red lane",
      projection: "perspective",
      position: scalePoint(point(6.5, 9.5, 8)),
      target: scalePoint(point(0, 2.6, 0)),
      fov: 32,
    },
    {
      id: "gondola-detail",
      label: "Gondola: chin loft, hull-following glass, door, real openings",
      projection: "perspective",
      position: scalePoint(point(4.4, 1.7, 4.6)),
      target: scalePoint(point(0, 1.35, 0.5)),
      fov: 30,
    },
    {
      id: "gondola-cutaway",
      label: "Gondola cutaway: glazing hidden, openings are voids",
      projection: "perspective",
      position: scalePoint(point(4.4, 1.7, 4.6)),
      target: scalePoint(point(0, 1.35, 0.5)),
      fov: 30,
      hiddenGroups: ["airship-glazing"],
    },
  ],
};
