import assert from "node:assert/strict";
import test from "node:test";
import {
  SKY_LONGSHIP_AIR_VEHICLE,
  airVehicleFlightEventState,
  isInsideLongship,
} from "../games/make-a-mess/src/game/airVehicles.ts";
import {
  applyMatrix,
  RESTING_BODY,
  massProperties,
  rotationMatrixFromEuler,
  stepBody,
} from "../games/make-a-mess/src/game/clusterDynamics.ts";
import { compoundClusterColliders } from "../games/make-a-mess/src/game/compoundKinematicCluster.ts";
import { structuralMaterialProfiles } from "../games/make-a-mess/src/game/destructionScene.ts";
import {
  advanceDrivePhase,
  advanceVehicleRouteProgress,
  autopilot,
  hullDrag,
  isDockedPose,
  isMooringCaptureEligible,
  mooringForce,
  oarStrokePose,
  pitchAxisOf,
  rotateVector,
  shipForces,
  vehicleFrameForCluster,
  vehicleMooringState,
} from "../games/make-a-mess/src/game/vehicleFrames.ts";
import { vikingVillageScene } from "../games/make-a-mess/src/game/vikingVillageScene.ts";
import {
  vikingLongshipTourPhase,
  vikingLongshipTourRoute,
} from "../games/make-a-mess/src/game/vikingLongshipRoutes.ts";

