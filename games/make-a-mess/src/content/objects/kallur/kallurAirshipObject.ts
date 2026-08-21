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
 * gondola is a HELICOPTER-FORM pod — rounded chin and belly loft, big
 * wrap-around cockpit glazing, a tapering tail boom that merges into the
 * hull belly — NOT a hut of flat slabs (a01 rejection) and NOT hung on
 * struts; no main rotor — thrust from two side pods; parking is a plank
 * platform, so the gear is skids and y = 0 is the skid plane.
 */

const TAU = Math.PI * 2;

export const KALLUR_AIRSHIP_LENGTH = 11.2;
export const KALLUR_AIRSHIP_RADIUS = 1.1;
export const KALLUR_AIRSHIP_AXIS_Y = 2.95;

const HALF_LENGTH = KALLUR_AIRSHIP_LENGTH / 2;
const NOSE_LENGTH = KALLUR_AIRSHIP_LENGTH * 0.28;
const WEDGES = 28;

/** Hull radius as a function of distance from the nose — the one owner of
 * the loft; fins, pod boom and pylons read it too. Slender thirties
 * proportions: elliptic nose sharpened past the pure sqrt, midship at
 * 28%, long power-law tail cone. */
export function kallurAirshipHullRadius(a: number): number {
  if (a <= 0 || a >= KALLUR_AIRSHIP_LENGTH) return 0;
  if (a <= NOSE_LENGTH) {
    const t = a / NOSE_LENGTH;
    return KALLUR_AIRSHIP_RADIUS *
      Math.pow(Math.max(0, 1 - (1 - t) * (1 - t)), 0.62);
  }
  const t = (a - NOSE_LENGTH) / (KALLUR_AIRSHIP_LENGTH - NOSE_LENGTH);
  return KALLUR_AIRSHIP_RADIUS * Math.pow(Math.max(0, 1 - t * t), 0.62);
}

const radiusAtZ = (z: number): number =>
  kallurAirshipHullRadius(HALF_LENGTH - z);

/** Hull belly height at (x, z) — where the pod must bury its wall tops. */
export const kallurAirshipBellyY = (x: number, z: number): number => {
  const radius = radiusAtZ(z);
  const reach = radius * radius - x * x;
  if (reach <= 0) return KALLUR_AIRSHIP_AXIS_Y;
  return KALLUR_AIRSHIP_AXIS_Y - Math.sqrt(reach);
};

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
    const radius = kallurAirshipHullRadius(HULL_STATIONS[station]);
    if (radius === 0) return station === 0 ? 0 : 1;
    return 2 + (station - 1) * WEDGES + (wedge % WEDGES);
  };
  vertices.push(point(0, KALLUR_AIRSHIP_AXIS_Y, HALF_LENGTH));
  vertices.push(point(0, KALLUR_AIRSHIP_AXIS_Y, -HALF_LENGTH));
  for (let station = 1; station < HULL_STATIONS.length - 1; station += 1) {
    const a = HULL_STATIONS[station];
    const radius = kallurAirshipHullRadius(a);
    for (let wedge = 0; wedge < WEDGES; wedge += 1) {
      const phi = (wedge / WEDGES) * TAU;
      vertices.push(point(
        radius * Math.sin(phi),
        KALLUR_AIRSHIP_AXIS_Y + radius * Math.cos(phi),
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
      const radius = kallurAirshipHullRadius(a) + lift;
      return point(
        radius * Math.sin(phi),
        KALLUR_AIRSHIP_AXIS_Y + radius * Math.cos(phi),
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
        KALLUR_AIRSHIP_AXIS_Y + fin.dir[1] * span,
        z,
      ),
      fin.across,
      0.06,
    ));
  }
}

// --- 3. Gondola: a helicopter pod lofted from crown/keel/width tables -----
//
// Rounded chin and belly, wrap-around cockpit glazing, side window, a
// sliding door over a REAL doorway void, and a tail boom whose keel rises
// into the hull — the a01 flat-slab hut is the rejected form.

const FLOOR_Y = 0.55;

