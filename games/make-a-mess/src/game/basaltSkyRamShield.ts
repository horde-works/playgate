import {
  type BasaltForceFieldCell,
  type BasaltForceFieldPose,
  createBasaltForceFieldProjection,
  projectedCell,
} from "./basaltForceField.ts";
import { BASALT_SKY_RAM_ORIGIN } from "./basaltSkyRam.ts";
import type { SceneVector3 } from "./destructionScene.ts";

/**
 * The ram's own projected screen.
 *
 * The fortress protects stone that cannot move, so its cells are authored
 * where they stand. A carrier cannot do that: its plates are authored in the
 * hull's own frame, relative to `BASALT_SKY_RAM_ORIGIN`, and the queries are
 * carried into that frame by the carrier pose. Nothing about the membrane,
 * the capacity or the blast rings differs — only whose coordinates they are.
 *
 * What it covers, and why exactly that: the engine channel. Each engine hangs
 * on a `core` tagged `required: true`, so a single rocket into a nacelle does
 * not weaken that side, it deletes the whole throttle channel — and a carrier
 * with a dead required actuator is refused an escape route and goes down.
 * The screen therefore spans the steel armour belt and the nacelles below it,
 * on both sides. It does NOT reach the gallery: a passenger standing in an
 * open sky gallery is meant to be exposed.
 */

/** Grid radius. Finer than the curtain wall: this is a machine, not a wall. */
const RAM_GRID_RADIUS = 0.62;

/** Screen band in world height, from under the nacelles to the belt top. */
const BAND_LOW_Y = 7.9;
const BAND_HIGH_Y = 14.3;

/** Longitudinal reach along the hull, measured from the ram origin. */
const BAND_AFT_A = -16.4;
const BAND_FORE_A = 10.6;

/**
 * How far outside the widest structure the screen stands. Large enough that a
 * rolling hull never pushes a plate through its own sponson, small enough that
 * the screen still reads as belonging to the ship rather than haloing it.
 */
const STANDOFF = 0.55;

/**
 * Measured hull envelope inside the screen band: the widest piece found at
 * each station, rounded outward. Authored as a table rather than derived at
 * runtime so the screen cannot silently change shape when a fitting moves —
 * a test compares it against the real pieces instead.
 */
const HULL_HALF_WIDTH: readonly (readonly [number, number])[] = [
  [-16.4, 1.1],
  [-15.0, 2.2],
  [-14.0, 4.5],
  [-12.0, 4.5],
  [-10.0, 4.5],
  [-9.0, 5.3],
  [-6.0, 5.7],
  [-2.0, 6.0],
  [2.0, 6.0],
  [6.0, 5.3],
  [8.0, 4.3],
  [10.0, 2.6],
  [10.6, 1.6],
];

function hullHalfWidthAt(a: number): number {
  const first = HULL_HALF_WIDTH[0];
  const last = HULL_HALF_WIDTH[HULL_HALF_WIDTH.length - 1];
  if (a <= first[0]) return first[1];
  if (a >= last[0]) return last[1];
  for (let index = 1; index < HULL_HALF_WIDTH.length; index += 1) {
    const [aheadA, aheadHalf] = HULL_HALF_WIDTH[index];
    if (a > aheadA) continue;
    const [behindA, behindHalf] = HULL_HALF_WIDTH[index - 1];
    const t = (a - behindA) / (aheadA - behindA);
    return behindHalf + (aheadHalf - behindHalf) * t;
  }
  return last[1];
}

/** Screen half-width: the hull envelope plus its stand-off. */
export function basaltSkyRamScreenHalfWidth(a: number): number {
  return hullHalfWidthAt(a) + STANDOFF;
}

/**
 * Outward normal of the screen surface at a station. The screen is not a flat
 * slab: where the hull tapers toward bow and stern the plates turn with it, so
 * a shot arriving from ahead meets a face rather than an edge.
 */
function screenNormal(side: number, a: number): SceneVector3 {
  const step = 0.25;
  const slope =
    (basaltSkyRamScreenHalfWidth(a + step) -
      basaltSkyRamScreenHalfWidth(a - step)) /
    (2 * step);
  // Surface tangent along the hull is (slope * side, 0, 1); the outward normal
  // is perpendicular to it in that plane.
  return [side, 0, -slope * side];
}

