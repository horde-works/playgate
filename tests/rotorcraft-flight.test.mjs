import assert from "node:assert/strict";
import test from "node:test";
import {
  RESTING_BODY,
  massProperties,
  stepBody,
} from "../games/make-a-mess/src/game/clusterDynamics.ts";
import { structuralMaterialProfiles } from "../games/make-a-mess/src/game/destructionScene.ts";
import { combatHexacopterRangeScene } from "../games/make-a-mess/src/game/combatHexacopterRangeScene.ts";
import { TOWN_HEXACOPTER_CLUSTER_ID } from "../games/make-a-mess/src/game/townHexacopter.ts";
import { TOWN_HEXACOPTER_AIR_VEHICLE } from "../games/make-a-mess/src/game/airVehicles.ts";
import {
  hullDrag,
  pitchAxisOf,
  vehicleAttitude,
  vehicleRotation,
} from "../games/make-a-mess/src/game/vehicleFrames.ts";
import { levelLiftCeiling } from "../games/make-a-mess/src/game/vehicleLiftGeometry.ts";
import {
  advanceVehicleFailureWatchdog,
  createVehicleFailureWatchdog,
  DEFAULT_VEHICLE_FAILURE_ENVELOPE,
} from "../games/make-a-mess/src/game/vehicleFailure.ts";
import {
  advanceRotorMotorOutput,
  NEUTRAL_ROTORCRAFT_TRIM,
  rotorcraftCommandsExecute,
  rotorcraftFlightStep,
  rotorcraftHeadingRate,
} from "../games/make-a-mess/src/game/rotorcraftDynamics.ts";
import {
  advanceRotorcraftPilot,
  createRotorcraftPilotState,
} from "../games/make-a-mess/src/game/rotorcraftPilot.ts";

// ---------------------------------------------------------------------------
// ЛЕТАЕТ ЛИ ОНА НА САМОМ ДЕЛЕ
//
// Этот файл не проверяет формулы по отдельности — для этого есть
// rotorcraft-dynamics. Он гоняет машину силами через тот же `stepBody`, что и
// рантайм, и спрашивает про поведение, которое можно увидеть глазами.
//
// Случаи взяты не из головы, а с натуры — так ведёт себя настоящий дрон:
//
//   1. на полном ходу машина идёт носом вниз, а на команду «назад» ВСТАЁТ НА
//      ДЫБЫ: мгновенно перебрасывает момент на носовые винты, сбрасывает на
//      кормовых и стабилизируется по вектору движения;
//   2. криво положенный груз она отрабатывает сама: висит горизонтально,
//      просто винты держат разную тягу. Характеристики падают, управляемость
//      нет;
//   3. выбитый двигатель — тот же случай, что грузик: постоянный перекос,
//      который автоматика выучивает. Разница только в цене;
//   4. зависший дрон сопротивляется толчку и возвращается в позу.
//
// Главная ловушка стенда, стоившая полдня: `stepBody` меряет плечи от
// `state.position`, поэтому рантайм ПОДСТАВЛЯЕТ туда мировой центр масс. Стенд
// обязан делать то же самое. Со смещением на авторский центр вес и тяга гасили
// паразитный момент друг друга на висении, всё выглядело правильно — и машина
// срывалась в штопор ровно на первом манёвре, где тяга перестала равняться
// весу.
// ---------------------------------------------------------------------------

const densityOf = (material) => structuralMaterialProfiles[material].density;
const ship = combatHexacopterRangeScene.breakablePieces.filter(
  (piece) => piece.clusterId === TOWN_HEXACOPTER_CLUSTER_ID,
);
const properties = massProperties(ship, densityOf);
const vehicle = TOWN_HEXACOPTER_AIR_VEHICLE;
const flight = vehicle.flight;
const GRAVITY = 9.81;
const STEP = 1 / 60;
const MAXIMUM_TILT = (30 * Math.PI) / 180;
const NOSE = [vehicle.nose[0], 0, vehicle.nose[2]];
const dragModel = {
  mass: properties.mass,
  inertiaYaw: properties.inertia[4],
  bodyCentre: properties.centre,
  dragLinear: properties.mass * flight.linearDamping,
  dragLateral:
    properties.mass * flight.linearDamping * flight.lateralDragRatio,
  dragAngular: properties.inertia[4] * flight.angularDamping,
  limits: flight.limits,
};

