export type TownPlanPoint = readonly [x: number, z: number];

// ---------------------------------------------------------------------------
// Разметка первой карты: как по городу ХОДЯТ и куда ходить незачем.
//
// Это не декорация и не маска грязи (та живёт в townSurfacePlan.ts и красит
// газон). Здесь — смысловой слой: проезжая часть как преграда, переходы как
// единственные законные створы, тротуары, дворовые дорожки, подъезды с
// вместимостью и места с авторским притяжением.
//
// Все координаты сняты с построенной сцены, а не придуманы: опись собрана
// обходом townScene.breakableClusters (312 кластеров, 19 225 кусков), каждая
// линия проверена на просвет детектором. Правило деревни действует и тут:
// тропа не имеет права упираться в непроходимое без обхода.
// ---------------------------------------------------------------------------

/** Проезжая часть. Пешеход её пересекает только в створах townCrossings. */
export interface TownRoadway {
  readonly id: string;
  readonly purpose: string;
  /** Вдоль какой оси идёт улица. */
  readonly axis: "x" | "z";
  /** Координата осевой по поперечной оси. */
  readonly center: number;
  /** Полуширина полотна (без бордюра). */
  readonly halfWidth: number;
  /** Отрезок улицы по её оси. */
  readonly from: number;
  readonly to: number;
}

export type TownWayKind =
  /** Тротуар вдоль проезжей части. */
  | "pavement"
  /** Створ через проезжую часть. */
  | "crossing"
  /** Дворовый проезд или дорожка внутри квартала. */
  | "yard"
  /** Короткий подвод к двери или подъезду. */
  | "approach"
  /** Протоптанное по газону, вне асфальта. */
  | "path"
  /** Хозяйственный проезд: гаражи, задворки, объезд раскопа. */
  | "service";

export interface TownWay {
  readonly id: string;
  readonly purpose: string;
  readonly kind: TownWayKind;
  readonly points: readonly TownPlanPoint[];
  /** Полуширина коридора в метрах. */
  readonly width: number;
  /** Для створов: размечен ли зеброй. Неразмеченный — народный переход. */
  readonly marked?: boolean;
  /**
   * Конец тропы, который законно никуда не ведёт: она выходит в открытое поле
   * и там глохнет. Всё остальное обязано быть связано.
   */
  readonly fade?: boolean;
}

/**
 * Подъезд — единица жилья этого города, в отличие от дома в деревне. За одной
 * дверью несколько квартир, поэтому у входа есть вместимость, а на пороге
 * жители встречаются.
 */
export interface TownEntrance {
  readonly id: string;
  readonly buildingId: string;
  readonly label: string;
  /** Точка полотна двери. */
  readonly door: TownPlanPoint;
  /** Префикс кусков створки — по нему навигация узнаёт вход. */
  readonly doorPieceId: string;
  /** Где встать, чтобы попросить открыть. */
  readonly approach: TownPlanPoint;
  /** Куда смотрит дверь, радианы (0 = +x, pi/2 = -z). */
  readonly facing: number;
  readonly floors: number;
  /** Сколько квартир за этой дверью. */
  readonly flats: number;
}

export interface TownArea {
  readonly id: string;
  readonly purpose: string;
  readonly center: TownPlanPoint;
  readonly radius: TownPlanPoint;
  readonly rotation?: number;
}

export type TownDayPart = "morning" | "day" | "evening" | "night";

export type TownRole =
  | "pensioner"
  | "homemaker"
  | "worker"
  | "driver"
  | "yardkeeper"
  | "trader"
  | "child"
  | "teen";

/**
 * Авторское притяжение места — тот самый отдельный необязательный артефакт,
 * что вытащил деревню из геометрического перекоса. Не дошёл — сменил цель.
 */
export interface TownPlaceInterest {
  readonly areaId: string;
  /** Вес места; сравнивается с расстоянием, а не заменяет его. */
  readonly pull: number;
  readonly roles?: readonly string[];
  readonly when?: TownDayPart;
  readonly doing?: "stand" | "sit" | "work";
}

// --- Проезжая часть --------------------------------------------------------
// Полотно снято с town:roads: плитки 6×6, осевые z = -12 и z = -30, поперечная
// x = 42. Бордюр (town:curbs, верх 0.14) переступается, поэтому преграда тут
// смысловая, а не физическая — и держаться она должна на разметке.

export const townRoadways: readonly TownRoadway[] = [
  {
    id: "main-street",
    purpose: "Главная улица: от опушки на западе до гаражного тупика на востоке",
    axis: "x",
    center: -12,
    halfWidth: 3,
    from: -15,
    to: 75,
  },
  {
    id: "south-street",
    purpose: "Южная улица вдоль хрущёвок к4 и к5",
    axis: "x",
    center: -30,
    halfWidth: 3,
    from: -15,
    to: 75,
  },
  {
    id: "cross-lane",
    purpose: "Поперечная улица с двумя перекрёстками",
    axis: "z",
    center: 42,
    halfWidth: 3,
    from: -51,
    to: 21,
  },
] as const;

// --- Пешеходная сеть -------------------------------------------------------

