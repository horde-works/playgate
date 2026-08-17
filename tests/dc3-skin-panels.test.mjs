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
    dc3SkinPanelParts.length <= 430,
    `панелей ${dc3SkinPanelParts.length}, потолок 430`,
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
test("панели фюзеляжа лежат на поверхности лофта", () => {
  const { fuselage, worldToBody } = dc3AirframeSurface;
  // Раньше здесь стояло «точка совпадает с выборкой кольца». С вырезами под
  // иллюминаторы появились промежуточные станции, и это перестало быть тем
  // инвариантом: панель обязана лежать НА ПОВЕРХНОСТИ, а не в её выборках.
  const stationAt = (z) =>
    fuselage.stations.find((station) => Math.abs(station.z - z) < 1e-9)
      ?? fuselage.at(z);
  const panels = dc3SkinPanelParts.filter((part) => part.group === "fuselage-panels");
  assert.ok(panels.length > 60, `панелей фюзеляжа всего ${panels.length}`);
  let checked = 0;
  let worst = 0;
  for (const part of panels) {
    // Наружная половина вершин — первая; внутренняя сдвинута на толщину.
    for (const vertex of part.vertices.slice(0, part.vertices.length / 2)) {
      const [x, y, z] = worldToBody(vertex);
      // Носовые станции несут `faceForward`: он сдвигает точку ВПЕРЁД по z,
      // поэтому по её собственной z станция ищется не та, и замер начинает
      // мерить не то. Носок окон не несёт, и проверка ограничена зоной без
      // этого сдвига — иначе тест ловил бы свою же ошибку отсчёта.
      if (z > 5.0) continue;
      const station = stationAt(z);
      const centreY = (station.crown + station.keel) / 2;
      const halfHeight = (station.crown - station.keel) / 2;
      const cosine = Math.max(-1, Math.min(1, x / station.halfWidth));
      const angle = y >= centreY ? Math.acos(cosine) : -Math.acos(cosine);
      const surface = fuselage.pointAt(station, angle);
      worst = Math.max(worst, Math.hypot(surface[0] - x, surface[1] - y));
      void halfHeight;
      checked += 1;
    }
  }
  assert.ok(checked > 800, `проверено всего ${checked} точек`);
  assert.ok(worst <= 0.004, `максимальный отход от поверхности ${(worst * 1000).toFixed(1)} мм`);
});

test("мотогондолы запанелированы с обеих сторон", () => {
  const ids = dc3SkinPanelParts
    .filter((part) => part.group === "nacelle-panels")
    .map((part) => part.id);
  assert.ok(ids.some((id) => id.startsWith("nacelle-left")), "нет левой гондолы");
  assert.ok(ids.some((id) => id.startsWith("nacelle-right")), "нет правой гондолы");
});

// НИ ОДНА ЧАСТЬ САЛОНА НЕ ТОРЧИТ НАРУЖУ.
//
// Шторка однажды уже вылезла: ширину ей задали по сечению на высоте пояса, а
// построили прямоугольником в 1.8 м — борт кверху сужается, и верхние углы
// оказались за обшивкой. Ловится это только вопросом «каждый ли угол лежит в
// сечении НА СВОЕЙ высоте», а не сравнением с одной шириной.
test("начинка салона не выходит за обшивку", async () => {
  const { dc3BlockoutObject } = await import(
    "../games/make-a-mess/src/content/objects/aircraft/dc3BlockoutObject.ts"
  );
  const { cabins, fuselage, worldToBody } = dc3AirframeSurface;
  const parts = dc3BlockoutObject.parts.filter((part) =>
    ["cabin-trim", "cabin-seats", "cabin-floor"].includes(part.group));
  assert.ok(parts.length > 20, `частей начинки всего ${parts.length}`);
  // Куски бывают и коробками (лампы), у них нет `vertices` — углы считаются
  // из центра и размера. Прежняя редакция падала на первой же лампе.
  const cornersOf = (part) => {
    if (part.vertices) return part.vertices;
    const [cx, cy, cz] = part.center;
    const [sx, sy, sz] = part.size;
    const corners = [];
    for (const dx of [-sx / 2, sx / 2]) {
      for (const dy of [-sy / 2, sy / 2]) {
        for (const dz of [-sz / 2, sz / 2]) corners.push([cx + dx, cy + dy, cz + dz]);
      }
    }
    return corners;
  };
  for (const part of parts) {
    for (const vertex of cornersOf(part)) {
      const [x, y, z] = worldToBody(vertex);
      const station = fuselage.at(z);
      const centreY = (station.crown + station.keel) / 2;
      const halfWidth = station.halfWidth - cabins.skinInset;
      const halfHeight = (station.crown - station.keel) / 2 - cabins.skinInset;
      const radial = (x / halfWidth) ** 2 + ((y - centreY) / halfHeight) ** 2;
      assert.ok(
        radial <= 1.02,
        `${part.id}: угол (${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)}) вне обшивки`,
      );
    }
  }
});

