import assert from "node:assert/strict";
import test from "node:test";
import { buildIntactInstanceBatches, buildIntactMaterialBatches } from "../games/make-a-mess/src/game/intactWorldBatching.ts";
import { buildTreeVisuals } from "../games/make-a-mess/src/game/treeVisualInstances.ts";
import { townScene } from "../games/make-a-mess/src/game/townScene.ts";
import { combatHexacopterRangeScene } from "../games/make-a-mess/src/game/combatHexacopterRangeScene.ts";
import { dutchPolderScene } from "../games/make-a-mess/src/game/dutchPolderScene.ts";
import { vikingVillageScene } from "../games/make-a-mess/src/game/vikingVillageScene.ts";
import { basaltStrongholdScene } from "../games/make-a-mess/src/game/basaltStrongholdScene.ts";
import { grandTerminalScene } from "../games/make-a-mess/src/game/grandTerminalScene.ts";
import { astanaScene } from "../games/make-a-mess/src/game/astanaScene.ts";
import { islandAirportScene } from "../games/make-a-mess/src/game/islandAirportScene.ts";

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
//
// materialBatches — фактические вызовы интактного мира после BatchedMesh
// (ключ = программа материала, не хэш visualMesh). intactBatches остаётся
// паспорт контента: сколько уникальных геометрий автор завёл.

const PASSPORTS = [
  {
    // Вертипад HX-6 переехал на полигон Tonkawa (фишка №1, 07.08.2026) —
    // город подешевел на 656 кусков и 112 батчей, потолки опущены следом.
    scene: townScene,
    limits: {
      pieces: 23500,
      intactBatches: 200,
      materialBatches: 48,
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
    // удвоение вызовов отрисовки на пустом мире, ПОКА ключ включает хэш
    // меша. BatchedMesh по материалу схлопывает те же 924 instanced-батча
    // в 15 вызовов; потолок materialBatches держит уже это.
    scene: combatHexacopterRangeScene,
    limits: {
      pieces: 2210,
      intactBatches: 935,
      materialBatches: 16,
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
      materialBatches: 20,
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
      materialBatches: 13,
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
      materialBatches: 20,
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
      materialBatches: 28,
      shadowBatches: 13,
      singleInstanceBatches: 6,
      foliage: 1550,
      conifer: 160,
      lamps: 89,
      spotLights: 2,
    },
  },
  {
    // DC-3 на полосе 09 (14.08.2026). Машина — ~60 уникальных кусков
    // алюминия и стали; почти каждый — собственный меш, поэтому дороже
    // всего не куски (2190 → 2310), а батчи: 45 → 105, из них одиночных
    // 12 → 68. Тот же класс размена, что VX-8 на полигоне: наблюдательный
    // объект на пустом мире. Вторую такую машину на этой полосе не
    // сажать без объединения мешей.
    scene: islandAirportScene,
    limits: {
      // 2400 → 2660: южный пояс острова с ВПП 08, перемычками и разметкой
      // (вердикт Igor, 15.08.2026 — рулёжная схема возврата на старт). Плата
      // — 232 куска: земля/трава пояса, бетон 08 и перемычек, краска и
      // расширенная кромка берега; света ноль — 08 без огней.
      // ОБШИВКА DC-3 ПЕРЕВЕДЕНА НА ЧЕСТНЫЕ ПАНЕЛИ (15.08.2026).
      //
      // Размен назван прямо: машина стала разрушаемой по отсекам, и это
      // стоило ВЫЗОВОВ ОТРИСОВКИ. Каждая панель — свой батч, потому что
      // ключ инстанс-батча включает геометрию, а панели после нормировки
      // по своей коробке всё равно разные: крыло сужается, кольца фюзеляжа
      // на каждой станции свои. Из 273 одиночных батчей мира 246 — это DC-3.
      //
      //   куски      2660 → 2747  (+87: шесть шпангоутов салона, панели)
      //   intact      110 → 311
      //   shadow       95 → 294
      //   одиночные    75 → 273
      //
      // Это ПОТОЛОК, а не цель. Дешевле станет, если панели начнут делить
      // геометрию: одинаковые плитки схлопываются в один вызов уже сегодня,
      // и кольца гондолы это показывают. Пока не сделано.
      // + иллюминаторы (15.08.2026): семь проёмов на борт, каждый — вырез в
      // обшивке плюс рама и стекло. Куски 2786 → 2815, батчи 308 → 353.
      // + семь иллюминаторов на борт с обвязкой и стеклом (15.08.2026):
      // куски 2786 → 2874, батчи 308 → 412. Каждый проём это четыре полосы
      // обшивки вокруг него, четыре планки рамы и стекло.
      // + перелицованные гондолы (15.08.2026): капот, губа NACA и тракт
      // панелями вместо лофтов.
      // + свет машины и шасси, разобранное на узлы (17.08.2026).
      pieces: 3010,
      intactBatches: 480,
      materialBatches: 33,
      shadowBatches: 450,
      singleInstanceBatches: 440,
      foliage: 0,
      conifer: 0,
      // 95 → 96: полоса продлена на запад под недолёт DC-3 (15.08.2026),
      // ряд боковых огней вырос на две колонны. Плата — 4 лампы в пуле
      // кромки полосы; пуловая ёмкость кромки не менялась.
      lamps: 96,
      spotLights: 2,
    },
  },
  {
    scene: astanaScene,
    limits: {
      // Четыре детальные внешние доминанты получили 32–40 м настоящего
      // городского пространства между корпусом и ЛРТ. Цена — больший
      // двухслойный грунт на полуостровах и отдельные материальные группы
      // принятых объектов; 5-метровые ячейки остаются физическими опорами.
      pieces: 37000,
      intactBatches: 160,
      materialBatches: 35,
      shadowBatches: 112,
      singleInstanceBatches: 65,
      foliage: 6000,
      conifer: 5100,
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
      materialBatches: buildIntactMaterialBatches(scene.breakablePieces).length,
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
