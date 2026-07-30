/**
 * Transport-neutral telemetry contract. Physics publishers provide numeric
 * samples; the HUD decides how to localise and lay them out. A train, lift or
 * another vehicle can use the same channel without importing airship code.
 */
export type MotionTelemetryUnit = "km/h" | "m/s" | "m" | "deg" | "percent";
export type MotionTelemetryValueSide = "left" | "right";
export type MotionTelemetryValueState = "normal" | "warning";

export interface MotionTelemetryMetric {
  /** Stable semantic name, localised by the consumer when it knows it. */
  readonly id: string;
  /** Multiple values are useful for paired engines, axles and similar units. */
  readonly value: number | readonly number[];
  /** Optional semantic labels for paired values; the HUD localises them. */
  readonly valueSides?: readonly MotionTelemetryValueSide[];
  /** Persistent mechanical state, separate from transient value activity. */
  readonly valueStates?: readonly MotionTelemetryValueState[];
  readonly unit: MotionTelemetryUnit;
  readonly precision?: number;
  readonly signed?: boolean;
  /** Minimum sample-to-sample change worth calling the viewer's attention to. */
  readonly activityDelta?: number;
  /** Wrap-around range for circular values such as a 360-degree heading. */
  readonly circularRange?: number;
}

const metricValues = (metric: MotionTelemetryMetric): readonly number[] =>
  typeof metric.value === "number" ? [metric.value] : metric.value;

/**
 * Transport-neutral change detector. Array entries stay independent, so a
 * paired engine/axle metric can emphasise one side without pulsing the other.
 */
export function motionTelemetryMetricActivity(
  previous: MotionTelemetryMetric | undefined,
  current: MotionTelemetryMetric,
): readonly boolean[] {
  const currentValues = metricValues(current);
  const threshold = current.activityDelta;
  if (
    !previous ||
    previous.id !== current.id ||
    threshold === undefined ||
    !Number.isFinite(threshold) ||
    threshold <= 0
  ) {
    return currentValues.map(() => false);
  }
  const previousValues = metricValues(previous);
  const circularRange = current.circularRange;
  return currentValues.map((value, index) => {
    const before = previousValues[index];
    if (!Number.isFinite(value) || !Number.isFinite(before)) {
      return false;
    }
    let delta = Math.abs(value - before);
    if (circularRange !== undefined && circularRange > 0) {
      delta %= circularRange;
      delta = Math.min(delta, circularRange - delta);
    }
    return delta >= threshold;
  });
}

export interface MotionTelemetrySnapshot {
  readonly sourceId: string;
  readonly sourceLabel: string;
  readonly capturedAt: number;
  /** Higher priority wins when several moving objects are transmitting. */
  readonly priority?: number;
  /** Temporary controller mode; the journey phase remains independently true. */
  readonly mode?: string;
  readonly phase: string;
  readonly metrics: readonly MotionTelemetryMetric[];
  /** Latest finite external impulse, captured before automation reacts. */
  readonly impact?: MotionTelemetryImpact;
}

export type MotionTelemetryVector3 = readonly [number, number, number];

export interface MotionTelemetryImpact {
  readonly sequence: number;
  readonly capturedAt: number;
  /** Impact point mapped from the current hull ellipsoid onto a unit sphere. */
  readonly pointOnHull: MotionTelemetryVector3;
  /** Starboard, up and forward components in the carrier's own frame. */
  readonly impulseBody: MotionTelemetryVector3;
  readonly deltaVelocityBody: MotionTelemetryVector3;
  readonly deltaAngularVelocityBody: MotionTelemetryVector3;
  readonly impulseMagnitude: number;
}

export type MotionInstrumentIndicatorCondition =
  | {
      readonly kind: "phase";
      readonly phases: readonly string[];
    }
  | {
      readonly kind: "metric";
      readonly metricId: string;
      readonly valueIndex?: number;
      readonly fullScale: number;
    };

export interface MotionInstrumentIndicatorDefinition {
  readonly id: string;
  readonly label: string;
  readonly color: string;
  readonly condition: MotionInstrumentIndicatorCondition;
}

/**
 * A physical cockpit display mounted on an authored breakable panel. The
 * runtime supplies only visual glass and powered faces; the panel remains the
 * single structural owner and breaking it removes the entire instrument.
 */
export interface MotionInstrumentDefinition {
  readonly id: string;
  readonly sourceId: string;
  readonly carrierClusterId: string;
  readonly panelPieceId: string;
  readonly pitchMetricId: string;
  readonly rollMetricId: string;
  readonly indicators: readonly MotionInstrumentIndicatorDefinition[];
}

/** `snapshot: null` explicitly closes one source without affecting others. */
export interface MotionTelemetryUpdate {
  readonly sourceId: string;
  readonly snapshot: MotionTelemetrySnapshot | null;
}

export interface MotionTelemetryAvailability {
  /** The carrier has an active movement lifecycle. */
  readonly active: boolean;
  /** It still has measurable linear or angular motion. */
  readonly moving: boolean;
  /** It is not supported by the world beneath it. */
  readonly airborne: boolean;
  /** Off-screen waits and rebuild transactions deliberately stay silent. */
  readonly suppressed?: boolean;
  /** A completed emergency landing remains an active reported flight state. */
  readonly reportWhileStopped?: boolean;
}

/** Shared eligibility rule for airships, trains and future moving clusters. */
export function motionTelemetryAvailable(
  state: MotionTelemetryAvailability,
): boolean {
  return (
    state.active &&
    !state.suppressed &&
    (state.moving || state.airborne || state.reportWhileStopped === true)
  );
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
      (priority === selectedPriority &&
        snapshot.capturedAt > selected.capturedAt)
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
  readonly getSourceSnapshot: (
    sourceId: string,
  ) => MotionTelemetrySnapshot | null;
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
    getSourceSnapshot(sourceId) {
      return sources.get(sourceId) ?? null;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
