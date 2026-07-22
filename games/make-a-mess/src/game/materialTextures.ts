import {
  CanvasTexture,
  Color,
  LinearFilter,
  LinearMipmapLinearFilter,
  MeshStandardMaterial,
  NoColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Vector3,
  type WebGLProgramParametersWithUniforms,
} from "three";
import { litWindowColor, type BreakableMaterial } from "./destructionScene.ts";
import { materialAppearanceProfiles } from "./materialAppearance.ts";
import {
  vikingTrafficAreas,
  vikingTrafficRoutes,
  type VikingPlanPoint,
} from "../content/scenes/vikingVillagePlan.ts";

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
  cloth: 0.008,
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
let vikingTrafficTexture: CanvasTexture | null = null;

const VIKING_TRAFFIC_TEXTURE_SIZE = 512;
const VIKING_WORLD_MIN_X = -96;
const VIKING_WORLD_MIN_Z = -106;
const VIKING_WORLD_SPAN = 192;

function vikingTrafficCanvasPoint(point: VikingPlanPoint): readonly [number, number] {
  const scale = VIKING_TRAFFIC_TEXTURE_SIZE / VIKING_WORLD_SPAN;
  return [
    (point[0] - VIKING_WORLD_MIN_X) * scale,
    VIKING_TRAFFIC_TEXTURE_SIZE - (point[1] - VIKING_WORLD_MIN_Z) * scale,
  ];
}

function sampleVikingTrafficRoute(
  points: readonly VikingPlanPoint[],
): readonly VikingPlanPoint[] {
  const canvasPoints = points.map(vikingTrafficCanvasPoint);
  const samples: VikingPlanPoint[] = [canvasPoints[0]];

  const sampleLine = (start: VikingPlanPoint, end: VikingPlanPoint): void => {
    const distance = Math.hypot(end[0] - start[0], end[1] - start[1]);
    const steps = Math.max(2, Math.ceil(distance / 3));
    for (let step = 1; step <= steps; step += 1) {
      const t = step / steps;
      samples.push([
        start[0] + (end[0] - start[0]) * t,
        start[1] + (end[1] - start[1]) * t,
      ]);
    }
  };

  if (canvasPoints.length === 2) {
    sampleLine(canvasPoints[0], canvasPoints[1]);
    return samples;
  }

  let start = canvasPoints[0];
  for (let index = 1; index < canvasPoints.length - 1; index += 1) {
    const control = canvasPoints[index];
    const next = canvasPoints[index + 1];
    const end: VikingPlanPoint = [
      (control[0] + next[0]) / 2,
      (control[1] + next[1]) / 2,
    ];
    const distance = Math.hypot(control[0] - start[0], control[1] - start[1])
      + Math.hypot(end[0] - control[0], end[1] - control[1]);
    const steps = Math.max(3, Math.ceil(distance / 3));
    for (let step = 1; step <= steps; step += 1) {
      const t = step / steps;
      const inverse = 1 - t;
      samples.push([
        inverse * inverse * start[0] + 2 * inverse * t * control[0] + t * t * end[0],
        inverse * inverse * start[1] + 2 * inverse * t * control[1] + t * t * end[1],
      ]);
    }
    start = end;
  }
  sampleLine(start, canvasPoints[canvasPoints.length - 1]);
  return samples;
}

