import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_SEPARATION_ENVELOPE,
  closestApproach,
  separationDecision,
} from "../games/make-a-mess/src/game/vehicleSeparation.ts";

/**
 * ТРЁХМЕРНЫЙ ИНСТИНКТ РАСХОЖДЕНИЯ.
 *
 * «Инстинкт нас заставляет избегать столкновений. Мы ходим двумерно —
 * инстинкт двумерный. Но для трёхмерной машины он больше на одно измерение»
 * (Igor, 12.08.2026). И наблюдение оттуда же: все виденные им столкновения
 * были вертикальными или вертикально-диагональными.
 *
 * Главное свойство правила проверяется первым: ОНО РАЗРЕШАЕТСЯ БЕЗ
 * ПЕРЕГОВОРОВ. Обе машины считают одно и то же и получают противоположные
 * ответы — иначе расхождение превращается в танец, где оба уступают в одну
 * сторону.
 */

const machine = (id, centre, velocity, radius = 3) => ({
  id,
  centre,
  velocity,
  radius,
});

/** Сцена глазами каждой из машин: ровно то, что видит каждая. */
function bothViews(first, second, groundHeight = 0) {
  return [
    separationDecision({
      self: first,
      traffic: [second],
      groundHeight,
    }),
    separationDecision({
      self: second,
      traffic: [first],
      groundHeight,
    }),
  ];
}

test("НАИБОЛЬШЕЕ СБЛИЖЕНИЕ считается замкнуто, а не перебором", () => {
  // Лобовое: сходятся по X на 10 м/с каждая со ста метров, промах по высоте
  // четыре метра. Встреча ровно на пятой секунде.
  const approach = closestApproach(
    machine("a", [-50, 20, 0], [10, 0, 0]),
    machine("b", [50, 24, 0], [-10, 0, 0]),
  );
  assert.ok(Math.abs(approach.seconds - 5) < 1e-9);
  assert.ok(Math.abs(approach.miss - 4) < 1e-9);

  // Расходящиеся: минимум позади, время ноль, промах равен нынешнему.
  const parting = closestApproach(
    machine("a", [0, 20, 0], [-10, 0, 0]),
    machine("b", [30, 20, 0], [10, 0, 0]),
  );
  assert.equal(parting.seconds, 0);
  assert.ok(Math.abs(parting.miss - 30) < 1e-9);
});

test("ВЫШЕ — ВВЕРХ, НИЖЕ — ВНИЗ, И ДОГОВАРИВАТЬСЯ НЕ О ЧЕМ", () => {
  // Вертикально-диагональное сближение — та самая природа столкновений,
  // которую Igor и наблюдал.
  const high = machine("rax", [-40, 30, 0], [12, -2, 0]);
  const low = machine("vex", [40, 22, 0], [-12, 1, 0]);
  const [byHigh, byLow] = bothViews(high, low);
  assert.ok(byHigh && byLow, "машины не заметили сближения");
  assert.deepEqual(byHigh.direction, [0, 1, 0], "верхняя пошла не вверх");
  assert.deepEqual(byLow.direction, [0, -1, 0], "нижняя пошла не вниз");
  // Именно это и делает правило рабочим без переговоров: решения
  // противоположны, а значит расхождение растёт вдвое быстрее.
  assert.equal(byHigh.direction[1], -byLow.direction[1]);
  assert.equal(byHigh.withId, "vex");
  assert.equal(byLow.withId, "rax");
});

test("НА РАВНОЙ ВЫСОТЕ ничью разрешает имя борта, а не случай", () => {
  // Бросок монеты у двух машин совпадает в половине случаев — и это ровно те
  // случаи, ради которых модуль написан.
  const first = machine("alpha", [-40, 25, 0], [12, 0, 0]);
  const second = machine("bravo", [40, 25.4, 0], [-12, 0, 0]);
  const [byFirst, bySecond] = bothViews(first, second);
  assert.equal(byFirst.direction[1], 1, "меньшее имя пошло не вверх");
  assert.equal(bySecond.direction[1], -1);

  // И решение УСТОЙЧИВО: разница высот внутри порога не меняет ролей от
  // кадра к кадру. Без порога две машины с разницей в сантиметр дёргаются
  // на месте вместо расхождения.
  const nudged = machine("bravo", [40, 24.6, 0], [-12, 0, 0]);
  assert.equal(
    separationDecision({ self: first, traffic: [nudged], groundHeight: 0 })
      .direction[1],
    1,
    "роли поменялись от сантиметра разницы",
  );
});

