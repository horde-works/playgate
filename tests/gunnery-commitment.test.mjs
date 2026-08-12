import assert from "node:assert/strict";
import test from "node:test";
import {
  evasionRadius,
  maximumEffectiveRange,
  shotWorthTaking,
  unusedLateralAcceleration,
} from "../games/make-a-mess/src/game/vehicleGunnery.ts";

/**
 * МАНЁВР — ЭТО ОБЯЗАТЕЛЬСТВО, А НЕ СВОБОДА.
 *
 * Проверяется перевёрнутый знак, который легко поставить неверно и который я
 * сперва поставил неверно. Интуиция говорит: вёрткая цель непредсказуема, по
 * ней издалека не попасть. Физика говорит обратное — поперечное ускорение
 * конечно, и потраченное на нынешнюю кривую потрачено. Машина, выгребающая всю
 * власть в фигуре, увернуться уже нечем: она на рельсах, и это самая удобная
 * мишень, какой она бывает.
 */

/** Ускорение, которое стрелок предполагает у противника: своё собственное. */
const ASSUMED = 14.5;
/** Ракета RAX-8: 96 м/с, радиус поражения 2.0 м. */
const ROCKET_SPEED = 96;
const LETHAL = 2.0;

const track = (speed, turnRate, radius = 2.9) => ({
  velocity: [speed, 0, 0],
  turnRate,
  radius,
});

test("ПОТРАЧЕННОЕ НА КРИВУЮ — ПОТРАЧЕНО: остаток падает с кривизной", () => {
  const straight = unusedLateralAcceleration(track(30, 0), ASSUMED);
  assert.ok(
    Math.abs(straight - ASSUMED) < 1e-9,
    "идущий прямо располагает всем своим ускорением",
  );
  // Тридцать метров в секунду при 0.3 рад/с — это девять м/с² центростремитель-
  // ного, то есть больше половины бюджета. Остаток обязан заметно просесть.
  const turning = unusedLateralAcceleration(track(30, 0.3), ASSUMED);
  assert.ok(turning < straight * 0.8, `остаток ${turning.toFixed(1)} слишком щедр`);
  // А выгребающий всё — не располагает ничем, и это НОЛЬ, а не малое число:
  // отрицательного остатка не бывает.
  assert.equal(unusedLateralAcceleration(track(30, 0.8), ASSUMED), 0);
  assert.equal(unusedLateralAcceleration(track(14, 2.6), ASSUMED), 0);
});

test("КУЛЬБИТ ДЕЛАЕТ ЦЕЛЬ НЕПОДВИЖНОЙ МИШЕНЬЮ, а не неуловимой", () => {
  // Замеренный кульбит VX-8: ход падает до 10–13 м/с, темп доходит до 2.6 рад/с.
  const kulbit = track(12, 2.6);
  const cruising = track(30, 0);
  const flight = 60 / ROCKET_SPEED;
  assert.equal(
    evasionRadius(kulbit, flight, ASSUMED),
    0,
    "связанная фигурой машина с точки не сходит вовсе",
  );
  assert.ok(
    evasionRadius(cruising, flight, ASSUMED) > 2,
    "свободная — сходит, и заметно",
  );
});

test("ПРЕДЕЛЬНАЯ ДАЛЬНОСТЬ ВЫВОДИТСЯ ИЗ ЦЕЛИ, а не назначается оружию", () => {
  // Против свободной машины: R = v·√(2L/a). При 96 м/с, двух метрах поражения
  // и полном остатке это около полусотни метров — то есть ближе, чем
  // паспортные 85, и это честный ответ, а не занижение.
  const free = maximumEffectiveRange(track(30, 0), ROCKET_SPEED, LETHAL, ASSUMED);
  assert.ok(free > 30 && free < 70, `${free.toFixed(0)} м против свободной`);
  // Против связанной предел уходит за любой разумный: стрелять можно с чего
  // угодно, лишь бы ракета долетела.
  assert.equal(
    maximumEffectiveRange(track(12, 2.6), ROCKET_SPEED, LETHAL, ASSUMED),
    Number.POSITIVE_INFINITY,
  );
  // И потолок обязан уважаться: дальше собственной дальности оружия не бьют.
  assert.equal(
    maximumEffectiveRange(track(12, 2.6), ROCKET_SPEED, LETHAL, ASSUMED, 85),
    85,
  );
  // Между крайностями величина обязана быть монотонной по кривизне: чем сильнее
  // цель связана, тем дальше по ней можно работать.
  const gentle = maximumEffectiveRange(track(30, 0.15), ROCKET_SPEED, LETHAL, ASSUMED, 500);
  const hard = maximumEffectiveRange(track(30, 0.4), ROCKET_SPEED, LETHAL, ASSUMED, 500);
  assert.ok(hard > gentle, `${hard.toFixed(0)} обязано быть дальше ${gentle.toFixed(0)}`);
});

test("СТОИТ ЛИ ПУСКАТЬ — вопрос о цели и дистанции вместе, а не по отдельности", () => {
  const free = track(30, 0);
  const bound = track(12, 2.6);
  // Вблизи по свободной — стоит: за четверть секунды подлёта уйти некуда.
  assert.equal(shotWorthTaking(free, 25, ROCKET_SPEED, LETHAL, ASSUMED), true);
  // Издалека по свободной — нет: полторы секунды подлёта, и она уходит на
  // полтора десятка метров.
  assert.equal(shotWorthTaking(free, 140, ROCKET_SPEED, LETHAL, ASSUMED), false);
  // По связанной — стоит и с той же дальности. В этом вся мысль.
  assert.equal(shotWorthTaking(bound, 140, ROCKET_SPEED, LETHAL, ASSUMED), true);
});

test("ГАБАРИТ ЦЕЛИ ВХОДИТ В ПОРОГ: ракета в полуметре от лопасти её снимает", () => {
  const small = { velocity: [26, 0, 0], turnRate: 0.1, radius: 0.5 };
  const large = { ...small, radius: 6 };
  // Одна и та же дистанция: по крупной машине пускать стоит, по мелкой — нет.
  let range = 60;
  while (shotWorthTaking(small, range, ROCKET_SPEED, LETHAL, ASSUMED) && range < 400) {
    range += 5;
  }
  assert.ok(
    shotWorthTaking(large, range, ROCKET_SPEED, LETHAL, ASSUMED),
    `на ${range} м по мелкой уже нельзя, а по крупной обязано быть можно`,
  );
});
