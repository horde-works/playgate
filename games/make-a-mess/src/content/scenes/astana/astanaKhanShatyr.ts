// SPDX-License-Identifier: CC-BY-NC-ND-4.0
// SPDX-FileCopyrightText: 2026 Igor Kirisiuk
//
// Khan Shatyr is authored as a tensile system, not as a cone-shaped prop.
// The single source of truth is the node graph below: a three-chord tripod
// converges at one hub; twelve pin-ended struts reach one articulated ring;
// every radial and hoop cable references the same anticlastic surface nodes.
// The island samples one of every six real radial cable pairs, while retaining
// all sixteen real circumferential cables and the staggered ETFE cushion logic.

import type { SceneVector3 } from "../../../game/destructionScene.ts";
import type { MutableGroup } from "./astanaAuthoring.ts";
import { groundSeatBox, orient, primitive } from "./astanaAuthoring.ts";
import {
  KHAN_SHATYR_CENTRE as SITE_CENTRE,
  KHAN_SHATYR_YAW as SITE_YAW,
} from "./astanaLayout.ts";
import { groundUnder } from "./astanaShell.ts";

// One scale governs every published dimension. The earlier version mixed a
// 56 m vertical scale with a 37 m footprint; that made a straight, steep prop
// where the real structure has a low, deeply hollow cable surface.
export const KHAN_SHATYR_SCALE = 38 / 150;
export const KHAN_SHATYR_CENTRE = SITE_CENTRE;
export const KHAN_SHATYR_YAW = SITE_YAW;
export const KHAN_SHATYR_HEIGHT = 150 * KHAN_SHATYR_SCALE;
export const KHAN_SHATYR_CONCRETE_BASE_SEMI_AXES = [
  100 * KHAN_SHATYR_SCALE,
  97.5 * KHAN_SHATYR_SCALE,
] as const;
export const KHAN_SHATYR_CABLE_BASE_SEMI_AXES = [
  71.5 * KHAN_SHATYR_SCALE,
  57.5 * KHAN_SHATYR_SCALE,
] as const;
// Compatibility name: this is explicitly the cable-anchor ellipse, not the
// full 200 x 195 m concrete base.
export const KHAN_SHATYR_BASE_SEMI_AXES = KHAN_SHATYR_CABLE_BASE_SEMI_AXES;
export const KHAN_SHATYR_ANCHOR_HEIGHT = 20 * KHAN_SHATYR_SCALE;
export const KHAN_SHATYR_RING_HEIGHT = 90 * KHAN_SHATYR_SCALE;
export const KHAN_SHATYR_RING_OFFSET = 42.9 * KHAN_SHATYR_SCALE;
export const KHAN_SHATYR_RING_RADIUS = 10 * KHAN_SHATYR_SCALE;
export const KHAN_SHATYR_MAST_LEAN_DEGREES = 12;
const MAST_LEAN = KHAN_SHATYR_MAST_LEAN_DEGREES * Math.PI / 180;
const HUB_HEIGHT = 60 * KHAN_SHATYR_SCALE;
const HUB_PLATE_HEIGHT = 7 * KHAN_SHATYR_SCALE;
export const KHAN_SHATYR_HUB_OFFSET = -KHAN_SHATYR_RING_OFFSET
  - Math.tan(MAST_LEAN) * (HUB_HEIGHT - KHAN_SHATYR_RING_HEIGHT);
export const KHAN_SHATYR_TRIPOD_LEGS = 3;
export const KHAN_SHATYR_TRIPOD_CHORDS = 3;
export const KHAN_SHATYR_TOP_STRUTS = 12;
export const KHAN_SHATYR_REAL_RADIAL_CABLES = 192;
export const KHAN_SHATYR_RADIAL_SAMPLE_RATIO = 6;
export const KHAN_SHATYR_RADIALS =
  KHAN_SHATYR_REAL_RADIAL_CABLES / KHAN_SHATYR_RADIAL_SAMPLE_RATIO;
export const KHAN_SHATYR_HOOPS = 16;
// Seven dark louvre/ring levels are visible in the published frontal view
// between the cable ring and the start of the bare spire.
export const KHAN_SHATYR_COLLAR_RINGS = 7;
export const KHAN_SHATYR_MEMBRANE_COLUMNS = 64;
// At island scale every third of the 192 real radial lines remains visible.
// This is also the seam rhythm of the 64 ETFE strips; the load-bearing
// topology below keeps the coarser one-in-six structural sample.
export const KHAN_SHATYR_STRING_COLUMNS = KHAN_SHATYR_MEMBRANE_COLUMNS;
export const KHAN_SHATYR_MEMBRANE_FACETS = 2;
export const KHAN_SHATYR_CUSHION_MAX_LENGTH = 30 * KHAN_SHATYR_SCALE;
export const KHAN_SHATYR_ATRIUM_LIGHTS = 4;
export const KHAN_SHATYR_NECK_LIGHTS = 6;
export const KHAN_SHATYR_LIGHTS =
  KHAN_SHATYR_ATRIUM_LIGHTS + KHAN_SHATYR_NECK_LIGHTS;
export const KHAN_SHATYR_ATRIUM_LIGHT_COLOR = "#ffd5ad";
export const KHAN_SHATYR_NECK_LIGHT_COLOR = "#ffb56d";
export const KHAN_SHATYR_LIGHT_GROUP = "astana:khan-shatyr:interior-lighting";

const BASKET_HEIGHT = 105 * KHAN_SHATYR_SCALE;
const MEMBRANE_THICKNESS = 0.028;

