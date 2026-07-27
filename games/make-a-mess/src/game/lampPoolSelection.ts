interface GroupedLampCandidate {
  readonly lamp: {
    readonly id: string;
    readonly poolGroupId?: string;
  };
  readonly rank: number;
}

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
  for (const group of orderedGroups) {
    const remaining = capacity - selected.length;
    if (remaining <= 0) {
      break;
    }
    if (group.length <= remaining) {
      selected.push(...group);
    }
  }
  return selected;
}
