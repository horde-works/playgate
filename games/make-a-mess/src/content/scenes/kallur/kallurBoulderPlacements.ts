import {
  buildBoulderArchetype,
  KALLUR_BOULDER_ARCHETYPES,
} from "../../objects/kallur/kallurBoulderKitObject.ts";
import {
  kallurGroundTopAt,
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
  readonly colour: string;
}

/** Nominal bbox height of each archetype at unit scale, measured once. */
const archetypeHeights: ReadonlyMap<string, number> = new Map(
  KALLUR_BOULDER_ARCHETYPES.map((archetype) => {
    const geometry = buildBoulderArchetype(archetype);
    let top = 0;
    for (const [, y] of geometry.vertices) top = Math.max(top, y);
    return [archetype.id, top];
  }),
);

/** Deterministic archetype pick from the stone's own numbers. */
export function kallurBoulderArchetypeFor(stone: {
  readonly size: number;
  readonly tone: number;
}): string {
  if (stone.size < 0.45) return "loaf";
  const pick = (stone.tone * 13.7) % 1;
  if (pick < 0.34) return "rounded";
  if (pick < 0.55) return "slab";
  if (pick < 0.7) return "twin";
  if (pick < 0.85) return stone.size >= 1.4 ? "split" : "column";
  return "split";
}

let cached: readonly KallurBoulderPlacement[] | null = null;

export function kallurBoulderPlacements(): readonly KallurBoulderPlacement[] {
  if (cached) return cached;
  const placements: KallurBoulderPlacement[] = [];
  for (const stone of kallurVisibleStones(kallurStones)) {
    const collarTop = kallurGroundTopAt(stone.x, stone.z);
    const crownHeight = stone.size * (1 - stone.embed) * 0.9 + 0.15;
    const colour = stone.tone > 0.72
      ? "#b9bdb4"
      : stone.tone > 0.35
        ? "#8f958d"
        : "#79807b";
    const archetype = kallurBoulderArchetypeFor(stone);
    const nominalHeight = archetypeHeights.get(archetype) ?? 1;
    // The instance spans the same visual budget the box crown owned: its
    // bottom sits 0.35 sunk into the collar and its top reaches the crown
    // height, whatever the archetype's own proportions are.
    const scaleY = (crownHeight + 0.35) / nominalHeight;
    const scaleXZ = stone.size * 0.98;
    placements.push({
      id: stone.id,
      archetype,
      position: [stone.x, collarTop - 0.35, stone.z],
      rotation: [
        (stone.tone - 0.5) * 0.24,
        stone.yaw,
        (((stone.tone * 7) % 1) - 0.5) * 0.24,
      ],
      scale: [scaleXZ, scaleY, scaleXZ * 0.82],
      colour,
    });
  }
  cached = placements;
  return cached;
}
