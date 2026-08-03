import type {
  ObjectLabModel,
  ObjectLabPart,
  ObjectMaterialId,
  ObjectMeshPart,
  ObjectPoint,
} from "./objectModel.ts";

export const DE_KAT_ROTOR_SPAN = 21.76;
export const DE_KAT_ROTOR_RADIUS = DE_KAT_ROTOR_SPAN / 2;
export const DE_KAT_GALLERY_Y = 7.1;
export const DE_KAT_HUB_Y = 15.8;
export const DE_KAT_CAP_CROWN_Y = 19;
export const DE_KAT_FIXED_ROTOR_PHASE_DEGREES = 37.5;

const TAU = Math.PI * 2;
const OCTAGON = 8;
const ROTOR_Z = 5.15;

const parts: ObjectLabPart[] = [];

const point = (x: number, y: number, z: number): ObjectPoint => [x, y, z];

const polar = (radius: number, y: number, angle: number): ObjectPoint => [
  Math.sin(angle) * radius,
  y,
  Math.cos(angle) * radius,
];

const addBeam = (
  id: string,
  group: ObjectLabPart["group"],
  material: ObjectMaterialId,
  from: ObjectPoint,
  to: ObjectPoint,
  width: number,
  depth = width,
) => {
  parts.push({ kind: "beam", id, group, material, from, to, width, depth });
};

const addCylinder = (
  id: string,
  group: ObjectLabPart["group"],
  material: ObjectMaterialId,
  from: ObjectPoint,
  to: ObjectPoint,
  radius: number,
  radialSegments = 16,
) => {
  parts.push({ kind: "cylinder", id, group, material, from, to, radius, radialSegments });
};

const addBox = (
  id: string,
  group: ObjectLabPart["group"],
  material: ObjectMaterialId,
  center: ObjectPoint,
  size: ObjectPoint,
  rotation?: ObjectPoint,
) => {
  parts.push({ kind: "box", id, group, material, center, size, rotation });
};

const addMesh = (
  id: string,
  group: ObjectLabPart["group"],
  material: ObjectMaterialId,
  vertices: ObjectPoint[],
  triangles: Array<readonly [number, number, number]>,
  doubleSided = false,
) => {
  parts.push({ kind: "mesh", id, group, material, vertices, triangles, doubleSided });
};

const octagonalFrustum = (
  id: string,
  group: ObjectLabPart["group"],
  material: ObjectMaterialId,
  y0: number,
  y1: number,
  radius0: number,
  radius1: number,
) => {
  const vertices: ObjectPoint[] = [];
  for (let ring = 0; ring < 2; ring += 1) {
    for (let index = 0; index < OCTAGON; index += 1) {
      const angle = (index / OCTAGON) * TAU + Math.PI / OCTAGON;
      vertices.push(polar(ring === 0 ? radius0 : radius1, ring === 0 ? y0 : y1, angle));
    }
  }
  const triangles: Array<readonly [number, number, number]> = [];
  for (let index = 0; index < OCTAGON; index += 1) {
    const next = (index + 1) % OCTAGON;
    triangles.push([index, next, OCTAGON + next], [index, OCTAGON + next, OCTAGON + index]);
  }
  triangles.push([0, 2, 1], [0, 3, 2], [0, 4, 3], [0, 5, 4], [0, 6, 5], [0, 7, 6]);
  triangles.push([8, 9, 10], [8, 10, 11], [8, 11, 12], [8, 12, 13], [8, 13, 14], [8, 14, 15]);
  addMesh(id, group, material, vertices, triangles);
};

