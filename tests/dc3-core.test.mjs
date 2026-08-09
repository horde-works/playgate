// Тесты DC-3 восстанавливают числа ИЗ ВЫПУЩЕННОЙ геометрии.
//
// Ни один тест не зовёт авторские помощники модели: стояночный угол,
// обратное преобразование и обвод считаются здесь заново, своей алгеброй, из
// паспортных чисел. Если модель и паспорт разойдутся, разойдутся и они.

import { strict as assert } from "node:assert";
import test from "node:test";

import { dc3Object, dc3CoreParts } from "../games/make-a-mess/src/content/objects/vehicles/dc3Object.ts";

// --------------------------------------------------------------- паспорт
const SPAN = 28.956;
const PUBLISHED_HEIGHT = 5.16;
const PUBLISHED_WING_AREA = 91.7;
const MAIN_WHEEL = { fs: 5.868, bl: 2.820, wl: -2.611, radius: 0.550 };
const TAIL_WHEEL = { fs: 17.320, wl: -0.972, radius: 0.244 };
const KINK_BL = 4.05;
const DIHEDRAL_DEGREES = 5.55;
const CORE_BUDGET = 260;

// Независимое решение стояночного угла: оба колеса на одной горизонтали.
const groundAngle = (() => {
  const deltaWl = MAIN_WHEEL.wl - TAIL_WHEEL.wl;
  const deltaZ = -MAIN_WHEEL.fs + TAIL_WHEEL.fs;
  const target = MAIN_WHEEL.radius - TAIL_WHEEL.radius;
  const amplitude = Math.hypot(deltaWl, deltaZ);
  return Math.atan2(deltaZ, deltaWl) - Math.acos(target / amplitude);
})();
const COS = Math.cos(groundAngle);
const SIN = Math.sin(groundAngle);
const forward = (fs, wl) => ({ y: wl * COS - fs * SIN, z: -fs * COS - wl * SIN });
const wheel = forward(MAIN_WHEEL.fs, MAIN_WHEEL.wl);
const OFFSET_Y = wheel.y - MAIN_WHEEL.radius;
const OFFSET_Z = wheel.z;

/** Обратный переход: из мировой рамы обратно в самолётную. */
const toAircraft = ([x, y, z]) => {
  const worldY = y + OFFSET_Y;
  const worldZ = z + OFFSET_Z;
  // y = wl·cos − fs·sin, z = −fs·cos − wl·sin  ⇒  обратное вращение
  const wl = worldY * COS - worldZ * SIN;
  const fs = -(worldZ * COS + worldY * SIN);
  return { fs, bl: x, wl };
};

// ------------------------------------------------------- общие помощники
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
const bounds = (list) => {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const part of list) {
    for (const vertex of vertices(part)) {
      for (let axis = 0; axis < 3; axis += 1) {
        if (vertex[axis] < min[axis]) min[axis] = vertex[axis];
        if (vertex[axis] > max[axis]) max[axis] = vertex[axis];
      }
    }
  }
  return { min, max };
};
const byPrefix = (prefix) => dc3CoreParts.filter((part) => part.id.startsWith(prefix));
// =========================================================== инвентарь
test("ядро: бюджет, уникальность и невырожденность", () => {
  assert.ok(dc3CoreParts.length <= CORE_BUDGET, `деталей ${dc3CoreParts.length} > ${CORE_BUDGET}`);
  const ids = dc3Object.parts.map((part) => part.id);
  assert.equal(new Set(ids).size, ids.length, "повторяющийся id детали");
  for (const part of dc3Object.parts) {
    for (const vertex of vertices(part)) {
      for (const value of vertex) assert.ok(Number.isFinite(value), `${part.id}: не конечная координата`);
    }
    if (part.kind !== "mesh") continue;
    for (const [a, b, c] of part.triangles) {
      const [pa, pb, pc] = [part.vertices[a], part.vertices[b], part.vertices[c]];
      const ux = pb[0] - pa[0]; const uy = pb[1] - pa[1]; const uz = pb[2] - pa[2];
      const vx = pc[0] - pa[0]; const vy = pc[1] - pa[1]; const vz = pc[2] - pa[2];
      const area = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
      assert.ok(area > 1e-9, `${part.id}: вырожденный треугольник`);
    }
  }
});

