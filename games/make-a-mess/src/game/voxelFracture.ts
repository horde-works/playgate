export type VoxelVector3 = readonly [x: number, y: number, z: number];

export interface VoxelBody {
  readonly size: VoxelVector3;
  readonly dimensions: readonly [x: number, y: number, z: number];
  readonly cellSize: VoxelVector3;
  readonly occupied: Uint8Array;
}

export interface VoxelDamage {
  readonly point: VoxelVector3;
  readonly radius: number;
  readonly seed: string;
  readonly roughness?: number;
  readonly direction?: VoxelVector3;
  readonly penetration?: number;
}

export interface VoxelBox {
  readonly center: VoxelVector3;
  readonly size: VoxelVector3;
  readonly voxelCount: number;
}

export interface VoxelComponent {
  readonly voxelIndices: readonly number[];
  readonly voxelCount: number;
  readonly volume: number;
  readonly centerOfMass: VoxelVector3;
  readonly minimum: readonly [x: number, y: number, z: number];
  readonly maximum: readonly [x: number, y: number, z: number];
  readonly boxes: readonly VoxelBox[];
}

export interface VoxelComponentBody {
  readonly body: VoxelBody;
  readonly localCenter: VoxelVector3;
}

export interface VoxelFractureResult {
  readonly body: VoxelBody;
  readonly removedVoxelCount: number;
  readonly removedVolume: number;
  readonly components: readonly VoxelComponent[];
}

// Бюджет вокселей на тело. Влияет только на гигантов (корпус киоска
// 7×3.1×4.9 м): их дробление на 12k вокселей стоило 60-90 мс за удар и
// складывалось в секундные фризы при взрыве; на кирпичах и досках (десятки
// вокселей) кламп не сказывается вовсе — осколки гигантов просто крупнее.
export const DEFAULT_MAX_VOXELS = 4_500;
const MINIMUM_VOXEL_SIZE = 0.045;
const NEIGHBOURS = [
  [-1, 0, 0],
  [1, 0, 0],
  [0, -1, 0],
  [0, 1, 0],
  [0, 0, -1],
  [0, 0, 1],
] as const;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function hashNoise(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 1274126177);
  return (hash >>> 0) / 0xffffffff;
}

function voxelIndex(
  dimensions: VoxelBody["dimensions"],
  x: number,
  y: number,
  z: number,
): number {
  return x + dimensions[0] * (y + dimensions[1] * z);
}

function voxelCoordinates(
  dimensions: VoxelBody["dimensions"],
  index: number,
): [x: number, y: number, z: number] {
  const xy = dimensions[0] * dimensions[1];
  const z = Math.floor(index / xy);
  const remainder = index - z * xy;
  const y = Math.floor(remainder / dimensions[0]);
  return [remainder - y * dimensions[0], y, z];
}

function voxelCenter(body: VoxelBody, x: number, y: number, z: number) {
  return [
    -body.size[0] / 2 + (x + 0.5) * body.cellSize[0],
    -body.size[1] / 2 + (y + 0.5) * body.cellSize[1],
    -body.size[2] / 2 + (z + 0.5) * body.cellSize[2],
  ] as const;
}

function fitDimensions(
  size: VoxelVector3,
  targetVoxelSize: number,
  maximumVoxels: number,
): [x: number, y: number, z: number] {
  const target = Math.max(MINIMUM_VOXEL_SIZE, targetVoxelSize);
  const dimensions = size.map((side) =>
    clamp(Math.round(side / target), 1, 48),
  ) as [number, number, number];

  while (dimensions[0] * dimensions[1] * dimensions[2] > maximumVoxels) {
    let largestAxis: 0 | 1 | 2 = 0;
    for (const axis of [1, 2] as const) {
      const currentCell = size[largestAxis] / dimensions[largestAxis];
      const candidateCell = size[axis] / dimensions[axis];
      if (dimensions[axis] > 1 && candidateCell < currentCell) {
        largestAxis = axis;
      }
    }
    if (dimensions[largestAxis] === 1) {
      break;
    }
    dimensions[largestAxis] -= 1;
  }

  return dimensions;
}

export function createSolidVoxelBody(
  size: VoxelVector3,
  targetVoxelSize: number,
  maximumVoxels = DEFAULT_MAX_VOXELS,
): VoxelBody {
  const dimensions = fitDimensions(size, targetVoxelSize, maximumVoxels);
  const cellSize = [
    size[0] / dimensions[0],
    size[1] / dimensions[1],
    size[2] / dimensions[2],
  ] as const;
  const occupied = new Uint8Array(
    dimensions[0] * dimensions[1] * dimensions[2],
  );
  occupied.fill(1);

  return {
    size,
    dimensions,
    cellSize,
    occupied,
  };
}

