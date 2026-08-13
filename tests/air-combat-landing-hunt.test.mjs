import assert from "node:assert/strict";
import test from "node:test";
import { runDuel } from "./air-combat-rig.mjs";

/**
 * Обычная дуэль зацикливает VX до последних восьми процентов маршрута. Эта
 * проба намеренно оставляет посадочный столб живым: именно там прежде RAX
 * складывался с целью по XZ, висел над ней плашмя и получал ложный диагноз.
 */
const landing = runDuel({
  seconds: 55,
  target: "vx8",
  startProgress: 0.92,
  loopTarget: false,
});

test("стенд действительно доводит VX до посадочной точки", () => {
  assert.ok(
    landing.targetProgressAtEnd > 0.999,
    `стенд остановился на ${(landing.targetProgressAtEnd * 100).toFixed(1)}%`,
  );
});

test("RAX не складывается плашмя над садящимся VX", () => {
  assert.ok(
    landing.flatOverheadSeconds < 0.25,
    `плашмя над целью ${landing.flatOverheadSeconds.toFixed(2)} с`,
  );
});

test("пол дисквалифицирует нижний заход, а не превращает его в зависание", () => {
  const atTouchdown = landing.attackEntries.filter(
    (entry) => entry.targetProgress > 0.9999,
  );
  assert.ok(atTouchdown.length > 0, "охотник не дошёл до броска у площадки");
  assert.ok(
    atTouchdown.every(
      (entry) => entry.vertical > 0 && entry.entryAbove > 0,
    ),
    `под площадкой остался вынос ${JSON.stringify(atTouchdown)}`,
  );
});

test("краткий недобор тела не превращается в устойчивую потерю управления", () => {
  assert.ok(
    landing.bodyLossFrames < 30,
    `потеря тела держалась ${landing.bodyLossFrames} кадров`,
  );
});
