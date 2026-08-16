import { performance } from "node:perf_hooks";
import {
  createEvasionState,
  evasionHullClearance,
  evasionHullFromLocalBounds,
  stepEvasion,
} from "../games/make-a-mess/src/game/missileEvasion.ts";
import { compileSceneGroups } from "../games/make-a-mess/src/content/scenes/compileScene.ts";
import { createCombatHexacopterPrototypeDocument } from "../games/make-a-mess/src/content/scenes/combatHexacopterPrototypeDocument.ts";
import { ductHexacopterRangePadDocument } from "../games/make-a-mess/src/content/scenes/ductHexacopterRangePadDocument.ts";
import {
  COMBAT_HEXACOPTER_RANGE_PLACEMENT,
} from "../games/make-a-mess/src/game/combatHexacopter.ts";
import {
  DUCT_HEXACOPTER_RANGE_PLACEMENT,
} from "../games/make-a-mess/src/game/rangeDuctHexacopter.ts";
import { airVehicles } from "../games/make-a-mess/src/game/airVehicles.ts";
import { massProperties } from "../games/make-a-mess/src/game/clusterDynamics.ts";
import {
  multiplyQuaternions,
  normalizeQuaternion,
  quaternionAboutAxis,
} from "../games/make-a-mess/src/game/clusterDynamics.ts";
import { structuralMaterialProfiles } from "../games/make-a-mess/src/game/destructionScene.ts";
import { explosiveProfile } from "../games/make-a-mess/src/game/destructionRuntime.ts";
import {
  rotorcraftMaximumAcceleration,
  rotorCapacityByPoint,
  rotorcraftSurgeAcceleration,
  ROTOR_COLLECTIVE_CEILING,
} from "../games/make-a-mess/src/game/rotorcraftDynamics.ts";
import { rotateVector } from "../games/make-a-mess/src/game/vehicleFrames.ts";
import {
  postureDemand,
  solvePosture,
} from "../games/make-a-mess/src/game/airCombatPosture.ts";
import {
  centreOf,
  createMachine,
  dt,
  stepMachine,
} from "../tests/rotorcraft-rig.mjs";

const capability = {
  breakSpeed: 16,
  breakSeconds: 0.8,
  margin: 2.5,
  horizonSeconds: 2.5,
};
const dynamics = {
  orientation: [0, 0, 0, 1],
  authoredNose: [0, -1],
  hull: { halfExtents: [3, 0.7, 2.4], centreOffset: [0, 0, 0] },
  horizontalAcceleration: 14.5,
  upwardAcceleration: 25,
  downwardAcceleration: 9.81,
  liftReserve: 4.2,
  surgeAcceleration: 8,
  attitudeRate: 1.9,
  maneuverScale: 1,
};
const own = {
  id: "bench-craft",
  centre: [0, 30, 0],
  velocity: [0, 0, 0],
  radius: 3,
};

function threat(direction, distance = 96, overrides = {}) {
  const length = Math.hypot(...direction) || 1;
  const axis = direction.map((value) => value / length);
  return {
    id: 1,
    ownerId: "bench-shooter",
    kind: "podRocket",
    position: axis.map(
      (value, index) => own.centre[index] + value * distance,
    ),
    velocity: axis.map((value) => -value * 96),
    blastRadius: 2,
    remainingSeconds: 1.8,
    ...overrides,
  };
}

function evade(rockets, overrides = {}) {
  return stepEvasion({
    own: overrides.own ?? own,
    rockets,
    capability: overrides.capability ?? capability,
    dynamics: overrides.dynamics ?? dynamics,
    deltaSeconds: 1 / 60,
    state: createEvasionState(),
    deck: 0,
  });
}

const vectors = {
  east: [1, 0, 0],
  west: [-1, 0, 0],
  above: [0, 1, 0],
  below: [0, -1, 0],
  south: [0, 0, 1],
  north: [0, 0, -1],
  diagonal: [1, 1, 1],
};

for (const [name, raw] of Object.entries(vectors)) {
  const length = Math.hypot(...raw);
  const axis = raw.map((value) => value / length);
  const output = evade([threat(raw)]);
  const speed = Math.hypot(...output.velocityOffset);
  const along = Math.abs(
    output.velocityOffset.reduce(
      (sum, value, index) => sum + value * axis[index],
      0,
    ),
  );
  const across = Math.sqrt(Math.max(0, speed ** 2 - along ** 2));
  const poseDegrees = output.attitude
    ? (2 * Math.acos(Math.min(1, Math.abs(output.attitude[3]))) * 180) /
      Math.PI
    : 0;
  process.stdout.write(
    `${name.padEnd(9)} ` +
      `speed=${speed.toFixed(1)}m/s ` +
      `across=${across.toFixed(1)}m/s ` +
      `pose=${poseDegrees.toFixed(1)}deg ` +
      `margin=${(output.survivalMargin ?? -Infinity).toFixed(2)}m\n`,
  );
}

