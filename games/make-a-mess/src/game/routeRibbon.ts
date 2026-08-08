import type { VehicleRoutePlan } from "./skyTrainRoutes.ts";

/**
 * ТРАССА АВТОНОМНОГО РЕЙСА В МИРЕ — приборная векторная разметка, а не
 * particle trail: непрерывная холодная нить без геометрического свечения.
 * Все толщины задаёт рендер в экранных пикселях, поэтому маршрут не превращается
 * в ленту или цепочку капсул при приближении камеры.
 *
 * Модуль чистый: ни three, ни случайности. Компонент рендера потребляет числа.
 */

export type RouteVector3 = readonly [number, number, number];

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/**
 * Цвет ядра кодирует высоту: бирюзовый у нижней точки полётного задания
 * переходит в сине-голубой у верхней, не доходя до bloom-порога.
 */
export function routeAltitudeColor(
  altitude: number,
  low: number,
  high: number,
): readonly [number, number, number] {
  const t = clamp01((altitude - low) / Math.max(1e-6, high - low));
  const eased = t * t * (3 - 2 * t);
  return [0.05 + 0.03 * eased, 0.68 - 0.28 * eased, 0.52 + 0.3 * eased];
}

/** Фактический путь отделён от плана тёплым amber. */
export const ROUTE_ACTUAL_COLOR: readonly [number, number, number] = [
  0.95, 0.34, 0.035,
];

/**
 * Опорная плоскость и её проекции — холодный тёмно-бирюзовый, тише нити.
 * ТЁМНЫЙ, а не бледный: подложка чаще всего лежит на светлом небе, и светлая
 * полупрозрачная линия там просто исчезает. Тёмная читается и на небе, и на
 * городе (проверено кадром r-mid: прежние 0.12/0.30/0.34 смывались в фон).
 */
export const ROUTE_GROUND_COLOR: readonly [number, number, number] = [
  0.05, 0.15, 0.18,
];

/**
 * Затухание следа по возрасту: 0 — самый старый удержанный конец, 1 — свежий.
 * Закон живёт здесь, а не в шейдере: его читают и тест, и рендер.
 */
export function routeTrailAlpha(age: number): number {
  return 0.14 + 0.76 * clamp01(age) ** 1.4;
}

export function routeAltitudeRange(
  plan: VehicleRoutePlan,
  samples = 160,
): readonly [number, number] {
  let low = Number.POSITIVE_INFINITY;
  let high = Number.NEGATIVE_INFINITY;
  for (let index = 0; index <= samples; index += 1) {
    const y = plan.point(index / samples)[1];
    low = Math.min(low, y);
    high = Math.max(high, y);
  }
  return Number.isFinite(low) && Number.isFinite(high) ? [low, high] : [0, 1];
}

export interface RouteLineGeometry {
  readonly positions: Float32Array;
  readonly colors: Float32Array;
}

/**
 * Полная плановая нить: плотная выборка кривой, без геометрии прогресса.
 */
export function routePlanLineGeometry(
  plan: VehicleRoutePlan,
  sections = 720,
): RouteLineGeometry {
  if (plan.length <= 1) {
    return { positions: new Float32Array(), colors: new Float32Array() };
  }
  const count = Math.max(160, Math.round(sections));
  const range = routeAltitudeRange(plan, count);
  const positions = new Float32Array((count + 1) * 3);
  const colors = new Float32Array((count + 1) * 4);
  for (let index = 0; index <= count; index += 1) {
    const progress = index / count;
    const point = plan.point(progress);
    const color = routeAltitudeColor(point[1], range[0], range[1]);
    positions.set(point, index * 3);
    colors.set([color[0], color[1], color[2], 1], index * 4);
  }
  return { positions, colors };
}

/**
 * Фактический след: непрерывная amber-полилиния. Старый участок тускнеет,
 * но остаётся видимым; свежий доходит точно до центра масс машины.
 */
export function routeActualTrailGeometry(
  samples: readonly RouteVector3[],
): RouteLineGeometry {
  if (samples.length < 2) {
    return { positions: new Float32Array(), colors: new Float32Array() };
  }
  const last = samples.length - 1;
  const positions = new Float32Array(samples.length * 3);
  const colors = new Float32Array(samples.length * 4);
  for (let index = 0; index < samples.length; index += 1) {
    const alpha = routeTrailAlpha(index / last);
    positions.set(samples[index], index * 3);
    colors.set(
      [
        ROUTE_ACTUAL_COLOR[0],
        ROUTE_ACTUAL_COLOR[1],
        ROUTE_ACTUAL_COLOR[2],
        alpha,
      ],
      index * 4,
    );
  }
  return { positions, colors };
}

