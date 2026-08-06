import {
  DUTCH_POLDER_CHANNELS,
  dutchPolderLandAt,
  type DutchPolderPoint2,
} from "../content/scenes/dutchPolder/dutchPolderTerrainGraybox.ts";
import {
  dutchPolderLandscapeMesh,
  dutchPolderVisualTopAt,
} from "../content/scenes/dutchPolder/dutchPolderLandscapeDocument.ts";
import { WATER_LEVEL, softenPolyline } from "./dutchPolderWaterModel.ts";

/**
 * The fall at a polder mouth.
 *
 * Reads the world and changes nothing in it: the channels, the shell and the
 * water sheet are all somebody else's, and this model only measures them. The
 * lip follows the triangles `LandscapeSurface` actually draws, and how much
 * water leaves each strip of that lip comes from the weir law applied to the
 * head standing over it — so the curtain's silhouette is the ground's, not a
 * shape somebody drew.
 */

/**
 * Which mouths pour. `C1-main:head` is the river's west end, where the carved
 * bed still reaches the shoreline; the east end stops 4 m short of it and the
 * ground climbs back over the water plane, so nothing can leave there until
 * the terrain says otherwise.
 */
export const SPILL_VEIL_MOUTH_IDS: readonly string[] = ["C1-main:head"];

/** Off means no fall at all — the only honest A/B for what it costs. */
export const POLDER_SPILL_ENABLED = true;

/**
 * Below this the fall is not worth its frame.
 *
 * A waterfall is decoration. A playable rate is not, and this is the most
 * expensive decoration on the rim: three alpha sheets of overdraw plus a mist
 * pool, all of it in front of a scene that already pays for a planar mirror
 * and a refraction pass. So it is the first thing shed, exactly as the wind is.
 */
export const SPILL_FPS_FLOOR = 30;
/** How long a window the rate is judged over before the fall is switched off. */
export const SPILL_JUDGE_PERIOD = 1;
/** How long it stays off before it is worth spending a second to try again. */
export const SPILL_RETRY_PERIOD = 60;
/**
 * Seconds ignored after every switch.
 *
 * Turning the curtain back on costs a pipeline warm-up that says nothing about
 * what it costs to keep drawing, and the smoothed rate it is judged by still
 * holds the reading from while it was off. Judge inside that moment and a
 * machine that could afford the fall switches it straight back off, for ever.
 */
export const SPILL_WARMUP = 0.5;

export interface SpillPower {
  readonly on: boolean;
  /** Seconds accumulated in the current phase — judging, or resting. */
  readonly timer: number;
  /** Seconds left to ignore after the last switch. */
  readonly warmup: number;
  /** The rate the last completed judgement saw. */
  readonly measured: number;
}

export const initialSpillPower = (): SpillPower => ({
  on: POLDER_SPILL_ENABLED,
  timer: 0,
  warmup: SPILL_WARMUP,
  measured: 0,
});

/**
 * One step of the fall's own kill switch.
 *
 * `fps` is not measured here: `performanceGovernor` already smooths one frame
 * rate for the whole scene, and a second judge with its own smoothing would
 * disagree with the first — the wind would shed at one moment and the water at
 * another, on the same stutter.
 */
export function stepSpillPower(
  power: SpillPower,
  delta: number,
  fps: number,
): SpillPower {
  if (!POLDER_SPILL_ENABLED) return { ...power, on: false };
  if (!(delta > 0)) return power;
  if (power.warmup > 0) {
    return { ...power, warmup: Math.max(0, power.warmup - delta) };
  }
  const timer = power.timer + delta;
  if (power.on) {
    if (timer < SPILL_JUDGE_PERIOD) return { ...power, timer };
    if (fps >= SPILL_FPS_FLOOR) {
      return { ...power, timer: 0, measured: fps };
    }
    return { on: false, timer: 0, warmup: 0, measured: fps };
  }
  if (timer < SPILL_RETRY_PERIOD) return { ...power, timer };
  // Try again: whatever was loading the machine a minute ago may be gone.
  return { on: true, timer: 0, warmup: SPILL_WARMUP, measured: power.measured };
}

export const SPILL_GRAVITY = 9.81;

/**
 * Broad-crested weir discharge `q = C·h^1.5` per metre of crest. C = 1.7 is
 * the textbook value for a rounded earth sill, which is what a canal bed
 * running out of island is.
 */
export const WEIR_COEFFICIENT = 1.7;

/**
 * Below this head there is no nappe. A centimetre of water going over an edge
 * does not leave it — surface tension holds it against the rock and it runs
 * down the face as a wet streak. Draw a curtain there and the fall comes out
 * wider than the river feeding it.
 */
const MINIMUM_HEAD = 0.02;

