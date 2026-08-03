import type { LandscapeDocument } from "../../landscape/landscapeDocument.ts";
import { compileVoxelSmoothedLandscape } from "../../landscape/landscapeMesher.ts";
import { createLandscapeSampler } from "../../landscape/landscapeSampler.ts";
import {
  DUTCH_POLDER_CHANNELS,
  DUTCH_POLDER_OBJECT_RESERVES,
  DUTCH_POLDER_ROUTES,
  DUTCH_POLDER_SHORELINE,
  DUTCH_POLDER_ZONES,
} from "./dutchPolderTerrainGraybox.ts";

export const dutchPolderCoverPieceId = (cellId: string) =>
  `dutch-polder:terrain-surface:cover:${cellId}:piece`;
export const dutchPolderEarthPieceId = (cellId: string) =>
  `dutch-polder:terrain:cell:${cellId}:piece`;
export const DUTCH_POLDER_TERRAIN_COVER_DEPTH = 0.36;

const transitionWidth = (elevation: number): number => elevation >= 5
  ? 12
  : elevation >= 2.3
    ? 7
    : 5;

function softenPolyline(
  points: readonly (readonly [number, number])[],
  iterations = 1,
): readonly (readonly [number, number])[] {
  let current = [...points];
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const next: Array<readonly [number, number]> = [current[0]];
    for (let index = 1; index < current.length; index += 1) {
      const from = current[index - 1];
      const to = current[index];
      next.push(
        [from[0] * 0.75 + to[0] * 0.25, from[1] * 0.75 + to[1] * 0.25],
        [from[0] * 0.25 + to[0] * 0.75, from[1] * 0.25 + to[1] * 0.75],
      );
    }
    next.push(current[current.length - 1]);
    current = next;
  }
  return current;
}

export const dutchPolderLandscapeDocument: LandscapeDocument = {
  schemaVersion: 1,
  id: "dutch-polder-landscape",
  boundary: DUTCH_POLDER_SHORELINE,
  baseElevation: 0.8,
  // Ordered overlays: low polder is the substrate, shelves follow, and the
  // displaced crown is deliberately last so it owns its embankment.
  elevationAreas: DUTCH_POLDER_ZONES
    .filter((zone) => zone.id !== "T5-south-polder")
    .sort((left, right) => left.topY - right.topY)
    .map((zone) => ({
      id: zone.id,
      elevation: zone.topY,
      polygon: zone.polygon,
      blendWidth: transitionWidth(zone.topY),
    })),
  flatPads: DUTCH_POLDER_OBJECT_RESERVES.map((reserve) => ({
    id: reserve.id,
    center: reserve.position,
    radius: Math.max(3.2, reserve.radius * 0.42),
    elevation: reserve.baseY,
    shoulder: Math.max(2.4, reserve.radius * 0.28),
  })),
  corridors: DUTCH_POLDER_ROUTES.map((route) => ({
    id: route.id,
    points: route.points,
    width: 2.15,
    feather: 1.15,
    surface: "path" as const,
    conformsTerrainToGrade: true,
    maximumCrossSlope: 0.5,
  })),
  dryChannels: DUTCH_POLDER_CHANNELS.map((channel) => ({
    id: channel.id,
    points: softenPolyline(channel.points),
    bedWidth: channel.width,
    bankWidth: 2.4,
    terraceWidth: 3.2,
    bedElevation: -0.25,
    bedSurface: "soil" as const,
    bankSurface: "soil" as const,
  })),
  water: "none",
};

export const dutchPolderLandscapeMesh = compileVoxelSmoothedLandscape(
  dutchPolderLandscapeDocument,
  {
    minimumCellSize: 2,
    maximumCellSize: 8,
    chunkSize: 20,
    flatHeightTolerance: 0.35,
    // The earth blocks end 0.36 m below their authored tops. Leave a small
    // overlap so their flat tops cannot pierce the interpolated turf skin.
    maximumDownwardSmoothing: DUTCH_POLDER_TERRAIN_COVER_DEPTH - 0.025,
  },
);

const landscapeCoordinate = (value: number) =>
  Number(value.toFixed(4)).toString();
