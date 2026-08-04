import type {
  BreakableMaterial,
  BreakablePieceDefinition,
  SceneVector3,
  TreeVisualDefinition,
  TreeVisualKind,
} from "./destructionScene.ts";

export interface ProceduralRootPath {
  readonly id: string;
  readonly parentId?: string;
  readonly points: readonly SceneVector3[];
  readonly diameters: readonly number[];
}

export interface ProceduralWoodTubeProfile {
  readonly bendRatio: number;
  readonly tipScale: number;
  readonly longitudinalSegments: number;
}

/**
 * One connected tube profile per woody gameplay member. Longitudinal segments
 * bend the surface without introducing separate open-ended mesh sections.
 *
 * Стриженая ива живёт по другому закону, чем дерево со свободной кроной: её
 * ствол за два метра почти не сбегает (сбег съеден срезкой), а годичный хлыст,
 * наоборот, уходит в тонкий кончик и заметнее выгибается под собственным весом.
 */
export function proceduralWoodTubeProfile(
  role: "trunk" | "branch",
  kind?: TreeVisualKind,
): ProceduralWoodTubeProfile {
  if (kind === "willow") {
    return role === "trunk"
      ? { bendRatio: 0.03, tipScale: 0.88, longitudinalSegments: 6 }
      : { bendRatio: 0.075, tipScale: 0.4, longitudinalSegments: 6 };
  }
  if (kind === "pine") {
    // Сосна сбегает сильно: ствол в двадцать метров к вершине ужимается почти
    // вдвое, а сук — тонкая изогнутая рука.
    return role === "trunk"
      ? { bendRatio: 0.02, tipScale: 0.52, longitudinalSegments: 6 }
      : { bendRatio: 0.06, tipScale: 0.42, longitudinalSegments: 6 };
  }
  return role === "trunk"
    ? { bendRatio: 0.022, tipScale: 0.64, longitudinalSegments: 6 }
    : { bendRatio: 0.055, tipScale: 0.44, longitudinalSegments: 6 };
}

/** One rendered rod of a pollard whip bunch. Lengths are metres. */
export interface WillowWhipRod {
  readonly start: SceneVector3;
  /** Unit vector along the rod. */
  readonly direction: SceneVector3;
  readonly length: number;
  readonly diameter: number;
  /** 0 — сам авторский хлыст, 1..2 — соседи по гнезду, 3 — развилка на нём. */
  readonly index: number;
}

function orthonormalBasis(
  direction: SceneVector3,
): readonly [SceneVector3, SceneVector3] {
  const reference: SceneVector3 = Math.abs(direction[1]) > 0.94
    ? [1, 0, 0]
    : [0, 1, 0];
  const right: SceneVector3 = [
    direction[1] * reference[2] - direction[2] * reference[1],
    direction[2] * reference[0] - direction[0] * reference[2],
    direction[0] * reference[1] - direction[1] * reference[0],
  ];
  const rightLength = Math.max(1e-5, Math.hypot(...right));
  const unitRight: SceneVector3 = [
    right[0] / rightLength,
    right[1] / rightLength,
    right[2] / rightLength,
  ];
  return [
    unitRight,
    [
      unitRight[1] * direction[2] - unitRight[2] * direction[1],
      unitRight[2] * direction[0] - unitRight[0] * direction[2],
      unitRight[0] * direction[1] - unitRight[1] * direction[0],
    ],
  ];
}

