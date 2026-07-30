import assert from "node:assert/strict";
import test from "node:test";

import {
  massProperties,
  rotateVector,
  stepBody,
} from "../games/make-a-mess/src/game/clusterDynamics.ts";
import { structuralMaterialProfiles } from "../games/make-a-mess/src/game/destructionScene.ts";
import { airVehicles } from "../games/make-a-mess/src/game/airVehicles.ts";
import {
  vehicleAttitude,
  vehicleFrames,
} from "../games/make-a-mess/src/game/vehicleFrames.ts";
import {
  advanceVehicleTrimRail,
  createVehicleTrimRailState,
  isVehicleTrimChannel,
  trimCommandChannel,
  vehicleTrimAuthority,
  vehicleTrimAuthorityExhausted,
  vehicleTrimCarPosition,
  vehicleTrimDemand,
} from "../games/make-a-mess/src/game/vehicleTrimAutomation.ts";
import {
  compileCommandActuators,
  executeCommandActuators,
} from "../games/make-a-mess/src/game/vehicleActuation.ts";
import {
  advanceVehicleFailureWatchdog,
  createVehicleFailureWatchdog,
  DEFAULT_VEHICLE_FAILURE_ENVELOPE,
} from "../games/make-a-mess/src/game/vehicleFailure.ts";
import { vehicleGuidanceEnvelope } from "../games/make-a-mess/src/game/vehicleGuidanceEnvelope.ts";
import { grandTerminalScene } from "../games/make-a-mess/src/game/grandTerminalScene.ts";
import { townScene } from "../games/make-a-mess/src/game/townScene.ts";
import { vikingVillageScene } from "../games/make-a-mess/src/game/vikingVillageScene.ts";
import { basaltStrongholdScene } from "../games/make-a-mess/src/game/basaltStrongholdScene.ts";

const GRAVITY = 9.81;
const densityOf = (material) => structuralMaterialProfiles[material].density;
const allPieces = [
  ...grandTerminalScene.breakablePieces,
  ...townScene.breakablePieces,
  ...vikingVillageScene.breakablePieces,
  ...basaltStrongholdScene.breakablePieces,
];
const shipPieces = (vehicle) =>
  allPieces.filter((piece) => piece.clusterId === vehicle.clusterId);
const degrees = (radians) => (radians * 180) / Math.PI;

function guidanceFor(vehicle) {
  return vehicleGuidanceEnvelope(
    DEFAULT_VEHICLE_FAILURE_ENVELOPE,
    vehicle.flight.approach,
    vehicle.flight.limits,
    vehicle.flight.guidance,
  );
}

/** Lateral offset of a piece from the intact centre, in metres to starboard. */
function starboardOffset(vehicle, intactCentre, piece) {
  const length = Math.hypot(vehicle.nose[0], vehicle.nose[2]) || 1;
  const forward = [vehicle.nose[0] / length, vehicle.nose[2] / length];
  const starboard = [-forward[1], forward[0]];
  return (
    (piece.position[0] - intactCentre[0]) * starboard[0] +
    (piece.position[2] - intactCentre[2]) * starboard[1]
  );
}

/**
 * The pendulum exactly as the runtime builds it: gravity in the live centre of
 * mass, buoyancy in the hull-fixed trim centre, and a mass model rebuilt from
 * wherever the trim cars are actually standing. Nothing here applies a torque
 * of its own — the moment exists only because those two points differ.
 */
