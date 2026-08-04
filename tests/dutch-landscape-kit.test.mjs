import assert from "node:assert/strict";
import test from "node:test";
import {
  DUTCH_BEAN_FRAME_BED_HEIGHT,
  DUTCH_BEAN_FRAME_POLE_DIAMETER,
  DUTCH_BEAN_FRAME_POLE_LENGTH,
  DUTCH_BEAN_FRAME_RIDGE_DIAMETER,
  DUTCH_BEAN_FRAME_ROW_SPACING,
  DUTCH_BEAN_FRAME_STATION_PITCH,
  DUTCH_BEAN_FRAME_TIE_Y,
  DUTCH_BRIDGE_CLEAR_SPAN,
  DUTCH_BRIDGE_DECK_WIDTH,
  DUTCH_DRYING_LINE_CROSSBAR_LENGTH,
  DUTCH_DRYING_LINE_DIAMETER,
  DUTCH_DRYING_LINE_POST_HEIGHT,
  DUTCH_DRYING_LINE_POST_SECTION,
  DUTCH_DRYING_LINE_PROP_LENGTH,
  DUTCH_DRYING_LINE_SAG,
  DUTCH_DRYING_LINE_SPAN,
  DUTCH_HAND_PUMP_BUCKET_DIAMETER,
  DUTCH_HAND_PUMP_BUCKET_HEIGHT,
  DUTCH_HAND_PUMP_COLUMN_DIAMETER,
  DUTCH_HAND_PUMP_COLUMN_HEIGHT,
  DUTCH_HAND_PUMP_LEVER_LENGTH,
  DUTCH_HAND_PUMP_PIVOT_DIAMETER,
  DUTCH_HAND_PUMP_SPOUT_PROJECTION,
  DUTCH_HAND_PUMP_SPOUT_Y,
  DUTCH_HAND_PUMP_STONE_HEIGHT,
  DUTCH_HAND_PUMP_STONE_SIZE,
  DUTCH_JETTY_DECK_TOP_Y,
  DUTCH_JETTY_LENGTH,
  DUTCH_JETTY_WATERLINE_Y,
  DUTCH_JETTY_WIDTH,
  DUTCH_MOORING_POST_SPACING,
  DUTCH_MOORING_POST_WATERLINE_Y,
  DUTCH_MOORING_RING_HEIGHT_ABOVE_WATER,
  DUTCH_PATH_SUBBASE_WIDTH,
  DUTCH_PATH_WIDTH,
  DUTCH_PEAT_BRICK_GAP,
  DUTCH_PEAT_BRICK_YAW,
  DUTCH_PEAT_STACK_HEIGHT,
  DUTCH_PEAT_STACK_LENGTH,
  DUTCH_PEAT_STORE_DEPTH,
  DUTCH_PEAT_STORE_FRONT_POST_HEIGHT,
  DUTCH_PEAT_STORE_REAR_POST_HEIGHT,
  DUTCH_PEAT_STORE_ROOF_PITCH,
  DUTCH_PEAT_STORE_WIDTH,
  DUTCH_PRIVY_BANK_EDGE_Z,
  DUTCH_PRIVY_CANTILEVER_PROJECTION,
  DUTCH_PRIVY_DEPTH,
  DUTCH_PRIVY_DOOR_HEIGHT,
  DUTCH_PRIVY_DOOR_WIDTH,
  DUTCH_PRIVY_FRONT_EAVE,
  DUTCH_PRIVY_HEART_CENTER_Y,
  DUTCH_PRIVY_HEART_SIZE,
  DUTCH_PRIVY_REAR_EAVE,
  DUTCH_PRIVY_ROOF_PITCH,
  DUTCH_PRIVY_WIDTH,
  DUTCH_RAIN_BARREL_BRICK_HEIGHT,
  DUTCH_RAIN_BARREL_DIAMETER,
  DUTCH_RAIN_BARREL_DOWNSPOUT_SIZE,
  DUTCH_RAIN_BARREL_HEIGHT,
  DUTCH_RAIN_BARREL_HOOP_COUNT,
  DUTCH_RAIN_BARREL_OUTLET_CLEARANCE,
  DUTCH_RAIN_BARREL_STAVE_COUNT,
  DUTCH_PICKET_FENCE_MODULE_LENGTH,
  DUTCH_PICKET_FENCE_PICKET_GAP,
  DUTCH_PICKET_FENCE_PICKET_PITCH,
  DUTCH_PICKET_FENCE_PICKET_WIDTH,
  DUTCH_PICKET_GATE_HEIGHT,
  DUTCH_PICKET_GATE_WIDTH,
  DUTCH_SCHOUW_BEAM,
  DUTCH_SCHOUW_LENGTH,
  DUTCH_SCHOUW_LIGHT_DRAUGHT,
  dutchLandscapeBridgeParts,
  dutchLandscapeBeanFrameParts,
  dutchLandscapeDryingLineParts,
  dutchLandscapeFieldParts,
  dutchLandscapeFenceParts,
  dutchLandscapeHandPumpParts,
  dutchLandscapeHedgeParts,
  dutchLandscapeJettyParts,
  dutchLandscapeKitObject,
  dutchLandscapeMooringPostParts,
  dutchLandscapePeatStoreParts,
  dutchLandscapePicketFenceParts,
  dutchLandscapePrivyParts,
  dutchLandscapeRainBarrelParts,
  dutchLandscapeRevetmentParts,
  dutchLandscapeSchouwParts,
  dutchLandscapeWallParts,
  dutchLandscapeWillowParts,
} from "../games/make-a-mess/src/content/objects/dutchLandscape/dutchLandscapeKitObject.ts";

const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const distanceToSegment = (pointValue, from, to) => {
  const delta = to.map((value, axis) => value - from[axis]);
  const offset = pointValue.map((value, axis) => value - from[axis]);
  const lengthSquared = delta.reduce((sum, value) => sum + value ** 2, 0);
  const t = Math.max(0, Math.min(1, offset.reduce((sum, value, axis) => sum + value * delta[axis], 0) / lengthSquared));
  return distance(pointValue, from.map((value, axis) => value + delta[axis] * t));
};
const approx = (actual, expected, tolerance = 1e-9) => assert.ok(
  Math.abs(actual - expected) <= tolerance,
  `expected ${actual} to be within ${tolerance} of ${expected}`,
);
const meshBounds = (part) => {
  assert.equal(part.kind, "mesh");
  return [0, 1, 2].map((axis) => [
    Math.min(...part.vertices.map((vertex) => vertex[axis])),
    Math.max(...part.vertices.map((vertex) => vertex[axis])),
  ]);
};
const boxBounds = (part) => {
  assert.equal(part.kind, "box");
  return [0, 1, 2].map((axis) => [
    part.center[axis] - part.size[axis] / 2,
    part.center[axis] + part.size[axis] / 2,
  ]);
};
const intervalOverlap = ([aMin, aMax], [bMin, bMax]) => Math.min(aMax, bMax) - Math.max(aMin, bMin);
const yawedBoxBounds = (part) => {
  assert.equal(part.kind, "box");
  const yaw = part.rotation?.[1] ?? 0;
  const halfX = (Math.abs(part.size[0] * Math.cos(yaw)) + Math.abs(part.size[2] * Math.sin(yaw))) / 2;
  const halfZ = (Math.abs(part.size[0] * Math.sin(yaw)) + Math.abs(part.size[2] * Math.cos(yaw))) / 2;
  return [
    [part.center[0] - halfX, part.center[0] + halfX],
    [part.center[1] - part.size[1] / 2, part.center[1] + part.size[1] / 2],
    [part.center[2] - halfZ, part.center[2] + halfZ],
  ];
};
const pointInRotatedXBoxFrame = (pointValue, box) => {
  assert.equal(box.kind, "box");
  const angle = box.rotation?.[0] ?? 0;
  const dx = pointValue[0] - box.center[0];
  const dy = pointValue[1] - box.center[1];
  const dz = pointValue[2] - box.center[2];
  return [
    dx,
    Math.cos(angle) * dy + Math.sin(angle) * dz,
    -Math.sin(angle) * dy + Math.cos(angle) * dz,
  ];
};
const pointInTriangle2D = ([px, py], [a, b, c]) => {
  const signed = ([x1, y1], [x2, y2], [x3, y3]) =>
    (x1 - x3) * (y2 - y3) - (x2 - x3) * (y1 - y3);
  const d1 = signed([px, py], a, b);
  const d2 = signed([px, py], b, c);
  const d3 = signed([px, py], c, a);
  return !(d1 < 0 || d2 < 0 || d3 < 0) || !(d1 > 0 || d2 > 0 || d3 > 0);
};

