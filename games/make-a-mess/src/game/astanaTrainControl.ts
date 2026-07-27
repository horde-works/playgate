// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Igor Kirisiuk
//
// Автопилот состава ЛРТ: GOA4, без машиниста.
//
// Это подкласс той же идеи, что возит небесный поезд терминала (`vehicleFrames`):
// маршрут даёт геометрию, а машина сама решает, с какой скоростью по нему
// идти. Разница ровно одна и она принципиальная — дирижабль знает своё
// положение точно, а РЕЛЬСОВЫЙ состав не знает. Он считает пройденный путь
// одометрией по колёсам, она дрейфует от проскальзывания, и обнуляют её
// путевые балисы: те самые жёлто-охровые коробочки поперёк пути, которые
// Igor заметил на настоящей линии.
//
// Отсюда всё остальное:
//   - тормозить автопилот обязан по ОДОМЕТРИИ, а не по истинному s. Иначе
//     механизм становится декорацией: балисы стоят, а нужны они никому;
//   - точность остановки — это накопленный дрейф с последней балисы. Балиса
//     стоит за четыре метра до точки остановки, поэтому ошибка выходит в
//     сантиметры, и двери совпадают с платформенными;
//   - если дрейф всё же велик, двери не открываются: состав подтягивается.
//
// Модуль намеренно чистый: ни three, ни rapier, ни React. Всё, что здесь
// есть, считается в тесте.

import {
  RING_PATH_LENGTH,
  TRAIN_LENGTH,
  onRingStraight,
  ringBalises,
  stationDistance,
  type Compass,
  type RingBalise,
} from "../content/scenes/astana/astanaPlan.ts";
import type { LampEventState } from "./destructionScene.ts";

/** Радиус дуги кольца. По нему считается предел скорости в повороте. */
const RING_CURVE_RADIUS = 98;

export const TRAIN_LIMITS = {
  /** Конструкционная скорость TRITON — 80 км/ч. */
  maximumSpeed: 22.2,
  /** Пусковое ускорение, м/с². */
  acceleration: 1.1,
  /** Служебное торможение, м/с². Экстренное сильнее, но им не ездят. */
  braking: 1.15,
  /**
   * Допустимое боковое ускорение. Кольцо радиусом 98 м — это постоянная
   * кривая, и она, а не мощность, задаёт скорость на перегоне: при 1.0 м/с²
   * получается 9.9 м/с, то есть 35 км/ч. Настоящая линия так и живёт —
   * средняя эксплуатационная 39.5 км/ч при конструкционных 80.
   */
  lateralAcceleration: 1,
  /** Запас до точки остановки, на котором тормозная кривая уже нулевая. */
  stoppingMargin: 0.4,
} as const;

export const TRAIN_DWELL = {
  /** Стоянка под посадку, с. */
  boarding: 20,
  /** Предупреждение о закрытии дверей, с. */
  warning: 3,
  /** Ход створки, с. */
  doorTravel: 2.2,
} as const;

/**
 * Проскальзывание колеса: доля пути, которую одометрия теряет или добирает.
 * Полпроцента — честный порядок для рельсового транспорта; за перегон в
 * полтораста метров это набегает под метр, и без балис двери разошлись бы с
 * платформенными на глаз.
 */
export const ODOMETRY_SLIP = 0.005;

/** Дальше этого расхождения двери не открывают: состав подтягивается. */
export const DOOR_ENABLE_TOLERANCE = 0.35;

export type TrainMode =
  /** Стоит у платформы, двери открыты. */
  | "boarding"
  /** Двери закрываются, отправление вот-вот. */
  | "closing"
  /** Разгон от платформы. */
  | "departing"
  /** Перегон. */
  | "cruise"
  /** Торможение к следующей остановке. */
  | "approach"
  /** Остановился, но точность не позволяет открыть двери. */
  | "creeping";

export interface TrainState {
  /** Истинное положение НОСА состава по пути, м. */
  readonly distance: number;
  readonly speed: number;
  /** Чему одометр верит. Это и есть то, чем управляет автопилот. */
  readonly odometry: number;
  readonly mode: TrainMode;
  /** 0 — закрыты, 1 — открыты. */
  readonly doors: number;
  readonly dwell: number;
  /** Индекс следующей точки остановки в расписании кольца. */
  readonly stopIndex: number;
  /** Сколько времени состав в текущем режиме, с. */
  readonly modeTime: number;
}

export interface TrainStop {
  readonly station: Compass;
  /** Точка остановки носа состава по пути. */
  readonly distance: number;
}

/**
 * Расписание кольца: четыре точки остановки по ходу. Нос встаёт на середину
 * вставки плюс половину длины состава — ровно там, где стоит балиса `stop`.
 */
