import type {
  SettlementFlow,
  SettlementStation,
  SettlementPlan,
  SettlementResident,
  SettlementStore,
} from "../../game/settlementPlan.ts";
import {
  vikingHomeEntrance,
  vikingPlaceInterest,
  vikingTrafficAreas,
  vikingTrafficRoutes,
  vikingVillageHomes,
} from "./vikingVillagePlan.ts";

/**
 * Викингская деревня как описание поселения. Ничего нового здесь не
 * придумывается: план деревни уже содержит тропы, дома и притяжение мест —
 * переходник лишь называет их общими именами, чтобы симуляция не знала слова
 * «викинги».
 */

/** Кто живёт за какой дверью. Ремесло держит человека у своей площадки. */
const HOME_ROLES: Readonly<Record<string, string>> = {
  weaver: "weaver",
  brewer: "brewer",
  fisher: "fisher",
  smith: "smith",
  "family-north": "herder",
  "family-east": "gardener",
  elder: "elder",
};

/** Куда тянет жителя его ремесло помимо объявленного веса площадок. */
const ROLE_HAUNTS: Readonly<Record<string, readonly string[]>> = {
  weaver: ["weaver-chopping", "well", "commons"],
  brewer: ["brewery", "brewer-chopping", "north-armoury"],
  fisher: ["north-sledge", "commons", "well"],
  smith: ["smithy", "smith-store", "smith-sledge"],
  herder: ["goat-pen", "well", "north-sledge"],
  gardener: ["kitchen-garden", "well", "great-hall-threshold"],
  elder: ["commons", "great-hall-threshold", "great-hall-yard"],
  // Хозяйка: вода, стирка, огонь, кухня — дом держится на ней.
  housekeeper: ["well", "laundry-weaver", "laundry-brewer", "commons"],
  // Подручный: дрова, сани, стройка — куда позовут, туда и идёт.
  hand: ["weaver-chopping", "north-sledge", "new-house"],
};

/**
 * Крашеная шерсть северной деревни: некрашеное сукно, земляные красители,
 * редкие дорогие цвета (марена, вайда). Дешёвых ярких тканей тут нет — и
 * бледно-белого «больничного» тоже: он выдаёт нерастворённый шаблон.
 */
const VILLAGE_DYES: readonly (readonly [number, number, number])[] = [
  [0.24, 0.18, 0.13],
  [0.38, 0.31, 0.22],
  [0.2, 0.22, 0.23],
  [0.3, 0.26, 0.17],
  [0.47, 0.42, 0.32],
  [0.36, 0.17, 0.13],
  [0.22, 0.26, 0.2],
  [0.17, 0.2, 0.27],
  [0.32, 0.24, 0.15],
  [0.14, 0.13, 0.12],
];

/**
 * СКЛАДЫ И ПОТОКИ. Цепочка «лес → колода → поленница → очаг» здесь нигде не
 * записана: есть четыре склада со своими уровнями и три потока между ними.
 * Порядок работ складывается сам из градиента уровней — очаг сжёг дрова,
 * поленница просела, появилась работа носить; куча у колоды просела, появилась
 * работа колоть; лес отрос, появилась работа валить.
 *
 * Уровни показаны кусками сцены: поленья у колоды, брёвна в поленнице, полено
 * в очаге. Гаснут с конца — полный склад виден целиком.
 */
