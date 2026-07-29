import assert from "node:assert/strict";
import test from "node:test";
import { astanaScene } from
  "../games/make-a-mess/src/game/astanaScene.ts";
import { NUR_ALEM_CENTRE, astanaLandmarkSiteById } from
  "../games/make-a-mess/src/content/scenes/astana/astanaLayout.ts";
import {
  NUR_ALEM_FLOOR_COUNT,
  NUR_ALEM_FRAME_EDGES,
  NUR_ALEM_HEIGHT,
  NUR_ALEM_LATITUDE_COUNT,
  NUR_ALEM_LONGITUDE_COUNT,
  NUR_ALEM_CONNECTOR_SEGMENTS,
  NUR_ALEM_NECK_BANDS,
  NUR_ALEM_NECK_SEGMENTS,
  NUR_ALEM_PETAL_COUNT,
  NUR_ALEM_PETAL_SEGMENTS,
  NUR_ALEM_REAL_HEIGHT,
  NUR_ALEM_REAL_SPHERE_DIAMETER,
  NUR_ALEM_SCALE,
  NUR_ALEM_SPHERE_CENTRE_Y,
  NUR_ALEM_SPHERE_DIAMETER,
  NUR_ALEM_SPHERE_RADIUS,
} from "../games/make-a-mess/src/content/scenes/astana/astanaNurAlem.ts";

const pieces = (needle) => astanaScene.breakablePieces.filter((piece) =>
  piece.id.includes(needle));

test("Nur Alem keeps the documented 80 metre sphere inside a 100 metre structure", () => {
  assert.equal(NUR_ALEM_REAL_SPHERE_DIAMETER, 80);
  assert.equal(NUR_ALEM_REAL_HEIGHT, 100);
  assert.equal(NUR_ALEM_SCALE, 0.325);
  assert.equal(NUR_ALEM_SPHERE_DIAMETER, 26);
  assert.equal(NUR_ALEM_HEIGHT, 32.5);
  assert.equal(NUR_ALEM_SPHERE_CENTRE_Y + NUR_ALEM_SPHERE_RADIUS, NUR_ALEM_HEIGHT);
  assert.deepEqual(astanaLandmarkSiteById["nur-alem-expo-plot"].center, NUR_ALEM_CENTRE);
  assert.deepEqual(astanaLandmarkSiteById["nur-alem-expo-plot"].radius, [22, 22]);
});

test("the sphere is smooth glass over a shared exterior diamond topology", () => {
  const shell = pieces(":nur-alem-shell:nur-alem:smooth-double-curved-glass:");
  const frame = pieces(":nur-alem-frame:nur-alem:frame:")
    .filter((piece) => !piece.id.includes(":wind-scoop-rim:"));
  const expectedEdges =
    NUR_ALEM_LATITUDE_COUNT * NUR_ALEM_LONGITUDE_COUNT
    + (NUR_ALEM_LATITUDE_COUNT - 1) * NUR_ALEM_LONGITUDE_COUNT * 2
    + NUR_ALEM_LONGITUDE_COUNT * 2;
  assert.equal(shell.length, 1);
  assert.equal(shell[0].shape, "sphere");
  assert.deepEqual(shell[0].size, [26, 26, 26]);
  assert.equal(NUR_ALEM_FRAME_EDGES.length, expectedEdges);
  assert.equal(frame.length, expectedEdges);

  for (const edge of NUR_ALEM_FRAME_EDGES) {
    for (const point of [edge.from, edge.to]) {
      const radius = Math.hypot(
        point[0] - NUR_ALEM_CENTRE[0],
        point[1] - shell[0].position[1],
        point[2] - NUR_ALEM_CENTRE[1],
      );
      assert.ok(Math.abs(radius - (NUR_ALEM_SPHERE_RADIUS + 0.07)) < 1e-8);
    }
  }
});

test("the sphere contains the documented double core and eight floor plates", () => {
  assert.equal(pieces(":nur-alem-core:nur-alem:double-core:").length, 2);
  assert.equal(pieces(":nur-alem-core:nur-alem:floor:").length, NUR_ALEM_FLOOR_COUNT);
  assert.equal(pieces(":nur-alem-foundation:nur-alem:sphere-collar:").length, 0,
    "a cylindrical collar returned beneath the real concave glazed saddle");
  assert.equal(pieces(":nur-alem-foundation:nur-alem:glazed-saddle:panel:").length,
    NUR_ALEM_NECK_BANDS * NUR_ALEM_NECK_SEGMENTS);
  assert.equal(pieces(":nur-alem-foundation:nur-alem:frame:saddle-mullion:").length,
    NUR_ALEM_NECK_SEGMENTS);
  assert.equal(pieces(":nur-alem-foundation:nur-alem:frame:saddle-ring:").length,
    (NUR_ALEM_NECK_BANDS + 1) * NUR_ALEM_NECK_SEGMENTS);
  assert.equal(pieces(":nur-alem-frame:nur-alem:wind-scoop:recess:").length, 1);
  assert.equal(pieces(":nur-alem-frame:nur-alem:frame:wind-scoop-rim:").length, 18);
});

test("four separate crescent pavilions define the agreed Expo complex", () => {
  assert.equal(pieces(":nur-alem-complex:nur-alem:petal:")
    .filter((piece) => piece.id.includes(":roof:")).length,
  NUR_ALEM_PETAL_COUNT * NUR_ALEM_PETAL_SEGMENTS);
  assert.equal(pieces(":nur-alem-complex:nur-alem:petal:")
    .filter((piece) => piece.id.includes(":glass:")).length,
  NUR_ALEM_PETAL_COUNT * NUR_ALEM_PETAL_SEGMENTS * 2);
  assert.equal(pieces(":nur-alem-complex:nur-alem:connector:")
    .filter((piece) => piece.id.includes(":roof:")).length,
  NUR_ALEM_PETAL_COUNT * NUR_ALEM_CONNECTOR_SEGMENTS);
  assert.equal(pieces(":nur-alem-complex:nur-alem:connector:")
    .filter((piece) => piece.id.includes(":glass:")).length,
  NUR_ALEM_PETAL_COUNT * NUR_ALEM_CONNECTOR_SEGMENTS * 2);
  assert.equal(pieces(":city-site-massing:massing:nur-alem-expo-plot:").length, 0);
  assert.equal(pieces(":city-framework:expo:").length, 0);
});

test("twelve concealed interior lights colour the sphere only at night", () => {
  const nodes = pieces(":nur-alem-lighting:nur-alem:hidden-sphere-light:");
  const lights = astanaScene.lampDefinitions.filter((lamp) =>
    lamp.id.includes(":nur-alem-lighting:nur-alem:hidden-sphere-light:"));
  assert.equal(nodes.length, 12);
  assert.equal(lights.length, 12);
  assert.ok(nodes.every((piece) => Math.max(...piece.size) <= 0.09));
  assert.ok(lights.every((lamp) =>
    lamp.dayIntensityFactor === 0
      && lamp.distance >= 38
      && lamp.intensity >= 24
      && lamp.poolGroupId === "astana:nur-alem:sphere"));
});
