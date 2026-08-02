import type { SceneVector3 } from "./destructionScene.ts";

/** Three direct rocket strikes exhaust one projected cell. */
export const BASALT_FORCE_FIELD_CELL_CAPACITY = 3;

const WALL_GRID_RADIUS = 1.15;
const TOWER_GRID_RADIUS = 0.9;

/**
 * The projection is founded well below the ground rather than trimmed at it.
 * A scalar cut leaves a saw-toothed bottom — in some columns the last hexagon
 * ends at the soil, in others half a metre above it — and a capsule walks
 * straight through those notches. Buried rows cost nothing on screen: the
 * terrain rejects them by depth.
 */
const GRID_FOOTING = -4.5;

/**
 * A network is one continuous membrane. Blast rings only travel inside one,
 * so the two sides of a hull must never share a network: a rocket on the port
 * screen has no business weakening starboard plates through the ship.
 */
export type BasaltForceFieldNetwork =
  | "wall"
  | "tower"
  | "ram-port"
  | "ram-starboard"
  | "ram-bow"
  | "nimbus-east"
  | "nimbus-west"
  | "nimbus-north"
  | "nimbus-south"
  | "nimbus-crown"
  | "nimbus-spindle-outward"
  | "nimbus-spindle-inward"
  | "nimbus-spindle-clockwise"
  | "nimbus-spindle-counterclockwise"
  | "nimbus-spindle-crown"
  | "nimbus-dock-rear"
  | "nimbus-dock-service"
  | "nimbus-dock-habitation"
  | "nimbus-dock-rear-crown"
  | "nimbus-dock-service-crown"
  | "nimbus-dock-habitation-crown";

export interface BasaltForceFieldCell {
  readonly index: number;
  readonly id: string;
  readonly network: BasaltForceFieldNetwork;
  readonly q: number;
  readonly r: number;
  readonly centre: SceneVector3;
  /** Protected face normal: from the fortress toward the player spawn. */
  readonly normal: SceneVector3;
  readonly tangentU: SceneVector3;
  readonly tangentV: SceneVector3;
  /** Mathematical coverage has no seams; the rendered plate is inset. */
  readonly collisionRadius: number;
  readonly visualRadius: number;
}

export interface BasaltForceFieldHit {
  readonly cellIndex: number;
  readonly cellId: string;
  readonly normal: SceneVector3;
  /** Travelled point; with clearance this is the protected actor centre. */
  readonly point: SceneVector3;
  readonly progress: number;
}

export type BasaltForceFieldImpactKind =
  | "rocket"
  | "grenade"
  | "machineGun";

/**
 * The membrane model. The projection is not a painted plate: an impulse pushes
 * a dish into it, the dish springs back through its rest plane, and the light
 * the player sees is emitted by the resulting strain in the lattice seams.
 * One physical quantity therefore drives both the shape and the glow.
 */

/**
 * The cinematic pipeline blooms above this value (`CinematicPostProcessing`
 * builds its `UnrealBloomPass` with threshold 1.6). A rocket core must cross
 * it: light that never reaches the threshold cannot spill onto the stone, and
 * an energy field that lights nothing around itself reads as paint.
 */
export const BASALT_FORCE_FIELD_BLOOM_THRESHOLD = 1.6;

/**
 * Measured clearance from the projection to the nearest fortress stone: 1.14 m
 * at the tightest point (wall buttress near x = 15, plate at z = 3.17 against
 * stone at z = 2.02). The membrane must stay well inside it, or the dish
 * punches into the wall and is cut off by the depth test.
 */
export const BASALT_FORCE_FIELD_STONE_CLEARANCE = 1.14;

/** Peak inward travel of the membrane under a full-strength impulse, metres. */
export const BASALT_FORCE_FIELD_DISH_DEPTH = 0.26;

/**
 * Amplitude of the colourless displacement wave that runs out across the whole
 * lattice, metres. It changes no colour of its own — the seams brighten only
 * because the wave strains them. Set to 0 to remove the ringing entirely.
 */
export const BASALT_FORCE_FIELD_RINGING = 0.014;

/** Brightness of the white-hot core at the point of impact. */
export const BASALT_FORCE_FIELD_CORE_GAIN = 5.2;

/** Sub-cell radius of that core, metres. */
export const BASALT_FORCE_FIELD_CORE_SIGMA = 0.5;

