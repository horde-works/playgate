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
  VIKING_BOULDER_ARCHETYPES,
  vikingBoulderPlacements,
} from "../games/make-a-mess/src/content/scenes/vikingVillageBoulders.ts";
import {
  vikingGroundTopAt,
  vikingLandscapeMesh,
  vikingTerrainPieceIdAt,
  vikingTrafficWearAt,
} from "../games/make-a-mess/src/content/scenes/vikingVillageLandscape.ts";
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
  // 14 original groups plus the fjord jetty, the moving sky longship, its
  // stationary berth rigging and the shoreline fringe.
  assert.equal(vikingVillageCompilation.artifact.groupCount, 18);
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
  assert.equal(vikingVillageScene.boundaryRadius, 180);
  assert.equal(vikingVillageScene.skyRadius, 240);
  assert.equal(vikingVillageScene.cameraFar, 440);
});

test("new longhouse timbers rest separately against the west wall frame", () => {
  const timbers = vikingVillageScene.breakablePieces
    .filter((piece) => piece.id.includes("newhouse:timber") && piece.id.endsWith(":body"))
    .sort((left, right) => left.position[2] - right.position[2]);

  assert.equal(timbers.length, 4);
  for (let index = 1; index < timbers.length; index += 1) {
    assert.equal(timbers[index].position[2] - timbers[index - 1].position[2] >= 1.7, true);
  }
  for (const timber of timbers) {
    const axis = rotationAxes(timber.rotation).y;
    const endpoints = [-1, 1].map((side) => ({
      x: timber.position[0] + axis[0] * 4 * side,
      y: timber.position[1] + axis[1] * 4 * side,
    })).sort((left, right) => left.x - right.x);
    assert.equal(endpoints[0].x < -39.8 && endpoints[0].y < 0.36, true, timber.id);
    assert.equal(endpoints[1].x > -32.2 && endpoints[1].y > 1.4, true, timber.id);
  }
});

test("longship mooring stays visual while the brow only supports actors", () => {
  const dock = vikingVillageScene.breakablePieces.filter(
    (piece) => piece.clusterId === "viking-village:sky-longship-dock",
  );
  const lines = dock.filter((piece) =>
    piece.id.includes(":bow-line:") ||
    piece.id.includes(":moor-line:") ||
    piece.id.includes(":spring-line:"),
  );
  const brow = dock.find((piece) => piece.id.includes(":brow:"));

  assert.equal(lines.length, 5);
  assert.equal(lines.every((piece) => piece.intactCollider === false), true);
  assert.equal(lines.every((piece) => piece.destructible !== false), true);
  assert.equal(brow?.intactCollisionRole, "actor-only");
  assert.equal(brow?.destructible !== false, true);
});

test("mud, moss and wet tracks are masks on indestructible ground", () => {
  const landscape = vikingVillageScene.breakablePieces.filter(
    (piece) => piece.landscapeSurface === "viking-ground",
  );
  const earth = vikingVillageScene.breakablePieces.filter(
    (piece) => piece.clusterId.endsWith(":terrain-base"),
  );
  const ids = vikingVillageScene.breakablePieces.map((piece) => piece.id);

  assert.equal(landscape.length > 1_000, true);
  assert.equal(landscape.every((piece) => piece.shape === "groundTile"), true);
  assert.equal(landscape.every((piece) => piece.destructible === false), true);
  assert.equal(landscape.every((piece) => piece.intactVisible === false), true);
  assert.equal(landscape.every((piece) => piece.intactCollider === false), true);
  assert.equal(earth.length, landscape.length);
  assert.equal(earth.every((piece) => piece.destructible === false), true);
  assert.equal(vikingVillageDocument.landscapeVisual?.landscapeSurface, "viking-ground");
  assert.equal(vikingVillageDocument.landscapeVisual?.indexedCollider != null, true);
  assert.equal(vikingLandscapeMesh.triangleCount > 80_000, true);
  const heights = [
    vikingGroundTopAt(-17.3, 12.1),
    vikingGroundTopAt(-14.8, 13.6),
    vikingGroundTopAt(-11.9, 15.4),
    vikingGroundTopAt(24.2, 29.7),
    vikingGroundTopAt(31.6, -34.4),
  ];
  assert.equal(Math.max(...heights) - Math.min(...heights) > 0.025, true);
  assert.equal(vikingTrafficWearAt(0, 48) > vikingTrafficWearAt(11, 48), true);
  assert.equal(vikingTerrainPieceIdAt(0, 48)?.endsWith(":cover:0:50:piece"), true);
  for (const fakeOverlay of [
    ":main-track:",
    ":hall-track:",
    ":ground-growth:",
    ":moss:",
  ]) {
    assert.equal(ids.some((id) => id.includes(fakeOverlay)), false, fakeOverlay);
  }
});

