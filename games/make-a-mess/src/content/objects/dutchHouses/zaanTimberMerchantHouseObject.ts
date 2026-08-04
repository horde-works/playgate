import type {
  ObjectLabModel,
  ObjectLabPart,
  ObjectMaterialId,
  ObjectPoint,
} from "../dutchWindmills/objectModel.ts";
import { dutchLampFixture } from "../dutchLighting/dutchLightingFixtures.ts";

export const ZAAN_HOUSE_FOOTPRINT_WIDTH = 7.2;
export const ZAAN_HOUSE_FOOTPRINT_DEPTH = 10.8;
export const ZAAN_HOUSE_ROOF_ENVELOPE_WIDTH = 7.47;
export const ZAAN_HOUSE_ROOF_ENVELOPE_DEPTH = 11.16;
export const ZAAN_HOUSE_MAIN_WIDTH = 4.8;
export const ZAAN_HOUSE_EAVE_Y = 3.35;
export const ZAAN_HOUSE_RIDGE_Y = 7.15;
export const ZAAN_HOUSE_SERVICE_WIDTH = 4.2;
export const ZAAN_HOUSE_SERVICE_DEPTH = 4.8;
export const ZAAN_HOUSE_YOKE_COUNT = 5;

const parts: ObjectLabPart[] = [];
const point = (x: number, y: number, z: number): ObjectPoint => [x, y, z];

const addBeam = (id: string, group: string, material: ObjectMaterialId, from: ObjectPoint, to: ObjectPoint, width: number, depth = width) => {
  parts.push({ kind: "beam", id, group, material, from, to, width, depth });
};
const addBox = (id: string, group: string, material: ObjectMaterialId, center: ObjectPoint, size: ObjectPoint, rotation?: ObjectPoint) => {
  parts.push({ kind: "box", id, group, material, center, size, rotation });
};
const addCylinder = (id: string, group: string, material: ObjectMaterialId, from: ObjectPoint, to: ObjectPoint, radius: number, radialSegments = 16) => {
  parts.push({ kind: "cylinder", id, group, material, from, to, radius, radialSegments });
};
const addMesh = (id: string, group: string, material: ObjectMaterialId, vertices: ObjectPoint[], triangles: Array<readonly [number, number, number]>, doubleSided = false) => {
  parts.push({ kind: "mesh", id, group, material, vertices, triangles, doubleSided });
};
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

const addPanel = (id: string, group: string, center: ObjectPoint, width: number, height: number, axis: "x" | "z" = "x") => {
  const size = axis === "x" ? point(width, height, 0.09) : point(0.09, height, width);
  addBox(`${id}-opening`, group, "opening", center, size);
  const halfW = width / 2;
  const halfH = height / 2;
  const frame = 0.105;
  if (axis === "x") {
    addBeam(`${id}-frame-left`, group, "paint-light", point(center[0] - halfW, center[1] - halfH, center[2] + 0.055), point(center[0] - halfW, center[1] + halfH, center[2] + 0.055), frame, 0.08);
    addBeam(`${id}-frame-right`, group, "paint-light", point(center[0] + halfW, center[1] - halfH, center[2] + 0.055), point(center[0] + halfW, center[1] + halfH, center[2] + 0.055), frame, 0.08);
    addBeam(`${id}-frame-head`, group, "paint-light", point(center[0] - halfW, center[1] + halfH, center[2] + 0.055), point(center[0] + halfW, center[1] + halfH, center[2] + 0.055), frame, 0.08);
    addBeam(`${id}-frame-sill`, group, "paint-light", point(center[0] - halfW, center[1] - halfH, center[2] + 0.055), point(center[0] + halfW, center[1] - halfH, center[2] + 0.055), frame, 0.08);
  } else {
    addBeam(`${id}-frame-left`, group, "paint-light", point(center[0] + 0.055, center[1] - halfH, center[2] - halfW), point(center[0] + 0.055, center[1] + halfH, center[2] - halfW), frame, 0.08);
    addBeam(`${id}-frame-right`, group, "paint-light", point(center[0] + 0.055, center[1] - halfH, center[2] + halfW), point(center[0] + 0.055, center[1] + halfH, center[2] + halfW), frame, 0.08);
    addBeam(`${id}-frame-head`, group, "paint-light", point(center[0] + 0.055, center[1] + halfH, center[2] - halfW), point(center[0] + 0.055, center[1] + halfH, center[2] + halfW), frame, 0.08);
    addBeam(`${id}-frame-sill`, group, "paint-light", point(center[0] + 0.055, center[1] - halfH, center[2] - halfW), point(center[0] + 0.055, center[1] - halfH, center[2] + halfW), frame, 0.08);
  }
};

