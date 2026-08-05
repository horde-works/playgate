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
import * as governorModule from "../games/make-a-mess/src/game/rotorcraftSpeedGovernor.ts";

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
  // Свойство живёт там, где рыскание вообще связывает, то есть на створе:
  // на маршруте занос почти свободен намеренно, и ограничивает только крен.
  const shortKink = corneringSpeed(20, DEFAULT_SLIP_POLICY.onApproach * 0.8, TONKAWA, DEFAULT_SLIP_POLICY.onApproach);
  const longArc = corneringSpeed(20, Math.PI, TONKAWA, DEFAULT_SLIP_POLICY.onApproach);
  assert.ok(
    shortKink > longArc,
    `излом ${shortKink.toFixed(1)} обязан быть быстрее дуги ${longArc.toFixed(1)}`,
  );
});

test("на маршруте занос свободен, а на створе зажат: курс важен только там", () => {
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
  // Маршрутный допуск обязан быть настолько широким, чтобы не тормозить машину
  // за проход манёвра боком: голономная держит трассу, а не курс.
  assert.equal(
    DEFAULT_SLIP_POLICY.enRoute > Math.PI / 4,
    true,
    "маршрутный занос зажат — машина превратится в рейсовый автобус",
  );
});

test("выбитый орган рыскания сам замедляет машину, без единой правки маршрута", () => {
  // Опять же на створе: там машина обязана прийти В ПОЛОЖЕНИИ, и потерянный
  // орган рыскания честно отнимает скорость захода. На маршруте она полетит
  // боком и это нормально — трассу она держит перемещением, а не носом.
  const healthy = corneringSpeed(25, Math.PI / 2, TONKAWA, DEFAULT_SLIP_POLICY.onApproach);
  const damaged = corneringSpeed(
    25,
    Math.PI / 2,
    { ...TONKAWA, yawRate: 0.2 },
    DEFAULT_SLIP_POLICY.onApproach,
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

test("на маршруте машину НЕ тормозят за то, что она идёт боком", () => {
  // Прямое следствие правила: голономная держит трассу, а не курс. Если
  // ограничитель начнёт резать скорость за занос, получится рейсовый автобус —
  // ровно то, чем эта машина быть не должна.
  const sharp = corneringSpeed(20, Math.PI / 2, TONKAWA, DEFAULT_SLIP_POLICY.enRoute);
  const byBankAlone = Math.sqrt(TONKAWA.lateralAcceleration * 20);
  assert.ok(
    Math.abs(sharp - byBankAlone) < 1e-6,
    `на маршруте ограничивать обязан только крен, а вышло ${sharp.toFixed(1)} против ${byBankAlone.toFixed(1)}`,
  );
  // И даже наполовину потерянное рыскание маршрутную скорость не трогает.
  const damaged = corneringSpeed(
    20,
    Math.PI / 2,
    { ...TONKAWA, yawRate: 0.3 },
    DEFAULT_SLIP_POLICY.enRoute,
  );
  assert.ok(Math.abs(damaged - byBankAlone) < 1e-6);
});

test("точность — свойство траектории: допуск заноса выводится из ширины коридора", () => {
  // Узкая улица судится створовой строгостью, открытый воздух — маршрутной
  // свободой, между ними плавно и монотонно. Створ перестаёт быть особым
  // случаем: это просто участок с узким коридором.
  const { slipAllowanceForCorridor } = governorModule;
  const street = slipAllowanceForCorridor(0.5);
  const narrow = slipAllowanceForCorridor(4);
  const middle = slipAllowanceForCorridor(12);
  const open = slipAllowanceForCorridor(30);
  assert.equal(Math.abs(street - DEFAULT_SLIP_POLICY.onApproach) < 1e-9, true);
  assert.equal(Math.abs(narrow - DEFAULT_SLIP_POLICY.onApproach) < 1e-9, true);
  assert.equal(middle > narrow && middle < open, true, "между границами — плавно");
  assert.equal(Math.abs(open - DEFAULT_SLIP_POLICY.enRoute) < 1e-9, true);
  // И через закон виража узкий коридор означает МЕДЛЕННО на том же радиусе.
  const slow = corneringSpeed(12, Math.PI / 2, TONKAWA, street);
  const fast = corneringSpeed(12, Math.PI / 2, TONKAWA, open);
  assert.equal(slow < fast, true, "узкий коридор обязан стоить скорости");
});