/**
 * ДАТУМ — ОДНА ПЛОСКОСТЬ ОТСЧЁТА НА ВСЁ ЗАДАНИЕ, а не рельеф под машиной.
 *
 * Высоту нельзя прочитать с оттенка: из синевы не следует «сорок метров».
 * Её читают длиной отвеса рядом с известным предметом — но длины сравнимы
 * между собой, только пока висят от общей плоскости. Земля, с которой машина
 * ушла, и есть низшая точка задания (маршрут начинается наземной точкой у
 * берта — контракт `VehicleRoutePlan`).
 */
export function routeGroundDatum(plan: VehicleRoutePlan, samples = 240): number {
  return routeAltitudeRange(plan, samples)[0];
}

/**
 * Наземный след — проекция задания на датум. Привязывает висящую в воздухе
 * нить к земле и к тому, что на ней стоит: линия перестаёт плавать.
 * Возвращает ПОЛИЛИНИЮ (strip).
 */
export function routeGroundTrackGeometry(
  plan: VehicleRoutePlan,
  datum: number,
  sections = 480,
): RouteLineGeometry {
  if (plan.length <= 1) {
    return { positions: new Float32Array(), colors: new Float32Array() };
  }
  const count = Math.max(120, Math.round(sections));
  const positions = new Float32Array((count + 1) * 3);
  const colors = new Float32Array((count + 1) * 4);
  for (let index = 0; index <= count; index += 1) {
    const point = plan.point(index / count);
    positions.set([point[0], datum, point[2]], index * 3);
    colors.set([...ROUTE_GROUND_COLOR, 0.8], index * 4);
  }
  return { positions, colors };
}

/**
 * Отвесы — частокол вертикальных волосков от задания до датума. Дают высоту
 * как ДЛИНУ, а заодно второй раз дают дальность: перспективное сгущение
 * частокола — градиент плотности, подсказка глубины много сильнее оттенка.
 * Шаг по ДЛИНЕ ДУГИ, иначе на медленном участке отвесы слипаются.
 * Возвращает ПАРЫ вершин (segments).
 */
export function routeDropLineGeometry(
  plan: VehicleRoutePlan,
  datum: number,
  spacingMetres = 12,
  maxDrops = 320,
): RouteLineGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  if (plan.length <= 1) {
    return {
      positions: new Float32Array(),
      colors: new Float32Array(),
    };
  }
  const spacing = Math.max(spacingMetres, plan.length / maxDrops);
  const [low, high] = routeAltitudeRange(plan);
  const samples = Math.max(240, Math.min(1600, Math.ceil(plan.length / 0.75)));
  let previous = plan.point(0);
  let travelled = 0;
  let nextDrop = spacing;
  for (let index = 1; index <= samples; index += 1) {
    const point = plan.point(index / samples);
    travelled += Math.hypot(
      point[0] - previous[0],
      point[1] - previous[1],
      point[2] - previous[2],
    );
    previous = point;
    if (travelled < nextDrop) continue;
    nextDrop += spacing;
    const top = routeAltitudeColor(point[1], low, high);
    appendLine(
      positions,
      colors,
      point as RouteVector3,
      [point[0], datum, point[2]],
      [top[0] * 0.72, top[1] * 0.72, top[2] * 0.72],
      0.62,
      ROUTE_GROUND_COLOR,
      0.16,
    );
  }
  return {
    positions: new Float32Array(positions),
    colors: new Float32Array(colors),
  };
}

/**
 * Живой отвес машины и её тень на датуме — «я вот настолько выше земли».
 * Один сегмент и кольцо вместо частокола: у машины высота нужна точная,
 * а не выборочная. Возвращает ПАРЫ вершин (segments).
 */
