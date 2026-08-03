import type {
  ObjectLabModel,
  ObjectLabPart,
  ObjectMaterialId,
  ObjectPoint,
} from "./objectModel.ts";

export const OUDEGEIN_ROTOR_SPAN = 24.9;
export const OUDEGEIN_ROTOR_RADIUS = OUDEGEIN_ROTOR_SPAN / 2;
export const OUDEGEIN_HUB_Y = 12.85;
export const OUDEGEIN_SCOOP_WHEEL_DIAMETER = 4.72;
export const OUDEGEIN_WIND_SHAFT_LENGTH = 5.14;
export const OUDEGEIN_FIXED_ROTOR_PHASE_DEGREES = 5;

const ROTOR_Z = 5.65;
const TAU = Math.PI * 2;
const parts: ObjectLabPart[] = [];

const point = (x: number, y: number, z: number): ObjectPoint => [x, y, z];

const addBeam = (
  id: string,
  group: string,
  material: ObjectMaterialId,
  from: ObjectPoint,
  to: ObjectPoint,
  width: number,
  depth = width,
) => parts.push({ kind: "beam", id, group, material, from, to, width, depth });

const addBox = (
  id: string,
  group: string,
  material: ObjectMaterialId,
  center: ObjectPoint,
  size: ObjectPoint,
  rotation?: ObjectPoint,
) => parts.push({ kind: "box", id, group, material, center, size, rotation });

const addCylinder = (
  id: string,
  group: string,
  material: ObjectMaterialId,
  from: ObjectPoint,
  to: ObjectPoint,
  radius: number,
  radialSegments = 16,
) => parts.push({ kind: "cylinder", id, group, material, from, to, radius, radialSegments });

const addMesh = (
  id: string,
  group: string,
  material: ObjectMaterialId,
  vertices: ObjectPoint[],
  triangles: Array<readonly [number, number, number]>,
  doubleSided = false,
) => parts.push({ kind: "mesh", id, group, material, vertices, triangles, doubleSided });

const addRectangularFrustum = (
  id: string,
  group: string,
  material: ObjectMaterialId,
  y0: number,
  y1: number,
  halfX0: number,
  halfZ0: number,
  halfX1: number,
  halfZ1: number,
) => {
  const vertices: ObjectPoint[] = [
    point(-halfX0, y0, -halfZ0), point(halfX0, y0, -halfZ0),
    point(halfX0, y0, halfZ0), point(-halfX0, y0, halfZ0),
    point(-halfX1, y1, -halfZ1), point(halfX1, y1, -halfZ1),
    point(halfX1, y1, halfZ1), point(-halfX1, y1, halfZ1),
  ];
  addMesh(id, group, material, vertices, [
    [0, 1, 5], [0, 5, 4],
    [1, 2, 6], [1, 6, 5],
    [2, 3, 7], [2, 7, 6],
    [3, 0, 4], [3, 4, 7],
    [0, 3, 2], [0, 2, 1],
    [4, 5, 6], [4, 6, 7],
  ]);
};

const addRing = (
  id: string,
  group: string,
  material: ObjectMaterialId,
  center: ObjectPoint,
  basisU: ObjectPoint,
  basisV: ObjectPoint,
  radius: number,
  segments: number,
  thickness: number,
  depth = thickness,
) => {
  const ringPoint = (angle: number): ObjectPoint => point(
    center[0] + basisU[0] * Math.cos(angle) * radius + basisV[0] * Math.sin(angle) * radius,
    center[1] + basisU[1] * Math.cos(angle) * radius + basisV[1] * Math.sin(angle) * radius,
    center[2] + basisU[2] * Math.cos(angle) * radius + basisV[2] * Math.sin(angle) * radius,
  );
  for (let index = 0; index < segments; index += 1) {
    addBeam(
      `${id}-${index}`,
      group,
      material,
      ringPoint((index / segments) * TAU),
      ringPoint(((index + 1) / segments) * TAU),
      thickness,
      depth,
    );
  }
};

const rotorPoint = (angle: number, radius: number, tangentOffset: number, z = ROTOR_Z): ObjectPoint => {
  const radialX = Math.cos(angle);
  const radialY = Math.sin(angle);
  const tangentX = -radialY;
  const tangentY = radialX;
  return point(
    radialX * radius + tangentX * tangentOffset,
    OUDEGEIN_HUB_Y + radialY * radius + tangentY * tangentOffset,
    z,
  );
};

