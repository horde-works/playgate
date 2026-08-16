import type {
  LandscapePoint2,
  LandscapePoint3,
} from "../../landscape/landscapeDocument.ts";

/**
 * Kallur terrain plan — the authored geography of the Faroe rest island.
 *
 * Composition contract (docs/kallur-brief.md §4): the hero view stands on the
 * path in the south-west, looks across the lighthouse hill toward the wall
 * massif in the north, with the fog sea open to the east. One big gesture,
 * no radial symmetry: the wall is a single massif, not a ring.
 *
 * Vertical program: coast 2.4 → saddle ~13 → lighthouse hill ~21 → wall
 * shoulder ~44 → wall crown ~88. Wall relief above the coast ≥ 85 m and the
 * 7 m lighthouse against it keeps the reference's "human : inhuman" ratio.
 */

/** Irregular shoreline, counter-clockwise. The north edge hugs the wall. */
export const KALLUR_SHORELINE: readonly LandscapePoint2[] = [
  [118, 8],
  [98, -38],
  [72, -78],
  [34, -102],
  [4, -108],
  [-28, -98],
  [-58, -80],
  [-86, -52],
  [-104, -16],
  [-108, 22],
  [-88, 58],
  [-58, 84],
  [-22, 100],
  [12, 102],
  [52, 88],
  [86, 54],
  [106, 26],
];

export interface KallurZone {
  readonly id: string;
  readonly elevation: number;
  readonly blendWidth: number;
  readonly polygon: readonly LandscapePoint2[];
}

/**
 * Ordered overlays, low to high, exactly as the sampler consumes them: each
 * later zone owns its own embankment against everything beneath it.
 */
export const KALLUR_ZONES: readonly KallurZone[] = [
  {
    // Rolling western approach the path climbs before the saddle.
    id: "west-approach",
    elevation: 9,
    blendWidth: 26,
    polygon: [
      [-96, -18],
      [-64, -44],
      [-30, -20],
      [-36, 18],
      [-70, 40],
      [-96, 16],
    ],
  },
  {
    // The saddle linking the lighthouse hill to the wall flank.
    id: "ridge-saddle",
    elevation: 13,
    blendWidth: 18,
    polygon: [
      [-20, -16],
      [6, -26],
      [22, -12],
      [8, 6],
      [-14, 8],
    ],
  },
  {
    // The lighthouse hill: a soft dome, its top levelled by the pad below.
    id: "lighthouse-hill",
    elevation: 21,
    blendWidth: 15,
    polygon: [
      [-26, -2],
      [-8, -12],
      [6, 0],
      [-2, 16],
      [-20, 14],
    ],
  },
  {
    // The broad grass flank of the massif: steep, hummocked, terracetted.
    id: "wall-shoulder",
    elevation: 44,
    blendWidth: 42,
    polygon: [
      [-26, -90],
      [50, -88],
      [78, -62],
      [68, -34],
      [28, -18],
      [-12, -26],
      [-36, -58],
    ],
  },
  {
    // The crown. Its seaward face is near-vertical in the field and will be
    // clad with layered strata pieces; the inland face reads as steep grass.
    id: "wall-crown",
    elevation: 88,
    blendWidth: 24,
    polygon: [
      [-6, -96],
      [38, -92],
      [66, -74],
      [58, -52],
      [30, -40],
      [0, -52],
      [-16, -76],
    ],
  },
];

/**
 * The single walking route: south coast spawn → western climb → saddle →
 * a spiral onto the lighthouse hill. Grades are authored ≤ 0.35 rise/run;
 * the terrain conforms to the route, not the other way around.
 */
export const KALLUR_PATH: readonly LandscapePoint3[] = [
  [-20, 3.0, 88],
  [-34, 4.6, 66],
  [-44, 7.2, 44],
  [-40, 9.6, 24],
  [-30, 11.6, 8],
  [-18, 13.2, -10],
  [-2, 14.4, -10],
  [6, 16.0, 0],
  [2, 18.0, 10],
  [-6, 19.8, 13],
  [-12, 20.4, 8],
];

export interface KallurPad {
  readonly id: string;
  readonly center: LandscapePoint2;
  readonly yaw: number;
  readonly halfExtents: LandscapePoint2;
  readonly elevation: number;
  readonly shoulder: number;
}

export const KALLUR_PADS: readonly KallurPad[] = [
  {
    // The lighthouse stands on a small levelled crown, fence line included.
    id: "lighthouse-pad",
    center: [-13, 5],
    yaw: 0.42,
    halfExtents: [3.6, 3.2],
    elevation: 20.6,
    shoulder: 2.6,
  },
  {
    // Arrival terrace at the south coast: the player's first firm ground.
    id: "spawn-terrace",
    center: [-19, 90],
    yaw: -0.35,
    halfExtents: [3.4, 3.0],
    elevation: 2.9,
    shoulder: 2.6,
  },
];

/** Hero-view anchor: where the reference-01 camera roughly stands. */
export const KALLUR_HERO_VIEW = {
  position: [-40, 11.4, 30] as const,
  lookAt: [30, 46, -58] as const,
};
