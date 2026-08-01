interface ShotTraceEvent {
  readonly atMs: number;
  readonly label: string;
  readonly durationMs?: number;
  readonly data?: Readonly<Record<string, unknown>>;
}

interface ShotTrace {
  readonly id: number;
  readonly startedAt: number;
  outcome: string;
  readonly events: ShotTraceEvent[];
  frameCount: number;
  slowFrameCount: number;
  maxFrameMs: number;
}

const TRACE_WINDOW_MS = 3_500;
const SLOW_FRAME_MS = 25;
const traces = new Map<number, ShotTrace>();
let nextTraceId = 0;
let observerInstalled = false;

function enabled(): boolean {
  return (
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).has("perfTrace")
  );
}

function addEvent(
  trace: ShotTrace,
  label: string,
  durationMs?: number,
  data?: Readonly<Record<string, unknown>>,
): void {
  trace.events.push({
    atMs: performance.now() - trace.startedAt,
    label,
    durationMs,
    data,
  });
}

function installLongTaskObserver(): void {
  if (observerInstalled || typeof PerformanceObserver === "undefined") return;
  observerInstalled = true;
  try {
    const observer = new PerformanceObserver((list) => {
      const now = performance.now();
      for (const entry of list.getEntries()) {
        for (const trace of traces.values()) {
          if (now - trace.startedAt <= TRACE_WINDOW_MS) {
            addEvent(trace, "main_thread_long_task", entry.duration, {
              entryStartMs: entry.startTime - trace.startedAt,
            });
          }
        }
      }
    });
    observer.observe({ entryTypes: ["longtask"] });
  } catch {
    // Some browsers expose PerformanceObserver but not the Long Tasks API.
  }
}

export function startShotPerformanceTrace(): number | null {
  if (!enabled()) return null;
  installLongTaskObserver();
  nextTraceId += 1;
  const trace: ShotTrace = {
    id: nextTraceId,
    startedAt: performance.now(),
    outcome: "unknown",
    events: [],
    frameCount: 0,
    slowFrameCount: 0,
    maxFrameMs: 0,
  };
  traces.set(trace.id, trace);
  window.setTimeout(() => {
    traces.delete(trace.id);
    const report = {
      id: trace.id,
      outcome: trace.outcome,
      elapsedMs: performance.now() - trace.startedAt,
      frameCount: trace.frameCount,
      slowFrameCount: trace.slowFrameCount,
      maxFrameMs: trace.maxFrameMs,
      events: trace.events,
    };
    console.info(`[MAM_PERF_TRACE] ${JSON.stringify(report)}`);
  }, TRACE_WINDOW_MS);
  return trace.id;
}

export function setShotPerformanceOutcome(
  traceId: number | null,
  outcome: string,
  data?: Readonly<Record<string, unknown>>,
): void {
  if (traceId === null) return;
  const trace = traces.get(traceId);
  if (!trace) return;
  trace.outcome = outcome;
  addEvent(trace, "outcome", undefined, data);
}

export function markShotPerformance(
  traceId: number | null,
  label: string,
  durationMs?: number,
  data?: Readonly<Record<string, unknown>>,
): void {
  if (traceId === null) return;
  const trace = traces.get(traceId);
  if (!trace) return;
  addEvent(trace, label, durationMs, data);
}

/** Marks asynchronous React/Three work against every recent traced shot. */
export function markActiveShotPerformance(
  label: string,
  durationMs?: number,
  data?: Readonly<Record<string, unknown>>,
): void {
  if (!enabled()) return;
  const now = performance.now();
  for (const trace of traces.values()) {
    if (now - trace.startedAt <= TRACE_WINDOW_MS) {
      addEvent(trace, label, durationMs, data);
    }
  }
}

export function recordShotPerformanceFrame(deltaSeconds: number): void {
  if (traces.size === 0) return;
  const frameMs = deltaSeconds * 1_000;
  const now = performance.now();
  for (const trace of traces.values()) {
    if (now - trace.startedAt > TRACE_WINDOW_MS) continue;
    trace.frameCount += 1;
    trace.maxFrameMs = Math.max(trace.maxFrameMs, frameMs);
    if (frameMs >= SLOW_FRAME_MS) {
      trace.slowFrameCount += 1;
      addEvent(trace, "slow_frame", frameMs);
    }
  }
}
