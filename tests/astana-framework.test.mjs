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
  ARCH_CENTRE,
  NURZHOL_ACROSS_VECTOR,
  NURZHOL_ALONG_VECTOR,
  OPERA_CENTRE,
  PYRAMID_CENTRE,
} from "../games/make-a-mess/src/content/scenes/astana/astanaLayout.ts";
import {
  RING_RADIUS,
  astanaStationById,
  ringPathPoint,
  stationDistance,
} from
  "../games/make-a-mess/src/content/scenes/astana/astanaPlan.ts";
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
const strictSegmentIntersection = (a, b, c, d) => {
  const ab = [b[0] - a[0], b[1] - a[1]];
  const cd = [d[0] - c[0], d[1] - c[1]];
  const denominator = ab[0] * cd[1] - ab[1] * cd[0];
  if (Math.abs(denominator) < 1e-9) return false;
  const ac = [c[0] - a[0], c[1] - a[1]];
  const alongAB = (ac[0] * cd[1] - ac[1] * cd[0]) / denominator;
  const alongCD = (ac[0] * ab[1] - ac[1] * ab[0]) / denominator;
  return alongAB > 1e-5 && alongAB < 1 - 1e-5
    && alongCD > 1e-5 && alongCD < 1 - 1e-5;
};
const toNurzhol = (point) => [
  point[0] * NURZHOL_ALONG_VECTOR[0] + point[1] * NURZHOL_ALONG_VECTOR[1],
  point[0] * NURZHOL_ACROSS_VECTOR[0] + point[1] * NURZHOL_ACROSS_VECTOR[1],
];

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
    "соседние среды должны отличаться визуально, а не только названием",
  ));
  assert.notEqual(PEDESTRIAN_PALETTE.quayGranite, PEDESTRIAN_PALETTE.expoAsphalt,
    "набережная не должна выглядеть продолжением асфальта Нур Алема");
});

test("the authored paving actually uses the palette instead of one grey fallback", () => {
  const target = {
    id: "test:framework",
    label: "test",
    material: "stone",
    supportMode: "ground",
    objects: [],
  };
  createAstanaFramework(target);
  const pieces = (prefix) => target.objects.filter((piece) => piece.id.startsWith(prefix));

  const baiterek = pieces("pedestrian:baiterek-ring:");
  const opera = pieces("pedestrian:opera-ring:");
  const expo = pieces("pedestrian:expo-orbit:");
  const quay = pieces("pedestrian:quay-south:");
  const plantedBeds = target.objects.filter((piece) =>
    piece.id.includes("island") && piece.id.endsWith(":bed"));
  assert.ok(baiterek.length > 0 && baiterek.every(
    (piece) => piece.color === PEDESTRIAN_PALETTE.ceremonialWhite,
  ), "кольцо Байтерека должно быть действительно белым в объектах сцены");
  assert.ok(opera.length > 0 && opera.every(
    (piece) => piece.color === PEDESTRIAN_PALETTE.civicStone,
  ));
  assert.ok(expo.length > 0 && expo.every(
    (piece) => piece.color === PEDESTRIAN_PALETTE.expoAsphalt
      && piece.material === "asphalt",
  ), "кольцо Нур Алема должно быть серым асфальтом, а не перекрашенным камнем");
  assert.ok(quay.length > 0 && quay.every(
    (piece) => piece.color === PEDESTRIAN_PALETTE.quayGranite,
  ));
  assert.equal(plantedBeds.length, 10,
    "каждая спроектированная развилка должна получить заполненный остров, не пустую обводку");
  assert.ok(plantedBeds.every((piece) =>
    piece.material === "grass" && piece.shape === "cylinder"),
  "острова должны быть настоящими овальными посадками");

  const transition = pieces("pedestrian:opera-expo:");
  assert.ok(new Set(transition.map((piece) => piece.color)).size >= 3,
    "локальный стык зон должен иметь промежуточный цвет, а не резкий шов");
});

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

