import assert from "node:assert/strict";
import test from "node:test";
import {
  MEDIUM_DRAGON_MORPHOLOGY,
} from "../games/make-a-mess/src/content/objects/creatures/mediumDragonObject.ts";
import {
  MEDIUM_DRAGON_POSES,
  MEDIUM_DRAGON_SKELETON,
  mediumDragonPoseAtlasObject,
  mediumDragonRigStates,
} from "../games/make-a-mess/src/content/objects/creatures/mediumDragonRigObject.ts";
import {
  MEDIUM_PANTHER_POSES,
  MEDIUM_PANTHER_SKELETON,
  mediumPantherPoseAtlasObject,
  mediumPantherRigStates,
} from "../games/make-a-mess/src/content/objects/creatures/mediumPantherRigObject.ts";

const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

function approx(actual, expected, tolerance, message) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} vs ${expected}`);
}

function assertSkeletonContract(skeleton) {
  const ids = skeleton.bones.map((bone) => bone.id);
  assert.equal(new Set(ids).size, ids.length, `${skeleton.id}: duplicate bone id`);
  const known = new Set();
  for (const bone of skeleton.bones) {
    if (bone.parent) assert.ok(known.has(bone.parent), `${bone.id}: parent must precede child`);
    known.add(bone.id);
  }
  assert.ok(known.has(skeleton.rootBone));
  assert.ok(skeleton.excludedSimulation.length >= 4);
}

function assertPosePreservesBoneLengths(skeleton, poses, states) {
  const bones = new Map(skeleton.bones.map((bone) => [bone.id, bone]));
  for (const pose of poses) {
    const state = states[pose.id];
    assert.equal(state.reference, pose.reference);
    for (const bone of skeleton.bones) {
      if (!bone.parent) continue;
      const parent = bones.get(bone.parent);
      const restLength = distance(bone.rest[pose.reference], parent.rest[pose.reference]);
      const posedLength = distance(state.pivots[bone.id], state.pivots[parent.id]);
      approx(posedLength, restLength, 1e-9, `${pose.id}/${bone.id} changed length`);
    }
  }
}

function eulerMatrix([x, y, z]) {
  const a = Math.cos(x); const b = Math.sin(x);
  const c = Math.cos(y); const d = Math.sin(y);
  const e = Math.cos(z); const f = Math.sin(z);
  return [
    [c * e, -c * f, d],
    [a * f + b * e * d, a * e - b * f * d, -b * c],
    [b * f - a * e * d, b * e + a * f * d, a * c],
  ];
}

function rotatedBoxBottom(part) {
  assert.equal(part.kind, "box");
  const matrix = eulerMatrix(part.rotation ?? [0, 0, 0]);
  const halfY = Math.abs(matrix[1][0]) * part.size[0] / 2
    + Math.abs(matrix[1][1]) * part.size[1] / 2
    + Math.abs(matrix[1][2]) * part.size[2] / 2;
  return part.center[1] - halfY;
}

function assertGroundedPoseCandidatesTouch(model, poses) {
  for (const pose of poses.filter((candidate) => candidate.grounded)) {
    const contacts = pose.contactPartIds.map((id) => {
      const part = model.parts.find((candidate) => candidate.id === `${pose.id}--${id}`);
      assert.ok(part, `${pose.id}: missing ${id}`);
      return part;
    });
    const bottoms = contacts.map(rotatedBoxBottom);
    approx(Math.min(...bottoms), 0, 1e-8, `${pose.id}: no declared support reaches floor`);
    assert.ok(bottoms.every((bottom) => bottom >= -1e-8), `${pose.id}: declared support enters floor`);
  }
}

test("panther pose atlas uses one ordered skeleton and the complete key-action set", () => {
  assertSkeletonContract(MEDIUM_PANTHER_SKELETON);
  assert.deepEqual(MEDIUM_PANTHER_POSES.map((pose) => pose.id), [
    "stand-observe", "walk-support", "stalk", "gallop-gather", "gallop-extend",
    "jump-preload", "jump-flight", "landing-absorb", "lie-observe",
  ]);
  assertPosePreservesBoneLengths(MEDIUM_PANTHER_SKELETON, MEDIUM_PANTHER_POSES, mediumPantherRigStates);
  assert.equal(mediumPantherPoseAtlasObject.motionConstraints.singleCanonicalSkeleton, true);
  assert.equal(mediumPantherPoseAtlasObject.motionConstraints.runtimeRegistered, false);
  assert.equal(mediumPantherPoseAtlasObject.views.length, 11);
});

test("panther key poses retain causal body staging", () => {
  assert.ok(mediumPantherRigStates["lie-observe"].pivots.root[1] < mediumPantherRigStates["stand-observe"].pivots.root[1] - 0.2);
  assert.ok(mediumPantherRigStates["jump-flight"].pivots.root[1] > 1.5);
  assert.deepEqual(MEDIUM_PANTHER_POSES.find((pose) => pose.id === "landing-absorb").contactPartIds, ["left-fore-paw", "right-fore-paw"]);
  assert.equal(MEDIUM_PANTHER_POSES.find((pose) => pose.id === "gallop-gather").grounded, false);
  assert.equal(MEDIUM_PANTHER_POSES.find((pose) => pose.id === "gallop-extend").grounded, false);
  assertGroundedPoseCandidatesTouch(mediumPantherPoseAtlasObject, MEDIUM_PANTHER_POSES);
});

test("dragon folded and extended references preserve one wing and hindlimb skeleton", () => {
  assertSkeletonContract(MEDIUM_DRAGON_SKELETON);
  const bones = new Map(MEDIUM_DRAGON_SKELETON.bones.map((bone) => [bone.id, bone]));
  for (const bone of MEDIUM_DRAGON_SKELETON.bones) {
    if (!bone.parent) continue;
    const parent = bones.get(bone.parent);
    const folded = distance(bone.rest["ground-folded"], parent.rest["ground-folded"]);
    const extended = distance(bone.rest["flight-extended"], parent.rest["flight-extended"]);
    approx(folded, extended, Math.max(0.012, folded * 0.025), `${bone.id}: reference states changed bone length`);
  }
  const rightChain = ["right-shoulder", "right-elbow", "right-wrist", "right-metacarpal", "right-finger-1", "right-finger-2", "right-finger-3", "right-finger-4"];
  const expected = Object.values(MEDIUM_DRAGON_MORPHOLOGY.wingSegments);
  for (let index = 0; index < expected.length; index += 1) {
    const from = bones.get(rightChain[index]).rest["flight-extended"];
    const to = bones.get(rightChain[index + 1]).rest["flight-extended"];
    approx(distance(from, to), expected[index], 1e-9, `wing segment ${index + 1}`);
  }
});

test("dragon pose atlas covers key ground, flight and landing phases", () => {
  assert.deepEqual(MEDIUM_DRAGON_POSES.map((pose) => pose.id), [
    "ground-observe", "walk-support", "takeoff-preload", "takeoff-release",
    "flight-downstroke", "flight-upstroke", "glide", "bank-turn", "hover-brake",
    "dive", "landing-flare", "touchdown",
  ]);
  assertPosePreservesBoneLengths(MEDIUM_DRAGON_SKELETON, MEDIUM_DRAGON_POSES, mediumDragonRigStates);
  assert.equal(mediumDragonPoseAtlasObject.motionConstraints.singleCanonicalSkeleton, true);
  assert.equal(mediumDragonPoseAtlasObject.motionConstraints.aerodynamicForcesImplemented, false);
  assert.equal(mediumDragonPoseAtlasObject.views.length, 14);
  assertGroundedPoseCandidatesTouch(mediumDragonPoseAtlasObject, MEDIUM_DRAGON_POSES);
});

test("dragon wing and body phase silhouettes follow the described force sequence", () => {
  const down = mediumDragonRigStates["flight-downstroke"];
  const up = mediumDragonRigStates["flight-upstroke"];
  assert.ok(down.pivots["right-finger-4"][1] < down.pivots["right-shoulder"][1] - 0.8);
  assert.ok(up.pivots["right-finger-4"][1] > up.pivots["right-shoulder"][1] + 1.2);
  const bank = mediumDragonRigStates["bank-turn"];
  assert.ok(Math.abs(bank.pivots["left-finger-4"][1] - bank.pivots["right-finger-4"][1]) > 2.5);
  const dive = mediumDragonRigStates.dive;
  assert.ok(dive.pivots.head[1] < dive.pivots.pelvis[1], "dive nose must be below pelvis");
  const flare = mediumDragonRigStates["landing-flare"];
  assert.ok(flare.pivots.head[1] > flare.pivots.pelvis[1] + 1.2, "flare chest/head must rise");
  const touchdown = mediumDragonRigStates.touchdown;
  assert.ok(touchdown.pivots["left-finger-4"][1] > 0.5, "folded wing must stay above terrain at touchdown");
});

test("every action passport records intent, force and delayed response", () => {
  for (const pose of [...MEDIUM_PANTHER_POSES, ...MEDIUM_DRAGON_POSES]) {
    assert.ok(pose.intent.length > 12, `${pose.id}: missing intent`);
    assert.ok(pose.force.length > 12, `${pose.id}: missing force`);
    assert.ok(pose.response.length > 12, `${pose.id}: missing response`);
  }
});

test("pose atlases contain unique deterministic derivatives and remain outside the world", () => {
  for (const model of [mediumPantherPoseAtlasObject, mediumDragonPoseAtlasObject]) {
    const ids = model.parts.map((part) => part.id);
    assert.equal(new Set(ids).size, ids.length, `${model.id}: duplicate part ids`);
    assert.equal(model.motionConstraints.runtimeRegistered, false);
    assert.equal(model.coordinates.origin, "ground-centre");
    assert.ok(model.parts.length < 1500, `${model.id}: review atlas exceeded diagnostic budget`);
  }
});
