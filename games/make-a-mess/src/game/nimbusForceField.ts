import type { SceneVector3 } from "./destructionScene.ts";
import {
  createBasaltForceFieldProjection,
  projectedCell,
  type BasaltForceFieldCell,
  type BasaltForceFieldNetwork,
} from "./basaltForceField.ts";
import {
  NIMBUS_SPINDLE_TOWER_CENTRE,
  NIMBUS_TOWER_CENTRE,
  NIMBUS_VERTICAL_DOCK_CENTRE,
} from "../content/scenes/nimbus/nimbusShell.ts";
import {
  NIMBUS_SPINDLE_RADIAL,
  NIMBUS_SPINDLE_ROOF_Y,
  NIMBUS_SPINDLE_TANGENT,
} from "../content/scenes/nimbus/nimbusSpindleTower.ts";
import {
  NIMBUS_DOCK_ACROSS,
  NIMBUS_DOCK_FLOOR_HEIGHT,
  NIMBUS_DOCK_FORWARD,
  NIMBUS_DOCK_HABITATION_FLOORS,
  NIMBUS_DOCK_REAR_ROOF_Y,
  NIMBUS_DOCK_SERVICE_FLOORS,
  NIMBUS_DOCK_STRUCTURE_BASE_Y,
} from "../content/scenes/nimbus/nimbusVerticalDock.ts";

// The same membrane as the fortress and sky ram, authored around a much
// taller object. Larger cells keep the hot analytic projection tractable.
const GRID_RADIUS = 1.6;
const WALL_DISTANCE = 22;
const WALL_HALF_WIDTH = 22;
const WALL_LOW_Y = 2;
const CAP_EQUATOR_Y = 96;
const CAP_LATERAL_RADIUS = 22;
const CAP_VERTICAL_RADIUS = 28;
const CAP_RINGS = 12;
const SPINDLE_GRID_RADIUS = 2.2;
const SPINDLE_WALL_DISTANCE = 24;
const SPINDLE_WALL_HALF_WIDTH = 24;
const SPINDLE_CAP_EQUATOR_Y = NIMBUS_SPINDLE_ROOF_Y + 3.4;
const SPINDLE_CAP_LATERAL_RADIUS = 24;
const SPINDLE_CAP_VERTICAL_RADIUS = 30;
const SPINDLE_CAP_RINGS = 10;
const DOCK_GRID_RADIUS = 2.2;
const DOCK_REAR_FORWARD = -25;
const DOCK_REAR_HALF_WIDTH = 40;
const DOCK_CHEEK_ACROSS = 39;
const DOCK_CHEEK_FORWARD = 2;
const DOCK_CHEEK_HALF_WIDTH = 29;
const DOCK_CROWN_RINGS = 8;

interface OrthogonalFace {
  readonly network: BasaltForceFieldNetwork;
  readonly normal: SceneVector3;
}

const ORTHOGONAL_FACES: readonly OrthogonalFace[] = [
  { network: "nimbus-east", normal: [1, 0, 0] },
  { network: "nimbus-west", normal: [-1, 0, 0] },
  { network: "nimbus-north", normal: [0, 0, 1] },
  { network: "nimbus-south", normal: [0, 0, -1] },
] as const;

function appendOrthogonalFace(
  cells: BasaltForceFieldCell[],
  face: OrthogonalFace,
): void {
  const [normalX, , normalZ] = face.normal;
  // This is the same basis projectedCell derives internally. Keeping the grid
  // centres on it makes the mathematical hexes and their rendered basis agree.
  const tangentX = normalZ;
  const tangentZ = -normalX;
  for (let q = -12; q <= 12; q += 1) {
    const tangentOffset = GRID_RADIUS * 1.5 * q;
    if (Math.abs(tangentOffset) > WALL_HALF_WIDTH + 0.2) continue;
    for (let r = -52; r <= 52; r += 1) {
      const y = Math.sqrt(3) * GRID_RADIUS * (r + q / 2);
      if (y < WALL_LOW_Y || y > CAP_EQUATOR_Y) continue;
      cells.push(projectedCell(
        face.network,
        q,
        r,
        cells.length,
        [
          NIMBUS_TOWER_CENTRE[0]
            + normalX * WALL_DISTANCE
            + tangentX * tangentOffset,
          y,
          NIMBUS_TOWER_CENTRE[1]
            + normalZ * WALL_DISTANCE
            + tangentZ * tangentOffset,
        ],
        face.normal,
        GRID_RADIUS,
        "nimbus:force-field",
      ));
    }
  }
}

