import assert from "node:assert/strict";
import test from "node:test";

import {
  constrainRotorcraftGuidance,
  safetyInterventionForMode,
  vehicleSafeClosingSpeed,
  vehicleSafetyAdvisory,
  vehicleSafetySensingSuppressed,
} from "../games/make-a-mess/src/game/vehicleSafetyAutomation.ts";
import { autopilot } from "../games/make-a-mess/src/game/vehicleFrames.ts";

test("safety automation predicts impact from closing speed and braking authority", () => {
  const advisory = vehicleSafetyAdvisory(
    [{ distance: 9, relativeClosingSpeed: 8 }],
    2,
    Number.POSITIVE_INFINITY,
    3,
  );
  assert.equal(advisory.risk, "intervention");
  assert.equal(advisory.timeToImpact, 1.125);
  assert.equal(advisory.stoppingDistance, 16);
  assert.equal(advisory.altitudeOffset, 6);

  assert.equal(
    vehicleSafetyAdvisory(
      [{ distance: 2, relativeClosingSpeed: -4 }],
      2,
      8,
      8,
    ),
    null,
    "an obstacle opening away from the hull is not a collision threat",
  );
});

test("off, advisory and assisted modes share sensing without sharing control", () => {
  const advisory = vehicleSafetyAdvisory(
    [{ distance: 5, relativeClosingSpeed: 6 }],
    1.5,
    2,
    8,
  );
  assert.equal(advisory.altitudeOffset, -4);
  assert.equal(safetyInterventionForMode("off", advisory), null);
  assert.equal(safetyInterventionForMode("advisory", advisory), null);
  assert.equal(safetyInterventionForMode("assisted", advisory), advisory);
});

test("the advisory changes autopilot requests, never actuator output directly", () => {
  const plan = {
    length: 100,
    finalFrom: 0.9,
    point(progress) {
      return [progress * 100, 10, 0];
    },
    altitude() {
      return 10;
    },
    speedLimit() {
      return 10;
    },
  };
  const model = {
    mass: 1_000,
    inertiaYaw: 4_000,
    bodyCentre: [30, 10, 0],
    dragLinear: 30,
    dragLateral: 120,
    dragAngular: 500,
    limits: {
      enginePower: 500,
      enginePoints: [
        [30, 9, -3],
        [30, 9, 3],
      ],
      maxRudderForce: 200,
      rudderReferenceSpeed: 7,
      rudderPoint: [20, 10, 0],
      liftTrimRange: 0.12,
    },
  };
  const common = [
    plan,
    0.3,
    [30, 10, 0],
    [0, 0, 0, 1],
    [8, 0, 0],
    [0, 0, 0],
    model,
    1,
    [1, 0, 0],
    { heading: [1, 0], tolerance: { position: 4, heading: 0.3, speed: 4 } },
  ];
  const normal = autopilot(...common);
  const assisted = autopilot(...common, {
    risk: "intervention",
    distance: 4,
    relativeClosingSpeed: 8,
    timeToImpact: 0.5,
    stoppingDistance: 16,
    maximumSpeed: 0,
    altitudeOffset: 6,
  });
  const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
  assert.equal(mean(assisted.controls.throttle) < mean(normal.controls.throttle), true);
  assert.equal(assisted.controls.throttle.every((value) => value < 0), true);
  assert.equal(assisted.controls.liftTrim > normal.controls.liftTrim, true);
});

test("berth sensing is answered by the authored plan, not by an intercept", () => {
  // Approaching its own mast on the authored final: expected geometry.
  assert.equal(
    vehicleSafetySensingSuppressed({
      progress: 0.97,
      finalFrom: 0.94,
      berthDistance: 18,
    }),
    true,
  );
  // A temporary intercept ends at a route join and declares no final at all.
  // Asked about itself, it reports open sky while the mast is 18 m away.
  const interceptOwnAnswer = vehicleSafetySensingSuppressed({
    progress: 0.4,
    finalFrom: Number.POSITIVE_INFINITY,
    berthDistance: 18,
  });
  assert.equal(interceptOwnAnswer, false);
  // Flown from the authored plan's state, the same moment stays suppressed.
  assert.equal(
    vehicleSafetySensingSuppressed({
      progress: 0.97,
      finalFrom: 0.94,
      berthDistance: 18,
    }),
    true,
    "a correction near the berth must not turn the mast into an obstacle",
  );
  // Away from any berth the sensors stay live for both.
  assert.equal(
    vehicleSafetySensingSuppressed({
      progress: 0.5,
      finalFrom: 0.94,
      berthDistance: 120,
    }),
    false,
  );
});

