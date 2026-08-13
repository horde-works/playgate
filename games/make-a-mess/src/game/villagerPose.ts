import { solveArm } from "./villagerReach.ts";
import { solveVillagerGait, type VillagerSide } from "./villagerBody.ts";

export interface VillagerPoseInput {
  readonly phase: number;
  readonly speed: number;
  readonly strideLength: number;
  readonly build: number;
  readonly female: boolean;
  readonly climbKind: number;
  readonly climbProgress: number;
  readonly restY: number;
  readonly atTable: boolean;
  readonly carryRaw: number;
  readonly handKind: number;
  readonly startle: number;
  readonly startleProgress: number;
  readonly attention: number;
}

export interface VillagerLimbPose {
  /** Direct local X rotations consumed by the skeletal palette. */
  readonly hipX: number;
  readonly kneeX: number;
  readonly ankleX: number;
  readonly shoulderX: number;
  readonly elbowX: number;
}

export interface VillagerPose {
  readonly left: VillagerLimbPose;
  readonly right: VillagerLimbPose;
  readonly chestPitch: number;
  readonly chestYaw: number;
  readonly headPitch: number;
  readonly headYaw: number;
  readonly bodyPitch: number;
  readonly bodySink: number;
  readonly bob: number;
  readonly sway: number;
  readonly alarm: number;
  readonly watch: number;
  readonly duck: number;
}

interface MutableLimbPose {
  hipX: number;
  kneeX: number;
  ankleX: number;
  shoulderX: number;
  elbowX: number;
}

// Ноша теперь находится у нижней границы груди, а не у живота. Эти углы
// получены из положения кисти, поэтому обе руки действительно держат её.
const CARRY_ARM = solveArm(0.42, -0.12);

