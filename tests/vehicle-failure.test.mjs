import assert from "node:assert/strict";
import test from "node:test";
import { grandTerminalScene } from "../games/make-a-mess/src/game/grandTerminalScene.ts";
import {
  compileCommandActuators,
  deliveredCommandValue,
  executeCommandActuators,
} from "../games/make-a-mess/src/game/vehicleActuation.ts";
import {
  propulsionHealth,
  updatePropulsionFeedback,
} from "../games/make-a-mess/src/game/vehiclePropulsionAutomation.ts";
import { propulsionFlightClearance } from "../games/make-a-mess/src/game/vehicleFlightSupervisor.ts";
import {
  allocateAutopilotEngineCommands,
  balancedEngineYawAuthority,
} from "../games/make-a-mess/src/game/vehicleFrames.ts";
import { townScene } from "../games/make-a-mess/src/game/townScene.ts";
import {
  advanceVehicleFailureWatchdog,
  advanceVehicleLandingStability,
  advanceVehicleRecoveryLifecycle,
  createVehicleFailureWatchdog,
  createVehicleLandingStability,
  createVehicleRecoveryLifecycle,
  DEFAULT_VEHICLE_FAILURE_ENVELOPE,
  deliveredLiftControlFraction,
  normalizedLiftTrimRequest,
  recoveryKeepsFlightTask,
  rebaseVehicleFailureWatchdog,
  VEHICLE_RECOVERY_HEALTHY_SECONDS,
  VEHICLE_LANDING_STABLE_SECONDS,
  VEHICLE_REBUILD_DELAY_SECONDS,
  vehicleDisturbanceRecoveryFeasible,
  vehicleFailureDisposition,
} from "../games/make-a-mess/src/game/vehicleFailure.ts";

test("four healthy seconds clear FAIL and preserve the current flight task", () => {
  let lifecycle = createVehicleRecoveryLifecycle(
    "controlMismatch",
    "escapeRoute",
  );
  let result;
  for (let elapsed = 0; elapsed < VEHICLE_RECOVERY_HEALTHY_SECONDS; elapsed += 1) {
    result = advanceVehicleRecoveryLifecycle(lifecycle, {
      deltaSeconds: 1,
      escapeComplete: false,
      belowFog: false,
      landingComplete: false,
      rebuildComplete: false,
      arrivalComplete: false,
      flyingWell: true,
    });
    lifecycle = result.lifecycle;
  }
  assert.equal(result.recovered, true);
  assert.equal(result.lifecycle, null);
  assert.equal(recoveryKeepsFlightTask("escape"), true);
  assert.equal(recoveryKeepsFlightTask("righting"), true);
  assert.equal(recoveryKeepsFlightTask("arrival"), false);
});

const CLUSTER = "terminal:sky-train";
const pieces = grandTerminalScene.breakablePieces.filter(
  (piece) => piece.clusterId === CLUSTER,
);

function observation(overrides = {}) {
  return {
    deltaSeconds: 0.1,
    relativeAltitude: 10,
    pitch: 0,
    roll: 0,
    headingError: 0,
    yawRateError: 0,
    crossTrackError: 0,
    altitudeError: 0,
    progress: 0.4,
    requiredControlAvailable: true,
    requestedControlEffort: 0.8,
    deliveredControlFraction: 1,
    goArounds: 0,
    turning: false,
    inFinalManeuver: false,
    inDockingCapture: false,
    dockingComplete: false,
    ...overrides,
  };
}

test("manual flight never feeds synthetic progress into route-stall timers", () => {
  for (const turning of [false, true]) {
    let watchdog = createVehicleFailureWatchdog(0.5);
    for (let frame = 0; frame < 60 * 60; frame += 1) {
      const result = advanceVehicleFailureWatchdog(
        watchdog,
        observation({
          deltaSeconds: 1 / 60,
          progress: 0.5,
          routeProgressTracked: false,
          requestedControlEffort: 1,
          turning,
        }),
      );
      assert.equal(result.failure, null);
      watchdog = result.state;
    }
    assert.equal(watchdog.stalledSeconds, 0);
    assert.equal(watchdog.maneuverSeconds, 0);
  }
});

test("watchdog never compares a combat response with the authored route command", () => {
  let watchdog = createVehicleFailureWatchdog(0.4);
  for (let frame = 0; frame < 10 * 60; frame += 1) {
    const result = advanceVehicleFailureWatchdog(
      watchdog,
      observation({
        deltaSeconds: 1 / 60,
        progress: 0.4,
        routeProgressTracked: false,
        controlResponseTracked: false,
        // This is the exact impossible comparison from the runtime: the route
        // asks for full effort while authority reports the preceding combat
        // posture as zero.
        requestedControlEffort: 1,
        deliveredControlFraction: 0,
        requestedLiftEffort: 1,
        deliveredLiftFraction: 0,
        crossTrackError: 100,
      }),
    );
    assert.equal(result.failure, null);
    watchdog = result.state;
  }
  assert.equal(watchdog.controlMismatchSeconds, 0);
  assert.equal(watchdog.routeSeconds, 0);
  assert.equal(watchdog.stalledSeconds, 0);
});

