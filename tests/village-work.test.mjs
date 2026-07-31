import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSettlementNetwork,
  createVillagerPopulation,
  stepVillagers,
  storePieceVisibility,
} from "../games/make-a-mess/src/game/villagerSim.ts";
import { vikingSettlement } from "../games/make-a-mess/src/content/scenes/vikingSettlement.ts";
import { buildObstacleField } from "../games/make-a-mess/src/game/villagerNavigation.ts";
import { vikingVillageScene } from "../games/make-a-mess/src/game/vikingVillageScene.ts";

const field = buildObstacleField(vikingVillageScene.breakablePieces);

/** Прогон рабочего дня: шаг крупнее кадра, людей меньше — но правила те же. */
function workday(minutes, count = 16) {
  const population = createVillagerPopulation(vikingSettlement, count, field);
  for (let tick = 0; tick < minutes * 60 * 20; tick += 1) {
    stepVillagers(population, 1 / 20, 0);
  }
  return population;
}

test("у каждого склада есть узел, до которого можно дойти", () => {
  const network = buildSettlementNetwork(vikingSettlement);
  for (const store of vikingSettlement.stores ?? []) {
    let best = Infinity;
    for (const node of network.nodes) {
      best = Math.min(best, Math.hypot(node.x - store.at[0], node.z - store.at[1]));
    }
    // Дальше 3.6 м человек до склада не дотянется: работа окажется
    // недостижимой молча — уровни просто перестанут меняться.
    assert.equal(best < 3.6, true, `${store.id}: ближайший узел в ${best.toFixed(2)} м`);
  }
});

test("площадка с объявленным притяжением имеет узел — иначе вес мёртвый", () => {
  const network = buildSettlementNetwork(vikingSettlement);
  const withNode = new Set(network.nodes.map((node) => node.areaId).filter(Boolean));
  const dead = [];
  for (const areaId of Object.keys(vikingSettlement.interest)) {
    // Пороги и внутренности домов подписаны домом, а не площадкой: у них свой
    // узел с homeId, и это нормально.
    if (areaId.endsWith("-threshold") || areaId.endsWith("-inside")) {
      continue;
    }
    if (!withNode.has(areaId)) {
      dead.push(areaId);
    }
  }
  assert.deepEqual(dead, [], `мёртвое притяжение: ${dead.join(", ")}`);
});

test("полено доходит из леса до общинного очага", () => {
  const population = workday(12);
  const delivered = population.delivered;
  for (const flow of vikingSettlement.flows ?? []) {
    assert.equal(
      (delivered.get(flow.id) ?? 0) > 0,
      true,
      `по потоку ${flow.id} за смену не доставлено ничего`,
    );
  }
  // Очаг не должен погаснуть: спрос на дрова и есть двигатель всей цепочки.
  const hearth = population.stores.get("commons-hearth");
  assert.equal(hearth.level > 0, true, "общинный огонь остался без дров");
});

test("учёт обещаний сходится сам, без правки каждой ветки", () => {
  const population = workday(6);
  const expected = new Map();
  for (const id of population.stores.keys()) {
    expected.set(id, { reserved: 0, incoming: 0 });
  }
  for (const villager of population.villagers) {
    if (!villager.job) {
      continue;
    }
    const flow = population.flowById.get(villager.job.flowId);
    if (villager.job.phase === "toSource" || villager.job.phase === "working") {
      expected.get(flow.from).reserved += 1;
    }
    expected.get(flow.to).incoming += flow.yield ?? 1;
  }
  for (const [id, state] of population.stores) {
    const want = expected.get(id);
    assert.equal(state.reserved, want.reserved, `${id}: обещано забрать`);
    assert.equal(state.incoming, want.incoming, `${id}: обещано принести`);
  }
});

test("уровень склада виден: полная поленница цела, пустая исчезает", () => {
  const population = createVillagerPopulation(vikingSettlement, 4, field);
  const pile = population.stores.get("weaver-wood");
  const definition = (vikingSettlement.stores ?? []).find(
    (store) => store.id === "weaver-wood",
  );

  pile.level = definition.capacity;
  const full = storePieceVisibility(population);
  assert.equal(
    definition.pieces.every((pieceId) => full.get(pieceId) === true),
    true,
    "полная поленница видна целиком",
  );

  pile.level = 0;
  const empty = storePieceVisibility(population);
  assert.equal(
    definition.pieces.every((pieceId) => empty.get(pieceId) === false),
    true,
    "пустая поленница не видна",
  );

  pile.level = definition.capacity / 2;
  const half = storePieceVisibility(population);
  const shown = definition.pieces.filter((pieceId) => half.get(pieceId)).length;
  assert.equal(
    Math.abs(shown - definition.pieces.length / 2) <= 1,
    true,
    `половина поленницы — это ${shown} из ${definition.pieces.length}`,
  );
});

test("работают в рабочей позе, и тяжёлое движение не бывает частым", () => {
  const population = createVillagerPopulation(vikingSettlement, 16, field);
  const seen = new Set();
  let chopFrames = 0;
  let chopCycles = 0;
  let previous = 0;
  for (let tick = 0; tick < 10 * 60 * 20; tick += 1) {
    stepVillagers(population, 1 / 20, 0);
    for (const villager of population.villagers) {
      if (villager.workVerb) {
        seen.add(villager.climbKind);
        assert.equal(
          villager.climbKind === 7 || villager.climbKind === 8,
          true,
          `${villager.id} работает глаголом ${villager.workVerb} в позе ${villager.climbKind}`,
        );
      }
    }
    const chopper = population.villagers.find((villager) => villager.climbKind === 7);
    if (chopper) {
      chopFrames += 1;
      if (chopper.climbProgress < previous) {
        chopCycles += 1;
      }
      previous = chopper.climbProgress;
    }
  }
  assert.equal(seen.has(7), true, "никто не рубил");
  assert.equal(seen.has(8), true, "никто ничего не укладывал");
  // Период удара: не чаще одного за 2.5 с — иначе это не работа топором.
  const seconds = chopFrames / 20;
  assert.equal(
    chopCycles === 0 || seconds / chopCycles >= 2.5,
    true,
    `цикл рубки ${(seconds / Math.max(1, chopCycles)).toFixed(2)} с`,
  );
});