interface PodStation {
  readonly z: number;
  readonly w: number;
  readonly keel: number;
  readonly shoulder: number;
}

const POD_STATIONS: readonly PodStation[] = [
  { z: 2.62, w: 0.1, keel: 1.3, shoulder: 1.42 },
  { z: 2.45, w: 0.26, keel: 1.08, shoulder: 1.36 },
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

const SHELL_SEGMENTS = 8;
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

/** Canopy roof geometry at the nose: past the merge point the pod closes
 * with its OWN glazed roof arc instead of running wall blades up into the
 * hull (the a02 draft grew a glass spike there). Base = side wall top,
 * crown = arc centre; both dive back inside the hull at the merge. */
const NOSE_ROOF: ReadonlyMap<number, { base: number; crown: number }> = new Map([
  [2.45, { base: 1.62, crown: 1.92 }],
  [2.62, { base: 1.46, crown: 1.62 }],
]);
const POD_TIP = point(0, 1.4, 2.71);

const wallTopAt = (station: PodStation, side: 1 | -1): number =>
  NOSE_ROOF.get(station.z)?.base ??
    kallurAirshipBellyY(side * station.w, station.z) + 0.12;

/** Cockpit glazing reaches from this height up; below is the red chin.
 * Applies to the nose loft only — mid-cabin shells stay red. */
const chinLineAt = (z: number): number => 0.92 + Math.max(0, z - 1.4) * 0.26;

const COCKPIT_Z_MIN = 0.9;
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

  // Lower shell bands; the wrap canopy claims nose-region facets above
  // the chin line.
  for (let band = 0; band < POD_STATIONS.length - 1; band += 1) {
    const near = POD_STATIONS[band];
    const far = POD_STATIONS[band + 1];
    for (let segment = 0; segment < SHELL_SEGMENTS; segment += 1) {
      const a = shellPoint(near, segment);
      const b = shellPoint(near, segment + 1);
      const c = shellPoint(far, segment + 1);
      const d = shellPoint(far, segment);
      const midY = (a[1] + b[1] + c[1] + d[1]) / 4;
      const midZ = (a[2] + c[2]) / 2;
      const glazed = midZ > 1.4 && midY > chinLineAt(midZ);
      // Winding: outward for the pod's lower shell (viewed from below).
      pushQuad(glazed ? "canopy" : "pod", a, b, c, d);
    }
  }
  // Canopy roof: glazed arc bands over the nose stations, sealed to the
  // wall-top line, diving into the hull at the merge station.
  const roofPoint = (
    station: PodStation,
    roof: { base: number; crown: number },
    segment: number,
  ): ObjectPoint => {
    const t = segment / SHELL_SEGMENTS;
    return point(
      station.w * Math.cos(Math.PI * t),
      roof.base + (roof.crown - roof.base) * Math.sin(Math.PI * t),
      station.z,
    );
  };
  {
    const mergeStation = POD_STATIONS.find((s) => s.z === 2.2);
    const roofStations = POD_STATIONS.filter((s) => NOSE_ROOF.has(s.z));
    // Merge ring: buried just inside the hull at the merge station.
    const mergeRoof = {
      base: kallurAirshipBellyY(mergeStation!.w, 2.2) + 0.12,
      crown: kallurAirshipBellyY(0, 2.2) + 0.24,
    };
    const rings: { station: PodStation; roof: { base: number; crown: number } }[] = [
      { station: mergeStation!, roof: mergeRoof },
      ...roofStations.map((station) => ({
        station,
        roof: NOSE_ROOF.get(station.z)!,
      })),
    ];
    for (let band = 0; band < rings.length - 1; band += 1) {
      const near = rings[band];
      const far = rings[band + 1];
      for (let segment = 0; segment < SHELL_SEGMENTS; segment += 1) {
        pushQuad(
          "canopy",
          roofPoint(near.station, near.roof, segment),
          roofPoint(near.station, near.roof, segment + 1),
          roofPoint(far.station, far.roof, segment + 1),
          roofPoint(far.station, far.roof, segment),
        );
      }
    }
    // Roof cap: the extreme tip is a SOLID radome cone, as on the real
    // machines - glass wraps down TO it, never over it (a03 rendered the
    // glass fan as crushed shards at the tip).
    const last = rings[rings.length - 1];
    for (let segment = 0; segment < SHELL_SEGMENTS; segment += 1) {
      pushTriangle(
        "pod",
        roofPoint(last.station, last.roof, segment),
        roofPoint(last.station, last.roof, segment + 1),
        POD_TIP,
      );
    }
  }
  // Nose cap: solid radome cone below the canopy, to the same tip.
  {
    const nose = POD_STATIONS[0];
    for (let segment = 0; segment < SHELL_SEGMENTS; segment += 1) {
      const a = shellPoint(nose, segment);
      const b = shellPoint(nose, segment + 1);
      pushTriangle("pod", b, a, POD_TIP);
    }
    // Side slivers between shell shoulders and the roof base ring.
    const roof = NOSE_ROOF.get(nose.z)!;
    for (const side of [1, -1] as const) {
      const shoulder = point(side * nose.w, nose.shoulder, nose.z);
      const roofEdge = point(side * nose.w, roof.base, nose.z);
      if (side > 0) pushTriangle("pod", shoulder, roofEdge, POD_TIP);
      else pushTriangle("pod", roofEdge, shoulder, POD_TIP);
    }
  }

  // Walls: vertical strips from shoulder to the hull belly. Material by
  // z-band: cockpit wrap glazing, fixed window, blind panel, doorway void
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
        // The doorway is ABSENT material: only the head strip above it.
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

// --- 4. Motor pods on pylons, static two-blade props ----------------------

for (const side of [1, -1] as const) {
  const tag = side > 0 ? "l" : "r";
  const podX = side * 1.48;
  const podY = KALLUR_AIRSHIP_AXIS_Y - 0.25;
  addCylinder(`pod-${tag}`, "airship-motors", "paint-light",
    point(podX, podY, -0.15), point(podX, podY, -1.05), 0.19);
  addCylinder(`pod-nose-${tag}`, "airship-motors", "metal",
    point(podX, podY, -0.15), point(podX, podY, 0.03), 0.1);
  addBox(`prop-${tag}`, "airship-motors", "metal",
    point(podX, podY, 0.07), point(0.05, 1.12, 0.09),
    point(0, 0, side * 0.35));
  addBeam(`pylon-front-${tag}`, "airship-motors", "metal",
    point(side * 0.88, KALLUR_AIRSHIP_AXIS_Y + 0.15, -0.3),
    point(podX, podY + 0.1, -0.4), 0.06, 0.06);
  addBeam(`pylon-rear-${tag}`, "airship-motors", "metal",
    point(side * 0.88, KALLUR_AIRSHIP_AXIS_Y + 0.15, -0.85),
    point(podX, podY + 0.1, -0.8), 0.06, 0.06);
}

// --- 5. Skids: the platform gear; tube bottoms exactly at y = 0 -----------

const SKID_RADIUS = 0.05;
for (const side of [1, -1] as const) {
  const tag = side > 0 ? "l" : "r";
  const x = side * 0.72;
  addCylinder(`skid-${tag}`, "airship-skids", "metal",
    point(x, SKID_RADIUS, 1.8), point(x, SKID_RADIUS, -1.2), SKID_RADIUS);
  addBeam(`skid-strut-front-${tag}`, "airship-skids", "metal",
    point(side * 0.5, 0.62, 1.25),
    point(x, SKID_RADIUS * 2, 1.35), 0.055, 0.055);
  addBeam(`skid-strut-rear-${tag}`, "airship-skids", "metal",
    point(side * 0.5, 0.62, -0.7),
    point(x, SKID_RADIUS * 2, -0.8), 0.055, 0.055);
}

export const kallurAirshipParts: readonly ObjectLabPart[] = parts;

export const kallurAirshipObject: ObjectLabModel = {
  id: "kallur-airship",
  revision: "airship-a04-2026-08-21",
  title: "Kallur airship",
  units: "metres",
  coordinates: { up: "+Y", front: "+Z", origin: "ground-centre" },
  sourceNotes: [
    "Igor's verdict owns the concept: slender small-Hindenburg hull (a01's chubby L/D 3.9 read as the city zeppelin - rejected), red+white helicopter stylization WITHOUT exact livery, helicopter-form pod merged into the hull, no main rotor, skids for a plank platform.",
    "a02: hull slimmed to L/D 5.1; gondola rebuilt as a crown/keel/width loft - rounded chin, wrap cockpit glazing, tail boom rising into the hull (a01's flat-slab hut rejected: 'не вертолётных обводов ни с какой стороны').",
    "Hull 11.2 m = terminal wagon-airship 15 m / 1.34; summit plateau 50-60 m keeps it noticeable, not dominant.",
  ],
  dimensions: {
    hullLength: KALLUR_AIRSHIP_LENGTH,
    hullDiameter: KALLUR_AIRSHIP_RADIUS * 2,
    axisHeight: KALLUR_AIRSHIP_AXIS_Y,
    cabinFloorY: FLOOR_Y,
    finSpan: 1.45,
  },
  labMetrics: [
    { label: "Hull length", value: KALLUR_AIRSHIP_LENGTH, unit: "m", decimals: 1 },
    { label: "Hull diameter", value: KALLUR_AIRSHIP_RADIUS * 2, unit: "m", decimals: 2 },
    { label: "Fineness L/D", value: KALLUR_AIRSHIP_LENGTH / (KALLUR_AIRSHIP_RADIUS * 2), decimals: 1 },
    { label: "Parts", value: parts.length, decimals: 0 },
  ],
  anchors: {
    "skid-plane": point(0, 0, 0),
    "cabin-door-l": point(0.71, 1.2, (DOORWAY_Z[0] + DOORWAY_Z[1]) / 2),
    "nose-tip": point(0, KALLUR_AIRSHIP_AXIS_Y, HALF_LENGTH),
  },
  motionConstraints: {
    frozen: "propellers, rudders",
    excluded: "flight, wind, docking",
  },
  labEnvironment: { floorRadius: 14, gridSize: 20, gridDivisions: 20 },
  parts,
  views: [
    {
      id: "front",
      label: "Front: chin glazing, skids, pod symmetry",
      projection: "orthographic",
      position: point(0, 2.4, 18),
      target: point(0, 2.4, 0),
      orthoHeight: 6,
    },
    {
      id: "profile",
      label: "Profile: hull program, cheatline, merged pod",
      projection: "orthographic",
      position: point(18, 2.3, 0),
      target: point(0, 2.3, 0),
      orthoHeight: 12.2,
    },
    {
      id: "rear",
      label: "Rear: cruciform fins",
      projection: "orthographic",
      position: point(0, 2.7, -18),
      target: point(0, 2.7, 0),
      orthoHeight: 6.6,
    },
    {
      id: "three-quarter",
      label: "Three-quarter: mass, fusion, livery",
      projection: "perspective",
      position: point(9.5, 4.2, 10.5),
      target: point(0, 2.3, 0),
      fov: 32,
    },
    {
      id: "tail-three-quarter",
      label: "Tail three-quarter: fins and boom run-out",
      projection: "perspective",
      position: point(-8.5, 4.4, -9.5),
      target: point(0, 2.6, -1.5),
      fov: 32,
    },
    {
      id: "high-three-quarter",
      label: "High three-quarter: no rotor, white back, red lane",
      projection: "perspective",
      position: point(6.5, 9.5, 8),
      target: point(0, 2.6, 0),
      fov: 32,
    },
    {
      id: "gondola-detail",
      label: "Gondola: chin loft, wrap canopy, door, real openings",
      projection: "perspective",
      position: point(4.4, 1.7, 4.6),
      target: point(0, 1.35, 0.5),
      fov: 30,
    },
    {
      id: "gondola-cutaway",
      label: "Gondola cutaway: glazing hidden, openings are voids",
      projection: "perspective",
      position: point(4.4, 1.7, 4.6),
      target: point(0, 1.35, 0.5),
      fov: 30,
      hiddenGroups: ["airship-glazing"],
    },
  ],
};
