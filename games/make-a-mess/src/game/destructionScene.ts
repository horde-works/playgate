import {
  createStructuralSolver,
  type StructuralMaterialProfile,
} from "./structuralPhysics.ts";

export type BreakableMaterial =
  | "brick"
  | "wood"
  | "plaster"
  | "concrete"
  | "glass"
  | "steel"
  | "stone"
  | "basalt"
  | "graphiteStone"
  | "darkGlass"
  | "foliage"
  | "grass"
  | "soil"
  | "earth"
  | "asphalt";

export type BreakableShape =
  | "brick"
  | "plank"
  | "panel"
  | "cinderBlock"
  | "glassPane"
  | "steelSheet"
  | "stoneBlock"
  | "groundTile";

export type SupportMode = "stack" | "mounted" | "linked";
export type SceneVector3 = readonly [x: number, y: number, z: number];

export interface MaterialRuntimeProfile {
  readonly density: number;
  readonly impulse: number;
  readonly lift: number;
  readonly torque: number;
  readonly fractureRadius: readonly [x: number, y: number];
  readonly neighborChance: number;
  readonly dustColor: string;
  readonly debrisColor: string;
  readonly debrisCount: number;
  readonly restitution: number;
}

export interface DoorHingeDefinition {
  readonly pivot: SceneVector3;
  readonly direction: SceneVector3;
  readonly normal: SceneVector3;
}

export interface BreakablePieceDefinition {
  readonly id: string;
  readonly clusterId: string;
  readonly material: BreakableMaterial;
  readonly shape: BreakableShape;
  readonly position: SceneVector3;
  readonly rotation?: SceneVector3;
  readonly size: SceneVector3;
  readonly color: string;
  readonly row?: number;
  readonly column?: number;
  readonly hinge?: DoorHingeDefinition;
  readonly contactBoxes?: readonly {
    readonly position: SceneVector3;
    readonly size: SceneVector3;
  }[];
}

export interface BreakableClusterDefinition {
  readonly id: string;
  readonly label: string;
  readonly material: BreakableMaterial;
  readonly supportMode: SupportMode;
  readonly pieces: readonly BreakablePieceDefinition[];
}

export const materialRuntimeProfiles: Record<
  BreakableMaterial,
  MaterialRuntimeProfile
> = {
  brick: {
    density: 2.15,
    impulse: 2.65,
    lift: 0.52,
    torque: 0.22,
    fractureRadius: [0.92, 0.72],
    neighborChance: 0.47,
    dustColor: "#c48665",
    debrisColor: "#9f3f29",
    debrisCount: 5,
    restitution: 0.025,
  },
  wood: {
    density: 0.72,
    impulse: 2.4,
    lift: 0.72,
    torque: 0.42,
    fractureRadius: [1.05, 0.66],
    neighborChance: 0.3,
    dustColor: "#d5ad79",
    debrisColor: "#956037",
    debrisCount: 4,
    restitution: 0.08,
  },
  plaster: {
    density: 0.9,
    impulse: 2.05,
    lift: 0.4,
    torque: 0.28,
    fractureRadius: [1.24, 1.08],
    neighborChance: 0.72,
    dustColor: "#e8e3d6",
    debrisColor: "#d2cbbc",
    debrisCount: 6,
    restitution: 0.02,
  },
  concrete: {
    density: 2.4,
    impulse: 2.2,
    lift: 0.36,
    torque: 0.16,
    fractureRadius: [0.86, 0.66],
    neighborChance: 0.28,
    dustColor: "#aaa79f",
    debrisColor: "#77766f",
    debrisCount: 5,
    restitution: 0.015,
  },
  glass: {
    density: 1.1,
    impulse: 1.85,
    lift: 0.3,
    torque: 0.34,
    fractureRadius: [1.55, 1.5],
    neighborChance: 0.92,
    dustColor: "#d8f3f4",
    debrisColor: "#9dd4d8",
    debrisCount: 7,
    restitution: 0.06,
  },
  steel: {
    density: 3.6,
    impulse: 1.9,
    lift: 0.28,
    torque: 0.12,
    fractureRadius: [0.78, 0.58],
    neighborChance: 0.12,
    dustColor: "#f6cf74",
    debrisColor: "#747b7d",
    debrisCount: 3,
    restitution: 0.04,
  },
  stone: {
    density: 2.55,
    impulse: 2.15,
    lift: 0.34,
    torque: 0.17,
    fractureRadius: [0.82, 0.64],
    neighborChance: 0.25,
    dustColor: "#b4afa3",
    debrisColor: "#716d64",
    debrisCount: 5,
    restitution: 0.018,
  },
  basalt: {
    density: 2.9,
    impulse: 2.05,
    lift: 0.3,
    torque: 0.14,
    fractureRadius: [0.76, 0.58],
    neighborChance: 0.2,
    dustColor: "#777879",
    debrisColor: "#303235",
    debrisCount: 5,
    restitution: 0.014,
  },
  graphiteStone: {
    density: 2.7,
    impulse: 2.1,
    lift: 0.32,
    torque: 0.15,
    fractureRadius: [0.8, 0.6],
    neighborChance: 0.22,
    dustColor: "#858687",
    debrisColor: "#3d3f42",
    debrisCount: 5,
    restitution: 0.016,
  },
  darkGlass: {
    density: 1.18,
    impulse: 1.8,
    lift: 0.28,
    torque: 0.36,
    fractureRadius: [1.6, 1.55],
    neighborChance: 0.94,
    dustColor: "#8fa8ae",
    debrisColor: "#425b62",
    debrisCount: 7,
    restitution: 0.055,
  },
  foliage: {
    density: 0.08,
    impulse: 2.8,
    lift: 1.25,
    torque: 0.58,
    fractureRadius: [1.42, 1.16],
    neighborChance: 0.78,
    dustColor: "#52633d",
    debrisColor: "#2d432f",
    debrisCount: 5,
    restitution: 0.04,
  },
  grass: {
    density: 1.25,
    impulse: 1.7,
    lift: 0.2,
    torque: 0.1,
    fractureRadius: [0.66, 0.66],
    neighborChance: 0.06,
    dustColor: "#6f7950",
    debrisColor: "#455038",
    debrisCount: 3,
    restitution: 0.008,
  },
  soil: {
    density: 1.35,
    impulse: 1.75,
    lift: 0.22,
    torque: 0.12,
    fractureRadius: [0.68, 0.68],
    neighborChance: 0.08,
    dustColor: "#8d7652",
    debrisColor: "#5d4d37",
    debrisCount: 4,
    restitution: 0.01,
  },
  earth: {
    density: 1.6,
    impulse: 1.9,
    lift: 0.3,
    torque: 0.12,
    fractureRadius: [0.7, 0.5],
    neighborChance: 0.06,
    dustColor: "#7b6647",
    debrisColor: "#54452f",
    debrisCount: 4,
    restitution: 0.008,
  },
  asphalt: {
    density: 2.0,
    impulse: 2.1,
    lift: 0.28,
    torque: 0.14,
    fractureRadius: [0.8, 0.5],
    neighborChance: 0.18,
    dustColor: "#6e6d68",
    debrisColor: "#3f3f3d",
    debrisCount: 4,
    restitution: 0.012,
  },
};

function cluster(
  id: string,
  label: string,
  material: BreakableMaterial,
  supportMode: SupportMode,
  pieces: BreakablePieceDefinition[],
): BreakableClusterDefinition {
  return { id, label, material, supportMode, pieces };
}

interface WallGridOptions {
  readonly id: string;
  readonly label: string;
  readonly material: BreakableMaterial;
  readonly shape: BreakableShape;
  readonly axis: "x" | "z";
  readonly fixedCoordinate: number;
  readonly start: number;
  readonly baseY: number;
  readonly columns: number;
  readonly rows: number;
  readonly cellWidth: number;
  readonly cellHeight: number;
  readonly depth: number;
  readonly palette: readonly string[];
  readonly openings?: readonly WallOpening[];
}

interface WallOpening {
  readonly center: number;
  readonly width: number;
  readonly firstRow: number;
  readonly lastRow: number;
}

interface WallInterval {
  readonly start: number;
  readonly end: number;
}

function solidWallIntervals(
  wallStart: number,
  wallEnd: number,
  openings: readonly WallOpening[],
  row: number,
): readonly WallInterval[] {
  const activeOpenings = openings
    .filter((opening) => row >= opening.firstRow && row <= opening.lastRow)
    .map((opening) => ({
      start: Math.max(wallStart, opening.center - opening.width / 2),
      end: Math.min(wallEnd, opening.center + opening.width / 2),
    }))
    .filter((opening) => opening.end > opening.start)
    .sort((left, right) => left.start - right.start);
  const mergedOpenings: WallInterval[] = [];

  for (const opening of activeOpenings) {
    const previous = mergedOpenings.at(-1);
    if (previous && opening.start <= previous.end) {
      mergedOpenings[mergedOpenings.length - 1] = {
        start: previous.start,
        end: Math.max(previous.end, opening.end),
      };
    } else {
      mergedOpenings.push(opening);
    }
  }

  const solid: WallInterval[] = [];
  let cursor = wallStart;
  for (const opening of mergedOpenings) {
    if (opening.start > cursor) {
      solid.push({ start: cursor, end: opening.start });
    }
    cursor = Math.max(cursor, opening.end);
  }
  if (cursor < wallEnd) {
    solid.push({ start: cursor, end: wallEnd });
  }

  return solid;
}

function createWallGrid(options: WallGridOptions): BreakableClusterDefinition {
  const pieces: BreakablePieceDefinition[] = [];
  const wallStart = options.start - options.cellWidth / 2;
  const wallEnd =
    options.start + (options.columns - 0.5) * options.cellWidth;

  for (let row = 0; row < options.rows; row += 1) {
    const bondOffset =
      options.material === "brick" && row % 2 === 1
        ? options.cellWidth * 0.5
        : 0;
    const courseOrigin = wallStart - bondOffset;
    const solidIntervals = solidWallIntervals(
      wallStart,
      wallEnd,
      options.openings ?? [],
      row,
    );
    let rowPieceIndex = 0;

    for (const solid of solidIntervals) {
      const firstCourseIndex = Math.floor(
        (solid.start - courseOrigin) / options.cellWidth,
      );
      const lastCourseIndex = Math.ceil(
        (solid.end - courseOrigin) / options.cellWidth,
      );
      const coursePieces: WallInterval[] = [];

      for (
        let courseIndex = firstCourseIndex;
        courseIndex < lastCourseIndex;
        courseIndex += 1
      ) {
        const cellStart = courseOrigin + courseIndex * options.cellWidth;
        const cellEnd = cellStart + options.cellWidth;
        const pieceStart = Math.max(solid.start, cellStart);
        const pieceEnd = Math.min(solid.end, cellEnd);
        if (pieceEnd - pieceStart < 0.06) {
          continue;
        }

        coursePieces.push({ start: pieceStart, end: pieceEnd });
      }

      const minimumCutWidth = options.cellWidth * 0.26;
      if (
        coursePieces.length > 1 &&
        coursePieces[0].end - coursePieces[0].start < minimumCutWidth
      ) {
        const midpoint = (coursePieces[0].start + coursePieces[1].end) / 2;
        coursePieces[0] = { start: coursePieces[0].start, end: midpoint };
        coursePieces[1] = { start: midpoint, end: coursePieces[1].end };
      }
      const lastPieceIndex = coursePieces.length - 1;
      if (
        coursePieces.length > 1 &&
        coursePieces[lastPieceIndex].end -
          coursePieces[lastPieceIndex].start <
          minimumCutWidth
      ) {
        const midpoint =
          (coursePieces[lastPieceIndex - 1].start +
            coursePieces[lastPieceIndex].end) /
          2;
        coursePieces[lastPieceIndex - 1] = {
          start: coursePieces[lastPieceIndex - 1].start,
          end: midpoint,
        };
        coursePieces[lastPieceIndex] = {
          start: midpoint,
          end: coursePieces[lastPieceIndex].end,
        };
      }

      for (const coursePiece of coursePieces) {
        const pieceWidth = coursePiece.end - coursePiece.start;
        const courseIndex = Math.floor(
          (coursePiece.start - courseOrigin) / options.cellWidth,
        );
        const along = (coursePiece.start + coursePiece.end) / 2;
        const position: SceneVector3 =
          options.axis === "x"
            ? [
                along,
                options.baseY + row * options.cellHeight,
                options.fixedCoordinate,
              ]
            : [
                options.fixedCoordinate,
                options.baseY + row * options.cellHeight,
                along,
              ];
        const size: SceneVector3 =
          options.axis === "x"
            ? [pieceWidth, options.cellHeight, options.depth]
            : [options.depth, options.cellHeight, pieceWidth];

        pieces.push({
          id: `${options.id}:${row}:${rowPieceIndex}`,
          clusterId: options.id,
          material: options.material,
          shape: options.shape,
          position,
          size,
          color:
            options.palette[
              (row * 3 + courseIndex * 5 + 1000) % options.palette.length
            ],
          row,
          column: courseIndex,
        });
        rowPieceIndex += 1;
      }
    }
  }

  return cluster(
    options.id,
    options.label,
    options.material,
    options.material === "plaster" ? "mounted" : "stack",
    pieces,
  );
}

