import assert from "node:assert/strict";
import test from "node:test";
import { massProperties, stepBody } from "../games/make-a-mess/src/game/clusterDynamics.ts";
import { structuralMaterialProfiles } from "../games/make-a-mess/src/game/destructionScene.ts";
import { combatHexacopterRangeScene } from "../games/make-a-mess/src/game/combatHexacopterRangeScene.ts";
import { townScene } from "../games/make-a-mess/src/game/townScene.ts";
import { grandTerminalScene } from "../games/make-a-mess/src/game/grandTerminalScene.ts";
import { vikingVillageScene } from "../games/make-a-mess/src/game/vikingVillageScene.ts";
import { basaltStrongholdScene } from "../games/make-a-mess/src/game/basaltStrongholdScene.ts";
import { nimbusScene } from "../games/make-a-mess/src/game/nimbusScene.ts";
import {
  BASALT_SKY_RAM_AIR_VEHICLE,
  COMBAT_HEXACOPTER_RANGE_AIR_VEHICLE,
  DUCT_HEXACOPTER_RANGE_AIR_VEHICLE,
  NIMBUS_HEXACOPTER_AIR_VEHICLE,
  SKY_LONGSHIP_AIR_VEHICLE,
  SKY_TRAIN_AIR_VEHICLE,
  SR6_SKAT_AIR_VEHICLE,
  TOWN_AIRSHIP_AIR_VEHICLE,
  TOWN_HEXACOPTER_AIR_VEHICLE,
} from "../games/make-a-mess/src/game/airVehicles.ts";
import {
  autopilot,
  hullDrag,
  isDockingComplete,
  rotateVector,
  advanceVehicleRouteProgress,
  vehicleMooringState,
  vehicleRotation,
} from "../games/make-a-mess/src/game/vehicleFrames.ts";
import {
  advanceRotorMotorOutput,
  NEUTRAL_ROTORCRAFT_TRIM,
  rotorcraftFlightStep,
} from "../games/make-a-mess/src/game/rotorcraftDynamics.ts";

/**
 * МОЖЕТ ЛИ МАШИНА ВООБЩЕ ЗАКОНЧИТЬ РЕЙС.
 *
 * Наблюдение Igor (12.08.2026): «Точно VX не завершает полёт, прибыв на точку
 * обратно. Фактически висит на площадке и не отключается. Возможно, у других
 * аналогично».
 *
 * Рантайм-стенд полигона это не видел и не мог: он спрашивает СВОЙ упрощённый
 * критерий посадки (`progress > 0.995 && speed < 0.35`), а не тот гейт, по
 * которому рейс заканчивается в игре. Классический дубль условия: тест
 * зелёный, машина висит.
 *
 * Здесь спрашивается настоящий `isDockingComplete` — и отдельно проверяется
 * то, что можно проверить вовсе без полёта: НЕПРОТИВОРЕЧИВОСТЬ ДОПУСКОВ.
 */

const densityOf = (material) => structuralMaterialProfiles[material].density;
const GRAVITY = 9.81;

const FLEET = [
  ["RAX-8 полигон", COMBAT_HEXACOPTER_RANGE_AIR_VEHICLE, combatHexacopterRangeScene, "combat-hexacopter-range:vehicle"],
  ["VX-8 полигон", DUCT_HEXACOPTER_RANGE_AIR_VEHICLE, combatHexacopterRangeScene, "combat-hexacopter-range:duct-vehicle"],
  ["HX-6 на полигоне", TOWN_HEXACOPTER_AIR_VEHICLE, combatHexacopterRangeScene, "town-vertipad:hexacopter"],
  ["SR-6 Скат", SR6_SKAT_AIR_VEHICLE, townScene, "sr6-skat-prototype:vehicle"],
  ["дирижабль города", TOWN_AIRSHIP_AIR_VEHICLE, townScene, "sky-mooring:airship"],
  ["небесный поезд", SKY_TRAIN_AIR_VEHICLE, grandTerminalScene, "terminal:sky-train"],
  ["небесный дракар", SKY_LONGSHIP_AIR_VEHICLE, vikingVillageScene, "viking-village:sky-longship"],
  ["базальтовый таран", BASALT_SKY_RAM_AIR_VEHICLE, basaltStrongholdScene, "stronghold:sky-ram"],
  ["HX-6 Нимбус", NIMBUS_HEXACOPTER_AIR_VEHICLE, nimbusScene, "nimbus:nimbus:hexacopter"],
];

