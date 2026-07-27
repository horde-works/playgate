import type {
  BreakablePieceDefinition,
  LampEventState,
  MutableAnalogClockDefinition,
  MutableClockTimeSource,
  MutableDisplayCondition,
  MutableDisplayTransitionDefinition,
  MutableMatrixDisplayDefinition,
  MutableSceneObjectDefinition,
  SceneVector3,
} from "./destructionScene.ts";
import { gameClockFraction } from "./timeOfDay.ts";

export interface MutablePieceVisualState {
  readonly visible: boolean;
  readonly position?: SceneVector3;
  readonly rotation?: SceneVector3;
  /** Electrical level for diagnostics and frame-rate-independent fades. */
  readonly level?: number;
  /** Visual proxy for a cell's emitted area while its current ramps. */
  readonly scale?: number;
}

export interface MutableSceneUpdateContext {
  readonly definitions: readonly MutableSceneObjectDefinition[];
  readonly pieceById: ReadonlyMap<string, BreakablePieceDefinition>;
  readonly worldTime: number;
  readonly realTimeMs: number;
  readonly deltaSeconds?: number;
  readonly resolveEventState: (sourceClusterId: string) => LampEventState;
  readonly target: Map<string, MutablePieceVisualState>;
}

const VISIBLE_STATE: MutablePieceVisualState = { visible: true };
const HIDDEN_STATE: MutablePieceVisualState = { visible: false };

const DEFAULT_DISPLAY_TRANSITION: MutableDisplayTransitionDefinition = {
  fadeInSeconds: 0.45,
  fadeOutSeconds: 0.32,
};

function setPieceVisibility(
  target: Map<string, MutablePieceVisualState>,
  pieceId: string,
  visible: boolean,
): void {
  const state = visible ? VISIBLE_STATE : HIDDEN_STATE;
  if (target.get(pieceId) !== state) {
    target.set(pieceId, state);
  }
}

function smoothDisplayLevel(
  current: number,
  target: number,
  deltaSeconds: number | undefined,
  transition: MutableDisplayTransitionDefinition | undefined,
): number {
  if (deltaSeconds === undefined) {
    return target;
  }
  const response = transition ?? DEFAULT_DISPLAY_TRANSITION;
  const duration = target > current
    ? response.fadeInSeconds
    : response.fadeOutSeconds;
  if (duration <= 0) {
    return target;
  }
  const factor = 1 - Math.exp((-3 * Math.max(0, deltaSeconds)) / duration);
  const next = current + (target - current) * factor;
  return Math.abs(target - next) < 0.002 ? target : next;
}

function setPieceElectricalLevel(
  target: Map<string, MutablePieceVisualState>,
  pieceId: string,
  powered: boolean,
  deltaSeconds: number | undefined,
  transition: MutableDisplayTransitionDefinition | undefined,
): void {
  const existing = target.get(pieceId);
  const requested = powered ? 1 : 0;
  const current = existing?.level ?? (
    existing ? (existing.visible ? 1 : 0) : requested
  );
  const level = smoothDisplayLevel(current, requested, deltaSeconds, transition);
  const state = level <= 0
    ? HIDDEN_STATE
    : level >= 1
      ? VISIBLE_STATE
      : {
          visible: true,
          level,
          // Emitted area is proportional to scale², so sqrt keeps the
          // perceived electrical ramp approximately linear.
          scale: Math.sqrt(level),
        };
  if (target.get(pieceId) !== state) {
    target.set(pieceId, state);
  }
}

function normalizedFraction(value: number): number {
  return ((value % 1) + 1) % 1;
}

export function clockTimeFraction(
  source: MutableClockTimeSource,
  worldTime: number,
  realTimeMs: number,
): number {
  if (source.kind === "game") {
    return normalizedFraction(
      gameClockFraction(worldTime) + (source.offsetMinutes ?? 0) / 1440,
    );
  }

  if (source.utcOffsetMinutes !== undefined) {
    return normalizedFraction(
      realTimeMs / 86_400_000 + source.utcOffsetMinutes / 1440,
    );
  }

  const local = new Date(realTimeMs);
  return (
    local.getHours() * 3_600_000 +
    local.getMinutes() * 60_000 +
    local.getSeconds() * 1_000 +
    local.getMilliseconds()
  ) / 86_400_000;
}

