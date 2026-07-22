import { litWindowColor } from "../../game/destructionScene.ts";
import type {
  ScenePrefabDefinition,
  ScenePrefabLibrary,
  ScenePrefabPieceDefinition,
} from "../scenes/sceneContract.ts";

const timber = "#725038";
const darkTimber = "#3f3027";
const freshTimber = "#9a714c";
const iron = "#353a3b";
const fieldStone = "#706e66";

function prefab(
  id: string,
  displayName: string,
  tags: readonly string[],
  pieces: readonly ScenePrefabPieceDefinition[],
): ScenePrefabDefinition {
  return { schemaVersion: 1, id, displayName, tags, pieces };
}

// Furnishings are rotated by each house's arbitrary yaw. The structural solver
// reads axis-aligned footprints, so give every furnishing piece an explicit
// self-contact box: the compiler rotates it into a correct world AABB, keeping
// stacked and offset pieces (cupboard shelves, loom beams) properly supported.
function furnishing(
  id: string,
  displayName: string,
  tags: readonly string[],
  pieces: readonly ScenePrefabPieceDefinition[],
): ScenePrefabDefinition {
  return prefab(
    id,
    displayName,
    tags,
    pieces.map((piece) =>
      piece.contactBoxes
        ? piece
        : { ...piece, contactBoxes: [{ position: piece.position, size: piece.size }] },
    ),
  );
}

function verticalLog(
  id: string,
  height: number,
  radius = 0.32,
  pointed = false,
): ScenePrefabDefinition {
  const pieces: ScenePrefabPieceDefinition[] = [
    {
      id: "body",
      material: "wood",
      shape: "cylinder",
      position: [0, height / 2, 0],
      size: [radius * 2, height, radius * 2],
      color: timber,
      colorSlot: "timber",
    },
  ];
  if (pointed) {
    pieces.push({
      id: "point",
      material: "wood",
      shape: "cylinder",
      position: [0, height + 0.34, 0],
      size: [radius * 1.1, 0.68, radius * 1.1],
      color: freshTimber,
      colorSlot: "cut",
    });
  }
  return prefab(id, `Vertical log ${height}m`, ["viking", "log", "structural"], pieces);
}

function horizontalLog(
  id: string,
  length: number,
  radius = 0.3,
): ScenePrefabDefinition {
  return prefab(id, `Horizontal log ${length}m`, ["viking", "log", "structural"], [
    {
      id: "body",
      material: "wood",
      shape: "cylinder",
      position: [0, 0, 0],
      rotation: [0, 0, Math.PI / 2],
      size: [radius * 2, length, radius * 2],
      bearingArea: length * radius * 2,
      color: timber,
      colorSlot: "timber",
      contactBoxes: [{ position: [0, 0, 0], size: [length, radius * 2, radius * 2] }],
    },
  ]);
}

function addLonghouseWall(
  pieces: ScenePrefabPieceDefinition[],
  prefix: string,
  width: number,
  length: number,
  wallHeight: number,
  doorWall: "end-positive" | "side-positive",
  doorCenter = 0,
): void {
  const rows = Math.round(wallHeight / 0.5);
  const logDiameter = 0.58;
  const doorWidth = 2.05;
  const doorRows = 5;

  const pushHorizontalLog = (
    id: string,
    position: readonly [number, number, number],
    axis: "x" | "z",
    span: number,
    row: number,
    colorSlot: "darkTimber" | "timber" | "lightTimber",
  ): void => {
    pieces.push({
      id,
      material: "wood",
      shape: "cylinder",
      position,
      rotation: axis === "x" ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0],
      size: [logDiameter, span, logDiameter],
      bearingArea: span * logDiameter,
      contactBoxes: [{
        position,
        size: axis === "x" ? [span, logDiameter, logDiameter] : [logDiameter, logDiameter, span],
      }],
      color: colorSlot === "darkTimber" ? darkTimber : colorSlot === "lightTimber" ? freshTimber : timber,
      colorSlot,
    });
  };

  for (let row = 0; row < rows; row += 1) {
    const y = 0.32 + row * 0.5;
    const endSpan = width + (row % 2 === 0 ? 0.72 : -0.42);
    const sideSpan = length + (row % 2 === 1 ? 0.72 : -0.42);
    for (const side of [-1, 1] as const) {
      if (doorWall === "end-positive" && side === 1 && row < doorRows) {
        const segmentSpan = (endSpan - doorWidth) / 2;
        for (const direction of [-1, 1] as const) {
          pushHorizontalLog(
            `${prefix}:end:${side}:row:${row}:door:${direction}`,
            [direction * (doorWidth / 2 + segmentSpan / 2), y, side * length / 2],
            "x",
            segmentSpan,
            row,
            row % 3 === 0 ? "darkTimber" : "timber",
          );
        }
      } else {
        pushHorizontalLog(
          `${prefix}:end:${side}:row:${row}`,
          [0, y, side * length / 2],
          "x",
          endSpan,
          row,
          row % 3 === 0 ? "darkTimber" : "timber",
        );
      }
    }
    for (const side of [-1, 1] as const) {
      if (doorWall === "side-positive" && side === 1 && row < doorRows) {
        const wallStart = -sideSpan / 2;
        const wallEnd = sideSpan / 2;
        const openingStart = doorCenter - doorWidth / 2;
        const openingEnd = doorCenter + doorWidth / 2;
        const segments = [
          [wallStart, openingStart, -1],
          [openingEnd, wallEnd, 1],
        ] as const;
        for (const [start, end, direction] of segments) {
          const segmentSpan = end - start;
          pushHorizontalLog(
            `${prefix}:side:${side}:row:${row}:door:${direction}`,
            [side * width / 2, y, (start + end) / 2],
            "z",
            segmentSpan,
            row,
            row % 4 === 1 ? "lightTimber" : "timber",
          );
        }
      } else {
        pushHorizontalLog(
          `${prefix}:side:${side}:row:${row}`,
          [side * width / 2, y, 0],
          "z",
          sideSpan,
          row,
          row % 4 === 1 ? "lightTimber" : "timber",
        );
      }
    }
  }
}

