import {
  DUTCH_POLDER_CHANNELS,
  dutchPolderLandAt,
  type DutchPolderChannel,
  type DutchPolderPoint2,
} from "./dutchPolderTerrainGraybox.ts";

/**
 * Where the polder's water leaves the island.
 *
 * The plan-level half of the hydrology: which channel ends actually reach the
 * rim, and how far the bed has to be carved so they still have a channel when
 * they get there. It knows the authored channels and the shoreline and nothing
 * else, so the landscape document can import it while carving — the compiled
 * surface is read only by the render-side spill model, a layer above this one.
 */

/** The datum every channel bed is carved to, before any local scour. */
export const POLDER_CHANNEL_BED = -0.25;

/** How far past its last authored point an end may reach the shoreline. */
export const SPILL_REACH = 4.5;

/**
 * The bed carve must continue PAST the lip, or the channel closes itself. The
 * sampler measures distance to the polyline, so beyond the last authored point
 * it reads bank, then terrace, and the ground climbs back over the water plane.
 * Measured before this existed: the main canal arrived at its west mouth as a
 * 4.0 m tongue under 27 cm of head instead of the 6.2 m river that feeds it,
 * and its east mouth was dammed outright at +0.09 m against a 0.08 m water
 * plane — the brief's own acceptance says a lip meets Y = 0 with no uphill.
 */
export const SPILL_CARVE_OVERRUN = 2;

/**
 * Scour at the brink. Water leaving an edge does not leave a flat bed behind
 * it: the last few metres are where it moves fastest and it wears them down,
 * evenly and deepest right at the drop. Modelling that is not decoration —
 * the surface sags into the fall by about half the head it carries, so on the
 * authored bed there is barely fifteen centimetres between the sagging sheet
 * and the ground under it, and the first lattice cell that rounds the wrong
 * way puts soil texture through the water. The scour buys that clearance in
 * the only way that also looks right.
 *
 * Two nested steps rather than one: voxel smoothing turns a stair into a ramp,
 * and a ramp is what a scoured sill is.
 */
export const SPILL_SCOUR_STEPS = [
  { reach: 6.5, drop: 0.14, bedWidth: 3.2, bankWidth: 0.7 },
  { reach: 3.2, drop: 0.28, bedWidth: 3, bankWidth: 0.7 },
] as const;

export type PolderSpillEnd = "head" | "tail";

export interface PolderSpillMouth {
  /** `<channel id>:<end>`, e.g. `C1-main:head`. */
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

/**
 * Chaikin corner cut. The landscape carves softened channels, the sheet is cut
 * from softened channels and the mouths are found on softened channels — one
 * implementation, or they drift apart at the bends.
 */
export function softenPolyline(
  points: readonly DutchPolderPoint2[],
): readonly DutchPolderPoint2[] {
  const softened: DutchPolderPoint2[] = [points[0]];
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    softened.push(
      [from[0] * 0.75 + to[0] * 0.25, from[1] * 0.75 + to[1] * 0.25],
      [from[0] * 0.25 + to[0] * 0.75, from[1] * 0.25 + to[1] * 0.75],
    );
  }
  softened.push(points[points.length - 1]);
  return softened;
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

/**
 * Distance along `outward` at which the shoreline is crossed, bisected to a
 * centimetre. The mouth is the one place where the bed, the sheet and the fall
 * all have to name the same point.
 */
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
  channel: DutchPolderChannel,
  end: PolderSpillEnd,
): PolderSpillMouth | null {
  const points = softenPolyline(channel.points);
  const anchor = end === "head" ? points[0] : points[points.length - 1];
  const inner = end === "head" ? points[1] : points[points.length - 2];
  const outward = unitFrom(inner, anchor);
  const shoreDistance = shoreCrossing(anchor, outward);
  if (shoreDistance === null || shoreDistance > SPILL_REACH) return null;
  return {
    id: `${channel.id}:${end}`,
    channelId: channel.id,
    end,
    anchor,
    outward,
    shoreDistance,
  };
}

