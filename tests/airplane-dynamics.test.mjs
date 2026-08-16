import assert from "node:assert/strict";
import test from "node:test";
import {
  AIRPLANE_PREFLIGHT_SECONDS,
  AIRPLANE_TURN_RESERVE,
  INTACT_AIRPLANE_AVAILABILITY,
  airplaneAllocate,
  airplaneBankFor,
  airplaneFlapFor,
  airplaneFlightStep,
  airplaneForces,
  airplanePreflightCommand,
  airplanePropellerVisualCommand,
  airplaneTurnCapability,
  controlSurfaceDegrees,
  stallSpeedOf,
  wingPanelCapacity,
} from "../games/make-a-mess/src/game/airplaneDynamics.ts";
import { islandAirportDc3Frame } from "../games/make-a-mess/src/content/scenes/islandAirport/islandAirportDc3.ts";
import {
  DC3_ACTUATOR_PIECES,
  DC3_AIRPLANE_CLASS,
  DC3_AIRPLANE_PASSPORT,
  DC3_STALL_WEIGHT,
  DC3_WING_PANELS,
} from "../games/make-a-mess/src/game/dc3Airplane.ts";
import { airVehicles } from "../games/make-a-mess/src/game/airVehicles.ts";
import { compileCommandActuators } from "../games/make-a-mess/src/game/vehicleActuation.ts";
import {
  liftApplicationPoint,
  liftHoldVerdict,
  wingLiftState,
} from "../games/make-a-mess/src/game/vehicleLiftGeometry.ts";

const passport = DC3_AIRPLANE_PASSPORT;
const intact = INTACT_AIRPLANE_AVAILABILITY;

/** Ровный горизонт на этой скорости: всё остальное — ноль. */
function level(airspeed) {
  return {
    airspeed,
    alpha: 0.07,
    beta: 0,
    pitch: 0.07,
    bank: 0,
    rollRate: 0,
    pitchRate: 0,
    yawRate: 0,
    climbRate: 0,
    groundSpeed: airspeed,
    forwardSpeed: airspeed,
  };
}

const NEUTRAL_COMMAND = {
  aileron: 0,
  elevator: 0,
  rudder: 0,
  flap: 0,
  throttle: [1, 1],
  brake: 0,
};

function forcesAt(command, availability = intact, airspeed = 48, alpha = 0.08) {
  return airplaneForces({
    passport,
    command: { ...NEUTRAL_COMMAND, ...command },
    availability,
    orientation: [0, 0, 0, 1],
    velocity: [0, -airspeed * Math.sin(alpha), airspeed * Math.cos(alpha)],
    angularVelocity: [0, 0, 0],
    centre: [0, 200, 0],
    nose: [0, 0, 1],
  });
}


test("DC-3 is a wing class, dispatched from the airport it stands on", () => {
  assert.equal(DC3_AIRPLANE_CLASS.liftSource, "wing");
  assert.equal(DC3_AIRPLANE_CLASS.worldIntegration, true);
  // Машина обязана стоять в ОБОИХ реестрах: кадр отпускает куски из
  // неподвижного мира, судно строит из них тело. Только во втором — это
  // компаунд поверх собственной неотпущенной копии.
  assert.ok(
    airVehicles.some((vehicle) => vehicle.id === DC3_AIRPLANE_CLASS.id),
  );
});

test("actuator tags compile to throttle, surfaces and flap channels", () => {
  const bindings = compileCommandActuators(DC3_ACTUATOR_PIECES);
  const channels = bindings.map((binding) => binding.commandChannel).sort();
  assert.deepEqual(channels, [
    "aileron",
    "elevator",
    "flap",
    "rudder",
    "throttle:0",
    "throttle:1",
  ]);
  const engines = bindings.filter((binding) => binding.commandChannel.startsWith("throttle:"));
  assert.ok(engines.every((binding) => binding.members.some((member) => member.required)));
  assert.equal(bindings.find((binding) => binding.commandChannel === "flap")?.members.length, 4);
  assert.equal(bindings.find((binding) => binding.commandChannel === "aileron")?.members.length, 2);
});

