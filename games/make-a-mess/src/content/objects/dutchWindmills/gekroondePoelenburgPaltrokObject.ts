import type {
  ObjectLabModel,
  ObjectLabPart,
  ObjectMaterialId,
  ObjectPoint,
} from "./objectModel.ts";
import { reverseTriangleWinding } from "./objectModel.ts";
import { dutchLampFixture } from "../dutchLighting/dutchLightingFixtures.ts";
import {
  frontWindowAssembly,
  rectangularFrustumWithFrontOpenings,
} from "../dutchArchitecture/dutchWindowAssemblies.ts";

export const POELENBURG_ROTOR_SPAN = 23;
export const POELENBURG_ROTOR_RADIUS = POELENBURG_ROTOR_SPAN / 2;
export const POELENBURG_HUB_Y = 11.8;
export const POELENBURG_CAP_CROWN_Y = 13.3;
export const POELENBURG_ROLLER_WALL_DIAMETER = 7.2;
export const POELENBURG_FIXED_ROTOR_PHASE_DEGREES = 12;
export const POELENBURG_BODY_FRONT_Z = 6.3;
export const POELENBURG_ROTOR_PLANE_Z = 6.9;

const TAU = Math.PI * 2;
const parts: ObjectLabPart[] = [];
const point = (x: number, y: number, z: number): ObjectPoint => [x, y, z];

const addBeam = (id: string, group: string, material: ObjectMaterialId, from: ObjectPoint, to: ObjectPoint, width: number, depth = width) => {
  parts.push({ kind: "beam", id, group, material, from, to, width, depth });
};
const addBox = (id: string, group: string, material: ObjectMaterialId, center: ObjectPoint, size: ObjectPoint, rotation?: ObjectPoint) => {
  parts.push({ kind: "box", id, group, material, center, size, rotation });
};
const addCylinder = (id: string, group: string, material: ObjectMaterialId, from: ObjectPoint, to: ObjectPoint, radius: number, radialSegments = 16) => {
  parts.push({ kind: "cylinder", id, group, material, from, to, radius, radialSegments });
};
const addMesh = (id: string, group: string, material: ObjectMaterialId, vertices: ObjectPoint[], triangles: Array<readonly [number, number, number]>, doubleSided = false) => {
  parts.push({ kind: "mesh", id, group, material, vertices, triangles, doubleSided });
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
  const at = (angle: number): ObjectPoint => point(
    center[0] + basisU[0] * Math.cos(angle) * radius + basisV[0] * Math.sin(angle) * radius,
    center[1] + basisU[1] * Math.cos(angle) * radius + basisV[1] * Math.sin(angle) * radius,
    center[2] + basisU[2] * Math.cos(angle) * radius + basisV[2] * Math.sin(angle) * radius,
  );
  for (let index = 0; index < segments; index += 1) {
    addBeam(`${id}-${index}`, group, material, at(index / segments * TAU), at((index + 1) / segments * TAU), thickness, depth);
  }
};

const addAnnulus = (id: string, group: string, material: ObjectMaterialId, y: number, innerRadius: number, outerRadius: number, thickness: number, segments = 24) => {
  const vertices: ObjectPoint[] = [];
  for (const level of [y - thickness / 2, y + thickness / 2]) {
    for (const radius of [innerRadius, outerRadius]) {
      for (let index = 0; index < segments; index += 1) {
        const angle = index / segments * TAU;
        vertices.push(point(Math.sin(angle) * radius, level, Math.cos(angle) * radius));
      }
    }
  }
  const triangles: Array<readonly [number, number, number]> = [];
  for (let index = 0; index < segments; index += 1) {
    const next = (index + 1) % segments;
    const li = index;
    const lo = segments + index;
    const ui = segments * 2 + index;
    const uo = segments * 3 + index;
    const lin = next;
    const lon = segments + next;
    const uin = segments * 2 + next;
    const uon = segments * 3 + next;
    triangles.push(
      [ui, uon, uo], [ui, uin, uon],
      [li, lo, lon], [li, lon, lin],
      [lo, uo, uon], [lo, uon, lon],
      [li, uin, ui], [li, lin, uin],
    );
  }
  addMesh(id, group, material, vertices, reverseTriangleWinding(triangles));
};