const addMullions = (id: string, group: string, center: ObjectPoint, width: number, height: number, columns: number, rows: number) => {
  for (let column = 1; column < columns; column += 1) {
    const x = center[0] - width / 2 + column / columns * width;
    addBeam(`${id}-mullion-${column}`, group, "paint-light", point(x, center[1] - height / 2, center[2] + 0.07), point(x, center[1] + height / 2, center[2] + 0.07), 0.045, 0.045);
  }
  for (let row = 1; row < rows; row += 1) {
    const y = center[1] - height / 2 + row / rows * height;
    addBeam(`${id}-transom-${row}`, group, "paint-light", point(center[0] - width / 2, y, center[2] + 0.07), point(center[0] + width / 2, y, center[2] + 0.07), 0.045, 0.045);
  }
};

// Brick and sill beams isolate the timber shell from wet ground.
addBox("main-brick-plinth", "foundation", "brick", point(0, 0.22, 0), point(5.05, 0.44, 11.05));
addBox("service-brick-plinth", "foundation", "brick", point(2.7, 0.22, -0.6), point(4.25, 0.44, 5.0));
for (const x of [-2.08, 2.08]) {
  addBeam(`main-sill-${x}`, "primary-frame", "timber-dark", point(x, 0.48, -5.2), point(x, 0.48, 5.2), 0.28, 0.24);
}

// Five transverse timber yokes carry the floor and roof independently of the cladding.
const yokeZs = [-4.6, -2.3, 0, 2.3, 4.6] as const;
for (let index = 0; index < yokeZs.length; index += 1) {
  const z = yokeZs[index];
  for (const side of [-1, 1]) {
    const x = side * 2.08;
    addBeam(`yoke-${index}-post-${side}`, "primary-frame", "timber-dark", point(x, 0.48, z), point(x, 3.18, z), 0.25, 0.28);
    addBeam(`yoke-${index}-knee-${side}`, "primary-frame", "timber-dark", point(x, 2.35, z), point(side * 1.2, 3.16, z), 0.18, 0.2);
    addBeam(`rafter-${index}-${side}`, "roof-frame", "timber-dark", point(side * 2.55, ZAAN_HOUSE_EAVE_Y - 0.34, z), point(0, 6.54, z), 0.2, 0.22);
  }
  addBeam(`yoke-${index}-tie`, "primary-frame", "timber-dark", point(-2.15, 3.18, z), point(2.15, 3.18, z), 0.25, 0.28);
  addBeam(`yoke-${index}-collar`, "roof-frame", "timber-dark", point(-0.92, 5.63, z), point(0.92, 5.63, z), 0.16, 0.18);
}
addBeam("ridge-beam", "roof-frame", "timber-dark", point(0, 6.58, -5.25), point(0, 6.58, 5.25), 0.22, 0.24);
for (const x of [-1.46, 1.46]) {
  addBeam(`purlin-${x}`, "roof-frame", "timber-mid", point(x, 4.5, -5.25), point(x, 4.5, 5.25), 0.18, 0.2);
}
for (const z of [-4.7, -2.35, 0, 2.35, 4.7]) {
  addBeam(`floor-joist-${z}`, "floor-frame", "timber-mid", point(-2.3, 0.64, z), point(2.3, 0.64, z), 0.2, 0.25);
}