test("guidance does not ask the airplane to fly sideways", () => {
  const command = airplaneAllocate({
    passport,
    guidance: { forwardSpeed: 48, lateralSpeed: 12, yawRate: 0, liftFraction: 0 },
    air: level(48),
    weight: DC3_STALL_WEIGHT,
    onGround: false,
  });
  // Боковой ход отбрасывается целиком: машина не голономная, и просить у неё
  // перемещения вбок — значит просить того, чего у крыла нет.
  assert.ok(Math.abs(command.aileron) < 0.01);
  assert.ok(Math.abs(command.rudder) < 0.01);
  assert.ok(command.throttle[0] > 0);
  assert.equal(command.flap, 0);
});

test("a turn is asked for with BANK, not with a yaw moment", () => {
  // Главный урок этой машины: темп разворота — СЛЕДСТВИЕ крена. Просьба о
  // вираже обязана превратиться в угол, иначе угол становится свободным
  // интегратором и машина ложится на спину за десять секунд.
  const target = airplaneBankFor(passport, 0.15, 48);
  assert.ok(target > 0.5 && target <= passport.maximumBank);
  const level0 = airplaneAllocate({
    passport,
    guidance: { forwardSpeed: 48, lateralSpeed: 0, yawRate: 0.15, liftFraction: 0 },
    air: level(48),
    weight: DC3_STALL_WEIGHT,
    onGround: false,
  });
  // Машина ещё не накренена — элерон просит крена.
  assert.ok(level0.aileron > 0.1);
  const held = airplaneAllocate({
    passport,
    guidance: { forwardSpeed: 48, lateralSpeed: 0, yawRate: 0.15, liftFraction: 0 },
    air: { ...level(48), bank: target },
    weight: DC3_STALL_WEIGHT,
    onGround: false,
  });
  // Крен ВЫБРАН — элерон уходит почти в ноль: вираж держится сам.
  assert.ok(Math.abs(held.aileron) < Math.abs(level0.aileron) * 0.2);
});

test("at stall identity the intact wing holds weight; below stall it does not", () => {
  const panels = DC3_WING_PANELS.map((point) => ({ point: [...point], available: 1 }));
  const capacity = wingPanelCapacity(passport, passport.stallSpeed, 0, panels.length);
  const flying = liftHoldVerdict("wing", panels, [0, 0, 0], capacity, DC3_STALL_WEIGHT);
  assert.equal(wingLiftState(flying), "flying");
  const slow = liftHoldVerdict(
    "wing",
    panels,
    [0, 0, 0],
    wingPanelCapacity(passport, passport.stallSpeed * 0.7, 0, panels.length),
    DC3_STALL_WEIGHT,
  );
  assert.equal(wingLiftState(slow), "stalled");
});

test("losing one wing is a tumble, not a soft descent", () => {
  const panels = DC3_WING_PANELS.map((point, index) => ({
    point: [...point],
    available: index < 2 ? 0 : 1,
  }));
  const capacity = wingPanelCapacity(passport, passport.cruiseSpeed, 0, panels.length);
  const verdict = liftHoldVerdict("wing", panels, [0, 0, 0], capacity, DC3_STALL_WEIGHT);
  assert.equal(wingLiftState(verdict), "tumbling");
  const liftPoint = liftApplicationPoint("wing", [0, 0.35, 0], panels);
  assert.ok(liftPoint[0] > 2, "lift did not move onto the live wing");
});

test("flaps raise lift and drag; a dead engine pushes the machine off axis", () => {
  const clean = forcesAt({ flap: 0 });
  const dirty = forcesAt({ flap: 1 });
  assert.ok(dirty.lift > clean.lift);
  assert.ok(dirty.drag > clean.drag);
  const oneEngine = forcesAt({ throttle: [1, 0] }, { ...intact, engines: [1, 0] });
  assert.ok(oneEngine.thrust < clean.thrust * 0.6);
  // Разнотяг больше не «момент по паспорту»: тяга приложена на своём плече,
  // и рыскание получается само. Проверяется это тем, что суммарная сила
  // ушла с оси симметрии — момент есть следствие плеча, а не отдельное число.
  const offAxis = oneEngine.forces.filter((entry) => Math.abs(entry.point[0]) > 1);
  assert.ok(offAxis.length >= 1, "тяга обязана быть приложена в точке вала");
});

