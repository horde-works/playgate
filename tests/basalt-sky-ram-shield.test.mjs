import assert from "node:assert/strict";
import test from "node:test";
import {
  BASALT_FORCE_FIELD_CELL_CAPACITY,
  basaltForceFieldCellDistance,
  damageBasaltForceField,
  emptyBasaltForceFieldDamage,
  intersectBasaltForceField,
} from "../games/make-a-mess/src/game/basaltForceField.ts";
import {
  BASALT_SKY_RAM_SHIELD_CELLS,
  BASALT_SKY_RAM_SHIELD_PROJECTION,
  basaltSkyRamShieldPose,
  basaltSkyRamScreenHalfWidth,
} from "../games/make-a-mess/src/game/basaltSkyRamShield.ts";
import {
  BASALT_SKY_RAM_CLUSTER_ID,
  BASALT_SKY_RAM_MOORING_POINT,
  BASALT_SKY_RAM_ORIGIN,
} from "../games/make-a-mess/src/game/basaltSkyRam.ts";
import { basaltStrongholdScene } from "../games/make-a-mess/src/game/basaltStrongholdScene.ts";

const ship = basaltStrongholdScene.breakablePieces.filter(
  (piece) => piece.clusterId === BASALT_SKY_RAM_CLUSTER_ID,
);
const RAM_Z = BASALT_SKY_RAM_ORIGIN[2];
const REST = basaltSkyRamShieldPose([0, 0, 0], [0, 0, 0, 1]);

/** Ship-local: a along the hull, b lateral, y world height. */
function shipLocal(piece) {
  return {
    a: piece.position[2] - RAM_Z,
    b: piece.position[0],
    y: piece.position[1],
    sa: piece.size[2],
    sb: piece.size[0],
    sy: piece.size[1],
  };
}

test("the screen stands outside every piece it is meant to cover", () => {
  const parts = ship.map(shipLocal);
  let worstClearance = Infinity;
  let offender = null;
  for (const cell of BASALT_SKY_RAM_SHIELD_CELLS) {
    const a = cell.centre[2];
    const worldY = cell.centre[1] + BASALT_SKY_RAM_ORIGIN[1];
    const half = Math.abs(cell.centre[0]);
    for (const part of parts) {
      if (a < part.a - part.sa / 2 || a > part.a + part.sa / 2) continue;
      if (
        worldY < part.y - part.sy / 2 ||
        worldY > part.y + part.sy / 2
      ) continue;
      const clearance = half - (Math.abs(part.b) + part.sb / 2);
      if (clearance < worstClearance) {
        worstClearance = clearance;
        offender = { cell: cell.id, part: part.b, a, worldY };
      }
    }
  }
  assert.equal(
    worstClearance > 0.1,
    true,
    `screen cuts into the hull: clearance ${worstClearance.toFixed(3)} m ` +
      `at ${JSON.stringify(offender)}`,
  );
});

test("the screen covers the engine nacelles and the steel belt, not the gallery", () => {
  const covered = (piece) => {
    const local = shipLocal(piece);
    const worldY = local.y;
    const half = basaltSkyRamScreenHalfWidth(local.a);
    return (
      BASALT_SKY_RAM_SHIELD_CELLS.some(
        (cell) =>
          Math.abs(cell.centre[2] - local.a) < 1.2 &&
          Math.abs(cell.centre[1] + BASALT_SKY_RAM_ORIGIN[1] - worldY) < 1.2,
      ) && half > Math.abs(local.b)
    );
  };
  const engineCores = ship.filter((piece) => /:engine:-?1:core$/.test(piece.id));
  assert.equal(engineCores.length, 2, "both engine cores must exist");
  for (const core of engineCores) {
    assert.equal(covered(core), true, `${core.id} is not behind the screen`);
  }
  // The gallery floor hangs below the band and stays deliberately exposed.
  const galleryFloor = ship.filter(
    (piece) => piece.id.includes(":gallery:") && piece.position[1] < 6,
  );
  assert.equal(galleryFloor.length > 0, true);
  assert.equal(
    galleryFloor.some(covered),
    false,
    "the open gallery must not be shielded",
  );
});

