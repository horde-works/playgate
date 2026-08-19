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
  /**
   * Знак хода вдоль `up × normal`. Правый борт DC-3 даёт хвост сам;
   * левый без знака уехал бы к носу.
   */
  readonly slideSign?: -1 | 1;
  /** Горизонтальный вызов Space; без поля — общий `VIKING_DOOR_APPROACH_RADIUS`. */
  readonly approachRadius?: number;
  readonly releaseRadius?: number;
}

export function plugSlideApproachRadius(
  policy: PlugSlideDoorPolicy | null | undefined,
): number {
  return policy?.approachRadius ?? VIKING_DOOR_APPROACH_RADIUS;
}

export function plugSlideReleaseRadius(
  policy: PlugSlideDoorPolicy | null | undefined,
): number {
  return policy?.releaseRadius ?? VIKING_DOOR_RELEASE_RADIUS;
}

export interface AutomaticSlideDoorPolicy {
  readonly doorId: string;
  /** Signed travel along `up × outward normal`; paired leaves move apart. */
  readonly travel: number;
  readonly slideSign: -1 | 1;
  readonly approachRadius: number;
  readonly releaseRadius: number;
}

export interface TailRampPolicy {
  readonly doorId: string;
  /** Signed rotation from the sealed tail to the deployed loading slope. */
  readonly openAngle: number;
  /** Ramp-only hinge axis; ordinary doors always keep their vertical axis. */
  readonly rotationAxis: readonly [number, number, number];
}

export const STANDARD_DOOR_ROTATION_AXIS = [0, 1, 0] as const;

/**
 * Транспортная дверь сначала выходит из проёма НА СЕБЯ на свою толщину, а
 * потом уезжает вдоль борта. Закрывается тем же порядком назад. Направление
 * «наружу» и ось борта берутся из `hinge.normal` / `hinge.direction`.
 * Конкретная машина задаёт только размерный профиль, механизм остаётся один.
 */
/**
 * РАЗМЕРНЫЕ ПРОФИЛИ — ТАБЛИЦЕЙ, А НЕ ЦЕПОЧКОЙ `if`.
 *
 * Данные те же и поведение то же; разница в том, что таблицу можно
 * ПЕРЕЧИСЛИТЬ. Цепочку `if` нельзя спросить «а какие машины вообще заявили
 * дверь», поэтому нельзя и проверить, что у машины из каталога не забыт ни
 * один из её реестров: у машины их три — паспорт (`airVehicles`), место
 * (`passengerSeats`) и вот этот профиль. Забыть любой можно молча, и ловит
 * это `tests/vehicle-registry-consistency.test.mjs`, которому нужен именно
 * перечислимый список.
 */
export const PLUG_SLIDE_DOORS: readonly PlugSlideDoorPolicy[] = [
  { doorId: "terminal:sky-train:head:door", plugDepth: 0.26, travel: 1.78, plugShare: 0.34 },
  { doorId: "sky-mooring:airship:car:door", plugDepth: 0.22, travel: 1.42, plugShare: 0.34 },
  // DC-3: все четыре створки к хвосту. Проём — дырка в шкуре, едет накладка.
  // Радиус 3.2 м (общий для дверей деревни) с салона и с носа хватал переднюю
  // створку: Space открывал дверь вместо посадки в кресло.
  { doorId: "island-airport:dc3:cabin-entry-right-forward", plugDepth: 0.18, travel: 0.8, plugShare: 0.34, approachRadius: 1.8, releaseRadius: 2.4 },
  { doorId: "island-airport:dc3:cabin-entry-left-forward", plugDepth: 0.18, travel: 0.8, plugShare: 0.34, slideSign: -1, approachRadius: 1.8, releaseRadius: 2.4 },
  { doorId: "island-airport:dc3:cabin-entry-right-aft", plugDepth: 0.18, travel: 0.8, plugShare: 0.34, approachRadius: 1.8, releaseRadius: 2.4 },
  { doorId: "island-airport:dc3:cabin-entry-left-aft", plugDepth: 0.18, travel: 0.8, plugShare: 0.34, slideSign: -1, approachRadius: 1.8, releaseRadius: 2.4 },
];

/** The sky ram's stern armour doubles as a loading ramp while docked. */
export const TAIL_RAMPS: readonly TailRampPolicy[] = [
  {
    doorId: "stronghold:sky-ram:gallery:ramp",
    openAngle: -1.16,
    rotationAxis: [1, 0, 0],
  },
];

export function plugSlideDoorPolicy(groupKey: string): PlugSlideDoorPolicy | null {
  return PLUG_SLIDE_DOORS.find((door) => door.doorId === groupKey) ?? null;
}

/**
 * Terminal vestibules use the same kinematic, breakable door ownership as
 * vehicle plug doors, but their sensor is automatic and their leaves only
 * translate. The pair shares one doorway id while each leaf keeps its own
 * signed travel.
 */
export function automaticSlideDoorPolicy(
  groupKey: string,
): AutomaticSlideDoorPolicy | null {
  const match = groupKey.match(
    /^island-airport:terminal-glass:(airside|landside):door:(\d+):(-1|1)$/,
  );
  if (!match) return null;
  const side = Number(match[3]) as -1 | 1;
  const facade = match[1] as "airside" | "landside";
  return {
    doorId: `island-airport:terminal-glass:${facade}:door:${match[2]}`,
    travel: 1,
    // `up × normal` points +X on the landside and -X on the airside.
    slideSign: (side * (facade === "landside" ? 1 : -1)) as -1 | 1,
    approachRadius: 3.4,
    releaseRadius: 4.6,
  };
}

export function automaticSlideDoorShouldOpen(
  distance: number,
  isPartlyOpen: boolean,
  policy: AutomaticSlideDoorPolicy,
): boolean {
  return distance < (isPartlyOpen ? policy.releaseRadius : policy.approachRadius);
}

export function tailRampPolicy(groupKey: string): TailRampPolicy | null {
  return TAIL_RAMPS.find((ramp) => ramp.doorId === groupKey) ?? null;
}

/** A cargo ramp may pitch; every other hinged leaf remains a yawing door. */
export function hingedLeafRotationAxis(
  groupKey: string,
): readonly [number, number, number] {
  return tailRampPolicy(groupKey)?.rotationAxis ?? STANDARD_DOOR_ROTATION_AXIS;
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