function unit(vector: SceneVector3): SceneVector3 {
  const length = Math.max(1e-5, Math.hypot(...vector));
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

/**
 * Сук сосны не заканчивается прутом: в наружной трети он раздаёт короткие
 * восходящие побеги, и уже на них сидят подушки хвои. Без этих побегов сук
 * читается голой спицей с шаром на конце — «ёлкой из палок».
 */
export function coniferLimbRods(
  start: SceneVector3,
  rawDirection: SceneVector3,
  length: number,
  diameter: number,
  seed: number,
): readonly WillowWhipRod[] {
  const direction = unit(rawDirection);
  const [right, up] = orthonormalBasis(direction);
  const rods: WillowWhipRod[] = [
    { start, direction, length, diameter, index: 0 },
  ];
  // Побег ОДИН: два восходящих побега на каждом суку превращали крону в
  // частокол торчащих палок.
  for (let shoot = 1; shoot <= 1; shoot += 1) {
    const along = 0.52 + rootNoise(seed, 300 + shoot) * 0.3;
    const swing = rootNoise(seed, 310 + shoot) * Math.PI * 2;
    // Побег уходит ВВЕРХ от сука: у сосны крона держится подушками поверх
    // почти горизонтальных сучьев, и это подъём делает силуэт слоистым.
    const rise = 0.28 + rootNoise(seed, 320 + shoot) * 0.3;
    const tangent: SceneVector3 = [
      right[0] * Math.cos(swing) + up[0] * Math.sin(swing),
      right[1] * Math.cos(swing) + up[1] * Math.sin(swing),
      right[2] * Math.cos(swing) + up[2] * Math.sin(swing),
    ];
    rods.push({
      start: [
        start[0] + direction[0] * length * along,
        start[1] + direction[1] * length * along,
        start[2] + direction[2] * length * along,
      ],
      direction: unit([
        direction[0] + tangent[0] * 0.32,
        direction[1] + tangent[1] * 0.32 + rise,
        direction[2] + tangent[2] * 0.32,
      ]),
      length: length * (0.24 + rootNoise(seed, 330 + shoot) * 0.22),
      diameter: diameter * (0.5 + rootNoise(seed, 340 + shoot) * 0.18),
      index: shoot,
    });
  }
  return rods;
}

/**
 * Из головы бьёт не прут, а ГНЕЗДО прутьев: спящие почки сидят на наплыве
 * кучей, и побеги уходят вверх пучками по два-три, почти параллельно, с
 * развилкой в верхней трети. Один авторский хлыст — одно такое гнездо, поэтому
 * плотность кроны (референс: пятьдесят-восемьдесят прутьев на дереве) берётся
 * рендером, а не умножением разрушаемых тел.
 */
export function willowWhipFan(
  start: SceneVector3,
  rawDirection: SceneVector3,
  length: number,
  diameter: number,
  seed: number,
): readonly WillowWhipRod[] {
  const direction = unit(rawDirection);
  const [right, up] = orthonormalBasis(direction);
  const rods: WillowWhipRod[] = [
    { start, direction, length, diameter, index: 0 },
  ];

  for (let sibling = 1; sibling <= 2; sibling += 1) {
    const swing = rootNoise(seed, 200 + sibling) * Math.PI * 2;
    // Расхождение в гнезде мелкое: по фото ряда в Вассенаре пучок расходится с
    // полууглом около 11°, крайние прутья — до 20°. Внутри гнезда — единицы
    // градусов, иначе снова получается фейерверк.
    const spread = 0.03 + rootNoise(seed, 210 + sibling) * 0.055;
    const tangent: SceneVector3 = [
      (right[0] * Math.cos(swing) + up[0] * Math.sin(swing)),
      (right[1] * Math.cos(swing) + up[1] * Math.sin(swing)),
      (right[2] * Math.cos(swing) + up[2] * Math.sin(swing)),
    ];
    const offset = diameter * (0.9 + rootNoise(seed, 220 + sibling) * 1.4);
    rods.push({
      start: [
        start[0] + tangent[0] * offset,
        start[1] + tangent[1] * offset,
        start[2] + tangent[2] * offset,
      ],
      direction: unit([
        direction[0] + tangent[0] * spread,
        direction[1] + tangent[1] * spread,
        direction[2] + tangent[2] * spread,
      ]),
      length: length * (0.64 + rootNoise(seed, 230 + sibling) * 0.28),
      diameter: diameter * (0.72 + rootNoise(seed, 240 + sibling) * 0.2),
      index: sibling,
    });
  }

  const forkAt = 0.56 + rootNoise(seed, 250) * 0.18;
  const forkSwing = rootNoise(seed, 260) * Math.PI * 2;
  const forkSpread = 0.14 + rootNoise(seed, 270) * 0.16;
  const forkTangent: SceneVector3 = [
    right[0] * Math.cos(forkSwing) + up[0] * Math.sin(forkSwing),
    right[1] * Math.cos(forkSwing) + up[1] * Math.sin(forkSwing),
    right[2] * Math.cos(forkSwing) + up[2] * Math.sin(forkSwing),
  ];
  rods.push({
    start: [
      start[0] + direction[0] * length * forkAt,
      start[1] + direction[1] * length * forkAt,
      start[2] + direction[2] * length * forkAt,
    ],
    direction: unit([
      direction[0] + forkTangent[0] * forkSpread,
      direction[1] + forkTangent[1] * forkSpread,
      direction[2] + forkTangent[2] * forkSpread,
    ]),
    length: length * (1 - forkAt) * (0.62 + rootNoise(seed, 280) * 0.3),
    diameter: diameter * 0.58,
    index: 3,
  });
  return rods;
}

export function treeWoodSpecies(kind: TreeVisualKind): number {
  return kind === "birch" ? 1 : kind === "pine" ? 2 : 0;
}

function treeVisualTextNoise(value: string): number {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0) / 0xffffffff;
}

