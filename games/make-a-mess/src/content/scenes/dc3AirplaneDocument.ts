/**
 * DC-3 — the accepted Object Lab compiled into scene pieces.
 *
 * Twin of `ductHexacopterPrototypeDocument.ts`: the caller passes a
 * placement, this file does not choose a berth. World registration stays
 * with the session that owns the hold.
 */

import { Euler, Quaternion, Vector3 } from "three";
import {
  DC3_LANDING_LIGHT_LEVELS,
  dc3BlockoutObject,
} from "../objects/aircraft/dc3BlockoutObject.ts";
import { dc3AirframeParts } from "../objects/aircraft/dc3AirframeParts.ts";
import type {
  ObjectLabPart,
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
  SceneVector3,
  SurfaceTextureProfile,
} from "../../game/destructionScene.ts";
import {
  dc3ActuatorFor,
  dc3AirplanePoint,
  type Dc3AirplanePlacement,
} from "../../game/dc3Airplane.ts";

type MaterialBinding = {
  readonly material: BreakableMaterial;
  readonly shape: BreakableShape;
  readonly color: string;
  readonly shellThickness: number;
  readonly textureProfile?: SurfaceTextureProfile;
};

const point = (value: ObjectPoint): SceneVector3 => [value[0], value[1], value[2]];

function materialFor(part: ObjectLabPart): MaterialBinding {
  if (part.group === "gear" && /wheel$/.test(part.id)) {
    return { material: "wood", shape: "panel", color: "#2a2c2d", shellThickness: 0.04 };
  }
  // САЛОН. Пол и кресла — не обшивка планера: клёпаный алюминий на них
  // читался бы жестью. Кольца салона остаются сталью, но красятся цветом
  // интерьера, потому что пока это и есть видимый интерьер.
  // ОСТЕКЛЕНИЕ ИЛЛЮМИНАТОРА — НАСТОЯЩЕЕ СТЕКЛО В НАСТОЯЩЕМ ПРОЁМЕ.
  //
  // Проём вырезан в обшивке полосами вокруг него, а не нарисован: стекло
  // стоит В дырке, утопленное на толщину обшивки, и сквозь него видно салон.
  // ТОН СТЕКЛА — НЕ НЕБЕСНЫЙ.
  //
  // На снимках этого типа иллюминаторы читаются почти чёрными с лёгким
  // нейтрально-зеленоватым отливом. Это не цвет самого стекла: так работает
  // тёмный салон за ним плюс косые блики снаружи. Небесно-голубой оттенок,
  // стоявший здесь сначала, делал борт похожим на автобус.
  if (part.group === "window-glazing") {
    return { material: "glass", shape: "glassPane", color: "#2f3634", shellThickness: 0.01 };
  }
  // Обвязка — голый дюраль, лишь на тон темнее обшивки. На фотографиях рамы
  // почти не выделяются: они не крашены и не анодированы в чёрный.
  if (part.group === "window-frame") {
    // Обвязка тоже клёпаная: это тот же дюраль, только на тон темнее.
    return {
      material: "aluminium",
      shape: "steelSheet",
      color: "#8a8e8c",
      shellThickness: 0.012,
      textureProfile: "alclad-riveted",
    };
  }
  // БАКИ ЦЕНТРОПЛАНА — ТОПЛИВО, А НЕ СТАЛЬ.
  //
  // Пока они считались сталью (плотность 3.6), два бака весили 11 единиц —
  // четверть машины, и разбег вырос до 182 м. Бак это тонкая алюминиевая
  // ёмкость с керосином; средняя плотность ближе к дереву, чем к прокату.
  if (part.group === "centre-tanks") {
    return { material: "wood", shape: "panel", color: "#6c6f63", shellThickness: 0.02 };
  }
  if (part.group === "cabin-floor") {
    return { material: "wood", shape: "panel", color: "#4a4038", shellThickness: 0.05 };
  }
  if (part.group === "cabin-seats") {
    return { material: "cloth", shape: "panel", color: "#4d5a63", shellThickness: 0.06 };
  }
  // НАКЛАДКА ВХОДА. Створка, уплотнение и гермообвод — тот же дюраль, что
  // обшивка: смотрим, читается ли форма без цветового контраста. Тёмным
  // остаётся только остекление в створке.
  if (part.group === "cabin-entry-overlay") {
    if (part.id.endsWith(":board:1")) {
      return { material: "wood", shape: "panel", color: "#1c201e", shellThickness: 0.008 };
    }
    return {
      material: "aluminium",
      shape: "steelSheet",
      color: "#c9ccc6",
      shellThickness: 0.012,
      textureProfile: "alclad-riveted",
    };
  }
  if (part.id.startsWith("cabin-lamp-") && part.id.endsWith("-shade")) {
    return { material: "aluminium", shape: "panel", color: "#7a6f5d", shellThickness: 0.02 };
  }
  if (part.material === "lamp-glass") {
    // Прозрачный колпак: иначе лампа внутри не видна, как алюминиевая банка.
    return { material: "glass", shape: "glassPane", color: "#b9c7c8", shellThickness: 0.008 };
  }
  if (part.material === "lamp-bulb" || (part.id.startsWith("cabin-lamp-") && part.id.endsWith("-bulb"))) {
    if (part.id.includes("nav-light-port")) {
      return { material: "glass", shape: "glassPane", color: "#f08a80", shellThickness: 0.01 };
    }
    if (part.id.includes("nav-light-starboard")) {
      return { material: "glass", shape: "glassPane", color: "#7fd0a0", shellThickness: 0.01 };
    }
    if (part.id.includes("nav-light-tail")) {
      return { material: "glass", shape: "glassPane", color: "#f4f1e2", shellThickness: 0.01 };
    }
    return { material: "glass", shape: "panel", color: "#f4e4c4", shellThickness: 0.01 };
  }
  if (part.group === "cabin-trim") {
    return { material: "cloth", shape: "panel", color: "#7a6f5d", shellThickness: 0.02 };
  }
  // Крепёж стойки — узлы навески, барабаны и диски. Цветом отделены от самой
  // стойки нарочно: на машине это литьё и обработанный металл, а не труба.
  if (part.group === "gear-fittings") {
    return { material: "steel", shape: "panel", color: "#7d6a4f", shellThickness: 0.05 };
  }
  if (part.group === "cabin-frame") {
    return { material: "steel", shape: "panel", color: "#8d9a8e", shellThickness: 0.04 };
  }
  if (part.group.startsWith("structure-")) {
    return { material: "steel", shape: "panel", color: "#5c6164", shellThickness: 0.04 };
  }
  if (part.material === "metal" && part.group.startsWith("engine-")) {
    return { material: "steel", shape: "steelSheet", color: "#5c6164", shellThickness: 0.012 };
  }
  // Наружная обшивка. Профиль рисует швы, ряды заклёпок и разнотон панелей по
  // измеренному закону (docs/dc-3/skin-seam-passport-p01.md); внутренний
  // набор и мотогондолы остаются сталью и его не получают.
  return {
    material: "aluminium",
    shape: "steelSheet",
    color: "#c9ccc6",
    shellThickness: 0.012,
    textureProfile: "alclad-riveted",
  };
}

