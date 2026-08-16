import {
  pointEffectiveMass,
  stepBody,
} from "../games/make-a-mess/src/game/clusterDynamics.ts";
import {
  hullDrag,
  rotateVector,
  vehicleRotation,
} from "../games/make-a-mess/src/game/vehicleFrames.ts";
import {
  advanceAirplaneTaxi,
  airplaneAirState,
  airplaneFlightStep,
  airplaneTurnCapability,
  CLIMB_RESPONSE_SECONDS,
  INTACT_AIRPLANE_AVAILABILITY,
} from "../games/make-a-mess/src/game/airplaneDynamics.ts";
import {
  buildSupportStruts,
  strutClosingSpeed,
  strutReaction,
  smoothStrutGround,
  strutWheelFriction,
  wheelRollAxis,
} from "../games/make-a-mess/src/game/supportStrut.ts";
import {
  compileCommandActuators,
  executeCommandActuators,
} from "../games/make-a-mess/src/game/vehicleActuation.ts";
import {
  createDc3LandingGear,
  DC3_STAND_PLACEMENT,
  dc3AirplaneStandMass,
  dc3AirplaneStandPieces,
  dc3AirplaneStandVehicle,
} from "../games/make-a-mess/src/game/dc3Airplane.ts";

/**
 * СТЕНД КРЫЛАТОЙ МАШИНЫ: настоящие куски, настоящий автомат, без Rapier.
 *
 * Масса — тождество сваливания, центр и инерция сняты с Object Lab. Силы
 * считает `airplaneFlightStep`, опору — `supportStrut` по плоскости y = 0:
 * взлёт и посадка обязаны проверяться теми же законами, что и полёт, иначе
 * стенд меряет полмашины. Нет мира и нет реестра сцен.
 */

export const dt = 1 / 60;
export const GRAVITY = 9.81;

const UP = [0, 1, 0];

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export function createAirplane({
  pieces = dc3AirplaneStandPieces,
  vehicle = dc3AirplaneStandVehicle,
  gearDefinitions,
  startPoint,
  startVelocity,
  startNose,
  startPitch = 0,
  onGround = false,
} = {}) {
  const mass = dc3AirplaneStandMass(pieces);
  const actuators = compileCommandActuators(pieces);
  const yaw = startNose
    ? Math.atan2(startNose[0], startNose[2]) -
      Math.atan2(vehicle.nose[0], vehicle.nose[2])
    : 0;
  const gear = gearDefinitions ?? createDc3LandingGear(DC3_STAND_PLACEMENT);
  const struts = buildSupportStruts(
    gear.map((definition) => definition.plan),
    mass.mass * GRAVITY,
    mass.centre,
  );
  return {
    vehicle,
    pieces,
    mass,
    actuators,
    gear,
    struts,
    attached: new Set(pieces.map((piece) => piece.id)),
    state: {
      position: [
        startPoint[0] - mass.centre[0],
        startPoint[1] - mass.centre[1],
        startPoint[2] - mass.centre[2],
      ],
      velocity: [...startVelocity],
      angularVelocity: [0, 0, 0],
      orientation: vehicleRotation(
        { position: [0, 0, 0], yaw, pitch: startPitch, roll: 0 },
        vehicle.nose,
      ),
    },
    onGround,
    supportContacts: 0,
    // Короткий отскок стойки — не полёт: тот же порог, что и в рантайме.
    // На земле машина или в воздухе, стенд знает по тому, КУДА ЕЁ ПОСТАВИЛИ:
    // просвет под колёсами меньше метра — она стоит. Ноль по умолчанию
    // означал бы «стою» для машины, созданной на высоте, и запрещал бы ей
    // крен; бесконечность — «лечу» для машины на полосе, и та получала кадр
    // взлётного газа ещё до первого касания луча.
    airborneSeconds:
      onGround || startPoint[1] - mass.centre[1] < 1
        ? 0
        : Number.POSITIVE_INFINITY,
    wheelSpin: new Map(),
    lastStep: null,
    lastStruts: [],
  };
}