// A plank door leaf: vertical boards over two iron straps, all sharing one
// hinge so the whole leaf swings as one створка when the player approaches.
// The boards reach the threshold (ground-supported); the straps side-attach to
// them. `face` is the outward axis the leaf presents.
function pushPlankDoor(
  pieces: ScenePrefabPieceDefinition[],
  face: "x" | "z",
  center: readonly [number, number, number],
  leafWidth: number,
  height: number,
  hinge: NonNullable<ScenePrefabPieceDefinition["hinge"]>,
): void {
  const [cx, cy, cz] = center;
  const boardCount = 5;
  const boardWidth = leafWidth / boardCount;
  for (let board = 0; board < boardCount; board += 1) {
    const offset = -leafWidth / 2 + boardWidth * (board + 0.5);
    const position: readonly [number, number, number] =
      face === "z" ? [cx + offset, cy, cz] : [cx, cy, cz + offset];
    const size: readonly [number, number, number] =
      face === "z" ? [boardWidth * 0.95, height, 0.14] : [0.14, height, boardWidth * 0.95];
    pieces.push({
      id: `door:board:${board}`,
      material: "wood",
      shape: "plank",
      position,
      size,
      color: board % 2 === 0 ? darkTimber : "#4a382c",
      colorSlot: "door",
      carriesAttachments: true,
      hinge,
    });
  }
  for (const [strapIndex, strapY] of [cy - height * 0.28, cy + height * 0.3].entries()) {
    const position: readonly [number, number, number] =
      face === "z" ? [cx, strapY, cz + 0.1] : [cx + 0.1, strapY, cz];
    const size: readonly [number, number, number] =
      face === "z" ? [leafWidth * 0.98, 0.14, 0.06] : [0.06, 0.14, leafWidth * 0.98];
    pieces.push({
      id: `door:strap:${strapIndex}`,
      material: "steel",
      shape: "steelSheet",
      position,
      size,
      color: iron,
      bearsLoad: false,
      sideAttachmentReach: 0.34,
      hinge,
    });
  }
}

