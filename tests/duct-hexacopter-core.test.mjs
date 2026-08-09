// Проверки стального ядра HX-D. Всё восстанавливается ИЗ ВЫПУЩЕННЫХ деталей:
// ни один тест не зовёт авторские помощники модели, иначе он проверял бы, что
// помощник равен самому себе.
import test from "node:test";
import assert from "node:assert/strict";

import {
  ductHexacopterObject,
  ductHexacopterCoreParts,
  ductHexacopterPartBounds,
  ductHexacopterHalfWidthAt,
  DUCT_HEX_LIFT_STATIONS,
  DUCT_HEX_YAW_STATIONS,
  DUCT_HEX_PART_BUDGET,
  DUCT_HEX_LIFT_RING_OUTER,
  DUCT_HEX_SECTIONS,
  DUCT_HEX_LIFT_THROAT,
  DUCT_HEX_BAND_FRAME_Z,
  DUCT_HEX_BAND_FRAME_WIDTH,
  DUCT_HEX_HULL_CONTOUR,
  DUCT_HEX_CABIN,
  canopyCrownAt,
  canopySillAt,
  dorsalCrestAt,
  deckTopAt,
  bellyAt,
  DUCT_HEX_TRANSITION_Z,
  DUCT_HEX_HUMP_CROWN_Y,
  DUCT_HEX_CUT_SHOULDER,
  DUCT_HEX_LANDING_STATIONS,
  DUCT_HEX_GEAR_RETRACTION,
  DUCT_HEX_YAW_TIP,
  DUCT_HEX_LIFT_TIP,
} from "../games/make-a-mess/src/content/objects/vehicles/ductHexacopterObject.ts";

const parts = ductHexacopterObject.parts;
const byId = (id) => parts.find((part) => part.id === id);
const withPrefix = (prefix) => parts.filter((part) => part.id.startsWith(prefix));
const bounds = (part) => ductHexacopterPartBounds(part);
const overlap = (a, b, axis) =>
  Math.min(a.max[axis], b.max[axis]) - Math.max(a.min[axis], b.min[axis]);

test("инвентарь: бюджет, уникальные id, невырожденная геометрия", () => {
  assert.ok(parts.length <= DUCT_HEX_PART_BUDGET, `деталей ${parts.length}`);
  assert.equal(new Set(parts.map((part) => part.id)).size, parts.length);
  // Каждая деталь обязана лежать в известной семье: ядро, обшивка, тракт,
  // ротор, шасси или вооружение. Безымянная группа — это деталь, о которой ни
  // один тест ничего не знает.
  const families = ["core-", "hull-", "duct-flow", "rotor-", "landing-gear", "weapons",
    "canopy-glazing", "interior"];
  for (const part of parts) {
    assert.ok(families.some((family) => part.group.startsWith(family)),
      `${part.id}: группа ${part.group} не принадлежит ни одной семье`);
  }
  assert.ok(ductHexacopterCoreParts.length > 380, "ядро потеряло детали");
  for (const part of parts) {
    if (part.kind !== "mesh") continue;
    for (const vertex of part.vertices) {
      assert.ok(vertex.every(Number.isFinite), `нечисловая вершина в ${part.id}`);
    }
    for (const [a, b, c] of part.triangles) {
      const [pa, pb, pc] = [part.vertices[a], part.vertices[b], part.vertices[c]];
      const ux = pb[0] - pa[0], uy = pb[1] - pa[1], uz = pb[2] - pa[2];
      const vx = pc[0] - pa[0], vy = pc[1] - pa[1], vz = pc[2] - pa[2];
      const area = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
      assert.ok(area > 1e-9, `вырожденный треугольник в ${part.id}`);
    }
  }
});

test("топология 6+2: шесть кольцевых ячеек и два продольных тоннеля", () => {
  assert.equal(DUCT_HEX_LIFT_STATIONS.length, 6);
  assert.equal(DUCT_HEX_YAW_STATIONS.length, 2);
  for (const station of DUCT_HEX_LIFT_STATIONS) {
    assert.equal(withPrefix(`core-duct-${station.id}-ring-plate-`).length, 12);
    assert.equal(withPrefix(`core-duct-${station.id}-ring-splice-`).length, 12);
    assert.ok(withPrefix(`core-duct-${station.id}-root-web-`).length >= 8,
      `у ${station.id} слишком мало корневых стенок`);
  }
  for (const station of DUCT_HEX_YAW_STATIONS) {
    assert.equal(withPrefix(`core-yaw-${station.id}-shell-plate-`).length, 10);
  }
  const spins = DUCT_HEX_LIFT_STATIONS.map((station) => station.spin);
  assert.equal(spins.filter((spin) => spin === "cw").length, 3, "знаки вращения не уравновешены");
});

test("кольца: восстановленный радиус и толщина стенки совпадают у всех шести", () => {
  for (const station of DUCT_HEX_LIFT_STATIONS) {
    for (const plate of withPrefix(`core-duct-${station.id}-ring-plate-`)) {
      const radii = plate.vertices.map((vertex) =>
        Math.hypot(vertex[0] - station.x, vertex[2] - station.z));
      const outer = Math.max(...radii);
      const inner = Math.min(...radii);
      assert.ok(Math.abs(outer - DUCT_HEX_LIFT_RING_OUTER) < 0.02,
        `${plate.id}: наружный радиус ${outer.toFixed(3)}`);
      assert.ok(inner >= DUCT_HEX_LIFT_THROAT - 0.02,
        `${plate.id}: стенка залезла в горловину (${inner.toFixed(3)})`);
    }
  }
});

