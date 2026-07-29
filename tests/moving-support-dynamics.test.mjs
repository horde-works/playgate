import assert from "node:assert/strict";
import test from "node:test";
import {
  movingSupportBoundaryState,
  passengerFallReturnPoint,
  passengerAngularVelocityDelta,
  passengerControlVelocityDelta,
  supportVelocityAtPoint,
} from "../games/make-a-mess/src/game/movingSupportDynamics.ts";

const ZERO = { x: 0, y: 0, z: 0 };

function stepPassenger(state, supportVelocity, grounded, delta = 1 / 60) {
  const change = passengerControlVelocityDelta({
    velocity: state.velocity,
    supportVelocity,
    desiredRelativeVelocity: ZERO,
    grounded,
    delta,
  });
  state.velocity = {
    x: state.velocity.x + change.x,
    y: state.velocity.y + change.y,
    z: state.velocity.z + change.z,
  };
  state.position.x += state.velocity.x * delta;
  state.position.y += state.velocity.y * delta;
  state.position.z += state.velocity.z * delta;
}

test("a rotating support contributes its full omega cross radius velocity", () => {
  const velocity = supportVelocityAtPoint(
    {
      linearVelocity: { x: 1, y: 2, z: 3 },
      angularVelocity: { x: 0.5, y: -1, z: 2 },
      centreOfMass: ZERO,
    },
    { x: 4, y: -2, z: 3 },
  );

  assert.deepEqual(velocity, { x: 2, y: 8.5, z: 6 });
});

test("constant carrier velocity creates no relative drift", () => {
  const support = { x: 7, y: 0, z: -3 };
  const passenger = {
    position: { x: 0, y: 0, z: 0 },
    velocity: { ...support },
  };
  for (let step = 0; step < 60 * 10; step += 1) {
    stepPassenger(passenger, support, true);
  }

  assert.deepEqual(passenger.velocity, support);
  assert.equal(Math.abs(passenger.position.x - 70) < 1e-9, true);
  assert.equal(Math.abs(passenger.position.z + 30) < 1e-9, true);
});

test("carrier acceleration moves a standing passenger backwards in its frame", () => {
  const passenger = {
    position: { x: 0, y: 0, z: 0 },
    velocity: { ...ZERO },
  };
  let supportPosition = 0;
  let supportSpeed = 0;
  const delta = 1 / 60;

  for (let step = 0; step < 60 * 2; step += 1) {
    supportSpeed += 3 * delta;
    supportPosition += supportSpeed * delta;
    stepPassenger(passenger, { x: supportSpeed, y: 0, z: 0 }, true, delta);
  }

  const relativePosition = passenger.position.x - supportPosition;
  assert.equal(relativePosition < -0.08, true, String(relativePosition));
  assert.equal(relativePosition > -1, true, String(relativePosition));
  assert.equal(passenger.velocity.x < supportSpeed, true);
});

test("carrier braking moves the passenger forwards instead of pinning them", () => {
  const passenger = {
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: 6, y: 0, z: 0 },
  };
  let supportPosition = 0;
  let supportSpeed = 6;
  const delta = 1 / 60;

  for (let step = 0; step < 60 * 2; step += 1) {
    supportSpeed -= 3 * delta;
    supportPosition += supportSpeed * delta;
    stepPassenger(passenger, { x: supportSpeed, y: 0, z: 0 }, true, delta);
  }

  assert.equal(passenger.position.x - supportPosition > 0.08, true);
  assert.equal(passenger.velocity.x > supportSpeed, true);
});

test("losing contact preserves momentum and removes all carrier influence", () => {
  const passenger = {
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: 5, y: 1.5, z: -2 },
  };
  const before = { ...passenger.velocity };

  for (let step = 0; step < 60 * 3; step += 1) {
    stepPassenger(passenger, { x: -20, y: 8, z: 30 }, false);
  }

  assert.deepEqual(passenger.velocity, before);
});

test("landing on another carrier changes velocity by force, never by teleport", () => {
  const passenger = {
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: 5, y: 0, z: 0 },
  };
  const otherCarrier = { x: -2, y: 0, z: 0 };
  const before = passenger.velocity.x;

  stepPassenger(passenger, otherCarrier, true);

  assert.equal(passenger.velocity.x < before, true);
  assert.equal(passenger.velocity.x > otherCarrier.x, true);
  assert.equal(passenger.position.x > 0, true);

  for (let step = 0; step < 60 * 3; step += 1) {
    stepPassenger(passenger, otherCarrier, true);
  }
  assert.equal(Math.abs(passenger.velocity.x - otherCarrier.x) < 1e-9, true);
});

test("passenger traction stays tangent to a tilted support", () => {
  const normal = { x: Math.SQRT1_2, y: Math.SQRT1_2, z: 0 };
  const change = passengerControlVelocityDelta({
    velocity: { x: 0, y: 0, z: 0 },
    supportVelocity: { x: 2, y: 0, z: 0 },
    desiredRelativeVelocity: { x: 3, y: 0, z: 0 },
    supportNormal: normal,
    grounded: true,
    delta: 1 / 60,
  });

  assert.equal(Math.abs(change.x * normal.x + change.y * normal.y) < 1e-12, true);
  assert.equal(change.x > 0, true);
  assert.equal(change.y < 0, true);
});

test("standing passenger follows support yaw through finite angular traction", () => {
  const supportAngularVelocity = { x: 0, y: 0.7, z: 0 };
  let angularVelocity = 0;
  const firstChange = passengerAngularVelocityDelta({
    angularVelocity,
    supportAngularVelocity,
    grounded: true,
    delta: 1 / 60,
  });
  assert.equal(firstChange > 0, true);
  assert.equal(firstChange < supportAngularVelocity.y, true);

  angularVelocity += firstChange;
  for (let step = 1; step < 60 * 3; step += 1) {
    angularVelocity += passengerAngularVelocityDelta({
      angularVelocity,
      supportAngularVelocity,
      grounded: true,
      delta: 1 / 60,
    });
  }
  assert.equal(Math.abs(angularVelocity - supportAngularVelocity.y) < 1e-12, true);
});

test("airborne passenger preserves yaw momentum without carrier influence", () => {
  const angularVelocity = 0.45;
  const change = passengerAngularVelocityDelta({
    angularVelocity,
    supportAngularVelocity: { x: 0, y: -4, z: 0 },
    grounded: false,
    delta: 1 / 60,
  });
  assert.equal(change, 0);
});

test("an airborne transfer crosses the map edge until ordinary ground takes over", () => {
  let passThrough = false;
  passThrough = movingSupportBoundaryState(passThrough, true, true);
  assert.equal(passThrough, true, "moving support must ignore the ground boundary");

  passThrough = movingSupportBoundaryState(passThrough, false, false);
  assert.equal(passThrough, true, "jumping must not erect a wall in mid-air");

  passThrough = movingSupportBoundaryState(passThrough, true, false);
  assert.equal(passThrough, false, "the island becomes ordinary contained ground");

  assert.equal(
    movingSupportBoundaryState(false, false, false),
    false,
    "an ordinary jump at the map edge does not disable containment",
  );
});

test("falling from a carrier returns to the island spawn, not the carrier", () => {
  const villageSpawn = [-22, 2.25, -66];

  assert.equal(passengerFallReturnPoint(-2.6, villageSpawn), null);
  assert.deepEqual(
    passengerFallReturnPoint(-2.61, villageSpawn),
    { x: -22, y: 2.25, z: -66 },
  );
});