test("manual lift guidance is normalized before lift-delivery supervision", () => {
  assert.equal(normalizedLiftTrimRequest(0.28, 0.28), 1);
  assert.equal(normalizedLiftTrimRequest(0.14, 0.28), 0.5);
  assert.equal(normalizedLiftTrimRequest(-0.28, 0.28), -1);
  assert.ok(
    Math.abs(
      deliveredLiftControlFraction(
        normalizedLiftTrimRequest(0.28, 0.28),
        0.28,
        1.08,
      ) -
        0.08 / 0.28,
    ) < 1e-12,
  );
});

test("only actuators still carried by the compound body execute commands", () => {
  const bindings = compileCommandActuators(pieces);
  // Two propellers and the two trim rails: every one of them a real part.
  assert.equal(bindings.length, 4);
  const intactMembers = new Set(pieces.map((piece) => piece.id));
  const intact = executeCommandActuators(bindings, intactMembers, {
    "throttle:0": 0.8,
    "throttle:1": -0.4,
  });
  assert.equal(deliveredCommandValue(intact, "throttle:0", 0.8), 0.8);
  assert.equal(deliveredCommandValue(intact, "throttle:1", -0.4), -0.4);

  const detachedBlade = pieces.find(
    (piece) =>
      piece.actuator?.commandChannel === "throttle:0" &&
      piece.id.includes(":blade:"),
  );
  assert.ok(detachedBlade?.id.includes(":blade:"));
  const remainingMembers = new Set(
    pieces
      .filter((piece) => piece.id !== detachedBlade.id)
      .map((piece) => piece.id),
  );
  const damaged = executeCommandActuators(bindings, remainingMembers, {
    "throttle:0": 0.8,
    "throttle:1": -0.4,
  });
  assert.equal(deliveredCommandValue(damaged, "throttle:0", 0.8), 0.4);
  assert.equal(deliveredCommandValue(damaged, "throttle:1", -0.4), -0.4);

  // Actuator order now includes the trim rails; ask for a propulsion group
  // by channel instead of by position.
  const leftCore = bindings
    .find((binding) => binding.commandChannel === "throttle:0")
    .members.find((member) => member.required);
  assert.ok(leftCore?.pieceId.includes(":body:"));
  const withoutCore = new Set(
    [...intactMembers].filter((pieceId) => pieceId !== leftCore.pieceId),
  );
  const coreFailure = executeCommandActuators(bindings, withoutCore, {
    "throttle:0": 0.8,
    "throttle:1": -0.4,
  });
  assert.equal(deliveredCommandValue(coreFailure, "throttle:0", 0.8), 0);
  assert.equal(deliveredCommandValue(coreFailure, "throttle:1", -0.4), -0.4);

  const withoutLeftPropeller = new Set(
    pieces
      .filter((piece) => piece.actuator?.commandChannel !== "throttle:0")
      .map((piece) => piece.id),
  );
  const failed = executeCommandActuators(bindings, withoutLeftPropeller, {
    "throttle:0": 0.8,
    "throttle:1": -0.4,
  });
  assert.equal(deliveredCommandValue(failed, "throttle:0", 0.8), 0);
});

