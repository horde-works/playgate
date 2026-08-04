import assert from "node:assert/strict";
import test from "node:test";
import {
  SHRUB_PASSPORTS,
  propShrub,
  shrubExtent,
  shrubTone,
} from "../games/make-a-mess/src/content/prefabs/coreShrubs.ts";
import { openHouseScene } from "../games/make-a-mess/src/game/destructionScene.ts";
import { vikingVillageScene } from "../games/make-a-mess/src/game/vikingVillageScene.ts";
import { astanaScene } from "../games/make-a-mess/src/game/astanaScene.ts";
import { basaltStrongholdScene } from "../games/make-a-mess/src/game/basaltStrongholdScene.ts";

const KINDS = Object.keys(SHRUB_PASSPORTS);
const SEEDS = [3, 17, 42, 101, 777];

// Куст — это ВИД, а не зелёный ком. Виды обязаны отличаться силуэтом: высотой
// и отношением ширины к высоте, а не только оттенком.
test("every shrub species has a silhouette of its own", () => {
  const shapes = new Map();
  for (const kind of KINDS) {
    const passport = SHRUB_PASSPORTS[kind];
    assert.ok(passport.species.length > 8, `${kind}: паспорт без вида`);
    assert.ok(
      passport.height[0] > 0 && passport.height[0] < passport.height[1],
      `${kind}: высота задана неверно`,
    );
    assert.ok(passport.palette.length >= 3, `${kind}: палитра беднее трёх тонов`);
    const [width, height] = shrubExtent(kind, 17);
    shapes.set(kind, [width / height, height]);
  }
  // Ни один вид не повторяет другой по паре «приземистость — высота».
  const seen = [];
  for (const [kind, [ratio, height]] of shapes) {
    for (const [other, [otherRatio, otherHeight]] of seen) {
      const close =
        Math.abs(ratio - otherRatio) < 0.12 &&
        Math.abs(height - otherHeight) < 0.35;
      assert.ok(!close, `${kind} и ${other} — один и тот же куст`);
    }
    seen.push([kind, [ratio, height]]);
  }
  // Верещатник стелется, заросль тянется вверх — крайние случаи разнесены.
  assert.ok(shapes.get("heath")[0] > 3, "верещатник не стелется");
  assert.ok(shapes.get("thicket")[0] < 1.2, "заросль не тянется вверх");
  assert.ok(shapes.get("thicket")[1] > shapes.get("heath")[1] * 4);
});

test("a shrub body stays a single cheap proxy", () => {
  for (const kind of KINDS) {
    for (const seed of SEEDS) {
      const piece = propShrub(kind, { seed });
      assert.equal(piece.material, "foliage");
      assert.equal(piece.vegetationVisual.kind, kind);
      assert.equal(piece.bearsLoad, false);
      const [width, height] = shrubExtent(kind, seed);
      assert.ok(Math.abs(piece.size[1] - height) < 1e-6, `${kind}: высота разошлась`);
      assert.ok(Math.abs(piece.size[0] - width) < 1e-6, `${kind}: ширина разошлась`);
      assert.ok(piece.position[1] > 0, `${kind}: куст утоплен в землю`);
    }
  }
});

test("species tone comes from its own palette", () => {
  for (const kind of KINDS) {
    const passport = SHRUB_PASSPORTS[kind];
    const tones = new Set(SEEDS.map((seed) => shrubTone(kind, seed)));
    for (const tone of tones) {
      assert.ok(
        passport.palette.includes(tone) || tone === passport.accent,
        `${kind}: тон ${tone} не из палитры вида`,
      );
    }
    assert.ok(tones.size >= 2, `${kind}: все кусты вида одного тона`);
  }
});

// Среда узнаётся по подлеску: у фьорда — можжевельник, вереск и осока, в степной
// полосе — карагана, у города — заросль и ежевика по опушке, на базальте — мат.
test("each world grows the undergrowth of its own environment", () => {
  const kindsOf = (scene) => {
    const kinds = new Set();
    for (const piece of scene.breakablePieces) {
      if (piece.vegetationVisual) {
        kinds.add(piece.vegetationVisual.kind);
      }
    }
    return kinds;
  };
  const viking = kindsOf(vikingVillageScene);
  assert.ok(viking.has("needle"), "у фьорда нет можжевельника");
  assert.ok(viking.has("heath"), "у фьорда нет вереска");
  assert.ok(viking.has("sedge"), "у фьорда нет осоки");
  assert.ok(!viking.has("steppe"), "во фьорде выросла степная карагана");

  const astana = kindsOf(astanaScene);
  assert.ok(astana.has("steppe"), "в степной полосе нет караганы");

  const town = kindsOf(openHouseScene);
  assert.ok(town.has("thicket"), "на опушке города нет заросли");
  assert.ok(town.has("cane"), "на опушке города нет ежевики");
  assert.ok(!town.has("needle"), "во дворе города вырос можжевельник");

  assert.ok(kindsOf(basaltStrongholdScene).has("heath"), "на базальте нет мата");
});
