import assert from "node:assert/strict";
import test from "node:test";
import { compileSceneGroups } from "../games/make-a-mess/src/content/scenes/compileScene.ts";
import {
  combatHexacopterPrototypeDocument,
  createCombatHexacopterPrototypeDocument,
} from "../games/make-a-mess/src/content/scenes/combatHexacopterPrototypeDocument.ts";
import { combatHexacopterObject } from "../games/make-a-mess/src/content/objects/vehicles/combatHexacopterObject.ts";
import {
  COMBAT_HEXACOPTER_PROTOTYPE_PLACEMENT,
  COMBAT_HEXACOPTER_RANGE_PLACEMENT,
  RAX8_TONKAWA_NAME,
  RAX8_TONKAWA_TELEMETRY_LABEL,
  combatHexacopterPoint,
  combatHexacopterPrototypeBlueprint,
  combatHexacopterPrototypeFrame,
  combatHexacopterRangeBlueprint,
  combatHexacopterYawAllocation,
  combatHexacopterYawControl,
  createCombatHexacopterBlueprint,
} from "../games/make-a-mess/src/game/combatHexacopter.ts";
import { airVehicles } from "../games/make-a-mess/src/game/airVehicles.ts";
import { massProperties, stepBody } from "../games/make-a-mess/src/game/clusterDynamics.ts";
import { structuralMaterialProfiles } from "../games/make-a-mess/src/game/destructionScene.ts";
import {
  advanceVehicleRouteProgress,
  autopilot,
  hullDrag,
  rotateVector,
  vehicleFrames,
  vehicleRotation,
} from "../games/make-a-mess/src/game/vehicleFrames.ts";
import { combatHexacopterRangePlan } from "../games/make-a-mess/src/game/combatHexacopterRangeRoutes.ts";
import {
  advanceReversibleThrusterOutput,
  advanceRotorMotorOutput,
  NEUTRAL_ROTORCRAFT_TRIM,
  rotorcraftFlightStep,
  rotorcraftSurgeAcceleration,
} from "../games/make-a-mess/src/game/rotorcraftDynamics.ts";
import {
  compileCommandActuators,
  deliveredCommandValue,
  executeCommandActuators,
} from "../games/make-a-mess/src/game/vehicleActuation.ts";
import { updatePropulsionFeedback } from "../games/make-a-mess/src/game/vehiclePropulsionAutomation.ts";
import {
  DEFAULT_VEHICLE_FAILURE_ENVELOPE,
  vehicleFailureEnvelopeFor,
} from "../games/make-a-mess/src/game/vehicleFailure.ts";
import { carrierHullPoint } from "../games/make-a-mess/src/game/vehicleImpactTelemetry.ts";

const compiled = compileSceneGroups(combatHexacopterPrototypeDocument, new Map());
const vehicle = compiled.clusters.find(
  (cluster) => cluster.id === COMBAT_HEXACOPTER_PROTOTYPE_PLACEMENT.clusterId,
);

test("принятое имя принадлежит модели и её телеметрии, а не внутренним compatibility-id", () => {
  assert.equal(RAX8_TONKAWA_NAME, "RAX-8 Tonkawa");
  assert.equal(combatHexacopterObject.title.startsWith(RAX8_TONKAWA_NAME), true);
  assert.equal(combatHexacopterPrototypeBlueprint.telemetryLabel, RAX8_TONKAWA_TELEMETRY_LABEL);
  assert.equal(combatHexacopterPrototypeFrame.telemetryLabel, "RAX-8 TONKAWA");
});

test("принятая C2 собирается в один разрушаемый кластер без параллельной геометрии", () => {
  assert.ok(vehicle);
  assert.equal(compiled.clusters.length, 1);
  assert.equal(vehicle.pieces.length, combatHexacopterObject.parts.length);
  assert.equal(vehicle.pieces.length, 667);
  assert.equal(vehicle.pieces.some((piece) => piece.id.includes("outer-torque-rail")), false);
});

test("шесть подъёмных и два управляющих привода имеют отдельные живые каналы", () => {
  assert.ok(vehicle);
  const channels = new Set(
    vehicle.pieces
      .map((piece) => piece.actuator?.commandChannel)
      .filter(Boolean),
  );
  assert.deepEqual([...channels].sort(), [
    "throttle:0",
    "throttle:1",
    "throttle:2",
    "throttle:3",
    "throttle:4",
    "throttle:5",
    "yaw-throttle:0",
    "yaw-throttle:1",
  ]);
  const required = vehicle.pieces.filter((piece) => piece.actuator?.required);
  assert.equal(required.filter((piece) => piece.actuator.commandChannel.startsWith("throttle:")).length, 6);
  assert.equal(required.filter((piece) => piece.actuator.commandChannel.startsWith("yaw-throttle:")).length, 2);
  assert.equal(vehicle.pieces.filter((piece) => /:engine:\d+:blade:\d+:piece$/.test(piece.id)).length, 30);
  assert.equal(vehicle.pieces.filter((piece) => /:yaw-engine:\d+:blade:\d+:piece$/.test(piece.id)).length, 14);
});

test("каждый мотор, винт, пилон, панель, оружие и огонь имеет путь к силовому кластеру", () => {
  const rangeDocument = createCombatHexacopterPrototypeDocument(COMBAT_HEXACOPTER_RANGE_PLACEMENT);
  const groups = compileSceneGroups(rangeDocument, new Map());
  assert.equal(groups.clusters[0].pieces.length, 667);
  for (const piece of groups.clusters[0].pieces) {
    assert.equal(piece.sideAttachmentReach > 0, true, piece.id);
  }
});