export const dutchPolderCoverCellId = (x: number, z: number) =>
  `${landscapeCoordinate(x)}:${landscapeCoordinate(z)}`;

export interface DutchPolderCoverCell {
  readonly id: string;
  readonly center: readonly [x: number, y: number, z: number];
  readonly size: number;
  readonly vertices: readonly [
    readonly [number, number, number],
    readonly [number, number, number],
    readonly [number, number, number],
    readonly [number, number, number],
  ];
}

/**
 * The turf shell always owns the minimum render lattice, independently of the
 * 2/4/8 m earth body below it. A crater therefore opens locally even on a
 * large flat physical cell.
 */
export const dutchPolderCoverCells: readonly DutchPolderCoverCell[] =
  dutchPolderLandscapeMesh.chunks.flatMap((chunk) => {
    const cells: DutchPolderCoverCell[] = [];
    for (let offset = 0; offset < chunk.vertices.length; offset += 4) {
      const a = chunk.vertices[offset];
      const b = chunk.vertices[offset + 1];
      const c = chunk.vertices[offset + 2];
      const d = chunk.vertices[offset + 3];
      if (!a || !b || !c || !d) continue;
      cells.push({
        id: dutchPolderCoverCellId(a[0], a[2]),
        center: [
          (a[0] + c[0]) / 2,
          (a[1] + b[1] + c[1] + d[1]) / 4,
          (a[2] + c[2]) / 2,
        ],
        size: dutchPolderLandscapeMesh.minimumCellSize,
        vertices: [a, b, c, d],
      });
    }
    return cells;
  });

const dutchPolderLandscapeSampler = createLandscapeSampler(
  dutchPolderLandscapeDocument,
);
const physicalCellBucketSize = dutchPolderLandscapeMesh.maximumCellSize;
const physicalCellsByBucket = new Map<
  string,
  Array<(typeof dutchPolderLandscapeMesh.cells)[number]>
>();

for (const cell of dutchPolderLandscapeMesh.cells) {
  const halfSize = cell.size / 2;
  const minBucketX = Math.floor((cell.center[0] - halfSize - 1e-6) / physicalCellBucketSize);
  const maxBucketX = Math.floor((cell.center[0] + halfSize + 1e-6) / physicalCellBucketSize);
  const minBucketZ = Math.floor((cell.center[1] - halfSize - 1e-6) / physicalCellBucketSize);
  const maxBucketZ = Math.floor((cell.center[1] + halfSize + 1e-6) / physicalCellBucketSize);
  for (let bucketX = minBucketX; bucketX <= maxBucketX; bucketX += 1) {
    for (let bucketZ = minBucketZ; bucketZ <= maxBucketZ; bucketZ += 1) {
      const key = `${bucketX}:${bucketZ}`;
      const bucket = physicalCellsByBucket.get(key) ?? [];
      bucket.push(cell);
      physicalCellsByBucket.set(key, bucket);
    }
  }
}

/**
 * Returns the top of the actual adaptive terrain block rendered by the polder.
 * Vegetation must use this height rather than the continuous landscape sample,
 * otherwise roots can float above or disappear inside the stepped terrain.
 */
export function dutchPolderPhysicalCellAt(x: number, z: number) {
  let best: (typeof dutchPolderLandscapeMesh.cells)[number] | undefined;
  const bucket = physicalCellsByBucket.get(
    `${Math.floor(x / physicalCellBucketSize)}:${Math.floor(z / physicalCellBucketSize)}`,
  ) ?? [];
  for (const cell of bucket) {
    if (
      Math.abs(x - cell.center[0]) <= cell.size / 2 + 1e-6 &&
      Math.abs(z - cell.center[1]) <= cell.size / 2 + 1e-6 &&
      (!best || cell.size < best.size)
    ) {
      best = cell;
    }
  }
  return best;
}

export function dutchPolderPhysicalTopAt(x: number, z: number): number {
  return dutchPolderPhysicalCellAt(x, z)?.elevation ??
    dutchPolderLandscapeSampler.elevationAt(x, z);
}

