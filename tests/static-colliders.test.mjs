import assert from "node:assert/strict";
import test from "node:test";
import { minasTirithScene } from "../games/make-a-mess/src/game/minasTirithScene.ts";
import { buildStaticColliderMeshes } from "../games/make-a-mess/src/game/staticColliders.ts";

test("the intact fortress exposes a few cached physics meshes, not one collider per voxel", () => {
  const pieces = minasTirithScene.breakablePieces;
  const collidablePieces = pieces.filter((piece) => piece.material !== "foliage");
  const meshes = buildStaticColliderMeshes(pieces);

  assert.equal(meshes.length < 350, true);
  assert.equal(
    meshes.reduce((total, mesh) => total + mesh.pieceCount, 0),
    collidablePieces.length,
  );
  assert.equal(
    meshes.reduce((total, mesh) => total + mesh.indices.length / 3, 0),
    collidablePieces.length * 12,
  );
});

test("breaking one voxel rebuilds only its local physics chunk", () => {
  const pieces = minasTirithScene.breakablePieces;
  const target = pieces.find(
    (piece) => piece.material === "graphiteStone" && piece.position[1] > 3,
  );
  assert.ok(target);

  const before = buildStaticColliderMeshes(pieces);
  const after = buildStaticColliderMeshes(
    pieces.filter((piece) => piece.id !== target.id),
  );
  const beforeById = new Map(before.map((mesh) => [mesh.id, mesh]));
  const unchanged = after.filter((mesh) => beforeById.get(mesh.id) === mesh);

  assert.equal(unchanged.length >= after.length - 1, true);
  assert.equal(
    after.reduce((total, mesh) => total + mesh.pieceCount, 0),
    before.reduce((total, mesh) => total + mesh.pieceCount, 0) - 1,
  );
});
