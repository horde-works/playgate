import assert from "node:assert/strict";
import test from "node:test";
import {
  BASALT_FORCE_FIELD_APPROACH_BULGE,
  BASALT_FORCE_FIELD_APPROACH_RANGE,
  BASALT_FORCE_FIELD_BLOOM_THRESHOLD,
  BASALT_FORCE_FIELD_CELLS,
  BASALT_FORCE_FIELD_CELL_CAPACITY,
  BASALT_FORCE_FIELD_IMPULSES,
  BASALT_FORCE_FIELD_IMPULSE_LIFETIME,
  BASALT_FORCE_FIELD_MAX_IMPACTS,
  BASALT_FORCE_FIELD_PRESS_REACH,
  BASALT_FORCE_FIELD_STONE_CLEARANCE,
  basaltForceFieldBlocksSegment,
  basaltForceFieldCellDistance,
  basaltForceFieldCoreIntensity,
  basaltForceFieldDamageFraction,
  basaltForceFieldPeakDeflection,
  basaltForceFieldWorstDeflection,
  createBasaltForceFieldImpactBuffer,
  createBasaltForceFieldPressBuffer,
  damageBasaltForceField,
  emptyBasaltForceFieldDamage,
  expireBasaltForceFieldImpacts,
  intersectBasaltForceField,
  nearestBasaltForceFieldPlate,
  recordBasaltForceFieldImpact,
  setBasaltForceFieldPress,
} from "../games/make-a-mess/src/game/basaltForceField.ts";

const SPAWN = [0, 1.25, 31];

test("small directed hexes follow the battlement and the tower instead of a dome", () => {
  const damage = emptyBasaltForceFieldDamage();
  const wallCells = BASALT_FORCE_FIELD_CELLS.filter(
    (cell) => cell.network === "wall",
  );
  const towerCells = BASALT_FORCE_FIELD_CELLS.filter(
    (cell) => cell.network === "tower",
  );
  // Founded below the soil, not trimmed at it — see the footing test.
  assert.equal(wallCells.length, 322);
  assert.equal(towerCells.length, 602);
  assert.equal(
    BASALT_FORCE_FIELD_CELLS.every((cell) => cell.visualRadius <= 1.05),
    true,
    "projection cells must stay substantially smaller than the old dome tiles",
  );
  assert.equal(wallCells.every((cell) => cell.centre[2] > 2.2), true);
  assert.equal(
    wallCells.some((cell) => cell.centre[1] < -3),
    true,
    "the curtain must be founded underground, not cut off at the soil",
  );
  assert.equal(towerCells.every((cell) => cell.centre[2] < -27), true);
  assert.equal(
    BASALT_FORCE_FIELD_CELLS.every((cell) => cell.normal[2] > 0.7),
    true,
    "every protected face must point generally toward spawn",
  );

  for (const protectedPoint of [
    [0, 5, 0],
    [-25, 7, 0],
    [25, 7, 0],
    [0, 30, -36],
    [0, 44, -36],
  ]) {
    assert.ok(
      intersectBasaltForceField(SPAWN, protectedPoint, damage),
      `${protectedPoint.join(",")} is exposed from spawn`,
    );
  }
});

test("the same cell protects inward and deliberately passes outward", () => {
  const damage = emptyBasaltForceFieldDamage();
  const fortress = [0, 5, 0];
  assert.equal(basaltForceFieldBlocksSegment(SPAWN, fortress, damage), true);
  assert.equal(basaltForceFieldBlocksSegment(fortress, SPAWN, damage), false);
});

test("an arriving actor stops one capsule radius outside but can leave", () => {
  let damage = emptyBasaltForceFieldDamage();
  const outside = [0, 1.25, 4.2];
  const inside = [0, 1.25, 2.7];
  const clearance = 0.385;
  const inward = intersectBasaltForceField(
    outside,
    inside,
    damage,
    clearance,
  );
  assert.ok(inward);
  assert.equal(
    Math.abs(inward.point[2] - (3.45 + clearance)) < 1e-6,
    true,
    "the actor centre must stop before its capsule enters the projection",
  );
  assert.equal(
    intersectBasaltForceField(inside, outside, damage, clearance),
    null,
    "the same projected plate must not imprison an actor leaving the fortress",
  );

  damage = damageBasaltForceField(
    damage,
    inward.cellIndex,
    "rocket",
  );
  assert.ok(
    intersectBasaltForceField(outside, inside, damage, clearance),
    "a visible but damaged cell must remain impassable",
  );
  damage = damageBasaltForceField(damage, inward.cellIndex, "rocket");
  damage = damageBasaltForceField(damage, inward.cellIndex, "rocket");
  assert.equal(
    intersectBasaltForceField(outside, inside, damage, clearance),
    null,
    "only a destroyed cell becomes a passage",
  );
});

