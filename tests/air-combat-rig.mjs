import { compileSceneGroups } from "../games/make-a-mess/src/content/scenes/compileScene.ts";
import { createCombatHexacopterPrototypeDocument } from "../games/make-a-mess/src/content/scenes/combatHexacopterPrototypeDocument.ts";
import {
  COMBAT_HEXACOPTER_RANGE_PLACEMENT,
  combatHexacopterRangeBlueprint,
} from "../games/make-a-mess/src/game/combatHexacopter.ts";
import { rangeVertipadCompilation } from "../games/make-a-mess/src/game/combatHexacopterRangeScene.ts";
import {

  RANGE_HEXACOPTER_PAD_TOP_Y,
  RANGE_HEXACOPTER_PAD_X,
  RANGE_HEXACOPTER_PAD_Z,
} from "../games/make-a-mess/src/game/rangeHexacopter.ts";
import { rangeHexacopterPlan } from "../games/make-a-mess/src/game/rangeHexacopterRoutes.ts";
import { airVehicles } from "../games/make-a-mess/src/game/airVehicles.ts";
import { massProperties, stepBody } from "../games/make-a-mess/src/game/clusterDynamics.ts";
import { structuralMaterialProfiles } from "../games/make-a-mess/src/game/destructionScene.ts";
import {
  advanceVehicleRouteProgress,
  autopilot,
  hullDrag,
  rotateVector,
  vehicleRotation,
} from "../games/make-a-mess/src/game/vehicleFrames.ts";
import {
  advanceReversibleThrusterOutput,
  advanceRotorMotorOutput,
  NEUTRAL_ROTORCRAFT_TRIM,
  rotorcraftFlightStep,
} from "../games/make-a-mess/src/game/rotorcraftDynamics.ts";
import {
  compileCommandActuators,
  deliveredCommandValue,
  executeCommandActuators,
} from "../games/make-a-mess/src/game/vehicleActuation.ts";
import { updatePropulsionFeedback } from "../games/make-a-mess/src/game/vehiclePropulsionAutomation.ts";
import {
  liftHoldVerdict,
  rotorLiftState,
} from "../games/make-a-mess/src/game/vehicleLiftGeometry.ts";
import {
  blastEnergyAtDistance,
  explosiveProfile,
  fractureEnergyByMaterial,
  MG_RANGE,
} from "../games/make-a-mess/src/game/destructionRuntime.ts";
import {
  createAirCombatState,
  stepAirCombat,
} from "../games/make-a-mess/src/game/airCombatPilot.ts";
import {
  TONKAWA_ALLEGIANCE,
  TOWN_ALLEGIANCE,
} from "../games/make-a-mess/src/game/vehicleAllegiance.ts";
import {
  deflectHorizontally,
  harmonisedLaunchDirection,
} from "../games/make-a-mess/src/game/vehicleGunnery.ts";

/**
 * СТЕНД ВОЗДУШНОГО БОЯ: две настоящие машины на настоящих силах.
 *
 * Ни одна величина здесь не подставляется: масса и центр масс сняты со
 * скомпилированной сцены, наведение считает `stepAirCombat` у атакующего и
 * общий `autopilot` у цели, силы — `rotorcraftFlightStep`, движение —
 * `stepBody`, всё на 60 Гц. Единственное, чего нет, — Rapier: попадания
 * разрешаются геометрией по кускам цели в её живой позе. Это ровно та граница,
 * которую просил Igor: «прогонять тестами на реальном коде, а не в браузере».
 *
 * ЖИВУЧЕСТЬ — ЧЛЕНСТВО В ТЕЛЕ, и ничего больше. Попадание вычёркивает кусок из
 * `attached`, дальше всё происходит само: актуатор недодаёт, `feedback`
 * учится, тяга кольца падает, и когда центр масс выходит за выпуклую оболочку
 * живых колец — машина падает. Никаких очков здоровья не заведено.
 */