test("both airships share required engine cores, blade sensing, compensation, and clearance", () => {
  const carriers = [
    pieces,
    townScene.breakablePieces.filter(
      (piece) => piece.clusterId === "sky-mooring:airship",
    ),
  ];
  for (const carrier of carriers) {
    const bindings = compileCommandActuators(carrier).filter((binding) =>
      binding.commandChannel.startsWith("throttle:"),
    );
    assert.equal(bindings.length, 2);
    assert.equal(
      bindings.every((binding) => binding.members.length === 3),
      true,
    );
    assert.equal(
      bindings.every(
        (binding) =>
          binding.members.filter((member) => !member.required).length === 2 &&
          binding.members
            .filter((member) => !member.required)
            .every((member) => member.pieceId.includes(":blade:")),
      ),
      true,
    );
    assert.equal(
      bindings.every(
        (binding) =>
          binding.members.filter((member) => member.required).length === 1,
      ),
      true,
    );

    const intact = new Set(carrier.map((piece) => piece.id));
    const nominal = propulsionHealth(bindings, intact, 2);
    assert.deepEqual(nominal.fractions, [1, 1]);
    assert.equal(nominal.mode, "nominal");
    assert.deepEqual(propulsionFlightClearance(nominal), {
      speedFactor: 1,
      controlAuthorityFactor: 1,
      uncrewedAllowed: true,
      passengerAllowed: true,
    });

    const weakBlade = bindings[0].members.find(
      (member) => !member.required,
    )?.pieceId;
    assert.ok(weakBlade);
    const degradedMembers = new Set(
      [...intact].filter((pieceId) => pieceId !== weakBlade),
    );
    const degraded = propulsionHealth(bindings, degradedMembers, 2);
    assert.deepEqual(degraded.fractions, [0.5, 1]);
    assert.equal(degraded.mode, "degraded");
    assert.deepEqual(propulsionFlightClearance(degraded), {
      speedFactor: 0.5,
      controlAuthorityFactor: 0.5,
      uncrewedAllowed: true,
      passengerAllowed: false,
    });

    // The first command is honest: the autopilot does not know about the
    // missing blade until the actuator layer returns the short delivery.
    const firstDrive = allocateAutopilotEngineCommands(0.8, 0, [-1, 1], [1, 1]);
    assert.deepEqual(firstDrive, [0.8, 0.8]);
    const firstExecution = executeCommandActuators(bindings, degradedMembers, {
      "throttle:0": firstDrive[0],
      "throttle:1": firstDrive[1],
    });
    assert.deepEqual(
      [0, 1].map((index) =>
        deliveredCommandValue(
          firstExecution,
          `throttle:${index}`,
          firstDrive[index],
        ),
      ),
      [0.4, 0.8],
    );
    const feedback = updatePropulsionFeedback([1, 1], firstExecution, 2);
    assert.deepEqual(feedback, [0.5, 1]);

    // On the next control step the autopilot itself asks the damaged shaft
    // for more and unloads the healthy one to cancel the unwanted yaw.
    const drive = allocateAutopilotEngineCommands(0.8, 0, [-1, 1], feedback);
    assert.deepEqual(drive, [1, 0.5]);
    const execution = executeCommandActuators(bindings, degradedMembers, {
      "throttle:0": drive[0],
      "throttle:1": drive[1],
    });
    assert.deepEqual(
      [0, 1].map((index) =>
        deliveredCommandValue(execution, `throttle:${index}`, drive[index]),
      ),
      [0.5, 0.5],
    );
    const reverseDrive = allocateAutopilotEngineCommands(
      -0.8,
      0,
      [-1, 1],
      feedback,
    );
    assert.deepEqual(reverseDrive, [-1, -0.5]);
    const reverseExecution = executeCommandActuators(
      bindings,
      degradedMembers,
      {
        "throttle:0": reverseDrive[0],
        "throttle:1": reverseDrive[1],
      },
    );
    assert.deepEqual(
      [0, 1].map((index) =>
        deliveredCommandValue(
          reverseExecution,
          `throttle:${index}`,
          reverseDrive[index],
        ),
      ),
      [-0.5, -0.5],
    );

    const failedMembers = new Set(
      [...intact].filter(
        (pieceId) =>
          !bindings[0].members.some((member) => member.pieceId === pieceId),
      ),
    );
    const inoperative = propulsionHealth(bindings, failedMembers, 2);
    assert.deepEqual(inoperative.fractions, [0, 1]);
    assert.equal(inoperative.mode, "inoperative");
    assert.deepEqual(propulsionFlightClearance(inoperative), {
      speedFactor: 0,
      controlAuthorityFactor: 0,
      uncrewedAllowed: false,
      passengerAllowed: false,
    });

    const failedCore = bindings[0].members.find(
      (member) => member.required,
    )?.pieceId;
    assert.ok(failedCore);
    const corelessMembers = new Set(
      [...intact].filter((pieceId) => pieceId !== failedCore),
    );
    const coreless = propulsionHealth(bindings, corelessMembers, 2);
    assert.deepEqual(coreless.fractions, [0, 1]);
    assert.equal(coreless.mode, "inoperative");
  }
});

test("autopilot allocation supports the authored arms of any engine count", () => {
  const model = {
    mass: 100,
    inertiaYaw: 200,
    bodyCentre: [0, 0, 0],
    dragLinear: 20,
    dragLateral: 140,
    dragAngular: 100,
    limits: {
      enginePower: 300,
      enginePoints: [
        [0, 0, -4],
        [0, 0, 4],
      ],
      maxRudderForce: 60,
      rudderReferenceSpeed: 7,
      rudderPoint: [5, 0, 0],
      liftTrimRange: 0.1,
    },
  };
  const yawArms = [-2, 0, 3];
  const availability = [0.5, 1, 0.75];
  const command = allocateAutopilotEngineCommands(
    0.4,
    0.2,
    yawArms,
    availability,
  );
  const delivered = command.map((value, index) => value * availability[index]);
  const moment = delivered.reduce(
    (sum, value, index) => sum + value * yawArms[index],
    0,
  );
  assert.equal(model.limits.enginePower, 300);
  assert.equal(command.length, 3);
  assert.ok(command.every((value) => Math.abs(value) <= 1));
  assert.ok(Math.abs(moment - 0.2) < 1e-9);
  assert.ok(
    Math.abs(delivered.reduce((sum, value) => sum + value, 0) - 1.2) < 1e-9,
  );
  assert.equal(balancedEngineYawAuthority([-1, 1], [0.5, 1]), 1);
});

test("a short control interruption recovers but a detached actuator trips the watchdog", () => {
  let watchdog = createVehicleFailureWatchdog(0.4);
  for (let index = 0; index < 10; index += 1) {
    const result = advanceVehicleFailureWatchdog(
      watchdog,
      observation({
        deliveredControlFraction: 0,
        progress: 0.4 + index * 0.001,
      }),
    );
    watchdog = result.state;
    assert.equal(result.failure, null);
  }
  watchdog = advanceVehicleFailureWatchdog(
    watchdog,
    observation({ deliveredControlFraction: 1, progress: 0.42 }),
  ).state;
  assert.equal(watchdog.controlMismatchSeconds, 0);

  let failure = null;
  for (let index = 0; index < 21; index += 1) {
    const result = advanceVehicleFailureWatchdog(
      watchdog,
      observation({
        deliveredControlFraction: 0,
        progress: 0.42 + index * 0.001,
      }),
    );
    watchdog = result.state;
    failure = result.failure;
  }
  assert.equal(failure, "controlMismatch");
});

