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
  bladeColor = "#4f6a39",
  tipColor = "#8aa356",
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
            float bend = uv.y * uv.y * (0.12 + gust * 0.16) * sway * uWind;
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
      placed += 1;
    }
    mesh.count = placed;
    mesh.instanceMatrix.needsUpdate = true;
    geometry.setAttribute("aPhase", new InstancedBufferAttribute(phases, 1));
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
