import {
  debrisColliderBoxes,
  debrisCollisionTuning,
  groundMaterials,
  omittedDebrisColliderBoxes,
  type RemnantDefinition,
  type ShardDefinition,
} from "./destructionRuntime.ts";
import { materialRuntimeProfiles } from "./destructionScene.ts";
import { shellPlateBoxes } from "./shellPlates.ts";
import {
  DEBRIS_ACTOR_DETAIL,
  DEBRIS_NORMAL,
} from "./physicsInteractionGroups.ts";

/**
 * Паспорт коллайдеров одного тела дебриса. Осколки и остатки больше не
 * монтируются React-компонентами: их Rapier-тела создаются императивно из
 * этих дескрипторов в момент коммита. Формулы размеров, плотностей, групп и
 * трения — дословно из прежних JSX-компонентов Shard/Remnant, поэтому
 * геометрия контакта и масса не изменились ни на миллиметр.
 */
export interface DebrisColliderSpec {
  readonly shape: "cuboid" | "ball" | "cylinder";
  /** cuboid: полуразмеры; ball: [радиус]; cylinder: [полувысота, радиус]. */
  readonly args:
    | readonly [number, number, number]
    | readonly [number]
    | readonly [number, number];
  readonly center: readonly [number, number, number];
  readonly density: number;
  readonly friction: number;
  readonly restitution: number;
  /** null — группы Rapier по умолчанию (прикреплённый остаток). */
  readonly groups: number | null;
}

export interface DebrisBodySpec {
  readonly colliders: readonly DebrisColliderSpec[];
  readonly linearDamping: number;
  readonly angularDamping: number;
  readonly hardCcd: boolean;
  readonly softCcdPrediction: number;
  /** Крупные куски бьются дальше от контактных сил — им нужны события. */
  readonly chunky: boolean;
}

function isChunky(size: readonly [number, number, number]): boolean {
  return size[0] * size[1] * size[2] > 0.015;
}

const MAX_FREED_COLLIDERS = 3;
/** Прикреплённый остаток может нести больше мировых коллайдеров: он статичен. */
const MAX_ATTACHED_REMNANT_COLLIDERS = 8;

interface DebrisShapeSource {
  readonly shape?: ShardDefinition["shape"];
  readonly size: readonly [number, number, number];
  readonly material: ShardDefinition["material"];
  readonly boxes?: ShardDefinition["boxes"];
  readonly voxelBody?: ShardDefinition["voxelBody"];
}

function primaryColliderSpecs(
  source: DebrisShapeSource,
  friction: number,
  maximumBoxes: number,
  groups: number | null,
): {
  readonly specs: DebrisColliderSpec[];
  readonly primaryBoxes: NonNullable<ShardDefinition["boxes"]> | readonly {
    readonly center: readonly [number, number, number];
    readonly size: readonly [number, number, number];
  }[];
  readonly renderBoxes: readonly {
    readonly center: readonly [number, number, number];
    readonly size: readonly [number, number, number];
  }[];
} {
  const profile = materialRuntimeProfiles[source.material];
  // ОБОЛОЧКА СТАЛКИВАЕТСЯ СВОЕЙ ТОЛЩИНОЙ. Прежде коллайдер брал клетку решётки
  // целиком, а массу выправляла заниженная плотность: вес выходил верный, но
  // тонкая обшивка встречала мир на 13 см раньше собственной поверхности и
  // выглядела раздутой. Плита той же массы честнее по обеим статьям — объём
  // ужимается ровно во столько раз, во сколько поднимается плотность.
  const authoredBoxes =
    source.boxes && source.boxes.length > 0
      ? source.boxes
      : [{ center: [0, 0, 0] as const, size: source.size }];
  const renderBoxes = shellPlateBoxes(
    authoredBoxes,
    source.voxelBody?.cellSize,
    source.voxelBody?.volumeScale,
  );
  const density =
    renderBoxes === authoredBoxes
      ? profile.density * (source.voxelBody?.volumeScale ?? 1)
      : profile.density;

  if (source.shape === "sphere") {
    return {
      specs: [
        {
          shape: "ball",
          args: [Math.max(0.002, Math.min(...source.size) / 2 - 0.002)],
          center: [0, 0, 0],
          density,
          friction,
          restitution: profile.restitution,
          groups,
        },
      ],
      primaryBoxes: renderBoxes,
      renderBoxes,
    };
  }
  if (source.shape === "cylinder") {
    return {
      specs: [
        {
          shape: "cylinder",
          args: [
            Math.max(0.002, source.size[1] / 2 - 0.002),
            Math.max(0.002, (source.size[0] + source.size[2]) / 4 - 0.002),
          ],
          center: [0, 0, 0],
          density,
          friction,
          restitution: profile.restitution,
          groups,
        },
      ],
      primaryBoxes: renderBoxes,
      renderBoxes,
    };
  }

  const primaryBoxes = debrisColliderBoxes(
    source.size,
    renderBoxes,
    maximumBoxes,
  );
  return {
    specs: primaryBoxes.map((box) => ({
      shape: "cuboid" as const,
      args: [
        Math.max(0.002, box.size[0] / 2 - 0.002),
        Math.max(0.002, box.size[1] / 2 - 0.002),
        Math.max(0.002, box.size[2] / 2 - 0.002),
      ] as const,
      center: box.center,
      density,
      friction,
      restitution: profile.restitution,
      groups,
    })),
    primaryBoxes,
    renderBoxes,
  };
}

