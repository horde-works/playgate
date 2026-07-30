// SPDX-License-Identifier: CC-BY-NC-ND-4.0
// SPDX-FileCopyrightText: 2026 Igor Kirisiuk
//
// Astana Opera. The island building keeps the original's non-negotiable
// hierarchy: a broad Sicilian-pearl-stone body, eight-column front portico,
// a true triangular pediment, side colonnades, brass-framed glazing and the
// copper-clad rounded stage volume rising behind the classical facade.

import type { SceneVector3 } from "../../../game/destructionScene.ts";
import type { MutableGroup } from "./astanaAuthoring.ts";
import { groundSeatBox, orient, primitive } from "./astanaAuthoring.ts";
import { OPERA_CENTRE, OPERA_YAW } from "./astanaLayout.ts";
import { groundUnder } from "./astanaShell.ts";
import {
  ASTANA_LANDMARK_LIGHT_PRIORITY,
  ASTANA_LANDMARK_LOCAL_POOL_CAPACITY,
  ASTANA_LANDMARK_MIN_LIGHT_DISTANCE,
  ASTANA_OPERA_LIGHT_GROUP,
} from "./astanaLighting.ts";

export const OPERA_WIDTH = 24;
export const OPERA_DEPTH = 16;
export const OPERA_FRONT_COLUMN_COUNT = 8;
export const OPERA_SIDE_COLUMN_COUNT = 8;
export const OPERA_PEDIMENT_HEIGHT = 3.35;
export const OPERA_TOTAL_HEIGHT = 11.6;

const STONE = "#ded8c9";
const STONE_LIGHT = "#eee9db";
const STONE_SHADOW = "#c8c0b1";
const COPPER = "#657b76";
const COPPER_DARK = "#455d5a";
const BRASS = "#9a7436";
const GLASS = "#263e43";
const RECESS = "#171e20";
const BASE_Y = groundUnder(OPERA_CENTRE[0], OPERA_CENTRE[1]).top;
const PLINTH_TOP = 0.46;
const FRONT_Z = OPERA_DEPTH / 2;
const PEDIMENT_BASE = 7.12;

function world(x: number, y: number, z: number): SceneVector3 {
  const yaw = -OPERA_YAW;
  const cosine = Math.cos(yaw);
  const sine = Math.sin(yaw);
  return [
    OPERA_CENTRE[0] + cosine * x + sine * z,
    BASE_Y + y,
    OPERA_CENTRE[1] - sine * x + cosine * z,
  ];
}

function direction(local: SceneVector3): SceneVector3 {
  const yaw = -OPERA_YAW;
  const cosine = Math.cos(yaw);
  const sine = Math.sin(yaw);
  return [
    cosine * local[0] + sine * local[2],
    local[1],
    -sine * local[0] + cosine * local[2],
  ];
}

function rotation(): SceneVector3 {
  return [0, -OPERA_YAW, 0];
}

function box(
  target: MutableGroup,
  id: string,
  localPosition: SceneVector3,
  size: SceneVector3,
  colour = STONE,
  material: "stone" | "steel" | "darkGlass" = "stone",
  options: Parameters<typeof primitive>[7] = {},
): void {
  primitive(
    target,
    id,
    material,
    material === "darkGlass" ? "glassPane" : material === "stone" ? "stoneBlock" : "panel",
    world(...localPosition),
    size,
    colour,
    {
      rotation: rotation(),
      textureProfile: material === "stone"
        ? "city-facade-cladding"
        : material === "steel" ? "matte-aluminium" : undefined,
      ...options,
      volume: options.volume ?? size[0] * size[1] * size[2],
    },
  );
}

function column(
  target: MutableGroup,
  id: string,
  x: number,
  z: number,
): void {
  primitive(target, `${id}:base`, "stone", "cylinder", world(x, 0.65, z),
    [0.72, 0.38, 0.72], STONE_SHADOW, {
      textureProfile: "city-facade-cladding",
      bearsLoad: true,
      carriesAttachments: true,
      bearingArea: 0.34,
      volume: 0.13,
    });
  primitive(target, `${id}:shaft`, "stone", "cylinder", world(x, 3.505, z),
    [0.49, 5.35, 0.49], STONE_LIGHT, {
      textureProfile: "city-facade-cladding",
      bearsLoad: true,
      carriesAttachments: true,
      bearingArea: 0.22,
      volume: 0.98,
    });
  box(target, `${id}:capital`, [x, 6.41, z], [0.88, 0.46, 0.88], STONE_LIGHT,
    "stone", {
      carriesAttachments: true,
      bearingArea: 0.6,
    });
}

