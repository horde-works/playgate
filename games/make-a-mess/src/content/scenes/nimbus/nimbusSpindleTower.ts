import type { SceneVector3 } from "../../../game/destructionScene.ts";
import type { NimbusMutableGroup } from "./nimbusAuthoring.ts";
import {
  nimbusGradeContactBox,
  nimbusOrient,
  nimbusPrimitive,
  nimbusRod,
} from "./nimbusAuthoring.ts";
import {
  NIMBUS_SPINDLE_TOWER_CENTRE,
  nimbusGroundUnder,
} from "./nimbusShell.ts";

export const NIMBUS_SPINDLE_FLOORS = 46;
export const NIMBUS_SPINDLE_FLOOR_HEIGHT = 4;
export const NIMBUS_SPINDLE_COLUMN_COUNT = 20;
export const NIMBUS_SPINDLE_FLOOR_SECTORS = 12;
export const NIMBUS_SPINDLE_FACADE_SECTORS = 24;
export const NIMBUS_SPINDLE_FOUNDATION_DEPTH = 14;
export const NIMBUS_SPINDLE_COLUMN_RADIUS = 6.2;
export const NIMBUS_SPINDLE_CORE_RADIUS = 8.4;

const COLUMN_SIZE = 1.4;
const CORE_WALL_THICKNESS = 1.15;
const FLOOR_THICKNESS = 0.28;
const BASE_RADIUS = 14;
const MAX_RADIUS = 18.4;
const ROOF_RADIUS = 11.2;

const CONCRETE_DARK = "#606768";
const CONCRETE_MID = "#858a87";
const CONCRETE_LIGHT = "#a5a8a3";
const ARMOUR_DARK = "#25343a";
const ARMOUR_MID = "#4b5d63";
const ARMOUR_LIGHT = "#849397";
const CERAMIC = "#dde2df";
const CERAMIC_WARM = "#c9cfca";
const GLASS = "#14323e";
const SERVICE_BLUE = "#4ba9b8";
const SERVICE_ORANGE = "#d56b32";

const CENTRE_RADIUS = Math.hypot(...NIMBUS_SPINDLE_TOWER_CENTRE);
export const NIMBUS_SPINDLE_RADIAL: readonly [number, number] = [
  NIMBUS_SPINDLE_TOWER_CENTRE[0] / CENTRE_RADIUS,
  NIMBUS_SPINDLE_TOWER_CENTRE[1] / CENTRE_RADIUS,
];
export const NIMBUS_SPINDLE_TANGENT: readonly [number, number] = [
  -NIMBUS_SPINDLE_RADIAL[1],
  NIMBUS_SPINDLE_RADIAL[0],
];
const PROFILE_PHASE = Math.atan2(
  NIMBUS_SPINDLE_RADIAL[1],
  NIMBUS_SPINDLE_RADIAL[0],
);

const FOUNDATION_GRADE = (() => {
  let highest = nimbusGroundUnder(
    NIMBUS_SPINDLE_TOWER_CENTRE[0],
    NIMBUS_SPINDLE_TOWER_CENTRE[1],
  ).top;
  for (let index = 0; index < NIMBUS_SPINDLE_COLUMN_COUNT; index += 1) {
    const angle = PROFILE_PHASE
      + (index / NIMBUS_SPINDLE_COLUMN_COUNT) * Math.PI * 2;
    const x = NIMBUS_SPINDLE_TOWER_CENTRE[0]
      + Math.cos(angle) * NIMBUS_SPINDLE_COLUMN_RADIUS;
    const z = NIMBUS_SPINDLE_TOWER_CENTRE[1]
      + Math.sin(angle) * NIMBUS_SPINDLE_COLUMN_RADIUS;
    highest = Math.max(highest, nimbusGroundUnder(x, z).top);
  }
  return highest;
})();

export const NIMBUS_SPINDLE_STRUCTURE_BASE_Y = FOUNDATION_GRADE + 1;
export const NIMBUS_SPINDLE_ROOF_Y = NIMBUS_SPINDLE_STRUCTURE_BASE_Y
  + NIMBUS_SPINDLE_FLOORS * NIMBUS_SPINDLE_FLOOR_HEIGHT;