test("natural rocks use the Viking field while cat blocks and built stone stay distinct", () => {
  const placements = vikingBoulderPlacements();
  const usedArchetypes = new Set(placements.map((placement) => placement.archetype));
  const natural = vikingVillageScene.breakablePieces.filter((piece) =>
    piece.id.includes(":viking-erratic:") || piece.id.includes(":viking-fieldstone:"),
  );
  const embedded = placements.filter((placement) => placement.id.startsWith("viking-fieldstone:"));
  const pathShoulder = placements.filter((placement) =>
    placement.id.startsWith("viking-fieldstone:path:"),
  );
  const companions = placements.filter((placement) =>
    placement.id.startsWith("viking-fieldstone:companion:"),
  );
  const ambient = placements.filter((placement) =>
    placement.id.startsWith("viking-fieldstone:ambient:"),
  );
  const survey = vikingVillageScene.breakablePieces.filter((piece) =>
    piece.id.includes(":survey-boulder:"),
  );
  const builtStone = vikingVillageScene.breakablePieces.filter((piece) =>
    piece.id.includes(":village-well:stone:"),
  );
  const ids = vikingVillageScene.breakablePieces.map((piece) => piece.id);

  assert.equal(placements.length, 104);
  assert.equal(embedded.length, 52);
  assert.equal(pathShoulder.length, 40);
  assert.equal(companions.length, 7);
  assert.equal(ambient.length, 5);
  for (const [cluster, count] of [
    ["north-spine", 6],
    ["well-shoulder", 8],
    ["commons-bend", 6],
    ["south-junction", 7],
    ["fisher-bend", 7],
    ["south-approach", 6],
  ]) {
    assert.equal(
      pathShoulder.filter((stone) =>
        stone.id.startsWith(`viking-fieldstone:path:${cluster}:`),
      ).length,
      count,
      `${cluster} remains a local deposit rather than uniform scatter`,
    );
  }
  assert.equal(
    Math.min(...companions.map((placement) => placement.scale[0]))
      > Math.max(...pathShoulder.map((placement) => placement.scale[0])),
    true,
    "occasional larger stones support the displaced path fragments",
  );
  for (const stone of pathShoulder) {
    const [x, , z] = stone.position;
    const localWear = vikingTrafficWearAt(x, z);
    let nearbyWear = 0;
    for (const radius of [1.1, 1.5, 1.9, 2.3, 2.7]) {
      for (let direction = 0; direction < 16; direction += 1) {
        const angle = direction * Math.PI / 8;
        nearbyWear = Math.max(
          nearbyWear,
          vikingTrafficWearAt(
            x + Math.cos(angle) * radius,
            z + Math.sin(angle) * radius,
          ),
        );
      }
    }
    assert.equal(localWear < 0.38, true, `${stone.id} stays out of the walked centre`);
    assert.equal(
      nearbyWear - localWear > 0.2,
      true,
      `${stone.id} belongs to a loose path shoulder`,
    );
  }
  assert.deepEqual(
    usedArchetypes,
    new Set(VIKING_BOULDER_ARCHETYPES.map((archetype) => archetype.id)),
  );
  assert.equal(natural.length, placements.length);
  assert.equal(natural.every((piece) => piece.intactVisible === false), true);
  assert.equal(natural.every((piece) => piece.destructible === false), true);
  assert.equal(survey.length, 2);
  assert.equal(survey.every((piece) => piece.intactVisible !== false), true);
  assert.equal(survey.every((piece) => piece.destructible === false), true);
  assert.equal(builtStone.length > 4, true);
  assert.equal(builtStone.every((piece) => piece.destructible !== false), true);
  for (const removedScatter of [":rock-pile:", ":pebble:", ":shore-stone:", ":sedge:"]) {
    assert.equal(ids.some((id) => id.includes(removedScatter)), false, removedScatter);
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

test("the konung and consort thrones face the hall and flank the ridge post", () => {
  for (const throne of ["konung-throne", "consort-throne"]) {
    const seat = vikingVillageScene.breakablePieces.find((piece) =>
      piece.id.endsWith(`:${throne}:seat`),
    );
    const back = vikingVillageScene.breakablePieces.find((piece) =>
      piece.id.endsWith(`:${throne}:back`),
    );
    assert.ok(seat, `${throne} seat present`);
    assert.ok(back, `${throne} back present`);
    assert.equal(
      back.position[2] < seat.position[2],
      true,
      `${throne} backrest stays behind the seat while it faces the hall`,
    );
  }

  const konung = vikingVillageScene.breakablePieces.find((piece) =>
    piece.id.endsWith(":konung-throne:seat"),
  );
  const consort = vikingVillageScene.breakablePieces.find((piece) =>
    piece.id.endsWith(":consort-throne:seat"),
  );
  // The high seats sit on opposite sides of the hall centre line, so the gable
  // ridge post reads as the pillar between them rather than blocking one throne.
  assert.equal(
    Math.sign(konung.position[0]) !== Math.sign(consort.position[0]),
    true,
    "the two thrones flank the centre line",
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
    // The door is a plank-board leaf: several vertical boards on one shared
    // hinge, so the whole створка swings when the player approaches.
    const doorBoards = vikingVillageScene.breakablePieces.filter(
      (piece) => piece.id.startsWith(`${prefix}door:board:`),
    );
    assert.equal(sideLog !== undefined, true, `${building} side wall present`);
    assert.equal(
      doorBoards.length >= 4,
      true,
      `${building} door is a multi-board plank leaf`,
    );
    assert.equal(
      doorBoards.every((board) => board.hinge !== undefined),
      true,
      `${building} door boards hang on a hinge`,
    );
    const expectedSideAxis = [Math.sin(yaw), 0, Math.cos(yaw)];
    assert.equal(
      absoluteDot(rotationAxes(sideLog.rotation).y, expectedSideAxis) > 0.999999,
      true,
      `${building} side logs follow the building yaw`,
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
