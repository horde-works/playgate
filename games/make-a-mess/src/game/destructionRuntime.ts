import { Euler, Quaternion, Vector3 } from "three";
import type {
  BreakableMaterial,
  BreakablePieceDefinition,
  BreakableShape,
  LandscapeSurfaceProfile,
  SurfaceTextureProfile,
  TreeVisualDefinition,
} from "./destructionScene";
import {
  applyVoxelDamage,
  createSolidVoxelBody,
  createVoxelBodyFromComponent,
  DEFAULT_MAX_VOXELS,
  splitVoxelComponents,
  type VoxelBody,
  type VoxelBox,
  type VoxelVector3,
} from "./voxelFracture.ts";
import {
  compileCustomVoxelGeometry,
  type CompiledCustomVoxelGeometry,
} from "./customVoxelization.ts";

export interface ShardDefinition {
  readonly id: string;
  readonly material: BreakableMaterial;
  readonly color: string;
  /** Display colour inherited from the intact ground batch. */
  readonly renderColor?: string;
  readonly textureProfile?: SurfaceTextureProfile;
  /** Authored exterior weathering retained while this fragment moves. */
  readonly weathering?: number;
  readonly landscapeSurface?: LandscapeSurfaceProfile;
  readonly treeVisual?: TreeVisualDefinition;
  /** Original authored member id keeps bark placement stable after re-fracture. */
  readonly treeVisualSourceId?: string;
  /** Round debris (pipe/boiler segments, wheels) keeps its round shape. */
  readonly shape?: BreakableShape;
  readonly size: readonly [number, number, number];
  readonly position: readonly [number, number, number];
  readonly quaternion: readonly [number, number, number, number];
  readonly linearVelocity: readonly [number, number, number];
  readonly angularVelocity: readonly [number, number, number];
  readonly voxelBody?: VoxelBody;
  readonly boxes?: readonly VoxelBox[];
  readonly volume?: number;
  /** Synthetic low-speed surface chips use predictive CCD, not shape casts. */
  readonly preferSoftCcd?: boolean;
}

export interface ShardSource {
  readonly id: string;
  readonly material: BreakableMaterial;
  readonly color: string;
  readonly renderColor?: string;
  readonly textureProfile?: SurfaceTextureProfile;
  readonly weathering?: number;
  readonly landscapeSurface?: LandscapeSurfaceProfile;
  readonly treeVisual?: TreeVisualDefinition;
  readonly treeVisualSourceId?: string;
  readonly shape?: BreakableShape;
  readonly size: readonly [number, number, number];
  readonly voxelBody?: VoxelBody;
  readonly boxes?: readonly VoxelBox[];
  readonly volume?: number;
}

export type FractureCause = "impact" | "blast" | "fall";
export type LandingDamage = "none" | "chip" | "shatter";

export interface RemnantDefinition {
  readonly id: string;
  readonly parentId: string;
  /**
   * Обрубок члена составного кластера остаётся ЧЛЕНОМ этого кластера:
   * его position/quaternion живут в авторской системе кластера, рендер и
   * контактная форма едут с телом кластера, а мирового Fixed-тела у него
   * нет, пока родитель не отломан.
   */
  readonly clusterId?: string;
  readonly material: BreakableMaterial;
  readonly color: string;
  readonly renderColor?: string;
  readonly textureProfile?: SurfaceTextureProfile;
  /** Authored exterior weathering retained after carving. */
  readonly weathering?: number;
  readonly landscapeSurface?: LandscapeSurfaceProfile;
  readonly treeVisual?: TreeVisualDefinition;
  readonly treeVisualSourceId?: string;
  readonly shape?: BreakableShape;
  readonly size: readonly [number, number, number];
  readonly position: readonly [number, number, number];
  readonly quaternion: readonly [number, number, number, number];
  readonly detached: boolean;
  readonly voxelBody?: VoxelBody;
  readonly boxes?: readonly VoxelBox[];
  readonly volume?: number;
}

export const BLAST_RADIUS = 3.25;
export const BLAST_PUSH_RADIUS = 5.8;
export const GRENADE_DAMAGE_ENERGY = 22;
const ROCKET_VOLUME_MULTIPLIER = 25;
const ROCKET_VOLUME_SCALE = Math.cbrt(ROCKET_VOLUME_MULTIPLIER);
export const ROCKET_BLAST_RADIUS = BLAST_RADIUS * ROCKET_VOLUME_SCALE;
export const ROCKET_BLAST_PUSH_RADIUS = BLAST_PUSH_RADIUS * ROCKET_VOLUME_SCALE;
export const ROCKET_DAMAGE_ENERGY = GRENADE_DAMAGE_ENERGY * ROCKET_VOLUME_MULTIPLIER;

/**
 * Подрывной заряд считается от игрового требования: бетон должен уступать
 * ему так же, как дерево уступает тяжёлой ракете. Бетон сопротивляется в
 * 2.4 / 0.72 = 3⅓ раза сильнее дерева — ровно во столько раз заряд несёт
 * больше энергии. Полуторный радиус даёт двум-трём зарядам общий объём
 * поражения размером с подъезд, а не несколько соседних ракетных кратеров.
 */
export const CHARGE_BLAST_RADIUS = ROCKET_BLAST_RADIUS * 1.5;
export const CHARGE_BLAST_PUSH_RADIUS = ROCKET_BLAST_PUSH_RADIUS * 1.45;
export const CHARGE_DAMAGE_ENERGY =
  ROCKET_DAMAGE_ENERGY * (2.4 / 0.72);

/**
 * ЛЁГКАЯ РАКЕТА («игла»): тонкий скоростной боеприпас против МАШИН.
 *
 * Тяжёлая ракета несёт 550 единиц на радиусе 9.5 м — она перебивает порог
 * стали (27.6) по всему габариту летящей машины везде, где есть прямая
 * видимость, и потому снимает силовую установку целиком. Это её честное
 * свойство, и оно остаётся: против стен и домов нужна именно такая.
 *
 * Игла считается от ЗАДАЧИ: снять по сумме тяги примерно один двигатель.
 * У кольцевого движителя тяга живёт в лопастях, лопасть тонкая и от любого
 * состоявшегося carve гибнет целиком, поэтому вся калибровка сводится к
 * дальности, на которой боеприпас ещё пробивает сталь:
 *
 *   E(d) = E0·(1 − d/R)^1.15 > 27.6
 *
 * ГЛАВНОЕ ТРЕБОВАНИЕ — НЕ ЗАДЕТЬ СОСЕДНЕЕ КОЛЬЦО. Машину роняет не сумма
 * снятой тяги, а ПОТЕРЯ СТОРОНЫ: два соседних кольца выводят центр масс за
 * выпуклую оболочку уцелевших точек тяги, и держать позу становится нечем
 * (потолок ровного подъёма падает с 0.68 до 0.34, вердикт — падение). Два
 * кольца НАПРОТИВ при той же потерянной тяге машина переживает спокойно.
 *
 * Кольца стоят в 2.15 м друг от друга, поэтому игла считается «проникающей»:
 *
 *   E(d) = 90·(1 − d/1.6)^1.15 > 27.6  ⇒  d < 1.02 м
 *
 * Радиус поражения стали вдвое меньше межкольцевого шага — попадание уносит
 * своё кольцо и физически не достаёт до соседнего. Сбить машину одним
 * выстрелом всё ещё можно, но для этого надо попасть между колец, а не
 * просто «в машину».
 */
export const LANCE_BLAST_RADIUS = 1.6;
export const LANCE_BLAST_PUSH_RADIUS = 2.4;
export const LANCE_DAMAGE_ENERGY = 90;

export const MAX_BLAST_RADIUS = Math.max(
  BLAST_RADIUS,
  ROCKET_BLAST_RADIUS,
  CHARGE_BLAST_RADIUS,
);

/**
 * Паспорт боеприпаса. Раньше все различия жили в двадцати шести ветках
 * `isRocket ? a : b`, и третий тип пришлось бы вписывать в каждую. Теперь
 * снаряд — это данные.
 */
