import assert from "node:assert/strict";
import test from "node:test";
import {
  assessVehicleTrajectory,
  planVehicleTrajectoryCorrection,
  requestedVehicleTrajectoryMode,
  vehicleTrajectoryMergeReady,
  vehicleCorrectionAllowanceSeconds,
  vehicleTrajectoryStabilizationPlan,
  vehicleUnrecoverableDeviation,
  vehicleUpsetSettled,
  VEHICLE_HOLD_ALLOWANCE_SECONDS,
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
import { nimbusScene } from "../games/make-a-mess/src/game/nimbusScene.ts";
import { islandAirportScene } from "../games/make-a-mess/src/game/islandAirportScene.ts";
import { kallurScene } from "../games/make-a-mess/src/game/kallurScene.ts";
import { combatHexacopterRangeScene } from "../games/make-a-mess/src/game/combatHexacopterRangeScene.ts";
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

test("a push off the line is judged by the distance left to answer it", () => {
  // The same six metres of lateral displacement. On the circuit there are
  // hundreds of metres to turn it out; on final there are not.
  const pushed = state({ position: [40, 10, 6] });
  const cruise = assessVehicleTrajectory(
    ROUTE,
    0.4,
    pushed,
    NOSE,
    MODEL,
    GUIDANCE,
  );
  assert.equal(cruise.phase, "cruise");
  assert.equal(cruise.correctionRequired, false);
  assert.equal(
    cruise.reachableClosure > cruise.crossTrackError,
    true,
    "ordinary turning must own a mid-circuit push",
  );

  const onFinal = assessVehicleTrajectory(
    ROUTE,
    0.97,
    state({ position: [97, 10, 6] }),
    NOSE,
    MODEL,
    GUIDANCE,
  );
  assert.equal(onFinal.phase, "approach");
  assert.equal(onFinal.correctionRequired, true);
  assert.equal(onFinal.reason, "track");
  assert.equal(
    requestedVehicleTrajectoryMode(onFinal),
    "intercepting",
    "a berth that can no longer be reached must ask for an intercept",
  );
});

test("a swinging gondola is not a reason to stop flying", () => {
  const yaw = (24 * Math.PI) / 180;
  const swinging = assessVehicleTrajectory(
    ROUTE,
    0.4,
    state({
      // Heeled twelve degrees, rolling, yawed off the route line: exactly the
      // state a burst of machine-gun fire leaves behind.
      orientation: [Math.sin(yaw / 2), 0, 0, Math.cos(yaw / 2)],
      angularVelocity: [0.18, 0.12, 0.1],
    }),
    NOSE,
    MODEL,
    GUIDANCE,
  );
  assert.equal(swinging.upset, false);
  assert.equal(swinging.correctionRequired, false);
  assert.equal(requestedVehicleTrajectoryMode(swinging), "authoredRoute");

  // A genuine upset is a rate event, and it does own the craft.
  const tumbling = assessVehicleTrajectory(
    ROUTE,
    0.4,
    state({ angularVelocity: [0.9, 0, 0.4] }),
    NOSE,
    MODEL,
    GUIDANCE,
  );
  assert.equal(tumbling.upset, true);
  assert.equal(requestedVehicleTrajectoryMode(tumbling), "stabilizing");
  assert.equal(
    vehicleUpsetSettled(state({ angularVelocity: [0.9, 0, 0.4] }), GUIDANCE),
    false,
  );
  // And it ends on measured rates, with nothing asked about the attitude left.
  assert.equal(
    vehicleUpsetSettled(
      // Still descending fast: a climb or a drop is a job for the lift and
      // trim loops, never a reason to stop flying the route.
      state({ angularVelocity: [0.05, 0.02, 0.03], velocity: [5, -3.2, 0] }),
      GUIDANCE,
    ),
    true,
  );
});

test("a hexacopter does not mistake its own sharp manoeuvre for an upset", () => {
  const hexacopter = airVehicles.find(({ id }) => id === "town-hexacopter");
  assert.ok(hexacopter);
  const hexacopterGuidance = guidanceFor(hexacopter);
  const sharpManoeuvre = state({ angularVelocity: [1, 0.8, 0] });

  // These rates really did trip the old airship gate and replace the route
  // with a zero-speed stabilization plan.
  const genericAssessment = assessVehicleTrajectory(
    ROUTE,
    0.4,
    sharpManoeuvre,
    NOSE,
    MODEL,
    GUIDANCE,
  );
  assert.equal(genericAssessment.upset, true);

  // They are inside the rotorcraft's own commanded manoeuvre envelope, so
  // the same common autopilot must leave the authored route in charge.
  const manoeuvreAssessment = assessVehicleTrajectory(
    ROUTE,
    0.4,
    sharpManoeuvre,
    NOSE,
    MODEL,
    hexacopterGuidance,
  );
  assert.equal(manoeuvreAssessment.upset, false);
  assert.equal(
    requestedVehicleTrajectoryMode(manoeuvreAssessment),
    "authoredRoute",
  );

  // The gate has not been disabled: rotation outside the machine passport is
  // still a genuine event owned by stabilization.
  const tumbling = assessVehicleTrajectory(
    ROUTE,
    0.4,
    state({ angularVelocity: [1.8, 1.4, 0] }),
    NOSE,
    MODEL,
    hexacopterGuidance,
  );
  assert.equal(tumbling.upset, true);
  assert.equal(requestedVehicleTrajectoryMode(tumbling), "stabilizing");
});

test("a vertical arrival is not corrected back onto its sloping route profile", () => {
  const hexacopter = airVehicles.find(({ id }) => id === "town-hexacopter");
  assert.ok(hexacopter);
  const plan = hexacopter.flight.routePlan("circuit", [0, 0, 0]);
  const guidance = guidanceFor(hexacopter);
  const model = { ...MODEL, limits: hexacopter.flight.limits };

  // The authored profile already slopes to the ground here, but the vertical
  // arrival deliberately holds the 24 m clearance shelf until the pad itself
  // is horizontally captured. That shelf is the route requirement now.
  const shelfProgress = 0.995;
  const shelfPoint = plan.point(shelfProgress);
  const onShelf = assessVehicleTrajectory(
    plan,
    shelfProgress,
    state({
      position: [shelfPoint[0], plan.verticalArrival.altitude, shelfPoint[2]],
      velocity: [0.3, 0, 0],
    }),
    hexacopter.nose,
    model,
    guidance,
  );
  assert.equal(onShelf.correctionRequired, false);
  assert.equal(requestedVehicleTrajectoryMode(onShelf), "authoredRoute");

  // Once horizontally captured, altitude belongs to the vertical landing
  // manoeuvre and its timeout, not to a route intercept back up the glide.
  const descending = assessVehicleTrajectory(
    plan,
    0.999,
    state({ position: [0.5, 12, 0], velocity: [0, -0.8, 0] }),
    hexacopter.nose,
    model,
    guidance,
  );
  assert.equal(descending.correctionRequired, false);
  assert.equal(requestedVehicleTrajectoryMode(descending), "authoredRoute");
});

test("a scheduled sternway pivot is never a deviation", () => {
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
    MODEL,
    GUIDANCE,
  );
  // Course and travel direction are the manoeuvre, not an error. Only being
  // physically unable to reach the next requirement is an error.
  assert.equal(reversed.correctionRequired, false);
  assert.equal(reversed.upset, false);
  assert.equal(
    requestedVehicleTrajectoryMode(reversed),
    "authoredRoute",
    "a scheduled sternway/forward pivot must stay in its authored mode",
  );
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

/** The same physical passport the runtime hands the autopilot. */
function physicalModel(vehicle, properties) {
  return {
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
}

function orientationForHeading(nose, heading) {
  const length = Math.hypot(nose[0], nose[2]) || 1;
  const local = [nose[0] / length, nose[2] / length];
  const yaw = Math.atan2(
    local[1] * heading[0] - local[0] * heading[1],
    local[0] * heading[0] + local[1] * heading[1],
  );
  return vehicleRotation({ position: [0, 0, 0], yaw, pitch: 0, roll: 0 }, nose);
}

test("autopilot takes the reachable long yaw after an asymmetric rotor failure", () => {
  const offset = 0.5;
  const heading = [Math.cos(offset), Math.sin(offset)];
  const piloted = autopilot(
    ROUTE,
    0.4,
    [40, 10, 0],
    orientationForHeading(NOSE, heading),
    [heading[0] * 2, 0, heading[1] * 2],
    [0, 0, 0],
    {
      ...MODEL,
      // The short positive turn is unavailable while the opposite spin group
      // still has authority. The route stays common; only this live physical
      // envelope comes from the rotor controller.
      yawRateLimits: { minimum: -0.4, maximum: 0.01 },
    },
    1,
    NOSE,
  );
  assert.equal(
    piloted.guidance.yawRate < -0.025,
    true,
    `autopilot kept asking for the unavailable sign: ${piloted.guidance.yawRate}`,
  );
  assert.equal(piloted.guidance.yawRate >= -0.4, true);
});

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
    physicalModel(vehicle, properties),
    guidanceFor(vehicle),
  );
  // Standing on the route line with the nose still on the previous manoeuvre
  // is the manoeuvre itself, not a deviation.
  assert.equal(assessment.correctionRequired, false);
  assert.equal(assessment.upset, false);
  assert.equal(requestedVehicleTrajectoryMode(assessment), "authoredRoute");
});

