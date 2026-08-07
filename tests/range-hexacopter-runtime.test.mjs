import assert from "node:assert/strict";
import test from "node:test";
import { combatHexacopterRangeScene } from "../games/make-a-mess/src/game/combatHexacopterRangeScene.ts";
import { massProperties, stepBody } from "../games/make-a-mess/src/game/clusterDynamics.ts";
import { structuralMaterialProfiles } from "../games/make-a-mess/src/game/destructionScene.ts";
import { TOWN_HEXACOPTER_AIR_VEHICLE } from "../games/make-a-mess/src/game/airVehicles.ts";
import {
  autopilot,
  hullDrag,
  rotateVector,
  advanceVehicleRouteProgress,
  vehicleRotation,
} from "../games/make-a-mess/src/game/vehicleFrames.ts";
import {
  advanceRotorMotorOutput,
  NEUTRAL_ROTORCRAFT_TRIM,
  rotorcraftFlightStep,
} from "../games/make-a-mess/src/game/rotorcraftDynamics.ts";
import {
  advanceRotorcraftGovernor,
  measuredSlipAngle,
  DEFAULT_SLIP_POLICY,
  NEUTRAL_GOVERNOR,
} from "../games/make-a-mess/src/game/rotorcraftSpeedGovernor.ts";
import {
  compileCommandActuators,
  deliveredCommandValue,
  executeCommandActuators,
} from "../games/make-a-mess/src/game/vehicleActuation.ts";
import { updatePropulsionFeedback } from "../games/make-a-mess/src/game/vehiclePropulsionAutomation.ts";

/**
 * ЧЕСТНЫЙ РАНТАЙМ-СТЕНД HX-6 НА РОЗЕТКЕ ПОЛИГОНА.
 *
 * Летает ровно той цепью, что игра: автопилот получает turnCapability и
 * ЖИВУЮ полосу yawRateLimits из аллокатора, реактивный губернатор заноса
 * режет скорость по замеренному носу, команды идут через актуаторы и
 * инерцию моторов, тело — через stepBody. Прежний стенд (town-hexacopter)
 * летит без turnCapability — губернатор для него мёртв, и деградацию
 * губернатора он не видел никогда: «HX-6 ползёт» жил только в игре.
 *
 * Пороги ЗАМЕРЕНЫ на вылеченном губернаторе (полуширина полосы, потолок π
 * на угол дуги, маршрутная свобода заноса векторируемой машины):
 * круг 135 с, средняя по розетке 4.6 м/с, вынос 17.5 м на входе в первый
 * лепесток. До лечения: 215 с, средняя 2.3, полоса читалась 0.012–0.096
 * вместо честных ~0.14 — машина ползла на ω·r. Ослабление порога — это
 * возвращение той болезни, а не «шумный тест».
 */

const vehicle = TOWN_HEXACOPTER_AIR_VEHICLE;
const flight = vehicle.flight;
const densityOf = (material) => structuralMaterialProfiles[material].density;
const ship = combatHexacopterRangeScene.breakablePieces.filter(
  (piece) => piece.clusterId === vehicle.clusterId,
);
const mass = massProperties(ship, densityOf);
const actuators = compileCommandActuators(
  flight.limits.commandActuators ?? [],
  ship,
);
const attached = new Set(ship.map((piece) => piece.id));

