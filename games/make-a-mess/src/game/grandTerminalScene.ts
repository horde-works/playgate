import {
  clearPassengerGlassColor,
  createDestructionScene,
  departureSignalColor,
  informationDisplayColor,
  litWindowColor,
  mooringSignalColor,
  type BreakableClusterDefinition,
  type BreakableMaterial,
  type BreakablePieceDefinition,
  type BreakableShape,
  type LampDefinition,
  type LampEventLightingDefinition,
  type MutableSceneObjectDefinition,
  type SceneVector3,
  type SpotLightDefinition,
  type SupportMode,
} from "./destructionScene.ts";
import { propTree } from "../content/prefabs/coreFlora.ts";
import { placeProp } from "../content/prefabs/coreProps.ts";
import type { MotionInstrumentDefinition } from "./motionTelemetry.ts";

const clusters: BreakableClusterDefinition[] = [];
const lamps: LampDefinition[] = [];
const spotLights: SpotLightDefinition[] = [];
const mutableObjects: MutableSceneObjectDefinition[] = [];
const motionInstruments: MotionInstrumentDefinition[] = [];

const WORLD_CENTER_Z = -14;
const WORLD_RADIUS = 98;
// Both public routes stay within 193 m of the scene centre. The containment
// wall leaves room for the full 29 m craft and a useful free-flight margin;
// the sky leaves another 60 m beyond the wall. The far plane must see the
// opposite side of that off-centre dome while the camera rides the route.
const ROUTE_BOUNDARY_RADIUS = 240;
const ROUTE_SKY_RADIUS = 300;
const ROUTE_CAMERA_FAR = 560;
const FLOOR_Y = 0.18;
const FRONT_Z = 34;
const REAR_Z = 8;
const SHED_END_Z = -72;
const STATION_LOCAL_LIGHT_CAPACITY = 8;
const SKY_TRAIN_CLUSTER_ID = "terminal:sky-train";

const brickRed = "#8f3f2f";
const brickDark = "#6f3028";
const limestone = "#c1b7a2";
const limestoneDark = "#918a7b";
const iron = "#283033";
const ironLight = "#4b5558";
const instrumentSteel = "#81898a";
const brass = "#b58a3a";
const oak = "#684329";
const oakDark = "#3d281d";
const carriageGreen = "#294c3d";
const carriageCream = "#d1c39d";
const glassBlue = "#8fb8c0";

interface ZoneBuilder {
  readonly id: string;
  readonly pieces: BreakablePieceDefinition[];
  add(
    suffix: string,
    material: BreakableMaterial,
    shape: BreakableShape,
    position: SceneVector3,
    size: SceneVector3,
    color: string,
    rotation?: SceneVector3,
    contactSize?: SceneVector3,
  ): void;
}

function zone(id: string): ZoneBuilder {
  return {
    id,
    pieces: [],
    add(suffix, material, shape, position, size, color, rotation, contactSize) {
      this.pieces.push({
        id: `${id}:${suffix}`,
        clusterId: id,
        material,
        shape,
        position,
        size,
        color,
        rotation,
        contactBoxes: contactSize ? [{ position, size: contactSize }] : undefined,
      });
    },
  };
}

function finish(
  builder: ZoneBuilder,
  label: string,
  material: BreakableMaterial,
  supportMode: SupportMode,
): void {
  clusters.push({
    id: builder.id,
    label,
    material,
    supportMode,
    pieces: builder.pieces,
  });
}

function seededNoise(x: number, z: number, salt = 0): number {
  const value = Math.sin(x * 83.17 + z * 53.81 + salt * 17.33) * 43758.5453;
  return value - Math.floor(value);
}

function rotateXZ(x: number, z: number, yaw: number): readonly [number, number] {
  const cosine = Math.cos(yaw);
  const sine = Math.sin(yaw);
  return [x * cosine - z * sine, x * sine + z * cosine];
}

function rotatedContactSize(size: SceneVector3, yaw: number): SceneVector3 {
  const cosine = Math.abs(Math.cos(yaw));
  const sine = Math.abs(Math.sin(yaw));
  return [
    size[0] * cosine + size[2] * sine,
    size[1],
    size[0] * sine + size[2] * cosine,
  ];
}

function rotatedZContactSize(size: SceneVector3, angle: number): SceneVector3 {
  const cosine = Math.abs(Math.cos(angle));
  const sine = Math.abs(Math.sin(angle));
  return [
    size[0] * cosine + size[1] * sine,
    size[0] * sine + size[1] * cosine,
    size[2],
  ];
}

function rotatedZEndpointContacts(
  position: SceneVector3,
  size: SceneVector3,
  angle: number,
  jointWidth = 1,
): readonly { readonly position: SceneVector3; readonly size: SceneVector3 }[] {
  const half = size[0] / 2;
  const dx = Math.cos(angle) * half;
  const dy = Math.sin(angle) * half;
  return ([-1, 1] as const).map((side) => ({
    position: [
      position[0] + side * dx,
      position[1] + side * dy,
      position[2],
    ],
    size: [jointWidth, 0.1, size[2] * 0.97],
  }));
}

function addBench(
  builder: ZoneBuilder,
  prefix: string,
  x: number,
  y: number,
  z: number,
  yaw = 0,
  width = 2.65,
): void {
  for (const [index, localX] of [-width * 0.36, width * 0.36].entries()) {
    const [dx, dz] = rotateXZ(localX, 0, yaw);
    builder.add(
      `${prefix}:leg:${index}`,
      "steel",
      "steelSheet",
      [x + dx, y + 0.34, z + dz],
      [0.16, 0.68, 0.4],
      iron,
      [0, yaw, 0],
    );
  }
  const seatSize: SceneVector3 = [width, 0.16, 0.58];
  const backSize: SceneVector3 = [width, 0.75, 0.13];
  builder.add(
    `${prefix}:seat`,
    "wood",
    "plank",
    [x, y + 0.7, z],
    seatSize,
    oak,
    [0, yaw, 0],
    rotatedContactSize(seatSize, yaw),
  );
  const [backDx, backDz] = rotateXZ(0, 0.27, yaw);
  builder.add(
    `${prefix}:back`,
    "wood",
    "plank",
    [x + backDx, y + 1.05, z + backDz],
    backSize,
    oakDark,
    [0, yaw, 0],
    rotatedContactSize(backSize, yaw),
  );
}

function addCrate(
  builder: ZoneBuilder,
  prefix: string,
  x: number,
  y: number,
  z: number,
  size = 1,
  yaw = 0,
): void {
  const height = size * 0.82;
  const wall = 0.13;
  builder.add(`${prefix}:base`, "wood", "plank", [x, y + wall / 2, z], [size, wall, size], oakDark, [0, yaw, 0]);
  for (const [index, localZ] of [-size / 2 + wall / 2, size / 2 - wall / 2].entries()) {
    const [dx, dz] = rotateXZ(0, localZ, yaw);
    builder.add(`${prefix}:side-z:${index}`, "wood", "plank", [x + dx, y + height / 2, z + dz], [size, height, wall], index === 0 ? oak : oakDark, [0, yaw, 0]);
  }
  for (const [index, localX] of [-size / 2 + wall / 2, size / 2 - wall / 2].entries()) {
    const [dx, dz] = rotateXZ(localX, 0, yaw);
    builder.add(`${prefix}:side-x:${index}`, "wood", "plank", [x + dx, y + height / 2, z + dz], [wall, height, size - wall * 2], index === 0 ? oakDark : oak, [0, yaw, 0]);
  }
}

function addLampFixture(
  builder: ZoneBuilder,
  prefix: string,
  position: SceneVector3,
  distance = 10,
  intensity = 3.1,
): void {
  const [x, y, z] = position;
  builder.add(`${prefix}:stem`, "steel", "steelSheet", [x, y + 0.45, z], [0.18, 1.1, 0.18], iron);
  builder.add(`${prefix}:shade`, "steel", "steelSheet", [x, y - 0.03, z], [0.78, 0.14, 0.78], ironLight);
  builder.add(`${prefix}:glow`, "glass", "glassPane", [x, y - 0.15, z], [0.42, 0.34, 0.42], litWindowColor);
  lamps.push({
    id: `${builder.id}:${prefix}:glow`,
    position: [x, y - 0.12, z],
    color: "#ffd49a",
    distance,
    intensity,
  });
}

type FacetAxis = "x" | "y" | "z";

const FACET_PROFILE_WIDE = [
  { offset: -0.4, thickness: 0.2, width: 0.6 },
  { offset: -0.2, thickness: 0.2, width: 0.917 },
  { offset: 0, thickness: 0.2, width: 1 },
  { offset: 0.2, thickness: 0.2, width: 0.917 },
  { offset: 0.4, thickness: 0.2, width: 0.6 },
] as const;
const FACET_PROFILE_STANDARD = [
  { offset: -0.37, thickness: 0.26, width: 0.68 },
  { offset: 0, thickness: 0.48, width: 1 },
  { offset: 0.37, thickness: 0.26, width: 0.68 },
] as const;
const FACET_PROFILE_SINGLE = [{ offset: 0, thickness: 1, width: 1 }] as const;

// Voxel-friendly stand-in for anything round, in the spirit of angular
// angular wheels: parallel slabs form a stepped octagonal silhouette. Every
// slab is an ordinary box, so a hit carves the same cubic debris as the rest
// of the world instead of a special cylinder fracture that reads as slices.
function addFacetedCylinder(
  builder: ZoneBuilder,
  prefix: string,
  material: BreakableMaterial,
  shape: BreakableShape,
  axis: FacetAxis,
  position: SceneVector3,
  length: number,
  diameter: number,
  color: string,
  centreFacetOptions: Pick<BreakablePieceDefinition, "actuator"> = {},
): void {
  const profile =
    diameter >= 2
      ? FACET_PROFILE_WIDE
      : diameter >= 0.5
        ? FACET_PROFILE_STANDARD
        : FACET_PROFILE_SINGLE;
  const long = axis === "x" ? 0 : axis === "y" ? 1 : 2;
  // Columns step across X; lying pieces step across Y so the slabs stack.
  const step = axis === "y" ? 0 : 1;
  const cross = (3 - long - step) as 0 | 1 | 2;
  for (const [index, slab] of profile.entries()) {
    const slabPosition: [number, number, number] = [...position];
    slabPosition[step] += diameter * slab.offset;
    const size: [number, number, number] = [0, 0, 0];
    size[long] = length;
    size[step] = diameter * slab.thickness;
    size[cross] = diameter * slab.width;
    builder.pieces.push({
      id: `${builder.id}:${prefix}:facet:${index}`,
      clusterId: builder.id,
      material,
      shape,
      position: slabPosition,
      size,
      color,
      actuator: slab.offset === 0
        ? centreFacetOptions.actuator
        : undefined,
    });
  }
}

// Stepped gable cap that closes the crescent gap where a rectangular wall
// meets a curved roof. Instead of leaving a hole (or bending a bespoke mesh),
// a short stack of ever-narrower boxes traces the roof's ellipse — each box
// is ordinary voxel-breakable geometry. This is the house pattern for filling
// the unavoidable gaps between straight walls and round roofs on every map.
function addFacetedGable(
  builder: ZoneBuilder,
  prefix: string,
  material: BreakableMaterial,
  shape: BreakableShape,
  center: SceneVector3,
  halfWidth: number,
  rise: number,
  depth: number,
  color: string,
  steps = 4,
): void {
  const [x, baseY, z] = center;
  const thickness = (rise / steps) * 1.2;
  for (let step = 0; step < steps; step += 1) {
    const frac = (step + 0.5) / steps;
    const height = frac * rise;
    const width = 2 * halfWidth * Math.sqrt(Math.max(0, 1 - frac * frac));
    if (width < 0.12) {
      continue;
    }
    builder.add(
      `${prefix}:course:${step}`,
      material,
      shape,
      [x, baseY + height, z],
      [width, thickness, depth],
      color,
    );
  }
}

// Wall-bracket lantern: an iron arm reaching out of the masonry with a
// glowing glass lantern standing on its end. The glass block is the light
// source — smash it and this doorway goes dark.
function addWallLantern(
  builder: ZoneBuilder,
  prefix: string,
  wall: SceneVector3,
  direction: readonly [number, number],
  distance = 10,
  intensity = 2.9,
): void {
  const [x, y, z] = wall;
  const [dx, dz] = direction;
  const armLength = 0.64;
  const armSize: SceneVector3 =
    dx === 0 ? [0.16, 0.16, armLength] : [armLength, 0.16, 0.16];
  const lanternX = x + dx * (armLength - 0.17);
  const lanternZ = z + dz * (armLength - 0.17);
  builder.add(
    `${prefix}:arm`,
    "steel",
    "steelSheet",
    [x + dx * (armLength / 2 - 0.02), y, z + dz * (armLength / 2 - 0.02)],
    armSize,
    iron,
  );
  builder.add(`${prefix}:glass`, "glass", "glassPane", [lanternX, y + 0.29, lanternZ], [0.3, 0.42, 0.3], litWindowColor);
  builder.add(`${prefix}:cap`, "steel", "steelSheet", [lanternX, y + 0.55, lanternZ], [0.38, 0.1, 0.38], iron);
  lamps.push({
    id: `${builder.id}:${prefix}:glass`,
    position: [lanternX, y + 0.29, lanternZ],
    color: "#ffd9a4",
    distance,
    intensity,
  });
}

function addSegmentedArch(
  builder: ZoneBuilder,
  prefix: string,
  centerX: number,
  baseY: number,
  z: number,
  radiusX: number,
  radiusY: number,
  depth: number,
  material: BreakableMaterial,
  shape: BreakableShape,
  color: string,
  segments = 11,
  thickness = 0.48,
): void {
  const step = Math.PI / segments;
  for (let index = 0; index < segments; index += 1) {
    const startAngle = step * index;
    const endAngle = step * (index + 1);
    const angle = (startAngle + endAngle) / 2;
    const x = centerX + Math.cos(angle) * radiusX;
    const y = baseY + Math.sin(angle) * radiusY;
    const dx = -Math.sin(angle) * radiusX;
    const dy = Math.cos(angle) * radiusY;
    const tangent = Math.atan2(dy, dx);
    const arcLength = Math.hypot(dx, dy) * step * 1.08;
    const size: SceneVector3 = [arcLength, thickness, depth];
    const startX = centerX + Math.cos(startAngle) * radiusX;
    const startY = baseY + Math.sin(startAngle) * radiusY;
    const endX = centerX + Math.cos(endAngle) * radiusX;
    const endY = baseY + Math.sin(endAngle) * radiusY;
    builder.pieces.push({
      id: `${builder.id}:${prefix}:${index}`,
      clusterId: builder.id,
      material,
      shape,
      position: [x, y, z],
      size,
      color,
      rotation: [0, 0, tangent],
      contactBoxes: [{
        position: [(startX + endX) / 2, (startY + endY) / 2, z],
        size: [Math.abs(endX - startX) + 1.35, Math.abs(endY - startY) + 0.02, depth * 0.94],
      }],
    });
  }
}

export const terminalPixelFont: Readonly<Record<string, readonly string[]>> = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01110", "10001", "10000", "10111", "10001", "10001", "01110"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  "0": ["01110", "10011", "10101", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
};

function addPixelText(
  builder: ZoneBuilder,
  prefix: string,
  text: string,
  centerX: number,
  centerY: number,
  z: number,
  pixel = 0.22,
  color = brass,
  /**
   * Куда смотрит лицевая сторона вывески по оси Z: -1 — на -z (её читают,
   * глядя на +z), +1 — на +z. Раскладка глифов зависит от этого, и булев
   * «mirrored» тут уже дважды приводил к зеркальным надписям — направление
   * лица куска задавать честнее, чем помнить, кто на кого смотрит.
   */
  facing: -1 | 1 = 1,
  emissive = false,
): readonly string[] {
  // Emissive glyphs are lit-glass cells: pale in daylight, self-lit at night
  // (the shared glow material ramps their emissive up after dusk), so a sign
  // reads as a back-lit split-flap board without any extra light source.
  const glyphMaterial: BreakableMaterial = emissive ? "glass" : "steel";
  const glyphShape: BreakableShape = emissive ? "glassPane" : "steelSheet";
  const glyphColor = emissive ? litWindowColor : color;
  const glyphWidth = pixel * 6;
  const totalWidth = Math.max(0, text.length * glyphWidth - pixel);
  let pieceIndex = 0;
  const pieceIds: string[] = [];
  [...text.toUpperCase()].forEach((character, characterIndex) => {
    const rows = terminalPixelFont[character];
    if (!rows) {
      return;
    }
    rows.forEach((row, rowIndex) => {
      [...row].forEach((cell, columnIndex) => {
        if (cell !== "1") {
          return;
        }
        // Глифы кладём слева направо для того, кто смотрит вдоль -z. Вывеска,
        // повёрнутая лицом на -z, читается с другой стороны — её раскладку
        // надо зеркалить.
        const mirrored = facing < 0;
        const along = characterIndex * glyphWidth + columnIndex * pixel;
        builder.add(
          `${prefix}:${pieceIndex}`,
          glyphMaterial,
          glyphShape,
          [
            mirrored
              ? centerX + totalWidth / 2 - along
              : centerX - totalWidth / 2 + along,
            centerY + (3 - rowIndex) * pixel,
            z,
          ],
          [pixel * 0.82, pixel * 0.82, 0.11],
          glyphColor,
        );
        pieceIds.push(`${builder.id}:${prefix}:${pieceIndex}`);
        pieceIndex += 1;
      });
    });
  });
  return pieceIds;
}

interface PixelLampMatrix {
  readonly cellPieceIds: readonly string[];
  activePieceIds(text: string): readonly string[];
}

/**
 * A real lamp matrix: every address has one dark socket and one reusable
 * luminous lens. Captions are only electrical masks over those same lenses.
 */
function addPixelLampMatrix(
  builder: ZoneBuilder,
  prefix: string,
  characterSlots: number,
  centerX: number,
  centerY: number,
  z: number,
  pixel: number,
  facing: -1 | 1 = 1,
): PixelLampMatrix {
  const columns = characterSlots * 6 - 1;
  const width = (columns - 1) * pixel;
  const cells: string[][] = Array.from({ length: 7 }, () => []);
  const cellPieceIds: string[] = [];
  for (let row = 0; row < 7; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x = facing < 0
        ? centerX + width / 2 - column * pixel
        : centerX - width / 2 + column * pixel;
      const y = centerY + (3 - row) * pixel;
      builder.add(
        `${prefix}:socket:${row}:${column}`,
        "steel",
        "steelSheet",
        [x, y, z],
        [pixel * 0.72, pixel * 0.72, 0.045],
        "#171b1d",
      );
      const glowId = `${builder.id}:${prefix}:cell:${row}:${column}`;
      builder.add(
        `${prefix}:cell:${row}:${column}`,
        "glass",
        "glassPane",
        [x, y, z + facing * 0.045],
        [pixel * 0.58, pixel * 0.58, 0.035],
        informationDisplayColor,
      );
      cells[row][column] = glowId;
      cellPieceIds.push(glowId);
    }
  }

  return {
    cellPieceIds,
    activePieceIds(text) {
      const caption = text.toUpperCase().slice(0, characterSlots);
      const captionColumns = Math.max(0, caption.length * 6 - 1);
      const offset = Math.floor((columns - captionColumns) / 2);
      const active: string[] = [];
      [...caption].forEach((character, characterIndex) => {
        const glyph = terminalPixelFont[character];
        if (!glyph) {
          return;
        }
        glyph.forEach((row, rowIndex) => {
          [...row].forEach((cell, columnIndex) => {
            if (cell !== "1") {
              return;
            }
            const column = offset + characterIndex * 6 + columnIndex;
            const pieceId = cells[rowIndex]?.[column];
            if (pieceId) {
              active.push(pieceId);
            }
          });
        });
      });
      return active;
    },
  };
}

function createCircularGround(): void {
  const grass = zone("terminal:ground:grass");
  const earth = zone("terminal:ground:earth");
  const plaza = zone("terminal:ground:plaza");
  const ballast = zone("terminal:ground:ballast");
  const tile = 6;
  let index = 0;

  for (let x = -WORLD_RADIUS; x < WORLD_RADIUS; x += tile) {
    for (let z = WORLD_CENTER_Z - WORLD_RADIUS; z < WORLD_CENTER_Z + WORLD_RADIUS; z += tile) {
      const centerX = x + tile / 2;
      const centerZ = z + tile / 2;
      const distance = Math.hypot(centerX, centerZ - WORLD_CENTER_Z);
      if (distance > WORLD_RADIUS - tile * 0.46) {
        continue;
      }
      const tone = seededNoise(x, z, 4);
      const stationFootprint = Math.abs(centerX) < 43 && centerZ > 5 && centerZ < 38;
      const railYard = Math.abs(centerX) < 42 && centerZ >= SHED_END_Z - 5 && centerZ <= 8;
      const forecourt = centerZ >= 34 && centerZ < 73 && Math.abs(centerX) < 51;
      const approach = centerZ >= 68 && Math.abs(centerX) < 9;
      const surface = stationFootprint || forecourt || approach ? plaza : railYard ? ballast : grass;
      const surfaceMaterial: BreakableMaterial = surface === grass ? "grass" : surface === ballast ? "concrete" : "stone";
      const surfaceShape: BreakableShape = "groundTile";
      const color =
        surface === grass
          ? tone > 0.62
            ? "#526a43"
            : tone > 0.31
              ? "#49613c"
              : "#435a38"
          : surface === ballast
            ? tone > 0.5
              ? "#696965"
              : "#5d5e5b"
            : tone > 0.66
              ? "#aaa393"
              : tone > 0.32
                ? "#9d978a"
                : "#928d82";

      surface.add(`tile:${index}`, surfaceMaterial, surfaceShape, [centerX, -0.08, centerZ], [6.04, 0.24, 6.04], color);
      earth.add(`tile:${index}`, "earth", "groundTile", [centerX, -1.07, centerZ], [6.04, 1.74, 6.04], tone > 0.5 ? "#5c4935" : "#51402f");
      index += 1;
    }
  }

  // The visible circular curb has its own continuous earth footing. Without
  // this, a mathematically round curb can land between square terrain cells.
  for (let rimIndex = 0; rimIndex < 64; rimIndex += 1) {
    const angle = (rimIndex / 64) * Math.PI * 2;
    const radius = WORLD_RADIUS - 2.1;
    const footingSize: SceneVector3 = [9.35, 1.9, 2.2];
    earth.add(
      `rim-footing:${rimIndex}`,
      "earth",
      "groundTile",
      [Math.cos(angle) * radius, -1.13, WORLD_CENTER_Z + Math.sin(angle) * radius],
      footingSize,
      "#4d3f31",
      [0, -angle, 0],
      rotatedContactSize(footingSize, -angle),
    );
  }

  finish(grass, "Circular railway park", "grass", "linked");
  finish(earth, "Railway island earth", "earth", "linked");
  finish(plaza, "Grand stone forecourt", "stone", "linked");
  finish(ballast, "Track ballast", "concrete", "linked");
}

function frontOpening(x: number, y: number): boolean {
  for (const center of [-9, 0, 9]) {
    const dx = Math.abs(x - center);
    if (dx < 2.35 && y < 6.6) {
      return true;
    }
    const ellipse = (dx * dx) / (3.15 * 3.15) + ((y - 6.5) * (y - 6.5)) / (3.15 * 3.15);
    if (y >= 6.1 && ellipse < 1) {
      return true;
    }
  }
  for (const center of [-29, 29]) {
    if (Math.abs(x - center) < 2.25 && y > 2.0 && y < 8.7) {
      return true;
    }
  }
  // The bays at ±20 are true doorways cut clear down to the floor: the side
  // ticket halls have their own street entrances.
  for (const center of [-20, 20]) {
    if (Math.abs(x - center) < 2.25 && y < 8.7) {
      return true;
    }
  }
  return false;
}

function addWindow(
  builder: ZoneBuilder,
  prefix: string,
  x: number,
  centerY: number,
  z: number,
  width: number,
  height: number,
): void {
  builder.add(`${prefix}:glass`, "glass", "glassPane", [x, centerY, z], [width, height, 0.12], glassBlue);
  builder.add(`${prefix}:left`, "steel", "steelSheet", [x - width / 2 - 0.11, centerY, z + 0.02], [0.22, height + 0.35, 0.22], iron);
  builder.add(`${prefix}:right`, "steel", "steelSheet", [x + width / 2 + 0.11, centerY, z + 0.02], [0.22, height + 0.35, 0.22], iron);
  builder.add(`${prefix}:top`, "steel", "steelSheet", [x, centerY + height / 2 + 0.11, z + 0.02], [width + 0.44, 0.22, 0.22], iron);
  builder.add(`${prefix}:bottom`, "steel", "steelSheet", [x, centerY - height / 2 - 0.11, z + 0.02], [width + 0.44, 0.22, 0.22], iron);
  builder.add(`${prefix}:mullion-v`, "steel", "steelSheet", [x, centerY, z + 0.1], [0.13, height, 0.13], iron);
  builder.add(`${prefix}:mullion-h`, "steel", "steelSheet", [x, centerY, z + 0.1], [width, 0.13, 0.13], iron);
}

