/**
 * ВСЕВЕКТОРНОЕ ПОЛЕ УКЛОНЕНИЯ.
 *
 * Результат здесь — не имя манёвра. Поле пробует короткие, физически
 * достижимые ускорения во всех пространственных направлениях и небольшие
 * изменения позы. Побеждает то, после чего худшая из летящих ракет проходит
 * дальше всего от ОРИЕНТИРОВАННОГО габарита машины, а не от абстрактного шара.
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
import { postureDemand, solvePosture } from "./airCombatPosture.ts";

const GRAVITY = 9.81;
const EPSILON = 1e-8;
const MAX_MINOR_ATTITUDE = (12 * Math.PI) / 180;
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

const add = (a: SceneVector3, b: SceneVector3): SceneVector3 => [
  a[0] + b[0],
  a[1] + b[1],
  a[2] + b[2],
];
const subtract = (a: SceneVector3, b: SceneVector3): SceneVector3 => [
  a[0] - b[0],
  a[1] - b[1],
  a[2] - b[2],
];
const scale = (v: SceneVector3, amount: number): SceneVector3 => [
  v[0] * amount,
  v[1] * amount,
  v[2] * amount,
];
const length = (v: SceneVector3): number => Math.hypot(v[0], v[1], v[2]);
const dot = (a: SceneVector3, b: SceneVector3): number =>
  a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const normalize = (
  v: SceneVector3,
  fallback: SceneVector3 = [0, 0, 0],
): SceneVector3 => {
  const magnitude = length(v);
  return magnitude <= EPSILON ? fallback : scale(v, 1 / magnitude);
};

const FIELD_DIRECTIONS: readonly SceneVector3[] = (() => {
  const directions: SceneVector3[] = [];
  for (const x of [-1, 0, 1]) {
    for (const y of [-1, 0, 1]) {
      for (const z of [-1, 0, 1]) {
        if (x === 0 && y === 0 && z === 0) continue;
        directions.push(normalize([x, y, z]));
      }
    }
  }
  return directions;
})();

function directionalAcceleration(
  direction: SceneVector3,
  dynamics: EvasionDynamics,
): number {
  const horizontal = Math.hypot(direction[0], direction[2]);
  const verticalLimit =
    direction[1] >= 0
      ? dynamics.upwardAcceleration
      : dynamics.downwardAcceleration;
  const horizontalShare =
    horizontal / Math.max(EPSILON, dynamics.horizontalAcceleration);
  const verticalShare =
    Math.abs(direction[1]) / Math.max(EPSILON, verticalLimit);
  const ellipsoidShare = Math.hypot(horizontalShare, verticalShare);
  return ellipsoidShare <= EPSILON ? 0 : 1 / ellipsoidShare;
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
  if (angle <= maximumAngle || sine <= EPSILON) {
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
  const unit = normalize(local);
  const denominator = Math.sqrt(
    (unit[0] / Math.max(EPSILON, halfExtents[0])) ** 2 +
      (unit[1] / Math.max(EPSILON, halfExtents[1])) ** 2 +
      (unit[2] / Math.max(EPSILON, halfExtents[2])) ** 2,
  );
  return denominator <= EPSILON ? Math.min(...halfExtents) : 1 / denominator;
}

export function evasionHullClearance(
  hullCentre: SceneVector3,
  rocketCentre: SceneVector3,
  orientation: Quaternion,
  hull: EvasionHull,
): number {
  const relative = subtract(rocketCentre, hullCentre);
  const distance = length(relative);
  if (distance <= EPSILON) {
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
    const angularSpeed = length(angularVelocity);
    // The body cannot forget rotation already accumulated. Its influence
    // decays as the attitude controller brakes it, then the remaining angular
    // budget turns toward the requested pose.
    const persistence = Math.max(
      0.08,
      input.dynamics.actuatorResponseSeconds ?? 0.14,
    );
    const driftAngle =
      angularSpeed <= EPSILON
        ? 0
        : angularSpeed *
          persistence *
          (1 - Math.exp(-atSeconds / persistence));
    const drifted =
      driftAngle <= EPSILON
        ? input.dynamics.orientation
        : normalizeQuaternion(
            multiplyQuaternions(
              quaternionAboutAxis(
                scale(angularVelocity, 1 / angularSpeed),
                driftAngle,
              ),
              input.dynamics.orientation,
            ),
          );
    const rate =
      input.dynamics.attitudeRate * input.dynamics.maneuverScale;
    const acceleration = Math.max(
      EPSILON,
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
    const requested = add(
      add(
        scale(bodyUp, candidate.liftAcceleration),
        scale(bodyNose, candidate.surgeAcceleration),
      ),
      [0, -GRAVITY, 0],
    );
    const current = input.dynamics.currentAcceleration ?? [0, 0, 0];
    const responseSeconds = Math.max(
      0.04,
      input.dynamics.actuatorResponseSeconds ?? 0.14,
    );
    const response = 1 - Math.exp(-atSeconds / responseSeconds);
    return add(scale(current, 1 - response), scale(requested, response));
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
      velocityDelta = add(
        velocityDelta,
        scale(acceleration, weights[index] * seconds),
      );
      moved = add(
        moved,
        scale(
          acceleration,
          weights[index] * (1 - node) * seconds ** 2,
        ),
      );
    }
  } else {
    // The 131-ray pruning pass only needs ordering. One reachable midpoint
    // keeps it cheap; finalists below receive the full quadrature.
    const midpoint = accelerationAt(seconds / 2);
    velocityDelta = scale(midpoint, seconds);
    moved = scale(midpoint, 0.5 * seconds ** 2);
  }
  const speedLimit = length(candidate.velocityOffset);
  const deltaSpeed = length(velocityDelta);
  if (speedLimit <= EPSILON) {
    velocityDelta = [0, 0, 0];
    moved = [0, 0, 0];
  } else {
    if (deltaSpeed > speedLimit) {
      velocityDelta = scale(velocityDelta, speedLimit / deltaSpeed);
    }
    const maximumTravel = speedLimit * seconds;
    const travel = length(moved);
    if (travel > maximumTravel) {
      moved = scale(moved, maximumTravel / travel);
    }
  }
  const centre = add(
    add(input.centre, scale(input.velocity, seconds)),
    moved,
  );
  return {
    centre,
    velocity: add(input.velocity, velocityDelta),
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
  const hullCentre = add(at.centre, hullOffset);
  const downRadius = ellipsoidRadius(
    [0, -1, 0],
    at.attitude,
    input.dynamics.hull.halfExtents,
  );
  if (hullCentre[1] - downRadius < input.deck + 0.35) {
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
    if (radial + planRadius > input.boundary.radius) {
      return false;
    }
  }
  return true;
}

function candidateClearance(
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
      const hullCentre = add(
        at.centre,
        rotateVector(at.attitude, input.dynamics.hull.centreOffset),
      );
      const rocketCentre = add(threat.position, scale(threat.velocity, seconds));
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
        const rocketCentre = add(
          threat.position,
          scale(threat.velocity, terminalSeconds),
        );
        const relative = subtract(rocketCentre, at.centre);
        const relativeVelocity = subtract(threat.velocity, at.velocity);
        const speedSq = dot(relativeVelocity, relativeVelocity);
        if (speedSq <= EPSILON) break;
        terminalSeconds = Math.max(
          0,
          Math.min(
            threat.remainingSeconds,
            terminalSeconds - dot(relative, relativeVelocity) / speedSq,
          ),
        );
      }
      const terminal = candidateAt(candidate, input, terminalSeconds, precise);
      if (!insideWorldAt(terminal, input)) return Number.NEGATIVE_INFINITY;
      const terminalHullCentre = add(
        terminal.centre,
        rotateVector(terminal.attitude, input.dynamics.hull.centreOffset),
      );
      const terminalRocketCentre = add(
        threat.position,
        scale(threat.velocity, terminalSeconds),
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
      liftAcceleration: GRAVITY,
      surgeAcceleration: 0,
      attitudeAngle: 0,
      effort: 0,
    },
  ];
  const preferredAxis = normalize(
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
  for (const direction of FIELD_DIRECTIONS) {
    const maximumAcceleration = directionalAcceleration(
      direction,
      input.dynamics,
    );
    for (const speedShare of SPEED_SHARES) {
      const wantedAcceleration = scale(
        direction,
        maximumAcceleration * speedShare,
      );
      const demand = postureDemand(
        preferredAxis,
        wantedAcceleration,
        postureCapability,
      );
      if (!demand.feasible || length(demand.acceptedAcceleration) <= EPSILON) {
        continue;
      }
      const posture = solvePosture(
        input.dynamics.authoredNose,
        preferredAxis,
        wantedAcceleration,
        postureCapability,
      );
      result.push({
        velocityOffset: scale(
          normalize(demand.acceptedAcceleration),
          input.breakSpeed * speedShare,
        ),
        acceleration: demand.acceptedAcceleration,
        attitude: posture.attitude,
        liftFraction: posture.liftFraction,
        liftAcceleration: length(demand.acceptedPerpendicular),
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
  // Первый проход дешёвый: 131 достижимое ускорение, без вариантов свободного
  // вращения вокруг тяги. Точная временная сетка и ±малый доворот нужны только
  // нескольким лидерам. Это сохраняет поле, но убирает десятимиллисекундный
  // шип в кадре одновременного пуска по двум машинам.
  const field = candidates(input);
  const finalists = field
    .map((candidate) => {
      const clearance = candidateClearance(
        candidate,
        input,
        COARSE_SAMPLE_SHARES,
      );
      return { candidate, score: candidateScore(candidate, clearance) };
    })
    .filter((entry) => Number.isFinite(entry.score))
    .sort((a, b) => b.score - a.score)
    .slice(0, 7)
    .flatMap(({ candidate }) => {
      if (length(candidate.acceleration) <= EPSILON) {
        return [candidate];
      }
      const primarySeconds = Math.min(
        ...[...input.closingSeconds.values()].filter((seconds) => seconds > 0),
      );
      const minorAngle = Math.min(
        Math.max(0, MAX_MINOR_ATTITUDE - candidate.attitudeAngle),
        input.dynamics.attitudeRate *
          input.dynamics.maneuverScale *
          primarySeconds,
      );
      const thrustAxis = normalize(
        add(candidate.acceleration, [0, GRAVITY, 0]),
        [0, 1, 0],
      );
      return [0, -minorAngle, minorAngle].map((twist) => {
        const attitude = normalizeQuaternion(
          multiplyQuaternions(
            quaternionAboutAxis(thrustAxis, twist),
            candidate.attitude,
          ),
        );
        return {
          ...candidate,
          attitude,
          attitudeAngle: quaternionAngle(
            input.dynamics.orientation,
            attitude,
          ),
        };
      });
    });
  let best: Candidate | null = null;
  let bestClearance = Number.NEGATIVE_INFINITY;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const candidate of finalists) {
    const clearance = candidateClearance(candidate, input);
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
