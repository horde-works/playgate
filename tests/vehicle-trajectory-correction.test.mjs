import assert from "node:assert/strict";
import test from "node:test";
import {
  assessVehicleTrajectory,
  planVehicleTrajectoryCorrection,
  requestedVehicleTrajectoryMode,
  vehicleTrajectoryMergeReady,
  vehicleTrajectoryStabilizationPlan,
} from "../games/make-a-mess/src/game/vehicleTrajectoryCorrection.ts";
import { airVehicles } from "../games/make-a-mess/src/game/airVehicles.ts";
import { DEFAULT_VEHICLE_FAILURE_ENVELOPE } from "../games/make-a-mess/src/game/vehicleFailure.ts";
import { vehicleGuidanceEnvelope } from "../games/make-a-mess/src/game/vehicleGuidanceEnvelope.ts";
import { basaltStrongholdScene } from "../games/make-a-mess/src/game/basaltStrongholdScene.ts";
import {
  RESTING_BODY,
  massProperties,
  stepBody,
} from "../games/make-a-mess/src/game/clusterDynamics.ts";
import { structuralMaterialProfiles } from "../games/make-a-mess/src/game/destructionScene.ts";
import { grandTerminalScene } from "../games/make-a-mess/src/game/grandTerminalScene.ts";
import { townScene } from "../games/make-a-mess/src/game/townScene.ts";
import {
  advanceVehicleRouteProgress,
  autopilot,
  hullDrag,
  rejoinVehicleRouteProgress,
  rotateVector,
  shipForces,
  SKY_TRAIN_APPROACH,
  vehicleRotation,
  vehicleRouteHeading,
} from "../games/make-a-mess/src/game/vehicleFrames.ts";
import { vikingVillageScene } from "../games/make-a-mess/src/game/vikingVillageScene.ts";

const ROUTE = {
  id: "test:route",
  length: 100,
  finalFrom: 0.75,
  point(progress) {
    return [progress * 100, 10, 0];
  },
  speedLimit(progress) {
    return progress >= 0.75 ? Math.max(0.8, (1 - progress) * 24) : 6;
  },
  altitude() {
    return 10;
  },
};

const MODEL = {
  mass: 100,
  inertiaYaw: 900,
  bodyCentre: [0, 0, 0],
  dragLinear: 20,
  dragLateral: 140,
  dragAngular: 420,
  limits: {
    enginePower: 400,
    enginePoints: [
      [0, 0, -2],
      [0, 0, 2],
    ],
    maxRudderForce: 120,
    rudderReferenceSpeed: 6,
    rudderPoint: [-5, 0, 0],
    liftTrimRange: 0.12,
  },
};

const GUIDANCE = vehicleGuidanceEnvelope(
  DEFAULT_VEHICLE_FAILURE_ENVELOPE,
  SKY_TRAIN_APPROACH,
  MODEL.limits,
);

/** Every machine derives its corridor from its own passport. */
function guidanceFor(vehicle) {
  return vehicleGuidanceEnvelope(
    DEFAULT_VEHICLE_FAILURE_ENVELOPE,
    vehicle.flight.approach,
    vehicle.flight.limits,
    vehicle.flight.guidance,
  );
}

const NOSE = [1, 0, 0];
const IDENTITY = [0, 0, 0, 1];

const REVERSING_ROUTE = {
  ...ROUTE,
  id: "test:reversing-route",
  travelDirection(progress) {
    return progress < 0.2 ? -1 : 1;
  },
};

function state(overrides = {}) {
  return {
    position: [40, 10, 0],
    orientation: IDENTITY,
    velocity: [5, 0, 0],
    angularVelocity: [0, 0, 0],
    ...overrides,
  };
}