test("винты разворота действительно диагональны, реверсивны и создают момент в висении", () => {
  const thrusters = combatHexacopterPrototypeBlueprint.yawThrusters;
  assert.equal(thrusters.length, 2);
  assert.equal(thrusters[0].axis[0] < -0.25, true);
  assert.equal(thrusters[1].axis[0] > 0.25, true);
  assert.equal(thrusters.every((thruster) => thruster.axis[2] > 0.9), true);

  const positive = combatHexacopterYawAllocation(
    combatHexacopterPrototypeBlueprint,
    120,
  );
  const negative = combatHexacopterYawAllocation(
    combatHexacopterPrototypeBlueprint,
    -120,
  );
  assert.equal(positive.commands[0] > 0 && positive.commands[1] < 0, true);
  assert.equal(negative.commands[0] < 0 && negative.commands[1] > 0, true);
  assert.equal(Math.abs(positive.yawMoment - 120) < 1e-6, true);
  assert.equal(Math.abs(negative.yawMoment + 120) < 1e-6, true);
  assert.equal(Math.abs(positive.netForce[2]) < 1e-8, true);
  assert.equal(Math.abs(positive.netForce[0]) > 20, true, "диагональная установка обязана сообщить о связанной боковой силе");

  const saturated = combatHexacopterYawAllocation(
    combatHexacopterPrototypeBlueprint,
    1e6,
  );
  assert.equal(saturated.commands.every((command) => Math.abs(command) <= 1), true);
  assert.equal(saturated.yawMoment > 250 && saturated.yawMoment < 320, true);
});

test("автопилот задаёт обычный yaw-rate, а нижний контур сочетает оба способа поворота", () => {
  const combined = combatHexacopterYawControl(
    combatHexacopterPrototypeBlueprint,
    {
      wantedYawRate: 0.8,
      actualYawRate: 0.1,
      yawInertia: 35.87,
      primaryMinimumMoment: -70,
      primaryMaximumMoment: 70,
    },
  );
  assert.equal(combined.wantedYawMoment > 59 && combined.wantedYawMoment < 61, true);
  assert.equal(combined.primaryYawMoment > 20, true, "обычный реактивный канал выключен");
  assert.equal(combined.auxiliary.yawMoment > 35, true, "дополнительные винты не помогают");
  assert.equal(Math.abs(combined.deliveredYawMoment - combined.wantedYawMoment) < 1e-6, true);
  assert.equal(Math.abs(combined.acceptedYawRate - 0.8) < 1e-6, true);

  const withoutFans = combatHexacopterYawControl(
    combatHexacopterPrototypeBlueprint,
    {
      wantedYawRate: 0.8,
      actualYawRate: 0.1,
      yawInertia: 35.87,
      primaryMinimumMoment: -70,
      primaryMaximumMoment: 70,
      yawFanAvailability: [0, 0],
    },
  );
  assert.equal(withoutFans.auxiliary.yawMoment, 0);
  assert.equal(Math.abs(withoutFans.primaryYawMoment - withoutFans.wantedYawMoment) < 1e-6, true);

  const withoutPrimary = combatHexacopterYawControl(
    combatHexacopterPrototypeBlueprint,
    {
      wantedYawRate: 0.8,
      actualYawRate: 0.1,
      yawInertia: 35.87,
      primaryMinimumMoment: 0,
      primaryMaximumMoment: 0,
    },
  );
  assert.equal(withoutPrimary.primaryYawMoment, 0);
  assert.equal(Math.abs(withoutPrimary.auxiliary.yawMoment - withoutPrimary.wantedYawMoment) < 1e-6, true);
});

test("задняя пара остаётся более мощной, а паспорт полёта боевым", () => {
  const weights = combatHexacopterPrototypeBlueprint.rotorCapacityWeights;
  assert.equal(weights.length, 6);
  assert.equal(weights.slice(0, 4).every((weight) => Math.abs(weight - 1) < 1e-9), true);
  assert.equal(weights[4] > 1.3 && weights[5] > 1.3, true);
  assert.equal(combatHexacopterPrototypeBlueprint.rotorSpinDirections.length, 6);
  // Запас подъёма держит не высоту, а КРЕН: в координированном вираже тяга
  // равна весу на косинус крена, и на паспортных 56° это 1.79 висения ещё до
  // запаса на моменты. Предел наклона поставлен там, где кончается рыскание
  // (0.70 рад/с из располагаемых 0.72 на вираже радиуса 30 м), а не тяга —
  // по тяге машина взяла бы 73.7°.
  const flight = combatHexacopterPrototypeBlueprint.flight;
  assert.equal(flight.liftReserve, 4.2);
  const loadFactor = flight.liftReserve * 0.85;
  assert.equal(
    flight.maximumTilt < Math.acos(1 / loadFactor),
    true,
    "паспортный крен вышел за то, что способна удержать тяга",
  );
  assert.equal(
    Math.abs(flight.maximumTilt - (56 * Math.PI) / 180) < 1e-9,
    true,
  );
});

test("силовой путь и броня входят в сцену сталью, а стекло остаётся стеклом", () => {
  assert.ok(vehicle);
  for (const pattern of [
    /clevis-inboard-/,
    /ring-saddle-/,
    /core-root-doubler-/,
    /survival-keel/,
  ]) {
    const pieces = vehicle.pieces.filter((piece) => pattern.test(piece.id));
    assert.equal(pieces.length > 0, true, `нет узла ${pattern}`);
    assert.equal(pieces.every((piece) => piece.material === "steel"), true);
  }
  const glazing = vehicle.pieces.filter((piece) =>
    /canopy-glazing|sensor-window|sensor-blister/.test(piece.id),
  );
  assert.equal(glazing.length >= 3, true);
  assert.equal(glazing.every((piece) => piece.material === "darkGlass"), true);
});

