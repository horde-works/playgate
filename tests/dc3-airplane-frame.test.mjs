import assert from "node:assert/strict";
import test from "node:test";
import { airVehicles } from "../games/make-a-mess/src/game/airVehicles.ts";
import { vehicleFrames } from "../games/make-a-mess/src/game/vehicleFrames.ts";
import { compileCommandActuators } from "../games/make-a-mess/src/game/vehicleActuation.ts";
import { dc3BlockoutObject } from "../games/make-a-mess/src/content/objects/aircraft/dc3BlockoutObject.ts";
import {
  DC3_ACTUATOR_PIECES,
  DC3_AIRPLANE_CLASS,
  DC3_STAND_CLUSTER_ID,
  DC3_STALL_MASS,
  compileDc3AirplanePieces,
  dc3AirplaneStandFrame,
  dc3AirplaneStandMass,
  dc3AirplaneStandPieces,
  dc3AirplaneStandVehicle,
} from "../games/make-a-mess/src/game/dc3Airplane.ts";
import { createAirplane, stepAirplane, centreOf, dt } from "./airplane-rig.mjs";

test("compiled pieces keep Object Lab ids and actuator channels", () => {
  const pieces = compileDc3AirplanePieces();
  assert.equal(pieces.length, dc3BlockoutObject.parts.length);
  assert.ok(pieces.every((piece) => piece.clusterId === DC3_STAND_CLUSTER_ID));
  for (const entry of DC3_ACTUATOR_PIECES) {
    const piece = pieces.find((item) => item.id === entry.id);
    assert.ok(piece, `missing compiled part ${entry.id}`);
    assert.equal(piece.actuator?.commandChannel, entry.actuator.commandChannel);
  }
  const channels = compileCommandActuators(pieces)
    .map((binding) => binding.commandChannel)
    .sort();
  assert.deepEqual(channels, [
    "aileron",
    "elevator",
    "flap",
    "rudder",
    "throttle:0",
    "throttle:1",
  ]);
  const hinged = pieces.filter((piece) => piece.hinge);
  assert.equal(hinged.length, Object.keys(dc3BlockoutObject.surfaceHinges).length);
  const wing = pieces.find((piece) => piece.id === "wing-right");
  const cage = pieces.filter((piece) => piece.id.startsWith("fuselage-frame-") || piece.id.startsWith("longeron-"));
  assert.equal(wing?.material, "aluminium");
  assert.ok(cage.length > 0 && cage.every((piece) => piece.material === "steel"));
});

test("the frame reads the object and stays out of every world registry", () => {
  const frame = dc3AirplaneStandFrame;
  assert.equal(frame.id, DC3_AIRPLANE_CLASS.id);
  assert.equal(frame.clusterId, DC3_STAND_CLUSTER_ID);
  assert.equal(frame.envelopeMatch, "wing-");
  assert.ok(frame.nose[2] > 0.8);
  assert.ok(Math.abs(frame.liftCentre[0]) < 0.4);
  assert.equal(dc3AirplaneStandVehicle.flight.liftSource, "wing");
  assert.equal(dc3AirplaneStandVehicle.flight.airplane, DC3_AIRPLANE_CLASS.passport);
  assert.equal(
    airVehicles.some((vehicle) => vehicle.id === DC3_AIRPLANE_CLASS.id),
    false,
  );
  assert.equal(
    vehicleFrames.some((item) => item.id === DC3_AIRPLANE_CLASS.id),
    false,
  );
});

test("stand mass is the stall identity; CoM stays inside the wing box", () => {
  const mass = dc3AirplaneStandMass(dc3AirplaneStandPieces);
  assert.ok(Math.abs(mass.mass - DC3_STALL_MASS) < 1e-6);
  assert.ok(Math.abs(mass.centre[0]) < 1.2);
  assert.ok(mass.centre[1] > 0.2 && mass.centre[1] < 3.2);
  assert.ok(mass.centre[2] > -6 && mass.centre[2] < 4);
});

test("force stand: cruise guidance keeps the wing flying and flaps stay up", () => {
  const machine = createAirplane({
    startPoint: [0, 80, 0],
    startVelocity: [0, 0, 67],
  });
  const start = centreOf(machine);
  let peakLift = 0;
  for (let step = 0; step < 2 / dt; step += 1) {
    const result = stepAirplane(machine, {
      forwardSpeed: 67,
      lateralSpeed: 0,
      yawRate: 0,
      liftFraction: 0.15,
    });
    peakLift = Math.max(peakLift, result.lift);
  }
  const now = centreOf(machine);
  assert.ok(machine.lastStep.airspeed > 40);
  assert.equal(machine.lastStep.flap, 0);
  assert.ok(peakLift > DC3_STALL_MASS * 9.81, "wing never carried the stall weight");
  assert.ok(now[1] > 50, `left the air (${now[1]} m)`);
  assert.ok(machine.lastStep.forces.length >= 1);
});

test("force stand: approach drops flaps; a dead aileron cuts authority", () => {
  const machine = createAirplane({
    startPoint: [0, 60, 0],
    startVelocity: [0, 0, 34],
  });
  const approach = stepAirplane(machine, {
    forwardSpeed: 32,
    lateralSpeed: 8,
    yawRate: 0.18,
    liftFraction: 0.1,
    approachPhase: true,
  });
  assert.equal(approach.flap, 1);
  assert.ok(approach.requested.aileron > 0);
  assert.equal(approach.requested.throttle[0], approach.requested.throttle[1]);
  machine.attached.delete("aileron-left");
  machine.attached.delete("aileron-right");
  const damaged = stepAirplane(machine, {
    forwardSpeed: 32,
    lateralSpeed: 8,
    yawRate: 0.18,
    liftFraction: 0.1,
    approachPhase: true,
  });
  assert.equal(damaged.delivered.aileron, 0);
  assert.equal(damaged.authority.aileron, 0);
  assert.ok(Math.abs(damaged.requested.aileron) > 0.3);
});
