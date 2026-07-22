"use client";

import { useEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
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
import { windState } from "./windState";

/**
 * Nature reclaiming the built world — the second half of what makes a place
 * read as real. Two GPU-instanced layers, one draw call each:
 *
 * - IvyPatches: leaf clusters climbing authored wall rectangles (palisades,
 *   garage backs, gables, fences), dense at the bottom, straggling upward.
 * - WeedClumps: grass tufts at authored points — wall footings, curb seams,
 *   fence lines — where soil collects and mowers never reach.
 */

function hash(index: number, salt: number): number {
  const value = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

// ---------------------------------------------------------------------------
// Ivy

export interface IvyRun {
  /** Wall-base start and end, on the wall face (y = base of growth). */
  readonly a: readonly [number, number, number];
  readonly b: readonly [number, number, number];
  readonly height: number;
  /** Outward face normal in the ground plane. */
  readonly normal: readonly [number, number];
  /** Leaf clusters per square metre (default 4.5). */
  readonly density?: number;
}

function makeLeafGeometry(): BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  let vertex = 0;
  // Two crossed quads angled slightly off the wall so the clump has depth.
  for (const tilt of [0.35, -0.3]) {
    const half = 0.19;
    positions.push(
      -half, 0, tilt * half,
      half, 0, -tilt * half,
      half, 2 * half, -tilt * half,
      -half, 2 * half, tilt * half,
    );
    uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
    indices.push(vertex, vertex + 1, vertex + 2, vertex, vertex + 2, vertex + 3);
    vertex += 4;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}

export function IvyPatches({
  runs,
  nightRef,
}: {
  runs: readonly IvyRun[];
  nightRef: RefObject<number>;
}) {
  const meshRef = useRef<InstancedMesh>(null);
  const geometry = useMemo(() => makeLeafGeometry(), []);

  const count = useMemo(
    () =>
      runs.reduce((sum, run) => {
        const length = Math.hypot(run.b[0] - run.a[0], run.b[2] - run.a[2]);
        return sum + Math.max(4, Math.ceil(length * run.height * (run.density ?? 4.5)));
      }, 0),
    [runs],
  );

  const material = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uLight: { value: 1 },
          uWind: { value: 1 },
          uDeep: { value: new Color("#2d4620") },
          uFresh: { value: new Color("#4c6b2e") },
        },
        side: DoubleSide,
        transparent: false,
        alphaTest: 0.5,
        vertexShader: /* glsl */ `
          uniform float uTime;
          uniform float uWind;
          attribute float aPhase;
          attribute float aTone;
          varying vec2 vUv;
          varying float vTone;
          void main() {
            vUv = uv;
            vTone = aTone;
            vec3 local = position;
            vec4 world = instanceMatrix * vec4(local, 1.0);
            // The clump's free edge trembles a little in the wind.
            float sway = sin(uTime * 1.8 + aPhase) * 0.02 * uv.y * uWind;
            world.x += sway;
            world.z += sway * 0.7;
            gl_Position = projectionMatrix * viewMatrix * world;
          }
        `,
        fragmentShader: /* glsl */ `
          precision mediump float;
          uniform vec3 uDeep;
          uniform vec3 uFresh;
          uniform float uLight;
          varying vec2 vUv;
          varying float vTone;
          void main() {
            // A three-lobed leafy cutout: the union of three soft discs.
            vec2 p = vUv;
            float d = min(
              min(length(p - vec2(0.5, 0.32)), length(p - vec2(0.3, 0.62))),
              length(p - vec2(0.7, 0.62))
            );
            if (d > 0.31) discard;
            float shade = 0.62 + vUv.y * 0.38;
            vec3 color = mix(uDeep, uFresh, vTone) * shade * uLight;
            gl_FragColor = vec4(color, 1.0);
          }
        `,
      }),
    [],
  );

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
    const tones = new Float32Array(count);
    let placed = 0;
    let seed = 0;
    for (const run of runs) {
      const length = Math.hypot(run.b[0] - run.a[0], run.b[2] - run.a[2]);
      const instances = Math.max(4, Math.ceil(length * run.height * (run.density ?? 4.5)));
      const yawAlong = Math.atan2(run.b[0] - run.a[0], run.b[2] - run.a[2]);
      for (let index = 0; index < instances && placed < count; index += 1) {
        seed += 1;
        const u = hash(seed, 1);
        // Climbing habit: dense near the base, straggling toward the top.
        const v = Math.pow(hash(seed, 2), 1.55) * run.height;
        const x = run.a[0] + (run.b[0] - run.a[0]) * u + run.normal[0] * 0.07;
        const z = run.a[2] + (run.b[2] - run.a[2]) * u + run.normal[1] * 0.07;
        const y = run.a[1] + v;
        euler.set(
          (hash(seed, 3) - 0.5) * 0.7,
          yawAlong + (hash(seed, 4) - 0.5) * 1.4,
          (hash(seed, 5) - 0.5) * 0.7,
        );
        quaternion.setFromEuler(euler);
        position.set(x, y, z);
        const size = 0.75 + hash(seed, 6) * 0.8;
        scale.set(size, size, size);
        matrix.compose(position, quaternion, scale);
        mesh.setMatrixAt(placed, matrix);
        phases[placed] = hash(seed, 7) * Math.PI * 2;
        tones[placed] = hash(seed, 8);
        placed += 1;
      }
    }
    mesh.count = placed;
    mesh.instanceMatrix.needsUpdate = true;
    geometry.setAttribute("aPhase", new InstancedBufferAttribute(phases, 1));
    geometry.setAttribute("aTone", new InstancedBufferAttribute(tones, 1));
    mesh.frustumCulled = false;
  }, [runs, count, geometry]);

  useFrame((state) => {
    material.uniforms.uTime.value = state.clock.elapsedTime;
    material.uniforms.uWind.value = windState.strength;
    material.uniforms.uLight.value = 1 - (nightRef.current ?? 0) * 0.82;
  });

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  return <instancedMesh ref={meshRef} args={[geometry, material, count]} frustumCulled={false} />;
}

