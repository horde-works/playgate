import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  projectedDiameterPixels,
  selectTreeFoliageLod,
  TREE_FOLIAGE_LODS,
  treeFoliageTriangleBudget,
} from "../games/make-a-mess/src/game/treeVisualLod.ts";

test("foliage LOD is selected from projected size rather than world distance", () => {
  assert.equal(projectedDiameterPixels(1, 10, 1000, 1), 100);
  assert.equal(projectedDiameterPixels(1, 100, 1000, 1), 10);
  assert.equal(selectTreeFoliageLod(24, 0.5), "near");
  assert.equal(selectTreeFoliageLod(10, 0.5), "mid");
  assert.equal(selectTreeFoliageLod(2, 0.5), "far");
  assert.equal(selectTreeFoliageLod(0.2, 0.5), null);
});

test("real foliage geometries spend detail near and remove work at distance", () => {
  assert.deepEqual(
    TREE_FOLIAGE_LODS.map((profile) => profile.id),
    ["near", "mid", "far"],
  );

  // Previous broadleaf geometry was universally 72 cards / 144 triangles.
  assert.ok(treeFoliageTriangleBudget("broadleaf", "near") > 144);
  assert.ok(treeFoliageTriangleBudget("broadleaf", "mid") <= 64);
  assert.ok(treeFoliageTriangleBudget("broadleaf", "far") <= 20);

  // Canonical pine spray is 693 needles / 1,386 triangles.
  assert.equal(treeFoliageTriangleBudget("pine", "near"), 1386);
  assert.ok(treeFoliageTriangleBudget("pine", "mid") <= 472);
  assert.ok(treeFoliageTriangleBudget("pine", "far") <= 140);
});

test("renderer uses real LOD buffers instead of collapsing paid vertices", async () => {
  const source = await readFile(
    new URL("../games/make-a-mess/src/game/TreeVisuals.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /TREE_FOLIAGE_LODS\.map/);
  assert.match(source, /mesh\.count = counts\[profile\.id\]/);
  assert.match(source, /castShadow=\{profile\.id === "near"\}/);
  assert.doesNotMatch(source, /treeVisible/);
  assert.doesNotMatch(source, /treeDensity/);
});
