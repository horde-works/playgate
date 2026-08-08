import assert from "node:assert/strict";
import test from "node:test";
import {
  routeActualTrailGeometry,
  routeAltitudeDiscGeometry,
  routeAltitudeColor,
  routeCraftContourGeometry,
  routeCraftPlumbGeometry,
  routeDropLineGeometry,
  routeGateGeometry,
  routeGroundDatum,
  routeGroundTrackGeometry,
  routePlanLineGeometry,
  routePlannedSchedule,
  routePlannedTickGeometry,
  routeSemanticMarkers,
  routeTickInterval,
  routeTickScale,
  routeTrailAlpha,
  routeTrailTickGeometry,
  ROUTE_ACTUAL_COLOR,
} from "../games/make-a-mess/src/game/routeRibbon.ts";
import {
  patchRouteLineFragmentShader,
  patchRouteLineVertexShader,
  routeInstanceBuffers,
  ROUTE_LINE_FRAGMENT_ANCHORS,
  ROUTE_LINE_VERTEX_ANCHORS,
} from "../games/make-a-mess/src/game/routeLineShader.ts";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import {
  combatHexacopterRangeCircuit,
  combatHexacopterRangePlan,
  combatHexacopterRangeReliefs,
} from "../games/make-a-mess/src/game/combatHexacopterRangeRoutes.ts";
import { COMBAT_HEXACOPTER_RANGE_PLACEMENT } from "../games/make-a-mess/src/game/combatHexacopter.ts";

const plan = combatHexacopterRangePlan(
  COMBAT_HEXACOPTER_RANGE_PLACEMENT.position,
);

const wavy = {
  id: "route-visual-test",
  length: 120,
  point(progress) {
    return [progress * 120, 10 + Math.sin(progress * Math.PI * 4) * 6, 0];
  },
  altitude(progress) {
    return this.point(progress)[1];
  },
  speedLimit() {
    return 20;
  },
  finalFrom: 0.95,
};

/**
 * Ступенчатая трасса: прямая 400 м с набором высоты 5 → 45, первая половина
 * разрешает 10 м/с, вторая — 40. На ней проверяются датум, частокол отвесов и
 * главное утверждение решётки: шаг засечек — ОБРАТНАЯ скорость.
 */
const stepped = {
  id: "route-tick-test",
  length: 400,
  point(progress) {
    return [progress * 400, 5 + progress * 40, 0];
  },
  altitude(progress) {
    return this.point(progress)[1];
  },
  speedLimit(progress) {
    return progress < 0.5 ? 10 : 40;
  },
  finalFrom: 0.95,
};

/** Середины шпал без дублей: у старших засечек их две (крест). */
function tickCentres(geometry) {
  const seen = new Map();
  for (let index = 0; index < geometry.positions.length; index += 6) {
    const centre = [0, 1, 2].map(
      (axis) =>
        (geometry.positions[index + axis] +
          geometry.positions[index + 3 + axis]) /
        2,
    );
    seen.set(centre.map((value) => value.toFixed(3)).join("|"), centre);
  }
  return [...seen.values()].sort((a, b) => a[0] - b[0]);
}

function segmentLengths(geometry) {
  const lengths = [];
  for (let index = 0; index < geometry.positions.length; index += 6) {
    lengths.push(
      Math.hypot(
        geometry.positions[index + 3] - geometry.positions[index],
        geometry.positions[index + 4] - geometry.positions[index + 1],
        geometry.positions[index + 5] - geometry.positions[index + 2],
      ),
    );
  }
  return lengths;
}