const octagonalAnnulus = (
  id: string,
  y: number,
  innerRadius: number,
  outerRadius: number,
  thickness: number,
) => {
  const vertices: ObjectPoint[] = [];
  for (const level of [y - thickness / 2, y + thickness / 2]) {
    for (const radius of [innerRadius, outerRadius]) {
      for (let index = 0; index < OCTAGON; index += 1) {
        const angle = (index / OCTAGON) * TAU + Math.PI / OCTAGON;
        vertices.push(polar(radius, level, angle));
      }
    }
  }
  const triangles: Array<readonly [number, number, number]> = [];
  for (let index = 0; index < OCTAGON; index += 1) {
    const next = (index + 1) % OCTAGON;
    const lowerInner = index;
    const lowerOuter = OCTAGON + index;
    const upperInner = OCTAGON * 2 + index;
    const upperOuter = OCTAGON * 3 + index;
    const lowerInnerNext = next;
    const lowerOuterNext = OCTAGON + next;
    const upperInnerNext = OCTAGON * 2 + next;
    const upperOuterNext = OCTAGON * 3 + next;
    triangles.push(
      [upperInner, upperOuterNext, upperOuter],
      [upperInner, upperInnerNext, upperOuterNext],
      [lowerInner, lowerOuter, lowerOuterNext],
      [lowerInner, lowerOuterNext, lowerInnerNext],
      [lowerOuter, upperOuter, upperOuterNext],
      [lowerOuter, upperOuterNext, lowerOuterNext],
      [lowerInner, upperInnerNext, upperInner],
      [lowerInner, lowerInnerNext, upperInnerNext],
    );
  }
  addMesh(id, "gallery", "timber-mid", vertices, triangles);
};

