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
  BufferAttribute,
  BufferGeometry,
  Color,
  Data3DTexture,
  FrontSide,
  GLSL3,
  InstancedMesh,
  Mesh,
  NormalBlending,
  PointLight,
  ShaderMaterial,
  Vector3,
  Vector4,
} from "three";
import { createBillowSmokePool, createFxNoiseTexture } from "./billowSmoke";
import {
  materialRuntimeProfiles,
  type BreakableMaterial,
} from "./destructionScene";
import {
  clearPool,
  createBillboardPool,
  createPoolWithGeometry,
  markPoolDirty,
  writeParticle,
  type ParticlePool,
} from "./fxParticlePool";
import { environmentState } from "./environmentState";
import {
  EXPLOSION_FIRE_RAMP,
  EXPLOSION_LIGHT,
  EXPLOSION_POOL_CAPACITY,
  EXPOSURE_KICK_TAU,
  FIREBALL_BOX_SCALE,
  FIREBALL_CARVE_AMPLITUDE,
  FIREBALL_CORE_RADIUS,
  LOBE_STRETCH_RANGE,
  MAX_FIREBALL_LOBES,
  planExplosionSecondaries,
  planFireball,
  random01,
  type ExplosionFxInput,
  type ExplosionFxLobeInput,
  type FireballPlan,
  type PlannedParticle,
} from "./explosionFxModel";
import { performanceGovernor } from "./performanceGovernor";

const TRAIL_CAPACITY = EXPLOSION_POOL_CAPACITY.trail;
const SMOKE_CAPACITY = EXPLOSION_POOL_CAPACITY.smoke;
const RIBBON_CAPACITY = EXPLOSION_POOL_CAPACITY.ribbon;
const RIBBON_SEGMENTS = 12;
const FIREBALL_CAPACITY = 2;
const MAX_ACTIVE_BLASTS = 4;
const MAX_TRAILED_DEBRIS_PER_BLAST = 10;
const LIGHT_CAPACITY = 2;

export type ExplosionFxDefinition = ExplosionFxInput;
export type ExplosionFxLobe = ExplosionFxLobeInput;

export interface ExplosionDebrisProfile {
  readonly material: BreakableMaterial;
  readonly volume: number;
}

export interface ExplosionFxRuntime {
  spawn: (definition: ExplosionFxDefinition) => void;
  clear: () => void;
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
  readonly noiseOffset: Vector3;
  readonly lobeDirectionWeights: Vector4[];
  readonly lobeTimingShapes: Vector4[];
  birth: number;
  life: number;
  diameter: number;
  lobeCount: number;
  rocket: boolean;
}

interface LightSlot {
  readonly position: Vector3;
  birth: number;
  life: number;
  peak: number;
  distance: number;
  emberLife: number;
  emberFraction: number;
  exposureKick: number;
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
      uLobeCount: { value: 0 },
      uLobeDirectionWeight: {
        value: Array.from(
          { length: MAX_FIREBALL_LOBES },
          () => new Vector4(),
        ),
      },
      uLobeTimingShape: {
        value: Array.from(
          { length: MAX_FIREBALL_LOBES },
          () => new Vector4(),
        ),
      },
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
      uniform int uLobeCount;
      uniform vec4 uLobeDirectionWeight[${MAX_FIREBALL_LOBES}];
      uniform vec4 uLobeTimingShape[${MAX_FIREBALL_LOBES}];
      uniform vec3 uNoiseOffset;

      in vec3 vLocalPosition;
      out vec4 fragColor;

      const int MAX_STEPS = 32;
      const int MAX_LOBES = ${MAX_FIREBALL_LOBES};

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

