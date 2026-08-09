/**
 * VX-8 «Yaqui» — the accepted object compiled into scene pieces.
 *
 * Twin of `combatHexacopterPrototypeDocument.ts`, and deliberately so: the
 * destruction solver, the cluster and the actuator layer already read that
 * shape. What differs is what the two machines differ in — this one has one
 * blade mesh per rotor rather than a part per blade, its ducts are cored into a
 * lofted body instead of hung in gondolas, and it carries glazing.
 *
 * This file is the second half of the adapter agreed with the Windows session:
 * the object translating itself into pieces. It chooses no berth — the caller
 * passes a placement, and world registration stays with the session that owns
 * placement.
 */

import { Euler, Quaternion, Vector3 } from "three";
import {
  DUCT_HEX_LIFT_STATIONS,
  DUCT_HEX_YAW_STATIONS,
  ductHexacopterObject,
} from "../objects/vehicles/ductHexacopterObject.ts";
import type {
  ObjectLabPart,
  ObjectMaterialId,
  ObjectPoint,
} from "../objects/dutchWindmills/objectModel.ts";
import type {
  SceneGroupDefinition,
  SceneObjectDefinition,
  ScenePrimitiveDefinition,
} from "./sceneContract.ts";
import type {
  BreakableMaterial,
  BreakableShape,
  CommandActuatorTag,
  SceneVector3,
} from "../../game/destructionScene.ts";
import {
  DUCT_HEXACOPTER_PROTOTYPE_PLACEMENT,
  ductHexacopterPoint,
  type DuctHexacopterPlacement,
} from "../../game/ductHexacopter.ts";

type MaterialBinding = {
  readonly material: BreakableMaterial;
  readonly shape: BreakableShape;
  readonly color: string;
  readonly shellThickness: number;
};

/**
 * Semantic materials, not colours. The lab palette says what a part IS; this
 * table says how that behaves when something hits it. Glazing is the only entry
 * that is glass, and it is glass because the object's own transparency audit
 * says those sixteen panes are the only real glass on the machine.
 */
const materialBindings: Partial<Record<ObjectMaterialId, MaterialBinding>> = {
  metal: { material: "steel", shape: "steelSheet", color: "#8a8378", shellThickness: 0.009 },
  "paint-light": { material: "steel", shape: "steelSheet", color: "#9aa0a2", shellThickness: 0.012 },
  "paint-accent": { material: "steel", shape: "steelSheet", color: "#d08a34", shellThickness: 0.006 },
  "roof-dark": { material: "steel", shape: "steelSheet", color: "#23282a", shellThickness: 0.012 },
  "timber-dark": { material: "steel", shape: "steelSheet", color: "#33383a", shellThickness: 0.011 },
  "timber-mid": { material: "steel", shape: "steelSheet", color: "#565b5c", shellThickness: 0.01 },
  glazing: { material: "darkGlass", shape: "glassPane", color: "#0c1a20", shellThickness: 0.007 },
  "dark-recess": { material: "plastic", shape: "panel", color: "#0a0d0e", shellThickness: 0.008 },
};

const point = (value: ObjectPoint): SceneVector3 => [value[0], value[1], value[2]];

function materialFor(part: ObjectLabPart): MaterialBinding {
  const binding = materialBindings[part.material];
  if (!binding) {
    throw new Error(`VX-8 Yaqui part ${part.id} has unmapped material ${part.material}`);
  }
  return binding;
}

function placedEuler(
  placement: DuctHexacopterPlacement,
  rotation?: SceneVector3,
): SceneVector3 {
  const authored = new Quaternion().setFromEuler(new Euler(...(rotation ?? [0, 0, 0])));
  const placed = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), placement.yaw);
  const result = new Euler().setFromQuaternion(placed.multiply(authored));
  return [result.x, result.y, result.z];
}

function rodRotation(from: ObjectPoint, to: ObjectPoint): SceneVector3 {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const dz = to[2] - from[2];
  return [Math.atan2(dz, dy), 0, Math.atan2(-dx, Math.hypot(dy, dz))];
}

function triangleArea(a: ObjectPoint, b: ObjectPoint, c: ObjectPoint): number {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  return 0.5 * Math.hypot(
    ab[1] * ac[2] - ab[2] * ac[1],
    ab[2] * ac[0] - ab[0] * ac[2],
    ab[0] * ac[1] - ab[1] * ac[0],
  );
}

