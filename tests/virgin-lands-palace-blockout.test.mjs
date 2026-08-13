import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { virginLandsPalaceBlockoutObject } from "../games/make-a-mess/src/content/objects/astana/virginLandsPalaceBlockoutObject.ts";

const contour = JSON.parse(readFileSync(new URL(
  "../games/make-a-mess/docs/virgin-lands-palace/contour-contract-c01.json",
  import.meta.url,
), "utf8"));

const expected = new Map(contour.characteristics.map(({ id, value }) => [id, value]));

function partPoints(part) {
  if (part.kind === "box") {
    const [x, y, z] = part.center;
    const [width, height, depth] = part.size;
    return [
      [x - width / 2, y - height / 2, z - depth / 2],
      [x + width / 2, y + height / 2, z + depth / 2],
    ];
  }
  if (part.kind === "mesh") return part.vertices;
  return [part.from, part.to];
}

function bounds(parts) {
  const points = parts.flatMap(partPoints);
  return {
    minX: Math.min(...points.map(([x]) => x)),
    maxX: Math.max(...points.map(([x]) => x)),
    minY: Math.min(...points.map(([, y]) => y)),
    maxY: Math.max(...points.map(([, y]) => y)),
    minZ: Math.min(...points.map(([, , z]) => z)),
    maxZ: Math.max(...points.map(([, , z]) => z)),
  };
}

const extent = (box, axis) => box[`max${axis}`] - box[`min${axis}`];
const assertNear = (actual, expectedValue, tolerance = 1e-9) =>
  assert.ok(Math.abs(actual - expectedValue) <= tolerance, `${actual} != ${expectedValue}`);

test("B01 reconstructs the owner-approved C01 envelope from emitted parts", () => {
  const envelope = bounds(virginLandsPalaceBlockoutObject.parts);
  assert.equal(extent(envelope, "X"), expected.get("scene-overall-width"));
  assert.equal(extent(envelope, "Z"), expected.get("scene-overall-depth"));
  assert.equal(envelope.minY, 0);
  assert.equal(envelope.maxY, expected.get("scene-overall-height"));
});

test("the auditorium recovers the approved asymmetric placement", () => {
  const auditorium = virginLandsPalaceBlockoutObject.parts.filter(
    (part) => part.group === "auditorium-shell",
  );
  assert.equal(auditorium.length, 1);
  const hall = bounds(auditorium);
  assert.equal(extent(hall, "X"), expected.get("scene-auditorium-width"));
  assert.equal(extent(hall, "Z"), expected.get("scene-auditorium-depth"));
  assert.equal((hall.minX + hall.maxX) / 2, expected.get("scene-hall-x-offset"));
  assert.equal((hall.minZ + hall.maxZ) / 2, expected.get("scene-hall-z-offset"));

  const palace = bounds(virginLandsPalaceBlockoutObject.parts);
  assert.equal(palace.maxZ - hall.maxZ, expected.get("scene-front-foyer-depth"));
  assert.equal(palace.maxX - hall.maxX, expected.get("scene-right-foyer-width"));
});

test("the low foyer is a wrap of separate bars, not a centred podium box", () => {
  const upper = virginLandsPalaceBlockoutObject.parts.filter(
    (part) => part.group === "foyer-upper",
  );
  assert.equal(upper.length, 4);
  assert.ok(upper.every((part) => part.kind === "box"));
  assert.ok(upper.some((part) => part.id === "foyer-upper-square-bar"));
  assert.ok(upper.some((part) => part.id === "foyer-upper-right-wing"));
  assert.ok(!virginLandsPalaceBlockoutObject.parts.some(
    (part) => part.kind === "box" && part.size[0] === 48 && part.size[2] === 34,
  ));
});

test("the recessed lower storey is real geometry behind the upper contour", () => {
  const upper = bounds(virginLandsPalaceBlockoutObject.parts.filter(
    (part) => part.group === "foyer-upper",
  ));
  const lower = bounds(virginLandsPalaceBlockoutObject.parts.filter(
    (part) => part.group === "foyer-lower-core",
  ));
  assertNear(upper.minY, expected.get("scene-foyer-recess-height"));
  assert.equal(upper.maxY, expected.get("scene-foyer-height"));
  assert.equal(lower.minY, 0);
  assert.equal(lower.maxY, expected.get("scene-foyer-recess-height"));
  assert.ok(lower.minX > upper.minX);
  assert.ok(lower.maxX < upper.maxX);
  assert.ok(lower.minZ > upper.minZ);
  assert.ok(lower.maxZ < upper.maxZ);
});

test("four roof planes own one shallow hipped silhouette", () => {
  const roof = virginLandsPalaceBlockoutObject.parts.filter(
    (part) => part.group === "auditorium-roof",
  );
  assert.equal(roof.length, 4);
  assert.ok(roof.every((part) => part.kind === "mesh"));
  const roofBounds = bounds(roof);
  assert.equal(roofBounds.minY, expected.get("scene-auditorium-eave-height"));
  assertNear(
    roofBounds.maxY - roofBounds.minY,
    expected.get("scene-roof-rise"),
  );
});

test("B01 stays static, isolated and free of deferred facade detail", () => {
  assert.equal(virginLandsPalaceBlockoutObject.motionConstraints?.staticObject, true);
  assert.equal(
    virginLandsPalaceBlockoutObject.motionConstraints?.worldIntegrationDeferred,
    true,
  );
  assert.ok(!virginLandsPalaceBlockoutObject.parts.some((part) =>
    /window|sign|letter|mullion|column|equipment/.test(part.id)
  ));
});

test("all blockout parts are unique and non-degenerate", () => {
  const parts = virginLandsPalaceBlockoutObject.parts;
  assert.equal(new Set(parts.map((part) => part.id)).size, parts.length);
  for (const part of parts) {
    if (part.kind === "box") assert.ok(part.size.every((value) => value > 0.02), part.id);
    if (part.kind === "mesh") {
      assert.ok(part.vertices.length >= 3, part.id);
      assert.ok(part.triangles.length >= 1, part.id);
    }
  }
});

test("fixed views expose every accepted and inferred Tier A projection", () => {
  assert.deepEqual(virginLandsPalaceBlockoutObject.views.map(({ id }) => id), [
    "front-1983-camera",
    "front",
    "right-profile",
    "left-profile",
    "rear",
    "top",
    "three-quarter-left",
    "three-quarter-right",
    "high-three-quarter",
    "silhouette",
  ]);
});