test("a required engine failure is reported even after commanded speed falls to zero", () => {
  let watchdog = createVehicleFailureWatchdog(0.4);
  let failure = null;
  for (let index = 0; index < 21; index += 1) {
    const result = advanceVehicleFailureWatchdog(
      watchdog,
      observation({
        requiredControlAvailable: false,
        requestedControlEffort: 0,
        deliveredControlFraction: 1,
        progress: 0.4,
      }),
    );
    watchdog = result.state;
    failure = result.failure;
  }
  assert.equal(failure, "controlMismatch");
});

test("an unavailable lift request trips the same physical control watchdog", () => {
  assert.equal(deliveredLiftControlFraction(1, 0.1, 1.1), 1);
  assert.equal(deliveredLiftControlFraction(-1, 0.1, 0.7), 1);
  assert.equal(deliveredLiftControlFraction(1, 0.1, 0.96), 0);

  let watchdog = createVehicleFailureWatchdog(0.4);
  let failure = null;
  for (let index = 0; index < 21; index += 1) {
    const result = advanceVehicleFailureWatchdog(
      watchdog,
      observation({
        requestedControlEffort: 0,
        deliveredControlFraction: 1,
        requestedLiftEffort: 1,
        deliveredLiftFraction: 0,
      }),
    );
    watchdog = result.state;
    failure = result.failure;
  }
  assert.equal(failure, "controlMismatch");
});

test("persistent route-altitude loss is a route divergence", () => {
  let watchdog = createVehicleFailureWatchdog(0.4);
  let failure = null;
  for (let index = 0; index < 51; index += 1) {
    const result = advanceVehicleFailureWatchdog(
      watchdog,
      observation({
        altitudeError: 18,
        requestedControlEffort: 0.2,
        progress: 0.4 + index * 0.001,
      }),
    );
    watchdog = result.state;
    failure = result.failure;
  }
  assert.equal(failure, "routeDivergence");
});

test("a feasible upset suspends failure timers while an unrecoverable one still fails", () => {
  let watchdog = createVehicleFailureWatchdog(0.4);
  for (let index = 0; index < 80; index += 1) {
    const result = advanceVehicleFailureWatchdog(
      watchdog,
      observation({
        pitch: 0.9,
        crossTrackError: 40,
        progress: 0.4,
        recoveringDisturbance: true,
      }),
    );
    watchdog = result.state;
    assert.equal(result.failure, null);
  }
  assert.equal(watchdog.attitudeSeconds, 0);
  assert.equal(watchdog.routeSeconds, 0);
  assert.equal(watchdog.stalledSeconds, 0);

  let failure = null;
  for (let index = 0; index < 31; index += 1) {
    const result = advanceVehicleFailureWatchdog(
      watchdog,
      observation({
        pitch: 0.9,
        progress: 0.4,
        recoveringDisturbance: false,
      }),
    );
    watchdog = result.state;
    failure = result.failure;
  }
  assert.equal(failure, "criticalAttitude");
});

test("recovery feasibility predicts stopping authority, not deviation alone", () => {
  const tossedButHealthy = {
    pitch: 0.7,
    roll: 0.12,
    tiltAngularSpeed: 0.22,
    rightingAngularAcceleration: 0.18,
    liftToWeight: 1.12,
    requiredControlAvailable: true,
    deliveredControlFraction: 1,
    relativeAltitude: 10,
    verticalSpeed: 0,
    minimumRelativeAltitude: -20,
  };
  assert.equal(vehicleDisturbanceRecoveryFeasible(tossedButHealthy), true);
  assert.equal(
    vehicleDisturbanceRecoveryFeasible({
      ...tossedButHealthy,
      liftToWeight: 0.96,
    }),
    false,
    "a level craft with less lift than weight cannot hold stabilization",
  );
  assert.equal(
    vehicleDisturbanceRecoveryFeasible({
      ...tossedButHealthy,
      requiredControlAvailable: false,
    }),
    false,
  );
  assert.equal(
    vehicleDisturbanceRecoveryFeasible({
      ...tossedButHealthy,
      pitch: 1.48,
      tiltAngularSpeed: 0.7,
    }),
    false,
  );
  assert.equal(
    vehicleDisturbanceRecoveryFeasible({
      ...tossedButHealthy,
      relativeAltitude: -15,
      verticalSpeed: -6,
    }),
    false,
  );
});

test("arrival times out only after ten seconds inside the docking capture", () => {
  let watchdog = createVehicleFailureWatchdog(0.99);
  let failure = null;
  for (let index = 0; index < 101; index += 1) {
    const result = advanceVehicleFailureWatchdog(
      watchdog,
      observation({
        progress: 0.99,
        requestedControlEffort: 0.1,
        inDockingCapture: true,
      }),
    );
    watchdog = result.state;
    failure = result.failure;
  }
  assert.equal(failure, "dockingTimeout");
});

