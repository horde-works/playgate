import assert from "node:assert/strict";
import test from "node:test";
import {
  advanceRotorcraftGovernor,
  corneringSpeed,
  DEFAULT_SLIP_POLICY,
  measuredSlipAngle,
  NEUTRAL_GOVERNOR,
  pathSpeedCeiling,
  pathTurnAngle,
  pathTurnRadius,
} from "../games/make-a-mess/src/game/rotorcraftSpeedGovernor.ts";

const degrees = (value) => (value * 180) / Math.PI;

// Способности RAX-8 Tonkawa, снятые замерами: рыскание из аллокатора,
// поперечное из паспортного крена 56°, торможение — реверс тоннелей.
const TONKAWA = {
  yawRate: 0.72,
  lateralAcceleration: 9.81 * Math.tan((56 * Math.PI) / 180),
  braking: 24.8,
};
// Тот же аппарат без тоннелей: рыскание втрое слабее, тормозит одним наклоном.
const PLAIN = {
  yawRate: 0.34,
  lateralAcceleration: 9.81 * Math.tan((34 * Math.PI) / 180),
  braking: 6.6,
};

test("радиус и угол поворота снимаются с трассы, а прямая не ограничивает ничего", () => {
  // Три точки на окружности радиуса 30 вокруг начала координат.
  const at = (angle) => [30 * Math.cos(angle), 30 * Math.sin(angle)];
  const radius = pathTurnRadius(at(-0.2), at(0), at(0.2));
  assert.ok(Math.abs(radius - 30) < 0.3, `радиус ${radius.toFixed(2)} вместо 30`);

  const straight = pathTurnRadius([0, 0], [0, 10], [0, 20]);
  assert.equal(straight, Number.POSITIVE_INFINITY);
  assert.equal(pathTurnAngle([0, 0], [0, 10], [0, 20]), 0);

  const corner = pathTurnAngle([0, 0], [0, 10], [10, 10]);
  assert.ok(Math.abs(degrees(corner) - 90) < 1e-6, `излом ${degrees(corner)}°`);
});

test("на прямой ограничения нет, и это не «очень много», а бесконечность", () => {
  assert.equal(
    corneringSpeed(Number.POSITIVE_INFINITY, 0, TONKAWA, DEFAULT_SLIP_POLICY.enRoute),
    Number.POSITIVE_INFINITY,
  );
});

test("вираж ограничивает то рыскание, то крен — в зависимости от радиуса", () => {
  // Замеренная развилка: на тесном вираже не успевает нос, на широком не
  // хватает крена. Одним числом это не выражается, ради чего модуль и написан.
  const tight = corneringSpeed(15, Math.PI / 2, TONKAWA, 0);
  const wide = corneringSpeed(50, Math.PI / 2, TONKAWA, 0);
  assert.ok(
    Math.abs(tight - TONKAWA.yawRate * 15) < 1e-6,
    `на радиусе 15 обязано ограничивать рыскание, вышло ${tight.toFixed(1)}`,
  );
  assert.ok(
    Math.abs(wide - Math.sqrt(TONKAWA.lateralAcceleration * 50)) < 1e-6,
    `на радиусе 50 обязан ограничивать крен, вышло ${wide.toFixed(1)}`,
  );
});

test("разрешённый занос поднимает скорость, но только по каналу рыскания", () => {
  const strict = corneringSpeed(20, Math.PI / 2, TONKAWA, 0);
  const loose = corneringSpeed(20, Math.PI / 2, TONKAWA, DEFAULT_SLIP_POLICY.enRoute);
  assert.ok(loose > strict, "занос обязан давать прибавку");
  // Но выше предела по крену занос не поднимает: поперечной силы больше нет.
  const byBank = Math.sqrt(TONKAWA.lateralAcceleration * 20);
  assert.ok(
    loose <= byBank + 1e-9,
    `занос перепрыгнул предел по крену: ${loose.toFixed(1)} > ${byBank.toFixed(1)}`,
  );
});

test("короткий излом проходится быстрее длинной дуги того же радиуса", () => {
  // Если вся дуга короче допустимого заноса, нос не успеет отстать заметно.
  const shortKink = corneringSpeed(20, DEFAULT_SLIP_POLICY.enRoute * 0.8, TONKAWA, DEFAULT_SLIP_POLICY.enRoute);
  const longArc = corneringSpeed(20, Math.PI, TONKAWA, DEFAULT_SLIP_POLICY.enRoute);
  assert.ok(
    shortKink > longArc,
    `излом ${shortKink.toFixed(1)} обязан быть быстрее дуги ${longArc.toFixed(1)}`,
  );
});

