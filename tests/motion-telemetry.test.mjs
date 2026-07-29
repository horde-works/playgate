import assert from "node:assert/strict";
import test from "node:test";
import {
  applyMotionTelemetryUpdate,
  createMotionTelemetryStore,
  motionTelemetryMetricActivity,
  motionTelemetryAvailable,
  selectMotionTelemetrySnapshot,
} from "../games/make-a-mess/src/game/motionTelemetry.ts";

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
  assert.deepEqual(
    motionTelemetryMetricActivity(undefined, previous),
    [false, false],
  );
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
