import type {
  ObjectLabModel,
  ObjectLabPart,
  ObjectMaterialId,
  ObjectPoint,
} from "../dutchWindmills/objectModel.ts";

const point = (x: number, y: number, z: number): ObjectPoint => [x, y, z];
const parts: ObjectLabPart[] = [];

const addBox = (
  id: string,
  group: string,
  material: ObjectMaterialId,
  center: ObjectPoint,
  size: ObjectPoint,
  rotation?: ObjectPoint,
) => parts.push({ kind: "box", id, group, material, center, size, rotation });

const addBeam = (
  id: string,
  group: string,
  material: ObjectMaterialId,
  from: ObjectPoint,
  to: ObjectPoint,
  width: number,
  depth = width,
) => parts.push({ kind: "beam", id, group, material, from, to, width, depth });

const addCylinder = (
  id: string,
  group: string,
  material: ObjectMaterialId,
  from: ObjectPoint,
  to: ObjectPoint,
  radius: number,
  radialSegments = 10,
) => parts.push({ kind: "cylinder", id, group, material, from, to, radius, radialSegments });

const addMesh = (
  id: string,
  group: string,
  material: ObjectMaterialId,
  vertices: ObjectPoint[],
  triangles: Array<readonly [number, number, number]>,
  doubleSided = false,
) => parts.push({ kind: "mesh", id, group, material, vertices, triangles, doubleSided });

const addOrganicCrown = (
  id: string,
  group: string,
  center: ObjectPoint,
  size: ObjectPoint,
  phase = 0,
) => {
  const vertices: ObjectPoint[] = [
    point(center[0], center[1] - size[1] / 2, center[2]),
    point(center[0], center[1] + size[1] / 2, center[2]),
  ];
  const segments = 8;
  for (const [ring, yFactor, radiusFactor] of [[0, -0.24, 1], [1, 0.26, 0.82]] as const) {
    for (let index = 0; index < segments; index += 1) {
      const angle = phase + (index / segments) * Math.PI * 2 + ring * 0.18;
      const irregular = 0.88 + ((index * 7 + ring * 3) % 5) * 0.055;
      vertices.push(point(
        center[0] + Math.cos(angle) * size[0] * 0.5 * radiusFactor * irregular,
        center[1] + size[1] * yFactor + ((index % 3) - 1) * 0.035,
        center[2] + Math.sin(angle) * size[2] * 0.5 * radiusFactor * irregular,
      ));
    }
  }
  const triangles: Array<readonly [number, number, number]> = [];
  for (let index = 0; index < segments; index += 1) {
    const next = (index + 1) % segments;
    const lower = 2 + index;
    const lowerNext = 2 + next;
    const upper = 2 + segments + index;
    const upperNext = 2 + segments + next;
    triangles.push([0, lowerNext, lower], [lower, lowerNext, upperNext], [lower, upperNext, upper], [upper, upperNext, 1]);
  }
  addMesh(id, group, "foliage", vertices, triangles, true);
};

const bridgeGroups = ["bridge-masonry", "bridge-primary", "bridge-deck", "bridge-rails"] as const;
const fieldGroups = ["field-earth", "field-crops"] as const;
const wallGroups = ["retaining-masonry"] as const;
const revetmentGroups = ["canal-revetment"] as const;
const pathGroups = ["path-cross-section"] as const;
const willowGroups = ["pollard-willow"] as const;
const fenceGroups = ["polder-fence"] as const;
const hedgeGroups = ["field-hedge"] as const;

const bridgeProfile = [
  [-2.8, 0.78], [-1.9, 0.96], [-0.95, 1.12], [0, 1.18],
  [0.95, 1.12], [1.9, 0.96], [2.8, 0.78],
] as const;

// Two coursed field-stone abutments. Every block bears on the previous course;
// the timber stringers land on cap stones instead of terminating in air.
for (const bank of [-1, 1] as const) {
  const bankZ = bank * 3.18;
  for (let course = 0; course < 3; course += 1) {
    const count = course % 2 === 0 ? 5 : 4;
    const blockWidth = 3.25 / count;
    for (let index = 0; index < count; index += 1) {
      const x = -1.625 + blockWidth * (index + 0.5);
      addBox(
        `bridge-abutment:${bank}:course:${course}:block:${index}`,
        "bridge-masonry",
        "stone",
        point(x, 0.18 + course * 0.36, bankZ),
        point(blockWidth - 0.025, 0.34, 0.86),
      );
    }
  }
  for (const x of [-1.25, -0.42, 0.42, 1.25]) {
    addBox(`bridge-cap:${bank}:${x}`, "bridge-masonry", "stone", point(x, 1.18, bankZ - bank * 0.08), point(0.78, 0.22, 1.04));
  }
}