const addOldDutchSail = (blade: number) => {
  const angle = (OUDEGEIN_FIXED_ROTOR_PHASE_DEGREES * Math.PI) / 180 + blade * Math.PI / 2;
  const trailingAt = (radius: number) => 0.36 + (radius / OUDEGEIN_ROTOR_RADIUS) * 1.72;
  addBeam(
    `rotor-${blade}-stock`,
    "rotor",
    "timber-dark",
    rotorPoint(angle, 0.15, 0, ROTOR_Z + 0.02),
    rotorPoint(angle, OUDEGEIN_ROTOR_RADIUS, 0, ROTOR_Z + 0.02),
    0.31,
    0.24,
  );
  const rootRadius = 1.45;
  const tipRadius = OUDEGEIN_ROTOR_RADIUS - 0.18;
  addBeam(
    `rotor-${blade}-trailing-rail`,
    "rotor",
    "timber-mid",
    rotorPoint(angle, rootRadius, trailingAt(rootRadius), ROTOR_Z + 0.03),
    rotorPoint(angle, tipRadius, trailingAt(tipRadius), ROTOR_Z + 0.03),
    0.17,
    0.13,
  );
  const battenCount = 11;
  for (let index = 0; index < battenCount; index += 1) {
    const radius = 1.65 + index * ((10.95 - 1.65) / (battenCount - 1));
    addBeam(
      `rotor-${blade}-batten-${index}`,
      "rotor",
      "timber-mid",
      rotorPoint(angle, radius, 0.08, ROTOR_Z + 0.07),
      rotorPoint(angle, radius, trailingAt(radius), ROTOR_Z + 0.07),
      0.09,
      0.075,
    );
  }
  addBeam(
    `rotor-${blade}-diagonal`,
    "rotor",
    "timber-mid",
    rotorPoint(angle, 1.7, 0.18, ROTOR_Z + 0.09),
    rotorPoint(angle, 11.65, trailingAt(11.65) - 0.15, ROTOR_Z + 0.09),
    0.085,
    0.07,
  );
  addMesh(
    `rotor-${blade}-canvas`,
    "rotor",
    "canvas",
    [
      rotorPoint(angle, 1.58, 0.16, ROTOR_Z - 0.055),
      rotorPoint(angle, 1.58, trailingAt(1.58) - 0.1, ROTOR_Z - 0.055),
      rotorPoint(angle, 12.02, trailingAt(12.02) - 0.14, ROTOR_Z - 0.055),
      rotorPoint(angle, 12.02, 0.16, ROTOR_Z - 0.055),
    ],
    [[0, 1, 2], [0, 2, 3]],
    true,
  );
};

// Brick seat and the old square, thatched lower tower.
addBox("brick-plinth", "foundation", "brick", point(0, 0.3, 0), point(9.05, 0.6, 8.65));
addRectangularFrustum("lower-tower-thatch", "lower-tower", "thatch", 0.58, 8.15, 4.3, 4.1, 1.48, 1.42);
for (const [index, signs] of [[-1, -1], [1, -1], [1, 1], [-1, 1]].entries()) {
  const [sx, sz] = signs;
  addBeam(
    `lower-tower-corner-${index}`,
    "lower-tower",
    "timber-dark",
    point(sx * 4.28, 0.6, sz * 4.08),
    point(sx * 1.49, 8.16, sz * 1.43),
    0.2,
    0.18,
  );
}

const lowerFaceSlope = -Math.atan((4.1 - 1.42) / (8.15 - 0.58));
const lowerFrontZAt = (y: number) => 4.1 + (1.42 - 4.1) * ((y - 0.58) / (8.15 - 0.58));
addBox("lower-window-recess", "lower-tower", "opening", point(0, 3.05, lowerFrontZAt(3.05) + 0.08), point(1.28, 1.55, 0.13), point(lowerFaceSlope, 0, 0));
for (const x of [-0.72, 0.72]) {
  addBeam(`lower-window-jamb-${x}`, "lower-tower", "paint-light", point(x, 2.2, lowerFrontZAt(2.2) + 0.17), point(x, 3.9, lowerFrontZAt(3.9) + 0.17), 0.13, 0.1);
}
addBeam("lower-window-head", "lower-tower", "paint-light", point(-0.75, 3.91, lowerFrontZAt(3.91) + 0.17), point(0.75, 3.91, lowerFrontZAt(3.91) + 0.17), 0.14, 0.1);
addBeam("lower-window-sill", "lower-tower", "paint-light", point(-0.75, 2.19, lowerFrontZAt(2.19) + 0.17), point(0.75, 2.19, lowerFrontZAt(2.19) + 0.17), 0.14, 0.1);
addBeam("lower-window-mullion", "lower-tower", "paint-light", point(0, 2.24, lowerFrontZAt(2.24) + 0.22), point(0, 3.86, lowerFrontZAt(3.86) + 0.22), 0.07, 0.07);

