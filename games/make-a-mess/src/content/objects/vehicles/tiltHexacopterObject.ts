import type {
  ObjectLabModel,
  ObjectLabPart,
  ObjectLabView,
  ObjectMaterialId,
  ObjectPoint,
} from "../dutchWindmills/objectModel.ts";
import {
  buildLoft,
  buildRevolution,
  buildTorqueBox,
  facetsToPart,
  type Facet,
} from "../authoring/solidBuilders.ts";

type MaterialOverride = Readonly<Record<string, number | boolean>>;
type TiltView = ObjectLabView & { readonly up?: ObjectPoint };
export type TiltHinge = {
  readonly id: string;
  readonly group: string;
  readonly pivot: ObjectPoint;
  readonly axis: ObjectPoint;
  readonly rangeDegrees: readonly [number, number];
  readonly restDegrees: number;
  readonly motion: "independent-eccentric-tilt";
};
type TiltHexacopterModel = Omit<ObjectLabModel, "views"> & {
  readonly captureFrame: readonly [number, number];
  readonly materialOverrides: Readonly<Record<string, MaterialOverride>>;
  readonly surfaceHinges: Readonly<Record<string, TiltHinge>>;
  readonly views: readonly TiltView[];
};

const TAU = Math.PI * 2;
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

const addCylinder = (
  id: string,
  group: string,
  material: ObjectMaterialId,
  from: ObjectPoint,
  to: ObjectPoint,
  radius: number,
  radialSegments = 20,
) => parts.push({ kind: "cylinder", id, group, material, from, to, radius, radialSegments });

const addFacets = (
  id: string,
  group: string,
  material: ObjectMaterialId,
  facets: readonly Facet[],
  showEdges = false,
) => parts.push(facetsToPart(id, group, material, facets, { showEdges }));

// ---------------------------------------------------------------------------
// Authored engineering envelope. The approved concept owns character and the
// 6+2 topology only; these dimensions are a review hypothesis at human scale.
// ---------------------------------------------------------------------------

export const TILT_HEX_ROTOR_OUTER_RADIUS = 1.05;
export const TILT_HEX_ROTOR_THROAT_RADIUS = 0.88;
export const TILT_HEX_ROTOR_TIP_RADIUS = 0.81;
export const TILT_HEX_ROTOR_CENTER_X = 2.28;
export const TILT_HEX_ROTOR_Y = 1.18;
export const TILT_HEX_ROTOR_Z = [2.5, 0, -2.5] as const;
export const TILT_HEX_BELT_BEAM_Z = [1.25, -1.25, -3.72] as const;
export const TILT_HEX_HINGE_RANGE = [-8, 92] as const;
export const TILT_HEX_PART_BUDGET = 220;
export const TILT_HEX_CREW_STATIONS_Z = [2.95, 1.95] as const;
export const TILT_HEX_ENERGY_MODULE_Z = [0.3, -0.8, -1.9] as const;

type BodySection = {
  readonly z: number;
  readonly bellyY: number;
  readonly keelHalf: number;
  readonly chineHalf: number;
  readonly chineY: number;
  readonly cheekHalf: number;
  readonly cheekY: number;
  readonly shoulderHalf: number;
  readonly deckY: number;
  readonly crownY: number;
};

export const TILT_HEX_BODY_SECTIONS: readonly BodySection[] = [
  // B10 restores the accepted B08 body family. Only the last third is changed:
  // its belly rises around the lower core while the rear termination stays
  // broad enough to carry a central RAX-like structural tail boom.
  { z: 5.35, bellyY: 0.5, keelHalf: 0.06, chineHalf: 0.13, chineY: 0.54, cheekHalf: 0.16, cheekY: 0.64, shoulderHalf: 0.1, deckY: 0.77, crownY: 0.82 },
  { z: 4.85, bellyY: 0.34, keelHalf: 0.13, chineHalf: 0.34, chineY: 0.43, cheekHalf: 0.42, cheekY: 0.7, shoulderHalf: 0.26, deckY: 1.0, crownY: 1.08 },
  { z: 4.1, bellyY: 0.22, keelHalf: 0.2, chineHalf: 0.56, chineY: 0.34, cheekHalf: 0.68, cheekY: 0.7, shoulderHalf: 0.43, deckY: 1.23, crownY: 1.34 },
  { z: 3.35, bellyY: 0.16, keelHalf: 0.27, chineHalf: 0.78, chineY: 0.3, cheekHalf: 0.9, cheekY: 0.68, shoulderHalf: 0.58, deckY: 1.36, crownY: 1.5 },
  { z: 2.45, bellyY: 0.14, keelHalf: 0.34, chineHalf: 0.94, chineY: 0.3, cheekHalf: 1.025, cheekY: 0.7, shoulderHalf: 0.67, deckY: 1.44, crownY: 1.6 },
  { z: 1.0, bellyY: 0.12, keelHalf: 0.37, chineHalf: 0.91, chineY: 0.29, cheekHalf: 0.98, cheekY: 0.72, shoulderHalf: 0.65, deckY: 1.49, crownY: 1.66 },
  { z: -0.6, bellyY: 0.12, keelHalf: 0.37, chineHalf: 0.87, chineY: 0.3, cheekHalf: 0.92, cheekY: 0.75, shoulderHalf: 0.62, deckY: 1.5, crownY: 1.68 },
  { z: -1.5, bellyY: 0.22, keelHalf: 0.34, chineHalf: 0.82, chineY: 0.36, cheekHalf: 0.86, cheekY: 0.78, shoulderHalf: 0.59, deckY: 1.48, crownY: 1.66 },
  { z: -2.35, bellyY: 0.34, keelHalf: 0.31, chineHalf: 0.78, chineY: 0.48, cheekHalf: 0.82, cheekY: 0.82, shoulderHalf: 0.62, deckY: 1.47, crownY: 1.65 },
  { z: -3.1, bellyY: 0.54, keelHalf: 0.28, chineHalf: 0.68, chineY: 0.67, cheekHalf: 0.72, cheekY: 0.9, shoulderHalf: 0.56, deckY: 1.45, crownY: 1.62 },
  { z: -3.8, bellyY: 0.82, keelHalf: 0.22, chineHalf: 0.56, chineY: 0.92, cheekHalf: 0.6, cheekY: 1.04, shoulderHalf: 0.46, deckY: 1.45, crownY: 1.62 },
  { z: -4.8, bellyY: 0.96, keelHalf: 0.18, chineHalf: 0.49, chineY: 1.04, cheekHalf: 0.52, cheekY: 1.14, shoulderHalf: 0.42, deckY: 1.52, crownY: 1.7 },
];

