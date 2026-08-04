/**
 * Отчёт машины о том, чем она занята, пока мира ещё нет на экране.
 *
 * Между «нажал на мир» и «мир виден» стоит несколько секунд, и до сих пор
 * они были немыми: страница каталога просто не менялась, а потом карточка
 * запуска сообщала «собираем мир» одной неподвижной строкой. Пользователь
 * не мог отличить работу от зависания.
 *
 * ЧЕСТНЫЕ ВЕХИ. Прогресс собран не из выдуманных процентов, а из четырёх
 * событий, каждое из которых действительно происходит:
 *   requested     — игрок выбрал мир;
 *   codeReady     — код мира загружен и выполнен, геометрия сцены посчитана
 *                   (именно здесь живут замеренные 1.3 с деревни и 3.2 с
 *                   города, см. worldEntryPresentation);
 *   rendererReady — создан контекст WebGL;
 *   firstFrame    — первый кадр мира ДЕЙСТВИТЕЛЬНО нарисован.
 *
 * Последняя веха — новая. Прежний флаг `ready` поднимался на создании
 * рендерера, то есть до сборки поддерева сцены, запекания света и компиляции
 * шейдеров: он обещал готовность раньше, чем она наступала.
 *
 * ПОЧЕМУ ПОЛОСА, А НЕ ПРОЦЕНТЫ. Главный поток на стадии сборки заморожен —
 * ни один счётчик не обновится, а замерший на «37%» текст читается как
 * поломка. Двигаться в это время может только то, что ведёт композитор:
 * прозрачность и трансформации. Поэтому цифр здесь нет, а полоса — это
 * CSS-переход к потолку стадии, запущенный ДО заморозки. Он доезжает сам.
 *
 * ПОЛОСА НЕ ВРЁТ. Внутри стадии она asymptotically подходит к потолку и
 * никогда его не пересекает, а потолок последней стадии — не единица.
 * Полную шкалу закрывает только настоящий первый кадр. Полоса может отстать
 * от реальности, но не может её обогнать.
 */

export type WorldBootPhase = "loading" | "building" | "painting";

/** Порядок вех — он же порядок стадий: веха закрывает стадию перед собой. */
export const WORLD_BOOT_MILESTONES = [
  "requested",
  "codeReady",
  "rendererReady",
  "firstFrame",
] as const;

export type WorldBootMilestone = (typeof WORLD_BOOT_MILESTONES)[number];

export interface WorldBootState {
  /** Индекс последней достигнутой вехи; -1 — ничего не грузится. */
  readonly reached: number;
  /** Название мира для подписи; null, если вход не через каталог. */
  readonly world: string | null;
  /**
   * Отчёт отозван, и вехи этого входа больше не имеют силы.
   *
   * Без этого флага отзыв не работал: вехи продолжают приходить и сами по
   * себе поднимают отчёт заново. Прилёт гасил бы его на своей заслонке — и
   * тут же получал бы обратно на создании контекста, а сдавшийся по дедлайну
   * экран мигал бы отчётом на первом же кадре.
   */
  readonly withdrawn: boolean;
}

export type WorldBootEvent =
  | { readonly kind: "requested"; readonly world: string | null }
  | {
      readonly kind: "reached";
      readonly milestone: WorldBootMilestone;
      readonly world?: string | null;
    }
  | { readonly kind: "abandoned" };

interface WorldBootSegment {
  readonly phase: WorldBootPhase;
  /** Потолок стадии: полоса упирается в него и ждёт настоящую веху. */
  readonly ceiling: number;
  /** За сколько полоса доходит до потолка. */
  readonly approachMs: number;
}

/**
 * Времена подхода — не обещания, а форма движения. Кривая перехода
 * (cubic-bezier с быстрым началом) проходит большую часть отрезка за первую
 * треть времени, поэтому короткая стадия выглядит быстрой, а длинная —
 * замедляющейся, но живой.
 *
 * Доли отрезков сняты с замера входа в город, а не назначены поровну:
 * загрузка с расчётом геометрии и отрисовка первого кадра стоят секунд,
 * а создание контекста между ними — доли секунды. Ровные трети дали бы
 * полосу, которая замирает на первой и пролетает вторую.
 */
const SEGMENTS: readonly WorldBootSegment[] = [
  { phase: "loading", ceiling: 0.45, approachMs: 3400 },
  { phase: "building", ceiling: 0.58, approachMs: 700 },
  { phase: "painting", ceiling: 0.96, approachMs: 3200 },
];

export const WORLD_BOOT_STEP_COUNT = SEGMENTS.length;

/** Закрытие шкалы после настоящего первого кадра — уже не ожидание, а точка. */
const SETTLE_MS = 260;

/**
 * Страховка тем же смыслом, что и у заслонки: зависшая загрузка обязана
 * закончиться обычным входом, а не вечной полосой. Дедлайн заведомо выше
 * любой честной сборки (город на dev-сервере — около десяти секунд).
 */
export const WORLD_BOOT_TIMEOUT_MS = 30_000;

export function initialWorldBootState(): WorldBootState {
  return { reached: -1, world: null, withdrawn: false };
}

function milestoneIndex(milestone: WorldBootMilestone): number {
  return WORLD_BOOT_MILESTONES.indexOf(milestone);
}

