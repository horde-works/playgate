import type {
  BreakablePieceDefinition,
  SceneVector3,
} from "./destructionScene.ts";
import { getPieceRenderBoxes } from "./breakableGeometry.ts";

/**
 * ПРОСТРАНСТВЕННЫЙ ПОИСК КУСКА ПО ТОЧКЕ.
 *
 * Целый мир живёт в физике как несколько слитых тримешей, сгруппированных по
 * материалу: коллайдер отвечает, из чего сделано то, во что вы врезались, но
 * не отвечает, КАКОЙ это кусок. Оружие решает ту же задачу лучом по видимым
 * инстансам, но у столкновения нет луча — у него есть точка контакта.
 *
 * Поэтому здесь обычная равномерная сетка по габаритам кусков: строится один
 * раз на сцену, спрашивается точкой. Гадать «ближайший к центру машины» нельзя:
 * у широкой машины первым встречает вынос, а не центр, и ответ был бы про
 * другой дом.
 *
 * Модуль намеренно чистый: ни three, ни rapier.
 */

export interface BreakablePieceIndexOptions {
  /** Cell edge in metres. Roughly the size of a typical wall panel. */
  readonly cellSize?: number;
}

export interface BreakablePieceIndex {
  /**
   * Piece whose body contains the point, or the nearest one within `reach`.
   * Returns null when nothing breakable is close enough.
   */
  at(
    point: SceneVector3,
    reach?: number,
    accept?: (piece: BreakablePieceDefinition) => boolean,
  ): BreakablePieceDefinition | null;
  /** First authored occupied volume crossed by a normalized world ray. */
  raycast(
    origin: SceneVector3,
    direction: SceneVector3,
    maximumDistance: number,
    accept?: (piece: BreakablePieceDefinition) => boolean,
  ): BreakablePieceRayHit | null;
  readonly size: number;
}

export interface BreakablePieceRayHit {
  readonly piece: BreakablePieceDefinition;
  readonly distance: number;
  readonly point: SceneVector3;
  /** Outward normal of the authored occupied volume crossed by the ray. */
  readonly normal: SceneVector3;
}

const DEFAULT_CELL_SIZE = 2;

function rotationRows(
  rotation: SceneVector3 | undefined,
): readonly [SceneVector3, SceneVector3, SceneVector3] {
  if (!rotation) {
    return [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ];
  }
  const [rx, ry, rz] = rotation;
  const sx = Math.sin(rx);
  const cx = Math.cos(rx);
  const sy = Math.sin(ry);
  const cy = Math.cos(ry);
  const sz = Math.sin(rz);
  const cz = Math.cos(rz);
  // Те же оси, что строит компилятор сцены: интринсический XYZ.
  return [
    [cy * cz, -cy * sz, sy],
    [sx * sy * cz + cx * sz, -sx * sy * sz + cx * cz, -sx * cy],
    [-cx * sy * cz + sx * sz, cx * sy * sz + sx * cz, cx * cy],
  ];
}

/** Signed-ish distance from a world point to an authored oriented box. */
export function distanceToPiece(
  piece: BreakablePieceDefinition,
  point: SceneVector3,
): number {
  const rows = rotationRows(piece.rotation);
  const dx = point[0] - piece.position[0];
  const dy = point[1] - piece.position[1];
  const dz = point[2] - piece.position[2];
  let squared = 0;
  for (let axis = 0; axis < 3; axis += 1) {
    // Столбцы матрицы — образы локальных осей, поэтому проекция на локальную
    // ось берётся скалярным произведением со СТОЛБЦОМ, а не со строкой.
    const local =
      dx * rows[0][axis] + dy * rows[1][axis] + dz * rows[2][axis];
    const half = piece.size[axis] / 2;
    const outside = Math.abs(local) - half;
    if (outside > 0) {
      squared += outside * outside;
    }
  }
  return Math.sqrt(squared);
}