function longhouse(
  id: string,
  width: number,
  length: number,
  wallHeight: number,
  hall = false,
): ScenePrefabDefinition {
  const pieces: ScenePrefabPieceDefinition[] = [];
  const paletteSlot = hall ? "hallTimber" : "timber";
  const wallRows = Math.round(wallHeight / 0.5);
  const wallTop = 0.32 + (wallRows - 1) * 0.5 + 0.29;
  const doorWall = hall ? "side-positive" : "end-positive";
  const doorCenter = hall ? length * 0.28 : 0;
  const doorWidth = 2.05;

  // A log wall is not a freestanding pile of cylinders. A low dry-stone
  // footing keeps the first course out of wet soil and gives every wall a
  // continuous, visibly load-bearing base.
  const foundationHeight = 0.34;
  const foundationDepth = 0.82;
  const addFoundationLine = (
    axis: "x" | "z",
    side: -1 | 1,
    span: number,
    hasDoor: boolean,
    openingCenter: number,
  ): void => {
    const segmentCount = Math.ceil(span / 1.45);
    const segmentSpan = span / segmentCount;
    for (let index = 0; index < segmentCount; index += 1) {
      const along = -span / 2 + segmentSpan * (index + 0.5);
      if (
        hasDoor &&
        Math.abs(along - openingCenter) < doorWidth / 2 + segmentSpan * 0.42
      ) {
        continue;
      }
      const position = axis === "x"
        ? [along, foundationHeight / 2, side * length / 2] as const
        : [side * width / 2, foundationHeight / 2, along] as const;
      pieces.push({
        id: `foundation:${axis}:${side}:${index}`,
        material: "stone",
        shape: "stoneBlock",
        position,
        size: axis === "x"
          ? [segmentSpan + 0.04, foundationHeight, foundationDepth]
          : [foundationDepth, foundationHeight, segmentSpan + 0.04],
        color: index % 3 === 0 ? "#5f625d" : fieldStone,
        colorSlot: "foundationStone",
      });
    }
  };
  for (const side of [-1, 1] as const) {
    addFoundationLine(
      "x",
      side,
      width,
      doorWall === "end-positive" && side === 1,
      0,
    );
    addFoundationLine(
      "z",
      side,
      length,
      doorWall === "side-positive" && side === 1,
      doorCenter,
    );
  }

  addLonghouseWall(pieces, "wall", width, length, wallHeight, doorWall, doorCenter);
  for (const x of [-width / 2, width / 2]) {
    for (const z of [-length / 2, length / 2]) {
      pieces.push({
        id: `post:${x}:${z}`,
        material: "wood",
        shape: "cylinder",
        position: [x, wallHeight / 2, z],
        size: [0.72, wallHeight, 0.72],
        color: darkTimber,
        colorSlot: "darkTimber",
      });
    }
  }

  // Upright clamps tie long courses together and divide the elevation into
  // readable bays. The logs stay continuous until the voxel fracture engine
  // cuts them at the actual impact point, avoiding visible cylinder end caps.
  const addWallClamps = (
    axis: "x" | "z",
    side: -1 | 1,
    span: number,
    hasDoor: boolean,
    openingCenter: number,
  ): void => {
    const bayCount = Math.max(2, Math.ceil(span / 4.35));
    for (let bay = 1; bay < bayCount; bay += 1) {
      const along = -span / 2 + span * bay / bayCount;
      if (hasDoor && Math.abs(along - openingCenter) < doorWidth / 2 + 0.3) {
        continue;
      }
      pieces.push({
        id: `wall-clamp:${axis}:${side}:${bay}`,
        material: "wood",
        shape: "cylinder",
        position: axis === "x"
          ? [along, wallHeight / 2, side * length / 2]
          : [side * width / 2, wallHeight / 2, along],
        size: [0.64, wallHeight, 0.64],
        color: darkTimber,
        colorSlot: "darkTimber",
      });
    }
  };
  for (const side of [-1, 1] as const) {
    addWallClamps(
      "x",
      side,
      width,
      doorWall === "end-positive" && side === 1,
      0,
    );
    addWallClamps(
      "z",
      side,
      length,
      doorWall === "side-positive" && side === 1,
      doorCenter,
    );
  }

  // Side wall plates lock every course together and provide a legible seat
  // for the rafters. Without them a long side reads as an isolated wall even
  // when the structural solver can technically trace support through it.
  for (const side of [-1, 1] as const) {
    pieces.push({
      id: `wall-plate:${side}`,
      material: "wood",
      shape: "cylinder",
      position: [side * width / 2, wallTop + 0.18, 0],
      rotation: [Math.PI / 2, 0, 0],
      size: [0.5, length + 0.55, 0.5],
      bearingArea: (length + 0.55) * 0.5,
      contactBoxes: [{
        position: [side * width / 2, wallTop + 0.03, 0],
        size: [0.54, 0.2, length + 0.35],
      }],
      color: darkTimber,
      colorSlot: "darkTimber",
      contactBearingOrder: true,
    });
  }

  // Close both gables with diminishing log courses around a central king
  // post. The roof, end walls and ridge now read as one timber structure.
  const gableLogDiameter = 0.48;
  const gableRise = 2.28;
  const gableStep = 0.46;
  const gableRows = Math.floor(gableRise / gableStep);
  for (const end of [-1, 1] as const) {
    pieces.push({
      id: `gable:${end}:king-post`,
      material: "wood",
      shape: "cylinder",
      position: [0, wallTop + gableRise / 2, end * length / 2],
      size: [0.42, gableRise, 0.42],
      color: darkTimber,
      colorSlot: "darkTimber",
    });
    for (let row = 0; row < gableRows; row += 1) {
      const rise = gableLogDiameter / 2 + row * gableStep;
      const span = Math.max(
        0.8,
        (width - 0.45) * (1 - rise / (gableRise + 0.18)),
      );
      pieces.push({
        id: `gable:${end}:row:${row}`,
        material: "wood",
        shape: "cylinder",
        position: [0, wallTop + rise, end * length / 2],
        rotation: [0, 0, Math.PI / 2],
        size: [gableLogDiameter, span, gableLogDiameter],
        bearingArea: span * gableLogDiameter,
        contactBoxes: [{
          position: [0, wallTop + rise, end * length / 2],
          size: [span, gableLogDiameter, gableLogDiameter],
        }],
        color: row % 3 === 1 ? timber : darkTimber,
        colorSlot: row % 3 === 1 ? paletteSlot : "darkTimber",
      });
    }
  }

  const framePositions = hall
    ? [
        [width / 2, 1.35, doorCenter - doorWidth / 2 - 0.12, 0.34, 2.7, 0.34],
        [width / 2, 1.35, doorCenter + doorWidth / 2 + 0.12, 0.34, 2.7, 0.34],
        [width / 2, 2.68, doorCenter, 0.34, 0.34, doorWidth + 0.58],
      ]
    : [
        [-doorWidth / 2 - 0.12, 1.35, length / 2, 0.34, 2.7, 0.34],
        [doorWidth / 2 + 0.12, 1.35, length / 2, 0.34, 2.7, 0.34],
        [0, 2.68, length / 2, doorWidth + 0.58, 0.34, 0.34],
      ];
  framePositions.forEach(([x, y, z, sx, sy, sz], index) => {
    pieces.push({
      id: `door-frame:${index}`,
      material: "wood",
      shape: "plank",
      position: [x, y, z],
      size: [sx, sy, sz],
      color: darkTimber,
      colorSlot: "darkTimber",
      contactBearingOrder: index === 2,
      contactBoxes: index === 2
        ? hall
          ? [
              { position: [x, y, z - doorWidth / 2 - 0.12], size: [0.38, 0.28, 0.5] },
              { position: [x, y, z + doorWidth / 2 + 0.12], size: [0.38, 0.28, 0.5] },
            ]
          : [
              { position: [x - doorWidth / 2 - 0.12, y, z], size: [0.5, 0.28, 0.38] },
              { position: [x + doorWidth / 2 + 0.12, y, z], size: [0.5, 0.28, 0.38] },
            ]
        : undefined,
    });
  });
  for (const z of [-length * 0.34, length * 0.34]) {
    pieces.push({
      id: `ridge-post:${z}`,
      material: "wood",
      shape: "cylinder",
      position: [0, (wallHeight + 2.5) / 2, z],
      size: [0.55, wallHeight + 2.5, 0.55],
      color: darkTimber,
      colorSlot: "darkTimber",
    });
  }
  pieces.push({
    id: "ridge-beam",
    material: "wood",
    shape: "cylinder",
    position: [0, wallHeight + 2.45, 0],
    rotation: [Math.PI / 2, 0, 0],
    size: [0.62, length + 1.2, 0.62],
    bearingArea: (length + 1.2) * 0.62,
    contactBoxes: [{ position: [0, wallHeight + 2.6, 0], size: [0.62, 0.2, length + 1.2] }],
    color: darkTimber,
    colorSlot: "darkTimber",
  });

  const roofAngle = Math.atan2(2.25, width / 2 + 0.7);
  const roofWidth = Math.hypot(width / 2 + 0.7, 2.25);

  const rafterCount = Math.ceil((length + 0.7) / 2.5);
  for (let index = 0; index < rafterCount; index += 1) {
    const z = -length / 2 - 0.12 + (length + 0.24) * index / Math.max(rafterCount - 1, 1);
    for (const side of [-1, 1] as const) {
      pieces.push({
        id: `rafter:${side}:${index}`,
        material: "wood",
        shape: "cylinder",
        position: [side * (width / 4 + 0.35), wallHeight + 1.12, z],
        rotation: [0, 0, -side * roofAngle - Math.PI / 2],
        size: [0.24, roofWidth - 0.34, 0.24],
        color: darkTimber,
        colorSlot: "darkTimber",
        contactBearingOrder: true,
        contactBoxes: [
          {
            position: [side * width / 2, wallTop + 0.1, z],
            size: [0.7, 0.2, 1.25],
          },
          {
            position: [0, wallHeight + 2.86, z],
            size: [0.7, 0.2, 1.25],
          },
        ],
      });
    }
  }
  for (const side of [-1, 1] as const) {
    for (let strip = 0; strip < Math.ceil((length + 1) / 1.25); strip += 1) {
      const z = -length / 2 - 0.35 + strip * 1.25;
      pieces.push({
        id: `roof:${side}:${strip}`,
        material: "wood",
        shape: "plank",
        position: [side * (width / 4 + 0.35), wallHeight + 1.3, z],
        rotation: [0, 0, -side * roofAngle],
        size: [roofWidth, 0.18, 1.38],
        color: strip % 4 === 0 ? "#46503a" : "#5b513c",
        colorSlot: strip % 4 === 0 ? "mossRoof" : "roof",
        contactBearingOrder: true,
        contactBoxes: [
          {
            position: [side * width / 2, wallTop + 0.1, z],
            size: [0.7, 0.2, 1.25],
          },
          {
            position: [0, wallHeight + 2.86, z],
            size: [0.7, 0.2, 1.25],
          },
        ],
      });
    }
  }

  const floorCount = Math.ceil(length / 1.2);
  for (let index = 0; index < floorCount; index += 1) {
    pieces.push({
      id: `floor:${index}`,
      material: "wood",
      shape: "plank",
      position: [0, 0.15, -length / 2 + 0.6 + index * 1.2],
      size: [width - 0.9, 0.18, 1.2],
      color: index % 3 === 0 ? freshTimber : timber,
      colorSlot: index % 3 === 0 ? "lightTimber" : paletteSlot,
    });
  }

  if (hall) {
    pushPlankDoor(pieces, "x", [width / 2 + 0.05, 1.2, doorCenter], 1.86, 2.4, {
      pivot: [width / 2 + 0.05, 1.2, doorCenter - 0.88],
      direction: [0, 1, 0],
      normal: [1, 0, 0],
    });
    for (let step = 0; step < 3; step += 1) {
      const height = 0.18 + step * 0.12;
      pieces.push({
        id: `entry-step:${step}`,
        material: "wood",
        shape: "plank",
        position: [width / 2 + 1.45 - step * 0.48, height / 2, doorCenter],
        size: [0.82 + step * 0.3, height, 3.15],
        color: step % 2 === 0 ? freshTimber : timber,
        colorSlot: step % 2 === 0 ? "lightTimber" : paletteSlot,
      });
    }
  } else {
    pushPlankDoor(pieces, "z", [0, 1.15, length / 2 + 0.05], 1.85, 2.3, {
      pivot: [-0.87, 1.15, length / 2 + 0.05],
      direction: [0, 1, 0],
      normal: [0, 0, 1],
    });
  }

  return prefab(
    id,
    hall ? "Great timber hall" : "Scandinavian log house",
    ["viking", "building", "log", hall ? "hall" : "house"],
    pieces,
  );
}

