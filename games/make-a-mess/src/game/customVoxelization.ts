import {
  Box3,
  ShapeUtils,
  Triangle,
  Vector2,
  Vector3,
} from "three";
import type { BreakablePieceDefinition } from "./destructionScene.ts";
import {
  countOccupiedVoxels,
  createSolidVoxelBody,
  splitVoxelComponents,
  type VoxelBody,
  type VoxelBox,
} from "./voxelFracture.ts";

export interface CompiledCustomVoxelGeometry {
  readonly body: VoxelBody;
  readonly boxes: readonly VoxelBox[];
}

type LocalTriangle = readonly [Vector3, Vector3, Vector3];

const FACE_NEIGHBOURS = [
  [-1, 0, 0],
  [1, 0, 0],
  [0, -1, 0],
  [0, 1, 0],
  [0, 0, -1],
  [0, 0, 1],
] as const;

function voxelIndex(
  dimensions: VoxelBody["dimensions"],
  x: number,
  y: number,
  z: number,
): number {
  return x + dimensions[0] * (y + dimensions[1] * z);
}

function meshTriangles(piece: BreakablePieceDefinition): LocalTriangle[] {
  const mesh = piece.visualMesh;
  if (!mesh || mesh.vertices.length < 3 || mesh.indices.length < 3) {
    return [];
  }
  const vertices = mesh.vertices.map(([x, y, z]) =>
    new Vector3(
      x * piece.size[0],
      y * piece.size[1],
      z * piece.size[2],
    ));
  const triangles: LocalTriangle[] = [];
  for (let index = 0; index + 2 < mesh.indices.length; index += 3) {
    const a = vertices[mesh.indices[index]];
    const b = vertices[mesh.indices[index + 1]];
    const c = vertices[mesh.indices[index + 2]];
    if (a && b && c) {
      triangles.push([a, b, c]);
    }
  }
  return triangles;
}

function profileTriangles(piece: BreakablePieceDefinition): LocalTriangle[] {
  const profile = piece.visualProfile;
  if (!profile || profile.vertices.length < 3) {
    return [];
  }
  const outline = profile.vertices.map(([x, y]) =>
    new Vector2(x * piece.size[0], y * piece.size[1]));
  const capTriangles = ShapeUtils.triangulateShape(outline, []);
  const halfDepth = piece.size[2] / 2;
  const triangles: LocalTriangle[] = [];

  for (const [aIndex, bIndex, cIndex] of capTriangles) {
    const a = outline[aIndex];
    const b = outline[bIndex];
    const c = outline[cIndex];
    triangles.push(
      [
        new Vector3(a.x, a.y, halfDepth),
        new Vector3(b.x, b.y, halfDepth),
        new Vector3(c.x, c.y, halfDepth),
      ],
      [
        new Vector3(c.x, c.y, -halfDepth),
        new Vector3(b.x, b.y, -halfDepth),
        new Vector3(a.x, a.y, -halfDepth),
      ],
    );
  }

  for (let index = 0; index < outline.length; index += 1) {
    const next = (index + 1) % outline.length;
    const a = outline[index];
    const b = outline[next];
    const frontA = new Vector3(a.x, a.y, halfDepth);
    const frontB = new Vector3(b.x, b.y, halfDepth);
    const backA = new Vector3(a.x, a.y, -halfDepth);
    const backB = new Vector3(b.x, b.y, -halfDepth);
    triangles.push(
      [backA, frontB, frontA],
      [backA, backB, frontB],
    );
  }
  return triangles;
}

function customTriangles(piece: BreakablePieceDefinition): LocalTriangle[] {
  return piece.visualMesh
    ? meshTriangles(piece)
    : profileTriangles(piece);
}

function coordinateRange(
  minimum: number,
  maximum: number,
  bodySize: number,
  cellSize: number,
  dimension: number,
): readonly [number, number] {
  const first = Math.max(
    0,
    Math.min(
      dimension - 1,
      Math.floor((minimum + bodySize / 2) / cellSize),
    ),
  );
  const last = Math.max(
    0,
    Math.min(
      dimension - 1,
      Math.floor((maximum + bodySize / 2) / cellSize),
    ),
  );
  return [Math.min(first, last), Math.max(first, last)];
}