function vikingTrafficPhase(routeId: string): number {
  let hash = 2166136261;
  for (let index = 0; index < routeId.length; index += 1) {
    hash ^= routeId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff * Math.PI * 2;
}

function meanderVikingTrafficRoute(
  samples: readonly VikingPlanPoint[],
  routeId: string,
  maximumOffset: number,
): readonly VikingPlanPoint[] {
  const phase = vikingTrafficPhase(routeId);
  return samples.map((point, index): VikingPlanPoint => {
    if (index === 0 || index === samples.length - 1) {
      return point;
    }
    const previous = samples[index - 1];
    const next = samples[index + 1];
    const tangentX = next[0] - previous[0];
    const tangentY = next[1] - previous[1];
    const tangentLength = Math.max(0.001, Math.hypot(tangentX, tangentY));
    const progress = index / (samples.length - 1);
    const endpointFade = Math.pow(Math.sin(progress * Math.PI), 0.7);
    const broad = Math.sin(progress * Math.PI * 4.6 + phase) * 0.67;
    const footsteps = Math.sin(progress * Math.PI * 11.7 + phase * 1.83) * 0.23;
    const offset = (broad + footsteps) * maximumOffset * endpointFade;
    return [
      point[0] - tangentY / tangentLength * offset,
      point[1] + tangentX / tangentLength * offset,
    ];
  });
}

function vikingTrafficWidthFactor(routeId: string, progress: number): number {
  const phase = vikingTrafficPhase(routeId);
  const broad = Math.sin(progress * Math.PI * 3.4 + phase) * 0.17;
  const irregular = Math.sin(progress * Math.PI * 9.2 + phase * 1.71) * 0.09;
  return Math.max(0.68, Math.min(1.3, 0.94 + broad + irregular));
}

function fillVariableVikingTrafficRoute(
  context: CanvasRenderingContext2D,
  samples: readonly VikingPlanPoint[],
  routeId: string,
  halfWidth: number,
  opacity: number,
): void {
  const left: VikingPlanPoint[] = [];
  const right: VikingPlanPoint[] = [];
  const widths: number[] = [];
  for (let index = 0; index < samples.length; index += 1) {
    const previous = samples[Math.max(0, index - 1)];
    const next = samples[Math.min(samples.length - 1, index + 1)];
    const tangentX = next[0] - previous[0];
    const tangentY = next[1] - previous[1];
    const tangentLength = Math.max(0.001, Math.hypot(tangentX, tangentY));
    const width = halfWidth * vikingTrafficWidthFactor(
      routeId,
      index / Math.max(1, samples.length - 1),
    );
    const normalX = -tangentY / tangentLength;
    const normalY = tangentX / tangentLength;
    widths.push(width);
    left.push([samples[index][0] + normalX * width, samples[index][1] + normalY * width]);
    right.push([samples[index][0] - normalX * width, samples[index][1] - normalY * width]);
  }

  context.fillStyle = `rgba(255, 0, 0, ${opacity})`;
  context.beginPath();
  context.moveTo(left[0][0], left[0][1]);
  for (let index = 1; index < left.length; index += 1) {
    context.lineTo(left[index][0], left[index][1]);
  }
  for (let index = right.length - 1; index >= 0; index -= 1) {
    context.lineTo(right[index][0], right[index][1]);
  }
  context.closePath();
  context.fill();

  for (const index of [0, samples.length - 1]) {
    context.beginPath();
    context.arc(samples[index][0], samples[index][1], widths[index], 0, Math.PI * 2);
    context.fill();
  }
}

/**
 * Bakes the village's complete movement graph into two mask channels once:
 * red is travelled routes, green is occupied yards. This replaces dozens of
 * fragment-shader distance checks and creates no additional scene geometry.
 */
function getVikingTrafficTexture(): CanvasTexture {
  if (vikingTrafficTexture) {
    return vikingTrafficTexture;
  }

  const canvas = document.createElement("canvas");
  canvas.width = VIKING_TRAFFIC_TEXTURE_SIZE;
  canvas.height = VIKING_TRAFFIC_TEXTURE_SIZE;
  const context = canvas.getContext("2d");
  if (context) {
    context.fillStyle = "#000";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.globalCompositeOperation = "lighter";
    context.lineCap = "round";
    context.lineJoin = "round";
    const scale = VIKING_TRAFFIC_TEXTURE_SIZE / VIKING_WORLD_SPAN;

    for (const route of vikingTrafficRoutes) {
      const samples = meanderVikingTrafficRoute(
        sampleVikingTrafficRoute(route.points),
        route.id,
        scale * Math.min(0.92, 0.42 + route.width * 0.23),
      );
      for (const layer of [
        { width: 2.25, opacity: 0.16 },
        { width: 1.42, opacity: 0.34 },
        { width: 0.72, opacity: 0.42 },
      ] as const) {
        fillVariableVikingTrafficRoute(
          context,
          samples,
          route.id,
          route.width * scale * layer.width,
          route.wear * layer.opacity,
        );
      }
    }

    for (const area of vikingTrafficAreas) {
      const [x, y] = vikingTrafficCanvasPoint(area.center);
      context.save();
      context.translate(x, y);
      context.rotate(-(area.rotation ?? 0));
      context.scale(area.radius[0] * scale, area.radius[1] * scale);
      const gradient = context.createRadialGradient(0, 0, 0, 0, 0, 1);
      gradient.addColorStop(0, `rgba(0, 255, 0, ${area.wear * 0.82})`);
      gradient.addColorStop(0.48, `rgba(0, 255, 0, ${area.wear * 0.58})`);
      gradient.addColorStop(0.78, `rgba(0, 255, 0, ${area.wear * 0.24})`);
      gradient.addColorStop(1, "rgba(0, 255, 0, 0)");
      context.fillStyle = gradient;
      context.beginPath();
      context.arc(0, 0, 1, 0, Math.PI * 2);
      context.fill();
      context.restore();
    }
  }

  vikingTrafficTexture = new CanvasTexture(canvas);
  vikingTrafficTexture.magFilter = LinearFilter;
  vikingTrafficTexture.minFilter = LinearMipmapLinearFilter;
  vikingTrafficTexture.anisotropy = 4;
  vikingTrafficTexture.colorSpace = NoColorSpace;
  return vikingTrafficTexture;
}

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
    case "cloth": {
      fillNoise(context, random, 205, 24, 3);
      context.lineWidth = 1;
      for (let line = 0; line < TEXTURE_SIZE; line += 5) {
        gray(context, 164 + random() * 32, 0.48);
        context.fillRect(0, line, TEXTURE_SIZE, 1);
        gray(context, 222 + random() * 18, 0.36);
        context.fillRect(line, 0, 1, TEXTURE_SIZE);
      }
      for (let crease = 0; crease < 7; crease += 1) {
        gray(context, 145 + random() * 28, 0.25);
        const x = random() * TEXTURE_SIZE;
        context.fillRect(x, 0, 1 + random() * 2, TEXTURE_SIZE);
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
        : material === "cloth"
          ? 0.9
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
      shader.uniforms.uLandscapeSoilMap = { value: getMaterialTexture("soil") };
      shader.uniforms.uVikingTrafficMap = { value: getVikingTrafficTexture() };
      environmentShaders.push(shader);

      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          `#include <common>
// materialAnchor.xyz is the world-space anchor; .w carries the organic
// weathering amount. Packed into this vec4 so it costs no extra vertex
// attribute slot (WebGL caps the count, and instanceMatrix already eats four).
attribute vec4 materialAnchor;
attribute float silicateJointBand;
attribute vec3 silicateJointTint;
attribute vec4 bakedAoA;
attribute vec4 bakedAoB;
attribute float bakedSkyExposure;
attribute vec3 materialFaceMaskPos;
attribute vec3 materialFaceMaskNeg;
varying vec3 vMaterialCoordinate;
varying float vLandscapeSurfaceProfile;
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
varying float vWeathering;
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
vMaterialCoordinate = materialAnchor.xyz + position * materialInstanceScale;
vLandscapeSurfaceProfile = 1.0 - step(-0.5, silicateJointBand);
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
vWeathering = materialAnchor.w;

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
varying float vLandscapeSurfaceProfile;
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
varying float vWeathering;
varying vec3 vBevelAxisX;
varying vec3 vBevelAxisY;
varying vec3 vBevelAxisZ;
uniform vec3 uFogSunDirection;
uniform vec3 uFogSunColor;
uniform float uFogSunStrength;
uniform float uWetness;
uniform sampler2D uLandscapeSoilMap;
uniform sampler2D uVikingTrafficMap;

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
}
`,
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

// Organic biofilm: moss creeps onto up-facing, shaded and sheltered surfaces,
// while mould and rising damp darken the base of every wall. Driven by the
// per-instance weathering amount, so pristine scenes (weathering == 0) are
// untouched. World-space noise makes the growth patchy, never a flat wash.
// Runs entirely in the base pass — no extra draw call, negligible ALU.
float materialBiofilmMoss = 0.0;
float materialBiofilmMould = 0.0;
if (vWeathering > 0.001) {
  vec3 biofilmNormal = inverseTransformDirection(normalize(vNormal), viewMatrix);
  // Broad up-face weighting: the whole upper half of a round log or a pitched
  // roof takes moss, not only the very crown.
  float biofilmUp = smoothstep(-0.35, 0.5, biofilmNormal.y);
  float biofilmNorth = smoothstep(0.3, -0.5, biofilmNormal.z);
  float biofilmShelter = 1.0 - smoothstep(0.32, 0.86, vBakedSky);
  float biofilmGround = 1.0 - smoothstep(0.15, 3.8, vMaterialCoordinate.y);
  float biofilmBroad =
    materialValueNoise(vMaterialCoordinate.xz * 0.14 + vec2(19.3, 5.1)) * 0.62 +
    materialValueNoise(vMaterialCoordinate.xz * 0.52 + vec2(2.7, 44.9)) * 0.38;
  float biofilmFine = materialValueNoise(vMaterialCoordinate.xz * 1.7 + vec2(31.1, 12.4));

  // Moss favours tops, north/shaded flanks and sheltered corners.
  float mossField = clamp(biofilmUp * 0.8 + biofilmNorth * 0.32 + biofilmShelter * 0.45, 0.0, 1.0);
  float moss = smoothstep(0.4, 0.74, biofilmBroad) * mossField * vWeathering;
  moss *= 0.62 + biofilmFine * 0.55;
  materialBiofilmMoss = clamp(moss, 0.0, 0.88);
  vec3 mossTint = mix(vec3(0.27, 0.46, 0.19), vec3(0.15, 0.33, 0.13), biofilmFine);
  diffuseColor.rgb = mix(diffuseColor.rgb, mossTint, materialBiofilmMoss);

  // Mould / rising damp: browner, hugging the ground on any face.
  float mould = smoothstep(0.44, 0.86, biofilmBroad * 0.62 + biofilmFine * 0.38)
    * biofilmGround * (0.5 + biofilmShelter * 0.7) * vWeathering;
  materialBiofilmMould = clamp(mould, 0.0, 0.64);
  vec3 mouldTint = mix(vec3(0.22, 0.2, 0.16), vec3(0.14, 0.15, 0.13), biofilmFine);
  diffuseColor.rgb = mix(diffuseColor.rgb, mouldTint, materialBiofilmMould);
}

// Viking ground is one continuous, destructible surface. Paths, yards,
// moss and wet soil are world-space material masks, never stacked panels.
// The profile attribute keeps every other map visually unchanged.
float vikingSurface = step(0.5, vLandscapeSurfaceProfile) * materialUp;
vec2 vikingPoint = vMaterialCoordinate.xz;
float vikingTravel = 0.0;
float vikingYards = 0.0;
float vikingDirt = 0.0;
float vikingMoss = 0.0;
if (vikingSurface > 0.5) {
  vec2 vikingTrafficUv = clamp(
    vec2(
      (vikingPoint.x + 96.0) / 192.0,
      (vikingPoint.y + 106.0) / 192.0
    ),
    vec2(0.001),
    vec2(0.999)
  );
  vec2 vikingTrafficMask = texture2D(uVikingTrafficMap, vikingTrafficUv).rg;
  float vikingBroadNoise =
    materialValueNoise(vikingPoint * 0.075 + vec2(4.7, 18.2)) * 0.68 +
    materialValueNoise(vikingPoint * 0.21 + vec2(27.4, 3.1)) * 0.32;
  float vikingFineNoise = materialValueNoise(vikingPoint * 0.83 + vec2(11.9, 36.2));

  // The authored traffic frequency is softened by ground-scale noise. This
  // keeps route intent legible while preventing CAD-clean edges.
  vikingTravel = clamp(
    vikingTrafficMask.r * 1.35 + (vikingBroadNoise - 0.5) * 0.1,
    0.0,
    1.0
  );
  vikingYards = clamp(vikingTrafficMask.g * 1.22, 0.0, 1.0);
  float vikingTrafficWear = clamp(0.73 + vikingFineNoise * 0.38, 0.0, 1.0);
  vikingDirt = clamp(max(vikingTravel, vikingYards * 0.88) * vikingTrafficWear, 0.0, 1.0);

  vec3 vikingSoil = sRGBTransferEOTF(
    texture2D(uLandscapeSoilMap, vikingPoint * 0.32 + vec2(0.17, 0.43))
  ).rgb;
  vikingSoil *= mix(vec3(0.62, 0.40, 0.25), vec3(0.78, 0.56, 0.34), vikingFineNoise);
  diffuseColor.rgb = mix(diffuseColor.rgb, vikingSoil, vikingDirt * 0.96);

  float vikingMossNoise =
    materialValueNoise(vikingPoint * 0.095 + vec2(41.3, 7.9)) * 0.7 +
    materialValueNoise(vikingPoint * 0.37 + vec2(8.2, 59.1)) * 0.3;
  vikingMoss = smoothstep(0.57, 0.78, vikingMossNoise)
    * (1.0 - vikingTravel * 0.92)
    * (1.0 - vikingYards * 0.58);
  vec3 vikingMossTint = mix(vec3(0.46, 0.62, 0.39), vec3(0.31, 0.47, 0.28), vikingFineNoise);
  diffuseColor.rgb *= mix(vec3(1.0), vikingMossTint, vikingMoss * 0.64);

  float vikingOrganicDarkening = vikingMoss
    * smoothstep(0.68, 0.86, materialValueNoise(vikingPoint * 0.61 + vec2(73.0, 12.0)));
  diffuseColor.rgb *= 1.0 - vikingOrganicDarkening * 0.22;
}

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
float vikingPuddle = vikingDirt
  * smoothstep(0.5, 0.72, materialPuddleNoise)
  * smoothstep(0.55, 0.85, materialWorldNormal.y)
  * smoothstep(0.3, 0.7, vBakedSky)
  * uWetness;
materialWet = max(materialWet, vikingPuddle * 0.94);
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
roughnessFactor = mix(roughnessFactor, 0.78, vikingDirt * 0.36);
roughnessFactor = mix(roughnessFactor, 0.98, vikingMoss * 0.52);
// Biofilm is matte: moss and mould kill any sheen the base surface had.
roughnessFactor = mix(roughnessFactor, 0.95, materialBiofilmMoss * 0.7);
roughnessFactor = mix(roughnessFactor, 0.9, materialBiofilmMould * 0.55);
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
      `material-space-v8:${material}:${profileKey}`;
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
