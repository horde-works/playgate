import type { ScenePrefabPieceDefinition } from "../scenes/sceneContract.ts";

/**
 * Shared trees — irregular composite primitives instead of "box on a stick".
 *
 * A tree is ASSEMBLED the way a tree grows: a leaning trunk, real branch
 * members leaving it at believable heights, and 6–12 rotated foliage clumps of
 * different sizes and tones gathered where branches end (plus a crown core so
 * the silhouette never reads hollow). Every piece is an ordinary breakable
 * body: trunk grounded, branches attached to it, clumps attached to branches —
 * so chopping the trunk drops the whole crown.
 *
 * `seed` makes each instance unique; register several seeds as prefab variants
 * for document scenes, or call the builder directly in programmatic ones.
 */

export type FloraPiece = ScenePrefabPieceDefinition;

function rand(seed: number, salt: number): number {
  const value = Math.sin(seed * 127.1 + salt * 311.7) * 43758.5453;
  return value - Math.floor(value);
}

const CLUMP_GREENS = ["#2f4527", "#3a5230", "#44603a", "#2a3f24", "#4b6537", "#37503a"];
const BIRCH_GREENS = ["#4c6532", "#5a7239", "#446030", "#65793f", "#52683a"];

interface TreeOptions {
  readonly seed?: number;
  readonly scale?: number;
}

function clump(
  id: string,
  seed: number,
  center: readonly [number, number, number],
  size: number,
  palette: readonly string[],
  volume: number,
): FloraPiece {
  const stretchX = 0.8 + rand(seed, 1) * 0.55;
  const stretchY = 0.62 + rand(seed, 2) * 0.42;
  const stretchZ = 0.8 + rand(seed, 3) * 0.55;
  return {
    id,
    material: "foliage",
    shape: "panel",
    position: center,
    rotation: [
      (rand(seed, 4) - 0.5) * 0.5,
      rand(seed, 5) * Math.PI,
      (rand(seed, 6) - 0.5) * 0.5,
    ],
    size: [size * stretchX, size * stretchY, size * stretchZ],
    color: palette[Math.floor(rand(seed, 7) * palette.length)],
    bearsLoad: false,
    volume,
    sideAttachmentReach: 0.95,
    contactBoxes: [{
      position: center,
      size: [size * 0.7, size * 0.7, size * 0.7],
    }],
  };
}

