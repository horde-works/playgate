import assert from "node:assert/strict";
import test from "node:test";
import {
  ATYRAU_BANK_FRAME,
  createAstanaFramework,
  NUR_ALEM_FRAME,
  NUR_ALEM_FRAME_CENTRE,
  OLD_CITY_FRAME,
  OPERA_STUDY_CENTRE,
  OUTER_ROAD_FRAME,
  PEDESTRIAN_PALETTE,
  PEDESTRIAN_STUDY,
  PYRAMID_FRAME,
  STATION_GROUND_GATEWAYS,
} from "../games/make-a-mess/src/content/scenes/astana/astanaFramework.ts";
import {
  BAITEREK_CENTRE,
  NURZHOL_ACROSS_VECTOR,
  NURZHOL_ALONG_VECTOR,
  NUR_ALEM_CENTRE,
  OPERA_CENTRE,
  PYRAMID_CENTRE,
  VIRGIN_LANDS_PALACE_CENTRE,
} from "../games/make-a-mess/src/content/scenes/astana/astanaLayout.ts";
import {
  RING_RADIUS,
  astanaStationById,
  ringPathPoint,
  stationDistance,
} from "../games/make-a-mess/src/content/scenes/astana/astanaPlan.ts";
import { stationApproach } from
  "../games/make-a-mess/src/content/scenes/astana/astanaStation.ts";
import { LAND_BASE_RADIUS } from
  "../games/make-a-mess/src/content/scenes/astana/astanaShell.ts";

const distance = ([x, z]) => Math.hypot(x, z);
const direction = (from, to) => {
  const dx = to[0] - from[0];
  const dz = to[1] - from[1];
  const length = Math.hypot(dx, dz);
  return [dx / length, dz / length];
};
const containsPoint = (points, target, tolerance = 1e-9) => points.some(
  (point) => Math.hypot(point[0] - target[0], point[1] - target[1]) <= tolerance,
);
const luminance = (colour) => {
  const channels = [1, 3, 5].map((offset) => Number.parseInt(
    colour.slice(offset, offset + 2), 16,
  ));
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
};

test("the pedestrian palette is a visible white-to-grey hierarchy", () => {
  assert.equal(PEDESTRIAN_PALETTE.ceremonialWhite, "#ffffff");
  const ordered = [
    PEDESTRIAN_PALETTE.ceremonialWhite,
    PEDESTRIAN_PALETTE.coreStone,
    PEDESTRIAN_PALETTE.civicStone,
    PEDESTRIAN_PALETTE.expoAsphalt,
  ].map(luminance);
  ordered.slice(1).forEach((value, index) => assert.ok(
    ordered[index] - value >= 14,
    "соседние среды должны отличаться визуально",
  ));
  assert.notEqual(PEDESTRIAN_PALETTE.quayGranite, PEDESTRIAN_PALETTE.expoAsphalt);
});

test("the authored paving uses the palette and fills every designed fork", () => {
  const target = {
    id: "test:framework",
    label: "test",
    material: "stone",
    supportMode: "ground",
    objects: [],
  };
  createAstanaFramework(target);
  const pieces = (prefix) => target.objects.filter((piece) => piece.id.startsWith(prefix));

  assert.ok(pieces("pedestrian:baiterek-ring:").every(
    (piece) => piece.color === PEDESTRIAN_PALETTE.ceremonialWhite));
  assert.ok(pieces("pedestrian:opera-ring:").every(
    (piece) => piece.color === PEDESTRIAN_PALETTE.civicStone));
  assert.ok(pieces("pedestrian:expo-orbit:").every(
    (piece) => piece.color === PEDESTRIAN_PALETTE.expoAsphalt
      && piece.material === "asphalt"));
  assert.ok(pieces("pedestrian:quay-south:").every(
    (piece) => piece.color === PEDESTRIAN_PALETTE.quayGranite));

  const plantedBeds = target.objects.filter((piece) =>
    piece.id.includes("island") && piece.id.endsWith(":bed"));
  assert.equal(plantedBeds.length, 8);
  assert.ok(plantedBeds.every((piece) =>
    piece.material === "grass" && piece.shape === "cylinder"));
  assert.ok(new Set(pieces("pedestrian:opera-expo:").map((piece) => piece.color)).size >= 3);
  assert.equal(target.objects.some((piece) => piece.id.includes("pyramid-quay")), false);
});

test("the Pyramid keeps a low mound and three short intentional entrances", () => {
  assert.equal(PYRAMID_FRAME.rays.length, 3);
  assert.deepEqual(PYRAMID_FRAME.mound[0], PYRAMID_FRAME.mound.at(-1));

  const central = PYRAMID_FRAME.rays[0];
  assert.ok(distance(central[0]) < distance(PYRAMID_CENTRE));
  assert.ok(Math.abs(distance(central.at(-1)) - 18.5) < 1e-9);

  const rayDirections = PYRAMID_FRAME.rays.map((ray) => direction(ray[0], ray.at(-1)));
  const faceNormals = [
    NURZHOL_ALONG_VECTOR,
    NURZHOL_ACROSS_VECTOR,
    [-NURZHOL_ACROSS_VECTOR[0], -NURZHOL_ACROSS_VECTOR[1]],
  ];
  rayDirections.forEach((ray, index) => {
    assert.ok(Math.abs(ray[0] - faceNormals[index][0]) < 1e-12);
    assert.ok(Math.abs(ray[1] - faceNormals[index][1]) < 1e-12);
  });
  PYRAMID_FRAME.rays.slice(1).forEach((ray) => assert.ok(
    Math.abs(Math.hypot(ray[1][0] - ray[0][0], ray[1][1] - ray[0][1]) - 11.5) < 1e-9,
    "боковой вход снова превратился во внешний мост",
  ));
});

