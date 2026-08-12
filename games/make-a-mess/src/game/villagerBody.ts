/**
 * Canonical mechanical body shared by every villager action.
 *
 * This module deliberately has no React or three.js dependency. Simulation,
 * tests and every renderer consume the same body proportions and gait law.
 * A renderer may reduce detail at distance, but it may not invent another
 * skeleton or another walk cycle.
 */

export type VillagerSide = "left" | "right";

export type VillagerBone =
  | "root"
  | "pelvis"
  | "lumbar"
  | "chest"
  | "neck"
  | "head"
  | "leftScapula"
  | "leftUpperArm"
  | "leftForearm"
  | "leftHand"
  | "rightScapula"
  | "rightUpperArm"
  | "rightForearm"
  | "rightHand"
  | "leftThigh"
  | "leftShin"
  | "leftFoot"
  | "leftToe"
  | "rightThigh"
  | "rightShin"
  | "rightFoot"
  | "rightToe";

export interface VillagerBoneSpec {
  readonly name: VillagerBone;
  readonly parent: VillagerBone | null;
  /** Rest-pose joint position in unscaled body metres. */
  readonly joint: readonly [number, number, number];
}

export const VILLAGER_BODY = {
  hipY: 0.86,
  kneeY: 0.44,
  ankleY: 0.1,
  shoulderY: 1.36,
  elbowY: 1.1,
  wristY: 0.86,
  hipHalfWidth: 0.105,
  /** Hip to heel reach used by the accepted stride construction. */
  legReach: 0.86 - 0.1 * 0.4,
} as const;

const LEFT_HIP_X = -VILLAGER_BODY.hipHalfWidth;
const RIGHT_HIP_X = VILLAGER_BODY.hipHalfWidth;

/**
 * The canonical hierarchy is intentionally richer than the current box mesh.
 * Scapulae, hands and toes are real owners even while a distant LOD merges
 * their visible geometry into neighbouring segments.
 */
export const VILLAGER_SKELETON: readonly VillagerBoneSpec[] = [
  { name: "root", parent: null, joint: [0, 0, 0] },
  { name: "pelvis", parent: "root", joint: [0, VILLAGER_BODY.hipY, 0] },
  { name: "lumbar", parent: "pelvis", joint: [0, 1.02, 0] },
  { name: "chest", parent: "lumbar", joint: [0, 1.26, 0] },
  { name: "neck", parent: "chest", joint: [0, 1.42, 0] },
  { name: "head", parent: "neck", joint: [0, 1.56, 0] },
  { name: "leftScapula", parent: "chest", joint: [-0.18, 1.34, -0.01] },
  { name: "leftUpperArm", parent: "leftScapula", joint: [-0.255, VILLAGER_BODY.shoulderY, 0] },
  { name: "leftForearm", parent: "leftUpperArm", joint: [-0.255, VILLAGER_BODY.elbowY, 0] },
  { name: "leftHand", parent: "leftForearm", joint: [-0.255, VILLAGER_BODY.wristY, 0.01] },
  { name: "rightScapula", parent: "chest", joint: [0.18, 1.34, -0.01] },
  { name: "rightUpperArm", parent: "rightScapula", joint: [0.255, VILLAGER_BODY.shoulderY, 0] },
  { name: "rightForearm", parent: "rightUpperArm", joint: [0.255, VILLAGER_BODY.elbowY, 0] },
  { name: "rightHand", parent: "rightForearm", joint: [0.255, VILLAGER_BODY.wristY, 0.01] },
  { name: "leftThigh", parent: "pelvis", joint: [LEFT_HIP_X, VILLAGER_BODY.hipY, 0] },
  { name: "leftShin", parent: "leftThigh", joint: [-0.088, VILLAGER_BODY.kneeY, 0] },
  { name: "leftFoot", parent: "leftShin", joint: [-0.072, VILLAGER_BODY.ankleY, 0] },
  { name: "leftToe", parent: "leftFoot", joint: [-0.072, 0.025, 0.13] },
  { name: "rightThigh", parent: "pelvis", joint: [RIGHT_HIP_X, VILLAGER_BODY.hipY, 0] },
  { name: "rightShin", parent: "rightThigh", joint: [0.088, VILLAGER_BODY.kneeY, 0] },
  { name: "rightFoot", parent: "rightShin", joint: [0.072, VILLAGER_BODY.ankleY, 0] },
  { name: "rightToe", parent: "rightFoot", joint: [0.072, 0.025, 0.13] },
] as const;