const reading = (overrides = {}) => ({
  probeIndex: 0,
  localNormal: [1, 0, 0],
  worldNormal: [1, 0, 0],
  lever: [3, 0, 0],
  distance: 3,
  relativeClosingSpeed: 0,
  ...overrides,
});

const safetyContext = (overrides = {}) => ({
  forward: [1, 0],
  starboard: [0, 1],
  verticalSpeed: 0,
  horizontalDeceleration: 2.5,
  verticalDeceleration: 2.7,
  liftTrimRange: 0.28,
  grounded: false,
  landingIntent: false,
  ...overrides,
});

test("manual assistance caps only velocity into the obstacle", () => {
  const toward = constrainRotorcraftGuidance(
    { forwardSpeed: 8, lateralSpeed: 4, yawRate: 0, liftFraction: 0 },
    [reading()],
    safetyContext(),
  );
  assert.equal(toward.guidance.forwardSpeed < 2.5, true);
  assert.equal(toward.guidance.lateralSpeed, 4);
  assert.deepEqual(toward.intervenedProbeIndices, [0]);

  const away = constrainRotorcraftGuidance(
    { forwardSpeed: -5, lateralSpeed: 4, yawRate: 0, liftFraction: 0 },
    [reading()],
    safetyContext(),
  );
  assert.equal(away.guidance.forwardSpeed, -5);
  assert.equal(away.guidance.lateralSpeed, 4);
  assert.deepEqual(away.intervenedProbeIndices, []);
});

test("a rotating outer probe is protected even while the centre hovers", () => {
  const turn = constrainRotorcraftGuidance(
    { forwardSpeed: 0, lateralSpeed: 0, yawRate: 0.9, liftFraction: 0 },
    [reading({ worldNormal: [0, 0, 1], lever: [3, 0, 0], distance: 1.7 })],
    safetyContext(),
  );
  // Positive yaw moves this +X probe towards -Z, so the opposite command is
  // deliberately used here to close it on the +Z wall.
  assert.equal(turn.guidance.yawRate, 0.9);
  const closingTurn = constrainRotorcraftGuidance(
    { forwardSpeed: 0, lateralSpeed: 0, yawRate: -0.9, liftFraction: 0 },
    [reading({ worldNormal: [0, 0, 1], lever: [3, 0, 0], distance: 1.7 })],
    safetyContext(),
  );
  assert.equal(Math.abs(closingTurn.guidance.yawRate) < 0.9, true);
});

test("lower sensing brakes a fall but intentionally permits a controlled landing", () => {
  const below = reading({
    localNormal: [0, -1, 0],
    worldNormal: [0, -1, 0],
    lever: [0, -1, 0],
    distance: 0.8,
    relativeClosingSpeed: 2,
  });
  const protectedFlight = constrainRotorcraftGuidance(
    { forwardSpeed: 0, lateralSpeed: 0, yawRate: 0, liftFraction: -0.28 },
    [below],
    safetyContext({ verticalSpeed: -2 }),
  );
  const landing = constrainRotorcraftGuidance(
    { forwardSpeed: 0, lateralSpeed: 0, yawRate: 0, liftFraction: -0.28 },
    [below],
    safetyContext({ verticalSpeed: -0.4, landingIntent: true }),
  );
  assert.equal(protectedFlight.guidance.liftFraction > landing.guidance.liftFraction, true);
  assert.equal(vehicleSafeClosingSpeed(0.08, 2.7, 0.08), 0);
});
