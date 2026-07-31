import assert from "node:assert/strict";
import test from "node:test";
import {
  advanceRotorcraftPilot,
  consumeRotorcraftPilotCommands,
  createRotorcraftPilotCommandBuffer,
  createRotorcraftPilotReturnPlan,
  createRotorcraftPilotState,
  rotorcraftPilotNeedsFlightSupervision,
} from "../games/make-a-mess/src/game/rotorcraftPilot.ts";
import {
  vehicleRouteAltitudeTarget,
} from "../games/make-a-mess/src/game/vehicleFrames.ts";

const navigation = (overrides = {}) => ({
  relativeAltitude: 10,
  verticalSpeed: 0,
  deltaSeconds: 1,
  liftTrimRange: 0.28,
  safeAltitude: 24,
  ...overrides,
});

const input = (overrides = {}) => ({
  forwardAxis: 0,
  horizontalAxis: 0,
  translationModifier: false,
  altitudeDelta: 0,
  brake: false,
  requestSafeClimb: false,
  requestReturn: false,
  requestToggleSensors: false,
  requestDisarm: false,
  ...overrides,
});

test("one-shot pilot commands are consumed once instead of surviving return", () => {
  const buffer = createRotorcraftPilotCommandBuffer();
  Object.assign(buffer, {
    altitudeDelta: 2,
    requestSafeClimb: true,
    requestReturn: true,
    requestToggleSensors: true,
    requestDisarm: true,
    recenterView: true,
  });

  const commands = consumeRotorcraftPilotCommands(buffer);
  assert.deepEqual(commands, {
    altitudeDelta: 2,
    requestSafeClimb: true,
    requestReturn: true,
    requestToggleSensors: true,
    requestDisarm: true,
    recenterView: true,
  });
  assert.deepEqual(
    consumeRotorcraftPilotCommands(buffer),
    createRotorcraftPilotCommandBuffer(),
  );
});

test("arrows drive and yaw while Shift translates laterally and vertically", () => {
  const initial = createRotorcraftPilotState(10);
  const drive = advanceRotorcraftPilot(
    initial,
    input({ forwardAxis: 1, horizontalAxis: 1 }),
    navigation(),
  );
  assert.equal(drive.guidance.forwardSpeed > 0, true);
  assert.equal(drive.guidance.yawRate < 0, true);
  assert.equal(drive.guidance.lateralSpeed, 0);

  const translate = advanceRotorcraftPilot(
    initial,
    input({
      forwardAxis: 1,
      horizontalAxis: 1,
      translationModifier: true,
    }),
    navigation(),
  );
  assert.equal(translate.guidance.forwardSpeed, 0);
  assert.equal(translate.guidance.yawRate, 0);
  assert.equal(translate.guidance.lateralSpeed > 0, true);
  assert.equal(translate.state.targetAltitude, 14);
});

test("wheel and Shift arrows own one visible altitude target", () => {
  const initial = createRotorcraftPilotState(10);
  const wheel = advanceRotorcraftPilot(
    initial,
    input({ altitudeDelta: 2.5 }),
    navigation(),
  );
  assert.equal(wheel.state.targetAltitude, 12.5);
  assert.equal(wheel.guidance.liftFraction > 0, true);

  const brake = advanceRotorcraftPilot(
    wheel.state,
    input({ brake: true, forwardAxis: 1, horizontalAxis: -1 }),
    navigation({ relativeAltitude: 11.2, verticalSpeed: 1 }),
  );
  assert.equal(brake.state.targetAltitude, 11.2);
  assert.equal(brake.guidance.forwardSpeed, 0);
  assert.equal(brake.guidance.lateralSpeed, 0);
  assert.equal(brake.guidance.yawRate, 0);
});

test("a seated pilot does not launch or taxi before commanding altitude", () => {
  const idle = advanceRotorcraftPilot(
    createRotorcraftPilotState(0, true),
    input({ forwardAxis: 1, horizontalAxis: 1 }),
    navigation({ relativeAltitude: 0, grounded: true }),
  );
  assert.equal(idle.state.targetAltitude, 0);
  assert.equal(idle.state.takeoffAuthorized, false);
  assert.equal(idle.guidance.forwardSpeed, 0);
  assert.equal(idle.guidance.lateralSpeed, 0);
  assert.equal(idle.guidance.yawRate, 0);
  assert.equal(idle.guidance.liftFraction, -0.28);
  assert.equal(
    rotorcraftPilotNeedsFlightSupervision(idle.state, false, true),
    false,
  );

  const takeoff = advanceRotorcraftPilot(
    idle.state,
    input({ altitudeDelta: 1 }),
    navigation({ relativeAltitude: 0, grounded: true }),
  );
  assert.equal(takeoff.state.targetAltitude, 1);
  assert.equal(takeoff.state.takeoffAuthorized, true);
  assert.equal(takeoff.guidance.liftFraction > 0, true);
  assert.equal(
    rotorcraftPilotNeedsFlightSupervision(takeoff.state, true, false),
    true,
  );
});

test("safe climb leaves horizontal control with the pilot", () => {
  const step = advanceRotorcraftPilot(
    createRotorcraftPilotState(0),
    input({ forwardAxis: 1, requestSafeClimb: true }),
    navigation({ relativeAltitude: 0 }),
  );
  assert.equal(step.state.mode, "safeClimb");
  assert.equal(step.state.targetAltitude, 24);
  assert.equal(step.guidance.forwardSpeed > 0, true);
  assert.equal(step.guidance.liftFraction, 0.28);
});