const wingOwn = { ...own, radius: 4 };
const wing = evade(
  [
    {
      ...threat([0, 1, 0], 96),
      position: [3, 164.4, 0],
      blastRadius: 0.2,
    },
  ],
  {
    own: wingOwn,
    capability: { ...capability, margin: 0.2 },
    dynamics: {
      ...dynamics,
      hull: { halfExtents: [4, 0.5, 1.2], centreOffset: [0, 0, 0] },
    },
  },
);
const wingPose = wing.attitude
  ? (2 * Math.acos(Math.min(1, Math.abs(wing.attitude[3]))) * 180) / Math.PI
  : 0;
process.stdout.write(
  `edge-pass speed=${Math.hypot(...wing.velocityOffset).toFixed(1)}m/s ` +
    `pose=${wingPose.toFixed(1)}deg ` +
    `margin=${(wing.survivalMargin ?? -Infinity).toFixed(2)}m\n`,
);

const benchmarkInput = [threat([0, 1, 0])];
for (let index = 0; index < 20; index += 1) evade(benchmarkInput);
const iterations = 500;
const startedAt = performance.now();
for (let index = 0; index < iterations; index += 1) evade(benchmarkInput);
process.stdout.write(
  `decision=${((performance.now() - startedAt) / iterations).toFixed(3)}ms\n`,
);
if (process.env.EVASION_BENCH_ONLY) process.exit(0);

// ---------------------------------------------------------------------------
// РЕАЛЬНЫЕ КАДРЫ. Синтетика у нуля не ловит смешение локальных и авторских
// координат; VX-8 намеренно стоит на [30, 1.32, -26]. Эта матрица собирает
// живые bounds и центр масс тем же способом, что рантайм, и бьёт в центр и
// край корпуса с шести сторон всеми тремя ракетами.
// ---------------------------------------------------------------------------

const density = (material) => structuralMaterialProfiles[material].density;

function localBounds(vehicle, pieces) {
  const minimum = [Infinity, Infinity, Infinity];
  const maximum = [-Infinity, -Infinity, -Infinity];
  for (const piece of pieces) {
    const radius = Math.hypot(...piece.size) / 2;
    for (let axis = 0; axis < 3; axis += 1) {
      const local = piece.position[axis] - vehicle.origin[axis];
      minimum[axis] = Math.min(minimum[axis], local - radius);
      maximum[axis] = Math.max(maximum[axis], local + radius);
    }
  }
  return { minimum, maximum };
}

function deployedProfile(name, vehicle, pieces) {
  const mass = massProperties(pieces, density);
  const bounds = localBounds(vehicle, pieces);
  const hull = evasionHullFromLocalBounds(
    bounds,
    vehicle.origin,
    mass.centre,
  );
  const wrongHull = {
    halfExtents: hull.halfExtents,
    centreOffset: [0, 1, 2].map(
      (axis) =>
        (bounds.minimum[axis] + bounds.maximum[axis]) / 2 - mass.centre[axis],
    ),
  };
  const own = {
    id: vehicle.id,
    centre: [vehicle.origin[0], 30, vehicle.origin[2]],
    velocity: [0, 0, 0],
    radius: Math.max(hull.halfExtents[0], hull.halfExtents[2]),
  };
  const yawThrusters = vehicle.flight.limits.yawThrusters ?? [];
  const rotorCapacity = rotorCapacityByPoint(
    mass.mass * 9.81 * vehicle.flight.liftReserve,
    vehicle.flight.limits.enginePoints.length,
    vehicle.flight.limits.rotorCapacityWeights,
  );
  const noseLength = Math.hypot(vehicle.nose[0], vehicle.nose[2]) || 1;
  const nosePlanar = [vehicle.nose[0] / noseLength, vehicle.nose[2] / noseLength];
  const starboardPlanar = [-nosePlanar[1], nosePlanar[0]];
  let pitchMoment = 0;
  let rollMoment = 0;
  vehicle.flight.limits.enginePoints.forEach((point, index) => {
    const dx = point[0] - mass.centre[0];
    const dz = point[2] - mass.centre[2];
    const capacity = rotorCapacity[index] ?? 0;
    pitchMoment += capacity * Math.abs(dx * nosePlanar[0] + dz * nosePlanar[1]);
    rollMoment +=
      capacity * Math.abs(dx * starboardPlanar[0] + dz * starboardPlanar[1]);
  });
  return {
    name,
    vehicle,
    pieces,
    mass,
    own,
    hull,
    wrongHull,
    dynamics: {
      orientation: [0, 0, 0, 1],
      authoredNose: [vehicle.nose[0], vehicle.nose[2]],
      hull,
      horizontalAcceleration: rotorcraftMaximumAcceleration(
        vehicle.flight.maximumTilt,
      ),
      upwardAcceleration:
        (vehicle.flight.liftReserve * ROTOR_COLLECTIVE_CEILING - 1) * 9.81,
      downwardAcceleration: 9.81,
      liftReserve: vehicle.flight.liftReserve * ROTOR_COLLECTIVE_CEILING,
      surgeAcceleration: rotorcraftSurgeAcceleration({
        centreOfMass: mass.centre,
        nose: vehicle.nose,
        mass: mass.mass,
        yawThrusters,
        yawThrusterAvailability: yawThrusters.map(() => 1),
      }),
      attitudeRate: vehicle.flight.guidance?.upsetTiltRate ?? 1.9,
      attitudeAcceleration: Math.max(
        0.1,
        Math.min(
          pitchMoment / Math.max(1e-6, 2 * mass.inertia[8]),
          rollMoment / Math.max(1e-6, 2 * mass.inertia[0]),
        ),
      ),
      maneuverScale: 1,
      actuatorResponseSeconds: Math.max(
        0.06,
        Math.min(0.18, vehicle.flight.spoolSeconds / 30),
      ),
    },
  };
}

