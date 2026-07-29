// SPDX-License-Identifier: CC-BY-NC-ND-4.0
// SPDX-FileCopyrightText: 2026 Igor Kirisiuk
//
// Партер Байтерека и цветочный бульвар Нұржол. Это не прямоугольная
// «площадка под объект», а связанная система: круг Байтерека, две гранитные
// дорожки, три приподнятых цветника, поперечные проходы и один ритм фонарей.

import type { MutableGroup } from "./astanaAuthoring.ts";
import { primitive } from "./astanaAuthoring.ts";
import {
  NURZHOL_BED_HALF_WIDTH,
  NURZHOL_BED_SEGMENTS,
  NURZHOL_CROSSINGS,
  NURZHOL_END,
  NURZHOL_LANE_HALF_WIDTH,
  NURZHOL_LANE_OFFSET,
  NURZHOL_PLAN_ROTATION,
  NURZHOL_START,
  nurzholPoint,
} from "./astanaLayout.ts";
import { groundUnder } from "./astanaShell.ts";

const GRANITE = "#aaa69d";
const GRANITE_EDGE = "#c3beb4";
const BED_SOIL = "#55483b";
const LAMP_METAL = "#4d5558";
const LAMP_LIGHT = "#f3f1e7";
const RENDER_YAW = -NURZHOL_PLAN_ROTATION;
const LAMP_GROUP = "astana:nurzhol-parterre-lighting";
const LAMP_ALONG = [18.3, 27.05, 36.15] as const;
const LAMP_ACROSS = 3.85;
const CROSSING_HALF_LENGTH = 0.55;

function createDirectedWalkways(hardscape: MutableGroup): void {
  const laneRanges = [
    [NURZHOL_START, NURZHOL_CROSSINGS[0] - CROSSING_HALF_LENGTH],
    [NURZHOL_CROSSINGS[0] + CROSSING_HALF_LENGTH,
      NURZHOL_CROSSINGS[1] - CROSSING_HALF_LENGTH],
    [NURZHOL_CROSSINGS[1] + CROSSING_HALF_LENGTH, NURZHOL_END],
  ] as const;

  for (const [section, [start, end]] of laneRanges.entries()) {
    const length = end - start;
    const along = (start + end) / 2;
    for (const side of [-1, 1] as const) {
      const [x, z] = nurzholPoint(along, side * NURZHOL_LANE_OFFSET);
      const ground = groundUnder(x, z).top;
      primitive(
        hardscape,
        `nurzhol:walk:${side}:${section}`,
        "stone",
        "groundTile",
        [x, ground + 0.06, z],
        [length, 0.12, NURZHOL_LANE_HALF_WIDTH * 2],
        GRANITE,
        {
          rotation: [0, RENDER_YAW, 0],
          textureProfile: "city-gray-pavers",
          bearingArea: length * NURZHOL_LANE_HALF_WIDTH * 2,
          volume: length * NURZHOL_LANE_HALF_WIDTH * 0.12,
          carriesAttachments: true,
          attachmentSupportMode: "cable",
          sideAttachmentReach: 0.35,
        },
      );
    }
  }

  for (const [crossing, along] of NURZHOL_CROSSINGS.entries()) {
    const [x, z] = nurzholPoint(along);
    const ground = groundUnder(x, z).top;
    primitive(
      hardscape,
      `nurzhol:crossing:${crossing}`,
      "stone",
      "groundTile",
      [x, ground + 0.06, z],
      [
        CROSSING_HALF_LENGTH * 2,
        0.12,
        (NURZHOL_LANE_OFFSET + NURZHOL_LANE_HALF_WIDTH) * 2,
      ],
      GRANITE_EDGE,
      {
        rotation: [0, RENDER_YAW, 0],
        textureProfile: "city-gray-pavers",
        bearingArea: CROSSING_HALF_LENGTH * 4
          * (NURZHOL_LANE_OFFSET + NURZHOL_LANE_HALF_WIDTH),
        volume: 0.22,
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.35,
      },
    );
  }
}

