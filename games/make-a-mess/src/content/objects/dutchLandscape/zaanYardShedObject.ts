import type {
  ObjectLabModel,
  ObjectLabPart,
  ObjectMaterialId,
  ObjectPoint,
} from "../dutchWindmills/objectModel.ts";

type ZaanYardShedLabModel = ObjectLabModel & {
  materialOverrides: Readonly<Record<string, Readonly<Record<string, number>>>>;
};

export const ZAAN_YARD_SHED_WIDTH = 4.6;
export const ZAAN_YARD_SHED_DEPTH = 6.4;
export const ZAAN_YARD_SHED_PLINTH_HEIGHT = 0.36;
export const ZAAN_YARD_SHED_EAVE_Y = 2.45;
export const ZAAN_YARD_SHED_RIDGE_Y = 4.15;
export const ZAAN_YARD_SHED_ROOF_WIDTH = 5.1;
export const ZAAN_YARD_SHED_ROOF_DEPTH = 6.9;
export const ZAAN_YARD_SHED_DOOR_WIDTH = 2.0;
export const ZAAN_YARD_SHED_DOOR_HEIGHT = 2.1;
export const ZAAN_YARD_SHED_WINDOW_WIDTH = 0.9;
export const ZAAN_YARD_SHED_WINDOW_HEIGHT = 1.05;
export const ZAAN_YARD_SHED_HOIST_PROJECTION = 0.65;
export const ZAAN_YARD_SHED_CLADDING_PITCH = 0.17;

const point = (x: number, y: number, z: number): ObjectPoint => [x, y, z];
const parts: ObjectLabPart[] = [];

const addBox = (
  id: string,
  group: string,
  material: ObjectMaterialId,
  center: ObjectPoint,
  size: ObjectPoint,
  rotation?: ObjectPoint,
) => parts.push({ kind: "box", id, group, material, center, size, rotation });

const addBeam = (
  id: string,
  group: string,
  material: ObjectMaterialId,
  from: ObjectPoint,
  to: ObjectPoint,
  width: number,
  depth = width,
) => parts.push({ kind: "beam", id, group, material, from, to, width, depth });

const addCylinder = (
  id: string,
  group: string,
  material: ObjectMaterialId,
  from: ObjectPoint,
  to: ObjectPoint,
  radius: number,
  radialSegments = 10,
) => parts.push({ kind: "cylinder", id, group, material, from, to, radius, radialSegments });

const addMesh = (
  id: string,
  group: string,
  material: ObjectMaterialId,
  vertices: ObjectPoint[],
  triangles: Array<readonly [number, number, number]>,
) => parts.push({ kind: "mesh", id, group, material, vertices, triangles });

type AxisBox = { center: ObjectPoint; size: ObjectPoint };

const addBatchedBoxes = (
  id: string,
  group: string,
  material: ObjectMaterialId,
  boxes: readonly AxisBox[],
) => {
  const vertices: ObjectPoint[] = [];
  const triangles: Array<readonly [number, number, number]> = [];
  const faces: Array<readonly [number, number, number]> = [
    [0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7],
    [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5],
    [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7],
  ];
  for (const { center, size } of boxes) {
    const start = vertices.length;
    const [cx, cy, cz] = center;
    const [hx, hy, hz] = [size[0] / 2, size[1] / 2, size[2] / 2];
    vertices.push(
      point(cx - hx, cy - hy, cz - hz), point(cx + hx, cy - hy, cz - hz),
      point(cx + hx, cy + hy, cz - hz), point(cx - hx, cy + hy, cz - hz),
      point(cx - hx, cy - hy, cz + hz), point(cx + hx, cy - hy, cz + hz),
      point(cx + hx, cy + hy, cz + hz), point(cx - hx, cy + hy, cz + hz),
    );
    triangles.push(...faces.map(([a, b, c]) => [start + a, start + b, start + c] as const));
  }
  addMesh(id, group, material, vertices, triangles);
};

