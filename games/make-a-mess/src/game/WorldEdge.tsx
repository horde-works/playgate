"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import {
  BufferGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Fog,
  Group,
  MeshStandardMaterial,
  ShaderMaterial,
  Vector3,
} from "three";
import { environmentState } from "./environmentState";
import { windState } from "./windState";

/**
 * The world's edge, made deliberate: a low-poly rock skirt under the island
 * rim (so flyovers see a floating island, not a table edge) and a sea of fog
 * below ground level (so looking over the rim reads as mystery, not as the
 * end of the geometry).
 *
 * The fog is height-based, not camera-distance based — the scene's linear
 * fog cannot hide the rim from a player standing on it, because up close its
 * density is zero. Instead we render two fog surfaces: a cylinder hugging the
 * island just outside the rim and a wide disc far below. Their shader fades
 * alpha by world height with a noise-warped shoreline, so wisps occasionally
 * roll over the edge. Colors are read from `scene.fog` every frame, which
 * keeps the sea in lockstep with the day/night cycle without duplicating any
 * of DayNightCycle's color math.
 *
 * Draw calls: skirt 1 + fog cylinder 1 + fog disc 1 (SceneDressing budget).
 */

interface EdgeProfile {
  /** Radius where the skirt's top ring tucks under the authored ground. */
  groundRadius: number;
  /** Widest bulge of the skirt, just below the ground's earth underlayer. */
  lipRadius: number;
  /** Depth of that bulge — must clear the deepest authored earth tile. */
  lipY: number;
  /** Top ring depth; below the visible ground surface at the rim. */
  topY: number;
  /** Fog wall/creep outer radius — beyond the FARTHEST ground tile of the
   * noisy grid, so the wall never rises between the player and the map. */
  wallRadius: number;
  /** Warm light bleeding through the fog from below (volcanic maps). */
  underglow: boolean;
  /** Rock strata, listed top ring → apex; faces blend between neighbours. */
  strata: readonly string[];
}

// Верхние две страты — тень под дёрном: с воздуха видна ИМЕННО эта пара, и
// светлый песчаник здесь превращал обрыв в бежевый обруч вокруг острова.
const TOWN_STRATA = [
  "#33291e",
  "#4a3b2c",
  "#57452f",
  "#6b5a41",
  "#6d675c",
  "#575149",
  "#454039",
  "#38342e",
] as const;

// Правило профиля: губа лишь на пару метров шире верхнего кольца и сразу
// глубоко — обрыв падает почти вертикально из-под кромки травы. Пологая
// широкая губа читается сверху как надетый на остров обруч.
const EDGE_PROFILES: Record<string, EdgeProfile> = {
  "open-house": {
    groundRadius: 56,
    lipRadius: 57.8,
    lipY: -1.8,
    wallRadius: 61,
    topY: -0.3,
    underglow: false,
    strata: TOWN_STRATA,
  },
  "grand-terminal": {
    groundRadius: 94.5,
    lipRadius: 96.6,
    lipY: -2.0,
    wallRadius: 99,
    topY: -0.3,
    underglow: false,
    strata: TOWN_STRATA,
  },
  "viking-village": {
    groundRadius: 88,
    lipRadius: 90,
    lipY: -2.0,
    wallRadius: 99.5,
    topY: -0.4,
    underglow: false,
    strata: ["#2e261c", "#463a2c", "#514537", "#5c5a52", "#54524b", "#454440", "#3a3936", "#302f2c"],
  },
  "basalt-stronghold": {
    // The rim terrain already eases down ~1.5 m, so the skirt starts deeper.
    groundRadius: 90,
    lipRadius: 92,
    lipY: -3.6,
    wallRadius: 96.5,
    topY: -2.1,
    underglow: true,
    strata: ["#26292c", "#2b2f32", "#3a3e41", "#26292c", "#2e3234", "#212426", "#1b1e20", "#17191b"],
  },
};

function fallbackProfile(worldRadius: number): EdgeProfile {
  return {
    groundRadius: worldRadius - 3,
    lipRadius: worldRadius - 1.5,
    lipY: -2.0,
    wallRadius: worldRadius + 1,
    topY: -0.3,
    underglow: false,
    strata: TOWN_STRATA,
  };
}