export function reduceWorldBoot(
  state: WorldBootState,
  event: WorldBootEvent,
): WorldBootState {
  switch (event.kind) {
    case "requested": {
      // Новый выбор мира — единственное, что снимает отзыв: это уже другой
      // вход, и его вехи снова имеют силу.
      if (state.reached >= 0 && !state.withdrawn) {
        // Повторная просьба во время идущей загрузки не откатывает её назад:
        // прогресс монотонен, иначе полоса дёргалась бы на каждом клике.
        return event.world && event.world !== state.world
          ? { ...state, world: event.world }
          : state;
      }
      return { reached: 0, world: event.world, withdrawn: false };
    }
    case "reached": {
      if (state.withdrawn) {
        return state;
      }
      const index = milestoneIndex(event.milestone);
      // Мир называет себя сам: по прямой ссылке имени из каталога не было.
      const world = event.world ?? state.world;
      // Веха подразумевает все предыдущие: прямой заход по ссылке начинается
      // сразу с готового кода, и стадию загрузки надо не показать, а пропустить.
      if (index <= state.reached) {
        return world === state.world ? state : { ...state, world };
      }
      return { ...state, reached: index, world };
    }
    case "abandoned": {
      return state.withdrawn
        ? state
        : { reached: -1, world: null, withdrawn: true };
    }
  }
}

export function worldBootDone(state: WorldBootState): boolean {
  return state.reached >= milestoneIndex("firstFrame");
}

export interface WorldBootPlan {
  /** Экран занят отчётом о загрузке. */
  readonly visible: boolean;
  readonly phase: WorldBootPhase;
  /** Человеческий номер стадии: «02 / 03». */
  readonly step: number;
  readonly stepCount: number;
  /** Куда едет полоса — доля от 0 до 1. */
  readonly target: number;
  /** За сколько она туда доезжает. */
  readonly approachMs: number;
  /** Мир нарисован: шкала закрыта, отчёт уходит. */
  readonly settled: boolean;
}

const IDLE_PLAN: WorldBootPlan = {
  visible: false,
  phase: "loading",
  step: 1,
  stepCount: WORLD_BOOT_STEP_COUNT,
  target: 0,
  approachMs: 0,
  settled: false,
};

export function worldBootPlan(state: WorldBootState): WorldBootPlan {
  if (state.reached < 0) {
    return IDLE_PLAN;
  }
  if (worldBootDone(state)) {
    return {
      visible: true,
      phase: SEGMENTS[SEGMENTS.length - 1].phase,
      step: SEGMENTS.length,
      stepCount: WORLD_BOOT_STEP_COUNT,
      target: 1,
      approachMs: SETTLE_MS,
      settled: true,
    };
  }
  const segment = SEGMENTS[state.reached];
  return {
    visible: true,
    phase: segment.phase,
    step: state.reached + 1,
    stepCount: WORLD_BOOT_STEP_COUNT,
    target: segment.ceiling,
    approachMs: segment.approachMs,
    settled: false,
  };
}

export type WorldBootCopyKey =
  | "boot.loading"
  | "boot.building"
  | "boot.painting";

export function worldBootCopyKey(phase: WorldBootPhase): WorldBootCopyKey {
  switch (phase) {
    case "loading":
      return "boot.loading";
    case "building":
      return "boot.building";
    case "painting":
      return "boot.painting";
  }
}

/* ── Хранилище ──────────────────────────────────────────────────────────────
   Отчёт переживает смену маршрута: просьба приходит со страницы каталога, а
   вехи — уже из мира, который её вытеснил. Дерево React между этими двумя
   моментами пересобирается целиком, поэтому состояние живёт вне него.

   Вехи приходят и из модулей, которые выполняются до первой отрисовки,
   поэтому здесь нет ни React, ни обращений к window на уровне модуля. */

const SERVER_IDLE = initialWorldBootState();

let current = initialWorldBootState();
const listeners = new Set<() => void>();

export function getWorldBootState(): WorldBootState {
  return current;
}

/** На сервере ничего не грузится: статика одна на всех, отчёт — клиентский. */
export function getServerWorldBootState(): WorldBootState {
  return SERVER_IDLE;
}

export function subscribeWorldBoot(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function dispatchWorldBoot(event: WorldBootEvent): void {
  const next = reduceWorldBoot(current, event);
  if (next === current) {
    return;
  }
  current = next;
  for (const listener of listeners) {
    listener();
  }
}

/** Игрок выбрал мир: отчёт обязан появиться в том же кадре, что и клик. */
export function requestWorldBoot(world: string | null): void {
  dispatchWorldBoot({ kind: "requested", world });
}

/** Веха достигнута. Вызывается из мира; порядок и повторы безопасны. */
export function markWorldBoot(
  milestone: WorldBootMilestone,
  world?: string | null,
): void {
  dispatchWorldBoot({ kind: "reached", milestone, world });
}

/**
 * Отчёт отзывается: вход отменён, не уложился в дедлайн, закончился штатно
 * или кадром завладела авторская сцена прилёта. Оставшиеся вехи этого входа
 * после отзыва молчат — вернуть отчёт может только новый выбор мира.
 */
export function abandonWorldBoot(): void {
  dispatchWorldBoot({ kind: "abandoned" });
}
