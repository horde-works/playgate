import assert from "node:assert/strict";
import test from "node:test";

import RAPIER from "@dimforge/rapier3d-compat";
import {
  massProperties,
  pointEffectiveMass,
  rotateVector,
  stepBody,
} from "../games/make-a-mess/src/game/clusterDynamics.ts";
import {
  SKY_TRAIN_AIR_VEHICLE,
  TOWN_AIRSHIP_AIR_VEHICLE,
} from "../games/make-a-mess/src/game/airVehicles.ts";
import {
  structuralMaterialProfiles,
} from "../games/make-a-mess/src/game/destructionScene.ts";
import { grandTerminalScene } from "../games/make-a-mess/src/game/grandTerminalScene.ts";
import {
  ACTOR_SAFETY_FLOOR,
  DEBRIS_NORMAL,
  VEHICLE_CONTACT_QUERY,
} from "../games/make-a-mess/src/game/physicsInteractionGroups.ts";
import {
  vehicleGroundBrakingLiftFraction,
  vehicleAttitude,
  vehicleProbeFriction,
  vehicleProbeReach,
  vehicleProbeReaction,
} from "../games/make-a-mess/src/game/vehicleFrames.ts";
import {
  advanceVehicleGroundLiftAutomation,
  advanceVehicleLandingStability,
  createVehicleGroundLiftAutomation,
  createVehicleLandingStability,
  VEHICLE_GROUND_CONTACT_CONFIRM_SECONDS,
  vehicleGroundLiftAutomationSettled,
} from "../games/make-a-mess/src/game/vehicleFailure.ts";
import { townScene } from "../games/make-a-mess/src/game/townScene.ts";

await RAPIER.init();

function rayHitForGroups(collisionGroups) {
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  const collider = RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5)
    .setTranslation(3, 0, 0);
  if (collisionGroups !== undefined) {
    collider.setCollisionGroups(collisionGroups);
  }
  world.createCollider(collider, body);
  world.step();
  const hit = world.castRay(
    new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }),
    10,
    true,
    undefined,
    VEHICLE_CONTACT_QUERY,
  );
  world.free();
  return hit;
}

test("vehicle probes query intact structures and detached debris, not the actor floor", () => {
  assert.notEqual(rayHitForGroups(undefined), null);
  assert.notEqual(rayHitForGroups(DEBRIS_NORMAL), null);
  assert.equal(rayHitForGroups(ACTOR_SAFETY_FLOOR), null);
});

test("support friction exists only under load and cannot reverse a stopped skid", () => {
  const profile = { staticCoefficient: 0.92, dynamicCoefficient: 0.76 };
  assert.deepEqual(
    vehicleProbeFriction(0, [8, 0, 0], [0, -1, 0], profile, 1_000, 1 / 60),
    [0, 0, 0],
  );
  const force = vehicleProbeFriction(
    50_000,
    [0.01, -3, 0],
    [0, -1, 0],
    profile,
    1_000,
    1 / 60,
  );
  assert.equal(Math.abs(force[0] + 600) < 1e-9, true);
  assert.equal(Math.abs(force[1]), 0);
  assert.equal(Math.abs(force[2]), 0);
  // F/m·dt = -0.01 m/s: the exact stopping impulse, not a reversal.
  assert.equal(Math.abs(force[0] / 1_000 / 60 + 0.01) < 1e-9, true);
});

