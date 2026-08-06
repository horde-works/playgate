import assert from "node:assert/strict";
import test from "node:test";
import { basaltStrongholdScene } from "../games/make-a-mess/src/game/basaltStrongholdScene.ts";
import {
  buildStaticColliderMeshes,
  createStaticColliderMeshStore,
} from "../games/make-a-mess/src/game/staticColliders.ts";

test("the intact fortress exposes a few cached physics meshes, not one collider per voxel", () => {
  const pieces = basaltStrongholdScene.breakablePieces;
  const collidablePieces = pieces.filter((piece) => piece.material !== "foliage");
  const meshes = buildStaticColliderMeshes(pieces);

  assert.equal(meshes.length < 350, true);
  assert.equal(
    meshes.reduce((total, mesh) => total + mesh.pieceCount, 0),
    collidablePieces.length,
  );
  assert.equal(
    meshes.reduce((total, mesh) => total + mesh.indices.length / 3, 0),
    collidablePieces.reduce(
      (total, piece) =>
        total +
        (piece.visualMesh
          ? piece.visualMesh.indices.length / 3
          : piece.shape === "sphere"
          ? 288
          : piece.shape === "cylinder"
            ? 36
            : 12),
      0,
    ),
  );
});

test("breaking one voxel rebuilds only its local physics chunk", () => {
  const pieces = basaltStrongholdScene.breakablePieces;
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

test("persistent collider store touches only a broken piece's local chunk", () => {
  const pieces = basaltStrongholdScene.breakablePieces;
  const target = pieces.find(
    (piece) => piece.material === "graphiteStone" && piece.position[1] > 3,
  );
  assert.ok(target);
  const store = createStaticColliderMeshStore(pieces);
  const before = store.updateHidden(new Set());
  const after = store.updateHidden(new Set([target.id]));
  const beforeById = new Map(before.map((mesh) => [mesh.id, mesh]));

  assert.equal(
    after.filter((mesh) => beforeById.get(mesh.id) !== mesh).length,
    1,
  );
  assert.equal(
    after.reduce((total, mesh) => total + mesh.pieceCount, 0),
    before.reduce((total, mesh) => total + mesh.pieceCount, 0) - 1,
  );
  assert.strictEqual(store.updateHidden(new Set([target.id])), after);
});

test("a same-ID geometry edit cannot reuse a stale static collider", () => {
  const piece = {
    id: "cache-regression:wall",
    material: "concrete",
    position: [1, 2, 1],
    size: [2, 3, 0.4],
  };
  const before = buildStaticColliderMeshes([piece])[0];
  const moved = buildStaticColliderMeshes([
    { ...piece, position: [1.25, 2, 1] },
  ])[0];
  const resized = buildStaticColliderMeshes([
    { ...piece, size: [2.5, 3, 0.4] },
  ])[0];
  const cachedAgain = buildStaticColliderMeshes([piece])[0];

  assert.notStrictEqual(moved, before);
  assert.notStrictEqual(resized, before);
  assert.notDeepEqual([...moved.vertices], [...before.vertices]);
  assert.notDeepEqual([...resized.vertices], [...before.vertices]);
  assert.strictEqual(cachedAgain, before);
});

test("an authored terrain shell collides as its surface, not its bounding cube", () => {
  const terrain = {
    id: "terrain:surface",
    material: "grass",
    shape: "groundTile",
    position: [10, 2, -4],
    size: [8, 3, 8],
    visualMesh: {
      vertices: [
        [-0.5, -0.5, -0.5],
        [0.5, 0.5, -0.5],
        [0.5, 0.5, 0.5],
        [-0.5, -0.5, 0.5],
      ],
      indices: [0, 2, 1, 0, 3, 2],
      doubleSided: false,
    },
  };
  const mesh = buildStaticColliderMeshes([terrain])[0];
  assert.equal(mesh.vertices.length, 12);
  assert.equal(mesh.indices.length, 6);
  assert.deepEqual([...mesh.vertices.slice(0, 3)], [6, 0.5, -8]);

  const edited = buildStaticColliderMeshes([{
    ...terrain,
    visualMesh: {
      ...terrain.visualMesh,
      vertices: terrain.visualMesh.vertices.map((vertex, index) =>
        index === 1 ? [vertex[0], 0.25, vertex[2]] : vertex
      ),
    },
  }])[0];
  assert.notStrictEqual(edited, mesh);
  assert.notDeepEqual([...edited.vertices], [...mesh.vertices]);
});

test("a body covered by a separate intact landscape shell is not boxed twice", () => {
  const hiddenBody = {
    id: "terrain:cell:0:0",
    material: "earth",
    shape: "groundTile",
    position: [0, -3, 0],
    size: [3, 8, 3],
    intactCollider: false,
  };
  assert.deepEqual(buildStaticColliderMeshes([hiddenBody]), []);
  const store = createStaticColliderMeshStore([hiddenBody]);
  assert.deepEqual(store.updateHidden(new Set()), []);
});

test("пробоина меняет коллайдер куска: дыра простреливается и проходится", () => {
  // Вердикт Igor (август 2026): кратер жил только в рендере, а тримеш
  // коллайдера оставался авторским — дыра, сквозь которую видно, была
  // невидимой стеной для пули (Rapier-луч) и капсулы игрока.
  const shell = {
    id: "mill:smock:panel",
    material: "plaster",
    position: [4, 2, -3],
    size: [2, 3, 0.3],
    visualMesh: {
      vertices: [
        [-0.5, -0.5, 0],
        [0.5, -0.5, 0],
        [0.5, 0.5, 0],
        [-0.5, 0.5, 0],
      ],
      indices: [0, 1, 2, 0, 2, 3],
    },
  };
  const store = createStaticColliderMeshStore([shell]);
  const authored = store.updateHidden(new Set())[0];

  // Подрезанная кратером сетка (как отдаёт clipPieceVisualMesh): больше
  // треугольников, дыра посередине.
  const cratered = new Map([
    [
      shell.id,
      {
        vertices: [
          [-0.5, -0.5, 0],
          [0.5, -0.5, 0],
          [0.5, 0.5, 0],
          [-0.5, 0.5, 0],
          [-0.1, -0.1, 0],
          [0.1, -0.1, 0],
          [0.1, 0.1, 0],
          [-0.1, 0.1, 0],
        ],
        indices: [0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7],
        revision: "8:24",
      },
    ],
  ]);
  const pierced = store.update(new Set(), cratered)[0];
  assert.notStrictEqual(pierced, authored);
  assert.equal(pierced.vertices.length, 8 * 3);
  assert.equal(pierced.indices.length, 24);

  // Та же ревизия — тот же меш (чанк не пересобирается зря).
  const again = store.update(new Set(), cratered)[0];
  assert.strictEqual(again, pierced);

  // Кратеры ушли (кусок сломался по-настоящему) — коллайдер снова авторский.
  const restored = store.update(new Set(), new Map())[0];
  assert.equal(restored.vertices.length, 4 * 3);
});
