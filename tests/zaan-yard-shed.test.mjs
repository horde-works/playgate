import assert from "node:assert/strict";
import test from "node:test";
import {
  ZAAN_YARD_SHED_CLADDING_PITCH,
  ZAAN_YARD_SHED_DEPTH,
  ZAAN_YARD_SHED_DOOR_HEIGHT,
  ZAAN_YARD_SHED_DOOR_WIDTH,
  ZAAN_YARD_SHED_EAVE_Y,
  ZAAN_YARD_SHED_HOIST_PROJECTION,
  ZAAN_YARD_SHED_PLINTH_HEIGHT,
  ZAAN_YARD_SHED_RIDGE_Y,
  ZAAN_YARD_SHED_ROOF_DEPTH,
  ZAAN_YARD_SHED_ROOF_WIDTH,
  ZAAN_YARD_SHED_WIDTH,
  ZAAN_YARD_SHED_WINDOW_HEIGHT,
  ZAAN_YARD_SHED_WINDOW_WIDTH,
  zaanYardShedObject,
  zaanYardShedParts,
} from "../games/make-a-mess/src/content/objects/dutchLandscape/zaanYardShedObject.ts";

const approx = (actual, expected, tolerance = 1e-9) => assert.ok(
  Math.abs(actual - expected) <= tolerance,
  `expected ${actual} to be within ${tolerance} of ${expected}`,
);

const batchedBoxes = (part) => {
  assert.equal(part.kind, "mesh");
  assert.equal(part.vertices.length % 8, 0);
  const result = [];
  for (let start = 0; start < part.vertices.length; start += 8) {
    const vertices = part.vertices.slice(start, start + 8);
    result.push({
      minX: Math.min(...vertices.map(([x]) => x)), maxX: Math.max(...vertices.map(([x]) => x)),
      minY: Math.min(...vertices.map(([, y]) => y)), maxY: Math.max(...vertices.map(([, y]) => y)),
      minZ: Math.min(...vertices.map(([, , z]) => z)), maxZ: Math.max(...vertices.map(([, , z]) => z)),
    });
  }
  return result;
};

const rotatedBoxBounds = ({ center, size, rotation = [0, 0, 0] }) => {
  const points = [];
  const angle = rotation[2] ?? 0;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  for (const x of [-size[0] / 2, size[0] / 2]) {
    for (const y of [-size[1] / 2, size[1] / 2]) {
      for (const z of [-size[2] / 2, size[2] / 2]) {
        points.push([center[0] + x * cos - y * sin, center[1] + x * sin + y * cos, center[2] + z]);
      }
    }
  }
  return {
    minX: Math.min(...points.map(([x]) => x)), maxX: Math.max(...points.map(([x]) => x)),
    minY: Math.min(...points.map(([, y]) => y)), maxY: Math.max(...points.map(([, y]) => y)),
    minZ: Math.min(...points.map(([, , z]) => z)), maxZ: Math.max(...points.map(([, , z]) => z)),
  };
};

const meshBounds = ({ vertices }) => ({
  minX: Math.min(...vertices.map(([x]) => x)), maxX: Math.max(...vertices.map(([x]) => x)),
  minY: Math.min(...vertices.map(([, y]) => y)), maxY: Math.max(...vertices.map(([, y]) => y)),
  minZ: Math.min(...vertices.map(([, , z]) => z)), maxZ: Math.max(...vertices.map(([, , z]) => z)),
});

test("сарай сохраняет паспортный габарит, отметки и бюджет", () => {
  assert.ok(zaanYardShedParts.length <= 220);
  assert.equal(new Set(zaanYardShedParts.map(({ id }) => id)).size, zaanYardShedParts.length);
  assert.equal(ZAAN_YARD_SHED_WIDTH, 4.6);
  assert.equal(ZAAN_YARD_SHED_DEPTH, 6.4);
  assert.equal(ZAAN_YARD_SHED_PLINTH_HEIGHT, 0.36);
  assert.equal(ZAAN_YARD_SHED_EAVE_Y, 2.45);
  assert.equal(ZAAN_YARD_SHED_RIDGE_Y, 4.15);

  const plinth = zaanYardShedParts.filter(({ id }) =>
    id === "yard-shed-plinth-front" || id === "yard-shed-plinth-rear" || id.startsWith("yard-shed-plinth-side:"));
  assert.equal(plinth.length, 4);
  assert.ok(plinth.every(({ kind, center, size }) => kind === "box" && center[1] - size[1] / 2 === 0));
  const front = plinth.find(({ id }) => id === "yard-shed-plinth-front");
  const side = plinth.find(({ id }) => id === "yard-shed-plinth-side:1");
  approx(front.size[0], ZAAN_YARD_SHED_WIDTH);
  approx(front.center[2] + front.size[2] / 2, ZAAN_YARD_SHED_DEPTH / 2);
  approx(side.center[0] + side.size[0] / 2, ZAAN_YARD_SHED_WIDTH / 2);
  const brickFaces = zaanYardShedParts.filter(({ id }) =>
    id.startsWith("yard-shed-plinth-brick-face:") || id.startsWith("yard-shed-plinth-brick-side:"));
  assert.equal(brickFaces.length, 4);
  assert.ok(brickFaces.every(({ kind, vertices }) => kind === "mesh" && vertices.length >= 4 * 20 * 8));
});

