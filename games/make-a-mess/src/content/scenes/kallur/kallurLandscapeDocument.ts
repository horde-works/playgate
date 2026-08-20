import type { LandscapeDocument } from "../../landscape/landscapeDocument.ts";
import {
  bakeLandscapeLattice,
  compileLandscapeIndexedCollider,
  createLatticeSampler,
} from "../../landscape/landscapeLattice.ts";
import { KALLUR_TONAL_MASSES } from "../../landscape/naturalSurfaceCascade.ts";
import {
  compileLandscapeMesh,
  compileVoxelSmoothedLandscape,
  LANDSCAPE_RENDER_PROFILES,
} from "../../landscape/landscapeMesher.ts";
import { createLandscapeSampler } from "../../landscape/landscapeSampler.ts";
import {
  generateKallurStones,
  kallurStoneBumps,
} from "./kallurStoneField.ts";
import {
  KALLUR_PADS,
  KALLUR_PATH,
  KALLUR_SHORELINE,
  KALLUR_ZONES,
} from "./kallurTerrainPlan.ts";

export const KALLUR_BASE_ELEVATION = 2.4;

/**
 * Kallur landscape — the first world where relief is the protagonist.
 *
 * The wall crown at +88 over a 2.4 m coast is authored through the same
 * schema the polder pioneered; steepness is nothing but blendWidth. Detail
 * layers (hummocks, terracettes, stone collars) are authored in the sampler
 * and baked to a lattice: render, collider, grass, tint and the slope-law
 * map read that grid.
 *
 * Built in two passes: the base field first, then the stone field scattered
 * over it, and its turf collars folded back in as reliefBumps. Stones and
 * hummocks are one spectrum (bible §III): a swallowed stone IS a mound.
 */
const kallurBaseDocument: LandscapeDocument = {
  schemaVersion: 1,
  id: "kallur-landscape",
  boundary: KALLUR_SHORELINE,
  baseElevation: KALLUR_BASE_ELEVATION,
  elevationAreas: KALLUR_ZONES.map((zone) => ({
    id: zone.id,
    elevation: zone.elevation,
    polygon: zone.polygon,
    blendWidth: zone.blendWidth,
  })),
  flatPads: KALLUR_PADS.map((pad) => ({
    id: pad.id,
    center: pad.center,
    yaw: pad.yaw,
    halfExtents: pad.halfExtents,
    elevation: pad.elevation,
    shoulder: pad.shoulder,
  })),
  corridors: [
    {
      id: "coast-to-lighthouse",
      points: KALLUR_PATH,
      width: 1.15,
      feather: 1.4,
      surface: "path",
      conformsTerrainToGrade: true,
      maximumCrossSlope: 0.55,
      // A mountain path is a bench in the slope, not a valley through it.
      maximumGradeReach: 9,
    },
  ],
  dryChannels: [],
  // The octave the field was missing (bible §IV, carpet-lab verdict 5):
  // between the 2.6 m hummocks and the 15-42 m zone blends there was a
  // spectral gap, and the mid ring read uniformly rough. These broad
  // swells group the hummocks into the lit and shaded families that
  // compose the reference's middle distance. Numbers come from the ONE
  // source of the carpet law, ported verbatim from lab tile Y.
  tonalMasses: KALLUR_TONAL_MASSES,
  mesoRelief: {
    // Hummocks: the "fur" of the slope. Wavelength stays well above the
    // 0.75 m render pitch so the lattice can actually carry the bumps.
    wavelength: 2.6,
    amplitude: 0.26,
    slopeGain: 0.3,
    maximumAmplitude: 0.6,
    seed: 7,
  },
  terracettes: {
    // Sheep benches appear only past a 0.45 gradient — the wall flank and
    // the steeper hill sides, never the strolling ground.
    minimumGradient: 0.45,
    verticalSpacing: 1.15,
    amplitude: 0.2,
    alongWavelength: 7,
    seed: 3,
  },
  water: "none",
};

const kallurBaseSampler = createLandscapeSampler(kallurBaseDocument);