function createFlowerBeds(
  hardscape: MutableGroup,
  planting: MutableGroup,
): void {
  const colours = ["#d2b12f", "#a83d37", "#eee2c8", "#7b526f"] as const;
  for (const [bed, [start, end]] of NURZHOL_BED_SEGMENTS.entries()) {
    const length = end - start;
    const along = (start + end) / 2;
    const [x, z] = nurzholPoint(along);
    const ground = groundUnder(x, z).top;
    const totalWidth = NURZHOL_BED_HALF_WIDTH * 2;

    primitive(
      planting,
      `nurzhol:bed:${bed}:soil`,
      "soil",
      "stoneBlock",
      [x, ground + 0.17, z],
      [length - 0.34, 0.2, totalWidth - 0.34],
      BED_SOIL,
      {
        rotation: [0, RENDER_YAW, 0],
        bearingArea: Math.max(1, length * totalWidth * 0.6),
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.35,
        volume: length * totalWidth * 0.13,
      },
    );

    for (const side of [-1, 1] as const) {
      const [sideX, sideZ] = nurzholPoint(along, side * (NURZHOL_BED_HALF_WIDTH - 0.09));
      primitive(
        hardscape,
        `nurzhol:bed:${bed}:curb-side:${side}`,
        "stone",
        "stoneBlock",
        [sideX, ground + 0.19, sideZ],
        [length - 0.34, 0.28, 0.18],
        GRANITE_EDGE,
        {
          rotation: [0, RENDER_YAW, 0],
          bearingArea: length * 0.18,
          volume: length * 0.04,
        },
      );
    }
    for (const endAlong of [start, end] as const) {
      const [endX, endZ] = nurzholPoint(endAlong);
      primitive(
        hardscape,
        `nurzhol:bed:${bed}:curb-end:${endAlong === start ? "start" : "end"}`,
        "stone",
        "stoneBlock",
        [endX, ground + 0.19, endZ],
        [0.18, 0.28, totalWidth],
        GRANITE_EDGE,
        {
          rotation: [0, RENDER_YAW, 0],
          bearingArea: totalWidth * 0.18,
          volume: totalWidth * 0.04,
        },
      );
    }

    const columns = Math.max(5, Math.floor((length - 0.8) / 0.58));
    for (let column = 0; column < columns; column += 1) {
      const flowerAlong = start + 0.42 + (length - 0.84) * column / Math.max(1, columns - 1);
      for (let row = -1; row <= 1; row += 1) {
        const [flowerX, flowerZ] = nurzholPoint(flowerAlong, row * 0.67);
        primitive(
          planting,
          `nurzhol:bed:${bed}:flower:${column}:${row + 1}`,
          "foliage",
          "cylinder",
          [flowerX, ground + 0.38 + ((column + row + 3) % 2) * 0.025, flowerZ],
          [0.31, 0.22, 0.31],
          colours[(bed * 2 + column + row + 4) % colours.length],
          {
            bearsLoad: false,
            volume: 0.012,
            sideAttachmentReach: 0.18,
          },
        );
      }
    }
  }
}

function createParterreLamps(fittings: MutableGroup): void {
  for (const [station, along] of LAMP_ALONG.entries()) {
    for (const side of [-1, 1] as const) {
      const [x, z] = nurzholPoint(along, side * LAMP_ACROSS);
      const ground = groundUnder(x, z).top;
      primitive(
        fittings,
        `nurzhol:lamp:${station}:${side}:base`,
        "stone",
        "cylinder",
        [x, ground + 0.09, z],
        [0.52, 0.18, 0.52],
        GRANITE,
        { bearingArea: 0.2, volume: 0.035 },
      );
      primitive(
        fittings,
        `nurzhol:lamp:${station}:${side}:pole`,
        "steel",
        "cylinder",
        [x, ground + 2.2, z],
        [0.1, 4.24, 0.1],
        LAMP_METAL,
        {
          bearingArea: 0.01,
          carriesAttachments: true,
          attachmentSupportMode: "cable",
          sideAttachmentReach: 0.35,
          volume: 0.06,
        },
      );
      primitive(
        fittings,
        `nurzhol:lamp:${station}:${side}:head`,
        "steel",
        "cylinder",
        [x, ground + 4.31, z],
        [0.72, 0.12, 0.72],
        LAMP_METAL,
        {
          bearsLoad: false,
          volume: 0.04,
          sideAttachmentReach: 0.35,
          light: {
            color: LAMP_LIGHT,
            distance: 13,
            intensity: 1.65,
            position: [0, -0.18, 0],
            dayIntensityFactor: 0,
            poolPriority: 3,
            localPoolCapacity: LAMP_ALONG.length * 2,
            poolGroupId: LAMP_GROUP,
            transition: { fadeInSeconds: 1.1, fadeOutSeconds: 1.5 },
          },
        },
      );
    }
  }
}

export function createAstanaParterre(
  hardscape: MutableGroup,
  planting: MutableGroup,
  fittings: MutableGroup,
): void {
  createDirectedWalkways(hardscape);
  createFlowerBeds(hardscape, planting);
  createParterreLamps(fittings);
}
