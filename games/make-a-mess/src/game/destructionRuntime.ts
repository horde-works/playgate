import { MathUtils, Quaternion, Vector3 } from "three";
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

function shardCellSize(material: BreakableMaterial): number {
  switch (material) {
    case "glass":
      return 0.34;
    case "wood":
      return 0.3;
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
): [number, number, number] | null {
  const cell = shardCellSize(material);
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

export function buildShards(
  source: ShardSource,
  idPrefix: string,
  bodyPosition: Vector3,
  bodyQuaternion: Quaternion,
  baseLinearVelocity: Vector3,
  baseAngularVelocity: Vector3,
  burstCenter: Vector3,
  burstSpeed: number,
): ShardDefinition[] | null {
  const counts = shardGridCounts(source.size, source.material);
  if (!counts) {
    return null;
  }

  const shards: ShardDefinition[] = [];
  const local = new Vector3();
  const world = new Vector3();
  const relative = new Vector3();
  const spinVelocity = new Vector3();
  const outward = new Vector3();
  const shardSize: [number, number, number] = [
    (source.size[0] / counts[0]) * 0.94,
    (source.size[1] / counts[1]) * 0.94,
    (source.size[2] / counts[2]) * 0.94,
  ];
  let index = 0;

  for (let ix = 0; ix < counts[0]; ix += 1) {
    for (let iy = 0; iy < counts[1]; iy += 1) {
      for (let iz = 0; iz < counts[2]; iz += 1) {
        local.set(
          ((ix + 0.5) / counts[0] - 0.5) * source.size[0],
          ((iy + 0.5) / counts[1] - 0.5) * source.size[1],
          ((iz + 0.5) / counts[2] - 0.5) * source.size[2],
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
          size: shardSize,
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