const addBatchedRoofTiles = (
  id: string,
  side: number,
  course: number,
  roofRun: number,
  roofOuterY: number,
  roofSlopeLength: number,
) => {
  const tileCount = 20;
  const tileGap = 0.012;
  const tileWidth = ZAAN_YARD_SHED_ROOF_DEPTH / tileCount;
  const tileLength = roofSlopeLength / 10 + 0.05;
  const tileThickness = 0.045;
  const roofPitch = Math.atan2(4.05 - roofOuterY, roofRun);
  const cos = Math.cos(roofPitch);
  const sin = Math.sin(roofPitch);
  const t = (course + 0.5) / 10;
  const centreX = side * roofRun * t;
  const centreY = 4.05 + (roofOuterY - 4.05) * t + 0.018;
  const vertices: ObjectPoint[] = [];
  const triangles: Array<readonly [number, number, number]> = [];
  const faces: Array<readonly [number, number, number]> = [
    [0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7],
    [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5],
    [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7],
  ];

  const appendOrientedBox = (
    localCentreY: number,
    localCentreZ: number,
    sizeX: number,
    sizeY: number,
    sizeZ: number,
  ) => {
    const start = vertices.length;
    for (const localY of [localCentreY - sizeY / 2, localCentreY + sizeY / 2]) {
      for (const [localX, localZ] of [
        [-sizeX / 2, localCentreZ - sizeZ / 2],
        [sizeX / 2, localCentreZ - sizeZ / 2],
        [sizeX / 2, localCentreZ + sizeZ / 2],
        [-sizeX / 2, localCentreZ + sizeZ / 2],
      ] as const) {
        vertices.push(point(
          centreX + side * (localX * cos + localY * sin),
          centreY - localX * sin + localY * cos,
          localZ,
        ));
      }
    }
    triangles.push(...faces.map(([a, b, c]) => side > 0
      ? [start + a, start + c, start + b] as const
      : [start + a, start + b, start + c] as const));
  };

  for (let column = 0; column < tileCount; column += 1) {
    const centreZ = -ZAAN_YARD_SHED_ROOF_DEPTH / 2 + tileWidth * (column + 0.5);
    const clearWidth = tileWidth - tileGap;
    appendOrientedBox(0, centreZ, tileLength, tileThickness, clearWidth);
    appendOrientedBox(tileThickness / 2 + 0.015, centreZ - clearWidth / 2 + 0.052, tileLength * 0.96, 0.03, 0.085);
  }
  addMesh(id, roofSkinGroup, "roof-warm", vertices, triangles);
};

const addForgedRing = (id: string, center: ObjectPoint, outerRadius: number, tubeRadius: number) => {
  const segments = 10;
  const vertices: ObjectPoint[] = [];
  const triangles: Array<readonly [number, number, number]> = [];
  for (const depth of [-tubeRadius, tubeRadius]) {
    for (const radius of [outerRadius, outerRadius - tubeRadius * 2]) {
      for (let index = 0; index < segments; index += 1) {
        const angle = index / segments * Math.PI * 2;
        vertices.push(point(
          center[0] + Math.cos(angle) * radius,
          center[1] + Math.sin(angle) * radius,
          center[2] + depth,
        ));
      }
    }
  }
  const at = (depth: number, ring: number, index: number) => depth * segments * 2 + ring * segments + index;
  for (let index = 0; index < segments; index += 1) {
    const next = (index + 1) % segments;
    triangles.push(
      [at(0, 0, index), at(0, 0, next), at(1, 0, next)], [at(0, 0, index), at(1, 0, next), at(1, 0, index)],
      [at(0, 1, index), at(1, 1, next), at(0, 1, next)], [at(0, 1, index), at(1, 1, index), at(1, 1, next)],
      [at(0, 0, index), at(0, 1, next), at(0, 0, next)], [at(0, 0, index), at(0, 1, index), at(0, 1, next)],
      [at(1, 0, index), at(1, 0, next), at(1, 1, next)], [at(1, 0, index), at(1, 1, next), at(1, 1, index)],
    );
  }
  addMesh(id, "yard-shed-hoist", "metal", vertices, triangles);
};

