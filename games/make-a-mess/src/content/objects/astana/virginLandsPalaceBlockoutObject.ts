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
  PALACE_FOYER_RECESS_HEIGHT,
  PALACE_FOYER_WIDTH,
  PALACE_ROOF_RIDGE_HALF_LENGTH,
} from "./virginLandsPalaceDimensions.ts";

type PalaceView = ObjectLabView & { readonly up?: ObjectPoint };
type PalaceBlockoutModel = Omit<ObjectLabModel, "views"> & {
  readonly captureFrame: readonly [width: number, height: number];
  readonly materialOverrides: Readonly<
    Record<string, Readonly<Record<string, number | boolean>>>
  >;
  readonly views: readonly PalaceView[];
};

/**
 * Shape-only reconstruction of the 1963 Palace of Virgin Lands.
 *
 * This is the sole canonical owner of blockout B01. It deliberately contains
 * no facade grid, signage, windows, roof equipment, structure, collision or
 * Astana-world adapter. Those remain blocked until B01 is visually accepted.
 */

const FOYER_WIDTH = PALACE_FOYER_WIDTH;
const FOYER_DEPTH = PALACE_FOYER_DEPTH;
const FOYER_HEIGHT = PALACE_FOYER_HEIGHT;
const FOYER_RECESS_HEIGHT = PALACE_FOYER_RECESS_HEIGHT;
const AUDITORIUM_WIDTH = PALACE_AUDITORIUM_WIDTH;
const AUDITORIUM_DEPTH = PALACE_AUDITORIUM_DEPTH;
const AUDITORIUM_CENTRE_X = PALACE_AUDITORIUM_CENTRE_X;
const AUDITORIUM_CENTRE_Z = PALACE_AUDITORIUM_CENTRE_Z;
const AUDITORIUM_EAVE_Y = PALACE_AUDITORIUM_EAVE_Y;
const ROOF_RIDGE_HALF_LENGTH = PALACE_ROOF_RIDGE_HALF_LENGTH;

const foyerHalfWidth = FOYER_WIDTH / 2;
const foyerHalfDepth = FOYER_DEPTH / 2;
const hallHalfWidth = AUDITORIUM_WIDTH / 2;
const hallHalfDepth = AUDITORIUM_DEPTH / 2;
const hallLeft = AUDITORIUM_CENTRE_X - hallHalfWidth;
const hallRight = AUDITORIUM_CENTRE_X + hallHalfWidth;
const hallRear = AUDITORIUM_CENTRE_Z - hallHalfDepth;
const hallFront = AUDITORIUM_CENTRE_Z + hallHalfDepth;

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
    showEdges: true,
  });
}

const upperFoyerY = FOYER_RECESS_HEIGHT
  + (FOYER_HEIGHT - FOYER_RECESS_HEIGHT) / 2;
const upperFoyerHeight = FOYER_HEIGHT - FOYER_RECESS_HEIGHT;

// Four bars form one rectangular low volume around the hall. Their shared
// boundaries are exact; the high hall does not overlap or replace the wing.
addBox(
  "foyer-upper-square-bar",
  "foyer-upper",
  "cladding",
  point(0, upperFoyerY, (hallFront + foyerHalfDepth) / 2),
  point(FOYER_WIDTH, upperFoyerHeight, foyerHalfDepth - hallFront),
);
addBox(
  "foyer-upper-right-wing",
  "foyer-upper",
  "cladding",
  point((hallRight + foyerHalfWidth) / 2, upperFoyerY, AUDITORIUM_CENTRE_Z),
  point(foyerHalfWidth - hallRight, upperFoyerHeight, AUDITORIUM_DEPTH),
);
addBox(
  "foyer-upper-left-return",
  "foyer-upper",
  "cladding",
  point((-foyerHalfWidth + hallLeft) / 2, upperFoyerY, AUDITORIUM_CENTRE_Z),
  point(hallLeft + foyerHalfWidth, upperFoyerHeight, AUDITORIUM_DEPTH),
);
addBox(
  "foyer-upper-rear-strip",
  "foyer-upper",
  "cladding",
  point(0, upperFoyerY, (-foyerHalfDepth + hallRear) / 2),
  point(FOYER_WIDTH, upperFoyerHeight, hallRear + foyerHalfDepth),
);

