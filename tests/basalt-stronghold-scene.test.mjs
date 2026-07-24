import assert from "node:assert/strict";
import test from "node:test";
import {
  basaltStrongholdMaterials,
  basaltStrongholdScene,
} from "../games/make-a-mess/src/game/basaltStrongholdScene.ts";

test("the Basalt Stronghold scene starts as one physically supported world", () => {
  const unsupported = basaltStrongholdScene.resolveStructuralCollapse(new Set());

  assert.equal(basaltStrongholdScene.breakablePieces.length > 9000, true);
  assert.equal(unsupported.size, 0);
});

test("the fortress uses every new material as a real breakable material", () => {
  const usedMaterials = new Set(
    basaltStrongholdScene.breakablePieces.map((piece) => piece.material),
  );

  for (const material of basaltStrongholdMaterials) {
    assert.equal(usedMaterials.has(material), true, material);
  }
});

test("the original fortress now sits inside a filled circular highland", () => {
  const centerZ = basaltStrongholdScene.worldCenter[1];
  const radius = basaltStrongholdScene.worldRadius;
  const outerGrass = basaltStrongholdScene.breakablePieces.filter((piece) =>
    piece.id.startsWith("stronghold:circle:grass:"),
  );
  const occupiedSectors = new Set(
    outerGrass.map((piece) => {
      const angle = Math.atan2(piece.position[2] - centerZ, piece.position[0]);
      return Math.floor(((angle + Math.PI) / (Math.PI * 2)) * 16);
    }),
  );

  assert.equal(radius, 98);
  assert.equal(outerGrass.length >= 300, true);
  assert.equal(occupiedSectors.size, 16);
  assert.equal(
    outerGrass.every(
      (piece) =>
        Math.hypot(piece.position[0], piece.position[2] - centerZ) <= 93.01,
    ),
    true,
  );
});

test("the mountain ridges spread organically instead of ending as rectangles", () => {
  for (const side of ["west", "east"]) {
    const caps = basaltStrongholdScene.breakablePieces.filter(
      (piece) => piece.clusterId === `stronghold:ridge:${side}:caps`,
    );
    const rowWidths = new Map();

    for (const cap of caps) {
      const row = Math.round((37 - cap.position[2]) / 5);
      rowWidths.set(row, (rowWidths.get(row) ?? 0) + 1);
    }

    assert.equal(Math.max(...caps.map((piece) => Math.abs(piece.position[0]))) > 72, true);
    assert.equal(Math.max(...caps.map((piece) => piece.position[2])) > 40, true);
    assert.equal(Math.min(...caps.map((piece) => piece.position[2])) < -75, true);
    assert.equal(new Set(rowWidths.values()).size >= 5, true);
    assert.equal(
      caps.some((piece) => {
        const gridPosition = (piece.position[2] - 37) / 5;
        return Math.abs(gridPosition - Math.round(gridPosition)) > 0.02;
      }),
      true,
    );
  }
});

test("the mountain summits carry their own heath and loose rock", () => {
  for (const side of ["west", "east"]) {
    const highlandGrowth = basaltStrongholdScene.breakablePieces.filter(
      (piece) => piece.clusterId === `stronghold:ridge:${side}:heath`,
    );
    const summitHeights = highlandGrowth.map((piece) => piece.position[1]);

    assert.equal(highlandGrowth.length > 140, true);
    assert.equal(highlandGrowth.some((piece) => piece.material === "foliage"), true);
    assert.equal(highlandGrowth.some((piece) => piece.material === "basalt"), true);
    assert.equal(Math.max(...summitHeights) > 8, true);
  }
});

test("the approach has destructible weathering details instead of an empty lawn", () => {
  const rubble = basaltStrongholdScene.breakablePieces.filter((piece) =>
    piece.id.startsWith("stronghold:weather:rubble:"),
  );
  const timber = basaltStrongholdScene.breakablePieces.filter((piece) =>
    piece.id.startsWith("stronghold:weather:timber:"),
  );
  const stakes = basaltStrongholdScene.breakablePieces.filter((piece) =>
    piece.id.startsWith("stronghold:weather:stake:"),
  );

  assert.equal(rubble.length, 54);
  assert.equal(timber.length, 15);
  assert.equal(stakes.length, 12);
  assert.equal(
    [...rubble, ...timber, ...stakes].every((piece) =>
      basaltStrongholdScene.breakablePieceById.has(piece.id),
    ),
    true,
  );
});

test("the dark tower is multi-storeyed and loses upper structure with its base", () => {
  const towerPieces = basaltStrongholdScene.breakablePieces.filter(
    (piece) => piece.clusterId === "stronghold:dark-tower",
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
  const collapsed = basaltStrongholdScene.resolveStructuralCollapse(removedBase);

  assert.equal(floors.size, 8);
  assert.equal(collapsed.size > removedBase.size + 500, true);
  assert.equal(
    [...collapsed].some((id) => id.startsWith("stronghold:dark-tower:signal:")),
    true,
  );
});

test("all eight tower floors are furnished as different inhabited rooms", () => {
  const towerLife = basaltStrongholdScene.breakablePieces.filter(
    (piece) => piece.clusterId === "stronghold:tower-life",
  );
  const roomSignatures = [
    "guard-",
    "store-",
    "barracks-",
    "workshop-",
    "archive-",
    "council-",
    "ritual-",
    "signal-",
  ];

  assert.equal(towerLife.length > 450, true);
  for (const signature of roomSignatures) {
    assert.equal(
      towerLife.some((piece) => piece.id.includes(signature)),
      true,
      signature,
    );
  }
});

test("the fortress has distinct working zones inside and outside the wall", () => {
  const zoneMinimums = new Map([
    ["stronghold:wall-life", 200],
    ["stronghold:courtyard-smithy", 60],
    ["stronghold:courtyard-storehouse", 100],
    ["stronghold:courtyard-commons", 45],
    ["stronghold:siege-workshop", 60],
    ["stronghold:siege-supplies", 100],
    ["stronghold:siege-engines", 45],
    ["stronghold:occupation-traces", 55],
    // Pine crowns are rendered as shared instanced sprays; the authored pieces
    // stay deliberately sparse and exist only as destruction proxies.
    ["stronghold:living-forest", 144],
    ["stronghold:undergrowth", 80],
    ["stronghold:mountain-scree", 150],
  ]);

  for (const [clusterId, minimum] of zoneMinimums) {
    const cluster = basaltStrongholdScene.breakableClusterById.get(clusterId);
    assert.ok(cluster, clusterId);
    assert.equal(cluster.pieces.length >= minimum, true, clusterId);
  }

  assert.equal(basaltStrongholdScene.lampDefinitions.length >= 18, true);
});

test("the gate towers are hollow rooms with stairs rather than solid blocks", () => {
  const gatehouse = basaltStrongholdScene.breakableClusterById.get("stronghold:gatehouse");
  const wallLife = basaltStrongholdScene.breakableClusterById.get("stronghold:wall-life");

  assert.ok(gatehouse);
  assert.ok(wallLife);
  assert.equal(
    gatehouse.pieces.some((piece) => piece.id.includes(":floor:3:side:")),
    true,
  );
  assert.equal(
    gatehouse.pieces.some((piece) => piece.id.includes(":upper-pier:")),
    true,
  );
  assert.equal(
    wallLife.pieces.filter((piece) => piece.id.includes(":gate-stair:")).length >= 50,
    true,
  );
});