const raxVehicle = airVehicles.find((entry) => entry.id === "combat-hexacopter");
const vxVehicle = airVehicles.find((entry) => entry.id === "duct-hexacopter");
const realProfiles = [
  deployedProfile(
    "RAX",
    raxVehicle,
    compileSceneGroups(
      createCombatHexacopterPrototypeDocument(COMBAT_HEXACOPTER_RANGE_PLACEMENT),
      new Map(),
    ).clusters[0].pieces,
  ),
  deployedProfile(
    "VX",
    vxVehicle,
    compileSceneGroups(ductHexacopterRangePadDocument, new Map()).clusters.find(
      (cluster) => cluster.id === DUCT_HEXACOPTER_RANGE_PLACEMENT.clusterId,
    ).pieces,
  ),
];

const attackAxes = {
  top: [0, 1, 0],
  bottom: [0, -1, 0],
  east: [1, 0, 0],
  west: [-1, 0, 0],
  south: [0, 0, 1],
  north: [0, 0, -1],
};
const rocketKinds = ["rocket", "lance", "podRocket"];

function interceptingThreat(kind, axis, impactOffset, ownState, id, eta = 0.72) {
  const profile = explosiveProfile(kind);
  const seconds = Math.min(eta, profile.projectile.fuseMs / 1_000 - 0.2);
  const velocity = axis.map((value) => -value * profile.projectile.speed);
  const impact = ownState.centre.map(
    (value, index) =>
      value + ownState.velocity[index] * seconds + impactOffset[index],
  );
  return {
    id,
    ownerId: "bench-shooter",
    kind,
    position: impact.map((value, index) => value - velocity[index] * seconds),
    velocity,
    blastRadius: profile.blastRadius,
    remainingSeconds: profile.projectile.fuseMs / 1_000,
  };
}

function realDecision(
  profile,
  kind,
  axis,
  edge,
  moving,
  useWrongHull = false,
  eta = 0.72,
) {
  const ownState = {
    ...profile.own,
    velocity: moving ? [17, 2.5, -11] : [0, 0, 0],
  };
  const perpendicular = Math.abs(axis[1]) > 0.5
    ? [profile.hull.halfExtents[0] * 0.72, 0, 0]
    : [0, profile.hull.halfExtents[1] * 0.72, 0];
  const impactOffset = edge ? perpendicular : [0, 0, 0];
  const shot = interceptingThreat(kind, axis, impactOffset, ownState, 900, eta);
  const output = stepEvasion({
    own: ownState,
    rockets: [shot],
    capability,
    dynamics: {
      ...profile.dynamics,
      hull: useWrongHull ? profile.wrongHull : profile.hull,
    },
    deltaSeconds: 1 / 60,
    state: createEvasionState(),
    deck: 0,
  });
  return {
    seen: output.threatId === shot.id,
    command: Math.hypot(...output.velocityOffset),
    pose: output.attitude !== null,
    margin: output.survivalMargin ?? Number.NEGATIVE_INFINITY,
  };
}

