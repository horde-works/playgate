import assert from "node:assert/strict";
import test from "node:test";
import {
  compileSceneDocument,
  compileSceneGroups,
} from "../games/make-a-mess/src/content/scenes/compileScene.ts";
import {
  DOOR_ENABLE_TOLERANCE,
  ODOMETRY_SLIP,
  TRAIN_LIMITS,
  advanceTrain,
  baliseCrossed,
  brakingSpeedLimit,
  curveSpeedLimit,
  distanceAhead,
  initialTrainState,
  odometryError,
  ringStops,
  trainEventState,
} from "../games/make-a-mess/src/game/astanaTrainControl.ts";
import {
  TRAIN_LENGTH,
  RING_STRAIGHT_LENGTH,
  ringBalises,
  stationDistance,
} from "../games/make-a-mess/src/content/scenes/astana/astanaPlan.ts";
import {
  CAR_WIDTH,
  RAIL_HEAD,
  SECTION_LENGTH,
  TRAIN_SECTIONS,
  bodyHalfWidth,
  cabSectionAt,
  createTrain,
  trainFrameAt,
  trainStopDistance,
} from "../games/make-a-mess/src/content/scenes/astana/astanaTrain.ts";
import {
  astanaTrainClusterDefinitions,
  astanaTrainSectionPose,
  initialAstanaTrainState,
} from "../games/make-a-mess/src/game/astanaTrainRuntime.ts";
import { compoundClusterColliders } from "../games/make-a-mess/src/game/compoundKinematicCluster.ts";

const trainGroups = Array.from({ length: TRAIN_SECTIONS }, (_, index) => ({
  id: `lrv-001-${index}`,
  label: `TRITON section ${index + 1}`,
  material: "steel",
  supportMode: "stack",
  objects: [],
}));
createTrain(trainGroups);
const train = compileSceneGroups(
  { schemaVersion: 1, id: "astana", groups: trainGroups },
  new Map(),
).clusters.flatMap((cluster) => cluster.pieces);
const withPart = (part) => train.filter((piece) => piece.id.includes(part));

test("the train is built to its parts list, not sketched", () => {
  // Детектор упрощения: паспорт мира требует у состава конкретных узлов.
  // «Коробка на колёсах» этот тест не проходит.
  assert.equal(TRAIN_SECTIONS, 3);
  assert.equal(SECTION_LENGTH * TRAIN_SECTIONS, TRAIN_LENGTH);
  assert.ok(train.length >= 900, `деталей состава: ${train.length}`);
  // Тележек две на секцию, колёс четыре на тележку.
  assert.equal(withPart(":wheel:").length, TRAIN_SECTIONS * 2 * 4);
  assert.equal(withPart(":bogie:").filter((p) => p.id.includes(":frame")).length,
    TRAIN_SECTIONS * 2);
  // Дверей по две на секцию с каждой стороны, у каждой две створки.
  assert.equal(withPart("door-glass:").length, TRAIN_SECTIONS * 2 * 2 * 2);
  assert.equal(withPart("door-edge:").length, TRAIN_SECTIONS * 2 * 2 * 3);
  // Две головы: у обеих морда со стеклом, табло, фарами и одним дворником.
  assert.equal(withPart("cab:route-board").length, 2);
  assert.equal(withPart("cab:headlight:").length, 4);
  assert.equal(
    train.filter((piece) => piece.id.endsWith(":cab:wiper:piece")).length,
    2,
    "стеклоочиститель ровно один на морду",
  );
  // Ливрея НЕ геометрия. Орнаментальный пояс, завитки, шатёр, номер и
  // маркировка стояли отдельными деталями, налепленными на борт, — это
  // читалось наклейками и стоило 138 кусков. Их тут быть не должно.
  for (const stuck of [":ornament:", ":curl:", ":tent:", ":number:", ":marking:"]) {
    assert.equal(withPart(stuck).length, 0, `ливрея деталями: ${stuck}`);
  }
  // На каждой голове одно цельное стекло, но его поверхность выгнута сеткой,
  // а большая тёмная капля вокруг — формованный обвод, не само стекло.
  const windscreens = train.filter(
    (piece) => piece.id.endsWith(":cab:windscreen:piece"),
  );
  const frontMasks = train.filter(
    (piece) => piece.id.endsWith(":cab:front-mask:piece"),
  );
  assert.equal(windscreens.length, 2);
  assert.equal(frontMasks.length, 2);
  assert.ok(windscreens.every((piece) =>
    piece.size[2] >= 1.4 && piece.size[2] <= 1.6));
  assert.ok(windscreens.every((piece) => piece.visualMesh.vertices.length >= 90));
  assert.ok(frontMasks.every((mask, index) =>
    mask.size[2] - windscreens[index].size[2] >= 0.5));
  assert.equal(withPart("cab:mullion:").length, 0);
  assert.equal(withPart("cab:windscreen-mask:").length, 0);
  assert.equal(withPart("cab:windscreen-wing:").length, 0);
  // По одному цельному фигурному боковому стеклу с каждой стороны кабины.
  assert.equal(withPart("cab:side-window:").length, 4);
  // Салон видно сквозь окна: кресла, стойки, петли, схема линии.
  assert.ok(withPart("cabin:seat:").length >= 24);
  assert.ok(withPart("cabin:strap:").length >= 12);
  assert.ok(withPart("cabin:linemap:").length >= 12);
});

