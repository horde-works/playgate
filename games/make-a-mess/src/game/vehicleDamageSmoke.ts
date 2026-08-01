import type { CommandActuatorBinding } from "./vehicleActuation.ts";

export interface VehicleEngineDamageSmoke {
  /** Lost share of this engine's real actuator authority. */
  readonly severity: number;
  /** A destroyed required core carries the smoke with its debris body. */
  readonly detachedAnchorPieceId: string | null;
}

/** Damage smoke reads the same actuator membership as propulsion itself. */
export function vehicleEngineDamageSmoke(
  bindings: readonly CommandActuatorBinding[],
  inactiveMemberIds: ReadonlySet<string>,
  engineIndex: number,
): VehicleEngineDamageSmoke {
  const channel = `throttle:${engineIndex}`;
  const matches = bindings.filter(
    (binding) => binding.commandChannel === channel,
  );
  if (matches.length === 0) {
    return { severity: 0, detachedAnchorPieceId: null };
  }

  let deliveredFraction = 0;
  let detachedAnchorPieceId: string | null = null;
  for (const binding of matches) {
    const requiredMissing = binding.members.find(
      (member) => member.required && inactiveMemberIds.has(member.pieceId),
    );
    detachedAnchorPieceId ??= requiredMissing?.pieceId ?? null;
    if (requiredMissing) {
      continue;
    }
    const attachedContribution = binding.members.reduce(
      (sum, member) =>
        sum +
        (!member.required && !inactiveMemberIds.has(member.pieceId)
          ? member.contribution
          : 0),
      0,
    );
    deliveredFraction +=
      binding.totalContribution > 0
        ? Math.min(1, attachedContribution / binding.totalContribution)
        : 1;
  }

  return {
    severity: Math.max(0, Math.min(1, 1 - deliveredFraction / matches.length)),
    detachedAnchorPieceId,
  };
}

/** Combustion keeps choking; an electrical motor strongly smokes, then cools. */
export function vehicleDamageSmokeRate(
  severity: number,
  ageSeconds: number,
  electric: boolean,
): number {
  const damage = Math.max(0, Math.min(1, severity));
  if (damage <= 1e-6) {
    return 0;
  }
  const denseRate = 6 + damage * 36;
  return electric
    ? denseRate * (0.1 + 0.9 * Math.exp(-Math.max(0, ageSeconds) / 4.5))
    : denseRate;
}