process.stdout.write("\nreal deployment matrix (seen / commanded / safe):\n");
for (const profile of realProfiles) {
  for (const kind of rocketKinds) {
    let total = 0;
    let seen = 0;
    let commanded = 0;
    let safe = 0;
    const failures = [];
    for (const [side, axis] of Object.entries(attackAxes)) {
      for (const edge of [false, true]) {
        for (const moving of [false, true]) {
          total += 1;
          const result = realDecision(profile, kind, axis, edge, moving);
          if (result.seen) seen += 1;
          if (result.command > 0.1 || result.pose) commanded += 1;
          if (result.margin > 0) safe += 1;
          if (!result.seen || result.command <= 0.1 || result.margin <= 0) {
            failures.push(`${side}/${edge ? "edge" : "centre"}/${moving ? "moving" : "hover"}`);
          }
        }
      }
    }
    process.stdout.write(
      `${profile.name}/${kind.padEnd(9)} ${seen}/${total} / ${commanded}/${total} / ${safe}/${total}` +
        `${failures.length ? ` FAIL ${failures.join(",")}` : ""}\n`,
    );
  }
}

function scale3(vector, amount) {
  return vector.map((value) => value * amount);
}

function add3(left, right) {
  return left.map((value, index) => value + right[index]);
}

function normalized3(vector) {
  const magnitude = Math.hypot(...vector) || 1;
  return scale3(vector, 1 / magnitude);
}

/**
 * VX уже идёт на стрелка с диагональным наклоном; ракета наведена в центр
 * верхней поверхности ориентированного корпуса, а не в центр масс.
 */
function simulateVxUpperApproach(
  kind,
  eta,
  tiltDegrees,
  rollDegrees,
  forcedVertical = null,
) {
  const profile = realProfiles.find((entry) => entry.name === "VX");
  const towardShooter = normalized3([
    profile.vehicle.nose[0],
    0,
    profile.vehicle.nose[2],
  ]);
  const starboard = [-towardShooter[2], 0, towardShooter[0]];
  const pitch = quaternionAboutAxis(starboard, (-tiltDegrees * Math.PI) / 180);
  const roll = quaternionAboutAxis(
    towardShooter,
    (rollDegrees * Math.PI) / 180,
  );
  const initialAttitude = normalizeQuaternion(
    multiplyQuaternions(roll, pitch),
  );
  const approachVelocity = scale3(towardShooter, 20);
  const machine = createMachine({
    pieces: profile.pieces,
    vehicle: profile.vehicle,
    startPoint: profile.own.centre,
    startVelocity: approachVelocity,
    startNose: profile.vehicle.nose,
  });
  machine.state.orientation = initialAttitude;
  machine.state.angularVelocity = [0, 0, 0];

  const upperOffset = add3(
    rotateVector(initialAttitude, profile.hull.centreOffset),
    rotateVector(initialAttitude, [0, profile.hull.halfExtents[1] * 0.82, 0]),
  );
  let threat = interceptingThreat(
    kind,
    towardShooter,
    upperOffset,
    { ...profile.own, velocity: approachVelocity },
    975,
    eta,
  );
  let evasionState = createEvasionState();
  let first = null;
  let minimumClearance = Number.POSITIVE_INFINITY;
  let maximumCrossTrack = 0;
  const start = [...centreOf(machine)];
  const steps = Math.ceil((eta + 0.22) / dt);
  for (let frame = 0; frame < steps; frame += 1) {
    const centre = centreOf(machine);
    const output = stepEvasion({
      own: {
        ...profile.own,
        centre,
        velocity: machine.state.velocity,
      },
      rockets: [threat],
      capability,
      dynamics: {
        ...profile.dynamics,
        orientation: machine.state.orientation,
        angularVelocity: machine.state.angularVelocity,
        currentAcceleration: add3(
          rotateVector(machine.state.orientation, [0, 9.81, 0]),
          [0, -9.81, 0],
        ),
      },
      deltaSeconds: dt,
      state: evasionState,
      deck: 0,
    });
    first ??= output;
    evasionState = output.state;
    const forcedAcceleration = forcedVertical === null
      ? null
      : [
          0,
          forcedVertical > 0
            ? profile.dynamics.upwardAcceleration
            : -profile.dynamics.downwardAcceleration,
          0,
        ];
    const forcedPosture = forcedAcceleration
      ? solvePosture(
          profile.dynamics.authoredNose,
          rotateVector(machine.state.orientation, towardShooter),
          forcedAcceleration,
          {
            liftReserve: profile.dynamics.liftReserve,
            surgeAcceleration: profile.dynamics.surgeAcceleration,
          },
        )
      : null;
    const executed = forcedPosture
      ? {
          velocityOffset: [0, Math.sign(forcedVertical) * capability.breakSpeed, 0],
          acceleration: forcedAcceleration,
          attitude: forcedPosture.attitude,
          liftFraction: forcedPosture.liftFraction,
        }
      : output;
    const correctionAttitude = executed.attitude ?? machine.state.orientation;
    const forward = rotateVector(correctionAttitude, towardShooter);
    const correctionStarboard = rotateVector(correctionAttitude, starboard);
    stepMachine(machine, {
      forwardSpeed:
        dot3(approachVelocity, forward) + dot3(executed.velocityOffset, forward),
      lateralSpeed:
        dot3(approachVelocity, correctionStarboard) +
        dot3(executed.velocityOffset, correctionStarboard),
      yawRate: 0,
      liftFraction: executed.liftFraction ?? 0,
      pathAcceleration: executed.liftFraction == null
        ? executed.acceleration
        : [0, 0, 0],
      attitude: executed.attitude,
      attitudeRate: null,
    });
    threat = {
      ...threat,
      position: add3(threat.position, scale3(threat.velocity, dt)),
      remainingSeconds: Math.max(0, threat.remainingSeconds - dt),
    };
    const nextCentre = centreOf(machine);
    const elapsed = (frame + 1) * dt;
    const nominal = add3(start, scale3(approachVelocity, elapsed));
    maximumCrossTrack = Math.max(
      maximumCrossTrack,
      Math.hypot(
        nextCentre[0] - nominal[0],
        nextCentre[1] - nominal[1],
        nextCentre[2] - nominal[2],
      ),
    );
    const hullCentre = add3(
      nextCentre,
      rotateVector(machine.state.orientation, profile.hull.centreOffset),
    );
    minimumClearance = Math.min(
      minimumClearance,
      evasionHullClearance(
        hullCentre,
        threat.position,
        machine.state.orientation,
        profile.hull,
      ) - threat.blastRadius,
    );
  }
  const firstSpeed = Math.hypot(...first.velocityOffset);
  const firstAcross = Math.sqrt(
    Math.max(0, firstSpeed ** 2 - dot3(first.velocityOffset, towardShooter) ** 2),
  );
  return {
    detected: first.threatId === threat.id,
    firstSpeed,
    firstAcross,
    requestedMargin: first.survivalMargin,
    commandVector: first.velocityOffset,
    acceleration: first.acceleration,
    maximumCrossTrack,
    minimumClearance,
  };
}