const shield = prefab("viking:shield", "Painted round shield", ["viking", "shield", "decoration"], [
  {
    id: "board",
    material: "wood",
    shape: "cylinder",
    position: [0, 0, 0],
    rotation: [Math.PI / 2, 0, 0],
    size: [1.45, 0.16, 1.45],
    color: "#9b3429",
    colorSlot: "paint",
    bearsLoad: false,
    attachmentSupportMode: "cable",
    sideAttachmentReach: 0.38,
  },
  {
    id: "boss",
    material: "steel",
    shape: "cylinder",
    position: [0, 0, 0.12],
    rotation: [Math.PI / 2, 0, 0],
    size: [0.38, 0.18, 0.38],
    color: iron,
    bearsLoad: false,
  },
  {
    id: "stripe",
    material: "wood",
    shape: "plank",
    position: [0, 0, 0.11],
    size: [0.14, 1.25, 0.08],
    color: "#d4bd79",
    colorSlot: "stripe",
    bearsLoad: false,
    sideAttachmentReach: 0.22,
  },
]);

const barrelPieces: ScenePrefabPieceDefinition[] = [
  {
    id: "body",
    material: "wood",
    shape: "cylinder",
    position: [0, 0.68, 0],
    size: [1.05, 1.36, 1.05],
    color: timber,
  },
];
for (const [bandIndex, y] of [0.28, 0.68, 1.08].entries()) {
  for (let segment = 0; segment < 8; segment += 1) {
    const angle = (segment / 8) * Math.PI * 2;
    barrelPieces.push({
      id: `band:${bandIndex}:${segment}`,
      material: "steel",
      shape: "steelSheet",
      position: [Math.cos(angle) * 0.52, y, Math.sin(angle) * 0.52],
      rotation: [0, -angle, 0],
      size: [0.42, 0.1, 0.07],
      color: iron,
      bearsLoad: false,
    });
  }
}
const barrel = prefab("viking:barrel", "Ale barrel", ["viking", "storage", "barrel"], barrelPieces);

const torch = prefab("viking:torch", "Night torch", ["viking", "light", "torch"], [
  { id: "post", material: "wood", shape: "plank", position: [0, 1.25, 0], size: [0.18, 2.5, 0.18], color: darkTimber },
  { id: "basket", material: "steel", shape: "steelSheet", position: [0, 2.55, 0], size: [0.55, 0.42, 0.55], color: iron, bearsLoad: false },
  {
    id: "flame",
    material: "glass",
    shape: "glassPane",
    position: [0, 2.72, 0],
    size: [0.34, 0.52, 0.34],
    color: litWindowColor,
    bearsLoad: false,
    light: { position: [0, 2.72, 0], color: "#ff9d52", distance: 17, intensity: 4.6 },
  },
]);

