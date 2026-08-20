import assert from "node:assert/strict";
import test from "node:test";
import {
  DECK_RADIUS,
  GLAZING_RADIUS,
  KALLUR_LIGHTHOUSE_TOTAL_HEIGHT,
  RAIL_RADIUS,
  ROOF_BASE_RADIUS,
  kallurLighthouseObject,
  kallurLighthouseParts,
} from "../games/make-a-mess/src/content/objects/kallur/kallurLighthouseObject.ts";

const partBounds = (part) => {
  if (part.kind === "box") {
    // Conservative bounds: rotated boxes report their circumscribed extent.
    const half = Math.hypot(part.size[0] / 2, part.size[2] / 2);
    const rotated = part.rotation && (part.rotation[0] !== 0 || part.rotation[1] !== 0 || part.rotation[2] !== 0);
    const hx = rotated ? half : part.size[0] / 2;
    const hz = rotated ? half : part.size[2] / 2;
    const hy = rotated && part.rotation[2] !== 0
      ? Math.hypot(part.size[0] / 2, part.size[1] / 2)
      : part.size[1] / 2;
    return {
      min: [part.center[0] - hx, part.center[1] - hy, part.center[2] - hz],
      max: [part.center[0] + hx, part.center[1] + hy, part.center[2] + hz],
    };
  }
  if (part.kind === "cylinder" || part.kind === "beam") {
    const r = part.kind === "cylinder" ? part.radius : Math.hypot(part.width, part.depth) / 2;
    // A vertical member spreads its radius only in plan, not along its axis.
    const vertical = part.from[0] === part.to[0] && part.from[2] === part.to[2];
    const pad = (axis) => (vertical && axis === 1 ? 0 : r);
    const min = [0, 1, 2].map((axis) => Math.min(part.from[axis], part.to[axis]) - pad(axis));
    const max = [0, 1, 2].map((axis) => Math.max(part.from[axis], part.to[axis]) + pad(axis));
    return { min, max };
  }
  const xs = part.vertices.map((v) => v[0]);
  const ys = part.vertices.map((v) => v[1]);
  const zs = part.vertices.map((v) => v[2]);
  return {
    min: [Math.min(...xs), Math.min(...ys), Math.min(...zs)],
    max: [Math.max(...xs), Math.max(...ys), Math.max(...zs)],
  };
};

test("маяк: бюджет и уникальность частей", () => {
  assert.ok(
    kallurLighthouseParts.length <= 95,
    `${kallurLighthouseParts.length} частей превышает бюджет 95`,
  );
  const ids = new Set(kallurLighthouseParts.map((part) => part.id));
  assert.equal(ids.size, kallurLighthouseParts.length, "id частей не уникальны");
});

test("маяк: восстановленная высота равна паспортной 7.0", () => {
  let top = -Infinity;
  let bottom = Infinity;
  for (const part of kallurLighthouseParts) {
    const bounds = partBounds(part);
    top = Math.max(top, bounds.max[1]);
    bottom = Math.min(bottom, bounds.min[1]);
  }
  assert.ok(Math.abs(top - KALLUR_LIGHTHOUSE_TOTAL_HEIGHT) <= 0.05,
    `верх ${top.toFixed(3)} не равен ${KALLUR_LIGHTHOUSE_TOTAL_HEIGHT}`);
  assert.ok(bottom <= 0.001, `подошва ${bottom.toFixed(3)} не касается y=0`);
});

test("маяк: оконные проёмы — настоящие пустоты в несущей оболочке", () => {
  // Ни одна белая деталь ствола не накрывает апертуру окна: зона
  // (|x| < 0.17, y в свету проёма, z у наружной грани) должна быть пуста.
  const apertures = [
    { y0: 1.45, y1: 1.95 },
    { y0: 2.75, y1: 3.25 },
  ];
  for (const aperture of apertures) {
    for (const part of kallurLighthouseParts) {
      if (part.group !== "lighthouse-shaft") continue;
      const bounds = partBounds(part);
      const coversX = bounds.min[0] < 0.17 && bounds.max[0] > -0.17;
      const coversY = bounds.min[1] < aperture.y1 - 0.02 && bounds.max[1] > aperture.y0 + 0.02;
      const coversZ = bounds.max[2] > 0.9;
      assert.ok(
        !(coversX && coversY && coversZ),
        `${part.id} закрывает оконный проём y ${aperture.y0}..${aperture.y1}`,
      );
    }
  }
});

