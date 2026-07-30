import assert from "node:assert/strict";
import test from "node:test";
import {
  ISLAND_CHART,
  islandBearing,
  islandDestinations,
  islandDistance,
  islandHeading,
} from "../games/make-a-mess/src/game/islandTopology.ts";

test("the island chart gives every current world one stable place and path", () => {
  const islands = Object.values(ISLAND_CHART);
  assert.equal(islands.length, 5);
  assert.equal(new Set(islands.map((island) => island.sceneId)).size, 5);
  assert.equal(new Set(islands.map((island) => island.path)).size, 5);
  assert.deepEqual(ISLAND_CHART.astana.position, { east: 0, north: 0 });
});

test("Town and Viking Village share a true north-south route", () => {
  assert.equal(islandBearing("town", "viking-village"), 0);
  assert.equal(islandBearing("viking-village", "town"), 180);
  assert.deepEqual(islandHeading("town", "viking-village"), [0, 0, 1]);
  assert.deepEqual(islandHeading("viking-village", "town"), [0, 0, -1]);
  assert.equal(islandDistance("town", "viking-village"), 1800);
});

test("only the first direct service is selectable while the Astana spokes remain authored", () => {
  assert.deepEqual(islandDestinations("town"), ["viking-village"]);
  assert.deepEqual(islandDestinations("viking-village"), ["town"]);
  assert.deepEqual(islandDestinations("astana"), []);
  assert.deepEqual(
    islandDestinations("astana", true),
    ["viking-village", "town", "grand-terminal", "basalt-stronghold"],
  );
});

test("the four island families occupy distinct bearings from Astana", () => {
  assert.equal(islandBearing("astana", "viking-village"), 315);
  assert.equal(islandBearing("astana", "town"), 225);
  assert.equal(islandBearing("astana", "grand-terminal"), 135);
  assert.equal(islandBearing("astana", "basalt-stronghold"), 45);
});