const bodyRing = (section: BodySection): ObjectPoint[] => [
  point(section.keelHalf, section.bellyY + 0.025, section.z),
  point(section.chineHalf, section.chineY, section.z),
  point(section.cheekHalf, section.cheekY, section.z),
  point(section.shoulderHalf, section.deckY, section.z),
  point(0, section.crownY, section.z),
  point(-section.shoulderHalf, section.deckY, section.z),
  point(-section.cheekHalf, section.cheekY, section.z),
  point(-section.chineHalf, section.chineY, section.z),
  point(-section.keelHalf, section.bellyY + 0.025, section.z),
];

addFacets(
  "armoured-hull-shell",
  "hull-shell",
  "timber-dark",
  buildLoft(TILT_HEX_BODY_SECTIONS.map(bodyRing), { tag: "survival-cell", capStart: true, capEnd: true }),
);

const forwardVisorSections = [
  { z: 4.42, baseHalf: 0.22, baseY: 1.05, glassHalf: 0.13, glassY: 1.16, crownHalf: 0.055, crownY: 1.22, topY: 1.25 },
  { z: 3.88, baseHalf: 0.4, baseY: 1.28, glassHalf: 0.29, glassY: 1.4, crownHalf: 0.14, crownY: 1.46, topY: 1.5 },
  { z: 3.15, baseHalf: 0.5, baseY: 1.43, glassHalf: 0.38, glassY: 1.58, crownHalf: 0.19, crownY: 1.65, topY: 1.7 },
] as const;

const cockpitCellSections = [
  forwardVisorSections.at(-1)!,
  { z: 2.2, baseHalf: 0.56, baseY: 1.5, glassHalf: 0.42, glassY: 1.72, crownHalf: 0.2, crownY: 1.82, topY: 1.87 },
  { z: 1.0, baseHalf: 0.51, baseY: 1.53, glassHalf: 0.38, glassY: 1.82, crownHalf: 0.19, crownY: 1.93, topY: 1.98 },
  { z: 0.35, baseHalf: 0.42, baseY: 1.54, glassHalf: 0.3, glassY: 1.88, crownHalf: 0.16, crownY: 2.0, topY: 2.05 },
] as const;

const aftCanopyArmourSections = [
  cockpitCellSections.at(-1)!,
  { z: -0.3, baseHalf: 0.43, baseY: 1.55, glassHalf: 0.31, glassY: 1.94, crownHalf: 0.15, crownY: 2.08, topY: 2.13 },
  { z: -0.82, baseHalf: 0.35, baseY: 1.53, glassHalf: 0.24, glassY: 1.96, crownHalf: 0.12, crownY: 2.13, topY: 2.18 },
] as const;

type CanopySection = typeof forwardVisorSections[number] | typeof cockpitCellSections[number] | typeof aftCanopyArmourSections[number];
const canopyRing = (section: CanopySection): ObjectPoint[] => [
  point(section.baseHalf, section.baseY, section.z),
  point(section.glassHalf, section.glassY, section.z),
  point(section.crownHalf, section.crownY, section.z),
  point(0, section.topY, section.z),
  point(-section.crownHalf, section.crownY, section.z),
  point(-section.glassHalf, section.glassY, section.z),
  point(-section.baseHalf, section.baseY, section.z),
];

addFacets(
  "canopy-forward-visor",
  "canopy",
  "glazing",
  buildLoft(forwardVisorSections.map(canopyRing), { tag: "canopy-forward", capStart: true }),
);
addFacets(
  "canopy-cockpit-cell",
  "canopy",
  "glazing",
  buildLoft(cockpitCellSections.map(canopyRing), { tag: "canopy-cell" }),
);
addFacets(
  "canopy-aft-armour-transition",
  "dorsal-hump",
  "timber-dark",
  buildLoft(aftCanopyArmourSections.map(canopyRing), { tag: "canopy-aft-armour", capEnd: true }),
);

const dorsalHumpSections = [
  { z: -0.78, half: 0.32, baseY: 1.5, crownY: 2.18 },
  { z: -1.35, half: 0.36, baseY: 1.5, crownY: 2.38 },
  { z: -2.0, half: 0.39, baseY: 1.48, crownY: 2.62 },
  { z: -2.72, half: 0.39, baseY: 1.46, crownY: 2.72 },
  { z: -3.35, half: 0.35, baseY: 1.43, crownY: 2.58 },
  { z: -4.8, half: 0.28, baseY: 1.48, crownY: 2.18 },
] as const;
const dorsalHumpRing = (section: typeof dorsalHumpSections[number]): ObjectPoint[] => [
  point(section.half, section.baseY + 0.1, section.z),
  point(section.half, section.crownY - 0.17, section.z),
  point(0, section.crownY, section.z),
  point(-section.half, section.crownY - 0.17, section.z),
  point(-section.half, section.baseY + 0.1, section.z),
  point(0, section.baseY, section.z),
];
addFacets("dorsal-armour-hump", "dorsal-hump", "timber-dark",
  buildLoft(dorsalHumpSections.map(dorsalHumpRing), {
    tag: "dorsal-armour-hump", capStart: true, capEnd: true,
  }));