/** Stable bark offset that survives piece -> remnant -> shard transitions. */
export function treeBarkPhase(seed: number, sourceId: string): number {
  const identityNoise = treeVisualTextNoise(sourceId);
  const value = Math.sin(
    (seed + identityNoise * 113) * 127.1 + 23 * 311.7,
  ) * 43758.5453;
  return value - Math.floor(value);
}

export function usesTreeBarkVisual(
  material: BreakableMaterial,
  visual: TreeVisualDefinition | undefined,
): boolean {
  return material === "wood" && visual !== undefined && visual.role !== "foliage";
}

export const detachedTreeFoliageThickness = 0.028;

export function detachedTreeFoliageSize(
  size: SceneVector3,
): SceneVector3 {
  return [
    size[0] * 0.82,
    Math.min(detachedTreeFoliageThickness, size[1] * 0.08),
    size[2] * 0.82,
  ];
}

/**
 * Once a crown section loses its woody parent it becomes leaf litter, not a
 * rigid three-dimensional canopy block. It starts horizontal, falls under
 * gravity and settles as a thin porous patch on the surface below.
 */
export function flattenDetachedTreeFoliage(
  piece: BreakablePieceDefinition,
): BreakablePieceDefinition {
  if (piece.treeVisual?.role !== "foliage") {
    return piece;
  }
  const size = detachedTreeFoliageSize(piece.size);
  return {
    ...piece,
    shape: "panel",
    size,
    rotation: [0, piece.rotation?.[1] ?? 0, 0],
    volume: Math.min(
      piece.volume ?? Number.POSITIVE_INFINITY,
      size[0] * size[1] * size[2] * 0.16,
    ),
  };
}

/** Diameter of the low-poly knot that seals two tapered root sections. */
export function proceduralRootJointDiameter(
  incomingDiameter: number,
  outgoingDiameter: number,
): number {
  return Math.max(incomingDiameter * 0.78, outgoingDiameter * 1.08);
}

export const proceduralPineNeedleProfile = {
  bladeShape: "tapered-lance",
  boughCount: 11,
  stationsPerBough: 9,
  needlesPerStation: 7,
  minimumLength: 0.07,
  lengthVariation: 0.04,
  minimumHalfWidth: 0.006,
  halfWidthVariation: 0.0035,
} as const;

