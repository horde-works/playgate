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
  RIVER_BANK_WIDTH,
  RIVER_TERRACE_WIDTH,
  RIVER_VALLEY_MARGIN,
  groundKindAt,
  riverAxisZ,
  riverHalfWidth,
} from "./astanaShell.ts";
import {
  KHAN_SHATYR_YAW,
  NURZHOL_END,
  NURZHOL_PLAN_ROTATION,
  NURZHOL_START,
  astanaLandmarkSiteById,
  nurzholPoint,
  type AstanaSiteStatus,
} from "./astanaLayout.ts";

export type PlanPoint = readonly [x: number, z: number];

/** Радиус кольца ЛРТ. Будущая автодорога обязана лежать СНАРУЖИ него. */
export const RING_RADIUS = 98;

/** Полуширина долины: русло плюс береговой уступ плюс пойма. */
export function valleyHalfWidth(x: number): number {
  return riverHalfWidth(x) + RIVER_VALLEY_MARGIN;
}

/** Точка кольца по сторонам макета: 0 — справа, π/2 — сверху (+z). */
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
  /** Мост бывает пешеходным: по нему не кладут асфальт и бордюр. */
  readonly forVehicles?: boolean;
  /** Семантическая линия, которую пока не надо превращать в покрытие. */
  readonly renderSurface?: boolean;
}

/**
 * Сторона МАКЕТА, на которой стоит станция кольца. Это топологические имена,
 * а не истинный географический компас из astanaLayout.ts.
 */
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
  /** Форма пятна в его локальных координатах. */
  readonly shape?: "rectangle" | "ellipse";
  /** Общественное пространство может намеренно входить в резерв здания. */
  readonly kind?: "landmark" | "public-space";
  /**
   * Полуразмеры действительно замощённой части. Само `radius` — резерв под
   * здание и воздух вокруг него, а не приказ залить весь участок камнем.
   * Нет значения — участок пока остаётся ландшафтом.
   */
  readonly pavingRadius?: PlanPoint;
  /** `direct` означает одну плиту в точном азимуте, вне полуметрового растра. */
  readonly surfaceMode?: "raster" | "direct";
  /** Статус пятна управляет его временным материалом на карте. */
  readonly status?: AstanaSiteStatus | "finished" | "ensemble";
  /** Ограничение, которое нельзя менять при будущей посадке здания. */
  readonly orientationRule?:
    | "toward-baiterek"
    | "qibla"
    | "composition-tangent"
    | "parallel-to-lrt-platform"
    | "fronts-nurzhol"
    | "opera-forecourt"
    | "gateway-axis"
    | "orthogonal-to-nurzhol"
    | "river-crossing";
  /** Азимут от истинного севера по часовой стрелке, если он обязателен. */
  readonly bearingDegrees?: number;
  /** Конструкция будет стоять над долиной на опорах, а не на грунте. */
  readonly elevated?: boolean;
  /** Неповторимый рисунок мощения, рассчитываемый внутри одного покрытия. */
  readonly surfacePattern?: "baiterek-radial";
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

export interface PlanFootprint {
  readonly center: PlanPoint;
  readonly radius: PlanPoint;
  readonly rotation?: number;
}

export interface StationEntranceClearance extends PlanFootprint {
  readonly stationId: string;
}

/**
 * Свободный прямоугольник перед настоящим наземным порталом станции.
 * Платформа и наклонный рукав уже являются зданием; эта зона начинается у
 * дверей и обязана остаться проходом, а не «остатком места» между пятнами.
 */
export const stationEntranceClearances: readonly StationEntranceClearance[] =
  astanaStations.map((station) => {
    const distance = stationDistance(station.compass);
    const centre = ringPathPoint(distance);
    const ahead = ringPathPoint(distance + 1);
    const behind = ringPathPoint(distance - 1);
    const dx = ahead[0] - behind[0];
    const dz = ahead[1] - behind[1];
    const span = Math.hypot(dx, dz);
    const along: PlanPoint = [dx / span, dz / span];
    const radial = Math.hypot(...centre);
    const inward: PlanPoint = [-centre[0] / radial, -centre[1] / radial];
    const alongCentre = 13.8;
    const inwardCentre = 24;
    return {
      stationId: station.id,
      center: [
        centre[0] + along[0] * alongCentre + inward[0] * inwardCentre,
        centre[1] + along[1] * alongCentre + inward[1] * inwardCentre,
      ],
      radius: [8.5, 4.5],
      rotation: Math.atan2(along[1], along[0]),
    };
  });

