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
  readonly indexById: ReadonlyMap<string, number>;
  writeBake(index: number, result: PieceBakeResult): void;
  flush(indices: number[]): void;
}

interface LightingDestination {
  readonly batch: RegisteredLightingBatch;
  readonly index: number;
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

export function instancedLightingBatch(
  aoA: InstancedBufferAttribute,
  aoB: InstancedBufferAttribute,
  sky: InstancedBufferAttribute,
  indexById: ReadonlyMap<string, number>,
): RegisteredLightingBatch {
  return {
    indexById,
    writeBake(index, result) {
      writeBakeResult(
        result,
        index,
        aoA.array as Float32Array,
        aoB.array as Float32Array,
        sky.array as Float32Array,
      );
    },
    flush(indices) {
      if (indices.length === 0) return;
      const ordered = [...indices].sort((left, right) => left - right);
      const ranges: Array<readonly [number, number]> = [];
      let start = ordered[0];
      let end = start;
      for (let cursor = 1; cursor < ordered.length; cursor += 1) {
        const index = ordered[cursor];
        if (index <= end + 1) {
          end = Math.max(end, index);
        } else {
          ranges.push([start, end]);
          start = index;
          end = index;
        }
      }
      ranges.push([start, end]);
      // WebGL issues one bufferSubData call per range. If a time slice touched
      // many scattered rows, one wider upload is cheaper than dozens of calls.
      const uploads = ranges.length > 8
        ? [[ranges[0][0], ranges[ranges.length - 1][1]] as const]
        : ranges;
      for (const [first, last] of uploads) {
        const count = last - first + 1;
        aoA.addUpdateRange(first * 4, count * 4);
        aoB.addUpdateRange(first * 4, count * 4);
        sky.addUpdateRange(first, count);
      }
      aoA.needsUpdate = true;
      aoB.needsUpdate = true;
      sky.needsUpdate = true;
    },
  };
}

export class WorldLightingBake {
  private readonly baker: LightingBaker;
  private readonly results = new Map<string, PieceBakeResult>();
  private readonly pieceById = new Map<string, BreakablePieceDefinition>();
  private readonly spatial: SpatialIndex<BreakablePieceDefinition>;
  private readonly hidden = new Set<string>();
  private readonly batches = new Set<RegisteredLightingBatch>();
  private readonly destinationByPieceId = new Map<string, LightingDestination>();
  private readonly pendingBatchWrites = new Map<RegisteredLightingBatch, number[]>();
  private readonly initialQueue: readonly BreakablePieceDefinition[];
  private initialCursor = 0;
  private readonly removalQueue: BreakablePieceDefinition[] = [];
  private removalCursor = 0;
  private readonly affected = new Map<string, BreakablePieceDefinition>();

  constructor(pieces: readonly BreakablePieceDefinition[]) {
    this.baker = new LightingBaker(pieces);
    this.spatial = createSpatialIndex(pieces, 5);
    this.initialQueue = pieces;
    for (const piece of pieces) {
      this.pieceById.set(piece.id, piece);
    }
  }

  resultFor(pieceId: string): PieceBakeResult | undefined {
    return this.results.get(pieceId);
  }

  registerBatch(batch: RegisteredLightingBatch): () => void {
    this.batches.add(batch);
    const restored: number[] = [];
    for (const [pieceId, index] of batch.indexById) {
      this.destinationByPieceId.set(pieceId, { batch, index });
      const result = this.results.get(pieceId);
      if (!result) continue;
      batch.writeBake(index, result);
      restored.push(index);
    }
    this.flushBatch(batch, restored);
    return () => {
      this.batches.delete(batch);
      for (const pieceId of batch.indexById.keys()) {
        if (this.destinationByPieceId.get(pieceId)?.batch === batch) {
          this.destinationByPieceId.delete(pieceId);
        }
      }
    };
  }

  /**
   * Queue newly destroyed pieces. Expensive occupancy repair and neighbour
   * bakes are deliberately performed by processPending under a frame budget.
   */
  applyHidden(hiddenPieceIds: ReadonlySet<string>): void {
    for (const id of hiddenPieceIds) {
      if (this.hidden.has(id)) {
        continue;
      }
      this.hidden.add(id);
      const piece = this.pieceById.get(id);
      if (piece) {
        this.removalQueue.push(piece);
      }
    }
  }

  /**
   * Advance lighting work without monopolising a rendered frame. At least one
   * item is processed so progress cannot stall under a very small budget.
   * Returns the number of pieces handled during this call.
   */
  processPending(timeBudgetMs = 1.25): number {
    this.pendingBatchWrites.clear();
    const deadline = performance.now() + Math.max(0, timeBudgetMs);
    let processed = 0;
    const hasBudget = () => processed === 0 || performance.now() < deadline;
    try {
      // All queued removals update occupancy first. Otherwise a neighbour could
      // be baked against an intermediate world and immediately become stale.
      while (this.removalCursor < this.removalQueue.length && hasBudget()) {
        const piece = this.removalQueue[this.removalCursor];
        this.removalCursor += 1;
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
          this.affected.set(neighbor.id, neighbor);
        }
        this.baker.removePiece(piece, survivors);
        this.results.delete(piece.id);
        processed += 1;
      }
      if (this.removalCursor < this.removalQueue.length) {
        return processed;
      }
      this.removalQueue.length = 0;
      this.removalCursor = 0;

      while (this.affected.size > 0 && hasBudget()) {
        const entry = this.affected.entries().next().value as
          | [string, BreakablePieceDefinition]
          | undefined;
        if (!entry) break;
        const [pieceId, piece] = entry;
        this.affected.delete(pieceId);
        const result = this.baker.bakePiece(piece);
        this.results.set(piece.id, result);
        this.writeToBatch(piece.id, result);
        processed += 1;
      }
      if (this.affected.size > 0) {
        return processed;
      }

      while (this.initialCursor < this.initialQueue.length && hasBudget()) {
        const piece = this.initialQueue[this.initialCursor];
        this.initialCursor += 1;
        if (this.hidden.has(piece.id) || this.results.has(piece.id)) {
          continue;
        }
        const result = this.baker.bakePiece(piece);
        this.results.set(piece.id, result);
        this.writeToBatch(piece.id, result);
        processed += 1;
      }
      return processed;
    } finally {
      for (const [batch, indices] of this.pendingBatchWrites) {
        this.flushBatch(batch, indices);
      }
      this.pendingBatchWrites.clear();
    }
  }

  private writeToBatch(pieceId: string, result: PieceBakeResult): void {
    const destination = this.destinationByPieceId.get(pieceId);
    if (!destination) return;
    const { batch, index } = destination;
    batch.writeBake(index, result);
    const pending = this.pendingBatchWrites.get(batch);
    if (pending) pending.push(index);
    else this.pendingBatchWrites.set(batch, [index]);
  }

  private flushBatch(batch: RegisteredLightingBatch, indices: number[]): void {
    batch.flush(indices);
  }
}
