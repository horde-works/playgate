import { massProperties, stepBody } from "../games/make-a-mess/src/game/clusterDynamics.ts";
import { structuralMaterialProfiles } from "../games/make-a-mess/src/game/destructionScene.ts";
import {
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

/**
 * СТЕНД ВИНТОКРЫЛОЙ МАШИНЫ: настоящая машина на настоящих силах.
 *
 * Здесь нет ни одной подставленной величины. Масса, центр масс и инерции сняты
 * со скомпилированной сцены; силы считает `rotorcraftFlightStep` — тот самый,
 * который зовёт рантайм; движение — `stepBody`; тяга кольца проходит через
 * актуатор, обратную связь и инерцию мотора. Нет только Rapier: столкновений
 * стенд не разрешает, и это единственная его граница.
 *
 * Обвязка вынесена сюда из боевого стенда потому, что к бою она отношения не
 * имеет: машина, летящая по маршруту, машина, дерущаяся, и машина, крутящая
 * петлю, — это одна и та же машина. Разойтись их стендам было бы нельзя.
 */

export const dt = 1 / 60;
export const GRAVITY = 9.81;

const density = (material) => structuralMaterialProfiles[material].density;

export function boundingRadius(pieces, centre) {
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

export function createMachine({
  pieces,
  vehicle,
  startPoint,
  startVelocity,
  startNose,
}) {
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

export function centreOf(m) {
  return m.mass.centre.map((value, index) => value + m.state.position[index]);
}

/** Точка авторской позы → мировая точка живой машины. */
export function toWorld(m, local) {
  const centre = centreOf(m);
  const offset = rotateVector(m.state.orientation, [
    local[0] - m.mass.centre[0],
    local[1] - m.mass.centre[1],
    local[2] - m.mass.centre[2],
  ]);
  return [centre[0] + offset[0], centre[1] + offset[1], centre[2] + offset[2]];
}

export function forwardAxis(m) {
  return rotateVector(m.state.orientation, m.vehicle.nose);
}

/**
 * Один физический шаг машины по уже посчитанному требованию наведения.
 *
 * `guidance.attitude` необязателен и проходит насквозь: стенд не решает, кто
 * задал позу — фигура, боевой пилот или никто, — он только не теряет её по
 * дороге.
 */
export function stepMachine(m, guidance) {
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
      attitude: guidance.attitude ?? null,
      attitudeRate: guidance.attitudeRate ?? null,
    },
    m.trim,
    dt,
    0.9,
  );
  m.trim = rotor.trim;
  m.yawRateLimits = rotor.result.yawRateLimits;
  m.lastResult = rotor.result;
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
    ...updatePropulsionFeedback(
      m.fanHealth,
      actuation,
      m.fanOutput.length,
      "yaw-throttle:",
    ),
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
  return rotor;
}