/** SAT для двух повёрнутых прямоугольных габаритов в плане. */
export function footprintsOverlap(
  left: PlanFootprint,
  right: PlanFootprint,
  margin = 0,
): boolean {
  const axes = (rotation: number): readonly PlanPoint[] => [
    [Math.cos(rotation), Math.sin(rotation)],
    [-Math.sin(rotation), Math.cos(rotation)],
  ];
  const leftAxes = axes(left.rotation ?? 0);
  const rightAxes = axes(right.rotation ?? 0);
  const delta: PlanPoint = [
    right.center[0] - left.center[0],
    right.center[1] - left.center[1],
  ];
  for (const axis of [...leftAxes, ...rightAxes]) {
    const centreDistance = Math.abs(delta[0] * axis[0] + delta[1] * axis[1]);
    const projected = (footprint: PlanFootprint, basis: readonly PlanPoint[]): number =>
      Math.abs(basis[0][0] * axis[0] + basis[0][1] * axis[1]) * footprint.radius[0]
      + Math.abs(basis[1][0] * axis[0] + basis[1][1] * axis[1]) * footprint.radius[1];
    if (centreDistance > projected(left, leftAxes) + projected(right, rightAxes) + margin) {
      return false;
    }
  }
  return true;
}

// --- Мосты -----------------------------------------------------------------
// Долина Есиля пересекается только в этих точках. Сейчас в живом плане один
// городской мост — пешеходный Атырау — и два перехода эстакады ЛРТ.
// Автомобильный мост снят до появления убедительной внешней связности.

export interface AstanaBridge {
  readonly id: string;
  readonly purpose: string;
  /**
   * Осевая линия моста. У городских мостов это отрезок поперёк долины, у
   * кольцевых — дуга самого кольца: над поймой проходит только эстакада ЛРТ.
   * Внешняя автодорога получит собственное решение после утверждения пятен.
   */
  readonly axis: readonly PlanPoint[];
  readonly halfWidth: number;
  readonly forVehicles: boolean;
  /** Мост несёт эстакада кольца. */
  readonly onRing?: boolean;
}

/**
 * Ось «Атырау» снята как последовательность контрольных смещений с плана,
 * а не сочинена синусом. Несимметричная S-линия и центральное расширение
 * поэтому читаются как одно сооружение, а оба конца остаются на берегу.
 */
