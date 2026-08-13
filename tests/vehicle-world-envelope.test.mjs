import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_WORLD_ENVELOPE,
  worldFloorAvoidance,
  worldFloorSafeVelocity,
} from "../games/make-a-mess/src/game/vehicleWorldEnvelope.ts";

/**
 * ПОЛ МИРА: остров как препятствие.
 *
 * «RAX охотно в манёврах уходит ниже уровня острова… либо уходит под остров и
 * больше не может подняться (остров над головой), либо цепляется за край и не
 * знает, что делать» (Igor, 12.08.2026).
 *
 * Главное, что проверяется здесь, — НЕ «машина не летает низко». Низко за
 * пределами острова ей можно и нужно: это прямо разрешено, и запрет вернул бы
 * нас к «позе как закону», снятой этой же ночью. Проверяется, что машина
 * различает три положения и в каждом делает своё.
 */

const ISLAND = { centre: [0, 0], radius: 50, deck: 0 };
const still = (centre, velocity = [0, 0, 0]) =>
  worldFloorAvoidance({ centre, velocity, island: ISLAND });

test("ВЫШЕ ПОЛА — КОНВЕРТ МОЛЧИТ, где бы машина ни была", () => {
  // Молчание — самый частый ответ, и это правильно: конверт не ведёт машину,
  // он её только не пускает.
  assert.equal(still([0, 20, 0]), null, "над островом высоко");
  assert.equal(still([300, 40, 0]), null, "далеко и высоко");
  assert.equal(
    still([0, DEFAULT_WORLD_ENVELOPE.clearance, 0]),
    null,
    "ровно на полу — это ещё не беда",
  );
});

test("НИЖЕ ПАЛУБЫ ЗА ПРЕДЕЛАМИ ОСТРОВА — ЗАКОННО", () => {
  // Прямое условие Igor: «это может не быть проблемой, пока он за пределами».
  assert.equal(still([200, -30, 0]), null, "низко и далеко — не наше дело");
  // И даже рядом с кромкой, если машина идёт ПРОЧЬ или вдоль.
  assert.equal(
    still([70, -10, 0], [6, 0, 0]),
    null,
    "уходящую от острова машину конверт не трогает",
  );
  assert.equal(
    still([70, -10, 0], [0, 0, 8]),
    null,
    "идущую вдоль кромки — тоже",
  );
});

test("ПОД ОСТРОВОМ УХОДЯТ В СТОРОНУ, А НЕ ВВЕРХ", () => {
  // Тот самый случай, из которого машина не выбиралась: «остров над головой».
  // Набор высоты здесь смертелен, и правило обязано это знать.
  const trapped = still([20, -15, 0]);
  assert.ok(trapped, "машина под островом, а конверт молчит");
  assert.equal(trapped.reason, "under");
  assert.equal(trapped.climb, 0, "под островом скомандовали набор высоты");
  assert.ok(trapped.outward > 0, "не сказано, куда выбираться");
  // И чем глубже забралась, тем срочнее.
  assert.ok(
    still([20, -30, 0]).urgency > trapped.urgency,
    "срочность не растёт с глубиной",
  );
  // Направление наружу — от центра острова, а не куда попало.
  const west = still([-20, -15, 0]);
  assert.equal(west.reason, "under");
  assert.ok(west.outward > 0);
});

test("ДАЖЕ НА САНТИМЕТР ПОД ПАЛУБОЙ В ЦЕНТРЕ НЕЛЬЗЯ КОМАНДОВАТЬ ВВЕРХ", () => {
  const under = still([0, -0.01, 0]);
  assert.equal(under?.reason, "under");
  assert.equal(under?.climb, 0);
  assert.ok(under?.outward > 0);
});

test("НАД ОСТРОВОМ, НО НИЗКО — НАБИРАТЬ", () => {
  const low = still([10, 4, 0]);
  assert.ok(low && low.reason === "above");
  assert.ok(low.climb > 0);
  assert.equal(low.outward, 0, "над островом отворачивать некуда и незачем");
  // Чем ниже, тем срочнее — но не глубже палубы: там уже другой случай.
  assert.ok(still([10, 1, 0]).urgency > low.urgency);
});

