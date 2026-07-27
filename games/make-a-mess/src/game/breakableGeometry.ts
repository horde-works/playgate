import type { BreakablePieceDefinition } from "./destructionScene";

export interface BreakableRenderBox {
  readonly center: readonly [number, number, number];
  readonly size: readonly [number, number, number];
}

/**
 * Shared physical/visual decomposition of an authored piece. Keeping it in a
 * renderer-free module lets intact compound clusters and detached debris use
 * exactly the same occupied volume.
 */
export function getPieceRenderBoxes(
  piece: BreakablePieceDefinition,
): readonly BreakableRenderBox[] {
  if (piece.shape !== "cinderBlock") {
    return [{ center: [0, 0, 0], size: piece.size }];
  }

  const [width, height, depth] = piece.size;
  return [
    {
      center: [0, height * 0.36, 0],
      size: [width, height * 0.28, depth],
    },
    {
      center: [0, -height * 0.36, 0],
      size: [width, height * 0.28, depth],
    },
    ...[-0.4, 0, 0.4].map(
      (offset): BreakableRenderBox => ({
        center: [width * offset, 0, 0],
        size: [width * 0.18, height * 0.48, depth],
      }),
    ),
  ];
}