export interface ExplosiveProfile {
  readonly kind: ExplosiveKind;
  readonly blastRadius: number;
  readonly blastPushRadius: number;
  readonly damageEnergy: number;
  /** Множитель реального вырезаемого радиуса после учёта материала. */
  readonly carveRadiusMultiplier: number;
  /** Импульс давления на составное тело, единицы силы·с. */
  readonly pressureImpulse: number;
  /**
   * Уровень хлопка на расстоянии 1 м, дБ — то, чем боеприпас слышен жителям.
   * Порядок выведен из полной энергии (плотность урона × куб радиуса взрыва),
   * а сами числа поджаты к физическому потолку неискажённой звуковой волны
   * (~194 дБ): выше него «уровень» перестаёт быть акустикой, а разница всё
   * равно неразличима — вся деревня и так выше порога рефлекса. Допущение.
   */
  readonly noiseLevel: number;
  /** Сколько направлений сэмплится для формы видимого облака. */
  readonly visualDirections: number;
  readonly visualProbeDistance: number;
  /** Бюджеты carve и синтетических чипов: цена кадра, не физика. */
  readonly carveBudget: {
    readonly maxTargets: number;
    readonly workBudget: number;
    readonly groundWorkBudget: number;
  };
  readonly chipBudget: number;
  /** Минимальная скорость разлёта свободного куска. */
  readonly looseBurstSpeed: number;
  /** Волна по телам: горизонталь, вертикаль и разгон обломка. */
  readonly playerPush: { readonly horizontal: number; readonly vertical: number };
  readonly debrisPush: { readonly base: number; readonly falloff: number };
  /** Снаряд как физическое тело. */
  readonly projectile: {
    readonly speed: number;
    readonly density: number;
    readonly gravityScale: number;
    readonly angularDamping: number;
    readonly fuseMs: number;
    readonly spin: { readonly x: number; readonly y: number; readonly z: number };
  };
}

export type ExplosiveKind = "grenade" | "rocket" | "lance" | "charge";

export const explosiveProfiles: Record<ExplosiveKind, ExplosiveProfile> = {
  grenade: {
    kind: "grenade",
    blastRadius: BLAST_RADIUS,
    blastPushRadius: BLAST_PUSH_RADIUS,
    damageEnergy: GRENADE_DAMAGE_ENERGY,
    carveRadiusMultiplier: 1,
    pressureImpulse: 55,
    noiseLevel: 170,
    visualDirections: 18,
    visualProbeDistance: 4.2,
    carveBudget: { maxTargets: 80, workBudget: 9_000, groundWorkBudget: 1_600 },
    chipBudget: 12,
    looseBurstSpeed: 3.5,
    playerPush: { horizontal: 6.4, vertical: 5.2 },
    debrisPush: { base: 5.2, falloff: 6.5 },
    projectile: {
      speed: 18,
      density: 2.2,
      gravityScale: 1,
      angularDamping: 0.35,
      fuseMs: 3500,
      spin: { x: 7, y: 3, z: 9 },
    },
  },
  rocket: {
    kind: "rocket",
    blastRadius: ROCKET_BLAST_RADIUS,
    blastPushRadius: ROCKET_BLAST_PUSH_RADIUS,
    damageEnergy: ROCKET_DAMAGE_ENERGY,
    carveRadiusMultiplier: 1,
    pressureImpulse: 110,
    noiseLevel: 182,
    visualDirections: 24,
    visualProbeDistance: 10,
    carveBudget: { maxTargets: 80, workBudget: 20_000, groundWorkBudget: 3_000 },
    chipBudget: 24,
    looseBurstSpeed: 7,
    playerPush: { horizontal: 9.4, vertical: 7.2 },
    debrisPush: { base: 7.8, falloff: 10.5 },
    projectile: {
      speed: 32,
      density: 3.4,
      gravityScale: 0,
      angularDamping: 0.95,
      fuseMs: 2600,
      spin: { x: 0, y: 0, z: 0 },
    },
  },
  lance: {
    kind: "lance",
    blastRadius: LANCE_BLAST_RADIUS,
    blastPushRadius: LANCE_BLAST_PUSH_RADIUS,
    damageEnergy: LANCE_DAMAGE_ENERGY,
    carveRadiusMultiplier: 1,
    // Лёгкая боевая часть толкает соразмерно: машину она качнёт, но не
    // отшвырнёт, и это заметная разница в поведении цели после попадания.
    pressureImpulse: 38,
    noiseLevel: 166,
    visualDirections: 16,
    visualProbeDistance: 3.4,
    carveBudget: { maxTargets: 48, workBudget: 7_000, groundWorkBudget: 1_200 },
    chipBudget: 10,
    looseBurstSpeed: 4.5,
    playerPush: { horizontal: 5.6, vertical: 4.4 },
    debrisPush: { base: 5.6, falloff: 7 },
    projectile: {
      // Вчетверо быстрее тяжёлой: тонкая игла и есть её главный признак.
      // На такой скорости упреждение по маневрирующей машине практически
      // не берётся — попадание решает наводка, а не предсказание манёвра.
      speed: 124,
      density: 1.6,
      gravityScale: 0,
      angularDamping: 0.9,
      fuseMs: 2200,
      spin: { x: 0, y: 0, z: 0 },
    },
  },
  charge: {
    kind: "charge",
    blastRadius: CHARGE_BLAST_RADIUS,
    blastPushRadius: CHARGE_BLAST_PUSH_RADIUS,
    damageEnergy: CHARGE_DAMAGE_ENERGY,
    carveRadiusMultiplier: 1.55,
    pressureImpulse: 300,
    noiseLevel: 190,
    visualDirections: 32,
    visualProbeDistance: 15,
    carveBudget: { maxTargets: 128, workBudget: 45_000, groundWorkBudget: 5_400 },
    chipBudget: 42,
    looseBurstSpeed: 12,
    playerPush: { horizontal: 14.5, vertical: 10.5 },
    debrisPush: { base: 12.5, falloff: 17 },
    // У заряда нет снаряда, но единый паспорт намеренно остаётся полным:
    // ни один потребитель профиля не обязан знать способ доставки взрывчатки.
    projectile: {
      speed: 1,
      density: 4.5,
      gravityScale: 1,
      angularDamping: 0.9,
      fuseMs: 0,
      spin: { x: 0, y: 0, z: 0 },
    },
  },
};

export function explosiveProfile(kind: ExplosiveKind): ExplosiveProfile {
  return explosiveProfiles[kind];
}
export const MAX_LIVE_SHARDS = 180;
export const MAX_LIVE_SHARD_BOXES = 900;
export const VOLUME_BREAK_FRACTION = 0.45;
export const MG_FIRE_INTERVAL = 0.11;
export const MG_RANGE = 70;

/**
 * Уровень выстрела на 1 м, дБ. Измерено: пик стрелкового оружия у стрелка
 * лежит в 155–165 дБ (NIOSH). Фронт почти отвесный — именно резкость, а не
 * громкость, вызывает рефлекс вздрагивания.
 */
export const GUNSHOT_NOISE_LEVEL = 160;
export const GUNSHOT_NOISE_RISE = 1;

export interface DebrisCollisionTuning {
  readonly hardCcd: boolean;
  readonly softCcdPrediction: number;
}

export interface DebrisColliderBox {
  readonly center: readonly [number, number, number];
  readonly size: readonly [number, number, number];
}

/**
 * Returns the occupied boxes not represented by the cheap debris-to-world
 * proxies. Those boxes still get actor-only colliders, so visible geometry
 * blocks players and projectiles without joining debris-to-debris contact.
 */
