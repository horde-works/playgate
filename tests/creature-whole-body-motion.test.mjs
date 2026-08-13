import assert from "node:assert/strict";
import test from "node:test";
import { Matrix4, Quaternion, Vector3 } from "three";
import {
  createCreatureWholeBodyState,
  creatureContactWindow,
  solveCreatureWholeBodyPose,
} from "../games/make-a-mess/src/game/creatureWholeBodyMotion.ts";

function filteredStep(frameRate) {
  const target = [new Matrix4()];
  const desired = [new Matrix4()];
  const state = createCreatureWholeBodyState(1);
  const position = new Vector3();
  const samples = [];
  solveCreatureWholeBodyPose(target, desired, state, 0, 0.04);
  desired[0].makeTranslation(1, 0, 0);
  for (let frame = 1; frame <= frameRate; frame += 1) {
    solveCreatureWholeBodyPose(target, desired, state, frame / frameRate, 0.04);
    position.setFromMatrixPosition(target[0]);
    samples.push(position.x);
  }
  return samples;
}

test("whole-body controller turns a keyframe jump into a bounded damped response", () => {
  const samples = filteredStep(60);
  assert.ok(samples[0] > 0 && samples[0] < 0.08, `first frame moved ${samples[0]}`);
  assert.ok(samples.every((value, index) => index === 0 || value >= samples[index - 1]));
  assert.ok(samples[23] > 0.9, `pose reached only ${samples[23]} after 0.4 s`);
  assert.ok(samples.at(-1) > 0.999, `pose never settled: ${samples.at(-1)}`);
});

test("whole-body controller has the same physical response at different frame rates", () => {
  const at30 = filteredStep(30);
  const at120 = filteredStep(120);
  for (const second of [0.1, 0.2, 0.4, 0.8]) {
    const sample30 = at30[Math.round(second * 30) - 1];
    const sample120 = at120[Math.round(second * 120) - 1];
    assert.ok(Math.abs(sample30 - sample120) < 0.015, `${second}s: ${sample30} vs ${sample120}`);
  }
});

test("whole-body damping preserves a connected parent-child chain", () => {
  const target = [new Matrix4(), new Matrix4()];
  const desired = [new Matrix4(), new Matrix4().makeTranslation(1, 0, 0)];
  const state = createCreatureWholeBodyState(2, [-1, 0]);
  const root = new Vector3();
  const child = new Vector3();
  solveCreatureWholeBodyPose(target, desired, state, 0, 0.05);

  const turn = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 2);
  desired[0].compose(new Vector3(), turn, new Vector3(1, 1, 1));
  // A poorly blended authored pivot asks for a 1.4 m segment. The skeletal
  // controller must retain its initialized 1 m anatomy while following the
  // requested rotation.
  desired[1].compose(new Vector3(0, 1.4, 0), turn, new Vector3(1, 1, 1));
  for (let frame = 1; frame <= 60; frame += 1) {
    solveCreatureWholeBodyPose(target, desired, state, frame / 60, 0.05);
    root.setFromMatrixPosition(target[0]);
    child.setFromMatrixPosition(target[1]);
    assert.ok(
      Math.abs(root.distanceTo(child) - 1) < 1e-6,
      `frame ${frame}: connected bone length became ${root.distanceTo(child)}`,
    );
  }
});

test("cyclic creature contact gains and releases load without a one-frame edge", () => {
  const samples = Array.from({ length: 601 }, (_, index) => (
    creatureContactWindow(index / 600, 0.5, 0.16, 0.09)
  ));
  const maximumStep = Math.max(...samples.slice(1).map(
    (value, index) => Math.abs(value - samples[index]),
  ));
  assert.ok(maximumStep < 0.04, `contact edge jumps by ${maximumStep}`);
  assert.equal(samples[300], 1);
  assert.equal(samples[0], 0);
});