const ETFE_BRIGHT = "#eaf0f7";
const ETFE_COOL = "#e5edf6";
const ETFE_SHADE = "#e1eaf4";
// The visible cable drawing is deliberately darker than the milky membrane:
// at island scale it reads as the cold shadow cast by the real inflated ETFE
// cushion seams, whose convexity is too shallow to model as separate solids.
export const KHAN_SHATYR_STRING_COLOR = "#98a4aa";
const MAST_WHITE = "#f1f3f2";
const MAST_SHADE = "#bfc6c8";
const COLLAR_DARK = "#3c4546";
const PORTAL_DARK = "#313a3d";
const STONE = "#5a5d5e";
const STONE_LIGHT = "#a6a6a1";
const BERM_GREEN = "#5d7a4a";

type KhanCableNodeRef = readonly [band: number, radial: number];

export interface KhanCableNode {
  readonly ref: KhanCableNodeRef;
  readonly theta: number;
  readonly t: number;
  readonly position: SceneVector3;
}

export interface KhanCableEdge {
  readonly id: string;
  readonly kind: "radial" | "hoop";
  readonly from: KhanCableNodeRef;
  readonly to: KhanCableNodeRef;
}

export interface KhanCableTopology {
  readonly nodes: readonly (readonly KhanCableNode[])[];
  readonly edges: readonly KhanCableEdge[];
  readonly bandParameters: readonly number[];
}

export interface KhanTripodLegTopology {
  readonly index: number;
  readonly baseCentre: SceneVector3;
  readonly hub: SceneVector3;
  readonly sections: readonly (readonly SceneVector3[])[];
}

export interface KhanTripodTopology {
  readonly hub: SceneVector3;
  readonly legs: readonly KhanTripodLegTopology[];
  readonly strutOrigins: readonly SceneVector3[];
  readonly topRing: readonly SceneVector3[];
  readonly struts: readonly {
    readonly from: SceneVector3;
    readonly to: SceneVector3;
  }[];
}

const add = (a: SceneVector3, b: SceneVector3): SceneVector3 =>
  [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const subtract = (a: SceneVector3, b: SceneVector3): SceneVector3 =>
  [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: SceneVector3, amount: number): SceneVector3 =>
  [a[0] * amount, a[1] * amount, a[2] * amount];
const midpoint = (a: SceneVector3, b: SceneVector3): SceneVector3 =>
  scale(add(a, b), 0.5);
const lengthOf = (a: SceneVector3): number => Math.hypot(a[0], a[1], a[2]);
const normalize = (a: SceneVector3): SceneVector3 => {
  const length = lengthOf(a) || 1;
  return scale(a, 1 / length);
};
const cross = (a: SceneVector3, b: SceneVector3): SceneVector3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const mix = (a: SceneVector3, b: SceneVector3, t: number): SceneVector3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

const cubicBezier = (
  a: SceneVector3,
  b: SceneVector3,
  c: SceneVector3,
  d: SceneVector3,
  t: number,
): SceneVector3 => {
  const q = 1 - t;
  return [0, 1, 2].map((dimension) =>
    q * q * q * a[dimension]
      + 3 * q * q * t * b[dimension]
      + 3 * q * t * t * c[dimension]
      + t * t * t * d[dimension]) as SceneVector3;
};

const mastAxis: SceneVector3 = [-Math.sin(MAST_LEAN), Math.cos(MAST_LEAN), 0];
const mastCrossAxis: SceneVector3 = [Math.cos(MAST_LEAN), Math.sin(MAST_LEAN), 0];
const mastOffsetAt = (height: number): number =>
  -KHAN_SHATYR_RING_OFFSET
    - Math.tan(MAST_LEAN) * (height - KHAN_SHATYR_RING_HEIGHT);

function mastRingPoint(height: number, radius: number, theta: number): SceneVector3 {
  const centre: SceneVector3 = [mastOffsetAt(height), height, 0];
  return add(centre, add(
    scale(mastCrossAxis, Math.cos(theta) * radius),
    [0, 0, Math.sin(theta) * radius],
  ));
}

function ringPoint(theta: number): SceneVector3 {
  return mastRingPoint(KHAN_SHATYR_RING_HEIGHT, KHAN_SHATYR_RING_RADIUS, theta);
}

function perimeterPoint(theta: number): SceneVector3 {
  return [
    Math.cos(theta) * KHAN_SHATYR_BASE_SEMI_AXES[0],
    KHAN_SHATYR_ANCHOR_HEIGHT,
    Math.sin(theta) * KHAN_SHATYR_BASE_SEMI_AXES[1],
  ];
}

/**
 * One canonical radial cable from the inclined ring to the concrete anchor.
 * Its two controls are calibrated from Foster's published long section: the
 * ring tangent is nearly vertical and the anchor tangent nearly horizontal.
 * Membrane, hoops and rendered radial pieces all sample this exact curve.
 */
export function khanShatyrSurfacePoint(theta: number, t: number): SceneVector3 {
  const clamped = Math.max(0, Math.min(1, t));
  const ring = ringPoint(theta);
  const anchor = perimeterPoint(theta);
  const height = ring[1] - anchor[1];
  const first = mix(ring, anchor, 0.10);
  first[1] = anchor[1] + height * 0.66;
  const second = mix(ring, anchor, 0.60);
  second[1] = anchor[1] + height * 0.01;
  return cubicBezier(ring, first, second, anchor, clamped);
}

function arcTable(theta: number, subdivisions = 192): {
  readonly parameters: readonly number[];
  readonly lengths: readonly number[];
  readonly total: number;
} {
  const parameters = Array.from({ length: subdivisions + 1 }, (_, index) =>
    index / subdivisions);
  const lengths = [0];
  let previous = khanShatyrSurfacePoint(theta, 0);
  for (let index = 1; index <= subdivisions; index += 1) {
    const point = khanShatyrSurfacePoint(theta, parameters[index]);
    lengths.push(lengths.at(-1)! + lengthOf(subtract(point, previous)));
    previous = point;
  }
  return { parameters, lengths, total: lengths.at(-1)! };
}

export function khanShatyrArcParameter(theta: number, fraction: number): number {
  const clamped = Math.max(0, Math.min(1, fraction));
  if (clamped === 0 || clamped === 1) return clamped;
  const table = arcTable(theta);
  const target = table.total * clamped;
  let low = 0;
  let high = table.lengths.length - 1;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (table.lengths[middle] < target) low = middle;
    else high = middle;
  }
  const interval = table.lengths[high] - table.lengths[low] || 1;
  const local = (target - table.lengths[low]) / interval;
  return table.parameters[low]
    + (table.parameters[high] - table.parameters[low]) * local;
}

