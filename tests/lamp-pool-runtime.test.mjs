import assert from "node:assert/strict";
import test from "node:test";
import {
  beginLampCandidateFrame,
  collectUnassignedWaiting,
  createLampPoolScratch,
  markLampKeepIds,
  nearestLampCandidate,
  pushLampCandidate,
  sortLampCandidates,
} from "../games/make-a-mess/src/game/lampPoolRuntime.ts";

test("lamp candidate scratch reuses the same objects across frames", () => {
  const scratch = createLampPoolScratch();
  beginLampCandidateFrame(scratch);
  pushLampCandidate(scratch, { id: "a" }, 0, 0, 0, 10, 0, 0, 1);
  const first = scratch.active[0];
  beginLampCandidateFrame(scratch);
  pushLampCandidate(scratch, { id: "b" }, 1, 0, 0, 10, 0, 0, 1);
  pushLampCandidate(scratch, { id: "c" }, 4, 0, 0, 10, 0, 0, 1);
  assert.equal(scratch.active[0], first);
  assert.equal(scratch.active[0].lamp.id, "b");
  assert.equal(scratch.pool.length, 2);
  assert.equal(scratch.active.length, 2);
});

test("lamp ranking sorts by rank and keeps nearest by distance", () => {
  const scratch = createLampPoolScratch();
  beginLampCandidateFrame(scratch);
  pushLampCandidate(scratch, { id: "far" }, 20, 0, 0, 0, 0, 0, 1);
  pushLampCandidate(scratch, { id: "near-low" }, 4, 0, 0, 0, 0, 0, 1);
  pushLampCandidate(scratch, { id: "priority" }, 10, 0, 0, 0, 0, 0, 8);
  assert.equal(nearestLampCandidate(scratch)?.lamp.id, "near-low");
  sortLampCandidates(scratch);
  assert.deepEqual(
    scratch.active.map((entry) => entry.lamp.id),
    ["priority", "near-low", "far"],
  );
});

test("waiting list skips lamps already occupying a kept slot", () => {
  const scratch = createLampPoolScratch();
  beginLampCandidateFrame(scratch);
  pushLampCandidate(scratch, { id: "kept" }, 1, 0, 0, 0, 0, 0, 1);
  pushLampCandidate(scratch, { id: "next" }, 2, 0, 0, 0, 0, 0, 1);
  sortLampCandidates(scratch);
  markLampKeepIds(scratch, scratch.active);
  collectUnassignedWaiting(scratch, scratch.active, ["kept", null]);
  assert.deepEqual(
    scratch.waiting.map((entry) => entry.lamp.id),
    ["next"],
  );
});
