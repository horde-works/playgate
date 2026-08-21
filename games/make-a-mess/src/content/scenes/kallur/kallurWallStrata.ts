import type { LandscapeSampler } from "../../landscape/landscapeDocument.ts";

/**
 * Kallur wall strata — the seam where turf breaks into rock (bible §I).
 *
 * The crown's seaward face is near-vertical in the landscape field, and a
 * stretched heightfield face is a bun, not a mountain. The cliff character
 * comes from cladding: columns of layered courses anchored TO the field —
 * each layer finds the actual face at its own height by bisection, so the
 * geometry is taken from the surface function, never eyeballed against it.
 *
 * The thin dark seams between columns are deliberate: basalt is vertically
 * jointed, and the columnar reading is the reference's own structure. Grass
 * ledges interrupt random courses, and every column ends in a ragged turf
 * lip — the sod lapping over the first course, so no straight turf|rock
 * line survives longer than a few metres.
 */

export interface KallurStratumLayer {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly along: number;
  readonly height: number;
  readonly depth: number;
  /** 0..1 palette pick across the strata tones. */
  readonly tone: number;
  /** True for the turf ledges and the top lip. */
  readonly turf: boolean;
}

function hash(a: number, b: number): number {
  const value = Math.sin(a * 127.1 + b * 311.7 + 17.9) * 43758.5453;
  return value - Math.floor(value);
}

/** Seaward arc of the wall crown, west to east. */
const FACE_CHAIN: readonly (readonly [number, number])[] = [
  [-16, -76],
  [-6, -96],
  [38, -92],
  [66, -74],
];

const CROWN_INTERIOR = [26, -68] as const;
const STATION_SPACING = 4.2;
const SEAM = 0.06;