const centreOf = (scene, clusterId) => {
  const pieces = scene.breakablePieces.filter(
    (piece) => piece.clusterId === clusterId,
  );
  assert.ok(pieces.length > 0, `кластер ${clusterId} исчез из сцены`);
  return massProperties(pieces, densityOf).centre;
};

/** Плечо от центра масс до точки швартовки, в плане. */
const mooringArm = (vehicle, centre) =>
  Math.hypot(
    vehicle.mooringPoint[0] - centre[0],
    vehicle.mooringPoint[2] - centre[2],
  );

const degrees = (radians) => (radians * 180) / Math.PI;

test("СТОЯЩАЯ НА СВОЁМ МЕСТЕ МАШИНА ПРОХОДИТ СВОЙ ЖЕ ГЕЙТ", () => {
  // Самая дешёвая из возможных проверок и первая, которую стоит делать: если
  // машина в авторской позе покоя не считается пришвартованной, закончить рейс
  // она не может НИКОГДА, сколько бы ни летала.
  for (const [name, vehicle, scene, clusterId] of FLEET) {
    const centre = centreOf(scene, clusterId);
    const rest = vehicleRotation(
      { position: [0, 0, 0], yaw: 0, pitch: 0, roll: 0 },
      vehicle.nose,
    );
    const mooring = vehicleMooringState(
      vehicle,
      [0, 0, 0],
      rest,
      [0, 0, 0],
      [0, 0, 0],
      centre,
    );
    assert.equal(
      isDockingComplete(
        1,
        mooring.offset,
        rest,
        [0, 0, 0],
        [0, 0, 0],
        vehicle.nose,
        vehicle.flight.approach,
        vehicle.flight.docking,
      ),
      true,
      `${name} не швартуется, стоя ровно на своём месте`,
    );
  }
});

test("ДОПУСК ПО МЕСТУ ВТИХУЮ ЗАДАЁТ ДОПУСК ПО КУРСУ — и это записано числом", () => {
  // Гейт меряет место у ТОЧКИ ШВАРТОВКИ, а она сидит на плече от центра масс.
  // Поворот корпуса на угол t уводит её на 2*|плечо|*sin(t/2). Значит допуск
  // по месту молча требует курса точнее объявленного, и у машины появляется
  // право встать так, что пришвартоваться она уже не сможет.
  //
  // Здесь эта связь не «чинится», а ЗАПИСЫВАЕТСЯ: числа ниже — замер, и любое
  // их изменение обязано быть осознанным. Хуже всего у винтокрылых, и это не
  // совпадение: именно им нос свободен по построению (`courseFollowsNose:
  // false`), именно они и висят над площадкой.
  const measured = new Map();
  for (const [name, vehicle, scene, clusterId] of FLEET) {
    const centre = centreOf(scene, clusterId);
    const arm = mooringArm(vehicle, centre);
    const docking = vehicle.flight.docking;
    const declared = Math.acos(
      Math.max(-1, Math.min(1, docking.headingCos)),
    );
    const implied =
      arm > 1e-6
        ? 2 * Math.asin(Math.min(1, docking.position / (2 * arm)))
        : Math.PI;
    measured.set(name, {
      arm: Number(arm.toFixed(2)),
      declared: Math.round(degrees(declared)),
      implied: Math.round(degrees(implied)),
    });
  }

  // Замер 12.08.2026. Плечо — свойство геометрии машины, объявленный курс —
  // паспорта; расхождение между «объявлено» и «на деле» и есть ловушка.
  assert.deepEqual(measured.get("VX-8 полигон"), {
    arm: 3.69,
    declared: 90,
    implied: 23,
  });
  assert.deepEqual(measured.get("RAX-8 полигон"), {
    arm: 2.64,
    declared: 90,
    implied: 28,
  });

  // ПРАВИЛО: объявленный допуск по курсу не должен быть шире того, что
  // физически позволяет допуск по месту. Пока правило нарушено — список
  // нарушителей зафиксирован поимённо, чтобы новая машина не проскочила молча.
  const traps = [...measured]
    .filter(([, one]) => one.implied < one.declared)
    .map(([name]) => name)
    .sort();
  assert.deepEqual(traps, [
    "HX-6 Нимбус",
    "HX-6 на полигоне",
    "RAX-8 полигон",
    "SR-6 Скат",
    "VX-8 полигон",
    "базальтовый таран",
    "дирижабль города",
    "небесный дракар",
    "небесный поезд",
  ]);
});

