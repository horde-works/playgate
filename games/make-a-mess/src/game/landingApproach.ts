/**
 * ЗАХОД НА ПОСАДКУ ВИНТОКРЫЛОЙ МАШИНЫ — общая форма.
 *
 * Идти ровно на высоте отрыва, встать над площадкой, снижаться вертикально.
 * Форма ровно одна на всех, и здесь она одна и лежит: у RAX-8 она была написана
 * отдельно, а у VX-8 «заходом» служил его собственный КРУГ —
 *
 *   export function ductHexacopterArrivalPlan(berth) {
 *     return ductHexacopterLapPlan(berth);
 *   }
 *
 * — то есть подменную машину ставили в начало прошлого маршрута, и она летела
 * его целиком вместо посадки. Наблюдение Igor (12.08.2026): «траектория
 * подменной машины — это по-прежнему старая траектория, по которой летел
 * предыдущий; корабль летит в „прибытии“, а траектория прошлая, а не
 * посадочная глиссада из точки появления».
 *
 * ПОЧЕМУ ПРЯМАЯ, А НЕ КРИВАЯ. Заход — это створ: машина обязана прийти к
 * площадке по предсказуемой линии, чтобы её было видно и чтобы створ имел
 * смысл. Красота тут вредна: подменное судно должно СЕСТЬ, а не показать номер.
 *
 * ПОЧЕМУ ВЫСОТА НЕ ИНТЕРПОЛИРУЕТСЯ К ПРИЧАЛУ. Прямая от точки на горизонте к
 * причалу — это постоянный снижающийся глиссад, и он скребёт кромку острова:
 * замер по геометрии полигона давал пересечение кромки на 4.1 м при обычном
 * пеленге и на −9.6 м при отзыве снизу, то есть план вёл СКВОЗЬ остров.
 */

import type { SceneVector3 } from "./destructionScene.ts";
import type { VehicleRoutePlan } from "./vehicleFrames.ts";

export interface LandingApproachOptions {
  /** Пеленг захода в радианах: с какой стороны машина приходит. */
  readonly bearing?: number;
  /**
   * Начало захода в мире. Не задано — берётся точка на горизонте по пеленгу.
   * Задаётся отзывом с пульта: машину зовут оттуда, где она сейчас.
   */
  readonly from?: SceneVector3;
}

export interface LandingApproachShape {
  /** Имя плана: своё у каждой машины, чтобы лента маршрута их различала. */
  readonly id: string;
  /** Высота ровного участка над причалом, м. */
  readonly clearance: number;
  /** Удаление точки появления на горизонте, м. */
  readonly horizon?: number;
  /** Ход на подходе и на постановке над площадкой, м/с. */
  readonly cruiseSpeed?: number;
  readonly settleSpeed?: number;
  /** Полуширина коридора участка, м. */
  readonly corridor?: number;
}

const smootherStep = (value: number): number => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * t * (t * (t * 6 - 15) + 10);
};

export function landingApproachPlan(
  berth: SceneVector3,
  shape: LandingApproachShape,
  options?: LandingApproachOptions,
): VehicleRoutePlan {
  const bearing = options?.bearing ?? 0;
  const horizon = shape.horizon ?? 150;
  const cruise = berth[1] + shape.clearance;
  const from = options?.from;
  const start: SceneVector3 = from
    ? [from[0], from[1], from[2]]
    : [
        berth[0] + Math.sin(bearing) * horizon,
        cruise,
        berth[2] + Math.cos(bearing) * horizon,
      ];
  const span = Math.hypot(start[0] - berth[0], start[2] - berth[2]) || 1;
  /** С какой доли пути машина уже над площадкой и снижается вертикально. */
  const verticalFrom = Math.max(0, 1 - Math.min(0.35, 24 / span));
  /**
   * Доля пути, на которой машина ВЫХОДИТ на высоту захода.
   *
   * Заход обязан начинаться там, где машина ЕСТЬ, а не там, где ей следует
   * быть: отзыв с пульта строится от текущего места, и подменить его высоту
   * сразу значило бы соврать о положении машины в первой же точке трассы.
   */
  const climbSpan = Math.min(0.3, Math.max(0.08, 40 / span));
  /**
   * ПОСЛЕДНЯЯ ТОЧКА ПЛАНА — ЭТО ПРИЧАЛ, А НЕ ПОЛКА.
   *
   * `plan.point(1)` весь контур считает бертом: по нему держат место у
   * причала, от него меряют захват вертикального захода и завершающее
   * снижение. План, чья последняя точка висит в двадцати метрах над
   * площадкой, приказывает машине «сесть» в воздух — и она честно повисает
   * там. Поэтому профиль СНИЖАЕТСЯ к причалу на последнем участке, а «не
   * снижаться, пока не над площадкой» обеспечивает `verticalArrival`: полка
   * перекрывает план, пока захват не засчитан.
   */
  const altitudeAt = (progress: number): number => {
    const t = Math.max(0, Math.min(1, progress));
    if (t < climbSpan) {
      return start[1] + (cruise - start[1]) * smootherStep(t / climbSpan);
    }
    if (t <= verticalFrom) {
      return cruise;
    }
    const descent = (t - verticalFrom) / Math.max(1e-6, 1 - verticalFrom);
    return cruise + (berth[1] - cruise) * smootherStep(descent);
  };
  const cruiseSpeed = shape.cruiseSpeed ?? 16;
  const settleSpeed = shape.settleSpeed ?? 5;
  return {
    id: shape.id,
    length: span,
    point(progress) {
      const t = Math.max(0, Math.min(1, progress));
      return [
        start[0] + (berth[0] - start[0]) * t,
        altitudeAt(t),
        start[2] + (berth[2] - start[2]) * t,
      ];
    },
    speedLimit: (progress) =>
      progress < verticalFrom ? cruiseSpeed : settleSpeed,
    altitude: altitudeAt,
    corridor: () => shape.corridor ?? 10,
    verticalArrival: {
      altitude: cruise,
      from: verticalFrom,
      horizontalTolerance: 1.2,
    },
    finalFrom: verticalFrom,
  };
}
