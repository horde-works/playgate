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
import {
  khrushchevkaAcMounts,
  litWindowColor,
  type BreakableMaterial,
  type SurfaceTextureProfile,
} from "./destructionScene.ts";
import { materialAppearanceProfiles } from "./materialAppearance.ts";
import {
  vikingTrafficAreas,
  vikingTrafficRoutes,
  type VikingPlanPoint,
} from "../content/scenes/vikingVillagePlan.ts";
import {
  townSurfaceAreas,
  townSurfaceRoutes,
  type TownPlanPoint,
} from "../content/scenes/townSurfacePlan.ts";

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
  /** Seconds since start, drives cloth wind. */
  readonly time: number;
  /** Global wind strength 0..1 (0 disables cloth sway under load). */
  readonly windStrength: number;
  /** 1 enables the town stain map on walls; 0 elsewhere. */
  readonly stains: number;
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
    shader.uniforms.uTime.value = update.time;
    shader.uniforms.uWindStrength.value = update.windStrength;
    if (shader.uniforms.uStainStrength) {
      shader.uniforms.uStainStrength.value = update.stains;
    }
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

const surfaceTextureUrls: Record<SurfaceTextureProfile, string> = {
  "city-gray-pavers": "/games/make-a-mess/textures/city-gray-pavers.webp",
  "city-red-pavers": "/games/make-a-mess/textures/city-red-pavers.webp",
  "city-aged-stucco": "/games/make-a-mess/textures/city-aged-stucco.webp",
  "city-red-aggregate": "/games/make-a-mess/textures/city-red-aggregate.webp",
  "city-facade-cladding": "/games/make-a-mess/textures/city-facade-cladding.webp",
  "city-roof-tile": "/games/make-a-mess/textures/city-roof-tile.webp",
  // Основа под крашеный цоколь — та же старая штукатурка; слои краски и
  // сколы рисует шейдерная ветка painted-plinth поверх неё.
  "city-painted-plinth": "/games/make-a-mess/textures/city-aged-stucco.webp",
  "city-shop-sign": "/games/make-a-mess/textures/city-shop-sign.png",
  "city-chalk-sign-a": "/games/make-a-mess/textures/city-chalk-sign-a.png",
  "city-chalk-sign-b": "/games/make-a-mess/textures/city-chalk-sign-b.png",
};

// Профили-«вывески» растягиваются по родным UV грани один раз: мировая
// трипланарная проекция размазала бы надпись тайлингом.
const faceFitTextureProfiles = new Set<SurfaceTextureProfile>([
  "city-shop-sign",
  "city-chalk-sign-a",
  "city-chalk-sign-b",
]);