export function createKhanCableTopology(): KhanCableTopology {
  // 0 = articulated top ring, 1..16 = real hoop cables, 17 = concrete
  // anchor. Every radial finds its OWN Bezier parameter at the requested
  // arc-length fraction; one global easing cannot describe unequal spans.
  const arcFractions = Array.from(
    { length: KHAN_SHATYR_HOOPS + 2 },
    (_, band) => band / (KHAN_SHATYR_HOOPS + 1),
  );
  const bandParameters = arcFractions.map((fraction) =>
    khanShatyrArcParameter(0, fraction));
  const nodes = arcFractions.map((fraction, band) =>
    Array.from({ length: KHAN_SHATYR_RADIALS }, (_, radial) => {
      const theta = radial / KHAN_SHATYR_RADIALS * Math.PI * 2;
      const t = khanShatyrArcParameter(theta, fraction);
      return {
        ref: [band, radial] as const,
        theta,
        t,
        position: khanShatyrSurfacePoint(theta, t),
      };
    }),
  );
  const edges: KhanCableEdge[] = [];
  for (let radial = 0; radial < KHAN_SHATYR_RADIALS; radial += 1) {
    for (let band = 0; band < nodes.length - 1; band += 1) {
      edges.push({
        id: `radial:${radial}:${band}`,
        kind: "radial",
        from: [band, radial],
        to: [band + 1, radial],
      });
    }
  }
  for (let band = 1; band <= KHAN_SHATYR_HOOPS; band += 1) {
    for (let radial = 0; radial < KHAN_SHATYR_RADIALS; radial += 1) {
      edges.push({
        id: `hoop:${band}:${radial}`,
        kind: "hoop",
        from: [band, radial],
        to: [band, (radial + 1) % KHAN_SHATYR_RADIALS],
      });
    }
  }
  return { nodes, edges, bandParameters };
}

function tripodSection(
  centre: SceneVector3,
  axis: SceneVector3,
  radius: number,
  phase: number,
): readonly SceneVector3[] {
  const helper: SceneVector3 = Math.abs(axis[1]) > 0.92 ? [1, 0, 0] : [0, 1, 0];
  const u = normalize(cross(axis, helper));
  const v = normalize(cross(axis, u));
  return Array.from({ length: KHAN_SHATYR_TRIPOD_CHORDS }, (_, chord) => {
    const theta = phase + chord / KHAN_SHATYR_TRIPOD_CHORDS * Math.PI * 2;
    return add(centre, add(scale(u, Math.cos(theta) * radius), scale(v, Math.sin(theta) * radius)));
  });
}

export function createKhanTripodTopology(): KhanTripodTopology {
  // Front is +X, towards Baiterek and the boulevard. The peak leans in -X,
  // away from that axis. The published back leg is 60 m vertical; the two
  // front legs are equal 70 m members. Their plan spread is derived from
  // those lengths rather than tuned by eye.
  const hub: SceneVector3 = [KHAN_SHATYR_HUB_OFFSET, HUB_HEIGHT, 0];
  const frontLength = 70 * KHAN_SHATYR_SCALE;
  const frontPlanSpread = Math.sqrt(frontLength * frontLength - HUB_HEIGHT * HUB_HEIGHT);
  const frontX = frontPlanSpread * 0.82;
  const frontZ = Math.sqrt(frontPlanSpread * frontPlanSpread - frontX * frontX);
  const bases: readonly SceneVector3[] = [
    [KHAN_SHATYR_HUB_OFFSET + frontX, 0, -frontZ],
    [KHAN_SHATYR_HUB_OFFSET + frontX, 0, frontZ],
    [KHAN_SHATYR_HUB_OFFSET, 0, 0],
  ];
  const sectionT = [0, 0.24, 0.48, 0.72, 0.93] as const;
  const legs = bases.map((baseCentre, index) => {
    const axis = normalize(subtract(hub, baseCentre));
    const sections = sectionT.map((t) => tripodSection(
      mix(baseCentre, hub, t),
      axis,
      0.46 + (0.18 - 0.46) * t,
      index * Math.PI / 3,
    ));
    return { index, baseCentre, hub, sections };
  });
  const topRing = Array.from({ length: KHAN_SHATYR_TOP_STRUTS }, (_, strut) =>
    ringPoint(strut / KHAN_SHATYR_TOP_STRUTS * Math.PI * 2));
  const strutOrigins = Array.from({ length: KHAN_SHATYR_TOP_STRUTS }, (_, strut) =>
    mastRingPoint(
      HUB_HEIGHT + HUB_PLATE_HEIGHT / 2,
      0.72,
      strut / KHAN_SHATYR_TOP_STRUTS * Math.PI * 2,
    ));
  const struts = topRing.map((to, index) => ({ from: strutOrigins[index], to }));
  return { hub, legs, strutOrigins, topRing, struts };
}

