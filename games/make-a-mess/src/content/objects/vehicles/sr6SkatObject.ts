import type {
  ObjectLabModel,
  ObjectLabPart,
  ObjectLabView,
  ObjectMaterialId,
  ObjectPoint,
  ObjectTriangle,
} from "../dutchWindmills/objectModel.ts";
import {
  buildLoft,
  buildRevolution,
  buildSlab,
  buildTorqueBox,
  facetsToPart,
  type Facet,
  type PlanPoint,
} from "../authoring/solidBuilders.ts";

type Sr6LabView = ObjectLabView & { up?: ObjectPoint };
type MaterialOverride = Readonly<Record<string, number | boolean>>;
type Sr6LabModel = Omit<ObjectLabModel, "views"> & {
  materialOverrides: Readonly<Record<string, MaterialOverride>>;
  views: readonly Sr6LabView[];
};

const TAU = Math.PI * 2;
const parts: ObjectLabPart[] = [];

const point = (x: number, y: number, z: number): ObjectPoint => [x, y, z];
const plan = (x: number, z: number): PlanPoint => ({ x, z });
const lerp = (from: number, to: number, ratio: number) => from + (to - from) * ratio;

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
  radialSegments = 24,
) => parts.push({ kind: "cylinder", id, group, material, from, to, radius, radialSegments });

const addMesh = (
  id: string,
  group: string,
  material: ObjectMaterialId,
  vertices: ObjectPoint[],
  triangles: ObjectTriangle[],
  doubleSided = true,
  vertexColors?: ObjectPoint[],
) => parts.push({ kind: "mesh", id, group, material, vertices, triangles, doubleSided, vertexColors });

const addFacets = (
  id: string,
  group: string,
  material: ObjectMaterialId,
  facets: readonly Facet[],
  options: { readonly showEdges?: boolean } = {},
) => parts.push(facetsToPart(id, group, material, facets, options));

const addEllipsoid = (
  id: string,
  group: string,
  material: ObjectMaterialId,
  center: ObjectPoint,
  radii: ObjectPoint,
  longitudeSegments = 18,
  latitudeSegments = 10,
) => {
  const vertices: ObjectPoint[] = [];
  const triangles: ObjectTriangle[] = [];
  for (let latitude = 0; latitude <= latitudeSegments; latitude += 1) {
    const phi = (latitude / latitudeSegments) * Math.PI;
    for (let longitude = 0; longitude < longitudeSegments; longitude += 1) {
      const theta = (longitude / longitudeSegments) * TAU;
      vertices.push(point(
        center[0] + Math.sin(phi) * Math.sin(theta) * radii[0],
        center[1] + Math.cos(phi) * radii[1],
        center[2] + Math.sin(phi) * Math.cos(theta) * radii[2],
      ));
    }
  }
  for (let latitude = 0; latitude < latitudeSegments; latitude += 1) {
    for (let longitude = 0; longitude < longitudeSegments; longitude += 1) {
      const next = (longitude + 1) % longitudeSegments;
      const a = latitude * longitudeSegments + longitude;
      const b = latitude * longitudeSegments + next;
      const c = (latitude + 1) * longitudeSegments + longitude;
      const d = (latitude + 1) * longitudeSegments + next;
      triangles.push([a, c, d], [a, d, b]);
    }
  }
  addMesh(id, group, material, vertices, triangles, false);
};

const rectangleRing = (
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
): PlanPoint[] => [
  plan(minX, minZ), plan(maxX, minZ), plan(maxX, maxZ), plan(minX, maxZ),
];

// ---------------------------------------------------------------------------
// Protected propulsion layout: four forward lift units and two higher, more
// powerful rear units. Station coordinates, spin senses, power classes and the
// rear-to-front thrust ratio carry the flight model and are not styling.
//
// `radius` is the nacelle's outer structural radius. The forward four are sized
// so that adjacent rings clear each other by 74 mm instead of intersecting: on
// the reference the six nacelles touch through structure, never through each
// other. Fan diameters follow from it and keep the 1.337 rear/front disc ratio.
// ---------------------------------------------------------------------------

export const SR6_ROTOR_STATIONS = [
  { id: "front-left", x: -1.46, z: 1.75, spin: "cw", radius: 0.62, powerClass: "front", planeY: 0.88 },
  { id: "front-right", x: 1.46, z: 1.75, spin: "ccw", radius: 0.62, powerClass: "front", planeY: 0.88 },
  { id: "mid-left", x: -1.65, z: 0.45, spin: "ccw", radius: 0.62, powerClass: "front", planeY: 0.9 },
  { id: "mid-right", x: 1.65, z: 0.45, spin: "cw", radius: 0.62, powerClass: "front", planeY: 0.9 },
  { id: "rear-left", x: -1.5, z: -1.65, spin: "cw", radius: 0.706, powerClass: "rear", planeY: 1.06 },
  { id: "rear-right", x: 1.5, z: -1.65, spin: "ccw", radius: 0.706, powerClass: "rear", planeY: 1.06 },
] as const;

type RotorStation = typeof SR6_ROTOR_STATIONS[number];

/** Nacelle depth below its deck line. */
const NACELLE_DEPTH = 0.26;
const nacelleDeck = (station: RotorStation) => station.planeY + 0.12;
const nacelleFloor = (station: RotorStation) => nacelleDeck(station) - NACELLE_DEPTH;
const throatRadius = (station: RotorStation) => station.radius - 0.055;
const tipRadius = (station: RotorStation) => station.radius - 0.075;

export const SR6_FRONT_ROTOR_DIAMETER = Math.round(tipRadius(SR6_ROTOR_STATIONS[0]) * 2000) / 1000;
export const SR6_REAR_ROTOR_DIAMETER = Math.round(tipRadius(SR6_ROTOR_STATIONS[4]) * 2000) / 1000;
export const SR6_ROTOR_PLANE_Y = 0.92;

// ---------------------------------------------------------------------------
// M8 — the airframe is an open space frame, not a plate and not a ring-and-tube
// mobile.
//
// The reference carries load through deep box-section carbon members with large
// voids between them: two side torque boxes with cooling ribs, transverse boxes
// with lightening windows fore and aft, short webs in every nacelle-to-nacelle
// gap, and a separate set of roots into the cockpit core. The nacelles hang on
// that frame; the cockpit hangs on it through its own clevises. Losing the
// cockpit does not detach the nacelles from each other, which is the point of
// having both load paths.
// ---------------------------------------------------------------------------

const FRAME_DECK_FORWARD = nacelleDeck(SR6_ROTOR_STATIONS[0]);
const FRAME_DECK_REAR = nacelleDeck(SR6_ROTOR_STATIONS[4]);
const FRAME_SPINE_FORWARD = FRAME_DECK_FORWARD - NACELLE_DEPTH / 2;
const FRAME_SPINE_REAR = FRAME_DECK_REAR - NACELLE_DEPTH / 2;

const frontStation = SR6_ROTOR_STATIONS[1];
const midStation = SR6_ROTOR_STATIONS[3];
const rearStation = SR6_ROTOR_STATIONS[5];

// --- nacelles ---------------------------------------------------------------