function makePiece(
  id: string,
  clusterId: string,
  material: BreakableMaterial,
  shape: BreakableShape,
  position: SceneVector3,
  size: SceneVector3,
  color: string,
  rotation?: SceneVector3,
): BreakablePieceDefinition {
  return {
    id,
    clusterId,
    material,
    shape,
    position,
    size,
    color,
    rotation,
  };
}

const brickPalette = ["#9f3e29", "#b84a2d", "#853523", "#c45632"];
const plasterPalette = ["#ded8c8", "#ebe5d7", "#d3cdbc"];
const stonePalette = ["#77746c", "#8b877d", "#66645e", "#999487"];
const woodPalette = ["#9c6339", "#b27442", "#81502f", "#c1864f"];

function createHouseWalls(): BreakableClusterDefinition[] {
  const wallMinimumX = -4.11;
  const wallMaximumX = 4.11;
  const wallMinimumZ = -6.71;
  const wallMaximumZ = 0.71;
  const lowerFrontCellWidth = (wallMaximumX - wallMinimumX) / 12;
  const upperFrontCellWidth = (wallMaximumX - wallMinimumX) / 10;
  const sideCellWidth = (wallMaximumZ - wallMinimumZ) / 8;

  return [
    createWallGrid({
      id: "house:front:lower",
      label: "Lower front brick wall",
      material: "brick",
      shape: "brick",
      axis: "x",
      fixedCoordinate: 1,
      start: wallMinimumX + lowerFrontCellWidth / 2,
      baseY: 0.2,
      columns: 12,
      rows: 8,
      cellWidth: lowerFrontCellWidth,
      cellHeight: 0.36,
      depth: 0.38,
      palette: brickPalette,
      openings: [
        { center: 0.36, width: 1.56, firstRow: 0, lastRow: 5 },
        { center: -2.2, width: 1.58, firstRow: 2, lastRow: 5 },
        { center: 2.2, width: 1.58, firstRow: 2, lastRow: 5 },
        { center: 0, width: 40, firstRow: 6, lastRow: 6 },
      ],
    }),
    createWallGrid({
      id: "house:back:lower",
      label: "Lower back brick wall",
      material: "brick",
      shape: "brick",
      axis: "x",
      fixedCoordinate: -7,
      start: wallMinimumX + lowerFrontCellWidth / 2,
      baseY: 0.2,
      columns: 12,
      rows: 8,
      cellWidth: lowerFrontCellWidth,
      cellHeight: 0.36,
      depth: 0.38,
      palette: brickPalette,
      openings: [
        { center: 2.88, width: 1.56, firstRow: 0, lastRow: 5 },
        { center: -1.85, width: 1.58, firstRow: 2, lastRow: 5 },
        { center: 0, width: 40, firstRow: 6, lastRow: 6 },
      ],
    }),
    createWallGrid({
      id: "house:left:lower",
      label: "Lower left stone wall",
      material: "stone",
      shape: "stoneBlock",
      axis: "z",
      fixedCoordinate: -4.35,
      start: wallMinimumZ + sideCellWidth / 2,
      baseY: 0.24,
      columns: 8,
      rows: 6,
      cellWidth: sideCellWidth,
      cellHeight: 0.46,
      depth: 0.5,
      palette: stonePalette,
      openings: [
        { center: -3.55, width: 1.78, firstRow: 2, lastRow: 4 },
        { center: -3, width: 40, firstRow: 5, lastRow: 5 },
      ],
    }),
    createWallGrid({
      id: "house:right:lower",
      label: "Lower right stone wall",
      material: "stone",
      shape: "stoneBlock",
      axis: "z",
      fixedCoordinate: 4.35,
      start: wallMinimumZ + sideCellWidth / 2,
      baseY: 0.24,
      columns: 8,
      rows: 6,
      cellWidth: sideCellWidth,
      cellHeight: 0.46,
      depth: 0.5,
      palette: stonePalette,
      openings: [
        { center: -3.55, width: 1.78, firstRow: 2, lastRow: 4 },
        { center: -3, width: 40, firstRow: 5, lastRow: 5 },
      ],
    }),
    createWallGrid({
      id: "house:front:upper",
      label: "Upper front plaster wall",
      material: "plaster",
      shape: "panel",
      axis: "x",
      fixedCoordinate: 1,
      start: wallMinimumX + upperFrontCellWidth / 2,
      baseY: 3.08,
      columns: 10,
      rows: 4,
      cellWidth: upperFrontCellWidth,
      cellHeight: 0.62,
      depth: 0.28,
      palette: plasterPalette,
      openings: [
        { center: -2.25, width: 1.78, firstRow: 1, lastRow: 2 },
        { center: 2.25, width: 1.78, firstRow: 1, lastRow: 2 },
      ],
    }),
    createWallGrid({
      id: "house:back:upper",
      label: "Upper back plaster wall",
      material: "plaster",
      shape: "panel",
      axis: "x",
      fixedCoordinate: -7,
      start: wallMinimumX + upperFrontCellWidth / 2,
      baseY: 3.08,
      columns: 10,
      rows: 4,
      cellWidth: upperFrontCellWidth,
      cellHeight: 0.62,
      depth: 0.28,
      palette: plasterPalette,
      openings: [
        { center: -2.25, width: 1.78, firstRow: 1, lastRow: 2 },
        { center: 2.25, width: 1.78, firstRow: 1, lastRow: 2 },
      ],
    }),
    createWallGrid({
      id: "house:left:upper",
      label: "Upper left plaster wall",
      material: "plaster",
      shape: "panel",
      axis: "z",
      fixedCoordinate: -4.35,
      start: wallMinimumZ + sideCellWidth / 2,
      baseY: 3.08,
      columns: 8,
      rows: 4,
      cellWidth: sideCellWidth,
      cellHeight: 0.62,
      depth: 0.28,
      palette: plasterPalette,
      openings: [
        { center: -3.55, width: 1.88, firstRow: 1, lastRow: 2 },
      ],
    }),
    createWallGrid({
      id: "house:right:upper",
      label: "Upper right plaster wall",
      material: "plaster",
      shape: "panel",
      axis: "z",
      fixedCoordinate: 4.35,
      start: wallMinimumZ + sideCellWidth / 2,
      baseY: 3.08,
      columns: 8,
      rows: 4,
      cellWidth: sideCellWidth,
      cellHeight: 0.62,
      depth: 0.28,
      palette: plasterPalette,
      openings: [
        { center: -3.55, width: 1.88, firstRow: 1, lastRow: 2 },
      ],
    }),
  ];
}

function createBandBeams(): BreakableClusterDefinition {
  const pieces: BreakablePieceDefinition[] = [];
  const id = "house:band";

  for (const z of [1, -7]) {
    for (let index = 0; index < 3; index += 1) {
      pieces.push(
        makePiece(
          `${id}:x:${z}:${index}`,
          id,
          "wood",
          "plank",
          [-2.74 + index * 2.74, 2.365, z],
          [2.7, 0.31, 0.36],
          index % 2 === 0 ? "#7c4e2f" : "#8a5835",
        ),
      );
    }
  }

  for (const x of [-4.35, 4.35]) {
    for (let index = 0; index < 3; index += 1) {
      pieces.push(
        makePiece(
          `${id}:z:${x}:${index}`,
          id,
          "wood",
          "plank",
          [x, 2.54, -5.47 + index * 2.47],
          [0.48, 0.42, 2.44],
          index % 2 === 0 ? "#7c4e2f" : "#8a5835",
        ),
      );
    }
  }

  return cluster(id, "Timber band beams", "wood", "mounted", pieces);
}

function createGables(): BreakableClusterDefinition[] {
  const gableRows = [
    { y: 5.47, height: 0.42, width: 6.2, count: 4 },
    { y: 5.9, height: 0.42, width: 4.0, count: 3 },
    { y: 6.33, height: 0.42, width: 1.9, count: 2 },
    { y: 6.68, height: 0.24, width: 0.6, count: 1 },
  ];

  return [1, -7].map((z) => {
    const id = `house:gable:${z > 0 ? "front" : "back"}`;
    const pieces: BreakablePieceDefinition[] = [];

    gableRows.forEach((row, rowIndex) => {
      const cell = row.width / row.count;
      for (let index = 0; index < row.count; index += 1) {
        pieces.push({
          ...makePiece(
            `${id}:${rowIndex}:${index}`,
            id,
            "plaster",
            "panel",
            [-row.width / 2 + cell * (index + 0.5), row.y, z],
            [cell - 0.03, row.height, 0.26],
            plasterPalette[(rowIndex + index) % plasterPalette.length],
          ),
          row: rowIndex,
          column: index,
        });
      }
    });

    return cluster(id, "Plaster gable", "plaster", "mounted", pieces);
  });
}

function createChimney(): BreakableClusterDefinition {
  const pieces: BreakablePieceDefinition[] = [];
  const id = "house:chimney";
  const x = 5.15;
  const z = -2.2;

  for (let row = 0; row < 9; row += 1) {
    pieces.push({
      ...makePiece(
        `${id}:block:${row}`,
        id,
        "brick",
        "brick",
        [x, 0.29 + row * 0.6, z],
        [0.56, 0.58, 0.56],
        brickPalette[row % brickPalette.length],
      ),
      row,
      column: 0,
    });
  }

  pieces.push({
    ...makePiece(
      `${id}:cap`,
      id,
      "stone",
      "stoneBlock",
      [x, 5.53, z],
      [0.8, 0.24, 0.8],
      stonePalette[1],
    ),
    row: 9,
    column: 0,
  });

  return cluster(id, "Brick chimney", "brick", "stack", pieces);
}

function createHouseFrame(): BreakableClusterDefinition {
  const pieces: BreakablePieceDefinition[] = [];
  const id = "house:frame";
  const posts = [
    [-4.25, 2.65, 0.85],
    [4.25, 2.65, 0.85],
    [-4.25, 2.65, -6.85],
    [4.25, 2.65, -6.85],
  ] as const;

  posts.forEach((position, index) => {
    pieces.push(
      makePiece(
        `${id}:post:${index}`,
        id,
        "wood",
        "plank",
        position,
        [0.28, 5.3, 0.28],
        "#70452a",
      ),
    );
  });

  [
    [0, 2.88, 0.86, 8.8, 0.24, 0.3],
    [0, 2.88, -6.86, 8.8, 0.24, 0.3],
    [-4.22, 2.88, -3, 0.3, 0.24, 7.8],
    [4.22, 2.88, -3, 0.3, 0.24, 7.8],
    [0, 5.48, 0.86, 8.8, 0.28, 0.34],
    [0, 5.48, -6.86, 8.8, 0.28, 0.34],
  ].forEach(([x, y, z, width, height, depth], index) => {
    pieces.push(
      makePiece(
        `${id}:beam:${index}`,
        id,
        "wood",
        "plank",
        [x, y, z],
        [width, height, depth],
        index % 2 === 0 ? "#805031" : "#684027",
      ),
    );
  });

  return cluster(id, "House timber frame", "wood", "linked", pieces);
}

