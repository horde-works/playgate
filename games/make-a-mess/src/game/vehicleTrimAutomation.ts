import type { SceneVector3 } from "./destructionScene.ts";

/**
 * Movable trim weights inside the lifting envelope.
 *
 * The carrier has no aerodynamic surface that can produce a rolling or
 * pitching moment: thrust acts along the hull axis and the rudder acts
 * sideways. Attitude therefore comes from one place only — where the live
 * centre of mass hangs relative to the frozen lift centre. A trim car is the
 * honest actuator for that: a real mass on a real rail, whose position moves
 * the live centre of mass. It never applies a torque of its own.
 *
 * Consequences that follow from that choice and must not be short-circuited:
 *
 * - authority is finite and computable: `carMass × travel / liveMass` is the
 *   largest centre-of-mass offset the machine can cancel;
 * - the car is slow, so a manoeuvre is not trimmed away instantly;
 * - the car is a breakable piece inside the envelope. Losing it removes the
 *   channel exactly like losing a propeller blade removes thrust — and also
 *   removes its mass, which moves the balance again;
 * - at the stop the machine has done everything it physically can. If the
 *   hull still hangs outside its flyable corridor, that is a failure, not a
 *   reason to widen the corridor.
 */
export type VehicleTrimAxis = "pitch" | "roll";

export interface VehicleTrimRailDefinition {
  readonly axis: VehicleTrimAxis;
  /** Actuator channel shared by the car and its drive. */
  readonly commandChannel: string;
  /** The piece that physically travels; its mass is the whole authority. */
  readonly carPieceId: string;
  /** Car position at rest, in authored world coordinates. */
  readonly zero: SceneVector3;
  /**
   * Unit travel direction in authored coordinates. Canonically `+nose` for a
   * pitch rail and `+starboard` for a roll rail; the control signs below are
   * derived for exactly that convention.
   */
  readonly direction: SceneVector3;
  /** Travel each way from zero, metres. */
  readonly travel: number;
  /** Car speed at full drive, m/s. A real trim car is deliberately slow. */
  readonly speed: number;
}

export interface VehicleTrimRailState {
  /** Signed metres from zero along the authored direction. */
  readonly position: number;
  /** Drive command that produced the present motion, −1..1. */
  readonly command: number;
  /** The car is at a mechanical stop and still being asked to go further. */
  readonly atStop: boolean;
}

export interface VehicleTrimObservation {
  readonly deltaSeconds: number;
  /** Positive is nose up. */
  readonly pitch: number;
  /** Positive is starboard down. */
  readonly roll: number;
  readonly pitchRate: number;
  readonly rollRate: number;
  /** The car and its drive are still attached to this carrier. */
  readonly available: boolean;
  /** Trim runs in flight and recovery; at the berth the car returns to zero. */
  readonly engaged: boolean;
}

/** Full drive at roughly three degrees of standing error. */
const ANGLE_GAIN = 18;
/** Rate term: a degree per second of tipping is worth a fifth of full drive. */
const RATE_GAIN = 4;
/** Below this the hull is level enough; the car HOLDS, it does not recentre. */
const ANGLE_DEADBAND = 0.012;
/** Rate at which an unengaged car crawls back to its authored zero. */
const RECENTRE_FRACTION = 0.45;

export function trimCommandChannel(axis: VehicleTrimAxis): string {
  return `trim:${axis}`;
}

export function isVehicleTrimChannel(commandChannel: string): boolean {
  return commandChannel.startsWith("trim:");
}

export function createVehicleTrimRailState(): VehicleTrimRailState {
  return { position: 0, command: 0, atStop: false };
}

/**
 * Signed drive the automation wants. The sign is physics, not preference:
 *
 * - nose up means the live centre of mass hangs aft of the lift centre, so the
 *   weight must travel toward the nose, the positive direction of a pitch rail;
 * - starboard down means the centre of mass hangs to starboard, so the weight
 *   must travel to port, the negative direction of a roll rail.
 */
export function vehicleTrimDemand(
  axis: VehicleTrimAxis,
  observation: Pick<
    VehicleTrimObservation,
    "pitch" | "roll" | "pitchRate" | "rollRate"
  >,
): number {
  const angle = axis === "pitch" ? observation.pitch : -observation.roll;
  const rate = axis === "pitch" ? observation.pitchRate : -observation.rollRate;
  if (Math.abs(angle) < ANGLE_DEADBAND && Math.abs(rate) < ANGLE_DEADBAND) {
    return 0;
  }
  return Math.max(-1, Math.min(1, angle * ANGLE_GAIN + rate * RATE_GAIN));
}

/**
 * One rail step. The car never jumps: the drive is rate limited and the stops
 * are mechanical, so a large imbalance takes real seconds to answer and may
 * never be answered at all.
 */
export function advanceVehicleTrimRail(
  rail: VehicleTrimRailDefinition,
  current: VehicleTrimRailState,
  observation: VehicleTrimObservation,
): VehicleTrimRailState {
  const delta = Math.max(0, observation.deltaSeconds);
  if (!observation.available) {
    // A detached car keeps whatever position it had when the ship lost it.
    // Nothing is commanded and nothing recentres by itself.
    return { position: current.position, command: 0, atStop: true };
  }
  if (!observation.engaged) {
    const step = rail.speed * RECENTRE_FRACTION * delta;
    const position =
      current.position > step
        ? current.position - step
        : current.position < -step
          ? current.position + step
          : 0;
    return { position, command: 0, atStop: false };
  }

  const command = vehicleTrimDemand(rail.axis, observation);
  const travelled = current.position + command * rail.speed * delta;
  const position = Math.max(-rail.travel, Math.min(rail.travel, travelled));
  const atStop =
    Math.abs(position) >= rail.travel - 1e-6 &&
    Math.abs(command) > 1e-3 &&
    Math.sign(command) === Math.sign(position);
  return { position, command, atStop };
}

/** Authored position of the car for mass properties and for rendering. */
export function vehicleTrimCarPosition(
  rail: VehicleTrimRailDefinition,
  state: VehicleTrimRailState,
): SceneVector3 {
  return [
    rail.zero[0] + rail.direction[0] * state.position,
    rail.zero[1] + rail.direction[1] * state.position,
    rail.zero[2] + rail.direction[2] * state.position,
  ];
}

/**
 * Largest centre-of-mass offset this rail can still produce, in metres. It is
 * the physical statement of "how much imbalance can this machine carry".
 */
export function vehicleTrimAuthority(
  rail: VehicleTrimRailDefinition,
  carMass: number,
  liveMass: number,
): number {
  return liveMass > 0 ? (carMass * rail.travel) / liveMass : 0;
}

export interface VehicleTrimExhaustionInput {
  /** Present inclination of the hull, radians. */
  readonly tilt: number;
  /** Inclination the machine may keep flying with. */
  readonly flyableTilt: number;
  /** Combined pitch/roll angular speed, rad/s. */
  readonly tiltRate: number;
  /** True while at least one rail can still travel further. */
  readonly authorityRemaining: boolean;
}

/**
 * Every rail is at its stop or gone, the hull has stopped moving, and it still
 * hangs outside the corridor it must fly in. The machine has physically tried
 * and failed; nothing further will change without repair.
 */
export function vehicleTrimAuthorityExhausted(
  input: VehicleTrimExhaustionInput,
): boolean {
  return (
    !input.authorityRemaining &&
    input.tilt > input.flyableTilt &&
    input.tiltRate < 0.05
  );
}
