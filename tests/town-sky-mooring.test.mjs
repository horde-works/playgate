import assert from "node:assert/strict";
import test from "node:test";
import { skyMooringDocument } from "../games/make-a-mess/src/content/scenes/skyMooringDocument.ts";
import {
  hingedDoorGroupKey,
  skyMooringDoorPolicy,
} from "../games/make-a-mess/src/game/hingedGatePolicy.ts";
import { skyMooringCompilation, townScene } from "../games/make-a-mess/src/game/townScene.ts";

const WORLD_CENTER = [30, -15];
const WORLD_WALL = 60;

function mooringPieces() {
  return townScene.breakablePieces.filter((piece) =>
    piece.clusterId.startsWith("sky-mooring:"));
}

const HEART_ID = "sky-mooring:airship:heart:piece";

test("the mooring site is a serializable document compiled into the town", () => {
  const parsed = JSON.parse(JSON.stringify(skyMooringDocument));

  assert.equal(parsed.schemaVersion, 1);
  assert.equal(parsed.id, "sky-mooring");
  // Корабль, мачта и площадка — три группы.
  assert.equal(skyMooringCompilation.clusters.length, 3);
  assert.equal(mooringPieces().length > 350, true);
});

test("the town still starts perfectly stable with the airship in it", () => {
  assert.equal(townScene.resolveStructuralCollapse(new Set()).size, 0);
});

test("the airship reads as a moored ship of the thirties", () => {
  const ids = mooringPieces().map((piece) => piece.id);

  for (const signature of [
    ":airship:gore:",        // продольные полотнища оболочки
    ":airship:number:",      // бортовой номер по борту
    ":airship:fin:mark:",    // опознавательный шеврон на киле
    ":airship:car:door",     // навесная дверь гондолы
    ":airship:car:balcony",  // балкон, на который приходит трап
    ":airship:engine:",      // моторные гондолы с винтами
    ":airship:car:window:",  // окна гондолы-вагона
    ":mast:cup:",            // швартовый стакан
    ":mast:stair:",          // лестница на площадку мачты
    ":mast:gangway:",        // трап с площадки в гондолу
    ":field:sock:",          // ветроуказатель
    ":field:anchor:",        // мёртвые якоря швартовов
  ]) {
    assert.equal(ids.some((id) => id.includes(signature)), true, signature);
  }
  // Носовой, кормовой и мачтовый огни плюс свет гондолы и сердца.
  assert.equal(
    townScene.lampDefinitions.filter((lamp) => lamp.id.startsWith("sky-mooring:")).length,
    5,
  );
});

test("every piece of the mooring site is inside the world wall", () => {
  for (const piece of mooringPieces()) {
    const reach = Math.hypot(
      piece.position[0] - WORLD_CENTER[0],
      piece.position[2] - WORLD_CENTER[1],
    ) + Math.max(piece.size[0], piece.size[2]) / 2;
    assert.equal(reach < WORLD_WALL - 1, true, `${piece.id} at ${reach.toFixed(1)}`);
  }
});

test("the envelope clears the treeline it is moored above", () => {
  const envelope = mooringPieces().filter((piece) => piece.id.includes(":airship:gore:"));
  const lowestPanel = Math.min(
    ...envelope.map((piece) => piece.position[1] - piece.size[1] / 2),
  );
  const treeTop = Math.max(
    ...townScene.breakablePieces
      .filter((piece) => piece.clusterId === "town:edgewood")
      .map((piece) => piece.position[1] + piece.size[1] / 2),
  );

  assert.equal(treeTop < 10, true, `treeline at ${treeTop.toFixed(1)}`);
  assert.equal(lowestPanel > treeTop, true,
    `envelope ${lowestPanel.toFixed(1)} vs trees ${treeTop.toFixed(1)}`);
});