test("schouw восстанавливает принятый плоскодонный корпус, набор и ватерлинию", () => {
  assert.ok(dutchLandscapeSchouwParts.length <= 60);
  assert.equal(dutchLandscapeSchouwParts.filter(({ id }) => id.startsWith("schouw-bottom:")).length, 12);
  assert.equal(dutchLandscapeSchouwParts.filter(({ id }) => id.startsWith("schouw-side:")).length, 4);
  assert.equal(dutchLandscapeSchouwParts.filter(({ id }) => id.startsWith("schouw-frame:")).length, 15);
  assert.equal(dutchLandscapeSchouwParts.filter(({ id }) => id.startsWith("schouw-bench:")).length, 2);
  assert.equal(dutchLandscapeSchouwParts.filter(({ id }) => id.endsWith(":shaft") && id.startsWith("schouw-oar:")).length, 2);

  const transomVertices = dutchLandscapeSchouwParts
    .filter(({ id }) => id.startsWith("schouw-transom:") && !id.startsWith("schouw-transom-trim:"))
    .flatMap(({ kind, vertices }) => kind === "mesh" ? vertices : []);
  approx(Math.max(...transomVertices.map((vertex) => vertex[2])) - Math.min(...transomVertices.map((vertex) => vertex[2])), DUTCH_SCHOUW_LENGTH);

  for (const end of ["bow", "stern"]) {
    const transom = dutchLandscapeSchouwParts.find(({ id }) => id === `schouw-transom:${end}`);
    assert.equal(transom.kind, "mesh");
    const endSign = end === "bow" ? 1 : -1;
    const lower = transom.vertices.find(([x, y, z]) => x < 0 && y === 0.03 && Math.sign(z) === endSign);
    const upper = transom.vertices.find(([x, y, z]) => x < 0 && y === 0.38 && Math.sign(z) === endSign);
    const rakeFromVertical = Math.atan2(Math.abs(upper[2] - lower[2]), upper[1] - lower[1]) * 180 / Math.PI;
    approx(rakeFromVertical, 30, 2);
  }

  const gunwales = dutchLandscapeSchouwParts.filter(({ id }) => id.startsWith("schouw-gunwale:"));
  const gunwaleOuter = Math.max(...gunwales.flatMap(({ kind, vertices }) =>
    kind === "mesh" ? vertices.map(([x]) => Math.abs(x)) : []));
  approx(gunwaleOuter * 2, DUTCH_SCHOUW_BEAM);

  const flatBottom = dutchLandscapeSchouwParts.filter(({ id }) => id.includes("schouw-bottom:") && id.endsWith(":mid"));
  const bottomY = Math.min(...flatBottom.map(({ kind, center, size }) => kind === "box" ? center[1] - size[1] / 2 : Infinity));
  approx(bottomY, -DUTCH_SCHOUW_LIGHT_DRAUGHT);
  const flatTopY = flatBottom[0].center[1] + flatBottom[0].size[1] / 2;
  for (const end of dutchLandscapeSchouwParts.filter(({ id }) => id.startsWith("schouw-bottom:") && !id.endsWith(":mid"))) {
    assert.equal(end.kind, "box");
    const angle = Math.abs(end.rotation[0]);
    const innerTopY = end.center[1]
      + end.size[1] / 2 * Math.cos(angle)
      - end.size[2] / 2 * Math.sin(angle);
    approx(innerTopY, flatTopY, 1e-9);
  }
  assert.deepEqual(dutchLandscapeKitObject.anchors.schouwWaterline, [0, 0, 0]);
});

test("причальные сваи остаются двухместным модулем с гранёными вершинами и коваными кольцами", () => {
  assert.ok(dutchLandscapeMooringPostParts.length <= 10);
  const wetShafts = dutchLandscapeMooringPostParts.filter(({ id }) => id.endsWith(":shaft:wet"));
  const dryShafts = dutchLandscapeMooringPostParts.filter(({ id }) => id.endsWith(":shaft:dry"));
  const caps = dutchLandscapeMooringPostParts.filter(({ id }) => id.endsWith(":cap"));
  const rings = dutchLandscapeMooringPostParts.filter(({ id }) => id.endsWith(":ring"));
  assert.equal(wetShafts.length, 2);
  assert.equal(dryShafts.length, 2);
  assert.equal(caps.length, 2);
  assert.equal(rings.length, 2);
  approx(Math.abs(wetShafts[1].from[0] - wetShafts[0].from[0]), DUTCH_MOORING_POST_SPACING);
  assert.ok(wetShafts.every(({ kind, from, to, radius, radialSegments }) => kind === "cylinder" && from[1] === 0 && to[1] === DUTCH_MOORING_POST_WATERLINE_Y && radius === 0.09 && radialSegments === 8));
  assert.ok(dryShafts.every(({ kind, from, to, radius, radialSegments }) => kind === "cylinder" && from[1] === DUTCH_MOORING_POST_WATERLINE_Y && to[1] === 1.5 && radius === 0.09 && radialSegments === 8));
  assert.ok(caps.every(({ kind, vertices }) => kind === "mesh" && Math.max(...vertices.map((vertex) => vertex[1])) === 1.6));
  assert.ok(rings.every(({ kind, material }) => kind === "mesh" && material === "metal"));
  for (const ring of rings) {
    const ringCentreY = (Math.min(...ring.vertices.map(([, y]) => y)) + Math.max(...ring.vertices.map(([, y]) => y))) / 2;
    approx(ringCentreY - DUTCH_MOORING_POST_WATERLINE_Y, DUTCH_MOORING_RING_HEIGHT_ABOVE_WATER);
  }
});

test("частные мостки имеют четыре сваи, два лежня, семь досок и две ступени без перил", () => {
  assert.ok(dutchLandscapeJettyParts.length <= 25);
  assert.equal(dutchLandscapeJettyParts.filter(({ id }) => id.startsWith("jetty-pile:")).length, 4);
  assert.equal(dutchLandscapeJettyParts.filter(({ id }) => id.startsWith("jetty-bearer:")).length, 2);
  const deckBoards = dutchLandscapeJettyParts.filter(({ id }) => id.startsWith("jetty-deck-board:"));
  assert.equal(deckBoards.length, 7);
  assert.equal(dutchLandscapeJettyParts.filter(({ id }) => id.startsWith("jetty-step:")).length, 2);
  assert.equal(dutchLandscapeJettyParts.filter(({ id }) => /rail/i.test(id)).length, 0);
  assert.ok(deckBoards.every(({ kind, size }) => kind === "box" && size[0] === 0.15 && size[1] === 0.032 && size[2] === DUTCH_JETTY_LENGTH));
  const deckMinX = Math.min(...deckBoards.map(({ center, size }) => center[0] - size[0] / 2));
  const deckMaxX = Math.max(...deckBoards.map(({ center, size }) => center[0] + size[0] / 2));
  approx(deckMaxX - deckMinX, DUTCH_JETTY_WIDTH, 0.011);
  const deckTop = Math.max(...deckBoards.map(({ center, size }) => center[1] + size[1] / 2));
  approx(deckTop, DUTCH_JETTY_DECK_TOP_Y);
  approx(deckTop - DUTCH_JETTY_WATERLINE_Y, 0.3);
  assert.ok(dutchLandscapeJettyParts.filter(({ id }) => id.startsWith("jetty-pile:")).every(({ from }) => from[1] === 0));

  const stringers = dutchLandscapeJettyParts.filter(({ id }) => id.startsWith("jetty-step-stringer:"));
  assert.equal(stringers.length, 2);
  for (const tread of dutchLandscapeJettyParts.filter(({ id }) => id.startsWith("jetty-step:"))) {
    const treadBottom = tread.center[1] - tread.size[1] / 2;
    const treadMinZ = tread.center[2] - tread.size[2] / 2;
    const treadMaxZ = tread.center[2] + tread.size[2] / 2;
    for (const stringer of stringers) {
      assert.equal(stringer.kind, "mesh");
      const ledge = stringer.vertices.filter(([, y, z]) =>
        Math.abs(y - treadBottom) < 1e-9 && (Math.abs(z - treadMinZ) < 1e-9 || Math.abs(z - treadMaxZ) < 1e-9));
      assert.equal(ledge.length, 4, `${stringer.id} must touch both tread edges on both extruded faces`);
      assert.ok(stringer.vertices.every(([, y, z]) => z <= treadMinZ + 1e-9 || z >= treadMaxZ - 1e-9 || y <= treadBottom + 1e-9));
    }
  }
});

