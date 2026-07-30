import type { IslandId } from "./islandTopology.ts";

/**
 * Единственный источник правды о том, ЧТО сейчас на экране.
 *
 * До этого модуля каждый блок интерфейса решал сам: «показываться ли мне»
 * сводилось к `!cinematicActive`. Поэтому во время межостровного рейса
 * панель цели считала разрушенное, нижняя полоса обещала WASD и прыжок, а
 * титр смены оружия ложился поверх приветствия острова.
 *
 * Правило простое: сцена входа — это СТАДИЯ, стадия задаёт набор
 * поверхностей, поверхность не имеет права появиться вне своего набора.
 *
 * Сборка мира занимает секунды (замерено: деревня ~1.3 с, город ~3.2 с
 * замершего главного потока), и никакая перезагрузка это не изменит.
 * Поэтому заслонка обязана пережить замерший поток: она глухая, и
 * единственное, что ей разрешено анимировать, — прозрачность, которую
 * тянет композитор без участия главного потока.
 */
export type WorldEntryStage =
  /** Клиент ещё не прочитал URL: сценарий входа неизвестен. */
  | "boot"
  /** Штатный вход: карточка запуска владеет кадром. */
  | "gate"
  /** Прилёт: глухая заслонка, мир строится, игрока ставят на борт. */
  | "sealed"
  /** Прилёт: мир построен, заслонка расходится. */
  | "revealing"
  /** Ты пассажир межостровного рейса: мир виден, управления полётом нет. */
  | "transit"
  /** Обычная игра. */
  | "playing"
  /** Уход: заслонка сходится, ввод уже мёртв, навигация в конце. */
  | "departing"
  /** Кинематографический пролёт. */
  | "cinematic";

export type WorldEntryScenario = "standing" | "arriving";

export interface WorldEntryState {
  readonly stage: WorldEntryStage;
  readonly scenario: WorldEntryScenario;
  /** Остров, откуда пришёл рейс (прилёт) или куда уходит (отправление). */
  readonly origin: IslandId | null;
  readonly destination: IslandId | null;
  /** Мир построен: canvas создан и сцена собрана. */
  readonly worldReady: boolean;
  /** Игрок физически поставлен на борт прилетающего носителя. */
  readonly carrierBoarded: boolean;
  /** Стадия, в которую вернётся кадр после пролёта. */
  readonly resumeStage: WorldEntryStage | null;
}

export type WorldEntryEvent =
  | { readonly kind: "scenarioResolved"; readonly scenario: "standing" }
  | {
      readonly kind: "scenarioResolved";
      readonly scenario: "arriving";
      readonly origin: IslandId;
      readonly destination: IslandId;
    }
  | { readonly kind: "worldReady" }
  | { readonly kind: "carrierBoarded" }
  | { readonly kind: "shutterOpened" }
  | { readonly kind: "flightDocked" }
  | { readonly kind: "playerEntered" }
  | {
      readonly kind: "interIslandBoarded";
      readonly origin: IslandId;
      readonly destination: IslandId;
    }
  | { readonly kind: "controlReleased" }
  | {
      readonly kind: "departureRequested";
      readonly origin: IslandId;
      readonly destination: IslandId;
    }
  | { readonly kind: "cinematicStarted" }
  | { readonly kind: "cinematicEnded" }
  | { readonly kind: "sealTimedOut" };

/**
 * Страховка, а не гонка: город собирается ~10 с на dev-сервере, поэтому
 * дедлайн стоит заведомо выше любой честной сборки. Его смысл в том, что
 * зависшая заслонка обязана закончиться штатным входом, а не вечным туманом.
 */
export const WORLD_SEAL_TIMEOUT_MS = 30_000;

export function initialWorldEntryState(): WorldEntryState {
  return {
    stage: "boot",
    scenario: "standing",
    origin: null,
    destination: null,
    worldReady: false,
    carrierBoarded: false,
    resumeStage: null,
  };
}

/** Заслонка расходится только когда выполнены ОБА условия прилёта. */
function sealedNext(state: WorldEntryState): WorldEntryState {
  return state.worldReady && state.carrierBoarded
    ? { ...state, stage: "revealing" }
    : state;
}