function createHeadhouse(): void {
  const shell = zone("terminal:headhouse:shell");
  const facade = zone("terminal:headhouse:facade");
  const roof = zone("terminal:headhouse:roof");
  const structuralPierXs = [-33.5, -24.5, -15.2, -12.05, -5.95, -3.05, 3.05, 5.95, 12.05, 15.2, 24.5, 33.5];

  // Continuous foundation and the tiled public floor.
  for (let x = -36; x <= 36; x += 6) {
    for (let z = 11; z <= 32; z += 6) {
      shell.add(`foundation:${x}:${z}`, "concrete", "panel", [x, -0.25, z], [6.04, 0.72, 6.04], "#77756f");
      shell.add(`floor:${x}:${z}`, "stone", "groundTile", [x, FLOOR_Y, z], [6.02, 0.22, 6.02], (x + z) % 12 === 0 ? "#a69e8e" : "#b2aa99");
    }
  }

  // Front masonry is deliberately made of hand-scale blocks, including the
  // three true segmented arches over the entrance doors.
  let frontIndex = 0;
  for (let row = 0; row < 20; row += 1) {
    const y = 0.62 + row * 0.82;
    for (let column = 0; column < 38; column += 1) {
      const x = -37 + column * 2;
      const allowedHeight = Math.abs(x) < 15 ? 16 : 11.8;
      const authoredX = x + (row % 2 === 0 ? 0 : 0.45);
      const occupiedByPier =
        y < 10.35 &&
        structuralPierXs.some((pierX) => Math.abs(authoredX - pierX) < 2.35);
      const occupiedByUpperCenter =
        y >= 9.2 && Math.abs(authoredX) < (y > 10.8 ? 2.4 : 1.1);
      if (y > allowedHeight || frontOpening(x, y) || occupiedByPier || occupiedByUpperCenter) {
        continue;
      }
      facade.add(
        `front-brick:${frontIndex}`,
        "brick",
        "brick",
        [authoredX, y, FRONT_Z],
        [1.9, 0.82, 0.72],
        (row + column) % 4 === 0 ? brickDark : brickRed,
      );
      frontIndex += 1;
    }
  }

  for (const [archIndex, centerX] of [-9, 0, 9].entries()) {
    addSegmentedArch(facade, `entrance-arch:${archIndex}`, centerX, 6.72, FRONT_Z + 0.05, 3.1, 3.05, 1.05, "stone", "stoneBlock", limestone, 11, 0.55);
    for (const side of [-1, 1]) {
      facade.add(`entrance-pier:${archIndex}:${side}`, "stone", "stoneBlock", [centerX + side * 3.02, 3.35, FRONT_Z + 0.04], [0.62, 6.7, 1.0], limestoneDark);
    }
    // Paired oak doors hung on real hinges, mounted proud of the brick skin
    // so the leaves swing without clipping the wall.
    for (const side of [-1, 1]) {
      const doorX = centerX + side * 1.14;
      facade.pieces.push({
        id: `${facade.id}:door:${archIndex}:${side}`,
        clusterId: facade.id,
        material: "wood",
        shape: "plank",
        position: [doorX, 3.21, FRONT_Z + 0.6],
        size: [2.18, 5.8, 0.24],
        color: oakDark,
        hinge: {
          pivot: [centerX + side * 2.23, 3.21, FRONT_Z + 0.6],
          direction: [1, 0, 0],
          normal: [0, 0, 1],
        },
      });
    }
    // Stone porch: one slab flush with the hall floor. Its 26 cm rise is
    // tall enough for the auto-step probe to notice (shallower ledges stall
    // the player capsule without ever triggering the step-up).
    facade.add(`porch:${archIndex}`, "stone", "stoneBlock", [centerX, 0.16, 36.0], [5.9, 0.28, 2.4], limestone);
  }

  for (const [index, x] of [-29, 29].entries()) {
    addWindow(facade, `wing-window:${index}`, x, 5.25, FRONT_Z + 0.08, 4.05, 6.25);
  }
  for (const [index, x] of [-29, -20, 20, 29].entries()) {
    addSegmentedArch(facade, `wing-window-arch:${index}`, x, 8.58, FRONT_Z + 0.08, 2.45, 1.25, 0.9, "stone", "stoneBlock", limestoneDark, 7, 0.38);
  }

  // Street entrances into both ticket wings: hinged oak pairs under a glazed
  // transom, with their own porch slab and wall lanterns. Without these the
  // side halls (and the side platforms behind them) were unreachable.
  for (const wingX of [-20, 20]) {
    for (const side of [-1, 1]) {
      facade.pieces.push({
        id: `${facade.id}:wing-door:${wingX}:${side}`,
        clusterId: facade.id,
        material: "wood",
        shape: "plank",
        position: [wingX + side * 1.12, 3.18, FRONT_Z + 0.6],
        size: [2.14, 5.75, 0.24],
        color: oakDark,
        hinge: {
          pivot: [wingX + side * 2.19, 3.18, FRONT_Z + 0.6],
          direction: [1, 0, 0],
          normal: [0, 0, 1],
        },
      });
    }
    facade.add(`wing-door-bar:${wingX}`, "steel", "steelSheet", [wingX, 6.22, FRONT_Z + 0.1], [4.5, 0.2, 0.24], iron);
    facade.pieces.push({
      id: `${facade.id}:wing-transom:${wingX}`,
      clusterId: facade.id,
      material: "glass",
      shape: "glassPane",
      position: [wingX, 7.3, FRONT_Z + 0.05],
      size: [4.4, 1.9, 0.12],
      color: glassBlue,
      bearsLoad: false,
    });
    // Steel door-head spanning the jambs: it seats the brick courses over
    // the bay exactly the way the old window top frame used to.
    facade.add(`wing-door-head:${wingX}`, "steel", "steelSheet", [wingX, 8.485, FRONT_Z + 0.08], [4.94, 0.22, 0.22], iron);
    facade.add(`wing-porch:${wingX}`, "stone", "stoneBlock", [wingX, 0.16, 36.0], [4.9, 0.28, 2.4], limestone);
    for (const side of [-1, 1]) {
      addWallLantern(facade, `wing-door-lamp:${wingX}:${side}`, [wingX + side * 2.5, 4.35, FRONT_Z + 0.48], [0, 1], 10, 2.8);
    }
  }

  // Stone bands and articulated corner piers keep the long facade legible.
  for (const y of [0.34, 10.2, 11.7]) {
    for (let x = -35; x <= 35; x += 5) {
      facade.add(`front-band:${y}:${x}`, "stone", "stoneBlock", [x, y, FRONT_Z + 0.08], [4.92, 0.32, 0.94], y === 10.2 ? limestone : limestoneDark);
    }
  }
  for (const x of [-38, -15.2, 15.2, 38]) {
    facade.add(`front-pier:${x}`, "stone", "stoneBlock", [x, 6.3, FRONT_Z], [0.86, 12.6, 1.05], limestone);
  }
  for (const x of structuralPierXs) {
    facade.add(`load-pier:${x}`, "stone", "stoneBlock", [x, 5.15, FRONT_Z - 0.03], [3.1, 10.3, 1.35], limestoneDark);
  }
  for (const [index, centerX] of [-29, -20, 20, 29].entries()) {
    const isDoorBay = Math.abs(centerX) === 20;
    facade.add(`window-lintel:${index}`, "stone", "stoneBlock", [centerX, 9.08, FRONT_Z + 0.02], [5.35, 0.52, 0.96], limestone);
    if (!isDoorBay) {
      facade.add(`window-sill:${index}`, "stone", "stoneBlock", [centerX, 1.82, FRONT_Z + 0.02], [5.2, 0.38, 0.94], limestoneDark);
    }
    for (const side of [-1, 1]) {
      // Door bays carry their jambs all the way to the floor.
      if (isDoorBay) {
        facade.add(`window-jamb:${index}:${side}`, "stone", "stoneBlock", [centerX + side * 2.5, 4.42, FRONT_Z + 0.02], [0.48, 8.26, 0.92], limestoneDark);
      } else {
        facade.add(`window-jamb:${index}:${side}`, "stone", "stoneBlock", [centerX + side * 2.5, 5.18, FRONT_Z + 0.02], [0.48, 6.72, 0.92], limestoneDark);
      }
    }
  }
  for (const [index, centerX] of [-9, 0, 9].entries()) {
    facade.add(`entrance-lintel:${index}`, "stone", "stoneBlock", [centerX, 9.75, FRONT_Z], [6.25, 0.54, 1.02], limestone);
  }
  facade.add("upper-central-pier", "stone", "stoneBlock", [0, 12.75, FRONT_Z], [1.25, 6.2, 1.05], limestoneDark);

  // Side and rear walls: solid enough to carry the roof but open toward the
  // train shed through large doors and windows.
  for (const side of [-1, 1]) {
    const x = side * 38;
    for (let z = 10; z <= 32; z += 2.15) {
      for (let row = 0; row < 12; row += 1) {
        const y = 0.62 + row * 0.82;
        const window = z > 14 && z < 29 && y > 2.2 && y < 8.2 && row % 9 !== 0;
        if (window && Math.round(z) % 6 < 3) {
          continue;
        }
      shell.add(`side:${side}:${z}:${row}`, "brick", "brick", [x, y, z], [0.72, 0.82, 2.05], row % 3 === 0 ? brickDark : brickRed);
      }
    }
  }
  for (const x of [-34, -28, 28, 34]) {
    for (let row = 0; row < 12; row += 1) {
      shell.add(`rear:${x}:${row}`, "brick", "brick", [x, 0.62 + row * 0.82, REAR_Z], [5.8, 0.82, 0.72], row % 4 === 0 ? brickDark : brickRed);
    }
  }
  // Each ticket wing opens onto its side platform through a real doorway:
  // brick jambs, a stone lintel laid into the coursing, and a lantern over
  // the door lighting the platform steps beyond.
  for (const side of [-1, 1]) {
    for (let row = 0; row < 12; row += 1) {
      const y = 0.62 + row * 0.82;
      const tone = row % 4 === 0 ? brickDark : brickRed;
      shell.add(`rear-pier:${side}:${row}`, "brick", "brick", [side * 22.6, y, REAR_Z], [4.6, 0.82, 0.72], tone);
      // Brick courses continue above the stone door pier and over the
      // lintel; a plain brick jamb pile would be crushed by the lintel load.
      if (row >= 5) {
        shell.add(`rear-door-jamb:${side}:${row}`, "brick", "brick", [side * 15.05, y, REAR_Z], [1.3, 0.82, 0.72], tone);
        if (row >= 6) {
          shell.add(`rear-overdoor:${side}:${row}`, "brick", "brick", [side * 18.0, y, REAR_Z], [4.6, 0.82, 0.72], tone);
        }
      }
    }
    shell.add(`rear-door-pier:${side}`, "stone", "stoneBlock", [side * 15.25, 2.155, REAR_Z], [1.7, 4.31, 0.8], limestoneDark);
    shell.add(`rear-door-lintel:${side}`, "stone", "stoneBlock", [side * 18.2, 4.72, REAR_Z], [5.0, 0.82, 0.8], limestoneDark);
    addWallLantern(shell, `rear-door-lamp:${side}`, [side * 18.2, 4.72, REAR_Z - 0.4], [0, -1], 10, 2.9);
  }
  for (const x of [-14, -8, 8, 14]) {
    addFacetedCylinder(shell, `rear-column:${x}`, "stone", "stoneBlock", "y", [x, 4.9, REAR_Z], 9.8, 0.85, limestoneDark);
  }
  // Lanterns flank the central passage from the concourse to the platforms.
  for (const side of [-1, 1]) {
    addWallLantern(shell, `passage-lamp:${side}`, [side * 7.79, 4.6, REAR_Z], [-side, 0], 11, 3.0);
  }

  // Central glazed gable and slate-clad wings.
  for (const side of [-1, 1]) {
    const centralSize: SceneVector3 = [16.2, 0.2, 26.5];
    const centralAngle = -side * 0.42;
    const centralPosition: SceneVector3 = [side * 7.8, 17.25, 21];
    roof.pieces.push({
      id: `${roof.id}:central-glass:${side}`,
      clusterId: roof.id,
      material: "darkGlass",
      shape: "glassPane",
      position: centralPosition,
      size: centralSize,
      color: "#6f969e",
      rotation: [0, 0, centralAngle],
      contactBoxes: rotatedZEndpointContacts(centralPosition, centralSize, centralAngle, 1.15),
      bearsLoad: false,
    });
    roof.add(`central-ridge:${side}`, "steel", "steelSheet", [side * 0.2, 20.55, 21], [0.34, 0.34, 26.7], iron);
  }
  for (const wing of [-1, 1]) {
    for (const slope of [-1, 1]) {
      const centerX = wing * 26 + slope * 5.8;
      const wingSize: SceneVector3 = [12.2, 0.32, 27];
      const wingAngle = -slope * 0.24;
      const wingPosition: SceneVector3 = [centerX, 12.65, 21];
      roof.pieces.push({
        id: `${roof.id}:wing:${wing}:${slope}`,
        clusterId: roof.id,
        material: "graphiteStone",
        shape: "steelSheet",
        position: wingPosition,
        size: wingSize,
        color: "#343a3d",
        rotation: [0, 0, wingAngle],
        contactBoxes: rotatedZEndpointContacts(wingPosition, wingSize, wingAngle, 1.25),
      });
    }
  }

  // Continuous bearing lines under every roof edge. These are visible stone
  // cornices, not hidden anchors, and transfer roof load into the walls.
  for (const x of [-38, -15.2, 15.2, 38]) {
    for (let z = 10.5; z <= 31.5; z += 5.25) {
      const height = Math.abs(x) < 20 ? 14 : 11.2;
      // Nudged 6 cm proud of the brick skin: coplanar faces of pier and
      // wall used to z-fight ("ryabit") along the whole side elevation.
      shell.add(`roof-bearing:${x}:${z}`, "stone", "stoneBlock", [x + Math.sign(x) * 0.06, height / 2, z], [0.72, height, 5.2], limestoneDark);
    }
  }
  for (const x of [-26, 26]) {
    for (let z = 10.5; z <= 31.5; z += 5.25) {
      shell.add(`wing-ridge-bearing:${x}:${z}`, "stone", "stoneBlock", [x, 7.05, z], [0.62, 14.1, 5.2], limestoneDark);
    }
  }
  for (const side of [-1, 1]) {
    shell.add(`wing-inner-cornice:${side}`, "steel", "steelSheet", [side * 14.8, 11.0, 21], [2.2, 0.3, 27], ironLight);
  }
  for (const z of [9, 33]) {
    for (const side of [-1, 1]) {
      addFacetedCylinder(shell, `ridge-portal-column:${z}:${side}`, "stone", "stoneBlock", "y", [side * 1.7, 9.8, z], 19.6, 0.6, limestoneDark);
    }
    shell.add(`ridge-portal-beam:${z}`, "stone", "stoneBlock", [0, 20.05, z], [4.1, 0.9, 1.3], limestoneDark);
  }

  // Clock tower with a segmented round clock and copper cap.
  for (let y = 16.3; y <= 23.5; y += 1.05) {
    for (const x of [-6, -3.8, 3.8, 6]) {
      facade.add(`clock-tower:${x}:${y}`, "brick", "brick", [x, y, FRONT_Z - 0.2], [2.05, 0.95, 1.1], y % 2 > 1 ? brickDark : brickRed);
    }
  }
  const clockCenterY = 20.15;
  for (let index = 0; index < 24; index += 1) {
    const angle = (index / 24) * Math.PI * 2;
    facade.add(`clock-ring:${index}`, "steel", "steelSheet", [Math.cos(angle) * 3.05, clockCenterY + Math.sin(angle) * 3.05, FRONT_Z + 0.48], [0.42, 0.42, 0.18], brass, [0, 0, angle]);
  }
  facade.add("clock-face", "steel", "panel", [0, clockCenterY, FRONT_Z + 0.28], [6.5, 6.5, 0.18], "#ddd3b8");
  // Ten past ten, the classic clock-face pose: hour hand toward 10,
  // minute hand toward 2, both anchored at the centre of the face.
  facade.add("clock-hand-hour", "steel", "steelSheet", [-0.78, clockCenterY + 0.45, FRONT_Z + 0.58], [0.16, 1.8, 0.15], iron, [0, 0, 1.047]);
  facade.add("clock-hand-minute", "steel", "steelSheet", [1.13, clockCenterY + 0.65, FRONT_Z + 0.59], [0.14, 2.6, 0.14], iron, [0, 0, -1.047]);
  facade.add("clock-cap-left", "steel", "steelSheet", [-3.25, 24.5, FRONT_Z - 0.15], [7.2, 0.28, 3.8], "#48635d", [0, 0, 0.48]);
  facade.add("clock-cap-right", "steel", "steelSheet", [3.25, 24.5, FRONT_Z - 0.15], [7.2, 0.28, 3.8], "#48635d", [0, 0, -0.48]);
  facade.add("clock-cap-base", "stone", "stoneBlock", [0, 23.4, FRONT_Z - 0.15], [12.2, 0.5, 3.8], limestoneDark);

  facade.add("name-board", "graphiteStone", "panel", [0, 13.55, FRONT_Z + 0.52], [30, 2.25, 0.3], "#202629");
  addPixelText(facade, "name", "GRAND TERMINAL", 0, 13.55, FRONT_Z + 0.74, 0.26, "#d2ad55", 1);

  finish(shell, "Grand Terminal structure", "brick", "stack");
  finish(facade, "Grand entrance and clock", "stone", "mounted");
  finish(roof, "Slate and glass roofs", "graphiteStone", "stack");
}

function createPublicInterior(): void {
  const hall = zone("terminal:interior:hall");
  const ticketing = zone("terminal:interior:ticketing");
  const furniture = zone("terminal:interior:furniture");

  // A real interior plan rather than an empty shell: central concourse,
  // ticket offices in both wings, a waiting room and luggage passages.
  for (const side of [-1, 1]) {
    const px = side * 15.2;
    // The ticket wings are on the public route now: two door openings pierce
    // each partition, so the side halls connect to the central concourse.
    for (const [segmentIndex, [zCenter, zLength]] of [
      [13.15, 4.3],
      [22, 6.6],
      [30.85, 4.3],
    ].entries()) {
      hall.add(`partition:${side}:${segmentIndex}`, "plaster", "panel", [px, 5.4, zCenter], [0.32, 10.8, zLength], "#d5cebd");
    }
    for (const doorZ of [17, 27]) {
      for (const [jambIndex, jambZ] of [doorZ - 1.5, doorZ + 1.5].entries()) {
        hall.add(`partition-jamb:${side}:${doorZ}:${jambIndex}`, "wood", "plank", [px, 2.09, jambZ], [0.42, 3.6, 0.34], oakDark);
      }
      hall.add(`partition-lintel:${side}:${doorZ}`, "wood", "plank", [px, 4.05, doorZ], [0.42, 0.32, 3.42], oakDark);
      hall.add(`partition-overdoor:${side}:${doorZ}`, "plaster", "panel", [px, 7.5, doorZ], [0.32, 6.58, 3.4], "#d5cebd");
    }
    for (let xOffset = 18; xOffset <= 35; xOffset += 4.25) {
      const x = side * xOffset;
      for (let z = 12; z <= 30; z += 4.5) {
        addFacetedCylinder(hall, `gallery-column:${side}:${xOffset}:${z}`, "stone", "stoneBlock", "y", [x, 3.65, z], 7.3, 0.56, limestoneDark);
        hall.add(`upper-gallery:${side}:${xOffset}:${z}`, "wood", "plank", [x, 7.42, z], [4.22, 0.28, 4.46], oakDark);
      }
    }
    for (let z = 12; z <= 31; z += 4.8) {
      hall.add(`gallery-rail:${side}:${z}`, "steel", "steelSheet", [side * 15.95, 8.18, z], [0.12, 1.18, 4.5], brass);
    }
  }

  // Ticket counters and their glazed cashier windows.
  for (const side of [-1, 1]) {
    const x = side * 23.6;
    const yaw = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    for (let z = 15; z <= 28; z += 4.3) {
      ticketing.add(`counter:${side}:${z}`, "wood", "plank", [x, 1.1, z], [4, 1.9, 0.8], oak, [0, yaw, 0], [0.8, 1.9, 4]);
      ticketing.add(`counter-top:${side}:${z}`, "stone", "stoneBlock", [x - side * 0.18, 2.1, z], [4.15, 0.16, 1.0], "#6e675d", [0, yaw, 0], [1, 0.16, 4.15]);
      ticketing.add(`cashier-glass:${side}:${z}`, "glass", "glassPane", [x, 3.3, z], [3.75, 2.2, 0.12], glassBlue, [0, yaw, 0], [0.12, 2.2, 3.75]);
      ticketing.add(`cashier-frame:${side}:${z}`, "steel", "steelSheet", [x - side * 0.02, 3.3, z], [3.9, 0.12, 0.16], brass, [0, yaw, 0]);
    }
  }

  // The mechanical departure board stands on the concourse side of the
  // colonnade (z 11.4, in front of the ridge-portal columns at z 9) so its
  // face is never hidden behind a column from the hall. It rides its own
  // pair of cast posts — a tonne of steel flaps would crush the slender
  // portal columns if it hung off them. The rows are back-lit split-flap
  // glyphs: pale by day, glowing after dusk.
  const boardZ = 11.4;
  const boardCenterY = 8.5;
  for (const side of [-1, 1]) {
    hall.add(`departure-post:${side}`, "steel", "steelSheet", [side * 5.9, 4.0, boardZ], [0.42, 7.96, 0.42], iron);
  }
  hall.add("departure-board", "steel", "panel", [0, boardCenterY, boardZ], [12.8, 5.8, 0.38], "#171d1f");
  // Glowing header, then one glowing row per platform. The header sits clear
  // above the first divider line; glyph faces are at boardZ + 0.2 so they read
  // for a viewer in the hall (facing -z), and every glyph stays inside the
  // board so the solver carries it. Destinations are invented Nordic/Irish
  // towns — in-world signage, always in English.
  hall.add("departure-header-trim", "steel", "steelSheet", [0, 9.72, boardZ + 0.14], [12.6, 0.09, 0.14], brass);
  const departureDisplayPieceIds = [
    ...addPixelText(hall, "departure-title", "DEPARTURES", 0, 10.45, boardZ + 0.2, 0.185, litWindowColor, 1, true),
  ];
  const departures: readonly [string, string][] = [
    ["BALLYVOR", "1"],
    ["KORSVIK", "2"],
    ["DUNMORE", "3"],
  ];
  for (const [rowIndex, [city, platform]] of departures.entries()) {
    const rowY = 8.75 - rowIndex * 1.32;
    departureDisplayPieceIds.push(
      ...addPixelText(hall, `departure-city:${rowIndex}`, city, -2.6, rowY, boardZ + 0.2, 0.14, litWindowColor, 1, true),
      ...addPixelText(hall, `departure-platform:${rowIndex}`, platform, 5.3, rowY, boardZ + 0.2, 0.16, litWindowColor, 1, true),
    );
    if (rowIndex < departures.length - 1) {
      hall.add(`departure-line:${rowIndex}`, "steel", "steelSheet", [0, rowY - 0.66, boardZ + 0.12], [11.9, 0.06, 0.12], "#3a4144");
    }
  }
  mutableObjects.push({
    kind: "display",
    id: "terminal:interior:departures",
    transition: { fadeInSeconds: 0.55, fadeOutSeconds: 0.38 },
    layers: [
      {
        id: "flight-list",
        pieceIds: departureDisplayPieceIds,
        condition: {
          kind: "clusterEvent",
          sourceClusterId: SKY_TRAIN_CLUSTER_ID,
          states: ["docked"],
        },
      },
    ],
  });

  for (const [index, [x, z, yaw]] of [
    [-8, 24, 0],
    [8, 24, 0],
    [-8, 16, Math.PI],
    [8, 16, Math.PI],
    [-27, 12.5, Math.PI / 2],
    [27, 12.5, -Math.PI / 2],
  ].entries()) {
    addBench(furniture, `bench:${index}`, x, FLOOR_Y + 0.12, z, yaw);
  }

  // Queue posts, waste bins and luggage make the hall feel occupied. The
  // queue line runs alongside the ticket counters, so the walking route from
  // the wing street door to the platform doorway stays rope-free.
  for (const side of [-1, 1]) {
    for (let index = 0; index < 5; index += 1) {
      const z = 13 + index * 1.6;
      ticketing.add(`queue-post:${side}:${index}`, "steel", "steelSheet", [side * 25.5, 0.92, z], [0.13, 1.35, 0.13], brass);
      if (index < 4) {
        ticketing.add(`queue-rope:${side}:${index}`, "steel", "steelSheet", [side * 25.5, 1.45, z + 0.8], [0.08, 0.08, 1.55], "#812f2d");
      }
    }
  }
  for (const [index, [x, z, size, yaw]] of [
    [-11, 29, 1.0, 0.1],
    [-9.9, 29.5, 0.72, -0.2],
    [11.4, 13.1, 0.92, 0.3],
    [12.3, 13.6, 0.68, -0.1],
  ].entries()) {
    addCrate(furniture, `luggage:${index}`, x, FLOOR_Y + 0.12, z, size, yaw);
  }
  // Lamp posts flank the central walking axis — nothing stands on the
  // straight line from the entrance doors to the platform stairs.
  for (const [index, x] of [-10, -3.4, 3.4, 10].entries()) {
    addFacetedCylinder(hall, `hall-lamp-post:${index}`, "steel", "steelSheet", "y", [x, 6.9, 22], 13.8, 0.24, iron);
    addLampFixture(hall, `hall-lamp:${index}`, [x, 13.8, 22], 21, 5.2);
  }
  for (const [index, x] of [-27, -20, 20, 27].entries()) {
    hall.add(`wing-lamp-post:${index}`, "steel", "steelSheet", [x, 4.6, 22], [0.18, 9.2, 0.18], iron);
    addLampFixture(hall, `wing-lamp:${index}`, [x, 9.2, 22], 16, 3.8);
  }

  // Interior lining of the entrance wall — a proper lobby, not the raw back
  // of the brick facade. Cream pilasters, an oak wainscot, an entablature
  // cornice and a plaster medallion give the inside its own character, so
  // walking in no longer looks like the reverse of the street elevation.
  const lobby = zone("terminal:interior:lobby");
  const liningZ = 33.55;
  const creamPlaster = "#cabfa3";
  const pilasterXs = [-33.5, -24.5, -15.2, -12.05, -5.95, 5.95, 12.05, 15.2, 24.5, 33.5];
  for (const x of pilasterXs) {
    lobby.add(`pilaster:${x}`, "plaster", "panel", [x, 4.7, liningZ], [1.0, 9.04, 0.5], creamPlaster);
    lobby.add(`pilaster-cap:${x}`, "plaster", "panel", [x, 9.35, liningZ - 0.02], [1.35, 0.55, 0.62], "#d8ceb4");
  }
  // Oak wainscot dado running between the pilasters, standing on the floor.
  for (let x = -36; x <= 36; x += 3) {
    if (pilasterXs.some((px) => Math.abs(px - x) < 1.1)) {
      continue;
    }
    if (Math.abs(x) < 2) {
      continue;
    }
    lobby.add(`wainscot:${x}`, "wood", "plank", [x, 1.15, liningZ + 0.04], [2.86, 1.9, 0.34], x % 2 === 0 ? oak : oakDark);
    lobby.add(`wainscot-rail:${x}`, "wood", "plank", [x, 2.18, liningZ + 0.08], [2.9, 0.16, 0.2], "#8a5a34");
  }
  // Continuous entablature cornice tying the pilaster caps together.
  for (let x = -33; x <= 33; x += 6) {
    lobby.add(`cornice:${x}`, "plaster", "panel", [x, 9.72, liningZ - 0.04], [6.05, 0.6, 0.66], "#d8ceb4");
    lobby.add(`cornice-dentil:${x}`, "wood", "plank", [x, 9.32, liningZ + 0.1], [6.0, 0.14, 0.18], brass);
  }
  // Interior door surrounds: warm plaster architraves over each entrance,
  // distinct from the exterior stone arches.
  for (const centerX of [-9, 0, 9]) {
    for (const side of [-1, 1]) {
      lobby.add(`arch-jamb:${centerX}:${side}`, "plaster", "panel", [centerX + side * 3.05, 3.6, liningZ], [0.6, 6.8, 0.55], "#d3c9af");
    }
    lobby.add(`arch-lintel:${centerX}`, "plaster", "panel", [centerX, 7.3, liningZ], [6.9, 0.75, 0.58], "#d8ceb4");
    lobby.add(`arch-keystone:${centerX}`, "plaster", "panel", [centerX, 7.95, liningZ - 0.02], [0.7, 0.95, 0.66], brass);
  }
  // A plaster medallion crowns the concourse — the interior's own centrepiece
  // in place of the street clock. Its backing panel bears down on the cornice;
  // the brass rosette studs attach to that panel's face.
  const medallionY = 11.85;
  lobby.add("medallion-panel", "plaster", "panel", [0, medallionY, liningZ - 0.1], [4.4, 3.7, 0.42], "#cdc3a8");
  lobby.add("medallion-disk", "plaster", "panel", [0, medallionY, liningZ + 0.12], [2.3, 2.3, 0.24], "#d8ceb4");
  for (let index = 0; index < 16; index += 1) {
    const angle = (index / 16) * Math.PI * 2;
    lobby.add(`medallion-stud:${index}`, "plaster", "panel", [Math.cos(angle) * 1.5, medallionY + Math.sin(angle) * 1.5, liningZ + 0.16], [0.34, 0.34, 0.3], index % 2 === 0 ? brass : "#b9a976", [0, 0, angle]);
  }

  finish(hall, "Concourse and galleries", "plaster", "stack");
  finish(ticketing, "Ticket offices", "wood", "mounted");
  finish(furniture, "Waiting hall furniture", "wood", "stack");
  finish(lobby, "Entrance lobby lining", "plaster", "mounted");
}

