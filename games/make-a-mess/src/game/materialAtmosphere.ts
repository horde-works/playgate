import { Color, Vector2, Vector3, type DataTexture, type WebGLProgramParametersWithUniforms } from "three";
import { CLOUD_LAW } from "./skyWeatherModel.ts";
import { getSkyFieldTexture } from "./skyClouds.ts";

/** Fixed steps for deck-gap shafts in piece materials — cheap, same law as sky. */
export const MATERIAL_CLOUD_SHAFT_STEPS = 4;

export interface MaterialAtmosphereState {
  readonly sunDirection: readonly [number, number, number];
  readonly sunFogColour: readonly [number, number, number];
  /** Integrated in-scatter along the view path (day + twilight). */
  readonly airForwardScatter: number;
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
 * Spatial air along the view ray: day punch when the key owns the frame,
 * plus the twilight term above. Published once per frame; the shader turns
 * it into path-integrated in-scatter (1 - T^2), not a flat endpoint tint.
 */
export function airForwardScatterAmount(
  dayFactor: number,
  keyLevel: number,
  twilight: number,
  sunOcclusion: number,
): number {
  const sunClear = 1 - sunOcclusion * 0.55;
  const dayPunch = Math.max(
    0,
    Math.min(1, (keyLevel / NOON_BEAM - 0.12) / (0.78 - 0.12)),
  );
  const dayScatter = dayFactor > 0.02
    ? dayFactor * sunClear * (0.055 + dayPunch * 0.2)
    : 0;
  return dayScatter + fogForwardScatterAmount(twilight, sunOcclusion);
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
