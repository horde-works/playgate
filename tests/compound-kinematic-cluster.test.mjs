import assert from "node:assert/strict";
import test from "node:test";
import {
  compoundCarrierOwnsMemberPose,
  compoundClusterColliders,
  compoundMemberNeedsIndividualBody,
  compoundMemberNeedsPoseBody,
} from "../games/make-a-mess/src/game/compoundKinematicCluster.ts";
import { grandTerminalScene } from "../games/make-a-mess/src/game/grandTerminalScene.ts";
import { townScene } from "../games/make-a-mess/src/game/townScene.ts";
import { TOWN_HEXACOPTER_CLUSTER_ID } from "../games/make-a-mess/src/game/townHexacopter.ts";
import { vehicleFrameForCluster } from "../games/make-a-mess/src/game/vehicleFrames.ts";

const SKY_TRAIN = "terminal:sky-train";

test("a compound cluster owns one contact body worth of member colliders", () => {
  const frame = vehicleFrameForCluster(SKY_TRAIN);
  const pieces = grandTerminalScene.breakablePieces.filter(
    (piece) => piece.clusterId === SKY_TRAIN,
  );
  const colliders = compoundClusterColliders(frame, pieces, new Set());

  assert.equal(
    colliders.length,
    pieces.filter(
      (piece) =>
        !piece.hinge &&
        !frame.independentMemberMatches.some((match) => piece.id.includes(match)),
    ).length,
  );
  assert.equal(new Set(colliders.map((collider) => collider.id)).size, colliders.length);
  assert.equal(
    colliders.every((collider) => pieces.some((piece) => piece.id === collider.sourceId)),
    true,
  );
});

test("intact compound members do not need hundreds of empty pose bodies", () => {
  const frame = vehicleFrameForCluster(SKY_TRAIN);
  const pieces = grandTerminalScene.breakablePieces.filter(
    (piece) => piece.clusterId === SKY_TRAIN,
  );
  const independent = pieces.filter((piece) =>
    compoundMemberNeedsPoseBody(frame, piece),
  );

  assert.ok(independent.length > 0);
  assert.ok(independent.length < pieces.length / 8, {
    pieces: pieces.length,
    independent: independent.length,
  });
  assert.equal(
    independent.every(
      (piece) =>
        piece.hinge ||
        frame.independentMemberMatches.some((match) => piece.id.includes(match)),
    ),
    true,
  );
});

test("town vehicles materialise only articulated bodies until pieces detach", () => {
  const expected = new Map([
    ["sky-mooring:airship", 10],
    [TOWN_HEXACOPTER_CLUSTER_ID, 18],
  ]);

  for (const [clusterId, expectedBodies] of expected) {
    const frame = vehicleFrameForCluster(clusterId);
    assert.ok(frame, `missing frame ${clusterId}`);
    const pieces = townScene.breakablePieces.filter(
      (piece) => piece.clusterId === clusterId,
    );
    const intactBodies = pieces.filter((piece) =>
      compoundMemberNeedsIndividualBody(frame, piece, false),
    );
    assert.equal(intactBodies.length, expectedBodies, clusterId);

    const carried = pieces.find(
      (piece) => !compoundMemberNeedsIndividualBody(frame, piece, false),
    );
    assert.ok(carried, `missing ordinary carrier member for ${clusterId}`);
    assert.equal(
      compoundMemberNeedsIndividualBody(frame, carried, true),
      true,
      `${clusterId} detached member did not materialise`,
    );
  }
});

test("detaching a member removes exactly its contact shape from the cluster", () => {
  const frame = vehicleFrameForCluster(SKY_TRAIN);
  const pieces = grandTerminalScene.breakablePieces.filter(
    (piece) => piece.clusterId === SKY_TRAIN,
  );
  const detached = pieces.find((piece) => piece.shape !== "cinderBlock");
  const whole = compoundClusterColliders(frame, pieces, new Set());
  const damaged = compoundClusterColliders(frame, pieces, new Set([detached.id]));

  assert.equal(damaged.length, whole.length - 1);
  assert.equal(damaged.some((collider) => collider.sourceId === detached.id), false);
});

test("the cluster builder is object-agnostic and preserves local rotations", () => {
  const cluster = { id: "test-frame", clusterId: "test:machine", origin: [10, 2, -4] };
  const pieces = [
    {
      id: "test:machine:block",
      clusterId: "test:machine",
      material: "steel",
      shape: "steelSheet",
      position: [12, 3, -1],
      rotation: [0, Math.PI / 2, 0],
      size: [2, 1, 4],
      color: "#fff",
    },
    {
      id: "other:block",
      clusterId: "other",
      material: "wood",
      shape: "plank",
      position: [0, 0, 0],
      size: [1, 1, 1],
      color: "#fff",
    },
  ];
  const [collider] = compoundClusterColliders(cluster, pieces, new Set());

  assert.equal(collider.sourceId, "test:machine:block");
  assert.deepEqual(collider.position, [2, 1, 3]);
  assert.deepEqual(collider.rotation, [0, Math.PI / 2, 0]);
  assert.deepEqual(collider.args, [0.998, 0.498, 1.998]);
});

test("an articulated member always has exactly one pose writer", () => {
  const pieces = grandTerminalScene.breakablePieces.filter(
    (piece) => piece.clusterId === SKY_TRAIN,
  );
  const door = pieces.find((piece) => piece.hinge);
  const hull = pieces.find((piece) => !piece.hinge);

  assert.equal(compoundCarrierOwnsMemberPose(door, false), true);
  assert.equal(compoundCarrierOwnsMemberPose(door, true), false);
  assert.equal(compoundCarrierOwnsMemberPose(hull, false), true);
  assert.equal(compoundCarrierOwnsMemberPose(hull, true), true);
});