export function routeCraftPlumbGeometry(
  centre: RouteVector3,
  datum: number,
  shadowRadius = 1.1,
): RouteLineGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const foot: RouteVector3 = [centre[0], datum, centre[2]];
  appendLine(
    positions,
    colors,
    centre,
    foot,
    ROUTE_ACTUAL_COLOR,
    0.6,
    ROUTE_GROUND_COLOR,
    0.22,
  );
  const segments = 20;
  for (let index = 0; index < segments; index += 1) {
    const a = (index / segments) * Math.PI * 2;
    const b = ((index + 1) / segments) * Math.PI * 2;
    appendLine(
      positions,
      colors,
      [
        foot[0] + Math.cos(a) * shadowRadius,
        datum,
        foot[2] + Math.sin(a) * shadowRadius,
      ],
      [
        foot[0] + Math.cos(b) * shadowRadius,
        datum,
        foot[2] + Math.sin(b) * shadowRadius,
      ],
      ROUTE_ACTUAL_COLOR,
      0.42,
    );
  }
  return {
    positions: new Float32Array(positions),
    colors: new Float32Array(colors),
  };
}

/**
 * РАСПИСАНИЕ ЗАДАНИЯ: секунда, к которой машина обязана оказаться в точке,
 * если идёт по разрешённой скорости. Скорость нельзя прочитать с линии, но
 * можно прочитать с РИТМА — а ритм растёт только из расписания.
 */
export interface RouteSchedule {
  readonly points: readonly RouteVector3[];
  /** Секунды от начала задания в каждой точке. */
  readonly times: readonly number[];
  readonly seconds: number;
}

export function routePlannedSchedule(
  plan: VehicleRoutePlan,
  samples = 720,
): RouteSchedule {
  const count = Math.max(120, Math.round(samples));
  const points: RouteVector3[] = [];
  const speeds: number[] = [];
  let ceiling = 0;
  for (let index = 0; index <= count; index += 1) {
    const progress = index / count;
    points.push(plan.point(progress) as RouteVector3);
    const speed = Math.abs(plan.speedLimit(progress));
    speeds.push(speed);
    ceiling = Math.max(ceiling, speed);
  }
  // Пол скорости: у берта разрешённая скорость честно падает в ноль, и
  // деление уводит расписание в бесконечность. 8% потолка — шаг, на котором
  // подход читается СГУЩЕНИЕМ засечек, а не разрывом.
  const floor = Math.max(0.5, ceiling * 0.08);
  const times: number[] = [0];
  for (let index = 1; index <= count; index += 1) {
    const previous = points[index - 1];
    const point = points[index];
    const step = Math.hypot(
      point[0] - previous[0],
      point[1] - previous[1],
      point[2] - previous[2],
    );
    const speed = Math.max(floor, (speeds[index - 1] + speeds[index]) * 0.5);
    times.push(times[index - 1] + step / speed);
  }
  return { points, times, seconds: times[count] };
}

const ROUTE_TICK_LADDER = [
  0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300,
] as const;

/**
 * Шаг засечек выбирается лестницей 1–2–5 от полного времени задания, а не
 * назначается: иначе долгий рейс тонет в частоколе, а короткий остаётся без
 * ритма. Один и тот же шаг обязаны получить план и факт — сравнивают решётки.
 */
export function routeTickInterval(seconds: number, budget = 200): number {
  for (const step of ROUTE_TICK_LADDER) {
    if (seconds / step <= budget) return step;
  }
  return ROUTE_TICK_LADDER[ROUTE_TICK_LADDER.length - 1];
}

export interface RouteTickTiers {
  readonly majorEvery: number;
  readonly heavyEvery: number;
}

export const ROUTE_TICK_TIERS: RouteTickTiers = {
  majorEvery: 4,
  heavyEvery: 20,
};

/**
 * Длина шпалы — не константа, а доля масштаба задания. Полметра читается на
 * стометровом облёте и пропадает на километровом обходе города: шпала обязана
 * расти вместе с тем, что размечает. Один и тот же масштаб получают план и
 * факт, иначе решётки нельзя приложить друг к другу.
 */
export function routeTickScale(length: number): number {
  return Math.max(0.7, Math.min(4, length / 260));
}

function tickTier(order: number, tiers: RouteTickTiers, scale: number) {
  if (tiers.heavyEvery > 0 && order % tiers.heavyEvery === 0) {
    return { half: 1.7 * scale, weight: 0.95, cross: true };
  }
  if (tiers.majorEvery > 0 && order % tiers.majorEvery === 0) {
    return { half: 1.0 * scale, weight: 0.7, cross: false };
  }
  return { half: 0.45 * scale, weight: 0.42, cross: false };
}

/**
 * Шпалы через равные СЕКУНДЫ. Расстояние между ними и есть скорость: густо —
 * медленно, растянуто — быстро; меняющийся шаг — ускорение. Легенда не нужна,
 * читается на стоп-кадре и на любом удалении — это стробофотография.
 */