const rotorPoint = (angle: number, radius: number, tangentOffset: number, z = POELENBURG_ROTOR_PLANE_Z): ObjectPoint => {
  const radialX = Math.cos(angle);
  const radialY = Math.sin(angle);
  const tangentX = -radialY;
  const tangentY = radialX;
  return point(
    radialX * radius + tangentX * tangentOffset,
    POELENBURG_HUB_Y + radialY * radius + tangentY * tangentOffset,
    z,
  );
};

const addBareSail = (blade: number) => {
  const angle = POELENBURG_FIXED_ROTOR_PHASE_DEGREES * Math.PI / 180 + blade * Math.PI / 2;
  const trailingAt = (radius: number) => 0.38 + radius / POELENBURG_ROTOR_RADIUS * 1.66;
  addBeam(`rotor-${blade}-stock`, "rotor", "timber-dark", rotorPoint(angle, 0.15, 0), rotorPoint(angle, POELENBURG_ROTOR_RADIUS, 0), 0.31, 0.24);
  addBeam(`rotor-${blade}-trailing-rail`, "rotor", "timber-mid", rotorPoint(angle, 1.45, trailingAt(1.45)), rotorPoint(angle, 11.28, trailingAt(11.28)), 0.17, 0.13);
  for (let batten = 0; batten < 12; batten += 1) {
    const radius = 1.55 + batten * ((10.95 - 1.55) / 11);
    addBeam(`rotor-${blade}-batten-${batten}`, "rotor", "timber-mid", rotorPoint(angle, radius, 0.08, POELENBURG_ROTOR_PLANE_Z + 0.06), rotorPoint(angle, radius, trailingAt(radius), POELENBURG_ROTOR_PLANE_Z + 0.06), 0.082, 0.068);
  }
  addBeam(`rotor-${blade}-diagonal`, "rotor", "timber-mid", rotorPoint(angle, 1.65, 0.16, POELENBURG_ROTOR_PLANE_Z + 0.08), rotorPoint(angle, 11.05, trailingAt(11.05) - 0.12, POELENBURG_ROTOR_PLANE_Z + 0.08), 0.08, 0.065);
};

const addSawFrame = (index: number, x: number, z: number) => {
  const halfWidth = index === 1 ? 0.82 : 1.12;
  for (const side of [-1, 1]) {
    addBeam(`saw-frame-${index}-post-${side}`, "saw-frames", "timber-dark", point(x + side * halfWidth, 2.35, z), point(x + side * halfWidth, 5.45, z), 0.24, 0.3);
  }
  addBeam(`saw-frame-${index}-head`, "saw-frames", "timber-dark", point(x - halfWidth, 5.38, z), point(x + halfWidth, 5.38, z), 0.25, 0.3);
  addBeam(`saw-frame-${index}-foot`, "saw-frames", "timber-dark", point(x - halfWidth, 2.42, z), point(x + halfWidth, 2.42, z), 0.25, 0.3);
  const bladeCount = index === 1 ? 5 : 7;
  for (let blade = 0; blade < bladeCount; blade += 1) {
    const bladeX = x - halfWidth + (blade + 1) / (bladeCount + 1) * halfWidth * 2;
    addBeam(`saw-frame-${index}-blade-${blade}`, "saw-frames", "metal", point(bladeX, 2.7, z + 0.05), point(bladeX, 5.08, z + 0.05), 0.045, 0.085);
  }
};

// The low brick ring is a wall, never a solid generic plinth.
addAnnulus("brick-ring-wall", "foundation-ring", "brick", 0.62, 2.78, POELENBURG_ROLLER_WALL_DIAMETER / 2, 1.12, 28);
addRing("lower-roller-track", "roller-ring", "timber-dark", point(0, 1.18, 0), point(1, 0, 0), point(0, 0, 1), 3.18, 28, 0.24, 0.2);
addRing("upper-roller-track", "roller-ring", "timber-dark", point(0, 1.62, 0), point(1, 0, 0), point(0, 0, 1), 3.18, 28, 0.24, 0.2);
for (let index = 0; index < 16; index += 1) {
  const angle = index / 16 * TAU;
  const radial = point(Math.sin(angle), 0, Math.cos(angle));
  addCylinder(
    `roller-${index}`,
    "roller-ring",
    "timber-mid",
    point(radial[0] * 2.9, 1.4, radial[2] * 2.9),
    point(radial[0] * 3.46, 1.4, radial[2] * 3.46),
    0.19,
    12,
  );
}