/** Impulses older than this no longer move the membrane. */
export const BASALT_FORCE_FIELD_IMPULSE_LIFETIME = 4;

/**
 * Pressing is not striking. A strike is an impulse — sharp dish, overshoot,
 * ringing. Presence leaning on the projection is a *sustained load*: a shallow
 * bowl that follows the contact point, deepens while the load holds and
 * relaxes when it goes. Same membrane, a different forcing term — and one that
 * never spends capacity, or the shield could be opened by leaning on it.
 */

/** Concurrent sustained loads: the player plus room for carried machinery. */
export const BASALT_FORCE_FIELD_MAX_PRESSES = 4;

/**
 * Inward travel of the bowl under a fully loaded press, metres. Deliberately
 * shallower and wider than any impact dish: leaning on the shield must never
 * strain the lattice harder than a rocket does, and the player leaning is
 * always half a metre from the surface, where a bright wash blinds them.
 */
export const BASALT_FORCE_FIELD_PRESS_DEPTH = 0.12;

/** Gaussian radius of that bowl — wider and softer than any impact. */
export const BASALT_FORCE_FIELD_PRESS_REACH = 1.25;

/** Distance at which the field starts answering an approach, metres. */
export const BASALT_FORCE_FIELD_APPROACH_RANGE = 0.7;

/**
 * How much of the press depth an approach bulges the membrane *outward*. The
 * sign is the whole point: the field leans toward what nears it and dents away
 * from what pushes it, so a barrier is never discovered by walking into it.
 */
export const BASALT_FORCE_FIELD_APPROACH_BULGE = 0.17;

/** Deepest the membrane can travel with every source loaded at once. */
export function basaltForceFieldWorstDeflection(): number {
  let strongest = 0;
  for (const impulse of Object.values(BASALT_FORCE_FIELD_IMPULSES)) {
    strongest = Math.max(strongest, impulse.strength);
  }
  return strongest * BASALT_FORCE_FIELD_DISH_DEPTH
    + BASALT_FORCE_FIELD_RINGING
    + BASALT_FORCE_FIELD_PRESS_DEPTH;
}

/**
 * Sustained loads, shaped for upload as `vec3[]` and `vec4[]` uniforms. The
 * load is signed: negative bulges outward on approach, positive dents inward
 * under contact, and one number therefore drives the whole encounter.
 */
export interface BasaltForceFieldPressBuffer {
  /** Three floats per slot: the point on the projection carrying the load. */
  readonly points: Float32Array;
  /** Four floats per slot: signed load, reach, unused, unused. */
  readonly data: Float32Array;
}

export function createBasaltForceFieldPressBuffer():
  BasaltForceFieldPressBuffer {
  return {
    points: new Float32Array(BASALT_FORCE_FIELD_MAX_PRESSES * 3),
    data: new Float32Array(BASALT_FORCE_FIELD_MAX_PRESSES * 4),
  };
}

export function setBasaltForceFieldPress(
  buffer: BasaltForceFieldPressBuffer,
  slot: number,
  point: SceneVector3 | null,
  load: number,
  reach = BASALT_FORCE_FIELD_PRESS_REACH,
): void {
  if (slot < 0 || slot >= BASALT_FORCE_FIELD_MAX_PRESSES) return;
  if (!point || Math.abs(load) < 1e-4) {
    buffer.data[slot * 4] = 0;
    return;
  }
  buffer.points[slot * 3] = point[0];
  buffer.points[slot * 3 + 1] = point[1];
  buffer.points[slot * 3 + 2] = point[2];
  buffer.data[slot * 4] = Math.max(-1, Math.min(1, load));
  buffer.data[slot * 4 + 1] = reach;
}

export function clearBasaltForceFieldPresses(
  buffer: BasaltForceFieldPressBuffer,
): void {
  buffer.points.fill(0);
  buffer.data.fill(0);
}

/** Concurrent impulses the projection can carry. */
export const BASALT_FORCE_FIELD_MAX_IMPACTS = 6;

export interface BasaltForceFieldImpulse {
  /** Scales both the dish depth and the core brightness. */
  readonly strength: number;
  /** Gaussian radius of the dish, metres. */
  readonly reach: number;
}

export const BASALT_FORCE_FIELD_IMPULSES: Readonly<
  Record<BasaltForceFieldImpactKind, BasaltForceFieldImpulse>
