import assert from "node:assert/strict";
import test from "node:test";
import { vikingVillageDocument } from "../games/make-a-mess/src/content/scenes/vikingVillageDocument.ts";
import {
  vikingHomeEntrance,
  vikingTrafficAreas,
  vikingTrafficRoutes,
  vikingVillageHomes,
} from "../games/make-a-mess/src/content/scenes/vikingVillagePlan.ts";
import {
  vikingVillageCompilation,
  vikingVillageScene,
} from "../games/make-a-mess/src/game/vikingVillageScene.ts";

function rotationAxes(rotation = [0, 0, 0]) {
  const [rx, ry, rz] = rotation;
  const sx = Math.sin(rx);
  const cx = Math.cos(rx);
  const sy = Math.sin(ry);
  const cy = Math.cos(ry);
  const sz = Math.sin(rz);
  const cz = Math.cos(rz);
  return {
    x: [cy * cz, sx * sy * cz + cx * sz, -cx * sy * cz + sx * sz],
    y: [-cy * sz, -sx * sy * sz + cx * cz, cx * sy * sz + sx * cz],
    z: [sy, -sx * cy, cx * cy],
  };
}

function absoluteDot(left, right) {
  return Math.abs(left[0] * right[0] + left[1] * right[1] + left[2] * right[2]);
}

test("Viking Village is stable before the player touches it", () => {
  const unsupported = vikingVillageScene.resolveStructuralCollapse(new Set());

  assert.equal(vikingVillageScene.breakablePieces.length > 5700, true);
  assert.equal(unsupported.size, 0);
});

test("the pilot map is a serializable scene document compiled from prefabs", () => {
  const serialized = JSON.stringify(vikingVillageDocument);
  const parsed = JSON.parse(serialized);

  assert.equal(parsed.schemaVersion, 1);
  assert.equal(parsed.id, "viking-village");
  assert.equal(vikingVillageCompilation.artifact.objectCount > 4000, true);
  assert.equal(vikingVillageCompilation.artifact.prefabIds.length >= 17, true);
  assert.equal(vikingVillageCompilation.artifact.groupCount, 13);
});

test("the village contains domestic life as physical, destructible objects", () => {
  const ids = vikingVillageScene.breakablePieces.map((piece) => piece.id);
  const materials = new Set(
    vikingVillageScene.breakablePieces.map((piece) => piece.material),
  );

  for (const signature of [
    ":great-hall:",
    ":laundry:",
    ":sword:",
    ":hall-barrel:",
    ":mushroom:",
    ":village-well:",
  ]) {
    assert.equal(ids.some((id) => id.includes(signature)), true, signature);
  }
  assert.equal(materials.has("cloth"), true);
  assert.equal(vikingVillageScene.lampDefinitions.length >= 11, true);
  assert.equal(vikingVillageScene.worldRadius, 96);
});

test("mud, moss and wet tracks are masks on the destructible ground", () => {
  const landscape = vikingVillageScene.breakablePieces.filter(
    (piece) => piece.landscapeSurface === "viking-ground",
  );
  const ids = vikingVillageScene.breakablePieces.map((piece) => piece.id);

  assert.equal(landscape.length > 1_000, true);
  assert.equal(landscape.every((piece) => piece.shape === "groundTile"), true);
  for (const fakeOverlay of [
    ":main-track:",
    ":hall-track:",
    ":ground-growth:",
    ":moss:",
  ]) {
    assert.equal(ids.some((id) => id.includes(fakeOverlay)), false, fakeOverlay);
  }
});