test("домашний hekje сохраняет точный трёхметровый модуль и открытый шаг штакетин", () => {
  const moduleParts = dutchLandscapePicketFenceParts.filter(({ id }) => id.startsWith("picket-fence-"));
  const gateParts = dutchLandscapePicketFenceParts.filter(({ id }) => id.startsWith("picket-gate-"));
  assert.ok(moduleParts.length <= 45);
  assert.ok(gateParts.length <= 20);
  assert.ok(dutchLandscapePicketFenceParts.length <= 65);

  const posts = moduleParts.filter(({ id }) => id.startsWith("picket-fence-post:") && !id.includes("cap"));
  assert.equal(posts.length, 2);
  const postBounds = posts.map(boxBounds).sort((a, b) => a[0][0] - b[0][0]);
  approx(postBounds[1][0][1] - postBounds[0][0][0], DUTCH_PICKET_FENCE_MODULE_LENGTH);
  assert.ok(posts.every((post) => boxBounds(post)[1][0] === 0));

  const pickets = moduleParts
    .filter(({ id }) => id.startsWith("picket-fence-picket:"))
    .map((part) => ({ part, bounds: meshBounds(part) }))
    .sort((a, b) => a.bounds[0][0] - b.bounds[0][0]);
  assert.equal(pickets.length, 20);
  for (const { part, bounds } of pickets) {
    approx(bounds[0][1] - bounds[0][0], DUTCH_PICKET_FENCE_PICKET_WIDTH);
    approx(bounds[1][1] - bounds[1][0], 0.8);
    approx(bounds[2][1] - bounds[2][0], 0.02);
    const edgeUse = new Map();
    for (const triangle of part.triangles) {
      for (const [a, b] of [[triangle[0], triangle[1]], [triangle[1], triangle[2]], [triangle[2], triangle[0]]]) {
        const edge = a < b ? `${a}:${b}` : `${b}:${a}`;
        edgeUse.set(edge, (edgeUse.get(edge) ?? 0) + 1);
      }
    }
    assert.ok([...edgeUse.values()].every((count) => count === 2), `${part.id} must be a closed board`);
  }
  for (let index = 1; index < pickets.length; index += 1) {
    const previous = pickets[index - 1].bounds[0];
    const current = pickets[index].bounds[0];
    approx((current[0] + current[1] - previous[0] - previous[1]) / 2, DUTCH_PICKET_FENCE_PICKET_PITCH);
    approx(current[0] - previous[1], DUTCH_PICKET_FENCE_PICKET_GAP);
  }

  const rails = moduleParts.filter(({ id }) => id.startsWith("picket-fence-rail:"));
  assert.equal(rails.length, 2);
  assert.deepEqual(rails.map(({ center }) => center[1]).sort(), [0.18, 0.68]);
  assert.ok(rails.every(({ kind, size }) => kind === "box" && size[1] === 0.07 && size[2] === 0.035));
  for (const { bounds } of pickets) {
    for (const rail of rails) {
      const railBounds = boxBounds(rail);
      assert.ok(intervalOverlap(bounds[0], railBounds[0]) > 0);
      assert.ok(intervalOverlap(bounds[1], railBounds[1]) > 0);
      assert.ok(intervalOverlap(bounds[2], railBounds[2]) > 0);
    }
  }
});

test("калитка имеет несущую раму, диагональ и непрерывные цепочки петель и замка", () => {
  const leafFrame = dutchLandscapePicketFenceParts.filter(({ id }) => id.startsWith("picket-gate-frame-") && !id.includes("diagonal"));
  assert.equal(leafFrame.length, 4);
  const frameBounds = leafFrame.map(boxBounds);
  approx(Math.max(...frameBounds.map((bounds) => bounds[0][1])) - Math.min(...frameBounds.map((bounds) => bounds[0][0])), DUTCH_PICKET_GATE_WIDTH);
  approx(Math.max(...frameBounds.map((bounds) => bounds[1][1])) - Math.min(...frameBounds.map((bounds) => bounds[1][0])), DUTCH_PICKET_GATE_HEIGHT);
  approx(Math.min(...frameBounds.map((bounds) => bounds[1][0])), 0.05);

  const brace = dutchLandscapePicketFenceParts.find(({ id }) => id === "picket-gate-diagonal");
  assert.equal(brace.kind, "beam");
  assert.ok(brace.from[0] < brace.to[0] && brace.from[1] < brace.to[1]);
  const frameFrontZ = Math.max(...frameBounds.map((bounds) => bounds[2][1]));
  assert.ok(brace.from[2] - brace.depth / 2 <= frameFrontZ);
  assert.ok(brace.to[2] - brace.depth / 2 <= frameFrontZ);

  const sharedPost = dutchLandscapePicketFenceParts.find(({ id }) => id === "picket-fence-post:1");
  const latchPost = dutchLandscapePicketFenceParts.find(({ id }) => id === "picket-gate-latch-post");
  assert.equal(sharedPost.kind, "box");
  assert.equal(latchPost.kind, "box");
  approx(boxBounds(sharedPost)[0][1], 1);
  approx(boxBounds(latchPost)[1][0], 0);

  const pins = dutchLandscapePicketFenceParts.filter(({ id }) => id.startsWith("picket-gate-hinge-pin:"));
  const straps = dutchLandscapePicketFenceParts.filter(({ id }) => id.startsWith("picket-gate-hinge-strap:"));
  assert.equal(pins.length, 2);
  assert.equal(straps.length, 2);
  for (const pin of pins) {
    assert.equal(pin.kind, "cylinder");
    approx(pin.from[0], boxBounds(sharedPost)[0][1]);
    assert.ok(pin.from[0] - pin.radius < boxBounds(sharedPost)[0][1]);
    assert.ok(pin.from[2] - pin.radius < boxBounds(sharedPost)[2][1]);
  }
  for (const strap of straps) {
    approx(boxBounds(strap)[0][0], pins[0].from[0]);
    assert.ok(boxBounds(strap)[2][0] <= frameFrontZ);
  }

  const latchBar = dutchLandscapePicketFenceParts.find(({ id }) => id === "picket-gate-latch-bar");
  const catchPart = dutchLandscapePicketFenceParts.find(({ id }) => id === "picket-gate-latch-catch");
  assert.ok(intervalOverlap(boxBounds(latchBar)[0], boxBounds(catchPart)[0]) > 0);
  assert.ok(intervalOverlap(boxBounds(catchPart)[0], boxBounds(latchPost)[0]) > 0);
  assert.ok(intervalOverlap(boxBounds(latchBar)[2], [frameBounds[1][2][0], frameFrontZ]) > 0);
  assert.ok(intervalOverlap(boxBounds(catchPart)[2], boxBounds(latchPost)[2]) > 0);
  const latchHandle = dutchLandscapePicketFenceParts.find(({ id }) => id === "picket-gate-latch-handle");
  assert.equal(latchHandle.kind, "cylinder");
  assert.ok(latchHandle.from[2] - latchHandle.radius < boxBounds(latchBar)[2][1]);

  const requiredViews = ["picket-fence-front", "picket-fence-three-quarter", "picket-fence-gate-detail"];
  assert.ok(requiredViews.every((id) => dutchLandscapeKitObject.views.some((view) => view.id === id)));
  assert.equal(dutchLandscapeKitObject.materialOverrides.cladding.color, 0x315c46);
});

