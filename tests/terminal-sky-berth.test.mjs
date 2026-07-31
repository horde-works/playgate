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
import {
  clearPassengerGlassColor,
  mooringSignalColor,
} from "../games/make-a-mess/src/game/destructionScene.ts";

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

test("only the coach glazing selects the clearer passenger material", () => {
  const coachGlass = trainPieces.filter((piece) =>
    piece.material === "glass" &&
    (piece.id.includes(":window:") || piece.id.includes(":end-window:"))
  );
  assert.equal(coachGlass.length > 10, true);
  assert.equal(
    coachGlass.every((piece) => piece.color === clearPassengerGlassColor),
    true,
  );
  assert.equal(
    berthPieces.some((piece) => piece.color === clearPassengerGlassColor),
    false,
  );
});

test("the terminal still starts perfectly stable with the sky train in it", () => {
  assert.equal(grandTerminalScene.resolveStructuralCollapse(new Set()).size, 0);
});

test("the sky train navigation lights have physical mounts and long-range halos", () => {
  const navigationLamps = grandTerminalScene.lampDefinitions.filter((lamp) =>
    lamp.id.startsWith(`${TRAIN}:nav-light:`));
  assert.equal(navigationLamps.length, 4);
  const sideLamps = navigationLamps.filter((lamp) => /nav-light:-?1$/.test(lamp.id));
  assert.equal(sideLamps.length, 2);
  assert.equal(sideLamps.every((lamp) => lamp.poolPriority >= 8), true);
  assert.equal(sideLamps.every((lamp) => lamp.distance >= 24), true);
  assert.equal(navigationLamps.every((lamp) => lamp.carrierClusterId === TRAIN), true);
  assert.equal(
    navigationLamps.every((lamp) =>
      lamp.beacon?.minScreenDiameter >= 5 &&
      lamp.beacon?.dayOpacity > 0 &&
      lamp.beacon?.nightOpacity >= lamp.beacon?.dayOpacity),
    true,
  );

  // На середине наружного борта мотора лежит тонкая площадка того же материала
  // и цвета. Линза перекрывает её наружную грань, light source вынесен дальше.
  for (const side of [-1, 1]) {
    const lens = trainPieces.find((piece) => piece.id === `${TRAIN}:nav-light:${side}`);
    const mount = trainPieces.find((piece) => piece.id === `${TRAIN}:nav-light:${side}:mount`);
    const lamp = sideLamps.find((candidate) => candidate.id === lens?.id);
    const engine = trainPieces.filter((piece) =>
      piece.id.startsWith(`${TRAIN}:engine:${side}:body:`));
    assert.notEqual(lens, undefined);
    assert.notEqual(mount, undefined);
    assert.notEqual(lamp, undefined);
    assert.notEqual(engine.length, 0);
    const engineCenter = [
      engine[0].position[0],
      engine.reduce((sum, piece) => sum + piece.position[1], 0) / engine.length,
      engine[0].position[2],
    ];
    const engineOutside = Math.max(...engine.map((piece) =>
      side * piece.position[2] + extentOf(piece)[2] / 2));
    const mountInside = side * mount.position[2] - mount.size[2] / 2;
    const mountOutside = side * mount.position[2] + mount.size[2] / 2;
    const lensInside = side * lens.position[2] - lens.size[2] / 2;
    const lensOutside = side * lens.position[2] + lens.size[2] / 2;
    assert.equal(mount.material, engine[0].material);
    assert.equal(mount.shape, engine[0].shape);
    assert.equal(mount.color, engine[0].color);
    assert.equal(mount.size[2] <= 0.1, true);
    assert.equal(Math.abs(mount.position[1] - engineCenter[1]) < 1e-9, true);
    assert.equal(Math.abs(lens.position[1] - engineCenter[1]) < 1e-9, true);
    assert.equal(mountInside < engineOutside && mountOutside > engineOutside, true);
    assert.equal(lensInside <= mountOutside && lensOutside > engineOutside, true);
    assert.equal(
      side * lamp.position[2] > lensOutside,
      true,
    );
    assert.equal(
      grandTerminalScene.resolveStructuralCollapse(new Set([mount.id])).has(lens.id),
      true,
    );
  }

  // Носовой и кормовой фонари посажены в металлические гнёзда без воздушного
  // зазора. Удаление гнезда лишает линзу единственной разрешённой опоры.
  for (const [tag, direction, housingPrefix] of [
    ["nose", -1, `${TRAIN}:nose-cone`],
    ["tail", 1, `${TRAIN}:cap:tail:2`],
  ]) {
    const lens = trainPieces.find((piece) => piece.id === `${TRAIN}:nav-light:${tag}`);
    const mount = trainPieces.find((piece) => piece.id === `${TRAIN}:nav-light:${tag}:mount`);
    const lamp = navigationLamps.find((candidate) => candidate.id === lens?.id);
    const housing = trainPieces.filter((piece) => piece.id.startsWith(housingPrefix));
    assert.notEqual(lens, undefined);
    assert.notEqual(mount, undefined);
    assert.notEqual(lamp, undefined);
    assert.notEqual(housing.length, 0);

    const housingOutside = Math.max(...housing.map((piece) =>
      direction * piece.position[0] + extentOf(piece)[0] / 2));
    const mountInside = direction * mount.position[0] - mount.size[0] / 2;
    const mountOutside = direction * mount.position[0] + mount.size[0] / 2;
    const lensInside = direction * lens.position[0] - lens.size[0] / 2;
    assert.equal(mountInside <= housingOutside + 0.02, true);
    assert.equal(Math.abs(lensInside - mountOutside) <= 0.02, true);
    assert.equal(
      direction * lamp.position[0] > direction * lens.position[0] + lens.size[0] / 2,
      true,
    );
    assert.equal(
      grandTerminalScene.resolveStructuralCollapse(new Set([mount.id])).has(lens.id),
      true,
    );
  }
});

