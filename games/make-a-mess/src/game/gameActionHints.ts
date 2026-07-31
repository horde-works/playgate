import { useCallback, useEffect, useRef, useState } from "react";
import type { TranslationKey } from "@/app/i18n/dictionary";

export type GameAction =
  | "player.spawned"
  | "gate.approaching"
  | "door.approaching"
  | "town-door.approaching"
  | "terminal-departure.approaching"
  | "viking-departure.approaching"
  | "town-departure.approaching"
  | "hexacopter-departure.approaching"
  | "terminal-ride.approaching"
  | "viking-ride.approaching"
  | "town-ride.approaching"
  | "hexacopter-ride.approaching"
  | "seat.approaching"
  | "stand.available";

export interface GameActionHint {
  readonly id: string;
  readonly action: GameAction;
  readonly delayMs: number;
  readonly durationMs?: number;
  readonly eyebrowKey: TranslationKey;
  readonly titleKey: TranslationKey;
  readonly detailKey: TranslationKey;
  readonly touchDetailKey?: TranslationKey;
  readonly keyLabelKey?: TranslationKey;
  readonly once: boolean;
}

export const gameActionHints: readonly GameActionHint[] = [
  {
    id: "first-look",
    action: "player.spawned",
    delayMs: 2_200,
    durationMs: 6_800,
    eyebrowKey: "hint.spawn.eyebrow",
    titleKey: "hint.spawn.title",
    detailKey: "hint.spawn.controls",
    touchDetailKey: "hint.spawn.controlsTouch",
    once: true,
  },
  {
    id: "approaching-the-gate",
    action: "gate.approaching",
    delayMs: 180,
    eyebrowKey: "hint.gate.eyebrow",
    titleKey: "hint.gate.title",
    detailKey: "hint.gate.action",
    touchDetailKey: "hint.gate.actionTouch",
    keyLabelKey: "hint.gate.key",
    once: false,
  },
  {
    id: "approaching-a-door",
    action: "door.approaching",
    delayMs: 180,
    eyebrowKey: "hint.door.eyebrow",
    titleKey: "hint.door.title",
    detailKey: "hint.door.action",
    touchDetailKey: "hint.door.actionTouch",
    keyLabelKey: "hint.door.key",
    once: false,
  },
  {
    id: "approaching-terminal-dispatch",
    action: "terminal-departure.approaching",
    delayMs: 180,
    eyebrowKey: "hint.departure.eyebrow",
    titleKey: "hint.departure.title",
    detailKey: "hint.departure.action",
    touchDetailKey: "hint.departure.actionTouch",
    keyLabelKey: "hint.departure.key",
    once: false,
  },
  {
    id: "approaching-viking-watch",
    action: "viking-departure.approaching",
    delayMs: 180,
    eyebrowKey: "hint.vikingDeparture.eyebrow",
    titleKey: "hint.vikingDeparture.title",
    detailKey: "hint.vikingDeparture.action",
    touchDetailKey: "hint.vikingDeparture.actionTouch",
    keyLabelKey: "hint.vikingDeparture.key",
    once: false,
  },
  {
    id: "approaching-town-airship-dispatch",
    action: "town-departure.approaching",
    delayMs: 180,
    eyebrowKey: "hint.townDeparture.eyebrow",
    titleKey: "hint.townDeparture.title",
    detailKey: "hint.townDeparture.action",
    touchDetailKey: "hint.townDeparture.actionTouch",
    keyLabelKey: "hint.townDeparture.key",
    once: false,
  },
  {
    id: "boarding-the-sky-train",
    action: "terminal-ride.approaching",
    delayMs: 180,
    eyebrowKey: "hint.ride.eyebrow",
    titleKey: "hint.ride.title",
    detailKey: "hint.ride.action",
    touchDetailKey: "hint.ride.actionTouch",
    keyLabelKey: "hint.ride.key",
    once: false,
  },
  {
    id: "boarding-the-sky-longship",
    action: "viking-ride.approaching",
    delayMs: 180,
    eyebrowKey: "hint.vikingRide.eyebrow",
    titleKey: "hint.vikingRide.title",
    detailKey: "hint.vikingRide.action",
    touchDetailKey: "hint.vikingRide.actionTouch",
    keyLabelKey: "hint.vikingRide.key",
    once: false,
  },
  {
    id: "boarding-the-town-airship",
    action: "town-ride.approaching",
    delayMs: 180,
    eyebrowKey: "hint.townRide.eyebrow",
    titleKey: "hint.townRide.title",
    detailKey: "hint.townRide.action",
    touchDetailKey: "hint.townRide.actionTouch",
    keyLabelKey: "hint.townRide.key",
    once: false,
  },
  {
    id: "dispatching-the-hexacopter",
    action: "hexacopter-departure.approaching",
    delayMs: 180,
    eyebrowKey: "hint.hexacopterDeparture.eyebrow",
    titleKey: "hint.hexacopterDeparture.title",
    detailKey: "hint.hexacopterDeparture.action",
    touchDetailKey: "hint.hexacopterDeparture.actionTouch",
    keyLabelKey: "hint.hexacopterDeparture.key",
    once: false,
  },
  {
    id: "boarding-the-hexacopter",
    action: "hexacopter-ride.approaching",
    delayMs: 180,
    eyebrowKey: "hint.hexacopterRide.eyebrow",
    titleKey: "hint.hexacopterRide.title",
    detailKey: "hint.hexacopterRide.action",
    touchDetailKey: "hint.hexacopterRide.actionTouch",
    keyLabelKey: "hint.hexacopterRide.key",
    once: false,
  },
  {
    id: "taking-the-driver-seat",
    action: "seat.approaching",
    delayMs: 120,
    eyebrowKey: "hint.seat.eyebrow",
    titleKey: "hint.seat.title",
    detailKey: "hint.seat.action",
    touchDetailKey: "hint.seat.actionTouch",
    keyLabelKey: "hint.seat.key",
    once: false,
  },
  {
    id: "leaving-the-driver-seat",
    action: "stand.available",
    delayMs: 80,
    eyebrowKey: "hint.stand.eyebrow",
    titleKey: "hint.stand.title",
    detailKey: "hint.stand.action",
    touchDetailKey: "hint.stand.actionTouch",
    keyLabelKey: "hint.stand.key",
    once: false,
  },
  {
    id: "approaching-a-town-door",
    action: "town-door.approaching",
    delayMs: 180,
    eyebrowKey: "hint.townDoor.eyebrow",
    titleKey: "hint.townDoor.title",
    detailKey: "hint.townDoor.action",
    touchDetailKey: "hint.townDoor.actionTouch",
    keyLabelKey: "hint.townDoor.key",
    once: false,
  },
];

