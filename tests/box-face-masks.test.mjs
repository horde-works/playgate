import assert from "node:assert/strict";
import test from "node:test";
import { computeBoxFaceMasks } from "../games/make-a-mess/src/game/boxFaceMasks.ts";

const box = (center, size) => ({ center, size });

test("a single box is fully exposed", () => {
  const [masks] = computeBoxFaceMasks([box([0, 0, 0], [2, 1, 2])]);
  assert.deepEqual(masks.positive, [1, 1, 1]);
  assert.deepEqual(masks.negative, [1, 1, 1]);
});

test("edge suppression keeps a damaged ground body optically flat", () => {
  const masks = computeBoxFaceMasks([
    box([0, 0, 0], [2, 0.3, 2]),
    box([0.8, 0, 0], [0.4, 0.3, 0.4]),
  ], true);
  assert.deepEqual(
    masks,
    [
      { positive: [0, 0, 0], negative: [0, 0, 0] },
      { positive: [0, 0, 0], negative: [0, 0, 0] },
    ],
  );
});

test("two flush boxes hide only their shared faces", () => {
  // Side by side along X: A's +X face meets B's -X face.
  const [a, b] = computeBoxFaceMasks([
    box([-1, 0, 0], [2, 1, 3]),
    box([1, 0, 0], [2, 1, 3]),
  ]);

  assert.deepEqual(a.positive, [0, 1, 1]);
  assert.deepEqual(a.negative, [1, 1, 1]);
  assert.deepEqual(b.positive, [1, 1, 1]);
  assert.deepEqual(b.negative, [0, 1, 1]);
});

test("a small partial contact keeps the face exposed", () => {
  // B touches only 25% of A's +X face → the face stays an exposed edge.
  const [a] = computeBoxFaceMasks([
    box([-1, 0, 0], [2, 2, 2]),
    box([0.5, 0.75, 0.75], [1, 0.5, 0.5]),
  ]);
  assert.deepEqual(a.positive, [1, 1, 1]);
});

test("boxes with a gap between them stay exposed", () => {
  const [a, b] = computeBoxFaceMasks([
    box([-1, 0, 0], [2, 1, 2]),
    box([1.2, 0, 0], [2, 1, 2]),
  ]);
  assert.deepEqual(a.positive, [1, 1, 1]);
  assert.deepEqual(b.negative, [1, 1, 1]);
});

test("a carved ground tile only exposes the hole and outer rim", () => {
  // A 6 m tile split by a central hole into 4 strips (greedy-mesh style):
  // west strip, east strip, north strip, south strip around a missing middle.
  const tile = computeBoxFaceMasks([
    box([-2.25, 0, 0], [1.5, 0.26, 6]), // west, full depth
    box([2.25, 0, 0], [1.5, 0.26, 6]), // east, full depth
    box([0, 0, -2.25], [3, 0.26, 1.5]), // north, between strips
    box([0, 0, 2.25], [3, 0.26, 1.5]), // south, between strips
  ]);

  const [west, , north] = tile;
  // West strip: +X face is only partially covered by the north/south strips
  // (the hole gapes in the middle) → stays exposed; outer -X face exposed.
  assert.deepEqual(west.negative, [1, 1, 1]);
  // North strip: its -X/+X faces touch the west/east strips fully → internal.
  assert.deepEqual(north.positive, [0, 1, 1]);
  assert.deepEqual(north.negative, [0, 1, 1]);
  // Tops stay exposed everywhere.
  assert.equal(tile.every((mask) => mask.positive[1] === 1), true);
});
