import assert from "node:assert/strict";
import test from "node:test";
import {
  RING_RADIUS,
  RING_STRAIGHT_OFFSET,
  astanaAreas,
  astanaBridges,
  astanaStations,
  astanaWays,
  footprintsOverlap,
  renderedAstanaWays,
  insideValley,
  onBridge,
  onSolidGround,
  ringRiverCrossings,
  stationEntranceClearances,
  valleyHalfWidth,
} from "../games/make-a-mess/src/content/scenes/astana/astanaPlan.ts";
import {
  ARCH_BODY_LENGTH,
  ARCH_CENTRE,
  ARCH_YAW,
  ASTANA_TRUE_EAST_VECTOR,
  ASTANA_TRUE_NORTH_VECTOR,
  CAPITAL_AXIS_DIRECTION,
  CIRCUS_CENTRE,
  KHAN_SHATYR_CENTRE,
  KHAN_SHATYR_DISTANCE,
  KHAN_SHATYR_YAW,
  LANDMARK_LRT_CLEARANCES,
  LANDMARK_RADIAL_HALF_EXTENTS,
  LRT_OUTER_DECK_EDGE_RADIUS,
  MUSEUM_CENTRE,
  MEMORY_EXPO_AXIS_DIRECTION,
  NUR_ALEM_CENTRE,
  NUR_ALEM_DISTANCE,
  NURZHOL_ACROSS_VECTOR,
  NURZHOL_ALONG_VECTOR,
  NURZHOL_PLAN_ROTATION,
  OPERA_BODY_DEPTH,
  OPERA_CENTRE,
  OPERA_NURZHOL_ACROSS,
  OPERA_NURZHOL_ALONG,
  OPERA_TO_NURZHOL_DISTANCE,
  OPERA_YAW,
  PYRAMID_CENTRE,
  PYRAMID_DISTANCE,
  PYRAMID_YAW,
  VIRGIN_LANDS_PALACE_CENTRE,
  VIRGIN_LANDS_PALACE_DISTANCE,
} from "../games/make-a-mess/src/content/scenes/astana/astanaLayout.ts";
import {
  DEFERRED_HAZRET_SULTAN_SITE,
  DEFERRED_SCHOOL_PALACE_MASSING_HEIGHT,
  DEFERRED_SCHOOL_PALACE_SITE,
  HAZRET_SULTAN_MINARET_COUNT,
  HAZRET_SULTAN_QIBLA_BEARING_DEGREES,
  HAZRET_SULTAN_QIBLA_SCENE_BEARING_DEGREES,
  HAZRET_SULTAN_QIBLA_VECTOR,
} from "../games/make-a-mess/src/content/scenes/astana/astanaDeferredLandmarks.ts";
import {
  DEFERRED_DOSTYK_BRIDGE_DRAFT,
} from "../games/make-a-mess/src/content/scenes/astana/astanaDeferredInfrastructure.ts";
import {
  LAND_BASE_RADIUS,
  PENINSULA_SHORE_RADII,
  RIVER_BASE_HALF_WIDTH,
  RIVER_WIDTH_SCALE,
  WORLD_RADIUS,
  groundKindAt,
  riverAxisZ,
  riverHalfWidth,
} from "../games/make-a-mess/src/content/scenes/astana/astanaShell.ts";

const wayById = new Map(astanaWays.map((way) => [way.id, way]));
const areaById = new Map(astanaAreas.map((area) => [area.id, area]));

test("every line stays on the island", () => {
  for (const way of astanaWays) {
    for (const [x, z] of way.points) {
      assert.ok(
        onSolidGround(x, z),
        `${way.id}: точка ${x.toFixed(1)}, ${z.toFixed(1)} вне суши`,
      );
    }
  }
});

test("the valley is crossed only by bridges and ramps", () => {
  // Главное правило разметки: долина Есиля — преграда. Тротуар, проспект или
  // дворовый проезд не имеют права идти по пойме и руслу.
  for (const way of astanaWays) {
    if (way.kind === "bridge" || way.kind === "ramp" || way.kind === "promenade") {
      continue;
    }
    for (const [x, z] of way.points) {
      if (!insideValley(x, z)) {
        continue;
      }
      assert.ok(
        onBridge(x, z),
        `${way.id}: точка ${x.toFixed(1)}, ${z.toFixed(1)} лезет в долину мимо моста`,
      );
    }
  }
});

