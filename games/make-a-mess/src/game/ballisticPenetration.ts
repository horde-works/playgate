import type { SceneVector3 } from "./destructionScene.ts";

const EPSILON = 1e-9;

/**
 * Паспорт бронебойного боеприпаса.
 *
 * Число означает толщину сплошной стали, которую снаряд едва проходит при
 * попадании строго по нормали. Здесь нет ни имени машины, ни множителя урона:
 * один и тот же закон читают оружие, геометрия цели и стенд.
 */
export interface SteelPenetrationCapability {
  readonly steelThicknessAtNormal: number;
}

export interface SteelPlateImpact {
  /** Физическая толщина пересечённого стального листа, м. */
  readonly plateThickness: number;
  /** Направление полёта в мировой системе. */
  readonly direction: SceneVector3;
  /** Нормаль поверхности в мировой системе; знак не важен. */
  readonly normal: SceneVector3;
}

export interface SteelPenetrationResult {
  readonly penetrates: boolean;
  /** |d·n|: 1 — удар по нормали, 0 — вдоль поверхности. */
  readonly incidenceCosine: number;
  /** Приведённая толщина: путь снаряда в стали с учётом угла. */
  readonly effectiveThickness: number;
  /** Неизрасходованный эквивалент пробития после выхода из листа. */
  readonly residualThickness: number;
}

const length = (vector: SceneVector3): number =>
  Math.hypot(vector[0], vector[1], vector[2]);

const incidenceCosine = (
  direction: SceneVector3,
  normal: SceneVector3,
): number => {
  const directionLength = length(direction);
  const normalLength = length(normal);
  if (directionLength <= EPSILON || normalLength <= EPSILON) return 0;
  return Math.max(
    0,
    Math.min(
      1,
      Math.abs(
        (direction[0] * normal[0] +
          direction[1] * normal[1] +
          direction[2] * normal[2]) /
          (directionLength * normalLength),
      ),
    ),
  );
};

/**
 * Решает только терминальную баллистику листа. Поиск точки входа, нормали и
 * толщины принадлежит канонической геометрии цели и подключается отдельно.
 */
export function solveSteelPenetration(
  capability: SteelPenetrationCapability,
  impact: SteelPlateImpact,
): SteelPenetrationResult {
  const cosine = incidenceCosine(impact.direction, impact.normal);
  const plateThickness = Number.isFinite(impact.plateThickness)
    ? Math.max(0, impact.plateThickness)
    : Number.POSITIVE_INFINITY;
  const capacity = Number.isFinite(capability.steelThicknessAtNormal)
    ? Math.max(0, capability.steelThicknessAtNormal)
    : 0;
  const effectiveThickness =
    cosine <= EPSILON
      ? Number.POSITIVE_INFINITY
      : plateThickness / cosine;
  const penetrates =
    capacity > 0 &&
    plateThickness > 0 &&
    effectiveThickness <= capacity + EPSILON;

  return {
    penetrates,
    incidenceCosine: cosine,
    effectiveThickness,
    residualThickness: penetrates
      ? Math.max(0, capacity - effectiveThickness)
      : 0,
  };
}