function createTrainShed(): void {
  const structure = zone("terminal:shed:structure");
  const glazing = zone("terminal:shed:glazing");
  const zModules: number[] = [];
  for (let z = SHED_END_Z + 3.5; z <= REAR_Z - 3.5; z += 7) {
    zModules.push(z);
  }

  // Elliptical iron ribs and glass panels form a genuine barrel vault. Every
  // strip is an individual body, so a rocket opens an irregular skylight.
  const segments = 24;
  const step = Math.PI / segments;
  zModules.forEach((z, zIndex) => {
    for (let index = 0; index < segments; index += 1) {
      const startAngle = step * index;
      const endAngle = step * (index + 1);
      const angle = (startAngle + endAngle) / 2;
      const x = Math.cos(angle) * 35;
      const y = 9.2 + Math.sin(angle) * 15.8;
      const dx = -Math.sin(angle) * 35;
      const dy = Math.cos(angle) * 15.8;
      const tangent = Math.atan2(dy, dx);
      const arcLength = Math.hypot(dx, dy) * step * 1.06;
      const ribSize: SceneVector3 = [arcLength, 0.34, 0.72];
      const paneSize: SceneVector3 = [arcLength * 0.94, 0.13, 6.72];
      const startX = Math.cos(startAngle) * 35;
      const startY = 9.2 + Math.sin(startAngle) * 15.8;
      const endX = Math.cos(endAngle) * 35;
      const endY = 9.2 + Math.sin(endAngle) * 15.8;
      const contactX = (startX + endX) / 2;
      const contactY = (startY + endY) / 2;
      const contactWidth = Math.abs(endX - startX) + 1.0;
      const contactHeight = Math.abs(endY - startY) + 0.02;
      structure.pieces.push({
        id: `${structure.id}:rib:${zIndex}:${index}`,
        clusterId: structure.id,
        material: "steel",
        shape: "steelSheet",
        position: [x, y, z - 3.4],
        size: ribSize,
        color: iron,
        rotation: [0, 0, tangent],
        contactBoxes: [{ position: [contactX, contactY, z - 3.4], size: [contactWidth, contactHeight, 0.7] }],
        carriesAttachments: true,
      });
      glazing.pieces.push({
        id: `${glazing.id}:pane:${zIndex}:${index}`,
        clusterId: glazing.id,
        material: "darkGlass",
        shape: "glassPane",
        position: [x, y, z],
        size: paneSize,
        color: index % 3 === 0 ? "#779ba3" : "#86aab1",
        rotation: [0, 0, tangent],
        contactBoxes: [{ position: [contactX, contactY, z], size: [contactWidth, contactHeight, 6.6] }],
        // Glass carries no load: the pane arch must not hold itself up as a
        // chain — every pane depends on its iron rib and falls with it.
        bearsLoad: false,
      });
    }
  });

  for (let z = SHED_END_Z; z <= REAR_Z; z += 7) {
    for (const side of [-1, 1]) {
      addFacetedCylinder(structure, `outer-column:${side}:${z}`, "steel", "steelSheet", "y", [side * 35, 4.65, z], 9.3, 0.92, iron);
      structure.add(`outer-foot:${side}:${z}`, "stone", "stoneBlock", [side * 35, 0.72, z], [1.35, 1.4, 1.35], limestoneDark);
      // A cast-iron corbel bracket flares from each column head to carry the
      // eaves: a stepped triangle whose rows bear on the column, closed by a
      // diagonal fascia. Reads as obvious ironwork, not a floating stick.
      const columnFace = side * 34.54;
      for (const [rowIndex, [rowY, reach]] of [
        [7.0, 0.9],
        [7.75, 1.65],
        [8.5, 2.4],
      ].entries()) {
        structure.add(
          `eaves-bracket:${side}:${z}:${rowIndex}`,
          "steel",
          "steelSheet",
          [columnFace - side * reach / 2, rowY, z],
          [reach, 0.62, 0.6],
          rowIndex === 2 ? iron : ironLight,
        );
      }
      structure.add(
        `eaves-fascia:${side}:${z}`,
        "steel",
        "steelSheet",
        [columnFace - side * 1.35, 7.75, z],
        [3.5, 0.2, 0.66],
        iron,
        [0, 0, side * 0.72],
      );
    }
  }

  // Central smoke lantern, operable-looking even though it is destructible.
  for (let z = SHED_END_Z + 4; z < REAR_Z - 6; z += 7) {
    for (const side of [-1, 1]) {
      // The lantern walls bear on the crest RIBS (not on the glazing —
      // glass carries nothing).
      structure.pieces.push({
        id: `${structure.id}:lantern-side:${side}:${z}`,
        clusterId: structure.id,
        material: "steel",
        shape: "steelSheet",
        position: [side * 1.45, 26.05, z],
        size: [0.18, 2.1, 6.3],
        color: iron,
        rotation: [0, 0, side * 0.18],
        contactBoxes: [
          { position: [side * 2.3, 26.2, z - 3.35], size: [4.4, 2.46, 0.9] },
          { position: [side * 2.3, 26.2, z + 3.35], size: [4.4, 2.46, 0.9] },
        ],
        carriesAttachments: true,
      });
      glazing.add(`lantern-glass:${side}:${z}`, "glass", "glassPane", [side * 1.55, 26.35, z], [0.12, 1.32, 5.9], glassBlue, [0, 0, side * 0.18]);
    }
    structure.add(`lantern-cap:${z}`, "steel", "steelSheet", [0, 27.5, z], [4.2, 0.24, 6.7], "#394a48");
  }

  finish(structure, "Grand iron train shed", "steel", "stack");
  finish(glazing, "Barrel-vault glazing", "darkGlass", "mounted");
}

function createTracksAndPlatforms(): void {
  const tracks = zone("terminal:yard:tracks");
  const platforms = zone("terminal:yard:platforms");
  const fittings = zone("terminal:yard:fittings");
  const trackCenters = [-27, -9, 9, 27];

  trackCenters.forEach((trackX, trackIndex) => {
    for (let z = SHED_END_Z + 2; z <= REAR_Z - 2; z += 2.25) {
      tracks.add(`sleeper:${trackIndex}:${z}`, "wood", "plank", [trackX, 0.23, z], [3.55, 0.16, 0.34], z % 4.5 === 0 ? oakDark : "#4d3728");
      for (const side of [-1, 1]) {
        tracks.add(`chair:${trackIndex}:${z}:${side}`, "steel", "steelSheet", [trackX + side * 0.78, 0.39, z], [0.28, 0.12, 0.25], iron);
      }
    }
    for (let z = SHED_END_Z + 3; z <= REAR_Z - 3; z += 6) {
      for (const side of [-1, 1]) {
        tracks.add(`rail:${trackIndex}:${z}:${side}`, "steel", "steelSheet", [trackX + side * 0.78, 0.5, z], [0.13, 0.18, 6.1], "#51595b");
      }
    }
    // Buffer stops terminate every museum track before the concourse.
    for (const side of [-1, 1]) {
      tracks.add(`buffer-leg:${trackIndex}:${side}`, "steel", "steelSheet", [trackX + side * 0.72, 0.92, 5.2], [0.22, 1.25, 1.25], iron, [side * 0.55, 0, 0]);
      tracks.add(`buffer-head:${trackIndex}:${side}`, "steel", "steelSheet", [trackX + side * 0.72, 1.58, 4.65], [0.76, 0.36, 0.28], "#2f3335");
    }
  });

  const platformCenters = [-18, 0, 18];
  platformCenters.forEach((platformX, platformIndex) => {
    for (let z = SHED_END_Z + 3; z <= REAR_Z - 3; z += 6) {
      platforms.add(`base:${platformIndex}:${z}`, "concrete", "panel", [platformX, 0.45, z], [6.6, 0.72, 6.02], "#77756f");
      platforms.add(`surface:${platformIndex}:${z}`, "stone", "groundTile", [platformX, 0.86, z], [6.56, 0.16, 6], (Math.round(z / 6) + platformIndex) % 2 === 0 ? "#ada695" : "#9d9789");
      for (const side of [-1, 1]) {
        platforms.add(`edge:${platformIndex}:${z}:${side}`, "stone", "stoneBlock", [platformX + side * 3.23, 0.95, z], [0.2, 0.24, 5.95], limestone);
      }
    }

    for (const [benchIndex, z] of [-57, -40, -22].entries()) {
      addBench(fittings, `platform-bench:${platformIndex}:${benchIndex}`, platformX, 0.95, z, platformIndex % 2 === 0 ? 0 : Math.PI);
    }
    for (const [signIndex, z] of [-51, -27, -14].entries()) {
      const id = `platform-sign:${platformIndex}:${signIndex}`;
      // A pair of lanterns crowns the sign posts just above the number
      // board — town-street-lamp style: the glass block is the light
      // source and the light dies when it is smashed.
      for (const [postIndex, side] of [-1, 1].entries()) {
        const postX = platformX + side * 1.6;
        fittings.add(`${id}:post:${postIndex}`, "steel", "steelSheet", [postX, 3.05, z], [0.22, 4.2, 0.22], iron);
        fittings.add(`${id}:foot:${postIndex}`, "steel", "steelSheet", [postX, 1.12, z], [0.44, 0.34, 0.44], "#2c3436");
        fittings.add(`${id}:lantern-base:${postIndex}`, "steel", "steelSheet", [postX, 5.19, z], [0.3, 0.08, 0.3], ironLight);
        fittings.add(`${id}:lantern-glass:${postIndex}`, "glass", "glassPane", [postX, 5.43, z], [0.3, 0.4, 0.3], litWindowColor);
        fittings.add(`${id}:lantern-cap:${postIndex}`, "steel", "steelSheet", [postX, 5.68, z], [0.38, 0.1, 0.38], iron);
        lamps.push({
          id: `${fittings.id}:${id}:lantern-glass:${postIndex}`,
          position: [postX, 5.43, z],
          color: "#ffd49a",
          distance: 18,
          intensity: 6.4,
          poolPriority: 1.5,
          poolGroupId: `${fittings.id}:${id}:lantern-pair`,
        });
      }
      fittings.add(`${id}:board`, "graphiteStone", "panel", [platformX, 4.15, z], [3.7, 1.35, 0.2], "#1b2426");
      addPixelText(fittings, `${id}:number`, String(platformIndex + 1), platformX, 4.15, z + 0.16, 0.16, "#f0deb0", 1);
      addPixelText(fittings, `${id}:number-back`, String(platformIndex + 1), platformX, 4.15, z - 0.16, 0.16, "#f0deb0", -1);
    }

    // Three shallow stone steps connect the concourse to the platform head —
    // the platforms are actually walkable from the hall now.
    for (const [stepIndex, [top, z]] of [
      [0.34, 7.5],
      [0.64, 6.9],
      [0.94, 6.3],
    ].entries()) {
      fittings.add(
        `platform-steps:${platformIndex}:${stepIndex}`,
        "stone",
        "stoneBlock",
        [platformX, (top + 0.02) / 2, z],
        [4.6, top - 0.02, 0.62],
        stepIndex % 2 === 0 ? limestone : limestoneDark,
      );
    }

    // The life of a working platform: a station clock, luggage waiting for
    // its train, barrels, a waste bin and a hand cart.
    const clockId = `platform-clock:${platformIndex}`;
    fittings.add(`${clockId}:post`, "steel", "steelSheet", [platformX, 2.75, -33], [0.28, 3.6, 0.28], iron);
    fittings.add(`${clockId}:foot`, "steel", "steelSheet", [platformX, 1.1, -33], [0.6, 0.4, 0.6], "#2c3436");
    fittings.add(`${clockId}:cross`, "steel", "steelSheet", [platformX, 4.63, -33], [0.5, 0.16, 0.34], iron);
    // Stepped octagonal clock head stacked upward from the crossplate, brass
    // top and bottom courses framing the cream dial.
    let clockRowBottom = 4.71;
    for (const [rowIndex, [rowWidth, rowColor]] of ([
      [0.72, brass],
      [1.12, "#e6ddc4"],
      [1.3, "#e6ddc4"],
      [1.12, "#e6ddc4"],
      [0.72, brass],
    ] as const).entries()) {
      const rowHeight = rowIndex === 2 ? 0.52 : 0.26;
      fittings.add(`${clockId}:row:${rowIndex}`, "steel", "steelSheet", [platformX, clockRowBottom + rowHeight / 2, -33], [rowWidth, rowHeight, 0.3], rowColor);
      clockRowBottom += rowHeight;
    }
    // Ten past ten on both dial faces.
    for (const face of [-1, 1]) {
      fittings.add(`${clockId}:hand-hour:${face}`, "steel", "steelSheet", [platformX - 0.14, 5.57, -33 + face * 0.18], [0.38, 0.08, 0.05], iron, [0, 0, 1.047]);
      fittings.add(`${clockId}:hand-minute:${face}`, "steel", "steelSheet", [platformX + 0.16, 5.6, -33 + face * 0.18], [0.5, 0.07, 0.05], iron, [0, 0, -1.047]);
      fittings.add(`${clockId}:pin:${face}`, "steel", "steelSheet", [platformX, 5.49, -33 + face * 0.19], [0.12, 0.12, 0.06], brass);
    }
    addCrate(fittings, `platform-luggage:${platformIndex}:a`, platformX - 1.7, 0.95, -46.2, 0.95, 0.15);
    addCrate(fittings, `platform-luggage:${platformIndex}:b`, platformX - 1.15, 0.95, -45.4, 0.7, -0.25);
    fittings.add(`platform-suitcase:${platformIndex}:a`, "wood", "plank", [platformX - 2.0, 1.18, -45.3], [0.72, 0.46, 0.34], "#7a4a28", [0, 0.35, 0]);
    fittings.add(`platform-suitcase:${platformIndex}:a-lid`, "wood", "plank", [platformX - 2.0, 1.3, -45.3], [0.73, 0.05, 0.35], "#5d3a22", [0, 0.35, 0]);
    fittings.add(`platform-suitcase:${platformIndex}:a-handle`, "steel", "steelSheet", [platformX - 2.0, 1.44, -45.3], [0.2, 0.06, 0.07], "#37342e", [0, 0.35, 0]);
    fittings.add(`platform-suitcase:${platformIndex}:b`, "wood", "plank", [platformX - 1.9, 1.62, -45.35], [0.62, 0.4, 0.3], "#5d3a22", [0, 0.15, 0]);
    fittings.add(`platform-suitcase:${platformIndex}:b-handle`, "steel", "steelSheet", [platformX - 1.9, 1.85, -45.35], [0.18, 0.06, 0.07], "#37342e", [0, 0.15, 0]);
    addFacetedCylinder(fittings, `platform-barrel:${platformIndex}:a`, "wood", "plank", "y", [platformX + 1.9, 1.53, -12.6], 1.15, 0.85, oak);
    addFacetedCylinder(fittings, `platform-barrel:${platformIndex}:b`, "wood", "plank", "y", [platformX + 1.2, 1.45, -13.2], 1.0, 0.75, oakDark);
    addFacetedCylinder(fittings, `platform-bin:${platformIndex}`, "steel", "steelSheet", "y", [platformX - 2.3, 1.35, -18.4], 0.8, 0.5, "#3f5347");
    addFacetedCylinder(fittings, `platform-bin-rim:${platformIndex}`, "steel", "steelSheet", "y", [platformX - 2.3, 1.79, -18.4], 0.08, 0.58, "#2c3a33");
  });
  addBaggageCart(fittings, "cart:west-platform", -18.6, 0.95, -50, -0.1);
  addBaggageCart(fittings, "cart:center-platform", 0.8, 0.95, -14.5, Math.PI / 2 + 0.12);
  addFacetedCylinder(fittings, "crane-barrel:a", "wood", "plank", "y", [29.6, 0.62, -46.6], 1.15, 0.85, oak);
  addFacetedCylinder(fittings, "crane-barrel:b", "wood", "plank", "y", [28.7, 0.55, -47.3], 1.0, 0.75, oakDark);

  // Mechanical semaphores and a water crane at the far end. The posts are
  // thick enough to read against the bright shed, with a cast base and a
  // bracket tying the lamp to the post, so the arm never looks like it floats.
  for (const [index, trackX] of trackCenters.entries()) {
    const postX = trackX - 2.05;
    fittings.add(`signal:${index}:base`, "stone", "stoneBlock", [postX, 0.55, -66], [0.9, 0.9, 0.9], limestoneDark);
    fittings.add(`signal:${index}:post`, "steel", "steelSheet", [postX, 3.35, -66], [0.34, 5.6, 0.34], iron);
    fittings.add(`signal:${index}:finial`, "steel", "steelSheet", [postX, 6.28, -66], [0.5, 0.4, 0.5], "#2c3436");
    fittings.add(`signal:${index}:lamp-bracket`, "steel", "steelSheet", [postX - 0.24, 4.4, -66], [0.42, 0.14, 0.2], iron);
    fittings.add(`signal:${index}:arm`, "steel", "steelSheet", [trackX - 1.3, 5.35, -66], [1.65, 0.18, 0.25], index % 2 === 0 ? "#a73b2e" : "#e1d0a0", [0, 0, index % 2 === 0 ? 0.18 : -0.18]);
    // The lamp hangs on the post itself (thick, tall — carries the weld) just
    // off-centre, so it reads as mounted rather than floating.
    fittings.add(`signal:${index}:lamp`, "glass", "glassPane", [postX - 0.3, 4.63, -66], [0.36, 0.44, 0.34], litWindowColor);
    lamps.push({ id: `${fittings.id}:signal:${index}:lamp`, position: [postX - 0.5, 4.63, -66], color: index % 2 === 0 ? "#ff493b" : "#ffca68", distance: 5, intensity: 1.7 });
  }
  fittings.add("water-crane:post", "steel", "steelSheet", [31.2, 3.1, -44], [0.42, 5.2, 0.42], "#3c4b4e");
  fittings.add("water-crane:nozzle-support", "steel", "steelSheet", [28.05, 2.5, -44], [0.22, 5.0, 0.22], iron);
  fittings.add("water-crane:arm", "steel", "steelSheet", [29.6, 5.55, -44], [3.3, 0.3, 0.3], "#3c4b4e", [0, 0, -0.08]);
  fittings.add("water-crane:drop", "steel", "steelSheet", [28.05, 5.0, -44], [0.25, 1.35, 0.25], iron);
  const craneBraceSize: SceneVector3 = [3.5, 0.24, 0.24];
  const craneBraceAngle = 0.58;
  fittings.add("water-crane:brace", "steel", "steelSheet", [29.55, 4.25, -44], craneBraceSize, ironLight, [0, 0, craneBraceAngle], rotatedZContactSize(craneBraceSize, craneBraceAngle));

  finish(tracks, "Rails, sleepers and buffers", "steel", "stack");
  finish(platforms, "Museum platforms", "stone", "stack");
  finish(fittings, "Platform furniture and signals", "steel", "mounted");
}

function addSegmentedWheel(
  builder: ZoneBuilder,
  prefix: string,
  x: number,
  centerY: number,
  centerZ: number,
  radius: number,
  color: string,
): void {
  const segments = 12;
  const arc = (Math.PI * 2 * radius) / segments;
  for (let index = 0; index < segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2;
    builder.add(
      `${prefix}:rim:${index}`,
      "steel",
      "steelSheet",
      [x, centerY + Math.sin(angle) * radius, centerZ + Math.cos(angle) * radius],
      [0.22, arc * 1.08, 0.24],
      color,
      [angle, 0, 0],
    );
  }
  builder.add(`${prefix}:hub`, "steel", "steelSheet", [x, centerY, centerZ], [0.34, 0.52, 0.52], ironLight);
  for (let index = 0; index < 6; index += 1) {
    const angle = (index / 6) * Math.PI * 2;
    builder.add(`${prefix}:spoke:${index}`, "steel", "steelSheet", [x, centerY, centerZ], [0.18, radius * 1.55, 0.13], color, [angle, 0, 0]);
  }
}

function addTrainWheel(
  builder: ZoneBuilder,
  prefix: string,
  x: number,
  centerY: number,
  centerZ: number,
  radius: number,
  discColor: string,
): void {
  const diameter = radius * 2;
  // Angular voxel wheel: a stepped octagonal disc of plain boxes
  // with dark tyre courses and a brass hub. Chipping it carves the same
  // cubic voxel debris as every wall in the museum.
  for (const [index, slab] of FACET_PROFILE_STANDARD.entries()) {
    builder.add(
      `${prefix}:disc:${index}`,
      "steel",
      "steelSheet",
      [x, centerY + diameter * slab.offset, centerZ],
      [index === 1 ? 0.3 : 0.24, diameter * slab.thickness, diameter * slab.width],
      index === 1 ? discColor : "#2b3133",
    );
  }
  builder.add(`${prefix}:hub`, "steel", "steelSheet", [x, centerY, centerZ], [0.42, radius * 0.42, radius * 0.42], brass);
}

function createSteamLocomotive(): void {
  const engine = zone("terminal:rolling-stock:steam-engine");
  const trackX = -9;

  engine.add("frame", "steel", "steelSheet", [trackX, 1.35, -36], [3.7, 0.46, 25], "#22292b");
  engine.add("front-buffer", "steel", "steelSheet", [trackX, 1.45, -49.1], [4.2, 0.28, 0.38], "#a43c2d");

  // The boiler is one true cylinder resting on two visible saddles bolted to
  // the frame — the engine reads as a single connected machine now.
  const boilerY = 3.15;
  const boilerZ = -39.2;
  for (const [saddleIndex, saddleZ] of [-43.2, -35.2, -46.3].entries()) {
    engine.add(`saddle:${saddleIndex}`, "steel", "steelSheet", [trackX, 1.9, saddleZ], [2.7, 0.62, 1.25], "#1c2325");
  }
  addFacetedCylinder(engine, "boiler", "steel", "steelSheet", "z", [trackX, boilerY, boilerZ], 13.8, 2.96, carriageGreen);
  for (const z of [-45.0, -41.0, -37.2, -33.4]) {
    // Brass bands ride the boiler as slightly-proud stepped rings.
    addFacetedCylinder(engine, `boiler-band:${z}`, "steel", "steelSheet", "z", [trackX, boilerY, z], 0.16, 3.08, brass);
  }

  // Smokebox, its door, chimney and brass dome — stepped octagons like the
  // boiler, so every hit carves ordinary voxel debris.
  addFacetedCylinder(engine, "smokebox", "steel", "steelSheet", "z", [trackX, boilerY, -46.3], 1.9, 2.6, "#171d1f");
  addFacetedCylinder(engine, "smokebox-door", "steel", "steelSheet", "z", [trackX, boilerY, -47.4], 0.32, 2.3, "#101517");
  addFacetedCylinder(engine, "chimney", "steel", "steelSheet", "y", [trackX, 5.35, -44.4], 1.75, 0.85, "#151b1d");
  addFacetedCylinder(engine, "chimney-cap", "steel", "steelSheet", "y", [trackX, 6.35, -44.4], 0.3, 1.2, "#14191a");
  addFacetedCylinder(engine, "steam-dome", "steel", "steelSheet", "y", [trackX, 4.98, -36.6], 0.95, 1.35, brass);
  addFacetedCylinder(engine, "steam-dome-cap", "steel", "steelSheet", "y", [trackX, 5.6, -36.6], 0.3, 0.9, "#8a6a2e");

  // Firebox closes the gap between the boiler barrel and the cab.
  engine.add("firebox", "steel", "steelSheet", [trackX, 2.83, -32.1], [3.0, 2.5, 1.9], "#24413a");
  engine.add("boiler-backhead", "steel", "steelSheet", [trackX, 3.4, -31.2], [2.6, 1.6, 0.3], "#1d2426");

  // Cab with glazed windows and a wood-lined interior.
  engine.add("cab-back", "steel", "steelSheet", [trackX, 3.75, -28.75], [3.65, 5.1, 0.34], carriageGreen);
  for (const side of [-1, 1]) {
    engine.add(`cab-side-low:${side}`, "steel", "steelSheet", [trackX + side * 1.72, 2.45, -29.8], [0.28, 2.5, 3.1], carriageGreen);
    engine.add(`cab-side-high:${side}`, "steel", "steelSheet", [trackX + side * 1.72, 5.6, -29.8], [0.28, 1.3, 3.1], carriageGreen);
    engine.add(`cab-window:${side}`, "glass", "glassPane", [trackX + side * 1.75, 4.2, -29.8], [0.12, 1.65, 1.65], glassBlue);
  }
  engine.add("cab-roof", "steel", "steelSheet", [trackX, 6.45, -29.7], [4.25, 0.26, 4.05], "#20282a");
  engine.add("cab-seat", "wood", "plank", [trackX, 1.7, -29.1], [2.5, 0.28, 0.72], oak);

  // Tender with real coal blocks.
  engine.add("tender-frame", "steel", "steelSheet", [trackX, 1.45, -22.4], [3.65, 0.4, 8.8], "#202729");
  for (const side of [-1, 1]) {
    engine.add(`tender-side:${side}`, "steel", "steelSheet", [trackX + side * 1.72, 3.25, -22.4], [0.26, 3.45, 8.3], carriageGreen);
  }
  engine.add("tender-back", "steel", "steelSheet", [trackX, 3.2, -18.25], [3.6, 3.35, 0.28], carriageGreen);
  engine.add("coal-bed", "steel", "steelSheet", [trackX, 4.28, -23.6], [3.28, 0.24, 5.6], "#252b2d");
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 5; column += 1) {
      engine.add(`coal:${row}:${column}`, "graphiteStone", "stoneBlock", [trackX - 1.25 + column * 0.62, 4.66 + row * 0.34, -23.6 + row * 0.45], [0.56, 0.52, 0.68], "#202224", [0.08 * row, 0.15 * column, 0.05]);
    }
  }

  for (const [wheelIndex, z] of [-43.2, -38.7, -34.2].entries()) {
    for (const side of [-1, 1]) {
      addTrainWheel(engine, `wheel:driver:${wheelIndex}:${side}`, trackX + side * 1.92, 1.3, z, 1.22, "#9c352c");
    }
  }
  for (const [wheelIndex, z] of [-26.4, -23.6, -20.8].entries()) {
    for (const side of [-1, 1]) {
      addTrainWheel(engine, `wheel:tender:${wheelIndex}:${side}`, trackX + side * 1.92, 0.9, z, 0.82, "#7f302a");
    }
  }
  for (const side of [-1, 1]) {
    engine.add(`connecting-rod:${side}`, "steel", "steelSheet", [trackX + side * 2.08, 1.28, -38.7], [0.14, 0.18, 10.5], brass, [0.06, 0, 0]);
  }
  // The head lamp stands proud of the smokebox door on its own bracket.
  engine.add("front-lamp-bracket", "steel", "steelSheet", [trackX, 3.05, -47.75], [0.22, 2.85, 0.22], iron);
  engine.add("front-lamp", "glass", "glassPane", [trackX, 4.45, -47.92], [0.72, 0.72, 0.22], litWindowColor);
  lamps.push({ id: `${engine.id}:front-lamp`, position: [trackX, 4.45, -48.25], color: "#fff0bd", distance: 11, intensity: 3.2 });

  finish(engine, "Museum steam locomotive", "steel", "stack");
}

function addPassengerCoach(
  builder: ZoneBuilder,
  prefix: string,
  trackX: number,
  centerZ: number,
  bodyColor: string,
): void {
  const length = 17.2;
  builder.add(`${prefix}:frame`, "steel", "steelSheet", [trackX, 1.28, centerZ], [3.55, 0.42, length], iron);
  builder.add(`${prefix}:floor`, "wood", "plank", [trackX, 1.64, centerZ], [3.42, 0.22, length - 0.45], oakDark);
  for (const side of [-1, 1]) {
    builder.add(`${prefix}:lower-side:${side}`, "steel", "steelSheet", [trackX + side * 1.69, 2.52, centerZ], [0.22, 1.7, length - 0.5], bodyColor);
    builder.add(`${prefix}:upper-rail:${side}`, "wood", "plank", [trackX + side * 1.7, 5.15, centerZ], [0.2, 0.48, length - 0.45], carriageCream);
    for (let offset = -6.4; offset <= 6.4; offset += 2.55) {
      // Panes lie flat in the carriage side: thin in X, long along the car.
      builder.add(`${prefix}:window:${side}:${offset}`, "glass", "glassPane", [trackX + side * 1.72, 4.05, centerZ + offset], [0.12, 1.62, 1.82], glassBlue);
      builder.add(`${prefix}:window-post:${side}:${offset}`, "wood", "plank", [trackX + side * 1.74, 4.05, centerZ + offset + 1.08], [0.13, 2.2, 0.13], oakDark);
    }
  }
  for (const end of [-1, 1]) {
    const endZ = centerZ + end * length / 2;
    builder.add(`${prefix}:end:${end}`, "wood", "plank", [trackX, 3.42, endZ], [3.5, 4.14, 0.24], bodyColor);
    builder.add(`${prefix}:end-door:${end}`, "wood", "plank", [trackX, 3.25, centerZ + end * (length / 2 - 0.02)], [1.35, 3.45, 0.2], oakDark);
    // Rounded gable closing the gap up to the arched roof — the square end
    // wall now meets the curve instead of leaving an open crescent.
    addFacetedGable(builder, `${prefix}:end-gable:${end}`, "wood", "plank", [trackX, 5.49, endZ], 1.75, 0.72, 0.24, bodyColor);
  }
  // Shallow segmented roof crown.
  for (let index = 0; index < 7; index += 1) {
    const angle = Math.PI * (0.15 + (index / 6) * 0.7);
    builder.add(`${prefix}:roof:${index}`, "steel", "steelSheet", [trackX + Math.cos(angle) * 2.05, 5.38 + Math.sin(angle) * 0.65, centerZ], [0.78, 0.18, length + 0.2], "#343b3d", [0, 0, angle + Math.PI / 2]);
  }
  for (const localZ of [-5.8, -2.9, 0, 2.9, 5.8]) {
    for (const side of [-1, 1]) {
      // Backs against the windows, seats facing the central aisle inward.
      addBench(builder, `${prefix}:seat:${side}:${localZ}`, trackX + side * 0.78, 1.73, centerZ + localZ, side > 0 ? -Math.PI / 2 : Math.PI / 2, 1.8);
    }
  }
  for (const bogieZ of [-5.5, 5.5]) {
    builder.add(`${prefix}:bogie:${bogieZ}`, "steel", "steelSheet", [trackX, 0.98, centerZ + bogieZ], [3.3, 0.34, 2.4], "#1d2426", undefined, [3.3, 1.9, 2.4]);
    for (const axleOffset of [-0.8, 0.8]) {
      for (const side of [-1, 1]) {
        addTrainWheel(builder, `${prefix}:wheel:${bogieZ}:${axleOffset}:${side}`, trackX + side * 1.78, 0.92, centerZ + bogieZ + axleOffset, 0.58, "#22282a");
      }
    }
  }
}