test("the rebuilt body has the real broad cab, large glazing and aluminium skin", () => {
  const tip = cabSectionAt(0);
  const shoulder = cabSectionAt(1);
  assert.ok(tip.halfWidth * 2 > CAR_WIDTH * 0.72, "морда снова сошлась в острый клин");
  assert.ok(tip.halfWidth * 2 < CAR_WIDTH * 0.82,
    "торец потерял обязательное каплевидное поджатие");
  assert.ok(shoulder.halfWidth > tip.halfWidth, "кабина не расширяется к кузову");
  assert.ok(bodyHalfWidth(-TRAIN_LENGTH / 2) > CAR_WIDTH / 2 - 0.3);

  const sideWindows = withPart(":window:");
  assert.ok(sideWindows.length >= 20 && sideWindows.length <= 40,
    `борт снова нарезан пикселями: ${sideWindows.length}`);
  assert.ok(sideWindows.every((piece) => piece.size[0] > 1.1));
  assert.equal(withPart("window-mask:").length, 0);
  const sideWindowFrames = withPart(":window-frame:").filter(
    (piece) => !piece.id.includes(":cab:"),
  );
  assert.equal(sideWindowFrames.length, sideWindows.length * 4);
  assert.ok(sideWindows.every((piece) => piece.size[2] >= 0.08),
    "утолщённое акустическое стекло потеряно");

  const aluminium = train.filter(
    (piece) => piece.textureProfile === "matte-aluminium",
  );
  assert.ok(aluminium.length > 70, `алюминиевых панелей: ${aluminium.length}`);
  const exactSkin = train.filter((piece) => piece.visualProfile || piece.visualMesh);
  assert.ok(exactSkin.length > 90, `точных панелей и оболочек: ${exactSkin.length}`);
  const windscreens = train.filter(
    (piece) => piece.id.endsWith(":cab:windscreen:piece"),
  );
  assert.ok(windscreens.every((piece) => piece.visualMesh.vertices.length >= 90));
  assert.ok(windscreens.every((piece) => piece.visualProfile === undefined));

  const cabMeshes = train.filter(
    (piece) => piece.id.includes(":cab:") && piece.visualMesh,
  );
  const cabTriangles = cabMeshes.reduce(
    (sum, piece) => sum + piece.visualMesh.indices.length / 3,
    0,
  );
  assert.ok(cabTriangles < 6000,
    `сглаженные поверхности обеих кабин вышли за бюджет: ${cabTriangles}`);
  assert.ok(cabMeshes.some((piece) => piece.id.includes(":front-mask:")));
  assert.ok(cabMeshes.some((piece) => piece.id.includes(":glass-accent:")));
});

