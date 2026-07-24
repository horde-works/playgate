import assert from "node:assert/strict";
import test from "node:test";

import {
  CONTACT_SEPARATION_STEPS,
  isNewPhysicalContact,
  measureImpactApproachSpeed,
  shouldPlayDebrisImpact,
} from "../games/make-a-mess/src/game/impactSoundPolicy.ts";

test("resting contact force does not sound like a new impact", () => {
  const approachSpeed = measureImpactApproachSpeed(
    {
      linear: { x: 0.04, y: -0.03, z: 0.02 },
      angular: { x: 0.02, y: 0.01, z: 0.02 },
    },
    { x: 0, y: 1, z: 0 },
    [1.8, 0.45, 0.85],
  );

  assert.equal(
    shouldPlayDebrisImpact({
      intensity: 0.9,
      approachSpeed,
      elapsedSinceLastSound: 5000,
      minimumIntensity: 0.18,
    }),
    false,
  );
});

test("a fast landing produces one sound and then observes its cooldown", () => {
  const approachSpeed = measureImpactApproachSpeed(
    {
      linear: { x: 0.2, y: -5.4, z: 0.1 },
      angular: { x: 0.1, y: 0.2, z: 0.1 },
    },
    { x: 0, y: 1, z: 0 },
    [1.8, 0.45, 0.85],
  );
  const impact = {
    intensity: 0.75,
    approachSpeed,
    minimumIntensity: 0.18,
  };

  assert.equal(
    shouldPlayDebrisImpact({
      ...impact,
      elapsedSinceLastSound: 5000,
    }),
    true,
  );
  assert.equal(
    shouldPlayDebrisImpact({
      ...impact,
      elapsedSinceLastSound: 60,
    }),
    false,
  );
});

test("fast sliding across a floor is not treated as a landing", () => {
  const approachSpeed = measureImpactApproachSpeed(
    {
      linear: { x: 7, y: -0.04, z: 0 },
      angular: { x: 0, y: 0, z: 0 },
    },
    { x: 0, y: 1, z: 0 },
    [0.9, 0.45, 0.45],
  );

  assert.equal(
    shouldPlayDebrisImpact({
      intensity: 0.7,
      approachSpeed,
      elapsedSinceLastSound: 5000,
      minimumIntensity: 0.18,
    }),
    false,
  );
});

test("a rebound moving away from the contact is not a second impact", () => {
  const approachSpeed = measureImpactApproachSpeed(
    {
      linear: { x: 0, y: 3.5, z: 0 },
      angular: { x: 0, y: 0, z: 0 },
    },
    { x: 0, y: 1, z: 0 },
    [0.8, 0.4, 0.4],
  );

  assert.equal(approachSpeed, 0);
});

test("continuous solver force stays one contact across slow render frames", () => {
  const firstContactStep = 1_000;

  assert.equal(isNewPhysicalContact(firstContactStep, undefined), true);
  assert.equal(
    isNewPhysicalContact(firstContactStep + 1, firstContactStep),
    false,
  );
  assert.equal(
    isNewPhysicalContact(
      firstContactStep + CONTACT_SEPARATION_STEPS,
      firstContactStep,
    ),
    false,
  );
  assert.equal(
    isNewPhysicalContact(
      firstContactStep + CONTACT_SEPARATION_STEPS + 1,
      firstContactStep,
    ),
    true,
  );
});