export const townWays: readonly TownWay[] = [
  // === Главная улица, северная сторона ====================================
  // Хрущёвка к1 стоит к улице глухой стеной: между бордюром (-8.88) и
  // лестничными эркерами (-8.0) остаётся 0.44 м — не тротуар. Поэтому на
  // участке дома северный поток уходит во двор через торцевые прогалы.
  {
    id: "main-north-west",
    purpose: "Северный тротуар главной от западной опушки до торца к1",
    kind: "pavement",
    points: [
      [-14.4, -8.6], [-11.0, -8.4], [-8.0, -8.25], [-4.0, -8.35],
      [0.0, -8.45], [4.0, -8.5], [7.6, -8.45], [10.0, -8.25], [10.9, -8.4],
    ],
    width: 0.7,
  },
  {
    id: "k1-gap-west",
    purpose: "Прогал у западного торца к1: с улицы во двор",
    kind: "yard",
    points: [[10.9, -8.4], [10.8, -5.6], [10.8, -2.6], [11.0, 0.4], [11.6, 1.3]],
    width: 0.6,
  },
  {
    id: "k1-gap-east",
    purpose: "Прогал у восточного торца к1: со двора на улицу",
    kind: "yard",
    points: [[35.3, -8.5], [35.2, -5.6], [35.1, -2.6], [34.8, 0.6], [34.0, 1.2]],
    width: 0.6,
  },
  {
    id: "main-north-east",
    purpose: "Северный тротуар от торца к1 до перекрёстка",
    kind: "pavement",
    points: [[35.3, -8.5], [36.6, -8.45], [38.0, -8.5]],
    width: 0.7,
  },
  {
    id: "main-north-far-east",
    purpose: "Северный тротуар за перекрёстком: мимо дома h2 к гаражному тупику",
    kind: "pavement",
    points: [
      [46.0, -8.5], [48.0, -8.3], [52.0, -8.35], [56.0, -8.4], [58.0, -8.25],
      [62.0, -8.4], [66.0, -8.45], [70.0, -8.25], [74.4, -8.5],
    ],
    width: 0.7,
  },

  // === Главная улица, южная сторона =======================================
  {
    id: "main-south-west",
    purpose: "Южный тротуар главной от опушки до торца к2",
    kind: "pavement",
    points: [
      [-14.4, -15.9], [-10.0, -15.8], [-6.8, -15.6], [-3.0, -15.8],
      [1.0, -15.9], [5.0, -15.95], [9.0, -16.0], [12.6, -16.0],
    ],
    width: 0.7,
  },
  {
    id: "k2-frontage",
    purpose: "Вдоль фасада к2 мимо обоих подъездов; бак обходят по кромке проезжей",
    kind: "pavement",
    points: [
      [12.6, -15.7], [14.4, -15.65], [15.54, -15.6], [17.5, -15.65],
      [20.0, -15.7], [22.6, -15.65], [24.5, -15.35], [26.39, -15.6],
      [28.5, -15.65], [31.0, -15.65], [33.4, -15.6], [35.6, -15.7],
    ],
    width: 0.6,
  },
  {
    id: "main-south-east",
    purpose: "Южный тротуар от торца к2 к перекрёстку",
    kind: "pavement",
    points: [[35.6, -15.9], [36.8, -15.8], [38.0, -15.6]],
    width: 0.7,
  },
  {
    id: "k3-frontage",
    purpose: "Южный тротуар за перекрёстком вдоль заброшенной к3",
    kind: "pavement",
    points: [
      [46.0, -15.6], [47.6, -15.65], [50.0, -15.6], [51.54, -15.6],
      [54.0, -15.65], [58.0, -15.7], [62.39, -15.6], [65.0, -15.65],
      [69.0, -15.7], [74.4, -15.9],
    ],
    width: 0.6,
  },

  // === Створы через проезжую часть ========================================
  // Размеченные сняты с town:markings: зебры стоят только у двух перекрёстков
  // на x = 42. Остальные три — народные, по линии желания; они длиннее ничем
  // не оправданного крюка и потому реальны.
  {
    id: "cross-main-west",
    purpose: "Зебра через главную западнее перекрёстка",
    kind: "crossing",
    points: [[37.1, -8.5], [36.9, -12.0], [37.1, -15.6]],
    width: 1.4,
    marked: true,
  },
  {
    id: "cross-main-east",
    purpose: "Зебра через главную восточнее перекрёстка",
    kind: "crossing",
    points: [[46.9, -8.5], [47.1, -12.0], [46.9, -15.6]],
    width: 1.4,
    marked: true,
  },
  {
    id: "cross-lane-north",
    purpose: "Зебра через поперечную севернее первого перекрёстка",
    kind: "crossing",
    points: [[38.1, -7.6], [42.0, -7.4], [45.9, -7.6]],
    width: 1.4,
    marked: true,
  },
  {
    id: "cross-lane-south",
    purpose: "Зебра через поперечную южнее первого перекрёстка",
    kind: "crossing",
    points: [[38.1, -16.5], [42.0, -16.6], [45.9, -16.5]],
    width: 1.4,
    marked: true,
  },
  {
    id: "cross-south-west",
    purpose: "Зебра через южную улицу западнее второго перекрёстка",
    kind: "crossing",
    points: [[36.9, -26.2], [36.9, -30.0], [36.9, -33.6]],
    width: 1.4,
    marked: true,
  },
  {
    id: "cross-south-east",
    purpose: "Зебра через южную улицу восточнее второго перекрёстка",
    kind: "crossing",
    points: [[47.1, -26.2], [47.1, -30.0], [47.1, -33.6]],
    width: 1.4,
    marked: true,
  },
  {
    id: "cross-lane-mid",
    purpose: "Зебра через поперечную севернее второго перекрёстка",
    kind: "crossing",
    points: [[38.0, -25.4], [42.0, -25.4], [46.0, -25.4]],
    width: 1.4,
    marked: true,
  },
  {
    id: "cross-lane-far",
    purpose: "Зебра через поперечную южнее второго перекрёстка",
    kind: "crossing",
    points: [[38.0, -34.6], [42.0, -34.6], [46.0, -34.6]],
    width: 1.4,
    marked: true,
  },
  {
    id: "cross-main-yard",
    purpose: "Народный переход у торца к1: до зебры двадцать пять метров крюка",
    kind: "crossing",
    points: [[11.3, -8.6], [11.8, -12.0], [12.4, -15.9]],
    width: 0.8,
    marked: false,
  },
  {
    id: "cross-south-yard-east",
    purpose: "Народный переход от восточного обхода бетонного забора к к5",
    kind: "crossing",
    points: [[10.4, -26.0], [10.6, -30.0], [11.0, -33.7]],
    width: 0.8,
    marked: false,
  },
  {
    id: "cross-south-yard-west",
    purpose: "Народный переход от западного обхода забора к торцу к4",
    kind: "crossing",
    points: [[-12.4, -26.0], [-12.6, -30.0], [-12.8, -33.8]],
    width: 0.8,
    marked: false,
  },
  {
    id: "cross-lane-yard",
    purpose: "Народный переход поперечной между садом белёного дома и двором к6",
    kind: "crossing",
    points: [[38.0, 13.2], [42.0, 13.4], [45.9, 13.6]],
    width: 0.8,
    marked: false,
  },

  // === Поперечная улица: тротуары =========================================
  {
    id: "lane-west-north",
    purpose: "Западный тротуар поперечной от главной к двору к6",
    kind: "pavement",
    points: [
      [38.0, -8.5], [37.9, -3.0], [38.0, 3.0], [38.0, 9.0],
      [38.0, 13.2], [38.1, 17.0], [38.2, 20.5],
    ],
    width: 0.7,
    fade: true,
  },
  {
    id: "lane-east-north",
    purpose: "Восточный тротуар поперечной к северным подъездам к6",
    kind: "pavement",
    points: [
      [46.0, -8.5], [46.4, -3.0], [46.4, 3.0], [46.3, 9.0],
      [45.9, 13.6], [46.3, 17.5], [47.3, 21.0],
    ],
    width: 0.7,
  },
  {
    id: "lane-west-mid",
    purpose: "Западный тротуар поперечной между перекрёстками",
    kind: "pavement",
    points: [[38.0, -15.6], [37.8, -20.0], [37.9, -25.4]],
    width: 0.7,
  },
  {
    id: "lane-east-mid",
    purpose: "Восточный тротуар поперечной между перекрёстками",
    kind: "pavement",
    points: [[46.0, -15.6], [46.4, -20.0], [46.4, -24.0], [46.1, -25.4]],
    width: 0.7,
  },
  {
    id: "lane-west-south",
    purpose: "Западный тротуар поперечной на юг, к асфальтовому отвороту усадьбы",
    kind: "pavement",
    points: [[37.9, -34.6], [38.2, -38.5], [38.4, -42.6], [38.5, -45.6], [38.0, -48.5]],
    width: 0.7,
    fade: true,
  },
  {
    id: "lane-east-south",
    purpose: "Восточный тротуар поперечной на юг вдоль луга",
    kind: "pavement",
    points: [[46.1, -34.6], [46.2, -39.0], [46.4, -44.0], [46.0, -48.0]],
    width: 0.7,
    fade: true,
  },

  // === Южная улица ========================================================
  // Северная кромка на участке x = -11.3..9.7 занята бетонным забором
  // (town:fence, верх 1.92): тротуара там нет физически, его обходят с торцов.
  {
    id: "south-north-east",
    purpose: "Северный тротуар южной улицы от восточного торца забора к перекрёстку",
    kind: "pavement",
    points: [
      [10.6, -26.1], [14.0, -26.2], [18.0, -26.1], [22.0, -26.3],
      [26.0, -26.1], [30.0, -26.0], [33.5, -26.05], [36.6, -26.1],
    ],
    width: 0.7,
  },
  {
    id: "south-north-far-east",
    purpose: "Северный тротуар южной улицы за перекрёстком вдоль к3",
    kind: "pavement",
    points: [
      [47.4, -26.1], [50.0, -26.2], [54.0, -26.1], [58.0, -26.2],
      [62.0, -26.1], [66.0, -26.2], [70.0, -26.0], [74.4, -26.1],
    ],
    width: 0.7,
  },
  {
    id: "south-north-west",
    purpose: "Огрызок северного тротуара западнее забора",
    kind: "pavement",
    points: [[-14.4, -26.1], [-13.4, -26.05], [-12.4, -26.0]],
    width: 0.7,
  },
  {
    id: "k4-frontage",
    purpose: "Южный тротуар вдоль фасада к4 мимо обоих подъездов",
    kind: "pavement",
    points: [
      [-14.4, -33.8], [-12.8, -33.75], [-11.0, -33.7], [-9.5, -33.25],
      [-7.0, -33.2], [-5.6, -33.5], [-1.0, -33.6], [2.39, -33.6], [5.0, -33.6],
      [9.0, -33.6], [11.0, -33.6], [13.0, -33.7],
    ],
    width: 0.6,
  },
  {
    id: "k5-frontage-west",
    purpose: "Фасад к5 до раскопанной теплотрассы",
    kind: "pavement",
    points: [[13.0, -33.7], [15.5, -33.6], [17.54, -33.6], [18.6, -33.4]],
    width: 0.6,
  },
  {
    id: "works-bypass",
    purpose: "Раскоп теплотрассы обходят по проезжей части — иначе никак",
    kind: "service",
    points: [
      [18.6, -33.4], [19.2, -31.4], [21.0, -30.4], [24.0, -30.3],
      [27.0, -30.4], [29.2, -31.2], [30.0, -33.0], [30.2, -34.3],
    ],
    width: 0.7,
  },
  {
    id: "k5-frontage-east",
    purpose: "Фасад к5 за раскопом: карман восточного подъезда и выход к перекрёстку",
    kind: "pavement",
    points: [[30.2, -34.3], [32.0, -34.45], [33.5, -34.45], [35.0, -34.2], [36.6, -33.7]],
    width: 0.6,
  },
  // Двенадцать подходов к подъездам: каждый упирается в порог, и потому
  // становится узлом-местом. Без них дверь оставалась серединой тротуара.
  {
    id: "k1-west-approach",
    purpose: "С дворового прохода к западному подъезду к1",
    kind: "approach",
    points: [[15.54, 0.75], [15.54, -0.19]],
    width: 0.5,
  },
  {
    id: "k1-east-approach",
    purpose: "С дворового прохода к восточному подъезду к1",
    kind: "approach",
    points: [[26.39, 0.75], [26.39, -0.19]],
    width: 0.5,
  },
  {
    id: "k2-west-approach",
    purpose: "С тротуара к западному подъезду к2",
    kind: "approach",
    points: [[15.54, -15.6], [15.54, -16.19]],
    width: 0.5,
  },
  {
    id: "k2-east-approach",
    purpose: "С тротуара к восточному подъезду к2",
    kind: "approach",
    points: [[26.39, -15.6], [26.39, -16.19]],
    width: 0.5,
  },
  {
    id: "k3-west-approach",
    purpose: "С тротуара к западному подъезду брошенной к3",
    kind: "approach",
    points: [[51.54, -15.6], [51.54, -16.19]],
    width: 0.5,
  },
  {
    id: "k3-east-approach",
    purpose: "С тротуара к восточному подъезду брошенной к3",
    kind: "approach",
    points: [[62.39, -15.6], [62.39, -16.19]],
    width: 0.5,
  },
  {
    id: "k4-east-approach",
    purpose: "С тротуара к восточному подъезду к4",
    kind: "approach",
    points: [[2.39, -33.6], [2.39, -34.19]],
    width: 0.5,
  },
  {
    id: "k5-west-approach",
    purpose: "С тротуара к западному подъезду к5",
    kind: "approach",
    points: [[17.54, -33.6], [17.54, -34.19]],
    width: 0.5,
  },
  {
    id: "k6-west-approach",
    purpose: "С полосы у фасада к западному подъезду к6",
    kind: "approach",
    points: [[51.54, 24.4], [51.54, 23.81]],
    width: 0.5,
  },
  {
    id: "k6-east-approach",
    purpose: "С полосы у фасада к восточному подъезду к6",
    kind: "approach",
    points: [[62.39, 24.4], [62.39, 23.81]],
    width: 0.5,
  },
  {
    id: "k4-west-approach",
    purpose: "К западному подъезду к4 вдоль стены: в лоб мешают бочка и ящик",
    kind: "approach",
    points: [[-7.0, -33.2], [-7.4, -34.1], [-8.3, -34.6]],
    width: 0.5,
  },
  {
    id: "k5-east-approach",
    purpose: "К восточному подъезду к5 в карман между отвалом и брезентом",
    kind: "approach",
    points: [[30.2, -34.3], [29.4, -34.15], [28.75, -34.05]],
    width: 0.5,
  },
  {
    id: "south-south-far-east",
    purpose: "Южный тротуар южной улицы за перекрёстком мимо дома h3",
    kind: "pavement",
    points: [
      [47.4, -33.7], [51.0, -33.8], [56.0, -33.7], [60.0, -33.8],
      [66.0, -33.9], [70.0, -33.8], [74.4, -33.9],
    ],
    width: 0.7,
  },

  // === Гаражный двор ======================================================
  // Двор заперт с юга бетонным забором и спинами боксов; входов два — с
  // главной улицы посередине и в обход торцов.
  {
    id: "garage-walk",
    purpose: "С главной улицы вниз к воротам гаражей",
    kind: "service",
    points: [[-6.8, -15.6], [-7.3, -17.0], [-7.6, -18.6]],
    width: 0.7,
  },
  {
    id: "garage-frontage",
    purpose: "Вдоль всех ворот: между створками и наваленным хламом",
    kind: "service",
    points: [
      [-11.9, -19.0], [-9.35, -19.0], [-6.05, -18.95], [-2.75, -19.0],
      [0.55, -18.95], [3.85, -19.0], [7.15, -18.95], [10.9, -18.9],
    ],
    width: 0.45,
  },
  {
    id: "garage-bypass-east",
    purpose: "Обход восточного торца забора к южной улице",
    kind: "service",
    points: [[10.9, -18.9], [10.3, -22.0], [10.4, -26.0]],
    width: 0.6,
  },
  {
    id: "garage-bypass-west",
    purpose: "Обход западного торца забора к южной улице",
    kind: "service",
    points: [[-11.9, -19.0], [-12.2, -22.0], [-12.4, -26.0]],
    width: 0.6,
  },

  // === Двор к1: асфальт, площадка, киоск ==================================
  {
    id: "k1-yard-walk",
    purpose: "Дворовый проход вдоль фасада к1; у мусорки прижимается к дому",
    kind: "yard",
    points: [
      [11.6, 1.3], [13.5, 0.8], [15.54, 0.75], [17.3, 0.6], [18.9, -0.15],
      [20.5, 0.6], [23.0, 0.75], [26.39, 0.75], [29.0, 0.8], [32.0, 0.9],
      [34.0, 1.2],
    ],
    width: 0.6,
  },
  {
    id: "k1-playground-ring",
    purpose: "Кольцо вокруг детской площадки между качелями и каруселью",
    kind: "yard",
    points: [
      [20.9, 2.4], [19.4, 5.4], [19.6, 8.2], [23.0, 8.6], [26.5, 8.2],
      [29.4, 6.6], [29.6, 4.0], [29.2, 2.4], [26.8, 2.6], [24.0, 2.4],
      [21.5, 2.3], [20.9, 2.4],
    ],
    width: 0.5,
  },
  {
    id: "k1-playground-cut",
    purpose: "Срезка между песочницей и горкой — дети ходят насквозь",
    kind: "path",
    points: [[23.0, 2.4], [23.0, 5.0], [23.0, 8.6]],
    width: 0.45,
  },
  {
    id: "kiosk-to-gate",
    purpose: "От площадки мимо прилавка киоска к синим воротам старого квартала",
    kind: "path",
    points: [
      [20.9, 2.4], [18.2, 2.9], [16.0, 2.8], [13.2, 2.9], [9.6, 4.6],
      [6.0, 6.6], [2.6, 8.2],
    ],
    width: 0.6,
  },

  // === Старый квартал =====================================================
  {
    id: "blue-gate-street",
    purpose: "От синих ворот вдоль дома h1 к главной улице",
    kind: "path",
    points: [[-1.6, 8.4], [1.4, 6.6], [4.6, 5.0], [6.2, 1.6], [6.4, -3.0], [5.9, -8.4]],
    width: 0.7,
  },
  {
    id: "h1-front-approach",
    purpose: "С тротуара к парадной двери h1",
    kind: "approach",
    points: [[5.9, -8.4], [2.6, -8.3], [0.0, -7.9], [0.0, -7.2]],
    width: 0.6,
  },
  {
    id: "h1-terrace-walk",
    purpose: "С задней террасы h1 к синим воротам",
    kind: "path",
    points: [[0.0, 1.6], [0.0, 4.6], [-0.9, 6.7], [-1.6, 8.4]],
    width: 0.6,
  },
  {
    id: "h1-back-approach",
    purpose: "К задней двери h1 через террасу",
    kind: "approach",
    points: [[0.0, 1.6], [0.0, 1.2]],
    width: 0.5,
  },
  {
    id: "door-cream",
    purpose: "От ворот через палисадник к двери кремового дома",
    kind: "path",
    points: [[-2.4, 9.5], [-5.6, 9.9], [-8.6, 10.9], [-9.4, 11.9]],
    width: 0.6,
  },
  {
    id: "ring-cream",
    purpose: "Хозяйская тропка вокруг кремового дома к газовому вводу и белью",
    kind: "path",
    points: [
      [-9.4, 11.9], [-13.6, 11.4], [-14.9, 15.2], [-13.8, 20.6],
      [-9.0, 20.9], [-4.5, 20.4], [-2.3, 16.6], [-2.0, 13.4],
    ],
    width: 0.5,
  },
  {
    id: "clothesline-walk",
    purpose: "К бельевым верёвкам между домами",
    kind: "path",
    points: [[-2.0, 13.4], [-2.4, 11.0], [-2.4, 9.5]],
    width: 0.5,
  },
  {
    id: "shed-run",
    purpose: "К сараю, где дети бросают велосипеды",
    kind: "path",
    points: [[-2.6, 8.6], [-4.8, 7.4], [-5.6, 5.0], [-6.0, 2.0], [-7.4, 0.4]],
    width: 0.6,
  },
  {
    id: "door-white",
    purpose: "С дворового проезда к двери белёного дома",
    kind: "path",
    points: [[29.2, 2.6], [29.0, 5.6], [28.7, 8.0]],
    width: 0.6,
  },
  {
    id: "ring-white",
    purpose: "Хозяйская тропка вокруг белёного дома",
    kind: "path",
    points: [
      [28.7, 8.0], [24.4, 8.4], [23.6, 12.3], [24.4, 16.9], [29.8, 17.2],
      [34.8, 17.0], [36.2, 12.6], [37.4, 12.9],
    ],
    width: 0.5,
  },

  // === Двор к6 и восточная сторона ========================================
  {
    id: "k6-round-west",
    purpose: "Западный обход к6 от поперечной к северным подъездам",
    kind: "yard",
    points: [[47.3, 21.0], [48.4, 23.0], [49.5, 24.4]],
    width: 0.6,
  },
  {
    id: "k6-frontage",
    purpose: "Вдоль северного фасада к6 между подъездами",
    kind: "pavement",
    points: [[49.5, 24.4], [51.54, 24.4], [55.0, 24.5], [58.0, 24.4], [62.39, 24.4], [64.5, 24.3]],
    width: 0.6,
  },
  {
    id: "k6-round-east",
    purpose: "Восточный обход к6 мимо стола в рощице к площадке",
    kind: "yard",
    points: [
      [64.5, 24.3], [66.5, 23.4], [69.5, 23.0], [71.0, 21.0], [71.2, 17.5],
      [70.6, 16.2], [69.8, 12.5], [68.3, 10.2],
    ],
    width: 0.6,
  },
  {
    id: "k6-yard",
    purpose: "С поперечной вдоль южного двора к6 к площадке",
    kind: "yard",
    points: [[46.2, 13.6], [50.8, 12.0], [55.4, 10.2], [59.8, 8.2], [63.5, 7.2]],
    width: 0.7,
  },
  {
    id: "playground-1-ring",
    purpose: "Кольцо вокруг восточной площадки",
    kind: "yard",
    points: [
      [63.5, 7.2], [63.8, 10.2], [68.3, 10.2], [72.6, 10.0], [73.4, 7.6],
      [72.6, 5.2], [68.0, 4.6], [64.2, 5.2], [63.5, 7.2],
    ],
    width: 0.5,
  },
  {
    id: "shed-lane",
    purpose: "От площадки к сараям у межи",
    kind: "path",
    points: [[72.6, 10.0], [74.3, 10.9], [75.0, 12.5]],
    width: 0.5,
  },
  {
    id: "h2-playground",
    purpose: "От двери h2 мимо берёзы к площадке",
    kind: "path",
    points: [[56.0, 1.9], [59.2, 3.6], [62.6, 6.2], [64.2, 5.2]],
    width: 0.7,
  },
  {
    id: "h2-front-approach",
    purpose: "К парадной двери h2",
    kind: "approach",
    points: [[56.0, 1.9], [56.0, 1.3]],
    width: 0.5,
  },
  {
    id: "h2-back-approach",
    purpose: "С тротуара главной к задней двери h2",
    kind: "approach",
    points: [[56.0, -8.4], [56.0, -7.4]],
    width: 0.5,
  },
  {
    id: "rim-approach",
    purpose: "От площадки к накатанной колее гаражного тупика",
    kind: "service",
    points: [[72.6, 5.2], [72.6, 1.0], [72.4, -2.6]],
    width: 0.7,
  },
  {
    id: "rim-track",
    purpose: "Колея вдоль гаражей у межи, от главной улицы к южной",
    kind: "service",
    points: [[72.4, -2.6], [74.9, -6.4], [75.9, -12.2], [75.8, -19.8], [75.4, -25.8], [75.2, -30.0], [74.6, -33.8]],
    width: 0.9,
  },
  {
    id: "h3-approach",
    purpose: "С южной улицы к двери дома h3",
    kind: "approach",
    points: [[56.0, -33.7], [56.0, -35.2], [56.0, -36.2]],
    width: 0.6,
  },

  // === Задворки хрущёвок к4 и к5 ==========================================
  {
    id: "k45-back-walk",
    purpose: "Задворки к4 и к5: бельё, короб трансформатора, срезка к поперечной",
    kind: "yard",
    points: [
      [-12.8, -34.5], [-13.2, -38.5], [-11.0, -43.2], [-4.0, -43.8],
      [4.0, -44.0], [12.0, -43.8], [20.0, -43.9], [28.0, -44.0],
      [34.0, -43.6], [36.8, -43.0],
    ],
    width: 0.7,
  },
  {
    id: "k4-west-round",
    purpose: "Обход западного торца к4 к опушке; тропа глохнет в лесу",
    kind: "path",
    points: [[-12.8, -33.8], [-15.4, -33.6], [-16.4, -31.4], [-16.8, -29.8], [-17.2, -28.6]],
    width: 0.5,
    fade: true,
  },
  {
    id: "meadow-stroll",
    purpose: "Прогулочная тропа с южной улицы в луга и дальше к стройке",
    kind: "path",
    points: [
      [13.0, -33.8], [12.5, -38.0], [12.5, -42.5], [10.0, -46.0],
      [7.5, -50.0], [7.0, -56.0], [10.5, -60.0], [14.9, -61.8],
    ],
    width: 0.5,
  },

  // === Усадьба на юге и стройка ===========================================
  {
    id: "south-lane",
    purpose: "Асфальтовый отворот за южным кварталом",
    kind: "yard",
    points: [[38.5, -45.6], [34.0, -45.6], [31.6, -46.1]],
    width: 0.9,
  },
  {
    id: "south-gate-walk",
    purpose: "Через ворота усадьбы к двери жёлтого дома",
    kind: "path",
    points: [[31.6, -46.1], [27.7, -46.5], [27.4, -48.6], [27.3, -49.8]],
    width: 0.7,
  },
  {
    id: "gravel-court-walk",
    purpose: "От ворот к гравийному дворику",
    kind: "yard",
    points: [[31.6, -46.1], [30.0, -45.2], [26.0, -45.0], [22.0, -45.0], [21.8, -45.9]],
    width: 0.8,
  },
  {
    id: "south-carport",
    purpose: "От дворика к навесу с гирляндой",
    kind: "path",
    points: [[21.8, -45.9], [19.4, -49.4], [17.8, -51.3]],
    width: 0.6,
  },
  {
    id: "ring-south",
    purpose: "Тропка вокруг жёлтого дома по заднему двору",
    kind: "path",
    points: [
      [27.3, -49.8], [22.4, -48.7], [19.6, -51.0], [18.8, -55.2],
      [20.2, -58.6], [25.6, -60.3], [31.0, -60.2], [33.6, -57.6],
      [34.2, -53.4], [33.0, -50.4], [28.4, -49.8],
    ],
    width: 0.5,
  },
  {
    id: "site-fence-gawk",
    purpose: "Зеваки вдоль забора замороженной стройки",
    kind: "path",
    points: [[14.9, -61.8], [19.2, -62.2], [23.8, -61.9], [28.6, -62.3], [33.4, -61.9]],
    width: 0.5,
    fade: true,
  },
  {
    id: "site-approach",
    purpose: "От заднего двора усадьбы к забору стройки",
    kind: "path",
    points: [[20.2, -58.6], [19.6, -60.6], [19.2, -62.2]],
    width: 0.5,
  },

  // === Западная опушка и причал неба ======================================
  {
    id: "street-west-end",
    purpose: "Западный обрез главной: полотно кончается, его переходят напрямую",
    kind: "crossing",
    points: [[-14.4, -8.6], [-14.0, -11.6], [-14.4, -15.9]],
    width: 0.8,
    marked: false,
  },
  {
    id: "wood-path",
    purpose: "Продолжение главной улицы: тропа сквозь опушку в туман",
    kind: "path",
    points: [[-15.4, -12.0], [-17.4, -11.4], [-19.6, -10.8], [-22.0, -9.9], [-24.6, -9.6], [-26.8, -10.0]],
    width: 0.7,
    fade: true,
  },
  {
    id: "mooring-approach",
    purpose: "С лесной тропы к причальной мачте",
    kind: "path",
    points: [[-19.6, -10.8], [-20.2, -10.0], [-20.9, -9.7]],
    width: 0.6,
    fade: true,
  },
] as const;