function simulatePendulum(vehicle, { lost = new Set(), trim = true, seconds = 150 }) {
  const intact = massProperties(shipPieces(vehicle), densityOf);
  const trimCentre = [
    intact.centre[0],
    vehicle.liftCentre[1],
    intact.centre[2],
  ];
  const survivors = shipPieces(vehicle).filter((piece) => !lost.has(piece.id));
  const rails = vehicle.trimRails ?? [];
  // Actuator groups are compiled once from the authored machine, exactly as
  // the frame does. Only membership changes when something is shot away.
  const bindings = compileCommandActuators(shipPieces(vehicle));
  const attached = new Set(survivors.map((piece) => piece.id));
  const executions = executeCommandActuators(
    bindings,
    attached,
    Object.fromEntries(rails.map((rail) => [rail.commandChannel, 1])),
  );
  const available = rails.map((rail) => {
    const matching = executions.filter(
      (execution) => execution.commandChannel === rail.commandChannel,
    );
    return (
      matching.length > 0 &&
      matching.every((execution) => execution.attachedFraction > 0)
    );
  });

  let railStates = rails.map(() => createVehicleTrimRailState());
  const properties = () =>
    massProperties(
      survivors.map((piece) => {
        const index = rails.findIndex((rail) => rail.carPieceId === piece.id);
        return index < 0
          ? piece
          : { ...piece, position: vehicleTrimCarPosition(rails[index], railStates[index]) };
      }),
      densityOf,
    );

  let mass = properties();
  let body = {
    position: [...mass.centre],
    orientation: [0, 0, 0, 1],
    velocity: [0, 0, 0],
    angularVelocity: [0, 0, 0],
  };
  const damping = {
    linear: 0,
    angular: vehicle.flight.angularDamping * mass.inertia[4],
  };
  const dt = 1 / 60;
  let previous = vehicleAttitude(body.orientation, vehicle.nose);
  let peakTilt = 0;
  for (let step = 0; step < seconds / dt; step += 1) {
    const attitude = vehicleAttitude(body.orientation, vehicle.nose);
    if (trim) {
      railStates = rails.map((rail, index) =>
        advanceVehicleTrimRail(rail, railStates[index], {
          deltaSeconds: dt,
          pitch: attitude.pitch,
          roll: attitude.roll,
          pitchRate: (attitude.pitch - previous.pitch) / dt,
          rollRate: (attitude.roll - previous.roll) / dt,
          available: available[index],
          engaged: true,
        }),
      );
    }
    previous = attitude;

    // The hull is what stays put when the mass model changes; the live centre
    // of mass moves inside it. This mirrors rebaseBodyMassProperties.
    const nextMass = properties();
    const shift = rotateVector(body.orientation, [
      nextMass.centre[0] - mass.centre[0],
      nextMass.centre[1] - mass.centre[1],
      nextMass.centre[2] - mass.centre[2],
    ]);
    body = {
      ...body,
      position: [
        body.position[0] + shift[0],
        body.position[1] + shift[1],
        body.position[2] + shift[2],
      ],
    };
    mass = nextMass;

    const lever = rotateVector(body.orientation, [
      trimCentre[0] - mass.centre[0],
      trimCentre[1] - mass.centre[1],
      trimCentre[2] - mass.centre[2],
    ]);
    const forces = [
      { force: [0, -mass.mass * GRAVITY, 0], point: body.position },
      {
        force: [0, mass.mass * GRAVITY, 0],
        point: [
          body.position[0] + lever[0],
          body.position[1] + lever[1],
          body.position[2] + lever[2],
        ],
      },
    ];
    body = stepBody(body, mass, forces, damping, dt);
    peakTilt = Math.max(peakTilt, Math.hypot(attitude.pitch, attitude.roll));
  }
  const attitude = vehicleAttitude(body.orientation, vehicle.nose);
  return {
    tilt: Math.hypot(attitude.pitch, attitude.roll),
    peakTilt,
    attitude,
    railStates,
    available,
    rails,
    mass,
    tiltRate: Math.hypot(body.angularVelocity[0], body.angularVelocity[2]),
  };
}

/** Pieces of the outboard propulsor on one side: the ordinary combat loss. */
function oneSidedPropulsor(vehicle) {
  const intact = massProperties(shipPieces(vehicle), densityOf);
  return new Set(
    shipPieces(vehicle)
      .filter(
        (piece) =>
          /engine|oar|propeller|nacelle|furnace/i.test(piece.id) &&
          starboardOffset(vehicle, intact.centre, piece) > 0.2,
      )
      .map((piece) => piece.id),
  );
}

