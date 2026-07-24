import assert from "node:assert/strict";
import test from "node:test";
import { openHouseScene } from "../games/make-a-mess/src/game/destructionScene.ts";
import { minasTirithScene } from "../games/make-a-mess/src/game/minasTirithScene.ts";
import { rainSeamScene } from "../games/make-a-mess/src/game/rainSeamScene.ts";
import { vikingVillageScene } from "../games/make-a-mess/src/game/vikingVillageScene.ts";
import {
  isProceduralFoliagePiece,
  isProceduralVegetationPiece,
} from "../games/make-a-mess/src/game/treeVisualModel.ts";

function scenePieces(scene) {
  return scene.breakablePieces;
}

function assertProceduralCoverage(scene, minimum) {
  const pieces = scenePieces(scene);
  const procedural = pieces.filter(isProceduralVegetationPiece);
  assert.ok(
    procedural.length >= minimum,
    `${scene.id}: expected at least ${minimum} procedural vegetation proxies, got ${procedural.length}`,
  );
  for (const piece of procedural) {
    if (piece.treeVisual?.role === "foliage" || piece.vegetationVisual) {
      assert.equal(
        isProceduralFoliagePiece(piece),
        true,
        `${scene.id} ${piece.id}: foliage must use porous intact and detached geometry`,
      );
    }
  }
}

test("procedural vegetation is present on every map that authors trees or shrubs", () => {
  assertProceduralCoverage(openHouseScene, 35);
  assertProceduralCoverage(rainSeamScene, 12);
  assertProceduralCoverage(vikingVillageScene, 80);
  assertProceduralCoverage(minasTirithScene, 180);
});

test("all authored conifer forests use the shared pine visual contract", () => {
  for (const scene of [openHouseScene, vikingVillageScene, minasTirithScene]) {
    const pines = scenePieces(scene).filter(
      (piece) => piece.treeVisual?.kind === "pine",
    );
    assert.ok(pines.length > 0, `${scene.id}: expected procedural pines`);
    assert.ok(
      pines.some((piece) => piece.treeVisual?.role === "trunk"),
      `${scene.id}: pine forest has no trunks`,
    );
    assert.ok(
      pines.some((piece) => piece.treeVisual?.role === "foliage"),
      `${scene.id}: pine forest has no foliage tiers`,
    );
  }
});

test("shrub and hedge proxies are explicitly tagged instead of inferred from green color", () => {
  const rainShrubs = scenePieces(rainSeamScene).filter(
    (piece) => piece.vegetationVisual?.kind === "hedge",
  );
  const minasShrubs = scenePieces(minasTirithScene).filter(
    (piece) => piece.vegetationVisual?.kind === "shrub",
  );
  const townShrubs = scenePieces(openHouseScene).filter(
    (piece) => piece.vegetationVisual?.kind === "shrub",
  );
  assert.ok(rainShrubs.length >= 6);
  assert.ok(minasShrubs.length >= 80);
  assert.ok(townShrubs.length >= 5);
});