export function reduceWorldEntry(
  state: WorldEntryState,
  event: WorldEntryEvent,
): WorldEntryState {
  switch (event.kind) {
    case "scenarioResolved": {
      if (state.stage !== "boot") {
        return state;
      }
      if (event.scenario === "standing") {
        return { ...state, stage: "gate", scenario: "standing" };
      }
      return {
        ...state,
        stage: "sealed",
        scenario: "arriving",
        origin: event.origin,
        destination: event.destination,
      };
    }
    case "worldReady": {
      const ready = { ...state, worldReady: true };
      return ready.stage === "sealed" ? sealedNext(ready) : ready;
    }
    case "carrierBoarded": {
      const boarded = { ...state, carrierBoarded: true };
      return boarded.stage === "sealed" ? sealedNext(boarded) : boarded;
    }
    case "shutterOpened": {
      // После раскрытия ты ещё минуту пассажир: рейс продолжается, и кадр
      // обязан это показывать. Приветствие острова — не конец перелёта.
      return state.stage === "revealing" ? { ...state, stage: "transit" } : state;
    }
    case "flightDocked": {
      return state.stage === "transit" || state.stage === "revealing"
        ? { ...state, stage: "playing" }
        : state;
    }
    case "playerEntered": {
      return state.stage === "gate" ? { ...state, stage: "playing" } : state;
    }
    case "interIslandBoarded": {
      // Перелёт начинается на причале, а не на кромке карты. Раньше стадия
      // ждала пересечения границы, и до неё игрок минуту летел пассажиром под
      // интерфейсом пешехода: счётчик разрушенного, «SPACE — прыжок» и титр
      // «Пустые руки», которых он не просил.
      return state.stage === "playing"
        ? {
            ...state,
            stage: "transit",
            origin: event.origin,
            destination: event.destination,
          }
        : state;
    }
    case "controlReleased": {
      // В обычной игре Escape — это пауза с карточкой. В транзите паузы нет:
      // ты не управляешь рейсом, отбирать нечего, и подсунуть карточку
      // запуска мира, в котором ты уже находишься, было бы враньём.
      return state.stage === "playing" ? { ...state, stage: "gate" } : state;
    }
    case "departureRequested": {
      if (state.stage === "departing") {
        return state;
      }
      return {
        ...state,
        stage: "departing",
        origin: event.origin,
        destination: event.destination,
      };
    }
    case "cinematicStarted": {
      return state.stage === "cinematic"
        ? state
        : { ...state, stage: "cinematic", resumeStage: state.stage };
    }
    case "cinematicEnded": {
      return state.stage === "cinematic"
        ? { ...state, stage: state.resumeStage ?? "gate", resumeStage: null }
        : state;
    }
    case "sealTimedOut": {
      // Честный откат: носитель не собрался, значит входим как все — в
      // штатной точке и через обычные ворота, а не висим в заслонке.
      return state.stage === "sealed"
        ? {
            ...state,
            stage: "gate",
            scenario: "standing",
            origin: null,
            destination: null,
          }
        : state;
    }
  }
}

export type ShutterKind = "none" | "boot" | "arrival" | "departure";

export interface FrameSurfaces {
  /** Панель цели, нижняя полоса управления, чипы режима, прицел, осадный таймер. */
  readonly worldHud: boolean;
  /** Карточка запуска мира. */
  readonly gateCard: boolean;
  readonly shutter: ShutterKind;
  /** Заслонка расходится: анимация только по прозрачности. */
  readonly shutterOpening: boolean;
  /** Строка «идёт рейс» вместо пешеходного интерфейса. */
  readonly transitBanner: boolean;
  /** Подсказки взаимодействия (двери, посадка, места). */
  readonly actionHints: boolean;
  /** Титры смены режима и оружия. */
  readonly modeAnnouncements: boolean;
  /** Кадр вообще принимает ввод игрока. */
  readonly acceptsInput: boolean;
  /** Кадру нужен захват указателя, и он вправе о нём просить. */
  readonly wantsPointerLock: boolean;
}

const HIDDEN: FrameSurfaces = {
  worldHud: false,
  gateCard: false,
  shutter: "none",
  shutterOpening: false,
  transitBanner: false,
  actionHints: false,
  modeAnnouncements: false,
  acceptsInput: false,
  wantsPointerLock: false,
};