function addMember(
  target: MutableGroup,
  id: string,
  fromLocal: SceneVector3,
  toLocal: SceneVector3,
  thickness: number,
  colour = STONE_LIGHT,
): void {
  const from = world(...fromLocal);
  const to = world(...toLocal);
  const chord: SceneVector3 = [
    to[0] - from[0],
    to[1] - from[1],
    to[2] - from[2],
  ];
  const length = Math.hypot(...chord);
  const normal = direction([0, 0, 1]);
  primitive(target, id, "stone", "panel", [
    (from[0] + to[0]) / 2,
    (from[1] + to[1]) / 2,
    (from[2] + to[2]) / 2,
  ], [length, thickness, thickness], colour, {
    rotation: orient(chord, normal),
    textureProfile: "city-facade-cladding",
    bearsLoad: false,
    attachmentSupportMode: "cable",
    sideAttachmentReach: 0.46,
    volume: length * thickness * thickness,
  });
}

function createFoundation(target: MutableGroup): void {
  const size: SceneVector3 = [24.8, 0.46, 16.8];
  primitive(target, "opera:plinth", "stone", "stoneBlock", world(0, PLINTH_TOP / 2, 0),
    size, STONE_SHADOW, {
      rotation: rotation(),
      textureProfile: "city-gray-pavers",
      bearsLoad: true,
      carriesAttachments: true,
      attachmentSupportMode: "wall",
      bearingArea: size[0] * size[2],
      contactBoxes: [groundSeatBox(BASE_Y + PLINTH_TOP / 2, size, BASE_Y)],
      volume: size[0] * size[1] * size[2],
    });
  // The frontal photographs are taken from a broad, almost level ceremonial
  // forecourt.  Three shallow full-width risers meet it; there is no little
  // domestic staircase pasted to the portico.
  box(target, "opera:ceremonial-forecourt", [0, 0.065, FRONT_Z + 3.15],
    [23.2, 0.13, 5.9], "#c7c5bf", "stone", {
      bearsLoad: true,
      bearingArea: 23.2 * 5.9,
      volume: 23.2 * 5.9 * 0.13,
    });
  for (const step of [0, 1, 2]) {
    box(target, `opera:front-step:${step}`,
      [0, 0.10 + step * 0.10, FRONT_Z + 0.72 - step * 0.38],
      [20.8 - step * 0.18, 0.16, 0.82],
      step === 2 ? STONE_LIGHT : STONE_SHADOW, "stone", {
        bearsLoad: true,
        bearingArea: 18,
      });
  }
}

function createBody(target: MutableGroup): void {
  // The theatre is not one outer box.  These volumes remain separately
  // legible from the official front, 3/4 and side photographs: recessed
  // auditorium/lobby, two long side wings and two taller rear pavilions.
  box(target, "opera:auditorium-core", [0, 3.62, 0.25], [12.8, 6.32, 13.3], STONE, "stone", {
    bearsLoad: true,
    carriesAttachments: true,
    attachmentSupportMode: "wall",
    bearingArea: 12.8 * 13.3,
  });
  for (const side of [-1, 1] as const) {
    box(target, `opera:side-wing:${side}`, [side * 8.65, 3.5, 0.15],
      [4.45, 6.08, 13.5], STONE, "stone", {
        bearsLoad: true,
        carriesAttachments: true,
        attachmentSupportMode: "wall",
        bearingArea: 4.45 * 13.5,
      });
    box(target, `opera:rear-pavilion:${side}`, [side * 8.55, 3.92, -5.45],
      [5.25, 6.92, 4.75], STONE_LIGHT, "stone", {
        bearsLoad: true,
        carriesAttachments: true,
        attachmentSupportMode: "wall",
        bearingArea: 5.25 * 4.75,
      });
    box(target, `opera:rear-pavilion-cornice:${side}`, [side * 8.55, 7.35, -5.45],
      [5.55, 0.38, 5.05], STONE_LIGHT, "stone", { carriesAttachments: true });
  }
  box(target, "opera:front-recess-wall", [0, 3.66, FRONT_Z - 1.38], [18.4, 6.42, 0.42],
    STONE_LIGHT, "stone", { carriesAttachments: true, attachmentSupportMode: "wall" });
  box(target, "opera:front-entablature", [0, 6.88, FRONT_Z + 0.20],
    [21.5, 0.58, 1.25], STONE_LIGHT, "stone", {
      carriesAttachments: true,
      attachmentSupportMode: "wall",
      sideAttachmentReach: 0.35,
    });
  for (const side of [-1, 1] as const) {
    box(target, `opera:side-entablature:${side}`, [side * 11.05, 6.85, 0],
      [0.9, 0.52, 14.8], STONE_LIGHT, "stone", { carriesAttachments: true });
  }
}