// Exposed seat: the upper house is a separate machine resting on this cross.
addCylinder("main-post", "seat", "timber-dark", point(0, 6.65, 0), point(0, 8.75, 0), 0.54, 16);
addBeam("seat-cross-x", "seat", "timber-dark", point(-2.25, 8.2, 0), point(2.25, 8.2, 0), 0.5, 0.44);
addBeam("seat-cross-z", "seat", "timber-dark", point(0, 8.2, -2.15), point(0, 8.2, 2.15), 0.5, 0.44);
addBox("upper-house-floor", "upper-house", "timber-dark", point(0, 8.55, 0.15), point(5.9, 0.42, 7.65));

// Rectangular upper house; it never merges into the thatched pyramid.
addBox("upper-house-shell", "upper-house", "cladding", point(0, 10.62, 0.28), point(5.6, 4.05, 7.4));
const upperRoofVertices: ObjectPoint[] = [
  point(-3.02, 12.62, -3.58), point(3.02, 12.62, -3.58),
  point(-3.02, 12.62, 4.04), point(3.02, 12.62, 4.04),
  point(0, 14.08, -3.58), point(0, 14.08, 4.04),
];
addMesh("upper-house-roof", "upper-house", "roof", upperRoofVertices, [
  [0, 4, 5], [0, 5, 2],
  [4, 1, 3], [4, 3, 5],
  [0, 1, 4], [2, 5, 3],
]);
for (const [id, x, z] of [
  ["rear-left", -2.82, -3.45], ["rear-right", 2.82, -3.45],
  ["front-left", -2.82, 3.92], ["front-right", 2.82, 3.92],
] as const) {
  addBeam(`upper-corner-${id}`, "upper-house", "timber-dark", point(x, 8.48, z), point(x, 12.68, z), 0.2, 0.18);
}
addBeam("roof-ridge", "upper-house", "paint-light", point(0, 14.12, -3.7), point(0, 14.12, 4.12), 0.16, 0.16);
addBeam("front-eave", "upper-house", "paint-light", point(-3.06, 12.6, 4.08), point(3.06, 12.6, 4.08), 0.18, 0.16);
addBeam("rear-eave", "upper-house", "paint-light", point(-3.06, 12.6, -3.62), point(3.06, 12.6, -3.62), 0.18, 0.16);

addBox("upper-front-opening", "upper-house", "opening", point(0, 10.85, 4.01), point(1.24, 1.6, 0.13));
for (const x of [-0.72, 0.72]) {
  addBeam(`upper-front-window-jamb-${x}`, "upper-house", "paint-light", point(x, 9.98, 4.11), point(x, 11.72, 4.11), 0.13, 0.1);
}
addBeam("upper-front-window-head", "upper-house", "paint-light", point(-0.74, 11.73, 4.11), point(0.74, 11.73, 4.11), 0.13, 0.1);
addBeam("upper-front-window-sill", "upper-house", "paint-light", point(-0.74, 9.97, 4.11), point(0.74, 9.97, 4.11), 0.13, 0.1);

// Fixed windshaft and ground-sailer rotor.
addCylinder("windshaft", "rotor", "metal", point(0, OUDEGEIN_HUB_Y, 0.85), point(0, OUDEGEIN_HUB_Y, 5.99), 0.3, 20);
addCylinder("rotor-hub", "rotor", "timber-dark", point(0, OUDEGEIN_HUB_Y, 5.15), point(0, OUDEGEIN_HUB_Y, 5.92), 0.64, 20);
addCylinder("rotor-cap", "rotor", "paint-accent", point(0, OUDEGEIN_HUB_Y, 5.9), point(0, OUDEGEIN_HUB_Y, 6.15), 0.46, 20);
for (let blade = 0; blade < 4; blade += 1) addOldDutchSail(blade);

