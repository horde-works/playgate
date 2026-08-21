import { useMemo } from "react";
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Euler,
  Vector3,
} from "three";
import {
  buildBoulderArchetype,
  KALLUR_BOULDER_ARCHETYPES,
} from "../content/objects/kallur/kallurBoulderKitObject.ts";
import { kallurBoulderPlacements } from "../content/scenes/kallur/kallurBoulderPlacements.ts";

/**
 * The accepted boulder kit in the world: SIX InstancedMesh, one per
 * archetype — ~1700 stones in six draw calls. Geometry is built once per
 * process (module memo below), matrices once per mount; nothing is
 * recomputed per frame or per launch beyond that (Igor's condition).
 * The invisible box pieces keep colliders and support. The lichen crown
 * is an ALBEDO mask (world-up + hash), not a lighting law — light stays
 * with its single owner.
 */

let archetypeGeometryCache: Map<string, BufferGeometry> | null = null;

function archetypeGeometries(): Map<string, BufferGeometry> {
  if (archetypeGeometryCache) return archetypeGeometryCache;
  const cache = new Map<string, BufferGeometry>();
  for (const archetype of KALLUR_BOULDER_ARCHETYPES) {
    const source = buildBoulderArchetype(archetype);
    const geometry = new BufferGeometry();
    const positions = new Float32Array(source.vertices.length * 3);
    source.vertices.forEach(([x, y, z], index) => {
      positions[index * 3] = x;
      positions[index * 3 + 1] = y;
      positions[index * 3 + 2] = z;
    });
    geometry.setAttribute("position", new BufferAttribute(positions, 3));
    geometry.setIndex(
      new BufferAttribute(
        new Uint16Array(source.triangles.flat()),
        1,
      ),
    );
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    cache.set(archetype.id, geometry);
  }
  archetypeGeometryCache = cache;
  return cache;
}

const boulderMaterial = new MeshStandardMaterial({
  color: "#ffffff",
  roughness: 0.94,
  metalness: 0,
});
boulderMaterial.onBeforeCompile = (shader) => {
  shader.vertexShader = shader.vertexShader
    .replace(
      "#include <common>",
      "#include <common>\nvarying vec3 vBoulderWorldNormal;\nvarying vec3 vBoulderWorld;",
    )
    .replace(
      "#include <worldpos_vertex>",
      `#include <worldpos_vertex>
vBoulderWorld = (modelMatrix * instanceMatrix * vec4(position, 1.0)).xyz;
vBoulderWorldNormal = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);`,
    );
  shader.fragmentShader = shader.fragmentShader
    .replace(
      "#include <common>",
      "#include <common>\nvarying vec3 vBoulderWorldNormal;\nvarying vec3 vBoulderWorld;",
    )
    .replace(
      "#include <map_fragment>",
      `#include <map_fragment>
// Lichen crowns (bible III): pale speckle on upward faces — the bright
// dots that make the reference hill "вкусно". Albedo only.
float lichenHash = fract(sin(dot(floor(vBoulderWorld.xz * 3.1),
  vec2(127.1, 311.7))) * 43758.5453);
float lichen = smoothstep(0.55, 0.9, vBoulderWorldNormal.y)
  * smoothstep(0.35, 0.75, lichenHash);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.76, 0.77, 0.72), lichen * 0.55);`,
    );
};

export function KallurBoulders() {
  const meshes = useMemo(() => {
    const geometries = archetypeGeometries();
    const placements = kallurBoulderPlacements();
    const byArchetype = new Map<string, typeof placements[number][]>();
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
      const geometry = geometries.get(archetype);
      if (!geometry) continue;
      const mesh = new InstancedMesh(geometry, boulderMaterial, bucket.length);
      bucket.forEach((placement, index) => {
        position.set(...placement.position);
        quaternion.setFromEuler(new Euler(...placement.rotation));
        scale.set(...placement.scale);
        matrix.compose(position, quaternion, scale);
        mesh.setMatrixAt(index, matrix);
        mesh.setColorAt(index, colour.set(placement.colour));
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      built.push(mesh);
    }
    return built;
  }, []);

  return (
    <group>
      {meshes.map((mesh, index) => (
        <primitive key={index} object={mesh} />
      ))}
    </group>
  );
}
