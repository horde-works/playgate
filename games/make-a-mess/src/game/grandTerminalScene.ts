import {
  createDestructionScene,
  litWindowColor,
  type BreakableClusterDefinition,
  type BreakableMaterial,
  type BreakablePieceDefinition,
  type BreakableShape,
  type LampDefinition,
  type SceneVector3,
  type SupportMode,
} from "./destructionScene.ts";

const clusters: BreakableClusterDefinition[] = [];
const lamps: LampDefinition[] = [];

const WORLD_CENTER_Z = -14;
const WORLD_RADIUS = 98;
const FLOOR_Y = 0.18;
const FRONT_Z = 34;
const REAR_Z = 8;
const SHED_END_Z = -72;

const brickRed = "#8f3f2f";
const brickDark = "#6f3028";
const limestone = "#c1b7a2";
const limestoneDark = "#918a7b";
const iron = "#283033";
const ironLight = "#4b5558";
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
    builder.add(`${prefix}:facet:${index}`, material, shape, slabPosition, size, color);
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

const pixelFont: Readonly<Record<string, readonly string[]>> = {
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
  mirrored = false,
  emissive = false,
): void {
  // Emissive glyphs are lit-glass cells: pale in daylight, self-lit at night
  // (the shared glow material ramps their emissive up after dusk), so a sign
  // reads as a back-lit split-flap board without any extra light source.
  const glyphMaterial: BreakableMaterial = emissive ? "glass" : "steel";
  const glyphShape: BreakableShape = emissive ? "glassPane" : "steelSheet";
  const glyphColor = emissive ? litWindowColor : color;
  const glyphWidth = pixel * 6;
  const totalWidth = Math.max(0, text.length * glyphWidth - pixel);
  let pieceIndex = 0;
  [...text.toUpperCase()].forEach((character, characterIndex) => {
    const rows = pixelFont[character];
    if (!rows) {
      return;
    }
    rows.forEach((row, rowIndex) => {
      [...row].forEach((cell, columnIndex) => {
        if (cell !== "1") {
          return;
        }
        // Text reads left-to-right for a viewer facing -z. A sign face read
        // from the other side (viewer facing +z) must be laid out mirrored.
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
        pieceIndex += 1;
      });
    });
  });
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
  addPixelText(facade, "name", "GRAND TERMINAL", 0, 13.55, FRONT_Z + 0.74, 0.26, "#d2ad55");

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
  addPixelText(hall, "departure-title", "DEPARTURES", 0, 10.45, boardZ + 0.2, 0.185, litWindowColor, false, true);
  const departures: readonly [string, string][] = [
    ["BALLYVOR", "1"],
    ["KORSVIK", "2"],
    ["DUNMORE", "3"],
  ];
  for (const [rowIndex, [city, platform]] of departures.entries()) {
    const rowY = 8.75 - rowIndex * 1.32;
    addPixelText(hall, `departure-city:${rowIndex}`, city, -2.6, rowY, boardZ + 0.2, 0.14, litWindowColor, false, true);
    addPixelText(hall, `departure-platform:${rowIndex}`, platform, 5.3, rowY, boardZ + 0.2, 0.16, litWindowColor, false, true);
    if (rowIndex < departures.length - 1) {
      hall.add(`departure-line:${rowIndex}`, "steel", "steelSheet", [0, rowY - 0.66, boardZ + 0.12], [11.9, 0.06, 0.12], "#3a4144");
    }
  }

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
    addLampFixture(hall, `hall-lamp:${index}`, [x, 13.8, 22], 13, 3.7);
  }
  for (const [index, x] of [-27, -20, 20, 27].entries()) {
    hall.add(`wing-lamp-post:${index}`, "steel", "steelSheet", [x, 4.6, 22], [0.18, 9.2, 0.18], iron);
    addLampFixture(hall, `wing-lamp:${index}`, [x, 9.2, 22], 9, 2.8);
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
          distance: 9,
          intensity: 2.6,
        });
      }
      fittings.add(`${id}:board`, "graphiteStone", "panel", [platformX, 4.15, z], [3.7, 1.35, 0.2], "#1b2426");
      addPixelText(fittings, `${id}:number`, String(platformIndex + 1), platformX, 4.15, z + 0.16, 0.16, "#f0deb0");
      addPixelText(fittings, `${id}:number-back`, String(platformIndex + 1), platformX, 4.15, z - 0.16, 0.16, "#f0deb0", true);
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
    forecourt.add(
      `rim:${index}`,
      "stone",
      "stoneBlock",
      [Math.cos(angle) * radius, 0.05, WORLD_CENTER_Z + Math.sin(angle) * radius],
      [9.25, 0.52, 1.05],
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
    addPixelText(forecourt, `kiosk:${sideIndex}:sign`, side > 0 ? "INFO" : "CAFE", x, 3.0, 47.64, 0.16, "#ead59b", true);
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

  // Trees and clipped hedges soften the edge of the railway museum grounds.
  for (const [index, [x, z]] of [
    [-66, 28], [-72, 8], [-68, -18], [-62, -48],
    [66, 28], [72, 8], [68, -18], [62, -48],
    [-40, 68], [40, 68],
  ].entries()) {
    landscape.add(`tree:${index}:trunk`, "wood", "plank", [x, 2.7, z], [0.85, 5.4, 0.85], oakDark);
    for (const [crownIndex, [dx, dy, dz, size]] of [
      [0, 4.8, 0, 4.1],
      [-1.6, 3.9, 0.2, 3.1],
      [1.5, 4.05, -0.3, 3.2],
      [0.2, 5.9, 0.1, 3.0],
    ].entries()) {
      landscape.add(`tree:${index}:crown:${crownIndex}`, "foliage", "panel", [x + dx, dy, z + dz], [size, size, size], crownIndex % 2 === 0 ? "#36503a" : "#456044");
    }
  }

  // Cast-iron lamps lead from the round edge to the entrance.
  for (const [index, [x, z]] of [
    [-8, 72], [8, 72], [-16, 62], [16, 62], [-22, 51], [22, 51], [-35, 39], [35, 39],
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

createCircularGround();
createHeadhouse();
createPublicInterior();
createTrainShed();
createTracksAndPlatforms();
createSteamLocomotive();
createPassengerTrain();
createStationLife();

export const grandTerminalScene = createDestructionScene({
  id: "grand-terminal",
  title: "Make a Mess: Grand Terminal",
  environment: "town",
  playerSpawn: [0, 1.25, 63],
  cameraFar: 260,
  worldCenter: [0, WORLD_CENTER_Z],
  worldHalfExtents: [102, 102],
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