export function analogClockHandState(
  piece: BreakablePieceDefinition,
  pivot: SceneVector3,
  turns: number,
  clockwise: 1 | -1 = 1,
): MutablePieceVisualState {
  const angle = normalizedFraction(turns) * Math.PI * 2;
  const halfLength = piece.size[1] / 2;
  return {
    visible: true,
    position: [
      pivot[0] + Math.sin(angle) * halfLength * clockwise,
      pivot[1] + Math.cos(angle) * halfLength,
      piece.position[2],
    ],
    rotation: [
      piece.rotation?.[0] ?? 0,
      piece.rotation?.[1] ?? 0,
      -angle * clockwise,
    ],
  };
}

function updateAnalogClock(
  definition: MutableAnalogClockDefinition,
  context: MutableSceneUpdateContext,
): void {
  const fraction = clockTimeFraction(
    definition.timeSource,
    context.worldTime,
    context.realTimeMs,
  );
  const hour = context.pieceById.get(definition.hourHandPieceId);
  const minute = context.pieceById.get(definition.minuteHandPieceId);
  if (!hour || !minute) {
    return;
  }
  const direction = definition.clockwise ?? 1;
  context.target.set(
    hour.id,
    analogClockHandState(hour, definition.pivot, fraction * 2, direction),
  );
  context.target.set(
    minute.id,
    analogClockHandState(minute, definition.pivot, fraction * 24, direction),
  );
}

export function digitalClockText(
  fraction: number,
  format: "HHMM" | "HH:MM" = "HH:MM",
): string {
  const totalMinutes = Math.floor(normalizedFraction(fraction) * 1440) % 1440;
  const hours = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
  const minutes = String(totalMinutes % 60).padStart(2, "0");
  return format === "HHMM" ? `${hours}${minutes}` : `${hours}:${minutes}`;
}

function conditionMatches(
  condition: MutableDisplayCondition | undefined,
  resolveEventState: MutableSceneUpdateContext["resolveEventState"],
): boolean {
  if (!condition) {
    return true;
  }
  return condition.states.includes(resolveEventState(condition.sourceClusterId));
}

function updateMatrixDisplay(
  definition: MutableMatrixDisplayDefinition,
  context: MutableSceneUpdateContext,
): void {
  const active = new Set<string>();
  for (const frame of definition.frames) {
    if (!conditionMatches(frame.condition, context.resolveEventState)) {
      continue;
    }
    for (const pieceId of frame.activePieceIds) {
      active.add(pieceId);
    }
  }
  for (const pieceId of definition.cellPieceIds) {
    setPieceElectricalLevel(
      context.target,
      pieceId,
      active.has(pieceId),
      context.deltaSeconds,
      definition.transition,
    );
  }
}

/** Update every mutable piece from world time, real time and shared events. */
export function updateMutableSceneObjects(
  context: MutableSceneUpdateContext,
): void {
  for (const definition of context.definitions) {
    if (definition.kind === "analogClock") {
      updateAnalogClock(definition, context);
      continue;
    }
    if (definition.kind === "digitalClock") {
      const text = digitalClockText(
        clockTimeFraction(
          definition.timeSource,
          context.worldTime,
          context.realTimeMs,
        ),
        definition.format,
      );
      definition.slots.forEach((slot, index) => {
        const visible = new Set(slot.characters[text[index]] ?? []);
        const all = new Set(Object.values(slot.characters).flat());
        for (const pieceId of all) {
          setPieceVisibility(context.target, pieceId, visible.has(pieceId));
        }
      });
      continue;
    }
    if (definition.kind === "matrixDisplay") {
      updateMatrixDisplay(definition, context);
      continue;
    }
    const active = new Set<string>();
    const controlled = new Set<string>();
    for (const layer of definition.layers) {
      const visible = conditionMatches(layer.condition, context.resolveEventState);
      for (const pieceId of layer.pieceIds) {
        controlled.add(pieceId);
        if (visible) {
          active.add(pieceId);
        }
      }
    }
    for (const pieceId of controlled) {
      setPieceElectricalLevel(
        context.target,
        pieceId,
        active.has(pieceId),
        context.deltaSeconds,
        definition.transition,
      );
    }
  }
}

export function pieceWithMutableState(
  piece: BreakablePieceDefinition,
  state: MutablePieceVisualState | undefined,
): BreakablePieceDefinition {
  if (!state?.position && !state?.rotation) {
    return piece;
  }
  return {
    ...piece,
    position: state.position ?? piece.position,
    rotation: state.rotation ?? piece.rotation,
  };
}
