import assert from "node:assert/strict";
import test from "node:test";
import {
  airStateOf,
  centreOf,
  createAirplane,
  dt,
  forwardAxis,
  stepAirplane,
} from "./airplane-rig.mjs";
import { dc3TaxiDrillPlan } from "../games/make-a-mess/src/game/dc3AirportRoutes.ts";
import {
  advanceDc3GroundTaxiProgress,
  dc3GroundTaxiDemand,
} from "../games/make-a-mess/src/game/dc3GroundTaxi.ts";
import {
  airplaneGroundYawAuthority,
  airplaneTurnCapability,
} from "../games/make-a-mess/src/game/airplaneDynamics.ts";
import {
  dc3AirplaneStandMass,
  DC3_AIRPLANE_PASSPORT,
} from "../games/make-a-mess/src/game/dc3Airplane.ts";
import { islandAirportScene } from "../games/make-a-mess/src/game/islandAirportScene.ts";
import { ISLAND_AIRPORT_DC3_AIR_VEHICLE } from "../games/make-a-mess/src/game/airVehicles.ts";

function signedAngle(from, to) {
  return Math.atan2(
    from[1] * to[0] - from[0] * to[1],
    from[0] * to[0] + from[1] * to[1],
  );
}

function mainAxlePoint(centre, heading) {
  const ahead = DC3_AIRPLANE_PASSPORT.mainAxleAheadOfCentre ?? 0;
  return [
    centre[0] + heading[0] * ahead,
    centre[1],
    centre[2] + heading[1] * ahead,
  ];
}

