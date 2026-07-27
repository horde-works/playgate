// SPDX-License-Identifier: CC-BY-NC-ND-4.0
// SPDX-FileCopyrightText: 2026 Igor Kirisiuk
//
// Разметка острова «Астана»: как по нему ходят и ездят.
//
// Это техзадание на всё, что будет построено дальше: эстакада встаёт вдоль
// кольца, станции — в его четырёх точках, кварталы прирастают к улицам, а
// жители ходят по этим же линиям. Порядок «сперва разметка, потом застройка»
// доказал себя на первой карте: разметка — техзадание на абстракцию.
//
// Геометрия согласована с оболочкой (`astanaShell.ts`): ни одна линия не
// идёт по руслу иначе как мостом, ни одна не выходит за кромку. Это
// проверяется тестом, а не глазом.

import {
  WORLD_RADIUS,
  groundKindAt,
  riverAxisZ,
  riverHalfWidth,
} from "./astanaShell.ts";

export type PlanPoint = readonly [x: number, z: number];

/** Радиус кольца ЛРТ и проспекта под ним. */
export const RING_RADIUS = 98;

/** Полуширина долины: русло плюс береговой уступ плюс пойма. */
export function valleyHalfWidth(x: number): number {
  return riverHalfWidth(x) + 16;
}

/** Точка на окружности кольца по азимуту: 0 — восток, π/2 — север (+z). */
export function ringPoint(angle: number, radius = RING_RADIUS): PlanPoint {
  return [Math.cos(angle) * radius, Math.sin(angle) * radius];
}

// --- Кольцо с прямыми врезками --------------------------------------------
// Станция по определению прямая, поэтому кольцо — не окружность, а четыре
// дуги с четырьмя прямыми вставками по сторонам света. Вставка стягивает
// дугу хордой: путь на станции спрямляется внутрь, платформа встаёт вдоль
// него, и состав помещается целиком.
//
// Длина вставки задана составом: три секции по 15 м плюс по метру запаса с
// каждого конца.

/** Длина состава: три секции TRITON по 15 м. */
export const TRAIN_LENGTH = 45;
/** Прямая вставка кольца — платформа плюс запас на остановку. */
export const RING_STRAIGHT_LENGTH = TRAIN_LENGTH + 7;
/** Полуугол дуги, которую стягивает вставка. */
export const RING_STRAIGHT_HALF_ANGLE = Math.asin(
  RING_STRAIGHT_LENGTH / 2 / RING_RADIUS,
);
/** На сколько метров вставка уводит путь внутрь от дуги. */
export const RING_STRAIGHT_OFFSET =
  RING_RADIUS - Math.cos(RING_STRAIGHT_HALF_ANGLE) * RING_RADIUS;

const QUARTER = Math.PI / 2;
const ARC_SWEEP = QUARTER - RING_STRAIGHT_HALF_ANGLE * 2;
const ARC_LENGTH = ARC_SWEEP * RING_RADIUS;
/** Полная длина пути кольца: четыре дуги и четыре прямые. */
export const RING_PATH_LENGTH = (ARC_LENGTH + RING_STRAIGHT_LENGTH) * 4;
const SEGMENT_LENGTH = ARC_LENGTH + RING_STRAIGHT_LENGTH;

/**
 * Точка пути кольца по пройденному расстоянию. Отсчёт от середины восточной
 * вставки против часовой стрелки; каждый сектор — половина вставки, дуга,
 * половина следующей вставки.
 */
export function ringPathPoint(distance: number): PlanPoint {
  const total = RING_PATH_LENGTH;
  let s = ((distance % total) + total) % total;
  // Сдвигаем начало отсчёта в конец восточной вставки, чтобы сектор всегда
  // начинался с дуги — так формула одна на все четыре сектора.
  s = (s + total - RING_STRAIGHT_LENGTH / 2) % total;
  const sector = Math.floor(s / SEGMENT_LENGTH);
  const local = s - sector * SEGMENT_LENGTH;
  const sectorStart = sector * QUARTER + RING_STRAIGHT_HALF_ANGLE;

  if (local <= ARC_LENGTH) {
    return ringPoint(sectorStart + local / RING_RADIUS);
  }
  // Прямая: хорда между концами соседних дуг.
  const straightStart = ringPoint(sectorStart + ARC_SWEEP);
  const straightEnd = ringPoint(sectorStart + ARC_SWEEP + RING_STRAIGHT_HALF_ANGLE * 2);
  const t = (local - ARC_LENGTH) / RING_STRAIGHT_LENGTH;
  return [
    straightStart[0] + (straightEnd[0] - straightStart[0]) * t,
    straightStart[1] + (straightEnd[1] - straightStart[1]) * t,
  ];
}