test("зазор между рядами и есть место шпангоута", () => {
  const front = DUCT_HEX_LIFT_STATIONS.find((station) => station.id === "front-right");
  const middle = DUCT_HEX_LIFT_STATIONS.find((station) => station.id === "middle-right");
  const centreDistance = Math.hypot(front.x - middle.x, front.z - middle.z);
  const band = centreDistance - 2 * DUCT_HEX_LIFT_RING_OUTER;
  assert.ok(band > DUCT_HEX_BAND_FRAME_WIDTH,
    `полоса ${band.toFixed(3)} уже шпангоута ${DUCT_HEX_BAND_FRAME_WIDTH}`);

  // Свободная полоса по ПОСТОЯННОМУ z — это то, чем на самом деле пользуется
  // сквозной шпангоут: между задней кромкой среднего кольца и передней кромкой
  // переднего. Восстанавливаем её из станций, а не из константы.
  const bandFrom = Math.abs(middle.z) + DUCT_HEX_LIFT_RING_OUTER;
  const bandTo = front.z - DUCT_HEX_LIFT_RING_OUTER;
  assert.ok(bandTo - bandFrom >= DUCT_HEX_BAND_FRAME_WIDTH,
    `полоса по z ${(bandTo - bandFrom).toFixed(3)}`);

  for (const id of ["frame-front-band-starboard-upper-cap", "frame-rear-band-port-lower-cap"]) {
    const frame = byId(id);
    assert.ok(frame, `нет шпангоута ${id}`);
    const box = bounds(frame);
    const centreZ = (box.min[2] + box.max[2]) / 2;
    assert.ok(Math.abs(Math.abs(centreZ) - DUCT_HEX_BAND_FRAME_Z) < 0.02, `${id}: z ${centreZ}`);
    // Полоса зеркальна: у кормового шпангоута она лежит на отрицательных z.
    const near = Math.min(Math.abs(box.min[2]), Math.abs(box.max[2]));
    const far = Math.max(Math.abs(box.min[2]), Math.abs(box.max[2]));
    assert.ok(near > bandFrom - 0.02 && far < bandTo + 0.02,
      `${id} вышел из свободной полосы: ${near.toFixed(3)}..${far.toFixed(3)}`);
    const span = box.max[0] - box.min[0];
    assert.ok(span > 3.2, `${id}: полураспор ${span.toFixed(2)} — это обрубок, а не шпангоут`);
  }
});

test("шпангоут доходит до борта, а борт — до обвода", () => {
  for (const z of [DUCT_HEX_BAND_FRAME_Z, -DUCT_HEX_BAND_FRAME_Z]) {
    const half = ductHexacopterHalfWidthAt(z);
    const contourHalf = Math.max(...DUCT_HEX_HULL_CONTOUR.map((p) => p.x));
    assert.ok(half > 3.2 && half <= contourHalf + 1e-9, `полуширина на z=${z}: ${half}`);
  }
  const rail = byId("outer-rail-starboard");
  const railBounds = bounds(rail);
  assert.ok(railBounds.max[0] > 3.3, "борт не доходит до широкого места");
  assert.ok(railBounds.max[2] > 3.6 && railBounds.min[2] < -3.0, "борт не идёт от носа до транца");
});

test("шесть колодцев реально пусты, и кабина — тоже дыра, а не тёмная грань", () => {
  const upperFlange = parts.filter((part) => part.group === "core-deck-upper");
  const lowerFlange = parts.filter((part) => part.group === "core-deck-lower");
  assert.ok(upperFlange.length >= 8 && lowerFlange.length >= 8, "палуба не разбита на отсеки");

  for (const station of DUCT_HEX_LIFT_STATIONS) {
    for (const flange of [...upperFlange, ...lowerFlange]) {
      const inside = flange.vertices.filter((vertex) =>
        Math.hypot(vertex[0] - station.x, vertex[2] - station.z) < DUCT_HEX_LIFT_THROAT);
      assert.equal(inside.length, 0, `${flange.id} лезет в колодец ${station.id}`);
    }
  }

  for (const flange of upperFlange) {
    const inside = flange.vertices.filter((vertex) =>
      Math.abs(vertex[0]) < DUCT_HEX_CABIN.halfWidth - 0.2
      && vertex[2] > DUCT_HEX_CABIN.rearZ + 0.2
      && vertex[2] < DUCT_HEX_CABIN.frontZ - 0.2);
    assert.equal(inside.length, 0, `${flange.id} закрывает кабину`);
  }
});

// Вердикт владельца 08.08.2026: «нет агрессивного наката, это торт». Плоские
// полки и есть торт, поэтому линза сечения ПРОВЕРЯЕТСЯ, а не декларируется.
//
// Мерить приходится зондом по треугольникам: в середине плиты вершин нет —
// обшивка триангулирована от контура и колодцев, — и выборка «вершины рядом с
// осью» возвращала пустоту. Зонд снимает высоту самой поверхности, а не
// ближайшей точки, которую кто-то удосужился поставить.
const probeSurface = (list, x, z, prefer) => {
  let best = null;
  for (const part of list) {
    if (part.kind !== "mesh") continue;
    for (const [ia, ib, ic] of part.triangles) {
      const a = part.vertices[ia];
      const b = part.vertices[ib];
      const c = part.vertices[ic];
      const denominator = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
      if (Math.abs(denominator) < 1e-12) continue;
      const u = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / denominator;
      const v = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / denominator;
      const w = 1 - u - v;
      if (u < -1e-9 || v < -1e-9 || w < -1e-9) continue;
      const y = u * a[1] + v * b[1] + w * c[1];
      best = best === null ? y : prefer(best, y);
    }
  }
  assert.ok(best !== null, `зонд не нашёл поверхность в (${x}, ${z})`);
  return best;
};

test("корпус — линза, а не плита: по оси толще, к скуле тоньше", () => {
  const upper = parts.filter((part) => part.group === "core-deck-upper");
  const lower = parts.filter((part) => part.group === "core-deck-lower");
  const top = (x, z) => probeSurface(upper, x, z, Math.max);
  const bottom = (x, z) => probeSurface(lower, x, z, Math.min);

  const axisDepth = top(0, 0) - bottom(0, 0);
  const chineDepth = top(3.54, 0) - bottom(3.54, 0);
  assert.ok(axisDepth > chineDepth + 0.35,
    `сечение почти постоянное: ось ${axisDepth.toFixed(2)}, скула ${chineDepth.toFixed(2)}`);

  assert.ok(top(0, 0) - top(0, 3.8) > 0.4,
    `гребень не ныряет к носу: ${top(0, 0).toFixed(2)} против ${top(0, 3.8).toFixed(2)}`);
  assert.ok(bottom(3.54, 0) - bottom(0, 0) > 0.1,
    `днище не поднимается к скуле: ${bottom(0, 0).toFixed(2)} против ${bottom(3.54, 0).toFixed(2)}`);
  assert.ok(top(0, 0) - top(3.54, 0) > 0.15, "палуба не заваливается к борту");

  // Никакая полка не имеет постоянной высоты: это и есть запрет на трафарет.
  const tops = upper.flatMap((part) => part.vertices.map((vertex) => vertex[1]));
  assert.ok(Math.max(...tops) - Math.min(...tops) > 0.5, "верхняя полка плоская");

  // Паспорт даёт высоту ПОВЕРХНОСТИ, зонд — высоту выпущенной панели, а панель
  // между шпангоутами есть хорда, а не дуга. Допуск равен этой хорде и стоит
  // здесь именно затем, чтобы её рост не прошёл молча.
  assert.ok(Math.abs(axisDepth - DUCT_HEX_SECTIONS.waistDepth) < 0.1,
    `панель ушла от поверхности: ${axisDepth.toFixed(3)} против ${DUCT_HEX_SECTIONS.waistDepth}`);
});

