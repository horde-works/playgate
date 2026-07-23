import { useCallback, useEffect, useRef, useState } from "react";
import type { TranslationKey } from "@/app/i18n/dictionary";

export type GameAction =
  | "player.spawned"
  | "gate.approaching"
  | "door.approaching";

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
