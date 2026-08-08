import assert from "node:assert/strict";
import test from "node:test";
import { islandAirportDocument } from "../games/make-a-mess/src/content/scenes/islandAirport/islandAirportDocument.ts";
import {
  AIRPORT_APRON,
  AIRPORT_CONTROL_TOWER,
  AIRPORT_RUNWAY,
  AIRPORT_TERMINAL,
  ISLAND_AIRPORT_SHORELINE,
  airportDistanceToShoreline,
  airportPointInShoreline,
} from "../games/make-a-mess/src/content/scenes/islandAirport/islandAirportPlan.ts";
import {
  islandAirportCompilation,
  islandAirportScene,
} from "../games/make-a-mess/src/game/islandAirportScene.ts";
import { islandAirportFlyover } from "../games/make-a-mess/src/game/islandAirportFlyover.ts";
import {
  PLAYER_HEIGHT,
  walkRoute,
} from "../games/make-a-mess/src/game/walkableRoute.ts";

const pieces = islandAirportScene.breakablePieces;
const withId = (fragment) => pieces.filter((piece) => piece.id.includes(fragment));

function extent(items, axis) {
  return {
    min: Math.min(...items.map((piece) => piece.position[axis] - piece.size[axis] / 2)),
    max: Math.max(...items.map((piece) => piece.position[axis] + piece.size[axis] / 2)),
  };
}

test("the complete airport compiles as one initially stable authored scene", () => {
  assert.equal(islandAirportScene.resolveStructuralCollapse(new Set()).size, 0);
  assert.equal(islandAirportCompilation.artifact.groupCount, 16);
  assert.ok(islandAirportCompilation.artifact.pieceCount >= 1_750);
  assert.equal(islandAirportCompilation.artifact.lampCount, 11);
  assert.equal(new Set(pieces.map((piece) => piece.id)).size, pieces.length);

  for (const service of [
    "maintenance-hangar",
    "fire-station",
    "control-tower",
    "fuel-farm",
  ]) {
    assert.ok(
      islandAirportScene.breakableClusters.some((cluster) => cluster.id.endsWith(`:${service}`)),
      `missing ${service}`,
    );
  }
});

test("the island is flat, elongated and bounded by the authored non-radial shoreline", () => {
  assert.equal(ISLAND_AIRPORT_SHORELINE.length, 18);
  assert.deepEqual(islandAirportScene.worldEdgeBoundary, ISLAND_AIRPORT_SHORELINE);
  const xs = ISLAND_AIRPORT_SHORELINE.map(([x]) => x);
  const zs = ISLAND_AIRPORT_SHORELINE.map(([, z]) => z);
  assert.ok((Math.max(...xs) - Math.min(...xs)) / (Math.max(...zs) - Math.min(...zs)) > 2);
  assert.ok(withId(":terrain:earth:").length > 550);
  assert.ok(withId(":terrain:earth:").every((piece) => piece.foundation));
  assert.ok(withId(":shoreline:riprap:").length > 150);
  assert.ok(withId(":shoreline:riprap:").every((piece) => piece.foundation));

  for (const x of [-88, 88]) {
    assert.ok(airportPointInShoreline(x, AIRPORT_RUNWAY.centreZ));
    assert.ok(airportDistanceToShoreline(x, AIRPORT_RUNWAY.centreZ) > 7);
  }
});

test("the compact runway, apron and taxiway keep their exact operational geometry", () => {
  const runway = withId(":pavement:runway:");
  const apron = withId(":pavement:apron:");
  const taxiway = withId(":pavement:taxiway:");
  assert.ok(runway.length >= 29);
  const runwayX = extent(runway, 0);
  assert.ok(Math.abs(runwayX.min + AIRPORT_RUNWAY.length / 2) <= 0.021);
  assert.ok(Math.abs(runwayX.max - AIRPORT_RUNWAY.length / 2) <= 0.021);
  assert.deepEqual(extent(runway, 2), {
    min: AIRPORT_RUNWAY.centreZ - AIRPORT_RUNWAY.width / 2,
    max: AIRPORT_RUNWAY.centreZ + AIRPORT_RUNWAY.width / 2,
  });
  const apronX = extent(apron, 0);
  assert.ok(Math.abs(apronX.min - (AIRPORT_APRON.centre[0] - AIRPORT_APRON.width / 2)) <= 0.021);
  assert.ok(Math.abs(apronX.max - (AIRPORT_APRON.centre[0] + AIRPORT_APRON.width / 2)) <= 0.021);
  assert.ok(taxiway.length >= 3);
  assert.equal(withId(":markings:centreline:").length, 13);
  assert.equal(withId(":markings:threshold-").length, 24);
  assert.equal(withId(":markings:stand-line:").length, 3);
});

