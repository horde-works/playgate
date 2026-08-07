import assert from "node:assert/strict";
import test from "node:test";
import {
  COMBAT_HEX_BODY_SECTIONS,
  COMBAT_HEX_LIFT_STATIONS,
  COMBAT_HEX_PART_BUDGET,
  COMBAT_HEX_YAW_STATIONS,
  combatHexacopterObject,
} from "../games/make-a-mess/src/content/objects/vehicles/combatHexacopterObject.ts";

const approx = (actual, expected, tolerance = 1e-6) => {
  assert.equal(Math.abs(actual - expected) <= tolerance, true, `${actual} != ${expected}`);
};

const bounds = (part) => {
  if (part.kind === "mesh") {
    return {
      min: [0, 1, 2].map((axis) => Math.min(...part.vertices.map((vertex) => vertex[axis]))),
      max: [0, 1, 2].map((axis) => Math.max(...part.vertices.map((vertex) => vertex[axis]))),
    };
  }
  if (part.kind === "box" && !part.rotation) {
    return {
      min: part.center.map((value, axis) => value - part.size[axis] / 2),
      max: part.center.map((value, axis) => value + part.size[axis] / 2),
    };
  }
  if (part.kind === "cylinder") {
    const delta = part.to.map((value, axis) => value - part.from[axis]);
    const length = Math.hypot(...delta);
    const direction = delta.map((value) => value / length);
    const radial = direction.map((value) => part.radius * Math.sqrt(1 - value * value));
    return {
      min: part.from.map((value, axis) => Math.min(value, part.to[axis]) - radial[axis]),
      max: part.from.map((value, axis) => Math.max(value, part.to[axis]) + radial[axis]),
    };
  }
  return null;
};

