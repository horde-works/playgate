import type { SceneVector3 } from "../../../game/destructionScene.ts";
import type { NimbusMutableGroup } from "./nimbusAuthoring.ts";
import {
  nimbusGradeContactBox,
  nimbusPrimitive,
  nimbusRod,
} from "./nimbusAuthoring.ts";
import {
  NIMBUS_BOWL_CENTER,
  NIMBUS_TOWER_CENTRE,
  nimbusGroundUnder,
} from "./nimbusShell.ts";

export const NIMBUS_TOWER_COLUMN_COUNT = 20;
export const NIMBUS_TOWER_SECTOR_COUNT = 12;
export const NIMBUS_TOWER_FLOORS = 22;
export const NIMBUS_TOWER_FLOOR_HEIGHT = 4.15;
export const NIMBUS_TOWER_COLUMN_RADIUS = 8.2;
export const NIMBUS_TOWER_CORE_RADIUS = 10.4;
export const NIMBUS_TOWER_FACADE_RADIUS = 18;
export const NIMBUS_TOWER_FOUNDATION_DEPTH = 11;

const COLUMN_SIZE = 1.55;
const CORE_WALL_THICKNESS = 1.25;
const FLOOR_THICKNESS = 0.3;
const TOWER_GROUND = nimbusGroundUnder(
  NIMBUS_TOWER_CENTRE[0],
  NIMBUS_TOWER_CENTRE[1],
).top;
const STRUCTURE_BASE_Y = TOWER_GROUND + 1.05;

const CONCRETE_DARK = "#686d6d";
const CONCRETE_MID = "#858987";
const CONCRETE_LIGHT = "#a2a4a0";
const ARMOUR_DARK = "#253239";
const ARMOUR_MID = "#46565d";
const ARMOUR_LIGHT = "#738187";
const CERAMIC = "#d8ddd9";
const CERAMIC_WARM = "#c7cbc5";
const GLASS = "#17313d";
const SERVICE_ORANGE = "#d96a30";

const TOWER_TO_BOWL = (() => {
  const x = NIMBUS_BOWL_CENTER[0] - NIMBUS_TOWER_CENTRE[0];
  const z = NIMBUS_BOWL_CENTER[1] - NIMBUS_TOWER_CENTRE[1];
  const length = Math.hypot(x, z);
  return [x / length, z / length] as const;
})();
// The fork opens across the bowl sightline, so both prongs remain legible
// from the machine yard instead of choosing an arbitrary world axis.
const LIGHTNING_FORK_AXIS = [-TOWER_TO_BOWL[1], TOWER_TO_BOWL[0]] as const;
const LIGHTNING_FORK_YAW = -Math.atan2(
  LIGHTNING_FORK_AXIS[1],
  LIGHTNING_FORK_AXIS[0],
);

function towerPoint(
  radius: number,
  angle: number,
  y: number,
): SceneVector3 {
  return [
    NIMBUS_TOWER_CENTRE[0] + Math.cos(angle) * radius,
    y,
    NIMBUS_TOWER_CENTRE[1] + Math.sin(angle) * radius,
  ];
}

function tangentYaw(angle: number): number {
  return -angle - Math.PI / 2;
}

function chordWidth(radius: number, count: number, fill = 0.94): number {
  return 2 * radius * Math.sin(Math.PI / count) * fill;
}

