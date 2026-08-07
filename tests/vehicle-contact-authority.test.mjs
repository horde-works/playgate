import assert from "node:assert/strict";
import test from "node:test";

import RAPIER from "@dimforge/rapier3d-compat";
import { Euler, Quaternion, Vector3 } from "three";

import {
  massProperties,
  principalMassProperties,
} from "../games/make-a-mess/src/game/clusterDynamics.ts";
import { compoundClusterColliders } from "../games/make-a-mess/src/game/compoundKinematicCluster.ts";
import {
  materialRuntimeProfiles,
  structuralMaterialProfiles,
} from "../games/make-a-mess/src/game/destructionScene.ts";
import { townScene } from "../games/make-a-mess/src/game/townScene.ts";
import { combatHexacopterRangeScene } from "../games/make-a-mess/src/game/combatHexacopterRangeScene.ts";
import { TOWN_HEXACOPTER_CLUSTER_ID } from "../games/make-a-mess/src/game/townHexacopter.ts";
import { vehicleFrameForCluster } from "../games/make-a-mess/src/game/vehicleFrames.ts";

await RAPIER.init();

const STEP = 1 / 60;
const IMPACT_SPEED = 20;
const RUN_STEPS = 30;
const CITY_WALL_ID = "hru:walls:0:0:flat:14.8625";

const frame = vehicleFrameForCluster(TOWN_HEXACOPTER_CLUSTER_ID);
assert.ok(frame, "hexacopter frame is missing");

const pieces = combatHexacopterRangeScene.breakablePieces.filter(
  (piece) => piece.clusterId === TOWN_HEXACOPTER_CLUSTER_ID,
);
const colliders = compoundClusterColliders(frame, pieces, new Set());
const properties = massProperties(
  pieces,
  (material) => structuralMaterialProfiles[material].density,
);
const cityWall = townScene.breakablePieces.find(
  (piece) => piece.id === CITY_WALL_ID,
);
assert.ok(cityWall, `city wall ${CITY_WALL_ID} is missing`);

/** Exact local x bounds of the authored collider compound. */
function compoundXBounds() {
  let minimum = Infinity;
  let maximum = -Infinity;
  for (const collider of colliders) {
    const rotation = new Quaternion().setFromEuler(
      new Euler(...collider.rotation),
    );
    const halfExtents =
      collider.shape === "sphere"
        ? [collider.args[0], collider.args[0], collider.args[0]]
        : collider.shape === "cylinder"
          ? [collider.args[1], collider.args[0], collider.args[1]]
          : collider.args;
    for (const x of [-1, 1]) {
      for (const y of [-1, 1]) {
        for (const z of [-1, 1]) {
          const corner = new Vector3(
            x * halfExtents[0],
            y * halfExtents[1],
            z * halfExtents[2],
          ).applyQuaternion(rotation);
          const worldX = collider.position[0] + corner.x;
          minimum = Math.min(minimum, worldX);
          maximum = Math.max(maximum, worldX);
        }
      }
    }
  }
  return { minimum, maximum };
}

const localBounds = compoundXBounds();

function createColliderDesc(definition) {
  const desc =
    definition.shape === "sphere"
      ? RAPIER.ColliderDesc.ball(definition.args[0])
      : definition.shape === "cylinder"
        ? RAPIER.ColliderDesc.cylinder(
            definition.args[0],
            definition.args[1],
          )
        : RAPIER.ColliderDesc.cuboid(...definition.args);
  const rotation = new Quaternion().setFromEuler(
    new Euler(...definition.rotation),
  );
  return desc
    .setTranslation(...definition.position)
    .setRotation(rotation)
    // Authored mass is installed on the body. Collider density must not add a
    // second, geometry-derived mass that the live vehicle does not possess.
    .setDensity(0)
    .setFriction(definition.friction)
    .setRestitution(definition.restitution)
    .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
}

