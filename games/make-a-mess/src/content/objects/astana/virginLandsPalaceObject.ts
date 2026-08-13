import {
  segmentedWallWithOpenings,
  standardCurtainWall,
  standardPanelGridAroundOpenings,
  standardWindowAssembly,
  type FacadeOpening,
  type RectilinearFace,
} from "../architecture/standardFacadeAssemblies.ts";
import type {
  ObjectLabModel,
  ObjectLabPart,
  ObjectLabView,
  ObjectMaterialId,
  ObjectPoint,
  ObjectTriangle,
} from "../dutchWindmills/objectModel.ts";
import {
  PALACE_APEX_Y,
  PALACE_AUDITORIUM_CENTRE_X,
  PALACE_AUDITORIUM_CENTRE_Z,
  PALACE_AUDITORIUM_DEPTH,
  PALACE_AUDITORIUM_EAVE_Y,
  PALACE_AUDITORIUM_WIDTH,
  PALACE_FOYER_DEPTH,
  PALACE_FOYER_HEIGHT,
  PALACE_FOYER_HALF_DEPTH,
  PALACE_FOYER_HALF_WIDTH,
  PALACE_FOYER_RECESS_HEIGHT,
  PALACE_FOYER_WIDTH,
  PALACE_HALL_FRONT,
  PALACE_HALL_LEFT,
  PALACE_HALL_REAR,
  PALACE_HALL_RIGHT,
  PALACE_ROOF_RIDGE_HALF_LENGTH,
} from "./virginLandsPalaceDimensions.ts";

type PalaceView = ObjectLabView & { readonly up?: ObjectPoint };
type PalaceModel = Omit<ObjectLabModel, "views"> & {
  readonly captureFrame: readonly [width: number, height: number];
  readonly materialOverrides: Readonly<
    Record<string, Readonly<Record<string, number | boolean>>>
  >;
  readonly views: readonly PalaceView[];
};

export type PalaceOpeningSchedule = Readonly<Record<
  "front-z" | "rear-z" | "right-x" | "left-x",
  readonly FacadeOpening[]
>>;

const HALL_WALL_THICKNESS = 0.52;
const HALL_WALL_Y_MIN = PALACE_FOYER_HEIGHT;
const CLADDING_THICKNESS = 0.08;
const CLADDING_OFFSET = 0.1;
const UPPER_CURTAIN_BOTTOM = 2.25;
const UPPER_CURTAIN_TOP = 4.72;
const GROUND_CURTAIN_BOTTOM = 0.18;
const GROUND_CURTAIN_TOP = 1.95;
const GROUND_CURTAIN_INSET = 1.4;
const FRONT_CURTAIN_BAYS = 24;
const RIGHT_CURTAIN_BAYS = 17;

const parts: ObjectLabPart[] = [];
const point = (x: number, y: number, z: number): ObjectPoint => [x, y, z];

function addBox(
  id: string,
  group: string,
  material: ObjectMaterialId,
  center: ObjectPoint,
  size: ObjectPoint,
): void {
  parts.push({ kind: "box", id, group, material, center, size });
}

function addBeam(
  id: string,
  group: string,
  material: ObjectMaterialId,
  from: ObjectPoint,
  to: ObjectPoint,
  width: number,
  depth = width,
): void {
  parts.push({ kind: "beam", id, group, material, from, to, width, depth });
}

function addMesh(
  id: string,
  group: string,
  material: ObjectMaterialId,
  vertices: readonly ObjectPoint[],
  triangles: readonly ObjectTriangle[],
): void {
  parts.push({
    kind: "mesh",
    id,
    group,
    material,
    vertices,
    triangles,
    doubleSided: true,
    showEdges: false,
  });
}

function opening(
  id: string,
  centerU: number,
  centerY: number,
  width: number,
  height: number,
): FacadeOpening {
  return { id, centerU, centerY, width, height };
}

