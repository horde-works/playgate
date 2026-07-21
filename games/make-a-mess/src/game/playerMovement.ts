export const MAX_AUTO_STEP_HEIGHT = 0.72;
export const MIN_WALKABLE_SURFACE_NORMAL_Y = 0.64;

export interface AutoStepProbe {
  readonly blockedAtFeet: boolean;
  readonly bodyClear: boolean;
  readonly landingFound: boolean;
  readonly landingNormalY: number;
  readonly stepHeight: number;
}

interface Direction3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

interface MutableDirection3 {
  x: number;
  y: number;
  z: number;
}

export function autoStepLiftSpeed(probe: AutoStepProbe): number {
  if (
    !probe.blockedAtFeet ||
    !probe.bodyClear ||
    !probe.landingFound ||
    probe.landingNormalY < MIN_WALKABLE_SURFACE_NORMAL_Y ||
    probe.stepHeight <= 0.04 ||
    probe.stepHeight > MAX_AUTO_STEP_HEIGHT
  ) {
    return 0;
  }

  return Math.min(5.4, Math.sqrt(2 * 14 * (probe.stepHeight + 0.2)));
}

export function setFlightVelocityTarget(
  target: MutableDirection3,
  forward: Direction3,
  right: Direction3,
  inputX: number,
  inputZ: number,
  speed: number,
): MutableDirection3 {
  const x = right.x * inputX - forward.x * inputZ;
  const y = right.y * inputX - forward.y * inputZ;
  const z = right.z * inputX - forward.z * inputZ;
  const directionLength = Math.hypot(x, y, z);
  const inputStrength = Math.min(1, Math.hypot(inputX, inputZ));

  if (directionLength <= Number.EPSILON || inputStrength <= Number.EPSILON) {
    target.x = 0;
    target.y = 0;
    target.z = 0;
    return target;
  }

  const scale = (speed * inputStrength) / directionLength;
  target.x = x * scale;
  target.y = y * scale;
  target.z = z * scale;
  return target;
}