/** Расстояние вдоль пути до середины вставки, на которой стоит станция. */
export function stationDistance(compass: Compass): number {
  const order: Record<Compass, number> = { east: 0, north: 1, west: 2, south: 3 };
  return order[compass] * SEGMENT_LENGTH;
}

/**
 * Где стоят опоры эстакады. Концы каждой вставки — обязательно опоры: так
 * прямой станционный участок опирается на те же «грибы», что и вся линия, и
 * платформа встаёт между ними, а не поперёк пролёта.
 */
export function ringPierDistances(): readonly number[] {
  const distances: number[] = [];
  const arcBays = 5;
  const straightBays = 4;
  for (let sector = 0; sector < 4; sector += 1) {
    const base = sector * SEGMENT_LENGTH;
    for (let bay = 0; bay < arcBays; bay += 1) {
      distances.push(base + (ARC_LENGTH * bay) / arcBays);
    }
    for (let bay = 0; bay < straightBays; bay += 1) {
      distances.push(base + ARC_LENGTH + (RING_STRAIGHT_LENGTH * bay) / straightBays);
    }
  }
  // Отсчёт ringPathPoint начинается в середине восточной вставки, поэтому
  // сдвигаем весь ряд на полвставки: иначе опора встанет ровно там, где
  // должен стоять центр станции.
  return distances.map((distance) => distance + RING_STRAIGHT_LENGTH / 2);
}

/**
 * Балисы — путевые транспондеры, те самые «коробочки» между рельсами.
 *
 * Как это работает на настоящей линии: поезд считает пройденный путь
 * одометрией по колёсам, а она дрейфует от проскальзывания; балиса — точка с
 * известной координатой, проехав которую бортовая система обнуляет
 * накопленную ошибку. Перед платформой их ставят группой с уменьшающимся
 * шагом: последняя коррекция приходит прямо перед точкой остановки, и
 * поэтому GOA4 попадает в ±10…30 см, а двери совпадают с платформенными.
 *
 * У нас это прямой аналог маршрутных требований дирижабля: маршрут даёт
 * геометрию, балисы — точность.
 */
export interface RingBalise {
  readonly id: string;
  /** Пройденный путь до балисы. */
  readonly distance: number;
  readonly kind: "line" | "approach" | "stop";
  /** Для станционных: чью точку остановки она уточняет. */
  readonly station?: Compass;
}

export function ringBalises(): readonly RingBalise[] {
  const balises: RingBalise[] = [];
  const stations: readonly Compass[] = ["east", "north", "west", "south"];

  for (const compass of stations) {
    const stop = stationDistance(compass) + TRAIN_LENGTH / 2;
    // Интервал сокращается вдвое: 16 → 8 → 4 м, и последняя коррекция
    // приходит за четыре метра до точки остановки.
    balises.push(
      { id: `${compass}:approach-3`, distance: stop - 28, kind: "approach", station: compass },
      { id: `${compass}:approach-2`, distance: stop - 12, kind: "approach", station: compass },
      { id: `${compass}:approach-1`, distance: stop - 4, kind: "approach", station: compass },
      { id: `${compass}:stop`, distance: stop, kind: "stop", station: compass },
    );
  }

  // Перегонные балисы: реже, только чтобы одометрия не уплывала на дуге.
  const lineStep = 48;
  for (let distance = 0; distance < RING_PATH_LENGTH; distance += lineStep) {
    const nearStation = balises.some(
      (balise) => Math.abs(balise.distance - distance) < 36,
    );
    if (!nearStation) {
      balises.push({ id: `line:${Math.round(distance)}`, distance, kind: "line" });
    }
  }
  return balises.sort((left, right) => left.distance - right.distance);
}

