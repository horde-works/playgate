import {
  COMBAT_HEX_HEIGHT,
  COMBAT_HEX_LENGTH,
  COMBAT_HEX_LIFT_STATIONS,
  COMBAT_HEX_WIDTH,
  COMBAT_HEX_YAW_STATIONS,
} from "../content/objects/vehicles/combatHexacopterObject.ts";
import type { SceneVector3 } from "./destructionScene.ts";

export const COMBAT_HEXACOPTER_BLUEPRINT_ID = "combat-hexacopter";

export interface CombatHexacopterPlacement {
  readonly sceneId: string;
  readonly clusterId: string;
  readonly position: SceneVector3;
  readonly yaw: number;
}

export interface CombatHexacopterYawThruster {
  readonly id: "left" | "right";
  readonly point: SceneVector3;
  /** Reversible thrust axis in the authored body frame. */
  readonly axis: SceneVector3;
  readonly maximumForce: number;
}

export interface CombatHexacopterBlueprint {
  readonly id: typeof COMBAT_HEXACOPTER_BLUEPRINT_ID;
  readonly telemetryLabel: "COMBAT HEX 01";
  readonly placement: CombatHexacopterPlacement;
  readonly origin: SceneVector3;
  readonly nose: SceneVector3;
  readonly liftCentre: SceneVector3;
  readonly mooringPoint: SceneVector3;
  readonly enginePoints: readonly SceneVector3[];
  readonly rotorCapacityWeights: readonly number[];
  readonly rotorSpinDirections: readonly (-1 | 1)[];
  readonly yawThrusters: readonly CombatHexacopterYawThruster[];
  readonly proximitySensors: readonly {
    readonly point: SceneVector3;
    readonly normal: SceneVector3;
  }[];
  readonly envelope: {
    readonly length: number;
    readonly width: number;
    readonly height: number;
  };
  readonly flight: {
    readonly liftSource: "rotor";
    readonly liftReserve: number;
    readonly maximumTilt: number;
    readonly liftTrimRange: number;
    readonly spoolSeconds: number;
    readonly linearDamping: number;
    readonly angularDamping: number;
    readonly lateralDragRatio: number;
  };
}

export const COMBAT_HEXACOPTER_PROTOTYPE_PLACEMENT: CombatHexacopterPlacement = {
  sceneId: "combat-hexacopter-prototype",
  clusterId: "combat-hexacopter-prototype:vehicle",
  // This is an isolated authoring datum, not a world-map berth.
  position: [0, 0, 0],
  yaw: 0,
};

const liftTipRadius = (station: typeof COMBAT_HEX_LIFT_STATIONS[number]) =>
  station.outerRadius - 0.105;
const standardDiscArea = liftTipRadius(COMBAT_HEX_LIFT_STATIONS[0]) ** 2;

export const COMBAT_HEXACOPTER_ROTOR_CAPACITY_WEIGHTS =
  COMBAT_HEX_LIFT_STATIONS.map((station) =>
    liftTipRadius(station) ** 2 / standardDiscArea,
  );

export const COMBAT_HEXACOPTER_ROTOR_SPIN_DIRECTIONS =
  COMBAT_HEX_LIFT_STATIONS.map((station) =>
    station.spin === "cw" ? 1 as const : -1 as const,
  );

/**
 * The accepted yaw tunnels are real reversible fans, not an aerodynamic
 * rudder. Their authority therefore exists at zero airspeed. The selected
 * force keeps the channel clearly stronger than reaction torque while still
 * leaving the lift controller responsible for cancelling the small coupled
 * side force caused by the mirrored 18-degree installation.
 */
export const COMBAT_HEXACOPTER_YAW_FAN_FORCE = 125;

const rotated = (value: SceneVector3, yaw: number): SceneVector3 => {
  const cosine = Math.cos(yaw);
  const sine = Math.sin(yaw);
  return [
    value[0] * cosine + value[2] * sine,
    value[1],
    -value[0] * sine + value[2] * cosine,
  ];
};