test("every authored air vehicle can construct a moving route intercept", () => {
  const pieces = [
    ...grandTerminalScene.breakablePieces,
    ...vikingVillageScene.breakablePieces,
    ...townScene.breakablePieces,
    ...nimbusScene.breakablePieces,
    ...basaltStrongholdScene.breakablePieces,
    // Боевой полигон: RAX-8 живёт в собственной сцене, и с момента регистрации
    // машины в общем реестре её мир обязан участвовать в перекрёстных тестах.
    ...combatHexacopterRangeScene.breakablePieces,
    // Островной аэропорт: DC-3 попал в общий реестр, значит и его мир обязан
    // участвовать в перекрёстных проверках — по тому же правилу, что и полигон.
    ...islandAirportScene.breakablePieces,
    // Каллур: дирижабль острова отдыха — в реестре, его мир участвует тоже.
    ...kallurScene.breakablePieces,
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
    const guidance = guidanceFor(vehicle);
    const { departure, cruise, approach, upsetEntry, upsetExit, merge } =
      guidance;
    for (const [name, corridor] of [
      ["departure", departure],
      ["cruise", cruise],
      ["approach", approach],
    ]) {
      assert.equal(
        corridor.crossTrack < failure.maximumCrossTrackError,
        true,
        `${vehicle.id}: ${name} cross-track ${corridor.crossTrack} is not inside ${failure.maximumCrossTrackError}`,
      );
      assert.equal(
        corridor.altitude < failure.maximumAltitudeError,
        true,
        `${vehicle.id}: ${name} altitude ${corridor.altitude} is not inside ${failure.maximumAltitudeError}`,
      );
    }
    // Stages are ordered: arriving is the strictest requirement a route has.
    assert.equal(approach.crossTrack < cruise.crossTrack, true);
    assert.equal(cruise.crossTrack <= departure.crossTrack, true);
    assert.equal(approach.altitude < cruise.altitude, true);
    assert.equal(guidance.flyableTilt < tiltCeiling, true);

    // An upset is a rate event well above ordinary pendulum motion, and it is
    // left with hysteresis so the mode cannot chatter.
    assert.equal(upsetEntry.tiltRate > 0.4, true);
    assert.equal(upsetExit.tiltRate < upsetEntry.tiltRate, true);
    assert.equal(upsetExit.yawRate < upsetEntry.yawRate, true);
    assert.equal(
      merge.position < vehicle.flight.approach.tolerance.position,
      true,
    );
    assert.equal(merge.heading < vehicle.flight.approach.tolerance.heading, true);
  }
});

