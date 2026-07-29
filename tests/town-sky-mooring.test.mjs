import assert from "node:assert/strict";
import test from "node:test";
import { skyMooringDocument } from "../games/make-a-mess/src/content/scenes/skyMooringDocument.ts";
import {
  hingedDoorGroupKey,
  plugSlideDoorPolicy,
} from "../games/make-a-mess/src/game/hingedGatePolicy.ts";
import {
  skyMooringCompilation,
  townScene,
} from "../games/make-a-mess/src/game/townScene.ts";

const WORLD_CENTER = [30, -15];
const WORLD_WALL = 60;

const axesOf = (piece) => {
  const [rx, ry, rz] = piece.rotation ?? [0, 0, 0];
  const sx = Math.sin(rx), cx = Math.cos(rx);
  const sy = Math.sin(ry), cy = Math.cos(ry);
  const sz = Math.sin(rz), cz = Math.cos(rz);
  return [
    [cy * cz, sx * sy * cz + cx * sz, -cx * sy * cz + sx * sz],
    [-cy * sz, -sx * sy * sz + cx * cz, cx * sy * sz + sx * cz],
    [sy, -sx * cy, cx * cy],
  ];
};
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
function penetration(left, right) {
  const A = axesOf(left);
  const B = axesOf(right);
  const delta = [0, 1, 2].map((axis) => right.position[axis] - left.position[axis]);
  const candidates = [...A, ...B];
  for (const a of A) {
    for (const b of B) {
      const c = cross(a, b);
      const length = Math.hypot(...c);
      if (length > 1e-4) candidates.push(c.map((value) => value / length));
    }
  }
  let smallest = Infinity;
  for (const axis of candidates) {
    const ra = [0, 1, 2].reduce(
      (sum, i) => sum + (left.size[i] / 2) * Math.abs(dot(axis, A[i])), 0);
    const rb = [0, 1, 2].reduce(
      (sum, i) => sum + (right.size[i] / 2) * Math.abs(dot(axis, B[i])), 0);
    const overlap = ra + rb - Math.abs(dot(axis, delta));
    if (overlap <= 0) return 0;
    smallest = Math.min(smallest, overlap);
  }
  return smallest;
}

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
    ":mast:landing",         // площадка у двери остаётся на причале
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
  // Четыре корабельных габарита, семь огней причальной мачты, свет гондолы
  // и сердца, а также прожектор поля. Посадочный прожектор считается отдельно.
  assert.equal(
    townScene.lampDefinitions.filter((lamp) => lamp.id.startsWith("sky-mooring:")).length,
    14,
  );
});

test("the mast becomes a bright occupied berth only after nose capture", () => {
  const mastLamps = townScene.lampDefinitions.filter((lamp) =>
    lamp.id.startsWith("sky-mooring:mast:") &&
    lamp.eventLighting?.sourceClusterId === "sky-mooring:airship");

  assert.equal(mastLamps.length, 7);
  for (const lamp of mastLamps) {
    const levels = lamp.eventLighting.levels;
    assert.equal(levels.docked.intensityMultiplier >= 1.8, true, lamp.id);
    assert.equal(levels.attention.intensityMultiplier, levels.docked.intensityMultiplier);
    for (const phase of ["inTransit", "departure", "cruise", "approach", "failed"]) {
      assert.equal(
        levels[phase].intensityMultiplier <= 0.12,
        true,
        `${lamp.id}:${phase}`,
      );
    }
    assert.equal(lamp.transition.fadeInSeconds > 0, true, lamp.id);
    assert.equal(lamp.transition.fadeOutSeconds > 0, true, lamp.id);
  }

  const addedFixtureIds = mooringPieces()
    .filter((piece) => piece.id.includes(":lamp:") && piece.id.includes(":lens:piece"))
    .map((piece) => piece.id);
  assert.equal(addedFixtureIds.length, 6);
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

  // Мачта, трап и посадочная площадка у двери целиком остаются на земле:
  // к борту с земли ничего не привязано, корабль держится носом в стакане.
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

  // Лестница, трап, площадка и дверь — на восточной (городской) стороне от
  // оси корабля.
  const axisX = (nose.position[0] + tail.position[0]) / 2;
  for (const signature of [":mast:stair:lower:", ":mast:gangway", ":mast:landing:piece", ":airship:car:door:board:0"]) {
    const part = pieces.find((piece) => piece.id.includes(signature));
    assert.notEqual(part, undefined, signature);
    assert.equal(part.position[0] > axisX, true, `${signature} at x=${part.position[0].toFixed(1)}`);
  }
});

