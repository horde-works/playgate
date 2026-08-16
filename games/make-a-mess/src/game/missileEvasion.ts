/**
 * MISSILE EVASION — one owner for detection, escape geometry, physical
 * execution, projectile registration, and runtime state.
 *
 * The detector uses exact linear-missile / accelerating-body kinematics,
 * including the fuse endpoint. The manoeuvre is constrained to the computed
 * threat plane, then checked against live thrust, attitude response, the
 * oriented hull, deck, and world boundary.
 */

import type { SceneVector3 } from "./destructionScene.ts";
import {
  conjugateQuaternion,
  multiplyQuaternions,
  normalizeQuaternion,
  quaternionAboutAxis,
  rotateVector,
  type Quaternion,
} from "./clusterDynamics.ts";
import {
  lineOfSightRotation,
  postureDemand,
  solvePosture,
} from "./airCombatPosture.ts";
import type { AirCombatTrack } from "./vehicleGunnery.ts";
import {
  explosiveProfile,
  type ExplosiveKind,
} from "./destructionRuntime.ts";

const EPSILON = 1e-8;
const ROOT_EPSILON = 1e-7;

export interface MissileEvasionBody {
  readonly id: string;
  readonly centre: SceneVector3;
  readonly velocity: SceneVector3;
  /** Acceleration already being delivered before the evasion command. */
  readonly acceleration: SceneVector3;
  /** Conservative live collision radius, metres. */
  readonly collisionRadius: number;
}

export interface MissileEvasionThreat {
  readonly id: number;
  readonly ownerId: string | null;
  readonly position: SceneVector3;
  readonly velocity: SceneVector3;
  readonly blastRadius: number;
  /** Physical time remaining until self-detonation, seconds. */
  readonly remainingSeconds: number;
}

export interface MissileEvasionEnvelope {
  readonly horizontalAcceleration: number;
  readonly upwardAcceleration: number;
  readonly downwardAcceleration: number;
}

export interface MissileEvasionPolicy {
  readonly horizonSeconds: number;
  readonly margin: number;
}

export type MissileThreatEventKind =
  | "now"
  | "closest"
  | "fuse"
  | "horizon";

export interface MissileThreatAssessment {
  readonly threat: MissileEvasionThreat;
  readonly eventKind: MissileThreatEventKind;
  readonly eventSeconds: number;
  readonly separation: number;
  /** Separation after body, warhead, and policy margin, metres. */
  readonly clearance: number;
  /** Missile minus body at the selected event. */
  readonly relativePosition: SceneVector3;
  readonly relativeVelocity: SceneVector3;
  /** Unit world vector in which the body should accelerate. */
  readonly escapeDirection: SceneVector3;
  /** First-order acceleration needed to buy the missing clearance. */
  readonly requiredAcceleration: number;
  readonly availableAcceleration: number;
  readonly demandRatio: number;
}

export interface MissileEvasionInput {
  readonly body: MissileEvasionBody;
  readonly threats: readonly MissileEvasionThreat[];
  readonly envelope: MissileEvasionEnvelope;
  readonly policy: MissileEvasionPolicy;
}

export interface MissileEvasionSolution {
  readonly primaryThreatId: number;
  readonly eventSeconds: number;
  readonly direction: SceneVector3;
  readonly acceleration: SceneVector3;
  readonly requiredAcceleration: number;
  readonly availableAcceleration: number;
  readonly demandRatio: number;
  readonly assessments: readonly MissileThreatAssessment[];
}

const add = (left: SceneVector3, right: SceneVector3): SceneVector3 => [
  left[0] + right[0],
  left[1] + right[1],
  left[2] + right[2],
];

const subtract = (left: SceneVector3, right: SceneVector3): SceneVector3 => [
  left[0] - right[0],
  left[1] - right[1],
  left[2] - right[2],
];

const scale = (vector: SceneVector3, amount: number): SceneVector3 => [
  vector[0] * amount,
  vector[1] * amount,
  vector[2] * amount,
];

const dot = (left: SceneVector3, right: SceneVector3): number =>
  left[0] * right[0] + left[1] * right[1] + left[2] * right[2];

const length = (vector: SceneVector3): number => Math.hypot(...vector);

const normalize = (
  vector: SceneVector3,
  fallback: SceneVector3 = [0, 0, 0],
): SceneVector3 => {
  const magnitude = length(vector);
  return magnitude <= EPSILON ? fallback : scale(vector, 1 / magnitude);
};

function polynomialRoots(
  cubic: number,
  quadratic: number,
  linear: number,
  constant: number,
): readonly number[] {
  if (Math.abs(cubic) <= EPSILON) {
    if (Math.abs(quadratic) <= EPSILON) {
      return Math.abs(linear) <= EPSILON ? [] : [-constant / linear];
    }
    const discriminant = linear ** 2 - 4 * quadratic * constant;
    if (discriminant < -ROOT_EPSILON) return [];
    if (Math.abs(discriminant) <= ROOT_EPSILON) {
      return [-linear / (2 * quadratic)];
    }
    const root = Math.sqrt(discriminant);
    return [
      (-linear - root) / (2 * quadratic),
      (-linear + root) / (2 * quadratic),
    ];
  }

  const a = quadratic / cubic;
  const b = linear / cubic;
  const c = constant / cubic;
  const p = b - a ** 2 / 3;
  const q = (2 * a ** 3) / 27 - (a * b) / 3 + c;
  const discriminant = (q / 2) ** 2 + (p / 3) ** 3;
  const offset = a / 3;

  if (discriminant > ROOT_EPSILON) {
    const root = Math.sqrt(discriminant);
    return [
      Math.cbrt(-q / 2 + root) + Math.cbrt(-q / 2 - root) - offset,
    ];
  }
  if (Math.abs(discriminant) <= ROOT_EPSILON) {
    const root = Math.cbrt(-q / 2);
    return [2 * root - offset, -root - offset];
  }

  const radius = 2 * Math.sqrt(-p / 3);
  const angle = Math.acos(
    Math.max(-1, Math.min(1, (-q / 2) / Math.sqrt(-((p / 3) ** 3)))),
  );
  return [0, 1, 2].map(
    (index) =>
      radius * Math.cos((angle + index * Math.PI * 2) / 3) - offset,
  );
}

function relativeAt(
  initial: SceneVector3,
  velocity: SceneVector3,
  bodyAcceleration: SceneVector3,
  seconds: number,
): SceneVector3 {
  return add(
    add(initial, scale(velocity, seconds)),
    scale(bodyAcceleration, -0.5 * seconds ** 2),
  );
}

function relativeVelocityAt(
  velocity: SceneVector3,
  bodyAcceleration: SceneVector3,
  seconds: number,
): SceneVector3 {
  return subtract(velocity, scale(bodyAcceleration, seconds));
}

/** Exact minimum centre separation for linear missile / constant-acceleration body. */
export function missileThreatEvent(
  body: MissileEvasionBody,
  threat: MissileEvasionThreat,
  horizonSeconds: number,
): {
  readonly kind: MissileThreatEventKind;
  readonly seconds: number;
  readonly relativePosition: SceneVector3;
  readonly relativeVelocity: SceneVector3;
} {
  const maximumSeconds = Math.max(
    0,
    Math.min(horizonSeconds, threat.remainingSeconds),
  );
  const initial = subtract(threat.position, body.centre);
  const velocity = subtract(threat.velocity, body.velocity);
  const acceleration = body.acceleration;

  // d/dt |r + vt - at²/2|² = 0. The irrelevant factor two is removed.
  const stationary = polynomialRoots(
    0.5 * dot(acceleration, acceleration),
    -1.5 * dot(velocity, acceleration),
    dot(velocity, velocity) - dot(initial, acceleration),
    dot(initial, velocity),
  );
  const candidates = [
    0,
    maximumSeconds,
    ...stationary.filter(
      (seconds) =>
        seconds > ROOT_EPSILON &&
        seconds < maximumSeconds - ROOT_EPSILON,
    ),
  ];
  let seconds = 0;
  let relativePosition = initial;
  let distance = length(initial);
  for (const candidate of candidates) {
    const relative = relativeAt(initial, velocity, acceleration, candidate);
    const candidateDistance = length(relative);
    if (candidateDistance < distance - ROOT_EPSILON) {
      seconds = candidate;
      relativePosition = relative;
      distance = candidateDistance;
    }
  }

  const atEnd = Math.abs(seconds - maximumSeconds) <= ROOT_EPSILON;
  const fuseEndsFirst = threat.remainingSeconds <= horizonSeconds;
  const kind: MissileThreatEventKind =
    seconds <= ROOT_EPSILON
      ? "now"
      : atEnd
        ? fuseEndsFirst
          ? "fuse"
          : "horizon"
        : "closest";
  return {
    kind,
    seconds,
    relativePosition,
    relativeVelocity: relativeVelocityAt(velocity, acceleration, seconds),
  };
}