test("a captured winch may take longer than its stall allowance while it keeps converging", () => {
  let watchdog = createVehicleFailureWatchdog(0.99);
  let failure = null;
  for (let index = 0; index < 200; index += 1) {
    const result = advanceVehicleFailureWatchdog(
      watchdog,
      observation({
        progress: 1,
        requestedControlEffort: 0.1,
        inDockingCapture: true,
        dockingDistance: 0.7 - index * 0.0005,
        dockingTimeoutSeconds: 6,
        dockingProgressMetres: 0.01,
      }),
    );
    watchdog = result.state;
    failure = result.failure;
  }
  assert.equal(failure, null, "twenty seconds of slow physical convergence is healthy");

  for (let index = 0; index < 61; index += 1) {
    const result = advanceVehicleFailureWatchdog(
      watchdog,
      observation({
        progress: 1,
        requestedControlEffort: 0.1,
        inDockingCapture: true,
        dockingDistance: 0.6,
        dockingTimeoutSeconds: 6,
        dockingProgressMetres: 0.01,
      }),
    );
    watchdog = result.state;
    failure = result.failure;
  }
  assert.equal(failure, "dockingTimeout", "a captured but stuck winch still fails");
});

test("entering the docking capture hands the final manoeuvre over to its own timer", () => {
  let watchdog = createVehicleFailureWatchdog(0.99);
  for (let index = 0; index < 340; index += 1) {
    const result = advanceVehicleFailureWatchdog(
      watchdog,
      observation({
        progress: 1,
        requestedControlEffort: 0.1,
        inFinalManeuver: true,
      }),
    );
    watchdog = result.state;
    assert.equal(result.failure, null);
  }
  assert.ok(watchdog.finalManeuverSeconds > 33.9);

  for (let index = 0; index < 90; index += 1) {
    const result = advanceVehicleFailureWatchdog(
      watchdog,
      observation({
        progress: 1,
        requestedControlEffort: 0.1,
        inFinalManeuver: true,
        inDockingCapture: true,
      }),
    );
    watchdog = result.state;
    assert.equal(result.failure, null);
  }
  assert.equal(watchdog.finalManeuverSeconds, 0);
  assert.ok(watchdog.dockingSeconds > 8.9);
});

test("the vertical landing manoeuvre is not mistaken for a stalled route", () => {
  let watchdog = createVehicleFailureWatchdog(0.99);
  for (let index = 0; index < 150; index += 1) {
    const result = advanceVehicleFailureWatchdog(
      watchdog,
      observation({
        progress: 0.99,
        requestedControlEffort: 0.9,
        inFinalManeuver: true,
      }),
    );
    watchdog = result.state;
    assert.equal(result.failure, null);
  }
  assert.equal(watchdog.stalledSeconds, 0);
});

test("a commanded pivot may pause route progress but cannot spin forever", () => {
  let watchdog = createVehicleFailureWatchdog(0.4);
  for (let index = 0; index < 100; index += 1) {
    const result = advanceVehicleFailureWatchdog(
      watchdog,
      observation({
        turning: true,
        headingError: Math.PI,
        progress: 0.4,
      }),
    );
    watchdog = result.state;
    assert.equal(result.failure, null);
  }
  let failure = null;
  for (let index = 0; index < 351; index += 1) {
    const result = advanceVehicleFailureWatchdog(
      watchdog,
      observation({
        turning: true,
        headingError: Math.PI,
        progress: 0.4,
      }),
    );
    watchdog = result.state;
    failure = result.failure;
  }
  assert.equal(failure, "stalled");
});

test("a final manoeuvre can descend normally but cannot hang forever", () => {
  let watchdog = createVehicleFailureWatchdog(0.99);
  let failure = null;
  for (let index = 0; index < 351; index += 1) {
    const result = advanceVehicleFailureWatchdog(
      watchdog,
      observation({
        progress: 0.99,
        requestedControlEffort: 0.9,
        inFinalManeuver: true,
      }),
    );
    watchdog = result.state;
    failure = result.failure;
  }
  assert.equal(failure, "dockingTimeout");
  assert.equal(watchdog.stalledSeconds, 0);
});

test("a slow final approach is progress, not a docking timeout", () => {
  let watchdog = createVehicleFailureWatchdog(0.99);
  let failure = null;
  for (let index = 0; index < 500; index += 1) {
    const result = advanceVehicleFailureWatchdog(
      watchdog,
      observation({
        progress: 0.99,
        requestedControlEffort: 0.2,
        inFinalManeuver: true,
        dockingDistance: 8 - index * 0.01,
      }),
    );
    watchdog = result.state;
    failure = result.failure;
  }
  assert.equal(failure, null);
  assert.equal(watchdog.finalManeuverSeconds < 1, true);

  for (let index = 0; index < 351; index += 1) {
    const result = advanceVehicleFailureWatchdog(
      watchdog,
      observation({
        progress: 0.99,
        requestedControlEffort: 0.2,
        inFinalManeuver: true,
        dockingDistance: 3,
      }),
    );
    watchdog = result.state;
    failure = result.failure;
  }
  assert.equal(failure, "dockingTimeout");
});