function mountedTorch(
  id: string,
  displayName: string,
  intensity: number,
  distance: number,
): ScenePrefabDefinition {
  return prefab(id, displayName, ["viking", "light", "torch", "mounted"], [
    {
      id: "backplate",
      material: "steel",
      shape: "steelSheet",
      position: [0, 0, 0.02],
      size: [0.34, 0.58, 0.12],
      color: iron,
      bearsLoad: false,
      sideAttachmentReach: 0.62,
    },
    {
      id: "bracket",
      material: "wood",
      shape: "plank",
      position: [0, -0.14, 0.44],
      rotation: [-0.42, 0, 0],
      size: [0.14, 0.14, 0.92],
      color: darkTimber,
      bearsLoad: false,
      sideAttachmentReach: 0.9,
    },
    {
      id: "basket",
      material: "steel",
      shape: "steelSheet",
      position: [0, 0.17, 0.82],
      size: [0.52, 0.4, 0.52],
      color: iron,
      bearsLoad: false,
      sideAttachmentReach: 1.05,
    },
    {
      id: "flame",
      material: "glass",
      shape: "glassPane",
      position: [0, 0.45, 0.82],
      size: [0.32, 0.52, 0.32],
      color: litWindowColor,
      bearsLoad: false,
      sideAttachmentReach: 1.12,
      light: { position: [0, 0.45, 0.82], color: "#ff9d52", distance, intensity },
    },
  ]);
}

const wallTorch = mountedTorch("viking:wall-torch", "Wall-mounted torch", 18, 18.5);
const hallWallTorch = mountedTorch("viking:hall-wall-torch", "Great hall wall torch", 22, 21);

const tableLamp = prefab("viking:table-lamp", "Feast-table oil lamp", ["viking", "light", "lamp", "table"], [
  {
    id: "base",
    material: "steel",
    shape: "steelSheet",
    position: [0, 0.06, 0],
    size: [0.42, 0.12, 0.42],
    color: iron,
    bearsLoad: true,
    carriesAttachments: true,
    sideAttachmentReach: 0.42,
  },
  {
    id: "wick",
    material: "wood",
    shape: "plank",
    position: [0, 0.21, 0],
    size: [0.08, 0.28, 0.08],
    color: darkTimber,
    bearsLoad: true,
    carriesAttachments: true,
    sideAttachmentReach: 0.36,
  },
  {
    id: "flame",
    material: "glass",
    shape: "glassPane",
    position: [0, 0.43, 0],
    size: [0.22, 0.42, 0.22],
    color: litWindowColor,
    bearsLoad: false,
    sideAttachmentReach: 0.48,
    light: { position: [0, 0.46, 0], color: "#ffad5c", distance: 11.5, intensity: 11 },
  },
]);

const table = prefab("viking:feast-table", "Heavy feast table", ["viking", "furniture", "table"], [
  {
    id: "top:0", material: "wood", shape: "plank", position: [0, 1.02, -0.42], size: [3.8, 0.18, 0.78], color: timber,
    contactBoxes: [
      { position: [-1.35, 1.15, -0.22], size: [0.34, 0.18, 0.5] },
      { position: [1.35, 1.15, -0.22], size: [0.34, 0.18, 0.5] },
    ],
  },
  {
    id: "top:1", material: "wood", shape: "plank", position: [0, 1.02, 0.42], size: [3.8, 0.18, 0.78], color: freshTimber,
    contactBoxes: [
      { position: [-1.35, 1.15, 0.22], size: [0.34, 0.18, 0.5] },
      { position: [1.35, 1.15, 0.22], size: [0.34, 0.18, 0.5] },
    ],
  },
  { id: "leg:0", material: "wood", shape: "plank", position: [-1.35, 0.53, 0], size: [0.34, 1.06, 0.72], color: darkTimber },
  { id: "leg:1", material: "wood", shape: "plank", position: [1.35, 0.53, 0], size: [0.34, 1.06, 0.72], color: darkTimber },
]);

const bench = prefab("viking:bench", "Timber bench", ["viking", "furniture", "bench"], [
  {
    id: "seat", material: "wood", shape: "plank", position: [0, 0.58, 0], size: [3.4, 0.18, 0.55], color: timber,
    contactBoxes: [
      { position: [-1.15, 0.67, 0], size: [0.28, 0.18, 0.42] },
      { position: [1.15, 0.67, 0], size: [0.28, 0.18, 0.42] },
    ],
  },
  { id: "leg:0", material: "wood", shape: "plank", position: [-1.15, 0.29, 0], size: [0.28, 0.58, 0.42], color: darkTimber },
  { id: "leg:1", material: "wood", shape: "plank", position: [1.15, 0.29, 0], size: [0.28, 0.58, 0.42], color: darkTimber },
]);

const throne = prefab("viking:throne", "Jarl's carved throne", ["viking", "furniture", "throne"], [
  { id: "seat", material: "wood", shape: "plank", position: [0, 0.78, 0], size: [1.35, 0.2, 1.05], color: timber },
  { id: "back", material: "wood", shape: "panel", position: [0, 1.75, 0.43], size: [1.55, 2.15, 0.2], color: darkTimber },
  { id: "arm:0", material: "wood", shape: "plank", position: [-0.72, 1.1, 0], size: [0.18, 0.18, 1.05], color: freshTimber },
  { id: "arm:1", material: "wood", shape: "plank", position: [0.72, 1.1, 0], size: [0.18, 0.18, 1.05], color: freshTimber },
  { id: "leg:0", material: "wood", shape: "plank", position: [-0.53, 0.39, 0], size: [0.26, 0.78, 0.72], color: darkTimber },
  { id: "leg:1", material: "wood", shape: "plank", position: [0.53, 0.39, 0], size: [0.26, 0.78, 0.72], color: darkTimber },
  { id: "rune:0", material: "steel", shape: "steelSheet", position: [-0.35, 1.9, 0.56], size: [0.08, 0.72, 0.05], color: "#9b7b43", bearsLoad: false },
  { id: "rune:1", material: "steel", shape: "steelSheet", position: [0.35, 1.9, 0.56], size: [0.08, 0.72, 0.05], color: "#9b7b43", bearsLoad: false },
]);

