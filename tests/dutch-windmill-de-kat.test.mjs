import assert from "node:assert/strict";
import test from "node:test";
import {
  DE_KAT_CAP_CROWN_Y,
  DE_KAT_FIXED_ROTOR_PHASE_DEGREES,
  DE_KAT_GALLERY_Y,
  DE_KAT_HUB_Y,
  DE_KAT_ROTOR_RADIUS,
  DE_KAT_ROTOR_SPAN,
  deKatMeshParts,
  deKatObject,
} from "../games/make-a-mess/src/content/objects/dutchWindmills/deKatObject.ts";

const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const rotorPlaneDistance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

test("паспорт мельницы фиксирует реальные размерные реперы", () => {
  assert.equal(DE_KAT_ROTOR_SPAN, 21.76);
  assert.equal(DE_KAT_ROTOR_RADIUS, 10.88);
  assert.equal(DE_KAT_GALLERY_Y, 7.1);
  assert.equal(DE_KAT_HUB_Y, 15.8);
  assert.equal(DE_KAT_CAP_CROWN_Y, 19);
  assert.equal(deKatObject.dimensions.maximumOperatingHeight, 26.68);
  assert.equal(deKatObject.dimensions.galleryOuterDiameter, 13.2);
});

test("единственный канонический объект владеет всеми деталями и именами", () => {
  assert.ok(deKatObject.parts.length > 100);
  assert.equal(new Set(deKatObject.parts.map((part) => part.id)).size, deKatObject.parts.length);
  assert.ok(deKatObject.parts.some((part) => part.group === "annex"));
  assert.ok(deKatObject.parts.some((part) => part.group === "cap" && part.kind === "mesh"));
  assert.ok(deKatObject.parts.some((part) => part.group === "gallery"));
  assert.ok(deKatMeshParts.every((part) => part.vertices.length >= 3 && part.triangles.length >= 1));
});

test("все стержни имеют положительную длину и сечение", () => {
  for (const part of deKatObject.parts) {
    if (part.kind === "beam") {
      assert.ok(distance(part.from, part.to) > 0.05, `${part.id}: нулевая длина`);
      assert.ok(part.width > 0 && part.depth > 0, `${part.id}: нулевое сечение`);
    }
    if (part.kind === "cylinder") {
      assert.ok(distance(part.from, part.to) > 0.05, `${part.id}: нулевая длина`);
      assert.ok(part.radius > 0, `${part.id}: нулевой радиус`);
    }
  }
});

test("четыре маха заканчиваются на одном круге 21,76 м", () => {
  const stocks = deKatObject.parts.filter((part) => /^rotor-\d-stock$/.test(part.id));
  assert.equal(stocks.length, 4);
  const pivot = deKatObject.rotor.pivot;
  for (const stock of stocks) {
    assert.equal(stock.kind, "beam");
    assert.ok(Math.abs(rotorPlaneDistance(stock.to, pivot) - DE_KAT_ROTOR_RADIUS) < 1e-9, stock.id);
  }
});

test("ротор не создаёт скрытую механику ветра", () => {
  assert.equal(deKatObject.rotor.fixedPhaseDegrees, DE_KAT_FIXED_ROTOR_PHASE_DEGREES);
  assert.equal(deKatObject.rotor.motion, "constant-rotation-only");
  assert.equal(deKatObject.rotor.windCoupling, false);
  assert.deepEqual(deKatObject.rotor.axis, [0, 0, 1]);
});

test("набор приёмочных камер фиксирован и содержит контроль конструкции", () => {
  const required = [
    "front",
    "left",
    "rear",
    "three-quarter-left",
    "three-quarter-right",
    "high-three-quarter",
    "rotor-joint",
    "silhouette",
  ];
  assert.deepEqual(deKatObject.views.map((view) => view.id), required);
  assert.equal(new Set(deKatObject.views.map((view) => view.id)).size, required.length);
});
