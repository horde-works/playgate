import { Euler, Quaternion, Vector3 } from "three";
import {
  SR6_ROTOR_STATIONS,
  sr6SkatObject,
} from "../objects/vehicles/sr6SkatObject.ts";
import type {
  ObjectLabPart,
  ObjectMaterialId,
  ObjectPoint,
} from "../objects/dutchWindmills/objectModel.ts";
import type {
  SceneGroupDefinition,
  SceneLightSource,
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
  SR6_SKAT_SCENE_ID,
  SR6_SKAT_YAW,
  sr6SkatPoint,
} from "../../game/sr6Skat.ts";

type MaterialBinding = {
  readonly material: BreakableMaterial;
  readonly shape: BreakableShape;
  readonly color: string;
  readonly shellThickness: number;
};

const materialBindings: Partial<Record<ObjectMaterialId, MaterialBinding>> = {
  metal: { material: "steel", shape: "steelSheet", color: "#899396", shellThickness: 0.006 },
  "paint-light": { material: "plastic", shape: "panel", color: "#d9d4c8", shellThickness: 0.018 },
  "paint-accent": { material: "plastic", shape: "panel", color: "#d4602b", shellThickness: 0.012 },
  "roof-dark": { material: "plastic", shape: "panel", color: "#20272a", shellThickness: 0.018 },
  "timber-dark": { material: "steel", shape: "steelSheet", color: "#252c2f", shellThickness: 0.01 },
  "timber-mid": { material: "steel", shape: "steelSheet", color: "#3c4447", shellThickness: 0.008 },
  canvas: { material: "plastic", shape: "panel", color: "#181d1f", shellThickness: 0.012 },
  glazing: { material: "darkGlass", shape: "glassPane", color: "#294b5b", shellThickness: 0.008 },
  "dark-recess": { material: "plastic", shape: "panel", color: "#101416", shellThickness: 0.012 },
  "flower-red": { material: "darkGlass", shape: "glassPane", color: "#ff5b4f", shellThickness: 0.008 },
  foliage: { material: "darkGlass", shape: "glassPane", color: "#62e58f", shellThickness: 0.008 },
};

const point = (value: ObjectPoint): SceneVector3 => [value[0], value[1], value[2]];

function materialFor(part: ObjectLabPart): MaterialBinding {
  const binding = materialBindings[part.material];
  if (!binding) throw new Error(`SR-6 part ${part.id} has unmapped material ${part.material}`);
  return binding;
}