const swordRackPieces: ScenePrefabPieceDefinition[] = [
  { id: "rack:base", material: "wood", shape: "plank", position: [0, 0.22, 0], size: [3.4, 0.24, 0.62], color: darkTimber },
  { id: "rack:rail", material: "wood", shape: "plank", position: [0, 1.35, 0], size: [3.4, 0.22, 0.4], color: timber },
  { id: "rack:post:0", material: "wood", shape: "plank", position: [-1.45, 0.79, 0], size: [0.22, 1.1, 0.3], color: darkTimber },
  { id: "rack:post:1", material: "wood", shape: "plank", position: [1.45, 0.79, 0], size: [0.22, 1.1, 0.3], color: darkTimber },
];
for (let index = 0; index < 6; index += 1) {
  const x = -1.25 + index * 0.5;
  swordRackPieces.push(
    { id: `sword:${index}:blade`, material: "steel", shape: "steelSheet", position: [x, 1.08, 0.05], size: [0.1, 1.75, 0.08], color: "#9da5a4", rotation: [0, 0, index % 2 === 0 ? -0.08 : 0.08] },
    { id: `sword:${index}:guard`, material: "steel", shape: "steelSheet", position: [x, 0.55, 0.05], size: [0.4, 0.08, 0.12], color: iron, bearsLoad: false },
    { id: `sword:${index}:grip`, material: "wood", shape: "plank", position: [x, 0.33, 0.05], size: [0.13, 0.44, 0.13], color: darkTimber },
  );
}
const swordRack = prefab("viking:sword-rack", "Sword rack", ["viking", "weapon", "storage"], swordRackPieces);

const laundry = prefab("viking:laundry", "Laundry line", ["viking", "cloth", "domestic"], [
  { id: "post:0", material: "wood", shape: "cylinder", position: [-3.2, 1.45, 0], size: [0.26, 2.9, 0.26], color: darkTimber },
  { id: "post:1", material: "wood", shape: "cylinder", position: [3.2, 1.45, 0], size: [0.26, 2.9, 0.26], color: darkTimber },
  {
    id: "line", material: "wood", shape: "plank", position: [0, 2.72, 0], size: [6.4, 0.1, 0.1], color: "#6b5944",
    carriesAttachments: true,
    attachmentSupportMode: "cable",
    sideAttachmentReach: 0.42,
    contactBoxes: [
      { position: [-3.07, 2.8, 0], size: [0.26, 0.16, 0.26] },
      { position: [3.07, 2.8, 0], size: [0.26, 0.16, 0.26] },
      { position: [0, 2.68, 0], size: [6.14, 0.14, 0.14] },
    ],
  },
  { id: "cloth:0", material: "cloth", shape: "panel", position: [-2.05, 2.17, 0], size: [1.25, 1.05, 0.06], color: "#b6a47f", colorSlot: "clothA", bearsLoad: false },
  { id: "cloth:1", material: "cloth", shape: "panel", position: [-0.55, 2.05, 0], size: [1.12, 1.3, 0.06], color: "#84433a", colorSlot: "clothB", bearsLoad: false, rotation: [0, 0, 0.05] },
  { id: "cloth:2", material: "cloth", shape: "panel", position: [0.85, 2.22, 0], size: [1.35, 0.96, 0.06], color: "#68766b", colorSlot: "clothC", bearsLoad: false, rotation: [0, 0, -0.04] },
  { id: "cloth:3", material: "cloth", shape: "panel", position: [2.25, 2.12, 0], size: [1.0, 1.16, 0.06], color: "#c1b89d", colorSlot: "clothD", bearsLoad: false },
]);

const hearth = prefab("viking:hearth", "Stone hearth", ["viking", "hearth", "light"], [
  { id: "stone:0", material: "stone", shape: "stoneBlock", position: [-0.75, 0.28, 0], size: [0.72, 0.52, 0.72], color: fieldStone },
  { id: "stone:1", material: "stone", shape: "stoneBlock", position: [0.75, 0.28, 0], size: [0.72, 0.52, 0.72], color: "#817e73" },
  { id: "stone:2", material: "stone", shape: "stoneBlock", position: [0, 0.28, -0.75], size: [0.72, 0.52, 0.72], color: "#65645f" },
  { id: "stone:3", material: "stone", shape: "stoneBlock", position: [0, 0.28, 0.75], size: [0.72, 0.52, 0.72], color: fieldStone },
  { id: "log:0", material: "wood", shape: "cylinder", position: [0, 0.5, 0], rotation: [0, 0, Math.PI / 2], size: [0.3, 1.4, 0.3], color: darkTimber },
  { id: "ember", material: "glass", shape: "glassPane", position: [0, 0.54, 0], size: [0.75, 0.28, 0.75], color: litWindowColor, bearsLoad: false, light: { position: [0, 0.62, 0], color: "#ff843d", distance: 14, intensity: 8.8 } },
]);

const mushroom = prefab("viking:mushrooms", "Mushroom cluster", ["viking", "growth", "fungus"], [
  { id: "stem:0", material: "foliage", shape: "plank", position: [-0.18, 0.2, 0], size: [0.09, 0.4, 0.09], color: "#c6bda4", bearsLoad: true, carriesAttachments: true },
  { id: "cap:0", material: "foliage", shape: "panel", position: [-0.18, 0.42, 0], size: [0.4, 0.12, 0.4], color: "#8e4936", bearsLoad: false },
  { id: "stem:1", material: "foliage", shape: "plank", position: [0.2, 0.14, 0.08], size: [0.07, 0.28, 0.07], color: "#d2c8ad", bearsLoad: true, carriesAttachments: true },
  { id: "cap:1", material: "foliage", shape: "panel", position: [0.2, 0.3, 0.08], size: [0.3, 0.1, 0.3], color: "#b07b49", bearsLoad: false },
]);