const foundationGroup = "yard-shed-foundation";
const frameGroup = "yard-shed-frame";
const roofFrameGroup = "yard-shed-roof-frame";
const claddingGroup = "yard-shed-cladding";
const roofSkinGroup = "yard-shed-roof-skin";
const openingGroup = "yard-shed-openings";
const trimGroup = "yard-shed-trim";
const hoistGroup = "yard-shed-hoist";
const allGroups = [foundationGroup, frameGroup, roofFrameGroup, claddingGroup, roofSkinGroup, openingGroup, trimGroup, hoistGroup];

// Brick ring and timber floor keep the frame clear of wet ground.
addBox("yard-shed-plinth-front", foundationGroup, "brick", point(0, 0.18, 3.075), point(4.6, 0.36, 0.25));
addBox("yard-shed-plinth-rear", foundationGroup, "brick", point(0, 0.18, -3.075), point(4.6, 0.36, 0.25));
for (const side of [-1, 1]) {
  addBox(`yard-shed-plinth-side:${side}`, foundationGroup, "brick", point(side * 2.175, 0.18, 0), point(0.25, 0.36, 5.9));
}

// Four visible brick courses keep the masonry base legible instead of reducing it to a coloured band.
for (const end of [-1, 1]) {
  const boxes: AxisBox[] = [];
  for (let row = 0; row < 4; row += 1) {
    const offset = row % 2 === 0 ? 0 : 0.11;
    for (let column = -11; column <= 11; column += 1) {
      const centreX = column * 0.22 + offset;
      if (Math.abs(centreX) > 2.22) continue;
      boxes.push({ center: point(centreX, 0.045 + row * 0.083, end * 3.206), size: point(0.205, 0.069, 0.022) });
    }
  }
  addBatchedBoxes(`yard-shed-plinth-brick-face:${end}`, foundationGroup, "brick", boxes);
}
for (const side of [-1, 1]) {
  const boxes: AxisBox[] = [];
  for (let row = 0; row < 4; row += 1) {
    const offset = row % 2 === 0 ? 0 : 0.11;
    for (let column = -14; column <= 14; column += 1) {
      const centreZ = column * 0.22 + offset;
      if (Math.abs(centreZ) > 2.94) continue;
      boxes.push({ center: point(side * 2.306, 0.045 + row * 0.083, centreZ), size: point(0.022, 0.069, 0.205) });
    }
  }
  addBatchedBoxes(`yard-shed-plinth-brick-side:${side}`, foundationGroup, "brick", boxes);
}
addBox("yard-shed-floor", frameGroup, "timber-mid", point(0, 0.53, 0), point(4.3, 0.06, 6.1));
for (const side of [-1, 1]) {
  addBox(`yard-shed-sill-side:${side}`, frameGroup, "timber-dark", point(side * 2.15, 0.43, 0), point(0.14, 0.14, 6.0));
}
for (const end of [-1, 1]) {
  addBox(`yard-shed-sill-end:${end}`, frameGroup, "timber-dark", point(0, 0.43, end * 2.93), point(4.16, 0.14, 0.14));
}
for (const z of [-2.4, -0.8, 0.8, 2.4]) {
  addBeam(`yard-shed-floor-joist:${z}`, frameGroup, "timber-mid", point(-2.08, 0.48, z), point(2.08, 0.48, z), 0.12, 0.14);
}

// Three yokes make six posts; straight knees and ties follow the measured Zaan warehouse system.
const yokeZs = [-2.9, 0, 2.9] as const;
for (const [index, z] of yokeZs.entries()) {
  for (const side of [-1, 1]) {
    addBeam(`yard-shed-post:${index}:${side}`, frameGroup, "timber-dark", point(side * 2.15, 0.5, z), point(side * 2.15, 2.29, z), 0.14, 0.14);
    addBeam(`yard-shed-knee:${index}:${side}`, frameGroup, "timber-dark", point(side * 2.08, 1.72, z), point(side * 1.42, 2.29, z), 0.10, 0.10);
  }
  addBox(`yard-shed-yoke-tie:${index}`, frameGroup, "timber-dark", point(0, 2.37, z), point(4.3, 0.16, 0.12));
}
for (const side of [-1, 1]) {
  addBox(`yard-shed-wall-plate:${side}`, frameGroup, "timber-dark", point(side * 2.15, 2.37, 0), point(0.12, 0.16, 6.2));
}

