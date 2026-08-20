import assert from "node:assert/strict";
import test from "node:test";
import {
  cylinderDistanceLodSegments,
  cylinderLodSegments,
} from "../games/make-a-mess/src/game/intactPieceGeometry.ts";

test("thin rods drop cylinder tessellation, large columns keep twenty sides", () => {
  assert.equal(
    cylinderLodSegments({ size: [0.08, 0.2, 0.08] }),
    8,
  );
  assert.equal(
    cylinderLodSegments({ size: [0.4, 0.9, 0.4] }),
    12,
  );
  assert.equal(
    cylinderLodSegments({ size: [0.8, 4.2, 0.8] }),
    20,
  );
});

test("distance may only lower tessellation below the size floor", () => {
  assert.equal(cylinderDistanceLodSegments(8, 1, 8), 8);
  assert.equal(cylinderDistanceLodSegments(12, 1, 12), 12);
  assert.equal(cylinderDistanceLodSegments(20, 50, 20), 12);
  assert.equal(cylinderDistanceLodSegments(20, 50, 12), 8);
});

test("cylinder distance LOD uses hysteresis so columns do not flicker", () => {
  assert.equal(cylinderDistanceLodSegments(20, 21, 20), 12);
  assert.equal(cylinderDistanceLodSegments(20, 19, 12), 12);
  assert.equal(cylinderDistanceLodSegments(20, 15, 12), 20);
  assert.equal(cylinderDistanceLodSegments(20, 42, 8), 8);
  assert.equal(cylinderDistanceLodSegments(20, 41, 8), 12);
  assert.equal(cylinderDistanceLodSegments(20, 48, 12), 12);
  assert.equal(cylinderDistanceLodSegments(20, 49, 12), 8);
});
