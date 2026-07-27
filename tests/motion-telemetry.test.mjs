import assert from "node:assert/strict";
import test from "node:test";
import {
  applyMotionTelemetryUpdate,
  createMotionTelemetryStore,
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
  assert.equal(notifications, 1);

  store.update({
    sourceId: "train",
    snapshot: sample("train", 20, 1),
  });
  assert.equal(store.getSnapshot()?.sourceId, "airship");
  assert.equal(notifications, 1);

  store.clear();
  assert.equal(store.getSnapshot(), null);
  assert.equal(notifications, 2);
  unsubscribe();
});
