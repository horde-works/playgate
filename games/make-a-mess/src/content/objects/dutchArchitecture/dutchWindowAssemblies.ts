import type {
  ObjectLabPart,
  ObjectMaterialId,
  ObjectPoint,
  ObjectTriangle,
} from "../dutchWindmills/objectModel.ts";

export type RectangularWindowOpening = {
  readonly id: string;
  readonly centerX: number;
  readonly centerY: number;
  readonly width: number;
  readonly height: number;
};

type FrustumOptions = {
  readonly id: string;
  readonly group: string;
  readonly material: ObjectMaterialId;
  readonly y0: number;
  readonly y1: number;
  readonly openings: readonly RectangularWindowOpening[];
};

type FacetedFrustumOptions = FrustumOptions & {
  readonly sides: number;
  readonly centerZ: number;
  readonly radius0: number;
  readonly radius1: number;
};

type RectangularFrustumOptions = FrustumOptions & {
  readonly halfX0: number;
  readonly halfZ0: number;
  readonly halfX1: number;
  readonly halfZ1: number;
};

const point = (x: number, y: number, z: number): ObjectPoint => [x, y, z];

const solidIntervals = (
  left: number,
  right: number,
  gaps: readonly (readonly [number, number])[],
) => {
  const intervals: Array<readonly [number, number, "outer" | "fixed", "outer" | "fixed"]> = [];
  let cursor = left;
  let leftKind: "outer" | "fixed" = "outer";
  for (const [gapLeft, gapRight] of [...gaps].sort((a, b) => a[0] - b[0])) {
    if (gapLeft > cursor + 1e-6) intervals.push([cursor, gapLeft, leftKind, "fixed"]);
    cursor = Math.max(cursor, gapRight);
    leftKind = "fixed";
  }
  if (cursor < right - 1e-6) intervals.push([cursor, right, leftKind, "outer"]);
  return intervals;
};

function addSegmentedFront(
  vertices: ObjectPoint[],
  triangles: ObjectTriangle[],
  y0: number,
  y1: number,
  leftAt: (y: number) => number,
  rightAt: (y: number) => number,
  frontAt: (y: number) => number,
  openings: readonly RectangularWindowOpening[],
) {
  const levels = [...new Set([
    y0,
    y1,
    ...openings.flatMap((opening) => [
      opening.centerY - opening.height / 2,
      opening.centerY + opening.height / 2,
    ]),
  ].filter((level) => level >= y0 - 1e-6 && level <= y1 + 1e-6))].sort((a, b) => a - b);

  for (let level = 0; level < levels.length - 1; level += 1) {
    const lowerY = levels[level];
    const upperY = levels[level + 1];
    if (upperY - lowerY < 1e-6) continue;
    const midY = (lowerY + upperY) / 2;
    const activeGaps = openings
      .filter((opening) => midY > opening.centerY - opening.height / 2 - 1e-6
        && midY < opening.centerY + opening.height / 2 + 1e-6)
      .map((opening) => [
        opening.centerX - opening.width / 2,
        opening.centerX + opening.width / 2,
      ] as const);
    const lowerLeft = leftAt(lowerY);
    const lowerRight = rightAt(lowerY);
    const upperLeft = leftAt(upperY);
    const upperRight = rightAt(upperY);
    for (const [left, right, leftKind, rightKind] of solidIntervals(
      Math.max(lowerLeft, upperLeft),
      Math.min(lowerRight, upperRight),
      activeGaps,
    )) {
      const x0Lower = leftKind === "outer" ? lowerLeft : left;
      const x0Upper = leftKind === "outer" ? upperLeft : left;
      const x1Lower = rightKind === "outer" ? lowerRight : right;
      const x1Upper = rightKind === "outer" ? upperRight : right;
      const start = vertices.length;
      vertices.push(
        point(x0Lower, lowerY, frontAt(lowerY)),
        point(x1Lower, lowerY, frontAt(lowerY)),
        point(x1Upper, upperY, frontAt(upperY)),
        point(x0Upper, upperY, frontAt(upperY)),
      );
      triangles.push([start, start + 1, start + 2], [start, start + 2, start + 3]);
    }
  }
}