test("У ПАЛУБЫ НИЖНИЙ УХОДИТ ВБОК, а не вжимается в грунт", () => {
  // Уступить дорогу, снижаясь в землю, — это обменять одно столкновение на
  // другое. И вверх ему нельзя тоже: вверх идёт второй.
  const above = machine("rax", [-40, 12, 0], [12, -1, 0]);
  const below = machine("vex", [40, 4, 0], [-12, 0, 0]);
  const decision = separationDecision({
    self: below,
    traffic: [above],
    groundHeight: 0,
  });
  assert.ok(decision, "нижняя машина не заметила сближения");
  assert.equal(decision.direction[1], 0, "нижняя всё-таки пошла в грунт");
  assert.ok(
    Math.hypot(decision.direction[0], decision.direction[2]) > 0.99,
    "уход вбок оказался не единичным",
  );
  // Верхней палуба не мешает: она уходит вверх, как и положено.
  assert.deepEqual(
    separationDecision({ self: above, traffic: [below], groundHeight: 0 })
      .direction,
    [0, 1, 0],
  );
});

test("ОХОТНИК НЕ РАСХОДИТСЯ СО СВОЕЙ ЦЕЛЬЮ", () => {
  // Инстинкт расхождения у идущего в атаку — не осторожность, а срыв задачи.
  // Освобождение именное и ровно на один борт: от всех прочих охотник
  // расходится как все.
  const hunter = machine("rax", [-40, 30, 0], [14, -2, 0]);
  const prey = machine("vex", [40, 24, 0], [-10, 0, 0]);
  const bystander = machine("nimbus", [30, 26, 0], [-8, 0, 0], 8);
  assert.equal(
    separationDecision({
      self: hunter,
      traffic: [prey],
      groundHeight: 0,
      exemptId: "vex",
    }),
    null,
    "охотник шарахнулся от собственной цели",
  );
  const other = separationDecision({
    self: hunter,
    traffic: [prey, bystander],
    groundHeight: 0,
    exemptId: "vex",
  });
  assert.equal(other?.withId, "nimbus", "от постороннего борта не разошёлся");
});

test("расходятся ТОЛЬКО с теми, с кем есть от чего", () => {
  const self = machine("a", [0, 30, 0], [10, 0, 0]);
  // Далеко по времени: сойдутся, но нескоро — тревожиться рано.
  const distant = machine("far", [400, 30, 0], [-10, 0, 0]);
  assert.equal(
    separationDecision({ self, traffic: [distant], groundHeight: 0 }),
    null,
  );
  // Разойдутся сами, с хорошим запасом.
  const wide = machine("wide", [200, 30, 60], [-10, 0, 0]);
  assert.equal(
    separationDecision({ self, traffic: [wide], groundHeight: 0 }),
    null,
  );
  // Промах считается ПО ГАБАРИТАМ: тот же промах для большого борта уже
  // тесен. Без этого крупная машина расходилась бы по меркам маленькой.
  // Промах двадцать метров. Маленькому борту нужно 14 + 3 + 2 = 19 — хватает;
  // крупному 14 + 3 + 22 = 39 — тесно. Одна и та же геометрия, разный ответ.
  const near = machine("small", [100, 30, 20], [-10, 0, 0], 2);
  const huge = machine("huge", [100, 30, 20], [-10, 0, 0], 22);
  assert.equal(
    separationDecision({ self, traffic: [near], groundHeight: 0 }),
    null,
    `промах ${DEFAULT_SEPARATION_ENVELOPE.minimumMiss} + габариты вдруг стал тесен`,
  );
  assert.ok(
    separationDecision({ self, traffic: [huge], groundHeight: 0 }),
    "с крупным бортом разошлись по меркам маленького",
  );
});

test("из нескольких берётся ОДИН самый срочный, а не сумма", () => {
  // Сумма двух разумных уходов регулярно даёт третий, ведущий ровно между
  // ними. Поэтому решение всегда про один борт.
  const self = machine("a", [0, 30, 0], [12, 0, 0]);
  const soon = machine("soon", [40, 34, 0], [-12, 0, 0]);
  const later = machine("later", [150, 26, 0], [-12, 0, 0]);
  const decision = separationDecision({
    self,
    traffic: [later, soon],
    groundHeight: 0,
  });
  assert.equal(decision.withId, "soon");
  assert.ok(decision.urgency > 0.5, `срочность занижена: ${decision.urgency}`);
  // И решение принято ПРОТИВ него: он выше, значит мы вниз.
  assert.deepEqual(decision.direction, [0, -1, 0]);
});
