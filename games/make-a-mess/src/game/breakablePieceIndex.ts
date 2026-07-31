import type {
  BreakablePieceDefinition,
  SceneVector3,
} from "./destructionScene.ts";

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
  readonly size: number;
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
  };
}