test("план — плотная тонкая полилиния по всей кривой", () => {
  const geometry = routePlanLineGeometry(wavy, 240);
  assert.equal(geometry.positions.length, 241 * 3);
  assert.equal(geometry.colors.length, 241 * 4);
  for (let segment = 0; segment <= 240; segment += 1) {
    const expected = wavy.point(segment / 240);
    const offset = segment * 3;
    assert.ok(Math.abs(geometry.positions[offset] - expected[0]) < 1e-4);
    assert.ok(Math.abs(geometry.positions[offset + 1] - expected[1]) < 1e-4);
    assert.ok(Math.abs(geometry.positions[offset + 2] - expected[2]) < 1e-4);
  }
  const first = plan.point(0);
  const tonkawa = routePlanLineGeometry(plan, 400);
  assert.ok(
    Math.hypot(
      tonkawa.positions[0] - first[0],
      tonkawa.positions[1] - first[1],
      tonkawa.positions[2] - first[2],
    ) < 0.05,
    "нить начинается у берта",
  );
});

test("палитра ядра — бирюза внизу, сине-голубой наверху", () => {
  const low = routeAltitudeColor(0, 0, 20);
  const high = routeAltitudeColor(20, 0, 20);
  for (const color of [low, high]) {
    assert.ok(color[2] >= color[0], "гамма обязана оставаться холодной");
  }
  assert.ok(low[1] > low[2], "нижняя точка обязана быть бирюзовой");
  assert.ok(high[2] > high[1], "верхняя точка обязана быть сине-голубой");
  assert.ok(low[1] > high[1], "бирюза должна убывать с высотой");
});

test("факт — непрерывная amber-нить с затуханием назад", () => {
  assert.equal(routeActualTrailGeometry([[0, 0, 0]]).positions.length, 0);
  const geometry = routeActualTrailGeometry([
    [0, 0, 0],
    [1, 1, 0],
    [2, 1.5, 0],
    [3, 2, 1],
  ]);
  assert.equal(geometry.positions.length, 4 * 3);
  assert.equal(geometry.colors.length, 4 * 4);
  const firstAlpha = geometry.colors[3];
  const lastAlpha = geometry.colors.at(-1);
  assert.ok(firstAlpha >= 0.05, `старый след исчез: ${firstAlpha}`);
  assert.ok(lastAlpha >= 0.85, `свежий факт не читается: ${lastAlpha}`);
  assert.ok(lastAlpha > firstAlpha, "новый участок должен быть ярче старого");
  assert.ok(
    Math.abs(geometry.colors[0] - ROUTE_ACTUAL_COLOR[0]) < 1e-5 &&
      Math.abs(geometry.colors[1] - ROUTE_ACTUAL_COLOR[1]) < 1e-5 &&
      Math.abs(geometry.colors[2] - ROUTE_ACTUAL_COLOR[2]) < 1e-5,
    "факт обязан оставаться amber",
  );
  assert.ok(
    geometry.colors[0] > geometry.colors[1] &&
      geometry.colors[1] > geometry.colors[2],
    "факт обязан оставаться тёплым",
  );
});