const dt = 1 / 60;
const GRAVITY = 9.81;
const STEEL_CARVE = fractureEnergyByMaterial.steel * 1.15;
const density = (material) => structuralMaterialProfiles[material].density;

// ---------------------------------------------------------------------------
// Общая обвязка одной винтокрылой машины
// ---------------------------------------------------------------------------

function boundingRadius(pieces, centre) {
  let worst = 0;
  for (const piece of pieces) {
    const half = Math.hypot(piece.size[0], piece.size[1], piece.size[2]) / 2;
    worst = Math.max(
      worst,
      Math.hypot(
        piece.position[0] - centre[0],
        piece.position[1] - centre[1],
        piece.position[2] - centre[2],
      ) + half,
    );
  }
  return worst;
}

function createMachine({ pieces, vehicle, startPoint, startVelocity, startNose }) {
  const mass = massProperties(pieces, density);
  const flight = vehicle.flight;
  const actuators = compileCommandActuators(pieces);
  const fans = flight.limits.yawThrusters;
  const machine = {
    points: flight.limits.enginePoints,
    yawThrusters: fans,
    centreOfMass: mass.centre,
    nose: vehicle.nose,
    mass: mass.mass,
    inertia: [mass.inertia[0], mass.inertia[4], mass.inertia[8]],
    liftCapacity: mass.mass * GRAVITY * flight.liftReserve,
    capacityWeights: flight.limits.rotorCapacityWeights,
    spinDirections: flight.limits.rotorSpinDirections,
    maximumTilt: flight.maximumTilt,
  };
  const model = {
    mass: mass.mass,
    inertiaYaw: mass.inertia[4],
    bodyCentre: mass.centre,
    dragLinear: mass.mass * flight.linearDamping,
    dragLateral: mass.mass * flight.linearDamping * flight.lateralDragRatio,
    dragAngular: mass.inertia[4] * flight.angularDamping,
    limits: flight.limits,
    turnCapability: {
      responseSeconds: 0.8,
      yawRate: 0.9,
      lateralAcceleration: GRAVITY * Math.tan(flight.maximumTilt),
      braking: GRAVITY * Math.tan(flight.maximumTilt) + 24.8,
    },
  };
  // Нос задаётся поворотом кадра, как в рантайме: подставлять кватернион
  // руками означало бы разойтись с вращением, которым живёт машина.
  const yaw = startNose
    ? Math.atan2(startNose[0], startNose[2]) -
      Math.atan2(vehicle.nose[0], vehicle.nose[2])
    : 0;
  return {
    vehicle,
    flight,
    pieces,
    mass,
    actuators,
    machine,
    model,
    attached: new Set(pieces.map((piece) => piece.id)),
    state: {
      // `position` — вынос от авторской позы покоя, как во всех стендах проекта.
      position: [
        startPoint[0] - mass.centre[0],
        startPoint[1] - mass.centre[1],
        startPoint[2] - mass.centre[2],
      ],
      velocity: [...startVelocity],
      angularVelocity: [0, 0, 0],
      orientation: vehicleRotation(
        { position: [0, 0, 0], yaw, pitch: 0, roll: 0 },
        vehicle.nose,
      ),
    },
    trim: NEUTRAL_ROTORCRAFT_TRIM,
    feedback: flight.limits.enginePoints.map(() => 1),
    motorOutput: flight.limits.enginePoints.map(() => 1 / flight.liftReserve),
    fanOutput: (fans ?? []).map(() => 0),
    fanHealth: (fans ?? []).map(() => 1),
    yawRateLimits: null,
    radius: boundingRadius(pieces, mass.centre),
  };
}

function centreOf(m) {
  return m.mass.centre.map((value, index) => value + m.state.position[index]);
}

