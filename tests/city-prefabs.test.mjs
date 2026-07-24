import assert from "node:assert/strict";
import { stat } from "node:fs/promises";
import test from "node:test";
import {
  cityPrefabDefinitions,
  cityPrefabLibrary,
} from "../games/make-a-mess/src/content/prefabs/cityPrefabs.ts";
import { damageBody } from "../games/make-a-mess/src/game/destructionRuntime.ts";
import { Euler, Quaternion, Vector3 } from "three";

const byId = (id) => {
  const definition = cityPrefabLibrary.get(id);
  assert.ok(definition, id);
  return definition;
};

test("the city kit is a versioned library of complete reusable objects", () => {
  assert.equal(cityPrefabDefinitions.length >= 34, true);
  assert.equal(cityPrefabLibrary.size, cityPrefabDefinitions.length);

  const ids = cityPrefabDefinitions.map((definition) => definition.id);
  assert.equal(new Set(ids).size, ids.length, "prefab ids are unique");
  for (const definition of cityPrefabDefinitions) {
    assert.equal(definition.schemaVersion, 1, definition.id);
    assert.equal(definition.pieces.length > 0, true, definition.id);
    assert.equal(
      new Set(definition.pieces.map((piece) => piece.id)).size,
      definition.pieces.length,
      `${definition.id} piece ids`,
    );
  }

  for (const signature of [
    "city:tower:stone",
    "city:tower:glass",
    "city:tower:warm",
    "city:podium:service",
    "city:commercial:led-hall",
    "city:block:yellow-courtyard",
    "city:house:old-two-storey",
    "city:outbuilding:bicycle-end",
    "city:shop:hardware",
    "city:fence:breeze-section",
    "city:gate:weathered-blue",
    "city:park:ramp",
    "city:car:minivan",
    "city:vehicle:mini-truck",
  ]) {
    assert.equal(ids.includes(signature), true, signature);
  }
});

test("the observed old-house details are physical parts, not a facade note", () => {
  const house = byId("city:house:old-two-storey");
  const ids = house.pieces.map((piece) => piece.id);

  for (const detail of [
    "door",
    "door-transom",
    "roof-long:1",
    "roof-hip:-1",
    "gas:horizontal",
    "gas:drop",
    "cable:horizontal",
    "dish:face",
  ]) {
    assert.equal(ids.includes(detail), true, detail);
  }
  assert.equal(ids.filter((id) => id.startsWith("spall-brick:")).length, 12);
  assert.equal(
    house.pieces.filter((piece) => piece.textureProfile === "city-aged-stucco").length >= 8,
    true,
  );
  assert.equal(
    house.pieces.filter((piece) => piece.textureProfile === "city-roof-tile").length,
    4,
  );
});

test("the distant courtyard outbuilding retains its door, transom, tile patch and damp base", () => {
  const outbuilding = byId("city:outbuilding:bicycle-end");
  const ids = new Set(outbuilding.pieces.map((piece) => piece.id));
  for (const detail of ["door", "transom", "tile-patch", "window", "damp-base", "roof:-1", "roof:1"]) {
    assert.equal(ids.has(detail), true, detail);
  }
  assert.equal(byId("city:bicycle").pieces.filter((piece) => piece.id.startsWith("wheel:")).length, 2);
});

test("the wheelbarrow has an open steel tray and a transverse wheel", () => {
  const barrow = byId("city:wheelbarrow");
  const tray = barrow.pieces.filter((piece) => piece.id.startsWith("tray"));
  const bottom = tray.find((piece) => piece.id === "tray");
  const walls = tray.filter((piece) => piece.id !== "tray");
  const wheel = barrow.pieces.find((piece) => piece.id === "wheel");

  assert.ok(bottom);
  assert.ok(wheel);
  assert.equal(tray.length, 5, "bottom plus four real walls");
  assert.equal(walls.length, 4);
  assert.equal(tray.every((piece) => piece.material === "steel"), true);
  assert.equal(tray.every((piece) => piece.shape === "steelSheet"), true);
  assert.equal(bottom.size[1] < 0.1, true, "the tray is not a solid block");
  assert.equal(
    walls.every((piece) => Math.min(...piece.size) <= 0.08),
    true,
    "each wall is a thin physical sheet",
  );
  const cavityPoint = new Vector3(0, 0.72, -0.05);
  const cavityIsOccupied = tray.some((piece) => {
    const rotation = piece.rotation ?? [0, 0, 0];
    const localPoint = cavityPoint
      .clone()
      .sub(new Vector3(...piece.position))
      .applyQuaternion(
        new Quaternion()
          .setFromEuler(new Euler(...rotation))
          .invert(),
      );
    return piece.size.every(
      (extent, axis) =>
        Math.abs(localPoint.getComponent(axis)) <= extent / 2,
    );
  });
  assert.equal(cavityIsOccupied, false, "the tray cavity is physically empty");
  assert.deepEqual(wheel.rotation, [0, 0, Math.PI / 2]);
});