// Horizontal overlapping side courses are separate geometry, not a painted texture.
for (const side of [-1, 1]) {
  for (let course = 0; course < 13; course += 1) {
    const y = 0.52 + course * 0.225;
    const cutsWindows = side === -1 && y + 0.135 > 1.04 && y - 0.135 < 2.52;
    const segments = cutsWindows
      ? solidSegments(-5.4, 5.4, [[-3.72, -2.58], [-0.57, 0.57], [2.58, 3.72]])
      : [[-5.4, 5.4] as const];
    for (let segment = 0; segment < segments.length; segment += 1) {
      const [z0, z1] = segments[segment];
      addBox(`side-${side}-lap-course-${course}-segment-${segment}`, "main-cladding", "cladding", point(side * (2.43 + course * 0.0015), y, (z0 + z1) / 2), point(0.12, 0.27, z1 - z0));
    }
  }
}
addBox("front-wall-head", "main-cladding", "cladding", point(0, 2.99, 5.42), point(4.8, 0.68, 0.16));
for (const [id, x0, x1] of [
  ["outer-left", -2.4, -1.86], ["window-door-left", -0.7, -0.48],
  ["door-window-right", 0.48, 0.7], ["outer-right", 1.86, 2.4],
] as const) {
  addBox(`front-wall-pier-${id}`, "main-cladding", "cladding", point((x0 + x1) / 2, 1.55, 5.42), point(x1 - x0, 2.22, 0.16));
}
for (const [id, x] of [["left", -1.28], ["right", 1.28]] as const) {
  addBox(`front-wall-window-apron-${id}`, "main-cladding", "cladding", point(x, 0.73, 5.42), point(1.16, 0.58, 0.16));
}
addBox("rear-lower-wall", "main-cladding", "cladding", point(0, 1.83, -5.42), point(4.8, 3.0, 0.16));

// The front is a real shaped gable: width levels generate the face and the trim follows the same contour.
const gableLevels = [
  [3.3, 2.4], [3.72, 2.37], [4.1, 2.18], [4.26, 2.02], [4.78, 1.56],
  [5.12, 1.38], [5.42, 1.23], [5.48, 1.2], [5.86, 0.96], [6.26, 0.67], [6.68, 0.38], [7.08, 0.07],
] as const;
const gableVertices: ObjectPoint[] = [];
const gableTriangles: Array<readonly [number, number, number]> = [];
for (let level = 0; level < gableLevels.length - 1; level += 1) {
  const [y0, half0] = gableLevels[level];
  const [y1, half1] = gableLevels[level + 1];
  const strips: Array<readonly [number, number, number, number]> = y0 >= 4.26 && y1 <= 5.42
    ? [[-half0, -0.45, -half1, -0.45], [0.45, half0, 0.45, half1]]
    : [[-half0, half0, -half1, half1]];
  for (const [x0a, x0b, x1a, x1b] of strips) {
    const vertex = gableVertices.length;
    gableVertices.push(
      point(x0a, y0, 5.43), point(x0b, y0, 5.43),
      point(x1a, y1, 5.43), point(x1b, y1, 5.43),
    );
    gableTriangles.push([vertex, vertex + 1, vertex + 3], [vertex, vertex + 3, vertex + 2]);
  }
}
addMesh("shaped-front-gable", "main-cladding", "cladding", gableVertices, gableTriangles, true);
for (const side of [-1, 1]) {
  for (let level = 0; level < gableLevels.length - 1; level += 1) {
    const [y0, half0] = gableLevels[level];
    const [y1, half1] = gableLevels[level + 1];
    addBeam(`gable-trim-${side}-${level}`, "gable-trim", "paint-light", point(side * half0, y0, 5.55), point(side * half1, y1, 5.55), 0.14, 0.11);
  }
}
addBeam("gable-base-trim", "gable-trim", "paint-light", point(-2.42, 3.28, 5.55), point(2.42, 3.28, 5.55), 0.14, 0.11);