process.stdout.write("\nVX approaching shooter, diagonal attitude, upper-hull hit:\n");
for (const eta of [0.72, 1.0, 1.35]) {
  for (const tilt of [25, 40]) {
    for (const kind of rocketKinds) {
      const result = simulateVxUpperApproach(kind, eta, tilt, 18);
      process.stdout.write(
        `${kind.padEnd(9)} eta=${eta.toFixed(2)} tilt=${tilt}° ` +
          `seen=${result.detected ? "yes" : "NO"} ` +
          `command=${result.firstSpeed.toFixed(1)}m/s ` +
          `across=${result.firstAcross.toFixed(1)}m/s ` +
          `predicted=${(result.requestedMargin ?? -Infinity).toFixed(2)}m ` +
          `crossTrack=${result.maximumCrossTrack.toFixed(2)}m ` +
          `clearance=${result.minimumClearance.toFixed(2)}m\n`,
      );
    }
  }
}
for (const kind of rocketKinds) {
  const representative = simulateVxUpperApproach(kind, 1, 40, 18);
  process.stdout.write(
    `${kind.padEnd(9)} representative vector=` +
      `[${representative.commandVector.map((value) => value.toFixed(1)).join(", ")}] ` +
      `accel=[${representative.acceleration.map((value) => value.toFixed(1)).join(", ")}]\n`,
  );
}
process.stdout.write("forced vertical comparison, eta=1.00 tilt=40°:\n");
for (const kind of rocketKinds) {
  const up = simulateVxUpperApproach(kind, 1, 40, 18, 1);
  const down = simulateVxUpperApproach(kind, 1, 40, 18, -1);
  process.stdout.write(
    `${kind.padEnd(9)} up=${up.minimumClearance.toFixed(2)}m ` +
      `down=${down.minimumClearance.toFixed(2)}m\n`,
  );
}

const auditDirections = (() => {
  const result = [];
  for (const x of [-1, 0, 1]) {
    for (const y of [-1, 0, 1]) {
      for (const z of [-1, 0, 1]) {
        if (x || y || z) result.push(normalized3([x, y, z]));
      }
    }
  }
  return result;
})();