test("bursting the lift heart drops the whole airship and spares the mast", () => {
  const pieces = mooringPieces();
  const ship = pieces.filter((piece) => piece.clusterId === "sky-mooring:airship");
  const site = pieces.filter((piece) => piece.clusterId !== "sky-mooring:airship");
  const heart = ship.find((piece) => piece.id === HEART_ID);
  assert.notEqual(heart, undefined);

  const collapsed = townScene.resolveStructuralCollapse(new Set([heart.id]));

  // Корабль держит только собственный газ: ни один его кусок не должен
  // остаться висеть — ни на мачте, ни на швартовах.
  const stillFlying = ship.filter((piece) => !collapsed.has(piece.id));
  assert.deepEqual(stillFlying.map((piece) => piece.id), []);

  // Мачта и площадка целиком остаются на земле: к борту с земли ничего не
  // привязано, корабль держится носом в стакане. Трап — мостик мачты на
  // подкосах от фермы, дальним концом он лишь ложился на балкон, поэтому
  // тоже остаётся (см. gangway:brace в документе).
  const lost = site.filter((piece) => collapsed.has(piece.id)).map((piece) => piece.id);
  assert.deepEqual(lost, []);

  // Город при этом не должен сложиться заодно.
  const elsewhere = [...collapsed].filter((id) => !id.startsWith("sky-mooring:"));
  assert.deepEqual(elsewhere, []);
});

test("the ship lies broadside to the city with its stairs facing town", () => {
  const pieces = mooringPieces();
  const nose = pieces.find((piece) => piece.id.includes(":airship:cap:nose:3"));
  const tail = pieces.find((piece) => piece.id.includes(":airship:tail:spike"));
  // Корпус вытянут почти строго по оси Z: подходящий с востока видит борт.
  const alongX = Math.abs(tail.position[0] - nose.position[0]);
  const alongZ = Math.abs(tail.position[2] - nose.position[2]);
  assert.equal(alongZ > alongX * 4, true, `${alongX.toFixed(1)} x ${alongZ.toFixed(1)}`);

  // Лестница, трап, балкон и дверь — на восточной (городской) стороне от
  // оси корабля.
  const axisX = (nose.position[0] + tail.position[0]) / 2;
  for (const signature of [":mast:stair:lower:", ":mast:gangway", ":airship:car:balcony:piece", ":airship:car:door:board:0"]) {
    const part = pieces.find((piece) => piece.id.includes(signature));
    assert.notEqual(part, undefined, signature);
    assert.equal(part.position[0] > axisX, true, `${signature} at x=${part.position[0].toFixed(1)}`);
  }
});

test("the gondola door is one hinged leaf with its handle", () => {
  const leaf = mooringPieces().find((piece) =>
    piece.id === "sky-mooring:airship:car:door:board:0:piece");
  const handle = mooringPieces().find((piece) =>
    piece.id === "sky-mooring:airship:car:door:board:1:piece");
  assert.notEqual(leaf, undefined);
  assert.notEqual(handle, undefined);

  // Полотно и ручка — ОДНА створка: система группирует их по общему ключу
  // и вращает вместе вокруг одной петли.
  const leafKey = hingedDoorGroupKey(leaf.id, leaf.clusterId);
  assert.equal(hingedDoorGroupKey(handle.id, handle.clusterId), leafKey);
  assert.equal(skyMooringDoorPolicy(leafKey)?.doorId, leafKey);

  // Петля задана локально в документе; после компиляции обе половины
  // створки должны показывать на одну и ту же мировую точку.
  for (const axis of [0, 1, 2]) {
    assert.equal(Math.abs(leaf.hinge.pivot[axis] - handle.hinge.pivot[axis]) < 0.02, true,
      `pivot axis ${axis}: ${leaf.hinge.pivot[axis]} vs ${handle.hinge.pivot[axis]}`);
  }
  // Ось распахивания вертикальна, полотно уходит от петли в горизонтали.
  assert.equal(Math.abs(leaf.hinge.direction[1]) < 1e-6, true);
  assert.equal(Math.abs(leaf.hinge.normal[1]) < 1e-6, true);
});