export function ringStops(): readonly TrainStop[] {
  const order: readonly Compass[] = ["east", "north", "west", "south"];
  return order
    .map((station) => ({
      station,
      distance: stationDistance(station) + TRAIN_LENGTH / 2,
    }))
    .sort((left, right) => left.distance - right.distance);
}

/** Расстояние вперёд по кольцу от одной точки до другой. */
export function distanceAhead(from: number, to: number): number {
  const raw = (to - from) % RING_PATH_LENGTH;
  return raw < 0 ? raw + RING_PATH_LENGTH : raw;
}

/**
 * Предел скорости в точке пути. На станционной вставке путь прямой, и там
 * можно быстрее; на дуге скорость держит боковое ускорение.
 */
export function curveSpeedLimit(distance: number): number {
  if (onRingStraight(distance)) {
    return TRAIN_LIMITS.maximumSpeed;
  }
  return Math.sqrt(TRAIN_LIMITS.lateralAcceleration * RING_CURVE_RADIUS);
}

/**
 * Тормозная кривая: с какой скоростью можно идти, когда до остановки
 * осталось `remaining` метров. Это то же требование маршрута, что у
 * дирижабля, только тормозит рельсовый состав куда решительнее.
 */
export function brakingSpeedLimit(remaining: number): number {
  const usable = Math.max(0, remaining - TRAIN_LIMITS.stoppingMargin);
  return Math.sqrt(2 * TRAIN_LIMITS.braking * usable);
}

/**
 * Целевая скорость автопилота. Считается ПО ОДОМЕТРИИ: машина знает только
 * то, что ей сообщили колёса и балисы.
 */
export function targetSpeed(
  odometry: number,
  stopDistance: number,
): number {
  return Math.min(
    TRAIN_LIMITS.maximumSpeed,
    curveSpeedLimit(odometry),
    brakingSpeedLimit(distanceAhead(odometry, stopDistance)),
  );
}

/**
 * Детерминированный «шум» проскальзывания: одинаковый мир в каждой сборке и
 * повторяемый тест. Знак меняется вдоль пути — колесо то теряет, то добирает.
 */
function slipAt(distance: number): number {
  const value = Math.sin(distance * 0.7331) * 43758.5453;
  return (value - Math.floor(value)) * 2 - 1;
}

const BALISES = ringBalises();

/**
 * Балиса, которую состав переехал на отрезке (from, to]. Сравнивается
 * ИСТИННОЕ положение: транспондер лежит на пути и срабатывает от того, что
 * над ним проехали, а не от того, что думает одометр.
 */
export function baliseCrossed(from: number, to: number): RingBalise | null {
  if (to <= from) {
    return null;
  }
  let crossed: RingBalise | null = null;
  for (const balise of BALISES) {
    for (const lap of [-1, 0, 1]) {
      const at = balise.distance + lap * RING_PATH_LENGTH;
      if (at > from && at <= to && (!crossed || at > crossed.distance)) {
        crossed = balise;
      }
    }
  }
  return crossed;
}

export function initialTrainState(stopIndex = 0): TrainState {
  const stops = ringStops();
  const stop = stops[stopIndex % stops.length];
  return {
    distance: stop.distance,
    speed: 0,
    odometry: stop.distance,
    mode: "boarding",
    doors: 1,
    dwell: TRAIN_DWELL.boarding,
    stopIndex: (stopIndex + 1) % stops.length,
    modeTime: 0,
  };
}

/** Ошибка позиционирования: на сколько одометр разошёлся с миром. */
export function odometryError(state: TrainState): number {
  const raw = (state.odometry - state.distance) % RING_PATH_LENGTH;
  const wrapped = raw < 0 ? raw + RING_PATH_LENGTH : raw;
  return wrapped > RING_PATH_LENGTH / 2 ? wrapped - RING_PATH_LENGTH : wrapped;
}

/**
 * Шаг физики. Порядок действий — как на настоящей линии: сначала считаем
 * ход по управлению, потом проезжаем путь, потом одометрия ловит балису.
 */
