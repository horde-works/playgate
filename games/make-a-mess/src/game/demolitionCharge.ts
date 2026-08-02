export const MAX_DEMOLITION_CHARGES = 10;
export const DEMOLITION_CHARGE_RANGE = 36;
export const DEMOLITION_DETONATION_STAGGER_MS = 50;

export interface DemolitionChargeDefinition {
  readonly id: number;
  readonly position: readonly [number, number, number];
  readonly quaternion: readonly [number, number, number, number];
}

/** Одна команда, один воспринимаемый взрыв; физика получает работу порциями. */
export function demolitionDetonationDelay(index: number): number {
  return Math.max(0, Math.floor(index)) * DEMOLITION_DETONATION_STAGGER_MS;
}
