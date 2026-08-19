/**
 * ГДЕ СТОИТ DC-3 НА ОСТРОВНОМ АЭРОПОРТЕ.
 *
 * Паспорт машины берт не выбирает. Здесь только место: начало полосы 09,
 * нос вдоль оси на взлёт, не у терминала и не на перроне.
 *
 * Полоса идёт запад–восток. Взлёт на восток начинается у западного порога.
 * Авторский нос объекта смотрит в +Z; поворот yaw даёт мировое направление
 * (sin yaw, 0, cos yaw). Нос на +X — это ровно π/2.
 *
 * Начало полосы — не порог и не огни. Огни порога стоят на
 * westThreshold + inset; цифры 09 — на westDesignatorX. Самолёт выстраивается
 * по цифрам: основные колёса на оси, хвост ещё на бетоне, нос смотрит в
 * восток. Крылья шире полосы — это тип, а не ошибка посадки.
 */

import { createDc3AirplaneGroup } from "../dc3AirplaneDocument.ts";
import {
  createDc3AirplaneFrame,
  dc3AirplanePoint,
  dc3AirplaneUnpoint,
  dc3AirplaneVector,
  type Dc3AirplanePlacement,
} from "../../../game/dc3Airplane.ts";
import { dc3AirframeSurface, dc3BlockoutObject } from "../../objects/aircraft/dc3BlockoutObject.ts";
import { DC3_WINGSPAN } from "../../objects/aircraft/dc3Dimensions.ts";
import type { SceneVector3 } from "../../../game/destructionScene.ts";
import type { MotionInstrumentDefinition } from "../../../game/motionTelemetry.ts";
import type { SceneGroupDefinition } from "../sceneContract.ts";
import {
  AIRPORT_RUNWAY,
  AIRPORT_RUNWAY_TOP_Y,
  AIRPORT_TERMINAL,
} from "./islandAirportPlan.ts";

export const ISLAND_AIRPORT_SCENE_ID = "island-airport";
export const ISLAND_AIRPORT_DC3_GROUP_ID = "dc3";

/** Object +Z → world +X. */
export const ISLAND_AIRPORT_DC3_YAW = Math.PI / 2;

export const ISLAND_AIRPORT_DC3_PLACEMENT: Dc3AirplanePlacement = {
  sceneId: ISLAND_AIRPORT_SCENE_ID,
  clusterId: `${ISLAND_AIRPORT_SCENE_ID}:${ISLAND_AIRPORT_DC3_GROUP_ID}`,
  position: [
    AIRPORT_RUNWAY.westDesignatorX,
    AIRPORT_RUNWAY_TOP_Y,
    AIRPORT_RUNWAY.centreZ,
  ],
  yaw: ISLAND_AIRPORT_DC3_YAW,
};

export const islandAirportDc3Group = createDc3AirplaneGroup(
  ISLAND_AIRPORT_DC3_PLACEMENT,
  "Douglas DC-3 on runway 09",
);

export const islandAirportDc3Frame = createDc3AirplaneFrame(
  ISLAND_AIRPORT_DC3_PLACEMENT,
);

/** Body point → resting world, same transform as the compiled pieces. */
export function islandAirportDc3RestingPoint(body: SceneVector3): SceneVector3 {
  return dc3AirplanePoint(
    ISLAND_AIRPORT_DC3_PLACEMENT,
    dc3AirframeSurface.bodyToWorld(body),
  );
}

/** Resting world → body. Used by the captain-seat occupation volume. */
export function islandAirportDc3BodyPoint(world: SceneVector3): SceneVector3 {
  return dc3AirframeSurface.worldToBody(
    dc3AirplaneUnpoint(ISLAND_AIRPORT_DC3_PLACEMENT, world),
  );
}

export const islandAirportDc3MotionInstruments: readonly MotionInstrumentDefinition[] = [
  {
    id: `${ISLAND_AIRPORT_DC3_PLACEMENT.clusterId}:flight-instruments`,
    sourceId: ISLAND_AIRPORT_DC3_PLACEMENT.clusterId,
    carrierClusterId: ISLAND_AIRPORT_DC3_PLACEMENT.clusterId,
    panelPieceId: `${ISLAND_AIRPORT_DC3_PLACEMENT.clusterId}:${dc3AirframeSurface.cockpit.panelId}:piece`,
    pitchMetricId: "pitch",
    rollMetricId: "roll",
    indicators: [
      {
        id: "ready",
        label: "READY",
        color: "#72f29a",
        condition: { kind: "phase", phases: ["docked", "attention"] },
      },
      {
        id: "taxi",
        label: "TAXI",
        color: "#ffd06d",
        condition: { kind: "phase", phases: ["taxi", "rollout"] },
      },
      {
        id: "departure",
        label: "DEPART",
        color: "#ffbf5f",
        condition: { kind: "phase", phases: ["departure"] },
      },
      {
        id: "cruise",
        label: "CRUISE",
        color: "#79d8ff",
        condition: { kind: "phase", phases: ["cruise", "inTransit"] },
      },
      {
        id: "failed",
        label: "FAIL",
        color: "#ff4d47",
        condition: { kind: "phase", phases: ["failed"] },
      },
      {
        id: "engine-left",
        label: "L ENG",
        color: "#f0f3d1",
        condition: {
          kind: "metric",
          metricId: "propellerRevolutions",
          valueIndex: 0,
          fullScale: 100,
        },
      },
      {
        id: "engine-right",
        label: "R ENG",
        color: "#f0f3d1",
        condition: {
          kind: "metric",
          metricId: "propellerRevolutions",
          valueIndex: 1,
          fullScale: 100,
        },
      },
    ],
  },
];