/**
 * Two different offsets, because they answer two different questions. The
 * crest PROFILE has to be read where there is still shell to read (inland of
 * the last triangle); the curtain has to HANG past that triangle, or its top
 * rows are drawn over the bank and the water, which is what put a white band
 * inside the olive canal.
 */
export const LIP_SAMPLE_INSET = 0.35;
export const LIP_PLACE_OFFSET = 0.02;

/** How far past its last authored point an end may still reach the rim. */
const SPILL_REACH = 4.5;

const EDGE_PROBE_STEP = 0.2;
const EDGE_PROBE_SPAN = 7;

/**
 * Continuity: nothing goes over the lip that the river did not carry to it.
 *
 * The polder is the only world whose ground exists twice — an authored carve
 * and the voxel-smoothed shell that is actually drawn — and the two disagree
 * by more than the thing being measured. Measured on this mouth: the carve
 * holds a constant 6.2 m section, the drawn shell holds 5.4–5.8 m, its trough
 * WANDERS 0.65 m sideways between stations, and point for point the smoothing
 * moves the ground by +0.19/−0.22 m in the same cross-section. One bank is
 * pushed in exactly where the other is pulled out.
 *
 * So continuity may not be asked of a STRIP. Sampling a fixed offset from the
 * authored centreline four metres apart does not follow one part of the river;
 * it lands in a different part of the section each time, and taking the worst
 * of four such misregistrations subtracts the wander from the width. That cost
 * 1.8 m of a 6.8 m crest here, and it threw away the shallow wings — the very
 * strips that make a fall feather instead of ending on a rectangle.
 *
 * Continuity is a property of a SECTION. The integral over a section does not
 * care where the trough is, only how much water it holds, so it survives the
 * wander that defeats every per-strip test. The narrowest section therefore
 * caps the DISCHARGE, and the width is read at the lip alone, one sample, with
 * nothing accumulated along the way.
 */
const APPROACH_STATIONS = [0.8, 1.6, 2.4, 3.2, 4.2];

/** Curtain resolution. Columns follow the wetted lip, rows follow fall time. */
export const VEIL_COLUMNS = 24;
export const VEIL_ROWS = 12;
/**
 * How deep the fall is built. One surface always reads flat no matter how it
 * is shaded, so the curtain is three of them at different distances from the
 * rock, each on its own phase of the same field: the strands then cross each
 * other and the thing has a front and a back. The rear and front sheets stop
 * early — below that depth there is no coherent water left to be in front of.
 */
export const VEIL_LAYERS = [
  { offset: -0.17, span: 0.66, phase: 0.37, shade: 0.7 },
  { offset: 0, span: 1, phase: 0, shade: 1 },
  { offset: 0.28, span: 0.58, phase: 0.71, shade: 1.14 },
] as const;
/**
 * The fall is drawn until its own alpha has reached zero, never until the
 * geometry runs out.
 *
 * There is no cliff to fall past. This island's rim is an irregular polygon,
 * and `WorldEdge` builds its rock skirt only for circular rims — with
 * `edgeBoundary` set it draws fog and nothing else. So the polder does not
 * pour down a rock face, it pours into a cloud sea, and the honest end of the
 * fall is where that cloud closes over it. The fog wall is already solid below
 * `uTopY + warp - uFeather`, which is between -0.25 and -3.45 as the noise
 * warps it; painting a white ribbon past that was painting over an opaque
 * surface. 1.2 s of fall is 6.7 m, and the mist has it by then.
 */
export const VEIL_FALL_TIME = 1.2;
/**
 * Where the curtain fades out, in world Y — matched to the fog wall it
 * dissolves into, not to a cliff. The numbers are written out rather than
 * imported because that module drags react-three-fiber in with it.
 */
export const VEIL_FADE_FROM = -2.2;
export const VEIL_FADE_TO = -6;

/**
 * Falling water is not a point mass, but it is very nearly a ballistic one.
 *
 * Both laws are linear drag with one time constant, and the time constant of
 * WATER in air is long: `τ = ρ_water·d / (½·ρ_air·C_d)` is 8 s for the 5 mm
 * strands a torn sheet becomes, 200 s for the 16 cm sheet leaving the lip, and
 * still 3 s for millimetre droplets. The old 0.55 s was the drag of something
 * far lighter than water: it capped the outward throw at 1.13 m for the whole
 * fall, so the jet clung to the rim like a stain instead of leaving it, and it
 * ran the fall itself 25% slow. At 8 s the nappe clears the lip by 3 m by the
 * time it is spray, and drops 6.7 m in 1.2 s against 7.1 m of free fall.
 */
export const OUTWARD_TAU = 8;
export const FALL_TAU = 8;

export const spillOutwardShape = (time: number): number =>
  OUTWARD_TAU * (1 - Math.exp(-time / OUTWARD_TAU));

