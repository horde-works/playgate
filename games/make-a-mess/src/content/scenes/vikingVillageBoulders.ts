import type { BoulderArchetype } from "../objects/kallur/kallurBoulderKitObject.ts";
import type { NaturalBoulderPlacement } from "../../game/NaturalBoulders.tsx";
import { vikingVillageHomes } from "./vikingVillagePlan.ts";
import {
  vikingGroundTopAt,
  vikingTrafficWearAt,
} from "./vikingVillageLandscape.ts";

const normalize = (
  vector: readonly [number, number, number],
): readonly [number, number, number] => {
  const length = Math.hypot(...vector) || 1;
  return [vector[0] / length, vector[1] / length, vector[2] / length];
};

/**
 * Village rock is old glacial fieldstone and banded gneiss: lower, rounder
 * and paler than Kallur's young basalt. The shared generator is the method;
 * these forms are deliberately another geological family.
 */
export const VIKING_BOULDER_ARCHETYPES = [
  {
    id: "glacial-back",
    label: "Glacially rounded back",
    scale: [0.64, 0.34, 0.52],
    noise: 0.12,
    seed: 107,
    clamps: [{ direction: [0, -1, 0], distance: 0.29 }],
  },
  {
    id: "gneiss-slab",
    label: "Low banded slab",
    scale: [0.74, 0.25, 0.54],
    noise: 0.1,
    seed: 131,
    clamps: [
      { direction: [0, 1, 0], distance: 0.21 },
      { direction: [0, -1, 0], distance: 0.2 },
      { direction: normalize([0.17, 0.04, 0.98]), distance: 0.49 },
    ],
  },
  {
    id: "weathered-split",
    label: "Weathered split erratic",
    scale: [0.56, 0.44, 0.49],
    noise: 0.11,
    seed: 163,
    clamps: [
      { direction: normalize([0.91, 0.08, 0.4]), distance: 0.34 },
      { direction: [0, -1, 0], distance: 0.4 },
    ],
  },
  {
    id: "buried-loaf",
    label: "Deep-set fieldstone",
    scale: [0.56, 0.29, 0.46],
    noise: 0.15,
    seed: 197,
    clamps: [{ direction: [0, -1, 0], distance: 0.25 }],
  },
] as const satisfies readonly BoulderArchetype[];

export const VIKING_BOULDER_BODY_COLOUR = "#686a63";

export interface VikingBoulderPlacement extends NaturalBoulderPlacement {
  readonly colliderSize: readonly [number, number, number];
}

const WORLD_CENTER_Z = -10;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const PATH_STONE_CLUSTERS = [
  { id: "north-spine", center: [0, 31], radius: 9, count: 6 },
  { id: "well-shoulder", center: [-15, 14], radius: 9, count: 8 },
  { id: "commons-bend", center: [-17, 3], radius: 9, count: 6 },
  { id: "south-junction", center: [14, -28], radius: 9, count: 7 },
  { id: "fisher-bend", center: [-8, -36], radius: 9, count: 7 },
  { id: "south-approach", center: [-3, -60], radius: 9, count: 6 },
] as const;

function noise(a: number, b: number, salt = 0): number {
  const value = Math.sin(a * 91.17 + b * 47.71 + salt * 19.13) * 43758.5453;
  return value - Math.floor(value);
}

function distanceToNorthernApproach(x: number, z: number): number {
  const windingCenter = Math.sin((z + 8) * 0.105) * 2.6;
  return Math.abs(x - windingCenter);
}

function terrainTileExists(x: number, z: number): boolean {
  const tileX = Math.round(x / 4) * 4;
  const tileZ = WORLD_CENTER_Z + Math.round((z - WORLD_CENTER_Z) / 4) * 4;
  if (tileX < -96 || tileX > 96) return false;
  const radius = Math.hypot(tileX, tileZ - WORLD_CENTER_Z);
  const edge = 92
    + (noise(tileX, tileZ, 4) - 0.5) * 8
    + Math.sin(tileZ * 0.075) * 2.4;
  return radius <= edge - 2;
}

function clearsAuthoredBuildings(x: number, z: number): boolean {
  // The hall is not part of the reusable home list.
  if (Math.abs(x) < 9.2 && Math.abs(z + 17) < 10.8) return false;
  for (const home of vikingVillageHomes) {
    const dx = x - home.position[0];
    const dz = z - home.position[1];
    const cosine = Math.cos(home.yaw);
    const sine = Math.sin(home.yaw);
    const localX = dx * cosine - dz * sine;
    const localZ = dx * sine + dz * cosine;
    if (
      Math.abs(localX) < home.width / 2 + 1.35
      && Math.abs(localZ) < home.length / 2 + 1.35
    ) {
      return false;
    }
  }
  return true;
}