// --- Подъезды --------------------------------------------------------------
// Шесть хрущёвок, у каждой два подъезда. Двери навешенные (*:hru:entry:door),
// створка открывается наружу, ступени переступаются. Четыре этажа, по четыре
// квартиры за дверью — столько же, сколько квартирных дверей в подъезде.

const KHRUSHCHEVKA_FLOORS = 4;
const FLATS_PER_ENTRANCE = 4;

function khrushchevkaEntrances(
  buildingId: string,
  label: string,
  westX: number,
  eastX: number,
  doorZ: number,
  approachZ: number,
  westApproach?: TownPlanPoint,
  eastApproach?: TownPlanPoint,
): readonly TownEntrance[] {
  return [
    {
      id: `${buildingId}-west`,
      buildingId,
      label: `${label}, западный подъезд`,
      door: [westX, doorZ],
      doorPieceId: `${buildingId === "k1" ? "hru" : buildingId}:hru:entry:door:2`,
      approach: westApproach ?? [westX, approachZ],
      facing: Math.PI / 2,
      floors: KHRUSHCHEVKA_FLOORS,
      flats: FLATS_PER_ENTRANCE,
    },
    {
      id: `${buildingId}-east`,
      buildingId,
      label: `${label}, восточный подъезд`,
      door: [eastX, doorZ],
      doorPieceId: `${buildingId === "k1" ? "hru" : buildingId}:hru:entry:door:10`,
      approach: eastApproach ?? [eastX, approachZ],
      facing: Math.PI / 2,
      floors: KHRUSHCHEVKA_FLOORS,
      flats: FLATS_PER_ENTRANCE,
    },
  ];
}

