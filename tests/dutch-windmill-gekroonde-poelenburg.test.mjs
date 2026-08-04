import assert from "node:assert/strict";
import test from "node:test";
import {
  POELENBURG_CAP_CROWN_Y,
  POELENBURG_BODY_FRONT_Z,
  POELENBURG_FIXED_ROTOR_PHASE_DEGREES,
  POELENBURG_HUB_Y,
  POELENBURG_ROLLER_WALL_DIAMETER,
  POELENBURG_ROTOR_PLANE_Z,
  POELENBURG_ROTOR_RADIUS,
  POELENBURG_ROTOR_SPAN,
  gekroondePoelenburgPaltrokObject,
} from "../games/make-a-mess/src/content/objects/dutchWindmills/gekroondePoelenburgPaltrokObject.ts";

const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const rotorPlaneDistance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

test("паспорт M4 заменяет концептный размах опубликованным", () => {
  assert.equal(POELENBURG_ROTOR_SPAN, 23);
  assert.equal(POELENBURG_ROTOR_RADIUS, 11.5);
  assert.equal(POELENBURG_HUB_Y, 11.8);
  assert.equal(POELENBURG_CAP_CROWN_Y, 13.3);
  assert.equal(POELENBURG_ROLLER_WALL_DIAMETER, 7.2);
  assert.ok(Math.abs(gekroondePoelenburgPaltrokObject.dimensions.bladeLowerClearance - 0.3) < 1e-9);
});

test("paltrok опирается на кольцевую стену, шестнадцать роликов и центральный король", () => {
  assert.ok(gekroondePoelenburgPaltrokObject.parts.some((part) => part.id === "brick-ring-wall" && part.kind === "mesh"));
  assert.ok(gekroondePoelenburgPaltrokObject.parts.some((part) => part.id === "king-post" && part.kind === "cylinder"));
  const rollers = gekroondePoelenburgPaltrokObject.parts.filter((part) => /^roller-\d+$/.test(part.id));
  assert.equal(rollers.length, 16);
  assert.ok(rollers.every((part) => part.kind === "cylinder"));
});

test("корпус остаётся открытой paltrok-площадкой с боковыми крыльями", () => {
  const groups = new Set(gekroondePoelenburgPaltrokObject.parts.map((part) => part.group));
  assert.ok(groups.has("saw-floor"));
  assert.ok(groups.has("wing-frame"));
  assert.ok(groups.has("wings"));
  assert.equal(gekroondePoelenburgPaltrokObject.dimensions.bodyWidthIncludingWings, 17.8);
  assert.equal(gekroondePoelenburgPaltrokObject.dimensions.bodyDepth, 12.6);
  assert.ok(!gekroondePoelenburgPaltrokObject.parts.some((part) => part.id === "rear-saw-hall-wall"));
});

test("ступенчатая plank wall является повторяемой геометрией, не текстурой", () => {
  const courses = gekroondePoelenburgPaltrokObject.parts.filter((part) => /^stepped-plank-course-\d+-segment-\d+$/.test(part.id));
  assert.equal(new Set(courses.map(({ id }) => Number(id.match(/course-(\d+)/)?.[1]))).size, 16);
  assert.ok(courses.every((part) => part.kind === "box"));
});

test("три пильные рамы остаются внутри открытого этажа", () => {
  const heads = gekroondePoelenburgPaltrokObject.parts.filter((part) => /^saw-frame-\d-head$/.test(part.id));
  assert.equal(heads.length, 3);
  assert.equal(gekroondePoelenburgPaltrokObject.dimensions.sawFrameCount, 3);
});

test("полная длина каждой лопасти проходит перед всеми опорами корпуса", () => {
  assert.equal(POELENBURG_BODY_FRONT_Z, 6.3);
  assert.equal(POELENBURG_ROTOR_PLANE_Z, 6.9);
  const stocks = gekroondePoelenburgPaltrokObject.parts.filter((part) => /^rotor-\d-stock$/.test(part.id));
  assert.equal(stocks.length, 4);
  for (const stock of stocks) {
    assert.equal(stock.kind, "beam");
    assert.ok(Math.abs(rotorPlaneDistance(stock.to, gekroondePoelenburgPaltrokObject.rotor.pivot) - POELENBURG_ROTOR_RADIUS) < 1e-9);
  }

  const bladeParts = gekroondePoelenburgPaltrokObject.parts.filter((part) => /^rotor-\d-/.test(part.id));
  const bladeMinimumZ = Math.min(...bladeParts.map((part) => {
    if (part.kind === "beam") return Math.min(part.from[2], part.to[2]) - part.depth / 2;
    if (part.kind === "cylinder") return Math.min(part.from[2], part.to[2]) - part.radius;
    if (part.kind === "box") return part.center[2] - part.size[2] / 2;
    return Math.min(...part.vertices.map((vertex) => vertex[2]));
  }));
  assert.ok(bladeMinimumZ - POELENBURG_BODY_FRONT_Z >= 0.4, `зазор по Z только ${bladeMinimumZ - POELENBURG_BODY_FRONT_Z}`);
});

test("исторический поворот всего корпуса не включается скрытно", () => {
  assert.equal(gekroondePoelenburgPaltrokObject.rotor.fixedPhaseDegrees, POELENBURG_FIXED_ROTOR_PHASE_DEGREES);
  assert.equal(gekroondePoelenburgPaltrokObject.rotor.windCoupling, false);
  assert.equal(gekroondePoelenburgPaltrokObject.motionConstraints?.windSimulation, false);
  assert.equal(gekroondePoelenburgPaltrokObject.motionConstraints?.wholeBodyYaw, false);
  assert.equal(gekroondePoelenburgPaltrokObject.motionConstraints?.rollerRingMotion, false);
  assert.equal(gekroondePoelenburgPaltrokObject.motionConstraints?.sailRotation, "constant-only");
});

test("все детали невырождены и ids уникальны", () => {
  assert.equal(new Set(gekroondePoelenburgPaltrokObject.parts.map((part) => part.id)).size, gekroondePoelenburgPaltrokObject.parts.length);
  for (const part of gekroondePoelenburgPaltrokObject.parts) {
    if (part.kind === "beam" || part.kind === "cylinder") assert.ok(distance(part.from, part.to) > 0.04, part.id);
    if (part.kind === "mesh") {
      assert.ok(part.vertices.length >= 3, part.id);
      assert.ok(part.triangles.length >= 1, part.id);
    }
  }
});

test("приёмочные камеры отделяют внешний силуэт от двух cutaway-проверок", () => {
  assert.deepEqual(gekroondePoelenburgPaltrokObject.views.map((view) => view.id), [
    "front", "left", "rear", "three-quarter-left", "three-quarter-rear",
    "high-three-quarter", "roller-ring", "open-saw-floor", "night-open-floor", "window-detail", "silhouette",
  ]);
  assert.ok(gekroondePoelenburgPaltrokObject.views.find((view) => view.id === "roller-ring")?.hiddenGroups?.length);
  assert.ok(gekroondePoelenburgPaltrokObject.views.find((view) => view.id === "open-saw-floor")?.hiddenGroups?.length);
});