test("масса и центр масс вычисляются из тех же 667 физических деталей", () => {
  assert.ok(vehicle);
  const properties = massProperties(
    vehicle.pieces,
    (material) => structuralMaterialProfiles[material].density,
  );
  assert.equal(properties.mass > 9 && properties.mass < 10, true, `масса ${properties.mass}`);
  assert.equal(Math.abs(properties.centre[0]) < 0.01, true);
  assert.equal(properties.centre[1] > 1 && properties.centre[1] < 1.08, true);
  assert.equal(properties.centre[2] > 0.15 && properties.centre[2] < 0.25, true);
});

test("четыре аэронавигационных огня едут с машиной и не перепутаны", () => {
  assert.equal(compiled.lamps.length, 4);
  assert.equal(
    compiled.lamps.every((lamp) =>
      lamp.carrierClusterId === COMBAT_HEXACOPTER_PROTOTYPE_PLACEMENT.clusterId),
    true,
  );
  const starboard = compiled.lamps.find((lamp) => lamp.id.includes("nav-starboard-lens"));
  const port = compiled.lamps.find((lamp) => lamp.id.includes("nav-port-lens"));
  assert.equal(starboard?.color, "#6bff9c");
  assert.equal(port?.color, "#ff665f");
});

test("одно размещение поворачивает геометрию, двигатели, датчики и кадр вместе", () => {
  const placement = {
    sceneId: "combat-hexacopter-placement-test",
    clusterId: "combat-hexacopter-placement-test:vehicle",
    position: [17, 3, -22],
    yaw: Math.PI / 2,
  };
  const blueprint = createCombatHexacopterBlueprint(placement);
  const document = createCombatHexacopterPrototypeDocument(placement);
  const placed = compileSceneGroups(document, new Map()).clusters[0];
  assert.deepEqual(combatHexacopterPoint(placement, [0, 0, 1]), [18, 3, -22]);
  assert.equal(Math.abs(blueprint.nose[0] - 1) < 1e-9, true);
  assert.equal(Math.abs(blueprint.nose[2]) < 1e-9, true);
  assert.equal(placed.id, placement.clusterId);
  assert.equal(placed.pieces.length, 667);
  assert.equal(blueprint.enginePoints.length, 6);
  assert.equal(blueprint.proximitySensors.length, 22);
});

test("авторский прототип изолирован, а принятая машина зарегистрирована только в полигоне", () => {
  assert.equal(combatHexacopterPrototypeFrame.clusterId, COMBAT_HEXACOPTER_PROTOTYPE_PLACEMENT.clusterId);
  // Независимое тело — только вращающемуся: лопасти обоих видов содержат
  // ":blade:". Маска шире (":engine:") делала телом всю гондолу — 390 кусков
  // при 44 вращающихся.
  assert.deepEqual(combatHexacopterPrototypeFrame.independentMemberMatches, [":blade:"]);
  const registeredFrame = vehicleFrames.find((frame) => frame.id === "combat-hexacopter");
  const registeredVehicle = airVehicles.find((vehicle) => vehicle.id === "combat-hexacopter");
  assert.equal(registeredFrame?.clusterId, COMBAT_HEXACOPTER_RANGE_PLACEMENT.clusterId);
  assert.equal(registeredVehicle?.clusterId, COMBAT_HEXACOPTER_RANGE_PLACEMENT.clusterId);
  assert.notEqual(registeredFrame?.clusterId, COMBAT_HEXACOPTER_PROTOTYPE_PLACEMENT.clusterId);
});

// ---------------------------------------------------------------------------
// ПОЛЁТ ЧЕРЕЗ НАСТОЯЩИЕ СИЛЫ
//
// Всё, что выше, — паспорт: раскладка, плечи, пределы. Ниже машина ЛЕТИТ: тот
// же общий автопилот, тот же общий винтокрылый шаг, те же актуаторы и та же
// инерция приводов, что в рантайме. Разница принципиальная. Стенд, который
// считает момент сам, зеленеет и тогда, когда орган управления не подключён к
// физике вовсе — ровно это и случилось с тоннелями рыскания: паспорт был
// верен, тесты проходили, а в игре вентиляторы не работали ни секунды.
// ---------------------------------------------------------------------------

const rangeVehicle = airVehicles.find((entry) => entry.id === "combat-hexacopter");
const rangeFlight = rangeVehicle.flight;
const rangePieces = compileSceneGroups(
  createCombatHexacopterPrototypeDocument(COMBAT_HEXACOPTER_RANGE_PLACEMENT),
  new Map(),
).clusters[0].pieces;
const rangeMass = massProperties(
  rangePieces,
  (material) => structuralMaterialProfiles[material].density,
);
const rangeActuators = compileCommandActuators(rangePieces);
const rangeLocalBounds = (() => {
  const minimum = [Infinity, Infinity, Infinity];
  const maximum = [-Infinity, -Infinity, -Infinity];
  for (const piece of rangePieces) {
    for (let axis = 0; axis < 3; axis += 1) {
      minimum[axis] = Math.min(minimum[axis], piece.position[axis] - piece.size[axis] / 2);
      maximum[axis] = Math.max(maximum[axis], piece.position[axis] + piece.size[axis] / 2);
    }
  }
  return { minimum, maximum };
})();

/**
 * Один круг по авторскому маршруту. `brokenPieces` выбивает куски так же, как
 * это делает попадание: членство в теле — единственный источник живучести.
 */
