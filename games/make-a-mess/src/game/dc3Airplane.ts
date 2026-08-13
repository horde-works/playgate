import type {
  BreakableMaterial,
  BreakablePieceDefinition,
  BreakableShape,
  CommandActuatorTag,
  DoorHingeDefinition,
  SceneVector3,
} from "./destructionScene.ts";
import { structuralMaterialProfiles } from "./destructionScene.ts";
import type { AirplanePassport } from "./airplaneDynamics.ts";
import { AIR_DENSITY, GRAVITY } from "./airplaneDynamics.ts";
import type { VehicleLiftSource } from "./vehicleLiftGeometry.ts";
import type { ShipLimits, VehicleFrameDefinition } from "./vehicleFrames.ts";
import { massProperties, type MassProperties } from "./clusterDynamics.ts";
import { dc3BlockoutObject } from "../content/objects/aircraft/dc3BlockoutObject.ts";
import type { ObjectLabPart } from "../content/objects/dutchWindmills/objectModel.ts";
import {
  DC3_LENGTH,
  DC3_WING_AREA,
  DC3_WINGSPAN,
} from "../content/objects/aircraft/dc3Dimensions.ts";

/**
 * Класс DC-3: крылатая машина, ещё не сцена мира.
 *
 * Геометрия живёт в Object Lab (`dc3BlockoutObject`). Этот файл объявляет
 * вид судна, читает из объекта куски с актуаторами и собирает кадр.
 * В `airVehicles` и `vehicleFrames` машины нет. Силовой стенд гоняет
 * скомпилированные куски напрямую.
 */

export const DC3_ENGINE_HALF_SPAN = 5.79;
export const DC3_WING_PANEL_COUNT = 4;

const STALL_SPEED = 31;
const STALL_SPEED_FLAPS = 27;
const CL_MAX = 1.48;

/** Вес из тождества сваливания: на Vs чистого крыла q·S·CLmax = mg. */
export const DC3_STALL_WEIGHT =
  0.5 * AIR_DENSITY * STALL_SPEED * STALL_SPEED * DC3_WING_AREA * CL_MAX;
export const DC3_STALL_MASS = DC3_STALL_WEIGHT / GRAVITY;

export const DC3_WING_PANELS = [
  [-10.2, 0.18, 1.1],
  [-10.2, 0.18, -2.2],
  [10.2, 0.18, 1.1],
  [10.2, 0.18, -2.2],
] as const;

export const DC3_ACTUATOR_PIECES: readonly {
  readonly id: string;
  readonly actuator: CommandActuatorTag;
}[] = [
  { id: "engine-left-crankcase", actuator: { id: "engine-left", commandChannel: "throttle:0", required: true } },
  { id: "engine-right-crankcase", actuator: { id: "engine-right", commandChannel: "throttle:1", required: true } },
  { id: "aileron-left", actuator: { id: "aileron", commandChannel: "aileron", contribution: 1 } },
  { id: "aileron-right", actuator: { id: "aileron", commandChannel: "aileron", contribution: 1 } },
  { id: "elevator-left", actuator: { id: "elevator", commandChannel: "elevator", contribution: 1 } },
  { id: "elevator-right", actuator: { id: "elevator", commandChannel: "elevator", contribution: 1 } },
  { id: "rudder", actuator: { id: "rudder", commandChannel: "rudder", required: true } },
  { id: "flap-left-inner", actuator: { id: "flap", commandChannel: "flap", contribution: 1 } },
  { id: "flap-left-outer", actuator: { id: "flap", commandChannel: "flap", contribution: 1 } },
  { id: "flap-right-inner", actuator: { id: "flap", commandChannel: "flap", contribution: 1 } },
  { id: "flap-right-outer", actuator: { id: "flap", commandChannel: "flap", contribution: 1 } },
];

export const DC3_ACTUATOR_TAGS: readonly CommandActuatorTag[] =
  DC3_ACTUATOR_PIECES.map((piece) => piece.actuator);

