import type {
  LandscapeDocument,
  LandscapePoint3,
  LandscapeSample,
} from "./landscapeDocument.ts";
import { createLandscapeSampler } from "./landscapeSampler.ts";

export interface LandscapeRenderProfile {
  readonly id: "smooth" | "soft-faceted";
  readonly pitch: number;
  readonly chunkSize: number;
  readonly heightQuantization: number;
  /** 0 = triangle normals, 1 = fully shared heightfield normals. */
  readonly normalSmoothing: number;
}

export interface LandscapeMeshChunk {
  readonly id: string;
  readonly vertices: readonly LandscapePoint3[];
  readonly normals: readonly LandscapePoint3[];
  readonly colors: readonly LandscapePoint3[];
  readonly triangles: readonly (readonly [number, number, number])[];
}

export interface CompiledLandscapeMesh {
  readonly profile: LandscapeRenderProfile;
  readonly chunks: readonly LandscapeMeshChunk[];
  readonly triangleCount: number;
}

export const LANDSCAPE_RENDER_PROFILES: Readonly<Record<LandscapeRenderProfile["id"], LandscapeRenderProfile>> = {
  smooth: {
    id: "smooth",
    pitch: 0.75,
    chunkSize: 16,
    heightQuantization: 0,
    normalSmoothing: 1,
  },
  "soft-faceted": {
    id: "soft-faceted",
    pitch: 0.75,
    chunkSize: 16,
    heightQuantization: 0.1,
    normalSmoothing: 0.28,
  },
};

