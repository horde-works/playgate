import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLoft,
  buildRevolution,
  buildSlab,
  buildTorqueBox,
  circleRing,
  facetVolume,
  facetsToPart,
  insetRing,
  mergedCircleRing,
  planArea,
  splitFacets,
  triangulatePlan,
} from "../games/make-a-mess/src/content/objects/authoring/solidBuilders.ts";

const square = (half) => [
  { x: -half, z: -half }, { x: half, z: -half },
  { x: half, z: half }, { x: -half, z: half },
];

function triangulatedArea(outline, holes) {
  const { points, triangles } = triangulatePlan(outline, holes);
  return triangles.reduce((sum, [a, b, c]) => {
    const pa = points[a];
    const pb = points[b];
    const pc = points[c];
    return sum + ((pb.x - pa.x) * (pc.z - pa.z) - (pb.z - pa.z) * (pc.x - pa.x)) / 2;
  }, 0);
}

test("плановая триангуляция сохраняет площадь выпуклого контура", () => {
  assert.equal(Math.abs(triangulatedArea(square(1), []) - 4) < 1e-9, true);
});

test("плановая триангуляция берёт вогнутый контур, который веер не берёт", () => {
  const lShape = [
    { x: 0, z: 0 }, { x: 3, z: 0 }, { x: 3, z: 1 },
    { x: 1, z: 1 }, { x: 1, z: 3 }, { x: 0, z: 3 },
  ];
  assert.equal(Math.abs(triangulatedArea(lShape, []) - 5) < 1e-9, true);
});

test("плановая триангуляция вычитает отверстия", () => {
  const hole = circleRing({ x: 0, z: 0 }, 0.5, 64);
  const expected = 4 - Math.abs(planArea(hole));
  assert.equal(Math.abs(triangulatedArea(square(1), [hole]) - expected) < 1e-9, true);
});

test("плановая триангуляция держит несколько отверстий сразу", () => {
  const holes = [
    circleRing({ x: -1.2, z: 0.9 }, 0.4, 48),
    circleRing({ x: 1.2, z: 0.9 }, 0.4, 48),
    circleRing({ x: 0, z: -1.1 }, 0.55, 48),
  ];
  const expected = 16 - holes.reduce((sum, hole) => sum + Math.abs(planArea(hole)), 0);
  assert.equal(Math.abs(triangulatedArea(square(2), holes) - expected) < 1e-9, true);
});

test("все треугольники плана невырождены и ориентированы одинаково", () => {
  const { points, triangles } = triangulatePlan(square(2), [circleRing({ x: 0, z: 0 }, 0.7, 40)]);
  for (const [a, b, c] of triangles) {
    const pa = points[a];
    const pb = points[b];
    const pc = points[c];
    const area = ((pb.x - pa.x) * (pc.z - pa.z) - (pb.z - pa.z) * (pc.x - pa.x)) / 2;
    assert.equal(area > 1e-12, true);
  }
});

test("отступ контура уменьшает площадь наружу и увеличивает отверстие", () => {
  const outline = square(1);
  assert.equal(planArea(insetRing(outline, 0.1)) < planArea(outline), true);
  const hole = circleRing({ x: 0, z: 0 }, 0.5, 64).slice().reverse();
  assert.equal(Math.abs(planArea(insetRing(hole, 0.1))) > Math.abs(planArea(hole)), true);
});

test("объединение двух пересекающихся кругов даёт площадь объединения", () => {
  const first = { centre: { x: -0.3, z: 0 }, radius: 0.6 };
  const second = { centre: { x: 0.3, z: 0 }, radius: 0.6 };
  const ring = mergedCircleRing(first, second, 256);
  const distance = 0.6;
  const lens = 2 * 0.6 ** 2 * Math.acos(distance / (2 * 0.6))
    - (distance / 2) * Math.sqrt(4 * 0.6 ** 2 - distance ** 2);
  const expected = 2 * Math.PI * 0.6 ** 2 - lens;
  assert.equal(Math.abs(planArea(ring) - expected) < 4e-3, true);
});