test("шесть стоек, прямые подкосы и четыре пары стропил образуют читаемый путь нагрузки", () => {
  const posts = zaanYardShedParts.filter(({ id }) => id.startsWith("yard-shed-post:"));
  const knees = zaanYardShedParts.filter(({ id }) => id.startsWith("yard-shed-knee:"));
  const rafters = zaanYardShedParts.filter(({ id }) => id.startsWith("yard-shed-rafter:"));
  assert.equal(posts.length, 6);
  assert.equal(knees.length, 6);
  assert.equal(rafters.length, 8);
  assert.ok(posts.every(({ kind, from }) => kind === "beam" && from[1] === 0.5));
  assert.ok(rafters.every(({ kind, from, to, width, depth }) =>
    kind === "beam" && from[1] === ZAAN_YARD_SHED_EAVE_Y - 0.10 && to[1] === 3.89 && width === 0.10 && depth === 0.14));
  const floor = zaanYardShedParts.find(({ id }) => id === "yard-shed-floor");
  assert.equal(floor.kind, "box");
  approx(floor.center[1] - floor.size[1] / 2, 0.5);
});

test("ступенчатая обшивка имеет точный шаг и настоящие дверной и оконный проёмы", () => {
  assert.equal(ZAAN_YARD_SHED_CLADDING_PITCH, 0.17);
  const leftSide = zaanYardShedParts.find(({ id }) => id === "yard-shed-side-cladding:-1");
  const leftBoards = batchedBoxes(leftSide);
  assert.equal(leftBoards.length, 38);
  const centres = leftBoards.map(({ minZ, maxZ }) => (minZ + maxZ) / 2);
  for (let index = 1; index < centres.length; index += 1) approx(centres[index] - centres[index - 1], ZAAN_YARD_SHED_CLADDING_PITCH);
  approx(leftBoards[0].maxZ - leftBoards[0].minZ - ZAAN_YARD_SHED_CLADDING_PITCH, 0.03);

  const front = batchedBoxes(zaanYardShedParts.find(({ id }) => id === "yard-shed-front-cladding"));
  assert.ok(front.every(({ minX, maxX, minY, maxY }) =>
    maxX <= -ZAAN_YARD_SHED_DOOR_WIDTH / 2 || minX >= ZAAN_YARD_SHED_DOOR_WIDTH / 2 || maxY <= 0.36 || minY >= 2.46));

  const right = batchedBoxes(zaanYardShedParts.find(({ id }) => id === "yard-shed-side-cladding:1"));
  assert.ok(right.every(({ minY, maxY, minZ, maxZ }) =>
    maxZ <= 0.15 || minZ >= 1.05 || maxY <= 1.0 || minY >= 2.05));
});

test("ворота и окно совпадают с проёмами, петли и стекло физически отдельны", () => {
  assert.equal(ZAAN_YARD_SHED_DOOR_WIDTH, 2.0);
  assert.equal(ZAAN_YARD_SHED_DOOR_HEIGHT, 2.1);
  const leaves = zaanYardShedParts.filter(({ id }) => id.startsWith("yard-shed-door-leaf:"));
  assert.equal(leaves.length, 2);
  for (const leaf of leaves) {
    const boxes = batchedBoxes(leaf);
    approx(Math.max(...boxes.map(({ maxY }) => maxY)) - Math.min(...boxes.map(({ minY }) => minY)), ZAAN_YARD_SHED_DOOR_HEIGHT);
  }
  const straps = zaanYardShedParts.filter(({ id }) => id.startsWith("yard-shed-hinge-strap:"));
  assert.equal(straps.length, 4);
  assert.ok(straps.every(({ kind, size, material }) => kind === "box" && size[0] === 0.42 && material === "metal"));
  assert.equal(zaanYardShedParts.filter(({ id }) => id.startsWith("yard-shed-door-brace:")).length, 2);

  const glazing = zaanYardShedParts.filter(({ material }) => material === "glazing");
  assert.equal(glazing.length, 1);
  assert.equal(glazing[0].id, "yard-shed-window-glazing");
  assert.deepEqual(glazing[0].size, [0.025, ZAAN_YARD_SHED_WINDOW_HEIGHT, ZAAN_YARD_SHED_WINDOW_WIDTH]);
  assert.equal(zaanYardShedParts.filter(({ id }) => id.startsWith("yard-shed-window-transom:")).length, 2);
  assert.equal(zaanYardShedParts.filter(({ id }) => id === "yard-shed-window-mullion").length, 1);
});