export const spillDropShape = (time: number): number =>
  SPILL_GRAVITY * FALL_TAU * (time - FALL_TAU * (1 - Math.exp(-time / FALL_TAU)));

/**
 * Speed of a parcel that left the lip `time` ago. The curtain's continuity —
 * how fast the sheet thins as it accelerates — is this and nothing else, so
 * the shader and the spray both read it here instead of each carrying its own
 * approximation of gravity.
 */
export const spillFallSpeed = (time: number): number =>
  SPILL_GRAVITY * FALL_TAU * (1 - Math.exp(-time / FALL_TAU));

/**
 * The spray, as an emitter rather than a shape.
 *
 * A mesh cannot be mist: whatever you draw on it, it has its own silhouette
 * and shows you a polygon edge. What is airborne here is the fraction the
 * sheet tears off, and the air that fell with it. Physically both are one
 * thing: the sheet drags air down at roughly a quarter of its own speed, the
 * drops it sheds are millimetre-sized and reach terminal velocity in under a
 * second, so the cloud LAGS the water — and once it has nothing left to
 * follow it turns and rises. That lag and that turn are the whole reason a
 * waterfall has a cloud instead of a clean edge, and they are exactly what a
 * packet with drag and late buoyancy already does in `billowSmoke`.
 */
export const SPRAY_RATE = 7;
/**
 * Where along the fall a packet is torn off, in seconds of fall time. It has
 * to stay inside `VEIL_FALL_TIME`: a packet born past the end of the curtain
 * is mist with no water above it.
 */
export const SPRAY_BIRTH_FROM = 0.25;
export const SPRAY_BIRTH_TO = 1.15;
/** Fraction of the water's speed the entrained air keeps. */
export const SPRAY_ENTRAINMENT = 0.28;
/** Sideways throw from the tearing itself, m/s. */
export const SPRAY_LATERAL = 0.6;
/** Outward push of the air the sheet dragged with it, m/s. */
export const SPRAY_OUTWARD = 0.35;
export const SPRAY_LIFE_FROM = 3.2;
export const SPRAY_LIFE_TO = 4.6;
export const SPRAY_BUOYANCY_FROM = 1.3;
export const SPRAY_BUOYANCY_TO = 2.6;
export const SPRAY_SIZE_FROM = 0.5;
export const SPRAY_SIZE_TO = 1.05;
export const SPRAY_DENSITY_FROM = 0.26;
export const SPRAY_DENSITY_TO = 0.46;

export interface SprayPacket {
  readonly origin: readonly [number, number, number];
  readonly velocity: readonly [number, number, number];
  readonly buoyancy: number;
  readonly life: number;
  readonly size: number;
  readonly density: number;
  readonly seed: number;
}

/**
 * One packet, torn off the curtain where the curtain actually is. It reads the
 * same fall laws the mesh does, so the cloud cannot drift off the water it
 * came from.
 */
export function planSprayPacket(
  lip: SpillLip,
  random: () => number,
  wind: readonly [number, number],
): SprayPacket {
  const { anchor, outward } = lip.mouth;
  const across = lip.wettedFrom
    + (lip.wettedTo - lip.wettedFrom) * random();
  const age = SPRAY_BIRTH_FROM
    + (SPRAY_BIRTH_TO - SPRAY_BIRTH_FROM) * random();
  const distance = spillLipDistanceAt(lip, across);
  const velocity = interpolateColumns(lip, across, "velocity");
  const top = WATER_LEVEL - interpolateColumns(lip, across, "drawdown");
  const reach = spillOutwardShape(age) * velocity;
  const spread = across * (1 + age * age * 0.09);

  // Speed of the water at that point, and the share of it the air keeps.
  const falling = (velocity + spillFallSpeed(age)) * SPRAY_ENTRAINMENT;
  const outwardSpeed = velocity * Math.exp(-age / OUTWARD_TAU)
    * SPRAY_ENTRAINMENT + SPRAY_OUTWARD;
  const sideways = (random() - 0.5) * 2 * SPRAY_LATERAL;

  return {
    origin: [
      anchor[0] + outward[0] * (distance + reach) - outward[1] * spread,
      top - spillDropShape(age),
      anchor[1] + outward[1] * (distance + reach) + outward[0] * spread,
    ],
    velocity: [
      outward[0] * outwardSpeed - outward[1] * sideways + wind[0],
      -falling,
      outward[1] * outwardSpeed + outward[0] * sideways + wind[1],
    ],
    buoyancy: SPRAY_BUOYANCY_FROM
      + (SPRAY_BUOYANCY_TO - SPRAY_BUOYANCY_FROM) * random(),
    life: SPRAY_LIFE_FROM + (SPRAY_LIFE_TO - SPRAY_LIFE_FROM) * random(),
    size: SPRAY_SIZE_FROM + (SPRAY_SIZE_TO - SPRAY_SIZE_FROM) * random(),
    density: SPRAY_DENSITY_FROM
      + (SPRAY_DENSITY_TO - SPRAY_DENSITY_FROM) * random(),
    seed: random(),
  };
}