const frontLowPitch = (PALACE_AUDITORIUM_WIDTH - 2.4) / 15;
const frontLowWindows = Array.from({ length: 15 }, (_, index) => opening(
  `front-low-${index + 1}`,
  PALACE_HALL_LEFT + 1.2 + frontLowPitch * (index + 0.5),
  6.18,
  1.42,
  0.72,
));
const frontSquareWindows = [
  [-19.8, 9.1], [-15.6, 10.45], [-11.3, 8.9], [-6.8, 11.05],
  [-2.1, 9.7], [3.0, 10.6], [8.5, 9.15],
].map(([u, y], index) => opening(`front-square-${index + 1}`, u, y, 0.62, 0.62));

const rearLowWindows = Array.from({ length: 10 }, (_, index) => opening(
  `rear-low-${index + 1}`,
  PALACE_HALL_LEFT + 2 + index * 3.25,
  6.2,
  1.35,
  0.7,
));
const rearSquareWindows = [
  [-17.5, 9.2], [-10.0, 10.5], [-2.5, 9.0], [5.0, 10.4],
].map(([u, y], index) => opening(`rear-square-${index + 1}`, u, y, 0.58, 0.58));

const rightLowWindows = Array.from({ length: 8 }, (_, index) => opening(
  `right-low-${index + 1}`,
  PALACE_HALL_REAR + 1.55 + index * 3,
  6.18,
  1.32,
  0.7,
));
const rightSquareWindows = [
  [-12.5, 9.15], [-6.0, 10.4], [1.0, 9.05], [6.2, 10.6],
].map(([u, y], index) => opening(`right-square-${index + 1}`, u, y, 0.58, 0.58));

const leftLowWindows = Array.from({ length: 6 }, (_, index) => opening(
  `left-low-${index + 1}`,
  PALACE_HALL_REAR + 2 + index * 3.75,
  6.18,
  1.28,
  0.7,
));
const leftSquareWindows = [
  [-11.5, 9.4], [-3.2, 10.55], [4.8, 9.2],
].map(([u, y], index) => opening(`left-square-${index + 1}`, u, y, 0.58, 0.58));

export const PALACE_OPENING_SCHEDULE: PalaceOpeningSchedule = {
  "front-z": [...frontLowWindows, ...frontSquareWindows],
  "rear-z": [...rearLowWindows, ...rearSquareWindows],
  "right-x": [...rightLowWindows, ...rightSquareWindows],
  "left-x": [...leftLowWindows, ...leftSquareWindows],
};

// Four exact bars preserve the owner-approved C01 foyer wrap without a hidden
// full podium under the auditorium.
function addFoyerBars(
  id: string,
  group: string,
  material: ObjectMaterialId,
  centerY: number,
  height: number,
): void {
  addBox(
    `${id}:square-bar`,
    group,
    material,
    point(0, centerY, (PALACE_HALL_FRONT + PALACE_FOYER_HALF_DEPTH) / 2),
    point(
      PALACE_FOYER_WIDTH,
      height,
      PALACE_FOYER_HALF_DEPTH - PALACE_HALL_FRONT,
    ),
  );
  addBox(
    `${id}:right-wing`,
    group,
    material,
    point(
      (PALACE_HALL_RIGHT + PALACE_FOYER_HALF_WIDTH) / 2,
      centerY,
      PALACE_AUDITORIUM_CENTRE_Z,
    ),
    point(
      PALACE_FOYER_HALF_WIDTH - PALACE_HALL_RIGHT,
      height,
      PALACE_AUDITORIUM_DEPTH,
    ),
  );
  addBox(
    `${id}:left-return`,
    group,
    material,
    point(
      (-PALACE_FOYER_HALF_WIDTH + PALACE_HALL_LEFT) / 2,
      centerY,
      PALACE_AUDITORIUM_CENTRE_Z,
    ),
    point(
      PALACE_HALL_LEFT + PALACE_FOYER_HALF_WIDTH,
      height,
      PALACE_AUDITORIUM_DEPTH,
    ),
  );
  addBox(
    `${id}:rear-strip`,
    group,
    material,
    point(0, centerY, (-PALACE_FOYER_HALF_DEPTH + PALACE_HALL_REAR) / 2),
    point(
      PALACE_FOYER_WIDTH,
      height,
      PALACE_HALL_REAR + PALACE_FOYER_HALF_DEPTH,
    ),
  );
}