test("bridges span the whole valley, both ends on solid ground", () => {
  // Один городской мост и два пролёта кольца — больше долину пересечь негде.
  assert.equal(astanaBridges.length, 3, "живых мостов должно быть три");
  assert.equal(astanaBridges.filter((bridge) => bridge.onRing).length, 2);

  for (const bridge of astanaBridges) {
    const first = bridge.axis[0];
    const last = bridge.axis[bridge.axis.length - 1];
    // Пролёт начинается и кончается ЗА долиной: опоры не встают в пойму.
    assert.ok(
      !insideValley(first[0], first[1]),
      `${bridge.id}: начало пролёта в пойме`,
    );
    assert.ok(
      !insideValley(last[0], last[1]),
      `${bridge.id}: конец пролёта в пойме`,
    );
    if (!bridge.onRing) {
      assert.ok(wayById.has(`bridge-${bridge.id}`), `у моста ${bridge.id} нет линии`);
      assert.equal(groundKindAt(first[0], first[1]), "land");
      assert.equal(groundKindAt(last[0], last[1]), "land");
    }
  }
});

test("ramps go from the floodplain down to the riverbed", () => {
  const ramps = astanaWays.filter((way) => way.kind === "ramp");
  assert.ok(ramps.length >= 3, `съездов в русло: ${ramps.length}`);
  for (const ramp of ramps) {
    const start = ramp.points[0];
    const end = ramp.points[ramp.points.length - 1];
    assert.notEqual(groundKindAt(start[0], start[1]), "bed", `${ramp.id} начинается в русле`);
    assert.equal(groundKindAt(end[0], end[1]), "bed", `${ramp.id} не доходит до дна`);
  }
});

test("the ring keeps its radius and crosses the river twice", () => {
  const ring = wayById.get("turan-ring");
  assert.ok(ring);
  // Кольцо — четыре дуги радиуса 98 и четыре прямые станционные вставки,
  // которые спрямляют путь внутрь ровно на RING_STRAIGHT_OFFSET.
  for (const [x, z] of ring.points) {
    const radius = Math.hypot(x, z);
    assert.ok(
      radius <= RING_RADIUS + 0.5
        && radius >= RING_RADIUS - RING_STRAIGHT_OFFSET - 0.5,
      `кольцо сбилось с пути: радиус ${radius.toFixed(2)}`,
    );
  }
  assert.ok(
    ring.points.some(
      ([x, z]) => Math.hypot(x, z) < RING_RADIUS - RING_STRAIGHT_OFFSET + 0.3,
    ),
    "на кольце нет ни одной прямой вставки",
  );
  assert.equal(ringRiverCrossings.length, 2, "кольцо обязано переходить реку дважды");
  for (const [x, z] of ringRiverCrossings) {
    assert.equal(groundKindAt(x, z), "bed", `переход кольца ${x}, ${z} не над руслом`);
  }
});

test("four real stations stand at the four compass points", () => {
  assert.equal(astanaStations.length, 4);
  const compass = astanaStations.map((station) => station.compass).sort();
  assert.deepEqual(compass, ["east", "north", "south", "west"]);

  // Каждая станция — на кольце, на суше, и за её причалом свой мир.
  const worlds = new Set();
  for (const station of astanaStations) {
    const [x, z] = station.center;
    // Станция стоит в середине своей прямой вставки: это самая внутренняя
    // точка пути, а не точка окружности.
    assert.ok(
      Math.abs(Math.hypot(x, z) - (RING_RADIUS - RING_STRAIGHT_OFFSET)) < 0.5,
      `${station.id} не в середине станционной вставки`,
    );
    assert.ok(onSolidGround(x, z), `${station.id} стоит не на суше`);
    assert.ok(station.kazakh.length > 0 && station.russian.length > 0);
    worlds.add(station.berthTo);
  }
  assert.equal(worlds.size, 4, "четыре причала должны вести в четыре разных мира");
});