test("the nose owns a breakable route-driven mooring spotlight", () => {
  const lens = trainPieces.find((piece) => piece.id === `${TRAIN}:mooring-light`);
  const housing = trainPieces.find((piece) => piece.id === `${TRAIN}:mooring-light:housing`);
  const mount = trainPieces.find((piece) => piece.id === `${TRAIN}:mooring-light:mount`);
  const light = grandTerminalScene.spotLightDefinitions.find(
    (candidate) => candidate.id === lens?.id,
  );
  assert.notEqual(lens, undefined);
  assert.notEqual(housing, undefined);
  assert.notEqual(mount, undefined);
  assert.notEqual(light, undefined);
  assert.equal(lens.color, mooringSignalColor);
  assert.equal(light.fixtureGlow?.color, lens.color);
  assert.equal(light.carrierClusterId, TRAIN);
  assert.equal(light.direction[0] < -0.8, true, "beam must point ahead of the -x nose");
  assert.equal(light.direction[1] < -0.25, true, "beam must point below the hull");
  assert.equal(Math.abs(Math.hypot(...light.direction) - 1) < 1e-9, true);
  assert.equal(light.distance >= 60, true);
  assert.equal(light.visibleBeam?.length >= 50, true);
  assert.equal(light.visibleBeam?.sourceRadius >= 0.1, true);
  assert.equal(light.fixtureGlow?.halo?.physicalDiameter >= lens.size[1], true);
  assert.equal(light.fixtureGlow?.halo?.dayOpacity > 0, true);
  const lensToSource = light.position.map(
    (value, axis) => value - lens.position[axis],
  );
  const sourceOffset = dot(lensToSource, light.direction);
  assert.equal(sourceOffset >= lens.size[0] / 2, true);
  assert.equal(sourceOffset <= lens.size[0] / 2 + 0.03, true);
  assert.equal(light.dayIntensityFactor, 1);
  assert.equal(light.eventLighting?.sourceClusterId, TRAIN);
  assert.equal(light.eventLighting?.levels.docked.intensityMultiplier, 0);
  assert.equal(light.eventLighting?.levels.departure.intensityMultiplier, 1);
  assert.equal(light.eventLighting?.levels.cruise.intensityMultiplier, 0);
  assert.equal(light.eventLighting?.levels.approach.intensityMultiplier, 1);
  assert.equal(light.transition?.fadeInSeconds >= 1.5, true);
  assert.equal(light.transition?.fadeOutSeconds >= 1, true);
  assert.equal(light.visibleBeam?.anglePower >= 5, true);
  assert.equal(
    grandTerminalScene.resolveStructuralCollapse(new Set([mount.id])).has(lens.id),
    true,
  );
  assert.equal(
    grandTerminalScene.resolveStructuralCollapse(new Set([housing.id])).has(lens.id),
    true,
  );
});