/**
 * КОНЕЦ РЕЙСА ВИНТОКРЫЛОЙ МАШИНЫ, той же цепью, что в игре.
 *
 * Стенд начинается там, где беда: у самой площадки. Восемь минут круга к делу
 * не относятся, и гонять их ради последних двадцати метров — это ровно то, на
 * чём я потерял время (упрёк Igor: «смотри проблемы в логике и симулятором, а
 * не полным прогоном»).
 */
function flyToBerth(vehicle, scene, clusterId, kind, options = {}) {
  const fromProgress = options.fromProgress ?? 0.86;
  const atBerth = options.atBerth === true;
  const mass = massProperties(
    scene.breakablePieces.filter((piece) => piece.clusterId === clusterId),
    densityOf,
  );
  const flight = vehicle.flight;
  const plan = flight.routePlan(kind, mass.centre);
  const dt = 1 / 60;
  const lateral = GRAVITY * Math.tan(flight.maximumTilt);
  const model = {
    // ВЕКТОРНАЯ ТЯГА — НЕ ДЕТАЛЬ МОДЕЛИ, А ДРУГОЙ ЗАКОН ПОСАДКИ. Без этого
    // признака автопилот ведёт машину как корабль с оболочкой: у причала
    // держит СКОРОСТЬ по профилю вместо МЕСТА, и стенд летит машиной, которой
    // в игре нет. Первая редакция стенда этого не выставляла — и «улетала»
    // даже та машина, которая в игре садится идеально.
    vectoredTranslation: vehicle.flight.liftSource === "rotor",
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
      lateralAcceleration: lateral,
      braking: lateral,
    },
  };
  const machine = {
    points: flight.limits.enginePoints,
    centreOfMass: mass.centre,
    nose: vehicle.nose,
    mass: mass.mass,
    inertia: [mass.inertia[0], mass.inertia[4], mass.inertia[8]],
    liftCapacity: mass.mass * GRAVITY * flight.liftReserve,
    capacityWeights: flight.limits.rotorCapacityWeights,
    spinDirections: flight.limits.rotorSpinDirections,
    maximumTilt: flight.maximumTilt,
    availability: flight.limits.enginePoints.map(() => 1),
    ...(flight.limits.rotorReverseShare
      ? { reverseShare: flight.limits.rotorReverseShare }
      : {}),
  };
  // Машина ставится НА ТРАССУ в точке `fromProgress`, в позе покоя и без хода:
  // дальше её ведёт тот же автопилот, что в игре.
  const berthPoint = plan.point(1);
  // ДВА РАЗНЫХ ВОПРОСА, И ИХ НАДО ЗАДАВАТЬ ОТДЕЛЬНО.
  //
  // `atBerth` ставит машину туда, где открывается окно захвата: над своей
  // площадкой, чуть в стороне и чуть выше. Это вопрос «умеет ли она сесть».
  // Обычный старт с трассы — вопрос «доходит ли она сюда», и он о другом.
  const start = atBerth
    ? [berthPoint[0] + 1.8, berthPoint[1] + 1.0, berthPoint[2]]
    : plan.point(fromProgress);
  // Машина приходит на этот участок С ХОДОМ, а не из покоя: старт без скорости
  // — другой опыт, и он оболгал бы стенд. Берётся касательная трассы и та
  // скорость, которую трасса здесь разрешает.
  const ahead = plan.point(Math.min(1, fromProgress + 2 / plan.length));
  const tangentLength =
    Math.hypot(ahead[0] - start[0], ahead[2] - start[2]) || 1;
  const entrySpeed = atBerth
    ? 0.4
    : plan.speedLimit
      ? plan.speedLimit(fromProgress)
      : 12;
  const entryVelocity = [
    ((ahead[0] - start[0]) / tangentLength) * entrySpeed,
    0,
    ((ahead[2] - start[2]) / tangentLength) * entrySpeed,
  ];
  let state = {
    position: [
      start[0] - mass.centre[0],
      start[1] - mass.centre[1],
      start[2] - mass.centre[2],
    ],
    velocity: entryVelocity,
    angularVelocity: [0, 0, 0],
    orientation: vehicleRotation(
      { position: [0, 0, 0], yaw: 0, pitch: 0, roll: 0 },
      vehicle.nose,
    ),
  };
  let progress = atBerth ? 0.9995 : fromProgress;
  let trim = NEUTRAL_ROTORCRAFT_TRIM;
  let motorOutput = flight.limits.enginePoints.map(() => 1 / flight.liftReserve);
  let yawRateLimits = null;
  let docked = false;
  let missed = false;
  let seconds = 0;
  let last = null;
  for (let step = 0; step < 60 * 120 && !docked && !missed; step += 1) {
    const centre = mass.centre.map((value, index) => value + state.position[index]);
    const piloted = autopilot(
      plan,
      progress,
      centre,
      state.orientation,
      state.velocity,
      state.angularVelocity,
      { ...model, ...(yawRateLimits ? { yawRateLimits } : {}) },
      1,
      vehicle.nose,
      flight.approach,
    );
    const rotor = rotorcraftFlightStep(
      { ...machine, motorOutput },
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
        pathAcceleration: piloted.guidance.pathAcceleration,
      },
      trim,
      dt,
      0.9,
    );
    missed = missed || piloted.goAround;
    trim = rotor.trim;
    yawRateLimits = rotor.result.yawRateLimits;
    motorOutput = motorOutput.map((value, index) =>
      advanceRotorMotorOutput(
        value,
        rotor.result.commandedThrottle[index] ?? 0,
        dt,
        flight.spoolSeconds,
      ),
    );
    const facing = rotateVector(state.orientation, vehicle.nose);
    const flat = Math.hypot(facing[0], facing[2]) || 1;
    const stepped = stepBody(
      { ...state, position: centre },
      mass,
      [
        { force: [0, -mass.mass * GRAVITY, 0], point: centre },
        ...rotor.forces,
        {
          force: hullDrag(
            state.velocity,
            [facing[0] / flat, facing[2] / flat],
            model,
          ),
          point: centre,
        },
      ],
      { linear: 0, angular: mass.inertia[4] * flight.angularDamping },
      dt,
    );
    state = {
      ...stepped,
      position: stepped.position.map(
        (value, index) => value - mass.centre[index],
      ),
    };
    seconds += dt;
    progress = advanceVehicleRouteProgress(
      plan,
      progress,
      centre,
      Math.hypot(state.velocity[0], state.velocity[2]) * dt,
    );
    const mooring = vehicleMooringState(
      vehicle,
      state.position,
      state.orientation,
      state.velocity,
      state.angularVelocity,
      mass.centre,
    );
    docked = isDockingComplete(
      progress,
      mooring.offset,
      state.orientation,
      mooring.velocity,
      state.angularVelocity,
      vehicle.nose,
      flight.approach,
      flight.docking,
    );
    const forward = rotateVector(state.orientation, vehicle.nose);
    const forwardFlat = Math.hypot(forward[0], forward[2]) || 1;
    last = {
      progress,
      offset: Math.hypot(mooring.offset[0], mooring.offset[2]),
      height: Math.abs(mooring.offset[1]),
      speed: Math.hypot(mooring.velocity[0], mooring.velocity[2]),
      verticalSpeed: Math.abs(mooring.velocity[1]),
      angular: Math.hypot(...state.angularVelocity),
      alignment:
        (forward[0] * flight.approach.heading[0] +
          forward[2] * flight.approach.heading[1]) /
        forwardFlat,
    };
  }
  return { docked, missed, seconds, last };
}