// Central post carries the principal load; the rollers guide the rotating body.
addCylinder("king-post", "central-support", "timber-dark", point(0, 0.28, 0), point(0, 3.45, 0), 0.52, 18);
addBeam("king-cross-x", "central-support", "timber-dark", point(-3.9, 2.02, 0), point(3.9, 2.02, 0), 0.48, 0.44);
addBeam("king-cross-z", "central-support", "timber-dark", point(0, 2.02, -3.65), point(0, 2.02, 3.65), 0.48, 0.44);
for (const [index, x, z] of [[0, -3.6, -3.7], [1, 3.6, -3.7], [2, -3.6, 3.7], [3, 3.6, 3.7]] as const) {
  addBeam(`body-support-${index}`, "central-support", "timber-dark", point(0, 1.95, 0), point(x, 2.16, z), 0.32, 0.28);
}

// One rotating floor with broad open side wings.
addBox("saw-floor-deck", "saw-floor", "timber-mid", point(0, 2.18, 0), point(17.8, 0.32, 12.6));
for (const x of [-8.55, -5.7, -2.85, 0, 2.85, 5.7, 8.55]) {
  addBeam(`floor-beam-z-${x}`, "saw-floor", "timber-dark", point(x, 1.98, -6.3), point(x, 1.98, 6.3), 0.3, 0.27);
}
for (const z of [-5.9, -2.95, 0, 2.95, 5.9]) {
  addBeam(`floor-beam-x-${z}`, "saw-floor", "timber-dark", point(-8.9, 1.9, z), point(8.9, 1.9, z), 0.32, 0.28);
}
for (const x of [-8.55, -4.5, 4.5, 8.55]) {
  addBeam(`open-floor-post-${x}`, "wing-frame", "timber-dark", point(x, 2.25, -5.35), point(x, 4.25, -5.35), 0.22, 0.22);
  addBeam(`open-floor-brace-${x}`, "wing-frame", "timber-dark", point(x, 2.25, -5.28), point(x * 0.72, 4.22, -5.28), 0.19, 0.17);
}

// Closed windward skirt and the restored stepped overlapping plank wall.
addBox("front-lower-skirt", "stepped-wall", "cladding", point(0, 3.02, 5.52), point(7.6, 1.68, 0.24));
const paltrokUpperWindowXs = [-1.25, 1.25] as const;
for (let course = 0; course < 16; course += 1) {
  const y = 2.35 + course * 0.5;
  const t = (y - 2.35) / 8.0;
  const width = 7.8 + (4.35 - 7.8) * t;
  const frontZ = 4.05 + (2.72 - 4.05) * t + course * 0.018;
  const cutsWindows = y + 0.29 > 7.55 - 0.95 / 2 && y - 0.29 < 7.55 + 0.95 / 2;
  const gaps = cutsWindows
    ? paltrokUpperWindowXs.map((x) => [x - 0.78 / 2, x + 0.78 / 2] as const)
    : [];
  const segments: Array<readonly [number, number]> = [];
  let cursor = -width / 2;
  for (const [gapLeft, gapRight] of gaps) {
    if (gapLeft > cursor) segments.push([cursor, gapLeft]);
    cursor = gapRight;
  }
  if (cursor < width / 2) segments.push([cursor, width / 2]);
  for (const [segment, [x0, x1]] of segments.entries()) {
    addBox(`stepped-plank-course-${course}-segment-${segment}`, "stepped-wall", "cladding", point((x0 + x1) / 2, y, frontZ), point(x1 - x0, 0.58, 0.2));
  }
}

// Tall central body starts above the open work floor. Both upper windows are
// voids in the windward face, not panes laid over a continuous frustum.
const upperBodyWindows = paltrokUpperWindowXs.map((centerX) => ({
  id: `upper-front-window-${centerX}`,
  centerX,
  centerY: 7.55,
  width: 0.78,
  height: 0.95,
})) as readonly { id: string; centerX: number; centerY: number; width: number; height: number }[];
const upperBodyFrontZAt = (y: number) => 4.05 + (2.7 - 4.05) * ((y - 4.15) / (10.95 - 4.15));
parts.push(...rectangularFrustumWithFrontOpenings({
  id: "upper-body-shell",
  group: "upper-body",
  material: "cladding",
  y0: 4.15,
  y1: 10.95,
  halfX0: 3.9,
  halfZ0: 4.05,
  halfX1: 2.18,
  halfZ1: 2.7,
  openings: upperBodyWindows,
}));
for (const [index, sx, sz] of [[0, -1, -1], [1, 1, -1], [2, -1, 1], [3, 1, 1]] as const) {
  addBeam(`upper-body-corner-${index}`, "upper-body", "timber-dark", point(sx * 3.9, 4.08, sz * 4.05), point(sx * 2.18, 11.0, sz * 2.7), 0.21, 0.19);
}
for (const window of upperBodyWindows) {
  parts.push(...frontWindowAssembly({
    ...window,
    group: "upper-body-window",
    faceZAt: upperBodyFrontZAt,
    wallDepth: 0.2,
    columns: 2,
    rows: 2,
    frameMaterial: "timber-dark",
    interiorDepth: 1.25,
  }));
}

