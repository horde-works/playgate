import type { BreakablePieceDefinition } from "./destructionScene.ts";

// ---------------------------------------------------------------------------
// Авто-привязка концов проводов к кускам сцены. Каждый конец пролёта и так
// нарисован НА чём-то — столбе, стене, киоске. Вместо ручной разметки якорей
// ищем кусок, чей AABB (с небольшим допуском) накрывает точку конца провода:
// сломали кусок — провод потерял опору. Никакой физики, чистая геометрия.
// ---------------------------------------------------------------------------

const ANCHOR_MARGIN = 0.35;

/** Кабели, лежащие на земле, к якорям не привязываем — им некуда падать. */
export function wireIsGrounded(
  from: readonly [number, number, number],
  to: readonly [number, number, number],
): boolean {
  return from[1] < 0.7 && to[1] < 0.7;
}

/**
 * Ближайший (наименьший накрывающий) кусок под концом провода. Грунтовые
 * плиты пропускаем: провод, «привязанный» к газону, падал бы от любой ямы.
 */
export function resolveWireAnchor(
  point: readonly [number, number, number],
  pieces: readonly BreakablePieceDefinition[],
): string | null {
  let bestId: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const piece of pieces) {
    // К стеклу провода не крепят (иначе разбитая форточка роняла бы ввод),
    // грунтовые плиты — не опора, ненесущие висюльки (планки решёток,
    // рёбра, спицы) — тоже: иначе провод «держится» за планку кондиционера.
    if (
      piece.shape === "groundTile" ||
      piece.material === "glass" ||
      piece.bearsLoad === false
    ) {
      continue;
    }
    const dx = Math.abs(point[0] - piece.position[0]);
    if (dx > piece.size[0] / 2 + ANCHOR_MARGIN) {
      continue;
    }
    const dy = Math.abs(point[1] - piece.position[1]);
    if (dy > piece.size[1] / 2 + ANCHOR_MARGIN) {
      continue;
    }
    const dz = Math.abs(point[2] - piece.position[2]);
    if (dz > piece.size[2] / 2 + ANCHOR_MARGIN) {
      continue;
    }
    // Ближайший ЦЕНТР, а не наименьший объём: конец провода нарисован на
    // фасадной детали, и её центр к нему ближе, чем мебель в глубине
    // квартиры или массив стены соседнего пролёта.
    const distance = dx * dx + dy * dy + dz * dz;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestId = piece.id;
    }
  }
  return bestId;
}