// The primary core is a separate spatial cage inside the armoured hull. The
// exterior shell never substitutes for this load path.
addFacets("primary-core-keel", "primary-core", "metal", buildTorqueBox({
  from: point(0, 0.53, 3.35), to: point(0, 0.78, -3.74), width: 0.24, height: 0.28, chamfer: 0.045, tag: "core-keel",
}));
addFacets("primary-core-dorsal", "primary-core", "metal", buildTorqueBox({
  from: point(0, 1.44, 2.85), to: point(0, 1.5, -3.7), width: 0.2, height: 0.22, chamfer: 0.04, tag: "core-dorsal",
}));
const coreTailBoomSections = [
  { z: -3.35, half: 0.22, bottom: 1.0, top: 1.38 },
  { z: -4.0, half: 0.22, bottom: 1.05, top: 1.4 },
  { z: -4.8, half: 0.2, bottom: 1.12, top: 1.42 },
  { z: -5.65, half: 0.1, bottom: 1.18, top: 1.34 },
] as const;
addFacets("primary-core-tail-boom", "primary-core", "metal", buildLoft(
  coreTailBoomSections.map((section) => [
    point(section.half, section.bottom, section.z),
    point(section.half, section.top, section.z),
    point(-section.half, section.top, section.z),
    point(-section.half, section.bottom, section.z),
  ]),
  { tag: "core-tail-boom", capStart: true, capEnd: true },
));
for (const side of [-1, 1]) {
  addFacets(`primary-core-upper-longeron-${side}`, "primary-core", "metal", buildTorqueBox({
    from: point(side * 0.65, 1.25, 2.85), to: point(side * 0.34, 1.42, -3.7), width: 0.2, height: 0.22, chamfer: 0.04, tag: "core-upper-longeron",
  }));
  addFacets(`primary-core-lower-longeron-${side}`, "primary-core", "metal", buildTorqueBox({
    from: point(side * 0.65, 0.55, 2.85), to: point(side * 0.34, 0.75, -3.7), width: 0.2, height: 0.22, chamfer: 0.04, tag: "core-lower-longeron",
  }));
}
for (const [frameIndex, z] of TILT_HEX_BELT_BEAM_Z.entries()) {
  const frameHalf = frameIndex < 2 ? 0.82 : 0.38;
  addFacets(`primary-core-frame-upper-${frameIndex}`, "primary-core", "metal", buildTorqueBox({
    from: point(-frameHalf, 1.4, z), to: point(frameHalf, 1.4, z), width: 0.22, height: 0.2, chamfer: 0.04, tag: "core-frame-upper",
  }));
  addFacets(`primary-core-frame-lower-${frameIndex}`, "primary-core", "metal", buildTorqueBox({
    from: point(-frameHalf, 0.66, z), to: point(frameHalf, 0.66, z), width: 0.22, height: 0.2, chamfer: 0.04, tag: "core-frame-lower",
  }));
  for (const side of [-1, 1]) {
    addFacets(`primary-core-frame-post-${frameIndex}-${side}`, "primary-core", "metal", buildTorqueBox({
      from: point(side * (frameHalf - 0.02), 0.62, z), to: point(side * (frameHalf - 0.02), 1.44, z), width: 0.18, height: 0.18, chamfer: 0.035, tag: "core-frame-post",
    }));
  }
  addFacets(`primary-core-frame-diagonal-${frameIndex}`, "primary-core", "metal", buildTorqueBox({
    from: point(-(frameHalf - 0.06), 0.69, z), to: point(frameHalf - 0.06, 1.37, z), width: 0.15, height: 0.15, chamfer: 0.03, tag: "core-frame-diagonal",
  }));
}

// ---------------------------------------------------------------------------
// Static armour belts. Each is a swept loft in plan and a solid chamfered
// shield in section: there is no hidden internal longitudinal wall.
// ---------------------------------------------------------------------------

const beltStations = [
  { z: 4.45, inner: 2.68, outer: 2.88, bottom: 0.82, top: 1.55 },
  { z: 3.85, inner: 3.12, outer: 3.34, bottom: 0.62, top: 1.78 },
  { z: 3.05, inner: 3.38, outer: 3.7, bottom: 0.4, top: 2.05 },
  { z: 1.25, inner: 3.64, outer: 4.05, bottom: 0.28, top: 2.25 },
  { z: -1.25, inner: 3.72, outer: 4.18, bottom: 0.2, top: 2.38 },
  { z: -2.7, inner: 3.54, outer: 4.22, bottom: 0.14, top: 2.55 },
  { z: -3.7, inner: 3.28, outer: 4.16, bottom: 0.1, top: 2.7 },
  { z: -4.15, inner: 3.18, outer: 4.2, bottom: 0.08, top: 2.74 },
] as const;

const beltSection = (side: number, station: typeof beltStations[number]): ObjectPoint[] => {
  const ring = [
    point(side * station.inner, station.bottom + 0.24, station.z),
    point(side * station.outer, station.bottom, station.z),
    point(side * station.outer, station.top, station.z),
    point(side * station.inner, station.top + 0.28, station.z),
  ];
  return side > 0 ? ring : [...ring].reverse();
};