test("turfhok имеет точное пятно, четыре заземлённые стойки и кровлю с падением назад", () => {
  assert.ok(dutchLandscapePeatStoreParts.length <= 60);
  const posts = dutchLandscapePeatStoreParts.filter(({ id }) => id.startsWith("peat-store-post:"));
  assert.equal(posts.length, 4);
  assert.ok(posts.every(({ kind }) => kind === "box"));
  const postBounds = posts.map(boxBounds);
  approx(Math.max(...postBounds.map((bounds) => bounds[0][1])) - Math.min(...postBounds.map((bounds) => bounds[0][0])), DUTCH_PEAT_STORE_WIDTH);
  approx(Math.max(...postBounds.map((bounds) => bounds[2][1])) - Math.min(...postBounds.map((bounds) => bounds[2][0])), DUTCH_PEAT_STORE_DEPTH);
  assert.ok(postBounds.every((bounds) => bounds[1][0] === 0));

  const frontPosts = posts.filter(({ id }) => id.includes(":front:"));
  const rearPosts = posts.filter(({ id }) => id.includes(":rear:"));
  assert.equal(frontPosts.length, 2);
  assert.equal(rearPosts.length, 2);
  assert.ok(frontPosts.every(({ size }) => size[1] === DUTCH_PEAT_STORE_FRONT_POST_HEIGHT));
  assert.ok(rearPosts.every(({ size }) => size[1] === DUTCH_PEAT_STORE_REAR_POST_HEIGHT));

  const frontPlate = dutchLandscapePeatStoreParts.find(({ id }) => id === "peat-store-plate:front");
  const rearPlate = dutchLandscapePeatStoreParts.find(({ id }) => id === "peat-store-plate:rear");
  assert.equal(frontPlate.kind, "beam");
  assert.equal(rearPlate.kind, "beam");
  approx(frontPlate.from[1] - rearPlate.from[1], 0.4);
  approx(Math.abs(frontPlate.from[2] - rearPlate.from[2]), 1.1);
  approx(Math.atan2(frontPlate.from[1] - rearPlate.from[1], frontPlate.from[2] - rearPlate.from[2]), DUTCH_PEAT_STORE_ROOF_PITCH);

  const roof = dutchLandscapePeatStoreParts.find(({ id }) => id === "peat-store-roof-skin");
  assert.equal(roof.kind, "box");
  assert.ok(roof.rotation[0] < 0, "roof must fall toward -Z, away from the open front");
  approx(Math.abs(roof.rotation[0]), DUTCH_PEAT_STORE_ROOF_PITCH);
  assert.deepEqual(roof.size, [2.8, 0.055, 1.45]);

  const rafters = dutchLandscapePeatStoreParts.filter(({ id }) => id.startsWith("peat-store-rafter:"));
  assert.equal(rafters.length, 3);
  for (const rafter of rafters) {
    assert.equal(rafter.kind, "beam");
    for (const endpoint of [rafter.from, rafter.to]) {
      const roofLocal = pointInRotatedXBoxFrame(endpoint, roof);
      assert.ok(Math.abs(roofLocal[0]) <= roof.size[0] / 2);
      assert.ok(Math.abs(roofLocal[1]) <= roof.size[1] / 2 + rafter.depth / 2);
      assert.ok(Math.abs(roofLocal[2]) <= roof.size[2] / 2);
    }
    approx(rafter.from[1], DUTCH_PEAT_STORE_REAR_POST_HEIGHT - 0.03);
    approx(rafter.to[1], DUTCH_PEAT_STORE_FRONT_POST_HEIGHT - 0.03);
  }

  const slats = dutchLandscapePeatStoreParts
    .filter(({ id }) => id.startsWith("peat-store-rear-slat:"))
    .sort((a, b) => a.center[1] - b.center[1]);
  assert.equal(slats.length, 6);
  assert.ok(slats.every(({ center }) => center[2] < 0));
  assert.equal(dutchLandscapePeatStoreParts.filter(({ id }) => id.startsWith("peat-store-front-slat:")).length, 0);
  for (let index = 1; index < slats.length; index += 1) {
    assert.ok(boxBounds(slats[index])[1][0] - boxBounds(slats[index - 1])[1][1] > 0.15);
  }
});

test("торфяной штабель имеет сплошную массу и три опёртых продуваемых ряда точных брикетов", () => {
  const bulk = dutchLandscapePeatStoreParts.find(({ id }) => id === "peat-store-stack-bulk");
  assert.equal(bulk.kind, "box");
  approx(boxBounds(bulk)[1][0], 0);

  const bricks = dutchLandscapePeatStoreParts.filter(({ id }) => id.startsWith("peat-store-brick:"));
  assert.equal(bricks.length, 18);
  assert.ok(bricks.every(({ kind, size, rotation }) => kind === "box"
    && size[0] === 0.3 && size[1] === 0.1 && size[2] === 0.14
    && Math.abs(rotation[1]) === DUTCH_PEAT_BRICK_YAW));

  const allStackBounds = [boxBounds(bulk), ...bricks.map(yawedBoxBounds)];
  approx(Math.max(...allStackBounds.map((bounds) => bounds[0][1])) - Math.min(...allStackBounds.map((bounds) => bounds[0][0])), DUTCH_PEAT_STACK_LENGTH);
  approx(Math.max(...allStackBounds.map((bounds) => bounds[1][1])) - Math.min(...allStackBounds.map((bounds) => bounds[1][0])), DUTCH_PEAT_STACK_HEIGHT);

  for (let course = 0; course < 3; course += 1) {
    const courseBricks = bricks
      .filter(({ id }) => id.startsWith(`peat-store-brick:${course}:`))
      .map((part) => ({ part, bounds: yawedBoxBounds(part) }))
      .sort((a, b) => a.bounds[0][0] - b.bounds[0][0]);
    assert.equal(courseBricks.length, 6);
    for (let index = 1; index < courseBricks.length; index += 1) {
      approx(courseBricks[index].bounds[0][0] - courseBricks[index - 1].bounds[0][1], DUTCH_PEAT_BRICK_GAP);
    }
    const supportTop = course === 0
      ? boxBounds(bulk)[1][1]
      : Math.max(...bricks.filter(({ id }) => id.startsWith(`peat-store-brick:${course - 1}:`)).map((part) => yawedBoxBounds(part)[1][1]));
    assert.ok(courseBricks.every(({ bounds }) => Math.abs(bounds[1][0] - supportTop) < 1e-9));
    assert.ok(courseBricks.every(({ bounds }) => intervalOverlap(bounds[2], boxBounds(bulk)[2]) > 0.1));
  }

  const requiredViews = ["peat-store-front", "peat-store-profile", "peat-store-three-quarter", "peat-store-stack-detail"];
  assert.ok(requiredViews.every((id) => dutchLandscapeKitObject.views.some((view) => view.id === id)));
});

test("huisje имеет точный план, две несущие консоли и кровлю с падением к воде", () => {
  assert.ok(dutchLandscapePrivyParts.length <= 45);
  const sideBoards = dutchLandscapePrivyParts.filter(({ id }) => id.startsWith("privy-side-board:"));
  assert.equal(sideBoards.length, 10);
  const sideBounds = sideBoards.map(meshBounds);
  approx(Math.max(...sideBounds.map((bounds) => bounds[0][1])) - Math.min(...sideBounds.map((bounds) => bounds[0][0])), DUTCH_PRIVY_WIDTH);
  approx(Math.max(...sideBounds.map((bounds) => bounds[2][1])) - Math.min(...sideBounds.map((bounds) => bounds[2][0])), DUTCH_PRIVY_DEPTH);

  const cantilevers = dutchLandscapePrivyParts.filter(({ id }) => id.startsWith("privy-cantilever:"));
  assert.equal(cantilevers.length, 2);
  assert.ok(cantilevers.every(({ kind, size }) => kind === "box" && size[0] === 0.12 && size[1] === 0.16));
  assert.ok(cantilevers.every((part) => boxBounds(part)[1][0] === 0));
  const waterSideEnd = Math.min(...cantilevers.map((part) => boxBounds(part)[2][0]));
  approx(DUTCH_PRIVY_BANK_EDGE_Z - waterSideEnd, DUTCH_PRIVY_CANTILEVER_PROJECTION);
  approx(DUTCH_PRIVY_CANTILEVER_PROJECTION, 1.1);

  const posts = dutchLandscapePrivyParts.filter(({ id }) => id.startsWith("privy-post:"));
  assert.equal(posts.length, 4);
  for (const post of posts) {
    const postBounds = boxBounds(post);
    const carrier = cantilevers.find((beam) => intervalOverlap(postBounds[0], boxBounds(beam)[0]) > 0);
    assert.ok(carrier, `${post.id} needs a cantilever carrier`);
    approx(postBounds[1][0], boxBounds(carrier)[1][1]);
    assert.ok(intervalOverlap(postBounds[2], boxBounds(carrier)[2]) > 0);
  }

  approx(dutchLandscapeKitObject.anchors.privyFrontEave[1], DUTCH_PRIVY_FRONT_EAVE);
  approx(dutchLandscapeKitObject.anchors.privyRearEave[1], DUTCH_PRIVY_REAR_EAVE);
  const roof = dutchLandscapePrivyParts.find(({ id }) => id === "privy-roof-skin");
  assert.equal(roof.kind, "box");
  assert.ok(roof.rotation[0] < 0, "roof must fall toward the open -Z water side");
  approx(Math.abs(roof.rotation[0]), DUTCH_PRIVY_ROOF_PITCH);
  for (const plate of dutchLandscapePrivyParts.filter(({ id }) => id.startsWith("privy-side-plate:"))) {
    assert.equal(plate.kind, "beam");
    for (const endpoint of [plate.from, plate.to]) {
      const local = pointInRotatedXBoxFrame(endpoint, roof);
      assert.ok(Math.abs(local[0]) <= roof.size[0] / 2);
      assert.ok(Math.abs(local[1]) <= roof.size[1] / 2 + plate.depth / 2);
      assert.ok(Math.abs(local[2]) <= roof.size[2] / 2);
    }
  }
});