/** Точка пути стоит на прямой вставке, а не на дуге. */
export function onRingStraight(distance: number): boolean {
  const total = RING_PATH_LENGTH;
  const s = (((distance % total) + total) % total + total - RING_STRAIGHT_LENGTH / 2) % total;
  const local = s - Math.floor(s / SEGMENT_LENGTH) * SEGMENT_LENGTH;
  return local > ARC_LENGTH;
}

export type WayKind =
  /** Тротуар вдоль проезжей части. */
  | "pavement"
  /** Пешеходная ось без машин: бульвар, партер, набережная. */
  | "promenade"
  /** Проезжая часть. */
  | "roadway"
  /** Мост через долину Есиля. */
  | "bridge"
  /** Съезд с поймы на дно русла. */
  | "ramp"
  /** Дворовый проезд или дорожка внутри квартала. */
  | "yard"
  /** Короткий подвод ко входу. */
  | "approach";

export interface AstanaWay {
  readonly id: string;
  readonly purpose: string;
  readonly kind: WayKind;
  readonly points: readonly PlanPoint[];
  /** Полуширина коридора в метрах. */
  readonly width: number;
}

/** Сторона света, на которой стоит станция кольца. */
export type Compass = "north" | "east" | "south" | "west";

/**
 * Станция ЛРТ. Четыре настоящие станции первой линии по сторонам света; над
 * каждой будет причал в один из остальных миров.
 *
 * ВАЖНО для лицензии: сама механика хаба (кольцо, станции, причалы) общая и
 * не должна знать ничего специфично-астанинского — в коммерческой сборке
 * хаб заменяется выдуманным островом (LICENSING.md).
 */
export interface AstanaStation {
  readonly id: string;
  readonly compass: Compass;
  /** Казахское название — то, что написано на настоящей станции. */
  readonly kazakh: string;
  readonly russian: string;
  readonly center: PlanPoint;
  /** Куда смотрит фасад вестибюля, радианы (0 = +x). */
  readonly facing: number;
  /** Мир за причалом. */
  readonly berthTo: "grand-terminal" | "open-house" | "basalt-stronghold" | "viking-village";
  readonly character: string;
}

export interface AstanaArea {
  readonly id: string;
  readonly purpose: string;
  readonly center: PlanPoint;
  /** Полуразмеры пятна. */
  readonly radius: PlanPoint;
  readonly rotation?: number;
}

// --- Станции кольца --------------------------------------------------------

export const astanaStations: readonly AstanaStation[] = [
  {
    id: "zhibek-zholy",
    compass: "north",
    kazakh: "Жібек жолы",
    russian: "Жибек жолы",
    center: ringPathPoint(stationDistance("north")),
    facing: -Math.PI / 2,
    berthTo: "viking-village",
    character:
      "Привокзальная галерея старого города: станция смотрит на площадь перед вокзалом Астана-1",
  },
  {
    id: "auezhai",
    compass: "east",
    kazakh: "Әуежай",
    russian: "Аэропорт",
    center: ringPathPoint(stationDistance("east")),
    facing: Math.PI,
    berthTo: "grand-terminal",
    character: "Крытый переход-«палец» к терминалу, стеклянный вестибюль со скошенными гранями",
  },
  {
    id: "astana-arena",
    compass: "south",
    kazakh: "Астана Арена",
    russian: "Астана Арена",
    center: ringPathPoint(stationDistance("south")),
    facing: Math.PI / 2,
    berthTo: "basalt-stronghold",
    character: "Широкий выход к чаше стадиона, кессонный потолок ромбами",
  },
  {
    id: "nurly-zhol",
    compass: "west",
    kazakh: "Нұрлы жол",
    russian: "Нурлы жол",
    center: ringPathPoint(stationDistance("west")),
    facing: 0,
    berthTo: "open-house",
    character: "Эталон станции: вестибюль-«волна» под кровлей вокзала",
  },
] as const;

export const astanaStationById: Readonly<Record<string, AstanaStation>> =
  Object.fromEntries(astanaStations.map((station) => [station.id, station]));

// --- Мосты -----------------------------------------------------------------
// Долина Есиля пересекается только в этих точках. Два городских моста и два
// перехода эстакады ЛРТ — эстакада идёт своим уровнем и мостом для пешехода
// не является.