function appendSideCells(
  cells: BasaltForceFieldCell[],
  side: -1 | 1,
): void {
  const network = side < 0 ? "ram-port" : "ram-starboard";
  const originY = BASALT_SKY_RAM_ORIGIN[1];
  for (let q = -24; q <= 24; q += 1) {
    const a = RAM_GRID_RADIUS * 1.5 * q;
    if (a < BAND_AFT_A || a > BAND_FORE_A) continue;
    const halfWidth = basaltSkyRamScreenHalfWidth(a);
    for (let r = -24; r <= 24; r += 1) {
      const worldY =
        originY + Math.sqrt(3) * RAM_GRID_RADIUS * (r + q / 2);
      if (worldY < BAND_LOW_Y || worldY > BAND_HIGH_Y) continue;
      cells.push(projectedCell(
        network,
        q,
        r,
        cells.length,
        // Hull-local: lateral, height above the origin, longitudinal.
        [side * halfWidth, worldY - originY, a],
        screenNormal(side, a),
        RAM_GRID_RADIUS,
        "stronghold:sky-ram:force-field",
      ));
    }
  }
}

/**
 * The bow cap.
 *
 * Two side screens leave the one hole that matters: a shot from dead ahead
 * passes between them untouched, and the bow is where this machine is least
 * able to take it. All of its lift lives in 56 skin panels, twenty of them
 * packed into the last three metres of the nose, and the reserve only covers
 * the loss of nine — so one rocket into that crowd used to take the buoyancy
 * with it. The cap is the forward half of an ellipsoid fitted to the bow, and
 * it deliberately stops above the mooring node and the ram beak: those are
 * structure, not gas, and the berth jaw must reach the nose unobstructed.
 */
const CAP_JOINT_A = 6.6;
const CAP_CENTRE_Y = 13.2;
/** Fitted so every hull corner forward of the joint clears by 0.53 m. */
const CAP_LATERAL = 5.78;
const CAP_VERTICAL = 6.07;
const CAP_LONGITUDINAL = 5.2;
/**
 * The rim stops short of the equator. Exactly there the surface normal turns
 * vertical, where a horizontal tangent basis has nothing to be built from, and
 * the side screens already cover what the last few degrees would.
 */
const CAP_POLAR_LIMIT = (84 * Math.PI) / 180;
/** Rings of plates from the nose out to the rim. */
const CAP_RINGS = 8;

function appendBowCapCells(cells: BasaltForceFieldCell[]): void {
  const originY = BASALT_SKY_RAM_ORIGIN[1];
  for (let ring = 0; ring <= CAP_RINGS; ring += 1) {
    const theta = (CAP_POLAR_LIMIT * ring) / CAP_RINGS;
    // One plate at the nose, then enough per ring to keep the spacing even.
    const count = ring === 0
      ? 1
      : Math.max(6, Math.round((2 * Math.PI * Math.sin(theta) * CAP_LATERAL) /
          (Math.sqrt(3) * RAM_GRID_RADIUS)));
    for (let index = 0; index < count; index += 1) {
      const phi = (2 * Math.PI * index) / count;
      const sinTheta = Math.sin(theta);
      const lateral = CAP_LATERAL * sinTheta * Math.cos(phi);
      const vertical = CAP_VERTICAL * sinTheta * Math.sin(phi);
      const longitudinal = CAP_LONGITUDINAL * Math.cos(theta);
      // Ellipsoid normal is the gradient, not the radius: on a stretched
      // surface those differ, and a plate must face the way its own surface
      // does or a glancing shot slips behind it.
      const normal: SceneVector3 = [
        lateral / (CAP_LATERAL * CAP_LATERAL),
        vertical / (CAP_VERTICAL * CAP_VERTICAL),
        longitudinal / (CAP_LONGITUDINAL * CAP_LONGITUDINAL),
      ];
      cells.push(projectedCell(
        "ram-bow",
        ring,
        index,
        cells.length,
        [lateral, CAP_CENTRE_Y + vertical - originY, CAP_JOINT_A + longitudinal],
        normal,
        RAM_GRID_RADIUS,
        "stronghold:sky-ram:force-field",
      ));
    }
  }
}

export function createBasaltSkyRamShieldCells(): readonly BasaltForceFieldCell[] {
  const cells: BasaltForceFieldCell[] = [];
  appendSideCells(cells, -1);
  appendSideCells(cells, 1);
  appendBowCapCells(cells);
  return cells;
}

export const BASALT_SKY_RAM_SHIELD_CELLS = createBasaltSkyRamShieldCells();

export const BASALT_SKY_RAM_SHIELD_PROJECTION = createBasaltForceFieldProjection(
  BASALT_SKY_RAM_SHIELD_CELLS,
);

/**
 * The screen's pose from the carrier's live body offset. It reads the same
 * offset and orientation the hull pieces are drawn with, so the two cannot
 * drift apart: there is no second integration and no second source of truth.
 */
export function basaltSkyRamShieldPose(
  bodyOffset: SceneVector3,
  orientation: readonly [number, number, number, number],
): BasaltForceFieldPose {
  return {
    position: [
      BASALT_SKY_RAM_ORIGIN[0] + bodyOffset[0],
      BASALT_SKY_RAM_ORIGIN[1] + bodyOffset[1],
      BASALT_SKY_RAM_ORIGIN[2] + bodyOffset[2],
    ],
    orientation,
  };
}