for (const side of [-1, 1]) {
  const label = side < 0 ? "left" : "right";
  addFacets(
    `outer-armour-belt-${label}`,
    `armour-belt-${label}`,
    "timber-dark",
    buildLoft(beltStations.map((station) => beltSection(side, station)), {
      tag: `armour-belt-${label}`,
      capStart: true,
      capEnd: true,
    }),
  );
  for (const [index, station] of beltStations.entries()) {
    addFacets(`armour-belt-rib-${label}-${index}`, `armour-belt-${label}`, "metal", buildTorqueBox({
      from: point(side * (station.outer + 0.015), station.bottom + 0.12, station.z),
      to: point(side * (station.outer + 0.015), station.top - 0.12, station.z),
      width: 0.12,
      height: 0.12,
      chamfer: 0.025,
      tag: "armour-belt-rib",
    }));
  }
}

const beltInnerAt = (z: number) => {
  for (let index = 0; index < beltStations.length - 1; index += 1) {
    const front = beltStations[index];
    const rear = beltStations[index + 1];
    if (z <= front.z && z >= rear.z) {
      const ratio = (front.z - z) / (front.z - rear.z);
      return front.inner + (rear.inner - front.inner) * ratio;
    }
  }
  return beltStations.at(-1)!.inner;
};

// Three chamfered aerodynamic spars per side. Paired across the hull, their
// axes rise outward from the lower core and read as a downward-narrowing load
// trapezoid. Two sit in inter-ring gaps; the third lands in the reinforced rear
// terminal frame. Moving rings never carry armour loads.
for (const side of [-1, 1]) {
  const label = side < 0 ? "left" : "right";
  for (const [index, z] of TILT_HEX_BELT_BEAM_Z.entries()) {
    const beltX = side * (beltInnerAt(z) + 0.05);
    const rootHalf = index < 2 ? 0.78 : 0.36;
    const rootX = side * rootHalf;
    const rootY = index < 2 ? 0.58 : 0.68;
    const beltY = index < 2 ? 1.0 : 1.08;
    addFacets(`belt-spar-${label}-${index}`, "belt-spars", "metal", buildTorqueBox({
      from: point(rootX, rootY, z),
      to: point(beltX, beltY, z),
      width: 0.36,
      height: 0.32,
      chamfer: 0.055,
      tag: "belt-spar",
    }));
    addBox(`belt-spar-root-${label}-${index}`, "belt-sockets", "paint-light",
      point(rootX, rootY + 0.12, z), point(0.34, 0.64, 0.4));
    addBox(`belt-spar-socket-${label}-${index}`, "belt-sockets", "paint-light",
      point(side * beltInnerAt(z), beltY, z), point(0.34, 0.54, 0.4));
  }
}

// ---------------------------------------------------------------------------
// Six independent eccentric-hinge lift modules.
// ---------------------------------------------------------------------------

export const TILT_HEX_ROTOR_STATIONS = TILT_HEX_ROTOR_Z.flatMap((z, row) => (
  [-1, 1] as const
).map((side) => {
  const sideName = side < 0 ? "left" : "right";
  return {
    id: `${["front", "middle", "rear"][row]}-${sideName}`,
    row,
    side,
    center: point(side * TILT_HEX_ROTOR_CENTER_X, TILT_HEX_ROTOR_Y, z),
    pivot: point(side * (TILT_HEX_ROTOR_CENTER_X - TILT_HEX_ROTOR_OUTER_RADIUS - 0.12), TILT_HEX_ROTOR_Y, z),
  } as const;
}));

const surfaceHinges: Record<string, TiltHinge> = {};

for (const station of TILT_HEX_ROTOR_STATIONS) {
  const group = `tilt-ring-${station.id}`;
  surfaceHinges[station.id] = {
    id: station.id,
    group,
    pivot: station.pivot,
    axis: point(0, 0, 1),
    rangeDegrees: TILT_HEX_HINGE_RANGE,
    restDegrees: 0,
    motion: "independent-eccentric-tilt",
  };

  addFacets(`duct-shell-${station.id}`, group, "timber-mid", buildRevolution([
    { radius: TILT_HEX_ROTOR_OUTER_RADIUS - 0.03, y: TILT_HEX_ROTOR_Y + 0.18 },
    { radius: TILT_HEX_ROTOR_OUTER_RADIUS, y: TILT_HEX_ROTOR_Y + 0.12 },
    { radius: TILT_HEX_ROTOR_OUTER_RADIUS, y: TILT_HEX_ROTOR_Y - 0.14 },
    { radius: TILT_HEX_ROTOR_OUTER_RADIUS - 0.05, y: TILT_HEX_ROTOR_Y - 0.2 },
    { radius: TILT_HEX_ROTOR_THROAT_RADIUS, y: TILT_HEX_ROTOR_Y - 0.14 },
    { radius: TILT_HEX_ROTOR_THROAT_RADIUS - 0.02, y: TILT_HEX_ROTOR_Y + 0.12 },
    { radius: TILT_HEX_ROTOR_OUTER_RADIUS - 0.03, y: TILT_HEX_ROTOR_Y + 0.18 },
  ], { x: station.center[0], z: station.center[2] }, { segments: 32, tag: "duct-shell" }));

  addCylinder(`rotor-hub-${station.id}`, group, "metal",
    point(station.center[0], TILT_HEX_ROTOR_Y - 0.12, station.center[2]),
    point(station.center[0], TILT_HEX_ROTOR_Y + 0.12, station.center[2]),
    0.18,
    20,
  );
  for (let blade = 0; blade < 8; blade += 1) {
    const angle = (blade / 8) * TAU + station.row * 0.11;
    const radius = 0.52;
    addBox(
      `rotor-blade-${station.id}-${blade}`,
      group,
      "dark-recess",
      point(
        station.center[0] + Math.cos(angle) * radius,
        TILT_HEX_ROTOR_Y,
        station.center[2] + Math.sin(angle) * radius,
      ),
      point(0.72, 0.055, 0.15),
      point(0, -angle, 0),
    );
  }

  const ringInnerX = station.side * (TILT_HEX_ROTOR_CENTER_X - TILT_HEX_ROTOR_THROAT_RADIUS + 0.03);
  for (const zOffset of [-0.3, 0.3]) {
    addFacets(`moving-clevis-${station.id}-${zOffset}`, group, "metal", buildTorqueBox({
      from: point(station.pivot[0], station.pivot[1], station.pivot[2] + zOffset),
      to: point(ringInnerX, station.pivot[1], station.pivot[2] + zOffset),
      width: 0.16,
      height: 0.18,
      chamfer: 0.035,
      tag: "moving-clevis",
    }));
  }

  // Static carrier and pin. The pin is tangent to the ring, not through the
  // hub; the renderer and swept-envelope tests read the same pivot above.
  addFacets(`hinge-carrier-${station.id}`, "hinge-carriers", "metal", buildTorqueBox({
    from: point(station.side * 0.78, station.pivot[1], station.pivot[2]),
    to: station.pivot,
    width: 0.26,
    height: 0.3,
    chamfer: 0.05,
    tag: "hinge-carrier",
  }));
  addCylinder(`hinge-pin-${station.id}`, "hinge-carriers", "paint-accent",
    point(station.pivot[0], station.pivot[1], station.pivot[2] - 0.39),
    point(station.pivot[0], station.pivot[1], station.pivot[2] + 0.39),
    0.105,
    18,
  );
}

