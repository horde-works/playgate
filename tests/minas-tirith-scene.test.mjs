import assert from "node:assert/strict";
import test from "node:test";
import {
  minasTirithMaterials,
  minasTirithScene,
} from "../games/make-a-mess/src/game/minasTirithScene.ts";

test("the Minas Tirith scene starts as one physically supported world", () => {
  const unsupported = minasTirithScene.resolveStructuralCollapse(new Set());

  assert.equal(minasTirithScene.breakablePieces.length > 3000, true);
  assert.equal(unsupported.size, 0);
});

test("the fortress uses every new material as a real breakable material", () => {
  const usedMaterials = new Set(
    minasTirithScene.breakablePieces.map((piece) => piece.material),
  );

  for (const material of minasTirithMaterials) {
    assert.equal(usedMaterials.has(material), true, material);
  }
});

test("the dark tower is multi-storeyed and loses upper structure with its base", () => {
  const towerPieces = minasTirithScene.breakablePieces.filter(
    (piece) => piece.clusterId === "minas:dark-tower",
  );
  const floors = new Set(
    towerPieces
      .map((piece) => /:floor:(\d+):/.exec(piece.id)?.[1])
      .filter(Boolean),
  );
  const removedBase = new Set(
    towerPieces
      .filter((piece) => piece.position[1] < 1.25)
      .map((piece) => piece.id),
  );
  const collapsed = minasTirithScene.resolveStructuralCollapse(removedBase);

  assert.equal(floors.size, 8);
  assert.equal(collapsed.size > removedBase.size + 500, true);
  assert.equal(
    [...collapsed].some((id) => id.startsWith("minas:dark-tower:eye:")),
    true,
  );
});
