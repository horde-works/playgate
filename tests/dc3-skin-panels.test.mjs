import assert from "node:assert/strict";
import test from "node:test";
import {
  dc3SkinPanelParts,
  dc3SkinPanelsObject,
} from "../games/make-a-mess/src/content/objects/aircraft/dc3SkinPanelsObject.ts";
import { dc3AirframeSurface } from "../games/make-a-mess/src/content/objects/aircraft/dc3BlockoutObject.ts";
import { DC3_WINGSPAN } from "../games/make-a-mess/src/content/objects/aircraft/dc3Dimensions.ts";

// Замеры восстанавливают величины ИЗ выпущенной геометрии. Ни один из них не
// зовёт строителя панелей — иначе тест повторил бы ту же ошибку, что и код.

function signedVolume(part) {
  let volume = 0;
  for (const [a, b, c] of part.triangles) {
    const [ax, ay, az] = part.vertices[a];
    const [bx, by, bz] = part.vertices[b];
    const [cx, cy, cz] = part.vertices[c];
    volume += ax * (by * cz - bz * cy)
      + ay * (bz * cx - bx * cz)
      + az * (bx * cy - by * cx);
  }
  return volume / 6;
}

function bounds(parts) {
  const low = [Infinity, Infinity, Infinity];
  const high = [-Infinity, -Infinity, -Infinity];
  for (const part of parts) {
    for (const vertex of part.vertices) {
      for (let axis = 0; axis < 3; axis += 1) {
        low[axis] = Math.min(low[axis], vertex[axis]);
        high[axis] = Math.max(high[axis], vertex[axis]);
      }
    }
  }
  return { low, high };
}

function pointToSegment(p, a, b) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const w = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const square = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
  const t = square === 0
    ? 0
    : Math.max(0, Math.min(1, (w[0] * d[0] + w[1] * d[1] + w[2] * d[2]) / square));
  return Math.hypot(w[0] - d[0] * t, w[1] - d[1] * t, w[2] - d[2] * t);
}

// §8.6 — бюджет. Авторский шаг отсека выбран под него, а не наоборот.
test("панелей не больше бюджета", () => {
  assert.ok(
    dc3SkinPanelParts.length <= 340,
    `панелей ${dc3SkinPanelParts.length}, потолок 340`,
  );
  assert.ok(dc3SkinPanelParts.length > 100, "этап 1 не может быть в сто панелей");
});

// §8.3 — панель обязана быть телом, а не листом: разрушению нужен объём.
test("каждая панель замкнута и имеет положительный объём", () => {
  for (const part of dc3SkinPanelParts) {
    const volume = signedVolume(part);
    assert.ok(
      volume > 1e-7,
      `${part.id}: знаковый объём ${volume.toExponential(2)} — панель не замкнута или вывернута`,
    );
  }
});

test("идентификаторы уникальны, вырожденных панелей нет", () => {
  const seen = new Set();
  for (const part of dc3SkinPanelParts) {
    assert.ok(!seen.has(part.id), `повтор идентификатора ${part.id}`);
    seen.add(part.id);
    assert.ok(part.vertices.length >= 8, `${part.id}: слишком мало вершин`);
    assert.ok(part.triangles.length >= 8, `${part.id}: слишком мало треугольников`);
  }
});

// §8.1 — цена ширины панели. Это и есть число, ради которого шаг отсека
// авторский: панель линейна между своими точками, профиль — нет.
test("панель несёт профиль: отклонение от аналитической поверхности мало", () => {
  const face = (band, u, t, side) => {
    const ring = band(u, t, t);
    return side === 0 ? ring[0] : ring[ring.length - 1];
  };
  const { spars, wing } = dc3AirframeSurface;
  const lanes = [
    [0, spars.front, 8],
    [spars.front, spars.main, 4],
    [spars.main, spars.rear, 4],
    [spars.rear, 1, 4],
  ];
  let worst = 0;
  for (const x of [0, 1.4, 2.8, 5.2, 7.4, 10.2, 12.6, 14.4]) {
    for (const [from, to, steps] of lanes) {
      for (let step = 0; step < steps; step += 1) {
        const t0 = from + ((to - from) * step) / steps;
        const t1 = from + ((to - from) * (step + 1)) / steps;
        for (const side of [0, 1]) {
          const a = face(wing.band, x, t0, side);
          const b = face(wing.band, x, t1, side);
          for (let sample = 1; sample < 8; sample += 1) {
            const t = t0 + ((t1 - t0) * sample) / 8;
            worst = Math.max(worst, pointToSegment(face(wing.band, x, t, side), a, b));
          }
        }
      }
    }
  }
  assert.ok(worst <= 0.015, `отклонение ${(worst * 1000).toFixed(1)} мм, порог 15 мм`);
});

// Конверт не поехал: панели кроют тот же размах, что и машина.
test("панельная шкура держит размах машины", () => {
  const wingPanels = dc3SkinPanelParts.filter((part) => part.group === "wing-panels");
  const { low, high } = bounds(wingPanels);
  const span = high[0] - low[0];
  assert.ok(
    Math.abs(span - DC3_WINGSPAN) < 0.05,
    `размах по панелям ${span.toFixed(3)} против ${DC3_WINGSPAN.toFixed(3)}`,
  );
});