export const townEntrances: readonly TownEntrance[] = [
  ...khrushchevkaEntrances("k1", "Хрущёвка у площадки", 15.54, 26.39, -0.94, -0.19),
  ...khrushchevkaEntrances("k2", "Хрущёвка на главной", 15.54, 26.39, -16.94, -16.19),
  ...khrushchevkaEntrances("k3", "Заброшенная хрущёвка", 51.54, 62.39, -16.94, -16.19),
  // У западного подъезда к4 в лоб мешают бочка и ящик: подход сдвинут вдоль
  // стены, поэтому точка своя, а не по общему правилу.
  ...khrushchevkaEntrances("k4", "Хрущёвка у гаражей", -8.46, 2.39, -34.94, -34.19, [-8.3, -34.6]),
  ...khrushchevkaEntrances("k5", "Хрущёвка у теплотрассы", 17.54, 28.39, -34.94, -34.19, undefined, [28.75, -34.05]),
  ...khrushchevkaEntrances("k6", "Северная хрущёвка", 51.54, 62.39, 23.06, 23.81),
  {
    id: "h1-front",
    buildingId: "h1",
    label: "Парадная дверь первого дома",
    door: [0, -6.8],
    doorPieceId: "door:front",
    approach: [0, -7.2],
    facing: -Math.PI / 2,
    floors: 2,
    flats: 1,
  },
  {
    id: "h1-back",
    buildingId: "h1",
    label: "Задняя дверь первого дома, на террасу",
    door: [0, 0.8],
    doorPieceId: "door:back",
    approach: [0, 1.2],
    facing: Math.PI / 2,
    floors: 2,
    flats: 1,
  },
  {
    id: "h2-front",
    buildingId: "h2",
    label: "Парадная дверь дома h2",
    door: [56, 0.8],
    doorPieceId: "h2:door:front",
    approach: [56, 1.3],
    facing: Math.PI / 2,
    floors: 2,
    flats: 1,
  },
  {
    id: "h2-back",
    buildingId: "h2",
    label: "Задняя дверь дома h2, к улице",
    door: [56, -6.8],
    doorPieceId: "h2:door:back",
    approach: [56, -7.4],
    facing: -Math.PI / 2,
    floors: 2,
    flats: 1,
  },
  {
    id: "h3-front",
    buildingId: "h3",
    label: "Парадная дверь дома h3",
    door: [56, -37.2],
    doorPieceId: "h3:door:front",
    approach: [56, -36.2],
    facing: Math.PI / 2,
    floors: 2,
    flats: 1,
  },
  {
    id: "south-plot-door",
    buildingId: "south-plot",
    label: "Дверь жёлтого дома усадьбы",
    door: [27.5, -50.6],
    doorPieceId: "old-quarter:south-plot:gable-yellow:door",
    approach: [27.3, -49.8],
    facing: Math.PI / 2,
    floors: 2,
    flats: 1,
  },
] as const;