function directionalAcceleration(
  direction: SceneVector3,
  envelope: MissileEvasionEnvelope,
): number {
  const horizontal = Math.hypot(direction[0], direction[2]);
  const verticalLimit =
    direction[1] >= 0
      ? envelope.upwardAcceleration
      : envelope.downwardAcceleration;
  const horizontalShare =
    horizontal / Math.max(EPSILON, envelope.horizontalAcceleration);
  const verticalShare =
    Math.abs(direction[1]) / Math.max(EPSILON, verticalLimit);
  const share = Math.hypot(horizontalShare, verticalShare);
  return share <= EPSILON ? 0 : 1 / share;
}

/**
 * Farthest point of `|relative - timeFactor * acceleration|` on one half of
 * the acceleration ellipsoid. This is the trust-region secular equation, not
 * a sampled direction field. The two vertical halves are solved separately
 * because climb and descent have different limits.
 */
function farthestEllipsoidDirection(
  relative: SceneVector3,
  timeFactor: number,
  horizontalAcceleration: number,
  verticalAcceleration: number,
  verticalSign: 1 | -1,
): SceneVector3 | null {
  const limits: SceneVector3 = [
    Math.max(EPSILON, horizontalAcceleration),
    Math.max(EPSILON, verticalAcceleration),
    Math.max(EPSILON, horizontalAcceleration),
  ];
  const eigenvalues: SceneVector3 = [
    (timeFactor * limits[0]) ** 2,
    (timeFactor * limits[1]) ** 2,
    (timeFactor * limits[2]) ** 2,
  ];
  const linear: SceneVector3 = [
    timeFactor * limits[0] * relative[0],
    timeFactor * limits[1] * relative[1],
    timeFactor * limits[2] * relative[2],
  ];
  const largest = Math.max(...eigenvalues);
  const atLargest: SceneVector3 = [0, 1, 2].map((axis) =>
    Math.abs(eigenvalues[axis] - largest) <= ROOT_EPSILON
      ? linear[axis]
      : 0,
  ) as [number, number, number];
  let unit: SceneVector3;

  if (length(atLargest) <= ROOT_EPSILON) {
    // Hard case: the linear term has no component in the strongest eigenspace.
    // Lower-axis components are fixed; the unused norm belongs to any strongest
    // axis and is signed to stay in the requested vertical half if possible.
    const partial = linear.map((value, axis) =>
      Math.abs(eigenvalues[axis] - largest) <= ROOT_EPSILON
        ? 0
        : value / (eigenvalues[axis] - largest),
    ) as [number, number, number];
    const remainder = Math.sqrt(Math.max(0, 1 - dot(partial, partial)));
    const strongestAxis = eigenvalues.findIndex(
      (value) => Math.abs(value - largest) <= ROOT_EPSILON,
    );
    const mutable: [number, number, number] = [...partial];
    mutable[strongestAxis] =
      strongestAxis === 1 ? remainder * verticalSign : remainder;
    unit = mutable;
  } else {
    let low = largest + Math.max(ROOT_EPSILON, largest * 1e-10);
    let high = Math.max(1, largest * 2 + length(linear));
    const normAt = (lambda: number) =>
      Math.sqrt(
        linear.reduce(
          (sum, value, axis) =>
            sum + (value / (eigenvalues[axis] - lambda)) ** 2,
          0,
        ),
      );
    while (normAt(high) > 1) high *= 2;
    for (let iteration = 0; iteration < 64; iteration += 1) {
      const middle = (low + high) / 2;
      if (normAt(middle) > 1) low = middle;
      else high = middle;
    }
    unit = linear.map(
      (value, axis) => value / (eigenvalues[axis] - high),
    ) as [number, number, number];
  }

  if (unit[1] * verticalSign < -ROOT_EPSILON) return null;
  const acceleration: SceneVector3 = [
    unit[0] * limits[0],
    unit[1] * limits[1],
    unit[2] * limits[2],
  ];
  return normalize(acceleration);
}

function optimalEscapeDirections(
  body: MissileEvasionBody,
  assessment: MissileThreatAssessment,
  envelope: MissileEvasionEnvelope,
): readonly SceneVector3[] {
  if (assessment.eventSeconds <= ROOT_EPSILON) return [];
  const timeFactor = 0.5 * assessment.eventSeconds ** 2;
  // The assessment contains the trajectory under the acceleration already in
  // progress. Undo it here: the candidate is the next absolute acceleration,
  // not an extra acceleration accidentally added on top of the current one.
  const relativeWithoutCommand = add(
    assessment.relativePosition,
    scale(body.acceleration, timeFactor),
  );
  return [
    farthestEllipsoidDirection(
      relativeWithoutCommand,
      timeFactor,
      envelope.horizontalAcceleration,
      envelope.upwardAcceleration,
      1,
    ),
    farthestEllipsoidDirection(
      relativeWithoutCommand,
      timeFactor,
      envelope.horizontalAcceleration,
      envelope.downwardAcceleration,
      -1,
    ),
  ].filter((direction): direction is SceneVector3 => direction !== null);
}

function withoutBraking(
  direction: SceneVector3,
  velocity: SceneVector3,
): SceneVector3 {
  const speed = length(velocity);
  if (speed <= EPSILON) return normalize(direction);
  const heading = scale(velocity, 1 / speed);
  const along = dot(direction, heading);
  if (along >= -EPSILON) return normalize(direction);
  return normalize(subtract(direction, scale(heading, along)));
}

function perpendicularEscape(
  relativeVelocity: SceneVector3,
  bodyVelocity: SceneVector3,
  envelope: MissileEvasionEnvelope,
  preferredDirection: SceneVector3 = [0, 0, 0],
): SceneVector3 {
  const line = normalize(relativeVelocity, [0, 0, 1]);
  const axes: readonly SceneVector3[] = [
    [0, 1, 0],
    [1, 0, 0],
    [0, 0, 1],
  ];
  let best: SceneVector3 = [0, 0, 0];
  let bestAcceleration = -1;
  let bestAlignment = Number.NEGATIVE_INFINITY;
  for (const axis of axes) {
    const projected = normalize(subtract(axis, scale(line, dot(axis, line))));
    if (length(projected) <= EPSILON) continue;
    for (const sign of [1, -1]) {
      const candidate = withoutBraking(scale(projected, sign), bodyVelocity);
      if (length(candidate) <= EPSILON) continue;
      // Removing a braking component can leave the closest-approach plane.
      const planar = normalize(
        subtract(candidate, scale(line, dot(candidate, line))),
      );
      if (
        length(planar) <= EPSILON ||
        dot(planar, bodyVelocity) < -ROOT_EPSILON
      ) {
        continue;
      }
      const acceleration = directionalAcceleration(planar, envelope);
      const alignment = dot(planar, preferredDirection);
      if (
        acceleration > bestAcceleration + ROOT_EPSILON ||
        (Math.abs(acceleration - bestAcceleration) <= ROOT_EPSILON &&
          alignment > bestAlignment + ROOT_EPSILON)
      ) {
        best = planar;
        bestAcceleration = acceleration;
        bestAlignment = alignment;
      }
    }
  }
  return length(best) <= EPSILON ? [0, 1, 0] : best;
}

function escapeDirection(
  event: ReturnType<typeof missileThreatEvent>,
  body: MissileEvasionBody,
  envelope: MissileEvasionEnvelope,
): SceneVector3 {
  const away = normalize(scale(event.relativePosition, -1));
  if (length(away) > EPSILON) {
    const lateral = withoutBraking(away, body.velocity);
    if (length(lateral) > EPSILON) return lateral;
  }
  return perpendicularEscape(event.relativeVelocity, body.velocity, envelope);
}

export function assessMissileThreat(
  body: MissileEvasionBody,
  threat: MissileEvasionThreat,
  envelope: MissileEvasionEnvelope,
  policy: MissileEvasionPolicy,
): MissileThreatAssessment | null {
  if (threat.ownerId === body.id) return null;
  const event = missileThreatEvent(body, threat, policy.horizonSeconds);
  const separation = length(event.relativePosition);
  const clearance =
    separation -
    Math.max(0, threat.blastRadius) -
    Math.max(0, body.collisionRadius) -
    Math.max(0, policy.margin);
  if (clearance > 0) return null;

  const direction = escapeDirection(event, body, envelope);
  const eventSeconds = event.seconds;
  const requiredAcceleration =
    eventSeconds <= ROOT_EPSILON
      ? Number.POSITIVE_INFINITY
      : (2 * -clearance) / eventSeconds ** 2;
  const availableAcceleration = directionalAcceleration(direction, envelope);
  const demandRatio =
    availableAcceleration <= EPSILON
      ? Number.POSITIVE_INFINITY
      : requiredAcceleration / availableAcceleration;
  return {
    threat,
    eventKind: event.kind,
    eventSeconds,
    separation,
    clearance,
    relativePosition: event.relativePosition,
    relativeVelocity: event.relativeVelocity,
    escapeDirection: direction,
    requiredAcceleration,
    availableAcceleration,
    demandRatio,
  };
}

