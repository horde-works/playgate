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
  /**
   * Каким движением тут работают, когда никуда ничего не несут. Большая часть
   * труда деревни НЕ перемещает вещи между складами: кузнец кует, женщина
   * стирает, огородник копает. Без этого поля место с `doing: "work"` остаётся
   * местом, где человек просто стоит.
   */
  readonly verb?: SettlementWorkVerb;
  /** Сколько длится такая работа за один приход, секунды [от, до]. */
  readonly spell?: readonly [number, number];
}

/**
 * Что человек несёт в руках. ТИП, а не предмет мира: у полена нет личности,
 * учёт ведут склады, а рукам достаточно знать, что именно они держат.
 */
export type SettlementCargo = "log" | "firewood";

/**
 * Чем работают. Глагол задаёт ПОЗУ и длительность, поэтому список выведен из
 * механики движений (docs/village-inhabitants-lessons.md §6.3–6.4), а не из названий дел:
 * стирка, точило и скребок по шкуре — одно движение, а не три.
 */
export type SettlementWorkVerb =
  /** Двуручный замах сверху: колка, валка, тёска. */
  | "chop"
  /** Короткий частый замах на наковальне. */
  | "forge"
  /** Возвратно-поступательное над низкой поверхностью: стирка, точило. */
  | "scrub"
  /** Подъём на верёвке и вычерпывание: колодец, чан. */
  | "haul"
  /** Наклон к земле, работа руками внизу: огород, навоз. */
  | "dig"
  /** Руки над головой: бельё, рыба, шкуры. */
  | "hang"
  /** Присед с прямой спиной и укладка: поленница, сани, сруб. */
  | "stack"
  /** Просто взять и понести. */
  | "carry"
  /** Подложить в огонь. */
  | "feed";

/**
 * РАБОЧЕЕ МЕСТО У ПРЕДМЕТА. Узел тропы — это «примерно тут»; работать надо
 * У ВОРОТА колодца, НАД корытом, ПЕРЕД колодой. Поэтому у места есть точка
 * стояния и точка, на которую смотрят: человек встаёт к предмету так, как к
 * нему встают в жизни, а не туда, куда привела дорога.
 */
export interface SettlementStation {
  readonly id: string;
  /** Площадка, к которой относится место работы. */
  readonly areaId: string;
  /** Где именно стоит работник. */
  readonly stand: SettlementPoint;
  /** На что он смотрит — предмет, а не узел. */
  readonly face: SettlementPoint;
  readonly verb: SettlementWorkVerb;
  /** Сколько длится смена, секунды [от, до]. */
  readonly spell?: readonly [number, number];
  readonly roles?: readonly string[];
  readonly when?: SettlementDayPart;
}

/**
 * Склад: место, где чего-то СТОЛЬКО-ТО. Лес, куча наколотых поленьев,
 * поленница, очаг — всё это один тип с разной ёмкостью и разным поведением.
 *
 * Работа не назначается человеку списком: она РОЖДАЕТСЯ из пары «в источнике
 * есть — у приёмника место». Поэтому склад не знает ни про людей, ни про
 * профессии; он знает только свой уровень.
 */
export interface SettlementStore {
  readonly id: string;
  /** Где стоит. К нему подходят через ближайший узел графа троп. */
  readonly at: SettlementPoint;
  readonly capacity: number;
  readonly initial: number;
  /** Отрастает само: лес. Единиц в минуту. */
  readonly growthPerMinute?: number;
  /** Расходуется само: очаг жжёт дрова. Единиц в минуту. */
  readonly burnPerMinute?: number;
  /**
   * Куски сцены, которыми показан уровень. Гаснут с конца: последний кусок
   * исчезает первым, полный склад показан целиком.
   */
  readonly pieces?: readonly string[];
}

/**
 * Поток: откуда, куда, чем берут и чем кладут. Цепочка «лес → колода →
 * поленница → очаг» нигде не записана — она складывается сама из градиента
 * уровней, потому что каждое звено это отдельный поток.
 */
export interface SettlementFlow {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly cargo: SettlementCargo;
  readonly take: SettlementWorkVerb;
  readonly put: SettlementWorkVerb;
  readonly roles?: readonly string[];
  readonly when?: SettlementDayPart;
  /** Сколько единиц появляется у приёмника за одну ходку: бревно даёт два полена. */
  readonly yield?: number;
  /** Насколько охотно берутся за это дело по сравнению с прогулкой по площадкам. */
  readonly pull?: number;
}

/**
 * Поимённая перепись. Жители перестают быть «каждым вторым» и «каждым пятым»:
 * пол, возраст и ремесло приходят из списка, а не из номера в цикле.
 * Отчество настоящее — у детей от отца, у жён от своего отца.
 */
export interface SettlementResident {
  readonly home: string;
  readonly name: string;
  readonly patronymic: string;
  readonly role?: string;
  readonly female?: boolean;
  readonly child?: boolean;
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
  /** Кто здесь живёт поимённо. Без переписи людей набирают по счёту. */
  readonly roster?: readonly SettlementResident[];
  /** Места работы у предметов: где встать и на что смотреть. */
  readonly stations?: readonly SettlementStation[];
  /** Склады поселения. Без них жители ходят по делам, но ничего не делают. */
  readonly stores?: readonly SettlementStore[];
  /** Потоки между складами: из них и получается работа. */
  readonly flows?: readonly SettlementFlow[];
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
  /**
   * ЗНАК ТРЕВОГИ: откуда подают сигнал и как громко. Рог — это тоже событие
   * шума, только не хлопок: пугаться от него нечего, а понятно всем сразу.
   * Так тревога расходится по деревне ФИЗИКОЙ, а не рассылкой по списку.
   * Нет поля — нет и дозорного: поселение вправе не иметь его вовсе.
   */
  readonly horn?: {
    readonly at: readonly [number, number];
    /** Уровень на 1 м, дБ. Рог слышен дальше выстрела, но не бьёт по ушам. */
    readonly level: number;
  };
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
