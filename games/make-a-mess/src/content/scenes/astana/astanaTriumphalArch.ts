// SPDX-License-Identifier: CC-BY-NC-ND-4.0
// SPDX-FileCopyrightText: 2026 Igor Kirisiuk
//
// Мәңгілік Ел. Reference absolutes: 20 m real height and 13 m real width.
// The island scale is 2/3, therefore every principal dimension comes from
// one factor instead of independent visual guesses. The opening, vault,
// niches and attic share one canonical facade section on both elevations.

import type { SceneVector3 } from "../../../game/destructionScene.ts";
import type { MutableGroup } from "./astanaAuthoring.ts";
import { orient, primitive } from "./astanaAuthoring.ts";
import { ARCH_CENTRE, ARCH_YAW } from "./astanaLayout.ts";
import { groundUnder } from "./astanaShell.ts";
import {
  ASTANA_LANDMARK_LIGHT_PRIORITY,
  ASTANA_LANDMARK_LOCAL_POOL_CAPACITY,
  ASTANA_LANDMARK_MIN_LIGHT_DISTANCE,
} from "./astanaLighting.ts";

export const ARCH_REAL_HEIGHT = 20;
export const ARCH_REAL_WIDTH = 13;
export const ARCH_SCALE = 2 / 3;
export const ARCH_HEIGHT = ARCH_REAL_HEIGHT * ARCH_SCALE;
export const ARCH_WIDTH = ARCH_REAL_WIDTH * ARCH_SCALE;
export const ARCH_DEPTH = 4.8;
export const ARCH_OPENING_WIDTH = 3.4;
export const ARCH_OPENING_SPRING = 6.8;
export const ARCH_OPENING_RADIUS = ARCH_OPENING_WIDTH / 2;
export const ARCH_OPENING_TOP = ARCH_OPENING_SPRING + ARCH_OPENING_RADIUS;
export const ARCH_VAULT_SEGMENTS = 12;
export const ARCH_SPANDREL_ROWS = 6;
export const ARCH_NICHE_COUNT = 4;

const MARBLE = "#ded8ca";
const MARBLE_LIGHT = "#eee9dd";
const MARBLE_SHADOW = "#c9c1b3";
const BRONZE = "#5a3c29";
const GOLD = "#b78a31";
const RECESS = "#25282a";
const BASE_Y = groundUnder(ARCH_CENTRE[0], ARCH_CENTRE[1]).top;
const HALF_WIDTH = ARCH_WIDTH / 2;
const HALF_DEPTH = ARCH_DEPTH / 2;
const PIER_WIDTH = (ARCH_WIDTH - ARCH_OPENING_WIDTH) / 2;
const PIER_OFFSET = ARCH_OPENING_WIDTH / 2 + PIER_WIDTH / 2;
const ATTIC_BOTTOM = ARCH_OPENING_TOP;
const ATTIC_TOP = 11.55;
const ARCH_LIGHT_GROUP = "astana:triumphal-arch:facade";

function world(localX: number, localY: number, localZ: number): SceneVector3 {
  const yaw = -ARCH_YAW;
  const cosine = Math.cos(yaw);
  const sine = Math.sin(yaw);
  return [
    ARCH_CENTRE[0] + cosine * localX + sine * localZ,
    BASE_Y + localY,
    ARCH_CENTRE[1] - sine * localX + cosine * localZ,
  ];
}

function rotation(): SceneVector3 {
  return [0, -ARCH_YAW, 0];
}

function box(
  target: MutableGroup,
  id: string,
  position: readonly [number, number, number],
  size: readonly [number, number, number],
  colour = MARBLE,
  options: Parameters<typeof primitive>[7] = {},
): void {
  primitive(
    target,
    id,
    "stone",
    "stoneBlock",
    world(...position),
    [...size],
    colour,
    {
      rotation: rotation(),
      textureProfile: "city-facade-cladding",
      ...options,
      volume: options.volume ?? size[0] * size[1] * size[2],
    },
  );
}

function localToWorldDirection(local: SceneVector3): SceneVector3 {
  const yaw = -ARCH_YAW;
  const cosine = Math.cos(yaw);
  const sine = Math.sin(yaw);
  return [
    cosine * local[0] + sine * local[2],
    local[1],
    -sine * local[0] + cosine * local[2],
  ];
}