function createFloorsAndStairs(): BreakableClusterDefinition[] {
  const groundPieces: BreakablePieceDefinition[] = [];
  const upperPieces: BreakablePieceDefinition[] = [];
  const stairPieces: BreakablePieceDefinition[] = [];

  for (let xIndex = 0; xIndex < 5; xIndex += 1) {
    for (let zIndex = 0; zIndex < 4; zIndex += 1) {
      groundPieces.push(
        makePiece(
          `house:ground-floor:${xIndex}:${zIndex}`,
          "house:ground-floor",
          "stone",
          "stoneBlock",
          [-3.4 + xIndex * 1.7, 0.04, -5.9 + zIndex * 1.9],
          [1.7, 0.18, 1.9],
          stonePalette[(xIndex + zIndex) % stonePalette.length],
        ),
      );
    }
  }

  for (let index = 0; index < 10; index += 1) {
    if (index === 8 || index === 9) {
      continue;
    }
    upperPieces.push(
      makePiece(
        `house:upper-floor:${index}`,
        "house:upper-floor",
        "wood",
        "plank",
        [-3.72 + index * 0.82, 2.84, -3],
        [0.82, 0.16, 7.7],
        woodPalette[index % woodPalette.length],
      ),
    );
  }

  for (let index = 0; index < 10; index += 1) {
    stairPieces.push({
      ...makePiece(
        `house:stairs:${index}`,
        "house:stairs",
        "wood",
        "plank",
        [3.25, 0.26 + index * 0.27, -5.55 + index * 0.42],
        [1.45, 0.26, 0.9],
        woodPalette[index % woodPalette.length],
      ),
      row: index,
      column: 0,
    });
  }

  return [
    cluster("house:ground-floor", "Stone ground floor", "stone", "linked", groundPieces),
    cluster("house:upper-floor", "Wood upper floor", "wood", "linked", upperPieces),
    cluster("house:stairs", "Wood stairs", "wood", "stack", stairPieces),
  ];
}

interface WindowOptions {
  readonly id: string;
  readonly position: SceneVector3;
  readonly axis: "x" | "z";
  readonly width?: number;
  readonly height?: number;
}

function createWindow(options: WindowOptions): BreakableClusterDefinition {
  const width = options.width ?? 1.35;
  const height = options.height ?? 1.25;
  const [x, y, z] = options.position;
  const isFront = options.axis === "x";
  const frameDepth = 0.22;
  const pieces: BreakablePieceDefinition[] = [
    makePiece(
      `${options.id}:glass`,
      options.id,
      "glass",
      "glassPane",
      options.position,
      isFront ? [width, height, 0.08] : [0.08, height, width],
      "#9fd5dd",
    ),
    makePiece(
      `${options.id}:frame:top`,
      options.id,
      "wood",
      "plank",
      isFront ? [x, y + height / 2, z] : [x, y + height / 2, z],
      isFront
        ? [width + 0.18, 0.13, frameDepth]
        : [frameDepth, 0.13, width + 0.18],
      "#68442b",
    ),
    makePiece(
      `${options.id}:frame:bottom`,
      options.id,
      "wood",
      "plank",
      isFront ? [x, y - height / 2, z] : [x, y - height / 2, z],
      isFront
        ? [width + 0.18, 0.13, frameDepth]
        : [frameDepth, 0.13, width + 0.18],
      "#68442b",
    ),
    makePiece(
      `${options.id}:frame:left`,
      options.id,
      "wood",
      "plank",
      isFront ? [x - width / 2, y, z] : [x, y, z - width / 2],
      isFront
        ? [0.13, height, frameDepth]
        : [frameDepth, height, 0.13],
      "#795038",
    ),
    makePiece(
      `${options.id}:frame:right`,
      options.id,
      "wood",
      "plank",
      isFront ? [x + width / 2, y, z] : [x, y, z + width / 2],
      isFront
        ? [0.13, height, frameDepth]
        : [frameDepth, height, 0.13],
      "#795038",
    ),
  ];

  return cluster(options.id, "Window", "glass", "linked", pieces);
}

function createWindows(): BreakableClusterDefinition[] {
  return [
    createWindow({ id: "window:front:left:lower", position: [-2.2, 1.48, 0.78], axis: "x" }),
    createWindow({ id: "window:front:right:lower", position: [2.2, 1.48, 0.78], axis: "x" }),
    createWindow({ id: "window:front:left:upper", position: [-2.25, 4.02, 0.84], axis: "x", width: 1.55 }),
    createWindow({ id: "window:front:right:upper", position: [2.25, 4.02, 0.84], axis: "x", width: 1.55 }),
    createWindow({ id: "window:back:lower", position: [-1.85, 1.48, -6.78], axis: "x" }),
    createWindow({ id: "window:back:left:upper", position: [-2.25, 4.02, -6.84], axis: "x", width: 1.55 }),
    createWindow({ id: "window:back:right:upper", position: [2.25, 4.02, -6.84], axis: "x", width: 1.55 }),
    createWindow({ id: "window:left:lower", position: [-4.08, 1.46, -3.55], axis: "z", width: 1.55 }),
    createWindow({ id: "window:right:lower", position: [4.08, 1.46, -3.55], axis: "z", width: 1.55 }),
    createWindow({ id: "window:left:upper", position: [-4.18, 4.02, -3.55], axis: "z", width: 1.65 }),
    createWindow({ id: "window:right:upper", position: [4.18, 4.02, -3.55], axis: "z", width: 1.65 }),
  ];
}

function createDoor(
  id: string,
  x: number,
  z: number,
  facing: 1 | -1,
): BreakableClusterDefinition {
  const pieces: BreakablePieceDefinition[] = [];

  for (let index = 0; index < 5; index += 1) {
    pieces.push(
      makePiece(
        `${id}:board:${index}`,
        id,
        "wood",
        "plank",
        [x - 0.58 + index * 0.29, 1.12, z],
        [0.26, 2.15, 0.12],
        woodPalette[index % woodPalette.length],
      ),
    );
  }

  pieces.push(
    makePiece(
      `${id}:brace:top`,
      id,
      "wood",
      "plank",
      [x, 1.72, z + facing * 0.075],
      [1.55, 0.13, 0.13],
      "#704228",
    ),
    makePiece(
      `${id}:brace:diagonal`,
      id,
      "wood",
      "plank",
      [x, 1.04, z + facing * 0.08],
      [1.65, 0.14, 0.13],
      "#704228",
      [0, 0, -0.62],
    ),
  );

  return cluster(id, "Plank door", "wood", "linked", pieces);
}

function createSteelRoof(): BreakableClusterDefinition {
  const pieces: BreakablePieceDefinition[] = [];
  const id = "house:steel-roof";

  for (const side of [-1, 1] as const) {
    for (let index = 0; index < 5; index += 1) {
      pieces.push(
        makePiece(
          `${id}:${side}:${index}`,
          id,
          "steel",
          "steelSheet",
          [side * 2.35, 6.08, -6.1 + index * 1.58],
          [5.35, 0.1, 1.58],
          index % 2 === 0 ? "#68777a" : "#78898b",
          [0, 0, side * -0.38],
        ),
      );
    }
  }

  for (let index = 0; index < 5; index += 1) {
    pieces.push(
      makePiece(
        `${id}:ridge:${index}`,
        id,
        "steel",
        "steelSheet",
        [0, 7.21, -6.1 + index * 1.58],
        [0.8, 0.08, 1.56],
        index % 2 === 0 ? "#59686b" : "#4e5c5f",
      ),
    );
  }

  return cluster(id, "Corrugated steel roof", "steel", "linked", pieces);
}

function createTerrace(): BreakableClusterDefinition {
  const pieces: BreakablePieceDefinition[] = [];
  const id = "yard:terrace";

  for (const z of [1.4, 2.55, 3.7]) {
    pieces.push(
      makePiece(
        `${id}:joist:${z}`,
        id,
        "wood",
        "plank",
        [0, 0.2, z],
        [6.1, 0.14, 0.22],
        "#6b3f26",
      ),
    );
  }

  for (let index = 0; index < 11; index += 1) {
    pieces.push(
      makePiece(
        `${id}:deck:${index}`,
        id,
        "wood",
        "plank",
        [-2.75 + index * 0.55, 0.34, 2.55],
        [0.55, 0.14, 2.65],
        woodPalette[index % woodPalette.length],
      ),
    );
  }

  for (let index = 0; index < 3; index += 1) {
    pieces.push(
      makePiece(
        `${id}:step:${index}`,
        id,
        "wood",
        "plank",
        [0.4, 0.08 + index * 0.1, 4.05 - index * 0.3],
        [2.2, 0.13, 0.48],
        woodPalette[(index + 1) % woodPalette.length],
      ),
    );
  }

  for (const x of [-2.9, 2.9]) {
    pieces.push(
      makePiece(
        `${id}:post:${x}`,
        id,
        "wood",
        "plank",
        [x, 0.85, 3.65],
        [0.18, 1.1, 0.18],
        "#70442a",
      ),
      makePiece(
        `${id}:post:front:${x}`,
        id,
        "wood",
        "plank",
        [x, 0.85, 1.45],
        [0.18, 1.1, 0.18],
        "#70442a",
      ),
      makePiece(
        `${id}:rail:${x}`,
        id,
        "wood",
        "plank",
        [x, 1.18, 2.5],
        [0.16, 0.16, 2.45],
        "#805031",
      ),
    );
  }

  return cluster(id, "Wood terrace", "wood", "linked", pieces);
}

// A proper terrace chair: four vertical legs standing ON the deck, a seat on
// top of them, two back stiles rising from the seat and a back panel between
// them — every part bears on the previous one for the structural solver.
function createChair(id: string, x: number, z: number): BreakableClusterDefinition {
  const deckTop = 0.41;
  const pieces: BreakablePieceDefinition[] = [];

  for (const [legX, legZ] of [
    [-0.31, -0.24],
    [0.31, -0.24],
    [-0.31, 0.24],
    [0.31, 0.24],
  ] as const) {
    pieces.push(
      makePiece(
        `${id}:leg:${legX}:${legZ}`,
        id,
        "wood",
        "plank",
        [x + legX, deckTop + 0.23, z + legZ],
        [0.09, 0.45, 0.09],
        "#70442a",
      ),
    );
  }

  pieces.push(
    makePiece(`${id}:seat`, id, "wood", "plank",
      [x, deckTop + 0.51, z], [0.8, 0.1, 0.64], "#a66a3b"),
    makePiece(`${id}:stile:l`, id, "wood", "plank",
      [x - 0.265, deckTop + 0.95, z - 0.245], [0.07, 0.78, 0.07], "#7e4d2c"),
    makePiece(`${id}:stile:r`, id, "wood", "plank",
      [x + 0.265, deckTop + 0.95, z - 0.245], [0.07, 0.78, 0.07], "#7e4d2c"),
    makePiece(`${id}:back`, id, "wood", "plank",
      [x, deckTop + 1.08, z - 0.245], [0.46, 0.44, 0.07], "#9a6036"),
  );

  return cluster(id, "Wood chair", "wood", "linked", pieces);
}

function createStoneGazebo(): BreakableClusterDefinition {
  const pieces: BreakablePieceDefinition[] = [];
  const id = "yard:stone-gazebo";
  const centerX = -9;
  const centerZ = -4.2;
  const corners = [
    [-2, -2],
    [2, -2],
    [-2, 2],
    [2, 2],
  ] as const;

  corners.forEach(([offsetX, offsetZ], cornerIndex) => {
    for (let row = 0; row < 5; row += 1) {
      pieces.push({
        ...makePiece(
          `${id}:pillar:${cornerIndex}:${row}`,
          id,
          "stone",
          "stoneBlock",
          [centerX + offsetX, 0.34 + row * 0.62, centerZ + offsetZ],
          [0.62, 0.58, 0.62],
          stonePalette[(cornerIndex + row) % stonePalette.length],
        ),
        row,
        column: cornerIndex,
      });
    }
  });

  [
    [centerX, 3.22, centerZ - 2, 4.7, 0.38, 0.52],
    [centerX, 3.22, centerZ + 2, 4.7, 0.38, 0.52],
    [centerX - 2, 3.22, centerZ, 0.52, 0.38, 4.7],
    [centerX + 2, 3.22, centerZ, 0.52, 0.38, 4.7],
    [centerX, 3.38, centerZ, 4.7, 0.3, 0.38],
    [centerX, 3.38, centerZ, 0.38, 0.3, 4.7],
  ].forEach(([x, y, z, width, height, depth], index) => {
    pieces.push(
      makePiece(
        `${id}:beam:${index}`,
        id,
        "stone",
        "stoneBlock",
        [x, y, z],
        [width, height, depth],
        stonePalette[index % stonePalette.length],
      ),
    );
  });

  for (let xIndex = 0; xIndex < 3; xIndex += 1) {
    for (let zIndex = 0; zIndex < 3; zIndex += 1) {
      pieces.push(
        makePiece(
          `${id}:roof:${xIndex}:${zIndex}`,
          id,
          "stone",
          "stoneBlock",
          [centerX - 1.6 + xIndex * 1.6, 3.53, centerZ - 1.6 + zIndex * 1.6],
          [1.6, 0.22, 1.6],
          stonePalette[(xIndex * 2 + zIndex) % stonePalette.length],
        ),
        makePiece(
          `${id}:floor:${xIndex}:${zIndex}`,
          id,
          "stone",
          "stoneBlock",
          [centerX - 1.5 + xIndex * 1.5, 0.05, centerZ - 1.5 + zIndex * 1.5],
          [1.5, 0.16, 1.5],
          stonePalette[(xIndex + zIndex) % stonePalette.length],
        ),
      );
    }
  }

  return cluster(id, "Stone garden gazebo", "stone", "stack", pieces);
}

