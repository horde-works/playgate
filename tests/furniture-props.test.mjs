import assert from "node:assert/strict";
import test from "node:test";
import { placeProp } from "../games/make-a-mess/src/content/prefabs/coreProps.ts";
import { createStructuralSolver } from "../games/make-a-mess/src/game/structuralPhysics.ts";
import { structuralMaterialProfiles } from "../games/make-a-mess/src/game/destructionScene.ts";
import {
  propChannelArmchair,
  propChannelSofa,
  propChesterfield,
  propCornerSofa,
  propIronBed,
  propOldTable,
  propPaintedTable,
  propPanelChair,
  propSlatBed,
  propSlatChair,
  propSovietSofa,
  propStoneTable,
  propTrestleTable,
  propWallUnit,
  propWornChair,
  propWriterDesk,
} from "../games/make-a-mess/src/content/prefabs/coreFurniture.ts";
import {
  propFridgeMoskva,
  propFridgeRibbed,
  propFridgeRusty,
  propGasStove,
  propKettle,
  propStewPot,
  propTvSharp,
  propTvSoviet,
  propVintageStove,
} from "../games/make-a-mess/src/content/prefabs/coreAppliances.ts";
import {
  collectFurnitureInstances,
  furniturePlacementProfiles,
} from "../games/make-a-mess/src/content/furniturePlacement.ts";

// Каждый предмет каталога обязан стоять на земле сам по себе — прямой и
// повёрнутый: конструктивные цепочки (ножки -> царги -> столешница -> шпон)
// не имеют права зависеть от соседей или удачного азимута.
const builders = {
  "old-table": propOldTable,
  "writer-desk": propWriterDesk,
  "stone-table": propStoneTable,
  "trestle-table": propTrestleTable,
  "slat-chair": propSlatChair,
  "worn-chair": propWornChair,
  "panel-chair": propPanelChair,
  "iron-bed": propIronBed,
  "slat-bed": propSlatBed,
  "painted-table": propPaintedTable,
  "soviet-sofa": propSovietSofa,
  "chesterfield": propChesterfield,
  "channel-sofa": propChannelSofa,
  "channel-armchair": propChannelArmchair,
  "corner-sofa": propCornerSofa,
  "wall-unit": propWallUnit,
  "vintage-stove": propVintageStove,
  "gas-stove": propGasStove,
  "fridge-moskva": propFridgeMoskva,
  "fridge-ribbed": propFridgeRibbed,
  "fridge-rusty": propFridgeRusty,
  "tv-soviet": propTvSoviet,
  "tv-sharp": propTvSharp,
  "kettle": propKettle,
  "stew-pot": propStewPot,
};

const ground = {
  id: "ground",
  clusterId: "ground",
  material: "earth",
  shape: "groundTile",
  position: [0, -0.05, 0],
  size: [12, 0.1, 12],
  color: "#777",
};

function fallenPieces(kind, options) {
  const pieces = placeProp(`furn:${kind}:probe`, builders[kind](options), [0, 0, 0])
    .map((piece) => ({ ...piece, clusterId: "probe" }));
  const solver = createStructuralSolver(
    [ground, ...pieces],
    structuralMaterialProfiles,
  );
  return [...solver.resolve(new Set())];
}

for (const kind of Object.keys(builders)) {
  test(`furniture prop "${kind}" stands on open ground`, () => {
    assert.deepEqual(fallenPieces(kind, {}), []);
  });

  test(`furniture prop "${kind}" stands when rotated`, () => {
    assert.deepEqual(fallenPieces(kind, { yaw: Math.PI / 2 }), []);
    assert.deepEqual(fallenPieces(kind, { yaw: 0.35 }), []);
  });

  test(`furniture prop "${kind}" carries a placement profile`, () => {
    assert.equal(
      furniturePlacementProfiles[kind] !== undefined,
      true,
      `add "${kind}" to furniturePlacementProfiles`,
    );
  });
}

test("prop ids resolve to instances with the declared kind", () => {
  const pieces = placeProp(
    "furn:gas-stove:kitchen",
    builders["gas-stove"]({}),
    [3, 0, 4],
  ).map((piece) => ({ ...piece, clusterId: "probe" }));
  const instances = collectFurnitureInstances(pieces);
  assert.equal(instances.length, 1);
  assert.equal(instances[0].kind, "gas-stove");
});
