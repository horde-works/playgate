import assert from "node:assert/strict";
import test from "node:test";
import RAPIER from "@dimforge/rapier3d-compat";
import {
  airStateOf,
  airplaneGroundForces,
  centreOf,
  createAirplane,
  dt,
  forwardAxis,
} from "./airplane-rig.mjs";
import { dc3TaxiDrillPlan } from "../games/make-a-mess/src/game/dc3AirportRoutes.ts";
import {
  advanceDc3GroundTaxiProgress,
  dc3GroundTaxiDemand,
} from "../games/make-a-mess/src/game/dc3GroundTaxi.ts";
import {
  airplaneFlightStep,
  airplaneTurnCapability,
  INTACT_AIRPLANE_AVAILABILITY,
} from "../games/make-a-mess/src/game/airplaneDynamics.ts";
import { hullDrag } from "../games/make-a-mess/src/game/vehicleFrames.ts";
import { principalMassProperties } from "../games/make-a-mess/src/game/clusterDynamics.ts";
import {
  dc3AirplaneStandMass,
  DC3_AIRPLANE_PASSPORT,
} from "../games/make-a-mess/src/game/dc3Airplane.ts";
import { islandAirportScene } from "../games/make-a-mess/src/game/islandAirportScene.ts";
import { ISLAND_AIRPORT_DC3_AIR_VEHICLE } from "../games/make-a-mess/src/game/airVehicles.ts";

await RAPIER.init();

