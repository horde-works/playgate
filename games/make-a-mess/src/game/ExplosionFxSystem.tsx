"use client";

import { useFrame, useThree } from "@react-three/fiber";
import type { RapierRigidBody } from "@react-three/rapier";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type MutableRefObject,
} from "react";
import {
  BoxGeometry,
  Color,
  Data3DTexture,
  FrontSide,
  GLSL3,
  InstancedBufferAttribute,
  InstancedMesh,
  LinearFilter,
  Mesh,
  NormalBlending,
  PlaneGeometry,
  PointLight,
  RedFormat,
  RepeatWrapping,
  ShaderMaterial,
  UnsignedByteType,
  Vector3,
} from "three";
import {
  materialRuntimeProfiles,
  type BreakableMaterial,
} from "./destructionScene";
import { performanceGovernor } from "./performanceGovernor";

const TRAIL_CAPACITY = 192;
const FIREBALL_CAPACITY = 2;
const MAX_ACTIVE_BLASTS = 4;
const MAX_TRAILED_DEBRIS_PER_BLAST = 10;
const LIGHT_CAPACITY = 2;

export interface ExplosionFxDefinition {
  readonly id: number;
  readonly kind: "grenade" | "rocket";
  readonly position: readonly [number, number, number];
  readonly lobes: readonly ExplosionFxLobe[];
  readonly dustColor: readonly [number, number, number];
}

export interface ExplosionFxLobe {
  readonly direction: readonly [number, number, number];
  readonly weight: number;
  readonly delay: number;
}

export interface ExplosionDebrisProfile {
  readonly material: BreakableMaterial;
  readonly volume: number;
}

export interface ExplosionFxRuntime {
  spawn: (definition: ExplosionFxDefinition) => void;
  clear: () => void;
}

interface ParticlePool {
  readonly capacity: number;
  readonly geometry: PlaneGeometry;
  readonly material: ShaderMaterial;
  readonly origin: Float32Array;
  readonly velocity: Float32Array;
  readonly timing: Float32Array;
  readonly style: Float32Array;
  readonly color: Float32Array;
  cursor: number;
}

interface ParticleSpawn {
  readonly origin: readonly [number, number, number];
  readonly velocity: readonly [number, number, number];
  readonly reach: number;
  readonly birth: number;
  readonly life: number;
  readonly size: number;
  readonly seed: number;
  readonly kind: number;
  readonly heat: number;
  readonly color: readonly [number, number, number];
}

interface TrackedDebris {
  readonly position: Vector3;
  lastSeenAt: number;
}

interface ActiveBlast {
  readonly id: number;
  readonly center: Vector3;
  readonly visualRadius: number;
  readonly expiresAt: number;
  readonly tracked: Map<string, TrackedDebris>;
  nextScanAt: number;
}

interface FireballSlot {
  readonly position: Vector3;
  readonly dustColor: Color;
  readonly ventDirection: Vector3;
  readonly noiseOffset: Vector3;
  birth: number;
  life: number;
  diameter: number;
  ventStrength: number;
  rocket: boolean;
}

interface LightSlot {
  readonly position: Vector3;
  birth: number;
  life: number;
  peak: number;
  distance: number;
}

const dustinessByMaterial: Record<BreakableMaterial, number> = {
  brick: 0.9,
  wood: 0.48,
  cloth: 0.08,
  plaster: 1,
  concrete: 0.92,
  glass: 0.04,
  steel: 0,
  plastic: 0.12,
  stone: 0.72,
  basalt: 0.62,
  graphiteStone: 0.68,
  darkGlass: 0.03,
  foliage: 0.18,
  grass: 0.28,
  soil: 1,
  earth: 1,
  asphalt: 0.58,
};

function random01(seed: number, index: number, salt: number): number {
  const value =
    Math.sin(seed * 17.17 + index * 91.91 + salt * 37.37) * 43758.5453;
  return value - Math.floor(value);
}

function createPool(capacity: number, material: ShaderMaterial): ParticlePool {
  const geometry = new PlaneGeometry(1, 1);
  const origin = new Float32Array(capacity * 3);
  const velocity = new Float32Array(capacity * 3);
  const timing = new Float32Array(capacity * 4);
  const style = new Float32Array(capacity * 4);
  const color = new Float32Array(capacity * 3);
  geometry.setAttribute("aOrigin", new InstancedBufferAttribute(origin, 3));
  geometry.setAttribute("aVelocity", new InstancedBufferAttribute(velocity, 3));
  geometry.setAttribute("aTiming", new InstancedBufferAttribute(timing, 4));
  geometry.setAttribute("aStyle", new InstancedBufferAttribute(style, 4));
  geometry.setAttribute("aColor", new InstancedBufferAttribute(color, 3));
  return {
    capacity,
    geometry,
    material,
    origin,
    velocity,
    timing,
    style,
    color,
    cursor: 0,
  };
}