function createGroundTiles(): BreakableClusterDefinition[] {
  const grassPieces: BreakablePieceDefinition[] = [];
  const upperPieces: BreakablePieceDefinition[] = [];
  const lowerPieces: BreakablePieceDefinition[] = [];

  for (let xIndex = 0; xIndex < 15; xIndex += 1) {
    for (let zIndex = 0; zIndex < 12; zIndex += 1) {
      const cx = -12 + xIndex * 6;
      const cz = -48 + zIndex * 6;
      grassPieces.push(
        makePiece(
          `yard:ground:${xIndex}:${zIndex}`,
          "yard:ground",
          "soil",
          "groundTile",
          [cx, -0.14, cz],
          [6, 0.24, 6],
          (xIndex + zIndex) % 2 === 0 ? "#607b43" : "#6b874a",
        ),
      );
      upperPieces.push(
        makePiece(
          `yard:earth:u:${xIndex}:${zIndex}`,
          "yard:earth:upper",
          "earth",
          "groundTile",
          [cx, -0.71, cz],
          [6, 0.9, 6],
          (xIndex + zIndex) % 2 === 0 ? "#6d5a3e" : "#665336",
        ),
      );
      lowerPieces.push(
        makePiece(
          `yard:earth:l:${xIndex}:${zIndex}`,
          "yard:earth:lower",
          "earth",
          "groundTile",
          [cx, -1.61, cz],
          [6, 0.9, 6],
          (xIndex + zIndex) % 2 === 0 ? "#5c4a33" : "#55442d",
        ),
      );
    }
  }

  return [
    cluster("yard:ground", "Breakable ground cover", "soil", "linked", grassPieces),
    cluster("yard:earth:upper", "Topsoil layer", "earth", "linked", upperPieces),
    cluster("yard:earth:lower", "Deep earth layer", "earth", "linked", lowerPieces),
  ];
}

const panelPalette = ["#c8c1b2", "#bfb8aa", "#d1cabc", "#c4bdb0"];
const slabPalette = ["#b2aea3", "#a8a49a"];
const plinthColor = "#7d7a72";
const stairConcrete = "#9d9a91";

// Glass with this exact color glows warmly at night (lived-in windows,
// stairwell windows, lamp shades) — the renderer keys the emissive material
// off this constant.
export const litWindowColor = "#f2dfa7";

export interface LampDefinition {
  readonly id: string;
  readonly position: SceneVector3;
  readonly color?: string;
  readonly distance?: number;
  readonly intensity?: number;
}

const lampCollector: LampDefinition[] = [];

function windowGlassColor(id: string, litChance: number): string {
  return deterministicNoise(`lit:${id}`) < litChance
    ? litWindowColor
    : "#9fd5dd";
}

// A four-storey two-entrance panel khrushchevka: big wall panels with seams,
// floor slabs bearing on them, a stairwell per entrance with two concrete
// flights and a half-landing per storey, balconies from the second storey,
// flat roof with a parapet. Typical floor plan repeats on every storey.
type PieceRecolor = (piece: BreakablePieceDefinition) => string;

// Translate a finished cluster to a new spot on the map, prefixing every id
// so several instances of the same building template can coexist.
function transformCluster(
  source: BreakableClusterDefinition,
  prefix: string | undefined,
  dx: number,
  dz: number,
  recolor?: PieceRecolor,
): BreakableClusterDefinition {
  const mapId = (value: string) => (prefix ? `${prefix}:${value}` : value);

  return {
    ...source,
    id: mapId(source.id),
    pieces: source.pieces.map((piece) => ({
      ...piece,
      id: mapId(piece.id),
      clusterId: mapId(source.id),
      position: [
        piece.position[0] + dx,
        piece.position[1],
        piece.position[2] + dz,
      ] as SceneVector3,
      hinge: piece.hinge
        ? {
            ...piece.hinge,
            pivot: [
              piece.hinge.pivot[0] + dx,
              piece.hinge.pivot[1],
              piece.hinge.pivot[2] + dz,
            ] as SceneVector3,
          }
        : undefined,
      color: recolor ? recolor(piece) : piece.color,
    })),
  };
}

interface KhrushchevkaConfig {
  readonly prefix?: string;
  readonly dx?: number;
  readonly dz?: number;
  readonly palette?: readonly string[];
  readonly shellOnly?: boolean;
  readonly includeLamps?: boolean;
}

