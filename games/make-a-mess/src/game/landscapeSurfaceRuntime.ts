/**
 * Opt-in landscape runtime — worlds register, the shared renderer looks up.
 *
 * A world experiment (Kallur carpet, polder waterline tint) must not compile
 * when another island loads. The engine holds the slots; the world's scene
 * module fills them. Unregistered ids are inert.
 */

import type { LandscapeGradeMapSpec } from "../content/landscape/landscapeLattice.ts";

export type LandscapeGroundTint = (
  x: number,
  z: number,
) => readonly [number, number, number];

export interface LandscapeGrassStyle {
  readonly keep: number;
  readonly clump: number;
  readonly groundY: number;
  readonly dryness: number;
}

export type LandscapeGrassStyleAt = (
  x: number,
  z: number,
) => LandscapeGrassStyle | null;

const groundTints = new Map<string, LandscapeGroundTint>();
const grassStyles = new Map<string, LandscapeGrassStyleAt>();
const gradeMaps = new Map<string, LandscapeGradeMapSpec>();

export function registerLandscapeGroundTint(
  profile: string,
  tint: LandscapeGroundTint,
): void {
  groundTints.set(profile, tint);
}

export function landscapeGroundTint(
  profile: string | undefined,
): LandscapeGroundTint | null {
  if (!profile) return null;
  return groundTints.get(profile) ?? null;
}

export function registerLandscapeGrassStyle(
  profile: string,
  styleAt: LandscapeGrassStyleAt,
): void {
  grassStyles.set(profile, styleAt);
}

export function landscapeGrassStyleAt(
  profile: string,
  x: number,
  z: number,
): LandscapeGrassStyle | null {
  return grassStyles.get(profile)?.(x, z) ?? null;
}

export function registerLandscapeGradeMap(
  id: string,
  spec: LandscapeGradeMapSpec,
): void {
  gradeMaps.set(id, spec);
}

export function landscapeGradeMap(id: string): LandscapeGradeMapSpec | undefined {
  return gradeMaps.get(id);
}
