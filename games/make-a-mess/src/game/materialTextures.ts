import {
  CanvasTexture,
  Color,
  LinearFilter,
  LinearMipmapLinearFilter,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Vector3,
  type WebGLProgramParametersWithUniforms,
} from "three";
import { litWindowColor, type BreakableMaterial } from "./destructionScene.ts";
import { materialAppearanceProfiles } from "./materialAppearance.ts";

const glowMaterials: MeshStandardMaterial[] = [];

// Night-time glow for "lived-in" windows and lamp shades; driven by the
// day/night cycle.
export function setWindowGlow(intensity: number): void {
  for (const material of glowMaterials) {
    material.emissiveIntensity = intensity;
  }
}

// Compiled piece-material programs whose environment uniforms (sun-tinted
// fog, scene wetness) are updated once per frame by the day/night cycle.
const environmentShaders: WebGLProgramParametersWithUniforms[] = [];

export interface MaterialEnvironmentUpdate {
  readonly sunDirection: Vector3;
  readonly sunColor: Color;
  /** How strongly fog is tinted toward the sun (sunset haze). */
  readonly sunStrength: number;
  /** Scene-wide standing dampness 0..1. */
  readonly wetness: number;
}

export function updateMaterialEnvironment(
  update: MaterialEnvironmentUpdate,
): void {
  for (const shader of environmentShaders) {
    (shader.uniforms.uFogSunDirection.value as Vector3).copy(
      update.sunDirection,
    );
    (shader.uniforms.uFogSunColor.value as Color).copy(update.sunColor);
    shader.uniforms.uFogSunStrength.value = update.sunStrength;
    shader.uniforms.uWetness.value = update.wetness;
  }
}

const TEXTURE_SIZE = 128;

const photorealTextureUrls: Partial<Record<BreakableMaterial, string>> = {
  brick: "/games/make-a-mess/textures/brick.webp",
  wood: "/games/make-a-mess/textures/wood.webp",
  plaster: "/games/make-a-mess/textures/plaster.webp",
  concrete: "/games/make-a-mess/textures/concrete.webp",
  stone: "/games/make-a-mess/textures/stone.webp",
  basalt: "/games/make-a-mess/textures/stone.webp",
  graphiteStone: "/games/make-a-mess/textures/stone.webp",
  soil: "/games/make-a-mess/textures/soil.webp",
  earth: "/games/make-a-mess/textures/soil.webp",
  asphalt: "/games/make-a-mess/textures/asphalt.webp",
  steel: "/games/make-a-mess/textures/steel.webp",
};

const bumpScaleByMaterial: Record<BreakableMaterial, number> = {
  brick: 0.035,
  wood: 0.018,
  plaster: 0.012,
  concrete: 0.026,
  glass: 0,
  steel: 0.006,
  stone: 0.045,
  basalt: 0.052,
  graphiteStone: 0.04,
  darkGlass: 0,
  foliage: 0.034,
  grass: 0.042,
  soil: 0.035,
  earth: 0.032,
  asphalt: 0.018,
};

const textureLoader = new TextureLoader();
const textureCache = new Map<BreakableMaterial, Texture>();
const materialCache = new Map<string, MeshStandardMaterial>();

