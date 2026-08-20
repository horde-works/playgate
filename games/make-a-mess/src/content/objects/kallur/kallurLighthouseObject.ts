import type {
  ObjectLabModel,
  ObjectLabPart,
  ObjectPoint,
  ObjectTriangle,
} from "../dutchWindmills/objectModel.ts";

/**
 * Kallur lighthouse — canonical Object Lab study.
 *
 * Evidence: docs/kallur/lighthouse-reference/evidence-card-01. Sources own
 * the lantern construction (reference-13: diamond-lattice glazing, red
 * parapet drum, gallery with railing, red cone with a ball finial, entry
 * annex) and the composition share (reference-01); the world passport owns
 * the EXACT total height of 7.0 m and the 1:12 lighthouse:wall program.
 * Authored deviation, reserved for Igor's verdict: the shaft is slightly
 * stockier than the real tower (about 1:3 diameter:height against 1:4.5)
 * because the island is scale-compressed and the mass must read in the
 * hero frame; the literal slender variant is one SHAFT_RADIUS away.
 *
 * The lamp follows the light canon: the glazing is ordinary transparent
 * glass and owns no source; the contained bulb owns the only light.
 */

const SEGMENTS = 16;
const TAU = Math.PI * 2;

export const KALLUR_LIGHTHOUSE_TOTAL_HEIGHT = 7.0;
export const SHAFT_RADIUS = 1.15;
const SHAFT_WALL = 0.18;
const SHAFT_BASE_Y = 0.35;
const SHAFT_TOP_Y = 4.3;
const PLINTH_RADIUS = 1.45;
const CORNICE_TOP_Y = 4.55;
const CORNICE_RADIUS = 1.5;
export const DECK_RADIUS = 1.72;
const DECK_TOP_Y = 4.67;
export const RAIL_RADIUS = 1.62;
const RAIL_TOP_Y = 5.47;
const PARAPET_RADIUS = 0.98;
const PARAPET_TOP_Y = 5.25;
export const GLAZING_RADIUS = 0.95;
const GLAZING_TOP_Y = 6.15;
export const ROOF_BASE_RADIUS = 1.12;
const ROOF_PEAK_Y = 6.85;
const BULB_Y = 5.6;

const WINDOW_WIDTH = 0.38;
const WINDOW_HEIGHT = 0.6;
const WINDOW_CENTERS_Y = [1.7, 3.0] as const;

const point = (x: number, y: number, z: number): ObjectPoint => [x, y, z];
const polar = (radius: number, y: number, angle: number): ObjectPoint => [
  radius * Math.sin(angle),
  y,
  radius * Math.cos(angle),
];

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
  light?: ObjectLabPart["light"],
) => {
  parts.push({
    kind: "cylinder",
    id,
    group,
    material,
    from,
    to,
    radius,
    radialSegments: SEGMENTS,
    light,
  });
};

/** Outward-wound conical band between two circles (open tube). */
const bandGeometry = (
  radiusBottom: number,
  yBottom: number,
  radiusTop: number,
  yTop: number,
): { vertices: ObjectPoint[]; triangles: ObjectTriangle[] } => {
  const vertices: ObjectPoint[] = [];
  const triangles: ObjectTriangle[] = [];
  for (let index = 0; index <= SEGMENTS; index += 1) {
    const angle = (index / SEGMENTS) * TAU;
    vertices.push(polar(radiusBottom, yBottom, angle));
    vertices.push(polar(radiusTop, yTop, angle));
  }
  for (let index = 0; index < SEGMENTS; index += 1) {
    const b0 = index * 2;
    const t0 = b0 + 1;
    const b1 = b0 + 2;
    const t1 = b0 + 3;
    triangles.push([b0, b1, t1], [b0, t1, t0]);
  }
  return { vertices, triangles };
};

/** Horizontal annulus (or full disc when innerRadius is 0), +Y face up. */
const annulusGeometry = (
  innerRadius: number,
  outerRadius: number,
  y: number,
  faceUp: boolean,
): { vertices: ObjectPoint[]; triangles: ObjectTriangle[] } => {
  const vertices: ObjectPoint[] = [];
  const triangles: ObjectTriangle[] = [];
  for (let index = 0; index <= SEGMENTS; index += 1) {
    const angle = (index / SEGMENTS) * TAU;
    vertices.push(polar(innerRadius, y, angle));
    vertices.push(polar(outerRadius, y, angle));
  }
  for (let index = 0; index < SEGMENTS; index += 1) {
    const i0 = index * 2;
    const o0 = i0 + 1;
    const i1 = i0 + 2;
    const o1 = i0 + 3;
    if (faceUp) triangles.push([i0, o1, o0], [i0, i1, o1]);
    else triangles.push([i0, o0, o1], [i0, o1, i1]);
  }
  return { vertices, triangles };
};