test("recovery follows capability and geography instead of vehicle names", () => {
  const healthy = {
    structureFlightworthy: true,
    liftToWeight: 1.08,
    requiredActuatorFractions: [1, 1],
  };
  const engineGone = {
    ...healthy,
    requiredActuatorFractions: [0, 1],
  };
  const halfEngine = {
    ...healthy,
    requiredActuatorFractions: [0.5, 1],
  };
  assert.equal(vehicleFailureDisposition(healthy, true), "escapeRoute");
  assert.equal(vehicleFailureDisposition(halfEngine, true), "escapeRoute");
  assert.equal(vehicleFailureDisposition(engineGone, false), "descendBelowFog");
  assert.equal(vehicleFailureDisposition(engineGone, true), "settleInPlace");
});

test("the third failed approach triggers the common fly-away replacement recovery", () => {
  const watchdog = createVehicleFailureWatchdog(0.7);
  assert.equal(
    advanceVehicleFailureWatchdog(watchdog, observation({ goArounds: 2 }))
      .failure,
    null,
    "the second go-around was mistaken for the common three-attempt limit",
  );
  const failure = advanceVehicleFailureWatchdog(
    watchdog,
    observation({ goArounds: 3 }),
  ).failure;
  assert.equal(failure, "goAroundLimit");
  const disposition = vehicleFailureDisposition(
    {
      structureFlightworthy: true,
      liftToWeight: 1.08,
      requiredActuatorFractions: [1, 1],
    },
    true,
  );
  assert.equal(disposition, "escapeRoute");
  assert.deepEqual(createVehicleRecoveryLifecycle(failure, disposition), {
    reason: "goAroundLimit",
    disposition: "escapeRoute",
    phase: "escape",
    phaseSeconds: 0,
  });
});

test("non-finite physics fails immediately", () => {
  const watchdog = createVehicleFailureWatchdog(0.7);
  assert.equal(
    advanceVehicleFailureWatchdog(
      watchdog,
      observation({ yawRateError: Number.NaN }),
    ).failure,
    "invalidState",
  );
});

test("off-screen recovery waits thirty seconds, rebuilds, then arrives", () => {
  let lifecycle = createVehicleRecoveryLifecycle(
    "controlMismatch",
    "descendBelowFog",
  );
  let result = advanceVehicleRecoveryLifecycle(lifecycle, {
    deltaSeconds: 2,
    escapeComplete: false,
    belowFog: true,
    landingComplete: false,
    rebuildComplete: false,
    arrivalComplete: false,
  });
  lifecycle = result.lifecycle;
  assert.equal(lifecycle.phase, "waiting");

  result = advanceVehicleRecoveryLifecycle(lifecycle, {
    deltaSeconds: VEHICLE_REBUILD_DELAY_SECONDS - 0.1,
    escapeComplete: false,
    belowFog: false,
    landingComplete: false,
    rebuildComplete: false,
    arrivalComplete: false,
  });
  lifecycle = result.lifecycle;
  assert.equal(result.requestRebuild, false);
  assert.equal(lifecycle.phase, "waiting");

  result = advanceVehicleRecoveryLifecycle(lifecycle, {
    deltaSeconds: 0.1,
    escapeComplete: false,
    belowFog: false,
    landingComplete: false,
    rebuildComplete: false,
    arrivalComplete: false,
  });
  lifecycle = result.lifecycle;
  assert.equal(result.requestRebuild, true);
  assert.equal(lifecycle.phase, "rebuilding");

  result = advanceVehicleRecoveryLifecycle(lifecycle, {
    deltaSeconds: 0.1,
    escapeComplete: false,
    belowFog: false,
    landingComplete: false,
    rebuildComplete: true,
    arrivalComplete: false,
  });
  lifecycle = result.lifecycle;
  assert.equal(lifecycle.phase, "arrival");

  result = advanceVehicleRecoveryLifecycle(lifecycle, {
    deltaSeconds: 1,
    escapeComplete: false,
    belowFog: false,
    landingComplete: false,
    rebuildComplete: true,
    arrivalComplete: true,
  });
  assert.equal(result.recovered, true);
  assert.equal(result.lifecycle, null);
});

test("a failed vehicle over the island lands physically before it is settled", () => {
  let lifecycle = createVehicleRecoveryLifecycle(
    "criticalAttitude",
    "settleInPlace",
  );
  assert.equal(lifecycle.phase, "landing");
  let result = advanceVehicleRecoveryLifecycle(lifecycle, {
    deltaSeconds: 120,
    escapeComplete: true,
    belowFog: true,
    landingComplete: false,
    rebuildComplete: true,
    arrivalComplete: true,
  });
  lifecycle = result.lifecycle;
  assert.equal(lifecycle.phase, "landing");

  result = advanceVehicleRecoveryLifecycle(lifecycle, {
    deltaSeconds: 0.1,
    escapeComplete: false,
    belowFog: false,
    landingComplete: true,
    rebuildComplete: false,
    arrivalComplete: false,
  });
  assert.equal(result.lifecycle.phase, "settled");
  assert.equal(result.requestRebuild, false);
  assert.equal(result.recovered, false);
});