addFoyerBars("foyer-ground-slab", "foyer-structure", "palace-concrete", 0.13, 0.26);
addFoyerBars("foyer-roof-slab", "foyer-structure", "palace-concrete", 4.94, 0.52);

// Intermediate edge beams and pilotis carry the upper curtain line. The
// ground glazing is set 1.4 m inward behind those carriers.
addBox(
  "foyer-front-edge-beam",
  "foyer-structure",
  "palace-concrete",
  point(0, PALACE_FOYER_RECESS_HEIGHT, PALACE_FOYER_HALF_DEPTH - 0.18),
  point(PALACE_FOYER_WIDTH, 0.34, 0.46),
);
addBox(
  "foyer-right-edge-beam",
  "foyer-structure",
  "palace-concrete",
  point(PALACE_FOYER_HALF_WIDTH - 0.18, PALACE_FOYER_RECESS_HEIGHT, 0),
  point(0.46, 0.34, PALACE_FOYER_DEPTH),
);
for (const x of [-20, -12, -4, 4, 12, 20]) {
  addBox(
    `foyer-front-piloti-${x}`,
    "foyer-structure",
    "palace-concrete",
    point(x, 1.03, PALACE_FOYER_HALF_DEPTH - 1.9),
    point(0.44, 1.8, 0.44),
  );
}
for (const z of [-13.5, -7.5, -1.5, 4.5, 10.5]) {
  addBox(
    `foyer-right-piloti-${z}`,
    "foyer-structure",
    "palace-concrete",
    point(PALACE_FOYER_HALF_WIDTH - 1.9, 1.03, z),
    point(0.44, 1.8, 0.44),
  );
}

parts.push(
  ...standardCurtainWall({
    id: "foyer-front-upper",
    group: "foyer-front-upper",
    face: "front-z",
    plane: PALACE_FOYER_HALF_DEPTH,
    uMin: -PALACE_FOYER_HALF_WIDTH,
    uMax: PALACE_FOYER_HALF_WIDTH,
    yMin: UPPER_CURTAIN_BOTTOM,
    yMax: UPPER_CURTAIN_TOP,
    bays: FRONT_CURTAIN_BAYS,
    rows: 2,
    frameMaterial: "palace-frame-metal",
    glassMaterial: "palace-glazing",
  }),
  ...standardCurtainWall({
    id: "foyer-right-upper",
    group: "foyer-right-upper",
    face: "right-x",
    plane: PALACE_FOYER_HALF_WIDTH,
    uMin: -PALACE_FOYER_HALF_DEPTH,
    uMax: PALACE_FOYER_HALF_DEPTH,
    yMin: UPPER_CURTAIN_BOTTOM,
    yMax: UPPER_CURTAIN_TOP,
    bays: RIGHT_CURTAIN_BAYS,
    rows: 2,
    frameMaterial: "palace-frame-metal",
    glassMaterial: "palace-glazing",
  }),
  ...standardCurtainWall({
    id: "foyer-front-ground",
    group: "foyer-front-ground",
    face: "front-z",
    plane: PALACE_FOYER_HALF_DEPTH - GROUND_CURTAIN_INSET,
    uMin: -PALACE_FOYER_HALF_WIDTH,
    uMax: PALACE_FOYER_HALF_WIDTH,
    yMin: GROUND_CURTAIN_BOTTOM,
    yMax: GROUND_CURTAIN_TOP,
    bays: FRONT_CURTAIN_BAYS,
    rows: 1,
    frameMaterial: "palace-frame-metal",
    glassMaterial: "palace-glazing",
    doorGroups: [
      { id: "west-entry", startBay: 5, baySpan: 2 },
      { id: "central-entry", startBay: 9, baySpan: 2 },
    ],
  }),
  ...standardCurtainWall({
    id: "foyer-right-ground",
    group: "foyer-right-ground",
    face: "right-x",
    plane: PALACE_FOYER_HALF_WIDTH - GROUND_CURTAIN_INSET,
    uMin: -PALACE_FOYER_HALF_DEPTH,
    uMax: PALACE_FOYER_HALF_DEPTH,
    yMin: GROUND_CURTAIN_BOTTOM,
    yMax: GROUND_CURTAIN_TOP,
    bays: RIGHT_CURTAIN_BAYS,
    rows: 1,
    frameMaterial: "palace-frame-metal",
    glassMaterial: "palace-glazing",
  }),
);

