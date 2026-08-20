import {
  kallurLandscapeSampler,
} from "../content/scenes/kallur/kallurLandscapeDocument.ts";

/**
 * Kallur ground tint — the far ring of the turf plan (kallur-brief.md §5.3).
 *
 * At distance the Faroe slope is carried by colour, not blades: large
 * yellow-green mottling, olive base, rock showing through past the walkable
 * gradient, and the trodden path drawn in dirt. Every colour below is the
 * measured overcast palette from reference-01; the deliberate dullness is
 * the place's character — do not "enliven" it.
 */

const FLAT = [0x6d / 255, 0x70 / 255, 0x46 / 255] as const;

const GRASS_BASE = [0x6d / 255, 0x70 / 255, 0x46 / 255] as const;
const GRASS_ALT = [0x75 / 255, 0x76 / 255, 0x41 / 255] as const;
const GRASS_LIT = [0xb3 / 255, 0xb3 / 255, 0x74 / 255] as const;
const GRASS_SHADOW = [0x44 / 255, 0x4a / 255, 0x2b / 255] as const;
const ROCK_MID = [0x6d / 255, 0x71 / 255, 0x65 / 255] as const;
const ROCK_DARK = [0x38 / 255, 0x42 / 255, 0x42 / 255] as const;
const PATH_DIRT = [0x6b / 255, 0x5f / 255, 0x4e / 255] as const;

function hashLattice(ix: number, iz: number, seed: number): number {
  const value = Math.sin(ix * 127.1 + iz * 311.7 + seed * 74.7) * 43758.5453;
  return value - Math.floor(value);
}

function smootherstep(value: number): number {
  const t = Math.max(0, Math.min(1, value));
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function valueNoise(x: number, z: number, seed: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = smootherstep(x - ix);
  const fz = smootherstep(z - iz);
  const a = hashLattice(ix, iz, seed);
  const b = hashLattice(ix + 1, iz, seed);
  const c = hashLattice(ix, iz + 1, seed);
  const d = hashLattice(ix + 1, iz + 1, seed);
  const top = a + (b - a) * fx;
  const bottom = c + (d - c) * fx;
  return (top + (bottom - top) * fz) * 2 - 1;
}

function mix(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  t: number,
): [number, number, number] {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

const tintCache = new Map<string, readonly [number, number, number]>();

export function kallurGroundTint(
  x: number,
  z: number,
): readonly [number, number, number] {
  const key = `${x.toFixed(3)}:${z.toFixed(3)}`;
  const cached = tintCache.get(key);
  if (cached) return cached;

  const sample = kallurLandscapeSampler.sample(x, z);
  const center = sample.elevation;
  const epsilon = 1.2;
  const east = kallurLandscapeSampler.elevationAt(x + epsilon, z);
  const west = kallurLandscapeSampler.elevationAt(x - epsilon, z);
  const south = kallurLandscapeSampler.elevationAt(x, z + epsilon);
  const north = kallurLandscapeSampler.elevationAt(x, z - epsilon);
  const gradient = Math.hypot(
    (east - west) / (2 * epsilon),
    (south - north) / (2 * epsilon),
  );
  // Real concavity of the field: negative in hollows, positive on mounds.
  // This is the hummocks' own ambient shading — the value channel carries
  // the fur even where smoothed normals iron it out of the light.
  const relief = center - (east + west + south + north) / 4;

  // Large mottling: two independent scales so no repeat reads at frame scale.
  const macro = valueNoise(x / 17, z / 17, 41);
  const patch = valueNoise(x / 29, z / 29, 87);

  let color = mix(GRASS_BASE, GRASS_ALT, 0.5 + 0.5 * macro);
  // Sunlit yellow patches survive the overcast: broad, rare, never on rock.
  const lit = smootherstep((patch - 0.18) / 0.5) * (1 - smootherstep((gradient - 1.0) / 0.4));
  color = mix(color, GRASS_LIT, lit * 0.8);
  // DEMOTED to a macro whisper (carpet-port-plan: single-owner law). The
  // per-pixel cascade band now owns hummock-scale light and hollows; the
  // vertex channel keeps only a soft ambient echo of the real field so the
  // smoothed mesh normals do not iron the big mounds completely flat. The
  // 5.3 m mottle is gone - the band's moss and patch octaves cover it.
  const hollow = smootherstep((-relief - 0.04) / 0.22) * 0.3;
  color = mix(color, GRASS_SHADOW, Math.min(1, hollow));
  const crown = smootherstep((relief - 0.05) / 0.24);
  color = mix(color, GRASS_LIT, crown * 0.12);
  // Past the walkable gradient grass thins into rock; near-vertical is
  // stone. Faroese turf holds far steeper than a lowland lawn — the rock
  // families start only where the reference slopes actually bare (the
  // 1.05 start greyed every hillside two steps too early).
  color = mix(color, ROCK_MID, smootherstep((gradient - 1.35) / 0.6));
  color = mix(color, ROCK_DARK, smootherstep((gradient - 2.6) / 0.9));
  // The trodden line owns its dirt.
  color = mix(color, PATH_DIRT, sample.pathWeight * 0.85);

  const brightness = 1 + relief * 0.2;
  const tint: readonly [number, number, number] = [
    (color[0] * brightness) / FLAT[0],
    (color[1] * brightness) / FLAT[1],
    (color[2] * brightness) / FLAT[2],
  ];
  tintCache.set(key, tint);
  return tint;
}