const rafterZs = [-2.9, -0.97, 0.97, 2.9] as const;
for (const [index, z] of rafterZs.entries()) {
  for (const side of [-1, 1]) {
    addBeam(
      `yard-shed-rafter:${index}:${side}`,
      roofFrameGroup,
      "timber-dark",
      point(side * 2.3, 2.35, z),
      point(0, 3.89, z),
      0.10,
      0.14,
    );
  }
}
addBeam("yard-shed-ridge-beam", roofFrameGroup, "timber-dark", point(0, 3.89, -3.1), point(0, 3.89, 3.1), 0.14, 0.16);
for (const side of [-1, 1]) {
  addBeam(`yard-shed-purlin:${side}`, roofFrameGroup, "timber-mid", point(side * 1.15, 3.10, -3.1), point(side * 1.15, 3.10, 3.1), 0.12, 0.14);
}

// Overlapping vertical boards are batched per face but retain separate closed board volumes.
const boardWidth = 0.20;
const boardThickness = 0.022;
const wallBottom = 0.36;
const wallTop = ZAAN_YARD_SHED_EAVE_Y;
const sideWindow = { z0: 0.15, z1: 1.05, y0: 1.0, y1: 2.05 };
for (const side of [-1, 1]) {
  const boxes: AxisBox[] = [];
  for (let index = 0; index < 38; index += 1) {
    const z = -3.10 + index * ZAAN_YARD_SHED_CLADDING_PITCH;
    const crossesWindow = side === 1 && z + boardWidth / 2 > sideWindow.z0 && z - boardWidth / 2 < sideWindow.z1;
    const spans = crossesWindow
      ? [[wallBottom, sideWindow.y0], [sideWindow.y1, wallTop]] as const
      : [[wallBottom, wallTop]] as const;
    for (const [y0, y1] of spans) {
      boxes.push({ center: point(side * 2.311, (y0 + y1) / 2, z), size: point(boardThickness, y1 - y0, boardWidth) });
    }
  }
  addBatchedBoxes(`yard-shed-side-cladding:${side}`, claddingGroup, "timber-dark", boxes);
}

const frontBoards: AxisBox[] = [];
const rearBoards: AxisBox[] = [];
for (let index = 0; index < 27; index += 1) {
  const x = -2.20 + index * ZAAN_YARD_SHED_CLADDING_PITCH;
  if (x + boardWidth / 2 <= -1 || x - boardWidth / 2 >= 1) {
    frontBoards.push({ center: point(x, (wallBottom + wallTop) / 2, 3.211), size: point(boardWidth, wallTop - wallBottom, boardThickness) });
  }
  rearBoards.push({ center: point(x, (wallBottom + wallTop) / 2, -3.211), size: point(boardWidth, wallTop - wallBottom, boardThickness) });
}
addBatchedBoxes("yard-shed-front-cladding", claddingGroup, "timber-dark", frontBoards);
addBatchedBoxes("yard-shed-rear-cladding", claddingGroup, "timber-dark", rearBoards);

for (const end of [-1, 1]) {
  const boxes: AxisBox[] = [];
  for (let index = 0; index < 27; index += 1) {
    const x = -2.20 + index * ZAAN_YARD_SHED_CLADDING_PITCH;
    const top = 4.05 - Math.abs(x) / 2.3 * 1.60;
    if (top <= wallTop) continue;
    boxes.push({ center: point(x, (wallTop + top) / 2, end * 3.212), size: point(boardWidth, top - wallTop, boardThickness) });
  }
  addBatchedBoxes(`yard-shed-gable-cladding:${end}`, claddingGroup, "timber-dark", boxes);
}

