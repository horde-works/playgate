import { useMemo } from "react";
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Euler,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from "three";
import {
  buildBoulderArchetype,
  type BoulderArchetype,
} from "../content/objects/kallur/kallurBoulderKitObject.ts";

export interface NaturalBoulderPlacement {
  readonly id: string;
  readonly archetype: string;
  readonly position: readonly [number, number, number];
  readonly rotation: readonly [number, number, number];
  readonly scale: readonly [number, number, number];
  /** Instance-colour ratio against the material's body colour. */
  readonly tint: readonly [number, number, number];
}

interface NaturalBoulderFieldProps {
  readonly archetypes: readonly BoulderArchetype[];
  readonly placements: readonly NaturalBoulderPlacement[];
  readonly material: MeshStandardMaterial;
}

const geometryCaches = new WeakMap<
  readonly BoulderArchetype[],
  Map<string, BufferGeometry>
>();
const CREASE_COSINE = Math.cos((44 * Math.PI) / 180);

/**
 * Shared natural-rock renderer. A biome owns its forms, placement law and
 * surface material; this module owns only crease-aware geometry and batching.
 */
function weldedGeometry(
  archetypes: readonly BoulderArchetype[],
  archetypeId: string,
): BufferGeometry | undefined {
  let cache = geometryCaches.get(archetypes);
  if (!cache) {
    cache = new Map();
    geometryCaches.set(archetypes, cache);
  }
  const cached = cache.get(archetypeId);
  if (cached) return cached;

  const archetype = archetypes.find((candidate) => candidate.id === archetypeId);
  if (!archetype) return undefined;
  const source = buildBoulderArchetype(archetype);
  const slotByKey = new Map<string, number>();
  const welded: number[][] = [];
  const remap = source.vertices.map(([x, y, z]) => {
    const key = `${x.toFixed(4)}:${y.toFixed(4)}:${z.toFixed(4)}`;
    let slot = slotByKey.get(key);
    if (slot === undefined) {
      slot = welded.length;
      welded.push([x, y, z]);
      slotByKey.set(key, slot);
    }
    return slot;
  });

  const faceNormals: number[][] = [];
  const facesByVertex = new Map<number, number[]>();
  source.triangles.forEach(([a, b, c], face) => {
    const va = welded[remap[a]];
    const vb = welded[remap[b]];
    const vc = welded[remap[c]];
    const ab = [vb[0] - va[0], vb[1] - va[1], vb[2] - va[2]];
    const ac = [vc[0] - va[0], vc[1] - va[1], vc[2] - va[2]];
    const cross = [
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0],
    ];
    const length = Math.hypot(...cross) || 1;
    faceNormals.push([cross[0] / length, cross[1] / length, cross[2] / length]);
    for (const corner of [a, b, c]) {
      const slot = remap[corner];
      const bucket = facesByVertex.get(slot) ?? [];
      bucket.push(face);
      facesByVertex.set(slot, bucket);
    }
  });

  const positions = new Float32Array(source.triangles.length * 9);
  const normals = new Float32Array(source.triangles.length * 9);
  source.triangles.forEach(([a, b, c], face) => {
    const faceNormal = faceNormals[face];
    [a, b, c].forEach((corner, cornerIndex) => {
      const slot = remap[corner];
      const vertex = welded[slot];
      let nx = 0;
      let ny = 0;
      let nz = 0;
      for (const neighbour of facesByVertex.get(slot) ?? []) {
        const candidate = faceNormals[neighbour];
        const agreement = faceNormal[0] * candidate[0]
          + faceNormal[1] * candidate[1]
          + faceNormal[2] * candidate[2];
        if (agreement >= CREASE_COSINE) {
          nx += candidate[0];
          ny += candidate[1];
          nz += candidate[2];
        }
      }
      const length = Math.hypot(nx, ny, nz) || 1;
      const write = face * 9 + cornerIndex * 3;
      positions[write] = vertex[0];
      positions[write + 1] = vertex[1];
      positions[write + 2] = vertex[2];
      normals[write] = nx / length;
      normals[write + 1] = ny / length;
      normals[write + 2] = nz / length;
    });
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new BufferAttribute(normals, 3));
  geometry.computeBoundingSphere();
  cache.set(archetypeId, geometry);
  return geometry;
}

function attachPieceAttributes(geometry: BufferGeometry, count: number): void {
  const fill = (values: readonly number[], size: number) => {
    const data = new Float32Array(count * size);
    for (let row = 0; row < count; row += 1) {
      for (let component = 0; component < size; component += 1) {
        data[row * size + component] = values[component];
      }
    }
    return new InstancedBufferAttribute(data, size);
  };
  geometry.setAttribute("materialAnchor", fill([0, 0, 0, 0], 4));
  geometry.setAttribute("bakedAoA", fill([1, 1, 1, 1], 4));
  geometry.setAttribute("bakedAoB", fill([1, 1, 1, 1], 4));
  geometry.setAttribute("bakedSkyExposure", fill([1], 1));
  geometry.setAttribute("materialFaceMaskPos", fill([0, 0, 0], 3));
  geometry.setAttribute("materialFaceMaskNeg", fill([0, 0, 0], 3));
  geometry.setAttribute("silicateJointBand", fill([0], 1));
  geometry.setAttribute("silicateJointTint", fill([0, 0, 0], 3));
}

export function NaturalBoulderField({
  archetypes,
  placements,
  material,
}: NaturalBoulderFieldProps) {
  const meshes = useMemo(() => {
    const byArchetype = new Map<string, NaturalBoulderPlacement[]>();
    for (const placement of placements) {
      const bucket = byArchetype.get(placement.archetype) ?? [];
      bucket.push(placement);
      byArchetype.set(placement.archetype, bucket);
    }
    const matrix = new Matrix4();
    const quaternion = new Quaternion();
    const scale = new Vector3();
    const position = new Vector3();
    const colour = new Color();
    const built: InstancedMesh[] = [];
    for (const [archetype, bucket] of byArchetype) {
      const base = weldedGeometry(archetypes, archetype);
      if (!base) continue;
      const geometry = base.clone();
      attachPieceAttributes(geometry, bucket.length);
      const mesh = new InstancedMesh(geometry, material, bucket.length);
      bucket.forEach((placement, index) => {
        position.set(...placement.position);
        quaternion.setFromEuler(new Euler(...placement.rotation));
        scale.set(...placement.scale);
        matrix.compose(position, quaternion, scale);
        mesh.setMatrixAt(index, matrix);
        mesh.setColorAt(index, colour.setRGB(...placement.tint));
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      built.push(mesh);
    }
    return built;
  }, [archetypes, material, placements]);

  return (
    <group>
      {meshes.map((mesh, index) => (
        <primitive key={index} object={mesh} />
      ))}
    </group>
  );
}