test("the gondola door is one plug-sliding leaf with its handle", () => {
  const leaf = mooringPieces().find((piece) =>
    piece.id === "sky-mooring:airship:car:door:board:0:piece");
  const handle = mooringPieces().find((piece) =>
    piece.id === "sky-mooring:airship:car:door:board:1:piece");
  assert.notEqual(leaf, undefined);
  assert.notEqual(handle, undefined);

  // Полотно и ручка — ОДНА створка: общий транспортный привод сперва
  // выводит её на себя, затем сдвигает вдоль борта.
  const leafKey = hingedDoorGroupKey(leaf.id, leaf.clusterId);
  assert.equal(hingedDoorGroupKey(handle.id, handle.clusterId), leafKey);
  const policy = plugSlideDoorPolicy(leafKey);
  assert.equal(policy?.doorId, leafKey);
  assert.equal(policy.plugDepth > leaf.size[2], true);
  assert.equal(policy.travel >= leaf.size[0], true);

  // Петля задана локально в документе; после компиляции обе половины
  // створки должны показывать на одну и ту же мировую точку.
  for (const axis of [0, 1, 2]) {
    assert.equal(Math.abs(leaf.hinge.pivot[axis] - handle.hinge.pivot[axis]) < 0.02, true,
      `pivot axis ${axis}: ${leaf.hinge.pivot[axis]} vs ${handle.hinge.pivot[axis]}`);
  }
  // Локальный базис привода горизонтален; normal смотрит наружу.
  assert.equal(Math.abs(leaf.hinge.direction[1]) < 1e-6, true);
  assert.equal(Math.abs(leaf.hinge.normal[1]) < 1e-6, true);
});

test("the entrance furnishings no longer obstruct the gondola doorway", () => {
  const ids = mooringPieces().map((piece) => piece.id);
  assert.equal(ids.some((id) => id.includes(":airship:car:desk")), false);
  assert.equal(ids.some((id) => id.includes(":airship:car:dial:")), false);
});

test("the gondola side glass sits in real framed openings", () => {
  const ship = mooringPieces().filter((piece) => piece.clusterId === "sky-mooring:airship");
  const panes = ship.filter((piece) => piece.id.includes(":airship:car:window:"));
  assert.equal(panes.length, 9);

  // Старых цельных стен за стеклом больше нет. У каждой оконной ленты есть
  // лишь нижний/верхний пояса и простенки между отдельными проёмами.
  assert.equal(ship.some((piece) => piece.id === "sky-mooring:airship:car:wall:west:piece"), false);
  assert.equal(ship.some((piece) => piece.id === "sky-mooring:airship:car:wall:east:aft:piece"), false);
  for (const side of [-1, 1]) {
    const sideName = side < 0 ? "west" : "east";
    for (const band of ["lower", "upper", "post:0"]) {
      assert.equal(
        ship.some((piece) => piece.id.includes(`:airship:car:wall:${sideName}:${band}:piece`)),
        true,
        `${sideName}:${band}`,
      );
    }
  }
  assert.equal(ship.some((piece) =>
    piece.id.includes(":airship:car:wall:west:post:end:piece")), true);
  // Последнее восточное окно подходит прямо к кормовой переборке: её торец
  // и служит крайним вертикальным обрамлением, отдельный простенок не нужен.
  assert.equal(ship.some((piece) => piece.id.includes(":airship:car:stern:piece")), true);
  for (const pane of panes) {
    const id = pane.id.replace(":window:", ":sash:").replace(":piece", "");
    assert.equal(ship.some((piece) => piece.id === `${id}:sill:piece`), true, `${pane.id} sill`);
    assert.equal(ship.some((piece) => piece.id === `${id}:lintel:piece`), true, `${pane.id} lintel`);
  }
});

