import assert from "node:assert/strict";
import test from "node:test";
import { astanaScene } from
  "../games/make-a-mess/src/game/astanaScene.ts";
import {
  ARCH_DEPTH,
  ARCH_HEIGHT,
  ARCH_NICHE_COUNT,
  ARCH_OPENING_RADIUS,
  ARCH_OPENING_SPRING,
  ARCH_OPENING_TOP,
  ARCH_OPENING_WIDTH,
  ARCH_REAL_HEIGHT,
  ARCH_REAL_WIDTH,
  ARCH_SCALE,
  ARCH_SPANDREL_ROWS,
  ARCH_VAULT_SEGMENTS,
  ARCH_WIDTH,
} from "../games/make-a-mess/src/content/scenes/astana/astanaTriumphalArch.ts";

const pieces = (needle) => astanaScene.breakablePieces.filter((piece) =>
  piece.id.includes(needle));

test("Mangilik El derives every principal dimension from the 20 by 13 metre original", () => {
  assert.equal(ARCH_REAL_HEIGHT, 20);
  assert.equal(ARCH_REAL_WIDTH, 13);
  assert.equal(ARCH_SCALE, 2 / 3);
  assert.ok(Math.abs(ARCH_HEIGHT - 40 / 3) < 1e-12);
  assert.equal(ARCH_WIDTH, 26 / 3);
  assert.equal(ARCH_OPENING_RADIUS, ARCH_OPENING_WIDTH / 2);
  assert.equal(ARCH_OPENING_TOP, ARCH_OPENING_SPRING + ARCH_OPENING_RADIUS);
  assert.ok(ARCH_DEPTH > 4, "обзорная площадка требует настоящей глубины, не фасадной декорации");
});

test("the central passage is one shared arch section on both facades and through the vault", () => {
  assert.equal(pieces(":triumphal-arch-structure:arch:pier:").length, 2);
  assert.equal(pieces(":triumphal-arch-structure:arch:spandrel:").length,
    ARCH_SPANDREL_ROWS * 2);
  assert.equal(pieces(":triumphal-arch-structure:arch:voussoir:").length,
    ARCH_VAULT_SEGMENTS * 2);
  assert.equal(pieces(":triumphal-arch-structure:arch:vault-rib:").length,
    ARCH_VAULT_SEGMENTS * 8);
});

test("both elevations carry the niches, emblems, shallow crest and roof lantern", () => {
  assert.equal(pieces(":triumphal-arch-detail:arch:niche:")
    .filter((piece) => piece.id.includes(":statue-body:")).length, ARCH_NICHE_COUNT);
  assert.equal(pieces(":triumphal-arch-detail:arch:niche:")
    .filter((piece) => piece.id.includes(":statue-head:")).length, ARCH_NICHE_COUNT);
  assert.equal(pieces(":triumphal-arch-detail:arch:emblem:").length, 4);
  assert.equal(pieces(":triumphal-arch-detail:arch:crown:").length, 0,
    "the rejected five-block fantasy crown returned");
  assert.equal(pieces(":triumphal-arch-detail:arch:central-curved-crest:").length, 2);
  assert.equal(pieces(":triumphal-arch-detail:arch:roof-lantern-glass:").length, 1);
  assert.equal(pieces(":triumphal-arch-structure:arch:corner-pilaster:").length, 4);
  assert.equal(pieces(":city-site-massing:massing:arch-square:").length, 0);
});

test("architectural light is warm, concealed and inactive by day", () => {
  const nodes = pieces(":triumphal-arch-lighting:arch:light:");
  const lights = astanaScene.lampDefinitions.filter((lamp) =>
    lamp.id.includes(":triumphal-arch-lighting:arch:light:"));
  assert.equal(nodes.length, 4);
  assert.equal(lights.length, 4);
  assert.ok(nodes.every((piece) => Math.max(...piece.size) <= 0.09));
  assert.ok(lights.every((lamp) =>
    lamp.color === "#ffd2a3"
      && lamp.dayIntensityFactor === 0
      && lamp.poolGroupId === "astana:triumphal-arch:facade"));
});
