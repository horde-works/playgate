import type {
  LandscapeDocument,
  LandscapeGradient,
  LandscapeSample,
  LandscapeSampler,
} from "../landscape/landscapeDocument.ts";
import {
  bakeLandscapeLattice,
  compileLandscapeIndexedCollider,
  createLatticeSampler,
} from "../landscape/landscapeLattice.ts";
import {
  compileLandscapeMesh,
  LANDSCAPE_RENDER_PROFILES,
} from "../landscape/landscapeMesher.ts";
import type { LandscapeVisualDefinition } from "../../game/destructionScene.ts";
import {
  vikingTrafficAreas,
  vikingTrafficRoutes,
  type VikingPlanPoint,
} from "./vikingVillagePlan.ts";

/**
 * Viking Village ground carrier.
 *
 * The old scene rendered the top faces of four-metre structural boxes. That
 * can carry a colour mask but it cannot carry landform: every grazing-light
 * cue stops at a perfectly flat square. This module gives the village the
 * same honest contract as Kallur — one frequent landscape lattice shared by
 * render and collision, with the authored boxes sunk underneath as support
 * owners. The material language remains Viking: trampled northern turf,
 * moss, wet humus and fibre rather than the Faroese carpet.
 */

export const VIKING_WORLD_CENTER_Z = -10;
export const VIKING_TERRAIN_TILE = 4;
export const VIKING_TERRAIN_MIN_X = -96;
export const VIKING_TERRAIN_MAX_X = 96;
export const VIKING_TERRAIN_MIN_Z = VIKING_WORLD_CENTER_Z - 96;
export const VIKING_TERRAIN_MAX_Z = VIKING_WORLD_CENTER_Z + 96;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function smooth01(value: number): number {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function hashNoise(x: number, z: number, seed: number): number {
  const value = Math.sin(x * 127.1 + z * 311.7 + seed * 74.7) * 43758.5453;
  return value - Math.floor(value);
}

function valueNoise(x: number, z: number, seed: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = smooth01(x - ix);
  const fz = smooth01(z - iz);
  const a = hashNoise(ix, iz, seed);
  const b = hashNoise(ix + 1, iz, seed);
  const c = hashNoise(ix, iz + 1, seed);
  const d = hashNoise(ix + 1, iz + 1, seed);
  const top = a + (b - a) * fx;
  const bottom = c + (d - c) * fx;
  return top + (bottom - top) * fz;
}

function documentTileNoise(x: number, z: number, salt = 0): number {
  const value = Math.sin(x * 91.17 + z * 47.71 + salt * 19.13) * 43758.5453;
  return value - Math.floor(value);
}

export function vikingTerrainTileAt(
  x: number,
  z: number,
): readonly [x: number, z: number] | null {
  const tileX = Math.round(x / VIKING_TERRAIN_TILE) * VIKING_TERRAIN_TILE;
  const tileZ = VIKING_WORLD_CENTER_Z + Math.round(
    (z - VIKING_WORLD_CENTER_Z) / VIKING_TERRAIN_TILE,
  ) * VIKING_TERRAIN_TILE;
  if (
    tileX < VIKING_TERRAIN_MIN_X ||
    tileX > VIKING_TERRAIN_MAX_X ||
    tileZ < VIKING_TERRAIN_MIN_Z ||
    tileZ > VIKING_TERRAIN_MAX_Z
  ) {
    return null;
  }
  const radius = Math.hypot(tileX, tileZ - VIKING_WORLD_CENTER_Z);
  const edge = 92
    + (documentTileNoise(tileX, tileZ, 4) - 0.5) * 8
    + Math.sin(tileZ * 0.075) * 2.4;
  return radius <= edge ? [tileX, tileZ] : null;
}

export function vikingTerrainPieceIdAt(x: number, z: number): string | null {
  const tile = vikingTerrainTileAt(x, z);
  return tile
    ? `viking-village:terrain-surface:cover:${tile[0]}:${tile[1]}:piece`
    : null;
}

function nearestVikingTerrainPieceId(x: number, z: number): string | null {
  const direct = vikingTerrainPieceIdAt(x, z);
  if (direct) return direct;
  let closest: { readonly id: string; readonly distance: number } | null = null;
  const centerX = Math.round(x / VIKING_TERRAIN_TILE) * VIKING_TERRAIN_TILE;
  const centerZ = VIKING_WORLD_CENTER_Z + Math.round(
    (z - VIKING_WORLD_CENTER_Z) / VIKING_TERRAIN_TILE,
  ) * VIKING_TERRAIN_TILE;
  for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
    for (let offsetZ = -1; offsetZ <= 1; offsetZ += 1) {
      const tileX = centerX + offsetX * VIKING_TERRAIN_TILE;
      const tileZ = centerZ + offsetZ * VIKING_TERRAIN_TILE;
      if (!vikingTerrainTileAt(tileX, tileZ)) continue;
      const distance = Math.hypot(x - tileX, z - tileZ);
      if (!closest || distance < closest.distance) {
        closest = {
          id: `viking-village:terrain-surface:cover:${tileX}:${tileZ}:piece`,
          distance,
        };
      }
    }
  }
  return closest?.id ?? null;
}

