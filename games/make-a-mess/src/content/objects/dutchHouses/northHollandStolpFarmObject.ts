import type {
  ObjectLabModel,
  ObjectLabPart,
  ObjectMaterialId,
  ObjectPoint,
} from "../dutchWindmills/objectModel.ts";

export const STOLP_MAIN_WALL_WIDTH = 14.6;
export const STOLP_MAIN_WALL_DEPTH = 13.4;
export const STOLP_COMBINED_WALL_DEPTH = 19.3;
export const STOLP_ROOF_ENVELOPE_WIDTH = 15.44;
export const STOLP_ROOF_ENVELOPE_DEPTH = 20.53;
export const STOLP_EAVE_Y = 3.25;
export const STOLP_CROWN_Y = 10.7;
export const STOLP_VIERKANT_WIDTH = 7.4;
export const STOLP_VIERKANT_DEPTH = 7.0;
export const STOLP_TAIL_WIDTH = 5.0;
export const STOLP_TAIL_DEPTH = 7.2;
export const STOLP_CLEARANCE_RADIUS = 13.0;

const MAIN_HALF_X = STOLP_MAIN_WALL_WIDTH / 2;
const MAIN_HALF_Z = STOLP_MAIN_WALL_DEPTH / 2;
const ROOF_HALF_X = STOLP_ROOF_ENVELOPE_WIDTH / 2;
const MAIN_ROOF_FRONT_Z = 7.12;
const MAIN_ROOF_REAR_Z = -7.12;
const RIDGE_FRONT_Z = 0.55;
const RIDGE_REAR_Z = -0.55;
const VIERKANT_HALF_X = STOLP_VIERKANT_WIDTH / 2;
const VIERKANT_HALF_Z = STOLP_VIERKANT_DEPTH / 2;
const VIERKANT_PLATE_Y = 4.12;
const TAIL_CENTER_X = 3.6;
const TAIL_FRONT_Z = -5.4;
const TAIL_REAR_Z = -12.6;
const TAIL_EAVE_Y = 3.05;
const TAIL_RIDGE_Y = 4.45;

const parts: ObjectLabPart[] = [];
const point = (x: number, y: number, z: number): ObjectPoint => [x, y, z];

const addBeam = (
  id: string,
  group: string,
  material: ObjectMaterialId,
  from: ObjectPoint,
  to: ObjectPoint,
  width: number,
  depth = width,
) => parts.push({ kind: "beam", id, group, material, from, to, width, depth });

const addBox = (
  id: string,
  group: string,
  material: ObjectMaterialId,
  center: ObjectPoint,
  size: ObjectPoint,
  rotation?: ObjectPoint,
) => parts.push({ kind: "box", id, group, material, center, size, rotation });

const addMesh = (
  id: string,
  group: string,
  material: ObjectMaterialId,
  vertices: ObjectPoint[],
  triangles: Array<readonly [number, number, number]>,
  doubleSided = false,
) => parts.push({ kind: "mesh", id, group, material, vertices, triangles, doubleSided });

const solidSegments = (minimum: number, maximum: number, gaps: Array<readonly [number, number]>) => {
  const segments: Array<readonly [number, number]> = [];
  let cursor = minimum;
  for (const [gapStart, gapEnd] of [...gaps].sort((a, b) => a[0] - b[0])) {
    if (gapStart > cursor) segments.push([cursor, Math.min(gapStart, maximum)]);
    cursor = Math.max(cursor, gapEnd);
  }
  if (cursor < maximum) segments.push([cursor, maximum]);
  return segments.filter(([start, end]) => end - start > 0.02);
};

const addFrontOpening = (id: string, x: number, y: number, width: number, height: number, columns: number, rows: number) => {
  const z = MAIN_HALF_Z + 0.025;
  addBox(`${id}-opening`, "residential-openings", "opening", point(x, y, z), point(width - 0.14, height - 0.14, 0.08));
  const halfW = width / 2;
  const halfH = height / 2;
  for (const edgeX of [x - halfW, x + halfW]) {
    addBeam(`${id}-jamb-${edgeX}`, "residential-openings", "paint-light", point(edgeX, y - halfH, z + 0.08), point(edgeX, y + halfH, z + 0.08), 0.11, 0.09);
  }
  for (const edgeY of [y - halfH, y + halfH]) {
    addBeam(`${id}-rail-${edgeY}`, "residential-openings", "paint-light", point(x - halfW, edgeY, z + 0.08), point(x + halfW, edgeY, z + 0.08), 0.11, 0.09);
  }
  for (let column = 1; column < columns; column += 1) {
    const mullionX = x - halfW + width * column / columns;
    addBeam(`${id}-mullion-${column}`, "residential-openings", "paint-light", point(mullionX, y - halfH + 0.08, z + 0.09), point(mullionX, y + halfH - 0.08, z + 0.09), 0.045, 0.045);
  }
  for (let row = 1; row < rows; row += 1) {
    const transomY = y - halfH + height * row / rows;
    addBeam(`${id}-transom-${row}`, "residential-openings", "paint-light", point(x - halfW + 0.08, transomY, z + 0.09), point(x + halfW - 0.08, transomY, z + 0.09), 0.045, 0.045);
  }
};

// A continuous masonry plinth supports two visibly different wall systems.
addBox("main-brick-plinth", "foundation", "brick", point(0, 0.22, 0), point(14.8, 0.44, 13.6));
addBox("tail-brick-plinth", "foundation", "brick", point(TAIL_CENTER_X, 0.22, -9.0), point(5.2, 0.44, 7.4));