// Same deterministic fract-hash the other ambient visuals use.
function hash(index: number, salt: number): number {
  const value = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

const SKIRT_SEGMENTS = 96;

/**
 * Rings of the underside, lip → apex, as terraces: steep cliff faces
 * alternating with inward ledges, the way cut earth and layered rock
 * actually erode. Radii are fractions of lipRadius, drops are metres below
 * lipY. `follow: true` rings inherit the radial noise of the ring above, so
 * every cliff face stays vertical and the strata read as horizontal layers —
 * uncorrelated per-ring noise is what made the first draft read as crumpled
 * foil. `shade` bakes cheap occlusion: faces under overhangs go darker,
 * ledges catch light.
 */
const SKIRT_RINGS = [
  { r: 1, drop: 0, follow: false, detail: 0.3, shade: 0.92 },
  { r: 0.985, drop: 2.8, follow: true, detail: 0, shade: 0.76 },
  { r: 0.915, drop: 3.7, follow: false, detail: 0.9, shade: 1.06 },
  { r: 0.9, drop: 7.6, follow: true, detail: 0, shade: 0.88 },
  { r: 0.82, drop: 8.8, follow: false, detail: 1.4, shade: 1.05 },
  { r: 0.795, drop: 13.6, follow: true, detail: 0, shade: 0.86 },
  { r: 0.665, drop: 15.2, follow: false, detail: 1.9, shade: 1.04 },
  { r: 0.63, drop: 20.4, follow: true, detail: 0, shade: 0.84 },
  { r: 0.485, drop: 22.4, follow: false, detail: 2.2, shade: 1 },
  { r: 0.44, drop: 27.2, follow: true, detail: 0, shade: 0.82 },
  { r: 0.27, drop: 30.4, follow: false, detail: 1.6, shade: 0.9 },
] as const;

const SKIRT_APEX_DROP = 35;

// Smooth around-the-circle wobble (same recipe as the viking palisade ring):
// low harmonics keep neighbouring columns coherent, so the silhouette waves
// instead of jittering.
function rimHarmonic(angle: number): number {
  return (
    Math.sin(angle * 3 + 1.7) * 0.5 +
    Math.sin(angle * 7 + 0.4) * 0.32 +
    Math.sin(angle * 13 + 3.1) * 0.18
  );
}

function buildSkirtGeometry(profile: EdgeProfile): BufferGeometry {
  const strata = profile.strata.map((hex) => new Color(hex));
  const apexY = profile.lipY - SKIRT_APEX_DROP;
  const ringCount = SKIRT_RINGS.length + 1;

  const grid: Vector3[][] = [];
  const shades: number[] = [1];
  for (const ring of SKIRT_RINGS) {
    shades.push(ring.shade);
  }
  for (let segment = 0; segment <= SKIRT_SEGMENTS; segment += 1) {
    const wrapped = segment % SKIRT_SEGMENTS;
    const angle = (wrapped / SKIRT_SEGMENTS) * Math.PI * 2;
    const wave = rimHarmonic(angle);
    const ringPoints: Vector3[] = [
      // Top ring hugs a clean circle so it stays tucked under the ground
      // tiles all the way around.
      new Vector3(
        Math.cos(angle) * profile.groundRadius,
        profile.topY,
        Math.sin(angle) * profile.groundRadius,
      ),
    ];
    let offset = 0;
    for (const [ringIndex, ring] of SKIRT_RINGS.entries()) {
      const depth = ringIndex / (SKIRT_RINGS.length - 1);
      if (!ring.follow) {
        const chip = (hash(wrapped * 7 + ringIndex * 131, 5) - 0.5) * ring.detail;
        offset = wave * (0.4 + depth * 2.6) + chip;
      }
      const radius = Math.max(1.2, profile.lipRadius * ring.r + offset);
      const yJitter = ring.follow ? 0 : (hash(wrapped * 13 + ringIndex * 71, 9) - 0.5) * 0.5;
      ringPoints.push(
        new Vector3(
          Math.cos(angle) * radius,
          profile.lipY - ring.drop + yJitter,
          Math.sin(angle) * radius,
        ),
      );
    }
    grid.push(ringPoints);
  }

  // «Блюр» начинается с сетки: вершины общие между гранями (indexed), цвет
  // задан по кольцу почти без шума — computeVertexNormals даёт МЯГКИЕ
  // нормали, и обрыв перестаёт ловить светом каждую грань по отдельности.
  const positions: number[] = [];
  const colors: number[] = [];
  const scratch = new Color();
  const pushColor = (ringIndex: number, segment: number): void => {
    const t = Math.min(ringIndex / (ringCount - 1), 1) * (strata.length - 1);
    const lower = Math.floor(t);
    const upper = Math.min(lower + 1, strata.length - 1);
    const tone = 0.985 + hash(segment * 3 + ringIndex * 7, 7) * 0.03;
    scratch
      .copy(strata[lower])
      .lerp(strata[upper], t - lower)
      .multiplyScalar(tone * shades[ringIndex]);
    colors.push(scratch.r, scratch.g, scratch.b);
  };

  for (let segment = 0; segment <= SKIRT_SEGMENTS; segment += 1) {
    for (let ringIndex = 0; ringIndex < ringCount; ringIndex += 1) {
      const point = grid[segment][ringIndex];
      positions.push(point.x, point.y, point.z);
      pushColor(ringIndex, segment % SKIRT_SEGMENTS);
    }
  }
  const apexIndex = positions.length / 3;
  positions.push(0, apexY, 0);
  pushColor(ringCount - 1, 0);

  const indices: number[] = [];
  for (let segment = 0; segment < SKIRT_SEGMENTS; segment += 1) {
    const columnA = segment * ringCount;
    const columnB = (segment + 1) * ringCount;
    for (let ringIndex = 0; ringIndex < ringCount - 1; ringIndex += 1) {
      const a = columnA + ringIndex;
      const b = columnB + ringIndex;
      const c = columnB + ringIndex + 1;
      const d = columnA + ringIndex + 1;
      indices.push(a, c, b, a, d, c);
    }
    // Close the bottom with a fan to the apex.
    indices.push(columnA + ringCount - 1, apexIndex, columnB + ringCount - 1);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

const FOG_VERTEX = /* glsl */ `
  varying vec3 vWorld;
  varying vec2 vLocal;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vLocal = position.xz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const FOG_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform vec3 uSunDirection;
  uniform vec3 uSunColor;
  uniform float uDay;
  uniform float uGlow;
  uniform vec3 uGlowColor;
  uniform float uTopY;
  uniform float uFeather;
  uniform float uWind;
  uniform float uSeaRadius;
  uniform float uRimRadius;
  uniform float uCreepStart;
  varying vec3 vWorld;
  varying vec2 vLocal;

  float hash2(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash2(i), hash2(i + vec2(1.0, 0.0)), u.x),
      mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  void main() {
    float drift = uTime * (0.55 + uWind * 0.5);
    vec2 p = vWorld.xz;
    float n = vnoise(p * 0.017 + vec2(drift * 0.016, drift * 0.011)) * 0.62
            + vnoise(p * 0.052 - vec2(drift * 0.021, drift * 0.014)) * 0.28
            + vnoise(p * 0.16 + vec2(0.0, drift * 0.03)) * 0.10;

    // The fog's shoreline is the noise-warped top fade: wisps ride the
    // ridges over the rim, hollows dip below it.
    float warp = (n - 0.5) * 3.2;
    float body = smoothstep(uTopY + warp, uTopY + warp - uFeather, vWorld.y);
    float alpha = body * mix(0.66, 1.0, n);

    // Inside the rim the fog creeps onto the field itself — and it moves.
    // Radial "tongues" (noise sampled in direction/радиус-минус-время space)
    // crawl inward and retreat, so approaching the edge means watching
    // fingers of fog breathe toward you, not stepping onto a static decal.
    float radial = length(vLocal);
    vec2 u = radial > 0.001 ? vLocal / radial : vec2(1.0, 0.0);
    float tongues = vnoise(vec2(u.x * 7.0 + u.y * 2.6, radial * 0.24 - drift * 0.12)) * 0.65
                  + vnoise(vec2(u.y * 9.0 - u.x * 3.4, radial * 0.31 - drift * 0.19)) * 0.35;
    float creep = pow(smoothstep(uCreepStart, uRimRadius + 1.0, radial), 0.75);
    alpha *= creep * mix(0.4, 1.2, tongues);
    // The last strides before the rim are properly thick: no further to go.
    float nearRim = smoothstep(uRimRadius - 3.5, uRimRadius + 1.0, radial);
    alpha = max(alpha, nearRim * body * mix(0.55, 0.9, n));

    // Ridges catch the sun like cloud tops; the glint follows the camera.
    float crest = smoothstep(0.55, 0.9, n);
    vec3 view = normalize(vWorld - cameraPosition);
    float glint = pow(max(dot(view, normalize(uSunDirection)), 0.0), 6.0);
    vec3 color = uFogColor * (1.0 + crest * 0.14 * (0.35 + uDay * 0.65));
    color = mix(color, uSunColor, glint * crest * 0.28);

    // Volcanic maps: warm pools bleed through thin fog after dark.
    float pools = smoothstep(0.58, 0.92, vnoise(p * 0.021 + vec2(41.7, 13.3)));
    color += uGlowColor * pools * uGlow * (0.35 + 0.65 * (1.0 - crest));
    alpha = max(alpha, pools * uGlow * 0.55 * body);

    // Re-apply the scene's linear fog by hand (ShaderMaterial skips it), so
    // the sea dissolves into the horizon exactly like every lit surface.
    float fogAmount = clamp(
      (distance(cameraPosition, vWorld) - uFogNear) / (uFogFar - uFogNear),
      0.0,
      1.0
    );
    color = mix(color, uFogColor, fogAmount);

    // The sea must end before the sky dome does, so its outer edge thins to
    // nothing instead of printing a hard rim against the dome.
    alpha *= 1.0 - smoothstep(0.72, 0.98, length(vLocal) / uSeaRadius);
    gl_FragColor = vec4(color, alpha * 0.97);
  }
`;

const FOG_TOP_Y = 1.25;
const FOG_FEATHER = 3.1;
const FOG_SEA_Y = -7;

export function WorldEdge({
  sceneId,
  worldRadius,
  center,
  cameraFar,
  nightRef,
}: {
  sceneId: string;
  worldRadius: number;
  center: readonly [number, number];
  cameraFar: number;
  nightRef: RefObject<number>;
}) {
  const profile = EDGE_PROFILES[sceneId] ?? fallbackProfile(worldRadius);
  const groupRef = useRef<Group>(null);
  // The sea must fit inside both the camera far plane and the sky dome
  // (whose distance is capped at cameraFar * 0.92 in DayNightCycle).
  const seaRadius = Math.min(worldRadius * 2.35, cameraFar * 0.86);

  const skirtGeometry = useMemo(() => buildSkirtGeometry(profile), [profile]);
  // «Блюр» юбки: постоянная примесь цвета тумана независимо от дистанции
  // камеры (глубже — сильнее). Дефокус восприятием, без пост-процесса —
  // обрыв не спорит за резкость с игровым полем.
  const skirtHazeColor = useMemo(() => ({ value: new Color("#9cc0ce") }), []);
  const skirtMaterial = useMemo(() => {
    const material = new MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.97,
      metalness: 0,
    });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uHazeColor = skirtHazeColor;
      shader.uniforms.uHazeTop = { value: profile.topY };
      shader.uniforms.uHazeDepth = { value: SKIRT_APEX_DROP + 4 };
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          "#include <common>\nvarying float vHaze;\nuniform float uHazeTop;\nuniform float uHazeDepth;",
        )
        .replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\nvHaze = clamp((uHazeTop - transformed.y) / uHazeDepth, 0.0, 1.0);",
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          "#include <common>\nvarying float vHaze;\nuniform vec3 uHazeColor;",
        )
        .replace(
          "#include <fog_fragment>",
          "#include <fog_fragment>\n  gl_FragColor.rgb = mix(gl_FragColor.rgb, uHazeColor, min(vHaze * 0.5 + 0.12, 0.62));",
        );
    };
    return material;
  }, [profile, skirtHazeColor]);

  const fogMaterial = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uFogColor: { value: new Color("#9cc0ce") },
          uFogNear: { value: 42 },
          uFogFar: { value: 128 },
          uSunDirection: { value: new Vector3(0.4, 0.8, 0.2) },
          uSunColor: { value: new Color("#fff3d7") },
          uDay: { value: 1 },
          uGlow: { value: 0 },
          uGlowColor: { value: new Color("#ff5426") },
          uTopY: { value: FOG_TOP_Y },
          uFeather: { value: FOG_FEATHER },
          uWind: { value: 1 },
          uSeaRadius: { value: 120 },
          uRimRadius: { value: 60 },
          uCreepStart: { value: 45 },
        },
        vertexShader: FOG_VERTEX,
        fragmentShader: FOG_FRAGMENT,
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
      }),
    [],
  );

  const fogWallGeometry = useMemo(() => {
    const wallRadius = profile.wallRadius;
    const top = FOG_TOP_Y + 1.8;
    const height = top - (FOG_SEA_Y - 0.5);
    const geometry = new CylinderGeometry(wallRadius, wallRadius, height, 96, 1, true);
    geometry.translate(0, top - height / 2, 0);
    return geometry;
  }, [profile]);

  const fogSeaGeometry = useMemo(() => {
    const geometry = new CircleGeometry(seaRadius, 72);
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, FOG_SEA_Y, 0);
    return geometry;
  }, [seaRadius]);

  // The creep funnel: a shallow cone of fog lying ON the field, ankle-high
  // where it starts and rising over the rim to meet the outer wall. The
  // radial alpha gradient lives in the shader; this mesh just gives it
  // surfaces at the right heights.
  const fogCreepGeometry = useMemo(() => {
    const rings: readonly (readonly [number, number])[] = [
      [profile.groundRadius - 14, 0.06],
      [profile.groundRadius - 6, 0.55],
      [profile.groundRadius - 1.5, 1.05],
      [profile.wallRadius, 1.7],
    ];
    const positions: number[] = [];
    const segments = 96;
    for (let segment = 0; segment < segments; segment += 1) {
      const a0 = (segment / segments) * Math.PI * 2;
      const a1 = ((segment + 1) / segments) * Math.PI * 2;
      for (let band = 0; band < rings.length - 1; band += 1) {
        const [innerR, innerY] = rings[band];
        const [outerR, outerY] = rings[band + 1];
        const ax = Math.cos(a0) * innerR;
        const az = Math.sin(a0) * innerR;
        const bx = Math.cos(a1) * innerR;
        const bz = Math.sin(a1) * innerR;
        const cx = Math.cos(a1) * outerR;
        const cz = Math.sin(a1) * outerR;
        const dx = Math.cos(a0) * outerR;
        const dz = Math.sin(a0) * outerR;
        positions.push(ax, innerY, az, cx, outerY, cz, bx, innerY, bz);
        positions.push(ax, innerY, az, dx, outerY, dz, cx, outerY, cz);
      }
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    return geometry;
  }, [profile]);

  useEffect(() => {
    return () => {
      skirtGeometry.dispose();
      skirtMaterial.dispose();
      fogWallGeometry.dispose();
      fogSeaGeometry.dispose();
      fogCreepGeometry.dispose();
      fogMaterial.dispose();
    };
  }, [skirtGeometry, skirtMaterial, fogWallGeometry, fogSeaGeometry, fogCreepGeometry, fogMaterial]);

  useFrame((frameState) => {
    const uniforms = fogMaterial.uniforms;
    uniforms.uTime.value = frameState.clock.elapsedTime;
    uniforms.uWind.value = windState.strength;
    uniforms.uSeaRadius.value = seaRadius;
    uniforms.uRimRadius.value = profile.groundRadius;
    uniforms.uCreepStart.value = profile.groundRadius - 13;
    const sceneFog = frameState.scene.fog;
    if (sceneFog instanceof Fog) {
      (uniforms.uFogColor.value as Color).copy(sceneFog.color);
      uniforms.uFogNear.value = sceneFog.near;
      uniforms.uFogFar.value = sceneFog.far;
      // Дымка юбки живёт тем же цветом, что и туман времени суток.
      skirtHazeColor.value.copy(sceneFog.color);
    }
    (uniforms.uSunDirection.value as Vector3).copy(environmentState.sunDirection);
    (uniforms.uSunColor.value as Color).copy(environmentState.sunColor);
    uniforms.uDay.value = environmentState.dayFactor;
    const night = nightRef.current ?? 0;
    uniforms.uGlow.value = profile.underglow
      ? night * 0.85 + environmentState.twilightFactor * 0.25
      : 0;
  });

  return (
    <group ref={groupRef} position={[center[0], 0, center[1]]}>
      <mesh geometry={skirtGeometry} material={skirtMaterial} />
      {/* Fog draws after the Sky dome (renderOrder 1000): over the void
          nothing writes depth, so anything below 1000 would be painted over
          by the sky. */}
      <mesh
        geometry={fogWallGeometry}
        material={fogMaterial}
        renderOrder={1001}
        frustumCulled={false}
      />
      <mesh
        geometry={fogSeaGeometry}
        material={fogMaterial}
        renderOrder={1001}
        frustumCulled={false}
      />
      <mesh
        geometry={fogCreepGeometry}
        material={fogMaterial}
        renderOrder={1001}
        frustumCulled={false}
      />
    </group>
  );
}