const SHIP = "viking-village:sky-longship";
const DOCK = "viking-village:sky-longship-dock";
const densityOf = (material) => structuralMaterialProfiles[material].density;
const ship = vikingVillageScene.breakablePieces.filter(
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

test("the longship flies as one compound object while its berth stays ashore", () => {
  const frame = vehicleFrameForCluster(SHIP);
  const dock = vikingVillageScene.breakablePieces.filter(
    (piece) => piece.clusterId === DOCK,
  );
  const colliders = compoundClusterColliders(frame, ship, new Set());

  assert.equal(ship.length, 349);
  assert.equal(dock.length, 13);
  // Ten shafts and ten blades articulate on their own bodies; the rigid hull
  // keeps every oarlock but does not retain twenty ghost oar colliders.
  assert.equal(colliders.length, ship.length - 20);
  assert.equal(
    ship.some((piece) => /bow-line|moor-line|buoy|spring-line|:brow:/.test(piece.id)),
    false,
  );
  assert.equal(
    dock.every((piece) => /bow-line|mooring-cleat|moor-line|buoy|spring-line|:brow:/.test(piece.id)),
    true,
  );
});

test("the authored longship is honestly balanced below its lift heart", () => {
  const frame = vehicleFrameForCluster(SHIP);
  const mass = massProperties(ship, densityOf);
  const horizontalOffset = Math.hypot(
    mass.centre[0] - frame.liftCentre[0],
    mass.centre[2] - frame.liftCentre[2],
  );

  assert.equal(horizontalOffset < 0.1, true, `${horizontalOffset.toFixed(3)} m`);
  assert.equal(
    frame.liftCentre[1] - mass.centre[1] > 2.3,
    true,
    "the lift heart must hang the hull as a pendulum",
  );
  assert.equal(mass.mass > 55 && mass.mass < 60, true, `${mass.mass.toFixed(2)}`);
});

test("asymmetric damage moves the live centre of mass away from intact trim", () => {
  const intact = massProperties(ship, densityOf);
  const withoutPortShields = massProperties(
    ship.filter(
      (piece) => !/:shield:[0-4]:/.test(piece.id),
    ),
    densityOf,
  );
  const shift = Math.hypot(
    withoutPortShields.centre[0] - intact.centre[0],
    withoutPortShields.centre[2] - intact.centre[2],
  );

  assert.equal(shift > 0.1, true, `${shift.toFixed(3)} m`);
  assert.equal(
    withoutPortShields.centre[2] > intact.centre[2],
    true,
    "losing the port shields must pull the live balance toward starboard",
  );
});

test("both oar banks and the steering oar are real breakable actuators", () => {
  const port = ship.filter(
    (piece) => piece.actuator?.commandChannel === "throttle:0",
  );
  const starboard = ship.filter(
    (piece) => piece.actuator?.commandChannel === "throttle:1",
  );
  const rudder = ship.filter(
    (piece) => piece.actuator?.commandChannel === "rudder",
  );

  assert.equal(port.length, 5);
  assert.equal(starboard.length, 5);
  assert.equal(rudder.length, 1);
  assert.equal(SKY_LONGSHIP_AIR_VEHICLE.flight.limits.enginePoints.length, 2);
});

test("every flying oar has an inboard handle and a physical oarlock", () => {
  const frame = vehicleFrameForCluster(SHIP);
  const starboard = pitchAxisOf(frame.nose);
  const lateral = (point) =>
    (point[0] - frame.origin[0]) * starboard[0] +
    (point[2] - frame.origin[2]) * starboard[2];
  const shafts = ship.filter((piece) => /:oar:-?1:\d+:piece$/.test(piece.id));
  const blades = ship.filter((piece) => /:oar:-?1:\d+:blade:piece$/.test(piece.id));
  const pivots = ship.filter((piece) => /:oarlock:-?1:\d+:pivot:piece$/.test(piece.id));

  assert.equal(shafts.length, 10);
  assert.equal(blades.length, 10);
  assert.equal(pivots.length, 10);
  assert.deepEqual(frame.independentMemberMatches, [":oar:-1:", ":oar:1:"]);

  for (const shaft of shafts) {
    const match = shaft.id.match(/:oar:(-1|1):(\d+):piece$/);
    assert.ok(match);
    const side = Number(match[1]);
    const index = Number(match[2]);
    const pivot = ship.find((piece) =>
      piece.id.endsWith(`:oarlock:${side}:${index}:pivot:piece`),
    );
    const pins = ship.filter((piece) =>
      piece.id.includes(`:oarlock:${side}:${index}:pin:`),
    );
    assert.ok(pivot);
    assert.equal(pins.length, 2);

    const halfAxis = applyMatrix(
      rotationMatrixFromEuler(shaft.rotation ?? [0, 0, 0]),
      [0, shaft.size[1] / 2, 0],
    );
    const ends = [-1, 1].map((direction) => [
      shaft.position[0] + halfAxis[0] * direction,
      shaft.position[1] + halfAxis[1] * direction,
      shaft.position[2] + halfAxis[2] * direction,
    ]);
    const [handle, outboard] = ends.sort(
      (left, right) => Math.abs(lateral(left)) - Math.abs(lateral(right)),
    );
    assert.equal(
      Math.abs(lateral(handle)) < Math.abs(lateral(pivot.position)) - 0.7,
      true,
      `${shaft.id}: handle must reach well inside the oarlock`,
    );
    assert.equal(
      Math.abs(lateral(outboard)) > Math.abs(lateral(pivot.position)) + 1.7,
      true,
      `${shaft.id}: working loom must remain outside the hull`,
    );
  }
});

test("the loaded pull is slow, the recovery is lifted and each bank follows its engine", () => {
  const drive = SKY_LONGSHIP_AIR_VEHICLE.flight.driveAnimation;
  assert.equal(drive.kind, "oars");

  const catchPose = oarStrokePose(0);
  const middleOfPull = oarStrokePose(Math.PI * 2 * 0.31);
  const endOfPull = oarStrokePose(Math.PI * 2 * 0.62);
  const middleOfRecovery = oarStrokePose(Math.PI * 2 * 0.81);
  assert.equal(catchPose.sweep, -1);
  assert.equal(catchPose.feather, 0);
  assert.equal(Math.abs(middleOfPull.sweep) < 1e-9, true);
  assert.equal(middleOfPull.lift < -0.99, true);
  assert.equal(endOfPull.sweep, 1);
  assert.equal(middleOfRecovery.lift > 0.99, true);
  assert.equal(middleOfRecovery.feather > 0.99, true);

  const portPhase = advanceDrivePhase(0, drive.phaseSpeed, 0.25, 1);
  const starboardPhase = advanceDrivePhase(0, drive.phaseSpeed, 0.8, 1);
  assert.equal(starboardPhase > portPhase * 3, true);
  assert.equal(advanceDrivePhase(portPhase, drive.phaseSpeed, 0, 1), portPhase);
});

test("every longship light follows the moving carrier", () => {
  const lights = vikingVillageScene.lampDefinitions.filter((light) =>
    light.id.startsWith(`${SHIP}:`),
  );
  assert.equal(lights.length, 4);
  assert.equal(lights.every((light) => light.carrierClusterId === SHIP), true);
});

test("the jetty rope coil launches the shared scheduled lifecycle", () => {
  const departure = SKY_LONGSHIP_AIR_VEHICLE.departure;
  const ropeCoil = vikingVillageScene.breakablePieces.find(
    (piece) => piece.id === "viking-village:fjord-jetty:rope-coil:piece",
  );
  assert.ok(departure);
  assert.ok(ropeCoil);
  assert.equal(departure.target.kind, "departure");
  assert.equal(departure.target.cue, "viking-uncrewed-flight");
  assert.equal(departure.flightKind, "circuit");
  assert.equal(
    Math.hypot(
      departure.point[0] - ropeCoil.position[0],
      departure.point[2] - ropeCoil.position[2],
    ) < 0.05,
    true,
  );

  assert.equal(airVehicleFlightEventState(SKY_LONGSHIP_AIR_VEHICLE, null), "docked");
  assert.equal(
    airVehicleFlightEventState(SKY_LONGSHIP_AIR_VEHICLE, {
      kind: "circuit", time: 1, castOff: false, progress: 0,
    }),
    "attention",
  );
  assert.equal(
    airVehicleFlightEventState(SKY_LONGSHIP_AIR_VEHICLE, {
      kind: "circuit", time: 20, castOff: true, progress: 0.5,
    }),
    "cruise",
  );
});

test("the passenger flight can only be called from inside the longship", () => {
  const passengerFlight = SKY_LONGSHIP_AIR_VEHICLE.passengerFlight;
  const departure = SKY_LONGSHIP_AIR_VEHICLE.departure;

  assert.ok(passengerFlight);
  assert.ok(departure);
  assert.equal(passengerFlight.target.kind, "ride");
  assert.equal(passengerFlight.target.cue, "viking-passenger-flight");
  assert.equal(passengerFlight.flightKind, "tour");
  assert.equal(passengerFlight.contains(passengerFlight.point), true);
  const fromCentre = [
    passengerFlight.point[0] - SKY_LONGSHIP_AIR_VEHICLE.origin[0],
    passengerFlight.point[2] - SKY_LONGSHIP_AIR_VEHICLE.origin[2],
  ];
  assert.equal(
    fromCentre[0] * SKY_LONGSHIP_AIR_VEHICLE.nose[0] +
      fromCentre[1] * SKY_LONGSHIP_AIR_VEHICLE.nose[2] > 3.5,
    true,
    "the passenger call must be on the bow side of the sail",
  );
  const sail = ship.find((piece) => piece.id.endsWith(":sail:panel:1:piece"));
  assert.ok(sail);
  const inertialRunToSail = [
    sail.position[0] - passengerFlight.point[0],
    sail.position[2] - passengerFlight.point[2],
  ];
  assert.equal(
    inertialRunToSail[0] * -SKY_LONGSHIP_AIR_VEHICLE.nose[0] +
      inertialRunToSail[1] * -SKY_LONGSHIP_AIR_VEHICLE.nose[2] > 3.5,
    true,
    "forward acceleration must carry the passenger aft into the sail",
  );
  assert.equal(isInsideLongship([8.25, 2.42, -102.5]), true);
  assert.equal(isInsideLongship([8.25, 2.42, -99]), false);
  assert.equal(
    Math.hypot(
      passengerFlight.point[0] - departure.point[0],
      passengerFlight.point[2] - departure.point[2],
    ) > passengerFlight.releaseRadius,
    true,
    "the pier call must not overlap the onboard call",
  );
});

test("both longship flights and an overboard passenger fit inside the larger viewing world", () => {
  const properties = massProperties(ship, densityOf);
  const boundary = vikingVillageScene.boundaryRadius;
  const sky = vikingVillageScene.skyRadius;
  assert.ok(boundary);
  assert.ok(sky);
  let farthestRoutePoint = 0;

  for (const kind of ["circuit", "tour"]) {
    const plan = SKY_LONGSHIP_AIR_VEHICLE.flight.routePlan(kind, properties.centre);
    for (let sample = 0; sample <= 1000; sample += 1) {
      const point = plan.point(sample / 1000);
      farthestRoutePoint = Math.max(
        farthestRoutePoint,
        Math.hypot(
          point[0] - vikingVillageScene.worldCenter[0],
          point[2] - vikingVillageScene.worldCenter[1],
        ),
      );
    }
  }

  assert.equal(farthestRoutePoint + 30 < boundary, true);
  assert.equal(boundary + 60 <= sky, true);
  assert.equal(
    farthestRoutePoint + sky + 40 <= vikingVillageScene.cameraFar,
    true,
    "the camera must see the atmosphere beyond the opposite side of the route",
  );
});

test("the passenger route is an uneven counter-clockwise tour with a reverse docking arc", () => {
  const route = vikingLongshipTourRoute();
  const start = route.point(0);
  const end = route.point(1);
  const pierPass = route.point(route.nodeProgress("pier-pass"));
  const reverseArc = route.point(route.nodeProgress("reverse-arc"));
  const finalEntry = route.point(route.nodeProgress("final-entry"));
  let signedArea = 0;
  let previous = start;
  for (let sample = 1; sample <= 256; sample += 1) {
    const point = route.point(sample / 256);
    signedArea += previous[0] * point[2] - point[0] * previous[2];
    previous = point;
  }

  assert.deepEqual(start, [0, 0, 0]);
  assert.deepEqual(end, [0, 0, 0]);
  assert.equal(signedArea > 0, true, "the island circuit must run counter-clockwise");
  assert.equal(route.length > 850, true, `${route.length.toFixed(1)} m`);
  assert.equal(pierPass[0] < 0 && pierPass[2] < 0, true);
  assert.equal(reverseArc[0] > 0 && reverseArc[2] < pierPass[2], true);
  assert.equal(finalEntry[0] > reverseArc[0] && finalEntry[2] === 0, true);
  assert.equal(vikingLongshipTourPhase(route.nodeProgress("departure-turn")), "departure");
  assert.equal(vikingLongshipTourPhase(route.nodeProgress("east")), "cruise");
  assert.equal(vikingLongshipTourPhase(route.nodeProgress("pier-pass")), "approach");
});

test("the village circuit returns from the right on the authored berth course", () => {
  const mass = massProperties(ship, densityOf);
  const plan = SKY_LONGSHIP_AIR_VEHICLE.flight.routePlan("circuit", mass.centre);
  const start = plan.point(0);
  const end = plan.point(1);
  const before = plan.point(Math.max(plan.finalFrom, 0.94));
  const finalRun = [end[0] - before[0], end[2] - before[2]];
  const finalLength = Math.hypot(...finalRun);
  const nose = SKY_LONGSHIP_AIR_VEHICLE.nose;

  assert.equal(Math.hypot(start[0] - mass.centre[0], start[2] - mass.centre[2]) < 1e-9, true);
  assert.equal(Math.hypot(end[0] - mass.centre[0], end[2] - mass.centre[2]) < 1e-9, true);
  assert.equal(before[0] - mass.centre[0] > 30, true, "final must enter from the right/east");
  assert.equal(
    (finalRun[0] * nose[0] + finalRun[1] * nose[2]) / finalLength > 0.995,
    true,
    "the final tangent must match the longship nose",
  );
});

for (const kind of ["circuit", "tour"]) {
test(`the longship flies the shared ${kind} force route and physically docks`, () => {
  const vehicle = SKY_LONGSHIP_AIR_VEHICLE;
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
  let goArounds = 0;
  let lastGoAround = -1e9;
  let maxRouteError = 0;

  const maximumFlightSeconds = kind === "tour" ? 240 : 180;
  for (let step = 0; step < 60 * maximumFlightSeconds; step += 1) {
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
    const speed = Math.hypot(state.velocity[0], state.velocity[2]);
    progress = advanceVehicleRouteProgress(
      plan,
      progress,
      state.position,
      speed * dt,
    );
    const route = plan.point(progress);
    maxRouteError = Math.max(
      maxRouteError,
      Math.hypot(state.position[0] - route[0], state.position[2] - route[2]),
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
    `progress ${(progress * 100).toFixed(3)}%, capture ${capture.offset.map((value) => value.toFixed(2)).join(", ")}, velocity ${capture.velocity.map((value) => value.toFixed(3)).join(", ")}, angular ${state.angularVelocity.map((value) => value.toFixed(3)).join(", ")}`,
  );
  assert.equal(maxRouteError < 15, true, `${maxRouteError.toFixed(1)} m`);
  assert.equal(goArounds, 0);
});
}