test("DC-3 drives evenly to the first taxi corner and stops on it", () => {
  const pieces = islandAirportScene.breakablePieces.filter(
    (piece) => piece.clusterId === ISLAND_AIRPORT_DC3_AIR_VEHICLE.clusterId,
  );
  const standMass = dc3AirplaneStandMass(pieces);
  const machine = createAirplane({
    pieces,
    vehicle: ISLAND_AIRPORT_DC3_AIR_VEHICLE,
    gearDefinitions: ISLAND_AIRPORT_DC3_AIR_VEHICLE.supportStruts,
    startPoint: standMass.centre,
    startVelocity: [0, 0, 0],
    startNose: ISLAND_AIRPORT_DC3_AIR_VEHICLE.nose,
  });
  machine.taxi = { phase: "taxi" };
  const plan = dc3TaxiDrillPlan(machine.mass.centre);
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  world.timestep = dt;
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic().setCcdEnabled(true),
  );
  const principal = principalMassProperties(machine.mass);
  body.setAdditionalMassProperties(
    principal.mass,
    { x: 0, y: 0, z: 0 },
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
  body.setTranslation(
    {
      x: machine.mass.centre[0],
      y: machine.mass.centre[1],
      z: machine.mass.centre[2],
    },
    false,
  );
  body.setRotation(
    {
      x: machine.state.orientation[0],
      y: machine.state.orientation[1],
      z: machine.state.orientation[2],
      w: machine.state.orientation[3],
    },
    false,
  );
  let supportCommand = {
    brake: 1,
    brakeSplit: 0,
    steer: 0,
    casterFree: false,
  };
  let progress = 0;
  let previous = centreOf(machine);
  let groundState = null;
  const firstCorner = plan.taxiVertices?.[0]?.point ?? null;
  let stopped = null;
  let reachedCruise = false;
  let lowestCruiseSpeed = Number.POSITIVE_INFINITY;
  let prematureStopSeconds = 0;
  let wrongThrottleFrames = 0;
  let previousApproachDemand = Number.POSITIVE_INFINITY;
  let approachDemandRose = false;
  let brakingEntry = null;
  let differentialFrames = 0;
  let movingBrakeFrames = 0;
  let maximumNormalReverse = 0;
  let previousThrottleSign = 0;
  let throttleSignChanges = 0;

  for (let index = 0; index < 60 / dt; index += 1) {
    const worldCentre = body.worldCom();
    const rotation = body.rotation();
    const velocity = body.linvel();
    const angularVelocity = body.angvel();
    machine.state = {
      position: [
        worldCentre.x - machine.mass.centre[0],
        worldCentre.y - machine.mass.centre[1],
        worldCentre.z - machine.mass.centre[2],
      ],
      orientation: [rotation.x, rotation.y, rotation.z, rotation.w],
      velocity: [velocity.x, velocity.y, velocity.z],
      angularVelocity: [angularVelocity.x, angularVelocity.y, angularVelocity.z],
    };
    const centre = centreOf(machine);
    const air = airStateOf(machine);
    const facing = forwardAxis(machine);
    const flat = Math.hypot(facing[0], facing[2]) || 1;
    const capability = airplaneTurnCapability(
      DC3_AIRPLANE_PASSPORT,
      air.groundSpeed,
      machine.mass.mass,
      true,
    );
    const demand = dc3GroundTaxiDemand({
      plan,
      progress,
      centre,
      heading: [facing[0] / flat, facing[2] / flat],
      velocity: machine.state.velocity,
      yawRate: machine.state.angularVelocity[1],
      maximumYawRate: capability.yawRate,
      pivotPointAhead:
        DC3_AIRPLANE_PASSPORT.mainAxleAheadOfCentre ?? 0,
      acceleration:
        (2 * DC3_AIRPLANE_PASSPORT.enginePower) / machine.mass.mass,
      braking: capability.braking,
      responseSeconds: machine.vehicle.flight.spoolSeconds,
      state: groundState,
    });
    groundState = demand.state;
    if (demand.state.phase === "braking" && brakingEntry === null) {
      brakingEntry = {
        speed: air.groundSpeed,
        distance: demand.distanceToTurn,
        acceleration: demand.forwardAcceleration,
      };
    }
    if (demand.state.phase === "pivoting") {
      const pivotAhead =
        DC3_AIRPLANE_PASSPORT.mainAxleAheadOfCentre ?? 0;
      stopped = {
        centre,
        pivot: [
          centre[0] + (facing[0] / flat) * pivotAhead,
          centre[1],
          centre[2] + (facing[2] / flat) * pivotAhead,
        ],
        speed: air.groundSpeed,
        corner: plan.point(demand.state.at),
      };
      break;
    }

    if (demand.forwardSpeed >= 4.49 && air.groundSpeed >= 3.8) {
      reachedCruise = true;
    }
    if (reachedCruise && demand.forwardSpeed >= 4.49) {
      lowestCruiseSpeed = Math.min(lowestCruiseSpeed, air.groundSpeed);
    }
    if (
      index * dt > 5 &&
      demand.state.phase === "tracking" &&
      (demand.distanceToTurn ?? 0) > 2 &&
      air.groundSpeed < 0.15
    ) {
      prematureStopSeconds += dt;
    }
    if (demand.forwardSpeed < 4.49) {
      if (demand.forwardSpeed > previousApproachDemand + 0.02) {
        approachDemandRose = true;
      }
      previousApproachDemand = demand.forwardSpeed;
    }

    const step = airplaneFlightStep({
      passport: DC3_AIRPLANE_PASSPORT,
      guidance: {
        forwardSpeed: demand.forwardSpeed,
        lateralSpeed: 0,
        yawRate: demand.yawRate,
        liftFraction: 0,
        finalPhase: false,
      },
      availability: INTACT_AIRPLANE_AVAILABILITY,
      mass: machine.mass.mass,
      orientation: machine.state.orientation,
      velocity: machine.state.velocity,
      angularVelocity: machine.state.angularVelocity,
      centre,
      nose: machine.vehicle.nose,
      onGround: true,
      journey: "approach",
      journeySeconds: index * dt,
      heightAboveGround: Math.max(0, centre[1] - machine.mass.centre[1]),
      taxi: "taxi",
      taxiPivot: false,
      taxiAcceleration: demand.forwardAcceleration,
    });
    const meanThrottle = (step.delivered.throttle[0] + step.delivered.throttle[1]) / 2;
    if (air.groundSpeed > 0.1 && step.delivered.brake > 1e-6) {
      movingBrakeFrames += 1;
    }
    if (demand.state.phase === "braking") {
      maximumNormalReverse = Math.max(maximumNormalReverse, -meanThrottle);
    }
    if (Math.abs(step.delivered.throttle[0] - step.delivered.throttle[1]) > 1e-6) {
      differentialFrames += 1;
    }
    const throttleSign = meanThrottle > 0.02 ? 1 : meanThrottle < -0.02 ? -1 : 0;
    if (throttleSign !== 0) {
      if (previousThrottleSign !== 0 && throttleSign !== previousThrottleSign) {
        throttleSignChanges += 1;
      }
      previousThrottleSign = throttleSign;
    }
    if (
      (demand.forwardAcceleration > 0.05 && meanThrottle <= 0) ||
      (demand.forwardAcceleration < -0.05 && meanThrottle >= 0)
    ) {
      wrongThrottleFrames += 1;
    }

    const ground = airplaneGroundForces(machine, centre, supportCommand, dt);
    supportCommand = step.delivered;
    const facingNow = forwardAxis(machine);
    const facingFlat = Math.hypot(facingNow[0], facingNow[2]) || 1;
    const model = {
      mass: machine.mass.mass,
      inertiaYaw: machine.mass.inertia[4],
      bodyCentre: machine.mass.centre,
      dragLinear: machine.mass.mass * machine.vehicle.flight.linearDamping,
      dragLateral:
        machine.mass.mass *
        machine.vehicle.flight.linearDamping *
        machine.vehicle.flight.lateralDragRatio,
      dragAngular: machine.mass.inertia[4] * machine.vehicle.flight.angularDamping,
      limits: machine.vehicle.flight.limits,
    };
    const forces = [
      { force: [0, -machine.mass.mass * 9.81, 0], point: centre },
      ...step.forces,
      ...ground.forces,
      {
        force: hullDrag(
          machine.state.velocity,
          [facingNow[0] / facingFlat, facingNow[2] / facingFlat],
          model,
        ),
        point: centre,
      },
    ];
    body.resetForces(false);
    body.resetTorques(false);
    for (const applied of forces) {
      body.addForceAtPoint(
        { x: applied.force[0], y: applied.force[1], z: applied.force[2] },
        { x: applied.point[0], y: applied.point[1], z: applied.point[2] },
        true,
      );
    }
    const angularDamping =
      machine.vehicle.flight.angularDamping * machine.mass.inertia[4];
    body.addTorque(
      {
        x: -angularDamping * machine.state.angularVelocity[0],
        y: -angularDamping * machine.state.angularVelocity[1],
        z: -angularDamping * machine.state.angularVelocity[2],
      },
      true,
    );
    world.step();

    const nextCom = body.worldCom();
    const next = [nextCom.x, nextCom.y, nextCom.z];
    const travelled = Math.hypot(next[0] - previous[0], next[2] - previous[2]);
    previous = next;
    progress = advanceDc3GroundTaxiProgress(
      plan,
      progress,
      next,
      travelled,
    );
  }

  assert.ok(firstCorner, "the first corner was not found from the known route");
  const finalCentre = centreOf(machine);
  const authoredCorner = plan.taxiVertices?.[0]?.point;
  const finalCornerDistance = authoredCorner
    ? Math.hypot(
        finalCentre[0] - authoredCorner[0],
        finalCentre[2] - authoredCorner[2],
      )
    : Number.NaN;
  assert.ok(
    stopped,
    `the aircraft did not stop before the pivot command (phase=${groundState?.phase}, speed=${airStateOf(machine).groundSpeed.toFixed(2)}, distance=${finalCornerDistance.toFixed(2)}, progress=${progress.toFixed(5)})`,
  );
  assert.ok(reachedCruise, "the aircraft never reached normal taxi speed");
  assert.ok(lowestCruiseSpeed > 3.5, `taxi speed sagged to ${lowestCruiseSpeed.toFixed(2)} m/s on the straight`);
  assert.ok(prematureStopSeconds < 0.1, `stood still for ${prematureStopSeconds.toFixed(1)} s before the corner`);
  assert.equal(wrongThrottleFrames, 0, "the speed actuator fought the requested speed");
  assert.equal(differentialFrames, 0, "the propellers used differential thrust before the corner");
  assert.equal(movingBrakeFrames, 0, "wheel brakes joined a moving service stop");
  assert.ok(
    (brakingEntry?.acceleration ?? Number.NEGATIVE_INFINITY) >= 0,
    `approach began with ${brakingEntry?.acceleration?.toFixed(2)} m/s² instead of a smooth ramp`,
  );
  assert.ok(
    maximumNormalReverse < 0.95,
    `response-derived approach spent full reverse (${maximumNormalReverse.toFixed(2)})`,
  );
  assert.equal(throttleSignChanges, 1, "the approach used more than one forward-to-reverse transition");
  assert.equal(approachDemandRose, false, "the predictive braking profile was not monotone");
  assert.ok(stopped.speed < 0.035, `pivot was released at ${stopped.speed.toFixed(2)} m/s`);
  assert.ok(
    Math.hypot(stopped.pivot[0] - stopped.corner[0], stopped.pivot[2] - stopped.corner[2]) < 0.25,
    `main axle stopped ${Math.hypot(stopped.pivot[0] - stopped.corner[0], stopped.pivot[2] - stopped.corner[2]).toFixed(2)} m from the corner (braking=${brakingEntry?.speed.toFixed(2)}m/s at ${brakingEntry?.distance?.toFixed(2)}m)`,
  );
  world.free();
});