function nearestDistance(
  x: number,
  z: number,
  placements: readonly VikingBoulderPlacement[],
): number {
  let nearest = Number.POSITIVE_INFINITY;
  for (const placement of placements) {
    nearest = Math.min(
      nearest,
      Math.hypot(x - placement.position[0], z - placement.position[2]),
    );
  }
  return nearest;
}

/**
 * Find the loose shoulder outside a walked strip. The probe radius changes
 * from stone to stone, so this describes a broad, ragged margin rather than
 * tracing either edge of the wear mask as a decorative border.
 */
function pathShoulderAt(
  x: number,
  z: number,
  index: number,
): { readonly wear: number; readonly nearbyWear: number } {
  const wear = vikingTrafficWearAt(x, z);
  const probe = 1.05 + noise(index, 137, 101) * 1.55;
  const turn = noise(index, 139, 103) * 0.35;
  let nearbyWear = 0;
  for (let direction = 0; direction < 10; direction += 1) {
    const angle = turn + direction * Math.PI * 0.2;
    nearbyWear = Math.max(
      nearbyWear,
      vikingTrafficWearAt(
        x + Math.cos(angle) * probe,
        z + Math.sin(angle) * probe,
      ),
    );
  }
  return { wear, nearbyWear };
}

let cached: readonly VikingBoulderPlacement[] | null = null;