export function khanShatyrLocalDirectionToWorld(
  vector: SceneVector3,
): SceneVector3 {
  const cosine = Math.cos(KHAN_SHATYR_YAW);
  const sine = Math.sin(KHAN_SHATYR_YAW);
  return [
    cosine * vector[0] - sine * vector[2],
    vector[1],
    sine * vector[0] + cosine * vector[2],
  ];
}

export function khanShatyrLocalToWorld(
  point: SceneVector3,
  base: number,
): SceneVector3 {
  const rotated = khanShatyrLocalDirectionToWorld(point);
  return [
    KHAN_SHATYR_CENTRE[0] + rotated[0],
    base + rotated[1],
    KHAN_SHATYR_CENTRE[1] + rotated[2],
  ];
}

const localToWorld = khanShatyrLocalToWorld;

function addMember(
  target: MutableGroup,
  id: string,
  from: SceneVector3,
  to: SceneVector3,
  diameter: number,
  colour: string,
  material: "steel" | "concrete" = "steel",
): void {
  const chord = subtract(to, from);
  const length = lengthOf(chord);
  if (length < 0.015) return;
  const axis = normalize(chord);
  const helper: SceneVector3 = Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const transverse = normalize(cross(helper, axis));
  primitive(target, id, material, "cylinder", midpoint(from, to),
    [diameter, length, diameter], colour,
    {
      rotation: orient(transverse, axis),
      textureProfile: material === "steel" ? "painted-steel" : undefined,
      bearingArea: Math.max(0.08, diameter * diameter * 2),
      volume: Math.max(0.004, length * diameter * diameter * 0.5),
      carriesAttachments: true,
      attachmentSupportMode: "cable",
      sideAttachmentReach: Math.max(0.28, diameter * 2.5),
    });
}

function addTripod(
  structure: MutableGroup,
  topology: KhanTripodTopology,
  base: number,
): void {
  for (const leg of topology.legs) {
    const worldSections = leg.sections.map((section) =>
      section.map((point) => localToWorld(point, base)));
    for (let section = 0; section < worldSections.length; section += 1) {
      const ring = worldSections[section];
      for (let chord = 0; chord < KHAN_SHATYR_TRIPOD_CHORDS; chord += 1) {
        addMember(structure, `khan:tripod:${leg.index}:section:${section}:${chord}`,
          ring[chord], ring[(chord + 1) % KHAN_SHATYR_TRIPOD_CHORDS],
          0.20, MAST_SHADE);
      }
      if (section === worldSections.length - 1) continue;
      const next = worldSections[section + 1];
      for (let chord = 0; chord < KHAN_SHATYR_TRIPOD_CHORDS; chord += 1) {
        addMember(structure, `khan:tripod:${leg.index}:chord:${section}:${chord}`,
          ring[chord], next[chord], 0.34, MAST_WHITE);
        addMember(structure, `khan:tripod:${leg.index}:brace:${section}:${chord}`,
          ring[chord], next[(chord + 1) % KHAN_SHATYR_TRIPOD_CHORDS],
          0.12, MAST_SHADE);
      }
    }
    // All three terminal chords refer to exactly the same hub object.
    const last = worldSections.at(-1)!;
    const hub = localToWorld(topology.hub, base);
    for (let chord = 0; chord < KHAN_SHATYR_TRIPOD_CHORDS; chord += 1) {
      addMember(structure, `khan:tripod:${leg.index}:hub-chord:${chord}`,
        last[chord], hub, 0.34, MAST_WHITE);
    }
  }

  const hub = localToWorld(topology.hub, base);
  primitive(structure, "khan:hub", "steel", "cylinder", hub,
    [1.42, HUB_PLATE_HEIGHT, 1.42], COLLAR_DARK,
    {
      rotation: orient(
        khanShatyrLocalDirectionToWorld(mastCrossAxis),
        khanShatyrLocalDirectionToWorld(mastAxis),
      ),
      textureProfile: "painted-steel",
      bearingArea: 1.2,
      volume: 2.4,
      sideAttachmentReach: 2.3,
      carriesAttachments: true,
      attachmentSupportMode: "cable",
    });

  for (let strut = 0; strut < topology.struts.length; strut += 1) {
    const definition = topology.struts[strut];
    addMember(structure, `khan:top-strut:${strut}`,
      localToWorld(definition.from, base), localToWorld(definition.to, base),
      0.30, MAST_WHITE);
  }
  for (let node = 0; node < topology.topRing.length; node += 1) {
    addMember(structure, `khan:top-ring:${node}`,
      localToWorld(topology.topRing[node], base),
      localToWorld(topology.topRing[(node + 1) % topology.topRing.length], base),
      0.34, MAST_WHITE);
  }

  const upperRing = Array.from({ length: KHAN_SHATYR_TOP_STRUTS }, (_, rib) => {
    const theta = rib / KHAN_SHATYR_TOP_STRUTS * Math.PI * 2;
    return mastRingPoint(BASKET_HEIGHT, 1.58, theta);
  });
  for (let rib = 0; rib < KHAN_SHATYR_TOP_STRUTS; rib += 1) {
    addMember(structure, `khan:basket:rib:${rib}`,
      localToWorld(topology.topRing[rib], base), localToWorld(upperRing[rib], base),
      0.17, MAST_WHITE);
    addMember(structure, `khan:basket:diagonal:${rib}`,
      localToWorld(topology.topRing[rib], base),
      localToWorld(upperRing[(rib + 1) % upperRing.length], base),
      0.09, MAST_SHADE);
    addMember(structure, `khan:basket:ring:${rib}`,
      localToWorld(upperRing[rib], base),
      localToWorld(upperRing[(rib + 1) % upperRing.length], base),
      0.18, MAST_WHITE);
  }
  // The head is not an open conical cage. Seven closed horizontal rings bind
  // the twelve ribs into the dark, tapered louvred collar seen above the
  // membrane. Every segment shares the same mast-normal plane at its level.
  for (let level = 0; level < KHAN_SHATYR_COLLAR_RINGS; level += 1) {
    const fraction = level / (KHAN_SHATYR_COLLAR_RINGS - 1);
    const height = KHAN_SHATYR_RING_HEIGHT
      + (BASKET_HEIGHT - KHAN_SHATYR_RING_HEIGHT) * fraction;
    const radius = KHAN_SHATYR_RING_RADIUS
      + (1.58 - KHAN_SHATYR_RING_RADIUS) * fraction;
    const ring = Array.from({ length: KHAN_SHATYR_TOP_STRUTS }, (_, node) =>
      mastRingPoint(
        height,
        radius,
        node / KHAN_SHATYR_TOP_STRUTS * Math.PI * 2,
      ));
    for (let node = 0; node < ring.length; node += 1) {
      addMember(structure, `khan:collar:ring:${level}:${node}`,
        localToWorld(ring[node], base),
        localToWorld(ring[(node + 1) % ring.length], base),
        0.19, COLLAR_DARK);
    }
  }
  const mastBottom: SceneVector3 = [KHAN_SHATYR_HUB_OFFSET, HUB_HEIGHT, 0];
  const mastTop: SceneVector3 = [mastOffsetAt(KHAN_SHATYR_HEIGHT), KHAN_SHATYR_HEIGHT, 0];
  addMember(structure, "khan:mast-and-spire",
    localToWorld(mastBottom, base), localToWorld(mastTop, base),
    0.26, MAST_WHITE);
}

