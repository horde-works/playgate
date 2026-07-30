interface GroupedLampCandidate {
  readonly lamp: {
    readonly id: string;
    readonly poolGroupId?: string;
    readonly poolPriority?: number;
  };
  readonly rank: number;
}

/** High-priority architectural groups remain represented in a skyline view. */
export const PERSISTENT_LAMP_GROUP_PRIORITY = 32;

/**
 * Selects coherent light groups atomically. A carriage therefore cannot appear
 * to switch on one ceiling fixture at a time as the camera walks underneath.
 */
export function selectGroupedLampCandidates<T extends GroupedLampCandidate>(
  candidates: readonly T[],
  capacity: number,
): readonly T[] {
  const groups = new Map<string, T[]>();
  for (const candidate of candidates) {
    const key = candidate.lamp.poolGroupId ?? `lamp:${candidate.lamp.id}`;
    const group = groups.get(key);
    if (group) {
      group.push(candidate);
    } else {
      groups.set(key, [candidate]);
    }
  }

  const orderedGroups = [...groups.values()]
    .map((members) => members.sort((left, right) => left.rank - right.rank))
    .sort((left, right) => left[0].rank - right[0].rank);
  const selected: T[] = [];

  // A large coherent landmark can otherwise consume the entire pool and
  // make every other monument switch off in the same aerial view. Reserve
  // one real authored source for each high-priority group first. Nearby
  // detail then fills the remaining slots in the ordinary rank order.
  const persistentGroups = orderedGroups.filter((group) =>
    (group[0].lamp.poolPriority ?? 0) >= PERSISTENT_LAMP_GROUP_PRIORITY);
  for (const group of persistentGroups) {
    if (selected.length >= capacity) break;
    selected.push(group[0]);
  }
  const represented = new Set(selected.map((entry) => entry.lamp.id));

  for (const group of orderedGroups) {
    const remaining = capacity - selected.length;
    if (remaining <= 0) {
      break;
    }
    const missing = group.filter((entry) => !represented.has(entry.lamp.id));
    if (missing.length <= remaining) {
      selected.push(...missing);
      continue;
    }
    if ((group[0].lamp.poolPriority ?? 0) >= PERSISTENT_LAMP_GROUP_PRIORITY) {
      selected.push(...missing.slice(0, remaining));
      break;
    }
  }
  return selected;
}
