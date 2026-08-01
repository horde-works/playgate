import assert from "node:assert/strict";
import test from "node:test";
import {
  compoundCarrierOwnsMemberPose,
  compoundClusterColliders,
  compoundClusterPointToLocal,
  compoundClusterPointToWorld,
  compoundClusterPointWorldVelocity,
  compoundMemberNeedsIndividualBody,
  compoundMemberNeedsPoseBody,
  compoundMemberWorldPose,
} from "../games/make-a-mess/src/game/compoundKinematicCluster.ts";
import {
  quaternionFromEuler,
  eulerFromQuaternion,
  rotateVector,
  rotationMatrixFromEuler,
  applyMatrix,
} from "../games/make-a-mess/src/game/clusterDynamics.ts";
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

const closeVec = (actual, expected, epsilon = 1e-9) => {
  assert.equal(actual.length, expected.length);
  for (let index = 0; index < expected.length; index += 1) {
    assert.ok(
      Math.abs(actual[index] - expected[index]) < epsilon,
      `component ${index}: ${actual[index]} vs ${expected[index]}`,
    );
  }
};

test("quaternionFromEuler matches the scene rotation matrix, and inverts", () => {
  const angles = [
    [0.3, -1.1, 0.7],
    [0, Math.PI / 2, 0],
    [-2.5, 0.2, 3.0],
  ];
  for (const euler of angles) {
    const q = quaternionFromEuler(euler);
    const m = rotationMatrixFromEuler(euler);
    for (const v of [[1, 0, 0], [0, 1, 0], [0.4, -2, 1.3]]) {
      closeVec(rotateVector(q, v), applyMatrix(m, v));
    }
    const roundTrip = quaternionFromEuler(eulerFromQuaternion(q));
    // Кватернион и его отрицание — один поворот.
    const sign = Math.sign(roundTrip[3] * q[3]) || 1;
    closeVec(roundTrip.map((c) => c * sign), q, 1e-7);
  }
});

test("cluster frame transforms are inverse of each other in a moved pose", () => {
  const origin = [69, 1.23, -3];
  const transform = {
    position: [40, 35.5, 18],
    rotation: quaternionFromEuler([0.15, 2.1, -0.05]),
  };
  const authored = [67.2, 0.9, -4.6];
  const world = compoundClusterPointToWorld(origin, transform, authored);
  closeVec(compoundClusterPointToLocal(origin, transform, world), authored);

  // Стоящая машина — частный случай: T = origin, R = 1.
  const resting = { position: origin, rotation: [0, 0, 0, 1] };
  closeVec(compoundClusterPointToWorld(origin, resting, authored), authored);
  closeVec(compoundClusterPointToLocal(origin, resting, authored), authored);
});

test("member world pose composes cluster rotation over the authored one", () => {
  const origin = [0, 0, 0];
  const transform = {
    position: [10, 20, 30],
    rotation: quaternionFromEuler([0, Math.PI / 2, 0]),
  };
  const pose = compoundMemberWorldPose(origin, transform, [2, 0, 0], [0, 0, Math.PI / 4]);
  closeVec(pose.position, [10, 20, 30 - 2]);
  const localY = rotateVector(pose.quaternion, [0, 1, 0]);
  closeVec(localY, rotateVector(transform.rotation, rotateVector(quaternionFromEuler([0, 0, Math.PI / 4]), [0, 1, 0])));
});

test("cluster point velocity adds the angular lever to the linear motion", () => {
  const body = {
    linvel: () => ({ x: 1, y: 0, z: 0 }),
    angvel: () => ({ x: 0, y: 2, z: 0 }),
    worldCom: () => ({ x: 0, y: 0, z: 0 }),
  };
  // Точка в 3 м впереди по x: ω×r = (0,2,0)×(3,0,0) = (0,0,-6).
  closeVec(compoundClusterPointWorldVelocity(body, [3, 0, 0]), [1, 0, -6]);
});

test("a carved member trades its own boxes for its remnant stumps", () => {
  const cluster = { id: "test-frame", clusterId: "test:machine", origin: [10, 2, -4] };
  const pieces = [
    {
      id: "test:machine:block",
      clusterId: "test:machine",
      material: "steel",
      shape: "steelSheet",
      position: [12, 3, -1],
      size: [2, 1, 4],
      color: "#fff",
    },
    {
      id: "test:machine:intact",
      clusterId: "test:machine",
      material: "steel",
      shape: "steelSheet",
      position: [8, 2, -4],
      size: [1, 1, 1],
      color: "#fff",
    },
  ];
  const remnants = [
    {
      id: "remnant:1",
      parentId: "test:machine:block",
      material: "steel",
      position: [12.5, 3, -1],
      quaternion: [0, 0, 0, 1],
      size: [1, 1, 4],
      boxes: [
        { center: [0, 0, 1], size: [1, 1, 2] },
        { center: [0, 0, -1], size: [1, 1, 2] },
      ],
    },
  ];

  const carved = compoundClusterColliders(
    cluster,
    pieces,
    new Set(),
    new Set(["test:machine:block"]),
    remnants,
  );
  // Целый член остаётся своим боксом, у съеденного вместо бокса — два обрубка.
  assert.equal(carved.length, 3);
  assert.equal(
    carved.filter((collider) => collider.sourceId === "test:machine:block").length,
    2,
  );
  const stump = carved.find((collider) => collider.id === "remnant:1:0");
  assert.deepEqual(stump.position, [2.5, 1, 4]);
  assert.deepEqual(stump.args, [0.498, 0.498, 0.998]);

  // Отломанный родитель уносит и свои обрубки из компаунда.
  const broken = compoundClusterColliders(
    cluster,
    pieces,
    new Set(["test:machine:block"]),
    new Set(["test:machine:block"]),
    remnants,
  );
  assert.equal(broken.length, 1);
  assert.equal(broken[0].sourceId, "test:machine:intact");
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