export function centreOf(machine) {
  return machine.mass.centre.map(
    (value, index) => value + machine.state.position[index],
  );
}

export function forwardAxis(machine) {
  return rotateVector(machine.state.orientation, machine.vehicle.nose);
}

export function airStateOf(machine) {
  return airplaneAirState({
    velocity: machine.state.velocity,
    angularVelocity: machine.state.angularVelocity,
    orientation: machine.state.orientation,
    nose: machine.vehicle.nose,
  });
}

function availabilityOf(machine) {
  const actuation = executeCommandActuators(machine.actuators, machine.attached, {
    "throttle:0": 1,
    "throttle:1": 1,
    aileron: 1,
    elevator: 1,
    rudder: 1,
    flap: 1,
  });
  const fraction = (channel) => {
    const matching = actuation.filter((entry) => entry.commandChannel === channel);
    if (matching.length === 0) return 1;
    return (
      matching.reduce((sum, entry) => sum + entry.attachedFraction, 0) /
      matching.length
    );
  };
  return {
    engines: [fraction("throttle:0"), fraction("throttle:1")],
    aileron: fraction("aileron"),
    elevator: fraction("elevator"),
    rudder: fraction("rudder"),
    flap: fraction("flap"),
    wingPanels: INTACT_AIRPLANE_AVAILABILITY.wingPanels,
  };
}

/**
 * Опора на плоскости y = 0. Луч бросает вызывающий — в рантайме это rapier,
 * здесь плоскость; закон стойки от этого не меняется ни на строку.
 */
