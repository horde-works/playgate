import assert from "node:assert/strict";
import test from "node:test";

import {
  VILLAGER_BODY,
  VILLAGER_SKELETON,
  solveVillagerGait,
  villagerBone,
  villagerGaitBump,
  villagerStrideAngle,
} from "../games/make-a-mess/src/game/villagerBody.ts";

test("the canonical villager skeleton owns the articulated body", () => {
  assert.equal(VILLAGER_SKELETON[0].name, "root");
  assert.equal(VILLAGER_SKELETON[0].parent, null);
  assert.equal(new Set(VILLAGER_SKELETON.map((bone) => bone.name)).size, VILLAGER_SKELETON.length);

  for (const bone of VILLAGER_SKELETON.slice(1)) {
    assert.ok(bone.parent, `${bone.name} has a parent`);
    assert.ok(
      VILLAGER_SKELETON.some((candidate) => candidate.name === bone.parent),
      `${bone.name} parent ${bone.parent} exists`,
    );
  }

  assert.equal(villagerBone("leftHand").parent, "leftForearm");
  assert.equal(villagerBone("rightToe").parent, "rightFoot");
  assert.equal(villagerBone("head").parent, "neck");
  assert.equal(VILLAGER_BODY.legReach, 0.82);
});

test("canonical gait inputs preserve the accepted shader law", () => {
  const input = {
    phase: 2.17,
    speed: 0.73,
    strideLength: 0.76,
    build: 1.04,
    female: false,
  };
  const pose = solveVillagerGait(input);
  const expectedStride = Math.asin(
    Math.min(0.85, input.strideLength / (2 * VILLAGER_BODY.legReach * input.build)),
  );
  const expectedMove = input.speed / 0.85;

  assert.ok(Math.abs(pose.stride - expectedStride) < 1e-12);
  assert.ok(Math.abs(pose.move - expectedMove) < 1e-12);
  assert.ok(Math.abs(pose.armSwing - (expectedStride * 0.8 + 0.08)) < 1e-12);
  assert.ok(
    Math.abs(pose.left.hipFlexion - (expectedStride * Math.sin(input.phase) + 0.12) * expectedMove) <
      1e-12,
  );

  const cycle = ((input.phase - Math.PI / 2) / (Math.PI * 2) + 10) % 1;
  const expectedKnee =
    (0.3 * villagerGaitBump(cycle, 0.16, 0.1) +
      1.05 * villagerGaitBump(cycle, 0.73, 0.13)) *
    expectedMove;
  assert.ok(Math.abs(pose.left.kneeFlexion - expectedKnee) < 1e-12);
});

test("left and right supports remain half a cycle apart", () => {
  for (let sample = 0; sample < 96; sample += 1) {
    const pose = solveVillagerGait({
      phase: (sample / 96) * Math.PI * 2,
      speed: 1.2,
      strideLength: 0.72,
      build: 1,
      female: false,
    });
    const separation = ((pose.right.cycle - pose.left.cycle) + 1) % 1;
    assert.ok(Math.abs(separation - 0.5) < 1e-12);
    assert.ok(pose.left.supporting || pose.right.supporting, "walking always has a support foot");
  }
});

test("female gait keeps cadence inputs but applies the accepted joint differences", () => {
  const common = {
    phase: 1.3,
    speed: 1.1,
    strideLength: 0.68,
    build: 0.96,
  };
  const male = solveVillagerGait({ ...common, female: false });
  const female = solveVillagerGait({ ...common, female: true });

  assert.equal(female.phase, male.phase);
  assert.equal(female.move, male.move);
  assert.equal(female.stride, male.stride);
  assert.ok(Math.abs(female.left.hipFlexion - male.left.hipFlexion * 1.06) < 1e-12);
  assert.ok(Math.abs(female.left.armFlexion - male.left.armFlexion * 0.62) < 1e-12);
});

test("stride angle is bounded for malformed or extreme bodies", () => {
  assert.ok(Number.isFinite(villagerStrideAngle(0.75, 0)));
  assert.ok(villagerStrideAngle(10, 0.6) <= Math.asin(0.85));
});

