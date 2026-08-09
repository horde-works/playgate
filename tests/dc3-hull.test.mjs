// Обводы, агрегаты и отделка DC-3. Числа восстанавливаются из выпущенной
// геометрии; авторские помощники модели не вызываются.

import { strict as assert } from "node:assert";
import test from "node:test";

import {
  dc3Object, dc3CoreParts, dc3HullParts, dc3RigParts,
} from "../games/make-a-mess/src/content/objects/vehicles/dc3Object.ts";

const TOTAL_BUDGET = 900;
const MAIN_WHEEL = { fs: 5.868, bl: 2.820, wl: -2.611, radius: 0.550 };
const TAIL_WHEEL = { fs: 17.320, wl: -0.972, radius: 0.244 };
const WINDOW_COUNT = 7;

const groundAngle = (() => {
  const deltaWl = MAIN_WHEEL.wl - TAIL_WHEEL.wl;
  const deltaZ = -MAIN_WHEEL.fs + TAIL_WHEEL.fs;
  const target = MAIN_WHEEL.radius - TAIL_WHEEL.radius;
  return Math.atan2(deltaZ, deltaWl) - Math.acos(target / Math.hypot(deltaWl, deltaZ));
})();
const COS = Math.cos(groundAngle);
const SIN = Math.sin(groundAngle);
const forward = (fs, wl) => ({ y: wl * COS - fs * SIN, z: -fs * COS - wl * SIN });
const wheel = forward(MAIN_WHEEL.fs, MAIN_WHEEL.wl);
const OFFSET_Y = wheel.y - MAIN_WHEEL.radius;
const OFFSET_Z = wheel.z;
const toAircraft = ([x, y, z]) => {
  const worldY = y + OFFSET_Y;
  const worldZ = z + OFFSET_Z;
  return { fs: -(worldZ * COS + worldY * SIN), bl: x, wl: worldY * COS - worldZ * SIN };
};

const vertices = (part) => {
  if (part.kind === "mesh") return part.vertices;
  if (part.kind === "box") {
    const [cx, cy, cz] = part.center;
    const [sx, sy, sz] = part.size;
    const out = [];
    for (const dx of [-1, 1]) for (const dy of [-1, 1]) for (const dz of [-1, 1]) {
      out.push([cx + dx * sx / 2, cy + dy * sy / 2, cz + dz * sz / 2]);
    }
    return out;
  }
  return [part.from, part.to];
};
const find = (id) => dc3Object.parts.find((part) => part.id === id);
const withPrefix = (prefix) => dc3Object.parts.filter((part) => part.id.startsWith(prefix));
const inGroup = (group) => dc3Object.parts.filter((part) => part.group === group);