test("мотор физически раскручивается и останавливается, а не меняет тягу кадром", () => {
  let output = 0;
  output = advanceRotorMotorOutput(output, 0.6, STEP, 5);
  assert.equal(output > 0 && output < 0.6, true);
  for (let step = 1; step < 5 / STEP; step += 1) {
    output = advanceRotorMotorOutput(output, 0.6, STEP, 5);
  }
  assert.equal(output > 0.56 && output < 0.6, true, `раскрутка ${output}`);
  const beforeShutdown = output;
  output = advanceRotorMotorOutput(output, 0, STEP, 5);
  assert.equal(output > 0 && output < beforeShutdown, true);
  for (let step = 0; step < 3 / STEP; step += 1) {
    output = advanceRotorMotorOutput(output, 0, STEP, 5);
  }
  assert.equal(output < 0.001, true, `не остановился: ${output}`);
});

const rotate = (quaternion, vector) => {
  const [x, y, z, w] = quaternion;
  const tx = 2 * (y * vector[2] - z * vector[1]);
  const ty = 2 * (z * vector[0] - x * vector[2]);
  const tz = 2 * (x * vector[1] - y * vector[0]);
  return [
    vector[0] + w * tx + (y * tz - z * ty),
    vector[1] + w * ty + (z * tx - x * tz),
    vector[2] + w * tz + (x * ty - y * tx),
  ];
};

const machineWith = (availability = [1, 1, 1, 1, 1, 1]) => ({
  points: flight.limits.enginePoints,
  centreOfMass: properties.centre,
  nose: vehicle.nose,
  mass: properties.mass,
  inertia: [properties.inertia[0], properties.inertia[4], properties.inertia[8]],
  availability,
  liftCapacity: properties.mass * GRAVITY * flight.liftReserve,
  maximumTilt: MAXIMUM_TILT,
});

const newFlight = (availability) => ({
  machine: machineWith(availability),
  trim: NEUTRAL_ROTORCRAFT_TRIM,
  body: {
    ...RESTING_BODY,
    // Мировой центр масс. Рантайм кладёт сюда `mass.centre + body.position`.
    position: [0, 0, 0],
    orientation: vehicleRotation(
      { position: [0, 0, 0], yaw: 0, pitch: 0, roll: 0 },
      vehicle.nose,
    ),
  },
});

test("mixer не создаёт силу в обход остановленных физических моторов", () => {
  const simulation = newFlight();
  const step = rotorcraftFlightStep(
    { ...simulation.machine, motorOutput: [0, 0, 0, 0, 0, 0] },
    {
      orientation: simulation.body.orientation,
      centre: simulation.body.position,
      velocity: simulation.body.velocity,
      angularVelocity: simulation.body.angularVelocity,
    },
    { forwardSpeed: 0, lateralSpeed: 0, yawRate: 0, collective: 0 },
    simulation.trim,
    STEP,
  );
  assert.equal(Math.max(...step.result.commandedThrottle) > 0, true);
  assert.equal(step.result.thrust.every((value) => value === 0), true);
  assert.equal(step.result.authority.thrust, 0);
});

/**
 * Один шаг — ЧЕРЕЗ ТОТ ЖЕ ВХОД, ЧТО У РАНТАЙМА.
 *
 * Здесь была главная ложь этого файла. Стенд держал собственный полётный
 * контур: сам раскладывал ход по носу, сам звал внешний контур по скорости, сам
 * держал курс — и получалось, что он проверяет машину, которой в игре нет.
 * Рантайм в это время вёл её корабельными рычагами через оболочку дирижабля.
 * Тест зеленел, а дрон летел хвостом вперёд.
 *
 * Теперь и стенд, и `VehicleFrameSystem` зовут `rotorcraftFlightStep`.
 * Разойтись им больше негде: расходится только источник курса — стенд держит
 * фиксированный, автопилот считает свой по маршруту и створу.
 */
