import assert from "node:assert/strict";
import test from "node:test";
import {
  autoStepLiftSpeed,
  setFlightVelocityTarget,
} from "../games/make-a-mess/src/game/playerMovement.ts";

test("small walkable ledges help the player climb out of rubble and craters", () => {
  assert.equal(
    autoStepLiftSpeed({
      blockedAtFeet: true,
      bodyClear: true,
      landingFound: true,
      landingNormalY: 1,
      stepHeight: 0.56,
    }) > 0,
    true,
  );
});

test("auto-step never invents a foothold on a wall", () => {
  assert.equal(
    autoStepLiftSpeed({
      blockedAtFeet: true,
      bodyClear: true,
      landingFound: false,
      landingNormalY: 0,
      stepHeight: 0.42,
    }),
    0,
  );
  assert.equal(
    autoStepLiftSpeed({
      blockedAtFeet: true,
      bodyClear: true,
      landingFound: true,
      landingNormalY: 0.1,
      stepHeight: 0.42,
    }),
    0,
  );
  assert.equal(
    autoStepLiftSpeed({
      blockedAtFeet: true,
      bodyClear: true,
      landingFound: true,
      landingNormalY: 1,
      stepHeight: 0.9,
    }),
    0,
  );
});

test("flight follows the camera pitch instead of separate height controls", () => {
  const target = { x: 0, y: 0, z: 0 };
  setFlightVelocityTarget(
    target,
    { x: 0, y: 0.8, z: -0.6 },
    { x: 1, y: 0, z: 0 },
    0,
    -1,
    10,
  );

  assert.deepEqual(target, { x: 0, y: 8, z: -6 });

  setFlightVelocityTarget(
    target,
    { x: 0, y: 0.8, z: -0.6 },
    { x: 1, y: 0, z: 0 },
    0,
    1,
    10,
  );

  assert.deepEqual(target, { x: 0, y: -8, z: 6 });
});