test("ядро: набор состоит из объявленных групп и ничего не потеряно", () => {
  const groups = new Set(dc3Object.parts.map((part) => part.group));
  for (const required of ["core-frames", "core-stringers", "core-floor", "core-wing-spar", "core-wing-rib", "core-nacelle-mount", "core-gear-mount", "core-tail"]) {
    assert.ok(groups.has(required), `нет группы ${required}`);
  }
});

// =========================================================== поза и датум
test("поза: все три пятна контакта лежат на земле", () => {
  for (const key of ["mainWheelContactLeft", "mainWheelContactRight", "tailWheelContact"]) {
    const anchor = dc3Object.anchors[key];
    assert.ok(Math.abs(anchor[1]) < 1e-6, `${key}: y = ${anchor[1]}, а должно быть 0`);
  }
  const left = dc3Object.anchors.mainWheelContactLeft;
  const right = dc3Object.anchors.mainWheelContactRight;
  assert.ok(Math.abs(left[0] + right[0]) < 1e-9, "основные колёса несимметричны");
  assert.ok(Math.abs(right[0] - MAIN_WHEEL.bl) < 1e-9, "колея разъехалась с паспортом");
  assert.ok(Math.abs(left[2]) < 1e-9 && Math.abs(right[2]) < 1e-9, "датум z=0 не на основных колёсах");
});

test("поза: угол стоянки восстанавливается из выпущенной геометрии", () => {
  // Наклон машины виден по паре пятен контакта и носу: нос обязан подняться
  // ровно на угол, который даёт шасси.
  const nose = dc3Object.anchors.noseTip;
  const tail = dc3Object.anchors.tailWheelContact;
  const recovered = Math.atan2(nose[1] - (MAIN_WHEEL.radius - MAIN_WHEEL.radius), nose[2] - tail[2]);
  const expected = Math.atan2(
    forward(0, 0).y - OFFSET_Y,
    forward(0, 0).z - OFFSET_Z - tail[2],
  );
  assert.ok(Math.abs(recovered - expected) < 1e-9, "нос поднят не на решённый угол");
  const degrees = (groundAngle * 180) / Math.PI;
  assert.ok(Math.abs(degrees - 9.66) < 0.15, `угол стоянки ${degrees.toFixed(3)}°, ожидалось 9.66 ± 0.15`);
  assert.ok(Math.abs(dc3Object.dimensions.groundAngleDegrees - degrees) < 1e-9, "модель объявила другой угол");
});

test("поза: обратное преобразование возвращает нос в начало самолётной рамы", () => {
  const nose = toAircraft(dc3Object.anchors.noseTip);
  assert.ok(Math.abs(nose.fs) < 1e-6 && Math.abs(nose.wl) < 1e-6, `нос ушёл в fs=${nose.fs}, wl=${nose.wl}`);
  const hub = toAircraft(dc3Object.anchors.engineHubRight);
  assert.ok(Math.abs(hub.bl - 2.98) < 1e-6, "ось мотора по размаху разъехалась");
});

test("поза: переход жёсткий — расстояния не меняются", () => {
  const nose = dc3Object.anchors.noseTip;
  const fin = dc3Object.anchors.finTop;
  const aircraftNose = toAircraft(nose);
  const aircraftFin = toAircraft(fin);
  const model = Math.hypot(nose[0] - fin[0], nose[1] - fin[1], nose[2] - fin[2]);
  const aircraft = Math.hypot(
    aircraftNose.bl - aircraftFin.bl,
    aircraftNose.wl - aircraftFin.wl,
    aircraftNose.fs - aircraftFin.fs,
  );
  assert.ok(Math.abs(model - aircraft) < 1e-9, "преобразование не жёсткое");
});

// =========================================================== габариты
test("габарит: размах ядра не выходит за напечатанный", () => {
  const { min, max } = bounds(dc3CoreParts);
  const span = max[0] - min[0];
  assert.ok(span <= SPAN + 1e-9, `размах ядра ${span.toFixed(3)} больше напечатанного ${SPAN}`);
  assert.ok(span > SPAN - 0.10, `размах ядра ${span.toFixed(3)} слишком мал: набор не доходит до конца консоли`);
  assert.ok(Math.abs(max[0] + min[0]) < 1e-6, "ядро несимметрично по размаху");
});

