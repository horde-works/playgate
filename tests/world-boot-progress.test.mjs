import assert from "node:assert/strict";
import test from "node:test";

import {
  WORLD_BOOT_MILESTONES,
  WORLD_BOOT_STEP_COUNT,
  initialWorldBootState,
  reduceWorldBoot,
  worldBootCopyKey,
  worldBootDone,
  worldBootPlan,
} from "../app/components/worldBoot.ts";

function play(events, from = initialWorldBootState()) {
  return events.reduce(reduceWorldBoot, from);
}

const REQUEST = { kind: "requested", world: "Viking Village" };

test("ничего не грузится — отчёта нет", () => {
  const plan = worldBootPlan(initialWorldBootState());
  assert.equal(plan.visible, false);
  assert.equal(plan.target, 0);
});

test("отчёт появляется на самом клике, а не после загрузки кода", () => {
  const plan = worldBootPlan(play([REQUEST]));
  assert.equal(plan.visible, true);
  assert.equal(plan.phase, "loading");
  assert.equal(plan.step, 1);
  assert.ok(plan.target > 0, "полоса обязана сдвинуться с нуля");
});

test("каждая веха переводит отчёт на следующую стадию", () => {
  const phases = [];
  let state = play([REQUEST]);
  phases.push(worldBootPlan(state).phase);
  for (const milestone of ["codeReady", "rendererReady"]) {
    state = reduceWorldBoot(state, { kind: "reached", milestone });
    phases.push(worldBootPlan(state).phase);
  }
  assert.deepEqual(phases, ["loading", "building", "painting"]);
  assert.equal(WORLD_BOOT_STEP_COUNT, 3);
});

test("полоса не врёт: до настоящего первого кадра шкала не закрыта", () => {
  let state = play([REQUEST]);
  for (const milestone of ["codeReady", "rendererReady"]) {
    state = reduceWorldBoot(state, { kind: "reached", milestone });
    const plan = worldBootPlan(state);
    assert.ok(plan.target < 1, `стадия ${plan.phase} обещает готовый мир`);
    assert.equal(plan.settled, false);
    assert.equal(worldBootDone(state), false);
  }
  state = reduceWorldBoot(state, { kind: "reached", milestone: "firstFrame" });
  const plan = worldBootPlan(state);
  assert.equal(plan.target, 1);
  assert.equal(plan.settled, true);
  assert.equal(worldBootDone(state), true);
});

test("полоса монотонна: вехи вразнобой не откатывают её назад", () => {
  const straight = play([
    REQUEST,
    { kind: "reached", milestone: "codeReady" },
    { kind: "reached", milestone: "rendererReady" },
  ]);
  const shuffled = play([
    REQUEST,
    { kind: "reached", milestone: "rendererReady" },
    { kind: "reached", milestone: "codeReady" },
    { kind: "reached", milestone: "codeReady" },
  ]);
  assert.equal(worldBootPlan(shuffled).target, worldBootPlan(straight).target);
  assert.equal(worldBootPlan(shuffled).phase, "painting");
});

test("повторный клик по тому же миру не перезапускает ожидание", () => {
  const running = play([REQUEST, { kind: "reached", milestone: "codeReady" }]);
  const clickedAgain = reduceWorldBoot(running, REQUEST);
  assert.equal(worldBootPlan(clickedAgain).phase, "building");
});

test("прямой заход по ссылке пропускает стадию загрузки, а не показывает её", () => {
  // Каталога не было, просьбы тоже: мир сообщает о себе сам, уже с готовым
  // кодом. Отчёт обязан начаться со сборки, иначе он покажет уже прошедшее.
  const state = play([
    { kind: "reached", milestone: "codeReady", world: "Dutch Polder" },
  ]);
  const plan = worldBootPlan(state);
  assert.equal(plan.visible, true);
  assert.equal(plan.phase, "building");
  assert.equal(state.world, "Dutch Polder");
});

test("мир называет себя, даже когда имя пришло позже клика", () => {
  const state = play([
    { kind: "requested", world: null },
    { kind: "reached", milestone: "codeReady", world: "Grand Terminal" },
  ]);
  assert.equal(state.world, "Grand Terminal");
});

test("отменённый вход снимает отчёт целиком", () => {
  const state = play([
    REQUEST,
    { kind: "reached", milestone: "codeReady" },
    { kind: "abandoned" },
  ]);
  assert.equal(worldBootPlan(state).visible, false);
});

test("отозванный отчёт не возвращается на следующей вехе", () => {
  // Прилёт гасит отчёт своей заслонкой, но мир продолжает строиться и слать
  // вехи. Без отзыва они поднимали бы отчёт заново — поверх авторской сцены.
  const state = play([
    { kind: "reached", milestone: "codeReady" },
    { kind: "abandoned" },
    { kind: "reached", milestone: "rendererReady" },
    { kind: "reached", milestone: "firstFrame" },
  ]);
  assert.equal(worldBootPlan(state).visible, false);
});

test("сдавшийся по дедлайну экран не мигает отчётом на первом кадре", () => {
  const state = play([
    REQUEST,
    { kind: "abandoned" },
    { kind: "reached", milestone: "firstFrame" },
  ]);
  assert.equal(worldBootPlan(state).visible, false);
  assert.equal(worldBootDone(state), false);
});

test("новый выбор мира снимает отзыв и начинает ожидание заново", () => {
  const state = play([
    REQUEST,
    { kind: "reached", milestone: "rendererReady" },
    { kind: "abandoned" },
    { kind: "requested", world: "Dutch Polder" },
  ]);
  const plan = worldBootPlan(state);
  assert.equal(plan.visible, true);
  assert.equal(plan.phase, "loading");
  assert.equal(plan.step, 1);
  assert.equal(state.world, "Dutch Polder");
});

test("у каждой стадии своя строка, и они все разные", () => {
  const keys = new Set(
    ["loading", "building", "painting"].map(worldBootCopyKey),
  );
  assert.equal(keys.size, 3);
});

test("вехи перечислены в том порядке, в каком случаются", () => {
  assert.deepEqual(
    [...WORLD_BOOT_MILESTONES],
    ["requested", "codeReady", "rendererReady", "firstFrame"],
  );
});
