import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBatches,
  sourceFragments,
} from "../games/make-a-mess/src/game/dynamicWorldBatching.ts";

// Идентичность фрагментов по объекту-источнику — предусловие стабильности
// батчей: пока состав не менялся, DynamicBreakableWorld переиспользует
// прежний батч и не пересоздаёт геометрию с инстанс-атрибутами.

const brickPiece = {
  id: "wall:brick:1",
  material: "brick",
  color: "#a64a2f",
  position: [0, 1, 0],
  size: [0.5, 0.25, 0.25],
};

const plankPiece = {
  id: "fence:plank:1",
  material: "wood",
  color: "#8a6b43",
  position: [2, 0.5, 0],
  size: [1.2, 0.18, 0.04],
};

function makeShard(id, material = "brick") {
  return {
    id,
    material,
    color: "#a64a2f",
    size: [0.2, 0.2, 0.2],
    position: [0, 0.4, 0],
    quaternion: [0, 0, 0, 1],
    linearVelocity: [0, 0, 0],
    angularVelocity: [0, 0, 0],
  };
}

test("fragments keep identity while their source object is unchanged", () => {
  const shard = makeShard("shard:1");
  const first = sourceFragments([brickPiece, plankPiece], [shard], []);
  const second = sourceFragments([brickPiece, plankPiece], [shard], []);

  assert.equal(first.length, second.length);
  for (let index = 0; index < first.length; index += 1) {
    assert.equal(first[index], second[index]);
  }
});

test("adding a shard leaves fragments of other sources untouched", () => {
  const shard = makeShard("shard:2");
  const before = sourceFragments([brickPiece, plankPiece], [shard], []);
  const added = makeShard("shard:3", "wood");
  const after = sourceFragments([brickPiece, plankPiece], [shard, added], []);

  for (let index = 0; index < before.length; index += 1) {
    assert.equal(after[index], before[index]);
  }
  assert.ok(after.length > before.length);
});

test("a batch untouched by the change keeps an identical fragment list", () => {
  const woodShard = makeShard("shard:wood", "wood");
  const before = buildBatches(
    sourceFragments([brickPiece, plankPiece], [woodShard], []),
  );
  const brickShard = makeShard("shard:brick", "brick");
  const after = buildBatches(
    sourceFragments([brickPiece, plankPiece], [woodShard, brickShard], []),
  );

  const woodBefore = before.find((batch) => batch.material === "wood");
  const woodAfter = after.find((batch) => batch.material === "wood");
  assert.ok(woodBefore && woodAfter);
  assert.equal(woodBefore.id, woodAfter.id);
  assert.equal(woodBefore.fragments.length, woodAfter.fragments.length);
  for (let index = 0; index < woodBefore.fragments.length; index += 1) {
    assert.equal(woodBefore.fragments[index], woodAfter.fragments[index]);
  }

  const brickBefore = before.find((batch) => batch.material === "brick");
  const brickAfter = after.find((batch) => batch.material === "brick");
  assert.equal(
    brickAfter.fragments.length,
    brickBefore.fragments.length + 1,
  );
});

test("a carried remnant fragment names its cluster and its parent member", () => {
  const clusterRemnant = {
    id: "remnant:9",
    parentId: "town-vertipad:hexacopter:arm:2:piece",
    clusterId: "town-vertipad:hexacopter",
    material: "steel",
    color: "#9aa3a8",
    size: [0.8, 0.2, 0.4],
    position: [68, 1.2, -3],
    quaternion: [0, 0, 0, 1],
    detached: false,
  };
  const staticRemnant = {
    id: "remnant:10",
    parentId: "wall:brick:1",
    material: "brick",
    color: "#a64a2f",
    size: [0.3, 0.2, 0.2],
    position: [0, 1, 0],
    quaternion: [0, 0, 0, 1],
    detached: false,
  };
  const fragments = sourceFragments([], [], [clusterRemnant, staticRemnant]);

  const carried = fragments.find((fragment) => fragment.sourceId === "remnant:9");
  assert.equal(carried.clusterId, "town-vertipad:hexacopter");
  assert.equal(carried.clusterMemberId, "town-vertipad:hexacopter:arm:2:piece");

  const grounded = fragments.find(
    (fragment) => fragment.sourceId === "remnant:10",
  );
  assert.equal(grounded.clusterId, undefined);
});
