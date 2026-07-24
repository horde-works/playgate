import assert from "node:assert/strict";
import test from "node:test";
import { breakablePieces } from "../games/make-a-mess/src/game/destructionScene.ts";
import {
  auditFurniturePlacement,
  collectDoorLeaves,
  collectFurnitureInstances,
  collectWindowPanes,
} from "../games/make-a-mess/src/content/furniturePlacement.ts";

// Габариты зданий первой карты: базовая хрущёвка x 12..34, z -8..-1 и её
// пять копий со сдвигами, плюс три старых дома.
const townFootprints = [
  { id: "k1", minX: 12, maxX: 34, minZ: -8, maxZ: -1 },
  { id: "k2", minX: 12, maxX: 34, minZ: -24, maxZ: -17 },
  { id: "k3", minX: 48, maxX: 70, minZ: -24, maxZ: -17 },
  { id: "k4", minX: -12, maxX: 10, minZ: -42, maxZ: -35 },
  { id: "k5", minX: 14, maxX: 36, minZ: -42, maxZ: -35 },
  { id: "k6", minX: 48, maxX: 70, minZ: 16, maxZ: 23 },
  { id: "h1", minX: -4.6, maxX: 4.6, minZ: -7.2, maxZ: 1.2 },
  { id: "h2", minX: 51.6, maxX: 60.4, minZ: -7, maxZ: 1 },
  { id: "h3", minX: 51.6, maxX: 60.4, minZ: -45, maxZ: -37 },
];

test("the town knows its furniture, windows and doors", () => {
  const furniture = collectFurnitureInstances(breakablePieces);
  const windows = collectWindowPanes(breakablePieces);
  const doors = collectDoorLeaves(breakablePieces);
  // Квартиры k1 (8 этажей-секций по ~13 предметов) + дворовая мебель.
  assert.equal(furniture.length > 80, true, `only ${furniture.length} furniture instances found`);
  assert.equal(windows.length > 100, true, `only ${windows.length} window panes found`);
  assert.equal(doors.length > 10, true, `only ${doors.length} door leaves found`);
});

test("town furniture placement passes the audit", () => {
  const violations = auditFurniturePlacement(breakablePieces, {
    footprints: townFootprints,
  });
  assert.deepEqual(violations, []);
});

// --- Синтетические сцены: аудит реально ловит нарушения --------------------

const syntheticWindow = {
  id: "wall:window",
  clusterId: "wall",
  material: "glass",
  shape: "glassPane",
  position: [10, 1.6, 0],
  size: [1.0, 1.1, 0.05],
  color: "#31404a",
};

function syntheticWardrobe(z) {
  return {
    id: "hru:furniture:0:0:wardrobe:test",
    clusterId: "hru:furniture:0",
    material: "wood",
    shape: "plank",
    position: [10, 0.9, z],
    size: [1.0, 1.8, 0.5],
    color: "#7e5233",
  };
}

const room = [{ id: "room", minX: 5, maxX: 15, minZ: -6, maxZ: 6 }];

test("audit flags a wardrobe parked in front of a window", () => {
  const violations = auditFurniturePlacement(
    [syntheticWindow, syntheticWardrobe(-0.6)],
    { footprints: room },
  );
  assert.equal(violations.length, 1);
  assert.equal(violations[0].rule, "blocks-window");
});

test("audit accepts the same wardrobe moved clear of the window", () => {
  const violations = auditFurniturePlacement(
    [syntheticWindow, syntheticWardrobe(-2.4)],
    { footprints: room },
  );
  assert.deepEqual(violations, []);
});

test("audit flags indoor furniture left in the open", () => {
  const bed = {
    id: "furn:iron-bed:street:rail:-1",
    clusterId: "test",
    material: "steel",
    shape: "steelSheet",
    position: [100, 0.4, 100],
    size: [0.05, 0.09, 1.9],
    color: "#33373a",
  };
  const violations = auditFurniturePlacement([bed], { footprints: room });
  assert.equal(violations.length, 1);
  assert.equal(violations[0].rule, "wrong-zone");
});

test("audit flags furniture parked across a doorway", () => {
  const door = {
    id: "flat:door",
    clusterId: "doors",
    material: "wood",
    shape: "plank",
    position: [10, 1.0, 0],
    size: [0.1, 1.95, 0.86],
    color: "#6e4a2c",
    hinge: { pivot: [10, 1.0, -0.43], direction: [0, 0, 1], normal: [1, 0, 0] },
  };
  const desk = {
    id: "furn:writer-desk:hall:pedestal:-1",
    clusterId: "test",
    material: "wood",
    shape: "plank",
    position: [10.5, 0.36, 0.1],
    size: [0.4, 0.72, 0.52],
    color: "#54301f",
  };
  const violations = auditFurniturePlacement([door, desk], { footprints: room });
  assert.equal(violations.length, 1);
  assert.equal(violations[0].rule, "blocks-doorway");
});
