import { Color, Vector2, Vector3, type DataTexture, type WebGLProgramParametersWithUniforms } from "three";
import { CLOUD_LAW } from "./skyWeatherModel.ts";
import { getSkyFieldTexture } from "./skyClouds.ts";

/** Fixed steps for deck-gap shafts in piece materials — cheap, same law as sky. */
export const MATERIAL_CLOUD_SHAFT_STEPS = 4;

export interface MaterialAtmosphereState {
  /**
   * Active key for Mie in the view fog: geographic sun by day, moon by night.
   * Uniform names stay `uMatSun*` — the shader already samples them as key.
   */
  readonly sunDirection: readonly [number, number, number];
  readonly sunFogColour: readonly [number, number, number];
  /** Integrated in-scatter along the view path (day + twilight + moon). */
  readonly airForwardScatter: number;
  /** Near metres that stay clear of aerial haze (courtyard / feet). */
  readonly nearHoldStart: number;
  readonly nearHoldEnd: number;
  /** Landform haze shelf — scaled to the island, not to continental visibility. */
  readonly landHazeNear: number;
  readonly landHazeFar: number;
  /** Opacity scale on the landform haze shelf (polder denser, steppe clearer). */
  readonly landHazeStrength: number;
  /** 0..1 milk around the player when they stand near the world rim. */
  readonly edgeMilk: number;
  readonly cloudCoverage: number;
  readonly cloudEdge: number;
  readonly cloudBase: number;
  readonly cloudThickness: number;
  readonly cloudScale: number;
  readonly cloudDrift: readonly [number, number];
  readonly cloudFieldOrigin: readonly [number, number];
  readonly cloudShaftStrength: number;
  readonly cloudLit: readonly [number, number, number];
}

const defaultState: MaterialAtmosphereState = {
  sunDirection: [0.4, 0.7, 0.5],
  sunFogColour: [1, 1, 1],
  airForwardScatter: 0,
  nearHoldStart: 18,
  nearHoldEnd: 55,
  landHazeNear: 40,
  landHazeFar: 110,
  landHazeStrength: 1,
  edgeMilk: 0,
  cloudCoverage: 0,
  cloudEdge: 1,
  cloudBase: 900,
  cloudThickness: 900,
  cloudScale: 5200,
  cloudDrift: [0, 0],
  cloudFieldOrigin: [0, 0],
  cloudShaftStrength: 0,
  cloudLit: [0, 0, 0],
};

let atmosphereState: MaterialAtmosphereState = defaultState;

const registeredShaders = new Set<WebGLProgramParametersWithUniforms>();

export function materialAtmosphereGlsl(): string {
  return /* glsl */ `
uniform vec3 uMatSunDirection;
uniform vec3 uMatSunFogColour;
uniform float uMatAirForwardScatter;
uniform float uMatNearHoldStart;
uniform float uMatNearHoldEnd;
uniform float uMatLandHazeNear;
uniform float uMatLandHazeFar;
uniform float uMatLandHazeStrength;
uniform float uMatEdgeMilk;
uniform sampler2D uMatCloudMap;
uniform vec2 uMatCloudDrift;
uniform vec2 uMatCloudFieldOrigin;
uniform float uMatCloudCoverage;
uniform float uMatCloudEdge;
uniform float uMatCloudBase;
uniform float uMatCloudThickness;
uniform float uMatCloudScale;
uniform float uMatCloudShaftStrength;
uniform vec3 uMatCloudLit;

float matCloudField(vec2 world, float lod) {
  vec2 fieldWorld = world - uMatCloudFieldOrigin;
  return textureLod(uMatCloudMap, fieldWorld / uMatCloudScale, lod).r;
}

float matCloudDeckGap(vec3 worldPos, vec3 sunDir) {
  if (uMatCloudCoverage <= 0.0 || sunDir.y <= 0.004) {
    return 0.0;
  }
  float reach = min(uMatCloudBase * 1.15, 1800.0);
  float lit = 0.0;
  for (int step = 0; step < ${MATERIAL_CLOUD_SHAFT_STEPS}; step += 1) {
    vec3 p = worldPos + sunDir * ((float(step) + 0.5) / float(${MATERIAL_CLOUD_SHAFT_STEPS}) * reach);
    float travel = (uMatCloudBase + uMatCloudThickness * 0.28 - p.y) / sunDir.y;
    float field = matCloudField(p.xz + sunDir.xz * travel - uMatCloudDrift, 2.0);
    lit += 1.0 - smoothstep(
      uMatCloudEdge,
      uMatCloudEdge + ${CLOUD_LAW.edgeSoftness.toFixed(6)},
      field
    );
  }
  return lit / float(${MATERIAL_CLOUD_SHAFT_STEPS});
}
`;
}