// The four-post vierkant is the primary building: roof, floor and shell are secondary to it.
for (const x of [-VIERKANT_HALF_X, VIERKANT_HALF_X]) {
  for (const z of [-VIERKANT_HALF_Z, VIERKANT_HALF_Z]) {
    addBeam(`vierkant-post-${x}-${z}`, "vierkant", "timber-dark", point(x, 0.38, z), point(x, VIERKANT_PLATE_Y, z), 0.38, 0.38);
    addBeam(`vierkant-knee-x-${x}-${z}`, "vierkant", "timber-dark", point(x, 3.0, z), point(x - Math.sign(x) * 0.95, VIERKANT_PLATE_Y, z), 0.2, 0.24);
    addBeam(`vierkant-knee-z-${x}-${z}`, "vierkant", "timber-dark", point(x, 3.0, z), point(x, VIERKANT_PLATE_Y, z - Math.sign(z) * 0.92), 0.2, 0.24);
  }
}
for (const z of [-VIERKANT_HALF_Z, VIERKANT_HALF_Z]) {
  addBeam(`vierkant-plate-x-${z}`, "vierkant", "timber-dark", point(-3.9, VIERKANT_PLATE_Y, z), point(3.9, VIERKANT_PLATE_Y, z), 0.34, 0.38);
}
for (const x of [-VIERKANT_HALF_X, VIERKANT_HALF_X]) {
  addBeam(`vierkant-plate-z-${x}`, "vierkant", "timber-dark", point(x, VIERKANT_PLATE_Y, -3.72), point(x, VIERKANT_PLATE_Y, 3.72), 0.34, 0.38);
}
for (const x of [-3.7, 0, 3.7]) {
  addBeam(`vierkant-floor-joist-${x}`, "floor-frame", "timber-mid", point(x, 0.62, -3.7), point(x, 0.62, 3.7), 0.2, 0.24);
}
for (const z of [-3.5, 0, 3.5]) {
  addBeam(`vierkant-floor-tie-${z}`, "floor-frame", "timber-mid", point(-3.9, 0.66, z), point(3.9, 0.66, z), 0.2, 0.24);
}

// Outer rafters land on the vierkant plates; inner principals rise from those same bearing points.
for (const x of [-3.7, 0, 3.7]) {
  addBeam(`front-outer-rafter-${x}`, "main-roof-frame", "timber-mid", point(x, 2.92, 6.82), point(x, 4.02, 3.5), 0.2, 0.23);
  addBeam(`front-inner-rafter-${x}`, "main-roof-frame", "timber-dark", point(x, 4.02, 3.5), point(x * 0.08, 10.34, 0.55), 0.22, 0.25);
  addBeam(`rear-outer-rafter-${x}`, "main-roof-frame", "timber-mid", point(x, 2.92, -6.82), point(x, 4.02, -3.5), 0.2, 0.23);
  addBeam(`rear-inner-rafter-${x}`, "main-roof-frame", "timber-dark", point(x, 4.02, -3.5), point(x * 0.08, 10.34, -0.55), 0.22, 0.25);
}
for (const z of [-3.5, 0, 3.5]) {
  addBeam(`left-outer-rafter-${z}`, "main-roof-frame", "timber-mid", point(-7.0, 2.92, z), point(-3.7, 4.02, z), 0.2, 0.23);
  addBeam(`left-inner-rafter-${z}`, "main-roof-frame", "timber-dark", point(-3.7, 4.02, z), point(-0.08, 10.34, z * 0.12), 0.22, 0.25);
  addBeam(`right-outer-rafter-${z}`, "main-roof-frame", "timber-mid", point(7.0, 2.92, z), point(3.7, 4.02, z), 0.2, 0.23);
  addBeam(`right-inner-rafter-${z}`, "main-roof-frame", "timber-dark", point(3.7, 4.02, z), point(0.08, 10.34, z * 0.12), 0.22, 0.25);
}
addBeam("crown-ridge", "main-roof-frame", "timber-dark", point(0, 10.34, -0.62), point(0, 10.34, 0.62), 0.3, 0.3);
for (const y of [5.85, 7.55]) {
  const t = (y - STOLP_EAVE_Y) / (STOLP_CROWN_Y - STOLP_EAVE_Y);
  const x = ROOF_HALF_X * (1 - t) - 0.25;
  const z = 7.12 - (7.12 - 0.55) * t - 0.18;
  addBeam(`purlin-left-${y}`, "main-roof-frame", "timber-mid", point(-x, y - 0.25, -z), point(-x, y - 0.25, z), 0.18, 0.22);
  addBeam(`purlin-right-${y}`, "main-roof-frame", "timber-mid", point(x, y - 0.25, -z), point(x, y - 0.25, z), 0.18, 0.22);
  addBeam(`purlin-front-${y}`, "main-roof-frame", "timber-mid", point(-x, y - 0.25, z), point(x, y - 0.25, z), 0.18, 0.22);
  addBeam(`purlin-rear-${y}`, "main-roof-frame", "timber-mid", point(-x, y - 0.25, -z), point(x, y - 0.25, -z), 0.18, 0.22);
}