function createColonnades(target: MutableGroup): void {
  const span = 18.2;
  for (let index = 0; index < OPERA_FRONT_COLUMN_COUNT; index += 1) {
    const x = -span / 2 + span * index / (OPERA_FRONT_COLUMN_COUNT - 1);
    column(target, `opera:front-column:${index}`, x, FRONT_Z + 0.54);
  }
  for (const side of [-1, 1] as const) {
    for (let index = 0; index < OPERA_SIDE_COLUMN_COUNT; index += 1) {
      const z = -5.55 + index * 1.68;
      column(target, `opera:side-column:${side}:${index}`, side * 11.12, z);
    }
  }
}

function createGlazing(target: MutableGroup): void {
  const frontBay = 18.2 / 7;
  for (let bay = 1; bay < 6; bay += 1) {
    const x = -9.1 + frontBay * (bay + 0.5);
    box(target, `opera:front-window:${bay}`, [x, 4.82, FRONT_Z - 1.14],
      [frontBay - 0.74, 1.72, 0.08], GLASS, "darkGlass", {
        bearsLoad: false,
        sideAttachmentReach: 0.2,
      });
    for (const side of [-1, 1] as const) {
      box(target, `opera:front-window-brass:${bay}:${side}`,
        [x + side * (frontBay - 0.48) / 2, 4.82, FRONT_Z - 1.09],
        [0.07, 1.82, 0.08], BRASS, "steel", { bearsLoad: false, sideAttachmentReach: 0.16 });
    }
  }
  for (let door = 0; door < 3; door += 1) {
    const x = (door - 1) * 2.55;
    box(target, `opera:front-door:${door}`, [x, 1.92, FRONT_Z - 1.14],
      [1.72, 3.0, 0.09], RECESS, "darkGlass", { bearsLoad: false, sideAttachmentReach: 0.2 });
    for (const edge of [-1, 1] as const) {
      box(target, `opera:front-door-brass:${door}:${edge}`,
        [x + edge * 0.83, 1.92, FRONT_Z - 1.09],
        [0.07, 3.05, 0.08], BRASS, "steel", { bearsLoad: false, sideAttachmentReach: 0.16 });
    }
    box(target, `opera:front-door-head:${door}`, [x, 3.45, FRONT_Z - 1.09],
      [1.78, 0.11, 0.1], BRASS, "steel", { bearsLoad: false, sideAttachmentReach: 0.16 });
  }
  for (const side of [-1, 1] as const) {
    const x = side * 7.65;
    box(target, `opera:front-statue-niche:${side}`, [x, 2.05, FRONT_Z - 1.13],
      [1.15, 2.35, 0.12], RECESS, "darkGlass", { bearsLoad: false, sideAttachmentReach: 0.2 });
    primitive(target, `opera:front-statue:${side}`, "stone", "cylinder",
      world(x, 1.93, FRONT_Z - 1.02), [0.34, 1.48, 0.34], STONE_SHADOW, {
        textureProfile: "city-facade-cladding",
        bearsLoad: false,
        sideAttachmentReach: 0.26,
        volume: 0.13,
      });
  }
  for (const side of [-1, 1] as const) {
    for (let bay = 0; bay < 7; bay += 1) {
      const z = -5.0 + bay * 1.72;
      for (const floor of [0, 1] as const) {
        const windowHeight = floor === 0 ? 1.72 : 1.44;
        box(target, `opera:side-window:${side}:${bay}:${floor}`,
          [side * 10.92, 2.18 + floor * 2.55, z],
          [0.08, windowHeight, 1.02], GLASS, "darkGlass", {
            bearsLoad: false,
            sideAttachmentReach: 0.2,
          });
        for (const edge of [-1, 1] as const) {
          box(target, `opera:side-window-brass:${side}:${bay}:${floor}:${edge}`,
            [side * 10.96, 2.18 + floor * 2.55, z + edge * 0.49],
            [0.07, windowHeight + 0.06, 0.06], BRASS, "steel", {
              bearsLoad: false,
              sideAttachmentReach: 0.16,
            });
        }
      }
      primitive(target, `opera:side-window-pediment:${side}:${bay}`, "stone",
        "triangularSheet", world(side * 10.98, 3.3, z), [1.2, 0.48, 0.1],
        STONE_LIGHT, {
          rotation: orient(direction([0, 0, 1]), direction([0, 1, 0])),
          textureProfile: "city-facade-cladding",
          bearsLoad: false,
          sideAttachmentReach: 0.24,
          volume: 0.03,
        });
    }
  }
}