test("return climbs first and any deliberate pilot command retakes control", () => {
  const requested = advanceRotorcraftPilot(
    createRotorcraftPilotState(8),
    input({ requestReturn: true }),
    navigation({ relativeAltitude: 8 }),
  );
  assert.equal(requested.state.mode, "returnClimb");
  assert.equal(requested.guidance.forwardSpeed, 0);

  const ready = advanceRotorcraftPilot(
    requested.state,
    input(),
    navigation({ relativeAltitude: 24, verticalSpeed: 0.1 }),
  );
  assert.equal(ready.readyToBuildReturn, true);

  const returning = {
    ...ready.state,
    mode: "return",
    returnPlan: createRotorcraftPilotReturnPlan([40, 24, 5], [0, 0, 0]),
  };
  const retaken = advanceRotorcraftPilot(
    returning,
    input({ horizontalAxis: -1 }),
    navigation({ relativeAltitude: 24 }),
  );
  assert.equal(retaken.state.mode, "manual");
  assert.equal(retaken.state.returnPlan, null);
  assert.equal(retaken.guidance.yawRate > 0, true);
});

test("return plan reaches the home column at safe height, then hands off vertical arrival", () => {
  const plan = createRotorcraftPilotReturnPlan([40, 24, 10], [0, 0, 0]);
  assert.deepEqual(plan.point(0), [40, 24, 10]);
  assert.equal(plan.point(plan.finalFrom)[1], 0);
  assert.deepEqual(plan.point(1), [0, 0, 0]);
  assert.equal(plan.verticalArrival?.from, plan.finalFrom);
  const beforeArrival = Math.max(0, plan.finalFrom - 0.01);
  const point = plan.point(beforeArrival);
  assert.equal(point[1], 24);
  assert.equal(
    vehicleRouteAltitudeTarget(plan, plan.finalFrom, [4, 24, 1]),
    24,
    "the shelf remains high until the home column is captured",
  );
  assert.equal(
    vehicleRouteAltitudeTarget(plan, 1, [0, 24, 0]),
    0,
    "inside the home column the same plan requests the vertical landing",
  );

  const fromRoof = createRotorcraftPilotReturnPlan([20, 31, 0], [0, 0, 0]);
  assert.equal(
    fromRoof.point(0)[1],
    31,
    "an already higher craft never descends into the city before returning",
  );
});

test("proximity assistance toggles independently from manual guidance", () => {
  const toggled = advanceRotorcraftPilot(
    createRotorcraftPilotState(8),
    input({ requestToggleSensors: true }),
    navigation({ relativeAltitude: 8 }),
  );
  assert.equal(toggled.state.sensorAssistEnabled, true);
  assert.equal(toggled.guidance.forwardSpeed, 0);

  const restored = advanceRotorcraftPilot(
    toggled.state,
    input({ requestToggleSensors: true }),
    navigation({ relativeAltitude: 8 }),
  );
  assert.equal(restored.state.sensorAssistEnabled, false);
});

test("a landed rotorcraft disarms only on a fresh second Shift+back press", () => {
  const idle = createRotorcraftPilotState(0, true);
  const takeoff = advanceRotorcraftPilot(
    idle,
    input({ altitudeDelta: 1 }),
    navigation({ relativeAltitude: 0, grounded: true }),
  );
  const airborne = advanceRotorcraftPilot(
    takeoff.state,
    input({ altitudeDelta: -1 }),
    navigation({
      relativeAltitude: 1,
      grounded: false,
      deltaSeconds: 0.25,
    }),
  );
  const settled = advanceRotorcraftPilot(
    airborne.state,
    input(),
    navigation({
      relativeAltitude: 0,
      grounded: true,
      groundSpeed: 0.05,
      uprightCos: 1,
      angularSpeed: 0.02,
      deltaSeconds: 0.5,
    }),
  );
  assert.equal(settled.state.takeoffAuthorized, true);
  assert.equal(settled.state.landingStableSeconds, 0.5);
  assert.equal(settled.guidance.liftFraction, -0.28);
  assert.equal(settled.disarmRequested, false);
  assert.equal(
    rotorcraftPilotNeedsFlightSupervision(settled.state, true, true),
    false,
  );

  const disarm = advanceRotorcraftPilot(
    settled.state,
    input({
      forwardAxis: -1,
      translationModifier: true,
      requestDisarm: true,
    }),
    navigation({
      relativeAltitude: 0,
      grounded: true,
      groundSpeed: 0.05,
      uprightCos: 1,
      angularSpeed: 0.02,
      deltaSeconds: 1 / 60,
    }),
  );
  assert.equal(disarm.disarmRequested, true);
});

test("landing readiness follows a real roof contact, not the home-pad height", () => {
  const airborne = createRotorcraftPilotState(4);
  const descending = advanceRotorcraftPilot(
    airborne,
    input({ altitudeDelta: -2 }),
    navigation({ relativeAltitude: 4, grounded: false }),
  );
  const roofContact = advanceRotorcraftPilot(
    descending.state,
    input(),
    navigation({
      relativeAltitude: 2,
      grounded: true,
      groundSpeed: 0.02,
      uprightCos: 1,
      angularSpeed: 0.01,
      deltaSeconds: 0.5,
    }),
  );

  assert.equal(roofContact.state.takeoffAuthorized, true);
  assert.equal(roofContact.state.landingStableSeconds, 0.5);
  assert.equal(roofContact.guidance.liftFraction, -0.28);
  assert.equal(
    rotorcraftPilotNeedsFlightSupervision(roofContact.state, true, true),
    false,
  );
});