// Period photographs show the vertical fins continuing above the glazed band.
// These are exact continuations of the standard bay boundaries, not a second
// decorative grid laid over the glass.
for (let boundary = 0; boundary <= FRONT_CURTAIN_BAYS; boundary += 1) {
  const x = -PALACE_FOYER_HALF_WIDTH
    + boundary * PALACE_FOYER_WIDTH / FRONT_CURTAIN_BAYS;
  addBeam(
    `foyer-front-fin-extension-${boundary}`,
    "foyer-front-upper:fin-extensions",
    "palace-frame-metal",
    point(x, UPPER_CURTAIN_TOP, PALACE_FOYER_HALF_DEPTH + 0.02),
    point(x, PALACE_FOYER_HEIGHT, PALACE_FOYER_HALF_DEPTH + 0.02),
    0.12,
    0.12,
  );
}
for (let boundary = 0; boundary <= RIGHT_CURTAIN_BAYS; boundary += 1) {
  const z = -PALACE_FOYER_HALF_DEPTH
    + boundary * PALACE_FOYER_DEPTH / RIGHT_CURTAIN_BAYS;
  addBeam(
    `foyer-right-fin-extension-${boundary}`,
    "foyer-right-upper:fin-extensions",
    "palace-frame-metal",
    point(PALACE_FOYER_HALF_WIDTH + 0.02, UPPER_CURTAIN_TOP, z),
    point(PALACE_FOYER_HALF_WIDTH + 0.02, PALACE_FOYER_HEIGHT, z),
    0.12,
    0.12,
  );
}

// Narrow hidden returns are intentionally quiet concrete, not invented glass.
addBox(
  "foyer-left-return-wall",
  "foyer-return-shell",
  "palace-concrete",
  point(-PALACE_FOYER_HALF_WIDTH + 0.18, 2.65, PALACE_AUDITORIUM_CENTRE_Z),
  point(0.36, 4.78, PALACE_AUDITORIUM_DEPTH),
);
addBox(
  "foyer-rear-return-wall",
  "foyer-return-shell",
  "palace-concrete",
  point(0, 2.65, -PALACE_FOYER_HALF_DEPTH + 0.18),
  point(PALACE_FOYER_WIDTH, 4.78, 0.36),
);

// The auditorium's low core is real interior depth behind the curtain wall,
// several metres from the glass. It carries the segmented upper shell.
addBox(
  "auditorium-lower-core",
  "auditorium-core",
  "palace-interior-dark",
  point(PALACE_AUDITORIUM_CENTRE_X, PALACE_FOYER_HEIGHT / 2, PALACE_AUDITORIUM_CENTRE_Z),
  point(PALACE_AUDITORIUM_WIDTH, PALACE_FOYER_HEIGHT, PALACE_AUDITORIUM_DEPTH),
);

type HallFace = {
  readonly face: RectilinearFace;
  readonly plane: number;
  readonly uMin: number;
  readonly uMax: number;
  readonly panelColumns: number;
  readonly openings: readonly FacadeOpening[];
};