test("маяк: стекло не светится, светом владеет только колба", () => {
  const lights = kallurLighthouseParts.filter((part) => part.light);
  assert.equal(lights.length, 1, "источник света должен быть ровно один");
  assert.equal(lights[0].id, "lamp-bulb", "источник обязан жить на колбе");
  assert.equal(lights[0].material, "lamp-bulb");
  for (const part of kallurLighthouseParts) {
    if (part.material === "lamp-glass" || part.material === "glazing") {
      assert.ok(!part.light, `${part.id}: остекление несёт источник`);
    }
  }
});

test("маяк: свес крыши перекрывает остекление, леер стоит на диске", () => {
  assert.ok(ROOF_BASE_RADIUS > GLAZING_RADIUS + 0.1,
    "свес крыши не перекрывает кольцо остекления");
  assert.ok(RAIL_RADIUS < DECK_RADIUS - 0.05,
    "стойки леера свисают с кромки диска галереи");
});

test("маяк: колба видна сквозь чистую панель (луч на юг свободен)", () => {
  // Горизонтальный луч из центра колбы к +Z на высоте BULB не должен
  // встречать непрозрачных деталей до стекла: проверяем, что ни одна
  // непрозрачная деталь фонаря не накрывает (x≈0, y≈5.6, z в 0.2..0.9).
  for (const part of kallurLighthouseParts) {
    if (part.group !== "lighthouse-lantern") continue;
    if (part.kind === "beam") {
      // A diagonal's AABB spans the whole bay; measure the member itself:
      // where the axis crosses the lamp height, how far is it from x = 0?
      const [fromY, toY] = [part.from[1], part.to[1]];
      if (Math.min(fromY, toY) > 5.65 || Math.max(fromY, toY) < 5.55) continue;
      const t = (5.6 - fromY) / (toY - fromY || 1e-9);
      const clamped = Math.max(0, Math.min(1, t));
      const x = part.from[0] + (part.to[0] - part.from[0]) * clamped;
      const z = part.from[2] + (part.to[2] - part.from[2]) * clamped;
      if (z < 0.2) continue;
      assert.ok(
        Math.abs(x) > 0.05 + part.width / 2,
        `${part.id} пересекает южный луч колбы на высоте лампы (x=${x.toFixed(3)})`,
      );
      continue;
    }
    const bounds = partBounds(part);
    const coversX = bounds.min[0] < 0.05 && bounds.max[0] > -0.05;
    const coversY = bounds.min[1] < 5.65 && bounds.max[1] > 5.55;
    const coversZ = bounds.min[2] < 0.9 && bounds.max[2] > 0.2;
    assert.ok(
      !(coversX && coversY && coversZ),
      `${part.id} заслоняет колбу с юга на высоте лампы`,
    );
  }
});

test("маяк: обязательные виды и ночной канон присутствуют", () => {
  const ids = new Set(kallurLighthouseObject.views.map((view) => view.id));
  for (const required of [
    "front", "profile", "three-quarter", "high-three-quarter",
    "lantern-detail", "lantern-cutaway", "night-close",
  ]) {
    assert.ok(ids.has(required), `нет вида ${required}`);
  }
  const cutaway = kallurLighthouseObject.views.find((view) => view.id === "lantern-cutaway");
  const paired = kallurLighthouseObject.views.find((view) => view.id === "lantern-detail");
  assert.deepEqual(cutaway.position, paired.position, "cutaway не спарен камерой");
  assert.deepEqual(cutaway.target, paired.target);
});
