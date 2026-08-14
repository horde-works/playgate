import { Vector3 } from "three";
import { MEDIUM_DRAGON_MORPHOLOGY } from "../content/objects/creatures/mediumDragonObject.ts";

export type MediumDragonWingMode =
  | "folded"
  | "opening"
  | "flap"
  | "glide"
  | "flare"
  | "dive";

export type MediumDragonPanelId =
  | "left-inner"
  | "left-outer"
  | "right-inner"
  | "right-outer";

export interface MediumDragonPanelState {
  readonly id: MediumDragonPanelId;
  readonly areaFraction: number;
  readonly incidence: number;
  readonly camber: number;
  /** Local panel velocity along +Y. A downstroke is negative. */
  readonly strokeVelocity: number;
  readonly damageFraction: number;
}

export interface MediumDragonWingState {
  readonly mode: MediumDragonWingMode;
  readonly phase: number;
  readonly panels: readonly MediumDragonPanelState[];
  readonly powerFraction: number;
}

export interface MediumDragonPanelForce {
  readonly id: MediumDragonPanelId;
  readonly force: readonly [x: number, y: number, z: number];
  readonly moment: readonly [x: number, y: number, z: number];
  readonly angleOfAttack: number;
  readonly liftCoefficient: number;
  readonly dragCoefficient: number;
  readonly dynamicPressure: number;
  readonly stalled: boolean;
}

export interface MediumDragonAerodynamicResult {
  readonly force: readonly [x: number, y: number, z: number];
  readonly moment: readonly [x: number, y: number, z: number];
  readonly panels: readonly MediumDragonPanelForce[];
  readonly mechanicalPower: number;
}

export interface MediumDragonAeroInput {
  /** Body velocity through the air in local right/up/forward axes. */
  readonly velocityBody: readonly [x: number, y: number, z: number];
  readonly wing: MediumDragonWingState;
  readonly airDensity?: number;
}