test("landing needs sustained support and a stable pose, then latches", () => {
  let state = createVehicleLandingStability([0, 5, 0], [0, 0, 0, 1]);
  const sample = (overrides = {}) => ({
    deltaSeconds: 0.5,
    supportContacts: 2,
    position: [0, 5, 0],
    orientation: [0, 0, 0, 1],
    velocity: [0.02, 0, 0],
    angularVelocity: [0, 0.005, 0],
    ...overrides,
  });

  for (
    let elapsed = 0;
    elapsed < VEHICLE_LANDING_STABLE_SECONDS;
    elapsed += 0.5
  ) {
    state = advanceVehicleLandingStability(state, sample());
  }
  assert.equal(state.landed, true);

  state = advanceVehicleLandingStability(
    state,
    sample({ supportContacts: 0, velocity: [8, -4, 0] }),
  );
  assert.equal(state.landed, true, "a proven landing must remain latched");

  let hovering = createVehicleLandingStability([0, 5, 0], [0, 0, 0, 1]);
  for (let elapsed = 0; elapsed < 10; elapsed += 0.5) {
    hovering = advanceVehicleLandingStability(
      hovering,
      sample({ supportContacts: 0, velocity: [0, 0, 0] }),
    );
  }
  assert.equal(hovering.landed, false, "a motionless hover is not ground");
});

test("a correction cannot starve the watchdog it answers to", () => {
  const inverted = observation({
    recoveringDisturbance: true,
    pitch: DEFAULT_VEHICLE_FAILURE_ENVELOPE.maximumPitch + 0.2,
  });
  let state = createVehicleFailureWatchdog(0.4);
  let failure = null;
  let seconds = 0;
  for (let step = 0; step < 2000 && failure === null; step += 1) {
    const result = advanceVehicleFailureWatchdog(state, inverted);
    state = result.state;
    failure = result.failure;
    seconds += inverted.deltaSeconds;
    if (
      seconds <
      DEFAULT_VEHICLE_FAILURE_ENVELOPE.correctionGraceSeconds * 0.5
    ) {
      assert.equal(
        failure,
        null,
        "a live correction must own an attitude excursion it is fixing",
      );
    }
  }
  assert.equal(failure, "criticalAttitude");
  assert.equal(
    seconds >= DEFAULT_VEHICLE_FAILURE_ENVELOPE.correctionGraceSeconds,
    true,
    "the grace budget was not honoured before the watchdog resumed",
  );
  assert.equal(
    seconds <
      DEFAULT_VEHICLE_FAILURE_ENVELOPE.correctionGraceSeconds +
        DEFAULT_VEHICLE_FAILURE_ENVELOPE.attitudeGraceSeconds +
        1,
    true,
    `the suspended watchdog resumed too late, after ${seconds.toFixed(1)} s`,
  );
});

test("correction attempts are budgeted like go-arounds", () => {
  const almost = advanceVehicleFailureWatchdog(
    createVehicleFailureWatchdog(0.4),
    observation({
      corrections: DEFAULT_VEHICLE_FAILURE_ENVELOPE.maximumCorrections - 1,
    }),
  );
  assert.equal(almost.failure, null);
  const exhausted = advanceVehicleFailureWatchdog(
    createVehicleFailureWatchdog(0.4),
    observation({
      corrections: DEFAULT_VEHICLE_FAILURE_ENVELOPE.maximumCorrections,
    }),
  );
  assert.equal(exhausted.failure, "correctionLimit");
});

test("rejoining the route rebases the watchdog without refunding it", () => {
  let state = createVehicleFailureWatchdog(0.4);
  for (let step = 0; step < 100; step += 1) {
    state = advanceVehicleFailureWatchdog(
      state,
      observation({ recoveringDisturbance: true, progress: 0.4 }),
    ).state;
  }
  assert.equal(state.correctionSeconds > 9.5, true);
  const rebased = rebaseVehicleFailureWatchdog(state, 0.31);
  assert.equal(rebased.previousProgress, 0.31);
  assert.equal(rebased.bestFinalManeuverDistance, null);
  assert.equal(
    rebased.correctionSeconds,
    state.correctionSeconds,
    "a merge must not refund the correction grace already spent",
  );
});

test("a fly-away disposition dies with the last engine", () => {
  const overIsland = true;
  const healthy = {
    structureFlightworthy: true,
    liftToWeight: 1.15,
    requiredActuatorFractions: [1, 1, 1],
  };
  assert.equal(vehicleFailureDisposition(healthy, overIsland), "escapeRoute");

  // Both propellers shot away while the escape was already being flown. The
  // claim "it can leave under its own power" is now false, and the machine
  // has to come down instead of holding the climb its escape route asks for.
  const enginesGone = { ...healthy, requiredActuatorFractions: [0, 0, 1] };
  assert.equal(
    vehicleFailureDisposition(enginesGone, overIsland),
    "settleInPlace",
  );
  assert.equal(
    vehicleFailureDisposition(enginesGone, false),
    "descendBelowFog",
  );
  // And a landing disposition starts in the phase that actually descends.
  assert.equal(
    createVehicleRecoveryLifecycle("controlMismatch", "settleInPlace").phase,
    "landing",
  );
  assert.equal(
    createVehicleRecoveryLifecycle("controlMismatch", "descendBelowFog").phase,
    "descent",
  );
});

