import { Euler, Quaternion, Vector3 } from "three";
import type { BreakableMaterial, BreakableShape } from "./destructionScene";
import {
  applyVoxelDamage,
  createSolidVoxelBody,
  createVoxelBodyFromComponent,
  splitVoxelComponents,
  type VoxelBody,
  type VoxelBox,
  type VoxelVector3,
} from "./voxelFracture.ts";

export interface ShardDefinition {
  readonly id: string;
  readonly material: BreakableMaterial;
  readonly color: string;
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
}

export interface ShardSource {
  readonly id: string;
  readonly material: BreakableMaterial;
  readonly color: string;
  readonly shape?: BreakableShape;
  readonly size: readonly [number, number, number];
  readonly voxelBody?: VoxelBody;
}

export type FractureCause = "impact" | "blast" | "fall";
export type LandingDamage = "none" | "chip" | "shatter";

export interface RemnantDefinition {
  readonly id: string;
  readonly parentId: string;
  readonly material: BreakableMaterial;
  readonly color: string;
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
export const MAX_BLAST_RADIUS = Math.max(BLAST_RADIUS, ROCKET_BLAST_RADIUS);
export const MAX_LIVE_SHARDS = 180;
export const MAX_LIVE_SHARD_BOXES = 900;
export const VOLUME_BREAK_FRACTION = 0.45;
export const MG_FIRE_INTERVAL = 0.11;
export const MG_RANGE = 70;

export interface DebrisCollisionTuning {
  readonly hardCcd: boolean;
  readonly softCcdPrediction: number;
}

export interface DebrisColliderBox {
  readonly center: readonly [number, number, number];
  readonly size: readonly [number, number, number];
}

/**
 * Full CCD shape-casts are reserved for genuinely small debris that could
 * cross a collider between fixed physics steps. Larger boards, slabs and wall
 * sections use Rapier's cheaper predictive constraints instead.
 */
export function debrisCollisionTuning(
  size: readonly [number, number, number],
): DebrisCollisionTuning {
  const volume = size[0] * size[1] * size[2];
  const largestExtent = Math.max(size[0], size[1], size[2]);
  const hardCcd = volume <= 0.025 && largestExtent <= 0.48;

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
  "grass",
]);

const MIN_REMNANT_VOXELS = 2;

const voxelSizeByMaterial: Record<BreakableMaterial, number> = {
  glass: 0.09,
  darkGlass: 0.09,
  plaster: 0.11,
  wood: 0.12,
  brick: 0.12,
  stone: 0.15,
  basalt: 0.16,
  graphiteStone: 0.15,
  concrete: 0.14,
  steel: 0.18,
  foliage: 0.2,
  grass: 0.18,
  soil: 0.18,
  earth: 0.16,
  asphalt: 0.16,
};

const damageRoughnessByMaterial: Record<BreakableMaterial, number> = {
  glass: 0.42,
  darkGlass: 0.4,
  plaster: 0.34,
  wood: 0.18,
  brick: 0.3,
  stone: 0.26,
  basalt: 0.24,
  graphiteStone: 0.25,
  concrete: 0.27,
  steel: 0.12,
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

export function trimShardBudget(
  shards: readonly ShardDefinition[],
  maximumBodies = MAX_LIVE_SHARDS,
  maximumBoxes = MAX_LIVE_SHARD_BOXES,
): readonly ShardDefinition[] {
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

export function carveBox(
  size: readonly [number, number, number],
  localPoint: Vector3,
  radius: number,
  salt: string,
  options: CarveOptions = {},
): CarveResult | null {
  const material = options.material ?? "brick";
  const body =
    options.body ??
    createSolidVoxelBody(size, voxelSizeByMaterial[material]);
  const result = applyVoxelDamage(body, {
    point: [localPoint.x, localPoint.y, localPoint.z],
    radius,
    seed: salt,
    roughness: options.roughness ?? 0.26,
    direction: options.direction,
    penetration: options.penetration,
  });
  if (result.removedVoxelCount === 0) {
    return null;
  }

  const kept = result.components
    .filter((component) => component.voxelCount >= MIN_REMNANT_VOXELS)
    .map((component): RemnantSpec => {
      const extracted = createVoxelBodyFromComponent(result.body, component);
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
    removedVolume: result.removedVolume,
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
  const result =
    source.shape === "cylinder"
      ? sliceCylinder(
          source,
          localPoint,
          request.radius * damageRadiusScaleByMaterial[source.material],
        )
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
  const damageRadius = impactDamageRadius(source, cause, burstSpeed);
  const result = damageBody(
    { ...source, voxelBody: body },
    {
      position: bodyPosition,
      quaternion: bodyQuaternion,
      linearVelocity: baseLinearVelocity,
      angularVelocity: baseAngularVelocity,
    },
    {
      idPrefix,
      worldPoint: burstCenter,
      radius: damageRadius,
      burstSpeed,
      direction:
        cause === "fall"
          ? new Vector3(0, 1, 0).applyQuaternion(bodyQuaternion)
          : undefined,
      penetration: cause === "fall" ? source.size[1] : undefined,
    },
  );
  if (!result) {
    return null;
  }
  return [...result.fragments];
}