export interface AstanaBridge {
  readonly id: string;
  readonly purpose: string;
  /**
   * Осевая линия моста. У городских мостов это отрезок поперёк долины, у
   * кольцевых — дуга самого кольца: эстакада ЛРТ и проспект Тұран идут над
   * поймой общим сооружением, как на настоящей линии.
   */
  readonly axis: readonly PlanPoint[];
  readonly halfWidth: number;
  readonly forVehicles: boolean;
  /** Мост несёт эстакада кольца. */
  readonly onRing?: boolean;
}

/** Осевая городского моста: поперёк всей долины, с выходом на сушу обоих берегов. */
function valleyCrossing(x: number): readonly PlanPoint[] {
  const axis = riverAxisZ(x);
  const half = valleyHalfWidth(x);
  const points: PlanPoint[] = [];
  for (let step = 0; step <= 12; step += 1) {
    points.push([x, axis - half - 4 + ((half * 2 + 8) * step) / 12]);
  }
  return points;
}

/**
 * Дуги кольца, проходящие над долиной. Считаются из геометрии, а не
 * назначаются руками: сдвинется река или радиус — пролёты переедут сами.
 */
function ringValleyArcs(): readonly (readonly PlanPoint[])[] {
  const STEPS = 720;
  // Запас в 10 шагов дуги (около 8.5 м) с каждой стороны: опоры пролёта
  // обязаны стоять на суше, а не в пойме.
  const MARGIN = 10;
  const inValleyAt = (step: number): boolean => {
    const point = ringPathPoint((RING_PATH_LENGTH * ((step + STEPS) % STEPS)) / STEPS);
    return Math.abs(point[1] - riverAxisZ(point[0])) < valleyHalfWidth(point[0]);
  };
  const arcs: PlanPoint[][] = [];
  let current: PlanPoint[] | null = null;
  for (let step = 0; step <= STEPS; step += 1) {
    const point = ringPathPoint((RING_PATH_LENGTH * step) / STEPS);
    const inValley =
      inValleyAt(step)
      || Array.from({ length: MARGIN }, (_, offset) => offset + 1).some(
        (offset) => inValleyAt(step - offset) || inValleyAt(step + offset),
      );
    if (inValley) {
      if (!current) {
        current = [];
        arcs.push(current);
      }
      current.push(point);
    } else if (current) {
      current = null;
    }
  }
  // Обход начинается на востоке и может разрезать один пролёт пополам:
  // если первая и последняя дуги лежат на одной стороне острова, это она.
  const first = arcs[0];
  const last = arcs[arcs.length - 1];
  if (arcs.length > 2 && first && last && first[0][0] > 0 === last[0][0] > 0) {
    arcs.shift();
    arcs[arcs.length - 1] = [...last, ...first];
  }
  return arcs.map((arc) => [
    arc[0],
    ...arc.filter((_, index) => index % 12 === 0),
    arc[arc.length - 1],
  ]);
}

const ringArcs = ringValleyArcs();

export const astanaBridges: readonly AstanaBridge[] = [
  {
    id: "dostyk",
    purpose: "Главный мост: проспект с левого берега в старый город",
    axis: valleyCrossing(0),
    halfWidth: 9,
    forVehicles: true,
  },
  {
    id: "footbridge",
    purpose: "Пешеходный мост от набережной к дворам двухэтажек",
    axis: valleyCrossing(-42),
    halfWidth: 2.6,
    forVehicles: false,
  },
  ...ringArcs.map((arc, index) => ({
    id: index === 0 ? "ring-east" : "ring-west",
    purpose:
      "Пролёт кольца над долиной: эстакада ЛРТ и проспект Тұран одним сооружением",
    axis: arc,
    halfWidth: 7,
    forVehicles: true,
    onRing: true,
  })),
] as const;

/** Расстояние от точки до полилинии. */
export function distanceToPolyline(
  x: number,
  z: number,
  points: readonly PlanPoint[],
): number {
  let best = Infinity;
  for (let index = 1; index < points.length; index += 1) {
    const [ax, az] = points[index - 1];
    const [bx, bz] = points[index];
    const dx = bx - ax;
    const dz = bz - az;
    const lengthSquared = dx * dx + dz * dz;
    const t =
      lengthSquared === 0
        ? 0
        : Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / lengthSquared));
    best = Math.min(best, Math.hypot(x - (ax + dx * t), z - (az + dz * t)));
  }
  return best;
}