test("a rocket at an engine is stopped, and the same shot from inside is not", () => {
  const damage = emptyBasaltForceFieldDamage(BASALT_SKY_RAM_SHIELD_PROJECTION);
  const engine = ship.find((piece) => piece.id === `${BASALT_SKY_RAM_CLUSTER_ID}:engine:1:core`);
  assert.ok(engine, "starboard engine core");
  const target = [engine.position[0], engine.position[1], engine.position[2]];
  const outside = [target[0] + 40, target[1], target[2]];
  const hit = intersectBasaltForceField(
    BASALT_SKY_RAM_SHIELD_PROJECTION,
    outside,
    target,
    damage,
    0,
    REST,
  );
  assert.ok(hit, "a rocket from abeam must meet the screen");
  // The invariant is not a round number of metres: the rocket must be stopped
  // on the authored screen surface, which itself stands outside the widest
  // structure at that station. Anything nearer means the plate has sunk in.
  const station = engine.position[2] - RAM_Z;
  const surface = basaltSkyRamScreenHalfWidth(station);
  assert.equal(
    Math.abs(hit.point[0] - surface) < 0.15,
    true,
    `stopped at ${hit.point[0].toFixed(2)}, screen surface is ${surface.toFixed(2)}`,
  );
  const widestHere = Math.max(
    ...ship
      .map(shipLocal)
      .filter((part) => Math.abs(part.a - station) < 1)
      .map((part) => Math.abs(part.b) + part.sb / 2),
  );
  assert.equal(
    surface > widestHere,
    true,
    `screen ${surface.toFixed(2)} is inside the hull ${widestHere.toFixed(2)}`,
  );
  // Leaving is free: the same plate deliberately passes outward travel.
  assert.equal(
    intersectBasaltForceField(
      BASALT_SKY_RAM_SHIELD_PROJECTION,
      target,
      outside,
      damage,
      0,
      REST,
    ),
    null,
  );
});

test("the screen travels with the hull: moved and yawed, it still covers", () => {
  const damage = emptyBasaltForceFieldDamage(BASALT_SKY_RAM_SHIELD_PROJECTION);
  const engine = ship.find((piece) => piece.id === `${BASALT_SKY_RAM_CLUSTER_ID}:engine:1:core`);
  const localTarget = [
    engine.position[0] - BASALT_SKY_RAM_ORIGIN[0],
    engine.position[1] - BASALT_SKY_RAM_ORIGIN[1],
    engine.position[2] - BASALT_SKY_RAM_ORIGIN[2],
  ];
  // A quarter turn to port and eighty metres away, at altitude.
  const yaw = Math.PI / 2;
  const orientation = [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)];
  const offset = [62, 24, -37];
  const pose = basaltSkyRamShieldPose(offset, orientation);
  const rotate = ([x, y, z]) => [
    x * Math.cos(yaw) + z * Math.sin(yaw),
    y,
    -x * Math.sin(yaw) + z * Math.cos(yaw),
  ];
  const worldTarget = rotate(localTarget).map(
    (value, axis) => value + pose.position[axis],
  );
  // Abeam of the MOVED ship: its starboard now faces world -z.
  const abeam = worldTarget.map((value, axis) => value + [0, 0, -40][axis]);
  const hit = intersectBasaltForceField(
    BASALT_SKY_RAM_SHIELD_PROJECTION,
    abeam,
    worldTarget,
    damage,
    0,
    pose,
  );
  assert.ok(hit, "the screen must have travelled with the hull");
  // Same invariant as at rest, expressed after the rotation: the plate must
  // sit on its authored surface, now measured along the ship's new beam.
  const station = engine.position[2] - RAM_Z;
  const surface = basaltSkyRamScreenHalfWidth(station);
  const reach = Math.hypot(
    hit.point[0] - worldTarget[0],
    hit.point[2] - worldTarget[2],
  );
  const expected = surface - Math.abs(engine.position[0]);
  assert.equal(
    Math.abs(reach - expected) < 0.2,
    true,
    `screen met ${reach.toFixed(2)} m out; the hull frame puts it at ` +
      `${expected.toFixed(2)} m — the projection did not follow the pose`,
  );
  // And nothing of it is left behind at the berth.
  assert.equal(
    intersectBasaltForceField(
      BASALT_SKY_RAM_SHIELD_PROJECTION,
      [engine.position[0] + 40, engine.position[1], engine.position[2]],
      [engine.position[0], engine.position[1], engine.position[2]],
      damage,
      0,
      pose,
    ),
    null,
    "a screen left standing at the empty berth is a ghost",
  );
});

