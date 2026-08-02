import assert from "node:assert/strict";
import test from "node:test";
import {
  DEMOLITION_CHARGE_RANGE,
  DEMOLITION_DETONATION_STAGGER_MS,
  MAX_DEMOLITION_CHARGES,
  demolitionDetonationDelay,
} from "../games/make-a-mess/src/game/demolitionCharge.ts";

test("взрывчатка ограничена десятью зарядами в рабочей дальности", () => {
  assert.equal(MAX_DEMOLITION_CHARGES, 10);
  assert.ok(DEMOLITION_CHARGE_RANGE >= 30);
});

test("одна команда раскладывает тяжёлую физику короткой цепью", () => {
  assert.equal(demolitionDetonationDelay(0), 0);
  assert.equal(demolitionDetonationDelay(1), DEMOLITION_DETONATION_STAGGER_MS);
  assert.equal(
    demolitionDetonationDelay(MAX_DEMOLITION_CHARGES - 1),
    450,
  );
});