function applyAtmosphereUniforms(
  shader: WebGLProgramParametersWithUniforms,
  state: MaterialAtmosphereState,
): void {
  const uniforms = shader.uniforms;
  if (!uniforms.uMatSunDirection) return;
  uniforms.uMatSunDirection.value.set(
    state.sunDirection[0],
    state.sunDirection[1],
    state.sunDirection[2],
  );
  uniforms.uMatSunFogColour.value.set(
    state.sunFogColour[0],
    state.sunFogColour[1],
    state.sunFogColour[2],
  );
  uniforms.uMatAirForwardScatter.value = state.airForwardScatter;
  uniforms.uMatNearHoldStart.value = state.nearHoldStart;
  uniforms.uMatNearHoldEnd.value = state.nearHoldEnd;
  uniforms.uMatLandHazeNear.value = state.landHazeNear;
  uniforms.uMatLandHazeFar.value = state.landHazeFar;
  uniforms.uMatLandHazeStrength.value = state.landHazeStrength;
  uniforms.uMatEdgeMilk.value = state.edgeMilk;
  uniforms.uMatCloudCoverage.value = state.cloudCoverage;
  uniforms.uMatCloudEdge.value = state.cloudEdge;
  uniforms.uMatCloudBase.value = state.cloudBase;
  uniforms.uMatCloudThickness.value = state.cloudThickness;
  uniforms.uMatCloudScale.value = state.cloudScale;
  uniforms.uMatCloudDrift.value.set(state.cloudDrift[0], state.cloudDrift[1]);
  uniforms.uMatCloudFieldOrigin.value.set(
    state.cloudFieldOrigin[0],
    state.cloudFieldOrigin[1],
  );
  uniforms.uMatCloudShaftStrength.value = state.cloudShaftStrength;
  uniforms.uMatCloudLit.value.set(
    state.cloudLit[0],
    state.cloudLit[1],
    state.cloudLit[2],
  );
  if (uniforms.uMatCloudMap) {
    uniforms.uMatCloudMap.value = getSkyFieldTexture() as DataTexture;
  }
}

function ensureAtmosphereUniforms(
  shader: WebGLProgramParametersWithUniforms,
): void {
  const uniforms = shader.uniforms;
  if (uniforms.uMatSunDirection) return;
  uniforms.uMatSunDirection = { value: new Vector3(0.4, 0.7, 0.5) };
  uniforms.uMatSunFogColour = { value: new Color(1, 1, 1) };
  uniforms.uMatAirForwardScatter = { value: 0 };
  uniforms.uMatNearHoldStart = { value: 18 };
  uniforms.uMatNearHoldEnd = { value: 55 };
  uniforms.uMatLandHazeNear = { value: 40 };
  uniforms.uMatLandHazeFar = { value: 110 };
  uniforms.uMatLandHazeStrength = { value: 1 };
  uniforms.uMatEdgeMilk = { value: 0 };
  uniforms.uMatCloudMap = { value: null };
  uniforms.uMatCloudDrift = { value: new Vector2() };
  uniforms.uMatCloudFieldOrigin = { value: new Vector2() };
  uniforms.uMatCloudCoverage = { value: 0 };
  uniforms.uMatCloudEdge = { value: 1 };
  uniforms.uMatCloudBase = { value: 900 };
  uniforms.uMatCloudThickness = { value: 900 };
  uniforms.uMatCloudScale = { value: 5200 };
  uniforms.uMatCloudShaftStrength = { value: 0 };
  uniforms.uMatCloudLit = { value: new Color(0, 0, 0) };
}

export function registerMaterialAtmosphereShader(
  shader: WebGLProgramParametersWithUniforms,
): void {
  ensureAtmosphereUniforms(shader);
  registeredShaders.add(shader);
  applyAtmosphereUniforms(shader, atmosphereState);
}

export function setMaterialAtmosphere(
  partial: Partial<MaterialAtmosphereState>,
): void {
  atmosphereState = { ...atmosphereState, ...partial };
  for (const shader of registeredShaders) {
    applyAtmosphereUniforms(shader, atmosphereState);
  }
}

/**
 * Near-hold and landform haze shelf from the island radius and the place's
 * character. Continental visibility never hazes a wall on a 120 m island;
 * scene fogDistances hide the fog-sea rim, not the mid-island mass.
 *
 * `distanceScale` ~1.3 (Igor): shelf a touch farther so the wall softens
 * without becoming milk. Polder keeps denser air even under a high sun.
 */