function addCableNet(
  cables: MutableGroup,
  topology: KhanCableTopology,
  base: number,
): void {
  const bands = KHAN_SHATYR_HOOPS + 1;

  // The 32 sampled primary radials are structural cables. Their endpoints
  // are nevertheless taken from the same visible-string node function as
  // every secondary string, so the whole drawing shares exact crossings.
  for (let radial = 0; radial < KHAN_SHATYR_RADIALS; radial += 1) {
    const theta = radial / KHAN_SHATYR_RADIALS * Math.PI * 2;
    for (let band = 0; band < bands; band += 1) {
      addMember(cables, `khan:cable:radial:${radial}:${band}`,
        localToWorld(khanShatyrStringPoint(theta, band / bands), base),
        localToWorld(khanShatyrStringPoint(theta, (band + 1) / bands), base),
        0.034, KHAN_SHATYR_STRING_COLOR);
    }
  }

  // Half-step infill supplies the panel-scale string rhythm without changing
  // the canonical 32-line structural abstraction. Together both sets form
  // 64 continuous meridians — one exact boundary for every ETFE strip.
  for (let column = 1; column < KHAN_SHATYR_STRING_COLUMNS; column += 2) {
    const theta = column / KHAN_SHATYR_STRING_COLUMNS * Math.PI * 2;
    for (let band = 0; band < bands; band += 1) {
      addMember(cables, `khan:string:radial:${column}:${band}`,
        localToWorld(khanShatyrStringPoint(theta, band / bands), base),
        localToWorld(khanShatyrStringPoint(theta, (band + 1) / bands), base),
        0.026, KHAN_SHATYR_STRING_COLOR);
    }
  }

  // Sixteen real hoops, each resolved at all 64 meridians. A hoop node and a
  // radial node call the same function with the same theta/fraction pair;
  // therefore they intersect mathematically instead of merely looking close.
  for (let hoop = 1; hoop <= KHAN_SHATYR_HOOPS; hoop += 1) {
    const fraction = hoop / bands;
    for (let column = 0; column < KHAN_SHATYR_STRING_COLUMNS; column += 1) {
      const theta0 = column / KHAN_SHATYR_STRING_COLUMNS * Math.PI * 2;
      const theta1 = (column + 1) / KHAN_SHATYR_STRING_COLUMNS * Math.PI * 2;
      addMember(cables, `khan:cable:hoop:${hoop}:${column}`,
        localToWorld(khanShatyrStringPoint(theta0, fraction), base),
        localToWorld(khanShatyrStringPoint(theta1, fraction), base),
        0.028, KHAN_SHATYR_STRING_COLOR);
    }
  }
}

export function khanShatyrSurfaceNormal(theta: number, t: number): SceneVector3 {
  const epsilon = 0.001;
  const around = subtract(
    khanShatyrSurfacePoint(theta + epsilon, t),
    khanShatyrSurfacePoint(theta - epsilon, t),
  );
  const down = subtract(
    khanShatyrSurfacePoint(theta, Math.min(1, t + epsilon)),
    khanShatyrSurfacePoint(theta, Math.max(0, t - epsilon)),
  );
  return normalize(cross(around, down));
}