/** Где кольцо переходит долину — по одной точке на пролёт, для отчётов. */
export const ringRiverCrossings: readonly PlanPoint[] = ringArcs.map((arc) => {
  const middle = arc[Math.floor(arc.length / 2)];
  return [Math.round(middle[0] * 10) / 10, Math.round(middle[1] * 10) / 10];
});

// --- Улицы и пешеходная сеть ----------------------------------------------

function ringWay(id: string, purpose: string, width: number): AstanaWay {
  const points: PlanPoint[] = [];
  const steps = 96;
  for (let step = 0; step <= steps; step += 1) {
    points.push(ringPathPoint((RING_PATH_LENGTH * step) / steps));
  }
  return { id, purpose, kind: "roadway", points, width };
}

/** Линия городского моста: его осевая и есть маршрут. */
function bridgeWay(bridge: AstanaBridge): AstanaWay {
  return {
    id: `bridge-${bridge.id}`,
    purpose: bridge.purpose,
    kind: "bridge",
    points: bridge.axis,
    width: bridge.halfWidth,
  };
}

/** Съезд с поймы на дно русла: пологий, чтобы по нему можно было сойти. */
function rampWay(id: string, x: number, side: 1 | -1): AstanaWay {
  const axis = riverAxisZ(x);
  const half = riverHalfWidth(x);
  return {
    id,
    purpose: "Съезд с поймы на дно русла",
    kind: "ramp",
    points: [
      [x, axis + side * (half + 16 - 1)],
      [x + side * 1.5, axis + side * (half + 9)],
      [x + side * 2.5, axis + side * (half + 3.5)],
      [x + side * 3, axis + side * (half - 1.5)],
    ],
    width: 1.8,
  };
}

