import { islandDestinations, type IslandId } from "./islandTopology.ts";

export type ShipFormId = "sky-longship" | "town-airship";
export type ShipTransmutationStageId = "material" | "function" | "silhouette";

export interface ShipTransmutationStage {
  readonly id: ShipTransmutationStageId;
  /** Normalized interval inside the obscured boundary crossing. */
  readonly from: number;
  readonly until: number;
}

export interface ShipTransmutationPlan {
  /** The entity is stable even though neither physical form is. */
  readonly entityId: "inter-island-ship";
  readonly origin: IslandId;
  readonly destination: IslandId;
  readonly sourceForm: ShipFormId;
  readonly destinationForm: ShipFormId;
  readonly stages: readonly ShipTransmutationStage[];
  readonly passengerFrame: "preserve";
  /** Milestone choice: physical damage deliberately does not cross scenes. */
  readonly damageTransfer: "reset";
}

const ISLAND_SHIP_FORMS: Readonly<Partial<Record<IslandId, ShipFormId>>> = {
  town: "town-airship",
  "viking-village": "sky-longship",
};

const TRANSMUTATION_STAGES: readonly ShipTransmutationStage[] = [
  { id: "material", from: 0, until: 0.42 },
  { id: "function", from: 0.28, until: 0.72 },
  { id: "silhouette", from: 0.62, until: 1 },
];

export function shipFormForIsland(island: IslandId): ShipFormId | null {
  return ISLAND_SHIP_FORMS[island] ?? null;
}

export function shipTransmutationPlan(
  origin: IslandId,
  destination: IslandId,
): ShipTransmutationPlan | null {
  const sourceForm = shipFormForIsland(origin);
  const destinationForm = shipFormForIsland(destination);
  if (
    !sourceForm ||
    !destinationForm ||
    sourceForm === destinationForm ||
    !islandDestinations(origin).includes(destination)
  ) {
    return null;
  }
  return {
    entityId: "inter-island-ship",
    origin,
    destination,
    sourceForm,
    destinationForm,
    stages: TRANSMUTATION_STAGES,
    passengerFrame: "preserve",
    damageTransfer: "reset",
  };
}

export function shipTransmutationStage(
  progress: number,
): ShipTransmutationStageId {
  const value = Math.max(0, Math.min(1, progress));
  if (value < TRANSMUTATION_STAGES[1].from) {
    return "material";
  }
  if (value < TRANSMUTATION_STAGES[2].from) {
    return "function";
  }
  return "silhouette";
}