// Six-bay brick residence: four windows flank two pairs of actual garden doors.
const frontOpenings = [
  { x: -5.35, width: 1.2, y0: 0.95, y1: 2.58 },
  { x: -3.65, width: 1.2, y0: 0.95, y1: 2.58 },
  { x: -1.15, width: 1.8, y0: 0.42, y1: 2.72 },
  { x: 1.15, width: 1.8, y0: 0.42, y1: 2.72 },
  { x: 3.65, width: 1.2, y0: 0.95, y1: 2.58 },
  { x: 5.35, width: 1.2, y0: 0.95, y1: 2.58 },
] as const;
for (let course = 0; course < 11; course += 1) {
  const y = 0.48 + course * 0.27;
  const gaps = frontOpenings
    .filter((opening) => y + 0.145 > opening.y0 && y - 0.145 < opening.y1)
    .map((opening) => [opening.x - opening.width / 2, opening.x + opening.width / 2] as const);
  for (const [segment, [x0, x1]] of solidSegments(-MAIN_HALF_X, MAIN_HALF_X, gaps).entries()) {
    addBox(`front-brick-course-${course}-segment-${segment}`, "residential-shell", "brick", point((x0 + x1) / 2, y, MAIN_HALF_Z), point(x1 - x0, 0.29, 0.18));
  }
}
for (const x of [-6.35, -2.45, 2.45, 6.35]) {
  addBox(`front-rusticated-pilaster-${x}`, "residential-trim", "paint-light", point(x, 1.78, 6.82), point(0.34, 2.95, 0.16));
  for (let block = 0; block < 7; block += 1) {
    addBox(`front-pilaster-block-${x}-${block}`, "residential-trim", "paint-light", point(x, 0.5 + block * 0.42, 6.93), point(0.42, 0.34, 0.09));
  }
}
for (const x of [-5.35, -3.65, 3.65, 5.35]) addFrontOpening(`front-window-${x}`, x, 1.765, 1.2, 1.63, 2, 3);
for (const x of [-1.15, 1.15]) {
  addFrontOpening(`garden-door-pair-${x}`, x, 1.57, 1.8, 2.3, 2, 3);
  for (const hingeX of [x - 0.9, x + 0.9]) {
    for (const y of [0.85, 1.75, 2.45]) {
      addBox(`garden-door-hinge-${x}-${hingeX}-${y}`, "residential-openings", "metal", point(hingeX, y, 6.92), point(0.13, 0.07, 0.07));
    }
  }
}

// The central brick cross-gable is a shallow inhabited front, not an applied signboard.
const gableZ = 7.02;
const gableWidthAt = (y: number) => 2.45 * Math.max(0, 1 - (y - 3.08) / (6.12 - 3.08));
for (const [id, y0, y1, x0, x1] of [
  ["lower", 3.08, 4.14, -2.45, 2.45],
  ["middle-left", 4.14, 5.42, -2.45, -0.66],
  ["middle-right", 4.14, 5.42, 0.66, 2.45],
  ["upper", 5.42, 6.12, -0.7, 0.7],
] as const) {
  const lowLeft = Math.max(x0, -gableWidthAt(y0));
  const lowRight = Math.min(x1, gableWidthAt(y0));
  const highLeft = Math.max(x0, -gableWidthAt(y1));
  const highRight = Math.min(x1, gableWidthAt(y1));
  addMesh(`front-cross-gable-${id}`, "residential-gable", "brick", [
    point(lowLeft, y0, gableZ), point(lowRight, y0, gableZ),
    point(highLeft, y1, gableZ), point(highRight, y1, gableZ),
  ], [[0, 1, 3], [0, 3, 2]], true);
}
addFrontOpening("front-gable-window", 0, 4.78, 1.32, 1.28, 3, 2);
for (const side of [-1, 1]) {
  addBeam(`front-gable-bargeboard-${side}`, "residential-trim", "paint-light", point(side * 2.48, 3.08, 7.1), point(0, 6.15, 7.1), 0.16, 0.13);
}
addBeam("front-gable-cornice", "residential-trim", "paint-light", point(-2.52, 3.08, 7.1), point(2.52, 3.08, 7.1), 0.18, 0.14);
addBox("beemster-crest", "residential-trim", "paint-accent", point(0, 5.75, 7.18), point(0.46, 0.32, 0.11), point(0, 0, Math.PI / 4));
addMesh("front-gable-return-left", "residential-gable", "brick", [
  point(-2.45, 3.08, 5.68), point(-2.45, 3.08, 7.02), point(0, 6.12, 7.02), point(0, 6.12, 5.68),
], [[0, 1, 2], [0, 2, 3]], true);
addMesh("front-gable-return-right", "residential-gable", "brick", [
  point(2.45, 3.08, 7.02), point(2.45, 3.08, 5.68), point(0, 6.12, 5.68), point(0, 6.12, 7.02),
], [[0, 1, 2], [0, 2, 3]], true);
addMesh("front-gable-roof-left", "front-gable-roof", "roof-dark", [
  point(-2.62, 3.16, 5.58), point(0, 6.28, 5.58), point(-2.62, 3.16, 7.38), point(0, 6.28, 7.38),
], [[0, 1, 3], [0, 3, 2]], true);
addMesh("front-gable-roof-right", "front-gable-roof", "roof-dark", [
  point(0, 6.28, 5.58), point(2.62, 3.16, 5.58), point(0, 6.28, 7.38), point(2.62, 3.16, 7.38),
], [[0, 1, 3], [0, 3, 2]], true);
addBeam("front-gable-ridge-cap", "front-gable-roof", "roof-dark", point(0, 6.29, 5.56), point(0, 6.29, 7.4), 0.16, 0.16);
addBeam("front-gable-valley-left", "front-gable-roof", "metal", point(-2.62, 3.18, 7.12), point(-1.02, 5.08, 5.58), 0.1, 0.08);
addBeam("front-gable-valley-right", "front-gable-roof", "metal", point(2.62, 3.18, 7.12), point(1.02, 5.08, 5.58), 0.1, 0.08);

