import type {
  BreakableClusterDefinition,
  BreakablePieceDefinition,
  SceneVector3,
} from "./destructionScene.ts";

// Compile-time de-interpenetration.
//
// Authored scenes routinely overlap pieces on purpose — a ring of rim stones,
// a faceted tower of basalt bricks, stacked cairns. Deep overlap reads as
// z-fighting and, once broken, makes the solver shove the overlapping siblings
// apart. This pass trims interpenetrating SIBLING pieces (same cluster) so they
// butt instead of overlapping, keeping each a separate destructible body.
//
// It only touches DEEP overlaps (high intersection-volume ratio), never the
// shallow, intentional contacts that carry structure — a log-cabin corner joint
// or a piece resting on its support barely overlaps by volume, so it is left
// alone. It never trims the vertical axis, so nothing loses its footing.

type Vec3 = [number, number, number];
type Axes = readonly [Vec3, Vec3, Vec3];

// Overlap intersection-volume / smaller AABB volume must exceed this to count
// as a "duplicate-like" overlap worth trimming (corner joints sit far below).
const VOLUME_RATIO_GATE = 0.22;
// Ignore hair-thin overlaps.
const MIN_DEPTH = 0.05;
// A near-vertical separation axis means the overlap carries vertical bearing —
// leave it, so support is never removed.
const MAX_VERTICAL_AXIS = 0.6;
// Never trim a piece below this fraction of its original extent on an axis.
const MIN_KEEP = 0.4;
const ITERATIONS = 3;

// three.js Euler 'XYZ' → the box's local axes as world-space unit vectors
// (columns of makeRotationFromEuler), matching what the renderer and physics use.
function localAxes(euler: SceneVector3 = [0, 0, 0]): Axes {
  const a = Math.cos(euler[0]);
  const b = Math.sin(euler[0]);
  const c = Math.cos(euler[1]);
  const d = Math.sin(euler[1]);
  const e = Math.cos(euler[2]);
  const f = Math.sin(euler[2]);
  const ae = a * e;
  const af = a * f;
  const be = b * e;
  const bf = b * f;
  return [
    [c * e, af + be * d, bf - ae * d],
    [-c * f, ae - bf * d, be + af * d],
    [d, -b * c, a * c],
  ];
}

function dot(u: Vec3, v: Vec3): number {
  return u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
}

interface Obb {
  center: Vec3;
  half: Vec3;
  axes: Axes;
}

function aabbHalf(obb: Obb): Vec3 {
  return [0, 1, 2].map((axis) =>
    Math.abs(obb.axes[0][axis]) * obb.half[0] +
    Math.abs(obb.axes[1][axis]) * obb.half[1] +
    Math.abs(obb.axes[2][axis]) * obb.half[2],
  ) as Vec3;
}

// Minimum-translation axis (unit, pointing from A toward B) and penetration
// depth, or null if the boxes are separated.
function penetration(a: Obb, b: Obb): { axis: Vec3; depth: number } | null {
  const delta: Vec3 = [
    b.center[0] - a.center[0],
    b.center[1] - a.center[1],
    b.center[2] - a.center[2],
  ];
  const candidates: Vec3[] = [a.axes[0], a.axes[1], a.axes[2], b.axes[0], b.axes[1], b.axes[2]];
  for (const ua of a.axes) {
    for (const ub of b.axes) {
      const cross: Vec3 = [
        ua[1] * ub[2] - ua[2] * ub[1],
        ua[2] * ub[0] - ua[0] * ub[2],
        ua[0] * ub[1] - ua[1] * ub[0],
      ];
      const length = Math.hypot(cross[0], cross[1], cross[2]);
      if (length > 1e-4) {
        candidates.push([cross[0] / length, cross[1] / length, cross[2] / length]);
      }
    }
  }
  let best: { axis: Vec3; depth: number } | null = null;
  for (const axis of candidates) {
    const radiusA =
      Math.abs(dot(a.axes[0], axis)) * a.half[0] +
      Math.abs(dot(a.axes[1], axis)) * a.half[1] +
      Math.abs(dot(a.axes[2], axis)) * a.half[2];
    const radiusB =
      Math.abs(dot(b.axes[0], axis)) * b.half[0] +
      Math.abs(dot(b.axes[1], axis)) * b.half[1] +
      Math.abs(dot(b.axes[2], axis)) * b.half[2];
    const distance = Math.abs(dot(delta, axis));
    const overlap = radiusA + radiusB - distance;
    if (overlap <= 0) {
      return null; // a separating axis exists
    }
    if (!best || overlap < best.depth) {
      // orient the axis from A toward B
      const sign = dot(delta, axis) < 0 ? -1 : 1;
      best = { axis: [axis[0] * sign, axis[1] * sign, axis[2] * sign], depth: overlap };
    }
  }
  return best;
}