export function combatHexacopterVector(
  placement: CombatHexacopterPlacement,
  local: SceneVector3,
): SceneVector3 {
  return rotated(local, placement.yaw);
}

export function combatHexacopterPoint(
  placement: CombatHexacopterPlacement,
  local: SceneVector3,
): SceneVector3 {
  const offset = combatHexacopterVector(placement, local);
  return [
    placement.position[0] + offset[0],
    placement.position[1] + offset[1],
    placement.position[2] + offset[2],
  ];
}

const localYawThrusters = (): readonly CombatHexacopterYawThruster[] =>
  COMBAT_HEX_YAW_STATIONS.map((station) => ({
    id: station.id,
    point: [station.x, station.y, station.z],
    axis: [Math.sin(station.cant), 0, Math.cos(station.cant)],
    maximumForce: COMBAT_HEXACOPTER_YAW_FAN_FORCE,
  }));

function proximitySensors(
  placement: CombatHexacopterPlacement,
): CombatHexacopterBlueprint["proximitySensors"] {
  const sensors: {
    point: SceneVector3;
    normal: SceneVector3;
  }[] = [
    { point: combatHexacopterPoint(placement, [0, 0.82, 3.15]), normal: combatHexacopterVector(placement, [0, 0, 1]) },
    { point: combatHexacopterPoint(placement, [0, 1.7, -3.25]), normal: combatHexacopterVector(placement, [0, 0, -1]) },
    { point: combatHexacopterPoint(placement, [0, 2, -1.18]), normal: [0, 1, 0] },
    { point: combatHexacopterPoint(placement, [0, 0.02, 0]), normal: [0, -1, 0] },
  ];
  for (const station of COMBAT_HEX_LIFT_STATIONS) {
    const radialLength = Math.hypot(station.x, station.z) || 1;
    const outward: SceneVector3 = [
      station.x / radialLength,
      0,
      station.z / radialLength,
    ];
    sensors.push(
      {
        point: combatHexacopterPoint(placement, [
          station.x + outward[0] * station.outerRadius,
          station.planeY,
          station.z + outward[2] * station.outerRadius,
        ]),
        normal: combatHexacopterVector(placement, outward),
      },
      {
        point: combatHexacopterPoint(placement, [station.x, station.planeY + 0.18, station.z]),
        normal: [0, 1, 0],
      },
      {
        point: combatHexacopterPoint(placement, [station.x, station.planeY - 0.22, station.z]),
        normal: [0, -1, 0],
      },
    );
  }
  return sensors;
}

export function createCombatHexacopterBlueprint(
  placement: CombatHexacopterPlacement,
): CombatHexacopterBlueprint {
  const enginePoints = COMBAT_HEX_LIFT_STATIONS.map((station) =>
    combatHexacopterPoint(placement, [station.x, station.planeY, station.z]),
  );
  const yawThrusters = localYawThrusters().map((thruster) => ({
    ...thruster,
    point: combatHexacopterPoint(placement, thruster.point),
    axis: combatHexacopterVector(placement, thruster.axis),
  }));
  return {
    id: COMBAT_HEXACOPTER_BLUEPRINT_ID,
    telemetryLabel: "COMBAT HEX 01",
    placement,
    origin: combatHexacopterPoint(placement, [0, 0.96, 0.08]),
    nose: combatHexacopterVector(placement, [0, 0, 1]),
    liftCentre: combatHexacopterPoint(placement, [0, 1.14, 0.02]),
    mooringPoint: combatHexacopterPoint(placement, [0, 0.34, 2.85]),
    enginePoints,
    rotorCapacityWeights: COMBAT_HEXACOPTER_ROTOR_CAPACITY_WEIGHTS,
    rotorSpinDirections: COMBAT_HEXACOPTER_ROTOR_SPIN_DIRECTIONS,
    yawThrusters,
    proximitySensors: proximitySensors(placement),
    envelope: {
      length: COMBAT_HEX_LENGTH,
      width: COMBAT_HEX_WIDTH,
      height: COMBAT_HEX_HEIGHT,
    },
    flight: {
      liftSource: "rotor",
      // A combat machine keeps control reserve after one complete standard
      // lift unit is lost; this is a physics passport, not a route tuning.
      liftReserve: 3.65,
      maximumTilt: (34 * Math.PI) / 180,
      liftTrimRange: 0.32,
      spoolSeconds: 3.8,
      linearDamping: 0.19,
      angularDamping: 0.64,
      lateralDragRatio: 7.2,
    },
  };
}