test("three direct rockets open one real hole after absorbing the third blast", () => {
  const target = [0, 5, 0];
  let damage = emptyBasaltForceFieldDamage();
  const originalHit = intersectBasaltForceField(SPAWN, target, damage);
  assert.ok(originalHit);

  for (let strike = 1; strike <= 3; strike += 1) {
    // The cell is still alive when this strike arrives, including strike 3.
    assert.ok(intersectBasaltForceField(SPAWN, target, damage));
    damage = damageBasaltForceField(damage, originalHit.cellIndex, "rocket");
    assert.equal(
      damage[originalHit.cellIndex],
      strike,
      "one rocket must deliver exactly one direct capacity unit",
    );
  }

  assert.equal(
    damage[originalHit.cellIndex],
    BASALT_FORCE_FIELD_CELL_CAPACITY,
  );
  assert.equal(intersectBasaltForceField(SPAWN, target, damage), null);
});

test("rocket pressure reveals weaker first and second rings on shield topology", () => {
  const damage = emptyBasaltForceFieldDamage();
  const struck = BASALT_FORCE_FIELD_CELLS.find(
    (cell) => cell.network === "wall" && cell.q === 0 && cell.r === 3,
  );
  assert.ok(struck);
  const next = damageBasaltForceField(damage, struck.index, "rocket");
  const firstRing = BASALT_FORCE_FIELD_CELLS.find(
    (cell) => basaltForceFieldCellDistance(struck, cell) === 1,
  );
  const secondRing = BASALT_FORCE_FIELD_CELLS.find(
    (cell) => basaltForceFieldCellDistance(struck, cell) === 2,
  );
  assert.ok(firstRing);
  assert.ok(secondRing);
  assert.equal(next[struck.index], 1);
  assert.equal(Math.abs(next[firstRing.index] - 0.22) < 1e-6, true);
  assert.equal(Math.abs(next[secondRing.index] - 0.065) < 1e-6, true);
  assert.equal(
    basaltForceFieldDamageFraction(next, firstRing.index) > 0,
    true,
    "blast-weakened neighbours must become visible",
  );
});

test("machine-gun energy marks only the directly struck projection", () => {
  const damage = emptyBasaltForceFieldDamage();
  const struck = BASALT_FORCE_FIELD_CELLS.find(
    (cell) => cell.network === "wall" && cell.q === 0 && cell.r === 3,
  );
  assert.ok(struck);
  const next = damageBasaltForceField(damage, struck.index, "machineGun");
  assert.equal(Math.abs(next[struck.index] - 0.035) < 1e-6, true);
  assert.equal(
    BASALT_FORCE_FIELD_CELLS
      .filter((cell) => cell.index !== struck.index)
      .every((cell) => next[cell.index] === 0),
    true,
  );
});

test("a rocket core outshines the bloom threshold, a burst deliberately does not", () => {
  // Light that never crosses the pipeline threshold spills onto nothing, and a
  // field that lights nothing around itself reads as paint on the stone.
  assert.equal(
    basaltForceFieldCoreIntensity("rocket") > BASALT_FORCE_FIELD_BLOOM_THRESHOLD,
    true,
    "a rocket must emit light, not colour",
  );
  assert.equal(
    basaltForceFieldCoreIntensity("machineGun")
      < BASALT_FORCE_FIELD_BLOOM_THRESHOLD,
    true,
    "single bullets must stay below the glow, or every burst becomes a flare",
  );
});

test("the membrane never reaches the stone behind it", () => {
  // Measured clearance is 1.14 m at the tightest point of the curtain; a dish
  // deeper than that punches into the wall and is cut off by the depth test.
  for (const kind of ["rocket", "grenade", "machineGun"]) {
    assert.equal(
      basaltForceFieldPeakDeflection(kind)
        < BASALT_FORCE_FIELD_STONE_CLEARANCE * 0.5,
      true,
      `${kind} deflection must keep a wide margin to the fortress stone`,
    );
  }
  assert.equal(
    basaltForceFieldWorstDeflection() < BASALT_FORCE_FIELD_STONE_CLEARANCE,
    true,
    "a rocket landing on a body already leaning on the shield must still not "
      + "drive the membrane into the wall",
  );
});

test("no capsule height finds a notch along the foot of the curtain", () => {
  // A scalar cut at the soil left the bottom row saw-toothed: 679 of these
  // probes walked straight through, up to a capsule centre of 0.80 m.
  const damage = emptyBasaltForceFieldDamage();
  const capsule = 0.385;
  let leaks = 0;
  for (let x = -30; x <= 30; x += 0.25) {
    for (let y = 0.2; y <= 3; y += 0.1) {
      if (!intersectBasaltForceField([x, y, 8], [x, y, -2], damage, capsule)) {
        leaks += 1;
      }
    }
  }
  assert.equal(leaks, 0, "the foot of the curtain must not leak at any height");
});

