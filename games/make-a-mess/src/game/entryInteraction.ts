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
  | "combat-hexacopter-uncrewed-flight"
  | "duct-hexacopter-uncrewed-flight"
  | "sr6-skat-uncrewed-flight"
  | "dc3-uncrewed-flight"
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

/** Resolve number-row shortcuts across physical keys, NumPad, and code-poor clients. */
export function keyboardDigit(code: string, key: string): number | null {
  const physical = /^(?:Digit|Numpad)([0-9])$/.exec(code);
  if (physical) return Number(physical[1]);
  return /^[0-9]$/.test(key) ? Number(key) : null;
}

/**
 * СПОСОБ УПРАВЛЕНИЯ, А НЕ ВИД РЕЙСА.
 *
 * Единственный пункт таблички, который не называет трассу: он говорит, КТО
 * поведёт машину, а куда — решает паспорт.
 */
export const MANUAL_PILOT_ACTION = "manual";

export interface DispatchedFlightKindInput {
  /** С какого поста запускают: стойка площадки или место пассажира. */
  readonly post: "board" | "ride";
  /** Что выбрали на табличке; пусто — единственный пункт. */
  readonly requestedAction?: string | null;
  /** Вид рейса по умолчанию у стойки. */
  readonly departureKind?: string | null;
  /** Вид рейса по умолчанию у пассажирского поста. */
  readonly passengerKind?: string | null;
  /** Запуск за штурвал состоялся: сиденье цело и человек в нём. */
  readonly manualPilotLaunch: boolean;
}

/**
 * КАКОЙ РЕЙС НАЧИНАЕТСЯ ПО ВЫБРАННОМУ ПУНКТУ.
 *
 * Вынесено из системы машин отдельной функцией не ради чистоты, а потому что
 * здесь уже была ошибка, которую нечем было поймать: со стойки площадки вид
 * рейса брался ТОЛЬКО из паспорта, а выбранный пункт игнорировался. Пока на
 * табличке был один рейс, это ничего не значило; второй пункт («Сторожить
 * небо») молча исполнился как первый — машина ушла на обзорный круг и не
 * увидела чужой борт.
 *
 * Правило одно для обоих постов: пункт называет трассу, кроме `manual` —
 * он называет пилота.
 */
export function dispatchedFlightKind(
  input: DispatchedFlightKindInput,
): string {
  const fallback =
    input.post === "ride"
      ? (input.passengerKind ?? "tour")
      : (input.departureKind ?? "circuit");
  if (input.manualPilotLaunch) {
    // За штурвалом человек, и трассу ему даёт паспорт: возвращать сюда
    // `manual` значило бы завести рейс с несуществующим видом.
    return input.departureKind ?? fallback;
  }
  const requested = input.requestedAction;
  if (!requested || requested === MANUAL_PILOT_ACTION) {
    return fallback;
  }
  return requested;
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
 * Посадка и поездка — действия УЖЕ внутри машины. Space не должен открывать
 * соседнюю створку вместо них. Дверь важнее только снаружи: у стойки
 * отправления, у ручки, у любого поста, который не сажает в кресло.
 */
export function preferredEntryInteraction(
  door: EntryInteractionTarget | null,
  vehicle: EntryInteractionTarget | null,
): EntryInteractionTarget | null {
  return vehicle?.kind === "ride"
      || vehicle?.kind === "seat"
      || vehicle?.kind === "stand"
    ? vehicle
    : door ?? vehicle;
}