function pointSegmentDistance(
  point: VikingPlanPoint,
  start: VikingPlanPoint,
  end: VikingPlanPoint,
): number {
  const dx = end[0] - start[0];
  const dz = end[1] - start[1];
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared < 1e-8) return Math.hypot(point[0] - start[0], point[1] - start[1]);
  const t = clamp01(((point[0] - start[0]) * dx + (point[1] - start[1]) * dz) / lengthSquared);
  return Math.hypot(
    point[0] - (start[0] + dx * t),
    point[1] - (start[1] + dz * t),
  );
}

function rotatedEllipseDistance(
  point: VikingPlanPoint,
  center: VikingPlanPoint,
  radius: VikingPlanPoint,
  rotation: number,
): number {
  const dx = point[0] - center[0];
  const dz = point[1] - center[1];
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  const localX = dx * cosine - dz * sine;
  const localZ = dx * sine + dz * cosine;
  return Math.hypot(localX / radius[0], localZ / radius[1]);
}

/**
 * Low-frequency traffic field for actual compression of the earth. The GPU
 * uses the richer baked mask (curved, meandering, three nested widths); this
 * CPU twin only carries the few centimetres of real depression and shoulder.
 */
export function vikingTrafficWearAt(x: number, z: number): number {
  const point: VikingPlanPoint = [x, z];
  let untouched = 1;
  for (const route of vikingTrafficRoutes) {
    let distance = Number.POSITIVE_INFINITY;
    for (let index = 0; index < route.points.length - 1; index += 1) {
      distance = Math.min(
        distance,
        pointSegmentDistance(point, route.points[index], route.points[index + 1]),
      );
    }
    const feather = route.width * 2.65 + 0.7;
    const influence = Math.pow(1 - smooth01(distance / feather), 1.35) * route.wear;
    untouched *= 1 - clamp01(influence);
  }
  for (const area of vikingTrafficAreas) {
    const distance = rotatedEllipseDistance(
      point,
      area.center,
      area.radius,
      area.rotation ?? 0,
    );
    const influence = Math.pow(1 - smooth01(distance / 1.34), 1.5) * area.wear * 0.72;
    untouched *= 1 - clamp01(influence);
  }
  return clamp01(1 - untouched);
}

/** Real landform, deliberately only centimetres tall around authored props. */
export function vikingGroundTopAt(x: number, z: number): number {
  const broad = Math.abs(valueNoise(x / 8.4, z / 8.4, 811) * 2 - 1);
  const hummock = Math.abs(valueNoise(x / 2.7, z / 2.7, 827) * 2 - 1);
  const clod = valueNoise(x / 1.35, z / 1.35, 853);
  const wear = vikingTrafficWearAt(x, z);
  const village = 1 - smooth01((Math.hypot(x, z - VIKING_WORLD_CENTER_Z) - 31) / 32);
  const churn = valueNoise(x / 4.8 + 13.7, z / 4.8 - 9.1, 877);
  const livedHollow = village * smooth01((0.56 - churn) / 0.31) * 0.014;
  const pathShoulder = Math.pow(4 * wear * (1 - wear), 2) * 0.012;
  return 0.052
    + (broad - 0.43) * 0.094
    + (hummock - 0.45) * 0.071 * (1 - wear * 0.55)
    + (clod - 0.5) * 0.029 * (1 - wear * 0.72)
    - Math.pow(wear, 1.25) * 0.041
    - livedHollow * 1.15
    + pathShoulder * 1.2;
}