/** Closed regular frustum whose +Z face is physically cut around each window. */
export function facetedFrustumWithFrontOpenings(options: FacetedFrustumOptions): ObjectLabPart[] {
  const { sides, y0, y1, centerZ, radius0, radius1 } = options;
  const vertices: ObjectPoint[] = [];
  const triangles: ObjectTriangle[] = [];
  const ring = (radius: number, y: number) => Array.from({ length: sides }, (_, index) => {
    const angle = (index / sides) * Math.PI * 2 + Math.PI / sides;
    return point(Math.sin(angle) * radius, y, centerZ + Math.cos(angle) * radius);
  });
  const lower = ring(radius0, y0);
  const upper = ring(radius1, y1);
  vertices.push(...lower, ...upper);
  for (let index = 0; index < sides - 1; index += 1) {
    const next = index + 1;
    triangles.push([index, next, sides + next], [index, sides + next, sides + index]);
  }
  for (let index = 1; index < sides - 1; index += 1) {
    triangles.push([0, index + 1, index]);
    triangles.push([sides, sides + index, sides + index + 1]);
  }
  const radiusAt = (y: number) => radius0 + (radius1 - radius0) * ((y - y0) / (y1 - y0));
  const faceHalfWidthAt = (y: number) => Math.sin(Math.PI / sides) * radiusAt(y);
  const frontAt = (y: number) => centerZ + Math.cos(Math.PI / sides) * radiusAt(y);
  addSegmentedFront(
    vertices,
    triangles,
    y0,
    y1,
    (y) => -faceHalfWidthAt(y),
    faceHalfWidthAt,
    frontAt,
    options.openings,
  );
  return [{
    kind: "mesh",
    id: options.id,
    group: options.group,
    material: options.material,
    vertices,
    triangles,
  }];
}

/** Closed rectangular frustum whose +Z face is physically cut around each window. */
export function rectangularFrustumWithFrontOpenings(options: RectangularFrustumOptions): ObjectLabPart[] {
  const { y0, y1, halfX0, halfX1, halfZ0, halfZ1 } = options;
  const vertices: ObjectPoint[] = [
    point(-halfX0, y0, -halfZ0), point(halfX0, y0, -halfZ0),
    point(halfX0, y0, halfZ0), point(-halfX0, y0, halfZ0),
    point(-halfX1, y1, -halfZ1), point(halfX1, y1, -halfZ1),
    point(halfX1, y1, halfZ1), point(-halfX1, y1, halfZ1),
  ];
  const triangles: ObjectTriangle[] = [
    [0, 1, 5], [0, 5, 4],
    [1, 2, 6], [1, 6, 5],
    [3, 0, 4], [3, 4, 7],
    [0, 3, 2], [0, 2, 1],
    [4, 5, 6], [4, 6, 7],
  ];
  const halfXAt = (y: number) => halfX0 + (halfX1 - halfX0) * ((y - y0) / (y1 - y0));
  const frontAt = (y: number) => halfZ0 + (halfZ1 - halfZ0) * ((y - y0) / (y1 - y0));
  addSegmentedFront(vertices, triangles, y0, y1, (y) => -halfXAt(y), halfXAt, frontAt, options.openings);
  return [{
    kind: "mesh",
    id: options.id,
    group: options.group,
    material: options.material,
    vertices,
    triangles,
  }];
}

type FrontWindowOptions = RectangularWindowOpening & {
  readonly group: string;
  readonly faceZAt: (y: number) => number;
  readonly wallDepth: number;
  readonly columns?: number;
  readonly rows?: number;
  readonly frameMaterial?: ObjectMaterialId;
  readonly interiorDepth?: number;
};