const hallFaces: readonly HallFace[] = [
  { face: "front-z", plane: PALACE_HALL_FRONT, uMin: PALACE_HALL_LEFT, uMax: PALACE_HALL_RIGHT, panelColumns: 20, openings: PALACE_OPENING_SCHEDULE["front-z"] },
  { face: "rear-z", plane: PALACE_HALL_REAR, uMin: PALACE_HALL_LEFT, uMax: PALACE_HALL_RIGHT, panelColumns: 20, openings: PALACE_OPENING_SCHEDULE["rear-z"] },
  { face: "right-x", plane: PALACE_HALL_RIGHT, uMin: PALACE_HALL_REAR, uMax: PALACE_HALL_FRONT, panelColumns: 14, openings: PALACE_OPENING_SCHEDULE["right-x"] },
  { face: "left-x", plane: PALACE_HALL_LEFT, uMin: PALACE_HALL_REAR, uMax: PALACE_HALL_FRONT, panelColumns: 14, openings: PALACE_OPENING_SCHEDULE["left-x"] },
];

for (const face of hallFaces) {
  const id = `auditorium-${face.face}`;
  parts.push(
    ...segmentedWallWithOpenings({
      id: `${id}:wall`,
      group: `${id}:wall`,
      material: "palace-concrete",
      face: face.face,
      plane: face.plane,
      thickness: HALL_WALL_THICKNESS,
      uMin: face.uMin,
      uMax: face.uMax,
      yMin: HALL_WALL_Y_MIN,
      yMax: PALACE_AUDITORIUM_EAVE_Y,
      openings: face.openings,
    }),
    ...standardPanelGridAroundOpenings({
      id: `${id}:cladding`,
      group: `${id}:cladding`,
      material: "palace-stone",
      face: face.face,
      plane: face.plane + (face.face === "front-z" || face.face === "right-x" ? CLADDING_OFFSET : -CLADDING_OFFSET),
      thickness: CLADDING_THICKNESS,
      uMin: face.uMin,
      uMax: face.uMax,
      yMin: HALL_WALL_Y_MIN,
      yMax: PALACE_AUDITORIUM_EAVE_Y,
      columns: face.panelColumns,
      rows: 6,
      horizontalGap: 0.035,
      verticalGap: 0.035,
      openings: face.openings,
    }),
  );
  for (const aperture of face.openings) {
    const outwardOffset = face.face === "front-z" || face.face === "right-x"
      ? CLADDING_OFFSET
      : -CLADDING_OFFSET;
    parts.push(...standardWindowAssembly({
      ...aperture,
      group: `${id}:openings`,
      face: face.face,
      plane: face.plane + outwardOffset,
      wallThickness: HALL_WALL_THICKNESS + CLADDING_THICKNESS,
      frameMaterial: "palace-frame-metal",
      glassMaterial: "palace-glazing",
      revealMaterial: "palace-stone",
      interiorMaterial: "palace-interior-dark",
      columns: aperture.width > 1 ? 2 : 1,
      rows: 1,
      interiorDepth: 1.9,
    }));
  }
}

// Ceramic accents use their own material and never occupy the window schedule.
const accentCells = [
  [-18.2, 12.1, "blue"], [-15.0, 8.0, "red"], [-12.3, 11.8, "red"],
  [-9.2, 9.7, "blue"], [-5.0, 12.0, "blue"], [-1.7, 8.2, "red"],
  [1.5, 11.8, "red"], [4.7, 8.1, "blue"], [8.8, 11.9, "blue"],
] as const;
for (const [index, [x, y, colour]] of accentCells.entries()) {
  addBox(
    `front-ceramic-accent-${index + 1}`,
    "auditorium-front-z:accents",
    colour === "blue" ? "palace-accent-blue" : "palace-accent-red",
    point(x, y, PALACE_HALL_FRONT + 0.16),
    point(0.42, 0.22, 0.08),
  );
}