// Timber barn wall: individual lap courses wrap the left side and rear, cut around stable windows and doors.
for (let course = 0; course < 11; course += 1) {
  const y = 0.48 + course * 0.27;
  const sideGaps = y + 0.145 > 0.98 && y - 0.145 < 2.18
    ? [[-4.95, -3.85], [-0.55, 0.55], [3.85, 4.95]] as const
    : [];
  for (const [segment, [z0, z1]] of solidSegments(-MAIN_HALF_Z, MAIN_HALF_Z, [...sideGaps]).entries()) {
    addBox(`left-barn-lap-${course}-segment-${segment}`, "barn-shell", "cladding", point(-MAIN_HALF_X, y, (z0 + z1) / 2), point(0.18, 0.29, z1 - z0));
  }
  const rearGaps: Array<readonly [number, number]> = [];
  if (y + 0.145 > 0.42 && y - 0.145 < 2.95) rearGaps.push([-6.4, -1.2]);
  if (y + 0.145 > 0.42 && y - 0.145 < 3.05) rearGaps.push([1.0, 6.2]);
  for (const [segment, [x0, x1]] of solidSegments(-MAIN_HALF_X, MAIN_HALF_X, rearGaps).entries()) {
    addBox(`rear-barn-lap-${course}-segment-${segment}`, "barn-shell", "cladding", point((x0 + x1) / 2, y, -MAIN_HALF_Z), point(x1 - x0, 0.29, 0.18));
  }
}
for (const [index, z] of [-4.4, 0, 4.4].entries()) {
  const x = -MAIN_HALF_X - 0.025;
  addBox(`stable-window-${index}-opening`, "barn-openings", "opening", point(x, 1.58, z), point(0.08, 1.06, 0.96));
  for (const edgeZ of [z - 0.55, z + 0.55]) addBeam(`stable-window-${index}-jamb-${edgeZ}`, "barn-openings", "metal", point(x - 0.08, 0.98, edgeZ), point(x - 0.08, 2.18, edgeZ), 0.08, 0.08);
  for (const edgeY of [0.98, 2.18]) addBeam(`stable-window-${index}-rail-${edgeY}`, "barn-openings", "metal", point(x - 0.08, edgeY, z - 0.55), point(x - 0.08, edgeY, z + 0.55), 0.08, 0.08);
  addBeam(`stable-window-${index}-mullion`, "barn-openings", "metal", point(x - 0.09, 1.02, z), point(x - 0.09, 2.14, z), 0.045, 0.045);
}

// Rear dars doors are two leaves on two jambs; every hinge touches both its leaf and its post.
addBox("rear-dars-opening", "barn-openings", "opening", point(-3.8, 1.68, -6.71), point(5.05, 2.48, 0.08));
for (const x of [-6.4, -1.2]) addBeam(`rear-dars-jamb-${x}`, "barn-openings", "timber-dark", point(x, 0.38, -6.82), point(x, 3.02, -6.82), 0.22, 0.2);
addBeam("rear-dars-header", "barn-openings", "timber-dark", point(-6.42, 3.02, -6.82), point(-1.18, 3.02, -6.82), 0.24, 0.22);
for (const [leaf, x] of [["left", -5.1], ["right", -2.5]] as const) {
  addBox(`rear-dars-leaf-${leaf}`, "barn-openings", "cladding", point(x, 1.68, -6.86), point(2.52, 2.48, 0.12));
  addBeam(`rear-dars-leaf-${leaf}-brace-a`, "barn-openings", "timber-mid", point(x - 1.13, 0.56, -6.96), point(x + 1.13, 2.8, -6.96), 0.09, 0.07);
  addBeam(`rear-dars-leaf-${leaf}-brace-b`, "barn-openings", "timber-mid", point(x - 1.13, 2.8, -6.96), point(x + 1.13, 0.56, -6.96), 0.09, 0.07);
}
for (const [jambX, direction] of [[-6.4, 1], [-1.2, -1]] as const) {
  for (const y of [0.82, 1.68, 2.54]) addBox(`rear-dars-hinge-${jambX}-${y}`, "barn-openings", "metal", point(jambX + direction * 0.18, y, -6.97), point(0.36, 0.08, 0.07));
}

// Right wall is brick at the dwelling end and timber at service end, both cut around usable openings.
for (let course = 0; course < 11; course += 1) {
  const y = 0.48 + course * 0.27;
  const residentialGaps: Array<readonly [number, number]> = [];
  if (y + 0.145 > 0.42 && y - 0.145 < 2.62) residentialGaps.push([1.92, 3.12]);
  if (y + 0.145 > 0.98 && y - 0.145 < 2.45) residentialGaps.push([4.42, 5.62]);
  for (const [segment, [z0, z1]] of solidSegments(1.2, 6.7, residentialGaps).entries()) {
    addBox(`right-residential-brick-${course}-${segment}`, "residential-shell", "brick", point(MAIN_HALF_X, y, (z0 + z1) / 2), point(0.18, 0.29, z1 - z0));
  }
  const barnGaps: Array<readonly [number, number]> = [];
  if (y + 0.145 > 0.42 && y - 0.145 < 2.55) barnGaps.push([-1.15, 0.05]);
  if (y + 0.145 > 1.02 && y - 0.145 < 2.18) barnGaps.push([-4.1, -2.95]);
  for (const [segment, [z0, z1]] of solidSegments(-5.5, 1.2, barnGaps).entries()) {
    addBox(`right-barn-lap-${course}-${segment}`, "barn-shell", "cladding", point(MAIN_HALF_X, y, (z0 + z1) / 2), point(0.18, 0.29, z1 - z0));
  }
}
for (const [id, z, y, width, height, material] of [
  ["right-house-door", 2.52, 1.52, 1.2, 2.2, "paint-light"],
  ["right-house-window", 5.02, 1.715, 1.2, 1.47, "paint-light"],
  ["right-service-door", -0.55, 1.485, 1.2, 2.13, "timber-dark"],
  ["right-stable-window", -3.525, 1.6, 1.15, 1.16, "metal"],
] as const) {
  const x = MAIN_HALF_X + 0.025;
  addBox(`${id}-opening`, id.includes("house") ? "residential-openings" : "barn-openings", "opening", point(x, y, z), point(0.08, height - 0.14, width - 0.14));
  const group = id.includes("house") ? "residential-openings" : "barn-openings";
  for (const edgeZ of [z - width / 2, z + width / 2]) addBeam(`${id}-jamb-${edgeZ}`, group, material, point(x + 0.08, y - height / 2, edgeZ), point(x + 0.08, y + height / 2, edgeZ), 0.1, 0.08);
  for (const edgeY of [y - height / 2, y + height / 2]) addBeam(`${id}-rail-${edgeY}`, group, material, point(x + 0.08, edgeY, z - width / 2), point(x + 0.08, edgeY, z + width / 2), 0.1, 0.08);
  if (id.includes("window")) addBeam(`${id}-mullion`, group, material, point(x + 0.09, y - height / 2 + 0.08, z), point(x + 0.09, y + height / 2 - 0.08, z), 0.045, 0.045);
}

