import assert from "node:assert/strict";
import test from "node:test";
import {
  DUTCH_BRIDGE_CLEAR_SPAN,
  DUTCH_BRIDGE_DECK_WIDTH,
  DUTCH_PATH_SUBBASE_WIDTH,
  DUTCH_PATH_WIDTH,
  dutchLandscapeBridgeParts,
  dutchLandscapeFieldParts,
  dutchLandscapeFenceParts,
  dutchLandscapeHedgeParts,
  dutchLandscapeKitObject,
  dutchLandscapeRevetmentParts,
  dutchLandscapeWallParts,
  dutchLandscapeWillowParts,
} from "../games/make-a-mess/src/content/objects/dutchLandscape/dutchLandscapeKitObject.ts";

const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

test("мост хранит отдельные опоры, несущие прогоны, настил и парные ограждения", () => {
  assert.equal(DUTCH_BRIDGE_CLEAR_SPAN, 4.2);
  assert.equal(DUTCH_BRIDGE_DECK_WIDTH, 2.52);
  assert.equal(dutchLandscapeBridgeParts.filter(({ id }) => id.startsWith("bridge-stringer:")).length, 12);
  assert.equal(dutchLandscapeBridgeParts.filter(({ id }) => id.startsWith("bridge-deck:")).length, 15);
  assert.equal(dutchLandscapeBridgeParts.filter(({ id }) => id.startsWith("bridge-post:")).length, 14);
  assert.equal(dutchLandscapeBridgeParts.filter(({ id }) => id.startsWith("bridge-handrail:")).length, 12);
  assert.equal(dutchLandscapeBridgeParts.filter(({ id }) => id.startsWith("bridge-abutment:-1:")).length, 14);
  assert.equal(dutchLandscapeBridgeParts.filter(({ id }) => id.startsWith("bridge-abutment:1:")).length, 14);
});

test("дорожка имеет более широкое земляное основание под чистовым ракушечником", () => {
  assert.equal(DUTCH_PATH_WIDTH, 2.2);
  assert.equal(DUTCH_PATH_SUBBASE_WIDTH, 2.5);
  assert.ok(DUTCH_PATH_SUBBASE_WIDTH > DUTCH_PATH_WIDTH);
  const shell = dutchLandscapeKitObject.parts.find(({ id }) => id === "path-shell");
  const subbase = dutchLandscapeKitObject.parts.find(({ id }) => id === "path-subbase");
  assert.equal(shell.kind, "box");
  assert.equal(subbase.kind, "box");
  assert.ok(shell.center[1] > subbase.center[1]);
});

test("кладка перевязана чередующимися рядами и закрыта отдельными capstones", () => {
  const courses = [0, 1, 2, 3].map((course) =>
    dutchLandscapeWallParts.filter(({ id }) => id.startsWith(`wall-course:${course}:`)).length,
  );
  assert.deepEqual(courses, [6, 5, 6, 5]);
  assert.equal(dutchLandscapeWallParts.filter(({ id }) => id.startsWith("wall-cap:")).length, 5);
});

test("грядка не является цветной плитой: земля, стебли и цветы разделены", () => {
  assert.equal(dutchLandscapeFieldParts.filter(({ id }) => id.startsWith("field-ridge:")).length, 4);
  assert.equal(dutchLandscapeFieldParts.filter(({ id }) => id.startsWith("field-stem:")).length, 52);
  assert.equal(dutchLandscapeFieldParts.filter(({ id }) => id.startsWith("field-flower:")).length, 52);
  assert.equal(new Set(dutchLandscapeFieldParts.filter(({ id }) => id.startsWith("field-flower:")).map(({ material }) => material)).size, 4);
});

test("берегоукрепление имеет шпунты, ригели и анкеры в сушу", () => {
  assert.equal(dutchLandscapeRevetmentParts.filter(({ id }) => id.startsWith("revetment-sheet:")).length, 13);
  assert.equal(dutchLandscapeRevetmentParts.filter(({ id }) => id.startsWith("revetment-waler:")).length, 2);
  assert.equal(dutchLandscapeRevetmentParts.filter(({ id }) => id.startsWith("revetment-anchor:")).length, 5);
});

test("полевой край остаётся конструкцией: ива, ограда и живая изгородь имеют древесный каркас", () => {
  assert.equal(dutchLandscapeWillowParts.filter(({ id }) => id === "willow-trunk").length, 1);
  assert.equal(dutchLandscapeWillowParts.filter(({ id }) => id.startsWith("willow-branch:")).length, 5);
  assert.equal(dutchLandscapeWillowParts.filter(({ id }) => id.startsWith("willow-crown:")).length, 5);
  assert.equal(dutchLandscapeFenceParts.filter(({ id }) => id.startsWith("fence-post:")).length, 4);
  assert.equal(dutchLandscapeFenceParts.filter(({ id }) => id.startsWith("fence-rail:")).length, 2);
  assert.equal(dutchLandscapeHedgeParts.filter(({ id }) => id.startsWith("hedge-stem:")).length, 7);
  assert.equal(dutchLandscapeHedgeParts.filter(({ id }) => id.startsWith("hedge-crown:")).length, 7);
  assert.ok(dutchLandscapeHedgeParts.filter(({ id }) => id.startsWith("hedge-crown:")).every(({ kind }) => kind === "mesh"));
});

test("все детали уникальны и невырождены", () => {
  assert.equal(new Set(dutchLandscapeKitObject.parts.map(({ id }) => id)).size, dutchLandscapeKitObject.parts.length);
  for (const part of dutchLandscapeKitObject.parts) {
    if (part.kind === "box") assert.ok(part.size.every((value) => value > 0), part.id);
    if (part.kind === "beam" || part.kind === "cylinder") assert.ok(distance(part.from, part.to) > 0.01, part.id);
  }
});