function createPassengerTrain(): void {
  const train = zone("terminal:rolling-stock:passenger-train");
  addPassengerCoach(train, "coach:green", 9, -46.5, carriageGreen);
  addPassengerCoach(train, "coach:red", 9, -26.8, "#77382f");
  train.add("coupler", "steel", "steelSheet", [9, 1.35, -36.65], [0.22, 0.22, 2.4], iron);
  finish(train, "Historic passenger train", "steel", "stack");
}

function addBaggageCart(
  builder: ZoneBuilder,
  prefix: string,
  x: number,
  y: number,
  z: number,
  yaw = 0,
): void {
  const [handleDx, handleDz] = rotateXZ(0, 1.75, yaw);
  builder.add(`${prefix}:bed`, "wood", "plank", [x, y + 0.72, z], [2.7, 0.22, 1.45], oak, [0, yaw, 0], rotatedContactSize([2.7, 0.22, 1.45], yaw));
  builder.add(`${prefix}:frame`, "steel", "steelSheet", [x, y + 0.48, z], [2.9, 0.18, 1.62], iron, [0, yaw, 0], rotatedContactSize([2.9, 0.18, 1.62], yaw));
  builder.add(`${prefix}:handle`, "steel", "steelSheet", [x + handleDx, y + 1.0, z + handleDz], [0.14, 1.05, 1.8], iron, [0.18, yaw, 0]);
  for (const [wheelIndex, local] of [
    [-0.9, -0.62],
    [0.9, -0.62],
    [-0.9, 0.62],
    [0.9, 0.62],
  ].entries()) {
    const [dx, dz] = rotateXZ(local[0], local[1], yaw);
    builder.add(`${prefix}:wheel:${wheelIndex}`, "steel", "steelSheet", [x + dx, y + 0.26, z + dz], [0.35, 0.5, 0.18], "#202426", [0, yaw, 0]);
  }
}

function createStationLife(): void {
  const life = zone("terminal:station-life");
  const forecourt = zone("terminal:forecourt");
  const landscape = zone("terminal:landscape");

  // Stone rim makes the circular map an intentional model-like island.
  const rimSegments = 64;
  for (let index = 0; index < rimSegments; index += 1) {
    const angle = (index / rimSegments) * Math.PI * 2;
    const radius = WORLD_RADIUS - 2.1;
    const baseX = Math.cos(angle) * radius;
    const baseZ = WORLD_CENTER_Z + Math.sin(angle) * radius;
    // Плиты кромки — радиальные: центр лежит на кольце, а концы уходят на
    // 4.6 м внутрь и наружу. На севере внутренний конец накрыл причал
    // «платформы 0» — там плита подрезана, иначе камень прошивает балласт
    // пути и плиту перрона. Идём от наружного конца внутрь и обрываем плиту
    // там, где начинается коридор причала.
    let stop = 4.625;
    for (let d = -4.625; d <= 4.625; d += 0.2) {
      const px = baseX - Math.cos(angle) * d;
      const pz = baseZ - Math.sin(angle) * d;
      if (px > -16 && px < 34 && pz > 72.9 && pz < 80.3) {
        stop = Math.min(stop, d - 0.35);
        break;
      }
    }
    const length = Math.min(9.25, stop + 4.275);
    if (length < 1.6) {
      continue;
    }
    const shift = (9.25 - length) / 2;
    forecourt.add(
      `rim:${index}`,
      "stone",
      "stoneBlock",
      [baseX + Math.cos(angle) * shift, 0.05, baseZ + Math.sin(angle) * shift],
      [length, 0.52, 1.05],
      index % 3 === 0 ? limestoneDark : "#77736a",
      [0, -angle, 0],
    );
  }

  // Entrance canopies: proper flat glass awnings on cast-iron posts — a
  // ledger rail on the facade, rafters spanning to the crossbeam, glass laid
  // on top, and a lantern glowing under each one above the doors.
  for (const centerX of [-9, 0, 9]) {
    for (const side of [-1, 1]) {
      addFacetedCylinder(forecourt, `canopy-post:${centerX}:${side}`, "steel", "steelSheet", "y", [centerX + side * 3.2, 3.1, 38.2], 6.2, 0.42, iron);
      forecourt.add(`canopy-foot:${centerX}:${side}`, "stone", "stoneBlock", [centerX + side * 3.2, 0.3, 38.2], [0.95, 0.58, 0.95], limestoneDark);
    }
    forecourt.add(`canopy-crossbeam:${centerX}`, "steel", "steelSheet", [centerX, 6.25, 38.2], [6.9, 0.35, 0.35], ironLight);
    forecourt.add(`canopy-ledger:${centerX}`, "steel", "steelSheet", [centerX, 6.25, 34.55], [6.9, 0.24, 0.4], ironLight);
    for (const rafterX of [-2.9, 0, 2.9]) {
      forecourt.add(`canopy-rafter:${centerX}:${rafterX}`, "steel", "steelSheet", [centerX + rafterX, 6.5, 36.6], [0.18, 0.16, 4.6], iron);
    }
    for (const side of [-1, 1]) {
      forecourt.add(`canopy-glass:${centerX}:${side}`, "glass", "glassPane", [centerX + side * 1.75, 6.66, 36.6], [2.9, 0.12, 4.5], glassBlue);
    }
    forecourt.add(`canopy-fascia:${centerX}`, "steel", "steelSheet", [centerX, 6.79, 38.8], [6.9, 0.42, 0.14], iron);
    // A pair of wall lanterns on the entrance piers lights each doorway at
    // eye level, where the light visibly reads on the doors and porch.
    for (const side of [-1, 1]) {
      addWallLantern(forecourt, `door-lamp:${centerX}:${side}`, [centerX + side * 3.02, 4.35, 34.54], [0, 1], 10, 2.9);
    }
  }

  // Dutch station forecourt: bicycle ranks, newspaper kiosks and benches.
  for (let bikeIndex = 0; bikeIndex < 12; bikeIndex += 1) {
    const x = -38 + (bikeIndex % 6) * 2.2;
    const z = 46 + Math.floor(bikeIndex / 6) * 2.4;
    for (const [wheelIndex, wheelZ] of [-0.92, 0.92].entries()) {
      addSegmentedWheel(life, `bike:${bikeIndex}:wheel:${wheelIndex}`, x, 0.82, z + wheelZ, 0.72, bikeIndex % 3 === 0 ? "#7c3028" : iron);
    }
    life.add(`bike:${bikeIndex}:frame-top`, "steel", "steelSheet", [x, 1.18, z], [0.12, 0.12, 1.65], bikeIndex % 3 === 0 ? "#7c3028" : iron, [0.12, 0, 0]);
    life.add(`bike:${bikeIndex}:frame-down`, "steel", "steelSheet", [x, 1.08, z - 0.05], [0.12, 1.25, 0.12], iron, [0.78, 0, 0]);
    life.add(`bike:${bikeIndex}:handle`, "steel", "steelSheet", [x, 1.62, z - 0.76], [0.82, 0.1, 0.1], iron);
  }
  for (let rack = 0; rack < 7; rack += 1) {
    forecourt.add(`bike-rack:${rack}`, "steel", "steelSheet", [-43 + rack * 2.2, 0.65, 47.2], [0.16, 1.1, 3.8], ironLight);
  }

  for (const [sideIndex, side] of [-1, 1].entries()) {
    const x = side * 29.5;
    forecourt.add(`kiosk:${sideIndex}:base`, "wood", "plank", [x, 1.55, 50], [5.5, 3.1, 4.4], side > 0 ? "#31564a" : "#7e3b31");
    forecourt.add(`kiosk:${sideIndex}:window`, "glass", "glassPane", [x, 2, 47.72], [3.8, 1.55, 0.12], glassBlue);
    forecourt.add(`kiosk:${sideIndex}:sign-board`, "steel", "panel", [x, 3.0, 47.74], [4.3, 1.65, 0.14], "#273033");
    forecourt.add(`kiosk:${sideIndex}:counter`, "wood", "plank", [x, 1.22, 47.85], [4.2, 0.22, 0.7], oak);
    for (const bracketX of [-1.55, 1.55]) {
      forecourt.add(`kiosk:${sideIndex}:counter-bracket:${bracketX}`, "wood", "plank", [x + bracketX, 0.65, 48.0], [0.2, 1.1, 0.6], oakDark);
    }
    forecourt.add(`kiosk:${sideIndex}:roof-left`, "steel", "steelSheet", [x - 1.5, 3.35, 50], [3.3, 0.2, 5.0], side > 0 ? "#466d62" : "#98483a", [0, 0, 0.22]);
    forecourt.add(`kiosk:${sideIndex}:roof-right`, "steel", "steelSheet", [x + 1.5, 3.35, 50], [3.3, 0.2, 5.0], side > 0 ? "#466d62" : "#98483a", [0, 0, -0.22]);
    addPixelText(forecourt, `kiosk:${sideIndex}:sign`, side > 0 ? "INFO" : "CAFE", x, 3.0, 47.64, 0.16, "#ead59b", -1);
  }

  for (const [index, [x, z, yaw]] of [
    [-15, 43, 0],
    [15, 43, 0],
    [-18, 57, Math.PI],
    [18, 57, Math.PI],
  ].entries()) {
    addBench(forecourt, `outside-bench:${index}`, x, 0.2, z, yaw, 3.1);
  }

  // Baggage is distributed in purposeful clusters, not random confetti.
  addBaggageCart(life, "cart:concourse", 5.5, 0.95, -4.0, 0.12);
  addBaggageCart(life, "cart:platform", 18, 0.95, -34, Math.PI / 2);
  addBaggageCart(life, "cart:yard", -18, 0.95, -61, -0.15);
  for (const [index, [x, y, z, size, yaw]] of [
    [6.2, 1.85, -4.2, 0.92, 0.1],
    [5.0, 1.85, -3.8, 0.72, -0.1],
    [18.2, 1.85, -34.2, 0.8, 0.2],
    [-18.2, 1.85, -61.1, 0.86, -0.2],
  ].entries()) {
    addCrate(life, `cart-crate:${index}`, x, y, z, size, yaw);
  }

  // The station park is planted with the same composite flora core as the
  // town: real trunks, branches and crowns that chop and fall — not
  // billboard cubes. Oaks carry the monumental frontage, birches loosen the
  // side arcs, pines darken the yard end.
  for (const [index, [kind, x, z, seed, scale]] of ([
    ["oak", -66, 28, 51, 1.15],
    ["birch", -72, 8, 52, 1.05],
    ["oak", -68, -18, 53, 1.2],
    ["pine", -62, -48, 54, 1.15],
    ["oak", 66, 28, 55, 1.1],
    ["birch", 72, 8, 56, 1.08],
    ["oak", 68, -18, 57, 1.22],
    ["pine", 62, -48, 58, 1.12],
    ["oak", -40, 68, 59, 1.18],
    ["oak", 40, 68, 60, 1.18],
  ] as const).entries()) {
    landscape.pieces.push(
      ...placeProp(`${landscape.id}:tree:${index}`, propTree(kind, { seed, scale }), [x, 0, z]).map(
        (piece) => ({ ...piece, clusterId: landscape.id }),
      ),
    );
  }

  // Cast-iron lamps lead from the round edge to the entrance. Пары у самой
  // платформы больше нет: её столбы примыкали к причалу и один приходился
  // ровно на лестничный марш — там теперь перронные фонари.
  for (const [index, [x, z]] of [
    [-16, 62], [16, 62], [-22, 51], [22, 51], [-35, 39], [35, 39],
  ].entries()) {
    addFacetedCylinder(forecourt, `street-lamp:${index}:post`, "steel", "steelSheet", "y", [x, 3.0, z], 5.8, 0.22, iron);
    forecourt.add(`street-lamp:${index}:arm`, "steel", "steelSheet", [x, 5.72, z - 0.45], [0.18, 0.18, 1.05], iron, [0.12, 0, 0]);
    forecourt.add(`street-lamp:${index}:glow`, "glass", "glassPane", [x, 5.45, z - 0.28], [0.58, 0.72, 0.58], litWindowColor);
    lamps.push({ id: `${forecourt.id}:street-lamp:${index}:glow`, position: [x, 5.5, z - 0.28], color: "#ffd39a", distance: 10, intensity: 3.0 });
  }

  finish(life, "Bicycles, luggage and carts", "steel", "stack");
  finish(forecourt, "Station forecourt", "stone", "mounted");
  finish(landscape, "Railway park trees", "foliage", "stack");
}

/**
 * Терминал — конечная, но поезда сюда откуда-то приходят. Две средние колеи
 * продолжаются за дебаркадер и уходят в туман за кромкой мира: рельсы ржавее
 * вокзальных, шпалы реже (часть растащили), между ними трава. У горловины —
 * пара семафоров и будка обходчика с тёплым окном; у депо — водонапорная
 * башня; подъездную дорогу перед форкортом закрывает шлагбаум. Так у карты
 * появляется открытая сторона: дальше есть куда — просто не сегодня.
 */
function createFogSiding(): void {
  const siding = zone("terminal:fog-siding");
  const fittings = zone("terminal:fog-siding:fittings");
  const fogTracks = [-9, 9];

  fogTracks.forEach((trackX, trackIndex) => {
    // Балластная лента поверх луга; у самой кромки — собственное земляное
    // основание, как у кольцевого бордюра: туман скрывает его целиком, но
    // рельсам есть на чём закончиться.
    for (let z = -74.5; z >= -104.5; z -= 6) {
      const tone = seededNoise(trackX, z, 141);
      siding.add(`ballast:${trackIndex}:${z}`, "concrete", "groundTile",
        [trackX, 0.1, z], [4.3, 0.16, 6.04],
        tone > 0.66 ? "#565751" : tone > 0.33 ? "#4e4f4a" : "#55584c");
    }
    siding.add(`footing:${trackIndex}`, "earth", "groundTile",
      [trackX, -1.13, -107.5], [4.2, 1.9, 4.6], "#4d3f31");
    // Балластная лента заканчивается ДО кольцевого бордюра — рельсы проходят
    // над его камнем, но щебень на камень не заезжает.
    siding.add(`ballast:end:${trackIndex}`, "concrete", "groundTile",
      [trackX, 0.06, -106.9], [4.3, 0.2, 3.4], "#4e4f4a");

    // Шпальная решётка непрерывна, тем же шагом, что на вокзале — колея
    // старая (тон темнее, лёгкий перекос), но колея, а не руина.
    let sleeperIndex = 0;
    for (let z = -74.2; z >= -108.4; z -= 2.25) {
      sleeperIndex += 1;
      const tone = seededNoise(trackX, z, 143);
      siding.add(`sleeper:${trackIndex}:${sleeperIndex}`, "wood", "plank",
        [trackX, 0.26, z], [3.55, 0.16, 0.34],
        tone > 0.62 ? "#46362a" : tone > 0.28 ? "#42332a" : "#3f3227",
        [0, (tone - 0.5) * 0.04, 0]);
      for (const side of [-1, 1]) {
        siding.add(`chair:${trackIndex}:${sleeperIndex}:${side}`, "steel", "steelSheet",
          [trackX + side * 0.78, 0.42, z], [0.28, 0.12, 0.25], iron);
      }
    }

    for (let z = -76.5; z >= -106.5; z -= 6) {
      for (const side of [-1, 1]) {
        siding.add(`rail:${trackIndex}:${z}:${side}`, "steel", "steelSheet",
          [trackX + side * 0.78, 0.53, z], [0.13, 0.18, 6.1], "#5d5348");
      }
    }
    // Последний отрез короче и на метр повисает над туманом: колея не
    // спрятана за упором, она просто уходит туда, куда не видно.
    for (const side of [-1, 1]) {
      siding.add(`rail:tip:${trackIndex}:${side}`, "steel", "steelSheet",
        [trackX + side * 0.78, 0.53, -108.4], [0.13, 0.18, 4.0], "#665b4d");
    }

    // Трава пробилась между шпалами — по колее давно не ходили составы.
    for (let tuft = 0; tuft < 12; tuft += 1) {
      const tz = -76 - tuft * 2.55;
      const tone = seededNoise(trackX * 3 + tuft, tz, 147);
      if (tone < 0.3) {
        continue;
      }
      siding.add(`tuft:${trackIndex}:${tuft}`, "foliage", "groundTile",
        [trackX + (tone - 0.5) * 2.2, 0.33, tz],
        [0.5 + tone * 0.4, 0.3 + tone * 0.25, 0.45], tone > 0.62 ? "#4d5f3d" : "#465939",
        [0, tone * Math.PI, 0]);
    }

    // Пикетные столбики через равные интервалы — путейская разметка ведёт
    // колею до самого тумана и обрывается вместе с ней.
    const picketX = trackX + (trackIndex === 0 ? -2.7 : 2.7);
    for (const [picketIndex, pz] of [-80, -92, -104].entries()) {
      siding.add(`picket:${trackIndex}:${picketIndex}`, "stone", "stoneBlock",
        [picketX, 0.4, pz], [0.14, 0.8, 0.14], "#ddd8cc");
      siding.add(`picket-cap:${trackIndex}:${picketIndex}`, "steel", "steelSheet",
        [picketX, 0.86, pz], [0.18, 0.11, 0.18], iron);
    }
  });

  // Семафоры горловины — по образцу вокзальных, но смотрят в туман.
  for (const [index, trackX] of fogTracks.entries()) {
    const side = index === 0 ? -1 : 1;
    const postX = trackX + side * 2.05;
    fittings.add(`fog-signal:${index}:base`, "stone", "stoneBlock", [postX, 0.47, -100], [0.9, 0.9, 0.9], limestoneDark);
    fittings.add(`fog-signal:${index}:post`, "steel", "steelSheet", [postX, 3.27, -100], [0.34, 5.6, 0.34], iron);
    fittings.add(`fog-signal:${index}:finial`, "steel", "steelSheet", [postX, 6.2, -100], [0.5, 0.4, 0.5], "#2c3436");
    fittings.add(`fog-signal:${index}:lamp-bracket`, "steel", "steelSheet", [postX + side * 0.24, 4.32, -100], [0.42, 0.14, 0.2], iron);
    fittings.add(`fog-signal:${index}:arm`, "steel", "steelSheet",
      [postX - side * 0.75, 5.27, -100], [1.65, 0.18, 0.25],
      index === 0 ? "#a73b2e" : "#e1d0a0", [0, 0, index === 0 ? 0.18 : -0.18]);
    fittings.add(`fog-signal:${index}:lamp`, "glass", "glassPane", [postX + side * 0.3, 4.55, -100], [0.36, 0.44, 0.34], litWindowColor);
    lamps.push({
      id: `${fittings.id}:fog-signal:${index}:lamp`,
      position: [postX + side * 0.5, 4.55, -100],
      color: index === 0 ? "#ff493b" : "#ffca68",
      distance: 5,
      intensity: 1.7,
    });
  }

  // Будка обходчика: кирпичный путевой пост у горловины. Тёплое окно и
  // дымоход — в тумане кто-то дежурит.
  const hutX = 15.2;
  const hutZ = -96;
  fittings.add("hut:foundation", "stone", "stoneBlock", [hutX, 0.16, hutZ], [3.1, 0.3, 2.7], limestoneDark);
  // Стены встык, как гаражный ряд: торцевые между боковыми, без нахлёста
  // копланарных граней.
  fittings.add("hut:wall:w", "brick", "brick", [hutX - 1.35, 1.38, hutZ], [0.24, 2.15, 2.4], brickRed);
  fittings.add("hut:wall:e", "brick", "brick", [hutX + 1.35, 1.38, hutZ], [0.24, 2.15, 2.4], brickDark);
  fittings.add("hut:wall:n", "brick", "brick", [hutX, 1.38, hutZ - 1.2], [2.44, 2.15, 0.24], brickRed);
  // Простенки двери от боковой стены до полотна встык; над перемычкой —
  // кирпичная вставка до верха кладки.
  fittings.add("hut:wall:s:left", "brick", "brick", [hutX - 0.845, 1.38, hutZ + 1.2], [0.77, 2.15, 0.24], brickRed);
  fittings.add("hut:wall:s:right", "brick", "brick", [hutX + 0.845, 1.38, hutZ + 1.2], [0.77, 2.15, 0.24], brickDark);
  fittings.add("hut:door-lintel", "stone", "stoneBlock", [hutX, 2.31, hutZ + 1.2], [1.35, 0.28, 0.3], limestoneDark);
  fittings.add("hut:door-head", "brick", "brick", [hutX, 2.95, hutZ + 1.2], [0.92, 1.0, 0.24], brickRed);
  fittings.pieces.push({
    id: `${fittings.id}:hut:door`,
    clusterId: fittings.id,
    material: "wood",
    shape: "plank",
    position: [hutX, 1.22, hutZ + 1.22],
    size: [0.92, 1.85, 0.08],
    color: oak,
    hinge: {
      pivot: [hutX - 0.46, 1.22, hutZ + 1.22],
      direction: [1, 0, 0],
      normal: [0, 0, 1],
    },
  });
  // Кирпичные пилястры по углам — той же кладки, что углы вокзала.
  for (const [pilasterIndex, [px, pz]] of ([
    [hutX - 1.41, hutZ - 1.26],
    [hutX + 1.41, hutZ - 1.26],
    [hutX - 1.41, hutZ + 1.26],
    [hutX + 1.41, hutZ + 1.26],
  ] as const).entries()) {
    fittings.add(`hut:pilaster:${pilasterIndex}`, "brick", "brick",
      [px, 1.38, pz], [0.3, 2.15, 0.3], brickDark);
  }
  // Окно смотрит на колею — свет из него ложится прямо на рельсы. Рама,
  // крестовый переплёт, каменный подоконник: окно, а не дыра со стеклом.
  fittings.add("hut:window-frame", "wood", "plank", [hutX - 1.455, 1.62, hutZ], [0.1, 0.98, 0.88], oakDark);
  fittings.add("hut:window", "glass", "glassPane", [hutX - 1.435, 1.62, hutZ], [0.05, 0.8, 0.7], litWindowColor);
  const muntinVertical: BreakablePieceDefinition = {
    id: `${fittings.id}:hut:muntin:v`,
    clusterId: fittings.id,
    material: "wood",
    shape: "plank",
    position: [hutX - 1.48, 1.62, hutZ],
    size: [0.04, 0.78, 0.05],
    color: oak,
    bearsLoad: false,
    attachmentSupportMode: "cable",
    sideAttachmentReach: 0.3,
  };
  const muntinHorizontal: BreakablePieceDefinition = {
    ...muntinVertical,
    id: `${fittings.id}:hut:muntin:h`,
    size: [0.04, 0.05, 0.68],
  };
  fittings.pieces.push(muntinVertical, muntinHorizontal);
  fittings.pieces.push({
    id: `${fittings.id}:hut:sill`,
    clusterId: fittings.id,
    material: "stone",
    shape: "stoneBlock",
    position: [hutX - 1.5, 1.08, hutZ],
    size: [0.14, 0.08, 0.98],
    color: limestoneDark,
    bearsLoad: false,
    sideAttachmentReach: 0.3,
  });
  lamps.push({
    id: `${fittings.id}:hut:window`,
    position: [hutX - 1.7, 1.62, hutZ],
    color: "#ffd9a1",
    distance: 8,
    intensity: 2.4,
  });
  // Водосточная труба на северо-западном углу и ступень перед дверью.
  fittings.add("hut:downpipe", "steel", "steelSheet", [hutX - 1.56, 1.22, hutZ - 1.05], [0.09, 2.4, 0.09], "#3a4245");
  fittings.pieces.push({
    id: `${fittings.id}:hut:downpipe-bend`,
    clusterId: fittings.id,
    material: "steel",
    shape: "steelSheet",
    position: [hutX - 1.44, 2.5, hutZ - 1.05],
    size: [0.3, 0.09, 0.09],
    color: "#3a4245",
    bearsLoad: false,
    sideAttachmentReach: 0.3,
  });
  fittings.add("hut:step", "stone", "stoneBlock", [hutX, 0.09, hutZ + 1.62], [1.15, 0.14, 0.5], limestone);
  // Фонарь на кронштейне у двери — второй огонь поста, над ступенью.
  fittings.pieces.push({
    id: `${fittings.id}:hut:lamp-bracket`,
    clusterId: fittings.id,
    material: "steel",
    shape: "steelSheet",
    position: [hutX + 0.75, 2.14, hutZ + 1.38],
    size: [0.08, 0.08, 0.4],
    color: iron,
    bearsLoad: false,
    sideAttachmentReach: 0.35,
  });
  fittings.pieces.push({
    id: `${fittings.id}:hut:lantern`,
    clusterId: fittings.id,
    material: "glass",
    shape: "glassPane",
    position: [hutX + 0.75, 1.92, hutZ + 1.52],
    size: [0.22, 0.3, 0.22],
    color: litWindowColor,
    bearsLoad: false,
    attachmentSupportMode: "cable",
    sideAttachmentReach: 0.35,
  });
  lamps.push({
    id: `${fittings.id}:hut:lantern`,
    position: [hutX + 0.75, 1.92, hutZ + 1.62],
    color: "#ffd49a",
    distance: 7,
    intensity: 2.2,
  });
  // Эмалированная табличка поста и дежурный инвентарь: ведро и лопата у
  // стены — здесь работают, а не позируют.
  fittings.pieces.push({
    id: `${fittings.id}:hut:plate`,
    clusterId: fittings.id,
    material: "steel",
    shape: "steelSheet",
    position: [hutX - 0.75, 1.98, hutZ + 1.34],
    size: [0.42, 0.28, 0.04],
    color: "#2e4657",
    bearsLoad: false,
    sideAttachmentReach: 0.3,
  });
  addFacetedCylinder(fittings, "hut:bucket", "steel", "steelSheet", "y", [hutX + 1.75, 0.19, hutZ + 0.7], 0.34, 0.3, "#4a5357");
  fittings.add("hut:shovel-shaft", "wood", "plank", [hutX + 1.62, 0.72, hutZ - 0.4], [0.05, 1.45, 0.05], oak, [0, 0, 0.24]);
  fittings.pieces.push({
    id: `${fittings.id}:hut:shovel-blade`,
    clusterId: fittings.id,
    material: "steel",
    shape: "steelSheet",
    position: [hutX + 1.79, 0.12, hutZ - 0.4],
    size: [0.16, 0.26, 0.03],
    color: "#4d5356",
    bearsLoad: false,
    attachmentSupportMode: "cable",
    sideAttachmentReach: 0.3,
  });
  // Кирпичный карнизный поясок закрывает узел стена-кровля; крыша лежит на
  // нём свесом, а не режет верх кладки.
  fittings.add("hut:cornice", "brick", "brick", [hutX, 2.51, hutZ], [3.08, 0.11, 2.68], brickDark);
  const hutRoofSize: SceneVector3 = [3.5, 0.14, 3.1];
  fittings.add("hut:roof", "steel", "steelSheet", [hutX, 2.66, hutZ], hutRoofSize, "#3a4245",
    [0.08, 0, 0], [3.0, 0.34, 2.6]);
  // Труба несёт восточная стена — сквозь свес крыши, как и положено печной
  // трубе; на наклонной кровле решателю не на что её опереть.
  fittings.add("hut:chimney", "brick", "brick", [hutX + 1.32, 3.27, hutZ - 0.6], [0.36, 1.65, 0.36], brickDark);
  fittings.add("hut:chimney-cap", "stone", "stoneBlock", [hutX + 1.32, 4.15, hutZ - 0.6], [0.46, 0.1, 0.46], limestoneDark);
  addCrate(fittings, "hut:crate", hutX + 1.7, 0.02, hutZ + 1.1, 0.85, 0.4);
  // Пикетный столбик: белый камень с чугунной шапкой у самой колеи.
  fittings.add("hut:marker", "stone", "stoneBlock", [11.6, 0.44, hutZ], [0.16, 0.85, 0.16], "#ddd8cc");
  fittings.add("hut:marker-cap", "steel", "steelSheet", [11.6, 0.92, hutZ], [0.2, 0.12, 0.2], iron);

  // Водонапорная башня у депо: гидроколонке в конце платформ нужен запас
  // воды — теперь видно, откуда он. Стоит восточнее крайней колоннады
  // дебаркадера (x≈34.7) с запасом на палубу и раскосы.
  const towerX = 38.6;
  const towerZ = -58;
  for (const [legIndex, [lx, lz]] of ([
    [towerX - 1.15, towerZ - 1.15],
    [towerX + 1.15, towerZ - 1.15],
    [towerX - 1.15, towerZ + 1.15],
    [towerX + 1.15, towerZ + 1.15],
  ] as const).entries()) {
    fittings.add(`tower:leg:${legIndex}`, "steel", "steelSheet", [lx, 2.32, lz], [0.3, 4.6, 0.3], iron);
    fittings.add(`tower:shoe:${legIndex}`, "steel", "steelSheet", [lx, 0.14, lz], [0.5, 0.24, 0.5], "#2c3436");
  }
  fittings.add("tower:deck", "steel", "steelSheet", [towerX, 4.72, towerZ], [3.1, 0.2, 3.1], ironLight);
  addFacetedCylinder(fittings, "tower:tank", "steel", "steelSheet", "y", [towerX, 6.6, towerZ], 3.5, 3.6, "#3d4549");
  fittings.add("tower:lid", "steel", "steelSheet", [towerX, 8.42, towerZ], [2.7, 0.14, 2.7], "#2c3436");
  fittings.add("tower:finial", "steel", "steelSheet", [towerX, 8.66, towerZ], [0.3, 0.34, 0.3], iron);
  // Крестовые раскосы на всех четырёх гранях — клёпаная ферма, а не четыре
  // палки с ящиком сверху.
  for (const [faceIndex, face] of ([
    { center: [towerX, 2.3, towerZ - 1.15] as SceneVector3, size: [2.5, 0.08, 0.08] as SceneVector3, tilt: [0, 0, 0.62] as SceneVector3 },
    { center: [towerX, 2.3, towerZ - 1.15] as SceneVector3, size: [2.5, 0.08, 0.08] as SceneVector3, tilt: [0, 0, -0.62] as SceneVector3 },
    { center: [towerX, 2.3, towerZ + 1.15] as SceneVector3, size: [2.5, 0.08, 0.08] as SceneVector3, tilt: [0, 0, 0.62] as SceneVector3 },
    { center: [towerX, 2.3, towerZ + 1.15] as SceneVector3, size: [2.5, 0.08, 0.08] as SceneVector3, tilt: [0, 0, -0.62] as SceneVector3 },
    { center: [towerX - 1.15, 2.3, towerZ] as SceneVector3, size: [0.08, 0.08, 2.5] as SceneVector3, tilt: [0.62, 0, 0] as SceneVector3 },
    { center: [towerX - 1.15, 2.3, towerZ] as SceneVector3, size: [0.08, 0.08, 2.5] as SceneVector3, tilt: [-0.62, 0, 0] as SceneVector3 },
    { center: [towerX + 1.15, 2.3, towerZ] as SceneVector3, size: [0.08, 0.08, 2.5] as SceneVector3, tilt: [0.62, 0, 0] as SceneVector3 },
    { center: [towerX + 1.15, 2.3, towerZ] as SceneVector3, size: [0.08, 0.08, 2.5] as SceneVector3, tilt: [-0.62, 0, 0] as SceneVector3 },
  ] as const).entries()) {
    fittings.pieces.push({
      id: `${fittings.id}:tower:brace:${faceIndex}`,
      clusterId: fittings.id,
      material: "steel",
      shape: "steelSheet",
      position: face.center,
      size: face.size,
      color: ironLight,
      rotation: face.tilt,
      bearsLoad: false,
      attachmentSupportMode: "cable",
      sideAttachmentReach: 0.7,
    });
  }
  // Лесенка на бак: тетивы стоят на литых башмаках, перекладины навешены.
  // Лестница отодвинута от палубы: если её верх касается настила, решатель
  // отправляет вес бака через семисантиметровую жердь — и рушит её.
  for (const [stringerIndex, sx] of [towerX - 0.26, towerX + 0.26].entries()) {
    fittings.add(`tower:ladder:shoe:${stringerIndex}`, "steel", "steelSheet",
      [sx, 0.09, towerZ - 2.0], [0.3, 0.14, 0.3], "#2c3436");
    fittings.add(`tower:ladder:stringer:${stringerIndex}`, "steel", "steelSheet",
      [sx, 2.72, towerZ - 2.0], [0.07, 5.3, 0.07], iron);
  }
  for (let rung = 0; rung < 7; rung += 1) {
    fittings.pieces.push({
      id: `${fittings.id}:tower:ladder:rung:${rung}`,
      clusterId: fittings.id,
      material: "steel",
      shape: "steelSheet",
      position: [towerX, 0.72 + rung * 0.64, towerZ - 2.0],
      size: [0.46, 0.05, 0.05],
      color: ironLight,
      bearsLoad: false,
      sideAttachmentReach: 0.35,
    });
  }
  // Водоразборный стояк — отдельной опорой в землю, коленом к баку; под
  // краном дежурит бочка.
  fittings.add("tower:standpipe", "steel", "steelSheet", [towerX - 1.85, 1.32, towerZ], [0.24, 2.6, 0.24], "#3c4b4e");
  fittings.add("tower:standpipe-bend", "steel", "steelSheet", [towerX - 1.55, 2.72, towerZ], [0.85, 0.2, 0.2], "#3c4b4e");
  addFacetedCylinder(fittings, "tower:barrel", "wood", "plank", "y", [towerX - 2.5, 0.52, towerZ + 0.55], 1.0, 0.8, oakDark);

  // Ни шлагбаумов, ни будки дежурного здесь больше нет: место у оси входа
  // отдано причалу «платформы 0» — стрелы перекрывали лестничные марши, а
  // будка стояла ровно там, где теперь стоят пассажиры.
  finish(siding, "Overgrown siding into the fog", "steel", "stack");
  finish(fittings, "Fog throat: signals, hut, tower and barrier", "steel", "mounted");
}