const RANGE_CASES = [
  ["VX-8", DUCT_HEXACOPTER_RANGE_AIR_VEHICLE, combatHexacopterRangeScene, "combat-hexacopter-range:duct-vehicle", "circuit"],
  ["RAX-8", COMBAT_HEXACOPTER_RANGE_AIR_VEHICLE, combatHexacopterRangeScene, "combat-hexacopter-range:vehicle", "patrol"],
];

test("ПОСЛЕДНИЙ МЕТР ВНИЗ ПРОХОДЯТ, А НЕ ПРИБЛИЖАЮТСЯ К НЕМУ", () => {
  // Наблюдение Igor: «Корабль не успел стабилизироваться у причала… речь про
  // какие-то сантиметровые/десятки-сантиметровые допуски».
  //
  // Вертикальный контур был пропорционален остатку: чем ближе палуба, тем
  // медленнее машина к ней шла. Замер VX-8, поставленного в метре над
  // причалом: скорость снижения затухала −0.20, −0.16, −0.10, −0.08, −0.07 м/с
  // при остатке, застрявшем на 0.5 м и допуске 0.5 — четырёх сантиметров не
  // хватало, десять секунд таймера истекали. RAX-8 ту же схему продавливал
  // одной лишь вертикальной властью, и потому садился «идеально» —
  // сравнение с ним и показало, что дело не в машине, а в законе.
  const outcomes = [];
  for (const [name, vehicle, scene, clusterId, kind] of RANGE_CASES) {
    const result = flyToBerth(vehicle, scene, clusterId, kind, {
      atBerth: true,
    });
    assert.equal(
      result.docked,
      true,
      `${name} не села с метра над площадкой: ` +
        `остаток ${result.last.height.toFixed(2)} при допуске ` +
        `${vehicle.flight.docking.height}, ход ${result.last.speed.toFixed(2)}`,
    );
    outcomes.push(`${name}: ${result.seconds.toFixed(1)} с`);
  }
  // Замер 12.08.2026: обе укладываются втрое быстрее десятисекундного таймера.
  assert.deepEqual(outcomes, ["VX-8: 3.2 с", "RAX-8: 3.7 с"]);
});

test("ЗАХОД ЧЕМ-ТО КОНЧАЕТСЯ, а не длится вечно", () => {
  // Второе свойство и другое: машина, вошедшая в заход далеко от створа, может
  // и не успеть сойтись — но обязана это ОБЪЯВИТЬ. До правки она молча летела
  // по оси створа в бесконечность с постоянным ходом, а счётчик замирал под
  // самым порогом швартовки.
  for (const [name, vehicle, scene, clusterId, kind] of RANGE_CASES) {
    const result = flyToBerth(vehicle, scene, clusterId, kind);
    assert.ok(
      result.docked || result.missed,
      `${name}: заход не кончился ничем за ${result.seconds.toFixed(0)} с`,
    );
    assert.ok(
      result.seconds < 100,
      `${name}: развязка заняла ${result.seconds.toFixed(0)} с`,
    );
  }
});
