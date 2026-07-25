import assert from "node:assert/strict";
import test from "node:test";
import {
  grandTerminalScene,
  skyBerthMetrics,
  terminalPixelFont,
} from "../games/make-a-mess/src/game/grandTerminalScene.ts";
import {
  hingedDoorGroupKey,
  plugSlideDoorPolicy,
} from "../games/make-a-mess/src/game/hingedGatePolicy.ts";
import { MAX_AUTO_STEP_HEIGHT } from "../games/make-a-mess/src/game/playerMovement.ts";

// Круглая карта терминала: стена мира радиусом 98 вокруг (0, -14).
const WORLD_CENTER = [0, -14];
const WORLD_WALL = 98;
const HEART_ID = "terminal:sky-train:heart";
const BERTH = "terminal:sky-berth";
const TRAIN = "terminal:sky-train";
const M = skyBerthMetrics;

// Игрок: капсула диаметром 0.72 м. Проверяем полосу выше автошага и до
// макушки — ниже автошага препятствие просто перешагивается.
const CAPSULE_RADIUS = 0.36;
const CAPSULE_HEAD = 1.9;

const pieces = grandTerminalScene.breakablePieces;
const berthPieces = pieces.filter((piece) => piece.clusterId === BERTH);
const trainPieces = pieces.filter((piece) => piece.clusterId === TRAIN);

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
// Мировой AABB куска: |R| · size, ровно как его строит компилятор сцены.
function extentOf(piece) {
  const axes = axesOf(piece);
  return [0, 1, 2].map((axis) =>
    axes.reduce((sum, column, index) => sum + Math.abs(column[axis]) * piece.size[index], 0));
}
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
// Глубина проникновения по ориентированным коробкам: у длинных повёрнутых
// плит AABB втрое шире самой плиты и врёт про пересечения.
function penetration(left, right) {
  const A = axesOf(left);
  const B = axesOf(right);
  const delta = [0, 1, 2].map((axis) => right.position[axis] - left.position[axis]);
  const candidates = [...A, ...B];
  for (const a of A) {
    for (const b of B) {
      const c = cross(a, b);
      const length = Math.hypot(...c);
      if (length > 1e-4) {
        candidates.push(c.map((value) => value / length));
      }
    }
  }
  let smallest = Infinity;
  for (const axis of candidates) {
    const ra = [0, 1, 2].reduce((sum, i) => sum + (left.size[i] / 2) * Math.abs(dot(axis, A[i])), 0);
    const rb = [0, 1, 2].reduce((sum, i) => sum + (right.size[i] / 2) * Math.abs(dot(axis, B[i])), 0);
    const overlap = ra + rb - Math.abs(dot(axis, delta));
    if (overlap <= 0) {
      return 0;
    }
    smallest = Math.min(smallest, overlap);
  }
  return smallest;
}

test("platform 0 and the sky train are two clusters of the terminal", () => {
  assert.equal(berthPieces.length > 380, true, String(berthPieces.length));
  assert.equal(trainPieces.length > 450, true, String(trainPieces.length));
  assert.notEqual(berthPieces.find((piece) => piece.id.includes(":deck:")), undefined);
  assert.notEqual(trainPieces.find((piece) => piece.id === HEART_ID), undefined);
});

test("the terminal still starts perfectly stable with the sky train in it", () => {
  assert.equal(grandTerminalScene.resolveStructuralCollapse(new Set()).size, 0);
});

test("the sky train navigation lights stay legible and the nose lens clears its housing", () => {
  const navigationLamps = grandTerminalScene.lampDefinitions.filter((lamp) =>
    lamp.id.startsWith(`${TRAIN}:nav-light:`));
  assert.equal(navigationLamps.length, 4);
  assert.equal(navigationLamps.every((lamp) => lamp.poolPriority === 4), true);

  const noseLens = trainPieces.find((piece) => piece.id === `${TRAIN}:nav-light:nose`);
  const noseHousing = trainPieces.find((piece) => piece.id === `${TRAIN}:nose-cone`);
  assert.notEqual(noseLens, undefined);
  assert.notEqual(noseHousing, undefined);
  const lensFront = noseLens.position[0] - noseLens.size[0] / 2;
  const housingFront = noseHousing.position[0] - noseHousing.size[0] / 2;
  assert.equal(housingFront - lensFront >= 0.08, true);
});