export const DC3_AIRPLANE_PASSPORT: AirplanePassport = {
  wingArea: DC3_WING_AREA,
  meanChord: DC3_WING_AREA / DC3_WINGSPAN,
  stallSpeed: STALL_SPEED,
  stallSpeedFlaps: STALL_SPEED_FLAPS,
  cruiseSpeed: 67,
  cl0: 0.28,
  clAlpha: 4.6,
  clFlap: 0.55,
  clMax: CL_MAX,
  cd0: 0.032,
  inducedFactor: 0.055,
  enginePower: DC3_STALL_WEIGHT * 0.22,
  enginePoints: [
    [-DC3_ENGINE_HALF_SPAN, 0, 1.2],
    [DC3_ENGINE_HALF_SPAN, 0, 1.2],
  ],
  liftCentre: [0, 0.35, 0],
  aileronAuthority: 42,
  elevatorAuthority: 38,
  rudderAuthority: 28,
};

export const DC3_AIRPLANE_CLASS = {
  id: "douglas-dc3",
  liftSource: "wing" as VehicleLiftSource,
  worldIntegration: false,
  envelope: {
    wingspan: DC3_WINGSPAN,
    length: DC3_LENGTH,
    wingArea: DC3_WING_AREA,
  },
  passport: DC3_AIRPLANE_PASSPORT,
  wingPanels: DC3_WING_PANELS,
  actuators: DC3_ACTUATOR_PIECES,
  landing: {
    radius: 8,
    height: 0.6,
    speed: 4,
    verticalSpeed: 1.2,
    uprightCos: 0.92,
    angularSpeed: 0.35,
  },
} as const;

export const DC3_STAND_CLUSTER_ID = "dc3-stand:vehicle";
const SKIN_THICKNESS = 0.012;

function subtract(a: SceneVector3, b: SceneVector3): SceneVector3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function normalize(value: SceneVector3): SceneVector3 {
  const length = Math.hypot(...value) || 1;
  return [value[0] / length, value[1] / length, value[2] / length];
}

function cross(a: SceneVector3, b: SceneVector3): SceneVector3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function triangleArea(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  c: readonly [number, number, number],
): number {
  const ab = subtract(b, a);
  const ac = subtract(c, a);
  return 0.5 * Math.hypot(...cross(ab, ac));
}

function meshGeometry(part: Extract<ObjectLabPart, { kind: "mesh" }>): {
  readonly center: SceneVector3;
  readonly size: SceneVector3;
  readonly volume: number;
} {
  const minimum = [0, 1, 2].map((axis) =>
    Math.min(...part.vertices.map((vertex) => vertex[axis])),
  );
  const maximum = [0, 1, 2].map((axis) =>
    Math.max(...part.vertices.map((vertex) => vertex[axis])),
  );
  const center: SceneVector3 = [
    (minimum[0] + maximum[0]) / 2,
    (minimum[1] + maximum[1]) / 2,
    (minimum[2] + maximum[2]) / 2,
  ];
  const size: SceneVector3 = [
    Math.max(0.02, maximum[0] - minimum[0]),
    Math.max(0.02, maximum[1] - minimum[1]),
    Math.max(0.02, maximum[2] - minimum[2]),
  ];
  const area = part.triangles.reduce(
    (sum, [a, b, c]) =>
      sum + triangleArea(part.vertices[a], part.vertices[b], part.vertices[c]),
    0,
  );
  const thickness = part.group.startsWith("structure-") ? 0.04 : SKIN_THICKNESS;
  return { center, size, volume: Math.max(0.0002, area * thickness) };
}