test("the open gondola door clears its doorway and outer wall", () => {
  const ship = mooringPieces().filter((piece) => piece.clusterId === "sky-mooring:airship");
  const leaf = ship.find((piece) =>
    piece.id === "sky-mooring:airship:car:door:board:0:piece");
  const policy = plugSlideDoorPolicy(hingedDoorGroupKey(leaf.id, leaf.clusterId));
  const normal = leaf.hinge.normal;
  const right = [normal[2], 0, -normal[0]];
  const opened = {
    ...leaf,
    position: [0, 1, 2].map((axis) =>
      leaf.position[axis] + normal[axis] * policy.plugDepth + right[axis] * policy.travel),
  };

  const blockers = ship.filter((piece) =>
    !piece.id.includes(":car:door:board:") && penetration(opened, piece) > 0.06);
  assert.deepEqual(blockers.map((piece) => piece.id).slice(0, 5), []);
});

test("the airship has train-grade navigation and mooring lights", () => {
  const ship = mooringPieces().filter((piece) => piece.clusterId === "sky-mooring:airship");
  const nav = townScene.lampDefinitions.filter((lamp) =>
    lamp.id.startsWith("sky-mooring:airship:nav-light:"));
  assert.equal(nav.length, 4);
  assert.equal(nav.every((lamp) => lamp.carrierClusterId === "sky-mooring:airship"), true);

  const sideLights = nav.filter((lamp) => /nav-light:-?1:piece$/.test(lamp.id));
  assert.equal(sideLights.length, 2);
  assert.deepEqual(sideLights.map((lamp) => lamp.color).sort(), ["#6bff9c", "#ff6f62"]);
  for (const lamp of sideLights) {
    assert.equal(lamp.distance, 24);
    assert.equal(lamp.intensity, 5);
    assert.equal(lamp.poolPriority, 8);
    assert.equal(lamp.beacon?.minScreenDiameter, 6);
    assert.equal(ship.some((piece) => piece.id === lamp.id), true, `${lamp.id} lens`);
    assert.equal(ship.some((piece) => piece.id === lamp.id.replace(":piece", ":mount:piece")), true,
      `${lamp.id} mount`);
  }

  for (const end of ["nose", "tail"]) {
    const lamp = nav.find((candidate) => candidate.id.endsWith(`nav-light:${end}:piece`));
    assert.notEqual(lamp, undefined, end);
    assert.equal(lamp.color, "#fff6dc");
    assert.equal(lamp.distance, 18);
    assert.equal(lamp.intensity, 3.4);
    assert.equal(lamp.beacon?.minScreenDiameter, 5);
  }

  assert.equal(townScene.spotLightDefinitions.length, 1);
  const mooring = townScene.spotLightDefinitions[0];
  assert.equal(mooring.id, "sky-mooring:airship:mooring-light:piece");
  assert.equal(mooring.carrierClusterId, "sky-mooring:airship");
  assert.equal(mooring.distance, 72);
  assert.equal(mooring.intensity, 620);
  assert.equal(mooring.eventLighting?.levels.docked.intensityMultiplier, 0);
  assert.equal(mooring.eventLighting?.levels.departure?.intensityMultiplier, 1);
  assert.equal(mooring.eventLighting?.levels.cruise?.intensityMultiplier, 0);
  assert.equal(mooring.eventLighting?.levels.approach?.intensityMultiplier, 1);
  assert.deepEqual(mooring.transition, { fadeInSeconds: 1.8, fadeOutSeconds: 1.2 });
  assert.equal(mooring.visibleBeam?.length, 62);
  assert.equal(ship.some((piece) => piece.id === mooring.id), true);
  assert.equal(ship.some((piece) => piece.id.includes(":mooring-light:housing:piece")), true);
  assert.equal(ship.some((piece) => piece.id.includes(":mooring-light:mount:piece")), true);
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

test("the doorway corridor is clear from the mast landing into the cabin", () => {
  // Проход в дверь: от причальной площадки внутрь, шириной с проём и от порога до
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