test("the berth reads as a station platform and the ship as a flying train", () => {
  const ids = pieces.map((piece) => piece.id);

  for (const signature of [
    `${BERTH}:rail:`,             // путь под причалом
    `${BERTH}:sleeper:`,          // шпалы
    `${BERTH}:buffer-beam`,       // тупиковый упор
    `${BERTH}:deck-line:`,        // жёлтая линия безопасности
    `${BERTH}:canopy-glass:`,     // остекление навеса
    `${BERTH}:clock-face`,        // часы на колонне навеса
    `${BERTH}:lantern:`,          // фонари по сторонам маршей
    `${BERTH}:board-flap:`,       // табло отправления с пустой строкой
    `${BERTH}:number-text:`,      // эмалевая табличка «PLATFORM 0»
    `${BERTH}:signal-lens`,       // семафор
    `${BERTH}:stair:`,            // всходы с площади
    `${BERTH}:stair-rail:`,       // поручни всходов
    `${BERTH}:boarding-bridge`,   // посадочный мостик
    `${BERTH}:boarding-mark:`,    // разметка посадочной зоны
    `${TRAIN}:skin:`,             // полотнища оболочки
    `${TRAIN}:frame:`,            // шпангоуты
    `${TRAIN}:stringer:`,         // стрингеры по профилю
    `${TRAIN}:number:`,           // бортовой номер 03 на щите
    `${TRAIN}:fin:`,              // хвостовое оперение
    `${TRAIN}:yoke:`,             // траверсы подвески
    `${TRAIN}:hanger:`,           // угловые тяги
    `${TRAIN}:head:door:`,        // навесная дверь головного вагона
    `${TRAIN}:head:window:`,      // лента окон
    `${TRAIN}:head:emblem:`,      // эмблема перевозчика
    `${TRAIN}:head:mark:`,        // номер вагона
    `${TRAIN}:gangway:`,          // переход между вагонами
    `${TRAIN}:engine:`,           // моторные гондолы
    `${TRAIN}:nav-light:`,        // аэронавигационные огни
  ]) {
    assert.equal(ids.some((id) => id.startsWith(signature)), true, signature);
  }

  // Фонарь упора, подсветка табло и таблички, линза семафора, шесть перронных
  // фонарей, светильник на каждой из четырёх колонн навеса, свет сердца, по
  // лампе в каждом вагоне и четыре аэронавигационных огня корабля.
  assert.equal(
    grandTerminalScene.lampDefinitions.filter((lamp) => lamp.id.startsWith("terminal:sky-")).length,
    21,
  );
});

test("every piece of the berth and the train is inside the world wall", () => {
  // Путь нарочно уходит за каменную кромку в туман, поэтому меряем не радиус
  // центра, а самый дальний угол коробки.
  for (const piece of [...berthPieces, ...trainPieces]) {
    const extent = extentOf(piece);
    let reach = 0;
    for (const dx of [-1, 1]) {
      for (const dz of [-1, 1]) {
        reach = Math.max(reach, Math.hypot(
          piece.position[0] + dx * extent[0] / 2 - WORLD_CENTER[0],
          piece.position[2] + dz * extent[2] / 2 - WORLD_CENTER[1],
        ));
      }
    }
    assert.equal(reach < WORLD_WALL - 0.5, true, `${piece.id} at ${reach.toFixed(1)}`);
  }
});