test("platform lighting doubles when its linked ship is docked", () => {
  const platformLamps = grandTerminalScene.lampDefinitions.filter((lamp) =>
    lamp.id === `${BERTH}:buffer-lamp` ||
    lamp.id.startsWith(`${BERTH}:canopy-lamp:`) ||
    lamp.id.startsWith(`${BERTH}:lantern:`));
  assert.equal(platformLamps.length >= 10, true);
  for (const lamp of platformLamps) {
    assert.equal(lamp.eventLighting?.sourceClusterId, TRAIN);
    assert.equal(lamp.dayIntensityFactor > 0, true);
    assert.equal(lamp.eventLighting?.levels.docked.intensityMultiplier, 2);
    assert.equal(lamp.eventLighting?.levels.inTransit.intensityMultiplier, 1);
  }
});

test("each coach owns a row of event-driven ceiling lights", () => {
  const cabinLamps = grandTerminalScene.lampDefinitions.filter((lamp) =>
    lamp.id.startsWith(`${TRAIN}:head:lamp:`) ||
    lamp.id.startsWith(`${TRAIN}:tail:lamp:`));
  assert.equal(cabinLamps.length, 8);
  assert.deepEqual(
    [...new Set(cabinLamps.map((lamp) => lamp.poolGroupId))],
    [`${TRAIN}:cabin`],
  );

  for (const coach of ["head", "tail"]) {
    const coachLamps = cabinLamps.filter((lamp) => lamp.id.includes(`:${coach}:lamp:`));
    assert.equal(coachLamps.length, 4);
    assert.equal(new Set(coachLamps.map((lamp) => lamp.position[0])).size, 4);
  }

  for (const lamp of cabinLamps) {
    const fixture = trainPieces.find((piece) => piece.id === lamp.id);
    assert.notEqual(fixture, undefined);
    assert.equal(fixture.clusterId, TRAIN);
    assert.equal(lamp.carrierClusterId, TRAIN);
    assert.equal(lamp.position[1] < fixture.position[1], true);
    assert.equal(lamp.intensity >= 7, true);
    assert.equal(lamp.distance >= 14, true);
    assert.equal(lamp.dayIntensityFactor, 1);
    assert.equal(lamp.interior, true);
    assert.equal(lamp.eventLighting?.sourceClusterId, TRAIN);
    assert.equal(lamp.eventLighting?.levels.docked.intensityMultiplier, 1);
    assert.equal(lamp.eventLighting?.levels.inTransit.intensityMultiplier <= 0.15, true);
    assert.equal(lamp.eventLighting?.levels.inTransit.distanceMultiplier <= 0.5, true);

    const supportIds = fixture.attachmentSupportIds ?? [];
    assert.equal(supportIds.length, 1);
    assert.equal(
      grandTerminalScene.resolveStructuralCollapse(new Set(supportIds)).has(fixture.id),
      true,
    );
  }
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
  // четыре потолочных лампы в каждом вагоне и четыре аэронавигационных огня.
  assert.equal(
    grandTerminalScene.lampDefinitions.filter((lamp) => lamp.id.startsWith("terminal:sky-")).length,
    27,
  );
});