function candidateClearance(
  input: MissileEvasionInput,
  assessment: MissileThreatAssessment,
  direction: SceneVector3,
  acceleration: number,
): number {
  const event = missileThreatEvent(
    {
      ...input.body,
      acceleration: scale(direction, acceleration),
    },
    assessment.threat,
    input.policy.horizonSeconds,
  );
  return (
    length(event.relativePosition) -
    Math.max(0, assessment.threat.blastRadius) -
    Math.max(0, input.body.collisionRadius) -
    Math.max(0, input.policy.margin)
  );
}

function worstCandidateClearance(
  input: MissileEvasionInput,
  assessments: readonly MissileThreatAssessment[],
  direction: SceneVector3,
  acceleration: number,
): number {
  let worst = Number.POSITIVE_INFINITY;
  for (const assessment of assessments) {
    worst = Math.min(
      worst,
      candidateClearance(input, assessment, direction, acceleration),
    );
  }
  return worst;
}

function addUniqueDirection(
  directions: SceneVector3[],
  raw: SceneVector3,
  bodyVelocity: SceneVector3,
): void {
  const direction = withoutBraking(raw, bodyVelocity);
  if (length(direction) <= EPSILON) return;
  if (
    directions.some(
      (existing) => dot(existing, direction) > 1 - ROOT_EPSILON,
    )
  ) {
    return;
  }
  directions.push(direction);
}

/** A small set derived from the active threats, never a world-direction grid. */
function jointEscapeDirections(
  body: MissileEvasionBody,
  assessments: readonly MissileThreatAssessment[],
  envelope: MissileEvasionEnvelope,
): readonly SceneVector3[] {
  const result: SceneVector3[] = [];
  let combined: SceneVector3 = [0, 0, 0];
  for (const assessment of assessments) {
    addUniqueDirection(result, assessment.escapeDirection, body.velocity);
    for (const optimal of optimalEscapeDirections(body, assessment, envelope)) {
      addUniqueDirection(result, optimal, body.velocity);
    }
    const weight = Math.max(
      ROOT_EPSILON,
      Math.min(100, assessment.demandRatio),
    );
    combined = add(combined, scale(assessment.escapeDirection, weight));
  }
  addUniqueDirection(result, combined, body.velocity);

  // Two crossing centre-lines have an exact common escape axis: their cross
  // product. This is the multi-missile case for which summing two arbitrary
  // centre-hit normals is least trustworthy.
  for (let left = 0; left < assessments.length; left += 1) {
    for (let right = left + 1; right < assessments.length; right += 1) {
      const a = assessments[left].relativeVelocity;
      const b = assessments[right].relativeVelocity;
      const cross: SceneVector3 = [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
      ];
      addUniqueDirection(result, cross, body.velocity);
      addUniqueDirection(result, scale(cross, -1), body.velocity);
    }
  }
  return result;
}

/**
 * Selects the physically hardest current threat and returns its analytic
 * escape demand. This function is deliberately stateless: hysteresis belongs
 * to the caller and must never hide a newly observed launch from the solver.
 */
export function solveMissileEvasion(
  input: MissileEvasionInput,
): MissileEvasionSolution | null {
  const assessments = input.threats
    .map((threat) =>
      assessMissileThreat(input.body, threat, input.envelope, input.policy),
    )
    .filter((assessment): assessment is MissileThreatAssessment =>
      assessment !== null,
    )
    .sort(
      (left, right) =>
        right.demandRatio - left.demandRatio ||
        left.eventSeconds - right.eventSeconds ||
        left.threat.id - right.threat.id,
    );
  const primary = assessments[0];
  if (!primary) return null;

  let direction = primary.escapeDirection;
  let accelerationMagnitude = primary.availableAcceleration;
  let availableAcceleration = primary.availableAcceleration;
  let requiredAcceleration = primary.requiredAcceleration;
  let demandRatio = primary.demandRatio;
  let bestWorst = Number.NEGATIVE_INFINITY;
  const candidates = assessments.length === 1
    ? [
        perpendicularEscape(
          primary.relativeVelocity,
          input.body.velocity,
          input.envelope,
          normalize(scale(primary.relativePosition, -1)),
        ),
      ]
    : jointEscapeDirections(input.body, assessments, input.envelope);
  for (const candidate of candidates) {
    const available = directionalAcceleration(candidate, input.envelope);
    if (available <= EPSILON) continue;
    const fullClearance = worstCandidateClearance(
      input,
      assessments,
      candidate,
      available,
    );
    const safe = fullClearance >= 0;
    let required = available;
    if (safe) {
      let low = 0;
      let high = available;
      for (let iteration = 0; iteration < 24; iteration += 1) {
        const middle = (low + high) / 2;
        if (
          worstCandidateClearance(
            input,
            assessments,
            candidate,
            middle,
          ) >= 0
        ) {
          high = middle;
        } else {
          low = middle;
        }
      }
      required = high;
    }
    const effort = required / available;
    // Direction is selected by the greatest worst-case clearance. Only after
    // that choice do we solve the magnitude needed on the same vector.
    if (fullClearance > bestWorst + ROOT_EPSILON) {
      direction = candidate;
      accelerationMagnitude = required;
      availableAcceleration = available;
      requiredAcceleration = safe
        ? required
        : primary.requiredAcceleration;
      demandRatio = safe ? effort : primary.demandRatio;
      bestWorst = fullClearance;
    }
  }
  return {
    primaryThreatId: primary.threat.id,
    eventSeconds: primary.eventSeconds,
    direction,
    acceleration: scale(direction, accelerationMagnitude),
    requiredAcceleration,
    availableAcceleration,
    demandRatio,
    assessments,
  };
}


const PHYSICAL_GRAVITY = 9.81;
const PHYSICAL_EPSILON = 1e-8;
// Коррекция меняет и промах, и МОМЕНТ ближайшего прохода. Редкая сетка
// пропускала новое пересечение: рывок вдоль ракеты сдвигал встречу между
// двумя пробами и ошибочно выглядел безопасным. Скорость ракеты минимум
// вшестеро выше коррекции, поэтому окно 0.45…1.55 исходного времени с шагом
// 0.05 гарантированно накрывает сдвиг с большим запасом.
const SAMPLE_SHARES: readonly number[] = Array.from(
  { length: 15 },
  (_, index) => 0.45 + (index * 1.1) / 14,
);
const COARSE_SAMPLE_SHARES: readonly number[] = Array.from(
  { length: 3 },
  (_, index) => 0.6 + index * 0.4,
);
// Малые доли — не «слабое уклонение», а право убрать из линии конкретный
// край корпуса несколькими градусами позы, не ломая весь полётный замысел.
const SPEED_SHARES = [0.08, 0.18, 0.35, 0.65, 1] as const;

export interface EvasionFieldThreat {
  readonly id: number;
  readonly position: SceneVector3;
  readonly velocity: SceneVector3;
  readonly blastRadius: number;
  readonly remainingSeconds: number;
}

export interface EvasionHull {
  /** Half-size of the live authored bounds in local frame axes. */
  readonly halfExtents: SceneVector3;
  /** Bounds centre relative to the current centre of mass. */
  readonly centreOffset: SceneVector3;
}

/**
 * ЖИВОЙ ГАБАРИТ В СИСТЕМЕ ЦЕНТРА МАСС.
 *
 * `localBounds` уже вычтен из авторского origin кадра, а `centreOfMass`
 * остаётся в авторских координатах сцены. Смешать их напрямую особенно легко
 * у машины, чей пост стоит далеко от нуля: поле тогда оценивает ракету возле
 * фантомного корпуса в центре мира и выбирает нулевой манёвр.
 */
export function evasionHullFromLocalBounds(
  localBounds: {
    readonly minimum: SceneVector3;
    readonly maximum: SceneVector3;
  },
  authoredOrigin: SceneVector3,
  authoredCentreOfMass: SceneVector3,
): EvasionHull {
  const halfExtent = (axis: 0 | 1 | 2) =>
    Math.max(
      0.1,
      (localBounds.maximum[axis] - localBounds.minimum[axis]) / 2,
    );
  const centreOffsetAt = (axis: 0 | 1 | 2) => {
    const boundsCentre =
      (localBounds.minimum[axis] + localBounds.maximum[axis]) / 2;
    const localCentreOfMass =
      authoredCentreOfMass[axis] - authoredOrigin[axis];
    return boundsCentre - localCentreOfMass;
  };
  const halfExtents: SceneVector3 = [
    halfExtent(0),
    halfExtent(1),
    halfExtent(2),
  ];
  const centreOffset: SceneVector3 = [
    centreOffsetAt(0),
    centreOffsetAt(1),
    centreOffsetAt(2),
  ];
  return { halfExtents, centreOffset };
}