function atyrauCrossing(x: number): readonly PlanPoint[] {
  const axis = riverAxisZ(x);
  const half = valleyHalfWidth(x);
  // Сужение Есиля не имеет права сжать уже принятую 21-метровую оболочку:
  // концы моста просто глубже выходят на сушу.
  const length = Math.max(50, half * 2 + 8);
  const planOffsets = [
    0, 0.15, 0.45, 0.9, 1.45, 2.05, 2.55, 2.85, 2.75, 2.35,
    1.65, 0.75, -0.25, -1.05, -1.55, -1.7, -1.55, -1.1, -0.45,
    0.2, 0.65, 0.75, 0.55, 0.25, 0,
  ] as const;
  return planOffsets.map((offset, step) => [
    x + offset,
    axis - length / 2 + length * step / (planOffsets.length - 1),
  ]);
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
// Место прежнего надречного резерва Нур Алема теперь занимает сам мост.
const atyrauAxis = atyrauCrossing(49);

export const astanaBridges: readonly AstanaBridge[] = [
  {
    id: "footbridge",
    purpose: "Пешеходный мост «Атырау»: волна и белая треугольная оболочка",
    axis: atyrauAxis,
    halfWidth: 2.8,
    forVehicles: false,
  },
  ...ringArcs.map((arc, index) => ({
    id: index === 0 ? "ring-east" : "ring-west",
    purpose: "Пролёт эстакады ЛРТ над долиной Есиля",
    axis: arc,
    halfWidth: 4.2,
    forVehicles: false,
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
  return { id, purpose, kind: "roadway", points, width, renderSurface: false };
}

/** Линия городского моста: его осевая и есть маршрут. */
function bridgeWay(bridge: AstanaBridge): AstanaWay {
  return {
    id: `bridge-${bridge.id}`,
    purpose: bridge.purpose,
    kind: "bridge",
    points: bridge.axis,
    width: bridge.halfWidth,
    forVehicles: bridge.forVehicles,
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
      [x, axis + side * (half + RIVER_VALLEY_MARGIN - 1)],
      [x + side * 1.5, axis + side * (half + RIVER_TERRACE_WIDTH + 1)],
      [x + side * 2.5, axis + side * (half + RIVER_BANK_WIDTH * 0.45)],
      [x + side * 3, axis + side * (half - 1.5)],
    ],
    width: 1.8,
  };
}

function atyrauFutureApproach(side: -1 | 1): AstanaWay {
  const end = side < 0 ? atyrauAxis[0] : atyrauAxis[atyrauAxis.length - 1];
  return {
    id: side < 0 ? "atyrau-link-south" : "atyrau-link-north",
    purpose: "Мягкий резерв связности от S-образного конца моста Атырау",
    kind: "approach",
    points: [
      end,
      [end[0] - 2, end[1] + side * 3],
      [end[0] - 3, end[1] + side * 6],
      [end[0] - 2, end[1] + side * 9],
    ],
    width: 1.8,
    renderSurface: false,
  };
}

export const astanaWays: readonly AstanaWay[] = [
  // === Кольцо ==============================================================
  ringWay(
    "turan-ring",
    "Резерв внешней связности: прежняя дорога под ЛРТ больше не строится",
    3.5,
  ),

  // === Ядро: бульвар Нұржол ================================================
  {
    id: "nurzhol-boulevard",
    purpose: "Цветочный бульвар Нұржол: пешеходная ось Байтерек — Хан Шатыр",
    kind: "promenade",
    points: [
      [0, 0], [7, -5.86], [14, -11.71], [21, -17.57],
      [28, -23.43], [34, -28.45],
    ],
    width: 4.5,
    renderSurface: false,
  },

  // === Радиальные проспекты к станциям =====================================
  {
    id: "avenue-west",
    purpose: "Западный проспект: от партера Байтерека к станции Нұрлы жол",
    kind: "roadway",
    points: [[-46, 0], [-52, -18], [-66, -29], [-82, -24], [-91, -10], [-93, 0]],
    width: 3.75,
    renderSurface: false,
  },
  {
    id: "avenue-east",
    purpose: "Восточный проспект: от пирамиды к станции Әуежай",
    kind: "roadway",
    points: [[46, 0], [52, -14], [70, -16], [84, -12], [92, -4], [93, 0]],
    width: 3.75,
    renderSurface: false,
  },
  {
    id: "avenue-south",
    purpose: "Южный проспект: от партера через Триумфальную арку к Астана Арене",
    kind: "roadway",
    points: [[0, -18], [0, -34], [0, -50], [0, -66], [0, -82], [0, -93]],
    width: 3.75,
    renderSurface: false,
  },
  {
    id: "avenue-north",
    purpose: "Резерв мягкой северо-западной связности от партера",
    kind: "roadway",
    points: [[0, 0], [4, 3], [10, 5], [18, 6], [24, 8]],
    width: 3.75,
    renderSurface: false,
  },
  {
    id: "mangilik-el",
    purpose: "Проспект Мәңгілік Ел: диагональ к мечети, сфере и ЭКСПО-подиуму",
    kind: "roadway",
    points: [[8, -6], [20, -18], [32, -30], [44, -42], [56, -54], [64, -62]],
    width: 3.5,
    renderSurface: false,
  },

  // === Долина Есиля ========================================================
  ...astanaBridges.filter((bridge) => !bridge.onRing).map(bridgeWay),
  atyrauFutureApproach(-1),
  atyrauFutureApproach(1),
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
    width: 2,
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
      // Точный узел существующей связки к старому городу: набережная не
      // распадается на отдельный северный остров после сужения долины.
      [84.3, 49.9],
    ],
    width: 2,
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
    width: 3.5,
    renderSurface: false,
  },
  {
    id: "kenesary",
    purpose: "Улица Кенесары: внутренняя ось к привокзальной площади",
    kind: "roadway",
    points: [[0, 62], [0, 70], [0, 78], [0, 86]],
    width: 3,
    renderSurface: false,
  },
  {
    id: "station-square-approach",
    purpose: "Выход с привокзальной площади к станции Жібек жолы",
    kind: "pavement",
    points: [[0, 86], [0, 90], [0, 94]],
    width: 2,
  },
  {
    id: "old-yard-west",
    purpose: "Дворовый проезд между двухэтажками западного квартала",
    kind: "yard",
    points: [[-46, 70], [-46, 78], [-38, 82], [-26, 82], [-18, 78]],
    width: 1.8,
  },
  {
    id: "old-yard-east",
    purpose: "Дворовый проезд восточного квартала: гаражи и голубятня",
    kind: "yard",
    points: [[22, 70], [26, 78], [36, 82], [48, 80], [54, 74]],
    width: 1.8,
  },

  // === Связки кольца с городом ============================================
  {
    id: "ring-link-north",
    purpose: "Съезд с кольца к привокзальной площади",
    kind: "roadway",
    points: [[0, 98], [0, 94]],
    width: 3,
    renderSurface: false,
  },
  {
    id: "ring-link-east",
    purpose: "Съезд с кольца на восточный проспект",
    kind: "roadway",
    points: [[93, 0], [96, 0]],
    width: 3,
    renderSurface: false,
  },
  {
    id: "ring-link-south",
    purpose: "Съезд с кольца на южный проспект",
    kind: "roadway",
    points: [[0, -93], [0, -96]],
    width: 3,
    renderSurface: false,
  },
  {
    id: "ring-link-west",
    purpose: "Съезд с кольца на западный проспект",
    kind: "roadway",
    points: [[-93, 0], [-96, 0]],
    width: 3,
    renderSurface: false,
  },
  {
    id: "respubliki-link",
    purpose: "Связка проспекта Республики с кольцом на востоке",
    kind: "roadway",
    points: [[64, 73], [72, 70], [79, 62], [84.3, 49.9]],
    width: 3,
    renderSurface: false,
  },
  {
    id: "quay-link-west",
    purpose: "Связка западной набережной с кольцом",
    kind: "promenade",
    points: [[-88, riverAxisZ(-88) - valleyHalfWidth(-88) + 3], [-92, 22], [-95, 12], [-96, 0]],
    width: 2,
  },
  {
    id: "mangilik-ring-link",
    purpose: "Выход проспекта Мәңгілік Ел на кольцо",
    kind: "roadway",
    points: [[64, -62], [70, -63], [75.1, -63]],
    width: 3.25,
    renderSurface: false,
  },
] as const;

/** Только эти линии становятся реальным покрытием в текущей итерации. */
export const renderedAstanaWays: readonly AstanaWay[] = astanaWays.filter(
  (way) => way.renderSurface !== false,
);

// --- Места -----------------------------------------------------------------

const khanSite = astanaLandmarkSiteById["khan-shatyr-plot"];
const pyramidSite = astanaLandmarkSiteById["pyramid-plot"];
const nurAlemSite = astanaLandmarkSiteById["nur-alem-expo-plot"];
const plazaSite = astanaLandmarkSiteById["abu-dhabi-plaza-plot"];
const archSite = astanaLandmarkSiteById["arch-square"];
const operaSite = astanaLandmarkSiteById["opera-plot"];
const circusSite = astanaLandmarkSiteById["circus-plot"];
const museumSite = astanaLandmarkSiteById["museum-plot"];

export const astanaAreas: readonly AstanaArea[] = [
  {
    id: "bayterek-parterre",
    purpose: "Партер Байтерека: гранитный круг в центре острова",
    center: [0, 0],
    radius: [18, 18],
    pavingRadius: [16, 16],
    status: "finished",
    kind: "public-space",
    shape: "ellipse",
    surfacePattern: "baiterek-radial",
  },
  {
    id: "nurzhol-flower-boulevard",
    purpose: "Композиционный резерв цветочного бульвара Байтерек — Хан Шатыр",
    center: nurzholPoint((NURZHOL_START + NURZHOL_END) / 2),
    radius: [(NURZHOL_END - NURZHOL_START) / 2, 4.6],
    rotation: NURZHOL_PLAN_ROTATION,
    status: "finished",
    kind: "public-space",
  },
  {
    id: "khan-shatyr-plot",
    purpose: "Хан Шатыр на юго-восточном продолжении оси Атырау — Байтерек",
    center: khanSite.center,
    radius: khanSite.radius,
    rotation: KHAN_SHATYR_YAW,
    status: khanSite.status,
    orientationRule: "toward-baiterek",
  },
  {
    id: "pyramid-plot",
    purpose: "Дворец мира и согласия над Есилем на оси Хан Шатыр — Байтерек",
    center: pyramidSite.center,
    radius: pyramidSite.radius,
    rotation: pyramidSite.rotation,
    pavingRadius: [12, 12],
    surfaceMode: "direct",
    status: pyramidSite.status,
    elevated: pyramidSite.elevated,
    orientationRule: "orthogonal-to-nurzhol",
  },
  {
    id: "nur-alem-expo-plot",
    purpose: "Нур Алем в отдельной южной среде на бывшем резерве мечети",
    center: nurAlemSite.center,
    radius: nurAlemSite.radius,
    rotation: nurAlemSite.rotation,
    pavingRadius: [13, 13],
    surfaceMode: "direct",
    status: nurAlemSite.status,
    shape: "ellipse",
    orientationRule: "composition-tangent",
  },
  {
    id: "abu-dhabi-plaza-plot",
    purpose: "Абу-Даби Плаза напротив тамбура западной станции ЛРТ",
    center: plazaSite.center,
    radius: plazaSite.radius,
    rotation: plazaSite.rotation,
    pavingRadius: [4, 2.5],
    surfaceMode: "direct",
    status: plazaSite.status,
    orientationRule: "parallel-to-lrt-platform",
  },
  {
    id: "arch-square",
    purpose: "Триумфальная арка справа от Оперы на расстоянии Опера — Нуржол",
    center: archSite.center,
    radius: archSite.radius,
    rotation: archSite.rotation,
    pavingRadius: [7, 1.7],
    surfaceMode: "direct",
    status: archSite.status,
    orientationRule: "opera-forecourt",
  },
  {
    id: "station-square",
    purpose: "Привокзальная площадь старого города",
    center: [0, 84],
    radius: [12, 6],
    pavingRadius: [11, 5],
    status: "ensemble",
    kind: "public-space",
  },
  {
    id: "old-square",
    purpose: "Старая площадь: гостиница «Ишим», ряды, драмтеатр",
    center: [25, 72],
    radius: [10, 5],
    pavingRadius: [9, 4],
    status: "ensemble",
    kind: "public-space",
  },
  {
    id: "old-yard-west-court",
    purpose: "Двор западного квартала двухэтажек: лавки, качели, тополя",
    center: [-40, 82],
    radius: [9, 5],
    status: "ensemble",
    kind: "public-space",
  },
  {
    id: "old-yard-east-court",
    purpose: "Двор восточного квартала: гаражи, голубятня, теплотрасса",
    center: [46, 81],
    radius: [9, 5],
    status: "ensemble",
    kind: "public-space",
  },
  {
    id: "opera-plot",
    purpose: "Астана Опера: южный фронтон точно в середину цветочного Нуржола",
    center: operaSite.center,
    radius: operaSite.radius,
    rotation: operaSite.rotation,
    pavingRadius: [11, 7],
    surfaceMode: "direct",
    status: operaSite.status,
    orientationRule: "fronts-nurzhol",
  },
  {
    id: "circus-plot",
    purpose: "Вторичный резерв цирка-«тарелки»",
    center: circusSite.center,
    radius: circusSite.radius,
    rotation: circusSite.rotation,
    pavingRadius: [7, 7],
    surfaceMode: "direct",
    status: circusSite.status,
    shape: "ellipse",
    orientationRule: "composition-tangent",
  },
  {
    id: "museum-plot",
    purpose: "Сжатый вторичный резерв Национального музея",
    center: museumSite.center,
    radius: museumSite.radius,
    rotation: museumSite.rotation,
    pavingRadius: [6, 4],
    surfaceMode: "direct",
    status: museumSite.status,
    orientationRule: "composition-tangent",
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