export const townEntranceById: Readonly<Record<string, TownEntrance>> =
  Object.fromEntries(townEntrances.map((entrance) => [entrance.id, entrance]));

// --- Места -----------------------------------------------------------------
// Всё, что перечислено, стоит на карте: пятна сняты с кластеров сцены. Мест,
// которых нет в геометрии, тут нет — придумывать притяжение к пустому газону
// значит повторить ошибку деревни наоборот.

export const townAreas: readonly TownArea[] = [
  { id: "k1-playground", purpose: "Детская площадка у к1: песочница, горка, карусель, турник", center: [24.3, 4.8], radius: [4.6, 2.4] },
  { id: "k1-bench-west", purpose: "Лавка у западного подъезда к1", center: [14.2, 1.85], radius: [1.0, 0.6] },
  { id: "k1-bench-east", purpose: "Лавка у восточного подъезда к1", center: [25.2, 1.85], radius: [1.0, 0.6] },
  { id: "k1-bins", purpose: "Мусорные баки во дворе к1", center: [18.9, 1.2], radius: [1.4, 1.0] },
  { id: "k2-bins", purpose: "Бак у фасада к2, прижат к проезжей части", center: [24.5, -16.15], radius: [1.3, 0.9] },
  { id: "kiosk", purpose: "Прилавок киоска стройматериалов, торгует на тропу к площадке", center: [14.3, 3.0], radius: [3.0, 0.9] },
  { id: "h1-terrace", purpose: "Задняя терраса первого дома со стульями", center: [0, 2.8], radius: [3.0, 1.6] },
  { id: "clothesline", purpose: "Бельевые верёвки между домами старого квартала", center: [-1.9, 13.4], radius: [0.9, 2.2] },
  { id: "blue-gate", purpose: "Створ синих ворот старого квартала", center: [-1.6, 8.9], radius: [2.6, 1.3] },
  { id: "shed-corner", purpose: "Угол сарая, где дети бросают велосипеды", center: [-10.0, 0.7], radius: [2.6, 1.4] },
  { id: "garage-frontage", purpose: "Ворота гаражей: вечно кто-то возится", center: [-1.0, -19.0], radius: [10.0, 0.9] },
  { id: "garage-table", purpose: "Верстак у восточного торца гаражного ряда", center: [10.3, -17.6], radius: [1.1, 0.9] },
  { id: "works", purpose: "Раскопанная теплотрасса: отвалы, трубы, мостки", center: [24.2, -33.3], radius: [5.4, 2.2] },
  { id: "playground-1", purpose: "Восточная детская площадка у к6", center: [68.3, 7.9], radius: [4.4, 2.2] },
  { id: "grove-table", purpose: "Каменный стол в рощице за к6", center: [70.6, 16.4], radius: [1.6, 1.4] },
  { id: "sheds", purpose: "Сараи у межи", center: [78.1, 12.0], radius: [2.8, 2.9] },
  { id: "rim-garages", purpose: "Гаражный тупик на восточной меже", center: [79.0, -16.0], radius: [3.0, 10.0] },
  { id: "mooring", purpose: "Поле у причальной мачты: скамья, щит, якорь — смотрят все", center: [-20.6, -11.3], radius: [2.4, 1.6] },
  { id: "gravel-court", purpose: "Разъезженный гравийный дворик усадьбы", center: [21.8, -45.9], radius: [3.3, 2.0] },
  { id: "carport", purpose: "Навес с гирляндой у жёлтого дома", center: [15.8, -53.6], radius: [2.6, 2.0] },
  { id: "south-gate", purpose: "Ворота усадьбы", center: [27.7, -46.6], radius: [2.4, 1.4] },
  { id: "site-fence", purpose: "Забор замороженной стройки", center: [24.3, -62.1], radius: [10.0, 1.0] },
  { id: "k6-frontage", purpose: "Полоса у северных подъездов к6", center: [57.0, 24.4], radius: [6.6, 0.9] },
  { id: "white-house-yard", purpose: "Двор белёного дома", center: [30.0, 12.6], radius: [5.0, 3.6] },
  { id: "cream-house-yard", purpose: "Двор кремового дома", center: [-9.5, 16.0], radius: [4.6, 4.0] },
  { id: "edgewood", purpose: "Опушка, где улица становится тропой", center: [-17.5, -12.6], radius: [4.0, 1.6] },
  { id: "k2-bench-west", purpose: "Лавка у западного подъезда к2", center: [13.59, -16.35], radius: [1.0, 0.6] },
  { id: "k2-bench-east", purpose: "Лавка у восточного подъезда к2", center: [28.34, -16.35], radius: [1.0, 0.6] },
  { id: "k3-bench", purpose: "Рассохшаяся лавка у брошенной к3", center: [49.6, -16.35], radius: [1.0, 0.6] },
  { id: "k4-bench", purpose: "Рассохшаяся лавка у брошенной к4", center: [4.3, -34.35], radius: [1.0, 0.6] },
  { id: "k5-bench", purpose: "Единственный чистый кусок фасада к5: лавка у западного подъезда", center: [15.6, -34.35], radius: [1.0, 0.6] },
  { id: "k6-bench-west", purpose: "Лавка у западного подъезда к6", center: [49.6, 23.65], radius: [1.0, 0.6] },
  { id: "k6-bench-east", purpose: "Лавка у восточного подъезда к6", center: [64.3, 23.65], radius: [1.0, 0.6] },
  { id: "k6-bins", purpose: "Бак в северном дворе к6", center: [66.6, 24.7], radius: [1.3, 0.9] },
] as const;