test("HX-6 проходит розетку рантаймной цепью: живая полоса, губернатор, посадка", () => {
  const plan = flight.routePlan("circuit", mass.centre);
  const dt = 1 / 60;
  const lateral = 9.81 * Math.tan(flight.maximumTilt);
  const baseModel = {
    mass: mass.mass,
    inertiaYaw: mass.inertia[4],
    bodyCentre: mass.centre,
    dragLinear: mass.mass * flight.linearDamping,
    dragLateral: mass.mass * flight.linearDamping * flight.lateralDragRatio,
    dragAngular: mass.inertia[4] * flight.angularDamping,
    limits: flight.limits,
    // Как в рантайме (VehicleFrameSystem, autopilotModel): паспортная
    // поворотливость, живой аллокатор поверх.
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
    liftCapacity: mass.mass * 9.81 * flight.liftReserve,
    capacityWeights: flight.limits.rotorCapacityWeights,
    spinDirections: flight.limits.rotorSpinDirections,
    maximumTilt: flight.maximumTilt,
  };
  let state = {
    position: [0, 0, 0],
    velocity: [0, 0, 0],
    angularVelocity: [0, 0, 0],
    orientation: vehicleRotation(
      { position: [0, 0, 0], yaw: 0, pitch: 0, roll: 0 },
      vehicle.nose,
    ),
  };
  let progress = 0;
  let trim = NEUTRAL_ROTORCRAFT_TRIM;
  let feedback = flight.limits.enginePoints.map(() => 1);
  let motorOutput = flight.limits.enginePoints.map(() => 1 / flight.liftReserve);
  let yawRateLimits = null;
  let governor = NEUTRAL_GOVERNOR;
  let flightTime = flight.spoolSeconds;
  let seconds = 0;
  // Розетка занимает середину маршрута; края (взлёт, финал) — свои законы.
  const roseStart = 0.16;
  const roseEnd = 0.72;
  let worstCrossTrack = 0;
  let roseSpeedSum = 0;
  let roseSamples = 0;
  let minHalfWidth = Infinity;
  let docked = false;

  for (let step = 0; step < 60 * 210 && !docked; step += 1) {
    const centre = mass.centre.map((value, index) => value + state.position[index]);
    const piloted = autopilot(
      plan,
      progress,
      centre,
      state.orientation,
      state.velocity,
      state.angularVelocity,
      {
        ...baseModel,
        engineAvailability: feedback,
        ...(yawRateLimits ? { yawRateLimits } : {}),
        governorScale: governor.scale,
      },
      Math.max(0, Math.min(1, (flightTime - flight.underwaySeconds) / 8)),
      vehicle.nose,
      flight.approach,
    );
    const rotor = rotorcraftFlightStep(
      { ...machine, availability: feedback, motorOutput },
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
    trim = rotor.trim;
    yawRateLimits = rotor.result.yawRateLimits;
    if (yawRateLimits) {
      minHalfWidth = Math.min(
        minHalfWidth,
        (yawRateLimits.maximum - yawRateLimits.minimum) / 2,
      );
    }
    governor = advanceRotorcraftGovernor(
      governor,
      measuredSlipAngle(rotor.forwardSpeed ?? 0, rotor.lateralSpeed ?? 0),
      piloted.guidance.slipAllowance ??
        (piloted.guidance.approachPhase
          ? DEFAULT_SLIP_POLICY.onApproach
          : DEFAULT_SLIP_POLICY.enRoute),
      dt,
    );
    const actuation = executeCommandActuators(
      actuators,
      attached,
      Object.fromEntries(
        rotor.result.commandedThrottle.map((value, index) => [
          `throttle:${index}`,
          value,
        ]),
      ),
    );
    motorOutput = motorOutput.map((value, index) =>
      advanceRotorMotorOutput(
        value,
        deliveredCommandValue(
          actuation,
          `throttle:${index}`,
          rotor.result.commandedThrottle[index],
        ),
        dt,
        flight.spoolSeconds,
      ),
    );
    feedback = updatePropulsionFeedback(feedback, actuation, motorOutput.length);
    const facing = rotateVector(state.orientation, vehicle.nose);
    const flat = Math.hypot(facing[0], facing[2]) || 1;
    const stepped = stepBody(
      { ...state, position: centre },
      mass,
      [
        { force: [0, -mass.mass * 9.81, 0], point: centre },
        ...rotor.forces,
        {
          force: hullDrag(
            state.velocity,
            [facing[0] / flat, facing[2] / flat],
            baseModel,
          ),
          point: centre,
        },
      ],
      { linear: 0, angular: mass.inertia[4] * flight.angularDamping },
      dt,
    );
    state = {
      ...stepped,
      position: stepped.position.map((value, index) => value - mass.centre[index]),
    };
    flightTime += dt;
    seconds += dt;
    if (flightTime >= flight.underwaySeconds) {
      progress = advanceVehicleRouteProgress(
        plan,
        progress,
        centre,
        Math.hypot(state.velocity[0], state.velocity[2]) * dt,
      );
    }
    const speed = Math.hypot(state.velocity[0], state.velocity[2]);
    if (progress > roseStart && progress < roseEnd) {
      const target = plan.point(progress);
      worstCrossTrack = Math.max(
        worstCrossTrack,
        Math.hypot(centre[0] - target[0], centre[2] - target[2]),
      );
      roseSpeedSum += speed;
      roseSamples += 1;
    }
    docked =
      progress > 0.995 && speed < 0.35 && Math.abs(state.position[1]) < 1.2;
  }

  const meanRoseSpeed = roseSpeedSum / Math.max(1, roseSamples);
  assert.equal(docked, true, `не села: progress ${progress.toFixed(3)} за ${seconds.toFixed(0)} с`);
  // Замер 135 с; запас на дрожание интегратора и будущие правки контура.
  assert.equal(
    seconds < 175,
    true,
    `круг занял ${seconds.toFixed(0)} с — губернатор снова душит`,
  );
  // Замер 4.6 м/с; до лечения — 2.3: порог посередине не бывает «шумом».
  assert.equal(
    meanRoseSpeed > 3.6,
    true,
    `средняя по розетке ${meanRoseSpeed.toFixed(2)} м/с — ползучий шаг вернулся`,
  );
  // Полоса аллокатора живая и не схлопывается: полуширина — устойчивая
  // способность (~0.14 у HX-6 в полёте). Прежнее чтение видело 0.012.
  assert.equal(
    minHalfWidth > 0.1,
    true,
    `полоса рыскания схлопнулась до ${minHalfWidth.toFixed(3)}`,
  );
  // Вынос на входе в первый лепесток — замер 17.5 м; это открытая рана
  // трекинга на скорости, порог держит её от расползания. Уменьшение —
  // прогресс, двигать вниз можно без вопросов.
  assert.equal(
    worstCrossTrack < 24,
    true,
    `вынос с трассы ${worstCrossTrack.toFixed(1)} м`,
  );
});