/** Duct index of a part, by the groups the object itself names. */
function liftEngineIndex(part: ObjectLabPart): number {
  return DUCT_HEX_LIFT_STATIONS.findIndex(
    (station) =>
      part.group === `rotor-lift-${station.id}` || part.group === `core-duct-${station.id}`
      || part.id.startsWith(`duct-flow-${station.id}-`),
  );
}

function yawEngineIndex(part: ObjectLabPart): number {
  return DUCT_HEX_YAW_STATIONS.findIndex(
    (station) =>
      part.group === `rotor-yaw-${station.id}` || part.group === `core-yaw-${station.id}`,
  );
}

/**
 * Piece id. The frame masks read these strings, so they are contract: the blade
 * of a rotor must carry `blade`, and a landing member must keep its `landing-`
 * prefix, or the machine grows bodies it should not have and lands in the air.
 */
function objectId(part: ObjectLabPart): string {
  const lift = liftEngineIndex(part);
  if (lift >= 0) {
    if (/-blades$/.test(part.id)) return `engine:${lift}:blade:0`;
    if (/-motor$/.test(part.id)) return `engine:${lift}:motor`;
    return `engine:${lift}:${part.id}`;
  }
  const yaw = yawEngineIndex(part);
  if (yaw >= 0) {
    if (/-blades$/.test(part.id)) return `yaw-engine:${yaw}:blade:0`;
    if (/-motor$/.test(part.id)) return `yaw-engine:${yaw}:motor`;
    return `yaw-engine:${yaw}:${part.id}`;
  }
  return part.id;
}

function actuatorFor(part: ObjectLabPart): CommandActuatorTag | undefined {
  const isMotor = /-motor$/.test(part.id);
  const isBlade = /-blades$/.test(part.id);
  if (!isMotor && !isBlade) return undefined;
  const lift = liftEngineIndex(part);
  if (lift >= 0) {
    return {
      id: `duct-hexacopter:lift:${lift}`,
      commandChannel: `throttle:${lift}`,
      required: isMotor ? true : undefined,
      contribution: isBlade ? 1 : undefined,
    };
  }
  const yaw = yawEngineIndex(part);
  if (yaw >= 0) {
    return {
      id: `duct-hexacopter:yaw:${yaw}`,
      commandChannel: `yaw-throttle:${yaw}`,
      required: isMotor ? true : undefined,
      contribution: isBlade ? 1 : undefined,
    };
  }
  return undefined;
}

/**
 * What carries load. The object already separated structure from surface by
 * naming its groups, so this reads that decision rather than repeating it: the
 * core, the skin that closes it, the gear and the weapon mounts bear; glazing,
 * interior fittings and the spinning parts do not. The motor is an exception on
 * purpose — the stator vanes and the pylons stand on it, and the hub hangs off
 * its shaft; without that the spinner would rest on air.
 */
function loadBearing(part: ObjectLabPart): boolean {
  if (part.group === "canopy-glazing" || part.group === "interior") return false;
  if (/-blades$/.test(part.id) || /-spinner$/.test(part.id)) return false;
  if (part.group.startsWith("core-") || part.group.startsWith("hull-")) return true;
  if (part.group === "landing-gear" || part.group === "weapons") return true;
  if (part.group === "duct-flow") return true;
  return /-motor$/.test(part.id);
}

function primitive(
  placement: DuctHexacopterPlacement,
  part: ObjectLabPart,
  center: SceneVector3,
  size: SceneVector3,
  rotation: SceneVector3 | undefined,
  options: Partial<ScenePrimitiveDefinition> = {},
): SceneObjectDefinition {
  const binding = materialFor(part);
  const driveMember = liftEngineIndex(part) >= 0 || yawEngineIndex(part) >= 0;
  const spinningBlade = /-blades$/.test(part.id) || /-spinner$/.test(part.id);
  // Attachment reach is the length of a bolt, not permission to hang. A blade
  // passes centimetres from the duct wall, and any generous reach lets the
  // solver read that nearness as support — the blade would then stay hanging in
  // a ring whose motor is gone, turning about nothing. It gets the root only.
  const attachmentReach = spinningBlade
    ? 0.06
    : driveMember
      ? 0.3
      : part.group === "weapons"
        ? 0.4
        : part.group === "canopy-glazing" || part.group === "interior"
          ? 0.12
          : 0.4;
  return {
    kind: "primitive",
    id: objectId(part),
    material: binding.material,
    shape: options.shape ?? binding.shape,
    size,
    color: binding.color,
    transform: {
      position: ductHexacopterPoint(placement, center),
      rotation: placedEuler(placement, rotation),
    },
    contactBoxes: [{ position: [0, 0, 0], size }],
    // A turning piece carries nothing: hanging anything on it would hang it on
    // a moving part.
    carriesAttachments: !spinningBlade,
    attachmentSupportMode: "cable",
    sideAttachmentReach: attachmentReach,
    maximumVerticalGap: part.group === "landing-gear"
      ? 0.1
      : driveMember
        ? 0.28
        : part.group === "canopy-glazing" || part.group === "interior"
          ? 0.12
          : 0.34,
    actuator: actuatorFor(part),
    bearsLoad: loadBearing(part),
    ...options,
  } as ScenePrimitiveDefinition;
}

