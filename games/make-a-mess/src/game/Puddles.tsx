"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  ShaderMaterial,
} from "three";
import { environmentState } from "./environmentState";

/**
 * Standing water in the worn low spots — one merged mesh of irregular discs
 * with a cheap-but-honest water response: sky colour by fresnel, a real sun
 * glint from the day/night cycle, and darkness looking straight down. Edges
 * feather out through vertex alpha, so puddles sit IN the mud instead of
 * being pasted on it.
 */
export interface PuddleSpot {
  readonly x: number;
  readonly z: number;
  readonly y?: number;
  /** Mean radius in metres. */
  readonly r: number;
  readonly stretch?: number;
  readonly yaw?: number;
}

function hash(index: number, salt: number): number {
  const value = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function buildPuddles(spots: readonly PuddleSpot[]): BufferGeometry {
  const positions: number[] = [];
  const alphas: number[] = [];
  const indices: number[] = [];
  for (const [index, spot] of spots.entries()) {
    const segments = 14;
    const yaw = spot.yaw ?? hash(index, 1) * Math.PI;
    const stretch = spot.stretch ?? 0.7 + hash(index, 2) * 0.6;
    const y = (spot.y ?? 0.06) + 0.008;
    const centerIndex = positions.length / 3;
    positions.push(spot.x, y, spot.z);
    alphas.push(0.88);
    for (let segment = 0; segment <= segments; segment += 1) {
      const angle = (segment / segments) * Math.PI * 2;
      // Irregular shoreline — every puddle its own outline.
      const wobble = 1 + (hash(index * 31 + segment, 3) - 0.5) * 0.45;
      const rx = Math.cos(angle) * spot.r * wobble;
      const rz = Math.sin(angle) * spot.r * stretch * wobble;
      positions.push(
        spot.x + rx * Math.cos(yaw) - rz * Math.sin(yaw),
        y,
        spot.z + rx * Math.sin(yaw) + rz * Math.cos(yaw),
      );
      alphas.push(0);
      if (segment > 0) {
        indices.push(centerIndex, centerIndex + segment, centerIndex + segment + 1);
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("aAlpha", new Float32BufferAttribute(alphas, 1));
  geometry.setIndex(indices);
  return geometry;
}

export function Puddles({ spots }: { spots: readonly PuddleSpot[] }) {
  const { camera } = useThree();
  const geometry = useMemo(() => buildPuddles(spots), [spots]);

  const material = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uCamera: { value: camera.position.clone() },
          uSunDir: { value: environmentState.sunDirection.clone() },
          uSunColor: { value: new Color("#fff2d8") },
          uSky: { value: new Color("#9db4c8") },
          uDeep: { value: new Color("#11151a") },
          uDay: { value: 1 },
        },
        transparent: true,
        depthWrite: false,
        vertexShader: /* glsl */ `
          attribute float aAlpha;
          varying vec3 vWorld;
          varying float vAlpha;
          void main() {
            vAlpha = aAlpha;
            vWorld = position;
            gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          precision mediump float;
          uniform vec3 uCamera;
          uniform vec3 uSunDir;
          uniform vec3 uSunColor;
          uniform vec3 uSky;
          uniform vec3 uDeep;
          uniform float uTime;
          uniform float uDay;
          varying vec3 vWorld;
          varying float vAlpha;
          void main() {
            vec3 view = normalize(uCamera - vWorld);
            // Tiny ripple perturbs the mirror just enough to feel liquid.
            float ripple = sin(vWorld.x * 9.0 + uTime * 1.1) * sin(vWorld.z * 8.0 - uTime * 0.9);
            vec3 normal = normalize(vec3(ripple * 0.025, 1.0, ripple * 0.02));
            float fresnel = 0.06 + 0.94 * pow(1.0 - max(dot(view, normal), 0.0), 3.5);
            vec3 color = mix(uDeep, uSky * (0.55 + uDay * 0.5), clamp(fresnel * 1.5, 0.0, 1.0));
            // Sun glint along the reflected ray.
            vec3 reflected = reflect(-view, normal);
            float glint = pow(max(dot(reflected, uSunDir), 0.0), 90.0);
            color += uSunColor * glint * 1.4 * uDay;
            gl_FragColor = vec4(color, vAlpha);
          }
        `,
      }),
    [camera],
  );

  useFrame((state) => {
    material.uniforms.uTime.value = state.clock.elapsedTime;
    material.uniforms.uCamera.value.copy(camera.position);
    material.uniforms.uSunDir.value.copy(environmentState.sunDirection);
    material.uniforms.uSunColor.value.copy(environmentState.sunColor);
    material.uniforms.uDay.value = environmentState.dayFactor;
  });

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  return (
    <mesh
      geometry={geometry}
      material={material}
      frustumCulled={false}
      renderOrder={2}
      castShadow={false}
      receiveShadow={false}
    />
  );
}
