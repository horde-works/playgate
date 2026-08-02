import type { SceneVector3 } from "../../../game/destructionScene.ts";
import type { NimbusMutableGroup } from "./nimbusAuthoring.ts";
import {
  nimbusGradeContactBox,
  nimbusOrient,
  nimbusPrimitive,
  nimbusRod,
} from "./nimbusAuthoring.ts";
import {
  NIMBUS_SHIPYARD_CENTRE,
  NIMBUS_VERTICAL_DOCK_CENTRE,
  nimbusGroundUnder,
} from "./nimbusShell.ts";

export const NIMBUS_DOCK_FLOOR_HEIGHT = 4.1;
export const NIMBUS_DOCK_REAR_FLOORS = 36;
export const NIMBUS_DOCK_SERVICE_FLOORS = 32;
export const NIMBUS_DOCK_HABITATION_FLOORS = 28;
export const NIMBUS_DOCK_FOUNDATION_DEPTH = 14;
export const NIMBUS_DOCK_VOID_HALF_WIDTH = 20;
export const NIMBUS_DOCK_VOID_HEIGHT = 112;
export const NIMBUS_DOCK_VOID_FORWARD_RANGE = [-8, 26] as const;

const REAR_ACROSS_STATIONS = [-30, -20, -10, 0, 10, 20, 30] as const;
const CHEEK_FORWARD_STATIONS = [-10, -2, 6, 14, 22] as const;
const REAR_FORWARD_ROWS = [-21, -11] as const;
const SERVICE_SIDE = -1 as const;
const HABITATION_SIDE = 1 as const;

const CONCRETE_DARK = "#5f6668";
const CONCRETE_MID = "#808683";
const ARMOUR_DARK = "#25343a";
const ARMOUR_MID = "#4c5d63";
const ARMOUR_LIGHT = "#849397";
const CERAMIC = "#dce1de";
const CERAMIC_WARM = "#c8cec9";
const GLASS = "#15313c";
const SERVICE_BLUE = "#4cadbc";
const SERVICE_ORANGE = "#d66b31";

const APPROACH_DELTA = [
  NIMBUS_SHIPYARD_CENTRE[0] - NIMBUS_VERTICAL_DOCK_CENTRE[0],
  NIMBUS_SHIPYARD_CENTRE[1] - NIMBUS_VERTICAL_DOCK_CENTRE[1],
] as const;
const APPROACH_LENGTH = Math.hypot(...APPROACH_DELTA);
/** Mouth direction: from the dock toward the actual shipyard corridor. */
export const NIMBUS_DOCK_FORWARD: readonly [number, number] = [
  APPROACH_DELTA[0] / APPROACH_LENGTH,
  APPROACH_DELTA[1] / APPROACH_LENGTH,
];
export const NIMBUS_DOCK_ACROSS: readonly [number, number] = [
  -NIMBUS_DOCK_FORWARD[1],
  NIMBUS_DOCK_FORWARD[0],
];
const DOCK_ROTATION = nimbusOrient(
  [NIMBUS_DOCK_ACROSS[0], 0, NIMBUS_DOCK_ACROSS[1]],
  [0, 1, 0],
);

interface NimbusVerticalDockGroups {
  readonly foundation: NimbusMutableGroup;
  readonly primary: NimbusMutableGroup;
  readonly armour: NimbusMutableGroup;
  readonly floors: NimbusMutableGroup;
  readonly facade: NimbusMutableGroup;
  readonly dockFrame: NimbusMutableGroup;
  readonly lifts: NimbusMutableGroup;
  readonly stairs: NimbusMutableGroup;
  readonly fittings: NimbusMutableGroup;
  readonly crown: NimbusMutableGroup;
}