function rayHitOnPiece(
  piece: BreakablePieceDefinition,
  origin: SceneVector3,
  direction: SceneVector3,
  maximumDistance: number,
): { readonly distance: number; readonly normal: SceneVector3 } | null {
  const rows = rotationRows(piece.rotation);
  const dx = origin[0] - piece.position[0];
  const dy = origin[1] - piece.position[1];
  const dz = origin[2] - piece.position[2];
  const localOrigin: SceneVector3 = [
    dx * rows[0][0] + dy * rows[1][0] + dz * rows[2][0],
    dx * rows[0][1] + dy * rows[1][1] + dz * rows[2][1],
    dx * rows[0][2] + dy * rows[1][2] + dz * rows[2][2],
  ];
  const localDirection: SceneVector3 = [
    direction[0] * rows[0][0] +
      direction[1] * rows[1][0] +
      direction[2] * rows[2][0],
    direction[0] * rows[0][1] +
      direction[1] * rows[1][1] +
      direction[2] * rows[2][1],
    direction[0] * rows[0][2] +
      direction[1] * rows[1][2] +
      direction[2] * rows[2][2],
  ];
  let closest = Number.POSITIVE_INFINITY;
  let closestLocalNormal: SceneVector3 | null = null;
  for (const box of getPieceRenderBoxes(piece)) {
    let near = 0;
    let far = Math.min(maximumDistance, closest);
    let intersects = true;
    let nearAxis = -1;
    let nearSign = 0;
    for (let axis = 0; axis < 3; axis += 1) {
      const relativeOrigin = localOrigin[axis] - box.center[axis];
      const half = box.size[axis] / 2;
      const rayAxis = localDirection[axis];
      if (Math.abs(rayAxis) < 1e-9) {
        if (relativeOrigin < -half || relativeOrigin > half) {
          intersects = false;
          break;
        }
        continue;
      }
      const first = (-half - relativeOrigin) / rayAxis;
      const second = (half - relativeOrigin) / rayAxis;
      const entry = Math.min(first, second);
      if (entry > near) {
        near = entry;
        nearAxis = axis;
        nearSign = rayAxis > 0 ? -1 : 1;
      }
      far = Math.min(far, Math.max(first, second));
      if (near > far) {
        intersects = false;
        break;
      }
    }
    if (intersects && near <= maximumDistance && near < closest) {
      closest = near;
      const normal: [number, number, number] = [0, 0, 0];
      if (nearAxis >= 0) {
        normal[nearAxis] = nearSign;
      } else {
        // The ray started inside the occupied volume. There is no entry face,
        // so use the face opposing travel; callers still get a stable normal.
        const dominant = [0, 1, 2].reduce((best, axis) =>
          Math.abs(localDirection[axis]) > Math.abs(localDirection[best])
            ? axis
            : best,
        );
        normal[dominant] = localDirection[dominant] > 0 ? -1 : 1;
      }
      closestLocalNormal = normal;
    }
  }
  if (!Number.isFinite(closest) || !closestLocalNormal) {
    return null;
  }
  const normal: SceneVector3 = [
    rows[0][0] * closestLocalNormal[0] +
      rows[0][1] * closestLocalNormal[1] +
      rows[0][2] * closestLocalNormal[2],
    rows[1][0] * closestLocalNormal[0] +
      rows[1][1] * closestLocalNormal[1] +
      rows[1][2] * closestLocalNormal[2],
    rows[2][0] * closestLocalNormal[0] +
      rows[2][1] * closestLocalNormal[1] +
      rows[2][2] * closestLocalNormal[2],
  ];
  return { distance: closest, normal };
}