export const astanaWays: readonly AstanaWay[] = [
  // === Кольцо ==============================================================
  ringWay(
    "turan-ring",
    "Проспект Тұран: кольцо под эстакадой ЛРТ, связывает четыре станции",
    5,
  ),

  // === Ядро: бульвар Нұржол ================================================
  {
    id: "nurzhol-boulevard",
    purpose: "Бульвар Нұржол: пешеходная ось от шатра через Байтерек к пирамиде",
    kind: "promenade",
    points: [
      [-46, 0], [-34, 0], [-22, 0], [-10, 0], [0, 0],
      [10, 0], [22, 0], [34, 0], [46, 0],
    ],
    width: 13,
  },

  // === Радиальные проспекты к станциям =====================================
  {
    id: "avenue-west",
    purpose: "Западный проспект: от партера Байтерека к станции Нұрлы жол",
    kind: "roadway",
    points: [[-46, 0], [-58, 0], [-70, 0], [-82, 0], [-93, 0]],
    width: 6,
  },
  {
    id: "avenue-east",
    purpose: "Восточный проспект: от пирамиды к станции Әуежай",
    kind: "roadway",
    points: [[46, 0], [58, 0], [70, 0], [82, 0], [93, 0]],
    width: 6,
  },
  {
    id: "avenue-south",
    purpose: "Южный проспект: от партера через Триумфальную арку к Астана Арене",
    kind: "roadway",
    points: [[0, -18], [0, -34], [0, -50], [0, -66], [0, -82], [0, -93]],
    width: 6,
  },
  {
    id: "avenue-north",
    purpose: "Северный проспект: от партера к мосту Достык",
    kind: "roadway",
    points: [[0, 18], [0, 24], [0, 30]],
    width: 6,
  },
  {
    id: "mangilik-el",
    purpose: "Проспект Мәңгілік Ел: диагональ к мечети, сфере и ЭКСПО-подиуму",
    kind: "roadway",
    points: [[8, -6], [20, -18], [32, -30], [44, -42], [56, -54], [64, -62]],
    width: 6,
  },

  // === Долина Есиля ========================================================
  ...astanaBridges.filter((bridge) => !bridge.onRing).map(bridgeWay),
  {
    id: "quay-south",
    purpose: "Набережная Достық по южной пойме",
    kind: "promenade",
    points: [
      [-88, riverAxisZ(-88) - valleyHalfWidth(-88) + 3],
      [-64, riverAxisZ(-64) - valleyHalfWidth(-64) + 1],
      [-42, riverAxisZ(-42) - valleyHalfWidth(-42) + 1],
      [-20, riverAxisZ(-20) - valleyHalfWidth(-20) + 3],
      [0, riverAxisZ(0) - valleyHalfWidth(0) + 1],
      [26, riverAxisZ(26) - valleyHalfWidth(26) + 1],
      [56, riverAxisZ(56) - valleyHalfWidth(56) + 3],
      [88, riverAxisZ(88) - valleyHalfWidth(88) + 3],
    ],
    width: 3,
  },
  {
    id: "quay-north",
    purpose: "Северная набережная: тропа вдоль поймы под дворами старого города",
    kind: "promenade",
    points: [
      [-70, riverAxisZ(-70) + valleyHalfWidth(-70) - 3],
      [-42, riverAxisZ(-42) + valleyHalfWidth(-42) - 1],
      [-16, riverAxisZ(-16) + valleyHalfWidth(-16) - 3],
      [0, riverAxisZ(0) + valleyHalfWidth(0) - 1],
      [8, riverAxisZ(8) + valleyHalfWidth(8) - 1],
      [34, riverAxisZ(34) + valleyHalfWidth(34) - 3],
      [60, riverAxisZ(60) + valleyHalfWidth(60) - 3],
      [76, riverAxisZ(76) + valleyHalfWidth(76) - 3],
    ],
    width: 3,
  },
  rampWay("ramp-south-east", 26, -1),
  rampWay("ramp-south-west", -64, -1),
  rampWay("ramp-north", 8, 1),

  // === Старый Целиноград, правый берег =====================================
  {
    id: "respubliki",
    purpose: "Проспект Республики: главная улица старого города",
    kind: "roadway",
    points: [
      [-56, 72], [-46, 71.5], [-30, 71], [-6, 70],
      [18, 70], [22, 70], [42, 71], [64, 73],
    ],
    width: 5,
  },
  {
    id: "kenesary",
    purpose: "Улица Кенесары: от моста Достык к привокзальной площади",
    kind: "roadway",
    points: [[0, 62], [0, 70], [0, 78], [0, 86]],
    width: 4,
  },
  {
    id: "station-square-approach",
    purpose: "Выход с привокзальной площади к станции Жібек жолы",
    kind: "pavement",
    points: [[0, 86], [0, 90], [0, 94]],
    width: 2.4,
  },
  {
    id: "old-yard-west",
    purpose: "Дворовый проезд между двухэтажками западного квартала",
    kind: "yard",
    points: [[-46, 70], [-46, 78], [-38, 82], [-26, 82], [-18, 78]],
    width: 2.2,
  },
  {
    id: "old-yard-east",
    purpose: "Дворовый проезд восточного квартала: гаражи и голубятня",
    kind: "yard",
    points: [[22, 70], [26, 78], [36, 82], [48, 80], [54, 74]],
    width: 2.2,
  },

  // === Связки кольца с городом ============================================
  {
    id: "ring-link-north",
    purpose: "Съезд с кольца к привокзальной площади",
    kind: "roadway",
    points: [[0, 98], [0, 94]],
    width: 4,
  },
  {
    id: "ring-link-east",
    purpose: "Съезд с кольца на восточный проспект",
    kind: "roadway",
    points: [[93, 0], [96, 0]],
    width: 4,
  },
  {
    id: "ring-link-south",
    purpose: "Съезд с кольца на южный проспект",
    kind: "roadway",
    points: [[0, -93], [0, -96]],
    width: 4,
  },
  {
    id: "ring-link-west",
    purpose: "Съезд с кольца на западный проспект",
    kind: "roadway",
    points: [[-93, 0], [-96, 0]],
    width: 4,
  },
  {
    id: "respubliki-link",
    purpose: "Связка проспекта Республики с кольцом на востоке",
    kind: "roadway",
    points: [[64, 73], [72, 70], [79, 62], [84.3, 49.9]],
    width: 4,
  },
  {
    id: "quay-link-west",
    purpose: "Связка западной набережной с кольцом",
    kind: "promenade",
    points: [[-88, riverAxisZ(-88) - valleyHalfWidth(-88) + 3], [-92, 22], [-95, 12], [-96, 0]],
    width: 2.4,
  },
  {
    id: "mangilik-ring-link",
    purpose: "Выход проспекта Мәңгілік Ел на кольцо",
    kind: "roadway",
    points: [[64, -62], [70, -63], [75.1, -63]],
    width: 5,
  },
] as const;