export function omittedDebrisColliderBoxes(
  boxes: readonly DebrisColliderBox[],
  primaryBoxes: readonly DebrisColliderBox[],
): readonly DebrisColliderBox[] {
  if (boxes.length <= primaryBoxes.length) {
    return [];
  }

  // Primary proxies are references selected from `boxes`. Consume matches so
  // repeated equal boxes remain distinct occupied cells.
  const remainingPrimary = [...primaryBoxes];
  return boxes.filter((box) => {
    const primaryIndex = remainingPrimary.indexOf(box);
    if (primaryIndex < 0) {
      return true;
    }
    remainingPrimary.splice(primaryIndex, 1);
    return false;
  });
}

/**
 * Full CCD shape-casts are reserved for genuinely small debris that could
 * cross a collider between fixed physics steps. Larger boards, slabs and wall
 * sections use Rapier's cheaper predictive constraints instead.
 */
export function debrisCollisionTuning(
  size: readonly [number, number, number],
  allowHardCcd = true,
): DebrisCollisionTuning {
  const volume = size[0] * size[1] * size[2];
  const largestExtent = Math.max(size[0], size[1], size[2]);
  const hardCcd =
    allowHardCcd && volume <= 0.025 && largestExtent <= 0.48;

  return {
    hardCcd,
    softCcdPrediction: hardCcd
      ? 0
      : Math.min(0.7, Math.max(0.24, largestExtent * 0.16)),
  };
}

/**
 * Keeps collision proxies inside actually occupied voxel boxes. Selecting the
 * largest boxes is intentionally conservative: omitted chips may overlap a
 * little, but empty holes never become invisible shelves that hold debris up.
 */
export function debrisColliderBoxes(
  size: readonly [number, number, number],
  boxes: readonly DebrisColliderBox[] | undefined,
  maximumBoxes = 3,
): readonly DebrisColliderBox[] {
  if (!boxes || boxes.length === 0) {
    return [{ center: [0, 0, 0], size }];
  }
  if (boxes.length <= maximumBoxes) {
    return boxes;
  }

  return boxes
    .map((box, index) => ({
      box,
      index,
      volume: box.size[0] * box.size[1] * box.size[2],
    }))
    .toSorted(
      (left, right) =>
        right.volume - left.volume || left.index - right.index,
    )
    .slice(0, Math.max(1, maximumBoxes))
    .map((entry) => entry.box);
}

export function debrisSleepSampleRequirement(
  energy: number,
  dynamicAgeMs: number,
  hasPhysicalContact: boolean,
): number | null {
  if (!hasPhysicalContact) {
    return null;
  }
  if (energy < 0.035) {
    return 3;
  }
  if (dynamicAgeMs > 4500 && energy < 0.28) {
    return 2;
  }
  return null;
}

export const bulletHoleRadius: Partial<Record<BreakableMaterial, number>> = {
  glass: 0.24,
  darkGlass: 0.22,
  brick: 0.19,
  stone: 0.18,
  basalt: 0.16,
  graphiteStone: 0.17,
  concrete: 0.18,
  plaster: 0.27,
  wood: 0.2,
  plastic: 0.22,
  cloth: 0.32,
  foliage: 0.34,
  grass: 0.3,
  soil: 0.3,
  earth: 0.26,
  asphalt: 0.24,
};

/**
 * Relative fracture energy, calibrated around ordinary dry construction wood.
 * These are not compressive-strength figures: they model how much delivered
 * energy the material absorbs before a comparable volume separates.
 */
export const fractureEnergyByMaterial: Record<
  BreakableMaterial,
  number
> = {
  glass: 0.18,
  darkGlass: 0.2,
  plaster: 0.38,
  wood: 0.72,
  plastic: 0.58,
  cloth: 0.14,
  foliage: 0.16,
  grass: 0.78,
  soil: 0.9,
  earth: 0.95,
  brick: 1.15,
  asphalt: 1.5,
  concrete: 2.4,
  stone: 2.8,
  graphiteStone: 3,
  basalt: 3.2,
  steel: 24,
  sheetMetal: 24,
};

/**
 * Radius is derived from energy because removed volume grows roughly with
 * radius cubed. Every weapon and every body state uses this same conversion.
 */
export const damageRadiusScaleByMaterial = Object.fromEntries(
  Object.entries(fractureEnergyByMaterial).map(([material, energy]) => [
    material,
    Math.cbrt(1 / energy),
  ]),
) as Record<BreakableMaterial, number>;

export function grenadeEnergyAtDistance(surfaceDistance: number): number {
  return blastEnergyAtDistance(
    surfaceDistance,
    BLAST_RADIUS,
    GRENADE_DAMAGE_ENERGY,
  );
}

export function rocketEnergyAtDistance(surfaceDistance: number): number {
  return blastEnergyAtDistance(
    surfaceDistance,
    ROCKET_BLAST_RADIUS,
    ROCKET_DAMAGE_ENERGY,
  );
}

export function blastEnergyAtDistance(
  surfaceDistance: number,
  radius: number,
  energy: number,
): number {
  if (surfaceDistance >= radius) {
    return 0;
  }
  const normalizedDistance = Math.max(
    0,
    surfaceDistance / radius,
  );
  return (
    energy *
    Math.pow(1 - normalizedDistance, 1.15)
  );
}

export const crumbleOnLanding: ReadonlySet<BreakableMaterial> = new Set([
  // Тонкая панель кузова — единственный «металл» в этом списке, и это не
  // послабление, а физика: лист в миллиметр мнётся на городских скоростях.
  // Силовой набор остаётся сталью и в списке не значится.
  "sheetMetal",
  "wood",
  "foliage",
  "brick",
  "stone",
  "basalt",
  "graphiteStone",
  "plaster",
  "concrete",
  "glass",
  "darkGlass",
  "grass",
  "asphalt",
  "earth",
]);

const landingDamageByMaterial: Partial<
  Record<
    BreakableMaterial,
    {
      readonly chipSpeed: number;
      readonly shatterSpeed: number;
      readonly minimumIntensity: number;
    }
  >
> = {
  glass: { chipSpeed: 2.2, shatterSpeed: 3.8, minimumIntensity: 0.12 },
  darkGlass: { chipSpeed: 2.4, shatterSpeed: 4, minimumIntensity: 0.12 },
  plaster: { chipSpeed: 3.2, shatterSpeed: 5.6, minimumIntensity: 0.14 },
  brick: { chipSpeed: 4.8, shatterSpeed: 7.6, minimumIntensity: 0.15 },
  wood: { chipSpeed: 3.8, shatterSpeed: 6.4, minimumIntensity: 0.11 },
  foliage: { chipSpeed: 1.8, shatterSpeed: 3.2, minimumIntensity: 0.08 },
  earth: { chipSpeed: 5.2, shatterSpeed: 8.2, minimumIntensity: 0.15 },
  grass: { chipSpeed: 4.8, shatterSpeed: 7.8, minimumIntensity: 0.14 },
  concrete: { chipSpeed: 6.8, shatterSpeed: 10.5, minimumIntensity: 0.16 },
  asphalt: { chipSpeed: 7.4, shatterSpeed: 11.5, minimumIntensity: 0.17 },
  stone: { chipSpeed: 8.2, shatterSpeed: 12.4, minimumIntensity: 0.18 },
  graphiteStone: {
    chipSpeed: 8.5,
    shatterSpeed: 12.8,
    minimumIntensity: 0.18,
  },
  basalt: { chipSpeed: 9, shatterSpeed: 13.5, minimumIntensity: 0.2 },
  /**
   * ТОНКАЯ ПАНЕЛЬ. Числа здесь — при РАВНЫХ массах, как и у всей таблицы, и
   * потому выглядят большими. Панель же почти всегда встречает то, что тяжелее
   * её в сотни раз, поэтому её преимущество в массе упирается в потолок 3, и
   * фактические пороги втрое ниже: заметная вмятина с 10 км/ч, оторванная
   * панель с 30 км/ч. Ровно так и мнётся настоящий кузов: бампер держит
   * 4 км/ч без следов, к 25 км/ч крыло уже сложено.
   */
  sheetMetal: { chipSpeed: 8.4, shatterSpeed: 25, minimumIntensity: 0.1 },
};