test("navigation reacts to both displacement and lost orientation", () => {
  const nominal = assessVehicleTrajectory(ROUTE, 0.4, state(), NOSE, false, GUIDANCE);
  assert.equal(nominal.correctionRequired, false);

  const ordinaryTrackingLag = assessVehicleTrajectory(
    ROUTE,
    0.4,
    state({ position: [40, 10, 12] }),
    NOSE,
    false,
    GUIDANCE,
  );
  assert.equal(
    ordinaryTrackingLag.correctionRequired,
    false,
    "ordinary route-following authority should own a moderate unforced error",
  );

  const displaced = assessVehicleTrajectory(
    ROUTE,
    0.4,
    state({ position: [40, 10, 6] }),
    NOSE,
    true,
    GUIDANCE,
  );
  assert.equal(displaced.correctionRequired, true);
  assert.equal(displaced.requiresStabilization, false);
  assert.equal(displaced.reason, "track");

  const yaw = (24 * Math.PI) / 180;
  const turned = assessVehicleTrajectory(
    ROUTE,
    0.4,
    state({
      orientation: [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)],
    }),
    NOSE,
    true,
    GUIDANCE,
  );
  assert.equal(turned.correctionRequired, true);
  assert.equal(turned.requiresStabilization, false);
  assert.equal(turned.reason, "heading");

  const severe = assessVehicleTrajectory(
    ROUTE,
    0.4,
    state({
      position: [40, 10, 18],
      velocity: [5, -1.4, 0],
    }),
    NOSE,
    true,
    GUIDANCE,
  );
  assert.equal(severe.correctionRequired, true);
  assert.equal(severe.requiresStabilization, true);
});

test("the autopilot stays in authored-route mode through a direction change", () => {
  const reversed = assessVehicleTrajectory(
    REVERSING_ROUTE,
    0.201,
    state({
      position: REVERSING_ROUTE.point(0.201),
      orientation: [0, 1, 0, 0],
      velocity: [-2, 0, 0],
      angularVelocity: [0, 0.22, 0],
    }),
    NOSE,
    false,
    GUIDANCE,
  );
  assert.equal(reversed.correctionRequired, true);
  assert.equal(reversed.reason, "heading");
  assert.equal(
    requestedVehicleTrajectoryMode(reversed, GUIDANCE),
    "authoredRoute",
    "a scheduled sternway/forward pivot must stay in its authored mode",
  );

  const displaced = assessVehicleTrajectory(
    ROUTE,
    0.4,
    state({ position: [40, 10, 6] }),
    NOSE,
    true,
    GUIDANCE,
  );
  assert.equal(requestedVehicleTrajectoryMode(displaced, GUIDANCE), "intercepting");

  const tumbling = assessVehicleTrajectory(
    ROUTE,
    0.4,
    state({ position: [40, 10, 18], velocity: [5, -1.4, 0] }),
    NOSE,
    true,
    GUIDANCE,
  );
  assert.equal(requestedVehicleTrajectoryMode(tumbling, GUIDANCE), "stabilizing");
});

test("an intercept cannot cross a travel-direction boundary", () => {
  const noRoom = planVehicleTrajectoryCorrection(
    REVERSING_ROUTE,
    0.19,
    state({
      position: [19, 10, 5],
      velocity: [2, 0, 0],
    }),
    MODEL,
    NOSE,
  );
  assert.equal(
    noRoom,
    null,
    "the planner invented room by crossing into the forward manoeuvre",
  );
  const correction = planVehicleTrajectoryCorrection(
    REVERSING_ROUTE,
    0.05,
    state({
      position: [5, 10, 5],
      orientation: [0, 1, 0, 0],
      velocity: [2, 0, 0],
    }),
    MODEL,
    NOSE,
  );
  assert.ok(correction);
  assert.equal(REVERSING_ROUTE.travelDirection(0.05), -1);
  assert.equal(REVERSING_ROUTE.travelDirection(correction.mergeProgress), -1);
});

test("a correction is a continuous temporary route into a feasible route state", () => {
  const navigation = state({ position: [40, 10, 10] });
  const correction = planVehicleTrajectoryCorrection(
    ROUTE,
    0.4,
    navigation,
    MODEL,
    NOSE,
  );
  assert.ok(correction);
  assert.equal(correction.countsAsGoAround, false);
  assert.deepEqual(correction.plan.point(0), navigation.position);
  assert.deepEqual(
    correction.plan.point(1),
    ROUTE.point(correction.mergeProgress),
  );
  assert.equal(correction.mergeProgress >= 0.365, true);
  assert.equal(correction.mergeProgress <= 0.72, true);
  assert.equal(correction.plan.speedLimit(0) > 0, true);
});