for (const station of SR6_ROTOR_STATIONS) {
  const group = `rotor-${station.id}`;
  const centre = plan(station.x, station.z);
  const deck = nacelleDeck(station);
  const floor = nacelleFloor(station);
  const outer = station.radius;
  const throat = throatRadius(station);
  const mouth = throat + 0.028;

  // One closed cross-section revolved: bell-mouth inlet, throat, exit diffuser,
  // chamfered outer wall. A straight tube capped with a flat washer is what made
  // the previous ducts read as tin lids.
  addFacets(`${group}-nacelle`, group, "timber-dark", buildRevolution(
    [
      { radius: mouth, y: deck },
      { radius: outer - 0.022, y: deck },
      { radius: outer, y: deck - 0.026 },
      { radius: outer, y: floor + 0.026 },
      { radius: outer - 0.022, y: floor },
      { radius: throat + 0.04, y: floor },
      { radius: throat, y: floor + 0.045 },
      { radius: throat, y: deck - 0.145 },
      { radius: throat + 0.014, y: deck - 0.095 },
      { radius: throat + 0.026, y: deck - 0.04 },
      { radius: mouth, y: deck },
    ],
    centre,
    { segments: 56, tag: "nacelle" },
  ));

  // Machined rim: the brightest line on the reference and the one that draws
  // the plan silhouette at any distance.
  addFacets(`${group}-rim`, group, "metal", buildRevolution(
    [
      { radius: mouth, y: deck },
      { radius: mouth, y: deck + 0.014 },
      { radius: mouth + 0.012, y: deck + 0.03 },
      { radius: outer + 0.004, y: deck + 0.03 },
      { radius: outer + 0.016, y: deck + 0.012 },
      { radius: outer + 0.016, y: deck - 0.03 },
      { radius: outer - 0.006, y: deck - 0.03 },
      { radius: outer - 0.006, y: deck },
      { radius: mouth, y: deck },
    ],
    centre,
    { segments: 56, tag: "rim" },
  ));

  const hubRadius = station.powerClass === "rear" ? 0.16 : 0.135;
  addCylinder(`${group}-motor`, group, "metal", point(station.x, station.planeY - 0.15, station.z), point(station.x, station.planeY + 0.15, station.z), hubRadius, 28);
  addCylinder(`${group}-motor-cap`, group, "metal", point(station.x, station.planeY + 0.145, station.z), point(station.x, station.planeY + 0.195, station.z), hubRadius * 0.62, 24);
  addCylinder(`${group}-hub-index`, group, "paint-accent", point(station.x, station.planeY + 0.193, station.z), point(station.x, station.planeY + 0.201, station.z), hubRadius * 0.2, 16);

  const bladePhase = station.spin === "cw" ? 0.12 : 0.12 + Math.PI / 5;
  const tip = tipRadius(station);
  const bladeDark: ObjectPoint = [0.078, 0.094, 0.102];
  const bladeBand: ObjectPoint = [0.847, 0.373, 0.133];
  for (let blade = 0; blade < 5; blade += 1) {
    const angle = bladePhase + (blade / 5) * TAU;
    const spinSign = station.spin === "cw" ? 1 : -1;
    const bladePoint = (radius: number, chord: number, tangent: number, y: number): ObjectPoint => {
      const bladeAngle = angle + spinSign * 0.1 * ((radius - 0.13) / (tip - 0.13));
      return point(
        station.x + Math.sin(bladeAngle) * radius + Math.cos(bladeAngle) * tangent * chord,
        y,
        station.z + Math.cos(bladeAngle) * radius - Math.sin(bladeAngle) * tangent * chord,
      );
    };
    const lower = station.planeY - 0.018;
    const upper = station.planeY + 0.018;
    // Three spanwise stations so the orange tip band is a band, not a gradient
    // down the whole blade. The band rides the blade, so it survives spin-up.
    const spans = [
      { radius: 0.13, chord: 0.09, colour: bladeDark },
      { radius: lerp(0.13, tip, 0.62), chord: 0.075, colour: bladeDark },
      { radius: lerp(0.13, tip, 0.74), chord: 0.07, colour: bladeBand },
      { radius: lerp(0.13, tip, 0.9), chord: 0.06, colour: bladeBand },
      { radius: tip, chord: 0.05, colour: bladeDark },
    ];
    const vertices: ObjectPoint[] = [];
    const colours: ObjectPoint[] = [];
    for (const span of spans) {
      for (const level of [lower, upper]) {
        for (const tangent of [-1, 1]) {
          vertices.push(bladePoint(span.radius, span.chord, tangent, level));
          colours.push(span.colour);
        }
      }
    }
    const triangles: ObjectTriangle[] = [];
    for (let span = 0; span < spans.length - 1; span += 1) {
      const a = span * 4;
      const b = (span + 1) * 4;
      triangles.push(
        [a + 0, b + 0, b + 1], [a + 0, b + 1, a + 1],
        [a + 2, a + 3, b + 3], [a + 2, b + 3, b + 2],
        [a + 1, b + 1, b + 3], [a + 1, b + 3, a + 3],
        [a + 2, b + 2, b + 0], [a + 2, b + 0, a + 0],
      );
    }
    const last = (spans.length - 1) * 4;
    triangles.push([0, 1, 3], [0, 3, 2], [last, last + 2, last + 3], [last, last + 3, last + 1]);
    addMesh(`${group}-blade-${blade}`, group, "canvas", vertices, triangles, true, colours);
  }

  // One guard grille per nacelle as a single mesh: fine bars cost vertices, not
  // rigid bodies.
  const guardY = deck - 0.05;
  const guardFacets: Facet[] = [];
  const barHalf = 0.006;
  for (let spoke = 0; spoke < 24; spoke += 1) {
    const angle = (spoke / 24) * TAU;
    const from = plan(station.x + Math.cos(angle) * (hubRadius + 0.01), station.z + Math.sin(angle) * (hubRadius + 0.01));
    const to = plan(station.x + Math.cos(angle) * (throat - 0.01), station.z + Math.sin(angle) * (throat - 0.01));
    guardFacets.push(...buildTorqueBox({
      from: point(from.x, guardY, from.z),
      to: point(to.x, guardY, to.z),
      width: barHalf * 2,
      height: barHalf * 2,
      chamfer: barHalf * 0.4,
      tag: "guard-bar",
    }));
  }
  for (const ratio of [0.34, 0.52, 0.7, 0.88]) {
    const radius = hubRadius + (throat - hubRadius) * ratio;
    guardFacets.push(...buildRevolution(
      [
        { radius: radius - barHalf, y: guardY + barHalf },
        { radius: radius + barHalf, y: guardY + barHalf },
        { radius: radius + barHalf, y: guardY - barHalf },
        { radius: radius - barHalf, y: guardY - barHalf },
        { radius: radius - barHalf, y: guardY + barHalf },
      ],
      centre,
      { segments: 40, tag: "guard-ring" },
    ));
  }
  addFacets(`${group}-guard`, group, "timber-mid", guardFacets);

  // Motor pylons span the full throat and are visible at the fan plane, the way
  // a real ducted unit carries its motor.
  for (let pylon = 0; pylon < 3; pylon += 1) {
    const angle = pylon * TAU / 3 + 0.35;
    addFacets(`${group}-motor-pylon-${pylon}`, group, "timber-dark", buildTorqueBox({
      from: point(station.x + Math.sin(angle) * hubRadius, station.planeY - 0.06, station.z + Math.cos(angle) * hubRadius),
      to: point(station.x + Math.sin(angle) * (throat - 0.005), station.planeY - 0.085, station.z + Math.cos(angle) * (throat - 0.005)),
      width: 0.05,
      height: 0.07,
      chamfer: 0.014,
      tag: "pylon",
    }));
  }

  const outboard = station.x < 0 ? -1 : 1;
  addBox(
    `${group}-service-panel`,
    group,
    "dark-recess",
    point(station.x + outboard * (outer + 0.012), deck - 0.09, station.z),
    point(0.04, 0.06, 0.24),
  );
  addBox(
    `${group}-direction-mark`,
    group,
    "paint-accent",
    point(station.x + outboard * (outer + 0.02), deck + 0.032, station.z),
    point(0.03, 0.012, 0.14),
  );
}

// --- side torque boxes ------------------------------------------------------

const SIDE_BOX_HALF_WIDTH = 0.09;
const sideBoxChain: readonly { x: number; y: number; z: number }[] = [
  { x: 2.14, y: FRAME_SPINE_FORWARD, z: 2.02 },
  { x: 2.30, y: FRAME_SPINE_FORWARD, z: 1.10 },
  { x: 2.30, y: FRAME_SPINE_FORWARD, z: 0.45 },
  { x: 2.30, y: FRAME_SPINE_FORWARD + 0.04, z: -0.55 },
  { x: 2.26, y: FRAME_SPINE_REAR, z: -1.65 },
  { x: 2.12, y: FRAME_SPINE_REAR, z: -2.16 },
];

for (const side of [-1, 1]) {
  const facets: Facet[] = [];
  for (let index = 0; index < sideBoxChain.length - 1; index += 1) {
    const from = sideBoxChain[index];
    const to = sideBoxChain[index + 1];
    facets.push(...buildTorqueBox({
      from: point(side * from.x, from.y, from.z),
      to: point(side * to.x, to.y, to.z),
      width: SIDE_BOX_HALF_WIDTH * 2,
      height: 0.3,
      chamfer: 0.05,
      tag: "side-box",
    }));
  }
  addFacets(`side-torque-box-${side}`, "primary-frame", "timber-dark", facets);

  // The one bright line on the machine, besides the nacelle rims: a polished
  // cap along the top edge of the torque box. It is what draws the silhouette
  // in profile and in plan, so it is structure-coloured, never decoration.
  const cap: Facet[] = [];
  for (let index = 0; index < sideBoxChain.length - 1; index += 1) {
    const from = sideBoxChain[index];
    const to = sideBoxChain[index + 1];
    cap.push(...buildTorqueBox({
      from: point(side * from.x, from.y + 0.142, from.z),
      to: point(side * to.x, to.y + 0.142, to.z),
      width: 0.15,
      height: 0.036,
      chamfer: 0.014,
      tag: "cap",
    }));
  }
  addFacets(`side-torque-cap-${side}`, "primary-frame", "metal", cap);

  // Orange is reserved for functional marks: rotor sense, service points and
  // these warning triangles. It is never asked to be a shape.
  for (const [index, z] of [1.55, -0.35].entries()) {
    addBox(`side-warning-mark-${side}-${index}`, "primary-frame", "paint-accent", point(side * 2.372, FRAME_SPINE_FORWARD + 0.06, z), point(0.016, 0.08, 0.09));
  }

  // Cooling rib along the outboard face, called out on the reference sheet.
  for (let rib = 0; rib < 5; rib += 1) {
    const z = lerp(1.32, -1.28, rib / 4);
    const y = z > -0.55 ? FRAME_SPINE_FORWARD : FRAME_SPINE_REAR - 0.02;
    addBox(`side-cooling-rib-${side}-${rib}`, "primary-frame", "dark-recess", point(side * 2.36, y + 0.03, z), point(0.05, 0.11, 0.26));
    addBox(`side-cooling-vane-${side}-${rib}`, "primary-frame", "metal", point(side * 2.375, y + 0.03, z), point(0.02, 0.085, 0.2));
  }
}

