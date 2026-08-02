import type { SceneVector3 } from "../../../game/destructionScene.ts";
import type { NimbusMutableGroup } from "./nimbusAuthoring.ts";
import {
  nimbusGradeContactBox,
  nimbusGroundSeatBox,
  nimbusNoise,
  nimbusOrient,
  nimbusPrimitive,
  nimbusRod,
} from "./nimbusAuthoring.ts";
import {
  NIMBUS_FLIGHT_FIELD_ALONG,
  NIMBUS_FLIGHT_FIELD_CENTRE,
  NIMBUS_FLIGHT_FIELD_OUTWARD,
  NIMBUS_INDUSTRIAL_FOOTPRINTS,
  NIMBUS_SPINDLE_TOWER_CENTRE,
  NIMBUS_TOWER_CENTRE,
  NIMBUS_VERTICAL_DOCK_CENTRE,
  nimbusGroundUnder,
  nimbusPointOnShipyard,
} from "./nimbusShell.ts";
import {
  NIMBUS_DOCK_ACROSS,
  NIMBUS_DOCK_FORWARD,
} from "./nimbusVerticalDock.ts";

export const NIMBUS_FLIGHT_FIELD_HALF_LENGTH = 55;
export const NIMBUS_FLIGHT_FIELD_HALF_WIDTH = 25;
export const NIMBUS_FLIGHT_FIELD_TILE = 10;

const CAMPUS_ROTATION = nimbusOrient(
  [NIMBUS_FLIGHT_FIELD_ALONG[0], 0, NIMBUS_FLIGHT_FIELD_ALONG[1]],
  [0, 1, 0],
);
const UP: SceneVector3 = [0, 1, 0];
const CONCRETE = "#818681";
const CONCRETE_DARK = "#646b69";
const STEEL_DARK = "#29383d";
const STEEL_MID = "#506168";
const STEEL_LIGHT = "#89989a";
const CERAMIC = "#d6dcd8";
const CERAMIC_WARM = "#bec7c2";
const GLASS = "#173743";
const SAFETY_ORANGE = "#d96e32";
const FLIGHT_BLUE = "#55b9c8";

export const NIMBUS_INDUSTRIAL_BUILDING_IDS = [
  "assembly-hall",
  "composites-hall",
  "machine-shop",
  "energy-plant",
] as const;

export const NIMBUS_HEX_PAD_IDS = [
  "production-assembly",
  "production-composites",
  "production-machine",
  "production-energy",
  "shipyard-west",
  "shipyard-centre",
  "shipyard-east",
  "office-rim",
  "office-spindle",
  "dock-service",
  "dock-habitation",
] as const;

interface NimbusIndustrialCampusGroups {
  readonly flightFoundation: NimbusMutableGroup;
  readonly flightSurface: NimbusMutableGroup;
  readonly industrialFoundation: NimbusMutableGroup;
  readonly industrialPrimary: NimbusMutableGroup;
  readonly industrialShell: NimbusMutableGroup;
  readonly industrialEquipment: NimbusMutableGroup;
  readonly hardscape: NimbusMutableGroup;
  readonly rails: NimbusMutableGroup;
  readonly cargoCranes: NimbusMutableGroup;
  readonly flightPads: NimbusMutableGroup;
}

interface BuildingDefinition {
  readonly id: typeof NIMBUS_INDUSTRIAL_BUILDING_IDS[number];
  readonly along: number;
  readonly outward: number;
  readonly length: number;
  readonly width: number;
  readonly height: number;
  readonly bays: number;
  readonly roof: "pitched" | "shed" | "monitor" | "flat";
  readonly doorWidth: number;
  readonly doorHeight: number;
}

const BUILDINGS: readonly BuildingDefinition[] = [
  {
    ...NIMBUS_INDUSTRIAL_FOOTPRINTS[0],
    height: 24,
    bays: 6,
    roof: "pitched",
    doorWidth: 18,
    doorHeight: 15,
  },
  {
    ...NIMBUS_INDUSTRIAL_FOOTPRINTS[1],
    height: 14,
    bays: 6,
    roof: "shed",
    doorWidth: 12,
    doorHeight: 8,
  },
  {
    ...NIMBUS_INDUSTRIAL_FOOTPRINTS[2],
    height: 18,
    bays: 5,
    roof: "monitor",
    doorWidth: 12,
    doorHeight: 10,
  },
  {
    ...NIMBUS_INDUSTRIAL_FOOTPRINTS[3],
    height: 16,
    bays: 4,
    roof: "flat",
    doorWidth: 8,
    doorHeight: 7,
  },
] as const;

function campusPoint(
  along: number,
  outward: number,
  y: number,
): SceneVector3 {
  return [
    NIMBUS_FLIGHT_FIELD_CENTRE[0]
      + NIMBUS_FLIGHT_FIELD_ALONG[0] * along
      + NIMBUS_FLIGHT_FIELD_OUTWARD[0] * outward,
    y,
    NIMBUS_FLIGHT_FIELD_CENTRE[1]
      + NIMBUS_FLIGHT_FIELD_ALONG[1] * along
      + NIMBUS_FLIGHT_FIELD_OUTWARD[1] * outward,
  ];
}

function dockPoint(
  across: number,
  forward: number,
  y: number,
): SceneVector3 {
  return [
    NIMBUS_VERTICAL_DOCK_CENTRE[0]
      + NIMBUS_DOCK_ACROSS[0] * across
      + NIMBUS_DOCK_FORWARD[0] * forward,
    y,
    NIMBUS_VERTICAL_DOCK_CENTRE[1]
      + NIMBUS_DOCK_ACROSS[1] * across
      + NIMBUS_DOCK_FORWARD[1] * forward,
  ];
}