function appendTimeRungs(
  positions: number[],
  colors: number[],
  points: readonly RouteVector3[],
  times: readonly number[],
  interval: number,
  tiers: RouteTickTiers,
  scale: number,
  shade: (
    point: RouteVector3,
    fraction: number,
    weight: number,
  ) => readonly [number, number, number, number],
) {
  if (points.length < 2 || !(interval > 0)) return;
  const first = times[0];
  const span = Math.max(1e-6, times[times.length - 1] - first);
  for (let index = 1; index < points.length; index += 1) {
    const from = times[index - 1];
    const to = times[index];
    if (!(to > from)) continue;
    const start = Math.floor(from / interval) + 1;
    const end = Math.floor(to / interval);
    for (let order = start; order <= end; order += 1) {
      if (order <= 0) continue;
      const at = order * interval;
      const t = (at - from) / (to - from);
      const back = points[index - 1];
      const ahead = points[index];
      const centre: RouteVector3 = [
        back[0] + (ahead[0] - back[0]) * t,
        back[1] + (ahead[1] - back[1]) * t,
        back[2] + (ahead[2] - back[2]) * t,
      ];
      const tangent = normalize([
        ahead[0] - back[0],
        ahead[1] - back[1],
        ahead[2] - back[2],
      ]);
      let side = cross(tangent, [0, 1, 0]);
      if (Math.hypot(side[0], side[1], side[2]) < 1e-3) {
        side = cross(tangent, [0, 0, 1]);
      }
      side = normalize(side);
      const tier = tickTier(order, tiers, scale);
      const shaded = shade(
        centre,
        clamp01((at - first) / span),
        tier.weight,
      );
      const tint = [shaded[0], shaded[1], shaded[2]] as const;
      appendLine(
        positions,
        colors,
        addScaled(centre, side, -tier.half),
        addScaled(centre, side, tier.half),
        tint,
        shaded[3],
      );
      if (tier.cross) {
        const up = normalize(cross(side, tangent));
        appendLine(
          positions,
          colors,
          addScaled(centre, up, -tier.half * 0.55),
          addScaled(centre, up, tier.half * 0.55),
          tint,
          shaded[3],
        );
      }
    }
  }
}

/**
 * Засечки плана — по ПЛАНОВОМУ времени. Возвращает ПАРЫ вершин (segments).
 */
export function routePlannedTickGeometry(
  plan: VehicleRoutePlan,
  interval: number,
  schedule: RouteSchedule = routePlannedSchedule(plan),
  tiers: RouteTickTiers = ROUTE_TICK_TIERS,
  scale: number = routeTickScale(plan.length),
): RouteLineGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const [low, high] = routeAltitudeRange(plan);
  appendTimeRungs(
    positions,
    colors,
    schedule.points,
    schedule.times,
    interval,
    tiers,
    scale,
    (point, _fraction, weight) => {
      const color = routeAltitudeColor(point[1], low, high);
      return [color[0], color[1], color[2], weight];
    },
  );
  return {
    positions: new Float32Array(positions),
    colors: new Float32Array(colors),
  };
}

/**
 * Засечки факта — по РЕАЛЬНОМУ времени, тем же шагом, что и у плана. Там, где
 * решётка факта растянулась против плановой, машина обогнала расписание; где
 * сгустилась — отстала. Возвращает ПАРЫ вершин (segments).
 */
export function routeTrailTickGeometry(
  points: readonly RouteVector3[],
  times: readonly number[],
  interval: number,
  tiers: RouteTickTiers = ROUTE_TICK_TIERS,
  scale = 1,
): RouteLineGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  appendTimeRungs(
    positions,
    colors,
    points,
    times,
    interval,
    tiers,
    scale,
    (_point, fraction, weight) => [
      ROUTE_ACTUAL_COLOR[0],
      ROUTE_ACTUAL_COLOR[1],
      ROUTE_ACTUAL_COLOR[2],
      weight * routeTrailAlpha(fraction),
    ],
  );
  return {
    positions: new Float32Array(positions),
    colors: new Float32Array(colors),
  };
}

export type RouteSemanticMarkerKind = "gate" | "altitudePeak" | "altitudeTrough";

export interface RouteSemanticMarker {
  readonly progress: number;
  readonly kind: RouteSemanticMarkerKind;
}