test("БЫСТРОЕ ПИКИРОВАНИЕ ВИДИТ ПОВЕРХНОСТЬ ВЫШЕ СТАТИЧЕСКОГО ПОЛА", () => {
  assert.equal(still([0, 20, 0]), null, "без снижения запас достаточен");
  const diving = worldFloorAvoidance({
    centre: [0, 20, 0],
    velocity: [0, -20, 0],
    upwardAcceleration: 20,
    island: ISLAND,
  });
  assert.equal(diving?.reason, "above");
  assert.ok(diving?.climb > 0);
});

test("К КРОМКЕ СНИЗУ — НАБИРАТЬ ЗАРАНЕЕ, ПО ВРЕМЕНИ, А НЕ ПО РАССТОЯНИЮ", () => {
  // Пол, объявленный только «внутри», машина пересечёт снизу и упрётся в
  // кромку. Поэтому вопрос ставится не «далеко ли до кромки», а «успею ли
  // подняться, идя с этим ходом».
  const gentle = still([80, 6, 0], [-4, 0, 0]);
  assert.ok(gentle, "идущую к острову снизу машину конверт не заметил");
  assert.equal(gentle.reason, "approaching");
  assert.equal(gentle.outward, 0, "успевающую машину незачем отворачивать");
  assert.ok(gentle.climb > 0);

  // Та же геометрия, но вдвое быстрее — темп набора обязан вырасти.
  const rushed = still([80, 6, 0], [-8, 0, 0]);
  assert.ok(rushed.climb > gentle.climb, "темп набора не зависит от хода");

  // А вот здесь она не успевает физически: до кромки метры, ход большой,
  // недобор высоты полный. Единственный ответ — отвернуть.
  const hopeless = still([52, -8, 0], [-20, 0, 0]);
  assert.equal(hopeless.reason, "approaching");
  assert.ok(hopeless.outward > 0, "не успевающую машину не отвернули");
  assert.equal(hopeless.urgency, 1);
});

test("ГРАНИЦУ ПЕРВЫМ ПЕРЕСЕКАЕТ КОРПУС, А НЕ ЕГО ЦЕНТР", () => {
  const avoidance = worldFloorAvoidance({
    centre: [54, 2, 0],
    velocity: [-20, 0, 0],
    radius: 5,
    island: ISLAND,
  });
  assert.equal(avoidance?.reason, "approaching");
  assert.equal(avoidance?.urgency, 1);
  assert.ok(avoidance?.outward >= 20);
});

test("НА ПОЛНОМ ХОДУ ПОЛОСА РЕАКЦИИ РАСТЁТ ДО ТОРМОЗНОГО ПУТИ", () => {
  const fast = worldFloorAvoidance({
    centre: [100, 2, 0],
    velocity: [-36, 0, 0],
    radius: 5,
    horizontalAcceleration: 14.5,
    island: ISLAND,
  });
  assert.equal(fast?.reason, "approaching");
  assert.ok(fast?.outward > 0, "полный ход заметил борт слишком поздно");
});

test("РЕФЛЕКС ГАСИТ КОМАНДУ В БОРТ, А НЕ СКЛАДЫВАЕТСЯ С НЕЙ", () => {
  const avoidance = {
    climb: 8,
    outward: 20,
    urgency: 1,
    reason: "approaching",
  };
  const safe = worldFloorSafeVelocity(
    [-36, 0, 7],
    [52, 2, 0],
    ISLAND,
    avoidance,
  );
  assert.ok(safe[0] >= 20, `осталась скорость ${safe[0]} м/с в борт`);
  assert.equal(safe[2], 7, "конверт уничтожил тангенциальное движение");
});

test("ОСТРОВ МОЖЕТ БЫТЬ НЕ В НУЛЕ И НЕ НА НУЛЕ", () => {
  // Числа мира — доводы, а не константы: та же машина над поднятым островом,
  // смещённым от начала координат, обязана вести себя так же.
  const raised = {
    centre: [120, -40],
    radius: 30,
    deck: 25,
  };
  const under = worldFloorAvoidance({
    centre: [125, 10, -35],
    velocity: [0, 0, 0],
    island: raised,
  });
  assert.equal(under?.reason, "under", "поднятый остров перестал быть телом");
  const above = worldFloorAvoidance({
    centre: [125, 60, -35],
    velocity: [0, 0, 0],
    island: raised,
  });
  assert.equal(above, null, "над поднятым островом высоко — а конверт кричит");
});
