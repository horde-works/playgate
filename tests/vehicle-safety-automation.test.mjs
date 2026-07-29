import assert from "node:assert/strict";
import test from "node:test";

import {
  safetyInterventionForMode,
  vehicleSafetyAdvisory,
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
