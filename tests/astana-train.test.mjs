import assert from "node:assert/strict";
import test from "node:test";
import { astanaScene } from "../games/make-a-mess/src/game/astanaScene.ts";
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
  ringBalises,
  stationDistance,
} from "../games/make-a-mess/src/content/scenes/astana/astanaPlan.ts";
import {
  CAR_WIDTH,
  SECTION_LENGTH,
  TRAIN_SECTIONS,
  liveryWaveY,
  trainFrameAt,
  trainStopDistance,
} from "../games/make-a-mess/src/content/scenes/astana/astanaTrain.ts";

const pieces = astanaScene.breakablePieces;
const train = pieces.filter((piece) => piece.id.includes("lrv-001"));
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
  assert.equal(withPart("door-edge:").length, TRAIN_SECTIONS * 2 * 2 * 2);
  // Две головы: у обеих морда со стеклом, табло, фарами и одним дворником.
  assert.equal(withPart("cab:windscreen:").length, 2);
  assert.equal(withPart("cab:route-board").length, 2);
  assert.equal(withPart("cab:headlight:").length, 4);
  assert.equal(withPart("cab:wiper").length, 2, "стеклоочиститель ровно один на морду");
  // Ливрея, орнамент, номер.
  assert.ok(withPart(":ornament:").length >= 50, "орнаментальный пояс");
  assert.ok(withPart(":tent:").length >= 6, "шатёр на головной секции");
  assert.equal(withPart(":number:").length, TRAIN_SECTIONS * 2);
  // Салон видно сквозь окна: кресла, стойки, петли, схема линии.
  assert.ok(withPart("cabin:seat:").length >= 24);
  assert.ok(withPart("cabin:strap:").length >= 12);
  assert.ok(withPart("cabin:linemap:").length >= 12);
});

test("the livery wave rises to the cab and stays low at the middle", () => {
  // Волна — главная узнаваемая вещь. Она обязана расти монотонно к голове.
  const middle = liveryWaveY(22.5);
  const shoulder = liveryWaveY(8);
  const nose = liveryWaveY(0);
  assert.ok(nose > shoulder && shoulder > middle, `${middle} ${shoulder} ${nose}`);
  assert.ok(nose - middle > 1.6, "у кабины волна должна уходить выше окон");

  // И она действительно покрасила борт в два цвета, а не в один.
  const teal = withPart(":teal").length;
  const grey = withPart(":grey").length;
  assert.ok(teal > 60 && grey > 60, `бирюза ${teal}, серый ${grey}`);
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