function appendCrownHemisphere(cells: BasaltForceFieldCell[]): void {
  const targetSpacing = Math.sqrt(3) * GRID_RADIUS;
  for (let ring = 0; ring <= CAP_RINGS; ring += 1) {
    const theta = (Math.PI / 2) * ring / CAP_RINGS;
    const ringRadius = CAP_LATERAL_RADIUS * Math.sin(theta);
    const count = ring === 0
      ? 1
      : Math.max(6, Math.round(2 * Math.PI * ringRadius / targetSpacing));
    for (let index = 0; index < count; index += 1) {
      const phi = (Math.PI * 2 * index) / count;
      const x = ringRadius * Math.cos(phi);
      const z = ringRadius * Math.sin(phi);
      const vertical = CAP_VERTICAL_RADIUS * Math.cos(theta);
      const normal: SceneVector3 = [
        x / (CAP_LATERAL_RADIUS * CAP_LATERAL_RADIUS),
        vertical / (CAP_VERTICAL_RADIUS * CAP_VERTICAL_RADIUS),
        z / (CAP_LATERAL_RADIUS * CAP_LATERAL_RADIUS),
      ];
      cells.push(projectedCell(
        "nimbus-crown",
        ring,
        index,
        cells.length,
        [
          NIMBUS_TOWER_CENTRE[0] + x,
          CAP_EQUATOR_Y + vertical,
          NIMBUS_TOWER_CENTRE[1] + z,
        ],
        normal,
        GRID_RADIUS,
        "nimbus:force-field",
      ));
    }
  }
}

const SPINDLE_FACES: readonly OrthogonalFace[] = [
  {
    network: "nimbus-spindle-outward",
    normal: [NIMBUS_SPINDLE_RADIAL[0], 0, NIMBUS_SPINDLE_RADIAL[1]],
  },
  {
    network: "nimbus-spindle-inward",
    normal: [-NIMBUS_SPINDLE_RADIAL[0], 0, -NIMBUS_SPINDLE_RADIAL[1]],
  },
  {
    network: "nimbus-spindle-clockwise",
    normal: [NIMBUS_SPINDLE_TANGENT[0], 0, NIMBUS_SPINDLE_TANGENT[1]],
  },
  {
    network: "nimbus-spindle-counterclockwise",
    normal: [-NIMBUS_SPINDLE_TANGENT[0], 0, -NIMBUS_SPINDLE_TANGENT[1]],
  },
] as const;

function appendSpindleFace(
  cells: BasaltForceFieldCell[],
  face: OrthogonalFace,
): void {
  const [normalX, , normalZ] = face.normal;
  const tangentX = normalZ;
  const tangentZ = -normalX;
  for (let q = -9; q <= 9; q += 1) {
    const tangentOffset = SPINDLE_GRID_RADIUS * 1.5 * q;
    if (Math.abs(tangentOffset) > SPINDLE_WALL_HALF_WIDTH + 0.2) continue;
    for (let r = -62; r <= 62; r += 1) {
      const y = Math.sqrt(3) * SPINDLE_GRID_RADIUS * (r + q / 2);
      if (y < WALL_LOW_Y || y > SPINDLE_CAP_EQUATOR_Y) continue;
      cells.push(projectedCell(
        face.network,
        q,
        r,
        cells.length,
        [
          NIMBUS_SPINDLE_TOWER_CENTRE[0]
            + normalX * SPINDLE_WALL_DISTANCE
            + tangentX * tangentOffset,
          y,
          NIMBUS_SPINDLE_TOWER_CENTRE[1]
            + normalZ * SPINDLE_WALL_DISTANCE
            + tangentZ * tangentOffset,
        ],
        face.normal,
        SPINDLE_GRID_RADIUS,
        "nimbus:force-field",
      ));
    }
  }
}