const addMesh = (
  id: string,
  group: string,
  material: ObjectLabPart["material"],
  geometry: { vertices: readonly ObjectPoint[]; triangles: readonly ObjectTriangle[] },
  doubleSided = false,
) => {
  parts.push({
    kind: "mesh",
    id,
    group,
    material,
    vertices: geometry.vertices,
    triangles: geometry.triangles,
    doubleSided,
  });
};

/** Axis-aligned box as an outward-wound mesh (for merged joinery parts). */
const boxGeometry = (
  center: ObjectPoint,
  size: ObjectPoint,
): { vertices: ObjectPoint[]; triangles: ObjectTriangle[] } => {
  const [cx, cy, cz] = center;
  const [hx, hy, hz] = [size[0] / 2, size[1] / 2, size[2] / 2];
  const vertices: ObjectPoint[] = [
    point(cx - hx, cy - hy, cz - hz),
    point(cx + hx, cy - hy, cz - hz),
    point(cx + hx, cy + hy, cz - hz),
    point(cx - hx, cy + hy, cz - hz),
    point(cx - hx, cy - hy, cz + hz),
    point(cx + hx, cy - hy, cz + hz),
    point(cx + hx, cy + hy, cz + hz),
    point(cx - hx, cy + hy, cz + hz),
  ];
  const triangles: ObjectTriangle[] = [
    [0, 2, 1], [0, 3, 2],
    [4, 5, 6], [4, 6, 7],
    [0, 1, 5], [0, 5, 4],
    [3, 7, 6], [3, 6, 2],
    [0, 4, 7], [0, 7, 3],
    [1, 2, 6], [1, 6, 5],
  ];
  return { vertices, triangles };
};

const mergeGeometry = (
  pieces: readonly { vertices: readonly ObjectPoint[]; triangles: readonly ObjectTriangle[] }[],
): { vertices: ObjectPoint[]; triangles: ObjectTriangle[] } => {
  const vertices: ObjectPoint[] = [];
  const triangles: ObjectTriangle[] = [];
  for (const piece of pieces) {
    const base = vertices.length;
    vertices.push(...piece.vertices);
    triangles.push(
      ...piece.triangles.map(
        ([a, b, c]) => [a + base, b + base, c + base] as ObjectTriangle,
      ),
    );
  }
  return { vertices, triangles };
};

// --- 1. Plinth -------------------------------------------------------------
addCylinder(
  "plinth",
  "lighthouse-foundation",
  "foundation",
  point(0, 0, 0),
  point(0, SHAFT_BASE_Y, 0),
  PLINTH_RADIUS,
);

// --- 2. Shaft shell: 16 facets, real window voids on the south facet ------
// The front (+Z) facet carries both windows; its wall is built as strips
// around genuine apertures. Every other facet is one chord box.
const shaftMidRadius = SHAFT_RADIUS - SHAFT_WALL / 2;
const facetChord = 2 * shaftMidRadius * Math.sin(Math.PI / SEGMENTS) + 0.015;
const shaftHeight = SHAFT_TOP_Y - SHAFT_BASE_Y;
for (let index = 0; index < SEGMENTS; index += 1) {
  const angle = (index / SEGMENTS) * TAU;
  const center = polar(shaftMidRadius, SHAFT_BASE_Y + shaftHeight / 2, angle);
  if (index === 0) continue; // the windowed facet is built from strips below
  addBox(
    `shaft-facet-${index}`,
    "lighthouse-shaft",
    "paint-light",
    center,
    point(facetChord, shaftHeight, SHAFT_WALL),
    point(0, angle, 0),
  );
}