test("stucco-house plinths project beyond the walls without intersecting them", () => {
  for (const id of [
    "city:house:gable-yellow",
    "city:house:hip-cream",
    "city:house:hip-white",
  ]) {
    const house = byId(id);
    const wall = house.pieces.find((piece) => piece.id === "front:0:seg:0");
    const plinth = house.pieces.find((piece) => piece.id === "plinth:z:1:0");
    const foundation = house.pieces.find((piece) => piece.id === "foundation");
    assert.ok(wall, `${id} front wall`);
    assert.ok(plinth, `${id} front plinth`);
    assert.ok(foundation, `${id} foundation`);

    const wallFace = wall.position[2] + wall.size[2] / 2;
    const plinthInnerFace = plinth.position[2] - plinth.size[2] / 2;
    const plinthOuterFace = plinth.position[2] + plinth.size[2] / 2;
    const foundationFace = foundation.position[2] + foundation.size[2] / 2;
    assert.equal(Math.abs(plinthInnerFace - wallFace) < 1e-9, true, `${id} plinth meets the wall without intersecting it`);
    assert.equal(plinthOuterFace - wallFace >= 0.1, true, `${id} plinth has a visible projection`);
    assert.equal(foundationFace - wallFace >= 0.05, true, `${id} foundation is not coplanar with the wall`);
  }
});

test("every low-rise plaster building foundation projects beyond its lower walls", () => {
  const faceNames = ["+x", "-x", "+z", "-z"];
  for (const building of cityPrefabLibrary.values()) {
    if (!building.tags.includes("building")) {
      continue;
    }
    const foundation = building.pieces.find((piece) => piece.id === "foundation");
    if (!foundation) {
      continue;
    }
    const foundationFaces = [
      foundation.position[0] + foundation.size[0] / 2,
      foundation.position[0] - foundation.size[0] / 2,
      foundation.position[2] + foundation.size[2] / 2,
      foundation.position[2] - foundation.size[2] / 2,
    ];
    const lowerWalls = building.pieces.filter((piece) =>
      (piece.material === "plaster" || piece.textureProfile === "city-aged-stucco")
      && piece.position[1] - piece.size[1] / 2 < 0.55
      && !/plinth|base|trim|patch|sign|frame|door|window|roof/.test(piece.id)
    );

    for (const wall of lowerWalls) {
      const wallFaces = [
        wall.position[0] + wall.size[0] / 2,
        wall.position[0] - wall.size[0] / 2,
        wall.position[2] + wall.size[2] / 2,
        wall.position[2] - wall.size[2] / 2,
      ];
      const clearances = [
        foundationFaces[0] - wallFaces[0],
        wallFaces[1] - foundationFaces[1],
        foundationFaces[2] - wallFaces[2],
        wallFaces[3] - foundationFaces[3],
      ];
      for (const [axis, clearance] of clearances.entries()) {
        if (Math.abs(clearance) < 0.5) {
          assert.equal(
            clearance >= 0.05,
            true,
            `${building.id}:${wall.id} has a coplanar lower seam on ${faceNames[axis]}`,
          );
        }
      }
    }
  }
});

test("courtyard walls use real openings and the peeling gate exposes real brick", () => {
  const wall = byId("city:fence:breeze-section");
  const lattice = wall.pieces.filter((piece) => piece.id.startsWith("lattice:"));
  assert.equal(lattice.length, 30);
  assert.equal(lattice.every((piece) => Math.abs(piece.rotation?.[2] ?? 0) > 0.6), true);

  const gate = byId("city:gate:weathered-blue");
  const brickColors = new Set(
    gate.pieces
      .filter((piece) => piece.id.startsWith("pillar:"))
      .map((piece) => piece.color),
  );
  assert.equal(brickColors.has("#70594d"), true, "exposed brick");
  assert.equal(brickColors.has("#ddd8cd"), true, "remaining white paint");
  assert.equal(gate.pieces.some((piece) => piece.id === "meter-box"), true);
  assert.equal(gate.pieces.some((piece) => piece.id === "gas:top"), true);
});

test("generated city texture variants are project assets", async () => {
  for (const name of [
    "city-gray-pavers.webp",
    "city-red-pavers.webp",
    "city-aged-stucco.webp",
    "city-red-aggregate.webp",
    "city-facade-cladding.webp",
    "city-roof-tile.webp",
  ]) {
    const file = await stat(new URL(`../public/games/make-a-mess/textures/${name}`, import.meta.url));
    assert.equal(file.size > 20_000, true, name);
  }
});

test("surface texture identity follows material into broken fragments", () => {
  const result = damageBody(
    {
      id: "test:paver",
      material: "concrete",
      color: "#ffffff",
      textureProfile: "city-gray-pavers",
      shape: "groundTile",
      size: [2, 0.4, 2],
    },
    {
      position: new Vector3(0, 0, 0),
      quaternion: new Quaternion(),
      linearVelocity: new Vector3(),
      angularVelocity: new Vector3(),
    },
    {
      idPrefix: "test:fragment",
      worldPoint: new Vector3(0.6, 0, 0.6),
      radius: 0.34,
      burstSpeed: 2,
    },
  );
  assert.ok(result);
  assert.equal(result.fragments.length > 0, true);
  assert.equal(
    result.fragments.every((fragment) => fragment.textureProfile === "city-gray-pavers"),
    true,
  );
});