// The lower storey is visibly recessed in the archive views. B01 preserves
// that major negative space with inset carriers, without inventing the final
// column rhythm or entrance topology.
addBox(
  "foyer-lower-square-core",
  "foyer-lower-core",
  "dark-recess",
  point(0, FOYER_RECESS_HEIGHT / 2, 12.6),
  point(44, FOYER_RECESS_HEIGHT, 6.8),
);
addBox(
  "foyer-lower-right-core",
  "foyer-lower-core",
  "dark-recess",
  point(18.1, FOYER_RECESS_HEIGHT / 2, -3.4),
  point(9.8, FOYER_RECESS_HEIGHT, 22.8),
);
addBox(
  "foyer-lower-left-core",
  "foyer-lower-core",
  "dark-recess",
  point(-23, FOYER_RECESS_HEIGHT / 2, -3.4),
  point(1.2, FOYER_RECESS_HEIGHT, 22.8),
);
addBox(
  "foyer-lower-rear-core",
  "foyer-lower-core",
  "dark-recess",
  point(0, FOYER_RECESS_HEIGHT / 2, -16.5),
  point(46, FOYER_RECESS_HEIGHT, 0.5),
);

addBox(
  "auditorium-body",
  "auditorium-shell",
  "stone",
  point(
    AUDITORIUM_CENTRE_X,
    AUDITORIUM_EAVE_Y / 2,
    AUDITORIUM_CENTRE_Z,
  ),
  point(AUDITORIUM_WIDTH, AUDITORIUM_EAVE_Y, AUDITORIUM_DEPTH),
);

const ridgeLeft = AUDITORIUM_CENTRE_X - ROOF_RIDGE_HALF_LENGTH;
const ridgeRight = AUDITORIUM_CENTRE_X + ROOF_RIDGE_HALF_LENGTH;
addMesh(
  "roof-square-slope",
  "auditorium-roof",
  "roof",
  [
    point(hallLeft, AUDITORIUM_EAVE_Y, hallFront),
    point(hallRight, AUDITORIUM_EAVE_Y, hallFront),
    point(ridgeRight, PALACE_APEX_Y, AUDITORIUM_CENTRE_Z),
    point(ridgeLeft, PALACE_APEX_Y, AUDITORIUM_CENTRE_Z),
  ],
  [[0, 1, 2], [0, 2, 3]],
);
addMesh(
  "roof-rear-slope",
  "auditorium-roof",
  "roof",
  [
    point(hallRight, AUDITORIUM_EAVE_Y, hallRear),
    point(hallLeft, AUDITORIUM_EAVE_Y, hallRear),
    point(ridgeLeft, PALACE_APEX_Y, AUDITORIUM_CENTRE_Z),
    point(ridgeRight, PALACE_APEX_Y, AUDITORIUM_CENTRE_Z),
  ],
  [[0, 1, 2], [0, 2, 3]],
);
addMesh(
  "roof-left-hip",
  "auditorium-roof",
  "roof",
  [
    point(hallLeft, AUDITORIUM_EAVE_Y, hallRear),
    point(hallLeft, AUDITORIUM_EAVE_Y, hallFront),
    point(ridgeLeft, PALACE_APEX_Y, AUDITORIUM_CENTRE_Z),
  ],
  [[0, 1, 2]],
);
addMesh(
  "roof-right-hip",
  "auditorium-roof",
  "roof",
  [
    point(hallRight, AUDITORIUM_EAVE_Y, hallFront),
    point(hallRight, AUDITORIUM_EAVE_Y, hallRear),
    point(ridgeRight, PALACE_APEX_Y, AUDITORIUM_CENTRE_Z),
  ],
  [[0, 1, 2]],
);

