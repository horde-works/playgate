import { defineHumanPopulationProfile } from "../../game/humanPopulationProfile.ts";
import { townSettlement } from "../scenes/townSettlement.ts";
import { vikingSettlement } from "../scenes/vikingSettlement.ts";

/** Earth dyes and worn wool; values are linear multipliers in the cloth shader. */
const VILLAGE_DYES: readonly (readonly [number, number, number])[] = [
  [0.24, 0.18, 0.13],
  [0.38, 0.31, 0.22],
  [0.2, 0.22, 0.23],
  [0.3, 0.26, 0.17],
  [0.47, 0.42, 0.32],
  [0.36, 0.17, 0.13],
  [0.22, 0.26, 0.2],
  [0.17, 0.2, 0.27],
  [0.32, 0.24, 0.15],
  [0.14, 0.13, 0.12],
];

/** Faded factory cloth of the first-island city, without synthetic neon. */
const FIRST_ISLAND_CITY_DYES: readonly (readonly [number, number, number])[] = [
  [0.26, 0.27, 0.29],
  [0.19, 0.22, 0.31],
  [0.33, 0.28, 0.22],
  [0.24, 0.29, 0.24],
  [0.42, 0.38, 0.31],
  [0.35, 0.19, 0.19],
  [0.21, 0.2, 0.22],
  [0.3, 0.31, 0.34],
  [0.38, 0.32, 0.18],
  [0.16, 0.18, 0.2],
  [0.45, 0.36, 0.26],
  [0.28, 0.23, 0.28],
];

export const villageHumanProfile = defineHumanPopulationProfile({
  id: "village",
  bodyType: "human",
  species: "human",
  settlement: vikingSettlement,
  appearance: {
    variants: [
      { id: "fair-blond", skin: "#efc7a8", hair: "#b79559", weight: 1.25 },
      { id: "fair-auburn", skin: "#e7b793", hair: "#8a4d2c", weight: 1 },
      { id: "warm-brown", skin: "#d59a74", hair: "#583827", weight: 1.35 },
      { id: "weathered-dark", skin: "#bd7c5d", hair: "#2c231e", weight: 0.65 },
    ],
    wardrobe: {
      dyes: VILLAGE_DYES,
      wearSpread: 1,
      grimeByRole: { smith: 0.3, fisher: 0.3, brewer: 0.3, elder: -0.1 },
    },
  },
  professions: {
    weaver: { skills: ["weave", "haul", "carry", "stack"] },
    brewer: { skills: ["brew", "haul", "carry", "stack"] },
    fisher: { skills: ["fish", "scrub", "hang", "carry", "stack"] },
    smith: { skills: ["forge", "scrub", "carry", "stack"], startleGain: 0.7 },
    herder: { skills: ["herd", "haul", "carry", "stack"], startleGain: 0.9 },
    gardener: { skills: ["garden", "dig", "carry", "stack"] },
    elder: {
      skills: ["settlement-leadership", "investigate-disturbance"],
      startleGain: 0.6,
    },
    hand: { skills: ["general-labour", "chop", "carry", "stack", "feed"] },
    housekeeper: {
      skills: ["housekeeping", "haul", "scrub", "hang", "carry", "stack", "feed"],
    },
  },
});

export const firstIslandCityHumanProfile = defineHumanPopulationProfile({
  id: "first-island-city",
  bodyType: "human",
  species: "human",
  settlement: townSettlement,
  appearance: {
    variants: [
      { id: "light-dark-hair", skin: "#edc3a5", hair: "#30251f", weight: 1.2 },
      { id: "warm-brown-hair", skin: "#dca17b", hair: "#563829", weight: 1.4 },
      { id: "olive-dark-hair", skin: "#c98a68", hair: "#251d1a", weight: 1.35 },
      { id: "brown-dark-hair", skin: "#ad6d52", hair: "#211a18", weight: 0.9 },
      { id: "deep-brown", skin: "#85513f", hair: "#181414", weight: 0.45 },
      { id: "light-brown-hair", skin: "#e4b28d", hair: "#76543a", weight: 0.7 },
    ],
    wardrobe: {
      dyes: FIRST_ISLAND_CITY_DYES,
      wearSpread: 0.6,
      grimeByRole: { driver: 0.28, worker: 0.24, yardkeeper: 0.2, pensioner: -0.08 },
    },
  },
  professions: {
    pensioner: { skills: ["household-routine", "observe-neighbourhood"], startleGain: 0.9 },
    homemaker: { skills: ["housekeeping", "carry", "scrub", "hang"] },
    worker: { skills: ["general-labour", "carry", "stack"], startleGain: 0.9 },
    child: { skills: ["play", "explore-near-home"] },
    teen: { skills: ["explore-neighbourhood", "carry"] },
    trader: { skills: ["trade", "carry"] },
    driver: { skills: ["drive-road-vehicle", "maintain-vehicle", "carry"], startleGain: 0.8 },
    yardkeeper: { skills: ["groundskeeping", "carry", "stack"], startleGain: 0.9 },
  },
});

/** Deliberately closed for now: adding a third profile is a product decision. */
export const humanPopulationProfiles = [
  villageHumanProfile,
  firstIslandCityHumanProfile,
] as const;