for (const x of [-0.82, 0.82]) {
  for (let index = 1; index < bridgeProfile.length; index += 1) {
    const [z0, y0] = bridgeProfile[index - 1];
    const [z1, y1] = bridgeProfile[index];
    addBeam(`bridge-stringer:${x}:${index - 1}`, "bridge-primary", "timber-dark", point(x, y0 - 0.2, z0), point(x, y1 - 0.2, z1), 0.24, 0.28);
  }
}
for (let index = 0; index < 15; index += 1) {
  const z = -2.8 + index * 0.4;
  const segment = bridgeProfile.findIndex(([profileZ]) => profileZ >= z);
  const hi = Math.max(1, segment);
  const [z0, y0] = bridgeProfile[hi - 1];
  const [z1, y1] = bridgeProfile[hi];
  const t = Math.max(0, Math.min(1, (z - z0) / (z1 - z0)));
  const y = y0 + (y1 - y0) * t;
  const pitch = -Math.atan2(y1 - y0, z1 - z0);
  addBox(`bridge-deck:${index}`, "bridge-deck", "timber-mid", point(0, y, z), point(2.52, 0.12, 0.43), point(pitch, 0, 0));
}
for (const side of [-1, 1] as const) {
  const x = side * 1.22;
  for (const [index, [z, y]] of bridgeProfile.entries()) {
    addBeam(`bridge-post:${side}:${index}`, "bridge-rails", "timber-dark", point(x, y + 0.03, z), point(x, y + 1.02, z), 0.13, 0.13);
    if (index > 0) {
      const [previousZ, previousY] = bridgeProfile[index - 1];
      addBeam(`bridge-handrail:${side}:${index - 1}`, "bridge-rails", "timber-mid", point(x, previousY + 1.02, previousZ), point(x, y + 1.02, z), 0.13, 0.15);
      addBeam(`bridge-midrail:${side}:${index - 1}`, "bridge-rails", "timber-mid", point(x, previousY + 0.54, previousZ), point(x, y + 0.54, z), 0.085, 0.085);
    }
  }
}

// Six-metre flower-bed module: raised ridges, individual stems and blossoms.
for (const x of [-1.65, -0.55, 0.55, 1.65]) {
  addBox(`field-ridge:${x}`, "field-earth", "soil-bed", point(x, 0.22, 0), point(0.82, 0.44, 6));
  for (let row = 0; row < 13; row += 1) {
    const z = -2.76 + row * 0.46;
    addBeam(`field-stem:${x}:${row}`, "field-crops", "foliage", point(x, 0.42, z), point(x, 0.78 + (row % 3) * 0.035, z), 0.045, 0.045);
    const flowerMaterial: ObjectMaterialId = x < -1 ? "flower-red" : x < 0 ? "flower-yellow" : x < 1 ? "flower-purple" : "flower-blue";
    addBox(`field-flower:${x}:${row}`, "field-crops", flowerMaterial, point(x, 0.82 + (row % 3) * 0.035, z), point(0.18, 0.14, 0.18), point(0, row * 0.71, 0));
  }
}

// Alternating bond and cap stones make the retaining wall a constructible
// module rather than a single masonry-coloured slab.
for (let course = 0; course < 4; course += 1) {
  const count = course % 2 === 0 ? 6 : 5;
  const width = 5 / count;
  for (let index = 0; index < count; index += 1) {
    addBox(`wall-course:${course}:block:${index}`, "retaining-masonry", "stone", point(-2.5 + width * (index + 0.5), 0.17 + course * 0.34, 0), point(width - 0.028, 0.32, 0.54));
  }
}
for (let index = 0; index < 5; index += 1) addBox(`wall-cap:${index}`, "retaining-masonry", "stone", point(-2 + index, 1.47, 0), point(0.96, 0.22, 0.7));

// Timber sheet piles are tied by walers and landward anchors; the water itself
// is not treated as structural support.
for (let index = 0; index < 13; index += 1) {
  const x = -3 + index * 0.5;
  addBox(`revetment-sheet:${index}`, "canal-revetment", "timber-mid", point(x, 0.04, 0), point(0.48, 1.75, 0.18));
  if (index % 3 === 0) {
    addBeam(`revetment-post:${index}`, "canal-revetment", "timber-dark", point(x, -0.78, 0.12), point(x, 1.2, 0.12), 0.18, 0.18);
    addBeam(`revetment-anchor:${index}`, "canal-revetment", "timber-dark", point(x, 0.58, 0.1), point(x, 0.18, 1.25), 0.13, 0.13);
  }
}
for (const y of [-0.2, 0.66]) addBeam(`revetment-waler:${y}`, "canal-revetment", "timber-dark", point(-3.2, y, -0.14), point(3.2, y, -0.14), 0.16, 0.18);