// Closed boarded roof with twenty rows of individually separated clay tiles.
const roofRun = 2.505;
const roofOuterY = 4.05 - roofRun * (1.60 / 2.3);
const roofPitch = Math.atan2(4.05 - roofOuterY, roofRun);
const roofSlopeLength = Math.hypot(roofRun, 4.05 - roofOuterY);
for (const side of [-1, 1]) {
  addBox(
    `yard-shed-roof-boarded-plane:${side}`,
    roofSkinGroup,
    "timber-dark",
    point(side * roofRun / 2, (4.05 + roofOuterY) / 2 - 0.025, 0),
    point(roofSlopeLength, 0.05, ZAAN_YARD_SHED_ROOF_DEPTH),
    point(0, 0, -side * roofPitch),
  );
  for (let course = 0; course < 10; course += 1) {
    addBatchedRoofTiles(`yard-shed-roof-tile-course:${side}:${course}`, side, course, roofRun, roofOuterY, roofSlopeLength);
  }
  addBeam(`yard-shed-eave-fascia:${side}`, trimGroup, "paint-light", point(side * 2.495, roofOuterY, -3.45), point(side * 2.495, roofOuterY, 3.45), 0.11, 0.12);
}
addBeam("yard-shed-ridge-cap", roofSkinGroup, "roof-warm", point(0, 4.07, -3.45), point(0, 4.07, 3.45), 0.16, 0.16);
for (const end of [-1, 1]) {
  for (const side of [-1, 1]) {
    addBeam(`yard-shed-gable-fascia:${end}:${side}`, trimGroup, "paint-light", point(side * 2.495, roofOuterY, end * 3.39), point(0, 4.09, end * 3.39), 0.11, 0.12);
  }
}

// White double loading doors close a real two-metre opening in the front cladding.
for (const side of [-1, 1]) {
  const boxes: AxisBox[] = [];
  for (let board = 0; board < 5; board += 1) {
    const x = side * 0.5 + (board - 2) * 0.198;
    boxes.push({ center: point(x, 1.41, 3.235), size: point(0.194, ZAAN_YARD_SHED_DOOR_HEIGHT, 0.055) });
  }
  addBatchedBoxes(`yard-shed-door-leaf:${side}`, openingGroup, "paint-light", boxes);
  addBeam(`yard-shed-door-brace:${side}`, openingGroup, "paint-light", point(side * 0.92, 0.52, 3.275), point(side * 0.08, 2.30, 3.275), 0.09, 0.06);
  for (const y of [0.82, 2.02]) {
    addBox(`yard-shed-hinge-strap:${side}:${y}`, openingGroup, "metal", point(side * 0.79, y, 3.31), point(0.42, 0.055, 0.035));
    addCylinder(`yard-shed-hinge-pin:${side}:${y}`, openingGroup, "metal", point(side * 1.025, y - 0.055, 3.31), point(side * 1.025, y + 0.055, 3.31), 0.022, 8);
  }
}
for (const x of [-1.06, 1.06]) addBeam(`yard-shed-door-jamb:${x}`, trimGroup, "paint-light", point(x, 0.36, 3.30), point(x, 2.48, 3.30), 0.10, 0.10);
addBeam("yard-shed-door-head", trimGroup, "paint-light", point(-1.06, 2.48, 3.30), point(1.06, 2.48, 3.30), 0.10, 0.10);
addBeam("yard-shed-door-centre-stop", trimGroup, "paint-light", point(0, 0.36, 3.30), point(0, 2.46, 3.30), 0.07, 0.07);

// One real glazed side opening with a 2 × 3 light grid.
const windowX = 2.325;
const windowCentreY = (sideWindow.y0 + sideWindow.y1) / 2;
const windowCentreZ = (sideWindow.z0 + sideWindow.z1) / 2;
addBox("yard-shed-window-glazing", openingGroup, "glazing", point(windowX, windowCentreY, windowCentreZ), point(0.025, ZAAN_YARD_SHED_WINDOW_HEIGHT, ZAAN_YARD_SHED_WINDOW_WIDTH));
for (const z of [sideWindow.z0 - 0.055, sideWindow.z1 + 0.055]) addBeam(`yard-shed-window-jamb:${z}`, trimGroup, "paint-light", point(windowX + 0.03, sideWindow.y0 - 0.055, z), point(windowX + 0.03, sideWindow.y1 + 0.055, z), 0.10, 0.08);
for (const y of [sideWindow.y0 - 0.055, sideWindow.y1 + 0.055]) addBeam(`yard-shed-window-rail:${y}`, trimGroup, "paint-light", point(windowX + 0.03, y, sideWindow.z0 - 0.055), point(windowX + 0.03, y, sideWindow.z1 + 0.055), 0.10, 0.08);
addBeam("yard-shed-window-mullion", trimGroup, "paint-light", point(windowX + 0.045, sideWindow.y0, windowCentreZ), point(windowX + 0.045, sideWindow.y1, windowCentreZ), 0.045, 0.04);
for (const row of [1, 2]) {
  const y = sideWindow.y0 + row / 3 * ZAAN_YARD_SHED_WINDOW_HEIGHT;
  addBeam(`yard-shed-window-transom:${row}`, trimGroup, "paint-light", point(windowX + 0.045, y, sideWindow.z0), point(windowX + 0.045, y, sideWindow.z1), 0.045, 0.04);
}

