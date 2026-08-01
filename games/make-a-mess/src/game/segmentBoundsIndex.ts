export interface SegmentBounds {
  readonly center: readonly [number, number, number];
  readonly size: readonly [number, number, number];
  readonly quaternion?: readonly [number, number, number, number];
}

export interface SegmentBoundsIndex<Item> {
  candidatesAlong(
    from: readonly [number, number, number],
    to: readonly [number, number, number],
  ): readonly Item[];
}

function aabbSize(bounds: SegmentBounds): readonly [number, number, number] {
  const quaternion = bounds.quaternion;
  if (!quaternion) return bounds.size;
  const [x, y, z, w] = quaternion;
  const xx = x * x;
  const yy = y * y;
  const zz = z * z;
  const xy = x * y;
  const xz = x * z;
  const yz = y * z;
  const wx = w * x;
  const wy = w * y;
  const wz = w * z;
  return [
    Math.abs(1 - 2 * (yy + zz)) * bounds.size[0] +
      Math.abs(2 * (xy - wz)) * bounds.size[1] +
      Math.abs(2 * (xz + wy)) * bounds.size[2],
    Math.abs(2 * (xy + wz)) * bounds.size[0] +
      Math.abs(1 - 2 * (xx + zz)) * bounds.size[1] +
      Math.abs(2 * (yz - wx)) * bounds.size[2],
    Math.abs(2 * (xz - wy)) * bounds.size[0] +
      Math.abs(2 * (yz + wx)) * bounds.size[1] +
      Math.abs(1 - 2 * (xx + yy)) * bounds.size[2],
  ];
}

/** Uniform-grid broad phase for repeated line-of-sight tests in one blast. */
export function createSegmentBoundsIndex<Item>(
  items: readonly Item[],
  boundsFor: (item: Item) => SegmentBounds,
  cellSize = 3,
): SegmentBoundsIndex<Item> {
  const buckets = new Map<string, Item[]>();
  const key = (x: number, y: number, z: number) => `${x}:${y}:${z}`;
  for (const item of items) {
    const bounds = boundsFor(item);
    const size = aabbSize(bounds);
    const minimum = bounds.center.map(
      (value, axis) => Math.floor((value - size[axis] / 2) / cellSize),
    );
    const maximum = bounds.center.map(
      (value, axis) => Math.floor((value + size[axis] / 2) / cellSize),
    );
    for (let x = minimum[0]; x <= maximum[0]; x += 1) {
      for (let y = minimum[1]; y <= maximum[1]; y += 1) {
        for (let z = minimum[2]; z <= maximum[2]; z += 1) {
          const bucketKey = key(x, y, z);
          const bucket = buckets.get(bucketKey);
          if (bucket) bucket.push(item);
          else buckets.set(bucketKey, [item]);
        }
      }
    }
  }

  return {
    candidatesAlong(from, to) {
      const result = new Set<Item>();
      const distance = Math.hypot(
        to[0] - from[0],
        to[1] - from[1],
        to[2] - from[2],
      );
      const steps = Math.max(1, Math.ceil(distance / (cellSize * 0.45)));
      for (let step = 0; step <= steps; step += 1) {
        const t = step / steps;
        const cell = [0, 1, 2].map((axis) =>
          Math.floor(
            (from[axis] + (to[axis] - from[axis]) * t) / cellSize,
          ),
        );
        // One-cell halo covers numerical boundary cases and the visibility
        // test's small contact tolerance without widening to the whole blast.
        for (let x = cell[0] - 1; x <= cell[0] + 1; x += 1) {
          for (let y = cell[1] - 1; y <= cell[1] + 1; y += 1) {
            for (let z = cell[2] - 1; z <= cell[2] + 1; z += 1) {
              for (const item of buckets.get(key(x, y, z)) ?? []) {
                result.add(item);
              }
            }
          }
        }
      }
      return [...result];
    },
  };
}
