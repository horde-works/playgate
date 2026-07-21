import type {
  BreakableMaterial,
  BreakablePieceDefinition,
} from "./destructionScene.ts";
import {
  isGlassMaterial,
  pieceMaterialBaseColor,
} from "./materialTextures.ts";
import { hasSilicateJoints } from "./silicateJoints.ts";

// Both authored maps fit inside one 256 m render cell. Their box geometry is
// cheap; splitting it into tiny cells cost hundreds of draw calls (and the
// same again in the shadow pass) while barely reducing visible triangles.
// Physics and blast queries keep their own spatial index, so render batching
// does not make structural work global.
const WORLD_CHUNK_SIZE = 256;

export interface IntactInstanceBatch {
  readonly id: string;
  readonly material: BreakableMaterial;
  readonly materialColor: string;
  readonly castShadow: boolean;
  readonly jointed: boolean;
  readonly pieces: readonly BreakablePieceDefinition[];
}

function worldChunkKey(piece: BreakablePieceDefinition): string {
  return `${Math.floor(
    (piece.position[0] + WORLD_CHUNK_SIZE / 2) / WORLD_CHUNK_SIZE,
  )}:${Math.floor(
    (piece.position[2] + WORLD_CHUNK_SIZE / 2) / WORLD_CHUNK_SIZE,
  )}`;
}

/**
 * Groups the FULL authored piece list into instanced draw batches. The
 * grouping key never depends on which pieces are currently broken, so the
 * batches — and every piece's instance index inside its batch — stay stable
 * for the whole session. Breaking a piece only zeroes its instance matrix.
 */
export function buildIntactInstanceBatches(
  pieces: readonly BreakablePieceDefinition[],
): readonly IntactInstanceBatch[] {
  const batches = new Map<string, BreakablePieceDefinition[]>();
  for (const piece of pieces) {
    const materialColor = pieceMaterialBaseColor(piece.material, piece.color);
    const castShadow =
      !isGlassMaterial(piece.material) && piece.shape !== "groundTile";
    const id = `${worldChunkKey(piece)}:${piece.material}:${materialColor}:${Number(
      castShadow,
    )}`;
    const batch = batches.get(id);
    if (batch) {
      batch.push(piece);
    } else {
      batches.set(id, [piece]);
    }
  }

  return [...batches].map(([id, batchPieces]) => ({
    id,
    material: batchPieces[0].material,
    materialColor: pieceMaterialBaseColor(
      batchPieces[0].material,
      batchPieces[0].color,
    ),
    castShadow:
      !isGlassMaterial(batchPieces[0].material) &&
      batchPieces[0].shape !== "groundTile",
    jointed: batchPieces.some((piece) =>
      hasSilicateJoints(piece.id, piece.material),
    ),
    pieces: batchPieces,
  }));
}

export interface HiddenInstanceChanges {
  readonly hide: readonly number[];
  readonly restore: readonly number[];
}

/**
 * One pass over a batch's pieces: which instance indices must be zeroed out
 * and which must be restored, given the hidden set already applied to the
 * GPU buffer. `applied` is mutated to match `hidden` for this batch's ids,
 * so repeated calls with the same target set are no-ops.
 */
export function applyHiddenPieceDiff(
  pieces: readonly BreakablePieceDefinition[],
  applied: Set<string>,
  hidden: ReadonlySet<string>,
): HiddenInstanceChanges {
  const hide: number[] = [];
  const restore: number[] = [];
  pieces.forEach((piece, index) => {
    const isHidden = hidden.has(piece.id);
    if (isHidden === applied.has(piece.id)) {
      return;
    }
    if (isHidden) {
      applied.add(piece.id);
      hide.push(index);
    } else {
      applied.delete(piece.id);
      restore.push(index);
    }
  });
  return { hide, restore };
}
