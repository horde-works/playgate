import { MeshStandardMaterial } from "three";
import {
  VIKING_BOULDER_ARCHETYPES,
  VIKING_BOULDER_BODY_COLOUR,
  vikingBoulderPlacements,
} from "../content/scenes/vikingVillageBoulders.ts";
import { getPieceMaterial } from "./materialTextures.ts";
import { NaturalBoulderField } from "./NaturalBoulders.tsx";

let boulderMaterial: MeshStandardMaterial | null = null;

function getVikingBoulderMaterial(): MeshStandardMaterial {
  if (boulderMaterial) return boulderMaterial;
  const material = getPieceMaterial("stone", VIKING_BOULDER_BODY_COLOUR);
  const pieceCompile = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    pieceCompile?.(shader, renderer);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vVikingBoulderLocal;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvVikingBoulderLocal = position.xyz;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vVikingBoulderLocal;
float mamVikingStoneHash(vec2 point) {
  return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453);
}
float mamVikingStoneNoise(vec2 point) {
  vec2 cell = floor(point);
  vec2 local = fract(point);
  local = local * local * (3.0 - 2.0 * local);
  return mix(
    mix(mamVikingStoneHash(cell), mamVikingStoneHash(cell + vec2(1.0, 0.0)), local.x),
    mix(mamVikingStoneHash(cell + vec2(0.0, 1.0)), mamVikingStoneHash(cell + vec2(1.0, 1.0)), local.x),
    local.y);
}`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
vec3 vikingStoneWorldNormal = inverseTransformDirection(normalize(vNormal), viewMatrix);
// Quiet mineral banding makes these old gneiss erratics unlike Kallur basalt.
float vikingStoneBand = sin(
  vVikingBoulderLocal.y * 15.0
  + vVikingBoulderLocal.x * 2.1
  + mamVikingStoneNoise(vVikingBoulderLocal.xz * 2.4) * 2.2
) * 0.5 + 0.5;
diffuseColor.rgb *= mix(0.91, 1.06, smoothstep(0.28, 0.76, vikingStoneBand) * 0.48);
// Pale lichen favours broad crowns; moss belongs mostly to the buried collar.
float vikingStoneLichenNoise = mamVikingStoneNoise(
  vVikingBoulderLocal.xz * 3.0 + vec2(vVikingBoulderLocal.y * 1.4)
);
float vikingStoneLichen = smoothstep(0.62, 0.81, vikingStoneLichenNoise)
  * smoothstep(0.42, 0.84, vikingStoneWorldNormal.y)
  * smoothstep(0.09, 0.36, vVikingBoulderLocal.y);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.39, 0.405, 0.31), vikingStoneLichen * 0.34);
float vikingStoneCollar = smoothstep(0.28, 0.035, vVikingBoulderLocal.y)
  * smoothstep(0.2, 0.72, vikingStoneWorldNormal.y * 0.5 + 0.5);
float vikingStoneMossNoise = mamVikingStoneNoise(vMaterialCoordinate.xz * 0.48);
vec3 vikingStoneMoss = mix(vec3(0.12, 0.17, 0.07), vec3(0.19, 0.235, 0.09), vikingStoneMossNoise);
diffuseColor.rgb = mix(diffuseColor.rgb, vikingStoneMoss, vikingStoneCollar * 0.5);`,
      );
  };
  material.customProgramCacheKey = () => "viking-boulder-gneiss-a01";
  material.needsUpdate = true;
  boulderMaterial = material;
  return material;
}

export function VikingBoulders() {
  return (
    <NaturalBoulderField
      archetypes={VIKING_BOULDER_ARCHETYPES}
      placements={vikingBoulderPlacements()}
      material={getVikingBoulderMaterial()}
    />
  );
}