export function frameSurfaces(stage: WorldEntryStage): FrameSurfaces {
  switch (stage) {
    case "boot":
      // Карточка запуска существует уже здесь, под глухой заслонкой. Серверу
      // сценарий входа неизвестен — он один на все запросы, — поэтому по
      // умолчанию страница готовит штатный вход. Видно её не будет: если
      // клиент прочтёт прилёт, заслонка останется на месте и карточка уйдёт
      // не мелькнув, а если штатный вход — заслонка просто поднимется с неё.
      return { ...HIDDEN, shutter: "boot", gateCard: true };
    case "gate":
      return { ...HIDDEN, gateCard: true };
    case "sealed":
      return { ...HIDDEN, shutter: "arrival" };
    case "revealing":
      // Баннер рейса ждёт своей очереди: пока на экране приветствие острова,
      // вторая строка внизу — это ровно та мешанина, ради которой всё
      // затевалось. Он выходит, когда подпись уже ушла вместе с заслонкой.
      return {
        ...HIDDEN,
        shutter: "arrival",
        shutterOpening: true,
        acceptsInput: true,
      };
    case "transit":
      return {
        ...HIDDEN,
        transitBanner: true,
        acceptsInput: true,
        wantsPointerLock: true,
      };
    case "playing":
      return {
        ...HIDDEN,
        worldHud: true,
        actionHints: true,
        modeAnnouncements: true,
        acceptsInput: true,
        wantsPointerLock: true,
      };
    case "departing":
      // Ввод умирает на первом кадре ухода: анимация — это событие, а не фон,
      // поверх которого можно ещё успеть махнуть молотом.
      return { ...HIDDEN, shutter: "departure" };
    case "cinematic":
      return HIDDEN;
  }
}

/**
 * Один слот нижней подписи вместо двух независимых элементов в одном месте
 * экрана. Транзит вытесняет всё: пока ты пассажир, никакая смена оружия не
 * имеет права спорить с названием острова.
 */
export type CaptionPriority = "telemetry" | "player" | "transit";

const CAPTION_RANK: Readonly<Record<CaptionPriority, number>> = {
  telemetry: 0,
  player: 1,
  transit: 2,
};

export function captionAccepts(
  current: CaptionPriority | null,
  incoming: CaptionPriority,
): boolean {
  return current === null || CAPTION_RANK[incoming] >= CAPTION_RANK[current];
}

/**
 * Титр режима сообщает о РЕШЕНИИ ИГРОКА. Смена оружия на «пустые руки» при
 * входе в пассажирский режим решением игрока не является, и объявлять её —
 * значит врать о причине.
 */
export function announcesPlayerChoice(
  stage: WorldEntryStage,
  previousStage: WorldEntryStage,
): boolean {
  return stage === "playing" && previousStage === "playing";
}

/**
 * Что говорит подпись на каждой стадии. Заслонка называет остров, к которому
 * она стоит: на уходе — тот, куда уходим, на закрытой — тот, что строится, на
 * раскрытии — тот, в который приехали.
 */
export function shutterCaptionMessage(
  stage: WorldEntryStage,
): "departingFor" | "enteringAirspace" | "welcome" | null {
  if (stage === "departing") {
    return "departingFor";
  }
  if (stage === "sealed") {
    return "enteringAirspace";
  }
  return stage === "revealing" ? "welcome" : null;
}

/**
 * Баннер идущего рейса зависит от того, с какой стороны перехода мы стоим:
 * в мире вылета он говорит «уходим», в мире прилёта — «заходим на швартовку».
 * Одна и та же стадия, разные половины одного события.
 */
export function transitBannerMessage(
  stage: WorldEntryStage,
  scenario: WorldEntryScenario,
): "departingFor" | "approach" | null {
  if (stage !== "transit") {
    return null;
  }
  return scenario === "arriving" ? "approach" : "departingFor";
}

export type TransitLeg = "arrival" | "departure";

export function transitLeg(stage: WorldEntryStage): TransitLeg | null {
  if (stage === "sealed" || stage === "revealing" || stage === "transit") {
    return "arrival";
  }
  return stage === "departing" ? "departure" : null;
}
