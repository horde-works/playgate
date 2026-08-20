import type {
  LandscapeDocument,
  LandscapeGroundKind,
  LandscapeGradient,
  LandscapeSample,
  LandscapeSampler,
  LandscapeSurfaceKind,
} from "./landscapeDocument.ts";

/**
 * Baked landscape lattice — the engine representation of a height field.
 *
 * The authored sampler is a function. Runtime consumers (mesh, collider,
 * grass, tint, slope-law maps) must not re-evaluate it: they read this
 * grid. Worlds opt in by baking; worlds that never bake never pay.
 *
 * Pitch is the world's render pitch so the bake IS the mesh lattice, not a
 * second approximation of it.
 */

const KIND_OUTSIDE = 0;
const KIND_LAND = 1;
const KIND_TERRACE = 2;
const KIND_BANK = 3;
const KIND_BED = 4;

const KIND_BY_NAME: Record<LandscapeGroundKind, number> = {
  outside: KIND_OUTSIDE,
  land: KIND_LAND,
  terrace: KIND_TERRACE,
  bank: KIND_BANK,
  bed: KIND_BED,
};

const NAME_BY_KIND: readonly LandscapeGroundKind[] = [
  "outside",
  "land",
  "terrace",
  "bank",
  "bed",
];

export interface LandscapeLattice {
  readonly originX: number;
  readonly originZ: number;
  readonly pitch: number;
  readonly columns: number;
  readonly rows: number;
  readonly baseElevation: number;
  readonly elevation: Float32Array;
  readonly pathWeight: Float32Array;
  readonly kind: Uint8Array;
}

export interface LandscapeGradeMapSpec {
  readonly data: Uint8Array;
  readonly size: number;
  readonly worldMin: number;
  readonly worldSpan: number;
}

export interface LandscapeIndexedCollider {
  readonly vertices: Float32Array;
  readonly indices: Uint32Array;
}

const outsideSample = (elevation: number): LandscapeSample => ({
  elevation,
  groundKind: "outside",
  surface: "soil",
  pathWeight: 0,
  channelId: null,
  channelDistance: null,
});

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function bakeLandscapeLattice(
  sampler: LandscapeSampler,
  document: LandscapeDocument,
  pitch: number,
): LandscapeLattice {
  if (!(pitch > 0)) {
    throw new Error("Landscape lattice pitch must be positive");
  }
  const xs = document.boundary.map(([x]) => x);
  const zs = document.boundary.map(([, z]) => z);
  const originX = Math.floor(Math.min(...xs) / pitch) * pitch;
  const originZ = Math.floor(Math.min(...zs) / pitch) * pitch;
  const maxX = Math.ceil(Math.max(...xs) / pitch) * pitch;
  const maxZ = Math.ceil(Math.max(...zs) / pitch) * pitch;
  const columns = Math.round((maxX - originX) / pitch) + 1;
  const rows = Math.round((maxZ - originZ) / pitch) + 1;
  const elevation = new Float32Array(columns * rows);
  const pathWeight = new Float32Array(columns * rows);
  const kind = new Uint8Array(columns * rows);
  for (let row = 0; row < rows; row += 1) {
    const z = originZ + row * pitch;
    for (let column = 0; column < columns; column += 1) {
      const sample = sampler.sample(originX + column * pitch, z);
      const index = row * columns + column;
      elevation[index] = sample.elevation;
      pathWeight[index] = sample.pathWeight;
      kind[index] = KIND_BY_NAME[sample.groundKind];
    }
  }
  return {
    originX,
    originZ,
    pitch,
    columns,
    rows,
    baseElevation: document.baseElevation,
    elevation,
    pathWeight,
    kind,
  };
}

function latticeIndex(lattice: LandscapeLattice, column: number, row: number): number {
  return row * lattice.columns + column;
}

function sampleGrid(
  lattice: LandscapeLattice,
  column: number,
  row: number,
): { elevation: number; pathWeight: number; kind: number } {
  if (
    column < 0 ||
    row < 0 ||
    column >= lattice.columns ||
    row >= lattice.rows
  ) {
    return {
      elevation: lattice.baseElevation,
      pathWeight: 0,
      kind: KIND_OUTSIDE,
    };
  }
  const index = latticeIndex(lattice, column, row);
  return {
    elevation: lattice.elevation[index],
    pathWeight: lattice.pathWeight[index],
    kind: lattice.kind[index],
  };
}

function bilinearElevation(lattice: LandscapeLattice, x: number, z: number): number {
  const u = (x - lattice.originX) / lattice.pitch;
  const v = (z - lattice.originZ) / lattice.pitch;
  const column = Math.floor(u);
  const row = Math.floor(v);
  const fu = u - column;
  const fv = v - row;
  const a = sampleGrid(lattice, column, row).elevation;
  const b = sampleGrid(lattice, column + 1, row).elevation;
  const c = sampleGrid(lattice, column, row + 1).elevation;
  const d = sampleGrid(lattice, column + 1, row + 1).elevation;
  const top = a + (b - a) * fu;
  const bottom = c + (d - c) * fu;
  return top + (bottom - top) * fv;
}

function nearestKind(lattice: LandscapeLattice, x: number, z: number): number {
  const column = Math.round((x - lattice.originX) / lattice.pitch);
  const row = Math.round((z - lattice.originZ) / lattice.pitch);
  return sampleGrid(lattice, column, row).kind;
}

