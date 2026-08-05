import { Euler, Quaternion, Vector3 } from "three";
import {
  COMBAT_HEX_LIFT_STATIONS,
  COMBAT_HEX_YAW_STATIONS,
  combatHexacopterObject,
} from "../objects/vehicles/combatHexacopterObject.ts";
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
  COMBAT_HEXACOPTER_PROTOTYPE_PLACEMENT,
  combatHexacopterPoint,
  type CombatHexacopterPlacement,
} from "../../game/combatHexacopter.ts";

type MaterialBinding = {
  readonly material: BreakableMaterial;
  readonly shape: BreakableShape;
  readonly color: string;
  readonly shellThickness: number;
};

const materialBindings: Partial<Record<ObjectMaterialId, MaterialBinding>> = {
  metal: { material: "steel", shape: "steelSheet", color: "#6f6a60", shellThickness: 0.008 },
  "paint-light": { material: "steel", shape: "steelSheet", color: "#30352f", shellThickness: 0.012 },
  "paint-accent": { material: "steel", shape: "steelSheet", color: "#d18436", shellThickness: 0.006 },
  "roof-dark": { material: "steel", shape: "steelSheet", color: "#171b1d", shellThickness: 0.012 },
  "timber-dark": { material: "steel", shape: "steelSheet", color: "#262b2c", shellThickness: 0.011 },
  "timber-mid": { material: "steel", shape: "steelSheet", color: "#41453f", shellThickness: 0.009 },
  canvas: { material: "plastic", shape: "panel", color: "#101416", shellThickness: 0.008 },
  glazing: { material: "darkGlass", shape: "glassPane", color: "#10212a", shellThickness: 0.007 },
  "dark-recess": { material: "plastic", shape: "panel", color: "#07090a", shellThickness: 0.008 },
  "flower-red": { material: "darkGlass", shape: "glassPane", color: "#ff635b", shellThickness: 0.006 },
  foliage: { material: "darkGlass", shape: "glassPane", color: "#65ef95", shellThickness: 0.006 },
};

const point = (value: ObjectPoint): SceneVector3 => [value[0], value[1], value[2]];

function materialFor(part: ObjectLabPart): MaterialBinding {
  const binding = materialBindings[part.material];
  if (!binding) {
    throw new Error(`RAX-8 Tonkawa part ${part.id} has unmapped material ${part.material}`);
  }
  return binding;
}