export type PolderSpillEnd = "head" | "tail";

export interface PolderSpillMouth {
  readonly id: string;
  readonly channelId: string;
  readonly end: PolderSpillEnd;
  /** Last authored point of that end, after the same single Chaikin pass. */
  readonly anchor: DutchPolderPoint2;
  /** Unit vector pointing off the island along the channel. */
  readonly outward: DutchPolderPoint2;
  /** Metres from `anchor` to the shoreline; negative when already outside. */
  readonly shoreDistance: number;
}

function unitFrom(
  from: DutchPolderPoint2,
  to: DutchPolderPoint2,
): DutchPolderPoint2 {
  const dx = to[0] - from[0];
  const dz = to[1] - from[1];
  const length = Math.hypot(dx, dz);
  return [dx / length, dz / length];
}

function shoreCrossing(
  anchor: DutchPolderPoint2,
  outward: DutchPolderPoint2,
): number | null {
  const at = (distance: number) => dutchPolderLandAt(
    anchor[0] + outward[0] * distance,
    anchor[1] + outward[1] * distance,
  );
  let inside = -4;
  while (inside < SPILL_REACH && !at(inside)) inside += 0.05;
  if (!at(inside)) return null;
  let outside = inside;
  while (outside < SPILL_REACH + 0.5 && at(outside)) outside += 0.05;
  if (at(outside)) return null;
  for (let step = 0; step < 12; step += 1) {
    const middle = (inside + outside) / 2;
    if (at(middle)) inside = middle;
    else outside = middle;
  }
  return (inside + outside) / 2;
}

function mouthAt(
  channelId: string,
  points: readonly DutchPolderPoint2[],
  end: PolderSpillEnd,
): PolderSpillMouth | null {
  const anchor = end === "head" ? points[0] : points[points.length - 1];
  const inner = end === "head" ? points[1] : points[points.length - 2];
  const outward = unitFrom(inner, anchor);
  const shoreDistance = shoreCrossing(anchor, outward);
  if (shoreDistance === null || shoreDistance > SPILL_REACH) return null;
  return { id: `${channelId}:${end}`, channelId, end, anchor, outward, shoreDistance };
}

/** Every authored channel end that reaches the island's rim. */
export const DUTCH_POLDER_SPILL_MOUTHS: readonly PolderSpillMouth[] =
  DUTCH_POLDER_CHANNELS.flatMap((channel) => {
    const points = softenPolyline(channel.points) as readonly DutchPolderPoint2[];
    return (["head", "tail"] as const)
      .map((end) => mouthAt(channel.id, points, end))
      .filter((mouth): mouth is PolderSpillMouth => mouth !== null);
  });

// Where the drawn shell ends. The authored shoreline is a polygon but the
// turf is meshed on the 2 m render lattice, and the two disagree by up to a
// cell — a fall has to leave the edge the player can see, not the one the
// document knows about.
const shellPitch = dutchPolderLandscapeMesh.minimumCellSize;
const shellQuads = new Set<string>();
let shellMinimumX = Number.POSITIVE_INFINITY;
let shellMinimumZ = Number.POSITIVE_INFINITY;
for (const chunk of dutchPolderLandscapeMesh.chunks) {
  for (let offset = 0; offset < chunk.vertices.length; offset += 4) {
    const corner = chunk.vertices[offset];
    if (!corner) continue;
    shellQuads.add(`${corner[0].toFixed(4)}:${corner[2].toFixed(4)}`);
    shellMinimumX = Math.min(shellMinimumX, corner[0]);
    shellMinimumZ = Math.min(shellMinimumZ, corner[2]);
  }
}

function shellCovers(x: number, z: number): boolean {
  const latticeX = Math.floor((x - shellMinimumX) / shellPitch + 1e-9);
  const latticeZ = Math.floor((z - shellMinimumZ) / shellPitch + 1e-9);
  const originX = shellMinimumX + latticeX * shellPitch;
  const originZ = shellMinimumZ + latticeZ * shellPitch;
  return shellQuads.has(`${originX.toFixed(4)}:${originZ.toFixed(4)}`);
}

export interface SpillLipColumn {
  /** Metres across the mouth, zero on the channel centreline. */
  readonly across: number;
  /** Metres from the mouth anchor to the lip along the outward direction. */
  readonly distance: number;
  /** Height of the shell at the lip. */
  readonly lipY: number;
  /** Water standing over that crest. */
  readonly head: number;
  /** Discharge per metre of crest. */
  readonly discharge: number;
  /** Speed the water leaves the lip with. */
  readonly velocity: number;
  /** Thickness of the sheet as it leaves — the brink depth, not the head. */
  readonly depth: number;
  /** How far the surface has already sagged at the lip itself. */
  readonly drawdown: number;
}

