import { Euler, MathUtils, Quaternion, Vector3 } from "three";
import type { BreakableMaterial } from "./destructionScene";

export interface ShardDefinition {
  readonly id: string;
  readonly material: BreakableMaterial;
  readonly color: string;
  readonly size: readonly [number, number, number];
  readonly position: readonly [number, number, number];
  readonly quaternion: readonly [number, number, number, number];
  readonly linearVelocity: readonly [number, number, number];
  readonly angularVelocity: readonly [number, number, number];
}

export interface ShardSource {
  readonly id: string;
  readonly material: BreakableMaterial;
  readonly color: string;
  readonly size: readonly [number, number, number];
}

export type FractureCause = "impact" | "blast" | "fall";
export type LandingDamage = "none" | "chip" | "shatter";

export interface RemnantDefinition {
  readonly id: string;
  readonly parentId: string;
  readonly material: BreakableMaterial;
  readonly color: string;
  readonly size: readonly [number, number, number];
  readonly position: readonly [number, number, number];
  readonly quaternion: readonly [number, number, number, number];
  readonly detached: boolean;
}

export const BLAST_RADIUS = 2.35;
export const BLAST_PUSH_RADIUS = 4.4;
export const MAX_LIVE_SHARDS = 240;
export const VOLUME_BREAK_FRACTION = 0.45;
export const MG_FIRE_INTERVAL = 0.11;
export const MG_RANGE = 70;

export const blastFactorByMaterial: Record<BreakableMaterial, number> = {
  glass: 1.5,
  plaster: 1.3,
  wood: 1.05,
  brick: 0.9,
  stone: 0.75,
  concrete: 0.75,
  steel: 0.6,
  soil: 0.45,
  earth: 0.5,
  asphalt: 0.6,
};

export const bulletHoleRadius: Partial<Record<BreakableMaterial, number>> = {
  brick: 0.19,
  stone: 0.18,
  concrete: 0.18,
  plaster: 0.27,
  wood: 0.2,
  soil: 0.3,
  earth: 0.26,
  asphalt: 0.24,
};