export const townPlaceInterest: readonly TownPlaceInterest[] = [
  // Двор оживает к вечеру — ритм обратный деревенскому.
  { areaId: "k1-playground", pull: 2.8, roles: ["child", "teen"], when: "day", doing: "stand" },
  { areaId: "k1-bench-west", pull: 2.4, roles: ["pensioner", "homemaker"], when: "evening", doing: "sit" },
  { areaId: "k1-bench-east", pull: 2.4, roles: ["pensioner", "homemaker"], when: "evening", doing: "sit" },
  { areaId: "k1-bins", pull: 1.0, doing: "stand" },
  { areaId: "k2-bins", pull: 0.9, doing: "stand" },
  { areaId: "kiosk", pull: 2.2, roles: ["homemaker", "worker", "pensioner"], when: "day", doing: "stand" },
  { areaId: "h1-terrace", pull: 1.4, roles: ["resident:h1-front", "resident:h1-back"], when: "evening", doing: "sit" },
  { areaId: "clothesline", pull: 1.6, roles: ["homemaker", "women"], when: "morning", doing: "work" },
  { areaId: "blue-gate", pull: 1.1, doing: "stand" },
  { areaId: "shed-corner", pull: 1.5, roles: ["child", "teen"], when: "day", doing: "stand" },
  { areaId: "garage-frontage", pull: 2.5, roles: ["driver", "worker", "men"], when: "day", doing: "work" },
  { areaId: "garage-table", pull: 2.3, roles: ["driver", "pensioner", "men"], when: "evening", doing: "sit" },
  { areaId: "works", pull: 1.7, roles: ["worker"], when: "day", doing: "work" },
  { areaId: "playground-1", pull: 2.5, roles: ["child", "teen"], when: "day", doing: "stand" },
  { areaId: "grove-table", pull: 2.0, roles: ["pensioner", "men"], when: "evening", doing: "sit" },
  { areaId: "sheds", pull: 1.2, roles: ["driver", "yardkeeper"], when: "day", doing: "work" },
  { areaId: "rim-garages", pull: 1.6, roles: ["driver"], when: "day", doing: "work" },
  { areaId: "mooring", pull: 2.9, when: "day", doing: "stand" },
  { areaId: "gravel-court", pull: 1.3, roles: ["driver"], when: "day", doing: "work" },
  { areaId: "carport", pull: 1.5, roles: ["resident:south-plot-door"], when: "evening", doing: "sit" },
  { areaId: "south-gate", pull: 1.0, doing: "stand" },
  { areaId: "site-fence", pull: 1.2, roles: ["teen", "pensioner"], when: "day", doing: "stand" },
  { areaId: "k6-frontage", pull: 1.4, roles: ["pensioner"], when: "evening", doing: "sit" },
  { areaId: "white-house-yard", pull: 1.3, roles: ["homemaker"], when: "day", doing: "work" },
  { areaId: "cream-house-yard", pull: 1.3, roles: ["homemaker"], when: "day", doing: "work" },
  { areaId: "edgewood", pull: 1.1, when: "day", doing: "stand" },
  { areaId: "k2-bench-west", pull: 2.3, roles: ["pensioner", "homemaker"], when: "evening", doing: "sit" },
  { areaId: "k2-bench-east", pull: 2.3, roles: ["pensioner", "homemaker"], when: "evening", doing: "sit" },
  { areaId: "k3-bench", pull: 1.0, roles: ["teen"], when: "evening", doing: "sit" },
  { areaId: "k4-bench", pull: 1.0, roles: ["teen"], when: "evening", doing: "sit" },
  { areaId: "k5-bench", pull: 2.2, roles: ["pensioner", "homemaker"], when: "evening", doing: "sit" },
  { areaId: "k6-bench-west", pull: 2.3, roles: ["pensioner", "homemaker"], when: "evening", doing: "sit" },
  { areaId: "k6-bench-east", pull: 2.3, roles: ["pensioner", "homemaker"], when: "evening", doing: "sit" },
  { areaId: "k6-bins", pull: 0.9, doing: "stand" },
] as const;

export const townPlaceInterestById: Readonly<Record<string, TownPlaceInterest>> =
  Object.fromEntries(townPlaceInterest.map((place) => [place.areaId, place]));

export const townAreaById: Readonly<Record<string, TownArea>> =
  Object.fromEntries(townAreas.map((area) => [area.id, area]));
