import assert from "node:assert/strict";
import test from "node:test";
import {
  grandTerminalMaterials,
  grandTerminalScene,
} from "../games/make-a-mess/src/game/grandTerminalScene.ts";

test("Grand Terminal is fully supported before the player touches it", () => {
  const unsupported = grandTerminalScene.resolveStructuralCollapse(new Set());

  assert.equal(grandTerminalScene.breakablePieces.length > 5500, true);
  assert.equal(unsupported.size, 0);
});

test("Grand Terminal is one round, destructible railway museum", () => {
  const ids = grandTerminalScene.breakablePieces.map((piece) => piece.id);
  const usedMaterials = new Set(
    grandTerminalScene.breakablePieces.map((piece) => piece.material),
  );

  assert.equal(new Set(ids).size, ids.length);
  assert.equal(grandTerminalScene.worldRadius, 98);
  assert.equal(grandTerminalScene.lampDefinitions.length >= 25, true);

  for (const material of grandTerminalMaterials) {
    assert.equal(usedMaterials.has(material), true, material);
  }
});

test("the terminal has a complete station, train shed and rolling stock", () => {
  // Rolling stock uses faceted round stacks (boiler, chimney, wheels) built
  // from plain boxes, so those clusters stay lean and voxel-breakable.
  const requiredClusters = new Map([
    ["terminal:headhouse:shell", 400],
    ["terminal:interior:furniture", 40],
    ["terminal:shed:structure", 350],
    ["terminal:shed:glazing", 280],
    ["terminal:yard:tracks", 500],
    ["terminal:rolling-stock:steam-engine", 60],
    ["terminal:rolling-stock:passenger-train", 150],
    ["terminal:station-life", 500],
  ]);

  for (const [clusterId, minimum] of requiredClusters) {
    const cluster = grandTerminalScene.breakableClusterById.get(clusterId);
    assert.ok(cluster, clusterId);
    assert.equal(cluster.pieces.length >= minimum, true, clusterId);
  }
});

test("the terminal uses voxel-ready faceted rounds, hinged doors and lit fixtures", () => {
  const cylinders = grandTerminalScene.breakablePieces.filter(
    (piece) => piece.shape === "cylinder",
  );
  const facetedSlabs = grandTerminalScene.breakablePieces.filter((piece) =>
    piece.id.includes(":facet:"),
  );
  const hingedDoors = grandTerminalScene.breakablePieces.filter(
    (piece) => piece.hinge,
  );
  const coachWindows = grandTerminalScene.breakablePieces.filter(
    (piece) => piece.id.includes(":window:") && piece.material === "glass",
  );

  // Round objects (boiler, chimney, wheels, columns, barrels) are stepped
  // octagonal stacks of plain boxes — angular voxel rounds that
  // fracture into ordinary voxel debris. No special cylinder pieces remain.
  assert.equal(cylinders.length, 0);
  assert.equal(facetedSlabs.length >= 300, true, String(facetedSlabs.length));
  // Three main entrances plus a street door into each ticket wing, two
  // leaves each, all swinging on hinges.
  assert.equal(hingedDoors.length, 10);
  // Coach windows lie flat in the carriage sides — no accidental yaw.
  assert.equal(
    coachWindows.every((piece) => piece.rotation === undefined),
    true,
  );
});

test("the side halls are reachable and lead to the side platforms", () => {
  const ids = new Set(grandTerminalScene.breakablePieces.map((piece) => piece.id));

  // Street doors into the wings, openings in the partitions and doorways in
  // the rear wall onto the side platforms.
  for (const expected of [
    "terminal:headhouse:facade:wing-door:-20:-1",
    "terminal:headhouse:facade:wing-door:20:1",
    "terminal:interior:hall:partition-lintel:-1:17",
    "terminal:interior:hall:partition-lintel:1:27",
    "terminal:headhouse:shell:rear-door-pier:-1",
    "terminal:headhouse:shell:rear-door-lintel:1",
    "terminal:headhouse:shell:rear-door-lamp:1:glass",
    "terminal:interior:hall:departure-post:-1",
  ]) {
    assert.equal(ids.has(expected), true, expected);
  }

  // Platform number boards carry a pair of lantern lamps.
  const signLanterns = grandTerminalScene.lampDefinitions.filter((lamp) =>
    lamp.id.includes(":lantern-glass:"),
  );
  assert.equal(signLanterns.length, 18);
});