type MutableChunk = {
  vertices: LandscapePoint3[];
  normals: LandscapePoint3[];
  colors: LandscapePoint3[];
  triangles: Array<readonly [number, number, number]>;
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function normalize([x, y, z]: LandscapePoint3): LandscapePoint3 {
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
}

function cross(
  [ax, ay, az]: LandscapePoint3,
  [bx, by, bz]: LandscapePoint3,
): LandscapePoint3 {
  return [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
}

function subtract(a: LandscapePoint3, b: LandscapePoint3): LandscapePoint3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function mixNormal(face: LandscapePoint3, smooth: LandscapePoint3, amount: number): LandscapePoint3 {
  return normalize([
    face[0] + (smooth[0] - face[0]) * amount,
    face[1] + (smooth[1] - face[1]) * amount,
    face[2] + (smooth[2] - face[2]) * amount,
  ]);
}

function hashNoise(x: number, z: number): number {
  const value = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

const GRASS_LOW = [0.22, 0.32, 0.14] as const;
const GRASS_HIGH = [0.3, 0.34, 0.17] as const;
const PATH = [0.46, 0.35, 0.18] as const;
const BANK = [0.24, 0.18, 0.12] as const;
const BED = [0.18, 0.135, 0.09] as const;

export function landscapeColorAt(sample: LandscapeSample, x: number, z: number): LandscapePoint3 {
  const altitude = clamp01((sample.elevation - 0.8) / 4.4);
  const grass = GRASS_LOW.map((channel, index) =>
    channel + (GRASS_HIGH[index] - channel) * altitude
  ) as [number, number, number];
  const base = sample.groundKind === "bed"
    ? [...BED]
    : sample.groundKind === "bank"
      ? [...BANK]
      : sample.groundKind === "terrace"
        ? grass.map((channel, index) => channel * (index === 1 ? 0.92 : 0.82))
        : grass;
  const path = sample.pathWeight;
  const macro = 0.94 + hashNoise(Math.floor(x / 4), Math.floor(z / 4)) * 0.12;
  return [
    (base[0] + (PATH[0] - base[0]) * path) * macro,
    (base[1] + (PATH[1] - base[1]) * path) * macro,
    (base[2] + (PATH[2] - base[2]) * path) * macro,
  ];
}

export function compileLandscapeMesh(
  document: LandscapeDocument,
  profile: LandscapeRenderProfile,
): CompiledLandscapeMesh {
  const sampler = createLandscapeSampler(document);
  const xs = document.boundary.map(([x]) => x);
  const zs = document.boundary.map(([, z]) => z);
  const minX = Math.floor(Math.min(...xs) / profile.pitch) * profile.pitch;
  const maxX = Math.ceil(Math.max(...xs) / profile.pitch) * profile.pitch;
  const minZ = Math.floor(Math.min(...zs) / profile.pitch) * profile.pitch;
  const maxZ = Math.ceil(Math.max(...zs) / profile.pitch) * profile.pitch;
  const chunks = new Map<string, MutableChunk>();
  const sampleCache = new Map<string, LandscapeSample>();
  const elevationCache = new Map<string, number>();

  const sampleAt = (x: number, z: number): LandscapeSample => {
    const key = `${x.toFixed(4)}:${z.toFixed(4)}`;
    const cached = sampleCache.get(key);
    if (cached) return cached;
    const sampled = sampler.sample(x, z);
    sampleCache.set(key, sampled);
    return sampled;
  };

  const elevationAt = (x: number, z: number): number => {
    const key = `${x.toFixed(4)}:${z.toFixed(4)}`;
    const cached = elevationCache.get(key);
    if (cached !== undefined) return cached;
    const elevation = sampleAt(x, z).elevation;
    const resolved = profile.heightQuantization > 0
      ? Math.round(elevation / profile.heightQuantization) * profile.heightQuantization
      : elevation;
    elevationCache.set(key, resolved);
    return resolved;
  };
  const smoothNormalAt = (x: number, z: number): LandscapePoint3 => {
    const epsilon = profile.pitch;
    const dx = (elevationAt(x + epsilon, z) - elevationAt(x - epsilon, z)) / (2 * epsilon);
    const dz = (elevationAt(x, z + epsilon) - elevationAt(x, z - epsilon)) / (2 * epsilon);
    return normalize([-dx, 1, -dz]);
  };
  const vertex = (x: number, z: number): { point: LandscapePoint3; normal: LandscapePoint3; color: LandscapePoint3 } => ({
    point: [x, elevationAt(x, z), z],
    normal: smoothNormalAt(x, z),
    color: landscapeColorAt(sampleAt(x, z), x, z),
  });

  const appendTriangle = (
    chunk: MutableChunk,
    a: ReturnType<typeof vertex>,
    b: ReturnType<typeof vertex>,
    c: ReturnType<typeof vertex>,
  ): void => {
    const face = normalize(cross(subtract(b.point, a.point), subtract(c.point, a.point)));
    const upwardFace = face[1] < 0 ? ([-face[0], -face[1], -face[2]] as const) : face;
    const offset = chunk.vertices.length;
    for (const current of [a, b, c]) {
      chunk.vertices.push(current.point);
      chunk.colors.push(current.color);
      chunk.normals.push(mixNormal(upwardFace, current.normal, profile.normalSmoothing));
    }
    chunk.triangles.push([offset, offset + 1, offset + 2]);
  };

  for (let x = minX; x < maxX; x += profile.pitch) {
    for (let z = minZ; z < maxZ; z += profile.pitch) {
      const chunkX = Math.floor((x - minX) / profile.chunkSize);
      const chunkZ = Math.floor((z - minZ) / profile.chunkSize);
      const id = `${chunkX}:${chunkZ}`;
      const chunk = chunks.get(id) ?? { vertices: [], normals: [], colors: [], triangles: [] };
      const a = vertex(x, z);
      const b = vertex(x + profile.pitch, z);
      const c = vertex(x + profile.pitch, z + profile.pitch);
      const d = vertex(x, z + profile.pitch);
      const appendIfInside = (
        first: ReturnType<typeof vertex>,
        second: ReturnType<typeof vertex>,
        third: ReturnType<typeof vertex>,
      ): void => {
        const centerX = (first.point[0] + second.point[0] + third.point[0]) / 3;
        const centerZ = (first.point[2] + second.point[2] + third.point[2]) / 3;
        if (sampleAt(centerX, centerZ).groundKind === "outside") return;
        chunks.set(id, chunk);
        appendTriangle(chunk, first, second, third);
      };
      // Alternating diagonals prevent a single world-space herringbone from
      // becoming the dominant faceting pattern.
      if ((Math.round(x / profile.pitch) + Math.round(z / profile.pitch)) % 2 === 0) {
        appendIfInside(a, c, b);
        appendIfInside(a, d, c);
      } else {
        appendIfInside(a, d, b);
        appendIfInside(b, d, c);
      }
    }
  }

  const compiled = [...chunks.entries()].map(([id, chunk]) => ({ id, ...chunk }));
  return {
    profile,
    chunks: compiled,
    triangleCount: compiled.reduce((total, chunk) => total + chunk.triangles.length, 0),
  };
}

export interface AdaptiveLandscapeCell {
  readonly id: string;
  readonly center: readonly [x: number, z: number];
  readonly size: number;
  readonly elevation: number;
  readonly sample: LandscapeSample;
}

export interface VoxelSmoothedLandscapeChunk {
  readonly id: string;
  readonly vertices: readonly LandscapePoint3[];
  readonly normals: readonly LandscapePoint3[];
  readonly triangles: readonly (readonly [number, number, number])[];
  /** One actual destructible terrain cell per triangle. */
  readonly triangleCells: readonly string[];
}

export interface CompiledVoxelSmoothedLandscape {
  readonly minimumCellSize: number;
  readonly maximumCellSize: number;
  /** Width of the shared bank interpolation around a height transition. */
  readonly transitionWidth: number;
  readonly cells: readonly AdaptiveLandscapeCell[];
  readonly chunks: readonly VoxelSmoothedLandscapeChunk[];
  readonly triangleCount: number;
}

function adaptiveCellId(x: number, z: number, size: number): string {
  const coordinate = (value: number) => Number(value.toFixed(4)).toString();
  return `${coordinate(x)}:${coordinate(z)}:${coordinate(size)}`;
}

/**
 * Compiles real, variably-sized destruction cells. Flat homogeneous areas
 * remain large. Height, shoreline, channel and surface-mask transitions
 * recursively split down to the requested minimum size. The render mesh is
 * only their intact batching: large cells stay flat, while chains of refined
 * cells become one shared bank surface instead of individually bevelled tiles.
 */
export function compileVoxelSmoothedLandscape(
  document: LandscapeDocument,
  options: {
    readonly minimumCellSize: number;
    readonly maximumCellSize: number;
    readonly chunkSize: number;
    readonly flatHeightTolerance?: number;
    /** Prevent the intact skin from dipping through a stepped substrate. */
    readonly maximumDownwardSmoothing?: number;
  },
): CompiledVoxelSmoothedLandscape {
  if (
    options.minimumCellSize <= 0 ||
    options.maximumCellSize < options.minimumCellSize ||
    Math.abs(
      Math.log2(options.maximumCellSize / options.minimumCellSize) -
      Math.round(Math.log2(options.maximumCellSize / options.minimumCellSize)),
    ) > 1e-6
  ) {
    throw new Error("Adaptive landscape cell sizes must form a positive power-of-two range");
  }
  const sampler = createLandscapeSampler(document);
  const xs = document.boundary.map(([x]) => x);
  const zs = document.boundary.map(([, z]) => z);
  const minX = Math.floor(Math.min(...xs) / options.maximumCellSize) * options.maximumCellSize;
  const maxX = Math.ceil(Math.max(...xs) / options.maximumCellSize) * options.maximumCellSize;
  const minZ = Math.floor(Math.min(...zs) / options.maximumCellSize) * options.maximumCellSize;
  const maxZ = Math.ceil(Math.max(...zs) / options.maximumCellSize) * options.maximumCellSize;
  const flatHeightTolerance = options.flatHeightTolerance ?? 0.12;
  const sampleCache = new Map<string, LandscapeSample>();
  const sampleAt = (x: number, z: number): LandscapeSample => {
    const key = `${x.toFixed(4)}:${z.toFixed(4)}`;
    const cached = sampleCache.get(key);
    if (cached) return cached;
    const sample = sampler.sample(x, z);
    sampleCache.set(key, sample);
    return sample;
  };

  const cells: AdaptiveLandscapeCell[] = [];
  const inspectCell = (centerX: number, centerZ: number, size: number): void => {
    const half = size / 2;
    const probeInset = Math.min(size * 0.08, options.minimumCellSize * 0.15);
    const offsets = [-half + probeInset, 0, half - probeInset];
    const samples = offsets.flatMap((offsetX) =>
      offsets.map((offsetZ) => sampleAt(centerX + offsetX, centerZ + offsetZ))
    );
    const inside = samples.filter((sample) => sample.groundKind !== "outside");
    if (inside.length === 0) return;

    const canSplit = size > options.minimumCellSize + 1e-6;
    const elevations = inside.map((sample) => sample.elevation);
    const groundKinds = new Set(inside.map((sample) => sample.groundKind));
    const channels = new Set(inside.map((sample) => sample.channelId));
    const homogeneous =
      inside.length === samples.length &&
      Math.max(...elevations) - Math.min(...elevations) <= flatHeightTolerance &&
      groundKinds.size === 1 &&
      channels.size === 1;

    if (canSplit && !homogeneous) {
      const childSize = size / 2;
      const childOffset = childSize / 2;
      for (const dx of [-childOffset, childOffset]) {
        for (const dz of [-childOffset, childOffset]) {
          inspectCell(centerX + dx, centerZ + dz, childSize);
        }
      }
      return;
    }

    const centerSample = sampleAt(centerX, centerZ);
    if (centerSample.groundKind === "outside") return;
    cells.push({
      id: adaptiveCellId(centerX, centerZ, size),
      center: [centerX, centerZ],
      size,
      elevation: centerSample.elevation,
      sample: centerSample,
    });
  };

  for (let x = minX; x < maxX; x += options.maximumCellSize) {
    for (let z = minZ; z < maxZ; z += options.maximumCellSize) {
      inspectCell(
        x + options.maximumCellSize / 2,
        z + options.maximumCellSize / 2,
        options.maximumCellSize,
      );
    }
  }

  // Every adaptive cell is aligned to the minimum-cell lattice. This lookup
  // makes mixed-size boundaries deterministic and avoids O(n²) neighbour
  // searches while generating the shared contour surface.
  const lattice = new Map<string, AdaptiveLandscapeCell>();
  const latticeKey = (x: number, z: number) => `${x}:${z}`;
  for (const cell of cells) {
    const span = Math.round(cell.size / options.minimumCellSize);
    const startX = Math.round(
      (cell.center[0] - cell.size / 2 - minX) / options.minimumCellSize,
    );
    const startZ = Math.round(
      (cell.center[1] - cell.size / 2 - minZ) / options.minimumCellSize,
    );
    for (let dx = 0; dx < span; dx += 1) {
      for (let dz = 0; dz < span; dz += 1) {
        lattice.set(latticeKey(startX + dx, startZ + dz), cell);
      }
    }
  }
  const chunks = new Map<string, {
    vertices: LandscapePoint3[];
    normals: LandscapePoint3[];
    triangles: Array<readonly [number, number, number]>;
    triangleCells: string[];
  }>();

  const latticeWidth = Math.round((maxX - minX) / options.minimumCellSize);
  const latticeDepth = Math.round((maxZ - minZ) / options.minimumCellSize);
  const vertexHeights = new Map<string, number>();
  const heightAtVertex = (vertexX: number, vertexZ: number): number | undefined => {
    const key = latticeKey(vertexX, vertexZ);
    const cached = vertexHeights.get(key);
    if (cached !== undefined) return cached;
    const adjacent = [
      lattice.get(latticeKey(vertexX - 1, vertexZ - 1)),
      lattice.get(latticeKey(vertexX, vertexZ - 1)),
      lattice.get(latticeKey(vertexX - 1, vertexZ)),
      lattice.get(latticeKey(vertexX, vertexZ)),
    ].filter((cell): cell is AdaptiveLandscapeCell => cell !== undefined);
    if (adjacent.length === 0) return undefined;
    // Quadrant weighting is intentional: along a straight interface both
    // plateaus contribute 50/50; at a convex corner the plateau occupying
    // three quadrants contributes 75%. This traces one contour instead of
    // rounding every physical cell independently.
    const averagedHeight = adjacent.reduce(
      (total, cell) => total + cell.elevation,
      0,
    ) / adjacent.length;
    const height = options.maximumDownwardSmoothing === undefined
      ? averagedHeight
      : Math.max(
          averagedHeight,
          Math.max(...adjacent.map((cell) => cell.elevation)) -
            options.maximumDownwardSmoothing,
        );
    vertexHeights.set(key, height);
    return height;
  };
  const normalAtVertex = (vertexX: number, vertexZ: number): LandscapePoint3 => {
    const center = heightAtVertex(vertexX, vertexZ) ?? document.baseElevation;
    const left = heightAtVertex(vertexX - 1, vertexZ) ?? center;
    const right = heightAtVertex(vertexX + 1, vertexZ) ?? center;
    const down = heightAtVertex(vertexX, vertexZ - 1) ?? center;
    const up = heightAtVertex(vertexX, vertexZ + 1) ?? center;
    return normalize([
      (left - right) / (2 * options.minimumCellSize),
      1,
      (down - up) / (2 * options.minimumCellSize),
    ]);
  };

  for (let latticeX = 0; latticeX < latticeWidth; latticeX += 1) {
    for (let latticeZ = 0; latticeZ < latticeDepth; latticeZ += 1) {
      const owner = lattice.get(latticeKey(latticeX, latticeZ));
      if (!owner) continue;
      const left = minX + latticeX * options.minimumCellSize;
      const bottom = minZ + latticeZ * options.minimumCellSize;
      const centerX = left + options.minimumCellSize / 2;
      const centerZ = bottom + options.minimumCellSize / 2;
      const chunkX = Math.floor((centerX - minX) / options.chunkSize);
      const chunkZ = Math.floor((centerZ - minZ) / options.chunkSize);
      const id = `${chunkX}:${chunkZ}`;
      const chunk = chunks.get(id) ?? {
        vertices: [],
        normals: [],
        triangles: [],
        triangleCells: [],
      };
      const points = [
        [left, heightAtVertex(latticeX, latticeZ) ?? owner.elevation, bottom],
        [
          left + options.minimumCellSize,
          heightAtVertex(latticeX + 1, latticeZ) ?? owner.elevation,
          bottom,
        ],
        [
          left + options.minimumCellSize,
          heightAtVertex(latticeX + 1, latticeZ + 1) ?? owner.elevation,
          bottom + options.minimumCellSize,
        ],
        [
          left,
          heightAtVertex(latticeX, latticeZ + 1) ?? owner.elevation,
          bottom + options.minimumCellSize,
        ],
      ] as const satisfies readonly LandscapePoint3[];
      const normals = [
        normalAtVertex(latticeX, latticeZ),
        normalAtVertex(latticeX + 1, latticeZ),
        normalAtVertex(latticeX + 1, latticeZ + 1),
        normalAtVertex(latticeX, latticeZ + 1),
      ] as const;
      const appendQuad = () => {
        const offset = chunk.vertices.length;
        for (let vertex = 0; vertex < points.length; vertex += 1) {
          chunk.vertices.push(points[vertex]);
          chunk.normals.push(normals[vertex]);
        }
        if ((latticeX + latticeZ) % 2 === 0) {
          chunk.triangles.push(
            [offset, offset + 3, offset + 1],
            [offset + 1, offset + 3, offset + 2],
          );
        } else {
          chunk.triangles.push(
            [offset, offset + 3, offset + 2],
            [offset, offset + 2, offset + 1],
          );
        }
        chunk.triangleCells.push(owner.id, owner.id);
      };
      appendQuad();
      chunks.set(id, chunk);
    }
  }

  const compiled = [...chunks.entries()].map(([id, chunk]) => ({ id, ...chunk }));
  return {
    minimumCellSize: options.minimumCellSize,
    maximumCellSize: options.maximumCellSize,
    transitionWidth: options.minimumCellSize,
    cells,
    chunks: compiled,
    triangleCount: compiled.reduce((total, chunk) => total + chunk.triangles.length, 0),
  };
}
