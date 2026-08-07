import assert from "node:assert/strict";
import test from "node:test";
import {
  AIM_DWELL_SECONDS,
  AIM_GRACE_SECONDS,
  IDLE_AIM_SELECTION,
  advanceAimSelection,
  aimDwellProgress,
} from "../games/make-a-mess/src/game/vehicleAimSelection.ts";

const dt = 1 / 60;
const inCone = (id, extra = {}) => ({
  id,
  angle: 0.01,
  captureAngle: 0.06,
  flying: true,
  piloted: false,
  ...extra,
});
const outOfCone = (id, extra = {}) => inCone(id, { angle: 0.5, ...extra });

function run(state, candidates, seconds) {
  let current = state;
  for (let step = 0; step < Math.round(seconds * 60); step += 1) {
    current = advanceAimSelection(current, candidates, dt);
  }
  return current;
}

test("единственная летящая машина выбирается сама, без прицела", () => {
  const state = advanceAimSelection(
    IDLE_AIM_SELECTION,
    [outOfCone("hx6")],
    dt,
  );
  assert.equal(state.selectedId, "hx6");
});

test("при двух летящих сама не выбирается ни одна", () => {
  const state = run(
    IDLE_AIM_SELECTION,
    [outOfCone("hx6"), outOfCone("rax")],
    1,
  );
  assert.equal(state.selectedId, null);
});

test("выбор накапливается в конусе и срабатывает по задержке", () => {
  const candidates = [inCone("hx6"), outOfCone("rax")];
  const before = run(IDLE_AIM_SELECTION, candidates, AIM_DWELL_SECONDS * 0.7);
  assert.equal(before.selectedId, null, "выбор сработал раньше задержки");
  assert.equal(before.dwellId, "hx6");
  assert.equal(aimDwellProgress(before) > 0.5, true);
  const after = run(before, candidates, AIM_DWELL_SECONDS * 0.5);
  assert.equal(after.selectedId, "hx6");
  assert.equal(after.dwellId, null);
});

test("короткая потеря цели не сбрасывает накопление, длинная — сбрасывает", () => {
  const aimed = run(
    IDLE_AIM_SELECTION,
    [inCone("hx6"), outOfCone("rax")],
    AIM_DWELL_SECONDS * 0.8,
  );
  const lostBriefly = run(
    aimed,
    [outOfCone("hx6"), outOfCone("rax")],
    AIM_GRACE_SECONDS * 0.8,
  );
  assert.equal(lostBriefly.dwellId, "hx6", "льгота не удержала цель");
  assert.equal(lostBriefly.dwellSeconds, aimed.dwellSeconds);
  const lostForGood = run(
    aimed,
    [outOfCone("hx6"), outOfCone("rax")],
    AIM_GRACE_SECONDS * 2,
  );
  assert.equal(lostForGood.dwellId, null);
});

test("выбор залипает: взгляд в сторону его не снимает", () => {
  const selected = run(
    IDLE_AIM_SELECTION,
    [inCone("hx6"), outOfCone("rax")],
    AIM_DWELL_SECONDS * 1.5,
  );
  assert.equal(selected.selectedId, "hx6");
  const lookedAway = run(
    selected,
    [outOfCone("hx6"), outOfCone("rax")],
    5,
  );
  assert.equal(lookedAway.selectedId, "hx6");
});

test("выбор другой машины перехватывает, конец полёта — отпускает", () => {
  const selected = run(
    IDLE_AIM_SELECTION,
    [inCone("hx6"), outOfCone("rax")],
    AIM_DWELL_SECONDS * 1.5,
  );
  const switched = run(
    selected,
    [outOfCone("hx6"), inCone("rax")],
    AIM_DWELL_SECONDS * 1.5,
  );
  assert.equal(switched.selectedId, "rax");
  // Полёт rax кончился, летит только hx6 — выбор возвращается к единственной.
  const landed = advanceAimSelection(
    switched,
    [outOfCone("hx6"), outOfCone("rax", { flying: false })],
    dt,
  );
  assert.equal(landed.selectedId, "hx6");
});

test("взгляд на уже выбранную машину не запускает накопление заново", () => {
  const selected = run(
    IDLE_AIM_SELECTION,
    [inCone("hx6"), outOfCone("rax")],
    AIM_DWELL_SECONDS * 1.5,
  );
  const staring = run(selected, [inCone("hx6"), outOfCone("rax")], 1);
  assert.equal(staring.selectedId, "hx6");
  assert.equal(staring.dwellId, null);
  assert.equal(aimDwellProgress(staring), 0);
});

test("пилотируемая машина выбрана всегда и не отдаёт выбор дуэли прицела", () => {
  const state = run(
    IDLE_AIM_SELECTION,
    [outOfCone("hx6", { piloted: true }), inCone("rax")],
    AIM_DWELL_SECONDS * 2,
  );
  assert.equal(state.selectedId, "hx6");
  assert.equal(state.dwellId, null);
});