function cruiseStep(guidance, availability = intact, airspeed = 48) {
  return airplaneFlightStep({
    passport,
    guidance,
    availability,
    mass: DC3_STALL_WEIGHT / 9.81,
    orientation: [0, 0, 0, 1],
    velocity: [0, 0, airspeed],
    angularVelocity: [0, 0, 0],
    centre: [0, 200, 0],
    nose: [0, 0, 1],
  });
}

test("inner loop answers guidance with every surface, both engines and real force points", () => {
  const step = cruiseStep({
    forwardSpeed: 48,
    lateralSpeed: 14,
    yawRate: 0.2,
    liftFraction: 0.4,
  });
  assert.ok(step.requested.throttle[0] > 0);
  assert.equal(step.requested.throttle[0], step.requested.throttle[1]);
  assert.ok(step.requested.aileron > 0, "вираж просит крена");
  assert.ok(step.requested.elevator !== 0);
  assert.equal(step.requested.flap, 0);
  assert.equal(step.delivered.aileron, step.requested.aileron);
  // Четыре секции крыла (корневые со щитками, концевые с элеронами),
  // стабилизатор, киль и два вала: восемь точек приложения и ни одной чистой
  // пары. Момент здесь — следствие плеча.
  assert.equal(step.forces.length, 8);
});

test("the automaton drops flaps from phase and speed, not from a climb lever", () => {
  assert.equal(
    airplaneFlapFor({ finalPhase: true, forwardSpeed: 32 }, 32, passport),
    1,
  );
  assert.equal(
    airplaneFlapFor({ finalPhase: false, forwardSpeed: 20 }, 28, passport),
    1,
  );
  assert.equal(
    airplaneFlapFor({ finalPhase: false, forwardSpeed: 48 }, 48, passport),
    0,
  );
  const approach = cruiseStep(
    {
      forwardSpeed: 32,
      lateralSpeed: 0,
      yawRate: 0,
      liftFraction: 0,
      finalPhase: true,
    },
    intact,
    32,
  );
  const slow = cruiseStep(
    { forwardSpeed: 28, lateralSpeed: 0, yawRate: 0, liftFraction: 0 },
    intact,
    28,
  );
  const cruise = cruiseStep({
    forwardSpeed: 48,
    lateralSpeed: 0,
    yawRate: 0,
    liftFraction: 0.5,
  });
  assert.equal(approach.flap, 1);
  assert.equal(slow.flap, 1);
  assert.equal(cruise.flap, 0);
});

test("autopilot learns a non-holonomic turn from the passport", () => {
  const capability = airplaneTurnCapability(passport, 48, DC3_STALL_WEIGHT / 9.81);
  // Поперечное ускорение — располагаемое центростремительное в вираже, а не
  // способность ходить боком, И С РАБОЧИМ РЕЗЕРВОМ: паспортный крен — предел,
  // дуги планируются с запасом 1.6 по кривизне (порыв, набор и руль высоты
  // делят с виражом один Clmax). Без резерва автопилот входил в дугу
  // радиусом 376 м на 55 м/с — креном 39.3° при пределе 40.
  assert.ok(
    Math.abs(
      capability.lateralAcceleration -
        (9.81 * Math.tan(passport.maximumBank)) / AIRPLANE_TURN_RESERVE,
    ) < 0.01,
  );
  assert.ok(capability.yawRate > 0);
  assert.ok(capability.yawRate < 0.4);
  assert.ok(capability.braking > 0);
});

