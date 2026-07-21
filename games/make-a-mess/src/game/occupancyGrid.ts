/**
 * CPU bit-occupancy grid of the static world — the same idea as Teardown's
 * "volumetric shadow map" (a 1-bit voxelization of the level used to trace
 * ambient-occlusion and sky-visibility rays), except ours is traced once at
 * load on the CPU and baked into per-instance vertex data instead of being
 * traced per pixel per frame.
 */

export interface OccupancyBox {
  readonly position: readonly [number, number, number];
  readonly size: readonly [number, number, number];
  readonly rotation?: readonly [number, number, number];
}

export interface OccupancyGridOptions {
  /** World-space cell size in meters. */
  readonly cellSize?: number;
  /** Inclusive world bounds; boxes outside are clamped in. */
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

const DEFAULT_CELL_SIZE = 0.5;

interface RotationMatrix {
  readonly r00: number;
  readonly r01: number;
  readonly r02: number;
  readonly r10: number;
  readonly r11: number;
  readonly r12: number;
  readonly r20: number;
  readonly r21: number;
  readonly r22: number;
}

function eulerToMatrix(
  rotation: readonly [number, number, number],
): RotationMatrix {
  const [x, y, z] = rotation;
  const cx = Math.cos(x);
  const sx = Math.sin(x);
  const cy = Math.cos(y);
  const sy = Math.sin(y);
  const cz = Math.cos(z);
  const sz = Math.sin(z);
  // XYZ order, matching three.js Euler default.
  return {
    r00: cy * cz,
    r01: -cy * sz,
    r02: sy,
    r10: cx * sz + sx * sy * cz,
    r11: cx * cz - sx * sy * sz,
    r12: -sx * cy,
    r20: sx * sz - cx * sy * cz,
    r21: sx * cz + cx * sy * sz,
    r22: cx * cy,
  };
}

function isNegligibleRotation(
  rotation: readonly [number, number, number] | undefined,
): boolean {
  return (
    !rotation ||
    (Math.abs(rotation[0]) < 1e-4 &&
      Math.abs(rotation[1]) < 1e-4 &&
      Math.abs(rotation[2]) < 1e-4)
  );
}

export class OccupancyGrid {
  readonly cellSize: number;
  readonly originX: number;
  readonly originY: number;
  readonly originZ: number;
  readonly sizeX: number;
  readonly sizeY: number;
  readonly sizeZ: number;
  private readonly bits: Uint8Array;

  constructor(options: OccupancyGridOptions) {
    this.cellSize = options.cellSize ?? DEFAULT_CELL_SIZE;
    this.originX = options.min[0];
    this.originY = options.min[1];
    this.originZ = options.min[2];
    this.sizeX = Math.max(
      1,
      Math.ceil((options.max[0] - options.min[0]) / this.cellSize),
    );
    this.sizeY = Math.max(
      1,
      Math.ceil((options.max[1] - options.min[1]) / this.cellSize),
    );
    this.sizeZ = Math.max(
      1,
      Math.ceil((options.max[2] - options.min[2]) / this.cellSize),
    );
    this.bits = new Uint8Array(
      Math.ceil((this.sizeX * this.sizeY * this.sizeZ) / 8),
    );
  }

  get cellCount(): number {
    return this.sizeX * this.sizeY * this.sizeZ;
  }

  private cellIndex(ix: number, iy: number, iz: number): number {
    return (iy * this.sizeZ + iz) * this.sizeX + ix;
  }

  isCellSolid(ix: number, iy: number, iz: number): boolean {
    if (
      ix < 0 ||
      iy < 0 ||
      iz < 0 ||
      ix >= this.sizeX ||
      iy >= this.sizeY ||
      iz >= this.sizeZ
    ) {
      return false;
    }
    const index = this.cellIndex(ix, iy, iz);
    return (this.bits[index >> 3] & (1 << (index & 7))) !== 0;
  }

  private setCell(ix: number, iy: number, iz: number, solid: boolean): void {
    const index = this.cellIndex(ix, iy, iz);
    if (solid) {
      this.bits[index >> 3] |= 1 << (index & 7);
    } else {
      this.bits[index >> 3] &= ~(1 << (index & 7));
    }
  }

  isSolidAtPoint(x: number, y: number, z: number): boolean {
    return this.isCellSolid(
      Math.floor((x - this.originX) / this.cellSize),
      Math.floor((y - this.originY) / this.cellSize),
      Math.floor((z - this.originZ) / this.cellSize),
    );
  }