/** Sparse peripheral erratics; grit and little stones belong to the ground. */
export function vikingBoulderPlacements(): readonly VikingBoulderPlacement[] {
  if (cached) return cached;
  const placements: VikingBoulderPlacement[] = [];
  const archetypes = VIKING_BOULDER_ARCHETYPES.map((entry) => entry.id);
  for (let index = 0; index < 58; index += 1) {
    const angle = index * GOLDEN_ANGLE + (noise(index, 7, 3) - 0.5) * 0.36;
    const radius = 62 + noise(index, 13, 5) * 25;
    const x = Math.cos(angle) * radius;
    const z = WORLD_CENTER_Z + Math.sin(angle) * radius;
    if (!terrainTileExists(x, z)) continue;
    if (z > 32 && distanceToNorthernApproach(x, z) < 8.5) continue;

    const size = 0.72 + noise(index, 2, 11) * 1.38;
    const crownHeight = 0.42 + noise(index, 17, 13) * 0.92;
    const stretch = 0.76 + noise(index, 29, 17) * 0.34;
    const tone = noise(index, 19, 23);
    const target = tone > 0.72
      ? [0x83, 0x82, 0x77]
      : tone > 0.32
        ? [0x6e, 0x70, 0x68]
        : [0x58, 0x5d, 0x58];
    placements.push({
      id: `viking-erratic:${index}`,
      archetype: archetypes[Math.floor(noise(index, 31, 29) * archetypes.length)],
      position: [x, vikingGroundTopAt(x, z) - crownHeight * 0.08, z],
      rotation: [
        (noise(index, 37, 31) - 0.5) * 0.22,
        noise(index, 41, 37) * Math.PI * 2,
        (noise(index, 43, 41) - 0.5) * 0.18,
      ],
      scale: [size, crownHeight * 1.72, size * stretch],
      tint: [target[0] / 0x68, target[1] / 0x6a, target[2] / 0x63],
      colliderSize: [size * 0.96, crownHeight, size * stretch * 0.92],
    });
  }

  const fieldstones: VikingBoulderPlacement[] = [];
  const addFieldstone = (
    id: string,
    x: number,
    z: number,
    size: number,
    crownHeight: number,
    stretch: number,
    seed: number,
    burial: number,
  ): void => {
    const tone = noise(seed, 103, 73);
    const target = tone > 0.68
      ? [0x84, 0x83, 0x78]
      : tone > 0.26
        ? [0x6c, 0x70, 0x68]
        : [0x56, 0x5b, 0x55];
    fieldstones.push({
      id,
      archetype: archetypes[Math.floor(noise(seed, 107, 79) * archetypes.length)],
      position: [x, vikingGroundTopAt(x, z) - crownHeight * burial, z],
      rotation: [
        (noise(seed, 109, 83) - 0.5) * 0.32,
        noise(seed, 113, 89) * Math.PI * 2,
        (noise(seed, 127, 97) - 0.5) * 0.28,
      ],
      scale: [size, crownHeight * 1.72, size * stretch],
      tint: [target[0] / 0x68, target[1] / 0x6a, target[2] / 0x63],
      colliderSize: [size * 0.9, crownHeight * 0.68, size * stretch * 0.86],
    });
  };

  // Foot traffic clears the middle and presses small fieldstone into a few
  // loose shoulder deposits. Concentrating the same geological event into
  // six readable places gives the stones a cause at the gameplay camera;
  // long empty reaches keep them from becoming a dotted curb.
  const pathStones: VikingBoulderPlacement[] = [];
  for (let clusterIndex = 0; clusterIndex < PATH_STONE_CLUSTERS.length; clusterIndex += 1) {
    const cluster = PATH_STONE_CLUSTERS[clusterIndex];
    let clusterCount = 0;
    for (let attempt = 0; attempt < 2_400 && clusterCount < cluster.count; attempt += 1) {
      const index = attempt + clusterIndex * 263;
      const angle = index * GOLDEN_ANGLE + noise(index, 71, 43) * 0.8;
      const radius = 8 + noise(index, 73, 47) * 50;
      const x = Math.cos(angle) * radius + (noise(index, 79, 53) - 0.5) * 4.5;
      const z = WORLD_CENTER_Z + Math.sin(angle) * radius
        + (noise(index, 83, 59) - 0.5) * 4.5;
      if (
        Math.hypot(x - cluster.center[0], z - cluster.center[1]) > cluster.radius
        || !terrainTileExists(x, z)
        || !clearsAuthoredBuildings(x, z)
      ) {
        continue;
      }
      const shoulder = pathShoulderAt(x, z, index);
      if (
        shoulder.wear >= 0.38
        || shoulder.nearbyWear <= 0.35
        || shoulder.nearbyWear - shoulder.wear <= 0.2
      ) {
        continue;
      }
      const spacing = 0.58 + noise(index, 149, 107) * 1.02;
      if (nearestDistance(x, z, pathStones) < spacing) continue;

      const size = 0.25 + noise(index, 89, 61) * 0.27;
      const crownHeight = 0.14 + noise(index, 97, 67) * 0.15;
      const stretch = 0.72 + noise(index, 101, 71) * 0.45;
      addFieldstone(
        `viking-fieldstone:path:${cluster.id}:${clusterCount}`,
        x,
        z,
        size,
        crownHeight,
        stretch,
        index,
        0.34,
      );
      pathStones.push(fieldstones[fieldstones.length - 1]);
      clusterCount += 1;
    }
  }

  // A few larger stones sit in the same neighbourhood, far enough from a
  // small one not to read as authored pairs. They make the loose fragments
  // feel displaced from local glacial material instead of sprinkled props.
  const companionStones: VikingBoulderPlacement[] = [];
  for (let index = 0; index < 84 && companionStones.length < 7; index += 1) {
    const anchor = pathStones[(index * 7 + 3) % pathStones.length];
    if (!anchor) break;
    const angle = noise(index, 157, 109) * Math.PI * 2;
    const distance = 1.35 + noise(index, 163, 113) * 2.55;
    const x = anchor.position[0] + Math.cos(angle) * distance;
    const z = anchor.position[2] + Math.sin(angle) * distance;
    if (
      !terrainTileExists(x, z)
      || !clearsAuthoredBuildings(x, z)
      || vikingTrafficWearAt(x, z) > 0.34
      || nearestDistance(x, z, companionStones) < 3.1
    ) {
      continue;
    }
    const size = 0.58 + noise(index, 167, 127) * 0.38;
    const crownHeight = 0.28 + noise(index, 173, 131) * 0.28;
    const stretch = 0.74 + noise(index, 179, 137) * 0.42;
    addFieldstone(
      `viking-fieldstone:companion:${companionStones.length}`,
      x,
      z,
      size,
      crownHeight,
      stretch,
      index + 1_000,
      0.36,
    );
    companionStones.push(fieldstones[fieldstones.length - 1]);
  }

  // A small ambient remainder prevents the path rule from becoming literal.
  const ambientStones: VikingBoulderPlacement[] = [];
  for (let index = 0; index < 280 && ambientStones.length < 5; index += 1) {
    const angle = index * GOLDEN_ANGLE + noise(index, 181, 139) * 1.1;
    const radius = 10 + noise(index, 191, 149) * 51;
    const x = Math.cos(angle) * radius + (noise(index, 193, 151) - 0.5) * 5.5;
    const z = WORLD_CENTER_Z + Math.sin(angle) * radius
      + (noise(index, 197, 157) - 0.5) * 5.5;
    if (
      !terrainTileExists(x, z)
      || !clearsAuthoredBuildings(x, z)
      || vikingTrafficWearAt(x, z) > 0.44
      || nearestDistance(x, z, fieldstones) < 2.7
    ) {
      continue;
    }
    const size = 0.26 + noise(index, 199, 163) * 0.25;
    const crownHeight = 0.15 + noise(index, 211, 167) * 0.14;
    const stretch = 0.7 + noise(index, 223, 173) * 0.48;
    addFieldstone(
      `viking-fieldstone:ambient:${ambientStones.length}`,
      x,
      z,
      size,
      crownHeight,
      stretch,
      index + 2_000,
      0.42,
    );
    ambientStones.push(fieldstones[fieldstones.length - 1]);
  }
  placements.push(...fieldstones);
  cached = placements;
  return cached;
}