function createFoundation(
  foundation: NimbusMutableGroup,
  armour: NimbusMutableGroup,
): void {
  const caissonHeight = NIMBUS_TOWER_FOUNDATION_DEPTH + 1.05;
  for (let index = 0; index < NIMBUS_TOWER_COLUMN_COUNT; index += 1) {
    const angle = (index / NIMBUS_TOWER_COLUMN_COUNT) * Math.PI * 2;
    const centre = towerPoint(
      NIMBUS_TOWER_COLUMN_RADIUS,
      angle,
      TOWER_GROUND - NIMBUS_TOWER_FOUNDATION_DEPTH + caissonHeight / 2,
    );
    const size: SceneVector3 = [1.9, caissonHeight, 1.9];
    const localGround = nimbusGroundUnder(centre[0], centre[2]).top;
    nimbusPrimitive(
      foundation,
      `caisson:${index}`,
      "concrete",
      "cinderBlock",
      centre,
      size,
      index % 2 === 0 ? CONCRETE_DARK : "#747978",
      {
        textureProfile: "nimbus-board-formed-concrete",
        contactBoxes: [
          nimbusGradeContactBox(
            centre[1],
            [size[0], size[2]],
            localGround,
          ),
          {
            position: [0, size[1] / 2 - 0.05, 0],
            size: [size[0], 0.1, size[2]],
          },
        ],
        contactBearingOrder: true,
        // Effective geotechnical bearing includes the eleven-metre shaft skin,
        // not only the visible 1.9 m pile cap.
        bearingArea: 52,
      },
    );

    const shoe = towerPoint(
      NIMBUS_TOWER_COLUMN_RADIUS,
      angle,
      TOWER_GROUND - 0.15,
    );
    nimbusPrimitive(
      armour,
      `caisson-shoe:${index}`,
      "steel",
      "steelSheet",
      shoe,
      [2.35, 2.5, 2.35],
      ARMOUR_DARK,
      {
        textureProfile: "painted-steel",
        bearsLoad: false,
        sideAttachmentReach: 0.7,
        volume: 1.3,
      },
    );
  }

  // The raft is a ring of independent arcs. Destroying one arc does not turn
  // the whole foundation into one detached plate.
  for (let sector = 0; sector < NIMBUS_TOWER_COLUMN_COUNT; sector += 1) {
    const angle = ((sector + 0.5) / NIMBUS_TOWER_COLUMN_COUNT) * Math.PI * 2;
    const centre = towerPoint(9.25, angle, TOWER_GROUND + 0.4);
    const size: SceneVector3 = [
      chordWidth(9.25, NIMBUS_TOWER_COLUMN_COUNT, 1.02),
      1.3,
      4.8,
    ];
    nimbusPrimitive(
      foundation,
      `raft:${sector}`,
      "concrete",
      "panel",
      centre,
      size,
      sector % 2 === 0 ? CONCRETE_MID : "#7b807e",
      {
        rotation: [0, tangentYaw(angle), 0],
        textureProfile: "nimbus-board-formed-concrete",
        contactBoxes: [
          nimbusGradeContactBox(
            centre[1],
            [size[0], size[2]],
            nimbusGroundUnder(centre[0], centre[2]).top,
          ),
          {
            position: [0, size[1] / 2 - 0.05, 0],
            size: [size[0], 0.1, size[2]],
          },
        ],
        bearingArea: 24,
      },
    );

    const plate = towerPoint(11.15, angle, TOWER_GROUND - 0.35);
    nimbusPrimitive(
      armour,
      `buried-armour:${sector}`,
      "steel",
      "steelSheet",
      plate,
      [chordWidth(11.15, NIMBUS_TOWER_COLUMN_COUNT), 3.2, 0.28],
      sector % 3 === 0 ? ARMOUR_MID : ARMOUR_DARK,
      {
        rotation: [0, tangentYaw(angle), 0],
        textureProfile: "painted-steel",
        bearsLoad: false,
        sideAttachmentReach: 0.7,
      },
    );
  }

  // A faceted blast plinth carries the lowest facade course and continues
  // the foundation into the rim instead of leaving the skin floating above it.
  for (let sector = 0; sector < NIMBUS_TOWER_SECTOR_COUNT; sector += 1) {
    const angle = ((sector + 0.5) / NIMBUS_TOWER_SECTOR_COUNT) * Math.PI * 2;
    const centre = towerPoint(16.7, angle, TOWER_GROUND + 0.525);
    const width = chordWidth(16.7, NIMBUS_TOWER_SECTOR_COUNT, 0.94);
    nimbusPrimitive(
      foundation,
      `facade-plinth:${sector}`,
      "concrete",
      "panel",
      centre,
      [width, 1.05, 2.8],
      sector % 3 === 0 ? CONCRETE_DARK : CONCRETE_MID,
      {
        rotation: [0, tangentYaw(angle), 0],
        textureProfile: "nimbus-board-formed-concrete",
        contactBoxes: [
          nimbusGradeContactBox(
            centre[1],
            [width, 2.8],
            nimbusGroundUnder(centre[0], centre[2]).top,
          ),
          {
            position: [0, 1.05 / 2 - 0.05, 0],
            size: [width, 0.1, 2.8],
          },
        ],
        contactBearingOrder: true,
        attachmentSupportMode: "cable",
      },
    );
  }
}