/** Доля граней, чья нормаль смотрит ПРОЧЬ от центра детали. */
const outwardFraction = (part) => {
  if (part.kind !== "mesh") return 1;
  let cx = 0; let cy = 0; let cz = 0;
  for (const vertex of part.vertices) { cx += vertex[0]; cy += vertex[1]; cz += vertex[2]; }
  const count = part.vertices.length;
  const centre = [cx / count, cy / count, cz / count];
  let outward = 0;
  let total = 0;
  for (const [a, b, c] of part.triangles) {
    const pa = part.vertices[a]; const pb = part.vertices[b]; const pc = part.vertices[c];
    const ux = pb[0] - pa[0]; const uy = pb[1] - pa[1]; const uz = pb[2] - pa[2];
    const vx = pc[0] - pa[0]; const vy = pc[1] - pa[1]; const vz = pc[2] - pa[2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const mx = (pa[0] + pb[0] + pc[0]) / 3 - centre[0];
    const my = (pa[1] + pb[1] + pc[1]) / 3 - centre[1];
    const mz = (pa[2] + pb[2] + pc[2]) / 3 - centre[2];
    total += 1;
    if (nx * mx + ny * my + nz * mz >= 0) outward += 1;
  }
  return total === 0 ? 1 : outward / total;
};

test("бюджет: совокупное число деталей под потолком паспорта", () => {
  assert.ok(dc3Object.parts.length <= TOTAL_BUDGET,
    `деталей ${dc3Object.parts.length} > ${TOTAL_BUDGET}`);
  assert.equal(dc3CoreParts.length + dc3HullParts.length + dc3RigParts.length, dc3Object.parts.length,
    "деталь не попала ни в одну объявленную группу");
});

/** Тело замкнуто, если каждое ребро (по КООРДИНАТАМ, а не по индексам) использовано дважды. */
const isClosed = (part) => {
  if (part.kind !== "mesh") return false;
  const key = (vertex) => vertex.map((value) => value.toFixed(6)).join(",");
  const edges = new Map();
  for (const [a, b, c] of part.triangles) {
    for (const [x, y] of [[a, b], [b, c], [c, a]]) {
      const first = key(part.vertices[x]);
      const second = key(part.vertices[y]);
      const id = first < second ? `${first}|${second}` : `${second}|${first}`;
      edges.set(id, (edges.get(id) ?? 0) + 1);
    }
  }
  for (const count of edges.values()) if (count !== 2) return false;
  return edges.size > 0;
};

const signedVolume = (part) => {
  let volume = 0;
  for (const [a, b, c] of part.triangles) {
    const pa = part.vertices[a]; const pb = part.vertices[b]; const pc = part.vertices[c];
    volume += (
      pa[0] * (pb[1] * pc[2] - pb[2] * pc[1])
      - pa[1] * (pb[0] * pc[2] - pb[2] * pc[0])
      + pa[2] * (pb[0] * pc[1] - pb[1] * pc[0])
    ) / 6;
  }
  return volume;
};

test("тела: у каждого замкнутого тела объём положителен", () => {
  // Теорема о дивергенции — единственная честная проверка навивки замкнутого
  // тела: у капота и у руля есть внутренние поверхности, и «нормали прочь от
  // центра» на них просто неверны.
  let closed = 0;
  for (const part of [...dc3HullParts, ...dc3RigParts]) {
    if (!isClosed(part)) continue;
    closed += 1;
    assert.ok(signedVolume(part) > 0,
      `${part.id}: замкнутое тело намотано внутрь (объём ${signedVolume(part).toFixed(5)})`);
  }
  assert.ok(closed >= 8, `замкнутых тел всего ${closed} — часть оболочек не сошлась`);
});

test("обшивка: ни одна наружная оболочка не вывернута наизнанку", () => {
  // Односторонняя поверхность нормалями внутрь исчезает из внешних кадров и
  // выглядит прозрачностью. На первом прогоне c2 так «испарился» весь фюзеляж.
  for (const part of [...dc3HullParts, ...dc3RigParts]) {
    if (part.kind !== "mesh") continue;
    if (part.doubleSided) continue;
    if (part.id.endsWith("-reveal")) continue; // у четверти проёма своя правда, ниже
    if (isClosed(part)) continue;               // замкнутые тела судятся объёмом, выше
    const fraction = outwardFraction(part);
    assert.ok(fraction >= 0.85,
      `${part.id}: наружу смотрит лишь ${(fraction * 100).toFixed(0)} % граней`);
  }
});

test("капот: замкнутое тело намотано наружу — проверка знаком объёма", () => {
  // У капота внутренний канал; «все нормали прочь от центра» на нём неверно.
  // Работает теорема о дивергенции: у правильно намотанного тела объём > 0.
  for (const side of ["left", "right"]) {
    const cowl = find(`cowl-${side}`);
    assert.ok(cowl, `нет капота ${side}`);
    let volume = 0;
    for (const [a, b, c] of cowl.triangles) {
      const pa = cowl.vertices[a]; const pb = cowl.vertices[b]; const pc = cowl.vertices[c];
      volume += (
        pa[0] * (pb[1] * pc[2] - pb[2] * pc[1])
        - pa[1] * (pb[0] * pc[2] - pb[2] * pc[0])
        + pa[2] * (pb[0] * pc[1] - pb[1] * pc[0])
      ) / 6;
    }
    assert.ok(volume > 0.02, `${cowl.id}: объём ${volume.toFixed(4)} — тело вывернуто или не замкнуто`);
  }
});

test("проёмы: четверти смотрят В проём, иначе снаружи видна изнанка", () => {
  const reveals = dc3Object.parts.filter((part) => part.id.endsWith("-reveal"));
  assert.ok(reveals.length >= 15, `четвертей ${reveals.length} — часть проёмов без стенок`);
  for (const part of reveals) {
    const fraction = outwardFraction(part);
    assert.ok(fraction <= 0.15,
      `${part.id}: ${(fraction * 100).toFixed(0)} % граней смотрит наружу вместо внутрь проёма`);
  }
});

test("обшивка: набор сидит ПОД обшивкой, а не торчит сквозь неё", () => {
  const skin = dc3Object.parts.filter((part) => part.group === "hull-fuselage")
    .flatMap((part) => vertices(part).map(toAircraft));
  const frames = withPrefix("frame-");
  assert.ok(frames.length >= 20, "шпангоутов меньше объявленного");
  for (const frame of frames) {
    const nodes = vertices(frame).map(toAircraft);
    const fs = nodes.reduce((sum, node) => sum + node.fs, 0) / nodes.length;
    const band = skin.filter((node) => Math.abs(node.fs - fs) < 0.30);
    if (band.length < 8) continue;
    const skinHalf = Math.max(...band.map((node) => Math.abs(node.bl)));
    const skinTop = Math.max(...band.map((node) => node.wl));
    const skinBottom = Math.min(...band.map((node) => node.wl));
    const frameHalf = Math.max(...nodes.map((node) => Math.abs(node.bl)));
    const frameTop = Math.max(...nodes.map((node) => node.wl));
    const frameBottom = Math.min(...nodes.map((node) => node.wl));
    assert.ok(frameHalf < skinHalf + 1e-3, `${frame.id}: шпангоут шире обшивки на ${(frameHalf - skinHalf).toFixed(4)} м`);
    assert.ok(frameTop < skinTop + 1e-3, `${frame.id}: шпангоут выше обшивки`);
    assert.ok(frameBottom > skinBottom - 1e-3, `${frame.id}: шпангоут ниже обшивки`);
  }
});

test("стык: обшивка крыла не залезает в объём фюзеляжа", () => {
  const fuselageHalf = Math.max(...dc3Object.parts
    .filter((part) => part.group === "hull-fuselage")
    .flatMap((part) => vertices(part).map((vertex) => Math.abs(vertex[0]))));
  for (const part of dc3Object.parts.filter((item) => item.group === "hull-wing")) {
    const inboard = Math.min(...vertices(part).map((vertex) => Math.abs(vertex[0])));
    assert.ok(inboard >= fuselageHalf - 1e-6,
      `${part.id}: корень крыла на ${inboard.toFixed(3)} внутри габарита фюзеляжа ${fuselageHalf.toFixed(3)}`);
  }
});

test("стык: зализ действительно закрывает щель — от борта до корня", () => {
  for (const side of ["left", "right"]) {
    const fillet = find(`hull-fillet-${side}`);
    assert.ok(fillet, `нет зализа ${side}`);
    const bl = vertices(fillet).map((vertex) => Math.abs(vertex[0]));
    const inner = Math.min(...bl);
    const outer = Math.max(...bl);
    assert.ok(outer >= 1.29, `${fillet.id}: зализ не доходит до корня крыла (${outer.toFixed(3)})`);
    assert.ok(inner <= 1.10, `${fillet.id}: зализ не садится на борт (${inner.toFixed(3)})`);
  }
});

test("окна: проёмы настоящие — четверти, рама, стекло и глубина за ним", () => {
  for (const side of ["left", "right"]) {
    for (let index = 0; index < WINDOW_COUNT; index += 1) {
      const id = `window-${side}-${index}`;
      for (const suffix of ["reveal", "frame", "glass"]) {
        assert.ok(find(`${id}-${suffix}`), `нет детали ${id}-${suffix}`);
      }
      const glass = find(`${id}-glass`);
      const reveal = find(`${id}-reveal`);
      const glassBl = Math.max(...vertices(glass).map((vertex) => Math.abs(vertex[0])));
      const revealBl = Math.max(...vertices(reveal).map((vertex) => Math.abs(vertex[0])));
      assert.ok(glassBl < revealBl - 0.02,
        `${id}: стекло не утоплено в четверть (${glassBl.toFixed(3)} против ${revealBl.toFixed(3)})`);
      // глубина за стеклом: интерьер должен существовать напротив окна
      const centre = vertices(glass).reduce((sum, vertex) =>
        [sum[0] + vertex[0], sum[1] + vertex[1], sum[2] + vertex[2]], [0, 0, 0])
        .map((value) => value / vertices(glass).length);
      const interior = inGroup("interior").some((part) => vertices(part).some((vertex) =>
        Math.abs(vertex[2] - centre[2]) < 1.0
        && Math.abs(vertex[0]) < Math.abs(centre[0])
        && vertex[1] < centre[1] + 0.8));
      assert.ok(interior, `${id}: за стеклом пусто — окно читается наклейкой`);
    }
  }
  const glazing = inGroup("glazing-cabin").filter((part) => part.id.endsWith("-glass"));
  assert.equal(glazing.length, WINDOW_COUNT * 2, `панелей остекления салона ${glazing.length}`);
});

test("окна: проём действительно вырезан из обшивки", () => {
  // Между рамой и стеклом обшивки быть не должно: ищем вершины обшивки внутри
  // габарита проёма. Наклейка на целой стенке провалит именно этот тест.
  const skin = dc3Object.parts.filter((part) => part.group === "hull-fuselage");
  for (const side of ["left", "right"]) {
    for (let index = 0; index < WINDOW_COUNT; index += 1) {
      const glass = find(`window-${side}-${index}-glass`);
      const nodes = vertices(glass).map(toAircraft);
      const fs0 = Math.min(...nodes.map((node) => node.fs)) + 0.06;
      const fs1 = Math.max(...nodes.map((node) => node.fs)) - 0.06;
      const wl0 = Math.min(...nodes.map((node) => node.wl)) + 0.06;
      const wl1 = Math.max(...nodes.map((node) => node.wl)) - 0.06;
      const sign = Math.sign(nodes[0].bl);
      const intruder = skin.some((part) => vertices(part).map(toAircraft).some((node) =>
        node.fs > fs0 && node.fs < fs1 && node.wl > wl0 && node.wl < wl1 && Math.sign(node.bl) === sign
        && Math.abs(node.bl) > 0.4));
      assert.ok(!intruder, `window-${side}-${index}: обшивка не вырезана — проём фальшивый`);
    }
  }
});

test("нос: профиль не растянут — высота набирается к станции 2.1", () => {
  // Ровно этот класс провалил ревизию c4: колонки таблицы сели на чужую сетку
  // станций, и нос выходил на полную высоту только к 3.5 м.
  const skin = dc3Object.parts.filter((part) => part.group === "hull-fuselage")
    .flatMap((part) => vertices(part).map(toAircraft));
  const crownAt = (fs) => {
    const band = skin.filter((node) => Math.abs(node.fs - fs) < 0.14);
    assert.ok(band.length > 4, `нет обшивки на станции ${fs}`);
    return Math.max(...band.map((node) => node.wl));
  };
  const peak = Math.max(...skin.filter((node) => node.fs < 8).map((node) => node.wl));
  const early = crownAt(2.10);
  assert.ok(early / peak > 0.90,
    `на станции 2.10 верх взял лишь ${(100 * early / peak).toFixed(0)} % высоты (${early.toFixed(3)} из ${peak.toFixed(3)})`);
  assert.ok(crownAt(1.06) / peak < 0.55,
    "нос уже полной высоты у станции 1.06 — обтекатель потерян");
});

test("фонарь: подоконная линия прямая, а гребень над ней поднимается", () => {
  // Инвариант, снятый с чертежа: окна стоят на месте, тело растёт вокруг них.
  const panes = withPrefix("cockpit-window-").filter((part) => part.id.endsWith("-glass"));
  assert.equal(panes.length, 6, `панелей бокового остекления кабины ${panes.length}`);
  const sills = panes.map((part) => {
    const nodes = vertices(part).map(toAircraft);
    return { fs: nodes.reduce((sum, node) => sum + node.fs, 0) / nodes.length, wl: Math.min(...nodes.map((node) => node.wl)) };
  }).sort((a, b) => a.fs - b.fs);
  const spread = Math.max(...sills.map((s) => s.wl)) - Math.min(...sills.map((s) => s.wl));
  assert.ok(spread < 0.10, `подоконная линия гуляет на ${spread.toFixed(3)} м`);

  const skin = dc3Object.parts.filter((part) => part.group === "hull-fuselage")
    .flatMap((part) => vertices(part).map(toAircraft));
  const crownAt = (fs) => Math.max(...skin.filter((node) => Math.abs(node.fs - fs) < 0.14).map((node) => node.wl));
  // Подъём меряется по КРАЯМ полосы остекления, а не по центрам крайних окон.
  const paneNodes = panes.flatMap((part) => vertices(part).map(toAircraft));
  const front = Math.min(...paneNodes.map((node) => node.fs));
  const rear = Math.max(...paneNodes.map((node) => node.fs));
  const rise = crownAt(rear) - crownAt(front);
  assert.ok(rise > 0.30,
    `гребень над остеклением (${front.toFixed(2)}…${rear.toFixed(2)}) поднялся лишь на ${rise.toFixed(3)} м`);
});

test("фонарь: лобовое — плоская пара панелей на своих станциях", () => {
  for (const side of ["left", "right"]) {
    const pane = find(`windscreen-${side}-glass`);
    assert.ok(pane, `нет лобового стекла ${side}`);
    const nodes = vertices(pane).map(toAircraft);
    const from = Math.min(...nodes.map((node) => node.fs));
    const to = Math.max(...nodes.map((node) => node.fs));
    assert.ok(Math.abs(from - 1.171) < 0.06 && Math.abs(to - 1.620) < 0.06,
      `${pane.id}: станции ${from.toFixed(3)}…${to.toFixed(3)}, ведомость требует 1.171…1.620`);
    // Наклон меряется по КОНЬКУ: у панели есть ещё угловая кромка, и по её
    // высоте угол выходит другим — мерить надо ту линию, что задана ведомостью.
    const ridge = nodes.filter((node) => Math.abs(node.bl) < 0.06).sort((a, b) => a.wl - b.wl);
    assert.ok(ridge.length >= 2, `${pane.id}: не нашлась линия конька`);
    const low = ridge[0];
    const high = ridge[ridge.length - 1];
    const rake = Math.atan2(high.fs - low.fs, high.wl - low.wl) * 180 / Math.PI;
    assert.ok(Math.abs(rake - 44.6) < 6,
      `${pane.id}: наклон ${rake.toFixed(1)}°, ведомость требует 44.6°`);
    // Панель ПЛОСКАЯ поперёк: она не повторяет дугу сечения.
    const sag = nodes.reduce((worst, node) => Math.max(worst, Math.abs(node.bl)), 0);
    assert.ok(sag > 0.45, `${pane.id}: панель не доходит до угловой стойки (${sag.toFixed(3)})`);
  }
  for (const id of ["windscreen-centre-post", "windscreen-corner-post-left", "windscreen-corner-post-right", "windscreen-sill", "windscreen-brow", "windscreen-reveal"]) {
    assert.ok(find(id), `нет детали фонаря ${id}`);
  }
});

test("прозрачность: аудит с двух концов", () => {
  const transparent = ["glazing", "lamp-glass", "canvas"];
  for (const part of dc3Object.parts) {
    if (transparent.includes(part.material)) {
      assert.ok(part.id.endsWith("-glass"),
        `${part.id}: прозрачный материал не на стеклянной панели`);
    }
    if (part.id.endsWith("-glass")) {
      assert.equal(part.material, "glazing", `${part.id}: стекло не из стекла`);
    }
  }
});

test("контракт движения: у каждой группы есть шарнир, единичная ось и покой", () => {
  const ids = new Set(dc3Object.parts.map((part) => part.id));
  assert.ok(dc3Object.motionGroups.length >= 9, "подвижных групп меньше объявленного");
  for (const group of dc3Object.motionGroups) {
    const length = Math.hypot(...group.axis);
    assert.ok(Math.abs(length - 1) < 1e-6, `${group.id}: ось не единичная (${length})`);
    const [low, high] = group.rangeDegrees;
    assert.ok(high > low, `${group.id}: пустой диапазон`);
    assert.ok(group.restDegrees >= low && group.restDegrees <= high, `${group.id}: покой вне диапазона`);
    assert.ok(group.members.length > 0, `${group.id}: пустая группа`);
    for (const member of group.members) {
      assert.ok(ids.has(member), `${group.id}: нет детали ${member}`);
    }
  }
  const propellers = dc3Object.motionGroups.filter((group) => group.motion === "constant-rotation-only");
  assert.equal(propellers.length, 2, "винтов должно быть два и только они вращаются постоянно");
});

test("ометаемый объём: рулевая поверхность на упоре не режет свою неподвижную часть", () => {
  const rotate = (vertex, pivot, axis, angle) => {
    const [px, py, pz] = pivot;
    const x = vertex[0] - px; const y = vertex[1] - py; const z = vertex[2] - pz;
    const [ax, ay, az] = axis;
    const cos = Math.cos(angle); const sin = Math.sin(angle);
    const dot = ax * x + ay * y + az * z;
    return [
      px + x * cos + (ay * z - az * y) * sin + ax * dot * (1 - cos),
      py + y * cos + (az * x - ax * z) * sin + ay * dot * (1 - cos),
      pz + z * cos + (ax * y - ay * x) * sin + az * dot * (1 - cos),
    ];
  };
  const fixedFor = {
    "aileron-left": "hull-wing-outer-left", "aileron-right": "hull-wing-outer-right",
    "flap-left": "hull-wing-inner-left", "flap-right": "hull-wing-inner-right",
    "elevator-left": "hull-stabiliser-left", "elevator-right": "hull-stabiliser-right",
    rudder: "hull-fin",
  };
  for (const group of dc3Object.motionGroups) {
    const fixedId = fixedFor[group.id];
    if (!fixedId) continue;
    const fixed = find(fixedId);
    assert.ok(fixed, `нет неподвижной части ${fixedId}`);
    const fixedNodes = vertices(fixed);
    const moving = group.members.flatMap((id) => vertices(find(id)));
    let worst = Infinity;
    for (let step = 0; step <= 8; step += 1) {
      const angle = (group.rangeDegrees[0] + (group.rangeDegrees[1] - group.rangeDegrees[0]) * step / 8) * Math.PI / 180;
      for (const vertex of moving) {
        const moved = rotate(vertex, group.pivot, group.axis, angle);
        for (const other of fixedNodes) {
          const distance = Math.hypot(moved[0] - other[0], moved[1] - other[1], moved[2] - other[2]);
          if (distance < worst) worst = distance;
        }
      }
    }
    assert.ok(worst > 0.004, `${group.id}: на развёртке подходит к ${fixedId} на ${worst.toFixed(4)} м`);
  }
});

test("шасси: колёса стоят на земле, а не рядом с ней", () => {
  for (const side of ["left", "right"]) {
    const tyre = find(`gear-tyre-${side}`);
    assert.ok(tyre, `нет покрышки ${side}`);
    const bottom = tyre.from[1] - tyre.radius;
    assert.ok(Math.abs(bottom) < 0.005, `${tyre.id}: низ покрышки на ${bottom.toFixed(4)}, а не на земле`);
  }
  const tail = find("tailwheel-tyre");
  assert.ok(Math.abs(tail.from[1] - tail.radius) < 0.005, "хвостовое колесо не касается земли");
});

test("шасси: в убранном положении колесо остаётся частично снаружи гондолы", () => {
  // Подпись машины. Убрать колесо целиком — значит потерять DC-3.
  const nacelle = find("hull-nacelle-right");
  const nacelleNodes = vertices(nacelle).map(toAircraft);
  const group = dc3Object.motionGroups.find((item) => item.id === "main-gear-right");
  const tyre = find("gear-tyre-right");
  const angle = group.rangeDegrees[1] * Math.PI / 180;
  const rotate = (vertex) => {
    const [px, py, pz] = group.pivot;
    const x = vertex[0] - px; const y = vertex[1] - py; const z = vertex[2] - pz;
    const [ax, ay, az] = group.axis;
    const cos = Math.cos(angle); const sin = Math.sin(angle);
    const dot = ax * x + ay * y + az * z;
    return [
      px + x * cos + (ay * z - az * y) * sin + ax * dot * (1 - cos),
      py + y * cos + (az * x - ax * z) * sin + ay * dot * (1 - cos),
      pz + z * cos + (ax * y - ay * x) * sin + az * dot * (1 - cos),
    ];
  };
  const centre = rotate(tyre.from).map((value, index) => (value + rotate(tyre.to)[index]) / 2);
  const folded = toAircraft(centre);
  const bandBottom = Math.min(...nacelleNodes
    .filter((node) => Math.abs(node.fs - folded.fs) < 0.6)
    .map((node) => node.wl));
  const wheelBottom = folded.wl - tyre.radius;
  assert.ok(wheelBottom < bandBottom,
    `убранное колесо спряталось целиком: низ ${wheelBottom.toFixed(3)} против гондолы ${bandBottom.toFixed(3)}`);
  assert.ok(wheelBottom > bandBottom - 0.55,
    `убранное колесо торчит слишком далеко (${(bandBottom - wheelBottom).toFixed(3)} м)`);
});

test("винт: диск не режет фюзеляж и не достаёт до земли", () => {
  const blades = withPrefix("prop-blade-right-");
  assert.equal(blades.length, 3, "лопастей должно быть три");
  // Радиус меряется от ОСИ винта в её плоскости, а не по размаху: три лопасти
  // стоят под 120°, и крайняя точка по `bl` — это не конец лопасти.
  const hubBl = 2.98;
  const hubWl = -0.75;
  const radial = blades.flatMap((part) => vertices(part).map(toAircraft))
    .map((node) => Math.hypot(node.bl - hubBl, node.wl - hubWl));
  const tip = hubBl + Math.max(...radial);
  const inner = blades.flatMap((part) => vertices(part).map(toAircraft))
    .reduce((best, node) => Math.min(best, Math.abs(node.bl)), Infinity);
  const fuselage = dc3Object.parts.filter((part) => part.group === "hull-fuselage")
    .flatMap((part) => vertices(part).map(toAircraft))
    .filter((node) => Math.abs(node.fs - 2.90) < 0.6);
  const fuselageHalf = Math.max(...fuselage.map((node) => Math.abs(node.bl)));
  assert.ok(inner > fuselageHalf + 0.05,
    `диск винта подходит к борту на ${(inner - fuselageHalf).toFixed(3)} м`);
  const diameter = (tip - 2.98) * 2;
  assert.ok(Math.abs(diameter - 3.505) < 0.12, `диаметр винта ${diameter.toFixed(3)} против напечатанных 3.505`);
  const lowest = Math.min(...blades.flatMap((part) => vertices(part).map((vertex) => vertex[1])));
  assert.ok(lowest > 0.55, `лопасть подходит к земле на ${lowest.toFixed(3)} м`);
});

test("двигатель: цилиндры внутри канала капота, а не в его стенке", () => {
  for (const side of ["left", "right"]) {
    const bl = side === "left" ? -2.98 : 2.98;
    const cylinders = withPrefix(`engine-cylinder-${side}-`);
    assert.equal(cylinders.length, 7, `цилиндров переднего ряда ${cylinders.length}`);
    const reach = Math.max(...cylinders.flatMap((part) => [part.from, part.to])
      .map((node) => {
        const local = toAircraft(node);
        return Math.hypot(local.bl - bl, local.wl - (-0.75));
      }));
    assert.ok(reach < 0.63, `цилиндры выходят на ${reach.toFixed(3)} — они в стенке капота`);
  }
});

test("камеры: каждый разрез по-прежнему имеет внешнего близнеца и один хэш", () => {
  for (const view of dc3Object.views) {
    if (!view.hiddenGroups?.length) continue;
    const twin = dc3Object.views.find((other) =>
      other.id !== view.id && !other.hiddenGroups?.length
      && other.position.every((value, index) => value === view.position[index])
      && other.target.every((value, index) => value === view.target[index])
      && other.fov === view.fov && other.projection === view.projection);
    assert.ok(twin, `у разреза ${view.id} нет внешнего близнеца`);
  }
  const groups = new Set(dc3Object.parts.map((part) => part.group));
  for (const view of dc3Object.views) {
    for (const hidden of view.hiddenGroups ?? []) {
      assert.ok(groups.has(hidden), `камера ${view.id} прячет несуществующую группу ${hidden}`);
    }
  }
});

test("диагностика не протекла в каноническую геометрию", () => {
  for (const part of dc3Object.parts) {
    assert.ok(!("opacity" in part), `${part.id}: в детали лежит диагностическая прозрачность`);
    assert.notEqual(part.material, "dark-recess", `${part.id}: тёмная ниша вместо настоящего проёма`);
    assert.notEqual(part.material, "opening", `${part.id}: «отверстие» нарисовано материалом`);
  }
});