test("a short correction cannot contain a loop or heading cusp", () => {
  const yaw = -Math.PI / 4;
  const correction = planVehicleTrajectoryCorrection(
    ROUTE,
    0.4,
    state({
      position: [40, 10, 4],
      orientation: [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)],
      velocity: [0, 0, 0],
    }),
    MODEL,
    NOSE,
  );
  assert.ok(correction);

  let previous = vehicleRouteHeading(correction.plan, 0);
  let totalHeadingChange = 0;
  let largestHeadingStep = 0;
  for (let sample = 1; sample <= 200; sample += 1) {
    const heading = vehicleRouteHeading(correction.plan, sample / 200);
    const change = Math.acos(
      Math.max(
        -1,
        Math.min(1, previous[0] * heading[0] + previous[1] * heading[1]),
      ),
    );
    totalHeadingChange += change;
    largestHeadingStep = Math.max(largestHeadingStep, change);
    previous = heading;
  }
  assert.equal(
    totalHeadingChange < Math.PI,
    true,
    `the temporary route turns through ${totalHeadingChange.toFixed(2)} rad`,
  );
  assert.equal(
    largestHeadingStep < 0.12,
    true,
    `the temporary route contains a ${largestHeadingStep.toFixed(2)} rad cusp`,
  );
  assert.equal(
    correction.plan.guidanceLookahead(0) < correction.plan.length,
    true,
  );
});

test("a disrupted final selects an earlier sufficient glide point", () => {
  const moving = state({
    position: [97, 10, 8],
    velocity: [4, 0, 0],
  });
  assert.equal(
    planVehicleTrajectoryCorrection(ROUTE, 0.97, moving, MODEL, NOSE),
    null,
    "an impossible moving U-turn must stabilize before it is replanned",
  );
  const navigation = { ...moving, velocity: [0, 0, 0] };
  const correction = planVehicleTrajectoryCorrection(
    ROUTE,
    0.97,
    navigation,
    MODEL,
    NOSE,
  );
  assert.ok(correction);
  assert.equal(correction.countsAsGoAround, true);
  assert.equal(correction.mergeProgress >= ROUTE.finalFrom, true);
  assert.equal(correction.mergeProgress < 0.97, true);
  assert.equal(
    (1 - correction.mergeProgress) * ROUTE.length >= 14,
    true,
    "the selected glide point leaves no room to settle the approach",
  );
});

test("stabilization brakes on the present heading before path interception", () => {
  const navigation = state({
    position: [46, 13, 7],
    velocity: [3, -0.4, 1],
  });
  const hold = vehicleTrajectoryStabilizationPlan(
    ROUTE,
    0.46,
    navigation,
    NOSE,
  );
  assert.deepEqual(hold.point(0), [46, 13, 7]);
  assert.equal(hold.speedLimit(0), 0);
  assert.equal(hold.altitude(0) >= 13, true);

  const falling = state({
    position: [46, 7, 7],
    velocity: [3, -2, 1],
  });
  const fallingHold = vehicleTrajectoryStabilizationPlan(
    ROUTE,
    0.46,
    falling,
    NOSE,
  );
  const controls = autopilot(
    fallingHold,
    0,
    falling.position,
    falling.orientation,
    falling.velocity,
    falling.angularVelocity,
    MODEL,
    1,
    NOSE,
  ).controls;
  assert.equal(controls.liftTrim, 1, "stabilization did not demand full lift");
});

test("route control resumes only after position, course and attitude merge", () => {
  const mergeProgress = 0.6;
  assert.equal(
    vehicleTrajectoryMergeReady(
      ROUTE,
      mergeProgress,
      state({
        position: [60.4, 10.2, 0.6],
        velocity: [4, 0, 0.2],
      }),
      NOSE,
      GUIDANCE,
    ),
    true,
  );
  assert.equal(
    vehicleTrajectoryMergeReady(
      ROUTE,
      mergeProgress,
      state({
        position: [60.4, 10.2, 0.6],
        velocity: [0, 0, 4],
      }),
      NOSE,
      GUIDANCE,
    ),
    false,
  );
});

function orientationForHeading(nose, heading) {
  const length = Math.hypot(nose[0], nose[2]) || 1;
  const local = [nose[0] / length, nose[2] / length];
  const yaw = Math.atan2(
    local[1] * heading[0] - local[0] * heading[1],
    local[0] * heading[0] + local[1] * heading[1],
  );
  return vehicleRotation({ position: [0, 0, 0], yaw, pitch: 0, roll: 0 }, nose);
}

