import assert from "node:assert/strict";
import test from "node:test";
import {
  RING_RADIUS,
  RING_STRAIGHT_OFFSET,
  astanaAreas,
  astanaBridges,
  astanaStations,
  astanaWays,
  insideValley,
  onBridge,
  onSolidGround,
  ringRiverCrossings,
  valleyHalfWidth,
} from "../games/make-a-mess/src/content/scenes/astana/astanaPlan.ts";
import {
  WORLD_RADIUS,
  groundKindAt,
  riverAxisZ,
} from "../games/make-a-mess/src/content/scenes/astana/astanaShell.ts";

const wayById = new Map(astanaWays.map((way) => [way.id, way]));

test("every line stays on the island", () => {
  for (const way of astanaWays) {
    for (const [x, z] of way.points) {
      assert.ok(
        onSolidGround(x, z),
        `${way.id}: точка ${x.toFixed(1)}, ${z.toFixed(1)} вне суши`,
      );
    }
  }
});

test("the valley is crossed only by bridges and ramps", () => {
  // Главное правило разметки: долина Есиля — преграда. Тротуар, проспект или
  // дворовый проезд не имеют права идти по пойме и руслу.
  for (const way of astanaWays) {
    if (way.kind === "bridge" || way.kind === "ramp" || way.kind === "promenade") {
      continue;
    }
    for (const [x, z] of way.points) {
      if (!insideValley(x, z)) {
        continue;
      }
      assert.ok(
        onBridge(x, z),
        `${way.id}: точка ${x.toFixed(1)}, ${z.toFixed(1)} лезет в долину мимо моста`,
      );
    }
  }
});

test("bridges span the whole valley, both ends on solid ground", () => {
  // Два городских моста и два пролёта кольца — больше долину пересечь негде.
  assert.equal(astanaBridges.length, 4, "мостов должно быть четыре");
  assert.equal(astanaBridges.filter((bridge) => bridge.onRing).length, 2);

  for (const bridge of astanaBridges) {
    const first = bridge.axis[0];
    const last = bridge.axis[bridge.axis.length - 1];
    // Пролёт начинается и кончается ЗА долиной: опоры не встают в пойму.
    assert.ok(
      !insideValley(first[0], first[1]),
      `${bridge.id}: начало пролёта в пойме`,
    );
    assert.ok(
      !insideValley(last[0], last[1]),
      `${bridge.id}: конец пролёта в пойме`,
    );
    if (!bridge.onRing) {
      assert.ok(wayById.has(`bridge-${bridge.id}`), `у моста ${bridge.id} нет линии`);
      assert.equal(groundKindAt(first[0], first[1]), "land");
      assert.equal(groundKindAt(last[0], last[1]), "land");
    }
  }
});

test("ramps go from the floodplain down to the riverbed", () => {
  const ramps = astanaWays.filter((way) => way.kind === "ramp");
  assert.ok(ramps.length >= 3, `съездов в русло: ${ramps.length}`);
  for (const ramp of ramps) {
    const start = ramp.points[0];
    const end = ramp.points[ramp.points.length - 1];
    assert.notEqual(groundKindAt(start[0], start[1]), "bed", `${ramp.id} начинается в русле`);
    assert.equal(groundKindAt(end[0], end[1]), "bed", `${ramp.id} не доходит до дна`);
  }
});

test("the ring keeps its radius and crosses the river twice", () => {
  const ring = wayById.get("turan-ring");
  assert.ok(ring);
  // Кольцо — четыре дуги радиуса 98 и четыре прямые станционные вставки,
  // которые спрямляют путь внутрь ровно на RING_STRAIGHT_OFFSET.
  for (const [x, z] of ring.points) {
    const radius = Math.hypot(x, z);
    assert.ok(
      radius <= RING_RADIUS + 0.5
        && radius >= RING_RADIUS - RING_STRAIGHT_OFFSET - 0.5,
      `кольцо сбилось с пути: радиус ${radius.toFixed(2)}`,
    );
  }
  assert.ok(
    ring.points.some(
      ([x, z]) => Math.hypot(x, z) < RING_RADIUS - RING_STRAIGHT_OFFSET + 0.3,
    ),
    "на кольце нет ни одной прямой вставки",
  );
  assert.equal(ringRiverCrossings.length, 2, "кольцо обязано переходить реку дважды");
  for (const [x, z] of ringRiverCrossings) {
    assert.equal(groundKindAt(x, z), "bed", `переход кольца ${x}, ${z} не над руслом`);
  }
});