test("маршрутные метки — только границы режимов и выраженные экстремумы", () => {
  const markers = routeSemanticMarkers(plan);
  const gates = markers.filter((marker) => marker.kind === "gate");
  const peaks = markers.filter((marker) => marker.kind === "altitudePeak");
  const troughs = markers.filter((marker) => marker.kind === "altitudeTrough");
  // ВОРОТА СВЕРЯЮТСЯ С ЗАМЫСЛОМ, А НЕ СЧИТАЮТСЯ ШТУКАМИ. Здесь стояла вилка
  // «от четырёх до шести», написанная для круга, у которого режимов и было
  // четыре: столб взлёта, столб захода и створ. Программа показа объявляет
  // больше — точку покоя, где ход гасится почти в ноль, и участки фигур, где
  // коридор расходится вдвое, — и каждая такая граница ЕСТЬ смена режима, то
  // есть ворота по определению. Вилка ловила бы не выдуманные ворота, а рост
  // программы.
  //
  // Ловить надо ровно то, ради чего она писалась: ворота ПОСРЕДИ ровного
  // участка, взявшиеся из ступеньки в требовании там, где никакого перехода
  // не объявлено.
  const declaredGates = [
    // Столбы у земли: там режим меняется дважды — по ходу и по коридору.
    ...[26, 40].map((metres) => metres / plan.length),
    plan.verticalDeparture.until,
    // Конец ухода спиной: там кончается тихий ход номера и начинается галс.
    combatHexacopterRangeCircuit.nodeProgress("backaway"),
    // Точка покоя: машина останавливается и разворачивается на месте.
    combatHexacopterRangeCircuit.nodeProgress("rest-in"),
    combatHexacopterRangeCircuit.nodeProgress("rest-out"),
    // Заход: коридор сужается тремя ступенями, и последняя — сам створ.
    ...[110, 70, 40, 20].map((metres) => 1 - metres / plan.length),
    plan.verticalArrival.from,
    plan.finalFrom,
    // Участки фигур: объявленная фигура расширяет коридор, и это тоже режим.
    ...plan.figures.flatMap((station) => [station.at, station.resumeAt]),
  ];
  for (const gate of gates) {
    assert.ok(
      declaredGates.some((declared) => Math.abs(declared - gate.progress) < 0.04),
      `ворота на ${gate.progress.toFixed(3)} не стоят ни на одной объявленной границе режима`,
    );
  }
  assert.ok(gates.length >= 4, `границы режимов потеряны: ${gates.length}`);
  // ЛЕНТА СВЕРЯЕТСЯ С ЗАМЫСЛОМ, а не с запомненными координатами. Прежняя
  // редакция знала шесть чисел наизусть и устарела в день, когда программа
  // показа выросла с одного круга до девяти номеров. Правило же осталось тем
  // же: лента не имеет права ни потерять объявленную горку, ни выдумать свою.
  const declared = combatHexacopterRangeReliefs;
  assert.ok(declared.length >= 6, `в программе всего ${declared.length} перепадов`);
  for (const relief of declared) {
    // Края отданы воротам взлёта и захода: там перепад высоты — это столб, а
    // не рельеф, и метить его отдельно нечем.
    if (relief.progress < 0.15 || relief.progress > 0.92) continue;
    // ВОРОТА НА ЭТОМ МЕСТЕ — ТОЖЕ ОТВЕТ. Лента намеренно не рисует экстремум
    // там, где уже стоит граница режима: два знака на одной точке читались бы
    // как две разные вещи. Точка покоя и выход из финального иммельмана —
    // ровно такие места: там и горка, и смена режима, и показать надо смену.
    assert.ok(
      markers.some(
        (marker) =>
          (marker.kind === relief.kind || marker.kind === "gate") &&
          Math.abs(marker.progress - relief.progress) < 0.02,
      ),
      `потерян объявленный ${relief.kind} на ${relief.progress}`,
    );
  }
  for (const marker of [...peaks, ...troughs]) {
    assert.ok(
      declared.some(
        (relief) =>
          relief.kind === marker.kind &&
          Math.abs(relief.progress - marker.progress) < 0.02,
      ),
      `выдуман ${marker.kind} на ${marker.progress.toFixed(3)}`,
    );
  }

  const rings = routeGateGeometry(plan, markers);
  assert.equal(rings.positions.length, gates.length * 28 * 2 * 3);
  const discs = routeAltitudeDiscGeometry(plan, markers);
  assert.equal(
    discs.positions.length,
    (peaks.length + troughs.length) * 2 * 13 * 3,
  );
  assert.equal(
    discs.indices.length,
    (peaks.length + troughs.length) * 2 * 12 * 3,
  );
});