test("силовой путь: кольцо → корневые стенки → полки палубы", () => {
  const upperFlange = parts.filter((part) => part.group === "core-deck-upper");
  for (const station of DUCT_HEX_LIFT_STATIONS) {
    const webs = withPrefix(`core-duct-${station.id}-root-web-upper-`);
    assert.ok(webs.length >= 4, `${station.id}: верхних корневых стенок ${webs.length}`);
    // Высоту полки берём из ВЫПУЩЕННЫХ вершин рядом с этим кольцом: палуба
    // теперь лофт, и постоянного числа у неё больше нет.
    const nearby = upperFlange.flatMap((part) => part.vertices.filter((vertex) =>
      Math.hypot(vertex[0] - station.x, vertex[2] - station.z) < 1.4));
    assert.ok(nearby.length > 0, `${station.id}: рядом нет палубы`);
    const flangeInterval = {
      min: [0, Math.min(...nearby.map((vertex) => vertex[1])), 0],
      max: [0, Math.max(...nearby.map((vertex) => vertex[1])), 0],
    };
    for (const web of webs) {
      const box = bounds(web);
      assert.ok(overlap(box, flangeInterval, 1) > 0.0, `${web.id} не достаёт до верхней полки`);
      const reach = Math.max(
        ...web.vertices.map((v) => Math.hypot(v[0] - station.x, v[2] - station.z)),
      );
      assert.ok(reach > DUCT_HEX_LIFT_RING_OUTER + 0.08,
        `${web.id} обрывается на стенке кольца, ничего не связывая`);
    }
  }
});

test("шасси: цапфы стоят на борту, а не на стенке канала", () => {
  const trunnions = withPrefix("gear-trunnion-").filter((part) => part.kind !== "cylinder");
  assert.equal(trunnions.length, 4, "цапф должно быть ровно четыре");
  const rails = [byId("outer-rail-port"), byId("outer-rail-starboard")].map(bounds);
  for (const trunnion of trunnions) {
    const box = bounds(trunnion);
    const onRail = rails.some((rail) =>
      overlap(box, rail, 0) > 0 && overlap(box, rail, 1) > 0 && overlap(box, rail, 2) > 0);
    assert.ok(onRail, `${trunnion.id} висит мимо борта`);
    for (const station of DUCT_HEX_LIFT_STATIONS) {
      const distance = Math.hypot(
        (box.min[0] + box.max[0]) / 2 - station.x,
        (box.min[2] + box.max[2]) / 2 - station.z,
      );
      assert.ok(distance > DUCT_HEX_LIFT_THROAT, `${trunnion.id} сидит в канале ${station.id}`);
    }
  }
});

test("кабина: чистая ширина плеч и настоящий пол под пилотом", () => {
  const floor = byId("cabin-tub-floor");
  assert.ok(floor, "нет пола ванны");
  const floorBounds = bounds(floor);
  assert.ok(floorBounds.max[0] - floorBounds.min[0] >= 1.0, "плечи уже метра");
  assert.ok(Math.abs(floorBounds.max[1] - DUCT_HEX_CABIN.floorY) < 0.01, "пол не на своей отметке");
  const cans = withPrefix("cabin-crush-can-");
  assert.equal(cans.length, 6, "энергопоглощающий подпол — не декларация, а шесть банок");
  for (const can of cans) {
    const box = bounds(can);
    assert.ok(box.max[1] <= DUCT_HEX_CABIN.floorY + 0.01, `${can.id} лезет в кабину`);
    assert.ok(box.min[1] <= 0.8, `${can.id} не достаёт до нижней полки`);
  }
});

// Вторая претензия владельца 08.08.2026: силовые конструкции кабины не
// соответствовали её конечной форме. Теперь форма фонаря — контрольные линии в
// ядре, и каждый пояс обязан лежать на них.
test("ячейка описывает тот фонарь, который потом остеклят", () => {
  const bows = ["windscreen", "peak", "rear-cut"].map((id) => byId(`cabin-bow-${id}`));
  assert.ok(bows.every(Boolean), "не хватает дуг фонаря");

  for (const [id, z] of [["windscreen", 2.98], ["peak", 2.1]]) {
    const bow = byId(`cabin-bow-${id}`);
    const box = bounds(bow);
    const crown = canopyCrownAt(z);
    assert.ok(Math.abs(box.max[1] - crown) < 0.09,
      `${id}: верх дуги ${box.max[1].toFixed(2)} против гребня фонаря ${crown.toFixed(2)}`);
    assert.ok(Math.abs(box.max[0] - DUCT_HEX_CABIN.halfWidth) < 0.12, `${id}: дуга шире проёма`);
    const post = byId(`cabin-bow-post-${id}-starboard`);
    assert.ok(post, `${id}: дуга не опирается на стойку`);
    assert.ok(bounds(post).min[1] <= DUCT_HEX_CABIN.floorY + 0.01,
      `${id}: стойка не доходит до ванны`);
  }

  assert.ok(canopyCrownAt(2.1) > canopyCrownAt(2.98) + 0.4, "фонарь не поднимается от лобовой дуги");

  // Комингс лежит НА палубе: это и есть «фонарь — часть носовой поверхности».
  for (const suffix of ["port", "starboard"]) {
    const sill = byId(`cabin-sill-${suffix}`);
    assert.ok(sill, `нет комингса ${suffix}`);
    const box = bounds(sill);
    const side = suffix === "port" ? -1 : 1;
    const deckFront = canopySillAt(side * DUCT_HEX_CABIN.halfWidth, DUCT_HEX_CABIN.frontZ);
    const deckRear = canopySillAt(side * DUCT_HEX_CABIN.halfWidth, DUCT_HEX_CABIN.rearZ);
    assert.ok(deckRear - deckFront > 0.15, "палуба под комингсом не заваливается к носу");
    // Комингс проверяем В КАЖДОЙ его точке: он теперь уходит в носовой клин, где
    // палуба ниже, и один общий габарит про это ничего не скажет.
    for (const vertex of sill.vertices) {
      const deck = deckTopAt(vertex[0], vertex[2]);
      assert.ok(Math.abs(vertex[1] - deck) < 0.22,
        `${suffix}: комингс оторвался от палубы на z=${vertex[2].toFixed(2)} (${vertex[1].toFixed(2)} против ${deck.toFixed(2)})`);
    }
  }
});