export interface EvasionDynamics {
  readonly orientation: Quaternion;
  /** Measured body rotation in world axes; a turn already in progress is real. */
  readonly angularVelocity?: SceneVector3;
  /** Net acceleration delivered by the live effectors on the previous frame. */
  readonly currentAcceleration?: SceneVector3;
  readonly authoredNose: readonly [number, number];
  readonly hull: EvasionHull;
  /** Real acceleration envelope after current actuator degradation. */
  readonly horizontalAcceleration: number;
  readonly upwardAcceleration: number;
  readonly downwardAcceleration: number;
  readonly liftReserve: number;
  readonly surgeAcceleration: number;
  /** Reachable attitude rate and the last measured fraction accepted by body. */
  readonly attitudeRate: number;
  /** Reachable pitch/roll angular acceleration from live rotor geometry. */
  readonly attitudeAcceleration?: number;
  readonly maneuverScale: number;
  /** Time for thrust to approach a new request, including motor inertia. */
  readonly actuatorResponseSeconds?: number;
}

export interface EvasionFieldInput {
  readonly centre: SceneVector3;
  readonly velocity: SceneVector3;
  readonly threats: readonly EvasionFieldThreat[];
  readonly closingSeconds: ReadonlyMap<number, number>;
  readonly breakSpeed: number;
  readonly margin: number;
  readonly dynamics: EvasionDynamics;
  readonly deck: number;
  readonly boundary?: { readonly centre: SceneVector3; readonly radius: number };
  /** Threat-derived directions supplied by the analytic detector. */
  readonly directions: readonly SceneVector3[];
}

export interface EvasionFieldResult {
  readonly velocityOffset: SceneVector3;
  readonly acceleration: SceneVector3;
  readonly attitude: Quaternion | null;
  readonly liftFraction: number | null;
  /** Clearance from hull including warhead and chosen safety margin, metres. */
  readonly survivalMargin: number;
  readonly candidateCount: number;
}

interface Candidate {
  readonly velocityOffset: SceneVector3;
  readonly acceleration: SceneVector3;
  readonly attitude: Quaternion;
  readonly liftFraction: number | null;
  /** Rotor acceleration before gravity, along the body's live up axis. */
  readonly liftAcceleration: number;
  /** Duct acceleration along the body's live nose axis. */
  readonly surgeAcceleration: number;
  readonly attitudeAngle: number;
  readonly effort: number;
}

const physicalAdd = (a: SceneVector3, b: SceneVector3): SceneVector3 => [
  a[0] + b[0],
  a[1] + b[1],
  a[2] + b[2],
];
const physicalSubtract = (a: SceneVector3, b: SceneVector3): SceneVector3 => [
  a[0] - b[0],
  a[1] - b[1],
  a[2] - b[2],
];
const physicalScale = (v: SceneVector3, amount: number): SceneVector3 => [
  v[0] * amount,
  v[1] * amount,
  v[2] * amount,
];
const physicalLength = (v: SceneVector3): number => Math.hypot(v[0], v[1], v[2]);
const physicalDot = (a: SceneVector3, b: SceneVector3): number =>
  a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const physicalNormalize = (
  v: SceneVector3,
  fallback: SceneVector3 = [0, 0, 0],
): SceneVector3 => {
  const magnitude = physicalLength(v);
  return magnitude <= PHYSICAL_EPSILON ? fallback : physicalScale(v, 1 / magnitude);
};

function physicalDirectionalAcceleration(
  direction: SceneVector3,
  dynamics: EvasionDynamics,
): number {
  const horizontal = Math.hypot(direction[0], direction[2]);
  const verticalLimit =
    direction[1] >= 0
      ? dynamics.upwardAcceleration
      : dynamics.downwardAcceleration;
  const horizontalShare =
    horizontal / Math.max(PHYSICAL_EPSILON, dynamics.horizontalAcceleration);
  const verticalShare =
    Math.abs(direction[1]) / Math.max(PHYSICAL_EPSILON, verticalLimit);
  const ellipsoidShare = Math.hypot(horizontalShare, verticalShare);
  return ellipsoidShare <= PHYSICAL_EPSILON ? 0 : 1 / ellipsoidShare;
}

function quaternionAngle(from: Quaternion, to: Quaternion): number {
  const relative = normalizeQuaternion(
    multiplyQuaternions(to, conjugateQuaternion(from)),
  );
  return 2 * Math.acos(Math.min(1, Math.abs(relative[3])));
}

function rotateToward(
  from: Quaternion,
  to: Quaternion,
  maximumAngle: number,
): Quaternion {
  let relative = normalizeQuaternion(
    multiplyQuaternions(to, conjugateQuaternion(from)),
  );
  if (relative[3] < 0) {
    relative = [-relative[0], -relative[1], -relative[2], -relative[3]];
  }
  const sine = Math.hypot(relative[0], relative[1], relative[2]);
  const angle = 2 * Math.atan2(sine, relative[3]);
  if (angle <= maximumAngle || sine <= PHYSICAL_EPSILON) {
    return to;
  }
  const axis: SceneVector3 = [
    relative[0] / sine,
    relative[1] / sine,
    relative[2] / sine,
  ];
  return normalizeQuaternion(
    multiplyQuaternions(quaternionAboutAxis(axis, maximumAngle), from),
  );
}

function ellipsoidRadius(
  directionWorld: SceneVector3,
  orientation: Quaternion,
  halfExtents: SceneVector3,
): number {
  const local = rotateVector(conjugateQuaternion(orientation), directionWorld);
  const unit = physicalNormalize(local);
  const denominator = Math.sqrt(
    (unit[0] / Math.max(PHYSICAL_EPSILON, halfExtents[0])) ** 2 +
      (unit[1] / Math.max(PHYSICAL_EPSILON, halfExtents[1])) ** 2 +
      (unit[2] / Math.max(PHYSICAL_EPSILON, halfExtents[2])) ** 2,
  );
  return denominator <= PHYSICAL_EPSILON ? Math.min(...halfExtents) : 1 / denominator;
}

export function evasionHullClearance(
  hullCentre: SceneVector3,
  rocketCentre: SceneVector3,
  orientation: Quaternion,
  hull: EvasionHull,
): number {
  const relative = physicalSubtract(rocketCentre, hullCentre);
  const distance = physicalLength(relative);
  if (distance <= PHYSICAL_EPSILON) {
    return -Math.min(...hull.halfExtents);
  }
  return distance - ellipsoidRadius(relative, orientation, hull.halfExtents);
}