test("the pedestrian study uses open necklaces, gated orbits and exact movement nodes", () => {
  assert.deepEqual(PEDESTRIAN_STUDY.rings.baiterek[0],
    PEDESTRIAN_STUDY.rings.baiterek.at(-1), "кольцо Байтерека остаётся цельным");
  assert.deepEqual(PEDESTRIAN_STUDY.rings.arch[0],
    PEDESTRIAN_STUDY.rings.arch.at(-1), "площадь Арки остаётся цельной");
  assert.notDeepEqual(PEDESTRIAN_STUDY.rings.khan[0],
    PEDESTRIAN_STUDY.rings.khan.at(-1), "кольцо Хан Шатыра раскрывается к Байтереку");
  assert.notDeepEqual(PEDESTRIAN_STUDY.rings.opera[0],
    PEDESTRIAN_STUDY.rings.opera.at(-1), "перед Оперой нужен открытый U-образный двор");
  assert.equal(PEDESTRIAN_STUDY.orbitSegments.expo.length, 3,
    "у Нур Алема должно быть три прохода, а не замкнутый круг");
  PEDESTRIAN_STUDY.rings.baiterek.forEach((point) => assert.ok(
    Math.abs(distance(point) - 19.2) < 1e-9,
    "каждый узел кольца Байтерека, включая примыкания, обязан лежать на одном радиусе",
  ));
  assert.equal(PEDESTRIAN_STUDY.civicLinks.pyramidBaiterek.length, 2,
    "белая ось Пирамиды не должна проходить кольцо и возвращаться назад");
  assert.equal("atyrauParks" in PEDESTRIAN_STUDY, false,
    "Атырау должен раскрывать маршруты дельтой, а не четырьмя декоративными петлями");
  assert.equal("archPyramid" in PEDESTRIAN_STUDY.civicLinks, false,
    "Арка относится к оси Нур Алема и не должна давать случайный диагональный луч");
  PEDESTRIAN_STUDY.orbitSegments.expo.forEach((segment) => assert.notDeepEqual(
    segment[0], segment.at(-1), "часть орбиты между воротами должна оставаться открытой",
  ));
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

  const exactJoins = [
    [PEDESTRIAN_STUDY.civicLinks.khanBaiterekAxis, "end", "baiterek"],
    [PEDESTRIAN_STUDY.civicLinks.khanOpera, "start", "khan"],
    [PEDESTRIAN_STUDY.civicLinks.khanOpera, "end", "opera"],
    [PEDESTRIAN_STUDY.civicLinks.khanEastStation, "start", "khan"],
    [PEDESTRIAN_STUDY.civicLinks.operaBaiterek, "end", "baiterek"],
    [PEDESTRIAN_STUDY.civicLinks.operaExpo, "start", "opera"],
    [PEDESTRIAN_STUDY.civicLinks.baiterekArch, "start", "baiterek"],
    [PEDESTRIAN_STUDY.civicLinks.baiterekArch, "end", "arch"],
    [PEDESTRIAN_STUDY.civicLinks.archExpo, "start", "arch"],
    [PEDESTRIAN_STUDY.civicLinks.pyramidBaiterek, "end", "baiterek"],
    [PEDESTRIAN_STUDY.civicLinks.atyrauKhan, "end", "khan"],
    [PEDESTRIAN_STUDY.civicLinks.atyrauBaiterek, "end", "baiterek"],
  ];
  for (const [link, endpoint, ring] of exactJoins) {
    const point = endpoint === "start" ? link[0] : link.at(-1);
    assert.ok(containsPoint(PEDESTRIAN_STUDY.rings[ring], point),
      `${endpoint} дорожки должен быть тем же узлом, что и контур ${ring}`);
  }

  const openGateChecks = [
    [PEDESTRIAN_STUDY.junctions.khanAxis,
      PEDESTRIAN_STUDY.civicLinks.khanBaiterekAxis[0], "khan"],
    [PEDESTRIAN_STUDY.junctions.operaForecourt,
      PEDESTRIAN_STUDY.civicLinks.operaBaiterek[0], "opera"],
  ];
  openGateChecks.forEach(([arms, split, ring]) => {
    arms.forEach((arm) => {
      assert.deepEqual(arm[0], split, "оба рукава должны начинаться в одной горловине");
      assert.ok(containsPoint(PEDESTRIAN_STUDY.rings[ring], arm.at(-1)),
        "рукав должен касаться реального конца открытого ожерелья");
    });
  });

  const expoPoints = PEDESTRIAN_STUDY.orbitSegments.expo.flat();
  const expoGateChecks = [
    [PEDESTRIAN_STUDY.junctions.expo.arch,
      PEDESTRIAN_STUDY.civicLinks.archExpo.at(-1)],
    [PEDESTRIAN_STUDY.junctions.expo.arena,
      PEDESTRIAN_STUDY.civicLinks.expoArena[0]],
    [PEDESTRIAN_STUDY.junctions.expo.west,
      PEDESTRIAN_STUDY.civicLinks.expoWestStation[0]],
  ];
  expoGateChecks.forEach(([arms, split]) => arms.forEach((arm) => {
    assert.deepEqual(arm[0], split, "развилка Нур Алема должна иметь общий ствол");
    assert.ok(containsPoint(expoPoints, arm.at(-1)),
      "каждый рукав должен касаться видимого конца орбиты, а не середины разрыва");
  }));
  assert.deepEqual(
    PEDESTRIAN_STUDY.civicLinks.operaExpo.at(-1),
    PEDESTRIAN_STUDY.civicLinks.archExpo.at(-1),
    "Опера должна входить в общий предэксповский двор, не создавать четвёртые ворота",
  );

  assert.ok(containsPoint(
    PEDESTRIAN_STUDY.quays.north,
    PEDESTRIAN_STUDY.civicLinks.pyramidNorthQuayConnector.at(-1),
  ), "северная лестница Пирамиды должна стать узлом северной набережной");
  assert.deepEqual(
    PEDESTRIAN_STUDY.civicLinks.pyramidNorthQuay.at(-1),
    PEDESTRIAN_STUDY.civicLinks.pyramidNorthQuayConnector[0],
  );
  assert.ok(containsPoint(
    PEDESTRIAN_STUDY.quays.south,
    PEDESTRIAN_STUDY.civicLinks.pyramidSouthQuayConnector.at(-1),
  ), "южная лестница Пирамиды должна стать узлом южной набережной");
  assert.deepEqual(
    PEDESTRIAN_STUDY.civicLinks.pyramidSouthQuay.at(-1),
    PEDESTRIAN_STUDY.civicLinks.pyramidSouthQuayConnector[0],
  );
  assert.ok(containsPoint(
    PEDESTRIAN_STUDY.quays.south,
    PEDESTRIAN_STUDY.civicLinks.atyrauSouthQuayConnector.at(-1),
  ), "южная горловина Атырау должна быть узлом набережной");
  const atyrauFan = PEDESTRIAN_STUDY.junctions.atyrauSouth;
  assert.deepEqual(atyrauFan[0][0], PEDESTRIAN_STUDY.civicLinks.atyrauSouthQuayConnector[0],
    "веер должен начинаться в точной посадочной точке моста");
  assert.deepEqual(atyrauFan[0][0], atyrauFan[1][0]);
  assert.deepEqual(atyrauFan[0].at(-1), atyrauFan[1].at(-1));
  assert.deepEqual(PEDESTRIAN_STUDY.civicLinks.atyrauKhan[0], atyrauFan[0].at(-1),
    "осевой маршрут к Хан Шатыру должен выходить из нижней вершины веера");
  assert.ok(containsPoint(atyrauFan[0], PEDESTRIAN_STUDY.civicLinks.atyrauBaiterek[0]),
    "маршрут к Байтереку должен иметь отдельную левую горловину");
  assert.ok(containsPoint(atyrauFan[1], PEDESTRIAN_STUDY.civicLinks.eastAtyrau.at(-1)),
    "маршрут к восточной станции должен иметь отдельную правую горловину");
  assert.deepEqual(
    PEDESTRIAN_STUDY.junctionIslands.atyrauSouth[0],
    PEDESTRIAN_STUDY.junctionIslands.atyrauSouth.at(-1),
    "остров веера должен быть замкнут",
  );
  assert.ok(containsPoint(
    PEDESTRIAN_STUDY.quays.north,
    PEDESTRIAN_STUDY.civicLinks.atyrauNorthQuayConnector.at(-1),
  ), "северная горловина Атырау должна быть узлом набережной");
  assert.deepEqual(
    PEDESTRIAN_STUDY.civicLinks.atyrauOuter[0],
    PEDESTRIAN_STUDY.civicLinks.atyrauNorthQuayConnector[0],
  );
  for (const quay of Object.values(PEDESTRIAN_STUDY.quays)) {
    const spans = quay.slice(1).map((point, index) => Math.hypot(
      point[0] - quay[index][0], point[1] - quay[index][1],
    ));
    assert.ok(Math.max(...spans) < 5,
      "основная набережная должна оставаться плавной, без диагональных выбросов к зданиям");
  }

  const stationConnections = {
    arena: [
      PEDESTRIAN_STUDY.civicLinks.operaArena.at(-1),
      PEDESTRIAN_STUDY.civicLinks.expoArena.at(-1),
    ],
    east: [
      PEDESTRIAN_STUDY.civicLinks.khanEastStation.at(-1),
      PEDESTRIAN_STUDY.civicLinks.eastAtyrau[0],
    ],
    west: [
      PEDESTRIAN_STUDY.civicLinks.expoWestStation.at(-1),
      PEDESTRIAN_STUDY.civicLinks.westPyramid[0],
    ],
    north: [
      PEDESTRIAN_STUDY.civicLinks.atyrauOuter.at(-1),
      PEDESTRIAN_STUDY.civicLinks.northPyramid[0],
    ],
  };
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
    const inward = direction(centre, [0, 0]);
    const expectedPortal = [
      centre[0] + along[0] * localApproach.t + inward[0] * localApproach.w,
      centre[1] + along[1] * localApproach.t + inward[1] * localApproach.w,
    ];
    assert.ok(Math.hypot(
      trunk[0][0] - expectedPortal[0], trunk[0][1] - expectedPortal[1],
    ) < 1e-9, "преддворье должно начинаться снаружи настоящего наземного портала");
    assert.deepEqual(trunk[0], STATION_GROUND_GATEWAYS[station].point);
    const thresholdDirection = direction(trunk[0], trunk.at(-1));
    assert.ok(
      thresholdDirection[0] * inward[0] + thresholdDirection[1] * inward[1] > 0.999,
      "порог должен продолжать ось входного рукава, а не условный радиус от его конца",
    );
    assert.deepEqual(trunk.at(-1), arms[0][0]);
    assert.deepEqual(trunk.at(-1), arms[1][0]);
    stationConnections[station].forEach((connection, index) => assert.deepEqual(
      connection,
      arms[index].at(-1),
      "оба городских маршрута должны начинаться на разных концах вокзального веера",
    ));
  });

  const archEntry = PEDESTRIAN_STUDY.civicLinks.baiterekArch.at(-1);
  const archExit = PEDESTRIAN_STUDY.civicLinks.archExpo[0];
  assert.ok(Math.hypot(
    (archEntry[0] + archExit[0]) / 2 - ARCH_CENTRE[0],
    (archEntry[1] + archExit[1]) / 2 - ARCH_CENTRE[1],
  ) < 1e-9, "дорога через Арку должна идти по её точной продольной оси");

  const opera = toNurzhol(OPERA_CENTRE);
  const clearances = PEDESTRIAN_STUDY.rings.opera.map((point) => {
    const local = toNurzhol(point);
    const along = Math.max(0, Math.abs(local[0] - opera[0]) - 12);
    const across = Math.max(0, Math.abs(local[1] - opera[1]) - 8);
    return Math.hypot(along, across);
  });
  assert.ok(Math.min(...clearances) > 3,
    "ожерелье Оперы не должно касаться даже проверочного пятна корпуса");

  const movementPaths = [
    ...Object.entries(PEDESTRIAN_STUDY.civicLinks),
    ...Object.entries(PEDESTRIAN_STUDY.rings)
      .filter(([name]) => name !== "expo")
      .map(([name, points]) => [`ring:${name}`, points]),
    ...PEDESTRIAN_STUDY.orbitSegments.expo
      .map((points, index) => [`expo:${index}`, points]),
    ...PEDESTRIAN_STUDY.junctions.khanAxis
      .map((points, index) => [`khan-gate:${index}`, points]),
    ...PEDESTRIAN_STUDY.junctions.operaForecourt
      .map((points, index) => [`opera-gate:${index}`, points]),
    ...PEDESTRIAN_STUDY.junctions.atyrauSouth
      .map((points, index) => [`atyrau-fan:${index}`, points]),
    ...Object.entries(PEDESTRIAN_STUDY.stationForecourts)
      .map(([name, points]) => [`station-threshold:${name}`, points]),
    ...Object.entries(PEDESTRIAN_STUDY.junctions.stations).flatMap(([station, arms]) =>
      arms.map((points, index) => [`station-gate:${station}:${index}`, points])),
    ...Object.entries(PEDESTRIAN_STUDY.junctions.expo).flatMap(([gate, arms]) =>
      arms.map((points, index) => [`expo-gate:${gate}:${index}`, points])),
  ];
  const accidentalCrossings = [];
  movementPaths.forEach(([leftName, left], leftIndex) => {
    movementPaths.slice(leftIndex + 1).forEach(([rightName, right]) => {
      left.slice(1).forEach((point, segment) => {
        right.slice(1).forEach((rightPoint, rightSegment) => {
          if (strictSegmentIntersection(
            left[segment], point, right[rightSegment], rightPoint,
          )) accidentalCrossings.push(`${leftName} × ${rightName}`);
        });
      });
    });
  });
  assert.deepEqual(accidentalCrossings, [],
    "маршруты могут сходиться только в спроектированных узлах, не прорезать друг друга");
});
