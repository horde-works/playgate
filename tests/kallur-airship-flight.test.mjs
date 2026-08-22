import assert from "node:assert/strict";
import test from "node:test";
import {
  KALLUR_AIRSHIP_AIR_VEHICLE,
} from "../games/make-a-mess/src/game/airVehicles.ts";
import {
  KALLUR_AIRSHIP_LIFT_LOCAL,
  KALLUR_AIRSHIP_ROLL_RAIL_LENGTH,
} from "../games/make-a-mess/src/game/kallurAirship.ts";
import {
  kallurAirshipHullRadius,
  KALLUR_AIRSHIP_AXIS_Y,
  KALLUR_AIRSHIP_LENGTH,
} from "../games/make-a-mess/src/content/objects/kallur/kallurAirshipObject.ts";
import {
  RESTING_BODY,
  massProperties,
  stepBody,
} from "../games/make-a-mess/src/game/clusterDynamics.ts";
import {
  compoundClusterColliders,
  compoundClusterOwnsPiece,
} from "../games/make-a-mess/src/game/compoundKinematicCluster.ts";
import { structuralMaterialProfiles } from "../games/make-a-mess/src/game/destructionScene.ts";
import {
  compileCommandActuators,
  executeCommandActuators,
} from "../games/make-a-mess/src/game/vehicleActuation.ts";
import {
  advanceVehicleRouteProgress,
  autopilot,
  hullDrag,
  isMooringCaptureEligible,
  isPlatformDockingComplete,
  mooringForce,
  rotateVector,
  shipForces,
  vehicleFrameForCluster,
  vehiclePlatformDockState,
  vehicleRotation,
} from "../games/make-a-mess/src/game/vehicleFrames.ts";
import { vehicleFlightTargetPost } from "../games/make-a-mess/src/game/vehicleDepartureBoard.ts";
import { kallurScene } from "../games/make-a-mess/src/game/kallurScene.ts";
import {
  KALLUR_AIRSHIP_SHORE_YAW,
  KALLUR_AIRSHIP_YAW,
} from "../games/make-a-mess/src/game/kallurAirshipRoutes.ts";

const CLUSTER = "kallur:airship";
const densityOf = (material) => structuralMaterialProfiles[material].density;
const ship = kallurScene.breakablePieces.filter(
  (piece) => piece.clusterId === CLUSTER,
);

test("the kallur airship is one compound carrier whose blades are kinematic members", () => {
  const frame = vehicleFrameForCluster(CLUSTER);
  assert.equal(frame?.id, "kallur-airship");
  const colliders = compoundClusterColliders(frame, ship, new Set());
  assert.equal(
    colliders.some((collider) => collider.sourceId.includes(":blade:")),
    false,
    "animated propellers must not have a second rigid pose owner",
  );
  const blades = ship.filter((piece) => /:engine:-?1:blade:/.test(piece.id));
  assert.equal(blades.length, 4);
  for (const blade of blades) {
    assert.match(blade.id, /:engine:-?1:blade:-?1:piece$/);
  }
  assert.deepEqual(frame.independentMemberMatches, [":blade:", ":car:"]);
  const rails = ship.filter((piece) => piece.id.includes(":rail:"));
  const cars = ship.filter((piece) => piece.id.includes(":car:"));
  assert.equal(rails.length, 2);
  assert.equal(cars.length, 2);
  for (const rail of rails) {
    assert.equal(compoundClusterOwnsPiece(frame, rail), true, rail.id);
  }
  for (const car of cars) {
    assert.equal(compoundClusterOwnsPiece(frame, car), false, car.id);
  }
});

test("the roll trim rail stays inside the envelope", () => {
  const rail = ship.find((piece) => piece.id.includes("trim:roll:rail"));
  assert.ok(rail);
  assert.ok(Math.abs(rail.size[1] - KALLUR_AIRSHIP_ROLL_RAIL_LENGTH) < 1e-6);
  const half = rail.size[1] / 2;
  const y = KALLUR_AIRSHIP_AXIS_Y - 0.34;
  const z = KALLUR_AIRSHIP_LIFT_LOCAL[2];
  const hull = kallurAirshipHullRadius(KALLUR_AIRSHIP_LENGTH / 2 - z);
  const skin = Math.sqrt(Math.max(0, hull * hull - (y - KALLUR_AIRSHIP_AXIS_Y) ** 2));
  assert.ok(half < skin - 0.1,
    `roll rail half ${half.toFixed(3)} m pokes past the skin at ${skin.toFixed(3)} m`);
});