function addVaultMember(
  target: MutableGroup,
  id: string,
  localFrom: SceneVector3,
  localTo: SceneVector3,
  depth: number,
  colour = MARBLE_LIGHT,
): void {
  const from = world(localFrom[0], localFrom[1], localFrom[2]);
  const to = world(localTo[0], localTo[1], localTo[2]);
  const chord: SceneVector3 = [
    to[0] - from[0],
    to[1] - from[1],
    to[2] - from[2],
  ];
  const radialLocal: SceneVector3 = [
    (localFrom[0] + localTo[0]) / 2,
    (localFrom[1] + localTo[1]) / 2 - ARCH_OPENING_SPRING,
    0,
  ];
  const radial = localToWorldDirection(radialLocal);
  const length = Math.hypot(...chord);
  primitive(
    target,
    id,
    "stone",
    "panel",
    [
      (from[0] + to[0]) / 2,
      (from[1] + to[1]) / 2,
      (from[2] + to[2]) / 2,
    ],
    [length, 0.3, depth],
    colour,
    {
      rotation: orient(chord, radial),
      textureProfile: "city-facade-cladding",
      carriesAttachments: true,
      attachmentSupportMode: "cable",
      // Stone voussoirs transfer load through their end joints. The solver
      // sees rotated bounding boxes, so the reach spans one radial thickness
      // and preserves the same canonical endpoints without fake overlap.
      sideAttachmentReach: 0.82,
      volume: length * 0.3 * depth,
    },
  );
}

function createLoadBearingBody(target: MutableGroup): void {
  box(target, "arch:plinth", [0, 0.18, 0], [ARCH_WIDTH + 0.5, 0.36, ARCH_DEPTH + 0.44], MARBLE_SHADOW, {
    bearsLoad: true,
    carriesAttachments: true,
    attachmentSupportMode: "wall",
    bearingArea: (ARCH_WIDTH + 0.5) * (ARCH_DEPTH + 0.44),
  });

  for (const side of [-1, 1] as const) {
    box(
      target,
      `arch:pier:${side}`,
      [side * PIER_OFFSET, (0.36 + ARCH_OPENING_SPRING) / 2, 0],
      [PIER_WIDTH, ARCH_OPENING_SPRING - 0.36, ARCH_DEPTH],
      MARBLE,
      { bearsLoad: true, carriesAttachments: true, attachmentSupportMode: "wall" },
    );
  }

  for (let row = 0; row < ARCH_SPANDREL_ROWS; row += 1) {
    const y0 = ARCH_OPENING_SPRING
      + ARCH_OPENING_RADIUS * row / ARCH_SPANDREL_ROWS;
    const y1 = ARCH_OPENING_SPRING
      + ARCH_OPENING_RADIUS * (row + 1) / ARCH_SPANDREL_ROWS;
    const sampleY = y0 - ARCH_OPENING_SPRING;
    const holeHalf = Math.sqrt(Math.max(0,
      ARCH_OPENING_RADIUS ** 2 - sampleY ** 2));
    const width = HALF_WIDTH - holeHalf;
    for (const side of [-1, 1] as const) {
      box(
        target,
        `arch:spandrel:${row}:${side}`,
        [side * (holeHalf + width / 2), (y0 + y1) / 2, 0],
        [width, y1 - y0, ARCH_DEPTH],
        MARBLE,
        { carriesAttachments: true, attachmentSupportMode: "wall" },
      );
    }
  }

  box(
    target,
    "arch:attic-body",
    [0, (ATTIC_BOTTOM + ATTIC_TOP) / 2, 0],
    [ARCH_WIDTH, ATTIC_TOP - ATTIC_BOTTOM, ARCH_DEPTH],
    MARBLE,
    { carriesAttachments: true, attachmentSupportMode: "wall" },
  );

  // Four engaged round corner pilasters are visible in both the frontal and
  // high three-quarter photographs. They are part of the silhouette, not
  // surface ornament painted onto a square pier.
  for (const x of [-1, 1] as const) {
    for (const z of [-1, 1] as const) {
      primitive(target, `arch:corner-pilaster:${x}:${z}`, "stone", "cylinder",
        world(x * (HALF_WIDTH - 0.28), 5.58, z * (HALF_DEPTH + 0.04)),
        [0.54, 10.42, 0.54], MARBLE_LIGHT, {
          rotation: rotation(),
          textureProfile: "city-facade-cladding",
          bearsLoad: true,
          carriesAttachments: true,
          attachmentSupportMode: "wall",
          bearingArea: 0.23,
          volume: 1.25,
        });
    }
  }
}