function rasterizeSurface(
  body: VoxelBody,
  triangles: readonly LocalTriangle[],
  shellThickness: number,
): Uint8Array {
  const occupied = new Uint8Array(body.occupied.length);
  const triangle = new Triangle();
  const triangleBounds = new Box3();
  const cell = new Box3();
  const halfThickness = Math.max(0, shellThickness) / 2;

  for (const [a, b, c] of triangles) {
    triangle.set(a, b, c);
    triangleBounds.makeEmpty();
    triangleBounds.expandByPoint(a);
    triangleBounds.expandByPoint(b);
    triangleBounds.expandByPoint(c);
    triangleBounds.expandByScalar(halfThickness);
    const [fromX, toX] = coordinateRange(
      triangleBounds.min.x,
      triangleBounds.max.x,
      body.size[0],
      body.cellSize[0],
      body.dimensions[0],
    );
    const [fromY, toY] = coordinateRange(
      triangleBounds.min.y,
      triangleBounds.max.y,
      body.size[1],
      body.cellSize[1],
      body.dimensions[1],
    );
    const [fromZ, toZ] = coordinateRange(
      triangleBounds.min.z,
      triangleBounds.max.z,
      body.size[2],
      body.cellSize[2],
      body.dimensions[2],
    );

    for (let z = fromZ; z <= toZ; z += 1) {
      for (let y = fromY; y <= toY; y += 1) {
        for (let x = fromX; x <= toX; x += 1) {
          cell.min.set(
            -body.size[0] / 2 + x * body.cellSize[0] - halfThickness,
            -body.size[1] / 2 + y * body.cellSize[1] - halfThickness,
            -body.size[2] / 2 + z * body.cellSize[2] - halfThickness,
          );
          cell.max.set(
            cell.min.x + body.cellSize[0] + halfThickness * 2,
            cell.min.y + body.cellSize[1] + halfThickness * 2,
            cell.min.z + body.cellSize[2] + halfThickness * 2,
          );
          if (triangle.intersectsBox(cell)) {
            occupied[voxelIndex(body.dimensions, x, y, z)] = 1;
          }
        }
      }
    }
  }
  return occupied;
}

function fillSolidInterior(body: VoxelBody, surface: Uint8Array): Uint8Array {
  const outside = new Uint8Array(surface.length);
  const queue: number[] = [];
  const [width, height, depth] = body.dimensions;
  const enqueue = (x: number, y: number, z: number): void => {
    const index = voxelIndex(body.dimensions, x, y, z);
    if (surface[index] || outside[index]) return;
    outside[index] = 1;
    queue.push(index);
  };

  for (let z = 0; z < depth; z += 1) {
    for (let y = 0; y < height; y += 1) {
      enqueue(0, y, z);
      enqueue(width - 1, y, z);
    }
  }
  for (let z = 0; z < depth; z += 1) {
    for (let x = 0; x < width; x += 1) {
      enqueue(x, 0, z);
      enqueue(x, height - 1, z);
    }
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      enqueue(x, y, 0);
      enqueue(x, y, depth - 1);
    }
  }

  const plane = width * height;
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const index = queue[cursor];
    const z = Math.floor(index / plane);
    const remainder = index - z * plane;
    const y = Math.floor(remainder / width);
    const x = remainder - y * width;
    for (const [dx, dy, dz] of FACE_NEIGHBOURS) {
      const nextX = x + dx;
      const nextY = y + dy;
      const nextZ = z + dz;
      if (
        nextX < 0 || nextY < 0 || nextZ < 0 ||
        nextX >= width || nextY >= height || nextZ >= depth
      ) {
        continue;
      }
      enqueue(nextX, nextY, nextZ);
    }
  }

  const occupied = surface.slice();
  for (let index = 0; index < occupied.length; index += 1) {
    if (!outside[index]) occupied[index] = 1;
  }
  return occupied;
}

/**
 * Compiles an exact authored surface into the dormant grid consumed by the
 * existing carve/component/debris pipeline. No live body or render instance
 * is created until the authored piece is actually damaged.
 */
export function compileCustomVoxelGeometry(
  piece: BreakablePieceDefinition,
  targetVoxelSize: number,
  maximumVoxels: number,
): CompiledCustomVoxelGeometry | null {
  const triangles = customTriangles(piece);
  if (triangles.length === 0) return null;

  const grid = createSolidVoxelBody(
    piece.size,
    piece.voxelization?.voxelSize ?? targetVoxelSize,
    maximumVoxels,
  );
  const mode = piece.voxelization?.mode ??
    (piece.visualMesh ? "shell" : "solid");
  const surface = rasterizeSurface(
    grid,
    triangles,
    mode === "shell" ? piece.voxelization?.thickness ?? 0 : 0,
  );
  const occupied = mode === "solid"
    ? fillSolidInterior(grid, surface)
    : surface;
  const rawBody: VoxelBody = { ...grid, occupied };
  const occupiedCount = countOccupiedVoxels(rawBody);
  if (occupiedCount === 0) return null;

  const rawVolume = occupiedCount *
    grid.cellSize[0] * grid.cellSize[1] * grid.cellSize[2];
  // Damage changes the representation, not the amount of material. Preserve
  // the same effective volume the structural runtime used before the hit;
  // thin shells can override the AABB fallback with an authored volume.
  const effectiveVolume = piece.volume && piece.volume > 0
    ? piece.volume
    : piece.size[0] * piece.size[1] * piece.size[2];
  const volumeScale = effectiveVolume / rawVolume;
  const body: VoxelBody = { ...rawBody, volumeScale };
  const boxes = splitVoxelComponents(body).flatMap(
    (component) => component.boxes,
  );
  return { body, boxes };
}