function candidateAt(
  candidate: Candidate,
  input: EvasionFieldInput,
  seconds: number,
  precise = true,
): {
  readonly centre: SceneVector3;
  readonly velocity: SceneVector3;
  readonly attitude: Quaternion;
} {
  const attitudeAt = (atSeconds: number): Quaternion => {
    const angularVelocity = input.dynamics.angularVelocity ?? [0, 0, 0];
    const angularSpeed = physicalLength(angularVelocity);
    // The body cannot forget rotation already accumulated. Its influence
    // decays as the attitude controller brakes it, then the remaining angular
    // budget turns toward the requested pose.
    const persistence = Math.max(
      0.08,
      input.dynamics.actuatorResponseSeconds ?? 0.14,
    );
    const driftAngle =
      angularSpeed <= PHYSICAL_EPSILON
        ? 0
        : angularSpeed *
          persistence *
          (1 - Math.exp(-atSeconds / persistence));
    const drifted =
      driftAngle <= PHYSICAL_EPSILON
        ? input.dynamics.orientation
        : normalizeQuaternion(
            multiplyQuaternions(
              quaternionAboutAxis(
                physicalScale(angularVelocity, 1 / angularSpeed),
                driftAngle,
              ),
              input.dynamics.orientation,
            ),
          );
    const rate =
      input.dynamics.attitudeRate * input.dynamics.maneuverScale;
    const acceleration = Math.max(
      PHYSICAL_EPSILON,
      (input.dynamics.attitudeAcceleration ?? Number.POSITIVE_INFINITY) *
        input.dynamics.maneuverScale,
    );
    const rampSeconds = Number.isFinite(acceleration)
      ? rate / acceleration
      : 0;
    const physicalTurnAngle = Number.isFinite(acceleration)
      ? atSeconds <= rampSeconds
        ? 0.5 * acceleration * atSeconds ** 2
        : 0.5 * acceleration * rampSeconds ** 2 +
          rate * (atSeconds - rampSeconds)
      : rate * atSeconds;
    return rotateToward(
      drifted,
      candidate.attitude,
      physicalTurnAngle,
    );
  };
  const accelerationAt = (atSeconds: number): SceneVector3 => {
    const attitude = attitudeAt(atSeconds);
    const bodyUp = rotateVector(attitude, [0, 1, 0]);
    const bodyNose = rotateVector(attitude, [
      input.dynamics.authoredNose[0],
      0,
      input.dynamics.authoredNose[1],
    ]);
    const requested = physicalAdd(
      physicalAdd(
        physicalScale(bodyUp, candidate.liftAcceleration),
        physicalScale(bodyNose, candidate.surgeAcceleration),
      ),
      [0, -PHYSICAL_GRAVITY, 0],
    );
    const current = input.dynamics.currentAcceleration ?? [0, 0, 0];
    const responseSeconds = Math.max(
      0.04,
      input.dynamics.actuatorResponseSeconds ?? 0.14,
    );
    const response = 1 - Math.exp(-atSeconds / responseSeconds);
    return physicalAdd(physicalScale(current, 1 - response), physicalScale(requested, response));
  };
  // Three-point Gauss integration resolves the sharp first tenths of motor
  // response without adding a per-candidate time loop. The previous endpoint
  // Simpson rule systematically undercounted a rapid thrust dump, making a
  // physically reachable fall look worse than a slow powered climb.
  let velocityDelta: SceneVector3 = [0, 0, 0];
  let moved: SceneVector3 = [0, 0, 0];
  if (precise) {
    const nodes = [0.1127016654, 0.5, 0.8872983346] as const;
    const weights = [5 / 18, 8 / 18, 5 / 18] as const;
    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index];
      const acceleration = accelerationAt(seconds * node);
      velocityDelta = physicalAdd(
        velocityDelta,
        physicalScale(acceleration, weights[index] * seconds),
      );
      moved = physicalAdd(
        moved,
        physicalScale(
          acceleration,
          weights[index] * (1 - node) * seconds ** 2,
        ),
      );
    }
  } else {
    // The short threat-plane pruning pass only needs ordering. One midpoint
    // keeps it cheap; finalists below receive the full quadrature.
    const midpoint = accelerationAt(seconds / 2);
    velocityDelta = physicalScale(midpoint, seconds);
    moved = physicalScale(midpoint, 0.5 * seconds ** 2);
  }
  const speedLimit = physicalLength(candidate.velocityOffset);
  const deltaSpeed = physicalLength(velocityDelta);
  if (speedLimit <= PHYSICAL_EPSILON) {
    velocityDelta = [0, 0, 0];
    moved = [0, 0, 0];
  } else {
    if (deltaSpeed > speedLimit) {
      velocityDelta = physicalScale(velocityDelta, speedLimit / deltaSpeed);
    }
    const maximumTravel = speedLimit * seconds;
    const travel = physicalLength(moved);
    if (travel > maximumTravel) {
      moved = physicalScale(moved, maximumTravel / travel);
    }
  }
  const centre = physicalAdd(
    physicalAdd(input.centre, physicalScale(input.velocity, seconds)),
    moved,
  );
  return {
    centre,
    velocity: physicalAdd(input.velocity, velocityDelta),
    attitude: attitudeAt(seconds),
  };
}

function insideWorldAt(
  at: { readonly centre: SceneVector3; readonly attitude: Quaternion },
  input: EvasionFieldInput,
): boolean {
  const hullOffset = rotateVector(
    at.attitude,
    input.dynamics.hull.centreOffset,
  );
  const hullCentre = physicalAdd(at.centre, hullOffset);
  const downRadius = ellipsoidRadius(
    [0, -1, 0],
    at.attitude,
    input.dynamics.hull.halfExtents,
  );
  const initialHullCentre = physicalAdd(
    input.centre,
    rotateVector(
      input.dynamics.orientation,
      input.dynamics.hull.centreOffset,
    ),
  );
  const initialDownRadius = ellipsoidRadius(
    [0, -1, 0],
    input.dynamics.orientation,
    input.dynamics.hull.halfExtents,
  );
  // A landed or low-hovering craft can legitimately start with the coarse
  // ellipsoid below the authored deck: landing gear, cannon and nacelles are
  // all included in live bounds. Rejecting against an absolute plane then
  // rejects every candidate, including a climb, so the detector reports a
  // missile while the executor commands exactly zero. When already inside an
  // envelope, require the manoeuvre not to make that measured violation worse.
  const minimumBottom = Math.min(
    input.deck + 0.35,
    initialHullCentre[1] - initialDownRadius,
  );
  if (hullCentre[1] - downRadius < minimumBottom - 1e-4) {
    return false;
  }
  if (input.boundary) {
    const radial = Math.hypot(
      hullCentre[0] - input.boundary.centre[0],
      hullCentre[2] - input.boundary.centre[2],
    );
    const planRadius = Math.max(
      input.dynamics.hull.halfExtents[0],
      input.dynamics.hull.halfExtents[2],
    );
    const initialRadial = Math.hypot(
      initialHullCentre[0] - input.boundary.centre[0],
      initialHullCentre[2] - input.boundary.centre[2],
    );
    const maximumRadial = Math.max(
      input.boundary.radius,
      initialRadial + planRadius,
    );
    if (radial + planRadius > maximumRadial + 1e-4) {
      return false;
    }
  }
  return true;
}

function physicalCandidateClearance(
  candidate: Candidate,
  input: EvasionFieldInput,
  sampleShares: readonly number[] = SAMPLE_SHARES,
): number {
  const precise = sampleShares === SAMPLE_SHARES;
  let worst = Number.POSITIVE_INFINITY;
  for (const threat of input.threats) {
    const closest = input.closingSeconds.get(threat.id);
    if (closest === undefined) continue;
    let threatWorst = Number.POSITIVE_INFINITY;
    for (const share of sampleShares) {
      const seconds = Math.min(threat.remainingSeconds, closest * share);
      if (seconds <= 0) continue;
      const at = candidateAt(candidate, input, seconds, precise);
      if (!insideWorldAt(at, input)) return Number.NEGATIVE_INFINITY;
      const hullCentre = physicalAdd(
        at.centre,
        rotateVector(at.attitude, input.dynamics.hull.centreOffset),
      );
      const rocketCentre = physicalAdd(threat.position, physicalScale(threat.velocity, seconds));
      const clearance =
        evasionHullClearance(
          hullCentre,
          rocketCentre,
          at.attitude,
          input.dynamics.hull,
        ) -
        threat.blastRadius -
        input.margin;
      threatWorst = Math.min(threatWorst, clearance);
    }
    if (precise) {
      // The sampled grid is backed by a local closest-approach solve.
      let terminalSeconds = Math.min(threat.remainingSeconds, closest);
      for (let iteration = 0; iteration < 2; iteration += 1) {
        const at = candidateAt(candidate, input, terminalSeconds, precise);
        const rocketCentre = physicalAdd(
          threat.position,
          physicalScale(threat.velocity, terminalSeconds),
        );
        const relative = physicalSubtract(rocketCentre, at.centre);
        const relativeVelocity = physicalSubtract(threat.velocity, at.velocity);
        const speedSq = physicalDot(relativeVelocity, relativeVelocity);
        if (speedSq <= PHYSICAL_EPSILON) break;
        terminalSeconds = Math.max(
          0,
          Math.min(
            threat.remainingSeconds,
            terminalSeconds - physicalDot(relative, relativeVelocity) / speedSq,
          ),
        );
      }
      const terminal = candidateAt(candidate, input, terminalSeconds, precise);
      if (!insideWorldAt(terminal, input)) return Number.NEGATIVE_INFINITY;
      const terminalHullCentre = physicalAdd(
        terminal.centre,
        rotateVector(terminal.attitude, input.dynamics.hull.centreOffset),
      );
      const terminalRocketCentre = physicalAdd(
        threat.position,
        physicalScale(threat.velocity, terminalSeconds),
      );
      threatWorst = Math.min(
        threatWorst,
        evasionHullClearance(
          terminalHullCentre,
          terminalRocketCentre,
          terminal.attitude,
          input.dynamics.hull,
        ) -
          threat.blastRadius -
          input.margin,
      );
    }
    worst = Math.min(worst, threatWorst);
  }
  return worst;
}