function createPediment(target: MutableGroup): void {
  primitive(target, "opera:pediment-face", "stone", "triangularSheet",
    world(0, PEDIMENT_BASE + OPERA_PEDIMENT_HEIGHT / 3, FRONT_Z + 0.16),
    [20.6, OPERA_PEDIMENT_HEIGHT, 0.34], STONE_LIGHT, {
      rotation: rotation(),
      textureProfile: "city-facade-cladding",
      bearsLoad: false,
      sideAttachmentReach: 0.38,
      volume: 20.6 * OPERA_PEDIMENT_HEIGHT * 0.34 / 2,
    });
  const half = 10.3;
  const top = PEDIMENT_BASE + OPERA_PEDIMENT_HEIGHT;
  addMember(target, "opera:pediment-cornice:left", [-half, PEDIMENT_BASE, FRONT_Z + 0.34],
    [0, top, FRONT_Z + 0.34], 0.26);
  addMember(target, "opera:pediment-cornice:right", [0, top, FRONT_Z + 0.34],
    [half, PEDIMENT_BASE, FRONT_Z + 0.34], 0.26);
  addMember(target, "opera:pediment-cornice:base", [-half, PEDIMENT_BASE, FRONT_Z + 0.34],
    [half, PEDIMENT_BASE, FRONT_Z + 0.34], 0.26);

  // The original pediment reads as one sculptural field, not a billboard.
  for (let figure = 0; figure < 7; figure += 1) {
    const x = -3.6 + figure * 1.2;
    const reliefHeight = 0.78 + (figure % 2) * 0.16;
    box(target, `opera:pediment-relief:${figure}`,
      [x, PEDIMENT_BASE + 0.13 + reliefHeight / 2, FRONT_Z + 0.28],
      [0.24, reliefHeight, 0.1], STONE_SHADOW, "stone", {
        bearsLoad: false,
        sideAttachmentReach: 0.34,
        volume: 0.04,
      });
  }

  for (let glyph = 0; glyph < 15; glyph += 1) {
    box(target, `opera:pediment-inscription:${glyph}`,
      [-6.4 + glyph * 0.91, PEDIMENT_BASE - 0.16, FRONT_Z + 0.36],
      [0.42, glyph % 4 === 0 ? 0.16 : 0.11, 0.07], BRASS, "steel", {
        bearsLoad: false,
        sideAttachmentReach: 0.18,
        volume: 0.004,
      });
  }

  box(target, "opera:quadriga-pedestal", [0, 8.78, FRONT_Z - 0.1],
    [0.5, 3.38, 0.52], STONE_LIGHT, "stone", {
      bearsLoad: true,
      carriesAttachments: true,
      attachmentSupportMode: "wall",
      bearingArea: 0.24,
      volume: 0.22,
    });
  box(target, "opera:quadriga-base", [0, PEDIMENT_BASE + OPERA_PEDIMENT_HEIGHT + 0.08,
    FRONT_Z - 0.1], [2.7, 0.16, 0.72], BRASS, "steel", {
      bearsLoad: true,
      carriesAttachments: true,
      attachmentSupportMode: "cable",
      sideAttachmentReach: 1.5,
      bearingArea: 1.6,
      volume: 0.16,
    });
  for (let horse = 0; horse < 4; horse += 1) {
    const x = -0.9 + horse * 0.6;
    primitive(target, `opera:quadriga-horse:${horse}:body`, "steel", "cylinder",
      world(x, PEDIMENT_BASE + OPERA_PEDIMENT_HEIGHT + 0.5, FRONT_Z - 0.08),
      [0.18, 0.65, 0.18], BRASS, {
        textureProfile: "painted-steel",
        bearsLoad: false,
        sideAttachmentReach: 0.5,
        volume: 0.012,
      });
    primitive(target, `opera:quadriga-horse:${horse}:head`, "steel", "sphere",
      world(x, PEDIMENT_BASE + OPERA_PEDIMENT_HEIGHT + 0.87, FRONT_Z - 0.05),
      [0.2, 0.2, 0.2], BRASS, {
        bearsLoad: false,
        sideAttachmentReach: 0.28,
        volume: 0.004,
      });
  }
}