const advance = (simulation, wanted, extraForces = []) => {
  const forwardWorld = rotate(simulation.body.orientation, NOSE);
  const length = Math.hypot(forwardWorld[0], forwardWorld[2]) || 1;
  const nx = forwardWorld[0] / length;
  const nz = forwardWorld[2] / length;
  const step = rotorcraftFlightStep(
    simulation.motorOutput
      ? { ...simulation.machine, motorOutput: simulation.motorOutput }
      : simulation.machine,
    {
      orientation: simulation.body.orientation,
      centre: simulation.body.position,
      velocity: simulation.body.velocity,
      angularVelocity: simulation.body.angularVelocity,
    },
    {
      forwardSpeed: wanted.forward ?? 0,
      lateralSpeed: wanted.lateral ?? 0,
      yawRate:
        wanted.yawRate ?? rotorcraftHeadingRate(NOSE, forwardWorld, 0.8),
      collective: wanted.collective ?? 0,
    },
    simulation.trim,
    STEP,
  );
  const result = step.result;
  if (simulation.motorOutput) {
    simulation.motorOutput = simulation.motorOutput.map((value, index) =>
      advanceRotorMotorOutput(
        value,
        result.commandedThrottle[index] ?? 0,
        STEP,
        flight.spoolSeconds,
      ),
    );
  }
  const alongNose = step.forwardSpeed;
  const acrossNose = step.lateralSpeed;
  simulation.trim = step.trim;
  simulation.body = stepBody(
    simulation.body,
    properties,
    [
      {
        force: [0, -properties.mass * GRAVITY, 0],
        point: simulation.body.position,
      },
      ...result.forces,
      {
        force: hullDrag(simulation.body.velocity, [nx, nz], dragModel),
        point: simulation.body.position,
      },
      ...extraForces,
    ],
    { linear: 0, angular: properties.inertia[4] * flight.angularDamping },
    STEP,
  );
  return {
    ...result,
    alongNose,
    acrossNose,
    heading: Math.atan2(-nx, -nz),
  };
};

test("висение: машина стоит ровно и не проваливается", () => {
  const simulation = newFlight();
  let last = null;
  for (let step = 0; step < 60 * 12; step += 1) {
    last = advance(simulation, { forward: 0 });
  }
  assert.equal(
    Math.abs(last.pitch) < 0.01 && Math.abs(last.roll) < 0.01,
    true,
    `висит криво: тангаж ${(last.pitch * 57.3).toFixed(2)}° крен ${(last.roll * 57.3).toFixed(2)}°`,
  );
  assert.equal(
    Math.abs(simulation.body.position[1]) < 0.4,
    true,
    `ушла по высоте на ${simulation.body.position[1].toFixed(2)} м`,
  );
  // Висение настоящего мультиротора — заметно меньше полного газа: остаток
  // оборотов и есть весь запас управляемости.
  assert.equal(
    last.collective > 0.2 && last.collective < 0.45,
    true,
    `висит на газе ${last.collective.toFixed(2)}`,
  );
  assert.equal(rotorcraftCommandsExecute(last.authority), true);
});

test("разгон идёт наклоном, и наклон стоит оборотов", () => {
  const simulation = newFlight();
  let peakTilt = 0;
  let last = null;
  for (let step = 0; step < 60 * 3; step += 1) last = advance(simulation, { forward: 0 });
  const hover = last.collective;
  let atPeak = hover;
  for (let step = 0; step < 60 * 8; step += 1) {
    last = advance(simulation, { forward: 16 });
    if (last.pitch > peakTilt) {
      peakTilt = last.pitch;
      atPeak = last.collective;
    }
  }
  assert.equal(peakTilt > 0.3, true, `нос не клюнул: ${(peakTilt * 57.3).toFixed(1)}°`);
  assert.equal(
    last.alongNose > 12,
    true,
    `не разогналась: ${last.alongNose.toFixed(1)} м/с`,
  );
  // Горизонт у коптера рождается ТОЛЬКО наклоном, а наклон забирает вертикаль
  // как `cos θ`. Автоматика обязана это добрать газом — и добирает: высота
  // держится, а вот ГАЗ на разгоне заметно выше, чем на висении. Связанность
  // не исчезает, она переезжает в обороты, и это её видимый след.
  // Цена наклона известна точно: `1/cos θ`. Её и проверяем на самом наклоне,
  // а не в конце разгона, где машина уже легла в крейсерский угол.
  assert.equal(
    atPeak > (hover / Math.cos(peakTilt)) * 0.95,
    true,
    `наклон ${(peakTilt * 57.3).toFixed(0)}° не стоил оборотов: висение ${hover.toFixed(3)}, на наклоне ${atPeak.toFixed(3)}`,
  );
  assert.equal(
    Math.abs(simulation.body.position[1]) < 1.5,
    true,
    `не удержала высоту на разгоне: ${simulation.body.position[1].toFixed(2)} м`,
  );
});