test("the basalt departure pivot does not enter trajectory correction", () => {
  const vehicle = airVehicles.find(({ id }) => id === "basalt-sky-ram");
  assert.ok(vehicle);
  const pieces = basaltStrongholdScene.breakablePieces.filter(
    (piece) => piece.clusterId === vehicle.clusterId,
  );
  const properties = massProperties(
    pieces,
    (material) => structuralMaterialProfiles[material].density,
  );
  const plan = vehicle.flight.routePlan("circuit", properties.centre);
  let transition = 0;
  for (let sample = 1; sample <= 10_000; sample += 1) {
    const progress = sample / 10_000;
    if (
      (plan.travelDirection?.(progress - 0.0001) ?? 1) < 0 &&
      (plan.travelDirection?.(progress) ?? 1) > 0
    ) {
      transition = progress;
      break;
    }
  }
  assert.equal(transition > 0, true);
  const before = Math.max(0, transition - 0.0002);
  const after = Math.min(1, transition + 0.0002);
  const previousNoseHeading = vehicleRouteHeading(plan, before);
  const assessment = assessVehicleTrajectory(
    plan,
    after,
    {
      position: plan.point(after),
      orientation: orientationForHeading(vehicle.nose, previousNoseHeading),
      velocity: [
        -previousNoseHeading[0] * 1.6,
        0,
        -previousNoseHeading[1] * 1.6,
      ],
      angularVelocity: [0, 0.22, 0],
    },
    vehicle.nose,
    false,
    guidanceFor(vehicle),
  );
  assert.equal(assessment.reason, "heading");
  assert.equal(
    requestedVehicleTrajectoryMode(assessment, guidanceFor(vehicle)),
    "authoredRoute",
  );
});

test("every authored air vehicle can construct a moving route intercept", () => {
  const pieces = [
    ...grandTerminalScene.breakablePieces,
    ...vikingVillageScene.breakablePieces,
    ...townScene.breakablePieces,
    ...basaltStrongholdScene.breakablePieces,
  ];
  for (const vehicle of airVehicles) {
    const kind =
      vehicle.departure?.flightKind ?? vehicle.passengerFlight?.flightKind;
    assert.ok(kind, `${vehicle.id} has no testable route`);
    const properties = massProperties(
      pieces.filter((piece) => piece.clusterId === vehicle.clusterId),
      (material) => structuralMaterialProfiles[material].density,
    );
    assert.equal(properties.mass > 0, true, `${vehicle.id} has no mass model`);
    const berth = properties.centre;
    const plan = vehicle.flight.routePlan(kind, berth);
    const progress = Math.max(0.12, Math.min(0.55, plan.finalFrom - 0.08));
    const routePoint = plan.point(progress);
    const heading = vehicleRouteHeading(plan, progress);
    const travelDirection = plan.travelDirection?.(progress) ?? 1;
    const navigation = {
      position: [
        routePoint[0] - heading[1] * 5,
        routePoint[1],
        routePoint[2] + heading[0] * 5,
      ],
      orientation: orientationForHeading(vehicle.nose, heading),
      velocity: [
        heading[0] * travelDirection * 3,
        0,
        heading[1] * travelDirection * 3,
      ],
      angularVelocity: [0, 0, 0],
    };
    const correction = planVehicleTrajectoryCorrection(
      plan,
      progress,
      navigation,
      {
        mass: properties.mass,
        inertiaYaw: properties.inertia[4],
        bodyCentre: berth,
        dragLinear: vehicle.flight.linearDamping * properties.mass,
        dragLateral:
          vehicle.flight.linearDamping *
          properties.mass *
          vehicle.flight.lateralDragRatio,
        dragAngular: vehicle.flight.angularDamping * properties.inertia[4],
        limits: vehicle.flight.limits,
      },
      vehicle.nose,
    );
    assert.ok(correction, `${vehicle.id} could not construct an intercept`);
    assert.deepEqual(correction.plan.point(0), navigation.position);
    assert.deepEqual(
      correction.plan.point(1),
      plan.point(correction.mergeProgress),
    );
  }
});