// --- transverse frames with lightening windows ------------------------------

// The forward frame is a chamfered carbon panel with real voids through it: two
// lightening windows and a centre slot the cell's chin drops through. That slot
// is why the nose reads as a body passing between frame rails instead of a
// bumper bolted across them.
addFacets("forward-frame-panel", "primary-frame", "timber-dark", buildSlab({
  outline: rectangleRing(-0.94, 0.94, 1.84, 2.26),
  holes: [
    rectangleRing(0.34, 0.7, 1.96, 2.14),
    rectangleRing(-0.7, -0.34, 1.96, 2.14),
    rectangleRing(-0.22, 0.22, 1.92, 2.18),
  ],
  topAt: () => FRAME_DECK_FORWARD,
  bottomAt: () => FRAME_DECK_FORWARD - 0.2,
  chamfer: 0.036,
}), { showEdges: false });

// Rear nacelles hang on broad swept carbon plates, not on tubes. That
// difference is authored, not incidental: on the reference the forward units
// are tied in with round spars while the aft pair rides a wide panel that also
// forms the visible underside of the rear structure.
for (const side of [-1, 1]) {
  addFacets(`aft-nacelle-plate-${side}`, "primary-frame", "timber-dark", buildSlab({
    outline: [
      plan(side * 0.52, -0.5), plan(side * 0.99, -1.0),
      plan(side * 0.99, -1.94), plan(side * 0.52, -1.46),
    ],
    holes: [[
      plan(side * 0.66, -1.06), plan(side * 0.9, -1.3),
      plan(side * 0.9, -1.74), plan(side * 0.66, -1.42),
    ]],
    topAt: () => FRAME_DECK_REAR + 0.06,
    bottomAt: () => FRAME_DECK_REAR - 0.14,
    chamfer: 0.032,
  }), { showEdges: false });
}

for (const side of [-1, 1]) {
  // Short webs close every nacelle-to-nacelle gap. Without them the ring pairs
  // are held only through the cockpit, which is exactly the failure the
  // reference's double load path avoids.
  addFacets(`nacelle-web-front-mid-${side}`, "primary-frame", "timber-dark", buildTorqueBox({
    from: point(side * 1.5, FRAME_SPINE_FORWARD, 1.32),
    to: point(side * 1.61, FRAME_SPINE_FORWARD, 0.88),
    width: 0.16,
    height: 0.26,
    chamfer: 0.04,
    tag: "web",
  }));
  addFacets(`nacelle-web-mid-rear-${side}`, "primary-frame", "timber-dark", buildTorqueBox({
    from: point(side * 1.62, FRAME_SPINE_FORWARD, -0.14),
    to: point(side * 1.53, FRAME_SPINE_REAR, -0.98),
    width: 0.15,
    height: 0.26,
    chamfer: 0.04,
    tag: "web",
  }));
  addFacets(`tail-cross-box-${side}`, "primary-frame", "timber-dark", buildTorqueBox({
    from: point(0, FRAME_SPINE_REAR, -2.26),
    to: point(side * 1.6, FRAME_SPINE_REAR, -2.22),
    width: 0.13,
    height: 0.22,
    chamfer: 0.034,
    tag: "tail-cross",
  }));

  // Cockpit-core roots: a separate load path from the frame into the survival
  // cell, landing in visible clevises rather than disappearing into the shell.
  const roots = [
    { id: "front-inboard", from: point(side * 0.17, 1.14, 1.78), to: point(side * 0.88, 1.0, 1.76), radius: 0.075 },
    { id: "front-forward", from: point(side * 0.1, 1.05, 2.1), to: point(side * 0.9, 0.96, 1.98), radius: 0.058 },
    { id: "mid-inboard", from: point(side * 0.34, 1.2, 0.62), to: point(side * 1.06, 0.94, 0.5), radius: 0.07 },
    { id: "aft-plate", from: point(side * 0.48, 1.22, -0.62), to: point(side * 0.94, 1.14, -1.16), radius: 0.055 },
  ] as const;
  for (const root of roots) {
    addCylinder(`core-root-${root.id}-${side}`, "primary-frame", "timber-mid", root.from, root.to, root.radius, 16);
    addBox(`core-clevis-${root.id}-${side}`, "survival-frame", "metal", root.from, point(0.11, 0.19, 0.17));
  }

  addFacets(`keel-box-${side}`, "primary-frame", "timber-dark", buildTorqueBox({
    from: point(side * 0.56, 0.74, 1.9),
    to: point(side * 0.56, 0.78, -0.62),
    width: 0.13,
    height: 0.16,
    chamfer: 0.034,
    tag: "keel",
  }));
}

// ---------------------------------------------------------------------------
// Steel core.
//
// Everything above is skin and box structure. Without a core the nacelles hang
// off panels that compile to plastic, and a single round through the belly
// takes the machine apart — which is exactly what happened. The core is a
// closed steel skeleton the exterior hides: a centreline keel beam, two
// longerons inside the side torque boxes, and a saddle from every nacelle to
// both the longeron outboard and the core inboard.
//
// There are deliberately NO plain transverse members. A beam straight across
// the machine reads as a bar bolted over a copter and breaks its look, and it
// is not needed: the closed path is nacelle → outer saddle → longeron and
// nacelle → inner saddle → keel beam, so every ring is tied to the core twice
// without anything crossing the open bays.
// ---------------------------------------------------------------------------

const CORE_KEEL_Y = 0.88;
addFacets("core-keel-beam", "core-frame", "timber-mid", buildTorqueBox({
  from: point(0, CORE_KEEL_Y, 2.02),
  to: point(0, CORE_KEEL_Y + 0.07, -2.08),
  width: 0.15,
  height: 0.17,
  chamfer: 0.036,
  tag: "keel-beam",
}));

for (const side of [-1, 1]) {
  const facets: Facet[] = [];
  for (let index = 0; index < sideBoxChain.length - 1; index += 1) {
    const from = sideBoxChain[index];
    const to = sideBoxChain[index + 1];
    facets.push(...buildTorqueBox({
      from: point(side * (from.x - 0.01), from.y, from.z),
      to: point(side * (to.x - 0.01), to.y, to.z),
      width: 0.085,
      height: 0.2,
      chamfer: 0.024,
      tag: "longeron",
    }));
  }
  addFacets(`core-longeron-${side}`, "core-frame", "timber-mid", facets);
}

/** Every nacelle is bolted to the longeron outboard and to the core inboard. */
const CORE_INBOARD_NODES: Readonly<Record<string, ObjectPoint>> = {
  front: point(0.09, CORE_KEEL_Y - 0.02, 1.45),
  mid: point(0.09, CORE_KEEL_Y + 0.01, 0.1),
  rear: point(0.09, CORE_KEEL_Y + 0.05, -1.3),
};

for (const station of SR6_ROTOR_STATIONS) {
  const side = station.x < 0 ? -1 : 1;
  const row = station.id.startsWith("front") ? "front" : station.id.startsWith("mid") ? "mid" : "rear";
  const node = CORE_INBOARD_NODES[row];
  const spine = station.powerClass === "rear" ? FRAME_SPINE_REAR : FRAME_SPINE_FORWARD;
  const longeronX = row === "front" ? 2.19 : row === "mid" ? 2.29 : 2.25;

  addFacets(`core-saddle-outer-${station.id}`, "core-frame", "timber-mid", buildTorqueBox({
    from: point(station.x + side * (station.radius - 0.05), spine, station.z),
    to: point(side * longeronX, spine, station.z),
    width: 0.1,
    height: 0.14,
    chamfer: 0.026,
    tag: "saddle-outer",
  }));

  addFacets(`core-saddle-inner-${station.id}`, "core-frame", "timber-mid", buildTorqueBox({
    from: point(station.x - side * (station.radius - 0.04), spine - 0.05, station.z),
    to: point(side * node[0], node[1], node[2]),
    width: 0.085,
    height: 0.11,
    chamfer: 0.022,
    tag: "saddle-inner",
  }));
}