function auditCandidate(profile, orientation, direction) {
  const horizontal = Math.hypot(direction[0], direction[2]);
  const verticalLimit = direction[1] >= 0
    ? profile.dynamics.upwardAcceleration
    : profile.dynamics.downwardAcceleration;
  const share = Math.hypot(
    horizontal / profile.dynamics.horizontalAcceleration,
    Math.abs(direction[1]) / verticalLimit,
  );
  const wanted = scale3(direction, 1 / Math.max(1e-6, share));
  const nose = rotateVector(orientation, [
    profile.dynamics.authoredNose[0],
    0,
    profile.dynamics.authoredNose[1],
  ]);
  const capability = {
    liftReserve: profile.dynamics.liftReserve,
    surgeAcceleration: profile.dynamics.surgeAcceleration,
  };
  const demand = postureDemand(nose, wanted, capability);
  if (!demand.feasible || Math.hypot(...demand.acceptedAcceleration) < 1e-6) {
    return null;
  }
  const posture = solvePosture(
    profile.dynamics.authoredNose,
    nose,
    wanted,
    capability,
  );
  return {
    velocityOffset: scale3(
      normalized3(demand.acceptedAcceleration),
      capability.breakSpeed ?? 16,
    ),
    acceleration: demand.acceptedAcceleration,
    attitude: posture.attitude,
    liftFraction: posture.liftFraction,
  };
}

function physicalOutcomeForCommand({
  profile,
  kind,
  eta,
  orientation,
  baseVelocity,
  shotAxis,
  impactLocal,
  command,
}) {
  const machine = createMachine({
    pieces: profile.pieces,
    vehicle: profile.vehicle,
    startPoint: profile.own.centre,
    startVelocity: baseVelocity,
    startNose: profile.vehicle.nose,
  });
  machine.state.orientation = orientation;
  machine.state.angularVelocity = [0, 0, 0];
  const impactOffset = add3(
    rotateVector(orientation, profile.hull.centreOffset),
    rotateVector(orientation, impactLocal),
  );
  let threat = interceptingThreat(
    kind,
    shotAxis,
    impactOffset,
    { ...profile.own, velocity: baseVelocity },
    990,
    eta,
  );
  let minimumClearance = Number.POSITIVE_INFINITY;
  const steps = Math.ceil((eta + 0.16) / dt);
  for (let frame = 0; frame < steps; frame += 1) {
    const correctionAttitude = command.attitude ?? machine.state.orientation;
    const localNose = normalized3([
      profile.vehicle.nose[0],
      0,
      profile.vehicle.nose[2],
    ]);
    const localStarboard = [-localNose[2], 0, localNose[0]];
    const forward = rotateVector(correctionAttitude, localNose);
    const starboard = rotateVector(correctionAttitude, localStarboard);
    stepMachine(machine, {
      forwardSpeed: dot3(baseVelocity, forward) + dot3(command.velocityOffset, forward),
      lateralSpeed:
        dot3(baseVelocity, starboard) + dot3(command.velocityOffset, starboard),
      yawRate: 0,
      liftFraction: command.liftFraction ?? 0,
      pathAcceleration: command.liftFraction == null
        ? command.acceleration
        : [0, 0, 0],
      attitude: command.attitude,
      attitudeRate: null,
    });
    threat = {
      ...threat,
      position: add3(threat.position, scale3(threat.velocity, dt)),
      remainingSeconds: Math.max(0, threat.remainingSeconds - dt),
    };
    const centre = centreOf(machine);
    const hullCentre = add3(
      centre,
      rotateVector(machine.state.orientation, profile.hull.centreOffset),
    );
    minimumClearance = Math.min(
      minimumClearance,
      evasionHullClearance(
        hullCentre,
        threat.position,
        machine.state.orientation,
        profile.hull,
      ) - threat.blastRadius,
    );
  }
  return minimumClearance;
}

function auditScenario(profile, attitude, velocity, surface, kind) {
  const localNose = normalized3([
    profile.vehicle.nose[0],
    0,
    profile.vehicle.nose[2],
  ]);
  const shotAxis = normalized3([
    rotateVector(attitude, localNose)[0],
    0,
    rotateVector(attitude, localNose)[2],
  ]);
  const impactOffset = add3(
    rotateVector(attitude, profile.hull.centreOffset),
    rotateVector(attitude, surface),
  );
  const threat = interceptingThreat(
    kind,
    shotAxis,
    impactOffset,
    { ...profile.own, velocity },
    991,
    1,
  );
  const liveDynamics = {
    ...profile.dynamics,
    orientation: attitude,
    angularVelocity: [0, 0, 0],
    currentAcceleration: add3(
      rotateVector(attitude, [0, 9.81, 0]),
      [0, -9.81, 0],
    ),
  };
  const decision = stepEvasion({
    own: { ...profile.own, velocity },
    rockets: [threat],
    capability,
    dynamics: liveDynamics,
    deltaSeconds: dt,
    state: createEvasionState(),
    deck: 0,
  });
  const chosen = physicalOutcomeForCommand({
    profile,
    kind,
    eta: 1,
    orientation: attitude,
    baseVelocity: velocity,
    shotAxis,
    impactLocal: surface,
    command: decision,
  });
  let oracle = Number.NEGATIVE_INFINITY;
  let oracleDirection = null;
  for (const direction of auditDirections) {
    const candidate = auditCandidate(profile, attitude, direction);
    if (!candidate) continue;
    const outcome = physicalOutcomeForCommand({
        profile,
        kind,
        eta: 1,
        orientation: attitude,
        baseVelocity: velocity,
        shotAxis,
        impactLocal: surface,
        command: candidate,
      });
    if (outcome > oracle) {
      oracle = outcome;
      oracleDirection = direction;
    }
  }
  return {
    detected: decision.threatId === threat.id,
    chosen,
    oracle,
    chosenDirection: normalized3(decision.velocityOffset),
    oracleDirection,
  };
}