test("the field answers an approach before it is ever touched", () => {
  const damage = emptyBasaltForceFieldDamage();
  // Standing short of the curtain, in front of the gatehouse.
  const outside = [0, 5, 3.45 + 0.4];
  const near = nearestBasaltForceFieldPlate(
    outside,
    damage,
    BASALT_FORCE_FIELD_APPROACH_RANGE,
  );
  assert.ok(near, "a plate within reach must answer");
  assert.equal(Math.abs(near.distance - 0.4) < 1e-6, true);
  assert.equal(
    Math.abs(near.point[2] - 3.45) < 0.05,
    true,
    "the load lands on the plate, not on the body carrying it",
  );

  assert.equal(
    nearestBasaltForceFieldPlate(outside, damage, 0.2),
    null,
    "nothing may glow before the approach range is entered",
  );
  assert.equal(
    nearestBasaltForceFieldPlate([0, 5, 3.45 - 0.4], damage, 2),
    null,
    "leaving the fortress must stay silent: the defended side only",
  );
});

test("a sustained load bends the membrane without spending capacity", () => {
  let damage = emptyBasaltForceFieldDamage();
  const buffer = createBasaltForceFieldPressBuffer();
  const point = [0, 5, 3.45];

  setBasaltForceFieldPress(buffer, 0, point, 1);
  assert.equal(
    Math.abs(buffer.data[1] - BASALT_FORCE_FIELD_PRESS_REACH) < 1e-6,
    true,
  );
  assert.equal(buffer.data[0], 1);
  // An approach is the same channel with the opposite sign.
  setBasaltForceFieldPress(buffer, 0, point, -BASALT_FORCE_FIELD_APPROACH_BULGE);
  assert.equal(buffer.data[0] < 0, true);
  setBasaltForceFieldPress(buffer, 0, null, 1);
  assert.equal(buffer.data[0], 0, "releasing must leave no bowl behind");

  // Leaning is not an attack: no amount of it opens a cell.
  const cell = intersectBasaltForceField([0, 1.25, 31], point, damage);
  assert.ok(cell);
  for (let step = 0; step < 500; step += 1) {
    setBasaltForceFieldPress(buffer, 0, point, 1);
  }
  assert.equal(
    damage[cell.cellIndex],
    0,
    "pressing must never spend the capacity that rockets are for",
  );
  damage = damageBasaltForceField(damage, cell.cellIndex, "rocket");
  assert.equal(damage[cell.cellIndex], 1, "only weapons spend it");
});

test("impulses recycle the oldest slot and retire once spent", () => {
  const buffer = createBasaltForceFieldImpactBuffer();
  const rocket = BASALT_FORCE_FIELD_IMPULSES.rocket;
  const point = [1, 2, 3];
  for (let index = 0; index < BASALT_FORCE_FIELD_MAX_IMPACTS; index += 1) {
    assert.equal(
      recordBasaltForceFieldImpact(buffer, point, rocket, index),
      index,
    );
  }
  assert.equal(
    recordBasaltForceFieldImpact(
      buffer,
      [4, 5, 6],
      BASALT_FORCE_FIELD_IMPULSES.grenade,
      99,
    ),
    0,
    "the seventh impulse must take over the oldest slot",
  );
  assert.deepEqual(Array.from(buffer.points.slice(0, 3)), [4, 5, 6]);
  assert.equal(buffer.data[0], 99);

  assert.equal(
    expireBasaltForceFieldImpacts(
      buffer,
      99 + BASALT_FORCE_FIELD_IMPULSE_LIFETIME + 0.01,
    ),
    true,
  );
  assert.equal(
    buffer.data.filter((_, index) => index % 4 === 1).every((s) => s === 0),
    true,
    "a shield at rest must leave both shader loops with nothing to do",
  );
});

test("a grenade is absorbed and marks the shield at its lower energy", () => {
  const damage = emptyBasaltForceFieldDamage();
  const struck = BASALT_FORCE_FIELD_CELLS.find(
    (cell) => cell.network === "wall" && cell.q === 0 && cell.r === 3,
  );
  assert.ok(struck);
  const next = damageBasaltForceField(damage, struck.index, "grenade");
  const firstRing = BASALT_FORCE_FIELD_CELLS.find(
    (cell) => basaltForceFieldCellDistance(struck, cell) === 1,
  );
  assert.ok(firstRing);
  assert.equal(Math.abs(next[struck.index] - 0.04) < 1e-6, true);
  assert.equal(Math.abs(next[firstRing.index] - 0.0088) < 1e-6, true);
});