// The private rear gable is simpler than the merchant frontage, but remains a closed shell with a real loft opening.
const rearGableVertices: ObjectPoint[] = [];
const rearGableTriangles: Array<readonly [number, number, number]> = [];
const rearGableLevels = [[3.3, 2.4], [4.34, 1.7], [5.46, 0.96], [6.92, 0.07]] as const;
for (let level = 0; level < rearGableLevels.length - 1; level += 1) {
  const [y0, half0] = rearGableLevels[level];
  const [y1, half1] = rearGableLevels[level + 1];
  const strips: Array<readonly [number, number, number, number]> = y0 >= 4.34 && y1 <= 5.46
    ? [[-half0, -0.46, -half1, -0.46], [0.46, half0, 0.46, half1]]
    : [[-half0, half0, -half1, half1]];
  for (const [x0a, x0b, x1a, x1b] of strips) {
    const vertex = rearGableVertices.length;
    rearGableVertices.push(
      point(x0a, y0, -5.43), point(x0b, y0, -5.43),
      point(x1a, y1, -5.43), point(x1b, y1, -5.43),
    );
    rearGableTriangles.push([vertex, vertex + 3, vertex + 1], [vertex, vertex + 2, vertex + 3]);
  }
}
addMesh("rear-gable", "main-cladding", "cladding", rearGableVertices, rearGableTriangles, true);
addBeam("rear-gable-trim-left", "rear-trim", "paint-light", point(-2.4, 3.3, -5.54), point(-0.07, 6.92, -5.54), 0.12, 0.1);
addBeam("rear-gable-trim-right", "rear-trim", "paint-light", point(2.4, 3.3, -5.54), point(0.07, 6.92, -5.54), 0.12, 0.1);
addBox("rear-loft-opening", "rear-openings", "opening", point(0, 4.9, -5.38), point(0.82, 1.04, 0.08));
for (const x of [-0.46, 0.46]) {
  addBeam(`rear-loft-jamb-${x}`, "rear-openings", "paint-light", point(x, 4.34, -5.52), point(x, 5.46, -5.52), 0.1, 0.08);
}
for (const y of [4.34, 5.46]) {
  addBeam(`rear-loft-rail-${y}`, "rear-openings", "paint-light", point(-0.46, y, -5.52), point(0.46, y, -5.52), 0.1, 0.08);
}
addBeam("rear-loft-mullion", "rear-openings", "paint-light", point(0, 4.38, -5.53), point(0, 5.42, -5.53), 0.045, 0.04);
addBeam("rear-loft-transom", "rear-openings", "paint-light", point(-0.42, 4.9, -5.53), point(0.42, 4.9, -5.53), 0.045, 0.04);

// Principal roof planes follow the rafters; the ornamental front gable sits just ahead of them.
addMesh("main-roof-left", "roof-skin", "roof", [
  point(-2.62, ZAAN_HOUSE_EAVE_Y, -5.58), point(0, 7.06, -5.58), point(-2.62, ZAAN_HOUSE_EAVE_Y, 5.58), point(0, 7.06, 5.58),
], [[0, 1, 3], [0, 3, 2]], true);
addMesh("main-roof-right", "roof-skin", "roof", [
  point(0, 7.06, -5.58), point(2.62, ZAAN_HOUSE_EAVE_Y, -5.58), point(0, 7.06, 5.58), point(2.62, ZAAN_HOUSE_EAVE_Y, 5.58),
], [[0, 1, 3], [0, 3, 2]], true);
addBeam("roof-ridge-cap", "roof-skin", "roof", point(0, 7.06, -5.58), point(0, 7.06, 5.58), 0.18, 0.18);
for (const side of [-1, 1]) {
  addBeam(`main-eave-fascia-${side}`, "roof-skin", "roof", point(side * 2.54, 3.29, -5.58), point(side * 2.54, 3.29, 5.58), 0.18, 0.16);
}
for (const side of [-1, 1]) {
  for (let course = 1; course < 10; course += 1) {
    const t = course / 10;
    const x = side * 2.62 * (1 - t);
    const y = ZAAN_HOUSE_EAVE_Y + (7.06 - ZAAN_HOUSE_EAVE_Y) * t + 0.035;
    addBeam(`main-roof-tile-course-${side}-${course}`, "roof-skin", "roof", point(x, y, -5.58), point(x, y, 5.58), 0.025, 0.025);
  }
}