// ---------------------------------------------------------------------------
// Two longitudinal upper engines. These are independent of the six lift ducts.
// ---------------------------------------------------------------------------

const axialRevolution = (
  center: readonly [number, number],
  profile: readonly { readonly radius: number; readonly z: number }[],
  segments = 28,
): Facet[] => {
  const ringAt = (radius: number, z: number): ObjectPoint[] => Array.from({ length: segments }, (_, index) => {
    const angle = index * TAU / segments;
    return point(center[0] + Math.cos(angle) * radius, center[1] + Math.sin(angle) * radius, z);
  });
  const facets: Facet[] = [];
  for (let profileIndex = 0; profileIndex < profile.length - 1; profileIndex += 1) {
    const front = ringAt(profile[profileIndex].radius, profile[profileIndex].z);
    const rear = ringAt(profile[profileIndex + 1].radius, profile[profileIndex + 1].z);
    for (let index = 0; index < segments; index += 1) {
      const next = (index + 1) % segments;
      facets.push({ points: [front[index], rear[index], rear[next], front[next]], tag: "longitudinal-engine" });
    }
  }
  return facets;
};

for (const side of [-1, 1]) {
  const x = side * 0.9;
  const y = 1.8;
  addFacets(`longitudinal-engine-shell-${side}`, "longitudinal-engines", "roof-dark", axialRevolution([x, y], [
    { radius: 0.4, z: -0.7 },
    { radius: 0.46, z: -0.96 },
    { radius: 0.44, z: -3.0 },
    { radius: 0.32, z: -3.2 },
    { radius: 0.3, z: -0.88 },
    { radius: 0.4, z: -0.7 },
  ]));
  addCylinder(`longitudinal-engine-core-${side}`, "longitudinal-engines", "metal", point(x, y, -0.9), point(x, y, -3.0), 0.15, 20);
  const shroudSections = [
    { z: -0.66, halfX: 0.34, halfY: 0.32 },
    { z: -0.92, halfX: 0.48, halfY: 0.5 },
    { z: -2.95, halfX: 0.48, halfY: 0.5 },
    { z: -3.28, halfX: 0.36, halfY: 0.34 },
  ];
  const shroudRing = ({ z, halfX, halfY }: typeof shroudSections[number]): ObjectPoint[] => {
    const chamfer = 0.12;
    return [
      point(x + halfX, y - halfY + chamfer, z),
      point(x + halfX, y + halfY - chamfer, z),
      point(x + halfX - chamfer, y + halfY, z),
      point(x - halfX + chamfer, y + halfY, z),
      point(x - halfX, y + halfY - chamfer, z),
      point(x - halfX, y - halfY + chamfer, z),
      point(x - halfX + chamfer, y - halfY, z),
      point(x + halfX - chamfer, y - halfY, z),
    ];
  };
  addFacets(`engine-armour-shroud-${side}`, "engine-armour", "timber-dark",
    buildLoft(shroudSections.map(shroudRing), { tag: "engine-armour" }));
}

// ---------------------------------------------------------------------------
// E02 internal systems architecture. These components are authored packaging
// hypotheses inside the accepted B11 shell and separate primary cage. They do
// not own or alter any approved exterior contour.
// ---------------------------------------------------------------------------

const crewCapsuleSections = [
  { z: 3.75, half: 0.34, bottom: 0.72, shoulder: 1.25, crown: 1.43 },
  { z: 3.15, half: 0.5, bottom: 0.67, shoulder: 1.34, crown: 1.52 },
  { z: 1.55, half: 0.5, bottom: 0.67, shoulder: 1.36, crown: 1.55 },
  { z: 1.05, half: 0.38, bottom: 0.72, shoulder: 1.3, crown: 1.43 },
] as const;
addFacets("crew-survival-capsule", "crew-armour", "paint-light", buildLoft(
  crewCapsuleSections.map((section) => [
    point(section.half, section.bottom, section.z),
    point(section.half, section.shoulder, section.z),
    point(0, section.crown, section.z),
    point(-section.half, section.shoulder, section.z),
    point(-section.half, section.bottom, section.z),
  ]),
  { tag: "crew-survival-capsule", capStart: true, capEnd: true },
));
addBox("crew-cell-floor", "crew-cell", "metal", point(0, 0.74, 2.4), point(0.86, 0.08, 2.45));
for (const [index, z] of TILT_HEX_CREW_STATIONS_Z.entries()) {
  addBox(`crew-seat-${index}`, "crew-cell", "roof-dark", point(0, 0.98, z), point(0.5, 0.55, 0.58), point(-0.18, 0, 0));
  addBox(`crew-console-${index}`, "crew-cell", "glazing", point(0, 1.16, z + 0.38), point(0.58, 0.22, 0.24), point(-0.12, 0, 0));
}