function vikingLandscapeSample(x: number, z: number): LandscapeSample {
  const inside = vikingTerrainTileAt(x, z) !== null;
  const wear = inside ? vikingTrafficWearAt(x, z) : 0;
  return {
    elevation: inside ? vikingGroundTopAt(x, z) : -0.12,
    groundKind: inside ? "land" : "outside",
    surface: wear > 0.42 ? "path" : "grass",
    pathWeight: wear,
    channelId: null,
    channelDistance: null,
  };
}

const vikingAuthoredSampler: LandscapeSampler = {
  sample: vikingLandscapeSample,
  elevationAt: vikingGroundTopAt,
  gradientAt(x: number, z: number, epsilon = 1.2): LandscapeGradient {
    return {
      elevation: vikingGroundTopAt(x, z),
      x: (vikingGroundTopAt(x + epsilon, z) - vikingGroundTopAt(x - epsilon, z)) / (2 * epsilon),
      z: (vikingGroundTopAt(x, z + epsilon) - vikingGroundTopAt(x, z - epsilon)) / (2 * epsilon),
    };
  },
};

const vikingLandscapeDocument: LandscapeDocument = {
  schemaVersion: 1,
  id: "viking-village-landscape",
  boundary: [
    [VIKING_TERRAIN_MIN_X - 2, VIKING_TERRAIN_MIN_Z - 2],
    [VIKING_TERRAIN_MAX_X + 2, VIKING_TERRAIN_MIN_Z - 2],
    [VIKING_TERRAIN_MAX_X + 2, VIKING_TERRAIN_MAX_Z + 2],
    [VIKING_TERRAIN_MIN_X - 2, VIKING_TERRAIN_MAX_Z + 2],
  ],
  baseElevation: -0.12,
  elevationAreas: [],
  flatPads: [],
  corridors: [],
  dryChannels: [],
  water: "none",
};

const vikingProfile = {
  ...LANDSCAPE_RENDER_PROFILES["kallur-turf"],
  id: "kallur-turf" as const,
  // Partial faceting is intentional: shallow clods need to catch the same
  // low sun that reveals Kallur's hummocks. Full smoothing erases them.
  normalSmoothing: 0.48,
};

export const vikingLandscapeLattice = bakeLandscapeLattice(
  vikingAuthoredSampler,
  vikingLandscapeDocument,
  vikingProfile.pitch,
);
export const vikingLandscapeSampler = createLatticeSampler(vikingLandscapeLattice);
export const vikingLandscapeCollider = compileLandscapeIndexedCollider(vikingLandscapeLattice);
export const vikingLandscapeMesh = compileLandscapeMesh(
  vikingLandscapeDocument,
  vikingProfile,
  vikingLandscapeSampler,
);

export const vikingVillageLandscapeVisual: LandscapeVisualDefinition = {
  material: "grass",
  color: "#526047",
  landscapeSurface: "viking-ground",
  indexedCollider: vikingLandscapeCollider,
  chunks: vikingLandscapeMesh.chunks.map((chunk) => {
    const triangleOwners = chunk.triangles.map((triangle) => {
      const [a, b, c] = triangle;
      const centroidX = (chunk.vertices[a][0] + chunk.vertices[b][0] + chunk.vertices[c][0]) / 3;
      const centroidZ = (chunk.vertices[a][2] + chunk.vertices[b][2] + chunk.vertices[c][2]) / 3;
      const owner = nearestVikingTerrainPieceId(centroidX, centroidZ);
      if (!owner) {
        throw new Error(`Viking landscape triangle ${chunk.id} has no terrain owner`);
      }
      return owner;
    });
    return {
      id: `viking:${chunk.id}`,
      vertices: chunk.vertices,
      normals: chunk.normals,
      indices: chunk.triangles.flatMap((triangle) => [...triangle]),
      triangleOwners,
      ownerPieceIds: [...new Set(triangleOwners)],
    };
  }),
};
