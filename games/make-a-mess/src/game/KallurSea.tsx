import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  ShaderMaterial,
  Vector3,
} from "three";
import {
  buildKallurSeaGeometry,
  KALLUR_SEA_SHORE_BAND,
} from "../content/scenes/kallur/kallurSeaModel.ts";
import { environmentState } from "./environmentState";

/**
 * The Kallur ocean: the accepted lab tiles S1/S2 ported verbatim. One
 * opaque annular sheet under the island; waves are a moving pattern in the
 * fragment shader (swell octaves elongated along their crests, glitter
 * whose gloss falls with the pixel footprint, whitecaps by day), plus a
 * vertex-shader swell that breathes the waterline against the cliffs in
 * the shore band. No reflection or refraction passes: deep water is
 * opaque, the sky arrives through fresnel, the sun through the glint —
 * and at night the key light IS the moon, so the moon path is free.
 * The world-edge fog sea (y = -7, drawn above 1000) dissolves the far
 * field exactly like the lab's haze.
 */

const DAY = {
  deep: new Color("#3e6489"),
  light: new Color("#7a97a9"),
  sky: new Color("#e7e8e8"),
  haze: new Color("#e0e4e6"),
};
const DUSK = {
  deep: new Color("#232735"),
  light: new Color("#3a4351"),
  sky: new Color("#f0b273"),
  haze: new Color("#8a7360"),
};
const NIGHT = {
  deep: new Color("#0f131d"),
  light: new Color("#1b2130"),
  sky: new Color("#2a3040"),
  haze: new Color("#222936"),
};

const seaGlsl = /* glsl */ `
float seaHash(vec2 cell, float seed) {
  return fract(sin(cell.x * 127.1 + cell.y * 311.7 + seed * 74.7) * 43758.5453);
}
float seaNoise(vec2 point, float seed) {
  vec2 cell = floor(point);
  vec2 fraction = point - cell;
  fraction = fraction * fraction * (3.0 - 2.0 * fraction);
  float a = seaHash(cell, seed);
  float b = seaHash(cell + vec2(1.0, 0.0), seed);
  float c = seaHash(cell + vec2(0.0, 1.0), seed);
  float d = seaHash(cell + vec2(1.0, 1.0), seed);
  return mix(mix(a, b, fraction.x), mix(c, d, fraction.x), fraction.y) * 2.0 - 1.0;
}
// Lab seaHeight, verbatim numbers; phase animates the swell travel.
float seaHeight(vec2 p, float phase) {
  float height = 0.0;
  height += sin((p.y + phase * 14.0) / 90.0 * 6.28318 +
    seaNoise(vec2(p.x / 260.0, p.y / 90.0), 601.0) * 2.2) * 0.85;
  height += sin((p.y * 0.94 + p.x * 0.34 + phase * 9.0) / 46.0 * 6.28318 +
    seaNoise(vec2(p.x / 150.0, p.y / 60.0), 602.0) * 2.0) * 0.45;
  height += seaNoise(vec2((p.x * 0.97 + p.y * 0.26) / 70.0,
    (p.y * 0.97 - p.x * 0.26) / 15.0), 603.0) * 0.3;
  height += seaNoise(vec2(p.x / 6.5, (p.y + phase * 4.0) / 5.2), 604.0) * 0.2;
  height += seaNoise(vec2(p.x / 2.1, p.y / 1.8), 605.0) * 0.11;
  height += seaNoise(vec2(p.x / 0.8, p.y / 0.7), 606.0) * 0.055;
  return height;
}
`;

