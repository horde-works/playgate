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
import type { BreakablePieceDefinition } from "./destructionScene";
import { sampleVikingGroundTraffic } from "./materialTextures";
import { windState } from "./windState";

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
function bladeHash(seed: number): number {
  const value = Math.sin(seed * 45.233 + 9.17) * 43758.5453;
  return value - Math.floor(value);
}

function makeTuftGeometry(): BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const bladeVar: number[] = [];
  let vertex = 0;
  // Each blade is a curved two-quad strip (base → mid → tip) that arcs over in
  // its own direction, so the tuft reads as bending grass, not straight spikes.
  // Blades vary in lean, height, curve and width; a per-blade value drives
  // colour and sway variation in the shaders.
  const blades = [
    { yaw: 0.15, height: 1.0, curve: 0.34, width: 0.12 },
    { yaw: 0.95, height: 0.82, curve: 0.52, width: 0.1 },
    { yaw: 1.75, height: 1.08, curve: 0.28, width: 0.13 },
    { yaw: 2.55, height: 0.72, curve: 0.58, width: 0.095 },
    { yaw: 3.45, height: 0.93, curve: 0.4, width: 0.115 },
    { yaw: 4.7, height: 0.8, curve: 0.46, width: 0.105 },
  ];
  for (const [bladeIndex, blade] of blades.entries()) {
    const dirX = Math.cos(blade.yaw);
    const dirZ = Math.sin(blade.yaw);
    const perpX = -dirZ;
    const perpZ = dirX;
    const midOffset = blade.curve * blade.height * 0.2;
    const tipOffset = blade.curve * blade.height * 0.55;
    const variance = bladeHash(bladeIndex + 1);
    const pushRow = (
      offsetX: number,
      offsetY: number,
      offsetZ: number,
      halfWidth: number,
      uvY: number,
    ): void => {
      positions.push(offsetX - perpX * halfWidth, offsetY, offsetZ - perpZ * halfWidth);
      uvs.push(0, uvY);
      bladeVar.push(variance);
      positions.push(offsetX + perpX * halfWidth, offsetY, offsetZ + perpZ * halfWidth);
      uvs.push(1, uvY);
      bladeVar.push(variance);
    };
    pushRow(0, 0, 0, blade.width, 0);
    pushRow(dirX * midOffset, blade.height * 0.52, dirZ * midOffset, blade.width * 0.9, 0.52);
    pushRow(dirX * tipOffset, blade.height, dirZ * tipOffset, blade.width * 0.66, 1);
    indices.push(
      vertex, vertex + 1, vertex + 3, vertex, vertex + 3, vertex + 2,
      vertex + 2, vertex + 3, vertex + 5, vertex + 2, vertex + 5, vertex + 4,
    );
    vertex += 6;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("aBladeVar", new Float32BufferAttribute(bladeVar, 1));
  geometry.setIndex(indices);
  return geometry;
}

