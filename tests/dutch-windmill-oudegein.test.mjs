import assert from "node:assert/strict";
import test from "node:test";
import {
  OUDEGEIN_FIXED_ROTOR_PHASE_DEGREES,
  OUDEGEIN_HUB_Y,
  OUDEGEIN_ROTOR_RADIUS,
  OUDEGEIN_ROTOR_SPAN,
  OUDEGEIN_SCOOP_WHEEL_DIAMETER,
  OUDEGEIN_WIND_SHAFT_LENGTH,
  oudegeinWipmolenObject,
} from "../games/make-a-mess/src/content/objects/dutchWindmills/oudegeinWipmolenObject.ts";

const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const rotorPlaneDistance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

test("паспорт M2 фиксирует опубликованные механические размеры", () => {
  assert.equal(OUDEGEIN_ROTOR_SPAN, 24.9);
  assert.equal(OUDEGEIN_ROTOR_RADIUS, 12.45);
  assert.equal(OUDEGEIN_HUB_Y, 12.85);
  assert.equal(OUDEGEIN_SCOOP_WHEEL_DIAMETER, 4.72);
  assert.equal(OUDEGEIN_WIND_SHAFT_LENGTH, 5.14);
  assert.ok(Math.abs(oudegeinWipmolenObject.dimensions.bladeLowerClearance - 0.4) < 1e-9);
  assert.ok(Math.abs(oudegeinWipmolenObject.dimensions.maximumOperatingHeight - 25.3) < 1e-9);
});

test("wipmolen остаётся двумя разными массами на видимом седле", () => {
  const groups = new Set(oudegeinWipmolenObject.parts.map((part) => part.group));
  assert.ok(groups.has("lower-tower"));
  assert.ok(groups.has("upper-house"));
  assert.ok(groups.has("seat"));
  assert.ok(groups.has("tail"));
  assert.ok(groups.has("scoop-wheel"));
  assert.ok(oudegeinWipmolenObject.parts.some((part) => part.id === "main-post" && part.kind === "cylinder"));
});

test("четыре маха заканчиваются на окружности 24,90 м", () => {
  const stocks = oudegeinWipmolenObject.parts.filter((part) => /^rotor-\d-stock$/.test(part.id));
  assert.equal(stocks.length, 4);
  for (const stock of stocks) {
    assert.equal(stock.kind, "beam");
    assert.ok(Math.abs(rotorPlaneDistance(stock.to, oudegeinWipmolenObject.rotor.pivot) - OUDEGEIN_ROTOR_RADIUS) < 1e-9, stock.id);
  }
});

test("ветер и исторический поворот верхнего дома явно запрещены", () => {
  assert.equal(oudegeinWipmolenObject.rotor.fixedPhaseDegrees, OUDEGEIN_FIXED_ROTOR_PHASE_DEGREES);
  assert.equal(oudegeinWipmolenObject.rotor.windCoupling, false);
  assert.equal(oudegeinWipmolenObject.motionConstraints?.windSimulation, false);
  assert.equal(oudegeinWipmolenObject.motionConstraints?.upperHouseYaw, false);
  assert.equal(oudegeinWipmolenObject.motionConstraints?.tailYaw, false);
  assert.equal(oudegeinWipmolenObject.motionConstraints?.sailRotation, "constant-only");
});

test("все детали невырождены и ids уникальны", () => {
  assert.equal(new Set(oudegeinWipmolenObject.parts.map((part) => part.id)).size, oudegeinWipmolenObject.parts.length);
  for (const part of oudegeinWipmolenObject.parts) {
    if (part.kind === "beam" || part.kind === "cylinder") {
      assert.ok(distance(part.from, part.to) > 0.04, `${part.id}: нулевая длина`);
    }
    if (part.kind === "mesh") {
      assert.ok(part.vertices.length >= 3, part.id);
      assert.ok(part.triangles.length >= 1, part.id);
    }
  }
});

test("приёмочные камеры включают отдельные проверки седла и черпачного колеса", () => {
  const ids = oudegeinWipmolenObject.views.map((view) => view.id);
  assert.deepEqual(ids, [
    "front", "left", "rear", "three-quarter-left", "three-quarter-right",
    "high-three-quarter", "seat-and-tail", "scoop-wheel", "silhouette",
  ]);
});
