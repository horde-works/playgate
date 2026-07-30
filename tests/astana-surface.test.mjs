import assert from "node:assert/strict";
import test from "node:test";
import {
  ATYRAU_FACADE_MODULE,
  ATYRAU_CASSETTE_PARTS,
  ATYRAU_LIGHT_COLOR,
  ATYRAU_LIGHT_COUNT,
  ATYRAU_LIGHT_GROUP,
  ATYRAU_LIGHT_TEMPERATURE_K,
  ATYRAU_LIGHT_TRANSITION,
  ATYRAU_MIN_CROWN_HALF_GAP,
  ATYRAU_RAIL_HEIGHT,
  ATYRAU_SHELL_LENGTH,
  ATYRAU_SHELL_LEVELS,
  ATYRAU_SHELL_STATIONS,
  atyrauDeckColourAt,
  atyrauNodeId,
  createAtyrauShellTopology,
} from "../games/make-a-mess/src/content/scenes/astana/astanaAtyrau.ts";
import { astanaScene } from "../games/make-a-mess/src/game/astanaScene.ts";

const surfacePieces = astanaScene.breakablePieces.filter((piece) => {
  const rotation = piece.rotation ?? [0, 0, 0];
  return /astana:(terrain-surface|city-roads|city-paving|city-parterre|city-site-markers):/.test(piece.id)
    && piece.shape === "groundTile"
    && Math.abs(rotation[0]) < 1e-8
    && Math.abs(rotation[2]) < 1e-8;
});

const footprint = (piece) => {
  const yaw = (piece.rotation ?? [0, 0, 0])[1];
  const cosine = Math.cos(yaw);
  const sine = Math.sin(yaw);
  const halfX = piece.size[0] / 2;
  const halfZ = piece.size[2] / 2;
  return [
    [-halfX, -halfZ],
    [halfX, -halfZ],
    [halfX, halfZ],
    [-halfX, halfZ],
  ].map(([x, z]) => [
    piece.position[0] + cosine * x + sine * z,
    piece.position[2] - sine * x + cosine * z,
  ]);
};

const polygonArea = (polygon) => Math.abs(polygon.reduce((sum, point, index) => {
  const next = polygon[(index + 1) % polygon.length];
  return sum + point[0] * next[1] - next[0] * point[1];
}, 0)) / 2;

const intersection = (subject, clip) => {
  let output = subject;
  for (let edge = 0; edge < clip.length; edge += 1) {
    const edgeFrom = clip[edge];
    const edgeTo = clip[(edge + 1) % clip.length];
    const input = output;
    output = [];
    const inside = (point) =>
      (edgeTo[0] - edgeFrom[0]) * (point[1] - edgeFrom[1])
        - (edgeTo[1] - edgeFrom[1]) * (point[0] - edgeFrom[0]) >= -1e-8;
    const crossing = (from, to) => {
      const rx = to[0] - from[0];
      const rz = to[1] - from[1];
      const sx = edgeTo[0] - edgeFrom[0];
      const sz = edgeTo[1] - edgeFrom[1];
      const denominator = rx * sz - rz * sx;
      if (Math.abs(denominator) < 1e-9) {
        return to;
      }
      const amount = ((edgeFrom[0] - from[0]) * sz
        - (edgeFrom[1] - from[1]) * sx) / denominator;
      return [from[0] + amount * rx, from[1] + amount * rz];
    };
    for (let index = 0; index < input.length; index += 1) {
      const from = input[index];
      const to = input[(index + 1) % input.length];
      const fromInside = inside(from);
      const toInside = inside(to);
      if (fromInside && toInside) {
        output.push(to);
      } else if (fromInside) {
        output.push(crossing(from, to));
      } else if (toInside) {
        output.push(crossing(from, to), to);
      }
    }
    if (output.length === 0) {
      break;
    }
  }
  return output;
};

