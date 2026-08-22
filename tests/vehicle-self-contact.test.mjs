import assert from "node:assert/strict";
import test from "node:test";

import RAPIER from "@dimforge/rapier3d-compat";
import { Euler, Quaternion, Vector3 } from "three";

import { getPieceRenderBoxes } from "../games/make-a-mess/src/game/breakableGeometry.ts";
import {
  massProperties,
  principalMassProperties,
} from "../games/make-a-mess/src/game/clusterDynamics.ts";
import {
  compoundClusterColliders,
  compoundClusterOwnsPiece,
} from "../games/make-a-mess/src/game/compoundKinematicCluster.ts";
import { structuralMaterialProfiles } from "../games/make-a-mess/src/game/destructionScene.ts";
import { townScene } from "../games/make-a-mess/src/game/townScene.ts";
import { combatHexacopterRangeScene } from "../games/make-a-mess/src/game/combatHexacopterRangeScene.ts";
import { vikingVillageScene } from "../games/make-a-mess/src/game/vikingVillageScene.ts";
import {
  DEBRIS_ACTOR_DETAIL,
  VEHICLE_ATTACHMENT,
  VEHICLE_CARRIER,
} from "../games/make-a-mess/src/game/physicsInteractionGroups.ts";
import { countUpwardSupportContacts } from "../games/make-a-mess/src/game/vehiclePhysicalContact.ts";
import { vehicleFrameForCluster } from "../games/make-a-mess/src/game/vehicleFrames.ts";

await RAPIER.init();

// Машины живут в разных сценах: HX-6 с площадкой — на полигоне Tonkawa
// (фишка №1), дирижабль с мачтой — в городе. Id кластеров глобально
// уникальны, поэтому куски ищутся по объединению сцен.
const machineScenePieces = [
  ...townScene.breakablePieces,
  ...combatHexacopterRangeScene.breakablePieces,
  ...vikingVillageScene.breakablePieces,
];

function rotationOf(piece) {
  return new Quaternion().setFromEuler(new Euler(...(piece.rotation ?? [0, 0, 0])));
}

function colliderDesc(shape, args) {
  return shape === "sphere"
    ? RAPIER.ColliderDesc.ball(args[0])
    : shape === "cylinder"
      ? RAPIER.ColliderDesc.cylinder(args[0], args[1])
      : RAPIER.ColliderDesc.cuboid(...args);
}

function withGroups(desc, collisionGroups) {
  return collisionGroups === undefined
    ? desc
    : desc.setCollisionGroups(collisionGroups);
}

function addFixedPiece(world, piece, collisionGroups) {
  const handles = [];
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed()
      .setTranslation(...piece.position)
      .setRotation(rotationOf(piece)),
  );
  if (piece.shape === "sphere") {
    handles.push(world.createCollider(
      withGroups(
        RAPIER.ColliderDesc.ball(
          Math.max(0.002, Math.min(...piece.size) / 2 - 0.002),
        ),
        collisionGroups,
      ),
      body,
    ).handle);
    return handles;
  }
  if (piece.shape === "cylinder") {
    handles.push(world.createCollider(
      withGroups(
        RAPIER.ColliderDesc.cylinder(
          Math.max(0.002, piece.size[1] / 2 - 0.002),
          Math.max(0.002, (piece.size[0] + piece.size[2]) / 4 - 0.002),
        ),
        collisionGroups,
      ),
      body,
    ).handle);
    return handles;
  }
  for (const box of getPieceRenderBoxes(piece)) {
    handles.push(world.createCollider(
      withGroups(
        RAPIER.ColliderDesc.cuboid(
          Math.max(0.002, box.size[0] / 2 - 0.002),
          Math.max(0.002, box.size[1] / 2 - 0.002),
          Math.max(0.002, box.size[2] / 2 - 0.002),
        ).setTranslation(...box.center),
        collisionGroups,
      ),
      body,
    ).handle);
  }
  return handles;
}

function addIntactFixedPiece(world, piece) {
  if (piece.intactCollider === false) return [];
  return addFixedPiece(
    world,
    piece,
    piece.intactCollisionRole === "actor-only"
      ? DEBRIS_ACTOR_DETAIL
      : undefined,
  );
}