/** Frame, reveals and ordinary glass for one real +Z wall opening. */
export function frontWindowAssembly(options: FrontWindowOptions): ObjectLabPart[] {
  const {
    id, group, centerX, centerY, width, height, faceZAt, wallDepth,
    columns = 2, rows = 2, frameMaterial = "paint-light", interiorDepth = 0,
  } = options;
  const result: ObjectLabPart[] = [];
  const halfW = width / 2;
  const halfH = height / 2;
  const bottomY = centerY - halfH;
  const topY = centerY + halfH;
  const slope = Math.atan2(faceZAt(topY) - faceZAt(bottomY), height);
  const faceZ = faceZAt(centerY);
  const glassZ = faceZ - wallDepth * 0.42;
  const revealZ = faceZ - wallDepth / 2;
  const frame = 0.1;
  const reveal = 0.085;
  result.push({ kind: "box", id: `${id}:glass`, group: `${group}-glazing`, material: "glazing", center: point(centerX, centerY, glassZ), size: point(width - frame * 1.3, height - frame * 1.3, 0.035), rotation: point(slope, 0, 0) });
  result.push(
    { kind: "beam", id: `${id}:frame-left`, group: `${group}-trim`, material: frameMaterial, from: point(centerX - halfW, bottomY, faceZAt(bottomY) + 0.045), to: point(centerX - halfW, topY, faceZAt(topY) + 0.045), width: frame, depth: 0.09 },
    { kind: "beam", id: `${id}:frame-right`, group: `${group}-trim`, material: frameMaterial, from: point(centerX + halfW, bottomY, faceZAt(bottomY) + 0.045), to: point(centerX + halfW, topY, faceZAt(topY) + 0.045), width: frame, depth: 0.09 },
    { kind: "beam", id: `${id}:frame-head`, group: `${group}-trim`, material: frameMaterial, from: point(centerX - halfW, topY, faceZAt(topY) + 0.045), to: point(centerX + halfW, topY, faceZAt(topY) + 0.045), width: frame, depth: 0.09 },
    { kind: "beam", id: `${id}:frame-sill`, group: `${group}-trim`, material: frameMaterial, from: point(centerX - halfW, bottomY, faceZAt(bottomY) + 0.045), to: point(centerX + halfW, bottomY, faceZAt(bottomY) + 0.045), width: frame, depth: 0.09 },
    { kind: "box", id: `${id}:reveal-left`, group: `${group}-trim`, material: frameMaterial, center: point(centerX - halfW, centerY, revealZ), size: point(reveal, height, wallDepth), rotation: point(slope, 0, 0) },
    { kind: "box", id: `${id}:reveal-right`, group: `${group}-trim`, material: frameMaterial, center: point(centerX + halfW, centerY, revealZ), size: point(reveal, height, wallDepth), rotation: point(slope, 0, 0) },
    { kind: "box", id: `${id}:reveal-head`, group: `${group}-trim`, material: frameMaterial, center: point(centerX, topY, faceZAt(topY) - wallDepth / 2), size: point(width, reveal, wallDepth), rotation: point(slope, 0, 0) },
    { kind: "box", id: `${id}:reveal-sill`, group: `${group}-trim`, material: frameMaterial, center: point(centerX, bottomY, faceZAt(bottomY) - wallDepth / 2), size: point(width, reveal, wallDepth), rotation: point(slope, 0, 0) },
  );
  for (let column = 1; column < columns; column += 1) {
    const x = centerX - halfW + (column / columns) * width;
    result.push({ kind: "beam", id: `${id}:mullion-${column}`, group: `${group}-trim`, material: frameMaterial, from: point(x, bottomY + frame, faceZAt(bottomY + frame) + 0.055), to: point(x, topY - frame, faceZAt(topY - frame) + 0.055), width: 0.045, depth: 0.045 });
  }
  for (let row = 1; row < rows; row += 1) {
    const y = bottomY + (row / rows) * height;
    result.push({ kind: "beam", id: `${id}:transom-${row}`, group: `${group}-trim`, material: frameMaterial, from: point(centerX - halfW + frame, y, faceZAt(y) + 0.055), to: point(centerX + halfW - frame, y, faceZAt(y) + 0.055), width: 0.045, depth: 0.045 });
  }
  if (interiorDepth > 0) {
    result.push(
      { kind: "box", id: `${id}:interior-floor`, group: `${group}-interior-cladding`, material: "timber-mid", center: point(centerX, bottomY - 0.12, faceZ - interiorDepth / 2), size: point(width * 1.35, 0.16, interiorDepth), rotation: point(slope, 0, 0) },
      { kind: "box", id: `${id}:interior-back`, group: `${group}-interior-cladding`, material: "timber-dark", center: point(centerX, centerY, faceZ - interiorDepth), size: point(width * 1.35, height * 1.3, 0.12) },
    );
  }
  return result;
}