// Windowed facet (+Z): sill-to-lintel strips leave two true apertures.
{
  const z = shaftMidRadius;
  const jambWidth = (facetChord - WINDOW_WIDTH) / 2;
  const spans: Array<readonly [number, number]> = [];
  let cursor = SHAFT_BASE_Y;
  for (const centerY of WINDOW_CENTERS_Y) {
    spans.push([cursor, centerY - WINDOW_HEIGHT / 2]);
    cursor = centerY + WINDOW_HEIGHT / 2;
  }
  spans.push([cursor, SHAFT_TOP_Y]);
  spans.forEach(([from, to], index) => {
    addBox(
      `shaft-front-band-${index}`,
      "lighthouse-shaft",
      "paint-light",
      point(0, (from + to) / 2, z),
      point(facetChord, to - from, SHAFT_WALL),
    );
  });
  WINDOW_CENTERS_Y.forEach((centerY, index) => {
    for (const side of [-1, 1]) {
      addBox(
        `shaft-window-${index}-jamb-${side > 0 ? "r" : "l"}`,
        "lighthouse-shaft",
        "paint-light",
        point(side * (WINDOW_WIDTH / 2 + jambWidth / 2), centerY, z),
        point(jambWidth, WINDOW_HEIGHT, SHAFT_WALL),
      );
    }
    // Frame cross + glazing recessed to the inner third of the wall.
    addBox(
      `shaft-window-${index}-glass`,
      "lighthouse-windows",
      "glazing",
      point(0, centerY, z - SHAFT_WALL * 0.25),
      point(WINDOW_WIDTH - 0.06, WINDOW_HEIGHT - 0.06, 0.02),
    );
    // The cross is ONE joined frame member standing on the sill band —
    // a loose transom flush between jambs hangs in the solver's eyes
    // exactly as it would on a real site before the glue sets.
    addMesh(
      `shaft-window-${index}-cross`,
      "lighthouse-windows",
      "paint-light",
      mergeGeometry([
        boxGeometry(
          point(0, centerY, z - SHAFT_WALL * 0.18),
          point(0.04, WINDOW_HEIGHT, 0.03),
        ),
        boxGeometry(
          point(0, centerY, z - SHAFT_WALL * 0.18),
          point(WINDOW_WIDTH + 0.04, 0.04, 0.03),
        ),
      ]),
    );
  });
}

// Interior depth behind the panes: a dark liner drum.
addCylinder(
  "shaft-liner",
  "lighthouse-interior",
  "dark-recess",
  point(0, SHAFT_BASE_Y + 0.05, 0),
  point(0, SHAFT_TOP_Y - 0.05, 0),
  SHAFT_RADIUS - SHAFT_WALL - 0.08,
);

// --- 3. Entry annex (south), real door void ---------------------------------
{
  const width = 1.35;
  const depth = 1.15;
  const wallT = 0.14;
  const wallTop = 1.75;
  const ridgeY = 2.05;
  const zFront = SHAFT_RADIUS + depth - wallT / 2;
  const zMid = SHAFT_RADIUS + depth / 2;
  const doorW = 0.62;
  const doorH = 1.45;
  const jamb = (width - doorW) / 2;
  for (const side of [-1, 1]) {
    // Jambs stop at the lintel seat: the lintel BEARS on them (stack).
    // In plan they BUTT against the side wall's inner face — running them
    // to the corner made two coplanar face pairs fight at any distance.
    const jambSpan = jamb - wallT;
    addBox(
      `annex-front-jamb-${side > 0 ? "r" : "l"}`,
      "lighthouse-annex",
      "paint-light",
      point(side * (doorW / 2 + jambSpan / 2), doorH / 2, zFront),
      point(jambSpan, doorH, wallT),
    );
    addBox(
      `annex-side-${side > 0 ? "r" : "l"}`,
      "lighthouse-annex",
      "paint-light",
      point(side * (width / 2 - wallT / 2), wallTop / 2, zMid),
      point(wallT, wallTop, depth),
    );
  }
  addBox(
    "annex-front-lintel",
    "lighthouse-annex",
    "paint-light",
    point(0, doorH + (wallTop - doorH) / 2, zFront),
    // The lintel bears 6 cm into each jamb, concealed inside the solid.
    point(doorW + 0.12, wallTop - doorH, wallT),
  );
  addBox(
    "annex-door-leaf",
    "lighthouse-annex",
    "timber-dark",
    point(0, doorH / 2, zFront - 0.08),
    point(doorW - 0.04, doorH - 0.02, 0.05),
  );
  // Gable infill above the walls and the two roof slabs. The slab on the
  // +X side RISES toward the ridge at x = 0: its rotation lifts the inner
  // edge (a negative roll for +X), otherwise the pair folds into a valley.
  const slope = Math.atan2(ridgeY - wallTop, width / 2);
  const slabLength = Math.hypot(width / 2, ridgeY - wallTop) + 0.14;
  for (const side of [-1, 1]) {
    addBox(
      `annex-roof-${side > 0 ? "r" : "l"}`,
      "lighthouse-annex",
      "roof-dark",
      point(side * width * 0.25, (wallTop + ridgeY) / 2, zMid),
      point(slabLength, 0.06, depth + 0.18),
      point(0, 0, -side * slope),
    );
  }
  // The gable is a TRIANGULAR pediment under the slopes — a rectangle
  // pierced the roof skin at its top corners (Igor's acceptance note).
  {
    const zBack = zFront - wallT / 2;
    const zFace = zFront + wallT / 2;
    const apexY = ridgeY - 0.04;
    const vertices: ObjectPoint[] = [
      point(-width / 2, wallTop, zFace),
      point(width / 2, wallTop, zFace),
      point(0, apexY, zFace),
      point(-width / 2, wallTop, zBack),
      point(width / 2, wallTop, zBack),
      point(0, apexY, zBack),
    ];
    const triangles: ObjectTriangle[] = [
      [0, 1, 2],
      [4, 3, 5],
      [0, 2, 5], [0, 5, 3],
      [1, 4, 5], [1, 5, 2],
      [0, 3, 4], [0, 4, 1],
    ];
    addMesh("annex-gable", "lighthouse-annex", "paint-light", { vertices, triangles });
  }
}