/** A broadleaf tree (oak-like): stout trunk, spreading branches, lumpy crown. */
export function propOak(options: TreeOptions = {}): FloraPiece[] {
  const seed = options.seed ?? 1;
  const s = options.scale ?? 1;
  const trunkHeight = (2.6 + rand(seed, 10) * 0.9) * s;
  const lean = (rand(seed, 11) - 0.5) * 0.14;
  const leanYaw = rand(seed, 12) * Math.PI * 2;
  const pieces: FloraPiece[] = [
    {
      id: "trunk",
      material: "wood",
      shape: "cylinder",
      position: [Math.cos(leanYaw) * lean * trunkHeight * 0.5, trunkHeight / 2, Math.sin(leanYaw) * lean * trunkHeight * 0.5],
      rotation: [Math.sin(leanYaw) * lean, 0, -Math.cos(leanYaw) * lean],
      size: [(0.4 + rand(seed, 13) * 0.14) * s, trunkHeight, (0.4 + rand(seed, 13) * 0.14) * s],
      color: rand(seed, 14) > 0.5 ? "#4d392d" : "#54402f",
      carriesAttachments: true,
      attachmentSupportMode: "cable",
      weathering: 0.35,
      contactBoxes: [{ position: [0, trunkHeight / 2, 0], size: [0.34 * s, trunkHeight, 0.34 * s] }],
    },
  ];
  const branchCount = 3 + Math.floor(rand(seed, 15) * 2);
  const crownBase = trunkHeight * 0.82;
  for (let branch = 0; branch < branchCount; branch += 1) {
    const yaw = (branch / branchCount) * Math.PI * 2 + rand(seed, 16 + branch) * 1.1;
    const tilt = 0.65 + rand(seed, 20 + branch) * 0.45;
    const length = (1.0 + rand(seed, 24 + branch) * 0.7) * s;
    const bx = Math.cos(yaw) * Math.sin(tilt) * length * 0.5;
    const bz = Math.sin(yaw) * Math.sin(tilt) * length * 0.5;
    const by = crownBase + Math.cos(tilt) * length * 0.5;
    pieces.push({
      id: `branch:${branch}`,
      material: "wood",
      shape: "cylinder",
      position: [bx, by, bz],
      rotation: [0, -yaw, tilt],
      size: [0.13 * s, length, 0.13 * s],
      color: "#4a372b",
      carriesAttachments: true,
      attachmentSupportMode: "cable",
      sideAttachmentReach: 0.5,
      contactBoxes: [{ position: [bx, by, bz], size: [0.5 * s, length * 0.7, 0.5 * s] }],
    });
    // Foliage gathers at the branch tip: one big clump + one smaller shifted.
    const tipX = bx * 1.9;
    const tipZ = bz * 1.9;
    const tipY = crownBase + Math.cos(tilt) * length * 0.95;
    pieces.push(
      clump(`leaf:${branch}:a`, seed * 7 + branch * 13 + 1, [tipX, tipY, tipZ], (1.15 + rand(seed, 28 + branch) * 0.5) * s, CLUMP_GREENS, 0.3),
      clump(`leaf:${branch}:b`, seed * 7 + branch * 13 + 2, [
        tipX + (rand(seed, 32 + branch) - 0.5) * 0.55 * s,
        tipY + 0.16 * s + rand(seed, 36 + branch) * 0.22 * s,
        tipZ + (rand(seed, 40 + branch) - 0.5) * 0.55 * s,
      ], (0.7 + rand(seed, 44 + branch) * 0.45) * s, CLUMP_GREENS, 0.26),
    );
  }
  // Crown core: fills the middle so the canopy never looks hollow.
  const core = clump("leaf:core", seed * 7 + 90, [0, crownBase + 0.9 * s, 0], 1.5 * s, CLUMP_GREENS, 0.34);
  pieces.push(
    { ...core, bearsLoad: true, carriesAttachments: true, attachmentSupportMode: "cable" },
    clump("leaf:top", seed * 7 + 91, [
      (rand(seed, 50) - 0.5) * 0.6 * s,
      crownBase + 1.75 * s,
      (rand(seed, 51) - 0.5) * 0.6 * s,
    ], 1.0 * s, CLUMP_GREENS, 0.3),
  );
  return pieces;
}

/** A slender birch: pale trunk, loose airy clumps hung off short branches. */
export function propBirch(options: TreeOptions = {}): FloraPiece[] {
  const seed = options.seed ?? 1;
  const s = options.scale ?? 1;
  const trunkHeight = (3.4 + rand(seed, 10) * 1.1) * s;
  const pieces: FloraPiece[] = [
    {
      id: "trunk",
      material: "wood",
      shape: "cylinder",
      position: [0, trunkHeight / 2, 0],
      rotation: [(rand(seed, 11) - 0.5) * 0.1, 0, (rand(seed, 12) - 0.5) * 0.1],
      size: [0.22 * s, trunkHeight, 0.22 * s],
      color: "#c9c4b4",
      carriesAttachments: true,
      attachmentSupportMode: "cable",
      contactBoxes: [{ position: [0, trunkHeight / 2, 0], size: [0.22 * s, trunkHeight, 0.22 * s] }],
    },
    // Bark marks — the birch signature.
    ...[0.3, 0.55, 0.78].map((h, index): FloraPiece => ({
      id: `bark:${index}`,
      material: "wood",
      shape: "cylinder",
      position: [0, trunkHeight * h, 0],
      size: [0.24 * s, 0.1 * s, 0.24 * s],
      color: "#3c3a34",
      bearsLoad: false,
      sideAttachmentReach: 0.2,
      contactBoxes: [{ position: [0, trunkHeight * h, 0], size: [0.24 * s, 0.1 * s, 0.24 * s] }],
    })),
  ];
  const clumpCount = 4 + Math.floor(rand(seed, 13) * 3);
  for (let index = 0; index < clumpCount; index += 1) {
    const yaw = rand(seed, 14 + index) * Math.PI * 2;
    const spread = (0.35 + rand(seed, 20 + index) * 0.75) * s;
    const y = trunkHeight * (0.68 + rand(seed, 26 + index) * 0.34);
    pieces.push(
      clump(`leaf:${index}`, seed * 11 + index * 17, [
        Math.cos(yaw) * spread,
        y,
        Math.sin(yaw) * spread,
      ], (0.8 + rand(seed, 32 + index) * 0.5) * s, BIRCH_GREENS, 0.22),
    );
  }
  pieces.push(
    clump("leaf:top", seed * 11 + 95, [0, trunkHeight + 0.35 * s, 0], 0.95 * s, BIRCH_GREENS, 0.24),
  );
  return pieces;
}

