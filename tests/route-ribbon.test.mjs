import assert from "node:assert/strict";
import test from "node:test";
import {
  routeRibbonGeometry,
  routeRibbonSections,
} from "../games/make-a-mess/src/game/routeRibbon.ts";
import { combatHexacopterRangePlan } from "../games/make-a-mess/src/game/combatHexacopterRangeRoutes.ts";
import { COMBAT_HEXACOPTER_RANGE_PLACEMENT } from "../games/make-a-mess/src/game/combatHexacopter.ts";

const plan = combatHexacopterRangePlan(COMBAT_HEXACOPTER_RANGE_PLACEMENT.position);

test("лента лежит на трассе, а её ширина — авторский коридор участка", () => {
  const sections = routeRibbonSections(plan, 0.4);
  assert.ok(sections.length > 30, `сечений ${sections.length}`);
  for (const section of sections) {
    // Поперечник единичный и горизонтальный: лента лежит плашмя.
    assert.ok(Math.abs(Math.hypot(section.across[0], section.across[1]) - 1) < 1e-9);
    assert.ok(section.fade >= 0 && section.fade <= 1);
  }
  // На круге ширина ленты — свобода гоночной линии, у земли — строгие метры.
  const wide = routeRibbonSections(plan, 0.5)[0];
  assert.ok(wide.halfWidth >= 25, `на круге ${wide.halfWidth}`);
  const tight = routeRibbonSections(plan, 0.97)[0];
  assert.ok(tight.halfWidth <= 4, `у земли ${tight.halfWidth}`);
});

test("сечения следуют точкам плана, а не собственной выдумке", () => {
  const sections = routeRibbonSections(plan, 0.3, { sections: 10 });
  for (const section of sections) {
    // Центр сечения обязан лежать НА трассе: ищем ближайшую точку плана.
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
});

test("геометрия — честная лента: пары вершин, симметрия, гаснущая альфа", () => {
  const sections = routeRibbonSections(plan, 0.4, { sections: 12 });
  const ribbon = routeRibbonGeometry(sections);
  assert.equal(ribbon.positions.length, sections.length * 6);
  assert.equal(ribbon.colors.length, sections.length * 8);
  assert.equal(ribbon.indices.length, (sections.length - 1) * 6);
  for (let index = 0; index < sections.length; index += 1) {
    const lx = ribbon.positions[index * 6];
    const lz = ribbon.positions[index * 6 + 2];
    const rx = ribbon.positions[index * 6 + 3];
    const rz = ribbon.positions[index * 6 + 5];
    const width = Math.hypot(rx - lx, rz - lz);
    // Float32 в вершинах: сотые доли миллиметра люфта законны.
    assert.ok(
      Math.abs(width - sections[index].halfWidth * 2) < 1e-3,
      "ширина ленты обязана равняться коридору",
    );
  }
  // Дальний край гаснет: последняя альфа меньше пиковой в середине.
  const alphaAt = (index) => ribbon.colors[index * 8 + 3];
  const middle = alphaAt(Math.floor(sections.length / 2));
  const far = alphaAt(sections.length - 1);
  assert.ok(far < middle, `дальний край не гаснет: ${far} против ${middle}`);
});

test("позади машины ленты нет, у конца маршрута она не рисуется в пустоту", () => {
  const sections = routeRibbonSections(plan, 0.995);
  // У самого причала вперёд почти нечего рисовать — и это правильно.
  assert.ok(sections.length <= 50);
  const before = routeRibbonSections(plan, 0.4, { sections: 10 })[0];
  assert.ok(before.fade < 0.2, "лента обязана мягко заниматься у машины, а не тыкать в кабину");
});