test("диагональный манёвр остаётся резким и использует весь общий наклон", () => {
  const simulation = newFlight();
  for (let step = 0; step < 60 * 3; step += 1) {
    advance(simulation, { forward: 0 });
  }
  let peakTilt = 0;
  for (let step = 0; step < 60 * 4; step += 1) {
    advance(simulation, { forward: 16, lateral: 16 });
    const up = rotate(simulation.body.orientation, [0, 1, 0]);
    peakTilt = Math.max(
      peakTilt,
      Math.acos(Math.max(-1, Math.min(1, up[1]))),
    );
  }
  assert.equal(
    peakTilt > MAXIMUM_TILT * 0.82,
    true,
    `диагональ использовала только ${(peakTilt * 57.3).toFixed(1)}°`,
  );
  // Небольшой динамический заброс допустим; скрытые 30°+30° — нет.
  assert.equal(
    peakTilt < MAXIMUM_TILT + 0.12,
    true,
    `векторный предел пробит: ${(peakTilt * 57.3).toFixed(1)}°`,
  );
});

test("на команду «назад» машина встаёт на дыбы и гасит ход", () => {
  // Наблюдение с натуры: дрон на полном ходу идёт носом вниз под 20–30°, на
  // команду «назад» мгновенно перебрасывает момент на носовые винты, встаёт на
  // дыбы и стабилизируется по вектору движения.
  const simulation = newFlight();
  let cruise = null;
  for (let step = 0; step < 60 * 10; step += 1) {
    cruise = advance(simulation, { forward: 18 });
  }
  assert.equal(
    cruise.pitch > 0.25,
    true,
    `на крейсере нос не опущен: ${(cruise.pitch * 57.3).toFixed(1)}°`,
  );
  const cruiseSpeed = cruise.alongNose;
  assert.equal(cruiseSpeed > 14, true, `крейсер всего ${cruiseSpeed.toFixed(1)} м/с`);

  const bowStations = [0, 5];
  const sternStations = [2, 3];
  let rearing = 0;
  let fastestThrow = 0;
  let fastestTiltRotation = 0;
  let throwing = null;
  let last = null;
  let noseUpAt = null;
  for (let step = 0; step < 60 * 12; step += 1) {
    last = advance(simulation, { forward: -8 });
    rearing = Math.min(rearing, last.pitch);
    if (noseUpAt === null && last.pitch < -0.2) {
      noseUpAt = step * STEP;
    }
    // Раскладку тяги смотрим в момент САМОГО БЫСТРОГО ПЕРЕБРОСА, а не на пике
    // угла: на пике машина уже пришла и момент ей больше не нужен.
    if (last.pitchRate < fastestThrow) {
      fastestThrow = last.pitchRate;
      throwing = last.thrust;
    }
    fastestTiltRotation = Math.max(
      fastestTiltRotation,
      Math.hypot(
        simulation.body.angularVelocity[0],
        simulation.body.angularVelocity[2],
      ),
    );
  }
  assert.equal(
    rearing < -0.4,
    true,
    `на дыбы не встала: ${(rearing * 57.3).toFixed(1)}°`,
  );
  assert.equal(
    noseUpAt !== null && noseUpAt < 1.5,
    true,
    `перекладка заняла ${noseUpAt?.toFixed(2) ?? "больше 12"} с`,
  );
  assert.ok(flight.guidance?.upsetTiltRate);
  assert.equal(
    fastestTiltRotation > 0.55 &&
      fastestTiltRotation < flight.guidance.upsetTiltRate,
    true,
    `штатная перекладка ${fastestTiltRotation.toFixed(2)} рад/с должна быть выше ворот дирижабля и ниже ворот коптера`,
  );
  // И встаёт она именно так, как настоящая: НОСОВЫЕ винты сброшены, кормовые
  // добавлены. Не «повернулась», а перебросила момент.
  const bow = bowStations.reduce((sum, index) => sum + throwing[index], 0) / 2;
  const stern =
    sternStations.reduce((sum, index) => sum + throwing[index], 0) / 2;
  assert.equal(
    bow > stern,
    true,
    `момент переброшен не туда: нос ${bow.toFixed(0)}, корма ${stern.toFixed(0)}`,
  );
  assert.equal(
    last.alongNose < -5,
    true,
    `ход не развернулся: ${last.alongNose.toFixed(1)} м/с`,
  );
  // Курс при этом держится: перекладка тангажа не разворачивает машину.
  assert.equal(
    Math.abs(last.heading - Math.atan2(-NOSE[0], -NOSE[2])) < 0.05,
    true,
    `курс уехал на ${(last.heading * 57.3).toFixed(0)}°`,
  );
});