function flightFieldDatum(): number {
  let datum = Number.NEGATIVE_INFINITY;
  for (
    let along = -NIMBUS_FLIGHT_FIELD_HALF_LENGTH + 5;
    along <= NIMBUS_FLIGHT_FIELD_HALF_LENGTH - 5;
    along += NIMBUS_FLIGHT_FIELD_TILE
  ) {
    for (
      let outward = -NIMBUS_FLIGHT_FIELD_HALF_WIDTH + 5;
      outward <= NIMBUS_FLIGHT_FIELD_HALF_WIDTH - 5;
      outward += NIMBUS_FLIGHT_FIELD_TILE
    ) {
      const point = campusPoint(along, outward, 0);
      datum = Math.max(datum, nimbusGroundUnder(point[0], point[2]).top);
    }
  }
  return datum + 0.55;
}

export const NIMBUS_FLIGHT_FIELD_DATUM = flightFieldDatum();

function createFlightField(
  foundation: NimbusMutableGroup,
  surface: NimbusMutableGroup,
): void {
  for (
    let along = -NIMBUS_FLIGHT_FIELD_HALF_LENGTH + 5;
    along <= NIMBUS_FLIGHT_FIELD_HALF_LENGTH - 5;
    along += NIMBUS_FLIGHT_FIELD_TILE
  ) {
    for (
      let outward = -NIMBUS_FLIGHT_FIELD_HALF_WIDTH + 5;
      outward <= NIMBUS_FLIGHT_FIELD_HALF_WIDTH - 5;
      outward += NIMBUS_FLIGHT_FIELD_TILE
    ) {
      const horizontal = campusPoint(along, outward, 0);
      const ground = nimbusGroundUnder(horizontal[0], horizontal[2]).top;
      const foundationTop = NIMBUS_FLIGHT_FIELD_DATUM;
      const foundationBottom = ground - 0.35;
      const height = foundationTop - foundationBottom;
      const centre: SceneVector3 = [
        horizontal[0],
        foundationBottom + height / 2,
        horizontal[2],
      ];
      const size: SceneVector3 = [
        NIMBUS_FLIGHT_FIELD_TILE,
        height,
        NIMBUS_FLIGHT_FIELD_TILE,
      ];
      nimbusPrimitive(
        foundation,
        `field-block:${along}:${outward}`,
        "concrete",
        "cinderBlock",
        centre,
        size,
        (along + outward) % 30 === 0 ? CONCRETE_DARK : CONCRETE,
        {
          rotation: CAMPUS_ROTATION,
          textureProfile: "nimbus-board-formed-concrete",
          contactBoxes: [nimbusGroundSeatBox(centre[1], size, ground)],
          contactBearingOrder: true,
          bearingArea: 180,
        },
      );
      const heavy = Math.abs(along) < 17 && Math.abs(outward) < 16;
      nimbusPrimitive(
        surface,
        `field-deck:${along}:${outward}`,
        heavy ? "steel" : "concrete",
        "groundTile",
        [horizontal[0], foundationTop + 0.11, horizontal[2]],
        [
          NIMBUS_FLIGHT_FIELD_TILE,
          0.22,
          NIMBUS_FLIGHT_FIELD_TILE,
        ],
        heavy
          ? nimbusNoise(along, outward, 201) > 0.5 ? "#515e62" : "#445258"
          : nimbusNoise(along, outward, 202) > 0.5 ? "#979b96" : "#878d88",
        {
          rotation: CAMPUS_ROTATION,
          textureProfile: heavy
            ? "nimbus-technical-deck"
            : "nimbus-board-formed-concrete",
          contactBearingOrder: true,
          attachmentSupportMode: "cable",
          sideAttachmentReach: 0.45,
        },
      );
    }
  }

  // Two recessed guidance loops are real serviceable light channels rather
  // than painted circles. The uninterrupted centre remains the heavy berth.
  for (const touchdownAlong of [-27, 27]) {
    const radius = 12;
    const segments = 16;
    for (let segment = 0; segment < segments; segment += 1) {
      const angleA = segment / segments * Math.PI * 2;
      const angleB = (segment + 1) / segments * Math.PI * 2;
      nimbusRod(
        surface,
        `guidance:${touchdownAlong}:${segment}`,
        "plastic",
        campusPoint(
          touchdownAlong + Math.cos(angleA) * radius,
          Math.sin(angleA) * radius,
          NIMBUS_FLIGHT_FIELD_DATUM + 0.25,
        ),
        campusPoint(
          touchdownAlong + Math.cos(angleB) * radius,
          Math.sin(angleB) * radius,
          NIMBUS_FLIGHT_FIELD_DATUM + 0.25,
        ),
        0.2,
        segment % 4 === 0 ? SAFETY_ORANGE : FLIGHT_BLUE,
        {
          attachmentSupportMode: "cable",
          sideAttachmentReach: 0.45,
          bearsLoad: false,
          volume: 0.08,
        },
      );
    }
  }
}

function buildingGroundDatum(building: BuildingDefinition): number {
  let top = Number.NEGATIVE_INFINITY;
  for (let bay = 0; bay <= building.bays; bay += 1) {
    const along = building.along - building.length / 2
      + building.length * bay / building.bays;
    for (const side of [-1, 1]) {
      const point = campusPoint(
        along,
        building.outward + side * building.width / 2,
        0,
      );
      top = Math.max(top, nimbusGroundUnder(point[0], point[2]).top);
    }
  }
  return top + 0.55;
}

function addRoofPanel(
  shell: NimbusMutableGroup,
  id: string,
  along: number,
  outward: number,
  y: number,
  length: number,
  slopeLength: number,
  normal: SceneVector3,
  color: string,
): void {
  nimbusPrimitive(
    shell,
    id,
    "steel",
    "panel",
    campusPoint(along, outward, y),
    [length, 0.24, slopeLength],
    color,
    {
      rotation: nimbusOrient(
        [NIMBUS_FLIGHT_FIELD_ALONG[0], 0, NIMBUS_FLIGHT_FIELD_ALONG[1]],
        normal,
      ),
      textureProfile: "nimbus-carbon-laminate",
      bearsLoad: false,
      attachmentSupportMode: "cable",
      sideAttachmentReach: 0.9,
      volume: length * slopeLength * 0.06,
    },
  );
}

