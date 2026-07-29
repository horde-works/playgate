import assert from "node:assert/strict";
import test from "node:test";
import { astanaScene } from
  "../games/make-a-mess/src/game/astanaScene.ts";
import { OPERA_CENTRE, astanaLandmarkSiteById } from
  "../games/make-a-mess/src/content/scenes/astana/astanaLayout.ts";
import {
  OPERA_DEPTH,
  OPERA_FRONT_COLUMN_COUNT,
  OPERA_PEDIMENT_HEIGHT,
  OPERA_SIDE_COLUMN_COUNT,
  OPERA_TOTAL_HEIGHT,
  OPERA_WIDTH,
} from "../games/make-a-mess/src/content/scenes/astana/astanaOpera.ts";

const pieces = (needle) => astanaScene.breakablePieces.filter((piece) =>
  piece.id.includes(needle));

test("Astana Opera uses the full 24 by 16 metre composition reserve", () => {
  assert.equal(OPERA_WIDTH, 24);
  assert.equal(OPERA_DEPTH, 16);
  assert.equal(OPERA_TOTAL_HEIGHT, 11.6);
  assert.equal(OPERA_PEDIMENT_HEIGHT, 3.35);
  assert.deepEqual(astanaLandmarkSiteById["opera-plot"].center, OPERA_CENTRE);
  assert.equal(pieces(":city-site-massing:massing:opera-plot:").length, 0);
});

test("the portico has exactly eight front columns and two eight-column side rhythms", () => {
  assert.equal(pieces(":opera-columns:opera:front-column:")
    .filter((piece) => piece.id.includes(":shaft:")).length,
  OPERA_FRONT_COLUMN_COUNT);
  assert.equal(pieces(":opera-columns:opera:side-column:")
    .filter((piece) => piece.id.includes(":shaft:")).length,
  OPERA_SIDE_COLUMN_COUNT * 2);
});

test("one true triangular pediment closes the classical front elevation", () => {
  const pediment = pieces(":opera-detail:opera:pediment-face:");
  assert.equal(pediment.length, 1);
  assert.equal(pediment[0].shape, "triangularSheet");
  assert.equal(pieces(":opera-detail:opera:pediment-cornice:").length, 3);
  assert.equal(pieces(":opera-detail:opera:pediment-relief:").length, 7);
});

test("brass-framed glazing keeps the front and side bay counts", () => {
  assert.equal(pieces(":opera-glazing:opera:front-window:").length, 5);
  assert.equal(pieces(":opera-glazing:opera:front-door:").length, 3);
  assert.equal(pieces(":opera-glazing:opera:front-statue-niche:").length, 2);
  assert.equal(pieces(":opera-glazing:opera:side-window:").length, 28);
  assert.equal(pieces(":opera-glazing:opera:front-window-brass:").length, 10);
  assert.equal(pieces(":opera-glazing:opera:side-window-pediment:").length, 14);
});

test("front, wings and rear pavilions remain separate readable volumes", () => {
  assert.equal(pieces(":opera-body:opera:main-body:").length, 0);
  assert.equal(pieces(":opera-body:opera:auditorium-core:").length, 1);
  assert.equal(pieces(":opera-body:opera:side-wing:").length, 2);
  assert.equal(pieces(":opera-body:opera:rear-pavilion:")
    .filter((piece) => !piece.id.includes(":cornice:")).length, 2);
});

test("copper roofs include two main slopes and one ten-cassette rounded stage roof", () => {
  assert.equal(pieces(":opera-roof:opera:main-roof:").length, 2);
  const ridge = pieces(":opera-roof:opera:main-roof-ridge:");
  assert.equal(ridge.length, 1);
  assert.ok(ridge[0].size[2] > ridge[0].size[0] * 20,
    "the gable ridge stopped running in depth from the frontal pediment");
  assert.equal(pieces(":opera-body:opera:stage-copper-roof:").length, 10);
  assert.equal(pieces(":opera-body:opera:stage-roof-spine:").length, 1);
  assert.equal(pieces(":opera-body:opera:stage-porthole:").length, 6);
  assert.equal(pieces(":opera-body:opera:rear-shoulder-copper:").length, 2);
  assert.equal(pieces(":opera-detail:opera:quadriga-horse:")
    .filter((piece) => piece.id.includes(":body:")).length, 4);
});

test("facade and lobby light is warm, concealed and disabled by day", () => {
  const lamps = astanaScene.lampDefinitions.filter((lamp) =>
    lamp.id.includes(":opera-lighting:opera:hidden-"));
  assert.equal(lamps.length, 7);
  assert.ok(lamps.every((lamp) => lamp.dayIntensityFactor === 0));
  assert.ok(lamps.every((lamp) => lamp.color === "#ffd2a1" || lamp.color === "#ffc78f"));
  assert.ok(lamps.every((lamp) => lamp.distance >= 16 && lamp.intensity >= 11));
});
