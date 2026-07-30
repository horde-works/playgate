import assert from "node:assert/strict";
import test from "node:test";
import { astanaScene } from "../games/make-a-mess/src/game/astanaScene.ts";
import { NURZHOL_ALONG_VECTOR } from
  "../games/make-a-mess/src/content/scenes/astana/astanaLayout.ts";
import { ATYRAU_FRAME_WHITE } from
  "../games/make-a-mess/src/content/scenes/astana/astanaAtyrau.ts";
import { PYRAMID_GLASS_CELLS } from
  "../games/make-a-mess/src/content/scenes/astana/astanaPyramid.ts";
import {
  PYRAMID_ENTRANCES,
  PYRAMID_ENTRANCE_LIGHT_COLOUR,
  PYRAMID_ENTRANCE_LIGHT_DISTANCE,
  PYRAMID_ENTRANCE_LIGHT_INTENSITY,
  PYRAMID_ENTRANCE_INNER_WIDTH,
  PYRAMID_ENTRANCE_LENGTH,
  PYRAMID_ENTRANCE_OUTER_WIDTH,
  PYRAMID_MOUND_BOTTOM_HALF_SIZE,
  PYRAMID_MOUND_HEIGHT,
  PYRAMID_MOUND_LAYERS,
  PYRAMID_MOUND_TOP,
  PYRAMID_MOUND_TOP_HALF_SIZE,
  PYRAMID_NAVIGATION_CLEARANCE,
  PYRAMID_PORTAL_DEPTH,
  PYRAMID_PORTAL_HEIGHT,
  PYRAMID_PORTAL_INNER_WIDTH,
  PYRAMID_PORTAL_MOUTH_DISTANCE,
  PYRAMID_PORTAL_OUTER_WIDTH,
  PYRAMID_PODIUM_HALF_SIZE,
  PYRAMID_PODIUM_SIDE,
  PYRAMID_PODIUM_THICKNESS,
  PYRAMID_PODIUM_TOP,
  PYRAMID_RAIL_BRONZE,
} from "../games/make-a-mess/src/content/scenes/astana/astanaPyramidPodium.ts";

const direction = (from, to) => {
  const dx = to[0] - from[0];
  const dz = to[1] - from[1];
  const length = Math.hypot(dx, dz);
  return [dx / length, dz / length];
};

test("the Pyramid stands on a slightly larger square bridge with boat clearance", () => {
  assert.equal(PYRAMID_PODIUM_SIDE, 30);
  assert.equal(PYRAMID_PODIUM_HALF_SIZE, 15);
  assert.ok(PYRAMID_NAVIGATION_CLEARANCE >= 4.2);
  assert.equal(
    PYRAMID_PODIUM_TOP,
    PYRAMID_NAVIGATION_CLEARANCE + PYRAMID_PODIUM_THICKNESS,
  );

  const slab = astanaScene.breakablePieces.find((piece) =>
    piece.id.includes(":pyramid-podium:podium:slab:"));
  assert.ok(slab, "поднятая бетонная плита не построена");
  assert.deepEqual(slab.size, [30, 1.2, 30]);
  assert.equal(slab.color, ATYRAU_FRAME_WHITE,
    "плита больше не рифмуется с белым рисунком моста Атырау");
  assert.equal(slab.material, "steel");
  assert.equal(slab.textureProfile, "painted-steel",
    "одинаковый hex на сером бетоне не выглядит как белый каркас Атырау");
  assert.equal(slab.position[1] - slab.size[1] / 2, PYRAMID_NAVIGATION_CLEARANCE);

  assert.equal(
    Math.min(...PYRAMID_GLASS_CELLS.flatMap((cell) =>
      cell.vertices.map((vertex) => vertex[1]))),
    PYRAMID_MOUND_TOP,
    "стеклянная Пирамида снова опустилась на мостовую плиту вместо насыпи",
  );
});

test("a terraced mound raises the shell while three physical corridors remain open", () => {
  assert.equal(PYRAMID_MOUND_HEIGHT, 3.2);
  assert.equal(PYRAMID_MOUND_TOP, PYRAMID_PODIUM_TOP + PYRAMID_MOUND_HEIGHT);
  assert.ok(PYRAMID_MOUND_BOTTOM_HALF_SIZE < PYRAMID_PODIUM_HALF_SIZE);
  assert.ok(PYRAMID_MOUND_TOP_HALF_SIZE > 12,
    "у основания стеклянной оболочки должен оставаться узкий пояс насыпи");

  const layers = astanaScene.breakablePieces.filter((piece) =>
    piece.id.includes(":pyramid-mound:mound:layer:"));
  assert.equal(layers.length, PYRAMID_MOUND_LAYERS * 5);
  assert.ok(layers.every((piece) =>
    piece.material === "grass"
      && piece.landscapeSurface === "city-ground"));

  const floors = astanaScene.breakablePieces.filter((piece) =>
    piece.id.includes(":pyramid-entrances:portal:")
      && piece.id.includes(":floor:"));
  const ceilings = astanaScene.breakablePieces.filter((piece) =>
    piece.id.includes(":pyramid-entrances:portal:")
      && piece.id.includes(":ceiling:"));
  assert.equal(floors.length, 15);
  assert.equal(ceilings.length, 15);
  assert.equal(PYRAMID_PORTAL_DEPTH,
    PYRAMID_PORTAL_MOUTH_DISTANCE - 9.35);
  assert.ok(PYRAMID_PORTAL_MOUTH_DISTANCE < PYRAMID_MOUND_BOTTOM_HALF_SIZE - 2,
    "портал снова вылез на внешнюю кромку насыпи отдельной коробкой");
  assert.equal(PYRAMID_PORTAL_OUTER_WIDTH, 5.8);
  assert.equal(PYRAMID_PORTAL_INNER_WIDTH, 4.4);
  assert.equal(PYRAMID_PORTAL_HEIGHT, 2.78);
});