test("ground lift automation learns from a growing tip without editing motion", () => {
  let state = createVehicleGroundLiftAutomation();
  const observe = (overrides = {}) => ({
    deltaSeconds: 1,
    contactConfirmed: true,
    supportContacts: 2,
    groundSpeed: 4,
    pitch: 0,
    roll: 0,
    tiltAngularSpeed: 0,
    liftFraction: 1,
    movingLiftFloor: 0.7,
    ...overrides,
  });

  state = advanceVehicleGroundLiftAutomation(state, observe());
  assert.equal(Math.abs(state.targetFraction - 0.7) < 1e-9, true);

  state = advanceVehicleGroundLiftAutomation(state, observe({
    deltaSeconds: 1 / 60,
    pitch: 0.12,
    tiltAngularSpeed: 0.2,
    liftFraction: 0.72,
  }));
  assert.equal(state.recoveringFromTilt, true);
  assert.equal(state.targetFraction, 1);
  const learned = state.learnedMinimumFraction;
  assert.equal(Math.abs(learned - 0.69) < 1e-9, true);

  state = advanceVehicleGroundLiftAutomation(state, observe({
    pitch: 0.2,
    tiltAngularSpeed: 0.1,
    liftFraction: 0.9,
  }));
  assert.equal(state.learnedMinimumFraction, learned);
  assert.equal(state.targetFraction, 1);

  state = advanceVehicleGroundLiftAutomation(state, observe({
    pitch: 0.18,
    tiltAngularSpeed: 0.01,
    liftFraction: 1,
  }));
  assert.equal(state.recoveringFromTilt, false);
  assert.equal(Math.abs(state.targetFraction - 0.7) < 1e-9, true);

  state = advanceVehicleGroundLiftAutomation(state, observe({
    groundSpeed: 0,
    pitch: 0.18,
    liftFraction: learned,
  }));
  assert.equal(state.targetFraction, learned);
  assert.equal(vehicleGroundLiftAutomationSettled(state, learned), true);
});