function rodGeometry(part: Extract<ObjectLabPart, { kind: "cylinder" | "beam" }>): {
  readonly center: SceneVector3;
  readonly size: SceneVector3;
  readonly volume: number;
} {
  const center: SceneVector3 = [
    (part.from[0] + part.to[0]) / 2,
    (part.from[1] + part.to[1]) / 2,
    (part.from[2] + part.to[2]) / 2,
  ];
  const length = Math.hypot(
    part.to[0] - part.from[0],
    part.to[1] - part.from[1],
    part.to[2] - part.from[2],
  );
  if (part.kind === "cylinder") {
    return {
      center,
      size: [part.radius * 2, length, part.radius * 2],
      volume: Math.PI * part.radius * part.radius * length,
    };
  }
  return {
    center,
    size: [part.width, length, part.depth],
    volume: part.width * part.depth * length,
  };
}

function partGeometry(part: ObjectLabPart): {
  readonly center: SceneVector3;
  readonly size: SceneVector3;
  readonly volume: number;
} {
  if (part.kind === "mesh") return meshGeometry(part);
  if (part.kind === "box") {
    return {
      center: [part.center[0], part.center[1], part.center[2]],
      size: [part.size[0], part.size[1], part.size[2]],
      volume: part.size[0] * part.size[1] * part.size[2],
    };
  }
  return rodGeometry(part);
}

function materialFor(part: ObjectLabPart): {
  readonly material: BreakableMaterial;
  readonly shape: BreakableShape;
  readonly color: string;
} {
  if (part.group === "gear" && /wheel$/.test(part.id)) {
    return { material: "wood", shape: "panel", color: "#2a2c2d" };
  }
  if (part.group.startsWith("structure-")) {
    return { material: "steel", shape: "panel", color: "#5c6164" };
  }
  if (part.material === "metal" && part.group.startsWith("engine-")) {
    return { material: "steel", shape: "steelSheet", color: "#5c6164" };
  }
  return { material: "aluminium", shape: "steelSheet", color: "#c9ccc6" };
}

export function dc3ActuatorFor(part: Pick<ObjectLabPart, "id" | "group">): CommandActuatorTag | undefined {
  const match = DC3_ACTUATOR_PIECES.find((entry) => entry.id === part.id);
  return match?.actuator;
}

