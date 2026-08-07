/**
 * ВЫБОР МАШИНЫ ПРИЦЕЛОМ (вердикт Igor 07.08.2026).
 *
 * Когда в сцене летает несколько машин, «чью телеметрию показывать» решает
 * не приоритет источника, а игрок — взглядом. Правила:
 *
 * - выбор НАКОПИТЕЛЬНЫЙ: цель держится в конусе захвата ~0.7 с (мгновенный
 *   выбор дёргается на пролетающих машинах, долгий читается как «не
 *   работает»); накопление показывается на перекрестье;
 * - конус УГЛОВОЙ с добавкой на экранный размер машины: дальняя остаётся
 *   выбираемой без снайперства, ближняя не требует точности;
 * - льгота на выпадение из конуса: обе стороны движутся, короткая потеря
 *   цели не сбрасывает накопление;
 * - выбор ЗАЛИПАЕТ: наблюдение — это смотреть на траекторию, а не держать
 *   машину в прицеле. Снимается только выбором другой машины или концом
 *   полёта выбранной;
 * - если летит ровно одна машина — она выбрана сама (город ведёт себя как
 *   раньше: запустил коптер — телеметрия сама);
 * - пилотируемая машина выбрана всегда и дуэли прицела не отдаётся.
 *
 * Модуль чистый: числа и правила здесь, интеграция с камерой и кадрами — у
 * рантайма.
 */

export const AIM_DWELL_SECONDS = 0.7;
export const AIM_GRACE_SECONDS = 0.3;
/** Базовый конус захвата, рад (~3°); к нему добавляется экранный размер. */
export const AIM_BASE_CAPTURE_ANGLE = (3 * Math.PI) / 180;

export interface AimCandidate {
  readonly id: string;
  /** Угол между взглядом и направлением на центр машины, рад. */
  readonly angle: number;
  /** Полный конус захвата этой машины (база + экранный размер), рад. */
  readonly captureAngle: number;
  /** Машина в полёте: публикует телеметрию, её можно выбирать. */
  readonly flying: boolean;
  /** Игрок в кресле этой машины. */
  readonly piloted: boolean;
}

export interface AimSelectionState {
  readonly selectedId: string | null;
  readonly dwellId: string | null;
  readonly dwellSeconds: number;
  readonly graceSeconds: number;
}

export const IDLE_AIM_SELECTION: AimSelectionState = {
  selectedId: null,
  dwellId: null,
  dwellSeconds: 0,
  graceSeconds: 0,
};

/** Доля накопления для индикации на перекрестье, 0…1. */
export function aimDwellProgress(state: AimSelectionState): number {
  if (!state.dwellId) {
    return 0;
  }
  return Math.max(0, Math.min(1, state.dwellSeconds / AIM_DWELL_SECONDS));
}

export function advanceAimSelection(
  state: AimSelectionState,
  candidates: readonly AimCandidate[],
  deltaSeconds: number,
): AimSelectionState {
  const piloted = candidates.find((candidate) => candidate.piloted);
  if (piloted) {
    return {
      selectedId: piloted.id,
      dwellId: null,
      dwellSeconds: 0,
      graceSeconds: 0,
    };
  }
  const flying = candidates.filter((candidate) => candidate.flying);
  // Конец полёта отпускает выбор; сам полёт держит его сколько угодно.
  let selectedId =
    state.selectedId &&
    flying.some((candidate) => candidate.id === state.selectedId)
      ? state.selectedId
      : null;
  if (!selectedId && flying.length === 1) {
    selectedId = flying[0].id;
  }
  // Цель накопления — лучшая ЛЕТЯЩАЯ машина в конусе, кроме уже выбранной:
  // взгляд на выбранную не должен перезапускать накопление.
  let target: AimCandidate | null = null;
  for (const candidate of flying) {
    if (candidate.id === selectedId) {
      continue;
    }
    if (candidate.angle > candidate.captureAngle) {
      continue;
    }
    if (!target || candidate.angle < target.angle) {
      target = candidate;
    }
  }
  if (target) {
    const dwellSeconds =
      state.dwellId === target.id
        ? state.dwellSeconds + deltaSeconds
        : deltaSeconds;
    if (dwellSeconds >= AIM_DWELL_SECONDS) {
      return {
        selectedId: target.id,
        dwellId: null,
        dwellSeconds: 0,
        graceSeconds: 0,
      };
    }
    return { selectedId, dwellId: target.id, dwellSeconds, graceSeconds: 0 };
  }
  if (state.dwellId) {
    const graceSeconds = state.graceSeconds + deltaSeconds;
    if (graceSeconds <= AIM_GRACE_SECONDS) {
      // Накопление замирает, но не сгорает: обе стороны движутся.
      return {
        selectedId,
        dwellId: state.dwellId,
        dwellSeconds: state.dwellSeconds,
        graceSeconds,
      };
    }
  }
  return { selectedId, dwellId: null, dwellSeconds: 0, graceSeconds: 0 };
}
