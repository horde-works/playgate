export type EntryInteractionKind =
  | "door"
  | "gate"
  | "town-door"
  | "departure"
  | "ride"
  | "seat"
  | "stand";

export type EntryInteractionCue =
  | "terminal-uncrewed-flight"
  | "viking-uncrewed-flight"
  | "town-uncrewed-flight"
  | "town-hexacopter-uncrewed-flight"
  | "stronghold-uncrewed-flight"
  | "terminal-passenger-flight"
  | "viking-passenger-flight"
  | "town-passenger-flight"
  | "town-hexacopter-passenger-flight"
  | "stronghold-passenger-flight"
  | "town-hexacopter-pilot-seat"
  | "town-ds-driver-seat";

export interface EntryInteractionAction {
  /** Stable command understood by the interaction owner. */
  readonly id: string;
  /** Presentation stays translated by the game shell. */
  readonly labelKey: string;
}

export interface EntryInteractionTarget {
  readonly id: string;
  readonly kind: EntryInteractionKind;
  /** Map-specific presentation; identity and mechanics remain transport-neutral. */
  readonly cue?: EntryInteractionCue;
  /** Omitted for the ordinary one-action Space interaction. */
  readonly actions?: readonly EntryInteractionAction[];
  /** Present only on the request sent after a numbered choice. */
  readonly selectedActionId?: string;
}

const PRIMARY_ACTION: readonly EntryInteractionAction[] = [
  { id: "primary", labelKey: "" },
];

export function entryInteractionActions(
  target: EntryInteractionTarget | null | undefined,
): readonly EntryInteractionAction[] {
  if (!target) {
    return [];
  }
  return target.actions && target.actions.length > 0
    ? target.actions
    : PRIMARY_ACTION;
}

export function numberedEntryInteractionAction(
  target: EntryInteractionTarget | null | undefined,
  digit: number,
): EntryInteractionAction | null {
  const actions = entryInteractionActions(target);
  if (actions.length < 2 || digit < 1 || digit > 9) {
    return null;
  }
  return actions[digit - 1] ?? null;
}

/** A single input command belongs to exactly the entry advertised by the UI. */
export function entryInteractionMatches(
  request: EntryInteractionTarget | null | undefined,
  candidate: EntryInteractionTarget | null | undefined,
): boolean {
  return Boolean(
    request &&
    candidate &&
    request.id === candidate.id &&
    request.kind === candidate.kind,
  );
}

/**
 * A ride requested from inside a carrier is the primary action there. Nearby
 * doors keep priority everywhere else, including exterior departure posts.
 */
export function preferredEntryInteraction(
  door: EntryInteractionTarget | null,
  vehicle: EntryInteractionTarget | null,
): EntryInteractionTarget | null {
  return vehicle?.kind === "ride" ? vehicle : door ?? vehicle;
}