test("all three trapezoidal entrance blocks have concealed warm night light", () => {
  const jambs = astanaScene.breakablePieces.filter((piece) =>
    piece.id.includes(":pyramid-entrances:portal:")
      && piece.id.includes(":sloped-jamb:"));
  const doors = astanaScene.breakablePieces.filter((piece) =>
    piece.id.includes(":pyramid-entrances:portal:")
      && piece.id.includes(":dark-glass-doors:"));
  const baffles = astanaScene.breakablePieces.filter((piece) =>
    piece.id.includes(":pyramid-entrances:portal:")
      && piece.id.includes(":hidden-light-baffle:"));
  const lamps = astanaScene.lampDefinitions.filter((lamp) =>
    lamp.id.includes(":pyramid-entrances:portal:")
      && lamp.id.includes(":hidden-light-baffle:"));

  const slopedHeads = astanaScene.breakablePieces.filter((piece) =>
    piece.id.includes(":pyramid-entrances:portal:")
      && piece.id.includes(":sloped-head:"));

  assert.equal(jambs.length, 6);
  assert.equal(slopedHeads.length, 3);
  assert.ok(slopedHeads.every((piece) =>
    piece.rotation.some((angle) => Math.abs(angle) > 0.1)),
  "верх входа снова стал горизонтальной коробкой вне плоскости Пирамиды");
  assert.equal(doors.length, 3);
  assert.equal(baffles.length, 3);
  assert.equal(lamps.length, 3);
  assert.ok(doors.every((piece) => piece.material === "darkGlass"));
  assert.ok(baffles.every((piece) =>
    piece.color === "#111820"
      && piece.textureProfile === "matte-aluminium"));
  assert.ok(lamps.every((lamp) =>
    lamp.color === PYRAMID_ENTRANCE_LIGHT_COLOUR
      && lamp.distance === PYRAMID_ENTRANCE_LIGHT_DISTANCE
      && lamp.intensity === PYRAMID_ENTRANCE_LIGHT_INTENSITY
      && lamp.dayIntensityFactor === 0
      && lamp.poolGroupId === "astana:pyramid:architectural-lighting"));
});

test("three entrance ramps leave face centres along exact normals and flare outside", () => {
  assert.equal(PYRAMID_ENTRANCES.length, 3);
  assert.deepEqual(PYRAMID_ENTRANCES[0].normal, NURZHOL_ALONG_VECTOR,
    "главный вход больше не обращён точно к Байтереку");

  for (const entrance of PYRAMID_ENTRANCES) {
    assert.ok(Math.abs(
      Math.hypot(
        entrance.outerCentre[0] - entrance.innerCentre[0],
        entrance.outerCentre[1] - entrance.innerCentre[1],
      ) - PYRAMID_ENTRANCE_LENGTH,
    ) < 1e-12);
    assert.equal(PYRAMID_ENTRANCE_INNER_WIDTH, 6);
    assert.equal(PYRAMID_ENTRANCE_OUTER_WIDTH, 13.5);
    const centreDirection = direction(entrance.innerCentre, entrance.outerCentre);
    assert.ok(Math.abs(centreDirection[0] - entrance.normal[0]) < 1e-12);
    assert.ok(Math.abs(centreDirection[1] - entrance.normal[1]) < 1e-12);
  }

  const floors = astanaScene.breakablePieces.filter((piece) =>
    piece.id.includes(":pyramid-entrances:entrance:")
      && piece.id.includes(":floor:"));
  assert.equal(floors.length, 24, "каждый из трёх подъёмов должен иметь восемь плит");
  assert.ok(floors.every((piece) => piece.color === ATYRAU_FRAME_WHITE),
    "ступени должны оставаться того же белого цвета, что и мост Атырау");
  assert.ok(floors.every((piece) =>
    piece.material === "steel" && piece.textureProfile === "painted-steel"),
  "ступени снова получили серую бетонную фактуру вместо белой окрашенной");
});

test("each white entrance has bronze posts and one unbroken handrail per side", () => {
  const posts = astanaScene.breakablePieces.filter((piece) =>
    piece.id.includes(":pyramid-entrances:entrance:")
      && piece.id.includes(":rail-post:"));
  const handrails = astanaScene.breakablePieces.filter((piece) =>
    piece.id.includes(":pyramid-entrances:entrance:")
      && piece.id.includes(":handrail:"));

  assert.equal(posts.length, 3 * 2 * 5);
  assert.equal(handrails.length, 3 * 2);
  assert.ok([...posts, ...handrails].every((piece) =>
    piece.color === PYRAMID_RAIL_BRONZE));
});

test("the square podium has one thin bronze perimeter and no coplanar underside", () => {
  const bands = astanaScene.breakablePieces.filter((piece) =>
    piece.id.includes(":pyramid-podium:podium:bronze-band:"));
  assert.equal(bands.length, 4);
  assert.ok(bands.every((piece) =>
    piece.color === PYRAMID_RAIL_BRONZE
      && piece.material === "steel"
      && piece.textureProfile === "painted-steel"
      && Math.min(piece.size[0], piece.size[2]) === 0.065
      && piece.size[1] === 0.16));
  assert.equal(
    astanaScene.breakablePieces.some((piece) =>
      piece.id.includes(":pyramid-podium:podium:underside-shadow:")),
    false,
    "дублирующая нижняя плоскость снова создаёт рябь",
  );
});

test("the rejected freestanding corner sticks are absent", () => {
  assert.equal(
    astanaScene.breakablePieces.some((piece) =>
      piece.id.includes(":pyramid-supports:") || piece.id.includes(":support:")),
    false,
  );
});
