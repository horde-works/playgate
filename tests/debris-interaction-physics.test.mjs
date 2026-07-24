import assert from "node:assert/strict";
import test from "node:test";

import RAPIER from "@dimforge/rapier3d-compat";

await RAPIER.init();

const GROUP_WORLD = 0x0001;
const GROUP_DEBRIS = 0x0002;
const GROUP_ACTOR = 0x0004;
const GROUP_ACTOR_DETAIL = 0x0008;
const interactionGroups = (membership, filter) =>
  ((membership << 16) | filter) >>> 0;
const DEBRIS_NORMAL = interactionGroups(
  GROUP_DEBRIS,
  GROUP_WORLD | GROUP_DEBRIS | GROUP_ACTOR,
);
const ACTOR_NORMAL = interactionGroups(
  GROUP_ACTOR,
  GROUP_WORLD | GROUP_DEBRIS | GROUP_ACTOR_DETAIL,
);
const DEBRIS_ACTOR_DETAIL = interactionGroups(
  GROUP_ACTOR_DETAIL,
  GROUP_ACTOR,
);

function createScenario(targetType = "fixed") {
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  world.timestep = 1 / 60;

  const target = world.createRigidBody(
    targetType === "dynamic"
      ? RAPIER.RigidBodyDesc.dynamic()
          .lockTranslations()
          .lockRotations()
      : RAPIER.RigidBodyDesc.fixed(),
  );

  // Keep the cheap primary proxies outside the projectile path. Any contact
  // through the centre must therefore come from the omitted-detail mesh.
  for (const y of [-1.4, 1.4]) {
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.2, 0.2, 0.2)
        .setTranslation(0, y, 0)
        .setCollisionGroups(DEBRIS_NORMAL),
      target,
    );
  }

  const detailCollider = world.createCollider(
    RAPIER.ColliderDesc.cuboid(0.04, 0.5, 0.5)
      .setDensity(0)
      .setCollisionGroups(DEBRIS_ACTOR_DETAIL)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
    target,
  );

  return { world, target, detailCollider };
}

function createCcdBall(world, collisionGroups = ACTOR_NORMAL) {
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(-1, 0, 0)
      .setLinvel(32, 0, 0)
      .setCcdEnabled(true),
  );
  const colliderDesc = RAPIER.ColliderDesc.ball(0.14)
    .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
  if (collisionGroups !== undefined) {
    colliderDesc.setCollisionGroups(collisionGroups);
  }
  world.createCollider(colliderDesc, body);
  return body;
}

function stepWorld(world, steps = 6) {
  const events = new RAPIER.EventQueue(true);
  const startedPairs = [];
  try {
    for (let step = 0; step < steps; step += 1) {
      world.step(events);
      events.drainCollisionEvents((handle1, handle2, started) => {
        if (started) {
          startedPairs.push([handle1, handle2]);
        }
      });
    }
  } finally {
    events.free();
  }
  return startedPairs;
}

test("rocket-speed CCD actor hits actor-only detail on a standing remnant", () => {
  const { world, target, detailCollider } = createScenario();
  try {
    assert.equal(target.bodyType(), RAPIER.RigidBodyType.Fixed);
    assert.equal(target.numColliders(), 3);

    const projectile = createCcdBall(world);
    const startedPairs = stepWorld(world);

    assert.equal(
      startedPairs.some(
        ([handle1, handle2]) =>
          handle1 === detailCollider.handle || handle2 === detailCollider.handle,
      ),
      true,
    );
    assert.equal(projectile.translation().x < 0, true);
  } finally {
    world.free();
  }
});

test("rocket-speed CCD actor hits actor-only detail after the remnant falls", () => {
  const { world, target, detailCollider } = createScenario("dynamic");
  try {
    assert.equal(target.bodyType(), RAPIER.RigidBodyType.Dynamic);
    const projectile = createCcdBall(world);
    const startedPairs = stepWorld(world);

    assert.equal(
      startedPairs.some(
        ([handle1, handle2]) =>
          handle1 === detailCollider.handle || handle2 === detailCollider.handle,
      ),
      true,
    );
    assert.equal(projectile.translation().x < 0, true);
  } finally {
    world.free();
  }
});

test("debris bodies ignore the actor-only omitted detail mesh", () => {
  const { world } = createScenario("dynamic");
  try {
    const debris = createCcdBall(world, DEBRIS_NORMAL);
    const startedPairs = stepWorld(world);

    assert.deepEqual(startedPairs, []);
    assert.equal(debris.translation().x > 1, true);
  } finally {
    world.free();
  }
});
