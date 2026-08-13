import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSettlementNetwork,
  createVillagerPopulation,
  stepVillagers,
} from "../games/make-a-mess/src/game/villagerSim.ts";
import { settlementRoles } from "../games/make-a-mess/src/game/settlementPlan.ts";
import { vikingSettlement } from "../games/make-a-mess/src/content/scenes/vikingSettlement.ts";
import { townSettlement } from "../games/make-a-mess/src/content/scenes/townSettlement.ts";
import {
  firstIslandCityHumanProfile,
  villageHumanProfile,
} from "../games/make-a-mess/src/content/populations/humanPopulationProfiles.ts";
import {
  buildObstacleField,
  distanceToBox,
} from "../games/make-a-mess/src/game/villagerNavigation.ts";
import { townScene } from "../games/make-a-mess/src/game/townScene.ts";
import { vikingVillageScene } from "../games/make-a-mess/src/game/vikingVillageScene.ts";

// Смысл этих проверок: симуляция больше не знает про викингов. Один и тот же
// код обслуживает два разных поселения — деревню и город, — и если интерфейс
// подогнан под одну карту, вторая на нём не поедет.

const SETTLEMENTS = [
  { plan: vikingSettlement, profile: villageHumanProfile, scene: vikingVillageScene, label: "деревня" },
  { plan: townSettlement, profile: firstIslandCityHumanProfile, scene: townScene, label: "город" },
];

for (const { plan, profile, scene, label } of SETTLEMENTS) {
  test(`${label}: описание поселения ссылается только на то, что в нём есть`, () => {
    assert.equal(plan.routes.length > 10, true, `троп ${plan.routes.length}`);
    assert.equal(plan.dwellings.length > 0, true, "жилья нет вовсе");

    for (const route of plan.routes) {
      assert.equal(route.points.length >= 2, true, `${route.id}: тропа из одной точки`);
      assert.equal(route.wear > 0 && route.wear <= 1, true, `${route.id}: износ вне 0..1`);
    }

    const areaIds = new Set(plan.areas.map((area) => area.id));
    for (const [areaId, interest] of Object.entries(plan.interest)) {
      assert.equal(areaIds.has(areaId), true, `${areaId}: притяжение к несуществующему пятну`);
      assert.equal(interest.pull > 0, true, `${areaId}: неположительный вес`);
    }

    // Роли ролями, но каждая должна быть где-то объявлена: либо за дверью
    // живёт, либо её зовёт место. Иначе роль — опечатка.
    const declared = new Set(settlementRoles(plan));
    for (const [role, haunts] of Object.entries(plan.haunts)) {
      assert.equal(declared.has(role), true, `${role}: место зовёт роль, которой нет в поселении`);
      for (const areaId of haunts) {
        assert.equal(areaIds.has(areaId), true, `${role} тянется к несуществующему ${areaId}`);
      }
    }
  });

  test(`${label}: сеть строится, и у каждого жилья есть свой узел`, () => {
    const network = buildSettlementNetwork(plan);
    assert.equal(network.nodes.length > 20, true, `узлов ${network.nodes.length}`);
    assert.equal(network.edges.length > 20, true, `рёбер ${network.edges.length}`);

    const lost = plan.dwellings
      .filter((dwelling) => !network.nodes.some((node) => node.homeId === dwelling.id))
      .map((dwelling) => dwelling.id);
    assert.deepEqual(lost, [], "дверь без узла: до неё нельзя дойти по графу");

    // Ни один узел не должен остаться без рёбер — иначе поселённый на нём
    // человек топчется на месте всю жизнь.
    const orphans = network.nodes.filter((node) => network.adjacency[node.index].length === 0);
    assert.deepEqual(orphans.map((node) => [node.x, node.z]), [], "узел без рёбер");
  });

  test(`${label}: население живёт по своему поселению, а не по чужому`, () => {
    const field = buildObstacleField(scene.breakablePieces);
    const population = createVillagerPopulation(profile, 24, field);

    assert.equal(population.settlement, plan, "население забыло своё поселение");
    assert.equal(population.profile, profile, "население забыло человеческий профиль");
    assert.equal(population.villagers.length, 24);

    const declared = new Set(settlementRoles(plan));
    const dwellingIds = new Set(plan.dwellings.map((dwelling) => dwelling.id));
    for (const villager of population.villagers) {
      assert.equal(declared.has(villager.role), true, `${villager.role}: роль не из этого поселения`);
      assert.equal(dwellingIds.has(villager.homeId), true, `${villager.homeId}: жильё не из этого поселения`);
      assert.equal(
        profile.appearance.wardrobe.dyes.some(
          (dye) => dye[0] === villager.dye[0] && dye[1] === villager.dye[1] && dye[2] === villager.dye[2],
        ),
        true,
        "одежда не из гардероба этого поселения",
      );
    }

    // Брошенное жильё не населяют: там некому жить, туда только заглядывают.
    const empty = new Set(
      plan.dwellings.filter((dwelling) => dwelling.residents === 0).map((dwelling) => dwelling.id),
    );
    for (const villager of population.villagers) {
      assert.equal(empty.has(villager.homeId), false, `${villager.homeId}: заселён брошенный дом`);
    }
  });

  test(`${label}: за полминуты жизни никто не оказывается в стене`, () => {
    const field = buildObstacleField(scene.breakablePieces);
    const population = createVillagerPopulation(profile, 20, field);

    let samples = 0;
    let inside = 0;
    for (let tick = 0; tick < 900; tick += 1) {
      // Полдня за прогон: и день, и вечер, чтобы сработали оба ритма.
      stepVillagers(population, 1 / 30, tick / 900);
      if (tick % 30 !== 0) continue;
      for (const villager of population.villagers) {
        if (!villager.visible) continue;
        samples += 1;
        for (const box of population.field.query(villager.x, villager.z, 0.9)) {
          if (population.seeThrough.has(box.id) || box.top <= 0.46) continue;
          if (distanceToBox(box, villager.x, villager.z) <= 0) {
            inside += 1;
            break;
          }
        }
      }
    }
    assert.equal(samples > 200, true, `замеров ${samples}`);
    const share = inside / samples;
    // Тот же бюджет, что у деревни: не идеал, но и не «ходят сквозь дома».
    assert.equal(share < 0.02, true, `внутри твёрдого ${(share * 100).toFixed(2)}% замеров`);
  });
}
