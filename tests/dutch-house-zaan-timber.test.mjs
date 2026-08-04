import assert from "node:assert/strict";
import test from "node:test";
import {
  ZAAN_HOUSE_EAVE_Y,
  ZAAN_HOUSE_MAIN_WIDTH,
  ZAAN_HOUSE_FOOTPRINT_DEPTH,
  ZAAN_HOUSE_FOOTPRINT_WIDTH,
  ZAAN_HOUSE_ROOF_ENVELOPE_DEPTH,
  ZAAN_HOUSE_ROOF_ENVELOPE_WIDTH,
  ZAAN_HOUSE_RIDGE_Y,
  ZAAN_HOUSE_SERVICE_DEPTH,
  ZAAN_HOUSE_SERVICE_WIDTH,
  ZAAN_HOUSE_YOKE_COUNT,
  zaanTimberMerchantHouseObject,
} from "../games/make-a-mess/src/content/objects/dutchHouses/zaanTimberMerchantHouseObject.ts";

const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

test("H1 сохраняет естественный узкий и глубокий жилой масштаб", () => {
  assert.equal(ZAAN_HOUSE_FOOTPRINT_WIDTH, 7.2);
  assert.equal(ZAAN_HOUSE_FOOTPRINT_DEPTH, 10.8);
  assert.equal(ZAAN_HOUSE_ROOF_ENVELOPE_WIDTH, 7.47);
  assert.equal(ZAAN_HOUSE_ROOF_ENVELOPE_DEPTH, 11.16);
  assert.equal(ZAAN_HOUSE_MAIN_WIDTH, 4.8);
  assert.equal(ZAAN_HOUSE_EAVE_Y, 3.35);
  assert.equal(ZAAN_HOUSE_RIDGE_Y, 7.15);
  assert.ok(ZAAN_HOUSE_FOOTPRINT_DEPTH / ZAAN_HOUSE_MAIN_WIDTH >= 2.2);
});

test("обшивка не подменяет несущие поперечные рамы", () => {
  const posts = zaanTimberMerchantHouseObject.parts.filter((part) => /^yoke-\d-post-/.test(part.id));
  const ties = zaanTimberMerchantHouseObject.parts.filter((part) => /^yoke-\d-tie$/.test(part.id));
  const knees = zaanTimberMerchantHouseObject.parts.filter((part) => /^yoke-\d-knee-/.test(part.id));
  assert.equal(posts.length, ZAAN_HOUSE_YOKE_COUNT * 2);
  assert.equal(ties.length, ZAAN_HOUSE_YOKE_COUNT);
  assert.equal(knees.length, ZAAN_HOUSE_YOKE_COUNT * 2);
  assert.ok(posts.every((part) => part.group === "primary-frame"));
  assert.ok(!posts.some((part) => part.group === "main-cladding"));
});

test("ступенчатая боковая обшивка является повторяемой геометрией", () => {
  const mainCourses = zaanTimberMerchantHouseObject.parts.filter((part) => /^side--?\d-lap-course-\d+-segment-\d+$/.test(part.id));
  const serviceCourses = zaanTimberMerchantHouseObject.parts.filter((part) => /^service-(east|front)-lap-\d+-segment-\d+$/.test(part.id) || /^service-rear-lap-\d+$/.test(part.id));
  assert.ok(mainCourses.length > 26, "курсы вокруг окон должны быть физически разрезаны");
  assert.ok(serviceCourses.length > 27, "курсы мастерской должны обходить дверь и окна");
  assert.ok([...mainCourses, ...serviceCourses].every((part) => part.kind === "box"));
  for (const side of [-1, 1]) {
    for (let course = 0; course < 13; course += 1) {
      assert.ok(mainCourses.some((part) => part.id.startsWith(`side-${side}-lap-course-${course}-`)));
    }
  }
});

test("фасадный контур и его белая обвязка используют одни реперы", () => {
  const gable = zaanTimberMerchantHouseObject.parts.find((part) => part.id === "shaped-front-gable");
  const trims = zaanTimberMerchantHouseObject.parts.filter((part) => /^gable-trim-/.test(part.id));
  assert.equal(gable?.kind, "mesh");
  assert.equal(gable?.vertices.length, 56);
  assert.equal(gable?.triangles.length, 28);
  assert.equal(trims.length, 22);
  assert.ok(zaanTimberMerchantHouseObject.parts.some((part) => part.id === "crown-post-stem"));
  assert.ok(zaanTimberMerchantHouseObject.parts.some((part) => part.id === "crown-post-diamond"));
});

test("окна и двери являются разрывами оболочки, а не тёмными наклейками", () => {
  const frontCladding = zaanTimberMerchantHouseObject.parts.filter((part) => part.group === "main-cladding" && part.kind === "box" && part.center[2] > 5);
  const frontOpenings = [
    [-1.86, -0.7, 1.03, 2.65], [-0.48, 0.48, 0.49, 2.65], [0.7, 1.86, 1.03, 2.65],
  ];
  for (const part of frontCladding) {
    const [cx, cy] = part.center;
    const [sx, sy] = part.size;
    for (const [x0, x1, y0, y1] of frontOpenings) {
      const overlapsX = cx + sx / 2 > x0 + 1e-6 && cx - sx / 2 < x1 - 1e-6;
      const overlapsY = cy + sy / 2 > y0 + 1e-6 && cy - sy / 2 < y1 - 1e-6;
      assert.ok(!(overlapsX && overlapsY), `${part.id} закрывает фасадный проём`);
    }
  }
  const gable = zaanTimberMerchantHouseObject.parts.find((part) => part.id === "shaped-front-gable");
  assert.equal(gable?.kind, "mesh");
  assert.ok(gable.vertices.every(([x, y]) => y <= 4.26 || y >= 5.42 || Math.abs(x) >= 0.45));
  const rearGable = zaanTimberMerchantHouseObject.parts.find((part) => part.id === "rear-gable");
  assert.equal(rearGable?.kind, "mesh");
  assert.ok(rearGable.vertices.every(([x, y]) => y <= 4.34 || y >= 5.46 || Math.abs(x) >= 0.46));
  assert.ok(zaanTimberMerchantHouseObject.parts.some((part) => part.id === "rear-loft-opening"));
});

