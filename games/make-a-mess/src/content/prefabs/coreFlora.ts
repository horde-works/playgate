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
  kind: TreeKind,
  treeSeed: number,
  id: string,
  parentLocalId: string,
  clumpSeed: number,
  center: readonly [number, number, number],
  size: number,
  palette: readonly string[],
  volume: number,
): FloraPiece {
  const stretchX = 0.8 + rand(clumpSeed, 1) * 0.55;
  const stretchY = 0.62 + rand(clumpSeed, 2) * 0.42;
  const stretchZ = 0.8 + rand(clumpSeed, 3) * 0.55;
  return {
    id,
    material: "foliage",
    shape: "panel",
    position: center,
    rotation: [
      (rand(clumpSeed, 4) - 0.5) * 0.5,
      rand(clumpSeed, 5) * Math.PI,
      (rand(clumpSeed, 6) - 0.5) * 0.5,
    ],
    size: [size * stretchX, size * stretchY, size * stretchZ],
    color: palette[Math.floor(rand(clumpSeed, 7) * palette.length)],
    bearsLoad: false,
    // `volume` is the porous fill fraction. Scaling it by the authored lobe
    // size keeps saplings light instead of giving a 30 cm crown the mass of a
    // full-grown tree section.
    volume: volume * size * size * size,
    sideAttachmentReach: 0.95,
    contactBoxes: [{
      position: center,
      size: [size * 0.7, size * 0.7, size * 0.7],
    }],
    treeVisual: {
      kind,
      seed: treeSeed,
      role: "foliage",
      localId: id,
      parentLocalId,
    },
  };
}

type FloraVector = readonly [number, number, number];

function addVector(left: FloraVector, right: FloraVector): FloraVector {
  return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
}

function scaleVector(vector: FloraVector, scale: number): FloraVector {
  return [vector[0] * scale, vector[1] * scale, vector[2] * scale];
}