/** One deterministic stone spectrum: mounds, crowns and boulders (§5.4). */
export const kallurStones = generateKallurStones(kallurBaseSampler);

export const kallurLandscapeDocument: LandscapeDocument = {
  ...kallurBaseDocument,
  reliefBumps: kallurStoneBumps(kallurStones),
};

/**
 * Authored function — used once to fill the lattice. Runtime height, grass,
 * tint and the slope-law map read the bake.
 */
const kallurAuthoredSampler = createLandscapeSampler(kallurLandscapeDocument);

/** Function sampler — tests of the authored field, and the one-time bake. */
export { kallurAuthoredSampler };

export const kallurLandscapeLattice = bakeLandscapeLattice(
  kallurAuthoredSampler,
  kallurLandscapeDocument,
  LANDSCAPE_RENDER_PROFILES["kallur-turf"].pitch,
);

export const kallurLandscapeSampler = createLatticeSampler(kallurLandscapeLattice);

export const kallurIndexedCollider = compileLandscapeIndexedCollider(
  kallurLandscapeLattice,
);

/**
 * Visual and collider lattice: the fine 0.75 m profile. This is where the
 * hummocks live; the polder's coarser voxel-smoothed skin cannot carry them.
 */
export const kallurRenderMesh = compileLandscapeMesh(
  kallurLandscapeDocument,
  LANDSCAPE_RENDER_PROFILES["kallur-turf"],
  kallurLandscapeSampler,
);

/**
 * Structural earth body: adaptive foundation boxes. The world is
 * indestructible, so these cells exist purely as ground for props to stand
 * on — they are never visible and never split by damage.
 */
export const kallurEarthMesh = compileVoxelSmoothedLandscape(
  kallurLandscapeDocument,
  {
    minimumCellSize: 4,
    maximumCellSize: 16,
    chunkSize: 24,
    flatHeightTolerance: 0.6,
    sampler: kallurLandscapeSampler,
  },
);

export const kallurEarthPieceId = (cellId: string) =>
  `kallur:terrain:cell:${cellId}:piece`;

/** Exact field height; the render lattice samples this very function. */
export function kallurGroundTopAt(x: number, z: number): number {
  return kallurLandscapeSampler.elevationAt(x, z);
}

const earthBucketSize = kallurEarthMesh.maximumCellSize;
const earthCellsByBucket = new Map<
  string,
  Array<(typeof kallurEarthMesh.cells)[number]>
>();
for (const cell of kallurEarthMesh.cells) {
  const half = cell.size / 2;
  const minBucketX = Math.floor((cell.center[0] - half - 1e-6) / earthBucketSize);
  const maxBucketX = Math.floor((cell.center[0] + half + 1e-6) / earthBucketSize);
  const minBucketZ = Math.floor((cell.center[1] - half - 1e-6) / earthBucketSize);
  const maxBucketZ = Math.floor((cell.center[1] + half + 1e-6) / earthBucketSize);
  for (let bucketX = minBucketX; bucketX <= maxBucketX; bucketX += 1) {
    for (let bucketZ = minBucketZ; bucketZ <= maxBucketZ; bucketZ += 1) {
      const key = `${bucketX}:${bucketZ}`;
      const bucket = earthCellsByBucket.get(key) ?? [];
      bucket.push(cell);
      earthCellsByBucket.set(key, bucket);
    }
  }
}

/** Smallest adaptive earth cell containing the point, if any. */
export function kallurEarthCellAt(x: number, z: number) {
  let best: (typeof kallurEarthMesh.cells)[number] | undefined;
  const bucket = earthCellsByBucket.get(
    `${Math.floor(x / earthBucketSize)}:${Math.floor(z / earthBucketSize)}`,
  ) ?? [];
  for (const cell of bucket) {
    if (
      Math.abs(x - cell.center[0]) <= cell.size / 2 + 1e-6 &&
      Math.abs(z - cell.center[1]) <= cell.size / 2 + 1e-6 &&
      (!best || cell.size < best.size)
    ) {
      best = cell;
    }
  }
  return best;
}