// --- 4. Cornice, gallery deck, railing -------------------------------------
addMesh(
  "cornice",
  "lighthouse-gallery",
  "paint-light",
  mergeGeometry([
    bandGeometry(SHAFT_RADIUS, SHAFT_TOP_Y, CORNICE_RADIUS, CORNICE_TOP_Y),
  ]),
);
addMesh(
  "gallery-deck",
  "lighthouse-gallery",
  "paint-light",
  mergeGeometry([
    annulusGeometry(0, DECK_RADIUS, DECK_TOP_Y, true),
    annulusGeometry(0, DECK_RADIUS, CORNICE_TOP_Y, false),
    bandGeometry(DECK_RADIUS, CORNICE_TOP_Y, DECK_RADIUS, DECK_TOP_Y),
  ]),
);
const RAIL_POSTS = 12;
for (let index = 0; index < RAIL_POSTS; index += 1) {
  const angle = (index / RAIL_POSTS) * TAU;
  addBeam(
    `rail-post-${index}`,
    "lighthouse-gallery",
    "metal",
    polar(RAIL_RADIUS, DECK_TOP_Y, angle),
    polar(RAIL_RADIUS, RAIL_TOP_Y, angle),
    0.05,
    0.05,
  );
}
// The two rails are single faceted bands, not sixteen chord beams — the
// part budget belongs to the silhouette, not to repetition.
addMesh(
  "rail-top-band",
  "lighthouse-gallery",
  "metal",
  bandGeometry(RAIL_RADIUS, RAIL_TOP_Y - 0.06, RAIL_RADIUS, RAIL_TOP_Y),
  true,
);
addMesh(
  "rail-mid-band",
  "lighthouse-gallery",
  "metal",
  bandGeometry(RAIL_RADIUS, DECK_TOP_Y + 0.36, RAIL_RADIUS, DECK_TOP_Y + 0.4),
  true,
);