function meshObject(
  placement: DuctHexacopterPlacement,
  part: Extract<ObjectLabPart, { kind: "mesh" }>,
): SceneObjectDefinition {
  const binding = materialFor(part);
  const minimum = [0, 1, 2].map((axis) =>
    Math.min(...part.vertices.map((vertex) => vertex[axis])),
  );
  const maximum = [0, 1, 2].map((axis) =>
    Math.max(...part.vertices.map((vertex) => vertex[axis])),
  );
  const center = [0, 1, 2].map((axis) => (minimum[axis] + maximum[axis]) / 2) as unknown as SceneVector3;
  const size = [0, 1, 2].map((axis) =>
    Math.max(0.015, maximum[axis] - minimum[axis]),
  ) as unknown as SceneVector3;
  const vertices = part.vertices.map((vertex) =>
    [0, 1, 2].map((axis) => (vertex[axis] - center[axis]) / size[axis]) as unknown as SceneVector3,
  );
  const area = part.triangles.reduce(
    (sum, [a, b, c]) => sum + triangleArea(part.vertices[a], part.vertices[b], part.vertices[c]),
    0,
  );
  return primitive(placement, part, center, size, undefined, {
    visualMesh: {
      vertices,
      indices: part.triangles.flatMap((triangle) => [...triangle]),
      normals: part.normals?.map(point),
      colors: part.vertexColors?.map(point),
      doubleSided: part.doubleSided,
    },
    voxelization: { mode: "shell", thickness: binding.shellThickness, voxelSize: 0.1 },
    volume: Math.max(0.0002, area * binding.shellThickness),
  });
}

function canonicalPart(
  placement: DuctHexacopterPlacement,
  part: ObjectLabPart,
): SceneObjectDefinition {
  if (part.kind === "mesh") return meshObject(placement, part);
  if (part.kind === "box") {
    const size = point(part.size);
    return primitive(
      placement,
      part,
      point(part.center),
      size,
      part.rotation ? point(part.rotation) : undefined,
      { volume: size[0] * size[1] * size[2] },
    );
  }
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
  const size: SceneVector3 = part.kind === "cylinder"
    ? [part.radius * 2, length, part.radius * 2]
    : [part.width, length, part.depth];
  const volume = part.kind === "cylinder"
    ? Math.PI * part.radius ** 2 * length
    : part.width * part.depth * length;
  return primitive(placement, part, center, size, rodRotation(part.from, part.to), {
    shape: part.kind === "cylinder" ? "cylinder" : materialFor(part).shape,
    volume,
    bearingArea: part.group === "landing-gear" ? Math.max(0.06, size[0] * length) : undefined,
  });
}

export interface DuctHexacopterDocument {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly groups: readonly SceneGroupDefinition[];
}

export function createDuctHexacopterDocument(
  placement: DuctHexacopterPlacement,
  label = "VX-8 Yaqui",
): DuctHexacopterDocument {
  const vehicleGroup: SceneGroupDefinition = {
    id: placement.clusterId.slice(`${placement.sceneId}:`.length),
    label,
    material: "steel",
    supportMode: "linked",
    objects: ductHexacopterObject.parts.map((part) => canonicalPart(placement, part)),
  };
  return {
    schemaVersion: 1,
    id: placement.sceneId,
    groups: [vehicleGroup],
  };
}

export const ductHexacopterPrototypeDocument = createDuctHexacopterDocument(
  DUCT_HEXACOPTER_PROTOTYPE_PLACEMENT,
  "VX-8 Yaqui prototype",
);