const gateLeaf = prefab("viking:gate-leaf", "Timber gate leaf", ["viking", "gate", "hinged"], [
  ...Array.from({ length: 5 }, (_, index): ScenePrefabPieceDefinition => ({
    id: `board:${index}`,
    material: "wood",
    shape: "plank",
    position: [-1.2 + index * 0.6, 1.65, 0],
    size: [0.55, 3.3, 0.22],
    color: index % 2 === 0 ? timber : darkTimber,
  })),
  { id: "brace:0", material: "wood", shape: "plank", position: [0, 1.8, 0.15], size: [3.15, 0.2, 0.18], color: freshTimber, rotation: [0, 0, 0.45], sideAttachmentReach: 0.34 },
  { id: "brace:1", material: "wood", shape: "plank", position: [0, 1.8, 0.15], size: [3.15, 0.2, 0.18], color: freshTimber, rotation: [0, 0, -0.45], sideAttachmentReach: 0.34 },
]);


// --- Domestic furnishings ---------------------------------------------------
// Every piece either sits on the floor or stacks squarely on the one beneath,
// so a furnished house still starts with zero unsupported bodies. Cloth pieces
// (bedding, warp, hangings) also pick up the wind animation.
const fur = "#6c5a44";
const clay = "#8a6a4e";
const linen = "#b3a684";

const bed = furnishing("viking:bed", "Sleeping bench", ["viking", "furniture", "bed"], [
  { id: "frame", material: "wood", shape: "plank", position: [0, 0.16, 0], size: [2.0, 0.32, 0.96], color: darkTimber },
  { id: "head", material: "wood", shape: "plank", position: [-0.93, 0.6, 0], size: [0.14, 0.6, 0.96], color: timber },
  { id: "mattress", material: "cloth", shape: "panel", position: [0.05, 0.37, 0], size: [1.72, 0.12, 0.84], color: linen, colorSlot: "bedding", bearsLoad: false },
  { id: "fur", material: "cloth", shape: "panel", position: [0.3, 0.46, 0], size: [0.98, 0.08, 0.86], color: fur, colorSlot: "fur", bearsLoad: false },
  { id: "pillow", material: "cloth", shape: "panel", position: [-0.72, 0.5, 0], size: [0.42, 0.14, 0.64], color: "#c3b590", bearsLoad: false },
]);

const chest = furnishing("viking:chest", "Iron-bound chest", ["viking", "furniture", "storage"], [
  { id: "body", material: "wood", shape: "plank", position: [0, 0.23, 0], size: [0.86, 0.46, 0.52], color: timber, carriesAttachments: true },
  { id: "lid", material: "wood", shape: "plank", position: [0, 0.52, 0], size: [0.9, 0.12, 0.56], color: darkTimber },
  { id: "band:0", material: "steel", shape: "steelSheet", position: [-0.24, 0.34, 0.28], size: [0.09, 0.5, 0.05], color: iron, bearsLoad: false, sideAttachmentReach: 0.28 },
  { id: "band:1", material: "steel", shape: "steelSheet", position: [0.24, 0.34, 0.28], size: [0.09, 0.5, 0.05], color: iron, bearsLoad: false, sideAttachmentReach: 0.28 },
]);

const cupboard = furnishing("viking:cupboard", "Kitchen cupboard", ["viking", "furniture", "storage"], [
  { id: "cabinet", material: "wood", shape: "plank", position: [0, 0.29, 0], size: [1.4, 0.58, 0.46], color: timber, carriesAttachments: true },
  { id: "end:0", material: "wood", shape: "plank", position: [-0.62, 0.82, 0], size: [0.12, 0.5, 0.44], color: darkTimber },
  { id: "end:1", material: "wood", shape: "plank", position: [0.62, 0.82, 0], size: [0.12, 0.5, 0.44], color: darkTimber },
  { id: "shelf", material: "wood", shape: "plank", position: [0, 1.09, 0], size: [1.5, 0.08, 0.48], color: freshTimber },
  { id: "pot:0", material: "steel", shape: "steelSheet", position: [-0.34, 0.68, 0.02], size: [0.3, 0.24, 0.3], color: "#4a4033", bearsLoad: false },
  { id: "bowl:0", material: "wood", shape: "plank", position: [0.28, 0.66, 0.03], size: [0.34, 0.18, 0.34], color: clay, bearsLoad: false },
  { id: "jar:0", material: "wood", shape: "plank", position: [-0.35, 1.24, 0.0], size: [0.24, 0.28, 0.24], color: clay, bearsLoad: false },
  { id: "jar:1", material: "wood", shape: "plank", position: [0.32, 1.25, 0.0], size: [0.22, 0.3, 0.22], color: "#75563b", bearsLoad: false },
]);

const cauldron = furnishing("viking:cauldron", "Cooking cauldron", ["viking", "furniture", "hearth", "light"], [
  ...[0, 1, 2].map((leg): ScenePrefabPieceDefinition => {
    const angle = (leg / 3) * Math.PI * 2;
    return {
      id: `leg:${leg}`,
      material: "wood",
      shape: "plank",
      position: [Math.cos(angle) * 0.34, 0.62, Math.sin(angle) * 0.34],
      rotation: [Math.cos(angle) * 0.32, 0, -Math.sin(angle) * 0.32],
      size: [0.08, 1.3, 0.08],
      color: darkTimber,
    };
  }),
  { id: "pot", material: "steel", shape: "steelSheet", position: [0, 0.36, 0], size: [0.74, 0.56, 0.74], color: "#33302b" },
  { id: "rim", material: "steel", shape: "steelSheet", position: [0, 0.64, 0], size: [0.8, 0.1, 0.8], color: iron, bearsLoad: false },
  { id: "embers", material: "glass", shape: "glassPane", position: [0, 0.12, 0], size: [0.6, 0.16, 0.6], color: litWindowColor, bearsLoad: false, light: { position: [0, 0.2, 0], color: "#ff8a3c", distance: 8, intensity: 5.4 } },
]);