function clamp(value: number, low = 0, high = 1): number {
  return Math.min(high, Math.max(low, value));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp((value - edge0) / Math.max(1e-9, edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function pulse(value: number, rise0: number, rise1: number, fall0: number, fall1: number): number {
  return smoothstep(rise0, rise1, value) * (1 - smoothstep(fall0, fall1, value));
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function mixPoint(
  a: readonly [number, number],
  b: readonly [number, number],
  t: number,
): [number, number] {
  return [mix(a[0], b[0], t), mix(a[1], b[1], t)];
}

function actionLimb(
  input: VillagerPoseInput,
  side: VillagerSide,
  base: MutableLimbPose,
): { limb: MutableLimbPose; chestPitch: number; bodyPitch: number; bodySink: number } {
  const kind = input.climbKind;
  const t = input.climbProgress;
  const lead = side === "left";
  let chestPitch = 0;
  let bodyPitch = 0;
  let bodySink = 0;

  if (kind < 0.5) {
    return { limb: base, chestPitch, bodyPitch, bodySink };
  }

  if (kind < 1.5) {
    const step = lead ? clamp(t / 0.55) : clamp((t - 0.45) / 0.55);
    const lift = Math.sin(Math.PI * step);
    base.hipX = -1.15 * lift;
    base.kneeX = 1.45 * lift;
    base.ankleX = -0.22 * lift;
    base.shoulderX = -(lead ? -0.4 : 0.4) * lift;
    chestPitch = 0.16 * Math.sin(Math.PI * t);
  } else if (kind < 2.5) {
    const support = pulse(t, 0.08, 0.3, 0.6, 0.86);
    const tuck = Math.sin(Math.PI * clamp((t - 0.1) / 0.7));
    let hip = 1.05 * tuck;
    let knee = 1.75 * tuck;
    let ankle = 0.18 * tuck;
    let shoulder = side === "right" ? -1.5 * support : 0.6 * tuck;
    chestPitch = 0.52 * Math.sin(Math.PI * t);
    const land = pulse(t, 0.76, 0.92, 0.94, 1);
    knee += 0.9 * land;
    hip += 0.4 * land;
    ankle -= 0.3 * land;
    shoulder += 0.75 * land;
    chestPitch += 0.22 * land;
    base.hipX = -hip;
    base.kneeX = knee;
    base.ankleX = ankle;
    base.shoulderX = -shoulder;
  } else if (kind < 3.5) {
    const sit = pulse(t, 0.1, 0.4, 0.55, 0.86);
    const swing = pulse(t, 0.34, 0.72, 0.8, 0.95);
    const down = smoothstep(0.8, 1, t);
    base.hipX = -(1.35 * sit + 0.9 * swing + 0.3 * down);
    base.kneeX = 1.1 * sit + 1.5 * swing + 0.9 * down;
    base.ankleX = 0.1 * sit - 0.28 * down;
    base.shoulderX = -(-1.3 * sit + 0.5 * down);
    chestPitch = 0.34 * sit + 0.12 * swing + 0.18 * down;
  } else if (kind < 4.5) {
    const reach = pulse(t, 0, 0.2, 0.28, 0.5);
    const pull = pulse(t, 0.16, 0.48, 0.56, 0.76);
    const kneeUp = pulse(t, 0.42, 0.62, 0.7, 0.84);
    const stand = smoothstep(0.74, 0.9, t);
    const land = smoothstep(0.9, 1, t);
    let hip = 0.5 * pull + 1.55 * kneeUp + 0.3 * land;
    let knee = 0.85 * pull + 1.95 * kneeUp + 0.75 * land;
    if (!lead) {
      hip *= 0.45;
      knee *= 0.55;
    }
    base.hipX = -hip;
    base.kneeX = knee;
    base.ankleX = -0.2 * kneeUp - 0.26 * land;
    base.shoulderX = -(-2.05 * reach - 1.6 * pull + 0.45 * land);
    chestPitch = 0.62 * pull + 0.28 * kneeUp - 0.12 * stand + 0.2 * land;
  } else if (kind < 5.5) {
    const sit = clamp(t);
    base.hipX = -1.52 * sit;
    base.kneeX = 1.46 * sit;
    base.ankleX = 0.14 * sit;
    base.shoulderX = -0.52 * sit;
    chestPitch = 0.12 * sit;
    bodySink = sit * clamp(0.86 - input.restY, 0, 0.62);
    if (input.atTable) {
      const shuffle = Math.sin(Math.PI * clamp(sit / 0.62));
      const settled = smoothstep(0.55, 1, sit);
      base.shoulderX = -(-1.05 * shuffle + 0.95 * settled);
      chestPitch = 0.3 * shuffle + 0.14 * settled;
      base.hipX -= 0.1 * shuffle;
    }
  } else if (kind < 6.5) {
    const lie = clamp(t);
    base.hipX = -0.16 * lie;
    base.kneeX = 0.28 * lie;
    base.ankleX = -0.14 * lie;
    base.shoulderX = -0.08 * lie;
    bodyPitch = -1.48 * lie;
    bodySink = lie * clamp(0.86 - input.restY - 0.06, 0, 0.8);
  } else {
    const pose = solveWorkPose(kind, t, side);
    const shoulderDrop = (1 - Math.cos(pose.lean)) * 0.5;
    const shoulderForward = Math.sin(pose.lean) * 0.5;
    const target = side === "left" && pose.other ? pose.other : pose.hand;
    const arm = solveArm(
      Math.max(0.02, target[0] - shoulderForward),
      target[1] - shoulderDrop,
    );
    const leadSign = lead ? 1 : -1;
    const load = clamp(0.5 + pose.shift * 0.5 * leadSign);
    const hip = pose.squat * 0.62 + pose.stance * leadSign;
    base.hipX = -hip;
    base.kneeX = pose.squat * 0.86 + pose.stance * 0.5 + load * 0.22;
    base.ankleX += pose.stance * 0.12 * leadSign;
    base.shoulderX = -arm.shoulder;
    base.elbowX = -arm.elbow;
    chestPitch = pose.lean;
    bodySink = pose.sink + pose.squat * 0.12 + load * 0.03;
  }

  return { limb: base, chestPitch, bodyPitch, bodySink };
}

interface WorkPose {
  hand: [number, number];
  other: [number, number] | null;
  lean: number;
  sink: number;
  squat: number;
  stance: number;
  shift: number;
}

function solveWorkPose(kind: number, t: number, side: VillagerSide): WorkPose {
  let hand: [number, number] = [0.3, 0.36];
  let other: [number, number] | null = null;
  let lean = 0;
  let sink = 0;
  let squat = 0;
  let stance = 0;
  let shift = 0;

  if (kind > 14.5) {
    const beat = t * Math.PI * 2;
    const low = 0.5 + 0.5 * Math.sin(beat);
    const high = 0.5 + 0.5 * Math.sin(beat + 2.1);
    hand = mixPoint([0.22, 0.46], [0.3, 0.3], low);
    other = mixPoint([0.16, 0.02], [0.24, 0.14], high);
    lean = 0.12 + 0.04 * low;
    stance = 0.1;
    shift = 0.12 * (low - 0.5);
  } else if (kind < 7.5) {
    const wind = pulse(t, 0, 0.34, 0.36, 0.46);
    const fall = smoothstep(0.44, 0.62, t);
    const back = smoothstep(0.72, 1, t);
    const ready: [number, number] = [0.26, 0.34];
    hand = mixPoint(mixPoint(ready, [-0.16, -0.34], wind), [0.34, 0.44], fall);
    hand = mixPoint(hand, ready, back);
    lean = 0.16 * wind + 0.46 * fall - 0.3 * back;
    squat = 0.1 + 0.28 * fall;
    stance = 0.12;
    shift = -0.5 * wind + 0.8 * fall - 0.4 * back;
  } else if (kind < 8.5) {
    const down = pulse(t, 0, 0.34, 0.62, 0.94);
    hand = mixPoint([0.24, 0.3], [0.3, 0.62], down);
    lean = 0.42 * down;
    squat = 1.15 * down;
    sink = 0.3 * down;
    stance = 0.22 * down;
    shift = 0.5 * down;
  } else if (kind < 9.5) {
    const pull = pulse(t, 0, 0.58, 0.58, 0.66);
    hand = mixPoint([0.34, 0.46], [0.16, 0.28], pull);
    lean = 0.48;
    stance = 0.34;
    squat = 0.18;
    shift = 0.7 * pull - 0.35;
  } else if (kind < 10.5) {
    const turn = t * Math.PI * 2;
    hand = [0.3 + 0.15 * Math.sin(turn), 0.34 + 0.15 * Math.cos(turn)];
    other = [0.3 + 0.15 * Math.sin(turn + Math.PI), 0.34 + 0.15 * Math.cos(turn + Math.PI)];
    lean = 0.2;
    squat = 0.08;
    stance = 0.18;
    shift = 0.35 * Math.sin(turn);
  } else if (kind < 11.5) {
    const bite = pulse(t, 0, 0.2, 0.24, 0.44);
    const lift = pulse(t, 0.36, 0.58, 0.62, 0.8);
    const toss = pulse(t, 0.64, 0.82, 0.86, 1);
    hand = mixPoint([0.28, 0.4], [0.34, 0.6], bite);
    hand = mixPoint(hand, [0.3, 0.24], lift);
    hand = mixPoint(hand, [0.2, 0.06], toss);
    lean = 0.34 + 0.28 * bite - 0.2 * lift;
    squat = 0.3 + 0.5 * bite;
    stance = 0.4;
    shift = 0.9 * bite - 0.5 * lift - 0.3 * toss;
  } else if (kind < 12.5) {
    const down = pulse(t, 0, 0.18, 0.22, 0.4);
    const up = pulse(t, 0.4, 0.62, 0.8, 1);
    hand = mixPoint([0.26, 0.34], [0.28, 0.62], down);
    hand = mixPoint(hand, [0.16, -0.44], up);
    lean = 0.4 * down - 0.12 * up;
    squat = 0.9 * down;
    stance = 0.16;
    shift = 0.6 * down - 0.4 * up;
  } else {
    const wind = pulse(t, 0, 0.34, 0.36, 0.44);
    const hit = smoothstep(0.4, 0.56, t);
    const back = smoothstep(0.66, 1, t);
    const ready: [number, number] = [0.28, 0.18];
    hand = mixPoint(mixPoint(ready, [0.06, -0.22], wind), [0.34, 0.3], hit);
    hand = mixPoint(hand, ready, back);
    other = [0.3, 0.34];
    lean = 0.18 + 0.06 * hit;
    stance = 0.2;
    shift = -0.25 * wind + 0.35 * hit;
  }

  // Work poses that use the same target for both hands leave `other` null.
  // Explicitly keep the parameter in the signature: handed work branches on it.
  void side;
  return { hand, other, lean, sink, squat, stance, shift };
}

export function solveVillagerPose(input: VillagerPoseInput): VillagerPose {
  // Start from the accepted walk without sex-specific post multiplication;
  // the legacy renderer applied that multiplication after every action.
  const gait = solveVillagerGait({ ...input, female: false });
  const idle = (1 - gait.move) * Math.sin(input.phase * 0.55) * 0.04;
  const carryDrop = clamp(input.carryRaw - 1);
  const holding = input.carryRaw >= 0.5 && carryDrop < 1;

  const base = (side: VillagerSide): MutableLimbPose => {
    const leg = side === "left" ? gait.left : gait.right;
    const shoulder = leg.armFlexion + idle;
    return {
      hipX: -leg.hipFlexion,
      kneeX: leg.kneeFlexion,
      ankleX: leg.ankleFlexion,
      shoulderX: -(holding ? CARRY_ARM.shoulder + shoulder * 0.05 : shoulder),
      elbowX: holding
        ? -CARRY_ARM.elbow
        : -0.32 - Math.max(0, Math.sin(leg.phase)) * 0.28 * gait.move,
    };
  };

  const left = actionLimb(input, "left", base("left"));
  const right = actionLimb(input, "right", base("right"));
  const chestPitch = Math.max(left.chestPitch, right.chestPitch);
  const bodyPitch =
    Math.abs(left.bodyPitch) >= Math.abs(right.bodyPitch) ? left.bodyPitch : right.bodyPitch;
  const bodySink = Math.max(left.bodySink, right.bodySink);

  if (input.female) {
    for (const limb of [left.limb, right.limb]) {
      limb.hipX *= 1.06;
      limb.shoulderX *= 0.62;
    }
  }

  const alarm =
    input.startleProgress > 0 && input.startleProgress < 1
      ? input.startle * Math.sin(Math.PI * input.startleProgress ** 0.42)
      : 0;
  const watch = Math.min(input.attention, 1);
  const duck = Math.max(0, input.attention - 1);

  return {
    left: left.limb,
    right: right.limb,
    chestPitch,
    chestYaw: gait.chestYaw,
    headPitch: chestPitch * 0.6,
    headYaw: gait.headYaw,
    bodyPitch,
    bodySink,
    bob: gait.pelvisBob,
    sway: gait.pelvisSway,
    alarm,
    watch,
    duck,
  };
}
