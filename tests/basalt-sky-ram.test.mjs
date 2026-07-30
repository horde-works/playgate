import assert from "node:assert/strict";
import test from "node:test";
import {
  BASALT_SKY_RAM_AIR_VEHICLE,
  DEFAULT_VEHICLE_LIFT_RESERVE,
  isInsideBasaltSkyRam,
} from "../games/make-a-mess/src/game/airVehicles.ts";
import {
  BASALT_SKY_RAM_GALLERY_BOTTOM_HALF_WIDTH,
  BASALT_SKY_RAM_GALLERY_FLOOR_Y,
  BASALT_SKY_RAM_GALLERY_ROOF_Y,
  BASALT_SKY_RAM_GALLERY_TOP_HALF_WIDTH,
  BASALT_SKY_RAM_BERTH_CLUSTER_ID,
  BASALT_SKY_RAM_CLUSTER_ID,
  BASALT_SKY_RAM_MOORING_POINT,
  BASALT_SKY_RAM_ORIGIN,
} from "../games/make-a-mess/src/game/basaltSkyRam.ts";
import {
  basaltSkyRamRoute,
  basaltSkyRamRoutePhase,
} from "../games/make-a-mess/src/game/basaltSkyRamRoutes.ts";
import { basaltStrongholdScene } from "../games/make-a-mess/src/game/basaltStrongholdScene.ts";
import {
  RESTING_BODY,
  massProperties,
  rotationMatrixFromEuler,
  stepBody,
} from "../games/make-a-mess/src/game/clusterDynamics.ts";
import { compoundClusterColliders } from "../games/make-a-mess/src/game/compoundKinematicCluster.ts";
import { structuralMaterialProfiles } from "../games/make-a-mess/src/game/destructionScene.ts";
import {
  advanceVehicleRouteProgress,
  autopilot,
  balancedEngineYawAuthority,
  hullDrag,
  isDockingComplete,
  isDockingSettleWindow,
  isMooringCaptureEligible,
  mooringForce,
  rotateVector,
  rudderEffectiveness,
  shipForces,
  vehicleFrameForCluster,
  vehicleMooringState,
  vehicleRouteHeading,
  vehicleSpoolCommand,
} from "../games/make-a-mess/src/game/vehicleFrames.ts";
import {
  compileCommandActuators,
  executeCommandActuators,
} from "../games/make-a-mess/src/game/vehicleActuation.ts";
import {
  assessVehicleTrajectory,
  requestedVehicleTrajectoryMode,
} from "../games/make-a-mess/src/game/vehicleTrajectoryCorrection.ts";
import { vehicleGuidanceEnvelope } from "../games/make-a-mess/src/game/vehicleGuidanceEnvelope.ts";
import { DEFAULT_VEHICLE_FAILURE_ENVELOPE } from "../games/make-a-mess/src/game/vehicleFailure.ts";
import {
  hingedDoorGroupKey,
  tailRampPolicy,
} from "../games/make-a-mess/src/game/hingedGatePolicy.ts";

const densityOf = (material) => structuralMaterialProfiles[material].density;
const ship = basaltStrongholdScene.breakablePieces.filter(
  (piece) => piece.clusterId === BASALT_SKY_RAM_CLUSTER_ID,
);
const berth = basaltStrongholdScene.breakablePieces.filter(
  (piece) => piece.clusterId === BASALT_SKY_RAM_BERTH_CLUSTER_ID,
);