// --- 5. Lantern: parapet drum, glazing with diamond lattice, lamp ----------
addCylinder(
  "lantern-parapet",
  "lighthouse-lantern",
  "paint-accent",
  point(0, DECK_TOP_Y, 0),
  point(0, PARAPET_TOP_Y, 0),
  PARAPET_RADIUS,
);
const GLAZING_BAYS = 8;
const paneChord = 2 * GLAZING_RADIUS * Math.sin(Math.PI / GLAZING_BAYS);
// Half-bay offset: a PANE faces due south, so the bulb reads through clear
// glass from the entry side; a corner post on the axis blinded the lamp.
const GLAZING_OFFSET = Math.PI / GLAZING_BAYS;
for (let index = 0; index < GLAZING_BAYS; index += 1) {
  const angle = (index / GLAZING_BAYS) * TAU + GLAZING_OFFSET;
  const next = ((index + 1) / GLAZING_BAYS) * TAU + GLAZING_OFFSET;
  const mid = (angle + next) / 2;
  const center = polar(
    GLAZING_RADIUS * Math.cos(Math.PI / GLAZING_BAYS),
    (PARAPET_TOP_Y + GLAZING_TOP_Y) / 2,
    mid,
  );
  parts.push({
    kind: "box",
    id: `lantern-pane-${index}`,
    group: "lighthouse-glazing",
    material: "lamp-glass",
    center,
    size: point(paneChord - 0.02, GLAZING_TOP_Y - PARAPET_TOP_Y, 0.025),
    rotation: point(0, mid, 0),
  });
  // Corner post at the bay joint plus the X-brace pair of the diamond net.
  addBeam(
    `lantern-post-${index}`,
    "lighthouse-lantern",
    "paint-accent",
    polar(GLAZING_RADIUS, PARAPET_TOP_Y, angle),
    polar(GLAZING_RADIUS, GLAZING_TOP_Y, angle),
    0.07,
    0.07,
  );
  addBeam(
    `lantern-brace-a-${index}`,
    "lighthouse-lantern",
    "paint-accent",
    polar(GLAZING_RADIUS + 0.015, PARAPET_TOP_Y + 0.02, angle),
    polar(GLAZING_RADIUS + 0.015, GLAZING_TOP_Y - 0.02, next),
    0.035,
    0.03,
  );
  addBeam(
    `lantern-brace-b-${index}`,
    "lighthouse-lantern",
    "paint-accent",
    polar(GLAZING_RADIUS + 0.015, PARAPET_TOP_Y + 0.02, next),
    polar(GLAZING_RADIUS + 0.015, GLAZING_TOP_Y - 0.02, angle),
    0.035,
    0.03,
  );
}
// Top and bottom glazing rings: two faceted bands instead of sixteen beams.
addMesh(
  "lantern-ring-bottom",
  "lighthouse-lantern",
  "paint-accent",
  bandGeometry(GLAZING_RADIUS + 0.02, PARAPET_TOP_Y, GLAZING_RADIUS + 0.02, PARAPET_TOP_Y + 0.07),
  true,
);
addMesh(
  "lantern-ring-top",
  "lighthouse-lantern",
  "paint-accent",
  bandGeometry(GLAZING_RADIUS + 0.02, GLAZING_TOP_Y - 0.07, GLAZING_RADIUS + 0.02, GLAZING_TOP_Y),
  true,
);
addCylinder(
  "lamp-pedestal",
  "lighthouse-lamp",
  "metal",
  point(0, PARAPET_TOP_Y, 0),
  point(0, BULB_Y - 0.05, 0),
  0.09,
);
addCylinder(
  "lamp-bulb",
  "lighthouse-lamp",
  "lamp-bulb",
  point(0, BULB_Y - 0.05, 0),
  point(0, BULB_Y + 0.17, 0),
  0.12,
  {
    position: point(0, BULB_Y + 0.06, 0),
    color: "#ffe9c4",
    distance: 70,
    intensity: 2.6,
    dayIntensityFactor: 0,
    poolPriority: 10,
    localPoolCapacity: 1,
    poolGroupId: "kallur-lighthouse",
    reservePoolGroup: true,
  },
);

// --- 6. Roof cone, collar, finial ball -------------------------------------
addMesh(
  "roof-cone",
  "lighthouse-roof",
  "paint-accent",
  mergeGeometry([
    bandGeometry(ROOF_BASE_RADIUS, GLAZING_TOP_Y, 0.16, ROOF_PEAK_Y),
    annulusGeometry(GLAZING_RADIUS - 0.05, ROOF_BASE_RADIUS, GLAZING_TOP_Y, false),
  ]),
);
addCylinder(
  "roof-collar",
  "lighthouse-roof",
  "paint-accent",
  point(0, ROOF_PEAK_Y, 0),
  point(0, ROOF_PEAK_Y + 0.05, 0),
  0.09,
);
addMesh(
  "roof-finial",
  "lighthouse-roof",
  "paint-accent",
  mergeGeometry([
    bandGeometry(0.03, ROOF_PEAK_Y + 0.05, 0.14, ROOF_PEAK_Y + 0.1),
    bandGeometry(0.14, ROOF_PEAK_Y + 0.1, 0.03, KALLUR_LIGHTHOUSE_TOTAL_HEIGHT),
  ]),
);

