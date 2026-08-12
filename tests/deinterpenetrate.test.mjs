import assert from "node:assert/strict";
import test from "node:test";

import { deinterpenetrateClusters } from "../games/make-a-mess/src/game/deinterpenetrate.ts";

const piece = (id, position, size) => ({
  id,
  clusterId: "cluster",
  material: "stone",
  shape: "box",
  color: "#8a8a8a",
  position,
  size,
});

const cluster = (pieces) => ({
  id: "cluster",
  label: "cluster",
  material: "stone",
  supportMode: "stack",
  pieces,
});

const sizeOf = (clusters, id) =>
  clusters[0].pieces.find((entry) => entry.id === id).size;

test("duplicate-like sibling overlap is still trimmed", () => {
  const before = cluster([
    piece("left", [0, 2, 0], [1, 1, 1]),
    piece("right", [0.5, 2, 0], [1, 1, 1]),
  ]);
  const after = deinterpenetrateClusters([before]);

  assert.ok(sizeOf(after, "left")[0] < 1, "the pair must butt, not overlap");
  assert.ok(sizeOf(after, "right")[0] < 1);
  // Ужимается только ось перекрытия: силуэт по остальным осям неприкосновенен.
  assert.deepEqual(sizeOf(after, "left").slice(1), [1, 1]);
});

// ПЕРЕКРЫТИЕ ПО ОСИ НЕ БОЛЬШЕ ТОЛЩИНЫ МЕНЬШЕГО ЯЩИКА.
//
// Гейт доли объёма считал пересечение по формуле «сумма полуразмеров минус
// расстояние» без потолка, поэтому у пары «стойка в стене» две оси, по которым
// маленький ящик просто ВЛОЖЕН в большой, давали не свои 0.4 м, а всю ширину
// стены — 2.2 м. Объём завышался в 30 раз, гейт срабатывал, и конструктивный
// стык на 6 см подрезался как дубликат.
test("a small piece butting into a large one is judged by its own size", () => {
  const before = cluster([
    piece("wall", [0, 2, 0], [0.2, 4, 4]),
    piece("post", [0.24, 2, 0], [0.4, 0.4, 0.4]),
  ]);
  const after = deinterpenetrateClusters([before]);

  assert.deepEqual(sizeOf(after, "post"), [0.4, 0.4, 0.4]);
  assert.deepEqual(sizeOf(after, "wall"), [0.2, 4, 4]);
});

test("the pass never trims a piece out from under its support", () => {
  const before = cluster([
    piece("base", [0, 0.5, 0], [1, 1, 1]),
    piece("stacked", [0.5, 0.5, 0], [1, 1, 1]),
  ]);
  // Решатель признаёт кусок неопёртым ровно тогда, когда его подрезали:
  // авторская укладка стоит, обрезанная — падает. Пасс обязан откатиться.
  const after = deinterpenetrateClusters([before], (clusters) => {
    const trimmed = clusters
      .flatMap((entry) => entry.pieces)
      .filter((entry) => entry.size[0] < 1)
      .map((entry) => entry.id);
    return new Set(trimmed);
  });

  assert.deepEqual(after, [before]);
});