function appendSpindleCrown(cells: BasaltForceFieldCell[]): void {
  const targetSpacing = Math.sqrt(3) * SPINDLE_GRID_RADIUS;
  for (let ring = 0; ring <= SPINDLE_CAP_RINGS; ring += 1) {
    const theta = (Math.PI / 2) * ring / SPINDLE_CAP_RINGS;
    const ringRadius = SPINDLE_CAP_LATERAL_RADIUS * Math.sin(theta);
    const count = ring === 0
      ? 1
      : Math.max(6, Math.round(2 * Math.PI * ringRadius / targetSpacing));
    for (let index = 0; index < count; index += 1) {
      const phi = (Math.PI * 2 * index) / count;
      const x = ringRadius * Math.cos(phi);
      const z = ringRadius * Math.sin(phi);
      const vertical = SPINDLE_CAP_VERTICAL_RADIUS * Math.cos(theta);
      const normal: SceneVector3 = [
        x / (SPINDLE_CAP_LATERAL_RADIUS * SPINDLE_CAP_LATERAL_RADIUS),
        vertical / (SPINDLE_CAP_VERTICAL_RADIUS * SPINDLE_CAP_VERTICAL_RADIUS),
        z / (SPINDLE_CAP_LATERAL_RADIUS * SPINDLE_CAP_LATERAL_RADIUS),
      ];
      cells.push(projectedCell(
        "nimbus-spindle-crown",
        ring,
        index,
        cells.length,
        [
          NIMBUS_SPINDLE_TOWER_CENTRE[0] + x,
          SPINDLE_CAP_EQUATOR_Y + vertical,
          NIMBUS_SPINDLE_TOWER_CENTRE[1] + z,
        ],
        normal,
        SPINDLE_GRID_RADIUS,
        "nimbus:force-field",
      ));
    }
  }
}

interface DockFace {
  readonly network: BasaltForceFieldNetwork;
  readonly normal: SceneVector3;
  readonly centreAcross: number;
  readonly centreForward: number;
  readonly halfWidth: number;
  readonly topY: number;
}

const DOCK_FACES: readonly DockFace[] = [
  {
    network: "nimbus-dock-rear",
    normal: [-NIMBUS_DOCK_FORWARD[0], 0, -NIMBUS_DOCK_FORWARD[1]],
    centreAcross: 0,
    centreForward: DOCK_REAR_FORWARD,
    halfWidth: DOCK_REAR_HALF_WIDTH,
    topY: NIMBUS_DOCK_REAR_ROOF_Y + 2,
  },
  {
    network: "nimbus-dock-service",
    normal: [-NIMBUS_DOCK_ACROSS[0], 0, -NIMBUS_DOCK_ACROSS[1]],
    centreAcross: -DOCK_CHEEK_ACROSS,
    centreForward: DOCK_CHEEK_FORWARD,
    halfWidth: DOCK_CHEEK_HALF_WIDTH,
    topY: NIMBUS_DOCK_STRUCTURE_BASE_Y
      + NIMBUS_DOCK_SERVICE_FLOORS * NIMBUS_DOCK_FLOOR_HEIGHT + 2,
  },
  {
    network: "nimbus-dock-habitation",
    normal: [NIMBUS_DOCK_ACROSS[0], 0, NIMBUS_DOCK_ACROSS[1]],
    centreAcross: DOCK_CHEEK_ACROSS,
    centreForward: DOCK_CHEEK_FORWARD,
    halfWidth: DOCK_CHEEK_HALF_WIDTH,
    topY: NIMBUS_DOCK_STRUCTURE_BASE_Y
      + NIMBUS_DOCK_HABITATION_FLOORS * NIMBUS_DOCK_FLOOR_HEIGHT + 2,
  },
] as const;