// Вердикт владельца 08.08.2026, третий заход: кабина должна кончаться
// диагональным срезом, корпус — идти дальше тем же гребнем без ската, между
// тоннелями к корме нужен прогиб, а переход обязан лечь НА гребни и оставить
// место заборникам.
test("борт корпуса зашит: между полками палубы не видно насквозь", () => {
  const band = parts.filter((part) => part.group === "hull-side");
  assert.ok(band.length >= 30, `скуловой пояс всего из ${band.length} панелей`);
  // Пояс обязан перекрывать ВЕСЬ просвет между полками в любой точке обвода.
  for (const z of [2.4, 1.0, 0, -1.5, -2.8]) {
    const x = ductHexacopterHalfWidthAt(z) - 0.05;
    const covering = band.filter((part) => {
      const box = bounds(part);
      return box.min[2] - 0.05 <= z && box.max[2] + 0.05 >= z
        && box.max[0] > x - 0.35 && box.min[0] < x + 0.35;
    });
    assert.ok(covering.length > 0, `борт открыт на z=${z}`);
    const top = Math.max(...covering.map((part) => bounds(part).max[1]));
    const bottom = Math.min(...covering.map((part) => bounds(part).min[1]));
    assert.ok(top >= deckTopAt(x, z) - 0.05, `борт не доходит до палубы на z=${z}`);
    assert.ok(bottom <= bellyAt(x, z) + 0.05, `борт не доходит до днища на z=${z}`);
  }
});

test("нос кабины — клин в рифму с обводами, а не поперечный срез", () => {
  for (const suffix of ["port", "starboard"]) {
    const rib = byId(`cabin-nose-rib-${suffix}`);
    assert.ok(rib, `нет носового ребра кабины ${suffix}`);
    const box = bounds(rib);
    assert.ok(box.max[2] > 3.35, `${suffix}: ребро не доходит до носа кабины`);
    assert.ok(Math.min(Math.abs(box.min[0]), Math.abs(box.max[0])) < 0.16,
      `${suffix}: рёбра не сходятся к точке`);
  }
  // Проём в палубе сужается к носу: сверху кабина обязана читаться клином.
  const nose = byId("cabin-tub-floor");
  assert.ok(bounds(nose).max[2] > 3.3, "ванна не продлена под носовой клин");
});

test("срез кабины диагональный, а не по нормали к корпусу", () => {
  const cut = byId("cabin-bow-rear-cut");
  assert.ok(cut, "нет рамки среза");
  const low = cut.vertices.filter((v) => v[1] < 1.65);
  const high = cut.vertices.filter((v) => v[1] > 2.0);
  assert.ok(low.length > 0 && high.length > 0, "рамка среза не охватывает высоту фонаря");
  const zLow = low.reduce((sum, v) => sum + v[2], 0) / low.length;
  const zHigh = high.reduce((sum, v) => sum + v[2], 0) / high.length;
  assert.ok(zLow - zHigh > 0.45,
    `срез почти вертикальный: низ z=${zLow.toFixed(2)}, верх z=${zHigh.toFixed(2)}`);
  const rakeDegrees = Math.atan2(zLow - zHigh, 2.12 - 1.5) * 180 / Math.PI;
  assert.ok(rakeDegrees > 30 && rakeDegrees < 60, `завал среза ${rakeDegrees.toFixed(0)}°`);
});

test("корпус продолжается гребнем до хвоста, с прогибом между тоннелями", () => {
  // Ската к корпусу нет: сразу за срезом гребень стоит на высоте фонаря.
  assert.ok(Math.abs(dorsalCrestAt(1.15) - canopyCrownAt(1.15)) < 0.02,
    "гребень не подхватывает фонарь на срезе");
  assert.ok(dorsalCrestAt(0) > canopyCrownAt(2.1) - 0.12,
    "за кабиной корпус проваливается — это тот самый скат");

  // Прогиб: к корме ось уходит ниже верхушек тоннелей, но не обрывается.
  const tunnelTop = DUCT_HEX_YAW_STATIONS[1].y + 0.4;
  assert.ok(dorsalCrestAt(-2) < tunnelTop - 0.05, "между тоннелями нет прогиба");
  assert.ok(dorsalCrestAt(-2) > 1.85, "прогиб превратился в провал");
  assert.ok(dorsalCrestAt(0.2) > dorsalCrestAt(-1.8), "гребень не снижается к хвосту");

  const crest = byId("spine-crest");
  assert.ok(crest, "нет гребневого пояса");
  const box = bounds(crest);
  assert.ok(box.max[2] > 1.0 && box.min[2] < -3.0, "гребень не доходит от среза до хвоста");

  // Переход лежит НА гребнях: каждая поперечная рама достаёт до обоих тоннелей.
  for (const id of ["front", "middle", "rear"]) {
    const overlay = byId(`crest-overlay-${id}`);
    assert.ok(overlay, `нет накладной рамы ${id}`);
    const overlayBounds = bounds(overlay);
    assert.ok(overlayBounds.min[0] < -1.4 && overlayBounds.max[0] > 1.4,
      `${id}: рама не дотягивается до тоннелей`);
    assert.ok(overlayBounds.max[1] > tunnelTop, `${id}: рама проходит под тоннелями, а не над ними`);
  }
});

test("каналы утоплены в палубу, а не воткнуты в неё", () => {
  // Пока ложбин не было, оболочки тоннелей и полка палубы делили один объём —
  // два тела в одном месте, которое никакая броня не сделала бы честным.
  const deck = parts.filter((part) => part.group.startsWith("core-deck"));
  for (const station of DUCT_HEX_YAW_STATIONS) {
    for (const part of deck) {
      const inside = part.vertices.filter((vertex) =>
        Math.hypot(vertex[0] - station.x, vertex[1] - station.y) < 0.33
        && vertex[2] < 0.55 && vertex[2] > -3.2);
      assert.equal(inside.length, 0, `${part.id} проходит сквозь тоннель ${station.id}`);
    }
    // Ложбина существует: под каналом палуба ниже, чем в стороне от него.
    const insideTrough = deckTopAt(station.x, -1);
    const besideTrough = deckTopAt(station.x + Math.sign(station.x) * 0.9, -1);
    assert.ok(besideTrough - insideTrough > 0.15,
      `${station.id}: ложбина глубиной всего ${(besideTrough - insideTrough).toFixed(3)} м`);
    // Перед зевом палуба поднимается — это и есть заборник, врезанный в верх.
    assert.ok(deckTopAt(station.x, 0.8) - deckTopAt(station.x, 0.45) > 0.2,
      `${station.id}: палуба не поднимается перед заборником`);
  }
});