// Main pyramid skin is four controlled planes. Front and rear planes are cut for the cross-gable and tail emergence.
const frontCutZ = 5.55;
const frontCutHalfX = ROOF_HALF_X * (frontCutZ - RIDGE_FRONT_Z) / (MAIN_ROOF_FRONT_Z - RIDGE_FRONT_Z);
const frontCutY = STOLP_EAVE_Y + (STOLP_CROWN_Y - STOLP_EAVE_Y) * (MAIN_ROOF_FRONT_Z - frontCutZ) / (MAIN_ROOF_FRONT_Z - RIDGE_FRONT_Z);
addMesh("main-roof-front-upper", "main-roof-skin", "roof-dark", [
  point(0, STOLP_CROWN_Y, RIDGE_FRONT_Z), point(-frontCutHalfX, frontCutY, frontCutZ), point(frontCutHalfX, frontCutY, frontCutZ),
], [[0, 1, 2]], true);
// The cross-gable is framed into a continuous weather plane; its two metal valleys make the overlap explicit.
addMesh("main-roof-front-gable-underlay", "main-roof-skin", "roof-dark", [
  point(-frontCutHalfX, frontCutY, frontCutZ), point(frontCutHalfX, frontCutY, frontCutZ),
  point(-ROOF_HALF_X, STOLP_EAVE_Y, MAIN_ROOF_FRONT_Z), point(ROOF_HALF_X, STOLP_EAVE_Y, MAIN_ROOF_FRONT_Z),
], [[0, 1, 3], [0, 3, 2]], true);
for (const [side, innerX] of [[-1, -2.68], [1, 2.68]] as const) {
  addMesh(`main-roof-front-lower-${side}`, "main-roof-skin", "roof-dark", [
    point(side * frontCutHalfX, frontCutY, frontCutZ), point(innerX, frontCutY, frontCutZ),
    point(side * ROOF_HALF_X, STOLP_EAVE_Y, MAIN_ROOF_FRONT_Z), point(innerX, STOLP_EAVE_Y, MAIN_ROOF_FRONT_Z),
  ], [[0, 1, 3], [0, 3, 2]], true);
}

const rearCutZ = -5.95;
const rearCutHalfX = ROOF_HALF_X * (Math.abs(rearCutZ) - Math.abs(RIDGE_REAR_Z)) / (Math.abs(MAIN_ROOF_REAR_Z) - Math.abs(RIDGE_REAR_Z));
const rearCutY = STOLP_EAVE_Y + (STOLP_CROWN_Y - STOLP_EAVE_Y) * (Math.abs(MAIN_ROOF_REAR_Z) - Math.abs(rearCutZ)) / (Math.abs(MAIN_ROOF_REAR_Z) - Math.abs(RIDGE_REAR_Z));
addMesh("main-roof-rear-upper", "main-roof-skin", "roof-warm", [
  point(0, STOLP_CROWN_Y, RIDGE_REAR_Z), point(rearCutHalfX, rearCutY, rearCutZ), point(-rearCutHalfX, rearCutY, rearCutZ),
], [[0, 1, 2]], true);
// A continuous lower weather plane remains beneath the emerging tail roof; the framed bay and flashing own the transition.
addMesh("main-roof-rear-tail-underlay", "main-roof-skin", "roof-warm", [
  point(-rearCutHalfX, rearCutY, rearCutZ), point(rearCutHalfX, rearCutY, rearCutZ),
  point(-ROOF_HALF_X, STOLP_EAVE_Y, MAIN_ROOF_REAR_Z), point(ROOF_HALF_X, STOLP_EAVE_Y, MAIN_ROOF_REAR_Z),
], [[0, 1, 3], [0, 3, 2]], true);
addMesh("main-roof-rear-lower-left", "main-roof-skin", "roof-warm", [
  point(-rearCutHalfX, rearCutY, rearCutZ), point(0.82, rearCutY, rearCutZ),
  point(-ROOF_HALF_X, STOLP_EAVE_Y, MAIN_ROOF_REAR_Z), point(0.82, STOLP_EAVE_Y, MAIN_ROOF_REAR_Z),
], [[0, 1, 3], [0, 3, 2]], true);
addMesh("main-roof-rear-lower-right-edge", "main-roof-skin", "roof-warm", [
  point(6.42, rearCutY, rearCutZ), point(rearCutHalfX, rearCutY, rearCutZ),
  point(6.42, STOLP_EAVE_Y, MAIN_ROOF_REAR_Z), point(ROOF_HALF_X, STOLP_EAVE_Y, MAIN_ROOF_REAR_Z),
], [[0, 1, 3], [0, 3, 2]], true);
addMesh("main-roof-left", "main-roof-skin", "roof-warm", [
  point(-ROOF_HALF_X, STOLP_EAVE_Y, MAIN_ROOF_REAR_Z), point(0, STOLP_CROWN_Y, RIDGE_REAR_Z),
  point(-ROOF_HALF_X, STOLP_EAVE_Y, MAIN_ROOF_FRONT_Z), point(0, STOLP_CROWN_Y, RIDGE_FRONT_Z),
], [[0, 1, 3], [0, 3, 2]], true);
addMesh("main-roof-right", "main-roof-skin", "roof-warm", [
  point(0, STOLP_CROWN_Y, RIDGE_REAR_Z), point(ROOF_HALF_X, STOLP_EAVE_Y, MAIN_ROOF_REAR_Z),
  point(0, STOLP_CROWN_Y, RIDGE_FRONT_Z), point(ROOF_HALF_X, STOLP_EAVE_Y, MAIN_ROOF_FRONT_Z),
], [[0, 1, 3], [0, 3, 2]], true);
addBeam("main-roof-ridge-cap", "main-roof-skin", "roof-warm", point(0, STOLP_CROWN_Y, RIDGE_REAR_Z), point(0, STOLP_CROWN_Y, RIDGE_FRONT_Z), 0.2, 0.2);
for (const [id, from, to] of [
  ["front-left", point(-ROOF_HALF_X, STOLP_EAVE_Y, MAIN_ROOF_FRONT_Z), point(0, STOLP_CROWN_Y, RIDGE_FRONT_Z)],
  ["front-right", point(ROOF_HALF_X, STOLP_EAVE_Y, MAIN_ROOF_FRONT_Z), point(0, STOLP_CROWN_Y, RIDGE_FRONT_Z)],
  ["rear-left", point(-ROOF_HALF_X, STOLP_EAVE_Y, MAIN_ROOF_REAR_Z), point(0, STOLP_CROWN_Y, RIDGE_REAR_Z)],
  ["rear-right", point(ROOF_HALF_X, STOLP_EAVE_Y, MAIN_ROOF_REAR_Z), point(0, STOLP_CROWN_Y, RIDGE_REAR_Z)],
] as const) addBeam(`main-hip-cap-${id}`, "main-roof-skin", "roof-warm", from, to, 0.16, 0.16);
for (const side of [-1, 1]) addBeam(`main-side-fascia-${side}`, "main-roof-skin", "roof-warm", point(side * ROOF_HALF_X, 3.19, MAIN_ROOF_REAR_Z), point(side * ROOF_HALF_X, 3.19, MAIN_ROOF_FRONT_Z), 0.18, 0.16);