function writeParticle(pool: ParticlePool, particle: ParticleSpawn): void {
  const index = pool.cursor;
  pool.cursor = (pool.cursor + 1) % pool.capacity;
  pool.origin.set(particle.origin, index * 3);
  pool.velocity.set(particle.velocity, index * 3);
  pool.timing.set(
    [particle.birth, particle.life, particle.reach, particle.size],
    index * 4,
  );
  pool.style.set([particle.seed, particle.kind, particle.heat, 0], index * 4);
  pool.color.set(particle.color, index * 3);
}

function markPoolDirty(pool: ParticlePool): void {
  for (const name of [
    "aOrigin",
    "aVelocity",
    "aTiming",
    "aStyle",
    "aColor",
  ] as const) {
    (pool.geometry.getAttribute(name) as InstancedBufferAttribute).needsUpdate =
      true;
  }
}

function clearPool(pool: ParticlePool): void {
  for (let index = 1; index < pool.timing.length; index += 4) {
    pool.timing[index] = 0;
  }
  pool.cursor = 0;
  markPoolDirty(pool);
}

function createExplosionNoiseTexture(): Data3DTexture {
  const size = 32;
  const data = new Uint8Array(size * size * size);
  let state = 0x9e3779b9;
  for (let index = 0; index < data.length; index += 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    data[index] = state & 0xff;
  }
  const texture = new Data3DTexture(data, size, size, size);
  texture.format = RedFormat;
  texture.type = UnsignedByteType;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.wrapR = RepeatWrapping;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  return texture;
}