// Side-wing roofs protect the machines but leave the rear and sides visibly open.
for (const side of [-1, 1]) {
  const roofTriangles: Array<readonly [number, number, number]> = [[0, 1, 3], [0, 3, 2]];
  addMesh(`wing-roof-${side}`, "wings", "roof", [
    point(side * 3.15, 5.4, -5.6), point(side * 8.95, 3.95, -5.6),
    point(side * 3.15, 5.4, 5.45), point(side * 8.95, 3.95, 5.45),
  ], side < 0 ? roofTriangles : reverseTriangleWinding(roofTriangles), true);
  addBox(`wing-front-wall-${side}`, "wings", "cladding", point(side * 6.05, 2.96, 5.48), point(5.7, 1.42, 0.2));
  addBeam(`wing-outer-eave-${side}`, "wings", "paint-light", point(side * 8.98, 3.95, -5.72), point(side * 8.98, 3.95, 5.58), 0.17, 0.15);
  addBeam(`wing-inner-eave-${side}`, "wings", "paint-light", point(side * 3.14, 5.41, -5.72), point(side * 3.14, 5.41, 5.58), 0.17, 0.15);
  for (const z of [-4.9, 4.85]) {
    addBeam(`wing-roof-brace-${side}-${z}`, "wing-frame", "timber-dark", point(side * 8.45, 2.24, z), point(side * 3.35, 5.28, z), 0.2, 0.18);
  }
}
for (const x of [-7.9, -5.25, -2.6, 0, 2.6, 5.25, 7.9]) {
  addBeam(`front-stage-post-${x}`, "wings", "paint-light", point(x, 3.9, 5.82), point(x, 4.75, 5.82), 0.1, 0.09);
}
addBeam("front-stage-rail", "wings", "paint-light", point(-8.1, 4.7, 5.82), point(8.1, 4.7, 5.82), 0.11, 0.09);

// Barrel-like paltrok cap.
const capSections = [
  { z: -2.65, halfWidth: 1.45, bottom: 10.72, top: 11.6 },
  { z: -1.15, halfWidth: 2.15, bottom: 10.62, top: 12.85 },
  { z: 0.65, halfWidth: 2.35, bottom: 10.58, top: POELENBURG_CAP_CROWN_Y },
  { z: 2.45, halfWidth: 2.05, bottom: 10.7, top: 12.75 },
  { z: 4.25, halfWidth: 1.12, bottom: 10.9, top: 11.82 },
] as const;
const capVertices: ObjectPoint[] = [];
for (const section of capSections) {
  capVertices.push(
    point(-section.halfWidth, section.bottom, section.z), point(section.halfWidth, section.bottom, section.z),
    point(-section.halfWidth, section.top, section.z), point(section.halfWidth, section.top, section.z),
  );
}
const capTriangles: Array<readonly [number, number, number]> = [];
for (let section = 0; section < capSections.length - 1; section += 1) {
  const a = section * 4;
  const b = (section + 1) * 4;
  capTriangles.push(
    [a, b + 1, a + 1], [a, b, b + 1], [a + 2, a + 3, b + 3], [a + 2, b + 3, b + 2],
    [a, a + 2, b + 2], [a, b + 2, b], [a + 1, b + 1, b + 3], [a + 1, b + 3, a + 3],
  );
}
capTriangles.push([0, 1, 3], [0, 3, 2]);
const capEnd = (capSections.length - 1) * 4;
capTriangles.push([capEnd, capEnd + 3, capEnd + 1], [capEnd, capEnd + 2, capEnd + 3]);
addMesh("cap-hull", "cap", "roof", capVertices, reverseTriangleWinding(capTriangles));