test("the articulation is an open bellows portal with resilient wheels", () => {
  const bellows = withPart(":gangway:");
  assert.ok(bellows.some((piece) => piece.id.includes(":side:")));
  assert.ok(bellows.some((piece) => piece.id.includes(":top:")));
  assert.equal(
    bellows.some((piece) => piece.size[1] > 1 && piece.size[2] > 1),
    false,
    "гармошка снова стала глухой стенкой",
  );
  assert.equal(withPart(":wheel-elastomer:").length, TRAIN_SECTIONS * 2 * 4);
  assert.equal(withPart(":wheel-hub:").length, TRAIN_SECTIONS * 2 * 4);
  assert.equal(withPart(":spring:").length, TRAIN_SECTIONS * 2 * 8);
  assert.equal(train.some((piece) => piece.material === "cloth"), false);
});

test("both cab coupler hoses are mounted in the complete Astana structure", async () => {
  const [{ astanaDocument }, { astanaPrefabLibrary }] = await Promise.all([
    import("../games/make-a-mess/src/content/scenes/astana/astanaDocument.ts"),
    import("../games/make-a-mess/src/content/prefabs/astanaPrefabs.ts"),
  ]);
  const { scene } = compileSceneDocument(
    astanaDocument,
    astanaPrefabLibrary,
    { validateInitialStability: false },
  );
  const unsupportedHoses = [...scene.resolveStructuralCollapse(new Set())]
    .filter((pieceId) => pieceId.includes(":cab:coupler-hose:"));
  assert.deepEqual(unsupportedHoses, []);
});

test("the leading cab owns two lens-rooted night headlight beams", async () => {
  const { astanaScene } = await import(
    "../games/make-a-mess/src/game/astanaScene.ts"
  );
  const lights = astanaScene.spotLightDefinitions.filter(
    (light) => light.carrierClusterId === "astana:lrv-001-2",
  );
  assert.equal(lights.length, 2);
  assert.deepEqual(
    lights.map((light) => light.id.match(/headlight:([lr]):piece$/)?.[1]).sort(),
    ["l", "r"],
  );

  const route = trainFrameAt(trainStopDistance()).along;
  for (const light of lights) {
    const lens = astanaScene.breakablePieceById.get(light.id);
    assert.notEqual(lens, undefined, `${light.id}: no physical lens`);
    const sourceOffset = light.position.map(
      (value, axis) => value - lens.position[axis],
    );
    const forwardOffset = sourceOffset.reduce(
      (sum, value, axis) => sum + value * light.direction[axis],
      0,
    );
    assert.ok(forwardOffset > 0.01 && forwardOffset < 0.03,
      `${light.id}: beam detached from lens by ${forwardOffset}`);
    assert.ok(light.direction[0] * route[0] + light.direction[2] * route[1] > 0.99,
      `${light.id}: beam does not follow the route`);
    assert.ok(light.direction[1] < -0.08 && light.direction[1] > -0.12,
      `${light.id}: beam must rake slightly down`);
    const railHit = (lens.position[1] - RAIL_HEAD) / -light.direction[1];
    assert.ok(railHit > 18 && railHit < 24,
      `${light.id}: beam centre reaches the rail after ${railHit.toFixed(1)} m`);
    assert.equal(light.dayIntensityFactor, 0);
    assert.ok(light.visibleBeam?.length >= 36);
    assert.ok(light.visibleBeam?.sourceRadius < 0.05);
    assert.equal(light.fixtureGlow?.color, lens.color);
  }
});

test("the straight body uses long horizontal panels, not geometric livery", () => {
  const lowerSides = withPart(":lower-side:");
  const upperBelts = withPart(":upper-belt:");
  const windowBands = withPart(":window-band:");
  assert.ok(lowerSides.length >= 12 && lowerSides.length <= 18,
    `борт снова раздроблен: ${lowerSides.length}`);
  assert.ok(lowerSides.every((piece) => piece.size[0] > 1.7));
  assert.equal(upperBelts.length, TRAIN_SECTIONS * 2);
  assert.equal(windowBands.length, TRAIN_SECTIONS * 2);
  assert.equal(new Set(upperBelts.map((piece) => piece.position[1])).size, 1,
    "верхний бирюзовый пояс наклонён на прямом кузове");
  assert.equal(train.filter((piece) => /:side:\d+:/.test(piece.id)).length, 0,
    "ливрея снова нарезана геометрией");
});