function createIndustrialBuilding(
  groups: NimbusIndustrialCampusGroups,
  building: BuildingDefinition,
): void {
  const baseY = buildingGroundDatum(building);
  const eaveY = baseY + building.height;
  const bayLength = building.length / building.bays;
  const bayStations = Array.from(
    { length: building.bays + 1 },
    (_, bay) => building.along - building.length / 2 + bay * bayLength,
  );

  for (const [bay, along] of bayStations.entries()) {
    for (const side of [-1, 1]) {
      const outward = building.outward + side * building.width / 2;
      const horizontal = campusPoint(along, outward, 0);
      const ground = nimbusGroundUnder(horizontal[0], horizontal[2]).top;
      const bottom = ground - 5.5;
      const height = baseY - bottom;
      const foundationCentre: SceneVector3 = [
        horizontal[0],
        bottom + height / 2,
        horizontal[2],
      ];
      nimbusPrimitive(
        groups.industrialFoundation,
        `${building.id}:caisson:${bay}:${side}`,
        "concrete",
        "cinderBlock",
        foundationCentre,
        [1.9, height, 1.9],
        bay % 2 === 0 ? CONCRETE_DARK : CONCRETE,
        {
          rotation: CAMPUS_ROTATION,
          textureProfile: "nimbus-board-formed-concrete",
          contactBoxes: [nimbusGradeContactBox(
            foundationCentre[1],
            [0.55, 0.55],
            ground - 0.24,
          )],
          contactBearingOrder: true,
          bearingArea: 850,
        },
      );
      nimbusPrimitive(
        groups.industrialPrimary,
        `${building.id}:column:${bay}:${side}`,
        "steel",
        "steelSheet",
        campusPoint(
          along,
          outward,
          baseY + building.height / 2,
        ),
        [1.15, building.height, 1.15],
        bay % 3 === 0 ? STEEL_LIGHT : STEEL_MID,
        {
          rotation: CAMPUS_ROTATION,
          textureProfile: "painted-steel",
          bearingArea: 320,
          carriesAttachments: true,
        },
      );
    }

    const left = campusPoint(
      along,
      building.outward - building.width / 2,
      eaveY,
    );
    const right = campusPoint(
      along,
      building.outward + building.width / 2,
      eaveY,
    );
    nimbusRod(
      groups.industrialPrimary,
      `${building.id}:roof-truss:${bay}`,
      "steel",
      left,
      right,
      0.58,
      bay % 2 === 0 ? STEEL_LIGHT : STEEL_MID,
      {
        textureProfile: "painted-steel",
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.78,
        carriesAttachments: true,
        bearingArea: 140,
      },
    );
    if (building.roof === "pitched") {
      const ridge = campusPoint(along, building.outward, eaveY + 4.2);
      for (const [side, eave] of [[-1, left], [1, right]] as const) {
        nimbusRod(
          groups.industrialPrimary,
          `${building.id}:pitched-truss:${bay}:${side}`,
          "steel",
          eave,
          ridge,
          0.42,
          side < 0 ? STEEL_DARK : STEEL_LIGHT,
          {
            textureProfile: "painted-steel",
            attachmentSupportMode: "cable",
            sideAttachmentReach: 0.72,
            carriesAttachments: true,
            bearingArea: 95,
          },
        );
      }
    } else if (building.roof === "monitor") {
      for (const side of [-1, 1]) {
        const monitorAcross = building.outward + side * building.width * 0.12;
        nimbusRod(
          groups.industrialPrimary,
          `${building.id}:monitor-post:${bay}:${side}`,
          "steel",
          campusPoint(along, monitorAcross, eaveY),
          campusPoint(along, monitorAcross, eaveY + 3.1),
          0.38,
          side < 0 ? STEEL_MID : STEEL_LIGHT,
          {
            textureProfile: "painted-steel",
            attachmentSupportMode: "cable",
            sideAttachmentReach: 0.75,
            carriesAttachments: true,
          },
        );
      }
    }
  }

  for (let bay = 0; bay < building.bays; bay += 1) {
    const along = building.along - building.length / 2
      + (bay + 0.5) * bayLength;
    for (const side of [-1, 1]) {
      const outward = building.outward + side * building.width / 2;
      nimbusRod(
        groups.industrialPrimary,
        `${building.id}:eave:${bay}:${side}`,
        "steel",
        campusPoint(along - bayLength / 2, outward, eaveY),
        campusPoint(along + bayLength / 2, outward, eaveY),
        0.46,
        side > 0 ? STEEL_LIGHT : STEEL_DARK,
        {
          textureProfile: "painted-steel",
          attachmentSupportMode: "cable",
          sideAttachmentReach: 0.7,
          carriesAttachments: true,
          bearingArea: 90,
        },
      );

      const doorBay = side > 0 && Math.abs(along - building.along)
        < building.doorWidth / 2;
      const glazed = building.id === "composites-hall"
        && side > 0
        && !doorBay
        && bay % 2 === 0;
      if (doorBay) {
        const lintelHeight = building.height - building.doorHeight;
        nimbusPrimitive(
          groups.industrialShell,
          `${building.id}:wall:${bay}:${side}:lintel`,
          "plastic",
          "panel",
          campusPoint(
            along,
            outward,
            baseY + building.doorHeight + lintelHeight / 2,
          ),
          [bayLength, lintelHeight, 0.22],
          CERAMIC_WARM,
          {
            rotation: CAMPUS_ROTATION,
            textureProfile: "nimbus-ceramic-composite",
            bearsLoad: false,
            attachmentSupportMode: "cable",
            sideAttachmentReach: 0.9,
          },
        );
      } else {
        nimbusPrimitive(
          groups.industrialShell,
          `${building.id}:wall:${bay}:${side}`,
          glazed ? "darkGlass" : "plastic",
          glazed ? "glassPane" : "panel",
          campusPoint(along, outward, baseY + building.height / 2),
          [bayLength, building.height, glazed ? 0.16 : 0.22],
          glazed ? GLASS : bay % 3 === 0 ? CERAMIC_WARM : CERAMIC,
          {
            rotation: CAMPUS_ROTATION,
            textureProfile: glazed ? undefined : "nimbus-ceramic-composite",
            bearsLoad: false,
            attachmentSupportMode: "cable",
            sideAttachmentReach: 0.9,
            volume: bayLength * building.height * (glazed ? 0.035 : 0.055),
          },
        );
      }
    }
  }

  for (const end of [-1, 1]) {
    for (let strip = 0; strip < 4; strip += 1) {
      const stripWidth = building.width / 4;
      const outward = building.outward - building.width / 2
        + (strip + 0.5) * stripWidth;
      nimbusPrimitive(
        groups.industrialShell,
        `${building.id}:end:${end}:${strip}`,
        strip === 1 || strip === 2 ? "darkGlass" : "plastic",
        strip === 1 || strip === 2 ? "glassPane" : "panel",
        campusPoint(
          building.along + end * building.length / 2,
          outward,
          baseY + building.height / 2,
        ),
        [0.2, building.height, stripWidth],
        strip === 1 || strip === 2 ? GLASS : CERAMIC_WARM,
        {
          rotation: CAMPUS_ROTATION,
          textureProfile: strip === 1 || strip === 2
            ? undefined
            : "nimbus-ceramic-composite",
          bearsLoad: false,
          attachmentSupportMode: "cable",
          sideAttachmentReach: 0.9,
          volume: building.height * stripWidth * 0.05,
        },
      );
    }
  }

  createIndustrialRoof(groups, building, baseY, eaveY, bayLength);
  createIndustrialEquipment(groups, building, baseY, eaveY, bayStations);
  createLoadingApron(groups.hardscape, building);
}