function createVault(target: MutableGroup): void {
  const faces = [-HALF_DEPTH - 0.035, HALF_DEPTH + 0.035] as const;
  for (const face of faces) {
    for (let segment = 0; segment < ARCH_VAULT_SEGMENTS; segment += 1) {
      const theta0 = Math.PI * segment / ARCH_VAULT_SEGMENTS;
      const theta1 = Math.PI * (segment + 1) / ARCH_VAULT_SEGMENTS;
      addVaultMember(
        target,
        `arch:voussoir:${face < 0 ? "front" : "rear"}:${segment}`,
        [
          ARCH_OPENING_RADIUS * Math.cos(theta0),
          ARCH_OPENING_SPRING + ARCH_OPENING_RADIUS * Math.sin(theta0),
          face,
        ],
        [
          ARCH_OPENING_RADIUS * Math.cos(theta1),
          ARCH_OPENING_SPRING + ARCH_OPENING_RADIUS * Math.sin(theta1),
          face,
        ],
        0.25,
      );
    }
  }

  // Eight transverse ribs make the coffered barrel visible through the
  // passage. Every rib uses the same arc vertices as the two facade rings.
  for (let rib = 0; rib < 8; rib += 1) {
    const z = -HALF_DEPTH + ARCH_DEPTH * (rib + 0.5) / 8;
    for (let segment = 0; segment < ARCH_VAULT_SEGMENTS; segment += 1) {
      const theta0 = Math.PI * segment / ARCH_VAULT_SEGMENTS;
      const theta1 = Math.PI * (segment + 1) / ARCH_VAULT_SEGMENTS;
      addVaultMember(
        target,
        `arch:vault-rib:${rib}:${segment}`,
        [
          ARCH_OPENING_RADIUS * Math.cos(theta0),
          ARCH_OPENING_SPRING + ARCH_OPENING_RADIUS * Math.sin(theta0),
          z,
        ],
        [
          ARCH_OPENING_RADIUS * Math.cos(theta1),
          ARCH_OPENING_SPRING + ARCH_OPENING_RADIUS * Math.sin(theta1),
          z,
        ],
        0.11,
        MARBLE_SHADOW,
      );
    }
  }
}

function createNiche(
  target: MutableGroup,
  facade: -1 | 1,
  side: -1 | 1,
): void {
  const centreX = side * PIER_OFFSET;
  const faceZ = facade * (HALF_DEPTH + 0.045);
  const width = 1.25;
  const spring = 4.7;
  const base = 1.55;
  const radius = width / 2;
  const columns = 7;
  for (let column = 0; column < columns; column += 1) {
    const x0 = -width / 2 + width * column / columns;
    const x1 = -width / 2 + width * (column + 1) / columns;
    const sample = Math.max(Math.abs(x0), Math.abs(x1));
    const top = spring + Math.sqrt(Math.max(0, radius ** 2 - sample ** 2));
    box(
      target,
      `arch:niche:${facade}:${side}:recess:${column}`,
      [centreX + (x0 + x1) / 2, (base + top) / 2, faceZ],
      [x1 - x0 + 0.012, top - base, 0.07],
      RECESS,
      { bearsLoad: false, sideAttachmentReach: 0.14 },
    );
  }

  const statueY = 3.05;
  primitive(
    target,
    `arch:niche:${facade}:${side}:statue-body`,
    "steel",
    "cylinder",
    world(centreX, statueY, facade * (HALF_DEPTH + 0.12)),
    [0.34, 2.25, 0.34],
    BRONZE,
    {
      rotation: rotation(),
      textureProfile: "painted-steel",
      bearsLoad: false,
      sideAttachmentReach: 0.2,
      volume: 0.2,
    },
  );
  primitive(
    target,
    `arch:niche:${facade}:${side}:statue-head`,
    "steel",
    "sphere",
    world(centreX, statueY + 1.23, facade * (HALF_DEPTH + 0.12)),
    [0.42, 0.42, 0.42],
    BRONZE,
    { bearsLoad: false, sideAttachmentReach: 0.22, volume: 0.04 },
  );
}

