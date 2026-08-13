import { stepBody } from "../games/make-a-mess/src/game/clusterDynamics.ts";
import {
  hullDrag,
  rotateVector,
  vehicleRotation,
} from "../games/make-a-mess/src/game/vehicleFrames.ts";
import {
  airplaneFlightStep,
  airplaneTurnCapability,
  INTACT_AIRPLANE_AVAILABILITY,
} from "../games/make-a-mess/src/game/airplaneDynamics.ts";
import {
  compileCommandActuators,
  executeCommandActuators,
} from "../games/make-a-mess/src/game/vehicleActuation.ts";
import {
  dc3AirplaneStandMass,
  dc3AirplaneStandPieces,
  dc3AirplaneStandVehicle,
} from "../games/make-a-mess/src/game/dc3Airplane.ts";

/**
 * СТЕНД КРЫЛАТОЙ МАШИНЫ: настоящие куски, настоящий автомат, без Rapier.
 *
 * Масса — тождество сваливания, центр и инерция сняты с Object Lab.
 * Силы считает `airplaneFlightStep`. Нет мира и нет реестра сцен.
 */

export const dt = 1 / 60;
export const GRAVITY = 9.81;

export function createAirplane({
  pieces = dc3AirplaneStandPieces,
  vehicle = dc3AirplaneStandVehicle,
  startPoint,
  startVelocity,
  startNose,
} = {}) {
  const mass = dc3AirplaneStandMass(pieces);
  const actuators = compileCommandActuators(pieces);
  const yaw = startNose
    ? Math.atan2(startNose[0], startNose[2]) -
      Math.atan2(vehicle.nose[0], vehicle.nose[2])
    : 0;
  return {
    vehicle,
    pieces,
    mass,
    actuators,
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
        { position: [0, 0, 0], yaw, pitch: 0, roll: 0 },
        vehicle.nose,
      ),
    },
    lastStep: null,
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

export function stepAirplane(machine, guidance) {
  const centre = centreOf(machine);
  const availability = availabilityOf(machine);
  const step = airplaneFlightStep({
    passport: machine.vehicle.flight.airplane,
    guidance,
    availability,
    mass: machine.mass.mass,
    orientation: machine.state.orientation,
    velocity: machine.state.velocity,
    centre,
    nose: machine.vehicle.nose,
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
    turnCapability: airplaneTurnCapability(
      machine.vehicle.flight.airplane,
      step.airspeed,
      machine.mass.mass,
    ),
  };
  const stepped = stepBody(
    { ...machine.state, position: centre },
    machine.mass,
    [
      { force: [0, -machine.mass.mass * GRAVITY, 0], point: centre },
      ...step.forces,
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