// Rear tail, access stair and handrails remain fixed in this world.
addBox("upper-rear-door", "upper-house", "opening", point(0, 10.25, -3.49), point(1.3, 2.45, 0.14));
addBeam("tail-beam-left", "tail", "timber-dark", point(-1.42, 9.3, -3.55), point(-0.64, 1.05, -11.35), 0.32, 0.28);
addBeam("tail-beam-right", "tail", "timber-dark", point(1.42, 9.3, -3.55), point(0.64, 1.05, -11.35), 0.32, 0.28);
addBeam("tail-cross-head", "tail", "timber-dark", point(-1.48, 9.25, -3.58), point(1.48, 9.25, -3.58), 0.3, 0.28);
addBeam("tail-cross-foot", "tail", "timber-dark", point(-0.78, 1.08, -11.38), point(0.78, 1.08, -11.38), 0.3, 0.28);

const stairCount = 18;
for (let index = 0; index < stairCount; index += 1) {
  const t = index / (stairCount - 1);
  addBox(
    `tail-stair-tread-${index}`,
    "tail",
    "timber-mid",
    point(0, 8.92 + (0.72 - 8.92) * t, -3.82 + (-9.62 + 3.82) * t),
    point(1.58, 0.11, 0.34),
  );
}
for (const x of [-0.86, 0.86]) {
  addBeam(`tail-stair-stringer-${x}`, "tail", "timber-dark", point(x, 8.94, -3.78), point(x, 0.7, -9.72), 0.18, 0.16);
  addBeam(`tail-stair-handrail-${x}`, "tail", "paint-light", point(x, 10.02, -3.8), point(x, 1.82, -9.78), 0.11, 0.1);
}

const tailWheelCenter = point(0.95, 2.08, -10.48);
addCylinder("tail-wheel-axle", "tail", "metal", point(0.38, 2.08, -10.48), point(1.52, 2.08, -10.48), 0.13, 12);
addRing("tail-wheel-rim", "tail", "paint-accent", tailWheelCenter, point(0, 1, 0), point(0, 0, 1), 1.08, 20, 0.11, 0.1);
for (let index = 0; index < 10; index += 1) {
  const angle = (index / 10) * TAU;
  addBeam(
    `tail-wheel-spoke-${index}`,
    "tail",
    "paint-light",
    tailWheelCenter,
    point(tailWheelCenter[0], tailWheelCenter[1] + Math.cos(angle) * 1.02, tailWheelCenter[2] + Math.sin(angle) * 1.02),
    0.08,
    0.07,
  );
}

// Rear water shaft and half-open scoop wheel. No water surface is authored here.
const scoopRadius = OUDEGEIN_SCOOP_WHEEL_DIAMETER / 2;
const scoopCenter = point(0, 2.58, -4.82);
addCylinder("water-shaft", "scoop-wheel", "metal", point(0, 2.58, -1.7), point(0, 2.58, -5.22), 0.24, 16);
for (const z of [-4.7, -5.0]) {
  const centre = point(0, scoopCenter[1], z);
  addRing(`scoop-rim-${z}`, "scoop-wheel", "metal", centre, point(1, 0, 0), point(0, 1, 0), scoopRadius, 24, 0.12, 0.1);
  for (let index = 0; index < 12; index += 1) {
    const angle = (index / 12) * TAU;
    addBeam(
      `scoop-spoke-${z}-${index}`,
      "scoop-wheel",
      "metal",
      centre,
      point(Math.cos(angle) * scoopRadius, scoopCenter[1] + Math.sin(angle) * scoopRadius, z),
      0.1,
      0.08,
    );
  }
}
for (let index = 0; index < 16; index += 1) {
  const angle = (index / 16) * TAU;
  const x = Math.cos(angle) * (scoopRadius - 0.08);
  const y = scoopCenter[1] + Math.sin(angle) * (scoopRadius - 0.08);
  addBeam(`scoop-paddle-${index}`, "scoop-wheel", "metal", point(x, y, -4.62), point(x, y, -5.08), 0.32, 0.14);
}
addBox("scoop-channel-left", "scoop-wheel", "foundation", point(-2.68, 0.52, -4.82), point(0.36, 1.04, 3.5));
addBox("scoop-channel-right", "scoop-wheel", "foundation", point(2.68, 0.52, -4.82), point(0.36, 1.04, 3.5));