test("a dead surface cuts authority; the request itself stays intact", () => {
  const step = cruiseStep(
    { forwardSpeed: 48, lateralSpeed: 0, yawRate: 0.25, liftFraction: 0.2 },
    { ...intact, aileron: 0, engines: [1, 0] },
  );
  assert.ok(Math.abs(step.requested.aileron) > 0.1);
  assert.equal(step.delivered.aileron, 0);
  assert.equal(step.authority.aileron, 0);
  assert.ok(step.authority.throttle < 0.6);
  assert.equal(step.delivered.throttle[1], 0);
});

test("below stall the wing stops carrying its own weight", () => {
  const flying = forcesAt({}, intact, stallSpeedOf(passport, 0) + 8, 0.12);
  const stalled = forcesAt({}, intact, stallSpeedOf(passport, 0) * 0.55, 0.32);
  assert.ok(flying.lift > DC3_STALL_WEIGHT * 0.85);
  assert.ok(stalled.lift < flying.lift * 0.6);
  assert.equal(stalled.stalled, true);
});

// ---------------------------------------------------------------------------
// ОРГАНЫ, КОТОРЫЕ ВИДНО
// ---------------------------------------------------------------------------

const surfaceOf = (match) =>
  islandAirportDc3Frame.controlSurfaces.find((surface) =>
    surface.memberMatch.includes(match),
  );

test("every commanded channel has a drawn surface behind it", () => {
  const channels = new Set(
    islandAirportDc3Frame.controlSurfaces.map((surface) => surface.channel),
  );
  assert.deepEqual([...channels].sort(), ["aileron", "elevator", "flap", "rudder"]);
  // Четыре щитка, два элерона, два руля высоты, один направления.
  assert.equal(islandAirportDc3Frame.controlSurfaces.length, 9);
  assert.equal(islandAirportDc3Frame.propellers.length, 2);
  // Винты сидят на СВОИХ валах и знают, какой мотор их крутит.
  assert.deepEqual(
    islandAirportDc3Frame.propellers.map((propeller) => propeller.engine),
    [0, 1],
  );
});

test("four percent thrust keeps the propellers visibly alive without raising full speed", () => {
  const dc3 = airVehicles.find((vehicle) => vehicle.id === DC3_AIRPLANE_CLASS.id);
  assert.ok(dc3);
  const phaseSpeed = dc3.flight.driveAnimation.phaseSpeed;
  const slowCommand = airplanePropellerVisualCommand(0.04, 0);
  const slowRpm = (phaseSpeed * slowCommand * 60) / (Math.PI * 2);
  const fullRpm =
    (phaseSpeed * airplanePropellerVisualCommand(1, 0) * 60) / (Math.PI * 2);
  assert.ok(slowRpm > 100 && slowRpm < 110, `4% gave ${slowRpm.toFixed(1)} rpm`);
  assert.ok(fullRpm > 320 && fullRpm < 330, `full gave ${fullRpm.toFixed(1)} rpm`);
  assert.equal(airplanePropellerVisualCommand(0, 0), 0);
  assert.equal(airplanePropellerVisualCommand(0, 0.2), 0.2);
  assert.ok(airplanePropellerVisualCommand(-0.04, 0) < 0);
});

test("ailerons work in antiphase, flaps in phase and only downward", () => {
  const rolling = { ...NEUTRAL_COMMAND, aileron: 1 };
  const right = controlSurfaceDegrees(surfaceOf("aileron-right"), rolling);
  const left = controlSurfaceDegrees(surfaceOf("aileron-left"), rolling);
  assert.ok(right > 20 && left < -20, `элероны синфазны: ${right} / ${left}`);
  const dirty = { ...NEUTRAL_COMMAND, flap: 1 };
  const flapRight = controlSurfaceDegrees(surfaceOf("flap-right-inner"), dirty);
  const flapLeft = controlSurfaceDegrees(surfaceOf("flap-left-inner"), dirty);
  assert.equal(flapRight, flapLeft);
  assert.ok(flapRight < -30, "щиток обязан уйти вниз на полный чертёжный ход");
  // Убранный щиток стоит в нуле, а не «примерно там».
  assert.equal(controlSurfaceDegrees(surfaceOf("flap-right-inner"), NEUTRAL_COMMAND), 0);
});