/** Точка авторской позы → мировая точка живой машины. */
function toWorld(m, local) {
  const centre = centreOf(m);
  const offset = rotateVector(m.state.orientation, [
    local[0] - m.mass.centre[0],
    local[1] - m.mass.centre[1],
    local[2] - m.mass.centre[2],
  ]);
  return [centre[0] + offset[0], centre[1] + offset[1], centre[2] + offset[2]];
}

function forwardAxis(m) {
  return rotateVector(m.state.orientation, m.vehicle.nose);
}

/** Один физический шаг машины по уже посчитанному требованию наведения. */
function stepMachine(m, guidance) {
  const centre = centreOf(m);
  const rotor = rotorcraftFlightStep(
    {
      ...m.machine,
      availability: m.feedback,
      motorOutput: m.motorOutput,
      yawThrusterAvailability: m.fanHealth,
      yawThrusterOutput: m.fanOutput,
    },
    {
      orientation: m.state.orientation,
      centre,
      velocity: m.state.velocity,
      angularVelocity: m.state.angularVelocity,
    },
    {
      forwardSpeed: guidance.forwardSpeed,
      lateralSpeed: guidance.lateralSpeed,
      yawRate: guidance.yawRate,
      collective: guidance.liftFraction,
      pathAcceleration: guidance.pathAcceleration,
    },
    m.trim,
    dt,
    0.9,
  );
  m.trim = rotor.trim;
  m.yawRateLimits = rotor.result.yawRateLimits;
  const actuation = executeCommandActuators(
    m.actuators,
    m.attached,
    Object.fromEntries([
      ...rotor.result.commandedThrottle.map((value, index) => [
        `throttle:${index}`,
        value,
      ]),
      ...rotor.result.commandedYawThrusters.map((value, index) => [
        `yaw-throttle:${index}`,
        value,
      ]),
    ]),
  );
  m.motorOutput = m.motorOutput.map((value, index) =>
    advanceRotorMotorOutput(
      value,
      deliveredCommandValue(
        actuation,
        `throttle:${index}`,
        rotor.result.commandedThrottle[index],
      ),
      dt,
      m.flight.spoolSeconds,
    ),
  );
  m.fanOutput = m.fanOutput.map((value, index) =>
    advanceReversibleThrusterOutput(
      value,
      deliveredCommandValue(
        actuation,
        `yaw-throttle:${index}`,
        rotor.result.commandedYawThrusters[index],
      ),
      dt,
      m.flight.spoolSeconds,
    ),
  );
  m.feedback = updatePropulsionFeedback(m.feedback, actuation, m.motorOutput.length);
  m.fanHealth = [
    ...updatePropulsionFeedback(m.fanHealth, actuation, m.fanOutput.length, "yaw-throttle:"),
  ];

  const facing = forwardAxis(m);
  const flat = Math.hypot(facing[0], facing[2]) || 1;
  const stepped = stepBody(
    { ...m.state, position: centre },
    m.mass,
    [
      { force: [0, -m.mass.mass * GRAVITY, 0], point: centre },
      ...rotor.forces,
      {
        force: hullDrag(
          m.state.velocity,
          [facing[0] / flat, facing[2] / flat],
          m.model,
        ),
        point: centre,
      },
    ],
    { linear: 0, angular: m.mass.inertia[4] * m.flight.angularDamping },
    dt,
  );
  m.state = {
    ...stepped,
    position: stepped.position.map((value, index) => value - m.mass.centre[index]),
  };
}

// ---------------------------------------------------------------------------
// Живучесть: доля уцелевших лопастей кольца
// ---------------------------------------------------------------------------

