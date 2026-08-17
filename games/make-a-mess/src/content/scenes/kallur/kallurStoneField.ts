import type {
  LandscapeReliefBump,
  LandscapeSampler,
} from "../../landscape/landscapeDocument.ts";
import { valueNoise } from "../../landscape/landscapeSampler.ts";
import {
  KALLUR_PADS,
  KALLUR_PATH,
  KALLUR_SHORELINE,
} from "./kallurTerrainPlan.ts";

/**
 * Kallur stone field — boulders and hummocks as ONE spectrum
 * (kallur-brief.md §5.4, the original turf answer's "камни сквозь дёрн").
 *
 * Every stone carries an embed parameter t:
 *   t ~ 1   swallowed: only its turf mound exists, no mesh at all;
 *   t ~ 0.6 crown: a grey top pokes through the sod;
 *   t ~ 0.2 boulder: a full rock bedded into its own collar.
 * The collar mound is part of the landscape function itself (reliefBumps),
 * so render, collider and every consumer meet the same bedded stone — the
 * mesh-through-heightfield seam is hidden under turf by construction.
 *
 * Grammar: clusters, not white noise. Large stones are rare events that seed
 * children downslope; the path corridor and pads stay clean; nothing sits on
 * the cliff face — these stones live IN turf.
 */

export interface KallurStone {
  readonly id: string;
  readonly x: number;
  readonly z: number;
  /** Crown diameter in metres. */
  readonly size: number;
  /** Embed: 1 fully swallowed … 0 proud boulder. */
  readonly embed: number;
  readonly yaw: number;
  /** Palette pick: 0..1, high values are the lichen-light stones. */
  readonly tone: number;
}

function hash(index: number, lane: number): number {
  const value = Math.sin(index * 127.1 + lane * 311.7 + 91.7) * 43758.5453;
  return value - Math.floor(value);
}

function pathDistance(x: number, z: number): number {
  let best = Number.POSITIVE_INFINITY;
  for (let index = 1; index < KALLUR_PATH.length; index += 1) {
    const [ax, , az] = KALLUR_PATH[index - 1];
    const [bx, , bz] = KALLUR_PATH[index];
    const dx = bx - ax;
    const dz = bz - az;
    const lengthSquared = dx * dx + dz * dz;
    const t = lengthSquared < 1e-9
      ? 0
      : Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / lengthSquared));
    best = Math.min(best, Math.hypot(x - (ax + dx * t), z - (az + dz * t)));
  }
  return best;
}

function padDistance(x: number, z: number): number {
  let best = Number.POSITIVE_INFINITY;
  for (const pad of KALLUR_PADS) {
    const cos = Math.cos(pad.yaw);
    const sin = Math.sin(pad.yaw);
    const dx = x - pad.center[0];
    const dz = z - pad.center[1];
    const localX = dx * cos - dz * sin;
    const localZ = dx * sin + dz * cos;
    best = Math.min(best, Math.hypot(
      Math.max(0, Math.abs(localX) - pad.halfExtents[0]),
      Math.max(0, Math.abs(localZ) - pad.halfExtents[1]),
    ) - pad.shoulder);
  }
  return best;
}

const PATH_CLEARANCE = 2.2;
const HILL_CENTER = [-13, 5] as const;

