import assert from "node:assert/strict";
import test from "node:test";
import { Euler, Quaternion, Vector3 } from "three";
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

test("every first-map downpipe outlet connects at the top and drains away from its pipe", () => {
  const outlets = breakablePieces.filter((piece) =>
    piece.id.includes(":downpipe:") && piece.id.endsWith(":outlet")
  );
  assert.equal(outlets.length, 8);

  for (const outlet of outlets) {
    const pipeId = outlet.id.slice(0, -":outlet".length);
    const pipe = breakablePieces.find((piece) => piece.id === pipeId);
    assert.ok(pipe, `${outlet.id}: vertical pipe is missing`);

    const axis = new Vector3(0, 1, 0).applyQuaternion(
      new Quaternion().setFromEuler(new Euler(...(outlet.rotation ?? [0, 0, 0]))),
    );
    const center = new Vector3(...outlet.position);
    const top = center.clone().addScaledVector(axis, outlet.size[1] / 2);
    const mouth = center.clone().addScaledVector(axis, -outlet.size[1] / 2);
    const pipeCenter = new Vector3(...pipe.position);
    const topOffset = Math.hypot(top.x - pipeCenter.x, top.z - pipeCenter.z);
    const mouthOffset = Math.hypot(
      mouth.x - pipeCenter.x,
      mouth.z - pipeCenter.z,
    );

    assert.ok(top.y > mouth.y, `${outlet.id}: outlet mouth points upward`);
    assert.ok(
      topOffset <= outlet.size[0] * 0.12,
      `${outlet.id}: upper end misses its vertical pipe by ${topOffset}`,
    );
    assert.ok(
      mouthOffset >= topOffset + outlet.size[1] * 0.45,
      `${outlet.id}: outlet mouth turns back into the facade`,
    );
  }
});
