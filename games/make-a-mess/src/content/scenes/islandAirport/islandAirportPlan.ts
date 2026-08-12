export type AirportPoint2 = readonly [x: number, z: number];

/**
 * Authored, non-radial shoreline. The long east-west shoulders belong to the
 * runway; the wider northern waist carries the terminal and landside loop.
 */
export const ISLAND_AIRPORT_SHORELINE: readonly AirportPoint2[] = [
  [-118, -19],
  [-111, -39],
  [-91, -51],
  [-50, -55],
  [-8, -52],
  [35, -55],
  [79, -50],
  [108, -37],
  [119, -15],
  [116, 13],
  [104, 35],
  [80, 49],
  [42, 56],
  [4, 54],
  [-34, 57],
  [-72, 51],
  [-101, 38],
  [-116, 17],
] as const;

export const AIRPORT_WORLD = {
  center: [0, 0] as const,
  halfExtents: [122, 60] as const,
  radius: 121,
  boundaryRadius: 154,
  skyRadius: 235,
  cameraFar: 410,
} as const;

export const AIRPORT_RUNWAY = {
  centreZ: -22,
  length: 176,
  width: 14,
  westThresholdX: -88,
  eastThresholdX: 88,
  thresholdInset: 7,
} as const;

export const AIRPORT_APRON = {
  centre: [15, 0.5] as const,
  width: 76,
  depth: 22,
  stands: [
    { id: "01", x: -2, clearSpan: 32, role: "heritage" },
    { id: "02", x: 31, clearSpan: 20, role: "utility" },
  ] as const,
} as const;

export const AIRPORT_TAXIWAY = {
  centre: [18, -12.75] as const,
  length: 4.5,
  width: 16,
} as const;

export const AIRPORT_FUEL_FARM = {
  centre: [88, 27] as const,
  tankXs: [82.5, 88, 93.5] as const,
  minX: 77,
  maxX: 99,
  minZ: 22.5,
  maxZ: 31.5,
} as const;

export const AIRPORT_TERMINAL = {
  origin: [8, 0.36, 20] as const,
  width: 52,
  depth: 20,
  wallTop: 6.3,
  roofTop: 6.59,
  bayCount: 8,
  bayWidth: 6.5,
  airsideZ: 10,
  landsideZ: 30,
} as const;

export const AIRPORT_CONTROL_TOWER = {
  centre: [39, 17] as const,
  shaftWidth: 6,
  shaftDepth: 6,
  cabFloor: 10.8,
  cabHeight: 3.05,
  roofY: 13.85,
} as const;

export function airportPointInShoreline(x: number, z: number): boolean {
  let inside = false;
  for (
    let current = 0, previous = ISLAND_AIRPORT_SHORELINE.length - 1;
    current < ISLAND_AIRPORT_SHORELINE.length;
    previous = current, current += 1
  ) {
    const [cx, cz] = ISLAND_AIRPORT_SHORELINE[current];
    const [px, pz] = ISLAND_AIRPORT_SHORELINE[previous];
    const crosses = (cz > z) !== (pz > z) &&
      x < ((px - cx) * (z - cz)) / (pz - cz) + cx;
    if (crosses) inside = !inside;
  }
  return inside;
}

export function airportDistanceToShoreline(x: number, z: number): number {
  let closest = Number.POSITIVE_INFINITY;
  for (let index = 0; index < ISLAND_AIRPORT_SHORELINE.length; index += 1) {
    const [ax, az] = ISLAND_AIRPORT_SHORELINE[index];
    const [bx, bz] = ISLAND_AIRPORT_SHORELINE[(index + 1) % ISLAND_AIRPORT_SHORELINE.length];
    const dx = bx - ax;
    const dz = bz - az;
    const denominator = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / denominator));
    closest = Math.min(closest, Math.hypot(x - (ax + dx * t), z - (az + dz * t)));
  }
  return closest;
}

export function airportInsideRectangle(
  x: number,
  z: number,
  centreX: number,
  centreZ: number,
  width: number,
  depth: number,
  margin = 0,
): boolean {
  return Math.abs(x - centreX) <= width / 2 + margin &&
    Math.abs(z - centreZ) <= depth / 2 + margin;
}