/**
 * ПРЕИМУЩЕСТВО В МАССЕ. Во сколько раз «выше по скорости» бьёт тот, кто
 * тяжелее судимого куска.
 *
 * Пороги этой таблицы откалиброваны по ПАДАЮЩЕМУ ОБЛОМКУ: кусок встречает
 * землю, и работу делает его собственный вес. Там ударивший и судимый — одно
 * тело, преимущества нет, число равно единице, и закон работает как прежде.
 *
 * Удар машины устроен иначе, и одной скоростью его не описать. Тонна железа и
 * упавшая доска на пяти метрах в секунду несут энергию, отличающуюся в
 * шестьдесят раз, и садовый стол про это знает: тяжёлый о лёгкое не тормозит,
 * он проходит насквозь. Поэтому скорость приводится к ЭНЕРГЕТИЧЕСКОМУ
 * ПАРИТЕТУ — какую скорость должно было бы иметь тело массы цели, чтобы
 * принести столько же энергии.
 *
 * Чистое `sqrt(m1/m2)` для этого не годится: у машины против травинки оно
 * уходит в десятки, и она крошила бы газон стоя на месте. Поэтому кривая
 * НАСЫЩАЕТСЯ: при равных массах ровно единица, дальше растёт всё медленнее и
 * упирается в потолок.
 *
 * Потолок и форма выбраны по трём известным случаям, и все три сходятся с
 * поведением настоящей машины (масса 1.33 против медианного куска города):
 *
 *   дерево  0.02 → преимущество 2.75 → ломается с  8 км/ч;
 *   кирпич  0.17 → преимущество 2.28 → ломается с 12 км/ч;
 *   бетон   0.65 → преимущество 1.60 → ломается с 24 км/ч.
 *
 * Это ровно то, чего ждёшь от машины: деревянное сносится с места, кладка —
 * с небольшого разбега, бетон требует хода.
 */
export const MASS_ADVANTAGE_CAP = 3;

export function landingMassAdvantage(
  strikerMass: number,
  targetMass: number,
): number {
  if (!(strikerMass > 0) || !(targetMass > 0) || strikerMass <= targetMass) {
    return 1;
  }
  const ratio = Math.sqrt(strikerMass / targetMass);
  return 1 + (MASS_ADVANTAGE_CAP - 1) * (1 - 1 / ratio);
}

export function classifyLandingDamage(
  material: BreakableMaterial,
  approachSpeed: number,
  intensity: number,
  /**
   * Преимущество ударившего в массе, из `landingMassAdvantage`. Единица —
   * падение куска на землю, и тогда закон работает ровно как прежде.
   */
  massAdvantage = 1,
): LandingDamage {
  const profile = landingDamageByMaterial[material];
  if (!profile || intensity < profile.minimumIntensity) {
    return "none";
  }
  const effectiveSpeed =
    approachSpeed * Math.min(MASS_ADVANTAGE_CAP, Math.max(1, massAdvantage));
  if (effectiveSpeed >= profile.shatterSpeed) {
    return "shatter";
  }
  if (effectiveSpeed >= profile.chipSpeed) {
    return "chip";
  }
  return "none";
}

// Ground materials never break away whole from a blast — they only crater.
export const groundMaterials: ReadonlySet<BreakableMaterial> = new Set([
  "soil",
  "earth",
  "asphalt",
  "grass",
]);

/**
 * Massive terrain must retain a remnant; the thin polder turf shell is
 * intentionally sacrificial and may disappear completely to expose earth.
 */
export function groundCarveRequiresRemnant(
  source: Pick<ShardSource, "landscapeSurface" | "material" | "size">,
): boolean {
  return groundMaterials.has(source.material) && !(
    source.landscapeSurface === "dutch-polder-ground" &&
    source.material === "grass" &&
    source.size[1] <= 0.5
  );
}

const MIN_REMNANT_VOXELS = 2;

const voxelSizeByMaterial: Record<BreakableMaterial, number> = {
  glass: 0.09,
  darkGlass: 0.09,
  plaster: 0.11,
  wood: 0.12,
  plastic: 0.12,
  cloth: 0.1,
  brick: 0.12,
  stone: 0.15,
  basalt: 0.16,
  graphiteStone: 0.15,
  concrete: 0.14,
  steel: 0.18,
  // Панель рвётся мельче бруска: у неё нет толщины, которую надо колоть.
  sheetMetal: 0.12,
  foliage: 0.2,
  grass: 0.18,
  soil: 0.18,
  earth: 0.16,
  asphalt: 0.16,
};

// Грунт — гигантские плиты (6×0.9×6): на полном бюджете каждая стоит как
// ~20 кирпичей за один carve. Кратер в земле прощает грубую сетку визуально,
// поэтому у грунта свой, маленький воксельный потолок.
const GROUND_CARVE_MAX_VOXELS = 1_200;

export function carveVoxelBudget(material: BreakableMaterial): number {
  return groundMaterials.has(material)
    ? GROUND_CARVE_MAX_VOXELS
    : DEFAULT_MAX_VOXELS;
}

/** Dormant custom damage data; callers decide when it becomes a live body. */
export function compilePieceDamageGeometry(
  piece: BreakablePieceDefinition,
): CompiledCustomVoxelGeometry | null {
  if (!piece.visualMesh && !piece.visualProfile) return null;
  return compileCustomVoxelGeometry(
    piece,
    voxelSizeByMaterial[piece.material],
    carveVoxelBudget(piece.material),
  );
}

/**
 * ПРЕДСТАВЛЕНИЕ МЕНЯЕТСЯ ТОЛЬКО ТОГДА, КОГДА ИЗМЕНИЛАСЬ ФОРМА.
 *
 * Воксельная решётка — честный носитель РАЗРУШЕНИЯ: расколотый кусок,
 * выбитая воронка, отвалившийся угол. Но пулевое отверстие формы не меняет:
 * оно меняет поверхность. Прежде любое попадание переводило кусок целиком —
 * авторская сетка корпуса превращалась в сотню коробок по 15 см от одной
 * пули, и дальше от неё уже нельзя было вернуться.
 *
 * Поэтому у повреждения два представления, и выбор между ними — не вкус, а
 * измеримый вопрос: осталась ли форма прежней. Четыре условия ниже отвечают
 * на него, и каждое закрывает свой случай.
 */
export const SUPERFICIAL_CARVE_RADIUS = 0.3;
/**
 * Изрешечённая панель перестаёт быть панелью: после этой доли снятого
 * материала кусок обязан перейти в воксели, даже если каждая отдельная дыра
 * была пулевой.
 */
export const SUPERFICIAL_CARVE_FRACTION = 0.12;

export interface SuperficialCarveQuery {
  readonly radius: number;
  readonly fragments: readonly ShardDefinition[];
  readonly sourceSize: readonly [number, number, number];
  /** Мировой центр куска в момент удара. */
  readonly sourceCenter: readonly [number, number, number];
  readonly removedVolume: number;
  /** Сколько материала этого куска уже снято прежними попаданиями. */
  readonly previouslyRemoved: number;
  readonly materialVolume: number;
  /** Допуск сравнения рамок — размер воксельной клетки куска. */
  readonly tolerance: number;
}

export function isSuperficialCarve(query: SuperficialCarveQuery): boolean {
  // Воронка размером с человека обязана быть настоящей дырой: сквозь неё
  // видно, в неё лезут, и рисовать её отметиной было бы обманом.
  if (query.radius > SUPERFICIAL_CARVE_RADIUS) {
    return false;
  }
  // Кусок раскололся — это уже другая форма, и не одна.
  if (query.fragments.length !== 1) {
    return false;
  }
  if (
    query.materialVolume <= 0 ||
    query.previouslyRemoved + query.removedVolume >
      query.materialVolume * SUPERFICIAL_CARVE_FRACTION
  ) {
    return false;
  }

  // Уцелевший материал обязан занимать ТУ ЖЕ рамку. Дыра, съевшая край,
  // сжимает габарит куска — снаружи это видно как обкусанная кромка, и
  // авторская сетка там уже врёт.
  const fragment = query.fragments[0];
  const tolerance = Math.max(1e-6, query.tolerance);
  for (const axis of [0, 1, 2] as const) {
    if (
      Math.abs(fragment.position[axis] - query.sourceCenter[axis]) > tolerance ||
      Math.abs(fragment.size[axis] - query.sourceSize[axis]) > tolerance
    ) {
      return false;
    }
  }
  return true;
}