// Glazed front shop door and windows are assembled from openings, frames and muntins.
addPanel("front-door", "front-openings", point(0, 1.57, 5.41), 0.96, 2.16);
addMullions("front-door", "front-openings", point(0, 1.57, 5.41), 0.8, 1.96, 2, 4);
for (const x of [-1.28, 1.28]) {
  addPanel(`front-window-${x}`, "front-openings", point(x, 1.84, 5.41), 1.15, 1.62);
  addMullions(`front-window-${x}`, "front-openings", point(x, 1.84, 5.41), 1.02, 1.5, 3, 4);
  addBox(`front-shutter-${x}`, "front-openings", "paint-accent", point(x + Math.sign(x) * 0.79, 1.84, 5.59), point(0.34, 1.62, 0.11));
}
addPanel("front-loft-window", "front-openings", point(0, 4.84, 5.41), 0.78, 1.12);
addMullions("front-loft-window", "front-openings", point(0, 4.84, 5.41), 0.68, 1.0, 2, 3);
addBox("front-loft-shutter-left", "front-openings", "paint-accent", point(-0.59, 4.84, 5.59), point(0.34, 1.12, 0.11));
addBox("front-loft-shutter-right", "front-openings", "paint-accent", point(0.59, 4.84, 5.59), point(0.34, 1.12, 0.11));

for (const [index, z] of [-3.15, 0, 3.15].entries()) {
  addBox(`left-window-${index}-sill-infill`, "main-cladding", "cladding", point(-2.445, 0.94, z), point(0.12, 0.2, 1.14));
  addBox(`left-window-${index}-head-infill`, "main-cladding", "cladding", point(-2.445, 2.6, z), point(0.12, 0.16, 1.14));
  addBox(`left-window-${index}-opening`, "side-openings", "opening", point(-2.38, 1.78, z), point(0.09, 1.45, 1.02));
  for (const edgeZ of [z - 0.57, z + 0.57]) {
    addBeam(`left-window-${index}-jamb-${edgeZ}`, "side-openings", "paint-light", point(-2.56, 1.04, edgeZ), point(-2.56, 2.52, edgeZ), 0.1, 0.08);
  }
  for (const edgeY of [1.04, 2.52]) {
    addBeam(`left-window-${index}-rail-${edgeY}`, "side-openings", "paint-light", point(-2.56, edgeY, z - 0.57), point(-2.56, edgeY, z + 0.57), 0.1, 0.08);
  }
  addBeam(`left-window-${index}-mullion`, "side-openings", "paint-light", point(-2.57, 1.08, z), point(-2.57, 2.48, z), 0.045, 0.04);
  for (const y of [1.52, 2.0]) {
    addBeam(`left-window-${index}-transom-${y}`, "side-openings", "paint-light", point(-2.57, y, z - 0.52), point(-2.57, y, z + 0.52), 0.045, 0.04);
  }
}

// Crown post is structural at the ridge first, ornament second.
addBeam("crown-post-stem", "gable-trim", "paint-light", point(0, 6.8, 5.58), point(0, 7.52, 5.58), 0.14, 0.12);
addBox("crown-post-diamond", "gable-trim", "paint-light", point(0, 7.26, 5.58), point(0.34, 0.34, 0.12), point(0, 0, Math.PI / 4));
addCylinder("crown-post-finial", "gable-trim", "paint-light", point(0, 7.48, 5.58), point(0, 7.68, 5.58), 0.105, 12);

