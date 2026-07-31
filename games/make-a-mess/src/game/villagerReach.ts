/**
 * Рука жителя как двузвенник: плечо → локоть → кисть.
 *
 * Зачем это отдельно от шейдера: позу рабочего движения задаёт НЕ угол в
 * плече, а положение КИСТЕЙ на предмете — рукоять топора, рукоятка ворота,
 * бельё на доске. Угол в плече из этого выводится, а не назначается на глаз.
 * Пока углы подбирались вручную, любое движение читалось «махами руками»,
 * потому что кисть оказывалась где угодно, только не на вещи.
 *
 * Формула стандартная (теорема косинусов), но здесь она — единственный
 * источник правды и для шейдера, и для теста: прямой кинематикой кисть
 * обязана попасть в заданную точку.
 */

/** Длина плеча и предплечья жителя, метры (из его же пропорций). */
export const UPPER_ARM = 0.26;
export const FOREARM = 0.24;
export const ARM_REACH = UPPER_ARM + FOREARM;

export interface ArmSolution {
  /** Поворот плеча от «руки вдоль тела», вперёд — положительный. */
  readonly shoulder: number;
  /** Сгибание локтя относительно плеча, вперёд — положительное. */
  readonly elbow: number;
  /** Дотянулся ли до точки без вытягивания звеньев. */
  readonly reached: boolean;
}

/**
 * Решает руку на точку в сагиттальной плоскости ОТНОСИТЕЛЬНО ПЛЕЧА:
 * `forward` — вперёд от плеча, `down` — вниз от плеча (обе в метрах).
 *
 * Выбирается «локоть назад» — так человек и тянется к низкой вещи; вторая
 * ветвь решения (локоть вверх) даёт вывернутую руку.
 */
export function solveArm(forward: number, down: number): ArmSolution {
  const raw = Math.hypot(forward, down);
  const distance = Math.min(raw, ARM_REACH - 0.004);
  const safe = Math.max(distance, 0.02);
  // Направление на цель, отсчитанное от «руки вниз».
  const aim = Math.atan2(forward, down);
  const cosOffset =
    (UPPER_ARM * UPPER_ARM + safe * safe - FOREARM * FOREARM) /
    (2 * UPPER_ARM * safe);
  const offset = Math.acos(Math.max(-1, Math.min(1, cosOffset)));
  const cosInterior =
    (UPPER_ARM * UPPER_ARM + FOREARM * FOREARM - safe * safe) /
    (2 * UPPER_ARM * FOREARM);
  const interior = Math.acos(Math.max(-1, Math.min(1, cosInterior)));
  return {
    shoulder: aim - offset,
    elbow: Math.PI - interior,
    reached: raw <= ARM_REACH - 0.004,
  };
}

/** Прямая кинематика той же руки — ею и проверяется решение. */
export function armWrist(solution: ArmSolution): {
  readonly forward: number;
  readonly down: number;
} {
  const elbowForward = Math.sin(solution.shoulder) * UPPER_ARM;
  const elbowDown = Math.cos(solution.shoulder) * UPPER_ARM;
  const forearmAngle = solution.shoulder + solution.elbow;
  return {
    forward: elbowForward + Math.sin(forearmAngle) * FOREARM,
    down: elbowDown + Math.cos(forearmAngle) * FOREARM,
  };
}
