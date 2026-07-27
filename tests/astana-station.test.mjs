import assert from "node:assert/strict";
import test from "node:test";
import { astanaScene } from "../games/make-a-mess/src/game/astanaScene.ts";
import {
  RING_RADIUS,
  TRAIN_LENGTH,
  astanaStations,
} from "../games/make-a-mess/src/content/scenes/astana/astanaPlan.ts";
import {
  DOORWAYS,
  PLATFORM_LENGTH,
  PLATFORM_Y,
} from "../games/make-a-mess/src/content/scenes/astana/astanaStation.ts";

const pieces = astanaScene.breakablePieces;
const ofStation = (station, part) =>
  pieces.filter((piece) => piece.id.includes(`:${station}:`) && piece.id.includes(part));

test("all four stations are built to one drawing", () => {
  // Вердикт заказчика: станции типовые. Значит опись деталей у всех четырёх
  // совпадает до штуки — расхождение означает, что одну где-то упростили.
  const inventories = astanaStations.map((station) => {
    const counts = new Map();
    for (const piece of pieces) {
      if (!piece.id.includes(`:${station.id}:`)) {
        continue;
      }
      // Отбрасываем имя станции и номера — остаётся род детали.
      const kind = piece.id
        .replace(`:${station.id}:`, ":")
        .replace(/:\d+/g, ":N");
      counts.set(kind, (counts.get(kind) ?? 0) + 1);
    }
    return counts;
  });

  const [reference] = inventories;
  assert.ok(reference.size > 40, `родов деталей на станции: ${reference.size}`);
  for (let index = 1; index < inventories.length; index += 1) {
    const other = inventories[index];
    assert.deepEqual(
      [...other].sort(),
      [...reference].sort(),
      `станция ${astanaStations[index].id} собрана не по типовому чертежу`,
    );
  }
});

test("the platform is a single one, and always on the inner side", () => {
  // В отличие от оригинала платформа одна и смотрит в центр острова: путь
  // односторонний, и всё, что относится к посадке, обязано быть внутри
  // кольца. Проверяется по радиусу: платформа ближе к центру, чем путь.
  for (const station of astanaStations) {
    const slabs = ofStation(station.id, ":slab:");
    assert.ok(slabs.length >= 5, `${station.id}: плита платформы секциями`);
    const trackRadius = Math.hypot(station.center[0], station.center[1]);
    for (const slab of slabs) {
      const radius = Math.hypot(slab.position[0], slab.position[2]);
      assert.ok(
        radius < trackRadius,
        `${slab.id} оказалась снаружи кольца: ${radius.toFixed(1)} при пути ${trackRadius.toFixed(1)}`,
      );
    }
    // Ни одной детали станции по внешнюю сторону пути дальше габарита опоры.
    for (const piece of pieces.filter((item) => item.id.includes(`:${station.id}:`))) {
      const radius = Math.hypot(piece.position[0], piece.position[2]);
      assert.ok(
        radius < RING_RADIUS + 4,
        `${piece.id} вылез наружу кольца: ${radius.toFixed(1)}`,
      );
    }
  }
});

test("the screen doors line up with the train, and the platform outlasts it", () => {
  // Платформа длиннее состава на четыре метра — это допуск на точность
  // остановки, ради которого и стоят балисы.
  assert.equal(PLATFORM_LENGTH, TRAIN_LENGTH + 4);
  for (const station of astanaStations) {
    const leaves = ofStation(station.id, ":psd:leaf:");
    assert.equal(leaves.length, DOORWAYS * 2, `${station.id}: по две створки на проём`);
    const posts = ofStation(station.id, ":psd:mullion:");
    assert.equal(posts.length, DOORWAYS + 1, `${station.id}: стойка на каждый край проёма`);
    for (const leaf of leaves) {
      assert.ok(
        leaf.position[1] > PLATFORM_Y && leaf.position[1] < PLATFORM_Y + 2.6,
        `${leaf.id} висит не на уровне дверей вагона`,
      );
    }
  }
});

test("the climb to the platform is broken by a mezzanine, and every way up exists", () => {
  // Двенадцать метров подъёма прямым маршем не берутся: марш ушёл бы за
  // кромку платформы прямо над путём. Поэтому подъём в два плеча, и на
  // каждом плече есть и лестница, и эскалатор, а лифт идёт насквозь.
  for (const station of astanaStations) {
    for (const flight of ["stair-lower", "stair-upper", "escalator-lower", "escalator-upper"]) {
      const steps = ofStation(station.id, `:${flight}:step:`);
      assert.ok(steps.length >= 14, `${station.id}: у марша ${flight} ступеней ${steps.length}`);
      const heights = steps.map((step) => step.position[1]);
      assert.ok(
        Math.max(...heights) - Math.min(...heights) > 3,
        `${station.id}: марш ${flight} никуда не поднимается`,
      );
    }
    assert.ok(ofStation(station.id, ":lift-car").length === 1);
    assert.ok(ofStation(station.id, ":mezzanine:slab:").length >= 3);
    assert.ok(ofStation(station.id, ":gallery:slab:").length >= 3);
    // Верхняя площадка вровень с платформой, мезонин — примерно на полпути.
    for (const slab of ofStation(station.id, ":gallery:slab:")) {
      assert.ok(Math.abs(slab.position[1] + 0.22 - PLATFORM_Y) < 0.01);
    }
  }
});

test("nothing on a station starts unsupported", () => {
  assert.equal(astanaScene.resolveStructuralCollapse(new Set()).size, 0);
});
