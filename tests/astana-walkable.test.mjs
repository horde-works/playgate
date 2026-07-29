import assert from "node:assert/strict";
import test from "node:test";
import { astanaScene } from "../games/make-a-mess/src/game/astanaScene.ts";
import {
  PLAYER_HEIGHT,
  walkRoute,
} from "../games/make-a-mess/src/game/walkableRoute.ts";
import { PLATFORM_Y } from "../games/make-a-mess/src/content/scenes/astana/astanaRing.ts";
import {
  astanaStations,
  ringPathPoint,
  stationDistance,
} from "../games/make-a-mess/src/content/scenes/astana/astanaPlan.ts";
import {
  CORE_START_T,
  DECK_TOP_T,
  ESCALATOR_LANE,
  STAIR_LANE,
  stationApproach,
} from "../games/make-a-mess/src/content/scenes/astana/astanaStation.ts";

// Станции типовые, и это доказано отдельно: `astana-station` сверяет опись
// деталей всех четырёх до штуки. Поэтому маршруты гоняем по одной, эталонной
// «Нұрлы жол» — иначе четыре поиска в ширину по сорок тысяч клеток каждый
// превращают сюиту в минуты ради того же ответа.
const STATION = "west";
const STATION_ID = astanaStations.find((station) => station.compass === STATION)?.id;
assert.ok(STATION_ID);

function stationFrame() {
  const distance = stationDistance(STATION);
  const centre = ringPathPoint(distance);
  const ahead = ringPathPoint(distance + 1);
  const behind = ringPathPoint(distance - 1);
  const dx = ahead[0] - behind[0];
  const dz = ahead[1] - behind[1];
  const length = Math.hypot(dx, dz);
  const along = [dx / length, dz / length];
  const radius = Math.hypot(centre[0], centre[1]);
  return { centre, along, inward: [-centre[0] / radius, -centre[1] / radius] };
}

const frame = stationFrame();
const at = (t, w) => ({
  x: frame.centre[0] + frame.along[0] * t + frame.inward[0] * w,
  z: frame.centre[1] + frame.along[1] * t + frame.inward[1] * w,
});

const BOX = 48;
const bounds = {
  minX: frame.centre[0] - BOX,
  maxX: frame.centre[0] + BOX,
  minZ: frame.centre[1] - BOX,
  maxZ: frame.centre[1] + BOX,
  floorY: -1.2,
  ceilingY: PLATFORM_Y + 1.5,
};

/** Полоса вокруг коридора: ею отсекаем «прошёл, но по соседней вертикали». */
function laneBounds(lane, halfWidth) {
  const a = at(-30, lane - halfWidth);
  const b = at(30, lane + halfWidth);
  const c = at(-30, lane + halfWidth);
  const d = at(30, lane - halfWidth);
  const xs = [a.x, b.x, c.x, d.x];
  const zs = [a.z, b.z, c.z, d.z];
  return {
    ...bounds,
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
  };
}

function localBounds(fromT, toT, fromW, toW) {
  const corners = [
    at(fromT, fromW), at(fromT, toW),
    at(toT, fromW), at(toT, toW),
  ];
  return {
    ...bounds,
    minX: Math.min(...corners.map((corner) => corner.x)),
    maxX: Math.max(...corners.map((corner) => corner.x)),
    minZ: Math.min(...corners.map((corner) => corner.z)),
    maxZ: Math.max(...corners.map((corner) => corner.z)),
  };
}

const approach = stationApproach();
const street = { ...at(approach.t, approach.w), footY: 0.06 };
const platform = { ...at(0, 4.32), footY: PLATFORM_Y };

function describe(result) {
  return `дошёл до ${result.closestDistance.toFixed(1)} м, помеха ${result.blockedBy ?? "—"} (${result.blockReason}), обойдено клеток ${result.visited}`;
}

test("a passenger walks from the street onto the platform", () => {
  // Главные ворота приёмки станции. Опись деталей и нулевое обрушение этого
  // НЕ доказывают: прошлая сборка была полной по описи и запечатанной для
  // человека — фасад без дверей, марши в сплошных плитах, колонны в полосе
  // лестницы. «Есть деталь с нужным id» не равно «можно пройти».
  const result = walkRoute(astanaScene.breakablePieces, street, platform, {
    bounds, cell: 0.32,
  });
  assert.ok(result.reached, `улица → платформа: ${describe(result)}`);
});

test("and walks back out again", () => {
  // Обратный маршрут отдельным тестом: выход с платформы легко забыть,
  // когда лестница задумана «на подъём».
  const result = walkRoute(astanaScene.breakablePieces, platform, street, {
    bounds, cell: 0.32,
  });
  assert.ok(result.reached, `платформа → улица: ${describe(result)}`);
});

test("both the stair and the escalator carry a passenger on their own", () => {
  // Каждая вертикаль обязана работать сама по себе: поиск заперт в полосу
  // своего коридора, поэтому «прошёл по соседней» не засчитывается. Старт —
  // от подножия ядра на оплаченной стороне, иначе полоса отрезала бы зал.
  for (const [name, lane] of [["лестница", STAIR_LANE], ["эскалатор", ESCALATOR_LANE]]) {
    const foot = { ...at(CORE_START_T + 1.4, lane), footY: 0.4 };
    // Цель — верхняя площадка на той же полосе: доказываем сам подъём, а
    // выход с площадки на платформу проверяют первые два теста.
    const top = { ...at(DECK_TOP_T - 3, lane), footY: PLATFORM_Y };
    const result = walkRoute(astanaScene.breakablePieces, foot, top, {
      bounds: laneBounds(lane, 2.2), cell: 0.32,
    });
    assert.ok(result.reached, `${name}: ${describe(result)}`);
  }
});

test("the way up keeps a full standing height all along", () => {
  // Просвет — это не «примерно два метра»: капсула игрока 1.62 м, и любая
  // плита, срезающая марш, ловится тем же поиском при завышенной высоте.
  const result = walkRoute(astanaScene.breakablePieces, street, platform, {
    bounds, cell: 0.32, height: PLAYER_HEIGHT + 0.35,
  });
  assert.ok(result.reached, `с запасом по росту: ${describe(result)}`);
});

test("every turnstile has a traversable passenger lane", () => {
  const gatePieces = astanaScene.breakablePieces.filter((piece) =>
    piece.id.includes(`:station-concourse:${STATION_ID}:gate:`));
  const hallFloor = astanaScene.breakablePieces.find((piece) =>
    piece.id.includes(`:station-concourse:${STATION_ID}:hall-floor`));
  assert.ok(hallFloor);
  const floorY = hallFloor.position[1] + hallFloor.size[1] / 2;

  for (let gate = 0; gate < 4; gate += 1) {
    const pair = gatePieces.filter((piece) => piece.id.includes(`:gate:${gate}:`));
    assert.equal(pair.length, 2);
    const centre = pair.reduce((sum, piece) => {
      const dx = piece.position[0] - frame.centre[0];
      const dz = piece.position[2] - frame.centre[1];
      return sum + dx * frame.along[0] + dz * frame.along[1];
    }, 0) / pair.length;
    const outside = { ...at(centre, 18), footY: floorY };
    const inside = { ...at(centre, 14.4), footY: floorY };
    const result = walkRoute(astanaScene.breakablePieces, outside, inside, {
      bounds: localBounds(centre - 0.42, centre + 0.42, 14, 18.4),
      cell: 0.12,
    });
    assert.ok(result.reached, `турникет ${gate}: ${describe(result)}`);
  }
});