test("контур машины — обод, три вектора и тяги", () => {
  const centre = [10, 20, 30];
  const geometry = routeCraftContourGeometry({
    centre,
    heading: [0, 0, -1],
    course: [4, 0, -3],
    route: [1, 0.5, 0],
    up: [0, 1, 0],
    engines: [
      { position: [9, 20, 30], intensity: 0.4 },
      { position: [11, 20, 30], intensity: 0.8 },
    ],
  });
  const lineCount = geometry.positions.length / 6;
  assert.ok(
    lineCount >= 100 && lineCount <= 150,
    `приборный круг потерял состав: ${lineCount}`,
  );
  assert.equal(geometry.colors.length / 8, lineCount);
  let horizontalReach = 0;
  let verticalReach = 0;
  for (let index = 0; index < geometry.positions.length; index += 3) {
    const value = [
      geometry.positions[index],
      geometry.positions[index + 1],
      geometry.positions[index + 2],
    ];
    for (const component of value) assert.ok(Number.isFinite(component));
    horizontalReach = Math.max(
      horizontalReach,
      Math.hypot(value[0] - centre[0], value[2] - centre[2]),
    );
    verticalReach = Math.max(verticalReach, value[1] - centre[1]);
  }
  assert.ok(
    horizontalReach >= 3.2,
    `риски и стрелка обязаны выходить за обод: ${horizontalReach.toFixed(2)} м`,
  );
  assert.ok(
    verticalReach >= 0.5,
    `векторы тяг обязаны подниматься над кругом: ${verticalReach.toFixed(2)} м`,
  );
});

test("датум — низшая точка задания, наземный след лежит ровно на нём", () => {
  const datum = routeGroundDatum(stepped);
  assert.ok(Math.abs(datum - 5) < 0.05, `датум уехал: ${datum}`);
  const track = routeGroundTrackGeometry(stepped, datum, 240);
  assert.equal(track.positions.length, 241 * 3);
  for (let index = 0; index < track.positions.length; index += 3) {
    assert.equal(
      track.positions[index + 1],
      datum,
      "след обязан лежать на одной плоскости: длины отвесов сравнивают",
    );
  }
  const middle = stepped.point(0.5);
  assert.ok(
    Math.abs(track.positions[120 * 3] - middle[0]) < 1,
    "след обязан повторять план в плане, а не срезать угол",
  );
});

test("отвесы — вертикальны, от трассы до датума, шагом по длине дуги", () => {
  const datum = routeGroundDatum(stepped);
  const drops = routeDropLineGeometry(stepped, datum, 20);
  const pairs = drops.positions.length / 6;
  assert.ok(pairs >= 16 && pairs <= 24, `частокол сбит: ${pairs}`);
  const tops = [];
  for (let index = 0; index < pairs; index += 1) {
    const offset = index * 6;
    const top = drops.positions.slice(offset, offset + 3);
    const bottom = drops.positions.slice(offset + 3, offset + 6);
    assert.ok(Math.abs(bottom[1] - datum) < 1e-4, "низ обязан быть на датуме");
    assert.ok(
      Math.abs(top[0] - bottom[0]) < 1e-5 &&
        Math.abs(top[2] - bottom[2]) < 1e-5,
      "отвес обязан быть вертикальным, иначе длина не читается как высота",
    );
    assert.ok(
      Math.abs(top[1] - (5 + (top[0] / 400) * 40)) < 0.2,
      "верх обязан лежать на трассе",
    );
    tops.push(top[0]);
  }
  for (let index = 1; index < tops.length; index += 1) {
    const step = tops[index] - tops[index - 1];
    assert.ok(
      Math.abs(step - 19.9) < 1.5,
      `шаг частокола обязан идти по дуге, а не по доле: ${step.toFixed(2)}`,
    );
  }
  assert.ok(
    drops.colors[3] > drops.colors[7],
    "отвес висит с трассы: верх ярче низа",
  );
});

test("шаг решётки выбирается лестницей от полного времени задания", () => {
  assert.equal(routeTickInterval(20, 200), 0.25);
  assert.equal(routeTickInterval(90, 200), 0.5);
  assert.equal(routeTickInterval(300, 200), 2);
  assert.ok(routeTickInterval(1e6, 200) >= 300, "лестница обязана кончаться");
});