export function generateKallurStones(
  baseSampler: LandscapeSampler,
): readonly KallurStone[] {
  const stones: KallurStone[] = [];
  const occupied = new Map<string, number>();
  const cellKey = (x: number, z: number) => `${Math.round(x / 1.6)}:${Math.round(z / 1.6)}`;

  const xs = KALLUR_SHORELINE.map(([x]) => x);
  const zs = KALLUR_SHORELINE.map(([, z]) => z);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);

  const gradientAt = (x: number, z: number): number => {
    const epsilon = 1.2;
    return Math.hypot(
      (baseSampler.elevationAt(x + epsilon, z) - baseSampler.elevationAt(x - epsilon, z)) / (2 * epsilon),
      (baseSampler.elevationAt(x, z + epsilon) - baseSampler.elevationAt(x, z - epsilon)) / (2 * epsilon),
    );
  };

  const admits = (x: number, z: number, size: number): boolean => {
    if (baseSampler.sample(x, z).groundKind !== "land") return false;
    if (pathDistance(x, z) < PATH_CLEARANCE + size / 2) return false;
    if (padDistance(x, z) < 0.5 + size / 2) return false;
    const gradient = gradientAt(x, z);
    // Stones live in turf, not on the cliff; past ~2.2 the tint is stone
    // already and a bedded boulder has nothing to sit in.
    if (gradient > 2.2) return false;
    const key = cellKey(x, z);
    const taken = occupied.get(key) ?? 0;
    if (taken >= (size > 1.2 ? 1 : 2)) return false;
    occupied.set(key, taken + 1);
    return true;
  };

  const place = (
    index: number,
    x: number,
    z: number,
    size: number,
    embedBias: number,
  ): void => {
    if (!admits(x, z, size)) return;
    const embed = Math.min(0.97, Math.max(0.12, embedBias + (hash(index, 5) - 0.5) * 0.45));
    stones.push({
      id: `stone:${stones.length}`,
      x,
      z,
      size,
      embed,
      yaw: hash(index, 6) * Math.PI * 2,
      tone: hash(index, 7),
    });
  };

  // Rare large boulders first: each is an event and seeds its own family.
  let largeCount = 0;
  for (let index = 0; index < 600 && largeCount < 12; index += 1) {
    const x = minX + hash(index, 1) * (maxX - minX);
    const z = minZ + hash(index, 2) * (maxZ - minZ);
    const cluster = 0.5 + 0.5 * valueNoise(x / 13, z / 13, 57);
    if (cluster < 0.62) continue;
    const gradient = gradientAt(x, z);
    if (gradient < 0.12 || gradient > 1.8) continue;
    const before = stones.length;
    place(index, x, z, 1.5 + hash(index, 3) * 1.5, 0.35);
    if (stones.length === before) continue;
    largeCount += 1;
    // Children scatter downslope of the parent: its own broken fragments.
    const childCount = 3 + Math.floor(hash(index, 4) * 3);
    for (let child = 0; child < childCount; child += 1) {
      const angle = hash(index * 31 + child, 8) * Math.PI * 2;
      const reach = 1.6 + hash(index * 31 + child, 9) * 4.2;
      place(
        index * 31 + child + 7,
        x + Math.cos(angle) * reach,
        z + Math.sin(angle) * reach,
        0.3 + hash(index * 31 + child, 10) * 0.6,
        0.55,
      );
    }
  }

  // The main population: small crowns and swallowed mounds, clustered, and
  // denser on the lighthouse hill where the reference photographs them.
  for (let index = 1000; index < 46000 && stones.length < 2300; index += 1) {
    const x = minX + hash(index, 1) * (maxX - minX);
    const z = minZ + hash(index, 2) * (maxZ - minZ);
    const cluster = 0.5 + 0.5 * valueNoise(x / 13, z / 13, 57);
    const gradient = gradientAt(x, z);
    const slopeBoost = Math.min(1, Math.max(0, (gradient - 0.15) / 0.5));
    const hillBoost = 1 + 1.3 * Math.max(
      0,
      1 - Math.hypot(x - HILL_CENTER[0], z - HILL_CENTER[1]) / 22,
    );
    const keep = Math.pow(cluster, 1.6) * (0.3 + slopeBoost * 0.7) * hillBoost;
    if (hash(index, 11) > keep * 0.5) continue;
    const roll = hash(index, 3);
    const size = roll < 0.76
      ? 0.2 + hash(index, 12) * 0.3
      : 0.5 + hash(index, 12) * 0.7;
    // Bias deep: most of the spectrum is swallowed or barely surfacing,
    // exactly like the reference hill where mound and stone are one row.
    place(index, x, z, size, 0.74);
  }

  return stones;
}

/** Turf collars and swallowed mounds: the stones' presence in the field. */
export function kallurStoneBumps(
  stones: readonly KallurStone[],
): readonly LandscapeReliefBump[] {
  return stones.map((stone) => ({
    id: `${stone.id}:collar`,
    center: [stone.x, stone.z] as const,
    radius: stone.size * (0.9 + stone.embed * 0.8),
    height: Math.min(0.55, stone.size * (0.15 + stone.embed * 0.45)),
  }));
}

/** Stones that materialise as rock pieces (crowns and boulders). */
export function kallurVisibleStones(
  stones: readonly KallurStone[],
): readonly KallurStone[] {
  return stones.filter((stone) => stone.embed < 0.85);
}