function candidates(input: EvasionFieldInput): Candidate[] {
  const result: Candidate[] = [
    {
      velocityOffset: [0, 0, 0],
      acceleration: [0, 0, 0],
      attitude: input.dynamics.orientation,
      liftFraction: null,
      liftAcceleration: PHYSICAL_GRAVITY,
      surgeAcceleration: 0,
      attitudeAngle: 0,
      effort: 0,
    },
  ];
  const preferredAxis = physicalNormalize(
    rotateVector(input.dynamics.orientation, [
      input.dynamics.authoredNose[0],
      0,
      input.dynamics.authoredNose[1],
    ]),
    [0, 0, 1],
  );
  const postureCapability = {
    liftReserve: input.dynamics.liftReserve,
    surgeAcceleration: input.dynamics.surgeAcceleration,
  };
  const primarySeconds = Math.min(
    ...[...input.closingSeconds.values()].filter((seconds) => seconds > 0),
  );
  for (const direction of input.directions) {
    const maximumAcceleration = physicalDirectionalAcceleration(
      direction,
      input.dynamics,
    );
    const speedShares =
      primarySeconds <=
          input.breakSpeed /
            Math.max(PHYSICAL_EPSILON, maximumAcceleration)
        ? [1] as const
        : SPEED_SHARES;
    for (const speedShare of speedShares) {
      const wantedAcceleration = physicalScale(
        direction,
        maximumAcceleration * speedShare,
      );
      const demand = postureDemand(
        preferredAxis,
        wantedAcceleration,
        postureCapability,
      );
      if (!demand.feasible || physicalLength(demand.acceptedAcceleration) <= PHYSICAL_EPSILON) {
        continue;
      }
      const posture = solvePosture(
        input.dynamics.authoredNose,
        preferredAxis,
        wantedAcceleration,
        postureCapability,
      );
      result.push({
        velocityOffset: physicalScale(
          physicalNormalize(demand.acceptedAcceleration),
          input.breakSpeed * speedShare,
        ),
        acceleration: demand.acceptedAcceleration,
        attitude: posture.attitude,
        liftFraction: posture.liftFraction,
        liftAcceleration: physicalLength(demand.acceptedPerpendicular),
        surgeAcceleration: demand.surge,
        attitudeAngle: quaternionAngle(
          input.dynamics.orientation,
          posture.attitude,
        ),
        effort: speedShare,
      });
    }
  }
  return result;
}

export function chooseEvasionCorrection(
  input: EvasionFieldInput,
): EvasionFieldResult {
  const candidateScore = (candidate: Candidate, clearance: number) =>
    Math.min(clearance, 2) * 100 -
    candidate.effort * 3 -
    candidate.attitudeAngle * 1.5;
  // Первый проход получает только направления из плоскости реальной угрозы.
  // Точная временная сетка и ±малый доворот нужны нескольким лидерам.
  const field = candidates(input);
  const finalists = field
    .map((candidate) => {
      const clearance = physicalCandidateClearance(
        candidate,
        input,
        COARSE_SAMPLE_SHARES,
      );
      return { candidate, score: candidateScore(candidate, clearance) };
    })
    .filter((entry) => Number.isFinite(entry.score))
    .sort((a, b) => b.score - a.score)
    .slice(0, 7)
    .map(({ candidate }) => candidate);
  let best: Candidate | null = null;
  let bestClearance = Number.NEGATIVE_INFINITY;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const candidate of finalists) {
    const clearance = physicalCandidateClearance(candidate, input);
    if (!Number.isFinite(clearance)) continue;
    // После двух метров чистого запаса выигрыш считается купленным; дальше
    // поле предпочитает меньшую потерю задания и меньший поворот корпуса.
    const score = candidateScore(candidate, clearance);
    if (score > bestScore) {
      best = candidate;
      bestClearance = clearance;
      bestScore = score;
    }
  }
  if (!best) {
    return {
      velocityOffset: [0, 0, 0],
      acceleration: [0, 0, 0],
      attitude: null,
      liftFraction: null,
      survivalMargin: Number.NEGATIVE_INFINITY,
      candidateCount: field.length + finalists.length,
    };
  }
  return {
    velocityOffset: best.velocityOffset,
    // The posture already turns the rotor thrust, liftFraction sets its
    // magnitude, and velocityOffset drives the ducts. Feeding the same vector
    // into ordinary-flight pathAcceleration would command it a second time
    // (most visibly, vertical acceleration was counted twice).
    acceleration: [0, 0, 0],
    attitude:
      best.attitudeAngle > 1e-4 ? best.attitude : null,
    liftFraction: best.liftFraction,
    survivalMargin: bestClearance,
    candidateCount: field.length + finalists.length,
  };
}

/** Что машина знает о себе, уклоняясь. */
export interface EvasionOwnState {
  /** Владелец своих снарядов: единственная ракета, которую можно игнорировать. */
  readonly id: string;
  readonly centre: SceneVector3;
  readonly velocity: SceneVector3;
  /** Настоящий габарит текущего кадра, а не дубль числа в паспорте уклонения. */
  readonly radius: number;
}

/**
 * РАКЕТА В ВОЗДУХЕ — то, от чего уклоняются. Положение, скорость и радиус
 * поражения, остаток взрывателя и владелец: больше жертве знать не нужно.
 */
export interface RocketThreat {
  readonly id: number;
  /** `null` оставлен внешним снарядам без владельца; они опасны всем. */
  readonly ownerId: string | null;
  readonly kind: Extract<ExplosiveKind, "rocket" | "lance" | "podRocket">;
  readonly position: SceneVector3;
  readonly velocity: SceneVector3;
  readonly blastRadius: number;
  /** Сколько физического полёта осталось до самоликвидации, с. */
  readonly remainingSeconds: number;
}

export interface RocketThreatRegistry {
  readonly current: Map<number, RocketThreat>;
}

/**
 * Один вход в воздушную обстановку для пользовательских и бортовых снарядов.
 * Скорость берётся с физического тела снаружи, поражающий радиус — из
 * паспорта боеприпаса здесь. Граната не становится ракетой из-за общего пула.
 */
export function projectileRocketThreat(
  id: number,
  ownerId: string | null,
  kind: ExplosiveKind,
  position: SceneVector3,
  velocity: SceneVector3,
  ageSeconds = 0,
): RocketThreat | null {
  if (kind !== "rocket" && kind !== "lance" && kind !== "podRocket") {
    return null;
  }
  const profile = explosiveProfile(kind);
  return {
    id,
    ownerId,
    kind,
    position,
    velocity,
    blastRadius: profile.blastRadius,
    remainingSeconds: Math.max(0, profile.projectile.fuseMs / 1_000 - ageSeconds),
  };
}

/**
 * СБЛИЖЕНИЕ С РАКЕТОЙ: через сколько секунд она пройдёт ближе всего и на
 * каком расстоянии. Считается по относительному движению обоих — ракета
 * быстрая, но и жертва не стоит.
 *
 * `seconds <= 0` означает, что ближайшая точка уже позади: ракета промахнулась
 * и уходит, дёргаться поздно и незачем.
 */
export function rocketApproach(
  own: EvasionOwnState,
  rocket: RocketThreat,
): { readonly seconds: number; readonly miss: number; readonly offset: SceneVector3 } {
  const relative = runtimeSubtract(rocket.position, own.centre);
  const closing = runtimeSubtract(rocket.velocity, own.velocity);
  const speedSq = closing[0] ** 2 + closing[1] ** 2 + closing[2] ** 2;
  if (speedSq < RUNTIME_EPSILON) {
    return { seconds: 0, miss: runtimeLength(relative), offset: runtimeScale(relative, -1) };
  }
  const seconds = -(
    relative[0] * closing[0] +
    relative[1] * closing[1] +
    relative[2] * closing[2]
  ) / speedSq;
  const at: SceneVector3 = [
    relative[0] + closing[0] * seconds,
    relative[1] + closing[1] * seconds,
    relative[2] + closing[2] * seconds,
  ];
  // Вектор промаха смотрит ОТ ракеты К машине: рвать вдоль него — прямейший
  // способ увеличить промах.
  return { seconds, miss: runtimeLength(at), offset: runtimeScale(at, -1) };
}

/**
 * Паспортная способность уклоняться. Нет поля — машина не уклоняется вовсе,
 * и это законный ответ: драккар и состав неба не должны дёргаться от чужой
 * скорости.
 */
export interface EvasionCapability {
  /**
   * Насколько сильно машина сходит с линии, м/с. Не ускорение и не «сила»:
   * это боковая скорость, которую уклонение просит у общего контура, и он
   * ограничит её тем, что машина реально может.
   */
  readonly breakSpeed: number;
  /** Выдержка только для legacy-вызовов без живой динамики. */
  readonly breakSeconds: number;
  /**
   * Запас к радиусу поражения, м. Ноль означал бы уклонение ровно на границе,
   * где ошибка в дециметр решает; запас покупает право ошибиться.
   */
  readonly margin: number;
  /**
   * Дальше этого горизонта пуск не тревожит: ракета ещё далеко, и решение
   * успеет принять следующий кадр. Секунды, а не метры.
   */
  readonly horizonSeconds: number;
}

export interface EvasionState {
  /** Runtime-телеметрия; authority только у расчёта текущего кадра. */
  readonly breakSeconds: number;
  /** Направление рывка в мире, единичное. Ноль-вектор — рывка нет. */
  readonly breakDirection: SceneVector3;
  /** От какой ракеты уходим. Нужно, чтобы не начинать рывок дважды. */
  readonly threatId: number | null;
  /** Последняя фактическая срочность выбранной ракеты. */
  readonly closingSeconds?: number | null;
  /** Победившее физически достижимое требование живёт весь рывок. */
  readonly velocityOffset?: SceneVector3;
  readonly acceleration?: SceneVector3;
  readonly attitude?: Quaternion | null;
  readonly liftFraction?: number | null;
  readonly survivalMargin?: number | null;
}