function bilinearPathWeight(lattice: LandscapeLattice, x: number, z: number): number {
  const u = (x - lattice.originX) / lattice.pitch;
  const v = (z - lattice.originZ) / lattice.pitch;
  const column = Math.floor(u);
  const row = Math.floor(v);
  const fu = u - column;
  const fv = v - row;
  const a = sampleGrid(lattice, column, row).pathWeight;
  const b = sampleGrid(lattice, column + 1, row).pathWeight;
  const c = sampleGrid(lattice, column, row + 1).pathWeight;
  const d = sampleGrid(lattice, column + 1, row + 1).pathWeight;
  const top = a + (b - a) * fu;
  const bottom = c + (d - c) * fu;
  return top + (bottom - top) * fv;
}

export function latticeElevationAt(
  lattice: LandscapeLattice,
  x: number,
  z: number,
): number {
  return bilinearElevation(lattice, x, z);
}

export function latticeGradientAt(
  lattice: LandscapeLattice,
  x: number,
  z: number,
  epsilon = 1.2,
): LandscapeGradient {
  const elevation = bilinearElevation(lattice, x, z);
  return {
    elevation,
    x: (bilinearElevation(lattice, x + epsilon, z) -
      bilinearElevation(lattice, x - epsilon, z)) / (2 * epsilon),
    z: (bilinearElevation(lattice, x, z + epsilon) -
      bilinearElevation(lattice, x, z - epsilon)) / (2 * epsilon),
  };
}

export function latticeSample(
  lattice: LandscapeLattice,
  x: number,
  z: number,
): LandscapeSample {
  const kind = nearestKind(lattice, x, z);
  const groundKind = NAME_BY_KIND[kind] ?? "outside";
  if (groundKind === "outside") {
    return outsideSample(lattice.baseElevation);
  }
  const elevation = bilinearElevation(lattice, x, z);
  const pathWeight = bilinearPathWeight(lattice, x, z);
  const surface: LandscapeSurfaceKind = groundKind === "bed" || groundKind === "bank"
    ? "soil"
    : pathWeight > 0
      ? "path"
      : "grass";
  return {
    elevation,
    groundKind,
    surface,
    pathWeight,
    channelId: null,
    channelDistance: null,
  };
}

export function createLatticeSampler(lattice: LandscapeLattice): LandscapeSampler {
  return {
    sample: (x, z) => latticeSample(lattice, x, z),
    elevationAt: (x, z) => bilinearElevation(lattice, x, z),
    gradientAt: (x, z, epsilon) => latticeGradientAt(lattice, x, z, epsilon),
  };
}

/**
 * Macro-grade map the slope-law comb keys off. Probe is wider than hummocks
 * so the comb follows sustained hillsides, not each kochka face.
 */
export function latticeGradeMapRgba(
  lattice: LandscapeLattice,
  options: {
    readonly size: number;
    readonly worldMin: number;
    readonly worldSpan: number;
    readonly probe: number;
  },
): LandscapeGradeMapSpec {
  const { size, worldMin, worldSpan, probe } = options;
  const data = new Uint8Array(size * size * 4);
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      const worldX = worldMin + ((column + 0.5) / size) * worldSpan;
      const worldZ = worldMin + ((row + 0.5) / size) * worldSpan;
      const gradient = latticeGradientAt(lattice, worldX, worldZ, probe);
      const offset = (row * size + column) * 4;
      data[offset] = Math.round((clamp(gradient.x, -3, 3) / 6 + 0.5) * 255);
      data[offset + 1] = Math.round((clamp(gradient.z, -3, 3) / 6 + 0.5) * 255);
      data[offset + 2] = 0;
      data[offset + 3] = 255;
    }
  }
  return { data, size, worldMin, worldSpan };
}

/**
 * Shared-vertex collider for an indestructible height field. Render mesh
 * keeps unique verts so mixed face/smooth normals can still facet; physics
 * does not need that and must not copy the soup.
 */
export function compileLandscapeIndexedCollider(
  lattice: LandscapeLattice,
): LandscapeIndexedCollider {
  const used = new Uint32Array(lattice.columns * lattice.rows);
  used.fill(0xffffffff);
  const heights: number[] = [];
  const vertices: number[] = [];
  const indices: number[] = [];
  const vertexId = (column: number, row: number): number => {
    const latticeIndex = row * lattice.columns + column;
    const existing = used[latticeIndex];
    if (existing !== 0xffffffff) return existing;
    const compact = heights.length;
    used[latticeIndex] = compact;
    const x = lattice.originX + column * lattice.pitch;
    const z = lattice.originZ + row * lattice.pitch;
    const y = lattice.elevation[latticeIndex];
    heights.push(y);
    vertices.push(x, y, z);
    return compact;
  };
  for (let row = 0; row < lattice.rows - 1; row += 1) {
    for (let column = 0; column < lattice.columns - 1; column += 1) {
      const centerKind = nearestKind(
        lattice,
        lattice.originX + (column + 0.5) * lattice.pitch,
        lattice.originZ + (row + 0.5) * lattice.pitch,
      );
      if (centerKind === KIND_OUTSIDE) continue;
      const a = vertexId(column, row);
      const b = vertexId(column + 1, row);
      const c = vertexId(column + 1, row + 1);
      const d = vertexId(column, row + 1);
      if ((column + row) % 2 === 0) {
        indices.push(a, c, b, a, d, c);
      } else {
        indices.push(a, d, b, b, d, c);
      }
    }
  }
  return {
    vertices: new Float32Array(vertices),
    indices: new Uint32Array(indices),
  };
}