test("дверь huisje имеет реальный проём, точный лист и сквозное сердце", () => {
  const leafParts = dutchLandscapePrivyParts.filter(({ id }) => id.startsWith("privy-door-leaf:"));
  assert.equal(leafParts.length, 5);
  const leafBounds = leafParts.map((part) => part.kind === "box" ? boxBounds(part) : meshBounds(part));
  const bounds = [0, 1, 2].map((axis) => [
    Math.min(...leafBounds.map((partBounds) => partBounds[axis][0])),
    Math.max(...leafBounds.map((partBounds) => partBounds[axis][1])),
  ]);
  approx(bounds[0][1] - bounds[0][0], DUTCH_PRIVY_DOOR_WIDTH);
  approx(bounds[1][1] - bounds[1][0], DUTCH_PRIVY_DOOR_HEIGHT);

  const heartInfill = leafParts.find(({ id }) => id.endsWith(":heart-infill"));
  assert.equal(heartInfill.kind, "mesh");
  const heartBounds = meshBounds(heartInfill);
  approx(heartBounds[0][1] - heartBounds[0][0], DUTCH_PRIVY_HEART_SIZE);
  approx(heartBounds[1][1] - heartBounds[1][0], DUTCH_PRIVY_HEART_SIZE);
  approx((heartBounds[1][1] + heartBounds[1][0]) / 2, DUTCH_PRIVY_HEART_CENTER_Y);
  assert.equal(heartInfill.vertices.length, 90);
  assert.equal(heartInfill.triangles.length, 40);
  for (const triangle of heartInfill.triangles) {
    const vertices = triangle.map((index) => heartInfill.vertices[index]);
    if (!vertices.every((vertex) => vertex[2] === 0.651)) continue;
    const face = vertices.map(([x, y]) => [x, y]);
    assert.equal(pointInTriangle2D([0, DUTCH_PRIVY_HEART_CENTER_Y], face), false, "heart centre must remain empty");
  }
  for (const part of leafParts.filter(({ kind }) => kind === "box")) {
    const partBounds = boxBounds(part);
    assert.ok(0 < partBounds[0][0] || 0 > partBounds[0][1]
      || DUTCH_PRIVY_HEART_CENTER_Y < partBounds[1][0]
      || DUTCH_PRIVY_HEART_CENTER_Y > partBounds[1][1]);
  }

  const openingX = [-0.32, 0.32];
  const openingY = [0.2, 1.95];
  for (const facadePart of dutchLandscapePrivyParts.filter(({ id }) => id.startsWith("privy-front-pier:") || id === "privy-front-head")) {
    const facadeBounds = boxBounds(facadePart);
    assert.ok(intervalOverlap(facadeBounds[0], openingX) <= 1e-9 || intervalOverlap(facadeBounds[1], openingY) <= 1e-9);
  }

  const pins = dutchLandscapePrivyParts.filter(({ id }) => id.startsWith("privy-hinge-pin:"));
  const straps = dutchLandscapePrivyParts.filter(({ id }) => id.startsWith("privy-hinge-strap:"));
  assert.equal(pins.length, 2);
  assert.equal(straps.length, 2);
  for (const strap of straps) {
    const strapBounds = boxBounds(strap);
    assert.ok(intervalOverlap(strapBounds[0], bounds[0]) > 0);
    assert.ok(intervalOverlap(strapBounds[2], bounds[2]) > 0);
    assert.ok(pins.some((pin) => pin.from[0] - pin.radius <= strapBounds[0][0] && pin.from[0] + pin.radius >= strapBounds[0][0]));
  }
});

test("водяной тыл huisje открыт, а сиденье оставляет настоящий прямой сброс", () => {
  assert.equal(dutchLandscapePrivyParts.filter(({ id }) => id.includes("rear-wall")).length, 0);
  const cladding = dutchLandscapePrivyParts.filter(({ group }) => group === "privy-cladding");
  assert.ok(cladding.every(({ id }) => id.startsWith("privy-side-board:") || id.startsWith("privy-front-")));

  const floorParts = dutchLandscapePrivyParts.filter(({ id }) => id.startsWith("privy-floor:"));
  assert.equal(floorParts.length, 3);
  const probeX = 0;
  const probeZ = -0.5;
  assert.ok(floorParts.every((part) => {
    const bounds = boxBounds(part);
    return probeX < bounds[0][0] || probeX > bounds[0][1] || probeZ < bounds[2][0] || probeZ > bounds[2][1];
  }), "drop must not be covered by floor geometry");

  const seatParts = dutchLandscapePrivyParts.filter(({ id }) => id.startsWith("privy-seat-") && id !== "privy-seat-apron");
  assert.equal(seatParts.length, 3);
  assert.ok(seatParts.every((part) => {
    const seatBounds = boxBounds(part);
    return probeX < seatBounds[0][0] || probeX > seatBounds[0][1] || probeZ < seatBounds[2][0] || probeZ > seatBounds[2][1];
  }), "drop must not be covered by seat geometry");
  const floorTop = Math.max(...floorParts.map((part) => boxBounds(part)[1][1]));
  const seatTop = Math.max(...seatParts.map((part) => boxBounds(part)[1][1]));
  approx(seatTop - floorTop, 0.5);

  const requiredViews = ["privy-front", "privy-profile", "privy-three-quarter", "privy-rear-water", "privy-door-detail"];
  assert.ok(requiredViews.every((id) => dutchLandscapeKitObject.views.some((view) => view.id === id)));
});

test("handpomp имеет точное каменное основание, сужающуюся колонну и принимающий излив", () => {
  assert.equal(dutchLandscapeHandPumpParts.length, 14);
  assert.ok(dutchLandscapeHandPumpParts.length <= 15);

  const stone = dutchLandscapeHandPumpParts.find(({ id }) => id === "hand-pump-stone-base");
  assert.equal(stone.kind, "box");
  assert.deepEqual(stone.size, [DUTCH_HAND_PUMP_STONE_SIZE, DUTCH_HAND_PUMP_STONE_HEIGHT, DUTCH_HAND_PUMP_STONE_SIZE]);
  approx(boxBounds(stone)[1][0], 0);

  const flange = dutchLandscapeHandPumpParts.find(({ id }) => id === "hand-pump-foot-flange");
  const barrel = dutchLandscapeHandPumpParts.find(({ id }) => id === "hand-pump-barrel");
  const cap = dutchLandscapeHandPumpParts.find(({ id }) => id === "hand-pump-top-cap");
  assert.equal(flange.kind, "cylinder");
  assert.equal(barrel.kind, "mesh");
  assert.equal(cap.kind, "cylinder");
  approx(cap.to[1] - flange.from[1], DUTCH_HAND_PUMP_COLUMN_HEIGHT);
  const barrelBounds = meshBounds(barrel);
  approx(barrelBounds[0][1] - barrelBounds[0][0], DUTCH_HAND_PUMP_COLUMN_DIAMETER);
  const lowerRing = barrel.vertices.filter(([, y]) => y === barrelBounds[1][0]);
  const upperRing = barrel.vertices.filter(([, y]) => y === barrelBounds[1][1]);
  const maxRadius = (ring) => Math.max(...ring.map(([x, , z]) => Math.hypot(x, z)));
  assert.ok(maxRadius(upperRing) < maxRadius(lowerRing), "barrel must taper upward");

  const spout = dutchLandscapeHandPumpParts.find(({ id }) => id === "hand-pump-spout");
  const nozzle = dutchLandscapeHandPumpParts.find(({ id }) => id === "hand-pump-nozzle");
  assert.equal(spout.kind, "cylinder");
  assert.equal(nozzle.kind, "cylinder");
  approx(spout.from[1], DUTCH_HAND_PUMP_SPOUT_Y);
  approx(spout.to[1], DUTCH_HAND_PUMP_SPOUT_Y);
  approx(nozzle.from[2] - DUTCH_HAND_PUMP_COLUMN_DIAMETER / 2, DUTCH_HAND_PUMP_SPOUT_PROJECTION);
  assert.ok(distance(spout.to, nozzle.from) < spout.radius + nozzle.radius, "elbow must overlap instead of floating");

  const bucket = dutchLandscapeHandPumpParts.find(({ id }) => id === "hand-pump-bucket-shell");
  const bucketBounds = meshBounds(bucket);
  const nozzlePlanOffset = Math.hypot(nozzle.to[0], nozzle.to[2] - (bucketBounds[2][0] + bucketBounds[2][1]) / 2);
  assert.ok(nozzlePlanOffset < DUTCH_HAND_PUMP_BUCKET_DIAMETER / 2, "water must fall inside the bucket mouth");
  const groundedBucketVertices = bucket.vertices.filter(([, y]) => y === 0);
  assert.ok(boxBounds(stone)[2][1] < Math.min(...groundedBucketVertices.map(([, , z]) => z)), "stone plate and grounded bucket must not interpenetrate");
});

test("рычаг handpomp непрерывно соединяет ось, железо и деревянную рукоять", () => {
  const pivot = dutchLandscapeHandPumpParts.find(({ id }) => id === "hand-pump-pivot");
  const lever = dutchLandscapeHandPumpParts.find(({ id }) => id === "hand-pump-lever");
  const grip = dutchLandscapeHandPumpParts.find(({ id }) => id === "hand-pump-wood-grip");
  assert.equal(pivot.kind, "cylinder");
  assert.equal(lever.kind, "beam");
  assert.equal(grip.kind, "cylinder");
  approx(pivot.radius * 2, DUTCH_HAND_PUMP_PIVOT_DIAMETER);
  approx(distance(lever.from, grip.to), DUTCH_HAND_PUMP_LEVER_LENGTH);
  approx(distance(pivot.from, pivot.to), 0.18);
  approx(lever.from[0], 0);
  approx(lever.from[1], (pivot.from[1] + pivot.to[1]) / 2);
  approx(lever.from[2], 0);
  assert.ok(distance(lever.to, grip.from) < lever.width / 2 + grip.radius, "wood grip must overlap the iron lever");
  assert.ok(grip.to[2] < grip.from[2] && grip.to[1] < grip.from[1], "lever must reach rearward and slightly downward");
  assert.equal(grip.material, "timber-mid");
});

