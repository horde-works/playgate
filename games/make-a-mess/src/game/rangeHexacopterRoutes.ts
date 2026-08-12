import type { SceneVector3 } from "./destructionScene.ts";
import {
  createMotionRoute,
  motionRoutePhase,
  type MotionRouteArtifact,
  type MotionRouteDefinition,
  type MotionRoutePhase,
  type MotionRouteRequirementContext,
} from "./motionRoute.ts";
import type { VehicleRoutePlan } from "./skyTrainRoutes.ts";
import { HEXACOPTER_NOSE } from "./townHexacopter.ts";
import {
  RANGE_DECK_TOP_Y,
  RANGE_HEXACOPTER_PAD_X,
  RANGE_HEXACOPTER_PAD_Z,
} from "./rangeHexacopter.ts";

/**
 * СЛОЖНЫЙ ОБЛЁТ ПЛОСКОГО СТАЛЬНОГО МИРА (фишка №1, вердикт Igor 07.08.2026).
 *
 * Полигон Tonkawa пуст и плосок — идеальная обсерватория исполнения
 * траекторий: ни застройки, ни рельефа, ни чужих кадровых затрат. Маршрут
 * поэтому намеренно НЕ прост: трёхлепестковая розетка r(θ) = A + B·cos 3θ
 * вокруг центра диска даёт непрерывно меняющуюся кривизну — радиус виража
 * гуляет от ~6 м в горле лепестка до ~12 м на вершине — плюс волну высоты
 * по лепесткам. Это экзамен виража, упреждения и губернатора скорости в
 * одном заходе. Глубже волну не делать: у розы A + B·cos 3θ горло быстро
 * вырождается в шпильку (при A=26/B=16 радиус кривизны падает до 0.75 м —
 * непосильно ни на какой скорости).
 *
 * Как и городской маршрут, розетка авторится в ОСЯХ МАШИНЫ (a — вперёд по
 * носу, b — на левый борт) и задаёт только требования: линию, высоту,
 * разрешённую скорость. Узлы и ручки Безье НЕ рисуются на глаз: точки
 * сэмплируются с кривой, касательные — аналитическая производная, длина
 * ручки |P'|·Δt/3 (кубическая аппроксимация дуги).
 *
 * Требования не пользуются фазовой моделью «прогресс → θ»: роза занимает
 * не весь маршрут, и такая модель разъезжается с геометрией на десятки
 * градусов. Волна высоты читает ФАКТИЧЕСКИЙ угол точки вокруг центра
 * диска, банда скорости — ФАКТИЧЕСКИЙ радиус кривизны самой линии
 * (три точки на широкой базе; кривизне — широкая база, склону — мелкая).
 */

export type RangeHexacopterFlightKind = "circuit" | "tour" | "evasive";

/** Поперечная ось маршрута в мире — та же формула, что у города. */
const LATERAL: SceneVector3 = [HEXACOPTER_NOSE[2], 0, -HEXACOPTER_NOSE[0]];

/** Центр диска полигона (мир [0,0]) в осях машины от площадки. */
const DISC_A =
  (0 - RANGE_HEXACOPTER_PAD_X) * HEXACOPTER_NOSE[0] +
  (0 - RANGE_HEXACOPTER_PAD_Z) * HEXACOPTER_NOSE[2];
const DISC_B =
  (0 - RANGE_HEXACOPTER_PAD_X) * LATERAL[0] +
  (0 - RANGE_HEXACOPTER_PAD_Z) * LATERAL[2];

/** Палуба пуста — полка отрыва скромная, но честная: выше стакана и RAX. */
const DECK_CLEAR_ALTITUDE = 12;
const CLIMB_DISTANCE = 22;
const FINAL_DESCENT_DISTANCE = 30;
/**
 * Створ подхода — прямая ЗА КОРМОЙ площадки (локальный −a): машина, как и в
 * городе, докуется ходом вперёд по носу, и шлюз курса `flight.approach`
 * ждёт касательную финала вдоль носа. Восточный створ висит за кромкой
 * настила — по прецеденту RAX (маршрут до 112 м от берта) землю под
 * летающую машину не расширяют, её покрывают небо и камера.
 */
