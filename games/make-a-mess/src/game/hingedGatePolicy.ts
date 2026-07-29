export const VIKING_GATE_APPROACH_RADIUS = 8;
export const VIKING_GATE_RELEASE_RADIUS = 11;
export const VIKING_DOOR_APPROACH_RADIUS = 3.2;
export const VIKING_DOOR_RELEASE_RADIUS = 4.2;
/**
 * Дверь ищется по горизонтали, поэтому у поднятых дверей (гондола на
 * причальной мачте) её открывал игрок, стоящий на земле под ними. Порог по
 * высоте отсекает такие «вызовы снизу», оставляя запас на ступеньку,
 * порог и рост камеры.
 */
export const DOOR_APPROACH_HEIGHT = 2.6;

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

/**
 * Торцевые ворота великого зала: распахиваются НАРУЖУ, днём стоят открытыми,
 * на ночь затворяются сами. По запросу игрока не открываются — для этого
 * есть боковой вход.
 */
export function vikingHallGatePolicy(groupKey: string): VikingGateLeafPolicy | null {
  const match = groupKey.match(
    /^(viking-village:buildings:great-hall:hall-gate):leaf:(-1|1)$/,
  );
  if (!match) {
    return null;
  }
  const side = Number(match[2]) as -1 | 1;
  return {
    gateId: match[1],
    side,
    outward: 1,
    // Обе створки уходят наружу, от центра зала.
    swingSign: side as -1 | 1,
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

export interface PlugSlideDoorPolicy {
  readonly doorId: string;
  /** На сколько створка выходит из проёма наружу, прежде чем поехать. */
  readonly plugDepth: number;
  /** Ход вдоль борта: вся ширина полотна. */
  readonly travel: number;
  /** Доля хода, отведённая на выход из проёма. */
  readonly plugShare: number;
}

/**
 * Транспортная дверь сначала выходит из проёма НА СЕБЯ на свою толщину, а
 * потом уезжает вдоль борта. Закрывается тем же порядком назад. Направление
 * «наружу» и ось борта берутся из `hinge.normal` / `hinge.direction`.
 * Конкретная машина задаёт только размерный профиль, механизм остаётся один.
 */
export function plugSlideDoorPolicy(groupKey: string): PlugSlideDoorPolicy | null {
  if (groupKey === "terminal:sky-train:head:door") {
    return { doorId: groupKey, plugDepth: 0.26, travel: 1.78, plugShare: 0.34 };
  }
  if (groupKey === "sky-mooring:airship:car:door") {
    return { doorId: groupKey, plugDepth: 0.22, travel: 1.42, plugShare: 0.34 };
  }
  return null;
}

export function hingedDoorGroupKey(
  pieceId: string,
  clusterId: string,
): string {
  if (townHouseDoorPolicy(clusterId)) {
    return clusterId;
  }
  // Примитивы из документов сцены компилируются с хвостом ":piece" — без
  // его снятия полотно и ручка попадают в РАЗНЫЕ группы и едут порознь.
  return pieceId
    .replace(/:piece$/, "")
    .replace(/:(board|strap|brace):\d+$/, "");
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
