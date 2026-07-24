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
    radius: 0.04,
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

test("a visible grazing hit damages the occupied voxel box, not only its center", () => {
  const foundation = createSolidVoxelBody([12, 0.4, 8], 0.14, 4_500);
  const result = applyVoxelDamage(foundation, {
    point: [-0.9820359281437128, 0.2, 0.01596806387225591],
    direction: [0, -1, 0],
    penetration: 0.85,
    radius: 0.18 * Math.cbrt(1 / 2.4),
    roughness: 0.27,
    seed: "carve:1",
  });

  assert.deepEqual(foundation.dimensions, [48, 2, 46]);
  assert.ok(result.removedVoxelCount > 0);
});

test("a rocket-damaged coarse remnant accepts repeated visible hits", () => {
  const concreteScale = Math.cbrt(1 / 2.4);
  const foundation = createSolidVoxelBody([12, 0.4, 8], 0.14, 4_500);
  const rocketDamage = applyVoxelDamage(foundation, {
    point: [0, 0.2, 0],
    radius: 1.05 * concreteScale,
    roughness: 0.27,
    seed: "rocket:center",
  });
  const remnant = createVoxelBodyFromComponent(
    rocketDamage.body,
    rocketDamage.components[0],
  );
  const firstBullet = applyVoxelDamage(remnant.body, {
    point: [-0.9820359281437128, 0.2, 0.01596806387225591],
    direction: [0, -1, 0],
    penetration: 0.85,
    radius: 0.18 * concreteScale,
    roughness: 0.27,
    seed: "carve:1",
  });
  const secondBullet = applyVoxelDamage(firstBullet.body, {
    point: [2, 0.2, 0.02],
    direction: [0, -1, 0],
    penetration: 0.85,
    radius: 0.18 * concreteScale,
    roughness: 0.27,
    seed: "carve:2",
  });

  assert.ok(firstBullet.removedVoxelCount > 0);
  assert.ok(secondBullet.removedVoxelCount > 0);
  assert.ok(
    countOccupiedVoxels(secondBullet.body) <
      countOccupiedVoxels(remnant.body),
  );
});

test("sphere damage does not inflate diagonally past a voxel corner", () => {
  const voxel = createSolidVoxelBody([1, 1, 1], 1);
  const result = applyVoxelDamage(voxel, {
    point: [0.59, 0.59, 0],
    radius: 0.1,
    roughness: 0,
    seed: "rounded-corner",
  });

  assert.equal(result.removedVoxelCount, 0);
});