export const islandAirportDc3Nose = dc3AirplanePoint(
  ISLAND_AIRPORT_DC3_PLACEMENT,
  dc3BlockoutObject.anchors.nose,
);

export const islandAirportDc3Tail = dc3AirplanePoint(
  ISLAND_AIRPORT_DC3_PLACEMENT,
  dc3BlockoutObject.anchors.tail,
);

export const islandAirportDc3Heading = dc3AirplaneVector(
  ISLAND_AIRPORT_DC3_PLACEMENT,
  [0, 0, 1],
);

export const ISLAND_AIRPORT_TERMINAL_ORIGIN = AIRPORT_TERMINAL.origin;

/**
 * КОМАНДНЫЙ ПУНКТ: ОТКУДА МАШИНУ ОТПРАВЛЯЮТ В РЕЙС.
 *
 * Стоит на траве СЕВЕРНЕЕ полосы, напротив стоянки машины — не на бетоне,
 * иначе разбег прошёл бы сквозь человека, и не у терминала, откуда полосу не
 * видно. Отступ от кромки: полуширина полосы плюс размах консоли, чтобы
 * крыло прошло мимо стоящего, а не сквозь него.
 */
export const ISLAND_AIRPORT_DC3_COMMAND_POST: SceneVector3 = [
  AIRPORT_RUNWAY.westDesignatorX,
  AIRPORT_RUNWAY_TOP_Y,
  AIRPORT_RUNWAY.centreZ + AIRPORT_RUNWAY.width / 2 + DC3_WINGSPAN / 2 + 2,
];

/**
 * ТАБЛИЧКА ЗАПУСКА — ТА ЖЕ, ЧТО У ГЕКСАКОПТЕРОВ НА ИХ ПЛОЩАДКАХ.
 *
 * Три куска: стальная стойка, щит и светящееся стекло. Отличие от вертипада
 * только в выносе: там пункт держали в 4.1 м от центра, чтобы он не стал
 * боковой опорой кормового кольца, здесь запас берётся от размаха — консоль
 * DC-3 уходит на 14.5 м, и табличка стоит за её концом. Между реквизитом и
 * любым куском корабля обязано быть больше самого длинного
 * `sideAttachmentReach` машины (0.55 м), иначе снос одного куска оставит
 * корабль висеть на причальном столбике.
 */
const COMMAND_POST_GROUND_Y = 0;
const COMMAND_POST_ACCENT = "#6bd6ff";

export const islandAirportDc3CommandPostGroup: SceneGroupDefinition = {
  id: "dc3-command-post",
  label: "Runway 09 dispatch post",
  material: "steel",
  supportMode: "linked",
  objects: [
    {
      kind: "primitive",
      id: "dispatch:post",
      material: "steel",
      shape: "cylinder",
      size: [0.1, 1.0, 0.1],
      color: "#3d4245",
      transform: {
        position: [
          ISLAND_AIRPORT_DC3_COMMAND_POST[0],
          COMMAND_POST_GROUND_Y + 0.5,
          ISLAND_AIRPORT_DC3_COMMAND_POST[2],
        ],
      },
      contactBoxes: [{ position: [0, 0, 0], size: [0.14, 1.0, 0.14] }],
      carriesAttachments: true,
      attachmentSupportMode: "cable",
      sideAttachmentReach: 0.3,
      bearingArea: 0.5,
    },
    {
      kind: "primitive",
      id: "dispatch:board",
      material: "steel",
      shape: "steelSheet",
      size: [0.46, 0.05, 0.34],
      color: "#22262a",
      transform: {
        position: [
          ISLAND_AIRPORT_DC3_COMMAND_POST[0],
          COMMAND_POST_GROUND_Y + 1.02,
          ISLAND_AIRPORT_DC3_COMMAND_POST[2],
        ],
        // Щит стоит вертикально и смотрит на полосу: тонкая ось плиты
        // разворачивается из вертикали в поперечную.
        rotation: [Math.PI / 2, 0, 0],
      },
      contactBoxes: [{ position: [0, 0, 0], size: [0.5, 0.38, 0.09] }],
      bearsLoad: false,
      carriesAttachments: true,
      attachmentSupportMode: "cable",
      sideAttachmentReach: 0.25,
    },
    {
      kind: "primitive",
      id: "dispatch:screen",
      material: "glass",
      shape: "glassPane",
      size: [0.36, 0.03, 0.24],
      color: "#0e3a45",
      transform: {
        position: [
          ISLAND_AIRPORT_DC3_COMMAND_POST[0],
          COMMAND_POST_GROUND_Y + 1.02,
          ISLAND_AIRPORT_DC3_COMMAND_POST[2] - 0.05,
        ],
        rotation: [Math.PI / 2, 0, 0],
      },
      contactBoxes: [{ position: [0, 0, 0], size: [0.4, 0.28, 0.06] }],
      bearsLoad: false,
      sideAttachmentReach: 0.2,
      light: {
        color: COMMAND_POST_ACCENT,
        distance: 6,
        intensity: 1.6,
        dayIntensityFactor: 0.7,
        poolPriority: 5,
      },
    },
  ],
};