test("криво положенный груз машина отрабатывает сама", () => {
  // Грузик нельзя положить идеально ни по одной оси. Машина не знает, где он,
  // — она ВЫЯСНЯЕТ, какую тягу держать каждому винту, чтобы стоять ровно.
  const load = 8 * GRAVITY;
  const offset = [1.3, 0, 0.7];
  const simulation = newFlight();
  let last = null;
  for (let step = 0; step < 60 * 25; step += 1) {
    last = advance(
      simulation,
      { forward: 0, collective: load / (properties.mass * GRAVITY) },
      [
        {
          force: [0, -load, 0],
          point: [
            simulation.body.position[0] + offset[0],
            simulation.body.position[1] + offset[1],
            simulation.body.position[2] + offset[2],
          ],
        },
      ],
    );
  }
  assert.equal(
    Math.abs(last.pitch) < 0.02 && Math.abs(last.roll) < 0.02,
    true,
    `висит наклонённой: тангаж ${(last.pitch * 57.3).toFixed(2)}° крен ${(last.roll * 57.3).toFixed(2)}°`,
  );
  // И держится она горизонтально не «сама собой», а РАЗНОЙ ТЯГОЙ винтов.
  const spread = Math.max(...last.thrust) - Math.min(...last.thrust);
  assert.equal(
    spread > 20,
    true,
    `винты держат одинаково, значит перекос не отработан: разброс ${spread.toFixed(0)}`,
  );
});

test("выбитое кольцо — тот же перекос: машина висит и слушается", () => {
  const simulation = newFlight([1, 1, 1, 0, 1, 1]);
  let last = null;
  for (let step = 0; step < 60 * 12; step += 1) {
    last = advance(simulation, { forward: 0 });
  }
  assert.equal(last.thrust[3], 0, "выбитое кольцо тянет");
  // Спрашивать «висит ли ровно» тут нельзя: машина одновременно гасит снос,
  // а гасится он наклоном, и наклон в этот момент ЧЕСТНЫЙ. Спрашиваем то, что
  // на самом деле важно: держит ли она заданную позу.
  assert.equal(
    Math.abs(last.pitchError) < 0.03 && Math.abs(last.rollError) < 0.03,
    true,
    `позу не держит: ошибка тангажа ${(last.pitchError * 57.3).toFixed(1)}° крена ${(last.rollError * 57.3).toFixed(1)}°`,
  );
  assert.equal(
    rotorcraftCommandsExecute(last.authority),
    true,
    "с одним выбитым кольцом команды перестали выполняться",
  );
  assert.equal(
    Math.abs(simulation.body.position[1]) < 1.5,
    true,
    `не удержала высоту: ${simulation.body.position[1].toFixed(1)} м`,
  );
  // Живые ДОБИРАЮТ долю выбитого — иначе машина ровно и управляемо снижается.
  const alive = last.thrust.filter((_, index) => index !== 3);
  assert.equal(
    alive.reduce((sum, value) => sum + value, 0) >
      properties.mass * GRAVITY * 0.9,
    true,
    "оставшиеся не добрали чужую долю",
  );

  // И она по-прежнему летит туда, куда просят: характеристики деградируют,
  // управляемость нет.
  for (let step = 0; step < 60 * 10; step += 1) {
    last = advance(simulation, { forward: 6 });
  }
  assert.equal(
    last.alongNose > 3,
    true,
    `с отказом не пошла вперёд: ${last.alongNose.toFixed(1)} м/с`,
  );
});