test("the berth lies crosswise on the barrier axis with the head coach at the gate", () => {
  const nose = pieces.find((piece) => piece.id === `${TRAIN}:nose-cone`);
  const finTip = pieces.find((piece) => piece.id.startsWith(`${TRAIN}:fin:`));
  assert.equal(Math.abs(nose.position[2] - finTip.position[2]) < 1.5, true);
  assert.equal(Math.abs(nose.position[0] - finTip.position[0]) > 12, true);

  const door = pieces.find((piece) => piece.id === `${TRAIN}:head:door:board:0`);
  assert.equal(Math.abs(door.position[0]) < 2.5, true, String(door.position[0]));

  // Причал поперёк оси входа: настил между площадью и путём, а путь — у
  // самой кромки мира. Шлагбаумов на этой оси больше нет: они перекрывали
  // лестничные марши.
  const deck = pieces.find((piece) => piece.id === `${BERTH}:deck:1`);
  const rail = pieces.find((piece) => piece.id.startsWith(`${BERTH}:rail:1:`));
  assert.equal(rail.position[2] > deck.position[2], true);
  assert.equal(pieces.some((piece) => piece.id.includes(":boom:")), false);

  // Три одинаковых марша: по краям перрона и один точно посередине.
  const stairTops = [...new Set(pieces
    .filter((piece) => /:stair:\d+:0$/.test(piece.id))
    .map((piece) => Number(piece.position[0].toFixed(2))))].sort((a, b) => a - b);
  assert.equal(stairTops.length, 3, String(stairTops));
  assert.equal(
    Math.abs((stairTops[0] + stairTops[2]) / 2 - stairTops[1]) < 0.2, true, String(stairTops));
  for (const piece of pieces.filter((p) => /:stair:\d+:0$/.test(p.id))) {
    assert.equal(piece.size[0] > 2.5, true, `узкий марш ${piece.id}`);
  }
});

test("bursting the lift heart drops the whole train and spares the platform", () => {
  const collapsed = grandTerminalScene.resolveStructuralCollapse(new Set([HEART_ID]));

  // Состав держит только сердце: ни рама на шпалах, ни лавка над рельсом, ни
  // посадочный мостик, ни цепь на рыме упора не должны его удержать.
  const stillFlying = trainPieces
    .filter((piece) => piece.id !== HEART_ID && !collapsed.has(piece.id))
    .map((piece) => piece.id);
  assert.deepEqual(stillFlying, []);

  assert.deepEqual(berthPieces.filter((piece) => collapsed.has(piece.id)).map((p) => p.id), []);
  assert.deepEqual([...collapsed].filter((id) => !id.startsWith(`${TRAIN}:`)), []);
});

test("knocking a canopy column out leaves the sky train in the air", () => {
  const column = berthPieces.filter((piece) => piece.id.startsWith(`${BERTH}:canopy-column:2:`));
  assert.equal(column.length > 0, true);

  const collapsed = grandTerminalScene.resolveStructuralCollapse(
    new Set(column.map((piece) => piece.id)),
  );
  assert.deepEqual(trainPieces.filter((piece) => collapsed.has(piece.id)).map((p) => p.id), []);
});