test("ground, roads and paving have no overlapping near-coplanar top faces", () => {
  const byCentimetre = new Map();
  const collisions = [];
  for (const piece of surfacePieces) {
    const top = piece.position[1] + piece.size[1] / 2;
    const centimetre = Math.round(top * 100);
    for (let bucket = centimetre - 3; bucket <= centimetre + 3; bucket += 1) {
      for (const peer of byCentimetre.get(bucket) ?? []) {
        const peerTop = peer.position[1] + peer.size[1] / 2;
        if (Math.abs(top - peerTop) > 0.035) continue;
        const overlap = intersection(footprint(piece), footprint(peer));
        if (overlap.length >= 3 && polygonArea(overlap) > 0.002) {
          collisions.push(`${piece.id} ↔ ${peer.id}`);
        }
      }
    }
    const peers = byCentimetre.get(centimetre) ?? [];
    peers.push(piece);
    byCentimetre.set(centimetre, peers);
  }
  assert.deepEqual(collisions, [],
    `почти копланарные поверхности снова дают рябь:\n${collisions.slice(0, 12).join("\n")}`);
});

test("terrain tiles meet exactly instead of overlapping", () => {
  const terrain = surfacePieces.filter((piece) => piece.id.includes(":terrain-surface:"));
  assert.ok(terrain.length > 1000);
  assert.ok(terrain.every((piece) => piece.size[0] === 5 && piece.size[2] === 5));
});

test("city hardscape is cut from one ownership raster", () => {
  const city = surfacePieces.filter((piece) =>
    /astana:(city-roads|city-paving):/.test(piece.id));
  assert.ok(city.length > 100);
  assert.ok(city.every((piece) => piece.id.includes(":owned:")));
});

test("Baiterek and Nurzhol are a circular parterre with two real walking lanes", () => {
  const circle = astanaScene.breakablePieces.filter((piece) =>
    piece.id.includes(":city-paving:owned:"));
  assert.ok(circle.length > 300, "радиальный рисунок партера не собран");

  const walk = astanaScene.breakablePieces.filter((piece) =>
    piece.id.includes(":city-parterre:nurzhol:walk:")
      || piece.id.includes(":city-parterre:nurzhol:crossing:"));
  assert.equal(walk.length, 8, "променад снова разбит на растровые кубики");
  assert.ok(walk.every((piece) => piece.shape === "groundTile"));

  const flowerbed = astanaScene.breakablePieces.filter((piece) =>
    piece.id.includes(":nurzhol:bed:"));
  assert.equal(flowerbed.filter((piece) => piece.id.includes(":soil:")).length, 3);
  assert.ok(flowerbed.filter((piece) => piece.id.includes(":flower:")).length >= 60);

  const lamps = astanaScene.lampDefinitions.filter((lamp) =>
    lamp.id.includes(":nurzhol:lamp:"));
  assert.equal(lamps.length, 6);
  assert.ok(lamps.every((lamp) => lamp.dayIntensityFactor === 0));

  const reserve = astanaScene.breakablePieces.filter((piece) =>
    piece.id.includes(":nur-alem-reserve:"));
  assert.equal(reserve.length, 0,
    "старый надречный коридор Нур Алема остался после переноса сферы");

  const siteMarkers = astanaScene.breakablePieces.filter((piece) =>
    piece.id.includes(":city-site-markers:site-marker:"));
  assert.equal(siteMarkers.length, 3,
    "only Plaza, Circus and National Museum should remain as future foundations");
  assert.equal(siteMarkers.some((piece) => piece.id.includes("pyramid-plot")), false,
    "the old flat Pyramid marker overlaps the raised concrete podium");
  const circus = siteMarkers.find((piece) => piece.id.includes("circus-plot"));
  assert.equal(circus.shape, "cylinder");
  assert.equal(circus.size[0], circus.size[2]);
  for (const builtSite of ["pyramid-plot", "arch-square", "nur-alem-expo-plot", "opera-plot"]) {
    assert.equal(siteMarkers.some((piece) => piece.id.includes(builtSite)), false,
      `${builtSite} still has a planning slab inside its finished building`);
  }

  const minarets = astanaScene.breakablePieces.filter((piece) =>
    piece.id.includes(":city-site-massing:massing:hazret-sultan-plot:minaret:"));
  assert.equal(minarets.length, 0,
    "deferred Hazret Sultan geometry returned to the live island");
  assert.equal(astanaScene.breakablePieces.some((piece) =>
    piece.id.includes(":school-palace-plot:")), false,
  "deferred Schoolchildren Palace geometry returned to the live island");

  const massing = astanaScene.breakablePieces.filter((piece) =>
    piece.id.includes(":city-site-massing:massing:"));
  assert.equal(massing.length, 0,
    "full-height planning proxies obstruct photographic landmark comparison");

  assert.equal(massing.some((piece) =>
    piece.id.includes(":pyramid-plot:layer:")), false,
  "ступенчатый макет остался внутри настоящей стеклянной Пирамиды");

  assert.ok(astanaScene.breakablePieces.some((piece) =>
    piece.id.includes(":nur-alem-shell:nur-alem:smooth-double-curved-glass:")),
  "full Nur Alem geometry is missing after removal of its massing");
  assert.ok(astanaScene.breakablePieces.some((piece) =>
    piece.id.includes(":triumphal-arch-structure:")),
  "full Mangilik El geometry is missing after removal of its massing");
});