      // HDR ramp: whiteHot must cross the bloom threshold by a wide margin —
      // the blown-out core with a halo is what separates fire from orange fog.
      vec3 fireColor(float temperature) {
        vec3 ember = vec3(${EXPLOSION_FIRE_RAMP.ember.join(", ")});
        vec3 orange = vec3(${EXPLOSION_FIRE_RAMP.orange.join(", ")});
        vec3 yellow = vec3(${EXPLOSION_FIRE_RAMP.yellow.join(", ")});
        vec3 whiteHot = vec3(${EXPLOSION_FIRE_RAMP.whiteHot.join(", ")});
        vec3 color = mix(ember, orange, smoothstep(0.06, 0.32, temperature));
        color = mix(color, yellow, smoothstep(0.3, 0.66, temperature));
        return mix(color, whiteHot, smoothstep(0.62, 0.98, temperature));
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
        float coreExpansion = 1.0 - exp(-uAge * mix(26.0, 19.0, uRocket));
        float coreCooling = smoothstep(0.1, mix(0.62, 0.82, uRocket), uAge);
        float coreRadius = mix(0.03, ${FIREBALL_CORE_RADIUS}, coreExpansion)
          * mix(1.0, 0.72, coreCooling);
        // The hot volume buoys visibly out of the dust it made (references
        // show the fire riding above the cold cloud by mid-life).
        float globalLift = smoothstep(0.2, uLife, uAge) * 0.11;

        float segment = (rayEnd - rayStart) / max(1.0, uSteps);
        float cursor = rayStart + segment * pixelNoise(gl_FragCoord.xy + uNoiseOffset.xy * 97.0);
        vec3 accumulated = vec3(0.0);
        float opacity = 0.0;
        float flameCoverage = 0.0;

        for (int index = 0; index < MAX_STEPS; index += 1) {
          if (float(index) >= uSteps || cursor > rayEnd || opacity > 0.992) break;

          vec3 point = rayOrigin + rayDirection * cursor;
          vec3 centered = point - vec3(0.0, globalLift, 0.0);

          float noiseScale = mix(
            1.42,
            0.82,
            smoothstep(0.0, mix(0.72, 1.0, uRocket), uAge)
          );
          vec3 noiseCoordinate = centered * noiseScale
            + uNoiseOffset
            - vec3(0.0, uAge * 0.14, 0.0);
          float broadNoise = texture(uNoise, noiseCoordinate).r;
          float detailNoise = texture(
            uNoise,
            noiseCoordinate * 1.9 + uNoiseOffset.yzx * 0.63
          ).r;
          // Radial carving: boundaries move by a fraction of their own
          // radius, giving deep macroscopic folds instead of an eroded fuzz
          // (the ±3%-of-box erosion this replaces read as a dithered pompom).
          float carve = (broadNoise - 0.5)
              * ${(FIREBALL_CARVE_AMPLITUDE * 1.44).toFixed(2)}
            + (detailNoise - 0.5)
              * ${(FIREBALL_CARVE_AMPLITUDE * 0.56).toFixed(2)};
          // Hot pockets survive mid-life while their surroundings sootify:
          // real fireballs are never one uniform temperature.
          float kernelNoise = texture(
            uNoise,
            noiseCoordinate * 2.7 + uNoiseOffset.zxy * 1.31
          ).r;
          float hotKernel = smoothstep(0.56, 0.85, kernelNoise);

          float coreBoundary = coreRadius * (1.0 + carve);
          float coreLength = length(centered);
          float coreDensity = 1.0
            - smoothstep(-0.04, 0.026, coreLength - coreBoundary);
          coreDensity *= ignition * mix(1.0, 0.5, coreCooling);
          float coreShell = clamp(
            coreLength / max(0.001, coreBoundary),
            0.0,
            1.0
          );
          float coreInterior = 1.0 - coreShell;

          float density = coreDensity;
          // Cooling is outside-in: the shell chars while the heart stays lit.
          float ageCool = exp(-uAge * mix(2.1, 1.7, uRocket));
          float shellCool = mix(1.0, 0.34, smoothstep(0.45, 1.02, coreShell));
          float temperature = coreDensity * ageCool * shellCool
            * mix(0.55, 1.35, hotKernel)
            * (0.75 + coreInterior * 0.65);
          float smokeSignal = coreDensity
            * smoothstep(0.07, mix(0.34, 0.5, uRocket), uAge);

          for (int lobeIndex = 0; lobeIndex < MAX_LOBES; lobeIndex += 1) {
            if (lobeIndex >= uLobeCount) break;
            vec4 directionWeight = uLobeDirectionWeight[lobeIndex];
            vec4 timingShape = uLobeTimingShape[lobeIndex];
            float localAge = uAge - timingShape.x;
            if (localAge <= 0.0 || directionWeight.w <= 0.0) continue;

            vec3 lobeDirection = directionWeight.xyz;
            float lobeWeight = directionWeight.w;
            float lobeExpansion = 1.0 - exp(
              -localAge * mix(17.0, 12.5, uRocket)
            );
            float travel = timingShape.y * lobeExpansion
              + localAge * mix(0.03, 0.045, uRocket);
            vec3 lobeCenter = lobeDirection * travel;
            lobeCenter.y += localAge * localAge * 0.018;

            vec3 relative = centered - lobeCenter;
            float axial = dot(relative, lobeDirection);
            vec3 perpendicular = relative - lobeDirection * axial;
            // Jets: shape drives elongation along the vent axis. Combined
            // with travel ≈ 2 radii this is what breaks the sphere.
            float stretch = mix(
              ${LOBE_STRETCH_RANGE[0]},
              ${LOBE_STRETCH_RANGE[1]},
              timingShape.w
            );
            float lobeDistance = sqrt(
              dot(perpendicular, perpendicular)
              + axial * axial / (stretch * stretch)
            );
            float lobeRadius = timingShape.z
              * mix(0.16, 1.0, lobeExpansion)
              * mix(0.86, 1.08, lobeWeight);
            lobeRadius *= mix(
              1.0,
              0.7,
              smoothstep(
                mix(0.34, 0.5, uRocket),
                mix(0.76, 1.08, uRocket),
                uAge
              )
            );
            float lobeBoundary = lobeRadius
              * (1.0 + carve * mix(0.85, 1.3, timingShape.w));
            float lobeDensity = 1.0
              - smoothstep(-0.045, 0.028, lobeDistance - lobeBoundary);
            lobeDensity *= ignition;

            // A probabilistic union keeps the dense centre connected but
            // preserves genuine voids between independently moving lobes.
            density = 1.0 - (1.0 - density) * (1.0 - lobeDensity);
            float lobeShell = clamp(
              lobeDistance / max(0.001, lobeBoundary),
              0.0,
              1.0
            );
            float lobeHeat = exp(
              -localAge * mix(3.4, 2.6, uRocket)
            ) * mix(0.62, 1.12, timingShape.w)
              * mix(1.0, 0.42, smoothstep(0.5, 1.0, lobeShell))
              * mix(0.6, 1.3, hotKernel);
            temperature = max(
              temperature,
              lobeDensity * lobeHeat
                * (0.12 + pow(1.0 - lobeShell, 0.58) * 0.95)
            );
            smokeSignal = max(
              smokeSignal,
              lobeDensity * smoothstep(
                0.07 + timingShape.w * 0.05,
                mix(0.32, 0.5, uRocket),
                localAge
              )
            );
          }

          // The hot volume is only the pressure/combustion phase. It must not
          // survive as one slowly rising smoke object; cooling packets are
          // emitted into the separate spherical-particle cloud below.
          float volumeFade = 1.0 - smoothstep(
            mix(0.52, 0.72, uRocket),
            mix(0.88, 1.2, uRocket),
            uAge
          );
          density *= volumeFade;
          smokeSignal *= volumeFade;

          if (density > 0.001) {
            float thermalBreakup = mix(
              0.58,
              1.16,
              smoothstep(0.22, 0.78, broadNoise)
            );
            temperature = clamp(temperature * thermalBreakup, 0.0, 1.2);
            // Marbled crust: thin bright filaments between darker cooling
            // cells — the magma-crack texture of a real fireball surface.
            float ridge = 1.0 - abs(detailNoise * 2.0 - 1.0);
            float crack = smoothstep(0.82, 0.985, ridge);
            temperature = min(1.2, temperature * (1.0 + crack * 0.7));
            float soot = clamp(smokeSignal, 0.0, 1.0)
              * (0.45 + 0.55 * (1.0 - temperature));
            // Hot gas emits strongly but absorbs little. The previous fixed
            // extinction made the nearest lobe opaque, hiding the white core
            // and flattening every cluster into a camera-facing patch.
            float extinction = density * mix(2.4, 19.0, soot);
            float sampleAlpha = 1.0 - exp(-extinction * segment);
            float hotCoverage = smoothstep(0.1, 0.48, temperature);
            float sampleFlameCoverage = 1.0 - exp(
              -density * hotCoverage * 15.0 * segment
            );
            flameCoverage += (1.0 - flameCoverage) * sampleFlameCoverage;

            // Combustion soot is near-black; the pale masonry dust belongs
            // to the separate particle cloud. Only the dissolving tail of
            // the volume takes the material dust tint.
            float dustPhase = smoothstep(0.5, 0.96, uAge / uLife);
            vec3 sootBody = vec3(0.032, 0.030, 0.028)
              * (0.7 + 0.6 * broadNoise);
            vec3 dustBody = uDustColor * mix(0.3, 0.62, broadNoise);
            vec3 smokeColor = mix(sootBody, dustBody, dustPhase * 0.8);
            float emissionMask = temperature
              * mix(1.0, 0.36, smoothstep(0.62, 1.0, density) * soot);
            // The first frames overexpose: real cameras never resolve the
            // detonation flash as a politely lit orange volume.
            emissionMask *= 1.0 + 1.6 * exp(-uAge * 7.0);
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

        float outputAlpha = max(
          opacity,
          smoothstep(0.025, 0.34, flameCoverage)
        );
        if (outputAlpha < 0.004) discard;
        fragColor = vec4(
          accumulated / max(0.001, opacity),
          outputAlpha
        );
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
        vec2 viewVelocity = (viewMatrix * vec4(aVelocity, 0.0)).xy;
        vec2 streakDirection = length(viewVelocity) > 0.001
          ? normalize(viewVelocity)
          : vec2(1.0, 0.0);
        vec3 streakAxis = camRight * streakDirection.x
          + camUp * streakDirection.y;
        vec3 streakAcross = camRight * -streakDirection.y
          + camUp * streakDirection.x;
        // Hot sparks stretch into long radial streaks; cold fragments stay
        // compact. Streak length follows launch speed and heat.
        float streakMax = 4.3 + aHeat * 5.5;
        float streakGain = 0.24 * (1.0 + aHeat * 1.2);
        float streak = aKind > 0.5 && aKind < 1.5
          ? 1.7 + min(streakMax, length(aVelocity) * streakGain) * (1.0 - life)
          : 1.14;
        vec3 world = center
          + streakAxis * position.x * size * streak
          + streakAcross * position.y * size;
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
        // Sparks glow for most of their flight, not the first frames only.
        float heatEnd = 0.13 + vSeed * 0.17 + vHeat * 0.42;
        float heat = vHeat * (1.0 - smoothstep(0.012, heatEnd, vLife));
        alpha *= billow * appear * fade * density * mix(1.0, 1.38, heat);
        if (alpha < 0.003) discard;
        float softLight = 0.82 + (p.y * 0.5 + 0.5) * 0.18;
        vec3 aged = mix(vColor * 0.72, vColor * 1.12, vLife);
        vec3 hot = mix(
          vec3(1.25, 0.2, 0.018),
          vec3(7.0, 3.1, 0.55),
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
    noiseOffset: new Vector3(),
    lobeDirectionWeights: Array.from(
      { length: MAX_FIREBALL_LOBES },
      () => new Vector4(),
    ),
    lobeTimingShapes: Array.from(
      { length: MAX_FIREBALL_LOBES },
      () => new Vector4(),
    ),
    birth: Number.NEGATIVE_INFINITY,
    life: 0,
    diameter: 1,
    lobeCount: 0,
    rocket: false,
  };
}

function configureFireballSlot(slot: FireballSlot, plan: FireballPlan): void {
  slot.lobeCount = Math.min(plan.lobes.length, MAX_FIREBALL_LOBES);
  for (let index = 0; index < MAX_FIREBALL_LOBES; index += 1) {
    const directionWeight = slot.lobeDirectionWeights[index];
    const timingShape = slot.lobeTimingShapes[index];
    const lobe = plan.lobes[index];
    if (!lobe) {
      directionWeight.set(0, 1, 0, 0);
      timingShape.set(0, 0, 0, 0);
      continue;
    }
    directionWeight.set(
      lobe.direction[0],
      lobe.direction[1],
      lobe.direction[2],
      lobe.visibleWeight,
    );
    timingShape.set(lobe.delay, lobe.travel, lobe.radius, lobe.shape);
  }
}

/**
 * A camera-facing strip: position.x ∈ [0..1] is the along-trail parameter
 * (0 = burning head, 1 = oldest point), position.y = ±0.5 across.
 */
function createRibbonGeometry(segments: number): BufferGeometry {
  const geometry = new BufferGeometry();
  const positions = new Float32Array((segments + 1) * 2 * 3);
  const indices: number[] = [];
  for (let index = 0; index <= segments; index += 1) {
    const along = index / segments;
    positions.set([along, -0.5, 0], index * 2 * 3);
    positions.set([along, 0.5, 0], (index * 2 + 1) * 3);
    if (index < segments) {
      const corner = index * 2;
      indices.push(corner, corner + 1, corner + 2);
      indices.push(corner + 1, corner + 3, corner + 2);
    }
  }
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  return geometry;
}

/**
 * Ballistic ribbon trails: each instance renders the recent arc of one
 * burning fragment (hot head, incandescent tail) or one cooled faller (grey
 * smoke thread). The whole path is reconstructed analytically per vertex —
 * drag decay plus gravity droop — so trails curve like the references and
 * cost nothing on the CPU.
 */
function createRibbonMaterial(): ShaderMaterial {
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
      attribute vec4 aClamp;
      varying float vAlong;
      varying float vLife;
      varying float vHeat;
      varying float vSeed;
      varying vec3 vColor;

      vec3 pathPoint(float tau, float drag, float grav) {
        float travel = (1.0 - exp(-drag * tau)) / drag;
        vec3 point = aOrigin + aVelocity * travel;
        point.y -= grav * tau * tau * 0.5;
        // A falling arc lands ON the birth surface and its thread lies
        // along it, instead of the trail sinking into ground or facade.
        if (dot(aClamp.xyz, aClamp.xyz) > 0.5) {
          float depth = dot(point, aClamp.xyz) - aClamp.w;
          if (depth < 0.03) point += aClamp.xyz * (0.03 - depth);
        }
        return point;
      }

      void main() {
        float age = uTime - aTiming.x;
        float duration = aTiming.y;
        if (duration <= 0.0 || age < 0.0 || age >= duration) {
          gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
          vLife = 1.0;
          return;
        }
        float life = clamp(age / duration, 0.0, 1.0);
        float along = position.x;
        float window = aStyle.w;
        float tau = max(0.0, age - along * window);
        // Light burning sparks brake hard and barely droop; heavy cooled
        // fallers keep little drag and drop out of the cloud.
        float drag = mix(0.85, 1.7, aStyle.z);
        float grav = mix(8.5, 3.8, aStyle.z);
        vec3 head = pathPoint(tau, drag, grav);
        vec3 lookAhead = pathPoint(tau + 0.03, drag, grav) - head;
        float aheadLength = length(lookAhead);
        vec3 tangent = aheadLength > 0.0001
          ? lookAhead / aheadLength
          : vec3(0.0, -1.0, 0.0);
        vec3 view = normalize(head - cameraPosition);
        vec3 acrossRaw = cross(tangent, view);
        float acrossLength = length(acrossRaw);
        vec3 across = acrossLength > 0.001
          ? acrossRaw / acrossLength
          : normalize(cross(tangent, vec3(0.0, 1.0, 0.0)) + vec3(0.001));
        float width = aTiming.w
          * (1.0 - along * 0.72)
          * (0.6 + 0.4 * (1.0 - life));
        vec3 world = head + across * position.y * width;
        vAlong = along;
        vLife = life;
        vHeat = aStyle.z;
        vSeed = aStyle.x;
        vColor = aColor;
        gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision mediump float;
      varying float vAlong;
      varying float vLife;
      varying float vHeat;
      varying float vSeed;
      varying vec3 vColor;

      void main() {
        float taper = 1.0 - vAlong;
        float appear = smoothstep(0.0, 0.05, vLife);
        float fade = 1.0 - smoothstep(0.55, 1.0, vLife);
        float flicker = 0.8 + 0.2 * sin(vSeed * 40.0 + vAlong * 26.0);
        float alpha = pow(taper, 1.35) * appear * fade
          * mix(0.3, 0.85, vHeat) * flicker;
        if (alpha < 0.004) discard;
        // The head stays incandescent, the tail cools through the ramp; a
        // dead-cold ribbon is just a grey smoke thread.
        float glow = vHeat * (1.0 - vAlong * 0.85) * (1.0 - 0.75 * vLife);
        vec3 hot = mix(
          vec3(1.3, 0.32, 0.045),
          vec3(9.5, 4.4, 1.15),
          smoothstep(0.15, 0.85, glow)
        );
        vec3 color = mix(vColor, hot, smoothstep(0.05, 0.4, glow));
        gl_FragColor = vec4(color, alpha);
      }
    `,
  });
}

function writePlannedParticles(
  pool: ParticlePool,
  planned: readonly PlannedParticle[],
  now: number,
): void {
  for (const particle of planned) {
    writeParticle(pool, {
      origin: particle.origin,
      velocity: particle.velocity,
      reach: particle.reach,
      birth: now + particle.birthOffset,
      life: particle.life,
      size: particle.size,
      seed: particle.seed,
      kind: particle.kind,
      heat: particle.heat,
      density: particle.density,
      clampPlane: particle.clampPlane,
      color: particle.color,
    });
  }
  markPoolDirty(pool);
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
  const smokeMesh = useRef<InstancedMesh>(null);
  const fireballRefs = useRef<Array<Mesh | null>>(
    Array.from({ length: FIREBALL_CAPACITY }, () => null),
  );
  const lightRefs = useRef<Array<PointLight | null>>(
    Array.from({ length: LIGHT_CAPACITY }, () => null),
  );
  const trailPool = useMemo(
    () => createBillboardPool(TRAIL_CAPACITY, createTrailMaterial()),
    [],
  );
  const ribbonPool = useMemo(
    () =>
      createPoolWithGeometry(
        RIBBON_CAPACITY,
        createRibbonMaterial(),
        createRibbonGeometry(RIBBON_SEGMENTS),
      ),
    [],
  );
  const fireballNoise = useMemo(() => createFxNoiseTexture(), []);
  // The smoke shares the fireball's noise volume: one world-anchored field
  // both carves the flame and folds the aftermath cloud.
  const smokePool = useMemo(
    () => createBillowSmokePool(SMOKE_CAPACITY, fireballNoise),
    [fireballNoise],
  );
  const fireballGeometry = useMemo(() => new BoxGeometry(1, 1, 1), []);
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
      emberLife: 0,
      emberFraction: 0,
      exposureKick: 0,
    })),
  );
  const exposureBase = useRef<number | null>(null);
  const lastExposureKick = useRef(1);
  const trailPosition = useMemo(() => new Vector3(), []);
  const trailColor = useMemo(() => new Color(), []);
  const cameraWorld = useMemo(() => new Vector3(), []);
  const cameraLocal = useMemo(() => new Vector3(), []);

  const clear = useCallback(() => {
    clearPool(trailPool);
    clearPool(smokePool);
    clearPool(ribbonPool);
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
  }, [ribbonPool, smokePool, trailPool]);

  const spawn = useCallback((definition: ExplosionFxDefinition) => {
    const now = performance.now() / 1000;
    const snapshot = performanceGovernor.getSnapshot();
    const quality = Math.min(snapshot.cpuQuality, snapshot.gpuQuality);
    const rocket = definition.kind === "rocket";
    const seed = definition.id * 0.61803398875;
    const plan = planFireball(definition, seed);

    const fireballIndex = fireballCursor.current;
    fireballCursor.current = (fireballCursor.current + 1) % FIREBALL_CAPACITY;
    const fireball = fireballSlots.current[fireballIndex];
    fireball.position.set(...definition.position);
    fireball.dustColor.setRGB(...definition.dustColor);
    fireball.birth = now;
    fireball.life = plan.life;
    fireball.diameter = plan.diameter;
    fireball.rocket = plan.rocket;
    fireball.noiseOffset.set(
      random01(seed, 0, 13) * 9,
      random01(seed, 1, 17) * 9,
      random01(seed, 2, 19) * 9,
    );
    configureFireballSlot(fireball, plan);
    const secondaries = planExplosionSecondaries(
      definition,
      plan,
      quality,
      seed,
    );
    writePlannedParticles(smokePool, secondaries.smoke, now);
    // kind 3 are ballistic ribbons (sparks and smoke-thread fallers); the
    // flat-billboard pool keeps the puffs, fragments and jets.
    writePlannedParticles(
      trailPool,
      secondaries.trail.filter((particle) => particle.kind !== 3),
      now,
    );
    writePlannedParticles(
      ribbonPool,
      secondaries.trail.filter((particle) => particle.kind === 3),
      now,
    );
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

    const lightPlan = EXPLOSION_LIGHT[definition.kind];
    const slotIndex = lightCursor.current;
    lightCursor.current = (lightCursor.current + 1) % LIGHT_CAPACITY;
    const slot = lightSlots.current[slotIndex];
    slot.position.set(...definition.position);
    slot.birth = now;
    slot.life = lightPlan.life;
    slot.peak = lightPlan.peak * [0.72, 0.88, 1][quality];
    slot.distance = lightPlan.distance;
    slot.emberLife = lightPlan.emberLife;
    slot.emberFraction = lightPlan.emberFraction;
    slot.exposureKick = lightPlan.exposureKick;
  }, [ribbonPool, smokePool, trailPool]);

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
      smokePool.geometry.dispose();
      smokePool.material.dispose();
      ribbonPool.geometry.dispose();
      ribbonPool.material.dispose();
      fireballGeometry.dispose();
      fireballNoise.dispose();
      for (const material of fireballMaterials) material.dispose();
      if (exposureBase.current !== null) {
        gl.toneMappingExposure = exposureBase.current;
      }
    },
    [
      fireballGeometry,
      fireballMaterials,
      fireballNoise,
      gl,
      ribbonPool,
      smokePool,
      trailPool,
    ],
  );

  useFrame(({ camera }) => {
    const now = performance.now() / 1000;
    trailPool.material.uniforms.uTime.value = now;
    smokePool.material.uniforms.uTime.value = now;
    ribbonPool.material.uniforms.uTime.value = now;
    smokePool.material.uniforms.uLightWorld.value.copy(
      environmentState.sunDirection,
    );
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
      // The raymarch box is wider than the fireball so jets have head-room.
      mesh.scale.setScalar(slot.diameter * FIREBALL_BOX_SCALE);
      mesh.updateMatrixWorld();
      cameraLocal.copy(cameraWorld);
      mesh.worldToLocal(cameraLocal);
      material.uniforms.uCameraLocal.value.copy(cameraLocal);
      material.uniforms.uAge.value = age;
      material.uniforms.uLife.value = slot.life;
      material.uniforms.uRocket.value = slot.rocket ? 1 : 0;
      material.uniforms.uSteps.value = [14, 20, 28][quality];
      material.uniforms.uDustColor.value.copy(slot.dustColor);
      const qualityLobeCount = [4, 6, MAX_FIREBALL_LOBES][quality];
      material.uniforms.uLobeCount.value = Math.min(
        slot.lobeCount,
        qualityLobeCount,
      );
      const uniformDirectionWeights = material.uniforms.uLobeDirectionWeight
        .value as Vector4[];
      const uniformTimingShapes = material.uniforms.uLobeTimingShape
        .value as Vector4[];
      for (let lobeIndex = 0; lobeIndex < slot.lobeCount; lobeIndex += 1) {
        uniformDirectionWeights[lobeIndex].copy(
          slot.lobeDirectionWeights[lobeIndex],
        );
        uniformTimingShapes[lobeIndex].copy(slot.lobeTimingShapes[lobeIndex]);
      }
      material.uniforms.uNoiseOffset.value.copy(slot.noiseOffset);
    }

    for (let index = 0; index < LIGHT_CAPACITY; index += 1) {
      const light = lightRefs.current[index];
      const slot = lightSlots.current[index];
      if (!light) continue;
      const age = now - slot.birth;
      if (slot.life <= 0 || age < 0 || age >= slot.life + slot.emberLife) {
        light.intensity = 0;
        continue;
      }
      light.position.copy(slot.position);
      light.distance = slot.distance;
      if (age < slot.life) {
        const progress = age / slot.life;
        light.color.setRGB(
          1,
          0.44 + 0.5 * Math.pow(1 - progress, 0.55),
          0.08 + 0.52 * Math.pow(1 - progress, 1.2),
        );
        light.intensity = slot.peak * Math.pow(1 - progress, 2.1);
      } else {
        // Ember afterglow: the dust stays lit from within for over a second
        // after the flash, flickering as the embers cool — without it the
        // cloud goes dead-dark long before it disperses.
        const emberProgress = (age - slot.life) / slot.emberLife;
        const flicker = 0.8 + 0.2 * Math.sin(age * 34 + slot.birth * 13);
        light.color.setRGB(1, 0.34 - emberProgress * 0.08, 0.05);
        light.intensity =
          slot.peak *
          slot.emberFraction *
          Math.pow(1 - emberProgress, 1.6) *
          flicker;
      }
    }

    // Camera flash: a brief exposure spike sells the detonation to the whole
    // frame even where the point light cannot reach. The base exposure is
    // captured lazily so the game's own setting stays authoritative, and
    // writes stop once the kick has fully decayed.
    let kick = 0;
    for (const slot of lightSlots.current) {
      const age = now - slot.birth;
      if (slot.life <= 0 || age < 0 || age > 0.5) continue;
      kick += slot.exposureKick * Math.exp(-age / EXPOSURE_KICK_TAU);
    }
    const kickFactor = 1 + Math.min(0.8, kick);
    if (kickFactor > 1.002 || lastExposureKick.current > 1.002) {
      if (exposureBase.current === null) {
        exposureBase.current = gl.toneMappingExposure;
      }
      gl.toneMappingExposure = exposureBase.current * kickFactor;
      lastExposureKick.current = kickFactor;
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
        renderOrder={5}
      />
      <instancedMesh
        ref={smokeMesh}
        args={[smokePool.geometry, smokePool.material, SMOKE_CAPACITY]}
        frustumCulled={false}
        renderOrder={6}
      />
      <instancedMesh
        args={[ribbonPool.geometry, ribbonPool.material, RIBBON_CAPACITY]}
        frustumCulled={false}
        renderOrder={6}
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