addBox("avionics-flight-control", "avionics", "paint-accent", point(0, 0.87, 4.12), point(0.68, 0.48, 0.72));
addBox("avionics-navigation", "avionics", "paint-light", point(-0.42, 1.08, 3.72), point(0.22, 0.32, 0.38));
addBox("avionics-mission", "avionics", "paint-light", point(0.42, 1.08, 3.72), point(0.22, 0.32, 0.38));

for (const [row, z] of TILT_HEX_ENERGY_MODULE_Z.entries()) {
  for (const side of [-1, 1]) {
    addBox(`energy-module-${row}-${side}`, "energy-storage", "paint-accent",
      point(side * 0.27, 0.94, z), point(0.42, 0.42, 0.78));
  }
}
addBox("power-distribution-forward", "power-distribution", "metal", point(0, 1.18, 0.82), point(0.74, 0.22, 0.36));
addBox("power-distribution-aft", "power-distribution", "metal", point(0, 1.18, -2.68), point(0.7, 0.22, 0.42));
for (const side of [-1, 1]) {
  addCylinder(`high-voltage-bus-${side}`, "power-distribution", "paint-accent",
    point(side * 0.48, 1.28, 3.35), point(side * 0.38, 1.32, -3.25), 0.035, 12);
  addCylinder(`coolant-supply-${side}`, "cooling-system", "water-reserve",
    point(side * 0.55, 1.08, 3.2), point(side * 0.42, 1.1, -3.25), 0.045, 12);
  addCylinder(`coolant-return-${side}`, "cooling-system", "water-reserve",
    point(side * 0.55, 0.86, 3.2), point(side * 0.42, 0.9, -3.25), 0.045, 12);
  addBox(`heat-exchanger-${side}`, "cooling-system", "paint-light",
    point(side * 0.48, 1.15, -3.46), point(0.32, 0.52, 0.5));
  addCylinder(`coolant-pump-${side}`, "cooling-system", "metal",
    point(side * 0.48, 0.9, -2.98), point(side * 0.48, 1.18, -2.98), 0.11, 16);
}

for (const station of TILT_HEX_ROTOR_STATIONS) {
  const actuatorX = station.side * 0.98;
  addCylinder(`tilt-actuator-${station.id}`, "ring-actuators", "paint-accent",
    point(actuatorX, station.pivot[1], station.pivot[2] - 0.2),
    point(actuatorX, station.pivot[1], station.pivot[2] + 0.2), 0.14, 18);
  addBox(`tilt-controller-${station.id}`, "ring-actuators", "paint-light",
    point(station.side * 0.76, station.pivot[1] + 0.26, station.pivot[2]), point(0.24, 0.22, 0.3));
}

// ---------------------------------------------------------------------------
// Canonical model, views and same-geometry articulation studies.
// ---------------------------------------------------------------------------

const tiltDemo: Readonly<Record<string, number>> = Object.fromEntries(
  TILT_HEX_ROTOR_STATIONS.map((station) => [
    `tilt-ring-${station.id}`,
    [8, 24, 42][station.row] * (station.side < 0 ? 0.55 : 1),
  ]),
);
const sideHover: Readonly<Record<string, number>> = Object.fromEntries(
  TILT_HEX_ROTOR_STATIONS.map((station) => [`tilt-ring-${station.id}`, 82]),
);
const liftGroups = TILT_HEX_ROTOR_STATIONS.map((station) => `tilt-ring-${station.id}`);
const coreIsolationHiddenGroups = [
  "hull-shell", "canopy", "dorsal-hump", "engine-armour", "longitudinal-engines",
  "hinge-carriers", "belt-spars", "belt-sockets", "armour-belt-left", "armour-belt-right",
  ...liftGroups,
];
const coreLoadPathHiddenGroups = [
  "hull-shell", "canopy", "dorsal-hump", "engine-armour", "longitudinal-engines",
  "hinge-carriers", ...liftGroups,
];
const dorsalProfileHiddenGroups = [
  "armour-belt-left", "armour-belt-right", "belt-spars", "belt-sockets",
  "hinge-carriers", "engine-armour", "longitudinal-engines", ...liftGroups,
];
const engineTailProfileHiddenGroups = [
  "armour-belt-left", "armour-belt-right", "belt-spars", "belt-sockets",
  "hinge-carriers", ...liftGroups,
];
const systemsIsolationHiddenGroups = [
  "hull-shell", "canopy", "dorsal-hump", "engine-armour", "longitudinal-engines",
  "hinge-carriers", "belt-spars", "belt-sockets", "armour-belt-left", "armour-belt-right",
  "ring-actuators", ...liftGroups,
];
const systemsCutawayHiddenGroups = ["hull-shell", "canopy", "dorsal-hump", "engine-armour"];
const systemsPlanHiddenGroups = [
  "hull-shell", "canopy", "dorsal-hump", "engine-armour", "armour-belt-left", "armour-belt-right",
];
const crewProfileHiddenGroups = [
  "hull-shell", "canopy", "dorsal-hump", "crew-armour", "engine-armour", "longitudinal-engines",
  "armour-belt-left", "armour-belt-right", "belt-spars", "belt-sockets", "hinge-carriers",
  "primary-core", "energy-storage", "power-distribution", "cooling-system", "ring-actuators", ...liftGroups,
];