type SideWindowOptions = {
  readonly id: string;
  readonly group: string;
  readonly side: -1 | 1;
  readonly wallX: number;
  readonly centerY: number;
  readonly centerZ: number;
  readonly width: number;
  readonly height: number;
  readonly wallDepth: number;
  readonly columns?: number;
  readonly rows?: number;
};

/** Frame, reveals and ordinary glass for one real +/-X wall opening. */
export function sideWindowAssembly(options: SideWindowOptions): ObjectLabPart[] {
  const { id, group, side, wallX, centerY, centerZ, width, height, wallDepth, columns = 2, rows = 2 } = options;
  const result: ObjectLabPart[] = [];
  const halfW = width / 2;
  const halfH = height / 2;
  const outsideX = wallX + side * 0.045;
  const glassX = wallX - side * wallDepth * 0.42;
  const revealX = wallX - side * wallDepth / 2;
  result.push({ kind: "box", id: `${id}:glass`, group: `${group}-glazing`, material: "glazing", center: point(glassX, centerY, centerZ), size: point(0.035, height - 0.13, width - 0.13) });
  result.push(
    { kind: "beam", id: `${id}:frame-left`, group: `${group}-trim`, material: "paint-light", from: point(outsideX, centerY - halfH, centerZ - halfW), to: point(outsideX, centerY + halfH, centerZ - halfW), width: 0.1, depth: 0.09 },
    { kind: "beam", id: `${id}:frame-right`, group: `${group}-trim`, material: "paint-light", from: point(outsideX, centerY - halfH, centerZ + halfW), to: point(outsideX, centerY + halfH, centerZ + halfW), width: 0.1, depth: 0.09 },
    { kind: "beam", id: `${id}:frame-head`, group: `${group}-trim`, material: "paint-light", from: point(outsideX, centerY + halfH, centerZ - halfW), to: point(outsideX, centerY + halfH, centerZ + halfW), width: 0.1, depth: 0.09 },
    { kind: "beam", id: `${id}:frame-sill`, group: `${group}-trim`, material: "paint-light", from: point(outsideX, centerY - halfH, centerZ - halfW), to: point(outsideX, centerY - halfH, centerZ + halfW), width: 0.1, depth: 0.09 },
    { kind: "box", id: `${id}:reveal-left`, group: `${group}-trim`, material: "paint-light", center: point(revealX, centerY, centerZ - halfW), size: point(wallDepth, height, 0.085) },
    { kind: "box", id: `${id}:reveal-right`, group: `${group}-trim`, material: "paint-light", center: point(revealX, centerY, centerZ + halfW), size: point(wallDepth, height, 0.085) },
    { kind: "box", id: `${id}:reveal-head`, group: `${group}-trim`, material: "paint-light", center: point(revealX, centerY + halfH, centerZ), size: point(wallDepth, 0.085, width) },
    { kind: "box", id: `${id}:reveal-sill`, group: `${group}-trim`, material: "paint-light", center: point(revealX, centerY - halfH, centerZ), size: point(wallDepth, 0.085, width) },
  );
  for (let column = 1; column < columns; column += 1) {
    const z = centerZ - halfW + (column / columns) * width;
    result.push({ kind: "beam", id: `${id}:mullion-${column}`, group: `${group}-trim`, material: "paint-light", from: point(outsideX, centerY - halfH + 0.1, z), to: point(outsideX, centerY + halfH - 0.1, z), width: 0.045, depth: 0.045 });
  }
  for (let row = 1; row < rows; row += 1) {
    const y = centerY - halfH + (row / rows) * height;
    result.push({ kind: "beam", id: `${id}:transom-${row}`, group: `${group}-trim`, material: "paint-light", from: point(outsideX, y, centerZ - halfW + 0.1), to: point(outsideX, y, centerZ + halfW - 0.1), width: 0.045, depth: 0.045 });
  }
  return result;
}
