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
import {
  propulsionFlightClearance,
} from "../games/make-a-mess/src/game/vehicleFlightSupervisor.ts";
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
  VEHICLE_LANDING_STABLE_SECONDS,
  VEHICLE_REBUILD_DELAY_SECONDS,
  vehicleFailureDisposition,
} from "../games/make-a-mess/src/game/vehicleFailure.ts";

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

test("only actuators still carried by the compound body execute commands", () => {
  const bindings = compileCommandActuators(pieces);
  assert.equal(bindings.length, 2);
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

  const leftCore = bindings[0].members.find((member) => member.required);
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
    const bindings = compileCommandActuators(carrier).filter(
      (binding) => binding.commandChannel.startsWith("throttle:"),
    );
    assert.equal(bindings.length, 2);
    assert.equal(bindings.every((binding) => binding.members.length === 3), true);
    assert.equal(
      bindings.every((binding) =>
        binding.members.filter((member) => !member.required).length === 2 &&
        binding.members
          .filter((member) => !member.required)
          .every((member) => member.pieceId.includes(":blade:"))),
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
    const firstDrive = allocateAutopilotEngineCommands(
      0.8,
      0,
      [-1, 1],
      [1, 1],
    );
    assert.deepEqual(firstDrive, [0.8, 0.8]);
    const firstExecution = executeCommandActuators(
      bindings,
      degradedMembers,
      {
        "throttle:0": firstDrive[0],
        "throttle:1": firstDrive[1],
      },
    );
    assert.deepEqual(
      [0, 1].map((index) =>
        deliveredCommandValue(
          firstExecution,
          `throttle:${index}`,
          firstDrive[index],
        )),
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
        deliveredCommandValue(execution, `throttle:${index}`, drive[index])),
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
        )),
      [-0.5, -0.5],
    );

    const failedMembers = new Set(
      [...intact].filter(
        (pieceId) => !bindings[0].members.some((member) => member.pieceId === pieceId),
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
      enginePoints: [[0, 0, -4], [0, 0, 4]],
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
  const delivered = command.map(
    (value, index) => value * availability[index],
  );
  const moment = delivered.reduce(
    (sum, value, index) => sum + value * yawArms[index],
    0,
  );
  assert.equal(model.limits.enginePower, 300);
  assert.equal(command.length, 3);
  assert.ok(command.every((value) => Math.abs(value) <= 1));
  assert.ok(Math.abs(moment - 0.2) < 1e-9);
  assert.ok(Math.abs(delivered.reduce((sum, value) => sum + value, 0) - 1.2) < 1e-9);
  assert.equal(balancedEngineYawAuthority([-1, 1], [0.5, 1]), 1);
});

test("a short control interruption recovers but a detached actuator trips the watchdog", () => {
  let watchdog = createVehicleFailureWatchdog(0.4);
  for (let index = 0; index < 10; index += 1) {
    const result = advanceVehicleFailureWatchdog(
      watchdog,
      observation({ deliveredControlFraction: 0, progress: 0.4 + index * 0.001 }),
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
      observation({ deliveredControlFraction: 0, progress: 0.42 + index * 0.001 }),
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
  assert.equal(
    vehicleFailureDisposition(engineGone, false),
    "descendBelowFog",
  );
  assert.equal(vehicleFailureDisposition(engineGone, true), "settleInPlace");
});

test("two failed approaches and non-finite physics fail immediately", () => {
  const watchdog = createVehicleFailureWatchdog(0.7);
  assert.equal(
    advanceVehicleFailureWatchdog(
      watchdog,
      observation({ goArounds: 2 }),
    ).failure,
    "goAroundLimit",
  );
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

  for (let elapsed = 0; elapsed < VEHICLE_LANDING_STABLE_SECONDS; elapsed += 0.5) {
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
