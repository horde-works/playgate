import assert from "node:assert/strict";
import test from "node:test";
import {
  kallurDocument,
  kallurLandscapeVisual,
} from "../games/make-a-mess/src/content/scenes/kallur/kallurDocument.ts";
import { kallurGroundTopAt } from "../games/make-a-mess/src/content/scenes/kallur/kallurLandscapeDocument.ts";
import { kallurCompilation, kallurScene } from "../games/make-a-mess/src/game/kallurScene.ts";

test("kallur: the world is a rest island and compiles indestructible", () => {
  assert.equal(kallurDocument.indestructible, true);
  assert.equal(kallurScene.indestructible, true);
  assert.equal(kallurScene.landscapeVisual, kallurLandscapeVisual);
});

test("kallur: every landscape triangle owner is a real piece", () => {
  const pieceIds = new Set(
    kallurScene.breakableClusters.flatMap((cluster) =>
      cluster.pieces.map((piece) => piece.id)
    ),
  );
  const missing = new Set();
  for (const chunk of kallurLandscapeVisual.chunks) {
    for (const owner of chunk.triangleOwners) {
      if (!pieceIds.has(owner)) missing.add(owner);
    }
  }
  assert.equal(
    missing.size,
    0,
    `landscape triangles reference missing pieces: ${[...missing].slice(0, 5).join(", ")}`,
  );
});

test("kallur: the player spawns above the walkable field", () => {
  const [x, y, z] = kallurDocument.world.playerSpawn;
  const ground = kallurGroundTopAt(x, z);
  assert.ok(
    y > ground && y - ground < 2.4,
    `spawn ${y.toFixed(2)} vs ground ${ground.toFixed(2)}: player must start just above the field`,
  );
});

test("kallur: piece and triangle budgets are recorded and bounded", () => {
  const pieceCount = kallurCompilation.artifact.pieceCount;
  const triangles = kallurLandscapeVisual.chunks.reduce(
    (total, chunk) => total + chunk.triangleOwners.length,
    0,
  );
  console.log(
    `kallur budgets: ${pieceCount} pieces, ${triangles} landscape triangles, ${kallurLandscapeVisual.chunks.length} chunks`,
  );
  assert.ok(pieceCount <= 7_000, `piece count ${pieceCount} exceeds budget`);
  assert.ok(triangles <= 400_000, `landscape triangles ${triangles} exceed budget`);
});

test("kallur: landscape geometry carries no NaN", () => {
  for (const chunk of kallurLandscapeVisual.chunks) {
    for (const vertex of chunk.vertices) {
      assert.ok(
        Number.isFinite(vertex[0]) && Number.isFinite(vertex[1]) && Number.isFinite(vertex[2]),
        `NaN vertex in chunk ${chunk.id}`,
      );
    }
  }
});
