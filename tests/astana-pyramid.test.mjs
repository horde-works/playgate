import assert from "node:assert/strict";
import test from "node:test";
import { astanaScene } from
  "../games/make-a-mess/src/game/astanaScene.ts";
import { PYRAMID_CENTRE, PYRAMID_YAW } from
  "../games/make-a-mess/src/content/scenes/astana/astanaLayout.ts";
import { PYRAMID_MOUND_TOP } from
  "../games/make-a-mess/src/content/scenes/astana/astanaPyramidPodium.ts";
import {
  PYRAMID_CELL_COUNT,
  PYRAMID_FRAME_EDGE_COUNT,
  PYRAMID_FRAME_EDGES,
  PYRAMID_GLASS_CELLS,
  PYRAMID_GRID_DIVISIONS,
  PYRAMID_HEIGHT,
  PYRAMID_MODULE,
  PYRAMID_LOWER_GLASS,
  PYRAMID_REAL_SIZE_METRES,
  PYRAMID_SIDE,
  PYRAMID_UPPER_LIGHT_COLOURS,
  PYRAMID_UPPER_LIGHT_COUNT,
} from "../games/make-a-mess/src/content/scenes/astana/astanaPyramid.ts";

const pointKey = (point) => point.map((value) => value.toFixed(7)).join(",");
const edgeKey = (from, to) => [pointKey(from), pointKey(to)].sort().join("|");
const dot2 = (a, b) => a[0] * b[0] + a[1] * b[1];
const direction2 = (from, to) => {
  const vector = [to[0] - from[0], to[2] - from[2]];
  const length = Math.hypot(...vector);
  return [vector[0] / length, vector[1] / length];
};

test("the island Pyramid preserves the real 62:62:62 proportions at 24 metres", () => {
  assert.equal(PYRAMID_REAL_SIZE_METRES, 62);
  assert.equal(PYRAMID_SIDE, 24);
  assert.equal(PYRAMID_HEIGHT, 24);
  assert.equal(PYRAMID_GRID_DIVISIONS, 5);
  assert.equal(PYRAMID_MODULE, 4.8);

  const vertices = PYRAMID_GLASS_CELLS.flatMap((cell) => cell.vertices);
  assert.equal(Math.min(...vertices.map((point) => point[1])), PYRAMID_MOUND_TOP);
  assert.equal(
    Math.max(...vertices.map((point) => point[1])),
    PYRAMID_MOUND_TOP + PYRAMID_HEIGHT,
  );
  const apexKey = pointKey([
    PYRAMID_CENTRE[0],
    PYRAMID_MOUND_TOP + PYRAMID_HEIGHT,
    PYRAMID_CENTRE[1],
  ]);
  assert.equal(new Set(vertices.map(pointKey)).has(apexKey), true);
});

test("four faces are exact five-tier triangular grids", () => {
  assert.equal(PYRAMID_GLASS_CELLS.length, PYRAMID_CELL_COUNT);
  assert.equal(PYRAMID_CELL_COUNT, 100);

  for (const face of ["south", "east", "north", "west"]) {
    const cells = PYRAMID_GLASS_CELLS.filter((cell) => cell.face === face);
    assert.equal(cells.length, 25);
    for (let row = 0; row < PYRAMID_GRID_DIVISIONS; row += 1) {
      assert.equal(
        cells.filter((cell) => cell.row === row).length,
        2 * (PYRAMID_GRID_DIVISIONS - row) - 1,
      );
    }
  }
  assert.equal(PYRAMID_GLASS_CELLS.filter((cell) => cell.stained).length, 16);
});

