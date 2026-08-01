import assert from "node:assert/strict";
import test from "node:test";
import {
  vehicleDamageSmokeRate,
  vehicleEngineDamageSmoke,
} from "../games/make-a-mess/src/game/vehicleDamageSmoke.ts";

const bindings = [{
  id: "engine:0",
  commandChannel: "throttle:0",
  totalContribution: 2,
  members: [
    { pieceId: "core", contribution: 1, required: true },
    { pieceId: "left", contribution: 1, required: false },
    { pieceId: "right", contribution: 1, required: false },
  ],
}];

test("damage smoke follows actual actuator loss and a detached required core", () => {
  assert.deepEqual(vehicleEngineDamageSmoke(bindings, new Set(), 0), {
    severity: 0,
    detachedAnchorPieceId: null,
  });
  assert.deepEqual(vehicleEngineDamageSmoke(bindings, new Set(["left"]), 0), {
    severity: 0.5,
    detachedAnchorPieceId: null,
  });
  assert.deepEqual(vehicleEngineDamageSmoke(bindings, new Set(["core"]), 0), {
    severity: 1,
    detachedAnchorPieceId: "core",
  });
});

test("healthy engines do not smoke merely because the failed carrier releases them", () => {
  const twoEngines = [
    ...bindings,
    {
      id: "engine:1",
      commandChannel: "throttle:1",
      totalContribution: 1,
      members: [
        { pieceId: "core:1", contribution: 1, required: true },
        { pieceId: "drive:1", contribution: 1, required: false },
      ],
    },
  ];
  const directDamage = new Set(["core"]);
  assert.equal(vehicleEngineDamageSmoke(twoEngines, directDamage, 0).severity, 1);
  assert.equal(vehicleEngineDamageSmoke(twoEngines, directDamage, 1).severity, 0);
});

test("combustion smoke persists while electrical smoke cools after the burst", () => {
  assert.equal(vehicleDamageSmokeRate(1, 30, false), 42);
  assert.ok(vehicleDamageSmokeRate(1, 0, true) > 40);
  assert.ok(vehicleDamageSmokeRate(1, 20, true) < 8);
  assert.equal(vehicleDamageSmokeRate(0, 0, false), 0);
});
