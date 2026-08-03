import assert from "node:assert/strict";
import test from "node:test";
import {
  compileLandscapeMesh,
  compileVoxelSmoothedLandscape,
  LANDSCAPE_RENDER_PROFILES,
} from "../games/make-a-mess/src/content/landscape/landscapeMesher.ts";
import { dutchPolderLandscapeDocument } from "../games/make-a-mess/src/content/scenes/dutchPolder/dutchPolderLandscapeDocument.ts";

test("smooth and soft-faceted profiles compile the same chunk topology", () => {
  const smooth = compileLandscapeMesh(dutchPolderLandscapeDocument, LANDSCAPE_RENDER_PROFILES.smooth);
  const faceted = compileLandscapeMesh(dutchPolderLandscapeDocument, LANDSCAPE_RENDER_PROFILES["soft-faceted"]);
  assert.equal(smooth.chunks.length, faceted.chunks.length);
  assert.equal(smooth.triangleCount, faceted.triangleCount);
  assert.ok(smooth.triangleCount > 20_000);
  assert.ok(smooth.chunks.length < 80);
});

test("compiled terrain carries finite unit normals and vertex colours", () => {
  const mesh = compileLandscapeMesh(dutchPolderLandscapeDocument, LANDSCAPE_RENDER_PROFILES["soft-faceted"]);
  for (const chunk of mesh.chunks) {
    assert.equal(chunk.vertices.length, chunk.normals.length);
    assert.equal(chunk.vertices.length, chunk.colors.length);
    for (const normal of chunk.normals) {
      assert.ok(Math.abs(Math.hypot(...normal) - 1) < 1e-6);
    }
    for (const color of chunk.colors) {
      assert.ok(color.every((channel) => Number.isFinite(channel) && channel >= 0 && channel <= 1.2));
    }
  }
});

test("adaptive terrain keeps large flat cells and refines local transitions", () => {
  const mesh = compileVoxelSmoothedLandscape(dutchPolderLandscapeDocument, {
    minimumCellSize: 2,
    maximumCellSize: 8,
    chunkSize: 20,
    flatHeightTolerance: 0.35,
  });
  const sizes = new Set(mesh.cells.map((cell) => cell.size));
  assert.deepEqual([...sizes].sort((a, b) => a - b), [2, 4, 8]);
  assert.ok(mesh.cells.some((cell) => cell.size === 8));
  assert.ok(mesh.cells.some((cell) => cell.size === 2));
  assert.ok(mesh.chunks.length < 60);
  assert.ok(mesh.triangleCount < 20_000);
  const sharedVertexHeights = new Map();
  for (const chunk of mesh.chunks) {
    assert.equal(chunk.vertices.length, chunk.normals.length);
    assert.equal(chunk.triangleCells.length, chunk.triangles.length);
    for (const normal of chunk.normals) {
      assert.ok(Math.abs(Math.hypot(...normal) - 1) < 1e-6);
    }
    for (const [x, y, z] of chunk.vertices) {
      const key = `${x}:${z}`;
      const previous = sharedVertexHeights.get(key);
      if (previous !== undefined) assert.equal(y, previous, key);
      sharedVertexHeights.set(key, y);
    }
  }
});