export const combatHexacopterPrototypeBlueprint =
  createCombatHexacopterBlueprint(COMBAT_HEXACOPTER_PROTOTYPE_PLACEMENT);

export interface CombatHexacopterYawAllocation {
  /** Signed reversible command for left/right fan, -1..1. */
  readonly commands: readonly [number, number];
  readonly forces: readonly SceneVector3[];
  readonly netForce: SceneVector3;
  readonly yawMoment: number;
}

/**
 * Bounded least-energy allocation for the two canted reversible yaw fans.
 * The moment is recovered from the authored points and axes (`r × F`) rather
 * than from a decorative multiplier. Mirrored cant makes a small lateral
 * force physically unavoidable; the six lift rotors cancel it by attitude.
 */
export function combatHexacopterYawAllocation(
  blueprint: CombatHexacopterBlueprint,
  requestedYawMoment: number,
): CombatHexacopterYawAllocation {
  const relative = blueprint.yawThrusters.map((thruster) => [
    thruster.point[0] - blueprint.origin[0],
    thruster.point[1] - blueprint.origin[1],
    thruster.point[2] - blueprint.origin[2],
  ] as SceneVector3);
  const arms = blueprint.yawThrusters.map((thruster, index) =>
    relative[index][2] * thruster.axis[0] -
      relative[index][0] * thruster.axis[2],
  );
  const maximumMoment = arms.reduce(
    (sum, arm, index) =>
      sum + Math.abs(arm) * blueprint.yawThrusters[index].maximumForce,
    0,
  );
  const wanted = Math.max(-maximumMoment, Math.min(maximumMoment, requestedYawMoment));
  let low = -1e6;
  let high = 1e6;
  for (let iteration = 0; iteration < 64; iteration += 1) {
    const lambda = (low + high) / 2;
    const delivered = arms.reduce((sum, arm, index) => {
      const limit = blueprint.yawThrusters[index].maximumForce;
      const force = Math.max(-limit, Math.min(limit, lambda * arm));
      return sum + force * arm;
    }, 0);
    if (delivered < wanted) low = lambda;
    else high = lambda;
  }
  const lambda = (low + high) / 2;
  const scalarForces = arms.map((arm, index) => {
    const limit = blueprint.yawThrusters[index].maximumForce;
    return Math.max(-limit, Math.min(limit, lambda * arm));
  });
  const forces = blueprint.yawThrusters.map((thruster, index) => [
    thruster.axis[0] * scalarForces[index],
    thruster.axis[1] * scalarForces[index],
    thruster.axis[2] * scalarForces[index],
  ] as SceneVector3);
  const netForce: SceneVector3 = forces.reduce<SceneVector3>(
    (sum, force) => [sum[0] + force[0], sum[1] + force[1], sum[2] + force[2]],
    [0, 0, 0],
  );
  return {
    commands: scalarForces.map((force, index) =>
      force / blueprint.yawThrusters[index].maximumForce,
    ) as unknown as readonly [number, number],
    forces,
    netForce,
    yawMoment: scalarForces.reduce(
      (sum, force, index) => sum + force * arms[index],
      0,
    ),
  };
}
