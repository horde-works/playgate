import assert from "node:assert/strict";
import test from "node:test";
import { buildIntactInstanceBatches } from "../games/make-a-mess/src/game/intactWorldBatching.ts";
import { buildTreeVisuals } from "../games/make-a-mess/src/game/treeVisualInstances.ts";
import { townScene } from "../games/make-a-mess/src/game/townScene.ts";
import { combatHexacopterRangeScene } from "../games/make-a-mess/src/game/combatHexacopterRangeScene.ts";
import { dutchPolderScene } from "../games/make-a-mess/src/game/dutchPolderScene.ts";
import { vikingVillageScene } from "../games/make-a-mess/src/game/vikingVillageScene.ts";
import { basaltStrongholdScene } from "../games/make-a-mess/src/game/basaltStrongholdScene.ts";
import { grandTerminalScene } from "../games/make-a-mess/src/game/grandTerminalScene.ts";
import { astanaScene } from "../games/make-a-mess/src/game/astanaScene.ts";

// Паспорт стоимости мира. Ядро отрисовки одно на все миры, поэтому кадр
// дорожает не правкой рендерера, а ростом контента: куски, батчи, листва,
// источники света. Регрессия 30 → 5-7 FPS (август 2026) прошла незамеченной
// именно потому, что этих потолков не было — стоимость росла молча.
//
// Закон: потолок — это ЗАФИКСИРОВАННОЕ РЕШЕНИЕ, а не прогноз. Уменьшение
// числа — прогресс, двигать потолок вниз можно без вопросов. Превышение —
// осознанный размен: поднимая потолок, назовите в коммите, чем платите
// (какой мир, сколько мс на Iris Xe — машине-полу проекта, см.
// games/make-a-mess/docs/performance-lessons.md §1).
//
// Числа сняты с HEAD d42c209 (2026-08-06) и округлены вверх на ~3-5%.
// Живой замер кадра тем же ключом — scripts/perf-probe.mjs.

const PASSPORTS = [
  {
    // Вертипад HX-6 переехал на полигон Tonkawa (фишка №1, 07.08.2026) —
    // город подешевел на 656 кусков и 112 батчей, потолки опущены следом.
    scene: townScene,
    limits: {
      pieces: 23500,
      intactBatches: 200,
      shadowBatches: 175,
      singleInstanceBatches: 130,
      foliage: 10800,
      conifer: 1450,
      lamps: 56,
      spotLights: 5,
    },
  },
  {
    // Полигон Tonkawa: RAX-8, переехавший вертипад HX-6 и — с 09.08.2026 —
    // VX-8 «Yaqui» на своём паде. Кусков мало, но батчей много: кастомные
    // меши машин — одиночные батчи; на пустом стальном диске это осознанная
    // цена наблюдательного мира.
    //
    // РАЗМЕН VX-8, НАЗВАННЫЙ ЧИСЛАМИ. Машина — 715 кусков, и почти каждый
    // кусок собственный меш, поэтому дороже всего не куски (1450 → 2125,
    // +675 с падом), а батчи: 445 → 896, из них одиночных 320 → 727. Это
    // удвоение вызовов отрисовки на пустом мире. Платим сознательно и ровно
    // здесь: полигон — наблюдательный стенд, а не игровая карта, foliage у
    // него нулевая, и запас кадра уходит именно в разглядывание машины.
    // Появится вторая такая машина на этом же диске — потолок не поднимать,
    // а объединять меши: следующий +450 батчей стенд уже не выдержит.
    scene: combatHexacopterRangeScene,
    limits: {
      pieces: 2210,
      intactBatches: 935,
      shadowBatches: 865,
      singleInstanceBatches: 760,
      foliage: 0,
      conifer: 0,
      lamps: 20,
      spotLights: 2,
    },
  },
  {
    scene: dutchPolderScene,
    limits: {
      pieces: 11600,
      intactBatches: 140,
      shadowBatches: 134,
      singleInstanceBatches: 100,
      foliage: 6400,
      conifer: 0,
      lamps: 24,
      spotLights: 0,
    },
  },
  {
    scene: vikingVillageScene,
    limits: {
      pieces: 11300,
      intactBatches: 20,
      shadowBatches: 14,
      singleInstanceBatches: 4,
      foliage: 1700,
      conifer: 2000,
      lamps: 78,
      spotLights: 0,
    },
  },
  {
    scene: basaltStrongholdScene,
    limits: {
      pieces: 11500,
      intactBatches: 36,
      shadowBatches: 25,
      singleInstanceBatches: 11,
      foliage: 1900,
      conifer: 1150,
      lamps: 37,
      spotLights: 0,
    },
  },
  {
    scene: grandTerminalScene,
    limits: {
      pieces: 11200,
      intactBatches: 30,
      shadowBatches: 13,
      singleInstanceBatches: 6,
      foliage: 1550,
      conifer: 160,
      lamps: 89,
      spotLights: 2,
    },
  },
  {
    scene: astanaScene,
    limits: {
      pieces: 31900,
      intactBatches: 118,
      shadowBatches: 90,
      singleInstanceBatches: 60,
      foliage: 4200,
      conifer: 3400,
      lamps: 168,
      spotLights: 3,
    },
  },
];

for (const { scene, limits } of PASSPORTS) {
  test(`паспорт стоимости мира: ${scene.id}`, () => {
    const batches = buildIntactInstanceBatches(scene.breakablePieces);
    const trees = buildTreeVisuals(scene.breakablePieces);
    const actual = {
      pieces: scene.breakablePieces.length,
      intactBatches: batches.length,
      shadowBatches: batches.filter((batch) => batch.castShadow).length,
      singleInstanceBatches: batches.filter((batch) => batch.pieces.length === 1)
        .length,
      foliage: trees.foliage.length,
      conifer: trees.conifer.length,
      lamps: scene.lampDefinitions.length,
      spotLights: scene.spotLightDefinitions.length,
    };
    // Скомпилированный мир обязан быть непустым: нулевые счётчики — это не
    // «дёшево», это сломанная компиляция сцены, которую потолки не поймают.
    assert.equal(
      actual.pieces > 1000,
      true,
      `${scene.id}: подозрительно пустой мир (${actual.pieces} кусков)`,
    );
    for (const [metric, limit] of Object.entries(limits)) {
      assert.equal(
        actual[metric] <= limit,
        true,
        `${scene.id}: ${metric} = ${actual[metric]} превысил паспорт ${limit}. ` +
          `Рост стоимости мира — осознанный размен: назовите его в коммите ` +
          `и поднимите потолок здесь же.`,
      );
    }
  });
}
