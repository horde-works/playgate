import type { SettlementPlan } from "./settlementPlan.ts";

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
  readonly settlement: SettlementPlan;
}

export type CreaturePopulationDefinition = HumanSettlementPopulationDefinition;

export function humanSettlementPopulation(options: {
  readonly id: string;
  readonly count: number;
  readonly settlement: SettlementPlan;
}): HumanSettlementPopulationDefinition {
  const definition: HumanSettlementPopulationDefinition = {
    id: options.id,
    kind: "human-settlement",
    bodyType: "human",
    species: "human",
    count: options.count,
    settlement: options.settlement,
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
    if (definition.kind === "human-settlement" && definition.settlement.id.length === 0) {
      throw new Error(
        `World ${worldId}: human population ${definition.id} has no settlement id`,
      );
    }
    if (definition.kind === "human-settlement") {
      humanSettlements += 1;
      if (humanSettlements > 1) {
        throw new Error(
          `World ${worldId}: multiple human settlements need independent door, stock and inspection bindings`,
        );
      }
    }
  }
  return definitions;
}