process.stdout.write("\ngeneral field audit (chosen versus physical oracle):\n");
const auditedProfiles = process.env.EVASION_PROFILE
  ? realProfiles.filter((profile) => profile.name === process.env.EVASION_PROFILE)
  : realProfiles;
for (const profile of auditedProfiles) {
  const localNose = normalized3([
    profile.vehicle.nose[0],
    0,
    profile.vehicle.nose[2],
  ]);
  const localStarboard = [-localNose[2], 0, localNose[0]];
  const attitudes = {
    level: [0, 0, 0, 1],
    pitch: quaternionAboutAxis(localStarboard, (-35 * Math.PI) / 180),
    roll: quaternionAboutAxis(localNose, (28 * Math.PI) / 180),
    diagonal: normalizeQuaternion(
      multiplyQuaternions(
        quaternionAboutAxis(localNose, (22 * Math.PI) / 180),
        quaternionAboutAxis(localStarboard, (-38 * Math.PI) / 180),
      ),
    ),
  };
  const surfaces = {
    upper: [0, profile.hull.halfExtents[1] * 0.82, 0],
    lower: [0, -profile.hull.halfExtents[1] * 0.82, 0],
    side: [profile.hull.halfExtents[0] * 0.82, 0, 0],
  };
  let total = 0;
  let missed = 0;
  let wrongFatal = 0;
  let regretSum = 0;
  const failures = [];
  const byAttitude = new Map();
  for (const [attitudeName, attitude] of Object.entries(attitudes)) {
    const forward = normalized3([
      rotateVector(attitude, localNose)[0],
      0,
      rotateVector(attitude, localNose)[2],
    ]);
    const across = [-forward[2], 0, forward[0]];
    const velocities = [scale3(forward, 20), scale3(across, 15), scale3(forward, -15)];
    let attitudeFailures = 0;
    for (const [velocityIndex, velocity] of velocities.entries()) {
      for (const [surfaceName, surface] of Object.entries(surfaces)) {
        for (const kind of ["lance", "podRocket"]) {
          const result = auditScenario(profile, attitude, velocity, surface, kind);
          total += 1;
          if (!result.detected) missed += 1;
          if (result.chosen <= 0 && result.oracle > 0) {
            wrongFatal += 1;
            attitudeFailures += 1;
            failures.push(
              `${attitudeName}/${["toward", "across", "away"][velocityIndex]}` +
                `/${surfaceName}/${kind}:` +
                `${result.chosenDirection.map((value) => value.toFixed(1)).join(",")}` +
                `→${result.oracleDirection.map((value) => value.toFixed(1)).join(",")}`,
            );
          }
          regretSum += Math.max(0, result.oracle - result.chosen);
        }
      }
    }
    byAttitude.set(attitudeName, attitudeFailures);
  }
  process.stdout.write(
    `${profile.name} seen=${total - missed}/${total} ` +
      `avoidableHits=${wrongFatal}/${total} ` +
      `meanRegret=${(regretSum / total).toFixed(2)}m ` +
      `byPose=${[...byAttitude].map(([key, value]) => `${key}:${value}`).join(",")}\n`,
  );
  if (failures.length > 0) process.stdout.write(`  ${failures.join("\n  ")}\n`);
  const tolerated = profile.name === "VX" ? 2 : 0;
  if (missed > 0 || wrongFatal > tolerated) {
    throw new Error(
      `${profile.name} evasion regression: seen=${total - missed}/${total}, ` +
        `avoidableHits=${wrongFatal}/${total} (allowed ${tolerated})`,
    );
  }
}

