export type EntryInteractionKind =
  | "door"
  | "gate"
  | "town-door"
  | "departure"
  | "ride";

export interface EntryInteractionTarget {
  readonly id: string;
  readonly kind: EntryInteractionKind;
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