type VisualLandscapeQuad = {
  readonly x: number;
  readonly z: number;
  readonly heights: readonly [number, number, number, number];
  readonly oppositeDiagonal: boolean;
  readonly coverPieceId: string;
};

const visualCoordinateKey = (x: number, z: number) =>
  `${Number(x.toFixed(6))}:${Number(z.toFixed(6))}`;
const visualQuads = new Map<string, VisualLandscapeQuad>();
let visualMinimumX = Number.POSITIVE_INFINITY;
let visualMinimumZ = Number.POSITIVE_INFINITY;
for (const chunk of dutchPolderLandscapeMesh.chunks) {
  for (let offset = 0; offset < chunk.vertices.length; offset += 4) {
    const [a, b, c, d] = chunk.vertices.slice(offset, offset + 4);
    if (!a || !b || !c || !d) continue;
    const firstTriangle = chunk.triangles[offset / 2];
    visualQuads.set(visualCoordinateKey(a[0], a[2]), {
      x: a[0],
      z: a[2],
      heights: [a[1], b[1], c[1], d[1]],
      oppositeDiagonal: firstTriangle?.[2] === offset + 1,
      coverPieceId: dutchPolderCoverPieceId(
        dutchPolderCoverCellId(a[0], a[2]),
      ),
    });
    visualMinimumX = Math.min(visualMinimumX, a[0]);
    visualMinimumZ = Math.min(visualMinimumZ, a[2]);
  }
}

function dutchPolderVisualQuadAt(
  x: number,
  z: number,
): VisualLandscapeQuad | undefined {
  const pitch = dutchPolderLandscapeMesh.minimumCellSize;
  const relativeX = (x - visualMinimumX) / pitch;
  const relativeZ = (z - visualMinimumZ) / pitch;
  const baseLatticeX = Math.floor(relativeX + 1e-9);
  const baseLatticeZ = Math.floor(relativeZ + 1e-9);
  const xCandidates = Math.abs(relativeX - Math.round(relativeX)) <= 1e-7
    ? [baseLatticeX, baseLatticeX - 1]
    : [baseLatticeX];
  const zCandidates = Math.abs(relativeZ - Math.round(relativeZ)) <= 1e-7
    ? [baseLatticeZ, baseLatticeZ - 1]
    : [baseLatticeZ];

  for (const latticeX of xCandidates) {
    for (const latticeZ of zCandidates) {
      const candidateX = visualMinimumX + latticeX * pitch;
      const candidateZ = visualMinimumZ + latticeZ * pitch;
      const candidate = visualQuads.get(visualCoordinateKey(candidateX, candidateZ));
      if (
        candidate &&
        x >= candidate.x - 1e-7 && x <= candidate.x + pitch + 1e-7 &&
        z >= candidate.z - 1e-7 && z <= candidate.z + pitch + 1e-7
      ) {
        return candidate;
      }
    }
  }
  return undefined;
}

export function dutchPolderCoverPieceIdAt(
  x: number,
  z: number,
): string | undefined {
  return dutchPolderVisualQuadAt(x, z)?.coverPieceId;
}

/** Exact height of the triangle mesh used by LandscapeSurface. */
export function dutchPolderVisualTopAt(x: number, z: number): number {
  const pitch = dutchPolderLandscapeMesh.minimumCellSize;
  const quad = dutchPolderVisualQuadAt(x, z);
  if (!quad) return dutchPolderPhysicalTopAt(x, z);

  const [h00, h10, h11, h01] = quad.heights;
  const tx = Math.max(0, Math.min(1, (x - quad.x) / pitch));
  const tz = Math.max(0, Math.min(1, (z - quad.z) / pitch));
  if (quad.oppositeDiagonal) {
    return tx + tz <= 1
      ? h00 + tx * (h10 - h00) + tz * (h01 - h00)
      : h11 + (1 - tz) * (h10 - h11) + (1 - tx) * (h01 - h11);
  }
  return tz >= tx
    ? h00 * (1 - tz) + h01 * (tz - tx) + h11 * tx
    : h00 * (1 - tx) + h11 * tz + h10 * (tx - tz);
}