test("the head coach opens into a framed panoramic driver's bay", () => {
  const cab = trainPieces.filter((piece) => piece.id.startsWith(`${TRAIN}:cab:`));
  const glass = cab.filter((piece) => piece.id.includes(":glass:"));
  const rays = cab.filter((piece) => piece.id.includes(":frame:ray:"));

  assert.equal(cab.length >= 30, true, `cab has only ${cab.length} members`);
  assert.equal(glass.length, 13);
  assert.equal(rays.length, 4);
  assert.notEqual(cab.find((piece) => piece.id.endsWith(":glass:front")), undefined);
  assert.equal(glass.every((piece) => piece.color === clearPassengerGlassColor), true);
  assert.equal(cab.every((piece) => piece.clusterId === TRAIN), true);

  // The former front wall is genuinely absent. The roof gable may close the
  // outer arch, but no wall or decorative end-window blocks the shared room.
  assert.equal(trainPieces.some((piece) => piece.id === `${TRAIN}:head:end:-1`), false);
  assert.equal(trainPieces.some((piece) => piece.id === `${TRAIN}:head:end-window:-1`), false);
  assert.equal(cab.some((piece) => piece.id.includes(":floor:")), false);
  assert.equal(trainPieces.some((piece) => piece.id === `${TRAIN}:chain`), false);

  // The lower windscreen is not hidden behind a dashboard cabinet. Controls
  // hang from one chair-mounted bracket and look back toward the driver.
  assert.equal(cab.some((piece) => piece.id.endsWith(":controls:desk")), false);
  const controlArms = cab.filter((piece) => piece.id.includes(":controls:arm:"));
  assert.equal(controlArms.length, 2);
  const panel = cab.find((piece) => piece.id.endsWith(":controls:panel"));
  assert.notEqual(panel, undefined);
  assert.equal(Math.abs((panel.rotation?.[2] ?? 0) + Math.PI / 9) < 1e-6, true);
  assert.equal(Math.abs(panel.position[2] - M.trackZ) > 0.2, true);
  assert.equal(panel.size[1] < panel.size[0], true, "panel has a thin steel plate");
  assert.equal(Math.abs(panel.size[2] - 0.51) < 1e-6, true, "panel extends 15 cm left");
  assert.deepEqual(panel.attachmentSupportIds, [`${TRAIN}:cab:controls:arm:riser`]);

  const lowerGlass = cab.find((piece) => piece.id.endsWith(":glass:lower:0"));
  const lowerArm = cab.find((piece) => piece.id.endsWith(":controls:arm:forward"));
  const riser = cab.find((piece) => piece.id.endsWith(":controls:arm:riser"));
  assert.equal(
    Math.abs(Math.abs(lowerArm.rotation?.[2] ?? 0) - Math.abs(lowerGlass.rotation?.[2] ?? 0)) < 1e-6,
    true,
    "lower arm follows the lower glazing pitch",
  );
  assert.equal(lowerArm.color, "#81898a");
  assert.equal(controlArms.every((piece) => piece.color === lowerArm.color), true);
  const panelTilt = panel.rotation?.[2] ?? 0;
  const panelLowestUnderside = panel.position[1]
    - Math.abs(Math.sin(panelTilt)) * panel.size[0] / 2
    - Math.abs(Math.cos(panelTilt)) * panel.size[1] / 2;
  const riserTop = riser.position[1] + riser.size[0] / 2;
  assert.equal(riserTop <= panelLowestUnderside + 0.005, true,
    `riser penetrates panel by ${(riserTop - panelLowestUnderside).toFixed(3)} m`);
  assert.equal(panelLowestUnderside - riserTop < 0.02, true,
    `panel floats ${(panelLowestUnderside - riserTop).toFixed(3)} m above bracket`);
  const seat = cab.find((piece) => piece.id.endsWith(":driver-seat:cushion"));
  assert.equal(Math.abs(panel.position[0] - seat.position[0]) < 0.9, true,
    "panel remains within the driver's reach");
  const instruments = grandTerminalScene.motionInstrumentDefinitions;
  assert.equal(instruments.length, 1);
  assert.equal(instruments[0].panelPieceId, panel.id);
  assert.deepEqual(
    instruments[0].indicators.map((indicator) => indicator.label),
    ["READY", "DEPART", "CRUISE", "APPROACH", "FAIL", "L ENG", "R ENG"],
  );
  assert.equal(
    instruments[0].indicators.filter((indicator) =>
      indicator.condition.kind === "metric").length,
    2,
  );

  // It remains a small appendage below the balloon, not a rival hull.
  const cabLength = M.cabRear - M.cabFront;
  assert.equal(cabLength < M.hullRadius, true, `cab length ${cabLength}`);
  assert.equal(M.cabFrontHalf < M.carHalf, true);
});