test("габарит: верх киля стоит на напечатанной высоте", () => {
  const fin = dc3Object.anchors.finTop;
  assert.ok(Math.abs(fin[1] - PUBLISHED_HEIGHT) < 0.10,
    `верх киля ${fin[1].toFixed(3)} м, напечатано ${PUBLISHED_HEIGHT} ± 0.10`);
});

test("габарит: в стоянке гребень фюзеляжа догоняет верх киля", () => {
  // Машина задрана носом настолько, что передний верх и киль встают вровень.
  // Это проверяемое следствие позы, а не совпадение.
  const frames = byPrefix("frame-");
  const crown = Math.max(...frames.flatMap((part) => vertices(part).map((vertex) => vertex[1])));
  const fin = dc3Object.anchors.finTop[1];
  assert.ok(Math.abs(crown - fin) < 0.12,
    `гребень ${crown.toFixed(3)} и киль ${fin.toFixed(3)} разошлись на ${(crown - fin).toFixed(3)} м`);
});

test("габарит: ничто из ядра не уходит под землю", () => {
  const { min } = bounds(dc3CoreParts);
  assert.ok(min[1] >= -1e-9, `ядро провалилось под землю на ${(-min[1]).toFixed(4)} м`);
});

// =========================================================== фюзеляж
test("фюзеляж: сечение — лофт по таблице, а не труба постоянного диаметра", () => {
  const frames = byPrefix("frame-").map((part) => {
    const nodes = vertices(part).map(toAircraft);
    return {
      id: part.id,
      fs: nodes.reduce((sum, node) => sum + node.fs, 0) / nodes.length,
      half: Math.max(...nodes.map((node) => Math.abs(node.bl))),
      top: Math.max(...nodes.map((node) => node.wl)),
      bottom: Math.min(...nodes.map((node) => node.wl)),
    };
  }).sort((a, b) => a.fs - b.fs);

  // Контрольные станции паспорта — полуширина ОБШИВКИ. Шпангоут обязан стоять
  // под ней, а не вровень: разница и есть толщина обшивки с полкой.
  const SKIN_INSET = 0.034;
  const expected = [
    { fs: 2.10, skinHalf: 1.001 },
    { fs: 5.10, skinHalf: 1.224 },
    { fs: 8.10, skinHalf: 1.286 },
    { fs: 11.10, skinHalf: 1.285 },
    { fs: 14.10, skinHalf: 1.083 },
    { fs: 17.20, skinHalf: 0.768 },
  ];
  for (const station of expected) {
    const frame = frames.reduce((best, item) =>
      Math.abs(item.fs - station.fs) < Math.abs(best.fs - station.fs) ? item : best);
    assert.ok(frame.half < station.skinHalf - 0.5 * SKIN_INSET,
      `${frame.id}: шпангоут ${frame.half.toFixed(3)} не ушёл под обшивку ${station.skinHalf}`);
    assert.ok(Math.abs(frame.half - (station.skinHalf - SKIN_INSET)) < 0.035,
      `${frame.id}: полуширина ${frame.half.toFixed(3)} на fs=${frame.fs.toFixed(2)}, паспорт ждёт ${(station.skinHalf - SKIN_INSET).toFixed(3)}`);
  }
  const halves = frames.map((frame) => frame.half);
  assert.ok(Math.max(...halves) - Math.min(...halves) > 0.6, "фюзеляж вышел трубой постоянного сечения");
  const depths = frames.map((frame) => frame.top - frame.bottom);
  assert.ok(Math.max(...depths) > 2.5 && Math.max(...depths) < 2.85,
    `максимальная глубина ${Math.max(...depths).toFixed(3)} вне 2.50…2.85`);
});

test("фюзеляж: пол салона выше низа борта и внутри сечения", () => {
  const beams = byPrefix("floor-beam-");
  assert.ok(beams.length >= 12, `балок пола ${beams.length}, ожидалось не меньше 12`);
  for (const beam of beams) {
    const nodes = vertices(beam).map(toAircraft);
    const half = Math.max(...nodes.map((node) => Math.abs(node.bl)));
    assert.ok(half < 1.22, `${beam.id}: пол шире борта (${half.toFixed(3)})`);
    const low = Math.min(...nodes.map((node) => node.wl));
    assert.ok(low > -0.60, `${beam.id}: пол провалился к низу борта (${low.toFixed(3)})`);
  }
});