/**
 * АВТОРСКИЙ ОБЪЁМ МАТЕРИАЛА КУСКА. Габарит — только запасной вариант, и для
 * куска с авторской сеткой он не годится: `volume` описывает толщину скорлупы
 * и составляет 0.5–3 % от bounding box (смок мельницы: 17.8 м³ материала в
 * габарите 1097 м³). Любой порог живучести берёт материал, а не воздух внутри.
 */
export function pieceMaterialVolume(
  piece: {
    readonly size: readonly [number, number, number];
    readonly volume?: number;
  },
): number {
  return piece.volume && piece.volume > 0
    ? piece.volume
    : piece.size[0] * piece.size[1] * piece.size[2];
}

/**
 * Приводит объём, посчитанный ядром carve, к авторскому объёму материала.
 *
 * У ядра ДВА соглашения, и путать их нельзя. Скомпилированная оболочка несёт
 * `volumeScale` (см. compileCustomVoxelGeometry), и тогда ядро отдаёт материал
 * САМО — ровно так же, как debrisBodyPool считает по нему плотность обломка.
 * У сплошной сетки шкалы нет, ядро отдаёт геометрию, и её нужно привести к
 * авторскому объёму: огрызок тонкой обшивки не весит как монолит стали того же
 * габарита, иначе корабль после дырки в борту тяжелеет.
 *
 * Домножение уже приведённого объёма занижало материал оболочки в десятки раз.
 */
export function carvedMaterialScale(
  source: Pick<ShardSource, "size" | "volume" | "voxelBody">,
): number {
  if (source.voxelBody?.volumeScale !== undefined) {
    return 1;
  }
  const bounding = source.size[0] * source.size[1] * source.size[2];
  const material = source.volume ?? bounding;
  return material > 0 && bounding > 1e-9
    ? Math.min(1, material / bounding)
    : 1;
}

/**
 * Оценка стоимости одного carve в «воксельных юнитах» — та же формула
 * сетки, что у createSolidVoxelBody (клампы по оси и по бюджету тела).
 * Кирпич ≈ десятки-сотни юнитов, бюджетный гигант ≈ carveVoxelBudget.
 */
export function carveWorkUnits(
  material: BreakableMaterial,
  size: readonly [number, number, number],
): number {
  const cell = voxelSizeByMaterial[material];
  const estimate =
    Math.max(1, Math.min(48, Math.round(size[0] / cell))) *
    Math.max(1, Math.min(48, Math.round(size[1] / cell))) *
    Math.max(1, Math.min(48, Math.round(size[2] / cell)));
  return Math.min(estimate, carveVoxelBudget(material));
}

export interface CarveWorkBudget {
  readonly maxTargets: number;
  /** Суммарная работа по НЕ-грунтовым целям. */
  readonly workBudget: number;
  /** Отдельный маленький срез для грунта — чтобы кратеры под ногами не
   * вытесняли из бюджета настоящие цели (они всегда ближе всех к взрыву). */
  readonly groundWorkBudget: number;
}

/**
 * Адаптивный отбор carve-целей взрыва. targets приходят отсортированными по
 * приоритету (расстоянию). В норме (кирпичи, панели) отбор совпадает со
 * старым `slice(0, maxTargets)`; деградация включается только когда в blast
 * попали дорогие гиганты. Грунт живёт на своём срезе бюджета и при переборе
 * просто пропускается — НЕ блокируя цели дальше по списку; перебор общего
 * бюджета останавливает отбор целиком (дальние цели ниже приоритетом).
 */
export function selectCarveTargetsWithinBudget<T>(
  targets: readonly T[],
  sourceOf: (target: T) => {
    readonly material: BreakableMaterial;
    readonly size: readonly [number, number, number];
  },
  budget: CarveWorkBudget,
): T[] {
  const selected: T[] = [];
  let workSpent = 0;
  let groundWorkSpent = 0;

  for (const target of targets) {
    if (selected.length >= budget.maxTargets) {
      break;
    }
    const source = sourceOf(target);
    const work = carveWorkUnits(source.material, source.size);
    if (groundMaterials.has(source.material)) {
      if (groundWorkSpent + work > budget.groundWorkBudget) {
        continue;
      }
      groundWorkSpent += work;
      selected.push(target);
      continue;
    }
    if (workSpent + work > budget.workBudget && selected.length > 0) {
      break;
    }
    workSpent += work;
    selected.push(target);
  }

  return selected;
}

const damageRoughnessByMaterial: Record<BreakableMaterial, number> = {
  glass: 0.42,
  darkGlass: 0.4,
  plaster: 0.34,
  wood: 0.18,
  plastic: 0.22,
  cloth: 0.36,
  brick: 0.3,
  stone: 0.26,
  basalt: 0.24,
  graphiteStone: 0.25,
  concrete: 0.27,
  steel: 0.12,
  sheetMetal: 0.12,
  foliage: 0.44,
  grass: 0.4,
  soil: 0.38,
  earth: 0.36,
  asphalt: 0.25,
};

interface RemnantSpec {
  readonly size: readonly [number, number, number];
  readonly localCenter: readonly [number, number, number];
  readonly voxelBody?: VoxelBody;
  readonly boxes?: readonly VoxelBox[];
  readonly volume: number;
  readonly shape?: BreakableShape;
}

export interface CarveResult {
  readonly kept: readonly RemnantSpec[];
  readonly removedVolume: number;
}

export interface CarveOptions {
  readonly material?: BreakableMaterial;
  readonly body?: VoxelBody;
  readonly direction?: VoxelVector3;
  readonly penetration?: number;
  readonly roughness?: number;
}

export interface DamageBodyState {
  readonly position: Vector3;
  readonly quaternion: Quaternion;
  readonly linearVelocity: Vector3;
  readonly angularVelocity: Vector3;
}

export interface DamageBodyRequest {
  readonly idPrefix: string;
  readonly worldPoint: Vector3;
  readonly radius: number;
  readonly burstSpeed: number;
  readonly direction?: Vector3;
  readonly penetration?: number;
  readonly roughness?: number;
}

export interface BodyDamageResult {
  readonly fragments: readonly ShardDefinition[];
  readonly removedVolume: number;
}

export type OccupiedGeometryBox = Pick<VoxelBox, "center" | "size">;

function closestPointOnLocalBox(
  point: Vector3,
  center: readonly [number, number, number],
  size: readonly [number, number, number],
  target: Vector3,
): Vector3 {
  return target.set(
    Math.max(
      center[0] - size[0] / 2,
      Math.min(center[0] + size[0] / 2, point.x),
    ),
    Math.max(
      center[1] - size[1] / 2,
      Math.min(center[1] + size[1] / 2, point.y),
    ),
    Math.max(
      center[2] - size[2] / 2,
      Math.min(center[2] + size[2] / 2, point.z),
    ),
  );
}

function segmentIntersectsLocalBox(
  start: Vector3,
  direction: Vector3,
  center: readonly [number, number, number],
  size: readonly [number, number, number],
  padding: number,
): boolean {
  let tMin = 0;
  let tMax = 1;

  for (let axis = 0; axis < 3; axis += 1) {
    const origin =
      axis === 0 ? start.x : axis === 1 ? start.y : start.z;
    const delta =
      axis === 0 ? direction.x : axis === 1 ? direction.y : direction.z;
    const halfSize = size[axis] / 2 + padding;
    const minimum = center[axis] - halfSize;
    const maximum = center[axis] + halfSize;

    if (Math.abs(delta) < 1e-5) {
      if (origin < minimum || origin > maximum) {
        return false;
      }
      continue;
    }

    const inverse = 1 / delta;
    let near = (minimum - origin) * inverse;
    let far = (maximum - origin) * inverse;
    if (near > far) {
      [near, far] = [far, near];
    }
    tMin = Math.max(tMin, near);
    tMax = Math.min(tMax, far);
    if (tMin > tMax) {
      return false;
    }
  }

  return tMax > 0.015 && tMin < 0.985;
}

