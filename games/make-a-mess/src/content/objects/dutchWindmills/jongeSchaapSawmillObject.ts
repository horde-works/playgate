import type {
  ObjectLabModel,
  ObjectLabPart,
  ObjectMaterialId,
  ObjectPoint,
} from "./objectModel.ts";

export const JONGE_SCHAAP_ROTOR_SPAN = 20.68;
export const JONGE_SCHAAP_ROTOR_RADIUS = JONGE_SCHAAP_ROTOR_SPAN / 2;
export const JONGE_SCHAAP_GALLERY_Y = 5.5;
export const JONGE_SCHAAP_GALLERY_OUTER_DIAMETER = 11.6;
export const JONGE_SCHAAP_HUB_Y = 13.7;
export const JONGE_SCHAAP_CAP_CROWN_Y = 16.5;
export const JONGE_SCHAAP_TRANSMISSION_RATIO = 2.44;
export const JONGE_SCHAAP_FIXED_ROTOR_PHASE_DEGREES = 32;
export const JONGE_SCHAAP_TOWER_CENTRE_Z = 6.45;
export const JONGE_SCHAAP_ROTOR_PLANE_Z = JONGE_SCHAAP_TOWER_CENTRE_Z + 5.35;

const HEXAGON = 6;
const TAU = Math.PI * 2;
const TOWER_Z = JONGE_SCHAAP_TOWER_CENTRE_Z;
const ROTOR_Z = JONGE_SCHAAP_ROTOR_PLANE_Z;
const HALL_FRONT_Z = 11;
const HALL_REAR_Z = -9;
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

const polar = (radius: number, y: number, angle: number): ObjectPoint => point(
  Math.sin(angle) * radius,
  y,
  TOWER_Z + Math.cos(angle) * radius,
);

const hexagonalFrustum = (
  id: string,
  group: string,
  material: ObjectMaterialId,
  y0: number,
  y1: number,
  radius0: number,
  radius1: number,
) => {
  const vertices: ObjectPoint[] = [];
  for (let ring = 0; ring < 2; ring += 1) {
    for (let index = 0; index < HEXAGON; index += 1) {
      const angle = (index / HEXAGON) * TAU + Math.PI / HEXAGON;
      vertices.push(polar(ring === 0 ? radius0 : radius1, ring === 0 ? y0 : y1, angle));
    }
  }
  const triangles: Array<readonly [number, number, number]> = [];
  for (let index = 0; index < HEXAGON; index += 1) {
    const next = (index + 1) % HEXAGON;
    triangles.push([index, next, HEXAGON + next], [index, HEXAGON + next, HEXAGON + index]);
  }
  triangles.push([0, 2, 1], [0, 3, 2], [0, 4, 3], [0, 5, 4]);
  triangles.push([6, 7, 8], [6, 8, 9], [6, 9, 10], [6, 10, 11]);
  addMesh(id, group, material, vertices, triangles);
};

