export const LAMP_ASSIGNMENT_INTERVAL_SECONDS = 0.12;

export interface RankedLampCandidate<TLamp extends { id: string }> {
  lamp: TLamp;
  position: [number, number, number];
  distanceSq: number;
  rank: number;
}

export interface LampPoolScratch<TLamp extends { id: string }> {
  readonly pool: RankedLampCandidate<TLamp>[];
  readonly active: RankedLampCandidate<TLamp>[];
  assignmentAge: number;
  readonly keepIds: Set<string>;
  readonly assignedIds: Set<string>;
  readonly waiting: RankedLampCandidate<TLamp>[];
}

export function createLampPoolScratch<
  TLamp extends { id: string },
>(): LampPoolScratch<TLamp> {
  return {
    pool: [],
    active: [],
    assignmentAge: LAMP_ASSIGNMENT_INTERVAL_SECONDS,
    keepIds: new Set(),
    assignedIds: new Set(),
    waiting: [],
  };
}

export function beginLampCandidateFrame<TLamp extends { id: string }>(
  scratch: LampPoolScratch<TLamp>,
): void {
  scratch.active.length = 0;
}

export function pushLampCandidate<TLamp extends { id: string }>(
  scratch: LampPoolScratch<TLamp>,
  lamp: TLamp,
  x: number,
  y: number,
  z: number,
  cameraX: number,
  cameraY: number,
  cameraZ: number,
  rankDivisor: number,
): RankedLampCandidate<TLamp> {
  const index = scratch.active.length;
  let entry = scratch.pool[index];
  if (!entry) {
    entry = {
      lamp,
      position: [x, y, z],
      distanceSq: 0,
      rank: 0,
    };
    scratch.pool[index] = entry;
  } else {
    entry.lamp = lamp;
    entry.position[0] = x;
    entry.position[1] = y;
    entry.position[2] = z;
  }
  const dx = x - cameraX;
  const dy = y - cameraY;
  const dz = z - cameraZ;
  entry.distanceSq = dx * dx + dy * dy + dz * dz;
  entry.rank = entry.distanceSq / Math.max(rankDivisor, 1e-6);
  scratch.active.push(entry);
  return entry;
}

export function sortLampCandidates<TLamp extends { id: string }>(
  scratch: LampPoolScratch<TLamp>,
): void {
  scratch.active.sort((left, right) => left.rank - right.rank);
}

export function nearestLampCandidate<TLamp extends { id: string }>(
  scratch: LampPoolScratch<TLamp>,
): RankedLampCandidate<TLamp> | undefined {
  let nearest = scratch.active[0];
  if (!nearest) return undefined;
  for (let index = 1; index < scratch.active.length; index += 1) {
    const candidate = scratch.active[index];
    if (candidate.distanceSq < nearest.distanceSq) nearest = candidate;
  }
  return nearest;
}

export function markLampKeepIds<TLamp extends { id: string }>(
  scratch: LampPoolScratch<TLamp>,
  chosen: readonly RankedLampCandidate<TLamp>[],
): void {
  scratch.keepIds.clear();
  for (const entry of chosen) scratch.keepIds.add(entry.lamp.id);
}

export function collectUnassignedWaiting<TLamp extends { id: string }>(
  scratch: LampPoolScratch<TLamp>,
  chosen: readonly RankedLampCandidate<TLamp>[],
  assignedSlotIds: readonly (string | null)[],
): void {
  scratch.assignedIds.clear();
  for (const id of assignedSlotIds) {
    if (id && scratch.keepIds.has(id)) scratch.assignedIds.add(id);
  }
  scratch.waiting.length = 0;
  for (const entry of chosen) {
    if (!scratch.assignedIds.has(entry.lamp.id)) scratch.waiting.push(entry);
  }
}
