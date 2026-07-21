import {
  litWindowColor,
  type BreakableClusterDefinition,
  type BreakableMaterial,
  type BreakablePieceDefinition,
  type BreakableShape,
  type LampDefinition,
  type SceneVector3,
  type SupportMode,
} from "./destructionScene.ts";

interface MinasWorldbuildingOptions {
  readonly surfaceYAt: (x: number, z: number) => number;
}

interface MinasWorldbuildingResult {
  readonly clusters: readonly BreakableClusterDefinition[];
  readonly lamps: readonly LampDefinition[];
}

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

const TOWER_CENTER_Z = -36;
const TOWER_FLOOR_HEIGHT = 4.15;
const TOWER_FLOORS = 8;

const woodDark = "#3d281b";
const woodMid = "#573923";
const woodLight = "#6b482b";
const ironDark = "#252b2e";
const ironMid = "#394044";
const stoneDark = "#303438";
const stoneMid = "#555956";
const stoneLight = "#777970";
const canvasDark = "#8c846e";

function seededNoise(x: number, z: number, salt = 0): number {
  const value = Math.sin(x * 91.17 + z * 47.33 + salt * 19.71) * 43758.5453;
  return value - Math.floor(value);
}

function zone(id: string): ZoneBuilder {
  const pieces: BreakablePieceDefinition[] = [];
  return {
    id,
    pieces,
    add(suffix, material, shape, position, size, color, rotation, contactSize) {
      pieces.push({
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

function finishZone(
  builder: ZoneBuilder,
  label: string,
  material: BreakableMaterial,
  supportMode: SupportMode,
): BreakableClusterDefinition {
  return {
    id: builder.id,
    label,
    material,
    supportMode,
    pieces: builder.pieces,
  };
}

function rotateXZ(
  x: number,
  z: number,
  yaw: number,
): readonly [number, number] {
  const cosine = Math.cos(yaw);
  const sine = Math.sin(yaw);
  return [x * cosine - z * sine, x * sine + z * cosine];
}

function rotatedContactSize(
  size: SceneVector3,
  yaw: number,
): SceneVector3 {
  const cosine = Math.abs(Math.cos(yaw));
  const sine = Math.abs(Math.sin(yaw));
  return [
    size[0] * cosine + size[2] * sine,
    size[1],
    size[0] * sine + size[2] * cosine,
  ];
}

function addTable(
  builder: ZoneBuilder,
  prefix: string,
  x: number,
  floorY: number,
  z: number,
  yaw = 0,
  width = 2.35,
  depth = 1.05,
): void {
  const topY = floorY + 0.82;
  const legHeight = 0.72;
  for (const [index, [localX, localZ]] of [
    [-width * 0.4, -depth * 0.34],
    [width * 0.4, -depth * 0.34],
    [-width * 0.4, depth * 0.34],
    [width * 0.4, depth * 0.34],
  ].entries()) {
    const [dx, dz] = rotateXZ(localX, localZ, yaw);
    builder.add(
      `${prefix}:leg:${index}`,
      "wood",
      "plank",
      [x + dx, floorY + legHeight / 2, z + dz],
      [0.18, legHeight, 0.18],
      index % 2 === 0 ? woodDark : woodMid,
      [0, yaw, 0],
    );
  }
  const topSize: SceneVector3 = [width, 0.2, depth];
  builder.add(
    `${prefix}:top`,
    "wood",
    "plank",
    [x, topY, z],
    topSize,
    woodMid,
    [0, yaw, 0],
    rotatedContactSize(topSize, yaw),
  );
}

function addBench(
  builder: ZoneBuilder,
  prefix: string,
  x: number,
  floorY: number,
  z: number,
  yaw = 0,
  width = 2.15,
): void {
  const [leftX, leftZ] = rotateXZ(-width * 0.38, 0, yaw);
  const [rightX, rightZ] = rotateXZ(width * 0.38, 0, yaw);
  for (const [index, [dx, dz]] of [
    [leftX, leftZ],
    [rightX, rightZ],
  ].entries()) {
    builder.add(
      `${prefix}:leg:${index}`,
      "wood",
      "plank",
      [x + dx, floorY + 0.28, z + dz],
      [0.2, 0.56, 0.36],
      woodDark,
      [0, yaw, 0],
    );
  }
  const seatSize: SceneVector3 = [width, 0.16, 0.48];
  builder.add(
    `${prefix}:seat`,
    "wood",
    "plank",
    [x, floorY + 0.62, z],
    seatSize,
    woodLight,
    [0, yaw, 0],
    rotatedContactSize(seatSize, yaw),
  );
}

function addCrate(
  builder: ZoneBuilder,
  prefix: string,
  x: number,
  floorY: number,
  z: number,
  size = 1.05,
  yaw = 0,
): void {
  const wall = 0.14;
  const height = size * 0.86;
  builder.add(
    `${prefix}:base`,
    "wood",
    "plank",
    [x, floorY + wall / 2, z],
    [size, wall, size],
    woodDark,
    [0, yaw, 0],
  );
  for (const [index, local] of [
    [0, -size / 2 + wall / 2],
    [0, size / 2 - wall / 2],
  ].entries()) {
    const [dx, dz] = rotateXZ(local[0], local[1], yaw);
    builder.add(
      `${prefix}:side-z:${index}`,
      "wood",
      "plank",
      [x + dx, floorY + height / 2, z + dz],
      [size, height, wall],
      index === 0 ? woodMid : woodLight,
      [0, yaw, 0],
    );
  }
  for (const [index, local] of [
    [-size / 2 + wall / 2, 0],
    [size / 2 - wall / 2, 0],
  ].entries()) {
    const [dx, dz] = rotateXZ(local[0], local[1], yaw);
    builder.add(
      `${prefix}:side-x:${index}`,
      "wood",
      "plank",
      [x + dx, floorY + height / 2, z + dz],
      [wall, height, size - wall * 2],
      index === 0 ? woodLight : woodMid,
      [0, yaw, 0],
    );
  }
  builder.add(
    `${prefix}:lid`,
    "wood",
    "plank",
    [x, floorY + height + wall / 2, z],
    [size + 0.04, wall, size + 0.04],
    woodLight,
    [0, yaw, 0],
  );
}

function addBarrel(
  builder: ZoneBuilder,
  prefix: string,
  x: number,
  floorY: number,
  z: number,
  scale = 1,
): void {
  const width = 0.78 * scale;
  const height = 1.12 * scale;
  builder.add(
    `${prefix}:body`,
    "wood",
    "plank",
    [x, floorY + height / 2, z],
    [width, height, width],
    woodMid,
  );
  for (const [index, y] of [0.2, 0.55, 0.9].entries()) {
    builder.add(
      `${prefix}:hoop:${index}:x`,
      "steel",
      "steelSheet",
      [x, floorY + y * scale, z],
      [width + 0.08, 0.09, width + 0.04],
      ironDark,
    );
  }
}

function addShelf(
  builder: ZoneBuilder,
  prefix: string,
  x: number,
  floorY: number,
  z: number,
  yaw = 0,
  width = 2.6,
): void {
  const height = 2.35;
  for (const [index, localX] of [-width / 2 + 0.12, width / 2 - 0.12].entries()) {
    const [dx, dz] = rotateXZ(localX, 0, yaw);
    builder.add(
      `${prefix}:post:${index}`,
      "wood",
      "plank",
      [x + dx, floorY + height / 2, z + dz],
      [0.2, height, 0.28],
      woodDark,
      [0, yaw, 0],
    );
  }
  for (let level = 0; level < 4; level += 1) {
    const shelfY = floorY + 0.18 + level * 0.66;
    for (const [bracket, localX] of [-width / 2 + 0.16, width / 2 - 0.16].entries()) {
      const [dx, dz] = rotateXZ(localX, 0, yaw);
      builder.add(
        `${prefix}:bracket:${level}:${bracket}`,
        "steel",
        "steelSheet",
        [x + dx, shelfY - 0.13, z + dz],
        [0.4, 0.12, 0.46],
        ironDark,
        [0, yaw, 0],
      );
    }
    builder.add(
      `${prefix}:shelf:${level}`,
      "wood",
      "plank",
      [x, shelfY, z],
      [width, 0.14, 0.62],
      level % 2 === 0 ? woodMid : woodLight,
      [0, yaw, 0],
    );
  }
}

function addBed(
  builder: ZoneBuilder,
  prefix: string,
  x: number,
  floorY: number,
  z: number,
  yaw = 0,
): void {
  const width = 0.95;
  const length = 2.05;
  for (const [index, [localX, localZ]] of [
    [-width * 0.38, -length * 0.4],
    [width * 0.38, -length * 0.4],
    [-width * 0.38, length * 0.4],
    [width * 0.38, length * 0.4],
  ].entries()) {
    const [dx, dz] = rotateXZ(localX, localZ, yaw);
    builder.add(
      `${prefix}:leg:${index}`,
      "wood",
      "plank",
      [x + dx, floorY + 0.24, z + dz],
      [0.15, 0.48, 0.15],
      woodDark,
      [0, yaw, 0],
    );
  }
  builder.add(
    `${prefix}:frame`,
    "wood",
    "plank",
    [x, floorY + 0.55, z],
    [width, 0.18, length],
    woodMid,
    [0, yaw, 0],
  );
  builder.add(
    `${prefix}:blanket`,
    "plaster",
    "panel",
    [x, floorY + 0.69, z + Math.cos(yaw) * 0.12],
    [width * 0.9, 0.1, length * 0.7],
    canvasDark,
    [0, yaw, 0],
  );
}

function addWeaponRack(
  builder: ZoneBuilder,
  prefix: string,
  x: number,
  floorY: number,
  z: number,
  yaw = 0,
): void {
  const width = 2.4;
  for (const [index, localX] of [-width * 0.42, width * 0.42].entries()) {
    const [dx, dz] = rotateXZ(localX, 0, yaw);
    builder.add(
      `${prefix}:post:${index}`,
      "wood",
      "plank",
      [x + dx, floorY + 1.05, z + dz],
      [0.18, 2.1, 0.22],
      woodDark,
      [0, yaw, 0],
    );
  }
  for (const [index, y] of [0.55, 1.45].entries()) {
    builder.add(
      `${prefix}:rail:${index}`,
      "steel",
      "steelSheet",
      [x, floorY + y, z],
      [width, 0.17, 0.25],
      ironDark,
      [0, yaw, 0],
    );
  }
  for (let weapon = 0; weapon < 5; weapon += 1) {
    const localX = -0.82 + weapon * 0.41;
    const [dx, dz] = rotateXZ(localX, -0.08, yaw);
    builder.add(
      `${prefix}:weapon:${weapon}`,
      "steel",
      "steelSheet",
      [x + dx, floorY + 1.1, z + dz],
      [0.08, 1.62, 0.08],
      weapon % 2 === 0 ? ironDark : ironMid,
      [0, yaw, (weapon - 2) * 0.035],
    );
  }
}

function addTorch(
  builder: ZoneBuilder,
  lamps: LampDefinition[],
  prefix: string,
  position: SceneVector3,
  normalAxis: "x" | "z" = "z",
  intensity = 3.2,
): void {
  const [x, y, z] = position;
  builder.add(
    `${prefix}:bracket`,
    "steel",
    "steelSheet",
    [x, y - 0.36, z],
    normalAxis === "z" ? [0.16, 0.58, 0.28] : [0.28, 0.58, 0.16],
    ironDark,
  );
  builder.add(
    `${prefix}:flame`,
    "glass",
    "glassPane",
    [x, y, z],
    [0.28, 0.5, 0.28],
    litWindowColor,
  );
  lamps.push({
    id: `${builder.id}:${prefix}:flame`,
    position: [x, y + 0.12, z],
    color: "#ffb35e",
    distance: 8.5,
    intensity,
  });
}

function addShed(
  builder: ZoneBuilder,
  prefix: string,
  x: number,
  floorY: number,
  z: number,
  width: number,
  depth: number,
  yaw = 0,
  roofMaterial: BreakableMaterial = "wood",
): void {
  const height = 3.35;
  for (const [index, [localX, localZ]] of [
    [-width / 2, -depth / 2],
    [width / 2, -depth / 2],
    [-width / 2, depth / 2],
    [width / 2, depth / 2],
  ].entries()) {
    const [dx, dz] = rotateXZ(localX, localZ, yaw);
    builder.add(
      `${prefix}:post:${index}`,
      "wood",
      "plank",
      [x + dx, floorY + height / 2, z + dz],
      [0.32, height, 0.32],
      index % 2 === 0 ? woodDark : woodMid,
      [0, yaw, 0],
    );
  }
  for (const [index, localZ] of [-depth / 2, depth / 2].entries()) {
    const [dx, dz] = rotateXZ(0, localZ, yaw);
    builder.add(
      `${prefix}:beam:${index}`,
      "wood",
      "plank",
      [x + dx, floorY + height + 0.05, z + dz],
      [width + 0.5, 0.3, 0.34],
      woodDark,
      [0, yaw, 0],
    );
  }
  const roofBoards = Math.max(4, Math.round(width / 0.8));
  for (let board = 0; board < roofBoards; board += 1) {
    const localX = -width / 2 + (board + 0.5) * (width / roofBoards);
    const [dx, dz] = rotateXZ(localX, 0, yaw);
    builder.add(
      `${prefix}:roof:${board}`,
      roofMaterial,
      roofMaterial === "steel" ? "steelSheet" : "plank",
      [x + dx, floorY + height + 0.34, z + dz],
      [width / roofBoards + 0.07, roofMaterial === "steel" ? 0.055 : 0.18, depth + 0.9],
      roofMaterial === "steel" ? "#3f484b" : board % 2 === 0 ? woodMid : woodLight,
      [0, yaw, board % 2 === 0 ? 0.025 : -0.025],
    );
  }
  for (let panel = 0; panel < Math.max(3, Math.round(width / 1.2)); panel += 1) {
    const localX = -width / 2 + (panel + 0.5) * (width / Math.max(3, Math.round(width / 1.2)));
    const [dx, dz] = rotateXZ(localX, -depth / 2, yaw);
    builder.add(
      `${prefix}:back:${panel}`,
      "wood",
      "plank",
      [x + dx, floorY + 1.35, z + dz],
      [width / Math.max(3, Math.round(width / 1.2)) + 0.04, 2.7, 0.2],
      panel % 2 === 0 ? woodDark : woodMid,
      [0, yaw, 0],
    );
  }
}

function addCart(
  builder: ZoneBuilder,
  prefix: string,
  x: number,
  floorY: number,
  z: number,
  yaw = 0,
  length = 3.7,
): void {
  builder.add(
    `${prefix}:bed`,
    "wood",
    "plank",
    [x, floorY + 0.92, z],
    [2.05, 0.28, length],
    woodMid,
    [0, yaw, 0],
  );
  for (const side of [-1, 1] as const) {
    const [dx, dz] = rotateXZ(side * 1.03, 0, yaw);
    builder.add(
      `${prefix}:side:${side}`,
      "wood",
      "plank",
      [x + dx, floorY + 1.45, z + dz],
      [0.2, 1.05, length],
      side < 0 ? woodDark : woodLight,
      [0, yaw, 0],
    );
  }
  for (const [axleIndex, localZ] of [-length * 0.32, length * 0.32].entries()) {
    builder.add(
      `${prefix}:axle:${axleIndex}`,
      "steel",
      "steelSheet",
      [x, floorY + 0.55, z + localZ],
      [2.85, 0.16, 0.16],
      ironDark,
      [0, yaw, 0],
    );
    for (const side of [-1, 1] as const) {
      const [dx, dz] = rotateXZ(side * 1.33, localZ, yaw);
      builder.add(
        `${prefix}:wheel:${axleIndex}:${side}:hub`,
        "wood",
        "plank",
        [x + dx, floorY + 0.55, z + dz],
        [0.22, 0.95, 0.95],
        woodDark,
        [0, yaw, 0],
      );
      builder.add(
        `${prefix}:wheel:${axleIndex}:${side}:rim`,
        "steel",
        "steelSheet",
        [x + dx, floorY + 0.55, z + dz],
        [0.25, 1.08, 0.16],
        ironMid,
        [0, yaw, Math.PI / 4],
      );
    }
  }
  const [shaftX, shaftZ] = rotateXZ(0, length * 0.9, yaw);
  builder.add(
    `${prefix}:shaft`,
    "wood",
    "plank",
    [x + shaftX, floorY + 0.12, z + shaftZ],
    [0.24, 0.2, length * 0.95],
    woodDark,
    [0, yaw, 0.08],
  );
}

function createTowerInterior(lamps: LampDefinition[]): BreakableClusterDefinition {
  const builder = zone("minas:tower-life");

  for (let floor = 0; floor < TOWER_FLOORS; floor += 1) {
    const baseY = floor * TOWER_FLOOR_HEIGHT;
    const floorY = baseY + 0.38;
    const width = 18 - floor * 0.72;
    const depth = 13.8 - floor * 0.38;
    const innerWidth = width - 1.55;
    const innerDepth = depth - 1.55;

    const nextWidth = floor < TOWER_FLOORS - 1 ? 18 - (floor + 1) * 0.72 : width;
    for (let beam = 0; beam < 4; beam += 1) {
      builder.add(
        `ceiling:${floor}:${beam}`,
        "wood",
        "plank",
        [
          -nextWidth / 2 + (beam + 0.5) * (nextWidth / 4),
          baseY + 4.03,
          TOWER_CENTER_Z,
        ],
        [0.28, 0.25, innerDepth],
        beam % 2 === 0 ? woodDark : woodMid,
      );
    }

    if (floor < TOWER_FLOORS - 1) {
      const stairCount = 10;
      const direction = floor % 2 === 0 ? 1 : -1;
      for (let step = 0; step < stairCount; step += 1) {
        const localX = direction * (-innerWidth * 0.34 + step * 0.48);
        builder.add(
          `stairs:${floor}:${step}`,
          "stone",
          "stoneBlock",
          [localX, floorY + 0.19 + step * 0.38, TOWER_CENTER_Z + innerDepth * 0.27],
          [0.66, 0.38, 2.15],
          step % 3 === 0 ? stoneMid : stoneDark,
        );
      }
      const landingX = direction * Math.min(innerWidth * 0.34, 2.4);
      builder.add(
        `stairs:${floor}:landing`,
        "stone",
        "stoneBlock",
        [landingX, floorY + 3.86, TOWER_CENTER_Z + innerDepth * 0.27],
        [2.2, 0.28, 2.35],
        stoneMid,
      );
    }

    const partitionX = floor % 2 === 0 ? -innerWidth * 0.08 : innerWidth * 0.12;
    for (let panel = 0; panel < 4; panel += 1) {
      const z = TOWER_CENTER_Z - innerDepth * 0.35 + panel * (innerDepth * 0.23);
      const doorway = panel === 2;
      if (!doorway) {
        builder.add(
          `partition:${floor}:${panel}`,
          floor < 3 ? "wood" : "graphiteStone",
          floor < 3 ? "plank" : "stoneBlock",
          [partitionX, floorY + 1.42, z],
          [floor < 3 ? 0.22 : 0.34, 2.84, innerDepth * 0.22],
          floor < 3 ? woodDark : stoneDark,
        );
      }
    }

    const roomZ = TOWER_CENTER_Z - innerDepth * 0.22;
    if (floor === 0) {
      addBench(builder, `guard-bench:${floor}:0`, -4.3, floorY, roomZ, 0);
      addBench(builder, `guard-bench:${floor}:1`, 4.25, floorY, roomZ, 0);
      addWeaponRack(builder, `guard-rack:${floor}:0`, -4.2, floorY, TOWER_CENTER_Z + 3.9, 0);
      addWeaponRack(builder, `guard-rack:${floor}:1`, 3.8, floorY, TOWER_CENTER_Z + 3.9, 0);
      addTable(builder, `guard-table:${floor}`, 0, floorY, roomZ, 0.12, 2.8, 1.2);
    } else if (floor === 1) {
      for (let index = 0; index < 7; index += 1) {
        addCrate(
          builder,
          `store-crate:${index}`,
          -4.6 + (index % 4) * 2.6,
          floorY,
          TOWER_CENTER_Z - 3.3 + Math.floor(index / 4) * 2.1,
          index % 3 === 0 ? 1.3 : 1.05,
          (index % 2) * 0.12,
        );
      }
      for (let index = 0; index < 4; index += 1) {
        addBarrel(builder, `store-barrel:${index}`, -4 + index * 2.5, floorY, TOWER_CENTER_Z + 3.6);
      }
    } else if (floor === 2) {
      for (let index = 0; index < 6; index += 1) {
        addBed(
          builder,
          `barracks-bed:${index}`,
          -4.8 + (index % 3) * 4.7,
          floorY,
          TOWER_CENTER_Z - 2.7 + Math.floor(index / 3) * 5.1,
          index < 3 ? 0 : Math.PI,
        );
      }
      addTable(builder, "barracks-table", 0, floorY, TOWER_CENTER_Z, 0.05, 2.6, 1.1);
    } else if (floor === 3) {
      addTable(builder, "workshop-table:0", -3.8, floorY, TOWER_CENTER_Z - 2.5, 0.08, 3.1, 1.2);
      addTable(builder, "workshop-table:1", 3.6, floorY, TOWER_CENTER_Z - 2.3, -0.1, 2.8, 1.2);
      addShelf(builder, "workshop-shelf:0", -4.2, floorY, TOWER_CENTER_Z + 3.7, 0);
      addShelf(builder, "workshop-shelf:1", 3.8, floorY, TOWER_CENTER_Z + 3.7, 0);
      builder.add("workshop-anvil:base", "stone", "stoneBlock", [0, floorY + 0.48, TOWER_CENTER_Z + 1], [0.85, 0.96, 0.85], stoneDark);
      builder.add("workshop-anvil:head", "steel", "steelSheet", [0, floorY + 1.02, TOWER_CENTER_Z + 1], [1.55, 0.3, 0.62], ironMid);
    } else if (floor === 4) {
      for (let index = 0; index < 5; index += 1) {
        addShelf(builder, `archive-shelf:${index}`, -4.8 + index * 2.4, floorY, TOWER_CENTER_Z + 3.25, 0, 2.05);
      }
      addTable(builder, "archive-table", 0, floorY, TOWER_CENTER_Z - 1.5, 0, 3.5, 1.35);
      addBench(builder, "archive-bench:0", -2.1, floorY, TOWER_CENTER_Z - 3.1, 0, 1.8);
      addBench(builder, "archive-bench:1", 2.1, floorY, TOWER_CENTER_Z - 3.1, 0, 1.8);
    } else if (floor === 5) {
      addTable(builder, "council-table", 0, floorY, TOWER_CENTER_Z, 0, 4.4, 1.65);
      for (let index = 0; index < 6; index += 1) {
        addBench(
          builder,
          `council-seat:${index}`,
          -4.7 + (index % 3) * 4.7,
          floorY,
          TOWER_CENTER_Z - 2.2 + Math.floor(index / 3) * 4.4,
          0,
          1.45,
        );
      }
      addShelf(builder, "council-cabinet:0", -4.2, floorY, TOWER_CENTER_Z + 3.1, 0, 2.2);
      addShelf(builder, "council-cabinet:1", 4.2, floorY, TOWER_CENTER_Z + 3.1, 0, 2.2);
    } else if (floor === 6) {
      for (let pedestal = 0; pedestal < 5; pedestal += 1) {
        const angle = (pedestal / 5) * Math.PI * 2;
        builder.add(
          `ritual-pedestal:${pedestal}`,
          "basalt",
          "stoneBlock",
          [Math.cos(angle) * 3.4, floorY + 0.7, TOWER_CENTER_Z + Math.sin(angle) * 2.5],
          [0.9, 1.4, 0.9],
          pedestal % 2 === 0 ? "#23272a" : "#35393b",
        );
      }
      builder.add("ritual-table:base", "basalt", "stoneBlock", [0, floorY + 0.48, TOWER_CENTER_Z], [2.5, 0.96, 2.5], "#23272a");
      builder.add("ritual-table:glass", "darkGlass", "glassPane", [0, floorY + 1.06, TOWER_CENTER_Z], [1.7, 0.2, 1.7], "#27454d");
    } else {
      for (let brace = 0; brace < 6; brace += 1) {
        builder.add(
          `eye-machinery:brace:${brace}`,
          "steel",
          "steelSheet",
          [-4.5 + brace * 1.8, floorY + 1.2 + (brace % 2) * 0.45, TOWER_CENTER_Z],
          [0.18, 2.4, 4.8],
          brace % 2 === 0 ? ironDark : ironMid,
          [0, 0, (brace - 2.5) * 0.035],
        );
      }
      addTable(builder, "eye-console:0", -3.2, floorY, TOWER_CENTER_Z - 3, 0, 2.6, 1.1);
      addTable(builder, "eye-console:1", 3.2, floorY, TOWER_CENTER_Z - 3, 0, 2.6, 1.1);
    }

    if (floor % 2 === 0) {
      addTorch(
        builder,
        lamps,
        `torch:${floor}:west`,
        [-width / 2 + 0.48, floorY + 2.15, TOWER_CENTER_Z - 1.6],
        "x",
      );
      addTorch(
        builder,
        lamps,
        `torch:${floor}:east`,
        [width / 2 - 0.48, floorY + 2.15, TOWER_CENTER_Z + 1.6],
        "x",
      );
    }
  }

  return finishZone(builder, "Rooms and stairways of the dark tower", "wood", "linked");
}

function createWallLife(lamps: LampDefinition[]): BreakableClusterDefinition {
  const builder = zone("minas:wall-life");
  const floorY = 0.04;

  for (const side of [-1, 1] as const) {
    for (let step = 0; step < 14; step += 1) {
      const height = 0.57;
      builder.add(
        `access-stair:${side}:${step}`,
        "stone",
        "stoneBlock",
        [side * (10.1 + step * 0.72), floorY + (step + 0.5) * height, -3.1],
        [1.02, height, 2.25],
        step % 3 === 0 ? stoneLight : stoneMid,
      );
    }
    builder.add(
      `access-landing:${side}`,
      "stone",
      "stoneBlock",
      [side * 20.2, 8.08, -2.05],
      [2.5, 0.32, 4.2],
      stoneMid,
    );
    for (let post = 0; post < 5; post += 1) {
      builder.add(
        `gallery-post:${side}:${post}`,
        "wood",
        "plank",
        [side * (11.3 + post * 2.35), 2.35, -3.8],
        [0.3, 4.62, 0.3],
        post % 2 === 0 ? woodDark : woodMid,
      );
      builder.add(
        `gallery-deck:${side}:${post}`,
        "wood",
        "plank",
        [side * (11.3 + post * 2.35), 4.78, -3.8],
        [2.42, 0.2, 2.1],
        post % 2 === 0 ? woodMid : woodLight,
      );
    }
    addWeaponRack(builder, `wall-rack:${side}`, side * 13.2, 4.88, -3.9, 0,);
    addBench(builder, `wall-bench:${side}`, side * 17.1, 4.88, -3.8, 0, 2.6);
    addTorch(
      builder,
      lamps,
      `wall-torch:${side}`,
      [side * 8.9, 4.25, -2.0],
      "z",
      3.8,
    );
  }

  for (const towerX of [-6.8, 6.8]) {
    const roomFloor = 0.38;
    addTable(builder, `gate-room-table:${towerX}`, towerX, roomFloor, -0.45, 0, 2.25, 0.95);
    addBench(builder, `gate-room-bench:${towerX}:0`, towerX, roomFloor, -1.72, 0, 2.2);
    addWeaponRack(builder, `gate-room-rack:${towerX}`, towerX, roomFloor, 1.1, 0, 2.15);
    addCrate(builder, `gate-room-crate:${towerX}`, towerX - 1.45, roomFloor, 0.7, 0.82);
    addBarrel(builder, `gate-room-barrel:${towerX}`, towerX + 1.45, roomFloor, 0.72, 0.8);
    for (let floor = 0; floor < 3; floor += 1) {
      const stairFloor = floor === 0 ? 0.36 : floor * 3.82 + 0.14;
      const direction = floor % 2 === 0 ? 1 : -1;
      const startZ = direction > 0 ? -1.55 : 1.33;
      for (let step = 0; step < 9; step += 1) {
        builder.add(
          `gate-stair:${towerX}:${floor}:${step}`,
          "stone",
          "stoneBlock",
          [towerX, stairFloor + 0.2 + step * 0.4, startZ + direction * step * 0.36],
          [1.62, 0.4, 0.58],
          step % 3 === 0 ? stoneLight : stoneMid,
        );
      }
      const upperFloor = (floor + 1) * 3.82 + 0.14;
      addBench(
        builder,
        `gate-upper-bench:${towerX}:${floor}`,
        towerX + (towerX < 0 ? -1.38 : 1.38),
        upperFloor,
        -0.3,
        Math.PI / 2,
        2.2,
      );
      addCrate(
        builder,
        `gate-upper-crate:${towerX}:${floor}`,
        towerX + (towerX < 0 ? 1.45 : -1.45),
        upperFloor,
        -1.15,
        0.72,
      );
    }
  }

  return finishZone(builder, "Occupied wall walks and guard rooms", "wood", "linked");
}

function createCourtyard(lamps: LampDefinition[]): BreakableClusterDefinition[] {
  const surfaces = zone("minas:courtyard-surfaces");
  const smithy = zone("minas:courtyard-smithy");
  const storehouse = zone("minas:courtyard-storehouse");
  const commons = zone("minas:courtyard-commons");
  const floorY = 0.04;

  for (let segment = 0; segment < 9; segment += 1) {
    surfaces.add(
      `spine:${segment}`,
      segment % 3 === 0 ? "basalt" : "stone",
      "stoneBlock",
      [0, 0.15, -5.2 - segment * 2.75],
      [5.4 + (segment % 2) * 0.32, 0.22, 2.82],
      segment % 3 === 0 ? "#454946" : segment % 2 === 0 ? "#777970" : "#666963",
      [0, (segment % 3 - 1) * 0.012, 0],
    );
  }
  for (const side of [-1, 1] as const) {
    for (let segment = 0; segment < 5; segment += 1) {
      surfaces.add(
        `branch:${side}:${segment}`,
        "soil",
        "groundTile",
        [side * (4.2 + segment * 2.8), 0.11, -14.5 + segment * 0.42],
        [3.0, 0.12, 3.45],
        segment % 2 === 0 ? "#594632" : "#4d3d2d",
        [0, side * (0.08 + segment * 0.012), 0],
      );
    }
  }

  addShed(smithy, "forge-shed", -17.2, floorY, -15.3, 9.2, 7.1, 0.03, "steel");
  addTable(smithy, "workbench:0", -19.3, floorY, -14, 0.02, 3.2, 1.2);
  addTable(smithy, "workbench:1", -14.8, floorY, -17.5, -0.06, 2.8, 1.15);
  addShelf(smithy, "tool-shelf", -19.8, floorY, -17.9, 0, 2.8);
  for (let block = 0; block < 6; block += 1) {
    smithy.add(
      `forge:block:${block}`,
      block < 2 ? "basalt" : "stone",
      "stoneBlock",
      [-16.8 + (block % 3) * 0.85, floorY + 0.38 + Math.floor(block / 3) * 0.7, -17.4],
      [0.82, 0.72, 1.28],
      block % 2 === 0 ? stoneDark : stoneMid,
    );
  }
  smithy.add("forge:coals", "glass", "glassPane", [-15.95, floorY + 1.23, -17.35], [1.55, 0.18, 0.86], litWindowColor);
  lamps.push({id: `${smithy.id}:forge:coals`, position: [-15.95, 1.6, -17.1], color: "#ff8b3d", distance: 10, intensity: 4.8});
  smithy.add("anvil:base", "stone", "stoneBlock", [-14.4, floorY + 0.52, -13.5], [0.9, 1.04, 0.9], stoneDark);
  smithy.add("anvil:head", "steel", "steelSheet", [-14.4, floorY + 1.12, -13.5], [1.65, 0.3, 0.7], ironMid);
  for (let index = 0; index < 4; index += 1) {
    addBarrel(smithy, `barrel:${index}`, -20.2 + index * 1.35, floorY, -12.6, 0.82 + (index % 2) * 0.12);
  }

  addShed(storehouse, "warehouse", 17.2, floorY, -16.6, 10.4, 8.2, -0.025, "wood");
  for (let index = 0; index < 9; index += 1) {
    addCrate(
      storehouse,
      `crate:${index}`,
      13.8 + (index % 4) * 2.15,
      floorY,
      -18.6 + Math.floor(index / 4) * 2.2,
      index % 4 === 0 ? 1.35 : 1.05,
      (index % 3 - 1) * 0.08,
    );
  }
  for (let index = 0; index < 5; index += 1) {
    addBarrel(storehouse, `barrel:${index}`, 13.8 + index * 1.55, floorY, -13.6, index % 2 === 0 ? 0.95 : 0.78);
  }
  addShelf(storehouse, "shelf:0", 14.2, floorY, -20.1, 0, 2.7);
  addShelf(storehouse, "shelf:1", 18.2, floorY, -20.1, 0, 2.7);
  addTable(storehouse, "clerk-table", 20.2, floorY, -14.2, 0.05, 2.4, 1.05);

  const wellX = -8.5;
  const wellZ = -8.8;
  for (let index = 0; index < 12; index += 1) {
    const angle = (index / 12) * Math.PI * 2;
    commons.add(
      `well:ring:${index}`,
      "stone",
      "stoneBlock",
      [wellX + Math.cos(angle) * 1.25, floorY + 0.48, wellZ + Math.sin(angle) * 1.25],
      [0.78, 0.92, 0.55],
      index % 3 === 0 ? stoneLight : stoneMid,
      [0, -angle, 0],
    );
  }
  for (const side of [-1, 1] as const) {
    commons.add(`well:post:${side}`, "wood", "plank", [wellX + side * 1.65, floorY + 1.65, wellZ], [0.28, 3.3, 0.28], woodDark);
  }
  commons.add("well:beam", "wood", "plank", [wellX, floorY + 3.25, wellZ], [3.7, 0.3, 0.3], woodMid);
  commons.add("well:spindle", "steel", "steelSheet", [wellX, floorY + 2.1, wellZ], [3.15, 0.14, 0.14], ironDark);
  commons.add("well:bucket", "wood", "plank", [wellX, floorY + 0.36, wellZ + 1.75], [0.58, 0.72, 0.58], woodMid);

  addCart(commons, "courtyard-cart", 8.4, floorY, -9.5, -0.22, 3.4);
  addTable(commons, "mess-table:0", -8.8, floorY, -20.4, 0.04, 3.2, 1.15);
  addTable(commons, "mess-table:1", -4.9, floorY, -21.3, -0.06, 3.0, 1.15);
  addBench(commons, "mess-bench:0", -8.8, floorY, -18.9, 0, 2.7);
  addBench(commons, "mess-bench:1", -4.9, floorY, -19.8, 0, 2.6);
  commons.add("yard-torch:west:post", "wood", "plank", [-11.1, floorY + 1.1, -10.5], [0.24, 2.2, 0.24], woodDark);
  commons.add("yard-torch:east:post", "wood", "plank", [10.8, floorY + 1.1, -11.2], [0.24, 2.2, 0.24], woodDark);
  addTorch(commons, lamps, "yard-torch:west", [-11.1, 2.45, -10.5], "z", 4.1);
  addTorch(commons, lamps, "yard-torch:east", [10.8, 2.45, -11.2], "z", 4.1);

  return [
    finishZone(surfaces, "Worn paths of the inner ward", "stone", "stack"),
    finishZone(smithy, "Working courtyard smithy", "wood", "linked"),
    finishZone(storehouse, "Citadel supply storehouse", "wood", "linked"),
    finishZone(commons, "Well and communal yard", "stone", "linked"),
  ];
}

function createSiegeCamp(lamps: LampDefinition[]): BreakableClusterDefinition[] {
  const surfaces = zone("minas:siege-surfaces");
  const west = zone("minas:siege-workshop");
  const east = zone("minas:siege-supplies");
  const engines = zone("minas:siege-engines");
  const floorY = 0.04;

  for (let patch = 0; patch < 24; patch += 1) {
    const side = patch % 2 === 0 ? -1 : 1;
    const lane = Math.floor(patch / 2);
    const x = side * (6.8 + (lane % 4) * 3.4 + seededNoise(patch, side, 11) * 1.2);
    const z = 7.5 + Math.floor(lane / 4) * 6.2 + seededNoise(patch, side, 17) * 2.2;
    surfaces.add(
      `mud:${patch}`,
      patch % 5 === 0 ? "earth" : "soil",
      "groundTile",
      [x, 0.1, z],
      [3.1 + seededNoise(patch, side, 23) * 2.0, 0.11, 2.2 + seededNoise(patch, side, 29) * 2.4],
      patch % 3 === 0 ? "#493929" : "#5a4631",
      [0, (seededNoise(patch, side, 31) - 0.5) * 0.22, 0],
    );
  }

  addShed(west, "stonecutters", -18.5, floorY, 17.5, 9.8, 7.4, -0.06, "wood");
  addTable(west, "cutting-table:0", -20.2, floorY, 16.2, -0.08, 3.4, 1.35);
  addTable(west, "cutting-table:1", -16.3, floorY, 18.8, 0.12, 3.0, 1.25);
  for (let index = 0; index < 18; index += 1) {
    const row = Math.floor(index / 6);
    west.add(
      `cut-stone:${index}`,
      index % 4 === 0 ? "basalt" : "stone",
      "stoneBlock",
      [-22 + (index % 6) * 1.25, floorY + 0.32 + row * 0.62, 13.1 + row * 0.34],
      [1.15, 0.58, 1.05],
      index % 4 === 0 ? stoneDark : index % 2 === 0 ? stoneMid : stoneLight,
      [0, (index % 3 - 1) * 0.04, 0],
    );
  }
  addCart(west, "stone-cart", -13.5, floorY, 14.2, 0.2, 3.1);

  addShed(east, "supply-shelter", 18.2, floorY, 18.5, 10.2, 7.6, 0.045, "steel");
  for (let index = 0; index < 10; index += 1) {
    addCrate(
      east,
      `crate:${index}`,
      14.7 + (index % 4) * 2.2,
      floorY,
      16.2 + Math.floor(index / 4) * 2.15,
      index % 4 === 0 ? 1.3 : 1,
      (index % 3 - 1) * 0.1,
    );
  }
  for (let index = 0; index < 6; index += 1) {
    addBarrel(east, `barrel:${index}`, 14.7 + index * 1.45, floorY, 21.4, index % 3 === 0 ? 1.05 : 0.82);
  }
  addCart(east, "supply-cart", 23.4, floorY, 12.4, -0.18, 3.7);

  const ramX = -14.5;
  const ramZ = 31.5;
  for (const side of [-1, 1] as const) {
    for (const end of [-1, 1] as const) {
      engines.add(
        `ram:post:${side}:${end}`,
        "wood",
        "plank",
        [ramX + side * 1.65, floorY + 1.65, ramZ + end * 2.4],
        [0.4, 3.3, 0.4],
        woodDark,
      );
    }
    engines.add(`ram:beam-side:${side}`, "wood", "plank", [ramX + side * 1.65, floorY + 3.18, ramZ], [0.38, 0.36, 5.3], woodMid);
  }
  engines.add("ram:log", "wood", "plank", [ramX, floorY + 1.75, ramZ + 0.4], [1.05, 1.05, 7.8], woodDark);
  engines.add("ram:tip", "steel", "steelSheet", [ramX, floorY + 1.75, ramZ - 3.65], [1.28, 0.68, 0.42], ironMid);
  for (const [index, localZ] of [-1.7, 1.7].entries()) {
    engines.add(`ram:cradle:${index}`, "steel", "steelSheet", [ramX, floorY + 1.13, ramZ + localZ], [3.45, 0.18, 0.54], ironDark);
  }
  for (const [index, localZ] of [-2.05, 0, 2.05].entries()) {
    engines.add(`ram:roof-crossbeam:${index}`, "wood", "plank", [ramX, floorY + 3.45, ramZ + localZ], [3.75, 0.22, 0.32], woodDark);
  }
  for (let board = 0; board < 7; board += 1) {
    engines.add(`ram:roof:${board}`, "wood", "plank", [ramX - 2.1 + board * 0.7, floorY + 3.58, ramZ], [0.74, 0.2, 6.2], board % 2 === 0 ? woodMid : woodLight, [0, 0, (board - 3) * 0.012]);
  }
  addCart(engines, "siege-cart", 15.8, floorY, 32.2, 0.18, 4.4);
  for (const side of [-1, 1] as const) {
    for (let index = 0; index < 5; index += 1) {
      const x = side * (5.8 + index * 1.75);
      const z = 37 - index * 1.4;
      engines.add(`barricade:${side}:${index}:post`, "wood", "plank", [x, floorY + 1.0, z], [0.24, 2.0, 0.24], woodDark, [side * 0.05, 0, side * 0.08]);
      engines.add(`barricade:${side}:${index}:rail`, "wood", "plank", [x, floorY + 1.18, z], [2.0, 0.24, 0.72], woodMid, [0, side * 0.18, side * 0.22]);
    }
  }

  addTorch(west, lamps, "campfire:west", [-13.2, 0.68, 22.8], "z", 4.5);
  addTorch(east, lamps, "campfire:east", [12.7, 0.68, 25.4], "z", 4.5);

  return [
    finishZone(surfaces, "Mud, ruts and working clearings", "soil", "stack"),
    finishZone(west, "Stonecutters' siege workshop", "wood", "linked"),
    finishZone(east, "Outer supply shelter", "wood", "linked"),
    finishZone(engines, "Abandoned siege engines", "wood", "linked"),
  ];
}

function createSignsOfOccupation(): BreakableClusterDefinition {
  const builder = zone("minas:occupation-traces");
  const floorY = 0.04;

  // Muted, patched tower banners: each strip remains an independent fragile
  // piece, held against the masonry by the same structural contact solver.
  for (const side of [-1, 1] as const) {
    const bannerX = side * 4.1;
    builder.add(
      `tower-banner:${side}:rail`,
      "steel",
      "steelSheet",
      [bannerX, 17.25, -29.44],
      [3.05, 0.17, 0.16],
      ironDark,
    );
    for (let strip = 0; strip < 4; strip += 1) {
      const stripHeight = 2.45 + ((strip + (side < 0 ? 1 : 0)) % 3) * 0.42;
      builder.add(
        `tower-banner:${side}:strip:${strip}`,
        "plaster",
        "panel",
        [bannerX - 1.12 + strip * 0.75, 17.1 - stripHeight / 2, -29.43],
        [0.68, stripHeight, 0.09],
        strip % 3 === 0 ? "#6c302a" : strip % 3 === 1 ? "#7f3a2e" : "#53302a",
        [0, 0, (strip - 1.5) * 0.018],
      );
    }
  }

  // Firewood is concentrated where it is used, rather than sprinkled as
  // generic debris through the ward.
  for (const [pileIndex, [originX, originZ]] of [
    [-11.9, -16.8],
    [11.8, -19.8],
  ].entries()) {
    for (let layer = 0; layer < 3; layer += 1) {
      for (let log = 0; log < 5 - layer; log += 1) {
        builder.add(
          `firewood:${pileIndex}:${layer}:${log}`,
          "wood",
          "plank",
          [originX + (log - (4 - layer) / 2) * 0.42, floorY + 0.15 + layer * 0.29, originZ],
          [0.33, 0.28, 1.7 - layer * 0.12],
          (log + layer) % 2 === 0 ? woodDark : woodMid,
          [0, (log % 2 === 0 ? 1 : -1) * 0.035, 0],
        );
      }
    }
  }

  // Standards make the outer work camp legible from the gate and introduce
  // a small amount of restrained colour into an otherwise graphite palette.
  for (const side of [-1, 1] as const) {
    const poleX = side * 10.8;
    const poleZ = 12.2;
    builder.add(
      `camp-standard:${side}:pole`,
      "wood",
      "plank",
      [poleX, floorY + 2.7, poleZ],
      [0.24, 5.4, 0.24],
      woodDark,
      [0, 0, side * -0.025],
    );
    builder.add(
      `camp-standard:${side}:finial`,
      "steel",
      "steelSheet",
      [poleX, floorY + 5.58, poleZ],
      [0.38, 0.38, 0.38],
      ironMid,
      [0, 0, Math.PI / 4],
    );
    builder.add(
      `camp-standard:${side}:lower-rail`,
      "steel",
      "steelSheet",
      [poleX + side * 0.75, floorY + 3.9, poleZ],
      [1.58, 0.16, 0.14],
      ironDark,
    );
    for (let strip = 0; strip < 3; strip += 1) {
      builder.add(
        `camp-standard:${side}:cloth:${strip}`,
        "plaster",
        "panel",
        [poleX + side * (0.31 + strip * 0.38), floorY + 4.65 - strip * 0.12, poleZ],
        [0.43, 1.45 - strip * 0.16, 0.08],
        strip === 0 ? "#7b392d" : strip === 1 ? "#654035" : "#8a5842",
        [0, 0, side * (0.02 + strip * 0.018)],
      );
    }
  }

  addWeaponRack(builder, "smithy-tool-rack", -12.5, floorY, -13.7, Math.PI / 2);
  addBarrel(builder, "well-spare-bucket", -6.3, floorY, -8.4, 0.62);
  addCrate(builder, "tower-delivery", 4.8, floorY, -27.6, 0.92, -0.08);

  return finishZone(
    builder,
    "Banners, fuel and everyday traces of the garrison",
    "wood",
    "linked",
  );
}

function addConifer(
  builder: ZoneBuilder,
  prefix: string,
  x: number,
  floorY: number,
  z: number,
  height: number,
  lean: number,
): void {
  const trunkHeight = height * 0.62;
  for (let segment = 0; segment < 4; segment += 1) {
    const segmentHeight = trunkHeight / 4 + 0.06;
    builder.add(
      `${prefix}:trunk:${segment}`,
      "wood",
      "plank",
      [x + lean * segment * 0.1, floorY + (trunkHeight / 4) * (segment + 0.5), z],
      [0.48 - segment * 0.07, segmentHeight, 0.48 - segment * 0.07],
      segment % 2 === 0 ? "#33291f" : "#453426",
      [0, 0, lean * 0.02],
    );
  }
  for (let tier = 0; tier < 4; tier += 1) {
    const width = height * (0.42 - tier * 0.065);
    const branchY = floorY + (trunkHeight / 4) * (tier + 1) + 0.1;
    const y = branchY + 0.1 + height * 0.08;
    builder.add(
      `${prefix}:branch:${tier}:x`,
      "wood",
      "plank",
      [x + lean * tier * 0.08, branchY, z],
      [width * 1.05, 0.2, 0.32],
      woodDark,
      [0, tier * 0.36, 0],
    );
    builder.add(
      `${prefix}:branch:${tier}:z`,
      "wood",
      "plank",
      [x + lean * tier * 0.08, branchY, z],
      [0.32, 0.2, width * 1.05],
      woodMid,
      [0, tier * 0.36, 0],
    );
    for (let lobe = 0; lobe < 4; lobe += 1) {
      const angle = (lobe / 4) * Math.PI * 2 + tier * 0.36;
      builder.add(
        `${prefix}:crown:${tier}:${lobe}`,
        "foliage",
        "groundTile",
        [
          x + Math.cos(angle) * width * 0.25 + lean * tier * 0.08,
          y,
          z + Math.sin(angle) * width * 0.25,
        ],
        [width * 0.64, height * 0.16, width * 0.64],
        tier % 2 === 0 ? "#263d2b" : lobe % 2 === 0 ? "#314a31" : "#203529",
        [0, angle * 0.35, (lobe % 2 === 0 ? 1 : -1) * 0.035],
      );
    }
  }
}

function createLivingLandscape(
  surfaceYAt: (x: number, z: number) => number,
): BreakableClusterDefinition[] {
  const forest = zone("minas:living-forest");
  const undergrowth = zone("minas:undergrowth");
  const scree = zone("minas:mountain-scree");
  const treePositions: readonly [number, number][] = [
    [-20, 53], [-14, 59], [-7, 64], [6, 63], [14, 58], [21, 51],
    [-20, -70], [-14, -78], [-6, -82], [6, -82], [14, -77], [21, -68],
    [-24, 46], [25, 44], [-23, -62], [24, -61],
  ];

  treePositions.forEach(([x, z], index) => {
    const treeX = x + (seededNoise(index, z, 401) - 0.5) * 2.1;
    const treeZ = z + (seededNoise(index, x, 409) - 0.5) * 2.1;
    const floorY = surfaceYAt(treeX, treeZ);
    addConifer(
      forest,
      `tree:${index}`,
      treeX,
      floorY,
      treeZ,
      7.2 + seededNoise(index, z, 419) * 4.8,
      seededNoise(index, x, 421) - 0.5,
    );
  });

  for (let index = 0; index < 96; index += 1) {
    const region = index % 4;
    const side = index % 2 === 0 ? -1 : 1;
    const x =
      region < 2
        ? side * (23 + seededNoise(index, side, 431) * 10)
        : side * (6 + seededNoise(index, side, 433) * 19);
    const z =
      region === 0
        ? 4 + seededNoise(index, side, 439) * 39
        : region === 1
          ? -55 - seededNoise(index, side, 443) * 25
          : -27 + seededNoise(index, side, 449) * 62;
    const floorY = surfaceYAt(x, z);
    const width = 0.55 + seededNoise(index, side, 457) * 1.45;
    const height = 0.35 + seededNoise(index, side, 461) * 0.85;
    undergrowth.add(
      `shrub:${index}`,
      "grass",
      "groundTile",
      [x, floorY + height / 2, z],
      [width, height, width * (0.7 + seededNoise(index, side, 463) * 0.45)],
      index % 3 === 0 ? "#31472f" : index % 3 === 1 ? "#3d5133" : "#263c2b",
      [0, seededNoise(index, side, 467) * Math.PI, 0],
    );
  }

  for (let index = 0; index < 170; index += 1) {
    const side = index % 2 === 0 ? -1 : 1;
    const x = side * (25.5 + seededNoise(index, side, 479) * 16);
    const z = -74 + seededNoise(index, side, 487) * 118;
    const floorY = surfaceYAt(x, z);
    const width = 0.45 + seededNoise(index, side, 491) * 1.8;
    const height = 0.28 + seededNoise(index, side, 499) * 1.25;
    const depth = 0.5 + seededNoise(index, side, 503) * 1.65;
    scree.add(
      `rock:${index}`,
      index % 5 === 0 ? "graphiteStone" : index % 3 === 0 ? "stone" : "basalt",
      "stoneBlock",
      [x, floorY + height / 2 - 0.02, z],
      [width, height, depth],
      index % 5 === 0 ? "#45494b" : index % 3 === 0 ? "#62645e" : "#2d3234",
      [
        (seededNoise(index, side, 509) - 0.5) * 0.28,
        seededNoise(index, side, 521) * Math.PI,
        (seededNoise(index, side, 523) - 0.5) * 0.28,
      ],
    );
  }

  return [
    finishZone(forest, "Destructible highland conifers", "wood", "linked"),
    finishZone(undergrowth, "Scrub and wind-shaped undergrowth", "grass", "stack"),
    finishZone(scree, "Irregular mountain-foot scree", "basalt", "stack"),
  ];
}

export function createMinasTirithWorldbuilding({
  surfaceYAt,
}: MinasWorldbuildingOptions): MinasWorldbuildingResult {
  const lamps: LampDefinition[] = [];
  const clusters: BreakableClusterDefinition[] = [
    createTowerInterior(lamps),
    createWallLife(lamps),
    ...createCourtyard(lamps),
    ...createSiegeCamp(lamps),
    createSignsOfOccupation(),
    ...createLivingLandscape(surfaceYAt),
  ];

  return { clusters, lamps };
}