function flyRangeCircuit({ brokenPieces = [], yawThrusters = true } = {}) {
  const broken = new Set(
    rangePieces
      .filter((piece) => brokenPieces.some((match) => piece.id.includes(match)))
      .map((piece) => piece.id),
  );
  const attached = new Set(
    rangePieces.map((piece) => piece.id).filter((id) => !broken.has(id)),
  );
  const fans = yawThrusters ? rangeFlight.limits.yawThrusters : undefined;
  const machine = {
    points: rangeFlight.limits.enginePoints,
    yawThrusters: fans,
    centreOfMass: rangeMass.centre,
    nose: rangeVehicle.nose,
    mass: rangeMass.mass,
    inertia: [rangeMass.inertia[0], rangeMass.inertia[4], rangeMass.inertia[8]],
    liftCapacity: rangeMass.mass * 9.81 * rangeFlight.liftReserve,
    capacityWeights: rangeFlight.limits.rotorCapacityWeights,
    spinDirections: rangeFlight.limits.rotorSpinDirections,
    maximumTilt: rangeFlight.maximumTilt,
  };
  const baseModel = {
    mass: rangeMass.mass,
    inertiaYaw: rangeMass.inertia[4],
    bodyCentre: rangeMass.centre,
    dragLinear: rangeMass.mass * rangeFlight.linearDamping,
    dragLateral:
      rangeMass.mass * rangeFlight.linearDamping * rangeFlight.lateralDragRatio,
    dragAngular: rangeMass.inertia[4] * rangeFlight.angularDamping,
    limits: rangeFlight.limits,
    // ВЕКТОРНАЯ ТЯГА — ИЗ ТОГО ЖЕ ПРИЗНАКА, ЧТО В РАНТАЙМЕ (`liftSource`), а не
    // руками. Он переключает ЗАКОН ДВИЖЕНИЯ: без него автопилот считает, что
    // тело едет туда, куда смотрит нос. Стенд без него совпадал с машиной ровно
    // до тех пор, пока нос совпадал с направлением хода, и разошёлся полностью
    // на первом же участке, где маршрут объявил курс отдельно от движения.
    vectoredTranslation: rangeFlight.liftSource === "rotor",
    // Как в рантайме: авторский предел — потолок по замыслу, рабочую точку
    // считает governor из живого паспорта. Без этого стенд летал бы по
    // маршруту, которого в игре больше нет.
    turnCapability: {
      responseSeconds: 0.8,
      yawRate: 0.9,
      lateralAcceleration: 9.81 * Math.tan(rangeFlight.maximumTilt),
      braking: 9.81 * Math.tan(rangeFlight.maximumTilt) + 24.8,
    },
  };
  const plan = combatHexacopterRangePlan(COMBAT_HEXACOPTER_RANGE_PLACEMENT.position);
  const dt = 1 / 60;
  let state = {
    position: [0, 0, 0],
    velocity: [0, 0, 0],
    angularVelocity: [0, 0, 0],
    orientation: vehicleRotation(
      { position: [0, 0, 0], yaw: 0, pitch: 0, roll: 0 },
      rangeVehicle.nose,
    ),
  };
  let progress = 0;
  let trim = NEUTRAL_ROTORCRAFT_TRIM;
  let feedback = rangeFlight.limits.enginePoints.map(() => 1);
  let motorOutput = rangeFlight.limits.enginePoints.map(() => 1 / rangeFlight.liftReserve);
  let fanOutput = (fans ?? []).map(() => 0);
  let fanHealth = (fans ?? []).map(() => 1);
  let yawRateLimits = null;
  let flightTime = rangeFlight.spoolSeconds;
  let seconds = 0;
  let worstHeadingError = 0;
  let worstCrossTrack = 0;
  let peakFanCommand = 0;
  let peakFanOutput = 0;
  let fanCommandSigns = new Set();
  let peakYawRate = 0;
  for (let step = 0; step < 60 * 400; step += 1) {
    const centre = rangeMass.centre.map((value, index) => value + state.position[index]);
    const piloted = autopilot(
      plan,
      progress,
      centre,
      state.orientation,
      state.velocity,
      state.angularVelocity,
      yawRateLimits
        ? { ...baseModel, engineAvailability: feedback, yawRateLimits }
        : { ...baseModel, engineAvailability: feedback },
      Math.max(0, Math.min(1, (flightTime - rangeFlight.underwaySeconds) / 8)),
      rangeVehicle.nose,
      rangeFlight.approach,
    );
    const rotor = rotorcraftFlightStep(
      {
        ...machine,
        availability: feedback,
        motorOutput,
        yawThrusterAvailability: fanHealth,
        yawThrusterOutput: fanOutput,
      },
      {
        orientation: state.orientation,
        centre,
        velocity: state.velocity,
        angularVelocity: state.angularVelocity,
      },
      {
        forwardSpeed: piloted.guidance.forwardSpeed,
        lateralSpeed: piloted.guidance.lateralSpeed,
        yawRate: piloted.guidance.yawRate,
        collective: piloted.guidance.liftFraction,
        // Упреждение — часть контракта guidance, и стенд обязан летать тем же
        // законом, что рантайм: без этой строки тест доказывал полёт, которого
        // в игре нет.
        pathAcceleration: piloted.guidance.pathAcceleration,
      },
      trim,
      dt,
      0.9,
    );
    trim = rotor.trim;
    yawRateLimits = rotor.result.yawRateLimits;
    const actuation = executeCommandActuators(
      rangeActuators,
      attached,
      Object.fromEntries([
        ...rotor.result.commandedThrottle.map(
          (value, index) => [`throttle:${index}`, value],
        ),
        ...rotor.result.commandedYawThrusters.map(
          (value, index) => [`yaw-throttle:${index}`, value],
        ),
      ]),
    );
    motorOutput = motorOutput.map((value, index) =>
      advanceRotorMotorOutput(
        value,
        deliveredCommandValue(actuation, `throttle:${index}`, rotor.result.commandedThrottle[index]),
        dt,
        rangeFlight.spoolSeconds,
      ),
    );
    fanOutput = fanOutput.map((value, index) =>
      advanceReversibleThrusterOutput(
        value,
        deliveredCommandValue(
          actuation,
          `yaw-throttle:${index}`,
          rotor.result.commandedYawThrusters[index],
        ),
        dt,
        rangeFlight.spoolSeconds,
      ),
    );
    feedback = updatePropulsionFeedback(feedback, actuation, motorOutput.length);
    fanHealth = [
      ...updatePropulsionFeedback(fanHealth, actuation, fanOutput.length, "yaw-throttle:"),
    ];
    for (const command of rotor.result.commandedYawThrusters) {
      peakFanCommand = Math.max(peakFanCommand, Math.abs(command));
      if (Math.abs(command) > 0.005) fanCommandSigns.add(Math.sign(command));
    }
    peakFanOutput = Math.max(peakFanOutput, ...fanOutput.map(Math.abs), 0);
    peakYawRate = Math.max(peakYawRate, Math.abs(rotor.result.yawRate));

    const facing = rotateVector(state.orientation, rangeVehicle.nose);
    const flat = Math.hypot(facing[0], facing[2]) || 1;
    const stepped = stepBody(
      { ...state, position: centre },
      rangeMass,
      [
        { force: [0, -rangeMass.mass * 9.81, 0], point: centre },
        ...rotor.forces,
        {
          force: hullDrag(state.velocity, [facing[0] / flat, facing[2] / flat], baseModel),
          point: centre,
        },
      ],
      { linear: 0, angular: rangeMass.inertia[4] * rangeFlight.angularDamping },
      dt,
    );
    state = {
      ...stepped,
      position: stepped.position.map((value, index) => value - rangeMass.centre[index]),
    };
    flightTime += dt;
    seconds += dt;
    if (flightTime >= rangeFlight.underwaySeconds) {
      progress = advanceVehicleRouteProgress(
        plan,
        progress,
        centre,
        Math.hypot(state.velocity[0], state.velocity[2]) * dt,
      );
    }
    // Курс требуется по касательной только на самом круге: у причала нос
    // отдаётся посадочному створу, и мерить его касательной было бы враньём.
    if (progress > 0.03 && progress < 0.9) {
      const ahead = plan.point(Math.min(1, progress + 0.01));
      const behind = plan.point(Math.max(0, progress - 0.01));
      const tangentLength = Math.hypot(ahead[0] - behind[0], ahead[2] - behind[2]) || 1;
      let error =
        Math.atan2(facing[0], facing[2]) -
        Math.atan2(
          (ahead[0] - behind[0]) / tangentLength,
          (ahead[2] - behind[2]) / tangentLength,
        );
      while (error > Math.PI) error -= Math.PI * 2;
      while (error < -Math.PI) error += Math.PI * 2;
      worstHeadingError = Math.max(worstHeadingError, Math.abs(error));
      const target = plan.point(progress);
      worstCrossTrack = Math.max(
        worstCrossTrack,
        Math.hypot(centre[0] - target[0], centre[2] - target[2]),
      );
    }
    if (progress >= 0.94) {
      return {
        completed: true,
        seconds,
        worstHeadingError,
        worstCrossTrack,
        peakFanCommand,
        peakFanOutput,
        fanCommandSigns,
        peakYawRate,
        fanHealth,
      };
    }
  }
  return {
    completed: false,
    seconds,
    worstHeadingError,
    worstCrossTrack,
    peakFanCommand,
    peakFanOutput,
    fanCommandSigns,
    peakYawRate,
    fanHealth,
  };
}

