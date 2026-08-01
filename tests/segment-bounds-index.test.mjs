import assert from "node:assert/strict";
import test from "node:test";
import { createSegmentBoundsIndex } from "../games/make-a-mess/src/game/segmentBoundsIndex.ts";

test("segment index keeps possible blockers and rejects distant geometry", () => {
  const items = [
    { id: "wall", center: [5, 0, 0], size: [1, 4, 4] },
    { id: "far", center: [5, 0, 20], size: [2, 2, 2] },
    { id: "target", center: [10, 0, 0], size: [1, 1, 1] },
  ];
  const index = createSegmentBoundsIndex(
    items,
    (item) => ({ center: item.center, size: item.size }),
    2,
  );
  const candidates = index.candidatesAlong([0, 0, 0], [10, 0, 0]);
  assert.equal(candidates.some((item) => item.id === "wall"), true);
  assert.equal(candidates.some((item) => item.id === "target"), true);
  assert.equal(candidates.some((item) => item.id === "far"), false);
});