/**
 * Смысловые точки выводятся из контракта маршрута, а не из его управляющих
 * узлов. Gate — смена режима, peak/trough — выраженный экстремум высоты.
 */
export function routeSemanticMarkers(
  plan: VehicleRoutePlan,
  samples = 720,
): readonly RouteSemanticMarker[] {
  const count = Math.max(240, Math.round(samples));
  const gates: number[] = [];
  const addGate = (progress: number | undefined) => {
    if (
      progress !== undefined &&
      Number.isFinite(progress) &&
      progress > 0.005 &&
      progress < 0.995
    ) {
      gates.push(progress);
    }
  };
  addGate(plan.verticalDeparture?.until);
  addGate(plan.verticalArrival?.from);
  addGate(plan.finalFrom);

  let previousSpeed = plan.speedLimit(0);
  let previousCorridor = plan.corridor?.(0);
  for (let index = 1; index <= count; index += 1) {
    const progress = index / count;
    const speed = plan.speedLimit(progress);
    const speedThreshold = Math.max(
      1.5,
      Math.max(Math.abs(previousSpeed), Math.abs(speed)) * 0.08,
    );
    if (Math.abs(speed - previousSpeed) >= speedThreshold) {
      addGate((index - 0.5) / count);
    }
    previousSpeed = speed;

    if (plan.corridor) {
      const corridor = plan.corridor(progress);
      if (previousCorridor !== undefined) {
        const corridorThreshold = Math.max(
          0.75,
          Math.max(Math.abs(previousCorridor), Math.abs(corridor)) * 0.15,
        );
        if (Math.abs(corridor - previousCorridor) >= corridorThreshold) {
          addGate((index - 0.5) / count);
        }
      }
      previousCorridor = corridor;
    }
  }

  const mergeProgress = Math.max(0.006, Math.min(0.025, 12 / plan.length));
  gates.sort((a, b) => a - b);
  const mergedGates: number[] = [];
  for (const progress of gates) {
    const previous = mergedGates.at(-1);
    if (previous === undefined || progress - previous > mergeProgress) {
      mergedGates.push(progress);
    } else {
      mergedGates[mergedGates.length - 1] = (previous + progress) * 0.5;
    }
  }

  const altitudes = Array.from(
    { length: count + 1 },
    (_, index) => plan.altitude(index / count),
  );
  const extrema: RouteSemanticMarker[] = [];
  const prominenceWindow = Math.max(
    10,
    Math.min(Math.floor(count / 6), Math.ceil((36 / plan.length) * count)),
  );
  let previousSlope = 0;
  for (let index = 1; index <= count; index += 1) {
    const delta = altitudes[index] - altitudes[index - 1];
    if (Math.abs(delta) < 1e-4) continue;
    const slope = Math.sign(delta);
    if (previousSlope !== 0 && slope !== previousSlope) {
      const candidateIndex = index - 1;
      const from = Math.max(0, candidateIndex - prominenceWindow);
      const to = Math.min(count, candidateIndex + prominenceWindow);
      const value = altitudes[candidateIndex];
      const left = altitudes.slice(from, candidateIndex);
      const right = altitudes.slice(candidateIndex + 1, to + 1);
      const prominence =
        previousSlope > 0
          ? Math.min(
              value - Math.min(...left),
              value - Math.min(...right),
            )
          : Math.min(
              Math.max(...left) - value,
              Math.max(...right) - value,
            );
      const progress = candidateIndex / count;
      if (
        prominence >= 1.75 &&
        !mergedGates.some((gate) => Math.abs(gate - progress) <= mergeProgress)
      ) {
        const marker: RouteSemanticMarker = {
          progress,
          kind: previousSlope > 0 ? "altitudePeak" : "altitudeTrough",
        };
        const previous = extrema.at(-1);
        if (
          !previous ||
          progress - previous.progress >= Math.max(0.012, 8 / plan.length)
        ) {
          extrema.push(marker);
        }
      }
    }
    previousSlope = slope;
  }

  return [
    ...mergedGates.map(
      (progress): RouteSemanticMarker => ({ progress, kind: "gate" }),
    ),
    ...extrema,
  ].sort((a, b) => a.progress - b.progress);
}

