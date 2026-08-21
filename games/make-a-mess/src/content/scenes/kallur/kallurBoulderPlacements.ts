import {
  buildBoulderArchetype,
  KALLUR_BOULDER_ARCHETYPES,
} from "../../objects/kallur/kallurBoulderKitObject.ts";
import {
  kallurGroundTopAt,
  kallurLandscapeSampler,
  kallurStones,
} from "./kallurLandscapeDocument.ts";
import { kallurVisibleStones } from "./kallurStoneField.ts";

/**
 * One placement law for the boulder ARCHETYPES (accepted kit a02): the
 * same deterministic stone field that used to seat the box crowns now
 * seats archetype instances. The scene keeps the invisible box pieces as
 * colliders and support ("залезть и посидеть" unchanged); the renderer
 * draws six InstancedMesh — matrices computed ONCE here, never per frame
 * and never per launch beyond this arithmetic (1700 rows of trigonometry).
 */

export interface KallurBoulderPlacement {
  readonly id: string;
  readonly archetype: string;
  readonly position: readonly [number, number, number];
  readonly rotation: readonly [number, number, number];
  readonly scale: readonly [number, number, number];
  /** instanceColor RATIO against the body colour: strata tones, dark→mid. */
  readonly tint: readonly [number, number, number];
}

/** The body colour of every boulder: the escarpment's own basalt family.
 * Deliberately NOT equal to any wall stratum string, so the render
 * material owns a private cache entry. */
export const KALLUR_BOULDER_BODY_COLOUR = "#565b55";

/** Nominal bbox height of each archetype at unit scale, measured once. */
const archetypeHeights: ReadonlyMap<string, number> = new Map(
  KALLUR_BOULDER_ARCHETYPES.map((archetype) => {
    const geometry = buildBoulderArchetype(archetype);
    let top = 0;
    for (const [, y] of geometry.vertices) top = Math.max(top, y);
    return [archetype.id, top];
  }),
);

/** Deterministic archetype pick from the stone's own numbers AND the
 * ground it stands on: a columnar stub cannot balance on a hillside, and
 * steep ground carries lying forms only (Igor, физика положения). */
export function kallurBoulderArchetypeFor(stone: {
  readonly size: number;
  readonly tone: number;
}, slope = 0): string {
  if (stone.size < 0.45) return "loaf";
  const pick = (stone.tone * 13.7) % 1;
  // Slopes carry the full mix — during the mountain's formation stones
  // stayed on slopes, folds, tops and hollows alike (Igor, 21.08). The one
  // true physical gate: a columnar stub cannot balance on steep ground.
  if (pick < 0.26) return "rounded";
  if (pick < 0.48) return "slab";
  if (pick < 0.62) return "twin";
  if (pick < 0.8) {
    if (slope < 0.5 && stone.size < 1.4) return "column";
    return "split";
  }
  return "split";
}

let cached: readonly KallurBoulderPlacement[] | null = null;

export function kallurBoulderPlacements(): readonly KallurBoulderPlacement[] {
  if (cached) return cached;
  const placements: KallurBoulderPlacement[] = [];
  // Strata ratios against the body colour #565b55 (linear-free: ratios of
  // sRGB components track closely at these small spans).
  const tintFor = (tone: number): readonly [number, number, number] => {
    const target = tone > 0.72
      ? [0x7c, 0x7f, 0x74]
      : tone > 0.35
        ? [0x5d, 0x61, 0x5c]
        : [0x47, 0x4e, 0x48];
    return [target[0] / 0x56, target[1] / 0x5b, target[2] / 0x55];
  };
  for (const stone of kallurVisibleStones(kallurStones)) {
    const collarTop = kallurGroundTopAt(stone.x, stone.z);
    const gradient = kallurLandscapeSampler.gradientAt(stone.x, stone.z);
    const slope = Math.hypot(gradient.x, gradient.z);
    const crownHeight = stone.size * (1 - stone.embed) * 0.9 + 0.15;
    const archetype = kallurBoulderArchetypeFor(stone, slope);
    const nominalHeight = archetypeHeights.get(archetype) ?? 1;
    const scaleXZ = stone.size * 0.98;
    const scaleY = Math.max(0.3, (crownHeight + 0.35) / nominalHeight);
    // Attitude: each stone decides HOW it stayed on the hill. High
    // attitude — it lies bedded along the ground; low attitude — it sits
    // nearly upright, wedged into a fold, and buries deeper instead. The
    // impossible thing was never "a stone on a slope" — it was a rim
    // hovering over the falling ground, and that is what the sink covers.
    const attitude = 0.35 + ((stone.tone * 29.3) % 1) * 0.65;
    const tiltLimit = 0.6;
    const tiltX = Math.max(-tiltLimit, Math.min(tiltLimit,
      Math.atan(gradient.z) * attitude + (stone.tone - 0.5) * 0.16));
    const tiltZ = Math.max(-tiltLimit, Math.min(tiltLimit,
      -Math.atan(gradient.x) * attitude + (((stone.tone * 7) % 1) - 0.5) * 0.16));
    // Whatever grade the tilt did not absorb goes under the turf, so no
    // downhill rim hangs in the air — the fix aims at the rim, not at
    // the slope, and the stone keeps its full mass above ground.
    const residualGrade = slope * (1 - attitude * 0.85);
    const slopeSink = Math.min(0.9,
      residualGrade * scaleXZ * 0.55 + slope * 0.08 * stone.size);
    // Slabs and loaves lie along the contour line; every other form keeps
    // its author yaw — a hillside of combed stones reads as one gesture.
    const liesAlong = archetype === "slab" || archetype === "loaf";
    const yaw = liesAlong && slope > 0.55
      ? Math.atan2(gradient.x, -gradient.z) + (stone.tone - 0.5) * 0.7
      : stone.yaw;
    placements.push({
      id: stone.id,
      archetype,
      position: [stone.x, collarTop - 0.35 - slopeSink, stone.z],
      rotation: [tiltX, yaw, tiltZ],
      scale: [scaleXZ, scaleY, scaleXZ * 0.82],
      tint: tintFor(stone.tone),
    });
  }
  cached = placements;
  return cached;
}