test("the fortress physically flies a correction without orbiting its intercept", () => {
  const vehicle = airVehicles.find(({ id }) => id === "basalt-sky-ram");
  assert.ok(vehicle);
  const pieces = basaltStrongholdScene.breakablePieces.filter(
    (piece) => piece.clusterId === vehicle.clusterId,
  );
  const properties = massProperties(
    pieces,
    (material) => structuralMaterialProfiles[material].density,
  );
  const model = {
    mass: properties.mass,
    inertiaYaw: properties.inertia[4],
    bodyCentre: properties.centre,
    dragLinear: vehicle.flight.linearDamping * properties.mass,
    dragLateral:
      vehicle.flight.linearDamping *
      properties.mass *
      vehicle.flight.lateralDragRatio,
    dragAngular: vehicle.flight.angularDamping * properties.inertia[4],
    limits: vehicle.flight.limits,
  };
  const route = vehicle.flight.routePlan("circuit", properties.centre);
  const sourceProgress = 0.55;
  const routePoint = route.point(sourceProgress);
  const routeHeading = vehicleRouteHeading(route, sourceProgress);
  const courseOffset = Math.PI / 9;
  const disturbedHeading = [
    routeHeading[0] * Math.cos(courseOffset) -
      routeHeading[1] * Math.sin(courseOffset),
    routeHeading[0] * Math.sin(courseOffset) +
      routeHeading[1] * Math.cos(courseOffset),
  ];
  let state = {
    ...RESTING_BODY,
    position: [
      routePoint[0] - routeHeading[1] * 5,
      routePoint[1],
      routePoint[2] + routeHeading[0] * 5,
    ],
    orientation: orientationForHeading(vehicle.nose, disturbedHeading),
    velocity: [routeHeading[0] * 3, 0, routeHeading[1] * 3],
  };
  const correction = planVehicleTrajectoryCorrection(
    route,
    sourceProgress,
    state,
    model,
    vehicle.nose,
  );
  assert.ok(correction);
  let correctionProgress = 0;
  let previousHeading = disturbedHeading;
  let accumulatedYaw = 0;
  let maximumDifferentialThrust = 0;
  let saturatedDifferentialSeconds = 0;
  let mergedAt = null;
  const dt = 1 / 60;
  for (let step = 0; step < 60 * 45; step += 1) {
    const piloted = autopilot(
      correction.plan,
      correctionProgress,
      state.position,
      state.orientation,
      state.velocity,
      state.angularVelocity,
      model,
      1,
      vehicle.nose,
      vehicle.flight.approach,
    );
    const differentialThrust =
      (Math.max(...piloted.controls.throttle) -
        Math.min(...piloted.controls.throttle)) /
      2;
    maximumDifferentialThrust = Math.max(
      maximumDifferentialThrust,
      differentialThrust,
    );
    if (differentialThrust > 0.995) {
      saturatedDifferentialSeconds += dt;
    }
    const forward = rotateVector(state.orientation, vehicle.nose);
    const flat = Math.hypot(forward[0], forward[2]) || 1;
    const heading = [forward[0] / flat, forward[2] / flat];
    accumulatedYaw += Math.acos(
      Math.max(
        -1,
        Math.min(
          1,
          previousHeading[0] * heading[0] + previousHeading[1] * heading[1],
        ),
      ),
    );
    previousHeading = heading;
    const centre = state.position;
    const forces = [
      {
        force: hullDrag(state.velocity, heading, model),
        point: centre,
      },
      ...shipForces(
        piloted.controls,
        centre,
        properties.centre,
        state.orientation,
        vehicle.flight.limits,
        vehicle.nose,
        Math.hypot(state.velocity[0], state.velocity[2]),
      ),
    ];
    state = stepBody(
      state,
      properties,
      forces,
      { linear: 0, angular: model.dragAngular },
      dt,
    );
    correctionProgress = advanceVehicleRouteProgress(
      correction.plan,
      correctionProgress,
      state.position,
      Math.hypot(state.velocity[0], state.velocity[2]) * dt,
    );
    const actualMergeProgress = rejoinVehicleRouteProgress(
      route,
      correction.mergeProgress,
      state.position,
      0.04,
      0.12,
    );
    if (
      correctionProgress >= 0.8 &&
      (route.travelDirection?.(actualMergeProgress) ?? 1) ===
        (route.travelDirection?.(correction.mergeProgress) ?? 1) &&
      vehicleTrajectoryMergeReady(
        route,
        actualMergeProgress,
        state,
        vehicle.nose,
        guidanceFor(vehicle),
      )
    ) {
      mergedAt = step * dt;
      break;
    }
  }
  assert.notEqual(
    mergedAt,
    null,
    "the physical correction never reacquired the route",
  );
  assert.equal(
    accumulatedYaw < Math.PI,
    true,
    `the correction accumulated ${accumulatedYaw.toFixed(2)} rad of yaw`,
  );
  assert.equal(
    saturatedDifferentialSeconds < 2.5,
    true,
    `the correction held maximum differential thrust for ${saturatedDifferentialSeconds.toFixed(1)} s`,
  );
  assert.equal(maximumDifferentialThrust > 0.25, true);
});

