export interface SpatialItem {
  readonly id: string;
  readonly position: readonly [number, number, number];
}

export interface SpatialIndex<T extends SpatialItem> {
  readonly cellSize: number;
  querySphere(
    center: readonly [number, number, number],
    radius: number,
  ): readonly T[];
}

function cellKey(x: number, y: number, z: number): string {
  return `${x}:${y}:${z}`;
}

export function createSpatialIndex<T extends SpatialItem>(
  items: readonly T[],
  cellSize = 4,
): SpatialIndex<T> {
  if (!Number.isFinite(cellSize) || cellSize <= 0) {
    throw new Error("Spatial index cell size must be positive.");
  }

  const cells = new Map<string, T[]>();
  for (const item of items) {
    const x = Math.floor(item.position[0] / cellSize);
    const y = Math.floor(item.position[1] / cellSize);
    const z = Math.floor(item.position[2] / cellSize);
    const key = cellKey(x, y, z);
    const cell = cells.get(key);
    if (cell) {
      cell.push(item);
    } else {
      cells.set(key, [item]);
    }
  }

  return {
    cellSize,
    querySphere(center, radius) {
      if (!Number.isFinite(radius) || radius < 0) {
        return [];
      }

      const minimumX = Math.floor((center[0] - radius) / cellSize);
      const maximumX = Math.floor((center[0] + radius) / cellSize);
      const minimumY = Math.floor((center[1] - radius) / cellSize);
      const maximumY = Math.floor((center[1] + radius) / cellSize);
      const minimumZ = Math.floor((center[2] - radius) / cellSize);
      const maximumZ = Math.floor((center[2] + radius) / cellSize);
      const radiusSquared = radius * radius;
      const result: T[] = [];

      for (let x = minimumX; x <= maximumX; x += 1) {
        for (let y = minimumY; y <= maximumY; y += 1) {
          for (let z = minimumZ; z <= maximumZ; z += 1) {
            const cell = cells.get(cellKey(x, y, z));
            if (!cell) {
              continue;
            }
            for (const item of cell) {
              const dx = item.position[0] - center[0];
              const dy = item.position[1] - center[1];
              const dz = item.position[2] - center[2];
              if (dx * dx + dy * dy + dz * dz <= radiusSquared) {
                result.push(item);
              }
            }
          }
        }
      }

      return result;
    },
  };
}