/**
 * ЖИВУЧЕСТЬ КОЛЬЦА СПРАШИВАЕТСЯ У АКТУАТОРА, А НЕ СЧИТАЕТСЯ ПО ЛОПАСТЯМ.
 *
 * Первая версия стенда делила уцелевшие лопасти на общее их число — и врала.
 * Канал `throttle:N` держат восемь кусков, из которых ПЯТЬ обязательны:
 * четыре статора и ступица, и все они сидят В КОЛЬЦЕВОМ КОЖУХЕ. Потеря любого
 * обязательного куска снимает кольцо целиком, а сами лопасти горизонтальному
 * огню недоступны — их закрывает кожух.
 *
 * Отсюда и родился ложный вывод предыдущего прогона («пушка бесполезна»):
 * 55 попаданий давали ноль колец только потому, что стенд смотрел не туда.
 * Правильный ответ уже есть в рантайме — им и спрашиваем.
 */
function ringAvailability(m) {
  const actuation = executeCommandActuators(
    m.actuators,
    m.attached,
    Object.fromEntries(
      m.flight.limits.enginePoints.map((_, index) => [`throttle:${index}`, 1]),
    ),
  );
  return m.flight.limits.enginePoints.map((_, index) =>
    deliveredCommandValue(actuation, `throttle:${index}`, 1),
  );
}

/**
 * Что уносит одиночная пуля. Правило разрушения: тонкая деталь гибнет от
 * любого состоявшегося carve целиком, толстая получает пробоину. Порог — по
 * наименьшему размеру куска.
 */
const BULLET_KILLS_THINNER_THAN = 0.06;

function bulletDestroys(piece) {
  return Math.min(piece.size[0], piece.size[1], piece.size[2]) < BULLET_KILLS_THINNER_THAN;
}

/** Центр обязательных кусков канала `throttle:i` в живой позе машины. */
function requiredChannelCentres(m) {
  return m.flight.limits.enginePoints.map((fallback, ring) => {
    const marker = `:${ring}:`;
    const parts = m.pieces.filter(
      (piece) =>
        piece.actuator?.required &&
        piece.actuator.commandChannel === `throttle:${ring}` &&
        piece.id.includes(marker),
    );
    if (parts.length === 0) {
      return toWorld(m, fallback);
    }
    const sum = parts.reduce(
      (acc, piece) => [
        acc[0] + piece.position[0],
        acc[1] + piece.position[1],
        acc[2] + piece.position[2],
      ],
      [0, 0, 0],
    );
    return toWorld(m, sum.map((value) => value / parts.length));
  });
}

function liftVerdict(m) {
  const available = ringAvailability(m);
  return liftHoldVerdict(
    "rotor",
    m.flight.limits.enginePoints.map((point, index) => ({
      point,
      available: available[index],
    })),
    m.mass.centre,
    (m.mass.mass * GRAVITY * m.flight.liftReserve) /
      m.flight.limits.enginePoints.length,
    m.mass.mass * GRAVITY,
  );
}

// ---------------------------------------------------------------------------
// Разрешение попаданий по кускам цели в её живой позе
// ---------------------------------------------------------------------------

function livePieces(target) {
  const centre = centreOf(target);
  return target.pieces
    .filter((piece) => target.attached.has(piece.id))
    .map((piece) => {
      const offset = rotateVector(target.state.orientation, [
        piece.position[0] - target.mass.centre[0],
        piece.position[1] - target.mass.centre[1],
        piece.position[2] - target.mass.centre[2],
      ]);
      return {
        id: piece.id,
        size: piece.size,
        centre: [
          centre[0] + offset[0],
          centre[1] + offset[1],
          centre[2] + offset[2],
        ],
        radius: Math.hypot(piece.size[0], piece.size[1], piece.size[2]) / 2,
      };
    });
}

/** Ближайший кусок, который пересекает луч. */
function rayHit(origin, direction, pieces, maximumRange) {
  let best = null;
  for (const piece of pieces) {
    const dx = piece.centre[0] - origin[0];
    const dy = piece.centre[1] - origin[1];
    const dz = piece.centre[2] - origin[2];
    const along = dx * direction[0] + dy * direction[1] + dz * direction[2];
    if (along <= 0 || along > maximumRange) {
      continue;
    }
    const perpendicular = Math.sqrt(
      Math.max(0, dx * dx + dy * dy + dz * dz - along * along),
    );
    if (perpendicular > piece.radius) {
      continue;
    }
    if (!best || along < best.along) {
      best = { id: piece.id, along, perpendicular };
    }
  }
  return best;
}