// Roof courses share the same profile as the skin. Courses stop at both authored roof openings.
for (let course = 1; course < 11; course += 1) {
  const t = course / 11;
  const y = STOLP_EAVE_Y + (STOLP_CROWN_Y - STOLP_EAVE_Y) * t + 0.035;
  const halfX = ROOF_HALF_X * (1 - t);
  const frontZ = MAIN_ROOF_FRONT_Z + (RIDGE_FRONT_Z - MAIN_ROOF_FRONT_Z) * t;
  const rearZ = MAIN_ROOF_REAR_Z + (RIDGE_REAR_Z - MAIN_ROOF_REAR_Z) * t;
  const frontSegments = frontZ > frontCutZ ? [[-halfX, -2.72], [2.72, halfX]] : [[-halfX, halfX]];
  for (const [segment, [x0, x1]] of frontSegments.filter(([x0, x1]) => x1 > x0).entries()) addBeam(`front-tile-course-${course}-${segment}`, "main-roof-skin", "roof-dark", point(x0, y, frontZ), point(x1, y, frontZ), 0.026, 0.026);
  const rearSegments = rearZ < rearCutZ ? [[-halfX, 0.78], [6.46, halfX]] : [[-halfX, halfX]];
  for (const [segment, [x0, x1]] of rearSegments.filter(([x0, x1]) => x1 > x0).entries()) addBeam(`rear-tile-course-${course}-${segment}`, "main-roof-skin", "roof-warm", point(x0, y, rearZ), point(x1, y, rearZ), 0.026, 0.026);
  const sideX = ROOF_HALF_X * (1 - t);
  addBeam(`left-tile-course-${course}`, "main-roof-skin", "roof-warm", point(-sideX, y, rearZ), point(-sideX, y, frontZ), 0.026, 0.026);
  addBeam(`right-tile-course-${course}`, "main-roof-skin", "roof-warm", point(sideX, y, rearZ), point(sideX, y, frontZ), 0.026, 0.026);
}

// The rear tail shares the rear opening: its frame passes through the main wall before its roof emerges through a cut roof bay.
for (const x of [1.1, 6.1]) {
  addBeam(`tail-sill-${x}`, "tail-frame", "timber-dark", point(x, 0.42, TAIL_REAR_Z), point(x, 0.42, TAIL_FRONT_Z), 0.24, 0.24);
}
for (const z of [-12.45, -10.15, -7.85, -5.55]) {
  for (const x of [1.12, 6.08]) addBeam(`tail-post-${x}-${z}`, "tail-frame", "timber-dark", point(x, 0.42, z), point(x, 2.9, z), 0.24, 0.24);
  addBeam(`tail-tie-${z}`, "tail-frame", "timber-dark", point(1.0, 2.9, z), point(6.2, 2.9, z), 0.24, 0.24);
  addBeam(`tail-rafter-left-${z}`, "tail-frame", "timber-dark", point(0.9, 2.78, z), point(TAIL_CENTER_X, 4.18, z), 0.18, 0.21);
  addBeam(`tail-rafter-right-${z}`, "tail-frame", "timber-dark", point(TAIL_CENTER_X, 4.18, z), point(6.3, 2.78, z), 0.18, 0.21);
}
addBeam("tail-ridge", "tail-frame", "timber-dark", point(TAIL_CENTER_X, 4.18, -12.75), point(TAIL_CENTER_X, 4.18, -5.45), 0.2, 0.22);
addBeam("tail-junction-left-post", "tail-junction", "timber-dark", point(1.0, 0.38, -6.72), point(1.0, 3.05, -6.72), 0.28, 0.26);
addBeam("tail-junction-right-post", "tail-junction", "timber-dark", point(6.2, 0.38, -6.72), point(6.2, 3.05, -6.72), 0.28, 0.26);
addBeam("tail-junction-header", "tail-junction", "timber-dark", point(0.94, 3.05, -6.72), point(6.26, 3.05, -6.72), 0.3, 0.28);
addBeam("tail-junction-flashing-left", "tail-junction", "metal", point(0.82, TAIL_EAVE_Y, -5.95), point(TAIL_CENTER_X, TAIL_RIDGE_Y, -5.95), 0.11, 0.08);
addBeam("tail-junction-flashing-right", "tail-junction", "metal", point(TAIL_CENTER_X, TAIL_RIDGE_Y, -5.95), point(6.38, TAIL_EAVE_Y, -5.95), 0.11, 0.08);