function hingeFor(part: ObjectLabPart): DoorHingeDefinition | undefined {
  const hinge = dc3BlockoutObject.surfaceHinges[part.id];
  if (!hinge) return undefined;
  const hint: SceneVector3 = Math.abs(hinge.axis[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  return {
    pivot: [hinge.pivot[0], hinge.pivot[1], hinge.pivot[2]],
    direction: [hinge.axis[0], hinge.axis[1], hinge.axis[2]],
    normal: normalize(cross(hinge.axis, hint)),
  };
}

function loadBearing(part: ObjectLabPart): boolean {
  if (part.group.startsWith("propeller-")) return false;
  if (
    part.group.startsWith("flap-") ||
    part.group.startsWith("aileron-") ||
    part.group.startsWith("elevator-") ||
    part.group === "rudder"
  ) {
    return false;
  }
  return true;
}

/**
 * Object Lab → куски кадра. Актуаторы вешаются на те же id, что в объекте.
 * Это не сцена мира: кластер стендовый.
 */
export function compileDc3AirplanePieces(): BreakablePieceDefinition[] {
  return dc3BlockoutObject.parts.map((part) => {
    const geometry = partGeometry(part);
    const binding = materialFor(part);
    return {
      id: part.id,
      clusterId: DC3_STAND_CLUSTER_ID,
      material: binding.material,
      shape: binding.shape,
      position: geometry.center,
      size: geometry.size,
      volume: geometry.volume,
      color: binding.color,
      actuator: dc3ActuatorFor(part),
      hinge: hingeFor(part),
      bearsLoad: loadBearing(part),
    };
  });
}

export const dc3AirplaneStandPieces = compileDc3AirplanePieces();

const densityOf = (material: BreakableMaterial) =>
  structuralMaterialProfiles[material].density;

/**
 * Объёмы блок-аута — не вес типа. Стенд летит тождество сваливания;
 * центр масс и форма инерции остаются с объекта.
 */
export function dc3AirplaneStandMass(
  pieces: readonly BreakablePieceDefinition[] = dc3AirplaneStandPieces,
): MassProperties {
  const raw = massProperties(pieces, densityOf);
  const scale = raw.mass > 1e-6 ? DC3_STALL_MASS / raw.mass : 1;
  return {
    ...raw,
    mass: DC3_STALL_MASS,
    inertia: raw.inertia.map((value) => value * scale),
    inverseInertia: raw.inverseInertia.map((value) => value / scale),
  };
}

function unitFrom(from: SceneVector3, to: SceneVector3): SceneVector3 {
  return normalize(subtract(to, from));
}

export function createDc3AirplaneFrame(): VehicleFrameDefinition {
  const anchors = dc3BlockoutObject.anchors;
  const wings = dc3AirplaneStandPieces.filter((piece) => piece.id.startsWith("wing-"));
  const liftCentre: SceneVector3 = wings.length
    ? [
        wings.reduce((sum, piece) => sum + piece.position[0], 0) / wings.length,
        wings.reduce((sum, piece) => sum + piece.position[1], 0) / wings.length,
        wings.reduce((sum, piece) => sum + piece.position[2], 0) / wings.length,
      ]
    : [0, 0.35, 0];
  return {
    id: DC3_AIRPLANE_CLASS.id,
    clusterId: DC3_STAND_CLUSTER_ID,
    telemetryLabel: "DC-3",
    independentMemberMatches: ["flap-", "aileron-", "elevator-", "rudder"],
    contactMemberExcludes: ["gear-"],
    origin: [0, 0, 0],
    nose: unitFrom(anchors.tail, anchors.nose),
    mooringPoint: [anchors.nose[0], anchors.nose[1], anchors.nose[2]],
    liftCentre,
    envelopeMatch: "wing-",
    proximitySensors: [
      { point: [anchors.leftMainWheel[0], anchors.leftMainWheel[1], anchors.leftMainWheel[2]], normal: [0, -1, 0] },
      { point: [anchors.rightMainWheel[0], anchors.rightMainWheel[1], anchors.rightMainWheel[2]], normal: [0, -1, 0] },
      { point: [anchors.tailwheel[0], anchors.tailwheel[1], anchors.tailwheel[2]], normal: [0, -1, 0] },
      { point: [anchors.nose[0], anchors.nose[1], anchors.nose[2]], normal: unitFrom(anchors.tail, anchors.nose) },
    ],
  };
}

export const dc3AirplaneStandFrame = createDc3AirplaneFrame();

export interface Dc3AirplaneStandVehicle extends VehicleFrameDefinition {
  readonly flight: {
    readonly liftSource: "wing";
    readonly airplane: AirplanePassport;
    readonly landing: (typeof DC3_AIRPLANE_CLASS)["landing"];
    readonly limits: ShipLimits;
    readonly spoolSeconds: number;
    readonly linearDamping: number;
    readonly angularDamping: number;
    readonly lateralDragRatio: number;
  };
}

export function createDc3AirplaneStandVehicle(): Dc3AirplaneStandVehicle {
  const frame = dc3AirplaneStandFrame;
  const anchors = dc3BlockoutObject.anchors;
  return {
    ...frame,
    flight: {
      liftSource: "wing",
      airplane: DC3_AIRPLANE_PASSPORT,
      landing: DC3_AIRPLANE_CLASS.landing,
      limits: {
        enginePower: DC3_AIRPLANE_PASSPORT.enginePower,
        enginePoints: DC3_AIRPLANE_PASSPORT.enginePoints,
        maxRudderForce: 0,
        rudderReferenceSpeed: DC3_AIRPLANE_PASSPORT.cruiseSpeed,
        rudderPoint: [anchors.finTip[0], anchors.finTip[1], anchors.finTip[2]],
        liftTrimRange: 0.22,
        lateralThrust: 0,
      },
      spoolSeconds: 2.4,
      linearDamping: 0.08,
      angularDamping: 0.42,
      lateralDragRatio: 14,
    },
  };
}

export const dc3AirplaneStandVehicle = createDc3AirplaneStandVehicle();