// Side workshop overlaps the main frame by 1.8 m, making the junction loadable and weather-tight.
const serviceCentreX = 2.7;
for (const x of [0.72, 4.68]) {
  addBeam(`service-sill-${x}`, "service-frame", "timber-dark", point(x, 0.48, -2.9), point(x, 0.48, 1.7), 0.24, 0.22);
}
for (const z of [-2.75, -0.6, 1.55]) {
  for (const x of [0.75, 4.65]) {
    addBeam(`service-post-${x}-${z}`, "service-frame", "timber-dark", point(x, 0.48, z), point(x, 2.5, z), 0.22, 0.22);
  }
  addBeam(`service-tie-${z}`, "service-frame", "timber-dark", point(0.68, 2.48, z), point(4.72, 2.48, z), 0.22, 0.22);
  addBeam(`service-rafter-left-${z}`, "service-frame", "timber-dark", point(0.6, 2.12, z), point(serviceCentreX, 3.7, z), 0.16, 0.18);
  addBeam(`service-rafter-right-${z}`, "service-frame", "timber-dark", point(serviceCentreX, 3.7, z), point(4.8, 2.12, z), 0.16, 0.18);
}
addBeam("service-ridge", "service-frame", "timber-dark", point(serviceCentreX, 3.73, -3.02), point(serviceCentreX, 3.73, 1.82), 0.18, 0.2);
for (let course = 0; course < 9; course += 1) {
  const y = 0.54 + course * 0.225;
  const cutsWindow = y + 0.135 > 0.92 && y - 0.135 < 2.18;
  const eastSegments = cutsWindow ? solidSegments(-3, 1.8, [[-1.12, 0.02]]) : [[-3, 1.8] as const];
  for (let segment = 0; segment < eastSegments.length; segment += 1) {
    const [z0, z1] = eastSegments[segment];
    addBox(`service-east-lap-${course}-segment-${segment}`, "service-cladding", "cladding", point(4.82, y, (z0 + z1) / 2), point(0.12, 0.27, z1 - z0));
  }
  const frontGaps: Array<readonly [number, number]> = [];
  if (y + 0.135 > 0.92 && y - 0.135 < 2.18) frontGaps.push([1.18, 2.26]);
  if (y + 0.135 > 0.48 && y - 0.135 < 2.38) frontGaps.push([3.08, 4.22]);
  const frontSegments = solidSegments(0.6, 4.8, frontGaps);
  for (let segment = 0; segment < frontSegments.length; segment += 1) {
    const [x0, x1] = frontSegments[segment];
    addBox(`service-front-lap-${course}-segment-${segment}`, "service-cladding", "cladding", point((x0 + x1) / 2, y, 1.82), point(x1 - x0, 0.27, 0.12));
  }
  addBox(`service-rear-lap-${course}`, "service-cladding", "cladding", point(serviceCentreX, y, -3.02), point(4.2, 0.27, 0.12));
}
for (const [id, z] of [["front", 1.83], ["rear", -3.03]] as const) {
  addMesh(`service-${id}-gable`, "service-cladding", "cladding", [
    point(0.6, 2.42, z), point(4.8, 2.42, z), point(serviceCentreX, 4.08, z),
  ], [[0, 1, 2]], true);
  addBeam(`service-${id}-gable-left-trim`, "service-trim", "paint-light", point(0.57, 2.42, z + (id === "front" ? 0.07 : -0.07)), point(serviceCentreX, 4.1, z + (id === "front" ? 0.07 : -0.07)), 0.11, 0.09);
  addBeam(`service-${id}-gable-right-trim`, "service-trim", "paint-light", point(serviceCentreX, 4.1, z + (id === "front" ? 0.07 : -0.07)), point(4.83, 2.42, z + (id === "front" ? 0.07 : -0.07)), 0.11, 0.09);
}
addMesh("service-roof-left", "service-roof", "roof", [
  point(0.55, 2.45, -3.08), point(serviceCentreX, 4.12, -3.08), point(0.55, 2.45, 1.88), point(serviceCentreX, 4.12, 1.88),
], [[0, 1, 3], [0, 3, 2]], true);
addMesh("service-roof-right", "service-roof", "roof", [
  point(serviceCentreX, 4.12, -3.08), point(4.85, 2.45, -3.08), point(serviceCentreX, 4.12, 1.88), point(4.85, 2.45, 1.88),
], [[0, 1, 3], [0, 3, 2]], true);
addBeam("service-outer-eave-fascia", "service-roof", "roof", point(4.78, 2.4, -3.08), point(4.78, 2.4, 1.88), 0.15, 0.14);
for (const side of [-1, 1]) {
  for (let course = 1; course < 6; course += 1) {
    const t = course / 6;
    const x = serviceCentreX + side * 2.15 * (1 - t);
    const y = 2.45 + (4.12 - 2.45) * t + 0.025;
    addBeam(`service-roof-tile-course-${side}-${course}`, "service-roof", "roof", point(x, y, -3.08), point(x, y, 1.88), 0.02, 0.02);
  }
}
addPanel("service-front-door", "service-openings", point(3.65, 1.43, 1.9), 1.12, 1.9);
addPanel("service-front-window", "service-openings", point(1.72, 1.55, 1.9), 1.05, 1.25);
addMullions("service-front-window", "service-openings", point(1.72, 1.55, 1.9), 0.93, 1.13, 2, 3);
addPanel("service-east-window", "service-openings", point(4.89, 1.55, -0.55), 1.12, 1.25, "z");