function createFacadeDetail(target: MutableGroup): void {
  const diskRotation = orient(
    localToWorldDirection([1, 0, 0]),
    localToWorldDirection([0, 0, 1]),
  );
  for (const facade of [-1, 1] as const) {
    for (const side of [-1, 1] as const) {
      createNiche(target, facade, side);
      primitive(
        target,
        `arch:emblem:${facade}:${side}`,
        "steel",
        "cylinder",
        world(side * PIER_OFFSET, 9.55, facade * (HALF_DEPTH + 0.12)),
        [1.05, 0.11, 1.05],
        BRONZE,
        {
          rotation: diskRotation,
          textureProfile: "painted-steel",
          bearsLoad: false,
          sideAttachmentReach: 0.2,
          volume: 0.08,
        },
      );
    }

    for (let glyph = 0; glyph < 9; glyph += 1) {
      box(
        target,
        `arch:inscription:${facade}:${glyph}`,
        [-1.55 + glyph * 0.39, 10.73, facade * (HALF_DEPTH + 0.09)],
        [0.23, glyph % 3 === 0 ? 0.22 : 0.16, 0.06],
        GOLD,
        { bearsLoad: false, sideAttachmentReach: 0.12 },
      );
    }
  }

  // Horizontal stone courses and the shallow central curved attic.
  for (const [index, y] of [10.98, 11.34, 11.62] .entries()) {
    box(
      target,
      `arch:cornice:${index}`,
      [0, y, 0],
      [ARCH_WIDTH + 0.28 + index * 0.18, 0.18, ARCH_DEPTH + 0.22 + index * 0.12],
      index === 1 ? MARBLE_SHADOW : MARBLE_LIGHT,
      { bearsLoad: false, sideAttachmentReach: 0.25 },
    );
  }

  box(target, "arch:attic-parapet", [0, 11.94, 0],
    [ARCH_WIDTH + 0.14, 0.78, ARCH_DEPTH + 0.08], MARBLE_LIGHT, {
      bearsLoad: true,
      carriesAttachments: true,
      attachmentSupportMode: "wall",
      sideAttachmentReach: 0.38,
      bearingArea: ARCH_WIDTH * ARCH_DEPTH,
    });
  box(target, "arch:attic-top-cap", [0, 12.39, 0],
    [ARCH_WIDTH + 0.46, 0.18, ARCH_DEPTH + 0.34], MARBLE_SHADOW, {
      bearsLoad: true,
      carriesAttachments: true,
      bearingArea: ARCH_WIDTH * ARCH_DEPTH,
      sideAttachmentReach: 0.36,
    });

  // One circular stone field is embedded mostly below the cap on each face;
  // only its upper arc remains visible and therefore produces the shallow
  // central crest seen in matching frontal photographs without block steps.
  for (const facade of [-1, 1] as const) {
    primitive(target, `arch:central-curved-crest:${facade}`, "stone", "cylinder",
      world(0, 12.18, facade * (HALF_DEPTH + 0.08)),
      [2.42, 0.28, 2.42], MARBLE_LIGHT, {
        rotation: diskRotation,
        textureProfile: "city-facade-cladding",
        bearsLoad: false,
        sideAttachmentReach: 0.45,
        volume: 0.42,
      });
  }

  // The high official view exposes the glazed rectangular roof lantern.
  primitive(target, "arch:roof-lantern-glass", "darkGlass", "glassPane",
    world(0, 12.55, 0), [4.1, 0.16, 2.72], "#526f76", {
      rotation: rotation(),
      bearsLoad: false,
      carriesAttachments: true,
      attachmentSupportMode: "cable",
      sideAttachmentReach: 1.15,
      volume: 0.7,
    });
  for (const x of [-1, 1] as const) {
    box(target, `arch:roof-lantern-frame-x:${x}`, [x * 2.05, 12.57, 0],
      [0.12, 0.2, 2.85], MARBLE_SHADOW, {
        bearsLoad: false,
        sideAttachmentReach: 0.5,
      });
  }

  for (const facade of [-1, 1] as const) {
    primitive(
      target,
      `arch:sun-emblem:${facade}`,
      "steel",
      "cylinder",
      world(0, 12.32, facade * (HALF_DEPTH + 0.24)),
      [0.52, 0.08, 0.52],
      MARBLE_SHADOW,
      {
        rotation: diskRotation,
        textureProfile: "painted-steel",
        bearsLoad: false,
        sideAttachmentReach: 0.18,
        volume: 0.03,
      },
    );
  }
}

function createLighting(target: MutableGroup): void {
  for (const facade of [-1, 1] as const) {
    for (const side of [-1, 1] as const) {
      primitive(
        target,
        `arch:light:${facade}:${side}`,
        "steel",
        "steelSheet",
        world(side * 2.65, 0.46, facade * (HALF_DEPTH + 0.08)),
        [0.09, 0.09, 0.09],
        RECESS,
        {
          rotation: rotation(),
          textureProfile: "matte-aluminium",
          bearsLoad: false,
          sideAttachmentReach: 0.2,
          volume: 0.001,
          light: {
            color: "#ffd2a3",
            distance: ASTANA_LANDMARK_MIN_LIGHT_DISTANCE,
            intensity: 12,
            position: [0, 3.4, facade * 0.35],
            dayIntensityFactor: 0,
            poolPriority: ASTANA_LANDMARK_LIGHT_PRIORITY,
            localPoolCapacity: ASTANA_LANDMARK_LOCAL_POOL_CAPACITY,
            poolGroupId: ARCH_LIGHT_GROUP,
            transition: { fadeInSeconds: 1.8, fadeOutSeconds: 1.5 },
          },
        },
      );
    }
  }
}

export function createAstanaTriumphalArch(
  structure: MutableGroup,
  detail: MutableGroup,
  lighting: MutableGroup,
): void {
  createLoadBearingBody(structure);
  createVault(structure);
  createFacadeDetail(detail);
  createLighting(lighting);
}