const ridgeLeft = PALACE_AUDITORIUM_CENTRE_X - PALACE_ROOF_RIDGE_HALF_LENGTH;
const ridgeRight = PALACE_AUDITORIUM_CENTRE_X + PALACE_ROOF_RIDGE_HALF_LENGTH;
addMesh("roof-square-slope", "auditorium-roof", "palace-roof-metal", [
  point(PALACE_HALL_LEFT, PALACE_AUDITORIUM_EAVE_Y, PALACE_HALL_FRONT),
  point(PALACE_HALL_RIGHT, PALACE_AUDITORIUM_EAVE_Y, PALACE_HALL_FRONT),
  point(ridgeRight, PALACE_APEX_Y, PALACE_AUDITORIUM_CENTRE_Z),
  point(ridgeLeft, PALACE_APEX_Y, PALACE_AUDITORIUM_CENTRE_Z),
], [[0, 1, 2], [0, 2, 3]]);
addMesh("roof-rear-slope", "auditorium-roof", "palace-roof-metal", [
  point(PALACE_HALL_RIGHT, PALACE_AUDITORIUM_EAVE_Y, PALACE_HALL_REAR),
  point(PALACE_HALL_LEFT, PALACE_AUDITORIUM_EAVE_Y, PALACE_HALL_REAR),
  point(ridgeLeft, PALACE_APEX_Y, PALACE_AUDITORIUM_CENTRE_Z),
  point(ridgeRight, PALACE_APEX_Y, PALACE_AUDITORIUM_CENTRE_Z),
], [[0, 1, 2], [0, 2, 3]]);
addMesh("roof-left-hip", "auditorium-roof", "palace-roof-metal", [
  point(PALACE_HALL_LEFT, PALACE_AUDITORIUM_EAVE_Y, PALACE_HALL_REAR),
  point(PALACE_HALL_LEFT, PALACE_AUDITORIUM_EAVE_Y, PALACE_HALL_FRONT),
  point(ridgeLeft, PALACE_APEX_Y, PALACE_AUDITORIUM_CENTRE_Z),
], [[0, 1, 2]]);
addMesh("roof-right-hip", "auditorium-roof", "palace-roof-metal", [
  point(PALACE_HALL_RIGHT, PALACE_AUDITORIUM_EAVE_Y, PALACE_HALL_FRONT),
  point(PALACE_HALL_RIGHT, PALACE_AUDITORIUM_EAVE_Y, PALACE_HALL_REAR),
  point(ridgeRight, PALACE_APEX_Y, PALACE_AUDITORIUM_CENTRE_Z),
], [[0, 1, 2]]);
for (let index = 1; index < 12; index += 1) {
  const x = ridgeLeft + index * (ridgeRight - ridgeLeft) / 12;
  addBeam(
    `roof-square-standing-seam-${index}`,
    "auditorium-roof-seams",
    "palace-frame-metal",
    point(x, PALACE_AUDITORIUM_EAVE_Y + 0.035, PALACE_HALL_FRONT),
    point(x, PALACE_APEX_Y + 0.035, PALACE_AUDITORIUM_CENTRE_Z),
    0.055,
    0.045,
  );
  addBeam(
    `roof-rear-standing-seam-${index}`,
    "auditorium-roof-seams",
    "palace-frame-metal",
    point(x, PALACE_AUDITORIUM_EAVE_Y + 0.035, PALACE_HALL_REAR),
    point(x, PALACE_APEX_Y + 0.035, PALACE_AUDITORIUM_CENTRE_Z),
    0.055,
    0.045,
  );
}

