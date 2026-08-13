import assert from "node:assert/strict";
import test from "node:test";
import {
  INTACT_AIRPLANE_AVAILABILITY,
  airplaneAllocate,
  airplaneFlapFor,
  airplaneFlightStep,
  airplaneForces,
  airplaneTurnCapability,
  stallSpeedOf,
  wingPanelCapacity,
} from "../games/make-a-mess/src/game/airplaneDynamics.ts";
import {
  DC3_ACTUATOR_PIECES,
  DC3_AIRPLANE_CLASS,
  DC3_AIRPLANE_PASSPORT,
  DC3_STALL_WEIGHT,
  DC3_WING_PANELS,
} from "../games/make-a-mess/src/game/dc3Airplane.ts";
import { airVehicles } from "../games/make-a-mess/src/game/airVehicles.ts";
import { compileCommandActuators } from "../games/make-a-mess/src/game/vehicleActuation.ts";
import {
  liftApplicationPoint,
  liftHoldVerdict,
  wingLiftState,
} from "../games/make-a-mess/src/game/vehicleLiftGeometry.ts";

const passport = DC3_AIRPLANE_PASSPORT;
const intact = INTACT_AIRPLANE_AVAILABILITY;

test("DC-3 is a wing class and is not seated in any world", () => {
  assert.equal(DC3_AIRPLANE_CLASS.liftSource, "wing");
  assert.equal(DC3_AIRPLANE_CLASS.worldIntegration, false);
  assert.equal(
    airVehicles.some((vehicle) => vehicle.id === DC3_AIRPLANE_CLASS.id),
    false,
  );
});

test("actuator tags compile to throttle, surfaces and flap channels", () => {
  const bindings = compileCommandActuators(DC3_ACTUATOR_PIECES);
  const channels = bindings.map((binding) => binding.commandChannel).sort();
  assert.deepEqual(channels, [
    "aileron",
    "elevator",
    "flap",
    "rudder",
    "throttle:0",
    "throttle:1",
  ]);
  const engines = bindings.filter((binding) => binding.commandChannel.startsWith("throttle:"));
  assert.ok(engines.every((binding) => binding.members.some((member) => member.required)));
  assert.equal(bindings.find((binding) => binding.commandChannel === "flap")?.members.length, 4);
  assert.equal(bindings.find((binding) => binding.commandChannel === "aileron")?.members.length, 2);
});

test("guidance does not ask the airplane to fly sideways", () => {
  const command = airplaneAllocate(
    {
      forwardSpeed: 60,
      lateralSpeed: 12,
      yawRate: 0,
      liftFraction: 0,
    },
    passport,
    intact,
  );
  assert.equal(command.aileron, 0);
  assert.equal(command.rudder, 0);
  assert.ok(command.throttle[0] > 0.7);
  assert.equal(command.flap, 0);
});

test("approach phase drops flaps; climb asks elevator and throttle", () => {
  const cruise = airplaneAllocate(
    { forwardSpeed: 67, lateralSpeed: 0, yawRate: 0, liftFraction: 0 },
    passport,
    intact,
  );
  const approach = airplaneAllocate(
    {
      forwardSpeed: 32,
      lateralSpeed: 0,
      yawRate: 0.2,
      liftFraction: 0.15,
      approachPhase: true,
    },
    passport,
    intact,
  );
  assert.equal(cruise.flap, 0);
  assert.equal(approach.flap, 1);
  assert.ok(approach.elevator > cruise.elevator);
  assert.ok(approach.aileron > 0);
});

test("at stall identity the intact wing holds weight; below stall it does not", () => {
  const panels = DC3_WING_PANELS.map((point) => ({ point: [...point], available: 1 }));
  const capacity = wingPanelCapacity(passport, passport.stallSpeed, 0, panels.length);
  const flying = liftHoldVerdict(
    "wing",
    panels,
    [0, 0, 0],
    capacity,
    DC3_STALL_WEIGHT,
  );
  assert.equal(wingLiftState(flying), "flying");
  const slow = liftHoldVerdict(
    "wing",
    panels,
    [0, 0, 0],
    wingPanelCapacity(passport, passport.stallSpeed * 0.7, 0, panels.length),
    DC3_STALL_WEIGHT,
  );
  assert.equal(wingLiftState(slow), "stalled");
});

test("losing one wing is a tumble, not a soft descent", () => {
  const panels = DC3_WING_PANELS.map((point, index) => ({
    point: [...point],
    available: index < 2 ? 0 : 1,
  }));
  const capacity = wingPanelCapacity(passport, passport.cruiseSpeed, 0, panels.length);
  const verdict = liftHoldVerdict("wing", panels, [0, 0, 0], capacity, DC3_STALL_WEIGHT);
  assert.equal(wingLiftState(verdict), "tumbling");
  const liftPoint = liftApplicationPoint("wing", [0, 0.35, 0], panels);
  assert.ok(liftPoint[0] > 2, "lift did not move onto the live wing");
});