function simulateIntactFlight(kind) {
  const vehicle = BASALT_SKY_RAM_AIR_VEHICLE;
  const flight = vehicle.flight;
  const guidance = vehicleGuidanceEnvelope(
    DEFAULT_VEHICLE_FAILURE_ENVELOPE,
    flight.approach,
    flight.limits,
    flight.guidance,
  );
  const properties = massProperties(ship, densityOf);
  const plan = flight.routePlan(kind, properties.centre);
  const model = {
    mass: properties.mass,
    inertiaYaw: properties.inertia[4],
    bodyCentre: properties.centre,
    dragLinear: flight.linearDamping * properties.mass,
    dragLateral:
      flight.linearDamping * properties.mass * flight.lateralDragRatio,
    dragAngular: flight.angularDamping * properties.inertia[4],
    limits: flight.limits,
  };
  let state = { ...RESTING_BODY, position: [...properties.centre] };
  let progress = 0;
  let liftNow = properties.mass * 9.81;
  let goArounds = 0;
  let lastGoAround = Number.NEGATIVE_INFINITY;
  let firstCorrectionRequest = null;
  let maximumCrossTrackError = 0;
  let finalManeuverStartedAt = null;
  let dockingSettleStartedAt = null;
  const dt = 1 / 60;

  for (let step = 0; step < 60 * 500; step += 1) {
    const time = step * dt;
    const castOff = time >= flight.spoolSeconds;
    const centre = state.position;
    const bodyOffset = centre.map(
      (coordinate, axis) => coordinate - properties.centre[axis],
    );
    const capture = vehicleMooringState(
      vehicle,
      bodyOffset,
      state.orientation,
      state.velocity,
      state.angularVelocity,
      properties.centre,
    );
    const berthDistance = Math.hypot(capture.offset[0], capture.offset[2]);
    if (
      progress > 0.97 &&
      berthDistance < 8 &&
      finalManeuverStartedAt === null
    ) {
      finalManeuverStartedAt = time;
    }
    if (
      isDockingSettleWindow(
        progress,
        capture.offset,
        state.orientation,
        vehicle.nose,
        flight.approach,
        flight.docking,
      ) &&
      dockingSettleStartedAt === null
    ) {
      dockingSettleStartedAt = time;
    }
    if (
      isDockingComplete(
        progress,
        capture.offset,
        state.orientation,
        capture.velocity,
        state.angularVelocity,
        vehicle.nose,
        flight.approach,
        flight.docking,
      )
    ) {
      return {
        completed: true,
        seconds: time,
        goArounds,
        capture,
        firstCorrectionRequest,
        maximumCrossTrackError,
        finalManeuverSeconds:
          finalManeuverStartedAt === null ? 0 : time - finalManeuverStartedAt,
        dockingSettleSeconds:
          dockingSettleStartedAt === null ? 0 : time - dockingSettleStartedAt,
      };
    }

    let controls;
    let liftCommand = 0;
    if (castOff) {
      const assessment = assessVehicleTrajectory(
        plan,
        progress,
        {
          position: centre,
          orientation: state.orientation,
          velocity: state.velocity,
          angularVelocity: state.angularVelocity,
        },
        vehicle.nose,
        model,
        guidance,
      );
      const requestedMode = requestedVehicleTrajectoryMode(assessment);
      maximumCrossTrackError = Math.max(
        maximumCrossTrackError,
        assessment.crossTrackError,
      );
      if (requestedMode !== "authoredRoute" && !firstCorrectionRequest) {
        firstCorrectionRequest = {
          time,
          progress,
          position: [...centre],
          routePoint: plan.point(progress),
          requestedMode,
          assessment,
        };
      }
      const piloted = autopilot(
        plan,
        progress,
        centre,
        state.orientation,
        state.velocity,
        state.angularVelocity,
        model,
        Math.max(0, Math.min(1, (time - flight.underwaySeconds) / 8)),
        vehicle.nose,
        flight.approach,
      );
      controls = piloted.controls;
      liftCommand = controls.liftTrim;
      if (piloted.goAround && time - lastGoAround > 20) {
        progress = 0;
        goArounds += 1;
        lastGoAround = time;
      }
    } else {
      const spool = vehicleSpoolCommand(plan, time, flight.spoolSeconds);
      controls = {
        throttle: flight.limits.enginePoints.map(() => spool),
        rudder: 0,
        liftTrim: 0,
      };
    }

    const forward = rotateVector(state.orientation, vehicle.nose);
    const flat = Math.hypot(forward[0], forward[2]) || 1;
    const forces = [
      {
        force: hullDrag(
          state.velocity,
          [forward[0] / flat, forward[2] / flat],
          model,
        ),
        point: centre,
      },
      ...shipForces(
        controls,
        centre,
        properties.centre,
        state.orientation,
        flight.limits,
        vehicle.nose,
        Math.hypot(state.velocity[0], state.velocity[2]),
      ),
    ];
    const neutral = properties.mass * 9.81;
    const liftTarget =
      neutral * (1 + liftCommand * flight.limits.liftTrimRange);
    const liftRate = neutral * 0.25 * dt;
    liftNow += Math.max(-liftRate, Math.min(liftRate, liftTarget - liftNow));
    const liftArm = rotateVector(state.orientation, [
      vehicle.liftCentre[0] - properties.centre[0],
      vehicle.liftCentre[1] - properties.centre[1],
      vehicle.liftCentre[2] - properties.centre[2],
    ]);
    forces.push(
      { force: [0, -neutral, 0], point: centre },
      {
        force: [0, liftNow, 0],
        point: [
          centre[0] + liftArm[0],
          centre[1] + liftArm[1],
          centre[2] + liftArm[2],
        ],
      },
    );
    if (
      (!castOff || progress >= 0.9) &&
      isMooringCaptureEligible(
        capture.offset,
        state.orientation,
        vehicle.nose,
        flight.approach,
        flight.mooringReach,
      )
    ) {
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
    state = stepBody(
      state,
      properties,
      forces,
      { linear: 0, angular: model.dragAngular },
      dt,
    );
    if (castOff && time >= flight.underwaySeconds) {
      progress = advanceVehicleRouteProgress(
        plan,
        progress,
        state.position,
        Math.hypot(state.velocity[0], state.velocity[2]) * dt,
      );
    }
  }
  const bodyOffset = state.position.map(
    (coordinate, axis) => coordinate - properties.centre[axis],
  );
  return {
    completed: false,
    seconds: 500,
    goArounds,
    firstCorrectionRequest,
    maximumCrossTrackError,
    finalManeuverSeconds:
      finalManeuverStartedAt === null ? 0 : 500 - finalManeuverStartedAt,
    dockingSettleSeconds:
      dockingSettleStartedAt === null ? 0 : 500 - dockingSettleStartedAt,
    capture: vehicleMooringState(
      vehicle,
      bodyOffset,
      state.orientation,
      state.velocity,
      state.angularVelocity,
      properties.centre,
    ),
  };
}

test("the rear barbican and the sky ram are separate supported structures", () => {
  const frame = vehicleFrameForCluster(BASALT_SKY_RAM_CLUSTER_ID);
  assert.equal(frame?.id, "basalt-sky-ram");
  assert.equal(vehicleFrameForCluster(BASALT_SKY_RAM_BERTH_CLUSTER_ID), null);
  assert.equal(ship.length, 1133);
  assert.equal(berth.length >= 80, true);
  assert.equal(
    basaltStrongholdScene.resolveStructuralCollapse(new Set()).size,
    0,
  );

  const colliders = compoundClusterColliders(frame, ship, new Set());
  const articulated = ship.filter((piece) =>
    frame.independentMemberMatches.some((match) => piece.id.includes(match)),
  );
  // Seven ramp members plus two trim cars and their two rails.
  assert.equal(articulated.length, 15);
  assert.equal(colliders.length, ship.length - articulated.length);
  assert.equal(
    colliders.every((collider) =>
      collider.sourceId.startsWith(`${BASALT_SKY_RAM_CLUSTER_ID}:`),
    ),
    true,
  );
});

test("the dorsal awning breaks the square front without smothering the skin", () => {
  const plates = ship.filter((piece) =>
    /^stronghold:sky-ram:dorsal-awning:(-1|1):/.test(piece.id),
  );
  const angle = (25 * Math.PI) / 180;
  const halfSpan = Math.max(
    ...plates.map(
      (piece) =>
        Math.abs(piece.position[0]) + (Math.cos(angle) * piece.size[0]) / 2,
    ),
  );
  const lowerRoofEdge = Math.min(
    ...plates.map(
      (piece) =>
        piece.position[1] -
        (Math.abs(Math.sin(piece.rotation[2])) * piece.size[0]) / 2 -
        (Math.abs(Math.cos(piece.rotation[2])) * piece.size[1]) / 2,
    ),
  );
  const sideArmourTop = Math.max(
    ...ship
      .filter((piece) => piece.id.includes(":armour:"))
      .map((piece) => piece.position[1] + piece.size[1] / 2),
  );

  assert.equal(plates.length, 32);
  assert.equal(
    plates.every(
      (piece) => Math.abs(Math.abs(piece.rotation[2]) - angle) < 1e-9,
    ),
    true,
  );
  assert.equal(halfSpan > 3.7, true);
  assert.equal(
    lowerRoofEdge > sideArmourTop + 0.75,
    true,
    "the roof eaves must overlap above the side armour, never pierce it",
  );
  assert.equal(
    plates.every((piece) => !piece.id.includes(":skin:")),
    true,
    "the rigid awning must remain separate from the breathing envelope",
  );
});

test("a continuous high riveted citadel belt stands outside the breathing hull", () => {
  const plates = ship.filter((piece) =>
    /^stronghold:sky-ram:citadel-belt:(-1|1):\d+:\d+$/.test(piece.id),
  );
  const trusses = ship.filter((piece) =>
    /^stronghold:sky-ram:citadel-truss:(-1|1):\d+:\d+$/.test(piece.id),
  );
  const heads = ship.filter(
    (piece) =>
      piece.id.includes(":citadel-belt:") && piece.id.endsWith(":truss-head"),
  );
  const rivets = ship.filter(
    (piece) =>
      piece.id.includes(":citadel-belt:") && piece.id.includes(":rivet:"),
  );

  assert.equal(plates.length, 42);
  assert.equal(trusses.length, 42);
  assert.equal(heads.length, 42);
  assert.equal(rivets.length, 168);
  assert.equal(
    plates.every((piece) => piece.size[2] >= 1.48),
    true,
  );

  const halfExtent = (piece, worldAxis) => {
    const matrix = rotationMatrixFromEuler(piece.rotation);
    return (
      (Math.abs(matrix[worldAxis * 3]) * piece.size[0]) / 2 +
      (Math.abs(matrix[worldAxis * 3 + 1]) * piece.size[1]) / 2 +
      (Math.abs(matrix[worldAxis * 3 + 2]) * piece.size[2]) / 2
    );
  };
  for (const side of [-1, 1]) {
    for (const course of [0, 1, 2]) {
      const coursePlates = plates
        .filter((piece) =>
          piece.id.includes(`:citadel-belt:${side}:${course}:`),
        )
        .sort((left, right) => left.position[2] - right.position[2]);
      assert.equal(coursePlates.length, 7);
      for (let index = 0; index < coursePlates.length - 1; index += 1) {
        const aft = coursePlates[index];
        const forward = coursePlates[index + 1];
        const aftEdge = aft.position[2] + halfExtent(aft, 2);
        const forwardEdge = forward.position[2] - halfExtent(forward, 2);
        assert.equal(
          aftEdge - forwardEdge > 0.1,
          true,
          `${aft.id} and ${forward.id} leave a longitudinal armour gap`,
        );
      }
    }
  }

  for (const side of [-1, 1]) {
    for (let panel = 0; panel < 7; panel += 1) {
      const courses = [0, 1, 2].map((course) =>
        plates.find(
          (piece) =>
            piece.id ===
            `stronghold:sky-ram:citadel-belt:${side}:${course}:${panel}`,
        ),
      );
      assert.equal(courses.every(Boolean), true);
      for (let course = 0; course < courses.length - 1; course += 1) {
        const upper = courses[course];
        const lower = courses[course + 1];
        assert.equal(
          upper.position[1] - halfExtent(upper, 1) <
            lower.position[1] + halfExtent(lower, 1) - 0.08,
          true,
          `${upper.id} does not shingle over ${lower.id}`,
        );
      }
    }
  }

  for (const plate of plates) {
    const match = plate.id.match(/citadel-belt:(-?1):(\d+):/);
    const side = Number(match?.[1]);
    const course = Number(match?.[2]);
    const stringerIndex = side < 0 ? [10, 9, 9][course] : [2, 3, 3][course];
    const stringers = ship.filter((piece) =>
      piece.id.startsWith(`stronghold:sky-ram:stringer:${stringerIndex}:`),
    );
    const support = stringers.reduce((closest, piece) =>
      Math.abs(piece.position[2] - plate.position[2]) <
      Math.abs(closest.position[2] - plate.position[2])
        ? piece
        : closest,
    );
    const matrix = rotationMatrixFromEuler(plate.rotation);
    const outward = [matrix[1], matrix[4], matrix[7]];
    const separation = plate.position.reduce(
      (sum, coordinate, axis) =>
        sum + (coordinate - support.position[axis]) * outward[axis],
      0,
    );
    assert.equal(
      separation > 0.36,
      true,
      `${plate.id} intrudes into its stringer instead of standing outside it`,
    );
  }
});

test("the riveted belt closes into a continuous compound bow glacis", () => {
  const plates = ship.filter((piece) =>
    /^stronghold:sky-ram:bow-glacis:(-1|1):\d+:\d+$/.test(piece.id),
  );
  const trusses = ship.filter((piece) =>
    /^stronghold:sky-ram:bow-glacis-truss:(-1|1):\d+:\d+$/.test(piece.id),
  );
  const rivets = ship.filter(
    (piece) =>
      piece.id.includes(":bow-glacis:") && piece.id.includes(":rivet:"),
  );

  assert.equal(plates.length, 30);
  assert.equal(trusses.length, 30);
  assert.equal(rivets.length, 120);
  assert.equal(
    trusses.every((piece) =>
      piece.attachmentSupportIds?.includes("stronghold:sky-ram:keel-cell:4"),
    ),
    true,
  );

  for (const side of [-1, 1]) {
    for (const course of [0, 1, 2]) {
      const broadside = ship.find(
        (piece) =>
          piece.id === `stronghold:sky-ram:citadel-belt:${side}:${course}:6`,
      );
      const bow = plates
        .filter((piece) =>
          piece.id.startsWith(
            `stronghold:sky-ram:bow-glacis:${side}:${course}:`,
          ),
        )
        .sort((left, right) => left.position[2] - right.position[2]);
      assert.ok(broadside);
      assert.equal(bow.length, 5);

      const chain = [broadside, ...bow];
      for (let index = 0; index < chain.length - 1; index += 1) {
        const aft = chain[index];
        const forward = chain[index + 1];
        const centreDistance = Math.hypot(
          forward.position[0] - aft.position[0],
          forward.position[1] - aft.position[1],
          forward.position[2] - aft.position[2],
        );
        assert.equal(
          (aft.size[0] + forward.size[0]) / 2 - centreDistance > 0.1,
          true,
          `${aft.id} and ${forward.id} leave a gap in the bow armour`,
        );
      }

      assert.equal(
        bow.at(-1).position[2] > BASALT_SKY_RAM_ORIGIN[2] + 9.5,
        true,
        "the glacis must reach the final nose seam",
      );
    }
  }
});

test("red dorsal embers burn behind real armour seams at patrol distance", () => {
  const emberPieces = ship.filter((piece) =>
    piece.id.startsWith("stronghold:sky-ram:dorsal-ember:"),
  );
  const emberLights = basaltStrongholdScene.lampDefinitions.filter((light) =>
    light.id.startsWith("stronghold:sky-ram:dorsal-ember:"),
  );
  const innerAwningCourse = ship
    .filter((piece) =>
      /^stronghold:sky-ram:dorsal-awning:1:.*:0$/.test(piece.id),
    )
    .sort((left, right) => left.position[2] - right.position[2]);

  assert.equal(emberPieces.length, 4);
  assert.equal(emberLights.length, 4);
  assert.equal(innerAwningCourse.length, 8);
  for (const light of emberLights) {
    const glass = emberPieces.find((piece) => piece.id === light.id);
    assert.ok(glass, `${light.id} must have its own breakable red lens`);
    assert.equal(glass.material, "darkGlass");
    assert.equal(glass.shape, "sphere");
    assert.equal(light.carrierClusterId, BASALT_SKY_RAM_CLUSTER_ID);
    assert.equal(light.poolGroupId, "stronghold:sky-ram:dorsal-embers");
    assert.equal(light.poolPriority >= 32, true);
    assert.equal(light.distance >= 24, true);
    assert.equal(light.intensity >= 7, true);
    assert.equal(light.dayIntensityFactor >= 0.8, true);
    assert.equal(light.beacon?.minScreenDiameter >= 7, true);
    assert.equal(light.beacon?.dayOpacity >= 0.8, true);

    const seam = innerAwningCourse.find((plate, index) => {
      const next = innerAwningCourse[index + 1];
      if (!next) return false;
      const gapStart = plate.position[2] + plate.size[2] / 2;
      const gapEnd = next.position[2] - next.size[2] / 2;
      return light.position[2] > gapStart && light.position[2] < gapEnd;
    });
    assert.ok(seam, `${light.id} must sit in a real longitudinal roof gap`);
    const ridgeEdgeY =
      seam.position[1] +
      (Math.abs(Math.sin(seam.rotation[2])) * seam.size[0]) / 2 +
      (Math.abs(Math.cos(seam.rotation[2])) * seam.size[1]) / 2;
    assert.equal(
      light.position[1] < ridgeEdgeY - 0.12,
      true,
      `${light.id} must remain below the armour skin`,
    );
  }
});

test("the raised gallery is a true inverted trapezoid, not a narrower box", () => {
  const floors = ship.filter((piece) => piece.id.includes(":gallery:floor:"));
  const roofs = ship.filter((piece) =>
    /^stronghold:sky-ram:gallery:roof:\d+$/.test(piece.id),
  );
  const lowerWalls = ship.filter(
    (piece) =>
      piece.id.includes(":gallery:wall:") && piece.id.endsWith(":lower"),
  );
  const upperWalls = ship.filter(
    (piece) =>
      piece.id.includes(":gallery:wall:") && piece.id.endsWith(":upper"),
  );
  const envelopeBottom = Math.min(
    ...ship
      .filter((piece) => piece.id.includes(":skin:"))
      .flatMap((piece) =>
        piece.visualMesh.vertices.map(
          (vertex) => piece.position[1] + vertex[1] * piece.size[1],
        ),
      ),
  );
  const roofTop = Math.max(
    ...roofs.map((piece) => piece.position[1] + piece.size[1] / 2),
  );

  assert.equal(BASALT_SKY_RAM_GALLERY_FLOOR_Y >= 5.1, true);
  assert.equal(
    BASALT_SKY_RAM_GALLERY_TOP_HALF_WIDTH -
      BASALT_SKY_RAM_GALLERY_BOTTOM_HALF_WIDTH >
      0.5,
    true,
  );
  assert.equal(
    floors.every(
      (piece) =>
        Math.abs(
          piece.size[0] - (BASALT_SKY_RAM_GALLERY_BOTTOM_HALF_WIDTH * 2 + 0.08),
        ) < 1e-9,
    ),
    true,
  );
  assert.equal(
    roofs.every((piece) => piece.size[0] > floors[0].size[0] + 0.9),
    true,
  );
  assert.equal(
    Math.min(...upperWalls.map((piece) => Math.abs(piece.position[0]))) >
      Math.max(...lowerWalls.map((piece) => Math.abs(piece.position[0]))) + 0.2,
    true,
    "the upper armour must visibly flare beyond the lower armour",
  );
  assert.equal(
    [...lowerWalls, ...upperWalls].every(
      (piece) => Math.abs(piece.rotation?.[2] ?? 0) > 0.15,
    ),
    true,
    "the side armour itself must slope; offsets alone would still read as a box",
  );
  assert.equal(
    Math.abs(roofTop - (BASALT_SKY_RAM_GALLERY_ROOF_Y + 0.1)) < 0.01,
    true,
  );
  assert.equal(
    envelopeBottom - roofTop > 0.85 && envelopeBottom - roofTop < 1.1,
    true,
    "the gallery shoulder must tuck closely under the hull",
  );
});

test("the tapered stern is a single armoured ramp that reaches skid level", () => {
  const ramp = ship.filter((piece) => piece.id.includes(":gallery:ramp:"));
  const boards = ramp.filter((piece) => piece.id.includes(":ramp:board:"));
  const cheeks = ship.filter((piece) =>
    piece.id.includes(":gallery:tail-cheek:"),
  );
  const tailRoof = ship.filter((piece) =>
    piece.id.includes(":gallery:tail-roof:"),
  );
  const groupKeys = new Set(
    ramp.map((piece) => hingedDoorGroupKey(piece.id, piece.clusterId)),
  );
  const [groupKey] = groupKeys;
  const policy = tailRampPolicy(groupKey);

  assert.equal(ramp.length, 11);
  assert.equal(boards.length, 5);
  assert.equal(cheeks.length, 8);
  assert.equal(tailRoof.length, 3);
  assert.equal(groupKeys.size, 1);
  assert.ok(policy);
  assert.equal(policy.openAngle < -1.1, true);
  assert.deepEqual(policy.rotationAxis, [1, 0, 0]);
  assert.equal(
    ramp.every((piece) => piece.hinge),
    true,
  );
  assert.equal(
    ramp.every(
      (piece) =>
        piece.hinge.direction[0] === 1 &&
        piece.hinge.direction[1] === 0 &&
        piece.hinge.direction[2] === 0,
    ),
    true,
    "the ramp must turn around a physical transverse hinge",
  );
  assert.equal(boards.at(-1).size[0] > boards[0].size[0] + 0.6, true);

  const last = boards.at(-1);
  const pivot = last.hinge.pivot;
  const closedAngle = last.rotation[0];
  const halfLength = last.size[2] / 2;
  const closedTip = [
    last.position[0],
    last.position[1] + Math.sin(closedAngle) * halfLength,
    last.position[2] - Math.cos(closedAngle) * halfLength,
  ];
  const dy = closedTip[1] - pivot[1];
  const dz = closedTip[2] - pivot[2];
  const openedTipY =
    pivot[1] +
    dy * Math.cos(policy.openAngle) -
    dz * Math.sin(policy.openAngle);
  assert.equal(closedTip[1] > BASALT_SKY_RAM_GALLERY_ROOF_Y - 0.2, true);
  assert.equal(
    openedTipY >= 3.95 && openedTipY <= 4.3,
    true,
    `deployed lip ends at ${openedTipY.toFixed(2)} m instead of skid level`,
  );
});

test("the furnace ducts are long, low, armoured and visibly powered", () => {
  const enginePieces = ship.filter((piece) => piece.id.includes(":engine:"));
  const armour = enginePieces.filter((piece) => piece.id.includes(":armour:"));
  const glass = enginePieces.filter((piece) =>
    piece.id.endsWith(":furnace-glass"),
  );
  const lips = enginePieces.filter((piece) => piece.id.includes(":glass-lip:"));
  const exhaust = BASALT_SKY_RAM_AIR_VEHICLE.flight.exhaust;
  const envelopeBottom = Math.min(
    ...ship
      .filter((piece) => piece.id.includes(":skin:"))
      .flatMap((piece) =>
        piece.visualMesh.vertices.map(
          (vertex) => piece.position[1] + vertex[1] * piece.size[1],
        ),
      ),
  );
  const ductBottom = Math.min(
    ...armour.map((piece) => piece.position[1] - piece.size[1] / 2),
  );
  const ductTop = Math.max(
    ...armour.map((piece) => piece.position[1] + piece.size[1] / 2),
  );

  assert.equal(enginePieces.length, 92);
  assert.equal(armour.length, 14);
  assert.equal(glass.length, 2);
  assert.equal(lips.length, 8);
  const steelShields = enginePieces.filter((piece) =>
    /^stronghold:sky-ram:engine:(-1|1):steel-shield:\d+$/.test(piece.id),
  );
  const shieldRails = enginePieces.filter((piece) =>
    piece.id.endsWith(":steel-shield-rail"),
  );
  const shieldRivets = enginePieces.filter(
    (piece) =>
      piece.id.includes(":steel-shield:") && piece.id.includes(":rivet:"),
  );
  assert.equal(steelShields.length, 10);
  assert.equal(shieldRails.length, 2);
  assert.equal(shieldRivets.length, 40);
  for (const side of [-1, 1]) {
    const sideShields = steelShields
      .filter((piece) => piece.id.includes(`:engine:${side}:`))
      .sort((left, right) => left.position[2] - right.position[2]);
    for (let index = 0; index < sideShields.length - 1; index += 1) {
      const aft = sideShields[index];
      const forward = sideShields[index + 1];
      assert.equal(
        aft.position[2] +
          aft.size[2] / 2 -
          (forward.position[2] - forward.size[2] / 2) >
          0.08,
        true,
        `${aft.id} and ${forward.id} leave an engine-armour gap`,
      );
    }
  }
  for (const shield of steelShields) {
    const side = shield.id.includes(":engine:-1:") ? -1 : 1;
    const index = Number(shield.id.split(":").at(-1)) + 1;
    const backing = ship.find(
      (piece) =>
        piece.id === `stronghold:sky-ram:engine:${side}:armour:${index}`,
    );
    assert.ok(backing);
    assert.equal(
      Math.abs(shield.position[0]) - shield.size[0] / 2 >
        Math.abs(backing.position[0]) + backing.size[0] / 2 + 0.04,
      true,
      `${shield.id} intersects the furnace armour instead of shielding it`,
    );
    const nozzleCollar = ship.find(
      (piece) => piece.id === `stronghold:sky-ram:engine:${side}:outlet-collar`,
    );
    assert.ok(nozzleCollar);
    assert.equal(Math.abs(shield.size[1] - nozzleCollar.size[0]) < 0.01, true);
  }
  assert.equal(
    Math.max(...armour.map((piece) => piece.position[1])) < 10.0,
    true,
  );
  assert.equal(
    envelopeBottom - ductBottom > 0.85,
    true,
    "at least 0.85 m of the drive must project below the hull silhouette",
  );
  assert.equal(
    ductTop > envelopeBottom + 0.25,
    true,
    "the drive roof must overlap the hull instead of hanging beneath it",
  );
  assert.equal(
    glass.every((piece) => piece.position[1] < envelopeBottom - 0.15),
    true,
    "the red furnace glass must remain visible below the envelope",
  );
  assert.equal(
    Math.max(...armour.map((piece) => piece.position[2])) -
      Math.min(...armour.map((piece) => piece.position[2])) >
      10.5,
    true,
  );
  for (const pane of glass) {
    const side = pane.id.includes(":engine:-1:") ? -1 : 1;
    const protectingLips = lips.filter((piece) =>
      piece.id.includes(`:engine:${side}:glass-lip:`),
    );
    assert.equal(
      protectingLips.every(
        (piece) => piece.position[2] > pane.position[2] + 0.1,
      ),
      true,
      `${pane.id} is not recessed behind armour`,
    );
  }
  assert.ok(exhaust);
  assert.equal(exhaust.sources.length, 2);
  assert.equal(exhaust.fullRate >= 45, true);
  assert.equal(
    exhaust.fullRate * exhaust.lifeSeconds >= 280,
    true,
    "full fire must keep a nearly continuous wall of smoke behind each furnace",
  );
  assert.equal(exhaust.fullRate / exhaust.idleRate > 25, true);
  assert.equal(
    exhaust.sources.every((source) =>
      ship.some((piece) => piece.id === source.outletPieceId),
    ),
    true,
  );
});

test("the envelope has a long asymmetric whale profile, not a bomb body", () => {
  const skin = ship.filter((piece) => piece.id.includes(":skin:"));
  const renderVertices = (pieces) =>
    pieces.flatMap((piece) =>
      piece.visualMesh.vertices.map((vertex) =>
        vertex.map(
          (coordinate, axis) =>
            piece.position[axis] + coordinate * piece.size[axis],
        ),
      ),
    );
  const range = (vertices, axis) => {
    const values = vertices.map((vertex) => vertex[axis]);
    return Math.max(...values) - Math.min(...values);
  };
  const vertices = renderVertices(skin);
  const tail = renderVertices(
    skin.filter((piece) => piece.id.includes(":skin:0:")),
  );
  const shoulder = renderVertices(
    skin.filter((piece) => piece.id.includes(":skin:6:")),
  );
  const upper = vertices.filter((vertex) => vertex[1] > 14.5);
  const lower = vertices.filter((vertex) => vertex[1] < 13.0);
  const capRims = ship
    .filter((piece) => piece.id.includes(":cap:") && piece.visualMesh)
    .flatMap((piece) =>
      piece.visualMesh.vertices
        .slice(0, -1)
        .map((vertex) =>
          vertex.map(
            (coordinate, axis) =>
              piece.position[axis] + coordinate * piece.size[axis],
          ),
        ),
    );

  const appearances = new Map();
  for (const vertex of [...vertices, ...capRims]) {
    const key = vertex
      .map((coordinate) =>
        (Math.abs(coordinate) < 1e-6 ? 0 : coordinate).toFixed(5),
      )
      .join(":");
    appearances.set(key, (appearances.get(key) ?? 0) + 1);
  }

  assert.equal(range(vertices, 2) / range(vertices, 0) > 3.45, true);
  assert.equal(range(tail, 0) < range(shoulder, 0) * 0.4, true);
  assert.equal(
    Math.max(...upper.map((vertex) => vertex[2])) -
      Math.max(...lower.map((vertex) => vertex[2])) >
      1.0,
    true,
    "the crown must project forward beyond the lower bow",
  );
  assert.equal(
    [...appearances.values()].every((count) => count >= 2),
    true,
    "every cassette vertex must be shared; a singleton is a visible gap",
  );
});

test("the armoured gallery hangs as a balanced heavy pendulum", () => {
  const vehicle = BASALT_SKY_RAM_AIR_VEHICLE;
  const properties = massProperties(ship, densityOf);
  const ballast = ship.filter((piece) =>
    piece.id.includes(":gallery:trim-ballast:"),
  );
  const horizontalOffset = Math.hypot(
    properties.centre[0] - vehicle.liftCentre[0],
    properties.centre[2] - vehicle.liftCentre[2],
  );

  // The two trim cars and their rails are 30 kg of real ballast machinery.
  assert.equal(properties.mass > 289 && properties.mass < 292, true);
  assert.deepEqual(vehicle.liftCentre, [0, 13.1, -102.19]);
  assert.equal(ballast.length, 2);
  assert.equal(
    ballast.every((piece) => piece.material === "steel"),
    true,
  );
  assert.deepEqual(
    ballast.map((piece) => piece.position[0]).sort((a, b) => a - b),
    [-0.61, 0.61],
  );
  assert.equal(
    ballast.every((piece) =>
      piece.attachmentSupportIds?.includes("stronghold:sky-ram:gallery:keel:0"),
    ),
    true,
  );
  assert.equal(
    horizontalOffset < 0.08,
    true,
    `${horizontalOffset.toFixed(3)} m`,
  );
  assert.equal(
    vehicle.liftCentre[1] - properties.centre[1] > 3.75,
    true,
    "the fighting gallery must hang well below the gas cells",
  );

  const withoutEastArmour = massProperties(
    ship.filter((piece) => !piece.id.includes(":armour:1:")),
    densityOf,
  );
  assert.equal(withoutEastArmour.centre[0] < properties.centre[0], true);
});

test("distributed keel cells fail by bay instead of acting as one kill switch", () => {
  const keelCells = ship.filter((piece) => piece.id.includes(":keel-cell:"));
  assert.equal(keelCells.length, 5);

  for (const cell of keelCells) {
    const collapsed = basaltStrongholdScene.resolveStructuralCollapse(
      new Set([cell.id]),
    );
    const shipDamage = ship.filter((piece) => collapsed.has(piece.id));
    assert.equal(shipDamage.length > 0 && shipDamage.length < 340, true);
    assert.equal(
      shipDamage.filter((piece) => piece.id.includes(":skin:")).length < 24,
      true,
      `${cell.id} vented most of the independent gas cassettes`,
    );
    assert.equal(
      berth.some((piece) => collapsed.has(piece.id)),
      false,
    );
  }

  const allLoadPathsLost = basaltStrongholdScene.resolveStructuralCollapse(
    new Set(keelCells.map((piece) => piece.id)),
  );
  assert.equal(
    ship.every((piece) => allLoadPathsLost.has(piece.id)),
    true,
  );
  assert.equal(
    berth.some((piece) => allLoadPathsLost.has(piece.id)),
    false,
  );
});

test("the armoured furnaces and tail remain physical actuators", () => {
  const bindings = compileCommandActuators(ship);
  assert.deepEqual(bindings.map((binding) => binding.commandChannel).sort(), [
    "rudder",
    "throttle:0",
    "throttle:1",
    // Trim is a control channel like any other: real parts, real loss.
    "trim:pitch",
    "trim:roll",
  ]);
  assert.equal(
    BASALT_SKY_RAM_AIR_VEHICLE.flight.driveAnimation.kind,
    "furnace",
  );
  assert.equal(
    ship.some((piece) => piece.id.includes(":bellows:")),
    false,
  );

  const intactIds = new Set(ship.map((piece) => piece.id));
  const intact = executeCommandActuators(bindings, intactIds, {
    "throttle:0": 1,
    "throttle:1": -0.7,
    rudder: 0.6,
  });
  assert.deepEqual(
    intact.map((execution) => execution.delivered),
    intact.map((execution) => execution.requested),
  );

  const withoutOneChamber = new Set(
    [...intactIds].filter(
      (id) => id !== "stronghold:sky-ram:engine:-1:chamber:3",
    ),
  );
  const degraded = executeCommandActuators(bindings, withoutOneChamber, {
    "throttle:0": 1,
    "throttle:1": 1,
  });
  assert.equal(
    Math.abs(
      degraded.find((execution) => execution.commandChannel === "throttle:0")
        ?.delivered - 0.83,
    ) < 1e-9,
    true,
  );
  assert.equal(
    degraded.find((execution) => execution.commandChannel === "throttle:1")
      ?.delivered,
    1,
  );

  const withoutCore = new Set(
    [...intactIds].filter((id) => id !== "stronghold:sky-ram:engine:-1:core"),
  );
  const failed = executeCommandActuators(bindings, withoutCore, {
    "throttle:0": 1,
  });
  assert.equal(
    failed.find((execution) => execution.commandChannel === "throttle:0")
      ?.delivered,
    0,
  );

  const withoutUpperVane = new Set(
    [...intactIds].filter((id) => id !== "stronghold:sky-ram:tail:vane:1"),
  );
  const halfRudder = executeCommandActuators(bindings, withoutUpperVane, {
    rudder: 1,
  });
  assert.equal(
    halfRudder.find((execution) => execution.commandChannel === "rudder")
      ?.delivered,
    0.5,
  );
});

test("the cast ram physically enters a tighter berth jaw than the docking tolerance", () => {
  const tip = basaltStrongholdScene.breakablePieceById.get(
    "stronghold:sky-ram:ram:4",
  );
  const mantlet = basaltStrongholdScene.breakablePieceById.get(
    "stronghold:sky-ram:ram:mantlet",
  );
  const mantletRivets = ship.filter((piece) =>
    piece.id.startsWith("stronghold:sky-ram:ram:mantlet:rivet:"),
  );
  const leftCheek = basaltStrongholdScene.breakablePieceById.get(
    "stronghold:berth:capture:cheek:-1",
  );
  const rightCheek = basaltStrongholdScene.breakablePieceById.get(
    "stronghold:berth:capture:cheek:1",
  );
  assert.ok(tip);
  assert.ok(mantlet);
  assert.ok(leftCheek);
  assert.ok(rightCheek);
  assert.equal(mantlet.shape, "hexagonalSheet");
  assert.equal(mantlet.material, "steel");
  assert.deepEqual(mantlet.attachmentSupportIds, ["stronghold:sky-ram:ram:0"]);
  assert.equal(mantletRivets.length, 6);
  assert.equal(mantlet.position[2] < tip.position[2] - 2.5, true);

  const throat =
    rightCheek.position[0] -
    rightCheek.size[0] / 2 -
    (leftCheek.position[0] + leftCheek.size[0] / 2);
  const radialClearance = (throat - tip.size[0]) / 2;
  assert.equal(radialClearance > 0.24 && radialClearance < 0.26, true);
  assert.equal(
    BASALT_SKY_RAM_AIR_VEHICLE.flight.docking.position < radialClearance,
    true,
  );

  const physicalTipZ = tip.position[2] + tip.size[1] / 2;
  assert.equal(
    Math.abs(physicalTipZ - BASALT_SKY_RAM_MOORING_POINT[2]) < 0.12,
    true,
  );
  assert.equal(
    Math.abs(tip.position[1] - BASALT_SKY_RAM_MOORING_POINT[1]) < 0.01,
    true,
  );
});

test("the capstan dispatch and the onboard war patrol are distinct calls", () => {
  const { departure, passengerFlight } = BASALT_SKY_RAM_AIR_VEHICLE;
  assert.ok(departure);
  assert.ok(passengerFlight);
  assert.equal(departure.target.cue, "stronghold-uncrewed-flight");
  assert.equal(passengerFlight.target.cue, "stronghold-passenger-flight");
  assert.equal(isInsideBasaltSkyRam(passengerFlight.point), true);
  assert.equal(isInsideBasaltSkyRam(departure.point), false);
  assert.equal(isInsideBasaltSkyRam(departure.passengerDropPoint), false);

  const capstan = basaltStrongholdScene.breakablePieceById.get(
    "stronghold:berth:capstan:post",
  );
  assert.ok(capstan);
  assert.equal(
    Math.hypot(
      departure.point[0] - capstan.position[0],
      departure.point[2] - capstan.position[2],
    ) < 0.1,
    true,
  );
});

test("both patrols back clear, climb outside the fortress and dock nose-first", () => {
  const properties = massProperties(ship, densityOf);
  const vehicle = BASALT_SKY_RAM_AIR_VEHICLE;

  let farthestRoutePoint = 0;
  for (const kind of ["circuit", "war-patrol"]) {
    const route = basaltSkyRamRoute(kind);
    const reverse = route.markerProgress("reverseComplete");
    const plan = vehicle.flight.routePlan(kind, properties.centre);
    assert.equal(plan.travelDirection(0), -1);
    assert.equal(
      vehicleSpoolCommand(
        plan,
        vehicle.flight.spoolSeconds,
        vehicle.flight.spoolSeconds,
      ),
      -0.42,
      "the run-up must pull the ram out of its jaw instead of driving into it",
    );
    assert.equal(plan.travelDirection(reverse + 1e-5), 1);
    assert.equal(plan.altitude(reverse) - properties.centre[1] > 6.5, true);
    assert.equal(basaltSkyRamRoutePhase(kind, reverse / 2), "departure");
    assert.equal(
      basaltSkyRamRoutePhase(kind, route.nodeProgress("east")),
      "cruise",
    );
    assert.equal(
      basaltSkyRamRoutePhase(kind, route.nodeProgress("arrival-shoulder")),
      "approach",
    );

    const finalHeading = vehicleRouteHeading(plan, plan.finalFrom + 0.01);
    assert.equal(
      finalHeading[0] * vehicle.nose[0] + finalHeading[1] * vehicle.nose[2] >
        0.995,
      true,
      "the final glide must point the ram into the jaw",
    );

    for (let sample = 0; sample <= 1000; sample += 1) {
      const point = plan.point(sample / 1000);
      farthestRoutePoint = Math.max(
        farthestRoutePoint,
        Math.hypot(
          point[0] - basaltStrongholdScene.worldCenter[0],
          point[2] - basaltStrongholdScene.worldCenter[1],
        ),
      );
    }
  }

  assert.equal(
    farthestRoutePoint + 40 < basaltStrongholdScene.boundaryRadius,
    true,
    `the ram leaves no hull/passenger margin at ${farthestRoutePoint.toFixed(1)} m`,
  );
  assert.equal(
    basaltStrongholdScene.boundaryRadius + 60 <=
      basaltStrongholdScene.skyRadius,
    true,
  );
  assert.equal(
    farthestRoutePoint + basaltStrongholdScene.skyRadius + 40 <=
      basaltStrongholdScene.cameraFar,
    true,
    "the camera must see the far atmosphere while riding the outer circuit",
  );
});

test("the ram returns through a continuous turn its real actuators can hold", () => {
  const vehicle = BASALT_SKY_RAM_AIR_VEHICLE;
  const properties = massProperties(ship, densityOf);
  const limits = vehicle.flight.limits;
  const noseLength = Math.hypot(vehicle.nose[0], vehicle.nose[2]) || 1;
  const localNose = [
    vehicle.nose[0] / noseLength,
    vehicle.nose[2] / noseLength,
  ];
  const rudderDirection = [-localNose[1], localNose[0]];
  const yawArm = (point, direction) => {
    const rx = point[0] - properties.centre[0];
    const rz = point[2] - properties.centre[2];
    return rz * direction[0] - rx * direction[1];
  };
  const rudderArm = Math.abs(yawArm(limits.rudderPoint, rudderDirection));
  const engineArms = limits.enginePoints.map((point) =>
    yawArm(point, localNose),
  );
  const engineMoment =
    limits.enginePower * balancedEngineYawAuthority(engineArms);
  const angularDrag = vehicle.flight.angularDamping * properties.inertia[4];

  for (const kind of ["circuit", "war-patrol"]) {
    const route = basaltSkyRamRoute(kind);
    const finalDistance = route.markerProgress("final") * route.length;
    assert.equal(
      Math.abs(route.length - finalDistance - 82) < 1e-6,
      true,
      `${kind} does not provide the authored 82 m straight final glide`,
    );

    for (const nodeId of [
      "west-south",
      "arrival-shoulder",
      "final-turn",
      "final-entry",
    ]) {
      const distance = route.nodeProgress(nodeId) * route.length;
      const before = route.point((distance - 0.25) / route.length);
      const at = route.point(distance / route.length);
      const after = route.point((distance + 0.25) / route.length);
      const incoming = [at[0] - before[0], at[2] - before[2]];
      const outgoing = [after[0] - at[0], after[2] - at[2]];
      const cosine =
        (incoming[0] * outgoing[0] + incoming[1] * outgoing[1]) /
        (Math.hypot(...incoming) * Math.hypot(...outgoing));
      const corner = Math.acos(Math.max(-1, Math.min(1, cosine)));
      assert.equal(
        corner < 0.04,
        true,
        `${kind}:${nodeId} introduces a ${((corner * 180) / Math.PI).toFixed(2)}° corner`,
      );
    }

    let worstDemand = 0;
    let narrowestRadius = Number.POSITIVE_INFINITY;
    const arrivalDistance = route.nodeProgress("west-south") * route.length;
    for (
      let distance = arrivalDistance + 1;
      distance < route.length - 1;
      distance += 0.25
    ) {
      const before = route.point((distance - 1) / route.length);
      const at = route.point(distance / route.length);
      const after = route.point((distance + 1) / route.length);
      const incoming = [at[0] - before[0], at[2] - before[2]];
      const outgoing = [after[0] - at[0], after[2] - at[2]];
      const cosine =
        (incoming[0] * outgoing[0] + incoming[1] * outgoing[1]) /
        (Math.hypot(...incoming) * Math.hypot(...outgoing));
      const headingChange = Math.acos(Math.max(-1, Math.min(1, cosine)));
      const curvature = headingChange;
      const speed = route.requirement("speedLimit", distance / route.length);
      const demandedYawRate = curvature * speed;
      const rudderMoment =
        limits.maxRudderForce * rudderEffectiveness(speed, limits) * rudderArm;
      const holdableYawRate = (rudderMoment + engineMoment) / angularDrag;
      worstDemand = Math.max(worstDemand, demandedYawRate / holdableYawRate);
      if (curvature > 1e-6) {
        narrowestRadius = Math.min(narrowestRadius, 1 / curvature);
      }
    }

    assert.equal(
      narrowestRadius > 29,
      true,
      `${kind} return radius fell to ${narrowestRadius.toFixed(1)} m`,
    );
    assert.equal(
      worstDemand < 0.48,
      true,
      `${kind} return consumes ${(worstDemand * 100).toFixed(0)}% of yaw authority`,
    );
  }
});

test("both intact patrols physically settle the nose into the berth", () => {
  for (const kind of ["circuit", "war-patrol"]) {
    const result = simulateIntactFlight(kind);
    assert.equal(
      result.completed,
      true,
      `${kind}: autopilot did not moor in ${result.seconds.toFixed(0)} s; ` +
        `nose offset ${Math.hypot(...result.capture.offset).toFixed(2)} m; ` +
        `go-arounds ${result.goArounds}`,
    );
    assert.equal(
      result.goArounds,
      0,
      `${kind}: an intact approach must not be rejected`,
    );
    assert.equal(
      result.firstCorrectionRequest,
      null,
      `${kind}: max cross-track ${result.maximumCrossTrackError.toFixed(1)} m; ` +
        `requested ${JSON.stringify(result.firstCorrectionRequest)}`,
    );
    // These are not style limits. The watchdog allows 35 s of final manoeuvre
    // and a hard 10 s inside the capture window, and a profile that aims short
    // of the berth spends almost all of both while the machine coasts in on
    // the mooring servo alone. Passing just under the watchdog is what let a
    // healthy ship fail in the live game, so the bar sits where an approach
    // that still carries way lands: 12 s and 3 s.
    assert.equal(
      result.finalManeuverSeconds < 14,
      true,
      `${kind}: final eight metres took ${result.finalManeuverSeconds.toFixed(1)} s`,
    );
    assert.equal(
      result.dockingSettleSeconds < 4,
      true,
      `${kind}: physical capture took ${result.dockingSettleSeconds.toFixed(1)} s`,
    );
  }
});

test("all onboard lights follow the ram while berth cressets stay on stone", () => {
  const onboard = basaltStrongholdScene.lampDefinitions.filter((light) =>
    light.id.startsWith(`${BASALT_SKY_RAM_CLUSTER_ID}:`),
  );
  const berthLights = basaltStrongholdScene.lampDefinitions.filter((light) =>
    light.id.startsWith("stronghold:berth:cresset:"),
  );
  assert.equal(onboard.length, 7);
  assert.equal(
    ship.some((piece) => piece.id.includes(":nav-light:")),
    false,
  );
  assert.equal(
    onboard.some((light) => light.id.includes(":nav-light:")),
    false,
  );
  assert.equal(
    onboard.every(
      (light) => light.carrierClusterId === BASALT_SKY_RAM_CLUSTER_ID,
    ),
    true,
  );
  assert.equal(berthLights.length, 2);
  assert.equal(
    berthLights.every((light) => !light.carrierClusterId),
    true,
  );
});


test("the ram keeps flying until a sixth of its envelope is gone", () => {
  // All the lift is carried by the skin panels, and they are featherweight —
  // 5.3 kg of 290 — so shedding them frees almost no weight and the surviving
  // share of the envelope decides everything. The reserve is what says how
  // big a hole the machine survives, and the bow packs twenty of the panels
  // into three metres, so a single rocket takes several at once.
  const flight = BASALT_SKY_RAM_AIR_VEHICLE.flight;
  const reserve = flight.liftReserve ?? DEFAULT_VEHICLE_LIFT_RESERVE;
  const properties = massProperties(ship, densityOf);
  const skin = ship.filter((piece) =>
    piece.id.includes(BASALT_SKY_RAM_AIR_VEHICLE.envelopeMatch),
  );
  assert.equal(skin.length > 0, true);
  const panelMass = skin
    .map((piece) => massProperties([piece], densityOf).mass)
    .sort((a, b) => a - b);

  let neutralAt = null;
  for (let lost = 0; lost <= skin.length && neutralAt === null; lost += 1) {
    // Worst case: the lightest panels go, so the hull sheds the least weight.
    const shed = panelMass.slice(0, lost).reduce((sum, mass) => sum + mass, 0);
    const liftToWeight =
      (properties.mass * reserve * ((skin.length - lost) / skin.length)) /
      (properties.mass - shed);
    if (liftToWeight < 1) neutralAt = lost / skin.length;
  }
  assert.equal(
    neutralAt >= 0.15,
    true,
    `buoyancy is lost after only ${(neutralAt * 100).toFixed(1)}% of the ` +
      `envelope; reserve ${reserve} is not enough for the authored bow`,
  );
});
