/**
 * Transport-neutral telemetry contract. Physics publishers provide numeric
 * samples; the HUD decides how to localise and lay them out. A train, lift or
 * another vehicle can use the same channel without importing airship code.
 */
export type MotionTelemetryUnit = "km/h" | "m/s" | "m" | "deg" | "percent";

export interface MotionTelemetryMetric {
  /** Stable semantic name, localised by the consumer when it knows it. */
  readonly id: string;
  /** Multiple values are useful for paired engines, axles and similar units. */
  readonly value: number | readonly number[];
  readonly unit: MotionTelemetryUnit;
  readonly precision?: number;
  readonly signed?: boolean;
}

export interface MotionTelemetrySnapshot {
  readonly sourceId: string;
  readonly sourceLabel: string;
  readonly capturedAt: number;
  /** Higher priority wins when several moving objects are transmitting. */
  readonly priority?: number;
  readonly phase: string;
  readonly metrics: readonly MotionTelemetryMetric[];
}

/** `snapshot: null` explicitly closes one source without affecting others. */
export interface MotionTelemetryUpdate {
  readonly sourceId: string;
  readonly snapshot: MotionTelemetrySnapshot | null;
}

export function applyMotionTelemetryUpdate(
  current: ReadonlyMap<string, MotionTelemetrySnapshot>,
  update: MotionTelemetryUpdate,
): Map<string, MotionTelemetrySnapshot> {
  const next = new Map(current);
  if (!update.snapshot) {
    next.delete(update.sourceId);
    return next;
  }
  // The channel owns source identity. A malformed publisher cannot evict or
  // impersonate another moving object.
  next.set(update.sourceId, {
    ...update.snapshot,
    sourceId: update.sourceId,
  });
  return next;
}

export function selectMotionTelemetrySnapshot(
  sources: ReadonlyMap<string, MotionTelemetrySnapshot>,
): MotionTelemetrySnapshot | null {
  let selected: MotionTelemetrySnapshot | null = null;
  for (const snapshot of sources.values()) {
    if (!selected) {
      selected = snapshot;
      continue;
    }
    const priority = snapshot.priority ?? 0;
    const selectedPriority = selected.priority ?? 0;
    if (
      priority > selectedPriority ||
      (priority === selectedPriority && snapshot.capturedAt > selected.capturedAt)
    ) {
      selected = snapshot;
    }
  }
  return selected;
}

export interface MotionTelemetryStore {
  readonly update: (update: MotionTelemetryUpdate) => void;
  readonly clear: () => void;
  readonly getSnapshot: () => MotionTelemetrySnapshot | null;
  readonly subscribe: (listener: () => void) => () => void;
}

/**
 * A transport-neutral external store. Physics can publish at its own cadence
 * without re-rendering the whole game shell; only a mounted telemetry HUD
 * subscribes to the selected source.
 */
export function createMotionTelemetryStore(): MotionTelemetryStore {
  let sources = new Map<string, MotionTelemetrySnapshot>();
  let selected: MotionTelemetrySnapshot | null = null;
  const listeners = new Set<() => void>();

  const publishSelection = (next: MotionTelemetrySnapshot | null) => {
    if (Object.is(selected, next)) {
      return;
    }
    selected = next;
    for (const listener of listeners) {
      listener();
    }
  };

  return {
    update(update) {
      sources = applyMotionTelemetryUpdate(sources, update);
      publishSelection(selectMotionTelemetrySnapshot(sources));
    },
    clear() {
      if (sources.size === 0 && selected === null) {
        return;
      }
      sources = new Map();
      publishSelection(null);
    },
    getSnapshot() {
      return selected;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
