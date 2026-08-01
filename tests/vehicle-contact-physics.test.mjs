import assert from "node:assert/strict";
import test from "node:test";

import RAPIER from "@dimforge/rapier3d-compat";

import * as vehicleFrameModule from "../games/make-a-mess/src/game/vehicleFrames.ts";
import {
  countUpwardSupportContacts,
  createActivePhysicalContactRegistry,
} from "../games/make-a-mess/src/game/vehiclePhysicalContact.ts";

await RAPIER.init();

test("support registry makes the 60 Hz read independent of collider count", () => {
  const contacts = createActivePhysicalContactRegistry();
  assert.equal(contacts.size(), 0);
  contacts.enter(2, 11);
  contacts.enter(2, 17);
  contacts.enter(2, 11);
  assert.equal(contacts.size(), 2);
  const visited = [];
  contacts.forEach((own, other) => visited.push([own, other]));
  assert.deepEqual(visited, [
    [2, 11],
    [2, 17],
  ]);
  contacts.exit(11, 2);
  assert.equal(contacts.size(), 1);
  contacts.clear();
  assert.equal(contacts.size(), 0);
});

test("Rapier contact and friction stop a loaded vehicle without support forces", () => {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = 1 / 60;
  const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(20, 0.1, 20).setFriction(1),
    ground,
  );
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(0, 0.62, 0)
      .setCcdEnabled(true),
  );
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5).setFriction(1),
    body,
  );
  body.setLinvel({ x: 6, y: 0, z: 0 }, true);

  let supportSeen = false;
  for (let step = 0; step < 240; step += 1) {
    world.step();
    supportSeen ||= countUpwardSupportContacts(world.narrowPhase, body) > 0;
  }
  assert.equal(supportSeen, true, "real ground manifold was never observed");
  assert.ok(
    Math.abs(body.linvel().x) < 0.15,
    `Rapier friction did not stop the body: ${body.linvel().x}`,
  );
  world.free();
});

test("a side collision is physical contact but not landing support", () => {
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  const wall = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  world.createCollider(RAPIER.ColliderDesc.cuboid(0.1, 2, 2), wall);
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic().setTranslation(-0.7, 0, 0),
  );
  world.createCollider(RAPIER.ColliderDesc.cuboid(0.6, 0.5, 0.5), body);
  body.setLinvel({ x: 2, y: 0, z: 0 }, true);
  world.step();
  assert.equal(countUpwardSupportContacts(world.narrowPhase, body), 0);
  world.free();
});

test("vehicle sensors are measurements: only downward units are on by default", () => {
  assert.equal("vehicleProbeReach" in vehicleFrameModule, false);
  assert.equal("vehicleProbeReaction" in vehicleFrameModule, false);
  assert.equal("vehicleProbeFriction" in vehicleFrameModule, false);
  for (const frame of vehicleFrameModule.vehicleFrames) {
    assert.equal("hullProbes" in frame, false);
    assert.ok(frame.proximitySensors.length > 0, `${frame.id} has no sensors`);
    for (const sensor of frame.proximitySensors) {
      assert.equal(
        vehicleFrameModule.vehicleProximitySensorEnabled(sensor),
        sensor.normal[1] < -0.35,
        `${frame.id} sensor has the wrong default power state`,
      );
    }
  }
});
