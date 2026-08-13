import {
  validateHumanPopulationProfile,
  type HumanPopulationProfile,
} from "./humanPopulationProfile.ts";
import {
  validateMediumFelinePopulationProfile,
  type MediumFelinePopulationProfile,
} from "./mediumFelinePopulationProfile.ts";
import {
  validateMediumDragonPopulationProfile,
  type MediumDragonPopulationProfile,
} from "./mediumDragonPopulationProfile.ts";

interface CreaturePopulationBase {
  /** Stable identity within one world. */
  readonly id: string;
  readonly count: number;
  /** Mechanical body family; appearance never changes this contract. */
  readonly bodyType: string;
  /** Biological/fantasy species; worlds may later select local variants. */
  readonly species: string;
}

/** Human behaviour remains a settlement capability, not a universal animal. */
export interface HumanSettlementPopulationDefinition
  extends CreaturePopulationBase {
  readonly kind: "human-settlement";
  readonly bodyType: "human";
  readonly species: "human";
  readonly profile: HumanPopulationProfile;
}

export interface MediumFelineTerritoryPopulationDefinition
  extends CreaturePopulationBase {
  readonly kind: "medium-feline-territory";
  readonly bodyType: "medium-feline";
  readonly species: "Panthera pardus";
  readonly profile: MediumFelinePopulationProfile;
}

export interface MediumDragonTerritoryPopulationDefinition
  extends CreaturePopulationBase {
  readonly kind: "medium-dragon-territory";
  readonly bodyType: "medium-dragon";
  readonly species: "Draco pterosauroides";
  readonly profile: MediumDragonPopulationProfile;
}

export type CreaturePopulationDefinition =
  | HumanSettlementPopulationDefinition
  | MediumFelineTerritoryPopulationDefinition
  | MediumDragonTerritoryPopulationDefinition;

export function humanSettlementPopulation(options: {
  readonly id: string;
  readonly count: number;
  readonly profile: HumanPopulationProfile;
}): HumanSettlementPopulationDefinition {
  const definition: HumanSettlementPopulationDefinition = {
    id: options.id,
    kind: "human-settlement",
    bodyType: "human",
    species: "human",
    count: options.count,
    profile: validateHumanPopulationProfile(options.profile),
  };
  validateCreaturePopulationDefinitions("population", [definition]);
  return definition;
}

export function mediumFelineTerritoryPopulation(options: {
  readonly id: string;
  readonly count: number;
  readonly profile: MediumFelinePopulationProfile;
}): MediumFelineTerritoryPopulationDefinition {
  const profile = validateMediumFelinePopulationProfile(options.profile);
  const definition: MediumFelineTerritoryPopulationDefinition = {
    id: options.id,
    kind: "medium-feline-territory",
    bodyType: "medium-feline",
    species: profile.species,
    count: options.count,
    profile,
  };
  validateCreaturePopulationDefinitions("population", [definition]);
  return definition;
}

export function mediumDragonTerritoryPopulation(options: {
  readonly id: string;
  readonly count: number;
  readonly profile: MediumDragonPopulationProfile;
}): MediumDragonTerritoryPopulationDefinition {
  const profile = validateMediumDragonPopulationProfile(options.profile);
  const definition: MediumDragonTerritoryPopulationDefinition = {
    id: options.id,
    kind: "medium-dragon-territory",
    bodyType: "medium-dragon",
    species: profile.species,
    count: options.count,
    profile,
  };
  validateCreaturePopulationDefinitions("population", [definition]);
  return definition;
}

export function validateCreaturePopulationDefinitions(
  worldId: string,
  definitions: readonly CreaturePopulationDefinition[],
): readonly CreaturePopulationDefinition[] {
  const ids = new Set<string>();
  let humanSettlements = 0;
  for (const definition of definitions) {
    if (definition.id.trim().length === 0) {
      throw new Error(`World ${worldId}: creature population id is empty`);
    }
    if (ids.has(definition.id)) {
      throw new Error(
        `World ${worldId}: duplicate creature population ${definition.id}`,
      );
    }
    ids.add(definition.id);
    if (!Number.isInteger(definition.count) || definition.count < 1) {
      throw new Error(
        `World ${worldId}: creature population ${definition.id} count must be a positive integer`,
      );
    }
    if (definition.kind === "human-settlement" && definition.profile.id.length === 0) {
      throw new Error(
        `World ${worldId}: human population ${definition.id} has no profile id`,
      );
    }
    if (definition.kind === "human-settlement") {
      validateHumanPopulationProfile(definition.profile);
      humanSettlements += 1;
      if (humanSettlements > 1) {
        throw new Error(
          `World ${worldId}: multiple human settlements need independent door, stock and inspection bindings`,
        );
      }
    }
    if (definition.kind === "medium-feline-territory") {
      validateMediumFelinePopulationProfile(definition.profile);
      const declaredSpecies: string = definition.species;
      const profileSpecies: string = definition.profile.species;
      if (declaredSpecies !== profileSpecies) {
        throw new Error(
          `World ${worldId}: feline population ${definition.id} species differs from its profile`,
        );
      }
    }
    if (definition.kind === "medium-dragon-territory") {
      validateMediumDragonPopulationProfile(definition.profile);
      const declaredSpecies: string = definition.species;
      const profileSpecies: string = definition.profile.species;
      if (declaredSpecies !== profileSpecies) {
        throw new Error(
          `World ${worldId}: dragon population ${definition.id} species differs from its profile`,
        );
      }
    }
  }
  return definitions;
}