test("cab rays meet the front rectangle and its panes slope toward the nose", () => {
  const localX = (piece) => {
    const [rx, ry, rz] = piece.rotation ?? [0, 0, 0];
    const sx = Math.sin(rx), cx = Math.cos(rx);
    const sy = Math.sin(ry), cy = Math.cos(ry);
    const sz = Math.sin(rz), cz = Math.cos(rz);
    return [
      cy * cz,
      sx * sy * cz + cx * sz,
      -cx * sy * cz + sx * sz,
    ];
  };
  const distance = (left, right) => Math.hypot(
    left[0] - right[0], left[1] - right[1], left[2] - right[2]);

  for (const level of ["upper", "lower"]) {
    for (const side of [-1, 1]) {
      const ray = pieces.find((piece) =>
        piece.id === `${TRAIN}:cab:frame:ray:${level}:${side}`);
      const frontBar = pieces.find((piece) =>
        piece.id === `${TRAIN}:cab:frame:front:${level}`);
      const frontSide = pieces.find((piece) =>
        piece.id === `${TRAIN}:cab:frame:front:side:${side}`);
      const rearBar = pieces.find((piece) =>
        piece.id === `${TRAIN}:cab:frame:rear:${level}`);
      const rearSide = pieces.find((piece) =>
        piece.id === `${TRAIN}:cab:frame:rear:side:${side}`);
      const axis = localX(ray);
      const start = ray.position.map((value, index) => value - axis[index] * ray.size[0] / 2);
      const end = ray.position.map((value, index) => value + axis[index] * ray.size[0] / 2);
      assert.equal(distance(start, [frontBar.position[0], frontBar.position[1], frontSide.position[2]]) < 0.02,
        true, `${ray.id} misses front frame`);
      assert.equal(distance(end, [rearBar.position[0], rearBar.position[1], rearSide.position[2]]) < 0.02,
        true, `${ray.id} misses coach frame`);
    }
  }

  assert.equal(localX(pieces.find((piece) => piece.id === `${TRAIN}:cab:glass:upper:0`))[1] > 0, true);
  assert.equal(localX(pieces.find((piece) => piece.id === `${TRAIN}:cab:glass:lower:0`))[1] < 0, true);
  assert.equal(localX(pieces.find((piece) => piece.id === `${TRAIN}:cab:glass:side:1:0`))[2] > 0, true);
  assert.equal(localX(pieces.find((piece) => piece.id === `${TRAIN}:cab:glass:side:-1:0`))[2] < 0, true);
});

