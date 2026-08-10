import assert from "node:assert/strict";
import test from "node:test";
import {
  advanceCombatTemper,
  approachCode,
  approachSide,
  approachVertical,
  chooseApproach,
  daredFloor,
  IDLE_COMBAT_TEMPER,
  pressedBreakRange,
  shadowing,
  thrift,
} from "../games/make-a-mess/src/game/airCombatTemper.ts";

/**
 * НРАВ: проверяется, что бой ПОМНИТ.
 *
 * Всё, что можно вывести из нынешнего кадра, нравом не является — скупость,
 * тяга домой, страх земли выводятся и памяти не требуют. Здесь живут ровно две
 * величины, которых из кадра не достать: азарт и досада. Тесты сторожат
 * границу: если однажды сюда переползёт что-нибудь позиционное, это перестанет
 * быть нравом и снова станет ярлыком на геометрии.
 */

const tick = (temper, seconds, extra = {}) =>
  advanceCombatTemper(temper, {
    seconds,
    hits: 0,
    passEnded: false,
    passScored: false,
    approach: 0,
    ...extra,
  });

test("КРОВЬ МЕНЯЕТ СТАВКИ: попадание поднимает азарт, время его гасит", () => {
  const fresh = IDLE_COMBAT_TEMPER;
  assert.equal(fresh.appetite, 0);
  const bloodied = tick(fresh, 1 / 60, { hits: 1 });
  assert.ok(bloodied.appetite > 0.3, `одно попадание дало ${bloodied.appetite}`);
  // Три попадания — предел. Дальше расти некуда: сторож не превращается в
  // камикадзе от везения.
  let hot = fresh;
  for (let index = 0; index < 5; index += 1) {
    hot = tick(hot, 1 / 60, { hits: 1 });
  }
  assert.equal(hot.appetite, 1);
  // И тает: за полураспад — вдвое, за два — вчетверо.
  const cooled = tick(hot, 8);
  assert.ok(
    Math.abs(cooled.appetite - 0.5) < 0.02,
    `через восемь секунд ${cooled.appetite.toFixed(2)} вместо половины`,
  );
  assert.ok(tick(cooled, 8).appetite < 0.3);
});

test("ТРИ ПУСТЫХ ЗАХОДА — И ПОВТОРЯТЬ ПРОТИВНО", () => {
  let temper = IDLE_COMBAT_TEMPER;
  for (let pass = 0; pass < 3; pass += 1) {
    temper = tick(temper, 1 / 60, {
      passEnded: true,
      passScored: false,
      approach: 0,
    });
  }
  assert.ok(temper.frustration >= 1 - 1e-9, `досада ${temper.frustration}`);
  // А попадание всё обнуляет: работающий подход повторять НУЖНО, и память о
  // неудачах при этом теряет смысл.
  const relieved = tick(temper, 1 / 60, { passEnded: true, passScored: true });
  assert.equal(relieved.frustration, 0);
  assert.deepEqual(relieved.recentApproaches, []);
});

test("ПОКА ПОЛУЧАЕТСЯ — ТЕМ ЖЕ; перестало — чем угодно, кроме этого", () => {
  // Свежий зверь не выдумывает: он идёт тем, чем шёл.
  assert.equal(chooseApproach(IDLE_COMBAT_TEMPER, 2), 2);
  // Один пустой заход — и тот же подход больше не выбирается.
  const once = tick(IDLE_COMBAT_TEMPER, 1 / 60, {
    passEnded: true,
    approach: 2,
  });
  assert.notEqual(chooseApproach(once, 2), 2);
  // Два пустых разными подходами — и оба исключены.
  const twice = tick(once, 1 / 60, { passEnded: true, approach: 3 });
  const next = chooseApproach(twice, 3);
  assert.ok(next !== 2 && next !== 3, `выбран уже опробованный ${next}`);
  // Выбор ДЕТЕРМИНИРОВАН: бой обязан воспроизводиться на стенде.
  assert.equal(chooseApproach(twice, 3), chooseApproach(twice, 3));
});

test("ПОДХОД — ЭТО СТОРОНА И ЯРУС, и кодирование обратимо", () => {
  for (const side of [-1, 1]) {
    for (const vertical of [-1, 1]) {
      const code = approachCode(side, vertical);
      assert.equal(approachSide(code), side);
      assert.equal(approachVertical(code), vertical);
    }
  }
  // Четыре подхода и ни одним больше: сторона × ярус.
  const codes = new Set([
    approachCode(-1, -1),
    approachCode(-1, 1),
    approachCode(1, -1),
    approachCode(1, 1),
  ]);
  assert.equal(codes.size, 4);
});

test("АЗАРТ ПОДПУСКАЕТ БЛИЖЕ И ОПУСКАЕТ НИЖЕ — но земля не договаривается", () => {
  const calm = IDLE_COMBAT_TEMPER;
  const hot = { ...calm, appetite: 1 };
  assert.equal(pressedBreakRange(calm, 30), 30);
  assert.ok(
    pressedBreakRange(hot, 30) < 30 && pressedBreakRange(hot, 30) > 18,
    `подпустил на ${pressedBreakRange(hot, 30)}`,
  );
  assert.equal(daredFloor(calm, 20), 20);
  // Даже на полном азарте запас до земли остаётся заметным.
  assert.ok(
    daredFloor(hot, 20) >= 20 * 0.4,
    `запас до земли ужат до ${daredFloor(hot, 20)}`,
  );
});

test("СКУПОСТЬ ВЫВОДИТСЯ ИЗ ПОДА, а не запоминается", () => {
  // Полный и наполовину полный под — щедрость: ракета дешева, окно дорого.
  assert.equal(thrift(6, 6), 1);
  assert.equal(thrift(3, 6), 1);
  // Последняя ракета — выбирать: следующая через полминуты.
  assert.ok(thrift(1, 6) < 1, `на последних ${thrift(1, 6)}`);
  assert.ok(thrift(0, 6) < thrift(1, 6));
  assert.equal(thrift(3, 0), 1, "пода нет — скупиться не на чем");
});

test("ПУСТОЙ ПОД — ПОВЕДЕНИЕ: зверь без яда не улетает", () => {
  assert.equal(shadowing(0, false), true);
  assert.equal(shadowing(2, true), true, "снаряжается — тоже держится рядом");
  assert.equal(shadowing(2, false), false);
});
