import assert from "node:assert/strict";
import test from "node:test";
import { OccupancyGrid } from "../games/make-a-mess/src/game/occupancyGrid.ts";
import { LightingBaker } from "../games/make-a-mess/src/game/bakedLighting.ts";
import { minasTirithScene } from "../games/make-a-mess/src/game/minasTirithScene.ts";

function box(id, position, size, rotation) {
  return { id, position, size, rotation };
}

test("the occupancy grid rasterizes boxes and raycasts against them", () => {
  const grid = new OccupancyGrid({
    cellSize: 0.5,
    min: [-10, -2, -10],
    max: [10, 10, 10],
  });
  grid.rasterizeBox(box("wall", [0, 2, 0], [4, 4, 0.6]));

  assert.equal(grid.isSolidAtPoint(0, 2, 0), true);
  assert.equal(grid.isSolidAtPoint(0, 2, 3), false);
  assert.equal(grid.isSolidAtPoint(0, 7, 0), false);

  // Ray from in front of the wall, straight at it: hits near z≈0.3.
  const hit = grid.raycast(0, 2, 5, 0, 0, -1, 20);
  assert.equal(hit > 3.5 && hit < 5.2, true);
  // Ray pointing away misses.
  assert.equal(grid.raycast(0, 2, 5, 0, 0, 1, 20), -1);

  // Removing the wall clears the cells while survivors are restored.
  const floor = box("floor", [0, 0.2, 0], [8, 0.4, 8]);
  grid.rasterizeBox(floor);
  grid.removeBox(box("wall", [0, 2, 0], [4, 4, 0.6]), [floor]);
  assert.equal(grid.isSolidAtPoint(0, 2, 0), false);
  assert.equal(grid.isSolidAtPoint(0, 0.2, 0), true);
});

test("rotated boxes rasterize into their rotated footprint", () => {
  const grid = new OccupancyGrid({
    cellSize: 0.25,
    min: [-6, -1, -6],
    max: [6, 6, 6],
  });
  // Long thin beam rotated 90° around Y: occupies along X afterwards.
  grid.rasterizeBox(box("beam", [0, 1, 0], [0.5, 0.5, 5], [0, Math.PI / 2, 0]));
  assert.equal(grid.isSolidAtPoint(2, 1, 0), true);
  assert.equal(grid.isSolidAtPoint(0, 1, 2), false);
});

test("an isolated slab bakes as fully open with full sky exposure", () => {
  const slab = box("slab", [0, 0.2, 0], [4, 0.4, 4]);
  const baker = new LightingBaker([slab]);
  const result = baker.bakePiece(slab);

  assert.equal(result.skyExposure > 0.95, true);
  for (const ao of result.cornerAo) {
    assert.equal(ao > 0.8, true, `corner ao ${ao} should be open`);
  }
});

test("a wall base darkens against the ground while its top stays open", () => {
  const ground = box("ground", [0, -0.2, 0], [20, 0.4, 20]);
  const wall = box("wall", [0, 2, 0], [4, 4, 0.7]);
  const baker = new LightingBaker([ground, wall]);
  const result = baker.bakePiece(wall);

  const bottomAo =
    (result.cornerAo[0] +
      result.cornerAo[1] +
      result.cornerAo[4] +
      result.cornerAo[5]) /
    4;
  const topAo =
    (result.cornerAo[2] +
      result.cornerAo[3] +
      result.cornerAo[6] +
      result.cornerAo[7]) /
    4;

  assert.equal(topAo > bottomAo + 0.1, true, `top ${topAo} vs bottom ${bottomAo}`);
});

test("an inner corner between two walls is darker than a free wall end", () => {
  const wallA = box("a", [0, 2, 0], [6, 4, 0.7]);
  const wallB = box("b", [2.65, 2, 3.35], [0.7, 4, 6]);
  const baker = new LightingBaker([wallA, wallB]);
  const result = baker.bakePiece(wallA);

  // WallB butts against wallA's +x end on the +z side: corner 5 (+x,-y,+z)
  // sits in the junction, corner 4 (-x,-y,+z) is the free end of the same
  // face at the same height.
  const nearJunction = result.cornerAo[5];
  const freeEnd = result.cornerAo[4];
  assert.equal(
    freeEnd > nearJunction + 0.08,
    true,
    `free ${freeEnd} vs junction ${nearJunction}`,
  );
});

test("a floor under a roof loses its sky exposure", () => {
  const floor = box("floor", [0, 0.2, 0], [6, 0.4, 6]);
  const roof = box("roof", [0, 5, 0], [8, 0.4, 8]);
  const baker = new LightingBaker([floor, roof]);

  const sheltered = baker.bakePiece(floor);
  assert.equal(sheltered.skyExposure < 0.25, true, `${sheltered.skyExposure}`);

  // After the roof is destroyed, the floor sees the sky again.
  baker.removePiece(roof, []);
  const open = baker.bakePiece(floor);
  assert.equal(open.skyExposure > 0.9, true, `${open.skyExposure}`);
});

test("adjacent ground tiles bake identical AO at their shared seam", () => {
  const tile = (id, x) => ({
    id,
    position: [x, -0.09, 0],
    size: [6.04, 0.26, 6.04],
    shape: "groundTile",
  });
  const wall = {
    id: "wall",
    position: [0, 2, -2.8],
    size: [10, 4, 0.7],
  };
  const left = tile("left", -3);
  const right = tile("right", 3);
  const baker = new LightingBaker([left, right, wall]);

  const leftBake = baker.bakePiece(left);
  const rightBake = baker.bakePiece(right);

  // Shared seam at x=0: left tile's +x corners vs right tile's -x corners,
  // both on the wall side (-z) and the open side (+z), top face.
  assert.equal(
    Math.abs(leftBake.cornerAo[3] - rightBake.cornerAo[2]) < 0.02,
    true,
    `wall-side seam ${leftBake.cornerAo[3]} vs ${rightBake.cornerAo[2]}`,
  );
  assert.equal(
    Math.abs(leftBake.cornerAo[7] - rightBake.cornerAo[6]) < 0.02,
    true,
    `open-side seam ${leftBake.cornerAo[7]} vs ${rightBake.cornerAo[6]}`,
  );
});

test("the full fortress bakes within a sane time and value range", () => {
  const pieces = minasTirithScene.breakablePieces;
  const started = Date.now();
  const baker = new LightingBaker(pieces);
  const rasterMs = Date.now() - started;

  const sampleStart = Date.now();
  const sampleCount = 400;
  let minAo = 1;
  let maxAo = 0;
  for (let index = 0; index < sampleCount; index += 1) {
    const piece =
      pieces[Math.floor((index / sampleCount) * pieces.length)];
    const result = baker.bakePiece(piece);
    for (const ao of result.cornerAo) {
      minAo = Math.min(minAo, ao);
      maxAo = Math.max(maxAo, ao);
    }
  }
  const bakeMs = Date.now() - sampleStart;
  const projectedFullBakeMs = (bakeMs / sampleCount) * pieces.length;

  assert.equal(rasterMs < 3000, true, `rasterize took ${rasterMs}ms`);
  assert.equal(
    projectedFullBakeMs < 12000,
    true,
    `projected full bake ${Math.round(projectedFullBakeMs)}ms`,
  );
  // The fortress must actually contain contrast: open tops and dark corners.
  assert.equal(maxAo > 0.85, true, `max ao ${maxAo}`);
  assert.equal(minAo < 0.55, true, `min ao ${minAo}`);
});
