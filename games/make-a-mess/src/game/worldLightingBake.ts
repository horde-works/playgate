import type { InstancedBufferAttribute } from "three";
import {
  AO_MAX_DISTANCE,
  LightingBaker,
  type PieceBakeResult,
} from "./bakedLighting.ts";
import type { BreakablePieceDefinition } from "./destructionScene.ts";
import { createSpatialIndex, type SpatialIndex } from "./spatialIndex.ts";

/**
 * Owns the baked ambient lighting of one world instance: the occupancy grid,
 * every piece's bake result, and the GPU attributes it is written into.
 * When pieces are destroyed it clears their cells and re-bakes only the
 * neighbours, streaming the changed instances to the GPU via update ranges —
 * light reaches into fresh craters the same way the renderer reveals them.
 */

export interface RegisteredLightingBatch {
  readonly aoA: InstancedBufferAttribute;
  readonly aoB: InstancedBufferAttribute;
  readonly sky: InstancedBufferAttribute;
  readonly indexById: ReadonlyMap<string, number>;
}

export function writeBakeResult(
  result: PieceBakeResult,
  index: number,
  aoA: Float32Array,
  aoB: Float32Array,
  sky: Float32Array,
): void {
  for (let corner = 0; corner < 4; corner += 1) {
    aoA[index * 4 + corner] = result.cornerAo[corner];
    aoB[index * 4 + corner] = result.cornerAo[corner + 4];
  }
  sky[index] = result.skyExposure;
}

export class WorldLightingBake {
  private readonly baker: LightingBaker;
  private readonly results = new Map<string, PieceBakeResult>();
  private readonly pieceById = new Map<string, BreakablePieceDefinition>();
  private readonly spatial: SpatialIndex<BreakablePieceDefinition>;
  private readonly hidden = new Set<string>();
  private readonly batches = new Set<RegisteredLightingBatch>();

  constructor(pieces: readonly BreakablePieceDefinition[]) {
    this.baker = new LightingBaker(pieces);
    this.spatial = createSpatialIndex(pieces, 5);
    for (const piece of pieces) {
      this.pieceById.set(piece.id, piece);
      this.results.set(piece.id, this.baker.bakePiece(piece));
    }
  }

  resultFor(pieceId: string): PieceBakeResult | undefined {
    return this.results.get(pieceId);
  }

  registerBatch(batch: RegisteredLightingBatch): () => void {
    this.batches.add(batch);
    return () => {
      this.batches.delete(batch);
    };
  }

  /**
   * Sync the bake with the set of destroyed/hidden pieces. Only additions
   * are processed (a session never un-breaks pieces; resets remount the
   * world and rebuild the bake from scratch).
   */
  applyHidden(hiddenPieceIds: ReadonlySet<string>): void {
    const removed: BreakablePieceDefinition[] = [];
    for (const id of hiddenPieceIds) {
      if (this.hidden.has(id)) {
        continue;
      }
      this.hidden.add(id);
      const piece = this.pieceById.get(id);
      if (piece) {
        removed.push(piece);
      }
    }
    if (removed.length === 0) {
      return;
    }

    const affected = new Map<string, BreakablePieceDefinition>();
    for (const piece of removed) {
      const pieceRadius = Math.hypot(...piece.size) / 2;
      const neighbors = this.spatial.querySphere(
        piece.position,
        pieceRadius + AO_MAX_DISTANCE + 3,
      );
      const survivors: BreakablePieceDefinition[] = [];
      for (const neighbor of neighbors) {
        if (neighbor.id === piece.id || this.hidden.has(neighbor.id)) {
          continue;
        }
        survivors.push(neighbor);
        affected.set(neighbor.id, neighbor);
      }
      this.baker.removePiece(piece, survivors);
    }

    for (const piece of affected.values()) {
      const result = this.baker.bakePiece(piece);
      this.results.set(piece.id, result);
      this.writeToBatches(piece.id, result);
    }
  }

  private writeToBatches(pieceId: string, result: PieceBakeResult): void {
    for (const batch of this.batches) {
      const index = batch.indexById.get(pieceId);
      if (index === undefined) {
        continue;
      }
      writeBakeResult(
        result,
        index,
        batch.aoA.array as Float32Array,
        batch.aoB.array as Float32Array,
        batch.sky.array as Float32Array,
      );
      batch.aoA.addUpdateRange(index * 4, 4);
      batch.aoB.addUpdateRange(index * 4, 4);
      batch.sky.addUpdateRange(index, 1);
      batch.aoA.needsUpdate = true;
      batch.aoB.needsUpdate = true;
      batch.sky.needsUpdate = true;
      return;
    }
  }
}