// The wall sign is an open stroke assembly made from standard metal beams.
// It is not a row of letter-sized facade plates and it never touches glazing.
type GlyphStroke = readonly [x0: number, y0: number, x1: number, y1: number];
const LEFT: GlyphStroke = [0, 0, 0, 1];
const RIGHT: GlyphStroke = [1, 0, 1, 1];
const TOP: GlyphStroke = [0, 1, 1, 1];
const MIDDLE: GlyphStroke = [0, 0.5, 1, 0.5];
const BOTTOM: GlyphStroke = [0, 0, 1, 0];
const GLYPH_STROKES: Readonly<Record<string, readonly GlyphStroke[]>> = {
  "Д": [[0.2, 0.15, 0.35, 1], [0.35, 1, 0.85, 1], [0.85, 1, 1, 0.15], [0.05, 0.15, 1.1, 0.15], [0.05, 0, 0.05, 0.22], [1.1, 0, 1.1, 0.22]],
  "В": [LEFT, TOP, MIDDLE, BOTTOM, [1, 0.52, 1, 0.92], [1, 0.08, 1, 0.48]],
  "О": [LEFT, RIGHT, TOP, BOTTOM],
  "Р": [LEFT, TOP, MIDDLE, [1, 0.5, 1, 1]],
  "Е": [LEFT, TOP, MIDDLE, BOTTOM],
  "Ц": [LEFT, RIGHT, BOTTOM, [1, 0, 1.12, -0.18]],
  "Л": [[0, 0, 0.4, 1], [0.4, 1, 1, 0], BOTTOM],
  "И": [LEFT, RIGHT, [0, 0, 1, 1]],
  "Н": [LEFT, RIGHT, MIDDLE],
  "К": [LEFT, [0, 0.5, 1, 1], [0, 0.5, 1, 0]],
};

const signText = "ДВОРЕЦ ЦЕЛИННИКОВ";
const signWidth = 0.52;
const signHeight = 0.88;
const signGap = 0.14;
const signZ = PALACE_HALL_FRONT + 0.27;
let signCursor = -1.7;
for (const [characterIndex, character] of [...signText].entries()) {
  if (character === " ") {
    signCursor += signWidth * 0.65;
    continue;
  }
  for (const [strokeIndex, [x0, y0, x1, y1]] of (
    GLYPH_STROKES[character] ?? []
  ).entries()) {
    addBeam(
      `front-sign-${characterIndex}:stroke-${strokeIndex}`,
      "auditorium-front-z:sign",
      "palace-sign-metal",
      point(signCursor + x0 * signWidth, 11.46 + y0 * signHeight, signZ),
      point(signCursor + x1 * signWidth, 11.46 + y1 * signHeight, signZ),
      0.07,
      0.09,
    );
  }
  signCursor += signWidth + signGap;
}

const views: readonly PalaceView[] = [
  { id: "front-square", label: "Square facade · real windows and entrance bays", projection: "orthographic", position: point(0, 7.2, 75), target: point(0, 7.2, 0), orthoHeight: 30 },
  { id: "foyer-corner", label: "Foyer corner · open curtain wall", projection: "perspective", position: point(52, 17, 56), target: point(1, 4.5, 1), fov: 34 },
  { id: "right-grazing", label: "Right glazing · panes, frames and interior depth", projection: "perspective", position: point(42, 5.0, 31), target: point(22.5, 2.6, 1), fov: 30 },
  { id: "auditorium-window-detail", label: "Auditorium window · void, reveals, frame, glass", projection: "perspective", position: point(-2.0, 8.0, 17.0), target: point(-2.1, 7.0, 8.0), fov: 28 },
  { id: "door-detail", label: "Entrance · reserved bays and physical leaves", projection: "perspective", position: point(-4.0, 2.15, 22.5), target: point(-4.0, 1.1, 15.6), fov: 30 },
  { id: "high-three-quarter", label: "High 3/4 · protected mass and hipped roof", projection: "perspective", position: point(50, 48, 52), target: point(0, 5.2, 0), fov: 36 },
  { id: "left-three-quarter", label: "3/4 left · hall close to the left return", projection: "perspective", position: point(-54, 23, 56), target: point(-2, 6.0, 0), fov: 34 },
  { id: "rear", label: "Rear · conservative authored elevation", projection: "orthographic", position: point(0, 7.5, -75), target: point(0, 7.5, 0), orthoHeight: 30 },
  { id: "top", label: "Top · accepted C01 footprint", projection: "orthographic", position: point(0, 75, 0), target: point(0, 0, 0), up: point(0, 0, 1), orthoHeight: 40 },
  { id: "foyer-corner-cutaway", label: "Cutaway pair · same corner without outer glass", projection: "perspective", position: point(52, 17, 56), target: point(1, 4.5, 1), fov: 34, hiddenGroups: ["foyer-front-upper:glazing", "foyer-right-upper:glazing", "foyer-front-ground:glazing", "foyer-right-ground:glazing", "foyer-front-ground:doors:glazing"] },
  { id: "silhouette", label: "Silhouette · accepted B01 mass", projection: "orthographic", position: point(-48, 24, 56), target: point(0, 6.2, 0), orthoHeight: 34 },
];