function createIndustrialRoof(
  groups: NimbusIndustrialCampusGroups,
  building: BuildingDefinition,
  baseY: number,
  eaveY: number,
  bayLength: number,
): void {
  for (let bay = 0; bay < building.bays; bay += 1) {
    const along = building.along - building.length / 2
      + (bay + 0.5) * bayLength;
    if (building.roof === "pitched") {
      const rise = 4.2;
      const slopeLength = Math.hypot(building.width / 2, rise);
      const slopeAngle = Math.atan2(rise, building.width / 2);
      for (const side of [-1, 1]) {
        const normal: SceneVector3 = [
          NIMBUS_FLIGHT_FIELD_OUTWARD[0] * side * Math.sin(slopeAngle),
          Math.cos(slopeAngle),
          NIMBUS_FLIGHT_FIELD_OUTWARD[1] * side * Math.sin(slopeAngle),
        ];
        addRoofPanel(
          groups.industrialShell,
          `${building.id}:roof:${bay}:${side}`,
          along,
          building.outward + side * building.width / 4,
          eaveY + rise / 2,
          bayLength,
          slopeLength,
          normal,
          side > 0 ? "#65747a" : "#536269",
        );
      }
      nimbusRod(
        groups.industrialPrimary,
        `${building.id}:ridge:${bay}`,
        "steel",
        campusPoint(along - bayLength / 2, building.outward, eaveY + rise),
        campusPoint(along + bayLength / 2, building.outward, eaveY + rise),
        0.46,
        STEEL_LIGHT,
        {
          textureProfile: "painted-steel",
          attachmentSupportMode: "cable",
          sideAttachmentReach: 0.9,
          carriesAttachments: true,
        },
      );
    } else if (building.roof === "shed") {
      const rise = 3.2;
      const slopeLength = Math.hypot(building.width, rise);
      const slopeAngle = Math.atan2(rise, building.width);
      const normal: SceneVector3 = [
        -NIMBUS_FLIGHT_FIELD_OUTWARD[0] * Math.sin(slopeAngle),
        Math.cos(slopeAngle),
        -NIMBUS_FLIGHT_FIELD_OUTWARD[1] * Math.sin(slopeAngle),
      ];
      addRoofPanel(
        groups.industrialShell,
        `${building.id}:roof:${bay}`,
        along,
        building.outward,
        eaveY + rise / 2,
        bayLength,
        slopeLength,
        normal,
        bay % 2 === 0 ? "#738188" : "#65737a",
      );
      nimbusPrimitive(
        groups.industrialShell,
        `${building.id}:clerestory:${bay}`,
        "darkGlass",
        "glassPane",
        campusPoint(
          along,
          building.outward - building.width / 2 + 0.08,
          eaveY + rise / 2,
        ),
        [bayLength, rise, 0.16],
        GLASS,
        {
          rotation: CAMPUS_ROTATION,
          bearsLoad: false,
          attachmentSupportMode: "cable",
          sideAttachmentReach: 0.8,
          volume: bayLength * rise * 0.035,
        },
      );
    } else if (building.roof === "monitor") {
      for (const side of [-1, 1]) {
        const monitorAcross = building.outward + side * building.width * 0.12;
        nimbusRod(
          groups.industrialPrimary,
          `${building.id}:monitor-beam:${bay}:${side}`,
          "steel",
          campusPoint(along - bayLength / 2, monitorAcross, eaveY + 3.1),
          campusPoint(along + bayLength / 2, monitorAcross, eaveY + 3.1),
          0.42,
          side < 0 ? STEEL_MID : STEEL_LIGHT,
          {
            textureProfile: "painted-steel",
            attachmentSupportMode: "cable",
            sideAttachmentReach: 0.9,
            carriesAttachments: true,
          },
        );
      }
      for (const side of [-1, 1]) {
        addRoofPanel(
          groups.industrialShell,
          `${building.id}:roof:${bay}:${side}`,
          along,
          building.outward + side * building.width * 0.31,
          eaveY + 0.18,
          bayLength,
          building.width * 0.38,
          UP,
          side > 0 ? "#67767c" : "#59686e",
        );
        nimbusPrimitive(
          groups.industrialShell,
          `${building.id}:monitor-glass:${bay}:${side}`,
          "darkGlass",
          "glassPane",
          campusPoint(
            along,
            building.outward + side * building.width * 0.12,
            eaveY + 1.65,
          ),
          [bayLength, 3, 0.16],
          GLASS,
          {
            rotation: CAMPUS_ROTATION,
            bearsLoad: false,
            attachmentSupportMode: "cable",
            sideAttachmentReach: 0.8,
            volume: bayLength * 3 * 0.035,
          },
        );
      }
      addRoofPanel(
        groups.industrialShell,
        `${building.id}:monitor-roof:${bay}`,
        along,
        building.outward,
        eaveY + 3.22,
        bayLength,
        building.width * 0.25,
        UP,
        "#77858a",
      );
    } else {
      addRoofPanel(
        groups.industrialShell,
        `${building.id}:roof:${bay}`,
        along,
        building.outward,
        eaveY + 0.18,
        bayLength,
        building.width,
        UP,
        bay % 2 === 0 ? "#59686d" : "#4e5d62",
      );
    }
  }
}