// ---------------------------------------------------------------------------
// M9 — the survival cell is a faceted wedge, not a lofted blob.
//
// Four control lines run its length: deck edge, shoulder crease, chine and
// keel. The shoulder is the widest line and sits just above the frame spine;
// below it the flanks fall inward to a narrow keel that hangs under the frame.
// The cell ends at a bulkhead behind the pilot — the reference has no white
// tail boom, and M6's raised tail spine was invented.
// ---------------------------------------------------------------------------

type CabinSection = {
  readonly z: number;
  /** Top panel, between the two deck creases. */
  readonly deckHalf: number;
  readonly deckY: number;
  /** Upper edge of the flank, after the narrow deck chamfer. */
  readonly shoulderHalf: number;
  readonly shoulderY: number;
  /** Lower edge of the flank: maximum beam. */
  readonly flankHalf: number;
  readonly flankY: number;
  /** Upper edge of the belly bevel, after the narrow chine chamfer. */
  readonly chineHalf: number;
  readonly chineY: number;
  /** Edge of the flat bottom over the battery bay. */
  readonly keelHalf: number;
  readonly keelY: number;
};

/**
 * The body is a run of flat surfaces; only the transitions between them are
 * rounded, and they are rounded by narrow chamfer strips rather than by curving
 * the panels. Stations are therefore placed at the creases, not sampled along a
 * curve — five per side plus two centreline rails give the top panel, deck
 * chamfer, flank, chine chamfer, belly bevel and flat bottom.
 *
 * In profile: the nose rises to a clear cockpit start; the cockpit ends at an
 * equally clear station and the body steps up into a ridge; from there the deck
 * runs to the end of the silhouette, level and very slightly rising. Underneath,
 * nose and tail are both bevelled down toward the battery bay, which is the
 * lowest and flattest part of the machine.
 */
const cabinSections: readonly CabinSection[] = [
  { z: 2.34, deckHalf: 0.042, deckY: 1.086, shoulderHalf: 0.078, shoulderY: 1.062, flankHalf: 0.100, flankY: 1.030, chineHalf: 0.086, chineY: 1.010, keelHalf: 0.044, keelY: 1.002 },
  { z: 1.85, deckHalf: 0.078, deckY: 1.196, shoulderHalf: 0.130, shoulderY: 1.160, flankHalf: 0.163, flankY: 1.106, chineHalf: 0.140, chineY: 0.930, keelHalf: 0.072, keelY: 0.900 },
  { z: 1.40, deckHalf: 0.112, deckY: 1.290, shoulderHalf: 0.176, shoulderY: 1.248, flankHalf: 0.220, flankY: 1.172, chineHalf: 0.189, chineY: 0.800, keelHalf: 0.097, keelY: 0.740 },
  { z: 1.07, deckHalf: 0.140, deckY: 1.352, shoulderHalf: 0.210, shoulderY: 1.306, flankHalf: 0.262, flankY: 1.204, chineHalf: 0.225, chineY: 0.716, keelHalf: 0.115, keelY: 0.626 },
  { z: 0.55, deckHalf: 0.184, deckY: 1.400, shoulderHalf: 0.264, shoulderY: 1.352, flankHalf: 0.328, flankY: 1.216, chineHalf: 0.282, chineY: 0.660, keelHalf: 0.144, keelY: 0.548 },
  // Sill line under the canopy, then the coaming step: the deck jumps to the
  // glass's own top height over 0.12 m, so the glass hands its top line to the
  // white body instead of ending against a lower deck.
  { z: 0.00, deckHalf: 0.222, deckY: 1.440, shoulderHalf: 0.314, shoulderY: 1.396, flankHalf: 0.399, flankY: 1.222, chineHalf: 0.343, chineY: 0.648, keelHalf: 0.176, keelY: 0.532 },
  { z: -0.12, deckHalf: 0.240, deckY: 1.700, shoulderHalf: 0.330, shoulderY: 1.560, flankHalf: 0.414, flankY: 1.226, chineHalf: 0.356, chineY: 0.650, keelHalf: 0.182, keelY: 0.534 },
  { z: -0.55, deckHalf: 0.286, deckY: 1.700, shoulderHalf: 0.378, shoulderY: 1.566, flankHalf: 0.469, flankY: 1.238, chineHalf: 0.403, chineY: 0.700, keelHalf: 0.207, keelY: 0.596 },
  { z: -0.95, deckHalf: 0.318, deckY: 1.700, shoulderHalf: 0.418, shoulderY: 1.566, flankHalf: 0.520, flankY: 1.240, chineHalf: 0.447, chineY: 0.796, keelHalf: 0.229, keelY: 0.700 },
  // Aft of the bay the rear body has its own profile: a shoulder break, then a
  // long shallow run that carries all the way to the tail beam.
  { z: -1.25, deckHalf: 0.308, deckY: 1.658, shoulderHalf: 0.406, shoulderY: 1.540, flankHalf: 0.505, flankY: 1.240, chineHalf: 0.434, chineY: 0.968, keelHalf: 0.222, keelY: 0.890 },
  { z: -1.60, deckHalf: 0.290, deckY: 1.560, shoulderHalf: 0.382, shoulderY: 1.470, flankHalf: 0.475, flankY: 1.250, chineHalf: 0.408, chineY: 1.090, keelHalf: 0.209, keelY: 1.030 },
  { z: -1.95, deckHalf: 0.268, deckY: 1.450, shoulderHalf: 0.352, shoulderY: 1.386, flankHalf: 0.438, flankY: 1.276, chineHalf: 0.376, chineY: 1.180, keelHalf: 0.192, keelY: 1.140 },
  { z: -2.18, deckHalf: 0.250, deckY: 1.380, shoulderHalf: 0.330, shoulderY: 1.336, flankHalf: 0.410, flankY: 1.290, chineHalf: 0.352, chineY: 1.240, keelHalf: 0.180, keelY: 1.210 },
];

// Rings run down the port flank first. The loft advances aft, so this is the
// winding whose side quads face outward; the check is facetVolume, not the eye.
const cabinRing = (section: CabinSection): ObjectPoint[] => [
  point(0, section.deckY, section.z),
  point(-section.deckHalf, section.deckY, section.z),
  point(-section.shoulderHalf, section.shoulderY, section.z),
  point(-section.flankHalf, section.flankY, section.z),
  point(-section.chineHalf, section.chineY, section.z),
  point(-section.keelHalf, section.keelY, section.z),
  point(0, section.keelY, section.z),
  point(section.keelHalf, section.keelY, section.z),
  point(section.chineHalf, section.chineY, section.z),
  point(section.flankHalf, section.flankY, section.z),
  point(section.shoulderHalf, section.shoulderY, section.z),
  point(section.deckHalf, section.deckY, section.z),
];

addFacets("survival-cell-shell", "outer-shell", "paint-light", buildLoft(
  cabinSections.map(cabinRing),
  { tag: "cell", capStart: true, capEnd: true },
));