test("Atyrau shell dimensions follow the drawing rather than a visual sketch", () => {
  const topology = createAtyrauShellTopology();
  assert.equal(topology.stations.length, ATYRAU_SHELL_STATIONS);
  assert.equal(topology.nodes.length, 2);
  assert.ok(topology.nodes.every((side) => side.length === ATYRAU_SHELL_STATIONS));
  assert.ok(topology.nodes.every((side) =>
    side.every((station) => station.length === ATYRAU_SHELL_LEVELS)));
  assert.ok(Math.abs(topology.shellEnd - topology.shellStart - ATYRAU_SHELL_LENGTH) < 1e-8);
  for (let station = 1; station < topology.stations.length; station += 1) {
    assert.ok(Math.abs(
      topology.stations[station].distance
        - topology.stations[station - 1].distance
        - ATYRAU_FACADE_MODULE,
    ) < 1e-8, `шаг фасада сбился в станции ${station}`);
  }
  const crownHeights = topology.nodes.map((side) =>
    Math.max(...side.map((station) => station.at(-1).height)));
  assert.ok(Math.abs(crownHeights[0] - 6.95) < 1e-8);
  assert.ok(Math.abs(crownHeights[1] - 6.75) < 1e-8);
  assert.ok(topology.nodes.every((side) =>
    Math.abs(side[0].at(-1).height - ATYRAU_RAIL_HEIGHT) < 1e-8
      && Math.abs(side.at(-1).at(-1).height - ATYRAU_RAIL_HEIGHT) < 1e-8));
});

test("every internal Atyrau flower is one exact six-edge node", () => {
  const topology = createAtyrauShellTopology();
  const structuralEdges = topology.edges.filter((edge) =>
    edge.kind === "meridian" || edge.kind === "diagonal");
  const degree = new Map();
  for (const edge of structuralEdges) {
    for (const ref of [edge.from, edge.to]) {
      const key = atyrauNodeId(ref);
      degree.set(key, (degree.get(key) ?? 0) + 1);
      assert.ok(topology.nodes[ref[0]]?.[ref[1]]?.[ref[2]],
        `${edge.id}: ссылка не ведёт в единую матрицу узлов`);
    }
    if (edge.kind === "diagonal") {
      assert.equal(edge.to[1], edge.from[1] + 1);
      assert.equal(Math.abs(edge.to[2] - edge.from[2]), 1);
      assert.equal((edge.from[1] + edge.from[2]) % 2, 0,
        `${edge.id}: диагональ пересекает ячейку вне узла`);
    }
  }
  for (const side of [0, 1]) {
    for (let station = 1; station < ATYRAU_SHELL_STATIONS - 1; station += 1) {
      for (let level = 1; level < ATYRAU_SHELL_LEVELS - 1; level += 1) {
        const expected = (station + level) % 2 === 0 ? 6 : 2;
        assert.equal(degree.get(atyrauNodeId([side, station, level])), expected,
          `узел ${side}:${station}:${level} имеет неверное число сходящихся рёбер`);
      }
    }
  }
});

