import assert from "node:assert/strict";
import test from "node:test";
import RAPIER from "@dimforge/rapier3d-compat";
import {
  DEBRIS_EMBED_TOLERANCE,
  debrisBodyIsEmbedded,
} from "../games/make-a-mess/src/game/debrisCollisionActivation.ts";
import {
  DEBRIS_ACTOR_DETAIL,
  DEBRIS_LEAVING_CARRIER,
} from "../games/make-a-mess/src/game/physicsInteractionGroups.ts";

await RAPIER.init();

function debrisBody(world, x, half = 0.5) {
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic().setTranslation(x, 1, 0),
  );
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(half, half, half)
      .setCollisionGroups(DEBRIS_LEAVING_CARRIER),
    body,
  );
  return body;
}

test("sibling collisions arm only after real debris shapes separate", () => {
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  const first = debrisBody(world, 0);
  const second = debrisBody(world, 0.7);
  world.step();
  const handles = new Set([first.handle, second.handle]);

  assert.equal(
    debrisBodyIsEmbedded(world, first, handles, DEBRIS_ACTOR_DETAIL),
    true,
  );
  second.setTranslation({ x: 1.2, y: 1, z: 0 }, true);
  world.step();
  assert.equal(
    debrisBodyIsEmbedded(world, first, handles, DEBRIS_ACTOR_DETAIL),
    false,
  );
  world.free();
});

// Солвер Rapier штатно оставляет в покоящемся контакте миллиметры
// проникновения. Пока ворота спрашивали факт пересечения, куча обломков не
// открывала их НИКОГДА: 154 куска из 165 на фасаде хрущёвки оставались
// призраками и вмуровывались друг в друга.
test("resting contact is not an embedded overlap", () => {
  const world = new RAPIER.World({ x: 0, y: -14, z: 0 });
  world.timestep = 1 / 60;
  const ground = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(0, -1, 0),
  );
  world.createCollider(RAPIER.ColliderDesc.cuboid(10, 1, 10), ground);
  const lower = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 0.1, 0),
  );
  const upper = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 0.35, 0),
  );
  for (const body of [lower, upper]) {
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(1.35, 0.1, 1.66).setDensity(2.4),
      body,
    );
  }
  for (let step = 0; step < 240; step += 1) {
    world.step();
  }
  const gap = upper.translation().y - lower.translation().y;
  assert.ok(gap < 0.2, `slabs must actually rest on each other, got ${gap}`);
  assert.ok(
    0.2 - gap < DEBRIS_EMBED_TOLERANCE,
    `resting penetration ${0.2 - gap} must stay under the tolerance`,
  );

  const handles = new Set([lower.handle, upper.handle]);
  assert.equal(
    debrisBodyIsEmbedded(world, lower, handles, DEBRIS_ACTOR_DETAIL),
    false,
  );
  assert.equal(
    debrisBodyIsEmbedded(world, upper, handles, DEBRIS_ACTOR_DETAIL),
    false,
  );
  world.free();
});

// Заделка на сантиметры — это не покой, а именно то состояние, ради которого
// льгота существует: авторское взаимопроникновение или рождение внутри машины.
test("a piece buried a few centimetres deep still counts as embedded", () => {
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  const host = debrisBody(world, 0);
  const buried = debrisBody(world, 1.0 - 3 * DEBRIS_EMBED_TOLERANCE);
  world.step();
  const handles = new Set([host.handle, buried.handle]);
  assert.equal(
    debrisBodyIsEmbedded(world, buried, handles, DEBRIS_ACTOR_DETAIL),
    true,
  );
  world.free();
});

// Тонкой детали ужимать нечего: у лопасти 28 мм полуразмер меньше самого
// порога, и запас обязан сжиматься вместе с ней, а не обнулять форму.
test("a thin plate is still tested with a shape of its own", () => {
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  const blade = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 1, 0),
  );
  world.createCollider(RAPIER.ColliderDesc.cuboid(0.225, 0.014, 0.085), blade);
  const wall = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic().setTranslation(0.3, 1, 0),
  );
  world.createCollider(RAPIER.ColliderDesc.cuboid(0.2, 0.5, 0.5), wall);
  world.step();
  const handles = new Set([blade.handle, wall.handle]);
  assert.equal(
    debrisBodyIsEmbedded(world, blade, handles, DEBRIS_ACTOR_DETAIL),
    true,
  );
  wall.setTranslation({ x: 0.9, y: 1, z: 0 }, true);
  world.step();
  assert.equal(
    debrisBodyIsEmbedded(world, blade, handles, DEBRIS_ACTOR_DETAIL),
    false,
  );
  world.free();
});

// Запрос не имеет права трогать сам коллайдер: форма у rapier-compat
// кэшируется, и ужатая половина осталась бы жить в физике навсегда.
test("the probe restores the collider shape it borrowed", () => {
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  const body = debrisBody(world, 0);
  world.step();
  const before = body.collider(0).shape.halfExtents;
  const snapshot = { x: before.x, y: before.y, z: before.z };
  debrisBodyIsEmbedded(
    world,
    body,
    new Set([body.handle]),
    DEBRIS_ACTOR_DETAIL,
  );
  const after = body.collider(0).shape.halfExtents;
  assert.deepEqual({ x: after.x, y: after.y, z: after.z }, snapshot);
  world.free();
});