function cross(a: RouteVector3, b: RouteVector3): RouteVector3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function routeMarkerFrame(
  plan: VehicleRoutePlan,
  progress: number,
): {
  readonly centre: RouteVector3;
  readonly u: RouteVector3;
  readonly v: RouteVector3;
} {
  const step = Math.min(0.01, 1.5 / Math.max(1, plan.length));
  const before = plan.point(Math.max(0, progress - step));
  const after = plan.point(Math.min(1, progress + step));
  const tangent = normalize([
    after[0] - before[0],
    after[1] - before[1],
    after[2] - before[2],
  ]);
  const reference: RouteVector3 =
    Math.abs(tangent[1]) < 0.88 ? [0, 1, 0] : [1, 0, 0];
  const u = normalize(cross(tangent, reference));
  return {
    centre: plan.point(progress),
    u,
    v: normalize(cross(tangent, u)),
  };
}

function framePoint(
  centre: RouteVector3,
  u: RouteVector3,
  v: RouteVector3,
  radius: number,
  angle: number,
): RouteVector3 {
  return [
    centre[0] + (u[0] * Math.cos(angle) + v[0] * Math.sin(angle)) * radius,
    centre[1] + (u[1] * Math.cos(angle) + v[1] * Math.sin(angle)) * radius,
    centre[2] + (u[2] * Math.cos(angle) + v[2] * Math.sin(angle)) * radius,
  ];
}

export function routeGateGeometry(
  plan: VehicleRoutePlan,
  markers = routeSemanticMarkers(plan),
): RouteLineGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const cyan: readonly [number, number, number] = [0.12, 0.72, 0.82];
  const segments = 28;
  for (const marker of markers) {
    if (marker.kind !== "gate") continue;
    const { centre, u, v } = routeMarkerFrame(plan, marker.progress);
    for (let index = 0; index < segments; index += 1) {
      appendLine(
        positions,
        colors,
        framePoint(centre, u, v, 1.35, (index / segments) * Math.PI * 2),
        framePoint(
          centre,
          u,
          v,
          1.35,
          ((index + 1) / segments) * Math.PI * 2,
        ),
        cyan,
        0.72,
      );
    }
  }
  return {
    positions: new Float32Array(positions),
    colors: new Float32Array(colors),
  };
}

export interface RouteDiscGeometry {
  readonly positions: Float32Array;
  readonly indices: Uint16Array;
}

export function routeAltitudeDiscGeometry(
  plan: VehicleRoutePlan,
  markers = routeSemanticMarkers(plan),
): RouteDiscGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const segments = 12;
  const appendDisc = (
    centre: RouteVector3,
    u: RouteVector3,
    v: RouteVector3,
    radius: number,
  ) => {
    const centreIndex = positions.length / 3;
    positions.push(...centre);
    for (let index = 0; index < segments; index += 1) {
      positions.push(
        ...framePoint(
          centre,
          u,
          v,
          radius,
          (index / segments) * Math.PI * 2,
        ),
      );
    }
    for (let index = 0; index < segments; index += 1) {
      indices.push(
        centreIndex,
        centreIndex + 1 + index,
        centreIndex + 1 + ((index + 1) % segments),
      );
    }
  };
  for (const marker of markers) {
    if (marker.kind === "gate") continue;
    const { centre, u, v } = routeMarkerFrame(plan, marker.progress);
    appendDisc(centre, u, v, 0.09);
    appendDisc(centre, u, v, 0.04);
  }
  return {
    positions: new Float32Array(positions),
    indices: new Uint16Array(indices),
  };
}

function normalize(value: RouteVector3): RouteVector3 {
  const length = Math.hypot(value[0], value[1], value[2]);
  return length > 1e-7
    ? [value[0] / length, value[1] / length, value[2] / length]
    : [0, 0, -1];
}

function addScaled(
  origin: RouteVector3,
  direction: RouteVector3,
  scale: number,
): RouteVector3 {
  return [
    origin[0] + direction[0] * scale,
    origin[1] + direction[1] * scale,
    origin[2] + direction[2] * scale,
  ];
}

function appendLine(
  positions: number[],
  colors: number[],
  from: RouteVector3,
  to: RouteVector3,
  fromColor: readonly [number, number, number],
  fromAlpha: number,
  toColor = fromColor,
  toAlpha = fromAlpha,
) {
  positions.push(...from, ...to);
  colors.push(...fromColor, fromAlpha, ...toColor, toAlpha);
}