export function KallurSea() {
  const materialRef = useRef<ShaderMaterial>(null);

  const geometry = useMemo(() => {
    const data = buildKallurSeaGeometry();
    const built = new BufferGeometry();
    built.setAttribute("position", new BufferAttribute(data.positions, 3));
    built.setAttribute("shoreDistance", new BufferAttribute(data.shoreDistances, 1));
    built.setIndex(new BufferAttribute(data.indices, 1));
    // The swell displaces vertices; give culling the full breathing box.
    built.computeBoundingSphere();
    if (built.boundingSphere) built.boundingSphere.radius += 4;
    return built;
  }, []);

  const material = useMemo(() => new ShaderMaterial({
    side: DoubleSide,
    uniforms: {
      uPhase: { value: 0 },
      uKeyDir: { value: new Vector3(0.4, 0.7, 0.5) },
      uKeyColor: { value: new Color("#fff2d8") },
      uDayFactor: { value: 1 },
      uTwilight: { value: 0 },
      uDeep: { value: DAY.deep.clone() },
      uLight: { value: DAY.light.clone() },
      uSky: { value: DAY.sky.clone() },
      uHaze: { value: DAY.haze.clone() },
      uShoreBand: { value: KALLUR_SEA_SHORE_BAND },
    },
    vertexShader: /* glsl */ `
      uniform float uPhase;
      uniform float uShoreBand;
      attribute float shoreDistance;
      varying vec3 vWorld;
      varying float vShoreDist;
      ${seaGlsl}
      void main() {
        vec3 world = (modelMatrix * vec4(position, 1.0)).xyz;
        // The waterline breathes against the cliffs: real displacement in
        // the shore band only, the far field stays a pattern.
        float breathe = 1.0 - smoothstep(uShoreBand * 0.5, uShoreBand, shoreDistance);
        world.y += seaHeight(world.xz, uPhase) * 0.55 * breathe;
        vWorld = world;
        vShoreDist = shoreDistance;
        gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uPhase;
      uniform vec3 uKeyDir;
      uniform vec3 uKeyColor;
      uniform float uDayFactor;
      uniform float uTwilight;
      uniform vec3 uDeep;
      uniform vec3 uLight;
      uniform vec3 uSky;
      uniform vec3 uHaze;
      varying vec3 vWorld;
      varying float vShoreDist;
      ${seaGlsl}
      void main() {
        vec2 p = vWorld.xz;
        // Footprint law (lab): octaves below the pixel dissolve, and the
        // glitter widens into the path as the gloss falls with distance.
        float footprint = length(fwidth(p));
        float fadeFine = 1.0 - smoothstep(2.2, 9.0, footprint);
        float epsilon = max(0.12, footprint * 0.5);
        float hx = seaHeight(p + vec2(epsilon, 0.0), uPhase)
          - seaHeight(p - vec2(epsilon, 0.0), uPhase);
        float hz = seaHeight(p + vec2(0.0, epsilon), uPhase)
          - seaHeight(p - vec2(0.0, epsilon), uPhase);
        float normalGain = 0.6 + 0.4 * fadeFine;
        vec3 normal = normalize(vec3(
          -hx / (2.0 * epsilon) * normalGain,
          1.0,
          -hz / (2.0 * epsilon) * normalGain));
        vec3 view = normalize(cameraPosition - vWorld);
        float cosView = max(0.02, dot(normal, view));
        float fresnel = 0.02 + 0.98 * pow(1.0 - cosView, 5.0);
        float faceLight = clamp(0.5 + dot(normal.xz, uKeyDir.xz) * 2.2, 0.0, 1.0);
        vec3 water = mix(uDeep, uLight, faceLight * 0.55);
        water = mix(water, uSky, clamp(fresnel, 0.0, 1.0) * 0.82);
        vec3 reflected = reflect(-view, normal);
        float toKey = max(0.0, dot(reflected, normalize(uKeyDir)));
        float glossExponent = 70.0 + 480.0 * fadeFine;
        float glint = pow(toKey, glossExponent) * mix(2.2, 2.6, uTwilight);
        water += uKeyColor * glint;
        // Whitecaps by day (windy Faroe), calm by dusk and night.
        float crest = seaHeight(p, uPhase) - seaHeight(p + vec2(0.0, 2.6), uPhase);
        float caps = smoothstep(0.5, 0.85, crest)
          * smoothstep(0.42, 0.8, seaNoise(p / vec2(9.0, 7.0), 611.0))
          * fadeFine * uDayFactor;
        water = mix(water, vec3(0.94, 0.96, 0.97), clamp(caps, 0.0, 1.0) * 0.8);
        // The foam collar: lapping breath where the sea meets the coast.
        float foamPulse = 0.5 + 0.5 * sin(uPhase * 0.9 + vShoreDist * 0.9
          + seaNoise(p / 4.0, 617.0) * 3.0);
        float foam = smoothstep(7.0, 1.2, vShoreDist)
          * (0.45 + 0.55 * foamPulse)
          * (0.6 + 0.4 * seaNoise(p / 2.3, 618.0));
        water = mix(water, vec3(0.93, 0.95, 0.96), clamp(foam, 0.0, 1.0) * 0.85);
        // Aerial haze toward the horizon; the fog sea finishes the far
        // dissolve above this surface.
        float away = length(cameraPosition.xz - p);
        water = mix(water, uHaze, smoothstep(180.0, 270.0, away) * 0.85);
        gl_FragColor = vec4(water, 1.0);
      }
    `,
  }), []);

  useFrame((_, delta) => {
    const shader = materialRef.current;
    if (!shader) return;
    // Deep-water phase speed of the 90 m swell: about 12 m/s of travel.
    shader.uniforms.uPhase.value += delta * 0.86;
    shader.uniforms.uKeyDir.value.copy(environmentState.keyLightDirection);
    shader.uniforms.uKeyColor.value.copy(environmentState.keyLightColor);
    const night = environmentState.nightFactor;
    const twilight = environmentState.twilightFactor;
    shader.uniforms.uDayFactor.value = environmentState.dayFactor;
    shader.uniforms.uTwilight.value = twilight;
    for (const key of ["deep", "light", "sky", "haze"] as const) {
      const target = shader.uniforms[
        `u${key.charAt(0).toUpperCase()}${key.slice(1)}` as "uDeep"
      ].value as Color;
      target.copy(DAY[key]).lerp(NIGHT[key], night).lerp(DUSK[key], twilight);
    }
  });

  return (
    <mesh
      geometry={geometry}
      material={material}
      ref={(mesh) => {
        if (mesh) materialRef.current = mesh.material as ShaderMaterial;
      }}
      frustumCulled={false}
    />
  );
}