function selfContactResult(clusterId) {
  const frame = vehicleFrameForCluster(clusterId);
  assert.ok(frame, `${clusterId} has no vehicle frame`);
  const pieces = machineScenePieces.filter(
    (piece) => piece.clusterId === clusterId,
  );
  const properties = massProperties(
    pieces,
    (material) => structuralMaterialProfiles[material].density,
  );
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  world.timestep = 1 / 60;
  const carrier = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(...frame.origin)
      .setCanSleep(false),
  );
  const carrierColliders = compoundClusterColliders(frame, pieces, new Set());
  for (const definition of carrierColliders) {
    const rotation = new Quaternion().setFromEuler(
      new Euler(...definition.rotation),
    );
    world.createCollider(
      colliderDesc(definition.shape, definition.args)
        .setTranslation(...definition.position)
        .setRotation(rotation)
        .setDensity(0)
        .setCollisionGroups(VEHICLE_CARRIER),
      carrier,
    );
  }
  const principal = principalMassProperties(properties, frame.origin);
  carrier.setAdditionalMassProperties(
    principal.mass,
    { x: principal.centre[0], y: principal.centre[1], z: principal.centre[2] },
    {
      x: principal.principalInertia[0],
      y: principal.principalInertia[1],
      z: principal.principalInertia[2],
    },
    {
      x: principal.inertiaFrame[0],
      y: principal.inertiaFrame[1],
      z: principal.inertiaFrame[2],
      w: principal.inertiaFrame[3],
    },
    true,
  );
  carrier.recomputeMassPropertiesFromColliders();

  const independent = pieces.filter(
    (piece) => !compoundClusterOwnsPiece(frame, piece),
  );
  for (const piece of independent) {
    addFixedPiece(world, piece, VEHICLE_ATTACHMENT);
  }

  let solverContacts = 0;
  for (let step = 0; step < 12; step += 1) {
    world.step();
    for (let index = 0; index < carrier.numColliders(); index += 1) {
      world.narrowPhase.contactPairsWith(
        carrier.collider(index).handle,
        (otherHandle) => {
          world.narrowPhase.contactPair(
            carrier.collider(index).handle,
            otherHandle,
            (manifold) => {
              solverContacts += manifold.numSolverContacts();
            },
          );
        },
      );
    }
  }
  const position = carrier.translation();
  const rotation = carrier.rotation();
  const displacement = Math.hypot(
    position.x - frame.origin[0],
    position.y - frame.origin[1],
    position.z - frame.origin[2],
  );
  const angularDisplacement = 2 * Math.acos(Math.min(1, Math.abs(rotation.w)));
  const result = {
    independentPieces: independent.length,
    solverContacts,
    displacement,
    angularDisplacement,
  };
  world.free();
  return result;
}