export function airplaneGroundForces(machine, centre, command, step) {
  const forces = [];
  const reactions = [];
  const wheelDiagnostics = [];
  let contacts = 0;
  const mainWheelCount = machine.gear.filter(
    (entry) =>
      entry.wheel &&
      (entry.wheel.side ?? Math.sign(entry.plan.mount[0])) !== 0,
  ).length;
  machine.struts.forEach((strut, index) => {
    const definition = machine.gear[index];
    const mountLocal = [
      strut.mount[0] - machine.mass.centre[0],
      strut.mount[1] - machine.mass.centre[1],
      strut.mount[2] - machine.mass.centre[2],
    ];
    const mountArm = rotateVector(machine.state.orientation, mountLocal);
    const mountWorld = [
      centre[0] + mountArm[0],
      centre[1] + mountArm[1],
      centre[2] + mountArm[2],
    ];
    const axisWorld = rotateVector(machine.state.orientation, strut.axis);
    // Стенд опирается на плоскость y=0 — ступеней тут нет, но зеркало закона
    // сохраняется: сглаживается высота земли (у плоскости она константна).
    const distance = axisWorld[1] < -1e-6 ? mountWorld[1] / -axisWorld[1] : Infinity;
    const probe =
      distance < strut.extendedReach ? { distance, normal: [0, 1, 0] } : null;
    const mountVelocity = velocityAt(machine, mountArm);
    const reaction = strutReaction(
      strut,
      probe,
      probe ? strutClosingSpeed(mountVelocity, axisWorld, probe.normal) : 0,
      step,
      1,
    );
    reactions.push(reaction);
    if (!probe || reaction.load <= 0) return;
    contacts += 1;
    const foot = [
      mountWorld[0] + axisWorld[0] * probe.distance,
      mountWorld[1] + axisWorld[1] * probe.distance,
      mountWorld[2] + axisWorld[2] * probe.distance,
    ];
    forces.push({ force: [0, reaction.load, 0], point: foot });
    const footVelocity = velocityAt(machine, [
      foot[0] - centre[0],
      foot[1] - centre[1],
      foot[2] - centre[2],
    ]);
    const slip = [footVelocity[0], 0, footVelocity[2]];
    const wheel = definition.wheel;
    // РУЛЕВОЕ КОЛЕСО — ТОТ ЖЕ ЗАКОН, ЧТО И В МИРЕ. Своя копия оси качения
    // здесь была немой ошибкой: она не поворачивалась рулём, и стенд мерил
    // машину, у которой на пробеге нет поперечного управления вовсе.
    const rollAxis = wheelRollAxis(
      machine.state.orientation,
      wheel,
      probe.normal,
      command.steer ?? 0,
    );
    // Раздельное торможение бортов — как в рантайме: знак борта от
    // авторского поперечного положения узла стойки.
    const brakeSide = wheel.side ?? Math.sign(strut.mount[0]);
    const splitShare = Math.max(
      0,
      Math.min(1, 1 - Math.max(0, -(command.brakeSplit ?? 0) * brakeSide)),
    );
    // Хвостовая опора расцепляется в кастор: угол за ходом рулёжки — колесо
    // свободно флюгирует за скольжением (см. рантайм).
    let effectiveRollAxis = rollAxis;
    const slipFlat = Math.hypot(slip[0], slip[2]);
    if ((wheel.side ?? Math.sign(strut.mount[0])) === 0 && slipFlat > 0.05) {
      const slipDir = [slip[0] / slipFlat, 0, slip[2] / slipFlat];
      const align = slipDir[0] * rollAxis[0] + slipDir[2] * rollAxis[2];
      if (Math.abs(align) < Math.cos(0.6)) {
        effectiveRollAxis = slipDir;
      }
    }
    // Расцепленный кастор на нулевом ходу не сопротивляется развороту.
    const tailFree =
      Boolean(command.casterFree) &&
      (wheel.side ?? Math.sign(strut.mount[0])) === 0;
    const mainPivotWheel =
      Boolean(command.casterFree) &&
      (wheel.side ?? Math.sign(strut.mount[0])) !== 0;
    const lateralAxis = [
      probe.normal[1] * effectiveRollAxis[2] -
        probe.normal[2] * effectiveRollAxis[1],
      probe.normal[2] * effectiveRollAxis[0] -
        probe.normal[0] * effectiveRollAxis[2],
      probe.normal[0] * effectiveRollAxis[1] -
        probe.normal[1] * effectiveRollAxis[0],
    ];
    const isAnchor =
      Math.abs(command.brakeSplit ?? 0) > 0.5 &&
      brakeSide !== 0 &&
      brakeSide === Math.sign(command.brakeSplit ?? 0);
    const friction = tailFree
      ? [0, 0, 0]
      : strutWheelFriction(
          strut,
          reaction.load,
          slip,
          {
            rollAxis: effectiveRollAxis,
            brake: wheel.brakeShare * command.brake * splitShare,
            rollingResistance: wheel.rollingResistance,
            lateralStiffness: mainPivotWheel
              ? pointEffectiveMass(
                  machine.mass,
                  machine.state.orientation,
                  [
                    foot[0] - centre[0],
                    foot[1] - centre[1],
                    foot[2] - centre[2],
                  ],
                  lateralAxis,
                ) / Math.max(step * mainWheelCount, 1e-6)
              : undefined,
            anchorStiff: isAnchor,
          },
        );
    wheelDiagnostics.push({
      id: strut.id,
      side: wheel.side ?? Math.sign(strut.mount[0]),
      load: reaction.load,
      foot,
      slip,
      rollAxis: effectiveRollAxis,
      friction,
      brake: wheel.brakeShare * command.brake * splitShare,
    });
    forces.push({ force: friction, point: foot });
    const rollSpeed =
      slip[0] * rollAxis[0] + slip[1] * rollAxis[1] + slip[2] * rollAxis[2];
    machine.wheelSpin.set(
      strut.id,
      (machine.wheelSpin.get(strut.id) ?? 0) + (rollSpeed / wheel.radius) * step,
    );
  });
  return { forces, contacts, reactions, wheelDiagnostics };
}

function velocityAt(machine, arm) {
  const omega = machine.state.angularVelocity;
  return [
    machine.state.velocity[0] + omega[1] * arm[2] - omega[2] * arm[1],
    machine.state.velocity[1] + omega[2] * arm[0] - omega[0] * arm[2],
    machine.state.velocity[2] + omega[0] * arm[1] - omega[1] * arm[0],
  ];
}

/**
 * Стадия рейса приходит из общего журнала — стенд просто передаёт её дальше,
 * как это делает рантайм. Без неё машина считается идущей по маршруту.
 */