interface Adjust {
  // trim requested on the negative / positive face of each local axis
  trim: [[number, number], [number, number], [number, number]];
}

function trimPiece(
  piece: BreakablePieceDefinition,
  obb: Obb,
  adjust: Adjust,
): BreakablePieceDefinition {
  const position: Vec3 = [...piece.position] as Vec3;
  const size: Vec3 = [...piece.size] as Vec3;
  let changed = false;
  for (let axis = 0; axis < 3; axis += 1) {
    const [negTrim, posTrim] = adjust.trim[axis];
    const total = negTrim + posTrim;
    if (total <= 0) {
      continue;
    }
    const capped = Math.min(total, size[axis] * (1 - MIN_KEEP));
    const scale = total > 0 ? capped / total : 0;
    const neg = negTrim * scale;
    const pos = posTrim * scale;
    size[axis] -= neg + pos;
    // shift the centre so the LESS-trimmed face stays put (preserves silhouette)
    const shift = (neg - pos) / 2;
    for (let k = 0; k < 3; k += 1) {
      position[k] += obb.axes[axis][k] * shift;
    }
    changed = true;
  }
  if (!changed) {
    return piece;
  }
  return { ...piece, position, size };
}

function isTrimmable(piece: BreakablePieceDefinition): boolean {
  return piece.hinge === undefined && piece.shape !== "groundTile";
}

function resolveCluster(cluster: BreakableClusterDefinition): BreakableClusterDefinition {
  let pieces = cluster.pieces.map((piece) => piece);
  let anyChange = false;

  for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
    const obbs = pieces.map((piece): Obb => ({
      center: [...piece.position] as Vec3,
      half: [piece.size[0] / 2, piece.size[1] / 2, piece.size[2] / 2],
      axes: localAxes(piece.rotation),
    }));
    const aabbHalves = obbs.map(aabbHalf);
    const adjusts: (Adjust | null)[] = pieces.map(() => null);
    let iterationChange = false;

    for (let i = 0; i < pieces.length; i += 1) {
      if (!isTrimmable(pieces[i])) {
        continue;
      }
      for (let j = i + 1; j < pieces.length; j += 1) {
        if (!isTrimmable(pieces[j])) {
          continue;
        }
        // broad phase: world AABBs must overlap
        let separated = false;
        let intersectionVolume = 1;
        for (let axis = 0; axis < 3; axis += 1) {
          const overlap =
            aabbHalves[i][axis] + aabbHalves[j][axis] -
            Math.abs(obbs[i].center[axis] - obbs[j].center[axis]);
          if (overlap <= 0) {
            separated = true;
            break;
          }
          intersectionVolume *= overlap;
        }
        if (separated) {
          continue;
        }
        const volA = aabbHalves[i][0] * aabbHalves[i][1] * aabbHalves[i][2] * 8;
        const volB = aabbHalves[j][0] * aabbHalves[j][1] * aabbHalves[j][2] * 8;
        if (intersectionVolume < VOLUME_RATIO_GATE * Math.min(volA, volB)) {
          continue; // shallow / intentional contact (corner joint, resting)
        }
        const hit = penetration(obbs[i], obbs[j]);
        if (!hit || hit.depth < MIN_DEPTH || Math.abs(hit.axis[1]) > MAX_VERTICAL_AXIS) {
          continue;
        }
        const share = hit.depth / 2;
        addTrim(adjusts, i, obbs[i], hit.axis, share, 1);
        addTrim(adjusts, j, obbs[j], hit.axis, share, -1);
        iterationChange = true;
      }
    }

    if (!iterationChange) {
      break;
    }
    pieces = pieces.map((piece, index) => {
      const adjust = adjusts[index];
      return adjust ? trimPiece(piece, obbs[index], adjust) : piece;
    });
    anyChange = true;
  }

  return anyChange ? { ...cluster, pieces } : cluster;
}