export function countOccupiedVoxels(body: VoxelBody): number {
  let count = 0;
  for (const occupied of body.occupied) {
    count += occupied;
  }
  return count;
}

function pointToBoxDistanceSquared(
  point: VoxelVector3,
  minimum: VoxelVector3,
  maximum: VoxelVector3,
): number {
  let distanceSquared = 0;
  for (const axis of [0, 1, 2] as const) {
    const delta =
      point[axis] < minimum[axis]
        ? minimum[axis] - point[axis]
        : point[axis] > maximum[axis]
          ? point[axis] - maximum[axis]
          : 0;
    distanceSquared += delta * delta;
  }
  return distanceSquared;
}

function pointToSegmentDistanceSquared(
  point: VoxelVector3,
  start: VoxelVector3,
  end: VoxelVector3,
): number {
  const segmentX = end[0] - start[0];
  const segmentY = end[1] - start[1];
  const segmentZ = end[2] - start[2];
  const offsetX = point[0] - start[0];
  const offsetY = point[1] - start[1];
  const offsetZ = point[2] - start[2];
  const lengthSquared =
    segmentX * segmentX + segmentY * segmentY + segmentZ * segmentZ;
  const projection =
    lengthSquared > 1e-9
      ? clamp(
          (offsetX * segmentX +
            offsetY * segmentY +
            offsetZ * segmentZ) /
            lengthSquared,
          0,
          1,
        )
      : 0;
  const dx = point[0] - (start[0] + segmentX * projection);
  const dy = point[1] - (start[1] + segmentY * projection);
  const dz = point[2] - (start[2] + segmentZ * projection);
  return dx * dx + dy * dy + dz * dz;
}

/** Exact squared distance between a segment and an axis-aligned box. */
function segmentToBoxDistanceSquared(
  start: VoxelVector3,
  end: VoxelVector3,
  minimum: VoxelVector3,
  maximum: VoxelVector3,
): number {
  const direction = [
    end[0] - start[0],
    end[1] - start[1],
    end[2] - start[2],
  ] as const;
  const lengthSquared =
    direction[0] * direction[0] +
    direction[1] * direction[1] +
    direction[2] * direction[2];
  if (lengthSquared < 1e-12) {
    return pointToBoxDistanceSquared(start, minimum, maximum);
  }

  // Distance to an AABB is a convex piecewise quadratic along the segment.
  // Box-plane crossings delimit the pieces; inside each one, its exact minimum
  // is either the quadratic stationary point or an interval boundary.
  const crossings = [0, 1];
  for (const axis of [0, 1, 2] as const) {
    if (Math.abs(direction[axis]) < 1e-12) {
      continue;
    }
    for (const boundary of [minimum[axis], maximum[axis]]) {
      const crossing = (boundary - start[axis]) / direction[axis];
      if (crossing > 0 && crossing < 1) {
        crossings.push(crossing);
      }
    }
  }
  crossings.sort((left, right) => left - right);

  let closestSquared = Math.min(
    pointToBoxDistanceSquared(start, minimum, maximum),
    pointToBoxDistanceSquared(end, minimum, maximum),
  );
  for (let index = 0; index < crossings.length - 1; index += 1) {
    const intervalStart = crossings[index];
    const intervalEnd = crossings[index + 1];
    if (intervalEnd - intervalStart < 1e-12) {
      continue;
    }

    const midpoint = (intervalStart + intervalEnd) / 2;
    let numerator = 0;
    let denominator = 0;
    for (const axis of [0, 1, 2] as const) {
      const coordinate = start[axis] + direction[axis] * midpoint;
      const boundary =
        coordinate < minimum[axis]
          ? minimum[axis]
          : coordinate > maximum[axis]
            ? maximum[axis]
            : null;
      if (boundary === null) {
        continue;
      }
      numerator += direction[axis] * (start[axis] - boundary);
      denominator += direction[axis] * direction[axis];
    }

    const closestTime =
      denominator > 0
        ? clamp(-numerator / denominator, intervalStart, intervalEnd)
        : midpoint;
    const closestPoint = [
      start[0] + direction[0] * closestTime,
      start[1] + direction[1] * closestTime,
      start[2] + direction[2] * closestTime,
    ] as const;
    closestSquared = Math.min(
      closestSquared,
      pointToBoxDistanceSquared(closestPoint, minimum, maximum),
    );
  }
  return closestSquared;
}

