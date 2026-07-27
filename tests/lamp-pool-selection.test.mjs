import assert from "node:assert/strict";
import test from "node:test";
import {
  selectGroupedLampCandidates,
} from "../games/make-a-mess/src/game/lampPoolSelection.ts";

const candidate = (id, rank, poolGroupId) => ({
  lamp: { id, ...(poolGroupId ? { poolGroupId } : {}) },
  rank,
});

test("a coherent carriage group enters the light pool all at once", () => {
  const cabin = Array.from({ length: 8 }, (_, index) =>
    candidate(`cabin:${index}`, index + 2, "cabin"));
  const platform = Array.from({ length: 8 }, (_, index) =>
    candidate(`platform:${index}`, index === 0 ? 1 : index + 10));
  const selected = selectGroupedLampCandidates([...cabin, ...platform], 12);

  assert.equal(selected.length, 12);
  assert.equal(selected.filter((entry) => entry.lamp.poolGroupId === "cabin").length, 8);
});

test("a group is skipped instead of switching on only its nearest lamps", () => {
  const cabin = Array.from({ length: 8 }, (_, index) =>
    candidate(`cabin:${index}`, index + 1, "cabin"));
  const selected = selectGroupedLampCandidates(cabin, 7);
  assert.deepEqual(selected, []);
});
