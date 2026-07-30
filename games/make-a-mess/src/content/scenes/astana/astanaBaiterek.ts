// SPDX-License-Identifier: CC-BY-NC-ND-4.0
// SPDX-FileCopyrightText: 2026 Igor Kirisiuk
//
// Baiterek is authored from one continuous profile. The eight primary stems,
// the fine lattice and the sixteen tetrahedral crown tips inherit that profile,
// so the landmark keeps its hourglass silhouette from every direction instead
// of reading as a pedestal with a separate cage placed on top.

import type { MutableGroup } from "./astanaAuthoring.ts";
import { groundSeatBox, orient, primitive } from "./astanaAuthoring.ts";
import { groundUnder } from "./astanaShell.ts";
import {
  ASTANA_LANDMARK_LIGHT_PRIORITY,
  ASTANA_LANDMARK_LOCAL_POOL_CAPACITY,
  ASTANA_LANDMARK_MIN_LIGHT_DISTANCE,
} from "./astanaLighting.ts";
import type { SceneVector3 } from "../../../game/destructionScene.ts";

/** Island scale: the complete monument, including the needle. */
export const BAITEREK_HEIGHT = 52;
/** The real 22 m sphere kept in the same scale as the 105 m monument. */
export const SPHERE_DIAMETER = 10.8;
export const SPHERE_BOTTOM = 38.1;
const SPHERE_RADIUS = SPHERE_DIAMETER / 2;
const SPHERE_CENTRE = SPHERE_BOTTOM + SPHERE_RADIUS;

const BASE_RADIUS = 4.5;
const WAIST_RADIUS = 2.35;
const WAIST_Y = 18.5;
export const SHAFT_TOP = 37.2;
const CROWN_RADIUS = 3.65;
const CROWN_START = 24.8;

/** Eight structural leaves are the primary readable rhythm of the tower. */
export const STEMS = 8;
/** Sixteen tetrahedral tips form the radial rhythm visible around the sphere. */
export const CROWN_TRUSSES = 16;
/** The symbolic crown retains all 101 metal branch members. */
export const NEST_BRANCHES = 101;
/** Four recessed projectors wash the shaft upward from the plinth. */
export const BAITEREK_UPLIGHTS = 4;
/** Eight warm fixtures form the luminous ring beneath the sphere. */
export const BAITEREK_CROWN_LIGHTS = 8;
/** Measured from the supplied frontal reference: outward from vertical. */
export const CROWN_OUTER_EDGE_ANGLE_DEGREES = 20;
const CROWN_TETRA_RADIUS = 0.85;
const CROWN_TETRA_LENGTH = 9.20;
const CROWN_AXIS_ANGLE = CROWN_OUTER_EDGE_ANGLE_DEGREES * Math.PI / 180
  + Math.atan2(CROWN_TETRA_RADIUS, CROWN_TETRA_LENGTH);
const CROWN_AXIS_RADIAL = Math.sin(CROWN_AXIS_ANGLE);
const CROWN_AXIS_VERTICAL = Math.cos(CROWN_AXIS_ANGLE);
const CROWN_TIP_RADIUS = 8.85;
const CROWN_TIP_Y = 44.80;
export const CROWN_TRUSS_PROFILE = {
  rootY: CROWN_START,
  baseCentreRadius: CROWN_TIP_RADIUS - CROWN_TETRA_LENGTH * CROWN_AXIS_RADIAL,
  baseCentreY: CROWN_TIP_Y - CROWN_TETRA_LENGTH * CROWN_AXIS_VERTICAL,
  baseRadius: CROWN_TETRA_RADIUS,
  axisRadial: CROWN_AXIS_RADIAL,
  length: CROWN_TETRA_LENGTH,
} as const;

const WHITE = "#ffffff";
const WHITE_SHADE = "#edf0f1";
const STEEL_DARK = "#697477";
const GLASS = "#6f929d";
const STONE = "#aaa49a";
const STONE_LIGHT = "#c5c0b8";
const GOLD_BRIGHT = "#f0ca59";
const GOLD = "#c9a227";
const GOLD_SHADE = "#aa8119";
const GOLD_DEEP = "#765713";
export const BAITEREK_SHAFT_LIGHT_COLOR = "#ffe1a0";
export const BAITEREK_CROWN_LIGHT_COLOR = "#ffd071";
const BAITEREK_LIGHT_GROUP = "astana:baiterek:architectural-lighting";
const BAITEREK_LIGHT_TRANSITION = {
  fadeInSeconds: 0.35,
  fadeOutSeconds: 0.25,
} as const;

function smoothstep(value: number): number {
  const t = value <= 0 ? 0 : value >= 1 ? 1 : value;
  return t * t * (3 - 2 * t);
}

/**
 * A shallow lower flare, a long waist and a deliberate second opening under
 * the sphere. The previous profile narrowed above the waist, which erased the
 * tree/cup silhouette visible in every frontal photograph.
 */