test("four real stations stand at the four compass points", () => {
  assert.equal(astanaStations.length, 4);
  const compass = astanaStations.map((station) => station.compass).sort();
  assert.deepEqual(compass, ["east", "north", "south", "west"]);

  // Каждая станция — на кольце, на суше, и за её причалом свой мир.
  const worlds = new Set();
  for (const station of astanaStations) {
    const [x, z] = station.center;
    // Станция стоит в середине своей прямой вставки: это самая внутренняя
    // точка пути, а не точка окружности.
    assert.ok(
      Math.abs(Math.hypot(x, z) - (RING_RADIUS - RING_STRAIGHT_OFFSET)) < 0.5,
      `${station.id} не в середине станционной вставки`,
    );
    assert.ok(onSolidGround(x, z), `${station.id} стоит не на суше`);
    assert.ok(station.kazakh.length > 0 && station.russian.length > 0);
    worlds.add(station.berthTo);
  }
  assert.equal(worlds.size, 4, "четыре причала должны вести в четыре разных мира");
});

test("the northern station really is across the river", () => {
  // Композиция острова: старый Целиноград отрезан долиной, и попасть к нему
  // можно только мостом — иначе вся идея правого берега рассыпается.
  const north = astanaStations.find((station) => station.compass === "north");
  assert.ok(north.center[1] > riverAxisZ(north.center[0]) + valleyHalfWidth(north.center[0]));
});

test("the whole network is one connected graph", () => {
  // Связность считается по концам линий: разметка, распавшаяся на острова,
  // означает кварталы, в которые житель не дойдёт.
  const nodes = [];
  const nodeOf = (point) => {
    for (const [index, node] of nodes.entries()) {
      if (Math.hypot(node[0] - point[0], node[1] - point[1]) < 3.5) {
        return index;
      }
    }
    nodes.push(point);
    return nodes.length - 1;
  };

  const links = new Map();
  const link = (a, b) => {
    if (!links.has(a)) links.set(a, new Set());
    if (!links.has(b)) links.set(b, new Set());
    links.get(a).add(b);
    links.get(b).add(a);
  };

  for (const way of astanaWays) {
    let previous = null;
    for (const point of way.points) {
      const index = nodeOf(point);
      if (previous !== null && previous !== index) {
        link(previous, index);
      }
      previous = index;
    }
  }

  const seen = new Set([0]);
  const queue = [0];
  while (queue.length > 0) {
    const current = queue.pop();
    for (const next of links.get(current) ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }

  const stranded = nodes
    .map((point, index) => ({ point, index }))
    .filter((entry) => !seen.has(entry.index));
  assert.equal(
    stranded.length,
    0,
    `оторванные узлы: ${stranded
      .slice(0, 5)
      .map((entry) => `${entry.point[0].toFixed(0)},${entry.point[1].toFixed(0)}`)
      .join(" / ")}`,
  );
});

test("places are laid out inside the island and do not sit in the river", () => {
  assert.ok(astanaAreas.length >= 15, `мест размечено: ${astanaAreas.length}`);
  for (const area of astanaAreas) {
    const [x, z] = area.center;
    assert.ok(onSolidGround(x, z), `${area.id} размечен вне суши`);
    assert.ok(
      !insideValley(x, z) || area.id === "atameken-plot",
      `${area.id} стоит в долине реки`,
    );
    const reach = Math.hypot(x, z) + Math.max(area.radius[0], area.radius[1]);
    assert.ok(reach < WORLD_RADIUS - 2, `${area.id} вылезает за кромку`);
  }
});
