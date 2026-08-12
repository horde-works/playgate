import assert from "node:assert/strict";
import test from "node:test";
import {
  LANDING_READY_SECONDS,
  pilotStatusKey,
  rotorcraftPilotStatusOf,
  rotorcraftProximitySectors,
} from "../games/make-a-mess/src/game/rotorcraftPilotStatus.ts";

/**
 * ПРИБОРНАЯ ДОСКА РУЧНОГО ПОЛЁТА.
 *
 * До выноса из компонента это не было покрыто ничем — при том, что по этим
 * числам человек решает, снижаться ему или уходить. Молча переставленный
 * сектор врёт не хуже сломанного датчика, и заметить это можно было бы только
 * глазами и только в полёте.
 */

/** Нос вдоль +Z, как у машин полигона. */
const NOSE = [0, 0, 1];

function reading(localNormal, distance, sensorIndex = 0) {
  return { localNormal, distance, sensorIndex };
}

function statusOf(overrides = {}) {
  return rotorcraftPilotStatusOf({
    pilot: {
      mode: "hover",
      targetAltitude: 12.34,
      sensorAssistEnabled: true,
      landingStableSeconds: 0,
    },
    nose: NOSE,
    forward: [0, 0, 1],
    position: [3, 41.27, -5],
    velocity: [3, -1.24, 4],
    attitude: { pitch: 0.1, roll: -0.2 },
    obstacleReadings: [],
    intervenedSensors: new Set(),
    motorOutput: [0.4567, 0.1234],
    ...overrides,
  });
}

test("дальномеры раскладываются по секторам корпуса, а не по номерам", () => {
  const sectors = rotorcraftProximitySectors(
    NOSE,
    [
      reading([0, 0, 1], 4, 0),
      reading([0, 0, -1], 5, 1),
      reading([1, 0, 0], 6, 2),
      reading([-1, 0, 0], 7, 3),
      reading([0, 1, 0], 8, 4),
      reading([0, -1, 0], 9, 5),
    ],
    new Set(),
  );
  assert.equal(sectors.fore.distance, 4);
  assert.equal(sectors.aft.distance, 5);
  // Соглашение проекта: у носа вдоль +Z правый борт — это −X (`nose × up`).
  assert.equal(sectors.port.distance, 6, "+X при носе +Z — это левый борт");
  assert.equal(sectors.starboard.distance, 7);
  assert.equal(sectors.above.distance, 8);
  assert.equal(sectors.below.distance, 9);
});

test("вертикаль отбирается ПЕРВОЙ: пол и потолок важнее борта", () => {
  // Нормаль с большой вертикальной долей — это пол под машиной, даже если у
  // неё есть и горизонтальная составляющая.
  const sectors = rotorcraftProximitySectors(
    NOSE,
    [reading([0.7, 0.7, 0], 3, 0)],
    new Set(),
  );
  assert.equal(sectors.above.distance, 3);
  assert.equal(sectors.port.distance, null);
});

test("в секторе остаётся БЛИЖАЙШЕЕ показание", () => {
  const sectors = rotorcraftProximitySectors(
    NOSE,
    [reading([0, 0, 1], 9, 0), reading([0, 0, 1], 2, 1), reading([0, 0, 1], 5, 2)],
    new Set(),
  );
  assert.equal(sectors.fore.distance, 2);
});

test("признак вмешательства ЛИПКИЙ и переживает более близкое показание", () => {
  // Иначе прибор гасил бы предупреждение ровно тогда, когда автоматика уже
  // вмешалась: ближний датчик молчит, а вмешался дальний в том же секторе.
  const sectors = rotorcraftProximitySectors(
    NOSE,
    [reading([0, 0, 1], 2, 0), reading([0, 0, 1], 9, 1)],
    new Set([1]),
  );
  assert.equal(sectors.fore.distance, 2, "ближайшее показание сохранено");
  assert.equal(sectors.fore.intervening, true, "вмешательство не потеряно");
});