function dot3(left, right) {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function simulatePhysicalEvasion(profile, kind, axis, eta) {
  const machine = createMachine({
    pieces: profile.pieces,
    vehicle: profile.vehicle,
    startPoint: profile.own.centre,
    startVelocity: [0, 0, 0],
    startNose: profile.vehicle.nose,
  });
  let threat = interceptingThreat(kind, axis, [0, 0, 0], profile.own, 950, eta);
  let evasionState = createEvasionState();
  let minimumClearance = Number.POSITIVE_INFINITY;
  let maximumDisplacement = 0;
  const start = [...centreOf(machine)];
  const steps = Math.ceil((eta + 0.25) / dt);
  for (let frame = 0; frame < steps; frame += 1) {
    const centre = centreOf(machine);
    const liveDynamics = {
      ...profile.dynamics,
      orientation: machine.state.orientation,
    };
    const output = stepEvasion({
      own: {
        ...profile.own,
        centre,
        velocity: machine.state.velocity,
      },
      rockets: [threat],
      capability,
      dynamics: liveDynamics,
      deltaSeconds: dt,
      state: evasionState,
      deck: 0,
    });
    evasionState = output.state;
    const correctionAttitude = output.attitude ?? machine.state.orientation;
    const noseLength = Math.hypot(
      profile.vehicle.nose[0],
      profile.vehicle.nose[2],
    ) || 1;
    const authoredNose = [
      profile.vehicle.nose[0] / noseLength,
      0,
      profile.vehicle.nose[2] / noseLength,
    ];
    const authoredStarboard = [-authoredNose[2], 0, authoredNose[0]];
    const forward = rotateVector(correctionAttitude, authoredNose);
    const starboard = rotateVector(correctionAttitude, authoredStarboard);
    stepMachine(machine, {
      forwardSpeed: dot3(output.velocityOffset, forward),
      lateralSpeed: dot3(output.velocityOffset, starboard),
      yawRate: 0,
      liftFraction: output.liftFraction ?? 0,
      pathAcceleration: output.acceleration,
      attitude: output.attitude,
      attitudeRate: null,
    });
    const nextCentre = centreOf(machine);
    maximumDisplacement = Math.max(
      maximumDisplacement,
      Math.hypot(
        nextCentre[0] - start[0],
        nextCentre[1] - start[1],
        nextCentre[2] - start[2],
      ),
    );
    threat = {
      ...threat,
      position: threat.position.map(
        (value, index) => value + threat.velocity[index] * dt,
      ),
      remainingSeconds: Math.max(0, threat.remainingSeconds - dt),
    };
    const hullCentre = nextCentre.map(
      (value, index) =>
        value +
        rotateVector(machine.state.orientation, profile.hull.centreOffset)[index],
    );
    minimumClearance = Math.min(
      minimumClearance,
      evasionHullClearance(
        hullCentre,
        threat.position,
        machine.state.orientation,
        profile.hull,
      ) - threat.blastRadius,
    );
  }
  return { minimumClearance, maximumDisplacement };
}

process.stdout.write("\nphysical rig (real rotors and inertia, centre hits):\n");
for (const eta of [0.72, 1.35]) {
  for (const profile of realProfiles) {
    let survived = 0;
    let moved = 0;
    let worst = Number.POSITIVE_INFINITY;
    let displacementSum = 0;
    let minimumDisplacement = Number.POSITIVE_INFINITY;
    const failures = [];
    for (const kind of rocketKinds) {
      for (const [side, axis] of Object.entries(attackAxes)) {
        const result = simulatePhysicalEvasion(profile, kind, axis, eta);
        if (result.minimumClearance > 0) survived += 1;
        if (result.maximumDisplacement > 0.25) moved += 1;
        displacementSum += result.maximumDisplacement;
        minimumDisplacement = Math.min(
          minimumDisplacement,
          result.maximumDisplacement,
        );
        worst = Math.min(worst, result.minimumClearance);
        if (result.minimumClearance <= 0) {
          failures.push(`${kind}/${side}`);
        }
      }
    }
    process.stdout.write(
      `${profile.name} eta=${eta.toFixed(2)}s ` +
        `moved=${moved}/18 clear=${survived}/18 worst=${worst.toFixed(2)}m` +
        ` travel=${(displacementSum / 18).toFixed(2)}m` +
        ` minTravel=${minimumDisplacement.toFixed(2)}m` +
        `${failures.length ? ` hit=${failures.join(",")}` : ""}\n`,
    );
  }
}

for (const profile of realProfiles) {
  const before = realDecision(profile, "podRocket", [0, 1, 0], false, false, true);
  const after = realDecision(profile, "podRocket", [0, 1, 0], false, false, false);
  process.stdout.write(
    `${profile.name}/top coordinate regression ` +
      `old=${before.command.toFixed(1)}m/s margin=${before.margin.toFixed(1)}m ` +
      `fixed=${after.command.toFixed(1)}m/s margin=${after.margin.toFixed(1)}m\n`,
  );
}
