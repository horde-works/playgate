import assert from "node:assert/strict";
import test from "node:test";
import {
  ATYRAU_BANK_FRAME,
  NUR_ALEM_FRAME,
  NUR_ALEM_FRAME_CENTRE,
  OLD_CITY_FRAME,
  OPERA_STUDY_CENTRE,
  OUTER_ROAD_FRAME,
  PEDESTRIAN_STUDY,
  PYRAMID_FRAME,
} from "../games/make-a-mess/src/content/scenes/astana/astanaFramework.ts";
import {
  ARCH_CENTRE,
  NURZHOL_ACROSS_VECTOR,
  NURZHOL_ALONG_VECTOR,
  OPERA_CENTRE,
  PYRAMID_CENTRE,
} from "../games/make-a-mess/src/content/scenes/astana/astanaLayout.ts";
import { RING_RADIUS } from
  "../games/make-a-mess/src/content/scenes/astana/astanaPlan.ts";
import { LAND_BASE_RADIUS } from
  "../games/make-a-mess/src/content/scenes/astana/astanaShell.ts";

const distance = ([x, z]) => Math.hypot(x, z);
const direction = (from, to) => {
  const dx = to[0] - from[0];
  const dz = to[1] - from[1];
  const length = Math.hypot(dx, dz);
  return [dx / length, dz / length];
};

test("the Pyramid framework is one podium with exactly three intentional rays", () => {
  assert.equal(PYRAMID_FRAME.rays.length, 3);
  assert.deepEqual(PYRAMID_FRAME.podium[0], PYRAMID_FRAME.podium.at(-1));

  const central = PYRAMID_FRAME.rays[0];
  assert.ok(distance(central[0]) < distance(PYRAMID_CENTRE));
  assert.ok(Math.abs(distance(central.at(-1)) - 18.5) < 1e-9,
    "центральный луч должен остановиться у партера, а не пройти сквозь Байтерек");

  const rayDirections = PYRAMID_FRAME.rays.map((ray) => direction(ray[0], ray.at(-1)));
  const faceNormals = [
    NURZHOL_ALONG_VECTOR,
    NURZHOL_ACROSS_VECTOR,
    [-NURZHOL_ACROSS_VECTOR[0], -NURZHOL_ACROSS_VECTOR[1]],
  ];
  rayDirections.forEach((ray, index) => {
    const normal = faceNormals[index];
    assert.ok(Math.abs(ray[0] - normal[0]) < 1e-12
      && Math.abs(ray[1] - normal[1]) < 1e-12,
    `луч ${index} вышел из грани не по нормали`);
  });

  for (const ray of PYRAMID_FRAME.rays.slice(1)) {
    assert.ok(Math.abs(distance(ray.at(-1)) - (LAND_BASE_RADIUS - 6)) < 1e-9,
      "боковой луч не дошёл до честной кромки будущего внешнего моста");
  }
});

test("the EXPO approach passes through the Arch and ends at four low pavilion plots", () => {
  assert.deepEqual(NUR_ALEM_FRAME.approach[1], ARCH_CENTRE);
  assert.equal(NUR_ALEM_FRAME.approachHalfWidth * 2, 5.5);
  assert.equal(NUR_ALEM_FRAME.pavilions.length, 4);
  assert.ok(Math.abs(Math.hypot(
    NUR_ALEM_FRAME.approach.at(-1)[0] - NUR_ALEM_FRAME_CENTRE[0],
    NUR_ALEM_FRAME.approach.at(-1)[1] - NUR_ALEM_FRAME_CENTRE[1],
  ) - 15) < 1e-9);
});

test("the old-city court straddles the LRT ring instead of becoming an inner landmark", () => {
  const radii = OLD_CITY_FRAME.boundary.map(distance);
  assert.ok(Math.min(...radii) < RING_RADIUS);
  assert.ok(Math.max(...radii) > RING_RADIUS);
  assert.equal(OLD_CITY_FRAME.houses.length, 4);
});

test("the outer road and Atyrau bank rooms remain separate planning frames", () => {
  assert.ok(OUTER_ROAD_FRAME.every((point) => distance(point) > RING_RADIUS + 15));
  assert.ok(OUTER_ROAD_FRAME.every((point) => distance(point) < LAND_BASE_RADIUS - 8));
  assert.deepEqual(OUTER_ROAD_FRAME[0], OUTER_ROAD_FRAME.at(-1));
  assert.deepEqual(ATYRAU_BANK_FRAME.urban[0], ATYRAU_BANK_FRAME.urban.at(-1));
  assert.deepEqual(ATYRAU_BANK_FRAME.park[0], ATYRAU_BANK_FRAME.park.at(-1));
  assert.deepEqual(
    ATYRAU_BANK_FRAME.pier.landing[0],
    ATYRAU_BANK_FRAME.pier.landing.at(-1),
  );
});

test("the pedestrian study is a necklace of closed loops and tangent links", () => {
  for (const ring of Object.values(PEDESTRIAN_STUDY.rings)) {
    assert.deepEqual(ring[0], ring.at(-1), "каждое общественное пространство замкнуто");
  }
  assert.equal(PEDESTRIAN_STUDY.atyrauParks.length, 2);
  assert.ok(PEDESTRIAN_STUDY.quays.south.length > 40);
  assert.ok(PEDESTRIAN_STUDY.quays.north.length > 40);

  const operaShift = [
    OPERA_STUDY_CENTRE[0] - OPERA_CENTRE[0],
    OPERA_STUDY_CENTRE[1] - OPERA_CENTRE[1],
  ];
  assert.ok(Math.abs(Math.hypot(...operaShift) - 7) < 1e-9);
  assert.ok(operaShift[0] * NURZHOL_ACROSS_VECTOR[0]
    + operaShift[1] * NURZHOL_ACROSS_VECTOR[1] > 0,
  "Опера должна подойти к Нуржолу, а не отступить ещё дальше");

  assert.ok(PEDESTRIAN_STUDY.rings.expo.every(
    (point) => distance(point) < RING_RADIUS,
  ), "выставочное кольцо не должно упираться в ЛРТ");
});
