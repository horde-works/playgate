import assert from "node:assert/strict";
import test from "node:test";
import {
  SKY_TRAIN_AIR_VEHICLE,
  TOWN_AIRSHIP_AIR_VEHICLE,
} from "../games/make-a-mess/src/game/airVehicles.ts";
import {
  RESTING_BODY,
  massProperties,
  stepBody,
} from "../games/make-a-mess/src/game/clusterDynamics.ts";
import { structuralMaterialProfiles } from "../games/make-a-mess/src/game/destructionScene.ts";
import { grandTerminalScene } from "../games/make-a-mess/src/game/grandTerminalScene.ts";
import { townScene } from "../games/make-a-mess/src/game/townScene.ts";
import {
  compileCommandActuators,
  deliveredCommandValue,
  executeCommandActuators,
} from "../games/make-a-mess/src/game/vehicleActuation.ts";
import {
  propulsionFlightClearance,
  supervisedFailureEnvelope,
} from "../games/make-a-mess/src/game/vehicleFlightSupervisor.ts";
import {
  propulsionHealth,
  updatePropulsionFeedback,
} from "../games/make-a-mess/src/game/vehiclePropulsionAutomation.ts";
import {
  advanceVehicleRouteProgress,
  autopilot,
  hullDrag,
  isDockingComplete,
  isDockingSettleWindow,
  isDockedPose,
  isMooringCaptureEligible,
  mooringForce,
  rotateVector,
  shipForces,
  vehicleAttitude,
  vehicleMooringState,
  vehicleRouteHeading,
} from "../games/make-a-mess/src/game/vehicleFrames.ts";
import {
  advanceVehicleFailureWatchdog,
  createVehicleFailureWatchdog,
} from "../games/make-a-mess/src/game/vehicleFailure.ts";

const densityOf = (material) => structuralMaterialProfiles[material].density;

function mooringCapture(vehicle, state, properties) {
  return vehicleMooringState(
    vehicle,
    [
      state.position[0] - properties.centre[0],
      state.position[1] - properties.centre[1],
      state.position[2] - properties.centre[2],
    ],
    state.orientation,
    state.velocity,
    state.angularVelocity,
    properties.centre,
  );
}

function degradedPlan(plan, factor) {
  return {
    ...plan,
    speedLimit(progress) {
      return plan.speedLimit(progress) * factor;
    },
  };
}

function deliveredFraction(requested, delivered) {
  const wanted = requested.reduce((sum, value) => sum + Math.abs(value), 0);
  const actual = delivered.reduce((sum, value) => sum + Math.abs(value), 0);
  return wanted < 1e-6 ? 1 : Math.min(1, actual / wanted);
}

const carriers = [
  {
    name: "terminal sky train",
    vehicle: SKY_TRAIN_AIR_VEHICLE,
    pieces: grandTerminalScene.breakablePieces.filter(
      (piece) => piece.clusterId === "terminal:sky-train",
    ),
    maximumSeconds: 600,
  },
  {
    name: "town airship",
    vehicle: TOWN_AIRSHIP_AIR_VEHICLE,
    pieces: townScene.breakablePieces.filter(
      (piece) => piece.clusterId === "sky-mooring:airship",
    ),
    maximumSeconds: 900,
  },
];

const damageProfiles = [
  {
    name: "one blade lost on one engine",
    damagedEngines: [0],
    expectedFractions: [0.5, 1],
  },
  {
    name: "one blade lost on each engine",
    damagedEngines: [0, 1],
    expectedFractions: [0.5, 0.5],
  },
];

