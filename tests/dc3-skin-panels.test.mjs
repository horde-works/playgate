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
    dc3SkinPanelParts.length <= 460,
    `панелей ${dc3SkinPanelParts.length}, потолок 460`,
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
  const wingTrail = trailing.filter((part) => part.id.startsWith("wing-"));
  assert.ok(
    wingTrail.some((part) => /wing-(left|right):bay\d+:trail-/.test(part.id)),
    "законцовка крыла должна нести хвостовую полосу колпака",
  );
  for (const part of wingTrail) {
    const { low, high } = bounds([part]);
    for (const x of [low[0], (low[0] + high[0]) / 2, high[0]]) {
      assert.ok(
        !wing.inFlapBay(x) && !wing.inAileronBay(x),
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
  const panels = dc3SkinPanelParts.filter((part) =>
    part.group === "fuselage-panels" && !part.id.includes("fairing"));
  assert.ok(panels.length > 60, `панелей фюзеляжа всего ${panels.length}`);
  let checked = 0;
  let worst = 0;
  for (const part of panels) {
    const cheekTopOnFrame = part.id === "fuselage:bay0:gore0"
      || part.id === "fuselage:bay0:gore4";
    // Наружная половина вершин — первая; внутренняя сдвинута на толщину.
    for (const vertex of part.vertices.slice(0, part.vertices.length / 2)) {
      const [x, y, z] = worldToBody(vertex);
      // Верх носового клина сидит на плоской раме порога, не на овале.
      if (cheekTopOnFrame && z >= 5.15 && y >= 0.65) continue;
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
    glazing.filter((part) => part.id.startsWith("window-")).length,
    windows.length * 2,
    `остеклений иллюминаторов ${glazing.filter((part) => part.id.startsWith("window-")).length}, а окон ${windows.length} на два борта`,
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

test("два центральных стекла фонаря прорезаны в обшивке", () => {
  const { windshields, worldToBody } = dc3AirframeSurface;
  assert.equal(windshields.length, 2);
  const glazing = dc3SkinPanelParts.filter((part) =>
    /^windshield-(left|right):glazing$/.test(part.id));
  assert.equal(glazing.length, 2, `стёкол фонаря ${glazing.length}`);
  assert.ok(dc3SkinPanelParts.some((part) => part.id === "windshield-mullion"));
  for (const side of ["left", "right"]) {
    assert.ok(
      dc3SkinPanelParts.some((part) => part.id === `windshield-${side}:frame-outboard`),
      `нет стойки ${side}`,
    );
    assert.ok(
      dc3SkinPanelParts.some((part) => part.id === `windshield-${side}:frame-sill`),
      `нет порога ${side}`,
    );
    assert.ok(
      dc3SkinPanelParts.some((part) => part.id === `windshield-${side}:frame-head`),
      `нет брови ${side}`,
    );
    assert.ok(
      dc3SkinPanelParts.some((part) => part.id === `windshield-${side}:frame-inboard`),
      `нет стойки у центрального ребра ${side}`,
    );
  }
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const length = (a) => Math.hypot(a[0], a[1], a[2]);
  const normals = [];
  for (const pane of windshields) {
    const [sillIn, sillOut, headOut, headIn] = pane.corners;
    const width = length(sub(sillOut, sillIn));
    const height = length(sub(headIn, sillIn));
    assert.ok(
      width > 0.48 && width < 0.70 && height > 0.22 && height < 0.32,
      `${pane.id}: ${width.toFixed(2)}×${height.toFixed(2)} is not the shorter-wider pane`,
    );
    assert.ok(
      sillIn[2] > 6.48 && sillIn[1] < 0.84,
      `${pane.id}: sill is not on the deck frame (z=${sillIn[2].toFixed(2)}, y=${sillIn[1].toFixed(2)})`,
    );
    assert.ok(
      Math.abs(sillOut[0]) > 0.45 && Math.abs(sillOut[0]) < 0.90,
      `${pane.id}: outboard x=${sillOut[0].toFixed(2)} ate the cheek or stayed on the crown`,
    );
    assert.ok(
      Math.abs(headOut[1] - headIn[1]) < 0.002,
      `${pane.id}: head is not level in side view (Δy=${(headOut[1] - headIn[1]).toFixed(3)})`,
    );
    assert.ok(
      Math.abs(sillOut[1] - sillIn[1]) < 0.002,
      `${pane.id}: sill is not level in side view`,
    );
    const rakeDeg = Math.atan2(headIn[1] - sillIn[1], sillIn[2] - headIn[2]) * (180 / Math.PI);
    assert.ok(
      Math.abs(rakeDeg - 60) < 2,
      `${pane.id}: mullion rake ${rakeDeg.toFixed(1)}° is not 60° to the horizon`,
    );
    const across = sub(sillOut, sillIn);
    const along = sub(headIn, sillIn);
    const triple = dot(cross(across, along), sub(headOut, sillIn));
    assert.ok(Math.abs(triple) < 0.002, `${pane.id} is not planar`);
    const normal = cross(across, along);
    if (normal[2] < 0) {
      normal[0] *= -1;
      normal[1] *= -1;
      normal[2] *= -1;
    }
    normals.push(normal);
    const centroid = sillIn.map((_, axis) =>
      (sillIn[axis] + sillOut[axis] + headOut[axis] + headIn[axis]) / 4);
    const glass = glazing.find((part) => part.id === `windshield-${pane.id}:glazing`);
    assert.ok(glass, `нет стекла ${pane.id}`);
    const glassCentroid = glass.vertices.reduce(
      (sum, vertex) => sum.map((value, axis) => value + vertex[axis]),
      [0, 0, 0],
    ).map((value) => value / glass.vertices.length);
    const glassCentroidBody = worldToBody(glassCentroid);
    const inward = Math.hypot(
      centroid[0] - glassCentroidBody[0],
      centroid[1] - glassCentroidBody[1],
      centroid[2] - glassCentroidBody[2],
    );
    assert.ok(
      inward > 0.008 && inward < 0.022,
      `${pane.id}: glass is not in the frame rebate (${inward.toFixed(3)} m)`,
    );
    for (const part of dc3SkinPanelParts.filter((entry) =>
      entry.group === "fuselage-panels" && !entry.id.includes("fairing")
    )) {
      for (const vertex of part.vertices) {
        const body = worldToBody(vertex);
        const dx = body[0] - centroid[0];
        const dy = body[1] - centroid[1];
        const dz = body[2] - centroid[2];
        assert.ok(
          dx * dx + dy * dy + dz * dz > 0.08 ** 2,
          `${part.id} закрывает проём ${pane.id}`,
        );
      }
    }
  }
  assert.ok(normals[0][0] * normals[1][0] < 0, "panes are not a V");
  assert.ok(normals[0][2] > 0 && normals[1][2] > 0, "panes do not face forward");
  const yaw = (normal) => Math.atan2(normal[0], normal[2]) * (180 / Math.PI);
  const vDeg = Math.abs(yaw(normals[0]) - yaw(normals[1]));
  assert.ok(Math.abs(vDeg - 60) < 2, `plan V is ${vDeg.toFixed(1)}°, not 60°`);
  const visor = dc3SkinPanelParts.find((part) =>
    part.id === "fuselage:windshield:visor-fairing");
  const dome = dc3SkinPanelParts.find((part) =>
    part.id === "fuselage:windshield:dome-fairing");
  const domeSides = dc3SkinPanelParts.filter((part) =>
    part.id.startsWith("fuselage:windshield:dome-fairing"));
  assert.ok(visor, "нет лба над лобовыми");
  assert.equal(dome, undefined, "центральный dome снова закрыл лоб плоской крышкой");
  assert.equal(domeSides.length, 2, `dome patches ${domeSides.length}, need left+right temples`);
  const { greenhouseBrow, greenhouseForehead, fuselage } = dc3AirframeSurface;
  assert.ok(
    greenhouseBrow.apex[2] < greenhouseBrow.leftOut[2]
      && greenhouseBrow.leftOut[0] < 0
      && greenhouseBrow.rightOut[0] > 0,
    "brow fairing is not a triangle pointing aft onto the two heads",
  );
  const roofZ = greenhouseBrow.apex[2];
  assert.ok(Math.abs(roofZ - 5.8) < 1e-9, "brow apex is not the last roof station");
  const roofStation = fuselage.stations.find((station) => Math.abs(station.z - roofZ) < 1e-9);
  assert.ok(roofStation, "last roof station missing");
  const visorOuter = visor.vertices.slice(0, visor.vertices.length / 2).map(worldToBody);
  const visorYs = visorOuter.map((vertex) => vertex[1]);
  assert.ok(
    Math.max(...visorYs) - Math.min(...visorYs) > 0.08,
    `visor is still a flat triangle lid (${(Math.max(...visorYs) - Math.min(...visorYs)).toFixed(3)} m)`,
  );
  const nearestVisor = (target) => Math.min(
    ...visorOuter.map((vertex) => Math.hypot(
      vertex[0] - target[0],
      vertex[1] - target[1],
      vertex[2] - target[2],
    )),
  );
  for (const target of [
    ...greenhouseForehead.visorFore,
    greenhouseForehead.visorAft[0],
    greenhouseForehead.visorAft[2],
  ]) {
    const gap = nearestVisor(target);
    assert.ok(gap < 0.002, `visor leaves the windshield outer head by ${(gap * 1000).toFixed(1)} mm`);
  }
  const visorOnRoof = visorOuter.filter((vertex) => Math.abs(vertex[2] - roofZ) < 0.02);
  const visorRoofXs = [...new Set(visorOnRoof.map((vertex) => vertex[0].toFixed(3)))];
  assert.ok(
    visorRoofXs.length >= 5,
    `visor roof collapsed to ${visorRoofXs.length} columns — the squares behind the brow are back`,
  );
  let roofWorst = 0;
  for (const [x, y, z] of visorOnRoof) {
    const station = fuselage.at(z);
    const cosine = Math.max(-1, Math.min(1, x / station.halfWidth));
    const angle = y >= 0 ? Math.acos(cosine) : -Math.acos(cosine);
    const surface = fuselage.pointAt(station, angle);
    roofWorst = Math.max(roofWorst, Math.hypot(surface[0] - x, surface[1] - y, surface[2] - z));
  }
  assert.ok(
    roofWorst <= 0.004,
    `visor leaves the last roof ring by ${(roofWorst * 1000).toFixed(1)} mm`,
  );
  const skinPanels = dc3SkinPanelParts.filter((part) =>
    part.group === "fuselage-panels" && !part.id.includes("fairing"));
  const roofPartners = [...skinPanels, ...domeSides];
  let roofJoined = 0;
  for (const vertex of visorOnRoof) {
    if (roofPartners.some((part) =>
      part.id !== "fuselage:windshield:visor-fairing"
      && part.vertices.slice(0, part.vertices.length / 2).some((other) => {
        const body = worldToBody(other);
        return Math.hypot(
          vertex[0] - body[0],
          vertex[1] - body[1],
          vertex[2] - body[2],
        ) < 0.002;
      }))) roofJoined += 1;
  }
  assert.ok(
    roofJoined >= 3,
    `visor shares ${roofJoined} roof vertices — the join is a T or a gap`,
  );
  const gore2 = dc3SkinPanelParts.find((part) => part.id === "fuselage:bay1:gore2");
  assert.ok(gore2, "нет центрального клина крыши");
  const gore2Roof = gore2.vertices.slice(0, gore2.vertices.length / 2)
    .map(worldToBody)
    .filter((vertex) => Math.abs(vertex[2] - roofZ) < 0.02);
  assert.ok(gore2Roof.length >= 3, "gore2 has no roof-ring row");
  for (const target of gore2Roof) {
    const gap = nearestVisor(target);
    assert.ok(
      gap < 0.002,
      `visor leaves gore2 at (${target[0].toFixed(3)}, ${target[1].toFixed(3)}) by ${(gap * 1000).toFixed(1)} mm — square hole`,
    );
  }
  const rightHeadOut = greenhouseForehead.visorAft[2];
  const rightHeadIn = greenhouseForehead.visorFore[2];
  const rightHeadMid = [
    (rightHeadOut[0] + rightHeadIn[0]) / 2,
    (rightHeadOut[1] + rightHeadIn[1]) / 2,
    (rightHeadOut[2] + rightHeadIn[2]) / 2,
  ];
  const visorOnHead = visorOuter.filter((vertex) => vertex[2] > roofZ + 0.15);
  const headMidGap = Math.min(
    ...visorOnHead.map((vertex) => Math.hypot(
      vertex[0] - rightHeadMid[0],
      vertex[1] - rightHeadMid[1],
      vertex[2] - rightHeadMid[2],
    )),
  );
  assert.ok(
    headMidGap < 0.02,
    `visor skips the windshield head (${(headMidGap * 1000).toFixed(0)} mm from mid-bar) — hole next to the frame`,
  );
  for (const side of ["left", "right"]) {
    const close = dc3SkinPanelParts.find(
      (part) => part.id === `fuselage:windshield:roof-close-fairing-${side}`,
    );
    assert.ok(close, `нет зашивки прямоугольника крыши ${side}`);
    const closeOuter = close.vertices.slice(0, close.vertices.length / 2).map(worldToBody);
    const zs = closeOuter.map((vertex) => vertex[2]);
    assert.ok(
      Math.min(...zs) < 5.56 && Math.max(...zs) > 5.79,
      `${side} roof close does not span the temple-to-visor gap`,
    );
    let loftWorst = 0;
    for (const [x, y, z] of closeOuter) {
      const station = fuselage.at(z);
      const cosine = Math.max(-1, Math.min(1, x / station.halfWidth));
      const angle = y >= 0 ? Math.acos(cosine) : -Math.acos(cosine);
      const surface = fuselage.pointAt(station, angle);
      loftWorst = Math.max(
        loftWorst,
        Math.hypot(surface[0] - x, surface[1] - y, surface[2] - z),
      );
    }
    assert.ok(
      loftWorst <= 0.004,
      `${side} roof close leaves the loft by ${(loftWorst * 1000).toFixed(1)} mm`,
    );
    const closeRoof = closeOuter.filter((vertex) => Math.abs(vertex[2] - roofZ) < 0.02);
    assert.ok(closeRoof.length >= 4, `${side} roof close is still a two-point chord`);
    for (const target of closeRoof) {
      const gap = nearestVisor(target);
      assert.ok(
        gap < 0.002,
        `${side} roof close leaves the visor by ${(gap * 1000).toFixed(1)} mm`,
      );
    }
    const visorOnClose = visorOnRoof.filter((vertex) => {
      const station = fuselage.at(vertex[2]);
      const cosine = Math.max(-1, Math.min(1, vertex[0] / station.halfWidth));
      const angle = vertex[1] >= 0 ? Math.acos(cosine) : -Math.acos(cosine);
      const deg = (angle * 180) / Math.PI;
      return side === "right" ? deg >= 53 && deg <= 73 : deg >= 107 && deg <= 127;
    });
    assert.ok(visorOnClose.length >= 3, `${side} visor has no roof columns on the close`);
    for (const target of visorOnClose) {
      const gap = Math.min(
        ...closeOuter.map((vertex) => Math.hypot(
          vertex[0] - target[0],
          vertex[1] - target[1],
          vertex[2] - target[2],
        )),
      );
      assert.ok(
        gap < 0.002,
        `${side} visor roof leaves the close by ${(gap * 1000).toFixed(1)} mm — slit`,
      );
    }
    const temple = dc3SkinPanelParts.find((part) =>
      part.id === (side === "right"
        ? "fuselage:bay1:gore1:temple"
        : "fuselage:bay1:gore3:temple"));
    assert.ok(temple, `нет виска ${side}`);
    const templeFore = temple.vertices.slice(0, temple.vertices.length / 2)
      .map(worldToBody)
      .filter((vertex) => Math.abs(vertex[2] - Math.min(...zs)) < 0.02);
    const goreJoin = templeFore.filter((vertex) => Math.abs(vertex[0]) < 0.4);
    assert.ok(goreJoin.length >= 1, `${side} temple has no gore2 edge at 5.55`);
    for (const target of goreJoin) {
      const gap = Math.min(
        ...closeOuter.map((vertex) => Math.hypot(
          vertex[0] - target[0],
          vertex[1] - target[1],
          vertex[2] - target[2],
        )),
      );
      assert.ok(
        gap < 0.002,
        `${side} roof close leaves the temple by ${(gap * 1000).toFixed(1)} mm`,
      );
    }
  }
  const expand = (corners) => {
    const along = sub(corners[3], corners[0]);
    const across = sub(corners[1], corners[0]);
    const alongLen = Math.hypot(...along);
    const acrossLen = Math.hypot(...across);
    const alongU = along.map((value) => value / alongLen);
    const acrossU = across.map((value) => value / acrossLen);
    const mid = corners[0].map((_, axis) =>
      corners.reduce((sum, corner) => sum + corner[axis], 0) / 4);
    const margin = 0.045;
    return corners.map((corner) => {
      const fromMid = sub(corner, mid);
      const du = (fromMid[0] * alongU[0] + fromMid[1] * alongU[1] + fromMid[2] * alongU[2]) >= 0
        ? margin : -margin;
      const dv = (fromMid[0] * acrossU[0] + fromMid[1] * acrossU[1] + fromMid[2] * acrossU[2]) >= 0
        ? margin : -margin;
      return [
        corner[0] + alongU[0] * du + acrossU[0] * dv,
        corner[1] + alongU[1] * du + acrossU[1] * dv,
        corner[2] + alongU[2] * du + acrossU[2] * dv,
      ];
    });
  };
  const domeSkin = [
    ...visorOuter,
    ...domeSides.flatMap((part) =>
      part.vertices.slice(0, part.vertices.length / 2).map(worldToBody)),
  ];
  for (const pane of dc3AirframeSurface.sideLights) {
    const outer = expand(pane.corners);
    for (const target of [outer[2], outer[3], [
      (outer[2][0] + outer[3][0]) / 2,
      (outer[2][1] + outer[3][1]) / 2,
      (outer[2][2] + outer[3][2]) / 2,
    ]]) {
      const gap = Math.min(
        ...domeSkin.map((vertex) => Math.hypot(
          vertex[0] - target[0],
          vertex[1] - target[1],
          vertex[2] - target[2],
        )),
      );
      assert.ok(
        gap < 0.02,
        `${pane.id}: dome does not cover the side-light head (${(gap * 1000).toFixed(0)} mm)`,
      );
    }
  }
  const visorAftMid = greenhouseForehead.visorAft[1];
  const roofCrown = [0, roofStation.crown, roofZ];
  const chord = (point, a, b) => {
    const ab = sub(b, a);
    const ap = sub(point, a);
    const length = Math.hypot(...ab) || 1;
    const t = Math.max(0, Math.min(1, (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / (length * length)));
    const closest = [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t];
    return Math.hypot(point[0] - closest[0], point[1] - closest[1], point[2] - closest[2]);
  };
  const visorLift = Math.max(
    ...visorOuter.map((vertex) => chord(vertex, visorAftMid, roofCrown)),
  );
  assert.ok(
    visorLift > 0.01,
    `visor is a ruled triangle lid (${(visorLift * 1000).toFixed(0)} mm off the visor-roof chord)`,
  );
  for (const pane of dc3AirframeSurface.sideLights) {
    const outer = expand(pane.corners);
    const headY = Math.min(outer[2][1], outer[3][1]) - 0.01;
    const xLow = Math.min(outer[2][0], outer[3][0]);
    const xHigh = Math.max(outer[2][0], outer[3][0]);
    const zLow = Math.min(outer[2][2], outer[3][2]);
    const zHigh = Math.max(outer[2][2], outer[3][2]);
    for (const part of skinPanels) {
      for (const vertex of part.vertices.slice(0, part.vertices.length / 2)) {
        const [x, y, z] = worldToBody(vertex);
        if (z <= zLow + 0.001 || z >= zHigh - 0.001) continue;
        if (y < headY) continue;
        if (x < xLow - 0.04 || x > xHigh + 0.04) continue;
        assert.fail(
          `${part.id} still covers the side-light head at `
          + `(${x.toFixed(3)}, ${y.toFixed(3)}, ${z.toFixed(3)})`,
        );
      }
    }
  }
  const holeFrom = roofZ + 0.02;
  const holeTo = dc3AirframeSurface.greenhouseSill.apex[2] - 0.02;
  const windshieldSillY = Math.min(
    ...dc3AirframeSurface.windshields.flatMap((pane) =>
      [pane.corners[0][1], pane.corners[1][1]]),
  );
  for (const part of skinPanels) {
    for (const vertex of part.vertices.slice(0, part.vertices.length / 2)) {
      const [x, y, z] = worldToBody(vertex);
      if (z <= holeFrom || z >= holeTo) continue;
      if (y < windshieldSillY - 0.02) continue;
      const cosine = Math.max(-1, Math.min(1, x / fuselage.at(z).halfWidth));
      const angle = y >= 0 ? Math.acos(cosine) : -Math.acos(cosine);
      assert.ok(
        angle <= Math.PI * 0.2 + 1e-6 || angle >= Math.PI * 0.8 - 1e-6,
        `${part.id} still carries an oval lip through the windshield hole at z=${z.toFixed(3)}`,
      );
    }
  }
  const { greenhouseSill } = dc3AirframeSurface;
  assert.ok(
    Math.abs(greenhouseSill.apex[2] - 6.85) < 1e-9
      && greenhouseSill.leftOut[0] < 0
      && greenhouseSill.rightOut[0] > 0
      && greenhouseSill.apex[2] > greenhouseSill.leftIn[2],
    "sill fairing apex is not on the first cap ring ahead of the sills",
  );
  const deckZ = greenhouseSill.apex[2];
  const deckStation = fuselage.stations.find((station) => Math.abs(station.z - deckZ) < 1e-9);
  assert.ok(deckStation, "first cap station missing");
  for (const side of ["left", "right"]) {
    const panel = dc3SkinPanelParts.find(
      (part) => part.id === `fuselage:windshield:sill-fairing-${side}`,
    );
    assert.ok(panel, `нет порожного треугольника ${side}`);
    const outer = panel.vertices.slice(0, panel.vertices.length / 2).map(worldToBody);
    const fore = outer.filter((vertex) => Math.abs(vertex[2] - deckZ) < 0.02);
    assert.ok(fore.length >= 3, `${side} sill fairing fore row has ${fore.length} points`);
    let worst = 0;
    for (const [x, y] of fore) {
      const cosine = Math.max(-1, Math.min(1, x / deckStation.halfWidth));
      const angle = y >= 0 ? Math.acos(cosine) : -Math.acos(cosine);
      const surface = fuselage.pointAt(deckStation, angle);
      worst = Math.max(worst, Math.hypot(surface[0] - x, surface[1] - y));
    }
    assert.ok(
      worst <= 0.004,
      `${side} sill fairing leaves the loft by ${(worst * 1000).toFixed(1)} mm`,
    );
    let joined = 0;
    for (const vertex of fore) {
      if (skinPanels.some((part) =>
        part.vertices.slice(0, part.vertices.length / 2).some((other) => {
          const body = worldToBody(other);
          return Math.hypot(
            vertex[0] - body[0],
            vertex[1] - body[1],
            vertex[2] - body[2],
          ) < 0.002;
        }))) joined += 1;
    }
    assert.ok(
      joined >= 3,
      `${side} sill fairing shares ${joined} cap vertices — the join is a T or a gap`,
    );
  }
  const sillPanels = dc3SkinPanelParts.filter((part) =>
    part.id.startsWith("fuselage:windshield:sill-fairing-"));
  const centreHits = sillPanels.flatMap((part) =>
    part.vertices.slice(0, part.vertices.length / 2).map(worldToBody))
    .filter((vertex) => Math.abs(vertex[0]) < 0.03);
  assert.ok(
    centreHits.length >= 2,
    `sill fairings do not reach the centreline (${centreHits.length} vertices)`,
  );
  const leftSill = dc3SkinPanelParts.find(
    (part) => part.id === "fuselage:windshield:sill-fairing-left");
  const rightSill = dc3SkinPanelParts.find(
    (part) => part.id === "fuselage:windshield:sill-fairing-right");
  const leftOuter = leftSill.vertices.slice(0, leftSill.vertices.length / 2).map(worldToBody);
  const rightOuter = rightSill.vertices.slice(0, rightSill.vertices.length / 2).map(worldToBody);
  let abut = 0;
  for (const vertex of leftOuter) {
    if (rightOuter.some((other) => Math.hypot(
      vertex[0] - other[0],
      vertex[1] - other[1],
      vertex[2] - other[2],
    ) < 0.002)) abut += 1;
  }
  assert.ok(
    abut >= 2,
    `sill fairings share ${abut} vertices — the centreline is a gap`,
  );
  for (const pane of dc3AirframeSurface.windshields) {
    const outer = expand(pane.corners);
    const panel = dc3SkinPanelParts.find(
      (part) => part.id === `fuselage:windshield:sill-fairing-${pane.id}`,
    );
    const pts = panel.vertices.slice(0, panel.vertices.length / 2).map(worldToBody);
    const nearest = (target) => Math.min(
      ...pts.map((vertex) => Math.hypot(
        vertex[0] - target[0],
        vertex[1] - target[1],
        vertex[2] - target[2],
      )),
    );
    assert.ok(
      nearest(outer[0]) < 0.002,
      `${pane.id}: sill fairing leaves the inboard sill by ${(nearest(outer[0]) * 1000).toFixed(1)} mm`,
    );
    assert.ok(
      nearest(outer[1]) < 0.002,
      `${pane.id}: sill fairing leaves the outboard sill by ${(nearest(outer[1]) * 1000).toFixed(1)} mm`,
    );
  }
});

test("боковое стекло двустекольной схемы ниже лобовых, верх и низ в горизонте", () => {
  const { windshields, sideLights, worldToBody } = dc3AirframeSurface;
  assert.equal(sideLights.length, 2);
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  for (const pane of sideLights) {
    const [sillIn, sillOut, headOut, headIn] = pane.corners;
    const front = windshields.find((entry) => entry.id === pane.id);
    assert.ok(front, `нет лобового ${pane.id}`);
    const frontSill = Math.min(front.corners[0][1], front.corners[1][1]);
    const frontHead = Math.max(front.corners[2][1], front.corners[3][1]);
    assert.ok(
      Math.abs(headIn[1] - frontHead) < 0.02,
      `${pane.id}: side head is not on the windshield head line`,
    );
    const paneHeight = headIn[1] - sillIn[1];
    assert.ok(
      paneHeight > 0.26 && paneHeight < 0.34,
      `${pane.id}: side glass height ${paneHeight.toFixed(3)} m is not two-thirds of the previous pane`,
    );
    assert.ok(
      sillIn[1] < frontSill - 0.04,
      `${pane.id}: side sill ${sillIn[1].toFixed(3)} is not below the windshield`,
    );
    const expand = (corners) => {
      const along = sub(corners[3], corners[0]);
      const across = sub(corners[1], corners[0]);
      const alongLen = Math.hypot(...along);
      const acrossLen = Math.hypot(...across);
      const alongU = along.map((value) => value / alongLen);
      const acrossU = across.map((value) => value / acrossLen);
      const mid = corners[0].map((_, axis) =>
        corners.reduce((sum, corner) => sum + corner[axis], 0) / 4);
      const margin = 0.045;
      return corners.map((corner) => {
        const fromMid = sub(corner, mid);
        const du = (fromMid[0] * alongU[0] + fromMid[1] * alongU[1] + fromMid[2] * alongU[2]) >= 0
          ? margin : -margin;
        const dv = (fromMid[0] * acrossU[0] + fromMid[1] * acrossU[1] + fromMid[2] * acrossU[2]) >= 0
          ? margin : -margin;
        return [
          corner[0] + alongU[0] * du + acrossU[0] * dv,
          corner[1] + alongU[1] * du + acrossU[1] * dv,
          corner[2] + alongU[2] * du + acrossU[2] * dv,
        ];
      });
    };
    const outerGap = Math.hypot(
      ...sub(expand(pane.corners)[3], expand(front.corners)[2]),
    );
    assert.ok(
      outerGap < 0.01,
      `${pane.id}: outer frames do not meet at the brow (${outerGap.toFixed(3)} m)`,
    );
    const topRun = Math.hypot(...sub(headOut, headIn));
    assert.ok(
      topRun > 0.32 && topRun < 0.52,
      `${pane.id}: side glass top is not a quarter shorter (${topRun.toFixed(3)} m)`,
    );
    assert.ok(
      Math.abs(headOut[1] - headIn[1]) < 0.002,
      `${pane.id}: side head is not level`,
    );
    assert.ok(
      Math.abs(sillOut[1] - sillIn[1]) < 0.002,
      `${pane.id}: side sill is not level`,
    );
    const across = sub(sillOut, sillIn);
    const along = sub(headIn, sillIn);
    const triple = dot(cross(across, along), sub(headOut, sillIn));
    assert.ok(Math.abs(triple) < 0.002, `${pane.id} side light is not planar`);
    const glass = dc3SkinPanelParts.find((part) => part.id === `sidelight-${pane.id}:glazing`);
    assert.ok(glass, `нет бокового стекла ${pane.id}`);
    assert.ok(dc3SkinPanelParts.some((part) => part.id === `sidelight-${pane.id}:frame-sill`));
    assert.ok(dc3SkinPanelParts.some((part) => part.id === `sidelight-${pane.id}:frame-head`));
    assert.ok(dc3SkinPanelParts.some((part) => part.id === `sidelight-${pane.id}:frame-aft`));
    assert.ok(
      dc3SkinPanelParts.some((part) => part.id === `sidelight-${pane.id}:frame-inboard`),
      `нет внутренней рамы ${pane.id}`,
    );
    assert.ok(
      sillOut[2] - headOut[2] > 0.05 && sillOut[2] - headOut[2] < 0.14,
      `${pane.id}: aft sill is not raked toward the nose (${(sillOut[2] - headOut[2]).toFixed(3)} m)`,
    );
    const { fuselage } = dc3AirframeSurface;
    const loftXAtY = (z, y) => {
      const station = fuselage.at(z);
      const cy = (station.crown + station.keel) / 2;
      const ry = (station.crown - station.keel) / 2;
      const power = station.upperPower ?? 2;
      const unit = Math.max(0, Math.min(1, (y - cy) / Math.max(ry, 1e-9)));
      const sine = Math.pow(unit, power / 2);
      const angle = Math.asin(Math.max(0, Math.min(1, sine)));
      const signed = pane.id === "right" ? angle : Math.PI - angle;
      return fuselage.pointAt(station, signed)[0];
    };
    for (const [name, corner] of [["sillIn", sillIn], ["sillOut", sillOut]]) {
      const loftX = loftXAtY(corner[2], corner[1]);
      assert.ok(
        Math.abs(corner[0]) <= Math.abs(loftX) + 0.004,
        `${pane.id}: ${name} leaves the hull by ${(corner[0] - loftX).toFixed(3)} m`,
      );
    }
    const outer = expand(pane.corners);
    for (const [name, corner] of [["sillOutO", outer[1]], ["headOutO", outer[2]]]) {
      const loftX = loftXAtY(corner[2], corner[1]);
      assert.ok(
        Math.abs(Math.abs(corner[0]) - Math.abs(loftX)) < 0.008,
        `${pane.id}: ${name} is not on the loft (${(corner[0] - loftX).toFixed(3)} m)`,
      );
    }
    assert.ok(
      Math.abs(sillOut[0]) < Math.abs(outer[1][0]) - 0.004,
      `${pane.id}: aft sill glass is not inside its frame`,
    );
    const aftFrame = dc3SkinPanelParts.find((part) =>
      part.id === `sidelight-${pane.id}:frame-aft`);
    assert.ok(aftFrame, `нет задней рамы ${pane.id}`);
    for (const vertex of aftFrame.vertices) {
      const body = worldToBody(vertex);
      const loftX = loftXAtY(body[2], body[1]);
      assert.ok(
        Math.abs(body[0]) <= Math.abs(loftX) + 0.008,
        `${pane.id}: aft frame leaves the hull by ${(body[0] - loftX).toFixed(3)} m`,
      );
    }
    for (const wrap of [
      `fuselage:windshield:temple-fairing-${pane.id}`,
      `fuselage:windshield:cheek-sill-fairing-${pane.id}`,
      `fuselage:windshield:cheek-aft-fairing-${pane.id}`,
      `fuselage:windshield:cheek-jowl-fairing-${pane.id}`,
      `fuselage:windshield:sill-skirt-fairing-${pane.id}`,
    ]) {
      assert.equal(
        dc3SkinPanelParts.some((part) => part.id === wrap),
        false,
        `${wrap} still wraps the side light`,
      );
    }
    const aftFairing = dc3SkinPanelParts.find(
      (part) => part.id === `fuselage:windshield:aft-fairing-${pane.id}`,
    );
    assert.ok(aftFairing, `нет обвода задней стойки ${pane.id}`);
    const aftOuter = aftFairing.vertices.slice(0, aftFairing.vertices.length / 2)
      .map(worldToBody);
    const nearestAft = (target) => Math.min(
      ...aftOuter.map((vertex) => Math.hypot(
        vertex[0] - target[0],
        vertex[1] - target[1],
        vertex[2] - target[2],
      )),
    );
    assert.ok(
      nearestAft(outer[2]) < 0.002,
      `${pane.id}: aft fairing leaves the outer head by ${(nearestAft(outer[2]) * 1000).toFixed(1)} mm`,
    );
    assert.ok(
      nearestAft(outer[1]) < 0.002,
      `${pane.id}: aft fairing leaves the outer sill by ${(nearestAft(outer[1]) * 1000).toFixed(1)} mm`,
    );
    const sign = pane.id === "right" ? 1 : -1;
    const cabinZ = 5.15;
    const loftAt = (vertex) => {
      const station = fuselage.at(vertex[2]);
      const cy = (station.crown + station.keel) / 2;
      const ry = (station.crown - station.keel) / 2;
      const power = station.upperPower ?? 2;
      const unit = Math.max(0, Math.min(1, (vertex[1] - cy) / Math.max(ry, 1e-9)));
      const sine = Math.pow(unit, power / 2);
      const angle = Math.asin(Math.max(0, Math.min(1, sine)));
      const surface = fuselage.pointAt(station, sign > 0 ? angle : Math.PI - angle);
      return [surface[0], vertex[1], vertex[2]];
    };
    const onLoft = (vertex, slack = 0.004) => {
      const loft = loftAt(vertex);
      return Math.hypot(loft[0] - vertex[0], loft[1] - vertex[1]) < slack;
    };
    let cabinLoftHits = 0;
    for (const vertex of aftOuter) {
      if (Math.abs(vertex[2] - cabinZ) > 0.02) continue;
      if (onLoft(vertex)) cabinLoftHits += 1;
    }
    assert.ok(
      cabinLoftHits >= 3,
      `${pane.id}: aft fairing cabin row has ${cabinLoftHits} points on station 5.15`,
    );
    let hullHits = 0;
    for (const vertex of aftOuter) {
      if (vertex[2] < cabinZ + 0.04 || vertex[2] > cabinZ + 0.22) continue;
      if (onLoft(vertex)) hullHits += 1;
    }
    assert.ok(
      hullHits >= 2,
      `${pane.id}: aft fairing does not follow the loft (${hullHits} hull hits) — still a knife`,
    );
    const fairingZs = aftOuter.map((vertex) => vertex[2]);
    assert.ok(
      Math.max(...fairingZs) - Math.min(...fairingZs) > 0.25,
      `${pane.id}: aft fairing z-run is a flange, not a hull`,
    );
    const cabinSkin = dc3SkinPanelParts.filter((part) =>
      part.group === "fuselage-panels"
      && !part.id.includes("fairing")
      && /gore[014]/.test(part.id));
    let cabinJoined = 0;
    for (const vertex of aftOuter) {
      if (Math.abs(vertex[2] - cabinZ) > 0.02) continue;
      if (cabinSkin.some((part) =>
        part.vertices.slice(0, part.vertices.length / 2).some((other) => {
          const body = worldToBody(other);
          return Math.hypot(
            vertex[0] - body[0],
            vertex[1] - body[1],
            vertex[2] - body[2],
          ) < 0.002;
        }))) cabinJoined += 1;
    }
    assert.ok(
      cabinJoined >= 1,
      `${pane.id}: aft fairing shares ${cabinJoined} cabin vertices — the join is a T or a gap`,
    );
    const cheek = dc3SkinPanelParts.find((part) =>
      part.id === (pane.id === "right" ? "fuselage:bay0:gore0" : "fuselage:bay0:gore4"));
    assert.ok(cheek, `нет носового клина под порогом ${pane.id}`);
    const cheekOuter = cheek.vertices.slice(0, cheek.vertices.length / 2)
      .map(worldToBody);
    const nearestCheek = (target) => Math.min(
      ...cheekOuter.map((vertex) => Math.hypot(
        vertex[0] - target[0],
        vertex[1] - target[1],
        vertex[2] - target[2],
      )),
    );
    assert.ok(
      nearestCheek(outer[1]) < 0.002,
      `${pane.id}: nose cheek leaves the outer aft sill by ${(nearestCheek(outer[1]) * 1000).toFixed(1)} mm`,
    );
    assert.ok(
      nearestCheek(outer[0]) < 0.002,
      `${pane.id}: nose cheek leaves the outer fore sill by ${(nearestCheek(outer[0]) * 1000).toFixed(1)} mm`,
    );
    const plug = dc3SkinPanelParts.find(
      (part) => part.id === `fuselage:windshield:corner-plug-fairing-${pane.id}`,
    );
    assert.ok(plug, `нет заглушки щели ${pane.id}`);
    const plugOuter = plug.vertices.slice(0, plug.vertices.length / 2).map(worldToBody);
    const nearestPlug = (target) => Math.min(
      ...plugOuter.map((vertex) => Math.hypot(
        vertex[0] - target[0],
        vertex[1] - target[1],
        vertex[2] - target[2],
      )),
    );
    const windshield = dc3AirframeSurface.windshields.find((entry) => entry.id === pane.id);
    const windshieldOuter = expand(windshield.corners);
    assert.ok(
      nearestPlug(outer[3]) < 0.002,
      `${pane.id}: corner plug leaves the shared head by ${(nearestPlug(outer[3]) * 1000).toFixed(1)} mm`,
    );
    assert.ok(
      nearestPlug(outer[0]) < 0.002,
      `${pane.id}: corner plug leaves the side sill by ${(nearestPlug(outer[0]) * 1000).toFixed(1)} mm`,
    );
    assert.ok(
      nearestPlug(windshieldOuter[1]) < 0.002,
      `${pane.id}: corner plug leaves the windshield sill by ${(nearestPlug(windshieldOuter[1]) * 1000).toFixed(1)} mm`,
    );
    const noseClose = dc3SkinPanelParts.find(
      (part) => part.id === `fuselage:windshield:corner-nose-fairing-${pane.id}`,
    );
    assert.ok(noseClose, `нет закрытия дыры носа ${pane.id}`);
    const noseOuter = noseClose.vertices.slice(0, noseClose.vertices.length / 2)
      .map(worldToBody);
    const nearestNose = (target) => Math.min(
      ...noseOuter.map((vertex) => Math.hypot(
        vertex[0] - target[0],
        vertex[1] - target[1],
        vertex[2] - target[2],
      )),
    );
    assert.ok(
      nearestNose(outer[0]) < 0.002,
      `${pane.id}: corner nose leaves the side sill by ${(nearestNose(outer[0]) * 1000).toFixed(1)} mm`,
    );
    assert.ok(
      nearestNose(windshieldOuter[1]) < 0.002,
      `${pane.id}: corner nose leaves the windshield sill by ${(nearestNose(windshieldOuter[1]) * 1000).toFixed(1)} mm`,
    );
    const capZ = dc3AirframeSurface.greenhouseSill.apex[2];
    assert.ok(
      Math.max(...noseOuter.map((vertex) => vertex[2])) > capZ - 0.02,
      `${pane.id}: corner nose does not reach the cap (still a skirt at the sills)`,
    );
    const sillFairing = dc3SkinPanelParts.find(
      (part) => part.id === `fuselage:windshield:sill-fairing-${pane.id}`,
    );
    const sillCap = sillFairing.vertices.slice(0, sillFairing.vertices.length / 2)
      .map(worldToBody)
      .filter((vertex) => Math.abs(vertex[2] - capZ) < 0.02);
    const sillCapOut = sillCap.reduce((best, vertex) =>
      Math.abs(vertex[0]) > Math.abs(best[0]) ? vertex : best);
    assert.ok(
      nearestNose(sillCapOut) < 0.002,
      `${pane.id}: corner nose leaves the sill-fairing cap by ${(nearestNose(sillCapOut) * 1000).toFixed(1)} mm`,
    );
    const cheekCap = cheekOuter.filter((vertex) => Math.abs(vertex[2] - capZ) < 0.02);
    const cheekCapTop = cheekCap.reduce((best, vertex) =>
      vertex[1] > best[1] ? vertex : best);
    assert.ok(
      nearestNose(cheekCapTop) < 0.002,
      `${pane.id}: corner nose leaves the cheek cap by ${(nearestNose(cheekCapTop) * 1000).toFixed(1)} mm`,
    );
    let loftWorst = 0;
    for (const [x, y, z] of noseOuter) {
      if (Math.abs(z - capZ) > 0.02) continue;
      const station = fuselage.at(z);
      const cosine = Math.max(-1, Math.min(1, x / station.halfWidth));
      const angle = y >= 0 ? Math.acos(cosine) : -Math.acos(cosine);
      const surface = fuselage.pointAt(station, angle);
      loftWorst = Math.max(
        loftWorst,
        Math.hypot(surface[0] - x, surface[1] - y, surface[2] - z),
      );
    }
    assert.ok(
      loftWorst <= 0.004,
      `${pane.id}: corner nose leaves the cap loft by ${(loftWorst * 1000).toFixed(1)} mm`,
    );
    assert.ok(
      cheekOuter.some((vertex) => Math.abs(vertex[2] - 5.15) < 0.02),
      `${pane.id}: nose cheek does not reach the cabin station`,
    );
    const paneMinZ = Math.min(sillIn[2], sillOut[2], headOut[2], headIn[2]);
    const paneMaxZ = Math.max(sillIn[2], sillOut[2], headOut[2], headIn[2]);
    const paneSillY = Math.min(sillIn[1], sillOut[1]);
    const paneHeadY = Math.max(headIn[1], headOut[1]);
    const normal = cross(across, along);
    assert.ok(
      Math.abs(normal[0]) > Math.abs(normal[1]),
      `${pane.id}: pane still faces up instead of the fuselage`,
    );
    for (const part of dc3SkinPanelParts.filter((entry) =>
      entry.group === "fuselage-panels"
      && !entry.id.includes("fairing")
    )) {
      for (const vertex of part.vertices.slice(0, part.vertices.length / 2)) {
        const body = worldToBody(vertex);
        assert.ok(
          body[1] <= paneSillY + 0.01
          || body[1] >= paneHeadY - 0.01
          || body[2] <= paneMinZ + 0.01
          || body[2] >= paneMaxZ - 0.01,
          `${part.id} закрывает боковой проём ${pane.id}`,
        );
      }
    }
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
  const { wing, worldToBody } = dc3AirframeSurface;
  for (const lamp of [green, red]) {
    const board = lamp.center[0] < 0 ? "starboard" : "port";
    const cap = dc3BlockoutObject.parts.find((part) =>
      part.id === `nav-light-${board}-cap`);
    assert.ok(cap && cap.kind === "mesh", `нет стеклянного колпака ${board}`);
    assert.equal(cap.material, "lamp-glass", `${board}: колпак не из стекла`);
    const body = cap.vertices.map(worldToBody);
    const outboard = Math.max(...body.map((point) => Math.abs(point[0])));
    assert.ok(
      outboard > wing.halfSpan - 0.02,
      `${board}: АНО не на законцовке (x=${outboard.toFixed(2)})`,
    );
    const tipBand = body.filter((point) => Math.abs(point[0]) > outboard - 0.004);
    const tipSpan = Math.max(...tipBand.map((point) => point[1]))
      - Math.min(...tipBand.map((point) => point[1]));
    assert.ok(
      tipSpan < 0.06,
      `${board}: колпак всё ещё цилиндр на торце (${tipSpan.toFixed(3)} м)`,
    );
    const bulb = worldToBody(lamp.center);
    const xs = body.map((point) => Math.abs(point[0]));
    const mid = (Math.min(...xs) + Math.max(...xs)) / 2;
    assert.ok(
      Math.abs(bulb[0]) > mid,
      `${board}: лампа сидит во внутренней половине колпака и светит в крыло`,
    );
    const capMin = [0, 1, 2].map((axis) => Math.min(...body.map((point) => point[axis])));
    const capMax = [0, 1, 2].map((axis) => Math.max(...body.map((point) => point[axis])));
    assert.ok(
      bulb[0] > capMin[0] && bulb[0] < capMax[0]
        && bulb[1] > capMin[1] && bulb[1] < capMax[1]
        && bulb[2] > capMin[2] && bulb[2] < capMax[2],
      `${board}: лампа не внутри колпака`,
    );
  }
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
    "panel-windshield",
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
  // Было 160; два сплошных шпангоута на бровях и пороге убраны из проёма
  // стёкол, затем диск на 5.8 — из проёма бокового. Снаружи 157, плюс
  // накладка-колпак на носовой дырке.
  assert.equal(
    dc3BlockoutObject.parts.length - cabin.length,
    158,
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