test("пустой сектор честно пуст, а не ноль", () => {
  // Ноль означал бы «препятствие вплотную» — самая опасная подмена на доске.
  const sectors = rotorcraftProximitySectors(NOSE, [], new Set());
  for (const sector of Object.values(sectors)) {
    assert.equal(sector.distance, null);
    assert.equal(sector.intervening, false);
  }
});

test("показания округляются до десятых, а моторы до сотых", () => {
  const status = statusOf();
  assert.equal(status.targetAltitude, 12.3);
  assert.equal(status.currentAltitude, 41.3);
  assert.equal(status.verticalSpeed, -1.2);
  assert.equal(status.groundSpeed, 5, "√(3²+4²) = 5");
  assert.deepEqual(status.motorOutput, [0.46, 0.12]);
});

test("курс берётся от МИРОВОГО носа, а секторы — от авторского", () => {
  // Это разные векторы, и слить их — значит развернуть всю картину
  // препятствий вместе с машиной.
  const status = rotorcraftPilotStatusOf({
    pilot: {
      mode: "hover",
      targetAltitude: 0,
      sensorAssistEnabled: false,
      landingStableSeconds: 0,
    },
    nose: NOSE,
    // Машина развёрнута носом на +X.
    forward: [1, 0, 0],
    position: [0, 0, 0],
    velocity: [0, 0, 0],
    attitude: { pitch: 0, roll: 0 },
    obstacleReadings: [reading([0, 0, 1], 4, 0)],
    intervenedSensors: new Set(),
    motorOutput: [],
  });
  assert.equal(Math.round(status.heading), 90, "нос на +X — это курс 90°");
  assert.equal(
    status.proximity.fore.distance,
    4,
    "препятствие впереди осталось впереди: нормали местные",
  );
});

test("готовность к посадке — это порог, а не мнение", () => {
  const notYet = statusOf({
    pilot: {
      mode: "landing",
      targetAltitude: 0,
      sensorAssistEnabled: false,
      landingStableSeconds: LANDING_READY_SECONDS - 0.01,
    },
  });
  assert.equal(notYet.landingReady, false);
  const ready = statusOf({
    pilot: {
      mode: "landing",
      targetAltitude: 0,
      sensorAssistEnabled: false,
      landingStableSeconds: LANDING_READY_SECONDS,
    },
  });
  assert.equal(ready.landingReady, true);
});

test("живучесть каналов неизвестна — нули, а не пустота", () => {
  // Пустой список читался бы как «моторов нет», а это другое утверждение.
  const unknown = statusOf();
  assert.deepEqual(unknown.motorAvailability, [0, 0]);
  const known = statusOf({ propulsionFeedback: [1, 0.333] });
  assert.deepEqual(known.motorAvailability, [1, 0.33]);
});

test("ключ против дребезга не будит доску на сотых долях угла", () => {
  const calm = statusOf({ attitude: { pitch: 0.1, roll: -0.2 } });
  const trembling = statusOf({ attitude: { pitch: 0.1002, roll: -0.2003 } });
  assert.equal(
    pilotStatusKey(calm),
    pilotStatusKey(trembling),
    "дрожь корпуса — не новость для приборной доски",
  );
});

test("ключ ЗАМЕЧАЕТ настоящее изменение показаний", () => {
  const base = statusOf();
  for (const changed of [
    statusOf({ position: [3, 42.5, -5] }),
    statusOf({ velocity: [3, -2.4, 4] }),
    statusOf({ attitude: { pitch: 0.4, roll: -0.2 } }),
    statusOf({ motorOutput: [0.9, 0.1234] }),
    statusOf({ obstacleReadings: [reading([0, 0, 1], 3, 0)] }),
    statusOf({ propulsionFeedback: [1, 1] }),
  ]) {
    assert.notEqual(
      pilotStatusKey(base),
      pilotStatusKey(changed),
      "изменение показания обязано пройти сквозь ключ",
    );
  }
});
