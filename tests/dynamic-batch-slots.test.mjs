import assert from "node:assert/strict";
import test from "node:test";
import {
  appendDynamicSlots,
  createDynamicSlotState,
  dynamicSlotCount,
  removeDynamicSlots,
} from "../games/make-a-mess/src/game/dynamicBatchSlots.ts";

// Модельный «атрибутный буфер»: одна строка — одно значение. Применяя к нему
// возвращённые перемещения, проверяем, что бухгалтерия слотов и физический
// буфер не расходятся.
function applyMoves(rows, moves, count) {
  for (const { from, to } of moves) {
    rows[to] = rows[from];
  }
  rows.length = count;
}

test("append hands out consecutive slots and tracks the source", () => {
  const state = createDynamicSlotState(8);
  const first = appendDynamicSlots(state, "brick", 3);
  const second = appendDynamicSlots(state, "plank", 2);

  assert.deepEqual(first.slots, [0, 1, 2]);
  assert.equal(first.grownCapacity, null);
  assert.deepEqual(second.slots, [3, 4]);
  assert.equal(dynamicSlotCount(state), 5);
  assert.deepEqual(state.slotsBySource.get("plank"), [3, 4]);
});

test("append refuses duplicates and empty requests", () => {
  const state = createDynamicSlotState(8);
  appendDynamicSlots(state, "brick", 2);
  assert.deepEqual(appendDynamicSlots(state, "brick", 2).slots, []);
  assert.deepEqual(appendDynamicSlots(state, "ghost", 0).slots, []);
  assert.equal(dynamicSlotCount(state), 2);
});

test("append grows capacity with headroom instead of exact fit", () => {
  const state = createDynamicSlotState(4);
  appendDynamicSlots(state, "a", 4);
  const plan = appendDynamicSlots(state, "b", 2);
  assert.equal(plan.grownCapacity, 64);
  assert.equal(state.capacity, 64);

  const large = createDynamicSlotState(100);
  appendDynamicSlots(large, "a", 100);
  const grown = appendDynamicSlots(large, "b", 10);
  assert.equal(grown.grownCapacity, 150);
});

test("removing a middle source pulls tail rows into the holes", () => {
  const state = createDynamicSlotState(16);
  const rows = [];
  for (const [id, boxes] of [["a", 2], ["b", 2], ["c", 2]]) {
    const plan = appendDynamicSlots(state, id, boxes);
    for (const slot of plan.slots) {
      rows[slot] = `${id}:${slot}`;
    }
  }

  const removal = removeDynamicSlots(state, "b");
  applyMoves(rows, removal.moves, removal.count);

  assert.equal(removal.count, 4);
  assert.deepEqual(state.slotSources, ["a", "a", "c", "c"]);
  // Строки c переехали в дыры b. Какой именно бокс c в каком слоте — не
  // контракт: вызывающая сторона двигает свои описания теми же moves.
  assert.deepEqual(rows.slice(0, 2), ["a:0", "a:1"]);
  assert.deepEqual(rows.slice(2).toSorted(), ["c:4", "c:5"]);
  assert.deepEqual(state.slotsBySource.get("c"), [2, 3]);
});

test("removing the tail source is a pure truncation", () => {
  const state = createDynamicSlotState(16);
  appendDynamicSlots(state, "a", 2);
  appendDynamicSlots(state, "b", 3);
  const removal = removeDynamicSlots(state, "b");
  assert.deepEqual(removal.moves, []);
  assert.equal(removal.count, 2);
  assert.deepEqual(state.slotSources, ["a", "a"]);
});

test("tail donors that are themselves removed are skipped", () => {
  const state = createDynamicSlotState(16);
  const rows = [];
  for (const [id, boxes] of [["keep", 1], ["gone", 2], ["tail", 1]]) {
    const plan = appendDynamicSlots(state, id, boxes);
    for (const slot of plan.slots) {
      rows[slot] = `${id}:${slot}`;
    }
  }
  // gone занимает слоты 1..2, tail — слот 3. Донор для дыры 1 — слот 3.
  const removal = removeDynamicSlots(state, "gone");
  applyMoves(rows, removal.moves, removal.count);

  assert.equal(removal.count, 2);
  assert.deepEqual(state.slotSources, ["keep", "tail"]);
  assert.deepEqual(rows, ["keep:0", "tail:3"]);
  assert.deepEqual(state.slotsBySource.get("tail"), [1]);
});

test("randomised add/remove keeps ledger and buffer in lockstep", () => {
  const state = createDynamicSlotState(4);
  const rows = [];
  const live = new Map();
  let seed = 1234;
  const random = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };

  for (let step = 0; step < 500; step += 1) {
    if (live.size > 0 && random() < 0.45) {
      const ids = [...live.keys()];
      const id = ids[Math.floor(random() * ids.length)];
      const removal = removeDynamicSlots(state, id);
      applyMoves(rows, removal.moves, removal.count);
      live.delete(id);
    } else {
      const id = `src-${step}`;
      const boxes = 1 + Math.floor(random() * 4);
      const plan = appendDynamicSlots(state, id, boxes);
      for (const slot of plan.slots) {
        rows[slot] = id;
      }
      live.set(id, boxes);
    }

    // Инварианты: буфер и бухгалтерия совпадают на каждом шаге.
    assert.equal(rows.length, dynamicSlotCount(state));
    assert.ok(dynamicSlotCount(state) <= state.capacity);
    for (let slot = 0; slot < rows.length; slot += 1) {
      assert.equal(rows[slot], state.slotSources[slot]);
    }
    for (const [id, boxes] of live) {
      const slots = state.slotsBySource.get(id);
      assert.equal(slots.length, boxes);
      for (const slot of slots) {
        assert.equal(state.slotSources[slot], id);
      }
    }
  }
});
