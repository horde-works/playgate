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
function flyToBerth(vehicle, scene, clusterId, kind, fromProgress = 0.86) {
  const mass = massProperties(
    scene.breakablePieces.filter((piece) => piece.clusterId === clusterId),
    densityOf,
  );
  const flight = vehicle.flight;
  const plan = flight.routePlan(kind, mass.centre);
  const dt = 1 / 60;
  const lateral = GRAVITY * Math.tan(flight.maximumTilt);
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
  const start = plan.point(fromProgress);
  // Машина приходит на этот участок С ХОДОМ, а не из покоя: старт без скорости
  // — другой опыт, и он оболгал бы стенд. Берётся касательная трассы и та
  // скорость, которую трасса здесь разрешает.
  const ahead = plan.point(Math.min(1, fromProgress + 2 / plan.length));
  const tangentLength =
    Math.hypot(ahead[0] - start[0], ahead[2] - start[2]) || 1;
  const entrySpeed = plan.speedLimit ? plan.speedLimit(fromProgress) : 12;
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
  let progress = fromProgress;
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

test("ЗАХОД ВСЕГДА ЧЕМ-ТО КОНЧАЕТСЯ: швартовкой или объявленным промахом", () => {
  // Настоящее свойство, которое было нарушено, — НЕ «машина всегда садится».
  // Нарушено было то, что заход мог не кончиться ВООБЩЕ: машина уходила по оси
  // створа с постоянным ходом, счётчик замирал под самым порогом швартовки, а
  // промах не объявлялся, потому что его проверка живёт только в узком окне у
  // причала (2.5 допуска места — у VX-8 это 10.5 м). Мимо этого окна машина
  // летела в бесконечность, и в игре это выглядело как «висит и не
  // отключается».
  //
  // Теперь у захода есть второй признак промаха — ПРИЧАЛ УДАЛЯЕТСЯ, — и он
  // берётся предсказанием, а не памятью: автопилот считается заново каждым
  // кадром. Машина, доворачивающая на створ, идёт К причалу и промахом не
  // считается; уходящая — считается.
  const cases = [
    ["VX-8", DUCT_HEXACOPTER_RANGE_AIR_VEHICLE, combatHexacopterRangeScene, "combat-hexacopter-range:duct-vehicle", "circuit"],
    ["RAX-8", COMBAT_HEXACOPTER_RANGE_AIR_VEHICLE, combatHexacopterRangeScene, "combat-hexacopter-range:vehicle", "patrol"],
  ];
  const outcomes = [];
  for (const [name, vehicle, scene, clusterId, kind] of cases) {
    const result = flyToBerth(vehicle, scene, clusterId, kind);
    assert.ok(
      result.docked || result.missed,
      `${name}: заход не кончился ничем за ${result.seconds.toFixed(0)} с — ` +
        `прогресс ${result.last.progress.toFixed(3)}, ` +
        `до точки швартовки ${result.last.offset.toFixed(1)} м`,
    );
    // И кончился он ЗА КОНЕЧНОЕ ВРЕМЯ. Граница щедрая намеренно: она ловит
    // «никогда», а не медленность. До правки обе машины летели ровно столько,
    // сколько им отпускал стенд, и остановить их было нечем.
    assert.ok(
      result.seconds < 100,
      `${name}: развязка заняла ${result.seconds.toFixed(0)} с`,
    );
    outcomes.push(
      `${name}: ${result.docked ? "пришвартовалась" : "объявила промах"} за ${result.seconds.toFixed(0)} с`,
    );
  }
  // Замер 12.08.2026 — чем именно кончается заход у каждой. Обе объявляют
  // промах: сойтись со створом с этого места они не успевают, и это честный
  // исход, а не молчаливое зависание. Второй круг конечен
  // (`maximumGoArounds: 3`), дальше вступает обычный порядок замены — то есть
  // рейс кончается всегда.
  assert.deepEqual(outcomes, [
    "VX-8: объявила промах за 71 с",
    "RAX-8: объявила промах за 31 с",
  ]);
});