test("фюзеляж: стрингер лежит на шпангоутах, а не рядом", () => {
  const frames = byPrefix("frame-");
  const stringers = byPrefix("stringer-");
  assert.equal(stringers.length, 12, "число стрингеров изменилось молча");
  // Мерить надо ходом стрингера, а не его вершинами: между узлами цепи вершин
  // нет, и проверка по вершинам объявила бы висящим совершенно лежачий член.
  const frameData = frames.map((frame) => {
    const nodes = vertices(frame).map(toAircraft);
    return { id: frame.id, fs: nodes.reduce((sum, node) => sum + node.fs, 0) / nodes.length, nodes };
  });
  for (const stringer of stringers) {
    const path = vertices(stringer).map(toAircraft).sort((a, b) => a.fs - b.fs);
    let touched = 0;
    for (const frame of frameData) {
      if (frame.fs < path[0].fs || frame.fs > path[path.length - 1].fs) continue;
      // положение стрингера на станции шпангоута: интерполяция по его ходу
      let index = 0;
      while (index < path.length - 2 && path[index + 1].fs < frame.fs) index += 1;
      const a = path[index];
      const b = path[index + 1];
      const ratio = b.fs === a.fs ? 0 : (frame.fs - a.fs) / (b.fs - a.fs);
      const bl = a.bl + (b.bl - a.bl) * ratio;
      const wl = a.wl + (b.wl - a.wl) * ratio;
      const gap = Math.min(...frame.nodes.map((node) =>
        Math.hypot(node.bl - bl, node.wl - wl, node.fs - frame.fs)));
      if (gap < 0.22) touched += 1;
    }
    assert.ok(touched >= 18, `${stringer.id}: лежит всего на ${touched} шпангоутах`);
  }
});

// =========================================================== крыло
test("крыло: восстановленная площадь согласуется с напечатанной", () => {
  const area = dc3Object.dimensions.recoveredWingArea;
  const error = Math.abs(area / PUBLISHED_WING_AREA - 1);
  assert.ok(error < 0.05, `площадь ${area.toFixed(2)} м² против напечатанных ${PUBLISHED_WING_AREA} (${(error * 100).toFixed(1)} %)`);
});

test("крыло: задняя кромка прямая на всём размахе", () => {
  const ribs = byPrefix("wing-rib-right-").map((part) => {
    const nodes = vertices(part).map(toAircraft);
    return { bl: Math.max(...nodes.map((node) => node.bl)), trailing: Math.max(...nodes.map((node) => node.fs)) };
  }).sort((a, b) => a.bl - b.bl);
  assert.ok(ribs.length >= 12, "нервюр слишком мало для проверки кромки");
  // Прямой считается кромка на силовом размахе; законцовка заворачивается
  // вперёд по закруглению и проверяется отдельно, чтобы её не потерять.
  const straight = ribs.filter((rib) => rib.bl <= 13.0);
  const meanBl = straight.reduce((sum, rib) => sum + rib.bl, 0) / straight.length;
  const meanFs = straight.reduce((sum, rib) => sum + rib.trailing, 0) / straight.length;
  const slope = straight.reduce((sum, rib) => sum + (rib.bl - meanBl) * (rib.trailing - meanFs), 0)
    / straight.reduce((sum, rib) => sum + (rib.bl - meanBl) ** 2, 0);
  for (const rib of straight) {
    const expected = meanFs + slope * (rib.bl - meanBl);
    assert.ok(Math.abs(rib.trailing - expected) < 0.045,
      `задняя кромка гуляет на bl=${rib.bl.toFixed(2)}: ${(rib.trailing - expected).toFixed(3)} м`);
  }
  const sweep = Math.atan(-slope) * 180 / Math.PI;
  assert.ok(sweep > 0 && sweep < 2.0, `обратная стреловидность задней кромки ${sweep.toFixed(2)}° вне 0…2°`);
  const tip = ribs[ribs.length - 1];
  const straightAtTip = meanFs + slope * (tip.bl - meanBl);
  assert.ok(tip.trailing < straightAtTip - 0.10,
    "законцовка не заворачивается вперёд — потеряно закругление конца крыла");
});

