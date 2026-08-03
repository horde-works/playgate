import { DUTCH_POLDER_CHANNELS } from "../content/scenes/dutchPolder/dutchPolderTerrainGraybox.ts";

export type WaterPoint2 = readonly [x: number, z: number];

// One hard datum for the whole polder: the brief puts the visual water plane at
// Y = 0.00 and the channel beds at -0.25. Eight centimetres of freeboard keeps
// the sheet visibly over the bed while it still disappears into the sloped
// bank instead of exposing a mesh edge.
export const WATER_LEVEL = 0.08;
/** Bank half-width the landscape carves beside every channel bed. */
export const BANK_WIDTH = 2.4;
/**
 * The sheet is cut wider than any water can be and lets measured depth decide
 * where it stops, so the waterline follows the meshed bank rather than a
 * symmetric ribbon border.
 */
export const BANK_MARGIN = 0.2;
/**
 * Every free end runs on past the authored channel and dies inside the
 * overrun. Ends that stop on rising ground are killed by depth anyway; ends
 * that reach the island rim have nothing under them and need the fade.
 */
export const END_OVERRUN = 4.5;
export const CENTRELINE_STEP = 1.2;
export const ACROSS_SPANS = 6;
/** How far above the waterline the bank stays visibly damp. */
export const DAMP_COLLAR_HEIGHT = 0.09;

export const waterSheetHalfWidth = (channelWidth: number): number =>
  channelWidth / 2 + BANK_WIDTH + BANK_MARGIN;

function normalizedDirection(from: WaterPoint2, to: WaterPoint2): WaterPoint2 {
  const dx = to[0] - from[0];
  const dz = to[1] - from[1];
  const length = Math.hypot(dx, dz);
  return [dx / length, dz / length];
}

/**
 * Chaikin corner cut. The landscape document softens every channel exactly
 * once before carving its bed, so the sheet must be softened identically or it
 * drifts off its own trench at the bends.
 */
export function softenPolyline(
  points: readonly WaterPoint2[],
): readonly WaterPoint2[] {
  const softened: WaterPoint2[] = [points[0]];
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

export function overrunEnds(
  points: readonly WaterPoint2[],
  distance: number,
): readonly WaterPoint2[] {
  const head = normalizedDirection(points[1], points[0]);
  const tail = normalizedDirection(
    points[points.length - 2],
    points[points.length - 1],
  );
  const first = points[0];
  const last = points[points.length - 1];
  return [
    [first[0] + head[0] * distance, first[1] + head[1] * distance],
    ...points,
    [last[0] + tail[0] * distance, last[1] + tail[1] * distance],
  ];
}

export function resampleCentreline(
  points: readonly WaterPoint2[],
  step: number,
): readonly WaterPoint2[] {
  const dense: WaterPoint2[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const [ax, az] = points[index - 1];
    const [bx, bz] = points[index];
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / step));
    for (let sample = 0; sample < steps; sample += 1) {
      const t = sample / steps;
      dense.push([ax + (bx - ax) * t, az + (bz - az) * t]);
    }
  }
  dense.push(points[points.length - 1]);
  return dense;
}

export interface WaterSheetModel {
  /**
   * Local XY, packed as (worldX, -worldZ, 0). Water's planar mirror expects a
   * plane in local XY; the mesh is rotated -90° about X, which maps local -Y
   * onto world +Z.
   */
  readonly positions: Float32Array;
  /** Metres along the channel, metres across it — the frame ripples live in. */
  readonly flow: Float32Array;
  /** Normalised distance across the sheet, and the free-end fade. */
  readonly shape: Float32Array;
  /** Channel direction in world XZ, so ripple slopes can be rotated into it. */
  readonly tangents: Float32Array;
  readonly indices: Uint32Array;
  readonly ringsPerChannel: readonly number[];
}

/** Every polder channel as one sheet: one mirror pass, one refraction pass. */
export function buildWaterSheetModel(): WaterSheetModel {
  const positions: number[] = [];
  const flow: number[] = [];
  const shape: number[] = [];
  const tangents: number[] = [];
  const indices: number[] = [];
  const ringsPerChannel: number[] = [];

  for (const channel of DUTCH_POLDER_CHANNELS) {
    const halfWidth = waterSheetHalfWidth(channel.width);
    const centreline = resampleCentreline(
      overrunEnds(softenPolyline(channel.points), END_OVERRUN),
      CENTRELINE_STEP,
    );
    ringsPerChannel.push(centreline.length);

    const arc: number[] = [0];
    for (let index = 1; index < centreline.length; index += 1) {
      arc.push(arc[index - 1] + Math.hypot(
        centreline[index][0] - centreline[index - 1][0],
        centreline[index][1] - centreline[index - 1][1],
      ));
    }
    const total = arc[arc.length - 1];
    const base = positions.length / 3;

    for (let index = 0; index < centreline.length; index += 1) {
      const point = centreline[index];
      const previous = centreline[Math.max(0, index - 1)];
      const next = centreline[Math.min(centreline.length - 1, index + 1)];
      const incoming = normalizedDirection(previous, point);
      const outgoing = normalizedDirection(point, next);
      let tangentX = incoming[0] + outgoing[0];
      let tangentZ = incoming[1] + outgoing[1];
      if (index === 0) [tangentX, tangentZ] = outgoing;
      if (index === centreline.length - 1) [tangentX, tangentZ] = incoming;
      const tangentLength = Math.hypot(tangentX, tangentZ);
      tangentX /= tangentLength;
      tangentZ /= tangentLength;
      const normalX = -tangentZ;
      const normalZ = tangentX;
      // Full strength across the authored channel, dying inside the overrun.
      const fromEnd = Math.min(arc[index], total - arc[index]);
      const edge = Math.max(0, Math.min(1, fromEnd / END_OVERRUN));
      const edgeFade = edge * edge * (3 - 2 * edge);

      for (let column = 0; column <= ACROSS_SPANS; column += 1) {
        const across = (column / ACROSS_SPANS) * 2 - 1;
        const offset = across * halfWidth;
        positions.push(
          point[0] + normalX * offset,
          -(point[1] + normalZ * offset),
          0,
        );
        // Ripple, drift and weed are authored in metres of the canal itself,
        // so no texture has to know where the canal runs in world space.
        flow.push(arc[index], offset);
        shape.push(Math.abs(across), edgeFade);
        tangents.push(tangentX, tangentZ);
      }
    }

    const stride = ACROSS_SPANS + 1;
    for (let ring = 0; ring < centreline.length - 1; ring += 1) {
      for (let column = 0; column < ACROSS_SPANS; column += 1) {
        const a = base + ring * stride + column;
        const b = a + 1;
        const c = a + stride;
        const d = c + 1;
        // Along and across form a left-handed pair in the local XY plane, so
        // this winding is what leaves the front face and mirror normal up.
        indices.push(a, b, c, b, d, c);
      }
    }
  }

  return {
    positions: new Float32Array(positions),
    flow: new Float32Array(flow),
    shape: new Float32Array(shape),
    tangents: new Float32Array(tangents),
    indices: new Uint32Array(indices),
    ringsPerChannel,
  };
}
