import {
  createStructuralSolver,
  type StructuralMaterialProfile,
} from "./structuralPhysics.ts";
import { deinterpenetrateClusters } from "./deinterpenetrate.ts";
import { propTree } from "../content/prefabs/coreFlora.ts";
import { townSurfaceRoutes } from "../content/scenes/townSurfacePlan.ts";
import {
  propFridgeMoskva,
  propFridgeRibbed,
  propFridgeRusty,
  propGasStove,
  propKettle,
  propStewPot,
  propTvSharp,
  propTvSoviet,
  propVintageStove,
} from "../content/prefabs/coreAppliances.ts";
import {
  propChannelArmchair,
  propChannelSofa,
  propChesterfield,
  propCornerSofa,
  propIronBed,
  propOldTable,
  propPaintedTable,
  propPanelChair,
  propSlatBed,
  propSlatChair,
  propSovietSofa,
  propStoneTable,
  propTrestleTable,
  propWallUnit,
  propWornChair,
  propWriterDesk,
} from "../content/prefabs/coreFurniture.ts";
import {
  placeProp,
  propCautionBoard,
  propCrate,
  propDumpster,
  propPallet,
  propPlankStack,
  propSackPile,
  propSpool,
  propSteelDrum,
  propTarpPile,
  propTyreStack,
  type PropPiece,
} from "../content/prefabs/coreProps.ts";

export type BreakableMaterial =
  | "brick"
  | "wood"
  | "cloth"
  | "plaster"
  | "concrete"
  | "glass"
  | "steel"
  // Пластиковая обшивка (экраны лоджий, сайдинг): легче и мягче стали,
  // пробивается честно, но не крошится в пыль как штукатурка.
  | "plastic"
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
  | "groundTile"
  // A true cylinder: rendered as round geometry (size x/z are the diameters,
  // y is the axis length; rotate the piece to lay it down). Physics carves
  // and colliders treat it as its bounding volume, which reads fine for
  // boilers, chimneys, wheels, columns, barrels and pipes.
  | "cylinder";

export type SupportMode = "stack" | "mounted" | "linked";
export type SceneVector3 = readonly [x: number, y: number, z: number];
export type LandscapeSurfaceProfile = "viking-ground" | "city-ground";
export type SurfaceTextureProfile =
  | "city-gray-pavers"
  | "city-red-pavers"
  | "city-aged-stucco"
  | "city-red-aggregate"
  | "city-facade-cladding"
  | "city-roof-tile"
  // Растрескавшийся цоколь: шейдер режет по серой штукатурке связные жилы
  // трещин с выкрошенной кромкой; у земли сетка гуще.
  | "city-cracked-plinth"
  // Вывески и таблички: текстура ложится по родным UV грани ОДИН раз (без
  // мировой трипланарной проекции) — так на боксе читается надпись.
  | "city-shop-sign"
  | "city-chalk-sign-a"
  | "city-chalk-sign-b";

export type TreeVisualKind = "oak" | "birch" | "pine";
export type TreeVisualRole = "trunk" | "branch" | "foliage" | "bark";

/**
 * Identifies the cheap structural proxy that belongs to a procedural tree.
 * Rendering may replace these primitives, while hits, support and destruction
 * continue to address the original piece id.
 */
export interface TreeVisualDefinition {
  readonly kind: TreeVisualKind;
  readonly seed: number;
  readonly role: TreeVisualRole;
  readonly localId: string;
  /** Local id of the woody member that physically carries this piece. */
  readonly parentLocalId?: string;
}

export type VegetationVisualKind = "shrub" | "hedge";