const FINAL_RUN = 24;

function clamp01(value: number): number {
  return value <= 0 ? 0 : value >= 1 ? 1 : value;
}

function smootherStep(value: number): number {
  const t = clamp01(value);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/**
 * Розетка в локальных осях. θ = 0 — вершина дальнего (западного) лепестка:
 * вход с площадки получает длинный разгонный створ через палубу.
 */
const ROSE_MEAN = 30;
const ROSE_WAVE = 10;
function rosePoint(theta: number): { p: SceneVector3; d: SceneVector3 } {
  const r = ROSE_MEAN + ROSE_WAVE * Math.cos(3 * theta);
  const dr = -3 * ROSE_WAVE * Math.sin(3 * theta);
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  // P(θ) = C + r(θ)·(cos θ, sin θ);  P'(θ) = dr·(cos,sin) + r·(-sin,cos)
  return {
    p: [DISC_A + r * cos, 0, DISC_B + r * sin],
    d: [dr * cos - r * sin, 0, dr * sin + r * cos],
  };
}

/** Высотная волна по лепесткам: 10…20 м, гребни на вершинах лепестков. */
function roseAltitude(theta: number): number {
  return 15 + 5 * Math.cos(3 * theta);
}

function roseNode(id: string, theta: number, thetaStep: number) {
  const { p, d } = rosePoint(theta);
  const scale = thetaStep / 3;
  return {
    id,
    position: p,
    incoming: [
      p[0] - d[0] * scale,
      0,
      p[2] - d[2] * scale,
    ] as SceneVector3,
    outgoing: [
      p[0] + d[0] * scale,
      0,
      p[2] + d[2] * scale,
    ] as SceneVector3,
    samples: 48,
  };
}

/**
 * УКЛОНЕНИЕ: маршрут, построенный ПРОТИВ ЭКСТРАПОЛЯТОРА.
 *
 * Атакующий не знает плана цели, но видит её живой манёвр и продолжает его
 * моделью постоянного разворота. Значит трудность цели — это НЕ скорость и не
 * тугой вираж (по обоим параметрам HX-6 заведомо уступает), а частота, с
 * которой её манёвр перестаёт быть тем, чем был. Ломают предсказание три вещи,
 * и все три здесь заданы формулой:
 *
 *  1. СМЕНА ЗНАКА КРИВИЗНЫ. Основа — лемниската Жероно `(A cos t, B sin 2t)`:
 *     она проходит через центр дважды и обходит доли в противоположных
 *     направлениях ПО ПОСТРОЕНИЮ, а не по удаче расстановки точек.
 *  2. СЕРПАНТИН поверх неё: пять периодов за оборот. На круге длиной около
 *     двухсот метров и скорости порядка десяти метров в секунду это перемена
 *     направления каждые полторы-две секунды — ровно тот порядок, которым
 *     реальная машина срывает прицел стрелку.
 *  3. ВЫСОТНАЯ ВОЛНА, и она здесь главная. У атакующего ствол закреплён на
 *     корпусе, отдельного привода тангажа нет, и вертикально он наводится
 *     ВЫСОТОЙ. Три периода за оборот против пяти у серпантина: периоды
 *     несоизмеримы, поэтому ошибка по курсу и ошибка по высоте почти никогда
 *     не обнуляются одновременно.
 *
 * Радиусы намеренно щадящие: маршрут обязан быть посильным САМОЙ ЦЕЛИ
 * (поперечных у неё 5.66 м/с² против 14.5 у атакующего), иначе она провалит
 * собственную трассу и боя не выйдет. Посильность проверяется тестом, а не
 * обещанием.
 */
/**
 * Числа подобраны ЗАМЕРОМ, и первый подбор был поучительно неверен.
 *
 * Серпантин амплитудой 6 м с пятью периодами накладывался на уже искривлённую
 * долю лемнискаты, кривизны складывались, и вместо змейки выходили шпильки
 * радиусом 4.7 м. Полоса скорости — она считается из геометрии — честно
 * притормаживала цель до четырёх метров в секунду, и получалось ровно
 * обратное задуманному: МЕДЛЕННАЯ цель, по которой попасть легче, чем по
 * быстрой. Уклонение — это не «дёргаться сильнее», а сохранять ход, меняя
 * замысел.
 *
 * Поэтому доли расширены, серпантин ослаблен до модуляции, а основную работу
 * делает ВЫСОТА: у атакующего ствол на корпусе, вертикально он наводится
 * высотой, и сбить его по этой оси дешевле всего. Периоды серпантина и волны
 * (4 и 3) несоизмеримы — ошибки по курсу и по высоте почти никогда не
 * обнуляются вместе.
 */
const EVADE_LOBE = 48;
const EVADE_HEIGHT = 30;
const EVADE_WEAVE = 3.5;
const EVADE_WEAVE_CYCLES = 4;
const EVADE_ALTITUDE_MEAN = 21;
/** 9 м на трёх периодах требуют 2.4 м/с² вертикали при располагаемых 2.75. */
const EVADE_ALTITUDE_WAVE = 9;
const EVADE_ALTITUDE_CYCLES = 3;
/** Плечо входа в волну. На 18 м оно требовало 23 м/с набора — неисполнимо. */
const EVADE_ALTITUDE_RAMP = 45;

function evadePoint(t: number): { p: SceneVector3; d: SceneVector3 } {
  const weave = EVADE_WEAVE_CYCLES;
  return {
    p: [
      DISC_A + EVADE_LOBE * Math.cos(t),
      0,
      DISC_B + EVADE_HEIGHT * Math.sin(2 * t) + EVADE_WEAVE * Math.sin(weave * t),
    ],
    d: [
      -EVADE_LOBE * Math.sin(t),
      0,
      2 * EVADE_HEIGHT * Math.cos(2 * t) +
        weave * EVADE_WEAVE * Math.cos(weave * t),
    ],
  };
}

function evadeNode(id: string, t: number, step: number) {
  const { p, d } = evadePoint(t);
  const scale = step / 3;
  return {
    id,
    position: p,
    incoming: [p[0] - d[0] * scale, 0, p[2] - d[2] * scale] as SceneVector3,
    outgoing: [p[0] + d[0] * scale, 0, p[2] + d[2] * scale] as SceneVector3,
    samples: 24,
  };
}

function evasiveGeometry(): MotionRouteDefinition {
  // Серпантин с пятью периодами требует плотной сетки: узлов должно быть
  // заметно больше, чем колебаний, иначе кубический сплайн срежет их в дугу и
  // весь смысл маршрута пропадёт. Сорок восемь узлов — почти десять на период.
  const STEP = (2 * Math.PI) / 48;
  const nodes: MotionRouteDefinition["nodes"][number][] = [
    { id: "pad", position: [0, 0, 0] },
    {
      id: "deck-clear",
      position: [CLIMB_DISTANCE, 0, 2],
      outgoing: [CLIMB_DISTANCE + 12, 0, 4],
    },
  ];
  let cursor = 0;
  for (let t = 0; t <= 2 * Math.PI + 1e-9; t += STEP) {
    nodes.push(evadeNode(`evade-${cursor}`, t, STEP));
    cursor += 1;
  }
  const last = `evade-${cursor - 1}`;
  nodes.push(
    {
      id: "arrival-shoulder",
      position: [-(FINAL_RUN + 22), 0, 5],
      incoming: [-(FINAL_RUN + 18), 0, 17],
      outgoing: [-(FINAL_RUN + 12), 0, -1],
      samples: 48,
    },
    {
      id: "final-entry",
      position: [-FINAL_RUN, 0, 0],
      incoming: [-(FINAL_RUN + 10), 0, 0],
      outgoing: [-FINAL_RUN * 0.4, 0, 0],
      samples: 40,
    },
    { id: "dock", position: [0, 0, 0] },
  );
  return {
    id: "range-hexacopter:evasive",
    nodes,
    measureAxes: [0, 2],
    markers: {
      verticalDepartureComplete: "deck-clear",
      departureComplete: "evade-0",
      roseComplete: last,
      arriving: "arrival-shoulder",
      final: "final-entry",
    },
  };
}

/**
 * Высота уклонения задаётся ПУТЕВОЙ КООРДИНАТОЙ, а не углом вокруг центра:
 * лемниската не звёздчата относительно него, и atan2 на ней крутится рывками.
 */
function evasiveAltitude(
  geometry: MotionRouteArtifact,
  { distance, remaining, progress }: MotionRouteRequirementContext,
): number {
  if (distance < CLIMB_DISTANCE) {
    const t = clamp01(distance / CLIMB_DISTANCE);
    return DECK_CLEAR_ALTITUDE * (1 - (1 - t) * (1 - t));
  }
  if (remaining < FINAL_DESCENT_DISTANCE) {
    const t = clamp01((remaining - 3) / (FINAL_DESCENT_DISTANCE - 3));
    return DECK_CLEAR_ALTITUDE * (1 - (1 - t) * (1 - t));
  }
  const start = geometry.markerProgress("departureComplete");
  const end = geometry.markerProgress("roseComplete");
  const ramp = EVADE_ALTITUDE_RAMP / geometry.length;
  const inside = Math.min(
    smootherStep((progress - start) / ramp),
    smootherStep((end - progress) / ramp),
  );
  const u = clamp01((progress - start) / Math.max(1e-6, end - start));
  const wave =
    EVADE_ALTITUDE_MEAN +
    EVADE_ALTITUDE_WAVE *
      Math.sin(2 * Math.PI * EVADE_ALTITUDE_CYCLES * u + 0.6);
  return DECK_CLEAR_ALTITUDE + (wave - DECK_CLEAR_ALTITUDE) * inside;
}

function routeGeometry(kind: RangeHexacopterFlightKind): MotionRouteDefinition {
  if (kind === "evasive") {
    return evasiveGeometry();
  }
  // «Тур» — та же розетка вторым кругом: длиннее; «circuit» — один оборот.
  const laps = kind === "tour" ? 2 : 1;
  const STEP = (20 * Math.PI) / 180;
  const nodes: MotionRouteDefinition["nodes"][number][] = [
    { id: "pad", position: [0, 0, 0] },
    {
      // Отрыв: короткая полка вверх и разгонный створ в сторону розетки.
      id: "deck-clear",
      position: [CLIMB_DISTANCE, 0, 2],
      outgoing: [CLIMB_DISTANCE + 12, 0, 4],
    },
  ];
  const total = laps * 2 * Math.PI;
  let cursor = 0;
  for (let theta = 0; theta <= total + 1e-9; theta += STEP) {
    nodes.push(roseNode(`rose-${cursor}`, theta, STEP));
    cursor += 1;
  }
  const lastRoseId = `rose-${cursor - 1}`;
  nodes.push(
    {
      // Плечо выхода: с розетки на прямой створ, без шпильки у площадки.
      id: "arrival-shoulder",
      position: [-(FINAL_RUN + 22), 0, 5],
      incoming: [-(FINAL_RUN + 18), 0, 17],
      outgoing: [-(FINAL_RUN + 12), 0, -1],
      samples: 48,
    },
    {
      id: "final-entry",
      position: [-FINAL_RUN, 0, 0],
      incoming: [-(FINAL_RUN + 10), 0, 0],
      outgoing: [-FINAL_RUN * 0.4, 0, 0],
      samples: 40,
    },
    { id: "dock", position: [0, 0, 0] },
  );
  return {
    id: `range-hexacopter:${kind}`,
    nodes,
    measureAxes: [0, 2],
    markers: {
      verticalDepartureComplete: "deck-clear",
      departureComplete: "rose-0",
      roseComplete: lastRoseId,
      arriving: "arrival-shoulder",
      final: "final-entry",
    },
  };
}

/**
 * Радиус виража фактической линии: описанная окружность трёх точек на
 * широкой базе (4 м). Требование спрашивает геометрию маршрута, а не
 * фазовую модель — фазовой ошибки не существует по построению.
 */
function routeTurnRadius(
  geometry: MotionRouteArtifact,
  progress: number,
): number {
  const base = 4 / geometry.length;
  const p0 = geometry.point(clamp01(progress - base));
  const p1 = geometry.point(progress);
  const p2 = geometry.point(clamp01(progress + base));
  const ax = p1[0] - p0[0];
  const az = p1[2] - p0[2];
  const bx = p2[0] - p1[0];
  const bz = p2[2] - p1[2];
  const cx = p2[0] - p0[0];
  const cz = p2[2] - p0[2];
  const cross = Math.abs(ax * bz - az * bx);
  if (cross < 1e-6) {
    return Number.POSITIVE_INFINITY;
  }
  return (
    (Math.hypot(ax, az) * Math.hypot(bx, bz) * Math.hypot(cx, cz)) /
    (2 * cross)
  );
}

function altitude(
  geometry: MotionRouteArtifact,
  { distance, remaining, progress }: MotionRouteRequirementContext,
): number {
  if (distance < CLIMB_DISTANCE) {
    // Вогнутый профиль отрыва, как у города: высота — на первых метрах.
    const t = clamp01(distance / CLIMB_DISTANCE);
    return DECK_CLEAR_ALTITUDE * (1 - (1 - t) * (1 - t));
  }
  if (remaining < FINAL_DESCENT_DISTANCE) {
    const t = clamp01((remaining - 3) / (FINAL_DESCENT_DISTANCE - 3));
    return DECK_CLEAR_ALTITUDE * (1 - (1 - t) * (1 - t));
  }
  // Волна высоты по фактическому углу точки вокруг центра диска — гребни
  // ложатся на вершины лепестков без всякой фазовой модели. Волна включена
  // только МЕЖДУ маркерами розы (по путевой координате, с плавным плечом):
  // перелётные створы входа и выхода режут диск близко к центру, где atan2
  // крутит θ на полоборота за несколько метров, — там волне делать нечего.
  const roseStart = geometry.markerProgress("departureComplete");
  const roseEnd = geometry.markerProgress("roseComplete");
  const ramp = 18 / geometry.length;
  const onRose = Math.min(
    smootherStep((progress - roseStart) / ramp),
    smootherStep((roseEnd - progress) / ramp),
  );
  const point = geometry.point(progress);
  const theta = Math.atan2(point[2] - DISC_B, point[0] - DISC_A);
  const wave = roseAltitude(theta);
  return DECK_CLEAR_ALTITUDE + (wave - DECK_CLEAR_ALTITUDE) * onRose;
}

function speedLimit(
  geometry: MotionRouteArtifact,
  cruiseSpeed: number,
  { distance, remaining, progress }: MotionRouteRequirementContext,
): number {
  // Тот же честный тормозной профиль, что у города: 0.45 м/с² реверсом.
  const stopping = Math.sqrt(2 * 0.45 * Math.max(0, remaining));
  if (distance < CLIMB_DISTANCE * 0.5) {
    return Math.min(3.4, stopping);
  }
  // Авторская банда обязана быть ПОСИЛЬНОЙ (§13 матрицы: «speed limit не
  // требует невозможного ускорения») — И С ЗАПАСОМ НА ЗАХВАТ ДУГИ: вираж
  // считается на a = 3.5 м/с² из располагаемых g·tg 30° ≈ 5.66. Замер на
  // честном риге: банда впритык (4.5) даёт вход в лепесток на пределе и
  // вынос 19 м — контур с запаздыванием 0.8 с не успевает развить полное
  // боковое в момент захвата; остаток идёт на захват и высотную работу.
  // В горле лепестка (R ≈ 6 м) это ~4.6 м/с, на вершине (R ≈ 12) ~6.5;
  // круиз машина видит только на створах.
  const turn = Math.sqrt(3.5 * routeTurnRadius(geometry, progress));
  return Math.min(cruiseSpeed, Math.max(3, turn), stopping);
}

function buildRoute(kind: RangeHexacopterFlightKind): MotionRouteArtifact {
  const definition = routeGeometry(kind);
  const geometry = createMotionRoute(definition);
  const evasive = kind === "evasive";
  return createMotionRoute({
    ...definition,
    requirements: {
      altitude: (context) =>
        evasive ? evasiveAltitude(geometry, context) : altitude(geometry, context),
      // Полоса скорости считается из ГЕОМЕТРИИ тем же законом, что и у
      // розетки, поэтому серпантин сам себя и притормаживает там, где
      // затянул вираж. Отдельного числа для уклонения не заводится.
      speedLimit: (context) => speedLimit(geometry, evasive ? 11 : 9, context),
    },
  });
}

const ROUTES: Readonly<
  Record<RangeHexacopterFlightKind, MotionRouteArtifact>
> = {
  circuit: buildRoute("circuit"),
  tour: buildRoute("tour"),
  evasive: buildRoute("evasive"),
};

function placeLocal(
  berth: SceneVector3,
  local: SceneVector3,
  altitudeValue: number,
): SceneVector3 {
  return [
    berth[0] + HEXACOPTER_NOSE[0] * local[0] + LATERAL[0] * local[2],
    berth[1] + altitudeValue,
    berth[2] + HEXACOPTER_NOSE[2] * local[0] + LATERAL[2] * local[2],
  ];
}

function placeRoute(
  route: MotionRouteArtifact,
  berth: SceneVector3,
  finalFrom: number,
): VehicleRoutePlan {
  return {
    id: route.id,
    length: route.length,
    point(progress) {
      return placeLocal(
        berth,
        route.point(progress),
        route.requirement("altitude", progress),
      );
    },
    speedLimit(progress) {
      return route.requirement("speedLimit", progress);
    },
    altitude(progress) {
      return berth[1] + route.requirement("altitude", progress);
    },
    finalFrom,
  };
}

/**
 * ТРАССА ПО ИМЕНИ ВИДА — И ОТКАЗ, ЕСЛИ ИМЕНИ НЕТ.
 *
 * Раньше здесь стоял голый доступ в словарь, и неизвестный вид тихо давал
 * `undefined`. Тип от этого не спасает: вид приходит и снаружи типов —
 * из dev-хука отправки, из сохранённого состояния, из чужой карты. Живая проба
 * попросила у полигонной машины вид `lap`, которого у неё нет; отправка
 * ответила «взлетела», а падало уже в шаге физики, КАЖДЫЙ КАДР, и сцена
 * умирала без шанса на восстановление.
 *
 * Ошибка должна звучать там, где её можно понять, — на границе, где имя ещё
 * есть. Список доступных видов в сообщении: без него следующий человек будет
 * гадать так же, как гадал я.
 */
export function rangeHexacopterRoute(
  kind: RangeHexacopterFlightKind,
): MotionRouteArtifact {
  const route = ROUTES[kind];
  if (!route) {
    throw new Error(
      `у машины полигона нет трассы «${kind}»; есть: ${Object.keys(ROUTES).join(", ")}`,
    );
  }
  return route;
}

export function rangeHexacopterPlan(
  kind: RangeHexacopterFlightKind,
  berth: SceneVector3,
): VehicleRoutePlan {
  const route = rangeHexacopterRoute(kind);
  const placed = placeRoute(route, berth, route.markerProgress("final"));
  const departureComplete = route.markerProgress("departureComplete");
  return {
    ...placed,
    verticalDeparture: {
      altitude: berth[1] + DECK_CLEAR_ALTITUDE,
      until: route.markerProgress("verticalDepartureComplete"),
      tolerance: 0.8,
    },
    verticalArrival: {
      altitude: berth[1] + DECK_CLEAR_ALTITUDE,
      from: route.markerProgress("final"),
      horizontalTolerance: 0.9,
    },
    // Упреждение — от фактического радиуса виража линии: догонная точка на
    // хорде срезает дугу на ~L²/8R, поэтому L = √(8·R·ε) держит срез в
    // пределах ε ≈ 1.2 м и в горле лепестка (R ≈ 6 м → L ≈ 8), и на
    // створах (прямая → верхний предел 27 м, круизные три секунды).
    // Радиус берётся ХУДШИЙ в окне будущего упреждения, а не в текущей
    // точке: упреждение, посчитанное по ещё-широкой дуге на ПОДХОДЕ к горлу,
    // целит за горло и срезает его (замер: снос 19 м на входе в лепесток).
    guidanceLookahead(progress) {
      if (progress < departureComplete * 0.5) {
        return 12;
      }
      if (progress < departureComplete) {
        return 20;
      }
      let turnRadius = Number.POSITIVE_INFINITY;
      for (let ahead = 0; ahead <= 27; ahead += 9) {
        turnRadius = Math.min(
          turnRadius,
          routeTurnRadius(
            route,
            Math.min(0.999, progress + ahead / route.length),
          ),
        );
      }
      if (!Number.isFinite(turnRadius)) {
        return 27;
      }
      return Math.min(27, Math.max(8, Math.sqrt(8 * turnRadius * 1.2)));
    },
  };
}

/** Возврат из-за границы обслуживания: прямой заход с востока на створ. */
const ARRIVAL_GEOMETRY: MotionRouteDefinition = {
  id: "range-hexacopter:arrival",
  nodes: [
    {
      id: "remote-entry",
      position: [-90, 0, 50],
      outgoing: [-75, 0, 35],
    },
    {
      id: "arrival-shoulder",
      position: [-(FINAL_RUN + 22), 0, 5],
      incoming: [-(FINAL_RUN + 34), 0, 18],
      outgoing: [-(FINAL_RUN + 12), 0, -1],
      samples: 56,
    },
    {
      id: "final-entry",
      position: [-FINAL_RUN, 0, 0],
      incoming: [-(FINAL_RUN + 10), 0, 0],
      outgoing: [-FINAL_RUN * 0.4, 0, 0],
      samples: 40,
    },
    { id: "dock", position: [0, 0, 0] },
  ],
  measureAxes: [0, 2],
  markers: {
    arrivalCapture: "remote-entry",
    arriving: "arrival-shoulder",
    final: "final-entry",
  },
};

const ARRIVAL = (() => {
  const geometry = createMotionRoute(ARRIVAL_GEOMETRY);
  return createMotionRoute({
    ...ARRIVAL_GEOMETRY,
    requirements: {
      altitude: ({ remaining }) =>
        remaining < FINAL_DESCENT_DISTANCE
          ? DECK_CLEAR_ALTITUDE *
            smootherStep(remaining / FINAL_DESCENT_DISTANCE)
          : DECK_CLEAR_ALTITUDE +
            10 * smootherStep((remaining - FINAL_DESCENT_DISTANCE) / 80),
      speedLimit: (context) =>
        speedLimit(geometry, 10, {
          ...context,
          distance: CLIMB_DISTANCE * 2,
        }),
    },
  });
})();

export function rangeHexacopterArrivalPlan(
  berth: SceneVector3,
): VehicleRoutePlan {
  return placeRoute(ARRIVAL, berth, ARRIVAL.markerProgress("final"));
}

export function rangeHexacopterRoutePhase(
  kind: RangeHexacopterFlightKind,
  progress: number,
): MotionRoutePhase {
  return motionRoutePhase(
    rangeHexacopterRoute(kind),
    progress,
    "departureComplete",
    "arriving",
  );
}

/** Площадка полигона в мировых координатах — берт всех планов машины. */
export const RANGE_HEXACOPTER_BERTH: SceneVector3 = [
  RANGE_HEXACOPTER_PAD_X,
  RANGE_DECK_TOP_Y,
  RANGE_HEXACOPTER_PAD_Z,
];