test("ведро handpomp действительно открыто, имеет отдельное дно, две обоймы и связную дужку", () => {
  const bucket = dutchLandscapeHandPumpParts.find(({ id }) => id === "hand-pump-bucket-shell");
  const hoops = dutchLandscapeHandPumpParts.find(({ id }) => id === "hand-pump-bucket-hoops");
  assert.equal(bucket.kind, "mesh");
  assert.equal(hoops.kind, "mesh");
  const bounds = meshBounds(bucket);
  approx(bounds[0][1] - bounds[0][0], DUTCH_HAND_PUMP_BUCKET_DIAMETER);
  approx(bounds[1][1] - bounds[1][0], DUTCH_HAND_PUMP_BUCKET_HEIGHT);
  approx(bounds[1][0], 0);
  assert.equal(bucket.vertices.length, 122, "twelve closed staves plus a separate bottom disk");
  assert.equal(bucket.triangles.length, 192);

  const mouthY = bounds[1][1];
  const mouthCentre = [(bounds[0][0] + bounds[0][1]) / 2, (bounds[2][0] + bounds[2][1]) / 2];
  for (const triangle of bucket.triangles) {
    const face = triangle.map((index) => bucket.vertices[index]);
    if (!face.every(([, y]) => y === mouthY)) continue;
    assert.equal(pointInTriangle2D(mouthCentre, face.map(([x, , z]) => [x, z])), false, "bucket mouth centre must remain open");
  }
  assert.ok(bucket.vertices.some(([x, y, z]) => Math.abs(x) < 1e-12 && y > 0 && y < 0.03 && Math.abs(z - mouthCentre[1]) < 1e-12), "bucket needs a real raised bottom disk");

  const hoopBands = [...new Set(hoops.vertices.map(([, y]) => y))].sort((a, b) => a - b);
  assert.equal(hoopBands.length, 4);
  assert.ok(hoopBands[1] < hoopBands[2], "two iron hoops must remain visibly separate");

  const bail = dutchLandscapeHandPumpParts
    .filter(({ id }) => id.startsWith("hand-pump-bucket-bail:"))
    .sort((a, b) => ["left", "top", "right"].indexOf(a.id.split(":").at(-1)) - ["left", "top", "right"].indexOf(b.id.split(":").at(-1)));
  assert.equal(bail.length, 3);
  assert.ok(bail.every(({ kind, material }) => kind === "cylinder" && material === "metal"));
  assert.deepEqual(bail[0].to, bail[1].from);
  assert.deepEqual(bail[1].to, bail[2].from);
  assert.ok(Math.hypot(bail[0].from[0], bail[0].from[2] - mouthCentre[1]) < DUTCH_HAND_PUMP_BUCKET_DIAMETER / 2);
  assert.ok(Math.hypot(bail[2].to[0], bail[2].to[2] - mouthCentre[1]) < DUTCH_HAND_PUMP_BUCKET_DIAMETER / 2);

  const requiredViews = ["hand-pump-front", "hand-pump-profile", "hand-pump-three-quarter", "hand-pump-bucket-detail", "hand-pump-pivot-detail"];
  assert.ok(requiredViews.every((id) => dutchLandscapeKitObject.views.some((view) => view.id === id)));
});

test("drooglijn имеет две точные заземлённые стойки и несущие поперечины полного пролёта", () => {
  assert.equal(dutchLandscapeDryingLineParts.length, 9);
  assert.ok(dutchLandscapeDryingLineParts.length <= 12);
  assert.ok(dutchLandscapeKitObject.parts.length <= 600);

  const posts = dutchLandscapeDryingLineParts
    .filter(({ id }) => id.startsWith("drying-line-post:"))
    .sort((a, b) => a.center[0] - b.center[0]);
  assert.equal(posts.length, 2);
  assert.ok(posts.every(({ kind, size }) => kind === "box"
    && size[0] === DUTCH_DRYING_LINE_POST_SECTION
    && size[1] === DUTCH_DRYING_LINE_POST_HEIGHT
    && size[2] === DUTCH_DRYING_LINE_POST_SECTION));
  assert.ok(posts.every((post) => boxBounds(post)[1][0] === 0));
  approx(posts[1].center[0] - posts[0].center[0], DUTCH_DRYING_LINE_SPAN);

  const crossbars = dutchLandscapeDryingLineParts
    .filter(({ id }) => id.startsWith("drying-line-crossbar:"))
    .sort((a, b) => a.center[0] - b.center[0]);
  assert.equal(crossbars.length, 2);
  assert.ok(crossbars.every(({ kind, size }) => kind === "box" && size[2] === DUTCH_DRYING_LINE_CROSSBAR_LENGTH));
  for (let index = 0; index < crossbars.length; index += 1) {
    const postBounds = boxBounds(posts[index]);
    const crossbarBounds = boxBounds(crossbars[index]);
    assert.ok(intervalOverlap(postBounds[0], crossbarBounds[0]) > 0);
    assert.ok(intervalOverlap(postBounds[1], crossbarBounds[1]) > 0);
    assert.ok(intervalOverlap(postBounds[2], crossbarBounds[2]) > 0);
  }
});

test("две верёвки drooglijn непрерывны, непрозрачны и имеют точную параболическую стрелу", () => {
  const lines = dutchLandscapeDryingLineParts
    .filter(({ id }) => id.startsWith("drying-line-rope:"))
    .sort((a, b) => meshBounds(a)[2][0] - meshBounds(b)[2][0]);
  assert.equal(lines.length, 2);
  const radialSegments = 6;
  const pathRings = 13;
  const ringCentre = (line, ringIndex) => [0, 1, 2].map((axis) =>
    line.vertices.slice(ringIndex * radialSegments, (ringIndex + 1) * radialSegments)
      .reduce((sum, vertex) => sum + vertex[axis], 0) / radialSegments);

  for (const line of lines) {
    assert.equal(line.kind, "mesh");
    assert.equal(line.vertices.length, pathRings * radialSegments + 2);
    assert.equal(line.triangles.length, (pathRings - 1) * radialSegments * 2 + radialSegments * 2);
    const first = ringCentre(line, 0);
    const middle = ringCentre(line, 6);
    const last = ringCentre(line, 12);
    approx(last[0] - first[0], DUTCH_DRYING_LINE_SPAN);
    approx(first[1] - middle[1], DUTCH_DRYING_LINE_SAG);
    approx(last[1] - middle[1], DUTCH_DRYING_LINE_SAG);
    approx(meshBounds(line)[2][1] - meshBounds(line)[2][0], DUTCH_DRYING_LINE_DIAMETER);
    assert.ok(ringCentre(line, 3)[1] < (first[1] + middle[1]) / 2, "quarter ring must follow a parabola rather than a straight chord");

    const edgeUse = new Map();
    for (const triangle of line.triangles) {
      for (const [a, b] of [[triangle[0], triangle[1]], [triangle[1], triangle[2]], [triangle[2], triangle[0]]]) {
        const edge = a < b ? `${a}:${b}` : `${b}:${a}`;
        edgeUse.set(edge, (edgeUse.get(edge) ?? 0) + 1);
      }
    }
    assert.ok([...edgeUse.values()].every((count) => count === 2), `${line.id} must be one closed continuous tube`);
    assert.equal(Object.hasOwn(line, "opacity"), false);
    assert.equal(Object.hasOwn(line, "transparent"), false);
  }
  assert.equal(dutchLandscapeKitObject.materialOverrides[lines[0].material]?.opacity, undefined);

  const crossbars = dutchLandscapeDryingLineParts.filter(({ id }) => id.startsWith("drying-line-crossbar:"));
  for (const line of lines) {
    for (const ringIndex of [0, 12]) {
      const centre = ringCentre(line, ringIndex);
      const carrier = crossbars.find((crossbar) => Math.abs(crossbar.center[0] - centre[0]) < 1e-9);
      assert.ok(carrier, `${line.id} endpoint needs its crossbar`);
      const bounds = boxBounds(carrier);
      assert.ok(centre.every((value, axis) => value >= bounds[axis][0] && value <= bounds[axis][1]));
    }
  }
});