addBox("path-subbase", "path-cross-section", "earth", point(0, 0.1, 0), point(2.5, 0.2, 6));
addBox("path-shell", "path-cross-section", "shell-path", point(0, 0.25, 0), point(2.2, 0.1, 6));
for (const side of [-1, 1] as const) addBox(`path-shoulder:${side}`, "path-cross-section", "grass", point(side * 1.36, 0.08, 0), point(0.52, 0.16, 6));

// Pollard willow: one old trunk and a deliberately visible crown of cut-back
// branches.  It remains a small reusable object, not a procedural tree blob.
addCylinder("willow-trunk", "pollard-willow", "timber-dark", point(0, 0, 0), point(0, 3.15, 0), 0.34, 12);
for (const [index, [x, y, z]] of [
  [-1.15, 4.15, -0.45], [1.2, 4.05, -0.3], [-0.75, 4.35, 0.85],
  [0.8, 4.28, 0.9], [0.05, 4.55, 0.12],
].entries()) {
  addCylinder(`willow-branch:${index}`, "pollard-willow", "timber-mid", point(0, 2.55, 0), point(x, y, z), 0.13, 9);
  addOrganicCrown(`willow-crown:${index}`, "pollard-willow", point(x, y + 0.12, z), point(1.65, 1.32, 1.45), index * 0.63);
}

// Six-metre field fence: four driven posts and two continuous rails.  Gates
// can later replace one bay without redrawing the rest of the boundary.
for (const x of [-3, -1, 1, 3]) {
  addCylinder(`fence-post:${x}`, "polder-fence", "timber-dark", point(x, 0, 0), point(x, 1.35, 0), 0.105, 8);
}
for (const y of [0.48, 1.03]) addBeam(`fence-rail:${y}`, "polder-fence", "timber-mid", point(-3, y, 0), point(3, y, 0), 0.095, 0.085);

// Hedgerow has a physical woody line beneath overlapping foliage crowns.  The
// overlap is biological continuity; the stems are still the load path.
for (let index = 0; index < 7; index += 1) {
  const x = -3 + index;
  addCylinder(`hedge-stem:${index}`, "field-hedge", "timber-mid", point(x, 0, 0), point(x, 1.18, 0), 0.07, 7);
  addOrganicCrown(`hedge-crown:${index}`, "field-hedge", point(x, 1.02 + (index % 2) * 0.08, 0), point(1.28, 1.5, 1.18), index * 0.47);
}

const allGroups = [
  ...bridgeGroups, ...fieldGroups, ...wallGroups, ...revetmentGroups,
  ...pathGroups, ...willowGroups, ...fenceGroups, ...hedgeGroups,
];
const hiddenExcept = (visible: readonly string[]) => allGroups.filter((group) => !visible.includes(group));

export const DUTCH_PATH_WIDTH = 2.2;
export const DUTCH_PATH_SUBBASE_WIDTH = 2.5;
export const DUTCH_BRIDGE_CLEAR_SPAN = 4.2;
export const DUTCH_BRIDGE_DECK_WIDTH = 2.52;

