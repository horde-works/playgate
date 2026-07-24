import assert from "node:assert/strict";
import test from "node:test";
import { breakablePieces } from "../games/make-a-mess/src/game/destructionScene.ts";

// Типовые планировки k1: каждая квартира укомплектована по правилам комнат,
// мебель не прорастает сквозь перегородки, на каждом дверном проёме висит
// полотно. Контракт генератора khrushchevkaInterior.

const plannedPieces = breakablePieces.filter((piece) =>
  piece.id.startsWith("hru:furniture:") && !piece.id.startsWith("k"));
const partitions = breakablePieces.filter((piece) =>
  piece.id.includes(":partition:"));
const innerDoors = breakablePieces.filter((piece) =>
  piece.id.includes("hru:innerdoor:"));

const flats = new Map();
for (const piece of plannedPieces) {
  const match = piece.id.match(/^hru:furniture:(\d+):(\d+):(one|two):/);
  if (!match) continue;
  const key = `${match[1]}:${match[2]}:${match[3]}`;
  if (!flats.has(key)) flats.set(key, []);
  flats.get(key).push(piece);
}

test("k1 has 16 planned flats", () => {
  assert.equal(flats.size, 16);
});

test("every planned flat is furnished by room rules", () => {
  for (const [key, pieces] of flats) {
    const has = (marker) => pieces.some((piece) => piece.id.includes(marker));
    assert.equal(has("stove:kitchen") || has("-stove:kitchen"), true, `${key}: stove`);
    assert.equal(has("fridge-moskva:kitchen") || has("fridge-ribbed:kitchen"), true, `${key}: fridge`);
    assert.equal(has(":bath:tub"), true, `${key}: bath tub`);
    assert.equal(
      has("soviet-sofa:living") || has("channel-sofa:living") || has("iron-bed:living"),
      true, `${key}: sofa`);
    if (key.endsWith(":two")) {
      assert.equal(has("iron-bed:bedroom") || has("slat-bed:bedroom"), true, `${key}: bed`);
      assert.equal(has("writer-desk:bedroom"), true, `${key}: desk`);
    } else {
      assert.equal(has("wall-unit:living"), true, `${key}: wall unit`);
    }
  }
});

test("furniture never pierces partitions", () => {
  const aabb = (piece) => {
    const yaw = piece.rotation?.[1] ?? 0;
    const cos = Math.abs(Math.cos(yaw));
    const sin = Math.abs(Math.sin(yaw));
    const halfX = (piece.size[0] * cos + piece.size[2] * sin) / 2;
    const halfZ = (piece.size[0] * sin + piece.size[2] * cos) / 2;
    return {
      x0: piece.position[0] - halfX, x1: piece.position[0] + halfX,
      y0: piece.position[1] - piece.size[1] / 2, y1: piece.position[1] + piece.size[1] / 2,
      z0: piece.position[2] - halfZ, z1: piece.position[2] + halfZ,
    };
  };
  const walls = partitions.map(aabb);
  const offenders = [];
  for (const piece of plannedPieces) {
    const a = aabb(piece);
    for (const wall of walls) {
      const overlapX = Math.min(a.x1, wall.x1) - Math.max(a.x0, wall.x0);
      const overlapY = Math.min(a.y1, wall.y1) - Math.max(a.y0, wall.y0);
      const overlapZ = Math.min(a.z1, wall.z1) - Math.max(a.z0, wall.z0);
      if (overlapX > 0.03 && overlapY > 0.03 && overlapZ > 0.03) {
        offenders.push(piece.id);
        break;
      }
    }
  }
  assert.deepEqual(offenders, []);
});

test("every planned doorway carries a leaf", () => {
  // 4 полотна на этаж-секцию (комната и санузел однушки, санузел и
  // спальня двушки) x 4 этажа x 2 секции.
  assert.equal(innerDoors.length, 32);
  for (const door of innerDoors) {
    assert.equal(door.hinge !== undefined, true, `${door.id} lacks hinge`);
  }
});