test("Atyrau crowns stay separate and are tied across a variable opening", () => {
  const topology = createAtyrauShellTopology();
  for (let station = 0; station < ATYRAU_SHELL_STATIONS; station += 1) {
    const leftBase = topology.nodes[0][station][0];
    const rightBase = topology.nodes[1][station][0];
    const leftCrown = topology.nodes[0][station].at(-1);
    const rightCrown = topology.nodes[1][station].at(-1);
    assert.equal(Math.sign(leftCrown.across), Math.sign(leftBase.across),
      `левая дуга нахлестнулась в станции ${station}`);
    assert.equal(Math.sign(rightCrown.across), Math.sign(rightBase.across),
      `правая дуга нахлестнулась в станции ${station}`);
    assert.ok(rightCrown.across - leftCrown.across
      >= ATYRAU_MIN_CROWN_HALF_GAP * 2 - 1e-8,
    `короны сомкнулись в станции ${station}`);
  }
  const ties = topology.edges.filter((entry) => entry.kind === "roof-tie");
  assert.ok(ties.length >= 6, `стяжек над проходом: ${ties.length}`);
  const lengths = ties.map((edge) => {
    const from = topology.nodes[edge.from[0]][edge.from[1]][edge.from[2]];
    const to = topology.nodes[edge.to[0]][edge.to[1]][edge.to[2]];
    assert.equal(edge.from[2], ATYRAU_SHELL_LEVELS - 1);
    assert.equal(edge.to[2], ATYRAU_SHELL_LEVELS - 1);
    assert.ok(Math.min(from.height, to.height) >= 3.2,
      `${edge.id}: стяжка опустилась в проход`);
    return Math.hypot(
      to.position[0] - from.position[0],
      to.position[1] - from.position[1],
      to.position[2] - from.position[2],
    );
  });
  assert.ok(Math.max(...lengths) - Math.min(...lengths) >= 0.5,
    "стяжки снова стали одной фиктивной длины");
});

test("Atyrau is built from a steel node frame and aluminium-shaped cassettes", () => {
  const bridge = astanaScene.breakablePieces.filter((piece) => piece.id.includes(":atyrau:"));
  const frame = bridge.filter((piece) => piece.id.includes(":frame:"));
  const petals = bridge.filter((piece) => piece.id.includes(":aluminium-petal:"));
  const topology = createAtyrauShellTopology();
  assert.equal(frame.length, topology.edges.length);
  const renderablePetalEdges = topology.edges.filter((edge) => {
    if (edge.kind !== "diagonal" && edge.kind !== "meridian") return false;
    const from = topology.nodes[edge.from[0]][edge.from[1]][edge.from[2]].position;
    const to = topology.nodes[edge.to[0]][edge.to[1]][edge.to[2]].position;
    return Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]) >= 0.12;
  });
  assert.equal(petals.length,
    renderablePetalEdges.length * ATYRAU_CASSETTE_PARTS);
  assert.ok(frame.every((piece) => piece.shape === "cylinder" && piece.material === "steel"));
  assert.ok(petals.every((piece) =>
    piece.shape === "hexagonalSheet" && piece.material === "steel"));
  assert.ok(Math.max(...petals.map((piece) => piece.size[0])) >= 0.50,
    "кассеты снова стали тонкими стержнями вместо широких лепестков");
  assert.ok(bridge.filter((piece) => piece.id.includes(":railing:solid:")).length >= 40,
    "рисунок обрывается, не переходя в сплошное подходное ограждение");
  assert.equal(bridge.filter((piece) => piece.id.includes(":rib:")).length, 0,
    "в сцену вернулась старая эскизная оболочка");
  assert.equal(astanaScene.resolveStructuralCollapse(new Set()).size, 0);
});

