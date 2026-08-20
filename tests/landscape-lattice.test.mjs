import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  bakeLandscapeLattice,
  createLatticeSampler,
} from "../games/make-a-mess/src/content/landscape/landscapeLattice.ts";
import { LANDSCAPE_RENDER_PROFILES } from "../games/make-a-mess/src/content/landscape/landscapeMesher.ts";
import {
  kallurAuthoredSampler,
  kallurIndexedCollider,
  kallurLandscapeDocument,
  kallurLandscapeLattice,
  kallurLandscapeSampler,
  kallurRenderMesh,
} from "../games/make-a-mess/src/content/scenes/kallur/kallurLandscapeDocument.ts";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

test("landscape lattice: nodes match the authored function exactly", () => {
  const pitch = kallurLandscapeLattice.pitch;
  for (let column = 0; column < kallurLandscapeLattice.columns; column += 7) {
    for (let row = 0; row < kallurLandscapeLattice.rows; row += 7) {
      const x = kallurLandscapeLattice.originX + column * pitch;
      const z = kallurLandscapeLattice.originZ + row * pitch;
      const authored = kallurAuthoredSampler.elevationAt(x, z);
      const baked = kallurLandscapeSampler.elevationAt(x, z);
      assert.ok(
        Math.abs(authored - baked) < 1e-5,
        `node ${x},${z}: authored ${authored} vs lattice ${baked}`,
      );
    }
  }
});

test("landscape lattice: a second bake of the same field is identical", () => {
  const again = bakeLandscapeLattice(
    kallurAuthoredSampler,
    kallurLandscapeDocument,
    LANDSCAPE_RENDER_PROFILES["kallur-turf"].pitch,
  );
  assert.equal(again.columns, kallurLandscapeLattice.columns);
  assert.equal(again.rows, kallurLandscapeLattice.rows);
  assert.deepEqual(again.elevation, kallurLandscapeLattice.elevation);
});

test("indexed collider shares vertices the render soup does not", () => {
  const renderVerts = kallurRenderMesh.chunks.reduce(
    (total, chunk) => total + chunk.vertices.length,
    0,
  );
  const colliderVerts = kallurIndexedCollider.vertices.length / 3;
  assert.ok(colliderVerts > 1_000, `collider too small: ${colliderVerts}`);
  assert.ok(
    colliderVerts < renderVerts / 2,
    `collider ${colliderVerts} verts is not sharing against ${renderVerts} render verts`,
  );
  assert.ok(kallurIndexedCollider.indices.length >= 3);
});

test("createLatticeSampler interpolates between nodes", () => {
  const sampler = createLatticeSampler(kallurLandscapeLattice);
  const x = kallurLandscapeLattice.originX + kallurLandscapeLattice.pitch * 10.5;
  const z = kallurLandscapeLattice.originZ + kallurLandscapeLattice.pitch * 12.5;
  const y = sampler.elevationAt(x, z);
  assert.ok(Number.isFinite(y));
  const gradient = sampler.gradientAt(x, z);
  assert.ok(Number.isFinite(gradient.x) && Number.isFinite(gradient.z));
});

test("shared engine modules do not import the Kallur document", () => {
  const files = [
    "games/make-a-mess/src/game/materialTextures.ts",
    "games/make-a-mess/src/game/GrassField.tsx",
    "games/make-a-mess/src/game/LandscapeSurface.tsx",
    "games/make-a-mess/src/game/MakeAMessGame.tsx",
  ];
  for (const relative of files) {
    const source = readFileSync(join(repositoryRoot, relative), "utf8");
    assert.equal(
      source.includes("kallurLandscapeDocument"),
      false,
      `${relative} imports Kallur landscape data — other worlds would compile the Faroe field`,
    );
    assert.equal(
      source.includes("kallurGroundTint"),
      false,
      `${relative} imports Kallur tint`,
    );
    assert.equal(
      source.includes("kallurVegetation"),
      false,
      `${relative} imports Kallur vegetation`,
    );
    assert.equal(
      source.includes("kallurLandscapeRuntime"),
      false,
      `${relative} imports Kallur runtime — other worlds would bake the Faroe field`,
    );
  }
});