function idleBerthResult(clusterId, berthClusterId) {
  const frame = vehicleFrameForCluster(clusterId);
  assert.ok(frame, `${clusterId} has no vehicle frame`);
  const pieces = machineScenePieces.filter(
    (piece) => piece.clusterId === clusterId,
  );
  const properties = massProperties(
    pieces,
    (material) => structuralMaterialProfiles[material].density,
  );
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  world.timestep = 1 / 60;
  const carrier = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(...frame.origin)
      .setCanSleep(true),
  );
  const carrierSources = new Map();
  for (const definition of compoundClusterColliders(frame, pieces, new Set())) {
    const rotation = new Quaternion().setFromEuler(
      new Euler(...definition.rotation),
    );
    const collider = world.createCollider(
      colliderDesc(definition.shape, definition.args)
        .setTranslation(...definition.position)
        .setRotation(rotation)
        .setDensity(0)
        .setFriction(definition.friction)
        .setRestitution(definition.restitution)
        .setCollisionGroups(VEHICLE_CARRIER),
      carrier,
    );
    carrierSources.set(collider.handle, definition.sourceId);
  }
  const principal = principalMassProperties(properties, frame.origin);
  carrier.setAdditionalMassProperties(
    principal.mass,
    { x: principal.centre[0], y: principal.centre[1], z: principal.centre[2] },
    {
      x: principal.principalInertia[0],
      y: principal.principalInertia[1],
      z: principal.principalInertia[2],
    },
    {
      x: principal.inertiaFrame[0],
      y: principal.inertiaFrame[1],
      z: principal.inertiaFrame[2],
      w: principal.inertiaFrame[3],
    },
    true,
  );
  carrier.recomputeMassPropertiesFromColliders();
  for (const piece of pieces.filter(
    (piece) => !compoundClusterOwnsPiece(frame, piece),
  )) {
    addFixedPiece(world, piece, VEHICLE_ATTACHMENT);
  }
  const berthSources = new Map();
  for (const piece of machineScenePieces.filter(
    (piece) => piece.clusterId === berthClusterId,
  )) {
    for (const handle of addIntactFixedPiece(world, piece)) {
      berthSources.set(handle, piece.id);
    }
  }

  const isRotor = clusterId === "town-vertipad:hexacopter";
  let supportSeen = false;
  const berthContacts = new Set();
  for (let step = 0; step < 600; step += 1) {
    carrier.resetForces(false);
    carrier.resetTorques(false);
    const centre = carrier.worldCom();
    carrier.addForceAtPoint(
      { x: 0, y: -properties.mass * 9.81, z: 0 },
      centre,
      false,
    );
    if (!isRotor) {
      const rotation = carrier.rotation();
      const liftArm = new Quaternion(
        rotation.x,
        rotation.y,
        rotation.z,
        rotation.w,
      );
      const liftPoint = { x: 0, y: frame.liftCentre[1] - properties.centre[1], z: 0 };
      const turned = new Vector3(
        liftPoint.x,
        liftPoint.y,
        liftPoint.z,
      ).applyQuaternion(liftArm);
      carrier.addForceAtPoint(
        { x: 0, y: properties.mass * 9.81, z: 0 },
        { x: centre.x + turned.x, y: centre.y + turned.y, z: centre.z + turned.z },
        false,
      );
    }
    world.step();
    if (step < 6) {
      for (let index = 0; index < carrier.numColliders(); index += 1) {
        const own = carrier.collider(index).handle;
        world.narrowPhase.contactPairsWith(own, (other) => {
          if (!berthSources.has(other)) return;
          world.narrowPhase.contactPair(own, other, (manifold) => {
            if (manifold.numSolverContacts() > 0) {
              berthContacts.add(
                `${carrierSources.get(own)} <-> ${berthSources.get(other)}`,
              );
            }
          });
        });
      }
    }
    supportSeen ||= countUpwardSupportContacts(world.narrowPhase, carrier) > 0;
  }
  const position = carrier.translation();
  const result = {
    displacement: Math.hypot(
      position.x - frame.origin[0],
      position.y - frame.origin[1],
      position.z - frame.origin[2],
    ),
    speed: Math.hypot(carrier.linvel().x, carrier.linvel().y, carrier.linvel().z),
    sleeping: carrier.isSleeping(),
    supportSeen,
    berthContacts: [...berthContacts],
  };
  world.free();
  return result;
}

for (const clusterId of [
  "town-vertipad:hexacopter",
  "sky-mooring:airship",
]) {
  test(`${clusterId} cannot collide with its own attached mechanisms`, () => {
    const result = selfContactResult(clusterId);
    assert.ok(result.independentPieces > 0);
    assert.equal(result.solverContacts, 0, JSON.stringify(result));
    assert.ok(result.displacement < 1e-5, JSON.stringify(result));
    assert.ok(result.angularDisplacement < 1e-5, JSON.stringify(result));
  });
}

test("the real town hexacopter settles on its pad and leaves the active island", () => {
  const result = idleBerthResult(
    "town-vertipad:hexacopter",
    "town-vertipad:pad",
  );
  assert.equal(result.supportSeen, true, JSON.stringify(result));
  assert.equal(result.sleeping, true, JSON.stringify(result));
  assert.ok(result.displacement < 0.08, JSON.stringify(result));
  assert.ok(result.speed < 1e-5, JSON.stringify(result));
});

test("the real town airship remains neutrally buoyant and sleeps at its mast", () => {
  const result = idleBerthResult("sky-mooring:airship", "sky-mooring:mast");
  assert.equal(result.sleeping, true, JSON.stringify(result));
  assert.ok(result.displacement < 0.02, JSON.stringify(result));
  assert.ok(result.speed < 1e-5, JSON.stringify(result));
});

test("the real Viking longship remains neutrally buoyant at its berth", () => {
  const result = idleBerthResult(
    "viking-village:sky-longship",
    "viking-village:sky-longship-dock",
  );
  assert.deepEqual(result.berthContacts, [], JSON.stringify(result));
  assert.equal(result.sleeping, true, JSON.stringify(result));
  assert.ok(result.displacement < 0.02, JSON.stringify(result));
  assert.ok(result.speed < 1e-5, JSON.stringify(result));
});