const hexagonalAnnulus = (
  id: string,
  y: number,
  innerRadius: number,
  outerRadius: number,
  thickness: number,
) => {
  const vertices: ObjectPoint[] = [];
  for (const level of [y - thickness / 2, y + thickness / 2]) {
    for (const radius of [innerRadius, outerRadius]) {
      for (let index = 0; index < HEXAGON; index += 1) {
        vertices.push(polar(radius, level, (index / HEXAGON) * TAU + Math.PI / HEXAGON));
      }
    }
  }
  const triangles: Array<readonly [number, number, number]> = [];
  for (let index = 0; index < HEXAGON; index += 1) {
    const next = (index + 1) % HEXAGON;
    const li = index;
    const lo = HEXAGON + index;
    const ui = HEXAGON * 2 + index;
    const uo = HEXAGON * 3 + index;
    const lin = next;
    const lon = HEXAGON + next;
    const uin = HEXAGON * 2 + next;
    const uon = HEXAGON * 3 + next;
    triangles.push(
      [ui, uon, uo], [ui, uin, uon],
      [li, lo, lon], [li, lon, lin],
      [lo, uo, uon], [lo, uon, lon],
      [li, uin, ui], [li, lin, uin],
    );
  }
  addMesh(id, "gallery", "timber-mid", vertices, triangles);
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

const addGableRoof = () => {
  const rearVertices: ObjectPoint[] = [
    point(-7.15, 4.1, HALL_REAR_Z - 0.2), point(7.15, 4.1, HALL_REAR_Z - 0.2),
    point(-7.15, 4.1, 1.65), point(7.15, 4.1, 1.65),
    point(0, 5.55, HALL_REAR_Z - 0.2), point(0, 5.55, 1.65),
  ];
  addMesh("saw-hall-roof-rear", "saw-hall", "roof", rearVertices, [
    [0, 4, 5], [0, 5, 2],
    [4, 1, 3], [4, 3, 5],
    [0, 1, 4], [2, 5, 3],
  ], true);
  const cutHalfWidth = 5.25;
  const cutEdgeY = 4.1 + (1 - cutHalfWidth / 7.15) * 1.45;
  addMesh("saw-hall-roof-front-left", "saw-hall", "roof", [
    point(-7.15, 4.1, 1.65), point(-cutHalfWidth, cutEdgeY, 1.65),
    point(-7.15, 4.1, HALL_FRONT_Z + 0.2), point(-cutHalfWidth, cutEdgeY, HALL_FRONT_Z + 0.2),
  ], [[0, 1, 3], [0, 3, 2]], true);
  addMesh("saw-hall-roof-front-right", "saw-hall", "roof", [
    point(cutHalfWidth, cutEdgeY, 1.65), point(7.15, 4.1, 1.65),
    point(cutHalfWidth, cutEdgeY, HALL_FRONT_Z + 0.2), point(7.15, 4.1, HALL_FRONT_Z + 0.2),
  ], [[0, 1, 3], [0, 3, 2]], true);
  addBeam("saw-hall-ridge", "saw-hall", "paint-light", point(0, 5.58, HALL_REAR_Z - 0.3), point(0, 5.58, 1.62), 0.17, 0.17);
  addBeam("saw-hall-left-eave", "saw-hall", "paint-light", point(-7.18, 4.08, HALL_REAR_Z - 0.25), point(-7.18, 4.08, HALL_FRONT_Z + 0.25), 0.18, 0.16);
  addBeam("saw-hall-right-eave", "saw-hall", "paint-light", point(7.18, 4.08, HALL_REAR_Z - 0.25), point(7.18, 4.08, HALL_FRONT_Z + 0.25), 0.18, 0.16);
  // Flashing/collar makes the tower-to-roof joint explicit instead of allowing
  // two opaque shells to pass through each other.
  for (const side of [-1, 1]) {
    addBeam(`tower-roof-collar-side-${side}`, "roof-joint", "metal", point(side * cutHalfWidth, cutEdgeY + 0.08, 1.62), point(side * cutHalfWidth, cutEdgeY + 0.08, HALL_FRONT_Z + 0.18), 0.16, 0.12);
  }
  addBeam("tower-roof-collar-rear-left", "roof-joint", "metal", point(-cutHalfWidth, cutEdgeY + 0.08, 1.62), point(0, 5.63, 1.62), 0.16, 0.12);
  addBeam("tower-roof-collar-rear-right", "roof-joint", "metal", point(0, 5.63, 1.62), point(cutHalfWidth, cutEdgeY + 0.08, 1.62), 0.16, 0.12);
};

const addOpenDoorLeaf = (
  id: string,
  hingeX: number,
  direction: -1 | 1,
) => {
  const width = 2.5;
  const openAngle = (72 * Math.PI) / 180;
  const half = width / 2;
  const centerX = hingeX + direction * Math.cos(openAngle) * half;
  const centerZ = HALL_FRONT_Z + Math.sin(openAngle) * half;
  const rotationY = direction === 1 ? -openAngle : openAngle;
  addBox(id, "saw-hall-doors", "timber-mid", point(centerX, 2.08, centerZ), point(width, 2.72, 0.18), point(0, rotationY, 0));
  const hingeZ = HALL_FRONT_Z + 0.18;
  for (const y of [1.08, 2.92]) {
    addCylinder(`${id}-hinge-${y}`, "saw-hall-doors", "metal", point(hingeX, y - 0.14, hingeZ), point(hingeX, y + 0.14, hingeZ), 0.075, 10);
  }
  addBeam(
    `${id}-brace`,
    "saw-hall-doors",
    "paint-light",
    point(centerX - Math.cos(rotationY) * 0.95, 0.95, centerZ + Math.sin(rotationY) * 0.95),
    point(centerX + Math.cos(rotationY) * 0.95, 3.2, centerZ - Math.sin(rotationY) * 0.95),
    0.1,
    0.08,
  );
};

const addFrontGable = () => {
  // Two genuinely open log/saw bays: the facade is built around the voids.
  addBox("front-left-wall", "saw-hall", "cladding", point(-6.42, 2.15, HALL_FRONT_Z), point(1.36, 3.9, 0.24));
  addBox("front-centre-pier", "saw-hall", "cladding", point(0, 2.15, HALL_FRONT_Z), point(1.15, 3.9, 0.24));
  addBox("front-right-wall", "saw-hall", "cladding", point(6.42, 2.15, HALL_FRONT_Z), point(1.36, 3.9, 0.24));
  addBox("front-door-head", "saw-hall", "cladding", point(0, 3.72, HALL_FRONT_Z), point(11.75, 0.78, 0.24));
  addMesh("front-gable", "saw-hall", "cladding", [
    point(-6.9, 4.05, HALL_FRONT_Z),
    point(6.9, 4.05, HALL_FRONT_Z),
    point(0, 5.48, HALL_FRONT_Z),
  ], [[0, 1, 2]], true);
  for (const x of [-5.74, -0.58, 0.58, 5.74]) {
    addBeam(`front-door-jamb-${x}`, "saw-hall", "paint-light", point(x, 0.28, HALL_FRONT_Z + 0.18), point(x, 3.44, HALL_FRONT_Z + 0.18), 0.17, 0.12);
  }
  addBeam("front-door-head-trim", "saw-hall", "paint-light", point(-5.78, 3.48, HALL_FRONT_Z + 0.18), point(5.78, 3.48, HALL_FRONT_Z + 0.18), 0.18, 0.12);
  addOpenDoorLeaf("front-door-left-outer", -5.74, 1);
  addOpenDoorLeaf("front-door-left-inner", -0.58, -1);
  addOpenDoorLeaf("front-door-right-inner", 0.58, 1);
  addOpenDoorLeaf("front-door-right-outer", 5.74, -1);
  addBox("front-gable-window", "saw-hall", "opening", point(0, 4.62, HALL_FRONT_Z + 0.13), point(1.2, 0.72, 0.08));
  addBeam("front-gable-window-head", "saw-hall", "paint-light", point(-0.72, 5.06, HALL_FRONT_Z + 0.21), point(0.72, 5.06, HALL_FRONT_Z + 0.21), 0.11, 0.08);
  addBeam("front-gable-window-sill", "saw-hall", "paint-light", point(-0.72, 4.18, HALL_FRONT_Z + 0.21), point(0.72, 4.18, HALL_FRONT_Z + 0.21), 0.11, 0.08);
};

const addSawFrame = (index: number, x: number, z: number, width: number) => {
  const group = "saw-frames";
  const left = x - width / 2;
  const right = x + width / 2;
  addBeam(`saw-frame-${index}-left-post`, group, "timber-dark", point(left, 1.45, z), point(left, 4.75, z), 0.26, 0.32);
  addBeam(`saw-frame-${index}-right-post`, group, "timber-dark", point(right, 1.45, z), point(right, 4.75, z), 0.26, 0.32);
  addBeam(`saw-frame-${index}-head`, group, "timber-dark", point(left, 4.68, z), point(right, 4.68, z), 0.26, 0.32);
  addBeam(`saw-frame-${index}-foot`, group, "timber-dark", point(left, 1.52, z), point(right, 1.52, z), 0.26, 0.32);
  const bladeCount = index === 1 ? 5 : 7;
  for (let blade = 0; blade < bladeCount; blade += 1) {
    const bladeX = left + ((blade + 1) / (bladeCount + 1)) * width;
    addBeam(`saw-frame-${index}-blade-${blade}`, group, "metal", point(bladeX, 1.82, z + 0.06), point(bladeX, 4.35, z + 0.06), 0.045, 0.09);
  }
};

const rotorPoint = (angle: number, radius: number, tangentOffset: number, z = ROTOR_Z): ObjectPoint => {
  const radialX = Math.cos(angle);
  const radialY = Math.sin(angle);
  const tangentX = -radialY;
  const tangentY = radialX;
  return point(
    radialX * radius + tangentX * tangentOffset,
    JONGE_SCHAAP_HUB_Y + radialY * radius + tangentY * tangentOffset,
    z,
  );
};

const addOldDutchSail = (blade: number) => {
  const angle = (JONGE_SCHAAP_FIXED_ROTOR_PHASE_DEGREES * Math.PI) / 180 + blade * Math.PI / 2;
  const trailingAt = (radius: number) => 0.38 + (radius / JONGE_SCHAAP_ROTOR_RADIUS) * 1.5;
  addBeam(
    `rotor-${blade}-stock`,
    "rotor",
    "timber-dark",
    rotorPoint(angle, 0.15, 0, ROTOR_Z + 0.02),
    rotorPoint(angle, JONGE_SCHAAP_ROTOR_RADIUS, 0, ROTOR_Z + 0.02),
    0.3,
    0.23,
  );
  const rootRadius = 1.35;
  const tipRadius = JONGE_SCHAAP_ROTOR_RADIUS - 0.18;
  addBeam(
    `rotor-${blade}-trailing-rail`,
    "rotor",
    "timber-mid",
    rotorPoint(angle, rootRadius, trailingAt(rootRadius), ROTOR_Z + 0.03),
    rotorPoint(angle, tipRadius, trailingAt(tipRadius), ROTOR_Z + 0.03),
    0.16,
    0.13,
  );
  for (let batten = 0; batten < 10; batten += 1) {
    const radius = 1.55 + batten * ((9.75 - 1.55) / 9);
    addBeam(
      `rotor-${blade}-batten-${batten}`,
      "rotor",
      "timber-mid",
      rotorPoint(angle, radius, 0.08, ROTOR_Z + 0.07),
      rotorPoint(angle, radius, trailingAt(radius), ROTOR_Z + 0.07),
      0.085,
      0.07,
    );
  }
  addBeam(
    `rotor-${blade}-diagonal`,
    "rotor",
    "timber-mid",
    rotorPoint(angle, 1.65, 0.17, ROTOR_Z + 0.09),
    rotorPoint(angle, 9.9, trailingAt(9.9) - 0.12, ROTOR_Z + 0.09),
    0.08,
    0.065,
  );
  addMesh(
    `rotor-${blade}-canvas`,
    "rotor",
    "canvas",
    [
      rotorPoint(angle, 1.5, 0.15, ROTOR_Z - 0.05),
      rotorPoint(angle, 1.5, trailingAt(1.5) - 0.08, ROTOR_Z - 0.05),
      rotorPoint(angle, 10.05, trailingAt(10.05) - 0.12, ROTOR_Z - 0.05),
      rotorPoint(angle, 10.05, 0.15, ROTOR_Z - 0.05),
    ],
    [[0, 1, 2], [0, 2, 3]],
    true,
  );
};

// Long, low production shed: it establishes the object before the mill tower does.
addBox("saw-hall-floor", "saw-hall", "foundation", point(0, 0.18, 1), point(13.8, 0.36, 20));
addBox("saw-hall-left-wall", "saw-hall", "cladding", point(-6.9, 2.18, 1), point(0.24, 4, 20));
addBox("saw-hall-right-wall", "saw-hall", "cladding", point(6.9, 2.18, 1), point(0.24, 4, 20));
addBox("saw-hall-rear-wall", "saw-hall", "cladding", point(0, 2.18, HALL_REAR_Z), point(13.8, 4, 0.24));
for (const x of [-6.72, 6.72]) {
  for (const z of [-7.2, -3.6, 0, 3.6, 7.2]) {
    addBeam(`hall-frame-${x}-${z}`, "saw-hall", "timber-dark", point(x, 0.35, z), point(x, 4.22, z), 0.2, 0.2);
  }
}
for (const side of [-1, 1]) {
  for (const z of [-6.2, -1.8, 2.6, 7]) {
    addBox(`side-window-${side}-${z}`, "saw-hall", "opening", point(side * 7.03, 2.42, z), point(0.08, 1.15, 1.5));
    addBeam(`side-window-sill-${side}-${z}`, "saw-hall", "paint-light", point(side * 7.1, 1.77, z - 0.86), point(side * 7.1, 1.77, z + 0.86), 0.1, 0.09);
    addBeam(`side-window-head-${side}-${z}`, "saw-hall", "paint-light", point(side * 7.1, 3.07, z - 0.86), point(side * 7.1, 3.07, z + 0.86), 0.1, 0.09);
  }
}
addGableRoof();
addFrontGable();

// Hexagonal smock, structurally distinct from the octagonal De Kat tower.
const towerBottomRadius = 8.9 / (2 * Math.cos(Math.PI / 6));
const towerTopRadius = 5.2 / (2 * Math.cos(Math.PI / 6));
hexagonalFrustum("hexagonal-smock", "tower", "thatch", 3.95, 13.5, towerBottomRadius * 0.89, towerTopRadius);
for (let index = 0; index < HEXAGON; index += 1) {
  const angle = (index / HEXAGON) * TAU + Math.PI / HEXAGON;
  addBeam(
    `tower-corner-${index}`,
    "tower",
    "timber-dark",
    polar(towerBottomRadius + 0.03, 0.38, angle),
    polar(towerTopRadius + 0.03, 13.55, angle),
    0.18,
    0.16,
  );
}
addBox("tower-front-door", "tower", "opening", point(0, 7.62, TOWER_Z + towerBottomRadius * 0.74), point(1.05, 1.8, 0.12), point(-0.19, 0, 0));
addBox("tower-upper-window", "tower", "opening", point(0, 10.8, TOWER_Z + 3.58), point(0.84, 1.1, 0.1), point(-0.19, 0, 0));

// Low gallery deliberately cuts across the shed roof line.
hexagonalAnnulus("gallery-deck", JONGE_SCHAAP_GALLERY_Y, towerBottomRadius - 0.22, JONGE_SCHAAP_GALLERY_OUTER_DIAMETER / 2, 0.28);
for (let index = 0; index < 12; index += 1) {
  const angle = (index / 12) * TAU;
  const radius = 5.48;
  addBeam(`gallery-post-${index}`, "gallery", "paint-light", polar(radius, 5.62, angle), polar(radius, 6.62, angle), 0.1, 0.1);
  addBeam(
    `gallery-rail-${index}`,
    "gallery",
    "paint-light",
    polar(radius, 6.57, angle),
    polar(radius, 6.57, ((index + 1) / 12) * TAU),
    0.1,
    0.09,
  );
}
for (let index = 0; index < HEXAGON; index += 1) {
  const angle = (index / HEXAGON) * TAU + Math.PI / HEXAGON;
  addBeam(`gallery-bracket-${index}`, "gallery", "timber-dark", polar(towerBottomRadius * 0.83, 4.35, angle), polar(5.35, 5.38, angle), 0.17, 0.15);
}

// Boat-shaped cap and fixed tailing structure.
const capSections = [
  { z: -2.65, halfWidth: 0.95, bottom: 13.38, top: 14.42 },
  { z: -1.2, halfWidth: 2.05, bottom: 13.18, top: 15.75 },
  { z: 0.65, halfWidth: 2.45, bottom: 13.12, top: JONGE_SCHAAP_CAP_CROWN_Y },
  { z: 2.55, halfWidth: 2.05, bottom: 13.28, top: 15.78 },
  { z: 4.25, halfWidth: 0.92, bottom: 13.45, top: 14.55 },
] as const;
const capVertices: ObjectPoint[] = [];
for (const section of capSections) {
  capVertices.push(
    point(-section.halfWidth, section.bottom, TOWER_Z + section.z),
    point(section.halfWidth, section.bottom, TOWER_Z + section.z),
    point(-section.halfWidth, section.top, TOWER_Z + section.z),
    point(section.halfWidth, section.top, TOWER_Z + section.z),
  );
}
const capTriangles: Array<readonly [number, number, number]> = [];
for (let section = 0; section < capSections.length - 1; section += 1) {
  const a = section * 4;
  const b = (section + 1) * 4;
  capTriangles.push(
    [a, b + 1, a + 1], [a, b, b + 1],
    [a + 2, a + 3, b + 3], [a + 2, b + 3, b + 2],
    [a, a + 2, b + 2], [a, b + 2, b],
    [a + 1, b + 1, b + 3], [a + 1, b + 3, a + 3],
  );
}
capTriangles.push([0, 1, 3], [0, 3, 2]);
const capEnd = (capSections.length - 1) * 4;
capTriangles.push([capEnd, capEnd + 3, capEnd + 1], [capEnd, capEnd + 2, capEnd + 3]);
addMesh("cap-hull", "cap", "thatch", capVertices, capTriangles);
for (const [index, section] of capSections.entries()) {
  addBeam(`cap-rib-${index}`, "cap", "timber-dark", point(-section.halfWidth, section.top, TOWER_Z + section.z), point(section.halfWidth, section.top, TOWER_Z + section.z), 0.11, 0.14);
}
addBeam("cap-tail-left", "cap", "timber-dark", point(-1.35, 13.55, TOWER_Z - 2.45), point(-2.55, 7.15, TOWER_Z - 6.45), 0.22, 0.2);
addBeam("cap-tail-right", "cap", "timber-dark", point(1.35, 13.55, TOWER_Z - 2.45), point(2.55, 7.15, TOWER_Z - 6.45), 0.22, 0.2);
addBeam("cap-tail-cross", "cap", "paint-light", point(-2.62, 7.12, TOWER_Z - 6.48), point(2.62, 7.12, TOWER_Z - 6.48), 0.2, 0.18);

// Windshaft and sails: the only allowed runtime movement is constant rotor spin.
addCylinder("windshaft", "rotor", "metal", point(0, JONGE_SCHAAP_HUB_Y, TOWER_Z + 0.55), point(0, JONGE_SCHAAP_HUB_Y, ROTOR_Z + 0.33), 0.29, 20);
addCylinder("rotor-hub", "rotor", "timber-dark", point(0, JONGE_SCHAAP_HUB_Y, ROTOR_Z - 0.5), point(0, JONGE_SCHAAP_HUB_Y, ROTOR_Z + 0.37), 0.59, 20);
addCylinder("rotor-cap", "rotor", "paint-accent", point(0, JONGE_SCHAAP_HUB_Y, ROTOR_Z + 0.33), point(0, JONGE_SCHAAP_HUB_Y, ROTOR_Z + 0.59), 0.43, 20);
for (let blade = 0; blade < 4; blade += 1) addOldDutchSail(blade);

// Three independent reciprocating frames, two log carriages and their floor tracks.
addSawFrame(0, -3.65, 3.2, 2.35);
addSawFrame(1, 0, 1.9, 1.8);
addSawFrame(2, 3.65, 3.2, 2.35);
for (const [lane, x] of [[0, -3.65], [1, 3.65]] as const) {
  for (const railOffset of [-0.82, 0.82]) {
    addBeam(`carriage-${lane}-rail-${railOffset}`, "log-carriages", "metal", point(x + railOffset, 0.48, -5.8), point(x + railOffset, 0.48, 16.8), 0.12, 0.12);
  }
  for (let tie = 0; tie < 15; tie += 1) {
    const z = -5.5 + tie * 1.55;
    addBeam(`carriage-${lane}-tie-${tie}`, "log-carriages", "timber-mid", point(x - 1.05, 0.37, z), point(x + 1.05, 0.37, z), 0.13, 0.2);
  }
  addBox(`carriage-${lane}-bed`, "log-carriages", "timber-dark", point(x, 0.72, 4.8), point(2.25, 0.28, 5.8));
  addCylinder(`carriage-${lane}-log`, "log-carriages", "timber-mid", point(x, 1.18, 7.4), point(x, 1.18, -2.8), 0.56, 14);
}

// Two hoists/winderies at the log intake; each resolves as a frame, axle and drum.
for (const [windery, x] of [[0, -3.65], [1, 3.65]] as const) {
  for (const side of [-1, 1]) {
    addBeam(`windery-${windery}-post-${side}`, "windery", "timber-dark", point(x + side * 1.15, 0.42, 8.15), point(x + side * 1.15, 3.6, 8.15), 0.22, 0.22);
  }
  addBeam(`windery-${windery}-head`, "windery", "timber-dark", point(x - 1.25, 3.55, 8.15), point(x + 1.25, 3.55, 8.15), 0.24, 0.22);
  addCylinder(`windery-${windery}-axle`, "windery", "metal", point(x - 1.35, 2.68, 8.15), point(x + 1.35, 2.68, 8.15), 0.14, 12);
  addCylinder(`windery-${windery}-drum`, "windery", "timber-mid", point(x - 0.44, 2.68, 8.15), point(x + 0.44, 2.68, 8.15), 0.42, 16);
  addBeam(`windery-${windery}-cable`, "windery", "metal", point(x, 2.65, 8.55), point(x, 0.64, 13.2), 0.045, 0.045);
}

// The drivetrain is spatially causal even while static: shaft -> crank -> rods -> saw frames.
addCylinder("crankshaft", "drivetrain", "metal", point(-5.25, 5.92, 1.2), point(5.25, 5.92, 1.2), 0.2, 16);
for (const [index, x, frameZ] of [[0, -3.65, 3.2], [1, 0, 1.9], [2, 3.65, 3.2]] as const) {
  const crankCentre = point(x, 5.92, 1.2);
  addRing(`crank-${index}`, "drivetrain", "paint-accent", crankCentre, point(0, 1, 0), point(0, 0, 1), 0.72, 14, 0.1, 0.09);
  addCylinder(`crank-${index}-pin`, "drivetrain", "metal", point(x - 0.18, 6.42, 1.66), point(x + 0.18, 6.42, 1.66), 0.11, 12);
  addBeam(`crank-${index}-connecting-rod`, "drivetrain", "timber-mid", point(x, 6.42, 1.66), point(x, 4.72, frameZ), 0.15, 0.12);
}
addRing("drive-wheel", "drivetrain", "timber-dark", point(5.15, 7.9, 0.25), point(0, 1, 0), point(0, 0, 1), 1.62, 20, 0.15, 0.13);
addCylinder("drive-wheel-shaft", "drivetrain", "metal", point(4.82, 7.9, 0.25), point(5.48, 7.9, 0.25), 0.18, 14);
for (let spoke = 0; spoke < 10; spoke += 1) {
  const angle = (spoke / 10) * TAU;
  addBeam("drive-wheel-spoke-" + spoke, "drivetrain", "timber-mid", point(5.15, 7.9, 0.25), point(5.15, 7.9 + Math.cos(angle) * 1.5, 0.25 + Math.sin(angle) * 1.5), 0.1, 0.09);
}

export const jongeSchaapSawmillObject: ObjectLabModel = {
  id: "dutch-windmill-jonge-schaap-sawmill-m3",
  revision: "m3-2026-08-02",
  title: "Het Jonge Schaap-type hexagonal sawmill — structural grey model",
  units: "metres",
  coordinates: { up: "+Y", front: "+Z", origin: "ground-centre" },
  sourceNotes: [
    "Hexagonal timber smock, attached saw sheds, three saw frames and two log carriages follow the Nederlandse Molendatabase passport for Het Jonge Schaap.",
    "20.68 m sail span, +5.50 m gallery and 1:2.44 transmission ratio are published dimensions/mechanical data.",
    "The exterior massing and front log intake are authored from multi-angle photographs; the visible crank-to-frame chain follows the mill's mechanism guide and Sipman-type section evidence.",
  ],
  dimensions: {
    rotorSpan: JONGE_SCHAAP_ROTOR_SPAN,
    rotorRadius: JONGE_SCHAAP_ROTOR_RADIUS,
    galleryDeckY: JONGE_SCHAAP_GALLERY_Y,
    galleryOuterDiameter: JONGE_SCHAAP_GALLERY_OUTER_DIAMETER,
    hubY: JONGE_SCHAAP_HUB_Y,
    capCrownY: JONGE_SCHAAP_CAP_CROWN_Y,
    maximumOperatingHeight: JONGE_SCHAAP_HUB_Y + JONGE_SCHAAP_ROTOR_RADIUS,
    bladeLowerClearance: JONGE_SCHAAP_HUB_Y - JONGE_SCHAAP_ROTOR_RADIUS,
    towerAcrossFlats: 8.9,
    sawHallWidth: 13.8,
    sawHallDepth: 20,
    logDeckDepth: 5.8,
    towerCentreZ: TOWER_Z,
    rotorPlaneZ: ROTOR_Z,
    sawFrameCount: 3,
    logCarriageCount: 2,
    winderyCount: 2,
    transmissionRatio: JONGE_SCHAAP_TRANSMISSION_RATIO,
  },
  labMetrics: [
    { label: "SAIL SPAN", value: JONGE_SCHAAP_ROTOR_SPAN, decimals: 2 },
    { label: "GALLERY", value: JONGE_SCHAAP_GALLERY_Y, decimals: 2 },
    { label: "HALL DEPTH", value: 20, decimals: 1 },
    { label: "TOWER FLATS", value: 8.9, decimals: 1 },
  ],
  anchors: {
    groundCentre: point(0, 0, 0),
    towerCentre: point(0, 0, TOWER_Z),
    rotorPivot: point(0, JONGE_SCHAAP_HUB_Y, ROTOR_Z),
    galleryCentre: point(0, JONGE_SCHAAP_GALLERY_Y, TOWER_Z),
    logIntakeLeft: point(-3.65, 0.48, 16.8),
    logIntakeRight: point(3.65, 0.48, 16.8),
    crankshaftCentre: point(0, 5.92, 1.2),
  },
  rotor: {
    pivot: point(0, JONGE_SCHAAP_HUB_Y, ROTOR_Z),
    axis: point(0, 0, 1),
    fixedPhaseDegrees: JONGE_SCHAAP_FIXED_ROTOR_PHASE_DEGREES,
    motion: "constant-rotation-only",
    windCoupling: false,
  },
  motionConstraints: {
    windSimulation: false,
    capYaw: false,
    sawFrameMotion: false,
    logCarriageMotion: false,
    winderyMotion: false,
    sailRotation: "constant-only",
  },
  parts,
  views: [
    { id: "front", label: "Front +Z · log intake", projection: "orthographic", position: point(0, 12.2, 49), target: point(0, 11.2, 1.5), orthoHeight: 29.5 },
    { id: "left", label: "Left profile · long shed", projection: "orthographic", position: point(-49, 11.7, 1), target: point(0, 10.4, 1), orthoHeight: 29.5 },
    { id: "rear", label: "Rear -Z", projection: "orthographic", position: point(0, 12.2, -49), target: point(0, 10.8, 0), orthoHeight: 29.5 },
    { id: "three-quarter-left", label: "3/4 left", projection: "perspective", position: point(-35, 24, 43), target: point(0, 9.4, 1.4), fov: 36 },
    { id: "three-quarter-right", label: "3/4 right", projection: "perspective", position: point(36, 22, 41), target: point(0, 9.2, 1.3), fov: 36 },
    { id: "high-three-quarter", label: "High 3/4 · massing", projection: "perspective", position: point(-34, 38, 42), target: point(0, 7.6, 1), fov: 38 },
    { id: "saw-workflow", label: "Log intake → saw frames", projection: "perspective", position: point(-0.2, 4.35, 27), target: point(0, 2.7, 3.1), fov: 30 },
    {
      id: "crankshaft",
      label: "Cutaway · crankshaft → three frames",
      projection: "perspective",
      position: point(-12.5, 8.7, 10.8),
      target: point(0, 4.4, 1.8),
      fov: 34,
      hiddenGroups: ["tower", "cap", "rotor", "gallery", "saw-hall", "roof-joint", "saw-hall-doors"],
    },
    { id: "silhouette", label: "Silhouette control", projection: "orthographic", position: point(0, 12.2, 49), target: point(0, 11.2, 1.5), orthoHeight: 29.5 },
  ],
};