// Deterministic hash scatter — no Math.random, so the field is identical every
// load (and safe for any replay/resume of the session).
function hash(index: number, salt: number): number {
  const value = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// Ring offsets (~1.8 m) used to look for a nearby path: grass thickens on the
// verge just off a trodden route.
const EDGE_RING: readonly (readonly [number, number])[] = [
  [1.8, 0],
  [-1.8, 0],
  [0, 1.8],
  [0, -1.8],
  [1.3, 1.3],
  [-1.3, -1.3],
];

export function GrassField({
  worldRadius,
  center,
  nightRef,
  pieces,
  count = 26000,
  bladeColor = "#43602c",
  tipColor = "#8aa851",
}: {
  worldRadius: number;
  center: readonly [number, number];
  nightRef: RefObject<number>;
  pieces: readonly BreakablePieceDefinition[];
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
          uWind: { value: 1 },
          uFadeStart: { value: 13 },
          uFadeEnd: { value: 27 },
          uBase: { value: new Color(bladeColor) },
          uTip: { value: new Color(tipColor) },
          uBaseDry: { value: new Color("#6f6a37") },
          uTipDry: { value: new Color("#bcae63") },
        },
        side: DoubleSide,
        transparent: false,
        alphaTest: 0.5,
        vertexShader: /* glsl */ `
          uniform float uTime;
          uniform vec3 uCamera;
          uniform float uWind;
          uniform float uFadeStart;
          uniform float uFadeEnd;
          attribute float aPhase;
          attribute float aBladeVar;
          attribute float aTint;
          varying vec2 vUv;
          varying float vShade;
          varying float vDryness;
          void main() {
            vUv = uv;
            vec4 world = instanceMatrix * vec4(position, 1.0);
            // Distance fade: tufts shrink into the ground as they recede, so
            // far grass vanishes smoothly with zero overdraw and no pop.
            float dist = distance(world.xyz, uCamera);
            float fade = 1.0 - smoothstep(uFadeStart, uFadeEnd, dist);
            // Wind: the free tip sways, each blade slightly out of phase, on top
            // of the blade's own baked-in curve.
            float sway = sin(uTime * 1.5 + aPhase + aBladeVar * 5.7 + world.x * 0.25 + world.z * 0.2);
            float gust = sin(uTime * 0.55 + world.x * 0.05) * 0.5 + 0.5;
            float bend = uv.y * uv.y * (0.1 + gust * 0.15) * sway * uWind;
            vec3 local = position * fade;
            vec4 shifted = instanceMatrix * vec4(local, 1.0);
            shifted.x += bend;
            shifted.z += bend * 0.6;
            // Darker at the base (self-shadow), lifting to the tip; each blade a
            // touch brighter or duller.
            vShade = (0.5 + uv.y * 0.5) * (0.86 + aBladeVar * 0.28);
            // Some tufts and some blades within them are drier and yellower.
            vDryness = clamp(aTint * 0.78 + aBladeVar * 0.42 - 0.22, 0.0, 1.0);
            gl_Position = projectionMatrix * viewMatrix * shifted;
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
          varying float vShade;
          varying float vDryness;
          void main() {
            // Pointed-blade cutout: discard outside a triangle tapering to the
            // tip. No blending — depth-correct and sort-free.
            float halfWidth = (1.0 - vUv.y) * 0.5;
            if (abs(vUv.x - 0.5) > halfWidth) discard;
            // Lush green blends toward dry straw per blade; dry tips catch it
            // strongest, so blades look sun-bleached at their ends.
            vec3 base = mix(uBase, uBaseDry, vDryness);
            vec3 tip = mix(uTip, uTipDry, vDryness * 1.15);
            vec3 color = mix(base, tip, vUv.y) * vShade * uLight;
            gl_FragColor = vec4(color, 1.0);
          }
        `,
      }),
    [bladeColor, tipColor],
  );

  // Scatter the instances once.
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) {
      return;
    }

    // Cover mask: 1 m cells where a solid object sits low enough that a blade
    // would poke through it — floors, decks, foundations, wall footings. Grass
    // skips these cells, so it never grows up through a wooden floor.
    const blocked = new Set<string>();
    for (const piece of pieces) {
      if (
        piece.shape === "groundTile" ||
        piece.material === "grass" ||
        piece.material === "earth" ||
        piece.material === "soil"
      ) {
        continue;
      }
      const boxes =
        piece.contactBoxes && piece.contactBoxes.length > 0
          ? piece.contactBoxes
          : [{ position: piece.position, size: piece.size }];
      for (const box of boxes) {
        const bottom = box.position[1] - box.size[1] / 2;
        const top = box.position[1] + box.size[1] / 2;
        if (bottom > 0.75 || top < 0.05) {
          continue;
        }
        const hx = box.size[0] / 2 + 0.2;
        const hz = box.size[2] / 2 + 0.2;
        for (let gx = Math.floor(box.position[0] - hx); gx <= Math.ceil(box.position[0] + hx); gx += 1) {
          for (let gz = Math.floor(box.position[2] - hz); gz <= Math.ceil(box.position[2] + hz); gz += 1) {
            blocked.add(`${gx}:${gz}`);
          }
        }
      }
    }

    const matrix = new Matrix4();
    const position = new Vector3();
    const quaternion = new Quaternion();
    const scale = new Vector3();
    const euler = new Euler();
    const phases = new Float32Array(count);
    const tints = new Float32Array(count);
    const usableRadius = Math.max(4, worldRadius - 4);
    let placed = 0;
    // Oversample candidates and keep them by a traffic-aware probability, so the
    // same instance budget lands denser on the grassy verges and sparser on the
    // worn paths, without ever exceeding `count`.
    const maxCandidates = count * 2;
    for (let index = 0; index < maxCandidates && placed < count; index += 1) {
      const radius = Math.sqrt(hash(index, 1)) * usableRadius;
      const angle = hash(index, 2) * Math.PI * 2;
      const x = center[0] + Math.cos(angle) * radius;
      const z = center[1] + Math.sin(angle) * radius;
      if (blocked.has(`${Math.floor(x)}:${Math.floor(z)}`)) {
        continue;
      }
      // Trodden routes carry little grass; the verge just off them carries the
      // most — grass grows thickest exactly where feet do not fall.
      const traffic = sampleVikingGroundTraffic(x, z);
      let edgeTraffic = traffic;
      for (const [ox, oz] of EDGE_RING) {
        edgeTraffic = Math.max(edgeTraffic, sampleVikingGroundTraffic(x + ox, z + oz));
      }
      const onPath = smoothstep(0.3, 0.56, traffic);
      const edge = Math.min(1, Math.max(0, edgeTraffic - traffic) * 1.7);
      const keep = Math.min(1.1, 0.6 * (1 - onPath * 0.94) + edge * 0.8);
      if (hash(index, 7) > keep) {
        continue;
      }
      const edgeBoost = 1 + edge * 0.45;
      const height = (0.42 + hash(index, 3) * 0.5) * edgeBoost;
      const width = 0.78 + hash(index, 4) * 0.6;
      euler.set(0, hash(index, 5) * Math.PI * 2, 0);
      quaternion.setFromEuler(euler);
      position.set(x, 0, z);
      scale.set(width, height, width);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(placed, matrix);
      phases[placed] = hash(index, 6) * Math.PI * 2;
      // Per-tuft colour: bias drier the further from the lush verges (less
      // grass keep-probability → drier), so worn ground looks parched.
      tints[placed] = Math.min(1, hash(index, 8) * (1.15 - edge * 0.5));
      placed += 1;
    }
    mesh.count = placed;
    mesh.instanceMatrix.needsUpdate = true;
    geometry.setAttribute("aPhase", new InstancedBufferAttribute(phases, 1));
    geometry.setAttribute("aTint", new InstancedBufferAttribute(tints, 1));
    // The bounding sphere spans the whole field (instances are not individually
    // culled), so it never wrongly disappears at the screen edge.
    mesh.frustumCulled = false;
  }, [pieces, count, worldRadius, center, geometry]);

  useFrame((state) => {
    const uniforms = material.uniforms;
    uniforms.uTime.value = state.clock.elapsedTime;
    uniforms.uCamera.value.copy(camera.position);
    uniforms.uWind.value = windState.strength;
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