test("мастерская входит в общий габарит и имеет обыгранное соединение", () => {
  assert.equal(ZAAN_HOUSE_SERVICE_WIDTH, 4.2);
  assert.equal(ZAAN_HOUSE_SERVICE_DEPTH, 4.8);
  const junction = zaanTimberMerchantHouseObject.parts.filter((part) => part.group === "service-junction");
  assert.equal(junction.length, 4);
  assert.ok(junction.some((part) => part.id === "service-junction-header"));
  assert.ok(junction.some((part) => part.id === "service-junction-front-post"));
  assert.ok(junction.some((part) => part.id === "service-junction-rear-post"));
});

test("кровельный габарит восстанавливается отдельно от стенового пятна", () => {
  const roofMeshes = zaanTimberMerchantHouseObject.parts.filter((part) =>
    part.kind === "mesh" && (part.group === "roof-skin" || part.group === "service-roof")
  );
  const vertices = roofMeshes.flatMap((part) => part.kind === "mesh" ? part.vertices : []);
  const minX = Math.min(...vertices.map((vertex) => vertex[0]));
  const maxX = Math.max(...vertices.map((vertex) => vertex[0]));
  const minZ = Math.min(...vertices.map((vertex) => vertex[2]));
  const maxZ = Math.max(...vertices.map((vertex) => vertex[2]));
  assert.ok(Math.abs(maxX - minX - ZAAN_HOUSE_ROOF_ENVELOPE_WIDTH) < 1e-9);
  assert.ok(Math.abs(maxZ - minZ - ZAAN_HOUSE_ROOF_ENVELOPE_DEPTH) < 1e-9);
  assert.ok(ZAAN_HOUSE_ROOF_ENVELOPE_WIDTH > ZAAN_HOUSE_FOOTPRINT_WIDTH);
  assert.ok(ZAAN_HOUSE_ROOF_ENVELOPE_DEPTH > ZAAN_HOUSE_FOOTPRINT_DEPTH);
});

test("стропила остаются под обеими готовыми кровлями", () => {
  const mainRafters = zaanTimberMerchantHouseObject.parts.filter((part) => /^rafter-\d-/.test(part.id));
  for (const rafter of mainRafters) {
    assert.equal(rafter.kind, "beam");
    for (const endpoint of [rafter.from, rafter.to]) {
      const roofY = 7.06 - (7.06 - ZAAN_HOUSE_EAVE_Y) / 2.62 * Math.abs(endpoint[0]);
      assert.ok(roofY - endpoint[1] >= 0.3, `${rafter.id} подходит к оболочке на ${roofY - endpoint[1]} м`);
    }
  }
  const serviceRafters = zaanTimberMerchantHouseObject.parts.filter((part) => /^service-rafter-/.test(part.id));
  for (const rafter of serviceRafters) {
    assert.equal(rafter.kind, "beam");
    for (const endpoint of [rafter.from, rafter.to]) {
      const roofY = 4.12 - (4.12 - 2.45) / 2.15 * Math.abs(endpoint[0] - 2.7);
      assert.ok(roofY - endpoint[1] >= 0.3, `${rafter.id} подходит к оболочке на ${roofY - endpoint[1]} м`);
    }
  }
});

test("дом статичен и не наследует контракт ротора", () => {
  assert.equal(zaanTimberMerchantHouseObject.rotor, undefined);
  assert.equal(zaanTimberMerchantHouseObject.motionConstraints?.staticObject, true);
  assert.equal(zaanTimberMerchantHouseObject.motionConstraints?.windSimulation, false);
});

test("все детали невырождены и ids уникальны", () => {
  assert.equal(new Set(zaanTimberMerchantHouseObject.parts.map((part) => part.id)).size, zaanTimberMerchantHouseObject.parts.length);
  for (const part of zaanTimberMerchantHouseObject.parts) {
    if (part.kind === "beam" || part.kind === "cylinder") assert.ok(distance(part.from, part.to) > 0.04, part.id);
    if (part.kind === "mesh") {
      assert.ok(part.vertices.length >= 3, part.id);
      assert.ok(part.triangles.length >= 1, part.id);
    }
  }
});

test("приёмочные камеры показывают оболочку, каркас и соединение мастерской отдельно", () => {
  assert.deepEqual(zaanTimberMerchantHouseObject.views.map((view) => view.id), [
    "front", "left", "rear", "right", "three-quarter-left", "three-quarter-right",
    "high-three-quarter", "frame-cutaway", "junction-cutaway", "night-front",
    "night-entry-detail", "silhouette",
  ]);
  assert.ok(zaanTimberMerchantHouseObject.views.find((view) => view.id === "frame-cutaway")?.hiddenGroups?.length);
  assert.ok(zaanTimberMerchantHouseObject.views.find((view) => view.id === "junction-cutaway")?.hiddenGroups?.length);
});