test("the trim law's signs are physics, not preference", () => {
  // Nose up means the live mass hangs aft, so the car must travel forward,
  // the positive direction of a pitch rail.
  assert.equal(
    vehicleTrimDemand("pitch", {
      pitch: 0.1,
      roll: 0,
      pitchRate: 0,
      rollRate: 0,
    }) > 0,
    true,
  );
  // Starboard down means the mass hangs to starboard, so the car must travel
  // to port, the negative direction of a roll rail.
  assert.equal(
    vehicleTrimDemand("roll", {
      pitch: 0,
      roll: 0.1,
      pitchRate: 0,
      rollRate: 0,
    }) < 0,
    true,
  );
  // A level hull holds its car where it is; it does not recentre and undo the
  // imbalance it has just trimmed out.
  assert.equal(
    vehicleTrimDemand("roll", {
      pitch: 0,
      roll: 0.004,
      pitchRate: 0,
      rollRate: 0.002,
    }),
    0,
  );
});

test("a trim car is inertial: it cannot answer an upset instantly", () => {
  const [rail] = vehicleFrames.find((frame) => frame.id === "sky-train")
    .trimRails;
  let state = createVehicleTrimRailState();
  const observation = {
    deltaSeconds: 1 / 60,
    pitch: 0.4,
    roll: 0,
    pitchRate: 0,
    rollRate: 0,
    available: true,
    engaged: true,
  };
  state = advanceVehicleTrimRail(rail, state, observation);
  assert.equal(state.position > 0, true);
  assert.equal(
    state.position <= rail.speed / 60 + 1e-9,
    true,
    "the car outran its own drive in a single step",
  );

  let seconds = 0;
  while (state.position < rail.travel - 1e-6 && seconds < 120) {
    state = advanceVehicleTrimRail(rail, state, observation);
    seconds += 1 / 60;
  }
  assert.equal(state.atStop, true);
  const expected = rail.travel / rail.speed;
  assert.equal(
    Math.abs(seconds - expected) < 0.3,
    true,
    `full travel took ${seconds.toFixed(1)} s, drive says ${expected.toFixed(1)} s`,
  );

  // Back at the berth the car crawls home so the next flight starts from the
  // authored balance rather than from yesterday's damage.
  let parked = state;
  for (let step = 0; step < 60 * 120; step += 1) {
    parked = advanceVehicleTrimRail(rail, parked, {
      ...observation,
      engaged: false,
    });
  }
  assert.equal(parked.position, 0);
});

test("every carrier carries real trim machinery inside its envelope", () => {
  for (const vehicle of airVehicles) {
    const pieces = shipPieces(vehicle);
    const rails = vehicle.trimRails ?? [];
    assert.equal(rails.length, 2, `${vehicle.id} has no trim rails`);
    const intact = massProperties(pieces, densityOf);
    for (const rail of rails) {
      const car = pieces.find((piece) => piece.id === rail.carPieceId);
      assert.ok(car, `${vehicle.id}: ${rail.carPieceId} is not a real piece`);
      // The passport and the scene must agree on where zero is.
      assert.deepEqual(
        car.position.map((value) => Number(value.toFixed(6))),
        rail.zero.map((value) => Number(value.toFixed(6))),
      );
      assert.equal(isVehicleTrimChannel(rail.commandChannel), true);
      assert.equal(rail.commandChannel, trimCommandChannel(rail.axis));
      assert.equal(rail.travel > 0.5, true);
      // A real trim car is slow. Anything faster is an animation, not a mass.
      assert.equal(rail.speed > 0 && rail.speed < 0.6, true);
      const carMass =
        (car.volume ?? car.size[0] * car.size[1] * car.size[2]) *
        densityOf(car.material);
      // Authority differs by an order of magnitude across the fleet — the
      // long train carries 25 kg on a 2.5 m rail, the small airship 3 kg on
      // 1.5 m — but every machine must have some.
      assert.equal(
        vehicleTrimAuthority(rail, carMass, intact.mass) > 0.02,
        true,
        `${vehicle.id}:${rail.axis} carries no usable authority`,
      );
    }
    // Cars at zero: the intact machine is balanced by construction, not by
    // standing trim hiding an authored imbalance.
    const offset = Math.hypot(
      intact.centre[0] - vehicle.liftCentre[0],
      intact.centre[2] - vehicle.liftCentre[2],
    );
    assert.equal(
      offset < 0.1,
      true,
      `${vehicle.id}: intact balance is ${offset.toFixed(3)} m off the lift centre`,
    );
    assert.equal(
      vehicle.liftCentre[1] - intact.centre[1] > 1,
      true,
      `${vehicle.id}: trim gear must not eat the pendulum lever`,
    );
  }
});

