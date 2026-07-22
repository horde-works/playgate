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

// Cylinders collide as a 10-sided prism in the same unit space.
const PRISM_SIDES = 10;
const prismCorners: readonly (readonly [number, number, number])[] = [
  0,
  1,
].flatMap((ring) =>
  Array.from({ length: PRISM_SIDES }, (_, index) => {
    const angle = ((index + 0.5) / PRISM_SIDES) * Math.PI * 2;
    return [
      Math.cos(angle) * 0.5,
      ring === 0 ? -0.5 : 0.5,
      Math.sin(angle) * 0.5,
    ] as const;
  }),
);
const prismIndices: readonly number[] = (() => {
  const indices: number[] = [];
  for (let index = 0; index < PRISM_SIDES; index += 1) {
    const next = (index + 1) % PRISM_SIDES;
    const bottomA = index;
    const bottomB = next;
    const topA = PRISM_SIDES + index;
    const topB = PRISM_SIDES + next;
    indices.push(bottomA, topA, bottomB, bottomB, topA, topB);
  }
  for (let index = 1; index < PRISM_SIDES - 1; index += 1) {
    indices.push(0, index + 1, index);
    indices.push(PRISM_SIDES, PRISM_SIDES + index, PRISM_SIDES + index + 1);
  }
  return indices;
})();

function pieceColliderTemplate(piece: BreakablePieceDefinition): {
  readonly corners: readonly (readonly [number, number, number])[];
  readonly indices: readonly number[];
} {
  return piece.shape === "cylinder"
    ? { corners: prismCorners, indices: prismIndices }
    : { corners: cubeCorners, indices: cubeIndices };
}

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

  const totalVertices = pieces.reduce(
    (sum, piece) => sum + pieceColliderTemplate(piece).corners.length,
    0,
  );
  const totalIndices = pieces.reduce(
    (sum, piece) => sum + pieceColliderTemplate(piece).indices.length,
    0,
  );
  const vertices = new Float32Array(totalVertices * 3);
  const indices = new Uint32Array(totalIndices);
  const matrix = new Matrix4();
  const rotation = new Euler();
  const quaternion = new Quaternion();
  const corner = new Vector3();
  const position = new Vector3();
  const scale = new Vector3();
  let vertexOffset = 0;
  let indexOffset = 0;

  pieces.forEach((piece) => {
    const template = pieceColliderTemplate(piece);
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

    template.corners.forEach((source, cornerIndex) => {
      corner.set(source[0], source[1], source[2]).applyMatrix4(matrix);
      const targetIndex = (vertexOffset + cornerIndex) * 3;
      vertices[targetIndex] = corner.x;
      vertices[targetIndex + 1] = corner.y;
      vertices[targetIndex + 2] = corner.z;
    });
    template.indices.forEach((sourceIndex, index) => {
      indices[indexOffset + index] = vertexOffset + sourceIndex;
    });
    vertexOffset += template.corners.length;
    indexOffset += template.indices.length;
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
