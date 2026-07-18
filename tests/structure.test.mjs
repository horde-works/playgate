import assert from "node:assert/strict";
import test from "node:test";
import {
  breakablePieceById,
  breakablePieces,
  fractureAt,
  resolveStructuralCollapse,
} from "../games/make-a-mess/src/game/destructionScene.ts";

test("the complete open-house scene has no unsupported visible parts", () => {
  const unsupported = resolveStructuralCollapse(new Set());

  assert.equal(breakablePieces.length > 500, true);
  assert.equal(unsupported.size, 0);
});

test("masonry courses use fitted pieces and contain no accidental narrow gaps", () => {
  const frontWall = breakablePieces.filter(
    (piece) => piece.clusterId === "house:front:lower",
  );
  const fittedPieces = frontWall.filter((piece) => piece.size[0] < 0.6);

  assert.equal(fittedPieces.length > 0, true);

  for (let row = 0; row < 8; row += 1) {
    const course = frontWall
      .filter((piece) => piece.row === row)
      .sort((left, right) => left.position[0] - right.position[0]);

    for (let index = 1; index < course.length; index += 1) {
      const previousEnd =
        course[index - 1].position[0] + course[index - 1].size[0] / 2;
      const currentStart =
        course[index].position[0] - course[index].size[0] / 2;
      const gap = currentStart - previousEnd;

      assert.equal(gap < 1e-6 || gap > 1.4, true);
    }
  }
});

test("adjacent floor, deck, roof, and lawn cells meet without air gaps", () => {
  const contiguousRows = [
    ["yard:ground", 6],
    ["house:ground-floor", 1.7],
    ["house:upper-floor", 0.82],
    ["yard:terrace", 0.55],
  ];

  for (const [clusterId, spacing] of contiguousRows) {
    const pieces = breakablePieces
      .filter(
        (piece) =>
          piece.clusterId === clusterId &&
          (clusterId !== "yard:terrace" || piece.id.includes(":deck:")),
      )
      .sort((left, right) => left.position[0] - right.position[0]);

    const adjacent = pieces.find((piece) =>
      pieces.some(
        (candidate) =>
          Math.abs(piece.position[0] - candidate.position[0] - spacing) <
            1e-6 &&
          Math.abs(piece.position[2] - candidate.position[2]) < 1e-6,
      ),
    );

    assert.ok(adjacent);
    const previous = pieces.find(
      (candidate) =>
        Math.abs(adjacent.position[0] - candidate.position[0] - spacing) <
          1e-6 &&
        Math.abs(adjacent.position[2] - candidate.position[2]) < 1e-6,
    );
    assert.ok(previous);
    const gap =
      adjacent.position[0] -
      adjacent.size[0] / 2 -
      (previous.position[0] + previous.size[0] / 2);
    assert.equal(Math.abs(gap) < 1e-6, true);
  }
});

test("upper materials detach after the lower structure loses its load path", () => {
  const removedLowerStructure = new Set(
    breakablePieces
      .filter(
        (piece) =>
          piece.material !== "soil" &&
          piece.position[1] < 2.95 &&
          Math.abs(piece.position[0]) < 4.8 &&
          piece.position[2] > -7.5 &&
          piece.position[2] < 1.5,
      )
      .map((piece) => piece.id),
  );

  const collapsed = resolveStructuralCollapse(removedLowerStructure);
  const secondaryMaterials = new Set(
    [...collapsed]
      .filter((id) => !removedLowerStructure.has(id))
      .map((id) => breakablePieceById.get(id)?.material),
  );

  assert.equal(collapsed.size > removedLowerStructure.size, true);
  assert.equal(secondaryMaterials.has("plaster"), true);
  assert.equal(secondaryMaterials.has("glass"), true);
  assert.equal(secondaryMaterials.has("steel"), true);
});

test("the upper storey cannot hang from only the corner frame posts", () => {
  const removedLowerInfill = new Set(
    breakablePieces
      .filter(
        (piece) =>
          piece.position[1] < 2.95 &&
          Math.abs(piece.position[0]) < 4.8 &&
          piece.position[2] > -7.5 &&
          piece.position[2] < 1.5 &&
          piece.clusterId !== "house:frame" &&
          piece.clusterId !== "house:upper-floor" &&
          piece.material !== "soil",
      )
      .map((piece) => piece.id),
  );

  const collapsed = resolveStructuralCollapse(removedLowerInfill);
  const secondary = [...collapsed].filter(
    (id) => !removedLowerInfill.has(id),
  );

  assert.equal(
    secondary.some((id) => id.startsWith("house:front:upper")),
    true,
  );
  assert.equal(
    secondary.some((id) => id.startsWith("house:upper-floor")),
    true,
  );
  assert.equal(
    secondary.some((id) => id.startsWith("house:steel-roof")),
    true,
  );
});

test("the panel building cascades when its complete ground storey is removed", () => {
  const removedGroundStorey = new Set(
    breakablePieces
      .filter(
        (piece) =>
          piece.id.startsWith("hru:") &&
          piece.material !== "soil" &&
          piece.material !== "asphalt" &&
          piece.position[1] < 2.7,
      )
      .map((piece) => piece.id),
  );

  const collapsed = resolveStructuralCollapse(removedGroundStorey);
  const secondary = [...collapsed].filter(
    (id) => !removedGroundStorey.has(id),
  );

  assert.equal(secondary.some((id) => id.startsWith("hru:slab:2")), true);
  assert.equal(secondary.some((id) => id.startsWith("hru:south:3")), true);
  assert.equal(secondary.length > 400, true);
});

test("a local impact always releases its directly hit part", () => {
  const target = breakablePieceById.get("door:front:board:2");
  assert.ok(target);

  const fractured = fractureAt(target, new Set(), 1);
  assert.equal(fractured.has(target.id), true);
});