const views: readonly PalaceView[] = [
  {
    id: "front-1983-camera",
    label: "R1 match · square-side massing",
    projection: "perspective",
    position: point(3, 7.2, 82),
    target: point(-3, 7.1, 0),
    fov: 25,
  },
  {
    id: "front",
    label: "Front +Z · square-side contour",
    projection: "orthographic",
    position: point(0, 7.5, 70),
    target: point(0, 7.5, 0),
    orthoHeight: 36,
  },
  {
    id: "right-profile",
    label: "Right +X · foyer depth and hall setback",
    projection: "orthographic",
    position: point(70, 7.5, 0),
    target: point(0, 7.5, 0),
    orthoHeight: 30,
  },
  {
    id: "left-profile",
    label: "Left -X · narrow return hypothesis",
    projection: "orthographic",
    position: point(-70, 7.5, 0),
    target: point(0, 7.5, 0),
    orthoHeight: 30,
  },
  {
    id: "rear",
    label: "Rear -Z · inferred one-metre strip",
    projection: "orthographic",
    position: point(0, 7.5, -70),
    target: point(0, 7.5, 0),
    orthoHeight: 36,
  },
  {
    id: "top",
    label: "Top · owner-approved C01 footprint",
    projection: "orthographic",
    position: point(0, 70, 0),
    target: point(0, 0, 0),
    up: point(0, 0, 1),
    orthoHeight: 40,
  },
  {
    id: "three-quarter-left",
    label: "3/4 left · auditorium near the left edge",
    projection: "perspective",
    position: point(-52, 25, 58),
    target: point(0, 6.3, 0),
    fov: 34,
  },
  {
    id: "three-quarter-right",
    label: "3/4 right · long glazed-wing mass",
    projection: "perspective",
    position: point(56, 24, 56),
    target: point(0, 6.2, 0),
    fov: 34,
  },
  {
    id: "high-three-quarter",
    label: "High 3/4 · two-volume plan and hipped roof",
    projection: "perspective",
    position: point(48, 48, 50),
    target: point(0, 4.8, 0),
    fov: 36,
  },
  {
    id: "silhouette",
    label: "Silhouette · C01 mass distribution",
    projection: "orthographic",
    position: point(-48, 24, 56),
    target: point(0, 6.2, 0),
    orthoHeight: 34,
  },
];

export const virginLandsPalaceBlockoutObject: PalaceBlockoutModel = {
  id: "astana-virgin-lands-palace-blockout",
  revision: "b01-2026-08-12-contour-c01",
  title: "Palace of Virgin Lands — C01 shape-only blockout",
  units: "metres",
  coordinates: { up: "+Y", front: "+Z", origin: "ground-centre" },
  captureFrame: [1500, 1000],
  materialOverrides: {
    cladding: { color: 0xa9b0ae, roughness: 1 },
    stone: { color: 0x858b89, roughness: 1 },
    roof: { color: 0x687174, roughness: 1 },
    "dark-recess": { color: 0x41494c, roughness: 1 },
  },
  sourceNotes: [
    "C01 was accepted by the owner on 2026-08-12; the top footprint remains an owner-approved hypothesis rather than a measured historical plan.",
    "R1 owns the square-side auditorium and roof silhouette; R2/R3 own the long low wing and recessed lower storey.",
    "Facade rhythm, openings, signs, rooftop equipment, structure, materials and world placement are intentionally absent from B01.",
  ],
  dimensions: {
    foyerWidth: FOYER_WIDTH,
    foyerDepth: FOYER_DEPTH,
    foyerHeight: FOYER_HEIGHT,
    foyerRecessHeight: FOYER_RECESS_HEIGHT,
    auditoriumWidth: AUDITORIUM_WIDTH,
    auditoriumDepth: AUDITORIUM_DEPTH,
    auditoriumCentreX: AUDITORIUM_CENTRE_X,
    auditoriumCentreZ: AUDITORIUM_CENTRE_Z,
    auditoriumEaveY: AUDITORIUM_EAVE_Y,
    maximumOperatingHeight: PALACE_APEX_Y,
  },
  labMetrics: [
    { label: "FOYER", value: FOYER_WIDTH, decimals: 0, signed: false },
    { label: "DEPTH", value: FOYER_DEPTH, decimals: 0, signed: false },
    { label: "APEX", value: PALACE_APEX_Y, decimals: 3 },
    { label: "C01 PARTS", value: parts.length, decimals: 0, signed: false, unit: "" },
  ],
  anchors: {
    groundCentre: point(0, 0, 0),
    squareFacadeCentre: point(0, 0, foyerHalfDepth),
    auditoriumCentre: point(AUDITORIUM_CENTRE_X, 0, AUDITORIUM_CENTRE_Z),
    roofRidgeLeft: point(ridgeLeft, PALACE_APEX_Y, AUDITORIUM_CENTRE_Z),
    roofRidgeRight: point(ridgeRight, PALACE_APEX_Y, AUDITORIUM_CENTRE_Z),
  },
  motionConstraints: {
    staticObject: true,
    facadeDetailDeferred: true,
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