export interface SpillLip {
  readonly mouth: PolderSpillMouth;
  /**
   * How far the lip runs out per metre across it. The shoreline crosses every
   * mouth on the diagonal — 2.4 m of it at the main canal — so the edge the
   * water leaves is NOT perpendicular to the channel, and anything that ends
   * on a square line stops short on one side and hangs over on the other.
   */
  readonly slope: number;
  /**
   * Where that line sits on the centreline. The sheet's last ring and the
   * curtain's top row are both `intercept + slope · across` — one line, so
   * they meet by construction instead of by two measurements agreeing.
   */
  readonly intercept: number;
  readonly columns: readonly SpillLipColumn[];
  readonly wettedFrom: number;
  readonly wettedTo: number;
  /** Total discharge of the mouth, m³/s. */
  readonly discharge: number;
  /**
   * How much of the crest's free discharge the approach can actually feed,
   * 0…1. The narrowest section upstream sets it; see `APPROACH_STATIONS`.
   */
  readonly continuity: number;
}

/** The lip line, shared by the sheet's last ring and the curtain's top row. */
export const polderLipLineAt = (lip: SpillLip, across: number): number =>
  lip.intercept + lip.slope * across;

function shellEdgeAt(mouth: PolderSpillMouth, across: number): number | null {
  const [ax, az] = mouth.anchor;
  const [ox, oz] = mouth.outward;
  for (
    let distance = mouth.shoreDistance + 3;
    distance >= mouth.shoreDistance - 6;
    distance -= 0.05
  ) {
    const x = ax + ox * distance - oz * across;
    const z = az + oz * distance + ox * across;
    if (shellCovers(x, z)) return distance;
  }
  return null;
}

/**
 * The critical section at a free overfall. The brink is not the normal depth:
 * the surface has already dropped to about 0.715 of the critical depth by the
 * time it leaves, and that bend is what the eye reads as "going over".
 */
/**
 * A free overfall drops its surface to about 0.715 of the critical depth by
 * the time it leaves the brink, and that bend is what the eye reads as "going
 * over".
 */
const BRINK_RATIO = 0.715;

/**
 * What one metre of crest does with the water standing on it.
 *
 * `continuity` is how much of the crest's free discharge the approach can
 * feed. It scales the FLOW, never the width: a crest wider than the section
 * behind it carries thinner, slower water, it does not carry a narrower
 * ribbon. The old code answered this by clamping the head against the authored
 * bed datum, which measured the head on the drawn shell and then limited it by
 * a surface the player cannot see — and, because the clamp bit over most of
 * the mouth, handed 14 of 26 wet columns identical speed and identical
 * thickness. A curtain of constant thickness is the one thing a waterfall
 * never is.
 */
function brinkFlow(head: number, continuity: number) {
  if (head <= MINIMUM_HEAD) {
    return { discharge: 0, velocity: 0, depth: 0, drawdown: 0 };
  }
  const discharge = WEIR_COEFFICIENT * head ** 1.5 * continuity;
  const critical = (discharge * discharge / SPILL_GRAVITY) ** (1 / 3);
  const depth = BRINK_RATIO * critical;
  return {
    discharge,
    velocity: discharge / depth,
    depth,
    drawdown: head - depth,
  };
}

/**
 * The drawdown, as one number instead of a profile.
 *
 * Substituting the weir law into the brink depth collapses it: the critical
 * depth of `C·h^1.5` is proportional to `h`, so `depth = k·head` exactly and
 * therefore `drawdown = (1 − k)·head` — LINEAR in the head, with a single
 * constant for the whole mouth. That is what lets the sheet and the curtain
 * share one law rather than the sheet approximating the curtain's profile with
 * an ellipse. The ellipse was not a cosmetic difference: at 3 m across this
 * mouth it sank the sheet 3 cm BELOW its own bed and printed soil through the
 * river.
 */
export const spillDrawdownRatio = (continuity: number): number =>
  1 - BRINK_RATIO * (WEIR_COEFFICIENT ** 2 * continuity ** 2 / SPILL_GRAVITY) ** (1 / 3);

