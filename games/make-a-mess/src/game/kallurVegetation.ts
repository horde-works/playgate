import { valueNoise } from "../content/landscape/landscapeSampler.ts";
import {
  kallurLandscapeSampler,
} from "../content/scenes/kallur/kallurLandscapeDocument.ts";

/**
 * Kallur turf blades — the near ring of the turf plan (kallur-brief.md §5.3).
 *
 * Blades scatter in clumps, not as an even carpet: one noise owns both the
 * clump density and the blade height, so a thick spot reads as a grown tuft
 * rather than a denser sprinkle. Dryness rides the same patch noise as the
 * ground tint's sunlit-yellow mottling, so straw-coloured blades stand
 * exactly where the ground beneath them turns yellow — the two rings agree
 * by construction, which is what keeps the hand-off invisible.
 */

export interface KallurTurfStyle {
  /** Probability gate the scatter rolls against. */
  readonly keep: number;
  /** Shared clump value in [0, 1]; height correlates with it. */
  readonly clump: number;
  /** Field height under the blade. */
  readonly groundY: number;
  /** Chance this blade is last year's straw. */
  readonly dryness: number;
}

export function kallurTurfStyleAt(x: number, z: number): KallurTurfStyle | null {
  const sample = kallurLandscapeSampler.sample(x, z);
  if (sample.groundKind !== "land") return null;

  const epsilon = 1.2;
  const gradient = Math.hypot(
    (kallurLandscapeSampler.elevationAt(x + epsilon, z) -
      kallurLandscapeSampler.elevationAt(x - epsilon, z)) / (2 * epsilon),
    (kallurLandscapeSampler.elevationAt(x, z + epsilon) -
      kallurLandscapeSampler.elevationAt(x, z - epsilon)) / (2 * epsilon),
  );
  // Blades live on walkable turf; past this the slope hands over to the
  // tint's grass-to-rock transition and blades would float over stone.
  if (gradient > 1.05) return null;

  const clump = 0.5 + 0.5 * valueNoise(x / 3.4, z / 3.4, 19);
  const steep = Math.min(1, Math.max(0, (gradient - 0.7) / 0.35));
  const keep = (0.22 + clump * 0.9) *
    (1 - sample.pathWeight * 0.92) *
    (1 - steep * 0.55);

  // Same lattice as the ground tint's lit patches (wavelength 29, seed 87):
  // straw blades and yellow ground appear together or not at all.
  const litPatch = valueNoise(x / 29, z / 29, 87);
  const dryness = Math.min(1, Math.max(0, 0.14 + Math.max(0, litPatch) * 0.55));

  return {
    keep,
    clump,
    groundY: kallurLandscapeSampler.elevationAt(x, z) + 0.02,
    dryness,
  };
}