test("the northern station really is across the river", () => {
  // Композиция острова: старый Целиноград отрезан долиной, и попасть к нему
  // можно только мостом — иначе вся идея правого берега рассыпается.
  const north = astanaStations.find((station) => station.compass === "north");
  assert.ok(north.center[1] > riverAxisZ(north.center[0]) + valleyHalfWidth(north.center[0]));
});

test("the whole network is one connected graph", () => {
  // Связность считается по концам линий: разметка, распавшаяся на острова,
  // означает кварталы, в которые житель не дойдёт.
  const nodes = [];
  const nodeOf = (point) => {
    for (const [index, node] of nodes.entries()) {
      if (Math.hypot(node[0] - point[0], node[1] - point[1]) < 3.5) {
        return index;
      }
    }
    nodes.push(point);
    return nodes.length - 1;
  };

  const links = new Map();
  const link = (a, b) => {
    if (!links.has(a)) links.set(a, new Set());
    if (!links.has(b)) links.set(b, new Set());
    links.get(a).add(b);
    links.get(b).add(a);
  };

  for (const way of astanaWays) {
    let previous = null;
    for (const point of way.points) {
      const index = nodeOf(point);
      if (previous !== null && previous !== index) {
        link(previous, index);
      }
      previous = index;
    }
  }

  const seen = new Set([0]);
  const queue = [0];
  while (queue.length > 0) {
    const current = queue.pop();
    for (const next of links.get(current) ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }

  const stranded = nodes
    .map((point, index) => ({ point, index }))
    .filter((entry) => !seen.has(entry.index));
  assert.equal(
    stranded.length,
    0,
    `оторванные узлы: ${stranded
      .slice(0, 5)
      .map((entry) => `${entry.point[0].toFixed(0)},${entry.point[1].toFixed(0)}`)
      .join(" / ")}`,
  );
});

test("legacy road guesses stay in the plan but no longer become geometry", () => {
  assert.ok(astanaWays.some((way) => way.kind === "roadway"),
    "the semantic route draft disappeared instead of being separated from rendering");
  assert.equal(renderedAstanaWays.filter((way) => way.kind === "roadway").length, 0,
    "an unapproved road still produces asphalt or kerbs");
  assert.equal(wayById.get("turan-ring").renderSurface, false,
    "the false road directly under the LRT returned");
  assert.equal(wayById.get("nurzhol-boulevard").renderSurface, false,
    "the old broad boulevard strip returned instead of two walking lanes");
  assert.equal(areaById.get("nurzhol-flower-boulevard").pavingRadius, undefined,
    "the true-azimuth slabs were replaced by a rasterized boulevard");
  assert.equal(renderedAstanaWays.some((way) => way.id === "bridge-dostyk"), false,
    "снятый автомобильный мост вернулся в живую геометрию");
  assert.ok(renderedAstanaWays.some((way) => way.id === "bridge-footbridge"));
});

test("the two landmark axes and deferred mosque reservation are explicit", () => {
  const footbridge = astanaBridges.find((bridge) => bridge.id === "footbridge");
  const atyrauMiddle = footbridge.axis[Math.floor(footbridge.axis.length / 2)];
  assert.ok(Math.abs(atyrauMiddle[0] - 49) < 3,
    "Atyrau left the former Nur Alem river site");
  assert.ok(insideValley(...atyrauMiddle));

  const pyramid = areaById.get("pyramid-plot");
  const cross = Math.abs(
    pyramid.center[0] * KHAN_SHATYR_CENTRE[1]
      - pyramid.center[1] * KHAN_SHATYR_CENTRE[0],
  );
  const normalizedCross = cross
    / (Math.hypot(...pyramid.center) * Math.hypot(...KHAN_SHATYR_CENTRE));
  assert.ok(normalizedCross < 1e-12,
    "Pyramid, Baiterek and Khan Shatyr no longer form one exact diagonal");
  assert.deepEqual(pyramid.center, PYRAMID_CENTRE);
  assert.equal(pyramid.rotation, PYRAMID_YAW);
  assert.equal(pyramid.orientationRule, "orthogonal-to-nurzhol");
  assert.ok(Math.abs(pyramid.rotation - NURZHOL_PLAN_ROTATION - Math.PI / 2) < 1e-12);
  assert.ok(Math.cos(KHAN_SHATYR_YAW) * -KHAN_SHATYR_CENTRE[0]
    + Math.sin(KHAN_SHATYR_YAW) * -KHAN_SHATYR_CENTRE[1] > 0,
  "Khan Shatyr entrance does not point toward Baiterek");
  assert.equal(Math.hypot(...KHAN_SHATYR_CENTRE), KHAN_SHATYR_DISTANCE);
  assert.equal(Math.hypot(...PYRAMID_CENTRE), PYRAMID_DISTANCE);
  assert.ok(KHAN_SHATYR_CENTRE[0] * PYRAMID_CENTRE[0]
    + KHAN_SHATYR_CENTRE[1] * PYRAMID_CENTRE[1] < 0);

  const expoCross = NUR_ALEM_CENTRE[0] * VIRGIN_LANDS_PALACE_CENTRE[1]
    - NUR_ALEM_CENTRE[1] * VIRGIN_LANDS_PALACE_CENTRE[0];
  assert.ok(Math.abs(expoCross) < 1e-12,
    "Nur Alem, Baiterek and the Virgin Lands Palace left their exact diagonal");
  assert.equal(Math.hypot(...NUR_ALEM_CENTRE), NUR_ALEM_DISTANCE);
  assert.equal(Math.hypot(...VIRGIN_LANDS_PALACE_CENTRE),
    VIRGIN_LANDS_PALACE_DISTANCE);
  assert.ok(NUR_ALEM_CENTRE[0] * VIRGIN_LANDS_PALACE_CENTRE[0]
    + NUR_ALEM_CENTRE[1] * VIRGIN_LANDS_PALACE_CENTRE[1] < 0);
  KHAN_SHATYR_CENTRE.forEach((coordinate, index) => assert.ok(Math.abs(
    CAPITAL_AXIS_DIRECTION[index] - coordinate / KHAN_SHATYR_DISTANCE,
  ) < 1e-12));
  NUR_ALEM_CENTRE.forEach((coordinate, index) => assert.ok(Math.abs(
    MEMORY_EXPO_AXIS_DIRECTION[index] - coordinate / NUR_ALEM_DISTANCE,
  ) < 1e-12));

  const profiles = [
    [KHAN_SHATYR_DISTANCE, LANDMARK_RADIAL_HALF_EXTENTS.khan,
      LANDMARK_LRT_CLEARANCES.khan, PENINSULA_SHORE_RADII.khan],
    [PYRAMID_DISTANCE, LANDMARK_RADIAL_HALF_EXTENTS.pyramid,
      LANDMARK_LRT_CLEARANCES.pyramid, PENINSULA_SHORE_RADII.pyramid],
    [NUR_ALEM_DISTANCE, LANDMARK_RADIAL_HALF_EXTENTS.expo,
      LANDMARK_LRT_CLEARANCES.expo, PENINSULA_SHORE_RADII.expo],
    [VIRGIN_LANDS_PALACE_DISTANCE, LANDMARK_RADIAL_HALF_EXTENTS.virginLands,
      LANDMARK_LRT_CLEARANCES.virginLands,
      PENINSULA_SHORE_RADII.virginLands],
  ];
  for (const [distance, halfExtent, clearance, shore] of profiles) {
    assert.ok(Math.abs(
      distance - halfExtent - LRT_OUTER_DECK_EDGE_RADIUS - clearance,
    ) < 1e-12, "принятый чистый разрыв от ЛРТ изменился");
    assert.ok(shore - distance - halfExtent >= 12,
      "за внешней гранью доминанты осталось меньше 12 м земли");
  }

  assert.equal(areaById.has("hazret-sultan-plot"), false,
    "the deferred mosque returned to the live island");
  assert.equal(DEFERRED_HAZRET_SULTAN_SITE.status, "protected-reserve");
  assert.equal(HAZRET_SULTAN_MINARET_COUNT, 4);
  const qibla = HAZRET_SULTAN_QIBLA_BEARING_DEGREES * Math.PI / 180;
  const qiblaEast = HAZRET_SULTAN_QIBLA_VECTOR[0] * ASTANA_TRUE_EAST_VECTOR[0]
    + HAZRET_SULTAN_QIBLA_VECTOR[1] * ASTANA_TRUE_EAST_VECTOR[1];
  const qiblaNorth = HAZRET_SULTAN_QIBLA_VECTOR[0] * ASTANA_TRUE_NORTH_VECTOR[0]
    + HAZRET_SULTAN_QIBLA_VECTOR[1] * ASTANA_TRUE_NORTH_VECTOR[1];
  assert.ok(Math.abs(qiblaEast - Math.sin(qibla)) < 1e-12);
  assert.ok(Math.abs(qiblaNorth - Math.cos(qibla)) < 1e-12);
  assert.ok(Math.abs(HAZRET_SULTAN_QIBLA_SCENE_BEARING_DEGREES - 271.4032400991749)
    < 1e-9, "the protected plot no longer follows the rotated geographic frame");

  assert.equal(areaById.has("school-palace-plot"), false,
    "the deferred Schoolchildren Palace returned to the live island");
  assert.equal(DEFERRED_SCHOOL_PALACE_SITE.id, "school-palace-plot");
  assert.equal(DEFERRED_SCHOOL_PALACE_MASSING_HEIGHT, 4.2);

  assert.equal(areaById.has("atameken-plot"), false);
  assert.equal(areaById.has("expo-podium"), false);
  assert.equal(areaById.get("abu-dhabi-plaza-plot").status, "experimental-reserve");
  assert.deepEqual(areaById.get("abu-dhabi-plaza-plot").center, [-70, 8],
    "Abu Dhabi Plaza left the true south-west LRT environment");
  assert.ok(areaById.has("nur-alem-expo-plot"));
  assert.ok(areaById.has("virgin-lands-palace-plot"));
});

test("places are laid out inside the island and do not sit in the river", () => {
  assert.ok(astanaAreas.length >= 13, `мест размечено: ${astanaAreas.length}`);
  for (const area of astanaAreas) {
    const [x, z] = area.center;
    assert.ok(onSolidGround(x, z), `${area.id} размечен вне суши`);
    if (area.elevated) {
      assert.ok(insideValley(x, z), `${area.id} больше не стоит над Есилем`);
      if (area.pavingRadius) {
        assert.equal(area.surfaceMode, "direct",
          `${area.id}: надречный макет снова попал в наземный растр`);
      }
    } else {
      assert.ok(!insideValley(x, z), `${area.id} стоит в долине реки`);
    }
    const reach = Math.hypot(x, z) + Math.max(area.radius[0], area.radius[1]);
    assert.ok(reach < WORLD_RADIUS - 2, `${area.id} вылезает за кромку`);
  }
});

test("the compressed city keeps human-scale streets", () => {
  // Полная ширина магистралей получается удвоением `width`. Даже главный
  // бульвар здесь не должен съедать пятую часть 224-метрового острова.
  assert.ok(wayById.get("nurzhol-boulevard").width <= 6);
  assert.ok(wayById.get("turan-ring").width <= 3.5);
  for (const id of [
    "avenue-west",
    "avenue-east",
    "avenue-south",
    "avenue-north",
    "mangilik-el",
    "respubliki",
    "kenesary",
  ]) {
    assert.ok(wayById.get(id).width <= 3.75, `${id} снова стал слишком широким`);
  }
});

test("future landmarks keep breathing room instead of sharing one plot", () => {
  // Бульвар намеренно стыкует Байтерек и Хан Шатыр. Все собственно
  // архитектурные пятна получают ещё по метру воздуха с каждой стороны.
  for (let left = 0; left < astanaAreas.length; left += 1) {
    const a = astanaAreas[left];
    if (a.pavingRadius) {
      assert.ok(a.pavingRadius[0] <= a.radius[0] && a.pavingRadius[1] <= a.radius[1],
        `${a.id}: мощение вышло за резерв`);
    }
    for (let right = left + 1; right < astanaAreas.length; right += 1) {
      const b = astanaAreas[right];
      if (a.kind === "public-space" || b.kind === "public-space") continue;
      const pair = `${a.id}|${b.id}`;
      const dx = Math.abs(a.center[0] - b.center[0]);
      const dz = Math.abs(a.center[1] - b.center[1]);
      const separation = (dx / (a.radius[0] + b.radius[0] + 2)) ** 2
        + (dz / (a.radius[1] + b.radius[1] + 2)) ** 2;
      assert.ok(separation >= 1, `${pair}: пятна снова слиплись`);
    }
  }
});

test("the Opera group and north-west landmarks obey their exact composition rules", () => {
  const dot = (point, axis) => point[0] * axis[0] + point[1] * axis[1];
  const opera = areaById.get("opera-plot");
  const arch = areaById.get("arch-square");

  assert.deepEqual(opera.center, OPERA_CENTRE);
  assert.equal(opera.rotation, OPERA_YAW);
  assert.equal(opera.orientationRule, "fronts-nurzhol");
  assert.equal(OPERA_BODY_DEPTH, 14);
  assert.equal(OPERA_NURZHOL_ACROSS, -32.5,
    "Опера больше не отодвинута на один полный корпус");
  assert.ok(Math.abs(dot(opera.center, NURZHOL_ALONG_VECTOR) - OPERA_NURZHOL_ALONG) < 1e-12);
  assert.ok(Math.abs(dot(opera.center, NURZHOL_ACROSS_VECTOR) - OPERA_NURZHOL_ACROSS) < 1e-12);

  assert.deepEqual(arch.center, ARCH_CENTRE);
  assert.equal(arch.rotation, ARCH_YAW);
  assert.equal(arch.orientationRule, "opera-forecourt");
  const operaToArch = [
    arch.center[0] - opera.center[0],
    arch.center[1] - opera.center[1],
  ];
  assert.ok(Math.abs(dot(operaToArch, NURZHOL_ACROSS_VECTOR)) < 1e-12,
    "Арка ушла с фасадной линии Оперы");
  assert.ok(Math.abs(dot(operaToArch, NURZHOL_ALONG_VECTOR)
    + OPERA_TO_NURZHOL_DISTANCE + ARCH_BODY_LENGTH) < 1e-12,
  "Арка больше не стоит справа в утверждённом верхнем виде");
  assert.ok(Math.abs(
    Math.hypot(...operaToArch) - OPERA_TO_NURZHOL_DISTANCE - ARCH_BODY_LENGTH,
  ) < 1e-12, "Арка не отодвинута на один полный корпус");

  const circus = areaById.get("circus-plot");
  const museum = areaById.get("museum-plot");
  assert.deepEqual(circus.center, CIRCUS_CENTRE);
  assert.deepEqual(museum.center, MUSEUM_CENTRE);
  assert.equal(circus.orientationRule, "composition-tangent");
  assert.equal(museum.orientationRule, "composition-tangent");

  const plaza = areaById.get("abu-dhabi-plaza-plot");
  const westEntrance = stationEntranceClearances.find((entry) =>
    entry.stationId === "nurly-zhol");
  assert.equal(plaza.orientationRule, "parallel-to-lrt-platform");
  assert.ok(Math.abs(plaza.rotation - westEntrance.rotation) < 1e-12,
    "Plaza is no longer strictly parallel to the LRT platform");
  const plazaBank = riverAxisZ(plaza.center[0]) - valleyHalfWidth(plaza.center[0]);
  assert.ok(plaza.center[1] < plazaBank && plazaBank - plaza.center[1] < 10,
    "Plaza is no longer seated immediately before the Esil bank");
  assert.ok(Math.hypot(...plaza.center) > 68,
    "Plaza drifted away from the LRT platform instead of toward it");

  const nurAlem = areaById.get("nur-alem-expo-plot");
  assert.equal(nurAlem.orientationRule, "composition-tangent");
  assert.equal(nurAlem.elevated, undefined);
  assert.deepEqual(nurAlem.center, NUR_ALEM_CENTRE);
  assert.equal(nurAlem.radius[0], nurAlem.radius[1],
    "круглое основание сферы снова стало эллипсом");
  assert.ok(!insideValley(...nurAlem.center));
  assert.equal(areaById.has("nur-alem-bridge-corridor"), false);

  const virginLands = areaById.get("virgin-lands-palace-plot");
  assert.deepEqual(virginLands.center, VIRGIN_LANDS_PALACE_CENTRE);
  assert.equal(virginLands.status, "primary-reserve");
  assert.equal(virginLands.elevated, undefined);
  assert.ok(!insideValley(...virginLands.center));
});

test("landmark plots leave all four LRT entrance portals unobstructed", () => {
  assert.equal(stationEntranceClearances.length, 4);
  const architecture = astanaAreas.filter((area) =>
    area.kind !== "public-space" && area.status !== "ensemble");
  for (const area of architecture) {
    for (const entrance of stationEntranceClearances) {
      assert.equal(
        footprintsOverlap(area, entrance, 2),
        false,
        `${area.id} перекрывает свободный вход станции ${entrance.stationId}`,
      );
    }
  }
});

test("future building envelopes do not overlap the existing bridges", () => {
  const architecture = astanaAreas.filter((area) =>
    area.kind !== "public-space"
      && area.status !== "ensemble"
      && area.id !== "khan-shatyr-plot");
  for (const area of architecture) {
    for (const bridge of astanaBridges.filter((entry) => !entry.onRing)) {
      for (let segment = 1; segment < bridge.axis.length; segment += 1) {
        const from = bridge.axis[segment - 1];
        const to = bridge.axis[segment];
        const dx = to[0] - from[0];
        const dz = to[1] - from[1];
        const span = Math.hypot(dx, dz);
        const bridgeEnvelope = {
          center: [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2],
          radius: [span / 2, bridge.halfWidth],
          rotation: Math.atan2(dz, dx),
        };
        assert.equal(
          footprintsOverlap(area, bridgeEnvelope, 2),
          false,
          `${area.id} упирается в существующий мост ${bridge.id}`,
        );
      }
    }
  }
});

test("the Esil bed is compressed but its terraces and bridges remain legible", () => {
  assert.equal(RIVER_WIDTH_SCALE, 0.7);
  assert.ok(Math.abs(RIVER_BASE_HALF_WIDTH - 5.95) < 1e-12);
  const widths = [-80, -40, 0, 40, 80].map((x) => riverHalfWidth(x) * 2);
  assert.ok(Math.min(...widths) >= 10);
  assert.ok(Math.max(...widths) <= 14.5);
  assert.equal(riverAxisZ(0), 34);
  assert.ok(Math.abs(riverAxisZ(LAND_BASE_RADIUS) - riverAxisZ(0) - 5.1) < 1e-12,
    "краевые изгибы Есиля больше не дают согласованные 15%");
  assert.equal(riverAxisZ(LAND_BASE_RADIUS * 0.5), riverAxisZ(0),
    "изгиб края снова превратился во вмятину по всей длине реки");

  assert.equal(astanaBridges.some((bridge) => bridge.id === "dostyk"), false,
    "снятый автомобильный мост остался в списке живых мостов");
  assert.equal(DEFERRED_DOSTYK_BRIDGE_DRAFT.status, "deferred");
  assert.equal(DEFERRED_DOSTYK_BRIDGE_DRAFT.forVehicles, true);
  assert.equal(DEFERRED_DOSTYK_BRIDGE_DRAFT.lateralOffsets.length, 13,
    "последняя геометрия автомобильного моста не сохранена полностью");
  assert.equal(wayById.get("atyrau-link-south").renderSurface, false);
  assert.equal(wayById.get("atyrau-link-north").renderSurface, false);
});
