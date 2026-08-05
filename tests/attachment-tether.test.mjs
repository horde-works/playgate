import assert from "node:assert/strict";
import test from "node:test";

import {
  hingeCapacity,
  stepTether,
} from "../games/make-a-mess/src/game/attachmentTether.ts";
import { createStructuralSolver } from "../games/make-a-mess/src/game/structuralPhysics.ts";
import { resolveRuntimeStructure } from "../games/make-a-mess/src/game/runtimeStructure.ts";

const STEP = 1 / 60;
const GRAVITY = 9.81;

const profiles = {
  stone: {
    density: 2.4,
    compressionStrength: 118,
    cantilever: 0.38,
    maximumVerticalGap: 0.2,
    carriesAttachments: true,
  },
  soil: {
    density: 1.6,
    compressionStrength: Number.POSITIVE_INFINITY,
    cantilever: Number.POSITIVE_INFINITY,
    maximumVerticalGap: 0.2,
    foundation: true,
    carriesAttachments: true,
  },
};

/**
 * Один прогон маятника в той же последовательности, в какой его считает игра:
 * солвер интегрирует тяжесть, затем связь снимает своё с уже полученной
 * скорости. Носитель едет равномерно — привязь обязана этого не замечать.
 */
function swing({ capacity, carrierSpeed = 0, frames = 600 }) {
  let pivot = [0, 10, 0];
  let position = [1, 10, 0];
  let velocity = [0, 0, carrierSpeed];
  let peakDemand = 0;
  let maximumRadius = 0;
  let releasedAt = -1;
  let crossedOver = false;

  for (let frame = 0; frame < frames; frame += 1) {
    pivot = [pivot[0], pivot[1], pivot[2] + carrierSpeed * STEP];
    position = [0, 1, 2].map((axis) => position[axis] + velocity[axis] * STEP);
    velocity = [velocity[0], velocity[1] - GRAVITY * STEP, velocity[2]];
    const step = stepTether(
      { pivot, length: 1, capacity, pivotVelocity: [0, 0, carrierSpeed] },
      { position, linearVelocity: velocity },
      1,
      STEP,
    );
    peakDemand = Math.max(peakDemand, step.demand);
    if (step.released) {
      releasedAt = frame;
      break;
    }
    velocity = step.linearVelocity;
    const offset = [0, 1, 2].map((axis) => position[axis] - pivot[axis]);
    maximumRadius = Math.max(maximumRadius, Math.hypot(...offset));
    if (offset[0] < -0.9) {
      crossedOver = true;
    }
  }

  return { peakDemand, maximumRadius, releasedAt, crossedOver };
}

test("отпущенный горизонтально кусок качается маятником, а не улетает", () => {
  const result = swing({ capacity: 6 });
  assert.equal(result.releasedAt, -1, "прочный шов не должен рваться сам");
  assert.ok(
    result.maximumRadius < 1.02,
    `связь растянулась до ${result.maximumRadius}`,
  );
  assert.ok(result.crossedOver, "кусок обязан пройти нижнюю точку и уйти дальше");
  // Учебник: у маятника, отпущенного из горизонтали, натяжение в нижней точке
  // втрое больше веса. Совпадение с ним — проверка самой модели, а не порога.
  assert.ok(
    Math.abs(result.peakDemand - 3) < 0.1,
    `пик спроса ${result.peakDemand}, ожидались три веса`,
  );
});

test("равномерный ход носителя связь не нагружает", () => {
  const still = swing({ capacity: 6 });
  const flying = swing({ capacity: 6, carrierSpeed: 12 });
  assert.equal(flying.releasedAt, -1);
  assert.ok(
    Math.abs(flying.peakDemand - still.peakDemand) < 1e-9,
    "полёт носителя изменил нагрузку на шов",
  );
});

test("шов слабее трёх весов рвётся на размахе", () => {
  const result = swing({ capacity: 1.2 });
  assert.ok(result.releasedAt >= 0, "слабый шов обязан порваться");
  assert.ok(result.peakDemand > 1.2);
});

test("спокойно висящий кусок требует ровно свой вес", () => {
  const mass = 2;
  const step = stepTether(
    { pivot: [0, 4, 0], length: 1, capacity: 10 },
    // Тяжесть уже отработала свой шаг: ровно это связь и снимает.
    { position: [0, 3, 0], linearVelocity: [0, -GRAVITY * STEP, 0] },
    mass,
    STEP,
  );
  assert.ok(Math.abs(step.demand - mass) < 1e-9, `спрос ${step.demand}`);
  assert.equal(step.released, false);
  assert.ok(Math.abs(step.linearVelocity[1]) < 1e-9, "шов обязан снять падение");
});

test("кусок, идущий К точке крепления, шов не нагружает", () => {
  const step = stepTether(
    { pivot: [0, 3, 0], length: 1, capacity: 10 },
    { position: [0, 4, 0], linearVelocity: [0, -1, 0] },
    2,
    STEP,
  );
  assert.equal(step.demand, 0);
  assert.equal(step.released, false);
});