/**
 * Colour follows form. Each field owns the surface between two named creases,
 * so the material boundary is a control line rather than a painted edge:
 *
 *   deck / shoulder / flank  → bone composite (the cell loft above)
 *   chine → keel bevel       → carbon skirt
 *   flat bottom over the bay → steel armour plate
 *
 * The armour is not paint. It compiles to `steel` in the world, so the belly —
 * which is what a bad landing and anything thrown up off the ground actually
 * hits — survives impacts the composite shell does not. The mass it costs is
 * paid for by the engine-power bump in `airVehicles`.
 */
{
  const shell = (
    id: string,
    material: ObjectMaterialId,
    outer: (section: CabinSection, offset: number) => ObjectPoint[],
    thickness: number,
  ) => {
    const sections = cabinSections.map((section) => [
      ...outer(section, thickness),
      ...[...outer(section, 0)].reverse(),
    ]);
    addFacets(id, "outer-shell", material, buildLoft(sections, { tag: id, capStart: true, capEnd: true }));
  };

  // The bone/carbon boundary is a straight diagonal across the flank, not the
  // maximum-beam crease. Held on the crease it followed the body's own dip and
  // the flank read as one undivided panel; run straight and slightly rising
  // aft, it cuts the large flat bone panel the livery sits on and drops the
  // carbon below it. This line is the reference's strongest graphic move.
  // Straight across the whole flank the livery panel occupies, then it lifts
  // with the tail, because aft of the bay the body's own bottom climbs over the
  // rear frame and a straight line would run out below the chine.
  const LIVERY_LINE_NOSE = 1.02;
  const LIVERY_LINE_BREAK_Z = -1.25;
  const LIVERY_LINE_BREAK = 1.135;
  const LIVERY_LINE_TAIL = 1.262;
  const liveryLineY = (z: number) => (z >= LIVERY_LINE_BREAK_Z
    ? lerp(LIVERY_LINE_NOSE, LIVERY_LINE_BREAK, (cabinSections[0].z - z) / (cabinSections[0].z - LIVERY_LINE_BREAK_Z))
    : lerp(LIVERY_LINE_BREAK, LIVERY_LINE_TAIL, (LIVERY_LINE_BREAK_Z - z) / (LIVERY_LINE_BREAK_Z - cabinSections[cabinSections.length - 1].z)));
  /** Half-width of the flank at a height between the chine and flank rails. */
  const flankHalfAt = (section: CabinSection, y: number) => {
    const ratio = (y - section.chineY) / Math.max(1e-6, section.flankY - section.chineY);
    return section.chineHalf + Math.min(1, Math.max(0, ratio)) * (section.flankHalf - section.chineHalf);
  };

  shell("flank-carbon", "roof-dark", (section, offset) => {
    const y = liveryLineY(section.z);
    const half = flankHalfAt(section, y);
    return [
      point(-half - offset * 0.3, y - offset * 0.2, section.z),
      point(-section.chineHalf - offset * 0.8, section.chineY - offset * 0.6, section.z),
      point(-section.keelHalf - offset * 0.8, section.keelY - offset * 0.6, section.z),
      point(section.keelHalf + offset * 0.8, section.keelY - offset * 0.6, section.z),
      point(section.chineHalf + offset * 0.8, section.chineY - offset * 0.6, section.z),
      point(half + offset * 0.3, y - offset * 0.2, section.z),
    ];
  }, 0.012);

  // Butted armour plates over the whole lower surface — both bevels and the
  // flat bottom — each bolted to the keel beam. Authored as a run of separate
  // plates meeting on section boundaries rather than one skin, so a round that
  // does defeat a plate takes that plate and nothing else. They compile as
  // SOLID steel of real thickness instead of the 8 mm shell a machine gun used
  // to walk straight through.
  const ARMOUR_SEAMS = [0, 2, 4, 6, 8, 10, cabinSections.length - 1];
  for (let plate = 0; plate < ARMOUR_SEAMS.length - 1; plate += 1) {
    const span = cabinSections.slice(ARMOUR_SEAMS[plate], ARMOUR_SEAMS[plate + 1] + 1);
    const ring = (section: CabinSection, offset: number): ObjectPoint[] => [
      point(-section.chineHalf - offset * 0.55, section.chineY - offset * 0.5, section.z),
      point(-section.keelHalf - offset * 0.6, section.keelY - offset, section.z),
      point(0, section.keelY - offset, section.z),
      point(section.keelHalf + offset * 0.6, section.keelY - offset, section.z),
      point(section.chineHalf + offset * 0.55, section.chineY - offset * 0.5, section.z),
    ];
    addFacets(`belly-armour-plate-${plate}`, "armour", "timber-mid", buildLoft(
      span.map((section) => [...ring(section, 0.062), ...[...ring(section, 0.014)].reverse()]),
      { tag: `armour-${plate}`, capStart: true, capEnd: true },
    ));
    const mid = span[Math.floor(span.length / 2)];
    for (const side of [-1, 1]) {
      addBox(
        `belly-armour-stud-${plate}-${side}`,
        "armour",
        "metal",
        point(side * (mid.keelHalf * 0.55), mid.keelY - 0.03, mid.z),
        point(0.05, 0.17, 0.07),
      );
    }
  }
}

// --- canopy -----------------------------------------------------------------

type CanopySection = {
  readonly z: number;
  readonly baseHalf: number;
  readonly baseY: number;
  readonly glassHalf: number;
  readonly glassY: number;
  readonly crownHalf: number;
  readonly crownY: number;
  readonly topY: number;
};

// The cockpit starts and ends at declared stations: the windscreen frame lands
// on the deck crease at Z 1.62 and the rear frame on the one at Z -0.55, where
// the body steps up into its ridge.
const canopySections: readonly CanopySection[] = [
  { z: 1.07, baseHalf: 0.140, baseY: 1.352, glassHalf: 0.112, glassY: 1.424, crownHalf: 0.060, crownY: 1.484, topY: 1.504 },
  { z: 0.75, baseHalf: 0.166, baseY: 1.386, glassHalf: 0.144, glassY: 1.522, crownHalf: 0.080, crownY: 1.624, topY: 1.664 },
  { z: 0.40, baseHalf: 0.200, baseY: 1.408, glassHalf: 0.178, glassY: 1.582, crownHalf: 0.100, crownY: 1.676, topY: 1.710 },
  { z: 0.10, baseHalf: 0.222, baseY: 1.418, glassHalf: 0.198, glassY: 1.590, crownHalf: 0.110, crownY: 1.682, topY: 1.714 },
  { z: 0.00, baseHalf: 0.222, baseY: 1.440, glassHalf: 0.198, glassY: 1.596, crownHalf: 0.110, crownY: 1.684, topY: 1.712 },
  { z: -0.07, baseHalf: 0.230, baseY: 1.520, glassHalf: 0.196, glassY: 1.610, crownHalf: 0.108, crownY: 1.688, topY: 1.706 },
];

const canopyRing = (section: CanopySection): ObjectPoint[] => [
  point(0, section.baseY, section.z),
  point(section.baseHalf, section.baseY, section.z),
  point(section.glassHalf, section.glassY, section.z),
  point(section.crownHalf, section.crownY, section.z),
  point(0, section.topY, section.z),
  point(-section.crownHalf, section.crownY, section.z),
  point(-section.glassHalf, section.glassY, section.z),
  point(-section.baseHalf, section.baseY, section.z),
];

addFacets("canopy-glazing", "canopy", "glazing", buildLoft(
  canopySections.map(canopyRing),
  { tag: "canopy", capStart: true, capEnd: true },
));

for (const side of [-1, 1]) {
  const rail = canopySections.map((section) => point(side * section.baseHalf, section.baseY, section.z));
  const facets: Facet[] = [];
  for (let index = 0; index < rail.length - 1; index += 1) {
    facets.push(...buildTorqueBox({
      from: rail[index],
      to: rail[index + 1],
      width: 0.05,
      height: 0.045,
      chamfer: 0.012,
      tag: "sill",
    }));
  }
  addFacets(`canopy-sill-${side}`, "survival-frame", "metal", facets);
}

// --- systems, interior, lighting -------------------------------------------

// The battery bay is the flat bottom of the body itself, so the pack sits
// inside it rather than in a pod slung underneath.
addBox("battery-pack-forward", "systems", "roof-dark", point(0, 0.66, 0.52), point(0.31, 0.18, 0.6));
addBox("battery-pack-aft", "systems", "roof-dark", point(0, 0.64, -0.16), point(0.31, 0.18, 0.6));
addBox("battery-service-line", "systems", "paint-accent", point(0, 0.556, 0.18), point(0.26, 0.026, 0.03));
addBox("battery-access-hatch", "outer-shell", "dark-recess", point(0, 0.528, 0.18), point(0.26, 0.02, 0.74));

// --- cockpit: a place a pilot sits in, not a mannequin ----------------------

addBox("seat-pan", "interior", "dark-recess", point(0, 1.02, 0.58), point(0.4, 0.09, 0.5), point(-0.14, 0, 0));
addBox("seat-back", "interior", "dark-recess", point(0, 1.26, 0.25), point(0.38, 0.09, 0.62), point(-0.34, 0, 0));
for (const side of [-1, 1]) {
  addBox(`seat-bolster-${side}`, "interior", "dark-recess", point(side * 0.2, 1.26, 0.27), point(0.07, 0.16, 0.56), point(-0.34, 0, 0));
  addBox(`seat-rail-${side}`, "interior", "metal", point(side * 0.15, 0.97, 0.56), point(0.05, 0.05, 0.5));
  addBeam(`harness-strap-${side}`, "interior", "paint-accent", point(side * 0.15, 1.44, 0.27), point(side * 0.06, 1.08, 0.54), 0.05, 0.014);
}
addBox("seat-headrest", "interior", "dark-recess", point(0, 1.52, 0.1), point(0.24, 0.14, 0.1), point(-0.28, 0, 0));
addBox("harness-buckle", "interior", "metal", point(0, 1.08, 0.56), point(0.09, 0.05, 0.07));

// Instrument shroud and console, canted back toward the pilot.
addFacets("instrument-shroud", "interior", "roof-dark", buildLoft([
  [point(0, 1.36, 1.28), point(0.3, 1.3, 1.06), point(0.3, 1.16, 1.06), point(0, 1.12, 1.06), point(-0.3, 1.16, 1.06), point(-0.3, 1.3, 1.06)],
  [point(0, 1.32, 1.08), point(0.28, 1.26, 0.86), point(0.28, 1.1, 0.86), point(0, 1.06, 0.86), point(-0.28, 1.1, 0.86), point(-0.28, 1.26, 0.86)],
  [point(0, 1.24, 0.96), point(0.24, 1.19, 0.74), point(0.24, 1.06, 0.74), point(0, 1.03, 0.74), point(-0.24, 1.06, 0.74), point(-0.24, 1.19, 0.74)],
], { tag: "shroud", capStart: true, capEnd: true }));
addBox("instrument-screen", "interior", "glazing", point(0, 1.22, 0.955), point(0.34, 0.17, 0.02), point(0.26, 0, 0));
for (const side of [-1, 1]) {
  addBox(`side-console-${side}`, "interior", "dark-recess", point(side * 0.22, 1.08, 0.72), point(0.1, 0.08, 0.42));
  addBox(`throttle-lever-${side}`, "interior", "metal", point(side * 0.22, 1.16, 0.8), point(0.03, 0.12, 0.03), point(-0.3, 0, 0));
}