test("Atyrau night light is warm, continuous and has no visible point emitters", () => {
  assert.equal(ATYRAU_LIGHT_TEMPERATURE_K, 3000);
  const lamps = astanaScene.lampDefinitions.filter((lamp) =>
    lamp.id.includes(":atyrau:lighting:hidden-fixture:"));
  assert.equal(lamps.length, ATYRAU_LIGHT_COUNT);
  assert.ok(lamps.every((lamp) =>
    lamp.color === ATYRAU_LIGHT_COLOR
      && lamp.distance === 15
      && lamp.intensity === 4.2
      && lamp.dayIntensityFactor === 0
      && lamp.poolGroupId === ATYRAU_LIGHT_GROUP
      && lamp.localPoolCapacity === ATYRAU_LIGHT_COUNT
      && lamp.transition?.fadeInSeconds === ATYRAU_LIGHT_TRANSITION.fadeInSeconds
      && lamp.transition?.fadeOutSeconds === ATYRAU_LIGHT_TRANSITION.fadeOutSeconds));

  const carriers = astanaScene.breakablePieces.filter((piece) =>
    piece.id.includes(":atyrau:lighting:hidden-fixture:"));
  assert.equal(carriers.length, ATYRAU_LIGHT_COUNT);
  const carrierById = new Map(carriers.map((piece) => [piece.id, piece]));
  for (const lamp of lamps) {
    const carrier = carrierById.get(lamp.id);
    assert.ok(carrier, `${lamp.id}: нет утопленного корпуса`);
    assert.equal(carrier.material, "steel");
    assert.equal(carrier.shape, "panel");
    assert.notEqual(carrier.color, ATYRAU_LIGHT_COLOR,
      `${lamp.id}: источник снова виден яркой точкой`);
    assert.ok(Math.abs(lamp.position[1] - carrier.position[1] - 0.62) < 1e-8,
      `${lamp.id}: свет не вынесен из скрытого корпуса`);
    assert.equal(carrier.textureProfile, "matte-aluminium");
  }

  const reflectors = astanaScene.breakablePieces.filter((piece) =>
    piece.id.includes(":atyrau:lighting:reflector:"));
  const expectedReflectors = Math.ceil(
    createAtyrauShellTopology().pathLength / ATYRAU_FACADE_MODULE,
  ) * 2;
  assert.equal(reflectors.length, expectedReflectors,
    `непрерывных отражателей: ${reflectors.length}`);
  assert.ok(reflectors.every((piece) => piece.material === "steel"
    && piece.textureProfile === "matte-aluminium"
    && piece.color !== ATYRAU_LIGHT_COLOR),
  "отражённая линия снова заменена светящейся геометрией");
});

test("Atyrau floor fades from the white civic core to the grey LRT edge", () => {
  const luminance = (colour) => {
    const channels = [1, 3, 5].map((offset) => Number.parseInt(
      colour.slice(offset, offset + 2), 16,
    ));
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  const whiteEnd = atyrauDeckColourAt(0);
  const middle = atyrauDeckColourAt(0.5);
  const greyEnd = atyrauDeckColourAt(1);
  assert.ok(luminance(whiteEnd) > luminance(middle));
  assert.ok(luminance(middle) > luminance(greyEnd));
  assert.notEqual(whiteEnd, greyEnd);
});
