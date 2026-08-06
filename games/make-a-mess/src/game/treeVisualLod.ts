export type TreeFoliageKind = "broadleaf" | "pine";
export type TreeFoliageLod = "near" | "mid" | "far";

export interface TreeFoliageLodProfile {
  readonly id: TreeFoliageLod;
  /** Minimum projected diameter of one authored foliage clump. */
  readonly minimumDiameterPx: number;
  /** Real broadleaf cards in the geometry, not vertices collapsed in a shader. */
  readonly broadleafCount: number;
  /** Fraction of the canonical 693-needle pine spray that is actually emitted. */
  readonly pineDensity: number;
  /** Preserves projected foliage area as card/needle count falls. */
  readonly elementScale: number;
}

/**
 * Screen-space foliage contract. Near gains detail over the former universal
 * 72-leaf mesh; mid/far buy the same silhouette with physically smaller
 * buffers. The phase bias below makes neighbouring clumps cross a boundary at
 * different moments, so a forest never pops as one wall.
 */
export const TREE_FOLIAGE_LODS: readonly TreeFoliageLodProfile[] = [
  {
    id: "near",
    minimumDiameterPx: 18,
    broadleafCount: 96,
    pineDensity: 1,
    elementScale: 0.9,
  },
  {
    id: "mid",
    minimumDiameterPx: 5.5,
    broadleafCount: 32,
    pineDensity: 0.34,
    elementScale: 1.28,
  },
  {
    id: "far",
    minimumDiameterPx: 0.45,
    broadleafCount: 10,
    pineDensity: 0.1,
    elementScale: 1.72,
  },
] as const;

export const TREE_FOLIAGE_CULL_INTERVAL_SECONDS = 0.18;

/** Projection-matrix form: valid for the perspective camera used by the game. */
export function projectedDiameterPixels(
  radius: number,
  cameraDistance: number,
  viewportHeight: number,
  projectionScaleY: number,
): number {
  if (radius <= 0 || cameraDistance <= 1e-6 || viewportHeight <= 0) return 0;
  return (
    (2 * radius * Math.abs(projectionScaleY) * viewportHeight) /
    (2 * cameraDistance)
  );
}

export function selectTreeFoliageLod(
  projectedDiameterPx: number,
  phase: number,
): TreeFoliageLod | null {
  // Stable per-clump threshold jitter: transition is distributed through the
  // forest instead of synchronized across every crown at one distance.
  const biasedDiameter = projectedDiameterPx * (0.91 + phase * 0.18);
  for (const profile of TREE_FOLIAGE_LODS) {
    if (biasedDiameter >= profile.minimumDiameterPx) return profile.id;
  }
  return null;
}

export function treeFoliageTriangleBudget(
  kind: TreeFoliageKind,
  lod: TreeFoliageLod,
  canonicalPineNeedles = 693,
): number {
  const profile = TREE_FOLIAGE_LODS.find((candidate) => candidate.id === lod);
  if (!profile) return 0;
  return kind === "broadleaf"
    ? profile.broadleafCount * 2
    : Math.ceil(canonicalPineNeedles * profile.pineDensity) * 2;
}