export function generateKallurWallStrata(
  sampler: LandscapeSampler,
): readonly KallurStratumLayer[] {
  const layers: KallurStratumLayer[] = [];
  // The wall lives on LAND. With the coastal apron the field continues
  // seaward and the face bisection happily marches onto it — 53 courses
  // once relocated into open water. A stratum whose plan position is not
  // land does not exist.
  const onLand = (x: number, z: number): boolean =>
    sampler.sample(x, z).groundKind === "land";

  for (let segment = 1; segment < FACE_CHAIN.length; segment += 1) {
    const [ax, az] = FACE_CHAIN[segment - 1];
    const [bx, bz] = FACE_CHAIN[segment];
    const segmentLength = Math.hypot(bx - ax, bz - az);
    const stations = Math.max(1, Math.round(segmentLength / STATION_SPACING));
    const spacing = segmentLength / stations;
    const tangentX = (bx - ax) / segmentLength;
    const tangentZ = (bz - az) / segmentLength;
    // Outward: perpendicular pointing away from the crown interior.
    let normalX = -tangentZ;
    let normalZ = tangentX;
    const midX = (ax + bx) / 2;
    const midZ = (az + bz) / 2;
    if (
      normalX * (CROWN_INTERIOR[0] - midX) + normalZ * (CROWN_INTERIOR[1] - midZ) > 0
    ) {
      normalX = -normalX;
      normalZ = -normalZ;
    }
    const yaw = -Math.atan2(tangentZ, tangentX);

    for (let station = 0; station < stations; station += 1) {
      const t = (station + 0.5) / stations;
      const sx = ax + (bx - ax) * t;
      const sz = az + (bz - az) * t;
      const seed = segment * 100 + station;

      const fieldAt = (offset: number) =>
        sampler.elevationAt(sx + normalX * offset, sz + normalZ * offset);

      // The face runs from the outer foot up to the local crown top.
      const footY = fieldAt(9) + 0.4;
      const topY = fieldAt(-5) - 0.6;
      if (topY - footY < 6) continue;

      // Where is the face at height y? The field falls outward, so bisect.
      const faceOffsetAt = (y: number): number | null => {
        let inner = -6;
        let outer = 16;
        if (fieldAt(inner) < y || fieldAt(outer) > y) return null;
        for (let step = 0; step < 20; step += 1) {
          const middle = (inner + outer) / 2;
          if (fieldAt(middle) > y) inner = middle;
          else outer = middle;
        }
        return (inner + outer) / 2;
      };

      let y = footY;
      let course = 0;
      while (y < topY) {
        const layerHeight = 1.9 + hash(seed, course) * 0.7;
        const centreY = y + layerHeight / 2;
        const faceOffset = faceOffsetAt(centreY);
        if (faceOffset === null) break;
        const depth = 2.8 + hash(seed, course + 40) * 0.8;
        const jitter = (hash(seed, course + 80) - 0.5) * 0.36;
        // Embedded by 0.4 behind the face, proud by roughly a metre.
        const outwardCentre = faceOffset - 0.4 + jitter;
        if (!onLand(sx + normalX * outwardCentre, sz + normalZ * outwardCentre)) { y += layerHeight; course += 1; continue; }
        layers.push({
          id: `strata:${segment}:${station}:${course}`,
          x: sx + normalX * outwardCentre,
          y: centreY,
          z: sz + normalZ * outwardCentre,
          yaw,
          along: spacing - SEAM,
          height: layerHeight,
          depth,
          tone: hash(seed, course + 120),
          turf: false,
        });
        // Grass ledges interrupt the rock on random upper courses. Inset on
        // every axis: a ledge sharing a plane with its course z-fights, and
        // a ledge reaching the next course up becomes an intersection. Corner
        // stations carry no ledges — at a chain kink a rotated ledge reaches
        // into the neighbouring segment's column.
        const cornerStation = station === 0 || station === stations - 1;
        if (!cornerStation && y > footY + 8 && hash(seed, course + 160) < 0.2
          && onLand(
            sx + normalX * (outwardCentre + depth / 2 - 0.72),
            sz + normalZ * (outwardCentre + depth / 2 - 0.72),
          )) {
          layers.push({
            id: `strata:${segment}:${station}:${course}:ledge`,
            x: sx + normalX * (outwardCentre + depth / 2 - 0.72),
            y: y + layerHeight + 0.17,
            z: sz + normalZ * (outwardCentre + depth / 2 - 0.72),
            // A 2.3-degree twist keeps every ledge face non-parallel to the
            // course planes: the whole ripple class dies at once.
            yaw: yaw + 0.04,
            along: (spacing - SEAM) * 0.86,
            height: 0.22,
            depth: 0.9 + hash(seed, course + 200) * 0.5,
            tone: hash(seed, course + 240),
            turf: true,
          });
        }
        y += layerHeight;
        course += 1;
      }

      // The ragged turf lip: sod lapping over the top course, its depth
      // jittered so no straight turf|rock line survives.
      const lipOffset = faceOffsetAt(Math.min(topY, y) - 0.4);
      if (lipOffset !== null) {
        // Per-station setback jitter: after the tonal-mass octave moved the
        // face function, a fixed 0.2 inset landed within ripple distance of
        // a course plane at two stations. The depth stays short of the next
        // course row — the sod shows its first half-metre, it does not
        // pierce the hill body behind.
        const lipSetback = 0.2 + hash(seed, 997) * 0.08;
        if (!onLand(
          sx + normalX * (lipOffset - lipSetback),
          sz + normalZ * (lipOffset - lipSetback),
        )) continue;
        layers.push({
          id: `strata:${segment}:${station}:lip`,
          x: sx + normalX * (lipOffset - lipSetback),
          // The lip SITS on the top course flush and hangs over its face;
          // 7 cm lower it embraced the course body - a visible-line cut.
          y: Math.min(topY, y) + 0.19,
          z: sz + normalZ * (lipOffset - lipSetback),
          yaw,
          // Inset from the course planes so the sod lip never z-fights them.
          along: (spacing - SEAM) * 0.94,
          height: 0.32,
          depth: 0.9 + hash(seed, 999) * 0.5,
          tone: hash(seed, 998),
          turf: true,
        });
      }
    }
  }

  return layers;
}
