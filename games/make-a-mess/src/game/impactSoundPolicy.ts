interface VectorLike {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface ImpactMotion {
  readonly linear: VectorLike;
  readonly angular: VectorLike;
}

interface DebrisImpactDecision {
  readonly intensity: number;
  readonly approachSpeed: number;
  readonly elapsedSinceLastSound: number;
  readonly minimumIntensity: number;
}

export const DEBRIS_SOUND_COOLDOWN_MS = 180;
export const DEBRIS_SOUND_MIN_APPROACH_SPEED = 0.8;
export const CONTACT_SEPARATION_STEPS = 2;

export function isNewPhysicalContact(
  currentStep: number,
  previousContactStep: number | undefined,
): boolean {
  return (
    previousContactStep === undefined ||
    currentStep - previousContactStep > CONTACT_SEPARATION_STEPS
  );
}

export function measureImpactApproachSpeed(
  motion: ImpactMotion,
  forceDirection: VectorLike,
  size: readonly [number, number, number],
): number {
  const directionLength = Math.hypot(
    forceDirection.x,
    forceDirection.y,
    forceDirection.z,
  );
  const normalLinearSpeed =
    directionLength > 0.0001
      ? Math.max(
          0,
          -(
            motion.linear.x * forceDirection.x +
            motion.linear.y * forceDirection.y +
            motion.linear.z * forceDirection.z
          ) / directionLength,
        )
      : Math.hypot(motion.linear.x, motion.linear.y, motion.linear.z);

  // A long beam can strike with an edge even if its centre barely translates.
  // Only a fraction of its rotational edge speed is counted, so gentle rocking
  // after landing does not become a fresh impact.
  const angularSpeed = Math.hypot(
    motion.angular.x,
    motion.angular.y,
    motion.angular.z,
  );
  const halfDiagonal = Math.hypot(size[0], size[1], size[2]) * 0.5;

  return normalLinearSpeed + angularSpeed * halfDiagonal * 0.28;
}

export function shouldPlayDebrisImpact({
  intensity,
  approachSpeed,
  elapsedSinceLastSound,
  minimumIntensity,
}: DebrisImpactDecision): boolean {
  return (
    intensity >= minimumIntensity &&
    approachSpeed >= DEBRIS_SOUND_MIN_APPROACH_SPEED &&
    elapsedSinceLastSound >= DEBRIS_SOUND_COOLDOWN_MS
  );
}