interface DockColumn {
  readonly id: string;
  readonly across: number;
  readonly forward: number;
  readonly floors: number;
  readonly owner: "rear" | "service" | "habitation";
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

export function nimbusDockLocalCoordinates(
  point: SceneVector3,
): readonly [across: number, forward: number, y: number] {
  const dx = point[0] - NIMBUS_VERTICAL_DOCK_CENTRE[0];
  const dz = point[2] - NIMBUS_VERTICAL_DOCK_CENTRE[1];
  return [
    dx * NIMBUS_DOCK_ACROSS[0] + dz * NIMBUS_DOCK_ACROSS[1],
    dx * NIMBUS_DOCK_FORWARD[0] + dz * NIMBUS_DOCK_FORWARD[1],
    point[1],
  ];
}

function localGround(across: number, forward: number): number {
  const point = dockPoint(across, forward, 0);
  return nimbusGroundUnder(point[0], point[2]).top;
}

const DOCK_COLUMNS: readonly DockColumn[] = [
  ...REAR_ACROSS_STATIONS.flatMap((across) =>
    REAR_FORWARD_ROWS.map((forward) => ({
      id: `rear:${across}:${forward}`,
      across,
      forward,
      floors: NIMBUS_DOCK_REAR_FLOORS,
      owner: "rear" as const,
    })),
  ),
  ...CHEEK_FORWARD_STATIONS.flatMap((forward) => [
    {
      id: `service:inner:${forward}`,
      across: -24,
      forward,
      floors: NIMBUS_DOCK_SERVICE_FLOORS,
      owner: "service" as const,
    },
    {
      id: `service:outer:${forward}`,
      across: -34,
      forward,
      floors: NIMBUS_DOCK_SERVICE_FLOORS,
      owner: "service" as const,
    },
    {
      id: `habitation:inner:${forward}`,
      across: 24,
      forward,
      floors: NIMBUS_DOCK_HABITATION_FLOORS,
      owner: "habitation" as const,
    },
    {
      id: `habitation:outer:${forward}`,
      across: 34,
      forward,
      floors: NIMBUS_DOCK_HABITATION_FLOORS,
      owner: "habitation" as const,
    },
  ]),
];

const FOUNDATION_GRADE = Math.max(
  ...DOCK_COLUMNS.map((column) => localGround(column.across, column.forward)),
);
export const NIMBUS_DOCK_STRUCTURE_BASE_Y = FOUNDATION_GRADE + 1;
export const NIMBUS_DOCK_REAR_ROOF_Y = NIMBUS_DOCK_STRUCTURE_BASE_Y
  + NIMBUS_DOCK_REAR_FLOORS * NIMBUS_DOCK_FLOOR_HEIGHT;

const CORE_ROOTS = [
  ...REAR_ACROSS_STATIONS.map((across) => ({
    id: `rear:${across}`,
    across,
    forward: -17,
  })),
  ...[SERVICE_SIDE, HABITATION_SIDE].flatMap((side) =>
    CHEEK_FORWARD_STATIONS.map((forward) => ({
      id: `cheek:${side}:${forward}`,
      across: side * 29,
      forward,
    })),
  ),
] as const;

function createFoundation(
  foundation: NimbusMutableGroup,
  armour: NimbusMutableGroup,
): void {
  for (const [index, column] of DOCK_COLUMNS.entries()) {
    const ground = localGround(column.across, column.forward);
    const bottom = ground - NIMBUS_DOCK_FOUNDATION_DEPTH;
    const height = NIMBUS_DOCK_STRUCTURE_BASE_Y - bottom;
    const centre = dockPoint(
      column.across,
      column.forward,
      bottom + height / 2,
    );
    const size: SceneVector3 = [1.9, height, 1.9];
    nimbusPrimitive(
      foundation,
      `caisson:${column.id}`,
      "concrete",
      "cinderBlock",
      centre,
      size,
      index % 3 === 0 ? CONCRETE_DARK : CONCRETE_MID,
      {
        rotation: DOCK_ROTATION,
        textureProfile: "nimbus-board-formed-concrete",
        contactBoxes: [
          nimbusGradeContactBox(centre[1], [0.5, 0.5], ground - 0.24),
          {
            position: [0, size[1] / 2 - 0.05, 0],
            size: [size[0], 0.1, size[2]],
          },
        ],
        contactBearingOrder: true,
        bearingArea: 4_000,
      },
    );
  }

  for (const root of CORE_ROOTS) {
    const ground = localGround(root.across, root.forward);
    const bottom = ground - NIMBUS_DOCK_FOUNDATION_DEPTH;
    const height = NIMBUS_DOCK_STRUCTURE_BASE_Y - bottom;
    const centre = dockPoint(root.across, root.forward, bottom + height / 2);
    nimbusPrimitive(
      foundation,
      `core-caisson:${root.id}`,
      "concrete",
      "cinderBlock",
      centre,
      [2.1, height, 2.1],
      root.id.startsWith("rear") ? CONCRETE_DARK : CONCRETE_MID,
      {
        rotation: DOCK_ROTATION,
        textureProfile: "nimbus-board-formed-concrete",
        contactBoxes: [
          nimbusGradeContactBox(centre[1], [0.5, 0.5], ground - 0.24),
          {
            position: [0, height / 2 - 0.05, 0],
            size: [2.1, 0.1, 2.1],
          },
        ],
        contactBearingOrder: true,
        bearingArea: 4_000,
      },
    );
  }

  // Three independent buried rafts follow the C topology. They do not bridge
  // the open mouth or turn both cheeks into one detachable foundation plate.
  for (const [index, across] of REAR_ACROSS_STATIONS.entries()) {
    nimbusPrimitive(
      foundation,
      `rear-raft:${index}`,
      "concrete",
      "panel",
      dockPoint(across, -16, NIMBUS_DOCK_STRUCTURE_BASE_Y - 0.55),
      [9.8, 1.1, 12],
      index % 2 === 0 ? CONCRETE_DARK : CONCRETE_MID,
      {
        rotation: DOCK_ROTATION,
        textureProfile: "nimbus-board-formed-concrete",
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.7,
        bearsLoad: false,
      },
    );
  }
  for (const side of [SERVICE_SIDE, HABITATION_SIDE]) {
    for (const [index, forward] of CHEEK_FORWARD_STATIONS.entries()) {
      nimbusPrimitive(
        foundation,
        `cheek-raft:${side}:${index}`,
        "concrete",
        "panel",
        dockPoint(side * 29, forward, NIMBUS_DOCK_STRUCTURE_BASE_Y - 0.55),
        [12, 1.1, 7.8],
        index % 2 === 0 ? CONCRETE_DARK : CONCRETE_MID,
        {
          rotation: DOCK_ROTATION,
          textureProfile: "nimbus-board-formed-concrete",
          attachmentSupportMode: "cable",
          sideAttachmentReach: 0.7,
          bearsLoad: false,
        },
      );
    }
  }

  for (const side of [SERVICE_SIDE, HABITATION_SIDE]) {
    for (const [index, forward] of CHEEK_FORWARD_STATIONS.entries()) {
      nimbusPrimitive(
        armour,
        `buried-cheek:${side}:${index}`,
        "steel",
        "steelSheet",
        dockPoint(side * 35.1, forward, FOUNDATION_GRADE - 1.2),
        [0.28, 5.5, 7.4],
        index % 3 === 0 ? ARMOUR_MID : ARMOUR_DARK,
        {
          rotation: DOCK_ROTATION,
          textureProfile: "painted-steel",
          bearsLoad: false,
          sideAttachmentReach: 0.7,
        },
      );
    }
  }
}

function createPrimaryStructure(
  primary: NimbusMutableGroup,
  armour: NimbusMutableGroup,
): void {
  for (const column of DOCK_COLUMNS) {
    for (let floor = 0; floor < column.floors; floor += 1) {
      const y = NIMBUS_DOCK_STRUCTURE_BASE_Y
        + (floor + 0.5) * NIMBUS_DOCK_FLOOR_HEIGHT;
      nimbusPrimitive(
        primary,
        `column:${column.id}:${floor}`,
        "concrete",
        "cinderBlock",
        dockPoint(column.across, column.forward, y),
        [1.45, NIMBUS_DOCK_FLOOR_HEIGHT, 1.45],
        floor % 6 === 5 ? CONCRETE_DARK : CONCRETE_MID,
        {
          rotation: DOCK_ROTATION,
          textureProfile: "nimbus-board-formed-concrete",
          bearingArea: 1_400,
        },
      );
    }
  }

  for (let floor = 0; floor < NIMBUS_DOCK_REAR_FLOORS; floor += 1) {
    const y = NIMBUS_DOCK_STRUCTURE_BASE_Y
      + (floor + 0.5) * NIMBUS_DOCK_FLOOR_HEIGHT;
    for (const [sector, across] of REAR_ACROSS_STATIONS.entries()) {
      nimbusPrimitive(
        primary,
        `rear-core:${floor}:${sector}`,
        "concrete",
        "cinderBlock",
        dockPoint(across, -17, y),
        [9.85, NIMBUS_DOCK_FLOOR_HEIGHT, 2.1],
        sector % 3 === 0 ? CONCRETE_DARK : CONCRETE_MID,
        {
          rotation: DOCK_ROTATION,
          textureProfile: "nimbus-board-formed-concrete",
          bearingArea: 2_400,
        },
      );
      nimbusPrimitive(
        armour,
        `rear-core-armour:${floor}:${sector}`,
        "steel",
        "steelSheet",
        dockPoint(across, -18.2, y),
        [9.25, NIMBUS_DOCK_FLOOR_HEIGHT * 0.9, 0.24],
        (floor + sector) % 5 === 0 ? ARMOUR_MID : ARMOUR_DARK,
        {
          rotation: DOCK_ROTATION,
          textureProfile: "painted-steel",
          bearsLoad: false,
          sideAttachmentReach: 0.55,
          volume: 0.8,
        },
      );
    }
  }

  for (const side of [SERVICE_SIDE, HABITATION_SIDE]) {
    const floors = side === SERVICE_SIDE
      ? NIMBUS_DOCK_SERVICE_FLOORS
      : NIMBUS_DOCK_HABITATION_FLOORS;
    for (let floor = 0; floor < floors; floor += 1) {
      const y = NIMBUS_DOCK_STRUCTURE_BASE_Y
        + (floor + 0.5) * NIMBUS_DOCK_FLOOR_HEIGHT;
      for (const [sector, forward] of CHEEK_FORWARD_STATIONS.entries()) {
        nimbusPrimitive(
          primary,
          `cheek-core:${side}:${floor}:${sector}`,
          "concrete",
          "cinderBlock",
          dockPoint(side * 29, forward, y),
          [2.1, NIMBUS_DOCK_FLOOR_HEIGHT, 7.85],
          sector % 3 === 0 ? CONCRETE_DARK : CONCRETE_MID,
          {
            rotation: DOCK_ROTATION,
            textureProfile: "nimbus-board-formed-concrete",
            bearingArea: 2_200,
          },
        );
        nimbusPrimitive(
          armour,
          `cheek-core-armour:${side}:${floor}:${sector}`,
          "steel",
          "steelSheet",
          dockPoint(side * 30.2, forward, y),
          [0.24, NIMBUS_DOCK_FLOOR_HEIGHT * 0.9, 7.25],
          (floor + sector) % 5 === 0 ? ARMOUR_MID : ARMOUR_DARK,
          {
            rotation: DOCK_ROTATION,
            textureProfile: "painted-steel",
            bearsLoad: false,
            sideAttachmentReach: 0.55,
            volume: 0.75,
          },
        );
      }
    }
  }
}

function createFloors(
  floors: NimbusMutableGroup,
  dockFrame: NimbusMutableGroup,
): void {
  for (let floor = 0; floor < NIMBUS_DOCK_REAR_FLOORS; floor += 1) {
    const y = NIMBUS_DOCK_STRUCTURE_BASE_Y
      + (floor + 1) * NIMBUS_DOCK_FLOOR_HEIGHT;
    for (const [sector, across] of REAR_ACROSS_STATIONS.entries()) {
      nimbusPrimitive(
        floors,
        `rear-slab:${floor}:${sector}`,
        "concrete",
        "panel",
        dockPoint(across, -16, y),
        [9.65, 0.3, 12],
        sector % 2 === 0 ? "#898e8a" : "#7e8480",
        {
          rotation: DOCK_ROTATION,
          textureProfile: "nimbus-board-formed-concrete",
          contactBearingOrder: true,
          attachmentSupportMode: "cable",
          sideAttachmentReach: 0.72,
        },
      );
      nimbusRod(
        dockFrame,
        `rear-beam:${floor}:${sector}`,
        "steel",
        dockPoint(across, -22, y - 0.48),
        dockPoint(across, -10, y - 0.48),
        0.5,
        floor % 6 === 5 ? SERVICE_BLUE : ARMOUR_MID,
        {
          textureProfile: "painted-steel",
          attachmentSupportMode: "cable",
          sideAttachmentReach: 0.7,
          bearingArea: 32,
        },
      );
    }
  }

  for (const side of [SERVICE_SIDE, HABITATION_SIDE]) {
    const wingFloors = side === SERVICE_SIDE
      ? NIMBUS_DOCK_SERVICE_FLOORS
      : NIMBUS_DOCK_HABITATION_FLOORS;
    for (let floor = 0; floor < wingFloors; floor += 1) {
      const y = NIMBUS_DOCK_STRUCTURE_BASE_Y
        + (floor + 1) * NIMBUS_DOCK_FLOOR_HEIGHT;
      for (const [sector, forward] of CHEEK_FORWARD_STATIONS.entries()) {
        nimbusPrimitive(
          floors,
          `cheek-slab:${side}:${floor}:${sector}`,
          "concrete",
          "panel",
          dockPoint(side * 29, forward, y),
          [11.8, 0.3, 7.65],
          sector % 2 === 0 ? "#898e8a" : "#7e8480",
          {
            rotation: DOCK_ROTATION,
            textureProfile: "nimbus-board-formed-concrete",
            contactBearingOrder: true,
            attachmentSupportMode: "cable",
            sideAttachmentReach: 0.72,
          },
        );
        nimbusRod(
          dockFrame,
          `cheek-beam:${side}:${floor}:${sector}`,
          "steel",
          dockPoint(side * 35, forward, y - 0.48),
          dockPoint(side * 23, forward, y - 0.48),
          0.5,
          floor % 6 === 5 ? SERVICE_BLUE : ARMOUR_MID,
          {
            textureProfile: "painted-steel",
            attachmentSupportMode: "cable",
            sideAttachmentReach: 0.7,
            bearingArea: 32,
          },
        );
      }
    }
  }
}

function createFacade(facade: NimbusMutableGroup): void {
  for (let floor = 0; floor < NIMBUS_DOCK_REAR_FLOORS; floor += 1) {
    const y = NIMBUS_DOCK_STRUCTURE_BASE_Y
      + floor * NIMBUS_DOCK_FLOOR_HEIGHT + 1.95;
    const technical = floor === 0 || floor % 6 === 5;
    for (const [sector, across] of REAR_ACROSS_STATIONS.entries()) {
      for (const [face, forward] of [["outer", -22.15], ["dock", -9.85]] as const) {
        const glazed = !technical && (face === "dock" || sector % 3 !== 0);
        nimbusPrimitive(
          facade,
          `rear-panel:${face}:${floor}:${sector}`,
          glazed ? "darkGlass" : "plastic",
          glazed ? "glassPane" : "panel",
          dockPoint(across, forward, y),
          [9.3, 3.45, glazed ? 0.16 : 0.23],
          glazed ? GLASS : sector % 2 === 0 ? CERAMIC : CERAMIC_WARM,
          {
            rotation: DOCK_ROTATION,
            textureProfile: glazed ? undefined : "nimbus-ceramic-composite",
            bearsLoad: false,
            sideAttachmentReach: 0.62,
            volume: 1.15,
          },
        );
      }
    }
  }

  for (const side of [SERVICE_SIDE, HABITATION_SIDE]) {
    const wingFloors = side === SERVICE_SIDE
      ? NIMBUS_DOCK_SERVICE_FLOORS
      : NIMBUS_DOCK_HABITATION_FLOORS;
    for (let floor = 0; floor < wingFloors; floor += 1) {
      const y = NIMBUS_DOCK_STRUCTURE_BASE_Y
        + floor * NIMBUS_DOCK_FLOOR_HEIGHT + 1.95;
      const technical = floor === 0 || floor % 5 === 4;
      for (const [sector, forward] of CHEEK_FORWARD_STATIONS.entries()) {
        for (const [face, across] of [
          ["outer", side * 35.15],
          ["dock", side * 22.85],
        ] as const) {
          const glazed = !technical && (face === "dock" || sector % 2 === 0);
          nimbusPrimitive(
            facade,
            `cheek-panel:${side}:${face}:${floor}:${sector}`,
            glazed ? "darkGlass" : "plastic",
            glazed ? "glassPane" : "panel",
            dockPoint(across, forward, y),
            [glazed ? 0.16 : 0.23, 3.45, 7.3],
            glazed ? GLASS : sector % 2 === 0 ? CERAMIC : CERAMIC_WARM,
            {
              rotation: DOCK_ROTATION,
              textureProfile: glazed ? undefined : "nimbus-ceramic-composite",
              bearsLoad: false,
              sideAttachmentReach: 0.62,
              volume: 1.05,
            },
          );
        }
      }

      nimbusPrimitive(
        facade,
        `mouth-panel:${side}:${floor}`,
        technical ? "plastic" : "darkGlass",
        technical ? "panel" : "glassPane",
        dockPoint(side * 29, 26.05, y),
        [11.5, 3.45, technical ? 0.23 : 0.16],
        technical ? CERAMIC : GLASS,
        {
          rotation: DOCK_ROTATION,
          textureProfile: technical ? "nimbus-ceramic-composite" : undefined,
          bearsLoad: false,
          sideAttachmentReach: 0.62,
          volume: 1.1,
        },
      );
    }
  }
}

function createDockEquipment(
  dockFrame: NimbusMutableGroup,
  fittings: NimbusMutableGroup,
): void {
  for (const across of [-15, -9, -3, 3, 9, 15]) {
    for (let floor = 0; floor < NIMBUS_DOCK_REAR_FLOORS; floor += 1) {
      const bottom = NIMBUS_DOCK_STRUCTURE_BASE_Y
        + floor * NIMBUS_DOCK_FLOOR_HEIGHT;
      nimbusPrimitive(
        dockFrame,
        `rear-guide:${across}:${floor}`,
        "steel",
        "steelSheet",
        dockPoint(across, -9.35, bottom + NIMBUS_DOCK_FLOOR_HEIGHT / 2),
        [0.42, NIMBUS_DOCK_FLOOR_HEIGHT, 0.48],
        floor % 6 === 5 ? SERVICE_BLUE : ARMOUR_LIGHT,
        {
          rotation: DOCK_ROTATION,
          textureProfile: "painted-steel",
          attachmentSupportMode: "cable",
          sideAttachmentReach: 0.62,
          carriesAttachments: true,
          bearingArea: 18,
        },
      );
      if (floor % 4 === 2) {
        nimbusPrimitive(
          fittings,
          `rear-clamp:${across}:${floor}`,
          "steel",
          "steelSheet",
          dockPoint(across, -7.95, bottom + NIMBUS_DOCK_FLOOR_HEIGHT / 2),
          [1.6, 1.15, 2.4],
          floor % 8 === 2 ? SERVICE_ORANGE : ARMOUR_MID,
          {
            rotation: DOCK_ROTATION,
            textureProfile: "painted-steel",
            bearsLoad: false,
            sideAttachmentReach: 1.2,
            volume: 0.9,
          },
        );
      }
    }
  }

  for (const side of [SERVICE_SIDE, HABITATION_SIDE]) {
    const wingFloors = side === SERVICE_SIDE
      ? NIMBUS_DOCK_SERVICE_FLOORS
      : NIMBUS_DOCK_HABITATION_FLOORS;
    for (const forward of [0, 12]) {
      for (let floor = 0; floor < wingFloors; floor += 1) {
        const bottom = NIMBUS_DOCK_STRUCTURE_BASE_Y
          + floor * NIMBUS_DOCK_FLOOR_HEIGHT;
        nimbusPrimitive(
          dockFrame,
          `cheek-guide:${side}:${forward}:${floor}`,
          "steel",
          "steelSheet",
          dockPoint(side * 22.55, forward, bottom + NIMBUS_DOCK_FLOOR_HEIGHT / 2),
          [0.48, NIMBUS_DOCK_FLOOR_HEIGHT, 0.42],
          floor % 5 === 4 ? SERVICE_BLUE : ARMOUR_LIGHT,
          {
            rotation: DOCK_ROTATION,
            textureProfile: "painted-steel",
            attachmentSupportMode: "cable",
            sideAttachmentReach: 0.62,
            carriesAttachments: true,
            bearingArea: 18,
          },
        );
      }
    }
  }

  for (let floor = 3; floor < NIMBUS_DOCK_REAR_FLOORS; floor += 4) {
    const y = NIMBUS_DOCK_STRUCTURE_BASE_Y
      + (floor + 1) * NIMBUS_DOCK_FLOOR_HEIGHT + 0.18;
    for (const [sector, across] of REAR_ACROSS_STATIONS.entries()) {
      nimbusPrimitive(
        fittings,
        `rear-balcony:${floor}:${sector}`,
        "steel",
        "panel",
        dockPoint(across, -8.2, y),
        [9.4, 0.26, 3.4],
        sector % 2 === 0 ? ARMOUR_MID : ARMOUR_DARK,
        {
          rotation: DOCK_ROTATION,
          textureProfile: "nimbus-technical-deck",
          attachmentSupportMode: "cable",
          sideAttachmentReach: 0.8,
        },
      );
    }
  }

  for (const side of [SERVICE_SIDE, HABITATION_SIDE]) {
    const wingFloors = side === SERVICE_SIDE
      ? NIMBUS_DOCK_SERVICE_FLOORS
      : NIMBUS_DOCK_HABITATION_FLOORS;
    for (let floor = 3; floor < wingFloors; floor += 4) {
      const y = NIMBUS_DOCK_STRUCTURE_BASE_Y
        + (floor + 1) * NIMBUS_DOCK_FLOOR_HEIGHT + 0.18;
      for (const [sector, forward] of CHEEK_FORWARD_STATIONS.entries()) {
        nimbusPrimitive(
          fittings,
          `cheek-balcony:${side}:${floor}:${sector}`,
          "steel",
          "panel",
          dockPoint(side * 21.55, forward, y),
          [3.1, 0.26, 7.25],
          sector % 2 === 0 ? ARMOUR_MID : ARMOUR_DARK,
          {
            rotation: DOCK_ROTATION,
            textureProfile: "nimbus-technical-deck",
            attachmentSupportMode: "cable",
            sideAttachmentReach: 0.8,
          },
        );
      }
    }
  }
}

function createLiftShafts(
  lifts: NimbusMutableGroup,
): void {
  for (const side of [SERVICE_SIDE, HABITATION_SIDE]) {
    const wingFloors = side === SERVICE_SIDE
      ? NIMBUS_DOCK_SERVICE_FLOORS
      : NIMBUS_DOCK_HABITATION_FLOORS;
    for (const [rail, [acrossOffset, forwardOffset]] of [
      [-1.2, -1.1],
      [-1.2, 1.1],
      [1.2, -1.1],
      [1.2, 1.1],
    ].entries()) {
      for (let floor = 0; floor < wingFloors; floor += 1) {
        const bottom = NIMBUS_DOCK_STRUCTURE_BASE_Y
          + floor * NIMBUS_DOCK_FLOOR_HEIGHT;
        nimbusPrimitive(
          lifts,
          `shaft:${side}:rail:${rail}:${floor}`,
          "steel",
          "steelSheet",
          dockPoint(
            side * 29 + acrossOffset,
            -9 + forwardOffset,
            bottom + NIMBUS_DOCK_FLOOR_HEIGHT / 2,
          ),
          [0.32, NIMBUS_DOCK_FLOOR_HEIGHT, 0.32],
          rail < 2 ? ARMOUR_LIGHT : ARMOUR_MID,
          {
            rotation: DOCK_ROTATION,
            textureProfile: "painted-steel",
            attachmentSupportMode: "cable",
            sideAttachmentReach: 1.0,
            carriesAttachments: true,
            bearingArea: 18,
          },
        );
      }
    }
  }
}

function createStairs(stairs: NimbusMutableGroup): void {
  for (const side of [SERVICE_SIDE, HABITATION_SIDE]) {
    const wingFloors = side === SERVICE_SIDE
      ? NIMBUS_DOCK_SERVICE_FLOORS
      : NIMBUS_DOCK_HABITATION_FLOORS;
    for (let floor = 0; floor < wingFloors; floor += 1) {
      const lowerY = NIMBUS_DOCK_STRUCTURE_BASE_Y
        + floor * NIMBUS_DOCK_FLOOR_HEIGHT + 0.35;
      const upperY = lowerY + NIMBUS_DOCK_FLOOR_HEIGHT - 0.7;
      const direction = floor % 2 === 0 ? 1 : -1;
      nimbusRod(
        stairs,
        `route:${side}:flight:${floor}`,
        "steel",
        dockPoint(side * 26.5, -5 + direction * 2.1, lowerY),
        dockPoint(side * 26.5, -5 - direction * 2.1, upperY),
        0.3,
        side === SERVICE_SIDE ? SERVICE_ORANGE : ARMOUR_LIGHT,
        {
          textureProfile: "painted-steel",
          attachmentSupportMode: "cable",
          sideAttachmentReach: 1.35,
          bearsLoad: false,
        },
      );
      nimbusRod(
        stairs,
        `route:${side}:landing:${floor}`,
        "steel",
        dockPoint(side * 25.5, -5 - direction * 2.1, upperY),
        dockPoint(side * 27.5, -5 - direction * 2.1, upperY),
        0.34,
        floor % 5 === 4 ? SERVICE_BLUE : ARMOUR_MID,
        {
          textureProfile: "painted-steel",
          attachmentSupportMode: "cable",
          sideAttachmentReach: 1.35,
          bearsLoad: false,
        },
      );
    }
  }
}

function createCranesAndCrown(
  crown: NimbusMutableGroup,
): void {
  const serviceRoof = NIMBUS_DOCK_STRUCTURE_BASE_Y
    + NIMBUS_DOCK_SERVICE_FLOORS * NIMBUS_DOCK_FLOOR_HEIGHT;
  for (const [crane, forward] of [4, 15].entries()) {
    const y = serviceRoof - crane * 18;
    nimbusRod(
      crown,
      `service-crane:${crane}:boom`,
      "steel",
      dockPoint(-31, forward, y),
      dockPoint(-9.5, forward, y + 2.8),
      0.72,
      crane === 0 ? SERVICE_ORANGE : ARMOUR_LIGHT,
      {
        textureProfile: "painted-steel",
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.9,
        bearingArea: 70,
        carriesAttachments: true,
      },
    );
    nimbusRod(
      crown,
      `service-crane:${crane}:tie`,
      "steel",
      dockPoint(-31, forward, y + 7),
      dockPoint(-9.5, forward, y + 2.8),
      0.42,
      ARMOUR_MID,
      {
        textureProfile: "painted-steel",
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.8,
      },
    );
    nimbusRod(
      crown,
      `service-crane:${crane}:hook-line`,
      "steel",
      dockPoint(-9.5, forward, y + 2.8),
      dockPoint(-9.5, forward, y - 5),
      0.24,
      ARMOUR_DARK,
      {
        textureProfile: "painted-steel",
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.5,
        bearsLoad: false,
      },
    );
  }

  const crownHeights = [10, 15, 22, 17, 12] as const;
  for (const [blade, across] of [-28, -14, 0, 14, 28].entries()) {
    nimbusRod(
      crown,
      `rear-blade:${blade}`,
      "steel",
      dockPoint(across, -17, NIMBUS_DOCK_REAR_ROOF_Y - 0.3),
      dockPoint(across * 0.72, -17, NIMBUS_DOCK_REAR_ROOF_Y + crownHeights[blade]),
      blade === 2 ? 0.78 : 0.6,
      blade === 2 ? SERVICE_BLUE : ARMOUR_LIGHT,
      {
        textureProfile: "painted-steel",
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.8,
        bearingArea: 58,
        carriesAttachments: true,
      },
    );
  }
}

export function createNimbusVerticalDock(
  groups: NimbusVerticalDockGroups,
): void {
  createFoundation(groups.foundation, groups.armour);
  createPrimaryStructure(groups.primary, groups.armour);
  createFloors(groups.floors, groups.dockFrame);
  createFacade(groups.facade);
  createDockEquipment(groups.dockFrame, groups.fittings);
  createLiftShafts(groups.lifts);
  createStairs(groups.stairs);
  createCranesAndCrown(groups.crown);
}
