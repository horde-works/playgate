import type {
  AuthoredSceneDocument,
  SceneGroupDefinition,
  SceneObjectDefinition,
} from "./sceneContract.ts";
import { createDuctHexacopterDocument } from "./ductHexacopterPrototypeDocument.ts";
import { COMBAT_HEXACOPTER_RANGE_SCENE_ID } from "../../game/combatHexacopter.ts";
import {
  DUCT_HEXACOPTER_RANGE_DISPATCH_POINT,
  DUCT_HEXACOPTER_RANGE_PAD_RADIUS,
  DUCT_HEXACOPTER_RANGE_PAD_THICKNESS,
  DUCT_HEXACOPTER_RANGE_PAD_TOP_Y,
  DUCT_HEXACOPTER_RANGE_PAD_X,
  DUCT_HEXACOPTER_RANGE_PAD_Z,
  DUCT_HEXACOPTER_RANGE_PLACEMENT,
} from "../../game/rangeDuctHexacopter.ts";
import { RANGE_DECK_TOP_Y } from "../../game/rangeHexacopter.ts";

/**
 * Пад VX-8 «Yaqui» на полигоне Tonkawa — СВОЙ, а не перенесённый.
 *
 * Вертипад HX-6 попал на полигон чистой трансляцией городского документа,
 * потому что это ТА ЖЕ площадка, переехавшая целиком. У VX-8 такого прошлого
 * нет: машина рождена здесь, и её место собрано из идиомы самого полигона —
 * стальной настил, оранжевый акцент, пульт на трубе. Копировать под неё
 * городской вертипад значило бы притащить в мир чужую историю ради экономии
 * тридцати строк.
 *
 * ПАД И МАШИНА ЛЕЖАТ В ОДНОМ ДОКУМЕНТЕ НАМЕРЕННО. Решатель опор считает
 * связность в границах документа и падает на старте, если кусок ни на что не
 * опирается (`compileScene`, «starts with N unsupported pieces»). Разложи их
 * по двум документам — и опоры машины будут искать пад, которого в их
 * документе нет.
 */

const PAD_X = DUCT_HEXACOPTER_RANGE_PAD_X;
const PAD_Z = DUCT_HEXACOPTER_RANGE_PAD_Z;
const PAD_RADIUS = DUCT_HEXACOPTER_RANGE_PAD_RADIUS;
const PAD_TOP = DUCT_HEXACOPTER_RANGE_PAD_TOP_Y;
const RIM_SEGMENTS = 12;

/**
 * Акцентная кромка: двенадцать плашек по ободу. Они лежат НА настиле пада и
 * ничего не несут — это краска, у которой есть толщина.
 */
function rimSegment(index: number): SceneObjectDefinition {
  const angle = (index * Math.PI * 2) / RIM_SEGMENTS;
  const radius = PAD_RADIUS - 0.42;
  const chord = (2 * Math.PI * radius) / RIM_SEGMENTS - 0.18;
  return {
    kind: "primitive",
    id: `pad-rim-${index}`,
    material: "steel",
    shape: "steelSheet",
    size: [0.62, 0.05, chord],
    color: index % 2 === 0 ? "#d18436" : "#20252a",
    transform: {
      position: [
        PAD_X + Math.cos(angle) * radius,
        PAD_TOP + 0.025,
        PAD_Z + Math.sin(angle) * radius,
      ],
      rotation: [0, -angle, 0],
    },
    bearsLoad: false,
    attachmentSupportMode: "cable",
    sideAttachmentReach: 0.12,
    maximumVerticalGap: 0.12,
  };
}

/** Крест касания под осью машины — два ребра, видимых с воздуха. */
function touchdownBar(index: number): SceneObjectDefinition {
  const along = index === 0;
  return {
    kind: "primitive",
    id: `pad-touchdown-${index}`,
    material: "steel",
    shape: "steelSheet",
    size: along ? [0.34, 0.04, 6.4] : [6.4, 0.04, 0.34],
    color: "#c9ced2",
    transform: { position: [PAD_X, PAD_TOP + 0.02, PAD_Z] },
    bearsLoad: false,
    attachmentSupportMode: "cable",
    sideAttachmentReach: 0.12,
    maximumVerticalGap: 0.12,
  };
}