test("the coach door is one plug-sliding leaf with its handle", () => {
  const leaf = pieces.find((piece) => piece.id === `${TRAIN}:head:door:board:0`);
  const handle = pieces.find((piece) => piece.id === `${TRAIN}:head:door:board:1`);
  assert.notEqual(leaf, undefined);
  assert.notEqual(handle, undefined);

  // Полотно и ручка — одна створка: система группирует их по общему ключу и
  // возит вместе.
  const leafKey = hingedDoorGroupKey(leaf.id, leaf.clusterId);
  assert.equal(hingedDoorGroupKey(handle.id, handle.clusterId), leafKey);
  const policy = plugSlideDoorPolicy(leafKey);
  assert.notEqual(policy, null);
  assert.equal(policy.doorId, leafKey);

  for (const axis of [0, 1, 2]) {
    assert.equal(Math.abs(leaf.hinge.pivot[axis] - handle.hinge.pivot[axis]) < 0.02, true,
      `pivot axis ${axis}`);
  }
  // Нормаль смотрит НАРУЖУ вагона, к перрону: по ней створка выходит из
  // проёма. Ось борта горизонтальна — по ней она едет.
  assert.equal(Math.abs(leaf.hinge.normal[1]) < 1e-6, true);
  assert.equal(leaf.hinge.normal[2] < 0, true, "нормаль должна смотреть на перрон");
  assert.equal(Math.abs(leaf.hinge.direction[1]) < 1e-6, true);

  // Створка выходит из проёма глубже собственной толщины — иначе она поедет
  // сквозь косяк.
  assert.equal(policy.plugDepth > leaf.size[2] + 0.05, true,
    `выход ${policy.plugDepth} против толщины ${leaf.size[2]}`);
  // И уезжает на всю свою ширину, освобождая проём целиком.
  assert.equal(policy.travel >= leaf.size[0], true,
    `ход ${policy.travel} против ширины ${leaf.size[0]}`);
});

test("the open coach door has somewhere to slide", () => {
  // Створка уезжает вправо для стоящего на перроне: право = up × нормаль.
  const leaf = pieces.find((piece) => piece.id === `${TRAIN}:head:door:board:0`);
  const policy = plugSlideDoorPolicy(hingedDoorGroupKey(leaf.id, leaf.clusterId));
  const normal = leaf.hinge.normal;
  const right = [normal[2], 0, -normal[0]];
  const opened = {
    ...leaf,
    position: [0, 1, 2].map((axis) =>
      leaf.position[axis] + normal[axis] * policy.plugDepth + right[axis] * policy.travel),
  };
  assert.equal(right[0] < 0, true, "вправо для пассажира — это -x");

  const blockers = [];
  for (const piece of pieces) {
    if (piece.id.startsWith(`${TRAIN}:head:door:board`)) {
      continue;
    }
    if (Math.abs(piece.position[0] - opened.position[0]) > 4) continue;
    if (Math.abs(piece.position[2] - opened.position[2]) > 3) continue;
    if (penetration(opened, piece) > 0.06) {
      blockers.push(piece.id);
    }
  }
  assert.deepEqual(blockers.slice(0, 4), []);
});

test("nothing of the berth or the train grows through the rest of the terminal", () => {
  const others = pieces.filter((piece) =>
    piece.clusterId !== BERTH && piece.clusterId !== TRAIN &&
    !(piece.shape === "groundTile" && piece.size[1] < 1.2 && piece.position[1] < 0.8));
  const collisions = [];
  for (const piece of [...berthPieces, ...trainPieces]) {
    const extent = extentOf(piece);
    for (const other of others) {
      const otherExtent = extentOf(other);
      if ([0, 1, 2].some((axis) =>
        Math.abs(piece.position[axis] - other.position[axis]) >
          (extent[axis] + otherExtent[axis]) / 2)) {
        continue;
      }
      if (penetration(piece, other) > 0.08) {
        collisions.push(`${piece.id} × ${other.id}`);
      }
    }
  }
  assert.deepEqual(collisions.slice(0, 5), []);
});

