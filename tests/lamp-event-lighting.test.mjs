import assert from "node:assert/strict";
import test from "node:test";
import {
  lampEventLevel,
  lampTimeFactor,
  smoothLampLevel,
} from "../games/make-a-mess/src/game/lampEventLighting.ts";

const lamp = {
  id: "linked-lamp",
  position: [0, 0, 0],
  intensity: 5,
  dayIntensityFactor: 1,
  eventLighting: {
    sourceClusterId: "carrier",
    levels: {
      docked: { intensityMultiplier: 2, distanceMultiplier: 1.2 },
      inTransit: { intensityMultiplier: 0.15, distanceMultiplier: 0.5 },
    },
  },
};

test("linked lights resolve reusable docked and transit levels", () => {
  assert.deepEqual(lampEventLevel(lamp, "docked"), {
    intensityMultiplier: 2,
    distanceMultiplier: 1.2,
  });
  assert.deepEqual(lampEventLevel(lamp, "inTransit"), {
    intensityMultiplier: 0.15,
    distanceMultiplier: 0.5,
  });
  assert.deepEqual(
    lampEventLevel(lamp, "approach"),
    lamp.eventLighting.levels.inTransit,
    "legacy transit profiles remain valid for precise route phases",
  );
  assert.deepEqual(
    lampEventLevel(lamp, "failed"),
    lamp.eventLighting.levels.inTransit,
    "failure keeps the safe transit lighting profile",
  );
});

test("electrical lights can retain full power independently of daylight", () => {
  assert.equal(lampTimeFactor(lamp, 0), 1);
  assert.equal(lampTimeFactor(lamp, 1), 1);
  assert.equal(lampTimeFactor({ id: "street", position: [0, 0, 0] }, 0), 0);
  assert.equal(lampTimeFactor({ id: "street", position: [0, 0, 0] }, 1), 1);
});

test("lamp transitions are smooth and independent of frame subdivision", () => {
  const fadingLamp = {
    transition: { fadeInSeconds: 1.8, fadeOutSeconds: 1.2 },
  };
  const oneFrame = smoothLampLevel(fadingLamp, 0, 100, 0.4);
  const firstHalf = smoothLampLevel(fadingLamp, 0, 100, 0.2);
  const twoFrames = smoothLampLevel(fadingLamp, firstHalf, 100, 0.2);
  assert.equal(oneFrame > 0 && oneFrame < 100, true);
  assert.equal(Math.abs(oneFrame - twoFrames) < 1e-10, true);
  const fadingOut = smoothLampLevel(fadingLamp, 100, 0, 0.2);
  assert.equal(fadingOut > 0 && fadingOut < 100, true);
});