export function closestPointOnOrientedBox(
  point: Vector3,
  position: Vector3,
  size: readonly [number, number, number],
  quaternion: Quaternion,
): Vector3 {
  const inverseRotation = quaternion.clone().invert();
  const local = point
    .clone()
    .sub(position)
    .applyQuaternion(inverseRotation);
  local.set(
    Math.max(-size[0] / 2, Math.min(size[0] / 2, local.x)),
    Math.max(-size[1] / 2, Math.min(size[1] / 2, local.y)),
    Math.max(-size[2] / 2, Math.min(size[2] / 2, local.z)),
  );
  return local.applyQuaternion(quaternion).add(position);
}

export function closestPointOnOccupiedGeometry(
  point: Vector3,
  position: Vector3,
  size: readonly [number, number, number],
  quaternion: Quaternion,
  boxes?: readonly OccupiedGeometryBox[],
): Vector3 {
  const inverseRotation = quaternion.clone().invert();
  const localPoint = point
    .clone()
    .sub(position)
    .applyQuaternion(inverseRotation);
  const closest = new Vector3();

  if (!boxes || boxes.length === 0) {
    return closestPointOnLocalBox(
      localPoint,
      [0, 0, 0],
      size,
      closest,
    )
      .applyQuaternion(quaternion)
      .add(position);
  }

  const candidate = new Vector3();
  let closestDistanceSquared = Number.POSITIVE_INFINITY;

  for (const box of boxes) {
    closestPointOnLocalBox(localPoint, box.center, box.size, candidate);
    const distanceSquared = candidate.distanceToSquared(localPoint);
    if (distanceSquared < closestDistanceSquared) {
      closestDistanceSquared = distanceSquared;
      closest.copy(candidate);
    }
  }

  return closest.applyQuaternion(quaternion).add(position);
}

export function segmentIntersectsOccupiedGeometry(
  start: Vector3,
  end: Vector3,
  position: Vector3,
  size: readonly [number, number, number],
  quaternion: Quaternion,
  boxes?: readonly OccupiedGeometryBox[],
  padding = 0,
): boolean {
  const inverseRotation = quaternion.clone().invert();
  const localStart = start
    .clone()
    .sub(position)
    .applyQuaternion(inverseRotation);
  const localEnd = end
    .clone()
    .sub(position)
    .applyQuaternion(inverseRotation);
  const direction = localEnd.sub(localStart);

  if (
    !segmentIntersectsLocalBox(
      localStart,
      direction,
      [0, 0, 0],
      size,
      padding,
    )
  ) {
    return false;
  }

  if (!boxes || boxes.length === 0) {
    return true;
  }

  return boxes.some((box) =>
    segmentIntersectsLocalBox(
      localStart,
      direction,
      box.center,
      box.size,
      padding,
    ),
  );
}

export function distanceToOrientedBox(
  point: Vector3,
  position: readonly [number, number, number],
  size: readonly [number, number, number],
  rotation?: readonly [number, number, number],
): number {
  const worldPosition = new Vector3(...position);
  const quaternion = rotation
    ? new Quaternion().setFromEuler(new Euler(...rotation))
    : new Quaternion();
  return point.distanceTo(
    closestPointOnOrientedBox(
      point,
      worldPosition,
      size,
      quaternion,
    ),
  );
}

export function blastNoise(value: string, salt: number): number {
  let hash = 2166136261 ^ salt;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return ((hash >>> 0) % 1000) / 1000;
}

export interface ShardRetentionPolicy {
  /**
   * Чем больше, тем дольше осколок живёт при переполнении бюджета. Позволяет
   * вытеснять сначала спящие и далёкие от игрока тела: FIFO выдёргивал
   * осколок из-под кучи прямо перед игроком, и дальний выстрел «шевелил»
   * давно улёгшиеся обломки.
   */
  readonly priority: (shard: ShardDefinition, index: number) => number;
  /** Столько самых свежих осколков не вытесняются вовсе (виден их вброс). */
  readonly protectedNewest?: number;
}

export function trimShardBudget(
  shards: readonly ShardDefinition[],
  maximumBodies = MAX_LIVE_SHARDS,
  maximumBoxes = MAX_LIVE_SHARD_BOXES,
  retention?: ShardRetentionPolicy,
): readonly ShardDefinition[] {
  if (!retention) {
    const kept: ShardDefinition[] = [];
    let boxCount = 0;

    for (let index = shards.length - 1; index >= 0; index -= 1) {
      if (kept.length >= maximumBodies) {
        break;
      }
      const shard = shards[index];
      const cost = Math.max(1, shard.boxes?.length ?? 1);
      if (boxCount + cost > maximumBoxes && kept.length > 0) {
        continue;
      }
      kept.push(shard);
      boxCount += cost;
    }

    return kept.reverse();
  }

  const totalBoxes = shards.reduce(
    (sum, shard) => sum + Math.max(1, shard.boxes?.length ?? 1),
    0,
  );
  if (shards.length <= maximumBodies && totalBoxes <= maximumBoxes) {
    return shards;
  }

  const protectedFrom = shards.length - (retention.protectedNewest ?? 0);
  const ranked = shards
    .map((shard, index) => ({
      shard,
      index,
      // Конечная константа: разность двух Infinity дала бы NaN в компараторе.
      priority: index >= protectedFrom
        ? Number.MAX_VALUE
        : retention.priority(shard, index),
    }))
    .sort((left, right) =>
      right.priority - left.priority || right.index - left.index);

  const keptIndices = new Set<number>();
  let bodyCount = 0;
  let boxCount = 0;
  for (const entry of ranked) {
    if (bodyCount >= maximumBodies) {
      break;
    }
    const cost = Math.max(1, entry.shard.boxes?.length ?? 1);
    if (boxCount + cost > maximumBoxes && bodyCount > 0) {
      continue;
    }
    keptIndices.add(entry.index);
    bodyCount += 1;
    boxCount += cost;
  }

  return shards.filter((_, index) => keptIndices.has(index));
}

export function carveBox(
  size: readonly [number, number, number],
  localPoint: Vector3,
  radius: number,
  salt: string,
  options: CarveOptions = {},
): CarveResult | null {
  return carveBoxCuts(
    size,
    [
      {
        point: localPoint,
        radius,
        salt,
        direction: options.direction,
        penetration: options.penetration,
        roughness: options.roughness,
      },
    ],
    options,
  );
}

interface BoxDamageCut {
  readonly point: Vector3;
  readonly radius: number;
  readonly salt: string;
  readonly direction?: VoxelVector3;
  readonly penetration?: number;
  readonly roughness?: number;
}