function runTaxiDrill() {
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
  let progress = 0;
  let previous = centreOf(machine);
  let groundState = null;
  let activePivot = null;
  const pivots = [];
  let maximumCrossTrack = 0;
  let maximumBrakingYawDemand = 0;
  let reverseBrakingFrames = 0;
  let finishedAt = null;
  let maximumPivotNetThrottle = 0;

  for (let index = 0; index < 180 / dt; index += 1) {
    const centre = centreOf(machine);
    const air = airStateOf(machine);
    const facing = forwardAxis(machine);
    const flat = Math.hypot(facing[0], facing[2]) || 1;
    const heading = [facing[0] / flat, facing[2] / flat];
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
      heading,
      velocity: machine.state.velocity,
      yawRate: machine.state.angularVelocity[1],
      maximumYawRate: capability.yawRate,
      pivotYawAcceleration: airplaneGroundYawAuthority(
        DC3_AIRPLANE_PASSPORT,
        machine.mass.inertia[4],
        machine.mass.mass,
      ).angularAcceleration,
      pivotRadius: DC3_AIRPLANE_PASSPORT.wheelbase,
      pivotPointAhead:
        DC3_AIRPLANE_PASSPORT.mainAxleAheadOfCentre ?? 0,
      acceleration:
        (2 * DC3_AIRPLANE_PASSPORT.enginePower) / machine.mass.mass,
      braking: capability.braking,
      responseSeconds: machine.vehicle.flight.spoolSeconds,
      state: groundState,
    });
    groundState = demand.state;

    if (demand.state.phase === "braking") {
      maximumBrakingYawDemand = Math.max(
        maximumBrakingYawDemand,
        Math.abs(demand.yawRate),
      );
    }
    if (demand.pivoting && !activePivot) {
      activePivot = {
        start: mainAxlePoint(centre, heading),
        target: demand.state.outgoing,
        entrySpeed: air.groundSpeed,
        cornerDistance: demand.distanceToTurn,
        maximumTravel: 0,
        maximumAxleLateralSpeed: 0,
        maximumAxleRollingSpeed: 0,
        maximumYawRate: 0,
        maximumThrottle: 0,
        maximumWheelBrake: 0,
        opposedWheelRollingFrames: 0,
      };
    }
    if (activePivot) {
      const axle = mainAxlePoint(centre, heading);
      const axleArm = [axle[0] - centre[0], 0, axle[2] - centre[2]];
      const axleVelocity = [
        machine.state.velocity[0] + machine.state.angularVelocity[1] * axleArm[2],
        machine.state.velocity[2] - machine.state.angularVelocity[1] * axleArm[0],
      ];
      const lateral = [heading[1], -heading[0]];
      activePivot.maximumAxleLateralSpeed = Math.max(
        activePivot.maximumAxleLateralSpeed,
        Math.abs(axleVelocity[0] * lateral[0] + axleVelocity[1] * lateral[1]),
      );
      activePivot.maximumAxleRollingSpeed = Math.max(
        activePivot.maximumAxleRollingSpeed,
        Math.abs(axleVelocity[0] * heading[0] + axleVelocity[1] * heading[1]),
      );
      activePivot.maximumYawRate = Math.max(
        activePivot.maximumYawRate,
        Math.abs(machine.state.angularVelocity[1]),
      );
      activePivot.maximumTravel = Math.max(
        activePivot.maximumTravel,
        Math.hypot(
          axle[0] - activePivot.start[0],
          axle[2] - activePivot.start[2],
        ),
      );
      if (!demand.pivoting) {
        activePivot.end = axle;
        activePivot.exitHeadingError = Math.abs(
          signedAngle(heading, activePivot.target),
        );
        pivots.push(activePivot);
        activePivot = null;
      }
    }

    const step = stepAirplane(
      machine,
      {
        forwardSpeed: demand.forwardSpeed,
        lateralSpeed: 0,
        yawRate: demand.yawRate,
        liftFraction: 0,
        finalPhase: false,
      },
      "approach",
      index * dt,
      demand.pivoting,
      demand.forwardAcceleration,
      demand.yawAcceleration,
    );
    if (demand.pivoting) {
      maximumPivotNetThrottle = Math.max(
        maximumPivotNetThrottle,
        Math.abs(step.delivered.throttle[0] + step.delivered.throttle[1]),
      );
      activePivot.maximumThrottle = Math.max(
        activePivot.maximumThrottle,
        Math.abs(step.delivered.throttle[0]),
        Math.abs(step.delivered.throttle[1]),
      );
      const mainWheels = machine.lastGroundWheels.filter((wheel) => wheel.side !== 0);
      if (mainWheels.length === 2) {
        const rollingSpeeds = mainWheels.map(
          (wheel) =>
            wheel.slip[0] * wheel.rollAxis[0] +
            wheel.slip[1] * wheel.rollAxis[1] +
            wheel.slip[2] * wheel.rollAxis[2],
        );
        if (rollingSpeeds[0] * rollingSpeeds[1] < -1e-6) {
          activePivot.opposedWheelRollingFrames += 1;
        }
        activePivot.maximumWheelBrake = Math.max(
          activePivot.maximumWheelBrake,
          ...mainWheels.map((wheel) => wheel.brake),
        );
      }
    }
    if (
      demand.state.phase === "braking" &&
      step.delivered.throttle[0] < 0 &&
      step.delivered.throttle[1] < 0
    ) {
      reverseBrakingFrames += 1;
    }

    const next = centreOf(machine);
    const travelled = Math.hypot(
      next[0] - previous[0],
      next[2] - previous[2],
    );
    previous = next;
    progress = advanceDc3GroundTaxiProgress(
      plan,
      progress,
      next,
      travelled,
    );
    const routePoint = plan.point(progress);
    maximumCrossTrack = Math.max(
      maximumCrossTrack,
      Math.hypot(next[0] - routePoint[0], next[2] - routePoint[2]),
    );
    if (groundState.phase === "finished" && air.groundSpeed < 0.25) {
      finishedAt = index * dt;
      break;
    }
  }

  return {
    machine,
    plan,
    progress,
    pivots,
    maximumCrossTrack,
    maximumBrakingYawDemand,
    reverseBrakingFrames,
    maximumPivotNetThrottle,
    finishedAt,
    groundState,
    groundSpeed: airStateOf(machine).groundSpeed,
    finalHeading: (() => {
      const facing = forwardAxis(machine);
      const flat = Math.hypot(facing[0], facing[2]) || 1;
      return [facing[0] / flat, facing[2] / flat];
    })(),
    yawRate: machine.state.angularVelocity[1],
  };
}