for (let course = 0; course < 10; course += 1) {
  const y = 0.48 + course * 0.27;
  for (const x of [1.1, 6.1]) addBox(`tail-side-lap-${x}-${course}`, "tail-shell", "cladding", point(x, y, -9.0), point(0.18, 0.29, STOLP_TAIL_DEPTH));
  const rearGap = y + 0.145 > 0.42 && y - 0.145 < 2.72 ? [[2.55, 4.65]] as const : [];
  for (const [segment, [x0, x1]] of solidSegments(1.1, 6.1, [...rearGap]).entries()) addBox(`tail-rear-lap-${course}-segment-${segment}`, "tail-shell", "cladding", point((x0 + x1) / 2, y, TAIL_REAR_Z), point(x1 - x0, 0.29, 0.18));
}
addMesh("tail-rear-gable-left", "tail-shell", "cladding", [
  point(1.1, 3.05, TAIL_REAR_Z), point(2.56, 3.05, TAIL_REAR_Z), point(TAIL_CENTER_X, TAIL_RIDGE_Y, TAIL_REAR_Z),
], [[0, 1, 2]], true);
addMesh("tail-rear-gable-right", "tail-shell", "cladding", [
  point(4.64, 3.05, TAIL_REAR_Z), point(6.1, 3.05, TAIL_REAR_Z), point(TAIL_CENTER_X, TAIL_RIDGE_Y, TAIL_REAR_Z),
], [[0, 1, 2]], true);
addBox("tail-transport-door-opening", "tail-openings", "opening", point(TAIL_CENTER_X, 3.55, -12.62), point(1.96, 1.62, 0.08));
for (const x of [2.52, 4.68]) addBeam(`tail-transport-door-jamb-${x}`, "tail-openings", "paint-light", point(x, 2.7, -12.72), point(x, 4.42, -12.72), 0.12, 0.1);
for (const y of [2.7, 4.42]) addBeam(`tail-transport-door-rail-${y}`, "tail-openings", "paint-light", point(2.52, y, -12.72), point(4.68, y, -12.72), 0.12, 0.1);
addBox("tail-transport-door-leaf", "tail-openings", "cladding", point(TAIL_CENTER_X, 3.55, -12.74), point(1.92, 1.54, 0.11));
addBeam("tail-transport-door-brace-left", "tail-openings", "timber-mid", point(2.7, 2.88, -12.82), point(4.5, 4.22, -12.82), 0.08, 0.06);
addBeam("tail-transport-door-brace-right", "tail-openings", "timber-mid", point(2.7, 4.22, -12.82), point(4.5, 2.88, -12.82), 0.08, 0.06);
addBox("tail-ground-door-opening", "tail-openings", "opening", point(TAIL_CENTER_X, 1.57, -12.62), point(1.96, 2.22, 0.08));
for (const x of [2.52, 4.68]) addBeam(`tail-ground-door-jamb-${x}`, "tail-openings", "paint-light", point(x, 0.42, -12.72), point(x, 2.72, -12.72), 0.12, 0.1);
for (const y of [0.42, 2.72]) addBeam(`tail-ground-door-rail-${y}`, "tail-openings", "paint-light", point(2.52, y, -12.72), point(4.68, y, -12.72), 0.12, 0.1);
addBox("tail-ground-door-leaf", "tail-openings", "cladding", point(TAIL_CENTER_X, 1.57, -12.74), point(1.92, 2.14, 0.11));
addBeam("tail-ground-door-brace", "tail-openings", "timber-mid", point(2.7, 0.62, -12.82), point(4.5, 2.52, -12.82), 0.08, 0.06);
addMesh("tail-roof-left", "tail-roof", "roof-warm", [
  point(0.8, TAIL_EAVE_Y, -13.15), point(TAIL_CENTER_X, TAIL_RIDGE_Y, -13.15), point(0.8, TAIL_EAVE_Y, -5.4), point(TAIL_CENTER_X, TAIL_RIDGE_Y, -5.4),
], [[0, 1, 3], [0, 3, 2]], true);
addMesh("tail-roof-right", "tail-roof", "roof-warm", [
  point(TAIL_CENTER_X, TAIL_RIDGE_Y, -13.15), point(6.4, TAIL_EAVE_Y, -13.15), point(TAIL_CENTER_X, TAIL_RIDGE_Y, -5.4), point(6.4, TAIL_EAVE_Y, -5.4),
], [[0, 1, 3], [0, 3, 2]], true);
addBeam("tail-roof-ridge-cap", "tail-roof", "roof-warm", point(TAIL_CENTER_X, TAIL_RIDGE_Y, -13.15), point(TAIL_CENTER_X, TAIL_RIDGE_Y, -5.4), 0.16, 0.16);
for (const side of [-1, 1]) {
  for (let course = 1; course < 7; course += 1) {
    const t = course / 7;
    const x = TAIL_CENTER_X + side * 2.8 * (1 - t);
    const y = TAIL_EAVE_Y + (TAIL_RIDGE_Y - TAIL_EAVE_Y) * t + 0.025;
    addBeam(`tail-roof-course-${side}-${course}`, "tail-roof", "roof-warm", point(x, y, -13.15), point(x, y, -5.4), 0.024, 0.024);
  }
}

