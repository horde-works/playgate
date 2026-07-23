import assert from "node:assert/strict";
import test from "node:test";
import { breakablePieces } from "../games/make-a-mess/src/game/destructionScene.ts";

// Навесное оборудование (кондиционеры, водостоки, желоба, антенны) висит НА
// зданиях, но не должно волюметрически пересекаться ни с чем из чужих
// кластеров: кондиционер, вросший в водосточную трубу, — баг сборки сцены.
// Плоскостные касания (примыкание к стене) допускаются через порог: реальное
// пересечение имеет заметную глубину по всем трём осям сразу.
const CLEARANCE = 0.045;

function isFixture(piece) {
  return (
    piece.clusterId.endsWith("town:growth-fixtures") ||
    piece.id.includes(":downpipe:") ||
    piece.id.includes(":antenna:")
  );
}

function overlapDepth(a, b, axis) {
  return (
    Math.min(a.position[axis] + a.size[axis] / 2, b.position[axis] + b.size[axis] / 2) -
    Math.max(a.position[axis] - a.size[axis] / 2, b.position[axis] - b.size[axis] / 2)
  );
}

test("mounted exterior fixtures do not interpenetrate other clusters", () => {
  const fixtures = breakablePieces.filter(isFixture);
  assert.equal(fixtures.length > 30, true);

  const others = breakablePieces.filter((piece) => !isFixture(piece));
  const violations = [];
  for (const fixture of fixtures) {
    for (const piece of others) {
      if (
        overlapDepth(fixture, piece, 0) > CLEARANCE &&
        overlapDepth(fixture, piece, 1) > CLEARANCE &&
        overlapDepth(fixture, piece, 2) > CLEARANCE
      ) {
        violations.push(`${fixture.id} <-> ${piece.id}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});

// Части одного кондиционера не должны залезать и в чужие НАВЕСНЫЕ кластеры
// (труба и кондиционер оба "fixtures" — ловим и их взаимные пересечения).
test("air conditioners keep clear of downpipes and gutters", () => {
  const acs = breakablePieces.filter((piece) => piece.id.includes("town:ac:"));
  const pipes = breakablePieces.filter(
    (piece) =>
      !piece.id.includes("town:ac:") &&
      (piece.id.includes(":downpipe:") || piece.id.includes("town:gutter:")),
  );
  assert.equal(acs.length > 20, true);
  assert.equal(pipes.length > 5, true);

  const violations = [];
  for (const ac of acs) {
    for (const pipe of pipes) {
      if (
        overlapDepth(ac, pipe, 0) > 0.01 &&
        overlapDepth(ac, pipe, 1) > 0.01 &&
        overlapDepth(ac, pipe, 2) > 0.01
      ) {
        violations.push(`${ac.id} <-> ${pipe.id}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});
