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
          tone > 0.66 ? "#667c48" : tone > 0.32 ? "#526b3d" : "#455c35",
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
          tone > 0.5 ? "#5b4934" : "#4e402f",
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

function createMountainRidge(side: -1 | 1): void {
  const id = `minas:ridge:${side < 0 ? "west" : "east"}`;
  const rocks: BreakablePieceDefinition[] = [];
  const caps: BreakablePieceDefinition[] = [];
  const block = 5;
  let index = 0;

  for (let xStep = 0; xStep < 8; xStep += 1) {
    const x = side * (27.5 + xStep * block);
    for (let zStep = 0; zStep < 23; zStep += 1) {
      const z = 37 - zStep * 5;
      const shoulder = xStep * 0.68;
      const valleyLift = Math.max(0, 1 - Math.abs(z + 4) / 60) * 2.2;
      const distantLift = Math.max(0, (-z - 30) * 0.045);
      const noise = seededNoise(xStep, zStep, side);
      const height = Math.max(
        1,
        Math.round(1.2 + shoulder + valleyLift + distantLift + noise * 1.8),
      );

      for (let level = 0; level < height; level += 1) {
        const taper = Math.min(level * 0.035, 0.24);
        const rockSize = block * (1 - taper);
        const material = level % 4 === 0 ? "graphiteStone" : "basalt";
        rocks.push(
          piece(
            `${id}:rock:${index}:${level}`,
            id,
            material,
            "stoneBlock",
            [
              x + side * level * 0.1,
              0.94 + level * 1.82,
              z + (seededNoise(level, zStep, xStep) - 0.5) * 0.22,
            ],
            [rockSize + 0.12, 1.8, 5.08],
            material === "basalt"
              ? noise > 0.55
                ? "#34383b"
                : "#292d30"
              : noise > 0.55
                ? "#484b4e"
                : "#3c3f43",
            [0, (noise - 0.5) * 0.035, 0],
          ),
        );
      }

      caps.push(
        piece(
          `${id}:cap:${index}`,
          `${id}:caps`,
          "grass",
          "groundTile",
          [x + side * height * 0.1, 0.13 + height * 1.82, z],
          [block * 0.94, 0.18, 4.75],
          noise > 0.55 ? "#586e3e" : "#425936",
          [0, (noise - 0.5) * 0.035, 0],
        ),
      );
      index += 1;
    }
  }

  addCluster(id, "Basalt mountain ridge", "basalt", "stack", rocks);
  addCluster(`${id}:caps`, "Mountain turf", "grass", "mounted", caps);
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
    for (let row = 0; row < 15; row += 1) {
      const y = 0.5 + row * 0.78;
      const inset = Math.floor(row / 5) * 0.08;
      const width = 5.15 - inset;
      for (let segment = 0; segment < 3; segment += 1) {
        masonry.push(
          piece(
            `${id}:tower:${towerIndex}:${row}:${segment}`,
            id,
            row < 3 ? "basalt" : "graphiteStone",
            "stoneBlock",
            [towerX + (segment - 1) * (width / 3), y, -0.42],
            [width / 3 - 0.025, 0.75, 4.5],
            (row + segment) % 3 === 0 ? "#323638" : "#414548",
          ),
        );
      }
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

createHighlandGround();
createMountainRidge(-1);
createMountainRidge(1);
createCitadelWall();
createGatehouse();
createWallWalk();
createDarkTower();
createApproachDetails();

export const minasTirithScene = createDestructionScene({
  id: "minas-tirith",
  title: "Make a Mess: Minas Tirith",
  environment: "fortress",
  playerSpawn: [0, 1.25, 31],
  cameraFar: 210,
  worldCenter: [0, -18],
  worldHalfExtents: [70, 62],
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
});

export const minasTirithMaterials = [
  "stone",
  "grass",
  "basalt",
  "graphiteStone",
  "darkGlass",
] as const satisfies readonly BreakableMaterial[];