function measureLip(mouth: PolderSpillMouth): SpillLip {
  const [ax, az] = mouth.anchor;
  const [ox, oz] = mouth.outward;
  const at = (distance: number, across: number): DutchPolderPoint2 => [
    ax + ox * distance - oz * across,
    az + oz * distance + ox * across,
  ];
  const probes: Array<{ across: number; edge: number | null }> = [];
  for (
    let across = -EDGE_PROBE_SPAN;
    across <= EDGE_PROBE_SPAN + 1e-9;
    across += EDGE_PROBE_STEP
  ) {
    probes.push({ across, edge: shellEdgeAt(mouth, across) });
  }
  // The crest, read at the lip and nowhere else. One sample per strip, on the
  // shell the scene actually draws, so nothing upstream can be misregistered
  // against it — the width of this fall is the width of that water and that is
  // the whole of it.
  const crestAt = (edge: number, across: number) =>
    dutchPolderVisualTopAt(...at(edge - LIP_SAMPLE_INSET, across));
  const heads = probes.map(({ across, edge }) => edge === null
    ? 0
    : WATER_LEVEL - crestAt(edge, across));

  // The shoreline is a straight segment at every mouth, so the lip is a
  // straight diagonal across the channel — 2.4 m of it at this one. Fitting
  // that line keeps the 2 m render lattice from putting a step in the
  // waterfall; the measured edge still clamps it so no vertex leaves the shell.
  let count = 0;
  let sumAcross = 0;
  let sumEdge = 0;
  let sumAcrossEdge = 0;
  let sumAcrossSquared = 0;
  for (const [index, probe] of probes.entries()) {
    if (probe.edge === null || heads[index] <= MINIMUM_HEAD) continue;
    count += 1;
    sumAcross += probe.across;
    sumEdge += probe.edge;
    sumAcrossEdge += probe.across * probe.edge;
    sumAcrossSquared += probe.across * probe.across;
  }
  const denominator = count * sumAcrossSquared - sumAcross * sumAcross;
  const slope = count > 1 && Math.abs(denominator) > 1e-6
    ? (count * sumAcrossEdge - sumAcross * sumEdge) / denominator
    : 0;
  const intercept = count > 0 ? (sumEdge - slope * sumAcross) / count : 0;

  // Continuity, asked of whole sections rather than of single strips. The
  // integral does not care that the smoothed trough wanders 0.65 m between
  // stations; a fixed offset from the authored centreline does, and that is
  // what used to eat 1.8 m of this crest.
  const sectionDischarge = (back: number) => {
    let total = 0;
    for (
      let across = -EDGE_PROBE_SPAN;
      across <= EDGE_PROBE_SPAN + 1e-9;
      across += EDGE_PROBE_STEP
    ) {
      const top = dutchPolderVisualTopAt(
        ...at(intercept + slope * across - LIP_SAMPLE_INSET - back, across),
      );
      const head = WATER_LEVEL - top;
      if (head > MINIMUM_HEAD) {
        total += WEIR_COEFFICIENT * head ** 1.5 * EDGE_PROBE_STEP;
      }
    }
    return total;
  };
  const freeDischarge = heads.reduce(
    (total, head) => total
      + (head > MINIMUM_HEAD ? WEIR_COEFFICIENT * head ** 1.5 * EDGE_PROBE_STEP : 0),
    0,
  );
  const approachDischarge = Math.min(...APPROACH_STATIONS.map(sectionDischarge));
  const continuity = freeDischarge > 0
    ? Math.min(1, approachDischarge / freeDischarge)
    : 1;

  const columns: SpillLipColumn[] = probes.map(({ across, edge }) => {
    const fitted = intercept + slope * across;
    // Read where there is shell to read, hang the curtain on the fitted line.
    const shellEdge = edge === null ? fitted : Math.min(fitted, edge);
    const lipY = edge === null ? WATER_LEVEL + 1 : crestAt(shellEdge, across);
    const head = Math.max(0, WATER_LEVEL - lipY);
    return {
      across,
      distance: fitted + LIP_PLACE_OFFSET,
      lipY,
      head,
      ...brinkFlow(head, continuity),
    };
  });

  const wet = columns.filter((column) => column.discharge > 0);
  return {
    mouth,
    slope,
    intercept,
    columns,
    continuity,
    wettedFrom: wet.length ? wet[0].across : 0,
    wettedTo: wet.length ? wet[wet.length - 1].across : 0,
    discharge: columns.reduce(
      (total, column) => total + column.discharge * EDGE_PROBE_STEP,
      0,
    ),
  };
}

const lips = new Map<string, SpillLip>();

/** Measured lip of one mouth. Probing the shell is not free; do it once. */
export function polderSpillLip(id: string): SpillLip | undefined {
  const cached = lips.get(id);
  if (cached) return cached;
  const mouth = DUTCH_POLDER_SPILL_MOUTHS.find((entry) => entry.id === id);
  if (!mouth) return undefined;
  const measured = measureLip(mouth);
  lips.set(id, measured);
  return measured;
}

/**
 * Every mouth measured, whether or not a curtain is drawn there. Where the
 * water ENDS is hydrology and true of all four; whether it is painted falling
 * is a separate decision.
 */
