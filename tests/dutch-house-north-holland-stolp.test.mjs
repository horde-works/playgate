import assert from "node:assert/strict";
import test from "node:test";
import {
  STOLP_CLEARANCE_RADIUS,
  STOLP_COMBINED_WALL_DEPTH,
  STOLP_CROWN_Y,
  STOLP_EAVE_Y,
  STOLP_MAIN_WALL_DEPTH,
  STOLP_MAIN_WALL_WIDTH,
  STOLP_ROOF_ENVELOPE_DEPTH,
  STOLP_ROOF_ENVELOPE_WIDTH,
  STOLP_TAIL_DEPTH,
  STOLP_TAIL_WIDTH,
  STOLP_VIERKANT_DEPTH,
  STOLP_VIERKANT_WIDTH,
  northHollandStolpFarmObject,
} from "../games/make-a-mess/src/content/objects/dutchHouses/northHollandStolpFarmObject.ts";

const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

test("H2 records main, combined and roof bounds as different contracts", () => {
  assert.equal(STOLP_MAIN_WALL_WIDTH, 14.6);
  assert.equal(STOLP_MAIN_WALL_DEPTH, 13.4);
  assert.equal(STOLP_COMBINED_WALL_DEPTH, 19.3);
  assert.equal(STOLP_ROOF_ENVELOPE_WIDTH, 15.44);
  assert.equal(STOLP_ROOF_ENVELOPE_DEPTH, 20.53);
  assert.equal(STOLP_EAVE_Y, 3.25);
  assert.equal(STOLP_CROWN_Y, 10.7);
  assert.ok(STOLP_COMBINED_WALL_DEPTH > STOLP_MAIN_WALL_DEPTH);
  assert.ok(STOLP_ROOF_ENVELOPE_DEPTH > STOLP_COMBINED_WALL_DEPTH);
});

test("the complete roof envelope is reconstructed from final skin vertices", () => {
  const roofGroups = new Set(["main-roof-skin", "front-gable-roof", "tail-roof"]);
  const vertices = northHollandStolpFarmObject.parts.flatMap((part) =>
    part.kind === "mesh" && roofGroups.has(part.group) ? part.vertices : []
  );
  assert.equal(Math.max(...vertices.map(([x]) => x)) - Math.min(...vertices.map(([x]) => x)), STOLP_ROOF_ENVELOPE_WIDTH);
  assert.ok(Math.abs(Math.max(...vertices.map(([, , z]) => z)) - Math.min(...vertices.map(([, , z]) => z)) - STOLP_ROOF_ENVELOPE_DEPTH) < 1e-9);
  const reconstructedRadius = Math.hypot(STOLP_ROOF_ENVELOPE_WIDTH, STOLP_ROOF_ENVELOPE_DEPTH) / 2;
  assert.ok(reconstructedRadius < STOLP_CLEARANCE_RADIUS);
  assert.ok(STOLP_CLEARANCE_RADIUS - reconstructedRadius < 0.2);
});

test("four posts and four plates form the load-bearing vierkant", () => {
  assert.equal(STOLP_VIERKANT_WIDTH, 7.4);
  assert.equal(STOLP_VIERKANT_DEPTH, 7.0);
  const posts = northHollandStolpFarmObject.parts.filter((part) => part.id.startsWith("vierkant-post-"));
  const plates = northHollandStolpFarmObject.parts.filter((part) => part.id.startsWith("vierkant-plate-"));
  assert.equal(posts.length, 4);
  assert.equal(plates.length, 4);
  assert.ok(posts.every((part) => part.kind === "beam" && part.from[1] === 0.38 && part.to[1] === 4.12));
  assert.deepEqual(new Set(posts.map((part) => part.kind === "beam" ? `${Math.abs(part.from[0])}:${Math.abs(part.from[2])}` : "")), new Set(["3.7:3.5"]));
});

test("principal rafters land on the vierkant before rising to the crown", () => {
  const inner = northHollandStolpFarmObject.parts.filter((part) => /-(front|rear|left|right)-inner-rafter-/.test(`-${part.id}`));
  const outer = northHollandStolpFarmObject.parts.filter((part) => /-(front|rear|left|right)-outer-rafter-/.test(`-${part.id}`));
  assert.equal(inner.length, 12);
  assert.equal(outer.length, 12);
  assert.ok(inner.every((part) => part.kind === "beam" && part.from[1] === 4.02 && part.to[1] === 10.34));
  assert.ok(outer.every((part) => part.kind === "beam" && part.to[1] === 4.02));
  assert.ok(inner.every((part) => part.kind === "beam" && STOLP_CROWN_Y - part.to[1] >= 0.35));
});

