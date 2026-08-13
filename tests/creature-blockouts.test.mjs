import assert from "node:assert/strict";
import test from "node:test";
import {
  MEDIUM_DRAGON_MORPHOLOGY,
  mediumDragonFlightObject,
  mediumDragonGroundObject,
} from "../games/make-a-mess/src/content/objects/creatures/mediumDragonObject.ts";
import {
  MEDIUM_PANTHER_MORPHOLOGY,
  mediumPantherObject,
} from "../games/make-a-mess/src/content/objects/creatures/mediumPantherObject.ts";

function assertUniquePartIds(model) {
  const ids = model.parts.map((part) => part.id);
  assert.equal(new Set(ids).size, ids.length, `${model.id}: duplicate part id`);
}

function boxBottom(part) {
  assert.equal(part.kind, "box");
  return part.center[1] - part.size[1] / 2;
}

test("medium panther is one authored leopard individual, not a generic panther scale", () => {
  assert.equal(MEDIUM_PANTHER_MORPHOLOGY.species, "Panthera pardus");
  assert.equal(MEDIUM_PANTHER_MORPHOLOGY.mass, 50);
  assert.equal(MEDIUM_PANTHER_MORPHOLOGY.shoulderHeight, 0.7);
  assert.equal(MEDIUM_PANTHER_MORPHOLOGY.noseToTailBase, 1.35);
  assert.equal(MEDIUM_PANTHER_MORPHOLOGY.tailLength, 0.9);
  assert.equal(MEDIUM_PANTHER_MORPHOLOGY.chestWidth > MEDIUM_PANTHER_MORPHOLOGY.pelvisWidth, true);
});

test("panther body exposes axial masses, scapulae, true hocks and four grounded paws", () => {
  assertUniquePartIds(mediumPantherObject);
  for (const id of ["ribcage", "lumbar", "pelvis", "left-scapula", "right-scapula", "left-hock", "right-hock"]) {
    assert.ok(mediumPantherObject.parts.some((part) => part.id === id), `missing ${id}`);
  }
  const paws = mediumPantherObject.parts.filter((part) => /-(fore|hind)-paw$/.test(part.id));
  assert.equal(paws.length, 4);
  for (const paw of paws) assert.ok(Math.abs(boxBottom(paw)) < 1e-9, `${paw.id} misses floor`);
  assert.equal(mediumPantherObject.parts.length < 80, true, "blockout exceeded primitive budget");
});

test("medium dragon uses the accepted four-limbed body plan and coherent wing scale", () => {
  assert.equal(MEDIUM_DRAGON_MORPHOLOGY.bodyPlan, "quadrupedal-wing-forelimbs");
  assert.equal(MEDIUM_DRAGON_MORPHOLOGY.mass, 180);
  assert.equal(MEDIUM_DRAGON_MORPHOLOGY.wingArea, 22.5);
  assert.ok(Math.abs(Math.sqrt(22.5 * 6) - MEDIUM_DRAGON_MORPHOLOGY.span) < 0.01);
  const segments = Object.values(MEDIUM_DRAGON_MORPHOLOGY.wingSegments);
  assert.ok(Math.abs(segments.reduce((sum, value) => sum + value, 0) - 5.35) < 0.02);
});

test("dragon ground pose has four contacts and folded finger chains off the floor", () => {
  assertUniquePartIds(mediumDragonGroundObject);
  const contacts = mediumDragonGroundObject.parts.filter((part) => /-(manus-pad|hind-pad)$/.test(part.id));
  assert.equal(contacts.length, 4);
  for (const contact of contacts) assert.ok(Math.abs(boxBottom(contact)) < 1e-9, `${contact.id} misses floor`);
  const fingers = mediumDragonGroundObject.parts.filter((part) => part.id.includes("wing-finger"));
  assert.equal(fingers.length, 8);
  assert.equal(fingers.every((part) => part.kind === "beam" && part.from[1] > 0.4 && part.to[1] > 0.4), true);
});

test("dragon diagnostic flight pose reaches the exact span from the same contract", () => {
  assertUniquePartIds(mediumDragonFlightObject);
  const left = mediumDragonFlightObject.anchors.leftWingTip;
  const right = mediumDragonFlightObject.anchors.rightWingTip;
  assert.equal(right[0] - left[0], MEDIUM_DRAGON_MORPHOLOGY.span);
  assert.deepEqual(
    mediumDragonFlightObject.dimensions,
    mediumDragonGroundObject.dimensions,
    "ground and flight poses diverged in morphology",
  );
  assert.equal(mediumDragonFlightObject.parts.filter((part) => part.group === "wing-membrane").length >= 12, true);
  assert.equal(mediumDragonFlightObject.parts.length < 120, true, "blockout exceeded primitive budget");
});

test("creature studies remain isolated Object Lab assets", () => {
  for (const model of [mediumPantherObject, mediumDragonGroundObject, mediumDragonFlightObject]) {
    assert.equal(model.motionConstraints.runtimeRegistered, false);
    assert.equal(model.coordinates.origin, "ground-centre");
    assert.equal(model.views.every((view) => view.projection === "orthographic" || view.projection === "perspective"), true);
  }
});