const [dispatchX, , dispatchZ] = DUCT_HEXACOPTER_RANGE_DISPATCH_POINT;

const padGroup: SceneGroupDefinition = {
  id: "duct-vertipad",
  label: "VX-8 Yaqui pad and launch station",
  material: "steel",
  supportMode: "stack",
  objects: [
    {
      kind: "primitive",
      id: "pad-deck",
      material: "steel",
      shape: "cylinder",
      size: [PAD_RADIUS * 2, DUCT_HEXACOPTER_RANGE_PAD_THICKNESS, PAD_RADIUS * 2],
      // Тот же голый металл, что и настил полигона: базовый цвет здесь — F0
      // отражения, а не диффузное альбедо, и тёмный номер утопил бы пад.
      color: "#aeb4b7",
      transform: {
        position: [PAD_X, RANGE_DECK_TOP_Y + DUCT_HEXACOPTER_RANGE_PAD_THICKNESS / 2, PAD_Z],
      },
      foundation: true,
      carriesAttachments: true,
      bearingArea: Math.PI * PAD_RADIUS * PAD_RADIUS,
    },
    ...Array.from({ length: RIM_SEGMENTS }, (_, index) => rimSegment(index)),
    touchdownBar(0),
    touchdownBar(1),
    {
      kind: "primitive",
      id: "post",
      material: "steel",
      shape: "cylinder",
      size: [0.14, 0.96, 0.14],
      color: "#282e31",
      transform: { position: [dispatchX, RANGE_DECK_TOP_Y + 0.48, dispatchZ] },
      foundation: true,
      carriesAttachments: true,
      attachmentSupportMode: "cable",
      sideAttachmentReach: 0.45,
      bearingArea: 0.4,
    },
    {
      kind: "primitive",
      id: "console",
      material: "steel",
      shape: "steelSheet",
      size: [0.62, 0.38, 0.2],
      color: "#202629",
      transform: { position: [dispatchX, RANGE_DECK_TOP_Y + 1.02, dispatchZ] },
      carriesAttachments: true,
      attachmentSupportMode: "cable",
      sideAttachmentReach: 0.36,
    },
    {
      kind: "primitive",
      id: "screen",
      material: "darkGlass",
      shape: "glassPane",
      size: [0.48, 0.25, 0.035],
      color: "#2bc5ad",
      transform: {
        position: [dispatchX - 0.12, RANGE_DECK_TOP_Y + 1.04, dispatchZ],
        rotation: [0, Math.PI / 2, 0],
      },
      bearsLoad: false,
      light: {
        color: "#54ffe2",
        distance: 5,
        intensity: 1.8,
        dayIntensityFactor: 0.72,
        poolPriority: 7,
      },
    },
  ],
};

const vehicleGroup = createDuctHexacopterDocument(
  DUCT_HEXACOPTER_RANGE_PLACEMENT,
  "VX-8 Yaqui",
).groups[0];

/**
 * Документ носит id полигона, потому что кластеры именуются `<id>:<группа>`, а
 * машина обязана оказаться в `combat-hexacopter-range:duct-vehicle` — ровно
 * там, где её ждёт паспорт берта.
 */
export const ductHexacopterRangePadDocument: AuthoredSceneDocument = {
  schemaVersion: 1,
  id: COMBAT_HEXACOPTER_RANGE_SCENE_ID,
  title: "Make a Mess: VX-8 Yaqui pad",
  environment: "town",
  world: {
    playerSpawn: [PAD_X, PAD_TOP + 1.3, PAD_Z + 9],
    playerSpawnYaw: 0,
    cameraFar: 380,
    center: [0, 0],
    halfExtents: [53, 53],
    radius: 50,
    boundaryRadius: 55,
    skyRadius: 150,
    safetyFloorY: -2,
  },
  copy: {
    status: "Make a Mess / Tonkawa range",
    eyebrow: "Autonomous rotorcraft trials",
    heading: "VX-8 Yaqui.",
    ready: "VX-8 pad ready",
    loading: "Preparing the pad…",
    description: "The VX-8 Yaqui pad on the Tonkawa range.",
    enter: "Enter the range",
    returnToGame: "Return to the range",
    reset: "Reset the range",
  },
  groups: [padGroup, vehicleGroup],
};
