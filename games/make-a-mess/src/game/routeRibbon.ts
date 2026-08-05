import type { VehicleRoutePlan } from "./skyTrainRoutes.ts";

/**
 * ЛЕНТА МАРШРУТА В МИРЕ: дополненная реальность автономного полёта.
 *
 * Требование и его картинка из одного источника: осевая линия — `plan.point`,
 * ШИРИНА ленты — авторский коридор участка. Узкая нитка между домами и
 * широкая полоса над водой показывают игроку не только куда машина летит, но
 * и сколько ей разрешено гулять — ту самую «точность как свойство трассы».
 *
 * Модуль чистый: ни three, ни рантайма — только выборка плана в вершины.
 * Компонент рендера потребляет готовые числа; расходиться им негде.
 */

export interface RouteRibbonOptions {
  /** Насколько вперёд по трассе рисуем, м. */
  readonly aheadMetres?: number;
  /** Сколько поперечных сечений в ленте. */
  readonly sections?: number;
  /** Полуширина, когда трасса коридора не объявила, м. */
  readonly defaultHalfWidth?: number;
  /** Визуальные пределы полуширины: нитка всё же видима, полоса не заборы. */
  readonly minimumHalfWidth?: number;
  readonly maximumHalfWidth?: number;
}

export interface RouteRibbonSection {
  readonly centre: readonly [number, number, number];
  /** Единичный поперечник в горизонте: лента лежит плашмя, как в кино. */
  readonly across: readonly [number, number];
  readonly halfWidth: number;
  /** 0…1: гаснет к дальнему краю и мягко занимается у машины. */
  readonly fade: number;
}

/**
 * Сечения ленты от текущего progress вперёд. Позади машины не рисуем: маршрут
 * показывает будущее, прошлое и так видно по небу за хвостом.
 */
export function routeRibbonSections(
  plan: VehicleRoutePlan,
  progress: number,
  options: RouteRibbonOptions = {},
): RouteRibbonSection[] {
  const ahead = options.aheadMetres ?? 170;
  const sections = Math.max(2, options.sections ?? 48);
  const fallback = options.defaultHalfWidth ?? 6;
  const minimum = options.minimumHalfWidth ?? 1.1;
  const maximum = options.maximumHalfWidth ?? 30;
  if (plan.length <= 1) {
    return [];
  }
  const from = Math.max(0, Math.min(1, progress));
  const to = Math.min(1, from + ahead / plan.length);
  if (to - from < 1e-4) {
    return [];
  }
  const result: RouteRibbonSection[] = [];
  const tangentStep = Math.max(1e-4, (to - from) / sections);
  for (let index = 0; index <= sections; index += 1) {
    const at = from + ((to - from) * index) / sections;
    const centre = plan.point(at);
    const before = plan.point(Math.max(0, at - tangentStep));
    const after = plan.point(Math.min(1, at + tangentStep));
    const dx = after[0] - before[0];
    const dz = after[2] - before[2];
    const length = Math.hypot(dx, dz);
    if (length < 1e-6) {
      continue;
    }
    const across: readonly [number, number] = [-dz / length, dx / length];
    const halfWidth = Math.max(
      minimum,
      Math.min(maximum, plan.corridor?.(at) ?? fallback),
    );
    const along = index / sections;
    // Мягкий подъём у машины (первые ~8%) и длинное угасание к дальнему краю:
    // лента не тычет в кабину и не обрубается в воздухе.
    const rise = Math.min(1, along / 0.08);
    const decay = Math.min(1, (1 - along) / 0.35);
    result.push({
      centre,
      across,
      halfWidth,
      fade: rise * decay * decay,
    });
  }
  return result;
}

export interface RouteRibbonGeometry {
  /** Пары вершин лево/право на сечение, xyz подряд. */
  readonly positions: Float32Array;
  /** RGBA на вершину: альфа несёт угасание. */
  readonly colors: Float32Array;
  readonly indices: Uint16Array;
}

/** Треугольная лента из сечений. Цвет один, альфа — по сечению. */
export function routeRibbonGeometry(
  sections: readonly RouteRibbonSection[],
  color: readonly [number, number, number] = [0.42, 0.82, 1],
  peakAlpha = 0.12,
): RouteRibbonGeometry {
  const positions = new Float32Array(sections.length * 2 * 3);
  const colors = new Float32Array(sections.length * 2 * 4);
  for (let index = 0; index < sections.length; index += 1) {
    const section = sections[index];
    const [cx, cy, cz] = section.centre;
    const [ax, az] = section.across;
    const w = section.halfWidth;
    positions.set(
      [cx - ax * w, cy, cz - az * w, cx + ax * w, cy, cz + az * w],
      index * 6,
    );
    const alpha = peakAlpha * section.fade;
    colors.set(
      [color[0], color[1], color[2], alpha, color[0], color[1], color[2], alpha],
      index * 8,
    );
  }
  const quadCount = Math.max(0, sections.length - 1);
  const indices = new Uint16Array(quadCount * 6);
  for (let quad = 0; quad < quadCount; quad += 1) {
    const a = quad * 2;
    indices.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], quad * 6);
  }
  return { positions, colors, indices };
}