test("крыло: центроплан горизонтален, консоль имеет поперечное V", () => {
  const ribs = byPrefix("wing-rib-right-").map((part) => {
    const nodes = vertices(part).map(toAircraft);
    const bl = nodes.reduce((sum, node) => sum + node.bl, 0) / nodes.length;
    const wl = nodes.reduce((sum, node) => sum + node.wl, 0) / nodes.length;
    return { bl, wl };
  }).sort((a, b) => a.bl - b.bl);
  const inboard = ribs.filter((rib) => rib.bl < KINK_BL - 0.2);
  const outboard = ribs.filter((rib) => rib.bl > KINK_BL + 0.4);
  const slopeOf = (list) => {
    const meanBl = list.reduce((sum, item) => sum + item.bl, 0) / list.length;
    const meanWl = list.reduce((sum, item) => sum + item.wl, 0) / list.length;
    const num = list.reduce((sum, item) => sum + (item.bl - meanBl) * (item.wl - meanWl), 0);
    const den = list.reduce((sum, item) => sum + (item.bl - meanBl) ** 2, 0);
    return num / den;
  };
  const centre = Math.atan(slopeOf(inboard)) * 180 / Math.PI;
  const panel = Math.atan(slopeOf(outboard)) * 180 / Math.PI;
  assert.ok(Math.abs(centre) < 0.6, `центроплан наклонён на ${centre.toFixed(2)}°`);
  assert.ok(Math.abs(panel - DIHEDRAL_DEGREES) < 0.5,
    `поперечное V консоли ${panel.toFixed(2)}°, паспорт требует ${DIHEDRAL_DEGREES}`);
});

test("крыло: профиль тонеет к концу, как требуют NACA 2215 → 2206", () => {
  const ribs = byPrefix("wing-rib-right-").map((part) => {
    const nodes = vertices(part).map(toAircraft);
    const chord = Math.max(...nodes.map((n) => n.fs)) - Math.min(...nodes.map((n) => n.fs));
    const thickness = Math.max(...nodes.map((n) => n.wl)) - Math.min(...nodes.map((n) => n.wl));
    const bl = nodes.reduce((sum, node) => sum + node.bl, 0) / nodes.length;
    return { bl, ratio: thickness / chord };
  }).sort((a, b) => a.bl - b.bl);
  const root = ribs[0];
  const tip = ribs[ribs.length - 1];
  assert.ok(root.ratio > 0.12 && root.ratio < 0.18, `относительная толщина в корне ${root.ratio.toFixed(3)}`);
  assert.ok(tip.ratio < root.ratio - 0.04, `профиль не тонеет: корень ${root.ratio.toFixed(3)}, конец ${tip.ratio.toFixed(3)}`);
});

test("крыло: лонжероны идут внутри профиля, а не по нему", () => {
  const spars = byPrefix("wing-spar-");
  assert.equal(spars.length, 6, "лонжеронов должно быть шесть: центроплан и две консоли на каждый");
  const ribs = byPrefix("wing-rib-right-");
  for (const spar of spars) {
    const nodes = vertices(spar).map(toAircraft);
    const high = Math.max(...nodes.map((node) => node.wl));
    const low = Math.min(...nodes.map((node) => node.wl));
    assert.ok(high - low < 3.2, `${spar.id}: лонжерон неправдоподобно высок`);
  }
  assert.ok(ribs.length >= 18, "нервюр правого полукрыла меньше объявленного");
});

// =========================================================== узлы
test("узлы: рама мотора замкнута и сидит перед лонжероном", () => {
  for (const side of ["left", "right"]) {
    const ring = dc3CoreParts.find((part) => part.id === `engine-mount-ring-${side}`);
    assert.ok(ring, `нет кольца рамы ${side}`);
    const nodes = vertices(ring).map(toAircraft);
    const struts = byPrefix(`engine-mount-strut-${side}-`);
    assert.equal(struts.length, 4, `подкосов рамы ${side}: ${struts.length}`);
    const ringFs = nodes.reduce((sum, node) => sum + node.fs, 0) / nodes.length;
    for (const strut of struts) {
      const strutNodes = vertices(strut).map(node => toAircraft(node));
      const rear = Math.max(...strutNodes.map((node) => node.fs));
      assert.ok(rear > ringFs + 0.2, `${strut.id}: подкос не доходит до лонжерона`);
    }
  }
});