function damageSegment(damage: VoxelDamage): {
  start: VoxelVector3;
  end: VoxelVector3;
} {
  if (!damage.direction || !damage.penetration || damage.penetration <= 0) {
    return { start: damage.point, end: damage.point };
  }

  const length = Math.hypot(...damage.direction);
  if (length < 1e-8) {
    return { start: damage.point, end: damage.point };
  }
  const scale = damage.penetration / length;
  return {
    start: damage.point,
    end: [
      damage.point[0] + damage.direction[0] * scale,
      damage.point[1] + damage.direction[1] * scale,
      damage.point[2] + damage.direction[2] * scale,
    ],
  };
}

function buildComponentBoxes(
  body: VoxelBody,
  voxelIndices: readonly number[],
): VoxelBox[] {
  const available = new Uint8Array(body.occupied.length);
  for (const index of voxelIndices) {
    available[index] = 1;
  }
  const boxes: VoxelBox[] = [];
  const [width, height, depth] = body.dimensions;

  for (let z = 0; z < depth; z += 1) {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (!available[voxelIndex(body.dimensions, x, y, z)]) {
          continue;
        }

        let endX = x;
        while (
          endX + 1 < width &&
          available[voxelIndex(body.dimensions, endX + 1, y, z)]
        ) {
          endX += 1;
        }

        let endY = y;
        yExpansion: while (endY + 1 < height) {
          for (let scanX = x; scanX <= endX; scanX += 1) {
            if (
              !available[
                voxelIndex(body.dimensions, scanX, endY + 1, z)
              ]
            ) {
              break yExpansion;
            }
          }
          endY += 1;
        }

        let endZ = z;
        zExpansion: while (endZ + 1 < depth) {
          for (let scanY = y; scanY <= endY; scanY += 1) {
            for (let scanX = x; scanX <= endX; scanX += 1) {
              if (
                !available[
                  voxelIndex(
                    body.dimensions,
                    scanX,
                    scanY,
                    endZ + 1,
                  )
                ]
              ) {
                break zExpansion;
              }
            }
          }
          endZ += 1;
        }

        for (let clearZ = z; clearZ <= endZ; clearZ += 1) {
          for (let clearY = y; clearY <= endY; clearY += 1) {
            for (let clearX = x; clearX <= endX; clearX += 1) {
              available[
                voxelIndex(body.dimensions, clearX, clearY, clearZ)
              ] = 0;
            }
          }
        }

        const voxelCount =
          (endX - x + 1) * (endY - y + 1) * (endZ - z + 1);
        const first = voxelCenter(body, x, y, z);
        const last = voxelCenter(body, endX, endY, endZ);
        boxes.push({
          center: [
            (first[0] + last[0]) / 2,
            (first[1] + last[1]) / 2,
            (first[2] + last[2]) / 2,
          ],
          size: [
            (endX - x + 1) * body.cellSize[0],
            (endY - y + 1) * body.cellSize[1],
            (endZ - z + 1) * body.cellSize[2],
          ],
          voxelCount,
        });
      }
    }
  }

  return boxes;
}

export function splitVoxelComponents(
  body: VoxelBody,
): readonly VoxelComponent[] {
  const visited = new Uint8Array(body.occupied.length);
  const components: VoxelComponent[] = [];
  const cellVolume =
    body.cellSize[0] * body.cellSize[1] * body.cellSize[2];

  for (let start = 0; start < body.occupied.length; start += 1) {
    if (!body.occupied[start] || visited[start]) {
      continue;
    }

    const queue = [start];
    const voxelIndices: number[] = [];
    visited[start] = 1;
    const minimum: [number, number, number] = [
      Number.POSITIVE_INFINITY,
      Number.POSITIVE_INFINITY,
      Number.POSITIVE_INFINITY,
    ];
    const maximum: [number, number, number] = [
      Number.NEGATIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ];
    const centerSum = [0, 0, 0];

    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const index = queue[cursor];
      voxelIndices.push(index);
      const coordinates = voxelCoordinates(body.dimensions, index);
      const center = voxelCenter(body, ...coordinates);
      for (const axis of [0, 1, 2] as const) {
        minimum[axis] = Math.min(minimum[axis], coordinates[axis]);
        maximum[axis] = Math.max(maximum[axis], coordinates[axis]);
        centerSum[axis] += center[axis];
      }

      for (const neighbour of NEIGHBOURS) {
        const x = coordinates[0] + neighbour[0];
        const y = coordinates[1] + neighbour[1];
        const z = coordinates[2] + neighbour[2];
        if (
          x < 0 ||
          y < 0 ||
          z < 0 ||
          x >= body.dimensions[0] ||
          y >= body.dimensions[1] ||
          z >= body.dimensions[2]
        ) {
          continue;
        }
        const neighbourIndex = voxelIndex(body.dimensions, x, y, z);
        if (
          body.occupied[neighbourIndex] &&
          !visited[neighbourIndex]
        ) {
          visited[neighbourIndex] = 1;
          queue.push(neighbourIndex);
        }
      }
    }

    components.push({
      voxelIndices,
      voxelCount: voxelIndices.length,
      volume: voxelIndices.length * cellVolume,
      centerOfMass: [
        centerSum[0] / voxelIndices.length,
        centerSum[1] / voxelIndices.length,
        centerSum[2] / voxelIndices.length,
      ],
      minimum,
      maximum,
      boxes: buildComponentBoxes(body, voxelIndices),
    });
  }

  return components.sort((left, right) => {
    if (right.voxelCount !== left.voxelCount) {
      return right.voxelCount - left.voxelCount;
    }
    return left.voxelIndices[0] - right.voxelIndices[0];
  });
}

