import type {
  SettlementPlan,
  SettlementRoute,
} from "../../game/settlementPlan.ts";
import {
  townAreas,
  townEntrances,
  townPlaceInterest,
  townWays,
  type TownWayKind,
} from "./townPlan.ts";

/**
 * Город как описание поселения. Разметка уже сделана и проверена замером
 * (townPlan.ts) — переходник переводит её в общие имена и добавляет то, чего
 * в разметке быть не должно: кто где живёт и чем занят.
 */

/**
 * Насколько линия «натоптана» — это же и охота по ней идти. Тротуар выбирают
 * охотнее двора, двор охотнее газона. Народный переход слабее зебры, но не
 * запрещён: люди перебегают, и это старая действительность. Машин в городе
 * пока нет, так что пусть бегают.
 */
const WEAR_BY_KIND: Readonly<Record<TownWayKind, number>> = {
  pavement: 0.95,
  approach: 0.9,
  yard: 0.85,
  service: 0.7,
  path: 0.6,
  crossing: 0.85,
};

const UNMARKED_CROSSING_WEAR = 0.62;

const routes: readonly SettlementRoute[] = townWays.map((way) => ({
  id: way.id,
  points: way.points,
  width: way.width,
  wear:
    way.kind === "crossing" && !way.marked
      ? UNMARKED_CROSSING_WEAR
      : WEAR_BY_KIND[way.kind],
}));

/**
 * Кто за каким подъездом живёт. Заброшенные к3 и к4 пусты — туда ходят
 * подростки, а не жильцы; у частных домов задняя дверь своя, но жильцы
 * записаны за парадной, чтобы одного человека не поселили дважды.
 */
const HOUSEHOLDS: Readonly<Record<string, { roles: readonly string[]; residents: number }>> = {
  "k1-west": { roles: ["pensioner", "homemaker", "worker", "child"], residents: 4 },
  "k1-east": { roles: ["worker", "homemaker", "teen", "trader"], residents: 4 },
  "k2-west": { roles: ["homemaker", "worker", "child", "pensioner"], residents: 4 },
  "k2-east": { roles: ["worker", "driver", "teen", "homemaker"], residents: 4 },
  "k3-west": { roles: [], residents: 0 },
  "k3-east": { roles: [], residents: 0 },
  "k4-west": { roles: [], residents: 0 },
  "k4-east": { roles: [], residents: 0 },
  "k5-west": { roles: ["worker", "homemaker", "child", "yardkeeper"], residents: 4 },
  "k5-east": { roles: ["driver", "worker", "teen", "homemaker"], residents: 4 },
  "k6-west": { roles: ["pensioner", "homemaker", "child", "worker"], residents: 4 },
  "k6-east": { roles: ["worker", "teen", "homemaker", "driver"], residents: 4 },
  "h1-front": { roles: ["homemaker", "pensioner"], residents: 2 },
  "h1-back": { roles: [], residents: 0 },
  "h2-front": { roles: ["worker", "homemaker", "teen"], residents: 3 },
  "h2-back": { roles: [], residents: 0 },
  "h3-front": { roles: ["driver", "homemaker"], residents: 2 },
  "south-plot-door": { roles: ["pensioner", "homemaker", "child"], residents: 3 },
};

/** Куда человека тянет его занятие помимо объявленного веса мест. */
const ROLE_HAUNTS: Readonly<Record<string, readonly string[]>> = {
  pensioner: ["k1-bench-west", "k1-bench-east", "k2-bench-west", "k6-frontage", "grove-table"],
  homemaker: ["kiosk", "clothesline", "k1-bins", "k2-bins", "white-house-yard"],
  worker: ["garage-frontage", "works", "kiosk", "rim-garages"],
  driver: ["garage-frontage", "garage-table", "rim-garages", "gravel-court", "sheds"],
  yardkeeper: ["k1-bins", "k2-bins", "k6-bins", "garage-frontage", "blue-gate"],
  trader: ["kiosk", "k1-playground"],
  child: ["k1-playground", "playground-1", "shed-corner"],
  teen: ["playground-1", "site-fence", "k3-bench", "k4-bench", "mooring"],
};

/**
 * Позднесоветский двор: серое, коричневое, тёмно-синее, хаки и бордо —
 * ткань фабричная, но выцветшая. Детское чуть ярче взрослого, как оно и
 * было; ядовитых цветов нет — они выдают шаблон, а не эпоху.
 */
const TOWN_DYES: readonly (readonly [number, number, number])[] = [
  [0.26, 0.27, 0.29],
  [0.19, 0.22, 0.31],
  [0.33, 0.28, 0.22],
  [0.24, 0.29, 0.24],
  [0.42, 0.38, 0.31],
  [0.35, 0.19, 0.19],
  [0.21, 0.2, 0.22],
  [0.3, 0.31, 0.34],
  [0.38, 0.32, 0.18],
  [0.16, 0.18, 0.2],
  [0.45, 0.36, 0.26],
  [0.28, 0.23, 0.28],
];

export const townSettlement: SettlementPlan = {
  id: "open-house",
  routes,
  dwellings: townEntrances.map((entrance) => {
    const household = HOUSEHOLDS[entrance.id] ?? { roles: ["worker"], residents: 2 };
    return {
      id: entrance.id,
      entrance: entrance.approach,
      // Створка — сам кусок двери: по этому же id её просит и игрок.
      doorId: entrance.doorPieceId,
      facing: entrance.facing,
      roles: household.roles,
      residents: household.residents,
    };
  }),
  areas: townAreas.map((area) => ({
    id: area.id,
    center: area.center,
    radius: area.radius,
    rotation: area.rotation,
  })),
  interest: Object.fromEntries(
    townPlaceInterest.map((place) => [place.areaId, place]),
  ),
  haunts: ROLE_HAUNTS,
  wardrobe: {
    dyes: TOWN_DYES,
    // Городская одежда ровнее деревенской: фабричная, стирается чаще.
    wearSpread: 0.6,
    grimeByRole: { driver: 0.28, worker: 0.24, yardkeeper: 0.2, pensioner: -0.08 },
  },
  childEvery: 5,
  femaleEvery: 2,
};