function createFireballMaterial(noise: Data3DTexture): ShaderMaterial {
  return new ShaderMaterial({
    glslVersion: GLSL3,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: FrontSide,
    blending: NormalBlending,
    toneMapped: false,
    uniforms: {
      uNoise: { value: noise },
      uCameraLocal: { value: new Vector3() },
      uAge: { value: -1 },
      uLife: { value: 1 },
      uRocket: { value: 0 },
      uSteps: { value: 24 },
      uDustColor: { value: new Color("#766653") },
      uVentDirection: { value: new Vector3(0, 1, 0) },
      uVentStrength: { value: 0 },
      uNoiseOffset: { value: new Vector3() },
    },
    vertexShader: /* glsl */ `
      out vec3 vLocalPosition;

      void main() {
        vLocalPosition = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      precision highp sampler3D;

      uniform sampler3D uNoise;
      uniform vec3 uCameraLocal;
      uniform float uAge;
      uniform float uLife;
      uniform float uRocket;
      uniform float uSteps;
      uniform vec3 uDustColor;
      uniform vec3 uVentDirection;
      uniform float uVentStrength;
      uniform vec3 uNoiseOffset;

      in vec3 vLocalPosition;
      out vec4 fragColor;

      const int MAX_STEPS = 32;

      vec2 intersectBox(vec3 origin, vec3 direction) {
        vec3 safeDirection = sign(direction + vec3(0.00001))
          * max(abs(direction), vec3(0.0001));
        vec3 inverseDirection = 1.0 / safeDirection;
        vec3 nearPlane = (-vec3(0.5) - origin) * inverseDirection;
        vec3 farPlane = (vec3(0.5) - origin) * inverseDirection;
        vec3 lower = min(nearPlane, farPlane);
        vec3 upper = max(nearPlane, farPlane);
        return vec2(
          max(max(lower.x, lower.y), lower.z),
          min(min(upper.x, upper.y), upper.z)
        );
      }

      float pixelNoise(vec2 point) {
        return fract(sin(dot(point, vec2(12.9898, 78.233))) * 43758.5453);
      }

      vec3 fireColor(float temperature) {
        vec3 ember = vec3(0.72, 0.035, 0.004);
        vec3 orange = vec3(3.3, 0.52, 0.025);
        vec3 yellow = vec3(7.2, 2.55, 0.34);
        vec3 whiteHot = vec3(11.5, 8.2, 3.9);
        vec3 color = mix(ember, orange, smoothstep(0.06, 0.32, temperature));
        color = mix(color, yellow, smoothstep(0.3, 0.66, temperature));
        return mix(color, whiteHot, smoothstep(0.64, 0.94, temperature));
      }

      void main() {
        if (uAge < 0.0 || uAge >= uLife) discard;

        vec3 rayOrigin = uCameraLocal;
        vec3 rayDirection = normalize(vLocalPosition - rayOrigin);
        vec2 bounds = intersectBox(rayOrigin, rayDirection);
        float rayStart = max(0.0, bounds.x);
        float rayEnd = bounds.y;
        if (rayEnd <= rayStart) discard;

        float ignition = smoothstep(0.0, 0.014, uAge);
        float expansion = 1.0 - exp(-uAge * mix(15.0, 11.0, uRocket));
        float late = smoothstep(0.32, uLife, uAge);
        float radius = mix(0.055, 0.405, expansion) + late * 0.035;
        float heatTime = exp(-uAge * mix(4.2, 3.35, uRocket));
        float smokeArrival = smoothstep(0.12, 0.48, uAge);
        float lift = smoothstep(0.32, uLife, uAge) * 0.11;

        float segment = (rayEnd - rayStart) / max(1.0, uSteps);
        float cursor = rayStart + segment * pixelNoise(gl_FragCoord.xy + uNoiseOffset.xy * 97.0);
        vec3 accumulated = vec3(0.0);
        float opacity = 0.0;

        for (int index = 0; index < MAX_STEPS; index += 1) {
          if (float(index) >= uSteps || cursor > rayEnd || opacity > 0.992) break;

          vec3 point = rayOrigin + rayDirection * cursor;
          vec3 centered = point - vec3(0.0, lift, 0.0);
          float pointLength = length(centered);
          vec3 pointDirection = centered / max(0.0001, pointLength);
          float vent = max(0.0, dot(pointDirection, uVentDirection));

          float broadNoise = texture(
            uNoise,
            centered * 0.72 + uNoiseOffset + vec3(0.0, uAge * 0.035, 0.0)
          ).r;
          float detailNoise = texture(
            uNoise,
            centered * 1.85 + uNoiseOffset.yzx * 1.7 - vec3(0.0, uAge * 0.06, 0.0)
          ).r;
          float boundary = radius
            + (broadNoise - 0.5) * 0.105
            + (detailNoise - 0.5) * 0.038
            + vent * uVentStrength * 0.075;
          float density = 1.0
            - smoothstep(-0.055, 0.035, pointLength - boundary);
          density *= ignition;

          if (density > 0.001) {
            float core = clamp(1.0 - pointLength / max(0.001, boundary), 0.0, 1.0);
            float thermalBreakup = mix(0.74, 1.15, broadNoise)
              * mix(0.86, 1.08, detailNoise);
            float temperature = clamp(
              heatTime * thermalBreakup * (0.38 + core * 0.9),
              0.0,
              1.15
            );
            float soot = smokeArrival * (0.42 + 0.58 * (1.0 - temperature));
            float extinction = density * mix(12.0, 18.0, soot);
            float sampleAlpha = 1.0 - exp(-extinction * segment);

            vec3 smokeColor = mix(
              uDustColor * 0.27,
              uDustColor * 0.72,
              0.25 + 0.55 * broadNoise + centered.y * 0.2
            );
            float emissionMask = temperature
              * mix(1.0, 0.36, smoothstep(0.62, 1.0, density) * soot);
            vec3 emission = fireColor(temperature) * emissionMask;
            vec3 scattered = fireColor(min(0.58, temperature))
              * temperature * density * 0.18;
            vec3 sampleColor = mix(emission + scattered, smokeColor, soot);

            float transmittance = 1.0 - opacity;
            accumulated += transmittance * sampleColor * sampleAlpha;
            opacity += transmittance * sampleAlpha;
          }
          cursor += segment;
        }

        if (opacity < 0.004) discard;
        fragColor = vec4(accumulated / max(0.001, opacity), opacity);
      }
    `,
  });
}

function createTrailMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: NormalBlending,
    toneMapped: false,
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      uniform float uTime;
      attribute vec3 aOrigin;
      attribute vec3 aVelocity;
      attribute vec4 aTiming;
      attribute vec4 aStyle;
      attribute vec3 aColor;
      varying vec2 vQuad;
      varying float vLife;
      varying float vSeed;
      varying float vKind;
      varying float vHeat;
      varying vec3 vColor;

      void main() {
        float aBirth = aTiming.x;
        float aLife = aTiming.y;
        float aReach = aTiming.z;
        float aSize = aTiming.w;
        float aSeed = aStyle.x;
        float aKind = aStyle.y;
        float aHeat = aStyle.z;
        float age = uTime - aBirth;
        if (aLife <= 0.0 || age < 0.0 || age >= aLife) {
          gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
          vLife = 1.0;
          return;
        }
        float life = clamp(age / aLife, 0.0, 1.0);
        float drag = aKind < 0.5 ? 1.45 : (aKind < 1.5 ? 1.0 : 1.8);
        float travel = (1.0 - exp(-drag * age)) / drag;
        vec3 displacement = aVelocity * travel;
        float displacementLength = length(displacement);
        if (displacementLength > aReach) {
          displacement *= aReach / max(0.0001, displacementLength);
        }
        vec3 center = aOrigin + displacement;
        center.y += aKind < 0.5
          ? 0.34 * age * age
          : (aKind < 1.5 ? -0.12 * age * age : 0.11 * age * age);
        float growth = aKind < 0.5
          ? mix(0.48, 2.25, pow(life, 0.72))
          : (aKind < 1.5
            ? mix(0.58, 1.85, pow(life, 0.62))
            : mix(0.5, 1.5, life));
        float size = aSize * growth;
        vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 camUp = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        vec3 world = center
          + camRight * position.x * size * 1.14
          + camUp * position.y * size;
        vQuad = position.xy;
        vLife = life;
        vSeed = aSeed;
        vKind = aKind;
        vHeat = aHeat;
        vColor = aColor;
        gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision mediump float;
      varying vec2 vQuad;
      varying float vLife;
      varying float vSeed;
      varying float vKind;
      varying float vHeat;
      varying vec3 vColor;

      void main() {
        vec2 p = vQuad * 2.0;
        float angle = atan(p.y, p.x);
        float edge = 1.0
          + 0.11 * sin(angle * 5.0 + vSeed * 6.2832)
          + 0.055 * sin(angle * 9.0 - vSeed * 4.7);
        float radius = length(p) * edge;
        float alpha = smoothstep(1.0, 0.1, radius);
        float billow = 0.82 + 0.18 * sin(
          p.x * 7.0 + sin(p.y * 5.0 + vSeed * 8.0)
        ) * sin(p.y * 6.0 - vSeed * 5.0);
        float appearWindow = vHeat > 0.01
          ? 0.012
          : (vKind > 1.5 ? 0.08 : 0.055);
        float appear = smoothstep(0.0, appearWindow, vLife);
        float fade = smoothstep(1.0, vKind < 0.5 ? 0.48 : 0.58, vLife);
        float density = vKind < 0.5 ? 0.72 : (vKind < 1.5 ? 0.68 : 0.24);
        float heatEnd = 0.13 + vSeed * 0.17;
        float heat = vHeat * smoothstep(heatEnd, 0.012, vLife);
        alpha *= billow * appear * fade * density * mix(1.0, 1.38, heat);
        if (alpha < 0.003) discard;
        float softLight = 0.82 + (p.y * 0.5 + 0.5) * 0.18;
        vec3 aged = mix(vColor * 0.72, vColor * 1.12, vLife);
        vec3 hot = mix(
          vec3(2.35, 0.48, 0.045),
          vec3(4.25, 2.35, 0.62),
          smoothstep(0.25, 0.92, heat)
        );
        vec3 cloud = mix(aged * softLight, hot, heat);
        gl_FragColor = vec4(cloud, alpha);
      }
    `,
  });
}

function createFireballSlot(): FireballSlot {
  return {
    position: new Vector3(),
    dustColor: new Color("#766653"),
    ventDirection: new Vector3(0, 1, 0),
    noiseOffset: new Vector3(),
    birth: Number.NEGATIVE_INFINITY,
    life: 0,
    diameter: 1,
    ventStrength: 0,
    rocket: false,
  };
}

export function ExplosionFxSystem({
  runtimeRef,
  bodies,
  resolveDebrisProfile,
}: {
  runtimeRef: MutableRefObject<ExplosionFxRuntime | null>;
  bodies: MutableRefObject<Map<string, RapierRigidBody>>;
  resolveDebrisProfile: (id: string) => ExplosionDebrisProfile | null;
}) {
  const { camera: renderCamera, gl, scene: renderScene } = useThree();
  const trailMesh = useRef<InstancedMesh>(null);
  const fireballRefs = useRef<Array<Mesh | null>>(
    Array.from({ length: FIREBALL_CAPACITY }, () => null),
  );
  const lightRefs = useRef<Array<PointLight | null>>(
    Array.from({ length: LIGHT_CAPACITY }, () => null),
  );
  const trailPool = useMemo(
    () => createPool(TRAIL_CAPACITY, createTrailMaterial()),
    [],
  );
  const fireballGeometry = useMemo(() => new BoxGeometry(1, 1, 1), []);
  const fireballNoise = useMemo(() => createExplosionNoiseTexture(), []);
  const fireballMaterials = useMemo(
    () =>
      Array.from({ length: FIREBALL_CAPACITY }, () =>
        createFireballMaterial(fireballNoise),
      ),
    [fireballNoise],
  );
  const fireballSlots = useRef<FireballSlot[]>(
    Array.from({ length: FIREBALL_CAPACITY }, createFireballSlot),
  );
  const fireballCursor = useRef(0);
  const activeBlasts = useRef<ActiveBlast[]>([]);
  const lightCursor = useRef(0);
  const lightSlots = useRef<LightSlot[]>(
    Array.from({ length: LIGHT_CAPACITY }, () => ({
      position: new Vector3(),
      birth: Number.NEGATIVE_INFINITY,
      life: 0,
      peak: 0,
      distance: 0,
    })),
  );
  const trailPosition = useMemo(() => new Vector3(), []);
  const trailColor = useMemo(() => new Color(), []);
  const cameraWorld = useMemo(() => new Vector3(), []);
  const cameraLocal = useMemo(() => new Vector3(), []);

  const clear = useCallback(() => {
    clearPool(trailPool);
    activeBlasts.current = [];
    for (const slot of fireballSlots.current) slot.life = 0;
    for (const fireball of fireballRefs.current) {
      if (fireball) fireball.visible = false;
    }
    for (const slot of lightSlots.current) {
      slot.life = 0;
    }
    for (const light of lightRefs.current) {
      if (light) light.intensity = 0;
    }
  }, [trailPool]);

  const spawn = useCallback((definition: ExplosionFxDefinition) => {
    const now = performance.now() / 1000;
    const snapshot = performanceGovernor.getSnapshot();
    const quality = Math.min(snapshot.cpuQuality, snapshot.gpuQuality);
    const rocket = definition.kind === "rocket";
    const seed = definition.id * 0.61803398875;

    const fireballIndex = fireballCursor.current;
    fireballCursor.current = (fireballCursor.current + 1) % FIREBALL_CAPACITY;
    const fireball = fireballSlots.current[fireballIndex];
    fireball.position.set(...definition.position);
    fireball.dustColor.setRGB(...definition.dustColor);
    fireball.birth = now;
    fireball.life = rocket ? 2.85 : 2.2;
    fireball.diameter = rocket ? 5.4 : 3.15;
    fireball.rocket = rocket;
    fireball.noiseOffset.set(
      random01(seed, 0, 13) * 9,
      random01(seed, 1, 17) * 9,
      random01(seed, 2, 19) * 9,
    );
    fireball.ventDirection.set(0, 0, 0);
    let ventWeight = 0;
    for (const lobe of definition.lobes) {
      const openness = Math.max(0, lobe.weight - 0.18);
      fireball.ventDirection.x += lobe.direction[0] * openness;
      fireball.ventDirection.y += lobe.direction[1] * openness;
      fireball.ventDirection.z += lobe.direction[2] * openness;
      ventWeight += openness;
    }
    const ventSignal = fireball.ventDirection.length();
    fireball.ventStrength =
      ventWeight > 0 ? Math.min(0.28, (ventSignal / ventWeight) * 0.24) : 0;
    if (ventSignal > 0.0001) {
      fireball.ventDirection.multiplyScalar(1 / ventSignal);
    } else {
      fireball.ventDirection.set(0, 1, 0);
    }
    activeBlasts.current = [
      ...activeBlasts.current.filter((blast) => blast.expiresAt > now),
      {
        id: definition.id,
        center: new Vector3(...definition.position),
        visualRadius: rocket ? 8 : 4.2,
        expiresAt: now + (rocket ? 2.2 : 1.55),
        tracked: new Map(),
        nextScanAt: now + 0.08,
      },
    ].slice(-MAX_ACTIVE_BLASTS);

    const slotIndex = lightCursor.current;
    lightCursor.current = (lightCursor.current + 1) % LIGHT_CAPACITY;
    const slot = lightSlots.current[slotIndex];
    slot.position.set(...definition.position);
    slot.birth = now;
    slot.life = rocket ? 0.42 : 0.28;
    slot.peak = (rocket ? 150 : 78) * [0.72, 0.88, 1][quality];
    slot.distance = rocket ? 7 : 4.2;
  }, []);

  useEffect(() => {
    const api: ExplosionFxRuntime = { spawn, clear };
    runtimeRef.current = api;
    return () => {
      if (runtimeRef.current === api) runtimeRef.current = null;
    };
  }, [clear, runtimeRef, spawn]);

  useEffect(() => {
    let cancelled = false;
    // Invisible materials are otherwise compiled on the first explosion and
    // recreate the exact first-shot hitch this system is meant to remove.
    for (const mesh of fireballRefs.current) {
      if (mesh) mesh.visible = true;
    }
    void gl
      .compileAsync(renderScene, renderCamera)
      .catch(() => undefined)
      .finally(() => {
        if (cancelled) return;
        const now = performance.now() / 1000;
        for (let index = 0; index < FIREBALL_CAPACITY; index += 1) {
          const mesh = fireballRefs.current[index];
          const slot = fireballSlots.current[index];
          if (mesh && (slot.life <= 0 || now - slot.birth >= slot.life)) {
            mesh.visible = false;
          }
        }
      });
    return () => {
      cancelled = true;
    };
  }, [gl, renderCamera, renderScene]);

  useEffect(
    () => () => {
      trailPool.geometry.dispose();
      trailPool.material.dispose();
      fireballGeometry.dispose();
      fireballNoise.dispose();
      for (const material of fireballMaterials) material.dispose();
    },
    [fireballGeometry, fireballMaterials, fireballNoise, trailPool],
  );

  useFrame(({ camera }) => {
    const now = performance.now() / 1000;
    trailPool.material.uniforms.uTime.value = now;
    camera.getWorldPosition(cameraWorld);
    const quality = Math.min(
      performanceGovernor.getSnapshot().cpuQuality,
      performanceGovernor.getSnapshot().gpuQuality,
    );

    for (let index = 0; index < FIREBALL_CAPACITY; index += 1) {
      const mesh = fireballRefs.current[index];
      const slot = fireballSlots.current[index];
      const material = fireballMaterials[index];
      if (!mesh) continue;
      const age = now - slot.birth;
      if (slot.life <= 0 || age < 0 || age >= slot.life) {
        mesh.visible = false;
        continue;
      }
      mesh.visible = true;
      mesh.position.copy(slot.position);
      mesh.scale.setScalar(slot.diameter);
      mesh.updateMatrixWorld();
      cameraLocal.copy(cameraWorld);
      mesh.worldToLocal(cameraLocal);
      material.uniforms.uCameraLocal.value.copy(cameraLocal);
      material.uniforms.uAge.value = age;
      material.uniforms.uLife.value = slot.life;
      material.uniforms.uRocket.value = slot.rocket ? 1 : 0;
      material.uniforms.uSteps.value = [14, 22, 30][quality];
      material.uniforms.uDustColor.value.copy(slot.dustColor);
      material.uniforms.uVentDirection.value.copy(slot.ventDirection);
      material.uniforms.uVentStrength.value = slot.ventStrength;
      material.uniforms.uNoiseOffset.value.copy(slot.noiseOffset);
    }

    for (let index = 0; index < LIGHT_CAPACITY; index += 1) {
      const light = lightRefs.current[index];
      const slot = lightSlots.current[index];
      if (!light) continue;
      const age = now - slot.birth;
      if (slot.life <= 0 || age < 0 || age >= slot.life) {
        light.intensity = 0;
        continue;
      }
      const progress = age / slot.life;
      light.position.copy(slot.position);
      light.distance = slot.distance;
      light.color.setRGB(
        1,
        0.44 + 0.5 * Math.pow(1 - progress, 0.55),
        0.08 + 0.52 * Math.pow(1 - progress, 1.2),
      );
      light.intensity = slot.peak * Math.pow(1 - progress, 2.1);
    }

    let trailChanged = false;
    const active: ActiveBlast[] = [];
    for (const blast of activeBlasts.current) {
      if (blast.expiresAt <= now) continue;
      active.push(blast);
      if (now < blast.nextScanAt) continue;
      blast.nextScanAt = now + 0.085;

      const candidates: Array<{
        id: string;
        body: RapierRigidBody;
        profile: ExplosionDebrisProfile;
        score: number;
      }> = [];
      for (const [id, body] of bodies.current) {
        const profile = resolveDebrisProfile(id);
        if (!profile || dustinessByMaterial[profile.material] <= 0) continue;
        const bodyPosition = body.translation();
        const dx = bodyPosition.x - blast.center.x;
        const dy = bodyPosition.y - blast.center.y;
        const dz = bodyPosition.z - blast.center.z;
        if (dx * dx + dy * dy + dz * dz > blast.visualRadius ** 2) continue;
        const speed = body.linvel();
        const speedSq =
          speed.x * speed.x + speed.y * speed.y + speed.z * speed.z;
        if (speedSq < 8) continue;
        candidates.push({
          id,
          body,
          profile,
          score: speedSq * Math.cbrt(Math.max(0.001, profile.volume)),
        });
      }
      candidates.sort((left, right) => right.score - left.score);
      const quality = Math.min(
        performanceGovernor.getSnapshot().cpuQuality,
        performanceGovernor.getSnapshot().gpuQuality,
      );
      const trailLimit = [3, 6, MAX_TRAILED_DEBRIS_PER_BLAST][quality];
      for (const candidate of candidates.slice(0, trailLimit)) {
        const bodyPosition = candidate.body.translation();
        trailPosition.set(bodyPosition.x, bodyPosition.y, bodyPosition.z);
        const previous = blast.tracked.get(candidate.id);
        if (
          previous &&
          trailPosition.distanceToSquared(previous.position) > 0.0025
        ) {
          const speed = candidate.body.linvel();
          const dustiness = dustinessByMaterial[candidate.profile.material];
          const profileColor =
            materialRuntimeProfiles[candidate.profile.material].dustColor;
          trailColor.set(profileColor);
          writeParticle(trailPool, {
            origin: [
              (trailPosition.x + previous.position.x) * 0.5,
              (trailPosition.y + previous.position.y) * 0.5,
              (trailPosition.z + previous.position.z) * 0.5,
            ],
            velocity: [speed.x * 0.06, speed.y * 0.04 + 0.18, speed.z * 0.06],
            reach: 0.38 + Math.min(0.62, candidate.score * 0.006),
            birth: now,
            life: 0.7 + Math.min(0.7, candidate.score * 0.012),
            size:
              Math.min(
                0.42,
                Math.max(0.09, Math.cbrt(candidate.profile.volume) * 0.2),
              ) * dustiness,
            seed: random01(blast.id, trailPool.cursor, 41),
            kind: 2,
            heat: 0,
            color: [trailColor.r, trailColor.g, trailColor.b],
          });
          trailChanged = true;
          previous.position.copy(trailPosition);
          previous.lastSeenAt = now;
        } else if (!previous) {
          blast.tracked.set(candidate.id, {
            position: trailPosition.clone(),
            lastSeenAt: now,
          });
        }
      }
      for (const [id, tracked] of blast.tracked) {
        if (now - tracked.lastSeenAt > 0.3) blast.tracked.delete(id);
      }
    }
    activeBlasts.current = active;
    if (trailChanged) markPoolDirty(trailPool);
  });

  return (
    <>
      {fireballMaterials.map((material, index) => (
        <mesh
          key={`fireball-${index}`}
          ref={(mesh) => {
            fireballRefs.current[index] = mesh;
          }}
          args={[fireballGeometry, material]}
          visible={false}
          frustumCulled={false}
          renderOrder={7}
          dispose={null}
        />
      ))}
      <instancedMesh
        ref={trailMesh}
        args={[trailPool.geometry, trailPool.material, TRAIL_CAPACITY]}
        frustumCulled={false}
        renderOrder={8}
      />
      {Array.from({ length: LIGHT_CAPACITY }, (_, index) => (
        <pointLight
          key={index}
          ref={(light) => {
            lightRefs.current[index] = light;
          }}
          color="#ffad55"
          intensity={0}
          distance={0}
          decay={2}
        />
      ))}
    </>
  );
}