test("the pre-flight check sweeps every channel and ends in takeoff position", () => {
  const seen = { elevator: 0, aileron: 0, rudder: 0, flap: 0 };
  for (let t = 0; t < AIRPLANE_PREFLIGHT_SECONDS; t += 0.05) {
    const command = airplanePreflightCommand(t, 0.5);
    for (const channel of Object.keys(seen)) {
      seen[channel] = Math.max(seen[channel], Math.abs(command[channel]));
    }
  }
  // Каждый канал обязан быть прогнан по ПОЛНОМУ ходу: проверка, которая
  // шевелит створку наполовину, ничего не проверяет.
  for (const [channel, reached] of Object.entries(seen)) {
    assert.ok(reached > 0.95, `${channel} не прогнан целиком: ${reached.toFixed(2)}`);
  }
  const settled = airplanePreflightCommand(AIRPLANE_PREFLIGHT_SECONDS - 0.1, 0.5);
  assert.equal(settled.aileron, 0);
  assert.equal(settled.elevator, 0);
  assert.equal(settled.rudder, 0);
  assert.equal(settled.flap, 0.5, "к вылету щиток стоит во взлётном положении");
});

test("during the check the machine holds the brakes and the throttle shut", () => {
  const command = airplaneAllocate({
    passport,
    guidance: { forwardSpeed: 48, lateralSpeed: 0, yawRate: 0, liftFraction: 0 },
    air: { ...level(0), airspeed: 0, groundSpeed: 0 },
    weight: DC3_STALL_WEIGHT,
    onGround: true,
    // Проверка органов — это стадия `attention` общего журнала рейса, а не
    // отдельный признак автомата.
    journey: "attention",
    journeySeconds: 1.5,
  });
  assert.deepEqual(command.throttle, [0, 0]);
  assert.equal(command.brake, 1);
  // А как только проверка кончилась — руль возвращается наведению.
  const released = airplaneAllocate({
    passport,
    guidance: { forwardSpeed: 48, lateralSpeed: 0, yawRate: 0, liftFraction: 0 },
    air: { ...level(0), airspeed: 0, groundSpeed: 0 },
    weight: DC3_STALL_WEIGHT,
    onGround: true,
    journey: "departure",
    journeySeconds: AIRPLANE_PREFLIGHT_SECONDS,
    heightAboveGround: 0,
  });
  assert.ok(released.throttle[0] > 0);
  assert.equal(released.brake, 0);
});