function createMainRoof(target: MutableGroup): void {
  // A front pediment fixes the roof geometry absolutely: its ridge runs in
  // depth.  The former model ran it left-to-right, a 90 degree error visible
  // from every matching 3/4 photograph.
  const depthDir = direction([0, 0, 1]);
  const roofDepth = 11.15;
  const roofCentreZ = 1.95;
  for (const side of [-1, 1] as const) {
    const eave: SceneVector3 = [side * 10.72, 7.05, roofCentreZ];
    const ridge: SceneVector3 = [0, 8.72, roofCentreZ];
    const slope: SceneVector3 = [ridge[0] - eave[0], ridge[1] - eave[1], 0];
    const length = Math.hypot(slope[0], slope[1]);
    const normalLocal: SceneVector3 = [slope[1], -slope[0], 0];
    primitive(target, `opera:main-roof:${side}`, "steel", "panel",
      world((eave[0] + ridge[0]) / 2, (eave[1] + ridge[1]) / 2, roofCentreZ),
      [roofDepth, 0.18, length], COPPER_DARK, {
        rotation: orient(depthDir, direction(normalLocal)),
        textureProfile: "painted-steel",
        bearsLoad: false,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.46,
        volume: roofDepth * 0.18 * length,
      });
  }
  box(target, "opera:main-roof-ridge", [0, 8.76, roofCentreZ],
    [0.22, 0.22, roofDepth + 0.2], COPPER, "steel", {
      bearsLoad: false,
      sideAttachmentReach: 0.42,
      volume: 0.54,
    });
}

function createStageVolume(target: MutableGroup): void {
  const stageZ = -4.45;
  box(target, "opera:stage-tower", [0, 4.78, stageZ], [10.2, 8.65, 6.35],
    STONE_SHADOW, "stone", {
      bearsLoad: true,
      carriesAttachments: true,
      attachmentSupportMode: "wall",
      bearingArea: 10.2 * 6.35,
    });
  box(target, "opera:stage-tower-cornice", [0, 9.18, stageZ],
    [10.65, 0.36, 6.7], STONE_LIGHT, "stone", {
      bearsLoad: true,
      carriesAttachments: true,
      bearingArea: 10.2 * 6.35,
    });
  const radius = 2.28;
  const roofBase = 9.12;
  const segments = 10;
  const xDir = direction([1, 0, 0]);
  // Concealed welded spine: the visible copper cassettes describe the
  // barrel, while this one internal beam closes their real load path into
  // the stage tower instead of asking the cassettes to float in a chain.
  box(target, "opera:stage-roof-spine", [0, 10.18, stageZ], [9.85, 2.2, 0.46],
    COPPER_DARK, "steel", {
      bearsLoad: true,
      carriesAttachments: true,
      attachmentSupportMode: "wall",
      bearingArea: 4.5,
      volume: 10.8,
    });
  for (let segment = 0; segment < segments; segment += 1) {
    const a0 = Math.PI * segment / segments;
    const a1 = Math.PI * (segment + 1) / segments;
    const z0 = stageZ + radius * Math.cos(a0);
    const z1 = stageZ + radius * Math.cos(a1);
    const y0 = roofBase + radius * Math.sin(a0);
    const y1 = roofBase + radius * Math.sin(a1);
    const chordLength = Math.hypot(y1 - y0, z1 - z0);
    const mid = (a0 + a1) / 2;
    const normal = direction([0, Math.sin(mid), Math.cos(mid)]);
    primitive(target, `opera:stage-copper-roof:${segment}`, "steel", "panel",
      world(0, (y0 + y1) / 2, (z0 + z1) / 2),
      [10.55, 0.2, chordLength + 0.04], segment % 2 ? COPPER_DARK : COPPER, {
        rotation: orient(xDir, normal),
        textureProfile: "painted-steel",
        bearsLoad: false,
        attachmentSupportMode: "cable",
        // Each cassette is bolted to the adjacent barrel cassette; the
        // generous reach represents the concealed transverse roof ribs.
        sideAttachmentReach: 2.35,
        volume: 10.55 * 0.2 * chordLength,
      });
  }
  const diskRotation = orient(direction([1, 0, 0]), direction([0, 0, 1]));
  for (const face of [-1, 1] as const) {
    const z = stageZ + face * 3.2;
    for (let porthole = 0; porthole < 3; porthole += 1) {
      primitive(target, `opera:stage-porthole:${face}:${porthole}`, "steel", "cylinder",
        world((porthole - 1) * 2.25, 9.85, z), [0.52, 0.08, 0.52], BRASS, {
          rotation: diskRotation,
          textureProfile: "painted-steel",
          bearsLoad: false,
          sideAttachmentReach: 0.18,
          volume: 0.02,
        });
    }
  }

  // The official 3/4 view shows lower copper caps on both rear shoulders,
  // separately from the central fly-tower roof.
  for (const side of [-1, 1] as const) {
    box(target, `opera:rear-shoulder-copper:${side}`, [side * 8.55, 7.64, -5.45],
      [5.45, 0.22, 4.9], COPPER_DARK, "steel", {
        bearsLoad: false,
        sideAttachmentReach: 0.44,
        volume: 5.9,
      });
  }
}