> = {
  rocket: { strength: 1, reach: 1.85 },
  grenade: { strength: 0.44, reach: 1.35 },
  machineGun: { strength: 0.13, reach: 0.5 },
};

/** Peak brightness of the core; compare against the bloom threshold. */
export function basaltForceFieldCoreIntensity(
  kind: BasaltForceFieldImpactKind,
): number {
  return BASALT_FORCE_FIELD_IMPULSES[kind].strength
    * BASALT_FORCE_FIELD_CORE_GAIN;
}

/** Deepest the membrane travels under one impulse; compare with clearance. */
export function basaltForceFieldPeakDeflection(
  kind: BasaltForceFieldImpactKind,
): number {
  return BASALT_FORCE_FIELD_IMPULSES[kind].strength
    * BASALT_FORCE_FIELD_DISH_DEPTH
    + BASALT_FORCE_FIELD_RINGING;
}

/**
 * Live impulses, shaped for direct upload as `vec3[]` and `vec4[]` uniforms.
 * The membrane is evaluated in the shader from these alone, so a hit costs no
 * per-frame CPU work and the analytic collision surface never moves.
 */
export interface BasaltForceFieldImpactBuffer {
  /** Three floats per slot: the world point the impulse arrived at. */
  readonly points: Float32Array;
  /** Four floats per slot: start time, strength, reach, unused. */
  readonly data: Float32Array;
  cursor: number;
}

export function createBasaltForceFieldImpactBuffer():
  BasaltForceFieldImpactBuffer {
  return {
    points: new Float32Array(BASALT_FORCE_FIELD_MAX_IMPACTS * 3),
    data: new Float32Array(BASALT_FORCE_FIELD_MAX_IMPACTS * 4),
    cursor: 0,
  };
}

export function clearBasaltForceFieldImpacts(
  buffer: BasaltForceFieldImpactBuffer,
): void {
  buffer.points.fill(0);
  buffer.data.fill(0);
  buffer.cursor = 0;
}

/**
 * Writes one impulse into the oldest slot and returns the slot used. It takes
 * an impulse rather than a weapon kind so that events which move the membrane
 * without damaging it — a body touching down, a load letting go — cannot leak
 * into the damage table by inventing a new kind.
 */
export function recordBasaltForceFieldImpact(
  buffer: BasaltForceFieldImpactBuffer,
  point: SceneVector3,
  impulse: BasaltForceFieldImpulse,
  time: number,
): number {
  const slot = buffer.cursor % BASALT_FORCE_FIELD_MAX_IMPACTS;
  buffer.cursor = (buffer.cursor + 1) % BASALT_FORCE_FIELD_MAX_IMPACTS;
  buffer.points[slot * 3] = point[0];
  buffer.points[slot * 3 + 1] = point[1];
  buffer.points[slot * 3 + 2] = point[2];
  buffer.data[slot * 4] = time;
  buffer.data[slot * 4 + 1] = impulse.strength;
  buffer.data[slot * 4 + 2] = impulse.reach;
  buffer.data[slot * 4 + 3] = 0;
  return slot;
}

/**
 * Retires spent impulses so the shader loop stays a no-op at rest. Returns
 * true when something changed, which is also the upload condition.
 */
export function expireBasaltForceFieldImpacts(
  buffer: BasaltForceFieldImpactBuffer,
  time: number,
): boolean {
  let changed = false;
  for (let slot = 0; slot < BASALT_FORCE_FIELD_MAX_IMPACTS; slot += 1) {
    const strength = buffer.data[slot * 4 + 1] ?? 0;
    if (strength <= 0) continue;
    if (time - (buffer.data[slot * 4] ?? 0) <= BASALT_FORCE_FIELD_IMPULSE_LIFETIME) {
      continue;
    }
    buffer.data[slot * 4 + 1] = 0;
    changed = true;
  }
  return changed;
}

function scale(value: SceneVector3, multiplier: number): SceneVector3 {
  return [
    value[0] * multiplier,
    value[1] * multiplier,
    value[2] * multiplier,
  ];
}

function cross(a: SceneVector3, b: SceneVector3): SceneVector3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function normalize(value: SceneVector3): SceneVector3 {
  const length = Math.hypot(...value) || 1;
  return scale(value, 1 / length);
}

/**
 * One plate of a projection. The caller supplies where it sits and which way
 * it faces; everything else — the tangent basis, the hidden collision overlap
 * and the visible inset — is the same for a curtain wall and for a hull.
 */
