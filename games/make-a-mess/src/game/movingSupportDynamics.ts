export interface MotionVector3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface SupportMotion {
  readonly linearVelocity: MotionVector3;
  readonly angularVelocity: MotionVector3;
  readonly centreOfMass: MotionVector3;
}

export interface PassengerControlInput {
  readonly velocity: MotionVector3;
  readonly supportVelocity: MotionVector3;
  /** Desired walking velocity relative to the contacted support. */
  readonly desiredRelativeVelocity: MotionVector3;
  /** Contact normal. Traction is allowed only in its tangent plane. */
  readonly supportNormal?: MotionVector3;
  readonly grounded: boolean;
  readonly delta: number;
}

export interface PassengerAngularControlInput {
  /** Current passenger/view yaw rate around world up, in radians/second. */
  readonly angularVelocity: number;
  readonly supportAngularVelocity: MotionVector3;
  readonly grounded: boolean;
  readonly delta: number;
}

/** Maximum acceleration of a relaxed stance before the passenger starts sliding. */
export const PASSENGER_STANCE_ACCELERATION = 2.2;
/** Extra corrective acceleration per metre/second of relative speed error. */
export const PASSENGER_BALANCE_RESPONSE = 5;
/** Deliberate walking is stronger than passive balance, but remains a finite force. */
export const PASSENGER_WALK_ACCELERATION = 14;
/** Maximum relaxed turning acceleration before the feet start to twist. */
export const PASSENGER_STANCE_ANGULAR_ACCELERATION = 2.4;
/** Corrective turning acceleration per radian/second of yaw-rate error. */
export const PASSENGER_ANGULAR_BALANCE_RESPONSE = 5;

/** World velocity of an arbitrary point on a translating and rotating support. */
export function supportVelocityAtPoint(
  support: SupportMotion,
  point: MotionVector3,
): MotionVector3 {
  const rx = point.x - support.centreOfMass.x;
  const ry = point.y - support.centreOfMass.y;
  const rz = point.z - support.centreOfMass.z;
  const omega = support.angularVelocity;

  return {
    x: support.linearVelocity.x + omega.y * rz - omega.z * ry,
    y: support.linearVelocity.y + omega.z * rx - omega.x * rz,
    z: support.linearVelocity.z + omega.x * ry - omega.y * rx,
  };
}

/**
 * Velocity change produced by the passenger's legs during one physics step.
 *
 * The result is deliberately finite. Contact/friction supplies the rest, so a
 * hard carrier acceleration can move the floor underneath the passenger. With
 * no support there is no air control and the accumulated world momentum stays
 * untouched.
 */
export function passengerControlVelocityDelta(
  input: PassengerControlInput,
): MotionVector3 {
  if (!input.grounded || input.delta <= 0) {
    return { x: 0, y: 0, z: 0 };
  }

  const suppliedNormal = input.supportNormal ?? { x: 0, y: 1, z: 0 };
  const normalLength =
    Math.hypot(suppliedNormal.x, suppliedNormal.y, suppliedNormal.z) || 1;
  const normal = {
    x: suppliedNormal.x / normalLength,
    y: suppliedNormal.y / normalLength,
    z: suppliedNormal.z / normalLength,
  };
  const desiredNormal =
    input.desiredRelativeVelocity.x * normal.x +
    input.desiredRelativeVelocity.y * normal.y +
    input.desiredRelativeVelocity.z * normal.z;
  const desired = {
    x: input.desiredRelativeVelocity.x - normal.x * desiredNormal,
    y: input.desiredRelativeVelocity.y - normal.y * desiredNormal,
    z: input.desiredRelativeVelocity.z - normal.z * desiredNormal,
  };
  const rawError = {
    x: input.supportVelocity.x + desired.x - input.velocity.x,
    y: input.supportVelocity.y + desired.y - input.velocity.y,
    z: input.supportVelocity.z + desired.z - input.velocity.z,
  };
  const normalError =
    rawError.x * normal.x + rawError.y * normal.y + rawError.z * normal.z;
  const errorVector = {
    x: rawError.x - normal.x * normalError,
    y: rawError.y - normal.y * normalError,
    z: rawError.z - normal.z * normalError,
  };
  const error = Math.hypot(errorVector.x, errorVector.y, errorVector.z);
  if (error <= Number.EPSILON) {
    return { x: 0, y: 0, z: 0 };
  }

  const walking = Math.hypot(
    desired.x,
    desired.y,
    desired.z,
  ) > 1e-4;
  const baseAcceleration = walking
    ? PASSENGER_WALK_ACCELERATION
    : PASSENGER_STANCE_ACCELERATION;
  const acceleration = baseAcceleration + error * PASSENGER_BALANCE_RESPONSE;
  const change = Math.min(error, acceleration * input.delta);
  const scale = change / error;

  return {
    x: errorVector.x * scale,
    y: errorVector.y * scale,
    z: errorVector.z * scale,
  };
}

/**
 * Finite yaw-rate change produced by a passenger's stance on a rotating body.
 *
 * This intentionally mirrors linear traction: contact tends to match the
 * support's world-up angular velocity, but never teleports orientation. Once
 * contact is lost, angular momentum is preserved until another support acts.
 */
export function passengerAngularVelocityDelta(
  input: PassengerAngularControlInput,
): number {
  if (!input.grounded || input.delta <= 0) {
    return 0;
  }

  const error = input.supportAngularVelocity.y - input.angularVelocity;
  if (Math.abs(error) <= Number.EPSILON) {
    return 0;
  }

  const acceleration =
    PASSENGER_STANCE_ANGULAR_ACCELERATION +
    Math.abs(error) * PASSENGER_ANGULAR_BALANCE_RESPONSE;
  const change = Math.min(Math.abs(error), acceleration * input.delta);
  return Math.sign(error) * change;
}

/**
 * The map boundary is a ground-player containment wall, not part of vehicle
 * physics. A passenger who leaves an airborne support must be able to cross
 * it until they land on ordinary world geometry.
 */
export function movingSupportBoundaryState(
  previous: boolean,
  grounded: boolean,
  movingSupport: boolean,
): boolean {
  if (movingSupport) {
    return true;
  }
  if (grounded) {
    return false;
  }
  return previous;
}