export const northHollandStolpFarmObject: ObjectLabModel = {
  id: "dutch-house-north-holland-stolp-h2",
  revision: "h2-2026-08-02",
  title: "North-Holland stolp farm + rear tail — structural grey model",
  units: "metres",
  coordinates: { up: "+Y", front: "+Z", origin: "ground-centre" },
  sourceNotes: [
    "Beemsters Wapen supplies the rectangular stolp, six-bay brick residence, two garden-door pairs, timber dars wall, internal vierkant and rear tail roof transition.",
    "The Noord-Holland farm foundation defines the stolp as a pyramidal square-plan building supported by a four-post timber vierkant.",
    "Main footprint, combined tail footprint and roof envelope are recorded separately so world clearance cannot silently omit the tail.",
  ],
  dimensions: {
    mainWallWidth: STOLP_MAIN_WALL_WIDTH,
    mainWallDepth: STOLP_MAIN_WALL_DEPTH,
    combinedWallDepth: STOLP_COMBINED_WALL_DEPTH,
    roofEnvelopeWidth: STOLP_ROOF_ENVELOPE_WIDTH,
    roofEnvelopeDepth: STOLP_ROOF_ENVELOPE_DEPTH,
    eaveY: STOLP_EAVE_Y,
    crownY: STOLP_CROWN_Y,
    vierkantWidth: STOLP_VIERKANT_WIDTH,
    vierkantDepth: STOLP_VIERKANT_DEPTH,
    tailWidth: STOLP_TAIL_WIDTH,
    tailDepth: STOLP_TAIL_DEPTH,
    clearanceRadius: STOLP_CLEARANCE_RADIUS,
  },
  labMetrics: [
    { label: "MAIN WALL", value: STOLP_MAIN_WALL_WIDTH, decimals: 1, signed: false },
    { label: "FULL DEPTH", value: STOLP_COMBINED_WALL_DEPTH, decimals: 1, signed: false },
    { label: "CROWN", value: STOLP_CROWN_Y, decimals: 1 },
    { label: "VIERKANT POSTS", value: 4, decimals: 0, signed: false, unit: "" },
  ],
  anchors: {
    groundCentre: point(0, 0, 0),
    residentialFront: point(0, 0.42, 6.82),
    vierkantCentre: point(0, 0.38, 0),
    roofCrown: point(0, STOLP_CROWN_Y, 0),
    darsDoor: point(-3.8, 0.42, -6.86),
    tailJunction: point(TAIL_CENTER_X, 1.7, -6.72),
    tailRear: point(TAIL_CENTER_X, 0.42, TAIL_REAR_Z),
  },
  motionConstraints: { staticObject: true, windSimulation: false },
  parts,
  views: [
    { id: "front", label: "Front +Z · six-bay brick residence", projection: "orthographic", position: point(0, 5.2, 40), target: point(0, 4.6, 0.8), orthoHeight: 14.2 },
    { id: "left", label: "Left · timber dars wall", projection: "orthographic", position: point(-42, 5.0, -1.8), target: point(0, 4.3, -1.8), orthoHeight: 15.2 },
    { id: "rear", label: "Rear -Z · dars doors + tail", projection: "orthographic", position: point(0, 4.8, -46), target: point(0, 4.0, -3.0), orthoHeight: 15.2 },
    { id: "right", label: "Right · dwelling-to-tail transition", projection: "orthographic", position: point(45, 5.0, -2.6), target: point(0, 4.2, -2.6), orthoHeight: 15.2 },
    { id: "three-quarter-left", label: "3/4 left · residence + barn wall", projection: "perspective", position: point(-24, 16, 27), target: point(0, 4.0, -1.1), fov: 35 },
    { id: "three-quarter-right", label: "3/4 right · residence + tail", projection: "perspective", position: point(26, 15, 25), target: point(1.0, 4.0, -1.3), fov: 35 },
    { id: "high-three-quarter", label: "High 3/4 · asymmetric roof transitions", projection: "perspective", position: point(25, 27, 25), target: point(1.0, 3.4, -2.0), fov: 37 },
    { id: "vierkant-cutaway", label: "Cutaway · four-post roof load path", projection: "perspective", position: point(-20, 13, 20), target: point(0, 4.2, 0), fov: 34, hiddenGroups: ["residential-shell", "residential-openings", "residential-trim", "residential-gable", "front-gable-roof", "barn-shell", "barn-openings", "main-roof-skin", "tail-shell", "tail-openings", "tail-roof"] },
    { id: "tail-junction-cutaway", label: "Cutaway · open rear bay + roof flashing", projection: "perspective", position: point(18, 8, -20), target: point(2.8, 2.5, -7.0), fov: 32, hiddenGroups: ["residential-shell", "residential-openings", "residential-trim", "residential-gable", "front-gable-roof", "barn-shell", "barn-openings", "main-roof-skin", "tail-shell", "tail-openings", "tail-roof", "main-roof-frame"] },
    { id: "silhouette", label: "Silhouette control", projection: "orthographic", position: point(-24, 12, 27), target: point(0, 4.1, -1), orthoHeight: 16.0 },
  ],
};