// Стыки, которые ВПРАВЕ пересекаться: фитинг, сидящий на своей несущей
// поверхности. Всё, чего тут нет, — брак вроде колонны внутри лавки.
const ALLOWED_INNER_OVERLAPS = [
  ["skin", "skin"],                 // полотнища кроются внахлёст
  ["frame", "skin"],                // чугунные кольца поверх полотна
  ["cap:nose", "cap:nose"],         // ступени носового обтекателя
  ["cap:tail", "cap:tail"],
  ["cap:tail", "skin"],
  ["cap:nose", "nose-cone"],
  ["fin", "skin"],                  // корень оперения уходит в оболочку
  ["fin", "stringer"],
  ["engine", "engine"],             // детали мотогондолы друг на друге
  ["engine", "skin"],               // пилон и крыло врастают в борт
  ["number", "skin"],               // номерной щит лежит на обшивке
  ["chain", "frame"],               // швартов закреплён на раме вагона
  ["cant", "door:lintel"],          // притолока входит в обвязку борта
  ["end-window", "end"],            // остекление вставлено в торец
  ["signal-arm", "signal-post"],    // кронштейны на своих стойках
  ["clock-bracket", "clock"],
  ["canopy-bracket", "canopy"],
  ["lantern-arm", "canopy"],
  ["lantern-arm", "lantern"],
  ["canopy-lamp-arm", "canopy-lamp"],
  ["canopy-lamp-arm", "canopy-crossbeam"],
  ["buffer-leg", "ballast"],
  ["buffer-leg", "sleeper"],
  ["buffer-ring", "chain-stub"],
  ["hanger", "yoke"],               // тяга посажена в траверсу
  ["hanger-cleat", "end"],          // косынка притянута к торцевой раме
  ["hanger-shoe", "end"],
  ["hanger-cleat", "hanger"],
  ["hanger-shoe", "hanger"],
  ["hanger-shoe", "frame"],
  ["gable", "roof"],                // щипец смыкается с аркой кровли
  ["nav-light", "nose-cone"],       // огонь утоплен в носовой обтекатель
  ["nav-light", "engine"],
];

test("nothing inside the berth or the train grows through its own neighbour", () => {
  const allowed = (left, right) => ALLOWED_INNER_OVERLAPS.some(([a, b]) =>
    (left.includes(a) && right.includes(b)) || (left.includes(b) && right.includes(a)));

  const collisions = [];
  for (const cluster of [berthPieces, trainPieces]) {
    const boxed = cluster.map((piece) => ({ piece, extent: extentOf(piece) }));
    for (let i = 0; i < boxed.length; i += 1) {
      for (let j = i + 1; j < boxed.length; j += 1) {
        const a = boxed[i];
        const b = boxed[j];
        if ([0, 1, 2].some((axis) =>
          Math.abs(a.piece.position[axis] - b.piece.position[axis]) >
            (a.extent[axis] + b.extent[axis]) / 2)) {
          continue;
        }
        const left = a.piece.id.split(":").slice(2).join(":");
        const right = b.piece.id.split(":").slice(2).join(":");
        if (allowed(left, right)) {
          continue;
        }
        if (penetration(a.piece, b.piece) > 0.12) {
          collisions.push(`${left} × ${right}`);
        }
      }
    }
  }
  assert.deepEqual(collisions.slice(0, 6), []);
});