const bumpScaleByMaterial: Record<BreakableMaterial, number> = {
  brick: 0.035,
  wood: 0.018,
  cloth: 0.008,
  plaster: 0.012,
  plastic: 0.005,
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
const textureCache = new Map<string, Texture>();
const materialCache = new Map<string, MeshStandardMaterial>();
let vikingTrafficTexture: CanvasTexture | null = null;
let citySurfaceTexture: CanvasTexture | null = null;

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
  channel: "red" | "green" = "red",
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

  context.fillStyle = channel === "red"
    ? `rgba(255, 0, 0, ${opacity})`
    : `rgba(0, 255, 0, ${opacity})`;
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

const CITY_SURFACE_TEXTURE_SIZE = 512;
const CITY_WORLD_MIN = -96;
const CITY_WORLD_SPAN = 192;

function citySurfaceCanvasPoint(
  point: TownPlanPoint,
): readonly [number, number] {
  const scale = CITY_SURFACE_TEXTURE_SIZE / CITY_WORLD_SPAN;
  return [
    (point[0] - CITY_WORLD_MIN) * scale,
    CITY_SURFACE_TEXTURE_SIZE - (point[1] - CITY_WORLD_MIN) * scale,
  ];
}

function sampleCitySurfaceRoute(
  points: readonly TownPlanPoint[],
): readonly VikingPlanPoint[] {
  const canvasPoints = points.map(citySurfaceCanvasPoint);
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

function getCitySurfaceTexture(): CanvasTexture {
  if (citySurfaceTexture) {
    return citySurfaceTexture;
  }
  const canvas = document.createElement("canvas");
  canvas.width = CITY_SURFACE_TEXTURE_SIZE;
  canvas.height = CITY_SURFACE_TEXTURE_SIZE;
  const context = canvas.getContext("2d");
  if (context) {
    context.fillStyle = "#000";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.globalCompositeOperation = "lighter";
    context.lineCap = "round";
    context.lineJoin = "round";
    const scale = CITY_SURFACE_TEXTURE_SIZE / CITY_WORLD_SPAN;

    for (const route of townSurfaceRoutes) {
      const raw = sampleCitySurfaceRoute(route.points);
      const samples = meanderVikingTrafficRoute(
        raw,
        `city:${route.id}`,
        scale * Math.min(0.55, 0.18 + route.width * 0.12),
      );
      for (const layer of [
        { width: 1.9, opacity: 0.18 },
        { width: 1.15, opacity: 0.42 },
        { width: 0.64, opacity: 0.48 },
      ] as const) {
        if (route.dirt > 0) {
          fillVariableVikingTrafficRoute(
            context,
            samples,
            `city:${route.id}:dirt`,
            route.width * scale * layer.width,
            route.dirt * layer.opacity,
            "red",
          );
        }
        if (route.wetness > 0) {
          fillVariableVikingTrafficRoute(
            context,
            samples,
            `city:${route.id}:wet`,
            route.width * scale * layer.width,
            route.wetness * layer.opacity,
            "green",
          );
        }
      }
    }

    for (const area of townSurfaceAreas) {
      const [x, y] = citySurfaceCanvasPoint(area.center);
      for (const [channel, amount] of [
        ["red", area.dirt],
        ["green", area.wetness],
      ] as const) {
        if (amount <= 0) {
          continue;
        }
        context.save();
        context.translate(x, y);
        context.rotate(-(area.rotation ?? 0));
        context.scale(area.radius[0] * scale, area.radius[1] * scale);
        const gradient = context.createRadialGradient(0, 0, 0, 0, 0, 1);
        const rgb = channel === "red" ? "255, 0, 0" : "0, 255, 0";
        gradient.addColorStop(0, `rgba(${rgb}, ${amount * 0.84})`);
        gradient.addColorStop(0.5, `rgba(${rgb}, ${amount * 0.56})`);
        gradient.addColorStop(0.8, `rgba(${rgb}, ${amount * 0.22})`);
        gradient.addColorStop(1, `rgba(${rgb}, 0)`);
        context.fillStyle = gradient;
        context.beginPath();
        context.arc(0, 0, 1, 0, Math.PI * 2);
        context.fill();
        context.restore();
      }
    }
  }
  citySurfaceTexture = new CanvasTexture(canvas);
  citySurfaceTexture.magFilter = LinearFilter;
  citySurfaceTexture.minFilter = LinearMipmapLinearFilter;
  citySurfaceTexture.anisotropy = 4;
  citySurfaceTexture.colorSpace = NoColorSpace;
  return citySurfaceTexture;
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

let vikingTrafficPixels: { readonly data: Uint8ClampedArray; readonly size: number } | null = null;

/**
 * World-space traffic sample [0..1] from the same baked map the ground shader
 * reads: the red channel is trodden routes, the green channel is worn yards.
 * Returned as the strongest of the two, so decoration (e.g. grass) can thin out
 * on the paths and thicken along their edges. Browser-only (uses a 2D canvas).
 */
export function sampleVikingGroundTraffic(x: number, z: number): number {
  if (!vikingTrafficPixels) {
    const canvas = getVikingTrafficTexture().image as HTMLCanvasElement;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      return 0;
    }
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    vikingTrafficPixels = { data: image.data, size: canvas.width };
  }
  const { data, size } = vikingTrafficPixels;
  const scale = size / VIKING_WORLD_SPAN;
  const px = Math.round((x - VIKING_WORLD_MIN_X) * scale);
  const py = Math.round(size - (z - VIKING_WORLD_MIN_Z) * scale);
  if (px < 0 || py < 0 || px >= size || py >= size) {
    return 0;
  }
  const index = (py * size + px) * 4;
  return Math.max(data[index], data[index + 1]) / 255;
}


// ---------------------------------------------------------------------------
// Town stain map — weathering PAINTED into the wall texture, with sources.
//
// A 2048x1024 canvas holds two facade-space bands: the bottom half maps walls
// facing +-Z as (x + 0.37*z, y), the top half walls facing +-X as
// (z + 0.37*x, y). The shear decorrelates buildings that share an axis range,
// so every facade gets its own stains. Channels: R = water/grime runs,
// G = rust runs, B = damage (spalled plaster cores and cracks). The piece
// shader samples this once and tints the wall itself — streaks BELONG to the
// surface, they are not stickers in front of it.
let townStainTexture: CanvasTexture | null = null;

const STAIN_U_OFFSET = 60;
const STAIN_U_SPAN = 200;
const STAIN_Y_SPAN = 12;

export function getTownStainTexture(): CanvasTexture {
  if (townStainTexture) {
    return townStainTexture;
  }
  const canvas = document.createElement("canvas");
  canvas.width = 2048;
  canvas.height = 1024;
  const context = canvas.getContext("2d");
  if (context) {
    context.fillStyle = "#000";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.globalCompositeOperation = "lighter";
    context.lineCap = "round";

    const pxPerU = canvas.width / STAIN_U_SPAN;
    const pxPerY = 512 / STAIN_Y_SPAN;
    const toPx = (face: "z" | "x", u: number, y: number): readonly [number, number] => [
      (u + STAIN_U_OFFSET) * pxPerU,
      face === "z" ? 1024 - y * pxPerY : 512 - y * pxPerY,
    ];
    let stainSeed = 7;
    const next = (): number => {
      stainSeed = (stainSeed * 16807) % 2147483647;
      return stainSeed / 2147483647;
    };
    const channel = (r: number, g: number, b: number, a: number): string =>
      `rgba(${r}, ${g}, ${b}, ${a})`;

    // A tapering, wavering run of water or rust from a point source.
    const run = (
      face: "z" | "x",
      u: number,
      yTop: number,
      length: number,
      width: number,
      rgb: readonly [number, number, number],
      strength: number,
    ): void => {
      const [sx, sy] = toPx(face, u, yTop);
      const drop = length * pxPerY;
      for (const [pass, alpha] of [
        [width * 2.4, strength * 0.16],
        [width * 1.2, strength * 0.3],
        [width * 0.5, strength * 0.42],
      ] as const) {
        context.strokeStyle = channel(rgb[0], rgb[1], rgb[2], alpha);
        context.beginPath();
        context.moveTo(sx, sy);
        const wobble = (next() - 0.5) * 3;
        const segments = 7;
        for (let seg = 1; seg <= segments; seg += 1) {
          const t = seg / segments;
          context.lineTo(
            sx + Math.sin(t * 9 + u) * (1.6 + wobble) * (1 - t * 0.4),
            sy + drop * t,
          );
        }
        context.lineWidth = Math.max(1, pass * pxPerU * 0.06);
        context.stroke();
      }
      // The source itself is darkest: a small pooled head.
      context.fillStyle = channel(rgb[0], rgb[1], rgb[2], strength * 0.4);
      context.beginPath();
      context.ellipse(sx, sy, width * pxPerU * 0.09, 2.4, 0, 0, Math.PI * 2);
      context.fill();
    };

    // A spalled patch: irregular dark core; the shader lifts a pale rim.
    const spall = (face: "z" | "x", u: number, y: number, radius: number): void => {
      const [sx, sy] = toPx(face, u, y);
      context.fillStyle = channel(0, 0, 235, 0.85);
      context.beginPath();
      const lobes = 9;
      for (let lobe = 0; lobe <= lobes; lobe += 1) {
        const angle = (lobe / lobes) * Math.PI * 2;
        const wob = radius * (0.65 + next() * 0.55);
        const px = sx + Math.cos(angle) * wob * pxPerU;
        const py = sy + Math.sin(angle) * wob * pxPerY * 0.8;
        if (lobe === 0) context.moveTo(px, py);
        else context.lineTo(px, py);
      }
      context.closePath();
      context.fill();
      // A couple of detached chips beside the wound.
      for (let chip = 0; chip < 2; chip += 1) {
        context.beginPath();
        context.ellipse(
          sx + (next() - 0.5) * radius * 3.4 * pxPerU,
          sy + (next() - 0.5) * radius * 2.2 * pxPerY,
          2.6, 2.0, next() * 3, 0, Math.PI * 2,
        );
        context.fill();
      }
    };

    // A thin branching crack wandering out of a corner.
    const crack = (
      face: "z" | "x",
      u: number,
      y: number,
      length: number,
      angle: number,
      branchChance = 0.5,
    ): void => {
      let [px, py] = toPx(face, u, y);
      let heading = angle;
      context.strokeStyle = channel(0, 0, 150, 0.8);
      context.lineWidth = 1.6;
      context.beginPath();
      context.moveTo(px, py);
      const segments = 6 + Math.floor(next() * 5);
      const step = (length * pxPerY) / segments;
      for (let seg = 0; seg < segments; seg += 1) {
        heading += (next() - 0.5) * 0.9;
        px += Math.cos(heading) * step;
        py += Math.sin(heading) * step;
        context.lineTo(px, py);
        if (next() < branchChance * 0.3) {
          const bx = px + Math.cos(heading + (next() > 0.5 ? 1.1 : -1.1)) * step * 1.6;
          const by = py + Math.sin(heading + 0.9) * step * 1.4;
          context.moveTo(px, py);
          context.lineTo(bx, by);
          context.moveTo(px, py);
        }
      }
      context.stroke();
    };

    const WATER: readonly [number, number, number] = [235, 0, 0];
    const RUST: readonly [number, number, number] = [0, 235, 0];

    // ---- Khrushchevka blocks: sources derived from the real bay layout ----
    const blocks = [
      { x0: 12, z0: -8, z1: -1 },
      { x0: 12, z0: -24, z1: -17 },
      { x0: 48, z0: -24, z1: -17 },
      { x0: -12, z0: -42, z1: -35 },
      { x0: 14, z0: -42, z1: -35 },
      { x0: 48, z0: 12, z1: 19 },
    ];
    const bayWidth = 21.7 / 16;
    for (const block of blocks) {
      for (const zFace of [block.z0, block.z1]) {
        const shearU = (x: number): number => x + zFace * 0.37;
        // Water runs from window sill corners — most sills weep somewhere,
        // starting right under the zinc flashing.
        for (let floor = 0; floor < 4; floor += 1) {
          for (let bay = 0; bay < 16; bay += 1) {
            if (next() > 0.3) continue;
            const corner = next() > 0.5 ? 0.56 : -0.56;
            run("z",
              shearU(block.x0 + 0.15 + bayWidth * (bay + 0.5) + corner),
              0.4 + floor * 2.6 + 0.78,
              0.7 + next() * 2.0,
              0.3 + next() * 0.25,
              WATER, 0.45 + next() * 0.4);
          }
        }
        // Rust weeps from the corners of every balcony plate; the balconies
        // live on the z1 face only (bays 3/5/11/13, floors 1..3).
        if (zFace === block.z1) {
          for (const bay of [3, 5, 11, 13]) {
            const cx = block.x0 + 0.15 + bayWidth * (bay + 0.5);
            for (let floor = 1; floor < 4; floor += 1) {
              const plateY = 0.4 + floor * 2.6 - 0.1;
              for (const corner of [-0.82, 0.82]) {
                if (next() > 0.85) continue;
                run("z", shearU(cx + corner), plateY,
                  0.7 + next() * 1.5, 0.3, RUST, 0.5 + next() * 0.35);
              }
              if (next() < 0.35) {
                run("z", shearU(cx + (next() - 0.5) * 1.2), plateY,
                  0.5 + next() * 0.9, 0.36, WATER, 0.45);
              }
            }
          }
        }
        // Door reveals (entrance bays 2 and 10): grime down both jambs and a
        // crack leaving a lintel corner.
        for (const doorBay of [2, 10]) {
          const cx = block.x0 + 0.15 + bayWidth * (doorBay + 0.5);
          for (const jamb of [-0.72, 0.72]) {
            run("z", shearU(cx + jamb), 2.35, 1.5 + next() * 0.7, 0.26, WATER, 0.55);
          }
          crack("z", shearU(cx - 0.75), 2.4, 0.7 + next() * 0.5, -1.1 + next() * 0.5);
        }
        // Under the roof line: longer parallel seep runs + one rust track.
        for (let i = 0; i < 3; i += 1) {
          run("z", shearU(block.x0 + 2.5 + next() * 17), 10.85, 1.2 + next() * 1.6, 0.4, WATER, 0.45);
        }
        run("z", shearU(block.x0 + 3 + next() * 16), 10.85, 1.8 + next() * 1.2, 0.3, RUST, 0.6);
        // Settlement cracks near the building ends.
        crack("z", shearU(block.x0 + 0.7), 9.5, 2.4 + next() * 1.6, 1.35, 0.3);
        crack("z", shearU(block.x0 + 21.3), 8.8, 2.0 + next() * 1.8, 1.75, 0.3);
        // The base of the facade is hit hardest: several low spalls, plus an
        // occasional one at height where a panel seam let water in.
        for (let attempt = 0; attempt < 3; attempt += 1) {
          if (next() > 0.55) continue;
          spall("z", shearU(block.x0 + 1.5 + next() * 19), 0.75 + next() * 1.6, 0.24 + next() * 0.24);
        }
        if (next() < 0.35) {
          spall("z", shearU(block.x0 + 2 + next() * 18), 3.2 + next() * 4.5, 0.2 + next() * 0.18);
        }
      }
    }
    // Rust bleeding from the AC units — the mounts are shared with the
    // town-clutter builder, so every streak sits under a real bracket.
    for (const mount of khrushchevkaAcMounts) {
      const u = mount.x + mount.z * 0.37;
      run("z", u - 0.24, mount.y - 0.34, 0.9 + next() * 0.9, 0.3, RUST, 0.7);
      if (next() > 0.45) {
        run("z", u + 0.24, mount.y - 0.34, 0.5 + next() * 0.7, 0.26, RUST, 0.5);
      }
    }

    // ---- Old houses h1..h3: window corners, downpipe rust, spall, cracks ----
    for (const [hx, hz] of [[0, 0], [56, 0], [56, -38]] as const) {
      for (const zFace of [hz + 0.71, hz - 6.71]) {
        const shearU = (x: number): number => x + zFace * 0.37;
        for (const wx of [-2.6, -0.9, 1.1, 2.9]) {
          if (next() > 0.45) continue;
          run("z", shearU(hx + wx), 2.15 + (next() > 0.5 ? 2.3 : 0), 0.6 + next() * 1.1, 0.28, WATER, 0.55);
        }
        // Rust track behind each downpipe elbow.
        for (const side of [-1, 1]) {
          run("z", shearU(hx + side * 4.28), 4.9, 2.6, 0.34, RUST, 0.5);
        }
        spall("z", shearU(hx - 2.2 + next() * 4.4), 1.1 + next() * 1.8, 0.3 + next() * 0.25);
        crack("z", shearU(hx + (next() - 0.5) * 6), 4.6, 1.4 + next() * 1.2, 1.3 + next() * 0.6, 0.6);
      }
      for (const xFace of [hx - 4.11, hx + 4.11]) {
        const shearU = (z: number): number => z + xFace * 0.37;
        run("x", shearU(hz - 3 + next() * 3), 4.7, 1.4 + next() * 1.4, 0.34, WATER, 0.5);
        if (next() > 0.5) {
          spall("x", shearU(hz - 4 + next() * 4.5), 0.9 + next() * 1.4, 0.3 + next() * 0.2);
        }
      }
    }

    // ---- Garage row: seepage under the roof slab on the long back wall ----
    for (let i = 0; i < 5; i += 1) {
      run("z", -11 + i * 4.2 + next() * 2 + -25 * 0.37, 2.28, 0.8 + next() * 0.9, 0.35, WATER, 0.5);
    }
  }

  townStainTexture = new CanvasTexture(canvas);
  townStainTexture.magFilter = LinearFilter;
  townStainTexture.minFilter = LinearMipmapLinearFilter;
  townStainTexture.anisotropy = 4;
  townStainTexture.colorSpace = NoColorSpace;
  return townStainTexture;
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
  textureProfile?: SurfaceTextureProfile,
): Texture {
  const key = textureProfile ?? material;
  const cached = textureCache.get(key);
  if (cached) {
    return cached;
  }

  const sourceUrl = textureProfile
    ? surfaceTextureUrls[textureProfile]
    : photorealTextureUrls[material];
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

  textureCache.set(key, texture);
  return texture;
}

export function getPieceMaterial(
  material: BreakableMaterial,
  color: string,
  textureProfile?: SurfaceTextureProfile,
): MeshStandardMaterial {
  const key = `${material}:${color}:${textureProfile ?? "default"}`;
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
  const surfaceTexture = getMaterialTexture(material, textureProfile);
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
      shader.uniforms.uTime = { value: 0.0 };
      shader.uniforms.uWindStrength = { value: 1.0 };
      shader.uniforms.uStainStrength = { value: 0.0 };
      if (material === "concrete" || material === "plaster" || material === "brick") {
        shader.uniforms.uStainMap = { value: getTownStainTexture() };
      }
      shader.uniforms.uLandscapeSoilMap = { value: getMaterialTexture("soil") };
      shader.uniforms.uVikingTrafficMap = { value: getVikingTrafficTexture() };
      shader.uniforms.uCitySurfaceMap = { value: getCitySurfaceTexture() };
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
uniform float uTime;
uniform float uWindStrength;

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
vLandscapeSurfaceProfile = -min(silicateJointBand, 0.0);
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
${
  textureProfile && faceFitTextureProfiles.has(textureProfile)
    ? `// Face-fit: текстура натягивается на грань юнит-бокса ровно один раз.
// Строится из ЛОКАЛЬНЫХ координат (position = ±0.5 до инстанс-матрицы),
// поэтому не зависит от uv-атрибута и одинаково работает в статическом
// батчере и в дебрис-инстансах; задняя грань отзеркалена, чтобы надпись
// читалась с обеих сторон щита.
vec2 materialFaceFitUv = abs(normal.z) > 0.5
  ? vec2(normal.z > 0.0 ? position.x + 0.5 : 0.5 - position.x, position.y + 0.5)
  : abs(normal.x) > 0.5
    ? vec2(normal.x > 0.0 ? 0.5 - position.z : position.z + 0.5, position.y + 0.5)
    : vec2(position.x + 0.5, 0.5 - position.z);`
    : ""
}
#ifdef USE_MAP
  vMapUv = ${
    textureProfile && faceFitTextureProfiles.has(textureProfile)
      ? "materialFaceFitUv"
      : `materialProjectedUv * ${appearance.textureScale.toFixed(4)}`
  };
#endif
#ifdef USE_BUMPMAP
  vBumpMapUv = ${
    textureProfile && faceFitTextureProfiles.has(textureProfile)
      ? "materialFaceFitUv"
      : `materialProjectedUv * ${appearance.textureScale.toFixed(4)}`
  };
#endif`,
        );

      // Cloth wind: only the cloth material sways. A gentle billow, strongest
      // toward the free (lower) edge of a hanging panel, driven by uTime and
      // scaled by uWindStrength — which the perf monitor drops to zero under
      // load. Purely a render-space displacement; colliders never move.
      if (material === "cloth") {
        shader.vertexShader = shader.vertexShader.replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
{
  vec3 clothWindAnchor = materialAnchor.xyz;
  float clothPhase = uTime * 1.7 + clothWindAnchor.x * 0.55 + clothWindAnchor.z * 0.4;
  float clothBillow = sin(clothPhase) + 0.45 * sin(clothPhase * 2.3 + 1.1);
  float clothFreeEdge = max(0.0, 0.6 - position.y);
  // Only HANGING cloth catches the wind: a tall panel (banner, laundry, loom
  // warp) sways; a flat, low panel lying indoors (bedding, a fur) does not.
  float clothHangingHeight = length(instanceMatrix[1].xyz);
  float clothHanging = smoothstep(0.5, 1.0, clothHangingHeight);
  float clothAmp = 0.09 * uWindStrength * clothFreeEdge * clothHanging;
  transformed.x += clothBillow * clothAmp;
  transformed.z += cos(clothPhase * 1.3) * clothAmp * 0.7;
}`,
        );
      }

      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
${
  material === "concrete" || material === "plaster" || material === "brick"
    ? "uniform sampler2D uStainMap;\nuniform float uStainStrength;"
    : ""
}
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
uniform sampler2D uCitySurfaceMap;

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
${
  textureProfile === "city-painted-plinth"
    ? /* glsl */ `
// Крашеный цоколь: диффуз — верхний слой краски. Value-noise срезает его
// пластами: сначала до старой светлой шпаклёвки, глубже — до кирпича с
// раствором. К земле отслаивание сильнее (сырость тянет снизу), кромка
// живой краски вокруг скола задирается и чуть светлеет.
{
  vec2 peelUv = vec2(
    dot(vMaterialCoordinate.xz, vec2(1.0, 0.83)),
    vMaterialCoordinate.y
  );
  float peelBroad =
    materialValueNoise(peelUv * vec2(0.9, 2.2) + vec2(7.3, 1.9)) * 0.55 +
    materialValueNoise(peelUv * vec2(3.1, 6.4) + vec2(21.7, 9.1)) * 0.45;
  float peelFine = materialValueNoise(peelUv * vec2(9.4, 17.0) + vec2(3.1, 15.8));
  float peelGround = 1.0 - smoothstep(0.0, 0.9, vMaterialCoordinate.y);
  float peelField = peelBroad * 0.66 + peelFine * 0.2 + peelGround * 0.3;
  float peelPatch = smoothstep(0.58, 0.66, peelField);
  float peelDeep = smoothstep(0.74, 0.84, peelField);
  vec3 peelPlaster = mix(vec3(0.66, 0.58, 0.5), vec3(0.78, 0.72, 0.63), peelFine);
  vec3 peelBrick = mix(vec3(0.34, 0.2, 0.14), vec3(0.45, 0.28, 0.18), peelFine);
  float peelRim = smoothstep(0.5, 0.58, peelField) * (1.0 - peelPatch);
  diffuseColor.rgb *= 1.0 + peelRim * 0.28;
  diffuseColor.rgb = mix(diffuseColor.rgb, peelPlaster, peelPatch);
  diffuseColor.rgb = mix(diffuseColor.rgb, peelBrick, peelDeep);
}`
    : ""
}

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
${
  material === "concrete" || material === "plaster" || material === "brick"
    ? /* glsl */ `
// Painted weathering from the town stain map: water runs from window corners
// and door reveals, rust tracks under fixtures and rooflines, spalled patches
// with a pale chipped rim around a dark core, and branching cracks — all IN
// the wall surface, each with a visible source.
{
  vec3 stainNormal = inverseTransformDirection(normalize(vNormal), viewMatrix);
  if (uStainStrength > 0.5 && abs(stainNormal.y) < 0.45) {
    vec3 stainAbs = abs(stainNormal);
    float stainU = stainAbs.z >= stainAbs.x
      ? vMaterialCoordinate.x + vMaterialCoordinate.z * 0.37
      : vMaterialCoordinate.z + vMaterialCoordinate.x * 0.37;
    float stainV = clamp(vMaterialCoordinate.y / 12.0, 0.0, 1.0) * 0.5;
    vec2 stainUv = vec2(
      (stainU + 60.0) / 200.0,
      stainAbs.z >= stainAbs.x ? stainV : 0.5 + stainV
    );
    vec3 stainSample = texture2D(uStainMap, stainUv).rgb;
    // Water and grime: darken and slightly cool the run.
    vec3 stainGrime = mix(
      diffuseColor.rgb,
      vec3(dot(diffuseColor.rgb, vec3(0.333))) * vec3(0.7, 0.75, 0.78),
      0.6
    );
    diffuseColor.rgb = mix(
      diffuseColor.rgb,
      stainGrime * 0.62,
      clamp(stainSample.r * 1.15, 0.0, 0.8)
    );
    // Rust: iron-oxide wash, tone varied by the surface noise.
    vec3 stainRust = mix(
      vec3(0.4, 0.24, 0.14),
      vec3(0.55, 0.32, 0.16),
      vMaterialRoughnessNoise
    );
    diffuseColor.rgb = mix(diffuseColor.rgb, stainRust, clamp(stainSample.g, 0.0, 0.88));
    // Damage: pale chipped rim, dark exposed core, thin cracks.
    float stainDamage = stainSample.b;
    float stainRim = smoothstep(0.05, 0.2, stainDamage) * (1.0 - smoothstep(0.28, 0.48, stainDamage));
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.3 + vec3(0.045), stainRim * 0.75);
    float stainCore = smoothstep(0.34, 0.68, stainDamage);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.125, 0.11, 0.095), stainCore * 0.92);
  }
}`
    : ""
}

// Viking ground is one continuous, destructible surface. Paths, yards,
// moss and wet soil are world-space material masks, never stacked panels.
// The profile attribute keeps every other map visually unchanged.
float vikingSurface = (1.0 - step(0.5, abs(vLandscapeSurfaceProfile - 1.0))) * materialUp;
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

  // Cheap uneven-earth relief: two octaves of world-space noise light and
  // shade the turf as if it dips and mounds a little, so the flush ground
  // tiles never read as one dead-flat plane. Softened on trodden paths.
  float vikingRelief =
    materialValueNoise(vikingPoint * 0.5 + vec2(17.0, 44.0)) * 0.62 +
    materialValueNoise(vikingPoint * 1.25 + vec2(5.0, 61.0)) * 0.38;
  diffuseColor.rgb *= mix(1.0, 0.82 + vikingRelief * 0.32, 1.0 - vikingDirt * 0.6);
}

// Rain Seam uses the same single destructible ground body model, but its mask
// describes urban processes: red = soil/grit from feet and tyres, green =
// water retained in gutters, low terraces and failed edges.
float citySurface = (1.0 - step(0.5, abs(vLandscapeSurfaceProfile - 2.0))) * materialUp;
float cityDirt = 0.0;
float cityRetainedWater = 0.0;
if (citySurface > 0.5) {
  vec2 cityPoint = vMaterialCoordinate.xz;
  vec2 cityUv = clamp(
    vec2((cityPoint.x + 96.0) / 192.0, (cityPoint.y + 96.0) / 192.0),
    vec2(0.001),
    vec2(0.999)
  );
  vec2 cityMask = texture2D(uCitySurfaceMap, cityUv).rg;
  float cityBroad =
    materialValueNoise(cityPoint * 0.11 + vec2(14.7, 3.2)) * 0.68 +
    materialValueNoise(cityPoint * 0.39 + vec2(2.4, 37.1)) * 0.32;
  float cityFine = materialValueNoise(cityPoint * 1.27 + vec2(43.9, 8.3));
  cityDirt = clamp(cityMask.r * (0.82 + cityBroad * 0.34), 0.0, 1.0);
  cityRetainedWater = clamp(cityMask.g * (0.76 + cityFine * 0.42), 0.0, 1.0);

  vec3 citySoil = sRGBTransferEOTF(
    texture2D(uLandscapeSoilMap, cityPoint * 0.36 + vec2(0.31, 0.07))
  ).rgb;
  vec3 cityGrit = mix(vec3(0.44, 0.34, 0.25), vec3(0.26, 0.24, 0.21), cityFine);
  citySoil *= cityGrit;
  diffuseColor.rgb = mix(diffuseColor.rgb, citySoil, cityDirt * 0.9);
  // Water-darkened curb and drain edges remain matte here; the physically
  // glossy response is introduced below with the common wetness pass.
  diffuseColor.rgb *= 1.0 - cityRetainedWater * 0.18;
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
float cityPuddle = cityRetainedWater
  * smoothstep(0.42, 0.7, materialPuddleNoise)
  * smoothstep(0.55, 0.85, materialWorldNormal.y)
  * smoothstep(0.3, 0.7, vBakedSky)
  * uWetness;
materialWet = max(materialWet, cityPuddle * 0.98);
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
roughnessFactor = mix(roughnessFactor, 0.82, cityDirt * 0.3);
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
    // Face-fit меняет ТЕКСТ вершинника, значит обязан менять и ключ
    // программы: иначе three переиспользует скомпилированный трипланарный
    // шейдер того же материала, и вывеска остаётся тайлящейся.
    standardMaterial.customProgramCacheKey = () =>
      `material-space-v9:${material}:${profileKey}:${
        textureProfile && faceFitTextureProfiles.has(textureProfile)
          ? "face-fit"
          : "projected"
      }:${textureProfile === "city-painted-plinth" ? "peel" : "solid"}`;
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
