"use client";

import type { CreaturePopulationDefinition } from "./creaturePopulation.ts";
import type { CreatureWorldRuntime } from "./creatureWorld.ts";
import { MediumDragons } from "./MediumDragons.tsx";
import { MediumPanthers } from "./MediumPanthers.tsx";
import {
  Villagers,
  type VillagerWorldBindings,
} from "./Villagers.tsx";

export function hasHumanSettlementPopulation(
  definitions: readonly CreaturePopulationDefinition[],
): boolean {
  return definitions.some((definition) => definition.kind === "human-settlement");
}

/**
 * Capability dispatcher for living populations. Species adapters own their
 * navigation, behaviour and body; this component only gives them one world.
 */
export function CreaturePopulations({
  definitions,
  world,
  villagers,
}: {
  definitions: readonly CreaturePopulationDefinition[];
  world: CreatureWorldRuntime;
  villagers: VillagerWorldBindings;
}) {
  return definitions.map((definition) => {
    switch (definition.kind) {
      case "human-settlement":
        return (
          <Villagers
            key={definition.id}
            definition={definition}
            world={world}
            bindings={villagers}
          />
        );
      case "medium-feline-territory":
        return (
          <MediumPanthers
            key={definition.id}
            definition={definition}
            world={world}
          />
        );
      case "medium-dragon-territory":
        return (
          <MediumDragons
            key={definition.id}
            definition={definition}
            world={world}
          />
        );
      default:
        return null;
    }
  });
}
