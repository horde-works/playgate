import type { VehicleRoutePlan } from "./skyTrainRoutes.ts";

/**
 * ТРАССА АВТОНОМНОГО РЕЙСА В МИРЕ: туманный луч со светлячками.
 *
 * Не отладчик, а кино: сглаженная кривая ВСЕГО маршрута от взлёта до посадки,
 * цвет и яркость меняются с высотой, а вдоль луча рыскают светлячки — рой
 * огоньков, бегущий по трассе с собственным блужданием и мерцанием. Ни
 * прогресса, ни разрешённого заноса здесь нет: коридор — дело контура
 * управления, глазам он не нужен.
 *
 * Модуль чистый и детерминированный: ни three, ни случайности — светлячки
 * сеются номером, и тот же номер даёт тот же рой. Компонент рендера потребляет
 * готовые числа.
 */

/**
 * Цвет по высоте — в МАРШРУТНОЙ гамме из кино: электрическая синева у земли,
 * яркая бирюза наверху. Тёплый янтарь пробовался и не сел: трасса читалась
 * не как навигация, а как гирлянда.
 */
export function routeAltitudeColor(
  altitude: number,
  low: number,
  high: number,
): readonly [number, number, number] {
  const span = Math.max(1e-6, high - low);
  const raw = (altitude - low) / span;
  const t = Math.max(0, Math.min(1, raw));
  const eased = t * t * (3 - 2 * t);
  // Электрическая синева (0.16, 0.45, 1.0) -> бирюза (0.5, 0.97, 1.0).
  return [
    0.16 + (0.5 - 0.16) * eased,
    0.45 + (0.97 - 0.45) * eased,
    1.0,
  ];
}

export interface RouteGlowSection {
  readonly centre: readonly [number, number, number];
  /** Единичный горизонтальный поперечник кривой. */
  readonly across: readonly [number, number];
  readonly color: readonly [number, number, number];
  /** 0…1: яркость луча, растёт с высотой и гаснет к самым концам. */
  readonly glow: number;
}

/**
 * Сечения ПОЛНОЙ кривой маршрута. Прогресс машины сюда не входит: трасса
 * показана целиком, как маршрут в навигаторе, а не как хвост за самолётом.
 */
export function routeGlowSections(
  plan: VehicleRoutePlan,
  sections = 96,
): RouteGlowSection[] {
  if (plan.length <= 1) {
    return [];
  }
  const count = Math.max(8, sections);
  const altitudes: number[] = [];
  for (let index = 0; index <= count; index += 1) {
    altitudes.push(plan.point(index / count)[1]);
  }
  const low = Math.min(...altitudes);
  const high = Math.max(...altitudes);
  const result: RouteGlowSection[] = [];
  const step = 1 / count;
  for (let index = 0; index <= count; index += 1) {
    const at = index / count;
    const centre = plan.point(at);
    const before = plan.point(Math.max(0, at - step));
    const after = plan.point(Math.min(1, at + step));
    const dx = after[0] - before[0];
    const dz = after[2] - before[2];
    const length = Math.hypot(dx, dz);
    if (length < 1e-6) {
      continue;
    }
    const heightBlend = (centre[1] - low) / Math.max(1e-6, high - low);
    // Концы чуть притушены: луч рождается у площадки, а не бьёт из неё.
    const edge = Math.min(1, Math.min(at, 1 - at) / 0.04);
    result.push({
      centre,
      across: [-dz / length, dx / length],
      color: routeAltitudeColor(centre[1], low, high),
      glow: (0.45 + 0.55 * heightBlend) * edge,
    });
  }
  return result;
}

export interface RouteBeamGeometry {
  readonly positions: Float32Array;
  /** RGBA на вершину: цвет высоты, альфа — свечение луча. */
  readonly colors: Float32Array;
  readonly indices: Uint16Array;
}

/**
 * Туманный луч: две скрещённые ленты постоянной полуширины — горизонтальная и
 * вертикальная, — чтобы кривая читалась с любого ракурса, а не исчезала,
 * повернувшись ребром.
 */