test("a recoverable deviation never reaches the watchdog as a divergence", () => {
  // The runtime feeds the unrecoverable residual, so being far off the line
  // with room to fix it accumulates nothing at all.
  let state = createVehicleFailureWatchdog(0.4);
  let failure = null;
  for (let step = 0; step < 600 && failure === null; step += 1) {
    const result = advanceVehicleFailureWatchdog(
      state,
      // Flying normally, just a long way off the line — the residual is zero
      // because guidance owns it.
      observation({
        crossTrackError: 0,
        altitudeError: 0,
        progress: 0.4 + step * 0.0005,
      }),
    );
    state = result.state;
    failure = result.failure;
  }
  assert.equal(failure, null);
  assert.equal(state.routeSeconds, 0);

  // The same craft with nothing left to fix it in does trip, on time.
  let stranded = createVehicleFailureWatchdog(0.4);
  let seconds = 0;
  let strandedFailure = null;
  while (strandedFailure === null && seconds < 30) {
    const result = advanceVehicleFailureWatchdog(
      stranded,
      observation({
        crossTrackError:
          DEFAULT_VEHICLE_FAILURE_ENVELOPE.maximumCrossTrackError + 3,
        progress: 0.4 + seconds * 0.005,
      }),
    );
    stranded = result.state;
    strandedFailure = result.failure;
    seconds += 0.1;
  }
  assert.equal(strandedFailure, "routeDivergence");
  assert.equal(
    Math.abs(seconds - DEFAULT_VEHICLE_FAILURE_ENVELOPE.routeGraceSeconds) < 0.3,
    true,
  );
});

test("отвёрнутый нос — не сход с маршрута для машины с векторной тягой", () => {
  // Гексакоптер идёт по линии телом, а нос ведёт отдельно: упреждает поворот,
  // разглядывает причал, заходит крабом. В живом прогоне он летел в 4.7 м от
  // трассы при полностью исправных органах и получал routeDivergence за 113°
  // отворота носа. Сход считается по траектории; нос остаётся наблюдением.
  let crabbing = createVehicleFailureWatchdog(0.4);
  let crabbingFailure = null;
  for (let seconds = 0; crabbingFailure === null && seconds < 30; seconds += 0.1) {
    const result = advanceVehicleFailureWatchdog(
      crabbing,
      observation({
        courseFollowsNose: false,
        headingError: Math.PI * 0.63,
        progress: 0.4 + seconds * 0.005,
      }),
    );
    crabbing = result.state;
    crabbingFailure = result.failure;
  }
  assert.equal(crabbingFailure, null);

  // Корпус, который умеет идти только туда, куда смотрит, судится по-прежнему.
  let bound = createVehicleFailureWatchdog(0.4);
  let boundFailure = null;
  for (let seconds = 0; boundFailure === null && seconds < 30; seconds += 0.1) {
    const result = advanceVehicleFailureWatchdog(
      bound,
      observation({
        courseFollowsNose: true,
        headingError: Math.PI * 0.63,
        progress: 0.4 + seconds * 0.005,
      }),
    );
    bound = result.state;
    boundFailure = result.failure;
  }
  assert.equal(boundFailure, "routeDivergence");

  // Снос остаётся приговором для любой машины: тяга вбок не отменяет линии.
  let adrift = createVehicleFailureWatchdog(0.4);
  let adriftFailure = null;
  for (let seconds = 0; adriftFailure === null && seconds < 30; seconds += 0.1) {
    const result = advanceVehicleFailureWatchdog(
      adrift,
      observation({
        courseFollowsNose: false,
        crossTrackError:
          DEFAULT_VEHICLE_FAILURE_ENVELOPE.maximumCrossTrackError + 3,
        progress: 0.4 + seconds * 0.005,
      }),
    );
    adrift = result.state;
    adriftFailure = result.failure;
  }
  assert.equal(adriftFailure, "routeDivergence");
});

test("севшая машина не остаётся лежать: ждёт срок и возвращается в строй", () => {
  // Фаза `settled` была терминальной, и полигон после первой аварии пустел
  // навсегда: разбитая машина лежала на поле, на замену не приходило ничего.
  // Ждёт она столько же, сколько ушедшая под мир: причина простоя разная, а
  // цена замены одна.
  let lifecycle = {
    reason: "structureLost",
    disposition: "landOnSpot",
    phase: "settled",
    phaseSeconds: 0,
  };
  const observation = {
    deltaSeconds: 1,
    escapeComplete: false,
    belowFog: false,
    landingComplete: false,
    rebuildComplete: false,
    arrivalComplete: false,
  };

  let requested = false;
  for (let second = 0; second < VEHICLE_REBUILD_DELAY_SECONDS + 2; second += 1) {
    const result = advanceVehicleRecoveryLifecycle(lifecycle, observation);
    if (result.requestRebuild) {
      requested = true;
      assert.equal(result.lifecycle.phase, "rebuilding");
      assert.ok(
        second + 1 >= VEHICLE_REBUILD_DELAY_SECONDS,
        `пересборка запрошена слишком рано: на ${second + 1} секунде`,
      );
      break;
    }
    assert.equal(result.lifecycle.phase, "settled", "ушла из покоя раньше срока");
    lifecycle = result.lifecycle;
  }
  assert.ok(requested, "машина осталась лежать навсегда");
});
