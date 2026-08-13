import assert from "node:assert/strict";
import test from "node:test";
import {
  grandTerminalMaterials,
  grandTerminalScene,
} from "../games/make-a-mess/src/game/grandTerminalScene.ts";
import { flightPlan } from "../games/make-a-mess/src/game/skyTrainRoutes.ts";
import { vehicleFrames } from "../games/make-a-mess/src/game/vehicleFrames.ts";

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
  assert.equal(grandTerminalScene.boundaryRadius, 240);
  assert.equal(grandTerminalScene.skyRadius, 300);
  assert.equal(grandTerminalScene.lampDefinitions.length >= 25, true);

  for (const material of grandTerminalMaterials) {
    assert.equal(usedMaterials.has(material), true, material);
  }
});

test("the route, player boundary and sky are separate concentric envelopes", () => {
  const frame = vehicleFrames.find((candidate) => candidate.id === "sky-train");
  assert.ok(frame);
  const [centerX, centerZ] = grandTerminalScene.worldCenter;
  let routeRadius = 0;

  for (const kind of ["circuit", "tour"]) {
    const plan = flightPlan(kind, frame.origin);
    for (let index = 0; index <= 4096; index += 1) {
      const point = plan.point(index / 4096);
      routeRadius = Math.max(
        routeRadius,
        Math.hypot(point[0] - centerX, point[2] - centerZ),
      );
    }
  }

  assert.equal(routeRadius < 193, true, String(routeRadius));
  assert.equal(grandTerminalScene.boundaryRadius >= routeRadius + 40, true);
  assert.equal(
    grandTerminalScene.skyRadius >= grandTerminalScene.boundaryRadius + 50,
    true,
  );
  assert.equal(
    grandTerminalScene.cameraFar >=
      grandTerminalScene.skyRadius + grandTerminalScene.boundaryRadius,
    true,
  );
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
  // The station park is planted with the composite flora core, whose trunks
  // and branches are legitimately cylindrical; the no-cylinder rule guards
  // the ARCHITECTURE (boiler, wheels, columns stay faceted voxel rounds).
  const cylinders = grandTerminalScene.breakablePieces.filter(
    (piece) => piece.shape === "cylinder" && !piece.id.includes(":tree:"),
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
  // leaves each; the fog-siding hut door; the service belt gates (two
  // goods-shed doorways and the workshop doorway, two leaves each); and the
  // sky train's own door at platform 0, whose leaf and brass handle share one
  // hinge. The two barrier arms are gone: platform 0 stands where they were.
  assert.equal(hingedDoors.length, 19);
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

test("the entrance lobby wainscot leaves every street doorway clear", () => {
  const streetDoorways = [
    { center: -20, halfWidth: 2.25 },
    { center: -9, halfWidth: 2.35 },
    { center: 0, halfWidth: 2.35 },
    { center: 9, halfWidth: 2.35 },
    { center: 20, halfWidth: 2.25 },
  ];
  const wainscot = grandTerminalScene.breakablePieces.filter((piece) =>
    piece.id.startsWith("terminal:interior:lobby:wainscot"),
  );

  assert.equal(wainscot.length > 0, true);
  for (const piece of wainscot) {
    for (const doorway of streetDoorways) {
      const clearance = Math.abs(piece.position[0] - doorway.center);
      assert.equal(
        clearance >= doorway.halfWidth + piece.size[0] / 2,
        true,
        `${piece.id} blocks the street doorway at x=${doorway.center}`,
      );
    }
  }
});

test("the station reuses its fixtures for continuous floor coverage", () => {
  const skyLamps = grandTerminalScene.lampDefinitions.filter(
    (lamp) => lamp.id.startsWith("terminal:sky-berth:") ||
      lamp.carrierClusterId === "terminal:sky-train",
  );
  assert.equal(skyLamps.length > 10, true);
  assert.equal(skyLamps.every((lamp) => lamp.localPoolCapacity === undefined), true);

  const hallLamps = grandTerminalScene.lampDefinitions.filter((lamp) =>
    lamp.id.includes("terminal:interior:hall:hall-lamp:"),
  );
  const wingLamps = grandTerminalScene.lampDefinitions.filter((lamp) =>
    lamp.id.includes("terminal:interior:hall:wing-lamp:"),
  );
  assert.equal(hallLamps.length, 4);
  assert.equal(wingLamps.length, 4);
  assert.equal(
    [...hallLamps, ...wingLamps].every((lamp) => lamp.localPoolCapacity === 8),
    true,
  );
  assert.equal(hallLamps.every((lamp) => lamp.distance >= 20), true);
  assert.equal(wingLamps.every((lamp) => lamp.distance >= 15), true);

  const platformLamps = grandTerminalScene.lampDefinitions.filter((lamp) =>
    lamp.id.startsWith("terminal:yard:fittings:platform-sign:") &&
      lamp.id.includes(":lantern-glass:"),
  );
  assert.equal(platformLamps.length, 18);
  assert.equal(
    platformLamps.every((lamp) =>
      lamp.distance >= 18 &&
      lamp.intensity >= 6 &&
      lamp.localPoolCapacity === 8),
    true,
  );
  const pairs = Map.groupBy(platformLamps, (lamp) => lamp.poolGroupId);
  assert.equal(pairs.size, 9);
  for (const pair of pairs.values()) {
    assert.equal(pair.length, 2);
  }
  assert.equal(
    grandTerminalScene.lampDefinitions.some((lamp) =>
      lamp.id.includes("terminal:shed:structure:work-light:")),
    false,
  );
});

test("only the sky berth clock follows game time", () => {
  const clocks = grandTerminalScene.mutableObjectDefinitions.filter(
    (object) => object.kind === "analogClock",
  );
  assert.equal(clocks.length, 1);
  assert.equal(clocks[0].id, "terminal:sky-berth:clock");
  assert.deepEqual(clocks[0].timeSource, { kind: "game" });
  assert.equal(clocks[0].hourHandPieceId, "terminal:sky-berth:clock-hand-hour");
  assert.equal(clocks[0].minuteHandPieceId, "terminal:sky-berth:clock-hand-minute");

  const controlled = grandTerminalScene.mutablePieceIds;
  const museumHands = grandTerminalScene.breakablePieces.filter(
    (piece) => piece.id.includes("platform-clock:") && piece.id.includes(":hand-"),
  );
  assert.equal(museumHands.length > 0, true);
  assert.equal(museumHands.every((piece) => !controlled.has(piece.id)), true);
});

test("the hall board fades while the berth matrix reports one shared journey state", () => {
  const hallDisplay = grandTerminalScene.mutableObjectDefinitions.find(
    (object) => object.kind === "display" && object.id === "terminal:interior:departures",
  );
  const berthDisplay = grandTerminalScene.mutableObjectDefinitions.find(
    (object) => object.kind === "matrixDisplay" && object.id === "terminal:sky-berth:departures",
  );
  assert.notEqual(hallDisplay, undefined);
  assert.notEqual(berthDisplay, undefined);
  assert.deepEqual(hallDisplay.layers[0].condition, {
    kind: "clusterEvent",
    sourceClusterId: "terminal:sky-train",
    states: ["docked"],
  });
  assert.equal(hallDisplay.transition.fadeInSeconds > 0, true);
  assert.equal(hallDisplay.transition.fadeOutSeconds > 0, true);
  assert.equal(hallDisplay.layers[0].pieceIds.length > 100, true);
  assert.equal(
    hallDisplay.layers[0].pieceIds.every((id) =>
      id.startsWith("terminal:interior:hall:departure-title:") ||
      id.startsWith("terminal:interior:hall:departure-city:") ||
      id.startsWith("terminal:interior:hall:departure-platform:")),
    true,
  );
  assert.equal(
    berthDisplay.cellPieceIds.every((id) =>
      id.startsWith("terminal:sky-berth:board-line:cell:")),
    true,
  );
  assert.equal(berthDisplay.cellPieceIds.length, 59 * 7);
  assert.deepEqual(
    berthDisplay.frames.map((frame) => [frame.id, frame.condition.states]),
    [
      ["scheduled", ["docked"]],
      ["attention", ["attention"]],
      ["departing", ["departure"]],
      ["in-flight", ["cruise", "inTransit"]],
      ["arriving", ["approach"]],
      ["failed", ["failed"]],
    ],
  );
  assert.equal(
    berthDisplay.frames.every((frame) =>
      frame.activePieceIds.every((id) => berthDisplay.cellPieceIds.includes(id))),
    true,
  );
  assert.equal(berthDisplay.transition.fadeInSeconds > 0, true);
  assert.equal(berthDisplay.transition.fadeOutSeconds > 0, true);

  const berthBoardLight = grandTerminalScene.lampDefinitions.find(
    (lamp) => lamp.id === "terminal:sky-berth:board",
  );
  assert.equal(berthBoardLight.eventLighting, undefined);
  assert.equal(berthBoardLight.dayIntensityFactor, 1);

  const platformDisplay = grandTerminalScene.mutableObjectDefinitions.find(
    (object) => object.kind === "matrixDisplay" && object.id === "terminal:sky-berth:platform-number",
  );
  assert.notEqual(platformDisplay, undefined);
  assert.equal(platformDisplay.frames.length, 1);
  assert.equal(platformDisplay.frames[0].condition, undefined);
});
