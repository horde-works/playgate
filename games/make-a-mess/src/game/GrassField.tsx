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
  Vector2,
  Vector3,
} from "three";
import { createLandscapeSampler } from "../content/landscape/landscapeSampler";
import type { LandscapeSample } from "../content/landscape/landscapeDocument";
import {
  dutchPolderCoverPieceIdAt,
  dutchPolderLandscapeDocument,
  dutchPolderVisualTopAt,
} from "../content/scenes/dutchPolder/dutchPolderLandscapeDocument";
import type { BreakablePieceDefinition } from "./destructionScene";
import {
  dutchPolderVegetationPatchNoise,
  sampleDutchPolderVegetation,
  type DutchPolderVegetationStyle,
} from "./dutchPolderVegetation";
import { sampleVikingGroundTraffic } from "./materialTextures";
import { windState } from "./windState";

/**
 * A field of instanced grass tufts scattered across a circular landscape.
 *
 * Every tuft is a small fan of tapered strips, so it reads as 3D from any angle
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
  const bladeCenters: number[] = [];
  const bladeBases: number[] = [];
  const bladeSides: number[] = [];
  let vertex = 0;
  // Each blade is a curved two-quad strip (base → mid → tip) that arcs over in
  // its own direction, so the tuft reads as bending grass, not straight spikes.
  // Blades vary in lean, height, curve and width; a per-blade value drives
  // colour and sway variation in the shaders.
  const blades = Array.from({ length: 12 }, (_, index) => {
    const heightVariation = bladeHash(index * 3 + 1);
    const baseVariation = bladeHash(index * 3 + 2);
    const baseAngle = index * 2.399963 + baseVariation * 0.7;
    const baseRadius = index === 0 ? 0 : 0.045 + baseVariation * 0.23;
    return {
      yaw: index * 2.399963 + bladeHash(index * 3 + 3) * 0.55,
      height: 0.66 + heightVariation * 0.48,
      curve: 0.24 + bladeHash(index * 5 + 4) * 0.38,
      width: 0.026 + bladeHash(index * 7 + 5) * 0.022,
      baseX: Math.cos(baseAngle) * baseRadius,
      baseZ: Math.sin(baseAngle) * baseRadius,
    };
  });
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
      const leftX = -perpX * halfWidth;
      const leftZ = -perpZ * halfWidth;
      positions.push(offsetX + leftX, offsetY, offsetZ + leftZ);
      uvs.push(0, uvY);
      bladeVar.push(variance);
      bladeCenters.push(offsetX, offsetZ);
      bladeBases.push(blade.baseX, blade.baseZ);
      bladeSides.push(leftX, leftZ);
      const rightX = perpX * halfWidth;
      const rightZ = perpZ * halfWidth;
      positions.push(offsetX + rightX, offsetY, offsetZ + rightZ);
      uvs.push(1, uvY);
      bladeVar.push(variance);
      bladeCenters.push(offsetX, offsetZ);
      bladeBases.push(blade.baseX, blade.baseZ);
      bladeSides.push(rightX, rightZ);
    };
    pushRow(blade.baseX, 0, blade.baseZ, blade.width, 0);
    pushRow(
      blade.baseX + dirX * midOffset,
      blade.height * 0.52,
      blade.baseZ + dirZ * midOffset,
      blade.width * 0.9,
      0.52,
    );
    pushRow(
      blade.baseX + dirX * tipOffset,
      blade.height,
      blade.baseZ + dirZ * tipOffset,
      blade.width * 0.66,
      1,
    );
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
  geometry.setAttribute("aBladeCenter", new Float32BufferAttribute(bladeCenters, 2));
  geometry.setAttribute("aBladeBase", new Float32BufferAttribute(bladeBases, 2));
  geometry.setAttribute("aBladeSide", new Float32BufferAttribute(bladeSides, 2));
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

export type GrassFieldProfile = "viking" | "dutch-polder";

const dutchPolderSampler = createLandscapeSampler(dutchPolderLandscapeDocument);

export function GrassField({
  worldRadius,
  center,
  nightRef,
  pieces,
  count = 26000,
  bladeColor = "#43602c",
  tipColor = "#8aa851",
  profile = "viking",
  fadeStart = profile === "dutch-polder" ? 28 : 13,
  fadeEnd = profile === "dutch-polder" ? 52 : 27,
  windScale = profile === "dutch-polder" ? 0.42 : 1,
  hiddenPieceIds,
}: {
  worldRadius: number;
  center: readonly [number, number];
  nightRef: RefObject<number>;
  pieces: readonly BreakablePieceDefinition[];
  count?: number;
  bladeColor?: string;
  tipColor?: string;
  profile?: GrassFieldProfile;
  fadeStart?: number;
  fadeEnd?: number;
  windScale?: number;
  hiddenPieceIds?: ReadonlySet<string>;
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
          uLightColor: { value: new Color(1, 1, 1) },
          uSheen: { value: new Color(0, 0, 0) },
          uWind: { value: 1 },
          uViewport: { value: new Vector2(1280, 720) },
          uMinBladePixels: { value: 2.5 },
          uFadeStart: { value: fadeStart },
          uFadeEnd: { value: fadeEnd },
          uHighlandVisibility: { value: profile === "dutch-polder" ? 1 : 0 },
          uBase: { value: new Color(bladeColor) },
          uTip: { value: new Color(tipColor) },
          uBaseDry: { value: new Color("#6f6a37") },
          uTipDry: { value: new Color("#bcae63") },
          uReedBase: { value: new Color("#596331") },
          uReedTip: { value: new Color("#a5a05b") },
          uReedBaseDry: { value: new Color("#66583a") },
          uReedTipDry: { value: new Color("#b6a264") },
        },
        side: DoubleSide,
        transparent: false,
        alphaTest: 0.5,
        vertexShader: /* glsl */ `
          uniform float uTime;
          uniform vec3 uCamera;
          uniform float uWind;
          uniform vec2 uViewport;
          uniform highp float uMinBladePixels;
          uniform float uFadeStart;
          uniform float uFadeEnd;
          uniform float uHighlandVisibility;
          attribute float aPhase;
          attribute float aBladeVar;
          attribute float aTint;
          attribute float aKind;
          attribute float aFlower;
          attribute vec2 aBladeCenter;
          attribute vec2 aBladeBase;
          attribute vec2 aBladeSide;
          varying vec2 vUv;
          varying float vShade;
          varying float vDryness;
          varying float vKind;
          varying float vFlower;
          varying float vBladeVar;
          varying highp float vQuadHalfPixels;
          void main() {
            vUv = uv;
            vec4 origin = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
            vec4 world = instanceMatrix * vec4(position, 1.0);
            // Distance fade: nearby ground remains cheap, while elevated
            // terrain keeps its grass silhouette much farther away.
            //
            // This used to be gated on the tuft sitting inside the view cone,
            // which made the range depend on WHERE THE CAMERA LOOKS: panning
            // the mouse grew and shrank thousands of distant tufts at once and
            // stripped blades out of them, and the field boiled. Off-screen
            // tufts are already dropped by frustum culling, so the cone bought
            // little; the range now depends on distance and height alone.
            vec3 toTuft = origin.xyz - uCamera;
            float dist = length(toTuft);
            float highland = smoothstep(1.05, 2.8, origin.y);
            float highlandAttention = highland * uHighlandVisibility;
            float activeFadeStart = mix(uFadeStart, 34.0, highlandAttention);
            float activeFadeEnd = mix(uFadeEnd, 60.0, highlandAttention);
            float fade = 1.0 - smoothstep(activeFadeStart, activeFadeEnd, dist);
            // Wind: the free tip sways, each blade slightly out of phase, on top
            // of the blade's own baked-in curve.
            float sway = sin(uTime * 1.5 + aPhase + aBladeVar * 5.7 + world.x * 0.25 + world.z * 0.2);
            float gust = sin(uTime * 0.55 + world.x * 0.05) * 0.5 + 0.5;
            float stiffness = mix(1.0, 0.38, aKind);
            float bend = uv.y * uv.y * (0.1 + gust * 0.15) * sway * uWind * stiffness;
            vec3 local = position;
            // Grass keeps the curved leaf strip. Reeds retain only a slightly
            // leaning centre line and a very narrow side offset: a real stem
            // silhouette rather than an enlarged grass leaf. Several stems
            // receive a broader panicle only at the very top.
            float panicleStem = step(0.68, aBladeVar);
            float panicleRise = smoothstep(0.72, 1.0, uv.y) * panicleStem;
            float reedSideScale = mix(0.14, 0.62, panicleRise);
            vec2 reedCenter = mix(aBladeBase, aBladeCenter, 0.24);
            vec2 reedXZ = reedCenter + aBladeSide * reedSideScale;
            local.xz = mix(local.xz, reedXZ, aKind);
            // Full twelve-blade tufts are only a near-field asset. On a
            // watched distant hill, retain a deterministic few blades from
            // each existing instance and collapse the rest to degenerate
            // triangles. This preserves the seeded silhouette without paying
            // the far-field alpha-cutout cost that can starve the compositor.
            float farLod = smoothstep(30.0, 44.0, dist) * uHighlandVisibility;
            float silhouetteBlade = step(0.66, aBladeVar);
            float bladeVisibility = mix(1.0, silhouetteBlade, farLod);
            local *= fade * bladeVisibility;
            local.y *= mix(1.0, 1.16, farLod);
            // Cutout alpha decides coverage per pixel with no partial tones, so
            // a blade narrower than a pixel does not thin out — it flips on and
            // off as the view turns, and a field of reeds boils. Widen every
            // blade about its OWN centre line until its projection is at least
            // uMinBladePixels across. The factor is exactly 1 for anything
            // already wider, so near silhouettes keep their authored shape, and
            // the cap keeps an edge-on blade from ballooning.
            vec2 centreXZ = mix(aBladeCenter, reedCenter, aKind) * fade * bladeVisibility;
            vec2 sideXZ = local.xz - centreXZ;
            vec4 centreClip = projectionMatrix * viewMatrix
              * instanceMatrix * vec4(centreXZ.x, local.y, centreXZ.y, 1.0);
            vec4 edgeClip = projectionMatrix * viewMatrix
              * instanceMatrix * vec4(local.x, local.y, local.z, 1.0);
            vec2 centrePx = centreClip.xy / max(centreClip.w, 1e-4) * uViewport * 0.5;
            vec2 edgePx = edgeClip.xy / max(edgeClip.w, 1e-4) * uViewport * 0.5;
            float halfPixels = length(edgePx - centrePx);
            float widen = clamp(uMinBladePixels * 0.5 / max(halfPixels, 1e-4), 1.0, 16.0);
            local.xz = centreXZ + sideXZ * widen;
            // Hand the achieved on-screen half-width to the fragment stage: the
            // cutout tapers the blade to a point, so a quad that is barely a
            // pixel wide still draws sub-pixel slivers near the tip.
            vQuadHalfPixels = halfPixels * widen;
            vec4 shifted = instanceMatrix * vec4(local, 1.0);
            shifted.x += bend;
            shifted.z += bend * 0.6;
            // Darker at the base (self-shadow), lifting to the tip; each blade a
            // touch brighter or duller.
            vShade = (0.5 + uv.y * 0.5) * (0.86 + aBladeVar * 0.28);
            // Some tufts and some blades within them are drier and yellower.
            vDryness = clamp(aTint * 0.78 + aBladeVar * 0.42 - 0.22, 0.0, 1.0);
            vKind = aKind;
            vFlower = aFlower;
            vBladeVar = aBladeVar;
            gl_Position = projectionMatrix * viewMatrix * shifted;
          }
        `,
        fragmentShader: /* glsl */ `
          precision mediump float;
          uniform vec3 uBase;
          uniform vec3 uTip;
          uniform vec3 uBaseDry;
          uniform vec3 uTipDry;
          uniform vec3 uReedBase;
          uniform vec3 uReedTip;
          uniform vec3 uReedBaseDry;
          uniform vec3 uReedTipDry;
          uniform vec3 uLightColor;
          uniform vec3 uSheen;
          uniform highp float uMinBladePixels;
          varying vec2 vUv;
          varying float vShade;
          varying float vDryness;
          varying float vKind;
          varying float vFlower;
          varying float vBladeVar;
          varying highp float vQuadHalfPixels;
          void main() {
            // Pointed-blade cutout: discard outside a triangle tapering to the
            // tip. No blending — depth-correct and sort-free.
            float grassWidth = (1.0 - vUv.y) * 0.5;
            float reedWidth = mix(0.44, 0.36, smoothstep(0.72, 1.0, vUv.y));
            float halfWidth = mix(grassWidth, reedWidth, vKind);
            // A rare flowering tuft widens only several blade tips into tiny
            // heads. Flowers therefore inherit the grass distribution and do
            // not require another mesh, object or draw call.
            float floweringBlade = step(0.48, vBladeVar) * step(0.5, vFlower);
            float flowerHead = floweringBlade
              * smoothstep(0.76, 0.86, vUv.y)
              * (1.0 - smoothstep(0.96, 1.0, vUv.y));
            halfWidth = max(halfWidth, flowerHead * 0.3);
            // Far blades stop tapering and become parallel-sided lines about
            // uMinBladePixels wide. Near blades are untouched: their quad is
            // tens of pixels across, so this floor sits far below the taper.
            float minHalfWidth = min(0.5, uMinBladePixels / max(4.0 * vQuadHalfPixels, 1e-4));
            halfWidth = max(halfWidth, minHalfWidth);
            if (abs(vUv.x - 0.5) > halfWidth) discard;
            // Lush green blends toward dry straw per blade; dry tips catch it
            // strongest, so blades look sun-bleached at their ends.
            vec3 grassBase = mix(uBase, uBaseDry, vDryness);
            vec3 grassTip = mix(uTip, uTipDry, vDryness * 1.15);
            vec3 reedBase = mix(uReedBase, uReedBaseDry, vDryness);
            vec3 reedTip = mix(uReedTip, uReedTipDry, vDryness);
            vec3 base = mix(grassBase, reedBase, vKind);
            vec3 tip = mix(grassTip, reedTip, vKind);
            vec3 color = mix(base, tip, vUv.y) * vShade * uLightColor;
            float reedHead = vKind
              * step(0.68, vBladeVar)
              * smoothstep(0.76, 0.84, vUv.y)
              * (1.0 - smoothstep(0.98, 1.0, vUv.y));
            color = mix(color, vec3(0.36, 0.29, 0.16) * uLightColor, reedHead * 0.82);
            vec3 flowerColor = vFlower < 1.5
              ? vec3(0.92, 0.74, 0.20)
              : vFlower < 2.5
                ? vec3(0.93, 0.91, 0.76)
                : vec3(0.62, 0.52, 0.76);
            color = mix(color, flowerColor * uLightColor * 1.08, flowerHead);
            // Кончики ловят низкий свет: на закате трава отдаёт тёплым, под
            // луной — холодным. Без этого она просто гасла множителем и
            // одинаково висела и в сумерках, и в темноте.
            color += uSheen * pow(vUv.y, 2.2) * (0.55 + 0.45 * vDryness);
            gl_FragColor = vec4(color, 1.0);
          }
        `,
      }),
    [bladeColor, tipColor, fadeStart, fadeEnd, profile],
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
    //
    // Ground mask: 1 m cells where a REAL grass/soil tile exists near y=0.
    // Шумная кромка мира оставляет заливы без тайлов внутри круга рассева —
    // без этой маски пучки висели над пустотой у края.
    const blocked = new Set<string>();
    const dutchBlockers = new Map<string, Array<readonly [number, number]>>();
    const ground = new Set<string>();
    for (const piece of pieces) {
      if (
        piece.shape === "groundTile" &&
        (piece.material === "grass" || piece.material === "soil") &&
        piece.position[1] > -0.6 &&
        piece.position[1] < 0.4
      ) {
        // Ячейка зачисляется, только если ЦЕЛИКОМ внутри тайла: соседние
        // тайлы перекрываются на 6 см и добирают межтайловые ячейки, а у
        // внешней кромки трава не свисает корнями за край.
        const minX = piece.position[0] - piece.size[0] / 2 - 0.01;
        const maxX = piece.position[0] + piece.size[0] / 2 + 0.01;
        const minZ = piece.position[2] - piece.size[2] / 2 - 0.01;
        const maxZ = piece.position[2] + piece.size[2] / 2 + 0.01;
        for (let gx = Math.ceil(minX); gx + 1 <= maxX; gx += 1) {
          for (let gz = Math.ceil(minZ); gz + 1 <= maxZ; gz += 1) {
            ground.add(`${gx}:${gz}`);
          }
        }
        continue;
      }
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
        if (profile === "viking" && (bottom > 0.75 || top < 0.05)) {
          continue;
        }
        const hx = box.size[0] / 2 + 0.2;
        const hz = box.size[2] / 2 + 0.2;
        for (let gx = Math.floor(box.position[0] - hx); gx <= Math.ceil(box.position[0] + hx); gx += 1) {
          for (let gz = Math.floor(box.position[2] - hz); gz <= Math.ceil(box.position[2] + hz); gz += 1) {
            const key = `${gx}:${gz}`;
            if (profile === "viking") {
              blocked.add(key);
            } else {
              const intervals = dutchBlockers.get(key) ?? [];
              intervals.push([bottom, top]);
              dutchBlockers.set(key, intervals);
            }
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
    const kinds = new Float32Array(count);
    const flowers = new Float32Array(count);
    const usableRadius = Math.max(4, worldRadius - 4);
    let placed = 0;
    // Oversample candidates and keep them by a traffic-aware probability, so the
    // same instance budget lands denser on the grassy verges and sparser on the
    // worn paths, without ever exceeding `count`.
    const maxCandidates = count * (profile === "dutch-polder" ? 3 : 2);
    for (let index = 0; index < maxCandidates && placed < count; index += 1) {
      const radius = Math.sqrt(hash(index, 1)) * usableRadius;
      const angle = hash(index, 2) * Math.PI * 2;
      const x = center[0] + Math.cos(angle) * radius;
      const z = center[1] + Math.sin(angle) * radius;
      const cell = `${Math.floor(x)}:${Math.floor(z)}`;
      let groundY = 0;
      let dutchStyle: DutchPolderVegetationStyle | null = null;
      let dutchSample: LandscapeSample | null = null;
      if (profile === "dutch-polder") {
        dutchSample = dutchPolderSampler.sample(x, z);
        dutchStyle = sampleDutchPolderVegetation(dutchSample, x, z);
        if (!dutchStyle) continue;
        const coverPieceId = dutchPolderCoverPieceIdAt(x, z);
        if (!coverPieceId) continue;
        if (hiddenPieceIds?.has(coverPieceId)) {
          continue;
        }
        groundY = dutchPolderVisualTopAt(x, z) + 0.025;
        const occupied = dutchBlockers.get(cell)?.some(([bottom, top]) =>
          bottom >= groundY - 1.5 && bottom <= groundY + 0.75 && top >= groundY + 0.04
        );
        if (occupied || hash(index, 7) > dutchStyle.keep) continue;
      } else if (blocked.has(cell) || !ground.has(cell)) {
        continue;
      }
      // Trodden routes carry little grass; the verge just off them carries the
      // most — grass grows thickest exactly where feet do not fall.
      let edge = 0;
      let height: number;
      let width: number;
      if (dutchStyle) {
        height = dutchStyle.height[0] + hash(index, 3) * (dutchStyle.height[1] - dutchStyle.height[0]);
        width = dutchStyle.width[0] + hash(index, 4) * (dutchStyle.width[1] - dutchStyle.width[0]);
      } else {
        const traffic = sampleVikingGroundTraffic(x, z);
        let edgeTraffic = traffic;
        for (const [ox, oz] of EDGE_RING) {
          edgeTraffic = Math.max(edgeTraffic, sampleVikingGroundTraffic(x + ox, z + oz));
        }
        const onPath = smoothstep(0.3, 0.56, traffic);
        edge = Math.min(1, Math.max(0, edgeTraffic - traffic) * 1.7);
        const keep = Math.min(1.1, 0.6 * (1 - onPath * 0.94) + edge * 0.8);
        if (hash(index, 7) > keep) continue;
        const edgeBoost = 1 + edge * 0.45;
        height = (0.42 + hash(index, 3) * 0.5) * edgeBoost;
        width = 0.78 + hash(index, 4) * 0.6;
      }
      euler.set(0, hash(index, 5) * Math.PI * 2, 0);
      quaternion.setFromEuler(euler);
      position.set(x, groundY, z);
      scale.set(width, height, width);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(placed, matrix);
      phases[placed] = hash(index, 6) * Math.PI * 2;
      // Per-tuft colour: bias drier the further from the lush verges (less
      // grass keep-probability → drier), so worn ground looks parched.
      tints[placed] = dutchStyle
        ? Math.min(1, dutchStyle.dryness + (hash(index, 8) - 0.5) * 0.22)
        : Math.min(1, hash(index, 8) * (1.15 - edge * 0.5));
      kinds[placed] = dutchStyle?.kind ?? 0;
      if (dutchStyle?.kind === 0 && dutchSample) {
        const flowerPatch = dutchPolderVegetationPatchNoise(x, z, 41);
        const wetLine = dutchSample.groundKind === "bank" || dutchSample.groundKind === "terrace";
        const inNaturalPatch = wetLine ? flowerPatch > 0.4 : flowerPatch > 0.7;
        if (inNaturalPatch && hash(index, 14) < dutchStyle.flowerChance) {
          flowers[placed] = 1 + Math.floor(hash(index, 15) * 3);
        }
      }
      placed += 1;
    }
    mesh.count = placed;
    mesh.instanceMatrix.needsUpdate = true;
    geometry.setAttribute("aPhase", new InstancedBufferAttribute(phases, 1));
    geometry.setAttribute("aTint", new InstancedBufferAttribute(tints, 1));
    geometry.setAttribute("aKind", new InstancedBufferAttribute(kinds, 1));
    geometry.setAttribute("aFlower", new InstancedBufferAttribute(flowers, 1));
    // The bounding sphere spans the whole field (instances are not individually
    // culled), so it never wrongly disappears at the screen edge.
    mesh.frustumCulled = false;
  }, [pieces, count, worldRadius, center, geometry, profile, hiddenPieceIds]);

  useFrame((state) => {
    const uniforms = material.uniforms;
    uniforms.uTime.value = state.clock.elapsedTime;
    uniforms.uCamera.value.copy(camera.position);
    uniforms.uWind.value = windState.strength * windScale;
    // Device pixels, not CSS pixels: the adaptive render scale moves the
    // drawing buffer, and the minimum blade width has to follow it.
    const canvas = state.gl.domElement;
    uniforms.uViewport.value.set(canvas.width, canvas.height);
    const night = nightRef.current ?? 0;
    // Трава не освещается сценой, поэтому свет дня ей задаётся вручную — и
    // не одной яркостью, а ЦВЕТОМ: днём белый, в сумерках тёплый, ночью
    // холодный и тёмный. Плюс блик на кончиках, который живёт только когда
    // светило низко, — закатный и лунный.
    const lit = 1 - night * 0.88;
    const dusk = Math.max(0, 1 - Math.abs(night - 0.45) / 0.4);
    const moon = Math.max(0, (night - 0.6) / 0.4);
    uniforms.uLightColor.value.setRGB(
      lit * (1 + 0.26 * dusk),
      lit * (1 - 0.06 * dusk + 0.04 * moon),
      lit * (1 - 0.19 * dusk + 0.24 * moon),
    );
    uniforms.uSheen.value.setRGB(
      0.10 * dusk + 0.020 * moon,
      0.07 * dusk + 0.026 * moon,
      0.035 * dusk + 0.048 * moon,
    );
  });

  // Dev-хук: минимальная экранная ширина стебля правится на живой сцене, чтобы
  // судить рябь глазами на настоящем GPU, а не по офлайн-замерам.
  // `__mamGrassMinPixels(0)` — правка выключена, `(1.5)` — как сейчас.
  useEffect(() => {
    if (process.env.NODE_ENV === "production") {
      return;
    }
    const scope = window as typeof window & {
      __mamGrassMinPixels?: (pixels: number) => number;
    };
    const setMinPixels = (pixels: number) => {
      material.uniforms.uMinBladePixels.value = pixels;
      return pixels;
    };
    scope.__mamGrassMinPixels = setMinPixels;
    return () => {
      if (scope.__mamGrassMinPixels === setMinPixels) {
        delete scope.__mamGrassMinPixels;
      }
    };
  }, [material]);

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