export const dutchLandscapeKitObject: ObjectLabModel = {
  id: "dutch-landscape-kit",
  revision: "landscape-kit-a2-2026-08-03",
  title: "Dutch polder landscape kit — bridge, masonry, beds, banks and field edges",
  units: "metres",
  coordinates: { up: "+Y", front: "+Z", origin: "ground-centre" },
  sourceNotes: [
    "RCE monument descriptions establish the bridge hierarchy used here: timber deck on beams and posts, masonry or piled bank bearings, timber rails, and iron only at joints when required.",
    "The Zaanse landscape source owns the ensemble of wooden buildings, paths, fences, canals and flowerbeds; it does not supply dimensions, so gameplay-safe widths are authored and labelled.",
    "The Openluchtmuseum garden record supports distinct working beds rather than one painted flower carpet. Ridges, stems and blossoms remain separate layers.",
  ],
  dimensions: {
    bridgeClearSpan: DUTCH_BRIDGE_CLEAR_SPAN,
    bridgeDeckWidth: DUTCH_BRIDGE_DECK_WIDTH,
    bridgeRise: 0.4,
    pathFinishedWidth: DUTCH_PATH_WIDTH,
    pathSubbaseWidth: DUTCH_PATH_SUBBASE_WIDTH,
    retainingWallModuleLength: 5,
    flowerBedModuleLength: 6,
    revetmentModuleLength: 6.4,
    fenceModuleLength: 6,
    hedgeModuleLength: 6,
    pollardWillowHeight: 5.1,
  },
  labMetrics: [
    { label: "BRIDGE CLEAR", value: DUTCH_BRIDGE_CLEAR_SPAN, decimals: 1 },
    { label: "DECK WIDTH", value: DUTCH_BRIDGE_DECK_WIDTH, decimals: 2 },
    { label: "PATH WIDTH", value: DUTCH_PATH_WIDTH, decimals: 1 },
    { label: "WALL MODULE", value: 5, decimals: 1 },
  ],
  anchors: {
    bridgeCentre: point(0, 1.18, 0),
    bridgeNorthBearing: point(0, 1.18, -3.18),
    bridgeSouthBearing: point(0, 1.18, 3.18),
    pathCentre: point(0, 0.3, 0),
  },
  motionConstraints: { staticKit: true, windSimulation: false, waterSimulation: false },
  parts,
  views: [
    { id: "bridge-front", label: "Kwakel bridge · load path and paired rails", projection: "orthographic", position: point(8.8, 3.1, 0), target: point(0, 0.75, 0), orthoHeight: 7.5, hiddenGroups: hiddenExcept(bridgeGroups) },
    { id: "bridge-profile", label: "Kwakel bridge · crown, stringers and abutments", projection: "orthographic", position: point(0, 3.0, 9), target: point(0, 0.75, 0), orthoHeight: 6.5, hiddenGroups: hiddenExcept(bridgeGroups) },
    { id: "bridge-high", label: "Kwakel bridge · deck boards meet both banks", projection: "perspective", position: point(7.5, 6.8, 8.5), target: point(0, 0.6, 0), fov: 34, hiddenGroups: hiddenExcept(bridgeGroups) },
    { id: "field-bed", label: "Working flower beds · ridges, stems and blossoms", projection: "perspective", position: point(7, 5.5, 8), target: point(0, 0.2, 0), fov: 33, hiddenGroups: hiddenExcept(fieldGroups) },
    { id: "masonry", label: "Retaining masonry · alternating bond and cap", projection: "perspective", position: point(6.5, 3.2, 5.5), target: point(0, 0.7, 0), fov: 31, hiddenGroups: hiddenExcept(wallGroups) },
    { id: "revetment", label: "Canal revetment · sheet piles, walers and anchors", projection: "perspective", position: point(6.8, 3.6, 5.8), target: point(0, 0.1, 0), fov: 32, hiddenGroups: hiddenExcept(revetmentGroups) },
    { id: "path", label: "Dry path · compacted shell over earth sub-base", projection: "perspective", position: point(5, 3.2, 7), target: point(0, 0.1, 0), fov: 34, hiddenGroups: hiddenExcept(pathGroups) },
    { id: "pollard-willow", label: "Pollard willow · trunk, cut crown and regrowth", projection: "perspective", position: point(7, 5.8, 8), target: point(0, 2.1, 0), fov: 32, hiddenGroups: hiddenExcept(willowGroups) },
    { id: "field-fence", label: "Field fence · driven posts and continuous rails", projection: "perspective", position: point(7, 3.2, 6), target: point(0, 0.65, 0), fov: 31, hiddenGroups: hiddenExcept(fenceGroups) },
    { id: "hedgerow", label: "Hedgerow · woody line beneath overlapping crowns", projection: "perspective", position: point(7, 3.7, 6), target: point(0, 0.8, 0), fov: 31, hiddenGroups: hiddenExcept(hedgeGroups) },
  ],
};

export const dutchLandscapeBridgeParts = parts.filter((part) => bridgeGroups.includes(part.group as typeof bridgeGroups[number]));
export const dutchLandscapeFieldParts = parts.filter((part) => fieldGroups.includes(part.group as typeof fieldGroups[number]));
export const dutchLandscapeWallParts = parts.filter((part) => wallGroups.includes(part.group as typeof wallGroups[number]));
export const dutchLandscapeRevetmentParts = parts.filter((part) => revetmentGroups.includes(part.group as typeof revetmentGroups[number]));
export const dutchLandscapePathParts = parts.filter((part) => pathGroups.includes(part.group as typeof pathGroups[number]));
export const dutchLandscapeWillowParts = parts.filter((part) => willowGroups.includes(part.group as typeof willowGroups[number]));
export const dutchLandscapeFenceParts = parts.filter((part) => fenceGroups.includes(part.group as typeof fenceGroups[number]));
export const dutchLandscapeHedgeParts = parts.filter((part) => hedgeGroups.includes(part.group as typeof hedgeGroups[number]));
