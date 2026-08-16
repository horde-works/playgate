import type { LandscapeDocument } from "../../landscape/landscapeDocument.ts";
import {
  compileLandscapeMesh,
  compileVoxelSmoothedLandscape,
  LANDSCAPE_RENDER_PROFILES,
} from "../../landscape/landscapeMesher.ts";
import { createLandscapeSampler } from "../../landscape/landscapeSampler.ts";
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
 * schema the polder pioneered; steepness is nothing but blendWidth. The
 * detail layers (hummocks, terracettes) live in the sampler itself, so the
 * render mesh, the trimesh collider and every later consumer — grass,
 * boulder scatter, walkability probes — read one identical field.
 */
export const kallurLandscapeDocument: LandscapeDocument = {
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
  mesoRelief: {
    // Hummocks: the "fur" of the slope. Wavelength stays well above the
    // 0.75 m render pitch so the lattice can actually carry the bumps.
    wavelength: 2.6,
    amplitude: 0.2,
    slopeGain: 0.22,
    maximumAmplitude: 0.45,
    seed: 7,
  },
  terracettes: {
    // Sheep benches appear only past a 0.45 gradient — the wall flank and
    // the steeper hill sides, never the strolling ground.
    minimumGradient: 0.45,
    verticalSpacing: 1.15,
    amplitude: 0.14,
    alongWavelength: 7,
    seed: 3,
  },
  water: "none",
};

export const kallurLandscapeSampler = createLandscapeSampler(
  kallurLandscapeDocument,
);

/**
 * Visual and collider lattice: the fine 0.75 m profile. This is where the
 * hummocks live; the polder's coarser voxel-smoothed skin cannot carry them.
 */
export const kallurRenderMesh = compileLandscapeMesh(
  kallurLandscapeDocument,
  LANDSCAPE_RENDER_PROFILES.smooth,
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
  },
);

export const kallurEarthPieceId = (cellId: string) =>
  `kallur:terrain:cell:${cellId}:piece`;

/** Exact field height; the render lattice samples this very function. */
export function kallurGroundTopAt(x: number, z: number): number {
  return kallurLandscapeSampler.elevationAt(x, z);
}
