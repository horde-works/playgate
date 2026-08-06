import assert from "node:assert/strict";
import test from "node:test";
import {
  routeActualTrailGeometry,
  routeAltitudeDiscGeometry,
  routeAltitudeColor,
  routeCraftContourGeometry,
  routeGateGeometry,
  routePlanLineGeometry,
  routeSemanticMarkers,
  ROUTE_ACTUAL_COLOR,
} from "../games/make-a-mess/src/game/routeRibbon.ts";
import { combatHexacopterRangePlan } from "../games/make-a-mess/src/game/combatHexacopterRangeRoutes.ts";
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
  assert.equal(peaks.length, 3);
  assert.equal(troughs.length, 3);
  assert.ok(gates.length >= 4 && gates.length <= 5, `лишние ворота: ${gates.length}`);
  for (const expected of [0.2, 0.36, 0.5, 0.6, 0.7, 0.8]) {
    assert.ok(
      markers.some(
        (marker) =>
          marker.kind !== "gate" && Math.abs(marker.progress - expected) < 0.004,
      ),
      `потерян экстремум ${expected}`,
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
