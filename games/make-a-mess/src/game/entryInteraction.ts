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
  | "terminal-passenger-flight"
  | "viking-passenger-flight"
  | "town-passenger-flight";

export interface EntryInteractionTarget {
  readonly id: string;
  readonly kind: EntryInteractionKind;
  /** Map-specific presentation; identity and mechanics remain transport-neutral. */
  readonly cue?: EntryInteractionCue;
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