test("машина держит ТРАССУ, а не курс, и тоннели работают настоящими силами", () => {
  // Мерится отклонение от линии и высота. Курс на маршруте НЕ мерится
  // намеренно: голономная машина держит трассу перемещением, а нос доворачивает
  // когда физически может. Требовать от неё курс в вираже — навязывать
  // ограничение самолёта и получить рейсовый автобус.
  const flown = flyRangeCircuit();
  assert.equal(flown.completed, true, "круг не пройден");
  // ДОПУСК СПРАШИВАЕТСЯ У ТРАССЫ, а не держится числом здесь. Тридцать два
  // метра были верны для круга, у которого коридор всюду один; у программы
  // показа он разный по участкам — узкий у земли, широкий там, где объявлена
  // фигура. Тест, знающий свою цифру, судил бы машину по чужому требованию.
  const plan = combatHexacopterRangePlan(COMBAT_HEXACOPTER_RANGE_PLACEMENT.position);
  let widest = 0;
  for (let index = 0; index <= 400; index += 1) {
    widest = Math.max(widest, plan.corridor?.(index / 400) ?? 0);
  }
  assert.equal(
    flown.worstCrossTrack < widest,
    true,
    `машина уходит от трассы на ${flown.worstCrossTrack.toFixed(1)} м при самом широком коридоре ${widest.toFixed(0)} м`,
  );
  assert.equal(
    flown.peakFanCommand > 0.02,
    true,
    "вентиляторы не получили ни одной заметной команды за весь круг",
  );
  assert.deepEqual(
    [...flown.fanCommandSigns].sort(),
    [-1, 1],
    "реверсивный канал должен работать в обе стороны за круг",
  );
});