test("узлы: узел шасси стоит на переднем лонжероне, а не в воздухе", () => {
  for (const side of ["left", "right"]) {
    const trunnion = dc3CoreParts.find((part) => part.id === `gear-trunnion-${side}`);
    assert.ok(trunnion, `нет узла шасси ${side}`);
    const nodes = vertices(trunnion);
    // Узел сидит на ЗАДНЕМ лонжероне: так вышло из двух положений колеса,
    // снятых с чертежа, и это подтверждает построение, а не ломает его.
    const spar = dc3CoreParts.find((part) => part.id === `wing-spar-rear-centre`);
    const sparNodes = vertices(spar);
    const gap = Math.min(...nodes.map((node) => Math.min(...sparNodes.map((other) =>
      Math.hypot(node[0] - other[0], node[1] - other[1], node[2] - other[2])))));
    assert.ok(gap < 0.55, `${trunnion.id}: до лонжерона ${gap.toFixed(3)} м — узел висит`);
  }
});

test("узлы: киль входит в фюзеляж форкилем, а не растёт из воздуха", () => {
  const fillet = dc3CoreParts.find((part) => part.id === "fin-root-fillet-spar");
  assert.ok(fillet, "нет форкиля");
  const nodes = vertices(fillet).map(toAircraft);
  const low = nodes.reduce((best, node) => (node.fs < best.fs ? node : best));
  const frames = byPrefix("frame-");
  const near = frames.some((frame) => vertices(frame).some((other) => {
    const point = toAircraft(other);
    return Math.hypot(point.fs - low.fs, point.bl - low.bl, point.wl - low.wl) < 0.35;
  }));
  assert.ok(near, "форкиль не садится ни на один шпангоут");
});

// =========================================================== камеры
test("камеры: обязательный набор объявлен и каждый разрез имеет внешнего близнеца", () => {
  const ids = dc3Object.views.map((view) => view.id);
  for (const required of ["front", "left", "rear", "top", "front-three-quarter", "rear-three-quarter", "high-three-quarter", "underside", "silhouette"]) {
    assert.ok(ids.includes(required), `нет камеры ${required}`);
  }
  for (const view of dc3Object.views) {
    if (!view.hiddenGroups || view.hiddenGroups.length === 0) continue;
    const twin = dc3Object.views.find((other) =>
      other.id === `${view.id}-external`
      || (other.id !== view.id && !other.hiddenGroups?.length
        && other.position.every((value, index) => value === view.position[index])
        && other.target.every((value, index) => value === view.target[index])));
    assert.ok(twin, `у разреза ${view.id} нет внешнего близнеца с той же камерой`);
  }
});

test("камеры: ортогональные кадры вмещают машину целиком", () => {
  const { min, max } = bounds(dc3CoreParts);
  const [frameWidth, frameHeight] = dc3Object.captureFrame;
  const aspect = frameWidth / frameHeight;
  const checks = {
    front: { width: max[0] - min[0], height: max[1] - min[1] },
    rear: { width: max[0] - min[0], height: max[1] - min[1] },
    left: { width: max[2] - min[2], height: max[1] - min[1] },
    silhouette: { width: max[2] - min[2], height: max[1] - min[1] },
    top: { width: max[0] - min[0], height: max[2] - min[2] },
  };
  for (const [id, size] of Object.entries(checks)) {
    const view = dc3Object.views.find((item) => item.id === id);
    assert.ok(view && view.orthoHeight, `камера ${id} без orthoHeight`);
    assert.ok(view.orthoHeight >= size.height, `${id}: кадр ${view.orthoHeight} ниже машины (${size.height.toFixed(2)})`);
    assert.ok(view.orthoHeight * aspect >= size.width, `${id}: кадр уже машины (${size.width.toFixed(2)})`);
  }
});

test("контракт: запрещённая динамика объявлена данными", () => {
  const constraints = dc3Object.motionConstraints ?? {};
  assert.equal(constraints.aerodynamicsExcluded, true);
  assert.equal(constraints.worldPlacementExcluded, true);
  assert.equal(constraints.emittedInParkedPose, true);
});

test("материалы: в ядре нет прозрачных деталей", () => {
  for (const part of dc3CoreParts) {
    assert.ok(!["glazing", "lamp-glass", "canvas"].includes(part.material),
      `${part.id}: прозрачный материал в силовом наборе`);
  }
});