// Владелец, 08.08.2026: прямоугольные рамки на входах убрать вовсе; трапецию
// связать с торцом кабины — боковые пояса к комингсам (вторым от центрального),
// центральный к середине верха трапеции; получившееся зашить панелями.
test("на входах нет рамок, но есть связи с торцом кабины", () => {
  assert.equal(parts.filter((part) => part.id.includes("intake-lip")).length, 0,
    "прямоугольная рамка заборника осталась");
  assert.equal(parts.filter((part) => part.id.includes("intake-stay")).length, 0,
    "раскосы рамки остались");

  for (const suffix of ["port", "starboard"]) {
    const side = suffix === "port" ? -1 : 1;
    const spine = byId(`transition-spine-${suffix}`);
    assert.ok(spine, `нет связи ${suffix}`);
    const box = bounds(spine);
    const [shoulderX, shoulderY, shoulderZ] = DUCT_HEX_CUT_SHOULDER;

    // Один конец сидит на ПЛЕЧЕВОМ поясе торца кабины — на ряд выше комингса, —
    // другой на верхнем углу трапеции. Взятый на ряд ниже, он давал спад из
    // канала под кабину вместо тоннеля.
    assert.ok(Math.abs(box.max[2] - shoulderZ) < 0.12, `${suffix}: связь не доходит до торца кабины`);
    assert.ok(Math.abs(box.min[2] - DUCT_HEX_TRANSITION_Z) < 0.12, `${suffix}: связь не доходит до трапеции`);
    assert.ok(Math.abs(box.min[1] - shoulderY) < 0.14, `${suffix}: нижний конец не на плечевом поясе`);
    assert.ok(Math.abs(box.max[1] - DUCT_HEX_HUMP_CROWN_Y) < 0.14, `${suffix}: верхний конец не на трапеции`);
    const outer = Math.max(Math.abs(box.min[0]), Math.abs(box.max[0]));
    const inner = Math.min(Math.abs(box.min[0]), Math.abs(box.max[0]));
    assert.ok(Math.abs(inner - shoulderX) < 0.12,
      `${suffix}: связь взята не от плечевого пояса (${inner.toFixed(2)})`);
    assert.ok(Math.abs(outer - 0.98) < 0.12, `${suffix}: связь не пришла на канал`);
    assert.ok(shoulderY > canopySillAt(side * DUCT_HEX_CABIN.halfWidth, 1.75) + 0.3,
      "плечевой пояс не выше комингса — связь снова взята снизу");
  }
});

test("верх зашит, а воздуховоды вдоль кабины остались открытыми", () => {
  const skin = parts.filter((part) => part.group === "hull-dorsal");
  assert.ok(skin.length >= 40, `обшивки верха всего ${skin.length} панелей`);

  // Над каждым каналом обшивка есть, и она выше самого тоннеля.
  for (const station of DUCT_HEX_YAW_STATIONS) {
    for (const z of [-0.3, -1.8]) {
      const above = skin.filter((part) => part.vertices.some((v) =>
        Math.abs(v[0] - station.x) < 0.2 && Math.abs(v[2] - z) < 0.75
        && v[1] > station.y + 0.35));
      assert.ok(above.length > 0, `канал ${station.id} не закрыт панелью на z=${z}`);
    }
  }

  // Долина между каналами: обшивка по оси ниже, чем над каналами.
  const overHump = Math.max(...skin.flatMap((part) => part.vertices
    .filter((v) => Math.abs(Math.abs(v[0]) - 0.98) < 0.12 && Math.abs(v[2] + 2) < 0.7)
    .map((v) => v[1])));
  const overAxis = Math.max(...skin.flatMap((part) => part.vertices
    .filter((v) => Math.abs(v[0]) < 0.12 && Math.abs(v[2] + 2) < 0.7)
    .map((v) => v[1])));
  assert.ok(overHump - overAxis > 0.08,
    `панели не дают прогиба между каналами: ${overHump.toFixed(2)} против ${overAxis.toFixed(2)}`);

  // Воздуховод: объём вдоль борта кабины между палубой и связью обязан быть пуст,
  // иначе воздуху к зеву не пройти, и вся затея бессмысленна.
  // Воздуховод — это пол (палуба), борт кабины и крыша (связь с панелями). Зонд
  // ставим в слой прямо над палубой: он обязан быть пустым от торца кабины до
  // зева, иначе воздуху не пройти и вся затея бессмысленна.
  for (const side of [-1, 1]) {
    for (const z of [0.65, 0.9]) {
      const x = side * 0.84;
      const floor = deckTopAt(x, z);
      const blocked = parts.filter((part) => part.kind === "mesh" && part.vertices.some((v) =>
        Math.abs(v[0] - x) < 0.14 && Math.abs(v[2] - z) < 0.14
        && v[1] > floor + 0.06 && v[1] < floor + 0.22));
      assert.equal(blocked.length, 0,
        `воздуховод перекрыт на z=${z}: ${blocked.map((part) => part.id).join(", ")}`);
    }
  }

  // Центральный тоннель: под коньком крыши, позади торца кабины, над палубой —
  // сквозной проход. Он существует только потому, что крыша подвешена за
  // плечевые пояса; на ряд ниже здесь был бы скат.
  const axisRoof = parts
    .filter((part) => part.id.includes("transition-roof"))
    .flatMap((part) => part.vertices.filter((v) => Math.abs(v[0]) < 0.25 && v[2] > 0.3 && v[2] < 1.3));
  assert.ok(axisRoof.length > 0, "крыши над осью нет вовсе");
  const tunnelHeight = Math.min(...axisRoof.map((v) => v[1] - deckTopAt(v[0], v[2])));
  assert.ok(tunnelHeight > 0.45, `центральный тоннель высотой всего ${tunnelHeight.toFixed(2)} м`);

  const roofFloorZ = Math.min(...axisRoof.map((v) => v[2]));
  const roofRoofZ = Math.max(...axisRoof.map((v) => v[2]));
  for (const z of [roofFloorZ + 0.1, (roofFloorZ + roofRoofZ) / 2, roofRoofZ - 0.1]) {
    const blocked = parts.filter((part) => part.kind === "mesh"
      && !part.id.startsWith("cabin-") && !part.group.startsWith("core-deck")
      && !part.id.includes("crest") && !part.id.includes("spine")
      && part.vertices.some((v) => Math.abs(v[0]) < 0.16 && Math.abs(v[2] - z) < 0.12
        && v[1] > deckTopAt(0, z) + 0.06 && v[1] < deckTopAt(0, z) + 0.42));
    assert.equal(blocked.length, 0,
      `центральный тоннель перекрыт на z=${z.toFixed(2)}: ${blocked.map((part) => part.id).join(", ")}`);
  }

  // Воздуховод меряем по НИЗУ выпущенной крыши против палубы под той же точкой.
  // Раньше эта крыша упиралась в комингс, и её передний край имел нулевую
  // высоту — воздуху было неоткуда взяться. Теперь у входа есть просвет.
  const roof = parts.filter((part) => part.id === "hull-transition-roof-starboard");
  assert.equal(roof.length, 1, "зона перехода зашита не одним многоугольником на борт");
  const clearanceIn = (fromZ, toZ, fromX, toX) => {
    const near = roof.flatMap((part) => part.vertices.filter((v) =>
      v[2] > fromZ && v[2] < toZ && v[0] > fromX && v[0] < toX));
    assert.ok(near.length > 0, `крыша перехода не найдена в z=${fromZ}..${toZ}, x=${fromX}..${toX}`);
    return Math.min(...near.map((v) => v[1] - deckTopAt(v[0], v[2])));
  };
  const atMouth = clearanceIn(0.4, 0.7, 0.6, 1.1);
  const atFrontFace = clearanceIn(1.1, 1.45, 0.25, 0.7);
  assert.ok(atMouth > 0.6, `у зева всего ${atMouth.toFixed(2)} м высоты`);
  assert.ok(atFrontFace > 0.3, `передний вход воздуховода почти закрыт: ${atFrontFace.toFixed(2)} м`);
  assert.ok(atMouth > atFrontFace + 0.2, "воздуховод не раскрывается к зеву");
});