test("both propellers and the tail are real breakable control channels", () => {
  const bindings = compileCommandActuators(ship);
  assert.deepEqual(
    bindings.map((binding) => binding.commandChannel).sort(),
    ["rudder", "throttle:0", "throttle:1", "trim:pitch", "trim:roll"],
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
  assert.equal(portBlades.length, 2);
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
});

test("the measured mass hangs under the authored lift heart", () => {
  const vehicle = KALLUR_AIRSHIP_AIR_VEHICLE;
  const properties = massProperties(ship, densityOf);
  const horizontalOffset = Math.hypot(
    properties.centre[0] - vehicle.liftCentre[0],
    properties.centre[2] - vehicle.liftCentre[2],
  );
  assert.equal(properties.mass > 30 && properties.mass < 50, true,
    `mass ${properties.mass.toFixed(2)}`);
  assert.equal(horizontalOffset < 0.1, true,
    `${horizontalOffset.toFixed(3)} m off the lift centre`);
  assert.equal(
    vehicle.liftCentre[1] - properties.centre[1] > 1,
    true,
    "the gondola must hang below the gas volume",
  );
  const thrust = vehicle.flight.limits.enginePower * 2;
  const g = thrust / (properties.mass * 9.81);
  assert.ok(g > 0.22 && g < 0.4,
    `thrust ${g.toFixed(2)} g is not an airship (town is 0.30)`);

  const posts = vehicle.departure.posts;
  const summit = posts.find((post) => post.id === "summit");
  assert.ok(
    Math.hypot(...properties.centre.map((value, axis) => value - summit.berth[axis])) < 0.01,
    "summit base is not the measured resting mass centre",
  );
  for (const kind of ["down", "up"]) {
    const target = vehicleFlightTargetPost(posts, kind);
    const end = vehicle.flight.routePlan(kind, properties.centre).point(1);
    assert.ok(
      Math.hypot(...end.map((value, axis) => value - target.berth[axis])) < 0.01,
      `${kind} route and ${target.id} base disagree`,
    );
  }
});

test("the rigid envelope has a distributed steel frame and no cloth physics", () => {
  const frame = ship.filter((piece) => piece.id.includes(":frame:"));
  assert.equal(frame.length, 10, `${frame.length} physical frame members`);
  assert.equal(frame.every((piece) => piece.material === "steel"), true);
  assert.equal(
    ship.some((piece) => piece.material === "cloth"),
    false,
    "the rigid Kallur envelope must not compile as a cloth balloon",
  );

  const properties = massProperties(ship, densityOf);
  const normalizedYawInertia = properties.inertia[4] / properties.mass;
  assert.ok(normalizedYawInertia > 10,
    `yaw inertia ${normalizedYawInertia.toFixed(2)} m² is still gondola-like`);
});

for (const kind of ["down", "up"]) {
  test(`the Kallur airship flies ${kind} on forces and settles on its skids`, (t) => {
    const vehicle = KALLUR_AIRSHIP_AIR_VEHICLE;
    const flight = vehicle.flight;
    const properties = massProperties(ship, densityOf);
    const targetBase = vehicleFlightTargetPost(vehicle.departure.posts, kind);
    assert.ok(targetBase?.docking, `${kind}: target base missing`);
    // The summit berth is the route anchor in both directions; the up leg
    // derives its shore start from it.
    const plan = flight.routePlan(kind, properties.centre);
    const start = plan.point(0);
    const yaw = kind === "down" ? 0 : KALLUR_AIRSHIP_SHORE_YAW - KALLUR_AIRSHIP_YAW;
    let state = {
      ...RESTING_BODY,
      position: [...start],
      orientation: vehicleRotation({ position: [0, 0, 0], yaw, pitch: 0, roll: 0 }),
    };
    const model = {
      mass: properties.mass,
      inertiaYaw: properties.inertia[4],
      bodyCentre: properties.centre,
      dragLinear: properties.mass * flight.linearDamping,
      dragLateral: properties.mass * flight.linearDamping * flight.lateralDragRatio,
      dragAngular: properties.inertia[4] * flight.angularDamping,
      limits: flight.limits,
    };
    const liftLocal = [
      vehicle.liftCentre[0] - properties.centre[0],
      vehicle.liftCentre[1] - properties.centre[1],
      vehicle.liftCentre[2] - properties.centre[2],
    ];
    const dt = 1 / 60;
    let progress = 0;
    let liftNow = properties.mass * 9.81;
    let docked = false;
    let maxRouteError = 0;
    let goArounds = 0;
    let lastGoAround = -1e9;

    for (let step = 0; step < 60 * 360 && !docked; step += 1) {
      const piloted = autopilot(
        plan,
        progress,
        state.position,
        state.orientation,
        state.velocity,
        state.angularVelocity,
        model,
        Math.min(1, step / (60 * flight.underwaySeconds)),
        vehicle.nose,
        targetBase.docking.approach,
      );
      if (piloted.goAround && step - lastGoAround > 60 * 20) {
        progress = 0;
        goArounds += 1;
        lastGoAround = step;
      }
      const neutralLift = properties.mass * 9.81;
      const liftTarget = neutralLift *
        (1 + piloted.controls.liftTrim * flight.limits.liftTrimRange);
      const liftRate = neutralLift * 0.25 * dt;
      liftNow += Math.max(-liftRate, Math.min(liftRate, liftTarget - liftNow));
      const liftArm = rotateVector(state.orientation, liftLocal);
      const forces = [
        { force: [0, -neutralLift, 0], point: state.position },
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
      const dock = vehiclePlatformDockState(
        state.position,
        state.velocity,
        targetBase.berth,
        targetBase.docking.approach,
      );
      if (
        progress > 0.9 &&
        isMooringCaptureEligible(
          dock.capture.offset,
          state.orientation,
          vehicle.nose,
          dock.approach,
          flight.mooringReach,
        )
      ) {
        forces.push({
          force: mooringForce(
            dock.capture.offset,
            dock.capture.velocity,
            properties.mass,
            flight.mooringReach,
          ),
          point: state.position,
        });
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
      const routePoint = plan.point(progress);
      maxRouteError = Math.max(
        maxRouteError,
        Math.hypot(state.position[0] - routePoint[0], state.position[2] - routePoint[2]),
      );
      const settled = vehiclePlatformDockState(
        state.position,
        state.velocity,
        targetBase.berth,
        targetBase.docking.approach,
      );
      docked = isPlatformDockingComplete(
        progress,
        settled.capture.offset,
        state.orientation,
        settled.capture.velocity,
        state.angularVelocity,
        2,
        vehicle.nose,
        settled.approach,
        targetBase.docking.tolerance,
      );
    }

    const finalDock = vehiclePlatformDockState(
      state.position,
      state.velocity,
      targetBase.berth,
      targetBase.docking.approach,
    );
    assert.equal(
      docked,
      true,
      `${kind}: ${(progress * 100).toFixed(1)}%, offset ` +
        `${finalDock.capture.offset.map((value) => value.toFixed(2)).join(", ")}, ` +
        `velocity ${state.velocity.map((value) => value.toFixed(3)).join(", ")}`,
    );
    assert.equal(goArounds, 0, `${kind}: ${goArounds} go-arounds`);
    assert.ok(maxRouteError < 18, `${kind}: route error ${maxRouteError.toFixed(1)} m`);
    t.diagnostic(
      `${kind}: dock ${Math.hypot(finalDock.capture.offset[0], finalDock.capture.offset[2]).toFixed(2)} m; ` +
        `error ${maxRouteError.toFixed(1)} m`,
    );
  });
}