function createKhrushchevka(
  config: KhrushchevkaConfig = {},
): BreakableClusterDefinition[] {
  const clusters: BreakableClusterDefinition[] = [];
  const localLamps: LampDefinition[] = [];
  const x0 = 12;
  const x1 = 34;
  const z0 = -8;
  const z1 = -1;
  const floors = 4;
  const floorHeight = 2.6;
  const wallHeight = 2.38;
  const base = 0.4;
  const innerX0 = x0 + 0.15;
  const innerX1 = x1 - 0.15;
  const stripWidth = (innerX1 - innerX0) / 8;
  const bayWidth = (innerX1 - innerX0) / 16;
  const shaftStrips = [1, 5];
  const rowSplit = -4.5;
  const northRowCenter = (z0 + 0.15 + rowSplit) / 2;
  const southRowCenter = (rowSplit + z1 - 0.15) / 2;
  const rowDepth = rowSplit - (z0 + 0.15);
  const floorBase = (floor: number) => base + floor * floorHeight;
  const wallCenterY = (floor: number) =>
    floorBase(floor) + 0.01 + wallHeight / 2;
  const stripCenter = (strip: number) => innerX0 + stripWidth * (strip + 0.5);
  const bayCenter = (bay: number) => innerX0 + bayWidth * (bay + 0.5);

  // Цоколь
  const plinthPieces: BreakablePieceDefinition[] = [];
  for (let index = 0; index < 4; index += 1) {
    const cx = x0 + 2.75 + index * 5.5;
    plinthPieces.push(
      makePiece(`hru:plinth:s:${index}`, "hru:plinth", "concrete", "panel",
        [cx, 0.19, z1], [5.48, 0.42, 0.3], plinthColor),
      makePiece(`hru:plinth:n:${index}`, "hru:plinth", "concrete", "panel",
        [cx, 0.19, z0], [5.48, 0.42, 0.3], plinthColor),
    );
  }
  for (const ex of [x0, x1]) {
    plinthPieces.push(
      makePiece(`hru:plinth:e:${ex}`, "hru:plinth", "concrete", "panel",
        [ex, 0.19, (z0 + z1) / 2], [0.3, 0.42, 6.38], plinthColor),
    );
  }
  clusters.push(cluster("hru:plinth", "Khrushchevka plinth", "concrete", "mounted", plinthPieces));

  // Плиты перекрытий (шахты лестниц открыты на этажах 1-3)
  for (let level = 0; level <= floors; level += 1) {
    const pieces: BreakablePieceDefinition[] = [];
    const y = base + level * floorHeight - 0.1;
    for (let strip = 0; strip < 8; strip += 1) {
      for (const row of [0, 1] as const) {
        if (
          row === 0 &&
          shaftStrips.includes(strip) &&
          level >= 1 &&
          level <= 3
        ) {
          continue;
        }
        pieces.push(
          makePiece(
            `hru:slab:${level}:${strip}:${row}`,
            `hru:slab:${level}`,
            "concrete",
            "stoneBlock",
            [
              stripCenter(strip),
              y,
              row === 0 ? northRowCenter : southRowCenter,
            ],
            [stripWidth - 0.015, 0.2, rowDepth - 0.015],
            slabPalette[(strip + row + level) % 2],
          ),
        );
      }
    }
    clusters.push(
      cluster(`hru:slab:${level}`, `Slab level ${level}`, "concrete", "linked", pieces),
    );
  }

  // Южный фасад: чередование глухих панелей и оконных блоков, подъезды,
  // балконы со второго этажа
  const entryPieces: BreakablePieceDefinition[] = [];
  const balconyPieces: BreakablePieceDefinition[] = [];
  const balconyBays = [3, 5, 11, 13];
  const doorBays = [2, 10];
  for (let floor = 0; floor < floors; floor += 1) {
    const southPieces: BreakablePieceDefinition[] = [];
    const clusterId = `hru:south:${floor}`;
    const b = floorBase(floor);

    for (let bay = 0; bay < 16; bay += 1) {
      const cx = bayCenter(bay);
      const isDoorBay = floor === 0 && doorBays.includes(bay);

      if (isDoorBay) {
        southPieces.push(
          makePiece(`${clusterId}:${bay}:lintel`, clusterId, "concrete", "panel",
            [cx, b + 2.2, z1], [bayWidth - 0.01, 0.38, 0.3],
            panelPalette[bay % panelPalette.length]),
          makePiece(`${clusterId}:${bay}:jamb:l`, clusterId, "concrete", "panel",
            [cx - 0.5875, b + 1.0, z1], [0.155, 1.98, 0.3],
            panelPalette[(bay + 1) % panelPalette.length]),
          makePiece(`${clusterId}:${bay}:jamb:r`, clusterId, "concrete", "panel",
            [cx + 0.5875, b + 1.0, z1], [0.155, 1.98, 0.3],
            panelPalette[(bay + 1) % panelPalette.length]),
        );
        entryPieces.push(
          {
            ...makePiece(`hru:entry:door:${bay}`, "hru:entry", "wood", "plank",
              [cx, b + 0.99, -0.94], [1.02, 1.96, 0.1], "#5f6f5c"),
            hinge: {
              pivot: [cx - 0.51, b + 0.99, -0.94],
              direction: [1, 0, 0],
              normal: [0, 0, 1],
            },
          },
          makePiece(`hru:entry:steps:${bay}`, "hru:entry", "concrete", "stoneBlock",
            [cx, 0.16, -0.35], [1.7, 0.36, 1.0], stairConcrete),
          makePiece(`hru:entry:canopy:${bay}`, "hru:entry", "concrete", "panel",
            [cx, b + 2.5, -0.5], [1.9, 0.12, 1.1], slabPalette[0]),
          makePiece(`hru:entry:lamp:${bay}`, "hru:entry", "glass", "glassPane",
            [cx, b + 2.2, -0.76], [0.24, 0.2, 0.18], litWindowColor),
        );
        localLamps.push({
          id: `hru:entry:lamp:${bay}`,
          position: [cx, b + 2.1, -0.25],
        });
      } else if (bay % 2 === 1) {
        southPieces.push(
          makePiece(`${clusterId}:${bay}:sill`, clusterId, "concrete", "panel",
            [cx, b + 0.405, z1], [bayWidth - 0.01, 0.79, 0.3],
            panelPalette[(bay + floor) % panelPalette.length]),
          makePiece(`${clusterId}:${bay}:glass`, clusterId, "glass", "glassPane",
            [cx, b + 1.39, z1], [bayWidth - 0.08, 1.14, 0.06],
            windowGlassColor(`${clusterId}:${bay}`, 0.42)),
          makePiece(`${clusterId}:${bay}:lintel`, clusterId, "concrete", "panel",
            [cx, b + 2.185, z1], [bayWidth - 0.01, 0.41, 0.3],
            panelPalette[(bay + floor + 2) % panelPalette.length]),
        );
      } else {
        southPieces.push(
          makePiece(`${clusterId}:${bay}`, clusterId, "concrete", "panel",
            [cx, b + 1.2, z1], [bayWidth - 0.01, wallHeight, 0.3],
            panelPalette[(bay + floor) % panelPalette.length]),
        );
      }

      if (floor >= 1 && balconyBays.includes(bay)) {
        balconyPieces.push(
          makePiece(`hru:balcony:${floor}:${bay}:plate`, "hru:balcony", "concrete", "stoneBlock",
            [cx, b - 0.06, -0.475], [1.9, 0.14, 1.15], slabPalette[1]),
          makePiece(`hru:balcony:${floor}:${bay}:rail`, "hru:balcony", "steel", "steelSheet",
            [cx, b + 0.41, 0.06], [1.84, 0.78, 0.05], "#77848a"),
        );
      }
    }
    clusters.push(
      cluster(`hru:south:${floor}`, `South facade ${floor}`, "concrete", "mounted", southPieces),
    );
  }
  clusters.push(cluster("hru:balcony", "Balconies", "concrete", "mounted", balconyPieces));
  clusters.push(cluster("hru:entry", "Entrances", "concrete", "mounted", entryPieces));

  // Северный фасад: оконные полосы по сеткам панелей + лестничные клетки
  for (let floor = 0; floor < floors; floor += 1) {
    const northPieces: BreakablePieceDefinition[] = [];
    const clusterId = `hru:north:${floor}`;
    const b = floorBase(floor);
    for (let strip = 0; strip < 8; strip += 1) {
      if (shaftStrips.includes(strip)) {
        continue;
      }
      const cx = stripCenter(strip);
      const jambWidth = (stripWidth - 1.9) / 2 - 0.02;
      northPieces.push(
        makePiece(`${clusterId}:${strip}:sill`, clusterId, "concrete", "panel",
          [cx, b + 0.405, z0], [stripWidth - 0.02, 0.79, 0.3],
          panelPalette[(strip + floor) % panelPalette.length]),
        makePiece(`${clusterId}:${strip}:glass`, clusterId, "glass", "glassPane",
          [cx, b + 1.39, z0], [1.9, 1.14, 0.06],
          windowGlassColor(`${clusterId}:${strip}`, 0.45)),
        makePiece(`${clusterId}:${strip}:jamb:l`, clusterId, "concrete", "panel",
          [cx - 0.95 - jambWidth / 2 - 0.01, b + 1.39, z0],
          [jambWidth, 1.14, 0.3], panelPalette[(strip + floor + 1) % panelPalette.length]),
        makePiece(`${clusterId}:${strip}:jamb:r`, clusterId, "concrete", "panel",
          [cx + 0.95 + jambWidth / 2 + 0.01, b + 1.39, z0],
          [jambWidth, 1.14, 0.3], panelPalette[(strip + floor + 1) % panelPalette.length]),
        makePiece(`${clusterId}:${strip}:lintel`, clusterId, "concrete", "panel",
          [cx, b + 2.185, z0], [stripWidth - 0.02, 0.41, 0.3],
          panelPalette[(strip + floor + 2) % panelPalette.length]),
      );
    }
    clusters.push(
      cluster(`hru:north:${floor}`, `North facade ${floor}`, "concrete", "mounted", northPieces),
    );
  }

  // Лестничные клетки: сплошная северная стена с межэтажными окнами
  for (const [sectionIndex, strip] of shaftStrips.entries()) {
    const pieces: BreakablePieceDefinition[] = [];
    const clusterId = `hru:stairwell:${sectionIndex}`;
    const cx = stripCenter(strip);
    pieces.push(
      makePiece(`${clusterId}:ground`, clusterId, "concrete", "panel",
        [cx, 1.565, z0], [stripWidth - 0.02, 2.31, 0.3], panelPalette[0]),
    );
    for (let window = 0; window < 3; window += 1) {
      pieces.push(
        makePiece(`${clusterId}:glass:${window}`, clusterId, "glass", "glassPane",
          [cx, 3.31 + window * floorHeight, z0], [stripWidth - 0.05, 1.14, 0.06],
          litWindowColor),
      );
      if (window < 2) {
        pieces.push(
          makePiece(`${clusterId}:band:${window}`, clusterId, "concrete", "panel",
            [cx, 4.61 + window * floorHeight, z0], [stripWidth - 0.02, 1.42, 0.3],
            panelPalette[(window + 1) % panelPalette.length]),
        );
      }
    }
    pieces.push(
      makePiece(`${clusterId}:top`, clusterId, "concrete", "panel",
        [cx, 9.845, z0], [stripWidth - 0.02, 1.49, 0.3], panelPalette[2]),
    );
    clusters.push(
      cluster(clusterId, `Stairwell wall ${sectionIndex}`, "concrete", "mounted", pieces),
    );
  }

  // Торцы
  for (let floor = 0; floor < floors; floor += 1) {
    const pieces: BreakablePieceDefinition[] = [];
    const clusterId = `hru:ends:${floor}`;
    for (const ex of [x0, x1]) {
      for (const [index, zc] of [-6.25, -2.75].entries()) {
        // Торцевые панели чуть выше этажа: каждая опирается на предыдущую,
        // цепочка несёт от цоколя, а не от нулевой кромки плиты.
        pieces.push(
          makePiece(`${clusterId}:${ex}:${index}`, clusterId, "concrete", "panel",
            [ex, floorBase(floor) + 1.22, zc], [0.3, 2.42, 3.46],
            panelPalette[(floor + index) % panelPalette.length]),
        );
      }
    }
    clusters.push(
      cluster(clusterId, `End walls ${floor}`, "concrete", "mounted", pieces),
    );
  }

  // Внутренние стены: капитальные вдоль лестничной клетки (с дверными
  // проёмами к квартирам) и гипсовые перегородки комнат
  for (const [sectionIndex, strip] of shaftStrips.entries()) {
    const pieces: BreakablePieceDefinition[] = [];
    const clusterId = `hru:walls:${sectionIndex}`;
    const b1 = innerX0 + stripWidth * strip;
    const b2 = innerX0 + stripWidth * (strip + 1);
    const plasterX = innerX0 + stripWidth * (sectionIndex === 0 ? 3 : 7);
    const leftFlatMid = innerX0 + stripWidth * (sectionIndex === 0 ? 0.5 : 4.5);
    for (let floor = 0; floor < floors; floor += 1) {
      const wy = wallCenterY(floor);
      for (const bx of [b1, b2]) {
        pieces.push(
          makePiece(`${clusterId}:${floor}:shaft:${bx}`, clusterId, "concrete", "panel",
            [bx, wy, -6.17], [0.24, wallHeight, 3.33], panelPalette[3]),
          makePiece(`${clusterId}:${floor}:flat:${bx}`, clusterId, "concrete", "panel",
            [bx, wy, -2.32], [0.24, wallHeight, 2.26], panelPalette[3]),
        );
      }
      pieces.push(
        makePiece(`${clusterId}:${floor}:room`, clusterId, "concrete", "panel",
          [plasterX, wy, -2.35], [0.12, wallHeight, 2.3], "#d8d3c6"),
        makePiece(`${clusterId}:${floor}:kitchen`, clusterId, "concrete", "panel",
          [plasterX, wy, -6.55], [0.12, wallHeight, 2.4], "#d8d3c6"),
        makePiece(`${clusterId}:${floor}:studio`, clusterId, "plaster", "panel",
          [leftFlatMid - 0.5, wy, -4.0], [1.7, wallHeight, 0.12], "#e3ddcf"),
      );
    }
    clusters.push(
      cluster(clusterId, `Section walls ${sectionIndex}`, "concrete", "mounted", pieces),
    );
  }

  // Лестницы: два бетонных марша на этаж + межэтажная площадка
  for (const [sectionIndex, strip] of shaftStrips.entries()) {
    const pieces: BreakablePieceDefinition[] = [];
    const clusterId = `hru:stairs:${sectionIndex}`;
    const sx = stripCenter(strip);
    for (let n = 0; n < 3; n += 1) {
      pieces.push(
        makePiece(`${clusterId}:mid:${n}`, clusterId, "concrete", "stoneBlock",
          [sx, floorBase(n) + 1.22, -7.36], [stripWidth - 0.2, 0.16, 0.95],
          stairConcrete),
        makePiece(`${clusterId}:up:${n}`, clusterId, "concrete", "stoneBlock",
          [sx - 0.67, floorBase(n) + 0.72, -5.7], [1.2, 0.15, 2.7],
          stairConcrete, [0.5, 0, 0]),
        makePiece(`${clusterId}:down:${n}`, clusterId, "concrete", "stoneBlock",
          [sx + 0.67, floorBase(n) + 2.02, -5.7], [1.2, 0.15, 2.7],
          stairConcrete, [-0.5, 0, 0]),
        makePiece(`${clusterId}:rail:up:${n}`, clusterId, "steel", "steelSheet",
          [sx - 0.12, floorBase(n) + 1.22, -5.7], [0.05, 0.72, 2.5],
          "#5d6663", [0.5, 0, 0]),
        makePiece(`${clusterId}:rail:down:${n}`, clusterId, "steel", "steelSheet",
          [sx + 0.12, floorBase(n) + 2.52, -5.7], [0.05, 0.72, 2.5],
          "#5d6663", [-0.5, 0, 0]),
      );
      for (let tread = 0; tread < 4; tread += 1) {
        pieces.push(
          makePiece(`${clusterId}:tread:up:${n}:${tread}`, clusterId, "concrete", "stoneBlock",
            [sx - 0.67, floorBase(n) + 0.27 + 0.31 * tread, -4.82 - 0.5625 * tread],
            [1.16, 0.07, 0.4], "#a7a49b"),
          makePiece(`${clusterId}:tread:down:${n}:${tread}`, clusterId, "concrete", "stoneBlock",
            [sx + 0.67, floorBase(n) + 1.61 + 0.31 * tread, -6.51 + 0.5625 * tread],
            [1.16, 0.07, 0.4], "#a7a49b"),
        );
      }
    }
    clusters.push(
      cluster(clusterId, `Stairs ${sectionIndex}`, "concrete", "linked", pieces),
    );
  }

  // Парапет, вентшахты
  const roofPieces: BreakablePieceDefinition[] = [];
  for (let index = 0; index < 4; index += 1) {
    const cx = x0 + 2.75 + index * 5.5;
    roofPieces.push(
      makePiece(`hru:parapet:s:${index}`, "hru:roof", "concrete", "panel",
        [cx, 11.06, -1.32], [5.42, 0.5, 0.25], panelPalette[index % 4]),
      makePiece(`hru:parapet:n:${index}`, "hru:roof", "concrete", "panel",
        [cx, 11.06, -7.68], [5.42, 0.5, 0.25], panelPalette[(index + 1) % 4]),
    );
  }
  for (const ex of [12.31, 33.69]) {
    roofPieces.push(
      makePiece(`hru:parapet:e:${ex}`, "hru:roof", "concrete", "panel",
        [ex, 11.06, (z0 + z1) / 2], [0.25, 0.5, 6.3], panelPalette[2]),
    );
  }
  roofPieces.push(
    makePiece("hru:vent:0", "hru:roof", "concrete", "stoneBlock",
      [16.2, 11.16, -6.1], [0.9, 0.7, 0.9], plinthColor),
    makePiece("hru:vent:1", "hru:roof", "concrete", "stoneBlock",
      [28.4, 11.16, -2.9], [0.9, 0.7, 0.9], plinthColor),
  );
  clusters.push(cluster("hru:roof", "Roof edge", "concrete", "mounted", roofPieces));

  // Квартирные двери на площадках и типовая мебель (план повторяется
  // по этажам и секциям)
  const flatDoorPieces: BreakablePieceDefinition[] = [];
  const fixturePieces: BreakablePieceDefinition[] = [];
  for (const [sectionIndex, strip] of shaftStrips.entries()) {
    const furniturePieces: BreakablePieceDefinition[] = [];
    const furnitureId = `hru:furniture:${sectionIndex}`;
    const b1 = innerX0 + stripWidth * strip;
    const b2 = innerX0 + stripWidth * (strip + 1);
    const xs = innerX0 + stripWidth * (sectionIndex === 0 ? 0 : 4);
    const plasterX = innerX0 + stripWidth * (sectionIndex === 0 ? 3 : 7);
    const sx = stripCenter(strip);

    for (let floor = 0; floor < floors; floor += 1) {
      const fb = floorBase(floor) + 0.01;

      for (const bx of [b1, b2]) {
        flatDoorPieces.push({
          ...makePiece(`hru:flatdoor:${sectionIndex}:${floor}:${bx}`, "hru:flatdoors", "wood", "plank",
            [bx, fb + 0.975, -3.96], [0.1, 1.95, 0.86], "#6e4a2c"),
          hinge: {
            pivot: [bx, fb + 0.975, -4.39],
            direction: [0, 0, 1],
            normal: [1, 0, 0],
          },
        });
      }

      const addFurniture = (
        name: string,
        material: BreakableMaterial,
        position: SceneVector3,
        size: SceneVector3,
        color: string,
      ) => {
        furniturePieces.push(
          makePiece(`${furnitureId}:${floor}:${name}`, furnitureId, material,
            material === "steel" ? "steelSheet" : "plank",
            position, size, color),
        );
      };

      // однушка слева от лестницы
      addFurniture("fridge:l", "steel", [xs + 0.5, fb + 0.75, -7.4], [0.6, 1.5, 0.6], "#e3e6e3");
      addFurniture("counter:l", "wood", [xs + 1.6, fb + 0.425, -7.45], [1.3, 0.85, 0.55], "#c9c4ba");
      addFurniture("bed:l", "wood", [xs + 0.55, fb + 0.225, -2.3], [0.85, 0.45, 1.8], "#8f5c39");
      addFurniture("wardrobe:l", "wood", [b1 - 0.75, fb + 0.9, -1.55], [1.0, 1.8, 0.5], "#7e5233");
      addFurniture("table:l", "wood", [xs + 1.9, fb + 0.36, -2.6], [0.8, 0.72, 0.8], "#a8763f");

      // двушка справа
      addFurniture("counter:r", "wood", [b2 + 1.0, fb + 0.425, -7.45], [1.5, 0.85, 0.55], "#c9c4ba");
      addFurniture("fridge:r", "steel", [b2 + 2.0, fb + 0.75, -7.4], [0.6, 1.5, 0.6], "#e3e6e3");
      addFurniture("table:r", "wood", [b2 + 0.8, fb + 0.36, -5.9], [0.8, 0.72, 0.8], "#a8763f");
      addFurniture("bed:r1", "wood", [b2 + 0.7, fb + 0.225, -2.2], [0.85, 0.45, 1.8], "#96613b");
      addFurniture("bed:r2", "wood", [plasterX + 0.7, fb + 0.225, -2.3], [0.85, 0.45, 1.8], "#8f5c39");
      addFurniture("wardrobe:r", "wood", [plasterX + 0.85, fb + 0.9, -7.5], [1.0, 1.8, 0.5], "#7e5233");

      // подъезд: плафон и электрощиток на каждой площадке
      fixturePieces.push(
        makePiece(`hru:fixture:plafond:${sectionIndex}:${floor}`, "hru:fixtures", "glass", "glassPane",
          [b1 + 0.18, fb + 2.05, -5.1], [0.1, 0.18, 0.34], litWindowColor),
        makePiece(`hru:fixture:panelbox:${sectionIndex}:${floor}`, "hru:fixtures", "steel", "steelSheet",
          [b2 - 0.18, fb + 1.5, -4.95], [0.1, 0.72, 0.5], "#b8b4a9"),
      );
    }

    // почтовые ящики на первом этаже
    fixturePieces.push(
      makePiece(`hru:fixture:mailbox:${sectionIndex}`, "hru:fixtures", "steel", "steelSheet",
        [sx - 0.5, 1.1, -7.78], [0.6, 0.5, 0.12], "#8e9491"),
    );

    clusters.push(
      cluster(furnitureId, `Flat furniture ${sectionIndex}`, "wood", "mounted", furniturePieces),
    );
  }
  clusters.push(cluster("hru:flatdoors", "Flat doors", "wood", "mounted", flatDoorPieces));

  // Крыша: телевизионные антенны; фасады: водосточные трубы
  for (const [index, ax] of [14.5, 30.2].entries()) {
    const az = index === 0 ? -5.5 : -3.5;
    fixturePieces.push(
      makePiece(`hru:antenna:${index}:pole`, "hru:fixtures", "steel", "steelSheet",
        [ax, 11.95, az], [0.07, 2.3, 0.07], "#6b7472"),
      makePiece(`hru:antenna:${index}:arm:0`, "hru:fixtures", "steel", "steelSheet",
        [ax, 12.6, az], [0.8, 0.05, 0.05], "#78827f"),
      makePiece(`hru:antenna:${index}:arm:1`, "hru:fixtures", "steel", "steelSheet",
        [ax, 12.95, az], [0.55, 0.05, 0.05], "#78827f"),
    );
  }
  for (const [index, [px, pz]] of ([
    [12.4, -0.72],
    [33.6, -0.72],
    [12.4, -8.28],
    [33.6, -8.28],
  ] as const).entries()) {
    fixturePieces.push(
      makePiece(`hru:downpipe:${index}`, "hru:fixtures", "steel", "steelSheet",
        [px, 5.18, pz], [0.11, 10.4, 0.11], "#9aa19e"),
    );
  }
  clusters.push(cluster("hru:fixtures", "Building fixtures", "steel", "mounted", fixturePieces));

  // Двор: лавочки у подъездов и уличные фонари
  const yardPieces: BreakablePieceDefinition[] = [];
  for (const [index, bxc] of [14.2, 25.2].entries()) {
    yardPieces.push(
      makePiece(`hru:bench:${index}:leg:0`, "hru:yard", "wood", "plank",
        [bxc - 0.55, 0.18, 1.75], [0.34, 0.4, 0.38], "#70452a"),
      makePiece(`hru:bench:${index}:leg:1`, "hru:yard", "wood", "plank",
        [bxc + 0.55, 0.18, 1.75], [0.34, 0.4, 0.38], "#70452a"),
      makePiece(`hru:bench:${index}:seat`, "hru:yard", "wood", "plank",
        [bxc, 0.42, 1.75], [1.5, 0.07, 0.42], "#a8763f"),
      makePiece(`hru:bench:${index}:back`, "hru:yard", "wood", "plank",
        [bxc, 0.63, 1.93], [1.5, 0.35, 0.06], "#9b6a3c"),
    );
  }
  for (const [index, [lx, lz]] of ([
    [16.5, 2.1],
    [27.5, 2.1],
    [8.0, 2.6],
  ] as const).entries()) {
    yardPieces.push(
      makePiece(`hru:streetlamp:${index}:pole`, "hru:yard", "steel", "steelSheet",
        [lx, 1.78, lz], [0.14, 3.6, 0.14], "#5d6663"),
      makePiece(`hru:streetlamp:${index}:head`, "hru:yard", "glass", "glassPane",
        [lx, 3.69, lz], [0.34, 0.22, 0.34], litWindowColor),
    );
    localLamps.push({
      id: `hru:streetlamp:${index}:head`,
      position: [lx, 3.42, lz + 0.1],
    });
  }
  clusters.push(cluster("hru:yard", "Courtyard", "wood", "mounted", yardPieces));

  // Асфальт: двор перед подъездами и дорожка от дома
  const asphaltPieces: BreakablePieceDefinition[] = [];
  for (let index = 0; index < 6; index += 1) {
    asphaltPieces.push(
      makePiece(`hru:asphalt:walk:${index}`, "hru:asphalt", "asphalt", "groundTile",
        [13.8 + index * 3.55, 0.03, 0.75], [3.5, 0.1, 1.5], "#4a4a48"),
    );
  }
  asphaltPieces.push(
    makePiece("hru:asphalt:path:0", "hru:asphalt", "asphalt", "groundTile",
      [6.6, 0.03, 1.7], [2.8, 0.1, 1.4], "#4e4e4c"),
    makePiece("hru:asphalt:path:1", "hru:asphalt", "asphalt", "groundTile",
      [9.6, 0.03, 1.2], [3.2, 0.1, 1.4], "#4a4a48"),
  );
  clusters.push(cluster("hru:asphalt", "Asphalt yard", "asphalt", "mounted", asphaltPieces));

  const shellExcluded = new Set([
    "hru:furniture:0",
    "hru:furniture:1",
    "hru:fixtures",
    "hru:yard",
    "hru:asphalt",
    "hru:flatdoors",
    "hru:stairs:0",
    "hru:stairs:1",
  ]);
  const baseExcluded = config.prefix
    ? new Set(["hru:yard", "hru:asphalt"])
    : new Set<string>();
  const excluded = config.shellOnly ? shellExcluded : baseExcluded;
  let result = clusters.filter((entry) => !excluded.has(entry.id));

  const dx = config.dx ?? 0;
  const dz = config.dz ?? 0;
  const paletteMap = new Map<string, string>();
  if (config.palette) {
    panelPalette.forEach((original, index) => {
      paletteMap.set(
        original,
        config.palette![index % config.palette!.length],
      );
    });
  }
  const needsRecolor = config.palette !== undefined || config.prefix !== undefined;
  const recolor: PieceRecolor | undefined = needsRecolor
    ? (piece) => {
        if (piece.material === "glass") {
          if (
            piece.id.includes(":stairwell:") ||
            piece.id.includes(":lamp") ||
            piece.id.includes(":plafond:")
          ) {
            return piece.color;
          }
          // re-roll lived-in windows so every building glows differently
          return deterministicNoise(`lit:${piece.id}`) < 0.42
            ? litWindowColor
            : "#9fd5dd";
        }
        return paletteMap.get(piece.color) ?? piece.color;
      }
    : undefined;

  if (config.prefix || dx !== 0 || dz !== 0 || recolor) {
    result = result.map((entry) =>
      transformCluster(entry, config.prefix, dx, dz, recolor),
    );
  }

  if (config.includeLamps ?? true) {
    const keptIds = new Set(
      result.flatMap((entry) => entry.pieces.map((piece) => piece.id)),
    );
    for (const lamp of localLamps) {
      const id = config.prefix ? `${config.prefix}:${lamp.id}` : lamp.id;
      if (keptIds.has(id)) {
        lampCollector.push({
          id,
          position: [
            lamp.position[0] + dx,
            lamp.position[1],
            lamp.position[2] + dz,
          ],
        });
      }
    }
  }

  return result;
}


