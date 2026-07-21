import { Euler, Matrix4, Quaternion, Vector3 } from "three";
import type {
  BreakableMaterial,
  BreakablePieceDefinition,
} from "./destructionScene";

export interface StaticColliderMeshDefinition {
  readonly id: string;
  readonly material: BreakableMaterial;
  readonly vertices: Float32Array;
  readonly indices: Uint32Array;
  readonly pieceCount: number;
}

const STATIC_COLLIDER_CHUNK_SIZE = 24;
const MAX_CACHED_MESHES = 512;
const meshCache = new Map<string, StaticColliderMeshDefinition>();
const cubeCorners = [
  [-0.5, -0.5, -0.5],
  [0.5, -0.5, -0.5],
  [0.5, 0.5, -0.5],
  [-0.5, 0.5, -0.5],
  [-0.5, -0.5, 0.5],
  [0.5, -0.5, 0.5],
  [0.5, 0.5, 0.5],
  [-0.5, 0.5, 0.5],
] as const;
const cubeIndices = [
  0, 2, 1, 0, 3, 2,
  4, 5, 6, 4, 6, 7,
  0, 1, 5, 0, 5, 4,
  3, 7, 6, 3, 6, 2,
  0, 4, 7, 0, 7, 3,
  1, 2, 6, 1, 6, 5,
] as const;

function chunkKey(piece: BreakablePieceDefinition): string {
  return `${Math.floor(piece.position[0] / STATIC_COLLIDER_CHUNK_SIZE)}:${Math.floor(
    piece.position[2] / STATIC_COLLIDER_CHUNK_SIZE,
  )}:${piece.material}`;
}

function pieceSetHash(pieces: readonly BreakablePieceDefinition[]): string {
  let hash = 2166136261;
  for (const piece of pieces) {
    for (let index = 0; index < piece.id.length; index += 1) {
      hash ^= piece.id.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
  }
  return `${pieces.length}:${hash >>> 0}:${pieces[0]?.id ?? "empty"}:${pieces.at(-1)?.id ?? "empty"}`;
}

function cacheMesh(
  key: string,
  mesh: StaticColliderMeshDefinition,
): StaticColliderMeshDefinition {
  meshCache.set(key, mesh);
  if (meshCache.size > MAX_CACHED_MESHES) {
    const oldest = meshCache.keys().next().value;
    if (oldest) {
      meshCache.delete(oldest);
    }
  }
  return mesh;
}

function buildChunkMesh(
  id: string,
  pieces: readonly BreakablePieceDefinition[],
): StaticColliderMeshDefinition {
  const cacheKey = `${id}:${pieceSetHash(pieces)}`;
  const cached = meshCache.get(cacheKey);
  if (cached) {
    meshCache.delete(cacheKey);
    meshCache.set(cacheKey, cached);
    return cached;
  }

  const vertices = new Float32Array(pieces.length * cubeCorners.length * 3);
  const indices = new Uint32Array(pieces.length * cubeIndices.length);
  const matrix = new Matrix4();
  const rotation = new Euler();
  const quaternion = new Quaternion();
  const corner = new Vector3();
  const position = new Vector3();
  const scale = new Vector3();

  pieces.forEach((piece, pieceIndex) => {
    position.set(...piece.position);
    rotation.set(
      piece.rotation?.[0] ?? 0,
      piece.rotation?.[1] ?? 0,
      piece.rotation?.[2] ?? 0,
      "XYZ",
    );
    scale.set(...piece.size);
    quaternion.setFromEuler(rotation);
    matrix.compose(position, quaternion, scale);

    const vertexOffset = pieceIndex * cubeCorners.length;
    cubeCorners.forEach((source, cornerIndex) => {
      corner.set(source[0], source[1], source[2]).applyMatrix4(matrix);
      const targetIndex = (vertexOffset + cornerIndex) * 3;
      vertices[targetIndex] = corner.x;
      vertices[targetIndex + 1] = corner.y;
      vertices[targetIndex + 2] = corner.z;
    });
    cubeIndices.forEach((sourceIndex, index) => {
      indices[pieceIndex * cubeIndices.length + index] =
        vertexOffset + sourceIndex;
    });
  });

  return cacheMesh(cacheKey, {
    id,
    material: pieces[0].material,
    vertices,
    indices,
    pieceCount: pieces.length,
  });
}

/**
 * Breakable voxels remain independent in gameplay and rendering, while the
 * quiet world is exposed to Rapier as a few exact triangle meshes. A break
 * changes only one 24 m chunk, so its collider is rebuilt with the same hole;
 * all other cached chunks keep their collider and acceleration structure.
 */
export function buildStaticColliderMeshes(
  pieces: readonly BreakablePieceDefinition[],
): readonly StaticColliderMeshDefinition[] {
  const chunks = new Map<string, BreakablePieceDefinition[]>();
  for (const piece of pieces) {
    if (piece.material === "foliage") {
      continue;
    }
    const key = chunkKey(piece);
    const chunk = chunks.get(key);
    if (chunk) {
      chunk.push(piece);
    } else {
      chunks.set(key, [piece]);
    }
  }

  return [...chunks].map(([id, chunkPieces]) =>
    buildChunkMesh(id, chunkPieces),
  );
}
