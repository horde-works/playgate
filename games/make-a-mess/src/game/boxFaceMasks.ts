/**
 * Face-exterior masks for multi-box bodies. A carved piece is re-expressed
 * as several flush axis-aligned boxes; the boundaries between them lie
 * INSIDE a continuous surface and must not receive edge decorations (bevel
 * highlights, edge wear, mortar seams) — those belong only to faces that are
 * actually exposed. For every box we check how much of each face is covered
 * by flush sibling boxes and flag covered faces as internal.
 */

export interface FaceMaskBox {
  readonly center: readonly [number, number, number];
  readonly size: readonly [number, number, number];
}

export interface BoxFaceMasks {
  /** 1 = exposed, 0 = internal; per axis for the +X/+Y/+Z faces. */
  readonly positive: readonly [number, number, number];
  /** 1 = exposed, 0 = internal; per axis for the -X/-Y/-Z faces. */
  readonly negative: readonly [number, number, number];
}

const FLUSH_TOLERANCE = 0.004;
const COVERAGE_THRESHOLD = 0.5;

const FULLY_EXPOSED: BoxFaceMasks = {
  positive: [1, 1, 1],
  negative: [1, 1, 1],
};

const FULLY_FLAT: BoxFaceMasks = {
  positive: [0, 0, 0],
  negative: [0, 0, 0],
};

function overlapLength(
  centerA: number,
  sizeA: number,
  centerB: number,
  sizeB: number,
): number {
  return (
    Math.min(centerA + sizeA / 2, centerB + sizeB / 2) -
    Math.max(centerA - sizeA / 2, centerB - sizeB / 2)
  );
}

function faceCoverage(
  boxes: readonly FaceMaskBox[],
  index: number,
  axis: number,
  sign: 1 | -1,
): number {
  const box = boxes[index];
  const facePlane = box.center[axis] + (sign * box.size[axis]) / 2;
  const axisB = (axis + 1) % 3;
  const axisC = (axis + 2) % 3;
  const faceArea = box.size[axisB] * box.size[axisC];
  if (faceArea <= 0) {
    return 1;
  }

  let covered = 0;
  for (let other = 0; other < boxes.length; other += 1) {
    if (other === index) {
      continue;
    }
    const neighbor = boxes[other];
    const neighborPlane =
      neighbor.center[axis] - (sign * neighbor.size[axis]) / 2;
    if (Math.abs(neighborPlane - facePlane) > FLUSH_TOLERANCE) {
      continue;
    }
    const overlapB = overlapLength(
      box.center[axisB],
      box.size[axisB],
      neighbor.center[axisB],
      neighbor.size[axisB],
    );
    const overlapC = overlapLength(
      box.center[axisC],
      box.size[axisC],
      neighbor.center[axisC],
      neighbor.size[axisC],
    );
    if (overlapB > FLUSH_TOLERANCE && overlapC > FLUSH_TOLERANCE) {
      // Sibling boxes are disjoint, so their projections onto this face
      // never overlap each other — plain summing is exact.
      covered += overlapB * overlapC;
    }
  }

  return covered / faceArea;
}

/**
 * Masks for every box of one body. Single-box bodies are fully exposed.
 */
export function computeBoxFaceMasks(
  boxes: readonly FaceMaskBox[],
  suppressExposedEdges = false,
): readonly BoxFaceMasks[] {
  if (suppressExposedEdges) {
    return boxes.map(() => FULLY_FLAT);
  }
  if (boxes.length <= 1) {
    return boxes.map(() => FULLY_EXPOSED);
  }

  return boxes.map((_, index) => {
    const positive: [number, number, number] = [1, 1, 1];
    const negative: [number, number, number] = [1, 1, 1];
    for (let axis = 0; axis < 3; axis += 1) {
      if (faceCoverage(boxes, index, axis, 1) >= COVERAGE_THRESHOLD) {
        positive[axis] = 0;
      }
      if (faceCoverage(boxes, index, axis, -1) >= COVERAGE_THRESHOLD) {
        negative[axis] = 0;
      }
    }
    return { positive, negative };
  });
}