test("a ground pivot derives both yaw moment and axle-holding thrust", () => {
  const yawInertia = 1_000;
  const yawResponseSeconds = 2.4;
  const requestedYawAcceleration = 0.4 / yawResponseSeconds;
  const mass = DC3_STALL_WEIGHT / 9.81;
  const command = airplaneAllocate({
    passport,
    guidance: {
      forwardSpeed: 0,
      lateralSpeed: 0,
      yawRate: 0.4,
      liftFraction: 0,
      finalPhase: false,
    },
    air: { ...level(0), airspeed: 0, groundSpeed: 0 },
    weight: DC3_STALL_WEIGHT,
    onGround: true,
    journey: "approach",
    heightAboveGround: 0,
    taxi: "taxi",
    taxiPivot: true,
    taxiYawAcceleration: requestedYawAcceleration,
    yawInertia,
    yawResponseSeconds,
  });
  assert.ok(command.throttle[0] > 0 && command.throttle[1] < 0);
  assert.ok(
    Math.abs(command.throttle[0] + command.throttle[1]) <
      1e-6,
    "a pivot beginning from rest should start as a pure couple",
  );
  assert.equal(command.brake, 0, "wheel brakes must not create a second pivot law");
  assert.equal(command.brakeSplit ?? 0, 0);
  assert.equal(command.casterFree, true);
  assert.notEqual(command.steer ?? 0, 0, "tail caster must follow the pivot");

  const leftForce = command.throttle[0] * passport.enginePower;
  const rightForce =
    command.throttle[1] * passport.enginePower;
  const deliveredMoment =
    -passport.engineStations[0].right * leftForce -
    passport.engineStations[1].right * rightForce;
  const axleAhead = passport.mainAxleAheadOfCentre ?? 0;
  const axleYawInertia = yawInertia + mass * axleAhead ** 2;
  const mainNormalShare = (passport.wheelbase - axleAhead) / passport.wheelbase;
  const rollingYawResistance =
    (passport.mainWheelRollingResistance ?? 0) *
    DC3_STALL_WEIGHT *
    mainNormalShare *
    (passport.mainWheelHalfTrack ?? 0);
  assert.ok(
    Math.abs(
      deliveredMoment -
        (axleYawInertia * requestedYawAcceleration + rollingYawResistance),
    ) < 1e-6,
    "the propeller couple did not include the measured axle offset",
  );

  const nearlyAtRate = airplaneAllocate({
    passport,
    guidance: {
      forwardSpeed: 0,
      lateralSpeed: 0,
      yawRate: 0.4,
      liftFraction: 0,
      finalPhase: false,
    },
    air: { ...level(0), airspeed: 0, groundSpeed: 0, yawRate: 0.35 },
    weight: DC3_STALL_WEIGHT,
    onGround: true,
    journey: "approach",
    heightAboveGround: 0,
    taxi: "taxi",
    taxiPivot: true,
    taxiYawAcceleration: 0,
    yawInertia,
    yawResponseSeconds,
  });
  assert.ok(
    Math.abs(nearlyAtRate.throttle[0]) < Math.abs(command.throttle[0]),
    "the automatic did not reduce the couple as measured yaw rate converged",
  );

  const steady = airplaneAllocate({
    passport,
    guidance: {
      forwardSpeed: 0,
      lateralSpeed: 0,
      yawRate: 0.4,
      liftFraction: 0,
      finalPhase: false,
    },
    air: { ...level(0), yawRate: 0.4, forwardSpeed: 0 },
    weight: DC3_STALL_WEIGHT,
    onGround: true,
    journey: "approach",
    heightAboveGround: 0,
    taxi: "taxi",
    taxiPivot: true,
    taxiYawAcceleration: 0,
    yawInertia,
    yawResponseSeconds,
  });
  const steadyForce =
    (steady.throttle[0] + steady.throttle[1]) * passport.enginePower;
  assert.ok(
    Math.abs(steadyForce - mass * axleAhead * 0.4 ** 2) < 1e-6,
    "the propellers did not supply the centre's derived centripetal force",
  );
  assert.ok(
    Math.abs(
      (-passport.engineStations[0].right * steady.throttle[0] -
        passport.engineStations[1].right * steady.throttle[1]) *
        passport.enginePower -
        rollingYawResistance,
    ) < 1e-6,
    "steady pivot did not compensate the calculated wheel resistance",
  );
});

test("taxi speed reduction is executed with symmetric reverse before pivot", () => {
  const command = airplaneAllocate({
    passport,
    guidance: {
      forwardSpeed: 0,
      lateralSpeed: 0,
      yawRate: 0,
      liftFraction: 0,
      finalPhase: false,
    },
    air: { ...level(4.5), airspeed: 4.5, groundSpeed: 4.5 },
    weight: DC3_STALL_WEIGHT,
    onGround: true,
    journey: "approach",
    heightAboveGround: 0,
    taxi: "taxi",
    taxiPivot: false,
    taxiAcceleration:
      -(2 * passport.enginePower) /
      (DC3_STALL_WEIGHT / 9.81),
  });
  assert.ok(command.throttle[0] < -0.9 && command.throttle[1] < -0.9);
  assert.equal(command.throttle[0], command.throttle[1]);
  assert.equal(command.brake, 0, "the speed profile must have only one braking law");
  assert.equal(command.brakeSplit ?? 0, 0);
  assert.equal(command.steer ?? 0, 0);
});
