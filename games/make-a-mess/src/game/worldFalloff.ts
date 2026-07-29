/** Shared depth below the actor safety floor where unseen physics is retired. */
export const WORLD_DISAPPEAR_DEPTH = 10;

export function worldDisappearY(safetyFloorY: number): number {
  return safetyFloorY - WORLD_DISAPPEAR_DEPTH;
}

export function isBelowWorldDisappearDepth(
  worldY: number,
  safetyFloorY: number,
): boolean {
  return Number.isFinite(worldY) && worldY <= worldDisappearY(safetyFloorY);
}