test("DC-3 physically taxis the closed path with stop-then-pivot corners", () => {
  const result = runTaxiDrill();
  if (process.env.DC3_TAXI_DIAGNOSTICS === "1") {
    console.log(JSON.stringify({
      finishedAt: result.finishedAt,
      maximumCrossTrack: result.maximumCrossTrack,
      maximumPivotNetThrottle: result.maximumPivotNetThrottle,
      pivots: result.pivots.map((pivot) => ({
        entrySpeed: pivot.entrySpeed,
        maximumTravel: pivot.maximumTravel,
        maximumAxleLateralSpeed: pivot.maximumAxleLateralSpeed,
        maximumAxleRollingSpeed: pivot.maximumAxleRollingSpeed,
        maximumYawRate: pivot.maximumYawRate,
        maximumThrottle: pivot.maximumThrottle,
        maximumWheelBrake: pivot.maximumWheelBrake,
        opposedWheelRollingFrames: pivot.opposedWheelRollingFrames,
        exitHeadingError: pivot.exitHeadingError,
      })),
    }, null, 2));
  }
  assert.notEqual(
    result.finishedAt,
    null,
    `taxi drill did not finish: phase=${result.groundState?.phase} progress=${result.progress.toFixed(4)} speed=${result.groundSpeed.toFixed(2)} headingError=${((Math.abs(signedAngle(result.finalHeading, result.groundState?.outgoing ?? result.finalHeading)) * 180) / Math.PI).toFixed(1)} yaw=${result.yawRate.toFixed(3)} pivots=${result.pivots.length} travel=${result.pivots.map((pivot) => pivot.maximumTravel.toFixed(2)).join(",")}`,
  );
  assert.equal(
    result.pivots.length,
    4,
    `completed ${result.pivots.length} pivots at ${result.pivots.map((pivot) => `(${pivot.start[0].toFixed(1)},${pivot.start[2].toFixed(1)})`).join(" ")}`,
  );
  assert.equal(result.maximumBrakingYawDemand, 0, "yaw began before the stop");
  assert.ok(result.reverseBrakingFrames > 0, "reverse never executed the speed ceiling");
  assert.ok(
    result.maximumPivotNetThrottle > 1e-3,
    "pivot never supplied the derived force which holds the main axle",
  );
  const mainWheelRadius = result.machine.gear.find(
    (entry) => entry.wheel && entry.wheel.side !== 0,
  )?.wheel.radius;
  assert.ok(mainWheelRadius > 0, "main-wheel geometry is missing");
  for (const [index, pivot] of result.pivots.entries()) {
    assert.ok(
      pivot.entrySpeed < 0.13,
      `corner ${index + 1} began at ${pivot.entrySpeed.toFixed(2)} m/s`,
    );
    assert.ok(
      pivot.cornerDistance < 0.5,
      `corner ${index + 1} was missed by ${pivot.cornerDistance.toFixed(2)} m`,
    );
    assert.ok(
      pivot.exitHeadingError < (2.1 * Math.PI) / 180,
      `corner ${index + 1} released ${((pivot.exitHeadingError * 180) / Math.PI).toFixed(1)}° early`,
    );
    assert.equal(
      pivot.maximumWheelBrake,
      0,
      `corner ${index + 1} applied a main-wheel brake during pivot`,
    );
    assert.ok(
      pivot.opposedWheelRollingFrames > 0,
      `corner ${index + 1} never let the main wheels roll in opposite directions`,
    );
    assert.ok(
      pivot.maximumAxleRollingSpeed <= pivot.entrySpeed + 1e-3,
      `corner ${index + 1} accelerated the axle from ${pivot.entrySpeed.toFixed(3)} to ${pivot.maximumAxleRollingSpeed.toFixed(3)} m/s`,
    );
    assert.ok(
      pivot.maximumTravel < mainWheelRadius,
      `corner ${index + 1} moved the axle ${pivot.maximumTravel.toFixed(2)} m (wheel radius ${mainWheelRadius.toFixed(2)} m)`,
    );
  }
  assert.ok(
    result.maximumCrossTrack <
      (DC3_AIRPLANE_PASSPORT.mainWheelHalfTrack ?? Number.POSITIVE_INFINITY),
    `left path by ${result.maximumCrossTrack.toFixed(2)} m`,
  );
  const endpoint = result.plan.point(1);
  const centre = centreOf(result.machine);
  assert.ok(
    Math.hypot(centre[0] - endpoint[0], centre[2] - endpoint[2]) < 0.8,
    "did not return to the start point",
  );
});
