import assert from "node:assert/strict";
import test from "node:test";
import RAPIER from "@dimforge/rapier3d-compat";
import { debrisBodyHasSiblingOverlap } from "../games/make-a-mess/src/game/debrisCollisionActivation.ts";
import {
  DEBRIS_ACTOR_DETAIL,
  DEBRIS_SETTLING,
} from "../games/make-a-mess/src/game/physicsInteractionGroups.ts";

await RAPIER.init();

function debrisBody(world, x) {
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic().setTranslation(x, 1, 0),
  );
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5)
      .setCollisionGroups(DEBRIS_SETTLING),
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
    debrisBodyHasSiblingOverlap(
      world,
      first,
      handles,
      DEBRIS_ACTOR_DETAIL,
    ),
    true,
  );
  second.setTranslation({ x: 1.2, y: 1, z: 0 }, true);
  world.step();
  assert.equal(
    debrisBodyHasSiblingOverlap(
      world,
      first,
      handles,
      DEBRIS_ACTOR_DETAIL,
    ),
    false,
  );
  world.free();
});