export function projectedCell(
  network: BasaltForceFieldNetwork,
  q: number,
  r: number,
  index: number,
  centre: SceneVector3,
  normal: SceneVector3,
  gridRadius: number,
  idPrefix = "stronghold:force-field",
): BasaltForceFieldCell {
  const outwardNormal = normalize(normal);
  // The local X axis follows the horizontal tangent. Cross order keeps local
  // Y pointing upward at the central cell while the normal points to spawn.
  // A wall never has a vertical face, but a dome capping a bow does, and there
  // the horizontal tangent vanishes: fall back to a fixed reference axis so the
  // plate keeps a real basis instead of a zero one, which would silently make
  // its planar hexagon test pass everywhere.
  const horizontal = Math.hypot(outwardNormal[0], outwardNormal[2]);
  const tangentU = horizontal > 1e-6
    ? normalize([outwardNormal[2], 0, -outwardNormal[0]])
    : normalize(cross(outwardNormal, [0, 0, 1]));
  const tangentV = normalize(cross(outwardNormal, tangentU));

  return {
    index,
    id: `${idPrefix}:${network}:${q}:${r}`,
    network,
    q,
    r,
    centre,
    normal: outwardNormal,
    tangentU,
    tangentV,
    // A small hidden overlap closes mathematical seams between neighbouring
    // tangent planes while leaving a narrow, readable gap in the projection.
    collisionRadius: gridRadius * 1.1,
    visualRadius: gridRadius * 0.91,
  };
}

function appendWallCells(cells: BasaltForceFieldCell[]): void {
  for (let q = -18; q <= 18; q += 1) {
    const x = WALL_GRID_RADIUS * 1.5 * q;
    for (let r = -20; r <= 20; r += 1) {
      const y = Math.sqrt(3) * WALL_GRID_RADIUS * (r + q / 2);
      // The lower curtain follows the long battlement. It rises locally over
      // the gatehouse instead of describing an unrelated dome in empty air.
      const upperEdge = Math.abs(x) <= 10.4 ? 15.1 : 11.15;
      if (y < GRID_FOOTING || y > upperEdge) continue;

      const z = 3.45 - x * x * 0.00125;
      cells.push(projectedCell(
        "wall",
        q,
        r,
        cells.length,
        [x, y, z],
        [x * 0.0025, 0, 1],
        WALL_GRID_RADIUS,
      ));
    }
  }
}

function towerEnvelopeAt(y: number): {
  readonly halfWidth: number;
  readonly frontZ: number;
} {
  if (y < 33.2) {
    const floor = Math.max(0, Math.min(7, Math.floor(y / 4.15)));
    const width = 18 - floor * 0.72;
    const depth = 13.8 - floor * 0.38;
    return {
      halfWidth: width / 2 + 1.55,
      frontZ: -36 + depth / 2 + 2.05,
    };
  }
  if (y < 35.2) {
    return { halfWidth: 7.95, frontZ: -29.85 };
  }
  if (y < 40.2) {
    return { halfWidth: 8.15, frontZ: -29.55 };
  }
  return {
    halfWidth: Math.max(3.2, 8.85 - (y - 40.2) * 0.82),
    frontZ: -30.25,
  };
}

function appendTowerCells(cells: BasaltForceFieldCell[]): void {
  for (let q = -11; q <= 11; q += 1) {
    const unwrappedX = TOWER_GRID_RADIUS * 1.5 * q;
    for (let r = -32; r <= 38; r += 1) {
      const y = Math.sqrt(3) * TOWER_GRID_RADIUS * (r + q / 2);
      if (y < GRID_FOOTING || y > 45.7) continue;

      const envelope = towerEnvelopeAt(y);
      const returnDepth = Math.max(0, Math.abs(unwrappedX) - envelope.halfWidth);
      if (returnDepth > 3.8) continue;

      const side = unwrappedX < 0 ? -1 : 1;
      const x = returnDepth > 0
        ? side * (envelope.halfWidth + returnDepth * 0.38)
        : unwrappedX;
      const z = envelope.frontZ - returnDepth * 0.92;
      const normal: SceneVector3 = returnDepth > 0
        ? normalize([side * Math.min(0.82, 0.28 + returnDepth * 0.18), 0, 1])
        : normalize([x * 0.012, 0, 1]);
      cells.push(projectedCell(
        "tower",
        q,
        r,
        cells.length,
        [x, y, z],
        normal,
        TOWER_GRID_RADIUS,
      ));
    }
  }
}

