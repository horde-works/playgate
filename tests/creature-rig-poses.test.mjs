import assert from "node:assert/strict";
import test from "node:test";
import {
  MEDIUM_DRAGON_MORPHOLOGY,
} from "../games/make-a-mess/src/content/objects/creatures/mediumDragonObject.ts";
import {
  MEDIUM_DRAGON_POSES,
  MEDIUM_DRAGON_SKELETON,
  MEDIUM_DRAGON_WING_MOTION,
  MEDIUM_DRAGON_WING_PHASES,
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

test("panther pose atlas uses one ordered skeleton and complete action and gait sets", () => {
  assertSkeletonContract(MEDIUM_PANTHER_SKELETON);
  assert.deepEqual(MEDIUM_PANTHER_POSES.map((pose) => pose.id), [
    "stand-observe", "stalk", "jump-preload", "jump-flight", "landing-absorb", "lie-observe", "sit-observe",
    "walk-01-left-hind-lift", "walk-02-left-hind-place", "walk-03-left-fore-lift", "walk-04-left-fore-place",
    "walk-05-right-hind-lift", "walk-06-right-hind-place", "walk-07-right-fore-lift", "walk-08-right-fore-place",
    "trot-01-left-diagonal", "trot-02-flight", "trot-03-right-diagonal", "trot-04-flight",
    "gallop-01-extended-flight", "gallop-02-right-fore-contact", "gallop-03-left-fore-contact", "gallop-04-gathered-flight",
    "gallop-05-left-hind-contact", "gallop-06-right-hind-push", "gallop-07-spine-opening", "gallop-08-extended-flight",
    "accelerate-hind-drive", "brake-fore-absorb",
  ]);
  assertPosePreservesBoneLengths(MEDIUM_PANTHER_SKELETON, MEDIUM_PANTHER_POSES, mediumPantherRigStates);
  assert.equal(mediumPantherPoseAtlasObject.motionConstraints.singleCanonicalSkeleton, true);
  assert.equal(mediumPantherPoseAtlasObject.motionConstraints.runtimeRegistered, false);
  assert.equal(mediumPantherPoseAtlasObject.views.length, MEDIUM_PANTHER_POSES.length + 2);
});

test("panther key actions and gait phases retain causal body staging", () => {
  assert.ok(mediumPantherRigStates["lie-observe"].pivots.root[1] < mediumPantherRigStates["stand-observe"].pivots.root[1] - 0.2);
  const sit = mediumPantherRigStates["sit-observe"];
  assert.ok(sit.pivots.pelvis[1] < mediumPantherRigStates["stand-observe"].pivots.pelvis[1] - 0.18);
  assert.ok(sit.pivots.chest[1] > sit.pivots.pelvis[1] + 0.24, "sit-observe: chest must rise above seated pelvis");
  assert.ok(sit.pivots.head[1] > sit.pivots.chest[1] + 0.2, "sit-observe: neck must carry head above chest");
  assert.ok(sit.pivots.head[1] > mediumPantherRigStates["lie-observe"].pivots.head[1] + 0.2);
  assert.ok(Math.abs(sit.rotations.head[1][2]) < 0.01, "sit-observe: muzzle must remain level with the horizon");
  assert.ok(sit.rotations.head[2][2] > 0.99, "sit-observe: muzzle must face forward rather than up or down");
  for (const side of ["left", "right"]) {
    const foreChain = ["scapula", "forearm", "carpus", "forepaw"].map((bone) => sit.pivots[`${side}-${bone}`]);
    assert.ok(foreChain.every((pivot, index) => index === 0 || foreChain[index - 1][1] > pivot[1]), `sit-observe/${side}: forelimb must descend joint by joint`);
    assert.ok(Math.max(...foreChain.map((pivot) => pivot[2])) - Math.min(...foreChain.map((pivot) => pivot[2])) < 0.012, `sit-observe/${side}: forelimb must act as a straight support column`);
    assert.ok(sit.pivots[`${side}-knee`][2] > sit.pivots[`${side}-hip`][2] + 0.2, `sit-observe/${side}: knee must fold forward under the trunk`);
    assert.ok(sit.pivots[`${side}-hock`][2] < sit.pivots[`${side}-knee`][2] - 0.25, `sit-observe/${side}: hock must fold back beneath the pelvis`);
  }
  const seatedTail = Array.from({ length: 8 }, (_, index) => sit.pivots[`tail-${index}`]);
  assert.ok(Math.max(...seatedTail.map((pivot) => Math.abs(pivot[0]))) > 0.35, "sit-observe: tail must arc around one hip");
  assert.ok(distance(seatedTail.at(-1), sit.pivots.pelvis) < 0.43, "sit-observe: tail tip must return beside the seated pelvis");
  assert.ok(Math.min(...seatedTail.map((pivot) => pivot[1])) > 0.04, "sit-observe: curled tail must stay above the support surface");
  for (let index = 1; index <= 6; index += 1) {
    const joint = mediumPantherPoseAtlasObject.parts.find((part) => part.id === `sit-observe--tail-joint-${index}`);
    assert.ok(joint, `sit-observe: missing tail joint ${index}`);
    assert.ok(rotatedBoxBottom(joint) >= -1e-8, `sit-observe/tail-joint-${index}: curled tail enters terrain`);
  }
  assert.ok(mediumPantherRigStates["jump-flight"].pivots.root[1] > 1.5);
  assert.deepEqual(MEDIUM_PANTHER_POSES.find((pose) => pose.id === "landing-absorb").contactPartIds, ["left-fore-paw", "right-fore-paw"]);
  const byId = new Map(MEDIUM_PANTHER_POSES.map((pose) => [pose.id, pose]));
  assert.deepEqual(byId.get("trot-01-left-diagonal").contactPartIds, ["left-fore-paw", "right-hind-paw"]);
  assert.deepEqual(byId.get("trot-03-right-diagonal").contactPartIds, ["right-fore-paw", "left-hind-paw"]);
  assert.equal(byId.get("trot-02-flight").grounded, false);
  assert.equal(byId.get("trot-04-flight").grounded, false);
  assert.deepEqual(
    MEDIUM_PANTHER_POSES.filter((pose) => pose.id.startsWith("gallop-")).map((pose) => pose.contactPartIds),
    [[], ["right-fore-paw"], ["left-fore-paw"], [], ["left-hind-paw"], ["right-hind-paw"], [], []],
  );
  assertGroundedPoseCandidatesTouch(mediumPantherPoseAtlasObject, MEDIUM_PANTHER_POSES);
  for (const pawId of ["left-fore-paw", "right-fore-paw", "left-hind-paw", "right-hind-paw"]) {
    const paw = mediumPantherPoseAtlasObject.parts.find((candidate) => candidate.id === `sit-observe--${pawId}`);
    assert.ok(rotatedBoxBottom(paw) < 0.012, `sit-observe/${pawId}: declared paw floats`);
  }
  const locomotion = MEDIUM_PANTHER_POSES.filter((pose) => pose.grounded && /^(walk|trot|gallop|accelerate|brake)-/.test(pose.id));
  for (const pose of locomotion) {
    for (const pawId of ["left-fore-paw", "right-fore-paw", "left-hind-paw", "right-hind-paw"]) {
      const part = mediumPantherPoseAtlasObject.parts.find((candidate) => candidate.id === `${pose.id}--${pawId}`);
      assert.ok(rotatedBoxBottom(part) >= -1e-8, `${pose.id}/${pawId}: paw enters terrain`);
    }
  }
});

test("panther walk is an eight-frame lateral sequence rather than a diagonal support pose", () => {
  const walk = MEDIUM_PANTHER_POSES.filter((pose) => pose.id.startsWith("walk-"));
  assert.equal(walk.length, 8);
  assert.deepEqual(walk.map((pose) => pose.id.split("-").slice(2).join("-")), [
    "left-hind-lift", "left-hind-place", "left-fore-lift", "left-fore-place",
    "right-hind-lift", "right-hind-place", "right-fore-lift", "right-fore-place",
  ]);
  assert.deepEqual(walk.filter((_, index) => index % 2 === 0).map((pose) => pose.contactPartIds.length), [3, 3, 3, 3]);
  assert.deepEqual(walk.filter((_, index) => index % 2 === 1).map((pose) => pose.contactPartIds.length), [4, 4, 4, 4]);
  assert.ok(walk.every((pose) => pose.grounded));
  const firstRoot = mediumPantherRigStates[walk[0].id].pivots.root;
  const lastRoot = mediumPantherRigStates[walk[7].id].pivots.root;
  approx(firstRoot[0], lastRoot[0], 1e-12, "walk cycle root lateral discontinuity");
  approx(firstRoot[2], lastRoot[2], 1e-12, "walk cycle root fore-aft discontinuity");
  assert.ok(Math.abs(firstRoot[1] - lastRoot[1]) < 0.025, "walk cycle root height jump");
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

test("dragon pose atlas covers staged launch, wing morph and sequential landing", () => {
  assert.deepEqual(MEDIUM_DRAGON_POSES.map((pose) => pose.id), [
    "ground-observe", "walk-support", "takeoff-preload", "takeoff-hind-drive",
    "takeoff-manus-vault", "takeoff-clearance", "takeoff-unfold", "takeoff-first-downstroke",
    "flight-downstroke", "flight-upstroke", "glide", "bank-turn", "hover-brake",
    "dive", "landing-flare", "landing-touchdown", "landing-wing-unload", "ground-recovery",
  ]);
  assertPosePreservesBoneLengths(MEDIUM_DRAGON_SKELETON, MEDIUM_DRAGON_POSES, mediumDragonRigStates);
  assert.equal(mediumDragonPoseAtlasObject.motionConstraints.singleCanonicalSkeleton, true);
  assert.equal(mediumDragonPoseAtlasObject.motionConstraints.aerodynamicForcesImplemented, false);
  assert.equal(mediumDragonPoseAtlasObject.views.length, MEDIUM_DRAGON_POSES.length + 2);
  assertGroundedPoseCandidatesTouch(mediumDragonPoseAtlasObject, MEDIUM_DRAGON_POSES);
});

test("dragon wing and body phase silhouettes follow the described force sequence", () => {
  const down = mediumDragonRigStates["flight-downstroke"];
  const up = mediumDragonRigStates["flight-upstroke"];
  assert.ok(down.pivots["right-finger-4"][1] < down.pivots["right-shoulder"][1] - 0.8);
  assert.ok(up.pivots["right-finger-4"][1] > up.pivots["right-shoulder"][1] + 0.6);
  const span = (state) => distance(state.pivots["left-finger-4"], state.pivots["right-finger-4"]);
  assert.ok(
    up.pivots["right-finger-4"][1] - down.pivots["right-finger-4"][1] > 4.5,
    "shoulder stroke must dominate the visible vertical wing excursion",
  );
  assert.ok(span(up) < span(mediumDragonRigStates.glide) * 0.72, "upstroke must reduce outer span");
  assert.ok(span(up) > span(mediumDragonRigStates.glide) * 0.58, "recovery must not look like a full wing fold");
  assert.ok(span(mediumDragonRigStates["takeoff-clearance"]) < span(mediumDragonRigStates["takeoff-unfold"]) * 0.4, "wing must remain compact until clearance");
  assert.ok(span(mediumDragonRigStates.dive) < span(mediumDragonRigStates.glide) * 0.55, "dive must sweep the wing");
  const bank = mediumDragonRigStates["bank-turn"];
  assert.ok(Math.abs(bank.pivots["left-finger-4"][1] - bank.pivots["right-finger-4"][1]) > 2.5);
  const dive = mediumDragonRigStates.dive;
  assert.ok(dive.pivots.head[1] < dive.pivots.pelvis[1], "dive nose must be below pelvis");
  const flare = mediumDragonRigStates["landing-flare"];
  assert.ok(flare.pivots.head[1] > flare.pivots.pelvis[1] + 1.2, "flare chest/head must rise");
  assert.ok(
    flare.pivots["right-finger-4"][1]
      - mediumDragonRigStates["hover-brake"].pivots["right-finger-4"][1]
      > 1.35,
    "landing recovery and braking stroke need a visible vertical beat",
  );
  const touchdown = mediumDragonRigStates["landing-touchdown"];
  const unload = mediumDragonRigStates["landing-wing-unload"];
  assert.ok(span(touchdown) > span(mediumDragonRigStates.glide) * 0.9, "wing must remain open at hind touchdown");
  assert.ok(span(unload) < span(touchdown) * 0.45, "wing folds only after touchdown load transfer");
});

test("dragon long finger remains a spar while proximal joints own morphing", () => {
  const limit = MEDIUM_DRAGON_WING_MOTION.passiveInterphalangealLimitRad;
  for (const pose of MEDIUM_DRAGON_POSES) {
    for (const side of ["left", "right"]) {
      for (const control of MEDIUM_DRAGON_WING_MOTION.passiveInterphalangealControls) {
        const rotation = pose.boneRotations?.[`${side}-${control}`] ?? [0, 0, 0];
        assert.ok(Math.hypot(...rotation) <= limit + 1e-12, `${pose.id}/${side}-${control}: active-looking interphalangeal bend`);
      }
      assert.equal(pose.boneRotations?.[`${side}-${MEDIUM_DRAGON_WING_MOTION.terminalFingerControl}`], undefined);
    }
  }
  for (const id of ["takeoff-clearance", "flight-upstroke", "bank-turn", "dive", "landing-wing-unload"]) {
    const pose = MEDIUM_DRAGON_POSES.find((candidate) => candidate.id === id);
    for (const control of ["elbow", "wrist", "metacarpal"]) {
      const left = Math.hypot(...pose.boneRotations[`left-${control}`]);
      const right = Math.hypot(...pose.boneRotations[`right-${control}`]);
      assert.ok(Math.max(left, right) > 0.1, `${id}: ${control} must participate`);
    }
  }
});

test("dragon wing phase metadata and contacts preserve launch and landing order", () => {
  const phases = new Map(MEDIUM_DRAGON_WING_PHASES.map((phase) => [phase.poseId, phase]));
  assert.equal(phases.size, MEDIUM_DRAGON_WING_PHASES.length);
  for (const phase of MEDIUM_DRAGON_WING_PHASES) {
    assert.ok(MEDIUM_DRAGON_POSES.some((pose) => pose.id === phase.poseId));
    assert.ok(phase.leftAreaFraction > 0 && phase.leftAreaFraction <= 1);
    assert.ok(phase.rightAreaFraction > 0 && phase.rightAreaFraction <= 1);
  }
  const byId = new Map(MEDIUM_DRAGON_POSES.map((pose) => [pose.id, pose]));
  assert.deepEqual(byId.get("takeoff-preload").contactPartIds, ["left-manus-pad", "right-manus-pad", "left-hind-pad", "right-hind-pad"]);
  assert.deepEqual(byId.get("takeoff-manus-vault").contactPartIds, ["left-manus-pad", "right-manus-pad"]);
  assert.equal(byId.get("takeoff-clearance").grounded, false);
  assert.equal(byId.get("landing-touchdown").reference, "flight-extended");
  assert.equal(byId.get("landing-wing-unload").reference, "flight-extended");
  assert.equal(byId.get("ground-recovery").reference, "ground-folded");
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
    assert.ok(model.parts.length < 2200, `${model.id}: review atlas exceeded diagnostic budget`);
  }
});