export interface NimbusSpindleTowerGroups {
  readonly foundation: NimbusMutableGroup;
  readonly core: NimbusMutableGroup;
  readonly armour: NimbusMutableGroup;
  readonly floors: NimbusMutableGroup;
  readonly frame: NimbusMutableGroup;
  readonly facade: NimbusMutableGroup;
  readonly fittings: NimbusMutableGroup;
  readonly stairs: NimbusMutableGroup;
  readonly crown: NimbusMutableGroup;
}

function smoothstep(value: number): number {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

export function nimbusSpindleRadiusAtLevel(level: number): number {
  const t = Math.max(0, Math.min(1, level / NIMBUS_SPINDLE_FLOORS));
  if (t <= 0.28) {
    return BASE_RADIUS
      + (MAX_RADIUS - BASE_RADIUS) * smoothstep(t / 0.28);
  }
  const taper = smoothstep((t - 0.28) / 0.72);
  return MAX_RADIUS + (ROOF_RADIUS - MAX_RADIUS) * Math.pow(taper, 1.08);
}

function towerPoint(radius: number, angle: number, y: number): SceneVector3 {
  return [
    NIMBUS_SPINDLE_TOWER_CENTRE[0] + Math.cos(angle) * radius,
    y,
    NIMBUS_SPINDLE_TOWER_CENTRE[1] + Math.sin(angle) * radius,
  ];
}

function midpoint(...points: readonly SceneVector3[]): SceneVector3 {
  return [
    points.reduce((sum, point) => sum + point[0], 0) / points.length,
    points.reduce((sum, point) => sum + point[1], 0) / points.length,
    points.reduce((sum, point) => sum + point[2], 0) / points.length,
  ];
}

function subtract(left: SceneVector3, right: SceneVector3): SceneVector3 {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function tangentYaw(angle: number): number {
  return -angle - Math.PI / 2;
}

function chordWidth(radius: number, count: number, fill = 0.96): number {
  return 2 * radius * Math.sin(Math.PI / count) * fill;
}

function createFoundation(
  foundation: NimbusMutableGroup,
  armour: NimbusMutableGroup,
): void {
  for (let index = 0; index < NIMBUS_SPINDLE_COLUMN_COUNT; index += 1) {
    const angle = PROFILE_PHASE
      + (index / NIMBUS_SPINDLE_COLUMN_COUNT) * Math.PI * 2;
    const horizontal = towerPoint(NIMBUS_SPINDLE_COLUMN_RADIUS, angle, 0);
    const localGround = nimbusGroundUnder(horizontal[0], horizontal[2]).top;
    const bottom = localGround - NIMBUS_SPINDLE_FOUNDATION_DEPTH;
    const height = NIMBUS_SPINDLE_STRUCTURE_BASE_Y - bottom;
    const centre = towerPoint(
      NIMBUS_SPINDLE_COLUMN_RADIUS,
      angle,
      bottom + height / 2,
    );
    const size: SceneVector3 = [1.85, height, 1.85];
    nimbusPrimitive(
      foundation,
      `caisson:${index}`,
      "concrete",
      "cinderBlock",
      centre,
      size,
      index % 2 === 0 ? CONCRETE_DARK : CONCRETE_MID,
      {
        textureProfile: "nimbus-board-formed-concrete",
        contactBoxes: [
          nimbusGradeContactBox(centre[1], [size[0], size[2]], localGround),
          {
            position: [0, size[1] / 2 - 0.05, 0],
            size: [size[0], 0.1, size[2]],
          },
        ],
        contactBearingOrder: true,
        bearingArea: 76,
      },
    );

    const shoe = towerPoint(
      NIMBUS_SPINDLE_COLUMN_RADIUS,
      angle,
      localGround - 0.55,
    );
    nimbusPrimitive(
      armour,
      `caisson-shoe:${index}`,
      "steel",
      "steelSheet",
      shoe,
      [2.25, 3.4, 2.25],
      ARMOUR_DARK,
      {
        textureProfile: "painted-steel",
        bearsLoad: false,
        sideAttachmentReach: 0.72,
        volume: 1.5,
      },
    );
  }

  // Independent raft arcs bind adjacent caissons without turning the whole
  // foundation into one removable plate.
  for (let index = 0; index < NIMBUS_SPINDLE_COLUMN_COUNT; index += 1) {
    const angle = PROFILE_PHASE
      + ((index + 0.5) / NIMBUS_SPINDLE_COLUMN_COUNT) * Math.PI * 2;
    const centre = towerPoint(7.35, angle, NIMBUS_SPINDLE_STRUCTURE_BASE_Y - 0.55);
    nimbusPrimitive(
      foundation,
      `raft:${index}`,
      "concrete",
      "panel",
      centre,
      [chordWidth(7.35, NIMBUS_SPINDLE_COLUMN_COUNT, 1.03), 1.1, 3.4],
      index % 3 === 0 ? CONCRETE_DARK : CONCRETE_MID,
      {
        rotation: [0, tangentYaw(angle), 0],
        textureProfile: "nimbus-board-formed-concrete",
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.65,
        bearingArea: 42,
      },
    );

    const buriedPlate = towerPoint(
      NIMBUS_SPINDLE_CORE_RADIUS + 1.1,
      angle,
      FOUNDATION_GRADE - 1.25,
    );
    nimbusPrimitive(
      armour,
      `buried-armour:${index}`,
      "steel",
      "steelSheet",
      buriedPlate,
      [
        chordWidth(
          NIMBUS_SPINDLE_CORE_RADIUS + 1.1,
          NIMBUS_SPINDLE_COLUMN_COUNT,
        ),
        5.4,
        0.28,
      ],
      index % 4 === 0 ? ARMOUR_MID : ARMOUR_DARK,
      {
        rotation: [0, tangentYaw(angle), 0],
        textureProfile: "painted-steel",
        bearsLoad: false,
        sideAttachmentReach: 0.75,
      },
    );
  }
}

function createCore(
  core: NimbusMutableGroup,
  armour: NimbusMutableGroup,
): void {
  const wallWidth = chordWidth(
    NIMBUS_SPINDLE_CORE_RADIUS,
    NIMBUS_SPINDLE_COLUMN_COUNT,
    1.03,
  );
  for (let floor = 0; floor < NIMBUS_SPINDLE_FLOORS; floor += 1) {
    const bottom = NIMBUS_SPINDLE_STRUCTURE_BASE_Y
      + floor * NIMBUS_SPINDLE_FLOOR_HEIGHT;
    const centreY = bottom + NIMBUS_SPINDLE_FLOOR_HEIGHT / 2;
    for (let index = 0; index < NIMBUS_SPINDLE_COLUMN_COUNT; index += 1) {
      const columnAngle = PROFILE_PHASE
        + (index / NIMBUS_SPINDLE_COLUMN_COUNT) * Math.PI * 2;
      nimbusPrimitive(
        core,
        `column:${floor}:${index}`,
        "concrete",
        "cinderBlock",
        towerPoint(NIMBUS_SPINDLE_COLUMN_RADIUS, columnAngle, centreY),
        [COLUMN_SIZE, NIMBUS_SPINDLE_FLOOR_HEIGHT, COLUMN_SIZE],
        index % 4 === 0 ? CONCRETE_LIGHT : CONCRETE_MID,
        {
          textureProfile: "nimbus-board-formed-concrete",
          bearingArea: 17,
        },
      );

      const wallAngle = PROFILE_PHASE
        + ((index + 0.5) / NIMBUS_SPINDLE_COLUMN_COUNT) * Math.PI * 2;
      nimbusPrimitive(
        core,
        `core-wall:${floor}:${index}`,
        "concrete",
        "cinderBlock",
        towerPoint(NIMBUS_SPINDLE_CORE_RADIUS, wallAngle, centreY),
        [wallWidth, NIMBUS_SPINDLE_FLOOR_HEIGHT, CORE_WALL_THICKNESS],
        floor % 6 === 5 ? CONCRETE_DARK : CONCRETE_MID,
        {
          rotation: [0, tangentYaw(wallAngle), 0],
          textureProfile: "nimbus-board-formed-concrete",
          bearingArea: 25,
        },
      );

      nimbusPrimitive(
        armour,
        `core-armour:${floor}:${index}`,
        "steel",
        "steelSheet",
        towerPoint(
          NIMBUS_SPINDLE_CORE_RADIUS + CORE_WALL_THICKNESS / 2 + 0.15,
          wallAngle,
          centreY,
        ),
        [wallWidth * 0.91, NIMBUS_SPINDLE_FLOOR_HEIGHT * 0.9, 0.23],
        (floor + index) % 7 === 0 ? ARMOUR_MID : ARMOUR_DARK,
        {
          rotation: [0, tangentYaw(wallAngle), 0],
          textureProfile: "painted-steel",
          bearsLoad: false,
          sideAttachmentReach: 0.5,
          volume: wallWidth * NIMBUS_SPINDLE_FLOOR_HEIGHT * 0.032,
        },
      );
    }
  }
}

function createFloors(
  floors: NimbusMutableGroup,
  frame: NimbusMutableGroup,
): void {
  for (let floor = 0; floor < NIMBUS_SPINDLE_FLOORS; floor += 1) {
    const y = NIMBUS_SPINDLE_STRUCTURE_BASE_Y
      + (floor + 1) * NIMBUS_SPINDLE_FLOOR_HEIGHT;
    const radius = nimbusSpindleRadiusAtLevel(floor + 1);
    const floorInnerRadius = NIMBUS_SPINDLE_CORE_RADIUS + 0.8;
    const floorOuterRadius = radius - 0.65;
    const bandDepth = (floorOuterRadius - floorInnerRadius) / 2;

    for (let sector = 0; sector < NIMBUS_SPINDLE_FLOOR_SECTORS; sector += 1) {
      const centreAngle = PROFILE_PHASE
        + ((sector + 0.5) / NIMBUS_SPINDLE_FLOOR_SECTORS) * Math.PI * 2;
      const leftAngle = PROFILE_PHASE
        + (sector / NIMBUS_SPINDLE_FLOOR_SECTORS) * Math.PI * 2
        + 0.025;
      const rightAngle = PROFILE_PHASE
        + ((sector + 1) / NIMBUS_SPINDLE_FLOOR_SECTORS) * Math.PI * 2
        - 0.025;

      for (const [beam, beamAngle] of [leftAngle, rightAngle].entries()) {
        nimbusRod(
          frame,
          `radial:${floor}:${sector}:${beam}`,
          "steel",
          towerPoint(NIMBUS_SPINDLE_CORE_RADIUS - 0.35, beamAngle, y - 0.42),
          towerPoint(radius - 0.35, beamAngle, y - 0.42),
          0.48,
          beam === 0 ? ARMOUR_LIGHT : ARMOUR_MID,
          {
            textureProfile: "painted-steel",
            attachmentSupportMode: "cable",
            sideAttachmentReach: 0.72,
            bearingArea: 24,
          },
        );
      }

      nimbusRod(
        frame,
        `outer-ring:${floor}:${sector}`,
        "steel",
        towerPoint(radius - 0.45, leftAngle, y - 0.42),
        towerPoint(radius - 0.45, rightAngle, y - 0.42),
        0.42,
        floor % 6 === 5 ? SERVICE_BLUE : ARMOUR_MID,
        {
          textureProfile: "painted-steel",
          attachmentSupportMode: "cable",
          sideAttachmentReach: 0.66,
          carriesAttachments: true,
          bearingArea: 36,
        },
      );

      for (let band = 0; band < 2; band += 1) {
        const bandRadius = floorInnerRadius + bandDepth * (band + 0.5);
        const tangentialWidth = 2 * bandRadius
          * Math.tan(Math.PI / NIMBUS_SPINDLE_FLOOR_SECTORS)
          * 0.91;
        nimbusPrimitive(
          floors,
          `slab:${floor}:${sector}:${band}`,
          "concrete",
          "panel",
          towerPoint(bandRadius, centreAngle, y),
          [tangentialWidth, FLOOR_THICKNESS, bandDepth * 0.98],
          band === 0 ? "#8d918d" : "#818682",
          {
            rotation: [0, tangentYaw(centreAngle), 0],
            textureProfile: "nimbus-board-formed-concrete",
            contactBearingOrder: true,
            attachmentSupportMode: "cable",
            sideAttachmentReach: 0.7,
          },
        );
      }
    }
  }
}

function createFacade(
  facade: NimbusMutableGroup,
  fittings: NimbusMutableGroup,
): void {
  for (let floor = 0; floor < NIMBUS_SPINDLE_FLOORS; floor += 1) {
    const lowerY = NIMBUS_SPINDLE_STRUCTURE_BASE_Y
      + floor * NIMBUS_SPINDLE_FLOOR_HEIGHT;
    const upperY = lowerY + NIMBUS_SPINDLE_FLOOR_HEIGHT;
    const lowerRadius = nimbusSpindleRadiusAtLevel(floor);
    const upperRadius = nimbusSpindleRadiusAtLevel(floor + 1);
    const technical = floor === 0 || floor % 6 === 5;

    for (let sector = 0; sector < NIMBUS_SPINDLE_FACADE_SECTORS; sector += 1) {
      const angleA = PROFILE_PHASE
        + (sector / NIMBUS_SPINDLE_FACADE_SECTORS) * Math.PI * 2;
      const angleB = PROFILE_PHASE
        + ((sector + 1) / NIMBUS_SPINDLE_FACADE_SECTORS) * Math.PI * 2;
      const lowerA = towerPoint(lowerRadius, angleA, lowerY);
      const lowerB = towerPoint(lowerRadius, angleB, lowerY);
      const upperA = towerPoint(upperRadius, angleA, upperY);
      const upperB = towerPoint(upperRadius, angleB, upperY);
      const tangent = subtract(midpoint(lowerB, upperB), midpoint(lowerA, upperA));
      const rise = subtract(midpoint(upperA, upperB), midpoint(lowerA, lowerB));
      const centre = midpoint(lowerA, lowerB, upperA, upperB);
      const serviceSpine = sector % 12 === 0;
      const glazed = !technical && !serviceSpine;
      const width = Math.hypot(...tangent) * 1.035;
      const height = Math.hypot(...rise) * 1.025;
      nimbusPrimitive(
        facade,
        `panel:${floor}:${sector}`,
        glazed ? "darkGlass" : "plastic",
        glazed ? "glassPane" : "panel",
        centre,
        [width, height, glazed ? 0.15 : 0.23],
        glazed
          ? GLASS
          : serviceSpine ? CERAMIC : (floor + sector) % 3 === 0
            ? CERAMIC_WARM
            : CERAMIC,
        {
          rotation: nimbusOrient(tangent, rise),
          textureProfile: glazed ? undefined : "nimbus-ceramic-composite",
          bearsLoad: false,
          sideAttachmentReach: 0.68,
          volume: width * height * (glazed ? 0.032 : 0.05),
        },
      );

      const boundaryAngle = angleA;
      nimbusRod(
        fittings,
        `mullion:${floor}:${sector}`,
        "steel",
        towerPoint(lowerRadius + 0.1, boundaryAngle, lowerY + 0.04),
        towerPoint(upperRadius + 0.1, boundaryAngle, upperY - 0.04),
        serviceSpine ? 0.3 : 0.16,
        serviceSpine ? CERAMIC : ARMOUR_DARK,
        {
          textureProfile: serviceSpine ? "nimbus-ceramic-composite" : "painted-steel",
          bearsLoad: false,
          sideAttachmentReach: 0.52,
        },
      );
    }
  }

  for (let floor = 6; floor < NIMBUS_SPINDLE_FLOORS; floor += 6) {
    const y = NIMBUS_SPINDLE_STRUCTURE_BASE_Y
      + floor * NIMBUS_SPINDLE_FLOOR_HEIGHT + 0.34;
    const radius = nimbusSpindleRadiusAtLevel(floor) + 0.18;
    for (let sector = 0; sector < NIMBUS_SPINDLE_FLOOR_SECTORS; sector += 1) {
      const left = PROFILE_PHASE
        + (sector / NIMBUS_SPINDLE_FLOOR_SECTORS) * Math.PI * 2 + 0.02;
      const right = PROFILE_PHASE
        + ((sector + 1) / NIMBUS_SPINDLE_FLOOR_SECTORS) * Math.PI * 2 - 0.02;
      nimbusRod(
        fittings,
        `technical-belt:${floor}:${sector}`,
        "steel",
        towerPoint(radius, left, y),
        towerPoint(radius, right, y),
        0.34,
        floor % 12 === 0 ? SERVICE_BLUE : ARMOUR_LIGHT,
        {
          textureProfile: "painted-steel",
          bearsLoad: false,
          sideAttachmentReach: 0.58,
        },
      );
    }
  }
}

function createStairs(stairs: NimbusMutableGroup): void {
  const stairRadius = 4.85;
  const turnPerFloor = Math.PI / 5;
  for (let route = 0; route < 2; route += 1) {
    const routePhase = PROFILE_PHASE + route * Math.PI;
    for (let floor = 0; floor < NIMBUS_SPINDLE_FLOORS; floor += 1) {
      const lowerY = NIMBUS_SPINDLE_STRUCTURE_BASE_Y
        + floor * NIMBUS_SPINDLE_FLOOR_HEIGHT + 0.32;
      const middleY = lowerY + NIMBUS_SPINDLE_FLOOR_HEIGHT / 2;
      const upperY = lowerY + NIMBUS_SPINDLE_FLOOR_HEIGHT - 0.32;
      const lowerAngle = routePhase + floor * turnPerFloor;
      const middleAngle = lowerAngle + turnPerFloor / 2;
      const upperAngle = lowerAngle + turnPerFloor;
      nimbusRod(
        stairs,
        `route:${route}:flight:${floor}:0`,
        "steel",
        towerPoint(stairRadius, lowerAngle, lowerY),
        towerPoint(stairRadius, middleAngle, middleY),
        0.28,
        route === 0 ? ARMOUR_LIGHT : SERVICE_ORANGE,
        {
          textureProfile: "painted-steel",
          attachmentSupportMode: "cable",
          sideAttachmentReach: 1.65,
          bearsLoad: false,
        },
      );
      nimbusRod(
        stairs,
        `route:${route}:flight:${floor}:1`,
        "steel",
        towerPoint(stairRadius, middleAngle, middleY),
        towerPoint(stairRadius, upperAngle, upperY),
        0.28,
        route === 0 ? ARMOUR_LIGHT : SERVICE_ORANGE,
        {
          textureProfile: "painted-steel",
          attachmentSupportMode: "cable",
          sideAttachmentReach: 1.65,
          bearsLoad: false,
        },
      );
      nimbusRod(
        stairs,
        `route:${route}:landing:${floor}`,
        "steel",
        towerPoint(stairRadius - 0.75, upperAngle, upperY),
        towerPoint(stairRadius + 0.75, upperAngle, upperY),
        0.32,
        floor % 6 === 5 ? SERVICE_BLUE : ARMOUR_MID,
        {
          textureProfile: "painted-steel",
          attachmentSupportMode: "cable",
          sideAttachmentReach: 1.65,
          bearsLoad: false,
        },
      );
    }
  }
}

function createCrown(crown: NimbusMutableGroup): void {
  const capTopY = NIMBUS_SPINDLE_ROOF_Y + 9;
  const capRadius = 2.8;
  for (let sector = 0; sector < NIMBUS_SPINDLE_FACADE_SECTORS; sector += 1) {
    const angleA = PROFILE_PHASE
      + (sector / NIMBUS_SPINDLE_FACADE_SECTORS) * Math.PI * 2;
    const angleB = PROFILE_PHASE
      + ((sector + 1) / NIMBUS_SPINDLE_FACADE_SECTORS) * Math.PI * 2;
    const lowerA = towerPoint(ROOF_RADIUS, angleA, NIMBUS_SPINDLE_ROOF_Y);
    const lowerB = towerPoint(ROOF_RADIUS, angleB, NIMBUS_SPINDLE_ROOF_Y);
    const upperA = towerPoint(capRadius, angleA, capTopY);
    const upperB = towerPoint(capRadius, angleB, capTopY);
    const tangent = subtract(midpoint(lowerB, upperB), midpoint(lowerA, upperA));
    const rise = subtract(midpoint(upperA, upperB), midpoint(lowerA, lowerB));
    const width = Math.hypot(...tangent) * 1.04;
    const height = Math.hypot(...rise) * 1.03;
    nimbusPrimitive(
      crown,
      `cap-shell:${sector}`,
      sector % 4 === 0 ? "plastic" : "darkGlass",
      sector % 4 === 0 ? "panel" : "glassPane",
      midpoint(lowerA, lowerB, upperA, upperB),
      [width, height, 0.2],
      sector % 4 === 0 ? CERAMIC : GLASS,
      {
        rotation: nimbusOrient(tangent, rise),
        textureProfile: sector % 4 === 0 ? "nimbus-ceramic-composite" : undefined,
        bearsLoad: false,
        sideAttachmentReach: 0.72,
        volume: width * height * 0.045,
      },
    );
  }

  for (let rib = 0; rib < 8; rib += 1) {
    const angle = PROFILE_PHASE + (rib / 8) * Math.PI * 2;
    nimbusRod(
      crown,
      `cap-rib:${rib}`,
      "steel",
      towerPoint(8.1, angle, NIMBUS_SPINDLE_ROOF_Y - 0.3),
      towerPoint(capRadius - 0.35, angle, capTopY),
      0.56,
      rib % 2 === 0 ? ARMOUR_LIGHT : ARMOUR_MID,
      {
        textureProfile: "painted-steel",
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.75,
        bearingArea: 64,
        carriesAttachments: true,
      },
    );
  }

  nimbusPrimitive(
    crown,
    "spire-deck",
    "steel",
    "steelSheet",
    [NIMBUS_SPINDLE_TOWER_CENTRE[0], capTopY, NIMBUS_SPINDLE_TOWER_CENTRE[1]],
    [5.4, 0.55, 5.4],
    ARMOUR_DARK,
    {
      textureProfile: "nimbus-technical-deck",
      attachmentSupportMode: "cable",
      sideAttachmentReach: 0.8,
      bearingArea: 70,
      carriesAttachments: true,
    },
  );

  const mastSegments = 5;
  const mastHeight = 4.6;
  for (let segment = 0; segment < mastSegments; segment += 1) {
    const width = 0.9 - segment * 0.11;
    nimbusPrimitive(
      crown,
      `lightning-spire:${segment}`,
      "steel",
      "steelSheet",
      [
        NIMBUS_SPINDLE_TOWER_CENTRE[0],
        capTopY + segment * mastHeight + mastHeight / 2,
        NIMBUS_SPINDLE_TOWER_CENTRE[1],
      ],
      [width, mastHeight, width],
      segment === mastSegments - 1 ? SERVICE_BLUE : ARMOUR_LIGHT,
      {
        textureProfile: "painted-steel",
        bearingArea: 28,
        carriesAttachments: true,
      },
    );
  }
}

export function createNimbusSpindleTower(
  groups: NimbusSpindleTowerGroups,
): void {
  createFoundation(groups.foundation, groups.armour);
  createCore(groups.core, groups.armour);
  createFloors(groups.floors, groups.frame);
  createFacade(groups.facade, groups.fittings);
  createStairs(groups.stairs);
  createCrown(groups.crown);
}
