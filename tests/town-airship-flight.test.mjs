import assert from "node:assert/strict";
import test from "node:test";
import {
  TOWN_AIRSHIP_AIR_VEHICLE,
  isInsideTownAirship,
} from "../games/make-a-mess/src/game/airVehicles.ts";
import {
  RESTING_BODY,
  massProperties,
  stepBody,
} from "../games/make-a-mess/src/game/clusterDynamics.ts";
import { compoundClusterColliders } from "../games/make-a-mess/src/game/compoundKinematicCluster.ts";
import { structuralMaterialProfiles } from "../games/make-a-mess/src/game/destructionScene.ts";
import {
  compileCommandActuators,
  executeCommandActuators,
} from "../games/make-a-mess/src/game/vehicleActuation.ts";
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
  vehicleRouteHeading,
  vehicleFrameForCluster,
  vehicleMooringState,
  vehicleRotation,
  townAirshipPoint,
} from "../games/make-a-mess/src/game/vehicleFrames.ts";
import {
  advanceVehicleFailureWatchdog,
  createVehicleFailureWatchdog,
} from "../games/make-a-mess/src/game/vehicleFailure.ts";
import {
  townAirshipRoute,
  townAirshipRoutePhase,
} from "../games/make-a-mess/src/game/townAirshipRoutes.ts";
import { townScene } from "../games/make-a-mess/src/game/townScene.ts";

const SHIP = "sky-mooring:airship";
const MAST = "sky-mooring:mast";
const densityOf = (material) => structuralMaterialProfiles[material].density;
const ship = townScene.breakablePieces.filter(
  (piece) => piece.clusterId === SHIP,
);

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

test("the town airship is one compound carrier and the mast stays ashore", () => {
  const frame = vehicleFrameForCluster(SHIP);
  assert.equal(frame?.id, "town-airship");
  assert.equal(vehicleFrameForCluster(MAST), null);

  const colliders = compoundClusterColliders(frame, ship, new Set());
  assert.equal(colliders.length > ship.length / 2, true);
  assert.equal(
    colliders.every((collider) => collider.sourceId.startsWith(`${SHIP}:`)),
    true,
  );
  assert.equal(
    colliders.some((collider) => collider.sourceId.includes(":blade:")),
    false,
    "animated propellers must not have a second rigid pose owner",
  );
  assert.equal(
    ship.some((piece) => piece.id.includes(":landing:")),
    false,
    "the door landing must remain part of the mast",
  );
  assert.equal(
    townScene.breakablePieces.some(
      (piece) => piece.id.includes(":mast:landing:") && piece.clusterId === MAST,
    ),
    true,
  );
});

test("the city route cannot finish before the nose cone is inside the mast cup", () => {
  const cone = townScene.breakablePieces.find(
    (piece) => piece.id === `${SHIP}:nose:cone:piece`,
  );
  const cup = townScene.breakablePieces.find(
    (piece) => piece.id === `${MAST}:cup:piece`,
  );
  assert.ok(cone);
  assert.ok(cup);

  const radialClearance = (cup.size[0] - cone.size[0]) / 2;
  const vehicle = TOWN_AIRSHIP_AIR_VEHICLE;
  assert.equal(
    vehicle.flight.docking.position < radialClearance,
    true,
    `completion radius ${vehicle.flight.docking.position.toFixed(2)} m exceeds ` +
      `the cup clearance ${radialClearance.toFixed(2)} m`,
  );
  assert.equal(
    isDockingComplete(
      0.99,
      [radialClearance + 0.01, 0, 0],
      [0, 0, 0, 1],
      [0, 0, 0],
      [0, 0, 0],
      vehicle.nose,
      vehicle.flight.approach,
      vehicle.flight.docking,
    ),
    false,
    "the autopilot declared docking while the cone was still outside the cup",
  );
});