  /**
   * Marks every cell whose center lies inside the (slightly expanded) box.
   * The expansion keeps thin walls from slipping between cell centers.
   */
  rasterizeBox(box: OccupancyBox, solid = true): void {
    const pad = this.cellSize * 0.1;
    const halfX = box.size[0] / 2 + pad;
    const halfY = box.size[1] / 2 + pad;
    const halfZ = box.size[2] / 2 + pad;
    const radius = Math.hypot(halfX, halfY, halfZ);
    const minX = Math.max(
      0,
      Math.floor((box.position[0] - radius - this.originX) / this.cellSize),
    );
    const maxX = Math.min(
      this.sizeX - 1,
      Math.floor((box.position[0] + radius - this.originX) / this.cellSize),
    );
    const minY = Math.max(
      0,
      Math.floor((box.position[1] - radius - this.originY) / this.cellSize),
    );
    const maxY = Math.min(
      this.sizeY - 1,
      Math.floor((box.position[1] + radius - this.originY) / this.cellSize),
    );
    const minZ = Math.max(
      0,
      Math.floor((box.position[2] - radius - this.originZ) / this.cellSize),
    );
    const maxZ = Math.min(
      this.sizeZ - 1,
      Math.floor((box.position[2] + radius - this.originZ) / this.cellSize),
    );

    const axisAligned = isNegligibleRotation(box.rotation);
    const matrix = axisAligned ? null : eulerToMatrix(box.rotation!);
    const half = this.cellSize / 2;

    for (let iy = minY; iy <= maxY; iy += 1) {
      const centerY = this.originY + iy * this.cellSize + half;
      const dy = centerY - box.position[1];
      if (axisAligned && Math.abs(dy) > halfY) {
        continue;
      }
      for (let iz = minZ; iz <= maxZ; iz += 1) {
        const centerZ = this.originZ + iz * this.cellSize + half;
        const dz = centerZ - box.position[2];
        if (axisAligned && Math.abs(dz) > halfZ) {
          continue;
        }
        for (let ix = minX; ix <= maxX; ix += 1) {
          const centerX = this.originX + ix * this.cellSize + half;
          const dx = centerX - box.position[0];
          if (axisAligned) {
            if (Math.abs(dx) > halfX) {
              continue;
            }
          } else {
            // Inverse-rotate the offset into box space (transpose = inverse).
            const m = matrix!;
            const lx = m.r00 * dx + m.r10 * dy + m.r20 * dz;
            const ly = m.r01 * dx + m.r11 * dy + m.r21 * dz;
            const lz = m.r02 * dx + m.r12 * dy + m.r22 * dz;
            if (
              Math.abs(lx) > halfX ||
              Math.abs(ly) > halfY ||
              Math.abs(lz) > halfZ
            ) {
              continue;
            }
          }
          this.setCell(ix, iy, iz, solid);
        }
      }
    }
  }

  rasterizeAll(boxes: Iterable<OccupancyBox>): void {
    for (const box of boxes) {
      this.rasterizeBox(box);
    }
  }

  /**
   * Removes a box, then re-rasterizes the surviving boxes that overlap its
   * region — overlapping neighbors must not lose their shared cells.
   */
  removeBox(
    box: OccupancyBox,
    overlappingSurvivors: Iterable<OccupancyBox>,
  ): void {
    this.rasterizeBox(box, false);
    for (const survivor of overlappingSurvivors) {
      this.rasterizeBox(survivor);
    }
  }

  /**
   * DDA raymarch. Returns distance to the first solid cell, or -1 on miss.
   * `skipDistance` ignores hits closer than that (self-occlusion guard).
   */
  raycast(
    originX: number,
    originY: number,
    originZ: number,
    directionX: number,
    directionY: number,
    directionZ: number,
    maxDistance: number,
    skipDistance = 0,
  ): number {
    const cell = this.cellSize;
    let ix = Math.floor((originX - this.originX) / cell);
    let iy = Math.floor((originY - this.originY) / cell);
    let iz = Math.floor((originZ - this.originZ) / cell);

    const stepX = directionX > 0 ? 1 : -1;
    const stepY = directionY > 0 ? 1 : -1;
    const stepZ = directionZ > 0 ? 1 : -1;
    const deltaX = directionX !== 0 ? Math.abs(cell / directionX) : Infinity;
    const deltaY = directionY !== 0 ? Math.abs(cell / directionY) : Infinity;
    const deltaZ = directionZ !== 0 ? Math.abs(cell / directionZ) : Infinity;

    const boundaryX =
      this.originX + (ix + (stepX > 0 ? 1 : 0)) * cell;
    const boundaryY =
      this.originY + (iy + (stepY > 0 ? 1 : 0)) * cell;
    const boundaryZ =
      this.originZ + (iz + (stepZ > 0 ? 1 : 0)) * cell;
    let tMaxX =
      directionX !== 0 ? (boundaryX - originX) / directionX : Infinity;
    let tMaxY =
      directionY !== 0 ? (boundaryY - originY) / directionY : Infinity;
    let tMaxZ =
      directionZ !== 0 ? (boundaryZ - originZ) / directionZ : Infinity;

    let traveled = 0;
    for (let guard = 0; guard < 4096; guard += 1) {
      if (
        traveled >= skipDistance &&
        this.isCellSolid(ix, iy, iz)
      ) {
        return traveled;
      }
      if (traveled > maxDistance) {
        return -1;
      }

      if (tMaxX <= tMaxY && tMaxX <= tMaxZ) {
        traveled = tMaxX;
        tMaxX += deltaX;
        ix += stepX;
      } else if (tMaxY <= tMaxZ) {
        traveled = tMaxY;
        tMaxY += deltaY;
        iy += stepY;
      } else {
        traveled = tMaxZ;
        tMaxZ += deltaZ;
        iz += stepZ;
      }

      if (
        (stepX > 0 ? ix >= this.sizeX : ix < 0) &&
        (stepY > 0 ? iy >= this.sizeY : iy < 0) &&
        (stepZ > 0 ? iz >= this.sizeZ : iz < 0)
      ) {
        return -1;
      }
    }
    return -1;
  }
}