export const crumbleOnLanding: ReadonlySet<BreakableMaterial> = new Set([
  "brick",
  "stone",
  "plaster",
  "concrete",
  "glass",
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
  plaster: { chipSpeed: 3.2, shatterSpeed: 5.6, minimumIntensity: 0.14 },
  brick: { chipSpeed: 4.8, shatterSpeed: 7.6, minimumIntensity: 0.15 },
  earth: { chipSpeed: 5.2, shatterSpeed: 8.2, minimumIntensity: 0.15 },
  concrete: { chipSpeed: 6.8, shatterSpeed: 10.5, minimumIntensity: 0.16 },
  asphalt: { chipSpeed: 7.4, shatterSpeed: 11.5, minimumIntensity: 0.17 },
  stone: { chipSpeed: 8.2, shatterSpeed: 12.4, minimumIntensity: 0.18 },
};

export function classifyLandingDamage(
  material: BreakableMaterial,
  approachSpeed: number,
  intensity: number,
): LandingDamage {
  const profile = landingDamageByMaterial[material];
  if (!profile || intensity < profile.minimumIntensity) {
    return "none";
  }
  if (approachSpeed >= profile.shatterSpeed) {
    return "shatter";
  }
  if (approachSpeed >= profile.chipSpeed) {
    return "chip";
  }
  return "none";
}

// Ground materials never break away whole from a blast — they only crater.
export const groundMaterials: ReadonlySet<BreakableMaterial> = new Set([
  "soil",
  "earth",
  "asphalt",
]);

const MAX_SHARDS_PER_PIECE = 12;
const MIN_SHARD_SIDE = 0.07;
const MIN_REMNANT_SIDE = 0.05;

interface RemnantSpec {
  readonly size: readonly [number, number, number];
  readonly localCenter: readonly [number, number, number];
}

export interface CarveResult {
  readonly kept: readonly RemnantSpec[];
  readonly removedVolume: number;
}

export function distanceToOrientedBox(
  point: Vector3,
  position: readonly [number, number, number],
  size: readonly [number, number, number],
  rotation?: readonly [number, number, number],
): number {
  const local = point.clone().sub(new Vector3(...position));
  if (rotation) {
    local.applyQuaternion(
      new Quaternion().setFromEuler(new Euler(...rotation)).invert(),
    );
  }

  const dx = Math.max(0, Math.abs(local.x) - size[0] / 2);
  const dy = Math.max(0, Math.abs(local.y) - size[1] / 2);
  const dz = Math.max(0, Math.abs(local.z) - size[2] / 2);
  return Math.hypot(dx, dy, dz);
}

export function blastNoise(value: string, salt: number): number {
  let hash = 2166136261 ^ salt;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return ((hash >>> 0) % 1000) / 1000;
}

export function carveBox(
  size: readonly [number, number, number],
  localPoint: Vector3,
  radius: number,
  salt: string,
): CarveResult | null {
  const point = [localPoint.x, localPoint.y, localPoint.z];
  const holeMin: number[] = [];
  const holeMax: number[] = [];

  for (let axis = 0; axis < 3; axis += 1) {
    const half = radius * (0.8 + blastNoise(`${salt}:${axis}`, 29) * 0.35);
    const low = Math.max(-size[axis] / 2, point[axis] - half);
    const high = Math.min(size[axis] / 2, point[axis] + half);
    if (high - low < 0.015) {
      return null;
    }
    holeMin.push(low);
    holeMax.push(high);
  }

  const kept: RemnantSpec[] = [];
  const pushBox = (minimum: readonly number[], maximum: readonly number[]) => {
    const dimensions = [
      maximum[0] - minimum[0],
      maximum[1] - minimum[1],
      maximum[2] - minimum[2],
    ];
    if (
      dimensions[0] < MIN_REMNANT_SIDE ||
      dimensions[1] < MIN_REMNANT_SIDE ||
      dimensions[2] < MIN_REMNANT_SIDE
    ) {
      return;
    }
    kept.push({
      size: [dimensions[0], dimensions[1], dimensions[2]],
      localCenter: [
        (minimum[0] + maximum[0]) / 2,
        (minimum[1] + maximum[1]) / 2,
        (minimum[2] + maximum[2]) / 2,
      ],
    });
  };

  const boxMin = [-size[0] / 2, -size[1] / 2, -size[2] / 2];
  const boxMax = [size[0] / 2, size[1] / 2, size[2] / 2];
  pushBox(boxMin, [holeMin[0], boxMax[1], boxMax[2]]);
  pushBox([holeMax[0], boxMin[1], boxMin[2]], boxMax);
  pushBox(
    [holeMin[0], boxMin[1], boxMin[2]],
    [holeMax[0], holeMin[1], boxMax[2]],
  );
  pushBox(
    [holeMin[0], holeMax[1], boxMin[2]],
    [holeMax[0], boxMax[1], boxMax[2]],
  );
  pushBox(
    [holeMin[0], holeMin[1], boxMin[2]],
    [holeMax[0], holeMax[1], holeMin[2]],
  );
  pushBox(
    [holeMin[0], holeMin[1], holeMax[2]],
    [holeMax[0], holeMax[1], boxMax[2]],
  );

  const total = size[0] * size[1] * size[2];
  const keptVolume = kept.reduce(
    (sum, box) => sum + box.size[0] * box.size[1] * box.size[2],
    0,
  );

  return { kept, removedVolume: total - keptVolume };
}

function shardCellSize(
  material: BreakableMaterial,
  cause: FractureCause,
): number {
  switch (material) {
    case "glass":
      return 0.34;
    case "wood":
      return 0.3;
    case "concrete":
      // A fallen concrete block cracks into a few heavy pieces rather than
      // turning into gravel on the first hard landing.
      return cause === "fall" ? 0.44 : 0.21;
    case "steel":
      return 0.5;
    case "soil":
      return Number.POSITIVE_INFINITY;
    default:
      return 0.21;
  }
}

function shardGridCounts(
  size: readonly [number, number, number],
  material: BreakableMaterial,
  cause: FractureCause,
): [number, number, number] | null {
  const cell = shardCellSize(material, cause);
  if (!Number.isFinite(cell)) {
    return null;
  }

  const counts = [0, 1, 2].map((axis) => {
    let count = MathUtils.clamp(Math.round(size[axis] / cell), 1, 6);
    while (count > 1 && size[axis] / count < MIN_SHARD_SIDE) {
      count -= 1;
    }
    return count;
  }) as [number, number, number];

  while (counts[0] * counts[1] * counts[2] > MAX_SHARDS_PER_PIECE) {
    const largestAxis = counts.indexOf(Math.max(...counts)) as 0 | 1 | 2;
    counts[largestAxis] -= 1;
  }

  if (counts[0] * counts[1] * counts[2] < 2) {
    return null;
  }

  return counts;
}

interface ShardSlice {
  readonly center: number;
  readonly size: number;
}

function uniformSlices(length: number, count: number): ShardSlice[] {
  return Array.from({ length: count }, (_, index) => ({
    center: ((index + 0.5) / count - 0.5) * length,
    size: length / count,
  }));
}

function localizedWoodSlices(
  length: number,
  impactCoordinate: number,
  crossSection: number,
): ShardSlice[] {
  const half = length / 2;
  const minimumEnd = Math.min(0.12, length / 5);
  const damageHalf = MathUtils.clamp(
    Math.max(crossSection * 0.55, length * 0.035),
    minimumEnd,
    Math.min(0.38, length * 0.16),
  );
  const impact = MathUtils.clamp(
    impactCoordinate,
    -half + damageHalf + minimumEnd,
    half - damageHalf - minimumEnd,
  );
  const boundaries = [
    -half,
    impact - damageHalf,
    impact,
    impact + damageHalf,
    half,
  ];

  return boundaries.slice(0, -1).map((start, index) => {
    const end = boundaries[index + 1];
    return {
      center: (start + end) / 2,
      size: end - start,
    };
  });
}

export function isElongatedWood(source: ShardSource): boolean {
  if (source.material !== "wood") {
    return false;
  }
  const orderedSides = [...source.size].sort((left, right) => right - left);
  return (
    orderedSides[0] >= 0.8 &&
    orderedSides[0] / Math.max(0.01, orderedSides[1]) >= 2.2
  );
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
  const counts = shardGridCounts(source.size, source.material, cause);
  if (!counts) {
    return null;
  }

  const localImpact = burstCenter
    .clone()
    .sub(bodyPosition)
    .applyQuaternion(bodyQuaternion.clone().invert());
  const orderedAxes = ([0, 1, 2] as const).sort(
    (left, right) => source.size[right] - source.size[left],
  );
  const longestAxis = orderedAxes[0];
  const secondLongest = source.size[orderedAxes[1]];
  const localizeWoodBlast =
    cause === "blast" && isElongatedWood(source);
  const impactCoordinates = [localImpact.x, localImpact.y, localImpact.z];
  const slices = ([0, 1, 2] as const).map((axis) => {
    if (localizeWoodBlast) {
      return axis === longestAxis
        ? localizedWoodSlices(
            source.size[axis],
            impactCoordinates[axis],
            secondLongest,
          )
        : uniformSlices(source.size[axis], 1);
    }
    return uniformSlices(source.size[axis], counts[axis]);
  });

  const shards: ShardDefinition[] = [];
  const local = new Vector3();
  const world = new Vector3();
  const relative = new Vector3();
  const spinVelocity = new Vector3();
  const outward = new Vector3();
  const shrink = localizeWoodBlast ? 0.975 : 0.94;
  let index = 0;

  for (let ix = 0; ix < slices[0].length; ix += 1) {
    for (let iy = 0; iy < slices[1].length; iy += 1) {
      for (let iz = 0; iz < slices[2].length; iz += 1) {
        const cell = [slices[0][ix], slices[1][iy], slices[2][iz]] as const;
        local.set(
          cell[0].center,
          cell[1].center,
          cell[2].center,
        );
        world.copy(local).applyQuaternion(bodyQuaternion).add(bodyPosition);
        relative.copy(world).sub(bodyPosition);
        spinVelocity.copy(baseAngularVelocity).cross(relative);
        outward.copy(world).sub(burstCenter);
        const distance = Math.max(0.14, outward.length());
        outward.normalize();

        const id = `${idPrefix}:${index}`;
        const noise = blastNoise(id, 11);
        const speed = (burstSpeed * (0.5 + noise * 0.7)) / (0.7 + distance);
        const tumble = 2.5 + noise * 7;

        shards.push({
          id,
          material: source.material,
          color: source.color,
          size: [
            cell[0].size * shrink,
            cell[1].size * shrink,
            cell[2].size * shrink,
          ],
          position: [world.x, world.y, world.z],
          quaternion: [
            bodyQuaternion.x,
            bodyQuaternion.y,
            bodyQuaternion.z,
            bodyQuaternion.w,
          ],
          linearVelocity: [
            baseLinearVelocity.x + spinVelocity.x + outward.x * speed,
            baseLinearVelocity.y +
              spinVelocity.y +
              outward.y * speed +
              speed * 0.22,
            baseLinearVelocity.z + spinVelocity.z + outward.z * speed,
          ],
          angularVelocity: [
            baseAngularVelocity.x + (noise - 0.5) * tumble,
            baseAngularVelocity.y + (blastNoise(id, 5) - 0.5) * tumble,
            baseAngularVelocity.z + (blastNoise(id, 3) - 0.5) * tumble,
          ],
        });
        index += 1;
      }
    }
  }

  return shards;
}
