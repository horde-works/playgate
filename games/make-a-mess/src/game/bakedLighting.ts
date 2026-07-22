import { OccupancyGrid, type OccupancyBox } from "./occupancyGrid.ts";

/**
 * Baked ambient lighting for the static voxel world — the CPU twin of
 * Per-pixel voxel-traced ambient occlusion. For every piece we
 * trace a small set of weighted rays from each of its 8 corners through the
 * world occupancy grid:
 *
 * - cornerAo: hemispheric openness with distance falloff. Interpolated across
 *   each face by the vertex shader, it darkens inner corners, wall bases and
 *   anything tucked under an overhang.
 * - skyExposure: straight-up visibility of the sky from the piece's top —
 *   used to gate rain puddles (no wet gloss under roofs) and could later
 *   drive sheltered-dust looks.
 *
 * A destroyed piece clears its cells and only its neighbours re-bake, so the
 * lighting stays consistent with destruction at negligible cost.
 */

export interface BakeablePiece extends OccupancyBox {
  readonly id: string;
  /**
   * Optional authored shape hint. Flat "groundTile" pieces sample their
   * corners with a purely vertical offset so two adjacent tiles compute
   * identical values at a shared corner — no AO steps along seams.
   */
  readonly shape?: string;
}

interface BakeDirection {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly weight: number;
}

export const AO_MAX_DISTANCE = 3.4;
export const SKY_MAX_DISTANCE = 14;
const SKIP_DISTANCE = 0.28;
const CORNER_OFFSET = 0.34;
const CORNER_LIFT = 0.05;

function normalized(
  x: number,
  y: number,
  z: number,
  weight: number,
): BakeDirection {
  const length = Math.hypot(x, y, z);
  return { x: x / length, y: y / length, z: z / length, weight };
}

function buildAoDirections(): readonly BakeDirection[] {
  const directions: BakeDirection[] = [];
  // Zenith.
  directions.push(normalized(0, 1, 0, 1));
  // Upper ring, 45° elevation.
  for (let step = 0; step < 8; step += 1) {
    const angle = (step / 8) * Math.PI * 2;
    directions.push(normalized(Math.cos(angle), 1, Math.sin(angle), 0.85));
  }
  // Horizon ring — walls and inner corners.
  for (let step = 0; step < 6; step += 1) {
    const angle = ((step + 0.5) / 6) * Math.PI * 2;
    directions.push(normalized(Math.cos(angle), 0.16, Math.sin(angle), 0.5));
  }
  // Shallow downward ring — ground contact darkening on wall bases.
  for (let step = 0; step < 4; step += 1) {
    const angle = ((step + 0.25) / 4) * Math.PI * 2;
    directions.push(normalized(Math.cos(angle), -0.42, Math.sin(angle), 0.22));
  }
  return directions;
}

function buildSkyDirections(): readonly BakeDirection[] {
  // A steep cone: only near-vertical openings count as "sky", so a roof
  // reliably shuts off rain puddles underneath it.
  const directions: BakeDirection[] = [normalized(0, 1, 0, 1)];
  for (let step = 0; step < 6; step += 1) {
    const angle = (step / 6) * Math.PI * 2;
    directions.push(
      normalized(Math.cos(angle), 2.14, Math.sin(angle), 0.75),
    );
  }
  return directions;
}

const AO_DIRECTIONS = buildAoDirections();
const AO_TOTAL_WEIGHT = AO_DIRECTIONS.reduce(
  (sum, direction) => sum + direction.weight,
  0,
);
const SKY_DIRECTIONS = buildSkyDirections();
const SKY_TOTAL_WEIGHT = SKY_DIRECTIONS.reduce(
  (sum, direction) => sum + direction.weight,
  0,
);

/**
 * Corner order matches the shader's selection:
 * index = (x>0 ? 1 : 0) + (y>0 ? 2 : 0) + (z>0 ? 4 : 0)
 */
const CORNER_SIGNS: ReadonlyArray<readonly [number, number, number]> = [
  [-1, -1, -1],
  [1, -1, -1],
  [-1, 1, -1],
  [1, 1, -1],
  [-1, -1, 1],
  [1, -1, 1],
  [-1, 1, 1],
  [1, 1, 1],
];

function rotateOffset(
  offset: readonly [number, number, number],
  rotation: readonly [number, number, number] | undefined,
): readonly [number, number, number] {
  if (
    !rotation ||
    (rotation[0] === 0 && rotation[1] === 0 && rotation[2] === 0)
  ) {
    return offset;
  }
  const [rx, ry, rz] = rotation;
  let [x, y, z] = offset;
  // XYZ intrinsic order (three.js default).
  let cos = Math.cos(rx);
  let sin = Math.sin(rx);
  [y, z] = [y * cos - z * sin, y * sin + z * cos];
  cos = Math.cos(ry);
  sin = Math.sin(ry);
  [x, z] = [x * cos + z * sin, -x * sin + z * cos];
  cos = Math.cos(rz);
  sin = Math.sin(rz);
  [x, y] = [x * cos - y * sin, x * sin + y * cos];
  return [x, y, z];
}