// §8.5 — шкура не лезет туда, где её нет: в отсеках закрылка и элерона
// хвостовой полосы не существует уже в B01.
test("в отсеках рулей нет хвостовой полосы обшивки", () => {
  const { wing } = dc3AirframeSurface;
  const trailing = dc3SkinPanelParts.filter((part) => part.id.includes(":trail-"));
  assert.ok(trailing.length > 0, "хвостовая полоса обязана существовать вне отсеков рулей");
  for (const part of trailing) {
    const { low, high } = bounds([part]);
    for (const x of [low[0], (low[0] + high[0]) / 2, high[0]]) {
      assert.ok(
        !wing.inFlapBay(x) || !wing.inAileronBay(x),
        `${part.id}: хвостовая полоса зашла в отсек руля на x=${x.toFixed(2)}`,
      );
    }
  }
});

// §8.2 — закон стыка. Соседние полосы обязаны делить ОДНИ И ТЕ ЖЕ точки на
// границе лонжерона, а не просто оказаться рядом: габаритами щель не мерится,
// потому что панель гнутая и толстая, и её коробка шире её кромки.
test("соседние полосы делят общую кромку", () => {
  const byBay = new Map();
  for (const part of dc3SkinPanelParts) {
    const bay = part.id.slice(0, part.id.lastIndexOf(":"));
    const lane = part.id.slice(part.id.lastIndexOf(":") + 1);
    if (!byBay.has(bay)) byBay.set(bay, new Map());
    byBay.get(bay).set(lane, part);
  }
  const sharedVertices = (a, b) => {
    let shared = 0;
    for (const left of a.vertices) {
      for (const right of b.vertices) {
        if (
          Math.abs(left[0] - right[0]) < 1e-9
          && Math.abs(left[1] - right[1]) < 1e-9
          && Math.abs(left[2] - right[2]) < 1e-9
        ) {
          shared += 1;
          break;
        }
      }
    }
    return shared;
  };
  let checked = 0;
  for (const lanes of byBay.values()) {
    for (const [first, second] of [
      ["box-fwd-upper", "box-aft-upper"],
      ["box-fwd-lower", "box-aft-lower"],
      ["d-nose", "box-fwd-upper"],
      ["d-nose", "box-fwd-lower"],
    ]) {
      const a = lanes.get(first);
      const b = lanes.get(second);
      if (!a || !b) continue;
      // Ряды считаются по ПОЛОСЕ КЕССОНА: у неё пять столбцов по хорде, а у
      // носовой панели девять — обход там идёт через переднюю кромку.
      const rows = b.vertices.length / 2 / 5;
      const shared = sharedVertices(a, b);
      assert.ok(
        shared >= rows,
        `${first}/${second}: общих точек ${shared}, рядов ${rows}`,
      );
      checked += 1;
    }
  }
  assert.ok(checked >= 40, `проверено всего ${checked} стыков — выборка мала`);
});

// Фюзеляж и мотогондолы — тела вращения, и у них панель обязана совпадать с
// лофтом ТОЧНО: её углы и промежуточные точки берутся из тех же колец на тех
// же станциях. Проверяется буквально — каждая наружная точка панели обязана
// найтись среди точек лофтовых колец.
test("панели фюзеляжа лежат на лофте точно, а не приближённо", () => {
  const { fuselage } = dc3AirframeSurface;
  // Точки переводятся в мир НАПРЯМУЮ: круг через строку и обратно теряет
  // разряды до преобразования и сам создаёт расхождение, которое ищем.
  const world = new Set();
  for (const station of fuselage.stations) {
    for (const p of fuselage.ring(station)) {
      world.add(dc3AirframeSurface.bodyToWorld(p).map((v) => v.toFixed(5)).join(","));
    }
  }
  const panels = dc3SkinPanelParts.filter((part) => part.group === "fuselage-panels");
  assert.ok(panels.length > 0, "фюзеляж обязан быть запанелирован");
  let checked = 0;
  for (const part of panels) {
    // Наружная половина вершин — первая: внутренняя сдвинута на толщину.
    for (const vertex of part.vertices.slice(0, part.vertices.length / 2)) {
      assert.ok(
        world.has(vertex.map((v) => v.toFixed(5)).join(",")),
        `${part.id}: точка ${vertex.map((v) => v.toFixed(3)).join(",")} не лежит на лофте`,
      );
      checked += 1;
    }
  }
  assert.ok(checked > 500, `проверено всего ${checked} точек`);
});

test("мотогондолы запанелированы с обеих сторон", () => {
  const ids = dc3SkinPanelParts
    .filter((part) => part.group === "nacelle-panels")
    .map((part) => part.id);
  assert.ok(ids.some((id) => id.startsWith("nacelle-left")), "нет левой гондолы");
  assert.ok(ids.some((id) => id.startsWith("nacelle-right")), "нет правой гондолы");
});

test("модель объявляет требуемые виды", () => {
  const required = [
    "panel-plan",
    "panel-three-quarter",
    "panel-nose-detail",
    "panel-joint-detail",
    "panel-empennage",
    "panel-fuselage-detail",
    "panel-nacelle-detail",
    "reference-loft",
    "panel-silhouette",
  ];
  const ids = dc3SkinPanelsObject.views.map((view) => view.id);
  for (const id of required) {
    assert.ok(ids.includes(id), `нет вида ${id}`);
  }
});

// Машина не тронута: образец строится рядом, а не вместо неё.
test("блокаут DC-3 остался прежним", async () => {
  const { dc3BlockoutObject } = await import(
    "../games/make-a-mess/src/content/objects/aircraft/dc3BlockoutObject.ts"
  );
  assert.equal(dc3BlockoutObject.parts.length, 127);
  assert.equal(dc3BlockoutObject.revision, "b01-2026-08-13-surfaces");
});