test("без тоннелей та же машина проходит круг заметно дольше", () => {
  const withFans = flyRangeCircuit();
  const withoutFans = flyRangeCircuit({ yawThrusters: false });
  assert.equal(
    withoutFans.seconds > withFans.seconds * 1.3,
    true,
    `без тоннелей ${withoutFans.seconds.toFixed(0)} с против ${withFans.seconds.toFixed(0)} с`,
  );
});

test("выбитый мотор тоннеля не выключает рыскание, а только сужает его", () => {
  const one = flyRangeCircuit({ brokenPieces: [":yaw-engine:0:motor:"] });
  assert.equal(one.completed, true, "с одним тоннелем круг обязан быть пройден");
  assert.deepEqual(one.fanHealth.map((value) => value > 0.5), [false, true]);
  assert.equal(
    one.peakFanCommand > 0.02,
    true,
    "уцелевший тоннель обязан продолжать работать",
  );
  assert.equal(
    one.worstCrossTrack < 40,
    true,
    `с одним тоннелем трасса потеряна: ${one.worstCrossTrack.toFixed(1)} м`,
  );
});

test("потеря обеих лопастей одного тоннеля ослабляет канал, а не обнуляет его", () => {
  const half = flyRangeCircuit({
    brokenPieces: [":yaw-engine:0:blade:0:", ":yaw-engine:0:blade:1:", ":yaw-engine:0:blade:2:"],
  });
  assert.equal(half.completed, true);
  assert.equal(half.fanHealth[0] > 0 && half.fanHealth[0] < 1, true, `живучесть ${half.fanHealth[0]}`);
  assert.equal(half.fanHealth[1], 1);
});

test("оба тоннеля выбиты — автоматика доводит машину на одном реактивном моменте", () => {
  const none = flyRangeCircuit({
    brokenPieces: [":yaw-engine:0:motor:", ":yaw-engine:1:motor:"],
  });
  assert.deepEqual(none.fanHealth, [0, 0]);
  // Один пробный запрос канал получает обязательно: живучесть узнаётся ТОЛЬКО
  // из пары «просьба → доставка», и никакого другого источника у неё нет.
  // Проверять надо доставку: тоннель без мотора не даёт тяги ни разу.
  assert.equal(none.peakFanOutput < 1e-9, true, "мёртвый тоннель выдал тягу");
  assert.equal(
    Number.isFinite(none.worstCrossTrack) && none.worstCrossTrack < 400,
    true,
    "без обоих тоннелей машина обязана остаться управляемой, пусть и вяло",
  );
});

test("разгон — только здоровой парой: деградация одного выключает синфазную тягу у обоих", () => {
  // Правило Igor, явное, а не следствие алгебры: выбитый или сильно
  // деградировавший тоннель означает, что синфазная тяга ЛЮБОГО из них создаёт
  // момент, который нечем компенсировать. Источник момента убирается целиком:
  // пара остаётся органом рыскания (одиночный — реверсом), но не разгона.
  const surge = (availability) =>
    rotorcraftSurgeAcceleration({
      yawThrusters: rangeFlight.limits.yawThrusters,
      yawThrusterAvailability: availability,
      nose: rangeVehicle.nose,
      centreOfMass: rangeMass.centre,
      mass: rangeMass.mass,
    });
  assert.equal(surge([1, 1]) > 20, true, "здоровая пара обязана разгонять");
  assert.equal(surge([1, 0.9]) > 20, true, "лёгкая потёртость — ещё пара");
  assert.equal(surge([1, 0.5]), 0, "полуживой тоннель: разгон закрыт ОБОИМ");
  assert.equal(surge([0, 1]), 0, "мёртвый тоннель: разгон закрыт ОБОИМ");
  // Рыскание при этом живо: одиночному тоннелю момент разрешён.
  const machine = {
    points: rangeFlight.limits.enginePoints,
    yawThrusters: rangeFlight.limits.yawThrusters,
    centreOfMass: rangeMass.centre,
    nose: rangeVehicle.nose,
    mass: rangeMass.mass,
    inertia: [rangeMass.inertia[0], rangeMass.inertia[4], rangeMass.inertia[8]],
    availability: rangeFlight.limits.enginePoints.map(() => 1),
    liftCapacity: rangeMass.mass * 9.81 * rangeFlight.liftReserve,
    capacityWeights: rangeFlight.limits.rotorCapacityWeights,
    spinDirections: rangeFlight.limits.rotorSpinDirections,
    yawThrusterAvailability: [0, 1],
    maximumTilt: rangeFlight.maximumTilt,
  };
  const spun = rotorcraftFlightStep(
    machine,
    {
      orientation: vehicleRotation(
        { position: [0, 0, 0], yaw: 0, pitch: 0, roll: 0 },
        rangeVehicle.nose,
      ),
      centre: rangeMass.centre,
      velocity: [0, 0, 0],
      angularVelocity: [0, 0, 0],
    },
    { forwardSpeed: 0, lateralSpeed: 0, yawRate: 0.6, collective: 0 },
    NEUTRAL_ROTORCRAFT_TRIM,
    1 / 60,
    0.9,
  ).result;
  assert.equal(
    Math.abs(spun.commandedYawThrusters[1]) > 0.01,
    true,
    "уцелевший тоннель обязан отвечать за рыскание",
  );
  assert.equal(
    Math.abs(spun.commandedYawThrusters[0]) < 1e-9,
    true,
    "мёртвому не командуют",
  );
});