test("отказ любого одного винта в полёте меняет границы, а не отнимает позу", () => {
  for (let dead = 0; dead < 6; dead += 1) {
    const simulation = newFlight();
    simulation.motorOutput = flight.limits.enginePoints.map(
      () => 1 / flight.liftReserve,
    );
    for (let step = 0; step < 60 * 3; step += 1) {
      advance(simulation, { forward: 0 });
    }
    simulation.machine = machineWith(
      flight.limits.enginePoints.map((_, index) => (index === dead ? 0 : 1)),
    );

    let criticalSeconds = 0;
    let maximumCriticalSeconds = 0;
    let last = null;
    for (let step = 0; step < 60 * 8; step += 1) {
      // Ask specifically for the yaw direction made scarce by this rotor's
      // spin. The machine must reject that part of the request rather than
      // trade away pitch/roll and then accuse itself of disobeying it.
      const unavailableYaw = dead % 2 === 0 ? 0.6 : -0.6;
      last = advance(simulation, { forward: 0, yawRate: unavailableYaw });
      const yawRateError =
        simulation.body.angularVelocity[1] - last.acceptedYawRate;
      const critical =
        Math.abs(last.pitch) > DEFAULT_VEHICLE_FAILURE_ENVELOPE.maximumPitch ||
        Math.abs(last.roll) > DEFAULT_VEHICLE_FAILURE_ENVELOPE.maximumRoll ||
        Math.abs(yawRateError) >
          DEFAULT_VEHICLE_FAILURE_ENVELOPE.maximumYawRate;
      criticalSeconds = critical ? criticalSeconds + STEP : 0;
      maximumCriticalSeconds = Math.max(maximumCriticalSeconds, criticalSeconds);
    }
    assert.equal(
      maximumCriticalSeconds < DEFAULT_VEHICLE_FAILURE_ENVELOPE.attitudeGraceSeconds,
      true,
      `винт ${dead}: ложная criticalAttitude держалась ${maximumCriticalSeconds.toFixed(2)} с`,
    );
    assert.equal(
      Math.abs(last.pitchError) < 0.04 && Math.abs(last.rollError) < 0.04,
      true,
      `винт ${dead}: потеряна поза`,
    );
  }
});

test("при аварийном снижении на пяти винтах автомат гасит медленное вращение", () => {
  for (let dead = 0; dead < 6; dead += 1) {
    const simulation = newFlight();
    simulation.motorOutput = flight.limits.enginePoints.map(
      () => 1 / flight.liftReserve,
    );
    for (let step = 0; step < 60 * 3; step += 1) {
      advance(simulation, { forward: 0 });
    }
    simulation.machine = machineWith(
      flight.limits.enginePoints.map((_, index) => (index === dead ? 0 : 1)),
    );

    let last = null;
    for (let step = 0; step < 60 * 8; step += 1) {
      last = advance(simulation, {
        forward: 0,
        yawRate: 0,
        collective: -0.18,
      });
    }
    assert.equal(
      Math.abs(last.yawRate) < 0.08,
      true,
      `винт ${dead}: на снижении осталось ${last.yawRate.toFixed(3)} рад/с`,
    );
    assert.equal(
      Math.abs(last.pitchError) < 0.04 && Math.abs(last.rollError) < 0.04,
      true,
      `винт ${dead}: снижение потеряло позу`,
    );
  }
});