test("a passenger capsule fits the whole way from the square into the tail coach", () => {
  // Маршрут: площадь → всход → перрон → мостик → дверь → салон → переход →
  // второй вагон. На каждом шаге проверяем и проход по ширине капсулы, и
  // потолочный зазор: прежний тест мерил только высоту ступеней.
  const stairFoot = M.platformZ - M.platformHalf - M.stairTread * (M.stairSteps - 0.5);
  const stairX = (M.platformFrom + M.platformTo) / 2;   // средний марш
  const route = [];
  const walk = (fromZ, toZ, floor, x = stairX) => {
    const steps = Math.max(1, Math.round(Math.abs(toZ - fromZ) / 0.2));
    for (let step = 0; step <= steps; step += 1) {
      route.push({ x, z: fromZ + ((toZ - fromZ) * step) / steps, floor });
    }
  };
  walk(stairFoot - 1.2, stairFoot, 0);
  for (let step = 0; step < M.stairSteps - 1; step += 1) {
    route.push({
      x: stairX,
      z: M.platformZ - M.platformHalf - M.stairTread * (M.stairSteps - 1.5 - step),
      floor: (M.platformTop / M.stairSteps) * (step + 1),
    });
  }
  walk(M.platformZ - M.platformHalf + 0.2, M.platformZ + M.platformHalf - 0.4, M.platformTop);
  for (let step = 0; step <= 8; step += 1) {
    route.push({
      x: stairX + ((M.headX - stairX) * step) / 8,
      z: M.platformZ + 0.9,
      floor: M.platformTop,
    });
  }
  walk(M.platformZ + M.platformHalf - 0.3, M.trackZ - M.carHalf - 0.25, M.platformTop + 0.08, M.headX);
  walk(M.trackZ - M.carHalf + 0.2, M.trackZ, M.floorTop, M.headX);
  for (let step = 0; step <= 40; step += 1) {
    route.push({ x: M.headX + ((M.tailX - M.headX) * step) / 40, z: M.trackZ, floor: M.floorTop });
  }

  const boxed = pieces
    .filter((piece) => piece.position[2] > 68 && piece.position[2] < 84 && piece.position[1] < 7)
    .map((piece) => ({ piece, extent: extentOf(piece) }));
  const blockers = new Map();
  for (const point of route) {
    const low = point.floor + 0.85;
    const high = point.floor + CAPSULE_HEAD;
    for (const { piece, extent } of boxed) {
      // Створка двери открывается — она не препятствие.
      if (piece.id.startsWith(`${TRAIN}:head:door:board`)) {
        continue;
      }
      if (Math.abs(piece.position[0] - point.x) > extent[0] / 2 + CAPSULE_RADIUS) continue;
      if (Math.abs(piece.position[2] - point.z) > extent[2] / 2 + CAPSULE_RADIUS) continue;
      const top = piece.position[1] + extent[1] / 2;
      const bottom = piece.position[1] - extent[1] / 2;
      if (top <= low || bottom >= high) continue;
      blockers.set(piece.id, `${piece.id} @ x=${point.x.toFixed(1)} z=${point.z.toFixed(1)}`);
    }
  }
  assert.deepEqual([...blockers.values()].slice(0, 6), []);
});

test("boarding is one shallow step over a narrow gap, not a jump", () => {
  const topOf = (id) => {
    const piece = pieces.find((candidate) => candidate.id === id);
    assert.notEqual(piece, undefined, id);
    return piece.position[1] + piece.size[1] / 2;
  };
  const climb = [0];
  for (let step = 0; step < M.stairSteps - 1; step += 1) {
    climb.push(topOf(`${BERTH}:stair:0:${step}`));
  }
  climb.push(topOf(`${BERTH}:deck:2`));
  climb.push(topOf(`${BERTH}:boarding-bridge:tread`));
  climb.push(topOf(`${TRAIN}:head:floor`));

  for (let index = 1; index < climb.length; index += 1) {
    const rise = climb[index] - climb[index - 1];
    assert.equal(rise > 0 && rise <= 0.3, true,
      `подъём ${index}: ${rise.toFixed(2)} (автошаг игрока ${MAX_AUTO_STEP_HEIGHT})`);
  }

  // Мостик не достаёт до порога на ширину ладони: этого хватает, чтобы состав
  // не нашёл в нём опоры, и мало, чтобы в щель провалиться. Держится это на
  // флагах, а не на опасной щели.
  const bridge = pieces.find((piece) => piece.id === `${BERTH}:boarding-bridge`);
  const sill = pieces.find((piece) => piece.id === `${TRAIN}:head:door:sill`);
  const gap = (sill.position[2] - sill.size[2] / 2) - (bridge.position[2] + bridge.size[2] / 2);
  assert.equal(gap > 0.06 && gap < 0.16, true, `зазор посадки ${gap.toFixed(2)}`);
  assert.equal(bridge.bearsLoad, false);
  assert.equal(bridge.carriesAttachments, false);
});

