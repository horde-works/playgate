import assert from "node:assert/strict";
import test from "node:test";
import {
  horizontalGateDistance,
  inwardDoorSwingSign,
  VIKING_DOOR_APPROACH_RADIUS,
  VIKING_DOOR_RELEASE_RADIUS,
  VIKING_GATE_APPROACH_RADIUS,
  VIKING_GATE_RELEASE_RADIUS,
  vikingDoorPolicy,
  vikingGateLeafPolicy,
} from "../games/make-a-mess/src/game/hingedGatePolicy.ts";
import { vikingVillageScene } from "../games/make-a-mess/src/game/vikingVillageScene.ts";

test("both Viking gate leaves always swing inward", () => {
  const expectedSigns = new Map([
    ["north:-1", 1],
    ["north:1", -1],
    ["south:-1", -1],
    ["south:1", 1],
  ]);

  for (const [key, sign] of expectedSigns) {
    const [gate, side] = key.split(":");
    const policy = vikingGateLeafPolicy(
      `viking-village:palisade:${gate}:leaf:${side}`,
    );
    assert.ok(policy);
    assert.equal(policy.swingSign, sign, key);
  }
  assert.equal(vikingGateLeafPolicy("unrelated-scene:yard:gate"), null);
});

test("approach works from either side and release has closing hysteresis", () => {
  const center = [0, 2, 44];

  assert.equal(
    horizontalGateDistance([0, 1, 44 + VIKING_GATE_APPROACH_RADIUS], center),
    VIKING_GATE_APPROACH_RADIUS,
  );
  assert.equal(
    horizontalGateDistance([0, 5, 44 - VIKING_GATE_APPROACH_RADIUS], center),
    VIKING_GATE_APPROACH_RADIUS,
  );
  assert.equal(VIKING_GATE_RELEASE_RADIUS > VIKING_GATE_APPROACH_RADIUS, true);
  assert.equal(VIKING_DOOR_RELEASE_RADIUS > VIKING_DOOR_APPROACH_RADIUS, true);
});

test("only Viking building doors opt into requested entry", () => {
  assert.deepEqual(
    vikingDoorPolicy("viking-village:buildings:weaver:door"),
    { doorId: "viking-village:buildings:weaver:door" },
  );
  assert.equal(vikingDoorPolicy("viking-village:palisade:north:leaf:-1"), null);
  assert.equal(vikingDoorPolicy("unrelated-scene:buildings:house:door"), null);
});

test("a house door swings inward regardless of approach side", () => {
  assert.equal(
    inwardDoorSwingSign([0, 1.2, 0], [-1, 1.2, 0], [0, 0, 1]),
    1,
    "front door moves toward -Z",
  );
  assert.equal(
    inwardDoorSwingSign([0, 1.2, 0], [0, 1.2, -1], [1, 0, 0]),
    -1,
    "side door moves toward -X",
  );
});

test("the compiled village gates are paired compound leaves on outer jambs", () => {
  for (const gate of ["north", "south"]) {
    for (const side of [-1, 1]) {
      const prefix = `viking-village:palisade:${gate}:leaf:${side}:`;
      const pieces = vikingVillageScene.breakablePieces.filter((piece) =>
        piece.id.startsWith(prefix),
      );

      assert.equal(pieces.length, 7, `${gate} ${side} compound leaf`);
      assert.equal(pieces.filter((piece) => piece.id.includes(":board:")).length, 5);
      assert.equal(pieces.filter((piece) => piece.id.includes(":brace:")).length, 2);
      assert.equal(pieces.every((piece) => piece.hinge), true);

      const pivot = pieces[0].hinge.pivot;
      assert.equal(
        pieces.every((piece) => piece.hinge.pivot.every((value, axis) => value === pivot[axis])),
        true,
        `${gate} ${side} shares one hinge`,
      );

      const leafCenterX =
        pieces.reduce((sum, piece) => sum + piece.position[0], 0) / pieces.length;
      assert.equal(
        side < 0 ? pivot[0] < leafCenterX : pivot[0] > leafCenterX,
        true,
        `${gate} ${side} hinge sits at its outer post`,
      );
    }
  }
});

test("every house door clears its threshold without moving its top edge", () => {
  const groups = new Map();
  for (const piece of vikingVillageScene.breakablePieces) {
    if (!piece.hinge || !piece.id.includes(":buildings:") || !piece.id.includes(":door:")) {
      continue;
    }
    const key = piece.id.replace(/:(board|strap):\d+$/, "");
    const pieces = groups.get(key) ?? [];
    pieces.push(piece);
    groups.set(key, pieces);
  }

  assert.equal(groups.size, 8);
  for (const [key, pieces] of groups) {
    const boards = pieces.filter((piece) => piece.id.includes(":board:"));
    assert.equal(boards.length, 5, key);
    const bottom = Math.min(...boards.map((piece) => piece.position[1] - piece.size[1] / 2));
    const top = Math.max(...boards.map((piece) => piece.position[1] + piece.size[1] / 2));
    const hall = key.includes(":great-hall:");

    assert.equal(Math.abs(bottom - (hall ? 0.44 : 0.26)) < 1e-9, true, `${key} bottom`);
    assert.equal(Math.abs(top - (hall ? 2.4 : 2.3)) < 1e-9, true, `${key} top`);
  }
});