/**
 * Canonical visible intersection of one meridian string and one hoop.
 * The constant normal offset keeps every rendered meridian and hoop wholly
 * above the milky ETFE. Attachment brackets may bridge the small stand-off at
 * the steel ring and concrete anchor; the cable drawing itself never dives
 * into the membrane merely to hide those connections.
 */
export function khanShatyrStringPoint(
  theta: number,
  arcFraction: number,
): SceneVector3 {
  const fraction = Math.max(0, Math.min(1, arcFraction));
  const t = khanShatyrArcParameter(theta, fraction);
  const point = khanShatyrSurfacePoint(theta, t);
  // ETFE centre sits 0.018 m above the mathematical surface and is 0.028 m
  // thick. A 0.072 m axis stand-off leaves the 0.034 m primary cable outside
  // the ETFE even where a straight hoop chord cuts inside the curved skin.
  return add(point, scale(khanShatyrSurfaceNormal(theta, t), 0.072));
}

function addMembraneCushion(
  membrane: MutableGroup,
  id: string,
  column: number,
  t0: number,
  t1: number,
  base: number,
  colour: string,
): void {
  const step = Math.PI * 2 / KHAN_SHATYR_MEMBRANE_COLUMNS;
  const theta0 = column * step;
  const theta1 = (column + 1) * step;
  const theta = theta0 + step / 2;
  const from = khanShatyrSurfacePoint(theta, t0);
  const to = khanShatyrSurfacePoint(theta, t1);
  const chord = subtract(to, from);
  const middleT = (t0 + t1) / 2;
  const left = khanShatyrSurfacePoint(theta0, middleT);
  const right = khanShatyrSurfacePoint(theta1, middleT);
  const widthDirection = normalize(subtract(right, left));
  const normal = khanShatyrSurfaceNormal(theta, middleT);
  const centre = add(midpoint(from, to), scale(normal, 0.018));
  // Real ETFE cushions remain broad continuous strips. Their END JOINTS are
  // staggered for flexibility; pointed petals would open a false saw-tooth
  // gap in the climate skin. Adjacent angular strips receive only a clamp
  // allowance, while end-to-end strips meet exactly without coplanar overlap.
  const width = lengthOf(subtract(right, left)) * 1.035;
  const length = Math.max(0.08, lengthOf(chord) - 0.025);
  primitive(membrane, id, "glass", "panel", localToWorld(centre, base),
    [width, length, MEMBRANE_THICKNESS], colour,
    {
      rotation: orient(
        khanShatyrLocalDirectionToWorld(widthDirection),
        khanShatyrLocalDirectionToWorld(chord),
      ),
      bearsLoad: false,
      volume: Math.max(0.008, width * length * 0.006),
      sideAttachmentReach: 0.46,
    });
}

function addMembrane(
  membrane: MutableGroup,
  base: number,
): void {
  for (let column = 0; column < KHAN_SHATYR_MEMBRANE_COLUMNS; column += 1) {
    const step = Math.PI * 2 / KHAN_SHATYR_MEMBRANE_COLUMNS;
    const theta = (column + 0.5) * step;
    const cableLength = arcTable(theta).total;
    const cushionCount = Math.max(3, Math.ceil(cableLength / KHAN_SHATYR_CUSHION_MAX_LENGTH));
    const boundaries = column % 2 === 0
      ? Array.from({ length: cushionCount + 1 }, (_, index) => index / cushionCount)
      : [
          0,
          ...Array.from({ length: cushionCount }, (_, index) =>
            (index + 0.5) / cushionCount),
          1,
        ];
    for (let cushion = 0; cushion < boundaries.length - 1; cushion += 1) {
      const fromArc = boundaries[cushion];
      const toArc = boundaries[cushion + 1];
      const colourIndex = (column + cushion * 2) % 5;
      const colour = colourIndex === 0 ? ETFE_SHADE
        : colourIndex <= 2 ? ETFE_COOL : ETFE_BRIGHT;
      for (let facet = 0; facet < KHAN_SHATYR_MEMBRANE_FACETS; facet += 1) {
        const arc0 = fromArc + (toArc - fromArc) * facet / KHAN_SHATYR_MEMBRANE_FACETS;
        const arc1 = fromArc + (toArc - fromArc) * (facet + 1) / KHAN_SHATYR_MEMBRANE_FACETS;
        const t0 = khanShatyrArcParameter(theta, arc0);
        const t1 = khanShatyrArcParameter(theta, arc1);
        addMembraneCushion(
          membrane,
          `khan:etfe:${column}:cushion:${cushion}:facet:${facet}`,
          column,
          t0,
          t1,
          base,
          colour,
        );
      }
    }
  }
}