function createLighting(target: MutableGroup): void {
  for (let light = 0; light < 4; light += 1) {
    const x = -7.8 + light * 5.2;
    box(target, `opera:hidden-front-light:${light}`, [x, 0.58, FRONT_Z + 0.78],
      [0.08, 0.08, 0.08], RECESS, "steel", {
        bearsLoad: false,
        sideAttachmentReach: 0.2,
        volume: 0.001,
        light: {
          color: "#ffd2a1",
          distance: ASTANA_LANDMARK_MIN_LIGHT_DISTANCE,
          intensity: 14,
          position: [0, 3.4, -0.25],
          dayIntensityFactor: 0,
          poolPriority: ASTANA_LANDMARK_LIGHT_PRIORITY,
          localPoolCapacity: ASTANA_LANDMARK_LOCAL_POOL_CAPACITY,
          poolGroupId: ASTANA_OPERA_LIGHT_GROUP,
          transition: { fadeInSeconds: 2, fadeOutSeconds: 1.6 },
        },
      });
  }
  for (let door = 0; door < 3; door += 1) {
    box(target, `opera:hidden-lobby-light:${door}`, [(door - 1) * 1.65, 2.15, FRONT_Z - 0.28],
      [0.08, 0.08, 0.08], RECESS, "steel", {
        bearsLoad: false,
        sideAttachmentReach: 0.25,
        volume: 0.001,
        light: {
          color: "#ffc78f",
          distance: ASTANA_LANDMARK_MIN_LIGHT_DISTANCE,
          intensity: 11,
          position: [0, 0, 0.6],
          dayIntensityFactor: 0,
          poolPriority: ASTANA_LANDMARK_LIGHT_PRIORITY,
          localPoolCapacity: ASTANA_LANDMARK_LOCAL_POOL_CAPACITY,
          poolGroupId: ASTANA_OPERA_LIGHT_GROUP,
          transition: { fadeInSeconds: 1.7, fadeOutSeconds: 1.4 },
        },
      });
  }
}

export function createAstanaOpera(
  foundation: MutableGroup,
  body: MutableGroup,
  columns: MutableGroup,
  glazing: MutableGroup,
  roof: MutableGroup,
  detail: MutableGroup,
  lighting: MutableGroup,
): void {
  createFoundation(foundation);
  createBody(body);
  createColonnades(columns);
  createGlazing(glazing);
  createPediment(detail);
  createMainRoof(roof);
  createStageVolume(body);
  createLighting(lighting);
}
