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
import { createMinasTirithWorldbuilding } from "./minasTirithWorldbuilding.ts";

const clusters: BreakableClusterDefinition[] = [];
const lamps: LampDefinition[] = [];
const PLAYFIELD_CENTER_Z = -18;
const PLAYFIELD_RADIUS = 96;

function piece(
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

function addCluster(
  id: string,
  label: string,
  material: BreakableMaterial,
  supportMode: SupportMode,
  pieces: BreakablePieceDefinition[],
): void {
  clusters.push({ id, label, material, supportMode, pieces });
}

function seededNoise(x: number, z: number, salt = 0): number {
  const value = Math.sin(x * 91.17 + z * 47.33 + salt * 19.71) * 43758.5453;
  return value - Math.floor(value);
}

function createHighlandGround(): void {
  const grass: BreakablePieceDefinition[] = [];
  const earth: BreakablePieceDefinition[] = [];
  const tile = 6;
  let index = 0;

  for (let x = -66; x < 66; x += tile) {
    for (let z = -78; z < 42; z += tile) {
      const centerX = x + tile / 2;
      const centerZ = z + tile / 2;
      const tone = seededNoise(x, z);
      grass.push(
        piece(
          `minas:ground:grass:${index}`,
          "minas:ground:grass",
          "grass",
          "groundTile",
          [centerX, -0.09, centerZ],
          [6.04, 0.26, 6.04],
          tone > 0.66 ? "#536a3e" : tone > 0.32 ? "#50663c" : "#4c6239",
        ),
      );
      earth.push(
        piece(
          `minas:ground:earth:${index}`,
          "minas:ground:earth",
          "earth",
          "groundTile",
          [centerX, -1.08, centerZ],
          [6.04, 1.72, 6.04],
          tone > 0.5 ? "#554431" : "#51402f",
        ),
      );
      index += 1;
    }
  }

  addCluster(
    "minas:ground:grass",
    "Highland grass",
    "grass",
    "linked",
    grass,
  );
  addCluster(
    "minas:ground:earth",
    "Highland earth",
    "earth",
    "linked",
    earth,
  );
}

function createCircularHighlandExtension(): void {
  const grass: BreakablePieceDefinition[] = [];
  const earth: BreakablePieceDefinition[] = [];
  const cliff: BreakablePieceDefinition[] = [];
  const outcrops: BreakablePieceDefinition[] = [];
  const tile = 6;
  const visibleRadius = PLAYFIELD_RADIUS - tile / 2;
  let index = 0;

  for (let x = -PLAYFIELD_RADIUS; x < PLAYFIELD_RADIUS; x += tile) {
    for (
      let z = PLAYFIELD_CENTER_Z - PLAYFIELD_RADIUS;
      z < PLAYFIELD_CENTER_Z + PLAYFIELD_RADIUS;
      z += tile
    ) {
      const centerX = x + tile / 2;
      const centerZ = z + tile / 2;
      const distance = Math.hypot(centerX, centerZ - PLAYFIELD_CENTER_Z);
      const insideOriginalGround =
        centerX >= -66 &&
        centerX <= 66 &&
        centerZ >= -78 &&
        centerZ <= 42;

      if (distance > visibleRadius || insideOriginalGround) {
        continue;
      }

      const tone = seededNoise(x, z, 31);
      const rim = Math.max(0, Math.min(1, (distance - 80) / 13));
      const easedRim = rim * rim * (3 - 2 * rim);
      const surfaceY = 0.04 - easedRim * (1.05 + tone * 0.42);
      const grassCenterY = surfaceY - 0.13;
      const grassColor =
        tone > 0.72 ? "#566b40" : tone > 0.38 ? "#50653c" : "#4a6038";

      grass.push(
        piece(
          `minas:circle:grass:${index}`,
          "minas:circle:grass",
          "grass",
          "groundTile",
          [centerX, grassCenterY, centerZ],
          [6.04, 0.26, 6.04],
          grassColor,
        ),
      );

      if (distance < 86) {
        const earthHeight = 1.72;
        earth.push(
          piece(
            `minas:circle:earth:${index}`,
            "minas:circle:earth",
            "earth",
            "groundTile",
            [centerX, surfaceY - 0.26 - earthHeight / 2, centerZ],
            [6.04, earthHeight, 6.04],
            tone > 0.5 ? "#554432" : "#50402f",
          ),
        );
      } else {
        const rockHeight = 2.15 + easedRim * 1.1;
        const earthHeight = 1.2;
        const rockBottom = surfaceY - 0.26 - rockHeight;
        const material = tone > 0.62 ? "graphiteStone" : "basalt";
        cliff.push(
          piece(
            `minas:circle:cliff:${index}`,
            "minas:circle:cliff",
            material,
            "stoneBlock",
            [centerX, surfaceY - 0.26 - rockHeight / 2, centerZ],
            [6.08, rockHeight, 6.08],
            material === "basalt"
              ? tone > 0.42
                ? "#303538"
                : "#252a2d"
              : tone > 0.42
                ? "#46494b"
                : "#393d40",
            [0, (tone - 0.5) * 0.04, 0],
          ),
        );
        earth.push(
          piece(
            `minas:circle:earth:${index}`,
            "minas:circle:earth",
            "earth",
            "groundTile",
            [centerX, rockBottom - earthHeight / 2, centerZ],
            [6.04, earthHeight, 6.04],
            tone > 0.5 ? "#4b3c2e" : "#403428",
          ),
        );
      }

      const outcropNoise = seededNoise(x, z, 73);
      if (distance > 68 && outcropNoise > 0.88) {
        const height = 0.75 + outcropNoise * 1.35;
        const width = 1.45 + seededNoise(x, z, 79) * 1.4;
        const material = outcropNoise > 0.95 ? "graphiteStone" : "basalt";
        outcrops.push(
          piece(
            `minas:circle:outcrop:${index}`,
            "minas:circle:outcrops",
            material,
            "stoneBlock",
            [
              centerX + (seededNoise(x, z, 83) - 0.5) * 2.4,
              surfaceY + height / 2 - 0.04,
              centerZ + (seededNoise(x, z, 89) - 0.5) * 2.4,
            ],
            [width, height, width * (0.72 + tone * 0.25)],
            material === "basalt" ? "#33383a" : "#494c4e",
            [0, seededNoise(x, z, 97) * Math.PI, 0],
          ),
        );
      }

      index += 1;
    }
  }

  addCluster(
    "minas:circle:grass",
    "Circular highland turf",
    "grass",
    "linked",
    grass,
  );
  addCluster(
    "minas:circle:earth",
    "Circular highland earth",
    "earth",
    "linked",
    earth,
  );
  addCluster(
    "minas:circle:cliff",
    "Rocky outer escarpment",
    "basalt",
    "stack",
    cliff,
  );
  addCluster(
    "minas:circle:outcrops",
    "Wind-carved outer rocks",
    "basalt",
    "stack",
    outcrops,
  );
}

function highlandSurfaceYAt(x: number, z: number): number {
  if (x >= -66 && x <= 66 && z >= -78 && z <= 42) {
    return 0.04;
  }

  const tile = 6;
  const tileX =
    Math.floor((x + PLAYFIELD_RADIUS) / tile) * tile - PLAYFIELD_RADIUS;
  const southernEdge = PLAYFIELD_CENTER_Z - PLAYFIELD_RADIUS;
  const tileZ = Math.floor((z - southernEdge) / tile) * tile + southernEdge;
  const distance = Math.hypot(x, z - PLAYFIELD_CENTER_Z);
  const tone = seededNoise(tileX, tileZ, 31);
  const rim = Math.max(0, Math.min(1, (distance - 80) / 13));
  const easedRim = rim * rim * (3 - 2 * rim);
  return 0.04 - easedRim * (1.05 + tone * 0.42);
}

function createMountainRidge(side: -1 | 1): void {
  const id = `minas:ridge:${side < 0 ? "west" : "east"}`;
  const rocks: BreakablePieceDefinition[] = [];
  const caps: BreakablePieceDefinition[] = [];
  const highlandGrowth: BreakablePieceDefinition[] = [];
  const block = 5;
  const ridgeRadius = PLAYFIELD_RADIUS - 7;
  let index = 0;

  for (let zStep = -3; zStep < 29; zStep += 1) {
    const z = 37 - zStep * block;
    const relativeZ = z - PLAYFIELD_CENTER_Z;
    const radialRoom = Math.sqrt(
      Math.max(0, ridgeRadius * ridgeRadius - relativeZ * relativeZ),
    );
    if (radialRoom < 24) {
      continue;
    }

    const rowNoise = seededNoise(zStep, side, 113);
    const endErosion = Math.pow(Math.abs(relativeZ) / ridgeRadius, 1.8) * 8;
    const innerEdge =
      Math.abs(z) < 14
        ? 27.1
        : 23.2 + rowNoise * 5.4 + endErosion * 0.22;
    const outerEdge = Math.min(
      radialRoom - 1.5,
      72 + rowNoise * 14 + Math.sin(zStep * 0.73 + side) * 3.5,
    );

    for (let xStep = -1; xStep < 14; xStep += 1) {
      const absoluteX = 27.5 + xStep * block;
      const x = side * absoluteX;
      const edgeNoise = seededNoise(xStep, zStep, side * 17);
      const originalCore =
        xStep >= 0 && xStep < 8 && zStep >= 0 && zStep < 23;
      const insideOrganicFootprint =
        absoluteX >= innerEdge &&
        absoluteX <= outerEdge + (edgeNoise - 0.5) * 5.5;

      if (!originalCore && !insideOrganicFootprint) {
        continue;
      }

      const span = Math.max(block, outerEdge - innerEdge);
      const across = Math.max(0, Math.min(1, (absoluteX - innerEdge) / span));
      const ridgeProfile = Math.sin(across * Math.PI);
      const longitudinalMass =
        0.45 + Math.max(0, 1 - Math.abs(relativeZ) / ridgeRadius) * 0.85;
      const noise = seededNoise(xStep, zStep, side);
      const height = Math.max(
        1,
        Math.round(
          0.7 +
            ridgeProfile * (3.65 + longitudinalMass * 0.75) +
            noise * 1.65,
        ),
      );
      const columnX = x + side * (edgeNoise - 0.5) * 1.45;
      const columnZ = z + (seededNoise(xStep, zStep, 107) - 0.5) * 1.75;
      let columnTop = highlandSurfaceYAt(columnX, columnZ) - 0.04;
      let topX = columnX;
      let topZ = columnZ;
      let topWidth = block;
      let topDepth = block;
      let topRotationY = 0;

      for (let level = 0; level < height; level += 1) {
        const layerNoise = seededNoise(level, zStep, xStep + side * 37);
        const taper = Math.min(level * 0.035, 0.18);
        const layerHeight = 1.84 + layerNoise * 0.66;
        const layerWidth =
          block * (1 - taper) * (1.02 + seededNoise(level, xStep, 131) * 0.18);
        const layerDepth =
          block *
          (1 - taper * 0.72) *
          (1.01 + seededNoise(level, zStep, 137) * 0.19);
        const layerX =
          columnX + side * (level * 0.075 + (layerNoise - 0.5) * 0.78);
        const layerZ =
          columnZ + (seededNoise(level, zStep, xStep + 149) - 0.5) * 1.42;
        const rotationY = (layerNoise - 0.5) * 0.28;
        const stratumNoise = seededNoise(xStep, zStep, level + side * 181);
        const material = stratumNoise > 0.72 ? "graphiteStone" : "basalt";
        rocks.push(
          piece(
            `${id}:rock:${index}:${level}`,
            id,
            material,
            "stoneBlock",
            [layerX, columnTop + layerHeight / 2, layerZ],
            [layerWidth + 0.24, layerHeight, layerDepth + 0.24],
            material === "basalt"
              ? noise > 0.55
                ? "#34383b"
                : "#292d30"
              : noise > 0.55
                ? "#484b4e"
                : "#3c3f43",
            [
              (seededNoise(level, xStep, 191) - 0.5) * 0.025,
              rotationY,
              (seededNoise(level, zStep, 197) - 0.5) * 0.025,
            ],
          ),
        );
        columnTop += layerHeight - 0.025;
        topX = layerX;
        topZ = layerZ;
        topWidth = layerWidth;
        topDepth = layerDepth;
        topRotationY = rotationY;
      }

      caps.push(
        piece(
          `${id}:cap:${index}`,
          `${id}:caps`,
          "grass",
          "groundTile",
          [topX, columnTop + 0.09, topZ],
          [topWidth * 1.02, 0.18, topDepth * 1.02],
          noise > 0.55 ? "#52683d" : "#4a6038",
          [0, topRotationY, 0],
        ),
      );

      if (index % 5 === 1 || index % 7 === 3) {
        const growthCount = index % 7 === 3 ? 2 : 1;
        for (let growth = 0; growth < growthCount; growth += 1) {
          const offsetX =
            (seededNoise(index, growth, side * 541) - 0.5) * topWidth * 0.52;
          const offsetZ =
            (seededNoise(index, growth, side * 547) - 0.5) * topDepth * 0.52;
          const growthWidth =
            0.72 + seededNoise(index, growth, side * 557) * 1.45;
          const growthHeight =
            0.26 + seededNoise(index, growth, side * 563) * 0.62;
          highlandGrowth.push(
            piece(
              `${id}:heath:${index}:${growth}`,
              `${id}:heath`,
              "foliage",
              "groundTile",
              [
                topX + offsetX,
                columnTop + 0.17 + growthHeight / 2,
                topZ + offsetZ,
              ],
              [growthWidth, growthHeight, growthWidth * 0.74],
              (index + growth) % 3 === 0
                ? "#263c2b"
                : (index + growth) % 3 === 1
                  ? "#3d5032"
                  : "#46583a",
              [
                0,
                seededNoise(index, growth, side * 569) * Math.PI,
                (seededNoise(index, growth, side * 571) - 0.5) * 0.08,
              ],
            ),
          );
        }
      }

      if (index % 9 === 4) {
        const looseWidth = 0.5 + seededNoise(index, side, 577) * 1.1;
        const looseHeight = 0.32 + seededNoise(index, side, 587) * 0.7;
        highlandGrowth.push(
          piece(
            `${id}:summit-rock:${index}`,
            `${id}:heath`,
            index % 18 === 4 ? "stone" : "basalt",
            "stoneBlock",
            [
              topX + (seededNoise(index, side, 593) - 0.5) * topWidth * 0.42,
              columnTop + 0.16 + looseHeight / 2,
              topZ + (seededNoise(index, side, 599) - 0.5) * topDepth * 0.42,
            ],
            [looseWidth, looseHeight, looseWidth * 0.78],
            index % 18 === 4 ? "#676963" : "#303538",
            [
              (seededNoise(index, side, 601) - 0.5) * 0.2,
              seededNoise(index, side, 607) * Math.PI,
              (seededNoise(index, side, 613) - 0.5) * 0.2,
            ],
          ),
        );
      }
      index += 1;
    }
  }

  addCluster(id, "Basalt mountain ridge", "basalt", "stack", rocks);
  addCluster(`${id}:caps`, "Mountain turf", "grass", "mounted", caps);
  addCluster(
    `${id}:heath`,
    "Wind-shaped summit heath and loose rock",
    "foliage",
    "stack",
    highlandGrowth,
  );
}

function createCitadelWall(): void {
  const wallId = "minas:wall";
  const wall: BreakablePieceDefinition[] = [];
  const wallPalette = ["#3f4244", "#484b4c", "#34383a", "#505354"];
  const blockWidth = 1.48;
  const rowHeight = 0.8;
  const columns = 38;
  const rows = 10;

  for (let row = 0; row < rows; row += 1) {
    const offset = row % 2 === 0 ? 0 : blockWidth / 2;
    const opening =
      row < 6
        ? 4.5
        : row === 6
          ? 3.65
          : row === 7
            ? 2.55
            : 1.35;

    for (let column = 0; column < columns; column += 1) {
      const x = -27.4 + column * blockWidth + offset;
      if (x > 27.4 || Math.abs(x) < opening) {
        continue;
      }
      wall.push(
        piece(
          `${wallId}:course:${row}:${column}`,
          wallId,
          row < 2 ? "basalt" : "graphiteStone",
          "stoneBlock",
          [x, 0.47 + row * rowHeight, -0.5],
          [blockWidth - 0.025, rowHeight - 0.025, 2.45],
          wallPalette[(row * 3 + column) % wallPalette.length],
        ),
      );
    }
  }

  for (let column = 0; column < 19; column += 1) {
    const x = -26.6 + column * 2.96;
    wall.push(
      piece(
        `${wallId}:merlon:${column}`,
        wallId,
        "graphiteStone",
        "stoneBlock",
        [x, 8.78, -0.5],
        [1.42, 1.25, 2.5],
        column % 3 === 0 ? "#313437" : "#44474a",
      ),
    );
  }

  for (const [buttressIndex, x] of [-17.2, -10.2, 10.2, 17.2].entries()) {
    for (let level = 0; level < 6; level += 1) {
      wall.push(
        piece(
          `${wallId}:buttress:${buttressIndex}:${level}`,
          wallId,
          "basalt",
          "stoneBlock",
          [x, 0.72 + level * 1.35, 1.05 + level * 0.1],
          [1.35 - level * 0.07, 1.34, 1.25 - level * 0.06],
          level % 2 === 0 ? "#292d30" : "#35393c",
        ),
      );
    }
  }

  addCluster(wallId, "The dark city wall", "graphiteStone", "stack", wall);
}

function createGatehouse(): void {
  const id = "minas:gatehouse";
  const masonry: BreakablePieceDefinition[] = [];
  const towerCenters = [-6.8, 6.8] as const;

  for (const [towerIndex, towerX] of towerCenters.entries()) {
    const depth = 4.5;
    for (let row = 0; row < 15; row += 1) {
      const y = 0.5 + row * 0.78;
      const inset = Math.floor(row / 5) * 0.08;
      const width = 5.15 - inset;
      for (let segment = 0; segment < 3; segment += 1) {
        const segmentWidth = width / 3;
        const x = towerX + (segment - 1) * segmentWidth;
        for (const face of [-1, 1] as const) {
          const rearDoor = face === -1 && segment === 1 && row < 4;
          if (rearDoor) {
            continue;
          }
          const arrowSlit = segment === 1 && row >= 6 && row <= 8;
          masonry.push(
            piece(
              `${id}:tower:${towerIndex}:face:${face}:${row}:${segment}`,
              id,
              arrowSlit ? "darkGlass" : row < 3 ? "basalt" : "graphiteStone",
              arrowSlit ? "glassPane" : "stoneBlock",
              [x, y, -0.42 + face * (depth / 2 - 0.36)],
              [segmentWidth - 0.025, 0.75, arrowSlit ? 0.2 : 0.72],
              arrowSlit
                ? "#243940"
                : (row + segment + face) % 3 === 0
                  ? "#323638"
                  : "#414548",
            ),
          );
        }
      }

      for (let segment = 0; segment < 3; segment += 1) {
        const segmentDepth = depth / 3;
        const z = -0.42 - depth / 2 + (segment + 0.5) * segmentDepth;
        for (const face of [-1, 1] as const) {
          masonry.push(
            piece(
              `${id}:tower:${towerIndex}:side:${face}:${row}:${segment}`,
              id,
              row < 3 ? "basalt" : "graphiteStone",
              "stoneBlock",
              [towerX + face * (width / 2 - 0.36), y, z],
              [0.72, 0.75, segmentDepth - 0.025],
              (row + segment + face) % 3 === 0 ? "#303437" : "#43474a",
            ),
          );
        }
      }
    }

    masonry.push(
      piece(
        `${id}:tower:${towerIndex}:floor:0`,
        id,
        "basalt",
        "stoneBlock",
        [towerX, 0.18, -0.42],
        [4.35, 0.36, 3.72],
        "#272b2e",
      ),
    );
    for (let floor = 1; floor < 4; floor += 1) {
      const floorY = floor * 3.82;
      for (const side of [-1, 1] as const) {
        masonry.push(
          piece(
            `${id}:tower:${towerIndex}:floor:${floor}:side:${side}`,
            id,
            "basalt",
            "stoneBlock",
            [towerX + side * 1.42, floorY, -0.42],
            [1.5, 0.28, 3.72],
            side < 0 ? "#262a2d" : "#303437",
          ),
        );
      }
      masonry.push(
        piece(
          `${id}:tower:${towerIndex}:floor:${floor}:landing`,
          id,
          "basalt",
          "stoneBlock",
          [towerX, floorY, floor % 2 === 1 ? 1.33 : -1.55],
          [1.78, 0.28, 1.45],
          "#2c3033",
        ),
      );
    }

    // The upper guard room is a real post-and-slab structure. These inner
    // piers keep the roof deck load off the thin decorative outer shell.
    for (const side of [-1, 1] as const) {
      masonry.push(
        piece(
          `${id}:tower:${towerIndex}:upper-pier:${side}`,
          id,
          "graphiteStone",
          "stoneBlock",
          [towerX + side * 1.42, 9.55, -0.42],
          [0.42, 3.54, 0.42],
          side < 0 ? "#35393c" : "#414548",
        ),
      );
    }

    for (let merlon = 0; merlon < 5; merlon += 1) {
      masonry.push(
        piece(
          `${id}:tower:${towerIndex}:merlon:${merlon}`,
          id,
          "graphiteStone",
          "stoneBlock",
          [towerX - 2 + merlon, 12.48, -0.42],
          [0.72, 1.08, 4.6],
          merlon % 2 === 0 ? "#2d3033" : "#3d4144",
        ),
      );
    }
  }

  for (let archRow = 0; archRow < 5; archRow += 1) {
    const x = -3.95 + archRow * 0.55;
    const y = 5.15 + archRow * 0.72;
    for (const side of [-1, 1] as const) {
      masonry.push(
        piece(
          `${id}:arch:${side}:${archRow}`,
          id,
          "graphiteStone",
          "stoneBlock",
          [side * Math.abs(x), y, 0.08],
          [1.15, 0.78, 3.25],
          archRow % 2 === 0 ? "#4a4d50" : "#373b3e",
          [0, 0, side * 0.16],
        ),
      );
    }
  }
  masonry.push(
    piece(
      `${id}:keystone`,
      id,
      "basalt",
      "stoneBlock",
      [0, 8.3, 0.08],
      [1.45, 1.25, 3.35],
      "#262a2d",
    ),
  );
  for (const [index, x] of [-4.1, 4.1].entries()) {
    masonry.push(
      piece(
        `minas:gate:sconce:${index}`,
        id,
        "steel",
        "steelSheet",
        [x, 4.2, 1.95],
        [0.34, 0.18, 0.34],
        "#292e31",
      ),
      piece(
        `minas:gate:torch:${index}`,
        id,
        "glass",
        "glassPane",
        [x, 4.6, 2],
        [0.28, 0.62, 0.28],
        litWindowColor,
      ),
    );
  }
  addCluster(id, "Twin-towered gatehouse", "graphiteStone", "stack", masonry);

  const doors: BreakablePieceDefinition[] = [];
  for (const side of [-1, 1] as const) {
    for (let plank = 0; plank < 5; plank += 1) {
      doors.push(
        piece(
          `minas:gate:door:${side}:${plank}`,
          "minas:gate:doors",
          "wood",
          "plank",
          [side * (0.46 + plank * 0.72), 2.5, 1.08],
          [0.68, 4.85, 0.3],
          plank % 2 === 0 ? "#4b281c" : "#382016",
        ),
      );
    }
  }
  for (const y of [1.05, 2.45, 3.85]) {
    doors.push(
      piece(
        `minas:gate:brace:${y}`,
        "minas:gate:doors",
        "steel",
        "steelSheet",
        [0, y, 1.28],
        [7.55, 0.18, 0.18],
        "#272b2d",
      ),
    );
  }
  addCluster("minas:gate:doors", "Iron-bound gates", "wood", "linked", doors);

  const portcullis: BreakablePieceDefinition[] = [];
  for (let column = -5; column <= 5; column += 1) {
    portcullis.push(
      piece(
        `minas:gate:portcullis:v:${column}`,
        "minas:gate:portcullis",
        "steel",
        "steelSheet",
        [column * 0.65, 2.8, 0.72],
        [0.105, 5.5, 0.105],
        "#3b4043",
      ),
    );
  }
  for (let row = 0; row < 5; row += 1) {
    portcullis.push(
      piece(
        `minas:gate:portcullis:h:${row}`,
        "minas:gate:portcullis",
        "steel",
        "steelSheet",
        [0, 0.8 + row * 1.02, 0.72],
        [7.25, 0.1, 0.1],
        "#33383b",
      ),
    );
  }
  addCluster(
    "minas:gate:portcullis",
    "Portcullis",
    "steel",
    "linked",
    portcullis,
  );

  for (const [index, x] of [-4.1, 4.1].entries()) {
    lamps.push({
      id: `minas:gate:torch:${index}`,
      position: [x, 4.6, 2.3],
    });
  }
}

function createWallWalk(): void {
  const id = "minas:wall-walk";
  const pieces: BreakablePieceDefinition[] = [];
  for (let index = 0; index < 18; index += 1) {
    const x = -25.5 + index * 3;
    pieces.push(
      piece(
        `${id}:slab:${index}`,
        id,
        "basalt",
        "stoneBlock",
        [x, 8.23, -1.25],
        [3.04, 0.35, 4.1],
        index % 2 === 0 ? "#2b2f31" : "#373a3c",
      ),
    );
  }
  addCluster(id, "Battlement walk", "basalt", "stack", pieces);
}

function createWallTorches(): void {
  const id = "minas:wall-torches";
  const pieces: BreakablePieceDefinition[] = [];

  // Iron sconces along the inner face of the wall; the flames are the same
  // lamp-driven glass the gate torches use, so night patrols read the wall.
  for (const [index, x] of [-22.4, -13.6, 13.6, 22.4].entries()) {
    pieces.push(
      piece(
        `${id}:bracket:${index}`,
        id,
        "steel",
        "steelSheet",
        [x, 6.9, 0.86],
        [0.3, 0.16, 0.34],
        "#272c2f",
      ),
      piece(
        `${id}:flame:${index}`,
        id,
        "glass",
        "glassPane",
        [x, 7.26, 0.88],
        [0.26, 0.56, 0.26],
        litWindowColor,
      ),
    );
    lamps.push({
      id: `${id}:flame:${index}`,
      position: [x, 7.32, 1.3],
      color: "#ffb46a",
      distance: 8,
      intensity: 3.1,
    });
  }

  // Two braziers flanking the causeway before the gate.
  for (const [index, side] of ([-1, 1] as const).entries()) {
    const x = side * 5.4;
    pieces.push(
      piece(
        `${id}:brazier:base:${index}`,
        id,
        "steel",
        "steelSheet",
        [x, 0.54, 12.4],
        [0.22, 1.0, 0.22],
        "#2c3134",
      ),
      piece(
        `${id}:brazier:bowl:${index}`,
        id,
        "steel",
        "steelSheet",
        [x, 1.14, 12.4],
        [0.58, 0.2, 0.58],
        "#33383b",
      ),
      piece(
        `${id}:brazier:flame:${index}`,
        id,
        "glass",
        "glassPane",
        [x, 1.49, 12.4],
        [0.34, 0.5, 0.34],
        litWindowColor,
      ),
    );
    lamps.push({
      id: `${id}:brazier:flame:${index}`,
      position: [x, 1.65, 12.4],
      color: "#ffa95c",
      distance: 9,
      intensity: 3.4,
    });
  }

  addCluster(id, "Wall torches and braziers", "steel", "mounted", pieces);
}

function createDarkTower(): void {
  const id = "minas:dark-tower";
  const pieces: BreakablePieceDefinition[] = [];
  const centerZ = -36;
  const floorHeight = 4.15;
  const floors = 8;
  let serial = 0;

  for (let floor = 0; floor < floors; floor += 1) {
    const baseY = floor * floorHeight;
    const width = 18 - floor * 0.72;
    const depth = 13.8 - floor * 0.38;
    const segmentsX = Math.max(7, Math.round(width / 1.45));
    const segmentsZ = Math.max(5, Math.round(depth / 1.45));
    const cellX = width / segmentsX;
    const cellZ = depth / segmentsZ;

    for (let ix = 0; ix < 4; ix += 1) {
      for (let iz = 0; iz < 3; iz += 1) {
        pieces.push(
          piece(
            `${id}:floor:${floor}:${ix}:${iz}`,
            id,
            floor % 2 === 0 ? "basalt" : "graphiteStone",
            "stoneBlock",
            [
              -width / 2 + (ix + 0.5) * (width / 4),
              baseY + 0.18,
              centerZ - depth / 2 + (iz + 0.5) * (depth / 3),
            ],
            [width / 4 - 0.035, 0.38, depth / 3 - 0.035],
            (floor + ix + iz) % 3 === 0 ? "#25292c" : "#34383b",
          ),
        );
      }
    }

    for (let row = 0; row < 5; row += 1) {
      const y = baseY + 0.62 + row * 0.75;
      for (let column = 0; column < segmentsX; column += 1) {
        const x = -width / 2 + cellX * (column + 0.5);
        const opening =
          floor === 0 && row < 4 && Math.abs(x) < 1.9;
        if (!opening) {
          const window =
            row === 2 &&
            column > 1 &&
            column < segmentsX - 2 &&
            column % 3 === floor % 3;
          for (const face of [-1, 1] as const) {
            const front = face === 1;
            pieces.push(
              piece(
                `${id}:wall:x:${serial++}`,
                id,
                window ? "darkGlass" : "graphiteStone",
                window ? "glassPane" : "stoneBlock",
                [x, y, centerZ + face * depth / 2],
                [cellX - 0.025, 0.72, window ? 0.2 : 0.72],
                window
                  ? front
                    ? "#263b43"
                    : "#1d3037"
                  : (row + column + floor) % 4 === 0
                    ? "#45494c"
                    : "#303437",
              ),
            );
          }
        }
      }

      for (let column = 1; column < segmentsZ - 1; column += 1) {
        const z = centerZ - depth / 2 + cellZ * (column + 0.5);
        const window =
          row === 2 && column % 3 === (floor + 1) % 3;
        for (const face of [-1, 1] as const) {
          pieces.push(
            piece(
              `${id}:wall:z:${serial++}`,
              id,
              window ? "darkGlass" : "graphiteStone",
              window ? "glassPane" : "stoneBlock",
              [face * width / 2, y, z],
              [window ? 0.2 : 0.72, 0.72, cellZ - 0.025],
              window
                ? "#20363d"
                : (row + column + floor) % 4 === 0
                  ? "#484c4f"
                  : "#2d3134",
            ),
          );
        }
      }
    }

    if (floor === 0) {
      for (const face of [-1, 1] as const) {
        pieces.push(
          piece(
            `${id}:entrance-lintel:${face}`,
            id,
            "steel",
            "steelSheet",
            [0, 3.3, centerZ + face * depth / 2],
            [5.4, 0.38, 0.68],
            "#252a2d",
          ),
        );
      }
    }

    {
      const nextWidth =
        floor < floors - 1 ? 18 - (floor + 1) * 0.72 : width;
      const nextDepth =
        floor < floors - 1 ? 13.8 - (floor + 1) * 0.38 : depth;
      for (let columnX = 0; columnX < 4; columnX += 1) {
        for (let columnZ = 0; columnZ < 3; columnZ += 1) {
          const x = -nextWidth / 2 + (columnX + 0.5) * (nextWidth / 4);
          const z =
            centerZ -
            nextDepth / 2 +
            (columnZ + 0.5) * (nextDepth / 3);
          for (let section = 0; section < 3; section += 1) {
            pieces.push(
              piece(
                `${id}:column:${floor}:${columnX}:${columnZ}:${section}`,
                id,
                "basalt",
                "stoneBlock",
                [x, baseY + 0.995 + section * 1.25, z],
                [1.05, 1.22, 1.05],
                section % 2 === 0 ? "#23272a" : "#303437",
              ),
            );
          }
        }
      }
    }

    for (const sideX of [-1, 1] as const) {
      for (const sideZ of [-1, 1] as const) {
        for (let section = 0; section < 4; section += 1) {
          pieces.push(
            piece(
              `${id}:buttress:${floor}:${sideX}:${sideZ}:${section}`,
              id,
              "basalt",
              "stoneBlock",
              [
                sideX * (width / 2 + 0.34),
                baseY + 0.72 + section * 1.05,
                centerZ + sideZ * (depth / 2 + 0.34),
              ],
              [0.9, 1.02, 0.9],
              section % 2 === 0 ? "#1f2326" : "#292d30",
            ),
          );
        }
      }
    }
  }

  const crownY = floors * floorHeight;
  const roofWidth = 18 - (floors - 1) * 0.72;
  const roofDepth = 13.8 - (floors - 1) * 0.38;
  for (let ix = 0; ix < 4; ix += 1) {
    for (let iz = 0; iz < 3; iz += 1) {
      pieces.push(
        piece(
          `${id}:roof:${ix}:${iz}`,
          id,
          "basalt",
          "stoneBlock",
          [
            -roofWidth / 2 + (ix + 0.5) * (roofWidth / 4),
            crownY + 0.18,
            centerZ - roofDepth / 2 + (iz + 0.5) * (roofDepth / 3),
          ],
          [roofWidth / 4 - 0.035, 0.38, roofDepth / 3 - 0.035],
          (ix + iz) % 2 === 0 ? "#202427" : "#2b2f32",
        ),
      );
    }
  }

  const crownWidth = 12.6;
  for (let index = 0; index < 9; index += 1) {
    const x = -crownWidth / 2 + index * (crownWidth / 8);
    pieces.push(
      piece(
        `${id}:crown:base:${index}`,
        id,
        "basalt",
        "stoneBlock",
        [x, crownY + 0.9, centerZ + 0.5],
        [1.52, 1.05, 7.5],
        index % 2 === 0 ? "#202427" : "#2d3134",
      ),
    );
  }

  for (const side of [-1, 1] as const) {
    for (let level = 0; level < 8; level += 1) {
      const spread = 4.9 + level * 0.38;
      pieces.push(
        piece(
          `${id}:spire:${side}:${level}`,
          id,
          "basalt",
          "stoneBlock",
          [side * spread, crownY + 1.5 + level * 1.35, centerZ],
          [1.12 - level * 0.07, 1.42, 1.4 - level * 0.08],
          level % 2 === 0 ? "#1b1f22" : "#292d30",
          [0, 0, side * -0.055 * level],
        ),
      );
    }
  }

  for (const x of [-2.8, 0, 2.8]) {
    pieces.push(
      piece(
        `${id}:eye-frame:column:${x}`,
        id,
        "graphiteStone",
        "stoneBlock",
        [x, crownY + 2.85, centerZ + 3.72],
        [0.48, 3.3, 0.48],
        "#1d2124",
      ),
    );
  }
  pieces.push(
    piece(
      `${id}:eye-frame:beam`,
      id,
      "steel",
      "steelSheet",
      [0, crownY + 4.7, centerZ + 3.86],
      [7.4, 0.38, 0.46],
      "#202528",
    ),
  );

  for (let panel = -3; panel <= 3; panel += 1) {
    pieces.push(
      piece(
        `${id}:eye:${panel}`,
        id,
        "darkGlass",
        "glassPane",
        [
          panel * 0.95,
          crownY + 5.55 - Math.abs(panel) * 0.1,
          centerZ + 4.05,
        ],
        [0.92, 1.1 - Math.abs(panel) * 0.06, 0.18],
        panel === 0 ? "#ff5a2f" : "#9f241a",
        [0, 0, panel * -0.025],
      ),
    );
  }
  lamps.push({
    id: `${id}:eye:0`,
    position: [0, crownY + 5.5, centerZ + 4.65],
    color: "#ff421c",
    distance: 16,
    intensity: 5.6,
  });

  addCluster(id, "The many-storeyed dark tower", "basalt", "stack", pieces);
}

function createApproachDetails(): void {
  const id = "minas:approach";
  const pieces: BreakablePieceDefinition[] = [];

  for (let step = 0; step < 7; step += 1) {
    const slabY = 0.11 + step * 0.12;
    const slabBottom = slabY - 0.14;
    if (slabBottom > 0.08) {
      const plinthHeight = slabBottom - 0.04;
      pieces.push(
        piece(
          `${id}:causeway:plinth:${step}`,
          id,
          "graphiteStone",
          "stoneBlock",
          [0, 0.04 + plinthHeight / 2, 23.5 - step * 3.15],
          [7.7 - step * 0.2, plinthHeight, 2.85],
          step % 2 === 0 ? "#4c4f4d" : "#414442",
        ),
      );
    }
    pieces.push(
      piece(
        `${id}:causeway:${step}`,
        id,
        "stone",
        "stoneBlock",
        [0, slabY, 23.5 - step * 3.15],
        [8.4 - step * 0.2, 0.28, 3.2],
        step % 2 === 0 ? "#777872" : "#686a66",
      ),
    );
  }

  for (const side of [-1, 1] as const) {
    for (let index = 0; index < 7; index += 1) {
      pieces.push(
        piece(
          `${id}:marker:${side}:${index}`,
          id,
          "graphiteStone",
          "stoneBlock",
          [side * (4.9 - index * 0.08), 0.58, 23.5 - index * 3.15],
          [0.42, 1.05, 0.42],
          "#34383a",
        ),
      );
    }
  }

  addCluster(id, "Ancient stone causeway", "stone", "stack", pieces);
}

function createWeatheredHighlandDetails(): void {
  const rubble: BreakablePieceDefinition[] = [];
  const timber: BreakablePieceDefinition[] = [];
  const stakes: BreakablePieceDefinition[] = [];

  for (let index = 0; index < 54; index += 1) {
    const side = index % 2 === 0 ? -1 : 1;
    const spread = 7.2 + seededNoise(index, side, 223) * 18;
    const x = side * spread;
    const z = 4 + seededNoise(index, side, 227) * 31;
    const surfaceY = highlandSurfaceYAt(x, z);
    const width = 0.36 + seededNoise(index, side, 229) * 0.82;
    const height = 0.24 + seededNoise(index, side, 233) * 0.55;
    const depth = 0.38 + seededNoise(index, side, 239) * 0.9;
    const dark = seededNoise(index, side, 241) > 0.58;
    rubble.push(
      piece(
        `minas:weather:rubble:${index}`,
        "minas:weather:rubble",
        dark ? "basalt" : "stone",
        "stoneBlock",
        [x, surfaceY + height / 2 - 0.015, z],
        [width, height, depth],
        dark
          ? seededNoise(index, side, 251) > 0.5
            ? "#2b3032"
            : "#34393b"
          : seededNoise(index, side, 257) > 0.5
            ? "#62645f"
            : "#74756e",
        [
          (seededNoise(index, side, 263) - 0.5) * 0.18,
          seededNoise(index, side, 269) * Math.PI,
          (seededNoise(index, side, 271) - 0.5) * 0.18,
        ],
      ),
    );
  }

  for (let index = 0; index < 15; index += 1) {
    const side = index % 2 === 0 ? -1 : 1;
    const x = side * (8 + seededNoise(index, side, 277) * 15);
    const z = 6 + seededNoise(index, side, 281) * 27;
    const surfaceY = highlandSurfaceYAt(x, z);
    const length = 1.8 + seededNoise(index, side, 283) * 2.6;
    const thickness = 0.18 + seededNoise(index, side, 293) * 0.18;
    timber.push(
      piece(
        `minas:weather:timber:${index}`,
        "minas:weather:timber",
        "wood",
        "plank",
        [x, surfaceY + thickness / 2, z],
        [length, thickness, thickness * 0.9],
        index % 3 === 0 ? "#3e2b1d" : "#543822",
        [
          (seededNoise(index, side, 307) - 0.5) * 0.08,
          seededNoise(index, side, 311) * Math.PI,
          (seededNoise(index, side, 313) - 0.5) * 0.08,
        ],
      ),
    );
  }

  for (let index = 0; index < 12; index += 1) {
    const side = index % 2 === 0 ? -1 : 1;
    const x = side * (5.8 + Math.floor(index / 2) * 1.65);
    const z = 25.5 - Math.floor(index / 2) * 3.45;
    const surfaceY = highlandSurfaceYAt(x, z);
    const height = 1.45 + seededNoise(index, side, 317) * 1.15;
    stakes.push(
      piece(
        `minas:weather:stake:${index}`,
        "minas:weather:stakes",
        index % 4 === 0 ? "steel" : "wood",
        index % 4 === 0 ? "steelSheet" : "plank",
        [x, surfaceY + height / 2 - 0.04, z],
        [index % 4 === 0 ? 0.12 : 0.2, height, index % 4 === 0 ? 0.12 : 0.2],
        index % 4 === 0 ? "#2d3335" : index % 3 === 0 ? "#422b1c" : "#573823",
        [
          (seededNoise(index, side, 331) - 0.5) * 0.06,
          (seededNoise(index, side, 337) - 0.5) * 0.18,
          side * (0.035 + seededNoise(index, side, 347) * 0.045),
        ],
      ),
    );
  }

  addCluster(
    "minas:weather:rubble",
    "Old wall scree",
    "stone",
    "stack",
    rubble,
  );
  addCluster(
    "minas:weather:timber",
    "Weathered siege timber",
    "wood",
    "stack",
    timber,
  );
  addCluster(
    "minas:weather:stakes",
    "Broken approach stakes",
    "wood",
    "stack",
    stakes,
  );
}

createHighlandGround();
createCircularHighlandExtension();
createMountainRidge(-1);
createMountainRidge(1);
createCitadelWall();
createGatehouse();
createWallWalk();
createWallTorches();
createDarkTower();
createApproachDetails();
createWeatheredHighlandDetails();
const inhabitedWorld = createMinasTirithWorldbuilding({
  surfaceYAt: highlandSurfaceYAt,
});
clusters.push(...inhabitedWorld.clusters);
lamps.push(...inhabitedWorld.lamps);

export const minasTirithScene = createDestructionScene({
  id: "minas-tirith",
  title: "Make a Mess: Minas Tirith",
  environment: "fortress",
  playerSpawn: [0, 1.25, 31],
  cameraFar: 240,
  worldCenter: [0, PLAYFIELD_CENTER_Z],
  worldHalfExtents: [100, 100],
  worldRadius: PLAYFIELD_RADIUS + 2,
  safetyFloorY: -2.2,
  copy: {
    status: "Make a Mess / Minas Tirith",
    eyebrow: "Citadel breach test 001",
    heading: "Крепость — объект.",
    ready: "The mountain gate is ready",
    loading: "Поднимаем крепость…",
    description:
      "Горная гряда, тёмная средневековая стена с воротами и многоэтажная башня за ней. Камень, базальт, дерево, сталь и тёмное стекло держатся на реальных опорах и ломаются тем же движком. На компьютере — WASD и мышь; на телефоне или планшете — стик и зона обзора.",
    enter: "Выйти к воротам",
    returnToGame: "Продолжить осаду",
    reset: "Поднять крепость заново",
  },
  clusters,
  lamps,
  // Trim the deep sibling overlaps in the faceted basalt towers so they stop
  // z-fighting (and stop shoving bricks out on impact) while staying breakable.
  resolveInterpenetration: true,
});

export const minasTirithMaterials = [
  "stone",
  "grass",
  "basalt",
  "graphiteStone",
  "darkGlass",
  "foliage",
] as const satisfies readonly BreakableMaterial[];
