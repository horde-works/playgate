import assert from "node:assert/strict";
import test from "node:test";

import {
  applyVoxelDamage,
  countOccupiedVoxels,
  createSolidVoxelBody,
  createVoxelBodyFromComponent,
} from "../games/make-a-mess/src/game/voxelFracture.ts";

function boxVoxelCount(component) {
  return component.boxes.reduce((sum, box) => sum + box.voxelCount, 0);
}

test("damage removes actual voxels and keeps an exact volume account", () => {
  const original = createSolidVoxelBody([2.4, 1.2, 0.3], 0.12);
  const before = countOccupiedVoxels(original);
  const result = applyVoxelDamage(original, {
    point: [0, 0, -0.15],
    direction: [0, 0, 1],
    penetration: 0.3,
    radius: 0.24,
    roughness: 0.18,
    seed: "bullet-1",
  });
  const after = countOccupiedVoxels(result.body);

  assert.ok(result.removedVoxelCount > 0);
  assert.equal(before - after, result.removedVoxelCount);
  assert.equal(
    result.components.reduce(
      (sum, component) => sum + component.voxelCount,
      0,
    ),
    after,
  );
});

test("a cross-cut produces topology-defined fragments rather than a preset count", () => {
  const beam = createSolidVoxelBody([4.8, 0.24, 0.36], 0.12);
  const narrowCut = applyVoxelDamage(beam, {
    point: [0.9, -0.12, 0],
    direction: [0, 1, 0],
    penetration: 0.24,
    radius: 0.08,
    roughness: 0,
    seed: "narrow",
  });
  const wideCut = applyVoxelDamage(beam, {
    point: [0.9, -0.12, 0],
    direction: [0, 1, 0],
    penetration: 0.24,
    radius: 0.32,
    roughness: 0,
    seed: "wide",
  });

  assert.equal(narrowCut.components.length, 1);
  assert.equal(wideCut.components.length, 2);
  assert.notEqual(
    wideCut.components[0].voxelCount,
    wideCut.components[1].voxelCount,
  );
});

test("connected components are greedily merged without changing their volume", () => {
  const wall = createSolidVoxelBody([2.4, 1.8, 0.36], 0.12);
  const result = applyVoxelDamage(wall, {
    point: [0.2, 0.1, -0.18],
    direction: [0, 0, 1],
    penetration: 0.36,
    radius: 0.38,
    roughness: 0.28,
    seed: "irregular-hole",
  });

  assert.equal(result.components.length, 1);
  assert.equal(
    boxVoxelCount(result.components[0]),
    result.components[0].voxelCount,
  );
  assert.ok(result.components[0].boxes.length > 1);
  assert.ok(
    result.components[0].boxes.length <
      result.components[0].voxelCount,
  );
});

test("a detached component remains destructible after becoming its own body", () => {
  const beam = createSolidVoxelBody([3.6, 0.24, 0.36], 0.12);
  const first = applyVoxelDamage(beam, {
    point: [0, -0.12, 0],
    direction: [0, 1, 0],
    penetration: 0.24,
    radius: 0.3,
    roughness: 0,
    seed: "first",
  });
  assert.equal(first.components.length, 2);

  const detached = createVoxelBodyFromComponent(
    first.body,
    first.components[0],
  );
  const second = applyVoxelDamage(detached.body, {
    point: [detached.body.size[0] * 0.24, -0.12, 0],
    direction: [0, 1, 0],
    penetration: 0.24,
    radius: 0.28,
    roughness: 0.12,
    seed: "second",
  });

  assert.ok(second.removedVoxelCount > 0);
  assert.ok(second.components.length >= 1);
  assert.ok(
    countOccupiedVoxels(second.body) <
      countOccupiedVoxels(detached.body),
  );
});