export interface PieceBakeResult {
  /** 8 values, corner order documented above. */
  readonly cornerAo: readonly number[];
  /** 0..1 openness of the sky above the piece's top face. */
  readonly skyExposure: number;
}

export class LightingBaker {
  readonly grid: OccupancyGrid;

  constructor(pieces: readonly BakeablePiece[], cellSize = 0.5) {
    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;
    for (const piece of pieces) {
      const radius = Math.hypot(...piece.size) / 2;
      minX = Math.min(minX, piece.position[0] - radius);
      minY = Math.min(minY, piece.position[1] - radius);
      minZ = Math.min(minZ, piece.position[2] - radius);
      maxX = Math.max(maxX, piece.position[0] + radius);
      maxY = Math.max(maxY, piece.position[1] + radius);
      maxZ = Math.max(maxZ, piece.position[2] + radius);
    }
    if (!Number.isFinite(minX)) {
      minX = minY = minZ = -1;
      maxX = maxY = maxZ = 1;
    }

    this.grid = new OccupancyGrid({
      cellSize,
      min: [minX - 1, minY - 1, minZ - 1],
      max: [maxX + 1, maxY + 2, maxZ + 1],
    });
    this.grid.rasterizeAll(pieces);
  }

  removePiece(
    piece: BakeablePiece,
    overlappingSurvivors: Iterable<BakeablePiece>,
  ): void {
    this.grid.removeBox(piece, overlappingSurvivors);
  }

  bakePiece(piece: BakeablePiece): PieceBakeResult {
    const cornerAo: number[] = new Array(8);
    const flatTile = piece.shape === "groundTile";

    for (let corner = 0; corner < 8; corner += 1) {
      const signs = CORNER_SIGNS[corner];
      const local: readonly [number, number, number] = [
        (signs[0] * piece.size[0]) / 2,
        (signs[1] * piece.size[1]) / 2,
        (signs[2] * piece.size[2]) / 2,
      ];
      const rotated = rotateOffset(local, piece.rotation);
      const length = Math.hypot(...rotated) || 1;
      // Sample from just outside the corner so the piece itself (rasterized
      // into the grid) does not occlude its own rays. Flat tiles offset
      // straight up instead of diagonally and snap horizontally to a lattice:
      // authored tiles overlap a few centimetres, so two neighbours' "shared"
      // corners differ slightly — snapping makes them trace from the exact
      // same point and the seam disappears from the bake.
      const lattice = this.grid.cellSize / 2;
      const originX = flatTile
        ? Math.round((piece.position[0] + rotated[0]) / lattice) * lattice
        : piece.position[0] +
          rotated[0] +
          (rotated[0] / length) * CORNER_OFFSET;
      const originY = flatTile
        ? piece.position[1] +
          Math.abs(rotated[1]) +
          CORNER_OFFSET * 0.8 +
          CORNER_LIFT
        : piece.position[1] +
          rotated[1] +
          (rotated[1] / length) * CORNER_OFFSET +
          CORNER_LIFT;
      const originZ = flatTile
        ? Math.round((piece.position[2] + rotated[2]) / lattice) * lattice
        : piece.position[2] +
          rotated[2] +
          (rotated[2] / length) * CORNER_OFFSET;

      let visibility = 0;
      for (const direction of AO_DIRECTIONS) {
        const hit = this.grid.raycast(
          originX,
          originY,
          originZ,
          direction.x,
          direction.y,
          direction.z,
          AO_MAX_DISTANCE,
          SKIP_DISTANCE,
        );
        const open =
          hit < 0 ? 1 : Math.min(1, Math.max(0, hit / AO_MAX_DISTANCE));
        visibility += open * direction.weight;
      }
      cornerAo[corner] = visibility / AO_TOTAL_WEIGHT;
    }

    // Sky exposure from the top-face centre, long upward rays.
    const topLocal: readonly [number, number, number] = [
      0,
      piece.size[1] / 2,
      0,
    ];
    const topRotated = rotateOffset(topLocal, piece.rotation);
    const topX = piece.position[0] + topRotated[0];
    const topY = piece.position[1] + topRotated[1] + 0.32;
    const topZ = piece.position[2] + topRotated[2];
    let sky = 0;
    for (const direction of SKY_DIRECTIONS) {
      const hit = this.grid.raycast(
        topX,
        topY,
        topZ,
        direction.x,
        direction.y,
        direction.z,
        SKY_MAX_DISTANCE,
        SKIP_DISTANCE,
      );
      if (hit < 0) {
        sky += direction.weight;
      }
    }

    return { cornerAo, skyExposure: sky / SKY_TOTAL_WEIGHT };
  }
}