function createIndustrialEquipment(
  groups: NimbusIndustrialCampusGroups,
  building: BuildingDefinition,
  baseY: number,
  eaveY: number,
  bayStations: readonly number[],
): void {
  if (building.id === "assembly-hall") {
    for (const side of [-1, 1]) {
      nimbusRod(
        groups.industrialEquipment,
        `${building.id}:overhead-runway:${side}`,
        "steel",
        campusPoint(
          building.along - building.length / 2 + 3,
          building.outward + side * building.width * 0.38,
          eaveY - 3.2,
        ),
        campusPoint(
          building.along + building.length / 2 - 3,
          building.outward + side * building.width * 0.38,
          eaveY - 3.2,
        ),
        0.5,
        SAFETY_ORANGE,
        {
          textureProfile: "painted-steel",
          attachmentSupportMode: "cable",
          sideAttachmentReach: 1.0,
          carriesAttachments: true,
        },
      );
    }
    for (const [bridge, along] of [bayStations[2], bayStations[4]].entries()) {
      nimbusRod(
        groups.industrialEquipment,
        `${building.id}:overhead-bridge:${bridge}`,
        "steel",
        campusPoint(
          along,
          building.outward - building.width * 0.38,
          eaveY - 2.8,
        ),
        campusPoint(
          along,
          building.outward + building.width * 0.38,
          eaveY - 2.8,
        ),
        0.62,
        bridge === 0 ? STEEL_LIGHT : SAFETY_ORANGE,
        {
          textureProfile: "painted-steel",
          attachmentSupportMode: "cable",
          sideAttachmentReach: 0.8,
          carriesAttachments: true,
        },
      );
      nimbusRod(
        groups.industrialEquipment,
        `${building.id}:overhead-hook:${bridge}`,
        "steel",
        campusPoint(along, building.outward, eaveY - 2.8),
        campusPoint(along, building.outward, baseY + 5.2),
        0.22,
        STEEL_DARK,
        {
          attachmentSupportMode: "cable",
          sideAttachmentReach: 0.5,
          bearsLoad: false,
        },
      );
    }
  } else if (building.id === "energy-plant") {
    for (const [bank, alongOffset] of [-8, 0, 8].entries()) {
      const outward = building.outward - building.width / 2 - 2.2;
      nimbusPrimitive(
        groups.industrialEquipment,
        `${building.id}:radiator:${bank}`,
        "steel",
        "steelSheet",
        campusPoint(building.along + alongOffset, outward, baseY + 5.8),
        [5.2, 10.5, 0.48],
        bank % 2 === 0 ? STEEL_DARK : STEEL_MID,
        {
          rotation: CAMPUS_ROTATION,
          textureProfile: "nimbus-technical-deck",
          attachmentSupportMode: "cable",
          sideAttachmentReach: 2.5,
          bearsLoad: false,
          volume: 3.4,
        },
      );
    }
    for (const [stack, alongOffset] of [-7, 7].entries()) {
      nimbusRod(
        groups.industrialEquipment,
        `${building.id}:vent-stack:${stack}`,
        "steel",
        campusPoint(building.along + alongOffset, building.outward, eaveY),
        campusPoint(
          building.along + alongOffset,
          building.outward,
          eaveY + 8 + stack * 2,
        ),
        1.05,
        stack === 0 ? STEEL_LIGHT : STEEL_MID,
        {
          textureProfile: "painted-steel",
          attachmentSupportMode: "cable",
          sideAttachmentReach: 1.0,
          carriesAttachments: true,
        },
      );
    }
  } else {
    const equipmentCount = building.id === "machine-shop" ? 4 : 3;
    for (let unit = 0; unit < equipmentCount; unit += 1) {
      const along = building.along - building.length * 0.3
        + unit * building.length * 0.6 / Math.max(1, equipmentCount - 1);
      nimbusPrimitive(
        groups.industrialEquipment,
        `${building.id}:roof-unit:${unit}`,
        "steel",
        "steelSheet",
        campusPoint(along, building.outward, eaveY + 1.35),
        [4.2, 2.2, 3.4],
        unit % 2 === 0 ? STEEL_MID : STEEL_DARK,
        {
          rotation: CAMPUS_ROTATION,
          textureProfile: "nimbus-technical-deck",
          attachmentSupportMode: "cable",
          sideAttachmentReach: 1.0,
          bearsLoad: false,
          volume: 2.8,
        },
      );
    }
  }
}

function createLoadingApron(
  hardscape: NimbusMutableGroup,
  building: BuildingDefinition,
): void {
  const tile = 6;
  const apronLength = Math.ceil(building.length / tile) * tile;
  for (let along = -apronLength / 2 + tile / 2; along < apronLength / 2; along += tile) {
    for (let row = 0; row < 3; row += 1) {
      const outward = building.outward + building.width / 2 + 3 + row * tile;
      const point = campusPoint(building.along + along, outward, 0);
      const ground = nimbusGroundUnder(point[0], point[2]).top;
      nimbusPrimitive(
        hardscape,
        `${building.id}:loading-apron:${along}:${row}`,
        row === 2 ? "asphalt" : "concrete",
        "groundTile",
        [point[0], ground + 0.1, point[2]],
        [tile + 0.04, 0.2, tile + 0.04],
        row === 2 ? "#485052" : row === 0 ? "#8e938e" : "#7d837e",
        {
          rotation: CAMPUS_ROTATION,
          textureProfile: row === 2
            ? "nimbus-technical-deck"
            : "nimbus-board-formed-concrete",
          bearsLoad: false,
        },
      );
    }
  }
}