/** Радиус, на котором боеприпас ещё вскрывает сталь. */
function steelReach(kind) {
  const profile = explosiveProfile(kind);
  let reach = 0;
  for (let d = 0; d <= profile.blastRadius; d += 0.005) {
    if (
      blastEnergyAtDistance(d, profile.blastRadius, profile.damageEnergy) >
      STEEL_CARVE
    ) {
      reach = d;
    }
  }
  return reach;
}

const POD_REACH = steelReach("podRocket");

// ---------------------------------------------------------------------------
// Дуэль
// ---------------------------------------------------------------------------

const raxVehicle = airVehicles.find((entry) => entry.id === "combat-hexacopter");
const hx6Vehicle = airVehicles.find((entry) => entry.id === "town-hexacopter");
const raxPieces = compileSceneGroups(
  createCombatHexacopterPrototypeDocument(COMBAT_HEXACOPTER_RANGE_PLACEMENT),
  new Map(),
).clusters[0].pieces;
// Кластер сохранил ГОРОДСКОЙ идентификатор: вертипад переехал на полигон
// чистой трансляцией, и `RANGE_HEXACOPTER_CLUSTER_ID` — имя площадки, а не
// машины. Берём его из паспорта самой машины, чтобы не разойтись.
const hx6Pieces = rangeVertipadCompilation.clusters.find(
  (cluster) => cluster.id === hx6Vehicle.clusterId,
).pieces;

const armament = combatHexacopterRangeBlueprint.armament;

const STATION = {
  centre: [0, 0.08, 0],
  radius: 46,
  altitude: 26,
  speed: 16,
  detectionRange: 150,
};

const LIMITS = {
  maximumSpeed: 21,
  yawRate: 0.72,
  liftTrimRange: combatHexacopterRangeBlueprint.flight.liftTrimRange,
};

const HX6_BERTH = [
  RANGE_HEXACOPTER_PAD_X,
  RANGE_HEXACOPTER_PAD_TOP_Y,
  RANGE_HEXACOPTER_PAD_Z,
];