function addPerimeterAndEntrance(
  baseGroup: MutableGroup,
  membrane: MutableGroup,
  topology: KhanCableTopology,
  base: number,
): void {
  const boundary = topology.nodes.at(-1)!;
  // The 20 m concrete building is a distinct truncated elliptical slope:
  // 200 x 195 m at grade, 143 x 115 m where the cable net is anchored.
  // It must never be confused with a low kerb around the cable ellipse.
  const podiumSegments = KHAN_SHATYR_MEMBRANE_COLUMNS;
  for (let segment = 0; segment < podiumSegments; segment += 1) {
    const theta = (segment + 0.5) / podiumSegments * Math.PI * 2;
    const wrapped = Math.atan2(Math.sin(theta), Math.cos(theta));
    const entranceSector = Math.abs(wrapped) < 0.22;
    const outer: SceneVector3 = [
      Math.cos(theta) * KHAN_SHATYR_CONCRETE_BASE_SEMI_AXES[0],
      0.16,
      Math.sin(theta) * KHAN_SHATYR_CONCRETE_BASE_SEMI_AXES[1],
    ];
    const inner = perimeterPoint(theta);
    const slope = subtract(inner, outer);
    const tangent = normalize([
      -Math.sin(theta) * (KHAN_SHATYR_CONCRETE_BASE_SEMI_AXES[0]
        + KHAN_SHATYR_CABLE_BASE_SEMI_AXES[0]) / 2,
      0,
      Math.cos(theta) * (KHAN_SHATYR_CONCRETE_BASE_SEMI_AXES[1]
        + KHAN_SHATYR_CABLE_BASE_SEMI_AXES[1]) / 2,
    ]);
    const averageRadius = (
      KHAN_SHATYR_CONCRETE_BASE_SEMI_AXES[0]
      + KHAN_SHATYR_CONCRETE_BASE_SEMI_AXES[1]
      + KHAN_SHATYR_CABLE_BASE_SEMI_AXES[0]
      + KHAN_SHATYR_CABLE_BASE_SEMI_AXES[1]
    ) / 4;
    const width = 2 * Math.PI * averageRadius / podiumSegments * 1.035;
    if (!entranceSector) {
      primitive(baseGroup, `khan:podium:slope:${segment}`,
        "concrete", "panel", localToWorld(midpoint(outer, inner), base),
        [width, lengthOf(slope) + 0.04, 0.24], STONE_LIGHT,
        {
          rotation: orient(
            khanShatyrLocalDirectionToWorld(tangent),
            khanShatyrLocalDirectionToWorld(slope),
          ),
          bearingArea: Math.max(0.4, width * 0.24),
          volume: width * lengthOf(slope) * 0.18,
          carriesAttachments: true,
          attachmentSupportMode: "wall",
          sideAttachmentReach: 0.5,
        });
    }

    // The characteristic 4.2 m elliptical rooflights belong to the concrete
    // slope, not to the ETFE skin. A restrained sample keeps their rhythm.
    if (!entranceSector && segment % 5 === 2) {
      const lightCentre = mix(outer, inner, 0.37);
      primitive(baseGroup, `khan:podium:rooflight:${segment}`,
        "steel", "steelSheet", localToWorld(add(lightCentre, scale(normalize(cross(tangent, slope)), 0.10)), base),
        [1.08, 0.86, 0.10], PORTAL_DARK,
        {
          rotation: orient(
            khanShatyrLocalDirectionToWorld(tangent),
            khanShatyrLocalDirectionToWorld(slope),
          ),
          textureProfile: "matte-aluminium",
          bearsLoad: false,
          volume: 0.05,
          sideAttachmentReach: 0.25,
        });
    }

    const berm: SceneVector3 = [
      Math.cos(theta) * (KHAN_SHATYR_CONCRETE_BASE_SEMI_AXES[0] + 1.20),
      0.12,
      Math.sin(theta) * (KHAN_SHATYR_CONCRETE_BASE_SEMI_AXES[1] + 1.20),
    ];
    const bermWorld = localToWorld(berm, base);
    const bermGround = groundUnder(bermWorld[0], bermWorld[2]).top;
    primitive(baseGroup, `khan:berm:${segment}`, "grass", "groundTile",
      bermWorld, [width * 1.12, 0.24, 2.35], BERM_GREEN,
      {
        rotation: orient(
          khanShatyrLocalDirectionToWorld(tangent),
          [0, 1, 0],
        ),
        bearingArea: width * 2.35,
        volume: width * 0.18,
        contactBoxes: [groundSeatBox(bermWorld[1],
          [width * 1.12, 0.24, 2.35], bermGround)],
      });
  }

  // Exact anchor band at the 143 x 115 m ellipse and +20 m elevation.
  for (let radial = 0; radial < KHAN_SHATYR_RADIALS; radial += 1) {
    const from = boundary[radial].position;
    const to = boundary[(radial + 1) % KHAN_SHATYR_RADIALS].position;
    const chord = subtract(to, from);
    const centre = midpoint(from, to);
    const tangent = normalize(chord);
    const perimeterWorld = localToWorld(centre, base);
    primitive(baseGroup, `khan:perimeter:${radial}`, "steel", "steelSheet",
      perimeterWorld, [lengthOf(chord) + 0.08, 0.42, 0.32], STONE,
      {
        rotation: orient(
          khanShatyrLocalDirectionToWorld(tangent),
          [0, 1, 0],
        ),
        textureProfile: "matte-aluminium",
        bearingArea: Math.max(0.4, lengthOf(chord) * 0.32),
        volume: lengthOf(chord) * 0.18,
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.42,
      });
  }

  // The entrance cuts through the 20 m concrete slope. ETFE remains closed
  // above its own anchor line; there is no foreign glass box protruding
  // through the tent skin.
  const entryEdge = KHAN_SHATYR_CONCRETE_BASE_SEMI_AXES[0];
  for (let step = 0; step < 6; step += 1) {
    const height = 0.12 + step * 0.105;
    const x = entryEdge + 2.15 - step * 0.44;
    const stepPosition = localToWorld([x, height / 2, 0], base);
    primitive(baseGroup, `khan:entry:step:${step}`, "stone", "stoneBlock",
      stepPosition,
      [0.62, height, 14.2], STONE_LIGHT,
      {
        rotation: [0, -KHAN_SHATYR_YAW, 0],
        bearingArea: 8.7,
        volume: 0.62 * height * 14.2,
        contactBoxes: [groundSeatBox(stepPosition[1],
          [0.62, height, 14.2], base)],
      });
    for (const side of [-1, 1] as const) {
      const terracePosition = localToWorld(
        [x, height / 2 + 0.035, side * 9.10],
        base,
      );
      const terraceGround = groundUnder(terracePosition[0], terracePosition[2]).top;
      primitive(baseGroup, `khan:entry:green-terrace:${side}:${step}`,
        "grass", "groundTile", terracePosition,
        [0.62, height + 0.07, 4.15], BERM_GREEN,
        {
          rotation: [0, -KHAN_SHATYR_YAW, 0],
          bearingArea: 2.5,
          volume: 0.62 * (height + 0.07) * 4.15,
          contactBoxes: [groundSeatBox(terracePosition[1],
            [0.62, height + 0.07, 4.15], terraceGround)],
        });
    }
  }

  // The real complex has no free-standing rectangular glass portal at this
  // point. The stair and the cut in the sloped podium remain one open approach;
  // any future doors must belong to the recessed building facade, not a box
  // placed across the mouth of the tent.
}

