export type MediumFelineSkillId =
  | "observe"
  | "territory-roam"
  | "play-sprint"
  | "ground-bound"
  | "terrain-perch";

export type MediumFelinePoint = readonly [x: number, z: number];

export interface MediumFelinePopulationProfile {
  readonly id: string;
  readonly bodyType: "medium-feline";
  readonly genus: "Panthera";
  readonly species: "Panthera pardus";
  readonly phenotype: "melanistic";
  readonly skills: readonly MediumFelineSkillId[];
  readonly appearance: {
    readonly coat: `#${string}`;
    readonly coatPlane: `#${string}`;
    readonly muzzle: `#${string}`;
    readonly eyes: `#${string}`;
  };
  /**
   * World-owned territory. The feline adapter owns how these points are read:
   * they are interests, not a rail or a baked navigation mesh.
   */
  readonly territory: {
    readonly spawn: MediumFelinePoint;
    readonly circuit: readonly MediumFelinePoint[];
    readonly lookouts: readonly MediumFelinePoint[];
  };
}

const COLOR = /^#[0-9a-f]{6}$/i;

export function validateMediumFelinePopulationProfile(
  profile: MediumFelinePopulationProfile,
): MediumFelinePopulationProfile {
  if (profile.id.trim().length === 0) {
    throw new Error("Medium feline profile id is empty");
  }
  if (profile.skills.length === 0 || new Set(profile.skills).size !== profile.skills.length) {
    throw new Error(`Medium feline profile ${profile.id}: skills must be non-empty and unique`);
  }
  for (const [label, color] of Object.entries(profile.appearance)) {
    if (!COLOR.test(color)) {
      throw new Error(`Medium feline profile ${profile.id}: ${label} must be a six-digit hex color`);
    }
  }
  if (profile.territory.circuit.length < 3) {
    throw new Error(`Medium feline profile ${profile.id}: territory circuit needs at least three points`);
  }
  if (profile.territory.lookouts.length === 0) {
    throw new Error(`Medium feline profile ${profile.id}: territory has no lookouts`);
  }
  for (const [label, points] of [
    ["circuit", profile.territory.circuit],
    ["lookouts", profile.territory.lookouts],
    ["spawn", [profile.territory.spawn]],
  ] as const) {
    for (const point of points) {
      if (point.some((coordinate) => !Number.isFinite(coordinate))) {
        throw new Error(`Medium feline profile ${profile.id}: ${label} contains a non-finite point`);
      }
    }
  }
  return profile;
}

export function defineMediumFelinePopulationProfile(
  profile: MediumFelinePopulationProfile,
): MediumFelinePopulationProfile {
  return validateMediumFelinePopulationProfile(profile);
}
