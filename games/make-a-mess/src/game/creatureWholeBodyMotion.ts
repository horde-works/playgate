import { Matrix4, Quaternion, Vector3 } from "three";

/**
 * Shared temporal contract for articulated creatures.
 *
 * Authored poses describe anatomy and force states; they are not render
 * frames. Runtime motion passes through this second-order filter before
 * contact solving, so changing pose or gait cannot teleport a joint. Contact
 * is solved afterwards and therefore remains a physical constraint rather
 * than a source of visual smoothing.
 */
export interface CreatureWholeBodyState {
  readonly parents: readonly number[];
  readonly positions: Vector3[];
  readonly linearVelocities: Vector3[];
  readonly rotations: Quaternion[];
  readonly angularVelocities: Vector3[];
  readonly scales: Vector3[];
  readonly scaleVelocities: Vector3[];
  readonly desiredPositions: Vector3[];
  readonly desiredRotations: Quaternion[];
  readonly desiredScales: Vector3[];
  readonly globalPositions: Vector3[];
  readonly globalRotations: Quaternion[];
  initialized: boolean;
  lastElapsed: number | null;
}

const TO_POSITION = new Vector3();
const TO_ROTATION = new Quaternion();
const TO_SCALE = new Vector3();
const INVERSE_TARGET_ROTATION = new Quaternion();
const ROTATION_ERROR = new Quaternion();
const ROTATION_ERROR_VECTOR = new Vector3();
const ZERO_VECTOR = new Vector3();
const INVERSE_PARENT_ROTATION = new Quaternion();

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function creatureSmootherstep(value: number): number {
  const t = clamp01(value);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export function creatureCircularDistance(a: number, b: number): number {
  const distance = Math.abs(a - b) % 1;
  return Math.min(distance, 1 - distance);
}

/** A C2-continuous cyclic support window with a flat load-bearing centre. */
export function creatureContactWindow(
  phase: number,
  centre: number,
  halfWidth: number,
  fadeWidth: number,
): number {
  const distance = creatureCircularDistance(phase, centre);
  if (distance >= halfWidth) return 0;
  const fade = Math.min(Math.max(1e-5, fadeWidth), halfWidth);
  if (distance <= halfWidth - fade) return 1;
  return creatureSmootherstep((halfWidth - distance) / fade);
}

export function createCreatureWholeBodyState(
  boneCount: number,
  parents: readonly number[] = Array.from({ length: boneCount }, () => -1),
): CreatureWholeBodyState {
  if (parents.length !== boneCount) {
    throw new Error("Creature pose parent count must match its bone count");
  }
  for (let index = 0; index < parents.length; index += 1) {
    if (parents[index] >= index || parents[index] < -1) {
      throw new Error(`Creature pose parent ${parents[index]} must precede bone ${index}`);
    }
  }
  return {
    parents: [...parents],
    positions: Array.from({ length: boneCount }, () => new Vector3()),
    linearVelocities: Array.from({ length: boneCount }, () => new Vector3()),
    rotations: Array.from({ length: boneCount }, () => new Quaternion()),
    angularVelocities: Array.from({ length: boneCount }, () => new Vector3()),
    scales: Array.from({ length: boneCount }, () => new Vector3(1, 1, 1)),
    scaleVelocities: Array.from({ length: boneCount }, () => new Vector3()),
    desiredPositions: Array.from({ length: boneCount }, () => new Vector3()),
    desiredRotations: Array.from({ length: boneCount }, () => new Quaternion()),
    desiredScales: Array.from({ length: boneCount }, () => new Vector3(1, 1, 1)),
    globalPositions: Array.from({ length: boneCount }, () => new Vector3()),
    globalRotations: Array.from({ length: boneCount }, () => new Quaternion()),
    initialized: false,
    lastElapsed: null,
  };
}

function stepCriticalVector(
  value: Vector3,
  velocity: Vector3,
  target: Vector3,
  angularFrequency: number,
  dt: number,
): void {
  const decay = Math.exp(-angularFrequency * dt);
  for (const axis of ["x", "y", "z"] as const) {
    const error = value[axis] - target[axis];
    const combined = velocity[axis] + angularFrequency * error;
    value[axis] = target[axis] + (error + combined * dt) * decay;
    velocity[axis] = (velocity[axis] - angularFrequency * combined * dt) * decay;
  }
}

function quaternionLogVector(quaternion: Quaternion, target: Vector3): void {
  const w = Math.max(-1, Math.min(1, quaternion.w));
  const angle = 2 * Math.acos(w);
  const sine = Math.sqrt(Math.max(0, 1 - w * w));
  if (sine < 1e-7 || angle < 1e-7) {
    target.set(0, 0, 0);
    return;
  }
  target.set(
    quaternion.x / sine * angle,
    quaternion.y / sine * angle,
    quaternion.z / sine * angle,
  );
}

function quaternionFromLogVector(vector: Vector3, target: Quaternion): void {
  const angle = vector.length();
  if (angle < 1e-7) {
    target.identity();
    return;
  }
  const halfAngle = angle * 0.5;
  const scale = Math.sin(halfAngle) / angle;
  target.set(
    vector.x * scale,
    vector.y * scale,
    vector.z * scale,
    Math.cos(halfAngle),
  );
}

function stepCriticalRotation(
  value: Quaternion,
  angularVelocity: Vector3,
  desired: Quaternion,
  angularFrequency: number,
  dt: number,
): void {
  INVERSE_TARGET_ROTATION.copy(desired).invert();
  ROTATION_ERROR.copy(INVERSE_TARGET_ROTATION).multiply(value).normalize();
  if (ROTATION_ERROR.w < 0) {
    ROTATION_ERROR.set(
      -ROTATION_ERROR.x,
      -ROTATION_ERROR.y,
      -ROTATION_ERROR.z,
      -ROTATION_ERROR.w,
    );
  }
  quaternionLogVector(ROTATION_ERROR, ROTATION_ERROR_VECTOR);
  stepCriticalVector(
    ROTATION_ERROR_VECTOR,
    angularVelocity,
    ZERO_VECTOR,
    angularFrequency,
    dt,
  );
  quaternionFromLogVector(ROTATION_ERROR_VECTOR, ROTATION_ERROR);
  value.copy(desired).multiply(ROTATION_ERROR).normalize();
}

/**
 * An exact critically damped step absorbs authored/keyframe discontinuities
 * while preserving position and velocity continuity. Root translation, scale
 * and quaternion-log rotation use the same physical response and therefore do
 * not acquire a different animation merely because rendering is faster.
 * Child translations are captured from the initialized skeleton and remain
 * anatomical constants: a pose blend can rotate a bone but cannot lengthen it.
 * The hierarchy is rebuilt in order, so damping cannot pull a knee away from
 * its thigh or a paw from its leg.
 */
export function solveCreatureWholeBodyPose(
  target: readonly Matrix4[],
  desired: readonly Matrix4[],
  state: CreatureWholeBodyState,
  elapsed: number,
  halfLifeSeconds: number,
): void {
  if (
    target.length !== desired.length
    || state.positions.length !== desired.length
    || state.rotations.length !== desired.length
    || state.scales.length !== desired.length
  ) {
    throw new Error("Creature whole-body matrices must have equal lengths");
  }

  const dt = state.lastElapsed === null
    ? 0
    : Math.max(0, Math.min(0.1, elapsed - state.lastElapsed));
  state.lastElapsed = elapsed;

  for (let index = 0; index < desired.length; index += 1) {
    desired[index].decompose(
      state.desiredPositions[index],
      state.desiredRotations[index],
      state.desiredScales[index],
    );
  }

  const copyDesiredLocalPosition = (index: number, targetPosition: Vector3): void => {
    const parent = state.parents[index];
    if (parent < 0) {
      targetPosition.copy(state.desiredPositions[index]);
      return;
    }
    INVERSE_PARENT_ROTATION.copy(state.desiredRotations[parent]).invert();
    targetPosition
      .copy(state.desiredPositions[index])
      .sub(state.desiredPositions[parent])
      .applyQuaternion(INVERSE_PARENT_ROTATION);
  };
  const copyDesiredLocalRotation = (index: number, targetRotation: Quaternion): void => {
    const parent = state.parents[index];
    if (parent < 0) {
      targetRotation.copy(state.desiredRotations[index]);
      return;
    }
    INVERSE_PARENT_ROTATION.copy(state.desiredRotations[parent]).invert();
    targetRotation
      .copy(INVERSE_PARENT_ROTATION)
      .multiply(state.desiredRotations[index])
      .normalize();
  };

  if (!state.initialized || dt <= 0) {
    for (let index = 0; index < desired.length; index += 1) {
      copyDesiredLocalPosition(index, state.positions[index]);
      copyDesiredLocalRotation(index, state.rotations[index]);
      state.scales[index].copy(state.desiredScales[index]);
      state.linearVelocities[index].set(0, 0, 0);
      state.angularVelocities[index].set(0, 0, 0);
      state.scaleVelocities[index].set(0, 0, 0);
    }
    state.initialized = true;
  } else {
    const angularFrequency = Math.LN2 / Math.max(1e-4, halfLifeSeconds);
    for (let index = 0; index < desired.length; index += 1) {
      if (state.parents[index] < 0) {
        copyDesiredLocalPosition(index, TO_POSITION);
        stepCriticalVector(
          state.positions[index],
          state.linearVelocities[index],
          TO_POSITION,
          angularFrequency,
          dt,
        );
      } else {
        state.linearVelocities[index].set(0, 0, 0);
      }
      copyDesiredLocalRotation(index, TO_ROTATION);
      TO_SCALE.copy(state.desiredScales[index]);
      stepCriticalRotation(
        state.rotations[index],
        state.angularVelocities[index],
        TO_ROTATION,
        angularFrequency,
        dt,
      );
      stepCriticalVector(
        state.scales[index],
        state.scaleVelocities[index],
        TO_SCALE,
        angularFrequency,
        dt,
      );
    }
  }

  for (let index = 0; index < desired.length; index += 1) {
    const parent = state.parents[index];
    if (parent < 0) {
      state.globalPositions[index].copy(state.positions[index]);
      state.globalRotations[index].copy(state.rotations[index]);
    } else {
      state.globalPositions[index]
        .copy(state.positions[index])
        .applyQuaternion(state.globalRotations[parent])
        .add(state.globalPositions[parent]);
      state.globalRotations[index]
        .copy(state.globalRotations[parent])
        .multiply(state.rotations[index])
        .normalize();
    }
    target[index].compose(
      state.globalPositions[index],
      state.globalRotations[index],
      state.scales[index],
    );
  }
}