test("both airships stop a real ground skid after vertical emergency descent", () => {
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(200, 200, 200).setTranslation(0, -200, 0),
    ground,
  );
  world.step();

  const gravity = 9.81;
  const give = 0.22;
  const dt = 1 / 60;
  const densityOf = (material) => structuralMaterialProfiles[material].density;
  const cases = [
    {
      vehicle: SKY_TRAIN_AIR_VEHICLE,
      pieces: grandTerminalScene.breakablePieces.filter(
        (piece) => piece.clusterId === SKY_TRAIN_AIR_VEHICLE.clusterId,
      ),
    },
    {
      vehicle: TOWN_AIRSHIP_AIR_VEHICLE,
      pieces: townScene.breakablePieces.filter(
        (piece) => piece.clusterId === TOWN_AIRSHIP_AIR_VEHICLE.clusterId,
      ),
    },
  ];

  for (const { vehicle, pieces } of cases) {
    const properties = massProperties(pieces, densityOf);
    const supportStiffness =
      properties.mass * gravity / give / vehicle.supports.length;
    const supportProbeDamping = 2 * Math.sqrt(
      supportStiffness * properties.mass / vehicle.supports.length,
    );
    const hullProbeDamping = 2 * Math.sqrt(
      supportStiffness * properties.mass /
        (vehicle.supports.length + vehicle.hullProbes.length),
    );
    const probes = [
      ...vehicle.supports.map((point) => ({ point, normal: [0, -1, 0], support: true })),
      ...vehicle.hullProbes.map((probe) => ({ ...probe, support: false })),
    ];
    const supportBottom = Math.min(...vehicle.supports.map((point) => point[1]));
    const noseLength = Math.hypot(vehicle.nose[0], vehicle.nose[2]) || 1;
    let body = {
      position: [0, 3 + properties.centre[1] - supportBottom, 0],
      orientation: [0, 0, 0, 1],
      // Former route momentum is longitudinal; vertical recovery does not
      // invent an additional lateral skid.
      velocity: [
        vehicle.nose[0] / noseLength * 8,
        -0.8,
        vehicle.nose[2] / noseLength * 8,
      ],
      angularVelocity: [0, 0, 0],
    };
    let landing = createVehicleLandingStability(body.position, body.orientation);
    let touchdownAt = null;
    let touchdownPosition = [0, 0];
    let stoppedAt = null;
    let stoppedPosition = null;
    let groundContactSeconds = 0;
    let groundContactLatched = false;
    let groundLiftAutomation = createVehicleGroundLiftAutomation();
    let liftNow = properties.mass * gravity;
    const diagnostics = [];

    for (let index = 0; index < 1_800; index += 1) {
      const contacts = [];
      const loadedGroundContacts = [];
      for (const probe of probes) {
        const lever = rotateVector(body.orientation, [
          probe.point[0] - properties.centre[0],
          probe.point[1] - properties.centre[1],
          probe.point[2] - properties.centre[2],
        ]);
        const point = [
          body.position[0] + lever[0],
          body.position[1] + lever[1],
          body.position[2] + lever[2],
        ];
        const normal = rotateVector(body.orientation, probe.normal);
        const spin = body.angularVelocity;
        const pointVelocity = [
          body.velocity[0] + spin[1] * lever[2] - spin[2] * lever[1],
          body.velocity[1] + spin[2] * lever[0] - spin[0] * lever[2],
          body.velocity[2] + spin[0] * lever[1] - spin[1] * lever[0],
        ];
        const closing =
          pointVelocity[0] * normal[0] +
          pointVelocity[1] * normal[1] +
          pointVelocity[2] * normal[2];
        const hit = world.castRay(
          new RAPIER.Ray(
            {
              x: point[0] - normal[0] * give,
              y: point[1] - normal[1] * give,
              z: point[2] - normal[2] * give,
            },
            { x: normal[0], y: normal[1], z: normal[2] },
          ),
          vehicleProbeReach(give * 2, closing + 18, dt),
          true,
          undefined,
          VEHICLE_CONTACT_QUERY,
        );
        const reaction = hit
          ? vehicleProbeReaction(
              supportStiffness,
              probe.support ? supportProbeDamping : hullProbeDamping,
              give,
              hit.timeOfImpact - give,
              closing,
              dt,
            )
          : 0;
        if (reaction <= 0) continue;
        contacts.push({
          force: [-normal[0] * reaction, -normal[1] * reaction, -normal[2] * reaction],
          point,
        });
        if (normal[1] < -0.35) {
          loadedGroundContacts.push({
            reaction,
            velocity: pointVelocity,
            normal,
            point,
          });
        }
      }
      if (loadedGroundContacts.length > 0 && touchdownAt === null) {
        touchdownAt = index * dt;
        touchdownPosition = [body.position[0], body.position[2]];
      }
      if (!groundContactLatched) {
        groundContactSeconds = loadedGroundContacts.length > 0
          ? groundContactSeconds + dt
          : 0;
        groundContactLatched =
          groundContactSeconds >= VEHICLE_GROUND_CONTACT_CONFIRM_SECONDS;
      }
      const attitude = vehicleAttitude(body.orientation, vehicle.nose);
      groundLiftAutomation = advanceVehicleGroundLiftAutomation(
        groundLiftAutomation,
        {
          deltaSeconds: dt,
          contactConfirmed: groundContactLatched,
          supportContacts: loadedGroundContacts.length,
          groundSpeed: Math.hypot(body.velocity[0], body.velocity[2]),
          pitch: attitude.pitch,
          roll: attitude.roll,
          tiltAngularSpeed: Math.hypot(
            body.angularVelocity[0],
            body.angularVelocity[2],
          ),
          liftFraction: liftNow / properties.mass / gravity,
          movingLiftFloor: vehicleGroundBrakingLiftFraction(
            vehicle.supports,
            properties.centre,
            vehicle.nose,
            vehicle.supportFriction,
          ),
        },
      );
      const totalReaction = loadedGroundContacts.reduce(
        (sum, contact) => sum + contact.reaction,
        0,
      );
      if (totalReaction > 0) {
        const weighted = loadedGroundContacts.reduce(
          (sum, contact) => {
            const weight = contact.reaction / totalReaction;
            return {
              point: sum.point.map((value, axis) =>
                value + contact.point[axis] * weight),
              velocity: sum.velocity.map((value, axis) =>
                value + contact.velocity[axis] * weight),
              normal: sum.normal.map((value, axis) =>
                value + contact.normal[axis] * weight),
            };
          },
          { point: [0, 0, 0], velocity: [0, 0, 0], normal: [0, 0, 0] },
        );
        const normalLength = Math.hypot(...weighted.normal) || 1;
        const normalSpeed = weighted.velocity.reduce(
          (sum, value, axis) =>
            sum + value * weighted.normal[axis] / normalLength,
          0,
        );
        const tangent = weighted.velocity.map((value, axis) =>
          value - weighted.normal[axis] / normalLength * normalSpeed);
        contacts.push({
          force: vehicleProbeFriction(
            totalReaction,
            weighted.velocity,
            weighted.normal,
            vehicle.supportFriction,
            pointEffectiveMass(
              properties,
              body.orientation,
              weighted.point.map((value, axis) => value - body.position[axis]),
              tangent,
            ),
            dt,
          ),
          point: weighted.point,
        });
      }
      const liftArm = rotateVector(body.orientation, [
        vehicle.liftCentre[0] - properties.centre[0],
        vehicle.liftCentre[1] - properties.centre[1],
        vehicle.liftCentre[2] - properties.centre[2],
      ]);
      const descentAcceleration = (-0.8 - body.velocity[1]) * 0.8;
      const descentTrim = Math.max(
        -1,
        Math.min(
          1,
          descentAcceleration / (gravity * vehicle.flight.limits.liftTrimRange),
        ),
      );
      const flightLiftTarget = properties.mass * gravity *
        (1 + descentTrim * vehicle.flight.limits.liftTrimRange);
      const liftTarget = groundContactLatched
        ? Math.min(
            flightLiftTarget,
            properties.mass * gravity * groundLiftAutomation.targetFraction,
          )
        : flightLiftTarget;
      const liftStep = properties.mass * gravity * 0.25 * dt;
      liftNow += Math.max(-liftStep, Math.min(liftStep, liftTarget - liftNow));
      body = stepBody(
        body,
        properties,
        [
          { force: [0, -properties.mass * gravity, 0], point: body.position },
          // There is deliberately no air drag in this test. Contact opens the
          // lift-dump valve, but only loaded surface friction may arrest the
          // old route momentum.
          {
            force: [0, liftNow, 0],
            point: [
              body.position[0] + liftArm[0],
              body.position[1] + liftArm[1],
              body.position[2] + liftArm[2],
            ],
          },
          ...contacts,
        ],
        {
          linear: 0,
          angular: vehicle.flight.angularDamping * properties.inertia[4],
        },
        dt,
      );
      if (
        touchdownAt !== null &&
        stoppedAt === null &&
        Math.hypot(body.velocity[0], body.velocity[2]) < 0.05
      ) {
        stoppedAt = index * dt;
        stoppedPosition = [body.position[0], body.position[2]];
      }
      landing = advanceVehicleLandingStability(landing, {
        deltaSeconds: dt,
        supportContacts:
          groundContactLatched &&
            vehicleGroundLiftAutomationSettled(
              groundLiftAutomation,
              liftNow / properties.mass / gravity,
            )
            ? loadedGroundContacts.length
            : 0,
        position: body.position,
        orientation: body.orientation,
        velocity: body.velocity,
        angularVelocity: body.angularVelocity,
      });
      if (touchdownAt !== null && index % 60 === 0) {
        diagnostics.push(
          `${(index * dt - touchdownAt).toFixed(0)}s:` +
          ` v=${Math.hypot(body.velocity[0], body.velocity[2]).toFixed(2)}` +
          ` vy=${body.velocity[1].toFixed(2)}` +
          ` w=${Math.hypot(...body.angularVelocity).toFixed(2)}` +
          ` tilt=${Math.max(Math.abs(attitude.pitch), Math.abs(attitude.roll)).toFixed(2)}` +
          ` n=${loadedGroundContacts.length}` +
          ` lift=${(liftNow / properties.mass / gravity).toFixed(2)}`,
        );
      }
    }

    const clusterId = vehicle.clusterId;
    assert.notEqual(touchdownAt, null, clusterId);
    assert.notEqual(stoppedAt, null, `${clusterId}; ${diagnostics.join(" | ")}`);
    const slide = Math.hypot(
      stoppedPosition[0] - touchdownPosition[0],
      stoppedPosition[1] - touchdownPosition[1],
    );
    assert.equal(stoppedAt - touchdownAt < 12, true,
      `${clusterId} stopped in ${(stoppedAt - touchdownAt).toFixed(2)} s; ${diagnostics.join(" | ")}`);
    assert.equal(slide < 50, true,
      `${clusterId} slid ${slide.toFixed(2)} m; stopped in ${(stoppedAt - touchdownAt).toFixed(2)} s; final v=${body.velocity.map((value) => value.toFixed(2)).join(",")}; landed=${landing.landed}`);
    assert.equal(Math.hypot(body.velocity[0], body.velocity[2]) < 0.04, true,
      `${clusterId} final horizontal ${Math.hypot(body.velocity[0], body.velocity[2]).toFixed(2)}; ${diagnostics.join(" | ")}`);
    assert.equal(Math.abs(body.velocity[1]) < 0.04, true,
      `${clusterId} final vertical ${body.velocity[1].toFixed(2)}`);
    assert.equal(landing.landed, true, `${clusterId} did not settle`);
  }

  world.free();
});