test("foot traffic connects every home to shared village life", () => {
  assert.equal(vikingTrafficRoutes.length >= 18, true);

  for (const home of vikingVillageHomes) {
    const entrance = vikingHomeEntrance(home);
    const routeReachesDoor = vikingTrafficRoutes.some((route) =>
      route.points.some((point) => Math.hypot(
        point[0] - entrance[0],
        point[1] - entrance[1],
      ) < 0.05),
    );
    assert.equal(routeReachesDoor, true, `${home.id} route`);
    assert.equal(
      vikingTrafficAreas.some((area) => area.id === `${home.id}-threshold`),
      true,
      `${home.id} threshold wear`,
    );
    const playLoop = vikingTrafficRoutes.find(
      (route) => route.id === `home-loop:${home.id}`,
    );
    assert.ok(playLoop, `${home.id} lived-in perimeter`);
    assert.deepEqual(playLoop.points[0], entrance, `${home.id} loop starts at door`);
    assert.deepEqual(
      playLoop.points[playLoop.points.length - 1],
      entrance,
      `${home.id} loop returns to door`,
    );
  }

  const wellRing = vikingTrafficRoutes.find((route) => route.id === "well-ring");
  assert.ok(wellRing, "well perimeter traffic");
  assert.equal(wellRing.points.length >= 8, true);
  assert.equal(
    vikingTrafficRoutes.filter((route) => route.id.startsWith("well")).length >= 3,
    true,
    "several approaches pass around the well",
  );

  for (const sharedPlace of [
    "well",
    "commons",
    "north-armoury",
    "smith-store",
    "goat-pen",
    "kitchen-garden",
  ]) {
    assert.equal(
      vikingTrafficAreas.some((area) => area.id === sharedPlace),
      true,
      sharedPlace,
    );
  }
});

test("homes and the great hall carry authored wall firelight", () => {
  const ids = vikingVillageScene.breakablePieces.map((piece) => piece.id);
  const lampIds = vikingVillageScene.lampDefinitions.map((lamp) => lamp.id);

  for (const home of vikingVillageHomes) {
    for (const side of [-1, 1]) {
      assert.equal(
        ids.some((id) => id.includes(`:door-torch:${home.id}:${side}:backplate`)),
        true,
        `${home.id} wall torch ${side}`,
      );
      assert.equal(
        lampIds.some((id) => id.includes(`:door-torch:${home.id}:${side}:flame`)),
        true,
        `${home.id} flame ${side}`,
      );
      assert.equal(
        lampIds.some((id) => id.includes(`:home-interior-torch:${home.id}:${side}:flame`)),
        true,
        `${home.id} interior flame ${side}`,
      );
    }
  }

  assert.equal(
    lampIds.filter((id) => id.includes(":hall-interior-torch:")).length,
    10,
  );
  assert.equal(
    lampIds.filter((id) => id.includes(":hall-table-lamp:")).length,
    4,
  );

  const homeEntryLamp = vikingVillageScene.lampDefinitions.find((lamp) =>
    lamp.id.includes(":door-torch:weaver:-1:flame"),
  );
  const hallEntryLamps = vikingVillageScene.lampDefinitions.filter((lamp) =>
    lamp.id.includes(":hall-entry-torch:"),
  );
  assert.ok(homeEntryLamp);
  assert.equal(hallEntryLamps.length, 2);
  for (const lamp of hallEntryLamps) {
    assert.equal(lamp.intensity >= homeEntryLamp.intensity, true);
    assert.equal(lamp.distance >= homeEntryLamp.distance, true);
    assert.equal(lamp.position[0] > 7.81, true, "hall entry flame faces outside");
  }

  const westHallLamps = vikingVillageScene.lampDefinitions.filter((lamp) =>
    lamp.id.includes(":hall-interior-torch:west:"),
  );
  const eastHallLamps = vikingVillageScene.lampDefinitions.filter((lamp) =>
    lamp.id.includes(":hall-interior-torch:east:"),
  );
  assert.equal(westHallLamps.every((lamp) => lamp.position[0] > -7.28), true);
  assert.equal(eastHallLamps.every((lamp) => lamp.position[0] < 7.28), true);
  assert.equal(vikingVillageScene.lampDefinitions.length >= 48, true);
});

test("the jarl throne faces the feast tables", () => {
  const throneSeat = vikingVillageScene.breakablePieces.find((piece) =>
    piece.id.endsWith(":jarl-throne:seat"),
  );
  const throneBack = vikingVillageScene.breakablePieces.find((piece) =>
    piece.id.endsWith(":jarl-throne:back"),
  );

  assert.ok(throneSeat);
  assert.ok(throneBack);
  assert.equal(
    throneBack.position[2] < throneSeat.position[2],
    true,
    "the backrest stays behind the jarl while the seat faces the hall",
  );
});

