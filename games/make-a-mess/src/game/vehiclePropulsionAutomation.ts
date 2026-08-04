import {
  executeCommandActuators,
  type CommandActuatorBinding,
  type CommandActuatorExecution,
} from "./vehicleActuation.ts";

export type PropulsionMode = "nominal" | "degraded" | "inoperative";

export interface PropulsionHealth {
  /** Physical thrust fraction still available on each propulsion channel. */
  readonly fractions: readonly number[];
  readonly mode: PropulsionMode;
}

/** Physical health sensing for flight clearance; no route or shaft allocation. */
export function propulsionHealth(
  bindings: readonly CommandActuatorBinding[],
  attachedMemberIds: ReadonlySet<string>,
  engineCount: number,
): PropulsionHealth {
  const executions = executeCommandActuators(
    bindings,
    attachedMemberIds,
    Object.fromEntries(
      Array.from({ length: engineCount }, (_, index) => [`throttle:${index}`, 1]),
    ),
  );
  const fractions = Array.from({ length: engineCount }, (_, index) => {
    const channel = `throttle:${index}`;
    const matches = executions.filter(
      (execution) => execution.commandChannel === channel,
    );
    if (matches.length === 0) {
      return 1;
    }
    return Math.max(
      0,
      Math.min(
        1,
        matches.reduce((sum, execution) => sum + execution.attachedFraction, 0) /
          matches.length,
      ),
    );
  });
  const weakest = fractions.length > 0 ? Math.min(...fractions) : 1;
  return {
    fractions,
    mode: weakest <= 1e-6
      ? "inoperative"
      : weakest < 1 - 1e-6
        ? "degraded"
        : "nominal",
  };
}

/**
 * What the autopilot learned from the last command it actually sent.
 *
 * The actuator layer reports only request and delivery. It does not prescribe
 * a replacement shaft command. Channels that carried no measurable command
 * keep their previous estimate until the autopilot excites them again.
 */
export function updatePropulsionFeedback(
  previous: readonly number[],
  executions: readonly CommandActuatorExecution[],
  engineCount: number,
  /**
   * Приставка канала. Отдельный орган — отдельная группа каналов, но закон
   * обучения у них один: сравнить просьбу с доставкой. Модуль остаётся общим и
   * ничего не знает ни о винтах, ни о тоннелях.
   */
  channelPrefix = "throttle:",
): readonly number[] {
  return Array.from({ length: engineCount }, (_, index) => {
    const channel = `${channelPrefix}${index}`;
    const measurable = executions.filter(
      (execution) =>
        execution.commandChannel === channel &&
        Math.abs(execution.requested) > 1e-6,
    );
    if (measurable.length === 0) {
      return Math.max(0, Math.min(1, previous[index] ?? 1));
    }
    const requested = measurable.reduce(
      (sum, execution) => sum + Math.abs(execution.requested),
      0,
    );
    const delivered = measurable.reduce(
      (sum, execution) => sum + Math.abs(execution.delivered),
      0,
    );
    return requested > 1e-6
      ? Math.max(0, Math.min(1, delivered / requested))
      : Math.max(0, Math.min(1, previous[index] ?? 1));
  });
}