export interface EvasionInput {
  readonly own: EvasionOwnState;
  /** Ракеты в воздухе. Пусто — уклоняться не от чего, и это норма. */
  readonly rockets: readonly RocketThreat[];
  readonly capability: EvasionCapability;
  readonly deltaSeconds: number;
  readonly state: EvasionState;
  /** Живое тело; без него остаётся прежняя сферическая коррекция. */
  readonly dynamics?: EvasionDynamics;
  /**
   * Высота палубы: ниже неё уклоняться вниз нельзя. Без неё машина уходит от
   * пушки в землю, что охотника более чем устраивает.
   */
  readonly deck: number;
  /**
   * Кромка мира: центр и радиус, за которые уходить нельзя. КОНВЕРТ ФИЛЬТРУЕТ
   * НАБОР НАПРАВЛЕНИЙ ДО ВЫБОРА ПО УГРОЗЕ, а не после: наивный «максимум
   * расхождения с линией огня» — это окружность направлений, и половина её
   * ведёт в грунт или за кромку. Красиво увернуться в дом — не уклонение.
   */
  readonly boundary?: { readonly centre: SceneVector3; readonly radius: number };
}

export interface EvasionOutput {
  readonly state: EvasionState;
  /**
   * Поправка к скорости, м/с, в мировых осях. Ноль — трасса идёт как шла.
   * Общий контур накладывает её поверх маршрутного требования.
   */
  readonly velocityOffset: SceneVector3;
  /** От какой ракеты уходим. Для ленты и разбора, решение уже принято. */
  readonly threatId: number | null;
  /** Секунды до сближения с ней; `null` — никого. */
  readonly closingSeconds: number | null;
  /** Насколько она прошла бы мимо, если не двигаться, м. */
  readonly miss: number | null;
  /** Всевекторное требование для общего физического контура. */
  readonly acceleration?: SceneVector3;
  readonly attitude?: Quaternion | null;
  readonly liftFraction?: number | null;
  readonly survivalMargin?: number | null;
}

export function createEvasionState(): EvasionState {
  return {
    breakSeconds: 0,
    breakDirection: [0, 0, 0],
    threatId: null,
    closingSeconds: null,
    velocityOffset: [0, 0, 0],
    acceleration: [0, 0, 0],
    attitude: null,
    liftFraction: null,
    survivalMargin: null,
  };
}

const RUNTIME_EPSILON = 1e-6;

function runtimeSubtract(a: SceneVector3, b: SceneVector3): SceneVector3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function runtimeLength(v: SceneVector3): number {
  return Math.hypot(v[0], v[1], v[2]);
}

function runtimeScale(v: SceneVector3, k: number): SceneVector3 {
  return [v[0] * k, v[1] * k, v[2] * k];
}

function runtimeNormalize(v: SceneVector3): SceneVector3 {
  const len = runtimeLength(v);
  return len < RUNTIME_EPSILON ? [0, 0, 0] : runtimeScale(v, 1 / len);
}

function runtimeCross(a: SceneVector3, b: SceneVector3): SceneVector3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

/**
 * СЕКУНДЫ ДО ВСТРЕЧИ, если оба идут как идут. `null` — борт не сближается.
 *
 * Считается по проекции относительной скорости на линию визирования, а не по
 * модулю: борт, проходящий мимо на большой скорости, к встрече не ведёт, и
 * пугаться его незачем.
 */
export function closingSeconds(
  own: EvasionOwnState,
  track: AirCombatTrack,
): number | null {
  const relative = runtimeSubtract(track.centre, own.centre);
  const range = runtimeLength(relative);
  if (range < RUNTIME_EPSILON) {
    return 0;
  }
  const line = runtimeScale(relative, 1 / range);
  const approach = runtimeSubtract(own.velocity, track.velocity);
  const closing = approach[0] * line[0] + approach[1] * line[1] + approach[2] * line[2];
  return closing <= RUNTIME_EPSILON ? null : range / closing;
}

/**
 * ИДЁТ ЛИ ОН НА МЕНЯ — правило постоянного пеленга.
 *
 * Вращение линии визирования — это то, насколько борт СМЕЩАЕТСЯ вбок
 * относительно меня. Ноль означает встречу: он держит меня на неизменном
 * пеленге и сокращает дистанцию, то есть целится или таранит. Большое
 * вращение — пролёт мимо.
 *
 * Порог берётся не из воздуха, а из времени до встречи: за оставшиеся
 * секунды борт при таком вращении сместится вбок на `ω·t·range`, и если это
 * меньше габарита машины — он всё равно придёт в неё.
 */
export function onCollisionCourse(
  own: EvasionOwnState,
  track: AirCombatTrack,
  seconds: number,
): boolean {
  const relative = runtimeSubtract(track.centre, own.centre);
  const range = runtimeLength(relative);
  if (range < RUNTIME_EPSILON) {
    return true;
  }
  const omega = runtimeLength(
    lineOfSightRotation(relative, runtimeSubtract(track.velocity, own.velocity)),
  );
  // Промах, который он наберёт к моменту встречи, против его же габарита.
  const miss = omega * seconds * range;
  return miss <= Math.max(track.radius, 1) * 3;
}

/**
 * КУДА РВАТЬ. Поперёк линии визирования — там его прицелу дороже всего.
 *
 * Из двух поперечных направлений берётся то, что уводит ВВЕРХ И В СТОРОНУ от
 * его курса: вниз уходить нельзя (там палуба и земля), а разворот навстречу
 * его же смещению только облегчает ему задачу.
 */
export function breakDirection(
  own: EvasionOwnState,
  missOffset: SceneVector3,
  deck: number,
  boundary?: { readonly centre: SceneVector3; readonly radius: number },
): SceneVector3 {
  // ВДОЛЬ ВЕКТОРА ПРОМАХА. В точке наибольшего сближения уже известно, с какой
  // стороны ракета пройдёт; уходить надо туда же, только дальше. Это не
  // эвристика «вбок от линии огня», а прямая производная промаха по смещению.
  let wanted = runtimeNormalize(missOffset);
  if (runtimeLength(wanted) < RUNTIME_EPSILON) {
    // Ракета идёт точно в центр: любая поперечная сторона одинаково хороша,
    // берём вверх — там у винтокрылой всегда есть тяга.
    wanted = [0, 1, 0];
  }

  // КОНВЕРТ СНАЧАЛА. У самой палубы вниз нельзя, за кромку мира нельзя.
  const room = own.centre[1] - deck;
  if (room < 12 && wanted[1] < 0) {
    wanted = runtimeNormalize([wanted[0], Math.abs(wanted[1]), wanted[2]]);
  }
  if (boundary) {
    const ahead = Math.hypot(
      own.centre[0] + wanted[0] * 20 - boundary.centre[0],
      own.centre[2] + wanted[2] * 20 - boundary.centre[2],
    );
    if (ahead > boundary.radius) {
      // Наружу нельзя — остаётся то же смещение, вывернутое внутрь мира.
      wanted = runtimeNormalize([-wanted[0], Math.max(wanted[1], 0.4), -wanted[2]]);
    }
  }

  // РЫВОК СМЕЩАЕТ, НО НЕ ТОРМОЗИТ: составляющая вдоль собственной скорости
  // снимается. Тормозящая жертва удобнее для упреждения, а не труднее, и
  // вдобавок бросает свою задачу.
  const heading = runtimeNormalize(own.velocity);
  if (runtimeLength(heading) < RUNTIME_EPSILON) {
    return wanted;
  }
  const along =
    wanted[0] * heading[0] + wanted[1] * heading[1] + wanted[2] * heading[2];
  const across = runtimeNormalize([
    wanted[0] - heading[0] * along,
    wanted[1] - heading[1] * along,
    wanted[2] - heading[2] * along,
  ]);
  return runtimeLength(across) < RUNTIME_EPSILON ? [0, 1, 0] : across;
}

/**
 * ШАГ УКЛОНЕНИЯ.
 *
 * Порядок намеренный: начатый рывок доводится без покадрового пересмотра.
 * Новая ракета получает право прервать его только если прежней уже нет среди
 * угроз либо новая придёт заметно раньше. Это не выбор «красивее», а смена
 * физически главной опасности.
 */
