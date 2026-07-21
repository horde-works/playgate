import assert from "node:assert/strict";
import test from "node:test";
import {
  applyHiddenPieceDiff,
  buildIntactInstanceBatches,
} from "../games/make-a-mess/src/game/intactWorldBatching.ts";
import { minasTirithScene } from "../games/make-a-mess/src/game/minasTirithScene.ts";

function piece(id, material, position, overrides = {}) {
  return {
    id,
    clusterId: "test",
    material,
    shape: "stoneBlock",
    position,
    size: [1, 1, 1],
    color: "#404040",
    ...overrides,
  };
}

test("batch grouping does not depend on which pieces are broken", () => {
  const pieces = [
    piece("a", "basalt", [0, 0, 0]),
    piece("b", "basalt", [2, 0, 0]),
    piece("c", "wood", [4, 0, 0]),
  ];

  const all = buildIntactInstanceBatches(pieces);
  const withoutMiddle = buildIntactInstanceBatches([pieces[0], pieces[2]]);

  assert.deepEqual(
    all.map((batch) => batch.id).toSorted(),
    withoutMiddle.map((batch) => batch.id).toSorted(),
  );
  const basalt = all.find((batch) => batch.material === "basalt");
  assert.deepEqual(
    basalt.pieces.map((entry) => entry.id),
    ["a", "b"],
  );
});

test("the whole fortress renders as a stable, small set of instanced batches", () => {
  const batches = buildIntactInstanceBatches(minasTirithScene.breakablePieces);

  assert.equal(batches.length < 32, true);
  assert.equal(
    batches.reduce((total, batch) => total + batch.pieces.length, 0),
    minasTirithScene.breakablePieces.length,
  );
  // Dark-tower masonry carries baked silicate seams inside its base batches.
  assert.equal(
    batches.some((batch) => batch.jointed),
    true,
  );
});

test("hiding and restoring pieces touches only the changed instances", () => {
  const pieces = [
    piece("a", "basalt", [0, 0, 0]),
    piece("b", "basalt", [2, 0, 0]),
    piece("c", "basalt", [4, 0, 0]),
  ];
  const applied = new Set();

  const first = applyHiddenPieceDiff(pieces, applied, new Set(["b"]));
  assert.deepEqual(first, { hide: [1], restore: [] });

  // Same target set again: nothing to write.
  const repeat = applyHiddenPieceDiff(pieces, applied, new Set(["b"]));
  assert.deepEqual(repeat, { hide: [], restore: [] });

  // One more hidden, the earlier one restored.
  const second = applyHiddenPieceDiff(pieces, applied, new Set(["c"]));
  assert.deepEqual(second, { hide: [2], restore: [1] });
  assert.deepEqual([...applied], ["c"]);

  // Ids from other batches are ignored entirely.
  const foreign = applyHiddenPieceDiff(
    pieces,
    applied,
    new Set(["c", "not-in-this-batch"]),
  );
  assert.deepEqual(foreign, { hide: [], restore: [] });
});
