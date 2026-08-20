import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Shape,
  SphereGeometry,
} from "three";
import type { BreakablePieceDefinition } from "./destructionScene.ts";
import {
  pieceGeometryKind,
  visualMeshKey,
  visualProfileKey,
} from "./intactWorldBatching.ts";

export type CylinderLodSegments = 8 | 12 | 20;

export const CYLINDER_LOD_STEPS: readonly CylinderLodSegments[] = [8, 12, 20];

/** Upgrade 8→12 inside this range; drop 12→8 past the exit. */
export const CYLINDER_DISTANCE_FAR = 42;
export const CYLINDER_DISTANCE_FAR_EXIT = 48;
/** Upgrade 12→20 inside this range; drop 20→12 past the exit. */
export const CYLINDER_DISTANCE_NEAR = 16;
export const CYLINDER_DISTANCE_NEAR_EXIT = 20;

const UNIT_BOX = new BoxGeometry(1, 1, 1);
const UNIT_CYLINDER_20 = new CylinderGeometry(0.5, 0.5, 1, 20, 1);
const UNIT_CYLINDER_12 = new CylinderGeometry(0.5, 0.5, 1, 12, 1);
const UNIT_CYLINDER_8 = new CylinderGeometry(0.5, 0.5, 1, 8, 1);
const UNIT_SPHERE = new SphereGeometry(0.5, 48, 32);
const TRIANGULAR_SHEET_PROFILE = new Shape()
  .moveTo(-0.5, -1 / 3)
  .lineTo(0.5, -1 / 3)
  .lineTo(0, 2 / 3)
  .closePath();
const UNIT_TRIANGULAR_SHEET = new ExtrudeGeometry(TRIANGULAR_SHEET_PROFILE, {
  depth: 1,
  steps: 1,
  bevelEnabled: false,
}).translate(0, 0, -0.5);
const HEXAGONAL_SHEET_PROFILE = new Shape()
  .moveTo(0, -0.5)
  .lineTo(0.5, -0.22)
  .lineTo(0.5, 0.22)
  .lineTo(0, 0.5)
  .lineTo(-0.5, 0.22)
  .lineTo(-0.5, -0.22)
  .closePath();
const UNIT_HEXAGONAL_SHEET = new ExtrudeGeometry(HEXAGONAL_SHEET_PROFILE, {
  depth: 1,
  steps: 1,
  bevelEnabled: false,
}).translate(0, 0, -0.5);

const SHARED_GEOMETRIES = new Set<BufferGeometry>([
  UNIT_BOX,
  UNIT_CYLINDER_20,
  UNIT_CYLINDER_12,
  UNIT_CYLINDER_8,
  UNIT_SPHERE,
  UNIT_TRIANGULAR_SHEET,
  UNIT_HEXAGONAL_SHEET,
]);

/**
 * Tessellation for a unit cylinder. Thin rods never need 20 segments even
 * in the player's face; large columns keep 20. Distance LOD can reassign
 * geometry ids later — this floor is view-independent and free.
 */
export function cylinderLodSegments(
  piece: BreakablePieceDefinition,
): CylinderLodSegments {
  const radius = Math.max(piece.size[0], piece.size[2]) * 0.5;
  const length = piece.size[1];
  const major = Math.max(radius * 2, length);
  if (major < 0.35) return 8;
  if (major < 1.2) return 12;
  return 20;
}

/**
 * Distance may only lower tessellation. The size floor is the maximum:
 * a 8 cm rod never grows 20 sides even in the player's face.
 *
 * Hysteresis on `current` stops columns flickering when the camera
 * walks the threshold.
 */
export function cylinderDistanceLodSegments(
  sizeFloor: CylinderLodSegments,
  distance: number,
  current: CylinderLodSegments,
): CylinderLodSegments {
  let next: CylinderLodSegments = current;
  if (current === 8) {
    if (distance < CYLINDER_DISTANCE_FAR) next = 12;
  } else if (current === 12) {
    if (distance < CYLINDER_DISTANCE_NEAR) next = 20;
    else if (distance > CYLINDER_DISTANCE_FAR_EXIT) next = 8;
  } else if (distance > CYLINDER_DISTANCE_NEAR_EXIT) {
    next = 12;
  }
  return Math.min(next, sizeFloor) as CylinderLodSegments;
}

export function cylinderLodGeometry(
  segments: CylinderLodSegments,
): BufferGeometry {
  return segments === 8
    ? UNIT_CYLINDER_8
    : segments === 12
      ? UNIT_CYLINDER_12
      : UNIT_CYLINDER_20;
}

export function intactGeometryKey(piece: BreakablePieceDefinition): string {
  const kind = pieceGeometryKind(piece);
  if (kind === "cylinder") return `cylinder:${cylinderLodSegments(piece)}`;
  if (kind === "surfaceMesh") return `mesh:${visualMeshKey(piece)}`;
  if (kind === "surfacePolygon") return `poly:${visualProfileKey(piece)}`;
  return kind;
}