// Control column and yoke.
addCylinder("control-column", "interior", "metal", point(0, 1.02, 0.94), point(0, 1.22, 0.84), 0.035, 14);
addFacets("control-yoke", "interior", "roof-dark", [
  ...buildTorqueBox({ from: point(-0.19, 1.26, 0.82), to: point(0.19, 1.26, 0.82), width: 0.05, height: 0.04, chamfer: 0.012, tag: "yoke" }),
  ...buildTorqueBox({ from: point(-0.19, 1.26, 0.82), to: point(-0.2, 1.22, 0.9), width: 0.045, height: 0.045, chamfer: 0.012, tag: "grip" }),
  ...buildTorqueBox({ from: point(0.19, 1.26, 0.82), to: point(0.2, 1.22, 0.9), width: 0.045, height: 0.045, chamfer: 0.012, tag: "grip" }),
  ...buildTorqueBox({ from: point(0, 1.22, 0.84), to: point(0, 1.26, 0.82), width: 0.06, height: 0.05, chamfer: 0.014, tag: "hub" }),
]);
for (const side of [-1, 1]) {
  addBox(`yoke-grip-cap-${side}`, "interior", "paint-accent", point(side * 0.2, 1.216, 0.91), point(0.05, 0.03, 0.03));
  addBox(`rudder-pedal-${side}`, "interior", "metal", point(side * 0.11, 0.96, 1.16), point(0.1, 0.13, 0.05), point(-0.35, 0, 0));
}

addFacets("rollover-arch", "survival-frame", "metal", [
  ...buildTorqueBox({ from: point(-0.4, 1.24, -0.06), to: point(-0.24, 1.6, -0.08), width: 0.07, height: 0.06, chamfer: 0.018, tag: "arch" }),
  ...buildTorqueBox({ from: point(0.4, 1.24, -0.06), to: point(0.24, 1.6, -0.08), width: 0.07, height: 0.06, chamfer: 0.018, tag: "arch" }),
  ...buildTorqueBox({ from: point(-0.24, 1.6, -0.08), to: point(0.24, 1.6, -0.08), width: 0.06, height: 0.06, chamfer: 0.018, tag: "arch" }),
]);

// The louvred systems bay in the aft deck: the strongest single shape on the
// rear body, and the reason that deck reads as a cooled machinery cover rather
// than a fairing.
// The louvred systems bay sits in the ridge behind the cockpit — the shape the
// cabin turns into once the canopy ends.
const humpDeckY = (z: number) => {
  if (z >= 0) return 1.44;
  if (z >= -0.12) return lerp(1.44, 1.7, -z / 0.12);
  if (z >= -0.95) return 1.7;
  return lerp(1.7, 1.658, (-0.95 - z) / 0.3);
};
{
  const louvres: Facet[] = [];
  for (let slat = 0; slat < 7; slat += 1) {
    const z = lerp(-0.6, -1.0, slat / 6);
    const y = humpDeckY(z) - 0.026;
    louvres.push(...buildTorqueBox({
      from: point(-0.2, y, z),
      to: point(0.2, y, z),
      width: 0.05,
      height: 0.015,
      chamfer: 0.005,
      tag: "louvre",
    }));
  }
  // Angled louvre in the hump flank, as called out on the reference inset.
  for (const side of [-1, 1]) {
    for (let vane = 0; vane < 4; vane += 1) {
      const z = lerp(-0.5, -0.86, vane / 3);
      louvres.push(...buildTorqueBox({
        from: point(side * 0.43, 1.52 - vane * 0.012, z),
        to: point(side * 0.43, 1.36 - vane * 0.012, z - 0.14),
        width: 0.02,
        height: 0.035,
        chamfer: 0.006,
        tag: "flank-louvre",
      }));
    }
  }
  addFacets("hump-bay-louvres", "outer-shell", "metal", louvres);
}

for (const side of [-1, 1]) {
  addBox(`transom-vent-${side}`, "outer-shell", "dark-recess", point(side * 0.14, 1.3, -2.2), point(0.16, 0.15, 0.05));
  addBox(`transom-vent-frame-${side}`, "outer-shell", "metal", point(side * 0.14, 1.3, -2.188), point(0.19, 0.18, 0.03));
}

for (const side of [-1, 1]) {
  addBox(`livery-data-plate-${side}`, "outer-shell", "dark-recess", point(side * 0.3, 1.2, 1.16), point(0.02, 0.09, 0.13));
  addBox(`livery-stencil-${side}`, "outer-shell", "paint-accent", point(side * 0.42, 1.16, 0.1), point(0.02, 0.026, 0.2));
}

addBox("parachute-hatch", "outer-shell", "roof-dark", point(0, 1.696, -0.7), point(0.24, 0.026, 0.26));
addBox("parachute-release-mark", "outer-shell", "paint-accent", point(0, 1.704, -0.61), point(0.11, 0.02, 0.03));
addBox("canopy-release-mark", "outer-shell", "paint-accent", point(0.228, 1.44, 0.34), point(0.02, 0.03, 0.24));

// Cabin-to-cockpit transition: a dark coaming steps the white deck down into
// the glazing, and a rear frame arch closes the canopy against the deck.
for (const side of [-1, 1]) {
  const coaming = canopySections.map((section) => [
    point(side * (section.baseHalf + 0.026), section.baseY - 0.03, section.z),
    point(side * section.baseHalf, section.baseY + 0.012, section.z),
  ] as const);
  const facets: Facet[] = [];
  for (let index = 0; index < coaming.length - 1; index += 1) {
    const current = coaming[index];
    const next = coaming[index + 1];
    facets.push(side > 0
      ? { points: [current[0], next[0], next[1], current[1]], tag: "coaming" }
      : { points: [current[1], next[1], next[0], current[0]], tag: "coaming" });
  }
  addFacets(`canopy-coaming-${side}`, "outer-shell", "dark-recess", facets);
}
{
  const rear = canopySections[canopySections.length - 1];
  addFacets("canopy-rear-frame", "survival-frame", "roof-dark", [
    ...buildTorqueBox({ from: point(-rear.baseHalf, rear.baseY, rear.z), to: point(-rear.crownHalf, rear.crownY, rear.z - 0.03), width: 0.05, height: 0.05, chamfer: 0.014, tag: "arch" }),
    ...buildTorqueBox({ from: point(rear.baseHalf, rear.baseY, rear.z), to: point(rear.crownHalf, rear.crownY, rear.z - 0.03), width: 0.05, height: 0.05, chamfer: 0.014, tag: "arch" }),
    ...buildTorqueBox({ from: point(-rear.crownHalf, rear.crownY, rear.z - 0.03), to: point(rear.crownHalf, rear.crownY, rear.z - 0.03), width: 0.05, height: 0.05, chamfer: 0.014, tag: "arch" }),
  ]);
}

// Civil navigation set. Position lights sit on the side torque boxes at the
// widest structural line, so the craft's true span reads at night.
const NAV_EDGE_X = 2.3 + SIDE_BOX_HALF_WIDTH;
addBox("nav-light-starboard-mount", "lighting", "roof-dark", point(-NAV_EDGE_X + 0.05, FRAME_SPINE_FORWARD, 0.45), point(0.09, 0.14, 0.24));
addBox("nav-light-starboard-lens", "lighting", "foliage", point(-NAV_EDGE_X - 0.005, FRAME_SPINE_FORWARD, 0.45), point(0.035, 0.1, 0.18));
addBox("nav-light-port-mount", "lighting", "roof-dark", point(NAV_EDGE_X - 0.05, FRAME_SPINE_FORWARD, 0.45), point(0.09, 0.14, 0.24));
addBox("nav-light-port-lens", "lighting", "flower-red", point(NAV_EDGE_X + 0.005, FRAME_SPINE_FORWARD, 0.45), point(0.035, 0.1, 0.18));
addBox("nav-light-aft-mount", "lighting", "roof-dark", point(0, FRAME_SPINE_REAR + 0.02, -2.2), point(0.22, 0.11, 0.1));
addBox("nav-light-aft-lens", "lighting", "paint-light", point(0, FRAME_SPINE_REAR + 0.02, -2.31), point(0.15, 0.07, 0.035));
addEllipsoid("anti-collision-beacon-mount", "lighting", "roof-dark", point(0, 1.712, -0.92), point(0.085, 0.034, 0.085), 14, 6);
addEllipsoid("anti-collision-beacon-lens", "lighting", "flower-red", point(0, 1.75, -0.92), point(0.062, 0.046, 0.062), 14, 6);