test("зависшую машину толкнули — она сопротивляется и возвращается в позу", () => {
  const simulation = newFlight();
  for (let step = 0; step < 60 * 4; step += 1) advance(simulation, { forward: 0 });
  let peakRoll = 0;
  let last = null;
  for (let step = 0; step < 60 * 10; step += 1) {
    const time = step * STEP;
    // Полсекунды силы в борт выше центра масс — палец в зависший дрон.
    const push =
      time < 0.5
        ? [
            {
              force: [0, 0, 240],
              point: [
                simulation.body.position[0],
                simulation.body.position[1] + 0.9,
                simulation.body.position[2],
              ],
            },
          ]
        : [];
    last = advance(simulation, { forward: 0 }, push);
    peakRoll = Math.max(peakRoll, Math.abs(last.roll));
  }
  // Сопротивляется: толчок кладёт её в крен, но не опрокидывает.
  assert.equal(
    peakRoll > 0.03 && peakRoll < 0.3,
    true,
    `реакция на толчок неправдоподобна: ${(peakRoll * 57.3).toFixed(1)}°`,
  );
  // И возвращается: поза восстановлена, снос погашен.
  assert.equal(
    Math.abs(last.roll) < 0.02,
    true,
    `не вернулась в позу: крен ${(last.roll * 57.3).toFixed(2)}°`,
  );
  assert.equal(
    Math.hypot(simulation.body.velocity[0], simulation.body.velocity[2]) < 0.2,
    true,
    "снос не погашен",
  );
});

test("на трёх кольцах машина мягко садится, на четырёх — летит", () => {
  // Требование к паспорту машины, а не к автоматике: на трёх кольцах —
  // мягкая посадка, на четырёх — полёт. Отсюда и тяговооружённость.
  const points = flight.limits.enginePoints;
  const alive = (...dead) =>
    points.map((_, index) => (dead.includes(index) ? 0 : 1));
  const carries = (...dead) =>
    levelLiftCeiling(points, properties.centre, alive(...dead)) *
    flight.liftReserve;

  // Худшая рабочая тройка: пара напротив плюс сосед.
  assert.equal(
    carries(2, 4, 5) >= 1,
    true,
    `на трёх кольцах не сядет: ${carries(2, 4, 5).toFixed(2)} веса`,
  );
  // Худшая рабочая четвёрка.
  assert.equal(
    carries(0, 1) >= 1,
    true,
    `на четырёх не полетит: ${carries(0, 1).toFixed(2)} веса`,
  );
  // Тройка через одно, по сто двадцать градусов, — самая живучая.
  assert.equal(carries(1, 3, 5) > 1.4, true);
});

test("два выбитых кольца в одной половине круга — отказ, и он виден", () => {
  // Тут не помогает никакая мощность: чтобы не перевернуться, машина обязана
  // погасить встречные, и живой остаток лежит по одну сторону от центра масс.
  // Ловится это НЕДОБОРОМ КОМАНД, а не подсчётом целых лопастей.
  const points = flight.limits.enginePoints;
  // Живыми остаются кольца 2, 3 и 4 — все в одной половине круга.
  const hopeless = points.map((_, index) => ([0, 1, 5].includes(index) ? 0 : 1));
  assert.equal(
    levelLiftCeiling(points, properties.centre, hopeless) < 0.01,
    true,
    "раскладка на самом деле рабочая — тест выбран неверно",
  );

  const simulation = newFlight(hopeless);
  let last = null;
  let complaints = 0;
  let watchdog = createVehicleFailureWatchdog(0.2);
  let failure = null;
  for (let step = 0; step < 60 * 6; step += 1) {
    last = advance(simulation, { forward: 0 });
    if (!rotorcraftCommandsExecute(last.authority)) complaints += 1;
    const supervised = advanceVehicleFailureWatchdog(watchdog, {
      deltaSeconds: STEP,
      relativeAltitude: 10,
      pitch: last.pitch,
      roll: last.roll,
      headingError: 0,
      yawRateError: 0,
      crossTrackError: 0,
      altitudeError: 0,
      progress: 0.2,
      requiredControlAvailable: rotorcraftCommandsExecute(last.authority),
      requestedControlEffort: Math.max(...last.commandedThrottle),
      deliveredControlFraction: Math.min(
        last.authority.thrust,
        last.authority.pitch,
        last.authority.roll,
      ),
      requestedLiftEffort: 0,
      deliveredLiftFraction: last.authority.thrust,
      goArounds: 0,
      corrections: 0,
      turning: false,
      inFinalManeuver: false,
      dockingDistance: 100,
      inDockingCapture: false,
      dockingComplete: false,
      recoveringDisturbance: false,
    });
    watchdog = supervised.state;
    failure ??= supervised.failure;
  }
  assert.equal(
    complaints > 60,
    true,
    `автоматика не заметила отказ: жалоб ${complaints} за шесть секунд`,
  );
  assert.equal(
    simulation.body.position[1] < -1,
    true,
    "машина с непоправимой раскладкой почему-то держит высоту",
  );
  assert.equal(failure, "controlMismatch");
});