/**
 * Детальные actor-коллайдеры для пропущенных боксов: игрок опирается на
 * полную форму, физика мира — только на крупные. Грунт обходится без них
 * (см. прежний OmittedDebrisInteractionColliders).
 */
function detailColliderSpecs(
  source: DebrisShapeSource,
  renderBoxes: readonly {
    readonly center: readonly [number, number, number];
    readonly size: readonly [number, number, number];
  }[],
  primaryBoxes: readonly {
    readonly center: readonly [number, number, number];
    readonly size: readonly [number, number, number];
  }[],
): DebrisColliderSpec[] {
  if (groundMaterials.has(source.material)) {
    return [];
  }
  return omittedDebrisColliderBoxes(renderBoxes, primaryBoxes).map((box) => ({
    shape: "cuboid" as const,
    args: [
      Math.max(0.002, box.size[0] / 2 - 0.002),
      Math.max(0.002, box.size[1] / 2 - 0.002),
      Math.max(0.002, box.size[2] / 2 - 0.002),
    ] as const,
    center: box.center,
    density: 0,
    friction: 0.76,
    restitution: 0,
    groups: DEBRIS_ACTOR_DETAIL,
  }));
}

export function shardBodySpec(shard: ShardDefinition): DebrisBodySpec {
  const tuning = debrisCollisionTuning(shard.size, !shard.preferSoftCcd);
  const { specs, primaryBoxes, renderBoxes } = primaryColliderSpecs(
    shard,
    0.78,
    MAX_FREED_COLLIDERS,
    DEBRIS_NORMAL,
  );
  return {
    colliders: [
      ...specs,
      ...detailColliderSpecs(shard, renderBoxes, primaryBoxes),
    ],
    linearDamping: 0.15,
    angularDamping: 0.25,
    hardCcd: tuning.hardCcd,
    softCcdPrediction: tuning.softCcdPrediction,
    chunky: isChunky(shard.size),
  };
}

export function remnantBodySpec(
  remnant: RemnantDefinition,
  freed: boolean,
): DebrisBodySpec {
  const tuning = debrisCollisionTuning(remnant.size);
  const { specs, primaryBoxes, renderBoxes } = primaryColliderSpecs(
    remnant,
    0.82,
    freed ? MAX_FREED_COLLIDERS : MAX_ATTACHED_REMNANT_COLLIDERS,
    freed ? DEBRIS_NORMAL : null,
  );
  return {
    colliders: [
      ...specs,
      ...detailColliderSpecs(remnant, renderBoxes, primaryBoxes),
    ],
    linearDamping: 0.16,
    angularDamping: 0.24,
    hardCcd: freed && tuning.hardCcd,
    softCcdPrediction: freed ? tuning.softCcdPrediction : 0,
    chunky: isChunky(remnant.size),
  };
}
