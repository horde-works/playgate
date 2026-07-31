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