test("every sign reads the right way round from the side that faces the reader", () => {
  // Зеркальная раскладка уже дважды прокрадывалась в сцену, поэтому надписи
  // ДЕКОДИРУЕМ обратно: строим сетку из самих кусков и сверяем со шрифтом.
  const decode = (prefix, text, pixel, facing) => {
    const cells = pieces.filter((piece) =>
      piece.id.startsWith(`${prefix}:`) && /:\d+$/.test(piece.id));
    assert.equal(cells.length > 0, true, prefix);
    const xs = cells.map((cell) => cell.position[0]);
    const ys = cells.map((cell) => cell.position[1]);
    const originX = facing < 0 ? Math.max(...xs) : Math.min(...xs);
    const originY = Math.max(...ys);
    const seen = new Set(cells.map((cell) => {
      const column = Math.round(facing < 0
        ? (originX - cell.position[0]) / pixel
        : (cell.position[0] - originX) / pixel);
      return `${Math.round((originY - cell.position[1]) / pixel)}:${column}`;
    }));

    const expected = [];
    [...text.toUpperCase()].forEach((character, characterIndex) => {
      terminalPixelFont[character]?.forEach((row, rowIndex) => {
        [...row].forEach((cell, columnIndex) => {
          if (cell === "1") {
            expected.push([rowIndex, characterIndex * 6 + columnIndex]);
          }
        });
      });
    });
    const minRow = Math.min(...expected.map(([row]) => row));
    const minColumn = Math.min(...expected.map(([, column]) => column));
    const wanted = new Set(expected.map(([row, column]) =>
      `${row - minRow}:${column - minColumn}`));

    assert.equal(seen.size, wanted.size, `${prefix}: ${seen.size} клеток против ${wanted.size}`);
    for (const key of wanted) {
      assert.equal(seen.has(key), true, `${prefix}: пропущена клетка ${key}`);
    }
  };

  decode(`${BERTH}:number-text`, "PLATFORM 0", 0.065, -1);
  decode(`${BERTH}:board-line`, "DEPARTS 03", 0.07, -1);
  decode(`${TRAIN}:head:mark:-1`, "01", 0.07, -1);
  decode(`${TRAIN}:head:mark:1`, "01", 0.07, 1);
});

test("hull markings and stringers lie on the envelope, not beside it", () => {
  // Плоская строка на сужающейся корме отходила от обшивки на четверть метра;
  // стрингер постоянного радиуса вылетал из носа.
  const onHull = [
    ...pieces.filter((piece) => piece.id.startsWith(`${TRAIN}:stringer:`)),
    ...pieces.filter((piece) => piece.id.startsWith(`${TRAIN}:number:`)),
  ];
  const worst = [];
  for (const piece of onHull) {
    const radius = Math.hypot(piece.position[1] - M.hullY, piece.position[2] - M.trackZ);
    const local = M.hullRadiusAt(piece.position[0]);
    if (Math.abs(radius - local) > 0.3) {
      worst.push(`${piece.id}: ${radius.toFixed(2)} против ${local.toFixed(2)}`);
    }
  }
  assert.deepEqual(worst.slice(0, 5), []);

  // И номер не спорит с диском винта: он стоит в цилиндрической середине, а
  // мотогондолы — за ней.
  const band = pieces.find((piece) => piece.id === `${TRAIN}:number:-1:band`);
  const hub = pieces.find((piece) => piece.id === `${TRAIN}:engine:-1:hub`);
  assert.equal(band.position[0] + band.size[0] / 2 < hub.position[0] - 0.4, true,
    `щит до ${(band.position[0] + band.size[0] / 2).toFixed(2)}, винт на ${hub.position[0].toFixed(2)}`);
});

test("the canopy keeps clear of the loading gauge", () => {
  const canopy = berthPieces.filter((piece) => piece.id.includes(":canopy-"));
  const coach = trainPieces.filter((piece) => piece.id.includes(":roof:"));
  const canopyEdge = Math.max(...canopy.map((piece) => piece.position[2] + extentOf(piece)[2] / 2));
  const coachEdge = Math.min(...coach.map((piece) => piece.position[2] - extentOf(piece)[2] / 2));

  assert.equal(coachEdge - canopyEdge > 0.3, true,
    `навес до ${canopyEdge.toFixed(2)}, крыша вагона от ${coachEdge.toFixed(2)}`);
});
