import assert from "node:assert/strict";
import test from "node:test";
import {
  applyMotionTelemetryUpdate,
  createMotionTelemetryStore,
  motionTelemetryPrimaryActivity,
  motionTelemetryMetricActivity,
  motionTelemetryAvailable,
  selectMotionTelemetrySnapshot,
} from "../games/make-a-mess/src/game/motionTelemetry.ts";
import { applyImpulseAtPoint } from "../games/make-a-mess/src/game/clusterDynamics.ts";
import { createVehicleImpactTelemetry } from "../games/make-a-mess/src/game/vehicleImpactTelemetry.ts";

const sample = (sourceId, capturedAt, priority = 0) => ({
  sourceId,
  sourceLabel: sourceId.toUpperCase(),
  capturedAt,
  priority,
  phase: "cruise",
  metrics: [{ id: "groundSpeed", value: 24, unit: "km/h" }],
});

test("telemetry sources join and leave one reusable movement channel", () => {
  let sources = new Map();
  sources = applyMotionTelemetryUpdate(sources, {
    sourceId: "airship",
    snapshot: sample("airship", 10),
  });
  sources = applyMotionTelemetryUpdate(sources, {
    sourceId: "train",
    snapshot: sample("train", 20),
  });
  assert.equal(selectMotionTelemetrySnapshot(sources)?.sourceId, "train");

  sources = applyMotionTelemetryUpdate(sources, {
    sourceId: "train",
    snapshot: null,
  });
  assert.equal(selectMotionTelemetrySnapshot(sources)?.sourceId, "airship");
});

test("a temporary autopilot mode does not erase the journey phase", () => {
  const sources = applyMotionTelemetryUpdate(new Map(), {
    sourceId: "airship",
    snapshot: {
      ...sample("airship", 10),
      phase: "departure",
      mode: "intercepting",
    },
  });
  assert.equal(sources.get("airship")?.phase, "departure");
  assert.equal(sources.get("airship")?.mode, "intercepting");
});

test("the panel headline follows the most urgent live machine action", () => {
  const activities = [
    { channel: "assignment", state: "airControl", priority: 10 },
    { channel: "action", state: "attacking", priority: 40 },
    { channel: "decision", state: "strengtheningFireSolution", priority: 50 },
    { channel: "instinct", state: "evading", priority: 80 },
  ];
  assert.equal(motionTelemetryPrimaryActivity(activities)?.state, "evading");
  assert.equal(motionTelemetryPrimaryActivity([]), null);
});

test("priority beats recency and a publisher cannot impersonate another source", () => {
  let sources = applyMotionTelemetryUpdate(new Map(), {
    sourceId: "vehicle:a",
    snapshot: sample("wrong-id", 100, 2),
  });
  sources = applyMotionTelemetryUpdate(sources, {
    sourceId: "vehicle:b",
    snapshot: sample("vehicle:b", 200, 1),
  });
  assert.equal(sources.has("wrong-id"), false);
  assert.equal(sources.get("vehicle:a")?.sourceId, "vehicle:a");
  assert.equal(selectMotionTelemetrySnapshot(sources)?.sourceId, "vehicle:a");
});

test("the external telemetry store only wakes subscribers for the selected source", () => {
  const store = createMotionTelemetryStore();
  let notifications = 0;
  const unsubscribe = store.subscribe(() => {
    notifications += 1;
  });

  store.update({
    sourceId: "airship",
    snapshot: sample("airship", 10, 5),
  });
  assert.equal(store.getSnapshot()?.sourceId, "airship");
  assert.equal(store.getSourceSnapshot("airship")?.capturedAt, 10);
  assert.equal(notifications, 1);

  store.update({
    sourceId: "train",
    snapshot: sample("train", 20, 1),
  });
  assert.equal(store.getSnapshot()?.sourceId, "airship");
  assert.equal(store.getSourceSnapshot("train")?.capturedAt, 20);
  assert.equal(notifications, 1);

  store.clear();
  assert.equal(store.getSnapshot(), null);
  assert.equal(store.getSourceSnapshot("airship"), null);
  assert.equal(store.getSourceSnapshot("train"), null);
  assert.equal(notifications, 2);
  unsubscribe();
});

test("any moving carrier uses the same telemetry availability rule", () => {
  assert.equal(
    motionTelemetryAvailable({ active: true, moving: false, airborne: true }),
    true,
  );
  assert.equal(
    motionTelemetryAvailable({ active: true, moving: true, airborne: false }),
    true,
  );
  assert.equal(
    motionTelemetryAvailable({
      active: true,
      moving: true,
      airborne: true,
      suppressed: true,
    }),
    false,
  );
  assert.equal(
    motionTelemetryAvailable({ active: true, moving: false, airborne: false }),
    false,
  );
  assert.equal(
    motionTelemetryAvailable({
      active: true,
      moving: false,
      airborne: false,
      reportWhileStopped: true,
    }),
    true,
  );
});

test("metric activity is generic and keeps paired values independent", () => {
  const previous = {
    id: "propellerRevolutions",
    value: [12, 20],
    unit: "percent",
    activityDelta: 5,
  };
  assert.deepEqual(
    motionTelemetryMetricActivity(previous, { ...previous, value: [28, 22] }),
    [true, false],
  );
  assert.deepEqual(motionTelemetryMetricActivity(undefined, previous), [
    false,
    false,
  ]);
});

test("circular telemetry does not mistake north crossing for a violent turn", () => {
  const previous = {
    id: "heading",
    value: 359,
    unit: "deg",
    activityDelta: 5,
    circularRange: 360,
  };
  assert.deepEqual(
    motionTelemetryMetricActivity(previous, { ...previous, value: 1 }),
    [false],
  );
  assert.deepEqual(
    motionTelemetryMetricActivity(previous, { ...previous, value: 20 }),
    [true],
  );
});

test("weapon telemetry keeps the impact point and response in carrier axes", () => {
  const frame = {
    origin: [0, 0, 0],
    nose: [-1, 0, 0],
    localBounds: {
      minimum: [-5, -2, -1],
      maximum: [5, 2, 1],
    },
  };
  const properties = {
    mass: 10,
    centre: [0, 0, 0],
    inertia: [10, 0, 0, 0, 10, 0, 0, 0, 10],
    inverseInertia: [0.1, 0, 0, 0, 0.1, 0, 0, 0, 0.1],
    pieces: 1,
  };
  const before = {
    position: [0, 0, 0],
    orientation: [0, 0, 0, 1],
    velocity: [0, 0, 0],
    angularVelocity: [0, 0, 0],
  };
  const applied = { impulse: [10, 0, 0], point: [-5, 2, 0] };
  const after = applyImpulseAtPoint(before, properties, applied);
  const impact = createVehicleImpactTelemetry({
    frame,
    properties,
    before,
    after,
    impulses: [applied],
    sequence: 3,
    capturedAt: 120,
  });

  assert.ok(impact);
  assert.equal(impact.sequence, 3);
  assert.equal(
    impact.pointOnHull[2] > 0,
    true,
    "the bow maps to the forward pole",
  );
  assert.equal(
    impact.pointOnHull[1] > 0,
    true,
    "a high strike stays above centre",
  );
  assert.deepEqual(impact.impulseBody, [0, 0, -10]);
  assert.deepEqual(impact.deltaVelocityBody, [0, 0, -1]);
  assert.equal(
    Math.abs(impact.deltaAngularVelocityBody[0] - 2) < 1e-9,
    true,
    "the off-centre bow strike records its pitch kick",
  );
});