function rotatedEuler(rotation?: SceneVector3): SceneVector3 {
  const authored = new Quaternion().setFromEuler(
    new Euler(...(rotation ?? [0, 0, 0])),
  );
  const placed = new Quaternion().setFromAxisAngle(
    new Vector3(0, 1, 0),
    SR6_SKAT_YAW,
  );
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

function engineIndex(part: ObjectLabPart): number | null {
  return SR6_ROTOR_STATIONS.findIndex((station) => part.group === `rotor-${station.id}`);
}

function objectId(part: ObjectLabPart, engine: number | null): string {
  if (engine === null || engine < 0) return part.id;
  const blade = part.id.match(/-blade-(\d+)$/);
  return blade ? `engine:${engine}:blade:${blade[1]}` : `engine:${engine}:${part.id}`;
}

function actuatorFor(part: ObjectLabPart, engine: number | null): CommandActuatorTag | undefined {
  if (engine === null || engine < 0) return undefined;
  const id = `sr6-skat:engine:${engine}`;
  const commandChannel = `throttle:${engine}`;
  if (/-motor$/.test(part.id)) return { id, commandChannel, required: true };
  if (/-blade-\d+$/.test(part.id)) return { id, commandChannel, contribution: 1 };
  return undefined;
}

function navigationLightFor(part: ObjectLabPart): SceneLightSource | undefined {
  const common = {
    followsGroup: true,
    dayIntensityFactor: 1,
    poolPriority: 8,
  } as const;
  if (part.id === "nav-light-port-lens") {
    return {
      ...common,
      color: "#ff6f62",
      distance: 16,
      intensity: 3.2,
      beacon: { physicalDiameter: 0.42, minScreenDiameter: 4, maxWorldDiameter: 1.05, dayOpacity: 0.62, nightOpacity: 1 },
    };
  }
  if (part.id === "nav-light-starboard-lens") {
    return {
      ...common,
      color: "#6bff9c",
      distance: 16,
      intensity: 3.2,
      beacon: { physicalDiameter: 0.42, minScreenDiameter: 4, maxWorldDiameter: 1.05, dayOpacity: 0.62, nightOpacity: 1 },
    };
  }
  if (part.id === "nav-light-aft-lens") {
    return {
      ...common,
      color: "#fff1cf",
      distance: 18,
      intensity: 3.4,
      beacon: { physicalDiameter: 0.38, minScreenDiameter: 4, maxWorldDiameter: 1, dayOpacity: 0.58, nightOpacity: 1 },
    };
  }
  if (part.id === "anti-collision-beacon-lens") {
    return {
      ...common,
      color: "#ff493f",
      distance: 22,
      intensity: 4.2,
      poolPriority: 9,
      beacon: { physicalDiameter: 0.5, minScreenDiameter: 5, maxWorldDiameter: 1.25, dayOpacity: 0.72, nightOpacity: 1 },
    };
  }
  return undefined;
}

function primitive(
  part: ObjectLabPart,
  center: SceneVector3,
  size: SceneVector3,
  rotation: SceneVector3 | undefined,
  options: Partial<ScenePrimitiveDefinition> = {},
): SceneObjectDefinition {
  const binding = materialFor(part);
  const engine = engineIndex(part);
  return {
    kind: "primitive",
    id: objectId(part, engine),
    material: binding.material,
    shape: options.shape ?? binding.shape,
    size,
    color: binding.color,
    transform: {
      position: sr6SkatPoint(center),
      rotation: rotatedEuler(rotation),
    },
    contactBoxes: [{ position: [0, 0, 0], size }],
    carriesAttachments: true,
    attachmentSupportMode: "cable",
    sideAttachmentReach: 0.38,
    maximumVerticalGap: 0.18,
    actuator: actuatorFor(part, engine),
    light: navigationLightFor(part),
    ...options,
  } as ScenePrimitiveDefinition;
}

function meshObject(part: Extract<ObjectLabPart, { kind: "mesh" }>): SceneObjectDefinition {
  const binding = materialFor(part);
  const minimum = [0, 1, 2].map((axis) =>
    Math.min(...part.vertices.map((vertex) => vertex[axis])),
  );
  const maximum = [0, 1, 2].map((axis) =>
    Math.max(...part.vertices.map((vertex) => vertex[axis])),
  );
  const center = [0, 1, 2].map((axis) =>
    (minimum[axis] + maximum[axis]) / 2,
  ) as unknown as SceneVector3;
  const size = [0, 1, 2].map((axis) =>
    Math.max(0.015, maximum[axis] - minimum[axis]),
  ) as unknown as SceneVector3;
  const vertices = part.vertices.map((vertex) =>
    [0, 1, 2].map((axis) =>
      (vertex[axis] - center[axis]) / size[axis],
    ) as unknown as SceneVector3,
  );
  const area = part.triangles.reduce(
    (sum, [a, b, c]) => sum + triangleArea(part.vertices[a], part.vertices[b], part.vertices[c]),
    0,
  );
  return primitive(part, center, size, undefined, {
    shape: binding.shape,
    visualMesh: {
      vertices,
      indices: part.triangles.flatMap((triangle) => [...triangle]),
      normals: part.normals?.map(point),
      colors: part.vertexColors?.map(point),
      doubleSided: part.doubleSided,
    },
    // Armour is solid steel of real thickness, not a surface layer: a thin
    // shell resolves to a couple of voxels and a burst goes straight through
    // it into the core it is supposed to protect.
    voxelization: part.group === "armour"
      ? { mode: "solid", thickness: 0.05, voxelSize: 0.05 }
      : { mode: "shell", thickness: binding.shellThickness, voxelSize: 0.11 },
    volume: Math.max(0.0002, area * (part.group === "armour" ? 0.05 : binding.shellThickness)),
    // Lofted shell and frame panels are structure and carry their fittings; a
    // blanket bearsLoad:false left every deck fitting on the hump with nothing
    // to attach to, because a mesh that bears no load is not a support
    // candidate either from below or sideways.
    bearsLoad: part.group === "outer-shell"
      || part.group === "primary-frame"
      || part.group === "survival-frame",
  });
}

function canonicalPart(part: ObjectLabPart): SceneObjectDefinition {
  if (part.kind === "mesh") return meshObject(part);
  if (part.kind === "box") {
    const size = point(part.size);
    return primitive(part, point(part.center), size, part.rotation ? point(part.rotation) : undefined, {
      volume: size[0] * size[1] * size[2],
      bearsLoad: part.group === "landing-gear",
    });
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
  return primitive(part, center, size, rodRotation(part.from, part.to), {
    shape: part.kind === "cylinder" ? "cylinder" : materialFor(part).shape,
    volume,
    bearingArea: part.group === "landing-gear" ? Math.max(0.08, size[0] * length) : undefined,
    bearsLoad: part.group === "landing-gear",
  });
}

/**
 * Силовой корень кластера. Раньше это был невидимый грунтовый балласт под
 * кокпитом: половина массы машины и одновременно та точка, попадание в которую
 * снизу роняло весь борт вместе с гондолами. Теперь корень — стальной, лежит
 * внутри килевой балки над батарейным отсеком и прикрыт бронелистами.
 */
const root: SceneObjectDefinition = {
  kind: "primitive",
  id: "core",
  material: "steel",
  shape: "steelSheet",
  size: [0.16, 0.18, 3.6],
  color: "#4d5456",
  transform: { position: sr6SkatPoint([0, 0.92, 0]) },
  volume: 0.42,
  contactBoxes: [{ position: [0, 0.22, 0], size: [4.5, 1.08, 4.68] }],
  carriesAttachments: true,
  attachmentSupportMode: "cable",
  sideAttachmentReach: 1.2,
  bearingArea: 3.4,
};

const vehicleGroup: SceneGroupDefinition = {
  id: "vehicle",
  label: "SR-6 Skat M6 prototype",
  material: "steel",
  supportMode: "linked",
  objects: [root, ...sr6SkatObject.parts.map(canonicalPart)],
};

const dispatchPosition = sr6SkatPoint([2.85, 0, 0.8]);
const dispatchGroup: SceneGroupDefinition = {
  id: "dispatch",
  label: "SR-6 Skat prototype dispatch post",
  material: "steel",
  supportMode: "stack",
  objects: [
    {
      kind: "primitive",
      id: "post",
      material: "steel",
      shape: "cylinder",
      size: [0.12, 0.92, 0.12],
      color: "#3c4447",
      transform: { position: [dispatchPosition[0], 0.44, dispatchPosition[2]] },
      foundation: true,
      carriesAttachments: true,
      attachmentSupportMode: "cable",
      sideAttachmentReach: 0.4,
      bearingArea: 0.45,
    },
    {
      kind: "primitive",
      id: "console",
      material: "steel",
      shape: "steelSheet",
      size: [0.5, 0.36, 0.16],
      color: "#252c2f",
      transform: { position: [dispatchPosition[0], 1.02, dispatchPosition[2]] },
      carriesAttachments: true,
      attachmentSupportMode: "cable",
      sideAttachmentReach: 0.32,
    },
    {
      kind: "primitive",
      id: "screen",
      material: "darkGlass",
      shape: "glassPane",
      size: [0.38, 0.22, 0.035],
      color: "#1f8591",
      transform: { position: [dispatchPosition[0], 1.04, dispatchPosition[2] - 0.1] },
      bearsLoad: false,
      light: {
        color: "#53dceb",
        distance: 5,
        intensity: 1.6,
        dayIntensityFactor: 0.75,
        poolPriority: 5,
      },
    },
  ],
};

export const sr6SkatPrototypeDocument = {
  schemaVersion: 1 as const,
  id: SR6_SKAT_SCENE_ID,
  groups: [vehicleGroup, dispatchGroup],
};