function placedEuler(
  placement: Dc3AirplanePlacement,
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

function cabinEntryPlugHinge(part: ObjectLabPart): ScenePrimitiveDefinition["hinge"] {
  const match = /^cabin-entry-(left|right)-(?:forward|aft):board:\d+$/.exec(part.id);
  if (!match) {
    return undefined;
  }
  const outward = match[1] === "right" ? 1 : -1;
  return {
    pivot: [0, 0, 0],
    // Body +Z is the nose. Plug-slide ignores direction and uses up × normal,
    // but the authored basis still points at the tail.
    direction: [0, 0, -1],
    normal: [outward, 0, 0],
  };
}

function loadBearing(part: ObjectLabPart): boolean {
  if (part.group.startsWith("propeller-")) return false;
  if (part.material === "lamp-glass" || part.material === "lamp-bulb" || part.id.endsWith("-bulb")) {
    return false;
  }
  if (
    part.group.startsWith("flap-") ||
    part.group.startsWith("aileron-") ||
    part.group.startsWith("elevator-") ||
    part.group === "rudder"
  ) {
    return false;
  }
  if (part.group === "cabin-entry-overlay") return false;
  return true;
}

function primitive(
  placement: Dc3AirplanePlacement,
  part: ObjectLabPart,
  center: SceneVector3,
  size: SceneVector3,
  rotation: SceneVector3 | undefined,
  options: Partial<ScenePrimitiveDefinition> = {},
): SceneObjectDefinition {
  const binding = materialFor(part);
  const spinning = part.group.startsWith("propeller-");
  const surface =
    part.group.startsWith("flap-") ||
    part.group.startsWith("aileron-") ||
    part.group.startsWith("elevator-") ||
    part.group === "rudder";
  const overlay = part.group === "cabin-entry-overlay";
  const gear = part.group === "gear";
  const mount = part.group === "structure-mount";
  return {
    kind: "primitive",
    id: part.id,
    material: binding.material,
    shape: options.shape ?? binding.shape,
    size,
    color: binding.color,
    textureProfile: binding.textureProfile,
    transform: {
      position: dc3AirplanePoint(placement, center),
      rotation: placedEuler(placement, rotation),
    },
    contactBoxes: [{ position: [0, 0, 0], size }],
    carriesAttachments: !spinning && !surface && !overlay,
    attachmentSupportMode: "cable",
    // Blades and the tailwheel sit far from the box they hang on: the blade
    // AABB centre is mid-span, the tailwheel is a short axle. Reach is the
    // bolt length to that carrier, not permission to hang on the runway.
    sideAttachmentReach: spinning
      ? 0.55
      : surface
        ? 0.08
        : gear
          ? 0.45
          : mount
            ? 0.55
            : part.id.startsWith("cabin-lamp-")
              ? 0.28
              : 0.4,
    maximumVerticalGap: gear ? 0.16 : 0.12,
    // СВЕТ КУСКА ДОХОДИТ ДО СЦЕНЫ.
    //
    // Поле `light` у куска объекта было, а проводки не было: документ его не
    // проносил вовсе, поэтому ни фары, ни АНО, ни плафоны салона физически не
    // могли зажечься. `followsGroup` обязателен — машина летает, и источник
    // должен ехать с ней, а не остаться висеть над полосой.
    light: part.light
      ? {
          followsGroup: true,
          ...part.light,
          // Посадочная фара привязана к СТАДИИ РЕЙСА, а не к времени суток:
          // она зажигается на взлёте и заходе и гаснет на стоянке. Кластер
          // знает только размещение, поэтому связка живёт здесь.
          ...(part.id.startsWith("landing-light-")
            ? {
                eventLighting: {
                  sourceClusterId: placement.clusterId,
                  levels: DC3_LANDING_LIGHT_LEVELS,
                },
              }
            : {}),
        }
      : undefined,
    actuator: dc3ActuatorFor(part),
    // Cabin entries are player plug-slide doors. Control surfaces stay
    // ordinary members: the automaton owns those angles, not this field.
    hinge: cabinEntryPlugHinge(part),
    bearsLoad: part.id === "gear-tail-wheel"
      || part.material === "lamp-bulb"
      || part.material === "lamp-glass"
      ? false
      : loadBearing(part),
    ...options,
  } as ScenePrimitiveDefinition;
}

function meshObject(
  placement: Dc3AirplanePlacement,
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
      // World renderer treats undefined as DoubleSide. Closed skins must be
      // FrontSide or the cowl lining and the teardrop interior z-fight.
      doubleSided: part.doubleSided === true,
    },
    plateThickness: part.plateThickness,
    voxelization: { mode: "shell", thickness: binding.shellThickness, voxelSize: 0.11 },
    volume: part.volume ?? Math.max(0.0002, area * binding.shellThickness),
  });
}

function canonicalPart(
  placement: Dc3AirplanePlacement,
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
    bearingArea: part.group === "gear" || part.group === "structure-mount"
      ? Math.max(0.08, size[0] * length)
      : undefined,
    ...(part.id === "gear-tail-wheel"
      ? {
          // Three-point sit: the tyre rests on the slab. Local Y is the axle,
          // so piece.size[1] is 12 cm and the solver would otherwise see the
          // wheel floating. The contact box is the wheel disc — bottom on the
          // runway, not a column the cage can hang from.
          contactBoxes: [{ position: [0, 0, 0], size: [0.32, 0.32, 0.32] }],
          maximumVerticalGap: 0.16,
          bearsLoad: false,
        }
      : {}),
  });
}

export function createDc3AirplaneGroup(
  placement: Dc3AirplanePlacement,
  label = "Douglas DC-3",
): SceneGroupDefinition {
  return {
    id: placement.clusterId.slice(`${placement.sceneId}:`.length),
    label,
    material: "aluminium",
    supportMode: "linked",
    objects: dc3AirframeParts().map((part) => canonicalPart(placement, part)),
  };
}