test("a lost propulsor is physically trimmed out by moving real ballast", () => {
  const report = [];
  for (const vehicle of airVehicles) {
    const lost = oneSidedPropulsor(vehicle);
    assert.equal(lost.size > 0, true, `${vehicle.id} has no outboard propulsor`);
    const guidance = guidanceFor(vehicle);
    const withTrim = simulatePendulum(vehicle, { lost, trim: true });
    const without = simulatePendulum(vehicle, { lost, trim: false });
    const rollIndex = withTrim.rails.findIndex((rail) => rail.axis === "roll");
    report.push(
      `${vehicle.id}: ${degrees(without.tilt).toFixed(1)}° → ${degrees(withTrim.tilt).toFixed(1)}°`,
    );

    assert.equal(
      withTrim.tilt < without.tilt - 1e-4,
      true,
      `${vehicle.id}: trim did not improve a ${degrees(without.tilt).toFixed(2)}° list (${degrees(withTrim.tilt).toFixed(2)}°)`,
    );
    // The improvement came from a weight that actually travelled, and it
    // travelled against the list rather than with it.
    assert.equal(
      Math.abs(withTrim.railStates[rollIndex].position) > 0.05,
      true,
      `${vehicle.id}: the roll car never moved`,
    );
    assert.equal(
      Math.sign(withTrim.railStates[rollIndex].position),
      -Math.sign(without.attitude.roll),
      `${vehicle.id}: the car travelled toward the heavy side`,
    );
    // Whatever it manages, the machine keeps flying: the residual list stays
    // inside the corridor its own guidance envelope allows.
    assert.equal(
      withTrim.tilt < guidance.flyableTilt,
      true,
      `${vehicle.id}: ${degrees(withTrim.tilt).toFixed(1)}° is outside its own corridor`,
    );
  }
  assert.equal(report.length, 4, report.join("; "));
});

test("trim authority is bounded by geometry, and one carrier runs out", () => {
  // Three of the four hulls answer a lost propulsor completely: the residual
  // list is the automation's own deadband, not a lack of ballast.
  for (const id of ["sky-train", "sky-longship", "basalt-sky-ram"]) {
    const vehicle = airVehicles.find((entry) => entry.id === id);
    const result = simulatePendulum(vehicle, {
      lost: oneSidedPropulsor(vehicle),
      trim: true,
    });
    const rollIndex = result.rails.findIndex((rail) => rail.axis === "roll");
    assert.equal(
      degrees(result.tilt) < 1.2,
      true,
      `${id} settled at ${degrees(result.tilt).toFixed(1)}°`,
    );
    assert.equal(
      result.railStates[rollIndex].atStop,
      false,
      `${id} should still have ballast in reserve`,
    );
  }

  // The town airship cannot. Its engines hang on 4.3 m outriggers while its
  // hull is 2.35 m across, so no weight that fits inside can answer that
  // moment. It ends hard against the stop and flies home listing — which is
  // the honest result, not a number to be tuned away.
  const airship = airVehicles.find((entry) => entry.id === "town-airship");
  const listing = simulatePendulum(airship, {
    lost: oneSidedPropulsor(airship),
    trim: true,
  });
  const rollIndex = listing.rails.findIndex((rail) => rail.axis === "roll");
  assert.equal(listing.railStates[rollIndex].atStop, true);
  assert.equal(
    degrees(listing.tilt) > 5,
    true,
    `the airship should still be visibly listing, not ${degrees(listing.tilt).toFixed(1)}°`,
  );
  assert.equal(listing.tilt < guidanceFor(airship).flyableTilt, true);
});

test("losing the weight is losing the control channel", () => {
  const vehicle = airVehicles.find(({ id }) => id === "town-airship");
  const rails = vehicle.trimRails;
  const rollRail = rails.find((rail) => rail.axis === "roll");
  const lost = oneSidedPropulsor(vehicle);
  const withCar = simulatePendulum(vehicle, { lost, trim: true });
  const carGone = simulatePendulum(vehicle, {
    lost: new Set([...lost, rollRail.carPieceId]),
    trim: true,
  });
  const rollIndex = rails.indexOf(rollRail);
  assert.equal(withCar.available[rollIndex], true);
  assert.equal(carGone.available[rollIndex], false);
  assert.equal(carGone.railStates[rollIndex].position, 0);
  assert.equal(
    carGone.tilt > withCar.tilt,
    true,
    "a destroyed trim car must leave the hull hanging",
  );

  // The drive is the required core: the car itself survives but goes nowhere.
  const driveGone = simulatePendulum(vehicle, {
    lost: new Set([...lost, rollRail.carPieceId.replace(":car:", ":rail:")]),
    trim: true,
  });
  assert.equal(driveGone.available[rollIndex], false);
  assert.equal(driveGone.railStates[rollIndex].position, 0);
});