export interface VegetationVisualDefinition {
  readonly kind: VegetationVisualKind;
  readonly seed: number;
}

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
  readonly volume?: number;
  readonly bearingArea?: number;
  readonly color: string;
  readonly row?: number;
  readonly column?: number;
  readonly hinge?: DoorHingeDefinition;
  readonly contactBoxes?: readonly {
    readonly position: SceneVector3;
    readonly size: SceneVector3;
  }[];
  readonly carriesAttachments?: boolean;
  readonly bearsLoad?: boolean;
  readonly attachmentSupportMode?: "wall" | "cable" | "hinge";
  readonly sideAttachmentReach?: number;
  readonly contactBearingOrder?: boolean;
  /** Optional visual surface variant; structural material remains unchanged. */
  readonly textureProfile?: SurfaceTextureProfile;
  /** World-space material mask; it follows this ground body when it breaks. */
  readonly landscapeSurface?: LandscapeSurfaceProfile;
  /** Optional procedural tree skin backed by this gameplay proxy. */
  readonly treeVisual?: TreeVisualDefinition;
  readonly vegetationVisual?: VegetationVisualDefinition;
  /**
   * 0..1 organic weathering receptivity. The shared material shader turns this
   * into a spatial biofilm — moss on up-facing surfaces, mould/damp near the
   * ground, plaster spall — patterned by world-space noise. 0 (the default)
   * leaves the surface pristine, so untreated scenes are unchanged.
   */
  readonly weathering?: number;
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
  cloth: {
    density: 0.24,
    impulse: 2.9,
    lift: 1.2,
    torque: 0.62,
    fractureRadius: [1.48, 1.26],
    neighborChance: 0.74,
    dustColor: "#c8b894",
    debrisColor: "#7f6d54",
    debrisCount: 4,
    restitution: 0.025,
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
  // Пластиковая обшивка: лёгкая, упругая, трещит кусками панели, а не
  // рассыпается пылью — сосед по листу отламывается редко.
  plastic: {
    density: 0.55,
    impulse: 2.5,
    lift: 0.6,
    torque: 0.38,
    fractureRadius: [0.9, 0.7],
    neighborChance: 0.24,
    dustColor: "#d9dad4",
    debrisColor: "#c6c8c2",
    debrisCount: 3,
    restitution: 0.14,
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
        // Дверь по оси дома: крыльцо, конёк и фронтон делят одну ось x = 0,
        // окна ±2.2 держат симметрию фасада.
        { center: 0, width: 1.56, firstRow: 0, lastRow: 5 },
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
        // Задняя дверь тоже по центру — выходит ровно на ступени террасы.
        // Окно ушло на -2.2 (зеркало фасадного), иначе между проёмами
        // оставался кирпичный простенок в четверть панели.
        { center: 0, width: 1.56, firstRow: 0, lastRow: 5 },
        { center: -2.2, width: 1.58, firstRow: 2, lastRow: 5 },
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
      // The stair only needs an opening along its run. The old version
      // removed both planks for the full depth of the house, leaving an open
      // corner beyond the top step. Restore that front section as a proper
      // landing while keeping a small clearance from the final tread.
      upperPieces.push(
        makePiece(
          `house:upper-floor:${index}:landing`,
          "house:upper-floor",
          "wood",
          "plank",
          [-3.72 + index * 0.82, 2.84, -0.225],
          [0.82, 0.16, 2.15],
          woodPalette[index % woodPalette.length],
        ),
      );
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
  // Ceiling-side lamp standing on the top frame plank just inside the
  // glass — as close to "под потолком" as the old house's framing allows.
  // The house interior is toward its centre at roughly (0, -3).
  const inwardSign = isFront ? Math.sign(-3 - z) || 1 : Math.sign(0 - x) || 1;
  const lampX = isFront ? x + width * 0.18 : x + inwardSign * 0.1;
  const lampZ = isFront ? z + inwardSign * 0.1 : z + width * 0.18;
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
      `${options.id}:winlamp`,
      options.id,
      "glass",
      "glassPane",
      [lampX, y + height / 2 + 0.065 + 0.15, lampZ],
      [0.24, 0.3, 0.2],
      windowLampColor(`${options.id}:winlamp`, 0.3),
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
    // Рама сидит ровно в проёме кладки (−2.2 — зеркало фасадного окна);
    // когда дверь переехала в центр, проём ушёл сюда же.
    createWindow({ id: "window:back:lower", position: [-2.2, 1.48, -6.78], axis: "x" }),
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
  const hinge: NonNullable<BreakablePieceDefinition["hinge"]> = {
    pivot: [x - 0.71, 1.12, z],
    direction: [1, 0, 0],
    normal: [0, 0, facing],
  };

  for (let index = 0; index < 5; index += 1) {
    pieces.push(
      {
        ...makePiece(
          `${id}:board:${index}`,
          id,
          "wood",
          "plank",
          [x - 0.58 + index * 0.29, 1.12, z],
          [0.26, 2.15, 0.12],
          woodPalette[index % woodPalette.length],
        ),
        hinge,
      },
    );
  }

  pieces.push(
    {
      ...makePiece(
        `${id}:brace:top`,
        id,
        "wood",
        "plank",
        [x, 1.72, z + facing * 0.075],
        [1.55, 0.13, 0.13],
        "#704228",
      ),
      hinge,
    },
    {
      ...makePiece(
        `${id}:brace:diagonal`,
        id,
        "wood",
        "plank",
        [x, 1.04, z + facing * 0.08],
        [1.65, 0.14, 0.13],
        "#704228",
        [0, 0, -0.62],
      ),
      hinge,
    },
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
        [0, 0.08 + index * 0.1, 4.05 - index * 0.3],
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
// Дворовые стулья на настиле террасы: стандартный propSlatChair, лицом
// друг к другу через дощатый стол.
function createYardChairs(): BreakableClusterDefinition {
  const deckTop = 0.415;
  const chairs = [
    ...placeProp("yard:furn:slat-chair:left",
      propSlatChair({ yaw: Math.PI / 2 }), [-1.95, deckTop, 2.75]),
    ...placeProp("yard:furn:slat-chair:right",
      propSlatChair({ yaw: -Math.PI / 2, timber: "#9c6b3a" }), [2.3, deckTop, 2.75]),
  ].map((piece) => ({ ...piece, clusterId: "yard:chairs" }));
  return cluster("yard:chairs", "Terrace chairs", "wood", "mounted", chairs);
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
      grassPieces.push({
        // Газон размечен как городская поверхность: маски townSurfacePlan
        // протаптывают по нему тропинки к домам старого квартала.
        ...makePiece(
          `yard:ground:${xIndex}:${zIndex}`,
          "yard:ground",
          "soil",
          "groundTile",
          [cx, -0.14, cz],
          [6, 0.24, 6],
          (xIndex + zIndex) % 2 === 0 ? "#607b43" : "#6b874a",
        ),
        landscapeSurface: "city-ground",
      });
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

  // Пристройки к плите за пределами основной сетки. Южный «язык» за k4/k5 —
  // двор усадьбы старого квартала (два ряда: дом отступил от панелек вглубь
  // участка). Северо-восточная полоса — двор k6, отодвинутой от заднего
  // двора h2. Всё это city-ground: маски townSurfacePlan протаптывают тропы.
  const extensionTiles: readonly (readonly [number, number])[] = [
    [12, -54], [18, -54], [24, -54], [30, -54], [36, -54],
    [18, -60], [24, -60], [30, -60], [36, -60],
    [48, 24], [54, 24], [60, 24], [66, 24], [72, 24],
  ];
  for (const [index, [cx, cz]] of extensionTiles.entries()) {
    grassPieces.push({
      ...makePiece(
        `yard:ground:s:${index}`,
        "yard:ground",
        "soil",
        "groundTile",
        [cx, -0.14, cz],
        [6, 0.24, 6],
        index % 2 === 0 ? "#607b43" : "#6b874a",
      ),
      landscapeSurface: "city-ground",
    });
    upperPieces.push(
      makePiece(`yard:earth:u:s:${index}`, "yard:earth:upper", "earth", "groundTile",
        [cx, -0.71, cz], [6, 0.9, 6], index % 2 === 0 ? "#6d5a3e" : "#665336"),
    );
    lowerPieces.push(
      makePiece(`yard:earth:l:s:${index}`, "yard:earth:lower", "earth", "groundTile",
        [cx, -1.61, cz], [6, 0.9, 6], index % 2 === 0 ? "#5c4a33" : "#55442d"),
    );
  }

  return [
    cluster("yard:ground", "Breakable ground cover", "soil", "linked", grassPieces),
    cluster("yard:earth:upper", "Topsoil layer", "earth", "linked", upperPieces),
    cluster("yard:earth:lower", "Deep earth layer", "earth", "linked", lowerPieces),
  ];
}

// Тёплая грязная побелка вместо холодного серо-бежевого: реальные панельные
// фасады — кремово-белёсые, а холод в кадр приносят тени и потёки.
const panelPalette = ["#d8cdb2", "#cfc3a6", "#e0d6be", "#d2c7ab"];
const slabPalette = ["#b7ad9c", "#aca293"];
const plinthColor = "#6f6a60";
const plinthBandColors = ["#736e63", "#6b665c"];
// Акцентный первый этаж: у части домов капремонт выделил нижний ярус охрой.
const groundAccentPalette = ["#c9a355", "#c09a4e", "#d2ac60", "#c4a057"];
const apronConcrete = ["#918d82", "#8a867b"];
const stairConcrete = "#9d9a91";

// Ремонтная перекраска никогда не попадает в тон фасада: чуть серее, желтее
// или темнее базового. Индексы согласованы с panelColor в createKhrushchevka.
const patchTints: readonly (readonly [number, number, number])[] = [
  [0.9, 0.9, 0.93],
  [1.03, 0.97, 0.82],
  [0.85, 0.84, 0.8],
];

function shiftColor(hex: string, mr: number, mg: number, mb: number): string {
  const value = parseInt(hex.slice(1), 16);
  const clamp8 = (channel: number) =>
    Math.max(0, Math.min(255, Math.round(channel)));
  const r = clamp8(((value >> 16) & 255) * mr);
  const g = clamp8(((value >> 8) & 255) * mg);
  const b = clamp8((value & 255) * mb);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

// Столярка окон: белый ПВХ соседствует со старым крашеным деревом — рамы
// соседних квартир почти никогда не совпадают.
const windowFrameFinishes = ["#e8e7e1", "#d3cdbb", "#7d5b3c"] as const;
// Дневное стекло тёмное: комната за ним не освещена. Светлый тон — редкое
// зеркальное отражение неба.
const windowGlassTints = [
  "#31404a",
  "#3c4b54",
  "#46555e",
  "#27333b",
  "#51606a",
] as const;
const paleReflectionGlass = "#93a7b0";
const curtainTints = ["#e8e2d3", "#e0d8c6", "#dbd2c8", "#e5e0d6"] as const;
// Обшивка балконов: выцветшие сурик, голубой, зелёный, некрашеный лист.
const balconyCladdingTints = [
  "#8a4f41",
  "#597186",
  "#657455",
  "#b9ac91",
  "#6e5647",
  "#787f84",
] as const;
const balconyWoodTints = ["#8a6a48", "#a3805a", "#6e5138", "#96714b"] as const;
const rustSteel = "#6b5140";
const zincSheet = "#9aa19b";

// Кондиционеры жилых домов: один план положений питает и сами блоки
// (createTownClutter), и ржавые подтёки под ними в карте потёков
// (materialTextures). Все позиции — глухие простенки: чётные пролёты юга и
// лестничные пояса севера, где блок не спорит ни с окнами, ни с балконами.
export interface KhrushchevkaAcMount {
  readonly x: number;
  readonly y: number;
  /** Плоскость стены (её центр по z), не наружная грань. */
  readonly z: number;
  readonly face: 1 | -1;
}
const HRU_INNER_X0 = 12.15;
const HRU_SPAN = 21.7;
const hruBayCenterX = (bay: number) =>
  HRU_INNER_X0 + (HRU_SPAN / 16) * (bay + 0.5);
const hruStripCenterX = (strip: number) =>
  HRU_INNER_X0 + (HRU_SPAN / 8) * (strip + 0.5);
const hruFloorBaseY = (floor: number) => 0.4 + floor * 2.6;
export const khrushchevkaAcMounts: readonly KhrushchevkaAcMount[] = [
  // k1, дворовый фасад (z = -1): глухие пролёты 4, 8, 14.
  { x: hruBayCenterX(4), y: hruFloorBaseY(1) + 1.55, z: -1, face: 1 },
  { x: hruBayCenterX(8) - 0.15, y: hruFloorBaseY(2) + 1.55, z: -1, face: 1 },
  { x: hruBayCenterX(14) + 0.15, y: hruFloorBaseY(1) + 1.55, z: -1, face: 1 },
  // k1, уличный фасад (z = -8): пояса лестничных клеток 1 и 5.
  { x: hruStripCenterX(1) - 0.55, y: hruFloorBaseY(2) + 1.5, z: -8, face: -1 },
  { x: hruStripCenterX(5) + 0.6, y: hruFloorBaseY(1) + 1.5, z: -8, face: -1 },
  // k2 (сдвиг dz = -16), фасад к главной улице (z = -17). Блок пролёта 0
  // сдвинут вправо, к окну: по оси пролёта висит водосточная труба.
  { x: hruBayCenterX(0) + 0.2, y: hruFloorBaseY(1) + 1.55, z: -17, face: 1 },
  { x: hruBayCenterX(6) + 0.15, y: hruFloorBaseY(2) + 1.55, z: -17, face: 1 },
  { x: hruBayCenterX(12), y: hruFloorBaseY(3) + 1.55, z: -17, face: 1 },
];

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

// Window glass itself never glows: lived-in light comes from a small lamp
// standing on the sill INSIDE the room. Shoot the glass — shards fall dark
// and the room keeps glowing through the hole; break the lamp — the room
// goes out. Unlit flats still get a lamp, just switched off.
const unlitLampGlass = "#b9c2bd";

function windowLampColor(id: string, litChance: number): string {
  return deterministicNoise(`lit:${id}`) < litChance
    ? litWindowColor
    : unlitLampGlass;
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
      // Контактные боксы — мировые координаты: копия здания обязана увезти
      // их с собой, иначе опоры мебели остаются в исходном экземпляре.
      contactBoxes: piece.contactBoxes?.map((box) => ({
        position: [
          box.position[0] + dx,
          box.position[1],
          box.position[2] + dz,
        ] as SceneVector3,
        size: box.size,
      })),
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

  // Каждое здание кидает собственные кости: рамы, балконы, шторы и заплаты
  // не повторяются между шестью копиями одного шаблона.
  const salt = config.prefix ?? "k1";
  const pal = config.palette ?? panelPalette;
  const noise = (key: string): number => deterministicNoise(`${salt}:${key}`);

  // Биография низа дома: у части домов капремонт выделил первый этаж охрой.
  const groundAccent = noise("accent:ground") < 0.34;

  // Ремонтные заплаты: прямоугольники в 2-4 панели, перекрашенные при
  // латании швов. На реальных фасадах эти пятна видны с другого конца двора.
  interface RepairPatch {
    readonly side: "s" | "n";
    readonly u0: number;
    readonly u1: number;
    readonly f0: number;
    readonly f1: number;
    readonly tint: number;
  }
  const patches: RepairPatch[] = [];
  const patchCount = 2 + Math.floor(noise("patch:count") * 2);
  for (let index = 0; index < patchCount; index += 1) {
    const u0 = Math.floor(noise(`patch:u:${index}`) * 13);
    const f0 = Math.floor(noise(`patch:f:${index}`) * 3);
    patches.push({
      side: noise(`patch:side:${index}`) < 0.5 ? "s" : "n",
      u0,
      u1: u0 + 2 + Math.floor(noise(`patch:w:${index}`) * 3),
      f0,
      f1: f0 + (noise(`patch:h:${index}`) < 0.4 ? 1 : 0),
      tint: Math.floor(noise(`patch:tint:${index}`) * patchTints.length),
    });
  }
  // Юг адресуется пролётами 0..15, север — полосами через unit = strip*2+1,
  // так что заплата может лечь на оба фасада одинаковой логикой.
  const panelColor = (
    side: "s" | "n",
    unit: number,
    floor: number,
    index: number,
  ): string => {
    const activePal = groundAccent && floor === 0 ? groundAccentPalette : pal;
    const basePanel =
      activePal[((index % activePal.length) + activePal.length) % activePal.length];
    for (const patch of patches) {
      if (
        patch.side === side &&
        unit >= patch.u0 &&
        unit <= patch.u1 &&
        floor >= patch.f0 &&
        floor <= patch.f1
      ) {
        const [mr, mg, mb] = patchTints[patch.tint];
        return shiftColor(basePanel, mr, mg, mb);
      }
    }
    return basePanel;
  };
  // Низ фасада живёт тяжелее верха: сырость, брызги, руки, ноги.
  const facadeWeathering = (floor: number): number =>
    floor === 0 ? 0.34 : floor === 1 ? 0.22 : 0.15;

  // Полный оконный блок: рама с импостом и форточкой, тёмные стёкла с
  // разнобоем, наружный отлив и тюль в глубине комнаты. Ставится на юг и на
  // север (face = +1 / -1). Узкие проёмы (< 0.9 м) получают одну створку.
  interface WindowUnitOptions {
    readonly pieces: BreakablePieceDefinition[];
    readonly clusterId: string;
    readonly idBase: string;
    readonly cx: number;
    readonly b: number;
    readonly wallZ: number;
    readonly face: 1 | -1;
    readonly width: number;
    readonly curtains?: boolean;
    readonly canOpen?: boolean;
  }
  const addWindowUnit = (options: WindowUnitOptions): void => {
    const { pieces, clusterId, idBase, cx, b, wallZ, face, width } = options;
    const y0 = b + 0.81;
    const y1 = b + 1.97;
    const t = 0.075;
    const zf = wallZ + face * 0.045;
    const frameRoll = noise(`frame:${idBase}`);
    const frameFinish =
      frameRoll < 0.52
        ? windowFrameFinishes[0]
        : frameRoll < 0.78
          ? windowFrameFinishes[1]
          : windowFrameFinishes[2];
    const bar = (
      id: string,
      position: SceneVector3,
      size: SceneVector3,
    ): BreakablePieceDefinition => ({
      ...makePiece(`${idBase}:${id}`, clusterId, "wood", "plank", position, size, frameFinish),
      bearsLoad: false,
      // Рама прибита к бетонному откосу сбоку, а не стоит на стекле.
      sideAttachmentReach: 0.2,
    });

    pieces.push(
      bar("frame:top", [cx, y1 - t / 2, zf], [width, t, 0.08]),
      bar("frame:bottom", [cx, y0 + t / 2, zf], [width, t, 0.08]),
      bar("frame:left", [cx - width / 2 + t / 2, (y0 + y1) / 2, zf], [t, y1 - y0 - 2 * t, 0.08]),
      bar("frame:right", [cx + width / 2 - t / 2, (y0 + y1) / 2, zf], [t, y1 - y0 - 2 * t, 0.08]),
    );

    // Створки: узкая колонка с форточкой + одна-две широких.
    const narrowW = width < 0.9 ? width - 2 * t : 0.42;
    const wideCount = width < 0.9 ? 0 : width > 1.55 ? 2 : 1;
    const wideW = wideCount > 0 ? (width - 2 * t - narrowW) / wideCount : 0;
    const narrowOnLeft = noise(`hand:${idBase}`) < 0.5;
    const columnWidths =
      wideCount === 0
        ? [narrowW]
        : narrowOnLeft
          ? [narrowW, ...Array<number>(wideCount).fill(wideW)]
          : [...Array<number>(wideCount).fill(wideW), narrowW];
    const glassBase = Math.floor(noise(`glass:${idBase}`) * windowGlassTints.length);

    let xCursor = cx - width / 2 + t;
    for (const [column, columnWidth] of columnWidths.entries()) {
      const columnCx = xCursor + columnWidth / 2;
      const isNarrow = columnWidth === narrowW;
      if (column > 0) {
        pieces.push(
          bar(`mullion:${column}`, [xCursor, (y0 + y1) / 2, zf], [0.06, y1 - y0 - 2 * t, 0.08]),
        );
      }
      const pale = noise(`pale:${idBase}:${column}`) > 0.86;
      const tint = pale
        ? paleReflectionGlass
        : windowGlassTints[(glassBase + column) % windowGlassTints.length];
      if (isNarrow) {
        // Форточка в верхней трети узкой створки. Стёкла режутся точно по
        // ячейкам обвязки — вписаны в раму, без щелей по периметру.
        const ySplit = y1 - 0.42;
        pieces.push(
          bar("vent:bar", [columnCx, ySplit, zf], [columnWidth + 0.02, 0.055, 0.08]),
        );
        const ventOpen = noise(`ventopen:${idBase}`) < 0.12;
        const ventY = (ySplit + 0.0275 + y1 - t) / 2;
        const ventH = y1 - t - ySplit - 0.0375;
        pieces.push(
          makePiece(`${idBase}:vent:glass`, clusterId, "glass", "glassPane",
            ventOpen
              ? [columnCx, ventY - 0.02, wallZ + face * 0.1]
              : [columnCx, ventY, wallZ],
            [columnWidth - 0.01, ventH, 0.05], tint,
            ventOpen ? [face * 0.5, 0, 0] : undefined),
        );
        const paneH = ySplit - 0.0375 - y0 - t;
        const paneY = (y0 + t + ySplit - 0.0275) / 2;
        const casementOpen =
          options.canOpen !== false && noise(`open:${idBase}`) < 0.08;
        if (casementOpen) {
          const openAngle = 0.5 + noise(`openangle:${idBase}`) * 0.35;
          const hingeX = columnCx - (columnWidth - 0.08) / 2;
          const w = columnWidth - 0.01;
          pieces.push({
            ...makePiece(`${idBase}:casement`, clusterId, "glass", "glassPane",
              [
                hingeX + (w / 2) * Math.cos(openAngle),
                paneY,
                wallZ + face * (w / 2) * Math.sin(openAngle),
              ],
              [w, paneH, 0.05], tint,
              [0, -face * openAngle, 0]),
            hinge: {
              pivot: [hingeX, paneY, wallZ],
              direction: [1, 0, 0],
              normal: [0, 0, face],
            },
          });
        } else {
          pieces.push(
            makePiece(`${idBase}:casement`, clusterId, "glass", "glassPane",
              [columnCx, paneY, wallZ], [columnWidth - 0.01, paneH, 0.05], tint),
          );
        }
      } else {
        pieces.push(
          makePiece(`${idBase}:pane:${column}`, clusterId, "glass", "glassPane",
            [columnCx, (y0 + y1) / 2, wallZ],
            [columnWidth - 0.01, y1 - y0 - 2 * t - 0.01, 0.05], tint),
        );
      }
      xCursor += columnWidth;
    }

    // Оцинкованный отлив с лёгким наклоном от стены.
    pieces.push({
      ...makePiece(`${idBase}:sill-flash`, clusterId, "steel", "steelSheet",
        [cx, y0 - 0.01, wallZ + face * 0.235], [width + 0.1, 0.03, 0.15],
        "#c9cdc9", [face * 0.12, 0, 0]),
      bearsLoad: false,
      weathering: 0.3,
    });

    // Тюль: висит в глубине комнаты, за лампой на подоконнике.
    if (options.curtains !== false && noise(`curtain:${idBase}`) < 0.62) {
      const pulled = noise(`pull:${idBase}`) < 0.35;
      const fullW = width - 0.16;
      const curtainWidth = pulled ? fullW * 0.55 : fullW;
      const offset = pulled
        ? ((noise(`pullside:${idBase}`) < 0.5 ? -1 : 1) * (fullW - curtainWidth)) / 2
        : 0;
      // Тюль до пола: опирается на плиту перекрытия, как настоящая штора.
      pieces.push({
        ...makePiece(`${idBase}:curtain`, clusterId, "cloth", "panel",
          [cx + offset, (b + 0.03 + y1) / 2, wallZ - face * 0.45],
          [curtainWidth, y1 - b - 0.03, 0.03],
          curtainTints[Math.floor(noise(`curtaincolor:${idBase}`) * curtainTints.length)]),
        bearsLoad: false,
      });
    }
  };

  // Решётка окна первого этажа: два пояса, вертикальные прутья, у «кованого»
  // варианта — ряд косых завитков-волн. Висит снаружи на бетонных откосах
  // (bearsLoad: false) и при ударе отрывается звенящей панелью.
  const addWindowGrille = (
    pieces: BreakablePieceDefinition[],
    clusterId: string,
    idBase: string,
    cx: number,
    b: number,
    wallZ: number,
    face: 1 | -1,
    width: number,
  ): void => {
    const y0 = b + 0.86;
    const y1 = b + 1.92;
    const zg = wallZ + face * 0.19;
    const tone = noise(`grilletone:${idBase}`) < 0.72 ? "#2e3132" : "#4c423a";
    const wavy = noise(`grillewave:${idBase}`) < 0.55;
  const bar = (
    id: string,
    position: SceneVector3,
    size: SceneVector3,
    rotation?: SceneVector3,
    carriesGrille = false,
  ): BreakablePieceDefinition => ({
    ...makePiece(`${idBase}:${id}`, clusterId, "steel", "steelSheet",
      position, size, tone, rotation),
    bearsLoad: carriesGrille,
    carriesAttachments: carriesGrille,
    ...(carriesGrille
      ? { attachmentSupportMode: "cable" as const }
      : {}),
    sideAttachmentReach: 0.3,
    weathering: 0.4,
  });
  pieces.push(
    bar("rail:top", [cx, y1, zg], [width - 0.04, 0.035, 0.035], undefined, true),
    bar("rail:bottom", [cx, y0, zg], [width - 0.04, 0.035, 0.035], undefined, true),
  );
    const rodCount = Math.max(4, Math.round(width / 0.19));
    const rodStep = (width - 0.1) / (rodCount - 1);
    for (let rod = 0; rod < rodCount; rod += 1) {
      pieces.push(
        bar(`rod:${rod}`,
          [cx - (width - 0.1) / 2 + rod * rodStep, (y0 + y1) / 2, zg],
          [0.024, y1 - y0 - 0.02, 0.024], undefined, true),
      );
    }
    if (wavy) {
      const waveY =
        y0 + (y1 - y0) * (noise(`grillewaveat:${idBase}`) < 0.5 ? 0.3 : 0.68);
      for (let seg = 0; seg < rodCount - 1; seg += 1) {
        pieces.push(
          bar(`wave:${seg}`,
            [cx - (width - 0.1) / 2 + (seg + 0.5) * rodStep, waveY, zg],
            [rodStep + 0.02, 0.02, 0.02],
            [0, 0, seg % 2 === 0 ? 0.5 : -0.5]),
        );
      }
    } else {
      pieces.push(
        bar("rail:mid",
          [cx, y0 + (y1 - y0) * 0.52, zg], [width - 0.04, 0.028, 0.028]),
      );
    }
  };

  // Балконный блок: дверь + окно в одном проёме, как в настоящей квартире.
  const addBalconyDoorUnit = (
    pieces: BreakablePieceDefinition[],
    clusterId: string,
    idBase: string,
    cx: number,
    b: number,
    wallZ: number,
    face: 1 | -1,
    width: number,
    sillColor: string,
    doorAjar: boolean,
  ): void => {
    const doorW = 0.64;
    const winW = width - doorW - 0.07;
    const doorOnLeft = noise(`doorside:${idBase}`) < 0.5;
    const doorCx = cx + (doorOnLeft ? -1 : 1) * (width / 2 - doorW / 2);
    const winCx = cx + (doorOnLeft ? 1 : -1) * (width / 2 - winW / 2);
    const frameRoll = noise(`frame:${idBase}`);
    const frameFinish =
      frameRoll < 0.52
        ? windowFrameFinishes[0]
        : frameRoll < 0.78
          ? windowFrameFinishes[1]
          : windowFrameFinishes[2];
    const zf = wallZ + face * 0.045;
    const y1 = b + 1.97;
    const doorY0 = b + 0.02;
    const t = 0.075;

    // Подоконная панель остаётся только под окном; дверь выходит на плиту.
    pieces.push({
      ...makePiece(`${idBase}:sill`, clusterId, "concrete", "panel",
        [winCx, b + 0.405, wallZ], [winW + 0.12, 0.79, 0.3], sillColor),
      weathering: 0.3,
    });
    pieces.push({
      ...makePiece(`${idBase}:threshold`, clusterId, "concrete", "panel",
        [doorCx, b + 0.035, wallZ - face * 0.08], [doorW, 0.07, 0.14], sillColor),
      bearsLoad: false,
    });

    // Дверная коробка. Все бруски прибиты к бетонному проёму сбоку.
    const doorEdge = doorOnLeft ? -1 : 1;
    pieces.push(
      {
        ...makePiece(`${idBase}:door:jamb:out`, clusterId, "wood", "plank",
          [doorCx + doorEdge * (doorW / 2 - t / 2), (doorY0 + y1) / 2, zf],
          [t, y1 - doorY0, 0.08], frameFinish),
        bearsLoad: false,
        sideAttachmentReach: 0.2,
      },
      {
        ...makePiece(`${idBase}:door:jamb:in`, clusterId, "wood", "plank",
          [doorCx - doorEdge * (doorW / 2 - t / 2), (doorY0 + y1) / 2, zf],
          [t, y1 - doorY0, 0.08], frameFinish),
        bearsLoad: false,
        sideAttachmentReach: 0.2,
      },
      {
        ...makePiece(`${idBase}:door:head`, clusterId, "wood", "plank",
          [doorCx, y1 - t / 2, zf], [doorW, t, 0.08], frameFinish),
        bearsLoad: false,
        sideAttachmentReach: 0.2,
      },
      // Общая стойка между дверной коробкой и оконной рамой.
      {
        ...makePiece(`${idBase}:door:stile`, clusterId, "wood", "plank",
          [doorCx - doorEdge * (doorW / 2 + 0.035), (doorY0 + y1) / 2, zf],
          [0.09, y1 - doorY0, 0.08], frameFinish),
        bearsLoad: false,
        sideAttachmentReach: 0.2,
      },
    );

    // Полотно: глухой низ, стекло сверху, средний брусок. При распахнутой
    // двери все три куска поворачиваются вокруг общей петли.
    const leafW = doorW - 0.17;
    const midY = doorY0 + 1.08;
    const hingeX = doorCx + doorEdge * (doorW / 2 - t);
    const ajarAngle = doorAjar ? 0.45 + noise(`ajarangle:${idBase}`) * 0.4 : 0;
    const leafPiece = (
      id: string,
      material: BreakableMaterial,
      shape: BreakableShape,
      centerY: number,
      sizeY: number,
      color: string,
      depth: number,
    ): BreakablePieceDefinition => {
      const offset = leafW / 2;
      const position: SceneVector3 = doorAjar
        ? [
            hingeX - doorEdge * offset * Math.cos(ajarAngle),
            centerY,
            wallZ + face * offset * Math.sin(ajarAngle),
          ]
        : [doorCx, centerY, wallZ];
      return {
        ...makePiece(`${idBase}:${id}`, clusterId, material, shape,
          position, [leafW, sizeY, depth], color,
          doorAjar ? [0, doorEdge * face * ajarAngle, 0] : undefined),
        hinge: {
          pivot: [hingeX, centerY, wallZ],
          direction: [1, 0, 0],
          normal: [0, 0, face],
        },
      };
    };
    pieces.push(
      leafPiece("door:lower", "wood", "plank", doorY0 + 0.535, 1.05, frameFinish, 0.055),
      leafPiece("door:mid", "wood", "plank", midY, 0.07, frameFinish, 0.06),
      leafPiece(
        "door:glass", "glass", "glassPane",
        (midY + 0.035 + y1 - t) / 2, y1 - t - midY - 0.045,
        windowGlassTints[Math.floor(noise(`doorglass:${idBase}`) * windowGlassTints.length)],
        0.05,
      ),
    );

    // Окно рядом с дверью — узкая створка с форточкой.
    addWindowUnit({
      pieces,
      clusterId,
      idBase: `${idBase}:win`,
      cx: winCx,
      b,
      wallZ,
      face,
      width: winW,
      canOpen: false,
    });
  };

  // Цоколь: несущие полосы под стенами + высокий выступающий фартук поверх
  // них. Фартук перекрывает низ стеновых панелей снаружи, как настоящий
  // оштукатуренный цоколь, и разрывается только у крылец подъездов.
  const plinthPieces: BreakablePieceDefinition[] = [];
  for (let index = 0; index < 4; index += 1) {
    const cx = x0 + 2.75 + index * 5.5;
    plinthPieces.push(
      { ...makePiece(`hru:plinth:s:${index}`, "hru:plinth", "concrete", "panel",
        [cx, 0.19, z1], [5.48, 0.42, 0.3], plinthColor), weathering: 0.5 },
      { ...makePiece(`hru:plinth:n:${index}`, "hru:plinth", "concrete", "panel",
        [cx, 0.19, z0], [5.48, 0.42, 0.3], plinthColor), weathering: 0.5 },
    );
  }
  for (const ex of [x0, x1]) {
    plinthPieces.push(
      makePiece(`hru:plinth:e:${ex}`, "hru:plinth", "concrete", "panel",
        [ex, 0.19, (z0 + z1) / 2], [0.3, 0.42, 6.38], plinthColor),
    );
  }

  const entryCenters = [2, 10].map((bay) => bayCenter(bay));
  const overlapsEntry = (segCx: number, segHalf: number): boolean =>
    entryCenters.some(
      (entryCx) =>
        Math.min(segCx + segHalf, entryCx + 0.85) -
          Math.max(segCx - segHalf, entryCx - 0.85) >
        0.3,
    );
  const apronPieces: BreakablePieceDefinition[] = [];
  for (let index = 0; index < 8; index += 1) {
    const cx = x0 + 1.375 + index * 2.75;
    for (const [sideId, zc, faceDir] of [
      ["s", z1, 1],
      ["n", z0, -1],
    ] as const) {
      const nearEntry = sideId === "s" && overlapsEntry(cx, 1.34);
      if (!nearEntry) {
        plinthPieces.push({
          ...makePiece(`hru:plinth:band:${sideId}:${index}`, "hru:plinth", "concrete", "panel",
            [cx, 0.345, zc + faceDir * 0.225], [2.68, 0.67, 0.15],
            plinthBandColors[index % plinthBandColors.length]),
          bearsLoad: false,
          weathering: 0.62,
          textureProfile: "city-cracked-plinth",
        });
      }
      // Бетонная отмостка: потрескавшаяся лента вдоль всего периметра.
      if (!nearEntry) {
        apronPieces.push({
          ...makePiece(`hru:apron:${sideId}:${index}`, "hru:apron", "concrete", "groundTile",
            [cx, 0.045, zc + faceDir * 0.76], [2.68, 0.09, 0.9],
            apronConcrete[(index + (sideId === "n" ? 1 : 0)) % apronConcrete.length]),
          weathering: 0.44 + noise(`apron:${sideId}:${index}`) * 0.3,
          textureProfile: "city-cracked-plinth",
        });
      }
    }
  }
  for (const [endIndex, ex] of [x0, x1].entries()) {
    const faceDir = endIndex === 0 ? -1 : 1;
    plinthPieces.push({
      ...makePiece(`hru:plinth:band:e:${endIndex}`, "hru:plinth", "concrete", "panel",
        [ex + faceDir * 0.225, 0.345, (z0 + z1) / 2], [0.15, 0.67, 6.66],
        plinthBandColors[endIndex % plinthBandColors.length]),
      bearsLoad: false,
      weathering: 0.62,
      textureProfile: "city-cracked-plinth",
    });
    apronPieces.push({
      ...makePiece(`hru:apron:e:${endIndex}`, "hru:apron", "concrete", "groundTile",
        [ex + faceDir * 0.76, 0.045, (z0 + z1) / 2], [0.9, 0.09, 6.66],
        apronConcrete[endIndex % apronConcrete.length]),
      weathering: 0.5,
      textureProfile: "city-cracked-plinth",
    });
  }
  clusters.push(cluster("hru:plinth", "Khrushchevka plinth", "concrete", "mounted", plinthPieces));
  clusters.push(cluster("hru:apron", "Concrete apron strip", "concrete", "mounted", apronPieces));

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

  // Южный фасад: чередование глухих панелей и полных оконных блоков,
  // подъезды и балконная лотерея со второго этажа.
  const entryPieces: BreakablePieceDefinition[] = [];
  const balconyPieces: BreakablePieceDefinition[] = [];
  const balconyBays = [3, 5, 11, 13];
  const doorBays = [2, 10];

  // Каждый балкон прожит по-своему: открытая ржавая решётка, обшивка
  // крашеным железом или доской, остекление деревом или белым пластиком.
  // Старые балконы едва заметно провисают наружу.
  type BalconyVariant = "open" | "clad" | "wood" | "glazed-wood" | "glazed-pvc";
  const addBalcony = (
    floor: number,
    bay: number,
    cx: number,
    b: number,
  ): BalconyVariant => {
    const id = `hru:balcony:${floor}:${bay}`;
    const roll = noise(`balcony:${floor}:${bay}`);
    const variant: BalconyVariant =
      roll < 0.24
        ? "open"
        : roll < 0.52
          ? "clad"
          : roll < 0.64
            ? "wood"
            : roll < 0.84
              ? "glazed-wood"
              : "glazed-pvc";
    const aged = variant === "open" || variant === "clad" || variant === "wood";
    const sag =
      (aged ? 0.016 : 0.005) +
      noise(`sag:${floor}:${bay}`) * (aged ? 0.022 : 0.006);
    const rot: SceneVector3 = [sag, 0, 0];

    balconyPieces.push({
      ...makePiece(`${id}:plate`, "hru:balcony", "concrete", "stoneBlock",
        [cx, b - 0.06, -0.475], [1.9, 0.14, 1.15], slabPalette[1], rot),
      weathering: 0.5,
    });

    if (variant === "open") {
      const railColor =
        noise(`railtone:${floor}:${bay}`) < 0.5 ? rustSteel : "#5d5348";
      balconyPieces.push(
        {
          // Верхний поручень несёт навесные ящики как перекладина, не стена.
          ...makePiece(`${id}:rail:top`, "hru:balcony", "steel", "steelSheet",
            [cx, b + 0.84, 0.05], [1.86, 0.055, 0.055], railColor, rot),
          weathering: 0.6,
          attachmentSupportMode: "cable",
          carriesAttachments: true,
        },
        {
          ...makePiece(`${id}:rail:base`, "hru:balcony", "steel", "steelSheet",
            [cx, b + 0.14, 0.05], [1.86, 0.045, 0.045], railColor, rot),
          weathering: 0.6,
          bearsLoad: false,
        },
      );
      for (let post = 0; post < 5; post += 1) {
        balconyPieces.push({
          ...makePiece(`${id}:rail:post:${post}`, "hru:balcony", "steel", "steelSheet",
            [cx - 0.74 + post * 0.37, b + 0.49, 0.05], [0.032, 0.66, 0.032],
            railColor, rot),
          weathering: 0.55,
          bearsLoad: false,
        });
      }
      for (const side of [-1, 1] as const) {
        balconyPieces.push(
          {
            ...makePiece(`${id}:rail:side:${side}`, "hru:balcony", "steel", "steelSheet",
              [cx + side * 0.92, b + 0.84, -0.46], [0.05, 0.055, 1.05],
              railColor, rot),
            weathering: 0.6,
            bearsLoad: false,
          },
          {
            ...makePiece(`${id}:rail:sidepost:${side}`, "hru:balcony", "steel", "steelSheet",
              [cx + side * 0.92, b + 0.49, -0.75], [0.032, 0.66, 0.032],
              railColor, rot),
            weathering: 0.55,
            bearsLoad: false,
          },
        );
      }
      // Хлам: ящики, оставшиеся с прошлого лета.
      if (noise(`junk:${floor}:${bay}`) < 0.45) {
        const jx = cx + (noise(`junkx:${floor}:${bay}`) - 0.5) * 0.9;
        balconyPieces.push(
          makePiece(`${id}:junk:crate`, "hru:balcony", "wood", "plank",
            [jx, b + 0.16, -0.6], [0.44, 0.3, 0.36], "#7c5f40",
            [0, noise(`junkyaw:${floor}:${bay}`) * 0.8, 0]),
        );
        if (noise(`junk2:${floor}:${bay}`) < 0.4) {
          balconyPieces.push(
            makePiece(`${id}:junk:box`, "hru:balcony", "wood", "plank",
              [jx + 0.1, b + 0.42, -0.62], [0.34, 0.22, 0.28], "#93744e",
              [0, -0.3, 0]),
          );
        }
      }
      // Цветочный ящик, повешенный на перила.
      if (noise(`flowers:${floor}:${bay}`) < 0.3) {
        const fx = cx + (noise(`flowerx:${floor}:${bay}`) - 0.5) * 0.7;
        balconyPieces.push(
          {
            ...makePiece(`${id}:flowerbox`, "hru:balcony", "wood", "plank",
              [fx, b + 0.76, 0.14], [0.66, 0.2, 0.22], "#6e5138", rot),
            sideAttachmentReach: 0.14,
          },
          {
            ...makePiece(`${id}:flowers`, "hru:balcony", "foliage", "panel",
              [fx, b + 0.92, 0.14], [0.6, 0.16, 0.2], "#4c6b3a", rot),
            bearsLoad: false,
          },
        );
      }
    } else if (variant === "clad") {
      const cladColor = balconyCladdingTints[
        Math.floor(noise(`cladtone:${floor}:${bay}`) * balconyCladdingTints.length)
      ];
      balconyPieces.push(
        {
          // Экран лоджии — пластиковая обшивка, не бронелист: пробивается
          // молотком и тем более ракетой, цвета прежние.
          ...makePiece(`${id}:clad:front`, "hru:balcony", "plastic", "panel",
            [cx, b + 0.45, 0.075], [1.86, 0.82, 0.045], cladColor, rot),
          weathering: 0.42,
          bearsLoad: false,
        },
        {
          ...makePiece(`${id}:clad:rail`, "hru:balcony", "steel", "steelSheet",
            [cx, b + 0.885, 0.075], [1.9, 0.05, 0.06], rustSteel, rot),
          weathering: 0.6,
          bearsLoad: false,
        },
        ...[-1, 1].map((side): BreakablePieceDefinition => ({
          ...makePiece(`${id}:clad:side:${side}`, "hru:balcony", "plastic", "panel",
            [cx + side * 0.9225, b + 0.45, -0.45], [0.045, 0.82, 1.06],
            cladColor, rot),
          weathering: 0.42,
          bearsLoad: false,
        })),
      );
    } else if (variant === "wood") {
      const woodBase = Math.floor(
        noise(`woodtone:${floor}:${bay}`) * balconyWoodTints.length,
      );
      // Доски набраны штабелем: нижняя стоит на плите, каждая следующая
      // опирается на предыдущую — обшивка рушится доска за доской.
      for (let plank = 0; plank < 4; plank += 1) {
        balconyPieces.push({
          ...makePiece(`${id}:plank:${plank}`, "hru:balcony", "wood", "plank",
            [cx, b + 0.105 + plank * 0.205, 0.075], [1.86, 0.19, 0.04],
            balconyWoodTints[(woodBase + plank) % balconyWoodTints.length], rot),
          weathering: 0.5,
        });
      }
      balconyPieces.push({
        ...makePiece(`${id}:plank:rail`, "hru:balcony", "wood", "plank",
          [cx, b + 0.9, 0.075], [1.9, 0.055, 0.055],
          balconyWoodTints[woodBase], rot),
        weathering: 0.5,
      });
      for (const side of [-1, 1] as const) {
        for (let plank = 0; plank < 3; plank += 1) {
          balconyPieces.push({
            ...makePiece(`${id}:sideplank:${side}:${plank}`, "hru:balcony", "wood", "plank",
              [cx + side * 0.9225, b + 0.105 + plank * 0.205, -0.45],
              [0.04, 0.19, 1.04],
              balconyWoodTints[(woodBase + plank + 1) % balconyWoodTints.length],
              rot),
            weathering: 0.5,
          });
        }
      }
    } else {
      const pvc = variant === "glazed-pvc";
      const frameColor = pvc
        ? "#eceae4"
        : noise(`glzframe:${floor}:${bay}`) < 0.5
          ? "#a8854e"
          : "#cdc6b2";
      const cladColor = pvc
        ? "#dcdcd6"
        : balconyCladdingTints[
            Math.floor(noise(`cladtone:${floor}:${bay}`) * balconyCladdingTints.length)
          ];
      const glassTint = pvc ? "#7f949e" : "#5b6d76";
      const wear = pvc ? 0.12 : 0.42;
      // Обшивка и каркас остекления — несущая цепочка от плиты: плита →
      // фартук → стойки → верхний брус → самодельная крыша.
      balconyPieces.push(
        {
          ...makePiece(`${id}:clad:front`, "hru:balcony", "plastic", "panel",
            [cx, b + 0.45, 0.075], [1.86, 0.82, 0.045], cladColor, rot),
          weathering: wear,
        },
        ...[-1, 1].map((side): BreakablePieceDefinition => ({
          ...makePiece(`${id}:clad:side:${side}`, "hru:balcony", "plastic", "panel",
            [cx + side * 0.9225, b + 0.45, -0.45], [0.045, 0.82, 1.06],
            cladColor, rot),
          weathering: wear,
        })),
      );
      // Остекление: несущий каркас стоит НА ПЛИТЕ и уведён на пару
      // сантиметров внутрь от плоскостей стальной обшивки — иначе фартук
      // балкона этажом выше «садится» на деревянный брус (сталь ищет опору
      // до 1.1 м вниз) и раздавливает самодельную раму. Стёкла режутся по
      // ячейкам каркаса и сидят в его плоскости — держатся боковым
      // креплением за стойки и перемычки, а опорой (стекло!) не служат.
      for (const side of [-1, 1] as const) {
        balconyPieces.push(
          makePiece(`${id}:glz:post:${side}`, "hru:balcony", "wood", "plank",
            [cx + side * 0.86, b + 1.115, -0.015], [0.055, 2.2, 0.055],
            frameColor),
          makePiece(`${id}:glz:mullion:${side}`, "hru:balcony", "wood", "plank",
            [cx + side * 0.31, b + 1.11, -0.015], [0.05, 2.16, 0.05],
            frameColor),
          {
            ...makePiece(`${id}:glz:sidebar:${side}`, "hru:balcony", "wood", "plank",
              [cx + side * 0.86, b + 2.21, -0.475], [0.05, 0.055, 1.0],
              frameColor),
            sideAttachmentReach: 0.2,
          },
          // Торцевое стекло — в плоскости каркаса, не снаружи фартука.
          makePiece(`${id}:glz:sidepane:${side}`, "hru:balcony", "glass", "glassPane",
            [cx + side * 0.875, b + 1.52, -0.395], [0.04, 1.31, 0.87],
            glassTint),
        );
      }
      balconyPieces.push(
        makePiece(`${id}:glz:top`, "hru:balcony", "wood", "plank",
          [cx, b + 2.21, -0.015], [1.77, 0.055, 0.055], frameColor),
        makePiece(`${id}:glz:pane:center`, "hru:balcony", "glass", "glassPane",
          [cx, b + 1.52, -0.02], [0.56, 1.31, 0.04],
          noise(`glzpale:${floor}:${bay}`) > 0.8 ? paleReflectionGlass : glassTint),
        ...[-1, 1].map((side): BreakablePieceDefinition =>
          makePiece(`${id}:glz:pane:${side}`, "hru:balcony", "glass", "glassPane",
            [cx + side * 0.584, b + 1.52, -0.02], [0.49, 1.31, 0.04], glassTint),
        ),
      );
      // Верхний этаж прикрывает остекление самодельной крышей.
      if (floor === floors - 1) {
        balconyPieces.push({
          ...makePiece(`${id}:glz:roof`, "hru:balcony", "steel", "steelSheet",
            [cx, b + 2.38, -0.35], [2.02, 0.05, 1.32],
            pvc ? zincSheet : "#7a5a43", [0.16, 0, 0]),
          weathering: 0.5,
          bearsLoad: false,
        });
      }
    }
    return variant;
  };

  for (let floor = 0; floor < floors; floor += 1) {
    const southPieces: BreakablePieceDefinition[] = [];
    const clusterId = `hru:south:${floor}`;
    const b = floorBase(floor);
    const wear = facadeWeathering(floor);

    for (let bay = 0; bay < 16; bay += 1) {
      const cx = bayCenter(bay);
      const isDoorBay = floor === 0 && doorBays.includes(bay);

      if (isDoorBay) {
        southPieces.push(
          {
            ...makePiece(`${clusterId}:${bay}:lintel`, clusterId, "concrete", "panel",
              [cx, b + 2.2, z1], [bayWidth - 0.01, 0.38, 0.3],
              panelColor("s", bay, floor, bay)),
            weathering: wear,
          },
          {
            ...makePiece(`${clusterId}:${bay}:jamb:l`, clusterId, "concrete", "panel",
              [cx - 0.5875, b + 1.0, z1], [0.155, 1.98, 0.3],
              panelColor("s", bay, floor, bay + 1)),
            weathering: wear,
          },
          {
            ...makePiece(`${clusterId}:${bay}:jamb:r`, clusterId, "concrete", "panel",
              [cx + 0.5875, b + 1.0, z1], [0.155, 1.98, 0.3],
              panelColor("s", bay, floor, bay + 1)),
            weathering: wear,
          },
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
        const hasBalcony = floor >= 1 && balconyBays.includes(bay);
        southPieces.push(
          {
            ...makePiece(`${clusterId}:${bay}:lintel`, clusterId, "concrete", "panel",
              [cx, b + 2.185, z1], [bayWidth - 0.01, 0.41, 0.3],
              panelColor("s", bay, floor, bay + floor + 2)),
            weathering: wear,
          },
          // Люстра под потолком комнаты: висит на боковом креплении к
          // оконной перемычке, нижний край чуть виден в верху окна.
          makePiece(`${clusterId}:${bay}:winlamp`, clusterId, "glass", "glassPane",
            [cx, b + 2.05, z1 - 0.35], [0.42, 0.26, 0.3],
            windowLampColor(`${salt}:${clusterId}:${bay}`, 0.42)),
        );
        if (hasBalcony) {
          const variant = addBalcony(floor, bay, cx, b);
          const openable =
            variant === "open" || variant === "clad" || variant === "wood";
          // Узкие простенки по краям балконного проёма.
          for (const side of [-1, 1] as const) {
            southPieces.push({
              ...makePiece(`${clusterId}:${bay}:reveal:${side}`, clusterId, "concrete", "panel",
                [cx + side * ((bayWidth - 0.16) / 2 + 0.0375), b + 0.995, z1],
                [0.075, 1.97, 0.3],
                panelColor("s", bay, floor, bay + floor)),
              weathering: wear,
            });
          }
          addBalconyDoorUnit(
            southPieces, clusterId, `${clusterId}:${bay}:bd`, cx, b, z1, 1,
            bayWidth - 0.16, panelColor("s", bay, floor, bay + floor),
            openable && noise(`ajar:${floor}:${bay}`) < 0.3,
          );
        } else {
          const opening = 1.06;
          const jambW = (bayWidth - 0.01 - opening) / 2;
          southPieces.push(
            {
              ...makePiece(`${clusterId}:${bay}:sill`, clusterId, "concrete", "panel",
                [cx, b + 0.405, z1], [bayWidth - 0.01, 0.79, 0.3],
                panelColor("s", bay, floor, bay + floor)),
              weathering: wear,
            },
            ...[-1, 1].map((side): BreakablePieceDefinition => ({
              ...makePiece(`${clusterId}:${bay}:jamb:${side}`, clusterId, "concrete", "panel",
                [cx + side * (opening / 2 + jambW / 2), b + 1.39, z1],
                [jambW, 1.18, 0.3],
                panelColor("s", bay, floor, bay + floor + 1)),
              weathering: wear,
            })),
          );
          addWindowUnit({
            pieces: southPieces,
            clusterId,
            idBase: `${clusterId}:${bay}:win`,
            cx,
            b,
            wallZ: z1,
            face: 1,
            width: opening,
          });
          // Первые этажи иногда прячутся за коваными решётками.
          if (floor === 0 && noise(`grille:s:${bay}`) < 0.5) {
            addWindowGrille(
              southPieces, clusterId, `${clusterId}:${bay}:grille`,
              cx, b, z1, 1, opening + 0.14,
            );
          }
        }
      } else {
        southPieces.push({
          ...makePiece(`${clusterId}:${bay}`, clusterId, "concrete", "panel",
            [cx, b + 1.2, z1], [bayWidth - 0.01, wallHeight, 0.3],
            panelColor("s", bay, floor, bay + floor)),
          weathering: wear,
        });
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
      const wear = facadeWeathering(floor);
      const unit = strip * 2 + 1;
      northPieces.push(
        {
          ...makePiece(`${clusterId}:${strip}:sill`, clusterId, "concrete", "panel",
            [cx, b + 0.405, z0], [stripWidth - 0.02, 0.79, 0.3],
            panelColor("n", unit, floor, strip + floor)),
          weathering: wear,
        },
        makePiece(`${clusterId}:${strip}:winlamp`, clusterId, "glass", "glassPane",
          [cx, b + 2.05, z0 + 0.35], [0.42, 0.26, 0.3],
          windowLampColor(`${salt}:${clusterId}:${strip}`, 0.45)),
        {
          ...makePiece(`${clusterId}:${strip}:jamb:l`, clusterId, "concrete", "panel",
            [cx - 0.95 - jambWidth / 2 - 0.01, b + 1.39, z0],
            [jambWidth, 1.14, 0.3], panelColor("n", unit, floor, strip + floor + 1)),
          weathering: wear,
        },
        {
          ...makePiece(`${clusterId}:${strip}:jamb:r`, clusterId, "concrete", "panel",
            [cx + 0.95 + jambWidth / 2 + 0.01, b + 1.39, z0],
            [jambWidth, 1.14, 0.3], panelColor("n", unit, floor, strip + floor + 1)),
          weathering: wear,
        },
        {
          ...makePiece(`${clusterId}:${strip}:lintel`, clusterId, "concrete", "panel",
            [cx, b + 2.185, z0], [stripWidth - 0.02, 0.41, 0.3],
            panelColor("n", unit, floor, strip + floor + 2)),
          weathering: wear,
        },
      );
      addWindowUnit({
        pieces: northPieces,
        clusterId,
        idBase: `${clusterId}:${strip}:win`,
        cx,
        b,
        wallZ: z0,
        face: -1,
        width: 1.9,
      });
      // Широкое северное окно — решётка реже: улица, а не двор.
      if (floor === 0 && noise(`grille:n:${strip}`) < 0.32) {
        addWindowGrille(
          northPieces, clusterId, `${clusterId}:${strip}:grille`,
          cx, b, z0, -1, 2.0,
        );
      }
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
    const stairFrameColor = "#cfc9b8";
    pieces.push({
      ...makePiece(`${clusterId}:ground`, clusterId, "concrete", "panel",
        [cx, 1.565, z0], [stripWidth - 0.02, 2.31, 0.3],
        panelColor("n", strip * 2 + 1, 0, sectionIndex)),
      weathering: 0.34,
    });
    for (let window = 0; window < 3; window += 1) {
      // Stairwell glazing is plain: the landings inside carry their own
      // plafond fixtures, which is where the light actually lives.
      const cy = 3.31 + window * floorHeight;
      const glazeW = stripWidth - 0.05;
      const zf = z0 - 0.045;
      pieces.push(
        makePiece(`${clusterId}:glass:${window}`, clusterId, "glass", "glassPane",
          [cx, cy, z0], [glazeW, 1.14, 0.06], "#51606a"),
      );
      // Старая крашеная рама лестничного окна: обвязка и две перемычки.
      const stairBar = (
        id: string,
        position: SceneVector3,
        size: SceneVector3,
      ): BreakablePieceDefinition => ({
        ...makePiece(`${clusterId}:frame:${window}:${id}`, clusterId, "wood", "plank",
          position, size, stairFrameColor),
        bearsLoad: false,
      });
      pieces.push(
        stairBar("top", [cx, cy + 0.54, zf], [glazeW, 0.06, 0.07]),
        stairBar("bottom", [cx, cy - 0.54, zf], [glazeW, 0.06, 0.07]),
        stairBar("left", [cx - glazeW / 2 + 0.03, cy, zf], [0.06, 1.02, 0.07]),
        stairBar("right", [cx + glazeW / 2 - 0.03, cy, zf], [0.06, 1.02, 0.07]),
        stairBar("mullion:l", [cx - glazeW / 6, cy, zf], [0.055, 1.02, 0.07]),
        stairBar("mullion:r", [cx + glazeW / 6, cy, zf], [0.055, 1.02, 0.07]),
      );
      pieces.push({
        ...makePiece(`${clusterId}:flash:${window}`, clusterId, "steel", "steelSheet",
          [cx, cy - 0.58, z0 - 0.235], [glazeW + 0.08, 0.03, 0.15],
          "#c9cdc9", [-0.12, 0, 0]),
        bearsLoad: false,
        weathering: 0.35,
      });
      if (window < 2) {
        pieces.push({
          ...makePiece(`${clusterId}:band:${window}`, clusterId, "concrete", "panel",
            [cx, 4.61 + window * floorHeight, z0], [stripWidth - 0.02, 1.42, 0.3],
            panelColor("n", strip * 2 + 1, window + 1, window + 1)),
          weathering: 0.18,
        });
      }
    }
    pieces.push({
      ...makePiece(`${clusterId}:top`, clusterId, "concrete", "panel",
        [cx, 9.845, z0], [stripWidth - 0.02, 1.49, 0.3],
        panelColor("n", strip * 2 + 1, 3, 2)),
      weathering: 0.14,
    });
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
        pieces.push({
          ...makePiece(`${clusterId}:${ex}:${index}`, clusterId, "concrete", "panel",
            [ex, floorBase(floor) + 1.22, zc], [0.3, 2.42, 3.46],
            groundAccent && floor === 0
              ? groundAccentPalette[(floor + index) % groundAccentPalette.length]
              : pal[(floor + index) % pal.length]),
          weathering: facadeWeathering(floor),
        });
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
            [bx, wy, -6.17], [0.24, wallHeight, 3.33], pal[3 % pal.length]),
          makePiece(`${clusterId}:${floor}:flat:${bx}`, clusterId, "concrete", "panel",
            [bx, wy, -2.32], [0.24, wallHeight, 2.26], pal[3 % pal.length]),
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

  // Парапет, вентшахты. Кромку парапета накрывает ржавый оцинкованный отлив.
  const roofPieces: BreakablePieceDefinition[] = [];
  for (let index = 0; index < 4; index += 1) {
    const cx = x0 + 2.75 + index * 5.5;
    roofPieces.push(
      { ...makePiece(`hru:parapet:s:${index}`, "hru:roof", "concrete", "panel",
        [cx, 11.06, -1.32], [5.42, 0.5, 0.25], pal[index % pal.length]),
        weathering: 0.3 },
      { ...makePiece(`hru:parapet:n:${index}`, "hru:roof", "concrete", "panel",
        [cx, 11.06, -7.68], [5.42, 0.5, 0.25], pal[(index + 1) % pal.length]),
        weathering: 0.3 },
      {
        ...makePiece(`hru:parapet:cap:s:${index}`, "hru:roof", "steel", "steelSheet",
          [cx, 11.33, -1.32], [5.44, 0.04, 0.33],
          index % 2 === 0 ? rustSteel : zincSheet),
        bearsLoad: false,
        weathering: 0.6,
      },
      {
        ...makePiece(`hru:parapet:cap:n:${index}`, "hru:roof", "steel", "steelSheet",
          [cx, 11.33, -7.68], [5.44, 0.04, 0.33],
          index % 2 === 1 ? rustSteel : zincSheet),
        bearsLoad: false,
        weathering: 0.6,
      },
    );
  }
  for (const ex of [12.31, 33.69]) {
    roofPieces.push(
      { ...makePiece(`hru:parapet:e:${ex}`, "hru:roof", "concrete", "panel",
        [ex, 11.06, (z0 + z1) / 2], [0.25, 0.5, 6.3], pal[2 % pal.length]),
        weathering: 0.3 },
      {
        ...makePiece(`hru:parapet:cap:e:${ex}`, "hru:roof", "steel", "steelSheet",
          [ex, 11.33, (z0 + z1) / 2], [0.33, 0.04, 6.32], zincSheet),
        bearsLoad: false,
        weathering: 0.55,
      },
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

      // Собранная мебель из coreFurniture ставится через placeProp; id несут
      // furn:<kind>:<instance> — по ним аудит уместности находит профили.
      const addProp = (
        name: string,
        props: readonly PropPiece[],
        anchor: SceneVector3,
      ) => {
        furniturePieces.push(
          ...placeProp(`${furnitureId}:${floor}:${name}`, props, anchor).map(
            (piece) => ({ ...piece, clusterId: furnitureId }),
          ),
        );
      };

      // однушка слева от лестницы. Холодильник — у глухой перегородки кухни:
      // глухой массе выше подоконника перед окном не место (см. аудит).
      addFurniture("fridge:l", "steel", [xs + 0.5, fb + 0.75, -4.95], [0.6, 1.5, 0.6], "#e3e6e3");
      addFurniture("counter:l", "wood", [xs + 1.6, fb + 0.425, -7.45], [1.3, 0.85, 0.55], "#c9c4ba");
      addProp("furn:slat-bed:l", propSlatBed({}), [xs + 0.85, fb, -3.25]);
      // Шкаф стоит у глухого простенка южной стены, не поперёк окна.
      addFurniture("wardrobe:l", "wood",
        [sectionIndex === 0 ? 13.02 : 23.66, fb + 0.9, -1.45], [1.0, 1.8, 0.5], "#7e5233");
      if (sectionIndex === 0) {
        addProp("furn:old-table:l", propOldTable({ seed: floor + 1 }), [xs + 1.9, fb, -2.72]);
      } else {
        addProp("furn:writer-desk:l", propWriterDesk({ seed: floor + 3 }), [xs + 1.8, fb, -2.62]);
      }
      addProp("furn:worn-chair:l", propWornChair({ seed: sectionIndex * 4 + floor }), [xs + 1.9, fb, -3.5]);

      // двушка справа
      addFurniture("counter:r", "wood", [b2 + 1.0, fb + 0.425, -7.45], [1.5, 0.85, 0.55], "#c9c4ba");
      addFurniture("fridge:r", "steel", [b2 + 2.0, fb + 0.75, -4.95], [0.6, 1.5, 0.6], "#e3e6e3");
      addProp("furn:old-table:r", propOldTable({ yaw: Math.PI / 2, seed: floor + 7 }), [b2 + 0.85, fb, -5.9]);
      addProp("furn:panel-chair:r", propPanelChair({ yaw: -Math.PI / 2 }), [b2 + 1.75, fb, -5.85]);
      // Кровать — вдоль межкомнатной перегородки: и входная, и балконная
      // двери остаются в свободном створе.
      addProp("furn:iron-bed:r1", propIronBed({}), [plasterX - 0.55, fb, -3.0]);
      addProp("furn:slat-bed:r2", propSlatBed({ timber: "#7a5236" }), [plasterX + 0.8, fb, -3.25]);
      addFurniture("wardrobe:r", "wood",
        [sectionIndex === 0 ? 20.95 : 31.78, fb + 0.9, -1.45], [1.0, 1.8, 0.5], "#7e5233");

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
  // Труба обрывается над цоколем-фартуком и заканчивается коленом-отмётом,
  // выведенным поверх него на отмостку — как у настоящего водостока.
  for (const [index, [px, pz, pipeFace]] of ([
    [12.4, -0.72, 1],
    [33.6, -0.72, 1],
    [12.4, -8.28, -1],
    [33.6, -8.28, -1],
  ] as const).entries()) {
    fixturePieces.push(
      {
        ...makePiece(`hru:downpipe:${index}`, "hru:fixtures", "steel", "steelSheet",
          [px, 5.58, pz], [0.11, 9.6, 0.11], "#9aa19e"),
        bearsLoad: false,
      },
      {
        ...makePiece(`hru:downpipe:${index}:outlet`, "hru:fixtures", "steel", "steelSheet",
          [px, 0.52, pz + pipeFace * 0.13], [0.11, 0.5, 0.11], "#8d938f",
          [-pipeFace * 0.55, 0, 0]),
        bearsLoad: false,
        sideAttachmentReach: 0.35,
        weathering: 0.45,
      },
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

  // Палитра, лампы, рамы и балконы уже разыграны от соли здания при
  // создании кусков — экземплярам остаётся только сдвиг и префикс.
  const dx = config.dx ?? 0;
  const dz = config.dz ?? 0;
  if (config.prefix || dx !== 0 || dz !== 0) {
    result = result.map((entry) =>
      transformCluster(entry, config.prefix, dx, dz),
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
    if (piece.material === "glass" && piece.id.includes(":winlamp")) {
      return deterministicNoise(`${litSalt}:${piece.id}`) < 0.35
        ? litWindowColor
        : unlitLampGlass;
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
    createDoor("door:front", 0, 0.76, 1),
    createDoor("door:back", 0, -6.76, -1),
    createSteelRoof(),
  ];

  if (!prefix && dx === 0 && dz === 0 && !recolor) {
    return clusters;
  }
  return clusters.map((entry) =>
    transformCluster(entry, prefix, dx, dz, recolor),
  );
}

// Зеркало готовых кластеров относительно плоскости z = mz. В отличие от
// поворота на 180°, дверь и крыльцо переходят на противоположный фасад, не
// съезжая вбок, а труба и прочие торцевые элементы остаются на своих местах —
// дом «разворачивается к дороге», не пересобираясь. Оси боксов сохраняются
// (решатель опор не страдает), XYZ-эйлеры отражаются как [-rx, -ry, rz].
function mirrorClustersZ(
  clusters: readonly BreakableClusterDefinition[],
  mz: number,
): BreakableClusterDefinition[] {
  const flipPos = (p: SceneVector3): SceneVector3 => [p[0], p[1], 2 * mz - p[2]];
  return clusters.map((entry) => ({
    ...entry,
    pieces: entry.pieces.map((piece) => ({
      ...piece,
      position: flipPos(piece.position),
      rotation: piece.rotation
        ? ([-piece.rotation[0], -piece.rotation[1], piece.rotation[2]] as SceneVector3)
        : undefined,
      hinge: piece.hinge
        ? {
            pivot: flipPos(piece.hinge.pivot),
            direction: piece.hinge.direction,
            normal: [
              piece.hinge.normal[0],
              piece.hinge.normal[1],
              -piece.hinge.normal[2],
            ] as SceneVector3,
          }
        : undefined,
      contactBoxes: piece.contactBoxes?.map((box) => ({
        position: flipPos(box.position),
        size: box.size,
      })),
    })),
  }));
}

function createStreets(): BreakableClusterDefinition[] {
  const roadPieces: BreakablePieceDefinition[] = [];
  const curbPieces: BreakablePieceDefinition[] = [];
  const markingPieces: BreakablePieceDefinition[] = [];

  for (let index = 0; index < 15; index += 1) {
    const cx = -12 + index * 6;
    roadPieces.push(
      { ...makePiece(`town:road:main:${index}`, "town:roads", "asphalt", "groundTile",
        [cx, 0.03, -12], [6, 0.1, 6], index % 2 === 0 ? "#4a4a48" : "#4e4e4c"),
        weathering: index % 4 === 1 ? 0.4 : 0.1 },
      { ...makePiece(`town:road:south:${index}`, "town:roads", "asphalt", "groundTile",
        [cx, 0.03, -30], [6, 0.1, 6], index % 2 === 0 ? "#4e4e4c" : "#4a4a48"),
        weathering: index % 4 === 3 ? 0.4 : 0.1 },
    );
    // The cross street joins at cx=42 — no curb across its mouth.
    if (cx !== 42) {
      curbPieces.push(
        makePiece(`town:curb:n:${index}`, "town:curbs", "concrete", "panel",
          [cx, 0.06, -8.88], [5.96, 0.16, 0.22], "#b5b8b6"),
        makePiece(`town:curb:s:${index}`, "town:curbs", "concrete", "panel",
          [cx, 0.06, -15.12], [5.96, 0.16, 0.22], "#b5b8b6"),
        // Южная улица обрамлена так же, как главная: бордюр по обеим
        // кромкам, кроме устья поперечной.
        makePiece(`town:curb:south:n:${index}`, "town:curbs", "concrete", "panel",
          [cx, 0.06, -26.88], [5.96, 0.16, 0.22], "#b5b8b6"),
        makePiece(`town:curb:south:s:${index}`, "town:curbs", "concrete", "panel",
          [cx, 0.06, -33.12], [5.96, 0.16, 0.22], "#b5b8b6"),
      );
    }
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
    // Бордюры и осевая прерывистая — поперечная улица оформлена наравне с
    // главными; устья перекрёстков остаются открытыми.
    curbPieces.push(
      makePiece(`town:curb:cross:w:${index}`, "town:curbs", "concrete", "panel",
        [38.88, 0.06, cz], [0.22, 0.16, 5.96], "#b5b8b6"),
      makePiece(`town:curb:cross:e:${index}`, "town:curbs", "concrete", "panel",
        [45.12, 0.06, cz], [0.22, 0.16, 5.96], "#b5b8b6"),
    );
    if (cz !== -18 && cz !== -24 && cz !== -36) {
      markingPieces.push(
        makePiece(`town:mark:cross:${index}`, "town:markings", "concrete", "panel",
          [42, 0.095, cz], [0.16, 0.03, 1.6], "#e8e6df"),
      );
    }
  }
  // Осевая на пролётах поперечной между перекрёстками.
  for (const [index, cz] of [-18, -24, -36].entries()) {
    markingPieces.push(
      makePiece(`town:mark:cross:mid:${index}`, "town:markings", "concrete", "panel",
        [42, 0.095, cz], [0.16, 0.03, 1.6], "#e8e6df"),
    );
  }
  // Второй перекрёсток (42, -30): зебры на всех четырёх подходах, как на
  // первом.
  for (let stripe = 0; stripe < 6; stripe += 1) {
    const acrossSouth = -32.5 + stripe * 1.0;
    markingPieces.push(
      makePiece(`town:zebra2:west:${stripe}`, "town:markings", "concrete", "panel",
        [36.9, 0.095, acrossSouth], [3.0, 0.03, 0.4], "#e8e6df"),
      makePiece(`town:zebra2:east:${stripe}`, "town:markings", "concrete", "panel",
        [47.1, 0.095, acrossSouth], [3.0, 0.03, 0.4], "#e8e6df"),
    );
    const acrossCross = 39.5 + stripe * 1.0;
    markingPieces.push(
      makePiece(`town:zebra2:north:${stripe}`, "town:markings", "concrete", "panel",
        [acrossCross, 0.095, -25.4], [0.4, 0.03, 3.0], "#e8e6df"),
      makePiece(`town:zebra2:south:${stripe}`, "town:markings", "concrete", "panel",
        [acrossCross, 0.095, -34.6], [0.4, 0.03, 3.0], "#e8e6df"),
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
  // Four zebra crossings around the intersection at (42, -12), one per
  // approach. Stripes run parallel to the road axis (the driver sees "piano
  // keys" pointing down the lane); pedestrians step across them.
  for (let stripe = 0; stripe < 6; stripe += 1) {
    const acrossMain = -14.5 + stripe * 1.0;
    markingPieces.push(
      makePiece(`town:zebra:west:${stripe}`, "town:markings", "concrete", "panel",
        [36.9, 0.095, acrossMain], [3.0, 0.03, 0.4], "#e8e6df"),
      makePiece(`town:zebra:east:${stripe}`, "town:markings", "concrete", "panel",
        [47.1, 0.095, acrossMain], [3.0, 0.03, 0.4], "#e8e6df"),
    );
    const acrossCross = 39.5 + stripe * 1.0;
    markingPieces.push(
      makePiece(`town:zebra:north:${stripe}`, "town:markings", "concrete", "panel",
        [acrossCross, 0.095, -7.4], [0.4, 0.03, 3.0], "#e8e6df"),
      makePiece(`town:zebra:south:${stripe}`, "town:markings", "concrete", "panel",
        [acrossCross, 0.095, -16.6], [0.4, 0.03, 3.0], "#e8e6df"),
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
      { ...makePiece(`${id}:side:${wall}`, id, "brick", "brick",
        [originX + pitch * wall, 1.08, -22.15], [0.24, 2.2, 5.55],
        silicateBrick[wall % silicateBrick.length]), weathering: 0.42 },
    );
  }

  for (let box = 0; box < 6; box += 1) {
    const cx = originX + pitch * (box + 0.5);
    pieces.push(
      { ...makePiece(`${id}:back:${box}`, id, "brick", "brick",
        [cx, 1.08, -24.9], [3.04, 2.2, 0.22],
        silicateBrick[(box + 1) % silicateBrick.length]), weathering: 0.45 },
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
      { ...makePiece(`${id}:post:${post}`, id, "concrete", "panel",
        [-11.2 + post * 2.6, 1.03, -26.3], [0.22, 2.1, 0.22], "#8f9595"), weathering: 0.45 },
    );
  }
  for (let panel = 0; panel < 8; panel += 1) {
    pieces.push(
      { ...makePiece(`${id}:panel:${panel}`, id, "concrete", "panel",
        [-9.9 + panel * 2.6, 0.99, -26.3], [2.34, 1.86, 0.1], "#9aa0a0"), weathering: 0.5 },
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

  const addLamp = (
    name: string,
    lx: number,
    lz: number,
    armToward: -1 | 1,
  ): void => {
    // Pole on the grass verge, arm reaching over the roadway, glowing head
    // resting on the arm tip. The head is the lamp: break it, the light dies.
    const headZ = lz + armToward * 0.72;
    pieces.push(
      makePiece(`${id}:${name}:pole`, id, "steel", "steelSheet",
        [lx, 2.28, lz], [0.16, 4.6, 0.16], "#565f5c"),
      makePiece(`${id}:${name}:arm`, id, "steel", "steelSheet",
        [lx, 4.5, lz + armToward * 0.42], [0.12, 0.12, 1.0], "#565f5c"),
      makePiece(`${id}:${name}:head`, id, "glass", "glassPane",
        [lx, 4.68, headZ], [0.36, 0.24, 0.36], litWindowColor),
      makePiece(`${id}:${name}:cap`, id, "steel", "steelSheet",
        [lx, 4.85, headZ], [0.46, 0.1, 0.46], "#4a5350"),
    );
    lampCollector.push({
      id: `${id}:${name}:head`,
      position: [lx, 4.46, headZ],
      color: "#ffdca8",
      distance: 12,
      intensity: 3.4,
    });
  };

  const addCrossLamp = (name: string, lx: number, lz: number): void => {
    // Lamps along the north-south street: the arm reaches west over the road.
    pieces.push(
      makePiece(`${id}:${name}:pole`, id, "steel", "steelSheet",
        [lx, 2.28, lz], [0.16, 4.6, 0.16], "#565f5c"),
      makePiece(`${id}:${name}:arm`, id, "steel", "steelSheet",
        [lx - 0.42, 4.5, lz], [1.0, 0.12, 0.12], "#565f5c"),
      makePiece(`${id}:${name}:head`, id, "glass", "glassPane",
        [lx - 0.72, 4.68, lz], [0.36, 0.24, 0.36], litWindowColor),
      makePiece(`${id}:${name}:cap`, id, "steel", "steelSheet",
        [lx - 0.72, 4.85, lz], [0.46, 0.1, 0.46], "#4a5350"),
    );
    lampCollector.push({
      id: `${id}:${name}:head`,
      position: [lx - 0.72, 4.46, lz],
      color: "#ffdca8",
      distance: 12,
      intensity: 3.4,
    });
  };

  // Main street (z = -12): poles on the north verge, arms south over the road.
  for (const [index, lx] of [-8, 10, 28, 58, 70].entries()) {
    addLamp(`main:${index}`, lx, -8.72, -1);
  }
  // South street (z = -30): poles on its north verge.
  for (const [index, lx] of [-2, 22, 52, 70].entries()) {
    addLamp(`south:${index}`, lx, -25.45, -1);
  }
  // Cross street (x = 42): poles on the east verge.
  for (const [index, lz] of [-44, -22, 4].entries()) {
    addCrossLamp(`cross:${index}`, 45.85, lz);
  }
  // The intersection gets its own four corner lamps, arms toward the middle.
  addLamp("junction:nw", 37.4, -7.7, -1);
  addLamp("junction:ne", 46.6, -7.7, -1);
  addLamp("junction:sw", 37.4, -16.3, 1);
  addLamp("junction:se", 46.6, -16.3, 1);

  return cluster(id, "Street lamps", "steel", "mounted", pieces);
}

/**
 * The town used to end at a hard rectangle. Like the fortress map, the play
 * field is a circle now: a meadow ring with bushes, field stones and dirt
 * patches fills everything between the authored blocks and the world rim.
 */
function createOutskirts(): BreakableClusterDefinition[] {
  const meadowPieces: BreakablePieceDefinition[] = [];
  const earthPieces: BreakablePieceDefinition[] = [];
  const floraPieces: BreakablePieceDefinition[] = [];
  const tile = 6;
  let index = 0;

  for (let cx = -48; cx <= 108; cx += tile) {
    for (let cz = -78; cz <= 48; cz += tile) {
      const insideTown =
        cx >= -12 && cx <= 72 && cz >= -48 && cz <= 18;
      // Вырезы под пристройки плиты: южный «язык» газона (двор усадьбы за
      // панельками, два ряда) и северо-восточная полоса (двор k6).
      const southYard =
        (cz === -54 && cx >= 12 && cx <= 36) ||
        (cz === -60 && cx >= 18 && cx <= 36);
      const northEastYard = cz === 24 && cx >= 48 && cx <= 72;
      const distance = Math.hypot(cx - 30, cz + 15);
      if (insideTown || southYard || northEastYard || distance > 57) {
        continue;
      }

      const tone = deterministicNoise(`outskirt:${cx}:${cz}`);
      meadowPieces.push({
        // city-ground включает луг в систему поверхностного износа: тропа
        // на запад и гаражная грунтовка на восток рисуются масками маршрутов
        // поверх тайлов, как все дороги города.
        ...makePiece(`town:outskirt:grass:${index}`, "town:outskirts", "soil", "groundTile",
          [cx, -0.14, cz], [6.04, 0.24, 6.04],
          tone > 0.66 ? "#5d7a41" : tone > 0.33 ? "#647f46" : "#587440"),
        landscapeSurface: "city-ground",
      });
      earthPieces.push(
        makePiece(`town:outskirt:earth:${index}`, "town:outskirts:earth", "earth", "groundTile",
          [cx, -0.71, cz], [6.04, 0.9, 6.04],
          tone > 0.5 ? "#665336" : "#5f4c31"),
      );

      // Кромочная застройка (гаражный тупик, заборы, сараи, опушечная тропа)
      // стоит на этих же луговых клетках — случайный куст внутри гаража или
      // камень посреди тропы ломают место, поэтому рассев там молчит.
      const insideRimStructure =
        (cx >= 72 && cx <= 87 && cz >= -33 && cz <= 0) ||
        (cx >= 69 && cx <= 81 && cz >= 9 && cz <= 21) ||
        (cx >= 9 && cx <= 42 && cz >= -69 && cz <= -58) ||
        (cx >= -30 && cx <= -9 && cz >= -18 && cz <= -6);
      const dressing = deterministicNoise(`outskirt:flora:${cx}:${cz}`);
      const offsetX = (deterministicNoise(`outskirt:ox:${cx}:${cz}`) - 0.5) * 3.4;
      const offsetZ = (deterministicNoise(`outskirt:oz:${cx}:${cz}`) - 0.5) * 3.4;
      if (insideRimStructure) {
        index += 1;
        continue;
      }
      if (dressing > 0.8) {
        const width = 0.9 + dressing * 1.5;
        const height = 0.5 + deterministicNoise(`outskirt:bh:${cx}:${cz}`) * 0.9;
        floraPieces.push({
          ...makePiece(`town:outskirt:bush:${index}`, "town:outskirts:flora", "foliage", "groundTile",
            [cx + offsetX, -0.02 + height / 2, cz + offsetZ],
            [width, height, width * 0.82],
            index % 3 === 0 ? "#3c5230" : index % 3 === 1 ? "#49603a" : "#425934",
            [0, deterministicNoise(`outskirt:br:${cx}:${cz}`) * Math.PI, 0]),
          vegetationVisual: { kind: "shrub", seed: index + 101 },
        });
      } else if (dressing < 0.07) {
        const width = 0.5 + deterministicNoise(`outskirt:rw:${cx}:${cz}`) * 0.9;
        const height = 0.3 + deterministicNoise(`outskirt:rh:${cx}:${cz}`) * 0.5;
        floraPieces.push(
          makePiece(`town:outskirt:rock:${index}`, "town:outskirts:flora", "stone", "stoneBlock",
            [cx + offsetX, -0.02 + height / 2, cz + offsetZ],
            [width, height, width * 0.8],
            index % 2 === 0 ? "#7b786f" : "#8a867b",
            [0, deterministicNoise(`outskirt:rr:${cx}:${cz}`) * Math.PI, 0.04]),
        );
      }
      index += 1;
    }
  }

  return [
    cluster("town:outskirts", "Meadow ring", "soil", "linked", meadowPieces),
    cluster("town:outskirts:earth", "Meadow subsoil", "earth", "linked", earthPieces),
    cluster("town:outskirts:flora", "Outskirt bushes and field stones", "foliage", "stack", floraPieces),
  ];
}

/**
 * Западная кромка — выход к лесу. Город не обрывается: главная улица
 * продолжается грунтовой тропой, тропа сужается и уходит в просвет между
 * двумя большими соснами, а за ним — туман. Плотность деревьев растёт к
 * краю, так что настоящего обрыва из-за стволов уже не видно.
 */
function createEdgewood(): BreakableClusterDefinition[] {
  const asPieces = (
    clusterId: string,
    prefix: string,
    props: readonly PropPiece[],
    anchor: readonly [number, number, number],
  ): BreakablePieceDefinition[] =>
    placeProp(prefix, props, anchor).map((piece) => ({ ...piece, clusterId }));

  // Тропа — продолжение главной улицы (z = -12) за асфальтом: земляные
  // сегменты чуть уводят к югу и сужаются с 2.4 м до 0.9 м — дорога, по
  // которой ходят реже, чем ездят по улице.
  const pathPieces: BreakablePieceDefinition[] = [];
  const pathRun: readonly (readonly [number, number, number, number, number])[] = [
    [-13.6, -12.0, 2.4, 2.2, 0],
    [-15.9, -12.2, 2.5, 2.0, 0.06],
    [-18.2, -12.5, 2.4, 1.8, 0.1],
    [-20.4, -12.9, 2.3, 1.6, 0.16],
    [-22.5, -13.4, 2.2, 1.4, 0.2],
    [-24.4, -13.9, 2.1, 1.15, 0.24],
    [-26.1, -14.4, 1.9, 0.9, 0.28],
  ];
  for (const [index, [px, pz, length, width, yaw]] of pathRun.entries()) {
    pathPieces.push(
      makePiece(`town:edgewood:path:${index}`, "town:edgewood:path", "earth", "groundTile",
        [px, 0.025, pz], [length, 0.09, width],
        index % 3 === 0 ? "#7a6c55" : index % 3 === 1 ? "#6f6250" : "#75664f",
        [0, yaw, 0]),
    );
  }

  // Опушка: сосны и дубы держат внешний ряд, берёзы — прогалы ближе к
  // домам. Две сосны с усиленным масштабом стоят рамкой по сторонам тропы.
  const treePieces: BreakablePieceDefinition[] = [];
  // Мы договаривались почти про лес: два с половиной ряда в шахматном
  // порядке, дерево каждые 4-5 метров. Реальный обрыв за такой полосой не
  // просматривается ни под каким углом, кроме просвета тропы.
  // Стволы держат ≥1.8 м до видимого края сетки (корневые лапы propTree
  // торчат на метр-полтора — с обрыва они свисать не должны) и ≥2.2 м до
  // оси тропы. Проверено валидатором посадки, не прикидкой.
  const belt: readonly (readonly ["oak" | "birch" | "pine", number, number, number, number?])[] = [
    // Рамка тропы — две большие сосны, просвет между ними держит выход.
    ["pine", -24.6, -10.4, 11, 1.15],
    ["pine", -24.4, -17.9, 12, 1.2],
    // Внешний ряд — сомкнутые кроны нависают над туманом, корни на земле.
    ["pine", -24.5, -23.4, 15, 1.08],
    ["oak", -24.4, -26.9, 17, 0.95],
    ["pine", -24.7, -5.6, 18, 1.12],
    ["pine", -24.5, -2.2, 21, 1.05],
    ["oak", -23.0, 0.8, 22, 0.98],
    ["pine", -21.6, -29.6, 23, 1.02],
    ["pine", -18.2, -31.9, 24, 0.96],
    // Средний ряд — дубы и берёзы в шахматке к внешнему.
    ["oak", -21.8, -6.2, 13],
    ["birch", -18.4, -3.0, 14],
    ["birch", -16.2, -18.9, 16],
    ["oak", -19.5, -25.8, 25, 0.95],
    ["birch", -21.5, -2.0, 26],
    ["oak", -22.7, -19.3, 27, 0.9],
    ["birch", -21.6, -17.1, 28],
    ["birch", -20.4, -22.6, 29],
    ["oak", -14.9, -28.4, 30, 0.92],
    // Внутренний редкий ряд — опушка сходит на нет к дворам.
    ["birch", -19.4, 2.6, 19],
    ["oak", -15.6, 8.3, 20],
    ["birch", -15.1, -6.4, 46],
    ["birch", -14.2, -24.2, 47],
    ["oak", -16.5, 2.2, 48, 0.88],
    ["birch", -13.9, -1.6, 49],
  ];
  for (const [index, [kind, tx, tz, seed, scale]] of belt.entries()) {
    treePieces.push(
      ...asPieces("town:edgewood", `edge:${index}`, propTree(kind, { seed, scale }), [tx, 0, tz]),
    );
  }

  // Подлесок между стволами — кусты того же рассева, что на лугу, но гуще:
  // опушка всегда зарастает первой.
  const floraPieces: BreakablePieceDefinition[] = [];
  const shrubs: readonly (readonly [number, number, number])[] = [
    [-24.8, -8.2, 31],
    [-25.6, -15.9, 32],
    [-21.2, -19.6, 33],
    [-17.5, -5.4, 34],
    [-22.4, 2.1, 35],
    [-16.8, -17.6, 36],
    [-19.8, -10.9, 37],
    [-16.4, -23.6, 61],
    [-18.9, -22.9, 62],
    [-23.3, -5.1, 63],
    [-16.1, -0.8, 64],
    [-20.6, -15.1, 65],
    [-24.1, -12.3, 66],
    [-17.9, -13.4, 67],
    [-21.9, -8.9, 68],
    [-15.9, -9.6, 69],
    [-19.2, 0.7, 70],
  ];
  for (const [index, [sx, sz, seed]] of shrubs.entries()) {
    const tone = deterministicNoise(`edgewood:shrub:${seed}`);
    const width = 1.0 + tone * 1.3;
    const height = 0.6 + deterministicNoise(`edgewood:sh:${seed}`) * 0.8;
    floraPieces.push({
      ...makePiece(`town:edgewood:shrub:${index}`, "town:edgewood:flora", "foliage", "groundTile",
        [sx, -0.02 + height / 2, sz], [width, height, width * 0.85],
        index % 3 === 0 ? "#3c5230" : index % 3 === 1 ? "#49603a" : "#425934",
        [0, tone * Math.PI, 0]),
      vegetationVisual: { kind: "shrub", seed: seed + 140 },
    });
  }

  return [
    cluster("town:edgewood", "Edge-of-town wood", "wood", "mounted", treePieces),
    cluster("town:edgewood:path", "Footpath into the wood", "earth", "mounted", pathPieces),
    cluster("town:edgewood:flora", "Edgewood undergrowth", "foliage", "stack", floraPieces),
  ];
}

/**
 * Куртины лугового кольца. Между кварталом и межевой полосой лежит
 * пятнадцатиметровая ширина луга — голый газон на полкарты читался
 * недоделкой. Рощицы по два-три дерева и кустарниковые гривы заполняют
 * кольцо там, где его не заняли виньетки и дворы; запад не трогаем — там
 * уже лес.
 */
function createMeadowGroves(): BreakableClusterDefinition[] {
  const asPieces = (
    clusterId: string,
    prefix: string,
    props: readonly PropPiece[],
    anchor: readonly [number, number, number],
  ): BreakablePieceDefinition[] =>
    placeProp(prefix, props, anchor).map((piece) => ({ ...piece, clusterId }));

  const trees: BreakablePieceDefinition[] = [];
  const flora: BreakablePieceDefinition[] = [];
  const kinds = ["birch", "oak", "birch", "pine"] as const;
  let treeIndex = 0;

  for (let grove = 0; grove < 32; grove += 1) {
    const groveNoise = deterministicNoise(`grove:${grove}`);
    const angle = (grove / 32) * Math.PI * 2 + (groveNoise - 0.5) * 0.18;
    const radius = 44.5 + deterministicNoise(`grove:r:${grove}`) * 9;
    const anchorX = 30 + Math.cos(angle) * radius;
    const anchorZ = -15 + Math.sin(angle) * radius;
    if (meadowKeepOut(anchorX, anchorZ)) {
      continue;
    }

    // Колок растёт тесно: стволы в 2.5-4 метрах друг от друга, кроны
    // внахлёст. Первый ствол — в якоре, остальные кольцом вокруг; если
    // место не подошло, ствол пробует другой азимут, а не исчезает.
    const treesInGrove = 2 + Math.floor(deterministicNoise(`grove:n:${grove}`) * 2.99);
    for (let member = 0; member < treesInGrove; member += 1) {
      const memberNoise = deterministicNoise(`grove:m:${grove}:${member}`);
      let planted = false;
      for (let attempt = 0; attempt < 3 && !planted; attempt += 1) {
        const memberAngle =
          deterministicNoise(`grove:ma:${grove}:${member}:${attempt}`) * Math.PI * 2;
        const memberRadius = member === 0 ? 0 : 1.6 + memberNoise * 1.9 + member * 0.5;
        const tx = anchorX + Math.cos(memberAngle) * memberRadius;
        const tz = anchorZ + Math.sin(memberAngle) * memberRadius;
        if (!treeStandFits(tx, tz) || meadowKeepOut(tx, tz) || distanceToRoutes(tx, tz) < 2.4) {
          continue;
        }
        const kind = kinds[(grove + member) % kinds.length];
        trees.push(
          ...asPieces("town:groves", `grove:${treeIndex}`,
            propTree(kind, {
              seed: 80 + grove * 5 + member,
              scale: 0.84 + memberNoise * 0.34,
            }),
            [tx, 0, tz]),
        );
        treeIndex += 1;
        planted = true;
      }
    }

    // Куртину всегда обступает подлесок — дерево на стриженом газоне
    // выглядит воткнутым, дерево в зарослях — выросшим.
    const shrubsInGrove = 2 + Math.floor(deterministicNoise(`grove:s:${grove}`) * 3);
    for (let shrub = 0; shrub < shrubsInGrove; shrub += 1) {
      const shrubAngle = deterministicNoise(`grove:sa:${grove}:${shrub}`) * Math.PI * 2;
      const sx = anchorX + Math.cos(shrubAngle) * (2.2 + shrub * 1.1);
      const sz = anchorZ + Math.sin(shrubAngle) * (2.0 + shrub * 1.0);
      if (!meadowCellExists(sx, sz) || meadowKeepOut(sx, sz) || distanceToRoutes(sx, sz) < 1.2) {
        continue;
      }
      const tone = deterministicNoise(`grove:st:${grove}:${shrub}`);
      const width = 1.2 + tone * 1.4;
      const height = 0.7 + deterministicNoise(`grove:sh:${grove}:${shrub}`) * 0.9;
      flora.push({
        ...makePiece(`town:groves:shrub:${grove}:${shrub}`, "town:groves:flora", "foliage", "groundTile",
          [sx, -0.02 + height / 2, sz], [width, height, width * 0.82],
          shrub % 3 === 0 ? "#3f5531" : shrub % 3 === 1 ? "#4a613a" : "#445c35",
          [0, tone * Math.PI, 0]),
        vegetationVisual: { kind: "shrub", seed: grove * 17 + shrub + 700 },
      });
    }
  }

  // Одиночки между колками: самосев, который однажды станет рощей.
  for (let lone = 0; lone < 14; lone += 1) {
    const loneNoise = deterministicNoise(`lone:${lone}`);
    if (loneNoise < 0.25) {
      continue;
    }
    const angle = ((lone + 0.5) / 14) * Math.PI * 2 + (loneNoise - 0.5) * 0.4;
    const radius = 45 + deterministicNoise(`lone:r:${lone}`) * 9;
    const tx = 30 + Math.cos(angle) * radius;
    const tz = -15 + Math.sin(angle) * radius;
    if (!treeStandFits(tx, tz) || meadowKeepOut(tx, tz) || distanceToRoutes(tx, tz) < 2.4) {
      continue;
    }
    trees.push(
      ...asPieces("town:groves", `lone:${lone}`,
        propTree(lone % 3 === 0 ? "oak" : "birch", {
          seed: 200 + lone,
          scale: 0.78 + loneNoise * 0.28,
        }),
        [tx, 0, tz]),
    );
  }

  // Гривы между куртинами: цепочки кустов вдоль кольца, чтобы луг дышал
  // зарослями, а не точками.
  for (let drift = 0; drift < 30; drift += 1) {
    const driftNoise = deterministicNoise(`drift:${drift}`);
    const angle = (drift / 30) * Math.PI * 2 + (driftNoise - 0.5) * 0.2;
    const radius = 44 + deterministicNoise(`drift:r:${drift}`) * 10;
    const dx = 30 + Math.cos(angle) * radius;
    const dz = -15 + Math.sin(angle) * radius;
    if (!meadowCellExists(dx, dz) || meadowKeepOut(dx, dz) || driftNoise < 0.22) {
      continue;
    }
    const pair = driftNoise > 0.6 ? 2 : 1;
    for (let bush = 0; bush < pair; bush += 1) {
      const bx = dx + bush * (1.1 + driftNoise);
      const bz = dz + bush * 0.7;
      if (!meadowCellExists(bx, bz) || meadowKeepOut(bx, bz) || distanceToRoutes(bx, bz) < 1.2) {
        continue;
      }
      const width = 1.0 + deterministicNoise(`drift:w:${drift}:${bush}`) * 1.2;
      const height = 0.55 + deterministicNoise(`drift:h:${drift}:${bush}`) * 0.75;
      flora.push({
        ...makePiece(`town:groves:drift:${drift}:${bush}`, "town:groves:flora", "foliage", "groundTile",
          [bx, -0.02 + height / 2, bz], [width, height, width * 0.85],
          drift % 2 === 0 ? "#465d36" : "#405833",
          [0, driftNoise * Math.PI, 0]),
        vegetationVisual: { kind: "shrub", seed: drift * 13 + bush + 900 },
      });
    }
  }

  return [
    cluster("town:groves", "Meadow copses", "wood", "mounted", trees),
    cluster("town:groves:flora", "Meadow scrub drifts", "foliage", "stack", flora),
  ];
}

/**
 * Межевой периметр: непрерывная полоса «края участка» по всему кольцу.
 * Виньетки (гаражи, стройка, опушка) — акценты, но кромка должна читаться
 * завершённой в ЛЮБОЙ точке, а не только там, куда смотрели специально.
 * Язык у неё дворовый: разросшийся бурьян, гнилые столбики старого
 * межевого забора с обрывками перекладин, полевые камни. Столбики помнят
 * границу, которой давно никто не проверял.
 */
// Точная копия сетки createOutskirts: луговая клетка существует, только
// если её ЦЕНТР в радиусе 57 и вне вырезов. Точка на радиусе 55 запросто
// попадает в клетку с центром за 57 — там земли нет, и куст бы висел.
function meadowCellExists(x: number, z: number): boolean {
  const cx = Math.round((x + 48) / 6) * 6 - 48;
  const cz = Math.round((z + 78) / 6) * 6 - 78;
  const insideTown = cx >= -12 && cx <= 72 && cz >= -48 && cz <= 18;
  const southYard =
    (cz === -54 && cx >= 12 && cx <= 36) ||
    (cz === -60 && cx >= 18 && cx <= 36);
  const northEastYard = cz === 24 && cx >= 48 && cx <= 72;
  return !insideTown && !southYard && !northEastYard && Math.hypot(cx - 30, cz + 15) <= 57;
}

// Тропы главнее деревьев: люди уже решили, где ходят, и рассев обязан
// уважать их маршруты.
function distanceToRoutes(x: number, z: number): number {
  let best = Infinity;
  for (const route of townSurfaceRoutes) {
    for (let index = 0; index < route.points.length - 1; index += 1) {
      const [ax, az] = route.points[index];
      const [bx, bz] = route.points[index + 1];
      const dx = bx - ax;
      const dz = bz - az;
      const t = Math.max(0, Math.min(1,
        ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
      best = Math.min(best, Math.hypot(x - (ax + t * dx), z - (az + t * dz)));
    }
  }
  return best;
}

// Дереву с корневыми лапами нужна земля вокруг ствола, не только под ним.
function treeStandFits(x: number, z: number): boolean {
  return (
    meadowCellExists(x, z) &&
    meadowCellExists(x + 1.8, z) &&
    meadowCellExists(x - 1.8, z) &&
    meadowCellExists(x, z + 1.8) &&
    meadowCellExists(x, z - 1.8)
  );
}

// Занятые куски луга: авторские виньетки, дворы старого квартала и
// маршруты — куртинам туда нельзя.
function meadowKeepOut(x: number, z: number): boolean {
  // Габариты по факту объектов плюс два метра, не «с запасом в полдвора»:
  // каждый лишний метр выреза — это дыра в лесном кольце.
  const vignettes =
    (x >= 73 && x <= 88 && z >= -30 && z <= -2) ||
    (x >= 73 && x <= 83 && z >= 8 && z <= 17) ||
    (x >= 9 && x <= 42 && z >= -70 && z <= -57) ||
    (x <= -10 && z >= -32 && z <= 11) ||
    (x < -9 && z > 9) ||
    (x >= 16 && x <= 36 && z >= -62 && z <= -49);
  return vignettes;
}

function createRimHedgerow(): BreakableClusterDefinition[] {
  const bushes: BreakablePieceDefinition[] = [];
  const posts: BreakablePieceDefinition[] = [];
  const ringCount = 76;

  for (let step = 0; step < ringCount; step += 1) {
    const noiseA = deterministicNoise(`hedgerow:a:${step}`);
    const noiseB = deterministicNoise(`hedgerow:b:${step}`);
    const angle = (step / ringCount) * Math.PI * 2 + (noiseA - 0.5) * 0.055;
    let radius = 54.6 + noiseB * 1.4;
    let x = 30 + Math.cos(angle) * radius;
    let z = -15 + Math.sin(angle) * radius;
    for (let pull = 0; pull < 3 && !meadowCellExists(x, z); pull += 1) {
      radius -= 2.4;
      x = 30 + Math.cos(angle) * radius;
      z = -15 + Math.sin(angle) * radius;
    }
    if (!meadowCellExists(x, z)) {
      continue;
    }

    // Виньетки несут собственную кромку — за гаражами и забором стройки
    // межевой полосе делать нечего; из коридора тропы она тоже уходит.
    // Северо-западный сектор занят домами старого квартала: они стоят ВНЕ
    // городского бокса, и сетка луга о них не знает.
    const behindGarages = x > 74;
    const behindSite = x >= 9 && x <= 42 && z < -58;
    const onPath = x < -9 && z > -16.5 && z < -8.5;
    const inOldQuarter = x < -8 && z > 8;
    if (behindGarages || behindSite || onPath || inOldQuarter) {
      continue;
    }

    const kind = deterministicNoise(`hedgerow:kind:${step}`);
    if (kind < 0.12) {
      continue;
    }
    if (kind < 0.3) {
      // Столбик старой межи: покосился, но стоит; на некоторых — обрывок
      // перекладины.
      const tilt = (deterministicNoise(`hedgerow:tilt:${step}`) - 0.5) * 0.22;
      posts.push({
        ...makePiece(`town:rim:hedge-post:${step}`, "town:rim:posts", "wood", "plank",
          [x, 0.62, z], [0.13, 1.3, 0.13],
          step % 2 === 0 ? "#5c4a38" : "#544335",
          [tilt * 0.6, noiseA * Math.PI, tilt]),
        carriesAttachments: true,
        weathering: 0.65,
      });
      if (noiseB > 0.55) {
        posts.push({
          ...makePiece(`town:rim:hedge-rail:${step}`, "town:rim:posts", "wood", "plank",
            [x + Math.cos(angle + 1.57) * 0.4, 0.92, z + Math.sin(angle + 1.57) * 0.4],
            [0.7, 0.07, 0.05], "#4e3e30",
            [0.05, -angle + 1.57, (noiseA - 0.5) * 0.5]),
          bearsLoad: false,
          sideAttachmentReach: 0.5,
          weathering: 0.7,
        });
      }
    } else if (kind < 0.42) {
      const width = 0.55 + noiseB * 0.8;
      bushes.push(
        makePiece(`town:rim:hedge-rock:${step}`, "town:rim:hedgerow", "stone", "stoneBlock",
          [x, 0.14 + width * 0.16, z], [width, 0.28 + width * 0.3, width * 0.82],
          step % 2 === 0 ? "#7b786f" : "#847f74",
          [0, noiseA * Math.PI, 0.05]),
      );
    } else {
      // Бурьян живёт парами: основной куст и малый застрельщик рядом —
      // одиночные шары читаются как рассев, пары — как заросль.
      const width = 1.5 + noiseB * 1.2;
      const height = 0.9 + deterministicNoise(`hedgerow:h:${step}`) * 0.8;
      bushes.push({
        ...makePiece(`town:rim:hedge-bush:${step}`, "town:rim:hedgerow", "foliage", "groundTile",
          [x, -0.02 + height / 2, z], [width, height, width * 0.8],
          step % 3 === 0 ? "#3f5531" : step % 3 === 1 ? "#4a613a" : "#445c35",
          [0, noiseA * Math.PI, 0]),
        vegetationVisual: { kind: "shrub", seed: step + 300 },
      });
      if (noiseA > 0.4) {
        const smallWidth = width * 0.55;
        const smallHeight = height * 0.62;
        const offsetAngle = angle + (noiseB - 0.5) * 2;
        const smallX = x + Math.cos(offsetAngle) * (width * 0.7);
        const smallZ = z + Math.sin(offsetAngle) * (width * 0.7);
        // Спутник может отшагнуть с последней клетки — тогда его нет.
        if (meadowCellExists(smallX, smallZ)) {
          bushes.push({
            ...makePiece(`town:rim:hedge-bush:sm:${step}`, "town:rim:hedgerow", "foliage", "groundTile",
              [smallX, -0.02 + smallHeight / 2, smallZ],
              [smallWidth, smallHeight, smallWidth * 0.85],
              step % 2 === 0 ? "#465d36" : "#405833",
              [0, noiseB * Math.PI, 0]),
            vegetationVisual: { kind: "shrub", seed: step + 500 },
          });
        }
      }
    }
  }

  return [
    cluster("town:rim:hedgerow", "Boundary scrub", "foliage", "stack", bushes),
    cluster("town:rim:posts", "Old boundary posts", "wood", "stack", posts),
  ];
}

/**
 * Закрытые стороны кромки: город заканчивается там, где есть чувство
 * завершения. Восток — гаражный тупик спиной к обрыву, за крышами торчат
 * верхушки берёз. Юг — бетонный забор ПО-2, за ним стройка: недостроенная
 * коробка, штабель плит, кучи песка и щебня. Северо-восток — сараи с
 * поленницей. Невидимая стена мира везде совпадает с построенной причиной
 * в неё не ходить.
 */
function createRimClosure(): BreakableClusterDefinition[] {
  const asPieces = (
    clusterId: string,
    prefix: string,
    props: readonly PropPiece[],
    anchor: readonly [number, number, number],
  ): BreakablePieceDefinition[] =>
    placeProp(prefix, props, anchor).map((piece) => ({ ...piece, clusterId }));
  const clusters: BreakableClusterDefinition[] = [];

  // --- Восток: гаражный тупик, воротами к городу, спиной к краю ----------
  const garages: BreakablePieceDefinition[] = [];
  const garageId = "town:rim:garages";
  const originZ = -25.9;
  const pitch = 3.3;
  const gateColors = ["#6a7b8c", "#79585c", "#5c7d5e", "#5d6a7d", "#7d6a54", "#6d7a58"];

  for (let wall = 0; wall <= 6; wall += 1) {
    garages.push(
      { ...makePiece(`${garageId}:side:${wall}`, garageId, "brick", "brick",
        [80.2, 1.08, originZ + pitch * wall], [5.55, 2.2, 0.24],
        silicateBrick[wall % silicateBrick.length]), weathering: 0.48 },
    );
  }
  for (let box = 0; box < 6; box += 1) {
    const cz = originZ + pitch * (box + 0.5);
    garages.push(
      { ...makePiece(`${garageId}:back:${box}`, garageId, "brick", "brick",
        [82.9, 1.08, cz], [0.22, 2.2, 3.04],
        silicateBrick[(box + 1) % silicateBrick.length]), weathering: 0.52 },
      makePiece(`${garageId}:lintel:${box}`, garageId, "concrete", "panel",
        [77.55, 2.09, cz], [0.24, 0.3, 3.28], "#a9aca8"),
      makePiece(`${garageId}:roof:${box}`, garageId, "concrete", "stoneBlock",
        [80.2, 2.32, cz], [6.1, 0.15, 3.28], box % 2 === 0 ? "#84888c" : "#7d8286"),
    );
    for (const side of [-1, 1] as const) {
      const pivotZ = cz + side * 1.52;
      garages.push({
        ...makePiece(`${garageId}:gate:${box}:${side}`, garageId, "steel", "steelSheet",
          [77.45, 0.99, cz + side * 0.76], [0.08, 1.88, 1.5],
          gateColors[box]),
        hinge: {
          pivot: [77.45, 0.99, pivotZ],
          direction: [0, 0, -side],
          normal: [1, 0, 0],
        },
      });
    }
  }
  clusters.push(cluster(garageId, "Rim garage row", "brick", "mounted", garages));

  // Накатанная машинами грунтовка вдоль ворот — гаражи живут, к ним ездят.
  const track: BreakablePieceDefinition[] = [];
  for (const [index, tz] of [-22.4, -16.0, -9.6].entries()) {
    track.push(
      makePiece(`town:rim:track:${index}`, "town:rim:track", "earth", "groundTile",
        [75.5, 0.02, tz], [2.8, 0.08, 6.6], index % 2 === 0 ? "#6a5a42" : "#63543d"),
    );
  }
  clusters.push(cluster("town:rim:track", "Garage track", "earth", "mounted", track));

  // --- Юг: забор ПО-2 и стройка за ним -----------------------------------
  const fence: BreakablePieceDefinition[] = [];
  const fenceId = "town:rim:fence-south";
  for (let post = 0; post <= 8; post += 1) {
    fence.push(
      { ...makePiece(`${fenceId}:post:${post}`, fenceId, "concrete", "panel",
        [13.9 + post * 2.6, 1.03, -63.2], [0.22, 2.1, 0.22], "#8f9595"), weathering: 0.5 },
    );
  }
  for (let panel = 0; panel < 8; panel += 1) {
    fence.push(
      { ...makePiece(`${fenceId}:panel:${panel}`, fenceId, "concrete", "panel",
        [15.2 + panel * 2.6, 0.99, -63.2], [2.34, 1.86, 0.1],
        panel % 3 === 0 ? "#9aa0a0" : "#959b9b"), weathering: 0.55 },
    );
  }
  clusters.push(cluster(fenceId, "South rim fence", "concrete", "mounted", fence));

  const site: BreakablePieceDefinition[] = [];
  const siteId = "town:rim:site";
  // Недостроенная коробка:四 стены без крыши, дверной проём на север — к
  // забору, откуда её и видно.
  site.push(
    { ...makePiece(`${siteId}:shell:n:w`, siteId, "brick", "brick",
      [22.6, 1.28, -65.2], [1.4, 2.6, 0.24], silicateBrick[0]), weathering: 0.35 },
    { ...makePiece(`${siteId}:shell:n:e`, siteId, "brick", "brick",
      [25.6, 1.28, -65.2], [1.4, 2.6, 0.24], silicateBrick[1]), weathering: 0.35 },
    { ...makePiece(`${siteId}:shell:lintel`, siteId, "concrete", "panel",
      [24.1, 2.42, -65.2], [1.9, 0.28, 0.26], "#a9aca8"), weathering: 0.3 },
    { ...makePiece(`${siteId}:shell:s`, siteId, "brick", "brick",
      [24.1, 1.28, -68.4], [4.2, 2.6, 0.24], silicateBrick[2]), weathering: 0.4 },
    { ...makePiece(`${siteId}:shell:w`, siteId, "brick", "brick",
      [21.9, 1.28, -66.8], [0.24, 2.6, 3.0], silicateBrick[1]), weathering: 0.4 },
    { ...makePiece(`${siteId}:shell:e`, siteId, "brick", "brick",
      [26.3, 1.28, -66.8], [0.24, 2.6, 3.0], silicateBrick[0]), weathering: 0.4 },
  );
  // Штабель дорожных плит и малый — рядом; плиты лежат чуть вразнобой.
  const slabYaw = [0, 0.06, -0.04, 0.09];
  for (let slab = 0; slab < 4; slab += 1) {
    site.push(
      makePiece(`${siteId}:slab:${slab}`, siteId, "concrete", "panel",
        [30.5, 0.09 + slab * 0.22, -65.4], [3.0, 0.22, 1.5],
        slab % 2 === 0 ? "#9aa0a0" : "#8f9595", [0, slabYaw[slab], 0]),
    );
  }
  for (let slab = 0; slab < 2; slab += 1) {
    site.push(
      makePiece(`${siteId}:slab:sm:${slab}`, siteId, "concrete", "panel",
        [27.6, 0.09 + slab * 0.22, -64.6], [2.2, 0.22, 1.2], "#a5aaa8",
        [0, 0.5 - slab * 0.07, 0]),
    );
  }
  // Кучи песка и щебня + пара блоков ФБС: стройка стоит, но не брошена.
  site.push(
    { ...makePiece(`${siteId}:sand`, siteId, "earth", "stoneBlock",
      [19.4, 0.28, -65.2], [2.2, 0.6, 1.6], "#c8b280", [0, 0.4, 0]),
      contactBoxes: [{ position: [19.4, 0.28, -65.2], size: [1.4, 0.6, 1.0] }],
      weathering: 0.2 },
    { ...makePiece(`${siteId}:gravel`, siteId, "stone", "stoneBlock",
      [17.2, 0.23, -64.3], [1.8, 0.5, 1.3], "#75766c", [0, 1.1, 0]),
      contactBoxes: [{ position: [17.2, 0.23, -64.3], size: [1.1, 0.5, 0.8] }],
      weathering: 0.2 },
    makePiece(`${siteId}:fbs:0`, siteId, "concrete", "cinderBlock",
      [33.4, 0.27, -64.8], [1.18, 0.58, 0.58], "#9b9f9d"),
    makePiece(`${siteId}:fbs:1`, siteId, "concrete", "cinderBlock",
      [33.4, 0.85, -64.7], [1.18, 0.58, 0.58], "#939896", [0, 0.08, 0]),
  );
  // Леса у северной стены недостроя: стойки, поперечины, настил — кладку
  // бросили, а леса разобрать не успели.
  for (const [postIndex, px] of [22.5, 23.7, 24.5, 25.7].entries()) {
    site.push({
      ...makePiece(`${siteId}:scaffold:post:${postIndex}`, siteId, "wood", "plank",
        [px, 1.28, -64.45], [0.1, 2.6, 0.1], postIndex % 2 === 0 ? "#6d5138" : "#63492f"),
      carriesAttachments: true,
      weathering: 0.4,
    });
  }
  for (const [railIndex, ry] of [0.92, 1.66].entries()) {
    site.push(
      { ...makePiece(`${siteId}:scaffold:rail:${railIndex}:a`, siteId, "wood", "plank",
        [23.1, ry, -64.45], [1.45, 0.09, 0.09], "#5d4531"),
        bearsLoad: railIndex === 1, carriesAttachments: railIndex === 1,
        attachmentSupportMode: "cable", sideAttachmentReach: 0.5, weathering: 0.45 },
      { ...makePiece(`${siteId}:scaffold:rail:${railIndex}:b`, siteId, "wood", "plank",
        [25.1, ry, -64.45], [1.45, 0.09, 0.09], "#54402d"),
        bearsLoad: railIndex === 1, carriesAttachments: railIndex === 1,
        attachmentSupportMode: "cable", sideAttachmentReach: 0.5, weathering: 0.45 },
    );
  }
  site.push(
    { ...makePiece(`${siteId}:scaffold:deck:0`, siteId, "wood", "plank",
      [23.6, 1.75, -64.32], [2.5, 0.06, 0.26], "#6d5138"), weathering: 0.5 },
    { ...makePiece(`${siteId}:scaffold:deck:1`, siteId, "wood", "plank",
      [24.4, 1.75, -64.58], [2.7, 0.06, 0.26], "#63492f", [0, 0.02, 0]), weathering: 0.5 },
  );
  // Верхний ряд кладки брошен зубцами — стройка остановилась на полуслове.
  for (const [toothIndex, tx] of [22.4, 23.1, 24.5, 25.4, 25.9].entries()) {
    site.push(
      makePiece(`${siteId}:tooth:${toothIndex}`, siteId, "brick", "brick",
        [tx, 2.65, -68.4 + (toothIndex % 2) * 0.02], [0.25 + (toothIndex % 3) * 0.05, 0.13, 0.24],
        silicateBrick[toothIndex % silicateBrick.length]),
    );
  }
  // Поддон с кирпичом дожидается каменщиков.
  site.push(...asPieces(siteId, "site:pallet", propPallet({ yaw: 0.2 }), [28.9, 0, -67.3]));
  for (let brick = 0; brick < 6; brick += 1) {
    site.push(
      makePiece(`${siteId}:brickpile:${brick}`, siteId, "brick", "brick",
        [28.55 + (brick % 3) * 0.34, 0.32 + Math.floor(brick / 3) * 0.14, -67.25 + (brick % 2) * 0.06],
        [0.3, 0.13, 0.25], silicateBrick[brick % silicateBrick.length], [0, (brick % 3) * 0.06, 0]),
    );
  }
  clusters.push(cluster(siteId, "Frozen building site", "concrete", "mounted", site));

  // --- Северо-восток: сараи с поленницей ----------------------------------
  // Дощатые по-настоящему: угловые стойки и стены доска к доске, с
  // разнотоном и неровной глубиной — так собран весь остальной город, и
  // сарай из четырёх «листов фанеры» рядом с ним читался как макет.
  const sheds: BreakablePieceDefinition[] = [];
  const shedId = "town:rim:sheds";
  // Позиции выверены по луговой сетке (все углы на существующих клетках) И
  // по соседям: во дворе к6 растёт опушечный дуб (72.8, 12.8) — сараи
  // отступают от него к востоку, чтобы ствол не оказался в стене.
  const shedPlans = [
    { cx: 77.0, cz: 13.0, width: 2.6, depth: 2.0, tones: ["#6b5138", "#75593c", "#5f4834", "#715740"] },
    { cx: 79.4, cz: 10.4, width: 2.2, depth: 1.8, tones: ["#5e4732", "#6a5138", "#564130", "#63492f"] },
  ] as const;
  for (const [index, plan] of shedPlans.entries()) {
    const westX = plan.cx - plan.width / 2;
    const eastX = plan.cx + plan.width / 2;
    // Каркас: четыре угловые стойки.
    for (const [cornerIndex, [sx, sz]] of ([
      [westX, plan.cz - plan.depth / 2],
      [eastX, plan.cz - plan.depth / 2],
      [westX, plan.cz + plan.depth / 2],
      [eastX, plan.cz + plan.depth / 2],
    ] as const).entries()) {
      sheds.push({
        ...makePiece(`${shedId}:${index}:post:${cornerIndex}`, shedId, "wood", "plank",
          [sx, 0.985, sz], [0.13, 2.01, 0.13], "#4a392b"),
        carriesAttachments: true,
        weathering: 0.6,
      });
    }
    // Задняя стена — вертикальные доски с разнобоем глубины и высоты.
    const backBoards = Math.round(plan.depth / 0.36);
    for (let board = 0; board < backBoards; board += 1) {
      const bz = plan.cz - plan.depth / 2 + (board + 0.5) * (plan.depth / backBoards);
      const wobble = deterministicNoise(`shed:${index}:back:${board}`);
      sheds.push({
        ...makePiece(`${shedId}:${index}:back:${board}`, shedId, "wood", "plank",
          [eastX + (wobble - 0.5) * 0.05, 0.94 + wobble * 0.05, bz],
          [0.09, 1.9 + wobble * 0.08, plan.depth / backBoards - 0.015],
          plan.tones[board % plan.tones.length]),
        weathering: 0.55 },
      );
    }
    // Боковые стены — та же доска, реже тон.
    for (const [wallIndex, wz] of [plan.cz - plan.depth / 2, plan.cz + plan.depth / 2].entries()) {
      const sideBoards = Math.round(plan.width / 0.37);
      for (let board = 0; board < sideBoards; board += 1) {
        const bx = westX + (board + 0.5) * (plan.width / sideBoards);
        const wobble = deterministicNoise(`shed:${index}:side:${wallIndex}:${board}`);
        sheds.push({
          ...makePiece(`${shedId}:${index}:side:${wallIndex}:${board}`, shedId, "wood", "plank",
            [bx, 0.94 + wobble * 0.05, wz + (wobble - 0.5) * 0.04],
            [plan.width / sideBoards - 0.015, 1.88 + wobble * 0.1, 0.09],
            plan.tones[(board + wallIndex + 1) % plan.tones.length]),
          weathering: 0.52 },
        );
      }
    }
    // Перед: доска над дверью и узкий простенок, дверь на петле.
    sheds.push(
      { ...makePiece(`${shedId}:${index}:front:top`, shedId, "wood", "plank",
        [westX, 1.78, plan.cz], [0.09, 0.42, plan.depth - 0.1], plan.tones[0]), weathering: 0.45 },
      // Косяк доведён ровно до низа фрамуги — куски не пересекаются в
      // объёме и не дробят одну плоскость на мерцающие слои.
      { ...makePiece(`${shedId}:${index}:front:jamb`, shedId, "wood", "plank",
        [westX, 0.79, plan.cz + plan.depth * 0.34], [0.09, 1.56, plan.depth * 0.3], plan.tones[2]),
        weathering: 0.45 },
    );
    sheds.push({
      ...makePiece(`${shedId}:${index}:door`, shedId, "wood", "plank",
        [westX + 0.02, 0.85, plan.cz - plan.depth * 0.16], [0.08, 1.7, plan.depth * 0.58], "#7c5f40"),
      hinge: {
        pivot: [westX, 0.85, plan.cz - plan.depth * 0.44],
        direction: [0, 0, 1],
        normal: [1, 0, 0],
      },
    });
    // Проушина с навесным замком на косяке — сарай заперт не «понарошку».
    sheds.push(
      { ...makePiece(`${shedId}:${index}:hasp`, shedId, "steel", "steelSheet",
        [westX - 0.07, 1.05, plan.cz + plan.depth * 0.17], [0.05, 0.14, 0.2], "#4a4d4f"),
        bearsLoad: false, sideAttachmentReach: 0.3 },
      { ...makePiece(`${shedId}:${index}:padlock`, shedId, "steel", "steelSheet",
        [westX - 0.11, 0.97, plan.cz + plan.depth * 0.17], [0.07, 0.13, 0.09], "#3b3e40"),
        bearsLoad: false, attachmentSupportMode: "cable", sideAttachmentReach: 0.25 },
    );
    // Толевая крыша со свесом и прижимными досками поверх — против ветра.
    sheds.push(
      { ...makePiece(`${shedId}:${index}:roof`, shedId, "wood", "panel",
        [plan.cx, 2.06, plan.cz], [plan.width + 0.5, 0.09, plan.depth + 0.45], "#3a3a38",
        [0, 0, 0.055]),
        contactBoxes: [{ position: [plan.cx, 2.06, plan.cz], size: [plan.width, 0.12, plan.depth] }],
        weathering: 0.35 },
      { ...makePiece(`${shedId}:${index}:roof-batten:0`, shedId, "wood", "plank",
        [plan.cx, 2.15, plan.cz - plan.depth * 0.28], [plan.width + 0.42, 0.055, 0.16], "#55422f",
        [0, 0, 0.055]),
        bearsLoad: false, sideAttachmentReach: 0.3, weathering: 0.5 },
      { ...makePiece(`${shedId}:${index}:roof-batten:1`, shedId, "wood", "plank",
        [plan.cx, 2.15, plan.cz + plan.depth * 0.3], [plan.width + 0.42, 0.055, 0.16], "#4e3d2c",
        [0, 0, 0.055]),
        bearsLoad: false, sideAttachmentReach: 0.3, weathering: 0.5 },
    );
  }
  // Окошко первого сарая: рамка крестом на южной стене, стекло мутное.
  const winX = 77.0;
  const winZ = 14.06;
  sheds.push(
    { ...makePiece(`${shedId}:win:sill`, shedId, "wood", "plank",
      [winX, 1.06, winZ + 0.06], [0.5, 0.06, 0.1], "#4a392b"), bearsLoad: false, sideAttachmentReach: 0.3 },
    { ...makePiece(`${shedId}:win:head`, shedId, "wood", "plank",
      [winX, 1.54, winZ + 0.06], [0.5, 0.06, 0.1], "#4a392b"), bearsLoad: false, sideAttachmentReach: 0.3 },
    { ...makePiece(`${shedId}:win:left`, shedId, "wood", "plank",
      [winX - 0.22, 1.3, winZ + 0.06], [0.06, 0.42, 0.1], "#4a392b"), bearsLoad: false, sideAttachmentReach: 0.3 },
    { ...makePiece(`${shedId}:win:right`, shedId, "wood", "plank",
      [winX + 0.22, 1.3, winZ + 0.06], [0.06, 0.42, 0.1], "#4a392b"), bearsLoad: false, sideAttachmentReach: 0.3 },
    { ...makePiece(`${shedId}:win:glass`, shedId, "glass", "glassPane",
      [winX, 1.3, winZ + 0.04], [0.38, 0.42, 0.04], "#8fa5a0"), bearsLoad: false, sideAttachmentReach: 0.3 },
  );
  // Поленница вдоль южной стены первого сарая: два ряда лежачих чурбаков.
  for (let log = 0; log < 4; log += 1) {
    const lz = 14.62;
    const lx = 76.14 + log * 0.28;
    sheds.push({
      ...makePiece(`${shedId}:logs:0:${log}`, shedId, "wood", "cylinder",
        [lx, 0.11, lz], [0.26, 1.5, 0.26], log % 2 === 0 ? "#6f4b31" : "#7a5335",
        [Math.PI / 2, 0, 0]),
      contactBoxes: [{ position: [lx, 0.11, lz], size: [0.26, 0.22, 1.5] }],
    });
  }
  for (let log = 0; log < 3; log += 1) {
    const lx = 76.28 + log * 0.28;
    sheds.push({
      ...makePiece(`${shedId}:logs:1:${log}`, shedId, "wood", "cylinder",
        [lx, 0.34, 14.62], [0.26, 1.46, 0.26], log % 2 === 0 ? "#67462e" : "#734f33",
        [Math.PI / 2, 0, 0]),
      contactBoxes: [{ position: [lx, 0.34, 14.62], size: [0.26, 0.22, 1.46] }],
    });
  }
  clusters.push(cluster(shedId, "Back-lane sheds", "wood", "mounted", sheds));

  // --- Силуэты за заборами: мир продолжается ------------------------------
  // Верхушки берёз над гаражными крышами и за стройкой — то, что видно из
  // города поверх кромочной застройки.
  const screen: BreakablePieceDefinition[] = [];
  const screenTrees: readonly (readonly ["oak" | "birch" | "pine", number, number, number, number?])[] = [
    ["birch", 84.3, -14.6, 41, 1.25],
    ["pine", 84.2, -29.8, 42, 1.1],
    ["birch", 36.8, -64.9, 43, 1.3],
    ["birch", 10.9, -64.2, 44, 1.2],
    ["pine", 14.2, -67.1, 45],
  ];
  for (const [index, [kind, tx, tz, seed, scale]] of screenTrees.entries()) {
    screen.push(
      ...asPieces("town:rim:screen", `screen:${index}`, propTree(kind, { seed, scale }), [tx, 0, tz]),
    );
  }
  clusters.push(cluster("town:rim:screen", "Treeline beyond the fences", "wood", "mounted", screen));

  return clusters;
}


/**
 * The town's lived-in layer: working clutter in nests (garage row, courtyard,
 * the abandoned shell), dumpsters by the entrances, air conditioners and
 * downpipes growing on the buildings, boarded windows and plaster patches on
 * the shells, heaped soil and gravel, a shop sign, graffiti on the concrete
 * fence and garages, road signs and caution boards. Human marks everywhere —
 * the difference between a model block and a place people use.
 */
function createTownClutter(): BreakableClusterDefinition[] {
  const clusters: BreakableClusterDefinition[] = [];

  const asPieces = (
    clusterId: string,
    prefix: string,
    props: readonly PropPiece[],
    anchor: readonly [number, number, number],
  ): BreakablePieceDefinition[] =>
    placeProp(prefix, props, anchor).map((piece) => ({ ...piece, clusterId }));

  // --- Working clutter nests ----------------------------------------------
  const junk: BreakablePieceDefinition[] = [
    // Garage row frontage: what a row of garages always accretes.
    ...asPieces("town:junk", "garage:tyres", propTyreStack({ count: 3 }), [-11.6, 0, -18.0]),
    ...asPieces("town:junk", "garage:drum:0", propSteelDrum({ color: "#4c6178" }), [-7.7, 0, -18.25]),
    ...asPieces("town:junk", "garage:drum:1", propSteelDrum({ color: "#7a4a35" }), [-7.1, 0, -17.7]),
    ...asPieces("town:junk", "garage:pallet", propPallet({ yaw: 0.35 }), [-4.4, 0, -18.05]),
    ...asPieces("town:junk", "garage:spool", propSpool({ yaw: 1.15 }), [1.9, 0, -18.2]),
    ...asPieces("town:junk", "garage:crate", propCrate({ yaw: 0.2 }), [5.5, 0, -18.3]),
    ...asPieces("town:junk", "garage:planks", propPlankStack({ yaw: 0.15 }), [8.9, 0, -18.6]),
    // Courtyard life by the old house.
    ...asPieces("town:junk", "yard:crate", propCrate({ yaw: 0.5 }), [-3.1, 0, 4.6]),
    ...asPieces("town:junk", "yard:drum", propSteelDrum({ color: "#6e4a38" }), [-2.2, 0, 5.4]),
    ...asPieces("town:junk", "yard:tarp", propTarpPile({ yaw: 1.2 }), [3.6, 0, 4.9]),
    ...asPieces("town:junk", "yard:planks", propPlankStack({ yaw: 1.6, count: 4 }), [4.7, 0, 3.6]),
    ...asPieces("town:junk", "yard:sacks", propSackPile({}), [23.8, 0, 5.6]),
    // The abandoned shell k4 collects the neighbourhood's cast-offs.
    ...asPieces("town:junk", "shell:pallet:0", propPallet({ yaw: 0.2 }), [-6.2, 0, -33.5]),
    ...asPieces("town:junk", "shell:pallet:1", propPallet({ yaw: 0.34 }), [-6.15, 0.19, -33.45]),
    ...asPieces("town:junk", "shell:tyres", propTyreStack({ count: 4 }), [-4.5, 0, -33.8]),
    ...asPieces("town:junk", "shell:drum", propSteelDrum({ color: "#66463a" }), [-8.05, 0, -33.4]),
    ...asPieces("town:junk", "shell:crate", propCrate({ yaw: 1.1 }), [-9.3, 0, -33.95]),
  ];
  clusters.push(cluster("town:junk", "Street and yard clutter", "wood", "mounted", junk));

  // --- Стандартная мебель под открытым небом ------------------------------
  // Каменный стол — под опушечным дубом у кромки мира; верстак — у гаражей,
  // где им и место. Дворовые стулья террасы h1 живут в кластере террасы ниже.
  const outdoorFurniture: BreakablePieceDefinition[] = [
    ...asPieces("town:furniture", "yard:furn:stone-table:grove",
      propStoneTable({ yaw: 0.5 }), [70.6, 0, 16.2]),
    ...asPieces("town:furniture", "yard:furn:trestle-table:garages",
      propTrestleTable({ yaw: 0.15 }), [11.9, 0, -18.45]),
  ];
  clusters.push(cluster("town:furniture", "Outdoor furniture", "wood", "mounted", outdoorFurniture));


  // --- Dumpsters by the entrances -----------------------------------------
  const bins: BreakablePieceDefinition[] = [
    ...asPieces("town:bins", "bin:k1", propDumpster({ yaw: 0.12 }), [18.9, 0, 1.2]),
    ...asPieces("town:bins", "bin:k2", propDumpster({ yaw: -0.08, color: "#5d5a46" }), [24.5, 0, -16.15]),
  ];
  clusters.push(cluster("town:bins", "Courtyard dumpsters", "steel", "mounted", bins));

  // --- Air conditioners on the lived-in blocks ----------------------------
  // Наружный блок собран из деталей: корпус, кольцо вентилятора, рёбра
  // решётки, ржавые кронштейны и дренажная трубка. Позиции — из
  // khrushchevkaAcMounts, общего плана с картой потёков.
  const fixtures: BreakablePieceDefinition[] = [];
  for (const [index, mount] of khrushchevkaAcMounts.entries()) {
    const { x, y, face } = mount;
    const wallFace = mount.z + face * 0.15;
    const bodyZ = wallFace + face * 0.17;
    const frontZ = bodyZ + face * 0.155;
    fixtures.push({
      ...makePiece(`town:ac:${index}`, "town:growth-fixtures", "steel", "steelSheet",
        [x, y, bodyZ], [0.72, 0.5, 0.3], index % 3 === 2 ? "#c9cbc4" : "#dadbd6"),
      sideAttachmentReach: 0.4,
      carriesAttachments: true,
      contactBoxes: [
        { position: [x, y, wallFace + face * 0.2], size: [0.72, 0.5, 0.4] },
      ],
      weathering: 0.45,
    });
    fixtures.push({
      ...makePiece(`town:ac:${index}:fan`, "town:growth-fixtures", "steel", "cylinder",
        [x - 0.13, y, frontZ], [0.3, 0.03, 0.3], "#494f50", [Math.PI / 2, 0, 0]),
      bearsLoad: false,
      sideAttachmentReach: 0.25,
      contactBoxes: [
        { position: [x - 0.13, y, bodyZ], size: [0.32, 0.32, 0.34] },
      ],
    });
    for (const [slat, offsetY] of [-0.14, 0, 0.14].entries()) {
      fixtures.push({
        ...makePiece(`town:ac:${index}:slat:${slat}`, "town:growth-fixtures", "steel", "steelSheet",
          [x + 0.22, y + offsetY, frontZ], [0.24, 0.05, 0.02], "#9ba09c"),
        bearsLoad: false,
        sideAttachmentReach: 0.25,
        contactBoxes: [
          { position: [x + 0.22, y + offsetY, bodyZ], size: [0.26, 0.07, 0.34] },
        ],
      });
    }
    for (const side of [-1, 1] as const) {
      fixtures.push({
        ...makePiece(`town:ac:${index}:bracket:${side}`, "town:growth-fixtures", "steel", "steelSheet",
          [x + side * 0.24, y - 0.31, wallFace + face * 0.14],
          [0.05, 0.12, 0.28], "#7a6a55"),
        bearsLoad: false,
        sideAttachmentReach: 0.3,
        weathering: 0.6,
        contactBoxes: [
          {
            position: [x + side * 0.24, y - 0.31, wallFace + face * 0.1],
            size: [0.05, 0.12, 0.3],
          },
        ],
      });
    }
    fixtures.push({
      ...makePiece(`town:ac:${index}:pipe`, "town:growth-fixtures", "steel", "steelSheet",
        [x + 0.3, y - 0.14, wallFace + face * 0.05], [0.045, 0.7, 0.045],
        "#c4c6c0"),
      bearsLoad: false,
      sideAttachmentReach: 0.3,
      weathering: 0.35,
      contactBoxes: [
        { position: [x + 0.3, y - 0.14, wallFace], size: [0.06, 0.7, 0.14] },
      ],
    });
  }

  // --- Gutters and downpipes on the three old houses ----------------------
  const houses: readonly (readonly [string, number, number])[] = [
    ["h1", 0, 0],
    ["h2", 56, 0],
    ["h3", 56, -38],
  ];
  for (const [houseId, hx, hz] of houses) {
    // Жёлоб и трубы вынесены за плоскость фронтона и угловые стойки
    // фахверка — навесное железо висит НА доме, а не внутри его балок.
    fixtures.push({
      ...makePiece(`town:gutter:${houseId}`, "town:growth-fixtures", "steel", "steelSheet",
        [hx, 5.24, hz + 1.28], [8.5, 0.14, 0.14], "#868b88"),
      bearsLoad: false,
      sideAttachmentReach: 0.6,
      contactBoxes: [{ position: [hx, 5.32, hz + 0.95], size: [8.5, 0.14, 0.5] }],
    });
    // Downpipes in short segments: each attaches to the wall course beside it
    // (the solver only lets a wall carry pieces shorter than itself).
    for (const side of [-1, 1] as const) {
      for (let segment = 0; segment < 5; segment += 1) {
        fixtures.push({
          ...makePiece(`town:downpipe:${houseId}:${side}:${segment}`, "town:growth-fixtures", "steel", "cylinder",
            [hx + side * 4.48, 0.66 + segment * 1.02, hz + 0.95], [0.13, 1.02, 0.13], "#7f8481"),
          bearsLoad: false,
          sideAttachmentReach: 0.55,
          contactBoxes: [{ position: [hx + side * 4.48, 0.66 + segment * 1.02, hz + 0.95], size: [0.5, 1.02, 0.5] }],
          weathering: 0.35,
        });
      }
    }
  }
  clusters.push(cluster("town:growth-fixtures", "Building fixtures grown over time", "steel", "mounted", fixtures));

  // --- Boarded windows and plaster patches on the shells ------------------
  const patches: BreakablePieceDefinition[] = [];
  for (const [index, [px, py, pz, tone]] of (
    [
      [-5.6, 1.05, -25.07, "#8a5a43"],
      [2.2, 1.2, -25.07, "#7f5340"],
      [6.4, 0.95, -25.07, "#93604a"],
    ] as const
  ).entries()) {
    patches.push({
      ...makePiece(`town:patch:${index}`, "town:patches", "brick", "panel",
        [px, py, pz], [1.5, 1.1, 0.06], tone),
      bearsLoad: false,
      sideAttachmentReach: 0.4,
      weathering: 0.45,
    });
  }
  clusters.push(cluster("town:patches", "Boarded windows and wall patches", "wood", "mounted", patches));

  // --- Heaped soil, gravel and sand ---------------------------------------
  const heaps: BreakablePieceDefinition[] = [];
  const heap = (
    name: string,
    x: number,
    z: number,
    material: BreakableMaterial,
    base: string,
    top: string,
    spread: number,
  ): void => {
    heaps.push({
      ...makePiece(`town:heap:${name}:base`, "town:heaps", material, "stoneBlock",
        [x, 0.26, z], [spread, 0.55, spread * 0.72], base, [0, x * 0.7, 0]),
      weathering: 0.25,
    });
    heaps.push({
      ...makePiece(`town:heap:${name}:top`, "town:heaps", material, "stoneBlock",
        [x + 0.1, 0.68, z - 0.06], [spread * 0.62, 0.42, spread * 0.45], top, [0, x * 0.7 + 0.5, 0]),
    });
  };
  heap("construction", 32, -32.6, "earth", "#5f4c36", "#6a563e", 2.9);
  heap("gravel", -13.4, -21.4, "stone", "#7d7f7b", "#8a8c86", 2.2);
  heap("sand", 21.5, 8.3, "soil", "#c2a878", "#cdb384", 2.0);
  // Loose bricks shed beside the construction heap.
  for (let index = 0; index < 5; index += 1) {
    heaps.push({
      ...makePiece(`town:heap:brick:${index}`, "town:heaps", "brick", "brick",
        [30.4 + (index % 3) * 0.5, 0.12, -31.2 + Math.floor(index / 3) * 0.45],
        [0.42, 0.2, 0.24], index % 2 === 0 ? "#9f3e29" : "#853523",
        [0, index * 0.6, 0]),
    });
  }
  clusters.push(cluster("town:heaps", "Heaped soil and materials", "earth", "mounted", heaps));

  // --- Courtyard and verge trees (composite flora core) -------------------
  const treePieces: BreakablePieceDefinition[] = [];
  // Дерево — это место, а не заполнитель зазора: дворовое дерево держит
  // центр двора, берёза у двери — палисадник, дубы на опушке отмечают край
  // квартала. Запрещённый паттерн — ствол в углу «дом + устье дороги».
  const trees: readonly (readonly ["oak" | "birch" | "pine", number, number, number, number?])[] = [
    ["oak", 8.2, 4.2, 5, 1.05],
    ["birch", 29.8, 2.6, 3],
    ["birch", 12.9, 2.4, 4],
    // Дворовой дуб общего двора h2/k6 — тень над тропой жителей к площадке.
    ["oak", 53.5, 10.2, 6],
    ["birch", 60.6, 4.2, 5],
    // Опушечный дуб восточнее площадки, у кромки мира — раньше стоял прямо
    // в горке.
    ["oak", 72.8, 12.8, 7, 0.9],
    ["pine", -14.0, -24.5, 5, 1.1],
    ["pine", -13.5, -28.8, 6],
    ["birch", -13.8, -36.5, 6],
    // Задний двор h3: раньше дуб был зажат между её углом и поперечной
    // улицей.
    ["oak", 56.8, -48.4, 8],
  ];
  for (const [index, [kind, tx, tz, seed, scale]] of trees.entries()) {
    // Городские дворы знают полусухие деревья: часть крон (по сиду) несёт
    // усохшие рыжие ветви — как тополь у площадки, который сохнет годами.
    treePieces.push(
      ...asPieces("town:trees", `tree:${index}`, propTree(kind, { seed, scale, dry: true }), [tx, 0, tz]),
    );
  }
  clusters.push(cluster("town:trees", "Courtyard trees", "wood", "mounted", treePieces));

  // --- The block's STORY: the heating main to k5 is dug open --------------
  // Spoil berms flank the cut, big steel pipes wait beside it, planks bridge
  // the trench, a spool and tarp sit by the works — a job mid-way, not decor.
  const works: BreakablePieceDefinition[] = [];
  for (const [index, bz] of [-32.3, -34.1].entries()) {
    for (let seg = 0; seg < 4; seg += 1) {
      const bx = 21.5 + seg * 1.9;
      works.push({
        ...makePiece(`town:works:spoil:${index}:${seg}`, "town:works", "earth", "stoneBlock",
          [bx, 0.26, bz + (seg % 2) * 0.18], [2.0, 0.55, 0.85], seg % 2 === 0 ? "#5b4834" : "#63503a",
          [0, (seg * 0.7 + index) % 1.2, 0]),
        contactBoxes: [{ position: [bx, 0.26, bz + (seg % 2) * 0.18], size: [1.2, 0.55, 0.85] }],
        weathering: 0.3,
      });
    }
  }
  for (let pipe = 0; pipe < 3; pipe += 1) {
    const px = 22.5 + pipe * 0.05;
    const py = pipe === 2 ? 0.86 : 0.29;
    const pz = pipe === 2 ? -35.35 : -35.1 - pipe * 0.52;
    works.push({
      ...makePiece(`town:works:pipe:${pipe}`, "town:works", "steel", "cylinder",
        [px, py, pz], [0.58, 3.8, 0.58], pipe === 1 ? "#6e6f66" : "#75766c",
        [0, 0, Math.PI / 2]),
      contactBoxes: [{ position: [px, py, pz], size: [3.8, 0.58, 0.58] }],
      weathering: 0.35,
    });
  }
  for (const [plank, px] of [21.5, 23.4, 25.3].entries()) {
    works.push({
      ...makePiece(`town:works:bridge:${plank}`, "town:works", "wood", "plank",
        [px, 0.6, -33.2], [0.42, 0.07, 3.0], plank % 2 === 0 ? "#9a7a50" : "#8a6a42"),
      contactBoxes: [{ position: [px, 0.6, -33.2], size: [0.42, 0.07, 3.0] }],
    });
  }
  works.push(
    ...asPieces("town:works", "works:spool", propSpool({ yaw: 0.4 }), [19.4, 0, -33.3]),
    ...asPieces("town:works", "works:tarp", propTarpPile({ yaw: 1.9, color: "#4e5a68" }), [28.6, 0, -33.0]),
    ...asPieces("town:works", "works:caution", propCautionBoard({ yaw: 1.55, width: 1.4 }), [20.2, 0, -31.6]),
  );
  clusters.push(cluster("town:works", "Opened heating main", "earth", "mounted", works));

  // --- Human marks: sign, graffiti, road signs, caution boards ------------
  const marks: BreakablePieceDefinition[] = [];
  // A shop signboard over the h2 door.
  marks.push({
    ...makePiece("town:sign:h2:board", "town:marks", "wood", "panel",
      [56, 3.4, 0.9], [3.3, 0.72, 0.09], "#7d2f26"),
    bearsLoad: false,
    sideAttachmentReach: 0.45,
  });
  for (let letter = 0; letter < 6; letter += 1) {
    marks.push({
      ...makePiece(`town:sign:h2:letter:${letter}`, "town:marks", "wood", "panel",
        [54.9 + letter * 0.46, 3.4, 0.97], [0.3, 0.4, 0.03], "#e8ded0"),
      bearsLoad: false,
      sideAttachmentReach: 0.3,
    });
  }
  // Graffiti colour tags on the concrete fence (street side) and garage backs.
  const tags: readonly (readonly [number, number, number, number, string, number])[] = [
    [-9.2, 0.95, -26.38, 1.3, "#bf4936", -0.06],
    [-7.4, 0.8, -26.38, 0.9, "#3a7ac0", 0.08],
    [-4.9, 1.05, -26.38, 1.5, "#c0a13a", 0.04],
    [-1.1, 0.85, -26.38, 1.1, "#58b06a", -0.09],
    [1.6, 1.0, -26.38, 0.8, "#b45db0", 0.06],
    [-7.9, 1.0, -25.06, 1.6, "#c05a2e", 0.05],
    [-1.4, 0.9, -25.06, 1.2, "#4a86b8", -0.07],
    [4.3, 1.05, -25.06, 1.4, "#bcae4a", 0.08],
  ];
  for (const [index, [tx, ty, tz, width, color, tilt]] of tags.entries()) {
    marks.push({
      ...makePiece(`town:graffiti:${index}`, "town:marks", "concrete", "panel",
        [tx, ty, tz], [width, 0.55, 0.03], color, [0, 0, tilt]),
      bearsLoad: false,
      sideAttachmentReach: 0.35,
    });
  }
  // Road signs at the junction.
  const roadSign = (
    name: string,
    x: number,
    z: number,
    plateColor: string,
    diamond: boolean,
  ): void => {
    marks.push({
      ...makePiece(`town:roadsign:${name}:pole`, "town:marks", "steel", "steelSheet",
        [x, 1.3, z], [0.09, 2.6, 0.09], "#6a716e"),
      carriesAttachments: true,
    });
    marks.push({
      ...makePiece(`town:roadsign:${name}:plate`, "town:marks", "steel", "steelSheet",
        [x, 2.42, z], [0.56, 0.56, 0.05], plateColor, diamond ? [0, 0, Math.PI / 4] : undefined),
      carriesAttachments: true,
      sideAttachmentReach: 0.3,
    });
    marks.push({
      ...makePiece(`town:roadsign:${name}:mark`, "town:marks", "steel", "steelSheet",
        [x, 2.42, z + 0.04], [0.3, 0.3, 0.02], "#e8e6df", diamond ? [0, 0, Math.PI / 4] : undefined),
      bearsLoad: false,
      sideAttachmentReach: 0.2,
    });
  };
  roadSign("crosswalk", 36.4, -7.2, "#2b5fa8", false);
  roadSign("priority", 47.4, -16.9, "#d8b13a", true);
  clusters.push(cluster("town:marks", "Signs, graffiti and road marks", "steel", "mounted", marks));

  // --- Caution boards at the work sites ------------------------------------
  const caution: BreakablePieceDefinition[] = [
    ...asPieces("town:caution", "caution:construction", propCautionBoard({ yaw: 0.3 }), [29.6, 0, -32.0]),
    ...asPieces("town:caution", "caution:gravel", propCautionBoard({ yaw: 1.25, width: 1.3 }), [-12.4, 0, -20.2]),
  ];
  clusters.push(cluster("town:caution", "Caution boards", "wood", "mounted", caution));

  return clusters;
}

export const breakableClusters = [
  ...createGroundTiles(),
  ...createOutskirts(),
  ...createEdgewood(),
  ...createMeadowGroves(),
  ...createRimHedgerow(),
  ...createRimClosure(),
  // Первый дом развёрнут дверью к главной улице — из спавна за его спиной
  // виден задний двор с террасой, а вход смотрит на дорогу.
  ...mirrorClustersZ(createOldHouse(), -3),
  ...createOldHouse("h2", 56, 0, houseRecolor(silicateHouseColors, "lit-h2")),
  ...createOldHouse("h3", 56, -38, houseRecolor(yellowHouseColors, "lit-h3")),
  createTerrace(),
  createYardChairs(),
  createStoneGazebo(),
  ...createKhrushchevka(),
  ...createKhrushchevka({
    prefix: "k2",
    dz: -16,
    palette: ["#bfc4a4", "#b4b999", "#c9ceae", "#b9be9e"],
  }),
  ...createKhrushchevka({
    prefix: "k3",
    dx: 36,
    dz: -16,
    palette: ["#bcbfae", "#b1b4a3", "#c6c9b8", "#b6b9a8"],
    shellOnly: true,
    includeLamps: false,
  }),
  ...createKhrushchevka({
    prefix: "k4",
    dx: -24,
    dz: -34,
    palette: ["#cfb5a2", "#c4aa97", "#d9bfac", "#c9af9c"],
    shellOnly: true,
    includeLamps: false,
  }),
  ...createKhrushchevka({
    prefix: "k5",
    dx: 2,
    dz: -34,
    palette: ["#dad4c2", "#cfc9b7", "#e4decc", "#d4cebc"],
    shellOnly: true,
    includeLamps: false,
  }),
  // k6 отодвинута на север (dz 24): между задним двором h2 и её фасадом —
  // полноценный двор с площадкой, а не 11-метровая щель. Дальше нельзя:
  // северо-восточный угол дома упрётся в кромку круглого мира (r = 57).
  ...createKhrushchevka({
    prefix: "k6",
    dx: 36,
    dz: 24,
    palette: ["#d3c493", "#c8b988", "#ddce9d", "#cdbe8d"],
    shellOnly: true,
    includeLamps: false,
  }),
  ...createStreets(),
  createGarages(),
  createConcreteFence(),
  createPlayground("playground:0", 21, 3.8),
  createPlayground("playground:1", 65, 7),
  createTownLamps(),
  ...createTownClutter(),
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
  cloth: {
    density: materialRuntimeProfiles.cloth.density,
    compressionStrength: 3,
    cantilever: 0.12,
    maximumVerticalGap: 0.28,
    bearsLoad: false,
    carriesAttachments: false,
    sideAttachmentReach: 0.42,
  },
  plaster: {
    density: materialRuntimeProfiles.plaster.density,
    compressionStrength: 40,
    cantilever: 0.3,
    maximumVerticalGap: 0.2,
    sideAttachmentReach: 0.34,
  },
  plastic: {
    density: materialRuntimeProfiles.plastic.density,
    compressionStrength: 30,
    cantilever: 0.36,
    maximumVerticalGap: 0.2,
    carriesAttachments: true,
    sideAttachmentReach: 0.36,
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
    carriesAttachments: true,
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
  /** Начальный поворот взгляда (радианы вокруг Y); 0 — взгляд вдоль -Z. */
  readonly playerSpawnYaw?: number;
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
  readonly playerSpawnYaw?: number;
  readonly cameraFar?: number;
  readonly worldCenter: readonly [x: number, z: number];
  readonly worldHalfExtents: readonly [x: number, z: number];
  readonly worldRadius?: number;
  readonly safetyFloorY?: number;
  readonly copy: DestructionSceneCopy;
  readonly clusters: readonly BreakableClusterDefinition[];
  readonly lamps?: readonly LampDefinition[];
  /**
   * Trim deep sibling interpenetration at build time (rim rings, faceted brick
   * towers, cairns) so overlaps butt cleanly — killing z-fighting and the
   * break-time shove — while every piece stays separately destructible.
   */
  readonly resolveInterpenetration?: boolean;
}

export function createDestructionScene(
  options: DestructionSceneOptions,
): DestructionSceneDefinition {
  const clusters = options.resolveInterpenetration
    ? deinterpenetrateClusters(options.clusters, (candidate) =>
        createStructuralSolver(
          candidate.flatMap((currentCluster) => currentCluster.pieces),
          structuralMaterialProfiles,
        ).resolve(new Set()),
      )
    : options.clusters;
  const pieces = clusters.flatMap((currentCluster) => currentCluster.pieces);
  const pieceById = new Map(pieces.map((piece) => [piece.id, piece]));
  const clusterById = new Map(
    clusters.map((currentCluster) => [currentCluster.id, currentCluster]),
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
    playerSpawnYaw: options.playerSpawnYaw,
    cameraFar: options.cameraFar ?? 140,
    worldCenter: options.worldCenter,
    worldHalfExtents: options.worldHalfExtents,
    worldRadius: options.worldRadius,
    safetyFloorY: options.safetyFloorY ?? -2.2,
    copy: options.copy,
    breakableClusters: clusters,
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

// Опции городской сцены экспортируются отдельно: модуль townScene доливает
// в этот же город квартал, скомпилированный из городских префабов, не
// создавая циклического импорта (cityPrefabs зависит от этого файла).
export const openHouseSceneOptions = {
  id: "open-house",
  title: "Make a Mess",
  environment: "town",
  // Спавн на протоптанной тропе за старым домом, лицом в глубину квартала:
  // первый кадр — калитка, ива и оба дома частного сектора.
  // Спавн во дворе чуть левее (западнее) первого дома, на хозяйской тропке
  // к сараю: прямо перед игроком — крыльцо-терраса со стульями и задняя
  // дверь по центру дома.
  playerSpawn: [-5.2, 1.25, 6.8],
  playerSpawnYaw: -0.71,
  worldCenter: [30, -15],
  worldHalfExtents: [62, 62],
  worldRadius: 60,
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
} as const satisfies Parameters<typeof createDestructionScene>[0];

export const openHouseScene = createDestructionScene(openHouseSceneOptions);

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