export const vikingSettlementStores: readonly SettlementStore[] = [
  {
    id: "north-copse",
    at: [-30.4, 63.6],
    capacity: 10,
    initial: 10,
    // Лес отрастает: без этого остров лысеет за час игры.
    growthPerMinute: 0.22,
  },
  {
    id: "weaver-chopping",
    at: [-21, 13],
    capacity: 7,
    initial: 3,
    pieces: [
      "viking-village:working-yards:weaver-chopping:split-log:0:piece",
      "viking-village:working-yards:weaver-chopping:split-log:1:piece",
      "viking-village:working-yards:weaver-chopping:split-log:2:piece",
      "viking-village:working-yards:weaver-chopping:split-log:3:piece",
      "viking-village:working-yards:weaver-chopping:split-log:4:piece",
      "viking-village:working-yards:weaver-chopping:split-log:5:piece",
      "viking-village:working-yards:weaver-chopping:split-log:6:piece",
    ],
  },
  {
    id: "weaver-wood",
    at: [-35, 0],
    capacity: 10,
    initial: 6,
    pieces: [
      "viking-village:storage:weaver-wood:log:0:piece",
      "viking-village:storage:weaver-wood:log:1:piece",
      "viking-village:storage:weaver-wood:log:2:piece",
      "viking-village:storage:weaver-wood:log:3:piece",
      "viking-village:storage:weaver-wood:log:4:piece",
      "viking-village:storage:weaver-wood:log:5:piece",
      "viking-village:storage:weaver-wood:log:6:piece",
      "viking-village:storage:weaver-wood:log:7:piece",
      "viking-village:storage:weaver-wood:log:8:piece",
      "viking-village:storage:weaver-wood:log:9:piece",
    ],
  },
  {
    id: "commons-hearth",
    at: [-11.5, -1.5],
    capacity: 4,
    initial: 2,
    // Общинный огонь горит весь день — он и создаёт спрос на всю цепочку.
    burnPerMinute: 0.22,
    pieces: ["viking-village:firelight:commons-hearth:log:0"],
  },
];

const VILLAGE_FLOWS: readonly SettlementFlow[] = [
  {
    id: "fell",
    from: "north-copse",
    to: "weaver-chopping",
    cargo: "log" as const,
    take: "chop" as const,
    put: "chop" as const,
    // Бревно колют на два полена — оттого поток вверх по цепочке реже.
    yield: 2,
    // Валить лес — мужская работа; носить дрова — общая.
    roles: ["men"],
    when: "day" as const,
    pull: 3.4,
  },
  {
    id: "stack-weaver",
    from: "weaver-chopping",
    to: "weaver-wood",
    cargo: "firewood" as const,
    take: "carry" as const,
    put: "stack" as const,
    when: "day" as const,
    pull: 3.0,
  },
  {
    id: "feed-commons",
    from: "weaver-wood",
    to: "commons-hearth",
    cargo: "firewood" as const,
    take: "carry" as const,
    put: "feed" as const,
    // Огонь общий, и подкладывает в него кто угодно, а не только хозяева дров.
    when: "any" as const,
    pull: 3.6,
  },
];

/**
 * ПЕРЕПИСЬ. Семь дворов, тридцать четыре человека. Отчества настоящие: дети
 * зовутся по отцу, жёны — по своему отцу, поэтому фамилий здесь нет и быть не
 * может. Ремесло у главы двора, остальные — та же семья.
 */