function stepLegacyEvasion(input: EvasionInput): EvasionOutput {
  const { own, rockets, capability, deltaSeconds, state, deck } = input;

  // Самая опасная ракета: та, что придёт ближе всего и раньше всех. НЕ
  // ПОПАДАЕТ — НЕ СЧИТАЕТСЯ: промах больше радиуса поражения с запасом
  // означает, что манёвр только испортит собственный маршрут.
  const lethal = own.radius + capability.margin;
  let threat: RocketThreat | null = null;
  let threatSeconds: number | null = null;
  let threatMiss: number | null = null;
  const threatening: RocketThreat[] = [];
  const closingByThreat = new Map<number, number>();
  for (const rocket of rockets) {
    if (rocket.ownerId === own.id) {
      continue;
    }
    const { seconds, miss } = rocketApproach(own, rocket);
    if (
      seconds <= 0 ||
      seconds > capability.horizonSeconds ||
      seconds > rocket.remainingSeconds
    ) {
      continue;
    }
    if (miss > rocket.blastRadius + lethal) {
      continue;
    }
    threatening.push(rocket);
    closingByThreat.set(rocket.id, seconds);
    if (threatSeconds === null || seconds < threatSeconds) {
      threat = rocket;
      threatSeconds = seconds;
      threatMiss = miss;
    }
  }

  const remaining = Math.max(0, state.breakSeconds - deltaSeconds);
  const committedSeconds = state.threatId === null
    ? null
    : closingByThreat.get(state.threatId) ?? null;
  const urgentReplacement =
    remaining > 0 &&
    threat !== null &&
    threat.id !== state.threatId &&
    (committedSeconds === null ||
      (threatSeconds ?? Number.POSITIVE_INFINITY) + 0.08 < committedSeconds);
  if (remaining > 0 && !urgentReplacement) {
    const selectedApproach = state.threatId === null
      ? null
      : rockets.find((rocket) => rocket.id === state.threatId) ?? null;
    const selected = selectedApproach
      ? rocketApproach(own, selectedApproach)
      : null;
    return {
      state: {
        ...state,
        breakSeconds: remaining,
        closingSeconds:
          selected && selected.seconds > 0
            ? selected.seconds
            : Math.max(0, (state.closingSeconds ?? 0) - deltaSeconds),
      },
      velocityOffset:
        state.velocityOffset ?? runtimeScale(state.breakDirection, capability.breakSpeed),
      // Докладывается та ракета, чью команду машина ИСПОЛНЯЕТ. Раньше здесь
      // показывалась новая угроза при старом физическом рывке — панель говорила
      // правду о зрении и неправду о действии.
      threatId: state.threatId,
      closingSeconds: selected?.seconds ?? state.closingSeconds ?? null,
      miss: selected?.miss ?? null,
      acceleration: state.acceleration,
      attitude: state.attitude,
      liftFraction: state.liftFraction,
      survivalMargin: state.survivalMargin,
    };
  }

  if (!threat) {
    return {
      state: createEvasionState(),
      velocityOffset: [0, 0, 0],
      threatId: null,
      closingSeconds: null,
      miss: null,
      acceleration: [0, 0, 0],
      attitude: null,
      liftFraction: null,
      survivalMargin: null,
    };
  }

  const direction = breakDirection(
    own,
    rocketApproach(own, threat).offset,
    deck,
    input.boundary,
  );
  const velocityOffset = runtimeScale(direction, capability.breakSpeed);
  // ВЫДЕРЖКА РЫВКА ГУЛЯЕТ, И ЭТО НЕ УКРАШЕНИЕ. Два реактивных контура с
  // одинаковыми постоянными времени сцепляются в устойчивый танец, где манёвр
  // жертвы становится функцией от того, что делает охотник, — то есть
  // идеально упреждаемым. Разброс берётся из ГЕОМЕТРИИ (секунды до встречи),
  // а не из случайного числа: тогда он не периодичен и при этом воспроизводим
  // в тесте.
  // Выдержка чуть длиннее времени подлёта: манёвр обязан пережить ракету,
  // которая уже в воздухе, и не оборваться за миг до её прохода.
  const jitter = 1 + Math.min(1, (threatSeconds ?? 0));
  return {
    state: {
      breakSeconds: capability.breakSeconds * jitter,
      breakDirection: direction,
      threatId: threat.id,
      closingSeconds: threatSeconds,
      velocityOffset,
      acceleration: [0, 0, 0],
      attitude: null,
      liftFraction: null,
      survivalMargin: null,
    },
    velocityOffset,
    threatId: threat.id,
    closingSeconds: threatSeconds,
    miss: threatMiss,
    acceleration: [0, 0, 0],
    attitude: null,
    liftFraction: null,
    survivalMargin: null,
  };
}

function threatPlaneDirections(
  input: EvasionInput,
  solution: NonNullable<ReturnType<typeof solveMissileEvasion>>,
): readonly SceneVector3[] {
  const result: SceneVector3[] = [];
  const add = (raw: SceneVector3) => {
    const direction = breakDirection(
      input.own,
      raw,
      input.deck,
      input.boundary,
    );
    if (runtimeLength(direction) <= RUNTIME_EPSILON) return;
    if (result.some((existing) =>
      existing[0] * direction[0] +
        existing[1] * direction[1] +
        existing[2] * direction[2] >
      1 - 1e-5
    )) return;
    result.push(direction);
  };
  add(solution.direction);
  for (const assessment of solution.assessments) {
    const line = runtimeNormalize(assessment.relativeVelocity);
    let first = runtimeNormalize([
      -line[0] * line[1],
      1 - line[1] ** 2,
      -line[2] * line[1],
    ]);
    if (runtimeLength(first) <= RUNTIME_EPSILON) {
      first = runtimeNormalize([1 - line[0] ** 2, -line[0] * line[1], -line[0] * line[2]]);
    }
    const second = runtimeNormalize(runtimeCross(line, first));
    for (let index = 0; index < 8; index += 1) {
      const angle = (index * Math.PI) / 4;
      add([
        first[0] * Math.cos(angle) + second[0] * Math.sin(angle),
        first[1] * Math.cos(angle) + second[1] * Math.sin(angle),
        first[2] * Math.cos(angle) + second[2] * Math.sin(angle),
      ]);
    }
  }
  return result;
}

/**
 * Runtime adapter for the pure analytic missile reflex.
 *
 * The pure solver is deliberately called every step. `EvasionState` remains
 * an outward telemetry/compatibility shape, not an authority that can hide a
 * new launch or force the body to finish a stale command.
 */
export function stepEvasion(input: EvasionInput): EvasionOutput {
  if (!input.dynamics) {
    return stepLegacyEvasion(input);
  }

  const { own, capability, dynamics } = input;
  const solution = solveMissileEvasion({
    body: {
      id: own.id,
      centre: own.centre,
      velocity: own.velocity,
      acceleration: dynamics.currentAcceleration ?? [0, 0, 0],
      collisionRadius: own.radius,
    },
    threats: input.rockets,
    envelope: {
      horizontalAcceleration: dynamics.horizontalAcceleration,
      upwardAcceleration: dynamics.upwardAcceleration,
      downwardAcceleration: dynamics.downwardAcceleration,
    },
    policy: {
      horizonSeconds: capability.horizonSeconds,
      margin: capability.margin,
    },
  });
  if (!solution) {
    return {
      state: createEvasionState(),
      velocityOffset: [0, 0, 0],
      threatId: null,
      closingSeconds: null,
      miss: null,
      acceleration: [0, 0, 0],
      attitude: null,
      liftFraction: null,
      survivalMargin: null,
    };
  }

  const correction = chooseEvasionCorrection({
    centre: own.centre,
    velocity: own.velocity,
    threats: solution.assessments.map((assessment) => assessment.threat),
    closingSeconds: new Map(
      solution.assessments.map((assessment) => [
        assessment.threat.id,
        assessment.eventSeconds,
      ]),
    ),
    breakSpeed: capability.breakSpeed,
    margin: capability.margin,
    dynamics,
    deck: input.deck,
    boundary: input.boundary,
    directions: threatPlaneDirections(input, solution),
  });
  const executedDirection = runtimeNormalize(correction.velocityOffset);
  const primary = solution.assessments.find(
    (assessment) => assessment.threat.id === solution.primaryThreatId,
  )!;
  const state: EvasionState = {
    // Compatibility/telemetry only: recomputed next step, never consumed as a
    // commitment by the analytic path.
    breakSeconds: Math.max(input.deltaSeconds, primary.eventSeconds),
    breakDirection: executedDirection,
    threatId: solution.primaryThreatId,
    closingSeconds: primary.eventSeconds,
    velocityOffset: correction.velocityOffset,
    acceleration: correction.acceleration,
    attitude: correction.attitude,
    liftFraction: correction.liftFraction,
    survivalMargin: correction.survivalMargin,
  };
  return {
    state,
    velocityOffset: correction.velocityOffset,
    threatId: solution.primaryThreatId,
    closingSeconds: primary.eventSeconds,
    miss: primary.separation,
    acceleration: correction.acceleration,
    attitude: correction.attitude,
    liftFraction: correction.liftFraction,
    survivalMargin: correction.survivalMargin,
  };
}
