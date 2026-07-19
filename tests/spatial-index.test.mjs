import assert from "node:assert/strict";
import test from "node:test";
import {
  createSpatialIndex,
} from "../games/make-a-mess/src/game/spatialIndex.ts";

const index = createSpatialIndex(
  [
    { id: "origin", position: [0, 0, 0] },
    { id: "near", position: [2.5, 0, 0] },
    { id: "diagonal", position: [2, 2, 2] },
    { id: "far", position: [20, 0, 0] },
  ],
  4,
);

test("spatial queries only return objects inside the requested sphere", () => {
  assert.deepEqual(
    index
      .querySphere([0, 0, 0], 3)
      .map((item) => item.id)
      .sort(),
    ["near", "origin"],
  );
});

test("spatial queries cross cell and negative-coordinate boundaries", () => {
  const boundaryIndex = createSpatialIndex(
    [
      { id: "negative", position: [-4.1, 0, 0] },
      { id: "positive", position: [4.1, 0, 0] },
    ],
    4,
  );

  assert.deepEqual(
    boundaryIndex
      .querySphere([0, 0, 0], 4.2)
      .map((item) => item.id)
      .sort(),
    ["negative", "positive"],
  );
});