// Record the trim needed on the piece's near face. `toward` is +1 if `axis`
// points toward the OTHER piece (this piece's near face is on the +axis side),
// -1 otherwise.
function addTrim(
  adjusts: (Adjust | null)[],
  index: number,
  obb: Obb,
  axis: Vec3,
  amount: number,
  toward: number,
): void {
  let bestAxis = 0;
  let bestDot = 0;
  for (let k = 0; k < 3; k += 1) {
    const value = Math.abs(dot(obb.axes[k], axis));
    if (value > bestDot) {
      bestDot = value;
      bestAxis = k;
    }
  }
  if (bestDot < 0.7) {
    return; // MTV not aligned with a box axis → cannot trim cleanly, skip
  }
  const alongAxis = dot(obb.axes[bestAxis], axis) * toward;
  const side = alongAxis >= 0 ? 1 : 0; // 1 = +face, 0 = -face
  let adjust = adjusts[index];
  if (!adjust) {
    adjust = { trim: [[0, 0], [0, 0], [0, 0]] };
    adjusts[index] = adjust;
  }
  adjust.trim[bestAxis][side] = Math.max(adjust.trim[bestAxis][side], amount);
}

/**
 * Trim deep sibling interpenetration, but NEVER at the cost of structural
 * support. `resolveUnsupported` reports which pieces would be unsupported for a
 * given layout. Any CLUSTER whose trim newly leaves a piece unsupported is
 * reverted whole to its authored geometry (its z-fight stays, but nothing loses
 * its footing) — reverting the whole cluster also restores whatever support was
 * trimmed, not just the piece that fell. If a case still can't be made safe, the
 * whole pass is dropped, so the scene is never less stable than authored.
 */
// Radius (m) around a newly-unsupported piece within which trimmed siblings are
// reverted too — those are its likely supports. Small enough that a tower wall
// keeps its trim while the stair beside it is restored.
const REVERT_RADIUS = 3;

export function deinterpenetrateClusters(
  clusters: readonly BreakableClusterDefinition[],
  resolveUnsupported?: (
    clusters: readonly BreakableClusterDefinition[],
  ) => ReadonlySet<string>,
): readonly BreakableClusterDefinition[] {
  const trimmedAll = clusters.map(resolveCluster);
  if (!resolveUnsupported) {
    return trimmedAll;
  }
  const originalById = new Map<string, BreakablePieceDefinition>();
  const clusterOfPiece = new Map<string, string>();
  const siblingsByCluster = new Map<string, BreakablePieceDefinition[]>();
  for (const cluster of clusters) {
    siblingsByCluster.set(cluster.id, [...cluster.pieces]);
    for (const piece of cluster.pieces) {
      originalById.set(piece.id, piece);
      clusterOfPiece.set(piece.id, cluster.id);
    }
  }

  const baseline = resolveUnsupported(clusters);
  const reverted = new Set<string>();
  const apply = (): readonly BreakableClusterDefinition[] =>
    trimmedAll.map((cluster) => ({
      ...cluster,
      pieces: cluster.pieces.map((piece) =>
        reverted.has(piece.id) ? originalById.get(piece.id) ?? piece : piece,
      ),
    }));
  let result: readonly BreakableClusterDefinition[] = trimmedAll;

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const unsupported = resolveUnsupported(result);
    const newly = [...unsupported].filter((id) => !baseline.has(id));
    if (newly.length === 0) {
      return result;
    }
    let grew = false;
    for (const id of newly) {
      if (!reverted.has(id)) {
        reverted.add(id);
        grew = true;
      }
      // Restore trimmed siblings near this piece — one of them was its support.
      const origin = originalById.get(id);
      const siblings = origin ? siblingsByCluster.get(clusterOfPiece.get(id) ?? "") : undefined;
      if (!origin || !siblings) {
        continue;
      }
      for (const sibling of siblings) {
        if (reverted.has(sibling.id)) {
          continue;
        }
        const dx = origin.position[0] - sibling.position[0];
        const dy = origin.position[1] - sibling.position[1];
        const dz = origin.position[2] - sibling.position[2];
        if (dx * dx + dy * dy + dz * dz < REVERT_RADIUS * REVERT_RADIUS) {
          reverted.add(sibling.id);
          grew = true;
        }
      }
    }
    if (!grew) {
      break;
    }
    result = apply();
  }

  // Safety: if a stable layout still can't be found, drop the pass entirely.
  const stillNewly = [...resolveUnsupported(result)].some((id) => !baseline.has(id));
  return stillNewly ? clusters : result;
}