// ---------------------------------------------------------------------------
// Weeds

export interface WeedPoint {
  readonly x: number;
  readonly z: number;
  readonly y?: number;
  readonly scale?: number;
  /** 0 = lush green … 1 = dry straw. */
  readonly dry?: number;
}

function makeWeedGeometry(): BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  let vertex = 0;
  // Coarser and scrappier than lawn grass: four wide blades leaning outward.
  for (const [index, yaw] of [0.2, 1.5, 2.9, 4.4].entries()) {
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const lean = 0.22 + (index % 2) * 0.12;
    const width = 0.085;
    positions.push(
      -width * cos, 0, -width * sin,
      width * cos, 0, width * sin,
      cos * lean + width * cos * 0.4, 0.9, sin * lean + width * sin * 0.4,
      cos * lean - width * cos * 0.4, 0.9, sin * lean - width * sin * 0.4,
    );
    uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
    indices.push(vertex, vertex + 1, vertex + 2, vertex, vertex + 2, vertex + 3);
    vertex += 4;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}

export function WeedClumps({
  points,
  nightRef,
}: {
  points: readonly WeedPoint[];
  nightRef: RefObject<number>;
}) {
  const meshRef = useRef<InstancedMesh>(null);
  const geometry = useMemo(() => makeWeedGeometry(), []);

  const material = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uLight: { value: 1 },
          uWind: { value: 1 },
          uBase: { value: new Color("#4a5c33") },
          uDry: { value: new Color("#8f854e") },
        },
        side: DoubleSide,
        transparent: false,
        alphaTest: 0.5,
        vertexShader: /* glsl */ `
          uniform float uTime;
          uniform float uWind;
          attribute float aPhase;
          attribute float aDry;
          varying vec2 vUv;
          varying float vDry;
          void main() {
            vUv = uv;
            vDry = aDry;
            vec4 world = instanceMatrix * vec4(position, 1.0);
            float sway = sin(uTime * 1.4 + aPhase + world.x * 0.3) * 0.06 * uv.y * uv.y * uWind;
            world.x += sway;
            world.z += sway * 0.6;
            gl_Position = projectionMatrix * viewMatrix * world;
          }
        `,
        fragmentShader: /* glsl */ `
          precision mediump float;
          uniform vec3 uBase;
          uniform vec3 uDry;
          uniform float uLight;
          varying vec2 vUv;
          varying float vDry;
          void main() {
            float halfWidth = (1.0 - vUv.y * 0.85) * 0.5;
            if (abs(vUv.x - 0.5) > halfWidth) discard;
            float shade = 0.55 + vUv.y * 0.45;
            vec3 color = mix(uBase, uDry, vDry * (0.4 + vUv.y * 0.6)) * shade * uLight;
            gl_FragColor = vec4(color, 1.0);
          }
        `,
      }),
    [],
  );

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
    const phases = new Float32Array(points.length);
    const dryness = new Float32Array(points.length);
    for (const [index, point] of points.entries()) {
      euler.set(0, hash(index, 11) * Math.PI * 2, 0);
      quaternion.setFromEuler(euler);
      position.set(point.x, point.y ?? 0, point.z);
      const size = (point.scale ?? 1) * (0.7 + hash(index, 12) * 0.7);
      scale.set(size, size * (0.75 + hash(index, 13) * 0.6), size);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(index, matrix);
      phases[index] = hash(index, 14) * Math.PI * 2;
      dryness[index] = point.dry ?? hash(index, 15) * 0.8;
    }
    mesh.count = points.length;
    mesh.instanceMatrix.needsUpdate = true;
    geometry.setAttribute("aPhase", new InstancedBufferAttribute(phases, 1));
    geometry.setAttribute("aDry", new InstancedBufferAttribute(dryness, 1));
    mesh.frustumCulled = false;
  }, [points, geometry]);

  useFrame((state) => {
    material.uniforms.uTime.value = state.clock.elapsedTime;
    material.uniforms.uWind.value = windState.strength;
    material.uniforms.uLight.value = 1 - (nightRef.current ?? 0) * 0.85;
  });

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  return (
    <instancedMesh ref={meshRef} args={[geometry, material, points.length]} frustumCulled={false} />
  );
}
