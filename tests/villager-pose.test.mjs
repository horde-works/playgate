import assert from "node:assert/strict";
import test from "node:test";

import { solveVillagerPose } from "../games/make-a-mess/src/game/villagerPose.ts";

const BASE = {
  phase: 1.2,
  speed: 1.1,
  strideLength: 0.72,
  build: 1,
  female: false,
  climbKind: 0,
  climbProgress: 0,
  restY: 0,
  atTable: false,
  carryRaw: 0,
  handKind: 0,
  startle: 0,
  startleProgress: 0,
  attention: 0,
};

test("the unified pose keeps walking legs and arms in opposition", () => {
  const pose = solveVillagerPose(BASE);
  assert.ok(Math.sign(pose.left.hipX) !== Math.sign(pose.right.hipX));
  assert.ok(Math.sign(pose.left.shoulderX) !== Math.sign(pose.right.shoulderX));
  assert.ok(Number.isFinite(pose.left.ankleX));
  assert.ok(Number.isFinite(pose.right.kneeX));
});

test("carrying changes the same skeleton instead of selecting another body", () => {
  const walking = solveVillagerPose(BASE);
  const carrying = solveVillagerPose({ ...BASE, carryRaw: 1 });
  assert.equal(carrying.left.hipX, walking.left.hipX);
  assert.equal(carrying.right.kneeX, walking.right.kneeX);
  assert.ok(Math.abs(carrying.left.shoulderX) > Math.abs(walking.left.shoulderX));
  assert.ok(carrying.left.shoulderX < -1.3);
  assert.ok(carrying.left.elbowX < -1);
});

test("sitting preserves foot chains and lowers the whole body", () => {
  const pose = solveVillagerPose({
    ...BASE,
    speed: 0,
    climbKind: 5,
    climbProgress: 1,
    restY: 0.48,
  });
  assert.ok(pose.bodySink > 0.3);
  assert.ok(pose.left.kneeX > 1.4);
  assert.ok(pose.right.kneeX > 1.4);
  assert.ok(pose.left.hipX < -1.4);
});

test("work targets solve each hand through the shared arm chain", () => {
  const forge = solveVillagerPose({
    ...BASE,
    speed: 0,
    climbKind: 13,
    climbProgress: 0.3,
    handKind: 5,
  });
  assert.ok(Number.isFinite(forge.left.shoulderX));
  assert.ok(Number.isFinite(forge.right.shoulderX));
  assert.notEqual(forge.left.shoulderX, forge.right.shoulderX);
  assert.ok(forge.chestPitch > 0);
});

test("startle and attention are modifiers on the solved pose", () => {
  const pose = solveVillagerPose({
    ...BASE,
    startle: 0.9,
    startleProgress: 0.2,
    attention: 1.7,
  });
  assert.ok(pose.alarm > 0);
  assert.equal(pose.watch, 1);
  assert.ok(Math.abs(pose.duck - 0.7) < 1e-12);
});