test("плановая решётка: расстояние между засечками — обратная скорость", () => {
  const schedule = routePlannedSchedule(stepped, 720);
  assert.ok(
    Math.abs(schedule.seconds - 25.1) < 0.8,
    `расписание не сошлось: ${schedule.seconds.toFixed(2)} с`,
  );
  const interval = routeTickInterval(schedule.seconds);
  const ticks = routePlannedTickGeometry(stepped, interval, schedule);
  const centres = tickCentres(ticks);
  assert.ok(centres.length > 40, `решётка пуста: ${centres.length}`);

  const meanGap = (from, to) => {
    const slice = centres.filter((point) => point[0] > from && point[0] < to);
    let total = 0;
    for (let index = 1; index < slice.length; index += 1) {
      total += slice[index][0] - slice[index - 1][0];
    }
    return total / Math.max(1, slice.length - 1);
  };
  const slow = meanGap(20, 180);
  const fast = meanGap(220, 380);
  const ratio = fast / slow;
  assert.ok(
    ratio > 3.2 && ratio < 4.8,
    `ритм обязан кодировать скорость вчетверо: ${slow.toFixed(2)} м против ${fast.toFixed(2)} м`,
  );

  // Шпала растёт вместе с заданием: 400 м дают полуторный масштаб.
  const scale = routeTickScale(stepped.length);
  assert.ok(Math.abs(scale - 400 / 260) < 1e-9, `масштаб шпалы: ${scale}`);
  const tiers = [...new Set(segmentLengths(ticks).map((v) => v.toFixed(2)))]
    .map(Number)
    .sort((a, b) => a - b);
  assert.equal(tiers.length, 4, `иерархия засечек потеряна: ${tiers}`);
  assert.ok(
    Math.abs(tiers[0] - 0.9 * scale) < 1e-2,
    `младшая засечка: ${tiers[0]}`,
  );
  assert.ok(
    Math.abs(tiers.at(-1) - 3.4 * scale) < 1e-2,
    `старшая засечка: ${tiers.at(-1)}`,
  );
});

test("масштаб шпалы зажат: короткий облёт и километровый обход читаются оба", () => {
  assert.equal(routeTickScale(60), 0.7, "на коротком задании шпала не тонет");
  assert.equal(routeTickScale(2000), 4, "на длинном не разрастается");
  assert.ok(routeTickScale(500) > routeTickScale(200), "между краями растёт");
});

test("решётка факта ставится по реальному времени, а не по метрам", () => {
  const points = [];
  const times = [];
  for (let index = 0; index <= 30; index += 1) {
    points.push([index, 20, 0]);
    times.push(index);
  }
  for (let index = 1; index <= 30; index += 1) {
    points.push([30 + index * 4, 20, 0]);
    times.push(30 + index);
  }
  const centres = tickCentres(routeTrailTickGeometry(points, times, 5));
  const slow = centres.filter((point) => point[0] < 30);
  const fast = centres.filter((point) => point[0] > 30);
  assert.ok(slow.length >= 4 && fast.length >= 4, "решётка не покрыла след");
  assert.ok(
    Math.abs(slow[1][0] - slow[0][0] - 5) < 0.3,
    `медленный участок обязан идти по 5 м: ${slow[1][0] - slow[0][0]}`,
  );
  assert.ok(
    Math.abs(fast[1][0] - fast[0][0] - 20) < 0.6,
    `быстрый участок обязан идти по 20 м: ${fast[1][0] - fast[0][0]}`,
  );
});