/**
 * Every authored channel end that reaches the rim. `C1` runs clean across the
 * island and spills at both ends; `C2` and `C4` are the brief's named
 * southwest and east mouths; `C3` stops 7.5 m short and stays a field drain.
 */
export const DUTCH_POLDER_SPILL_MOUTHS: readonly PolderSpillMouth[] =
  DUTCH_POLDER_CHANNELS.flatMap((channel) =>
    (["head", "tail"] as const)
      .map((end) => mouthAt(channel, end))
      .filter((mouth): mouth is PolderSpillMouth => mouth !== null)
  );

/**
 * The centreline the landscape carves: the authored line, softened once, then
 * run past every mouth so the bed is still full depth and full width where the
 * ground ends. Outside the shoreline nothing is meshed, so the overrun costs
 * no terrain — it only stops the channel from closing itself at the rim.
 */
export interface PolderScourCarve {
  readonly id: string;
  readonly points: readonly DutchPolderPoint2[];
  /** Metres the bed is worn below the channel's own datum. */
  readonly drop: number;
  readonly bankWidth: number;
  /**
   * A steep-sided slot that never reaches the water plane. This is not a
   * width choice, it is the way to have no width choice at all: with sides
   * rising 28 cm over 70 cm, the scour rejoins the channel's own profile half
   * a metre BELOW the surface, so the waterline stays the main carve's and the
   * river cannot bulge at its own mouth. Trying instead to pre-compensate a
   * wide scour is unwinnable — voxel smoothing eats 1.14 m of width from the
   * canal's section but only 0.21 m from a trench 28 cm deeper, so every
   * analytic answer lands somewhere else.
   */
  readonly bedWidth: number;
}

/** The first `distance` metres of a polyline, walked from one end. */
function polylineHead(
  points: readonly DutchPolderPoint2[],
  distance: number,
): readonly DutchPolderPoint2[] {
  const walked: DutchPolderPoint2[] = [points[0]];
  let travelled = 0;
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    const span = Math.hypot(to[0] - from[0], to[1] - from[1]);
    if (travelled + span >= distance) {
      const blend = (distance - travelled) / span;
      walked.push([
        from[0] + (to[0] - from[0]) * blend,
        from[1] + (to[1] - from[1]) * blend,
      ]);
      return walked;
    }
    walked.push(to);
    travelled += span;
  }
  return walked;
}

/**
 * The worn sills, one nested pair per mouth. They follow the CHANNEL'S OWN
 * line, not a straight run to the edge: a scour cut on its own axis diverges
 * from the bed it is supposed to be deepening, and a metre upstream the sheet
 * is floating over the bank of a second trench nobody authored.
 */
export function polderScourCarves(
  channel: DutchPolderChannel,
): readonly PolderScourCarve[] {
  const carves: PolderScourCarve[] = [];
  const carve = polderCarveCentreline(channel);
  for (const mouth of DUTCH_POLDER_SPILL_MOUTHS) {
    if (mouth.channelId !== channel.id) continue;
    const line = mouth.end === "head" ? carve : [...carve].reverse();
    for (const [index, step] of SPILL_SCOUR_STEPS.entries()) {
      carves.push({
        id: `${mouth.id}:scour${index}`,
        points: polylineHead(line, SPILL_CARVE_OVERRUN + step.reach),
        drop: step.drop,
        bedWidth: step.bedWidth,
        bankWidth: step.bankWidth,
      });
    }
  }
  return carves;
}

export function polderCarveCentreline(
  channel: DutchPolderChannel,
): readonly DutchPolderPoint2[] {
  const points = [...softenPolyline(channel.points)];
  for (const mouth of DUTCH_POLDER_SPILL_MOUTHS) {
    if (mouth.channelId !== channel.id) continue;
    const distance = mouth.shoreDistance + SPILL_CARVE_OVERRUN;
    const extended: DutchPolderPoint2 = [
      mouth.anchor[0] + mouth.outward[0] * distance,
      mouth.anchor[1] + mouth.outward[1] * distance,
    ];
    if (mouth.end === "head") points.unshift(extended);
    else points.push(extended);
  }
  return points;
}
