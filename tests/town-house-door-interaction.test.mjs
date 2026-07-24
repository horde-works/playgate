import assert from "node:assert/strict";
import test from "node:test";
import { ui } from "../app/i18n/dictionary.ts";
import {
  hingedDoorGroupKey,
  inwardDoorSwingSign,
  townHouseDoorPolicy,
} from "../games/make-a-mess/src/game/hingedGatePolicy.ts";
import { townScene } from "../games/make-a-mess/src/game/townScene.ts";

const townHouseDoors = [
  "door:front",
  "door:back",
  "h2:door:front",
  "h2:door:back",
  "h3:door:front",
  "h3:door:back",
];

test("only the six original two-storey house doors use friendly entry", () => {
  for (const doorId of townHouseDoors) {
    assert.deepEqual(townHouseDoorPolicy(doorId), { doorId });
  }

  assert.equal(townHouseDoorPolicy("hru:entry:door:2"), null);
  assert.equal(townHouseDoorPolicy("town:garages:gate:0:-1"), null);
  assert.equal(townHouseDoorPolicy("old-quarter:south-plot:door:front"), null);
});

test("each original house door is one seven-piece leaf on a shared hinge", () => {
  for (const doorId of townHouseDoors) {
    const pieces = townScene.breakablePieces.filter(
      (piece) => piece.clusterId === doorId,
    );

    assert.equal(pieces.length, 7, doorId);
    assert.equal(pieces.filter((piece) => piece.id.includes(":board:")).length, 5);
    assert.equal(pieces.filter((piece) => piece.id.includes(":brace:")).length, 2);
    assert.equal(pieces.every((piece) => piece.hinge), true);
    assert.equal(
      pieces.every(
        (piece) => hingedDoorGroupKey(piece.id, piece.clusterId) === doorId,
      ),
      true,
      `${doorId} groups as one leaf`,
    );

    const pivot = pieces[0].hinge.pivot;
    assert.equal(
      pieces.every((piece) =>
        piece.hinge.pivot.every((value, axis) => value === pivot[axis]),
      ),
      true,
      `${doorId} shares one pivot`,
    );

    const center = [
      pieces.reduce((sum, piece) => sum + piece.position[0], 0) / pieces.length,
      pieces.reduce((sum, piece) => sum + piece.position[1], 0) / pieces.length,
      pieces.reduce((sum, piece) => sum + piece.position[2], 0) / pieces.length,
    ];
    const normal = pieces[0].hinge.normal;
    const sign = inwardDoorSwingSign(center, pivot, normal);
    const angle = sign * 0.01;
    const radiusX = center[0] - pivot[0];
    const radiusZ = center[2] - pivot[2];
    const movedX = Math.cos(angle) * radiusX + Math.sin(angle) * radiusZ;
    const movedZ = -Math.sin(angle) * radiusX + Math.cos(angle) * radiusZ;
    const outwardMovement =
      (movedX - radiusX) * normal[0] + (movedZ - radiusZ) * normal[2];
    assert.equal(outwardMovement < 0, true, `${doorId} starts moving inward`);
  }
});

test("the friendly door event has copy in every interface language", () => {
  for (const language of ["en", "es", "ru"]) {
    assert.ok(ui[language]["hint.townDoor.eyebrow"]);
    assert.ok(ui[language]["hint.townDoor.title"]);
    assert.ok(ui[language]["hint.townDoor.action"]);
    assert.ok(ui[language]["hint.townDoor.actionTouch"]);
  }
});