test("створ зажимает машину сильнее маршрута", () => {
  // Радиус выбран там, где решает РЫСКАНИЕ: на широком вираже ограничивает
  // крен, и допуск заноса на него влиять не обязан — поперечной силы от него
  // не прибавляется.
  const enRoute = corneringSpeed(12, Math.PI / 2, TONKAWA, DEFAULT_SLIP_POLICY.enRoute);
  const onApproach = corneringSpeed(12, Math.PI / 2, TONKAWA, DEFAULT_SLIP_POLICY.onApproach);
  assert.ok(
    onApproach < enRoute,
    `на заходе ${onApproach.toFixed(1)} обязано быть меньше маршрутных ${enRoute.toFixed(1)}`,
  );
  assert.equal(DEFAULT_SLIP_POLICY.enRoute > DEFAULT_SLIP_POLICY.onApproach, true);
});

test("выбитый орган рыскания сам замедляет машину, без единой правки маршрута", () => {
  const healthy = corneringSpeed(25, Math.PI / 2, TONKAWA, DEFAULT_SLIP_POLICY.enRoute);
  const damaged = corneringSpeed(
    25,
    Math.PI / 2,
    { ...TONKAWA, yawRate: 0.2 },
    DEFAULT_SLIP_POLICY.enRoute,
  );
  assert.ok(
    damaged < healthy * 0.6,
    `повреждённая обязана заметно сбросить: ${damaged.toFixed(1)} против ${healthy.toFixed(1)}`,
  );
});

test("до виража надо успеть затормозить, и запас считается настоящим торможением", () => {
  const ahead = [{ distance: 60, radius: 15, turnAngle: Math.PI / 2 }];
  const strong = pathSpeedCeiling(ahead, TONKAWA, DEFAULT_SLIP_POLICY.enRoute);
  const weak = pathSpeedCeiling(ahead, PLAIN, DEFAULT_SLIP_POLICY.enRoute);
  assert.ok(
    strong > weak,
    "машина с реверсом обязана подходить к виражу быстрее",
  );
  // Прямо у виража потолок обязан совпасть с самой скоростью виража.
  const atTurn = pathSpeedCeiling(
    [{ distance: 0, radius: 15, turnAngle: Math.PI / 2 }],
    TONKAWA,
    DEFAULT_SLIP_POLICY.enRoute,
  );
  const target = corneringSpeed(15, Math.PI / 2, TONKAWA, DEFAULT_SLIP_POLICY.enRoute);
  assert.ok(Math.abs(atTurn - target) < 1e-6);
});

test("самый строгий вираж впереди и решает, а не ближайший", () => {
  const ceiling = pathSpeedCeiling(
    [
      { distance: 10, radius: 400, turnAngle: 0.05 },
      { distance: 80, radius: 12, turnAngle: Math.PI / 2 },
    ],
    TONKAWA,
    DEFAULT_SLIP_POLICY.enRoute,
  );
  const onlyNear = pathSpeedCeiling(
    [{ distance: 10, radius: 400, turnAngle: 0.05 }],
    TONKAWA,
    DEFAULT_SLIP_POLICY.enRoute,
  );
  assert.ok(ceiling < onlyNear, "дальний тесный вираж обязан быть виден заранее");
});

test("занос меряется, но на висении его как явления нет", () => {
  assert.equal(measuredSlipAngle(0.4, 0.3), 0, "на висении заноса не бывает");
  const slip = measuredSlipAngle(10, 10);
  assert.ok(Math.abs(degrees(slip) - 45) < 1e-6, `${degrees(slip)}° вместо 45`);
  assert.ok(measuredSlipAngle(10, -6) < 0, "знак заноса обязан сохраняться");
});

test("ограничитель режет быстро, а отпускает медленно", () => {
  const dt = 1 / 60;
  let state = NEUTRAL_GOVERNOR;
  // Нос отстал вдвое сильнее разрешённого — скорость обязана поехать вниз.
  for (let step = 0; step < 60; step += 1) {
    state = advanceRotorcraftGovernor(state, DEFAULT_SLIP_POLICY.enRoute * 2, DEFAULT_SLIP_POLICY.enRoute, dt);
  }
  // Закон прямой: доля = допуск / замер. Вдвое больший занос — вдвое ниже.
  assert.ok(
    Math.abs(state.scale - 0.5) < 0.02,
    `за секунду срезал до ${state.scale.toFixed(2)}, а закон требует 0.50`,
  );
  const cut = state.scale;

  // Занос ушёл — но возврат медленный, за ту же секунду далеко не до единицы.
  let recovering = { scale: cut };
  for (let step = 0; step < 60; step += 1) {
    recovering = advanceRotorcraftGovernor(recovering, 0, DEFAULT_SLIP_POLICY.enRoute, dt);
  }
  assert.ok(recovering.scale > cut, "обязан отпускать");
  assert.ok(
    recovering.scale < 0.95,
    `отпустил слишком быстро: ${recovering.scale.toFixed(2)}`,
  );
});

test("в пределах допуска ограничитель не трогает скорость вовсе", () => {
  let state = { scale: 0.6 };
  for (let step = 0; step < 600; step += 1) {
    state = advanceRotorcraftGovernor(
      state,
      DEFAULT_SLIP_POLICY.enRoute * 0.5,
      DEFAULT_SLIP_POLICY.enRoute,
      1 / 60,
    );
  }
  assert.ok(state.scale > 0.99, `завис на ${state.scale.toFixed(3)}`);
});