const addCapHull = () => {
  const sections = [
    { z: -3.1, halfWidth: 1.15, bottom: 15.25, top: 16.45 },
    { z: -1.45, halfWidth: 2.25, bottom: 14.72, top: 18.15 },
    { z: 0.65, halfWidth: 2.62, bottom: 14.62, top: DE_KAT_CAP_CROWN_Y },
    { z: 2.65, halfWidth: 2.22, bottom: 14.9, top: 18.15 },
    { z: 4.05, halfWidth: 1.08, bottom: 15.35, top: 16.85 },
  ];
  const vertices: ObjectPoint[] = [];
  for (const section of sections) {
    vertices.push(
      point(-section.halfWidth, section.bottom, section.z),
      point(section.halfWidth, section.bottom, section.z),
      point(-section.halfWidth, section.top, section.z),
      point(section.halfWidth, section.top, section.z),
    );
  }
  const triangles: Array<readonly [number, number, number]> = [];
  for (let section = 0; section < sections.length - 1; section += 1) {
    const a = section * 4;
    const b = (section + 1) * 4;
    triangles.push(
      [a, b + 1, a + 1], [a, b, b + 1],
      [a + 2, a + 3, b + 3], [a + 2, b + 3, b + 2],
      [a, a + 2, b + 2], [a, b + 2, b],
      [a + 1, b + 1, b + 3], [a + 1, b + 3, a + 3],
    );
  }
  triangles.push([0, 1, 3], [0, 3, 2]);
  const end = (sections.length - 1) * 4;
  triangles.push([end, end + 3, end + 1], [end, end + 2, end + 3]);
  addMesh("cap-hull", "cap", "roof", vertices, triangles);

  for (const [index, section] of sections.entries()) {
    addBeam(
      `cap-rib-${index}`,
      "cap",
      "timber-dark",
      point(-section.halfWidth - 0.04, section.top - 0.05, section.z),
      point(section.halfWidth + 0.04, section.top - 0.05, section.z),
      0.12,
      0.16,
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
    DE_KAT_HUB_Y + radialY * radius + tangentY * tangentOffset,
    z,
  );
};

const addSail = (blade: number) => {
  const angle = (DE_KAT_FIXED_ROTOR_PHASE_DEGREES * Math.PI) / 180 + blade * Math.PI / 2;
  const trailingAt = (radius: number) => 0.44 + (radius / DE_KAT_ROTOR_RADIUS) * 1.55;
  const stockStart = rotorPoint(angle, 0.16, 0, ROTOR_Z + 0.02);
  const stockEnd = rotorPoint(angle, DE_KAT_ROTOR_RADIUS, 0, ROTOR_Z + 0.02);
  addBeam(`rotor-${blade}-stock`, "rotor", "timber-dark", stockStart, stockEnd, 0.31, 0.24);

  const rootRadius = 1.35;
  const tipRadius = DE_KAT_ROTOR_RADIUS - 0.18;
  addBeam(
    `rotor-${blade}-trailing-rail`,
    "rotor",
    "timber-mid",
    rotorPoint(angle, rootRadius, trailingAt(rootRadius), ROTOR_Z + 0.02),
    rotorPoint(angle, tipRadius, trailingAt(tipRadius), ROTOR_Z + 0.02),
    0.18,
    0.14,
  );

  const battenRadii = [1.55, 2.7, 3.85, 5, 6.15, 7.3, 8.45, 9.6, 10.55];
  for (const [index, radius] of battenRadii.entries()) {
    addBeam(
      `rotor-${blade}-batten-${index}`,
      "rotor",
      "timber-mid",
      rotorPoint(angle, radius, -0.03, ROTOR_Z + 0.06),
      rotorPoint(angle, radius, trailingAt(radius), ROTOR_Z + 0.06),
      0.105,
      0.09,
    );
  }
  addBeam(
    `rotor-${blade}-diagonal`,
    "rotor",
    "timber-mid",
    rotorPoint(angle, rootRadius + 0.2, 0.16, ROTOR_Z + 0.09),
    rotorPoint(angle, tipRadius - 0.25, trailingAt(tipRadius) - 0.14, ROTOR_Z + 0.09),
    0.095,
    0.08,
  );

  const panelInner = 1.5;
  const panelOuter = 10.5;
  addMesh(
    `rotor-${blade}-canvas`,
    "rotor",
    "canvas",
    [
      rotorPoint(angle, panelInner, 0.13, ROTOR_Z - 0.055),
      rotorPoint(angle, panelInner, trailingAt(panelInner) - 0.12, ROTOR_Z - 0.055),
      rotorPoint(angle, panelOuter, trailingAt(panelOuter) - 0.15, ROTOR_Z - 0.055),
      rotorPoint(angle, panelOuter, 0.13, ROTOR_Z - 0.055),
    ],
    [[0, 1, 2], [0, 2, 3]],
    true,
  );
};

// Foundation and exposed octagonal lower frame.
octagonalFrustum("foundation-plinth", "foundation", "foundation", 0, 0.42, 6.05, 5.86);
octagonalFrustum("underframe-shadow-core", "underframe", "opening", 0.43, 4.62, 5.48, 5.15);

for (let index = 0; index < OCTAGON; index += 1) {
  const angle = (index / OCTAGON) * TAU + Math.PI / OCTAGON;
  const nextAngle = ((index + 1) / OCTAGON) * TAU + Math.PI / OCTAGON;
  addBeam(
    `underframe-post-${index}`,
    "underframe",
    "timber-dark",
    polar(5.62, 0.42, angle),
    polar(5.14, 5.05, angle),
    0.38,
    0.38,
  );
  addBeam(
    `underframe-sill-${index}`,
    "underframe",
    "timber-dark",
    polar(5.6, 0.65, angle),
    polar(5.6, 0.65, nextAngle),
    0.32,
    0.32,
  );
  addBeam(
    `underframe-ring-${index}`,
    "underframe",
    "timber-dark",
    polar(5.16, 4.76, angle),
    polar(5.16, 4.76, nextAngle),
    0.32,
    0.32,
  );
  if (index !== 3) {
    addBeam(
      `underframe-brace-${index}`,
      "underframe",
      "timber-mid",
      polar(5.48, 0.82, angle),
      polar(5.12, 4.45, nextAngle),
      0.24,
      0.2,
    );
  }
}

// A real dark opening and its structural frame, on the +Z face.
addBox("front-door-opening", "underframe", "opening", point(0, 1.65, 5.5), point(1.78, 2.75, 0.16));
addBeam("front-door-left", "underframe", "timber-dark", point(-1.02, 0.48, 5.62), point(-1.02, 3.15, 5.37), 0.28, 0.24);
addBeam("front-door-right", "underframe", "timber-dark", point(1.02, 0.48, 5.62), point(1.02, 3.15, 5.37), 0.28, 0.24);
addBeam("front-door-head", "underframe", "timber-dark", point(-1.04, 3.12, 5.38), point(1.04, 3.12, 5.38), 0.28, 0.24);

// Tapered smock. The octagonal cross-section is the primary silhouette owner.
octagonalFrustum("smock-shell", "smock", "cladding", 4.58, 14.72, 5.63, 3.14);
for (let index = 0; index < OCTAGON; index += 1) {
  const angle = (index / OCTAGON) * TAU + Math.PI / OCTAGON;
  addBeam(
    `smock-corner-${index}`,
    "smock",
    "timber-dark",
    polar(5.66, 4.62, angle),
    polar(3.17, 14.7, angle),
    0.18,
    0.16,
  );
}

// Gallery deck, brackets and rail are derived from one octagonal radius family.
octagonalAnnulus("gallery-deck", DE_KAT_GALLERY_Y, 4.38, 6.6, 0.3);
for (let index = 0; index < OCTAGON; index += 1) {
  const angle = (index / OCTAGON) * TAU + Math.PI / OCTAGON;
  const nextAngle = ((index + 1) / OCTAGON) * TAU + Math.PI / OCTAGON;
  addBeam(
    `gallery-bracket-${index}`,
    "gallery",
    "timber-dark",
    polar(4.77, 5.32, angle),
    polar(6.12, 6.98, angle),
    0.22,
    0.2,
  );
  addBeam(
    `gallery-post-${index}`,
    "gallery",
    "timber-dark",
    polar(6.28, 7.18, angle),
    polar(6.28, 8.16, angle),
    0.13,
    0.13,
  );
  addBeam(
    `gallery-rail-${index}`,
    "gallery",
    "timber-dark",
    polar(6.28, 8.12, angle),
    polar(6.28, 8.12, nextAngle),
    0.12,
    0.12,
  );
  addBeam(
    `gallery-midrail-${index}`,
    "gallery",
    "timber-mid",
    polar(6.28, 7.7, angle),
    polar(6.28, 7.7, nextAngle),
    0.08,
    0.08,
  );
}

// Small front window; frame sits proud of the weatherboarding.
addBox("smock-window-recess", "smock", "opening", point(0, 10.72, 4.18), point(0.92, 1.18, 0.12));
addBeam("smock-window-left", "smock", "timber-dark", point(-0.55, 10.08, 4.23), point(-0.55, 11.38, 4.23), 0.13, 0.1);
addBeam("smock-window-right", "smock", "timber-dark", point(0.55, 10.08, 4.23), point(0.55, 11.38, 4.23), 0.13, 0.1);
addBeam("smock-window-top", "smock", "timber-dark", point(-0.56, 11.39, 4.23), point(0.56, 11.39, 4.23), 0.13, 0.1);
addBeam("smock-window-bottom", "smock", "timber-dark", point(-0.56, 10.07, 4.23), point(0.56, 10.07, 4.23), 0.13, 0.1);
addBeam("smock-window-mullion", "smock", "timber-mid", point(0, 10.11, 4.27), point(0, 11.35, 4.27), 0.07, 0.07);

addCapHull();
addCylinder("windshaft", "rotor", "metal", point(0, DE_KAT_HUB_Y, 2.25), point(0, DE_KAT_HUB_Y, 5.62), 0.31, 20);
addCylinder("rotor-hub", "rotor", "timber-dark", point(0, DE_KAT_HUB_Y, 4.84), point(0, DE_KAT_HUB_Y, 5.52), 0.62, 20);
for (let blade = 0; blade < 4; blade += 1) addSail(blade);

// Attached paint shed: separate footprint, real gable volume, and exposed join to the mill.
addBox("annex-wall", "annex", "cladding", point(6.75, 2.05, -1.5), point(7.2, 4.1, 5.55));
const annexRoofVertices: ObjectPoint[] = [
  point(3.02, 4.06, -4.62), point(10.48, 4.06, -4.62),
  point(3.02, 4.06, 1.62), point(10.48, 4.06, 1.62),
  point(3.02, 5.48, -1.5), point(10.48, 5.48, -1.5),
];
addMesh(
  "annex-gable-roof",
  "annex",
  "roof",
  annexRoofVertices,
  [[0, 1, 5], [0, 5, 4], [4, 5, 3], [4, 3, 2], [0, 4, 2], [1, 3, 5]],
);
addBox("annex-door-recess", "annex", "opening", point(10.39, 1.5, -1.5), point(0.13, 2.65, 1.52));
addBeam("annex-door-left", "annex", "timber-dark", point(10.51, 0.2, -2.38), point(10.51, 2.96, -2.38), 0.18, 0.18);
addBeam("annex-door-right", "annex", "timber-dark", point(10.51, 0.2, -0.62), point(10.51, 2.96, -0.62), 0.18, 0.18);
addBeam("annex-door-head", "annex", "timber-dark", point(10.51, 2.96, -2.4), point(10.51, 2.96, -0.6), 0.18, 0.18);

export const deKatObject: ObjectLabModel = {
  id: "dutch-windmill-de-kat-m1",
  revision: "m1-2026-08-02",
  title: "De Kat-type paint mill — structural grey model",
  units: "metres",
  coordinates: { up: "+Y", front: "+Z", origin: "ground-centre" },
  sourceNotes: [
    "Sail span 21.76 m and gallery level 7.10 m follow the De Nederlandse Molendatabase record.",
    "Octagonal pine smock, octagonal wooden understructure and attached shed follow the published De Kat mill guide.",
    "Cap dimensions and annex massing are authored from multi-angle photographic proportions, not survey drawings.",
  ],
  dimensions: {
    rotorSpan: DE_KAT_ROTOR_SPAN,
    rotorRadius: DE_KAT_ROTOR_RADIUS,
    galleryDeckY: DE_KAT_GALLERY_Y,
    galleryOuterDiameter: 13.2,
    hubY: DE_KAT_HUB_Y,
    capCrownY: DE_KAT_CAP_CROWN_Y,
    maximumOperatingHeight: DE_KAT_HUB_Y + DE_KAT_ROTOR_RADIUS,
    smockAcrossFlatsAtBase: 10.4,
    smockAcrossFlatsAtTop: 5.8,
  },
  labMetrics: [
    { label: "SAIL SPAN", value: DE_KAT_ROTOR_SPAN, decimals: 2 },
    { label: "GALLERY", value: DE_KAT_GALLERY_Y, decimals: 2 },
    { label: "HUB", value: DE_KAT_HUB_Y, decimals: 2 },
    { label: "CAP", value: DE_KAT_CAP_CROWN_Y, decimals: 2 },
  ],
  anchors: {
    groundCentre: point(0, 0, 0),
    galleryCentre: point(0, DE_KAT_GALLERY_Y, 0),
    rotorPivot: point(0, DE_KAT_HUB_Y, ROTOR_Z),
    annexCentre: point(6.75, 0, -1.5),
  },
  rotor: {
    pivot: point(0, DE_KAT_HUB_Y, ROTOR_Z),
    axis: point(0, 0, 1),
    fixedPhaseDegrees: DE_KAT_FIXED_ROTOR_PHASE_DEGREES,
    motion: "constant-rotation-only",
    windCoupling: false,
  },
  motionConstraints: {
    windSimulation: false,
    capYaw: false,
    bodyYaw: false,
    sailRotation: "constant-only",
  },
  parts,
  views: [
    { id: "front", label: "Front +Z", projection: "orthographic", position: point(0, 13, 42), target: point(0, 12.4, 0), orthoHeight: 31 },
    { id: "left", label: "Left profile", projection: "orthographic", position: point(-42, 13, 0), target: point(0, 12.4, 0), orthoHeight: 31 },
    { id: "rear", label: "Rear -Z", projection: "orthographic", position: point(0, 13, -42), target: point(0, 12.4, 0), orthoHeight: 31 },
    { id: "three-quarter-left", label: "3/4 left", projection: "perspective", position: point(-31, 22, 36), target: point(0, 11.2, 0), fov: 36 },
    { id: "three-quarter-right", label: "3/4 right", projection: "perspective", position: point(34, 21, 34), target: point(0, 11, 0), fov: 36 },
    { id: "high-three-quarter", label: "High 3/4", projection: "perspective", position: point(-30, 35, 35), target: point(0, 10, 0), fov: 38 },
    { id: "rotor-joint", label: "Rotor joint", projection: "perspective", position: point(-8, 18.5, 17), target: point(0, 15.8, 4.2), fov: 30 },
    { id: "silhouette", label: "Silhouette control", projection: "orthographic", position: point(0, 13, 42), target: point(0, 12.4, 0), orthoHeight: 29 },
  ],
};

export const deKatMeshParts = deKatObject.parts.filter(
  (part): part is ObjectMeshPart => part.kind === "mesh",
);