test("the train fits the platform and clears the screen doors", () => {
  // Габарит меряется поперёк ПУТИ, а не по радиусу кольца: на станционной
  // вставке путь спрямлён, и радиус вдоль состава сам по себе гуляет на метры.
  const frame = trainFrameAt(trainStopDistance());
  const offsets = train.map(
    (piece) =>
      (piece.position[0] - frame.centre[0]) * frame.inward[0] +
      (piece.position[2] - frame.centre[1]) * frame.inward[1],
  );
  const width = Math.max(...offsets) - Math.min(...offsets);
  assert.ok(width < CAR_WIDTH + 0.3, `состав шире габарита: ${width.toFixed(2)}`);
  // И он не задевает платформенные стенки: те стоят в 1.78 м от оси пути.
  assert.ok(Math.max(...offsets) < 1.7, "борт вошёл в платформенные двери");

  // Секции — отдельные кластеры: состав составной кинематический объект.
  const clusters = new Set(train.map((piece) => piece.clusterId));
  assert.equal(clusters.size, TRAIN_SECTIONS);
});

test("three section bodies start exactly at the authored west platform", () => {
  const definitions = astanaTrainClusterDefinitions();
  const state = initialAstanaTrainState();
  assert.equal(definitions.length, 3);
  assert.equal(new Set(definitions.map((definition) => definition.clusterId)).size, 3);

  for (const [index, definition] of definitions.entries()) {
    const pose = astanaTrainSectionPose(state.distance, index);
    assert.equal(pose.clusterId, definition.clusterId);
    assert.ok(Math.hypot(
      pose.position[0] - definition.origin[0],
      pose.position[2] - definition.origin[2],
    ) < 1e-6, `секция ${index} сдвинута при старте`);
    assert.ok(Math.abs(pose.deltaYaw) < 1e-6, `секция ${index} повёрнута при старте`);
  }
});

test("the runtime articulates its three sections independently on a curve", () => {
  const noseDistance = stationDistance("west") + TRAIN_LENGTH / 2 + 80;
  const poses = Array.from(
    { length: TRAIN_SECTIONS },
    (_, index) => astanaTrainSectionPose(noseDistance, index),
  );
  for (let index = 1; index < poses.length; index += 1) {
    const previous = poses[index - 1];
    const current = poses[index];
    const chord = Math.hypot(
      current.position[0] - previous.position[0],
      current.position[2] - previous.position[2],
    );
    assert.ok(chord > 14.8 && chord < SECTION_LENGTH, `хорда секций: ${chord}`);
    assert.ok(
      Math.abs(current.yaw - previous.yaw) > 0.1,
      "секции остались одним негнущимся бруском",
    );
  }
});

test("every section eases onto and off the platform without a heading step", () => {
  const angleChange = (from, to) => Math.abs(Math.atan2(
    Math.sin(to - from),
    Math.cos(to - from),
  ));
  for (const station of ["east", "north", "west", "south"]) {
    const centre = stationDistance(station);
    for (const join of [
      centre - RING_STRAIGHT_LENGTH / 2,
      centre + RING_STRAIGHT_LENGTH / 2,
    ]) {
      let previous = trainFrameAt(join - 8).yaw;
      let maximum = 0;
      for (let distance = join - 7.75; distance <= join + 8; distance += 0.25) {
        const yaw = trainFrameAt(distance).yaw;
        maximum = Math.max(maximum, angleChange(previous, yaw));
        previous = yaw;
      }
      assert.ok(
        maximum < Math.PI / 225,
        `${station}: секция довернулась рывком на ${(maximum * 180 / Math.PI).toFixed(2)}°`,
      );
    }
  }
});

test("train contact bodies use a structural envelope, not decorative geometry", () => {
  for (const definition of astanaTrainClusterDefinitions()) {
    const members = train.filter((piece) => piece.clusterId === definition.clusterId);
    const colliders = compoundClusterColliders(definition, members, new Set());
    assert.ok(colliders.length >= 60, `${definition.clusterId}: оболочка дырявая`);
    assert.ok(
      colliders.length < members.length / 2,
      `${definition.clusterId}: декоративные детали попали в физику`,
    );
  }
});