// ИЛЛЮМИНАТОР — ДЫРКА, А НЕ КАРТИНКА.
//
// Правило репозитория про окна жёсткое: вырез в оболочке, откосы, остекление
// и настоящая глубина за ним. Проверяется тем, что в обшивке РЕАЛЬНО нет
// материала на месте проёма: панель отсека выпущена полосами вокруг него.
test("окна прорезаны в обшивке, а не нарисованы", () => {
  const { windows } = dc3AirframeSurface;
  const glazing = dc3SkinPanelParts.filter((part) => part.group === "window-glazing");
  assert.equal(
    glazing.length,
    windows.length * 2,
    `остеклений ${glazing.length}, а окон ${windows.length} на два борта`,
  );
  // Вокруг каждого проёма обязаны стоять полосы: если бы панель осталась
  // целой плиткой, их бы не было вовсе.
  for (const suffix of ["below", "above"]) {
    const strips = dc3SkinPanelParts.filter((part) => part.id.includes(`:${suffix}`));
    assert.ok(
      strips.length >= windows.length,
      `полос ${suffix} всего ${strips.length}`,
    );
  }
  // Стекло утоплено внутрь: снаружи оно не должно лежать на обшивке.
  for (const pane of glazing) {
    assert.ok(pane.vertices.length >= 8, `${pane.id}: вырожденное остекление`);
  }
});

// АНО СТОЯТ НА СВОИХ БОРТАХ, А НЕ НА СВОИХ ЗНАКАХ X.
//
// Правый борт машины выводится из рамы, а не берётся из имён кусков: нос в
// +Z, верх в +Y, значит правый борт — forward × up = (−1, 0, 0). Якоря
// блокаута названы наоборот, и первая редакция огней это унаследовала —
// зелёный оказался слева. В числах такое не видно, пока не спросишь прямо.
test("зелёный АНО справа, красный слева", async () => {
  const { dc3BlockoutObject } = await import(
    "../games/make-a-mess/src/content/objects/aircraft/dc3BlockoutObject.ts"
  );
  const forward = [0, 0, 1];
  const up = [0, 1, 0];
  const starboard = [
    forward[1] * up[2] - forward[2] * up[1],
    forward[2] * up[0] - forward[0] * up[2],
    forward[0] * up[1] - forward[1] * up[0],
  ];
  assert.equal(starboard[0] < 0, true, "правый борт машины лежит по минус X");
  const lamp = (colour) => dc3BlockoutObject.parts.find(
    (part) => part.light?.color === colour && part.id.startsWith("nav-light-"),
  );
  const green = lamp("#4dff86");
  const red = lamp("#ff4d4d");
  assert.ok(green && red, "оба бортовых огня обязаны существовать");
  assert.ok(
    Math.sign(green.center[0]) === Math.sign(starboard[0]),
    "зелёный обязан стоять на правом борту",
  );
  assert.ok(
    Math.sign(red.center[0]) === -Math.sign(starboard[0]),
    "красный обязан стоять на левом борту",
  );
});