test("в кабине нет посторонних конструкций, а над головой есть место", () => {
  // Объём пилота: плечи, голова и заголовник. Шпангоут, прошедший здесь, — это
  // ровно то, что нашёл владелец в прошлой ревизии.
  // Человек не параллелепипед: торс шире и ниже, голова уже и выше. Один общий
  // ящик отвергал бы дугу фонаря, которая проходит над плечом по делу.
  const occupied = [
    { name: "торс", minX: -0.34, maxX: 0.34, minY: DUCT_HEX_CABIN.floorY + 0.12, maxY: 1.76, minZ: 1.6, maxZ: 2.6 },
    { name: "голова", minX: -0.22, maxX: 0.22, minY: 1.76, maxY: 2.0, minZ: 1.9, maxZ: 2.5 },
  ];
  const allowed = new Set(["cabin-seat-rail-port", "cabin-seat-rail-starboard"]);
  for (const part of parts) {
    if (allowed.has(part.id)) continue;
    if (part.kind !== "mesh") continue;
    for (const zone of occupied) {
      const trespass = part.vertices.filter((vertex) =>
        vertex[0] > zone.minX && vertex[0] < zone.maxX
        && vertex[1] > zone.minY && vertex[1] < zone.maxY
        && vertex[2] > zone.minZ && vertex[2] < zone.maxZ);
      assert.equal(trespass.length, 0, `${part.id} стоит на месте пилота (${zone.name})`);
    }
  }

  // Голова под гребнем: зазор считаем от макушки, а не от глаз.
  // Зазор считаем от макушки, а не от глаз, и требуем шлемного запаса: три
  // сантиметра — это не запас, а совпадение.
  const headTop = DUCT_HEX_CABIN.floorY + 0.14 + 0.9;
  for (const z of [1.9, 2.1, 2.35]) {
    assert.ok(canopyCrownAt(z) - headTop >= 0.08,
      `на z=${z} над макушкой ${(canopyCrownAt(z) - headTop).toFixed(3)} м`);
  }
});

test("контракт движения: восемь групп, оси единичные, тел у роторов нет", () => {
  const groups = ductHexacopterObject.kinematicGroups;
  assert.equal(groups.length, 8);
  assert.equal(groups.filter((group) => group.axis[1] === 1).length, 6, "подъёмные оси не по +Y");
  assert.equal(groups.filter((group) => group.axis[2] === 1).length, 2, "тоннельные оси не по +Z");
  for (const group of groups) {
    assert.ok(Math.abs(Math.hypot(...group.axis) - 1) < 1e-9, `${group.id}: ось не единичная`);
    assert.equal(group.motion, "constant-rotation-only");
    for (const member of group.members) {
      assert.ok(byId(member), `${group.id}: в контракте числится деталь ${member}, которой нет`);
    }
    assert.ok(group.members.length >= 2, `${group.id}: у группы нет вращающихся деталей`);
  }
  assert.equal(groups.filter((group) => group.reversible).length, 2, "реверсивны ровно два");
  for (const group of groups.filter((g) => g.axis[1] === 1)) {
    assert.ok(group.sweptRadius < DUCT_HEX_LIFT_THROAT,
      `${group.id}: ометаемый диск задевает горловину`);
  }
  assert.equal(ductHexacopterObject.motionConstraints.rotorBodiesForbidden, true);
  assert.equal(ductHexacopterObject.motionConstraints.worldPlacementAllowed, false);
});

test("камеры: у каждого разреза есть внешний близнец с той же камерой", () => {
  const views = ductHexacopterObject.views;
  const required = ["front", "left", "rear", "top", "front-three-quarter", "rear-three-quarter",
    "high-three-quarter", "underside", "silhouette-top"];
  for (const id of required) assert.ok(views.some((view) => view.id === id), `нет вида ${id}`);
  for (const cutaway of views.filter((view) => view.id.endsWith("-cutaway"))) {
    const twin = views.find((view) => view.id === cutaway.id.replace("-cutaway", ""));
    assert.ok(twin, `${cutaway.id} без внешней пары`);
    assert.deepEqual(twin.position, cutaway.position, `${cutaway.id}: камера уехала`);
    assert.deepEqual(twin.target, cutaway.target);
    assert.equal(twin.projection, cutaway.projection);
    assert.equal(twin.orthoHeight ?? twin.fov, cutaway.orthoHeight ?? cutaway.fov);
    assert.ok(!twin.hiddenGroups, `${twin.id} обязан показывать всё`);
  }
  // Прозрачность — свойство стекла, а не приём. Аудит: единственные прозрачные
  // детали объекта — панели фонаря, и все они лежат в своей группе.
  for (const part of parts) {
    if (part.material !== "glazing") continue;
    assert.equal(part.group, "canopy-glazing", `${part.id}: стекло вне группы остекления`);
    assert.ok(part.id.startsWith("canopy-pane-"), `${part.id}: стеклом притворяется не панель`);
  }
  for (const part of parts) {
    if (part.group !== "canopy-glazing") continue;
    assert.equal(part.material, "glazing", `${part.id}: в остеклении непрозрачная деталь`);
  }
});