export function createBasaltForceFieldCells(): readonly BasaltForceFieldCell[] {
  const cells: BasaltForceFieldCell[] = [];
  appendWallCells(cells);
  appendTowerCells(cells);
  return cells;
}

export const BASALT_FORCE_FIELD_CELLS = createBasaltForceFieldCells();

/**
 * A carrier's pose, when the projection it owns is not standing on the ground.
 *
 * The cells stay in the coordinates they were authored in and the QUERY is
 * carried into them, never the other way round: one inverse transform per
 * question instead of a thousand cell transforms per frame. That also makes
 * it impossible for the projection to drift away from the hull, because it
 * reads the very pose the hull pieces are drawn with.
 */
export interface BasaltForceFieldPose {
  readonly position: SceneVector3;
  /** Carrier orientation, x y z w. */
  readonly orientation: readonly [number, number, number, number];
}

function rotateByPose(
  orientation: readonly [number, number, number, number],
  x: number,
  y: number,
  z: number,
  inverse: boolean,
): [number, number, number] {
  const qx = inverse ? -orientation[0] : orientation[0];
  const qy = inverse ? -orientation[1] : orientation[1];
  const qz = inverse ? -orientation[2] : orientation[2];
  const qw = orientation[3];
  const tx = 2 * (qy * z - qz * y);
  const ty = 2 * (qz * x - qx * z);
  const tz = 2 * (qx * y - qy * x);
  return [
    x + qw * tx + qy * tz - qz * ty,
    y + qw * ty + qz * tx - qx * tz,
    z + qw * tz + qx * ty - qy * tx,
  ];
}

/** World point into the projection's own frame. */
export function basaltForceFieldPointToLocal(
  pose: BasaltForceFieldPose,
  point: SceneVector3,
): SceneVector3 {
  return poseToLocal(pose, point);
}

function poseToLocal(
  pose: BasaltForceFieldPose,
  point: SceneVector3,
): [number, number, number] {
  return rotateByPose(
    pose.orientation,
    point[0] - pose.position[0],
    point[1] - pose.position[1],
    point[2] - pose.position[2],
    true,
  );
}

/** Projection-frame point back out into the world. */
function poseToWorld(
  pose: BasaltForceFieldPose,
  point: readonly [number, number, number],
): SceneVector3 {
  const rotated = rotateByPose(
    pose.orientation,
    point[0],
    point[1],
    point[2],
    false,
  );
  return [
    rotated[0] + pose.position[0],
    rotated[1] + pose.position[1],
    rotated[2] + pose.position[2],
  ];
}

/** Projection-frame direction back out into the world; no translation. */
function poseDirectionToWorld(
  pose: BasaltForceFieldPose,
  direction: SceneVector3,
): SceneVector3 {
  return rotateByPose(
    pose.orientation,
    direction[0],
    direction[1],
    direction[2],
    false,
  );
}

/**
 * One projection: its cells and the flat mirrors the hot loops read.
 *
 * The fortress owns one and a flying carrier owns another. Everything below
 * takes the projection as an argument, so neither the rules, the membrane nor
 * the damage model can quietly become specific to a curtain wall.
 */
export interface BasaltForceFieldProjection {
  readonly cells: readonly BasaltForceFieldCell[];
  readonly count: number;
  readonly centres: Float64Array;
  readonly normals: Float64Array;
  readonly tangentsU: Float64Array;
  readonly tangentsV: Float64Array;
  readonly radii: Float64Array;
  readonly bounds: readonly [number, number, number, number, number, number];
  readonly maxRadius: number;
}

export function emptyBasaltForceFieldDamage(
  projection: BasaltForceFieldProjection = BASALT_FORCE_FIELD_PROJECTION,
): Float32Array {
  return new Float32Array(projection.count);
}

export function basaltForceFieldDamageFraction(
  damage: ArrayLike<number>,
  cellIndex: number,
): number {
  return Math.max(0, Math.min(
    1,
    (damage[cellIndex] ?? 0) / BASALT_FORCE_FIELD_CELL_CAPACITY,
  ));
}