const VILLAGE_ROSTER: readonly SettlementResident[] = [
  // Ремесло — у ГЛАВЫ двора, у остальных своё занятие. Пока роль бралась от
  // дома, жена пивовара числилась пивоваром и махала топором.
  { home: "weaver", name: "Sigrid", patronymic: "Hallsdottir", role: "weaver", female: true },
  { home: "weaver", name: "Hakon", patronymic: "Ormsson", role: "hand" },
  { home: "weaver", name: "Thora", patronymic: "Hakonsdottir", role: "housekeeper", female: true },
  { home: "weaver", name: "Leif", patronymic: "Hakonsson", role: "hand" },
  { home: "weaver", name: "Dis", patronymic: "Hakonsdottir", role: "housekeeper", female: true, child: true },

  { home: "brewer", name: "Egil", patronymic: "Grimsson", role: "brewer" },
  { home: "brewer", name: "Gudrun", patronymic: "Steinsdottir", role: "housekeeper", female: true },
  { home: "brewer", name: "Torstein", patronymic: "Egilsson", role: "brewer" },
  { home: "brewer", name: "Ragnhild", patronymic: "Egilsdottir", role: "housekeeper", female: true },
  { home: "brewer", name: "Sunniva", patronymic: "Egilsdottir", role: "housekeeper", female: true, child: true },

  { home: "fisher", name: "Bjorn", patronymic: "Ivarsson", role: "fisher" },
  { home: "fisher", name: "Solveig", patronymic: "Arnesdottir", role: "housekeeper", female: true },
  { home: "fisher", name: "Ivar", patronymic: "Bjornsson", role: "fisher" },
  { home: "fisher", name: "Helga", patronymic: "Bjornsdottir", role: "housekeeper", female: true },
  { home: "fisher", name: "Ottar", patronymic: "Bjornsson", role: "hand", child: true },

  { home: "smith", name: "Ulf", patronymic: "Kolsson", role: "smith" },
  { home: "smith", name: "Halldis", patronymic: "Torsdottir", role: "housekeeper", female: true },
  // Подмастерье у горна — сын кузнеца, а не всякий, кто мимо шёл.
  { home: "smith", name: "Kolbein", patronymic: "Ulfsson", role: "smith" },
  { home: "smith", name: "Asta", patronymic: "Ulfsdottir", role: "housekeeper", female: true },
  { home: "smith", name: "Vigi", patronymic: "Ulfsson", role: "hand", child: true },

  { home: "family-north", name: "Sigurd", patronymic: "Ottarsson", role: "herder" },
  { home: "family-north", name: "Astrid", patronymic: "Leifsdottir", role: "housekeeper", female: true },
  { home: "family-north", name: "Gyda", patronymic: "Sigurdsdottir", role: "herder", female: true },
  { home: "family-north", name: "Rannveig", patronymic: "Sigurdsdottir", role: "housekeeper", female: true },
  { home: "family-north", name: "Sveinn", patronymic: "Sigurdsson", role: "hand", child: true },

  { home: "family-east", name: "Orm", patronymic: "Vesteinsson", role: "gardener" },
  { home: "family-east", name: "Ingrid", patronymic: "Bergsdottir", role: "gardener", female: true },
  { home: "family-east", name: "Freydis", patronymic: "Ormsdottir", role: "housekeeper", female: true },
  { home: "family-east", name: "Vestein", patronymic: "Ormsson", role: "hand" },
  { home: "family-east", name: "Alof", patronymic: "Ormsdottir", role: "housekeeper", female: true, child: true },

  { home: "elder", name: "Torvald", patronymic: "Steinarsson", role: "elder" },
  { home: "elder", name: "Bergljot", patronymic: "Halldorsdottir", role: "housekeeper", female: true },
  { home: "elder", name: "Steinar", patronymic: "Torvaldsson", role: "hand" },
  { home: "elder", name: "Yngvild", patronymic: "Steinarsdottir", role: "housekeeper", female: true },
];

/**
 * РАБОЧИЕ МЕСТА У ПРЕДМЕТОВ. Узел тропы — это «примерно тут»: у колодца он в
 * двух с половиной метрах от сруба, и работающий там человек выглядел
 * приседающим посреди двора. Здесь у каждого дела есть ТОЧКА СТОЯНИЯ и точка,
 * НА КОТОРУЮ СМОТРЯТ, — обе взяты из координат настоящего реквизита сцены.
 */