export const POLDER_MOUTH_LIPS: readonly SpillLip[] = DUTCH_POLDER_SPILL_MOUTHS
  .map((mouth) => polderSpillLip(mouth.id))
  .filter((lip): lip is SpillLip => lip !== undefined);

/**
 * The reach each channel end is allowed, and the lean of its lip. The sheet
 * leans its last rings by that slope, so it meets the diagonal edge along its
 * whole width instead of stopping short on one side and hanging over on the
 * other.
 */
export const polderSheetSpills = () => POLDER_MOUTH_LIPS.map((lip) => ({
  channelId: lip.mouth.channelId,
  end: lip.mouth.end,
  // The lip LINE, not a column of it. The curtain's top row is the same line
  // plus `LIP_PLACE_OFFSET`, so the two meet by construction — the dark band
  // of bare bed between the river and the fall was those two answers being
  // measured separately and disagreeing.
  distance: lip.intercept,
  slope: lip.slope,
}));

/** The mouths that pour, in the order their geometry is built. */
export const POLDER_SPILL_LIPS: readonly SpillLip[] = POLDER_SPILL_ENABLED
  ? SPILL_VEIL_MOUTH_IDS
    .map((id) => polderSpillLip(id))
    .filter((lip): lip is SpillLip => lip !== undefined)
  : [];

function interpolateColumns<Key extends keyof SpillLipColumn>(
  lip: SpillLip,
  across: number,
  key: Key,
): number {
  const first = lip.columns[0];
  const last = lip.columns[lip.columns.length - 1];
  if (across <= first.across) return first[key];
  if (across >= last.across) return last[key];
  const position = (across - first.across) / EDGE_PROBE_STEP;
  const index = Math.min(lip.columns.length - 2, Math.floor(position));
  const blend = position - index;
  return lip.columns[index][key] * (1 - blend)
    + lip.columns[index + 1][key] * blend;
}

export const spillLipDistanceAt = (lip: SpillLip, across: number): number =>
  interpolateColumns(lip, across, "distance");

/**
 * Over how many metres the surface bends into the fall. The drawdown of a
 * free overfall is felt for roughly twenty critical depths upstream, which is
 * about four metres here; what floats on the water is dragged out over rather
 * more than that, so the two reaches are separate.
 */
export const APPROACH_REACH = 4;
export const GATHER_MULTIPLIER = 1.9;

/**
 * How far the surface has already dropped at `across`, metres.
 *
 * A point query rather than a baked profile, because the sheet is built on the
 * CPU and can therefore ask this once per vertex. The first attempt handed the
 * vertex shader a 64-sample strip texture instead — which cost a vertex
 * texture fetch, a filtering mode and a precision budget to answer a question
 * that was already answerable exactly, offline, with no GPU involved at all.
 */
export const spillDrawdownAt = (lip: SpillLip, across: number): number =>
  interpolateColumns(lip, across, "drawdown");

/** Metres across the mouth of a world point, in the lip's own frame. */
export function spillAcrossAt(
  lip: SpillLip,
  worldX: number,
  worldZ: number,
): number {
  const [anchorX, anchorZ] = lip.mouth.anchor;
  const [outwardX, outwardZ] = lip.mouth.outward;
  return -(worldX - anchorX) * outwardZ + (worldZ - anchorZ) * outwardX;
}

export interface SpillApproach {
  /** A point on the lip line, world XZ. */
  readonly origin: readonly [number, number];
  /** Unit NORMAL of the lip line, pointing off the island. */
  readonly outward: readonly [number, number];
  /** Deepest sag anywhere across the mouth, metres. */
  readonly sag: number;
  /** Over how far upstream that drop happens. */
  readonly reach: number;
  /** Half the wetted mouth, so the bend does not spread along the whole bank. */
  readonly halfWidth: number;
}

/**
 * What the water sheet needs to know about the fall waiting for it: one line
 * and three numbers. The bend ACROSS the mouth is not here — it is a per-vertex
 * question, and `spillDrawdownAt` answers it once per vertex where the sheet is
 * built. The sheet's own geometry, rings and attributes stay exactly as they
 * were authored.
 */
export function polderSpillApproach(lip: SpillLip): SpillApproach {
  const centre = (lip.wettedFrom + lip.wettedTo) / 2;
  const { anchor, outward } = lip.mouth;
  const distance = polderLipLineAt(lip, centre);
  const wet = lip.columns.filter((column) => column.discharge > 0);
  // The lip runs `slope` metres downstream per metre across, so its normal
  // leans by that much too. Bending the sheet along the perpendicular instead
  // would run the drawdown into the bank on one side of the mouth.
  const length = Math.hypot(1, lip.slope);
  const normal: readonly [number, number] = [
    (outward[0] + outward[1] * lip.slope) / length,
    (outward[1] - outward[0] * lip.slope) / length,
  ];
  const sag = wet.reduce(
    (deepest, column) => Math.max(deepest, column.drawdown),
    0,
  );
  const halfWidth = (lip.wettedTo - lip.wettedFrom) / 2 + 0.4;
  return {
    origin: [
      anchor[0] + outward[0] * distance - outward[1] * centre,
      anchor[1] + outward[1] * distance + outward[0] * centre,
    ],
    outward: normal,
    sag,
    reach: APPROACH_REACH,
    halfWidth,
  };
}