// --- landing gear -----------------------------------------------------------

// Four legs hang from the side torque boxes, raked out so the ground footprint
// is wider than the frame and well outside the centre of mass.
const legStations = [
  { id: "starboard-fore", x: 2.22, z: 1.28, spine: FRAME_SPINE_FORWARD, rake: 1 },
  { id: "port-fore", x: -2.22, z: 1.28, spine: FRAME_SPINE_FORWARD, rake: 1 },
  { id: "starboard-aft", x: 2.3, z: -1.24, spine: FRAME_SPINE_REAR, rake: -1 },
  { id: "port-aft", x: -2.3, z: -1.24, spine: FRAME_SPINE_REAR, rake: -1 },
] as const;

// Each leg is a real assembly, and the reference lets every piece read as its
// own material: a machined trunnion bolted under the torque box, a tapered
// carbon main strut, a separate drag link, an anodised scissor at the knee, a
// polished oleo and a pivoting pad.
for (const leg of legStations) {
  const side = leg.x < 0 ? -1 : 1;
  const trunnion = point(leg.x, leg.spine - 0.15, leg.z);
  const knee = point(leg.x + side * 0.07, 0.36, leg.z + leg.rake * 0.09);
  const axle = point(leg.x + side * 0.03, 0.17, leg.z + leg.rake * 0.13);
  const pad = point(leg.x + side * 0.02, 0.055, leg.z + leg.rake * 0.14);

  addFacets(`landing-trunnion-${leg.id}`, "landing-gear", "metal", buildTorqueBox({
    from: point(leg.x, leg.spine - 0.13, leg.z - 0.14),
    to: point(leg.x, leg.spine - 0.13, leg.z + 0.14),
    width: 0.12,
    height: 0.13,
    chamfer: 0.03,
    tag: "trunnion",
  }));
  for (const bolt of [-1, 1]) {
    addCylinder(
      `landing-trunnion-bolt-${leg.id}-${bolt}`,
      "landing-gear",
      "metal",
      point(leg.x - 0.075, leg.spine - 0.13, leg.z + bolt * 0.09),
      point(leg.x + 0.075, leg.spine - 0.13, leg.z + bolt * 0.09),
      0.018,
      10,
    );
  }

  // The main strut tapers: two stacked box runs instead of one prism.
  const strutMid = point(
    lerp(trunnion[0], knee[0], 0.52),
    lerp(trunnion[1], knee[1], 0.52),
    lerp(trunnion[2], knee[2], 0.52),
  );
  addFacets(`landing-strut-${leg.id}`, "landing-gear", "timber-dark", [
    ...buildTorqueBox({ from: trunnion, to: strutMid, width: 0.095, height: 0.15, chamfer: 0.028, tag: "strut-upper" }),
    ...buildTorqueBox({ from: strutMid, to: knee, width: 0.07, height: 0.11, chamfer: 0.022, tag: "strut-lower" }),
  ]);
  addFacets(`landing-drag-link-${leg.id}`, "landing-gear", "timber-mid", buildTorqueBox({
    from: point(leg.x - side * 0.05, leg.spine - 0.15, leg.z - leg.rake * 0.34),
    to: point(knee[0] - side * 0.01, knee[1] + 0.05, knee[2] - leg.rake * 0.02),
    width: 0.05,
    height: 0.08,
    chamfer: 0.016,
    tag: "drag-link",
  }));

  // Anodised scissor across the sliding joint, the way an oleo is torque-linked.
  addFacets(`landing-scissor-${leg.id}`, "landing-gear", "paint-accent", [
    ...buildTorqueBox({
      from: point(knee[0] - side * 0.055, knee[1] - 0.02, knee[2]),
      to: point(knee[0] - side * 0.075, 0.26, axle[2]),
      width: 0.026,
      height: 0.05,
      chamfer: 0.008,
      tag: "scissor-upper",
    }),
    ...buildTorqueBox({
      from: point(knee[0] - side * 0.075, 0.26, axle[2]),
      to: point(axle[0] - side * 0.05, 0.185, axle[2]),
      width: 0.024,
      height: 0.045,
      chamfer: 0.008,
      tag: "scissor-lower",
    }),
  ]);
  addEllipsoid(`landing-knee-joint-${leg.id}`, "landing-gear", "metal", knee, point(0.06, 0.055, 0.06), 12, 7);
  addCylinder(`landing-oleo-${leg.id}`, "landing-gear", "metal", knee, axle, 0.044, 16);
  addCylinder(`landing-oleo-gland-${leg.id}`, "landing-gear", "paint-accent", point(axle[0], axle[1] + 0.05, axle[2]), point(axle[0], axle[1] + 0.028, axle[2]), 0.052, 16);

  // Pivoting pad: a shaped sole with its own bearing, not a slab on a stick.
  addCylinder(`landing-pad-pivot-${leg.id}`, "landing-gear", "metal", point(pad[0] - 0.08, 0.12, pad[2]), point(pad[0] + 0.08, 0.12, pad[2]), 0.032, 12);
  addFacets(`landing-pad-${leg.id}`, "landing-gear", "timber-dark", buildSlab({
    outline: rectangleRing(pad[0] - 0.14, pad[0] + 0.14, pad[2] - 0.12, pad[2] + 0.12),
    topAt: () => 0.1,
    bottomAt: () => 0.03,
    chamfer: 0.025,
  }));
  addBox(`landing-pad-sole-${leg.id}`, "landing-gear", "dark-recess", point(pad[0], 0.022, pad[2]), point(0.24, 0.02, 0.2));
}

// --- lower contours ---------------------------------------------------------

// The reference underside is not open air: the side boxes carry a stepped lower
// rail, and a floor pan closes the bay between the keel boxes.
for (const side of [-1, 1]) {
  const facets: Facet[] = [];
  for (let index = 0; index < sideBoxChain.length - 1; index += 1) {
    const from = sideBoxChain[index];
    const to = sideBoxChain[index + 1];
    facets.push(...buildTorqueBox({
      from: point(side * (from.x - 0.03), from.y - 0.17, from.z),
      to: point(side * (to.x - 0.03), to.y - 0.17, to.z),
      width: 0.12,
      height: 0.09,
      chamfer: 0.026,
      tag: "lower-rail",
    }));
  }
  addFacets(`side-lower-rail-${side}`, "primary-frame", "timber-dark", facets);
}

// ---------------------------------------------------------------------------
// Envelope reconstructed from the finished parts, never from authored nominals.
// ---------------------------------------------------------------------------

function partExtent(part: ObjectLabPart): { min: ObjectPoint; max: ObjectPoint } {
  if (part.kind === "box") {
    const reach = Math.max(part.size[0], part.size[1], part.size[2]) / 2;
    const spread = part.rotation
      ? [reach, reach, reach]
      : [part.size[0] / 2, part.size[1] / 2, part.size[2] / 2];
    return {
      min: point(part.center[0] - spread[0], part.center[1] - spread[1], part.center[2] - spread[2]),
      max: point(part.center[0] + spread[0], part.center[1] + spread[1], part.center[2] + spread[2]),
    };
  }
  if (part.kind === "mesh") {
    const axis = [0, 1, 2] as const;
    return {
      min: axis.map((index) => Math.min(...part.vertices.map((vertex) => vertex[index]))) as unknown as ObjectPoint,
      max: axis.map((index) => Math.max(...part.vertices.map((vertex) => vertex[index]))) as unknown as ObjectPoint,
    };
  }
  const reach = part.kind === "cylinder" ? part.radius : Math.max(part.width, part.depth) / 2;
  const axis = [0, 1, 2] as const;
  return {
    min: axis.map((index) => Math.min(part.from[index], part.to[index]) - reach) as unknown as ObjectPoint,
    max: axis.map((index) => Math.max(part.from[index], part.to[index]) + reach) as unknown as ObjectPoint,
  };
}

const envelope = parts.reduce(
  (bounds, part) => {
    const extent = partExtent(part);
    return {
      min: [0, 1, 2].map((axis) => Math.min(bounds.min[axis], extent.min[axis])) as unknown as ObjectPoint,
      max: [0, 1, 2].map((axis) => Math.max(bounds.max[axis], extent.max[axis])) as unknown as ObjectPoint,
    };
  },
  {
    min: point(Infinity, Infinity, Infinity),
    max: point(-Infinity, -Infinity, -Infinity),
  },
);

const round = (value: number) => Math.round(value * 1000) / 1000;