const VILLAGE_STATIONS: readonly SettlementStation[] = [
  // Колодец: у сруба, лицом к вороту — тянут верёвку, а не приседают в трёх метрах.
  { id: "well-north", areaId: "well", stand: [-10, 15.25], face: [-10, 13], verb: "haul", spell: [14, 26], roles: ["women"] },
  { id: "well-south", areaId: "well", stand: [-10, 10.75], face: [-10, 13], verb: "haul", spell: [14, 26], roles: ["women"] },
  // Колода: встают перед чурбаком на длину топорища.
  { id: "weaver-chopping-block", areaId: "weaver-chopping", stand: [-20.6, 14.29], face: [-21, 13], verb: "chop", spell: [24, 40], roles: ["men"] },
  { id: "brewer-chopping-block", areaId: "brewer-chopping", stand: [21.29, 2.15], face: [22, 1], verb: "chop", spell: [24, 40], roles: ["men"] },
  { id: "south-chopping-block", areaId: "south-chopping", stand: [-22.01, -36.08], face: [-23, -37], verb: "chop", spell: [24, 40], roles: ["men"] },
  // Кузница: у горна греют, у наковальни бьют, у точила водят лезвием.
  { id: "smithy-forge", areaId: "smithy", stand: [34.84, -20.12], face: [36.84, -20.12], verb: "forge", spell: [20, 36], roles: ["smith"] },
  { id: "smithy-anvil", areaId: "smithy", stand: [34.82, -19.73], face: [35.62, -19.15], verb: "forge", spell: [20, 36], roles: ["smith"] },
  { id: "smithy-grindstone", areaId: "smithy", stand: [34.9, -21.96], face: [35.63, -21.43], verb: "scrub", spell: [16, 28] },
  // Чан: стоят у края и водят мешалкой.
  { id: "brewery-vat", areaId: "brewery", stand: [24.45, -1.58], face: [25, -3.5], verb: "haul", spell: [18, 32], roles: ["brewer"] },
  // Корыто: стоят вплотную к борту, наклонившись над водой.
  { id: "laundry-weaver-trough", areaId: "laundry-weaver", stand: [-40.18, 12.52], face: [-39.97, 13.34], verb: "scrub", spell: [20, 34], roles: ["women"] },
  { id: "laundry-brewer-trough", areaId: "laundry-brewer", stand: [32.82, 19.24], face: [32.69, 20.08], verb: "scrub", spell: [20, 34], roles: ["women"] },
  // Огород: копают у своей гряды, а не посреди участка.
  { id: "garden-bed-0", areaId: "kitchen-garden", stand: [13.43, -16.04], face: [12.93, -17.33], verb: "dig", spell: [18, 32], roles: ["gardener", "women"] },
  { id: "garden-bed-1", areaId: "kitchen-garden", stand: [14.81, -15.82], face: [14.31, -17.11], verb: "dig", spell: [18, 32], roles: ["gardener", "women"] },
  { id: "garden-bed-2", areaId: "kitchen-garden", stand: [16.19, -15.59], face: [15.69, -16.89], verb: "dig", spell: [18, 32], roles: ["gardener", "women"] },
  { id: "garden-bed-3", areaId: "kitchen-garden", stand: [17.57, -15.37], face: [17.07, -16.67], verb: "dig", spell: [18, 32], roles: ["gardener", "women"] },
  // Ясли: задают корм снаружи через жердь.
  { id: "pen-manger", areaId: "goat-pen", stand: [11.6, 24.9], face: [11.6, 23.4], verb: "stack", spell: [12, 22], roles: ["herder", "women"] },
  { id: "pen-trough", areaId: "goat-pen", stand: [14.7, 24.9], face: [14.7, 23.3], verb: "haul", spell: [10, 18], roles: ["herder"] },
  // Вешала: развешивают, подняв руки над жердью.
  { id: "fish-rack-frame", areaId: "fish-rack", stand: [-12.11, 37.86], face: [-12, 39], verb: "hang", spell: [16, 28] },
  { id: "hide-rack-west-frame", areaId: "hide-rack-west", stand: [-42.67, -12.94], face: [-42, -12], verb: "hang", spell: [16, 28] },
  { id: "hide-rack-east-frame", areaId: "hide-rack-east", stand: [43.45, -0.06], face: [43, 1], verb: "hang", spell: [16, 28] },
  { id: "commons-drying-frame", areaId: "commons-drying", stand: [15.21, 1.87], face: [15, 3], verb: "hang", spell: [16, 28] },
  // Поленница: складывают, присев у штабеля.
  { id: "weaver-wood-stack", areaId: "weaver-wood", stand: [-33.5, 0.4], face: [-35, 0], verb: "stack", spell: [10, 18] },
  { id: "brewer-wood-stack", areaId: "brewer-wood", stand: [34.5, 0.4], face: [33, 0], verb: "stack", spell: [10, 18] },
  { id: "fisher-wood-stack", areaId: "fisher-wood", stand: [-37.5, -33.6], face: [-39, -34], verb: "stack", spell: [10, 18] },
  { id: "elder-wood-stack", areaId: "elder-wood", stand: [-18.5, -53.6], face: [-20, -54], verb: "stack", spell: [10, 18] },
  { id: "smith-firewood-stack", areaId: "smith-firewood", stand: [35.0, -46.0], face: [33.5, -46.4], verb: "stack", spell: [10, 18] },
  { id: "north-sledge-load", areaId: "north-sledge", stand: [-6.4, 34], face: [-8, 34], verb: "stack", spell: [10, 18] },
  { id: "smith-sledge-load", areaId: "smith-sledge", stand: [30.6, -20], face: [29, -20], verb: "stack", spell: [10, 18] },
  // Стройка: тешут бревно на подкладках.
  { id: "newhouse-worklog", areaId: "new-house", stand: [-26.8, -6.85], face: [-26.8, -5.85], verb: "chop", spell: [20, 34], roles: ["men"] },
  // Берег: чинят сети у рамы.
  { id: "shore-nets", areaId: "fog-jetty", stand: [-3.25, -85.97], face: [-5.1, -85.2], verb: "scrub", spell: [18, 30], roles: ["fisher"] },
  { id: "smith-store-racks", areaId: "smith-store", stand: [38.4, -14.6], face: [40, -14], verb: "stack", spell: [12, 20] },
  { id: "armoury-racks", areaId: "north-armoury", stand: [36.4, 16.4], face: [38, 16], verb: "stack", spell: [12, 20] },
];