export function basaltForceFieldCellAlive(
  damage: ArrayLike<number>,
  cellIndex: number,
): boolean {
  return (damage[cellIndex] ?? 0) < BASALT_FORCE_FIELD_CELL_CAPACITY;
}

/** Standard axial distance, so blast weakening follows the shield surface. */
export function basaltForceFieldCellDistance(
  a: Pick<BasaltForceFieldCell, "network" | "q" | "r">,
  b: Pick<BasaltForceFieldCell, "network" | "q" | "r">,
): number {
  if (a.network !== b.network) return Number.POSITIVE_INFINITY;
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

/**
 * Applies energy to the projection only. A rocket gives exactly one capacity
 * unit to the directly struck plate; its blast weakens the first two rings.
 */
export function damageBasaltForceField(
  projection: BasaltForceFieldProjection,
  previous: ArrayLike<number>,
  cellIndex: number,
  kind: BasaltForceFieldImpactKind,
): Float32Array {
  const next = Float32Array.from(previous);
  const struck = projection.cells[cellIndex];
  if (!struck || !basaltForceFieldCellAlive(previous, cellIndex)) {
    return next;
  }

  for (const cell of projection.cells) {
    const distance = basaltForceFieldCellDistance(struck, cell);
    const delivered = kind === "machineGun"
      ? distance === 0 ? 0.035 : 0
      : kind === "grenade"
        ? distance === 0
          ? 0.04
          : distance === 1
            ? 0.0088
            : distance === 2
              ? 0.0026
              : 0
        : distance === 0
          ? 1
          : distance === 1
            ? 0.22
            : distance === 2
              ? 0.065
              : 0;
    if (delivered <= 0) continue;
    next[cell.index] = Math.min(
      BASALT_FORCE_FIELD_CELL_CAPACITY,
      (next[cell.index] ?? 0) + delivered,
    );
  }
  return next;
}

/**
 * Плоские зеркала решётки для горячих циклов. Взрыв опрашивает поле на
 * каждую цель, игрок и каждый снаряд — каждый кадр; проход по 768 ячейкам
 * с кортежем-аллокацией на ячейку стоил ~0.5 мс на вызов. Скалярная
 * математика по этим массивам плюс AABB-отсечка сводят промах к микросекундам.
 * Float64 — чтобы численно совпадать с прежним поведением один в один.
 */
export function createBasaltForceFieldProjection(
  cells: readonly BasaltForceFieldCell[],
): BasaltForceFieldProjection {
  const count = cells.length;
  const centres = new Float64Array(count * 3);
  const normals = new Float64Array(count * 3);
  const tangentsU = new Float64Array(count * 3);
  const tangentsV = new Float64Array(count * 3);
  const radii = new Float64Array(count);
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  let maxRadius = 0;
  cells.forEach((cell, index) => {
    centres.set(cell.centre, index * 3);
    normals.set(cell.normal, index * 3);
    tangentsU.set(cell.tangentU, index * 3);
    tangentsV.set(cell.tangentV, index * 3);
    radii[index] = cell.collisionRadius;
    minX = Math.min(minX, cell.centre[0]);
    minY = Math.min(minY, cell.centre[1]);
    minZ = Math.min(minZ, cell.centre[2]);
    maxX = Math.max(maxX, cell.centre[0]);
    maxY = Math.max(maxY, cell.centre[1]);
    maxZ = Math.max(maxZ, cell.centre[2]);
    maxRadius = Math.max(maxRadius, cell.collisionRadius);
  });
  return {
    cells,
    count,
    centres,
    normals,
    tangentsU,
    tangentsV,
    radii,
    bounds: [minX, minY, minZ, maxX, maxY, maxZ] as const,
    maxRadius,
  };
}

export const BASALT_FORCE_FIELD_PROJECTION = createBasaltForceFieldProjection(
  BASALT_FORCE_FIELD_CELLS,
);

/** Slab-тест отрезка против AABB решётки, расширенного на margin. */
function segmentTouchesLattice(
  projection: BasaltForceFieldProjection,
  fromX: number,
  fromY: number,
  fromZ: number,
  directionX: number,
  directionY: number,
  directionZ: number,
  margin: number,
): boolean {
  const [minX, minY, minZ, maxX, maxY, maxZ] = projection.bounds;
  let enter = 0;
  let exit = 1;
  for (let axis = 0; axis < 3; axis += 1) {
    const origin = axis === 0 ? fromX : axis === 1 ? fromY : fromZ;
    const speed = axis === 0 ? directionX : axis === 1 ? directionY : directionZ;
    const low = (axis === 0 ? minX : axis === 1 ? minY : minZ) - margin;
    const high = (axis === 0 ? maxX : axis === 1 ? maxY : maxZ) + margin;
    if (Math.abs(speed) < 1e-12) {
      if (origin < low || origin > high) return false;
      continue;
    }
    const inverse = 1 / speed;
    let near = (low - origin) * inverse;
    let far = (high - origin) * inverse;
    if (near > far) {
      const swap = near;
      near = far;
      far = swap;
    }
    enter = Math.max(enter, near);
    exit = Math.min(exit, far);
    if (enter > exit) return false;
  }
  return true;
}

/**
 * Intersects only the defending side. A ray travelling with the outward
 * normal (fortress -> spawn) is ignored even though it crosses the plane.
 */
export function intersectBasaltForceField(
  projection: BasaltForceFieldProjection,
  from: SceneVector3,
  to: SceneVector3,
  damage: ArrayLike<number>,
  clearance = 0,
  pose: BasaltForceFieldPose | null = null,
): BasaltForceFieldHit | null {
  // The segment travels into the projection's own frame; the answer travels
  // back out. Everything between is the same mathematics a standing wall uses.
  const localFrom = pose ? poseToLocal(pose, from) : from;
  const localTo = pose ? poseToLocal(pose, to) : to;
  const fromX = localFrom[0];
  const fromY = localFrom[1];
  const fromZ = localFrom[2];
  const directionX = localTo[0] - fromX;
  const directionY = localTo[1] - fromY;
  const directionZ = localTo[2] - fromZ;
  const paddedClearance = Math.max(0, clearance);
  if (
    !segmentTouchesLattice(
      projection,
      fromX,
      fromY,
      fromZ,
      directionX,
      directionY,
      directionZ,
      projection.maxRadius + 0.035 + paddedClearance,
    )
  ) {
    return null;
  }

  const { count, centres, normals, tangentsU, tangentsV, radii } = projection;
  let nearestIndex = -1;
  let nearestProgress = Infinity;

  for (let index = 0; index < count; index += 1) {
    if (!basaltForceFieldCellAlive(damage, index)) continue;
    const base = index * 3;
    const normalX = normals[base];
    const normalY = normals[base + 1];
    const normalZ = normals[base + 2];
    const denominator =
      normalX * directionX + normalY * directionY + normalZ * directionZ;
    // Negative means travel from spawn-facing side toward the fortress.
    if (denominator >= -1e-7) continue;
    const offsetX = centres[base] - fromX;
    const offsetY = centres[base + 1] - fromY;
    const offsetZ = centres[base + 2] - fromZ;
    const progress = (
      normalX * offsetX + normalY * offsetY + normalZ * offsetZ +
      paddedClearance
    ) / denominator;
    if (progress < -1e-5 || progress > 1 + 1e-5) continue;
    if (progress >= nearestProgress) continue;
    const travelled = Math.max(0, progress);
    // Точка на самой плоскости проекции: обратный сдвиг clearance вдоль нормали.
    const surfaceX =
      fromX + directionX * travelled - normalX * paddedClearance;
    const surfaceY =
      fromY + directionY * travelled - normalY * paddedClearance;
    const surfaceZ =
      fromZ + directionZ * travelled - normalZ * paddedClearance;
    const localX = surfaceX - centres[base];
    const localY = surfaceY - centres[base + 1];
    const localZ = surfaceZ - centres[base + 2];
    const planarX = Math.abs(
      localX * tangentsU[base] +
      localY * tangentsU[base + 1] +
      localZ * tangentsU[base + 2],
    );
    const planarY = Math.abs(
      localX * tangentsV[base] +
      localY * tangentsV[base + 1] +
      localZ * tangentsV[base + 2],
    );
    const radius = radii[index] + 0.035;
    const halfHeight = Math.sqrt(3) * radius / 2;
    if (
      planarX > radius ||
      planarY > halfHeight ||
      Math.sqrt(3) * planarX + planarY > Math.sqrt(3) * radius
    ) {
      continue;
    }
    nearestIndex = index;
    nearestProgress = travelled;
  }

  if (nearestIndex < 0) return null;
  const cell = projection.cells[nearestIndex];
  const travelled = Math.max(0, nearestProgress);
  const localPoint: [number, number, number] = [
    fromX + directionX * travelled,
    fromY + directionY * travelled,
    fromZ + directionZ * travelled,
  ];
  return {
    cellIndex: cell.index,
    cellId: cell.id,
    normal: pose ? poseDirectionToWorld(pose, cell.normal) : cell.normal,
    point: pose ? poseToWorld(pose, localPoint) : localPoint,
    progress: travelled,
  };
}

export interface BasaltForceFieldProximity {
  readonly cellIndex: number;
  /** Distance from the probe to the plate along its normal, always positive. */
  readonly distance: number;
  /** Where the load lands: the probe projected onto the plate. */
  readonly point: SceneVector3;
  readonly normal: SceneVector3;
}

/**
 * Nearest live plate a point is standing in front of, on the defended side
 * only. Leaving the fortress must feel like nothing at all, so a point behind
 * a plate never sees it.
 */
export function nearestBasaltForceFieldPlate(
  projection: BasaltForceFieldProjection,
  from: SceneVector3,
  damage: ArrayLike<number>,
  range: number,
  pose: BasaltForceFieldPose | null = null,
): BasaltForceFieldProximity | null {
  const localFrom = pose ? poseToLocal(pose, from) : from;
  const fromX = localFrom[0];
  const fromY = localFrom[1];
  const fromZ = localFrom[2];
  // Точечный запрос: вне AABB решётки, расширенного на дальность и радиус
  // плиты, живой плиты быть не может.
  const [minX, minY, minZ, maxX, maxY, maxZ] = projection.bounds;
  const margin = range + projection.maxRadius + 0.035;
  if (
    fromX < minX - margin || fromX > maxX + margin ||
    fromY < minY - margin || fromY > maxY + margin ||
    fromZ < minZ - margin || fromZ > maxZ + margin
  ) {
    return null;
  }

  const { count, centres, normals, tangentsU, tangentsV, radii } = projection;
  let nearestIndex = -1;
  let nearestDistance = Infinity;

  for (let index = 0; index < count; index += 1) {
    if (!basaltForceFieldCellAlive(damage, index)) continue;
    const base = index * 3;
    const offsetX = fromX - centres[base];
    const offsetY = fromY - centres[base + 1];
    const offsetZ = fromZ - centres[base + 2];
    const normalX = normals[base];
    const normalY = normals[base + 1];
    const normalZ = normals[base + 2];
    const distance =
      normalX * offsetX + normalY * offsetY + normalZ * offsetZ;
    if (distance <= 0 || distance > range) continue;
    if (distance >= nearestDistance) continue;
    const localX = offsetX - normalX * distance;
    const localY = offsetY - normalY * distance;
    const localZ = offsetZ - normalZ * distance;
    const planarX = Math.abs(
      localX * tangentsU[base] +
      localY * tangentsU[base + 1] +
      localZ * tangentsU[base + 2],
    );
    const planarY = Math.abs(
      localX * tangentsV[base] +
      localY * tangentsV[base + 1] +
      localZ * tangentsV[base + 2],
    );
    const radius = radii[index] + 0.035;
    const halfHeight = Math.sqrt(3) * radius / 2;
    if (
      planarX > radius ||
      planarY > halfHeight ||
      Math.sqrt(3) * planarX + planarY > Math.sqrt(3) * radius
    ) {
      continue;
    }
    nearestIndex = index;
    nearestDistance = distance;
  }

  if (nearestIndex < 0) return null;
  const cell = projection.cells[nearestIndex];
  const localPoint: [number, number, number] = [
    fromX - cell.normal[0] * nearestDistance,
    fromY - cell.normal[1] * nearestDistance,
    fromZ - cell.normal[2] * nearestDistance,
  ];
  return {
    cellIndex: cell.index,
    distance: nearestDistance,
    point: pose ? poseToWorld(pose, localPoint) : localPoint,
    normal: pose ? poseDirectionToWorld(pose, cell.normal) : cell.normal,
  };
}

export function basaltForceFieldBlocksSegment(
  projection: BasaltForceFieldProjection,
  from: SceneVector3,
  to: SceneVector3,
  damage: ArrayLike<number>,
  pose: BasaltForceFieldPose | null = null,
): boolean {
  return intersectBasaltForceField(
    projection,
    from,
    to,
    damage,
    0,
    pose,
  ) !== null;
}