export function runDuel({
  seconds = 120,
  targetKind = "evasive",
  startProgress = 0.22,
  collect = false,
} = {}) {
  const plan = rangeHexacopterPlan(targetKind, HX6_BERTH);
  const startPoint = plan.point(startProgress);
  const ahead = plan.point(Math.min(1, startProgress + 0.004));
  const tangent = [
    ahead[0] - startPoint[0],
    0,
    ahead[2] - startPoint[2],
  ];
  const tangentLength = Math.hypot(tangent[0], tangent[2]) || 1;
  const cruise = plan.speedLimit(startProgress);
  const target = createMachine({
    pieces: hx6Pieces,
    vehicle: hx6Vehicle,
    startPoint,
    startVelocity: [
      (tangent[0] / tangentLength) * cruise,
      0,
      (tangent[2] / tangentLength) * cruise,
    ],
    startNose: [tangent[0] / tangentLength, 0, tangent[2] / tangentLength],
  });

  // Атакующий стоит на своей орбите и уже на ходу: взлёт — не предмет этого
  // стенда, он проверен отдельно.
  const hunterStart = [0, STATION.centre[1] + STATION.altitude, -STATION.radius];
  const hunter = createMachine({
    pieces: raxPieces,
    vehicle: raxVehicle,
    startPoint: hunterStart,
    startVelocity: [STATION.speed, 0, 0],
    startNose: [1, 0, 0],
  });

  let combat = createAirCombatState(armament.rockets.mounts.length);
  let progress = startProgress;
  const rockets = [];
  const report = {
    cannonShots: 0,
    cannonHits: 0,
    cannonBladeKills: 0,
    rocketsFired: 0,
    rocketHits: 0,
    rocketBladeKills: 0,
    rocketMisses: [],
    passes: 0,
    modeSeconds: {},
    minimumRangeBlocks: 0,
    selfDamage: 0,
    outcome: "survived",
    seconds: 0,
    firstBloodAt: null,
    killAt: null,
    ringsLost: 0,
    destroyed: [],
    samples: [],
  };
  let previousTargetVelocity = [...target.state.velocity];

  for (let step = 0; step < seconds * 60; step += 1) {
    const now = step * dt;

    // --- цель идёт по своему маршруту -------------------------------------
    const targetCentre = centreOf(target);
    const targetPiloted = autopilot(
      plan,
      progress,
      targetCentre,
      target.state.orientation,
      target.state.velocity,
      target.state.angularVelocity,
      target.yawRateLimits
        ? { ...target.model, engineAvailability: target.feedback, yawRateLimits: target.yawRateLimits }
        : { ...target.model, engineAvailability: target.feedback },
      1,
      target.vehicle.nose,
      target.flight.approach,
    );
    stepMachine(target, targetPiloted.guidance);
    progress = advanceVehicleRouteProgress(
      plan,
      progress,
      centreOf(target),
      Math.hypot(target.state.velocity[0], target.state.velocity[2]) * dt,
    );
    if (progress >= 0.92) {
      progress = 0.14;
    }

    // --- что атакующий видит ----------------------------------------------
    const verdict = liftVerdict(target);
    const liftState = rotorLiftState(verdict);
    const failed = liftState !== "flying";
    const liveTargetCentre = centreOf(target);
    // Темп разворота вектора скорости — «текущий манёвр», и ничего сверх.
    const previousHeading = Math.atan2(previousTargetVelocity[0], previousTargetVelocity[2]);
    const heading = Math.atan2(target.state.velocity[0], target.state.velocity[2]);
    let headingDelta = heading - previousHeading;
    while (headingDelta > Math.PI) headingDelta -= Math.PI * 2;
    while (headingDelta < -Math.PI) headingDelta += Math.PI * 2;
    previousTargetVelocity = [...target.state.velocity];

    const track = {
      id: "hx6",
      allegiance: TOWN_ALLEGIANCE,
      centre: liveTargetCentre,
      velocity: [...target.state.velocity],
      turnRate: headingDelta / dt,
      radius: target.radius,
      // УЯЗВИМАЯ ТОЧКА — НЕ ЦЕНТР ДИСКА, А ТО, БЕЗ ЧЕГО КАНАЛ МЁРТВ.
      // Обязательные куски канала (статоры и цапфа) и есть слабое место;
      // атакующий видит машину целиком и вправе целиться именно туда.
      weakPoints: requiredChannelCentres(target).map((point, index) => ({
        point,
        health: ringAvailability(target)[index],
      })),
      landed: false,
      failed,
    };

    const hunterCentre = centreOf(hunter);
    const hunterNoseAxis = forwardAxis(hunter);
    const flatNose = Math.hypot(hunterNoseAxis[0], hunterNoseAxis[2]) || 1;
    const output = stepAirCombat({
      own: {
        allegiance: TONKAWA_ALLEGIANCE,
        centre: hunterCentre,
        velocity: [...hunter.state.velocity],
        nose: [hunterNoseAxis[0] / flatNose, hunterNoseAxis[2] / flatNose],
        gunAxis: hunterNoseAxis,
        verticalSpeed: hunter.state.velocity[1],
        radius: hunter.radius,
      },
      station: STATION,
      armament,
      limits: LIMITS,
      tracks: [track],
      deltaSeconds: dt,
      state: combat,
    });
    combat = output.state;
    stepMachine(hunter, output.guidance);

    report.modeSeconds[combat.mode] = (report.modeSeconds[combat.mode] ?? 0) + dt;
    if (output.telemetry.weaponsFree && output.telemetry.range < armament.rockets.range) {
      // блокировка пуска собственным радиусом поражения
      if (output.telemetry.range < output.telemetry.minimumRange) {
        report.minimumRangeBlocks += 1;
      }
    }

    // --- выстрелы ----------------------------------------------------------
    const targetPieces = livePieces(target);
    for (const shot of output.shots) {
      if (shot.weapon === "cannon") {
        report.cannonShots += 1;
        const muzzle = toWorld(hunter, armament.cannon.mounts[shot.mountIndex].muzzle);
        const direction = deflectHorizontally(hunterNoseAxis, shot.deflection);
        const hit = rayHit(muzzle, direction, targetPieces, MG_RANGE);
        if (hit) {
          report.cannonHits += 1;
          const piece = targetPieces.find((entry) => entry.id === hit.id);
          if (piece && bulletDestroys(piece) && target.attached.has(hit.id)) {
            target.attached.delete(hit.id);
            report.cannonBladeKills += 1;
            report.firstBloodAt ??= now;
          }
        }
      } else {
        report.rocketsFired += 1;
        const tube = toWorld(hunter, armament.rockets.mounts[shot.mountIndex].muzzle);
        const direction = deflectHorizontally(
          harmonisedLaunchDirection(
            tube,
            hunterCentre,
            hunterNoseAxis,
            armament.rockets.harmonisationRange,
          ),
          shot.deflection,
        );
        const speed = explosiveProfile(armament.rockets.explosive).projectile.speed;
        rockets.push({
          position: [...tube],
          velocity: [
            direction[0] * speed + hunter.state.velocity[0],
            direction[1] * speed + hunter.state.velocity[1],
            direction[2] * speed + hunter.state.velocity[2],
          ],
          life: explosiveProfile(armament.rockets.explosive).projectile.fuseMs / 1000,
          closest: Infinity,
        });
      }
    }

    // --- полёт ракет -------------------------------------------------------
    for (let index = rockets.length - 1; index >= 0; index -= 1) {
      const rocket = rockets[index];
      const previous = [...rocket.position];
      rocket.position = [
        rocket.position[0] + rocket.velocity[0] * dt,
        rocket.position[1] + rocket.velocity[1] * dt,
        rocket.position[2] + rocket.velocity[2] * dt,
      ];
      rocket.life -= dt;
      // Пролёт разбивается на подшаги: за кадр ракета проходит 1.6 м, а куски
      // цели меньше — без этого быстрая ракета «протыкает» цель насквозь.
      let detonation = null;
      const substeps = 6;
      for (let s = 1; s <= substeps && !detonation; s += 1) {
        const point = [
          previous[0] + (rocket.position[0] - previous[0]) * (s / substeps),
          previous[1] + (rocket.position[1] - previous[1]) * (s / substeps),
          previous[2] + (rocket.position[2] - previous[2]) * (s / substeps),
        ];
        const fuse = explosiveProfile(armament.rockets.explosive).proximityFuse ?? 0;
        for (const piece of targetPieces) {
          const distance = Math.hypot(
            piece.centre[0] - point[0],
            piece.centre[1] - point[1],
            piece.centre[2] - point[2],
          );
          rocket.closest = Math.min(rocket.closest, distance);
          if (distance <= piece.radius + fuse) {
            detonation = point;
            break;
          }
        }
      }
      if (detonation) {
        report.rocketHits += 1;
        report.firstBloodAt ??= now;
        // Взрыв уносит ЛОПАСТИ в радиусе вскрытия стали и не достаёт дальше.
        for (const piece of targetPieces) {
          if (!target.attached.has(piece.id)) {
            continue;
          }
          const distance = Math.hypot(
            piece.centre[0] - detonation[0],
            piece.centre[1] - detonation[1],
            piece.centre[2] - detonation[2],
          );
          if (distance <= POD_REACH + piece.radius) {
            target.attached.delete(piece.id);
            report.rocketBladeKills += 1;
            report.destroyed.push(piece.id.split(":").slice(2).join(":"));
          }
        }
        // Свой же взрыв: если атакующий оказался внутри волны — это его беда.
        const ownDistance = Math.hypot(
          hunterCentre[0] - detonation[0],
          hunterCentre[1] - detonation[1],
          hunterCentre[2] - detonation[2],
        );
        if (ownDistance < explosiveProfile("podRocket").blastPushRadius + hunter.radius) {
          report.selfDamage += 1;
        }
        rockets.splice(index, 1);
        continue;
      }
      if (rocket.life <= 0) {
        report.rocketMisses.push(rocket.closest);
        rockets.splice(index, 1);
      }
    }

    report.seconds = now;
    report.passes = combat.passes;
    if (collect && step % 3 === 0) {
      report.samples.push({
        t: Number(now.toFixed(2)),
        mode: combat.mode,
        range: Number(output.telemetry.range.toFixed(1)),
        aim: Number(output.telemetry.aimError.toFixed(3)),
        miss: Number(output.telemetry.cannonMiss.toFixed(2)),
        angleOff: Number(output.telemetry.angleOff.toFixed(2)),
        closing: Number(output.telemetry.closingSpeed.toFixed(1)),
        free: output.telemetry.weaponsFree,
        gunY: Number(hunterNoseAxis[1].toFixed(3)),
        ownAlt: Number(hunterCentre[1].toFixed(1)),
        targetAlt: Number(liveTargetCentre[1].toFixed(1)),
        speed: Number(Math.hypot(hunter.state.velocity[0], hunter.state.velocity[2]).toFixed(1)),
        targetRadius: Number(target.radius.toFixed(2)),
        gate: Number(Math.atan(target.radius / Math.max(output.telemetry.range, 1)).toFixed(3)),
        minR: Number(output.telemetry.minimumRange.toFixed(1)),
      });
    }

    if (failed) {
      report.outcome = liftState;
      report.killAt = now;
      report.ringsLost = ringAvailability(target).filter((value) => value < 0.5).length;
      break;
    }
  }
  report.ringsLost = ringAvailability(target).filter((value) => value < 0.5).length;
  report.ringAvailability = ringAvailability(target);
  report.rocketsLeft = combat.rocketsLeft;
  return report;
}