export const vikingSettlement: SettlementPlan = {
  id: "viking-village",
  routes: vikingTrafficRoutes.map((route) => ({
    id: route.id,
    points: route.points,
    width: route.width,
    wear: route.wear,
  })),
  dwellings: vikingVillageHomes.map((home) => ({
    id: home.id,
    entrance: vikingHomeEntrance(home),
    doorId: `viking-village:buildings:${home.id}:door`,
    facing: home.yaw,
    // В доме живёт семья одного ремесла — так деревня и размечена.
    roles: [HOME_ROLES[home.id] ?? "herder"],
    residents: 5,
  })),
  areas: vikingTrafficAreas.map((area) => ({
    id: area.id,
    center: area.center,
    radius: area.radius,
    rotation: area.rotation,
  })),
  interest: Object.fromEntries(
    vikingPlaceInterest.map((place) => [place.areaId, place]),
  ),
  haunts: ROLE_HAUNTS,
  roster: VILLAGE_ROSTER,
  stations: VILLAGE_STATIONS,
  stores: vikingSettlementStores,
  flows: VILLAGE_FLOWS,
  wardrobe: {
    dyes: VILLAGE_DYES,
    wearSpread: 1,
    // Кузнец, рыбак и пивовар ходят в саже, соли и сусле; старейшина — нет.
    grimeByRole: { smith: 0.3, fisher: 0.3, brewer: 0.3, elder: -0.1 },
  },
  childEvery: 5,
  femaleEvery: 2,
  // Ворота зала стоят настежь весь день: это распорядок дома.
  alwaysOpen: ["viking-village:buildings:great-hall:hall-gate"],
  // Дозорный стоит у ворот зала — там, где в деревне всегда кто-то есть.
  // 130 дБ на метре: рог слышен дальше выстрела, но по ушам не бьёт, и на
  // краю мира от него остаётся ещё девяносто — понять хватает с запасом.
  horn: { at: [0, -8], level: 130 },
};