test("наклонная подпорка drooglijn имеет точные 2.30 м и физически несёт обе линии рогаткой", () => {
  const shaft = dutchLandscapeDryingLineParts.find(({ id }) => id === "drying-line-prop-shaft");
  const forks = dutchLandscapeDryingLineParts
    .filter(({ id }) => id.startsWith("drying-line-prop-fork:"))
    .sort((a, b) => a.to[2] - b.to[2]);
  const lines = dutchLandscapeDryingLineParts
    .filter(({ id }) => id.startsWith("drying-line-rope:"))
    .sort((a, b) => meshBounds(a)[2][0] - meshBounds(b)[2][0]);
  assert.equal(shaft.kind, "cylinder");
  assert.equal(forks.length, 2);
  approx(distance(shaft.from, shaft.to), DUTCH_DRYING_LINE_PROP_LENGTH);
  assert.ok(Math.abs(shaft.from[0] - shaft.to[0]) > 1, "prop must visibly lean rather than become a third post");
  const verticalRadiusAtFoot = shaft.radius * Math.abs(shaft.from[0] - shaft.to[0]) / distance(shaft.from, shaft.to);
  approx(shaft.from[1] - verticalRadiusAtFoot, 0);

  for (let index = 0; index < forks.length; index += 1) {
    const fork = forks[index];
    assert.equal(fork.kind, "cylinder");
    assert.ok(distanceToSegment(fork.from, shaft.from, shaft.to) < shaft.radius, `${fork.id} must emerge from the shaft`);
    const line = lines[index];
    const middleRing = line.vertices.slice(6 * 6, 7 * 6);
    const middleCentre = [0, 1, 2].map((axis) => middleRing.reduce((sum, vertex) => sum + vertex[axis], 0) / middleRing.length);
    approx(distance(fork.to, middleCentre), 0);
    assert.ok(fork.radius + DUTCH_DRYING_LINE_DIAMETER / 2 > distance(fork.to, middleCentre));
  }
  assert.deepEqual(forks[0].from, forks[1].from);

  const requiredViews = ["drying-line-front", "drying-line-profile", "drying-line-three-quarter", "drying-line-high", "drying-line-prop-detail"];
  assert.ok(requiredViews.every((id) => dutchLandscapeKitObject.views.some((view) => view.id === id)));
});

test("bonenrek состоит из десяти точных жердей в пяти парных станциях", () => {
  assert.equal(dutchLandscapeBeanFrameParts.length, 13);
  assert.ok(dutchLandscapeBeanFrameParts.length <= 14);
  assert.ok(dutchLandscapeKitObject.parts.length <= 600);

  const poles = dutchLandscapeBeanFrameParts.filter(({ id }) => id.startsWith("bean-frame-pole:"));
  assert.equal(poles.length, 10);
  assert.ok(poles.every(({ kind, material, from, to, radius, radialSegments }) => kind === "cylinder"
    && material === "timber-mid"
    && Math.abs(distance(from, to) - DUTCH_BEAN_FRAME_POLE_LENGTH) < 1e-9
    && radius * 2 === DUTCH_BEAN_FRAME_POLE_DIAMETER
    && radialSegments === 10));

  const stationX = [...new Set(poles.map(({ from }) => from[0]))].sort((a, b) => a - b);
  assert.equal(stationX.length, 5);
  for (let index = 1; index < stationX.length; index += 1) {
    approx(stationX[index] - stationX[index - 1], DUTCH_BEAN_FRAME_STATION_PITCH);
  }
  const rowZ = [...new Set(poles.map(({ from }) => from[2]))].sort((a, b) => a - b);
  assert.equal(rowZ.length, 2);
  approx(rowZ[1] - rowZ[0], DUTCH_BEAN_FRAME_ROW_SPACING);

  for (const x of stationX) {
    const pair = poles.filter(({ from }) => from[0] === x).sort((a, b) => a.from[2] - b.from[2]);
    assert.equal(pair.length, 2);
    for (const pole of pair) {
      const t = (DUTCH_BEAN_FRAME_TIE_Y - pole.from[1]) / (pole.to[1] - pole.from[1]);
      const atTie = pole.from.map((value, axis) => value + (pole.to[axis] - value) * t);
      approx(atTie[0], x);
      approx(atTie[1], DUTCH_BEAN_FRAME_TIE_Y);
      approx(atTie[2], 0);
      assert.ok(pole.to[1] > DUTCH_BEAN_FRAME_TIE_Y, `${pole.id} must continue above the tie`);
      assert.ok(Math.sign(pole.to[2]) === -Math.sign(pole.from[2]), `${pole.id} must cross the centre plane above the tie`);
    }
    assert.deepEqual(pair.map(({ from }) => from[1]), [0, 0]);
  }
});

test("ridge и пять непрозрачных перевязок bonenrek проходят через все несущие пересечения", () => {
  const poles = dutchLandscapeBeanFrameParts.filter(({ id }) => id.startsWith("bean-frame-pole:"));
  const ridge = dutchLandscapeBeanFrameParts.find(({ id }) => id === "bean-frame-ridge");
  const bindings = dutchLandscapeBeanFrameParts.find(({ id }) => id === "bean-frame-bindings");
  assert.equal(ridge.kind, "cylinder");
  assert.equal(bindings.kind, "mesh");
  approx(ridge.radius * 2, DUTCH_BEAN_FRAME_RIDGE_DIAMETER);
  approx(ridge.from[1], DUTCH_BEAN_FRAME_TIE_Y);
  approx(ridge.to[1], DUTCH_BEAN_FRAME_TIE_Y);
  approx(ridge.from[2], 0);
  approx(ridge.to[2], 0);

  const stationX = [...new Set(poles.map(({ from }) => from[0]))].sort((a, b) => a - b);
  assert.ok(ridge.from[0] < stationX[0] && ridge.to[0] > stationX.at(-1));
  for (const x of stationX) {
    assert.ok(x >= ridge.from[0] && x <= ridge.to[0]);
    for (const pole of poles.filter(({ from }) => from[0] === x)) {
      approx(distanceToSegment([x, DUTCH_BEAN_FRAME_TIE_Y, 0], pole.from, pole.to), 0);
    }
  }

  const adjacency = Array.from({ length: bindings.vertices.length }, () => []);
  for (const [a, b, c] of bindings.triangles) {
    adjacency[a].push(b, c);
    adjacency[b].push(a, c);
    adjacency[c].push(a, b);
  }
  const visited = new Set();
  const components = [];
  for (let start = 0; start < adjacency.length; start += 1) {
    if (visited.has(start)) continue;
    const component = [];
    const stack = [start];
    visited.add(start);
    while (stack.length) {
      const index = stack.pop();
      component.push(index);
      for (const next of adjacency[index]) {
        if (visited.has(next)) continue;
        visited.add(next);
        stack.push(next);
      }
    }
    components.push(component);
  }
  assert.equal(components.length, 5);
  const componentCentres = components.map((indices) => indices.reduce((sum, index) => sum + bindings.vertices[index][0], 0) / indices.length).sort((a, b) => a - b);
  for (let index = 0; index < stationX.length; index += 1) approx(componentCentres[index], stationX[index]);
  for (const indices of components) {
    const minimumRadialDistance = Math.min(...indices.map((index) => {
      const [, y, z] = bindings.vertices[index];
      return Math.hypot(y - DUTCH_BEAN_FRAME_TIE_Y, z);
    }));
    assert.ok(minimumRadialDistance < ridge.radius, "binding loop must intersect the ridge instead of floating");
  }
  assert.equal(Object.hasOwn(bindings, "opacity"), false);
  assert.equal(Object.hasOwn(bindings, "transparent"), false);
  assert.equal(dutchLandscapeKitObject.materialOverrides[bindings.material]?.opacity, undefined);
});

test("заполненная гряда bonenrek имеет 0.20 м высоты и принимает все десять опор", () => {
  const bed = dutchLandscapeBeanFrameParts.find(({ id }) => id === "bean-frame-soil-bed");
  const poles = dutchLandscapeBeanFrameParts.filter(({ id }) => id.startsWith("bean-frame-pole:"));
  assert.equal(bed.kind, "box");
  assert.equal(bed.material, "soil-bed");
  const bounds = boxBounds(bed);
  approx(bounds[1][0], 0);
  approx(bounds[1][1], DUTCH_BEAN_FRAME_BED_HEIGHT);
  for (const pole of poles) {
    assert.ok(pole.from[0] > bounds[0][0] && pole.from[0] < bounds[0][1]);
    assert.ok(pole.from[2] > bounds[2][0] && pole.from[2] < bounds[2][1]);
    approx(pole.from[1], 0);
  }

  const requiredViews = ["bean-frame-front", "bean-frame-profile", "bean-frame-three-quarter", "bean-frame-high", "bean-frame-tie-detail"];
  assert.ok(requiredViews.every((id) => dutchLandscapeKitObject.views.some((view) => view.id === id)));
});