test("the EXPO approach follows the Baiterek axis and ends at four pavilion plots", () => {
  assert.equal(NUR_ALEM_FRAME.approachHalfWidth * 2, 5.5);
  assert.equal(NUR_ALEM_FRAME.pavilions.length, 4);
  assert.ok(Math.abs(distance(NUR_ALEM_FRAME.approach[0]) - 19.2) < 1e-9);
  assert.ok(Math.abs(Math.hypot(
    NUR_ALEM_FRAME.approach.at(-1)[0] - NUR_ALEM_FRAME_CENTRE[0],
    NUR_ALEM_FRAME.approach.at(-1)[1] - NUR_ALEM_FRAME_CENTRE[1],
  ) - 15) < 1e-9);
  for (const point of NUR_ALEM_FRAME.approach) {
    assert.ok(Math.abs(
      point[0] * NUR_ALEM_CENTRE[1] - point[1] * NUR_ALEM_CENTRE[0],
    ) < 1e-9, "подход Нур Алема сошёл с оси Байтерека");
  }
});

test("the retained planning frames still describe distinct city rooms", () => {
  const oldCityRadii = OLD_CITY_FRAME.boundary.map(distance);
  assert.ok(Math.min(...oldCityRadii) < RING_RADIUS);
  assert.ok(Math.max(...oldCityRadii) > RING_RADIUS);
  assert.equal(OLD_CITY_FRAME.houses.length, 4);

  assert.ok(OUTER_ROAD_FRAME.every((point) => distance(point) > RING_RADIUS + 15));
  assert.ok(OUTER_ROAD_FRAME.every((point) => distance(point) < LAND_BASE_RADIUS - 8));
  assert.deepEqual(OUTER_ROAD_FRAME[0], OUTER_ROAD_FRAME.at(-1));
  assert.deepEqual(ATYRAU_BANK_FRAME.urban[0], ATYRAU_BANK_FRAME.urban.at(-1));
  assert.deepEqual(ATYRAU_BANK_FRAME.park[0], ATYRAU_BANK_FRAME.park.at(-1));

  const operaShift = [
    OPERA_STUDY_CENTRE[0] - OPERA_CENTRE[0],
    OPERA_STUDY_CENTRE[1] - OPERA_CENTRE[1],
  ];
  assert.ok(Math.abs(Math.hypot(...operaShift) - 7) < 1e-9);
});

test("the new dominant routes join Baiterek exactly and leave the LRT stations offset", () => {
  assert.deepEqual(PEDESTRIAN_STUDY.rings.baiterek[0],
    PEDESTRIAN_STUDY.rings.baiterek.at(-1));
  assert.notDeepEqual(PEDESTRIAN_STUDY.rings.khan[0],
    PEDESTRIAN_STUDY.rings.khan.at(-1));
  assert.equal(PEDESTRIAN_STUDY.orbitSegments.expo.length, 1);
  assert.notDeepEqual(PEDESTRIAN_STUDY.orbitSegments.expo[0][0],
    PEDESTRIAN_STUDY.orbitSegments.expo[0].at(-1));
  assert.equal("archExpo" in PEDESTRIAN_STUDY.civicLinks, false);

  const exactBaiterekJoins = [
    PEDESTRIAN_STUDY.civicLinks.khanBaiterekAxis.at(-1),
    PEDESTRIAN_STUDY.civicLinks.pyramidBaiterek.at(-1),
    PEDESTRIAN_STUDY.civicLinks.baiterekExpo[0],
    PEDESTRIAN_STUDY.civicLinks.virginLandsBaiterek.at(-1),
  ];
  exactBaiterekJoins.forEach((point) => assert.ok(
    containsPoint(PEDESTRIAN_STUDY.rings.baiterek, point),
    "осевой маршрут не пришёл в точный узел кольца Байтерека",
  ));

  const palaceStart = PEDESTRIAN_STUDY.civicLinks.virginLandsBaiterek[0];
  assert.ok(Math.hypot(
    palaceStart[0] - VIRGIN_LANDS_PALACE_CENTRE[0],
    palaceStart[1] - VIRGIN_LANDS_PALACE_CENTRE[1],
  ) > 20);
  assert.deepEqual(BAITEREK_CENTRE, [0, 0]);
});

test("all four station forecourts still start at their actual ground portals", () => {
  const stationIds = {
    arena: "astana-arena",
    east: "auezhai",
    west: "nurly-zhol",
    north: "zhibek-zholy",
  };
  const localApproach = stationApproach();
  Object.entries(PEDESTRIAN_STUDY.stationForecourts).forEach(([station, trunk]) => {
    const arms = PEDESTRIAN_STUDY.junctions.stations[station];
    const planStation = astanaStationById[stationIds[station]];
    const ringDistance = stationDistance(planStation.compass);
    const centre = ringPathPoint(ringDistance);
    const ahead = ringPathPoint(ringDistance + 1);
    const behind = ringPathPoint(ringDistance - 1);
    const along = direction(behind, ahead);
    const inward = direction(centre, BAITEREK_CENTRE);
    const expectedPortal = [
      centre[0] + along[0] * localApproach.t + inward[0] * localApproach.w,
      centre[1] + along[1] * localApproach.t + inward[1] * localApproach.w,
    ];
    assert.ok(Math.hypot(
      trunk[0][0] - expectedPortal[0], trunk[0][1] - expectedPortal[1],
    ) < 1e-9);
    assert.deepEqual(trunk[0], STATION_GROUND_GATEWAYS[station].point);
    assert.deepEqual(trunk.at(-1), arms[0][0]);
    assert.deepEqual(trunk.at(-1), arms[1][0]);
  });
});