// ---------------------------------------------------------------------------
// Town: streets with intersections, garages, a concrete fence, playgrounds
// ---------------------------------------------------------------------------

const silicateBrick = ["#d6d2c6", "#cfcabb", "#ddd8cc"];

function houseRecolor(
  colorMap: Record<string, string>,
  litSalt: string,
): PieceRecolor {
  return (piece) => {
    if (
      piece.material === "glass" &&
      piece.color === "#9fd5dd" &&
      deterministicNoise(`${litSalt}:${piece.id}`) < 0.35
    ) {
      return litWindowColor;
    }
    return colorMap[piece.color] ?? piece.color;
  };
}

const silicateHouseColors: Record<string, string> = {
  "#9f3e29": "#d8d3c6",
  "#b84a2d": "#cfc9ba",
  "#853523": "#c6c0b1",
  "#c45632": "#e0dbcf",
  "#68777a": "#8a4a3e",
  "#78898b": "#965446",
  "#59686b": "#7c4136",
  "#4e5c5f": "#703a30",
};

const yellowHouseColors: Record<string, string> = {
  "#9f3e29": "#c9a25a",
  "#b84a2d": "#d4ad62",
  "#853523": "#b8924f",
  "#c45632": "#ddb76e",
  "#68777a": "#4f6b4a",
  "#78898b": "#5a7a54",
  "#59686b": "#46603f",
  "#4e5c5f": "#3d5438",
};

function createOldHouse(
  prefix?: string,
  dx = 0,
  dz = 0,
  recolor?: PieceRecolor,
): BreakableClusterDefinition[] {
  const clusters = [
    ...createHouseWalls(),
    createBandBeams(),
    ...createGables(),
    createChimney(),
    createHouseFrame(),
    ...createFloorsAndStairs(),
    ...createWindows(),
    createDoor("door:front", 0.36, 0.76, 1),
    createDoor("door:back", 2.88, -6.76, -1),
    createSteelRoof(),
  ];

  if (!prefix && dx === 0 && dz === 0 && !recolor) {
    return clusters;
  }
  return clusters.map((entry) =>
    transformCluster(entry, prefix, dx, dz, recolor),
  );
}

