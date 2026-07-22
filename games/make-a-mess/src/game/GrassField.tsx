"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import {
  BufferGeometry,
  Color,
  DoubleSide,
  Euler,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Quaternion,
  ShaderMaterial,
  Vector3,
} from "three";

/**
 * A field of instanced grass tufts scattered across a circular landscape.
 *
 * Every tuft is two crossed, tapered quads, so it reads as 3D from any angle
 * without being a camera-facing billboard. The whole field is ONE draw call:
 * position, yaw and scale live in the instance matrix, and a per-instance
 * phase varies the wind. The vertex shader bends the blade tips with a cheap
 * sine, and tufts shrink smoothly into the ground past a fade distance — so
 * distant grass costs nothing and there is no popping. Cutout alpha (no
 * blending) keeps it depth-correct and sort-free.
 */
function makeTuftGeometry(): BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const baseWidth = 0.13;
  const tipWidth = 0.02;
  let vertex = 0;
  // Several thin blades fanned around the tuft centre give it body while each
  // stays as narrow as a real grass blade.
  for (const [bladeIndex, yaw] of [0, 0.7, 1.5, 2.3, 2.9].entries()) {
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const lean = (bladeIndex - 2) * 0.07;
    const bl: [number, number, number] = [-baseWidth * cos, 0, -baseWidth * sin];
    const br: [number, number, number] = [baseWidth * cos, 0, baseWidth * sin];
    const tr: [number, number, number] = [tipWidth * cos + lean, 1, tipWidth * sin + lean];
    const tl: [number, number, number] = [-tipWidth * cos + lean, 1, -tipWidth * sin + lean];
    positions.push(...bl, ...br, ...tr, ...tl);
    uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
    indices.push(vertex, vertex + 1, vertex + 2, vertex, vertex + 2, vertex + 3);
    vertex += 4;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

// Deterministic hash scatter — no Math.random, so the field is identical every
// load (and safe for any replay/resume of the session).
function hash(index: number, salt: number): number {
  const value = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

export function GrassField({
  worldRadius,
  center,
  nightRef,
  count = 12000,
  bladeColor = "#4f6a39",
  tipColor = "#8aa356",
}: {
  worldRadius: number;
  center: readonly [number, number];
  nightRef: RefObject<number>;
  count?: number;
  bladeColor?: string;
  tipColor?: string;
}) {
  const meshRef = useRef<InstancedMesh>(null);
  const { camera } = useThree();

  const geometry = useMemo(() => makeTuftGeometry(), []);

  const material = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uCamera: { value: new Vector3() },
          uLight: { value: 1 },
          uFadeStart: { value: 18 },
          uFadeEnd: { value: 42 },
          uBase: { value: new Color(bladeColor) },
          uTip: { value: new Color(tipColor) },
        },
        side: DoubleSide,
        transparent: false,
        alphaTest: 0.5,
        vertexShader: /* glsl */ `
          uniform float uTime;
          uniform vec3 uCamera;
          uniform float uFadeStart;
          uniform float uFadeEnd;
          attribute float aPhase;
          varying vec2 vUv;
          varying float vShade;
          void main() {
            vUv = uv;
            vec4 world = instanceMatrix * vec4(position, 1.0);
            // Distance fade: tufts shrink into the ground as they recede, so
            // far grass vanishes smoothly with zero overdraw and no pop.
            float dist = distance(world.xyz, uCamera);
            float fade = 1.0 - smoothstep(uFadeStart, uFadeEnd, dist);
            // Wind: only the tip (uv.y) sways; phase varies per tuft.
            float sway = sin(uTime * 1.6 + aPhase + world.x * 0.25 + world.z * 0.2);
            float gust = sin(uTime * 0.6 + world.x * 0.05) * 0.5 + 0.5;
            float bend = uv.y * uv.y * (0.12 + gust * 0.16) * sway;
            vec3 local = position;
            local.y *= fade;
            vec4 shifted = instanceMatrix * vec4(local, 1.0);
            shifted.x += bend;
            shifted.z += bend * 0.6;
            vShade = 0.55 + uv.y * 0.45;
            gl_Position = projectionMatrix * viewMatrix * shifted;
          }
        `,
        fragmentShader: /* glsl */ `
          precision mediump float;
          uniform vec3 uBase;
          uniform vec3 uTip;
          uniform float uLight;
          varying vec2 vUv;
          varying float vShade;
          void main() {
            // Pointed-blade cutout: discard outside a triangle tapering to the
            // tip. No blending — depth-correct and sort-free.
            float halfWidth = (1.0 - vUv.y) * 0.5;
            if (abs(vUv.x - 0.5) > halfWidth) discard;
            vec3 color = mix(uBase, uTip, vUv.y) * vShade * uLight;
            gl_FragColor = vec4(color, 1.0);
          }
        `,
      }),
    [bladeColor, tipColor],
  );

  // Scatter the instances once. Tufts avoid the rim and thin out on the
  // travelled paths implicitly (kept short so any clipping reads as trodden
  // grass rather than error).
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) {
      return;
    }
    const matrix = new Matrix4();
    const position = new Vector3();
    const quaternion = new Quaternion();
    const scale = new Vector3();
    const euler = new Euler();
    const phases = new Float32Array(count);
    const usableRadius = Math.max(4, worldRadius - 4);
    let placed = 0;
    for (let index = 0; index < count; index += 1) {
      const radius = Math.sqrt(hash(index, 1)) * usableRadius;
      const angle = hash(index, 2) * Math.PI * 2;
      const x = center[0] + Math.cos(angle) * radius;
      const z = center[1] + Math.sin(angle) * radius;
      const height = 0.42 + hash(index, 3) * 0.5;
      const width = 0.8 + hash(index, 4) * 0.6;
      euler.set(0, hash(index, 5) * Math.PI * 2, 0);
      quaternion.setFromEuler(euler);
      position.set(x, 0, z);
      scale.set(width, height, width);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(placed, matrix);
      phases[placed] = hash(index, 6) * Math.PI * 2;
      placed += 1;
    }
    mesh.count = placed;
    mesh.instanceMatrix.needsUpdate = true;
    geometry.setAttribute("aPhase", new InstancedBufferAttribute(phases, 1));
    // The bounding sphere spans the whole field (instances are not individually
    // culled), so it never wrongly disappears at the screen edge.
    mesh.frustumCulled = false;
  }, [count, worldRadius, center, geometry]);

  useFrame((state) => {
    const uniforms = material.uniforms;
    uniforms.uTime.value = state.clock.elapsedTime;
    uniforms.uCamera.value.copy(camera.position);
    const night = nightRef.current ?? 0;
    // Grass is unlit, so it must be dimmed hard at night to sit in the dark
    // ground rather than glow against it.
    uniforms.uLight.value = 1 - night * 0.85;
  });

  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, count]}
      receiveShadow={false}
      castShadow={false}
    />
  );
}