for (const x of [-2.33, 2.33]) {
  for (const z of [-3.23, 3.23]) {
    addBeam(`yard-shed-corner-trim:${x}:${z}`, trimGroup, "paint-light", point(x, 0.36, z), point(x, 2.46, z), 0.11, 0.11);
  }
}

// The defining cargo joint continues into the frame and terminates in a forged chain and hook.
addBeam("yard-shed-hoist-beam", hoistGroup, "timber-mid", point(0, 3.32, 2.60), point(0, 3.32, 3.85), 0.16, 0.14);
addBeam("yard-shed-hoist-brace", hoistGroup, "timber-dark", point(0, 2.86, 2.86), point(0, 3.26, 3.48), 0.09, 0.09);
addBox("yard-shed-hoist-wall-block", hoistGroup, "timber-dark", point(0, 3.27, 3.18), point(0.34, 0.34, 0.16));
addCylinder("yard-shed-hoist-eye-shank", hoistGroup, "metal", point(0, 3.33, 3.84), point(0, 3.125, 3.84), 0.018, 10);
for (const [index, y] of [3.05, 2.91, 2.77].entries()) addForgedRing(`yard-shed-hoist-chain:${index}`, point(0, y, 3.84), 0.075, 0.014);
const hookPoints = [
  point(0, 2.71, 3.84), point(0, 2.50, 3.84), point(0.08, 2.39, 3.84),
  point(0.12, 2.27, 3.84), point(0.06, 2.19, 3.84), point(-0.02, 2.24, 3.84),
] as const;
for (let index = 1; index < hookPoints.length; index += 1) {
  addCylinder(`yard-shed-hoist-hook:${index - 1}`, hoistGroup, "metal", hookPoints[index - 1], hookPoints[index], 0.018, 8);
}

const exteriorPairCamera = {
  projection: "perspective" as const,
  position: point(-8.2, 5.7, 9.4),
  target: point(0, 2.0, 0),
  fov: 32,
};