export function applyVoxelDamage(
  source: VoxelBody,
  damage: VoxelDamage,
): VoxelFractureResult {
  const occupied = source.occupied.slice();
  const body: VoxelBody = { ...source, occupied };
  const { start, end } = damageSegment(damage);
  const roughness = clamp(damage.roughness ?? 0.22, 0, 0.48);
  const halfCell = [
    body.cellSize[0] / 2,
    body.cellSize[1] / 2,
    body.cellSize[2] / 2,
  ] as const;
  const cellBoundingRadius = Math.hypot(...halfCell);
  let removedVoxelCount = 0;

  for (let index = 0; index < occupied.length; index += 1) {
    if (!occupied[index]) {
      continue;
    }
    const coordinates = voxelCoordinates(body.dimensions, index);
    const center = voxelCenter(body, ...coordinates);
    const noise = hashNoise(
      `${damage.seed}:${coordinates[0]}:${coordinates[1]}:${coordinates[2]}`,
    );
    const localRadius =
      damage.radius * (1 - roughness * 0.55 + noise * roughness);
    // Preserve the tuned radial falloff for neighbouring voxels: their
    // centres still decide the damage volume. The exact box test below is
    // only the missing direct-hit guarantee — a ray that visibly traverses
    // an occupied voxel must remove that voxel even when its centre is far
    // from a grazing trajectory.
    const broadRadius = Math.max(localRadius, cellBoundingRadius);
    const centerDistanceSquared = pointToSegmentDistanceSquared(
      center,
      start,
      end,
    );
    if (centerDistanceSquared > broadRadius * broadRadius) {
      continue;
    }
    const minimum = [
      center[0] - halfCell[0],
      center[1] - halfCell[1],
      center[2] - halfCell[2],
    ] as const;
    const maximum = [
      center[0] + halfCell[0],
      center[1] + halfCell[1],
      center[2] + halfCell[2],
    ] as const;
    if (
      centerDistanceSquared <= localRadius * localRadius ||
      segmentToBoxDistanceSquared(start, end, minimum, maximum) <= 1e-12
    ) {
      occupied[index] = 0;
      removedVoxelCount += 1;
    }
  }

  const cellVolume =
    body.cellSize[0] * body.cellSize[1] * body.cellSize[2];
  return {
    body,
    removedVoxelCount,
    removedVolume: removedVoxelCount * cellVolume,
    components: splitVoxelComponents(body),
  };
}

export function createVoxelBodyFromComponent(
  source: VoxelBody,
  component: VoxelComponent,
): VoxelComponentBody {
  const dimensions = [
    component.maximum[0] - component.minimum[0] + 1,
    component.maximum[1] - component.minimum[1] + 1,
    component.maximum[2] - component.minimum[2] + 1,
  ] as const;
  const size = [
    dimensions[0] * source.cellSize[0],
    dimensions[1] * source.cellSize[1],
    dimensions[2] * source.cellSize[2],
  ] as const;
  const occupied = new Uint8Array(
    dimensions[0] * dimensions[1] * dimensions[2],
  );

  for (const sourceIndex of component.voxelIndices) {
    const [x, y, z] = voxelCoordinates(source.dimensions, sourceIndex);
    const localX = x - component.minimum[0];
    const localY = y - component.minimum[1];
    const localZ = z - component.minimum[2];
    occupied[voxelIndex(dimensions, localX, localY, localZ)] = 1;
  }

  const first = voxelCenter(
    source,
    component.minimum[0],
    component.minimum[1],
    component.minimum[2],
  );
  const last = voxelCenter(
    source,
    component.maximum[0],
    component.maximum[1],
    component.maximum[2],
  );

  return {
    body: {
      size,
      dimensions,
      cellSize: source.cellSize,
      occupied,
    },
    localCenter: [
      (first[0] + last[0]) / 2,
      (first[1] + last[1]) / 2,
      (first[2] + last[2]) / 2,
    ],
  };
}