function surfacePolygonGeometry(
  profile: NonNullable<BreakablePieceDefinition["visualProfile"]>,
): ExtrudeGeometry {
  if (profile.vertices.length < 3) {
    throw new Error("A surface polygon needs at least three vertices");
  }
  const [[firstX, firstY], ...rest] = profile.vertices;
  const shape = new Shape().moveTo(firstX, firstY);
  for (const [x, y] of rest) {
    shape.lineTo(x, y);
  }
  shape.closePath();
  return new ExtrudeGeometry(shape, {
    depth: 1,
    steps: 1,
    bevelEnabled: false,
  }).translate(0, 0, -0.5);
}

function surfaceMeshGeometry(
  profile: NonNullable<BreakablePieceDefinition["visualMesh"]>,
): BufferGeometry {
  if (profile.vertices.length < 3 || profile.indices.length < 3) {
    throw new Error("A surface mesh needs vertices and triangle indices");
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new Float32BufferAttribute(
      profile.vertices.flatMap((vertex) => [...vertex]),
      3,
    ),
  );
  geometry.setAttribute(
    "uv",
    new Float32BufferAttribute(
      profile.vertices.flatMap(([x, y]) => [x + 0.5, y + 0.5]),
      2,
    ),
  );
  if (profile.normals) {
    if (profile.normals.length !== profile.vertices.length) {
      throw new Error("A surface mesh needs one normal per vertex");
    }
    geometry.setAttribute(
      "normal",
      new Float32BufferAttribute(
        profile.normals.flatMap((normal) => [...normal]),
        3,
      ),
    );
  }
  if (profile.colors) {
    if (profile.colors.length !== profile.vertices.length) {
      throw new Error("A surface mesh needs one colour per vertex");
    }
    geometry.setAttribute(
      "color",
      new Float32BufferAttribute(
        profile.colors.flatMap((color) => [...color]),
        3,
      ),
    );
  }
  geometry.setIndex([...profile.indices]);
  if (!profile.normals) geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function createIntactPieceGeometry(
  piece: BreakablePieceDefinition,
): BufferGeometry {
  const kind = pieceGeometryKind(piece);
  if (kind === "surfaceMesh") return surfaceMeshGeometry(piece.visualMesh!);
  if (kind === "surfacePolygon") {
    return surfacePolygonGeometry(piece.visualProfile!);
  }
  if (kind === "cylinder") return cylinderLodGeometry(cylinderLodSegments(piece));
  if (kind === "sphere") return UNIT_SPHERE;
  if (kind === "triangularSheet") return UNIT_TRIANGULAR_SHEET;
  if (kind === "hexagonalSheet") return UNIT_HEXAGONAL_SHEET;
  return UNIT_BOX;
}

export function isSharedIntactGeometry(geometry: BufferGeometry): boolean {
  return SHARED_GEOMETRIES.has(geometry);
}

/**
 * BatchedMesh requires every geometry in a batch to agree on indexed vs
 * non-indexed draw and on the same attribute set. Material batches merge
 * boxes, cylinders, spheres and authored meshes — normalize before addGeometry.
 */
export function prepareGeometryForBatchedMesh(
  geometry: BufferGeometry,
  options: { readonly vertexColors: boolean },
): BufferGeometry {
  const prepared = isSharedIntactGeometry(geometry)
    ? geometry.clone()
    : geometry;
  const position = prepared.getAttribute("position");
  if (!position) {
    throw new Error("Batched geometry needs a position attribute");
  }

  if (!prepared.getIndex()) {
    const indices = new Array<number>(position.count);
    for (let index = 0; index < position.count; index += 1) {
      indices[index] = index;
    }
    prepared.setIndex(indices);
  }

  if (!prepared.getAttribute("normal")) {
    prepared.computeVertexNormals();
  }

  if (!prepared.getAttribute("uv")) {
    const uvs = new Float32Array(position.count * 2);
    for (let index = 0; index < position.count; index += 1) {
      uvs[index * 2] = position.getX(index) + 0.5;
      uvs[index * 2 + 1] = position.getY(index) + 0.5;
    }
    prepared.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  }

  if (options.vertexColors) {
    if (!prepared.getAttribute("color")) {
      const colors = new Float32Array(position.count * 3);
      colors.fill(1);
      prepared.setAttribute("color", new Float32BufferAttribute(colors, 3));
    }
  } else if (prepared.getAttribute("color")) {
    prepared.deleteAttribute("color");
  }

  return prepared;
}

export function intactGeometryBudget(
  geometries: readonly BufferGeometry[],
): { readonly vertexCount: number; readonly indexCount: number } {
  let vertexCount = 0;
  let indexCount = 0;
  for (const geometry of geometries) {
    vertexCount += geometry.getAttribute("position")?.count ?? 0;
    indexCount += geometry.getIndex()?.count ?? 0;
  }
  return { vertexCount, indexCount };
}