/**
 * Служебный пояс вокзала. Музейный терминал не живёт один в поле: слева от
 * путей — кирпичный пакгауз с погрузочной рампой и воротами, справа —
 * мастерская с угольным закромом при водонапорной башне. Оба говорят
 * языком головного здания: известняковый цоколь, красный кирпич с
 * пилястрами, стальные рамы, арочные фронтоны.
 */
function createServiceBuildings(): void {
  const depot = zone("terminal:service");

  // --- Пакгауз (запад, вдоль путей) ---------------------------------------
  // Геометрия сведена узлами: стены до карниза (top 3.9), карнизный пояс
  // 3.9..4.14, скаты от свеса y 4.1 к коньку 4.95 (уклон 0.209 рад),
  // фронтоны — ступенчатые треугольники ровно под этот уклон.
  const wxC = -58;
  const wzC = -26;
  const wallTop = 3.9;
  const wallH = wallTop - 0.48;
  const wallY = 0.48 + wallH / 2;
  depot.add("goods:foundation", "stone", "stoneBlock", [wxC, 0.24, wzC], [7.9, 0.5, 15.3], limestoneDark);

  // Западная стена — честные оконные проёмы: подоконная лента, простенки,
  // надоконная лента; рамы стоят В проёмах, не поверх кладки.
  depot.add("goods:wall:w:sill-band", "brick", "brick", [wxC - 3.6, 1.29, wzC], [0.3, 1.62, 14.4], brickRed);
  depot.add("goods:wall:w:head-band", "brick", "brick", [wxC - 3.6, 3.47, wzC], [0.3, 0.86, 14.4], brickRed);
  // Раскладка стены: 1.83 + 2.44 + 1.71 + 2.44 + 1.71 + 2.44 + 1.83 = 14.4;
  // рамы на сантиметр уже проёмов — в кладку не врезаются.
  for (const [pier, [pz, pw]] of ([
    [wzC - 6.285, 1.83], [wzC - 2.075, 1.71], [wzC + 2.075, 1.71], [wzC + 6.285, 1.83],
  ] as const).entries()) {
    depot.add(`goods:wall:w:pier:${pier}`, "brick", "brick",
      [wxC - 3.6, 2.57, pz], [0.3, 0.94, pw], brickDark);
  }
  for (const [windowIndex, pz] of [wzC - 4.15, wzC, wzC + 4.15].entries()) {
    depot.add(`goods:window-frame:${windowIndex}`, "steel", "steelSheet",
      [wxC - 3.6, 2.57, pz], [0.24, 0.94, 2.42], iron);
    depot.add(`goods:window:${windowIndex}`, "glass", "glassPane",
      [wxC - 3.6, 2.57, pz], [0.08, 0.78, 2.2],
      windowIndex === 1 ? litWindowColor : glassBlue);
  }
  lamps.push({
    id: `${depot.id}:goods:window:1`,
    position: [wxC - 3.95, 2.57, wzC],
    color: "#ffd9a1",
    distance: 8,
    intensity: 2.2,
  });

  // Восточный фасад разбит точной раскладкой: простенок 2.6 — проём 3.24 —
  // простенок 2.72 — проём 3.24 — простенок 2.6 = 14.4 м между торцами.
  // Кромка каждого простенка совпадает с кромкой створки, петля стоит на
  // косяке; перемычка перекрывает проём с опорой по 0.2 м на простенки.
  for (const [pier, [pz, pw]] of ([
    [wzC - 5.9, 2.6], [wzC, 2.72], [wzC + 5.9, 2.6],
  ] as const).entries()) {
    depot.add(`goods:wall:e:${pier}`, "brick", "brick",
      [wxC + 3.6, wallY, pz], [0.3, wallH, pw], pier % 2 === 0 ? brickRed : brickDark);
  }
  for (const [gateIndex, gz] of [wzC - 2.98, wzC + 2.98].entries()) {
    depot.add(`goods:lintel:${gateIndex}`, "concrete", "panel",
      [wxC + 3.6, 3.69, gz], [0.36, 0.42, 3.64], "#a9aca8");
    for (const side of [-1, 1] as const) {
      depot.pieces.push({
        id: `${depot.id}:goods:gate:${gateIndex}:${side}`,
        clusterId: depot.id,
        material: "wood",
        shape: "plank",
        position: [wxC + 3.62, 1.98, gz + side * 0.81],
        size: [0.12, 2.96, 1.62],
        color: side < 0 ? "#5d4a33" : "#55432e",
        hinge: {
          pivot: [wxC + 3.62, 1.98, gz + side * 1.62],
          direction: [0, 0, -side],
          normal: [1, 0, 0],
        },
      });
    }
  }

  // Торцы и ступенчатые фронтоны под уклон кровли.
  for (const [endIndex, ez] of [wzC - 7.35, wzC + 7.35].entries()) {
    depot.add(`goods:wall:end:${endIndex}`, "brick", "brick",
      [wxC, wallY, ez], [7.2, wallH, 0.3], endIndex === 0 ? brickRed : brickDark);
    for (let step = 0; step < 4; step += 1) {
      const frac = (step + 0.5) / 4;
      depot.add(`goods:gable:${endIndex}:${step}`, "brick", "brick",
        [wxC, wallTop + 0.125 + step * 0.25, ez],
        [7.2 * (1 - frac), 0.25, 0.3], limestone);
    }
  }
  for (const [pilaster, [px, pz]] of ([
    [wxC - 3.6, wzC - 7.3], [wxC + 3.6, wzC - 7.3],
    [wxC - 3.6, wzC + 7.3], [wxC + 3.6, wzC + 7.3],
  ] as const).entries()) {
    depot.add(`goods:pilaster:${pilaster}`, "brick", "brick",
      [px, wallY, pz], [0.44, wallH, 0.44], brickDark);
  }

  // Карнизный пояс по периметру: закрывает узел стена-кровля.
  depot.add("goods:cornice:e", "stone", "stoneBlock", [wxC + 3.6, 4.02, wzC], [0.48, 0.24, 15.2], limestone);
  depot.add("goods:cornice:w", "stone", "stoneBlock", [wxC - 3.6, 4.02, wzC], [0.48, 0.24, 15.2], limestone);

  // Скаты: свес y 4.1 у x = ±4.0, конёк 4.95 в оси. Контакт — по стенам.
  for (const side of [-1, 1] as const) {
    depot.add(`goods:roof:${side}`, "steel", "steelSheet",
      [wxC + side * 2.0, 4.6, wzC], [4.09, 0.15, 15.9], "#3a4245",
      [0, 0, -side * 0.209], [3.3, 0.5, 15.3]);
  }
  depot.add("goods:ridge", "wood", "plank", [wxC, 5.02, wzC], [0.36, 0.2, 15.9], oakDark,
    undefined, [0.36, 0.5, 15.3]);

  // Рампа: покрытие шире базы (капельник), пандус контактом на грунт.
  depot.add("goods:ramp:base", "concrete", "panel", [wxC + 4.65, 0.47, wzC], [1.9, 0.86, 12.8], "#77756f");
  depot.add("goods:ramp:surface", "stone", "groundTile", [wxC + 4.65, 0.96, wzC], [1.98, 0.12, 12.94], "#9d9789");
  depot.add("goods:ramp:slope", "concrete", "panel",
    [wxC + 4.65, 0.6, wzC - 7.7], [1.94, 0.14, 2.6], "#7d7b74", [0.34, 0, 0], [1.9, 0.3, 2.2]);

  // Кронштейн лежит на карнизе, фонарь стоит на конце кронштейна.
  depot.add("goods:lamp-bracket", "steel", "steelSheet", [wxC + 3.85, 4.24, wzC], [0.5, 0.08, 0.08], iron);
  depot.add("goods:lamp", "glass", "glassPane", [wxC + 3.94, 4.44, wzC], [0.24, 0.3, 0.24], litWindowColor);
  depot.add("goods:lamp-cap", "steel", "steelSheet", [wxC + 3.94, 4.63, wzC], [0.3, 0.08, 0.3], iron);
  lamps.push({
    id: `${depot.id}:goods:lamp`,
    position: [wxC + 4.15, 4.44, wzC],
    color: "#ffd49a",
    distance: 9,
    intensity: 2.6,
  });
  for (const [trackIndex, tx] of [-45.5, -49.5].entries()) {
    depot.add(`goods:approach:${trackIndex}`, "earth", "groundTile",
      [tx, 0.02, wzC], [4.2, 0.08, 5.2], trackIndex % 2 === 0 ? "#6a5a42" : "#63543d");
  }

  // --- Мастерская с угольным закромом (восток, при водонапорке) -----------
  // Та же дисциплина узлов: стены до 3.94, карниз 3.94..4.18, скаты от
  // свеса 4.14 к коньку 4.98, фронтоны-треугольники в торцах вдоль Z.
  const mxC = 56;
  const mzC = -30;
  const shopWallTop = 3.94;
  const shopH = shopWallTop - 0.44;
  const shopY = 0.44 + shopH / 2;
  depot.add("shop:foundation", "stone", "stoneBlock", [mxC, 0.22, mzC], [11.0, 0.46, 8.0], limestoneDark);

  // Длинные стены между внутренними гранями торцов (9.8), углы встык.
  depot.add("shop:wall:n", "brick", "brick", [mxC, shopY, mzC - 3.55], [9.8, shopH, 0.3], brickRed);
  // Южная стена: подоконная и надоконная ленты + простенки, окна в проёмах.
  depot.add("shop:wall:s:sill-band", "brick", "brick", [mxC, 1.27, mzC + 3.55], [9.8, 1.66, 0.3], brickRed);
  depot.add("shop:wall:s:head-band", "brick", "brick", [mxC, 3.49, mzC + 3.55], [9.8, 0.9, 0.3], brickRed);
  // Раскладка оконного яруса: 1.5 + 2.8 + 1.2 + 2.8 + 1.5 = 9.8 между
  // торцами; рамы на сантиметр уже проёмов.
  for (const [pier, [px, pw]] of ([
    [mxC - 4.15, 1.5], [mxC, 1.2], [mxC + 4.15, 1.5],
  ] as const).entries()) {
    depot.add(`shop:wall:s:pier:${pier}`, "brick", "brick",
      [px, 2.57, mzC + 3.55], [pw, 0.94, 0.3], brickDark);
  }
  for (const [windowIndex, px] of [mxC - 2, mxC + 2].entries()) {
    depot.add(`shop:window-frame:${windowIndex}`, "steel", "steelSheet",
      [px, 2.57, mzC + 3.55], [2.78, 0.94, 0.24], iron);
    depot.add(`shop:window:${windowIndex}`, "glass", "glassPane",
      [px, 2.57, mzC + 3.55], [2.5, 0.78, 0.08],
      windowIndex === 0 ? litWindowColor : glassBlue);
  }
  lamps.push({
    id: `${depot.id}:shop:window:0`,
    position: [mxC - 2.35, 2.57, mzC + 3.95],
    color: "#ffd9a1",
    distance: 8,
    intensity: 2.2,
  });

  depot.add("shop:wall:e", "brick", "brick", [mxC + 5.05, shopY, mzC], [0.3, shopH, 7.4], brickDark);
  for (const [pier, pz] of [mzC - 2.75, mzC + 2.75].entries()) {
    depot.add(`shop:wall:w:${pier}`, "brick", "brick",
      [mxC - 5.05, shopY, pz], [0.3, shopH, 1.9], pier % 2 === 0 ? brickRed : brickDark);
  }
  depot.add("shop:lintel", "concrete", "panel", [mxC - 5.05, 3.67, mzC], [0.36, 0.54, 3.9], "#a9aca8");
  for (const side of [-1, 1] as const) {
    depot.pieces.push({
      id: `${depot.id}:shop:gate:${side}`,
      clusterId: depot.id,
      material: "wood",
      shape: "plank",
      position: [mxC - 5.07, 1.94, mzC + side * 0.92],
      size: [0.12, 2.92, 1.78],
      color: side < 0 ? "#5d4a33" : "#55432e",
      hinge: {
        pivot: [mxC - 5.07, 1.94, mzC + side * 1.8],
        direction: [0, 0, -side],
        normal: [1, 0, 0],
      },
    });
  }
  // Фронтоны-треугольники в торцах, курсы вдоль Z, под уклон скатов.
  for (const [endIndex, ex] of [mxC - 5.05, mxC + 5.05].entries()) {
    for (let step = 0; step < 4; step += 1) {
      const frac = (step + 0.5) / 4;
      depot.add(`shop:gable:${endIndex}:${step}`, "brick", "brick",
        [ex, shopWallTop + 0.125 + step * 0.25, mzC],
        [0.3, 0.25, 7.4 * (1 - frac)], limestone);
    }
  }
  depot.add("shop:cornice:n", "stone", "stoneBlock", [mxC, 4.06, mzC - 3.55], [10.8, 0.24, 0.48], limestone);
  depot.add("shop:cornice:s", "stone", "stoneBlock", [mxC, 4.06, mzC + 3.55], [10.8, 0.24, 0.48], limestone);
  for (const side of [-1, 1] as const) {
    depot.add(`shop:roof:${side}`, "steel", "steelSheet",
      [mxC, 4.62, mzC + side * 1.95], [11.4, 0.15, 4.0], "#3a4245",
      [side * 0.212, 0, 0], [10.8, 0.5, 3.2]);
  }
  depot.add("shop:ridge", "wood", "plank", [mxC, 5.04, mzC], [11.4, 0.2, 0.36], oakDark,
    undefined, [10.8, 0.5, 0.36]);
  // Трубу несёт северная стена; ствол проходит сквозь свес ската и
  // заканчивается выше конька.
  depot.add("shop:chimney", "brick", "brick", [mxC + 3.4, 4.5, mzC - 3.4], [0.4, 2.6, 0.4], brickDark);
  depot.add("shop:chimney-cap", "stone", "stoneBlock", [mxC + 3.4, 5.86, mzC - 3.4], [0.5, 0.12, 0.5], limestoneDark);

  addCrate(depot, "shop:crate:a", mxC + 4.0, 0.02, mzC + 4.9, 0.9, 0.25);
  addCrate(depot, "shop:crate:b", mxC + 4.7, 0.02, mzC + 4.5, 0.7, -0.4);
  addFacetedCylinder(depot, "shop:drum", "steel", "steelSheet", "y", [mxC - 4.2, 0.62, mzC + 4.8], 1.1, 0.7, "#4c6178");

  for (const [wallIndex, wall] of ([
    { position: [47.4, 0.92, -49.4], size: [0.24, 1.8, 4.6] },
    { position: [51.8, 0.92, -49.4], size: [0.24, 1.8, 4.6] },
    { position: [49.6, 0.92, -51.6], size: [4.6, 1.8, 0.24] },
  ] as const).entries()) {
    depot.add(`coal:wall:${wallIndex}`, "concrete", "panel",
      [...wall.position] as SceneVector3, [...wall.size] as SceneVector3, "#8f9595");
  }
  depot.pieces.push({
    id: `${depot.id}:coal:heap`,
    clusterId: depot.id,
    material: "earth",
    shape: "stoneBlock",
    position: [49.6, 0.5, -49.9],
    size: [3.8, 1.05, 3.4],
    color: "#1e2022",
    rotation: [0, 0.1, 0],
    contactBoxes: [{ position: [49.6, 0.5, -49.9], size: [2.6, 1.05, 2.2] }],
  });
  depot.add("coal:spill", "earth", "stoneBlock", [49.7, 0.14, -46.9], [2.4, 0.3, 1.4], "#26282a");

  finish(depot, "Goods shed, workshop and coal store", "brick", "mounted");
}


/**
 * ПЕРРОН 0 И ЛЕТАЮЩИЙ СОСТАВ. Тупиковый вокзал уверенно говорит одно слово —
 * «перрон», поэтому причал для корабля-хамелеона здесь не мачта и не мостки,
 * а ещё одна платформа: та же плита с каменной поверхностью, тот же чугунный
 * навес, часы и табло, что внутри дебаркадера, только выставленные наружу, за
 * шлагбаумы привокзальной площади.
 *
 * Путь идёт вдоль кромки мира: одним концом упирается в буферный упор, другим
 * тает в тумане — небесная линия обходит мир по ободу, и вокзал у неё одна из
 * станций. Состав двухвагонный, головной вагон стоит ровно напротив ворот
 * (x = 0), и маршрут читается сам: вагон → перрон → шлагбаум → площадь →
 * фасад.
 *
 * Правила сборки транспорта — games/make-a-mess/docs/transport-lessons.md.
 * Что здесь важно:
 *   - состав держит «подъёмное сердце» (earth) внутри оболочки: разбил его —
 *     падает весь поезд, а перрон, навес, путь и упор остаются;
 *   - перрон кораблю НЕ опора: между кромкой платформы и бортом вагона 45 см,
 *     сходни принадлежат перрону и до вагона не достают;
 *   - контактные коробки в ЭТОМ файле МИРОВЫЕ: сцена собирается кластерами
 *     напрямую, без compileScene (в документах города — наоборот, локальные);
 *   - оболочка лежит вдоль мировой оси X, поэтому кольцевой поворот
 *     [phi, 0, 0] тут законен — Rx крутит ровно вокруг оси корпуса. В любой
 *     другой ориентации так писать нельзя (см. §4.12 плейбука);
 *   - габарит выверен по стене мира R = 98 вокруг (0, −14): хвостовые кили на
 *     x ≈ 19 дают R = 97.5, поэтому путь идёт по z = 77.6, а не дальше к краю.
 */
/**
 * Обмер «платформы 0» и небесного поезда: тесты проверяют проходимость,
 * габарит и посадку по ЭТИМ числам, а не по своим копиям.
 */
export const skyBerthMetrics = {
  trackZ: 77.6,
  platformZ: 74.05,
  platformHalf: 1.65,
  platformTop: 1.3,
  platformFrom: -10.5,
  platformTo: 21,
  stairSteps: 5,
  stairTread: 0.36,
  headX: -1.1,
  tailX: 12.3,
  carLength: 12.4,
  carHalf: 1.55,
  floorTop: 1.5,
  cabFront: -9.25,
  cabRear: -7.3,
  cabFrontHalf: 1.05,
  hullY: 9.4,
  hullRadius: 3,
  hullFrom: -10.2,
  hullTo: 21.4,
  hullRadiusAt(x: number): number {
    const length = this.hullTo - this.hullFrom;
    const t = (x - this.hullFrom) / length;
    if (t < 0.2) {
      return this.hullRadius * Math.sqrt(Math.max(0, 1 - ((0.2 - t) / 0.2) ** 2));
    }
    if (t > 0.64) {
      return this.hullRadius * Math.pow(Math.max(0, 1 - ((t - 0.64) / 0.36) ** 2), 0.55);
    }
    return this.hullRadius;
  },
} as const;