function rootNoise(seed: number, salt: number): number {
  const value = Math.sin(seed * 127.1 + salt * 311.7) * 43758.5453;
  return value - Math.floor(value);
}

/**
 * Local-space root network around a trunk base. Primary roots flare out,
 * curve, taper and dive below y=0; lateral roots fork from them and finish
 * deeper still, keeping every visible end buried in the terrain.
 */
export function buildProceduralRootNetwork(
  seed: number,
  trunkDiameter: number,
  kind: TreeVisualKind,
): readonly ProceduralRootPath[] {
  const paths: ProceduralRootPath[] = [];
  const baseCount = kind === "oak" ? 6 : kind === "pine" ? 5 : 4;
  const rootCount = baseCount + Math.floor(rootNoise(seed, 1) * 2);
  const speciesLength = kind === "oak" ? 2.15 : kind === "pine" ? 1.9 : 1.65;

  for (let root = 0; root < rootCount; root += 1) {
    const angle =
      (root / rootCount) * Math.PI * 2 +
      (rootNoise(seed, 10 + root) - 0.5) * 0.58;
    const radialX = Math.cos(angle);
    const radialZ = Math.sin(angle);
    const tangentX = -radialZ;
    const tangentZ = radialX;
    const length =
      trunkDiameter *
      (speciesLength + rootNoise(seed, 30 + root) * 1.15);
    const curve =
      (rootNoise(seed, 50 + root) - 0.5) * length * 0.26;
    const terminalDrop =
      trunkDiameter * (0.34 + rootNoise(seed, 70 + root) * 0.24);
    const points: SceneVector3[] = [
      [
        radialX * trunkDiameter * 0.08,
        trunkDiameter * 0.025,
        radialZ * trunkDiameter * 0.08,
      ],
      [
        radialX * length * 0.22 + tangentX * curve * 0.55,
        trunkDiameter * 0.012,
        radialZ * length * 0.22 + tangentZ * curve * 0.55,
      ],
      [
        radialX * length * 0.48 + tangentX * curve,
        -trunkDiameter * (0.025 + rootNoise(seed, 90 + root) * 0.035),
        radialZ * length * 0.48 + tangentZ * curve,
      ],
      [
        radialX * length * 0.73 + tangentX * curve * 0.68,
        -trunkDiameter * (0.14 + rootNoise(seed, 100 + root) * 0.08),
        radialZ * length * 0.73 + tangentZ * curve * 0.68,
      ],
      [
        radialX * length,
        -terminalDrop,
        radialZ * length,
      ],
    ];
    const primaryId = `root:${root}`;
    paths.push({
      id: primaryId,
      points,
      diameters: [
        trunkDiameter * 0.46,
        trunkDiameter * 0.34,
        trunkDiameter * 0.24,
        trunkDiameter * 0.14,
        trunkDiameter * 0.04,
      ],
    });

    const forkCount = 1 + (rootNoise(seed, 110 + root) > 0.72 ? 1 : 0);
    for (let fork = 0; fork < forkCount; fork += 1) {
      const sign = fork === 0 ? (root % 2 === 0 ? -1 : 1) : -1;
      const forkAngle =
        angle +
        sign * (0.48 + rootNoise(seed, 130 + root * 2 + fork) * 0.58);
      const forkLength =
        length * (0.34 + rootNoise(seed, 150 + root * 2 + fork) * 0.24);
      const forkStart = points[2];
      const forkEnd: SceneVector3 = [
        forkStart[0] + Math.cos(forkAngle) * forkLength,
        forkStart[1] -
          trunkDiameter *
            (0.3 + rootNoise(seed, 170 + root * 2 + fork) * 0.18),
        forkStart[2] + Math.sin(forkAngle) * forkLength,
      ];
      const forkMiddle: SceneVector3 = [
        (forkStart[0] + forkEnd[0]) * 0.5 +
          Math.cos(forkAngle + Math.PI / 2) * forkLength * 0.08,
        forkStart[1] - trunkDiameter * 0.08,
        (forkStart[2] + forkEnd[2]) * 0.5 +
          Math.sin(forkAngle + Math.PI / 2) * forkLength * 0.08,
      ];
      paths.push({
        id: `${primaryId}:fork:${fork}`,
        parentId: primaryId,
        points: [forkStart, forkMiddle, forkEnd],
        diameters: [
          trunkDiameter * 0.19,
          trunkDiameter * 0.13,
          trunkDiameter * 0.03,
        ],
      });
    }
  }
  return paths;
}