type GroundPathPoint = readonly [number, number];

function appendRailPath(
  rails: NimbusMutableGroup,
  id: string,
  points: readonly GroundPathPoint[],
): void {
  let pieceIndex = 0;
  for (let span = 0; span < points.length - 1; span += 1) {
    const from = points[span];
    const to = points[span + 1];
    const dx = to[0] - from[0];
    const dz = to[1] - from[1];
    const distance = Math.hypot(dx, dz);
    const steps = Math.ceil(distance / 4);
    const along = [dx / distance, dz / distance] as const;
    const across = [-along[1], along[0]] as const;
    const rotation = nimbusOrient([along[0], 0, along[1]], [0, 1, 0]);
    for (let step = 0; step < steps; step += 1) {
      const t0 = step / steps;
      const t1 = (step + 1) / steps;
      const centreT = (t0 + t1) / 2;
      const x = from[0] + dx * centreT;
      const z = from[1] + dz * centreT;
      const segmentLength = distance / steps;
      const ground = nimbusGroundUnder(x, z).top;
      for (const side of [-1, 1]) {
        nimbusPrimitive(
          rails,
          `${id}:rail:${pieceIndex}:${side}`,
          "steel",
          "steelSheet",
          [
            x + across[0] * side * 1.45,
            ground + 0.18,
            z + across[1] * side * 1.45,
          ],
          [segmentLength + 0.08, 0.2, 0.22],
          pieceIndex % 7 === 0 ? STEEL_LIGHT : STEEL_MID,
          {
            rotation,
            textureProfile: "painted-steel",
            bearsLoad: false,
            contactBearingOrder: true,
          },
        );
      }
      nimbusPrimitive(
        rails,
        `${id}:sleeper:${pieceIndex}`,
        "concrete",
        "panel",
        [x, ground + 0.08, z],
        [0.65, 0.16, 3.8],
        pieceIndex % 3 === 0 ? "#737875" : "#686d6a",
        {
          rotation,
          textureProfile: "nimbus-board-formed-concrete",
          bearsLoad: false,
          contactBearingOrder: true,
        },
      );
      pieceIndex += 1;
    }
  }
}

function createRailNetwork(rails: NimbusMutableGroup): void {
  const fieldStart = campusPoint(-50, -18, 0);
  const fieldEnd = campusPoint(50, -18, 0);
  appendRailPath(rails, "field-cargo", [
    [fieldStart[0], fieldStart[2]],
    [fieldEnd[0], fieldEnd[2]],
  ]);

  const assembly = campusPoint(-82, -18, 0);
  const yardEntry = nimbusPointOnShipyard(-68, 0);
  appendRailPath(rails, "production-spine", [
    [fieldStart[0], fieldStart[2]],
    [assembly[0], assembly[2]],
    [-128, 13],
    [-108, -3],
    [yardEntry[0], yardEntry[2]],
  ]);

  for (const [buildingIndex, building] of BUILDINGS.entries()) {
    const cargo = campusPoint(
      building.along,
      building.outward + building.width / 2 + 8,
      0,
    );
    const collector = campusPoint(
      Math.max(-50, Math.min(50, building.along)),
      -18,
      0,
    );
    appendRailPath(rails, `factory-spur:${buildingIndex}`, [
      [cargo[0], cargo[2]],
      [collector[0], collector[2]],
    ]);
  }

  const dockMouth = dockPoint(0, 35, 0);
  const dockThreshold = dockPoint(0, 25, 0);
  appendRailPath(rails, "dock-transfer", [
    [yardEntry[0], yardEntry[2]],
    [-91, -37],
    [-90, -56],
    [dockMouth[0], dockMouth[2]],
    [dockThreshold[0], dockThreshold[2]],
  ]);
}

function createDockTransferApron(
  hardscape: NimbusMutableGroup,
  equipment: NimbusMutableGroup,
): void {
  for (let across = -15; across <= 15; across += 6) {
    for (let forward = 30; forward <= 48; forward += 6) {
      const point = dockPoint(across, forward, 0);
      const ground = nimbusGroundUnder(point[0], point[2]).top;
      nimbusPrimitive(
        hardscape,
        `dock-transfer:tile:${across}:${forward}`,
        Math.abs(across) < 6 ? "steel" : "concrete",
        "groundTile",
        [point[0], ground + 0.1, point[2]],
        [6.04, 0.2, 6.04],
        Math.abs(across) < 6 ? "#4c5a5f" : "#858a85",
        {
          rotation: nimbusOrient(
            [NIMBUS_DOCK_ACROSS[0], 0, NIMBUS_DOCK_ACROSS[1]],
            [0, 1, 0],
          ),
          textureProfile: Math.abs(across) < 6
            ? "nimbus-technical-deck"
            : "nimbus-board-formed-concrete",
          bearsLoad: false,
        },
      );
    }
  }

  for (const side of [-1, 1]) {
    const base = dockPoint(side * 18.5, 34, 0);
    const ground = nimbusGroundUnder(base[0], base[2]).top;
    nimbusPrimitive(
      equipment,
      `dock-transfer:winch:${side}:base`,
      "concrete",
      "panel",
      [base[0], ground + 0.5, base[2]],
      [4.2, 1, 4.2],
      CONCRETE_DARK,
      {
        rotation: nimbusOrient(
          [NIMBUS_DOCK_ACROSS[0], 0, NIMBUS_DOCK_ACROSS[1]],
          [0, 1, 0],
        ),
        textureProfile: "nimbus-board-formed-concrete",
        contactBoxes: [nimbusGroundSeatBox(ground + 0.5, [4.2, 1, 4.2], ground)],
      },
    );
    nimbusPrimitive(
      equipment,
      `dock-transfer:winch:${side}:drum`,
      "steel",
      "steelSheet",
      [base[0], ground + 1.55, base[2]],
      [2.8, 1.1, 2.8],
      side < 0 ? SAFETY_ORANGE : STEEL_LIGHT,
      {
        rotation: nimbusOrient(
          [NIMBUS_DOCK_ACROSS[0], 0, NIMBUS_DOCK_ACROSS[1]],
          [0, 1, 0],
        ),
        textureProfile: "painted-steel",
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.6,
        carriesAttachments: true,
      },
    );
  }
}