test("плита без фаски имеет ровно объём площади на толщину", () => {
  const facets = buildSlab({
    outline: square(1.5),
    topAt: () => 1,
    bottomAt: () => 0.7,
    chamfer: 0,
  });
  assert.equal(Math.abs(facetVolume(facets) - 9 * 0.3) < 1e-9, true);
});

test("колодец в плите вычитает свой объём, фаска — ещё немного", () => {
  const hole = circleRing({ x: 0, z: 0 }, 0.6, 64);
  const straight = buildSlab({
    outline: square(1.5),
    holes: [hole],
    topAt: () => 1,
    bottomAt: () => 0.7,
    chamfer: 0,
  });
  const expected = (9 - Math.abs(planArea(hole))) * 0.3;
  assert.equal(Math.abs(facetVolume(straight) - expected) < 1e-9, true);

  const chamfered = buildSlab({
    outline: square(1.5),
    holes: [hole],
    topAt: () => 1,
    bottomAt: () => 0.7,
    chamfer: 0.06,
  });
  const volume = facetVolume(chamfered);
  assert.equal(volume > 0, true);
  assert.equal(volume < expected, true);
  assert.equal(volume > expected * 0.9, true);
});

test("наклонная верхняя поверхность плиты остаётся замкнутой", () => {
  const facets = buildSlab({
    outline: square(1.5),
    topAt: (_x, z) => (z < 0 ? 1.16 : 0.98),
    bottomAt: (_x, z) => (z < 0 ? 0.91 : 0.73),
    chamfer: 0.05,
  });
  assert.equal(facetVolume(facets) > 9 * 0.24, true);
});

test("фасеточный лофт даёт призму нужного объёма", () => {
  const section = (y) => [[-0.5, y, -0.5], [0.5, y, -0.5], [0.5, y, 0.5], [-0.5, y, 0.5]];
  const facets = buildLoft([section(0), section(2)], { capStart: true, capEnd: true });
  assert.equal(Math.abs(facetVolume(facets) - 2) < 1e-9, true);
});

test("короб фермы замкнут и его объём меньше габаритного", () => {
  const facets = buildTorqueBox({
    from: [0, 0, 0],
    to: [0, 0, 2],
    width: 0.4,
    height: 0.3,
    chamfer: 0.08,
  });
  const volume = facetVolume(facets);
  assert.equal(volume > 0, true);
  assert.equal(volume < 0.4 * 0.3 * 2, true);
  assert.equal(volume > 0.4 * 0.3 * 2 * 0.8, true);
});

test("тело вращения приближает замкнутый цилиндр", () => {
  const facets = buildRevolution(
    [
      { radius: 0, y: 1 }, { radius: 0.5, y: 1 },
      { radius: 0.5, y: 0 }, { radius: 0, y: 0 },
    ],
    { x: 0, z: 0 },
    { segments: 128 },
  );
  assert.equal(Math.abs(facetVolume(facets) - Math.PI * 0.25) < 5e-3, true);
});

test("фасеты не делят вершины, поэтому складки переживают computeVertexNormals", () => {
  const section = (y) => [[-0.5, y, -0.5], [0.5, y, -0.5], [0.5, y, 0.5], [-0.5, y, 0.5]];
  const facets = buildLoft([section(0), section(1), section(2)], { capStart: true, capEnd: true });
  const part = facetsToPart("probe", "test", "metal", facets);
  const expectedVertices = facets.reduce((sum, facet) => sum + facet.points.length, 0);
  const expectedTriangles = facets.reduce((sum, facet) => sum + facet.points.length - 2, 0);
  assert.equal(part.vertices.length, expectedVertices);
  assert.equal(part.triangles.length, expectedTriangles);
  const used = new Set(part.triangles.flat());
  assert.equal(used.size, expectedVertices);
});

test("разбиение фасетов на панели ничего не теряет", () => {
  const facets = buildSlab({
    outline: square(1.5),
    topAt: () => 1,
    bottomAt: () => 0.7,
    chamfer: 0.05,
  });
  const buckets = splitFacets(facets, (centroid) => (centroid[0] < 0 ? "left" : "right"));
  const total = [...buckets.values()].reduce((sum, bucket) => sum + bucket.length, 0);
  assert.equal(total, facets.length);
  assert.equal(buckets.size, 2);
});
