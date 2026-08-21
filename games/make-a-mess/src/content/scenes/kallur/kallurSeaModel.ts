import { KALLUR_SHORELINE } from "./kallurTerrainPlan.ts";

/**
 * The Kallur sea sheet: geometry data for the accepted lab tiles S1/S2
 * (carpet-lab, verdict 21.08.2026). One annular disc that slides UNDER the
 * island: the visible waterline is born from the intersection with the
 * real coast — ragged by construction, never an authored ring — and the
 * opaque water hides the island's skirt below. Rings densify toward the
 * shore band so the vertex shader can breathe the swell against the
 * cliffs; the far field needs no geometry at all (waves out there are a
 * pattern, not displacement).
 */

export const KALLUR_SEA_LEVEL = 0.6;
export const KALLUR_SEA_INNER_RADIUS = 42;
/** seaRadius = min(2.35 * worldRadius, cameraFar * 0.86) — the edge law. */
export const KALLUR_SEA_OUTER_RADIUS = Math.min(2.35 * 118, 560 * 0.86);
export const KALLUR_SEA_SEGMENTS = 96;
/** The swell displaces vertices only inside this band around the coast. */
export const KALLUR_SEA_SHORE_BAND = 90;

/** Distance from a plan point to the closed shoreline polyline. */
export function kallurShoreDistance(x: number, z: number): number {
  let best = Infinity;
  for (let index = 0; index < KALLUR_SHORELINE.length; index += 1) {
    const [ax, az] = KALLUR_SHORELINE[index];
    const [bx, bz] = KALLUR_SHORELINE[(index + 1) % KALLUR_SHORELINE.length];
    const dx = bx - ax;
    const dz = bz - az;
    const lengthSquared = dx * dx + dz * dz || 1e-9;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / lengthSquared));
    const px = ax + dx * t;
    const pz = az + dz * t;
    best = Math.min(best, Math.hypot(x - px, z - pz));
  }
  return best;
}

export interface KallurSeaGeometry {
  readonly positions: Float32Array;
  readonly shoreDistances: Float32Array;
  readonly indices: Uint32Array;
  readonly ringRadii: readonly number[];
}

export function buildKallurSeaGeometry(): KallurSeaGeometry {
  const ringRadii: number[] = [];
  let radius = KALLUR_SEA_INNER_RADIUS;
  while (radius < 150) {
    ringRadii.push(radius);
    radius += 3.5;
  }
  while (radius < KALLUR_SEA_OUTER_RADIUS) {
    ringRadii.push(radius);
    radius *= 1.16;
  }
  ringRadii.push(KALLUR_SEA_OUTER_RADIUS);

  const rings = ringRadii.length;
  const positions = new Float32Array(rings * KALLUR_SEA_SEGMENTS * 3);
  const shoreDistances = new Float32Array(rings * KALLUR_SEA_SEGMENTS);
  for (let ring = 0; ring < rings; ring += 1) {
    for (let segment = 0; segment < KALLUR_SEA_SEGMENTS; segment += 1) {
      const angle = (segment / KALLUR_SEA_SEGMENTS) * Math.PI * 2;
      const x = Math.sin(angle) * ringRadii[ring];
      const z = Math.cos(angle) * ringRadii[ring];
      const vertex = ring * KALLUR_SEA_SEGMENTS + segment;
      positions[vertex * 3] = x;
      positions[vertex * 3 + 1] = KALLUR_SEA_LEVEL;
      positions[vertex * 3 + 2] = z;
      shoreDistances[vertex] = kallurShoreDistance(x, z);
    }
  }

  const indices = new Uint32Array((rings - 1) * KALLUR_SEA_SEGMENTS * 6);
  let cursor = 0;
  for (let ring = 0; ring < rings - 1; ring += 1) {
    for (let segment = 0; segment < KALLUR_SEA_SEGMENTS; segment += 1) {
      const nextSegment = (segment + 1) % KALLUR_SEA_SEGMENTS;
      const a = ring * KALLUR_SEA_SEGMENTS + segment;
      const b = ring * KALLUR_SEA_SEGMENTS + nextSegment;
      const c = (ring + 1) * KALLUR_SEA_SEGMENTS + segment;
      const d = (ring + 1) * KALLUR_SEA_SEGMENTS + nextSegment;
      indices[cursor++] = a;
      indices[cursor++] = b;
      indices[cursor++] = d;
      indices[cursor++] = a;
      indices[cursor++] = d;
      indices[cursor++] = c;
    }
  }

  return { positions, shoreDistances, indices, ringRadii };
}