function dockWorldPoint(
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

function appendDockFace(
  cells: BasaltForceFieldCell[],
  face: DockFace,
): void {
  const tangentX = face.normal[2];
  const tangentZ = -face.normal[0];
  const tangentAcross = tangentX * NIMBUS_DOCK_ACROSS[0]
    + tangentZ * NIMBUS_DOCK_ACROSS[1];
  const tangentForward = tangentX * NIMBUS_DOCK_FORWARD[0]
    + tangentZ * NIMBUS_DOCK_FORWARD[1];
  for (let q = -13; q <= 13; q += 1) {
    const tangentOffset = DOCK_GRID_RADIUS * 1.5 * q;
    if (Math.abs(tangentOffset) > face.halfWidth + 0.2) continue;
    for (let r = -50; r <= 50; r += 1) {
      const y = Math.sqrt(3) * DOCK_GRID_RADIUS * (r + q / 2);
      if (y < WALL_LOW_Y || y > face.topY) continue;
      cells.push(projectedCell(
        face.network,
        q,
        r,
        cells.length,
        dockWorldPoint(
          face.centreAcross + tangentAcross * tangentOffset,
          face.centreForward + tangentForward * tangentOffset,
          y,
        ),
        face.normal,
        DOCK_GRID_RADIUS,
        "nimbus:force-field",
      ));
    }
  }
}

interface DockCrown {
  readonly network: BasaltForceFieldNetwork;
  readonly centreAcross: number;
  readonly centreForward: number;
  readonly equatorY: number;
  readonly acrossRadius: number;
  readonly forwardRadius: number;
  readonly verticalRadius: number;
}

const DOCK_CROWNS: readonly DockCrown[] = [
  {
    network: "nimbus-dock-rear-crown",
    centreAcross: 0,
    centreForward: -17,
    equatorY: NIMBUS_DOCK_REAR_ROOF_Y + 2,
    acrossRadius: 39,
    forwardRadius: 8,
    verticalRadius: 18,
  },
  {
    network: "nimbus-dock-service-crown",
    centreAcross: -29,
    centreForward: 4,
    equatorY: NIMBUS_DOCK_STRUCTURE_BASE_Y
      + NIMBUS_DOCK_SERVICE_FLOORS * NIMBUS_DOCK_FLOOR_HEIGHT + 2,
    acrossRadius: 9,
    forwardRadius: 28,
    verticalRadius: 18,
  },
  {
    network: "nimbus-dock-habitation-crown",
    centreAcross: 29,
    centreForward: 4,
    equatorY: NIMBUS_DOCK_STRUCTURE_BASE_Y
      + NIMBUS_DOCK_HABITATION_FLOORS * NIMBUS_DOCK_FLOOR_HEIGHT + 2,
    acrossRadius: 9,
    forwardRadius: 28,
    verticalRadius: 18,
  },
] as const;

function appendDockCrown(
  cells: BasaltForceFieldCell[],
  crown: DockCrown,
): void {
  const targetSpacing = Math.sqrt(3) * DOCK_GRID_RADIUS;
  for (let ring = 0; ring <= DOCK_CROWN_RINGS; ring += 1) {
    const theta = (Math.PI / 2) * ring / DOCK_CROWN_RINGS;
    const acrossRadius = crown.acrossRadius * Math.sin(theta);
    const forwardRadius = crown.forwardRadius * Math.sin(theta);
    const approximateCircumference = Math.PI * (
      3 * (acrossRadius + forwardRadius)
        - Math.sqrt(
          (3 * acrossRadius + forwardRadius)
            * (acrossRadius + 3 * forwardRadius),
        )
    );
    const count = ring === 0
      ? 1
      : Math.max(6, Math.round(approximateCircumference / targetSpacing));
    for (let index = 0; index < count; index += 1) {
      const phi = (Math.PI * 2 * index) / count;
      const across = acrossRadius * Math.cos(phi);
      const forward = forwardRadius * Math.sin(phi);
      const vertical = crown.verticalRadius * Math.cos(theta);
      const normal: SceneVector3 = [
        NIMBUS_DOCK_ACROSS[0] * across
          / (crown.acrossRadius * crown.acrossRadius)
          + NIMBUS_DOCK_FORWARD[0] * forward
          / (crown.forwardRadius * crown.forwardRadius),
        vertical / (crown.verticalRadius * crown.verticalRadius),
        NIMBUS_DOCK_ACROSS[1] * across
          / (crown.acrossRadius * crown.acrossRadius)
          + NIMBUS_DOCK_FORWARD[1] * forward
          / (crown.forwardRadius * crown.forwardRadius),
      ];
      cells.push(projectedCell(
        crown.network,
        ring,
        index,
        cells.length,
        dockWorldPoint(
          crown.centreAcross + across,
          crown.centreForward + forward,
          crown.equatorY + vertical,
        ),
        normal,
        DOCK_GRID_RADIUS,
        "nimbus:force-field",
      ));
    }
  }
}

export function createNimbusForceFieldCells(): readonly BasaltForceFieldCell[] {
  const cells: BasaltForceFieldCell[] = [];
  for (const face of ORTHOGONAL_FACES) appendOrthogonalFace(cells, face);
  appendCrownHemisphere(cells);
  for (const face of SPINDLE_FACES) appendSpindleFace(cells, face);
  appendSpindleCrown(cells);
  for (const face of DOCK_FACES) appendDockFace(cells, face);
  for (const crown of DOCK_CROWNS) appendDockCrown(cells, crown);
  return cells;
}

export const NIMBUS_FORCE_FIELD_CELLS = createNimbusForceFieldCells();
export const NIMBUS_FORCE_FIELD_PROJECTION = createBasaltForceFieldProjection(
  NIMBUS_FORCE_FIELD_CELLS,
);