// The workshop is tied into two main yokes; a framed internal opening replaces an imaginary butt joint.
addBeam("service-junction-header", "service-junction", "timber-dark", point(2.1, 2.5, -2.72), point(2.1, 2.5, 1.52), 0.24, 0.24);
addBeam("service-junction-front-post", "service-junction", "timber-dark", point(2.1, 0.48, 1.52), point(2.1, 2.5, 1.52), 0.24, 0.24);
addBeam("service-junction-rear-post", "service-junction", "timber-dark", point(2.1, 0.48, -2.72), point(2.1, 2.5, -2.72), 0.24, 0.24);
addBeam("service-junction-brace", "service-junction", "timber-dark", point(2.1, 0.65, -2.55), point(2.1, 2.42, -1.35), 0.16, 0.18);

for (const part of parts) {
  if (part.material === "opening" && part.id.includes("window")) part.material = "glazing";
}

parts.push(
  ...dutchLampFixture({
    id: "front-room-lamp",
    group: "lighting-fixtures",
    lens: point(1.28, 2.43, 4.6),
    carrierPoint: point(1.28, 3.18, 4.6),
    carrier: "ceiling",
    lampClass: "domestic",
    poolGroupId: "dutch-polder:h1-house",
    priority: 2.5,
  }),
  ...dutchLampFixture({
    id: "workshop-lamp",
    group: "lighting-fixtures",
    lens: point(1.72, 1.84, 1.18),
    carrierPoint: point(1.72, 2.5, 1.18),
    carrier: "ceiling",
    lampClass: "work",
    poolGroupId: "dutch-polder:h1-house",
    priority: 1.8,
  }),
  ...dutchLampFixture({
    id: "front-entry-lantern",
    group: "lighting-fixtures",
    lens: point(1.08, 2.36, 5.8),
    carrierPoint: point(1.08, 2.48, 5.49),
    carrier: "wall-z",
    outward: 1,
    lampClass: "exterior",
    poolGroupId: "dutch-polder:h1-house",
    priority: 2.2,
  }),
);