interface CargoCraneDefinition {
  readonly along: number;
  readonly outward: number;
  readonly height: number;
  readonly boom: number;
  readonly boomSign: -1 | 1;
}

const CARGO_CRANES: readonly CargoCraneDefinition[] = [
  { along: -5, outward: -35, height: 24, boom: 24, boomSign: -1 },
  { along: 25, outward: -35, height: 28, boom: 28, boomSign: 1 },
  { along: 103, outward: -38, height: 22, boom: 22, boomSign: -1 },
] as const;

function createCargoCranes(
  cranes: NimbusMutableGroup,
): void {
  for (const [craneIndex, crane] of CARGO_CRANES.entries()) {
    const root = campusPoint(crane.along, crane.outward, 0);
    const ground = nimbusGroundUnder(root[0], root[2]).top;
    const foundationHeight = 5.5;
    nimbusPrimitive(
      cranes,
      `cargo-crane:${craneIndex}:foundation`,
      "concrete",
      "cinderBlock",
      [root[0], ground - foundationHeight / 2 + 0.45, root[2]],
      [5.2, foundationHeight + 0.9, 5.2],
      CONCRETE_DARK,
      {
        rotation: CAMPUS_ROTATION,
        textureProfile: "nimbus-board-formed-concrete",
        contactBoxes: [nimbusGradeContactBox(
          ground - foundationHeight / 2 + 0.45,
          [0.8, 0.8],
          ground - 0.24,
        )],
        contactBearingOrder: true,
        bearingArea: 1_500,
      },
    );
    const segmentHeight = 4;
    const segments = Math.ceil(crane.height / segmentHeight);
    for (let segment = 0; segment < segments; segment += 1) {
      const bottom = ground + segment * segmentHeight;
      const top = ground + Math.min(crane.height, (segment + 1) * segmentHeight);
      for (const [chord, [alongOffset, outwardOffset]] of [
        [-1.15, -1.15],
        [-1.15, 1.15],
        [1.15, -1.15],
        [1.15, 1.15],
      ].entries()) {
        nimbusRod(
          cranes,
          `cargo-crane:${craneIndex}:mast:${segment}:${chord}`,
          "steel",
          campusPoint(crane.along + alongOffset, crane.outward + outwardOffset, bottom),
          campusPoint(crane.along + alongOffset, crane.outward + outwardOffset, top),
          0.34,
          chord % 2 === 0 ? STEEL_LIGHT : STEEL_MID,
          {
            textureProfile: "painted-steel",
            attachmentSupportMode: "cable",
            sideAttachmentReach: 0.62,
            carriesAttachments: true,
            bearingArea: 60,
          },
        );
      }
      for (const side of [-1, 1]) {
        nimbusRod(
          cranes,
          `cargo-crane:${craneIndex}:brace:${segment}:${side}`,
          "steel",
          campusPoint(crane.along - 1.15, crane.outward + side * 1.15, bottom),
          campusPoint(crane.along + 1.15, crane.outward + side * 1.15, top),
          0.22,
          side < 0 ? SAFETY_ORANGE : STEEL_DARK,
          {
            textureProfile: "painted-steel",
            attachmentSupportMode: "cable",
            sideAttachmentReach: 0.55,
          },
        );
      }
    }
    const boomTip = campusPoint(
      crane.along + crane.boomSign * crane.boom,
      crane.outward,
      ground + crane.height + 1.8,
    );
    const counterTip = campusPoint(
      crane.along - crane.boomSign * 10,
      crane.outward,
      ground + crane.height,
    );
    const towerTip = campusPoint(
      crane.along,
      crane.outward,
      ground + crane.height + 7,
    );
    nimbusRod(
      cranes,
      `cargo-crane:${craneIndex}:kingpost`,
      "steel",
      campusPoint(crane.along, crane.outward, ground + crane.height),
      towerTip,
      0.42,
      STEEL_LIGHT,
      {
        textureProfile: "painted-steel",
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.75,
        carriesAttachments: true,
      },
    );
    nimbusRod(
      cranes,
      `cargo-crane:${craneIndex}:counter-boom`,
      "steel",
      counterTip,
      campusPoint(crane.along, crane.outward, ground + crane.height),
      0.62,
      craneIndex === 1 ? SAFETY_ORANGE : STEEL_LIGHT,
      {
        textureProfile: "painted-steel",
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.85,
        carriesAttachments: true,
        bearingArea: 110,
      },
    );
    nimbusRod(
      cranes,
      `cargo-crane:${craneIndex}:main-boom`,
      "steel",
      campusPoint(crane.along, crane.outward, ground + crane.height),
      boomTip,
      0.62,
      craneIndex === 1 ? SAFETY_ORANGE : STEEL_LIGHT,
      {
        textureProfile: "painted-steel",
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.85,
        carriesAttachments: true,
        bearingArea: 110,
      },
    );
    nimbusRod(
      cranes,
      `cargo-crane:${craneIndex}:boom-tie`,
      "steel",
      towerTip,
      boomTip,
      0.3,
      STEEL_MID,
      {
        textureProfile: "painted-steel",
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.7,
      },
    );
    const hook = campusPoint(
      crane.along + crane.boomSign * crane.boom * 0.72,
      crane.outward,
      ground + 4,
    );
    nimbusRod(
      cranes,
      `cargo-crane:${craneIndex}:hook-line`,
      "steel",
      campusPoint(
        crane.along + crane.boomSign * crane.boom * 0.72,
        crane.outward,
        ground + crane.height + 1.3,
      ),
      hook,
      0.18,
      STEEL_DARK,
      {
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.4,
        bearsLoad: false,
      },
    );
  }
}

