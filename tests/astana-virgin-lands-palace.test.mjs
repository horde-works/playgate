import assert from "node:assert/strict";
import test from "node:test";
import { virginLandsPalaceObject } from
  "../games/make-a-mess/src/content/objects/astana/virginLandsPalaceObject.ts";
import {
  VIRGIN_LANDS_PALACE_ACCEPTED_ARTIFACT_SHA256,
  VIRGIN_LANDS_PALACE_ACCEPTED_CAPTURE_HASH,
  VIRGIN_LANDS_PALACE_ACCEPTED_REVISION,
  VIRGIN_LANDS_PALACE_MATERIAL_BINDINGS,
  VIRGIN_LANDS_PALACE_WORLD_BASE_Y,
  virginLandsPalaceWorldPoint,
} from
  "../games/make-a-mess/src/content/scenes/astana/astanaVirginLandsPalace.ts";
import { astanaScene } from
  "../games/make-a-mess/src/game/astanaScene.ts";

const palacePieces = astanaScene.breakablePieces.filter((piece) =>
  piece.id.includes(":virgin-lands-palace-")
    && piece.id.includes(":virgin-lands-palace:"));

test("the world adapter is pinned to the owner-accepted D02 artifact", () => {
  assert.equal(virginLandsPalaceObject.revision,
    VIRGIN_LANDS_PALACE_ACCEPTED_REVISION);
  assert.equal(VIRGIN_LANDS_PALACE_ACCEPTED_CAPTURE_HASH, "499dd1055608");
  assert.equal(
    VIRGIN_LANDS_PALACE_ACCEPTED_ARTIFACT_SHA256,
    "8a214e65e930c3e1883bcf926e01e51ab0f2fbc891ac0840bb786064eebb1695",
  );
});

test("every canonical D02 part appears exactly once in Astana", () => {
  assert.equal(palacePieces.length, virginLandsPalaceObject.parts.length);
  assert.equal(new Set(palacePieces.map(({ id }) => id)).size,
    virginLandsPalaceObject.parts.length);

  for (const part of virginLandsPalaceObject.parts) {
    const worldId = `:virgin-lands-palace:${part.group}:${part.id}:piece`;
    const matches = palacePieces.filter((piece) => piece.id.endsWith(worldId));
    assert.equal(matches.length, 1, worldId);
    const binding = VIRGIN_LANDS_PALACE_MATERIAL_BINDINGS[part.material];
    assert.ok(binding, part.material);
    assert.equal(matches[0].material, binding.material, part.id);
    assert.equal(matches[0].intactCollider, binding.collision, part.id);
  }
});

test("the adapter only transforms the accepted geometry into world space", () => {
  const box = virginLandsPalaceObject.parts.find((part) =>
    part.kind === "box" && part.id === "foyer-ground-slab:square-bar");
  assert.ok(box);
  const piece = palacePieces.find((candidate) =>
    candidate.id.endsWith(`:${box.group}:${box.id}:piece`));
  assert.ok(piece);
  assert.deepEqual(piece.position, virginLandsPalaceWorldPoint(box.center));
  assert.equal(piece.position[1], VIRGIN_LANDS_PALACE_WORLD_BASE_Y + box.center[1]);
  assert.deepEqual(piece.size, box.size);
});

test("world windows and doors remain finite colliding glass in real openings", () => {
  const glass = palacePieces.filter((piece) => piece.material === "darkGlass");
  const canonicalGlass = virginLandsPalaceObject.parts.filter((part) =>
    part.material === "palace-glazing");
  assert.equal(glass.length, canonicalGlass.length);
  assert.ok(glass.length > 150);
  assert.ok(glass.every((piece) =>
    piece.shape === "glassPane"
      && piece.intactCollider === true
      && Math.min(...piece.size) >= 0.025));
  assert.equal(glass.filter((piece) => piece.id.includes(":door-")).length, 4);
});

test("the accepted Palace replaced planning massing and starts structurally stable", () => {
  assert.equal(astanaScene.breakablePieces.some((piece) =>
    piece.id.includes(":city-site-massing:massing:virgin-lands-palace-plot:")),
  false);
  assert.equal(astanaScene.resolveStructuralCollapse(new Set()).size, 0);
});