for (const carrier of carriers) {
  for (const damage of damageProfiles) {
  test(`${carrier.name} completes an uncrewed circuit and docks with ${damage.name}`, (t) => {
    const { vehicle } = carrier;
    const flight = vehicle.flight;
    const bindings = compileCommandActuators(carrier.pieces);
    const engineBindings = [0, 1].map((index) => {
      const binding = bindings.find(
        (candidate) => candidate.commandChannel === `throttle:${index}`,
      );
      assert.ok(binding);
      return binding;
    });
    const brokenBlades = new Set(
      damage.damagedEngines.map(
        (index) => engineBindings[index].members.find(
          (member) => !member.required,
        ).pieceId,
      ),
    );
    const remainingPieces = carrier.pieces.filter(
      (piece) => !brokenBlades.has(piece.id),
    );
    const attached = new Set(remainingPieces.map((piece) => piece.id));
    const health = propulsionHealth(
      bindings,
      attached,
      flight.limits.enginePoints.length,
    );
    const clearance = propulsionFlightClearance(health);
    assert.deepEqual(health.fractions, damage.expectedFractions);
    assert.equal(clearance.uncrewedAllowed, true);
    assert.equal(clearance.passengerAllowed, false);

    const properties = massProperties(remainingPieces, densityOf);
    const plan = degradedPlan(
      flight.routePlan("circuit", properties.centre),
      clearance.speedFactor,
    );
    const trim = [
      properties.centre[0],
      vehicle.liftCentre[1],
      properties.centre[2],
    ];
    const physicalModel = {
      mass: properties.mass,
      inertiaYaw: properties.inertia[4],
      bodyCentre: properties.centre,
      dragLinear: properties.mass * flight.linearDamping,
      dragLateral:
        properties.mass * flight.linearDamping * flight.lateralDragRatio,
      dragAngular: properties.inertia[4] * flight.angularDamping,
      limits: flight.limits,
    };
    const failureEnvelope = supervisedFailureEnvelope(clearance);
    const dt = 1 / 60;
    let state = { ...RESTING_BODY, position: properties.centre };
    let progress = 0;
    let propulsionFeedback = [1, 1];
    let sawInitialShortfall = false;
    let sawCompensation = false;
    let maximumSpeed = 0;
    let simulatedSeconds = 0;
    let watchdog = createVehicleFailureWatchdog(0);
    let recoveryReason = null;
    let recoveryAt = null;
    let goArounds = 0;
    let lastGoAround = -1e9;

    for (let step = 0; step < 60 * carrier.maximumSeconds; step += 1) {
      simulatedSeconds = step * dt;
      const autopilotModel = {
        ...physicalModel,
        engineAvailability: propulsionFeedback,
      };
      const piloted = autopilot(
        plan,
        progress,
        state.position,
        state.orientation,
        state.velocity,
        state.angularVelocity,
        autopilotModel,
        Math.min(1, step / (60 * 8)),
        vehicle.nose,
        flight.approach,
      );
      if (piloted.goAround && step - lastGoAround > 60 * 20) {
        progress = 0;
        goArounds += 1;
        lastGoAround = step;
      }
      const drive = piloted.controls.throttle;
      const execution = executeCommandActuators(
        bindings,
        attached,
        Object.fromEntries(
          drive.map((value, index) => [`throttle:${index}`, value]),
        ),
      );
      const delivered = drive.map((value, index) =>
        deliveredCommandValue(execution, `throttle:${index}`, value));
      if (
        propulsionFeedback.every((fraction) => fraction === 1) &&
        drive.some((value) => Math.abs(value) > 1e-6) &&
        delivered.some(
          (value, index) => Math.abs(value) + 1e-6 < Math.abs(drive[index]),
        )
      ) {
        sawInitialShortfall = true;
      }
      propulsionFeedback = updatePropulsionFeedback(
        propulsionFeedback,
        execution,
        flight.limits.enginePoints.length,
      );
      if (
        Math.min(...delivered) > 0.12 &&
        Math.abs(piloted.desiredYawRate) < 0.015 &&
        damage.damagedEngines.every(
          (index) => Math.abs(drive[index]) > Math.abs(delivered[index]) + 0.2,
        ) &&
        Math.abs(delivered[0] - delivered[1]) < 0.02
      ) {
        sawCompensation = true;
      }

      const controls = { ...piloted.controls, throttle: delivered };
      const liftArm = rotateVector(state.orientation, [
        trim[0] - properties.centre[0],
        trim[1] - properties.centre[1],
        trim[2] - properties.centre[2],
      ]);
      const forces = [
        { force: [0, -properties.mass * 9.81, 0], point: state.position },
        {
          force: [
            0,
            properties.mass * 9.81 *
              (1 + controls.liftTrim * flight.limits.liftTrimRange),
            0,
          ],
          point: [
            state.position[0] + liftArm[0],
            state.position[1] + liftArm[1],
            state.position[2] + liftArm[2],
          ],
        },
        ...shipForces(
          controls,
          state.position,
          properties.centre,
          state.orientation,
          flight.limits,
          vehicle.nose,
          Math.hypot(state.velocity[0], state.velocity[2]),
        ),
      ];
      const facing = rotateVector(state.orientation, vehicle.nose);
      const flat = Math.hypot(facing[0], facing[2]) || 1;
      forces.push({
        force: hullDrag(
          state.velocity,
          [facing[0] / flat, facing[2] / flat],
          physicalModel,
        ),
        point: state.position,
      });
      if (progress > 0.9) {
        const capture = mooringCapture(vehicle, state, properties);
        if (isMooringCaptureEligible(
          capture.offset,
          state.orientation,
          vehicle.nose,
          flight.approach,
          flight.mooringReach,
        )) {
          forces.push({
            force: mooringForce(
              capture.offset,
              capture.velocity,
              properties.mass,
              flight.mooringReach,
            ),
            point: capture.point,
          });
        }
      }
      state = stepBody(
        state,
        properties,
        forces,
        { linear: 0, angular: properties.inertia[4] * flight.angularDamping },
        dt,
      );
      const speed = Math.hypot(state.velocity[0], state.velocity[2]);
      maximumSpeed = Math.max(maximumSpeed, speed);
      progress = advanceVehicleRouteProgress(
        plan,
        progress,
        state.position,
        speed * dt,
      );
      const offset = [
        state.position[0] - properties.centre[0],
        state.position[1] - properties.centre[1],
        state.position[2] - properties.centre[2],
      ];
      const capture = mooringCapture(vehicle, state, properties);
      const dockingComplete = isDockingComplete(
        progress,
        capture.offset,
        state.orientation,
        capture.velocity,
        state.angularVelocity,
        vehicle.nose,
        flight.approach,
        flight.docking,
      );
      const berthDistance = Math.hypot(capture.offset[0], capture.offset[2]);
      const [tangentX, tangentZ] = vehicleRouteHeading(plan, progress);
      const routePoint = plan.point(progress);
      const routeOffsetX = state.position[0] - routePoint[0];
      const routeOffsetZ = state.position[2] - routePoint[2];
      const craftForward = rotateVector(state.orientation, vehicle.nose);
      const craftForwardLength =
        Math.hypot(craftForward[0], craftForward[2]) || 1;
      const headingDot = Math.max(
        -1,
        Math.min(
          1,
          craftForward[0] / craftForwardLength * tangentX +
            craftForward[2] / craftForwardLength * tangentZ,
        ),
      );
      const attitude = vehicleAttitude(state.orientation, vehicle.nose);
      const watchdogResult = advanceVehicleFailureWatchdog(
        watchdog,
        {
          deltaSeconds: dt,
          relativeAltitude: offset[1],
          pitch: attitude.pitch,
          roll: attitude.roll,
          headingError: Math.acos(headingDot),
          yawRateError: state.angularVelocity[1] - piloted.desiredYawRate,
          crossTrackError: Math.abs(
            routeOffsetX * tangentZ - routeOffsetZ * tangentX,
          ),
          altitudeError: state.position[1] - plan.altitude(progress),
          progress,
          requiredControlAvailable: health.mode !== "inoperative",
          requestedControlEffort: Math.max(0, ...drive.map(Math.abs)),
          deliveredControlFraction: deliveredFraction(drive, delivered),
          goArounds,
          turning: Math.abs(state.angularVelocity[1]) > 0.1,
          inFinalManeuver: progress > 0.97 && berthDistance < 8,
          inDockingCapture: isDockingSettleWindow(
            progress,
            capture.offset,
            state.orientation,
            vehicle.nose,
            flight.approach,
            flight.docking,
          ),
          dockingComplete,
        },
        failureEnvelope,
      );
      watchdog = watchdogResult.state;
      if (watchdogResult.failure) {
        recoveryReason = watchdogResult.failure;
        recoveryAt = {
          seconds: simulatedSeconds,
          progress,
          yawRate: state.angularVelocity[1],
          desiredYawRate: piloted.desiredYawRate,
          yawRateError: state.angularVelocity[1] - piloted.desiredYawRate,
          requested: drive,
          delivered,
        };
        break;
      }
      if (
        progress > 0.999 && dockingComplete
      ) {
        break;
      }
    }

    const capture = mooringCapture(vehicle, state, properties);
    assert.equal(
      recoveryReason,
      null,
      `watchdog: ${recoveryReason} ${JSON.stringify(recoveryAt)}`,
    );
    assert.equal(
      sawInitialShortfall,
      true,
      "autopilot never observed the actuator shortfall",
    );
    assert.deepEqual(propulsionFeedback, damage.expectedFractions);
    assert.equal(sawCompensation, true, "the weak shafts never visibly sped up");
    assert.equal(progress > 0.999, true, `${(progress * 100).toFixed(1)}%`);
    assert.equal(
      isDockedPose(
        capture.offset,
        state.orientation,
        capture.velocity,
        state.angularVelocity,
        vehicle.nose,
        flight.approach,
        flight.docking,
      ),
      true,
      `capture ${capture.offset.map((value) => value.toFixed(2)).join(", ")}`,
    );
    t.diagnostic(
      `${simulatedSeconds.toFixed(0)} s; max ${(maximumSpeed * 3.6).toFixed(0)} km/h; ` +
        `dock ${Math.hypot(...capture.offset).toFixed(2)} m`,
    );
  });
  }
}