interface HexPadDefinition {
  readonly id: typeof NIMBUS_HEX_PAD_IDS[number];
  readonly centre: readonly [number, number];
  readonly along: readonly [number, number];
}

function officePad(
  id: "office-rim" | "office-spindle",
  centre: readonly [number, number],
  outwardOffset: number,
  tangentOffset: number,
): HexPadDefinition {
  const length = Math.hypot(...centre);
  const outward = [centre[0] / length, centre[1] / length] as const;
  const tangent = [outward[1], -outward[0]] as const;
  return {
    id,
    centre: [
      centre[0] + outward[0] * outwardOffset + tangent[0] * tangentOffset,
      centre[1] + outward[1] * outwardOffset + tangent[1] * tangentOffset,
    ],
    along: tangent,
  };
}

function createHexPads(flightPads: NimbusMutableGroup): void {
  const padDefinitions: readonly HexPadDefinition[] = [
    {
      id: "production-assembly",
      centre: [campusPoint(-55, -42, 0)[0], campusPoint(-55, -42, 0)[2]],
      along: NIMBUS_FLIGHT_FIELD_ALONG,
    },
    {
      id: "production-composites",
      centre: [campusPoint(101, -18, 0)[0], campusPoint(101, -18, 0)[2]],
      along: NIMBUS_FLIGHT_FIELD_ALONG,
    },
    {
      id: "production-machine",
      centre: [campusPoint(58, -64, 0)[0], campusPoint(58, -64, 0)[2]],
      along: NIMBUS_FLIGHT_FIELD_ALONG,
    },
    {
      id: "production-energy",
      centre: [campusPoint(-42, -78, 0)[0], campusPoint(-42, -78, 0)[2]],
      along: NIMBUS_FLIGHT_FIELD_ALONG,
    },
    ...([-38, 0, 38] as const).map((shipyardAlong, index) => {
      const point = nimbusPointOnShipyard(shipyardAlong, 42);
      return {
        id: (["shipyard-west", "shipyard-centre", "shipyard-east"] as const)[index],
        centre: [point[0], point[2]] as const,
        along: [Math.cos(Math.PI / 10), Math.sin(Math.PI / 10)] as const,
      };
    }),
    officePad("office-rim", NIMBUS_TOWER_CENTRE, 23, -18),
    officePad("office-spindle", NIMBUS_SPINDLE_TOWER_CENTRE, 20, 17),
    {
      id: "dock-service",
      centre: [dockPoint(-45, 31, 0)[0], dockPoint(-45, 31, 0)[2]],
      along: NIMBUS_DOCK_FORWARD,
    },
    {
      id: "dock-habitation",
      centre: [dockPoint(45, 31, 0)[0], dockPoint(45, 31, 0)[2]],
      along: NIMBUS_DOCK_FORWARD,
    },
  ];

  for (const [padIndex, pad] of padDefinitions.entries()) {
    const across = [-pad.along[1], pad.along[0]] as const;
    const rotation = nimbusOrient(
      [pad.along[0], 0, pad.along[1]],
      [0, 1, 0],
    );
    const ground = nimbusGroundUnder(pad.centre[0], pad.centre[1]).top;
    const baseSize: SceneVector3 = [10.5, 0.65, 10.5];
    nimbusPrimitive(
      flightPads,
      `${pad.id}:base`,
      "concrete",
      "panel",
      [pad.centre[0], ground + baseSize[1] / 2, pad.centre[1]],
      baseSize,
      padIndex % 3 === 0 ? CONCRETE_DARK : CONCRETE,
      {
        rotation,
        textureProfile: "nimbus-board-formed-concrete",
        contactBoxes: [nimbusGroundSeatBox(
          ground + baseSize[1] / 2,
          baseSize,
          ground,
        )],
        contactBearingOrder: true,
        bearingArea: 120,
      },
    );
    nimbusPrimitive(
      flightPads,
      `${pad.id}:deck`,
      "steel",
      "groundTile",
      [pad.centre[0], ground + 0.75, pad.centre[1]],
      [8.6, 0.2, 8.6],
      padIndex % 2 === 0 ? "#4b5b61" : "#59686d",
      {
        rotation,
        textureProfile: "nimbus-technical-deck",
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.5,
        contactBearingOrder: true,
      },
    );
    for (let lug = 0; lug < 6; lug += 1) {
      const angle = lug / 6 * Math.PI * 2;
      const alongOffset = Math.cos(angle) * 3.45;
      const acrossOffset = Math.sin(angle) * 3.45;
      nimbusPrimitive(
        flightPads,
        `${pad.id}:capture-lug:${lug}`,
        "steel",
        "steelSheet",
        [
          pad.centre[0]
            + pad.along[0] * alongOffset + across[0] * acrossOffset,
          ground + 1.02,
          pad.centre[1]
            + pad.along[1] * alongOffset + across[1] * acrossOffset,
        ],
        [0.72, 0.45, 0.72],
        lug % 2 === 0 ? FLIGHT_BLUE : SAFETY_ORANGE,
        {
          rotation,
          textureProfile: "painted-steel",
          attachmentSupportMode: "cable",
          sideAttachmentReach: 0.65,
          bearsLoad: false,
          volume: 0.08,
        },
      );
    }
  }
}

export function createNimbusIndustrialCampus(
  groups: NimbusIndustrialCampusGroups,
): void {
  createFlightField(groups.flightFoundation, groups.flightSurface);
  for (const building of BUILDINGS) {
    createIndustrialBuilding(groups, building);
  }
  createRailNetwork(groups.rails);
  createDockTransferApron(groups.hardscape, groups.industrialEquipment);
  createCargoCranes(groups.cargoCranes);
  createHexPads(groups.flightPads);
}