export function landHazeBand(
  worldRadius: number,
  sceneId = "",
): {
  nearHoldStart: number;
  nearHoldEnd: number;
  landHazeNear: number;
  landHazeFar: number;
  landHazeStrength: number;
} {
  const character = worldHazeCharacter(sceneId);
  const radius = Math.max(40, worldRadius);
  const scale = character.distanceScale;
  const nearHoldStart = Math.min(32, Math.max(12, radius * 0.14 * scale));
  const nearHoldEnd = Math.min(85, Math.max(40, radius * 0.48 * scale));
  const landHazeNear = Math.min(90, Math.max(32, radius * 0.36 * scale));
  const landHazeFar = Math.min(200, Math.max(85, radius * 1.02 * scale));
  return {
    nearHoldStart,
    nearHoldEnd,
    landHazeNear,
    landHazeFar: Math.max(landHazeFar, landHazeNear + 28),
    landHazeStrength: character.shelfStrength,
  };
}

/**
 * How foggy the island's own air is — place knowledge, not a second shader.
 * Polders stay misty in sun; volcanic air is thicker; dry steppe stays open.
 */
export function worldHazeCharacter(sceneId: string): {
  distanceScale: number;
  shelfStrength: number;
} {
  switch (sceneId) {
    case "dutch-polder":
      // Low country: haze even under a clear sun. Earlier shelf, denser mix.
      return { distanceScale: 1.05, shelfStrength: 1.42 };
    case "kallur":
      return { distanceScale: 1.3, shelfStrength: 1.0 };
    case "basalt-stronghold":
    case "nimbus":
      return { distanceScale: 1.25, shelfStrength: 1.18 };
    case "viking-village":
    case "island-airport":
      return { distanceScale: 1.28, shelfStrength: 1.12 };
    case "astana":
      return { distanceScale: 1.35, shelfStrength: 0.88 };
    case "open-house":
    case "grand-terminal":
      return { distanceScale: 1.22, shelfStrength: 0.98 };
    default:
      return { distanceScale: 1.25, shelfStrength: 1.0 };
  }
}

/**
 * How close the camera is to walking off the island, 0 inland → 1 at/past rim.
 * Band ~0.18·groundRadius. Shared by WorldEdge milk and piece edgeMilk.
 */
export function edgeApproachAmount(
  cameraX: number,
  cameraZ: number,
  centerX: number,
  centerZ: number,
  groundRadius: number,
): number {
  const radial = Math.hypot(cameraX - centerX, cameraZ - centerZ);
  const band = Math.max(14, groundRadius * 0.18);
  return Math.max(
    0,
    Math.min(1, (radial - (groundRadius - band)) / band),
  );
}

/** Same noon beam anchor as WorldEnvironment — tests/sky-exposure pins it. */
const NOON_BEAM = 0.906;

/** Sun-tinted forward scatter in the view fog — twilight band only. */
export function fogForwardScatterAmount(
  twilight: number,
  sunOcclusion: number,
): number {
  return twilight * 0.24 * (1 - sunOcclusion * 0.65);
}

/**
 * Soft Mie toward the moon. Density of the shelf is unchanged; this only
 * lights the air so night haze still reads — cooler, quieter than day sun.
 */
export function moonForwardScatterAmount(night: number): number {
  return night > 0.02 ? night * 0.09 : 0;
}

/**
 * Spatial air along the view ray: day punch when the key owns the frame,
 * twilight crown, and moonlit haze after civil dusk. Published once per
 * frame; the shader turns it into path-integrated in-scatter (1 - T^2).
 * Colour always comes from the sky bake + key fog colour — never a white lift.
 */
export function airForwardScatterAmount(
  dayFactor: number,
  keyLevel: number,
  twilight: number,
  sunOcclusion: number,
  night = 0,
): number {
  const sunClear = 1 - sunOcclusion * 0.55;
  const dayPunch = Math.max(
    0,
    Math.min(1, (keyLevel / NOON_BEAM - 0.12) / (0.78 - 0.12)),
  );
  const dayScatter = dayFactor > 0.02
    ? dayFactor * sunClear * (0.055 + dayPunch * 0.2)
    : 0;
  return (
    dayScatter
    + fogForwardScatterAmount(twilight, sunOcclusion)
    + moonForwardScatterAmount(night)
  );
}

export function cloudShaftStrengthAmount(
  beamStrength: number,
  cloudLit: Color,
  dayFactor: number,
  twilight: number,
): number {
  if (beamStrength <= 0 || dayFactor <= 0.02) return 0;
  const lit = Math.max(cloudLit.r, cloudLit.g, cloudLit.b);
  return beamStrength * lit * dayFactor * (0.35 + twilight * 0.65);
}