export interface SpillVeilModel {
  readonly positions: Float32Array;
  /**
   * (age s, across m, brink depth m, lip speed m/s). Age is what the water
   * remembers: the shader's streak coordinate is `now - age`, so a feature
   * stays on one parcel for its whole fall and therefore accelerates and
   * stretches exactly as that parcel does, at no cost.
   */
  readonly veil: Float32Array;
  /**
   * (noise phase, how much light it gets, the age it fades out at). The
   * sheets must not share a phase, or they collapse back into the one surface
   * they were; and none of them may simply END, or the cut shows.
   */
  readonly sheet: Float32Array;
  readonly indices: Uint32Array;
  readonly triangles: number;
  readonly mouths: readonly string[];
}

/**
 * One curtain per mouth, in one buffer: the polder pays a single draw call no
 * matter how many of its channels reach the rim. Rows are stepped in fall
 * TIME, not in metres — all the shape is in the first half second.
 */
export function buildSpillVeilModel(
  spills: readonly SpillLip[] = POLDER_SPILL_LIPS,
): SpillVeilModel {
  const positions: number[] = [];
  const veil: number[] = [];
  const sheets: number[] = [];
  const indices: number[] = [];

  for (const lip of spills) {
    const { anchor, outward } = lip.mouth;
    // Out to where the head crosses the nappe threshold and the interpolated
    // depth runs to nothing. The curtain then has no geometric side at all: it
    // thins to zero thickness of its own accord, instead of ending on a
    // vertical cut that still carried a third of its opacity.
    const from = lip.wettedFrom - EDGE_PROBE_STEP;
    const to = lip.wettedTo + EDGE_PROBE_STEP;

    const column = (index: number, count: number) => {
      const across = from + ((to - from) * index) / count;
      return {
        across,
        // The lip LINE — the same one the sheet's last ring lies on.
        distance: polderLipLineAt(lip, across) + LIP_PLACE_OFFSET,
        depth: interpolateColumns(lip, across, "depth"),
        velocity: interpolateColumns(lip, across, "velocity"),
        top: WATER_LEVEL - interpolateColumns(lip, across, "drawdown"),
      };
    };
    const place = (
      site: ReturnType<typeof column>,
      reach: number,
      spread: number,
      height: number,
    ) => {
      positions.push(
        anchor[0] + outward[0] * (site.distance + reach) - outward[1] * spread,
        height,
        anchor[1] + outward[1] * (site.distance + reach) + outward[0] * spread,
      );
    };
    const stitch = (base: number, columns: number, rows: number) => {
      const stride = rows + 1;
      for (let index = 0; index < columns; index += 1) {
        for (let row = 0; row < rows; row += 1) {
          const a = base + index * stride + row;
          indices.push(a, a + stride, a + 1, a + 1, a + stride, a + stride + 1);
        }
      }
    };

    for (const layer of VEIL_LAYERS) {
      const base = positions.length / 3;
      for (let index = 0; index <= VEIL_COLUMNS; index += 1) {
        const site = column(index, VEIL_COLUMNS);
        for (let row = 0; row <= VEIL_ROWS; row += 1) {
          const time = (VEIL_FALL_TIME * row) / VEIL_ROWS;
          // The sheets leave the lip as ONE body and only draw apart as they
          // break up. Separated at the lip they read as stacked onion skins.
          const layered = layer.offset * Math.min(1, time / 0.35);
          // Torn water spreads: what leaves as a 4 m tongue is half a metre
          // wider by the time it is spray.
          const spread = site.across * (1 + time * time * 0.05);
          place(
            site,
            spillOutwardShape(time) * site.velocity + layered,
            spread,
            site.top - spillDropShape(time),
          );
          veil.push(time, site.across, site.depth, site.velocity);
          sheets.push(layer.phase, layer.shade, VEIL_FALL_TIME * layer.span);
        }
      }
      stitch(base, VEIL_COLUMNS, VEIL_ROWS);
    }

  }

  return {
    positions: new Float32Array(positions),
    veil: new Float32Array(veil),
    sheet: new Float32Array(sheets),
    indices: new Uint32Array(indices),
    triangles: indices.length / 3,
    mouths: spills.map((lip) => lip.mouth.id),
  };
}