// Rotor plane is completely in front of the windward roof envelope.
addCylinder("windshaft", "rotor", "metal", point(0, POELENBURG_HUB_Y, 0.45), point(0, POELENBURG_HUB_Y, POELENBURG_ROTOR_PLANE_Z + 0.32), 0.29, 20);
addCylinder("rotor-hub", "rotor", "timber-dark", point(0, POELENBURG_HUB_Y, POELENBURG_ROTOR_PLANE_Z - 0.5), point(0, POELENBURG_HUB_Y, POELENBURG_ROTOR_PLANE_Z + 0.35), 0.6, 20);
addCylinder("rotor-cap", "rotor", "paint-accent", point(0, POELENBURG_HUB_Y, POELENBURG_ROTOR_PLANE_Z + 0.32), point(0, POELENBURG_HUB_Y, POELENBURG_ROTOR_PLANE_Z + 0.58), 0.43, 20);
for (let blade = 0; blade < 4; blade += 1) addBareSail(blade);

// Three working lines remain visible through the open rear saw floor.
addSawFrame(0, -3.65, -0.2);
addSawFrame(1, 0, -0.7);
addSawFrame(2, 3.65, -0.2);
for (const [lane, x] of [[0, -3.65], [1, 3.65]] as const) {
  for (const offset of [-0.72, 0.72]) {
    addBeam(`carriage-${lane}-rail-${offset}`, "log-carriages", "metal", point(x + offset, 2.42, -11.8), point(x + offset, 2.42, 5.7), 0.11, 0.1);
  }
  addBox(`carriage-${lane}-bed`, "log-carriages", "timber-dark", point(x, 2.7, -1.8), point(2.05, 0.25, 5.3));
  addCylinder(`carriage-${lane}-log`, "log-carriages", "timber-mid", point(x, 3.1, -5.1), point(x, 3.1, 3.4), 0.5, 14);
}

// Fixed tailing gear records whole-body winding without enabling it.
addBeam("tail-pole-left", "tail", "timber-dark", point(-1.2, 8.6, -2.7), point(-0.85, 1.05, -13.3), 0.28, 0.24);
addBeam("tail-pole-right", "tail", "timber-dark", point(1.2, 8.6, -2.7), point(0.85, 1.05, -13.3), 0.28, 0.24);
addBeam("tail-cross-foot", "tail", "timber-dark", point(-1.15, 1.05, -13.35), point(1.15, 1.05, -13.35), 0.28, 0.24);
const windingCentre = point(1.8, 1.55, -11.9);
addCylinder("winding-axle", "tail", "metal", point(1.35, 1.55, -11.9), point(2.25, 1.55, -11.9), 0.12, 12);
addRing("winding-wheel", "tail", "paint-accent", windingCentre, point(0, 1, 0), point(0, 0, 1), 1.05, 16, 0.1, 0.09);
for (let spoke = 0; spoke < 8; spoke += 1) {
  const angle = spoke / 8 * TAU;
  addBeam(`winding-spoke-${spoke}`, "tail", "paint-light", windingCentre, point(1.8, 1.55 + Math.cos(angle), -11.9 + Math.sin(angle)), 0.075, 0.065);
}

for (const [id, x, z] of [["west", -3.65, -0.2], ["east", 3.65, -0.2]] as const) {
  parts.push(...dutchLampFixture({
    id: `open-floor-lamp:${id}`,
    group: "lighting-fixtures",
    lens: point(x, 4.68, z),
    carrierPoint: point(x, 5.38, z),
    carrier: "ceiling",
    lampClass: "work",
    poolGroupId: "dutch-polder:m4-open-floor",
    priority: id === "west" ? 2.4 : 1.9,
  }));
}