test("guidance always reacts before the watchdog gives up, on every machine", () => {
  const failure = DEFAULT_VEHICLE_FAILURE_ENVELOPE;
  const tiltCeiling = Math.min(failure.maximumPitch, failure.maximumRoll);
  for (const vehicle of airVehicles) {
    const { cruise, disturbed, stabilizationEntry, stabilizationExit, merge } =
      guidanceFor(vehicle);
    const ordered = [
      ["crossTrack", cruise.crossTrack, failure.maximumCrossTrackError],
      [
        "predictedCrossTrack",
        cruise.predictedCrossTrack,
        failure.maximumCrossTrackError,
      ],
      ["altitude", cruise.altitude, failure.maximumAltitudeError],
      [
        "predictedAltitude",
        cruise.predictedAltitude,
        failure.maximumAltitudeError,
      ],
      ["heading", cruise.heading, failure.maximumHeadingError],
      ["velocityHeading", cruise.velocityHeading, failure.maximumHeadingError],
      ["tilt", cruise.tilt, tiltCeiling],
      ["tiltRate", cruise.tiltRate, failure.maximumYawRate],
    ];
    for (const [name, corridor, limit] of ordered) {
      assert.equal(
        corridor < limit,
        true,
        `${vehicle.id}: guidance ${name} ${corridor} is not inside the failure limit ${limit}`,
      );
    }
    for (const name of Object.keys(cruise)) {
      assert.equal(
        disturbed[name] <= cruise[name],
        true,
        `${vehicle.id}: a known impulse must not widen ${name}`,
      );
    }
    // A hold is entered before the corridor itself is lost, and left with
    // hysteresis; otherwise the mode oscillates on one noisy frame.
    assert.equal(stabilizationEntry.tilt < cruise.tilt, true);
    assert.equal(stabilizationExit.tilt < stabilizationEntry.tilt, true);
    assert.equal(stabilizationExit.tiltRate < stabilizationEntry.tiltRate, true);
    assert.equal(
      stabilizationExit.verticalSpeed < stabilizationEntry.verticalSpeed,
      true,
    );
    assert.equal(merge.position < vehicle.flight.approach.tolerance.position, true);
    assert.equal(merge.heading < vehicle.flight.approach.tolerance.heading, true);
  }
});

test("corridor and merge tolerances belong to the machine passport", () => {
  const town = airVehicles.find(({ id }) => id === "town-airship");
  const ram = airVehicles.find(({ id }) => id === "basalt-sky-ram");
  assert.ok(town && ram);
  const townGuidance = guidanceFor(town);
  const ramGuidance = guidanceFor(ram);
  // The stronghold's wider approach gate and shallower trim range must reach
  // the corrector; a shared constant would give both the same numbers.
  assert.equal(
    ramGuidance.merge.position > townGuidance.merge.position,
    true,
    "the merge gate did not follow each machine's approach gate",
  );
  assert.equal(
    ramGuidance.stabilizationEntry.verticalSpeed <
      townGuidance.stabilizationEntry.verticalSpeed,
    true,
    "the hold gate did not follow each machine's trim authority",
  );

  const tightened = vehicleGuidanceEnvelope(
    DEFAULT_VEHICLE_FAILURE_ENVELOPE,
    town.flight.approach,
    town.flight.limits,
    { corridorScale: 0.5, mergeScale: 0.5, arrestableVerticalSpeed: 0.5 },
  );
  assert.equal(
    Math.abs(tightened.cruise.crossTrack - townGuidance.cruise.crossTrack / 2) <
      1e-9,
    true,
  );
  assert.equal(
    Math.abs(tightened.merge.position - townGuidance.merge.position / 2) < 1e-9,
    true,
  );
  assert.equal(tightened.stabilizationEntry.verticalSpeed < 0.5, true);
});