test("«вбок вправо» — это вправо в мировых осях, а не в собственных", () => {
  // ЭТА ПРОВЕРКА СТОИТ ОТДЕЛЬНО ОТ ВСЕХ ОСТАЛЬНЫХ, и вот зачем.
  //
  // Остальные тесты этого файла замкнуты на винтовую модель: они спрашивают её
  // же о крене и её же о сносе. Такой набор ПРОХОДИТ ЦЕЛИКОМ даже при
  // перевёрнутой поперечной оси — что и случилось. Внутри модуля правым бортом
  // назван (nz, −nx), а весь остальной проект считает правым бортом
  // `pitchAxisOf(nose) = (−nz, nx)`; при правой тройке и носе вдоль −x это −z,
  // и на том же знаке стоят `vehicleAttitude` и боковой контур автопилота.
  //
  // Пока модуль был замкнут на себя, разницы не было. На стыке с автопилотом
  // машина поехала в сторону, ПРОТИВОПОЛОЖНУЮ просьбе: снос рос, крен вставал
  // в предельные тридцать градусов, и за две минуты её уносило на семьсот
  // метров от круга облёта.
  //
  // Поэтому здесь спрашивают не модель, а МИР: куда machine реально уехала.
  const simulation = newFlight();
  for (let step = 0; step < 60 * 6; step += 1) {
    advance(simulation, { forward: 0, lateral: 5 });
  }
  const starboard = pitchAxisOf(vehicle.nose);
  const alongStarboard =
    simulation.body.position[0] * starboard[0] +
    simulation.body.position[2] * starboard[2];
  assert.equal(
    alongStarboard > 5,
    true,
    `просили вправо, уехала на ${alongStarboard.toFixed(1)} м вдоль правого борта`,
  );
  // И крен при этом — правым бортом вниз, в том же смысле, что у всего проекта.
  const attitude = vehicleAttitude(simulation.body.orientation, vehicle.nose);
  assert.equal(
    attitude.roll > 0,
    true,
    `крен по соглашению проекта вышел ${(attitude.roll * 57.3).toFixed(1)}°`,
  );
});

test("правая стрелка физически поворачивает нос вправо, левая — влево", () => {
  const command = (horizontalAxis) =>
    advanceRotorcraftPilot(
      createRotorcraftPilotState(8),
      {
        forwardAxis: 0,
        horizontalAxis,
        translationModifier: false,
        altitudeDelta: 0,
        brake: false,
        requestSafeClimb: false,
        requestReturn: false,
      },
      {
        relativeAltitude: 8,
        verticalSpeed: 0,
        deltaSeconds: STEP,
        liftTrimRange: flight.limits.liftTrimRange,
      },
    ).guidance;
  const starboard = pitchAxisOf(vehicle.nose);

  for (const [horizontalAxis, side, label] of [
    [1, 1, "вправо"],
    [-1, -1, "влево"],
  ]) {
    const simulation = newFlight();
    const guidance = command(horizontalAxis);
    for (let step = 0; step < 60; step += 1) {
      advance(simulation, { forward: 0, yawRate: guidance.yawRate });
    }
    const turnedNose = rotate(simulation.body.orientation, NOSE);
    const towardStarboard =
      turnedNose[0] * starboard[0] + turnedNose[2] * starboard[2];
    assert.equal(
      towardStarboard * side > 0.12,
      true,
      `${label}: нос ушёл на ${towardStarboard.toFixed(2)} вдоль правого борта`,
    );
  }
});