export function shaftRadius(y: number): number {
  if (y <= WAIST_Y) {
    const t = smoothstep(y / WAIST_Y);
    return WAIST_RADIUS + (BASE_RADIUS - WAIST_RADIUS) * Math.pow(1 - t, 1.35);
  }
  const t = Math.max(0, Math.min(1, (y - WAIST_Y) / (SHAFT_TOP - WAIST_Y)));
  // Keep an outward tangent at the top so the longitudinal ribs flow into
  // the crown instead of straightening and then breaking into separate rays.
  const opening = t * t * (2 - t);
  return WAIST_RADIUS + (CROWN_RADIUS - WAIST_RADIUS) * opening;
}

const subtract = (a: SceneVector3, b: SceneVector3): SceneVector3 =>
  [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

const lengthOf = (v: SceneVector3): number => Math.hypot(v[0], v[1], v[2]);

const unitOf = (v: SceneVector3): SceneVector3 => {
  const length = lengthOf(v) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
};

const midpoint = (a: SceneVector3, b: SceneVector3): SceneVector3 => [
  (a[0] + b[0]) / 2,
  (a[1] + b[1]) / 2,
  (a[2] + b[2]) / 2,
];

export interface CrownTrussGeometry {
  readonly baseCentre: SceneVector3;
  readonly baseVertices: readonly [SceneVector3, SceneVector3, SceneVector3];
  readonly tip: SceneVector3;
  readonly primaryEdges: readonly [
    { readonly from: SceneVector3; readonly to: SceneVector3 },
    { readonly from: SceneVector3; readonly to: SceneVector3 },
    { readonly from: SceneVector3; readonly to: SceneVector3 },
  ];
}

/**
 * One crown tetrahedron in monument-local coordinates. All three primary
 * edges deliberately share the same `tip` object, making convergence an
 * authored invariant rather than three independently calculated endpoints.
 */
export function crownTrussGeometry(phi: number): CrownTrussGeometry {
  const profile = CROWN_TRUSS_PROFILE;
  const radial: SceneVector3 = [Math.cos(phi), 0, Math.sin(phi)];
  const tangent: SceneVector3 = [-Math.sin(phi), 0, Math.cos(phi)];
  const axisVertical = Math.sqrt(1 - profile.axisRadial * profile.axisRadial);
  const axis: SceneVector3 = [
    radial[0] * profile.axisRadial,
    axisVertical,
    radial[2] * profile.axisRadial,
  ];
  const baseNormal: SceneVector3 = [
    radial[0] * axisVertical,
    -profile.axisRadial,
    radial[2] * axisVertical,
  ];
  const baseCentre: SceneVector3 = [
    radial[0] * profile.baseCentreRadius,
    profile.baseCentreY,
    radial[2] * profile.baseCentreRadius,
  ];
  const fromBase = (
    normalDistance: number,
    tangentDistance: number,
    axisDistance: number,
  ): SceneVector3 => [
    baseCentre[0]
      + baseNormal[0] * normalDistance
      + tangent[0] * tangentDistance
      + axis[0] * axisDistance,
    baseCentre[1]
      + baseNormal[1] * normalDistance
      + axis[1] * axisDistance,
    baseCentre[2]
      + baseNormal[2] * normalDistance
      + tangent[2] * tangentDistance
      + axis[2] * axisDistance,
  ];
  const rearOffset = profile.baseRadius * Math.sqrt(3) / 2;
  const baseVertices = [
    fromBase(profile.baseRadius, 0, 0),
    fromBase(-profile.baseRadius / 2, -rearOffset, 0),
    fromBase(-profile.baseRadius / 2, rearOffset, 0),
  ] as const;
  const tip = fromBase(0, 0, profile.length);
  return {
    baseCentre,
    baseVertices,
    tip,
    primaryEdges: [
      { from: baseVertices[0], to: tip },
      { from: baseVertices[1], to: tip },
      { from: baseVertices[2], to: tip },
    ],
  };
}

export function createBaiterek(
  frame: MutableGroup,
  shell: MutableGroup,
  sphere: MutableGroup,
  centre: readonly [number, number],
): void {
  const base = groundUnder(centre[0], centre[1]).top;
  const at = (radius: number, phi: number, y: number): SceneVector3 => [
    centre[0] + Math.cos(phi) * radius,
    base + y,
    centre[1] + Math.sin(phi) * radius,
  ];
  const radialOf = (phi: number): SceneVector3 => [Math.cos(phi), 0, Math.sin(phi)];
  const tangentOf = (phi: number): SceneVector3 => [-Math.sin(phi), 0, Math.cos(phi)];
  const orientationReference = (direction: SceneVector3, phi: number): SceneVector3 => {
    const unit = unitOf(direction);
    const candidates = [
      radialOf(phi),
      tangentOf(phi),
      [0, 1, 0] as SceneVector3,
    ];
    const reference = candidates.reduce((best, candidate) => {
      const score = Math.abs(
        unit[0] * candidate[0] + unit[1] * candidate[1] + unit[2] * candidate[2]
      );
      const bestScore = Math.abs(
        unit[0] * best[0] + unit[1] * best[1] + unit[2] * best[2]
      );
      return score < bestScore ? candidate : best;
    });
    // `orient` preserves its first axis and orthogonalizes the second one.
    // Passing a merely approximate reference therefore used to erase the
    // tangential component of the cylinder direction: mirrored tetrahedral
    // edges rendered parallel and missed their shared tip by up to 0.74 m.
    // Project the reference into the exact normal plane first, so the local
    // y-axis remains the authored chord after `orient` orthogonalizes it.
    const projection = unit[0] * reference[0]
      + unit[1] * reference[1]
      + unit[2] * reference[2];
    return unitOf([
      reference[0] - unit[0] * projection,
      reference[1] - unit[1] * projection,
      reference[2] - unit[2] * projection,
    ]);
  };

  // --- Granite approach ---------------------------------------------------
  // Two low, overlapping rings read as a continuous stepped plaza rather
  // than the former 23 m cogwheel. Each segment follows its local terrain.
  const addPlinthRing = (
    id: string,
    radius: number,
    radialWidth: number,
    height: number,
    facets: number,
    color: string,
  ): void => {
    const tangentWidth = (2 * Math.PI * radius / facets) * 1.06;
    for (let facet = 0; facet < facets; facet += 1) {
      const phi = (facet / facets) * Math.PI * 2;
      const x = centre[0] + Math.cos(phi) * radius;
      const z = centre[1] + Math.sin(phi) * radius;
      const ground = groundUnder(x, z).top;
      const position: SceneVector3 = [x, ground + height / 2, z];
      primitive(shell, `baiterek:plinth:${id}:${facet}`, "stone", "stoneBlock",
        position, [tangentWidth, height, radialWidth], color,
        {
          rotation: orient(tangentOf(phi), [0, 1, 0]),
          bearingArea: tangentWidth * radialWidth,
          volume: tangentWidth * radialWidth * height,
          contactBoxes: [groundSeatBox(position[1], [tangentWidth, height, radialWidth], ground)],
        });
    }
  };
  addPlinthRing("lower", 6.15, 2.25, 0.24, 24, STONE);
  addPlinthRing("upper", 4.75, 1.65, 0.34, 20, STONE_LIGHT);

  // The real tower is read at dusk as four broad vertical washes, not as a
  // uniformly emissive yellow object. Recessed fixtures sit in the upper
  // plinth and fade naturally along the hourglass shaft. Their four sources
  // combine with the eight gallery lights into one atomic twelve-light set.
  for (let light = 0; light < BAITEREK_UPLIGHTS; light += 1) {
    const phi = light / BAITEREK_UPLIGHTS * Math.PI * 2;
    const radius = 4.28;
    const x = centre[0] + Math.cos(phi) * radius;
    const z = centre[1] + Math.sin(phi) * radius;
    const localGround = groundUnder(x, z).top;
    primitive(shell, `baiterek:uplight:${light}`, "steel", "panel",
      [x, localGround + 0.37, z], [0.46, 0.12, 0.46], STEEL_DARK,
      {
        rotation: orient(tangentOf(phi), [0, 1, 0]),
        bearsLoad: false,
        volume: 0.035,
        sideAttachmentReach: 0.35,
        light: {
          color: BAITEREK_SHAFT_LIGHT_COLOR,
          distance: 36,
          intensity: 13,
          position: [0, 0.2, 0],
          dayIntensityFactor: 0.06,
          poolPriority: ASTANA_LANDMARK_LIGHT_PRIORITY,
          localPoolCapacity: ASTANA_LANDMARK_LOCAL_POOL_CAPACITY,
          poolGroupId: BAITEREK_LIGHT_GROUP,
          transition: BAITEREK_LIGHT_TRANSITION,
        },
      });
  }

  // --- Eight primary stems ------------------------------------------------
  const stemLinks = 14;
  const stemPad = 0.22;
  for (let stem = 0; stem < STEMS; stem += 1) {
    const phi = (stem / STEMS) * Math.PI * 2;
    for (let link = 0; link < stemLinks; link += 1) {
      const yLow = (SHAFT_TOP * link) / stemLinks;
      const yHigh = (SHAFT_TOP * (link + 1)) / stemLinks;
      const low = at(shaftRadius(yLow), phi, yLow);
      const high = at(shaftRadius(yHigh), phi, yHigh);
      const chord = subtract(high, low);
      const span = lengthOf(chord);
      const centreLink = midpoint(low, high);
      const rise = chord[1] / span;
      const footLocal = (base + yLow + stemPad / 2 - centreLink[1]) / rise;
      const headLocal = (base + yHigh - stemPad / 2 - centreLink[1]) / rise;
      primitive(frame, `baiterek:stem:${stem}:${link}`, "steel", "panel",
        centreLink, [span + 0.03, 0.30, 0.72], WHITE,
        {
          rotation: orient(chord, radialOf(phi)),
          textureProfile: "painted-steel",
          bearingArea: 0.9,
          volume: span * 0.07,
          contactBearingOrder: true,
          carriesAttachments: true,
          attachmentSupportMode: "cable",
          sideAttachmentReach: 1.0,
          contactBoxes: [
            { position: [footLocal, 0, 0], size: [stemPad, 0.30, 0.72] },
            { position: [headLocal, 0, 0], size: [stemPad, 0.30, 0.72] },
          ],
        });
    }
  }

  // --- Fine longitudinal and diagonal lattice ----------------------------
  // Sixteen slim rails establish the vertical rhythm between the eight main
  // leaves. Sparse rings and alternating diagonals keep the sky visible.
  const latticeRails = 16;
  const latticeLinks = 8;
  const latticeBottom = 0.42;
  const latticeTop = SHAFT_TOP - 0.55;
  for (let rail = 0; rail < latticeRails; rail += 1) {
    const phi = (rail / latticeRails) * Math.PI * 2;
    for (let link = 0; link < latticeLinks; link += 1) {
      const yLow = latticeBottom + (latticeTop - latticeBottom) * (link / latticeLinks);
      const yHigh = latticeBottom + (latticeTop - latticeBottom) * ((link + 1) / latticeLinks);
      const low = at(shaftRadius(yLow) - 0.18, phi, yLow);
      const high = at(shaftRadius(yHigh) - 0.18, phi, yHigh);
      const chord = subtract(high, low);
      primitive(frame, `baiterek:lattice-rail:${rail}:${link}`, "steel", "cylinder",
        midpoint(low, high), [0.11, lengthOf(chord) + 0.03, 0.11], WHITE_SHADE,
        {
          rotation: orient(tangentOf(phi), chord),
          textureProfile: "painted-steel",
          bearingArea: 0.2,
          volume: 0.025,
          contactBearingOrder: true,
          carriesAttachments: true,
          attachmentSupportMode: "cable",
          sideAttachmentReach: 0.75,
        });
    }
  }

  const ringLevels = Array.from(
    { length: 9 },
    (_, level) => 3.2 + (SHAFT_TOP - 5.1) * (level / 8),
  );
  for (let level = 0; level < ringLevels.length; level += 1) {
    const y = ringLevels[level];
    const radius = shaftRadius(y) - 0.18;
    for (let rail = 0; rail < latticeRails; rail += 1) {
      const phi = (rail / latticeRails) * Math.PI * 2;
      const nextPhi = ((rail + 1) / latticeRails) * Math.PI * 2;
      const a = at(radius, phi, y);
      const b = at(radius, nextPhi, y);
      const chord = subtract(b, a);
      primitive(frame, `baiterek:lattice-ring:${level}:${rail}`, "steel", "cylinder",
        midpoint(a, b), [0.10, lengthOf(chord) + 0.02, 0.10], WHITE_SHADE,
        {
          rotation: orient(radialOf((phi + nextPhi) / 2), chord),
          textureProfile: "painted-steel",
          bearsLoad: false,
          volume: 0.02,
          sideAttachmentReach: 0.75,
        });
    }
  }

  for (let band = 0; band < 4; band += 1) {
    const lowLevel = band * 2;
    const highLevel = lowLevel + 1;
    for (let rail = 0; rail < latticeRails; rail += 1) {
      const phi = (rail / latticeRails) * Math.PI * 2;
      const next = ((rail + (band % 2 === 0 ? 1 : -1) + latticeRails) % latticeRails)
        / latticeRails * Math.PI * 2;
      const a = at(shaftRadius(ringLevels[lowLevel]) - 0.18, phi, ringLevels[lowLevel]);
      const b = at(shaftRadius(ringLevels[highLevel]) - 0.18, next, ringLevels[highLevel]);
      const chord = subtract(b, a);
      primitive(frame, `baiterek:lattice-brace:${band}:${rail}`, "steel", "cylinder",
        midpoint(a, b), [0.09, lengthOf(chord), 0.09], WHITE_SHADE,
        {
          rotation: orient(tangentOf((phi + next) / 2), chord),
          textureProfile: "painted-steel",
          bearsLoad: false,
          volume: 0.018,
          sideAttachmentReach: 0.8,
        });
    }
  }

  // --- Slender lift core and vertical glazing ----------------------------
  const coreTop = SPHERE_BOTTOM + 0.45;
  const coreSections = 8;
  for (let section = 0; section < coreSections; section += 1) {
    const height = coreTop / coreSections;
    primitive(shell, `baiterek:core:${section}`, "concrete", "cylinder",
      at(0, 0, height * (section + 0.5)), [1.65, height + 0.02, 1.65], "#b6bec1",
      {
        bearingArea: 2.2,
        volume: height * 0.8,
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 2.8,
      });
  }
  primitive(shell, "baiterek:core-cap", "steel", "cylinder",
    at(0, 0, coreTop + 0.11), [1.82, 0.22, 1.82], WHITE_SHADE,
    {
      textureProfile: "painted-steel",
      bearingArea: 2.5,
      volume: 0.32,
      carriesAttachments: true,
      attachmentSupportMode: "cable",
      sideAttachmentReach: 2.8,
    });

  const shaftFacets = 8;
  const shaftLevels = 7;
  const shaftHeight = (SPHERE_BOTTOM - 0.7) / shaftLevels;
  const shaftGlassRadius = 1.16;
  const shaftPaneWidth = 2 * shaftGlassRadius * Math.tan(Math.PI / shaftFacets) * 1.03;
  for (let level = 0; level < shaftLevels; level += 1) {
    const y = shaftHeight * (level + 0.5);
    for (let facet = 0; facet < shaftFacets; facet += 1) {
      const phi = (facet / shaftFacets) * Math.PI * 2;
      primitive(shell, `baiterek:lift-glass:${level}:${facet}`, "glass", "glassPane",
        at(shaftGlassRadius, phi, y), [shaftPaneWidth, shaftHeight - 0.06, 0.08], GLASS,
        {
          // x is tangent, y is vertical. The previous radial y-axis turned
          // every pane into a horizontal shelf around the core.
          rotation: orient(tangentOf(phi), [0, 1, 0]),
          bearsLoad: false,
          volume: 0.14,
          sideAttachmentReach: 0.5,
        });
    }
  }

  // --- Ground-level glass vestibule --------------------------------------
  const vestibuleFacets = 8;
  const vestibuleRadius = 2.85;
  const vestibuleStep = Math.PI * 2 / vestibuleFacets;
  const vestibulePaneWidth = 2 * vestibuleRadius * Math.tan(Math.PI / vestibuleFacets);
  const vestibuleBottom = 0.50;
  const vestibuleHeight = 3.15;
  for (let facet = 0; facet < vestibuleFacets; facet += 1) {
    const phi = facet * vestibuleStep;
    const paneCentre = at(vestibuleRadius, phi, vestibuleBottom + vestibuleHeight / 2);
    // +z is the boulevard-facing entrance. Leave a 1.15 m opening in the
    // middle instead of sealing the vestibule with an eighth glass wall.
    if (facet === 2) {
      const opening = 1.15;
      const sideWidth = (vestibulePaneWidth - opening) / 2;
      const offset = (opening + sideWidth) / 2;
      for (const side of [-1, 1] as const) {
        primitive(shell, `baiterek:vestibule-glass:entry:${side}`, "glass", "glassPane",
          [
            paneCentre[0] + tangentOf(phi)[0] * offset * side,
            paneCentre[1],
            paneCentre[2] + tangentOf(phi)[2] * offset * side,
          ], [sideWidth, vestibuleHeight, 0.08], GLASS,
          {
            rotation: orient(tangentOf(phi), [0, 1, 0]),
            bearsLoad: false,
            volume: 0.08,
            sideAttachmentReach: 0.55,
          });
      }
    } else {
      primitive(shell, `baiterek:vestibule-glass:${facet}`, "glass", "glassPane",
        paneCentre, [vestibulePaneWidth, vestibuleHeight, 0.08], GLASS,
        {
          rotation: orient(tangentOf(phi), [0, 1, 0]),
          bearsLoad: false,
          volume: 0.14,
          sideAttachmentReach: 0.55,
        });
    }

    primitive(shell, `baiterek:vestibule-lintel:${facet}`, "steel", "panel",
      at(vestibuleRadius, phi, vestibuleBottom + vestibuleHeight + 0.07),
      [vestibulePaneWidth + 0.08, 0.14, 0.14], WHITE,
      {
        rotation: orient(tangentOf(phi), [0, 1, 0]),
        textureProfile: "painted-steel",
        bearsLoad: false,
        volume: 0.03,
        sideAttachmentReach: 0.7,
      });

    const vertexPhi = phi + vestibuleStep / 2;
    const vertexRadius = vestibuleRadius / Math.cos(Math.PI / vestibuleFacets);
    primitive(shell, `baiterek:vestibule-mullion:${facet}`, "steel", "cylinder",
      at(vertexRadius, vertexPhi, vestibuleBottom + vestibuleHeight / 2),
      [0.10, vestibuleHeight + 0.18, 0.10], WHITE,
      {
        bearingArea: 0.1,
        textureProfile: "painted-steel",
        volume: 0.03,
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.65,
      });
  }

  // --- The 101-member tetrahedral crown ----------------------------------
  // Sixteen inclined tetrahedra continue the eight main stems in paired radial
  // rhythm. Their triangular sections face the viewer edge-first: one
  // longitudinal chord is radial and forms the outer silhouette, while the
  // other two chords sit behind it.
  // All three chords continue down into the shaft instead of beginning on a
  // separate platform. The tips lean upward and outward to the sphere's
  // equatorial zone, matching the crown visible in frontal photographs.
  let branchMember = 0;
  const addCrownMember = (
    from: SceneVector3,
    to: SceneVector3,
    phi: number,
    width = 0.09,
    color = WHITE,
  ): void => {
    const chord = subtract(to, from);
    primitive(frame, `baiterek:branch:${branchMember}`, "steel", "cylinder",
      midpoint(from, to), [width, lengthOf(chord), width], color,
      {
        rotation: orient(orientationReference(chord, phi), chord),
        textureProfile: "painted-steel",
        bearingArea: 0.12,
        volume: 0.024,
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.95,
      });
    branchMember += 1;
  };

  const along = (from: SceneVector3, to: SceneVector3, t: number): SceneVector3 => [
    from[0] + (to[0] - from[0]) * t,
    from[1] + (to[1] - from[1]) * t,
    from[2] + (to[2] - from[2]) * t,
  ];
  const addCrownBrace = (
    id: string,
    from: SceneVector3,
    to: SceneVector3,
    phi: number,
    width: number,
  ): void => {
    const chord = subtract(to, from);
    primitive(frame, id, "steel", "cylinder",
      midpoint(from, to), [width, lengthOf(chord) + 0.015, width], WHITE_SHADE,
      {
        rotation: orient(orientationReference(chord, phi), chord),
        textureProfile: "painted-steel",
        bearsLoad: false,
        volume: Math.max(0.006, lengthOf(chord) * width * width * 0.7),
        sideAttachmentReach: 0.78,
      });
  };

  const profile = CROWN_TRUSS_PROFILE;
  const trussStep = Math.PI * 2 / CROWN_TRUSSES;
  const trussSections: Array<{
    readonly base: readonly [SceneVector3, SceneVector3, SceneVector3];
    readonly middle: readonly [SceneVector3, SceneVector3, SceneVector3];
  }> = [];
  const crownPointToWorld = (point: SceneVector3): SceneVector3 => [
    centre[0] + point[0],
    base + point[1],
    centre[1] + point[2],
  ];
  for (let truss = 0; truss < CROWN_TRUSSES; truss += 1) {
    const phi = truss * trussStep;
    const geometry = crownTrussGeometry(phi);
    const baseCentre = crownPointToWorld(geometry.baseCentre);
    const baseVertices = geometry.baseVertices.map(crownPointToWorld) as unknown as readonly [
      SceneVector3,
      SceneVector3,
      SceneVector3,
    ];
    // One shared world-space endpoint is reused by all three primary edges.
    const tip = crownPointToWorld(geometry.tip);
    const middle = baseVertices.map((point) => along(point, tip, 0.36)) as unknown as readonly [
      SceneVector3,
      SceneVector3,
      SceneVector3,
    ];
    const upper = baseVertices.map((point) => along(point, tip, 0.67)) as unknown as readonly [
      SceneVector3,
      SceneVector3,
      SceneVector3,
    ];
    const middleCentre = along(baseCentre, tip, 0.36);
    const upperCentre = along(baseCentre, tip, 0.67);
    trussSections.push({ base: baseVertices, middle });

    // Each of the three tetrahedral chords continues directly into the shaft.
    // The roots begin more than one sphere diameter below the ball, producing
    // one continuous bouquet rather than a crown on a circular table.
    for (let vertex = 0; vertex < 3; vertex += 1) {
      const baseVertex = baseVertices[vertex];
      const vertexPhi = Math.atan2(
        baseVertex[2] - centre[1],
        baseVertex[0] - centre[0],
      );
      const root = at(shaftRadius(profile.rootY) - 0.10, vertexPhi, profile.rootY);
      addCrownMember(root, baseVertex, vertexPhi, 0.082);
    }

    // Three long chords share one exact endpoint. The triangular base is a
    // secondary brace, not a fourth ray or three independently aimed tips.
    for (let vertex = 0; vertex < 3; vertex += 1) {
      addCrownMember(baseVertices[vertex], tip, phi, 0.086);
    }

    const braces: Array<readonly [SceneVector3, SceneVector3, number]> = [];
    for (let vertex = 0; vertex < 3; vertex += 1) {
      braces.push([
        baseVertices[vertex],
        baseVertices[(vertex + 1) % 3],
        0.052,
      ]);
    }
    // Two intermediate triangular sections keep the tapered volume legible.
    for (const section of [middle, upper] as const) {
      for (let vertex = 0; vertex < 3; vertex += 1) {
        braces.push([section[vertex], section[(vertex + 1) % 3], 0.052]);
      }
    }
    // A consistent Warren pattern triangulates each of the three faces.
    for (let vertex = 0; vertex < 3; vertex += 1) {
      braces.push([baseVertices[vertex], middle[(vertex + 1) % 3], 0.047]);
      braces.push([middle[vertex], upper[(vertex + 1) % 3], 0.043]);
    }
    // A light internal spine and tripods prevent the tip reading as three
    // unrelated rays while remaining subordinate to the outer chords.
    braces.push([baseCentre, middleCentre, 0.047]);
    braces.push([middleCentre, upperCentre, 0.043]);
    braces.push([upperCentre, tip, 0.038]);
    for (let vertex = 0; vertex < 3; vertex += 1) {
      braces.push([baseCentre, baseVertices[vertex], 0.045]);
      braces.push([middleCentre, middle[vertex], 0.041]);
      braces.push([upperCentre, upper[vertex], 0.037]);
    }
    for (let brace = 0; brace < braces.length; brace += 1) {
      const [from, to, width] = braces[brace];
      addCrownBrace(`baiterek:truss-brace:${truss}:${brace}`, from, to, phi, width);
    }
  }

  // Adjacent tetrahedra meet through their rear chords at two levels. These
  // ties make one spatial nest around the lower hemisphere; they do not add a
  // dominant horizontal platform or flatten the tetrahedra into a fan.
  for (let truss = 0; truss < CROWN_TRUSSES; truss += 1) {
    const next = (truss + 1) % CROWN_TRUSSES;
    const phi = (truss + 0.5) * trussStep;
    addCrownBrace(
      `baiterek:nest-hoop:base:${truss}`,
      trussSections[truss].base[2],
      trussSections[next].base[1],
      phi,
      0.052,
    );
    addCrownBrace(
      `baiterek:nest-hoop:middle:${truss}`,
      trussSections[truss].middle[2],
      trussSections[next].middle[1],
      phi,
      0.046,
    );
    addCrownBrace(
      `baiterek:nest-diagonal:${truss}`,
      trussSections[truss].base[2],
      trussSections[next].middle[1],
      phi,
      0.041,
    );
  }

  // Sixteen tetrahedra × six primary members plus five quiet radial ties =
  // 101. The five unavoidable remainder members stay hidden under the sphere.
  const quietTies = NEST_BRANCHES - CROWN_TRUSSES * 6;
  for (let tie = 0; tie < quietTies; tie += 1) {
    const phi = tie / quietTies * Math.PI * 2;
    addCrownMember(
      at(1.15, phi, SPHERE_BOTTOM - 0.42),
      at(3.25, phi, SPHERE_BOTTOM - 0.18),
      phi,
      0.055,
      WHITE_SHADE,
    );
  }

  // --- Recessed observation support --------------------------------------
  // The real visual centre is the tetrahedral nest, not a flat platter.
  // Keep the necessary inner support below it as a thin tube ring.
  const galleryRadius = 3.25;
  for (let bracket = 0; bracket < 8; bracket += 1) {
    const phi = (bracket / 8) * Math.PI * 2;
    const from = at(0.9, phi, SPHERE_BOTTOM - 0.16);
    const to = at(galleryRadius, phi, SPHERE_BOTTOM - 0.16);
    const chord = subtract(to, from);
    primitive(shell, `baiterek:gallery-bracket:${bracket}`, "steel", "cylinder",
      midpoint(from, to), [0.055, lengthOf(chord), 0.055], WHITE_SHADE,
      {
        rotation: orient(tangentOf(phi), chord),
        textureProfile: "painted-steel",
        bearingArea: 0.35,
        volume: 0.025,
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 1.2,
      });
  }
  const galleryFacets = 20;
  for (let facet = 0; facet < galleryFacets; facet += 1) {
    const phi = (facet / galleryFacets) * Math.PI * 2;
    const next = ((facet + 1) / galleryFacets) * Math.PI * 2;
    const a = at(galleryRadius, phi, SPHERE_BOTTOM - 0.14);
    const b = at(galleryRadius, next, SPHERE_BOTTOM - 0.14);
    const chord = subtract(b, a);
    primitive(shell, `baiterek:gallery:${facet}`, "steel", "cylinder",
      midpoint(a, b), [0.060, lengthOf(chord) + 0.02, 0.060], WHITE_SHADE,
      {
        rotation: orient(radialOf((phi + next) / 2), chord),
        textureProfile: "painted-steel",
        bearingArea: 0.30,
        volume: 0.018,
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 1.0,
      });
  }

  // The photograph shows a concentrated golden necklace directly below the
  // ball. These fixtures sit on the real gallery ring: they illuminate the
  // lower hemisphere and the tetrahedral nest, while the top of the mirrored
  // sphere remains dark and reflective instead of becoming a glowing lamp.
  for (let light = 0; light < BAITEREK_CROWN_LIGHTS; light += 1) {
    const phi = light / BAITEREK_CROWN_LIGHTS * Math.PI * 2;
    primitive(shell, `baiterek:gallery-lamp:${light}`, "plastic", "panel",
      at(galleryRadius - 0.15, phi, SPHERE_BOTTOM - 0.08),
      [0.24, 0.12, 0.24], "#ffe9b4",
      {
        rotation: orient(tangentOf(phi), [0, 1, 0]),
        bearsLoad: false,
        volume: 0.018,
        sideAttachmentReach: 0.4,
        light: {
          color: BAITEREK_CROWN_LIGHT_COLOR,
          distance: ASTANA_LANDMARK_MIN_LIGHT_DISTANCE,
          intensity: 12,
          position: [0, 0.04, 0],
          dayIntensityFactor: 0.06,
          poolPriority: ASTANA_LANDMARK_LIGHT_PRIORITY,
          localPoolCapacity: ASTANA_LANDMARK_LOCAL_POOL_CAPACITY,
          poolGroupId: BAITEREK_LIGHT_GROUP,
          transition: BAITEREK_LIGHT_TRANSITION,
        },
      });
  }

  // --- Golden mirrored sphere --------------------------------------------
  // Slim internal rails support the skin without drawing a dark cage across
  // it. Seven belts and 24 meridians are still economical but round enough at
  // the distances from which the landmark is normally read.
  const sphereRibs = 8;
  for (let rib = 0; rib < sphereRibs; rib += 1) {
    const phi = (rib / sphereRibs) * Math.PI * 2;
    primitive(sphere, `baiterek:sphere-rib:${rib}`, "steel", "cylinder",
      at(SPHERE_RADIUS * 0.54, phi, SPHERE_CENTRE),
      [0.10, SPHERE_DIAMETER - 0.55, 0.10], STEEL_DARK,
      {
        bearingArea: 0.2,
        volume: 0.12,
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 2.3,
      });
  }

  const belts = 7;
  const meridians = 24;
  for (let belt = 0; belt < belts; belt += 1) {
    const theta0 = (Math.PI * belt) / belts;
    const theta1 = (Math.PI * (belt + 1)) / belts;
    const theta = (theta0 + theta1) / 2;
    const ringRadius = Math.sin(theta) * SPHERE_RADIUS;
    const y = SPHERE_CENTRE - Math.cos(theta) * SPHERE_RADIUS;
    const beltHeight = (theta1 - theta0) * SPHERE_RADIUS * 1.09;
    for (let meridian = 0; meridian < meridians; meridian += 1) {
      const phi = (meridian / meridians) * Math.PI * 2;
      const point = at(ringRadius, phi, y);
      const meridianTangent: SceneVector3 = [
        Math.cos(theta) * Math.cos(phi),
        Math.sin(theta),
        Math.cos(theta) * Math.sin(phi),
      ];
      const outward: SceneVector3 = [
        Math.sin(theta) * Math.cos(phi),
        -Math.cos(theta),
        Math.sin(theta) * Math.sin(phi),
      ];
      const width = (2 * Math.PI * Math.max(0.35, ringRadius) / meridians) * 1.12;
      // Broad azimuthal highlights read like one reflective surface. Avoid a
      // per-tile checkerboard, which turned the sphere into camouflage.
      const reflection = 0.72 * Math.max(0, Math.cos(phi - 0.88))
        + 0.20 * Math.sin(theta);
      const color = reflection > 0.72
        ? GOLD_BRIGHT
        : reflection > 0.46
          ? GOLD
          : reflection > 0.22
            ? GOLD_SHADE
            : GOLD_DEEP;
      primitive(sphere, `baiterek:sphere:${belt}:${meridian}`, "steel", "panel",
        point, [beltHeight, 0.14, width], color,
        {
          rotation: orient(meridianTangent, outward),
          textureProfile: "gold-mirror",
          bearingArea: 0.5,
          volume: beltHeight * width * 0.035,
          carriesAttachments: true,
          attachmentSupportMode: "cable",
          sideAttachmentReach: 3.0,
        });
    }
  }

  // --- Needle -------------------------------------------------------------
  // The original ends in a thin aerial; there is no oversized golden knob.
  const sphereTop = SPHERE_CENTRE + SPHERE_RADIUS;
  const mastBottom = sphereTop - 0.38;
  const mastHeight = BAITEREK_HEIGHT - mastBottom;
  primitive(shell, "baiterek:mast", "steel", "cylinder",
    at(0, 0, mastBottom + mastHeight / 2), [0.17, mastHeight, 0.17], WHITE_SHADE,
    {
      textureProfile: "painted-steel",
      bearingArea: 0.12,
      volume: 0.12,
      sideAttachmentReach: 1.35,
    });
}