export function stepAirplane(machine, guidance, journey = "cruise", journeySeconds = 0, taxiPivot = false, taxiAcceleration = undefined, taxiYawAcceleration = undefined) {
  const centre = centreOf(machine);
  const availability = availabilityOf(machine);
  // Наземное завершение рейса — те же три строки, что в рантайме.
  const groundSpeed = Math.hypot(machine.state.velocity[0], machine.state.velocity[2]);
  machine.taxi = advanceAirplaneTaxi(machine.taxi ?? null, {
    // Same owner as runtime: the route phase, not a second progress/finalFrom
    // comparison assembled by the stand.
    journey,
    onGround: machine.airborneSeconds < 0.4,
    groundSpeed,
  });
  const step = airplaneFlightStep({
    passport: machine.vehicle.flight.airplane,
    guidance,
    availability,
    mass: machine.mass.mass,
    orientation: machine.state.orientation,
    velocity: machine.state.velocity,
    angularVelocity: machine.state.angularVelocity,
    centre,
    nose: machine.vehicle.nose,
    onGround: machine.airborneSeconds < 0.4,
    journey,
    journeySeconds,
    // Опора стенда — плоскость y = 0, поэтому высота над ней это просто
    // просвет под колёсами.
    heightAboveGround: Math.max(0, centre[1] - machine.mass.centre[1]),
    taxi: machine.taxi?.phase ?? null,
    taxiPivot,
    taxiAcceleration,
    taxiYawAcceleration,
    yawInertia: machine.mass.inertia[4],
    yawResponseSeconds: machine.vehicle.flight.spoolSeconds,
    yawDamping: machine.vehicle.flight.angularDamping,
  });
  executeCommandActuators(machine.actuators, machine.attached, {
    "throttle:0": step.requested.throttle[0],
    "throttle:1": step.requested.throttle[1],
    aileron: step.requested.aileron,
    elevator: step.requested.elevator,
    rudder: step.requested.rudder,
    flap: step.requested.flap,
  });
  machine.lastStep = step;
  const ground = airplaneGroundForces(machine, centre, step.delivered, dt);
  machine.supportContacts = ground.contacts;
  machine.airborneSeconds = ground.contacts > 0 ? 0 : machine.airborneSeconds + dt;
  machine.onGround = machine.airborneSeconds < 0.4;
  machine.lastStruts = ground.reactions;
  machine.lastGroundWheels = ground.wheelDiagnostics;
  const facing = forwardAxis(machine);
  const flat = Math.hypot(facing[0], facing[2]) || 1;
  const model = {
    mass: machine.mass.mass,
    inertiaYaw: machine.mass.inertia[4],
    bodyCentre: machine.mass.centre,
    dragLinear: machine.mass.mass * machine.vehicle.flight.linearDamping,
    dragLateral:
      machine.mass.mass *
      machine.vehicle.flight.linearDamping *
      machine.vehicle.flight.lateralDragRatio,
    dragAngular: machine.mass.inertia[4] * machine.vehicle.flight.angularDamping,
    limits: machine.vehicle.flight.limits,
    turnPersists: true,
    verticalResponseSeconds: CLIMB_RESPONSE_SECONDS,
    turnCapability: airplaneTurnCapability(
      machine.vehicle.flight.airplane,
      step.airspeed,
      machine.mass.mass,
      machine.airborneSeconds < 0.4,
    ),
  };
  const stepped = stepBody(
    { ...machine.state, position: centre },
    machine.mass,
    [
      { force: [0, -machine.mass.mass * GRAVITY, 0], point: centre },
      ...step.forces,
      ...ground.forces,
      {
        force: hullDrag(machine.state.velocity, [facing[0] / flat, facing[2] / flat], model),
        point: centre,
      },
    ],
    { linear: 0, angular: machine.mass.inertia[4] * machine.vehicle.flight.angularDamping },
    dt,
  );
  machine.state = {
    ...stepped,
    position: stepped.position.map((value, index) => value - machine.mass.centre[index]),
  };
  return step;
}