test("ортографии охватывают машину целиком", () => {
  const box = parts.reduce((accumulator, part) => {
    const partBounds = bounds(part);
    return {
      min: [0, 1, 2].map((axis) => Math.min(accumulator.min[axis], partBounds.min[axis])),
      max: [0, 1, 2].map((axis) => Math.max(accumulator.max[axis], partBounds.max[axis])),
    };
  }, { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] });
  const [frameWidth, frameHeight] = ductHexacopterObject.captureFrame;
  const aspect = frameWidth / frameHeight;
  const length = box.max[2] - box.min[2];
  const width = box.max[0] - box.min[0];
  // Требование к ОБЗОРНЫМ ортографиям. Деталь имеет право кадрировать узел —
  // иначе детальная камера превращается в ещё один общий вид.
  const overview = new Set(["front", "left", "rear", "top", "top-cutaway", "silhouette-top"]);
  for (const view of ductHexacopterObject.views) {
    if (view.projection !== "orthographic" || !overview.has(view.id)) continue;
    const visibleWidth = view.orthoHeight * aspect;
    const needed = view.up ? Math.max(width, 0) : Math.abs(view.position[0]) > 1 ? length : width;
    assert.ok(visibleWidth >= needed + 0.2,
      `${view.id}: кадр ${visibleWidth.toFixed(2)} м против ${needed.toFixed(2)} м машины`);
    if (view.up) {
      assert.ok(view.orthoHeight >= length + 0.2, `${view.id}: план не влезает по длине`);
    }
  }
});

test("восемь вентиляторов: диски внутри горловин, защита ниже диска", () => {
  for (const station of DUCT_HEX_LIFT_STATIONS) {
    const blades = byId(`rotor-lift-${station.id}-blades`);
    assert.ok(blades, `${station.id}: нет лопастей`);
    const radii = blades.vertices.map((v) => Math.hypot(v[0] - station.x, v[2] - station.z));
    const tip = Math.max(...radii);
    assert.ok(tip <= DUCT_HEX_LIFT_TIP + 0.02, `${station.id}: законцовка ${tip.toFixed(3)}`);
    assert.ok(DUCT_HEX_LIFT_THROAT - tip > 0.05,
      `${station.id}: зазор до горловины всего ${(DUCT_HEX_LIFT_THROAT - tip).toFixed(3)} м`);

    // Диск — плоский: лопасти не имеют права выходить из своей плоскости.
    const ys = blades.vertices.map((v) => v[1]);
    assert.ok(Math.max(...ys) - Math.min(...ys) < 0.09, `${station.id}: диск не плоский`);
    assert.ok(Math.abs((Math.max(...ys) + Math.min(...ys)) / 2 - station.planeY) < 0.02,
      `${station.id}: диск не на своей отметке`);

    // Защитные лопатки — НИЖЕ ометаемого диска, ни одна не лезет в него.
    const guards = withPrefix(`duct-flow-${station.id}-guard-vane-`);
    assert.equal(guards.length, 6, `${station.id}: защитных лопаток ${guards.length}`);
    for (const guard of guards) {
      assert.ok(bounds(guard).max[1] < Math.min(...ys) - 0.05,
        `${guard.id} входит в ометаемый диск`);
    }

    // Тракт: приёмная губа сверху и расширяющийся диффузор снизу.
    assert.ok(byId(`duct-flow-${station.id}-inlet-lip`), `${station.id}: нет приёмной губы`);
    const diffuser = byId(`duct-flow-${station.id}-diffuser`);
    assert.ok(diffuser, `${station.id}: нет диффузора`);
    const exitRadius = Math.max(...diffuser.vertices
      .filter((v) => v[1] < bellyAt(station.x, station.z) + 0.05)
      .map((v) => Math.hypot(v[0] - station.x, v[2] - station.z)));
    assert.ok(exitRadius > DUCT_HEX_LIFT_THROAT + 0.04,
      `${station.id}: выход не шире горловины — это труба, а не диффузор`);
  }

  for (const station of DUCT_HEX_YAW_STATIONS) {
    const blades = byId(`rotor-yaw-${station.id}-blades`);
    assert.ok(blades, `${station.id}: нет лопастей продольного вентилятора`);
    const radii = blades.vertices.map((v) => Math.hypot(v[0] - station.x, v[1] - station.y));
    assert.ok(Math.max(...radii) <= DUCT_HEX_YAW_TIP + 0.02, `${station.id}: законцовка вышла за контракт`);
    const zs = blades.vertices.map((v) => v[2]);
    assert.ok(Math.max(...zs) - Math.min(...zs) < 0.07, `${station.id}: диск не плоский`);
  }
});