test("the relocated rail stop clears the driver's bay at the dock", () => {
  const cab = trainPieces.filter((piece) => piece.id.startsWith(`${TRAIN}:cab:`));
  const stop = berthPieces.filter((piece) => piece.id.includes(":buffer-"));
  const cabNose = Math.min(...cab.map((piece) => piece.position[0] - extentOf(piece)[0] / 2));
  const stopFace = Math.max(...stop.map((piece) => piece.position[0] + extentOf(piece)[0] / 2));

  assert.equal(cabNose - stopFace > 0.55, true,
    `cab begins at ${cabNose.toFixed(2)}, stop ends at ${stopFace.toFixed(2)}`);
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
  ["mooring-light", "skin"],       // plate is bolted through the envelope
  ["mooring-light", "stringer"],   // and straddles its lower longitudinal rib
  ["mooring-light:mount", "mooring-light:housing"],
  ["ballast", "ballast:strap"],     // хомуты обхватывают балластный бак
  ["cab:glass", "cab:glass"],       // стёкла эркера сходятся на общей кромке
  ["cab:frame:rear", "hanger-cleat"], // подвеска болтами входит в заднюю раму кабины
  ["cab:frame:ray", "hanger:"],      // луч приходит в тот же силовой угол, что и подвеска
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

test("the platform edge is a solid riser, so the auto-step probe sees the last step", () => {
  // Последний подъём — единственный, который делает не ступень, а КРОМКА
  // ПЕРРОНА, собранная из двух кусков. Автошаг ищет препятствие
  // горизонтальными лучами от подошвы; сквозной шов между основанием и
  // плитой проваливает луч, и целая ступень читается как пустота — игрок
  // упирается в неё и без прыжка на перрон не попадает.
  //
  // Проверяем не авторские высоты (они и со щелью были в допуске), а то, что
  // видит щуп: стенка кромки должна быть сплошной от верхней ступени до
  // настила.
  const stairXs = [...new Set(pieces
    .filter((piece) => /:stair:\d+:0$/.test(piece.id))
    .map((piece) => piece.position[0]))];
  assert.equal(stairXs.length, 3, String(stairXs));

  const lastTread = M.platformTop - M.platformTop / M.stairSteps;
  const edgeZ = M.platformZ - M.platformHalf;
  const solidAt = (x, y, z) => berthPieces.some((piece) => {
    const extent = extentOf(piece);
    return [x, y, z].every((value, axis) =>
      value > piece.position[axis] - extent[axis] / 2 &&
      value < piece.position[axis] + extent[axis] / 2);
  });

  // Щупы автошага бьют от подошвы плюс 2 см. Проседание лежащего тела в
  // решателе — доли миллиметра, но именно оно роняло луч в шов, поэтому
  // проверяем и просевшую капсулу тоже.
  const feelers = [0.08, 0.18, 0.3].flatMap((height) =>
    [0, 0.003].map((sink) => lastTread + 0.02 + height - sink));
  const heights = [
    ...feelers.filter((y) => y < M.platformTop),
    ...Array.from({ length: 53 }, (_, index) => lastTread + index * 0.005),
  ].filter((y) => y > lastTread && y < M.platformTop);

  for (const x of stairXs) {
    for (const y of heights) {
      assert.equal(solidAt(x, y, edgeZ + 0.03), true,
        `дыра в кромке перрона на всходе x=${x}, высота ${y.toFixed(3)}`);
    }
  }
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
  const decode = (source, text, pixel, facing) => {
    const ids = Array.isArray(source) ? new Set(source) : null;
    const prefix = Array.isArray(source) ? source[0]?.split(":cell:")[0] ?? "matrix" : source;
    const cells = ids
      ? pieces.filter((piece) => ids.has(piece.id))
      : pieces.filter((piece) =>
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

  const platformMatrix = grandTerminalScene.mutableObjectDefinitions.find(
    (object) => object.kind === "matrixDisplay" && object.id === `${BERTH}:platform-number`,
  );
  const departureMatrix = grandTerminalScene.mutableObjectDefinitions.find(
    (object) => object.kind === "matrixDisplay" && object.id === `${BERTH}:departures`,
  );
  decode(platformMatrix.frames[0].activePieceIds, "PLATFORM 0", 0.065, -1);
  decode(departureMatrix.frames[0].activePieceIds, "DEPARTS 03", 0.07, -1);
  decode(
    departureMatrix.frames.find((frame) => frame.id === "failed").activePieceIds,
    "FAIL",
    0.07,
    -1,
  );
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

test("the departure lights line the platform edge without becoming an obstacle", () => {
  // Огни отправления врезаны в кромку: игрок ходит по ним, а не через них.
  const lights = berthPieces.filter((piece) =>
    piece.id.includes(":departure-light:"),
  );
  assert.equal(lights.length >= 12, true, `огней всего ${lights.length}`);

  const edge = M.platformZ + M.platformHalf;
  let minX = Infinity;
  let maxX = -Infinity;
  for (const light of lights) {
    const top = light.position[1] + light.size[1] / 2;
    assert.equal(
      top - M.platformTop < MAX_AUTO_STEP_HEIGHT,
      true,
      `${light.id}: торчит на ${(top - M.platformTop).toFixed(2)} м — это уже порог`,
    );
    assert.equal(top > M.platformTop, true, `${light.id}: утоплен в плитку, его не видно`);
    // Между жёлтой линией и обрезом перрона, не свисая с края.
    const near = light.position[2] - light.size[2] / 2;
    const far = light.position[2] + light.size[2] / 2;
    assert.equal(near > M.platformZ + M.platformHalf - 0.3, true, `${light.id}: залез на линию безопасности`);
    assert.equal(far <= edge + 1e-9, true, `${light.id}: свисает с кромки`);
    // Разбитый огонь должен гаснуть, а не остаться светящейся стекляшкой:
    // для этого он и стекло.
    assert.equal(light.material, "glass", `${light.id}: не стекло, гаснуть не умеет`);
    minX = Math.min(minX, light.position[0]);
    maxX = Math.max(maxX, light.position[0]);
  }
  // Линейка идёт по всей длине перрона, а не кучкой у входа.
  assert.equal(maxX - minX > (M.platformTo - M.platformFrom) * 0.85, true);
  // Один цвет на всю линейку: игра управляет ими одним переключателем.
  assert.equal(new Set(lights.map((light) => light.color)).size, 1);
});