export function summarise(report) {
  const misses = [...report.rocketMisses].sort((a, b) => a - b);
  const median = misses.length ? misses[Math.floor(misses.length / 2)] : null;
  return [
    `исход: ${report.outcome} за ${report.seconds.toFixed(1)} с`,
    `заходов: ${report.passes}`,
    `пушка: ${report.cannonHits}/${report.cannonShots} попаданий` +
      (report.cannonShots ? ` (${((report.cannonHits / report.cannonShots) * 100).toFixed(0)}%)` : ""),
    `лопастей пушкой: ${report.cannonBladeKills}`,
    `ракеты: ${report.rocketHits}/${report.rocketsFired}` +
      (report.rocketsFired ? ` (${((report.rocketHits / report.rocketsFired) * 100).toFixed(0)}%)` : ""),
    `лопастей ракетами: ${report.rocketBladeKills}`,
    `медиана промаха ракет: ${median === null ? "—" : `${median.toFixed(1)} м`}`,
    `первое попадание: ${report.firstBloodAt === null ? "—" : `${report.firstBloodAt.toFixed(1)} с`}`,
    `кольца: [${(report.ringAvailability ?? []).map((v) => v.toFixed(2)).join(" ")}]`,
    `самоподрыв: ${report.selfDamage}`,
    `режимы: ${Object.entries(report.modeSeconds)
      .map(([mode, value]) => `${mode} ${value.toFixed(0)}с`)
      .join(", ")}`,
  ].join("\n  ");
}