test("no tree grows through the mooring site", () => {
  const site = mooringPieces();
  const wood = townScene.breakablePieces.filter((piece) =>
    piece.clusterId === "town:edgewood" || piece.clusterId === "town:edgewood:flora");

  const boxOf = (piece) => {
    const [rx, ry, rz] = piece.rotation ?? [0, 0, 0];
    const sx = Math.sin(rx), cx = Math.cos(rx);
    const sy = Math.sin(ry), cy = Math.cos(ry);
    const sz = Math.sin(rz), cz = Math.cos(rz);
    const axes = [
      [cy * cz, sx * sy * cz + cx * sz, -cx * sy * cz + sx * sz],
      [-cy * sz, -sx * sy * sz + cx * cz, cx * sy * sz + sx * cz],
      [sy, -sx * cy, cx * cy],
    ];
    return [0, 1, 2].map((axis) =>
      axes.reduce((sum, column, index) => sum + Math.abs(column[axis]) * piece.size[index], 0));
  };
  const overlaps = (left, right) => {
    const a = boxOf(left);
    const b = boxOf(right);
    return [0, 1, 2].every((axis) =>
      Math.abs(left.position[axis] - right.position[axis]) < (a[axis] + b[axis]) / 2 - 0.06);
  };

  const collisions = [];
  for (const piece of site) {
    for (const tree of wood) {
      if (Math.hypot(piece.position[0] - tree.position[0], piece.position[2] - tree.position[2]) > 8) {
        continue;
      }
      if (overlaps(piece, tree)) {
        collisions.push(`${piece.id} × ${tree.id}`);
      }
    }
  }
  assert.deepEqual(collisions, []);
});

test("the boarding bridge is braced from the mast, not cantilevered on air", () => {
  const braces = mooringPieces().filter((piece) =>
    piece.id.includes(":mast:gangway:brace:"));
  assert.equal(braces.length, 2);
  const bridge = mooringPieces().find((piece) => piece.id === "sky-mooring:mast:gangway:piece");
  // Подкосы приходят под середину мостика, а не под его пятки.
  for (const brace of braces) {
    assert.equal(
      Math.hypot(brace.position[0] - bridge.position[0], brace.position[2] - bridge.position[2]) < 2.2,
      true,
      brace.id,
    );
  }
});

test("the doorway corridor is clear from the balcony into the cabin", () => {
  // Проход в дверь: от балкона внутрь, шириной с проём и от порога до
  // перемычки. Кроме самой створки в нём не должно быть ничего — поясной
  // профиль борта однажды шёл сквозь него по нижней трети.
  const NOSE = [-22.6, -15.29];
  const HEADING = -1.451;
  const cos = Math.cos(HEADING);
  const sin = Math.sin(HEADING);
  const world = (a, b) => [NOSE[0] + a * cos - b * sin, NOSE[1] + a * sin + b * cos];

  const extentOf = (piece) => {
    const [rx, ry, rz] = piece.rotation ?? [0, 0, 0];
    const sx = Math.sin(rx), cx = Math.cos(rx);
    const sy = Math.sin(ry), cy = Math.cos(ry);
    const sz = Math.sin(rz), cz = Math.cos(rz);
    const axes = [
      [cy * cz, sx * sy * cz + cx * sz, -cx * sy * cz + sx * sz],
      [-cy * sz, -sx * sy * sz + cx * cz, cx * sy * sz + sx * cz],
      [sy, -sx * cy, cx * cy],
    ];
    return [0, 1, 2].map((axis) =>
      axes.reduce((sum, column, index) => sum + Math.abs(column[axis]) * piece.size[index], 0));
  };

  const blockers = new Set();
  for (const piece of townScene.breakablePieces) {
    const extent = extentOf(piece);
    for (let a = 3.7; a <= 4.7; a += 0.12) {
      for (let b = 1.1; b <= 2.3; b += 0.12) {
        for (let y = 7.3; y <= 8.95; y += 0.12) {
          const [wx, wz] = world(a, b);
          if (
            Math.abs(piece.position[0] - wx) < extent[0] / 2 &&
            Math.abs(piece.position[1] - y) < extent[1] / 2 &&
            Math.abs(piece.position[2] - wz) < extent[2] / 2 &&
            !piece.id.includes("car:door:board")
          ) {
            blockers.add(piece.id);
          }
        }
      }
    }
  }
  assert.deepEqual([...blockers], []);
});

test("knocking a mast leg out leaves the airship in the air", () => {
  const ship = mooringPieces().filter((piece) => piece.clusterId === "sky-mooring:airship");
  const leg = mooringPieces().find((piece) => piece.id.includes(":mast:leg:0:0:"));
  assert.notEqual(leg, undefined);

  const collapsed = townScene.resolveStructuralCollapse(new Set([leg.id]));

  assert.deepEqual(ship.filter((piece) => collapsed.has(piece.id)).map((p) => p.id), []);
});