/** A conifer: tall trunk, irregular rotated tiers shrinking to a tip. */
export function propPine(options: TreeOptions = {}): FloraPiece[] {
  const seed = options.seed ?? 1;
  const s = options.scale ?? 1;
  const trunkHeight = (5.0 + rand(seed, 10) * 2.4) * s;
  const pieces: FloraPiece[] = [
    {
      id: "trunk",
      material: "wood",
      shape: "cylinder",
      position: [0, trunkHeight / 2, 0],
      rotation: [(rand(seed, 11) - 0.5) * 0.06, 0, (rand(seed, 12) - 0.5) * 0.06],
      size: [0.42 * s, trunkHeight, 0.42 * s],
      color: rand(seed, 13) > 0.5 ? "#5a4432" : "#63503b",
      carriesAttachments: true,
      attachmentSupportMode: "cable",
      weathering: 0.4,
      contactBoxes: [{ position: [0, trunkHeight / 2, 0], size: [0.4 * s, trunkHeight, 0.4 * s] }],
    },
  ];
  const tierCount = 4 + Math.floor(rand(seed, 14) * 2);
  const crownBase = trunkHeight * 0.42;
  const crownSpan = trunkHeight - crownBase;
  for (let tier = 0; tier < tierCount; tier += 1) {
    const t = tier / (tierCount - 1);
    const y = crownBase + crownSpan * t;
    const width = (2.6 - t * 1.7) * s * (0.85 + rand(seed, 16 + tier) * 0.3);
    const offsetX = (rand(seed, 22 + tier) - 0.5) * 0.5 * s;
    const offsetZ = (rand(seed, 28 + tier) - 0.5) * 0.5 * s;
    pieces.push({
      id: `tier:${tier}`,
      material: "foliage",
      shape: "panel",
      position: [offsetX, y, offsetZ],
      rotation: [
        (rand(seed, 34 + tier) - 0.5) * 0.24,
        rand(seed, 40 + tier) * Math.PI,
        (rand(seed, 46 + tier) - 0.5) * 0.24,
      ],
      size: [width, (0.75 + rand(seed, 52 + tier) * 0.4) * s, width * (0.82 + rand(seed, 58 + tier) * 0.3)],
      color: tier % 2 === 0 ? "#2c4030" : "#354c38",
      bearsLoad: false,
      volume: 0.3,
      sideAttachmentReach: 0.6,
      contactBoxes: [{ position: [0, y, 0], size: [0.6 * s, 0.5, 0.6 * s] }],
    });
  }
  pieces.push({
    id: "tip",
    material: "foliage",
    shape: "panel",
    position: [0, trunkHeight + 0.5 * s, 0],
    rotation: [0, rand(seed, 64) * Math.PI, 0],
    size: [0.7 * s, 1.1 * s, 0.7 * s],
    color: "#2c4030",
    bearsLoad: false,
    volume: 0.28,
    sideAttachmentReach: 0.7,
    contactBoxes: [{ position: [0, trunkHeight + 0.5 * s, 0], size: [0.5 * s, 1.1 * s, 0.5 * s] }],
  });
  return pieces;
}

export type TreeKind = "oak" | "birch" | "pine";

export function propTree(kind: TreeKind, options: TreeOptions = {}): FloraPiece[] {
  switch (kind) {
    case "oak":
      return propOak(options);
    case "birch":
      return propBirch(options);
    default:
      return propPine(options);
  }
}
