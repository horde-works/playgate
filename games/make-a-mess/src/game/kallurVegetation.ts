import {
  KALLUR_STRAND_LAW,
  kallurCascadeNoise,
  kallurCascadeRidgeAt,
} from "../content/landscape/naturalSurfaceCascade.ts";
import {
  kallurLandscapeSampler,
} from "../content/scenes/kallur/kallurLandscapeDocument.ts";

/**
 * Kallur standing strands — the last octave of the carpet, not a second lawn.
 *
 * Walkable turf always carries some locks so the near ring is a field, not
 * fifty wires. Cascade octaves 3–4 thicken the crests. Path and cliff refuse.
 */

export interface KallurTurfStyle {
  readonly keep: number;
  readonly clump: number;
  readonly groundY: number;
  readonly dryness: number;
  readonly leanX: number;
  readonly leanZ: number;
}

function smoother01(edge0: number, edge1: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function kallurTurfStyleAt(x: number, z: number): KallurTurfStyle | null {
  const sample = kallurLandscapeSampler.sample(x, z);
  if (sample.groundKind !== "land") return null;

  const gradient = kallurLandscapeSampler.gradientAt(x, z);
  const slope = Math.hypot(gradient.x, gradient.z);
  if (slope > 1.05) return null;

  const ridge = kallurCascadeRidgeAt(x, z);
  const onCrest = smoother01(
    KALLUR_STRAND_LAW.ridgeStart,
    KALLUR_STRAND_LAW.ridgeEnd,
    ridge,
  );
  const steep = Math.min(1, Math.max(0, (slope - 0.7) / 0.35));
  const keep = (0.38 + onCrest * 0.62) *
    (1 - sample.pathWeight * 0.94) *
    (1 - steep * 0.7);
  if (keep <= 0.02) return null;

  const litPatch = kallurCascadeNoise(x / 2.9, z / 2.9, 87);
  const dryness = Math.min(1, Math.max(0, 0.14 + Math.max(0, litPatch) * 0.55));

  const lean = Math.min(0.28, slope * 0.2) * (0.35 + onCrest * 0.65);
  const leanX = slope > 0.02 ? (gradient.x / slope) * lean : 0;
  const leanZ = slope > 0.02 ? (gradient.z / slope) * lean : 0;

  return {
    keep,
    clump: 0.35 + ridge * 0.65,
    groundY: sample.elevation + 0.015,
    dryness,
    leanX,
    leanZ,
  };
}