function addInteriorLighting(
  baseGroup: MutableGroup,
  base: number,
): void {
  // Normal night state, distinct from event RGB scenes seen in photographs:
  // warm retail light remains near the entrance, while six amber fixtures
  // reveal only the upper throat. ETFE itself has no emissive material.
  const atriumOffsets = [
    [5.2, -4.6],
    [5.2, 4.6],
    [11.0, -4.6],
    [11.0, 4.6],
  ] as const;
  for (let lamp = 0; lamp < KHAN_SHATYR_ATRIUM_LIGHTS; lamp += 1) {
    const [x, z] = atriumOffsets[lamp];
    const position = localToWorld([x, 0.66, z], base);
    primitive(baseGroup, `khan:lighting:hidden-baffle:atrium:${lamp}`,
      "steel", "steelSheet",
      position,
      [1.20, 1.18, 1.20], COLLAR_DARK,
      {
        textureProfile: "matte-aluminium",
        bearingArea: 1.0,
        volume: 0.72,
        bearsLoad: false,
        light: {
          color: KHAN_SHATYR_ATRIUM_LIGHT_COLOR,
          distance: 36,
          intensity: 13,
          position: [0, 2.7, 0],
          dayIntensityFactor: 0,
          // Khan Shatyr is a skyline landmark. A high pool priority keeps the
          // coherent eight-light set alive while it is still visibly large,
          // instead of yielding all slots to minor lamps near the camera.
          poolPriority: 32,
          localPoolCapacity: KHAN_SHATYR_LIGHTS,
          poolGroupId: KHAN_SHATYR_LIGHT_GROUP,
          transition: { fadeInSeconds: 2.4, fadeOutSeconds: 2.0 },
        },
      });
  }

  for (let lamp = 0; lamp < KHAN_SHATYR_NECK_LIGHTS; lamp += 1) {
    const theta = lamp / KHAN_SHATYR_NECK_LIGHTS * Math.PI * 2;
    const position = localToWorld([
      -KHAN_SHATYR_RING_OFFSET + Math.cos(theta) * 1.15,
      KHAN_SHATYR_RING_HEIGHT - 0.88,
      Math.sin(theta) * 1.15,
    ], base);
    const lightOffset = khanShatyrLocalDirectionToWorld([
      Math.cos(theta) * 2.25,
      0.38,
      Math.sin(theta) * 2.25,
    ]);
    primitive(baseGroup, `khan:lighting:hidden-baffle:neck:${lamp}`,
      "steel", "steelSheet",
      position,
      [0.58, 0.52, 0.58], COLLAR_DARK,
      {
        textureProfile: "matte-aluminium",
        bearingArea: 0.28,
        volume: 0.14,
        bearsLoad: false,
        light: {
          color: KHAN_SHATYR_NECK_LIGHT_COLOR,
          distance: 32,
          intensity: 18,
          // Rendering proxy for light transmitted through ETFE. The dark
          // fixture body remains inside; only the non-rendered point-light
          // origin crosses the membrane, avoiding both self-emission and a
          // visible exterior lamp or hot pixel.
          position: lightOffset,
          dayIntensityFactor: 0,
          poolPriority: 32,
          localPoolCapacity: KHAN_SHATYR_LIGHTS,
          poolGroupId: KHAN_SHATYR_LIGHT_GROUP,
          transition: { fadeInSeconds: 2.4, fadeOutSeconds: 2.0 },
        },
      });
  }
}

export function createKhanShatyr(
  structure: MutableGroup,
  cables: MutableGroup,
  membrane: MutableGroup,
  baseGroup: MutableGroup,
): void {
  const ground = groundUnder(KHAN_SHATYR_CENTRE[0], KHAN_SHATYR_CENTRE[1]).top;
  const cableTopology = createKhanCableTopology();
  const tripodTopology = createKhanTripodTopology();
  addPerimeterAndEntrance(baseGroup, membrane, cableTopology, ground);
  addTripod(structure, tripodTopology, ground);
  addCableNet(cables, cableTopology, ground);
  addMembrane(membrane, ground);
  addInteriorLighting(baseGroup, ground);
}
