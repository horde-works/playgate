import assert from "node:assert/strict";
import test from "node:test";
import {
  createRouteFireflies,
  routeAltitudeColor,
  routeBeamGeometry,
  routeGlowSections,
  sampleRouteFirefly,
} from "../games/make-a-mess/src/game/routeRibbon.ts";
import { combatHexacopterRangePlan } from "../games/make-a-mess/src/game/combatHexacopterRangeRoutes.ts";
import { COMBAT_HEXACOPTER_RANGE_PLACEMENT } from "../games/make-a-mess/src/game/combatHexacopter.ts";

const plan = combatHexacopterRangePlan(COMBAT_HEXACOPTER_RANGE_PLACEMENT.position);

test("кривая показана целиком, лежит на трассе и светится по высоте", () => {
  const sections = routeGlowSections(plan);
  assert.ok(sections.length > 80, `сечений ${sections.length}`);
  // Целиком: от площадки до площадки, а не окно за машиной.
  const first = sections[0];
  const last = sections[sections.length - 1];
  assert.ok(Math.hypot(first.centre[0], first.centre[2]) < 6, "начало у берта");
  assert.ok(Math.hypot(last.centre[0], last.centre[2]) < 6, "конец у берта");
  for (const section of sections) {
    let best = Infinity;
    for (let index = 0; index <= 1600; index += 1) {
      const point = plan.point(index / 1600);
      best = Math.min(
        best,
        Math.hypot(point[0] - section.centre[0], point[2] - section.centre[2]),
      );
    }
    assert.ok(best < 0.6, `сечение ушло с трассы на ${best.toFixed(2)} м`);
  }
  // Яркость растёт с высотой, самые концы притушены.
  const high = sections.reduce((a, b) => (b.centre[1] > a.centre[1] ? b : a));
  assert.ok(high.glow > first.glow, "верх обязан светиться ярче кромки");
});

test("палитра — маршрутная киношная: холодная синева, наверху ярче и бирюзовее", () => {
  const low = routeAltitudeColor(0, 0, 20);
  const high = routeAltitudeColor(20, 0, 20);
  for (const color of [low, high]) {
    assert.ok(color[2] >= color[0], "гамма обязана оставаться холодной");
  }
  assert.ok(high[1] > low[1], "верх — бирюзовее");
  assert.ok(
    high[0] + high[1] + high[2] > low[0] + low[1] + low[2],
    "верх — ярче",
  );
});

test("луч — скрещённая пара тонких лент с гаснущими концами", () => {
  const sections = routeGlowSections(plan, 24);
  const beam = routeBeamGeometry(sections);
  const per = sections.length * 2;
  assert.equal(beam.positions.length, per * 2 * 3);
  assert.equal(beam.colors.length, per * 2 * 4);
  assert.equal(beam.indices.length, (sections.length - 1) * 12);
  // Тонкая нить: ширина горизонтальной ленты — доли метра.
  const width = Math.hypot(
    beam.positions[3] - beam.positions[0],
    beam.positions[5] - beam.positions[2],
  );
  assert.ok(width < 1.2, `луч расползся до ${width.toFixed(2)} м`);
  const alphaAt = (index) => beam.colors[index * 8 + 3];
  const middle = alphaAt(Math.floor(sections.length / 2));
  assert.ok(alphaAt(0) < middle, "начало обязано заниматься мягко");
  assert.ok(alphaAt(sections.length - 1) < middle, "конец обязан гаснуть");
});

test("рой детерминирован, мал в шаге и держится кривой", () => {
  const one = createRouteFireflies(50, 11);
  const two = createRouteFireflies(50, 11);
  assert.deepEqual(one, two, "тот же номер обязан давать тот же рой");
  const other = createRouteFireflies(50, 12);
  assert.notDeepEqual(one, other);
  for (const firefly of one) {
    // Медленное течение: полный маршрут занимает минуты, а не секунды.
    assert.ok(firefly.drift < 0.01, `светлячок мчится: ${firefly.drift}`);
    const sample = sampleRouteFirefly(plan, firefly, 13.7, 0, 20);
    const at = (firefly.phase + 13.7 * firefly.drift) % 1;
    const centre = plan.point(at);
    const off = Math.hypot(
      sample.position[0] - centre[0],
      sample.position[1] - centre[1],
      sample.position[2] - centre[2],
    );
    assert.ok(
      off <= firefly.wanderAmplitude + firefly.bobAmplitude + 1e-6,
      `светлячок улетел с кривой на ${off.toFixed(2)} м`,
    );
    assert.ok(sample.intensity > 0.05 && sample.intensity <= 1.001);
  }
});
