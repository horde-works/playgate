export type ObjectPoint = readonly [x: number, y: number, z: number];
export type ObjectTriangle = readonly [a: number, b: number, c: number];

export const reverseTriangleWinding = (
  triangles: readonly ObjectTriangle[],
): ObjectTriangle[] => triangles.map(([a, b, c]) => [a, c, b]);

export type ObjectMaterialId =
  | "foundation"
  | "brick"
  | "timber-dark"
  | "timber-mid"
  | "cladding"
  | "thatch"
  | "roof"
  | "roof-dark"
  | "roof-warm"
  | "earth"
  | "grass"
  | "grass-crown"
  | "grass-bench"
  | "water-reserve"
  | "path"
  | "bridge-seat"
  | "reserve"
  | "stone"
  | "mortar"
  | "shell-path"
  | "soil-bed"
  | "foliage"
  | "flower-red"
  | "flower-yellow"
  | "flower-blue"
  | "flower-purple"
  | "canvas"
  | "metal"
  | "paint-light"
  | "paint-accent"
  | "glazing"
  | "lamp-glass"
  | "lamp-bulb"
  | "dark-recess"
  | "opening"
  | "palace-concrete"
  | "palace-stone"
  | "palace-accent-blue"
  | "palace-accent-red"
  | "palace-frame-metal"
  | "palace-glazing"
  | "palace-roof-metal"
  | "palace-interior-dark"
  | "palace-sign-metal";

export type ObjectLightSource = {
  readonly position?: ObjectPoint;
  readonly color: string;
  readonly distance: number;
  readonly intensity: number;
  readonly dayIntensityFactor?: number;
  readonly poolPriority?: number;
  readonly localPoolCapacity?: number;
  readonly poolGroupId?: string;
  /** Keep one physical source from this group in wide architectural views. */
  readonly reservePoolGroup?: boolean;
  readonly interior?: boolean;
  readonly transition?: {
    readonly fadeInSeconds: number;
    readonly fadeOutSeconds: number;
  };
};

type ObjectPartBase = {
  id: string;
  material: ObjectMaterialId;
  group: string;
  /** A real fixture owns its source on the bulb/flame contained by its lens. */
  light?: ObjectLightSource;
};

export type ObjectBoxPart = ObjectPartBase & {
  kind: "box";
  center: ObjectPoint;
  size: ObjectPoint;
  rotation?: ObjectPoint;
};

export type ObjectBeamPart = ObjectPartBase & {
  kind: "beam";
  from: ObjectPoint;
  to: ObjectPoint;
  width: number;
  depth: number;
};

export type ObjectCylinderPart = ObjectPartBase & {
  kind: "cylinder";
  from: ObjectPoint;
  to: ObjectPoint;
  radius: number;
  radialSegments: number;
};

export type ObjectMeshPart = ObjectPartBase & {
  kind: "mesh";
  vertices: readonly ObjectPoint[];
  triangles: readonly ObjectTriangle[];
  normals?: readonly ObjectPoint[];
  vertexColors?: readonly ObjectPoint[];
  showEdges?: boolean;
  doubleSided?: boolean;
};

export type ObjectLabPart =
  | ObjectBoxPart
  | ObjectBeamPart
  | ObjectCylinderPart
  | ObjectMeshPart;

export type ObjectLabView = {
  id: string;
  label: string;
  projection: "orthographic" | "perspective";
  position: ObjectPoint;
  target: ObjectPoint;
  orthoHeight?: number;
  fov?: number;
  hiddenGroups?: readonly string[];
  lighting?: "day" | "night";
};

export type ObjectLabModel = {
  id: string;
  revision: string;
  title: string;
  units: "metres";
  coordinates: {
    up: "+Y";
    front: "+Z";
    origin: "ground-centre" | "island-centroid";
  };
  sourceNotes: readonly string[];
  dimensions: {
    rotorSpan?: number;
    rotorRadius?: number;
    galleryDeckY?: number;
    galleryOuterDiameter?: number;
    hubY?: number;
    capCrownY?: number;
    maximumOperatingHeight?: number;
    [key: string]: number | undefined;
  };
  labMetrics: readonly { label: string; value: number; decimals?: number; signed?: boolean; unit?: string }[];
  anchors: Readonly<Record<string, ObjectPoint>>;
  rotor?: {
    pivot: ObjectPoint;
    axis: ObjectPoint;
    fixedPhaseDegrees: number;
    motion: "constant-rotation-only";
    windCoupling: false;
  };
  motionConstraints?: Readonly<Record<string, boolean | string | number>>;
  labEnvironment?: {
    floorRadius?: number;
    gridSize?: number;
    gridDivisions?: number;
    fogNear?: number;
    fogFar?: number;
    floorY?: number;
  };
  parts: readonly ObjectLabPart[];
  views: readonly ObjectLabView[];
};