test("развёрнутая пара честно сообщает свою боковую силу, а не прячет её", () => {
  const pure = combatHexacopterYawAllocation(combatHexacopterRangeBlueprint, 200);
  assert.equal(Math.abs(pure.yawMoment - 200) < 1e-6, true);
  assert.equal(Math.abs(pure.netForce[2]) < 1e-8, true);
  assert.equal(
    Math.abs(pure.netForce[0]) > 20,
    true,
    "установка под углом обязана давать боковую силу",
  );
});

test("лопасти тоннеля не принадлежат подъёмному кольцу и крутятся своим каналом", () => {
  const yawBlades = rangePieces.filter((piece) =>
    /:yaw-engine:\d+:blade:\d+:piece$/.test(piece.id),
  );
  assert.equal(yawBlades.length, 14);
  for (const blade of yawBlades) {
    // Разбор подъёмных винтов ищет `:engine:<номер>:blade:`; поймай он тоннель,
    // вентилятор крутился бы оборотами ближайшего подъёмного кольца.
    assert.equal(/^(.*:engine:-?\d+):blade:/.test(blade.id), false, blade.id);
    assert.match(blade.actuator.commandChannel, /^yaw-throttle:[01]$/);
  }
  assert.equal(
    rangeFlight.limits.yawThrusters.length,
    2,
    "паспорт машины обязан объявлять оба тоннеля общему коду",
  );
});

test("конверт отказов следует паспорту машины, а не помнится отдельным числом", () => {
  // Живой полёт дал `CRITICALATTITUDE` при 53.1° тангажа, когда все шесть
  // приводов доставляли ровно заказанное. Отказа не было: машине подняли
  // разрешённый наклон до 56°, а порог аварии остался общим — 39.6°, писанным
  // под прежние 34°. Число нельзя помнить отдельно от того, из чего оно следует.
  const vehicle = airVehicles.find((entry) => entry.id === "combat-hexacopter");
  const envelope = vehicleFailureEnvelopeFor(vehicle.flight);
  assert.equal(
    envelope.maximumPitch > vehicle.flight.maximumTilt,
    true,
    `авария при ${envelope.maximumPitch} объявлена раньше разрешённых ${vehicle.flight.maximumTilt}`,
  );
  assert.equal(
    envelope.maximumRoll > vehicle.flight.maximumTilt,
    true,
    "в координированном вираже крен ровно паспортный, аварией он быть не может",
  );
  // Пятьдесят три градуса из отчёта живого полёта обязаны стать штатными.
  assert.equal(envelope.maximumPitch > (53.1 * Math.PI) / 180, true);

  // А машина, которая про наклон ничего не объявляет, не меняется вовсе.
  const airship = airVehicles.find((entry) => entry.id === "town-airship");
  assert.deepEqual(
    vehicleFailureEnvelopeFor(airship.flight),
    DEFAULT_VEHICLE_FAILURE_ENVELOPE,
  );
});

test("автомат сообщает не только сколько не дал, но и что именно упёрлось", () => {
  const properties = rangeMass;
  const machine = {
    points: rangeFlight.limits.enginePoints,
    yawThrusters: rangeFlight.limits.yawThrusters,
    centreOfMass: properties.centre,
    nose: rangeVehicle.nose,
    mass: properties.mass,
    inertia: [properties.inertia[0], properties.inertia[4], properties.inertia[8]],
    availability: rangeFlight.limits.enginePoints.map(() => 1),
    liftCapacity: properties.mass * 9.81 * rangeFlight.liftReserve,
    capacityWeights: rangeFlight.limits.rotorCapacityWeights,
    spinDirections: rangeFlight.limits.rotorSpinDirections,
    yawThrusterAvailability: [1, 1],
    maximumTilt: rangeFlight.maximumTilt,
  };
  const state = {
    orientation: vehicleRotation(
      { position: [0, 0, 0], yaw: 0, pitch: 0, roll: 0 },
      rangeVehicle.nose,
    ),
    centre: properties.centre,
    velocity: [0, 0, 0],
    angularVelocity: [0, 0, 0],
  };
  const step = (request, tweak = {}) =>
    rotorcraftFlightStep(
      { ...machine, ...tweak },
      state,
      { forwardSpeed: 0, lateralSpeed: 0, yawRate: 0, collective: 0, ...request },
      NEUTRAL_ROTORCRAFT_TRIM,
      1 / 60,
      0.9,
    ).result.limits;

  // 1. Висение без просьб: упираться не во что.
  const idle = step({});
  assert.equal(idle.yaw, "none");
  assert.equal(idle.pitch, "none");
  assert.equal(idle.surge, "none");

  // 2. Просьба крутиться вчетверо быстрее собственного потолка. Машина МОЖЕТ
  //    больше, чем ей позволено, и это правило, а не поломка.
  assert.equal(step({ yawRate: 4 }).yaw, "envelope");

  // 3. Потолок снят, но тоннели выбиты — теперь недобор настоящий, железный.
  const starved = rotorcraftFlightStep(
    { ...machine, yawThrusterAvailability: [0, 0] },
    state,
    { forwardSpeed: 0, lateralSpeed: 0, yawRate: 0.9, collective: 0 },
    NEUTRAL_ROTORCRAFT_TRIM,
    1 / 60,
    0.9,
  ).result.limits;
  assert.equal(
    starved.yaw,
    "effector",
    "без тоннелей реактивный момент обязан упереться в железо",
  );

  // 4. Разгон сверх того, что тоннели дают: продольный канал в упоре.
  assert.equal(step({ forwardSpeed: 60 }).surge, "effector");
});

