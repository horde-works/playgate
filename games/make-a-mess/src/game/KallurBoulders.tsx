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
  KALLUR_BOULDER_ARCHETYPES,
} from "../content/objects/kallur/kallurBoulderKitObject.ts";
import {
  KALLUR_BOULDER_BODY_COLOUR,
  kallurBoulderPlacements,
} from "../content/scenes/kallur/kallurBoulderPlacements.ts";
import { getPieceMaterial } from "./materialTextures.ts";

/**
 * The accepted boulder kit in the world — six InstancedMesh, and the
 * SURFACE belongs to the world's own laws (Igor, 21.08, all four points
 * at once): the material is the piece pipeline's basalt via
 * getPieceMaterial, so the boulders breathe the same materialAtmosphere
 * air (they used to ignore the haze), wear the same stone micro-texture,
 * bump and wetness as every rock of Kallur, and their body tones are the
 * escarpment strata ratios via instanceColor. The polygon still owns the
 * SILHOUETTE; shading is smoothed by welding the facet soup into shared
 * vertices — the same smoothed-form reading the world's shells have. On
 * top ride two albedo masks only: lichen crowns (world-up + hash) and
 * the sod line at the base that converges to the turf statistics.
 * Geometry is built once per process; matrices once per mount.
 */

let geometryCache: Map<string, BufferGeometry> | null = null;

/** Weld the facet soup into shared vertices: polygonal silhouette, smooth shading. */
function weldedGeometry(archetypeId: string): BufferGeometry | undefined {
  if (!geometryCache) {
    geometryCache = new Map();
    for (const archetype of KALLUR_BOULDER_ARCHETYPES) {
      const source = buildBoulderArchetype(archetype);
      const index = new Map<string, number>();
      const positions: number[] = [];
      const remap: number[] = [];
      source.vertices.forEach(([x, y, z]) => {
        const key = `${x.toFixed(4)}:${y.toFixed(4)}:${z.toFixed(4)}`;
        let slot = index.get(key);
        if (slot === undefined) {
          slot = positions.length / 3;
          positions.push(x, y, z);
          index.set(key, slot);
        }
        remap.push(slot);
      });
      const indices: number[] = [];
      for (const [a, b, c] of source.triangles) {
        indices.push(remap[a], remap[b], remap[c]);
      }
      const geometry = new BufferGeometry();
      geometry.setAttribute(
        "position",
        new BufferAttribute(new Float32Array(positions), 3),
      );
      geometry.setIndex(new BufferAttribute(new Uint16Array(indices), 1));
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
      geometryCache.set(archetype.id, geometry);
    }
  }
  return geometryCache.get(archetypeId);
}

/** Neutral piece-pipeline attributes (the LandscapeSurface recipe). */
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

let boulderMaterial: MeshStandardMaterial | null = null;

function getBoulderMaterial(): MeshStandardMaterial {
  if (boulderMaterial) return boulderMaterial;
  // A PRIVATE cache entry (the colour string differs from every wall
  // stratum), so wrapping its compile hook cannot lichen the wall.
  const material = getPieceMaterial("basalt", KALLUR_BOULDER_BODY_COLOUR);
  const pieceCompile = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    pieceCompile?.(shader, renderer);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying float vBoulderLocalY;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvBoulderLocalY = position.y;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying float vBoulderLocalY;",
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
// Albedo masks only - light keeps its owner. Lichen crowns: the bright
// speckle of the reference (bible III), on upward faces of the tops.
vec3 boulderWorldNormal = inverseTransformDirection(normalize(vNormal), viewMatrix);
float boulderLichenHash = fract(sin(dot(floor(vMaterialCoordinate.xz * 2.7),
  vec2(127.1, 311.7))) * 43758.5453);
float boulderLichen = smoothstep(0.6, 0.92, boulderWorldNormal.y)
  * smoothstep(0.45, 0.8, boulderLichenHash)
  * smoothstep(0.2, 0.5, vBoulderLocalY);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.398, 0.415, 0.373), boulderLichen * 0.5);
// The sod line: the base converges to the turf's colour statistics, so
// the stone SITS in the hill instead of resting on it.
float boulderSod = smoothstep(0.3, 0.06, vBoulderLocalY)
  * smoothstep(0.25, 0.75, boulderWorldNormal.y * 0.5 + 0.5);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.153, 0.162, 0.061), boulderSod * 0.55);
// Beach boulders darken below the same waterline law as the sand.
float boulderWet = smoothstep(1.3, 0.7, vMaterialCoordinate.y);
diffuseColor.rgb *= 1.0 - boulderWet * 0.45;`,
      );
  };
  material.customProgramCacheKey = () => "kallur-boulder-basalt";
  material.needsUpdate = true;
  boulderMaterial = material;
  return material;
}

export function KallurBoulders() {
  const meshes = useMemo(() => {
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
    const material = getBoulderMaterial();
    const built: InstancedMesh[] = [];
    for (const [archetype, bucket] of byArchetype) {
      const base = weldedGeometry(archetype);
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
        // instanceColor is a RATIO against the body colour: the strata
        // tones of the escarpment, dark to mid.
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
  }, []);

  return (
    <group>
      {meshes.map((mesh, index) => (
        <primitive key={index} object={mesh} />
      ))}
    </group>
  );
}