test("рывок рвёт шов, а качание по дуге — нет", () => {
  const anchor = { pivot: [0, 4, 0], length: 1, capacity: 3 };
  const swinging = stepTether(
    anchor,
    { position: [0, 3, 0], linearVelocity: [1.2, 0, 0] },
    1,
    STEP,
  );
  assert.equal(swinging.released, false);
  assert.equal(swinging.demand, 0);

  // Тот же кусок налетел на препятствие: связь гасит рывок за один шаг.
  const jerked = stepTether(
    anchor,
    { position: [0, 3, 0], linearVelocity: [0, -1.2, 0] },
    1,
    STEP,
  );
  assert.equal(jerked.released, true);
  assert.ok(jerked.demand > anchor.capacity);
});

test("нулевая прочность шва означает свободное тело с первого шага", () => {
  const step = stepTether(
    { pivot: [0, 4, 0], length: 1, capacity: 0 },
    { position: [0, 3, 0], linearVelocity: [0, 0, 0] },
    1,
    STEP,
  );
  assert.equal(step.released, true);
});

test("прочность шва растёт с площадью уцелевшего контакта", () => {
  assert.equal(hingeCapacity(0, 118), 0);
  assert.ok(hingeCapacity(0.2, 118) > hingeCapacity(0.05, 118));
  // Шов работает на срез и держит заметно меньше, чем то же пятно на смятие.
  assert.ok(hingeCapacity(0.2, 118) < 0.2 * 118);
});

test("отказавший кусок повисает на том, кто устоял", () => {
  // Плита сползла с колонны: центр масс вышел за пятно, стоять она не может,
  // но краем колонны ещё касается — и обязана повиснуть на нём.
  const pieces = [
    {
      id: "ground",
      material: "soil",
      position: [0, -0.5, 0],
      size: [8, 1, 8],
      foundation: true,
    },
    {
      id: "column",
      material: "stone",
      position: [0, 1, 0],
      size: [0.4, 2, 0.4],
    },
    {
      id: "slab",
      material: "stone",
      position: [1.6, 2.1, 0],
      size: [3, 0.2, 1],
    },
  ];
  const solver = createStructuralSolver(pieces, profiles);
  const failed = solver.resolve(new Set());
  assert.ok(failed.has("slab"), "плита не должна стоять на этом вылете");

  const anchors = solver.residualAnchors("slab", failed);
  assert.equal(anchors.length, 1);
  assert.equal(anchors[0].supportId, "column");
  assert.ok(anchors[0].area > 0);
  // Точка повисания лежит внутри пятна колонны, а не в центре плиты.
  assert.ok(Math.abs(anchors[0].pivot[0]) <= 0.2 + 1e-9);
  assert.ok(Math.abs(anchors[0].pivot[2]) <= 0.2 + 1e-9);
});

test("кусок, чья опора рухнула вместе с ним, остаётся без привязи", () => {
  const pieces = [
    { id: "column", material: "stone", position: [0, 1, 0], size: [0.4, 2, 0.4] },
    { id: "slab", material: "stone", position: [1.6, 2.1, 0], size: [3, 0.2, 1] },
  ];
  const solver = createStructuralSolver(pieces, profiles);
  const failed = solver.resolve(new Set());
  // Без грунта не стоит никто, и держаться плите не за что.
  assert.ok(failed.has("column"));
  assert.equal(solver.residualAnchors("slab", failed).length, 0);
});

test("обрубок получает привязь через рантайм-решатель", () => {
  const pieces = [
    {
      id: "ground",
      material: "soil",
      position: [0, -0.5, 0],
      size: [8, 1, 8],
      foundation: true,
    },
    { id: "column", material: "stone", position: [0, 1, 0], size: [0.4, 2, 0.4] },
    { id: "shelf", material: "stone", position: [0, 2.1, 0], size: [3, 0.2, 1] },
  ];
  const fragments = [
    {
      id: "shelf:remnant",
      parentId: "shelf",
      material: "stone",
      // Обрубок съехал в сторону: колонна под ним осталась, край полки на неё
      // ещё опирается, а центр масс ушёл за вылет и стоять она уже не может.
      position: [0.65, 2.1, 0],
      size: [1.5, 0.2, 1],
      detached: false,
      volume: 1.5 * 0.2 * 1,
    },
  ];
  const result = resolveRuntimeStructure(
    pieces,
    profiles,
    new Set(),
    new Set(["shelf"]),
    fragments,
  );
  assert.ok(result.detachedFragmentIds.has("shelf:remnant"));
  const tether = result.tethersByPieceId.get("shelf:remnant");
  assert.ok(tether, "у отказавшего обрубка обязана быть привязь");
  assert.ok(tether.capacity > 0);
  assert.ok(tether.length > 0);
});