const loom = furnishing("viking:loom", "Warp-weighted loom", ["viking", "furniture", "craft", "weaver"], [
  { id: "post:0", material: "wood", shape: "plank", position: [-0.82, 1.15, 0], size: [0.1, 2.3, 0.1], color: darkTimber, carriesAttachments: true },
  { id: "post:1", material: "wood", shape: "plank", position: [0.82, 1.15, 0], size: [0.1, 2.3, 0.1], color: darkTimber, carriesAttachments: true },
  { id: "beam", material: "wood", shape: "plank", position: [0, 2.24, 0], size: [1.9, 0.12, 0.12], color: timber },
  { id: "warp", material: "cloth", shape: "panel", position: [0, 1.4, 0.03], size: [1.5, 1.6, 0.03], color: "#a99a76", colorSlot: "warp", bearsLoad: false, sideAttachmentReach: 0.3 },
  { id: "cloth-beam", material: "wood", shape: "plank", position: [0, 0.58, 0.02], size: [1.6, 0.1, 0.1], color: freshTimber, bearsLoad: false, sideAttachmentReach: 0.3 },
]);

const anvil = furnishing("viking:anvil", "Smith's anvil", ["viking", "furniture", "craft", "smith"], [
  { id: "stump", material: "wood", shape: "cylinder", position: [0, 0.35, 0], size: [0.62, 0.7, 0.62], color: "#4a3526" },
  { id: "anvil", material: "steel", shape: "steelSheet", position: [0, 0.83, 0], size: [0.5, 0.24, 0.28], color: "#3b4042" },
  { id: "horn", material: "steel", shape: "steelSheet", position: [0.34, 0.86, 0], size: [0.3, 0.16, 0.2], color: "#33383a", bearsLoad: false },
  { id: "hammer-head", material: "steel", shape: "steelSheet", position: [-0.15, 0.99, 0.06], size: [0.22, 0.12, 0.12], color: iron, bearsLoad: false },
  { id: "hammer-haft", material: "wood", shape: "plank", position: [-0.15, 0.83, 0.06], size: [0.06, 0.34, 0.06], color: timber, bearsLoad: false },
]);

const stool = furnishing("viking:stool", "Three-legged stool", ["viking", "furniture", "seat"], [
  { id: "seat", material: "wood", shape: "cylinder", position: [0, 0.5, 0], size: [0.44, 0.1, 0.44], color: timber },
  ...[0, 1, 2].map((leg): ScenePrefabPieceDefinition => {
    const angle = (leg / 3) * Math.PI * 2 + 0.5;
    return {
      id: `leg:${leg}`,
      material: "wood",
      shape: "plank",
      position: [Math.cos(angle) * 0.15, 0.24, Math.sin(angle) * 0.15],
      size: [0.07, 0.48, 0.07],
      color: darkTimber,
    };
  }),
]);

const baskets = furnishing("viking:baskets", "Woven baskets", ["viking", "storage", "basket"], [
  { id: "big", material: "wood", shape: "cylinder", position: [0, 0.32, 0], size: [0.62, 0.64, 0.62], color: "#7a6034" },
  { id: "big-rim", material: "wood", shape: "cylinder", position: [0, 0.62, 0], size: [0.68, 0.08, 0.68], color: "#5c481f", bearsLoad: false },
  { id: "small", material: "wood", shape: "cylinder", position: [0.62, 0.22, 0.28], size: [0.46, 0.44, 0.46], color: "#836a3d" },
  { id: "grain", material: "foliage", shape: "panel", position: [0, 0.66, 0], size: [0.5, 0.06, 0.5], color: "#c7b06a", bearsLoad: false },
]);

const toolWall = furnishing("viking:tool-wall", "Hanging tools and herbs", ["viking", "craft", "mounted"], [
  { id: "rail", material: "wood", shape: "plank", position: [0, 1.9, 0], size: [1.8, 0.12, 0.12], color: darkTimber, carriesAttachments: true, sideAttachmentReach: 0.8 },
  { id: "herb:0", material: "foliage", shape: "panel", position: [-0.6, 1.55, 0.02], size: [0.26, 0.6, 0.05], color: "#5f6d3f", bearsLoad: false, sideAttachmentReach: 0.6 },
  { id: "herb:1", material: "foliage", shape: "panel", position: [-0.2, 1.5, 0.02], size: [0.24, 0.7, 0.05], color: "#4c5d38", bearsLoad: false, sideAttachmentReach: 0.6 },
  { id: "axe-haft", material: "wood", shape: "plank", position: [0.35, 1.5, 0.03], size: [0.06, 0.78, 0.06], color: timber, bearsLoad: false, sideAttachmentReach: 0.5 },
  { id: "axe-head", material: "steel", shape: "steelSheet", position: [0.35, 1.82, 0.05], size: [0.22, 0.2, 0.06], color: iron, bearsLoad: false, sideAttachmentReach: 0.5 },
  { id: "coil", material: "cloth", shape: "panel", position: [0.7, 1.55, 0.02], size: [0.3, 0.5, 0.06], color: "#8a7a55", colorSlot: "coil", bearsLoad: false, sideAttachmentReach: 0.6 },
]);

const prefabs = [
  verticalLog("viking:post:3", 3, 0.28),
  verticalLog("viking:palisade", 4.8, 0.41, true),
  verticalLog("viking:gate-post", 6.6, 0.52, true),
  horizontalLog("viking:log:4", 4),
  horizontalLog("viking:log:8", 8),
  horizontalLog("viking:log:12", 12),
  longhouse("viking:house:small", 7.4, 10.5, 3.0),
  longhouse("viking:house:long", 8.4, 14.5, 3.4),
  longhouse("viking:hall", 15, 29, 5.2, true),
  shield,
  barrel,
  torch,
  wallTorch,
  hallWallTorch,
  tableLamp,
  table,
  bench,
  throne,
  swordRack,
  laundry,
  hearth,
  mushroom,
  gateLeaf,
  bed,
  chest,
  cupboard,
  cauldron,
  loom,
  anvil,
  stool,
  baskets,
  toolWall,
] as const;

export const vikingPrefabLibrary: ScenePrefabLibrary = new Map(
  prefabs.map((definition) => [definition.id, definition]),
);

export const vikingPrefabDefinitions = prefabs;