test("the measured mass hangs under the authored lift heart", () => {
  const vehicle = TOWN_AIRSHIP_AIR_VEHICLE;
  const properties = massProperties(ship, densityOf);
  const horizontalOffset = Math.hypot(
    properties.centre[0] - vehicle.liftCentre[0],
    properties.centre[2] - vehicle.liftCentre[2],
  );

  assert.equal(properties.mass > 140 && properties.mass < 155, true);
  assert.equal(horizontalOffset < 0.15, true, `${horizontalOffset.toFixed(3)} m`);
  assert.equal(
    vehicle.liftCentre[1] - properties.centre[1] > 1,
    true,
    "the gondola must hang below the gas volume",
  );

  const withoutCitySideEngine = massProperties(
    ship.filter((piece) => !piece.id.includes(":engine:1:")),
    densityOf,
  );
  const lateral = [
    -Math.sin(-1.451),
    Math.cos(-1.451),
  ];
  const intactSide =
    properties.centre[0] * lateral[0] + properties.centre[2] * lateral[1];
  const damagedSide =
    withoutCitySideEngine.centre[0] * lateral[0] +
    withoutCitySideEngine.centre[2] * lateral[1];
  assert.equal(damagedSide < intactSide, true);
});

test("both propellers and the tail are real breakable control channels", () => {
  const bindings = compileCommandActuators(ship);
  assert.deepEqual(
    bindings.map((binding) => binding.commandChannel).sort(),
    ["rudder", "throttle:0", "throttle:1"],
  );

  const all = new Set(ship.map((piece) => piece.id));
  const intact = executeCommandActuators(bindings, all, {
    "throttle:0": 0.8,
    "throttle:1": 0.35,
    rudder: -0.6,
  });
  assert.deepEqual(
    intact.map((execution) => execution.delivered),
    intact.map((execution) => execution.requested),
  );

  const portBlades = bindings.find(
    (binding) => binding.commandChannel === "throttle:0",
  ).members
    .filter((member) => !member.required)
    .map((member) => member.pieceId);
  const withoutOnePortBlade = new Set(
    [...all].filter((id) => id !== portBlades[0]),
  );
  const damaged = executeCommandActuators(bindings, withoutOnePortBlade, {
    "throttle:0": 1,
    "throttle:1": 1,
    rudder: 1,
  });
  assert.equal(
    damaged.find((execution) => execution.commandChannel === "throttle:0")
      ?.delivered,
    0.5,
  );
  assert.equal(
    damaged.find((execution) => execution.commandChannel === "throttle:1")
      ?.delivered,
    1,
  );

  const withoutPortPropeller = new Set(
    [...all].filter((id) => !portBlades.includes(id)),
  );
  const failed = executeCommandActuators(bindings, withoutPortPropeller, {
    "throttle:0": 1,
    "throttle:1": 1,
    rudder: 1,
  });
  assert.equal(
    failed.find((execution) => execution.commandChannel === "throttle:0")
      ?.delivered,
    0,
  );
});

test("the stair dispatch and onboard ride are distinct physical calls", () => {
  const { departure, passengerFlight } = TOWN_AIRSHIP_AIR_VEHICLE;
  assert.ok(departure);
  assert.ok(passengerFlight);
  assert.equal(departure.target.cue, "town-uncrewed-flight");
  assert.equal(passengerFlight.target.cue, "town-passenger-flight");
  assert.equal(isInsideTownAirship(passengerFlight.point), true);
  assert.equal(isInsideTownAirship(departure.point), false);
  assert.equal(departure.point[1] < 2, true, "dispatch belongs at the stair foot");
  const sternCall = townAirshipPoint(7.05, 0, 8.12);
  assert.equal(
    Math.hypot(
      passengerFlight.point[0] - sternCall[0],
      passengerFlight.point[1] - sternCall[1],
      passengerFlight.point[2] - sternCall[2],
    ) < 0.01,
    true,
    "the passenger call belongs in the stern aisle",
  );
  const doorThreshold = townAirshipPoint(4.2, 1.2, 8.12);
  assert.equal(
    Math.hypot(
      passengerFlight.point[0] - doorThreshold[0],
      passengerFlight.point[2] - doorThreshold[2],
    ) > passengerFlight.approachRadius,
    true,
    "the ride action must not compete with the door request",
  );
  assert.equal(
    Math.hypot(
      departure.point[0] - passengerFlight.point[0],
      departure.point[2] - passengerFlight.point[2],
    ) > departure.releaseRadius,
    true,
  );
});