export const gekroondePoelenburgPaltrokObject: ObjectLabModel = {
  id: "dutch-windmill-gekroonde-poelenburg-paltrok-m4",
  revision: "m4-2026-08-04-real-windows-a2",
  title: "De Gekroonde Poelenburg-type paltrok sawmill — structural grey model",
  units: "metres",
  coordinates: { up: "+Y", front: "+Z", origin: "ground-centre" },
  sourceNotes: [
    "The paltrok type, open three-sided saw floor, whole-body roller winding and restored stepped plank wall follow De Zaansche Molen's Poelenburg description.",
    "The 23 m sail span and three saw frames follow the published Zaanstreek mill record; the earlier 20.4 m concept estimate is rejected.",
    "The central-post/roller load path follows the documented correction that the king post carries the principal share and the roller ring the smaller share.",
  ],
  dimensions: {
    rotorSpan: POELENBURG_ROTOR_SPAN,
    rotorRadius: POELENBURG_ROTOR_RADIUS,
    hubY: POELENBURG_HUB_Y,
    capCrownY: POELENBURG_CAP_CROWN_Y,
    maximumOperatingHeight: POELENBURG_HUB_Y + POELENBURG_ROTOR_RADIUS,
    bladeLowerClearance: POELENBURG_HUB_Y - POELENBURG_ROTOR_RADIUS,
    rollerWallDiameter: POELENBURG_ROLLER_WALL_DIAMETER,
    rollerCount: 16,
    bodyWidthIncludingWings: 17.8,
    bodyDepth: 12.6,
    bodyFrontZ: POELENBURG_BODY_FRONT_Z,
    rotorPlaneZ: POELENBURG_ROTOR_PLANE_Z,
    sawFrameCount: 3,
  },
  labMetrics: [
    { label: "SAIL SPAN", value: POELENBURG_ROTOR_SPAN, decimals: 1 },
    { label: "HUB", value: POELENBURG_HUB_Y, decimals: 1 },
    { label: "ROLLER WALL Ø", value: POELENBURG_ROLLER_WALL_DIAMETER, decimals: 1 },
    { label: "BODY WIDTH", value: 17.8, decimals: 1 },
  ],
  anchors: {
    groundCentre: point(0, 0, 0),
    kingPostFoot: point(0, 0.28, 0),
    bodyYawPivot: point(0, 1.4, 0),
    rotorPivot: point(0, POELENBURG_HUB_Y, POELENBURG_ROTOR_PLANE_Z),
    tailFoot: point(0, 1.05, -13.35),
  },
  rotor: {
    pivot: point(0, POELENBURG_HUB_Y, POELENBURG_ROTOR_PLANE_Z),
    axis: point(0, 0, 1),
    fixedPhaseDegrees: POELENBURG_FIXED_ROTOR_PHASE_DEGREES,
    motion: "constant-rotation-only",
    windCoupling: false,
  },
  motionConstraints: {
    windSimulation: false,
    wholeBodyYaw: false,
    rollerRingMotion: false,
    sawFrameMotion: false,
    logCarriageMotion: false,
    sailRotation: "constant-only",
  },
  parts,
  views: [
    { id: "front", label: "Front +Z · windward shell", projection: "orthographic", position: point(0, 11.8, 48), target: point(0, 11.2, 0), orthoHeight: 29 },
    { id: "left", label: "Left profile · open wing", projection: "orthographic", position: point(-49, 11.3, -0.8), target: point(0, 10.5, -0.8), orthoHeight: 29 },
    { id: "rear", label: "Rear -Z · open saw floor", projection: "orthographic", position: point(0, 11.2, -49), target: point(0, 10.2, -1.5), orthoHeight: 29 },
    { id: "three-quarter-left", label: "3/4 left", projection: "perspective", position: point(-35, 23, 40), target: point(0, 8.6, -0.1), fov: 36 },
    { id: "three-quarter-rear", label: "3/4 rear · open floor", projection: "perspective", position: point(32, 18, -41), target: point(0, 6.4, -1.3), fov: 36 },
    { id: "high-three-quarter", label: "High 3/4 · wings + body", projection: "perspective", position: point(-34, 36, 39), target: point(0, 7.4, 0), fov: 38 },
    { id: "roller-ring", label: "Cutaway · roller ring + king post", projection: "perspective", position: point(-8.5, 3.1, -8.5), target: point(0, 1.3, 0), fov: 32, hiddenGroups: ["upper-body", "stepped-wall", "wings", "wing-frame", "cap", "rotor", "saw-floor", "saw-frames", "log-carriages", "tail"] },
    { id: "open-saw-floor", label: "Cutaway · three saw frames", projection: "perspective", position: point(-12, 7.4, -13), target: point(0, 3.8, -0.5), fov: 34, hiddenGroups: ["upper-body", "stepped-wall", "wings", "wing-frame", "cap", "rotor", "tail"] },
    { id: "night-open-floor", label: "Night · open saw-floor work pools", projection: "perspective", position: point(20, 9.5, -24), target: point(0, 4.2, -0.4), fov: 34, lighting: "night" },
    { id: "window-detail", label: "Detail · real upper windows and reveals", projection: "perspective", position: point(-5, 8.5, 12), target: point(0, 7.55, 3.2), fov: 26 },
    { id: "silhouette", label: "Silhouette control", projection: "orthographic", position: point(0, 11.8, 48), target: point(0, 11.2, 0), orthoHeight: 29 },
  ],
};