function createSkyPlatform(): void {
  const berth = zone("terminal:sky-berth");
  const train = zone(SKY_TRAIN_CLUSTER_ID);
  const platformDockLighting: LampEventLightingDefinition = {
    sourceClusterId: train.id,
    levels: {
      docked: { intensityMultiplier: 2, distanceMultiplier: 1.18 },
      inTransit: { intensityMultiplier: 1, distanceMultiplier: 1 },
    },
  };
  const cabinDockLighting: LampEventLightingDefinition = {
    sourceClusterId: train.id,
    levels: {
      docked: { intensityMultiplier: 1, distanceMultiplier: 1 },
      inTransit: { intensityMultiplier: 0.14, distanceMultiplier: 0.5 },
    },
  };
  const mooringManeuverLighting: LampEventLightingDefinition = {
    sourceClusterId: train.id,
    levels: {
      docked: { intensityMultiplier: 0, distanceMultiplier: 1 },
      inTransit: { intensityMultiplier: 0, distanceMultiplier: 1 },
      departure: { intensityMultiplier: 1, distanceMultiplier: 1 },
      cruise: { intensityMultiplier: 0, distanceMultiplier: 1 },
      approach: { intensityMultiplier: 1, distanceMultiplier: 1 },
    },
  };

  // ZoneBuilder.add не умеет флаги решателя, а парящему составу они нужны.
  function part(
    builder: ZoneBuilder,
    suffix: string,
    material: BreakableMaterial,
    shape: BreakableShape,
    position: SceneVector3,
    size: SceneVector3,
    color: string,
    options: Partial<BreakablePieceDefinition> = {},
  ): void {
    builder.pieces.push({
      id: `${builder.id}:${suffix}`,
      clusterId: builder.id,
      material,
      shape,
      position,
      size,
      color,
      ...options,
    });
  }

  /** Ordinary breakable box stretched between two authored points. */
  function beamBetween(
    builder: ZoneBuilder,
    suffix: string,
    material: BreakableMaterial,
    shape: BreakableShape,
    from: SceneVector3,
    to: SceneVector3,
    thickness: number,
    color: string,
    options: Partial<BreakablePieceDefinition> = {},
  ): void {
    const delta: SceneVector3 = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
    const length = Math.hypot(...delta);
    if (length < 1e-6) {
      return;
    }
    // Three.js uses intrinsic XYZ Euler angles. With rx = 0 the local X axis
    // becomes [cos(ry)cos(rz), sin(rz), -sin(ry)cos(rz)]. The signs matter:
    // the opposite pair leaves the centre correct but points both beam ends
    // away from their authored anchors.
    const yRotation = Math.atan2(-delta[2], delta[0]);
    const zRotation = Math.asin(Math.max(-1, Math.min(1, delta[1] / length)));
    part(builder, suffix, material, shape,
      [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2],
      [length, thickness, thickness], color, {
        ...options,
        rotation: [0, yRotation, zRotation],
      });
  }

  const TRACK_Z = 77.6;
  const PLATFORM_Z = 74.05;
  const PLATFORM_HALF = 1.65;
  // Перрон высокий: его строили под небесный поезд, и его настил лежит на
  // одну ступень ниже пола вагона — посадка в один шаг 20 см, а не прыжок.
  const PLATFORM_TOP = 1.3;
  const PLATFORM_FROM = -10.5;
  const PLATFORM_TO = 21;
  // The driver's bay now occupies the old empty metre ahead of the first
  // coach. The stop remains a real obstacle, but sits beyond its glazing.
  const BUFFER_X = -10.55;
  const CAR_LENGTH = 12.4;
  const CAR_HALF = 1.55;
  const CAR_FLOOR = 1.34;
  const HEAD_X = -1.1;
  const TAIL_X = 12.3;
  const CAB_REAR_X = HEAD_X - CAR_LENGTH / 2;
  const CAB_FRONT_X = -9.25;
  const CAB_REAR_HALF = 1.42;
  const CAB_FRONT_HALF = 1.05;
  const HULL_Y = 9.4;
  const HULL_RADIUS = 3.0;
  const HULL_FROM = -10.2;
  const HULL_TO = 21.4;
  const HULL_LENGTH = HULL_TO - HULL_FROM;
  const linen = "#cfc6ae";
  const linenDark = "#c0b69d";
  const linenShade = "#a89f89";

  // --- Путь у самой кромки -------------------------------------------------
  // Балласт лежит поверх плитки площади: перрон 0 пристроили позже, и он
  // этого не скрывает.
  for (let x = PLATFORM_FROM - 1.5; x <= 25; x += 6) {
    const tone = seededNoise(x, TRACK_Z, 211);
    berth.add(`ballast:${x.toFixed(0)}`, "concrete", "groundTile",
      [x, 0.12, TRACK_Z], [6.04, 0.2, 3.8],
      tone > 0.66 ? "#565751" : tone > 0.33 ? "#4e4f4a" : "#55584c");
  }
  let sleeperIndex = 0;
  for (let x = PLATFORM_FROM - 1.2; x <= 26.5; x += 2.25) {
    sleeperIndex += 1;
    const tone = seededNoise(x, TRACK_Z, 213);
    berth.add(`sleeper:${sleeperIndex}`, "wood", "plank",
      [x, 0.28, TRACK_Z], [0.34, 0.16, 3.55],
      tone > 0.62 ? "#46362a" : tone > 0.28 ? "#42332a" : "#3f3227");
  }
  for (const side of [-1, 1] as const) {
    for (let x = PLATFORM_FROM - 1; x <= 24; x += 6.1) {
      berth.add(`rail:${side}:${x.toFixed(0)}`, "steel", "steelSheet",
        [x, 0.45, TRACK_Z + side * 0.78], [6.1, 0.18, 0.13], "#51595b");
    }
  }

  // Буферный упор: тот же чугун, что у музейных тупиков, только развёрнутый —
  // путь здесь идёт вдоль X.
  for (const side of [-1, 1] as const) {
    berth.add(`buffer-leg:${side}`, "steel", "steelSheet",
      [BUFFER_X - 0.55, 0.92, TRACK_Z + side * 0.72], [1.25, 1.25, 0.22], iron, [0, 0, 0.55]);
  }
  berth.add("buffer-beam", "steel", "steelSheet",
    [BUFFER_X + 0.02, 1.58, TRACK_Z], [0.34, 0.42, 2.1], "#2f3335");
  berth.add("buffer-face", "steel", "steelSheet",
    [BUFFER_X + 0.22, 1.58, TRACK_Z], [0.1, 0.44, 2.0], "#a43c2d");
  berth.add("buffer-ring", "steel", "steelSheet",
    [BUFFER_X + 0.26, 1.24, TRACK_Z], [0.12, 0.3, 0.3], brass);
  berth.add("buffer-lamp", "glass", "glassPane",
    [BUFFER_X - 0.1, 2.08, TRACK_Z], [0.24, 0.26, 0.24], litWindowColor);
  lamps.push({
    id: `${berth.id}:buffer-lamp`,
    position: [BUFFER_X - 0.35, 2.08, TRACK_Z],
    color: "#ffb08a",
    distance: 9,
    intensity: 2.2,
    poolPriority: 4,
    dayIntensityFactor: 0.35,
    eventLighting: platformDockLighting,
  });

  // --- Платформа -----------------------------------------------------------
  // Посадочная зона против двери головного вагона: жёлтая линия её обходит.
  const BOARD_FROM = HEAD_X - 1.7;
  const BOARD_TO = HEAD_X + 1.7;
  const lineRuns = (from: number, to: number): readonly (readonly [string, number, number])[] => {
    if (to <= BOARD_FROM || from >= BOARD_TO) {
      return [["full", from, to]];
    }
    const runs: (readonly [string, number, number])[] = [];
    if (from < BOARD_FROM - 0.2) {
      runs.push(["fore", from, BOARD_FROM]);
    }
    if (to > BOARD_TO + 0.2) {
      runs.push(["aft", BOARD_TO, to]);
    }
    return runs;
  };
  // Каменная плита ЛЕЖИТ на бетонном основании и заходит в него, как на
  // музейных перронах. Раньше основание не доставало до подошвы плиты двух
  // сантиметров, и вдоль всей кромки шла сквозная щель. Стоя на верхней
  // ступени, игрок бьёт нижним щупом автошага ровно в эту высоту — щуп уходил
  // в щель, автошаг молчал, и последняя ступень становилась стеной.
  const DECK_SLAB = 0.16;
  const DECK_BASE_TOP = PLATFORM_TOP - DECK_SLAB + 0.03;
  let deckIndex = 0;
  for (let x = PLATFORM_FROM; x < PLATFORM_TO; x += 5) {
    deckIndex += 1;
    const length = Math.min(5, PLATFORM_TO - x);
    const centerX = x + length / 2;
    part(berth, `deck-base:${deckIndex}`, "concrete", "panel",
      [centerX, DECK_BASE_TOP / 2, PLATFORM_Z], [length, DECK_BASE_TOP, PLATFORM_HALF * 2],
      "#77756f", { carriesAttachments: false });
    part(berth, `deck:${deckIndex}`, "stone", "groundTile",
      [centerX, PLATFORM_TOP - DECK_SLAB / 2, PLATFORM_Z],
      [length - 0.04, DECK_SLAB, PLATFORM_HALF * 2 - 0.04],
      deckIndex % 2 === 0 ? "#ada695" : "#9d9789", { carriesAttachments: false });
    // Жёлтая линия безопасности вдоль путевой кромки. У двери она рвётся:
    // там посадочная зона со своей разметкой, и линия не должна тонуть в
    // мостике.
    for (const [runTag, from, to] of lineRuns(centerX - length / 2 + 0.15, centerX + length / 2 - 0.15)) {
      part(berth, `deck-line:${deckIndex}:${runTag}`, "stone", "groundTile",
        [(from + to) / 2, PLATFORM_TOP + 0.01, PLATFORM_Z + PLATFORM_HALF - 0.3],
        [to - from, 0.03, 0.16], "#c8a33f", { bearsLoad: false, carriesAttachments: false });
    }
  }

  // --- Огни отправления ----------------------------------------------------
  // Врезаны в кромку перрона между жёлтой линией и обрезом: почти вровень с
  // полом, четыре сантиметра над плиткой — переступать нечего. Сигнальное
  // стекло горит собственным цветом и не гаснет днём, а игра ведёт их
  // яркость: мигают отсчёт отшвартовки, ровно горят весь рейс, гаснут в
  // посадочном положении.
  const MARKER_Z = PLATFORM_Z + PLATFORM_HALF - 0.12;
  let markerIndex = 0;
  for (let x = PLATFORM_FROM + 1.25; x < PLATFORM_TO; x += 2.5) {
    markerIndex += 1;
    part(berth, `departure-light:${markerIndex}`, "glass", "glassPane",
      [x, PLATFORM_TOP + 0.015, MARKER_Z], [0.42, 0.07, 0.16], departureSignalColor, {
        bearsLoad: false,
        carriesAttachments: false,
      });
  }

  // --- Всходы с площади ----------------------------------------------------
  // Кромка перрона — 0.94 м: игрок перешагивает 0.72, так что без ступеней
  // на платформу просто не попасть. Оба всхода поставлены в середину
  // пролётов навеса (колонны стоят через 6 м) и мимо стрел шлагбаумов.
  // Главный всход — ровно по оси входа, в просвете между стрелами
  // шлагбаумов (их подпорки стоят на x = ±1.05, между ними 1.9 м).
  const STAIR_STEPS = 5;
  const STAIR_RISE = PLATFORM_TOP / STAIR_STEPS;
  const STAIR_TREAD = 0.36;
  // Три одинаковых марша: по краям перрона и один точно посередине. Ими же
  // задаются места колонн навеса — колонна встаёт против внешнего края
  // крайнего марша и против обоих краёв среднего.
  const STAIR_WIDTH = 2.8;
  const stairs = [
    { x: -8.0, width: STAIR_WIDTH },
    { x: (PLATFORM_FROM + PLATFORM_TO) / 2, width: STAIR_WIDTH },
    { x: 18.5, width: STAIR_WIDTH },
  ] as const;
  for (const [stairIndex, stair] of stairs.entries()) {
    const stairX = stair.x;
    const footZ = PLATFORM_Z - PLATFORM_HALF - STAIR_TREAD * (STAIR_STEPS - 0.5);
    for (let step = 0; step < STAIR_STEPS - 1; step += 1) {
      const top = STAIR_RISE * (step + 1);
      berth.add(`stair:${stairIndex}:${step}`, "stone", "stoneBlock",
        [stairX, top / 2, PLATFORM_Z - PLATFORM_HALF - STAIR_TREAD * (STAIR_STEPS - 1.5 - step)],
        [stair.width, top, STAIR_TREAD], step % 2 === 0 ? "#a49d8d" : "#9a9384");
    }
    // Перила с ОБЕИХ сторон: метровый всход без них — не лестница. Стойки
    // стоят по краям марша, проход между поручнями шире капсулы вдвое.
    for (const railSide of [-1, 1] as const) {
      const railX = stairX + railSide * (stair.width / 2 - 0.12);
      const headZ = PLATFORM_Z - PLATFORM_HALF + 0.3;
      const footTop = STAIR_RISE + 0.98;
      const headTop = PLATFORM_TOP + 0.98;
      berth.add(`stair-post:${stairIndex}:${railSide}:foot`, "steel", "steelSheet",
        [railX, (STAIR_RISE + footTop) / 2, footZ], [0.09, footTop - STAIR_RISE, 0.09], iron);
      berth.add(`stair-post:${stairIndex}:${railSide}:head`, "steel", "steelSheet",
        [railX, (PLATFORM_TOP + headTop) / 2, headZ], [0.09, headTop - PLATFORM_TOP, 0.09], iron);
      const rise = headTop - footTop;
      const run = headZ - footZ;
      berth.add(`stair-rail:${stairIndex}:${railSide}`, "steel", "steelSheet",
        [railX, (footTop + headTop) / 2, (footZ + headZ) / 2],
        [0.07, 0.07, Math.hypot(rise, run)], ironLight,
        [-Math.atan2(rise, run), 0, 0]);
    }
  }

  // --- Навес на литых колоннах --------------------------------------------
  // Стекло идёт по ВСЕЙ длине перрона и ровно над ним, а держат его четыре
  // колонны: по внешнему краю крайних маршей и по обоим краям среднего.
  // Колонны стоят посреди ширины настила, поэтому проход остаётся с обеих
  // сторон. Северный край кровли отведён от габарита состава.
  const CANOPY_Z = PLATFORM_Z - 0.15;
  const CANOPY_HALF = 1.4;
  const CANOPY_FROM = PLATFORM_FROM + 0.4;
  const CANOPY_TO = PLATFORM_TO - 0.4;
  const canopyColumns = [
    stairs[0].x - STAIR_WIDTH / 2,
    stairs[1].x - STAIR_WIDTH / 2,
    stairs[1].x + STAIR_WIDTH / 2,
    stairs[2].x + STAIR_WIDTH / 2,
  ];
  for (const [columnIndex, x] of canopyColumns.entries()) {
    addFacetedCylinder(berth, `canopy-column:${columnIndex}`, "steel", "steelSheet", "y",
      [x, (PLATFORM_TOP + 0.22 + 3.9) / 2, CANOPY_Z], 3.9 - PLATFORM_TOP - 0.22, 0.36, iron);
    berth.add(`canopy-base:${columnIndex}`, "steel", "steelSheet",
      [x, PLATFORM_TOP + 0.11, CANOPY_Z], [0.66, 0.22, 0.66], ironLight);
    berth.add(`canopy-capital:${columnIndex}`, "steel", "steelSheet",
      [x, 4.0, CANOPY_Z], [0.7, 0.2, 0.7], brass);
    // Поперечная траверса на капители несёт оба прогона.
    berth.add(`canopy-crossbeam:${columnIndex}`, "steel", "steelSheet",
      [x, 4.23, CANOPY_Z], [0.24, 0.26, CANOPY_HALF * 2 + 0.1], ironLight);
    for (const side of [-1, 1] as const) {
      berth.add(`canopy-bracket:${columnIndex}:${side}`, "steel", "steelSheet",
        [x, 3.86, CANOPY_Z + side * 0.62], [0.16, 0.5, 1.0], ironLight, [side * 0.5, 0, 0]);
    }
    // Светильник на КАЖДОЙ колонне: под навесом иначе темно между парами.
    // Он подвесной, с траверсы, и висит выше человеческого роста — консоль с
    // колонны оказывалась в полутора метрах над проходом у путевой кромки.
    part(berth, `canopy-lamp-arm:${columnIndex}`, "steel", "steelSheet",
      [x, 3.98, CANOPY_Z + 0.55], [0.08, 0.5, 0.08], brass, {
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.35,
      });
    berth.add(`canopy-lamp:${columnIndex}`, "glass", "glassPane",
      [x, 3.6, CANOPY_Z + 0.55], [0.42, 0.42, 0.42], litWindowColor);
    lamps.push({
      id: `${berth.id}:canopy-lamp:${columnIndex}`,
      position: [x, 3.5, CANOPY_Z + 0.55],
      color: "#ffe0ae",
      distance: 13,
      intensity: 2.6,
      poolPriority: 4,
      dayIntensityFactor: 0.35,
      eventLighting: platformDockLighting,
    });
  }
  // Прогоны во всю длину перрона — они и делают кровлю сплошной.
  for (const side of [-1, 1] as const) {
    berth.add(`canopy-purlin:${side}`, "steel", "steelSheet",
      [(CANOPY_FROM + CANOPY_TO) / 2, 4.49, CANOPY_Z + side * (CANOPY_HALF - 0.1)],
      [CANOPY_TO - CANOPY_FROM, 0.28, 0.24], ironLight);
  }
  let rafterIndex = 0;
  for (let x = CANOPY_FROM + 0.6; x <= CANOPY_TO - 0.4; x += 2.6) {
    rafterIndex += 1;
    berth.add(`canopy-rafter:${rafterIndex}`, "steel", "steelSheet",
      [x, 4.71, CANOPY_Z], [0.16, 0.16, CANOPY_HALF * 2 - 0.1], iron);
  }
  let glassIndex = 0;
  for (let x = CANOPY_FROM; x < CANOPY_TO - 0.2; x += 2.6) {
    glassIndex += 1;
    const length = Math.min(2.6, CANOPY_TO - x);
    berth.add(`canopy-glass:${glassIndex}`, "glass", "glassPane",
      [x + length / 2, 4.84, CANOPY_Z], [length - 0.05, 0.1, CANOPY_HALF * 2], glassBlue);
  }
  // Фестончатый подзор по путевой кромке — вокзальная деталь, которая
  // читается издалека.
  for (const side of [-1, 1] as const) {
    berth.add(`canopy-valance:${side}`, "steel", "steelSheet",
      [(CANOPY_FROM + CANOPY_TO) / 2, 4.44, CANOPY_Z + side * (CANOPY_HALF + 0.02)],
      [CANOPY_TO - CANOPY_FROM, 0.34, 0.1], ironLight);
  }

  // --- Оборудование перрона ------------------------------------------------
  // Часы на кронштейне: младший брат тех, что на фасаде.
  const CLOCK_X = PLATFORM_TO - 0.3;
  const CLOCK_Z = CANOPY_Z - 0.3;
  const CLOCK_Y = 3.26;
  berth.add("clock-post", "steel", "steelSheet",
    [CLOCK_X, (PLATFORM_TOP + 4.3) / 2, CANOPY_Z], [0.18, 4.3 - PLATFORM_TOP, 0.18], iron);
  // Кронштейн часов объявлен «тросовым»: иначе стеновое правило требует
  // опору в полтора раза выше самого циферблата.
  part(berth, "clock-bracket", "steel", "steelSheet",
    [CLOCK_X, CLOCK_Y, CANOPY_Z - 0.14], [0.14, 0.14, 0.3], iron, {
      carriesAttachments: true,
      attachmentSupportMode: "cable",
      sideAttachmentReach: 0.4,
    });
  berth.add("clock-body", "steel", "panel", [CLOCK_X, CLOCK_Y, CLOCK_Z], [1.15, 1.15, 0.34], iron);
  berth.add("clock-face", "steel", "panel", [CLOCK_X, CLOCK_Y, CLOCK_Z - 0.19], [0.92, 0.92, 0.06], "#ddd3b8");
  berth.add("clock-hand-hour", "steel", "steelSheet", [CLOCK_X - 0.14, CLOCK_Y + 0.08, CLOCK_Z - 0.24], [0.06, 0.3, 0.05], iron, [0, 0, 1.047]);
  berth.add("clock-hand-minute", "steel", "steelSheet", [CLOCK_X + 0.18, CLOCK_Y + 0.12, CLOCK_Z - 0.25], [0.05, 0.44, 0.05], iron, [0, 0, -1.047]);
  mutableObjects.push({
    kind: "analogClock",
    id: `${berth.id}:clock`,
    hourHandPieceId: `${berth.id}:clock-hand-hour`,
    minuteHandPieceId: `${berth.id}:clock-hand-minute`,
    pivot: [CLOCK_X, CLOCK_Y, CLOCK_Z - 0.25],
    timeSource: { kind: "game" },
    // The face is read from its -Z side, so its apparent screen direction is
    // opposite the world-X convention used by a +Z-facing clock.
    clockwise: -1,
  });

  // Табло отправления: строка рейса набрана, строка назначения пуста —
  // клапаны стоят тёмными.
  const BENCH_Z = PLATFORM_Z - PLATFORM_HALF - 0.7;
  const SIGN_Z = BENCH_Z - 1.3;
  const BOARD_X = 11.9;
  for (const [postIndex, postX] of [BOARD_X - 1.8, BOARD_X + 1.8].entries()) {
    berth.add(`board-post:${postIndex}`, "steel", "steelSheet",
      [postX, 1.7, SIGN_Z + 0.3], [0.12, 3.4, 0.12], iron);
  }
  berth.add("board-body", "steel", "panel", [BOARD_X, 3.4, SIGN_Z + 0.11], [4.7, 1.5, 0.22], "#20262a");
  const skyDepartureMatrix = addPixelLampMatrix(
    berth,
    "board-line",
    10,
    BOARD_X,
    3.68,
    SIGN_Z - 0.04,
    0.07,
    -1,
  );
  mutableObjects.push({
    kind: "matrixDisplay",
    id: `${berth.id}:departures`,
    cellPieceIds: skyDepartureMatrix.cellPieceIds,
    transition: { fadeInSeconds: 0.48, fadeOutSeconds: 0.34 },
    frames: [
      {
        id: "scheduled",
        activePieceIds: skyDepartureMatrix.activePieceIds("DEPARTS 03"),
        condition: {
          kind: "clusterEvent",
          sourceClusterId: train.id,
          states: ["docked"],
        },
      },
      {
        id: "attention",
        activePieceIds: skyDepartureMatrix.activePieceIds("ATTN"),
        condition: {
          kind: "clusterEvent",
          sourceClusterId: train.id,
          states: ["attention"],
        },
      },
      {
        id: "departing",
        activePieceIds: skyDepartureMatrix.activePieceIds("DEPARTING"),
        condition: {
          kind: "clusterEvent",
          sourceClusterId: train.id,
          states: ["departure"],
        },
      },
      {
        id: "in-flight",
        activePieceIds: skyDepartureMatrix.activePieceIds("IN FLIGHT"),
        condition: {
          kind: "clusterEvent",
          sourceClusterId: train.id,
          states: ["cruise", "inTransit"],
        },
      },
      {
        id: "arriving",
        activePieceIds: skyDepartureMatrix.activePieceIds("ARRIVING"),
        condition: {
          kind: "clusterEvent",
          sourceClusterId: train.id,
          states: ["approach"],
        },
      },
      {
        id: "failed",
        activePieceIds: skyDepartureMatrix.activePieceIds("FAIL"),
        condition: {
          kind: "clusterEvent",
          sourceClusterId: train.id,
          states: ["failed"],
        },
      },
    ],
  });
  // Строка назначения пуста: клапаны стоят тёмными — рейсу некуда объявлять.
  for (let flap = 0; flap < 10; flap += 1) {
    berth.add(`board-flap:${flap}`, "steel", "steelSheet",
      [BOARD_X - 1.8 + flap * 0.4, 3.06, SIGN_Z - 0.04], [0.34, 0.3, 0.05], "#161b1e");
  }
  lamps.push({
    id: `${berth.id}:board`,
    position: [BOARD_X, 3.4, SIGN_Z - 0.4],
    color: "#ffd9a0",
    distance: 8,
    intensity: 1.6,
    dayIntensityFactor: 1,
    transition: { fadeInSeconds: 0.45, fadeOutSeconds: 0.25 },
  });

  // Номер платформы на эмалированной табличке у головы перрона — в стороне
  // от лестничного марша и выше человеческого роста: на оси входа она
  // перекрывала и проход, и дверь вагона.
  const NUMBER_X = -1.4;
  for (const [postIndex, postX] of [NUMBER_X - 1.7, NUMBER_X + 1.7].entries()) {
    berth.add(`number-post:${postIndex}`, "steel", "steelSheet",
      [postX, 1.7, SIGN_Z + 0.3], [0.12, 3.4, 0.12], iron);
  }
  berth.add("number-plate", "steel", "panel",
    [NUMBER_X, 3.4, SIGN_Z + 0.11], [4.3, 1.5, 0.22], "#20323c");
  const platformMatrix = addPixelLampMatrix(
    berth,
    "number-text",
    10,
    NUMBER_X,
    3.68,
    SIGN_Z - 0.04,
    0.065,
    -1,
  );
  mutableObjects.push({
    kind: "matrixDisplay",
    id: `${berth.id}:platform-number`,
    cellPieceIds: platformMatrix.cellPieceIds,
    frames: [{
      id: "platform",
      activePieceIds: platformMatrix.activePieceIds("PLATFORM 0"),
    }],
  });
  lamps.push({ id: `${berth.id}:number-plate`, position: [NUMBER_X, 3.4, SIGN_Z - 0.4], color: "#cfe4ff", distance: 7, intensity: 1.4 });

  // Семафор в голове платформы: зелёная линза — путь свободен.
  const SIGNAL_X = BUFFER_X - 3.9;
  berth.add("signal-post", "steel", "steelSheet", [SIGNAL_X, 2.5, PLATFORM_Z + 0.5], [0.18, 5.0, 0.18], iron);
  berth.add("signal-arm", "steel", "steelSheet", [SIGNAL_X + 0.7, 4.45, PLATFORM_Z + 0.5], [1.5, 0.22, 0.12], "#a43c2d", [0, 0, -0.3]);
  berth.add("signal-lens", "glass", "glassPane", [SIGNAL_X, 4.0, PLATFORM_Z + 0.62], [0.3, 0.3, 0.14], "#7fd0a0");
  lamps.push({ id: `${berth.id}:signal-lens`, position: [SIGNAL_X, 4.0, PLATFORM_Z + 0.9], color: "#6ff0a8", distance: 10, intensity: 2.0 });

  // Фонари перед перроном: по одному с каждой стороны каждого марша — шесть
  // чугунных столбов на площади. На колоннах навеса они оказывались ровно
  // посреди лестницы.
  const LANTERN_Z = PLATFORM_Z - PLATFORM_HALF - STAIR_TREAD * 2;
  const lanternPositions = stairs.flatMap((stair) =>
    [-1, 1].map((side) => stair.x + side * (stair.width / 2 + 0.75)));
  for (const [lanternIndex, x] of lanternPositions.entries()) {
    berth.add(`lantern-post:${lanternIndex}`, "steel", "steelSheet", [x, 1.55, LANTERN_Z], [0.16, 3.1, 0.16], iron);
    berth.add(`lantern-arm:${lanternIndex}`, "steel", "steelSheet", [x, 3.16, LANTERN_Z], [0.26, 0.12, 0.26], brass);
    berth.add(`lantern:${lanternIndex}`, "glass", "glassPane", [x, 3.48, LANTERN_Z], [0.34, 0.52, 0.34], litWindowColor);
    berth.add(`lantern-cap:${lanternIndex}`, "steel", "steelSheet", [x, 3.8, LANTERN_Z], [0.4, 0.12, 0.4], iron);
    lamps.push({
      id: `${berth.id}:lantern:${lanternIndex}`,
      position: [x, 3.4, LANTERN_Z],
      color: "#ffe3ae",
      distance: 12,
      intensity: 2.4,
      poolPriority: 4,
      dayIntensityFactor: 0.35,
      eventLighting: platformDockLighting,
    });
  }

  addBench(berth, "bench:0", NUMBER_X, 0, BENCH_Z, 0, 2.2);
  addBench(berth, "bench:1", BOARD_X, 0, BENCH_Z, 0, 2.2);

  // Посадочный мостик: лежит на кромке настила и перекрывает щель до порога
  // вагона, оставляя 10 см чистого зазора. Он НЕ несущий и НЕ держит
  // навесок — иначе состав нашёл бы в нём опору и пережил бы гибель сердца,
  // а игрок всё равно ходит по нему: коллайдеру эти флаги безразличны.
  {
    const bridgeFrom = PLATFORM_Z + PLATFORM_HALF - 0.35;
    const bridgeTo = TRACK_Z - CAR_HALF - 0.23;
    part(berth, "boarding-bridge", "wood", "plank",
      [HEAD_X, PLATFORM_TOP + 0.04, (bridgeFrom + bridgeTo) / 2],
      [2.6, 0.08, bridgeTo - bridgeFrom], oak, {
        bearsLoad: false,
        carriesAttachments: false,
      });
    part(berth, "boarding-bridge:tread", "steel", "steelSheet",
      [HEAD_X, PLATFORM_TOP + 0.09, (bridgeFrom + bridgeTo) / 2],
      [2.4, 0.03, bridgeTo - bridgeFrom - 0.06], ironLight, {
        bearsLoad: false,
        carriesAttachments: false,
      });
    // Разметка посадочной зоны на настиле — она заменяет разорванную
    // жёлтую линию.
    for (const edge of [-1, 1] as const) {
      part(berth, `boarding-mark:${edge}`, "stone", "groundTile",
        [HEAD_X + edge * 1.55, PLATFORM_TOP + 0.01, PLATFORM_Z + 0.55],
        [0.16, 0.03, 1.5], "#c8a33f", { bearsLoad: false, carriesAttachments: false });
    }
    part(berth, "boarding-mark:head", "stone", "groundTile",
      [HEAD_X, PLATFORM_TOP + 0.01, PLATFORM_Z - 0.18], [3.26, 0.03, 0.16], "#c8a33f",
      { bearsLoad: false, carriesAttachments: false });
  }
  // Огрызок швартовой цепи на рыме упора: длинная часть уходит с составом.
  berth.add("chain-stub", "steel", "steelSheet",
    [BUFFER_X + 0.3, 1.16, TRACK_Z], [0.72, 0.1, 0.1], "#3a4043", [0, 0, -0.2]);

  finish(berth, "Platform 0: track, deck and canopy", "stone", "stack");

  // === ЛЕТАЮЩИЙ СОСТАВ ====================================================
  // Подъёмное сердце: парящий фундамент внутри оболочки. Контактная коробка
  // накрывает весь корпус, поэтому шпангоуты, полотнища и подвеска находят
  // опору «зазор ноль». Объём занижен — это газ, а не земля.
  part(train, "heart", "earth", "steelSheet",
    [(HULL_FROM + HULL_TO) / 2, HULL_Y, TRACK_Z], [HULL_LENGTH * 0.6, 2.6, 2.6], "#e9dcb4", {
      volume: 9,
      contactBoxes: [{
        position: [(HULL_FROM + HULL_TO) / 2, HULL_Y, TRACK_Z],
        size: [HULL_LENGTH, HULL_RADIUS * 2.2, HULL_RADIUS * 2.2],
      }],
      carriesAttachments: true,
      attachmentSupportMode: "cable",
    });
  lamps.push({
    id: `${train.id}:heart`,
    position: [(HULL_FROM + HULL_TO) / 2, HULL_Y, TRACK_Z],
    carrierClusterId: train.id,
    color: "#ffcf92",
    distance: 16,
    intensity: 1.8,
  });

  // === Дифферентовочные тележки в килевом коридоре внутри оболочки. Это
  // единственный орган состава, создающий момент по крену и тангажу: он не
  // прикладывает силу, а возит настоящий балласт, и живой центр масс уезжает
  // вместе с ним. Обе стоят над измеренным центром масс целой машины
  // (x = 5.6, z = 77.6), поэтому сами по себе развесовку не меняют: рельс
  // симметричен, груз в нуле. Снаружи не видны, но куски настоящие: пробьёт
  // оболочку — тележку унесёт вместе с балластом, и дифферентовать станет
  // нечем. Числа продублированы в паспорте кадра, тест их сверяет.
  const TRIM_X = (HULL_FROM + HULL_TO) / 2;
  for (const [axis, y, travel, mass, along] of [
    ["pitch", 7.2, 6.0, 11.0, true],
    ["roll", 8.0, 2.15, 25.0, false],
  ] as const) {
    const railLength = travel * 2 + 0.8;
    // The car hangs under its rail on a short yoke, the way a real trolley
    // does, so neither piece grows through the other or through the gas cell.
    const carY = y - 0.32;
    part(train, `trim:${axis}:rail`, "steel", "steelSheet",
      [TRIM_X, y, TRACK_Z],
      along ? [railLength, 0.12, 0.12] : [0.12, 0.12, railLength], "#7d8489", {
        contactBoxes: [{
          position: [TRIM_X, y, TRACK_Z],
          size: along
            ? [railLength, 0.2, 0.2]
            : [0.2, 0.2, railLength],
        }],
        // Привод и есть обязательное ядро органа: рельс перебит — тележка
        // больше не едет, даже если сама цела.
        actuator: {
          id: `sky-train:trim:${axis}`,
          commandChannel: `trim:${axis}`,
          required: true,
        },
        bearsLoad: false,
      });
    // Балласт в стальном коробе: объём задан отдельно, иначе коробка такого
    // размера весила бы как пустая жестянка.
    part(train, `trim:${axis}:car`, "steel", "steelSheet",
      [TRIM_X, carY, TRACK_Z],
      along ? [0.86, 0.46, 0.7] : [0.7, 0.46, 0.86], "#5f6469", {
        volume: mass / 3.6,
        contactBoxes: [{
          position: [TRIM_X, carY, TRACK_Z],
          size: [0.95, 0.55, 0.95],
        }],
        actuator: {
          id: `sky-train:trim:${axis}`,
          commandChannel: `trim:${axis}`,
          required: true,
        },
        bearsLoad: false,
      });
  }

  // Кормовой ресивер исполнительной автоматики хранит рабочее давление для
  // подъёмных клапанов. Это настоящий кусок оборудования и настоящая масса:
  // вместе с появившейся далеко впереди кабиной он меняет продольный баланс.
  part(train, "lift-control-reservoir", "steel", "steelSheet",
    [16, HULL_Y, TRACK_Z], [1.3, 0.72, 0.72], "#596268", {
      volume: 0.5,
      bearsLoad: false,
      sideAttachmentReach: 0.45,
    });

  // Носовой балласт компенсирует кабину и кормовое оборудование настоящей
  // массой. Если бак потерять, состав заметно задерёт нос; точка приложения
  // подъёмной силы при этом остаётся геометрическим центром оболочки.
  const BALLAST_X = -6;
  part(train, "ballast", "steel", "steelSheet",
    [BALLAST_X, HULL_Y, TRACK_Z], [1.7, 1.25, 1.7], "#3d4448", {
      volume: 1.93,
      carriesAttachments: true,
      attachmentSupportMode: "cable",
      sideAttachmentReach: 0.5,
      bearingArea: 1.2,
    });
  for (const strap of [-0.55, 0.55] as const) {
    part(train, `ballast:strap:${strap}`, "steel", "steelSheet",
      [BALLAST_X + strap, HULL_Y, TRACK_Z], [0.12, 1.45, 1.9], ironLight, {
        volume: 0.1,
        bearsLoad: false,
        sideAttachmentReach: 0.4,
      });
  }

  // Профиль жёсткого корабля: короткий эллиптический нос, длинная
  // параллельная середина, вытянутая корма — не сигара-блимп, а каркасник.
  const hullRadiusAt = (x: number): number => {
    const t = (x - HULL_FROM) / HULL_LENGTH;
    if (t < 0.2) {
      return HULL_RADIUS * Math.sqrt(Math.max(0, 1 - ((0.2 - t) / 0.2) ** 2));
    }
    if (t > 0.64) {
      return HULL_RADIUS * Math.pow(Math.max(0, 1 - ((t - 0.64) / 0.36) ** 2), 0.55);
    }
    return HULL_RADIUS;
  };

  // Шпангоуты и полотнища. Оболочка обтянута по клёпаным кольцам, как ферма
  // дебаркадера, — двенадцать граней по кругу, между кольцами полотно.
  const GORES = 12;
  const BAY_FROM = HULL_FROM + 1.6;
  const BAY_TO = HULL_TO - 2.6;
  const BAYS = 9;
  const bayStep = (BAY_TO - BAY_FROM) / BAYS;
  for (let bay = 0; bay < BAYS; bay += 1) {
    const x = BAY_FROM + (bay + 0.5) * bayStep;
    const radius = hullRadiusAt(x);
    if (radius < 0.5) {
      continue;
    }
    const taper = Math.atan2(
      hullRadiusAt(x + bayStep / 2) - hullRadiusAt(x - bayStep / 2),
      bayStep,
    );
    const panelLength = bayStep / Math.cos(taper) + 0.12;
    const width = ((2 * Math.PI * radius) / GORES) * 1.14;
    for (let gore = 0; gore < GORES; gore += 1) {
      const phi = (gore / GORES) * Math.PI * 2;
      const belly = Math.cos(phi) < -0.5;
      part(train, `skin:${bay}:${gore}`, "cloth", "panel",
        [x, HULL_Y + radius * Math.cos(phi), TRACK_Z + radius * Math.sin(phi)],
        [panelLength, 0.1, width],
        belly ? linenShade : (bay + gore) % 2 === 0 ? linen : linenDark, {
          rotation: [phi, 0, taper],
        });
    }
  }
  // Кольца-шпангоуты по границам отсеков: чугунные сегменты поверх полотна.
  for (let ring = 0; ring <= BAYS; ring += 2) {
    const x = BAY_FROM + ring * bayStep;
    const radius = hullRadiusAt(x) + 0.07;
    if (radius < 0.6) {
      continue;
    }
    for (let gore = 0; gore < GORES; gore += 1) {
      const phi = ((gore + 0.5) / GORES) * Math.PI * 2;
      part(train, `frame:${ring}:${gore}`, "steel", "steelSheet",
        [x, HULL_Y + radius * Math.cos(phi), TRACK_Z + radius * Math.sin(phi)],
        [0.22, 0.14, (2 * Math.PI * radius) / GORES + 0.06], ironLight, {
          rotation: [phi, 0, 0],
          bearsLoad: false,
          sideAttachmentReach: 0.4,
        });
    }
  }
  // Продольные стрингеры того же рисунка, что фермы дебаркадера, но
  // ПОСЕКЦИОННО по профилю: сплошная рейка постоянного радиуса вылетала из
  // сужающихся носа и кормы и висела в воздухе рядом с обшивкой.
  for (const phi of [0, Math.PI / 2, Math.PI, -Math.PI / 2, Math.PI / 4, (3 * Math.PI) / 4, (-3 * Math.PI) / 4, -Math.PI / 4]) {
    for (let bay = 0; bay < BAYS; bay += 1) {
      const x = BAY_FROM + (bay + 0.5) * bayStep;
      const radius = hullRadiusAt(x) + 0.06;
      if (radius < 0.55) {
        continue;
      }
      const taper = Math.atan2(
        hullRadiusAt(x + bayStep / 2) - hullRadiusAt(x - bayStep / 2),
        bayStep,
      );
      part(train, `stringer:${phi.toFixed(2)}:${bay}`, "steel", "steelSheet",
        [x, HULL_Y + radius * Math.cos(phi), TRACK_Z + radius * Math.sin(phi)],
        [bayStep / Math.cos(taper) + 0.06, 0.1, 0.16], ironLight, {
          rotation: [phi, 0, taper],
          bearsLoad: false,
          sideAttachmentReach: 0.4,
        });
    }
  }

  // Причальный прожектор сидит на нижнем носовом полотнище. Площадка
  // повторяет низ оболочки, короткий литой корпус наклоняет линзу вперёд и
  // вниз. Свет и видимый в воздухе сноп — не геометрия рейса: они слушают
  // только опубликованную маршрутом фазу своего составного носителя.
  {
    const fixtureX = BAY_FROM + bayStep / 2;
    const fixtureY = HULL_Y - hullRadiusAt(fixtureX);
    const downAngle = 0.4;
    const direction: SceneVector3 = [
      -Math.cos(downAngle),
      -Math.sin(downAngle),
      0,
    ];
    const along = (distance: number): SceneVector3 => [
      fixtureX + direction[0] * distance,
      fixtureY - 0.08 + direction[1] * distance,
      TRACK_Z,
    ];
    part(train, "mooring-light:mount", "steel", "steelSheet",
      [fixtureX, fixtureY - 0.03, TRACK_Z], [0.9, 0.14, 0.62], ironLight, {
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.12,
        // The shell is cloth and cannot carry load. The plate bolts through
        // it into the internal frame/heart contact volume, like the other
        // external equipment on this rigid airship.
      });
    part(train, "mooring-light:housing", "steel", "steelSheet",
      along(0.28), [0.62, 0.32, 0.44], brass, {
        rotation: [0, 0, downAngle],
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.12,
        attachmentSupportIds: [`${train.id}:mooring-light:mount`],
      });
    const lensDepth = 0.13;
    const lensPosition = along(0.62);
    part(train, "mooring-light", "glass", "glassPane",
      lensPosition, [lensDepth, 0.28, 0.34], mooringSignalColor, {
        rotation: [0, 0, downAngle],
        bearsLoad: false,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.08,
        attachmentSupportIds: [`${train.id}:mooring-light:housing`],
      });
    spotLights.push({
      id: `${train.id}:mooring-light`,
      position: [
        lensPosition[0] + direction[0] * (lensDepth / 2 + 0.015),
        lensPosition[1] + direction[1] * (lensDepth / 2 + 0.015),
        lensPosition[2],
      ],
      direction,
      carrierClusterId: train.id,
      color: "#ffe6b5",
      distance: 72,
      intensity: 620,
      angle: 0.3,
      penumbra: 0.48,
      decay: 1.7,
      dayIntensityFactor: 1,
      eventLighting: mooringManeuverLighting,
      transition: {
        fadeInSeconds: 1.8,
        fadeOutSeconds: 1.2,
      },
      visibleBeam: {
        opacity: 0.16,
        sourceRadius: 0.14,
        length: 62,
        attenuation: 56,
        anglePower: 6,
      },
      fixtureGlow: {
        color: mooringSignalColor,
        intensity: 7.2,
        halo: {
          physicalDiameter: 0.58,
          minScreenDiameter: 4.5,
          maxWorldDiameter: 1.25,
          dayOpacity: 0.72,
          nightOpacity: 0.92,
        },
      },
    });
  }
  // Носовой и кормовой обтекатели: ступени по местному радиусу профиля.
  // Полотнищами эти концы крыть нельзя — плоские панели расходятся лепестками.
  for (const [capTag, capX, capLength] of [
    ["nose:0", HULL_FROM + 1.2, 1.0], ["nose:1", HULL_FROM + 0.55, 0.75],
    ["nose:2", HULL_FROM + 0.16, 0.5],
    ["tail:0", HULL_TO - 2.1, 1.2], ["tail:1", HULL_TO - 1.25, 0.9],
    ["tail:2", HULL_TO - 0.55, 0.7],
  ] as const) {
    const diameter = Math.max(0.5, hullRadiusAt(capX) * 2 + 0.06);
    addFacetedCylinder(train, `cap:${capTag}`, "steel", "steelSheet", "x",
      [capX, HULL_Y, TRACK_Z], capLength, diameter, capTag.startsWith("nose") ? ironLight : "#8d9195");
  }
  // Носовой швартовый конус смотрит в буфер, куда упирается состав.
  part(train, "nose-cone", "steel", "steelSheet",
    [HULL_FROM - 0.45, HULL_Y, TRACK_Z], [1.1, 0.5, 0.5], iron, {
      carriesAttachments: true,
      attachmentSupportMode: "cable",
      sideAttachmentReach: 0.4,
    });

  // Крестообразное оперение. Локальный y панели — размах наружу, локальный
  // z — толщина; поворот на phi ставит их правильно, потому что корпус лежит
  // вдоль мировой X.
  const finFrom = HULL_TO - 4.3;
  const finTo = HULL_TO - 1.2;
  // Нижнего киля нет намеренно: под кормой висят вагон и его траверса.
  for (const [finIndex, phi] of [0, Math.PI / 2, -Math.PI / 2].entries()) {
    const rootRadius = hullRadiusAt((finFrom + finTo) / 2);
    const span = 1.5;
    const mid = rootRadius + span / 2 - 0.1;
    part(train, `fin:${finIndex}`, "steel", "panel",
      [(finFrom + finTo) / 2, HULL_Y + mid * Math.cos(phi), TRACK_Z + mid * Math.sin(phi)],
      [finTo - finFrom, span, 0.12], "#9ea3a0", {
        rotation: [phi, 0, 0],
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.5,
      });
    part(train, `fin:${finIndex}:rudder`, "steel", "panel",
      [finTo + 0.55, HULL_Y + mid * Math.cos(phi), TRACK_Z + mid * Math.sin(phi)],
      [0.9, span * 0.92, 0.1], "#8d9195", {
        rotation: [phi, 0, 0],
        bearsLoad: false,
        sideAttachmentReach: 0.6,
      });
  }
  // Бортовой номер продолжает серию: у городского корабля 07, у этого 03.
  // Щит лежит на цилиндрической середине корпуса, и каждый пиксель уложен по
  // местной кривизне: плоская строка в сужающейся корме отходила от обшивки
  // на четверть метра и попадала под стрингер.
  // Номер стоит РОВНО в середине секции между кольцами шпангоутов (кольца
  // идут через отсек), в передней части цилиндрической середины: у моторных
  // гондол он спорил с диском винта.
  const HULL_NUMBER_X = BAY_FROM + 3 * bayStep;
  const NUMBER_PIXEL = 0.2;
  for (const side of [-1, 1] as const) {
    const phi = side * (Math.PI / 2 + 0.35);
    const radius = HULL_RADIUS + 0.05;
    const onHull = (along: number, up: number, outward: number): SceneVector3 => [
      HULL_NUMBER_X + along,
      HULL_Y + (radius + outward) * Math.cos(phi) - up * Math.sin(phi),
      TRACK_Z + (radius + outward) * Math.sin(phi) + up * Math.cos(phi),
    ];
    part(train, `number:${side}:band`, "steel", "panel",
      onHull(0, 0, 0.03), [2.9, 0.08, 1.7], "#2a3136", {
        rotation: [phi, 0, 0],
        bearsLoad: false,
        sideAttachmentReach: 0.4,
      });
    const glyphs = [..."03"];
    const glyphWidth = NUMBER_PIXEL * 6;
    const totalWidth = glyphs.length * glyphWidth - NUMBER_PIXEL;
    let cellIndex = 0;
    glyphs.forEach((character, characterIndex) => {
      terminalPixelFont[character]?.forEach((row, rowIndex) => {
        [...row].forEach((cell, columnIndex) => {
          if (cell !== "1") {
            return;
          }
          // Читается с той стороны, куда смотрит борт: южный борт зеркалим.
          const along = characterIndex * glyphWidth + columnIndex * NUMBER_PIXEL;
          const offset = side < 0
            ? totalWidth / 2 - along
            : -totalWidth / 2 + along;
          part(train, `number:${side}:${cellIndex}`, "steel", "steelSheet",
            onHull(offset, (3 - rowIndex) * NUMBER_PIXEL, 0.09),
            [NUMBER_PIXEL * 0.82, 0.06, NUMBER_PIXEL * 0.82], brass, {
              rotation: [phi, 0, 0],
              bearsLoad: false,
              sideAttachmentReach: 0.3,
            });
          cellIndex += 1;
        });
      });
    });
  }

  // --- Вагоны --------------------------------------------------------------
  // Кузов списан с музейного вагона этого же терминала: рама, глухой пояс
  // борта до подоконника, ЛЕНТА ОКОН в дубовых простенках (стекло — сама
  // стена, а не наклейка на глухой борт), кремовый поручень по верху,
  // арочная крыша из семи сегментов, торцы с дверьми в переход. Отличия —
  // латунная отбортовка вместо буферов и подвеска вместо тележек: этот вагон
  // не катится, он висит.
  const WAIST_TOP = 2.3;      // подоконник
  const BAND_TOP = 3.44;      // верх ленты окон
  const CANT_TOP = 3.6;       // верх обвязки над окнами (и притолока двери)
  const EAVES = 4.1;          // карниз, от него начинается арка крыши
  const ROOF_R = 1.8;
  const PANE_PITCH = 1.9;
  const PANE_HALF = 0.86;
  const POST_HALF = 0.09;
  const FLOOR_TOP = CAR_FLOOR + 0.16;
  const DOOR_HALF = PANE_PITCH / 2;   // проём ровно в один оконный шаг

  function addSkyCoach(
    prefix: string,
    centerX: number,
    bodyColor: string,
    withDoor: boolean,
    passageEnd: -1 | 1,
    coachNumber: string,
    openEnd: -1 | 1 | null = null,
  ): void {
    const halfLength = CAR_LENGTH / 2;
    const bodyHalf = halfLength - 0.12;
    part(train, `${prefix}:frame`, "steel", "steelSheet",
      [centerX, CAR_FLOOR - 0.3, TRACK_Z], [CAR_LENGTH - 0.26, 0.52, CAR_HALF * 2 - 0.1], iron, {
        volume: 1.4,
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.4,
      });
    part(train, `${prefix}:floor`, "wood", "plank",
      [centerX, CAR_FLOOR + 0.06, TRACK_Z], [CAR_LENGTH - 0.4, 0.2, CAR_HALF * 2 - 0.3], oakDark, {
        volume: 1.2,
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.4,
      });

    const paneCenters = [-2, -1, 0, 1, 2].map((step) => centerX + step * PANE_PITCH);
    for (const side of [-1, 1] as const) {
      const wallZ = TRACK_Z + side * CAR_HALF;
      const doorSide = withDoor && side < 0;
      // Пояс борта рвётся на дверном проёме — как и всё, что идёт по борту.
      const runs: readonly (readonly [string, number, number])[] = doorSide
        ? [["fore", centerX - bodyHalf, centerX - DOOR_HALF],
           ["aft", centerX + DOOR_HALF, centerX + bodyHalf]]
        : [["full", centerX - bodyHalf, centerX + bodyHalf]];
      for (const [runTag, x1, x2] of runs) {
        part(train, `${prefix}:waist:${side}:${runTag}`, "steel", "steelSheet",
          [(x1 + x2) / 2, (FLOOR_TOP + WAIST_TOP) / 2, wallZ],
          [x2 - x1, WAIST_TOP - FLOOR_TOP, 0.2], bodyColor, {
            volume: (x2 - x1) * 0.05,
            carriesAttachments: true,
            attachmentSupportMode: "cable",
            sideAttachmentReach: 0.4,
          });
        // Латунная отбортовка по подоконнику — тем же куском, что и пояс.
        part(train, `${prefix}:beading:${side}:${runTag}`, "steel", "steelSheet",
          [(x1 + x2) / 2, WAIST_TOP - 0.05, wallZ + side * 0.06],
          [x2 - x1 - 0.2, 0.09, 0.06], brass, {
            bearsLoad: false,
            sideAttachmentReach: 0.3,
          });
      }
      // Лента окон: стекло на всю толщину стены, между стёклами — дубовые
      // простенки, по углам кузова глухие панели.
      for (const [paneIndex, paneX] of paneCenters.entries()) {
        if (doorSide && Math.abs(paneX - centerX) < 0.01) {
          continue;
        }
        part(train, `${prefix}:window:${side}:${paneIndex}`, "glass", "glassPane",
          [paneX, (WAIST_TOP + BAND_TOP) / 2, wallZ], [PANE_HALF * 2, BAND_TOP - WAIST_TOP, 0.2],
          clearPassengerGlassColor, {
            bearsLoad: false,
            sideAttachmentReach: 0.3,
          });
      }
      for (const postX of [...paneCenters.map((x) => x - PANE_PITCH / 2), centerX + 2 * PANE_PITCH + PANE_PITCH / 2]) {
        if (doorSide && Math.abs(Math.abs(postX - centerX) - DOOR_HALF) < 0.01) {
          continue;   // на месте этих простенков стоят дверные косяки
        }
        part(train, `${prefix}:post:${side}:${postX.toFixed(2)}`, "wood", "plank",
          [postX, (WAIST_TOP + BAND_TOP) / 2, wallZ], [POST_HALF * 2, BAND_TOP - WAIST_TOP, 0.22],
          oakDark, {
            carriesAttachments: true,
            attachmentSupportMode: "cable",
            sideAttachmentReach: 0.3,
          });
      }
      for (const corner of [-1, 1] as const) {
        const inner = centerX + corner * (2 * PANE_PITCH + PANE_PITCH / 2 + POST_HALF);
        const outer = centerX + corner * bodyHalf;
        part(train, `${prefix}:corner:${side}:${corner}`, "steel", "steelSheet",
          [(inner + outer) / 2, (WAIST_TOP + BAND_TOP) / 2, wallZ],
          [Math.abs(outer - inner), BAND_TOP - WAIST_TOP, 0.2], bodyColor, {
            volume: Math.abs(outer - inner) * 0.05,
            carriesAttachments: true,
            attachmentSupportMode: "cable",
            sideAttachmentReach: 0.4,
          });
      }
      // Обвязка над окнами — она же притолока двери.
      part(train, `${prefix}:cant:${side}`, "steel", "steelSheet",
        [centerX, (BAND_TOP + CANT_TOP) / 2, wallZ],
        [bodyHalf * 2, CANT_TOP - BAND_TOP, 0.2], bodyColor, {
          volume: bodyHalf * 0.1,
          carriesAttachments: true,
          attachmentSupportMode: "cable",
          sideAttachmentReach: 0.4,
        });
      part(train, `${prefix}:cream:${side}`, "wood", "plank",
        [centerX, (CANT_TOP + EAVES) / 2, wallZ + side * 0.01],
        [bodyHalf * 2 + 0.24, EAVES - CANT_TOP, 0.21], carriageCream, {
          volume: bodyHalf * 0.1,
          carriesAttachments: true,
          attachmentSupportMode: "cable",
          sideAttachmentReach: 0.35,
        });
    }

    for (const end of [-1, 1] as const) {
      const endX = centerX + end * halfLength;
      if (end === openEnd) {
        // The driver's bay shares the head coach's full interior. Its rear
        // frame carries the glazing; another decorative partition here would
        // only make a fake, impassable cab.
      } else if (end === passageEnd) {
        // Торец с настоящим проходом в соседний вагон: два простенка и
        // притолока, между ними — открытый проём 1.2 м.
        for (const side of [-1, 1] as const) {
          const inner = side * 0.6;
          const outer = side * CAR_HALF;
          part(train, `${prefix}:end:${end}:${side}`, "wood", "plank",
            [endX, (CAR_FLOOR - 0.14 + EAVES) / 2, TRACK_Z + (inner + outer) / 2],
            [0.24, EAVES - CAR_FLOOR + 0.14, Math.abs(outer - inner)], bodyColor, {
              volume: 0.4,
              bearingArea: 1.4,
              carriesAttachments: true,
              attachmentSupportMode: "cable",
              sideAttachmentReach: 0.4,
            });
        }
        part(train, `${prefix}:end-head:${end}`, "wood", "plank",
          [endX, (BAND_TOP + EAVES) / 2, TRACK_Z], [0.24, EAVES - BAND_TOP, 1.2], bodyColor, {
            carriesAttachments: true,
            attachmentSupportMode: "cable",
            sideAttachmentReach: 0.4,
          });
      } else {
        part(train, `${prefix}:end:${end}`, "wood", "plank",
          [endX, (CAR_FLOOR - 0.14 + EAVES) / 2, TRACK_Z],
          [0.24, EAVES - CAR_FLOOR + 0.14, CAR_HALF * 2], bodyColor, {
            volume: 0.9,
            bearingArea: 2.8,
            carriesAttachments: true,
            attachmentSupportMode: "cable",
            sideAttachmentReach: 0.4,
          });
        part(train, `${prefix}:end-window:${end}`, "glass", "glassPane",
          [endX - end * 0.06, (WAIST_TOP + BAND_TOP) / 2, TRACK_Z], [0.16, BAND_TOP - WAIST_TOP, 1.1],
          clearPassengerGlassColor, {
            bearsLoad: false,
            sideAttachmentReach: 0.3,
          });
      }
      for (let course = 0; course < 6; course += 1) {
        const height = ((course + 0.5) / 6) * 0.62;
        const chord = ROOF_R * Math.sqrt(Math.max(0, 1 - (height / 0.62) ** 2));
        // Венец идёт ДО арки: его дело — закрыть серп под кровлей, поэтому
        // он с ней смыкается (это и есть узел, а не брак).
        const width = 2 * Math.min(CAR_HALF, chord - 0.04);
        if (width < 0.12) {
          continue;
        }
        part(train, `${prefix}:gable:${end}:${course}`, "wood", "plank",
          [endX, EAVES + height, TRACK_Z], [0.24, (0.62 / 6) * 1.25, width], bodyColor, {
            volume: 0.05,
            bearsLoad: false,
            sideAttachmentReach: 0.3,
          });
      }
    }

    // Арочная крыша из семи сегментов — как у музейных вагонов.
    for (let segment = 0; segment < 7; segment += 1) {
      const angle = Math.PI * (0.15 + (segment / 6) * 0.7);
      part(train, `${prefix}:roof:${segment}`, "steel", "steelSheet",
        [centerX, EAVES + Math.sin(angle) * 0.62, TRACK_Z + Math.cos(angle) * ROOF_R],
        [CAR_LENGTH + 0.18, 0.16, 0.7], "#343b3d", {
          volume: 0.42,
          rotation: [-(angle + Math.PI / 2), 0, 0],
          carriesAttachments: true,
          attachmentSupportMode: "cable",
          // Вылет найтовки — только до собственной обвязки борта: с 0.4 крыша
          // хваталась за подзор навеса и переживала гибель сердца.
          sideAttachmentReach: 0.22,
        });
    }

    // Лавки спинками к СТЕНАМ и сдвинуты наружу: центральный проход 1.3 м,
    // вдвое шире капсулы игрока.
    for (const localX of [-4.2, -1.4, 1.4, 4.2]) {
      for (const side of [-1, 1] as const) {
        if (withDoor && side < 0 && Math.abs(localX) === 1.4) {
          continue;   // у двери тамбур: обе ближние лавки лезли в проём
        }
        addBench(train, `${prefix}:seat:${side}:${localX}`,
          centerX + localX, FLOOR_TOP, TRACK_Z + side * 0.95, side > 0 ? 0 : Math.PI, 1.6);
      }
    }
    // Вокзальная идентика: номер вагона на угловой панели, эмблема
    // перевозчика между окон, у двери — служебная табличка с бортовым.
    for (const side of [-1, 1] as const) {
      const wallZ = TRACK_Z + side * (CAR_HALF + 0.04);
      addPixelText(train, `${prefix}:mark:${side}`, coachNumber,
        centerX - side * (2 * PANE_PITCH + 1.4), WAIST_TOP - 0.42, wallZ, 0.07,
        "#e6e2d4", side);
      const emblemX = centerX + side * (2 * PANE_PITCH + 1.4);
      part(train, `${prefix}:emblem:${side}`, "steel", "panel",
        [emblemX, WAIST_TOP - 0.42, wallZ], [0.46, 0.46, 0.05], brass, {
          bearsLoad: false,
          sideAttachmentReach: 0.3,
        });
      part(train, `${prefix}:emblem:${side}:eye`, "steel", "panel",
        [emblemX, WAIST_TOP - 0.42, wallZ + side * 0.03], [0.2, 0.2, 0.05], "#20262a", {
          bearsLoad: false,
          sideAttachmentReach: 0.3,
        });
      part(train, `${prefix}:emblem:${side}:wing`, "steel", "steelSheet",
        [emblemX, WAIST_TOP - 0.42, wallZ + side * 0.03], [0.62, 0.07, 0.05], "#20262a", {
          bearsLoad: false,
          sideAttachmentReach: 0.3,
        });
    }
    // Четыре потолочных плафона на вагон: каждый является разрушаемым членом
    // состава и разрешает себе единственную опору — центральный лист крыши.
    for (const [lampIndex, localX] of [-4.5, -1.5, 1.5, 4.5].entries()) {
      const lampX = centerX + localX;
      const lampId = `${train.id}:${prefix}:lamp:${lampIndex}`;
      part(train, `${prefix}:lamp:${lampIndex}`, "glass", "glassPane",
        [lampX, EAVES + 0.47, TRACK_Z], [0.64, 0.14, 0.34], litWindowColor, {
          bearsLoad: false,
          contactBoxes: [{
            position: [lampX, EAVES + 0.58, TRACK_Z],
            size: [0.56, 0.26, 0.28],
          }],
          attachmentSupportMode: "cable",
          sideAttachmentReach: 0.18,
          attachmentSupportIds: [`${train.id}:${prefix}:roof:3`],
        });
      lamps.push({
        id: lampId,
        position: [lampX, EAVES + 0.24, TRACK_Z],
        carrierClusterId: train.id,
        color: "#ffd79b",
        distance: 14,
        intensity: 7.2,
        poolPriority: 12,
        poolGroupId: `${train.id}:cabin`,
        dayIntensityFactor: 1,
        eventLighting: cabinDockLighting,
      });
    }
  }

  addSkyCoach("head", HEAD_X, carriageGreen, true, 1, "01", -1);
  addSkyCoach("tail", TAIL_X, "#33403a", false, -1, "02");

  // --- Кабина машиниста ----------------------------------------------------
  // Центральная фронтальная рамка выступает вперёд; четыре луча расходятся от
  // её углов к крепёжным углам головного вагона. Стёкла лежат между этими
  // точками и наклонены к носу, поэтому рама действительно держит эркер.
  {
    const frontLower = 2.08;
    const frontUpper = 3.52;
    const rearLower = FLOOR_TOP;
    const rearUpper = EAVES;
    const frameThickness = 0.14;
    const frameOptions: Partial<BreakablePieceDefinition> = {
      carriesAttachments: true,
      attachmentSupportMode: "cable",
      sideAttachmentReach: 0.32,
    };
    const glassOptions: Partial<BreakablePieceDefinition> = {
      bearsLoad: false,
      attachmentSupportMode: "cable",
      sideAttachmentReach: 0.22,
    };
    const lerp = (from: number, to: number, amount: number): number =>
      from + (to - from) * amount;

    // Центральная фронтальная рамка и открытый крепёжный контур у вагона.
    for (const [tag, x, lower, upper, half] of [
      ["front", CAB_FRONT_X, frontLower, frontUpper, CAB_FRONT_HALF],
      ["rear", CAB_REAR_X, rearLower, rearUpper, CAB_REAR_HALF],
    ] as const) {
      for (const side of [-1, 1] as const) {
        part(train, `cab:frame:${tag}:side:${side}`, "steel", "steelSheet",
          [x, (lower + upper) / 2, TRACK_Z + side * half],
          [0.16, upper - lower, frameThickness], ironLight, frameOptions);
      }
      for (const [edge, y] of [["lower", lower], ["upper", upper]] as const) {
        part(train, `cab:frame:${tag}:${edge}`, "steel", "steelSheet",
          [x, y, TRACK_Z], [0.16, frameThickness, half * 2 + frameThickness],
          ironLight, frameOptions);
      }
    }

    // Четыре силовых луча идут именно ОТ углов передней рамки К вагону.
    for (const side of [-1, 1] as const) {
      beamBetween(train, `cab:frame:ray:upper:${side}`, "steel", "steelSheet",
        [CAB_FRONT_X, frontUpper, TRACK_Z + side * CAB_FRONT_HALF],
        [CAB_REAR_X, rearUpper, TRACK_Z + side * CAB_REAR_HALF],
        frameThickness, ironLight, frameOptions);
      beamBetween(train, `cab:frame:ray:lower:${side}`, "steel", "steelSheet",
        [CAB_FRONT_X, frontLower, TRACK_Z + side * CAB_FRONT_HALF],
        [CAB_REAR_X, rearLower, TRACK_Z + side * CAB_REAR_HALF],
        frameThickness, ironLight, frameOptions);
    }

    part(train, "cab:glass:front", "glass", "glassPane",
      [CAB_FRONT_X - 0.015, (frontLower + frontUpper) / 2, TRACK_Z],
      [0.09, frontUpper - frontLower - 0.18, CAB_FRONT_HALF * 2 - 0.2],
      clearPassengerGlassColor, glassOptions);

    // Верхнее и нижнее стекло наклоняются к передней рамке; три секции точно
    // следуют расширению от неё к крепёжному контуру вагона.
    for (const [surface, frontY, rearY] of [
      ["upper", frontUpper, rearUpper],
      ["lower", frontLower, rearLower],
    ] as const) {
      for (let section = 0; section < 3; section += 1) {
        const t0 = section / 3;
        const t1 = (section + 1) / 3;
        const x0 = lerp(CAB_FRONT_X, CAB_REAR_X, t0);
        const x1 = lerp(CAB_FRONT_X, CAB_REAR_X, t1);
        const y0 = lerp(frontY, rearY, t0);
        const y1 = lerp(frontY, rearY, t1);
        const half0 = lerp(CAB_FRONT_HALF, CAB_REAR_HALF, t0);
        const half1 = lerp(CAB_FRONT_HALF, CAB_REAR_HALF, t1);
        part(train, `cab:glass:${surface}:${section}`, "glass", "glassPane",
          [(x0 + x1) / 2, (y0 + y1) / 2, TRACK_Z],
          [Math.hypot(x1 - x0, y1 - y0) + 0.025, 0.08, half0 + half1 - 0.16],
          clearPassengerGlassColor, {
            ...glassOptions,
            sideAttachmentReach: 0.3,
            rotation: [0, 0, Math.atan2(y1 - y0, x1 - x0)],
            contactBoxes: [-1, 1].map((side) => ({
              position: [
                (x0 + x1) / 2,
                (frontY + rearY) / 2,
                TRACK_Z + side * ((half0 + half1) / 2 - 0.08),
              ] as SceneVector3,
              size: [Math.hypot(x1 - x0, y1 - y0), 0.1, 0.1] as SceneVector3,
            })),
            attachmentSupportIds: [-1, 1].map((side) =>
              `${train.id}:cab:frame:ray:${surface}:${side}`),
          });
      }
    }

    for (const side of [-1, 1] as const) {
      for (let section = 0; section < 3; section += 1) {
        const t0 = section / 3;
        const t1 = (section + 1) / 3;
        const x0 = lerp(CAB_FRONT_X, CAB_REAR_X, t0);
        const x1 = lerp(CAB_FRONT_X, CAB_REAR_X, t1);
        const half0 = lerp(CAB_FRONT_HALF, CAB_REAR_HALF, t0);
        const half1 = lerp(CAB_FRONT_HALF, CAB_REAR_HALF, t1);
        // Стекло сидит внутри ребра и не задевает узел передней подвески.
        const z0 = TRACK_Z + side * (half0 - 0.22);
        const z1 = TRACK_Z + side * (half1 - 0.22);
        const lower = (lerp(frontLower, rearLower, t0) + lerp(frontLower, rearLower, t1)) / 2;
        const upper = (lerp(frontUpper, rearUpper, t0) + lerp(frontUpper, rearUpper, t1)) / 2;
        part(train, `cab:glass:side:${side}:${section}`, "glass", "glassPane",
          [(x0 + x1) / 2, (lower + upper) / 2, (z0 + z1) / 2],
          [Math.hypot(x1 - x0, z1 - z0) + 0.025, upper - lower - 0.1, 0.08],
          clearPassengerGlassColor, {
            ...glassOptions,
            sideAttachmentReach: 0.3,
            rotation: [0, Math.atan2(-(z1 - z0), x1 - x0), 0],
            contactBoxes: [{
              position: [(x0 + x1) / 2, (frontUpper + rearUpper) / 2, (z0 + z1) / 2],
              size: [Math.hypot(x1 - x0, z1 - z0), 0.12, 0.08],
            }],
            attachmentSupportIds: [`${train.id}:cab:frame:ray:upper:${side}`],
          });
      }
    }

    // Человеческий масштаб: кресло и невысокий пульт оставляют свободными
    // оба края открытого стыка с вагоном.
    part(train, "cab:driver-seat:pedestal", "steel", "steelSheet",
      [-7.08, 1.67, TRACK_Z], [0.34, 0.34, 0.34], iron, {
        volume: 0.06,
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.24,
      });
    part(train, "cab:driver-seat:cushion", "wood", "plank",
      [-7.08, 1.91, TRACK_Z], [0.62, 0.18, 0.72], "#563b2e", {
        volume: 0.08,
        sideAttachmentReach: 0.28,
      });
    part(train, "cab:driver-seat:back", "wood", "plank",
      [-6.77, 2.3, TRACK_Z], [0.14, 0.82, 0.72], "#563b2e", {
        volume: 0.08,
        sideAttachmentReach: 0.28,
      });
    // No dashboard cabinet: the lower glazing stays useful. A thin offset
    // bracket grows from the chair at the exact pitch of the lower glass and
    // then rises to the only thing the driver needs — the brass control plate.
    const controlArmZ = TRACK_Z - 0.16;
    const controlArmFrom: SceneVector3 = [-7.08, 1.75, controlArmZ];
    const controlArmToX = -7.81;
    const lowerGlassSlope = (frontLower - rearLower) / (CAB_FRONT_X - CAB_REAR_X);
    const controlArmTo: SceneVector3 = [
      controlArmToX,
      controlArmFrom[1] + lowerGlassSlope * (controlArmToX - controlArmFrom[0]),
      controlArmZ,
    ];
    beamBetween(train, "cab:controls:arm:forward", "steel", "steelSheet",
      controlArmFrom, controlArmTo, 0.07, instrumentSteel, {
        volume: 0.006,
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.18,
        attachmentSupportIds: [`${train.id}:cab:driver-seat:pedestal`],
      });
    beamBetween(train, "cab:controls:arm:riser", "steel", "steelSheet",
      controlArmTo, [controlArmToX, 2.425, controlArmZ],
      0.07, instrumentSteel, {
        volume: 0.004,
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.18,
        attachmentSupportIds: [`${train.id}:cab:controls:arm:forward`],
      });
    part(train, "cab:controls:panel", "steel", "panel",
      [-7.93, 2.5, TRACK_Z - 0.265], [0.28, 0.055, 0.51], brass, {
        bearsLoad: false,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.3,
        // Start level, then lower the driver-side edge by twenty degrees.
        rotation: [0, 0, -Math.PI / 9],
        attachmentSupportIds: [`${train.id}:cab:controls:arm:riser`],
      });
    motionInstruments.push({
      id: `${train.id}:cab:flight-instruments`,
      sourceId: train.id,
      carrierClusterId: train.id,
      panelPieceId: `${train.id}:cab:controls:panel`,
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
          id: "approach",
          label: "APPROACH",
          color: "#ffd06d",
          condition: { kind: "phase", phases: ["approach"] },
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
    });
  }

  // --- Переход между вагонами ----------------------------------------------
  // Гармошка обещает проход — значит проход должен быть: настил под ногами,
  // мехи по бокам и сверху, сцепка внизу. Оба торца здесь с проёмами.
  {
    const gapFrom = HEAD_X + CAR_LENGTH / 2 + 0.12;
    const gapTo = TAIL_X - CAR_LENGTH / 2 - 0.12;
    const gapMid = (gapFrom + gapTo) / 2;
    const gapLength = gapTo - gapFrom;
    part(train, "coupler", "steel", "steelSheet",
      [gapMid, CAR_FLOOR - 0.14, TRACK_Z], [gapLength + 0.4, 0.24, 0.24], iron, {
        bearsLoad: false,
        sideAttachmentReach: 0.4,
      });
    part(train, "gangway:floor", "steel", "steelSheet",
      [gapMid, CAR_FLOOR + 0.06, TRACK_Z], [gapLength, 0.2, 1.3], iron, {
        volume: 0.12,
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.4,
      });
    for (const side of [-1, 1] as const) {
      part(train, `gangway:bellows:${side}`, "cloth", "panel",
        [gapMid, (FLOOR_TOP + BAND_TOP) / 2, TRACK_Z + side * 0.68],
        [gapLength, BAND_TOP - FLOOR_TOP, 0.14], "#2b3033", {
          bearsLoad: false,
          sideAttachmentReach: 0.4,
        });
    }
    part(train, "gangway:bellows:top", "cloth", "panel",
      [gapMid, BAND_TOP + 0.07, TRACK_Z], [gapLength, 0.14, 1.5], "#2b3033", {
        bearsLoad: false,
        sideAttachmentReach: 0.4,
      });
  }

  // Дверь головного вагона на перронную сторону: порог, косяки, латунная
  // ручка. Полотно и ручка — куски ОДНОЙ створки на общей петле.
  {
    const doorZ = TRACK_Z - CAR_HALF;
    part(train, "head:door:sill", "steel", "steelSheet",
      [HEAD_X, CAR_FLOOR + 0.06, doorZ], [DOOR_HALF * 2 + 0.3, 0.2, 0.26], brass, {
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.4,
      });
    for (const [jambTag, x] of [["fore", HEAD_X - DOOR_HALF], ["aft", HEAD_X + DOOR_HALF]] as const) {
      part(train, `head:door:jamb:${jambTag}`, "wood", "plank",
        [x, (FLOOR_TOP + BAND_TOP) / 2, doorZ], [0.18, BAND_TOP - FLOOR_TOP, 0.22], oakDark, {
          carriesAttachments: true,
          attachmentSupportMode: "cable",
          sideAttachmentReach: 0.4,
        });
    }
    // Притолока вынесена на 4 см наружу: заподлицо с обвязкой борта их грани
    // совпадали, и над дверью рябило наложение текстур.
    part(train, "head:door:lintel", "wood", "plank",
      [HEAD_X, (BAND_TOP + CANT_TOP) / 2, doorZ - 0.05], [DOOR_HALF * 2, CANT_TOP - BAND_TOP, 0.2], oakDark, {
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.4,
      });
    const leafHeight = BAND_TOP - FLOOR_TOP;
    const leafY = (FLOOR_TOP + BAND_TOP) / 2;
    const pivot: SceneVector3 = [HEAD_X - DOOR_HALF + 0.08, leafY, doorZ - 0.1];
    const hinge = {
      pivot,
      direction: [1, 0, 0] as SceneVector3,
      normal: [0, 0, -1] as SceneVector3,
    };
    part(train, "head:door:board:0", "wood", "plank",
      [HEAD_X, leafY, doorZ - 0.1], [DOOR_HALF * 2 - 0.2, leafHeight, 0.12], oak, {
        hinge,
        bearsLoad: false,
        sideAttachmentReach: 0.4,
      });
    part(train, "head:door:plate", "steel", "panel",
      [HEAD_X + DOOR_HALF + 0.32, WAIST_TOP + 0.34, doorZ - 0.13], [0.5, 0.34, 0.06], "#20323c", {
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.3,
      });
    addPixelText(train, "head:door:plate:text", "03",
      HEAD_X + DOOR_HALF + 0.32, WAIST_TOP + 0.3, doorZ - 0.17, 0.045, "#e6e2d4", -1);
    part(train, "head:door:board:1", "steel", "steelSheet",
      [HEAD_X + DOOR_HALF - 0.3, leafY - 0.05, doorZ - 0.2], [0.1, 0.34, 0.1], brass, {
        hinge,
        bearsLoad: false,
        sideAttachmentReach: 0.3,
      });
  }

  // --- Подвеска ------------------------------------------------------------
  // Вагоны висят на угловых тягах ЗА торцами: пройди тяга вдоль борта, она
  // прошила бы карниз крыши. Тяги приходят на поперечные траверсы, поджатые
  // под брюхо оболочки — их высота идёт по профилю, поэтому у носа и кормы
  // тяги длиннее. Траверса нужна не только для вида: шпангоуты и стрингеры
  // объявлены bearsLoad:false, единственный несущий предмет корабля — сердце,
  // и только через неё тяги дотягиваются до его контактного объёма.
  const HANGER_Z = 1.35;
  const hangerStations: readonly (readonly [number, number, number])[] = [
    [HEAD_X - CAR_LENGTH / 2 - 0.2, 0.3, -1],
    [HEAD_X + CAR_LENGTH / 2 + 0.2, 0, 1],
    [TAIL_X - CAR_LENGTH / 2 - 0.2, 0, -1],
    [TAIL_X + CAR_LENGTH / 2 + 0.2, 0.3, 1],
  ];
  const yokeStations: readonly (readonly [number, number])[] = [
    [HEAD_X - CAR_LENGTH / 2 - 0.42, 0.3],
    [(HEAD_X + TAIL_X) / 2, 1.1],
    [TAIL_X + CAR_LENGTH / 2 + 0.42, 0.3],
  ];
  const yokeYAt = (x: number): number => HULL_Y - hullRadiusAt(x) - 0.32;
  for (const [yokeX, yokeWidth] of yokeStations) {
    part(train, `yoke:${yokeX.toFixed(2)}`, "steel", "steelSheet",
      [yokeX, yokeYAt(yokeX), TRACK_Z], [yokeWidth, 0.3, HANGER_Z * 2 + 0.26], ironLight, {
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.5,
        bearingArea: 1.1,
      });
  }
  for (const [hangerX, , inward] of hangerStations) {
    const top = yokeYAt(hangerX) - 0.06;
    for (const side of [-1, 1] as const) {
      part(train, `hanger:${hangerX.toFixed(2)}:${side}`, "steel", "steelSheet",
        [hangerX, (FLOOR_TOP + top) / 2, TRACK_Z + side * HANGER_Z],
        [0.14, top - FLOOR_TOP, 0.14], ironLight, {
          carriesAttachments: true,
          attachmentSupportMode: "cable",
          sideAttachmentReach: 0.45,
          bearingArea: 0.9,
        });
      // Косынка на торцевой раме: узел крепления должен быть виден, иначе
      // тяга читается висящей рядом с вагоном, а не держащей его.
      part(train, `hanger-cleat:${hangerX.toFixed(2)}:${side}`, "steel", "steelSheet",
        [hangerX - inward * 0.28, EAVES - 0.35, TRACK_Z + side * HANGER_Z],
        [0.62, 0.5, 0.2], ironLight, {
          bearsLoad: false,
          sideAttachmentReach: 0.4,
        });
      part(train, `hanger-shoe:${hangerX.toFixed(2)}:${side}`, "steel", "steelSheet",
        [hangerX - inward * 0.22, FLOOR_TOP + 0.05, TRACK_Z + side * HANGER_Z],
        [0.5, 0.34, 0.2], iron, {
          bearsLoad: false,
          sideAttachmentReach: 0.4,
        });
    }
    // Поперечная стяжка между тягами станции: она идёт ВЫШЕ конька крыши —
    // подкос, уходивший к кузову наискось, просто резал кровлю.
    part(train, `hanger-tie:${hangerX.toFixed(2)}`, "steel", "steelSheet",
      [hangerX, top - 0.85, TRACK_Z], [0.1, 0.09, HANGER_Z * 2], "#7f8488", {
        bearsLoad: false,
        sideAttachmentReach: 0.5,
      });
  }

  // --- Моторные гондолы ----------------------------------------------------
  // Вынос 4.6 м выбран из круга винта: радиус 1.15 м плюс запас должен пройти
  // мимо оболочки радиусом 3 м, иначе лопасти рубили бы обшивку.
  const engineX = 5.6;
  const engineY = 7.6;
  const engineB = 4.6;
  const engineDiameter = 1.05;
  const engineRadius = engineDiameter / 2;
  for (const side of [-1, 1] as const) {
    const z = TRACK_Z + side * engineB;
    addFacetedCylinder(train, `engine:${side}:body`, "steel", "steelSheet", "x",
      [engineX, engineY, z], 2.6, engineDiameter, "#3f4a4c", {
        actuator: {
          id: `sky-train:propulsor:${side}`,
          commandChannel: `throttle:${side === -1 ? 0 : 1}`,
          required: true,
        },
      });
    part(train, `engine:${side}:collar`, "steel", "steelSheet",
      [engineX - 1.32, engineY, z], [0.22, 1.1, 1.1], brass, {
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.4,
      });
    part(train, `engine:${side}:hub`, "steel", "steelSheet",
      [engineX - 1.55, engineY, z], [0.36, 0.34, 0.34], iron, {
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.35,
      });
    for (const blade of [-1, 1] as const) {
      part(train, `engine:${side}:blade:${blade}`, "wood", "panel",
        [engineX - 1.62, engineY + blade * 0.72, z], [0.12, 1.3, 0.32], oak, {
          rotation: [0, 0, blade * 0.24],
          actuator: {
            id: `sky-train:propulsor:${side}`,
            commandChannel: `throttle:${side === -1 ? 0 : 1}`,
          },
          bearsLoad: false,
          sideAttachmentReach: 0.4,
        });
    }
    part(train, `engine:${side}:stack`, "steel", "steelSheet",
      [engineX + 0.55, engineY + 0.72, z], [0.22, 0.7, 0.22], iron, {
        bearsLoad: false,
        sideAttachmentReach: 0.4,
      });
    // Крыло выноса: несущий обтекатель от борта оболочки к мотору плюс подкос.
    part(train, `engine:${side}:wing`, "steel", "panel",
      [engineX, engineY + 0.45, TRACK_Z + side * ((engineB + 2.0) / 2)],
      [1.7, 0.18, engineB - 2.0], "#83898d", {
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.55,
        bearingArea: 0.8,
      });
    part(train, `engine:${side}:strut`, "steel", "steelSheet",
      [engineX + 0.9, engineY + 0.4, TRACK_Z + side * ((engineB + 2.4) / 2)],
      [0.12, 1.5, engineB - 2.4], ironLight, {
        rotation: [side * 0.6, 0, 0],
        bearsLoad: false,
        sideAttachmentReach: 0.5,
      });
  }

  // Аэронавигационные огни, как на самолёте: корабль идёт носом на -x,
  // поэтому его ПРАВЫЙ борт — перронная сторона, и там зелёный; на левом
  // красный. Нос и корма несут по белому.
  for (const [side, tone] of [[-1, "#7fe6a0"], [1, "#f08a80"]] as const) {
    // Тонкая площадка сидит в центре НАРУЖНОГО борта гондолы и совпадает с ней
    // цветом и материалом. Плоская линза лежит на площадке, а light source —
    // сразу за её внешней гранью.
    const engineZ = TRACK_Z + side * engineB;
    const mountZ = engineZ + side * (engineRadius - 0.01);
    const lensZ = engineZ + side * (engineRadius + 0.02);
    part(train, `nav-light:${side}:mount`, "steel", "steelSheet",
      [engineX, engineY, mountZ], [0.48, 0.48, 0.08], "#3f4a4c", {
        carriesAttachments: true,
        contactBoxes: [{
          position: [engineX, engineY, engineZ + side * (engineRadius - 0.12)],
          size: [0.44, 0.44, 0.26],
        }],
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.12,
      });
    part(train, `nav-light:${side}`, "glass", "glassPane",
      [engineX, engineY, lensZ], [0.34, 0.34, 0.1], tone, {
        bearsLoad: false,
        contactBoxes: [{
          position: [engineX, engineY, lensZ],
          size: [0.3, 0.3, 0.08],
        }],
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.08,
        attachmentSupportIds: [`${train.id}:nav-light:${side}:mount`],
      });
    lamps.push({
      id: `${train.id}:nav-light:${side}`,
      position: [engineX, engineY, lensZ + side * 0.14],
      carrierClusterId: train.id,
      color: side < 0 ? "#6bff9c" : "#ff6f62",
      distance: 24,
      intensity: 5,
      poolPriority: 8,
      beacon: {
        physicalDiameter: 0.9,
        minScreenDiameter: 6,
        maxWorldDiameter: 1.8,
        dayOpacity: 0.72,
        nightOpacity: 1,
      },
    });
  }
  const axialNavLights = [
    ["nose", -1, HULL_FROM - 1.0],
    ["tail", 1, HULL_TO - 0.2],
  ] as const;
  for (const [navTag, direction, housingSurfaceX] of axialNavLights) {
    const mountX = housingSurfaceX + direction * 0.04;
    const lensX = housingSurfaceX + direction * 0.23;
    // Гнездо слегка утоплено в последний обтекатель, линза перекрывает его
    // наружную кромку. Так физическая и структурная точки крепления совпадают.
    part(train, `nav-light:${navTag}:mount`, "steel", "steelSheet",
      [mountX, HULL_Y, TRACK_Z], [0.18, 0.5, 0.5], ironLight, {
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.22,
      });
    part(train, `nav-light:${navTag}`, "glass", "glassPane",
      [lensX, HULL_Y, TRACK_Z], [0.2, 0.34, 0.34], "#f4f1e2", {
        bearsLoad: false,
        contactBoxes: [{
          position: [lensX + direction * 0.03, HULL_Y, TRACK_Z],
          size: [0.12, 0.3, 0.3],
        }],
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.08,
        attachmentSupportIds: [`${train.id}:nav-light:${navTag}:mount`],
        maximumVerticalGap: 0.02,
      });
    lamps.push({
      id: `${train.id}:nav-light:${navTag}`,
      position: [lensX + direction * 0.27, HULL_Y, TRACK_Z],
      carrierClusterId: train.id,
      color: "#fff6dc",
      distance: 18,
      intensity: 3.4,
      poolPriority: 6,
      beacon: {
        physicalDiameter: 0.75,
        minScreenDiameter: 5,
        maxWorldDiameter: 1.5,
        dayOpacity: 0.64,
        nightOpacity: 0.95,
      },
    });
  }

  // Состав висит на сердце и не опирается на путь ни одной точкой. У стали
  // окно опоры 1.1 м — без этого рама вагона «садится» на шпалы, скамьи
  // внутри находят под собой рельс, и разбитое сердце перестаёт ронять поезд.
  for (let index = 0; index < train.pieces.length; index += 1) {
    const piece = train.pieces[index];
    if (piece.position[1] - piece.size[1] / 2 < 1.7) {
      train.pieces[index] = { ...piece, maximumVerticalGap: 0.06 };
    }
  }

  finish(train, "Sky train at platform 0", "steel", "linked");
}

