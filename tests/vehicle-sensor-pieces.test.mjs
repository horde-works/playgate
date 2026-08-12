import assert from "node:assert/strict";
import test from "node:test";
import { combatHexacopterRangeScene } from "../games/make-a-mess/src/game/combatHexacopterRangeScene.ts";
import {
  COMBAT_HEXACOPTER_RANGE_AIR_VEHICLE,
  DUCT_HEXACOPTER_RANGE_AIR_VEHICLE,
} from "../games/make-a-mess/src/game/airVehicles.ts";
import { vehicleSensorPieces } from "../games/make-a-mess/src/game/vehicleFrames.ts";

/**
 * ДАТЧИКИ ПРИНАДЛЕЖАТ ДЕТАЛЯМ, А НЕ ИДЕАЛЬНОМУ ОБВОДУ.
 *
 * Наблюдение Igor (12.08.2026): «по-прежнему сенсоры дистанции образуют
 * собственный геометрический контур, а не закреплены к своим деталям… то, что
 * они отдельно, — бардак».
 *
 * Так и было: датчики объявлены точками в осях кадра, и рантайм считал их
 * положение жёстко от начала машины. Оторванная гондола улетала, а её датчик
 * оставался висеть на прежнем месте — машина «видела» тем, чего у неё уже нет.
 */

const piecesOf = (clusterId) =>
  combatHexacopterRangeScene.breakablePieces.filter(
    (piece) => piece.clusterId === clusterId,
  );

const FLEET = [
  ["RAX-8", COMBAT_HEXACOPTER_RANGE_AIR_VEHICLE, "combat-hexacopter-range:vehicle"],
  ["VX-8", DUCT_HEXACOPTER_RANGE_AIR_VEHICLE, "combat-hexacopter-range:duct-vehicle"],
];

test("У КАЖДОГО ДАТЧИКА ЕСТЬ СВОЯ ДЕТАЛЬ", () => {
  for (const [name, vehicle, clusterId] of FLEET) {
    const pieces = piecesOf(clusterId);
    assert.ok(pieces.length > 0, `${name}: кластер пуст`);
    assert.ok(
      vehicle.proximitySensors.length > 0,
      `${name}: машина осталась без датчиков`,
    );
    const owners = vehicleSensorPieces(vehicle.proximitySensors, pieces);
    assert.equal(owners.length, vehicle.proximitySensors.length);
    const known = new Set(pieces.map((piece) => piece.id));
    for (const [index, owner] of owners.entries()) {
      assert.ok(
        known.has(owner),
        `${name}: датчик ${index} привязан к несуществующей детали «${owner}»`,
      );
    }
  }
});

test("ДАТЧИК СИДИТ НА СВОЕЙ ДЕТАЛИ, А НЕ РЯДОМ С НЕЙ", () => {
  // Привязка обязана быть тесной: датчик, оказавшийся в метрах от своего
  // куска, — это не привязка, а ближайший сосед по пустому месту.
  for (const [name, vehicle, clusterId] of FLEET) {
    const pieces = piecesOf(clusterId);
    const byId = new Map(pieces.map((piece) => [piece.id, piece]));
    const owners = vehicleSensorPieces(vehicle.proximitySensors, pieces);
    let worst = 0;
    for (const [index, owner] of owners.entries()) {
      const piece = byId.get(owner);
      const sensor = vehicle.proximitySensors[index];
      const radius = Math.hypot(...piece.size) / 2;
      const gap =
        Math.hypot(
          sensor.point[0] - piece.position[0],
          sensor.point[1] - piece.position[1],
          sensor.point[2] - piece.position[2],
        ) - radius;
      worst = Math.max(worst, gap);
    }
    assert.ok(
      worst < 0.6,
      `${name}: самый дальний датчик в ${worst.toFixed(2)} м от поверхности своей детали`,
    );
  }
});

test("ОБВОД РВЁТСЯ ТАМ, ГДЕ РВЁТСЯ МАШИНА — и вот насколько крупно", () => {
  // Если бы привязка сваливала все датчики на один кусок, она была бы
  // бессмысленной: машина теряла бы либо весь обвод разом, либо ничего.
  // Здесь записан ЗАМЕР, а не выдуманный порог, — и он же честно показывает
  // грубость привязки, которую стоит знать.
  const measured = FLEET.map(([name, vehicle, clusterId]) => {
    const owners = vehicleSensorPieces(
      vehicle.proximitySensors,
      piecesOf(clusterId),
    );
    const tally = new Map();
    for (const owner of owners) {
      tally.set(owner, (tally.get(owner) ?? 0) + 1);
    }
    return `${name}: ${owners.length} -> ${tally.size}, крупнейшая доля ${Math.max(...tally.values())}`;
  });

  // Замер 12.08.2026.
  //
  // RAX-8: шесть кольцевых датчиков достались своим гондолам поимённо, а
  // шестнадцать корпусных — единой бронированной оболочке. Это не изъян
  // привязки, а свойство машины: её корпус ОДИН кусок, и терять его по частям
  // она не умеет.
  //
  // VX-8 грубее: четырнадцать из шестнадцати легли на две внешние балки. Его
  // тоннели подвешены к ним, и ближайшая поверхность у бортовых датчиков —
  // именно балка. Обвод у него порвётся по бортам, а не по тоннелям; если это
  // окажется мало, следующий шаг — привязка не к ближайшему куску, а к КУСТУ
  // деталей узла, и её надо будет объявлять паспортом.
  assert.deepEqual(measured, [
    "RAX-8: 22 -> 7, крупнейшая доля 16",
    "VX-8: 16 -> 4, крупнейшая доля 7",
  ]);
});