export const SR6_WIDTH = round(envelope.max[0] - envelope.min[0]);
export const SR6_HEIGHT = round(envelope.max[1] - envelope.min[1]);
export const SR6_LENGTH = round(envelope.max[2] - envelope.min[2]);
export const SR6_CABIN_SECTIONS = cabinSections;
export const SR6_NACELLE_CLEARANCE = round(
  Math.hypot(frontStation.x - midStation.x, frontStation.z - midStation.z)
  - frontStation.radius - midStation.radius,
);
export const SR6_MID_TO_REAR_CLEARANCE = round(
  Math.hypot(midStation.x - rearStation.x, midStation.z - rearStation.z)
  - midStation.radius - rearStation.radius,
);

export const sr6SkatObject: Sr6LabModel = {
  id: "sr6-skat-m9-space-frame",
  revision: "sr6-m9-2026-08-04",
  title: "SR-6 Skat — box space frame, faceted survival cell",
  units: "metres",
  coordinates: { up: "+Y", front: "+Z", origin: "ground-centre" },
  sourceNotes: [
    "The 4+2 rotor topology is unchanged: four forward lift units and two higher-capacity rear units, which is what the flight model is built on.",
    "M8 rebuilds the airframe as the reference's open box space frame: two side torque boxes with cooling ribs, transverse frames with lightening windows, short webs in every nacelle gap and a separate set of roots into the cockpit core.",
    "Nacelles are separate rings that clear each other; the previous pass merged the forward pair into one opening, which no ducted-fan airframe does.",
    "M9 replaces the smooth lofted body with a faceted survival cell built on four control lines — deck edge, shoulder crease, chine and keel — and deletes the invented raised tail spine, which the reference does not have.",
    "Forward fan diameter follows from the nacelle spacing rather than the other way round; the rear/front disc ratio stays at the 1.337 the mixer assumes.",
    "Human scale is bracketed by Jetson ONE; certified urban-VTOL scale is bracketed by EH216-S and VoloCity.",
    "The survival cell, emergency egress, isolated battery keel and one-motor-out landing intent follow current FAA powered-lift safety objectives.",
  ],
  dimensions: {
    overallLength: SR6_LENGTH,
    overallWidth: SR6_WIDTH,
    overallHeight: SR6_HEIGHT,
    frontRotorDiameter: SR6_FRONT_ROTOR_DIAMETER,
    rearRotorDiameter: SR6_REAR_ROTOR_DIAMETER,
    frontNacelleOuterDiameter: round(frontStation.radius * 2),
    rearNacelleOuterDiameter: round(rearStation.radius * 2),
    frontToMidNacelleClearance: SR6_NACELLE_CLEARANCE,
    midToRearNacelleClearance: SR6_MID_TO_REAR_CLEARANCE,
    frontRotorPlaneHeight: 0.88,
    middleRotorPlaneHeight: 0.9,
    rearRotorPlaneHeight: 1.06,
    forwardRotorStationZ: 1.75,
    middleRotorStationZ: 0.45,
    rearRotorStationZ: -1.65,
    nominalRearToFrontRotorThrustRatio: round((SR6_REAR_ROTOR_DIAMETER / SR6_FRONT_ROTOR_DIAMETER) ** 2),
    frameDeckForward: FRAME_DECK_FORWARD,
    frameDeckRear: FRAME_DECK_REAR,
    nacelleDepth: NACELLE_DEPTH,
    fixedFootprintLength: SR6_LENGTH,
    fixedFootprintWidth: SR6_WIDTH,
    operatingEnvelopeLength: SR6_LENGTH,
    operatingEnvelopeWidth: SR6_WIDTH,
  },
  labMetrics: [
    { label: "LENGTH", value: SR6_LENGTH, decimals: 2, signed: false },
    { label: "WIDTH", value: SR6_WIDTH, decimals: 2, signed: false },
    { label: "HEIGHT", value: SR6_HEIGHT, decimals: 2, signed: false },
    { label: "FRONT ROTOR", value: SR6_FRONT_ROTOR_DIAMETER, decimals: 2, signed: false },
    { label: "REAR ROTOR", value: SR6_REAR_ROTOR_DIAMETER, decimals: 2, signed: false },
  ],
  anchors: {
    groundCentre: point(0, 0, 0),
    centreOfMassEstimate: point(0, 0.78, 0),
    pilotEye: point(0, 1.52, 0.34),
    batteryCentre: point(0, 0.56, 0.05),
    canopyRelease: point(0.24, 1.32, 0.86),
    forwardPairCentre: point(0, 0.88, 1.75),
    middlePairCentre: point(0, 0.9, 0.45),
    rearPairCentre: point(0, 1.06, -1.65),
  },
  motionConstraints: {
    rotorCount: 6,
    forwardRotorCount: 4,
    rearRotorCount: 2,
    rearPowerClass: "1.34x front nominal thrust",
    rearRotorStepUp: 0.18,
    structuralLoop: "side torque boxes / transverse windowed frames / nacelle-gap webs / independent cockpit-core roots",
    rotorAxesFixedToBody: true,
    translationByBodyTilt: true,
    canopyOpensOnlyWhenRotorsStopped: true,
    landingGearFixed: true,
    conventionalWing: false,
  },
  labEnvironment: { floorRadius: 8, gridSize: 8, gridDivisions: 16, fogNear: 16, fogFar: 23, floorY: 0 },
  materialOverrides: {
    // Five fields, one bright line, one accent. The fields are large and calm;
    // the bright line is reserved for the top edges of primary structure, which
    // is what draws the silhouette; orange is reserved for functional marks and
    // never used as a shape.
    "paint-light": { color: 0xd6d1c4, roughness: 0.56, metalness: 0.02 },
    "roof-dark": { color: 0x262b2e, roughness: 0.62, metalness: 0.08 },
    "timber-dark": { color: 0x1b2022, roughness: 0.58, metalness: 0.12 },
    "timber-mid": { color: 0x4d5456, roughness: 0.44, metalness: 0.55 },
    metal: { color: 0xb6bec0, roughness: 0.26, metalness: 0.86 },
    canvas: { color: 0x14181a, roughness: 0.46, metalness: 0.18 },
    "paint-accent": { color: 0xd85f22, roughness: 0.48, metalness: 0.06 },
    glazing: { color: 0x18262f, roughness: 0.16, metalness: 0.04, transparent: true, opacity: 0.68 },
    "dark-recess": { color: 0x0b0e10, roughness: 0.94, metalness: 0 },
    "flower-red": { color: 0xff5b4f, roughness: 0.28, metalness: 0.02 },
    foliage: { color: 0x62e58f, roughness: 0.28, metalness: 0.02 },
  },
  parts,
  views: [
    { id: "front", label: "Front +Z", projection: "orthographic", position: point(0, 1.1, 12), target: point(0, 0.92, 0), orthoHeight: 5.6 },
    { id: "left", label: "Left profile", projection: "orthographic", position: point(-12, 1.05, 0), target: point(0, 0.92, 0), orthoHeight: 6.2 },
    { id: "right", label: "Right profile — reference orientation", projection: "orthographic", position: point(12, 1.05, 0), target: point(0, 0.92, 0), orthoHeight: 6.2 },
    { id: "rear", label: "Rear -Z", projection: "orthographic", position: point(0, 1.1, -12), target: point(0, 0.92, 0), orthoHeight: 5.6 },
    { id: "top", label: "Top plan — space frame", projection: "orthographic", position: point(0, 13, 0), target: point(0, 0.8, 0), up: point(0, 0, 1), orthoHeight: 6.0 },
    { id: "three-quarter-left", label: "3/4 front-left", projection: "perspective", position: point(-6.9, 4.4, 7.4), target: point(0, 0.82, 0), fov: 34 },
    { id: "three-quarter-right", label: "3/4 rear-right", projection: "perspective", position: point(7, 3.8, -7.3), target: point(0, 0.82, 0), fov: 34 },
    { id: "high-three-quarter", label: "High 3/4 topology", projection: "perspective", position: point(-6.6, 8.2, 7.3), target: point(0, 0.75, 0), fov: 34 },
    { id: "underside", label: "Low 3/4 underside", projection: "perspective", position: point(6.4, 2.1, 7.2), target: point(0, 0.58, 0), fov: 36 },
    { id: "rotor-joint", label: "Frame web / nacelle rim / cell shoulder", projection: "perspective", position: point(-4.2, 2.65, 3.25), target: point(-0.78, 0.94, 0.62), fov: 24, hiddenGroups: ["outer-shell", "canopy"] },
    { id: "structural-cutaway", label: "Structural cutaway", projection: "perspective", position: point(-5.4, 3.4, 5.8), target: point(0, 0.92, 0), fov: 31, hiddenGroups: ["outer-shell", "canopy"] },
    { id: "silhouette", label: "Silhouette control — space frame", projection: "orthographic", position: point(0, 13, 0), target: point(0, 0.8, 0), up: point(0, 0, 1), orthoHeight: 5.6 },
  ],
};
