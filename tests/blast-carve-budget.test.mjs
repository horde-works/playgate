import assert from "node:assert/strict";
import test from "node:test";

import {
  carveVoxelBudget,
  carveWorkUnits,
  selectCarveTargetsWithinBudget,
} from "../games/make-a-mess/src/game/destructionRuntime.ts";
import {
  createSolidVoxelBody,
  DEFAULT_MAX_VOXELS,
} from "../games/make-a-mess/src/game/voxelFracture.ts";

const BRICK = { material: "brick", size: [0.4, 0.24, 0.25] };
const PANEL = { material: "concrete", size: [1.86, 0.82, 0.22] };
const GROUND_SLAB = { material: "earth", size: [6, 0.9, 6] };

const ROCKET_BUDGET = {
  maxTargets: 80,
  workBudget: 20_000,
  groundWorkBudget: 3_000,
};

test("ground carve bodies get a small voxel ceiling, walls keep the full one", () => {
  assert.equal(carveVoxelBudget("earth") < DEFAULT_MAX_VOXELS, true);
  assert.equal(carveVoxelBudget("concrete"), DEFAULT_MAX_VOXELS);

  const groundBody = createSolidVoxelBody(
    GROUND_SLAB.size,
    0.16,
    carveVoxelBudget("earth"),
  );
  const voxels =
    groundBody.dimensions[0] *
    groundBody.dimensions[1] *
    groundBody.dimensions[2];
  assert.equal(voxels <= carveVoxelBudget("earth"), true);
  // The crater still has a usable grid, not a 2x2 blob.
  assert.equal(groundBody.dimensions[0] >= 12, true);
});

test("a ground slab costs at least an order of magnitude more than a brick", () => {
  const slab = carveWorkUnits(GROUND_SLAB.material, GROUND_SLAB.size);
  const brick = carveWorkUnits(BRICK.material, BRICK.size);
  assert.equal(slab >= brick * 10, true);
});

test("normal blast selections are identical to the old slice(0, 80)", () => {
  const targets = Array.from({ length: 120 }, (_, index) => ({
    id: index,
    source: index % 3 === 0 ? PANEL : BRICK,
  }));
  const selected = selectCarveTargetsWithinBudget(
    targets,
    (target) => target.source,
    ROCKET_BUDGET,
  );
  assert.deepEqual(
    selected.map((target) => target.id),
    targets.slice(0, 80).map((target) => target.id),
  );
});

test("nearby ground slabs cannot crowd real targets out of the budget", () => {
  // A rocket landing on the yard: ground plates are the closest "targets",
  // shop pieces come after them in the distance-sorted list.
  const targets = [
    ...Array.from({ length: 9 }, (_, index) => ({
      id: `ground:${index}`,
      source: GROUND_SLAB,
    })),
    ...Array.from({ length: 60 }, (_, index) => ({
      id: `shop:${index}`,
      source: index % 2 === 0 ? PANEL : BRICK,
    })),
  ];
  const selected = selectCarveTargetsWithinBudget(
    targets,
    (target) => target.source,
    ROCKET_BUDGET,
  );

  const groundSelected = selected.filter((target) =>
    String(target.id).startsWith("ground:"),
  );
  const shopSelected = selected.filter((target) =>
    String(target.id).startsWith("shop:"),
  );

  // Craters still appear under the impact...
  assert.equal(groundSelected.length >= 1, true);
  // ...but ground stops at its own slice of the budget...
  const groundWork = groundSelected.length *
    carveWorkUnits(GROUND_SLAB.material, GROUND_SLAB.size);
  assert.equal(groundWork <= ROCKET_BUDGET.groundWorkBudget, true);
  // ...and every shop piece still gets carved.
  assert.equal(shopSelected.length, 60);
});

test("a skipped ground slab never blocks later targets", () => {
  const targets = [
    { id: "ground:0", source: GROUND_SLAB },
    { id: "ground:1", source: GROUND_SLAB },
    { id: "ground:2", source: GROUND_SLAB },
    { id: "ground:3", source: GROUND_SLAB },
    { id: "wall", source: PANEL },
  ];
  const selected = selectCarveTargetsWithinBudget(
    targets,
    (target) => target.source,
    ROCKET_BUDGET,
  );
  assert.equal(
    selected.some((target) => target.id === "wall"),
    true,
  );
});

test("the direct-hit target is always carved even when overweight", () => {
  const giant = { material: "concrete", size: [7, 3.1, 4.9] };
  const selected = selectCarveTargetsWithinBudget(
    [{ id: "giant", source: giant }],
    (target) => target.source,
    { maxTargets: 80, workBudget: 100, groundWorkBudget: 100 },
  );
  assert.equal(selected.length, 1);
});