function createStreets(): BreakableClusterDefinition[] {
  const roadPieces: BreakablePieceDefinition[] = [];
  const curbPieces: BreakablePieceDefinition[] = [];
  const markingPieces: BreakablePieceDefinition[] = [];

  for (let index = 0; index < 15; index += 1) {
    const cx = -12 + index * 6;
    roadPieces.push(
      makePiece(`town:road:main:${index}`, "town:roads", "asphalt", "groundTile",
        [cx, 0.03, -12], [6, 0.1, 6], index % 2 === 0 ? "#4a4a48" : "#4e4e4c"),
      makePiece(`town:road:south:${index}`, "town:roads", "asphalt", "groundTile",
        [cx, 0.03, -30], [6, 0.1, 6], index % 2 === 0 ? "#4e4e4c" : "#4a4a48"),
    );
    curbPieces.push(
      makePiece(`town:curb:n:${index}`, "town:curbs", "concrete", "panel",
        [cx, 0.06, -8.88], [5.96, 0.16, 0.22], "#b5b8b6"),
      makePiece(`town:curb:s:${index}`, "town:curbs", "concrete", "panel",
        [cx, 0.06, -15.12], [5.96, 0.16, 0.22], "#b5b8b6"),
    );
  }

  for (let index = 0; index < 12; index += 1) {
    const cz = -48 + index * 6;
    if (cz === -12 || cz === -30) {
      continue;
    }
    roadPieces.push(
      makePiece(`town:road:cross:${index}`, "town:roads", "asphalt", "groundTile",
        [42, 0.03, cz], [6, 0.1, 6], index % 2 === 0 ? "#4a4a48" : "#4e4e4c"),
    );
  }

  for (let index = 0; index < 14; index += 1) {
    const cx = -10 + index * 6;
    if (cx >= 38 && cx <= 46) {
      continue;
    }
    markingPieces.push(
      makePiece(`town:mark:main:${index}`, "town:markings", "concrete", "panel",
        [cx, 0.095, -12], [1.6, 0.03, 0.16], "#e8e6df"),
      makePiece(`town:mark:south:${index}`, "town:markings", "concrete", "panel",
        [cx, 0.095, -30], [1.6, 0.03, 0.16], "#e8e6df"),
    );
  }
  for (let stripe = 0; stripe < 6; stripe += 1) {
    markingPieces.push(
      makePiece(`town:zebra:${stripe}`, "town:markings", "concrete", "panel",
        [35 + stripe * 0.55, 0.095, -12], [0.34, 0.03, 4.6], "#e8e6df"),
    );
  }

  return [
    cluster("town:roads", "Asphalt streets", "asphalt", "mounted", roadPieces),
    cluster("town:curbs", "Street curbs", "concrete", "mounted", curbPieces),
    cluster("town:markings", "Road markings", "concrete", "mounted", markingPieces),
  ];
}

function createGarages(): BreakableClusterDefinition {
  const id = "town:garages";
  const pieces: BreakablePieceDefinition[] = [];
  const originX = -11;
  const pitch = 3.3;
  const gateColors = [
    "#5c7d5e",
    "#7d6a54",
    "#6a7b8c",
    "#79585c",
    "#5d6a7d",
    "#6d7a58",
  ];

  for (let wall = 0; wall <= 6; wall += 1) {
    pieces.push(
      makePiece(`${id}:side:${wall}`, id, "brick", "brick",
        [originX + pitch * wall, 1.08, -22.15], [0.24, 2.2, 5.55],
        silicateBrick[wall % silicateBrick.length]),
    );
  }

  for (let box = 0; box < 6; box += 1) {
    const cx = originX + pitch * (box + 0.5);
    pieces.push(
      makePiece(`${id}:back:${box}`, id, "brick", "brick",
        [cx, 1.08, -24.9], [3.04, 2.2, 0.22],
        silicateBrick[(box + 1) % silicateBrick.length]),
      makePiece(`${id}:lintel:${box}`, id, "concrete", "panel",
        [cx, 2.09, -19.3], [3.28, 0.3, 0.24], "#a9aca8"),
      makePiece(`${id}:roof:${box}`, id, "concrete", "stoneBlock",
        [cx, 2.32, -22.1], [3.28, 0.15, 6.1], "#84888c"),
    );

    for (const side of [-1, 1] as const) {
      const pivotX = cx + side * 1.52;
      pieces.push({
        ...makePiece(`${id}:gate:${box}:${side}`, id, "steel", "steelSheet",
          [cx + side * 0.76, 0.99, -19.3], [1.5, 1.88, 0.08],
          gateColors[box]),
        hinge: {
          pivot: [pivotX, 0.99, -19.3],
          direction: [-side, 0, 0],
          normal: [0, 0, 1],
        },
      });
    }
  }

  return cluster(id, "Garage row", "brick", "mounted", pieces);
}

function createConcreteFence(): BreakableClusterDefinition {
  const id = "town:fence";
  const pieces: BreakablePieceDefinition[] = [];

  for (let post = 0; post <= 8; post += 1) {
    pieces.push(
      makePiece(`${id}:post:${post}`, id, "concrete", "panel",
        [-11.2 + post * 2.6, 1.03, -26.3], [0.22, 2.1, 0.22], "#8f9595"),
    );
  }
  for (let panel = 0; panel < 8; panel += 1) {
    pieces.push(
      makePiece(`${id}:panel:${panel}`, id, "concrete", "panel",
        [-9.9 + panel * 2.6, 0.99, -26.3], [2.34, 1.86, 0.1], "#9aa0a0"),
    );
  }

  return cluster(id, "Concrete fence", "concrete", "mounted", pieces);
}

function createPlayground(
  id: string,
  px: number,
  pz: number,
): BreakableClusterDefinition {
  const pieces: BreakablePieceDefinition[] = [];

  // песочница с настоящим копаемым песком
  pieces.push(
    makePiece(`${id}:sand`, id, "earth", "groundTile",
      [px, 0.03, pz], [1.7, 0.12, 1.7], "#c8b280"),
    makePiece(`${id}:sand:border:n`, id, "wood", "plank",
      [px, 0.1, pz - 0.92], [1.9, 0.24, 0.12], "#b6603f"),
    makePiece(`${id}:sand:border:s`, id, "wood", "plank",
      [px, 0.1, pz + 0.92], [1.9, 0.24, 0.12], "#3f7db6"),
    makePiece(`${id}:sand:border:w`, id, "wood", "plank",
      [px - 0.92, 0.1, pz], [0.12, 0.24, 1.9], "#d8a324"),
    makePiece(`${id}:sand:border:e`, id, "wood", "plank",
      [px + 0.92, 0.1, pz], [0.12, 0.24, 1.9], "#4f9a4c"),
  );

  // горка: площадка на ножках, стальная лесенка, скат
  const sx = px + 3.5;
  pieces.push(
    makePiece(`${id}:slide:leg:l`, id, "steel", "steelSheet",
      [sx - 0.3, 0.73, pz - 0.25], [0.07, 1.5, 0.07], "#c8542e"),
    makePiece(`${id}:slide:leg:r`, id, "steel", "steelSheet",
      [sx + 0.3, 0.73, pz - 0.25], [0.07, 1.5, 0.07], "#c8542e"),
    makePiece(`${id}:slide:deck`, id, "steel", "steelSheet",
      [sx, 1.52, pz - 0.25], [0.75, 0.07, 0.75], "#e0b73a"),
    makePiece(`${id}:slide:ramp`, id, "steel", "steelSheet",
      [sx, 0.82, pz + 1.15], [0.66, 0.06, 2.5], "#d9d4c8", [0.55, 0, 0]),
    makePiece(`${id}:slide:stile:l`, id, "steel", "steelSheet",
      [sx - 0.28, 0.73, pz - 0.68], [0.05, 1.46, 0.05], "#3f7db6"),
    makePiece(`${id}:slide:stile:r`, id, "steel", "steelSheet",
      [sx + 0.28, 0.73, pz - 0.68], [0.05, 1.46, 0.05], "#3f7db6"),
    makePiece(`${id}:slide:rung:0`, id, "steel", "steelSheet",
      [sx, 0.45, pz - 0.68], [0.52, 0.045, 0.045], "#e0b73a"),
    makePiece(`${id}:slide:rung:1`, id, "steel", "steelSheet",
      [sx, 0.85, pz - 0.68], [0.52, 0.045, 0.045], "#e0b73a"),
    makePiece(`${id}:slide:rung:2`, id, "steel", "steelSheet",
      [sx, 1.25, pz - 0.68], [0.52, 0.045, 0.045], "#e0b73a"),
  );

  // карусель
  const kx = px + 6.8;
  pieces.push(
    makePiece(`${id}:carousel:post`, id, "steel", "steelSheet",
      [kx, 0.42, pz], [0.12, 0.9, 0.12], "#8f9595"),
    makePiece(`${id}:carousel:disc`, id, "steel", "steelSheet",
      [kx, 0.92, pz], [1.5, 0.08, 1.5], "#c8542e"),
    makePiece(`${id}:carousel:handle:0`, id, "steel", "steelSheet",
      [kx - 0.6, 1.14, pz - 0.6], [0.05, 0.36, 0.05], "#e0b73a"),
    makePiece(`${id}:carousel:handle:1`, id, "steel", "steelSheet",
      [kx + 0.6, 1.14, pz - 0.6], [0.05, 0.36, 0.05], "#3f7db6"),
    makePiece(`${id}:carousel:handle:2`, id, "steel", "steelSheet",
      [kx - 0.6, 1.14, pz + 0.6], [0.05, 0.36, 0.05], "#4f9a4c"),
    makePiece(`${id}:carousel:handle:3`, id, "steel", "steelSheet",
      [kx + 0.6, 1.14, pz + 0.6], [0.05, 0.36, 0.05], "#d8a324"),
  );

  // качели-балансир
  pieces.push(
    makePiece(`${id}:seesaw:log`, id, "wood", "plank",
      [px + 1.8, 0.14, pz + 2.6], [0.3, 0.32, 0.34], "#70442a"),
    makePiece(`${id}:seesaw:plank`, id, "wood", "plank",
      [px + 1.8, 0.38, pz + 2.6], [2.6, 0.07, 0.3], "#c8542e", [0, 0, 0.07]),
  );

  // турник
  pieces.push(
    makePiece(`${id}:bar:post:l`, id, "steel", "steelSheet",
      [px + 5.2, 0.93, pz + 2.7], [0.07, 1.9, 0.07], "#3f7db6"),
    makePiece(`${id}:bar:post:r`, id, "steel", "steelSheet",
      [px + 6.8, 0.93, pz + 2.7], [0.07, 1.9, 0.07], "#3f7db6"),
    makePiece(`${id}:bar:bar`, id, "steel", "steelSheet",
      [px + 6.0, 1.9, pz + 2.7], [1.68, 0.05, 0.05], "#d9d4c8"),
  );

  return cluster(id, "Playground", "steel", "mounted", pieces);
}

function createTownLamps(): BreakableClusterDefinition {
  const id = "town:street";
  const pieces: BreakablePieceDefinition[] = [];

  for (const [index, [lx, lz]] of ([
    [-2, -16.1],
    [56, -16.1],
  ] as const).entries()) {
    pieces.push(
      makePiece(`${id}:lamp:${index}:pole`, id, "steel", "steelSheet",
        [lx, 1.78, lz], [0.14, 3.6, 0.14], "#5d6663"),
      makePiece(`${id}:lamp:${index}:head`, id, "glass", "glassPane",
        [lx, 3.69, lz], [0.34, 0.22, 0.34], litWindowColor),
    );
    lampCollector.push({
      id: `${id}:lamp:${index}:head`,
      position: [lx, 3.42, lz + 0.1],
    });
  }

  return cluster(id, "Street lamps", "steel", "mounted", pieces);
}

export const breakableClusters = [
  ...createGroundTiles(),
  ...createOldHouse(),
  ...createOldHouse("h2", 56, 0, houseRecolor(silicateHouseColors, "lit-h2")),
  ...createOldHouse("h3", 56, -38, houseRecolor(yellowHouseColors, "lit-h3")),
  createTerrace(),
  createChair("yard:chair:left", -1.95, 2.75),
  createChair("yard:chair:right", 2.3, 2.75),
  createStoneGazebo(),
  ...createKhrushchevka(),
  ...createKhrushchevka({
    prefix: "k2",
    dz: -16,
    palette: ["#b3c0ad", "#a8b5a2", "#bec9b8", "#adbaa7"],
  }),
  ...createKhrushchevka({
    prefix: "k3",
    dx: 36,
    dz: -16,
    palette: ["#aeb9c2", "#a3aeb7", "#b9c3cc", "#a8b3bc"],
    shellOnly: true,
    includeLamps: false,
  }),
  ...createKhrushchevka({
    prefix: "k4",
    dx: -24,
    dz: -34,
    palette: ["#c9b3ae", "#bea8a3", "#d3bdb8", "#c3ada8"],
    shellOnly: true,
    includeLamps: false,
  }),
  ...createKhrushchevka({
    prefix: "k5",
    dx: 2,
    dz: -34,
    palette: ["#d5d2c9", "#cac7be", "#dfdcd3", "#cfccc3"],
    shellOnly: true,
    includeLamps: false,
  }),
  ...createKhrushchevka({
    prefix: "k6",
    dx: 36,
    dz: 20,
    palette: ["#cdc49f", "#c2b994", "#d7cea9", "#c7be99"],
    shellOnly: true,
    includeLamps: false,
  }),
  ...createStreets(),
  createGarages(),
  createConcreteFence(),
  createPlayground("playground:0", 21, 3.8),
  createPlayground("playground:1", 65, 7),
  createTownLamps(),
] as const;