test("weapon stores are roofed, floored and expose two full sword racks", () => {
  const ids = vikingVillageScene.breakablePieces.map((piece) => piece.id);

  for (const shelter of ["north-armoury", "smith-store"]) {
    const prefix = `viking-village:working-yards:${shelter}:`;
    const pieces = ids.filter((id) => id.startsWith(prefix));

    assert.equal(pieces.filter((id) => id.includes(":floor:")).length, 9);
    assert.equal(pieces.filter((id) => id.includes(":roof-board:")).length, 8);
    assert.equal(pieces.filter((id) => id.includes(":roof-rafter:")).length, 8);
    assert.equal(pieces.filter((id) => id.includes(":sword-rack:") && id.endsWith(":blade")).length, 12);
  }
});

test("every log house is one founded, tied and roofed structure", () => {
  const ids = vikingVillageScene.breakablePieces.map((piece) => piece.id);
  const buildings = [
    "great-hall",
    "weaver",
    "brewer",
    "fisher",
    "smith",
    "family-north",
    "family-east",
    "elder",
  ];
  const yawByBuilding = new Map([
    ["great-hall", 0],
    ...vikingVillageHomes.map((home) => [home.id, home.yaw]),
  ]);

  for (const building of buildings) {
    const prefix = `viking-village:buildings:${building}:`;
    const pieces = ids.filter((id) => id.startsWith(prefix));
    assert.equal(
      pieces.some((id) => id.includes(":foundation:")),
      true,
      `${building} foundation`,
    );
    assert.equal(
      pieces.some((id) => id.includes(":wall-plate:")),
      true,
      `${building} wall plate`,
    );
    for (const end of [-1, 1]) {
      assert.equal(
        pieces.some((id) => id.includes(`:gable:${end}:row:`)),
        true,
        `${building} gable ${end}`,
      );
    }
    assert.equal(
      pieces.some((id) => id.includes(":rafter:")),
      true,
      `${building} rafters`,
    );
    for (const side of [-1, 1]) {
      const rafter = vikingVillageScene.breakablePieces.find(
        (piece) => piece.id.startsWith(prefix)
          && piece.id.includes(`:rafter:${side}:`),
      );
      const roof = vikingVillageScene.breakablePieces.find(
        (piece) => piece.id.startsWith(prefix)
          && piece.id.includes(`:roof:${side}:`),
      );
      assert.ok(rafter?.rotation, `${building} rafter ${side} rotation`);
      assert.ok(roof?.rotation, `${building} roof ${side} rotation`);
      assert.equal(
        absoluteDot(
          rotationAxes(rafter.rotation).y,
          rotationAxes(roof.rotation).x,
        ) > 0.999999,
        true,
        `${building} rafter ${side} follows roof plane`,
      );
    }


    const yaw = yawByBuilding.get(building);
    const sideLog = vikingVillageScene.breakablePieces.find(
      (piece) => piece.id.startsWith(prefix)
        && piece.id.includes(":wall:side:1:row:0"),
    );
    const door = vikingVillageScene.breakablePieces.find(
      (piece) => piece.id === `${prefix}door`,
    );
    assert.ok(sideLog?.rotation, `${building} side wall orientation`);
    assert.ok(door?.rotation, `${building} door orientation`);
    const expectedSideAxis = [Math.sin(yaw), 0, Math.cos(yaw)];
    assert.equal(
      absoluteDot(rotationAxes(sideLog.rotation).y, expectedSideAxis) > 0.999999,
      true,
      `${building} side logs follow the building yaw`,
    );
    const expectedDoorNormal = building === "great-hall"
      ? [1, 0, 0]
      : expectedSideAxis;
    assert.equal(
      absoluteDot(rotationAxes(door.rotation).z, expectedDoorNormal) > 0.999999,
      true,
      `${building} door lies in its wall plane`,
    );
  }
});

test("the gate lintel obeys its authored supports", () => {
  const brokenPosts = new Set([
    "viking-village:palisade:north:post:-1:body",
    "viking-village:palisade:north:post:1:body",
  ]);
  const collapsed = vikingVillageScene.resolveStructuralCollapse(brokenPosts);

  assert.equal(collapsed.has("viking-village:palisade:north:lintel:body"), true);
  assert.equal(collapsed.size > brokenPosts.size, true);
});