test("дощатая кровля несёт двадцать рядов черепицы внутри принятого свеса", () => {
  const planes = zaanYardShedParts.filter(({ id }) => id.startsWith("yard-shed-roof-boarded-plane:"));
  const courses = zaanYardShedParts.filter(({ id }) => id.startsWith("yard-shed-roof-tile-course:"));
  assert.equal(planes.length, 2);
  assert.equal(courses.length, 20);
  assert.ok(courses.every(({ kind, vertices }) => kind === "mesh" && vertices.length === 20 * 2 * 8));
  const bounds = [
    ...planes.map(rotatedBoxBounds),
    ...courses.map(meshBounds),
  ];
  const minX = Math.min(...bounds.map(({ minX }) => minX));
  const maxX = Math.max(...bounds.map(({ maxX }) => maxX));
  const minZ = Math.min(...bounds.map(({ minZ }) => minZ));
  const maxZ = Math.max(...bounds.map(({ maxZ }) => maxZ));
  approx(maxX - minX, ZAAN_YARD_SHED_ROOF_WIDTH, 0.01);
  approx(maxZ - minZ, ZAAN_YARD_SHED_ROOF_DEPTH);
  const ridge = zaanYardShedParts.find(({ id }) => id === "yard-shed-ridge-cap");
  assert.equal(ridge.kind, "beam");
  approx(ridge.from[1] + ridge.depth / 2, ZAAN_YARD_SHED_RIDGE_Y);
  const vergeFascias = zaanYardShedParts.filter(({ id }) => id.startsWith("yard-shed-gable-fascia:"));
  assert.equal(vergeFascias.length, 4);
  for (const fascia of vergeFascias) {
    assert.equal(fascia.kind, "beam");
    approx(Math.abs(fascia.from[2]) + fascia.depth / 2, ZAAN_YARD_SHED_ROOF_DEPTH / 2);
  }
});

test("подъёмная балка продолжается в каркас и заканчивается цепью с крюком", () => {
  const beam = zaanYardShedParts.find(({ id }) => id === "yard-shed-hoist-beam");
  assert.equal(beam.kind, "beam");
  assert.ok(beam.from[2] < 3.2);
  approx(beam.to[2] - ZAAN_YARD_SHED_DEPTH / 2, ZAAN_YARD_SHED_HOIST_PROJECTION);
  assert.equal(zaanYardShedParts.filter(({ id }) => id.startsWith("yard-shed-hoist-chain:")).length, 3);
  assert.equal(zaanYardShedParts.filter(({ id }) => id.startsWith("yard-shed-hoist-hook:")).length, 5);
  assert.ok(zaanYardShedParts.some(({ id }) => id === "yard-shed-hoist-brace"));
  const eyeShank = zaanYardShedParts.find(({ id }) => id === "yard-shed-hoist-eye-shank");
  assert.equal(eyeShank.kind, "cylinder");
  assert.ok(eyeShank.from[1] > beam.from[1]);
  approx(eyeShank.to[1], 3.05 + 0.075);
});

test("фиксированные камеры содержат внешний и конструктивный кадры с одной проекцией", () => {
  const expected = ["front", "profile", "front-three-quarter", "rear-three-quarter", "high", "hoist-detail", "frame-exterior", "frame-cutaway", "silhouette"];
  assert.deepEqual(zaanYardShedObject.views.map(({ id }) => id), expected);
  const exterior = zaanYardShedObject.views.find(({ id }) => id === "frame-exterior");
  const cutaway = zaanYardShedObject.views.find(({ id }) => id === "frame-cutaway");
  assert.equal(exterior.projection, cutaway.projection);
  assert.deepEqual(exterior.position, cutaway.position);
  assert.deepEqual(exterior.target, cutaway.target);
  assert.equal(exterior.fov, cutaway.fov);
  assert.ok(cutaway.hiddenGroups.includes("yard-shed-cladding"));
  assert.ok(cutaway.hiddenGroups.includes("yard-shed-roof-skin"));
});

test("закрытые меши имеют положительный объём, детали не вырождены", () => {
  for (const part of zaanYardShedParts) {
    if (part.kind === "box") assert.ok(part.size.every((value) => value > 0), part.id);
    if (part.kind === "beam" || part.kind === "cylinder") {
      assert.ok(Math.hypot(...part.from.map((value, index) => value - part.to[index])) > 0, part.id);
    }
    if (part.kind === "mesh") {
      let signedVolume = 0;
      for (const [a, b, c] of part.triangles) {
        const [ax, ay, az] = part.vertices[a];
        const [bx, by, bz] = part.vertices[b];
        const [cx, cy, cz] = part.vertices[c];
        signedVolume += (
          ax * (by * cz - bz * cy)
          + ay * (bz * cx - bx * cz)
          + az * (bx * cy - by * cx)
        ) / 6;
      }
      assert.ok(signedVolume > 0, `${part.id} must have outward winding and positive volume`);
    }
  }
});
