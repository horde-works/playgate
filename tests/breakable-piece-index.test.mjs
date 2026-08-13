import assert from "node:assert/strict";
import test from "node:test";
import {
  createBreakablePieceIndex,
  distanceToPiece,
} from "../games/make-a-mess/src/game/breakablePieceIndex.ts";
import { townScene } from "../games/make-a-mess/src/game/townScene.ts";
import { TOWN_HEXACOPTER_CLUSTER_ID } from "../games/make-a-mess/src/game/townHexacopter.ts";

const world = townScene.breakablePieces.filter(
  (piece) => piece.clusterId !== TOWN_HEXACOPTER_CLUSTER_ID,
);
const index = createBreakablePieceIndex(world);

test("точка внутри куска находит именно его", () => {
  let checked = 0;
  for (const piece of world.slice(0, 400)) {
    const found = index.at(piece.position, 0.05);
    assert.ok(found, `в центре ${piece.id} ничего не найдено`);
    assert.equal(distanceToPiece(found, piece.position), 0);
    checked += 1;
  }
  assert.ok(checked > 100);
});

test("повёрнутый кусок опознаётся по своей ориентации", () => {
  const turned = world.find(
    (piece) => piece.rotation && piece.rotation.some((angle) => Math.abs(angle) > 0.2),
  );
  assert.ok(turned, "в городе нет повёрнутых кусков");
  assert.equal(distanceToPiece(turned, turned.position), 0);
  const found = index.at(turned.position, 0.05);
  assert.ok(found);
});

test("в пустом небе не находится ничего", () => {
  assert.equal(index.at([0, 400, 0], 0.6), null);
});

test("фильтр отсекает нежелательные куски", () => {
  const sample = world[0];
  const found = index.at(sample.position, 0.05, (piece) => piece.id !== sample.id);
  assert.notEqual(found?.id, sample.id);
});

test("луч находит первый занятый объём без обхода render mesh", () => {
  const pieces = [
    {
      id: "near",
      clusterId: "test",
      material: "brick",
      color: "#fff",
      shape: "box",
      position: [0, 0, 4],
      size: [2, 2, 2],
    },
    {
      id: "far",
      clusterId: "test",
      material: "brick",
      color: "#fff",
      shape: "box",
      position: [0, 0, 9],
      size: [2, 2, 2],
    },
  ];
  const rayIndex = createBreakablePieceIndex(pieces);
  const hit = rayIndex.raycast([0, 0, 0], [0, 0, 1], 20);
  assert.equal(hit?.piece.id, "near");
  assert.equal(hit?.distance, 3);
  assert.deepEqual(hit?.point, [0, 0, 3]);
  assert.deepEqual(hit?.normal, [0, 0, -1]);

  const continuation = rayIndex.raycast(
    [0, 0, 0],
    [0, 0, 1],
    20,
    (piece) => piece.id !== hit?.piece.id,
  );
  assert.equal(continuation?.piece.id, "far");
  assert.equal(continuation?.distance, 8);
  assert.deepEqual(continuation?.normal, [0, 0, -1]);
});

test("луч учитывает фильтр, поворот и пустое пространство", () => {
  const pieces = [
    {
      id: "turned",
      clusterId: "test",
      material: "wood",
      color: "#fff",
      shape: "box",
      position: [0, 0, 6],
      size: [4, 1, 0.5],
      rotation: [0, Math.PI / 2, 0],
    },
  ];
  const rayIndex = createBreakablePieceIndex(pieces);
  assert.equal(
    rayIndex.raycast([0, 0, 0], [0, 0, 1], 20)?.piece.id,
    "turned",
  );
  const turnedHit = rayIndex.raycast([0, 0, 0], [0, 0, 1], 20);
  assert.ok(turnedHit);
  assert.ok(
    turnedHit.normal[0] * 0 +
      turnedHit.normal[1] * 0 +
      turnedHit.normal[2] * 1 <
      -0.999,
    "нормаль повёрнутого объёма должна смотреть навстречу лучу",
  );
  assert.equal(
    rayIndex.raycast([0, 0, 0], [0, 0, 1], 20, () => false),
    null,
  );
  assert.equal(rayIndex.raycast([20, 20, 20], [1, 0, 0], 5), null);
});