function normalizeVector(vector: FloraVector): FloraVector {
  const length = Math.max(0.0001, Math.hypot(...vector));
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

function directionFromAngles(yaw: number, tilt: number): FloraVector {
  return [
    Math.cos(yaw) * Math.sin(tilt),
    Math.cos(tilt),
    Math.sin(yaw) * Math.sin(tilt),
  ];
}

function branchPiece(
  kind: TreeKind,
  treeSeed: number,
  id: string,
  parentLocalId: string,
  start: FloraVector,
  rawDirection: FloraVector,
  length: number,
  diameter: number,
  color: string,
): FloraPiece {
  const direction = normalizeVector(rawDirection);
  const center = addVector(start, scaleVector(direction, length / 2));
  const yaw = Math.atan2(direction[2], direction[0]);
  const tilt = Math.acos(Math.max(-1, Math.min(1, direction[1])));
  const jointSize = Math.max(diameter * 2.6, length * 0.12);
  return {
    id,
    material: "wood",
    shape: "cylinder",
    position: center,
    rotation: [0, -yaw, -tilt],
    size: [diameter, length, diameter],
    color,
    carriesAttachments: true,
    attachmentSupportMode: "cable",
    sideAttachmentReach: Math.max(0.5, diameter * 3.2),
    contactBoxes: [
      { position: start, size: [jointSize, jointSize, jointSize] },
      {
        position: center,
        size: [
          Math.max(jointSize, Math.abs(direction[0]) * length * 0.78),
          Math.max(jointSize, Math.abs(direction[1]) * length * 0.78),
          Math.max(jointSize, Math.abs(direction[2]) * length * 0.78),
        ],
      },
    ],
    treeVisual: {
      kind,
      seed: treeSeed,
      role: "branch",
      localId: id,
      parentLocalId,
    },
  };
}

/** A broadleaf tree (oak-like): stout trunk, spreading branches, lumpy crown. */
export function propOak(options: TreeOptions = {}): FloraPiece[] {
  const seed = options.seed ?? 1;
  const s = options.scale ?? 1;
  const trunkHeight = (2.6 + rand(seed, 10) * 0.9) * s;
  const lean = (rand(seed, 11) - 0.5) * 0.14;
  const leanYaw = rand(seed, 12) * Math.PI * 2;
  const trunkRotation: readonly [number, number, number] = [
    Math.sin(leanYaw) * lean,
    0,
    -Math.cos(leanYaw) * lean,
  ];
  const trunkAxis: readonly [number, number, number] = [
    -Math.sin(trunkRotation[2]),
    Math.cos(trunkRotation[0]) * Math.cos(trunkRotation[2]),
    Math.sin(trunkRotation[0]) * Math.cos(trunkRotation[2]),
  ];
  const pieces: FloraPiece[] = [
    {
      id: "trunk",
      material: "wood",
      shape: "cylinder",
      position: [
        trunkAxis[0] * trunkHeight * 0.5,
        trunkAxis[1] * trunkHeight * 0.5,
        trunkAxis[2] * trunkHeight * 0.5,
      ],
      rotation: trunkRotation,
      size: [(0.4 + rand(seed, 13) * 0.14) * s, trunkHeight, (0.4 + rand(seed, 13) * 0.14) * s],
      color: rand(seed, 14) > 0.5 ? "#4d392d" : "#54402f",
      carriesAttachments: true,
      attachmentSupportMode: "cable",
      weathering: 0.35,
      contactBoxes: [{ position: [0, trunkHeight / 2, 0], size: [0.34 * s, trunkHeight, 0.34 * s] }],
      treeVisual: { kind: "oak", seed, role: "trunk", localId: "trunk" },
    },
  ];
  const branchCount = 6 + Math.floor(rand(seed, 15) * 3);
  for (let branch = 0; branch < branchCount; branch += 1) {
    const yaw =
      branch * 2.399963229728653 +
      (rand(seed, 16 + branch) - 0.5) * 0.65;
    const tilt = 0.7 + rand(seed, 20 + branch) * 0.38;
    const length = (1.0 + rand(seed, 24 + branch) * 0.72) * s;
    const direction = directionFromAngles(yaw, tilt);
    const attachHeight = trunkHeight * (
      0.53 +
      (branch / Math.max(1, branchCount - 1)) * 0.37 +
      (rand(seed, 60 + branch) - 0.5) * 0.028
    );
    const branchAttach = scaleVector(trunkAxis, attachHeight);
    const primaryId = `branch:p:${branch}`;
    pieces.push(
      branchPiece(
        "oak",
        seed,
        primaryId,
        "trunk",
        branchAttach,
        direction,
        length,
        (0.115 + rand(seed, 66 + branch) * 0.035) * s,
        "#4a372b",
      ),
    );
    const primaryTip = addVector(branchAttach, scaleVector(direction, length));
    pieces.push(
      clump(
        "oak",
        seed,
        `leaf:p:${branch}`,
        primaryId,
        seed * 7 + branch * 19 + 1,
        primaryTip,
        (0.72 + rand(seed, 28 + branch) * 0.24) * s,
        CLUMP_GREENS,
        0.2,
      ),
    );

    for (let fork = 0; fork < 2; fork += 1) {
      const forkT = 0.48 + fork * 0.27;
      const forkStart = addVector(
        branchAttach,
        scaleVector(direction, length * forkT),
      );
      const forkYaw =
        yaw +
        (fork === 0 ? -1 : 1) *
          (0.46 + rand(seed, 80 + branch * 2 + fork) * 0.42);
      const forkTilt = 0.65 + rand(seed, 100 + branch * 2 + fork) * 0.38;
      const forkDirection = directionFromAngles(forkYaw, forkTilt);
      const forkLength =
        (0.48 + rand(seed, 120 + branch * 2 + fork) * 0.48) * s;
      const forkId = `branch:s:${branch}:${fork}`;
      pieces.push(
        branchPiece(
          "oak",
          seed,
          forkId,
          primaryId,
          forkStart,
          forkDirection,
          forkLength,
          (0.062 + rand(seed, 140 + branch * 2 + fork) * 0.022) * s,
          "#49362a",
        ),
      );
      const forkTip = addVector(
        forkStart,
        scaleVector(forkDirection, forkLength),
      );
      pieces.push(
        clump(
          "oak",
          seed,
          `leaf:s:${branch}:${fork}`,
          forkId,
          seed * 7 + branch * 19 + fork + 7,
          forkTip,
          (0.56 + rand(seed, 160 + branch * 2 + fork) * 0.23) * s,
          CLUMP_GREENS,
          0.16,
        ),
      );
    }
  }
  // Three modest trunk-carried cores close the centre without becoming one
  // giant falling body when the crown is hit.
  for (let core = 0; core < 3; core += 1) {
    const height = trunkHeight * (0.7 + core * 0.1);
    pieces.push(
      clump(
        "oak",
        seed,
        `leaf:core:${core}`,
        "trunk",
        seed * 7 + 90 + core,
        [
          trunkAxis[0] * height + (rand(seed, 180 + core) - 0.5) * 0.38 * s,
          trunkAxis[1] * height + (0.28 + core * 0.16) * s,
          trunkAxis[2] * height + (rand(seed, 190 + core) - 0.5) * 0.38 * s,
        ],
        (0.82 + rand(seed, 200 + core) * 0.2) * s,
        CLUMP_GREENS,
        0.19,
      ),
    );
  }
  return pieces;
}

/** A slender birch: pale trunk with ascending layered branch pairs. */
export function propBirch(options: TreeOptions = {}): FloraPiece[] {
  const seed = options.seed ?? 1;
  const s = options.scale ?? 1;
  const trunkHeight = (3.4 + rand(seed, 10) * 1.1) * s;
  const leanX = (rand(seed, 11) - 0.5) * 0.1;
  const leanZ = (rand(seed, 12) - 0.5) * 0.1;
  const trunkRotation: FloraVector = [leanX, 0, leanZ];
  const trunkAxis: FloraVector = [
    -Math.sin(leanZ),
    Math.cos(leanX) * Math.cos(leanZ),
    Math.sin(leanX) * Math.cos(leanZ),
  ];
  const pieces: FloraPiece[] = [
    {
      id: "trunk",
      material: "wood",
      shape: "cylinder",
      position: scaleVector(trunkAxis, trunkHeight / 2),
      rotation: trunkRotation,
      size: [0.22 * s, trunkHeight, 0.22 * s],
      color: "#c9c4b4",
      carriesAttachments: true,
      attachmentSupportMode: "cable",
      contactBoxes: [{ position: [0, trunkHeight / 2, 0], size: [0.22 * s, trunkHeight, 0.22 * s] }],
      treeVisual: { kind: "birch", seed, role: "trunk", localId: "trunk" },
    },
  ];
  const levelCount = 7 + Math.floor(rand(seed, 13) * 2);
  for (let level = 0; level < levelCount; level += 1) {
    const yaw =
      level * 2.399963229728653 +
      (rand(seed, 14 + level) - 0.5) * 0.5;
    const attachHeight = trunkHeight * (
      0.47 +
      (level / Math.max(1, levelCount - 1)) * 0.45 +
      (rand(seed, 24 + level) - 0.5) * 0.02
    );
    const attach = scaleVector(trunkAxis, attachHeight);
    const direction = directionFromAngles(
      yaw,
      0.56 + rand(seed, 34 + level) * 0.3,
    );
    const length = (0.55 + rand(seed, 44 + level) * 0.48) * s;
    const primaryId = `branch:p:${level}`;
    pieces.push(
      branchPiece(
        "birch",
        seed,
        primaryId,
        "trunk",
        attach,
        direction,
        length,
        (0.048 + rand(seed, 54 + level) * 0.018) * s,
        "#716957",
      ),
    );
    const primaryTip = addVector(attach, scaleVector(direction, length));
    pieces.push(
      clump(
        "birch",
        seed,
        `leaf:p:${level}`,
        primaryId,
        seed * 11 + level * 17,
        primaryTip,
        (0.52 + rand(seed, 64 + level) * 0.18) * s,
        BIRCH_GREENS,
        0.14,
      ),
    );

    const forkStart = addVector(attach, scaleVector(direction, length * 0.62));
    const forkDirection = directionFromAngles(
      yaw + (level % 2 === 0 ? -1 : 1) * (0.42 + rand(seed, 74 + level) * 0.3),
      0.68 + rand(seed, 84 + level) * 0.3,
    );
    const forkLength = (0.34 + rand(seed, 94 + level) * 0.34) * s;
    const forkId = `branch:s:${level}:0`;
    pieces.push(
      branchPiece(
        "birch",
        seed,
        forkId,
        primaryId,
        forkStart,
        forkDirection,
        forkLength,
        (0.026 + rand(seed, 104 + level) * 0.008) * s,
        "#6b6455",
      ),
      clump(
        "birch",
        seed,
        `leaf:s:${level}:0`,
        forkId,
        seed * 11 + level * 17 + 7,
        addVector(forkStart, scaleVector(forkDirection, forkLength)),
        (0.46 + rand(seed, 114 + level) * 0.16) * s,
        BIRCH_GREENS,
        0.12,
      ),
    );
  }
  pieces.push(
    clump(
      "birch",
      seed,
      "leaf:top",
      "trunk",
      seed * 11 + 95,
      addVector(scaleVector(trunkAxis, trunkHeight), [0, 0.28 * s, 0]),
      0.66 * s,
      BIRCH_GREENS,
      0.14,
    ),
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
      treeVisual: { kind: "pine", seed, role: "trunk", localId: "trunk" },
    },
  ];
  const tierCount = 7 + Math.floor(rand(seed, 14) * 2);
  const crownBase = trunkHeight * 0.32;
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
      size: [width, (0.82 + rand(seed, 52 + tier) * 0.38) * s, width * (0.82 + rand(seed, 58 + tier) * 0.3)],
      color: tier % 2 === 0 ? "#2c4030" : "#354c38",
      bearsLoad: false,
      volume: 0.3,
      sideAttachmentReach: 0.6,
      contactBoxes: [{ position: [0, y, 0], size: [0.6 * s, 0.5, 0.6 * s] }],
      treeVisual: {
        kind: "pine",
        seed,
        role: "foliage",
        localId: `tier:${tier}`,
        parentLocalId: "trunk",
      },
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
    treeVisual: {
      kind: "pine",
      seed,
      role: "foliage",
      localId: "tip",
      parentLocalId: "trunk",
    },
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
