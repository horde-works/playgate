import assert from "node:assert/strict";
import test from "node:test";

import {
  carveVoxelBudget,
  carveWorkUnits,
  selectCarveTargetsWithinBudget,
} from "../games/make-a-mess/src/game/destructionRuntime.ts";
import {
  createSolidVoxelBody,
  DEFAULT_MAX_VOXELS,
} from "../games/make-a-mess/src/game/voxelFracture.ts";

const BRICK = { material: "brick", size: [0.4, 0.24, 0.25] };
const PANEL = { material: "concrete", size: [1.86, 0.82, 0.22] };
const GROUND_SLAB = { material: "earth", size: [6, 0.9, 6] };

const ROCKET_BUDGET = {
  maxTargets: 80,
  workBudget: 20_000,
  groundWorkBudget: 3_000,
};

test("ground carve bodies get a small voxel ceiling, walls keep the full one", () => {
  assert.equal(carveVoxelBudget("earth") < DEFAULT_MAX_VOXELS, true);
  assert.equal(carveVoxelBudget("concrete"), DEFAULT_MAX_VOXELS);

  const groundBody = createSolidVoxelBody(
    GROUND_SLAB.size,
    0.16,
    carveVoxelBudget("earth"),
  );
  const voxels =
    groundBody.dimensions[0] *
    groundBody.dimensions[1] *
    groundBody.dimensions[2];
  assert.equal(voxels <= carveVoxelBudget("earth"), true);
  // The crater still has a usable grid, not a 2x2 blob.
  assert.equal(groundBody.dimensions[0] >= 12, true);
});

test("a ground slab costs at least an order of magnitude more than a brick", () => {
  const slab = carveWorkUnits(GROUND_SLAB.material, GROUND_SLAB.size);
  const brick = carveWorkUnits(BRICK.material, BRICK.size);
  assert.equal(slab >= brick * 10, true);
});

test("normal blast selections are identical to the old slice(0, 80)", () => {
  const targets = Array.from({ length: 120 }, (_, index) => ({
    id: index,
    source: index % 3 === 0 ? PANEL : BRICK,
  }));
  const selected = selectCarveTargetsWithinBudget(
    targets,
    (target) => target.source,
    ROCKET_BUDGET,
  );
  assert.deepEqual(
    selected.map((target) => target.id),
    targets.slice(0, 80).map((target) => target.id),
  );
});

test("nearby ground slabs cannot crowd real targets out of the budget", () => {
  // A rocket landing on the yard: ground plates are the closest "targets",
  // shop pieces come after them in the distance-sorted list.
  const targets = [
    ...Array.from({ length: 9 }, (_, index) => ({
      id: `ground:${index}`,
      source: GROUND_SLAB,
    })),
    ...Array.from({ length: 60 }, (_, index) => ({
      id: `shop:${index}`,
      source: index % 2 === 0 ? PANEL : BRICK,
    })),
  ];
  const selected = selectCarveTargetsWithinBudget(
    targets,
    (target) => target.source,
    ROCKET_BUDGET,
  );

  const groundSelected = selected.filter((target) =>
    String(target.id).startsWith("ground:"),
  );
  const shopSelected = selected.filter((target) =>
    String(target.id).startsWith("shop:"),
  );

  // Craters still appear under the impact...
  assert.equal(groundSelected.length >= 1, true);
  // ...but ground stops at its own slice of the budget...
  const groundWork = groundSelected.length *
    carveWorkUnits(GROUND_SLAB.material, GROUND_SLAB.size);
  assert.equal(groundWork <= ROCKET_BUDGET.groundWorkBudget, true);
  // ...and every shop piece still gets carved.
  assert.equal(shopSelected.length, 60);
});

test("a skipped ground slab never blocks later targets", () => {
  const targets = [
    { id: "ground:0", source: GROUND_SLAB },
    { id: "ground:1", source: GROUND_SLAB },
    { id: "ground:2", source: GROUND_SLAB },
    { id: "ground:3", source: GROUND_SLAB },
    { id: "wall", source: PANEL },
  ];
  const selected = selectCarveTargetsWithinBudget(
    targets,
    (target) => target.source,
    ROCKET_BUDGET,
  );
  assert.equal(
    selected.some((target) => target.id === "wall"),
    true,
  );
});

test("the direct-hit target is always carved even when overweight", () => {
  const giant = { material: "concrete", size: [7, 3.1, 4.9] };
  const selected = selectCarveTargetsWithinBudget(
    [{ id: "giant", source: giant }],
    (target) => target.source,
    { maxTargets: 80, workBudget: 100, groundWorkBudget: 100 },
  );
  assert.equal(selected.length, 1);
});

