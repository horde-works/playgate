/**
 * Описание поселения — то, что симуляция жителей принимает на вход.
 *
 * Смысл разделения: поведение (как человек идёт, садится, просит дверь) едино
 * для всех карт, а ПОСЕЛЕНИЕ у каждой своё — тропы, жильё, места, роли, ритм
 * суток и одежда. Пока сим импортировал план деревни напрямую, второй карте
 * достаться было нечему.
 *
 * Интерфейс выведен из ДВУХ готовых разметок — викингской деревни и города, —
 * а не из одной: у города единица жилья подъезд, а не дом, роли другие, и
 * двор оживает вечером, а не утром. Всё, что различается, стало полем.
 */

export type SettlementPoint = readonly [x: number, z: number];

/** Авторская тропа: коридор, по которому людям положено ходить. */
export interface SettlementRoute {
  readonly id: string;
  readonly points: readonly SettlementPoint[];
  /** Полуширина коридора в метрах. */
  readonly width: number;
  /**
   * Насколько натоптано, 0..1 — это же и вес выбора маршрута: по битой тропе
   * ходят чаще, как в жизни.
   */
  readonly wear: number;
}

/**
 * Единица жилья. В деревне это дом с одной дверью, в городе — подъезд, за
 * которым несколько квартир. Симуляции важно одно: где порог, как его
 * просить открыть и сколько людей за ним живёт.
 */
export interface SettlementDwelling {
  readonly id: string;
  /** Точка, куда выходят из двери — на неё же и подходят. */
  readonly entrance: SettlementPoint;
  /** Id входа для запроса створки; совпадает с префиксом кусков двери. */
  readonly doorId: string;
  /** Куда смотрит дверь, радианы: по этой нормали подходят к порогу. */
  readonly facing: number;
  /**
   * Кто за этой дверью живёт. В деревне это одно ремесло на дом, в городе —
   * смесь: за одним подъездом и работяга, и хозяйка, и пенсионер.
   */
  readonly roles: readonly string[];
  /** Сколько жителей селится за этой дверью. Ноль — дом брошен. */
  readonly residents: number;
}

/** Пятно места: площадка, двор, лавка, раскоп. */
export interface SettlementArea {
  readonly id: string;
  readonly center: SettlementPoint;
  readonly radius: SettlementPoint;
  readonly rotation?: number;
}

/**
 * Когда место зовёт. «any» — всегда: деревенская разметка так и подписана.
 * Утро и ночь появились от города: бельё вешают утром, а двор оживает
 * вечером — ритм у города обратный деревенскому.
 */
export type SettlementDayPart = "any" | "morning" | "day" | "evening" | "night";

/**
 * Авторское притяжение места — необязательный артефакт, который вытащил
 * деревню из геометрического перекоса: вес назначен автором, а не выведен из
 * формы графа. Не дошёл — сменил цель.
 */
export interface SettlementInterest {
  readonly areaId: string;
  readonly pull: number;
  readonly roles?: readonly string[];
  readonly when?: SettlementDayPart;
  readonly doing?: "stand" | "sit" | "work";
}

/** Одежда поселения: палитра крашеной ткани, из которой набирают жителей. */
export interface SettlementWardrobe {
  readonly dyes: readonly (readonly [number, number, number])[];
  /** Разброс изношенности, 0..1: у деревни выше, у города ровнее. */
  readonly wearSpread?: number;
  /** Насколько занятие пачкает одежду: кузнец грязнее старейшины. */
  readonly grimeByRole?: Readonly<Record<string, number>>;
}

export interface SettlementPlan {
  readonly id: string;
  readonly routes: readonly SettlementRoute[];
  readonly dwellings: readonly SettlementDwelling[];
  readonly areas: readonly SettlementArea[];
  /** Притяжение по id пятна. */
  readonly interest: Readonly<Record<string, SettlementInterest>>;
  /** Куда тянет человека его занятие помимо объявленного притяжения. */
  readonly haunts: Readonly<Record<string, readonly string[]>>;
  readonly wardrobe: SettlementWardrobe;
  /** Каждый n-й житель — ребёнок. 0 — детей нет. */
  readonly childEvery?: number;
  /** Каждый n-й — женщина или девочка. */
  readonly femaleEvery?: number;
  /**
   * Входы, которые днём стоят распахнутыми сами, без просьбы: ворота общего
   * дома, арка двора. Распорядок места, а не чьё-то желание.
   */
  readonly alwaysOpen?: readonly string[];
}

/** Роли, которые встречаются в плане: и у жилья, и в притяжении мест. */
export function settlementRoles(plan: SettlementPlan): readonly string[] {
  const roles = new Set<string>();
  for (const dwelling of plan.dwellings) {
    for (const role of dwelling.roles) {
      roles.add(role);
    }
  }
  for (const interest of Object.values(plan.interest)) {
    for (const role of interest.roles ?? []) {
      if (!role.startsWith("resident:")) {
        roles.add(role);
      }
    }
  }
  return [...roles];
}
