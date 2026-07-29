import type {
  BreakablePieceDefinition,
  CommandActuatorTag,
} from "./destructionScene.ts";

export interface CommandActuatorMember {
  readonly pieceId: string;
  readonly contribution: number;
  readonly required: boolean;
}

export interface CommandActuatorBinding {
  readonly id: string;
  readonly commandChannel: string;
  readonly members: readonly CommandActuatorMember[];
  readonly totalContribution: number;
}

export interface CommandActuatorExecution {
  readonly id: string;
  readonly commandChannel: string;
  readonly requested: number;
  readonly attachedFraction: number;
  readonly delivered: number;
}

type ActuatorPiece = Pick<BreakablePieceDefinition, "id" | "actuator">;

/** Compile authored actuator tags once; no vehicle type or naming convention. */
export function compileCommandActuators(
  pieces: readonly ActuatorPiece[],
): readonly CommandActuatorBinding[] {
  const grouped = new Map<
    string,
    { tag: CommandActuatorTag; members: CommandActuatorMember[] }
  >();
  for (const piece of pieces) {
    const tag = piece.actuator;
    if (!tag) {
      continue;
    }
    const contribution = Math.max(0, tag.contribution ?? 1);
    const current = grouped.get(tag.id);
    if (current) {
      if (current.tag.commandChannel !== tag.commandChannel) {
        throw new Error(
          `Actuator ${tag.id} is bound to both ${current.tag.commandChannel} and ${tag.commandChannel}`,
        );
      }
      current.members.push({
        pieceId: piece.id,
        contribution,
        required: tag.required ?? false,
      });
    } else {
      grouped.set(tag.id, {
        tag,
        members: [{
          pieceId: piece.id,
          contribution,
          required: tag.required ?? false,
        }],
      });
    }
  }
  return [...grouped.values()].map(({ tag, members }) => ({
    id: tag.id,
    commandChannel: tag.commandChannel,
    members,
    totalContribution: members.reduce(
      (sum, member) =>
        sum + (member.required ? 0 : member.contribution),
      0,
    ),
  }));
}

/**
 * Resolve requested commands against actual compound-body membership. This is
 * the physical answer to "does the engine still belong to this ship?".
 */
export function executeCommandActuators(
  bindings: readonly CommandActuatorBinding[],
  attachedMemberIds: ReadonlySet<string>,
  commands: Readonly<Record<string, number>>,
): readonly CommandActuatorExecution[] {
  return bindings.map((binding) => {
    const requiredAttached = binding.members.every(
      (member) => !member.required || attachedMemberIds.has(member.pieceId),
    );
    const attachedContribution = binding.members.reduce(
      (sum, member) =>
        sum + (
          !member.required && attachedMemberIds.has(member.pieceId)
            ? member.contribution
            : 0
        ),
      0,
    );
    const scalableFraction = binding.totalContribution > 0
      ? Math.min(1, attachedContribution / binding.totalContribution)
      : 1;
    const attachedFraction = requiredAttached ? scalableFraction : 0;
    const requested = commands[binding.commandChannel] ?? 0;
    return {
      id: binding.id,
      commandChannel: binding.commandChannel,
      requested,
      attachedFraction,
      delivered: requested * attachedFraction,
    };
  });
}

/** Untagged legacy channels remain fully effective. */
export function deliveredCommandValue(
  executions: readonly CommandActuatorExecution[],
  commandChannel: string,
  requested: number,
): number {
  const matching = executions.filter(
    (execution) => execution.commandChannel === commandChannel,
  );
  if (matching.length === 0) {
    return requested;
  }
  const fraction = matching.reduce(
    (sum, execution) => sum + execution.attachedFraction,
    0,
  ) / matching.length;
  return requested * fraction;
}