test("six front bays are holes in brickwork, including two paired garden doors", () => {
  const openings = northHollandStolpFarmObject.parts.filter((part) => /^front-window-.*-opening$|^garden-door-pair-.*-opening$/.test(part.id));
  assert.equal(openings.length, 6);
  assert.equal(openings.filter((part) => part.id.startsWith("garden-door-pair-")).length, 2);
  const courses = northHollandStolpFarmObject.parts.filter((part) => /^front-brick-course-/.test(part.id));
  const gaps = [
    [-5.95, -4.75, 0.95, 2.58], [-4.25, -3.05, 0.95, 2.58],
    [-2.05, -0.25, 0.42, 2.72], [0.25, 2.05, 0.42, 2.72],
    [3.05, 4.25, 0.95, 2.58], [4.75, 5.95, 0.95, 2.58],
  ];
  for (const part of courses) {
    assert.equal(part.kind, "box");
    for (const [x0, x1, y0, y1] of gaps) {
      const overlapsX = part.center[0] + part.size[0] / 2 > x0 + 1e-6 && part.center[0] - part.size[0] / 2 < x1 - 1e-6;
      const overlapsY = part.center[1] + part.size[1] / 2 > y0 + 1e-6 && part.center[1] - part.size[1] / 2 < y1 - 1e-6;
      assert.ok(!(overlapsX && overlapsY), `${part.id} closes a front opening`);
    }
  }
});

test("garden and dars leaves remain attached to their own hinges", () => {
  assert.equal(northHollandStolpFarmObject.parts.filter((part) => part.id.startsWith("garden-door-hinge-")).length, 12);
  const darsLeaves = northHollandStolpFarmObject.parts.filter((part) => /^rear-dars-leaf-(left|right)$/.test(part.id));
  const darsHinges = northHollandStolpFarmObject.parts.filter((part) => part.id.startsWith("rear-dars-hinge-"));
  assert.equal(darsLeaves.length, 2);
  assert.equal(darsHinges.length, 6);
  assert.ok(darsHinges.every((part) => part.kind === "box" && (Math.abs(part.center[0] + 6.22) < 1e-9 || Math.abs(part.center[0] + 1.38) < 1e-9)));
});

test("brick residence and timber barn are separate construction groups", () => {
  const residence = northHollandStolpFarmObject.parts.filter((part) => part.group === "residential-shell");
  const barn = northHollandStolpFarmObject.parts.filter((part) => part.group === "barn-shell");
  assert.ok(residence.length > 20);
  assert.ok(barn.length > 30);
  assert.ok(residence.every((part) => part.material === "brick"));
  assert.ok(barn.every((part) => part.material === "cladding"));
});

test("rear tail is an open framed continuation, not a sealed intersecting box", () => {
  assert.equal(STOLP_TAIL_WIDTH, 5.0);
  assert.equal(STOLP_TAIL_DEPTH, 7.2);
  const junction = northHollandStolpFarmObject.parts.filter((part) => part.group === "tail-junction");
  assert.equal(junction.length, 5);
  assert.ok(junction.some((part) => part.id === "tail-junction-header"));
  assert.equal(junction.filter((part) => part.id.includes("flashing")).length, 2);
  assert.ok(!northHollandStolpFarmObject.parts.some((part) => part.group === "tail-shell" && part.kind === "box" && Math.abs(part.center[2] + 5.4) < 0.1));
});

test("tail roof emerges through a controlled rear bay with a continuous underlay", () => {
  assert.ok(northHollandStolpFarmObject.parts.some((part) => part.id === "main-roof-rear-tail-underlay"));
  assert.ok(northHollandStolpFarmObject.parts.some((part) => part.id === "tail-roof-left"));
  assert.ok(northHollandStolpFarmObject.parts.some((part) => part.id === "tail-roof-right"));
  assert.ok(northHollandStolpFarmObject.parts.some((part) => part.id === "tail-roof-ridge-cap"));
});

test("H2 is static and carries no rotor or wind contract", () => {
  assert.equal(northHollandStolpFarmObject.rotor, undefined);
  assert.equal(northHollandStolpFarmObject.motionConstraints?.staticObject, true);
  assert.equal(northHollandStolpFarmObject.motionConstraints?.windSimulation, false);
});

test("all final parts are unique and non-degenerate", () => {
  assert.equal(new Set(northHollandStolpFarmObject.parts.map((part) => part.id)).size, northHollandStolpFarmObject.parts.length);
  for (const part of northHollandStolpFarmObject.parts) {
    if (part.kind === "beam" || part.kind === "cylinder") assert.ok(distance(part.from, part.to) > 0.04, part.id);
    if (part.kind === "box") assert.ok(part.size.every((size) => size > 0.02), part.id);
    if (part.kind === "mesh") {
      assert.ok(part.vertices.length >= 3, part.id);
      assert.ok(part.triangles.length >= 1, part.id);
    }
  }
});

test("acceptance cameras separate exterior, load path and tail joint", () => {
  assert.deepEqual(northHollandStolpFarmObject.views.map((view) => view.id), [
    "front", "left", "rear", "right", "three-quarter-left", "three-quarter-right",
    "high-three-quarter", "vierkant-cutaway", "tail-junction-cutaway", "night-residence", "silhouette",
  ]);
  assert.ok(northHollandStolpFarmObject.views.find((view) => view.id === "vierkant-cutaway")?.hiddenGroups?.includes("main-roof-skin"));
  assert.ok(northHollandStolpFarmObject.views.find((view) => view.id === "tail-junction-cutaway")?.hiddenGroups?.includes("tail-roof"));
});