export const zaanYardShedObject: ZaanYardShedLabModel = {
  id: "zaan-yard-shed",
  revision: "zaan-yard-shed-a4-2026-08-04",
  title: "Zaan yard shed — frame, stepped cladding and cargo hoist",
  units: "metres",
  coordinates: { up: "+Y", front: "+Z", origin: "ground-centre" },
  sourceNotes: [
    "The 1992 Zaan industrial-heritage inventory owns the yoke-and-knee frame, wall plates, purlins, boarded roof and overlapping wall-board construction family.",
    "The official Zaanse Schans history confirms yokes, struts, corbels and overlapping getrapte weeg wall cladding as defining regional timber construction.",
    "The yard-kit passport owns the 4.60 by 6.40 metre footprint, exact heights, openings and member schedule; the accepted multi-angle concept owns visible character only.",
    "Warm clay tiles were selected over tarred roof boards because the accepted exterior study establishes the tile silhouette and colour boundary; the historically required boarded roof remains beneath them.",
  ],
  dimensions: {
    wallFootprintWidth: ZAAN_YARD_SHED_WIDTH,
    wallFootprintDepth: ZAAN_YARD_SHED_DEPTH,
    roofEnvelopeWidth: ZAAN_YARD_SHED_ROOF_WIDTH,
    roofEnvelopeDepth: ZAAN_YARD_SHED_ROOF_DEPTH,
    plinthHeight: ZAAN_YARD_SHED_PLINTH_HEIGHT,
    eaveY: ZAAN_YARD_SHED_EAVE_Y,
    ridgeY: ZAAN_YARD_SHED_RIDGE_Y,
    cargoDoorWidth: ZAAN_YARD_SHED_DOOR_WIDTH,
    cargoDoorHeight: ZAAN_YARD_SHED_DOOR_HEIGHT,
    hoistProjection: ZAAN_YARD_SHED_HOIST_PROJECTION,
    claddingPitch: ZAAN_YARD_SHED_CLADDING_PITCH,
  },
  labMetrics: [
    { label: "WALL W × D", value: ZAAN_YARD_SHED_WIDTH, decimals: 2, unit: "m wide" },
    { label: "RIDGE", value: ZAAN_YARD_SHED_RIDGE_Y, decimals: 2 },
    { label: "DOORS", value: ZAAN_YARD_SHED_DOOR_WIDTH, decimals: 2, unit: "m clear" },
    { label: "HOIST OUT", value: ZAAN_YARD_SHED_HOIST_PROJECTION, decimals: 2 },
  ],
  anchors: {
    groundCentre: point(0, 0, 0),
    frontDoorCentre: point(0, 1.41, 3.2),
    hoistTip: point(0, 3.32, 3.85),
    ridgeFront: point(0, ZAAN_YARD_SHED_RIDGE_Y, 3.45),
  },
  motionConstraints: { staticObjectStudy: true, doorsAuthoredClosed: true, windSimulation: false },
  materialOverrides: {
    brick: { color: 0x7f4934, roughness: 1 },
    "timber-dark": { color: 0x202425, roughness: 0.92 },
    "timber-mid": { color: 0x6b4a31, roughness: 0.92 },
    "roof-warm": { color: 0xa95739, roughness: 0.96 },
    "paint-light": { color: 0xe4e0d3, roughness: 0.84 },
    metal: { color: 0x343a3c, roughness: 0.58, metalness: 0.32 },
  },
  parts,
  views: [
    { id: "front", label: "Front · real double-door opening and cargo hoist", projection: "orthographic", position: point(0, 2.5, 10), target: point(0, 2.05, 0), orthoHeight: 5.3, hiddenGroups: [] },
    { id: "profile", label: "Profile · side window, eave and roof support", projection: "orthographic", position: point(10, 2.5, 0), target: point(0, 2.05, 0), orthoHeight: 7.4, hiddenGroups: [] },
    { id: "front-three-quarter", label: "Exterior · tarred stepped boards, white doors and warm tiles", projection: "perspective", position: point(8.2, 5.2, 9.4), target: point(0, 1.9, 0), fov: 32, hiddenGroups: [] },
    { id: "rear-three-quarter", label: "Rear · closed working-yard shell", projection: "perspective", position: point(-8.4, 5.0, -9.2), target: point(0, 1.9, 0), fov: 32, hiddenGroups: [] },
    { id: "high", label: "High · tile courses, ridge and 0.25 m overhangs", projection: "perspective", position: point(8.6, 8.2, 8.8), target: point(0, 2.0, 0), fov: 32, hiddenGroups: [] },
    { id: "hoist-detail", label: "Joint · internal beam tail, brace, chain and hook", projection: "perspective", position: point(3.8, 4.3, 6.7), target: point(0, 3.05, 3.35), fov: 26, hiddenGroups: [] },
    { id: "frame-exterior", label: "Control pair · complete exterior", ...exteriorPairCamera, hiddenGroups: [] },
    { id: "frame-cutaway", label: "Control pair · three yokes, four rafters and hoist tail", ...exteriorPairCamera, hiddenGroups: [claddingGroup, roofSkinGroup, openingGroup, trimGroup] },
    { id: "silhouette", label: "Silhouette · one-bay yard shed and projecting hoist", projection: "perspective", position: point(8.2, 4.4, 9.8), target: point(0, 2.0, 0), fov: 31, hiddenGroups: [] },
  ],
};

export const zaanYardShedParts = parts;
export const zaanYardShedGroups = allGroups;
