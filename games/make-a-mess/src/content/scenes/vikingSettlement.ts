import type { SettlementPlan } from "../../game/settlementPlan.ts";
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
  brewer: ["brewer-chopping", "north-armoury", "great-hall-threshold"],
  fisher: ["north-sledge", "commons", "well"],
  smith: ["smith-store", "smith-sledge", "great-hall-threshold"],
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