test("both city routes back out, climb clear and return along the mast nose", () => {
  const properties = massProperties(ship, densityOf);
  const vehicle = TOWN_AIRSHIP_AIR_VEHICLE;

  for (const kind of ["circuit", "tour"]) {
    const route = townAirshipRoute(kind);
    const reverse = route.markerProgress("reverseComplete");
    const plan = vehicle.flight.routePlan(kind, properties.centre);
    assert.equal(plan.travelDirection(0), -1);
    assert.equal(plan.travelDirection(reverse + 1e-5), 1);
    assert.equal(plan.altitude(reverse) - properties.centre[1] >= 12.9, true);
    assert.equal(townAirshipRoutePhase(kind, reverse / 2), "departure");
    assert.equal(
      townAirshipRoutePhase(kind, route.nodeProgress("east")),
      "cruise",
    );
    assert.equal(
      townAirshipRoutePhase(kind, route.nodeProgress("arrival-shoulder")),
      "approach",
    );

    const glideSeam = route.length - 78;
    const beforeSeam = route.requirement(
      "altitude",
      (glideSeam - 0.01) / route.length,
    );
    const afterSeam = route.requirement(
      "altitude",
      (glideSeam + 0.01) / route.length,
    );
    assert.equal(
      Math.abs(beforeSeam - afterSeam) < 0.01,
      true,
      `${kind} introduces a vertical step at the final-glide seam`,
    );
    let previousArrivalAltitude = Number.POSITIVE_INFINITY;
    for (
      let distance = route.length - 135;
      distance <= route.length;
      distance += 0.25
    ) {
      const arrivalAltitude = route.requirement(
        "altitude",
        distance / route.length,
      );
      assert.equal(
        arrivalAltitude <= previousArrivalAltitude + 1e-8,
        true,
        `${kind} asks the returning craft to climb again at ${distance.toFixed(1)} m`,
      );
      previousArrivalAltitude = arrivalAltitude;
    }

    const end = plan.point(1);
    const before = plan.point(plan.finalFrom);
    const run = [end[0] - before[0], end[2] - before[2]];
    const length = Math.hypot(...run);
    assert.equal(
      (run[0] * vehicle.nose[0] + run[1] * vehicle.nose[2]) / length > 0.999,
      true,
      "the final glide must follow the mooring nose axis",
    );
  }
});

test("sternway is a commanded heading, not an emergency course error", () => {
  const plan = TOWN_AIRSHIP_AIR_VEHICLE.flight.routePlan(
    "tour",
    TOWN_AIRSHIP_AIR_VEHICLE.origin,
  );
  const reversing = vehicleRouteHeading(plan, 0.001);
  const forward = vehicleRouteHeading(plan, 0.12);
  const nose = TOWN_AIRSHIP_AIR_VEHICLE.nose;

  assert.equal(reversing[0] * nose[0] + reversing[1] * nose[2] > 0.99, true);
  assert.equal(forward[0] * nose[0] + forward[1] * nose[2] < 0.95, true);
});

test("the city flight envelope leaves room for hull and an overboard passenger", () => {
  const properties = massProperties(ship, densityOf);
  let farthest = 0;
  for (const kind of ["circuit", "tour"]) {
    const plan = TOWN_AIRSHIP_AIR_VEHICLE.flight.routePlan(
      kind,
      properties.centre,
    );
    for (let sample = 0; sample <= 1000; sample += 1) {
      const point = plan.point(sample / 1000);
      farthest = Math.max(
        farthest,
        Math.hypot(
          point[0] - townScene.worldCenter[0],
          point[2] - townScene.worldCenter[1],
        ),
      );
    }
  }
  assert.equal(farthest + 30 < townScene.boundaryRadius, true);
  assert.equal(townScene.boundaryRadius + 55 <= townScene.skyRadius, true);
  assert.equal(
    farthest + townScene.skyRadius + 55 <= townScene.cameraFar,
    true,
  );
});