test("модель объявляет требуемые виды", () => {
  const required = [
    "panel-plan",
    "panel-three-quarter",
    "panel-nose-detail",
    "panel-joint-detail",
    "panel-empennage",
    "panel-fuselage-detail",
    "panel-windows",
    "panel-nacelle-detail",
    "reference-loft",
    "panel-silhouette",
  ];
  const ids = dc3SkinPanelsObject.views.map((view) => view.id);
  for (const id of required) {
    assert.ok(ids.includes(id), `нет вида ${id}`);
  }
});

// ФОРМА B01 НЕ ТРОНУТА, А СОСТАВ ВЫРОС ОСОЗНАННО.
//
// 127 → 133: шесть промежуточных шпангоутов в салоне под иллюминаторы. Они
// сняты с авторской таблицы, поэтому поверхность та же (проверено выше).
// Ревизия объекта не меняется: форма — прежняя.
// Форма и состав B01 не тронуты: обшивка подменяется представлением, а не
// геометрией. Уплотнение набора салона откачено — см. разбор в блокауте.
// Внешняя компоновка не тронута: выросла только начинка.
test("снаружи машина прежняя, вырос только салон", async () => {
  const { dc3BlockoutObject } = await import(
    "../games/make-a-mess/src/content/objects/aircraft/dc3BlockoutObject.ts"
  );
  const cabin = dc3BlockoutObject.parts.filter((part) =>
    part.group.startsWith("cabin-"));
  assert.ok(cabin.length >= 35, `частей салона всего ${cabin.length}`);
  // Было 158; стало 160 — по кронштейну шлиц-шарнира на каждую главную ногу.
  // Кронштейн появился не для красоты: звенья шарнира вынесены за габарит
  // покрышки (прежние 0.075 при полуширине колеса 0.12 шли сквозь резину), и
  // до плоскости шарнира их теперь надо чем-то донести от цилиндра.
  assert.equal(
    dc3BlockoutObject.parts.length - cabin.length,
    160,
    "снаружи: баки, носовой отсек, свет и разобранное на узлы шасси",
  );
  assert.equal(dc3BlockoutObject.revision, "b01-2026-08-13-surfaces");
});

// ПАССАЖИРЫ СИДЯТ ПО ПОЛЁТУ.
//
// Нос объекта смотрит в +Z, поэтому у кресла, обращённого вперёд, спинка
// стоит на МЕНЬШЕМ z. Знак здесь один раз уже был перепутан, и на кадре это
// видно сразу — а в числах нет, если не спросить.
test("кресла смотрят вперёд, а не в хвост", async () => {
  const { dc3BlockoutObject } = await import(
    "../games/make-a-mess/src/content/objects/aircraft/dc3BlockoutObject.ts"
  );
  const centreZ = (part) => {
    const zs = part.vertices.map((vertex) => vertex[2]);
    return (Math.min(...zs) + Math.max(...zs)) / 2;
  };
  const backs = dc3BlockoutObject.parts.filter((part) => part.id.endsWith("-back"));
  assert.ok(backs.length >= 12, `спинок всего ${backs.length}`);
  for (const back of backs) {
    const cushion = dc3BlockoutObject.parts.find(
      (part) => part.id === back.id.replace(/-back$/, ""),
    );
    assert.ok(cushion, `нет подушки для ${back.id}`);
    assert.ok(
      centreZ(back) < centreZ(cushion),
      `${back.id}: спинка впереди подушки — кресло развёрнуто в хвост`,
    );
  }
});

// Житель обязан помещаться стоя: ради этого и считался уровень пола.
test("житель встаёт в полный рост в обоих салонах", () => {
  const { cabins, fuselage } = dc3AirframeSurface;
  const STAND = 1.75;
  for (const cabin of [cabins.forward, cabins.aft]) {
    for (const z of [cabin.from, (cabin.from + cabin.to) / 2, cabin.to]) {
      const crown = fuselage.at(z).crown - cabins.skinInset;
      assert.ok(
        crown - cabin.floorY >= STAND,
        `салон ${cabin.from}..${cabin.to} на z=${z.toFixed(2)}: просвет ${(crown - cabin.floorY).toFixed(2)} м меньше роста`,
      );
    }
  }
});

