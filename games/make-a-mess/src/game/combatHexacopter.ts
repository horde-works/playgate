import {
  COMBAT_HEX_HEIGHT,
  COMBAT_HEX_LENGTH,
  COMBAT_HEX_LIFT_STATIONS,
  COMBAT_HEX_WIDTH,
  COMBAT_HEX_YAW_STATIONS,
} from "../content/objects/vehicles/combatHexacopterObject.ts";
import type { SceneVector3 } from "./destructionScene.ts";
import {
  ROTORCRAFT_AUXILIARY_YAW_PRIMARY_SHARE,
  ROTORCRAFT_YAW_RATE_GAIN,
  yawThrusterAllocation,
} from "./rotorcraftDynamics.ts";
import type { VehicleFrameDefinition } from "./vehicleFrames.ts";

export const COMBAT_HEXACOPTER_BLUEPRINT_ID = "combat-hexacopter";
export const RAX8_TONKAWA_NAME = "RAX-8 Tonkawa";
export const RAX8_TONKAWA_TELEMETRY_LABEL = "RAX-8 TONKAWA";

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
  readonly telemetryLabel: typeof RAX8_TONKAWA_TELEMETRY_LABEL;
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

export const COMBAT_HEXACOPTER_RANGE_SCENE_ID = "combat-hexacopter-range";
export const COMBAT_HEXACOPTER_RANGE_BERTH: SceneVector3 = [0, 0.08, 0];
export const COMBAT_HEXACOPTER_RANGE_DISPATCH_POINT: SceneVector3 = [5.2, 1.08, 2.2];
export const COMBAT_HEXACOPTER_RANGE_PLACEMENT: CombatHexacopterPlacement = {
  sceneId: COMBAT_HEXACOPTER_RANGE_SCENE_ID,
  clusterId: `${COMBAT_HEXACOPTER_RANGE_SCENE_ID}:vehicle`,
  position: COMBAT_HEXACOPTER_RANGE_BERTH,
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
    telemetryLabel: RAX8_TONKAWA_TELEMETRY_LABEL,
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
      // ЗАПАС ПОДЪЁМА ДЕРЖИТ НЕ ВЫСОТУ, А КРЕН.
      //
      // Он и раньше покрывал потерю целого кольца, но с разрешённым жёстким
      // виражом у него появилась вторая работа. В координированном вираже тяга
      // равна весу, делённому на косинус крена: на 56° это 1.79 висения, и всё
      // это ДО того, как винтам понадобится запас на моменты по крену и
      // тангажу. Прежние 3.65 (полезных 3.10 после потолка газа) оставляли на
      // манёвр слишком тонкую полосу, поэтому запас поднят.
      liftReserve: 4.2,
      // ПРЕДЕЛ НАКЛОНА — ПОЛИТИКА, И ОНА БЫЛА ВЫСТАВЛЕНА НЕ ПО ЭТОЙ МАШИНЕ.
      //
      // Физика при располагаемой перегрузке 3.57 разрешает 73.7°. Но упирается
      // вираж не в тягу: он координированный, нос обязан идти по касательной с
      // темпом v/r, и на 30-метровом радиусе предел по тяге потребовал бы 0.98
      // рад/с при располагаемых 0.72. Поэтому политика ставится ТАМ, ГДЕ
      // КОНЧАЕТСЯ РЫСКАНИЕ, а не тяга: 56° дают 14.5 м/с² и 21 м/с на том же
      // радиусе — ровно то, что нос ещё способен обслужить.
      maximumTilt: (56 * Math.PI) / 180,
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

/**
 * Complete movable-frame passport, deliberately returned by a factory and
 * not inserted into `vehicleFrames`. World registration happens only after a
 * berth is selected.
 */
export function createCombatHexacopterVehicleFrame(
  blueprint: CombatHexacopterBlueprint,
): VehicleFrameDefinition {
  return {
    id: blueprint.id,
    clusterId: blueprint.placement.clusterId,
    telemetryLabel: blueprint.telemetryLabel,
    independentMemberMatches: [":engine:", ":yaw-engine:"],
    origin: blueprint.origin,
    nose: blueprint.nose,
    mooringPoint: blueprint.mooringPoint,
    liftCentre: blueprint.liftCentre,
    envelopeMatch: ":blade:",
    proximitySensors: blueprint.proximitySensors,
  };
}

export const combatHexacopterPrototypeFrame =
  createCombatHexacopterVehicleFrame(combatHexacopterPrototypeBlueprint);

export const combatHexacopterRangeBlueprint =
  createCombatHexacopterBlueprint(COMBAT_HEXACOPTER_RANGE_PLACEMENT);

export const combatHexacopterRangeFrame =
  createCombatHexacopterVehicleFrame(combatHexacopterRangeBlueprint);

export interface CombatHexacopterYawAllocation {
  /** Signed reversible command for left/right fan, -1..1. */
  readonly commands: readonly [number, number];
  readonly forces: readonly SceneVector3[];
  readonly netForce: SceneVector3;
  readonly yawMoment: number;
}

/**
 * Раскладка по двум развёрнутым реверсивным тоннелям.
 *
 * Сам закон общий и живёт в винтокрылой физике — своего у этой машины здесь
 * ничего нет, кроме паспорта. Функция остаётся точкой, где паспорт машины
 * встречается с общим законом: она показывает, что тоннели УМЕЮТ, до и
 * независимо от того, что у них попросит автопилот.
 *
 * Плечи считаются от авторского `origin` — это чтение паспорта, а не полётный
 * счёт; в полёте общая физика берёт настоящий центр масс, который живёт своей
 * жизнью после потери куска.
 */
export function combatHexacopterYawAllocation(
  blueprint: CombatHexacopterBlueprint,
  requestedYawMoment: number,
  availability: readonly [number, number] = [1, 1],
): CombatHexacopterYawAllocation {
  const allocation = yawThrusterAllocation(
    blueprint.yawThrusters,
    blueprint.origin,
    requestedYawMoment,
    availability,
  );
  return {
    commands: [allocation.commands[0] ?? 0, allocation.commands[1] ?? 0],
    forces: allocation.forces,
    netForce: allocation.netForce,
    yawMoment: allocation.yawMoment,
  };
}

/**
 * СТЕНДОВАЯ ПРОБА ОБЪЕДИНЁННОГО КАНАЛА РЫСКАНИЯ.
 *
 * Своего контура управления у этой машины нет и быть не должно: закон раздела
 * момента между реактивным каналом и тоннелями общий, живёт в
 * `rotorcraftForces` и работает у любой винтокрылой машины, которой объявили
 * `yawThrusters`. Здесь остаётся один вопрос, ради которого паспорт и
 * существует: что получится у ЭТОЙ машины при таком-то остатке реактивного
 * момента и такой-то живучести тоннелей.
 *
 * Функция намеренно повторяет порядок общего кода, а не подменяет его: сперва
 * доля реактивного канала, потом тоннели, потом остаток тому, у кого он ещё
 * есть. Расходиться им негде — общий шаг проверяется отдельным прогоном сил.
 */
export interface CombatHexacopterYawDemand {
  /** Traditional autopilot output; no motor topology leaks above this line. */
  readonly wantedYawRate: number;
  readonly actualYawRate: number;
  readonly yawInertia: number;
  /** Moment range still available from reaction torque of the six lift rotors. */
  readonly primaryMinimumMoment: number;
  readonly primaryMaximumMoment: number;
  readonly yawFanAvailability?: readonly [number, number];
}

export interface CombatHexacopterYawControl {
  readonly wantedYawMoment: number;
  readonly primaryYawMoment: number;
  readonly auxiliary: CombatHexacopterYawAllocation;
  readonly deliveredYawMoment: number;
  readonly acceptedYawRate: number;
  readonly authority: number;
}

export function combatHexacopterYawControl(
  blueprint: CombatHexacopterBlueprint,
  demand: CombatHexacopterYawDemand,
): CombatHexacopterYawControl {
  const yawInertia = Math.max(1e-6, demand.yawInertia);
  const wantedYawMoment =
    yawInertia *
    ROTORCRAFT_YAW_RATE_GAIN *
    (demand.wantedYawRate - demand.actualYawRate);
  const minimum = Math.min(
    demand.primaryMinimumMoment,
    demand.primaryMaximumMoment,
  );
  const maximum = Math.max(
    demand.primaryMinimumMoment,
    demand.primaryMaximumMoment,
  );
  const clampPrimary = (moment: number) =>
    Math.max(minimum, Math.min(maximum, moment));
  const preferredAuxiliary = combatHexacopterYawAllocation(
    blueprint,
    wantedYawMoment * (1 - ROTORCRAFT_AUXILIARY_YAW_PRIMARY_SHARE),
    demand.yawFanAvailability,
  );
  const primaryYawMoment = clampPrimary(
    wantedYawMoment - preferredAuxiliary.yawMoment,
  );
  const auxiliary = combatHexacopterYawAllocation(
    blueprint,
    wantedYawMoment - primaryYawMoment,
    demand.yawFanAvailability,
  );
  const deliveredYawMoment = primaryYawMoment + auxiliary.yawMoment;
  const acceptedYawRate =
    demand.actualYawRate +
    deliveredYawMoment / (yawInertia * ROTORCRAFT_YAW_RATE_GAIN);
  const authority = Math.abs(wantedYawMoment) < 1e-6
    ? 1
    : Math.max(0, Math.min(1, deliveredYawMoment / wantedYawMoment));
  return {
    wantedYawMoment,
    primaryYawMoment,
    auxiliary,
    deliveredYawMoment,
    acceptedYawRate,
    authority,
  };
}
