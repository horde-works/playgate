import assert from "node:assert/strict";
import test from "node:test";
import {
  applyHiddenPieceDiff,
  buildIntactGroundRenderColors,
  buildIntactInstanceBatches,
} from "../games/make-a-mess/src/game/intactWorldBatching.ts";
import { basaltStrongholdScene } from "../games/make-a-mess/src/game/basaltStrongholdScene.ts";

function piece(id, material, position, overrides = {}) {
  return {
    id,
    clusterId: "test",
    material,
    shape: "stoneBlock",
    position,
    size: [1, 1, 1],
    color: "#404040",
    ...overrides,
  };
}

test("batch grouping does not depend on which pieces are broken", () => {
  const pieces = [
    piece("a", "basalt", [0, 0, 0]),
    piece("b", "basalt", [2, 0, 0]),
    piece("c", "wood", [4, 0, 0]),
  ];

  const all = buildIntactInstanceBatches(pieces);
  const withoutMiddle = buildIntactInstanceBatches([pieces[0], pieces[2]]);

  assert.deepEqual(
    all.map((batch) => batch.id).toSorted(),
    withoutMiddle.map((batch) => batch.id).toSorted(),
  );
  const basalt = all.find((batch) => batch.material === "basalt");
  assert.deepEqual(
    basalt.pieces.map((entry) => entry.id),
    ["a", "b"],
  );
});

test("the whole fortress renders as a stable, small set of instanced batches", () => {
  const batches = buildIntactInstanceBatches(basaltStrongholdScene.breakablePieces);

  assert.equal(batches.length < 32, true);
  assert.equal(
    batches.reduce((total, batch) => total + batch.pieces.length, 0),
    basaltStrongholdScene.breakablePieces.length,
  );
  // Dark-tower masonry carries baked silicate seams inside its base batches.
  assert.equal(
    batches.some((batch) => batch.jointed),
    true,
  );
});

test("hiding and restoring pieces touches only the changed instances", () => {
  const pieces = [
    piece("a", "basalt", [0, 0, 0]),
    piece("b", "basalt", [2, 0, 0]),
    piece("c", "basalt", [4, 0, 0]),
  ];
  const applied = new Set();

  const first = applyHiddenPieceDiff(pieces, applied, new Set(["b"]));
  assert.deepEqual(first, { hide: [1], restore: [] });

  // Same target set again: nothing to write.
  const repeat = applyHiddenPieceDiff(pieces, applied, new Set(["b"]));
  assert.deepEqual(repeat, { hide: [], restore: [] });

  // One more hidden, the earlier one restored.
  const second = applyHiddenPieceDiff(pieces, applied, new Set(["c"]));
  assert.deepEqual(second, { hide: [2], restore: [1] });
  assert.deepEqual([...applied], ["c"]);

  // Ids from other batches are ignored entirely.
  const foreign = applyHiddenPieceDiff(
    pieces,
    applied,
    new Set(["c", "not-in-this-batch"]),
  );
  assert.deepEqual(foreign, { hide: [], restore: [] });
});

test("visual texture variants never merge into one material batch", () => {
  const pieces = [
    piece("gray", "concrete", [0, 0, 0], {
      textureProfile: "city-gray-pavers",
    }),
    piece("red", "concrete", [2, 0, 0], {
      textureProfile: "city-red-pavers",
    }),
  ];

  const batches = buildIntactInstanceBatches(pieces);
  assert.equal(batches.length, 2);
  assert.deepEqual(
    batches.map((batch) => batch.textureProfile).toSorted(),
    ["city-gray-pavers", "city-red-pavers"],
  );
});

test("triangular facade cassettes keep their exact intact geometry", () => {
  const triangular = piece("triangle", "glass", [0, 0, 0], {
    shape: "triangularSheet",
    size: [4.8, 5.2, 0.05],
    color: "#b7c8cc",
  });
  const [batch] = buildIntactInstanceBatches([triangular]);
  assert.equal(batch.geometryKind, "triangularSheet");
});

test("arbitrary surface polygons keep their outline and batch separately", () => {
  const trapezoid = piece("trapezoid", "darkGlass", [0, 0, 0], {
    shape: "glassPane",
    visualProfile: {
      vertices: [[-0.5, -0.5], [0.5, -0.5], [0.38, 0.5], [-0.32, 0.5]],
    },
  });
  const triangle = piece("triangle", "darkGlass", [1, 0, 0], {
    shape: "glassPane",
    visualProfile: {
      vertices: [[-0.5, -0.5], [0.5, -0.5], [0, 0.5]],
    },
  });
  const batches = buildIntactInstanceBatches([trapezoid, triangle]);
  assert.equal(batches.length, 2);
  assert.ok(batches.every((batch) => batch.geometryKind === "surfacePolygon"));
  assert.deepEqual(batches[0].visualProfile, trapezoid.visualProfile);
  assert.deepEqual(batches[1].visualProfile, triangle.visualProfile);
});

test("compound surface meshes keep their topology and batch separately", () => {
  const shallow = piece("shallow", "steel", [0, 0, 0], {
    visualMesh: {
      vertices: [[-0.5, -0.5, 0], [0.5, -0.5, 0], [0.5, 0.5, 0.1], [-0.5, 0.5, 0.1]],
      indices: [0, 1, 2, 0, 2, 3],
    },
  });
  const crowned = piece("crowned", "steel", [1, 0, 0], {
    visualMesh: {
      vertices: [[-0.5, -0.5, 0], [0.5, -0.5, 0], [0, 0.5, 0.25]],
      indices: [0, 1, 2],
    },
  });
  const batches = buildIntactInstanceBatches([shallow, crowned]);
  assert.equal(batches.length, 2);
  assert.ok(batches.every((batch) => batch.geometryKind === "surfaceMesh"));
  assert.deepEqual(batches[0].visualMesh, shallow.visualMesh);
  assert.deepEqual(batches[1].visualMesh, crowned.visualMesh);
});

test("architectural spheres never fall back to glass boxes", () => {
  const sphere = piece("sphere", "darkGlass", [0, 0, 0], {
    shape: "sphere",
    size: [26, 26, 26],
    color: "#2f7d8c",
  });
  const [batch] = buildIntactInstanceBatches([sphere]);
  assert.equal(batch.geometryKind, "sphere");
});

test("ground render colours survive the transition to a damaged remnant", () => {
  const pieces = [
    piece("grass-dark", "grass", [0, 0, 0], {
      shape: "groundTile",
      color: "#284828",
    }),
    piece("grass-light", "grass", [2, 0, 0], {
      shape: "groundTile",
      color: "#507050",
    }),
  ];
  const colors = buildIntactGroundRenderColors(pieces);
  assert.equal(colors.size, 2);
  assert.notEqual(colors.get("grass-dark"), pieces[0].color);
  assert.notEqual(colors.get("grass-light"), pieces[1].color);
});