export const zaanTimberMerchantHouseObject: ObjectLabModel = {
  id: "dutch-house-zaan-timber-merchant-h1",
  revision: "h1-2026-08-04-real-windows-a2",
  title: "Zaan timber merchant house + workshop — structural grey model",
  units: "metres",
  coordinates: { up: "+Y", front: "+Z", origin: "ground-centre" },
  sourceNotes: [
    "Het Jagershuis supplies the 1623 timber-merchant identity, black tarred shell, Gothic glazing and carved crown-post character.",
    "Kalverringdijk 8 confirms that the crown post joins rafters to the ridge and that a shore-side service volume belongs to the building system.",
    "Overall dimensions are authored at natural domestic scale; cladding courses, yokes, braces and the workshop junction are explicit geometry.",
  ],
  dimensions: {
    footprintWidth: ZAAN_HOUSE_FOOTPRINT_WIDTH,
    footprintDepth: ZAAN_HOUSE_FOOTPRINT_DEPTH,
    roofEnvelopeWidth: ZAAN_HOUSE_ROOF_ENVELOPE_WIDTH,
    roofEnvelopeDepth: ZAAN_HOUSE_ROOF_ENVELOPE_DEPTH,
    mainWidth: ZAAN_HOUSE_MAIN_WIDTH,
    eaveY: ZAAN_HOUSE_EAVE_Y,
    ridgeY: ZAAN_HOUSE_RIDGE_Y,
    crownPostTopY: 7.68,
    serviceWidth: ZAAN_HOUSE_SERVICE_WIDTH,
    serviceDepth: ZAAN_HOUSE_SERVICE_DEPTH,
    yokeCount: ZAAN_HOUSE_YOKE_COUNT,
  },
  labMetrics: [
    { label: "WALL WIDTH", value: ZAAN_HOUSE_FOOTPRINT_WIDTH, decimals: 1, signed: false },
    { label: "WALL DEPTH", value: ZAAN_HOUSE_FOOTPRINT_DEPTH, decimals: 1, signed: false },
    { label: "RIDGE", value: ZAAN_HOUSE_RIDGE_Y, decimals: 2 },
    { label: "YOKES", value: ZAAN_HOUSE_YOKE_COUNT, decimals: 0, signed: false, unit: "" },
  ],
  anchors: {
    groundCentre: point(0, 0, 0),
    frontDoor: point(0, 0.44, 5.53),
    mainFrameCentre: point(0, 0.48, 0),
    workshopJunction: point(2.1, 1.5, -0.6),
    crownPost: point(0, 7.68, 5.58),
  },
  motionConstraints: {
    staticObject: true,
    windSimulation: false,
  },
  parts,
  views: [
    { id: "front", label: "Front +Z · shaped merchant gable", projection: "orthographic", position: point(0.8, 4.1, 30), target: point(0.8, 3.7, 1), orthoHeight: 10.4 },
    { id: "left", label: "Left profile · deep main body", projection: "orthographic", position: point(-28, 4.1, 0), target: point(0.8, 3.6, 0), orthoHeight: 12.6 },
    { id: "rear", label: "Rear -Z · asymmetric workshop", projection: "orthographic", position: point(0.8, 4.0, -30), target: point(0.8, 3.5, -0.5), orthoHeight: 10.4 },
    { id: "right", label: "Right profile · workshop overlap", projection: "orthographic", position: point(31, 4.0, -0.2), target: point(0.8, 3.5, -0.2), orthoHeight: 12.6 },
    { id: "three-quarter-left", label: "3/4 left · house frontage", projection: "perspective", position: point(-16, 10.5, 20), target: point(0.7, 3.3, 0.4), fov: 34 },
    { id: "three-quarter-right", label: "3/4 right · attached workshop", projection: "perspective", position: point(20, 9.5, 18), target: point(0.8, 3.2, 0), fov: 34 },
    { id: "high-three-quarter", label: "High 3/4 · roof junction", projection: "perspective", position: point(17, 18, 18), target: point(1.1, 3.0, -0.2), fov: 36 },
    { id: "frame-cutaway", label: "Cutaway · five yokes + roof load path", projection: "perspective", position: point(-13, 8.5, 15), target: point(0, 3.0, 0), fov: 34, hiddenGroups: ["main-cladding", "front-openings", "side-openings", "rear-openings", "rear-trim", "gable-trim", "roof-skin", "service-cladding", "service-openings", "service-trim", "service-roof"] },
    { id: "junction-cutaway", label: "Cutaway · workshop junction", projection: "perspective", position: point(14, 6.4, 9), target: point(2.0, 2.0, -0.5), fov: 32, hiddenGroups: ["main-cladding", "front-openings", "side-openings", "rear-openings", "rear-trim", "gable-trim", "roof-skin", "roof-frame", "service-cladding", "service-openings", "service-trim", "service-roof"] },
    { id: "night-front", label: "Night · inhabited front and workshop", projection: "perspective", position: point(-11, 5.5, 14), target: point(1.0, 2.1, 3.2), fov: 34, lighting: "night" },
    { id: "silhouette", label: "Silhouette control", projection: "orthographic", position: point(0.8, 4.1, 30), target: point(0.8, 3.7, 1), orthoHeight: 10.4 },
  ],
};