export function advanceTrain(
  state: TrainState,
  deltaSeconds: number,
): TrainState {
  const stops = ringStops();
  const stop = stops[state.stopIndex % stops.length];
  const delta = Math.max(0, Math.min(0.25, deltaSeconds));
  const modeTime = state.modeTime + delta;

  // Стоянка: двери открываются, пассажиры входят, двери закрываются.
  if (state.mode === "boarding") {
    const dwell = state.dwell - delta;
    const doors = Math.min(1, state.doors + delta / TRAIN_DWELL.doorTravel);
    if (dwell > TRAIN_DWELL.warning) {
      return { ...state, dwell, doors, modeTime };
    }
    return { ...state, dwell, doors, mode: "closing", modeTime: 0 };
  }
  if (state.mode === "closing") {
    const doors = Math.max(0, state.doors - delta / TRAIN_DWELL.doorTravel);
    if (doors > 0) {
      return { ...state, doors, modeTime };
    }
    return { ...state, doors: 0, mode: "departing", modeTime: 0 };
  }

  // Ход. Автопилот сравнивает свою скорость с целевой и выбирает тягу или
  // торможение — никакого телепорта по идеальному расписанию.
  const wanted = targetSpeed(state.odometry, stop.distance);
  const rate = wanted > state.speed
    ? TRAIN_LIMITS.acceleration
    : -TRAIN_LIMITS.braking;
  let speed = state.speed + rate * delta;
  speed = rate > 0 ? Math.min(speed, wanted) : Math.max(speed, wanted);
  speed = Math.max(0, speed);

  const travelled = speed * delta;
  const distance = (state.distance + travelled) % RING_PATH_LENGTH;
  // Одометрия набирает тот же путь с ошибкой проскальзывания.
  let odometry =
    state.odometry + travelled * (1 + ODOMETRY_SLIP * slipAt(state.distance));

  const balise = baliseCrossed(state.distance, state.distance + travelled);
  if (balise) {
    // Коррекция: транспондер знает своё место точно, одометр — нет.
    odometry = balise.distance + (state.distance + travelled - balise.distance);
  }
  odometry %= RING_PATH_LENGTH;

  const remaining = distanceAhead(odometry, stop.distance);
  const stopped = speed <= 0.01;

  if (stopped && remaining < 2) {
    // Приехали. Двери открываем, только если попали в допуск: платформенные
    // стенки не подвинутся, а по-настоящему проверить себя состав может
    // лишь по последней балисе.
    const error = Math.abs(
      distanceAhead(distance, stop.distance) > RING_PATH_LENGTH / 2
        ? distanceAhead(distance, stop.distance) - RING_PATH_LENGTH
        : distanceAhead(distance, stop.distance),
    );
    if (error <= DOOR_ENABLE_TOLERANCE) {
      return {
        distance,
        speed: 0,
        odometry,
        mode: "boarding",
        doors: 0,
        dwell: TRAIN_DWELL.boarding,
        stopIndex: (state.stopIndex + 1) % stops.length,
        modeTime: 0,
      };
    }
    return { distance, speed: 0, odometry, mode: "creeping", doors: 0,
      dwell: state.dwell, stopIndex: state.stopIndex, modeTime };
  }

  // Подтягивание: если встали не там, ползём к точке на маневровой скорости.
  if (state.mode === "creeping") {
    const creep = Math.min(0.6, remaining);
    return {
      distance: (distance + creep * delta) % RING_PATH_LENGTH,
      speed: creep,
      odometry: (odometry + creep * delta) % RING_PATH_LENGTH,
      mode: remaining < 0.05 ? "boarding" : "creeping",
      doors: 0,
      dwell: TRAIN_DWELL.boarding,
      stopIndex: remaining < 0.05
        ? (state.stopIndex + 1) % stops.length
        : state.stopIndex,
      modeTime,
    };
  }

  const mode: TrainMode =
    remaining < 60 && speed <= wanted + 0.01 && wanted < TRAIN_LIMITS.maximumSpeed
      ? "approach"
      : state.mode === "departing" && speed < wanted - 0.05
        ? "departing"
        : "cruise";

  return { distance, speed, odometry, mode, doors: 0, dwell: state.dwell,
    stopIndex: state.stopIndex, modeTime };
}

/**
 * Одно состояние рейса управляет всем светом и всеми табло — тот же контракт,
 * что у небесного поезда: свет салона, кромки дверей, платформенные ленты и
 * маршрутное табло читают ЭТО, а не каждый свою переменную.
 */
export function trainEventState(state: TrainState): LampEventState {
  switch (state.mode) {
    case "boarding":
      return "docked";
    case "closing":
    case "creeping":
      return "attention";
    case "departing":
      return "departure";
    case "approach":
      return "approach";
    default:
      return "cruise";
  }
}

/**
 * Свечение подсвеченной кромки двери. Стоим — ровный зелёный, закрываемся —
 * мигает, в пути — погашена: точно как у перронных огней отправления.
 */
export function doorEdgeGlow(state: TrainState, elapsedSeconds: number): number {
  if (state.mode === "boarding") {
    return 1;
  }
  if (state.mode === "closing" || state.mode === "creeping") {
    const phase = (elapsedSeconds % 0.5) / 0.5;
    return phase < 0.55 ? 1.6 : 0;
  }
  return 0;
}

/** Что показывает маршрутное табло на морде и ленты над платформенными дверьми. */
export function nextStationOf(state: TrainState): Compass {
  const stops = ringStops();
  return stops[state.stopIndex % stops.length].station;
}