function createScenario(kind) {
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  world.timestep = STEP;

  const wallThickness = Math.min(...cityWall.size);
  const wallHalfThickness = wallThickness / 2;
  const wallBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(wallHalfThickness, 6, 6)
      .setFriction(0.84)
      .setRestitution(materialRuntimeProfiles[cityWall.material].restitution)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
    wallBody,
  );

  const bodyDesc =
    kind === "dynamic"
      ? RAPIER.RigidBodyDesc.dynamic()
          .setCcdEnabled(true)
          // This fixture isolates the translational non-penetration contract.
          // Rotation and damage response receive their own tests.
          .lockRotations()
      : RAPIER.RigidBodyDesc.kinematicPositionBased();
  const body = world.createRigidBody(bodyDesc);
  for (const definition of colliders) {
    const desc = createColliderDesc(definition);
    if (kind === "kinematic") {
      desc.setActiveCollisionTypes(
        RAPIER.ActiveCollisionTypes.DEFAULT |
          RAPIER.ActiveCollisionTypes.KINEMATIC_FIXED,
      );
    }
    world.createCollider(desc, body);
  }
  if (kind === "dynamic") {
    const principal = principalMassProperties(properties, frame.origin);
    body.setAdditionalMassProperties(
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
    body.recomputeMassPropertiesFromColliders();
    assert.ok(
      Math.abs(body.mass() - properties.mass) < 1e-4,
      `Rapier mass ${body.mass()} != authored mass ${properties.mass}`,
    );
  }

  const initialGap = 0.18;
  const startX =
    -wallHalfThickness - initialGap - localBounds.maximum;
  body.setTranslation({ x: startX, y: 0, z: 0 }, false);
  if (kind === "dynamic") {
    body.setLinvel({ x: IMPACT_SPEED, y: 0, z: 0 }, true);
  }

  const events = new RAPIER.EventQueue(true);
  let collisionStarts = 0;
  for (let step = 0; step < RUN_STEPS; step += 1) {
    if (kind === "kinematic") {
      body.setNextKinematicTranslation({
        x: startX + IMPACT_SPEED * STEP * (step + 1),
        y: 0,
        z: 0,
      });
    }
    world.step(events);
    events.drainCollisionEvents((_first, _second, started) => {
      if (started) collisionStarts += 1;
    });
  }

  const position = body.translation().x;
  const result = {
    back: position + localBounds.minimum,
    front: position + localBounds.maximum,
    collisionStarts,
    speed: body.linvel().x,
    wallHalfThickness,
  };
  events.free();
  world.free();
  return result;
}

test("fixture uses the real hexacopter, authored mass, and a sub-step city wall", () => {
  assert.equal(pieces.length, 629);
  assert.equal(colliders.length, 611);
  // 86.5 вместо прежних 84.3: лопасти переведены с пластика на сталь, чтобы
  // экранированный кольцом винт переживал близкий взрыв, и весят они вдвое
  // больше (2.2 -> 4.4 единиц на все восемнадцать). Тяговооружённость
  // поднята следом, смысл запаса прежний.
  assert.ok(
    Math.abs(properties.mass - 86.5) < 0.1,
    `unexpected authored mass ${properties.mass}`,
  );
  assert.equal(Math.min(...cityWall.size), 0.24);
  assert.ok(
    IMPACT_SPEED * STEP > Math.min(...cityWall.size),
    "the wall must be thinner than one impact-speed physics step",
  );
});

test("position-driven compound crosses a wall despite receiving collision events", () => {
  const result = createScenario("kinematic");
  assert.ok(result.collisionStarts > 0, "the wall was not observed at all");
  assert.ok(
    result.back > result.wallHalfThickness,
    `kinematic carrier did not fully cross the wall: ${JSON.stringify(result)}`,
  );
});

test("dynamic CCD compound stops its real outer geometry at the city wall", () => {
  const result = createScenario("dynamic");
  const tolerance = 0.001;
  assert.ok(result.collisionStarts > 0, "the wall was not observed at all");
  assert.ok(
    result.front <= -result.wallHalfThickness + tolerance,
    `dynamic carrier penetrated the wall: ${JSON.stringify(result)}`,
  );
  assert.ok(
    result.speed <= 0.05,
    `carrier retained velocity into the intact wall: ${JSON.stringify(result)}`,
  );
});
