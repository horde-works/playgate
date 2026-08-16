import assert from "node:assert/strict";
import test from "node:test";
import { dc3GroundTaxiDemand } from "../games/make-a-mess/src/game/dc3GroundTaxi.ts";

const cornerPlan = {
  id: "test:dc3-ground-corner",
  length: 40,
  finalFrom: 1,
  point(progress) {
    const metres = Math.max(0, Math.min(1, progress)) * 40;
    return metres <= 20 ? [metres, 0, 0] : [20, 0, -(metres - 20)];
  },
  speedLimit() {
    return 4.5;
  },
  altitude() {
    return 0;
  },
  corridor() {
    return 0.25;
  },
  taxiVertices: [
    {
      progress: 0.5,
      point: [20, 0, 0],
      incoming: [1, 0],
      outgoing: [0, -1],
      endpoint: false,
    },
    {
      progress: 1,
      point: [20, 0, -20],
      incoming: [0, -1],
      outgoing: [0, -1],
      endpoint: true,
    },
  ],
};

function demand({ progress, centre, heading, velocity = [0, 0, 0], yawRate = 0 }) {
  return dc3GroundTaxiDemand({
    plan: cornerPlan,
    progress,
    centre,
    heading,
    velocity,
    yawRate,
    maximumYawRate: 0.45,
    braking: 3,
    responseSeconds: 2.4,
  });
}

test("DC-3 lowers speed continuously inside its derived response envelope", () => {
  const far = demand({
    progress: 0.2,
    centre: [8, 0, 0],
    heading: [1, 0],
    velocity: [4.5, 0, 0],
  });
  const braking = demand({
    progress: 0.44,
    centre: [17.6, 0, 0],
    heading: [1, 0],
    velocity: [4.5, 0, 0],
  });
  assert.equal(far.forwardSpeed, 4.5);
  assert.ok(braking.forwardSpeed > 0 && braking.forwardSpeed < far.forwardSpeed);
  assert.equal(braking.state.phase, "braking");
  assert.ok(
    braking.forwardAcceleration < 0,
    "the curve has no deceleration feed-forward",
  );
});

test("reverse authority changes the derived stop curve", () => {
  const progress = 0.42;
  const centre = [16.8, 0, 0];
  const base = {
    plan: cornerPlan,
    progress,
    centre,
    heading: [1, 0],
    velocity: [4.5, 0, 0],
    yawRate: 0,
    maximumYawRate: 0.45,
    responseSeconds: 2.4,
  };
  const weaker = dc3GroundTaxiDemand({ ...base, braking: 3 });
  const stronger = dc3GroundTaxiDemand({ ...base, braking: 4 });
  assert.notEqual(weaker.forwardSpeed, stronger.forwardSpeed);
});

test("zero speed away from the vertex does not authorize a pivot", () => {
  const short = demand({
    progress: 0.49,
    centre: [19.6, 0, 0],
    heading: [1, 0],
  });
  assert.ok(short.forwardSpeed > 0 && short.forwardSpeed < 1);
  assert.equal(short.pivoting, false);
  assert.equal(short.yawRate, 0);
});

test("at a sharp corner translation stops and the outgoing edge owns heading", () => {
  const turning = demand({
    progress: 0.499,
    centre: [19.96, 0, 0],
    heading: [1, 0],
  });
  assert.equal(turning.forwardSpeed, 0);
  assert.equal(turning.pivoting, true);
  assert.ok(turning.headingTarget[1] < -0.99, "target is not the outgoing edge");
  assert.ok(Math.abs(turning.headingTarget[0]) < 0.05);
  assert.ok(Math.abs(turning.yawRate) > 0.2, "pivot has no yaw demand");
});

test("a route projection pinned to a missed vertex cannot authorize a pivot", () => {
  const brakingPastVertex = demand({
    progress: 0.5,
    centre: [23, 0, 0],
    heading: [1, 0],
    velocity: [4.5, 0, 0],
  });
  assert.equal(brakingPastVertex.forwardSpeed, 0);
  assert.equal(brakingPastVertex.yawRate, 0);
  assert.ok(brakingPastVertex.headingTarget[0] > 0.99);

  const stoppedPastVertex = demand({
    progress: 0.5,
    centre: [23, 0, 0],
    heading: [1, 0],
  });
  assert.equal(stoppedPastVertex.pivoting, false);
  assert.equal(stoppedPastVertex.yawRate, 0);
  assert.equal(stoppedPastVertex.state.phase, "braking");
});

test("translation is released only after outgoing heading and yaw settle", () => {
  const aligned = demand({
    progress: 0.499,
    centre: [19.96, 0, 0],
    heading: [0, -1],
    yawRate: 0,
  });
  assert.equal(aligned.pivoting, false);
  assert.equal(aligned.yawRate, 0);
  assert.equal(aligned.forwardSpeed, 4.5);

  const stillRotating = demand({
    progress: 0.499,
    centre: [19.96, 0, 0],
    heading: [0, -1],
    yawRate: 0.12,
  });
  assert.ok(
    stillRotating.forwardSpeed > 0,
    "being stopped short of the point must not be mistaken for arrival",
  );
  assert.equal(stillRotating.pivoting, false);
});

test("the DC-3 taxi controller stops at the end of a straight path", () => {
  const stopping = demand({
    progress: 0.999,
    centre: [20, 0, -19.8],
    heading: [0, -1],
    velocity: [0, 0, -2],
  });
  assert.ok(stopping.forwardSpeed > 0 && stopping.forwardSpeed < 1.5);
});

test("route progress at one does not strand the DC-3 away from the endpoint", () => {
  const closing = demand({
    progress: 1,
    centre: [20, 0, -15],
    heading: [0, -1],
  });
  assert.ok(closing.forwardSpeed > 2, "terminal position error cannot be closed");
  assert.deepEqual(closing.headingTarget, [0, -1]);
});

test("a closed taxi path does not mistake its start for its endpoint", () => {
  const closedPlan = {
    ...cornerPlan,
    length: 80,
    point(progress) {
      const metres = Math.max(0, Math.min(1, progress)) * 80;
      if (metres <= 40) return [metres, 0, 0];
      return [80 - metres, 0, 0];
    },
  };
  const leaving = dc3GroundTaxiDemand({
    plan: closedPlan,
    progress: 0,
    centre: [0, 0, 0],
    heading: [1, 0],
    velocity: [0, 0, 0],
    yawRate: 0,
    maximumYawRate: 0.45,
    braking: 3,
    responseSeconds: 2.4,
  });
  assert.equal(leaving.forwardSpeed, 4.5);
});

test("taxi controller reads the authored vertex instead of inferring a kink", () => {
  const declaredPlan = {
    ...cornerPlan,
    point(progress) {
      return [Math.max(0, Math.min(1, progress)) * 40, 0, 0];
    },
    taxiVertices: [
      {
        progress: 0.5,
        point: [20, 0, 0],
        incoming: [1, 0],
        outgoing: [0, -1],
        endpoint: false,
      },
    ],
  };
  const turning = dc3GroundTaxiDemand({
    plan: declaredPlan,
    progress: 0.499,
    centre: [19.96, 0, 0],
    heading: [1, 0],
    velocity: [0, 0, 0],
    yawRate: 0,
    maximumYawRate: 0.45,
    braking: 3,
    responseSeconds: 2.4,
  });
  assert.equal(turning.pivoting, true);
  assert.deepEqual(turning.headingTarget, [0, -1]);
});
