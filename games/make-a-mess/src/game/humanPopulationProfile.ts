import {
  settlementResidentRoles,
  type SettlementPlan,
} from "./settlementPlan.ts";

export type HumanSkillId = string;
export type HumanColor = `#${string}`;

export interface HumanWardrobe {
  readonly dyes: readonly (readonly [number, number, number])[];
  /** Spread of personal wear, 0..1: village wool varies more than city cloth. */
  readonly wearSpread?: number;
  /** How much a profession marks clothes with soot, salt, grease or dust. */
  readonly grimeByRole?: Readonly<Record<string, number>>;
}

export interface HumanAppearanceVariant {
  readonly id: string;
  readonly skin: HumanColor;
  readonly hair: HumanColor;
  /** Relative frequency inside this population. */
  readonly weight: number;
}

export interface HumanProfessionProfile {
  /** Open capability tokens. Body mechanics never branch on a profession id. */
  readonly skills: readonly HumanSkillId[];
  /** Professional exposure to sudden noise; 1 keeps the shared human response. */
  readonly startleGain?: number;
}

export interface HumanPopulationProfile {
  readonly id: string;
  readonly bodyType: "human";
  readonly species: "human";
  readonly settlement: SettlementPlan;
  readonly appearance: {
    readonly variants: readonly HumanAppearanceVariant[];
    readonly wardrobe: HumanWardrobe;
  };
  /** Keyed by the role token assigned by the settlement census/dwelling. */
  readonly professions: Readonly<Record<string, HumanProfessionProfile>>;
}

const COLOR = /^#[0-9a-f]{6}$/i;

function assertColor(profileId: string, label: string, color: string): void {
  if (!COLOR.test(color)) {
    throw new Error(`Human profile ${profileId}: ${label} must be a six-digit hex color`);
  }
}

export function validateHumanPopulationProfile(
  profile: HumanPopulationProfile,
): HumanPopulationProfile {
  if (profile.id.trim().length === 0) {
    throw new Error("Human profile id is empty");
  }
  if (profile.settlement.id.trim().length === 0) {
    throw new Error(`Human profile ${profile.id}: settlement id is empty`);
  }
  if (profile.appearance.variants.length === 0) {
    throw new Error(`Human profile ${profile.id}: no appearance variants`);
  }
  const appearanceIds = new Set<string>();
  for (const variant of profile.appearance.variants) {
    if (variant.id.trim().length === 0 || appearanceIds.has(variant.id)) {
      throw new Error(`Human profile ${profile.id}: invalid appearance id ${variant.id}`);
    }
    appearanceIds.add(variant.id);
    assertColor(profile.id, `${variant.id} skin`, variant.skin);
    assertColor(profile.id, `${variant.id} hair`, variant.hair);
    if (!Number.isFinite(variant.weight) || variant.weight <= 0) {
      throw new Error(`Human profile ${profile.id}: ${variant.id} weight must be positive`);
    }
  }
  if (profile.appearance.wardrobe.dyes.length === 0) {
    throw new Error(`Human profile ${profile.id}: wardrobe has no dyes`);
  }
  for (const [index, dye] of profile.appearance.wardrobe.dyes.entries()) {
    if (dye.some((channel) => !Number.isFinite(channel) || channel < 0 || channel > 1)) {
      throw new Error(`Human profile ${profile.id}: wardrobe dye ${index} is outside 0..1`);
    }
  }

  const residentRoles = new Set(settlementResidentRoles(profile.settlement));
  for (const role of residentRoles) {
    if (!profile.professions[role]) {
      throw new Error(`Human profile ${profile.id}: resident role ${role} has no profession`);
    }
  }
  for (const [role, profession] of Object.entries(profile.professions)) {
    if (!residentRoles.has(role)) {
      throw new Error(`Human profile ${profile.id}: profession ${role} has no resident role`);
    }
    if (profession.skills.length === 0) {
      throw new Error(`Human profile ${profile.id}: profession ${role} has no skills`);
    }
    if (new Set(profession.skills).size !== profession.skills.length) {
      throw new Error(`Human profile ${profile.id}: profession ${role} repeats a skill`);
    }
    if (
      profession.startleGain !== undefined &&
      (!Number.isFinite(profession.startleGain) || profession.startleGain <= 0)
    ) {
      throw new Error(`Human profile ${profile.id}: profession ${role} startle gain must be positive`);
    }
  }
  return profile;
}

export function defineHumanPopulationProfile(
  profile: HumanPopulationProfile,
): HumanPopulationProfile {
  return validateHumanPopulationProfile(profile);
}