test("шасси: четыре подошвы на грунте, цепь до конструкции, и есть куда убраться", () => {
  assert.equal(DUCT_HEX_LANDING_STATIONS.length, 4);
  const soles = withPrefix("landing-sole-");
  assert.equal(soles.length, 4, "подошв должно быть четыре");
  for (const sole of soles) {
    assert.ok(bounds(sole).min[1] <= 0.005, `${sole.id} не достаёт до грунта`);
  }
  // Ничего, кроме подошв, земли не касается.
  for (const part of parts) {
    if (part.id.startsWith("landing-")) continue;
    assert.ok(bounds(part).min[1] > 0.06, `${part.id} висит на грунте`);
  }

  for (const gear of DUCT_HEX_LANDING_STATIONS) {
    for (const piece of ["trunnion", "main-strut", "drag-link", "knee", "oleo", "pad"]) {
      assert.ok(byId(`landing-${piece}-${gear.id}`), `${gear.id}: нет звена ${piece}`);
    }
    // Цапфа сидит на теле, а не в воздухе: она под днищем в своей точке.
    const trunnion = bounds(byId(`landing-trunnion-${gear.id}`));
    const belly = bellyAt(gear.attach[0], gear.attach[2]);
    assert.ok(trunnion.max[1] > belly - 0.12, `${gear.id}: цапфа оторвалась от днища`);
    // Нога стоит в стороне от каналов: подошва не под срезом канала.
    for (const duct of DUCT_HEX_LIFT_STATIONS) {
      const distance = Math.hypot(gear.pad[0] - duct.x, gear.pad[2] - duct.z);
      assert.ok(distance > DUCT_HEX_LIFT_RING_OUTER + 0.1,
        `${gear.id}: подошва под каналом ${duct.id}`);
    }
  }

  // Убирается — значит есть куда. Складываем ногу по контракту и проверяем, что
  // сложенная она не попадает ни в одно кольцо: нога, убирающаяся в канал, — не
  // убирающаяся нога, а поломка.
  for (const contract of DUCT_HEX_GEAR_RETRACTION) {
    const gear = DUCT_HEX_LANDING_STATIONS.find((station) => station.id === contract.id);
    const angle = (contract.rangeDegrees[1] * Math.PI) / 180;
    // Знак поворота берётся из ОСИ, а не из величины: иначе тест примет позу,
    // достигнутую длинным путём, и не заметит ногу, идущую сквозь грунт.
    const sense = contract.axis[2];
    const rotate = (probe) => {
      const dx = probe[0] - contract.pivot[0];
      const dy = probe[1] - contract.pivot[1];
      const turn = angle * sense;
      return [
        contract.pivot[0] + dx * Math.cos(turn) - dy * Math.sin(turn),
        contract.pivot[1] + dx * Math.sin(turn) + dy * Math.cos(turn),
        probe[2],
      ];
    };
    assert.ok(Math.abs(contract.rangeDegrees[1]) < 180,
      `${gear.id}: складывание длинным путём, ${contract.rangeDegrees[1]} градусов`);
    for (const probe of [gear.knee, gear.axle, gear.pad]) {
      const folded = rotate(probe);
      assert.ok(folded[1] > 0.2, `${gear.id}: сложенная нога всё ещё внизу (${folded[1].toFixed(2)})`);
      for (const duct of DUCT_HEX_LIFT_STATIONS) {
        const distance = Math.hypot(folded[0] - duct.x, folded[2] - duct.z);
        assert.ok(distance > DUCT_HEX_LIFT_THROAT,
          `${gear.id}: сложенная нога заходит в канал ${duct.id}`);
      }
    }
  }
});

test("вооружение по низу: пулемёт на осевой, установки повторяют обводы", () => {
  const gun = byId("gun-cradle");
  assert.ok(gun, "нет люльки пулемёта");
  const gunBounds = bounds(gun);
  assert.ok(Math.abs((gunBounds.min[0] + gunBounds.max[0]) / 2) < 0.05, "пулемёт не на осевой");
  assert.equal(withPrefix("gun-barrel-").length, 3, "стволов должно быть три");
  for (const muzzle of withPrefix("gun-muzzle-")) {
    assert.ok(bounds(muzzle).max[2] > gunBounds.max[2], `${muzzle.id} не выходит за люльку`);
  }

  for (const suffix of ["port", "starboard"]) {
    const bay = byId(`launcher-bay-${suffix}`);
    assert.ok(bay, `нет установки ${suffix}`);
    // Конформность: верх установки ЕСТЬ поверхность днища, а не полка под ней.
    const roof = bay.vertices.filter((v) => v[1] > Math.min(...bay.vertices.map((q) => q[1])) + 0.2);
    assert.ok(roof.length > 0, `${suffix}: у установки нет верха`);
    for (const vertex of roof) {
      assert.ok(Math.abs(vertex[1] - bellyAt(vertex[0], vertex[2])) < 0.06,
        `${suffix}: крыша установки оторвалась от днища на z=${vertex[2].toFixed(2)}`);
    }
    assert.equal(withPrefix(`launcher-tube-${suffix}-`).length, 6, `${suffix}: труб должно быть шесть`);
    assert.ok(byId(`launcher-hardpoint-${suffix}`), `${suffix}: установка не на узле подвески`);
  }
});

test("остекление: настоящие панели в раме, за ними кабина, впереди броня", () => {
  const panes = parts.filter((part) => part.group === "canopy-glazing");
  assert.equal(panes.length, 16, `панелей остекления ${panes.length}`);

  for (const pane of panes) {
    for (const vertex of pane.vertices) {
      // Панель лежит НА поверхности фонаря: между комингсом и гребнем своей
      // станции. Стекло, уехавшее с обвода, — это не окно, а витрина.
      const z = vertex[2];
      const sill = canopySillAt(Math.abs(vertex[0]), z);
      const crown = canopyCrownAt(z);
      assert.ok(vertex[1] > sill - 0.1 && vertex[1] < crown + 0.1,
        `${pane.id}: вершина вне поверхности фонаря на z=${z.toFixed(2)}`);
      assert.ok(z > 1.05 && z < 3.05, `${pane.id}: остекление вышло за фонарь (z=${z.toFixed(2)})`);
    }
  }

  // Впереди лобовой дуги — броня, а не тонированное продолжение стекла.
  const beak = parts.filter((part) => part.id.startsWith("hull-nose-beak"));
  assert.ok(beak.length >= 8, `носовая броня всего из ${beak.length} панелей`);
  for (const part of beak) {
    assert.notEqual(part.material, "glazing", `${part.id}: клюв не может быть стеклянным`);
    assert.ok(Math.min(...part.vertices.map((v) => v[2])) > 2.9, `${part.id}: броня залезла в остекление`);
  }

  // За стеклом есть на что смотреть, и кабина закрыта сзади переборкой.
  const interior = parts.filter((part) => part.group === "interior");
  assert.ok(interior.length >= 5, "за стеклом пусто");
  for (const part of interior) {
    const box = bounds(part);
    assert.ok(box.min[1] > DUCT_HEX_CABIN.floorY - 0.02, `${part.id} провалился под пол`);
    assert.ok(box.max[2] < 3.15 && box.min[2] > 1.1, `${part.id} вылез из кабины`);
  }
  assert.ok(withPrefix("cabin-bulkhead-").length >= 3, "кабина открыта в кормовой проход");
});

test("в ревизии нет того, что ещё не наступило", () => {
  const forbidden = ["route", "prefab"];
  for (const part of parts) {
    for (const token of forbidden) {
      assert.ok(!part.id.includes(token), `${part.id} — деталь из следующих ревизий`);
    }
  }
  assert.equal(ductHexacopterObject.motionConstraints.worldPlacementAllowed, false);
});