/** Oak and birch get the procedural visual skin; pine keeps its old skin. */
export function isEnhancedTreePiece(piece: BreakablePieceDefinition): boolean {
  return piece.treeVisual !== undefined;
}

export function isProceduralVegetationPiece(
  piece: BreakablePieceDefinition,
): boolean {
  return isEnhancedTreePiece(piece) || piece.vegetationVisual !== undefined;
}

export function isProceduralFoliagePiece(
  piece: BreakablePieceDefinition,
): boolean {
  return piece.treeVisual?.role === "foliage" || piece.vegetationVisual !== undefined;
}

export function usesFoliageDebrisGeometry(
  material: BreakableMaterial,
  piece?: BreakablePieceDefinition,
): boolean {
  return material === "foliage" || Boolean(piece && isProceduralFoliagePiece(piece));
}

/** Stable id shared by every proxy emitted for one procedural tree instance. */
export function treeVisualRootId(
  piece: BreakablePieceDefinition,
): string | null {
  const visual = piece.treeVisual;
  if (!visual) {
    return null;
  }
  const suffix = `:${visual.localId}`;
  return piece.id.endsWith(suffix)
    ? piece.id.slice(0, -suffix.length)
    : `${piece.id}:tree`;
}

// The parent -> children graph depends only on the authored piece list, which
// is stable for the lifetime of a scene, while expansion runs on every settle
// (several times per hit). Rebuilding the graph each call cost ~2 ms per
// settle on a 20k-piece map.
const treeChildrenCache = new WeakMap<
  readonly BreakablePieceDefinition[],
  ReadonlyMap<string, readonly string[]>
>();

function treeChildrenByParent(
  pieces: readonly BreakablePieceDefinition[],
): ReadonlyMap<string, readonly string[]> {
  const cached = treeChildrenCache.get(pieces);
  if (cached) {
    return cached;
  }

  const childrenByParent = new Map<string, string[]>();
  for (const piece of pieces) {
    const visual = piece.treeVisual;
    const rootId = treeVisualRootId(piece);
    if (!visual?.parentLocalId || !rootId) {
      continue;
    }
    const parentId = `${rootId}:${visual.parentLocalId}`;
    const children = childrenByParent.get(parentId);
    if (children) {
      children.push(piece.id);
    } else {
      childrenByParent.set(parentId, [piece.id]);
    }
  }
  treeChildrenCache.set(pieces, childrenByParent);
  return childrenByParent;
}

/**
 * A tree is a directed support graph, not a bag of nearby pieces. If a woody
 * parent comes free, every branch and foliage section growing from it must
 * come free as well. Expanding the broken set here keeps that rule independent
 * of broad structural contact heuristics used by buildings.
 */
export function expandBrokenTreeDescendants(
  pieces: readonly BreakablePieceDefinition[],
  brokenPieceIds: ReadonlySet<string>,
): ReadonlySet<string> {
  const childrenByParent = treeChildrenByParent(pieces);

  const expanded = new Set(brokenPieceIds);
  const pending = [...brokenPieceIds];
  for (let index = 0; index < pending.length; index += 1) {
    const children = childrenByParent.get(pending[index]);
    if (!children) {
      continue;
    }
    for (const childId of children) {
      if (expanded.has(childId)) {
        continue;
      }
      expanded.add(childId);
      pending.push(childId);
    }
  }
  return expanded;
}