test("corridor and merge tolerances belong to the machine passport", () => {
  const town = airVehicles.find(({ id }) => id === "town-airship");
  const ram = airVehicles.find(({ id }) => id === "basalt-sky-ram");
  assert.ok(town && ram);
  const townGuidance = guidanceFor(town);
  const ramGuidance = guidanceFor(ram);
  // The stronghold's wider approach gate reaches both the corridor it must
  // arrive in and the gate it rejoins the line through.
  assert.equal(
    ramGuidance.approach.crossTrack > townGuidance.approach.crossTrack,
    true,
    "the approach corridor did not follow each machine's approach gate",
  );
  assert.equal(
    ramGuidance.merge.position > townGuidance.merge.position,
    true,
    "the merge gate did not follow each machine's approach gate",
  );

  const tightened = vehicleGuidanceEnvelope(
    DEFAULT_VEHICLE_FAILURE_ENVELOPE,
    town.flight.approach,
    town.flight.limits,
    { corridorScale: 0.5, mergeScale: 0.5 },
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
});

test("a burst of machine-gun fire on final is corrected, not fought over", () => {
  const vehicle = airVehicles.find(({ id }) => id === "sky-train");
  assert.ok(vehicle);
  const pieces = grandTerminalScene.breakablePieces.filter(
    (piece) => piece.clusterId === vehicle.clusterId,
  );
  const properties = massProperties(
    pieces,
    (material) => structuralMaterialProfiles[material].density,
  );
  const model = physicalModel(vehicle, properties);
  const guidance = guidanceFor(vehicle);
  const plan = vehicle.flight.routePlan("circuit", properties.centre);
  const startProgress = Math.min(0.985, plan.finalFrom + 0.01);
  const routePoint = plan.point(startProgress);
  const heading = vehicleRouteHeading(plan, startProgress);
  let body = {
    ...RESTING_BODY,
    position: [...routePoint],
    orientation: orientationForHeading(vehicle.nose, heading),
    velocity: [heading[0] * 2.4, 0, heading[1] * 2.4],
  };

  // Twenty rounds into the hull over two seconds. Each one is a small lateral
  // shove and a small kick in roll and yaw — nothing that threatens the
  // structure, exactly the case that used to send the ship into a hold.
  const rounds = 20;
  for (let round = 0; round < rounds; round += 1) {
    body = {
      ...body,
      velocity: [
        body.velocity[0] - heading[1] * 0.045,
        body.velocity[1],
        body.velocity[2] + heading[0] * 0.045,
      ],
      angularVelocity: [
        body.angularVelocity[0] + 0.012,
        body.angularVelocity[1] + 0.006,
        body.angularVelocity[2] + 0.009,
      ],
    };
  }

  const dt = 1 / 60;
  let mode = "authoredRoute";
  let correction = null;
  let correctionProgress = 0;
  let elapsedInMode = 0;
  let progress = startProgress;
  let transitions = 0;
  let holdSeconds = 0;
  let worstCrossTrack = 0;
  for (let step = 0; step < 60 * 90; step += 1) {
    const navigation = {
      position: body.position,
      orientation: body.orientation,
      velocity: body.velocity,
      angularVelocity: body.angularVelocity,
    };
    const assessment = assessVehicleTrajectory(
      plan,
      progress,
      navigation,
      vehicle.nose,
      model,
      guidance,
    );
    worstCrossTrack = Math.max(worstCrossTrack, assessment.crossTrackError);
    const requested = requestedVehicleTrajectoryMode(assessment);
    elapsedInMode += dt;

    if (mode === "authoredRoute" && requested !== "authoredRoute") {
      const planned =
        requested === "intercepting"
          ? planVehicleTrajectoryCorrection(
              plan,
              progress,
              navigation,
              model,
              vehicle.nose,
            )
          : null;
      if (requested === "stabilizing" || planned) {
        mode = planned ? "intercepting" : "stabilizing";
        correction = planned;
        correctionProgress = 0;
        elapsedInMode = 0;
        transitions += 1;
      }
    } else if (mode === "intercepting" && assessment.upset && elapsedInMode > 4) {
      mode = "stabilizing";
      correction = null;
      elapsedInMode = 0;
      transitions += 1;
    } else if (mode === "stabilizing" && vehicleUpsetSettled(navigation, guidance)) {
      mode = "authoredRoute";
      elapsedInMode = 0;
      transitions += 1;
    }
    if (mode === "stabilizing") holdSeconds += dt;

    const flown =
      mode === "intercepting" && correction
        ? correction.plan
        : mode === "stabilizing"
          ? vehicleTrajectoryStabilizationPlan(
              plan,
              progress,
              navigation,
              vehicle.nose,
            )
          : plan;
    const flownProgress = mode === "intercepting" ? correctionProgress : progress;
    const piloted = autopilot(
      flown,
      flownProgress,
      body.position,
      body.orientation,
      body.velocity,
      body.angularVelocity,
      model,
      1,
      vehicle.nose,
      vehicle.flight.approach,
    );
    const forward = rotateVector(body.orientation, vehicle.nose);
    const flat = Math.hypot(forward[0], forward[2]) || 1;
    const craftHeading = [forward[0] / flat, forward[2] / flat];
    const forces = [
      { force: hullDrag(body.velocity, craftHeading, model), point: body.position },
      ...shipForces(
        piloted.controls,
        body.position,
        properties.centre,
        body.orientation,
        vehicle.flight.limits,
        vehicle.nose,
        Math.hypot(body.velocity[0], body.velocity[2]),
      ),
    ];
    body = stepBody(body, properties, forces, { linear: 0, angular: model.dragAngular }, dt);
    const travelled = Math.hypot(body.velocity[0], body.velocity[2]) * dt;
    if (mode === "intercepting" && correction) {
      correctionProgress = advanceVehicleRouteProgress(
        correction.plan,
        correctionProgress,
        body.position,
        travelled,
      );
      const rejoin = rejoinVehicleRouteProgress(
        plan,
        correction.mergeProgress,
        body.position,
        0.04,
        0.12,
      );
      if (
        correctionProgress >= 0.8 &&
        vehicleTrajectoryMergeReady(plan, rejoin, navigation, vehicle.nose, guidance)
      ) {
        progress = rejoin;
        mode = "authoredRoute";
        correction = null;
        elapsedInMode = 0;
        transitions += 1;
      }
    } else if (mode === "authoredRoute") {
      progress = advanceVehicleRouteProgress(plan, progress, body.position, travelled);
    }
  }

  assert.equal(
    holdSeconds < 1,
    true,
    `bullets are not an upset: the ship held for ${holdSeconds.toFixed(1)} s`,
  );
  assert.equal(
    transitions <= 2,
    true,
    `the autopilot changed mode ${transitions} times instead of correcting`,
  );
  assert.equal(
    worstCrossTrack < guidance.cruise.crossTrack,
    true,
    `the burst pushed the ship ${worstCrossTrack.toFixed(1)} m off the line`,
  );
});

test("the watchdog is told what cannot be fixed, not how far the push was", () => {
  const vehicle = airVehicles.find(({ id }) => id === "sky-train");
  const pieces = grandTerminalScene.breakablePieces.filter(
    (piece) => piece.clusterId === vehicle.clusterId,
  );
  const properties = massProperties(
    pieces,
    (material) => structuralMaterialProfiles[material].density,
  );
  const model = physicalModel(vehicle, properties);
  const guidance = guidanceFor(vehicle);
  const plan = vehicle.flight.routePlan("circuit", properties.centre);

  // Mid-circuit, thirty-five metres off the line: further than the failure
  // envelope's own limit, and still a non-event, because there are hundreds
  // of metres in which ordinary turning removes it.
  const midProgress = Math.max(0.15, plan.finalFrom - 0.3);
  const routePoint = plan.point(midProgress);
  const heading = vehicleRouteHeading(plan, midProgress);
  const pushed = {
    position: [
      routePoint[0] - heading[1] * 35,
      routePoint[1],
      routePoint[2] + heading[0] * 35,
    ],
    orientation: orientationForHeading(vehicle.nose, heading),
    velocity: [heading[0] * 3, 0, heading[1] * 3],
    angularVelocity: [0, 0, 0],
  };
  const cruise = assessVehicleTrajectory(
    plan,
    midProgress,
    pushed,
    vehicle.nose,
    model,
    guidance,
  );
  const recoverable = vehicleUnrecoverableDeviation(cruise, 35, 6);
  assert.equal(recoverable.crossTrack, 0);
  assert.equal(recoverable.altitude, 0);
  assert.equal(
    recoverable.crossTrack < DEFAULT_VEHICLE_FAILURE_ENVELOPE.maximumCrossTrackError,
    true,
    "a deviation guidance owns must never reach the watchdog as a divergence",
  );

  // The same craft with no route left to fix it in: the residual is real.
  const stranded = {
    ...cruise,
    reachableClosure: 4,
    reachableAltitudeClosure: 1,
  };
  const unrecoverable = vehicleUnrecoverableDeviation(stranded, 35, -6);
  assert.equal(unrecoverable.crossTrack, 31);
  assert.equal(unrecoverable.altitude, -5);
  assert.equal(
    unrecoverable.crossTrack >
      DEFAULT_VEHICLE_FAILURE_ENVELOPE.maximumCrossTrackError,
    true,
  );
});

test("time to return is taken from the plan that has to be flown", () => {
  const grace = DEFAULT_VEHICLE_FAILURE_ENVELOPE.correctionGraceSeconds;
  // A hold is short by nature; it is not a manoeuvre.
  assert.equal(
    vehicleCorrectionAllowanceSeconds(null, grace),
    VEHICLE_HOLD_ALLOWANCE_SECONDS,
  );

  const long = {
    plan: { length: 120, speedLimit: () => 2 },
    mergeProgress: 0.5,
    countsAsGoAround: false,
  };
  // 120 m at 2 m/s is a minute of honest flying; it gets twice that, capped
  // by the flight-wide grace budget rather than by a hand-picked constant.
  assert.equal(vehicleCorrectionAllowanceSeconds(long, grace), grace);
  assert.equal(vehicleCorrectionAllowanceSeconds(long, 300), 120);

  // An ordinary intercept gets exactly what its own geometry asks for.
  const ordinary = {
    plan: { length: 16, speedLimit: () => 2.5 },
    mergeProgress: 0.9,
    countsAsGoAround: true,
  };
  assert.equal(vehicleCorrectionAllowanceSeconds(ordinary, grace), 12.8);

  // A very short one still gets the floor: it must not be cut off mid-turn.
  const tiny = {
    plan: { length: 8, speedLimit: () => 2.5 },
    mergeProgress: 0.95,
    countsAsGoAround: true,
  };
  assert.equal(
    vehicleCorrectionAllowanceSeconds(tiny, grace),
    VEHICLE_HOLD_ALLOWANCE_SECONDS,
  );
});


// ---------------------------------------------------------------------------
// ПЛАН КОРРЕКЦИИ НЕ БЫВАЕТ МЕДЛЕННЕЕ ЛЁТНОЙ СКОРОСТИ
// ---------------------------------------------------------------------------

test("a wing machine is never handed a correction plan below flying speed", () => {
  // Полка коррекции 1.8–5.5 м/с написана для машин, которые умеют так лететь.
  // Крылатая — не умеет: её автомат не отдаёт ход ниже полутора скоростей
  // сваливания, и план на 5.5 м/с для неё неисполним ПО ПОСТРОЕНИЮ. Живой
  // замер: машина ушла в «возвращаюсь на трассу» у входа в посадочный
  // разворот и не прибыла никогда — условие слияния ждало её на скорости,
  // на которой она падает, а не летит.
  const dc3 = airVehicles.find((vehicle) => vehicle.flight.airplane !== undefined && vehicle.flight.liftSource === "wing");
  assert.ok(dc3, "DC-3 не найден в каталоге воздушных машин");
  const minimum = dc3.flight.limits.minimumSpeed;
  assert.ok(
    minimum > dc3.flight.airplane.stallSpeedFlaps,
    "крылатая машина обязана объявлять минимальную лётную скорость выше сваливания",
  );
  const berth = [-66, 0.29, -22];
  const plan = dc3.flight.routePlan("survey", berth);
  const model = {
    ...MODEL,
    limits: dc3.flight.limits,
    turnCapability: {
      yawRate: 0.19,
      lateralAcceleration: 8.2,
      braking: 2.6,
      responseSeconds: 3.4,
    },
  };
  // Машина в крейсере, снесена вбок на сорок метров у входа в разворот.
  const progress = 0.86;
  const at = plan.point(progress);
  const correction = planVehicleTrajectoryCorrection(
    plan,
    progress,
    state({
      position: [at[0] + 40, at[1] - 6, at[2] + 25],
      velocity: [40, 0, 8],
    }),
    model,
    NOSE,
  );
  assert.ok(correction, "коррекция для крылатой машины обязана строиться");
  for (let step = 0; step <= 20; step += 1) {
    const speed = correction.plan.speedLimit(step / 20);
    assert.ok(
      speed >= minimum - 0.01,
      `план коррекции просит ${speed.toFixed(1)} м/с на ${(step * 5)}% — ниже лётной ${minimum.toFixed(1)}`,
    );
  }
});


test("the corrector is never stricter than the authored corridor", () => {
  // Точность — свойство участка: трасса объявляет коридор, и сторож отказов
  // его читает. Корректор судил по собственному конверту (20 м на крейсере)
  // и на площадке перед створом, где трасса разрешает полсотни метров под
  // выход из разворота, забирал машину с маршрута за штатный остаток сноса.
  // Живой замер: DC-3 уходил в «возвращаюсь на трассу» на 92% рейса, летя
  // нормально.
  const widePlan = {
    ...ROUTE,
    finalFrom: 0.94,
    corridor: () => 55,
  };
  const at = widePlan.point(0.92);
  const off = state({
    position: [at[0], at[1], at[2] + 35],
    velocity: [40, 0, 0],
  });
  const wide = assessVehicleTrajectory(widePlan, 0.92, off, NOSE, MODEL, GUIDANCE);
  assert.equal(
    wide.correctionRequired,
    false,
    `штатный снос ${wide.crossTrackError.toFixed(0)} м внутри авторских 55 м — корректору тут делать нечего`,
  );
  // Контроль: без авторского коридора тот же снос у ворот — повод для ухода.
  const bare = assessVehicleTrajectory(
    { ...ROUTE, finalFrom: 0.94 },
    0.92,
    off,
    NOSE,
    MODEL,
    GUIDANCE,
  );
  assert.equal(bare.correctionRequired, true);
});