function createVerticalStructure(
  core: NimbusMutableGroup,
  armour: NimbusMutableGroup,
): void {
  const wallWidth = chordWidth(
    NIMBUS_TOWER_CORE_RADIUS,
    NIMBUS_TOWER_COLUMN_COUNT,
    1.03,
  );
  for (let floor = 0; floor < NIMBUS_TOWER_FLOORS; floor += 1) {
    const segmentBottom = STRUCTURE_BASE_Y + floor * NIMBUS_TOWER_FLOOR_HEIGHT;
    const segmentCentreY = segmentBottom + NIMBUS_TOWER_FLOOR_HEIGHT / 2;
    for (let index = 0; index < NIMBUS_TOWER_COLUMN_COUNT; index += 1) {
      const angle = (index / NIMBUS_TOWER_COLUMN_COUNT) * Math.PI * 2;
      const column = towerPoint(NIMBUS_TOWER_COLUMN_RADIUS, angle, segmentCentreY);
      nimbusPrimitive(
        core,
        `column:${floor}:${index}`,
        "concrete",
        "cinderBlock",
        column,
        [COLUMN_SIZE, NIMBUS_TOWER_FLOOR_HEIGHT, COLUMN_SIZE],
        index % 3 === 0 ? CONCRETE_LIGHT : CONCRETE_MID,
        {
          textureProfile: "nimbus-board-formed-concrete",
          bearingArea: 8.5,
        },
      );

      const wallAngle = ((index + 0.5) / NIMBUS_TOWER_COLUMN_COUNT) * Math.PI * 2;
      const wall = towerPoint(NIMBUS_TOWER_CORE_RADIUS, wallAngle, segmentCentreY);
      nimbusPrimitive(
        core,
        `core-wall:${floor}:${index}`,
        "concrete",
        "cinderBlock",
        wall,
        [wallWidth, NIMBUS_TOWER_FLOOR_HEIGHT, CORE_WALL_THICKNESS],
        floor % 4 === 3 ? CONCRETE_DARK : CONCRETE_MID,
        {
          rotation: [0, tangentYaw(wallAngle), 0],
          textureProfile: "nimbus-board-formed-concrete",
          bearingArea: 12,
        },
      );

      // Each armour plate belongs to one concrete wall segment and carries no
      // floor load. Its narrow gaps are real service seams, not structural
      // separation of the core.
      const armourPlate = towerPoint(
        NIMBUS_TOWER_CORE_RADIUS + CORE_WALL_THICKNESS / 2 + 0.16,
        wallAngle,
        segmentCentreY,
      );
      nimbusPrimitive(
        armour,
        `core-armour:${floor}:${index}`,
        "steel",
        "steelSheet",
        armourPlate,
        [wallWidth * 0.91, NIMBUS_TOWER_FLOOR_HEIGHT * 0.91, 0.24],
        (floor + index) % 5 === 0 ? ARMOUR_MID : ARMOUR_DARK,
        {
          rotation: [0, tangentYaw(wallAngle), 0],
          textureProfile: "painted-steel",
          bearsLoad: false,
          sideAttachmentReach: 0.48,
          volume: wallWidth * NIMBUS_TOWER_FLOOR_HEIGHT * 0.035,
        },
      );
    }
  }
}

