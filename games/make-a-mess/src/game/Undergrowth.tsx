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
  MeshStandardMaterial,
  Quaternion,
  ShaderMaterial,
  Vector3,
} from "three";
import { windState } from "./windState";

/**
 * Nature reclaiming the built world. Ivy is grown the way ivy grows: each run
 * spawns VINES — wandering stem paths climbing from the soil — rendered as a
 * merged twig geometry, with hundreds of SMALL leaves clustered along the
 * stems (dense skirt at the base, thinning tendrils and a few tall leaders).
 * Weeds are curved grass blades pooling at footings and seams. Three draw
 * calls total, all GPU-instanced or static.
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
  /** Vines per metre of run (default 1.1). */
  readonly density?: number;
}

interface LeafPlacement {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly pitch: number;
  readonly roll: number;
  readonly scale: number;
  readonly tone: number;
  readonly depth: number; // 0 = pressed to the wall (dark), 1 = outer canopy
  readonly sway: number;
}

interface IvyBuild {
  readonly leaves: readonly LeafPlacement[];
  readonly stems: BufferGeometry;
}

function buildIvy(runs: readonly IvyRun[]): IvyBuild {
  const leaves: LeafPlacement[] = [];
  const stemPositions: number[] = [];
  const stemColors: number[] = [];
  const stemIndices: number[] = [];
  const stemColorA = new Color("#2e3a20");
  const stemColorB = new Color("#43502b");
  const up = new Vector3(0, 1, 0);

  const pushStem = (from: Vector3, to: Vector3, thickness: number, tone: number): void => {
    const dir = to.clone().sub(from);
    if (dir.lengthSq() < 1e-6) {
      return;
    }
    dir.normalize();
    let side = dir.clone().cross(up);
    if (side.lengthSq() < 1e-6) {
      side = new Vector3(1, 0, 0);
    }
    side.normalize().multiplyScalar(thickness / 2);
    const rise = side.clone().cross(dir).normalize().multiplyScalar(thickness / 2);
    const base = stemPositions.length / 3;
    const color = stemColorA.clone().lerp(stemColorB, tone);
    for (const p of [from, to]) {
      for (const [ss, uu] of [
        [1, 1],
        [1, -1],
        [-1, -1],
        [-1, 1],
      ] as const) {
        stemPositions.push(
          p.x + side.x * ss + rise.x * uu,
          p.y + side.y * ss + rise.y * uu,
          p.z + side.z * ss + rise.z * uu,
        );
        stemColors.push(color.r, color.g, color.b);
      }
    }
    for (let corner = 0; corner < 4; corner += 1) {
      const next = (corner + 1) % 4;
      stemIndices.push(
        base + corner, base + 4 + corner, base + 4 + next,
        base + corner, base + 4 + next, base + next,
      );
    }
  };

  let seed = 0;
  for (const run of runs) {
    const runLength = Math.hypot(run.b[0] - run.a[0], run.b[2] - run.a[2]);
    const alongX = (run.b[0] - run.a[0]) / (runLength || 1);
    const alongZ = (run.b[2] - run.a[2]) / (runLength || 1);
    const yawAlong = Math.atan2(alongX, alongZ);
    const vineCount = Math.max(2, Math.round(runLength * (run.density ?? 1.1)));

    for (let vine = 0; vine < vineCount; vine += 1) {
      seed += 1;
      const u0 = ((vine + 0.5) / vineCount + (hash(seed, 1) - 0.5) * 0.5 / vineCount) * runLength;
      // Vine heights vary hard; a few leaders overtop the rest.
      const leader = hash(seed, 2) < 0.18;
      const vineHeight = run.height * (leader ? 0.95 + hash(seed, 3) * 0.3 : 0.35 + Math.pow(hash(seed, 3), 1.3) * 0.6);
      const wanderPhase = hash(seed, 4) * Math.PI * 2;
      const wanderAmp = 0.16 + hash(seed, 5) * 0.22;
      const thickness = 0.035 + hash(seed, 6) * 0.02;

      const pointAt = (y: number): Vector3 => {
        const wander = Math.sin(y * 2.1 + wanderPhase) * wanderAmp * Math.min(1, y);
        const u = u0 + wander;
        return new Vector3(
          run.a[0] + alongX * u + run.normal[0] * (0.032 + Math.sin(y * 3.1 + wanderPhase) * 0.01),
          run.a[1] + y,
          run.a[2] + alongZ * u + run.normal[1] * (0.032 + Math.cos(y * 2.7 + wanderPhase) * 0.01),
        );
      };

      const step = 0.24;
      let previous = pointAt(0.02);
      for (let y = step; y <= vineHeight; y += step) {
        const point = pointAt(y);
        pushStem(previous, point, thickness * (1 - (y / vineHeight) * 0.5), hash(seed + y, 7));
        // Occasional side twig.
        if (hash(seed, 8 + y) > 0.72 && y > 0.4) {
          const twigEnd = point.clone().add(new Vector3(
            alongX * (hash(seed, 9 + y) - 0.5) * 0.5,
            0.1 + hash(seed, 10 + y) * 0.15,
            alongZ * (hash(seed, 9 + y) - 0.5) * 0.5,
          ));
          pushStem(point, twigEnd, thickness * 0.5, 0.6);
        }
        previous = point;

        // Leaves cluster along the stem — many small, denser low.
        const heightFraction = y / run.height;
        const clusterSize = y < run.height * 0.35 ? 4 : y < run.height * 0.7 ? 3 : 2;
        for (let leaf = 0; leaf < clusterSize; leaf += 1) {
          seed += 1;
          const spreadAlong = (hash(seed, 11) - 0.5) * (0.34 - heightFraction * 0.12);
          const spreadUp = (hash(seed, 12) - 0.5) * 0.2;
          const depth = hash(seed, 13);
          leaves.push({
            x: point.x + alongX * spreadAlong + run.normal[0] * (0.012 + depth * 0.05),
            y: point.y + spreadUp,
            z: point.z + alongZ * spreadAlong + run.normal[1] * (0.012 + depth * 0.05),
            yaw: yawAlong + (hash(seed, 14) - 0.5) * 1.2,
            pitch: (hash(seed, 15) - 0.5) * 0.8,
            roll: (hash(seed, 16) - 0.5) * 0.9,
            scale: (0.42 + hash(seed, 17) * 0.5) * (1 - heightFraction * 0.3),
            tone: hash(seed, 18),
            depth,
            sway: heightFraction,
          });
        }
      }

      // Root skirt: extra foliage pooling at the base, spilling sideways.
      const skirtLeaves = 3 + Math.floor(hash(seed, 19) * 4);
      for (let leaf = 0; leaf < skirtLeaves; leaf += 1) {
        seed += 1;
        const spread = (hash(seed, 20) - 0.5) * 1.1;
        const depth = hash(seed, 21);
        leaves.push({
          x: run.a[0] + alongX * (u0 + spread) + run.normal[0] * (0.025 + depth * 0.07),
          y: run.a[1] + 0.04 + hash(seed, 22) * 0.3,
          z: run.a[2] + alongZ * (u0 + spread) + run.normal[1] * (0.025 + depth * 0.07),
          yaw: yawAlong + (hash(seed, 23) - 0.5) * 1.6,
          pitch: (hash(seed, 24) - 0.5) * 1.1,
          roll: (hash(seed, 25) - 0.5) * 1.0,
          scale: 0.5 + hash(seed, 26) * 0.55,
          tone: hash(seed, 27),
          depth,
          sway: 0.1,
        });
      }
    }
  }

  const stems = new BufferGeometry();
  stems.setAttribute("position", new Float32BufferAttribute(stemPositions, 3));
  stems.setAttribute("color", new Float32BufferAttribute(stemColors, 3));
  stems.setIndex(stemIndices);
  stems.computeVertexNormals();
  return { leaves, stems };
}