export interface RouteCraftContourInput {
  readonly centre: RouteVector3;
  /** Куда смотрит нос машины. */
  readonly heading: RouteVector3;
  /** Куда машина фактически движется. */
  readonly course?: RouteVector3;
  /** Касательная заложенного маршрута. */
  readonly route?: RouteVector3;
  readonly up: RouteVector3;
  readonly engines: readonly {
    readonly position: RouteVector3;
    readonly intensity: number;
  }[];
}

/**
 * Приборный круг эскиза у машины: двойной обод-транспортир с рисками по
 * окружности, три вектора (нос, фактическое движение, маршрут) и тяги.
 * Радиус выводится из разлёта моторов — круг всегда шире машины.
 */
export function routeCraftContourGeometry(
  input: RouteCraftContourInput,
): RouteLineGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const cyan: readonly [number, number, number] = [0.25, 0.85, 1];
  const pale: readonly [number, number, number] = [0.65, 0.97, 1];
  const blue: readonly [number, number, number] = [0.12, 0.48, 0.95];
  const amber: readonly [number, number, number] = ROUTE_ACTUAL_COLOR;
  let spread = 0;
  for (const engine of input.engines) {
    spread = Math.max(
      spread,
      Math.hypot(
        engine.position[0] - input.centre[0],
        engine.position[2] - input.centre[2],
      ),
    );
  }
  const radius = Math.max(2.8, spread * 1.5);
  const ringSegments = 48;
  const ring = (ringRadius: number, alpha: number, gapRhythm: number) => {
    for (let index = 0; index < ringSegments; index += 1) {
      if (index % gapRhythm >= gapRhythm - 2) continue;
      const a = (index / ringSegments) * Math.PI * 2;
      const b = ((index + 1) / ringSegments) * Math.PI * 2;
      appendLine(
        positions,
        colors,
        [
          input.centre[0] + Math.cos(a) * ringRadius,
          input.centre[1],
          input.centre[2] + Math.sin(a) * ringRadius,
        ],
        [
          input.centre[0] + Math.cos(b) * ringRadius,
          input.centre[1],
          input.centre[2] + Math.sin(b) * ringRadius,
        ],
        cyan,
        alpha,
      );
    }
  };
  ring(radius, 0.45, 12);
  ring(radius * 0.74, 0.28, 8);

  const tickCount = 36;
  for (let index = 0; index < tickCount; index += 1) {
    const cardinal = index % 9 === 0;
    const angle = (index / tickCount) * Math.PI * 2;
    const dx = Math.cos(angle);
    const dz = Math.sin(angle);
    const inner = radius;
    const outer = radius * (cardinal ? 1.16 : 1.07);
    appendLine(
      positions,
      colors,
      [
        input.centre[0] + dx * inner,
        input.centre[1],
        input.centre[2] + dz * inner,
      ],
      [
        input.centre[0] + dx * outer,
        input.centre[1],
        input.centre[2] + dz * outer,
      ],
      pale,
      cardinal ? 0.85 : 0.5,
    );
  }

  const arrow = (
    direction: RouteVector3,
    length: number,
    inset: number,
    color: readonly [number, number, number],
    alpha: number,
  ) => {
    const vector = normalize(direction);
    const tip = addScaled(input.centre, vector, length);
    const start = addScaled(input.centre, vector, inset);
    const horizontalSide = normalize([-vector[2], 0, vector[0]]);
    appendLine(positions, colors, start, tip, color, alpha);
    appendLine(
      positions,
      colors,
      tip,
      addScaled(addScaled(tip, vector, -0.42), horizontalSide, 0.18),
      color,
      alpha,
    );
    appendLine(
      positions,
      colors,
      tip,
      addScaled(addScaled(tip, vector, -0.42), horizontalSide, -0.18),
      color,
      alpha,
    );
  };

  arrow(input.heading, radius * 1.2, 0, pale, 0.95);

  if (input.course && Math.hypot(...input.course) > 0.35) {
    arrow(input.course, radius, 0.55, amber, 0.82);
  }
  if (input.route && Math.hypot(...input.route) > 1e-4) {
    arrow(input.route, radius * 1.08, 0.35, blue, 0.78);
  }

  const up = normalize(input.up);
  for (const engine of input.engines) {
    const intensity = clamp01(engine.intensity);
    appendLine(
      positions,
      colors,
      engine.position,
      addScaled(engine.position, up, 0.24 + intensity * 1.5),
      cyan,
      0.25 + intensity * 0.55,
    );
  }
  return {
    positions: new Float32Array(positions),
    colors: new Float32Array(colors),
  };
}
