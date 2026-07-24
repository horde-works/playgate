export const VIKING_GATE_APPROACH_RADIUS = 8;
export const VIKING_GATE_RELEASE_RADIUS = 11;
export const VIKING_DOOR_APPROACH_RADIUS = 3.2;
export const VIKING_DOOR_RELEASE_RADIUS = 4.2;

export interface VikingGateLeafPolicy {
  readonly gateId: string;
  readonly side: -1 | 1;
  readonly outward: -1 | 1;
  readonly swingSign: -1 | 1;
}

export interface VikingDoorPolicy {
  readonly doorId: string;
}

export interface TownHouseDoorPolicy {
  readonly doorId: string;
}

export function vikingGateLeafPolicy(groupKey: string): VikingGateLeafPolicy | null {
  const match = groupKey.match(
    /^(viking-village:palisade:(north|south)):leaf:(-1|1)$/,
  );
  if (!match) {
    return null;
  }
  const side = Number(match[3]) as -1 | 1;
  const outward = match[2] === "north" ? 1 : -1;
  return {
    gateId: match[1],
    side,
    outward,
    // Both leaves rotate toward the village centre. This is deterministic:
    // approaching from inside never makes the same gate swing back outward.
    swingSign: (-side * outward) as -1 | 1,
  };
}

export function vikingDoorPolicy(groupKey: string): VikingDoorPolicy | null {
  if (!/^viking-village:buildings:[^:]+:door$/.test(groupKey)) {
    return null;
  }
  return { doorId: groupKey };
}

export function townHouseDoorPolicy(groupKey: string): TownHouseDoorPolicy | null {
  if (!/^(?:(?:h2|h3):)?door:(?:front|back)$/.test(groupKey)) {
    return null;
  }
  return { doorId: groupKey };
}

export function hingedDoorGroupKey(
  pieceId: string,
  clusterId: string,
): string {
  return townHouseDoorPolicy(clusterId)
    ? clusterId
    : pieceId.replace(/:(board|strap|brace):\d+$/, "");
}

export function inwardDoorSwingSign(
  center: readonly [number, number, number],
  pivot: readonly [number, number, number],
  outwardNormal: readonly [number, number, number],
): -1 | 1 {
  const radiusX = center[0] - pivot[0];
  const radiusZ = center[2] - pivot[2];
  // Choose the yaw whose first movement is opposite the authored outward
  // normal. The result is independent of which side the player approached.
  return (Math.sign(
    radiusX * outwardNormal[2] - radiusZ * outwardNormal[0],
  ) || 1) as -1 | 1;
}

export function horizontalGateDistance(
  position: readonly [number, number, number],
  center: readonly [number, number, number],
): number {
  return Math.hypot(position[0] - center[0], position[2] - center[2]);
}