test("a blast on one side never weakens the other side through the hull", () => {
  const port = BASALT_SKY_RAM_SHIELD_CELLS.find(
    (cell) => cell.network === "ram-port",
  );
  const starboard = BASALT_SKY_RAM_SHIELD_CELLS.find(
    (cell) => cell.network === "ram-starboard",
  );
  assert.ok(port && starboard);
  assert.equal(
    basaltForceFieldCellDistance(port, starboard),
    Number.POSITIVE_INFINITY,
  );
  const damage = damageBasaltForceField(
    BASALT_SKY_RAM_SHIELD_PROJECTION,
    emptyBasaltForceFieldDamage(BASALT_SKY_RAM_SHIELD_PROJECTION),
    port.index,
    "rocket",
  );
  const starboardTouched = BASALT_SKY_RAM_SHIELD_CELLS.filter(
    (cell) => cell.network === "ram-starboard",
  ).some((cell) => damage[cell.index] > 0);
  assert.equal(starboardTouched, false);
});

test("three rockets open a hole in the screen, exactly as on the wall", () => {
  const engine = ship.find((piece) => piece.id === `${BASALT_SKY_RAM_CLUSTER_ID}:engine:1:core`);
  const target = [engine.position[0], engine.position[1], engine.position[2]];
  const outside = [target[0] + 40, target[1], target[2]];
  let damage = emptyBasaltForceFieldDamage(BASALT_SKY_RAM_SHIELD_PROJECTION);
  const first = intersectBasaltForceField(
    BASALT_SKY_RAM_SHIELD_PROJECTION, outside, target, damage, 0, REST,
  );
  assert.ok(first);
  for (let shot = 0; shot < BASALT_FORCE_FIELD_CELL_CAPACITY; shot += 1) {
    assert.ok(
      intersectBasaltForceField(
        BASALT_SKY_RAM_SHIELD_PROJECTION, outside, target, damage, 0, REST,
      ),
      `shot ${shot + 1} must still meet the screen`,
    );
    damage = damageBasaltForceField(
      BASALT_SKY_RAM_SHIELD_PROJECTION, damage, first.cellIndex, "rocket",
    );
  }
  assert.equal(
    intersectBasaltForceField(
      BASALT_SKY_RAM_SHIELD_PROJECTION, outside, target, damage, 0, REST,
    ),
    null,
    "the fourth rocket must reach the nacelle",
  );
});


test("the bow cap closes the one hole two side screens leave", () => {
  const damage = emptyBasaltForceFieldDamage(BASALT_SKY_RAM_SHIELD_PROJECTION);
  // All the lift lives in the skin, and its densest crowd is the nose cone.
  const nose = ship
    .filter((piece) => piece.id.includes(":skin:"))
    .sort((a, b) => b.position[2] - a.position[2])[0];
  const target = [nose.position[0], nose.position[1], nose.position[2]];
  const approaches = {
    "dead ahead": [target[0], target[1], target[2] + 45],
    "from above the bow": [target[0], target[1] + 18, target[2] + 42],
    "off the bow quarter": [target[0] + 12, target[1] + 4, target[2] + 40],
  };
  for (const [label, from] of Object.entries(approaches)) {
    const hit = intersectBasaltForceField(
      BASALT_SKY_RAM_SHIELD_PROJECTION, from, target, damage, 0, REST,
    );
    assert.ok(hit, `a rocket ${label} still reaches the envelope`);
    const reach = Math.hypot(
      hit.point[0] - target[0], hit.point[1] - target[1], hit.point[2] - target[2],
    );
    assert.equal(
      reach > 1,
      true,
      `${label}: stopped only ${reach.toFixed(2)} m from the gas`,
    );
    assert.equal(hit.cellId.includes("ram-bow"), true, `${label} met a side plate`);
  }
});

test("the cap stops above the mooring node so the berth can still take the nose", () => {
  // Structure is not gas: the ram beak and the capture node are deliberately
  // left outside, or the jaw would close through the projection every docking.
  const local = [
    BASALT_SKY_RAM_MOORING_POINT[0],
    BASALT_SKY_RAM_MOORING_POINT[1] - BASALT_SKY_RAM_ORIGIN[1],
    BASALT_SKY_RAM_MOORING_POINT[2] - BASALT_SKY_RAM_ORIGIN[2],
  ];
  const capCells = BASALT_SKY_RAM_SHIELD_CELLS.filter(
    (cell) => cell.network === "ram-bow",
  );
  assert.equal(capCells.length > 100, true);
  const lowest = Math.min(...capCells.map((cell) => cell.centre[1]));
  assert.equal(
    local[1] < lowest,
    true,
    `mooring node at ${local[1].toFixed(2)} is not below the cap rim ${lowest.toFixed(2)}`,
  );
});