test("канонический объект остаётся в отдельном бюджете и имеет уникальные детали", () => {
  assert.equal(combatHexacopterObject.parts.length <= COMBAT_HEX_PART_BUDGET, true);
  assert.equal(combatHexacopterObject.parts.length >= 300, true);
  const ids = combatHexacopterObject.parts.map((part) => part.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("это ровно шесть несущих роторов и два отдельных винта рыскания", () => {
  assert.equal(COMBAT_HEX_LIFT_STATIONS.length, 6);
  assert.equal(COMBAT_HEX_YAW_STATIONS.length, 2);
  assert.equal(combatHexacopterObject.parts.filter((part) => /^lift-.*-blade-\d+$/.test(part.id)).length, 30);
  assert.equal(combatHexacopterObject.parts.filter((part) => /^yaw-.*-blade-\d+$/.test(part.id)).length, 14);
  assert.equal(combatHexacopterObject.parts.filter((part) => /^lift-.*-motor$/.test(part.id)).length, 6);
  assert.equal(combatHexacopterObject.parts.filter((part) => /^yaw-.*-motor$/.test(part.id)).length, 2);
});

test("несущие гондолы имеют физический зазор, а задняя пара выше и крупнее", () => {
  for (let first = 0; first < COMBAT_HEX_LIFT_STATIONS.length; first += 1) {
    for (let second = first + 1; second < COMBAT_HEX_LIFT_STATIONS.length; second += 1) {
      const a = COMBAT_HEX_LIFT_STATIONS[first];
      const b = COMBAT_HEX_LIFT_STATIONS[second];
      const clearance = Math.hypot(a.x - b.x, a.z - b.z) - a.outerRadius - b.outerRadius;
      assert.equal(clearance > 0.08, true, `${a.id}/${b.id}: ${clearance.toFixed(3)} m`);
    }
  }
  assert.equal(COMBAT_HEX_LIFT_STATIONS[4].outerRadius > COMBAT_HEX_LIFT_STATIONS[0].outerRadius, true);
  assert.equal(COMBAT_HEX_LIFT_STATIONS[4].planeY > COMBAT_HEX_LIFT_STATIONS[0].planeY, true);
});

test("винты рыскания имеют зеркальный диагональный развал наружу", () => {
  const recoveredCants = [];
  for (const station of COMBAT_HEX_YAW_STATIONS) {
    const motor = combatHexacopterObject.parts.find((part) => part.id === `yaw-${station.id}-motor`);
    assert.ok(motor);
    assert.equal(motor.kind, "cylinder");
    const delta = motor.to.map((value, axis) => value - motor.from[axis]);
    approx(delta[1], 0);
    assert.equal(delta[2] > 0.2, true);
    assert.equal(Math.sign(delta[0]), Math.sign(station.x));
    const cant = Math.atan2(delta[0], delta[2]);
    approx(Math.abs(cant), Math.PI / 10);
    recoveredCants.push(cant);
    for (let axis = 0; axis < 3; axis += 1) approx((motor.from[axis] + motor.to[axis]) / 2, [station.x, station.y, station.z][axis]);
    const tunnel = combatHexacopterObject.parts.find((part) => part.id === `yaw-${station.id}-tunnel`);
    assert.equal(tunnel?.kind, "mesh");
    const frontRim = combatHexacopterObject.parts.find((part) => part.id === `yaw-${station.id}-front-rim`);
    assert.equal(frontRim?.kind, "mesh");
  }
  approx(recoveredCants[0], -recoveredCants[1]);
});

test("каждая гондола имеет два независимых силовых зацепления", () => {
  for (const station of COMBAT_HEX_LIFT_STATIONS) {
    const side = station.x < 0 ? -1 : 1;
    const primary = combatHexacopterObject.parts.find((part) => part.id === `clevis-inboard-${station.id}`);
    const secondary = combatHexacopterObject.parts.find((part) => part.id === `clevis-secondary-${station.id}`);
    assert.equal(primary?.kind, "mesh");
    assert.equal(secondary?.kind, "mesh");
    const wallReach = station.outerRadius - 0.035;
    const zSpread = station.outerRadius * 0.34;
    const xReach = Math.sqrt(wallReach ** 2 - zSpread ** 2);
    const expectedX = station.x - side * xReach;
    const primaryPoint = [expectedX, station.planeY, station.z + zSpread];
    const secondaryPoint = [expectedX, station.planeY, station.z - zSpread];
    for (const [part, expected] of [[primary, primaryPoint], [secondary, secondaryPoint]]) {
      const partBounds = bounds(part);
      for (let axis = 0; axis < 3; axis += 1) {
        assert.equal(partBounds.min[axis] <= expected[axis] && partBounds.max[axis] >= expected[axis], true, `${part.id}:${axis}`);
      }
    }
    assert.ok(combatHexacopterObject.parts.find((part) => part.id === `ring-saddle-${station.id}-0`));
    assert.ok(combatHexacopterObject.parts.find((part) => part.id === `ring-saddle-${station.id}-1`));
    assert.ok(combatHexacopterObject.parts.find((part) => part.id === `root-fairing-primary-${station.id}`));
    assert.ok(combatHexacopterObject.parts.find((part) => part.id === `root-fairing-secondary-${station.id}`));
  }
});

test("внешний бампер полностью отсутствует", () => {
  const forbidden = ["outer-torque-rail", "front-trapezoid-bridge", "rear-crossmember", "outer-bay-diagonal"];
  for (const fragment of forbidden) {
    assert.equal(combatHexacopterObject.parts.some((part) => part.id.includes(fragment)), false, fragment);
  }
  for (const part of combatHexacopterObject.parts.filter((candidate) => candidate.group === "primary-frame")) {
    const partBounds = bounds(part);
    if (!partBounds) continue;
    assert.equal(Math.max(Math.abs(partBounds.min[0]), Math.abs(partBounds.max[0])) < 2.05, true, part.id);
  }
});

test("все четыре посадочные цепи доходят до нулевого датума", () => {
  const soles = combatHexacopterObject.parts.filter((part) => part.id.startsWith("landing-pad-sole-"));
  assert.equal(soles.length, 4);
  for (const sole of soles) {
    const soleBounds = bounds(sole);
    approx(soleBounds.min[1], 0);
    const suffix = sole.id.replace("landing-pad-sole-", "");
    for (const prefix of ["landing-trunnion-", "landing-main-strut-", "landing-drag-link-", "landing-oleo-"]) {
      assert.ok(combatHexacopterObject.parts.find((part) => part.id === `${prefix}${suffix}`), `${prefix}${suffix}`);
    }
  }
});

test("корпус поднимается и сужается к настоящему хвостовому хребту", () => {
  const cockpit = COMBAT_HEX_BODY_SECTIONS.find((section) => section.z === 0.3);
  const tail = COMBAT_HEX_BODY_SECTIONS.at(-1);
  assert.ok(cockpit && tail);
  assert.equal(tail.crownY > cockpit.crownY + 0.6, true);
  assert.equal(tail.shoulderHalf < cockpit.shoulderHalf * 0.3, true);
  for (let index = 5; index < COMBAT_HEX_BODY_SECTIONS.length - 1; index += 1) {
    assert.equal(COMBAT_HEX_BODY_SECTIONS[index + 1].crownY > COMBAT_HEX_BODY_SECTIONS[index].crownY, true);
  }
});

test("меши конечны и не содержат вырожденных треугольников", () => {
  for (const part of combatHexacopterObject.parts.filter((candidate) => candidate.kind === "mesh")) {
    for (const vertex of part.vertices) assert.equal(vertex.every(Number.isFinite), true, part.id);
    for (const [a, b, c] of part.triangles) {
      const first = part.vertices[a];
      const second = part.vertices[b];
      const third = part.vertices[c];
      assert.ok(first && second && third, `${part.id}: bad index`);
      const ab = second.map((value, axis) => value - first[axis]);
      const ac = third.map((value, axis) => value - first[axis]);
      const cross = [
        ab[1] * ac[2] - ab[2] * ac[1],
        ab[2] * ac[0] - ab[0] * ac[2],
        ab[0] * ac[1] - ab[1] * ac[0],
      ];
      assert.equal(Math.hypot(...cross) > 1e-10, true, `${part.id}: degenerate triangle`);
    }
  }
});

test("фиксированные камеры включают ортографику, рискованные виды и парный cutaway", () => {
  const required = [
    "front", "left", "right", "rear", "top", "front-three-quarter",
    "rear-three-quarter", "high-three-quarter", "underside",
    // Камера рамы фонаря: носовой торец продольных членов и обе дуги на
    // стекле читаются только вблизи.
    "canopy-frame",
    "yaw-detail", "structural-exterior", "structural-cutaway", "silhouette",
  ];
  assert.deepEqual(combatHexacopterObject.views.map((view) => view.id), required);
  const exterior = combatHexacopterObject.views.find((view) => view.id === "structural-exterior");
  const cutaway = combatHexacopterObject.views.find((view) => view.id === "structural-cutaway");
  assert.deepEqual(cutaway.position, exterior.position);
  assert.deepEqual(cutaway.target, exterior.target);
  assert.equal(cutaway.fov, exterior.fov);
  assert.equal(exterior.hiddenGroups, undefined);
  assert.deepEqual(cutaway.hiddenGroups, ["outer-shell", "canopy", "shoulder-armour", "service-detail", "sensors", "lighting"]);
});

// ---------------------------------------------------------------------------
// Рама фонаря. Оба замера снимаются с ВЫПУЩЕННЫХ мешей — и обвода, и члена, —
// поэтому строитель не может подтвердить сам себя.
// ---------------------------------------------------------------------------

const partById = (id) => {
  const part = combatHexacopterObject.parts.find((candidate) => candidate.id === id);
  assert.ok(part, `в объекте нет детали ${id}`);
  return part;
};

const CANOPY_FRAME_IDS = [
  "canopy-crown-rail",
  "canopy-coaming--1",
  "canopy-coaming-1",
  "canopy-mid-pillar--1",
  "canopy-mid-pillar-1",
  "canopy-aft-pillar--1",
  "canopy-aft-pillar-1",
  "canopy-aft-brow",
  "survival-canopy-sill--1",
  "survival-canopy-sill-1",
];

/** Кольца остекления, восстановленные из его собственных вершин. */
const glazingRings = () => {
  const rings = new Map();
  for (const vertex of partById("canopy-glazing").vertices) {
    const key = vertex[2].toFixed(4);
    const ring = rings.get(key) ?? [];
    ring.push(vertex);
    rings.set(key, ring);
  }
  return [...rings.values()]
    .map((ring) => {
      // На каждом кольце с одного борта ровно три узла: пята, стекло, конёк.
      // Меш выпускает вершины пофасетно, поэтому узлы сначала склеиваются.
      const unique = new Map();
      for (const vertex of ring) {
        unique.set(vertex.map((value) => value.toFixed(4)).join(":"), vertex);
      }
      const outboard = [...unique.values()]
        .filter((vertex) => vertex[0] > 1e-6)
        .sort((first, second) => first[1] - second[1]);
      assert.equal(outboard.length, 3, `кольцо z=${ring[0][2]} потеряло узлы обвода`);
      return { z: ring[0][2], base: outboard[0], glass: outboard[1], crown: outboard[2] };
    })
    .sort((first, second) => second.z - first.z);
};

test("рама фонаря не выходит за поперечный обвод остекления", () => {
  const front = Math.max(...partById("canopy-glazing").vertices.map((vertex) => vertex[2]));
  for (const id of CANOPY_FRAME_IDS) {
    const reach = Math.max(...partById(id).vertices.map((vertex) => vertex[2]));
    assert.equal(
      reach <= front,
      true,
      `${id} выходит на ${((reach - front) * 1000).toFixed(0)} мм за обвод стекла (${reach.toFixed(3)} против ${front.toFixed(3)})`,
    );
  }
});

test("стойка фонаря идёт по обводу стекла, а не по хорде между пятой и коньком", () => {
  const rings = glazingRings();
  for (const id of ["canopy-mid-pillar--1", "canopy-mid-pillar-1", "canopy-aft-pillar--1", "canopy-aft-pillar-1"]) {
    const pillar = partById(id);
    const station = (
      Math.min(...pillar.vertices.map((vertex) => vertex[2]))
      + Math.max(...pillar.vertices.map((vertex) => vertex[2]))
    ) / 2;
    const upper = rings.find((ring, index) => ring.z >= station && rings[index + 1]?.z <= station);
    const lower = rings[rings.indexOf(upper) + 1];
    assert.ok(upper && lower, `станция ${station} вне остекления`);
    const t = (upper.z - station) / (upper.z - lower.z);
    const cornerX = upper.glass[0] + (lower.glass[0] - upper.glass[0]) * t;
    const cornerY = upper.glass[1] + (lower.glass[1] - upper.glass[1]) * t;

    // Узел стойки стоит НА углу остекления: прямая хорда проходила в 14 см от
    // него, тонула в стекле и высовывалась наружу одним верхним огрызком.
    const near = pillar.vertices.filter(
      (vertex) => Math.hypot(Math.abs(vertex[0]) - cornerX, vertex[1] - cornerY) <= 0.06,
    );
    assert.equal(
      near.length > 0,
      true,
      `${id}: ближайшая точка в ${Math.min(...pillar.vertices.map((vertex) => Math.hypot(Math.abs(vertex[0]) - cornerX, vertex[1] - cornerY))).toFixed(3)} м от угла остекления`,
    );
    // И короб сидит серединой на поверхности, как комингс: часть наружу,
    // часть внутрь.
    const outboard = Math.max(...near.map((vertex) => Math.abs(vertex[0])));
    const inboard = Math.min(...near.map((vertex) => Math.abs(vertex[0])));
    assert.equal(outboard > cornerX, true, `${id} целиком внутри стекла`);
    assert.equal(inboard < cornerX, true, `${id} целиком снаружи стекла`);
  }
});

test("прозрачность принадлежит только физическому стеклу", () => {
  const transparentMaterials = Object.entries(combatHexacopterObject.materialOverrides)
    .filter(([, value]) => value.transparent === true)
    .map(([id]) => id);
  assert.deepEqual(transparentMaterials, ["glazing"]);
  assert.equal(
    combatHexacopterObject.parts
      .filter((part) => transparentMaterials.includes(part.material))
      .every((part) => part.group === "canopy" || part.group === "sensors"),
    true,
  );
});