test("terminal envelope is real construction with open doors and transparent glazing", () => {
  const foundations = withId(":terminal-structure:foundation:");
  assert.equal(foundations.length, AIRPORT_TERMINAL.bayCount);
  assert.deepEqual(extent(foundations, 0), {
    min: AIRPORT_TERMINAL.origin[0] - AIRPORT_TERMINAL.width / 2,
    max: AIRPORT_TERMINAL.origin[0] + AIRPORT_TERMINAL.width / 2,
  });
  assert.equal(withId(":terminal-structure:column:").length, 18);
  assert.equal(withId(":terminal-structure:roof-beam:").length, 9);
  assert.equal(withId(":terminal-glass:skylight:").length, 8);
  assert.equal(withId(":terminal-glass:airside:window:").length, 6);
  assert.equal(withId(":terminal-glass:landside:window:").length, 6);

  for (const side of ["airside", "landside"]) {
    for (const bay of side === "airside" ? [2, 5] : [3, 4]) {
      const leaves = withId(`:terminal-glass:${side}:door:${bay}:`);
      assert.equal(leaves.length, 2);
      const openingCentre = leaves.reduce((sum, leaf) => sum + leaf.position[0], 0) / 2;
      const innerEdges = leaves.map((leaf) =>
        leaf.position[0] < openingCentre
          ? leaf.position[0] + leaf.size[0] / 2
          : leaf.position[0] - leaf.size[0] / 2
      ).sort((a, b) => a - b);
      assert.ok(innerEdges[1] - innerEdges[0] >= 1.9, `${side} bay ${bay} is not open`);
    }
  }

  const glazing = pieces.filter((piece) =>
    piece.clusterId === "island-airport:terminal-glass"
  );
  assert.ok(glazing.every((piece) => piece.material === "glass"));
});

test("both independent passenger routes cross the building in both directions", () => {
  const routes = [
    {
      bounds: { minX: -7, maxX: 13, minZ: 6, maxZ: 35, floorY: -0.2, ceilingY: 7 },
      outside: { x: 4.75, z: 33.2, footY: 0.46 },
      apron: { x: -1.75, z: 7.8, footY: 0.4 },
    },
    {
      bounds: { minX: 8.3, maxX: 20.5, minZ: 6, maxZ: 35, floorY: -0.2, ceilingY: 7 },
      outside: { x: 11.25, z: 33.2, footY: 0.46 },
      apron: { x: 17.75, z: 7.8, footY: 0.4 },
    },
  ];
  for (const [index, route] of routes.entries()) {
    for (const [direction, from, to] of [
      ["outbound", route.outside, route.apron],
      ["inbound", route.apron, route.outside],
    ]) {
      const result = walkRoute(pieces, from, to, {
        bounds: route.bounds,
        cell: 0.2,
        height: PLAYER_HEIGHT + 0.18,
      });
      assert.ok(
        result.reached,
        `route ${index + 1} ${direction}: closest ${result.closestDistance.toFixed(2)} m, ${result.blockedBy ?? result.blockReason}`,
      );
    }
  }
});

test("terminal fixtures and airfield lights use complete physical carrier chains", () => {
  assert.equal(withId(":terminal-lighting:fixture:").length, 32);
  for (let row = 0; row < 2; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      for (const part of ["stem", "housing", "lens", "bulb"]) {
        assert.equal(withId(`:fixture:${row}:${column}:${part}:`).length, 1);
      }
    }
  }
  assert.equal(withId(":airfield-equipment:edge:").length, 44 * 4);
  assert.equal(withId(":airfield-equipment:threshold:").length, 14 * 4);
  assert.equal(withId(":airfield-equipment:papi:").length, 4 * 4);

  const edgeBase = "island-airport:airfield-equipment:edge:4:1:base:piece";
  const edgeCollapse = islandAirportScene.resolveStructuralCollapse(new Set([edgeBase]));
  assert.equal(edgeCollapse.size, 4);
  assert.ok([...edgeCollapse].every((id) => id.includes(":edge:4:1:")));

  const beam = "island-airport:terminal-structure:roof-beam:1:piece";
  const fixtureCollapse = islandAirportScene.resolveStructuralCollapse(new Set([beam]));
  assert.ok(fixtureCollapse.has("island-airport:terminal-lighting:fixture:0:0:bulb:piece"));
  assert.ok(fixtureCollapse.has("island-airport:terminal-lighting:fixture:1:0:bulb:piece"));
});

test("tower, rescue, maintenance and fuel systems keep their defining parts", () => {
  assert.equal(AIRPORT_CONTROL_TOWER.roofY, 14.35);
  assert.equal(withId(":control-tower:cab-glass-").length, 4);
  assert.equal(withId(":control-tower:beacon-").length, 3);
  assert.equal(withId(":maintenance-hangar:hangar:door:").length, 2);
  assert.equal(withId(":fire-station:fire:door:").length, 3);
  assert.equal(withId(":fuel-farm:tank:").length, 3);
  assert.equal(withId(":fuel-farm:fence:").length, 10);
  assert.deepEqual(islandAirportDocument.world.playerSpawn, [4.75, 1.25, 42]);
});

test("the flyover covers overview, circulation, systems and sunset without entering solids", () => {
  assert.equal(islandAirportFlyover.keyframes[0].at, 0);
  assert.equal(islandAirportFlyover.keyframes.at(-1).at, 1);
  assert.equal(islandAirportFlyover.chapters.length, 5);
  assert.ok(islandAirportFlyover.keyframes.every((frame, index, frames) =>
    index === 0 || frame.at > frames[index - 1].at
  ));
  for (const chapter of islandAirportFlyover.chapters) {
    assert.ok(chapter.captureAt >= chapter.from && chapter.captureAt <= chapter.to);
  }
  for (const frame of islandAirportFlyover.keyframes) {
    const insideSolid = pieces.some((piece) => {
      if (piece.intactCollider === false) return false;
      return [0, 1, 2].every((axis) =>
        Math.abs(frame.position[axis] - piece.position[axis]) < piece.size[axis] / 2
      );
    });
    assert.equal(insideSolid, false, `camera ${frame.at} is inside authored geometry`);
  }
});