function placedEuler(
  placement: CombatHexacopterPlacement,
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

function liftEngineIndex(part: ObjectLabPart): number {
  return COMBAT_HEX_LIFT_STATIONS.findIndex(
    (station) => part.group === `lift-${station.id}`,
  );
}

function yawEngineIndex(part: ObjectLabPart): number {
  return COMBAT_HEX_YAW_STATIONS.findIndex(
    (station) => part.group === `yaw-${station.id}`,
  );
}

function objectId(part: ObjectLabPart): string {
  const lift = liftEngineIndex(part);
  if (lift >= 0) {
    const blade = part.id.match(/-blade-(\d+)$/);
    if (blade) return `engine:${lift}:blade:${blade[1]}`;
    if (/-motor$/.test(part.id)) return `engine:${lift}:motor`;
    return `engine:${lift}:${part.id}`;
  }
  const yaw = yawEngineIndex(part);
  if (yaw >= 0) {
    const blade = part.id.match(/-blade-(\d+)$/);
    if (blade) return `yaw-engine:${yaw}:blade:${blade[1]}`;
    if (/-motor$/.test(part.id)) return `yaw-engine:${yaw}:motor`;
    return `yaw-engine:${yaw}:${part.id}`;
  }
  return part.id;
}

function actuatorFor(part: ObjectLabPart): CommandActuatorTag | undefined {
  const lift = liftEngineIndex(part);
  if (lift >= 0 && (/-motor$/.test(part.id) || /-blade-\d+$/.test(part.id))) {
    return {
      id: `combat-hexacopter:lift:${lift}`,
      commandChannel: `throttle:${lift}`,
      required: /-motor$/.test(part.id) ? true : undefined,
      contribution: /-blade-\d+$/.test(part.id) ? 1 : undefined,
    };
  }
  const yaw = yawEngineIndex(part);
  if (yaw >= 0 && (/-motor$/.test(part.id) || /-blade-\d+$/.test(part.id))) {
    return {
      id: `combat-hexacopter:yaw:${yaw}`,
      commandChannel: `yaw-throttle:${yaw}`,
      required: /-motor$/.test(part.id) ? true : undefined,
      contribution: /-blade-\d+$/.test(part.id) ? 1 : undefined,
    };
  }
  return undefined;
}

function lightFor(part: ObjectLabPart): SceneLightSource | undefined {
  if (!part.light) return undefined;
  const beacon = part.id === "anti-collision-lens"
    ? { physicalDiameter: 0.5, minScreenDiameter: 5, maxWorldDiameter: 1.25, dayOpacity: 0.72, nightOpacity: 1 }
    : { physicalDiameter: 0.4, minScreenDiameter: 4, maxWorldDiameter: 1.05, dayOpacity: 0.62, nightOpacity: 1 };
  return {
    ...part.light,
    position: part.light.position ? point(part.light.position) : undefined,
    followsGroup: true,
    poolPriority: part.light.poolPriority ?? (part.id === "anti-collision-lens" ? 9 : 8),
    beacon,
  };
}

function loadBearing(part: ObjectLabPart): boolean {
  if ([
    "primary-frame",
    "survival-frame",
    "root-fairings",
    "landing-gear",
    "outer-shell",
    // Оружейный узел — тоже конструкция: пилон, короб пода и трубы держат сами
    // себя и свою мелочёвку. Пока группа целиком числилась ненесущей, дульный
    // срез пушки опирался на пустоту и держался допуском в 2.15 м.
    "weapons",
  ].includes(part.group)) {
    return true;
  }
  // КОЛЬЦО ГОНДОЛЫ — КОНСТРУКЦИЯ, А НЕ ОБЛИЦОВКА.
  //
  // Пока сегменты, воротники, стыковые планки и статорные стойки числились
  // ненесущими, внутри гондолы нельзя было опереться ни на что: силовой путь
  // обрывался сразу за корневым лонжероном. Отсюда и брались допуски в
  // полтора метра — единственный способ дотянуться из движителя до «настоящей»
  // конструкции. Теперь путь физический: лопасть → ступица → мотор →
  // статорные стойки → сегменты кольца → воротники → седло → лонжерон.
  // Мотор — несущий: на нём стоят статорные стойки, на его валу висит ступица
  // с коком. Без этого кок и метка оборотов опирались на воздух.
  return /-(ring-segment|ring-splice|collar-top|collar-bottom|motor-pylon|stator)-?\d*$/.test(part.id)
    || /-motor$/.test(part.id)
    || /-motor-cap$/.test(part.id)
    || /-hub-cap$/.test(part.id);
}

function primitive(
  placement: CombatHexacopterPlacement,
  part: ObjectLabPart,
  center: SceneVector3,
  size: SceneVector3,
  rotation: SceneVector3 | undefined,
  options: Partial<ScenePrimitiveDefinition> = {},
): SceneObjectDefinition {
  const binding = materialFor(part);
  const driveMember = liftEngineIndex(part) >= 0 || yawEngineIndex(part) >= 0;
  const driveSkin = driveMember && /(service|index|armour-panel)/.test(part.id);
  // ДОПУСК КРЕПЛЕНИЯ — ЭТО ДЛИНА БОЛТА, А НЕ РАЗРЕШЕНИЕ ВИСЕТЬ.
  //
  // Числа здесь стояли в 1.62 / 2.15 / 2.6 м при проектной норме 0.14…0.5, и
  // расплата пришла не на целой машине, а на разбитой. Решатель ищет опору в
  // пределах этого радиуса, поэтому накладка гондолы, у которой снесло и
  // обечайку, и обод, и мотор, дотягивалась до корневого лонжерона в полутора
  // метрах и оставалась «опёртой» — девять кусков висели в воздухе там, где
  // двигателя больше не было вовсе. Допуск закрывает СТЫК, а стык у накладки с
  // её же кольцом — сантиметры.
  // ЛОПАСТЬ ДЕРЖИТСЯ ТОЛЬКО СВОЕЙ СТУПИЦЕЙ.
  //
  // Она вращается и проносится мимо стенки тоннеля в считанных сантиметрах.
  // При обычном допуске эта близость читается решателем как опора, и лопасть
  // остаётся висеть в кольце после того, как её мотор уничтожен, — вращаясь
  // вокруг пустоты. Допуск ей нужен ровно на комель, где она и закреплена.
  const spinningBlade = driveMember && /-blade-\d+$/.test(part.id);
  const attachmentReach = spinningBlade
    ? 0.06
    : driveSkin
    ? 0.26
    : driveMember
      ? 0.34
      : part.group === "weapons"
        ? 0.5
        : part.group === "lighting" || part.group === "sensors"
          ? // Побрякушка держится ТОЛЬКО за своего носителя: фонарь за
            // пластину, шар за подвес, блистер за основание. Прежние 0.3–0.42
            // дотягивались до дальней структуры, и после гибели носителя
            // сенсор висел в полуметре от корпуса — тот же класс дефекта,
            // что был у накладок гондол.
            0.12
          : 0.42;
  return {
    kind: "primitive",
    id: objectId(part),
    material: binding.material,
    shape: options.shape ?? binding.shape,
    size,
    color: binding.color,
    transform: {
      position: combatHexacopterPoint(placement, center),
      rotation: placedEuler(placement, rotation),
    },
    contactBoxes: [{ position: [0, 0, 0], size }],
    // Вращающийся кусок не несёт на себе ничего: подставить ему что-либо
    // значит подставить это движущейся детали.
    carriesAttachments: !spinningBlade,
    attachmentSupportMode: "cable",
    // A duct is one bolted assembly: armour, stator pylons, motor, hub and
    // blade roots all transfer load through the gondola, even when their
    // compact collision proxies do not literally overlap. This reach closes
    // only that local joint; neighbouring ducts remain metres away.
    sideAttachmentReach: attachmentReach,
    maximumVerticalGap: part.group === "landing-gear" ? 0.1 : driveSkin ? 0.22 : driveMember ? 0.3 : part.group === "weapons" ? 0.32 : part.group === "lighting" || part.group === "sensors" ? 0.12 : 0.36,
    actuator: actuatorFor(part),
    light: lightFor(part),
    bearsLoad: loadBearing(part),
    ...options,
  } as ScenePrimitiveDefinition;
}

function meshObject(
  placement: CombatHexacopterPlacement,
  part: Extract<ObjectLabPart, { kind: "mesh" }>,
): SceneObjectDefinition {
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
  placement: CombatHexacopterPlacement,
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

export interface CombatHexacopterPrototypeDocument {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly groups: readonly SceneGroupDefinition[];
}

export function createCombatHexacopterPrototypeDocument(
  placement: CombatHexacopterPlacement,
): CombatHexacopterPrototypeDocument {
  const vehicleGroup: SceneGroupDefinition = {
    id: placement.clusterId.slice(`${placement.sceneId}:`.length),
    label: "RAX-8 Tonkawa prototype",
    material: "steel",
    supportMode: "linked",
    objects: combatHexacopterObject.parts.map((part) =>
      canonicalPart(placement, part),
    ),
  };
  return {
    schemaVersion: 1,
    id: placement.sceneId,
    groups: [vehicleGroup],
  };
}

export const combatHexacopterPrototypeDocument =
  createCombatHexacopterPrototypeDocument(
    COMBAT_HEXACOPTER_PROTOTYPE_PLACEMENT,
  );