test("regenton имеет двенадцать закрытых клёпок точной высоты и настоящий открытый объём", () => {
  assert.equal(dutchLandscapeRainBarrelParts.length, 18);
  assert.ok(dutchLandscapeRainBarrelParts.length <= 20);
  assert.ok(dutchLandscapeKitObject.parts.length <= 600);

  const staves = dutchLandscapeRainBarrelParts.filter(({ id }) => id.startsWith("rain-barrel-stave:"));
  assert.equal(staves.length, DUTCH_RAIN_BARREL_STAVE_COUNT);
  assert.ok(staves.every(({ kind, material }) => kind === "mesh" && material === "timber-mid"));
  for (const stave of staves) {
    const bounds = meshBounds(stave);
    approx(bounds[1][1] - bounds[1][0], DUTCH_RAIN_BARREL_HEIGHT);
    approx(bounds[1][0], DUTCH_RAIN_BARREL_BRICK_HEIGHT);
    const edgeUse = new Map();
    for (const triangle of stave.triangles) {
      for (const [a, b] of [[triangle[0], triangle[1]], [triangle[1], triangle[2]], [triangle[2], triangle[0]]]) {
        const edge = a < b ? `${a}:${b}` : `${b}:${a}`;
        edgeUse.set(edge, (edgeUse.get(edge) ?? 0) + 1);
      }
    }
    assert.ok([...edgeUse.values()].every((count) => count === 2), `${stave.id} must be a closed stave shell`);
  }
  const allStaveVertices = staves.flatMap(({ vertices }) => vertices);
  approx(Math.max(...allStaveVertices.map(([x]) => x)) - Math.min(...allStaveVertices.map(([x]) => x)), DUTCH_RAIN_BARREL_DIAMETER);

  const topY = DUTCH_RAIN_BARREL_BRICK_HEIGHT + DUTCH_RAIN_BARREL_HEIGHT;
  for (const stave of staves) {
    for (const triangle of stave.triangles) {
      const face = triangle.map((index) => stave.vertices[index]);
      if (!face.every(([, y]) => y === topY)) continue;
      assert.equal(pointInTriangle2D([0, 0], face.map(([x, , z]) => [x, z])), false, "open barrel centre must not be capped by a stave");
    }
  }
  const bottom = dutchLandscapeRainBarrelParts.find(({ id }) => id === "rain-barrel-bottom-head");
  assert.equal(bottom.kind, "cylinder");
  assert.equal(bottom.material, "timber-mid");
  assert.ok(bottom.from[1] > DUTCH_RAIN_BARREL_BRICK_HEIGHT && bottom.to[1] < topY);
  assert.ok(bottom.radius < DUTCH_RAIN_BARREL_DIAMETER / 2);
});

test("три кованых обруча regenton охватывают бочку, а две кирпичные опоры несут её от земли", () => {
  const staves = dutchLandscapeRainBarrelParts.filter(({ id }) => id.startsWith("rain-barrel-stave:"));
  const hoops = dutchLandscapeRainBarrelParts.find(({ id }) => id === "rain-barrel-hoops");
  const bricks = dutchLandscapeRainBarrelParts
    .filter(({ id }) => id.startsWith("rain-barrel-brick:"))
    .sort((a, b) => a.center[0] - b.center[0]);
  assert.equal(hoops.kind, "mesh");
  assert.equal(hoops.material, "metal");
  assert.equal(bricks.length, 2);
  assert.ok(bricks.every(({ kind, material }) => kind === "box" && material === "brick"));
  assert.ok(bricks.every((brick) => boxBounds(brick)[1][0] === 0 && boxBounds(brick)[1][1] === DUTCH_RAIN_BARREL_BRICK_HEIGHT));

  const adjacency = Array.from({ length: hoops.vertices.length }, () => []);
  for (const [a, b, c] of hoops.triangles) {
    adjacency[a].push(b, c);
    adjacency[b].push(a, c);
    adjacency[c].push(a, b);
  }
  const visited = new Set();
  const components = [];
  for (let start = 0; start < adjacency.length; start += 1) {
    if (visited.has(start)) continue;
    const component = [];
    const stack = [start];
    visited.add(start);
    while (stack.length) {
      const index = stack.pop();
      component.push(index);
      for (const next of adjacency[index]) {
        if (visited.has(next)) continue;
        visited.add(next);
        stack.push(next);
      }
    }
    components.push(component);
  }
  assert.equal(components.length, DUTCH_RAIN_BARREL_HOOP_COUNT);
  const staveRings = [...new Set(staves.flatMap(({ vertices }) => vertices.map(([, y]) => y)))]
    .sort((a, b) => a - b)
    .map((y) => ({
      y,
      radius: Math.max(...staves.flatMap(({ vertices }) => vertices
        .filter(([, vertexY]) => vertexY === y)
        .map(([x, , z]) => Math.hypot(x, z)))),
    }));
  for (const component of components) {
    const radialBounds = component.map((index) => Math.hypot(hoops.vertices[index][0], hoops.vertices[index][2]));
    const centreY = component.reduce((sum, index) => sum + hoops.vertices[index][1], 0) / component.length;
    const upperIndex = staveRings.findIndex(({ y }) => y >= centreY);
    const lower = staveRings[Math.max(0, upperIndex - 1)];
    const upper = staveRings[upperIndex];
    const t = (centreY - lower.y) / (upper.y - lower.y);
    const staveRadiusAtHoop = lower.radius + (upper.radius - lower.radius) * t;
    assert.ok(Math.min(...radialBounds) < staveRadiusAtHoop, "hoop inner surface must engage the stave envelope");
  }

  const leftBrick = boxBounds(bricks[0]);
  const rightBrick = boxBounds(bricks[1]);
  assert.ok(leftBrick[0][0] <= -DUTCH_RAIN_BARREL_DIAMETER / 2 + 0.03 && leftBrick[0][1] >= -DUTCH_RAIN_BARREL_DIAMETER / 2);
  assert.ok(rightBrick[0][0] <= DUTCH_RAIN_BARREL_DIAMETER / 2 && rightBrick[0][1] >= DUTCH_RAIN_BARREL_DIAMETER / 2 - 0.03);
  assert.ok(staves.every((stave) => meshBounds(stave)[1][0] === DUTCH_RAIN_BARREL_BRICK_HEIGHT));
});

test("полый деревянный водосток regenton имеет точный выпуск и попадает внутрь открытой бочки", () => {
  const downspout = dutchLandscapeRainBarrelParts.find(({ id }) => id === "rain-barrel-downspout");
  const brackets = dutchLandscapeRainBarrelParts.find(({ id }) => id === "rain-barrel-wall-brackets");
  assert.equal(downspout.kind, "mesh");
  assert.equal(downspout.material, "timber-dark");
  assert.equal(brackets.kind, "mesh");
  assert.equal(brackets.material, "metal");
  const bounds = meshBounds(downspout);
  approx(bounds[0][1] - bounds[0][0], DUTCH_RAIN_BARREL_DOWNSPOUT_SIZE);
  approx(bounds[2][1] - bounds[2][0], DUTCH_RAIN_BARREL_DOWNSPOUT_SIZE);
  approx(bounds[1][0] - (DUTCH_RAIN_BARREL_BRICK_HEIGHT + DUTCH_RAIN_BARREL_HEIGHT), DUTCH_RAIN_BARREL_OUTLET_CLEARANCE);

  const outletY = bounds[1][0];
  for (const triangle of downspout.triangles) {
    const face = triangle.map((index) => downspout.vertices[index]);
    if (!face.every(([, y]) => y === outletY)) continue;
    assert.equal(pointInTriangle2D([0, -0.17], face.map(([x, , z]) => [x, z])), false, "downspout outlet centre must remain open");
  }
  const outletCorners = downspout.vertices.filter(([, y]) => y === outletY && Math.abs(Math.abs(y) - outletY) < 1e-9);
  assert.ok(outletCorners.every(([x, , z]) => Math.hypot(x, z) < DUTCH_RAIN_BARREL_DIAMETER / 2 - 0.018), "whole outlet must discharge inside the clear barrel top");
  assert.ok(meshBounds(brackets)[2][0] <= dutchLandscapeKitObject.anchors.rainBarrelWallBracketLower[2]);
  assert.ok(meshBounds(brackets)[2][1] >= bounds[2][0], "brackets must overlap the downspout depth");

  for (const part of dutchLandscapeRainBarrelParts) {
    assert.equal(Object.hasOwn(part, "opacity"), false);
    assert.equal(Object.hasOwn(part, "transparent"), false);
    assert.equal(dutchLandscapeKitObject.materialOverrides[part.material]?.opacity, undefined);
  }
  const requiredViews = ["rain-barrel-front", "rain-barrel-profile", "rain-barrel-three-quarter", "rain-barrel-high", "rain-barrel-support-detail", "rain-barrel-outlet-detail"];
  assert.ok(requiredViews.every((id) => dutchLandscapeKitObject.views.some((view) => view.id === id)));
});

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