test("flaps raise lift and drag; a dead engine yaws", () => {
  const state = { airspeed: 40, alpha: 0.08, beta: 0 };
  const clean = airplaneForces(
    { aileron: 0, elevator: 0, rudder: 0, flap: 0, throttle: [1, 1] },
    state,
    passport,
    intact,
  );
  const dirty = airplaneForces(
    { aileron: 0, elevator: 0, rudder: 0, flap: 1, throttle: [1, 1] },
    state,
    passport,
    intact,
  );
  assert.ok(dirty.lift > clean.lift);
  assert.ok(dirty.drag > clean.drag);
  const oneEngine = airplaneForces(
    { aileron: 0, elevator: 0, rudder: 0, flap: 0, throttle: [1, 0] },
    state,
    passport,
    { ...intact, engines: [1, 0] },
  );
  assert.ok(oneEngine.thrust < clean.thrust * 0.6);
  assert.ok(Math.abs(oneEngine.moment[1]) > Math.abs(clean.moment[1]));
});

function cruiseStep(guidance, availability = intact, airspeed = 67) {
  return airplaneFlightStep({
    passport,
    guidance,
    availability,
    mass: DC3_STALL_WEIGHT / 9.81,
    orientation: [0, 0, 0, 1],
    velocity: [0, 0, airspeed],
    centre: [0, 10, 0],
    nose: [0, 0, 1],
  });
}

test("inner loop answers guidance with every surface and both engines", () => {
  const step = cruiseStep({
    forwardSpeed: 67,
    lateralSpeed: 14,
    yawRate: 0.2,
    liftFraction: 0.4,
  });
  assert.ok(step.requested.throttle[0] > 0.7);
  assert.equal(step.requested.throttle[0], step.requested.throttle[1]);
  assert.ok(step.requested.aileron > 0);
  assert.ok(step.requested.elevator > 0);
  assert.ok(step.requested.rudder > 0);
  assert.equal(step.requested.flap, 0);
  assert.equal(step.delivered.aileron, step.requested.aileron);
  assert.ok(step.forces.length >= 3, "lift plus the surface couple");
});

test("the automaton drops flaps from phase and speed, not from a climb lever", () => {
  assert.equal(
    airplaneFlapFor({ approachPhase: true, forwardSpeed: 32 }, 32, passport),
    1,
  );
  assert.equal(
    airplaneFlapFor({ approachPhase: false, forwardSpeed: 20 }, 28, passport),
    1,
  );
  assert.equal(
    airplaneFlapFor({ approachPhase: false, forwardSpeed: 67 }, 67, passport),
    0,
  );
  const approach = cruiseStep(
    {
      forwardSpeed: 32,
      lateralSpeed: 0,
      yawRate: 0,
      liftFraction: 0,
      approachPhase: true,
    },
    intact,
    32,
  );
  const slow = cruiseStep(
    { forwardSpeed: 28, lateralSpeed: 0, yawRate: 0, liftFraction: 0 },
    intact,
    28,
  );
  const cruise = cruiseStep({
    forwardSpeed: 67,
    lateralSpeed: 0,
    yawRate: 0,
    liftFraction: 0.5,
  });
  assert.equal(approach.flap, 1);
  assert.equal(slow.flap, 1);
  assert.equal(cruise.flap, 0);
});

test("autopilot learns a non-holonomic turn from the passport", () => {
  const capability = airplaneTurnCapability(passport, 67, DC3_STALL_WEIGHT / 9.81);
  assert.equal(capability.lateralAcceleration, 0);
  assert.ok(capability.yawRate > 0);
  assert.ok(capability.yawRate < 0.32);
  assert.ok(capability.braking > 0);
});

test("a dead surface cuts authority; the request itself stays intact", () => {
  const step = cruiseStep(
    {
      forwardSpeed: 67,
      lateralSpeed: 0,
      yawRate: 0.25,
      liftFraction: 0.2,
    },
    { ...intact, aileron: 0, engines: [1, 0] },
  );
  assert.ok(Math.abs(step.requested.aileron) > 0.4);
  assert.equal(step.delivered.aileron, 0);
  assert.equal(step.authority.aileron, 0);
  assert.ok(step.authority.throttle < 0.6);
  assert.equal(step.delivered.throttle[1], 0);
});

test("below stall the wing stops carrying the stall weight", () => {
  const command = { aileron: 0, elevator: 0.2, rudder: 0, flap: 0, throttle: [1, 1] };
  const flying = airplaneForces(
    command,
    { airspeed: stallSpeedOf(passport, 0) + 8, alpha: 0.12, beta: 0 },
    passport,
    intact,
  );
  const stalled = airplaneForces(
    command,
    { airspeed: stallSpeedOf(passport, 0) * 0.7, alpha: 0.12, beta: 0 },
    passport,
    intact,
  );
  assert.ok(flying.lift > DC3_STALL_WEIGHT * 0.85);
  assert.ok(stalled.lift < DC3_STALL_WEIGHT * 0.7);
});