createCircularGround();
createHeadhouse();
createPublicInterior();
createTrainShed();
createTracksAndPlatforms();
createFogSiding();
createServiceBuildings();
createSteamLocomotive();
createPassengerTrain();
createStationLife();

// The terrestrial terminal reuses wider existing fixtures within a smaller
// local budget. The sky berth and its train are authored afterwards and keep
// their established twelve-light behaviour unchanged.
for (let index = 0; index < lamps.length; index += 1) {
  lamps[index] = {
    ...lamps[index],
    localPoolCapacity: STATION_LOCAL_LIGHT_CAPACITY,
  };
}
createSkyPlatform();

export const grandTerminalScene = createDestructionScene({
  id: "grand-terminal",
  title: "Make a Mess: Grand Terminal",
  environment: "town",
  playerSpawn: [0, 1.25, 63],
  cameraFar: ROUTE_CAMERA_FAR,
  worldCenter: [0, WORLD_CENTER_Z],
  worldHalfExtents: [102, 102],
  boundaryRadius: ROUTE_BOUNDARY_RADIUS,
  skyRadius: ROUTE_SKY_RADIUS,
  worldRadius: WORLD_RADIUS,
  safetyFloorY: -2.2,
  copy: {
    status: "Make a Mess / Grand Terminal",
    eyebrow: "Railway museum test 001",
    heading: "Вокзал — объект.",
    ready: "Grand Terminal is open",
    loading: "Подаём паровозы…",
    description:
      "Большой европейский железнодорожный музей: монументальный кассовый зал, платформы под стеклянным дебаркадером, паровоз, исторические вагоны, скамейки, табло, велосипеды и багаж. Каждая арка, ферма, рельс и деталь подчиняется общему движку разрушения.",
    enter: "Войти на вокзал",
    returnToGame: "Вернуться на платформу",
    reset: "Восстановить терминал",
  },
  clusters,
  lamps,
  spotLights,
  mutableObjects,
  motionInstruments,
});

export const grandTerminalMaterials = [
  "brick",
  "stone",
  "steel",
  "wood",
  "glass",
  "darkGlass",
  "graphiteStone",
] as const satisfies readonly BreakableMaterial[];