function createRandom(seed: number): () => number {
  let state = seed;

  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gray(context: CanvasRenderingContext2D, value: number, alpha = 1) {
  const channel = Math.round(Math.min(255, Math.max(0, value)));
  context.fillStyle = `rgba(${channel},${channel},${channel},${alpha})`;
}

function fillNoise(
  context: CanvasRenderingContext2D,
  random: () => number,
  base: number,
  spread: number,
  cell: number,
) {
  for (let y = 0; y < TEXTURE_SIZE; y += cell) {
    for (let x = 0; x < TEXTURE_SIZE; x += cell) {
      gray(context, base + (random() - 0.5) * spread);
      context.fillRect(x, y, cell, cell);
    }
  }
}

function drawMortarBorder(
  context: CanvasRenderingContext2D,
  random: () => number,
  depth: number,
) {
  for (let step = 0; step < depth; step += 1) {
    const shade = 148 - step * 9 + random() * 14;
    gray(context, shade, 0.55);
    context.fillRect(step, step, TEXTURE_SIZE - step * 2, 1.4);
    context.fillRect(
      step,
      TEXTURE_SIZE - step - 1.4,
      TEXTURE_SIZE - step * 2,
      1.4,
    );
    context.fillRect(step, step, 1.4, TEXTURE_SIZE - step * 2);
    context.fillRect(
      TEXTURE_SIZE - step - 1.4,
      step,
      1.4,
      TEXTURE_SIZE - step * 2,
    );
  }
}

function paintMaterial(
  context: CanvasRenderingContext2D,
  material: BreakableMaterial,
) {
  const random = createRandom(material.length * 977 + material.charCodeAt(0));

  switch (material) {
    case "brick": {
      fillNoise(context, random, 205, 44, 4);
      for (let index = 0; index < 9; index += 1) {
        gray(context, 178 + random() * 26, 0.5);
        const y = random() * TEXTURE_SIZE;
        context.fillRect(0, y, TEXTURE_SIZE, 1.5 + random() * 2.5);
      }
      for (let index = 0; index < 26; index += 1) {
        gray(context, 150 + random() * 40, 0.6);
        context.fillRect(
          random() * TEXTURE_SIZE,
          random() * TEXTURE_SIZE,
          1.5 + random() * 3,
          1.5 + random() * 3,
        );
      }
      drawMortarBorder(context, random, 7);
      break;
    }
    case "stone":
    case "basalt":
    case "graphiteStone": {
      fillNoise(context, random, 190, 66, 5);
      for (let index = 0; index < 14; index += 1) {
        gray(context, 150 + random() * 70, 0.4);
        context.beginPath();
        context.ellipse(
          random() * TEXTURE_SIZE,
          random() * TEXTURE_SIZE,
          6 + random() * 20,
          4 + random() * 12,
          random() * Math.PI,
          0,
          Math.PI * 2,
        );
        context.fill();
      }
      drawMortarBorder(context, random, 6);
      break;
    }
    case "grass":
    case "foliage": {
      fillNoise(context, random, 156, 58, 3);
      for (let index = 0; index < 95; index += 1) {
        const shade = 92 + random() * 95;
        context.strokeStyle = `rgba(${Math.round(shade * 0.65)},${Math.round(
          shade,
        )},${Math.round(shade * 0.48)},0.7)`;
        context.lineWidth = 0.8 + random() * 1.2;
        const x = random() * TEXTURE_SIZE;
        const y = random() * TEXTURE_SIZE;
        context.beginPath();
        context.moveTo(x, y + 2 + random() * 4);
        context.lineTo(x + (random() - 0.5) * 3, y);
        context.stroke();
      }
      break;
    }
    case "concrete": {
      fillNoise(context, random, 195, 34, 4);
      for (let index = 0; index < 60; index += 1) {
        gray(context, 130 + random() * 60, 0.6);
        context.fillRect(
          random() * TEXTURE_SIZE,
          random() * TEXTURE_SIZE,
          1 + random() * 2,
          1 + random() * 2,
        );
      }
      drawMortarBorder(context, random, 3);
      break;
    }
    case "wood": {
      fillNoise(context, random, 200, 26, 4);
      for (let stripe = 0; stripe < 30; stripe += 1) {
        const y = stripe * (TEXTURE_SIZE / 30) + (random() - 0.5) * 3;
        gray(context, 168 + random() * 56, 0.55);
        context.fillRect(0, y, TEXTURE_SIZE, 1 + random() * 2.4);
      }
      for (let knot = 0; knot < 3; knot += 1) {
        gray(context, 132 + random() * 30, 0.7);
        context.beginPath();
        context.ellipse(
          random() * TEXTURE_SIZE,
          random() * TEXTURE_SIZE,
          2.5 + random() * 3,
          5 + random() * 7,
          0,
          0,
          Math.PI * 2,
        );
        context.fill();
      }
      break;
    }
    case "plaster": {
      fillNoise(context, random, 228, 20, 3);
      for (let index = 0; index < 12; index += 1) {
        gray(context, 208 + random() * 26, 0.35);
        context.beginPath();
        context.arc(
          random() * TEXTURE_SIZE,
          random() * TEXTURE_SIZE,
          8 + random() * 22,
          random() * Math.PI,
          random() * Math.PI + 2,
        );
        context.lineWidth = 1.4;
        context.strokeStyle = context.fillStyle;
        context.stroke();
      }
      break;
    }
    case "steel": {
      fillNoise(context, random, 205, 14, 4);
      for (let x = 0; x < TEXTURE_SIZE; x += 1) {
        const wave = Math.sin((x / TEXTURE_SIZE) * Math.PI * 10);
        gray(context, 196 + wave * 34, 0.75);
        context.fillRect(x, 0, 1, TEXTURE_SIZE);
      }
      for (let index = 0; index < 10; index += 1) {
        gray(context, 165 + random() * 30, 0.4);
        context.fillRect(random() * TEXTURE_SIZE, random() * TEXTURE_SIZE, 2, 2);
      }
      break;
    }
    case "glass":
    case "darkGlass": {
      fillNoise(context, random, 246, 8, 8);
      context.lineWidth = 1.2;
      for (let index = 0; index < 5; index += 1) {
        gray(context, 255, 0.5);
        context.strokeStyle = context.fillStyle;
        const offset = random() * TEXTURE_SIZE;
        context.beginPath();
        context.moveTo(offset, 0);
        context.lineTo(offset - TEXTURE_SIZE * 0.5, TEXTURE_SIZE);
        context.stroke();
      }
      break;
    }
    case "asphalt": {
      fillNoise(context, random, 205, 44, 3);
      for (let index = 0; index < 80; index += 1) {
        gray(context, 150 + random() * 60, 0.65);
        context.fillRect(
          random() * TEXTURE_SIZE,
          random() * TEXTURE_SIZE,
          1 + random() * 1.6,
          1 + random() * 1.6,
        );
      }
      context.lineWidth = 1.1;
      for (let index = 0; index < 3; index += 1) {
        gray(context, 132 + random() * 24, 0.55);
        context.strokeStyle = context.fillStyle;
        context.beginPath();
        let px = random() * TEXTURE_SIZE;
        let py = random() * TEXTURE_SIZE;
        context.moveTo(px, py);
        for (let step = 0; step < 4; step += 1) {
          px += (random() - 0.5) * 46;
          py += (random() - 0.5) * 46;
          context.lineTo(px, py);
        }
        context.stroke();
      }
      break;
    }
    case "earth": {
      fillNoise(context, random, 185, 68, 4);
      for (let index = 0; index < 60; index += 1) {
        gray(context, 110 + random() * 70, 0.7);
        context.beginPath();
        context.ellipse(
          random() * TEXTURE_SIZE,
          random() * TEXTURE_SIZE,
          1.5 + random() * 4,
          1 + random() * 2.6,
          random() * Math.PI,
          0,
          Math.PI * 2,
        );
        context.fill();
      }
      for (let index = 0; index < 8; index += 1) {
        gray(context, 205 + random() * 40, 0.6);
        context.fillRect(
          random() * TEXTURE_SIZE,
          random() * TEXTURE_SIZE,
          2 + random() * 3,
          2 + random() * 2,
        );
      }
      break;
    }
    case "soil": {
      fillNoise(context, random, 172, 76, 4);
      for (let index = 0; index < 46; index += 1) {
        gray(context, 96 + random() * 70, 0.65);
        context.beginPath();
        context.arc(
          random() * TEXTURE_SIZE,
          random() * TEXTURE_SIZE,
          1 + random() * 3.2,
          0,
          Math.PI * 2,
        );
        context.fill();
      }
      break;
    }
    default:
      fillNoise(context, random, 210, 30, 4);
  }
}

function createProceduralTexture(
  material: BreakableMaterial,
): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = TEXTURE_SIZE;
  canvas.height = TEXTURE_SIZE;
  const context = canvas.getContext("2d");
  if (context) {
    gray(context, 205);
    context.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
    paintMaterial(context, material);
  }

  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.anisotropy = 4;
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function configureTexture(texture: Texture): Texture {
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.anisotropy = 8;
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

export function getMaterialTexture(
  material: BreakableMaterial,
): Texture {
  const cached = textureCache.get(material);
  if (cached) {
    return cached;
  }

  const sourceUrl = photorealTextureUrls[material];
  let texture: Texture;
  if (sourceUrl) {
    texture = configureTexture(
      textureLoader.load(sourceUrl, undefined, undefined, () => {
        const fallback = createProceduralTexture(material);
        texture.image = fallback.image;
        texture.needsUpdate = true;
      }),
    );
  } else {
    texture = createProceduralTexture(material);
  }

  textureCache.set(material, texture);
  return texture;
}

export function getPieceMaterial(
  material: BreakableMaterial,
  color: string,
): MeshStandardMaterial {
  const key = `${material}:${color}`;
  const cached = materialCache.get(key);
  if (cached) {
    return cached;
  }

  const isGlass = isGlassMaterial(material);
  const isSteel = material === "steel";
  const isDarkStone =
    material === "basalt" || material === "graphiteStone";
  const isEyeGlass =
    material === "darkGlass" &&
    (color === "#ff5a2f" || color === "#9f241a");
  const surfaceTexture = getMaterialTexture(material);
  const appearance = materialAppearanceProfiles[material];
  const standardMaterial = new MeshStandardMaterial({
    color,
    map: surfaceTexture,
    bumpMap: isGlass ? null : surfaceTexture,
    bumpScale: bumpScaleByMaterial[material],
    transparent: isGlass,
    opacity: material === "darkGlass" ? 0.68 : isGlass ? 0.45 : 1,
    depthWrite: !isGlass,
    metalness: isSteel ? 0.78 : material === "graphiteStone" ? 0.08 : 0,
    roughness: isSteel
      ? 0.38
      : isGlass
        ? 0.16
        : isDarkStone
          ? 0.86
        : material === "wood"
          ? 0.76
          : material === "asphalt"
            ? 0.88
            : 0.94,
    envMapIntensity: isSteel ? 1.1 : isGlass ? 1.5 : 0.35,
  });

  if (!isGlass) {
    const profileKey = [
      appearance.textureScale,
      appearance.macroVariation,
      appearance.roughnessVariation,
      appearance.edgeWear,
      appearance.groundDampness,
      appearance.topLightening,
      ...appearance.sideTint,
      Number(appearance.directionalGrain),
      appearance.wetness,
      appearance.streaking,
    ].join(":");

    standardMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.uFogSunDirection = { value: new Vector3(0.4, 0.7, 0.5) };
      shader.uniforms.uFogSunColor = { value: new Color("#ffd9a0") };
      shader.uniforms.uFogSunStrength = { value: 0.0 };
      shader.uniforms.uWetness = { value: 0.0 };
      environmentShaders.push(shader);

      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          `#include <common>
attribute vec3 materialAnchor;
attribute float silicateJointBand;
attribute vec3 silicateJointTint;
attribute vec4 bakedAoA;
attribute vec4 bakedAoB;
attribute float bakedSkyExposure;
attribute vec3 materialFaceMaskPos;
attribute vec3 materialFaceMaskNeg;
varying vec3 vMaterialCoordinate;
varying vec3 vMaterialSurfaceNormal;
varying vec3 vMaterialBoxPosition;
varying vec3 vMaterialWorldScale;
varying float vMaterialMacro;
varying float vMaterialRoughnessNoise;
varying float vSilicateJointBand;
varying vec3 vSilicateJointTint;
varying float vBakedAo;
varying float vBakedSky;
varying vec3 vMaterialFaceMaskPos;
varying vec3 vMaterialFaceMaskNeg;
varying vec3 vBevelAxisX;
varying vec3 vBevelAxisY;
varying vec3 vBevelAxisZ;

float materialVertexMacroNoise(vec3 coordinate) {
  float broad = sin(dot(coordinate, vec3(0.173, 0.119, 0.137)) + 0.7);
  float crossBand = sin(dot(coordinate, vec3(-0.071, 0.193, 0.227)) + 2.1);
  float fineBand = sin(dot(coordinate, vec3(0.311, -0.083, 0.149)) + 4.7);
  return clamp(0.5 + broad * 0.22 + crossBand * 0.17 + fineBand * 0.08, 0.0, 1.0);
}`,
        )
        .replace(
          "#include <uv_vertex>",
          `#include <uv_vertex>
vec3 materialInstanceScale = vec3(
  length(instanceMatrix[0].xyz),
  length(instanceMatrix[1].xyz),
  length(instanceMatrix[2].xyz)
);
vMaterialCoordinate = materialAnchor + position * materialInstanceScale;
vMaterialSurfaceNormal = normal;
vMaterialBoxPosition = position;
vMaterialWorldScale = materialInstanceScale;
vMaterialMacro = materialVertexMacroNoise(vMaterialCoordinate);
vMaterialRoughnessNoise = materialVertexMacroNoise(vMaterialCoordinate + vec3(5.7, 2.9, 8.3));
vSilicateJointBand = silicateJointBand;
vSilicateJointTint = silicateJointTint;

// Baked corner ambient occlusion: this vertex IS one of the 8 box corners,
// so sign-select its value; the rasterizer interpolates across each face.
vec4 bakedAoGroup = mix(bakedAoA, bakedAoB, step(0.0, position.z));
vec2 bakedAoPair = mix(bakedAoGroup.xz, bakedAoGroup.yw, step(0.0, position.x));
vBakedAo = mix(bakedAoPair.x, bakedAoPair.y, step(0.0, position.y));
vBakedSky = bakedSkyExposure;

// Instance axes in view space, for screen-space edge bevels.
mat3 materialInstanceRotation = mat3(instanceMatrix);
vBevelAxisX = normalize(normalMatrix * (materialInstanceRotation * vec3(1.0, 0.0, 0.0)));
vBevelAxisY = normalize(normalMatrix * (materialInstanceRotation * vec3(0.0, 1.0, 0.0)));
vBevelAxisZ = normalize(normalMatrix * (materialInstanceRotation * vec3(0.0, 0.0, 1.0)));
vMaterialFaceMaskPos = materialFaceMaskPos;
vMaterialFaceMaskNeg = materialFaceMaskNeg;

vec3 materialProjectionNormal = abs(normal);
vec2 materialProjectedUv;
${appearance.directionalGrain ? `
if (materialInstanceScale.x >= materialInstanceScale.y && materialInstanceScale.x >= materialInstanceScale.z) {
  materialProjectedUv = vec2(vMaterialCoordinate.x, materialProjectionNormal.y > materialProjectionNormal.z ? vMaterialCoordinate.z : vMaterialCoordinate.y);
} else if (materialInstanceScale.y >= materialInstanceScale.z) {
  materialProjectedUv = vec2(vMaterialCoordinate.y, materialProjectionNormal.x > materialProjectionNormal.z ? vMaterialCoordinate.z : vMaterialCoordinate.x);
} else {
  materialProjectedUv = vec2(vMaterialCoordinate.z, materialProjectionNormal.x > materialProjectionNormal.y ? vMaterialCoordinate.y : vMaterialCoordinate.x);
}` : `
if (materialProjectionNormal.x >= materialProjectionNormal.y && materialProjectionNormal.x >= materialProjectionNormal.z) {
  materialProjectedUv = vec2(vMaterialCoordinate.z, vMaterialCoordinate.y);
} else if (materialProjectionNormal.y >= materialProjectionNormal.z) {
  materialProjectedUv = vec2(vMaterialCoordinate.x, vMaterialCoordinate.z);
} else {
  materialProjectedUv = vec2(vMaterialCoordinate.x, vMaterialCoordinate.y);
}`}
#ifdef USE_MAP
  vMapUv = materialProjectedUv * ${appearance.textureScale.toFixed(4)};
#endif
#ifdef USE_BUMPMAP
  vBumpMapUv = materialProjectedUv * ${appearance.textureScale.toFixed(4)};
#endif`,
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
varying vec3 vMaterialCoordinate;
varying vec3 vMaterialSurfaceNormal;
varying vec3 vMaterialBoxPosition;
varying vec3 vMaterialWorldScale;
varying float vMaterialMacro;
varying float vMaterialRoughnessNoise;
varying float vSilicateJointBand;
varying vec3 vSilicateJointTint;
varying float vBakedAo;
varying float vBakedSky;
varying vec3 vMaterialFaceMaskPos;
varying vec3 vMaterialFaceMaskNeg;
varying vec3 vBevelAxisX;
varying vec3 vBevelAxisY;
varying vec3 vBevelAxisZ;
uniform vec3 uFogSunDirection;
uniform vec3 uFogSunColor;
uniform float uFogSunStrength;
uniform float uWetness;

float materialValueNoise(vec2 p) {
  vec2 cellIndex = floor(p);
  vec2 cellFraction = fract(p);
  cellFraction = cellFraction * cellFraction * (3.0 - 2.0 * cellFraction);
  float a = fract(sin(dot(cellIndex, vec2(127.1, 311.7))) * 43758.5453);
  float b = fract(sin(dot(cellIndex + vec2(1.0, 0.0), vec2(127.1, 311.7))) * 43758.5453);
  float c = fract(sin(dot(cellIndex + vec2(0.0, 1.0), vec2(127.1, 311.7))) * 43758.5453);
  float d = fract(sin(dot(cellIndex + vec2(1.0, 1.0), vec2(127.1, 311.7))) * 43758.5453);
  return mix(mix(a, b, cellFraction.x), mix(c, d, cellFraction.x), cellFraction.y);
}

float materialColumnNoise(float h) {
  float columnIndex = floor(h);
  float columnFraction = fract(h);
  columnFraction = columnFraction * columnFraction * (3.0 - 2.0 * columnFraction);
  float a = fract(sin(columnIndex * 127.1) * 43758.5453);
  float b = fract(sin((columnIndex + 1.0) * 127.1) * 43758.5453);
  return mix(a, b, columnFraction);
}`,
        )
        .replace(
          "#include <map_fragment>",
          `#include <map_fragment>
float materialMacro = vMaterialMacro;
float materialUp = smoothstep(0.35, 0.92, max(vMaterialSurfaceNormal.y, 0.0));
float materialNearGround = 1.0 - smoothstep(-0.4, 3.2, vMaterialCoordinate.y);
// Per-face exterior mask: faces flush against a sibling box of the same
// carved body are interior surface, not real edges — no wear, no seams,
// no bevel there.
vec3 materialExternalMask = mix(
  vMaterialFaceMaskNeg,
  vMaterialFaceMaskPos,
  step(0.0, vMaterialBoxPosition)
);
vec3 materialEdgeDistance = mix(
  vec3(1.0),
  vec3(0.5) - abs(vMaterialBoxPosition),
  materialExternalMask
);
float materialEdgeInterior = max(
  max(min(materialEdgeDistance.x, materialEdgeDistance.y), min(materialEdgeDistance.y, materialEdgeDistance.z)),
  min(materialEdgeDistance.z, materialEdgeDistance.x)
);
float materialEdge = 1.0 - smoothstep(0.012, 0.07, materialEdgeInterior);
vec3 materialSideTint = vec3(${appearance.sideTint.map((value) => value.toFixed(4)).join(", ")});
diffuseColor.rgb *= mix(materialSideTint, vec3(1.0), materialUp);
diffuseColor.rgb *= 1.0 + (materialMacro - 0.5) * ${(appearance.macroVariation * 2).toFixed(4)};
diffuseColor.rgb *= 1.0 - materialNearGround * ${appearance.groundDampness.toFixed(4)};
diffuseColor.rgb *= 1.0 + materialUp * ${appearance.topLightening.toFixed(4)};
diffuseColor.rgb *= 1.0 + materialEdge * ${appearance.edgeWear.toFixed(4)};
// Silicate mortar seams baked into the base pass. Instances without the
// per-instance attributes read band 0.0 and skip the mix, so this replaces
// the former second (transparent, expanded-shell) draw of the same blocks.
float silicateJoint = vSilicateJointBand > 0.0001
  ? (1.0 - smoothstep(vSilicateJointBand, vSilicateJointBand * 1.8, materialEdgeInterior)) * 0.92
  : 0.0;
diffuseColor.rgb = mix(diffuseColor.rgb, vSilicateJointTint, silicateJoint);

// Weathering streaks: dust and rain residue running down vertical faces
// from their top edges, in irregular columns.
float materialStreakDepth = (0.5 - vMaterialBoxPosition.y) * vMaterialWorldScale.y;
float materialStreakColumnCoord = dot(vMaterialCoordinate.xz, vec2(1.0, 0.83));
float materialStreakNoise =
  materialColumnNoise(materialStreakColumnCoord * 2.7) * 0.6 +
  materialColumnNoise(materialStreakColumnCoord * 7.1) * 0.4;
materialStreakNoise = smoothstep(0.48, 0.95, materialStreakNoise);
float materialStreakAmount = materialStreakNoise
  * exp(-max(materialStreakDepth, 0.0) * 2.1)
  * (1.0 - smoothstep(0.25, 0.6, abs(vMaterialSurfaceNormal.y)))
  * ${appearance.streaking.toFixed(4)};
diffuseColor.rgb *= 1.0 - materialStreakAmount * 0.34;

// Standing dampness: glossy splotches on upward, sky-exposed faces.
// Roughness is lowered in the roughness stage below; here the albedo takes
// the slight darkening wet ground shows in reality.
vec3 materialWorldNormal = inverseTransformDirection(normalize(vNormal), viewMatrix);
float materialPuddleNoise =
  materialValueNoise(vMaterialCoordinate.xz * 0.55) * 0.65 +
  materialValueNoise(vMaterialCoordinate.xz * 2.05 + vec2(13.7, 41.3)) * 0.35;
float materialWet = smoothstep(0.56, 0.74, materialPuddleNoise)
  * smoothstep(0.55, 0.85, materialWorldNormal.y)
  * smoothstep(0.3, 0.7, vBakedSky)
  * uWetness
  * ${appearance.wetness.toFixed(4)};
diffuseColor.rgb *= 1.0 - materialWet * 0.38;`,
        )
        .replace(
          "#include <roughnessmap_fragment>",
          `#include <roughnessmap_fragment>
float materialRoughnessNoise = vMaterialRoughnessNoise;
roughnessFactor = clamp(
  roughnessFactor + (materialRoughnessNoise - 0.5) * ${(appearance.roughnessVariation * 2).toFixed(4)},
  0.08,
  1.0
);
// Wet splotches turn glossy: with the sky environment map this alone makes
// puddles mirror the sky at grazing angles, the way wet ground does.
roughnessFactor = mix(roughnessFactor, 0.07, materialWet);`,
        )
        .replace(
          "#include <normal_fragment_maps>",
          `#include <normal_fragment_maps>
// Fake bevels: bend the shading normal outward in a narrow band along box
// edges. Blocks catch light on their edges like physical, slightly worn
// objects instead of razor-sharp CG boxes (a subtle edge softening
// normals near the camera for the same reason).
vec3 materialBevelEdge = (vec3(0.5) - abs(vMaterialBoxPosition)) * vMaterialWorldScale;
float materialBevelWidth = min(
  0.028,
  0.3 * min(vMaterialWorldScale.x, min(vMaterialWorldScale.y, vMaterialWorldScale.z))
);
vec3 materialBevelT = clamp(1.0 - materialBevelEdge / materialBevelWidth, 0.0, 1.0);
materialBevelT *= materialBevelT * (1.0 - abs(vMaterialSurfaceNormal));
// Only exposed faces carry a chamfer: interior seams of carved bodies and
// the flush seams of the ground-tile grid must stay optically flat.
materialBevelT *= materialExternalMask;
vec3 materialBevelBend =
  vBevelAxisX * sign(vMaterialBoxPosition.x) * materialBevelT.x +
  vBevelAxisY * sign(vMaterialBoxPosition.y) * materialBevelT.y +
  vBevelAxisZ * sign(vMaterialBoxPosition.z) * materialBevelT.z;
normal = normalize(normal + materialBevelBend * 0.6);`,
        )
        .replace(
          "#include <aomap_fragment>",
          `// Baked voxel-traced ambient occlusion (per-corner, interpolated per
// face). It darkens only ambient light: the sun keeps its
// real shadow map.
float materialBakedAo = clamp(vBakedAo, 0.0, 1.0);
materialBakedAo = 1.0 - (1.0 - materialBakedAo) * 0.88;
reflectedLight.indirectDiffuse *= materialBakedAo;
#if defined( USE_ENVMAP )
float materialAoDotNV = saturate(dot(normal, normalize(vViewPosition)));
float materialSpecularOcclusion = clamp(
  pow(materialAoDotNV + materialBakedAo, exp2(-16.0 * material.roughness - 1.0)) - 1.0 + materialBakedAo,
  0.0,
  1.0
);
reflectedLight.indirectSpecular *= materialSpecularOcclusion;
#endif`,
        )
        .replace(
          "#include <fog_fragment>",
          `#ifdef USE_FOG
// Depth fog tinted toward the sun: air glows around the light source the
// way real haze in-scatters, instead of one flat fog color everywhere.
float materialFogFactor = smoothstep(fogNear, fogFar, vFogDepth);
float materialFogSunAmount = pow(
  clamp(dot(normalize(vMaterialCoordinate - cameraPosition), uFogSunDirection), 0.0, 1.0),
  8.0
);
vec3 materialFogTint = mix(fogColor, uFogSunColor, materialFogSunAmount * uFogSunStrength);
gl_FragColor.rgb = mix(gl_FragColor.rgb, materialFogTint, materialFogFactor);
#endif`,
        );
    };
    standardMaterial.customProgramCacheKey = () =>
      `material-space-v6:${material}:${profileKey}`;
  }

  if (isGlass && color === litWindowColor) {
    standardMaterial.emissive = new Color("#ffc879");
    standardMaterial.emissiveIntensity = 0;
    glowMaterials.push(standardMaterial);
  }
  if (isEyeGlass) {
    standardMaterial.emissive = new Color(
      color === "#ff5a2f" ? "#ff3b16" : "#7a150d",
    );
    standardMaterial.emissiveIntensity = 0.35;
    glowMaterials.push(standardMaterial);
  }

  materialCache.set(key, standardMaterial);
  return standardMaterial;
}

export function isGlassMaterial(material: BreakableMaterial): boolean {
  return material === "glass" || material === "darkGlass";
}

export function pieceMaterialBaseColor(
  material: BreakableMaterial,
  color: string,
): string {
  if (material === "glass" && color === litWindowColor) {
    return litWindowColor;
  }
  if (
    material === "darkGlass" &&
    (color === "#ff5a2f" || color === "#9f241a")
  ) {
    return color;
  }
  return "#ffffff";
}