test("the Pyramid base is parallel to its square podium", () => {
  const yaw = -PYRAMID_YAW;
  const podiumAxes = [
    [Math.cos(yaw), -Math.sin(yaw)],
    [Math.sin(yaw), Math.cos(yaw)],
  ];
  const baseEdges = PYRAMID_FRAME_EDGES.filter((edge) =>
    Math.abs(edge.from[1] - PYRAMID_MOUND_TOP) < 1e-9
      && Math.abs(edge.to[1] - PYRAMID_MOUND_TOP) < 1e-9);
  assert.equal(baseEdges.length, 20);
  for (const edge of baseEdges) {
    const direction = direction2(edge.from, edge.to);
    assert.ok(Math.max(...podiumAxes.map((axis) =>
      Math.abs(dot2(direction, axis)))) > 1 - 1e-12,
    "грань Пирамиды снова развёрнута относительно плиты");
  }

  const bands = astanaScene.breakablePieces.filter((piece) =>
    piece.id.includes(":pyramid-podium:podium:bronze-band:"));
  for (const band of bands) {
    const offset = [
      band.position[0] - PYRAMID_CENTRE[0],
      band.position[2] - PYRAMID_CENTRE[1],
    ];
    const projections = podiumAxes.map((axis) => Math.abs(dot2(offset, axis)));
    assert.ok(Math.abs(Math.max(...projections) - 15.0325) < 1e-9,
      "бронзовый пояс больше не лежит на борту квадратной плиты");
    assert.ok(Math.min(...projections) < 1e-9);
  }
});

test("every glass side belongs to one deduplicated structural edge", () => {
  assert.equal(PYRAMID_FRAME_EDGES.length, PYRAMID_FRAME_EDGE_COUNT);
  assert.equal(PYRAMID_FRAME_EDGE_COUNT, 160);
  const frameKeys = new Set(PYRAMID_FRAME_EDGES.map((edge) =>
    edgeKey(edge.from, edge.to)));
  assert.equal(frameKeys.size, PYRAMID_FRAME_EDGES.length,
    "двойная балка вернулась на общую координату");

  for (const cell of PYRAMID_GLASS_CELLS) {
    const [a, b, c] = cell.vertices;
    assert.equal(new Set([pointKey(a), pointKey(b), pointKey(c)]).size, 3);
    assert.ok(frameKeys.has(edgeKey(a, b)));
    assert.ok(frameKeys.has(edgeKey(b, c)));
    assert.ok(frameKeys.has(edgeKey(c, a)));
  }
});

test("rendered shell is triangular glass with no stepped massing inside", () => {
  const glass = astanaScene.breakablePieces.filter((piece) =>
    piece.id.includes(":pyramid-glass:pyramid:glass:"));
  const frame = astanaScene.breakablePieces.filter((piece) =>
    piece.id.includes(":pyramid-frame:pyramid:frame:"));
  assert.equal(glass.length, 100);
  assert.equal(frame.length, 160);
  assert.ok(glass.every((piece) => piece.shape === "triangularSheet"));
  assert.equal(glass.filter((piece) => piece.material === "darkGlass").length, 100);
  assert.equal(glass.filter((piece) => piece.material === "glass").length, 0);
  assert.equal(glass.filter((piece) => piece.color === PYRAMID_LOWER_GLASS).length, 84);
  assert.ok(frame.every((piece) =>
    piece.shape === "cylinder"
      && piece.material === "steel"
      && piece.textureProfile === "painted-steel"));
  assert.equal(astanaScene.breakablePieces.some((piece) =>
    piece.id.includes(":city-site-massing:massing:pyramid-plot:layer:")), false);
});

test("the shell never self-emits and only concealed upper washes colour night glass", () => {
  const glass = astanaScene.breakablePieces.filter((piece) =>
    piece.id.includes(":pyramid-glass:pyramid:glass:"));
  assert.ok(glass.every((piece) => piece.light === undefined));

  const baffles = astanaScene.breakablePieces.filter((piece) =>
    piece.id.includes(":pyramid-interior:pyramid:lighting:hidden-upper-baffle:"));
  const lights = astanaScene.lampDefinitions.filter((lamp) =>
    lamp.id.includes(":pyramid-interior:pyramid:lighting:hidden-upper-baffle:"));
  assert.equal(baffles.length, PYRAMID_UPPER_LIGHT_COUNT);
  assert.equal(lights.length, PYRAMID_UPPER_LIGHT_COUNT);
  assert.ok(baffles.every((piece) =>
    piece.color === "#131c24"
      && piece.textureProfile === "matte-aluminium"));
  assert.deepEqual(new Set(lights.map((lamp) => lamp.color)),
    new Set(PYRAMID_UPPER_LIGHT_COLOURS));
  assert.ok(lights.every((lamp) =>
    lamp.dayIntensityFactor === 0
      && lamp.distance >= 26
      && lamp.intensity >= 14));
  assert.ok(baffles.every((piece) => Math.max(...piece.size) <= 0.1),
    "скрытый световой узел снова стал видимой коробкой за стеклом");
});