export interface VillagerGaitInput {
  /** Unwrapped gait phase. Simulation advances it from travelled distance. */
  readonly phase: number;
  readonly speed: number;
  readonly strideLength: number;
  readonly build: number;
  readonly female: boolean;
}

export interface VillagerLegGait {
  readonly phase: number;
  /** 0 is heel strike; 0.6 is toe-off. */
  readonly cycle: number;
  readonly supporting: boolean;
  readonly hipFlexion: number;
  readonly kneeFlexion: number;
  readonly ankleFlexion: number;
  readonly armFlexion: number;
}

export interface VillagerGaitPose {
  readonly phase: number;
  readonly move: number;
  readonly stride: number;
  readonly armSwing: number;
  readonly pelvisBob: number;
  readonly pelvisSway: number;
  readonly chestYaw: number;
  readonly headYaw: number;
  readonly left: VillagerLegGait;
  readonly right: VillagerLegGait;
}

const TAU = Math.PI * 2;

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

function fract(value: number): number {
  return value - Math.floor(value);
}

/** Wrapped Gaussian used by the accepted knee and ankle gait curves. */
export function villagerGaitBump(t: number, center: number, width: number): number {
  const distance = Math.abs(fract(t - center + 0.5) - 0.5);
  return Math.exp(-(distance * distance) / (width * width));
}

export function villagerStrideAngle(
  strideLength: number,
  build: number,
): number {
  const safeBuild = Math.max(0.01, build);
  return Math.asin(
    Math.min(0.85, strideLength / (2 * VILLAGER_BODY.legReach * safeBuild)),
  );
}

function solveLeg(
  phase: number,
  move: number,
  stride: number,
  armSwing: number,
  female: boolean,
): VillagerLegGait {
  const cycle = fract((phase - Math.PI / 2) / TAU);
  let hipFlexion = (stride * Math.sin(phase) + 0.12) * move;
  const kneeFlexion =
    (0.3 * villagerGaitBump(cycle, 0.16, 0.1) +
      1.05 * villagerGaitBump(cycle, 0.73, 0.13)) *
    move;
  const ankleFlexion =
    (0.14 * villagerGaitBump(cycle, 0.05, 0.06) -
      0.12 * villagerGaitBump(cycle, 0.42, 0.16) +
      0.42 * villagerGaitBump(cycle, 0.6, 0.07) -
      0.2 * villagerGaitBump(cycle, 0.82, 0.14)) *
    move;
  let armFlexion = -armSwing * Math.sin(phase) * move;
  if (female) {
    hipFlexion *= 1.06;
    armFlexion *= 0.62;
  }
  return {
    phase,
    cycle,
    supporting: cycle < 0.6,
    hipFlexion,
    kneeFlexion,
    ankleFlexion,
    armFlexion,
  };
}

/**
 * Solve the accepted walk without rendering it. The formulas intentionally
 * match the legacy shader byte-for-byte in meaning; this is a migration of
 * ownership, not a redesign of the walk.
 */
export function solveVillagerGait(input: VillagerGaitInput): VillagerGaitPose {
  const move = clamp(input.speed / 0.85, 0, 1);
  const stride = villagerStrideAngle(input.strideLength, input.build);
  const armSwing = stride * 0.8 + 0.08;
  const bodyCycle = fract((input.phase - Math.PI / 2) / TAU);
  const pelvisBob = -0.024 * Math.cos(2 * TAU * bodyCycle) * move;
  const pelvisSway = -0.018 * Math.cos(TAU * bodyCycle) * move;
  const chestYaw = Math.sin(input.phase) * 0.07 * move;
  const headYaw = -Math.sin(input.phase) * 0.05 * move;

  return {
    phase: input.phase,
    move,
    stride,
    armSwing,
    pelvisBob,
    pelvisSway,
    chestYaw,
    headYaw,
    left: solveLeg(input.phase, move, stride, armSwing, input.female),
    right: solveLeg(input.phase + Math.PI, move, stride, armSwing, input.female),
  };
}

export function villagerBone(name: VillagerBone): VillagerBoneSpec {
  const bone = VILLAGER_SKELETON.find((candidate) => candidate.name === name);
  if (!bone) {
    throw new Error(`Unknown villager bone: ${name}`);
  }
  return bone;
}