const PANEL_AREA = MEDIUM_DRAGON_MORPHOLOGY.wingArea / 2;
const INNER_AREA = PANEL_AREA * 0.45;
const OUTER_AREA = PANEL_AREA * 0.55;
const PANEL_POSITIONS: Readonly<Record<MediumDragonPanelId, readonly [number, number, number]>> = {
  "left-inner": [-1.55, 0.28, 0.18],
  "left-outer": [-4.08, 0.18, 0.04],
  "right-inner": [1.55, 0.28, 0.18],
  "right-outer": [4.08, 0.18, 0.04],
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function wrap01(value: number): number {
  return ((value % 1) + 1) % 1;
}

/** Soft-stall polar: lift peaks near 18 degrees, then falls while drag rises. */
export function mediumDragonPanelCoefficients(angleOfAttack: number): {
  readonly lift: number;
  readonly drag: number;
  readonly stalled: boolean;
} {
  const sign = Math.sign(angleOfAttack) || 1;
  const absolute = Math.abs(angleOfAttack);
  const stallAngle = 0.31;
  let lift: number;
  if (absolute <= stallAngle) {
    lift = Math.min(1.6, absolute * 5.35);
  } else {
    const decay = clamp((absolute - stallAngle) / 0.95, 0, 1);
    lift = 1.6 * (1 - decay * 0.72);
  }
  lift *= sign;
  const stalled = absolute > stallAngle;
  const drag = 0.052
    + 0.085 * lift * lift
    + (stalled ? 0.52 * clamp((absolute - stallAngle) / 0.7, 0, 1) : 0);
  return { lift, drag, stalled };
}

function panel(
  id: MediumDragonPanelId,
  areaFraction: number,
  incidence: number,
  camber: number,
  strokeVelocity: number,
): MediumDragonPanelState {
  return {
    id,
    areaFraction: clamp(areaFraction, 0.06, 1),
    incidence,
    camber,
    strokeVelocity,
    damageFraction: 0,
  };
}

/**
 * One oscillator owns both wings. Roll changes delivered area/incidence but
 * never starts an unrelated timer on the other side.
 */
export function sampleMediumDragonWingState(options: {
  readonly mode: MediumDragonWingMode;
  readonly phase: number;
  readonly powerFraction: number;
  /** Positive requests more lift from the left wing and a right bank. */
  readonly rollControl?: number;
}): MediumDragonWingState {
  const phase = wrap01(options.phase);
  const power = clamp(options.powerFraction, 0, 1);
  const roll = clamp(options.rollControl ?? 0, -1, 1);
  let innerArea = 1;
  let outerArea = 1;
  let incidence = 0.11;
  let camber = 1;
  let stroke = 0;

  switch (options.mode) {
    case "folded":
      innerArea = 0.2;
      outerArea = 0.14;
      incidence = 0;
      camber = 0.25;
      break;
    case "opening":
      innerArea = 0.68;
      outerArea = 0.5;
      incidence = 0.08;
      camber = 0.7;
      break;
    case "glide":
      innerArea = 1;
      outerArea = 1;
      incidence = 0.17;
      camber = 1;
      break;
    case "flare": {
      const downstroke = phase >= 0.06 && phase < 0.62;
      const progress = downstroke
        ? (phase - 0.06) / 0.56
        : phase < 0.06
          ? (phase + 0.38) / 0.44
          : (phase - 0.62) / 0.44;
      innerArea = downstroke ? 1 : 0.8;
      outerArea = downstroke ? 0.98 : 0.66;
      incidence = downstroke ? 0.235 : 0.48;
      camber = downstroke ? 1.2 : 0.72;
      stroke = (downstroke ? -10.2 : 4)
        * power
        * Math.sin(clamp(progress, 0, 1) * Math.PI);
      break;
    }
    case "dive":
      innerArea = 0.62;
      outerArea = 0.48;
      incidence = 0.025;
      camber = 0.52;
      break;
    case "flap": {
      const downstroke = phase >= 0.08 && phase < 0.52;
      if (downstroke) {
        const progress = (phase - 0.08) / 0.44;
        const envelope = Math.sin(progress * Math.PI);
        innerArea = 0.98;
        outerArea = 0.96;
        incidence = 0.16;
        camber = 1.12;
        stroke = -10.8 * power * envelope;
      } else {
        const progress = phase < 0.08
          ? (phase + 0.48) / 0.56
          : (phase - 0.52) / 0.56;
        const envelope = Math.sin(clamp(progress, 0, 1) * Math.PI);
        innerArea = 0.72;
        outerArea = 0.54;
        // The outer panel reverses twist on recovery. At peak upward speed
        // this nearly unloads it; near reversal it still carries some weight.
        incidence = 0.48;
        camber = 0.68;
        stroke = 6.4 * power * envelope;
      }
      break;
    }
  }

  const leftArea = 1 + roll * 0.16;
  const rightArea = 1 - roll * 0.16;
  const leftIncidence = incidence + roll * 0.035;
  const rightIncidence = incidence - roll * 0.035;
  return {
    mode: options.mode,
    phase,
    powerFraction: power,
    panels: [
      panel("left-inner", innerArea * leftArea, leftIncidence, camber, stroke * 0.72),
      panel("left-outer", outerArea * leftArea, leftIncidence + 0.015, camber, stroke),
      panel("right-inner", innerArea * rightArea, rightIncidence, camber, stroke * 0.72),
      panel("right-outer", outerArea * rightArea, rightIncidence + 0.015, camber, stroke),
    ],
  };
}

function basePanelArea(id: MediumDragonPanelId): number {
  return id.endsWith("inner") ? INNER_AREA : OUTER_AREA;
}

/** Four independently loaded panels plus their real moment arms. */
export function computeMediumDragonAerodynamics(
  input: MediumDragonAeroInput,
): MediumDragonAerodynamicResult {
  const density = input.airDensity ?? 1.225;
  const bodyVelocity = new Vector3(...input.velocityBody);
  const totalForce = new Vector3();
  const totalMoment = new Vector3();
  let mechanicalPower = 0;
  const panels: MediumDragonPanelForce[] = [];

  for (const state of input.wing.panels) {
    const velocity = bodyVelocity.clone();
    velocity.y += state.strokeVelocity;
    const speed = Math.max(0.01, velocity.length());
    const flightPathAngle = Math.atan2(velocity.y, Math.max(0.01, velocity.z));
    const angleOfAttack = state.incidence - flightPathAngle;
    const coefficients = mediumDragonPanelCoefficients(angleOfAttack);
    const aliveArea = basePanelArea(state.id)
      * state.areaFraction
      * (1 - clamp(state.damageFraction, 0, 1));
    const dynamicPressure = 0.5 * density * speed * speed;
    const liftMagnitude = dynamicPressure
      * aliveArea
      * coefficients.lift
      * state.camber;
    const dragMagnitude = dynamicPressure * aliveArea * coefficients.drag;
    const dragDirection = velocity.clone().normalize().multiplyScalar(-1);
    const liftDirection = new Vector3(0, velocity.z, -velocity.y).normalize();
    if (liftDirection.y < 0) liftDirection.multiplyScalar(-1);
    const force = liftDirection.multiplyScalar(liftMagnitude)
      .add(dragDirection.multiplyScalar(dragMagnitude));
    const arm = new Vector3(...PANEL_POSITIONS[state.id]);
    const moment = arm.cross(force.clone());
    totalForce.add(force);
    totalMoment.add(moment);
    mechanicalPower += Math.max(0, -force.y * state.strokeVelocity);
    panels.push({
      id: state.id,
      force: [force.x, force.y, force.z],
      moment: [moment.x, moment.y, moment.z],
      angleOfAttack,
      liftCoefficient: coefficients.lift,
      dragCoefficient: coefficients.drag,
      dynamicPressure,
      stalled: coefficients.stalled,
    });
  }

  return {
    force: [totalForce.x, totalForce.y, totalForce.z],
    moment: [totalMoment.x, totalMoment.y, totalMoment.z],
    panels,
    mechanicalPower,
  };
}