export const oudegeinWipmolenObject: ObjectLabModel = {
  id: "dutch-windmill-oudegein-wipmolen-m2",
  revision: "m2-2026-08-02",
  title: "Poldermolen Oudegein-type wipmolen — structural grey model",
  units: "metres",
  coordinates: { up: "+Y", front: "+Z", origin: "ground-centre" },
  sourceNotes: [
    "Sail span 24.90 m, 5.14 m windshaft and half-open 4.72 × 0.30 m scoop wheel follow the Nederlandse Molendatabase passport.",
    "Thatched lower tower, separately rotating timber upper house, exposed seat and rear access/tail follow the Oudegein foundation construction photographs.",
    "Lower-tower and upper-house envelopes are authored from multi-angle photographic proportions because no survey drawing was available.",
  ],
  dimensions: {
    rotorSpan: OUDEGEIN_ROTOR_SPAN,
    rotorRadius: OUDEGEIN_ROTOR_RADIUS,
    hubY: OUDEGEIN_HUB_Y,
    maximumOperatingHeight: OUDEGEIN_HUB_Y + OUDEGEIN_ROTOR_RADIUS,
    bladeLowerClearance: OUDEGEIN_HUB_Y - OUDEGEIN_ROTOR_RADIUS,
    lowerTowerWidth: 8.6,
    lowerTowerDepth: 8.2,
    upperHouseWidth: 5.6,
    upperHouseDepth: 7.4,
    scoopWheelDiameter: OUDEGEIN_SCOOP_WHEEL_DIAMETER,
    scoopWheelWidth: 0.3,
    windShaftLength: OUDEGEIN_WIND_SHAFT_LENGTH,
  },
  labMetrics: [
    { label: "SAIL SPAN", value: OUDEGEIN_ROTOR_SPAN, decimals: 2 },
    { label: "HUB", value: OUDEGEIN_HUB_Y, decimals: 2 },
    { label: "TIP CLEARANCE", value: OUDEGEIN_HUB_Y - OUDEGEIN_ROTOR_RADIUS, decimals: 2 },
    { label: "SCOOP WHEEL Ø", value: OUDEGEIN_SCOOP_WHEEL_DIAMETER, decimals: 2 },
  ],
  anchors: {
    groundCentre: point(0, 0, 0),
    seatPivot: point(0, 8.2, 0),
    rotorPivot: point(0, OUDEGEIN_HUB_Y, ROTOR_Z),
    tailFoot: point(0, 0.7, -9.72),
    scoopWheelCentre: scoopCenter,
  },
  rotor: {
    pivot: point(0, OUDEGEIN_HUB_Y, ROTOR_Z),
    axis: point(0, 0, 1),
    fixedPhaseDegrees: OUDEGEIN_FIXED_ROTOR_PHASE_DEGREES,
    motion: "constant-rotation-only",
    windCoupling: false,
  },
  motionConstraints: {
    windSimulation: false,
    upperHouseYaw: false,
    tailYaw: false,
    scoopWheelRotation: false,
    sailRotation: "constant-only",
  },
  parts,
  views: [
    { id: "front", label: "Front +Z", projection: "orthographic", position: point(0, 12.5, 45), target: point(0, 12.35, 0), orthoHeight: 30.5 },
    { id: "left", label: "Left profile", projection: "orthographic", position: point(-45, 12.5, -1.8), target: point(0, 11.8, -1.8), orthoHeight: 30.5 },
    { id: "rear", label: "Rear -Z · scoop wheel", projection: "orthographic", position: point(0, 12.5, -48), target: point(0, 11.2, -1.5), orthoHeight: 31.5 },
    { id: "three-quarter-left", label: "3/4 left", projection: "perspective", position: point(-34, 21, 39), target: point(0, 10.7, -0.7), fov: 36 },
    { id: "three-quarter-right", label: "3/4 right", projection: "perspective", position: point(36, 20, 36), target: point(0, 10.5, -0.8), fov: 36 },
    { id: "high-three-quarter", label: "High 3/4", projection: "perspective", position: point(-34, 35, 38), target: point(0, 9.5, -1.1), fov: 38 },
    { id: "seat-and-tail", label: "Seat + tail joint", projection: "perspective", position: point(-17, 14, -22), target: point(0, 7.9, -3.1), fov: 34 },
    { id: "scoop-wheel", label: "Scoop wheel", projection: "perspective", position: point(5.5, 2.8, -14), target: point(0, 2.58, -4.82), fov: 30 },
    { id: "silhouette", label: "Silhouette control", projection: "orthographic", position: point(0, 12.5, 45), target: point(0, 12.35, 0), orthoHeight: 29.5 },
  ],
};