// ---------------------------------------------------------------------------
// Польдер: земляные колонны глубиной 8.8-13 м против закона, калиброванного
// на плиту 6×0.9×6. Два дефекта августа 2026 (вердикт Igor по игре):
// воронка съедала весь план ячейки кубами по 0.8 м, а дернина проигрывала
// грунтовый срез бюджета колоннам — земля выбрана, оболочка цела.

const POLDER_EARTH = { material: "earth", size: [2.04, 8.84, 2.04] };
const POLDER_TURF = {
  material: "grass",
  size: [2.04, 0.36, 2.04],
  landscapeSurface: "dutch-polder-ground",
};

test("грунт режется жертвенным слоем: решётка колонны — авторская, не бюджетная", async () => {
  const { GROUND_CARVE_DEPTH } = await import(
    "../games/make-a-mess/src/game/destructionRuntime.ts"
  );
  // Слой конечен и мельче любой колонны польдера.
  assert.equal(GROUND_CARVE_DEPTH <= 1.5, true);

  // Тело слоя на грунтовом бюджете держит клетку у авторской (0.16), а не
  // огрубляется колонной: до слоя 2-метровая ячейка давала клетку 0.34 м.
  const layerBody = createSolidVoxelBody(
    [POLDER_EARTH.size[0], GROUND_CARVE_DEPTH, POLDER_EARTH.size[2]],
    0.16,
    carveVoxelBudget("earth"),
  );
  assert.equal(
    Math.max(...layerBody.cellSize) <= 0.2,
    true,
    `клетка слоя ${Math.max(...layerBody.cellSize)} — колонна снова огрубила решётку`,
  );

  // Цена колонны считается слоем: глубина под ним бюджет не ест.
  assert.equal(
    carveWorkUnits("earth", POLDER_EARTH.size),
    carveWorkUnits("earth", [
      POLDER_EARTH.size[0],
      GROUND_CARVE_DEPTH,
      POLDER_EARTH.size[2],
    ]),
  );
});

test("жертвенная дернина — обычная цель, а не жилец грунтового среза", () => {
  // До правки: две колонны съедали 2400 из 3000 грунтового среза, и третий
  // дерновый quad уже не влезал — вся оболочка над воронкой оставалась целой.
  const targets = [
    { source: POLDER_EARTH },
    { source: POLDER_EARTH },
    ...Array.from({ length: 7 }, () => ({ source: POLDER_TURF })),
  ];
  const selected = selectCarveTargetsWithinBudget(
    targets,
    (entry) => entry.source,
    ROCKET_BUDGET,
  );
  const turfSelected = selected.filter(
    (entry) => entry.source === POLDER_TURF,
  ).length;
  assert.equal(
    turfSelected,
    7,
    `дернина вытеснена из бюджета (${turfSelected}/7) — оболочка не откроется`,
  );
  // Массивный грунт остаётся на своём срезе и не вытесняет настоящие цели.
  assert.equal(
    selected.filter((entry) => entry.source === POLDER_EARTH).length,
    2,
  );
});

test("carve колонны оставляет цельный плинтус и не копает глубже слоя", async () => {
  const { damageBody, GROUND_CARVE_DEPTH } = await import(
    "../games/make-a-mess/src/game/destructionRuntime.ts"
  );
  const three = await import("three");
  const source = {
    id: "polder-earth-test",
    material: "earth",
    size: POLDER_EARTH.size,
    volume:
      POLDER_EARTH.size[0] * POLDER_EARTH.size[1] * POLDER_EARTH.size[2],
  };
  const state = {
    position: new three.Vector3(0, 0, 0),
    quaternion: new three.Quaternion(),
    linearVelocity: new three.Vector3(),
    angularVelocity: new three.Vector3(),
  };
  // Удар в верхнюю грань колонны — как ракета в поверхность луга.
  const result = damageBody(source, state, {
    worldPoint: new three.Vector3(0.2, POLDER_EARTH.size[1] / 2, 0.1),
    radius: 1.05,
    idPrefix: "test:polder-earth",
    burstSpeed: 6,
  });
  assert.notEqual(result, null, "carve колонны не состоялся");
  // Плинтус: цельный остаток почти всей глубины колонны.
  const plinth = result.fragments.find(
    (fragment) =>
      fragment.size[1] >= POLDER_EARTH.size[1] - GROUND_CARVE_DEPTH - 0.1,
  );
  assert.notEqual(
    plinth,
    undefined,
    "цельный плинтус под жертвенным слоем не сохранился",
  );
  // Воронка не выедает объём глубже слоя.
  assert.equal(
    result.removedVolume <= POLDER_EARTH.size[0] * POLDER_EARTH.size[2] * GROUND_CARVE_DEPTH,
    true,
    `снято ${result.removedVolume} м³ — глубже жертвенного слоя`,
  );
});