function makeLeafGeometry(): BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  let vertex = 0;
  // A small pair of crossed quads ≈ one leaf bunch. Kept SMALL — ivy reads
  // through many tiny leaves, never through big blobs.
  for (const tilt of [0.4, -0.35]) {
    const half = 0.1;
    positions.push(
      -half, -half, tilt * half,
      half, -half, -tilt * half,
      half, half, -tilt * half,
      -half, half, tilt * half,
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
  const build = useMemo(() => buildIvy(runs), [runs]);
  const geometry = useMemo(() => makeLeafGeometry(), []);

  const stemMaterial = useMemo(
    () => new MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }),
    [],
  );

  const material = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uLight: { value: 1 },
          uWind: { value: 1 },
          uShadow: { value: new Color("#131c0d") },
          uDeep: { value: new Color("#223318") },
          uFresh: { value: new Color("#33471f") },
          uDry: { value: new Color("#6d5c2e") },
        },
        side: DoubleSide,
        transparent: false,
        alphaTest: 0.5,
        vertexShader: /* glsl */ `
          uniform float uTime;
          uniform float uWind;
          attribute float aPhase;
          attribute float aTone;
          attribute float aDepth;
          attribute float aSway;
          varying vec2 vUv;
          varying float vTone;
          varying float vDepth;
          void main() {
            vUv = uv;
            vTone = aTone;
            vDepth = aDepth;
            vec4 world = instanceMatrix * vec4(position, 1.0);
            float sway = sin(uTime * 1.7 + aPhase) * 0.018 * aSway * uWind;
            world.x += sway;
            world.z += sway * 0.7;
            gl_Position = projectionMatrix * viewMatrix * world;
          }
        `,
        fragmentShader: /* glsl */ `
          precision mediump float;
          uniform vec3 uShadow;
          uniform vec3 uDeep;
          uniform vec3 uFresh;
          uniform vec3 uDry;
          uniform float uLight;
          varying vec2 vUv;
          varying float vTone;
          varying float vDepth;
          void main() {
            // Ragged five-lobe leaf-bunch cutout.
            vec2 p = vUv - 0.5;
            float angle = atan(p.y, p.x);
            float radius = length(p);
            float lobes = 0.30 + 0.10 * sin(angle * 5.0 + vTone * 6.28);
            if (radius > lobes) discard;
            // Inner leaves sit in their own shadow; outer canopy catches light.
            vec3 body = mix(uDeep, uFresh, vTone * 0.75 + vDepth * 0.25);
            vec3 color = mix(uShadow, body, 0.35 + vDepth * 0.65);
            color = mix(color, uDry, smoothstep(0.6, 1.0, vTone) * 0.5);
            float rim = smoothstep(lobes, lobes * 0.45, radius);
            color *= (0.72 + rim * 0.28) * uLight;
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
    const count = build.leaves.length;
    const phases = new Float32Array(count);
    const tones = new Float32Array(count);
    const depths = new Float32Array(count);
    const sways = new Float32Array(count);
    for (const [index, leaf] of build.leaves.entries()) {
      euler.set(leaf.pitch, leaf.yaw, leaf.roll);
      quaternion.setFromEuler(euler);
      position.set(leaf.x, leaf.y, leaf.z);
      scale.set(leaf.scale, leaf.scale, leaf.scale);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(index, matrix);
      phases[index] = hash(index, 31) * Math.PI * 2;
      tones[index] = leaf.tone;
      depths[index] = leaf.depth;
      sways[index] = leaf.sway;
    }
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
    geometry.setAttribute("aPhase", new InstancedBufferAttribute(phases, 1));
    geometry.setAttribute("aTone", new InstancedBufferAttribute(tones, 1));
    geometry.setAttribute("aDepth", new InstancedBufferAttribute(depths, 1));
    geometry.setAttribute("aSway", new InstancedBufferAttribute(sways, 1));
    mesh.frustumCulled = false;
  }, [build, geometry]);

  useFrame((state) => {
    material.uniforms.uTime.value = state.clock.elapsedTime;
    material.uniforms.uWind.value = windState.strength;
    material.uniforms.uLight.value = 1 - (nightRef.current ?? 0) * 0.82;
  });

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
      build.stems.dispose();
      stemMaterial.dispose();
    },
    [geometry, material, build, stemMaterial],
  );

  return (
    <>
      <mesh
        geometry={build.stems}
        material={stemMaterial}
        frustumCulled={false}
        castShadow={false}
        receiveShadow={false}
      />
      <instancedMesh
        ref={meshRef}
        args={[geometry, material, build.leaves.length]}
        frustumCulled={false}
      />
    </>
  );
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
  // Curved blade strips (base → mid → tip), same construction as the field
  // grass — weeds are its scrappier cousins, arcing outward from the clump.
  const blades = [
    { yaw: 0.2, height: 1.0, curve: 0.42, width: 0.075 },
    { yaw: 1.25, height: 0.78, curve: 0.55, width: 0.065 },
    { yaw: 2.2, height: 1.06, curve: 0.35, width: 0.08 },
    { yaw: 3.3, height: 0.7, curve: 0.6, width: 0.06 },
    { yaw: 4.25, height: 0.9, curve: 0.48, width: 0.07 },
    { yaw: 5.3, height: 0.82, curve: 0.52, width: 0.065 },
  ];
  for (const blade of blades) {
    const dirX = Math.cos(blade.yaw);
    const dirZ = Math.sin(blade.yaw);
    const perpX = -dirZ;
    const perpZ = dirX;
    const midOffset = blade.curve * blade.height * 0.22;
    const tipOffset = blade.curve * blade.height * 0.6;
    const pushRow = (
      offsetX: number,
      offsetY: number,
      offsetZ: number,
      halfWidth: number,
      uvY: number,
    ): void => {
      positions.push(offsetX - perpX * halfWidth, offsetY, offsetZ - perpZ * halfWidth);
      uvs.push(0, uvY);
      positions.push(offsetX + perpX * halfWidth, offsetY, offsetZ + perpZ * halfWidth);
      uvs.push(1, uvY);
    };
    pushRow(0, 0, 0, blade.width, 0);
    pushRow(dirX * midOffset, blade.height * 0.55, dirZ * midOffset, blade.width * 0.85, 0.55);
    pushRow(dirX * tipOffset, blade.height, dirZ * tipOffset, blade.width * 0.4, 1);
    indices.push(
      vertex, vertex + 1, vertex + 3, vertex, vertex + 3, vertex + 2,
      vertex + 2, vertex + 3, vertex + 5, vertex + 2, vertex + 5, vertex + 4,
    );
    vertex += 6;
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
          uBase: { value: new Color("#42542c") },
          uTip: { value: new Color("#728143") },
          uBaseDry: { value: new Color("#6e6636") },
          uTipDry: { value: new Color("#a89a5c") },
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
            float sway = sin(uTime * 1.4 + aPhase + world.x * 0.3) * 0.07 * uv.y * uv.y * uWind;
            world.x += sway;
            world.z += sway * 0.6;
            gl_Position = projectionMatrix * viewMatrix * world;
          }
        `,
        fragmentShader: /* glsl */ `
          precision mediump float;
          uniform vec3 uBase;
          uniform vec3 uTip;
          uniform vec3 uBaseDry;
          uniform vec3 uTipDry;
          uniform float uLight;
          varying vec2 vUv;
          varying float vDry;
          void main() {
            float halfWidth = (1.0 - vUv.y * 0.88) * 0.5;
            if (abs(vUv.x - 0.5) > halfWidth) discard;
            vec3 base = mix(uBase, uBaseDry, vDry);
            vec3 tip = mix(uTip, uTipDry, vDry * 1.1);
            float shade = 0.55 + vUv.y * 0.45;
            vec3 color = mix(base, tip, vUv.y) * shade * uLight;
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
      const size = (point.scale ?? 1) * (0.62 + hash(index, 12) * 0.6);
      scale.set(size, size * (0.7 + hash(index, 13) * 0.65), size);
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