function createSectorFloors(
  floors: NimbusMutableGroup,
  frame: NimbusMutableGroup,
): void {
  const radialBands = [
    { radius: 11.65, depth: 2.2 },
    { radius: 14.05, depth: 2.45 },
    { radius: 16.65, depth: 2.7 },
  ] as const;

  for (let floor = 0; floor < NIMBUS_TOWER_FLOORS; floor += 1) {
    const floorY = STRUCTURE_BASE_Y + (floor + 1) * NIMBUS_TOWER_FLOOR_HEIGHT;
    for (let sector = 0; sector < NIMBUS_TOWER_SECTOR_COUNT; sector += 1) {
      const angle = ((sector + 0.5) / NIMBUS_TOWER_SECTOR_COUNT) * Math.PI * 2;
      const leftAngle = (sector / NIMBUS_TOWER_SECTOR_COUNT) * Math.PI * 2 + 0.035;
      const rightAngle = ((sector + 1) / NIMBUS_TOWER_SECTOR_COUNT) * Math.PI * 2 - 0.035;

      for (const [beamIndex, beamAngle] of [leftAngle, rightAngle].entries()) {
        nimbusRod(
          frame,
          `radial:${floor}:${sector}:${beamIndex}`,
          "steel",
          towerPoint(9.9, beamAngle, floorY - 0.43),
          towerPoint(17.55, beamAngle, floorY - 0.43),
          0.52,
          beamIndex === 0 ? ARMOUR_LIGHT : ARMOUR_MID,
          {
            textureProfile: "painted-steel",
            sideAttachmentReach: 0.72,
            attachmentSupportMode: "cable",
          },
        );
      }

      nimbusRod(
        frame,
        `outer-ring:${floor}:${sector}`,
        "steel",
        towerPoint(17.25, leftAngle, floorY - 0.43),
        towerPoint(17.25, rightAngle, floorY - 0.43),
        0.46,
        floor % 4 === 3 ? SERVICE_ORANGE : ARMOUR_MID,
        {
          textureProfile: "painted-steel",
          sideAttachmentReach: 0.7,
          attachmentSupportMode: "cable",
        },
      );

      for (const [secondaryIndex, radius] of [12.8, 15.35].entries()) {
        nimbusRod(
          frame,
          `secondary-ring:${floor}:${sector}:${secondaryIndex}`,
          "steel",
          towerPoint(radius, leftAngle, floorY - 0.43),
          towerPoint(radius, rightAngle, floorY - 0.43),
          0.3,
          secondaryIndex === 0 ? ARMOUR_DARK : ARMOUR_MID,
          {
            textureProfile: "painted-steel",
            sideAttachmentReach: 0.4,
            attachmentSupportMode: "cable",
          },
        );
      }

      for (const [bandIndex, band] of radialBands.entries()) {
        const centre = towerPoint(band.radius, angle, floorY);
        const tangentialWidth = 2 * band.radius
          * Math.tan(Math.PI / NIMBUS_TOWER_SECTOR_COUNT)
          * 0.9;
        nimbusPrimitive(
          floors,
          `slab:${floor}:${sector}:${bandIndex}`,
          "concrete",
          "panel",
          centre,
          [tangentialWidth, FLOOR_THICKNESS, band.depth],
          bandIndex === 1 ? "#90938f" : "#858884",
          {
            rotation: [0, tangentYaw(angle), 0],
            contactBoxes: [{
              position: [0, 0, 0],
              size: [tangentialWidth, FLOOR_THICKNESS, band.depth],
            }],
            textureProfile: "nimbus-board-formed-concrete",
            contactBearingOrder: true,
            attachmentSupportMode: "cable",
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
  const panelWidth = chordWidth(
    NIMBUS_TOWER_FACADE_RADIUS,
    NIMBUS_TOWER_SECTOR_COUNT,
    0.9,
  );
  for (let floor = 0; floor < NIMBUS_TOWER_FLOORS; floor += 1) {
    const bottom = STRUCTURE_BASE_Y + floor * NIMBUS_TOWER_FLOOR_HEIGHT;
    const technical = floor === 0 || floor % 4 === 3;
    const panelHeight = technical ? 2.65 : 3.25;
    const panelCentreY = bottom + 0.05 + panelHeight / 2;
    for (let sector = 0; sector < NIMBUS_TOWER_SECTOR_COUNT; sector += 1) {
      const angle = ((sector + 0.5) / NIMBUS_TOWER_SECTOR_COUNT) * Math.PI * 2;
      const material = technical || (floor + sector) % 5 === 0
        ? "plastic"
        : "darkGlass";
      const centre = towerPoint(NIMBUS_TOWER_FACADE_RADIUS, angle, panelCentreY);
      nimbusPrimitive(
        facade,
        `panel:${floor}:${sector}`,
        material,
        material === "darkGlass" ? "glassPane" : "panel",
        centre,
        [panelWidth, panelHeight, material === "darkGlass" ? 0.16 : 0.22],
        material === "darkGlass"
          ? GLASS
          : (floor + sector) % 3 === 0 ? CERAMIC_WARM : CERAMIC,
        {
          rotation: [0, tangentYaw(angle), 0],
          textureProfile: material === "plastic" ? "nimbus-ceramic-composite" : undefined,
          bearsLoad: false,
          sideAttachmentReach: 0.55,
          volume: panelWidth * panelHeight * 0.045,
        },
      );

      const boundaryAngle = (sector / NIMBUS_TOWER_SECTOR_COUNT) * Math.PI * 2;
      const mullion = towerPoint(
        NIMBUS_TOWER_FACADE_RADIUS + 0.08,
        boundaryAngle,
        bottom + NIMBUS_TOWER_FLOOR_HEIGHT / 2,
      );
      nimbusPrimitive(
        fittings,
        `mullion:${floor}:${sector}`,
        "steel",
        "steelSheet",
        mullion,
        [0.24, NIMBUS_TOWER_FLOOR_HEIGHT, 0.34],
        technical ? SERVICE_ORANGE : ARMOUR_DARK,
        {
          rotation: [0, tangentYaw(boundaryAngle), 0],
          textureProfile: "painted-steel",
          bearsLoad: false,
          sideAttachmentReach: 0.5,
        },
      );
    }
  }

  for (let belt = 4; belt < NIMBUS_TOWER_FLOORS; belt += 4) {
    const y = STRUCTURE_BASE_Y + belt * NIMBUS_TOWER_FLOOR_HEIGHT + 0.42;
    for (let sector = 0; sector < NIMBUS_TOWER_SECTOR_COUNT; sector += 1) {
      const left = (sector / NIMBUS_TOWER_SECTOR_COUNT) * Math.PI * 2 + 0.025;
      const right = ((sector + 1) / NIMBUS_TOWER_SECTOR_COUNT) * Math.PI * 2 - 0.025;
      nimbusRod(
        fittings,
        `technical-belt:${belt}:${sector}`,
        "steel",
        towerPoint(18.25, left, y),
        towerPoint(18.25, right, y),
        0.38,
        belt % 8 === 0 ? SERVICE_ORANGE : ARMOUR_LIGHT,
        {
          textureProfile: "painted-steel",
          bearsLoad: false,
          sideAttachmentReach: 0.55,
        },
      );
    }
  }
}

function createCrown(
  crown: NimbusMutableGroup,
): void {
  const roofY = STRUCTURE_BASE_Y + NIMBUS_TOWER_FLOORS * NIMBUS_TOWER_FLOOR_HEIGHT;
  for (let sector = 0; sector < NIMBUS_TOWER_SECTOR_COUNT; sector += 1) {
    const angle = ((sector + 0.5) / NIMBUS_TOWER_SECTOR_COUNT) * Math.PI * 2;
    const centre = towerPoint(8.6, angle, roofY + 0.3);
    nimbusPrimitive(
      crown,
      `roof:${sector}`,
      "steel",
      "steelSheet",
      centre,
      [chordWidth(8.6, NIMBUS_TOWER_SECTOR_COUNT, 0.93), 0.6, 4.4],
      sector % 3 === 0 ? ARMOUR_LIGHT : ARMOUR_MID,
      {
        rotation: [0, tangentYaw(angle), 0],
        textureProfile: "painted-steel",
        attachmentSupportMode: "cable",
        carriesAttachments: true,
      },
    );
  }

  nimbusPrimitive(
    crown,
    "lightning-deck",
    "steel",
    "steelSheet",
    [NIMBUS_TOWER_CENTRE[0], roofY + 0.3, NIMBUS_TOWER_CENTRE[1]],
    [14, 0.6, 4],
    ARMOUR_DARK,
    {
      rotation: [0, LIGHTNING_FORK_YAW, 0],
      textureProfile: "nimbus-technical-deck",
      attachmentSupportMode: "cable",
      carriesAttachments: true,
    },
  );

  for (const side of [-1, 1]) {
    const base: SceneVector3 = [
      NIMBUS_TOWER_CENTRE[0] + LIGHTNING_FORK_AXIS[0] * side * 3.5,
      roofY + 0.6,
      NIMBUS_TOWER_CENTRE[1] + LIGHTNING_FORK_AXIS[1] * side * 3.5,
    ];
    const shoulder: SceneVector3 = [
      NIMBUS_TOWER_CENTRE[0] + LIGHTNING_FORK_AXIS[0] * side * 2.6,
      roofY + 13.5,
      NIMBUS_TOWER_CENTRE[1] + LIGHTNING_FORK_AXIS[1] * side * 2.6,
    ];
    const tip: SceneVector3 = [
      NIMBUS_TOWER_CENTRE[0] + LIGHTNING_FORK_AXIS[0] * side * 1.15,
      roofY + 24,
      NIMBUS_TOWER_CENTRE[1] + LIGHTNING_FORK_AXIS[1] * side * 1.15,
    ];
    nimbusRod(crown, `spire:${side}:lower`, "steel", base, shoulder, 0.74, ARMOUR_LIGHT, {
      textureProfile: "painted-steel",
      sideAttachmentReach: 0.45,
      attachmentSupportMode: "cable",
    });
    nimbusRod(crown, `spire:${side}:upper`, "steel", shoulder, tip, 0.42, CERAMIC, {
      textureProfile: "matte-aluminium",
      sideAttachmentReach: 0.45,
      attachmentSupportMode: "cable",
    });
  }
  nimbusRod(
    crown,
    "spire:bridge",
    "steel",
    [
      NIMBUS_TOWER_CENTRE[0] - LIGHTNING_FORK_AXIS[0] * 2.6,
      roofY + 13.5,
      NIMBUS_TOWER_CENTRE[1] - LIGHTNING_FORK_AXIS[1] * 2.6,
    ],
    [
      NIMBUS_TOWER_CENTRE[0] + LIGHTNING_FORK_AXIS[0] * 2.6,
      roofY + 13.5,
      NIMBUS_TOWER_CENTRE[1] + LIGHTNING_FORK_AXIS[1] * 2.6,
    ],
    0.48,
    SERVICE_ORANGE,
    { textureProfile: "painted-steel", sideAttachmentReach: 0.45 },
  );
}

export interface NimbusTowerGroups {
  readonly foundation: NimbusMutableGroup;
  readonly core: NimbusMutableGroup;
  readonly armour: NimbusMutableGroup;
  readonly floors: NimbusMutableGroup;
  readonly frame: NimbusMutableGroup;
  readonly facade: NimbusMutableGroup;
  readonly fittings: NimbusMutableGroup;
  readonly crown: NimbusMutableGroup;
}

export function createNimbusTower(groups: NimbusTowerGroups): void {
  createFoundation(groups.foundation, groups.armour);
  createVerticalStructure(groups.core, groups.armour);
  createSectorFloors(groups.floors, groups.frame);
  createFacade(groups.facade, groups.fittings);
  createCrown(groups.crown);
}