test("odometry drifts and every balise wipes the error", () => {
  // Смысл всего механизма: без коррекции ошибка растёт, с балисой обнуляется.
  let state = initialTrainState();
  let maximumError = 0;
  let corrections = 0;
  let previous = state.distance;
  for (let step = 0; step < 20000; step += 1) {
    const next = advanceTrain(state, 1 / 30);
    if (baliseCrossed(previous, next.distance) && next.speed > 0) {
      corrections += 1;
    }
    previous = next.distance;
    state = next;
    maximumError = Math.max(maximumError, Math.abs(odometryError(state)));
  }
  assert.ok(corrections > 4, `коррекций за прогон: ${corrections}`);
  assert.ok(
    maximumError < 1.2,
    `одометрия уплыла на ${maximumError.toFixed(2)} м — балисы не работают`,
  );
  // Дрейф вообще должен существовать: иначе балисы декорация.
  assert.ok(ODOMETRY_SLIP > 0);
});

test("the train stops where the balise says, and opens doors only then", () => {
  let state = initialTrainState();
  const firstStop = state.stopIndex;
  let boarded = null;
  for (let step = 0; step < 40000 && !boarded; step += 1) {
    const next = advanceTrain(state, 1 / 30);
    if (next.mode === "boarding" && state.mode !== "boarding") {
      boarded = { ...state, ...next };
    }
    state = next;
  }
  assert.ok(boarded, "состав так и не доехал до следующей платформы");
  const stops = ringStops();
  const target = stops[firstStop % stops.length].distance;
  const error = Math.abs(distanceAhead(boarded.distance, target) > 300
    ? distanceAhead(boarded.distance, target) - 613.2
    : distanceAhead(boarded.distance, target));
  assert.ok(
    error <= DOOR_ENABLE_TOLERANCE,
    `встал в ${error.toFixed(2)} м от точки остановки`,
  );
  // Двери открываются только на стоянке.
  assert.equal(trainEventState({ ...boarded, mode: "cruise" }), "cruise");
  assert.equal(trainEventState({ ...boarded, mode: "boarding" }), "docked");
  assert.equal(trainEventState({ ...boarded, mode: "closing" }), "attention");
});

test("the ring radius, not the motor, sets the line speed", () => {
  // Кольцо радиусом 98 м — постоянная кривая, и она держит скорость: это и
  // объясняет, почему настоящая линия при 80 км/ч конструкционных едет 40.
  // Точку берём заведомо на дуге: вставка занимает ±26 м вокруг станции.
  const arc = curveSpeedLimit(stationDistance("east") + 60);
  assert.ok(arc < 11 && arc > 9, `предел на дуге: ${arc.toFixed(2)} м/с`);
  assert.ok(curveSpeedLimit(stationDistance("east")) > arc, "на вставке путь прямой");
  assert.equal(brakingSpeedLimit(0), 0);
  // Тормозная кривая честная: чтобы разрешить конструкционные 80 км/ч, до
  // остановки должно оставаться больше двухсот метров — а весь перегон
  // кольца короче. Поэтому состав и не разгоняется до предела никогда.
  assert.ok(brakingSpeedLimit(200) < TRAIN_LIMITS.maximumSpeed);
  assert.ok(brakingSpeedLimit(250) > TRAIN_LIMITS.maximumSpeed);
  assert.ok(brakingSpeedLimit(60) > arc, "к платформе подходят с дуговой скорости");
});

test("balises sit on the track the train actually runs on", () => {
  // Расписание автопилота и разметка пути обязаны совпадать до сантиметра.
  const stops = ringStops();
  const balises = ringBalises().filter((balise) => balise.kind === "stop");
  assert.equal(stops.length, balises.length);
  for (const stop of stops) {
    assert.ok(
      balises.some((balise) => Math.abs(balise.distance - stop.distance) < 0.01),
      `у остановки ${stop.station} нет балисы точки остановки`,
    );
  }
});