export const tiltHexacopterObject: TiltHexacopterModel = {
  id: "tilt-hexacopter-b11",
  revision: "tilt-hex-e02-systems-2026-08-16",
  title: "Tilt hexacopter — B11 exterior with E02 internal systems architecture",
  units: "metres",
  coordinates: { up: "+Y", front: "+Z", origin: "ground-centre" },
  sourceNotes: [
    "The approved generated image owns visual character and visible 6+2 topology only; dimensions and hidden structure are authored review hypotheses.",
    "Static load path: outer armour belt -> three paired sloped aerodynamic support frames -> discrete primary-core cage inside the armoured hull.",
    "The hull shell is non-primary in this study: it is hidden independently in cutaway and never substitutes for the spatial core.",
    "B10 returns to the coherent B08 body and changes only the requested rear third: the belly cuts upward around the untouched lower core, the tail termination grows slightly longer and wider, and a tapered RAX-like central tail boom continues the primary cage aft of the shell.",
    "B11 retains the complete B10 massing and replaces the separate bubble-canopy crown with one continuously rising dorsal line from the nose armour through low glazing into the shark ridge.",
    "The armour belts are intentionally asymmetric: a sharp front run grows into a taller, thicker rear impact and support structure.",
    "A half-segment front extension protects the forward rotor diagonal; stepped glazing hands its roof line to a broad upper shark ridge that separates and only moderately crowns the two partially buried axial engines.",
    "Each complete lift duct is a separate kinematic group on a longitudinal axis tangent to its inner rim; no pivot crosses a fan hub.",
    "E02 adds a tandem crew capsule, avionics, six removable energy modules, paired high-voltage and coolant trunks, heat exchangers, pumps and six local ring actuators without changing the accepted B11 exterior.",
    "This is a design-development packaging study. Loads, propulsion sizing, weapons, landing gear, physics and world placement are excluded.",
  ],
  dimensions: {
    authoredRotorDiameter: TILT_HEX_ROTOR_OUTER_RADIUS * 2,
    rotorCount: 6,
    longitudinalEngineCount: 2,
    armourBeltCount: 2,
    armourSparCount: 3,
    armourHalfSparCount: 6,
    hingeMinimumDegrees: TILT_HEX_HINGE_RANGE[0],
    hingeMaximumDegrees: TILT_HEX_HINGE_RANGE[1],
    crewStationCount: TILT_HEX_CREW_STATIONS_Z.length,
    energyModuleCount: TILT_HEX_ENERGY_MODULE_Z.length * 2,
    ringActuatorCount: TILT_HEX_ROTOR_STATIONS.length,
  },
  labMetrics: [
    { label: "LIFT DUCTS", value: 6, decimals: 0, unit: "" },
    { label: "UPPER ENGINES", value: 2, decimals: 0, unit: "" },
    { label: "SUPPORT FRAMES", value: 3, decimals: 0, unit: "" },
    { label: "ENERGY MODULES", value: 6, decimals: 0, unit: "" },
    { label: "ROTOR DIA", value: TILT_HEX_ROTOR_OUTER_RADIUS * 2, decimals: 2 },
    { label: "PARTS", value: parts.length, decimals: 0, unit: "" },
  ],
  anchors: {
    origin: point(0, 0, 0),
    pilotEye: point(0, 1.9, 1.68),
    centreOfMassHypothesis: point(0, 1.02, -0.25),
    forwardBeltFrame: point(0, 1.09, TILT_HEX_BELT_BEAM_Z[0]),
    rearBeltFrame: point(0, 1.09, TILT_HEX_BELT_BEAM_Z[1]),
    terminalBeltFrame: point(0, 0.9, TILT_HEX_BELT_BEAM_Z[2]),
  },
  motionConstraints: {
    independentLiftDuctCount: 6,
    pivotAxisParallelToFuselage: true,
    pivotThroughHubForbidden: true,
    armourBeltsStatic: true,
    armourSupportedThroughMovingRingsForbidden: true,
    worldPlacementAllowed: false,
  },
  captureFrame: [1600, 1000],
  labEnvironment: { floorRadius: 10, gridSize: 10, gridDivisions: 20, fogNear: 21, fogFar: 31, floorY: 0 },
  materialOverrides: {
    "timber-dark": { color: 0x24292c, roughness: 0.62, metalness: 0.22 },
    "timber-mid": { color: 0x444b4e, roughness: 0.5, metalness: 0.42 },
    "roof-dark": { color: 0x171c20, roughness: 0.58, metalness: 0.28 },
    metal: { color: 0x7d7f7d, roughness: 0.34, metalness: 0.88 },
    "paint-light": { color: 0x5f6668, roughness: 0.5, metalness: 0.5 },
    "paint-accent": { color: 0xd38a35, roughness: 0.4, metalness: 0.18 },
    "dark-recess": { color: 0x080b0d, roughness: 0.96, metalness: 0 },
    glazing: { color: 0x0b1820, roughness: 0.1, metalness: 0.06, transparent: true, opacity: 0.78 },
  },
  surfaceHinges,
  parts,
  views: [
    { id: "front", label: "Front orthographic — belts, chamfers and rotor bays", projection: "orthographic", position: point(0, 1.3, 15), target: point(0, 1.15, 0), orthoHeight: 5.4 },
    { id: "rear", label: "Rear orthographic — engine pair and belt section", projection: "orthographic", position: point(0, 1.3, -15), target: point(0, 1.15, 0), orthoHeight: 5.4 },
    { id: "left", label: "Left orthographic — hull crown and three stations", projection: "orthographic", position: point(-15, 1.35, 0), target: point(0, 1.15, 0), orthoHeight: 7.5 },
    { id: "right", label: "Right orthographic — engine and belt depth", projection: "orthographic", position: point(15, 1.35, 0), target: point(0, 1.15, 0), orthoHeight: 7.5 },
    { id: "top", label: "Top orthographic — longitudinal fighter silhouette", projection: "orthographic", position: point(0, 16, 0), target: point(0, 1.05, 0), up: point(0, 0, 1), orthoHeight: 10.2 },
    { id: "front-three-quarter", label: "Front three-quarter — complete static state", projection: "perspective", position: point(-7.2, 7.5, 10.2), target: point(0, 1.05, 0), fov: 31 },
    { id: "rear-three-quarter", label: "Rear three-quarter — belt sockets and upper engines", projection: "perspective", position: point(7.3, 7.0, -9.8), target: point(0, 1.1, -0.2), fov: 32 },
    { id: "high-three-quarter", label: "High three-quarter — frame and rotor layout", projection: "perspective", position: point(-8.8, 9.8, 8.5), target: point(0, 1.0, 0), fov: 32 },
    { id: "reference-match", label: "Reference-character camera — massing only", projection: "perspective", position: point(-7.2, 6.8, 9.2), target: point(0, 1.05, 0), fov: 30 },
    { id: "belt-load-path", label: "Detail — body root, continuous spar and belt socket", projection: "perspective", position: point(-1.9, 4.5, 5.0), target: point(-2.05, 1.08, 1.25), fov: 30 },
    { id: "hinge-detail", label: "Detail — eccentric pin outside the duct", projection: "perspective", position: point(-1.65, 3.8, 4.75), target: point(-1.72, 1.18, 2.5), fov: 29, articulation: tiltDemo },
    { id: "independent-tilt", label: "Articulation — six independent phases", projection: "perspective", position: point(-7.1, 7.8, 9.8), target: point(0, 1.05, 0), fov: 31, articulation: tiltDemo },
    { id: "side-hover", label: "Articulation — all ducts near lateral-thrust state", projection: "perspective", position: point(0, 8.2, 10.8), target: point(0, 1.05, 0), fov: 31, articulation: sideHover },
    { id: "structural-exterior", label: "Structural pair — complete exterior", projection: "perspective", position: point(-6.7, 7.2, 8.8), target: point(0, 1.05, 0), fov: 31 },
    { id: "structural-cutaway", label: "Structural pair — shell, canopy and dorsal armour hidden", projection: "perspective", position: point(-6.7, 7.2, 8.8), target: point(0, 1.05, 0), fov: 31, hiddenGroups: ["hull-shell", "canopy", "dorsal-hump", "engine-armour"] },
    { id: "primary-core-isometric", label: "Primary core — isolated spatial cage", projection: "perspective", position: point(-5.2, 4.6, 6.6), target: point(0, 0.98, -0.25), fov: 28, hiddenGroups: coreIsolationHiddenGroups },
    { id: "primary-core-load-path", label: "Primary core — three paired sloped support frames and fixed belts", projection: "perspective", position: point(-7.2, 7.6, 9.4), target: point(0, 0.95, -0.2), fov: 30, hiddenGroups: coreLoadPathHiddenGroups },
    { id: "dorsal-profile", label: "Central profile — continuous nose-canopy-ridge line", projection: "orthographic", position: point(-15, 1.55, 0), target: point(0, 1.28, 0), orthoHeight: 7.2, hiddenGroups: dorsalProfileHiddenGroups },
    { id: "central-body-three-quarter", label: "Central body — low integrated glazing over retained B10 shell", projection: "perspective", position: point(-4.8, 3.6, 7.5), target: point(0, 1.14, 0.5), fov: 30, hiddenGroups: dorsalProfileHiddenGroups },
    { id: "engine-tail-profile", label: "Engine-tail profile — buried nacelles and restrained crown", projection: "orthographic", position: point(-15, 1.6, 0), target: point(0, 1.35, 0), orthoHeight: 7.2, hiddenGroups: engineTailProfileHiddenGroups },
    { id: "silhouette", label: "Silhouette control — plan", projection: "orthographic", position: point(0, 16, 0), target: point(0, 1.05, 0), up: point(0, 0, 1), orthoHeight: 10.2 },
    { id: "systems-cutaway", label: "E02 systems — complete internal architecture in cutaway", projection: "perspective", position: point(-6.4, 6.5, 8.2), target: point(0, 1.05, 0), fov: 30, hiddenGroups: systemsCutawayHiddenGroups },
    { id: "systems-isometric", label: "E02 systems — isolated core, crew, power and cooling", projection: "perspective", position: point(-5.4, 4.8, 6.8), target: point(0, 1.0, 0), fov: 29, hiddenGroups: systemsIsolationHiddenGroups },
    { id: "systems-plan", label: "E02 systems — power and cooling distribution plan", projection: "orthographic", position: point(0, 15, 0), target: point(0, 1.0, 0), up: point(0, 0, 1), orthoHeight: 8.1, hiddenGroups: systemsPlanHiddenGroups },
    { id: "crew-cell-profile", label: "E02 systems — tandem crew cell and forward avionics", projection: "orthographic", position: point(-14, 1.5, 2.2), target: point(0, 1.1, 2.2), orthoHeight: 3.8, hiddenGroups: crewProfileHiddenGroups },
    { id: "actuator-layout", label: "E02 systems — six local hinge actuators", projection: "perspective", position: point(-5.8, 6.4, 8.6), target: point(0, 1.15, 0), fov: 29, hiddenGroups: ["hull-shell", "canopy", "dorsal-hump", "engine-armour", "longitudinal-engines", "armour-belt-left", "armour-belt-right"] },
  ],
};

export const tiltHexacopterParts = parts;
export const tiltHexacopterHinges = Object.values(surfaceHinges);