export function routeBeamGeometry(
  sections: readonly RouteGlowSection[],
  // Тонкий и интенсивный: нить маршрута, а не полоса. Прозрачность остаётся —
  // мир сквозь неё виден.
  halfWidth = 0.45,
  peakAlpha = 0.34,
): RouteBeamGeometry {
  const per = sections.length * 2;
  const positions = new Float32Array(per * 2 * 3);
  const colors = new Float32Array(per * 2 * 4);
  for (let index = 0; index < sections.length; index += 1) {
    const s = sections[index];
    const [cx, cy, cz] = s.centre;
    const [ax, az] = s.across;
    // Горизонтальная лента.
    positions.set(
      [cx - ax * halfWidth, cy, cz - az * halfWidth, cx + ax * halfWidth, cy, cz + az * halfWidth],
      index * 6,
    );
    // Вертикальная лента — тем же порядком после горизонтальных вершин.
    positions.set(
      [cx, cy - halfWidth, cz, cx, cy + halfWidth, cz],
      per * 3 + index * 6,
    );
    const alpha = peakAlpha * s.glow;
    for (const base of [index * 8, per * 4 + index * 8]) {
      colors.set(
        [s.color[0], s.color[1], s.color[2], alpha, s.color[0], s.color[1], s.color[2], alpha],
        base,
      );
    }
  }
  const quadCount = Math.max(0, sections.length - 1);
  const indices = new Uint16Array(quadCount * 12);
  for (let quad = 0; quad < quadCount; quad += 1) {
    const a = quad * 2;
    const b = per + quad * 2;
    indices.set(
      [a, a + 1, a + 2, a + 1, a + 3, a + 2, b, b + 1, b + 2, b + 1, b + 3, b + 2],
      quad * 12,
    );
  }
  return { positions, colors, indices };
}

/** Один светлячок: фаза на кривой, ход, блуждание и мерцание — свои. */
export interface RouteFirefly {
  readonly phase: number;
  /** Долей маршрута в секунду: рой ощутимо ТЕЧЁТ к посадке. */
  readonly drift: number;
  readonly wanderAmplitude: number;
  readonly wanderFrequency: number;
  readonly bobAmplitude: number;
  readonly twinkleFrequency: number;
  readonly twinklePhase: number;
}

/** Детерминированный рой: тот же номер — тот же рой, тестам есть за что держаться. */
export function createRouteFireflies(count = 220, seed = 7): RouteFirefly[] {
  let state = seed >>> 0 || 1;
  const random = () => {
    // LCG Парка–Миллера: хватает с запасом, зато воспроизводимо.
    state = (state * 48271) % 2147483647;
    return state / 2147483647;
  };
  return Array.from({ length: count }, () => ({
    phase: random(),
    // Медленное течение: рой ЖИВЁТ на трассе, а не мчится по ней.
    drift: 0.0028 + random() * 0.006,
    wanderAmplitude: 0.7 + random() * 1.6,
    wanderFrequency: 0.15 + random() * 0.55,
    bobAmplitude: 0.35 + random() * 0.8,
    twinkleFrequency: 0.5 + random() * 1.4,
    twinklePhase: random() * Math.PI * 2,
  }));
}

export interface RouteFireflySample {
  readonly position: readonly [number, number, number];
  readonly color: readonly [number, number, number];
  /** 0…1 яркость с мерцанием. */
  readonly intensity: number;
}

/**
 * Положение светлячка в момент времени: точка кривой по текущей фазе плюс
 * собственное рыскание поперёк и лёгкий подскок по высоте.
 */
export function sampleRouteFirefly(
  plan: VehicleRoutePlan,
  firefly: RouteFirefly,
  timeSeconds: number,
  low: number,
  high: number,
): RouteFireflySample {
  const at = (firefly.phase + timeSeconds * firefly.drift) % 1;
  const step = 0.004;
  const centre = plan.point(at);
  const before = plan.point(Math.max(0, at - step));
  const after = plan.point(Math.min(1, at + step));
  const dx = after[0] - before[0];
  const dz = after[2] - before[2];
  const length = Math.hypot(dx, dz) || 1;
  const acrossX = -dz / length;
  const acrossZ = dx / length;
  const wobble =
    Math.sin(timeSeconds * firefly.wanderFrequency * Math.PI * 2 + firefly.twinklePhase) *
    firefly.wanderAmplitude;
  const bob =
    Math.sin(timeSeconds * firefly.wanderFrequency * Math.PI * 1.3 + firefly.twinklePhase * 1.7) *
    firefly.bobAmplitude;
  const twinkle =
    0.55 +
    0.45 *
      Math.sin(timeSeconds * firefly.twinkleFrequency * Math.PI * 2 + firefly.twinklePhase);
  // Края маршрута гасят и светлячков, как гасят луч: у берта трасса начинается
  // прямо под стоящей машиной, и не погашенный там светляк выглядел
  // «откреплённым бирюзовым фонарём под брюхом» — на площадке и у роторов
  // вдоль взлётного столба. Рой живёт на маршевой части, где рядом луч.
  const edge = Math.min(1, Math.min(at, 1 - at) / 0.06);
  return {
    position: [
      centre[0] + acrossX * wobble,
      centre[1] + bob,
      centre[2] + acrossZ * wobble,
    ],
    color: routeAltitudeColor(centre[1], low, high),
    intensity: twinkle * edge * edge,
  };
}