export const kallurLighthouseParts: readonly ObjectLabPart[] = parts;

export const kallurLighthouseObject: ObjectLabModel = {
  id: "kallur-lighthouse",
  revision: "lighthouse-a06-2026-08-20",
  title: "Kallur lighthouse",
  units: "metres",
  coordinates: { up: "+Y", front: "+Z", origin: "ground-centre" },
  sourceNotes: [
    "reference-13 owns the lantern construction: diamond lattice, red drum, gallery, cone with ball finial, entry annex.",
    "World passport owns the exact 7.0 m total height and the 1:12 program.",
    "Authored: stocky 1:3 shaft for the compressed island; slender variant is one SHAFT_RADIUS change (Igor's reserved fork).",
  ],
  dimensions: {
    totalHeight: KALLUR_LIGHTHOUSE_TOTAL_HEIGHT,
    galleryDeckY: DECK_TOP_Y,
    galleryOuterDiameter: DECK_RADIUS * 2,
    lanternGlazingRadius: GLAZING_RADIUS,
    roofBaseRadius: ROOF_BASE_RADIUS,
    shaftRadius: SHAFT_RADIUS,
  },
  labMetrics: [
    { label: "Total height", value: KALLUR_LIGHTHOUSE_TOTAL_HEIGHT, unit: "m", decimals: 2 },
    { label: "Shaft diameter", value: SHAFT_RADIUS * 2, unit: "m", decimals: 2 },
    { label: "Gallery diameter", value: DECK_RADIUS * 2, unit: "m", decimals: 2 },
    { label: "Parts", value: parts.length, decimals: 0 },
  ],
  anchors: {
    "pad-centre": point(0, 0, 0),
    "lamp-bulb": point(0, BULB_Y + 0.06, 0),
    "entry-door": point(0, 0.75, SHAFT_RADIUS + 1.1),
  },
  labEnvironment: { floorRadius: 12, gridSize: 16, gridDivisions: 16 },
  parts,
  views: [
    {
      id: "front",
      label: "Front (south): windows, door, full program",
      projection: "orthographic",
      position: point(0, 3.4, 16),
      target: point(0, 3.4, 0),
      orthoHeight: 8.2,
    },
    {
      id: "profile",
      label: "Profile (east)",
      projection: "orthographic",
      position: point(16, 3.4, 0),
      target: point(0, 3.4, 0),
      orthoHeight: 8.2,
    },
    {
      id: "three-quarter",
      label: "Three-quarter: mass and gallery",
      projection: "perspective",
      position: point(7.5, 4.8, 9.5),
      target: point(0, 3.1, 0),
      fov: 28,
    },
    {
      id: "high-three-quarter",
      label: "High three-quarter (reference-13 angle)",
      projection: "perspective",
      position: point(4.6, 9.8, 6.4),
      target: point(0, 4.9, 0),
      fov: 30,
    },
    {
      id: "lantern-detail",
      label: "Lantern: lattice, rings, bulb behind glass",
      projection: "perspective",
      position: point(2.7, 6.6, 3.6),
      target: point(0, 5.7, 0),
      fov: 26,
    },
    {
      id: "lantern-cutaway",
      label: "Lantern cutaway: pedestal and bulb (glazing+lattice hidden)",
      projection: "perspective",
      position: point(2.7, 6.6, 3.6),
      target: point(0, 5.7, 0),
      fov: 26,
      hiddenGroups: ["lighthouse-glazing", "lighthouse-lantern"],
    },
    {
      id: "night-close",
      label: "Night: the bulb through ordinary glass",
      projection: "perspective",
      position: point(3.4, 6.2, 4.4),
      target: point(0, 5.6, 0),
      fov: 28,
      lighting: "night",
    },
    {
      id: "night-wide",
      label: "Night wide: lamp reads at distance",
      projection: "perspective",
      position: point(11, 4.6, 13),
      target: point(0, 4.2, 0),
      fov: 26,
      lighting: "night",
    },
  ],
};