export const lampDefinitions: readonly LampDefinition[] = lampCollector;

export const breakablePieces = breakableClusters.flatMap(
  (currentCluster) => currentCluster.pieces,
);

export const breakablePieceById = new Map(
  breakablePieces.map((piece) => [piece.id, piece]),
);

export const breakableClusterById = new Map(
  breakableClusters.map((currentCluster) => [
    currentCluster.id,
    currentCluster,
  ]),
);

export const structuralMaterialProfiles: Record<
  BreakableMaterial,
  StructuralMaterialProfile
> = {
  brick: {
    density: materialRuntimeProfiles.brick.density,
    compressionStrength: 62,
    cantilever: 0.24,
    maximumVerticalGap: 0.2,
    carriesAttachments: true,
  },
  wood: {
    density: materialRuntimeProfiles.wood.density,
    compressionStrength: 62,
    cantilever: 0.4,
    maximumVerticalGap: 0.2,
    carriesAttachments: true,
  },
  plaster: {
    density: materialRuntimeProfiles.plaster.density,
    compressionStrength: 40,
    cantilever: 0.3,
    maximumVerticalGap: 0.2,
    sideAttachmentReach: 0.34,
  },
  concrete: {
    density: materialRuntimeProfiles.concrete.density,
    compressionStrength: 132,
    cantilever: 0.45,
    maximumVerticalGap: 0.2,
    carriesAttachments: true,
    sideAttachmentReach: 0.28,
  },
  glass: {
    density: materialRuntimeProfiles.glass.density,
    compressionStrength: 180,
    cantilever: 0.18,
    maximumVerticalGap: 0.2,
    bearsLoad: false,
    sideAttachmentReach: 0.22,
  },
  steel: {
    density: materialRuntimeProfiles.steel.density,
    compressionStrength: 220,
    cantilever: 2.1,
    maximumVerticalGap: 1.1,
    sideAttachmentReach: 0.24,
  },
  stone: {
    density: materialRuntimeProfiles.stone.density,
    compressionStrength: 118,
    cantilever: 0.38,
    maximumVerticalGap: 0.2,
    carriesAttachments: true,
  },
  basalt: {
    density: materialRuntimeProfiles.basalt.density,
    compressionStrength: 360,
    cantilever: 0.4,
    maximumVerticalGap: 0.2,
    carriesAttachments: true,
  },
  graphiteStone: {
    density: materialRuntimeProfiles.graphiteStone.density,
    compressionStrength: 300,
    cantilever: 0.42,
    maximumVerticalGap: 0.2,
    carriesAttachments: true,
  },
  darkGlass: {
    density: materialRuntimeProfiles.darkGlass.density,
    compressionStrength: 360,
    cantilever: 0.16,
    maximumVerticalGap: 0.2,
    carriesAttachments: false,
    sideAttachmentReach: 0.22,
  },
  foliage: {
    density: materialRuntimeProfiles.foliage.density,
    compressionStrength: 4,
    cantilever: 0.38,
    maximumVerticalGap: 0.24,
    bearsLoad: false,
    sideAttachmentReach: 0.38,
  },
  grass: {
    density: materialRuntimeProfiles.grass.density,
    compressionStrength: Number.POSITIVE_INFINITY,
    cantilever: 0.18,
    maximumVerticalGap: 0.2,
    carriesAttachments: true,
  },
  soil: {
    density: materialRuntimeProfiles.soil.density,
    compressionStrength: Number.POSITIVE_INFINITY,
    cantilever: Number.POSITIVE_INFINITY,
    maximumVerticalGap: 0.2,
    foundation: true,
    carriesAttachments: true,
  },
  earth: {
    density: materialRuntimeProfiles.earth.density,
    compressionStrength: Number.POSITIVE_INFINITY,
    cantilever: Number.POSITIVE_INFINITY,
    maximumVerticalGap: 0.2,
    foundation: true,
    carriesAttachments: true,
  },
  asphalt: {
    density: materialRuntimeProfiles.asphalt.density,
    compressionStrength: 50,
    cantilever: 0.3,
    maximumVerticalGap: 0.2,
    carriesAttachments: true,
  },
};

function deterministicNoise(value: string): number {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return ((hash >>> 0) % 10000) / 10000;
}

export interface DestructionSceneCopy {
  readonly status: string;
  readonly eyebrow: string;
  readonly heading: string;
  readonly ready: string;
  readonly loading: string;
  readonly description: string;
  readonly enter: string;
  readonly returnToGame: string;
  readonly reset: string;
}

export interface DestructionSceneDefinition {
  readonly id: string;
  readonly title: string;
  readonly environment: "town" | "fortress";
  readonly playerSpawn: SceneVector3;
  readonly cameraFar: number;
  readonly worldCenter: readonly [x: number, z: number];
  readonly worldHalfExtents: readonly [x: number, z: number];
  readonly worldRadius?: number;
  readonly safetyFloorY: number;
  readonly copy: DestructionSceneCopy;
  readonly breakableClusters: readonly BreakableClusterDefinition[];
  readonly breakablePieces: readonly BreakablePieceDefinition[];
  readonly breakablePieceById: ReadonlyMap<string, BreakablePieceDefinition>;
  readonly breakableClusterById: ReadonlyMap<
    string,
    BreakableClusterDefinition
  >;
  readonly lampDefinitions: readonly LampDefinition[];
  readonly resolveStructuralCollapse: (
    broken: ReadonlySet<string>,
  ) => ReadonlySet<string>;
  readonly structuralScopeFor: (
    pieceIds: Iterable<string>,
  ) => ReadonlySet<string>;
  readonly fractureLocallyAt: (
    target: BreakablePieceDefinition,
    current: ReadonlySet<string>,
    impactIndex: number,
  ) => ReadonlySet<string>;
  readonly settleAfterBreak: (
    broken: ReadonlySet<string>,
  ) => ReadonlySet<string>;
}

interface DestructionSceneOptions {
  readonly id: string;
  readonly title: string;
  readonly environment?: DestructionSceneDefinition["environment"];
  readonly playerSpawn: SceneVector3;
  readonly cameraFar?: number;
  readonly worldCenter: readonly [x: number, z: number];
  readonly worldHalfExtents: readonly [x: number, z: number];
  readonly worldRadius?: number;
  readonly safetyFloorY?: number;
  readonly copy: DestructionSceneCopy;
  readonly clusters: readonly BreakableClusterDefinition[];
  readonly lamps?: readonly LampDefinition[];
}

export function createDestructionScene(
  options: DestructionSceneOptions,
): DestructionSceneDefinition {
  const pieces = options.clusters.flatMap(
    (currentCluster) => currentCluster.pieces,
  );
  const pieceById = new Map(pieces.map((piece) => [piece.id, piece]));
  const clusterById = new Map(
    options.clusters.map((currentCluster) => [
      currentCluster.id,
      currentCluster,
    ]),
  );
  const structuralSolver = createStructuralSolver(
    pieces,
    structuralMaterialProfiles,
  );

  const resolveStructuralCollapse = (
    broken: ReadonlySet<string>,
  ): ReadonlySet<string> => structuralSolver.resolve(broken);
  const structuralScopeFor = (
    pieceIds: Iterable<string>,
  ): ReadonlySet<string> => structuralSolver.connectedPieceIds(pieceIds);
  const fractureLocallyAt = (
    target: BreakablePieceDefinition,
    current: ReadonlySet<string>,
    impactIndex: number,
  ): ReadonlySet<string> => {
    if (current.has(target.id)) {
      return current;
    }

    const currentCluster = clusterById.get(target.clusterId);
    if (!currentCluster) {
      return current;
    }

    const profile = materialRuntimeProfiles[target.material];
    const next = new Set(current);
    next.add(target.id);

    for (const candidate of currentCluster.pieces) {
      if (next.has(candidate.id)) {
        continue;
      }

      const dx =
        (candidate.position[0] - target.position[0]) /
        profile.fractureRadius[0];
      const dy =
        (candidate.position[1] - target.position[1]) /
        profile.fractureRadius[1];
      const dz =
        (candidate.position[2] - target.position[2]) /
        profile.fractureRadius[0];
      const distance = Math.hypot(dx, dy, dz);
      const noise = deterministicNoise(
        `${target.id}:${candidate.id}:${impactIndex}`,
      );
      const irregularEdge = 0.68 + noise * 0.46;

      if (
        distance < irregularEdge &&
        noise < profile.neighborChance + Math.max(0, 1 - distance) * 0.3
      ) {
        next.add(candidate.id);
      }
    }

    if (currentCluster.supportMode === "linked") {
      const linkedCandidates = currentCluster.pieces
        .filter((piece) => !next.has(piece.id))
        .sort(
          (left, right) =>
            Math.hypot(
              left.position[0] - target.position[0],
              left.position[1] - target.position[1],
              left.position[2] - target.position[2],
            ) -
            Math.hypot(
              right.position[0] - target.position[0],
              right.position[1] - target.position[1],
              right.position[2] - target.position[2],
            ),
        );

      if (linkedCandidates[0] && impactIndex % 3 === 0) {
        next.add(linkedCandidates[0].id);
      }
    }

    return next;
  };
  const settleAfterBreak = (
    broken: ReadonlySet<string>,
  ): ReadonlySet<string> => resolveStructuralCollapse(broken);

  return {
    id: options.id,
    title: options.title,
    environment: options.environment ?? "town",
    playerSpawn: options.playerSpawn,
    cameraFar: options.cameraFar ?? 140,
    worldCenter: options.worldCenter,
    worldHalfExtents: options.worldHalfExtents,
    worldRadius: options.worldRadius,
    safetyFloorY: options.safetyFloorY ?? -2.2,
    copy: options.copy,
    breakableClusters: options.clusters,
    breakablePieces: pieces,
    breakablePieceById: pieceById,
    breakableClusterById: clusterById,
    lampDefinitions: options.lamps ?? [],
    resolveStructuralCollapse,
    structuralScopeFor,
    fractureLocallyAt,
    settleAfterBreak,
  };
}

export const openHouseScene = createDestructionScene({
  id: "open-house",
  title: "Make a Mess",
  environment: "town",
  playerSpawn: [0, 1.25, 7.4],
  worldCenter: [30, -15],
  worldHalfExtents: [45.5, 36.5],
  safetyFloorY: -2.2,
  copy: {
    status: "Make a Mess / 004",
    eyebrow: "Open house test 001",
    heading: "Дом — объект.",
    ready: "Open house ready",
    loading: "Собираем дом…",
    description:
      "Целый квартал: шесть панельных четырёхэтажек, три дома, улицы с перекрёстками, гаражи с распахивающимися воротами, детские площадки и дворы. На компьютере — WASD и мышь. На телефоне или планшете — левый стик, правая зона обзора и крупные кнопки оружия.",
    enter: "Взять молоток",
    returnToGame: "Вернуться в гараж",
    reset: "Собрать дом заново",
  },
  clusters: breakableClusters,
  lamps: lampDefinitions,
});

export function resolveStructuralCollapse(
  broken: ReadonlySet<string>,
): ReadonlySet<string> {
  return openHouseScene.resolveStructuralCollapse(broken);
}

export function structuralScopeFor(
  pieceIds: Iterable<string>,
): ReadonlySet<string> {
  return openHouseScene.structuralScopeFor(pieceIds);
}

export function fractureLocallyAt(
  target: BreakablePieceDefinition,
  current: ReadonlySet<string>,
  impactIndex: number,
): ReadonlySet<string> {
  return openHouseScene.fractureLocallyAt(target, current, impactIndex);
}

export function fractureAt(
  target: BreakablePieceDefinition,
  current: ReadonlySet<string>,
  impactIndex: number,
): ReadonlySet<string> {
  return settleAfterBreak(fractureLocallyAt(target, current, impactIndex));
}

export function settleAfterBreak(
  broken: ReadonlySet<string>,
): ReadonlySet<string> {
  return openHouseScene.settleAfterBreak(broken);
}