test("аэронавигационные огни: настоящие борта и СЕРЕДИНА пластины, а не стык", () => {
  // Зелёный — правый борт (−x при носе в +z), красный — левый. Место фонаря —
  // середина сегмента стены кольца: стыковые планки идут каждые 30° от
  // чистого борта, и угол 0 — это ровно стык с сервисной панелью рядом.
  // Фонарь сидит на 15° к носу, повёрнут по хорде пластины и касается её.
  assert.ok(vehicle);
  const green = vehicle.pieces.find((piece) => piece.id.includes("nav-starboard-lens"));
  const red = vehicle.pieces.find((piece) => piece.id.includes("nav-port-lens"));
  assert.ok(green && red);
  assert.ok(green.position[0] < 0, "зелёный — правый борт, то есть −x");
  assert.ok(red.position[0] > 0, "красный — левый борт, то есть +x");
  for (const lens of [green, red]) {
    const azimuth = Math.atan2(
      lens.position[2] - 0.2,
      Math.abs(lens.position[0]) - 2.62,
    );
    assert.ok(
      Math.abs((azimuth * 180) / Math.PI - 15) < 2,
      `фонарь не на середине пластины: азимут ${((azimuth * 180) / Math.PI).toFixed(1)}°`,
    );
    const radial = Math.hypot(
      Math.abs(lens.position[0]) - 2.62,
      lens.position[2] - 0.2,
    );
    assert.ok(
      radial > 0.783 && radial < 0.796,
      `фонарь не заподлицо с хордой: вынос ${radial.toFixed(3)}`,
    );
    assert.ok(Math.abs(Math.abs(lens.rotation?.[1] ?? 0) - Math.PI / 12) < 1e-6,
      "фонарь обязан лежать по хорде пластины, а не по мировой оси");
    // Чистое место: до сервисной панели и стыковых планок — не вплотную.
    for (const other of vehicle.pieces) {
      if (other === lens) continue;
      if (/service-panel|ring-splice/.test(other.id) === false) continue;
      const distance = Math.hypot(
        other.position[0] - lens.position[0],
        other.position[1] - lens.position[1],
        other.position[2] - lens.position[2],
      );
      assert.ok(
        distance > 0.16,
        `фонарь налез на ${other.id.split(":vehicle:")[1]}: ${distance.toFixed(2)} м`,
      );
    }
  }
});

test("силуэт для сферы: органы в единичном корпусе, стороны по конвенции", () => {
  const points = rangeFlight.limits.enginePoints.map((point) =>
    carrierHullPoint(
      { origin: rangeVehicle.origin, nose: rangeVehicle.nose, localBounds: rangeLocalBounds },
      rangeMass,
      point,
    ),
  );
  assert.equal(points.length, 6);
  for (const point of points) {
    assert.ok(point.every((value) => Number.isFinite(value) && Math.abs(value) <= 1));
  }
  // Передние кольца — вперёд по третьей оси; кольцо на +x — отрицательная
  // первая ось (правый борт = −x): удар в правое переднее кольцо рисуется
  // ровно на правом переднем кольце.
  const frontLeftAuthored = points[0]; // станция x=-2.35, z=+1.95
  assert.ok(frontLeftAuthored[2] > 0.2, "переднее кольцо обязано быть впереди");
  assert.ok(frontLeftAuthored[0] > 0.2, "кольцо на −x — ПРАВЫЙ борт: положительная ось starboard");
});

test("датчики дистанции сидят по правилу плит: середина, не стык, не плита огней", () => {
  // Правило посадки прибора на сегментированное кольцо: строго середина
  // боковой плиты (стыки каждые 30°); плита, занятая путевым огнём, отдаёт
  // датчик соседней, более близкой к нормали борта. Брюшной корпусной — на
  // днище, а не в сорока сантиметрах под ним.
  const sensors = combatHexacopterPrototypeBlueprint.proximitySensors;
  assert.equal(sensors.length, 22);
  const belly = sensors.find(
    (sensor) => sensor.normal[1] === -1 && Math.abs(sensor.point[2]) < 0.5,
  );
  assert.ok(belly && belly.point[1] > 0.38, "брюшной датчик обязан сидеть на днище");
  const stations = [
    { x: -2.35, z: 1.95, light: false },
    { x: 2.35, z: 1.95, light: false },
    { x: -2.62, z: 0.2, light: true },
    { x: 2.62, z: 0.2, light: true },
    { x: -2.25, z: -1.85, light: false },
    { x: 2.25, z: -1.85, light: false },
  ];
  for (const station of stations) {
    const outward = sensors.find(
      (sensor) =>
        Math.abs(sensor.normal[1]) < 0.01 &&
        Math.hypot(sensor.point[0] - station.x, sensor.point[2] - station.z) <
          1.1 &&
        Math.abs(sensor.point[1] - 1.0) < 0.3,
    );
    assert.ok(outward, `нет периметрового датчика у станции ${station.x},${station.z}`);
    const azimuth =
      (Math.atan2(
        outward.point[2] - station.z,
        outward.point[0] - station.x,
      ) *
        180) /
      Math.PI;
    const offMiddle = Math.abs(((azimuth - 15) % 30 + 30) % 30);
    assert.ok(
      offMiddle < 1 || offMiddle > 29,
      `датчик не на середине плиты: азимут ${azimuth.toFixed(1)}°`,
    );
    if (station.light) {
      // Плита огней (+15° от нормали к носу) занята — датчик на кормовой.
      const lightAzimuth = station.x < 0 ? 165 : 15;
      assert.ok(
        Math.abs(azimuth - lightAzimuth) > 5,
        "датчик залез на плиту путевого огня",
      );
    }
  }
});