function carveBoxCuts(
  size: readonly [number, number, number],
  cuts: readonly BoxDamageCut[],
  options: CarveOptions = {},
): CarveResult | null {
  const material = options.material ?? "brick";
  let body =
    options.body ??
    createSolidVoxelBody(
      size,
      voxelSizeByMaterial[material],
      carveVoxelBudget(material),
    );
  // Binary voxels cannot represent a physically meaningful crater below
  // half of the authored material resolution. Keep that energy floor based
  // on the material grid (not a budget-coarsened giant body's cell size), so
  // direct hits still work on large bodies while weak hits cannot chip steel.
  let finalResult: ReturnType<typeof applyVoxelDamage> | null = null;
  let removedVolume = 0;
  for (const cut of cuts) {
    if (cut.radius < voxelSizeByMaterial[material] * 0.5) continue;
    const result = applyVoxelDamage(body, {
      point: [cut.point.x, cut.point.y, cut.point.z],
      radius: cut.radius,
      seed: cut.salt,
      roughness: cut.roughness ?? options.roughness ?? 0.26,
      direction: cut.direction ?? options.direction,
      penetration: cut.penetration ?? options.penetration,
    });
    if (result.removedVoxelCount === 0) continue;
    body = result.body;
    removedVolume += result.removedVolume;
    finalResult = result;
  }
  if (!finalResult) {
    return null;
  }

  const kept = finalResult.components
    .filter((component) => component.voxelCount >= MIN_REMNANT_VOXELS)
    .map((component): RemnantSpec => {
      const extracted = createVoxelBodyFromComponent(
        finalResult.body,
        component,
      );
      const localComponent = splitVoxelComponents(extracted.body)[0];
      return {
        size: extracted.body.size,
        localCenter: extracted.localCenter,
        voxelBody: extracted.body,
        boxes: localComponent?.boxes ?? [],
        volume: component.volume,
      };
    });

  return {
    kept,
    removedVolume,
  };
}

/**
 * The single material-damage contract used for attached, falling and settled
 * bodies. Motion is merely input state: it never changes which voxels break.
 */
/**
 * Round bodies fracture along their axis: a hit removes a band of the
 * cylinder and the remainder survives as SHORTER CYLINDERS, not as a box
 * soup. Pipes break into pipe segments, wheels stay wheels.
 */
function sliceCylinder(
  source: ShardSource,
  localPoint: Vector3,
  radius: number,
): CarveResult | null {
  const bodyRadius = Math.max(source.size[0], source.size[2]) / 2;
  const length = source.size[1];
  const cut = Math.min(
    length * 0.45,
    Math.max(bodyRadius * 0.55, radius),
  );
  const hitY = Math.max(-length / 2, Math.min(length / 2, localPoint.y));
  const removedStart = Math.max(-length / 2, hitY - cut);
  const removedEnd = Math.min(length / 2, hitY + cut);
  if (removedEnd <= removedStart) {
    return null;
  }

  const minimumSegment = Math.max(0.16, bodyRadius * 0.4);
  const kept: RemnantSpec[] = [];
  const crossSection = Math.PI * bodyRadius * bodyRadius;
  for (const [from, to] of [
    [-length / 2, removedStart],
    [removedEnd, length / 2],
  ] as const) {
    const segmentLength = to - from;
    if (segmentLength < minimumSegment) {
      continue;
    }
    kept.push({
      size: [source.size[0], segmentLength, source.size[2]],
      localCenter: [0, (from + to) / 2, 0],
      volume: crossSection * segmentLength,
      shape: "cylinder",
    });
  }

  return {
    kept,
    removedVolume: crossSection * (removedEnd - removedStart),
  };
}

/**
 * Timber has its own break law, distinct from the generic axial slice. A log
 * does not vaporise a clean band: it SNAPS. A narrow break at the impact point
 * leaves the two ends as chunky billets (shorter round logs), and the break
 * throws a burst of splinters — thin shards torn along the grain (the log's
 * long axis), so a struck beam reads as riven wood rather than a cut pipe.
 */
function sliceLog(
  source: ShardSource,
  localPoint: Vector3,
  radius: number,
): CarveResult | null {
  const bodyRadius = Math.max(source.size[0], source.size[2]) / 2;
  const length = source.size[1];
  // The snap is deliberately narrow — timber breaks, it does not dissolve.
  const cut = Math.min(length * 0.3, Math.max(bodyRadius * 0.5, radius * 0.8));
  const hitY = Math.max(-length / 2, Math.min(length / 2, localPoint.y));
  const removedStart = Math.max(-length / 2, hitY - cut);
  const removedEnd = Math.min(length / 2, hitY + cut);
  if (removedEnd <= removedStart) {
    return null;
  }

  const crossSection = Math.PI * bodyRadius * bodyRadius;
  const minimumBillet = Math.max(0.24, bodyRadius * 0.8);
  const kept: RemnantSpec[] = [];

  // End billets: the surviving stumps of the log, kept round.
  for (const [from, to] of [
    [-length / 2, removedStart],
    [removedEnd, length / 2],
  ] as const) {
    const segmentLength = to - from;
    if (segmentLength < minimumBillet) {
      continue;
    }
    kept.push({
      size: [source.size[0], segmentLength, source.size[2]],
      localCenter: [0, (from + to) / 2, 0],
      volume: crossSection * segmentLength,
      shape: "cylinder",
    });
  }

  // Splinters: short, chunky shards torn from the break, elongated along the
  // grain (the log's Y axis) and scattered around the broken cross-section.
  // A splinter is always SHORTER than the broken band, so it can never read as
  // a board longer than the log it came from.
  const breakBand = removedEnd - removedStart;
  const seed = `log:${Math.round(hitY * 97)}:${Math.round(bodyRadius * 53)}`;
  const splinterCount = 3 + Math.floor(blastNoise(seed, 2) * 3);
  for (let index = 0; index < splinterCount; index += 1) {
    const angle = (index / splinterCount) * Math.PI * 2 + blastNoise(seed, index) * 0.9;
    const ring = bodyRadius * (0.3 + blastNoise(seed, index + 11) * 0.55);
    const splinterLength = Math.min(
      breakBand * 0.85,
      bodyRadius * (0.9 + blastNoise(seed, index + 23) * 1.4),
    );
    const thickness = bodyRadius * (0.16 + blastNoise(seed, index + 37) * 0.22);
    const along = hitY + (blastNoise(seed, index + 51) - 0.5) * cut * 1.1;
    kept.push({
      size: [thickness, splinterLength, thickness * 0.7],
      localCenter: [
        Math.cos(angle) * ring * 0.7,
        Math.max(-length / 2, Math.min(length / 2, along)),
        Math.sin(angle) * ring * 0.7,
      ],
      volume: thickness * splinterLength * thickness * 0.7,
      shape: "plank",
    });
  }

  return {
    kept,
    // Timber loses little mass to the break — most becomes billets and
    // splinters — so only a fraction of the swept band is truly removed.
    removedVolume: crossSection * (removedEnd - removedStart) * 0.5,
  };
}

export function damageBody(
  source: ShardSource,
  state: DamageBodyState,
  request: DamageBodyRequest,
): BodyDamageResult | null {
  const inverseRotation = state.quaternion.clone().invert();
  const localPoint = request.worldPoint
    .clone()
    .sub(state.position)
    .applyQuaternion(inverseRotation);
  const localDirection = request.direction
    ?.clone()
    .applyQuaternion(inverseRotation)
    .normalize();
  const cylinderRadius =
    request.radius * damageRadiusScaleByMaterial[source.material];
  const result =
    source.shape === "cylinder"
      ? source.material === "wood"
        ? // Logs and timber follow the grain-splitting break law.
          sliceLog(source, localPoint, cylinderRadius)
        : sliceCylinder(source, localPoint, cylinderRadius)
      : carveBox(
          source.size,
          localPoint,
          request.radius * damageRadiusScaleByMaterial[source.material],
          request.idPrefix,
          {
            material: source.material,
            body: source.voxelBody,
            direction: localDirection
              ? [localDirection.x, localDirection.y, localDirection.z]
              : undefined,
            penetration: request.penetration,
            roughness:
              request.roughness ?? damageRoughnessByMaterial[source.material],
          },
        );
  if (!result) {
    return null;
  }

  return damageFragments(source, state, request, result);
}

/**
 * Applies several hits to one voxel snapshot and extracts connected remnants
 * once. This preserves topology (a row of bullets may cut a plank in two)
 * without publishing a new geometry/body graph for every round.
 */