test("exhausted trim is a declared failure, not an eternal list", () => {
  const vehicle = airVehicles.find(({ id }) => id === "town-airship");
  const guidance = guidanceFor(vehicle);
  const intact = massProperties(shipPieces(vehicle), densityOf);
  const rollRail = vehicle.trimRails.find((rail) => rail.axis === "roll");
  const rollIndex = vehicle.trimRails.indexOf(rollRail);

  // One propulsor gone: the car ends hard against its stop and the hull keeps
  // a permanent list, but that list is still inside the corridor it must fly
  // in. Nothing is declared — the machine is doing its job at the stop.
  const listing = simulatePendulum(vehicle, {
    lost: oneSidedPropulsor(vehicle),
    trim: true,
  });
  assert.equal(listing.railStates[rollIndex].atStop, true);
  assert.equal(
    vehicleTrimAuthorityExhausted({
      tilt: listing.tilt,
      flyableTilt: guidance.flyableTilt,
      tiltRate: listing.tiltRate,
      authorityRemaining: false,
    }),
    false,
    `a ${degrees(listing.tilt).toFixed(1)}° list is still inside the corridor`,
  );

  // The whole starboard side gone: the weight is at the same stop and it is
  // no longer enough. The hull has stopped moving and hangs outside its
  // corridor — everything the machine physically has is already deployed.
  const beyond = simulatePendulum(vehicle, {
    lost: new Set(
      shipPieces(vehicle)
        .filter((piece) => starboardOffset(vehicle, intact.centre, piece) > 0.5)
        .map((piece) => piece.id),
    ),
    trim: true,
  });
  assert.equal(beyond.railStates[rollIndex].atStop, true);
  assert.equal(
    beyond.tilt > guidance.flyableTilt,
    true,
    `a ${degrees(beyond.tilt).toFixed(1)}° list must be outside the ${degrees(guidance.flyableTilt).toFixed(1)}° corridor`,
  );
  const exhausted = vehicleTrimAuthorityExhausted({
    tilt: beyond.tilt,
    flyableTilt: guidance.flyableTilt,
    tiltRate: beyond.tiltRate,
    authorityRemaining: beyond.railStates.some(
      (railState, index) => beyond.available[index] && !railState.atStop,
    ),
  });
  assert.equal(exhausted, true);

  // The watchdog turns that measured fact into an ordinary failure.
  let watchdog = createVehicleFailureWatchdog(0.4);
  let failure = null;
  let seconds = 0;
  while (failure === null && seconds < 60) {
    const step = advanceVehicleFailureWatchdog(watchdog, {
      deltaSeconds: 0.1,
      relativeAltitude: 30,
      pitch: beyond.attitude.pitch,
      roll: beyond.attitude.roll,
      headingError: 0,
      yawRateError: 0,
      crossTrackError: 0.5,
      altitudeError: 0.4,
      progress: 0.4,
      requiredControlAvailable: true,
      requestedControlEffort: 0.1,
      deliveredControlFraction: 1,
      goArounds: 0,
      corrections: 0,
      turning: false,
      inFinalManeuver: false,
      inDockingCapture: false,
      dockingComplete: false,
      // Even while a correction is nursing the hull, a balance the machine no
      // longer has cannot be waited out.
      recoveringDisturbance: true,
      trimAuthorityExhausted: true,
    });
    watchdog = step.state;
    failure = step.failure;
    seconds += 0.1;
  }
  assert.equal(failure, "trimExhausted");
  assert.equal(
    seconds >= DEFAULT_VEHICLE_FAILURE_ENVELOPE.trimGraceSeconds,
    true,
  );
});