export const virginLandsPalaceObject: PalaceModel = {
  id: "astana-virgin-lands-palace-1963",
  revision: "d02-2026-08-12-real-openings",
  title: "Palace of Virgin Lands — canonical 1963 facade study",
  units: "metres",
  coordinates: { up: "+Y", front: "+Z", origin: "ground-centre" },
  captureFrame: [1500, 1000],
  materialOverrides: {},
  sourceNotes: [
    "C01 and B01 are owner-approved; D01 preserves their exact mass distribution.",
    "Every transparent part is a physical pane or glazed door leaf in a real opening; no opaque backing wall exists behind the curtain wall.",
    "Front opening band, sparse square windows, modular pale facade and shallow standing-seam roof are controlled by the registered archive views.",
    "Rear and hidden side opening counts are conservative authored completion, not measured historical elevations.",
  ],
  dimensions: {
    foyerWidth: PALACE_FOYER_WIDTH,
    foyerDepth: PALACE_FOYER_DEPTH,
    foyerHeight: PALACE_FOYER_HEIGHT,
    foyerRecessHeight: PALACE_FOYER_RECESS_HEIGHT,
    auditoriumWidth: PALACE_AUDITORIUM_WIDTH,
    auditoriumDepth: PALACE_AUDITORIUM_DEPTH,
    auditoriumCentreX: PALACE_AUDITORIUM_CENTRE_X,
    auditoriumCentreZ: PALACE_AUDITORIUM_CENTRE_Z,
    auditoriumEaveY: PALACE_AUDITORIUM_EAVE_Y,
    maximumOperatingHeight: PALACE_APEX_Y,
    frontCurtainBays: FRONT_CURTAIN_BAYS,
    rightCurtainBays: RIGHT_CURTAIN_BAYS,
  },
  labMetrics: [
    { label: "FOYER", value: PALACE_FOYER_WIDTH, decimals: 0, signed: false },
    { label: "APEX", value: PALACE_APEX_Y, decimals: 3 },
    { label: "WINDOWS", value: Object.values(PALACE_OPENING_SCHEDULE).flat().length, decimals: 0, signed: false, unit: "" },
    { label: "PARTS", value: parts.length, decimals: 0, signed: false, unit: "" },
  ],
  anchors: {
    groundCentre: point(0, 0, 0),
    squareFacadeCentre: point(0, 0, PALACE_FOYER_HALF_DEPTH),
    auditoriumCentre: point(PALACE_AUDITORIUM_CENTRE_X, 0, PALACE_AUDITORIUM_CENTRE_Z),
    roofRidgeLeft: point(ridgeLeft, PALACE_APEX_Y, PALACE_AUDITORIUM_CENTRE_Z),
    roofRidgeRight: point(ridgeRight, PALACE_APEX_Y, PALACE_AUDITORIUM_CENTRE_Z),
  },
  motionConstraints: {
    staticObject: true,
    windowGlassEmissive: false,
    worldIntegrationDeferred: true,
  },
  labEnvironment: {
    floorRadius: 38,
    gridSize: 64,
    gridDivisions: 64,
    fogNear: 92,
    fogFar: 145,
    floorY: -0.04,
  },
  parts,
  views,
};