export function hintsForGameAction(action: GameAction): readonly GameActionHint[] {
  return gameActionHints.filter((hint) => hint.action === action);
}

export function useGameActionHints() {
  const [activeHint, setActiveHint] = useState<GameActionHint | null>(null);
  const [hintLeaving, setHintLeaving] = useState(false);
  const activeHintRef = useRef<GameActionHint | null>(null);
  const playedOnce = useRef(new Set<string>());
  const timers = useRef(new Set<number>());
  const actionGenerations = useRef(new Map<GameAction, number>());

  const clearHints = useCallback(() => {
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current.clear();
    activeHintRef.current = null;
    setActiveHint(null);
    setHintLeaving(false);
  }, []);

  const emitAction = useCallback((action: GameAction) => {
    const generation = (actionGenerations.current.get(action) ?? 0) + 1;
    actionGenerations.current.set(action, generation);
    for (const hint of hintsForGameAction(action)) {
      if (hint.once && playedOnce.current.has(hint.id)) {
        continue;
      }
      if (hint.once) {
        playedOnce.current.add(hint.id);
      }

      const revealTimer = window.setTimeout(() => {
        timers.current.delete(revealTimer);
        if (actionGenerations.current.get(action) !== generation) {
          return;
        }
        activeHintRef.current = hint;
        setActiveHint(hint);
        setHintLeaving(false);

        if (hint.durationMs !== undefined) {
          const dismissTimer = window.setTimeout(() => {
            timers.current.delete(dismissTimer);
            if (activeHintRef.current?.id === hint.id) {
              activeHintRef.current = null;
              setActiveHint(null);
            }
          }, hint.durationMs);
          timers.current.add(dismissTimer);
        }
      }, hint.delayMs);
      timers.current.add(revealTimer);
    }
  }, []);

  const endAction = useCallback((action: GameAction) => {
    const generation = (actionGenerations.current.get(action) ?? 0) + 1;
    actionGenerations.current.set(action, generation);
    const current = activeHintRef.current;
    if (current?.action !== action) {
      return;
    }
    setHintLeaving(true);
    const dismissTimer = window.setTimeout(() => {
      timers.current.delete(dismissTimer);
      if (
        actionGenerations.current.get(action) === generation &&
        activeHintRef.current?.action === action
      ) {
        activeHintRef.current = null;
        setActiveHint(null);
        setHintLeaving(false);
      }
    }, 320);
    timers.current.add(dismissTimer);
  }, []);

  useEffect(() => clearHints, [clearHints]);

  return { activeHint, hintLeaving, emitAction, endAction, clearHints } as const;
}