test("живой отвес машины идёт до датума и ставит тень на нём", () => {
  const datum = 5;
  const plumb = routeCraftPlumbGeometry([10, 48, -4], datum, 1.1);
  const pairs = plumb.positions.length / 6;
  assert.equal(pairs, 21, "отвес и двадцать сегментов кольца");
  assert.ok(Math.abs(plumb.positions[1] - 48) < 1e-4);
  assert.ok(Math.abs(plumb.positions[4] - datum) < 1e-4);
  for (let index = 1; index < pairs; index += 1) {
    const offset = index * 6;
    assert.ok(Math.abs(plumb.positions[offset + 1] - datum) < 1e-4);
    assert.ok(
      Math.abs(
        Math.hypot(
          plumb.positions[offset] - 10,
          plumb.positions[offset + 2] + 4,
        ) - 1.1,
      ) < 1e-4,
      "тень обязана стоять под машиной",
    );
  }
});

test("затухание следа монотонно и не гасит хвост в ноль", () => {
  assert.ok(Math.abs(routeTrailAlpha(0) - 0.14) < 1e-9);
  assert.ok(Math.abs(routeTrailAlpha(1) - 0.9) < 1e-9);
  for (let index = 1; index <= 10; index += 1) {
    assert.ok(routeTrailAlpha(index / 10) > routeTrailAlpha((index - 1) / 10));
  }
});

test("патч жирной нити: якоря three на месте, ширина стала мировой", () => {
  const material = new LineMaterial({});
  for (const anchor of ROUTE_LINE_VERTEX_ANCHORS) {
    assert.ok(
      material.vertexShader.includes(anchor),
      `якорь вершинного шейдера пропал — нить вернётся в пиксель: ${anchor}`,
    );
  }
  for (const anchor of ROUTE_LINE_FRAGMENT_ANCHORS) {
    assert.ok(
      material.fragmentShader.includes(anchor),
      `якорь фрагментного шейдера пропал: ${anchor}`,
    );
  }
  const vertex = patchRouteLineVertexShader(material.vertexShader);
  const fragment = patchRouteLineFragmentShader(material.fragmentShader);
  assert.ok(
    !vertex.includes("offset *= linewidth;"),
    "ширина осталась постоянной экранной",
  );
  assert.ok(vertex.includes("offset *= routeWidthPx;"));
  assert.ok(vertex.includes("uniform float routeWidthWorld;"));
  assert.ok(vertex.includes("attribute float instanceAlphaStart;"));
  assert.ok(
    fragment.includes("float alpha = opacity * vRouteFade * vRouteAlpha;"),
  );
  for (const varying of ["vRouteFade", "vRouteAlpha"]) {
    assert.ok(vertex.includes(`varying float ${varying};`), `vs ${varying}`);
    assert.ok(fragment.includes(`varying float ${varying};`), `fs ${varying}`);
  }
});

test("упаковка жирной нити — полилиния, готовые пары и пустой вход", () => {
  const line = {
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 2, 0, 0]),
    colors: new Float32Array([1, 0, 0, 0.2, 0, 1, 0, 0.5, 0, 0, 1, 0.9]),
  };
  const strip = routeInstanceBuffers(line, true);
  assert.equal(strip.segments, 2);
  assert.deepEqual([...strip.positions.slice(0, 6)], [0, 0, 0, 1, 0, 0]);
  assert.deepEqual([...strip.positions.slice(6, 12)], [1, 0, 0, 2, 0, 0]);
  assert.deepEqual(
    [...strip.alphas].map((value) => Math.round(value * 10) / 10),
    [0.2, 0.5, 0.5, 0.9],
  );
  assert.equal(routeInstanceBuffers(line, false).segments, 1);

  const empty = routeInstanceBuffers(
    { positions: new Float32Array(), colors: new Float32Array() },
    true,
  );
  assert.equal(empty.segments, 0);
  assert.equal(empty.positions.length, 6, "атрибут обязан существовать всегда");
  assert.equal(empty.alphas.length, 2);
  assert.equal(empty.alphas[0], 0, "пустой сегмент обязан быть прозрачным");
});