export function damageBodyBatch(
  source: ShardSource,
  state: DamageBodyState,
  requests: readonly DamageBodyRequest[],
): BodyDamageResult | null {
  if (requests.length === 0) return null;
  if (requests.length === 1 || source.shape === "cylinder") {
    return damageBody(source, state, requests[requests.length - 1]);
  }
  const inverseRotation = state.quaternion.clone().invert();
  const cuts = requests.map((request) => {
    const localDirection = request.direction
      ?.clone()
      .applyQuaternion(inverseRotation)
      .normalize();
    return {
      point: request.worldPoint
        .clone()
        .sub(state.position)
        .applyQuaternion(inverseRotation),
      radius:
        request.radius * damageRadiusScaleByMaterial[source.material],
      salt: request.idPrefix,
      direction: localDirection
        ? ([localDirection.x, localDirection.y, localDirection.z] as const)
        : undefined,
      penetration: request.penetration,
      roughness:
        request.roughness ?? damageRoughnessByMaterial[source.material],
    };
  });
  const result = carveBoxCuts(source.size, cuts, {
    material: source.material,
    body: source.voxelBody,
  });
  if (!result) return null;
  return damageFragments(
    source,
    state,
    requests[requests.length - 1],
    result,
  );
}

function damageFragments(
  source: ShardSource,
  state: DamageBodyState,
  request: DamageBodyRequest,
  result: CarveResult,
): BodyDamageResult {

  const relative = new Vector3();
  const spinVelocity = new Vector3();
  const outward = new Vector3();
  const fragments = result.kept
    .slice(0, 14)
    .map((fragment, index): ShardDefinition => {
      const world = new Vector3(...fragment.localCenter)
        .applyQuaternion(state.quaternion)
        .add(state.position);
      relative.copy(world).sub(state.position);
      spinVelocity.copy(state.angularVelocity).cross(relative);
      outward.copy(world).sub(request.worldPoint);
      const distance = Math.max(0.12, outward.length());
      if (outward.lengthSq() < 1e-8) {
        outward.set(
          blastNoise(`${request.idPrefix}:${index}`, 3) - 0.5,
          0.45,
          blastNoise(`${request.idPrefix}:${index}`, 7) - 0.5,
        );
      }
      outward.normalize();

      const id = `${request.idPrefix}:${index}`;
      const noise = blastNoise(id, 11);
      const speed =
        (request.burstSpeed * (0.34 + noise * 0.46)) /
        (0.72 + distance);
      const tumble = 1.5 + noise * 4.5;
      return {
        id,
        material: source.material,
        color: source.color,
        renderColor: source.renderColor,
        textureProfile: source.textureProfile,
        weathering: source.weathering,
        landscapeSurface: source.landscapeSurface,
        treeVisual: source.treeVisual,
        treeVisualSourceId:
          source.treeVisualSourceId ?? (source.treeVisual ? source.id : undefined),
        shape: fragment.shape,
        size: fragment.size,
        voxelBody: fragment.voxelBody,
        boxes: fragment.boxes,
        volume: fragment.volume,
        position: [world.x, world.y, world.z],
        quaternion: [
          state.quaternion.x,
          state.quaternion.y,
          state.quaternion.z,
          state.quaternion.w,
        ],
        linearVelocity: [
          state.linearVelocity.x + spinVelocity.x + outward.x * speed,
          state.linearVelocity.y +
            spinVelocity.y +
            outward.y * speed +
            speed * 0.16,
          state.linearVelocity.z + spinVelocity.z + outward.z * speed,
        ],
        angularVelocity: [
          state.angularVelocity.x + (noise - 0.5) * tumble,
          state.angularVelocity.y +
            (blastNoise(id, 5) - 0.5) * tumble,
          state.angularVelocity.z +
            (blastNoise(id, 3) - 0.5) * tumble,
        ],
      };
    });

  return {
    fragments,
    removedVolume: result.removedVolume,
  };
}

export function impactDamageRadius(
  source: ShardSource,
  cause: FractureCause,
  strength: number,
): number {
  const body =
    source.voxelBody ??
    createSolidVoxelBody(
      source.size,
      voxelSizeByMaterial[source.material],
    );
  const orderedAxes = ([0, 1, 2] as const).toSorted(
    (left, right) => source.size[right] - source.size[left],
  );
  const crossSection = Math.max(
    body.cellSize[orderedAxes[1]],
    Math.min(source.size[orderedAxes[1]], source.size[orderedAxes[2]]),
  );
  const causeScale =
    cause === "blast" ? 0.06 : cause === "fall" ? 0.19 : 0.045;
  const materialScale = damageRadiusScaleByMaterial[source.material];
  const minimumRadius =
    Math.max(...body.cellSize) *
    0.72 *
    (cause === "fall" ? 1 / materialScale : 1);
  const maximumRadius =
    cause === "fall"
      ? (crossSection * 0.72) / materialScale
      : cause === "blast"
        ? 1.05
        : 0.72;
  return Math.max(
    minimumRadius,
    Math.min(maximumRadius, strength * causeScale),
  );
}

// Раскол, вернувший ЕДИНСТВЕННЫЙ фрагмент почти в полный объём — не раскол,
// а полноразмерная копия исходника: сфера урона не разорвала воксельную
// связность. Спавнить такую копию нельзя — со стороны это выглядит как
// «из плиты выпала такая же плита», и её можно бить вечно без убыли.
function isDegenerateShatter(result: BodyDamageResult | null): boolean {
  if (!result) {
    return true;
  }
  if (result.fragments.length !== 1) {
    return false;
  }
  const fragmentVolume = result.fragments[0].volume ?? 0;
  const totalVolume = fragmentVolume + result.removedVolume;
  return totalVolume <= 0 || fragmentVolume > totalVolume * 0.82;
}

export function buildShards(
  source: ShardSource,
  idPrefix: string,
  bodyPosition: Vector3,
  bodyQuaternion: Quaternion,
  baseLinearVelocity: Vector3,
  baseAngularVelocity: Vector3,
  burstCenter: Vector3,
  burstSpeed: number,
  cause: FractureCause = "impact",
): ShardDefinition[] | null {
  if (source.material === "soil") {
    return null;
  }
  const body =
    source.voxelBody ??
    createSolidVoxelBody(
      source.size,
      voxelSizeByMaterial[source.material],
    );
  const state = {
    position: bodyPosition,
    quaternion: bodyQuaternion,
    linearVelocity: baseLinearVelocity,
    angularVelocity: baseAngularVelocity,
  };
  const requestFor = (radius: number) => ({
    idPrefix,
    worldPoint: burstCenter,
    radius,
    burstSpeed,
    direction:
      cause === "fall"
        ? new Vector3(0, 1, 0).applyQuaternion(bodyQuaternion)
        : undefined,
    penetration: cause === "fall" ? source.size[1] : undefined,
  });

  let radius = impactDamageRadius(source, cause, burstSpeed);
  let result = damageBody({ ...source, voxelBody: body }, state, requestFor(radius));

  // Базовый радиус масштабируется от силы удара, а не от куска: на крупной
  // плите он выбивает лишь лунку, связность не рвётся и раскол вырождается
  // в копию. Дожимаем радиус к габариту куска, пока объём реально не
  // разделится (или пока не станет ясно, что кусок дальше не делится).
  const spans = [...source.size].toSorted((left, right) => right - left);
  const maximumRadius = spans[1] * 0.55;
  // Каждый повторный проход стоит O(вокселей): гигантским телам оставляем
  // одну дополнительную попытку, чтобы ретраи не умножали цену удара.
  const voxelCount =
    body.dimensions[0] * body.dimensions[1] * body.dimensions[2];
  const maximumAttempts = voxelCount > 2_500 ? 1 : 3;
  for (
    let attempt = 0;
    attempt < maximumAttempts &&
    isDegenerateShatter(result) &&
    radius < maximumRadius;
    attempt += 1
  ) {
    radius = Math.min(maximumRadius, radius * 1.9);
    result = damageBody({ ...source, voxelBody: body }, state, requestFor(radius));
  }

  // Так и не разделился (или раскрошился в ничто) — пусть вызыватель
  // отбрасывает кусок ЦЕЛЫМ, единым телом: никакой скрытой подмены копией.
  if (!result || result.fragments.length === 0 || isDegenerateShatter(result)) {
    return null;
  }
  return [...result.fragments];
}
