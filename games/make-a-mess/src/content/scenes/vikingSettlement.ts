import type {
  SettlementFlow,
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
    roles: ["weaver", "elder"],
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
    roles: ["weaver", "elder", "herder"],
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
  // Двор ткачихи: ремесло женское, и держит его хозяйка.
  { home: "weaver", name: "Sigrid", patronymic: "Hallsdottir", role: "weaver", female: true },
  { home: "weaver", name: "Hakon", patronymic: "Ormsson" },
  { home: "weaver", name: "Thora", patronymic: "Hakonsdottir", female: true },
  { home: "weaver", name: "Leif", patronymic: "Hakonsson" },
  { home: "weaver", name: "Dis", patronymic: "Hakonsdottir", female: true, child: true },

  { home: "brewer", name: "Egil", patronymic: "Grimsson", role: "brewer" },
  { home: "brewer", name: "Gudrun", patronymic: "Steinsdottir", female: true },
  { home: "brewer", name: "Torstein", patronymic: "Egilsson" },
  { home: "brewer", name: "Ragnhild", patronymic: "Egilsdottir", female: true },
  { home: "brewer", name: "Sunniva", patronymic: "Egilsdottir", female: true, child: true },

  { home: "fisher", name: "Bjorn", patronymic: "Ivarsson", role: "fisher" },
  { home: "fisher", name: "Solveig", patronymic: "Arnesdottir", female: true },
  { home: "fisher", name: "Ivar", patronymic: "Bjornsson" },
  { home: "fisher", name: "Helga", patronymic: "Bjornsdottir", female: true },
  { home: "fisher", name: "Ottar", patronymic: "Bjornsson", child: true },

  { home: "smith", name: "Ulf", patronymic: "Kolsson", role: "smith" },
  { home: "smith", name: "Halldis", patronymic: "Torsdottir", female: true },
  { home: "smith", name: "Kolbein", patronymic: "Ulfsson" },
  { home: "smith", name: "Asta", patronymic: "Ulfsdottir", female: true },
  { home: "smith", name: "Vigi", patronymic: "Ulfsson", child: true },

  { home: "family-north", name: "Sigurd", patronymic: "Ottarsson", role: "herder" },
  { home: "family-north", name: "Astrid", patronymic: "Leifsdottir", female: true },
  { home: "family-north", name: "Gyda", patronymic: "Sigurdsdottir", female: true },
  { home: "family-north", name: "Rannveig", patronymic: "Sigurdsdottir", female: true },
  { home: "family-north", name: "Sveinn", patronymic: "Sigurdsson", child: true },

  { home: "family-east", name: "Orm", patronymic: "Vesteinsson", role: "gardener" },
  { home: "family-east", name: "Ingrid", patronymic: "Bergsdottir", female: true },
  { home: "family-east", name: "Freydis", patronymic: "Ormsdottir", female: true },
  { home: "family-east", name: "Vestein", patronymic: "Ormsson" },
  { home: "family-east", name: "Alof", patronymic: "Ormsdottir", female: true, child: true },

  { home: "elder", name: "Torvald", patronymic: "Steinarsson", role: "elder" },
  { home: "elder", name: "Bergljot", patronymic: "Halldorsdottir", female: true },
  { home: "elder", name: "Steinar", patronymic: "Torvaldsson" },
  { home: "elder", name: "Yngvild", patronymic: "Steinarsdottir", female: true },
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
};