test("an off-screen replacement follows the town glide and docks high", () => {
  const vehicle = TOWN_AIRSHIP_AIR_VEHICLE;
  const flight = vehicle.flight;
  const properties = massProperties(ship, densityOf);
  const plan = flight.arrivalPlan(properties.centre);
  const start = plan.point(0);
  const ahead = plan.point(6 / plan.length);
  const tangentLength = Math.hypot(
    ahead[0] - start[0],
    ahead[2] - start[2],
  ) || 1;
  const tangent = [
    (ahead[0] - start[0]) / tangentLength,
    (ahead[2] - start[2]) / tangentLength,
  ];
  const localNoseLength = Math.hypot(vehicle.nose[0], vehicle.nose[2]) || 1;
  const localNose = [
    vehicle.nose[0] / localNoseLength,
    vehicle.nose[2] / localNoseLength,
  ];
  const yaw = Math.atan2(
    localNose[1] * tangent[0] - localNose[0] * tangent[1],
    localNose[0] * tangent[0] + localNose[1] * tangent[1],
  );
  let state = {
    ...RESTING_BODY,
    position: start,
    orientation: vehicleRotation(
      { position: [0, 0, 0], yaw, pitch: 0, roll: 0 },
      vehicle.nose,
    ),
    velocity: [tangent[0] * 6.5, 0, tangent[1] * 6.5],
  };
  let progress = 0;
  const trim = [
    properties.centre[0],
    vehicle.liftCentre[1],
    properties.centre[2],
  ];
  const model = {
    mass: properties.mass,
    inertiaYaw: properties.inertia[4],
    bodyCentre: properties.centre,
    dragLinear: properties.mass * flight.linearDamping,
    dragLateral:
      properties.mass * flight.linearDamping * flight.lateralDragRatio,
    dragAngular: properties.inertia[4] * flight.angularDamping,
    limits: flight.limits,
  };
  const dt = 1 / 60;
  for (let step = 0; step < 60 * 300; step += 1) {
    const piloted = autopilot(
      plan,
      progress,
      state.position,
      state.orientation,
      state.velocity,
      state.angularVelocity,
      model,
      1,
      vehicle.nose,
      flight.approach,
    );
    const liftArm = rotateVector(state.orientation, [
      trim[0] - properties.centre[0],
      trim[1] - properties.centre[1],
      trim[2] - properties.centre[2],
    ]);
    const forces = [
      {
        force: [0, -properties.mass * 9.81, 0],
        point: state.position,
      },
      {
        force: [
          0,
          properties.mass * 9.81 *
            (1 + piloted.controls.liftTrim * flight.limits.liftTrimRange),
          0,
        ],
        point: [
          state.position[0] + liftArm[0],
          state.position[1] + liftArm[1],
          state.position[2] + liftArm[2],
        ],
      },
      ...shipForces(
        piloted.controls,
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
        model,
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
    progress = advanceVehicleRouteProgress(
      plan,
      progress,
      state.position,
      Math.hypot(state.velocity[0], state.velocity[2]) * dt,
    );
    const capture = mooringCapture(vehicle, state, properties);
    if (
      progress > 0.999 &&
      isDockedPose(
        capture.offset,
        state.orientation,
        capture.velocity,
        state.angularVelocity,
        vehicle.nose,
        flight.approach,
        flight.docking,
      )
    ) {
      break;
    }
  }
  const capture = mooringCapture(vehicle, state, properties);
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
});

test("the city emergency escape backs out, turns clockwise and climbs twenty metres", () => {
  const vehicle = TOWN_AIRSHIP_AIR_VEHICLE;
  const berth = massProperties(ship, densityOf).centre;
  // VehicleFrameSystem supplies the body's offset from the authored berth.
  // At the initial pose it is zero; the route must therefore begin at the
  // elevated mast, never at world zero.
  const plan = vehicle.flight.escapePlan(berth, {
    start: [0, 0, 0],
    forward: vehicle.nose,
  });
  const start = plan.point(0);
  assert.deepEqual(
    start.map((value) => Number(value.toFixed(6))),
    berth.map((value) => Number(value.toFixed(6))),
  );

  const right = [-vehicle.nose[2], vehicle.nose[0]];
  const projection = (point) => {
    const dx = point[0] - start[0];
    const dz = point[2] - start[2];
    return {
      forward: dx * vehicle.nose[0] + dz * vehicle.nose[2],
      right: dx * right[0] + dz * right[1],
      climb: point[1] - start[1],
    };
  };
  const samples = Array.from({ length: 501 }, (_, index) => {
    const progress = index / 500;
    return {
      progress,
      direction: plan.travelDirection?.(progress) ?? 1,
      ...projection(plan.point(progress)),
    };
  });
  const reverse = samples.filter((sample) => sample.direction < 0);
  const forward = samples.filter((sample) => sample.direction > 0);
  assert.equal(reverse.length > 0, true);
  assert.equal(Math.min(...reverse.map((sample) => sample.forward)) < -14, true);
  assert.equal(Math.max(...reverse.map((sample) => Math.abs(sample.right))) < 0.3, true);
  assert.equal(Math.max(...reverse.map((sample) => Math.abs(sample.climb))) < 0.05, true);

  const firstTurn = forward.find((sample) => sample.right > 8);
  assert.notEqual(firstTurn, undefined);
  assert.equal(firstTurn.forward < 0, true);
  assert.equal(firstTurn.climb > 0, true);
  assert.equal(Math.max(...samples.map((sample) => sample.climb)) <= 20.001, true);
  assert.equal(Math.abs(samples.at(-1).climb - 20) < 0.001, true);
  assert.equal(samples.at(-1).forward > 140, true);
  assert.equal(samples.at(-1).right > 140, true);

  // A non-zero body offset is also relative to the berth. This catches the
  // old city-only subtraction that sent recovery toward the map origin.
  const offset = [12, 3, -5];
  const displaced = vehicle.flight.escapePlan(berth, {
    start: offset,
    forward: vehicle.nose,
  }).point(0);
  assert.deepEqual(
    displaced.map((value) => Number(value.toFixed(6))),
    berth.map((value, index) => Number((value + offset[index]).toFixed(6))),
  );
});

for (const kind of ["circuit", "tour"]) {
  test(`the town airship flies the ${kind} on forces and docks at the mast`, (t) => {
    const vehicle = TOWN_AIRSHIP_AIR_VEHICLE;
    const flight = vehicle.flight;
    const properties = massProperties(ship, densityOf);
    const plan = flight.routePlan(kind, properties.centre);
    const trim = [
      properties.centre[0],
      vehicle.liftCentre[1],
      properties.centre[2],
    ];
    const model = {
      mass: properties.mass,
      inertiaYaw: properties.inertia[4],
      bodyCentre: properties.centre,
      dragLinear: properties.mass * flight.linearDamping,
      dragLateral:
        properties.mass * flight.linearDamping * flight.lateralDragRatio,
      dragAngular: properties.inertia[4] * flight.angularDamping,
      limits: flight.limits,
    };
    const dt = 1 / 60;
    let state = { ...RESTING_BODY, position: properties.centre };
    let progress = 0;
    let maxRouteError = 0;
    let minimumForward = 0;
    let reverseClearance = null;
    let lastControls = null;
    let goArounds = 0;
    let lastGoAround = -1e9;
    let liftNow = properties.mass * 9.81;
    let watchdog = createVehicleFailureWatchdog(0);
    let recoveryReason = null;
    const reverseUntil = townAirshipRoute(kind).markerProgress("reverseComplete");

    const maximumSeconds = kind === "tour" ? 360 : 300;
    for (let step = 0; step < 60 * maximumSeconds; step += 1) {
      const piloted = autopilot(
        plan,
        progress,
        state.position,
        state.orientation,
        state.velocity,
        state.angularVelocity,
        model,
        Math.min(1, step / (60 * 8)),
        vehicle.nose,
        flight.approach,
      );
      lastControls = piloted.controls;
      if (piloted.goAround && step - lastGoAround > 60 * 20) {
        progress = 0;
        goArounds += 1;
        lastGoAround = step;
      }
      const liftArm = rotateVector(state.orientation, [
        trim[0] - properties.centre[0],
        trim[1] - properties.centre[1],
        trim[2] - properties.centre[2],
      ]);
      const neutralLift = properties.mass * 9.81;
      const liftTarget = neutralLift *
        (1 + piloted.controls.liftTrim * flight.limits.liftTrimRange);
      const liftRate = neutralLift * 0.25 * dt;
      liftNow += Math.max(
        -liftRate,
        Math.min(liftRate, liftTarget - liftNow),
      );
      const forces = [
        {
          force: [0, -properties.mass * 9.81, 0],
          point: state.position,
        },
        {
          force: [0, liftNow, 0],
          point: [
            state.position[0] + liftArm[0],
            state.position[1] + liftArm[1],
            state.position[2] + liftArm[2],
          ],
        },
        ...shipForces(
          piloted.controls,
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
          model,
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
      progress = advanceVehicleRouteProgress(
        plan,
        progress,
        state.position,
        speed * dt,
      );
      const fromBerth = [
        state.position[0] - properties.centre[0],
        state.position[2] - properties.centre[2],
      ];
      const forward =
        fromBerth[0] * vehicle.nose[0] + fromBerth[1] * vehicle.nose[2];
      minimumForward = Math.min(minimumForward, forward);
      if (reverseClearance === null && progress >= reverseUntil) {
        reverseClearance = {
          forward,
          height: state.position[1] - properties.centre[1],
        };
      }
      const routePoint = plan.point(progress);
      maxRouteError = Math.max(
        maxRouteError,
        Math.hypot(
          state.position[0] - routePoint[0],
          state.position[2] - routePoint[2],
        ),
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
      const watchdogResult = advanceVehicleFailureWatchdog(watchdog, {
        deltaSeconds: dt,
        relativeAltitude: offset[1],
        pitch: 0,
        roll: 0,
        headingError: 0,
        yawRateError: 0,
        crossTrackError: 0,
        progress,
        requiredControlAvailable: true,
        requestedControlEffort: 0,
        deliveredControlFraction: 1,
        goArounds,
        turning: false,
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
      });
      watchdog = watchdogResult.state;
      if (watchdogResult.failure) {
        recoveryReason = watchdogResult.failure;
        break;
      }
      if (
        progress > 0.999 && dockingComplete
      ) {
        break;
      }
    }

    const capture = mooringCapture(vehicle, state, properties);
    assert.equal(minimumForward < -30, true, `${minimumForward.toFixed(1)} m`);
    assert.equal(recoveryReason, null, `healthy arrival triggered ${recoveryReason}`);
    assert.ok(reverseClearance);
    assert.equal(reverseClearance.forward < -30, true);
    assert.equal(reverseClearance.height > 10, true);
    assert.equal(
      progress > 0.999,
      true,
      `${(progress * 100).toFixed(1)}%; position ` +
        `${state.position.map((value) => value.toFixed(1)).join(", ")}; ` +
        `speed ${Math.hypot(state.velocity[0], state.velocity[2]).toFixed(2)}; ` +
        `max error ${maxRouteError.toFixed(1)}; route ` +
        `${plan.point(progress).map((value) => value.toFixed(1)).join(", ")}; ` +
        `heading ${rotateVector(state.orientation, vehicle.nose).map((value) => value.toFixed(2)).join(", ")}; ` +
        `controls ${JSON.stringify(lastControls)}`,
    );
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
      `capture ${capture.offset.map((value) => value.toFixed(2)).join(", ")}; ` +
        `velocity ${state.velocity.map((value) => value.toFixed(3)).join(", ")}`,
    );
    assert.equal(maxRouteError < 18, true, `${maxRouteError.toFixed(1)} m`);
    assert.equal(goArounds, 0);
    t.diagnostic(
      `${kind}: error ${maxRouteError.toFixed(1)} m; ` +
        `reverse ${reverseClearance.forward.toFixed(1)} m / ` +
        `climb ${reverseClearance.height.toFixed(1)} m; ` +
        `dock ${Math.hypot(capture.offset[0], capture.offset[2]).toFixed(2)} m`,
    );
  });
}