// --- Места -----------------------------------------------------------------

export const astanaAreas: readonly AstanaArea[] = [
  {
    id: "bayterek-parterre",
    purpose: "Партер Байтерека: гранитный круг в центре острова",
    center: [0, 0],
    radius: [18, 18],
  },
  {
    id: "boulevard-west",
    purpose: "Западная половина бульвара: фонтаны и цветочные ковры",
    center: [-24, 0],
    radius: [22, 13],
  },
  {
    id: "boulevard-east",
    purpose: "Восточная половина бульвара: партер к пирамиде",
    center: [24, 0],
    radius: [22, 13],
  },
  {
    id: "khan-shatyr-plot",
    purpose: "Площадка шатра на западном конце бульвара",
    center: [-58, 0],
    radius: [24, 24],
  },
  {
    id: "pyramid-plot",
    purpose: "Стилобат пирамиды на восточном конце бульвара",
    center: [58, 2],
    radius: [16, 16],
  },
  {
    id: "mosque-plot",
    purpose: "Площадь мечети Хазрет Султан",
    center: [46, -44],
    radius: [18, 18],
  },
  {
    id: "expo-podium",
    purpose: "Подиум ЭКСПО со сферой Нур Алем",
    center: [66, -60],
    radius: [18, 18],
  },
  {
    id: "arch-square",
    purpose: "Площадь Триумфальной арки на южном проспекте",
    center: [0, -62],
    radius: [12, 10],
  },
  {
    id: "station-square",
    purpose: "Привокзальная площадь старого города",
    center: [0, 88],
    radius: [14, 8],
  },
  {
    id: "old-square",
    purpose: "Старая площадь: гостиница «Ишим», ряды, драмтеатр",
    center: [30, 74],
    radius: [14, 8],
  },
  {
    id: "old-yard-west-court",
    purpose: "Двор западного квартала двухэтажек: лавки, качели, тополя",
    center: [-32, 80],
    radius: [12, 7],
  },
  {
    id: "old-yard-east-court",
    purpose: "Двор восточного квартала: гаражи, голубятня, теплотрасса",
    center: [38, 79],
    radius: [12, 7],
  },
  {
    id: "atameken-plot",
    // Единственное место, размеченное В пойме: парк-миниатюра лежит у самой
    // воды, как настоящий Атамекен у Ишима.
    purpose: "Парк-миниатюра Атамекен на южной пойме",
    center: [-52, 12],
    radius: [14, 10],
  },
  {
    id: "opera-plot",
    purpose: "Площадка Оперы на западе левого берега",
    center: [-42, -30],
    radius: [16, 12],
  },
  {
    id: "circus-plot",
    purpose: "Цирк-«тарелка» на левом берегу, за набережной",
    center: [-30, -18],
    radius: [12, 12],
  },
  {
    id: "school-palace-plot",
    purpose: "Дворец школьников на юго-западе",
    center: [-56, -44],
    radius: [16, 12],
  },
  {
    id: "museum-plot",
    purpose: "Национальный музей на юго-востоке от партера",
    center: [30, -34],
    radius: [16, 12],
  },
] as const;

export const astanaAreaById: Readonly<Record<string, AstanaArea>> =
  Object.fromEntries(astanaAreas.map((area) => [area.id, area]));

/** Точка внутри долины Есиля (русло, берег или пойма). */
export function insideValley(x: number, z: number): boolean {
  return Math.abs(z - riverAxisZ(x)) < valleyHalfWidth(x);
}

/** Точка на мосту: долину законно пересекать только здесь. */
export function onBridge(x: number, z: number): boolean {
  return astanaBridges.some(
    (bridge) => distanceToPolyline(x, z, bridge.axis) <= bridge.halfWidth + 1,
  );
}

/** Точка стоит на суше острова и не за кромкой. */
export function onSolidGround(x: number, z: number): boolean {
  return (
    groundKindAt(x, z) !== "outside" && Math.hypot(x, z) < WORLD_RADIUS - 2
  );
}