export function createBreakablePieceIndex(
  pieces: readonly BreakablePieceDefinition[],
  options: BreakablePieceIndexOptions = {},
): BreakablePieceIndex {
  const cellSize = Math.max(0.25, options.cellSize ?? DEFAULT_CELL_SIZE);
  const buckets = new Map<string, BreakablePieceDefinition[]>();
  const key = (x: number, y: number, z: number): string => `${x}:${y}:${z}`;
  const cellOf = (value: number): number => Math.floor(value / cellSize);

  for (const piece of pieces) {
    // Габарит повёрнутого куска: берём радиус описанной сферы, он дешевле и
    // никогда не занижает занятые ячейки.
    const radius =
      Math.hypot(piece.size[0], piece.size[1], piece.size[2]) / 2;
    const from = [0, 1, 2].map((axis) => cellOf(piece.position[axis] - radius));
    const to = [0, 1, 2].map((axis) => cellOf(piece.position[axis] + radius));
    for (let x = from[0]; x <= to[0]; x += 1) {
      for (let y = from[1]; y <= to[1]; y += 1) {
        for (let z = from[2]; z <= to[2]; z += 1) {
          const id = key(x, y, z);
          const bucket = buckets.get(id);
          if (bucket) {
            bucket.push(piece);
          } else {
            buckets.set(id, [piece]);
          }
        }
      }
    }
  }

  return {
    size: buckets.size,
    at(point, reach = 0.6, accept) {
      const span = Math.max(0, Math.ceil(reach / cellSize));
      const base = [0, 1, 2].map((axis) => cellOf(point[axis]));
      let best: BreakablePieceDefinition | null = null;
      let bestDistance = Number.POSITIVE_INFINITY;
      const seen = new Set<string>();
      for (let x = base[0] - span; x <= base[0] + span; x += 1) {
        for (let y = base[1] - span; y <= base[1] + span; y += 1) {
          for (let z = base[2] - span; z <= base[2] + span; z += 1) {
            const bucket = buckets.get(key(x, y, z));
            if (!bucket) {
              continue;
            }
            for (const piece of bucket) {
              if (seen.has(piece.id)) {
                continue;
              }
              seen.add(piece.id);
              if (accept && !accept(piece)) {
                continue;
              }
              const distance = distanceToPiece(piece, point);
              if (distance < bestDistance) {
                bestDistance = distance;
                best = piece;
              }
            }
          }
        }
      }
      return bestDistance <= reach ? best : null;
    },
    raycast(origin, direction, maximumDistance, accept) {
      const directionLength = Math.hypot(...direction);
      if (directionLength < 1e-9 || maximumDistance <= 0) {
        return null;
      }
      const normalized: SceneVector3 = [
        direction[0] / directionLength,
        direction[1] / directionLength,
        direction[2] / directionLength,
      ];
      let ix = cellOf(origin[0]);
      let iy = cellOf(origin[1]);
      let iz = cellOf(origin[2]);
      const steps = normalized.map((component) =>
        component > 0 ? 1 : component < 0 ? -1 : 0,
      );
      const deltas = normalized.map((component) =>
        component === 0
          ? Number.POSITIVE_INFINITY
          : Math.abs(cellSize / component),
      );
      const nextBoundary = (cell: number, step: number): number =>
        (cell + (step > 0 ? 1 : 0)) * cellSize;
      const maxima = [
        steps[0] === 0
          ? Number.POSITIVE_INFINITY
          : (nextBoundary(ix, steps[0]) - origin[0]) / normalized[0],
        steps[1] === 0
          ? Number.POSITIVE_INFINITY
          : (nextBoundary(iy, steps[1]) - origin[1]) / normalized[1],
        steps[2] === 0
          ? Number.POSITIVE_INFINITY
          : (nextBoundary(iz, steps[2]) - origin[2]) / normalized[2],
      ];
      const seen = new Set<string>();
      let best: BreakablePieceDefinition | null = null;
      let bestDistance = Number.POSITIVE_INFINITY;
      let bestNormal: SceneVector3 | null = null;
      const maximumCells = Math.ceil(maximumDistance / cellSize) * 3 + 6;

      for (let guard = 0; guard < maximumCells; guard += 1) {
        const bucket = buckets.get(key(ix, iy, iz));
        if (bucket) {
          for (const piece of bucket) {
            if (seen.has(piece.id)) continue;
            seen.add(piece.id);
            if (accept && !accept(piece)) continue;
            const hit = rayHitOnPiece(
              piece,
              origin,
              normalized,
              Math.min(maximumDistance, bestDistance),
            );
            if (hit && hit.distance < bestDistance) {
              best = piece;
              bestDistance = hit.distance;
              bestNormal = hit.normal;
            }
          }
        }

        const nextDistance = Math.min(maxima[0], maxima[1], maxima[2]);
        if (best && bestDistance <= nextDistance + 1e-8) {
          return {
            piece: best,
            distance: bestDistance,
            point: [
              origin[0] + normalized[0] * bestDistance,
              origin[1] + normalized[1] * bestDistance,
              origin[2] + normalized[2] * bestDistance,
            ],
            normal: bestNormal ?? [-normalized[0], -normalized[1], -normalized[2]],
          };
        }
        if (nextDistance > maximumDistance) break;
        if (maxima[0] <= maxima[1] && maxima[0] <= maxima[2]) {
          ix += steps[0];
          maxima[0] += deltas[0];
        } else if (maxima[1] <= maxima[2]) {
          iy += steps[1];
          maxima[1] += deltas[1];
        } else {
          iz += steps[2];
          maxima[2] += deltas[2];
        }
      }
      return best && bestDistance <= maximumDistance
        ? {
            piece: best,
            distance: bestDistance,
            point: [
              origin[0] + normalized[0] * bestDistance,
              origin[1] + normalized[1] * bestDistance,
              origin[2] + normalized[2] * bestDistance,
            ],
            normal: bestNormal ?? [-normalized[0], -normalized[1], -normalized[2]],
          }
        : null;
    },
  };
}
