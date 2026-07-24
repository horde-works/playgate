import type { BreakableMaterial } from "./destructionScene";

export interface MaterialAppearanceProfile {
  readonly textureScale: number;
  readonly macroVariation: number;
  readonly roughnessVariation: number;
  readonly edgeWear: number;
  readonly groundDampness: number;
  readonly topLightening: number;
  readonly sideTint: readonly [number, number, number];
  readonly directionalGrain?: boolean;
  /**
   * 0..1 — how strongly rain leaves glossy puddle splotches on upward faces.
   * Actual gloss is gated at runtime by baked sky visibility (no puddles
   * under roofs) and the scene-wide wetness state.
   */
  readonly wetness: number;
  /**
   * 0..1 — weathering streaks running down vertical faces from their top
   * edges (soot, dust and rain residue).
   */
  readonly streaking: number;
}

const neutralSideTint = [1, 1, 1] as const;

/**
 * Optical surface behaviour, deliberately kept separate from structural
 * strength. Values describe real-world metres rather than per-box UVs so a
 * surface keeps the same visual scale before and after it breaks.
 */
export const materialAppearanceProfiles: Record<
  BreakableMaterial,
  MaterialAppearanceProfile
> = {
  brick: {
    textureScale: 0.72,
    macroVariation: 0.08,
    roughnessVariation: 0.07,
    edgeWear: 0.035,
    groundDampness: 0.08,
    topLightening: 0.015,
    sideTint: neutralSideTint,
    wetness: 0.35,
    streaking: 0.5,
  },
  wood: {
    textureScale: 0.62,
    macroVariation: 0.1,
    roughnessVariation: 0.11,
    edgeWear: 0.055,
    groundDampness: 0.055,
    topLightening: 0.025,
    sideTint: neutralSideTint,
    directionalGrain: true,
    wetness: 0.15,
    streaking: 0.3,
  },
  cloth: {
    textureScale: 0.22,
    macroVariation: 0.08,
    roughnessVariation: 0.16,
    edgeWear: 0.02,
    groundDampness: 0.1,
    topLightening: 0.018,
    sideTint: [0.94, 0.9, 0.82],
    directionalGrain: true,
    wetness: 0.48,
    streaking: 0.35,
  },
  plaster: {
    textureScale: 0.5,
    macroVariation: 0.065,
    roughnessVariation: 0.045,
    edgeWear: 0.028,
    groundDampness: 0.09,
    topLightening: 0.018,
    sideTint: neutralSideTint,
    wetness: 0.2,
    streaking: 0.8,
  },
  plastic: {
    textureScale: 0.55,
    macroVariation: 0.03,
    roughnessVariation: 0.05,
    edgeWear: 0.02,
    groundDampness: 0.05,
    topLightening: 0.02,
    sideTint: neutralSideTint,
    wetness: 0.5,
    streaking: 0.25,
  },
  concrete: {
    textureScale: 0.58,
    macroVariation: 0.075,
    roughnessVariation: 0.065,
    edgeWear: 0.045,
    groundDampness: 0.11,
    topLightening: 0.025,
    sideTint: neutralSideTint,
    wetness: 0.6,
    streaking: 0.7,
  },
  glass: {
    textureScale: 0.4,
    macroVariation: 0.015,
    roughnessVariation: 0.018,
    edgeWear: 0,
    groundDampness: 0,
    topLightening: 0,
    sideTint: neutralSideTint,
    wetness: 0.0,
    streaking: 0.0,
  },
  steel: {
    textureScale: 0.78,
    macroVariation: 0.055,
    roughnessVariation: 0.16,
    edgeWear: 0.085,
    groundDampness: 0.045,
    topLightening: 0.03,
    sideTint: neutralSideTint,
    directionalGrain: true,
    wetness: 0.3,
    streaking: 0.6,
  },
  stone: {
    textureScale: 0.46,
    macroVariation: 0.105,
    roughnessVariation: 0.08,
    edgeWear: 0.04,
    groundDampness: 0.13,
    topLightening: 0.04,
    sideTint: [0.94, 0.95, 0.94],
    wetness: 0.55,
    streaking: 0.55,
  },
  basalt: {
    textureScale: 0.42,
    macroVariation: 0.12,
    roughnessVariation: 0.1,
    edgeWear: 0.052,
    groundDampness: 0.16,
    topLightening: 0.045,
    sideTint: [0.91, 0.94, 0.95],
    wetness: 0.5,
    streaking: 0.6,
  },
  graphiteStone: {
    textureScale: 0.48,
    macroVariation: 0.095,
    roughnessVariation: 0.09,
    edgeWear: 0.062,
    groundDampness: 0.14,
    topLightening: 0.038,
    sideTint: [0.93, 0.95, 0.96],
    wetness: 0.5,
    streaking: 0.65,
  },
  darkGlass: {
    textureScale: 0.44,
    macroVariation: 0.018,
    roughnessVariation: 0.025,
    edgeWear: 0,
    groundDampness: 0,
    topLightening: 0,
    sideTint: neutralSideTint,
    wetness: 0.0,
    streaking: 0.0,
  },
  foliage: {
    textureScale: 0.78,
    macroVariation: 0.2,
    roughnessVariation: 0.12,
    edgeWear: 0,
    groundDampness: 0.04,
    topLightening: 0.05,
    sideTint: [0.74, 0.86, 0.69],
    wetness: 0.1,
    streaking: 0.0,
  },
  grass: {
    textureScale: 0.66,
    macroVariation: 0.16,
    roughnessVariation: 0.09,
    edgeWear: 0,
    groundDampness: 0.07,
    topLightening: 0.035,
    sideTint: [0.5, 0.39, 0.25],
    wetness: 0.4,
    streaking: 0.0,
  },
  soil: {
    textureScale: 0.56,
    macroVariation: 0.14,
    roughnessVariation: 0.08,
    edgeWear: 0,
    groundDampness: 0.12,
    topLightening: 0.018,
    sideTint: [0.83, 0.76, 0.64],
    wetness: 0.7,
    streaking: 0.0,
  },
  earth: {
    textureScale: 0.5,
    macroVariation: 0.15,
    roughnessVariation: 0.09,
    edgeWear: 0.01,
    groundDampness: 0.13,
    topLightening: 0.022,
    sideTint: [0.82, 0.75, 0.64],
    wetness: 0.75,
    streaking: 0.0,
  },
  asphalt: {
    textureScale: 0.48,
    macroVariation: 0.075,
    roughnessVariation: 0.07,
    edgeWear: 0.025,
    groundDampness: 0.085,
    topLightening: 0.012,
    sideTint: neutralSideTint,
    wetness: 0.85,
    streaking: 0.1,
  },
};

export function materialAnchor(
  position: readonly [number, number, number],
  localCenter: readonly [number, number, number] = [0, 0, 0],
): readonly [number, number, number] {
  return [
    position[0] + localCenter[0],
    position[1] + localCenter[1],
    position[2] + localCenter[2],
  ];
}
