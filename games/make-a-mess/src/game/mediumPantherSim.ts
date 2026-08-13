import type { MediumFelinePopulationProfile } from "./mediumFelinePopulationProfile.ts";
import {
  chooseFreeDirection,
  shortestAngle,
  surfaceHeightAt,
  type ObstacleField,
} from "./villagerNavigation.ts";
import type { MediumPantherPoseId } from "../content/objects/creatures/mediumPantherRigObject.ts";

export type MediumPantherMotionMode =
  | "observe"
  | "walk"
  | "trot"
  | "accelerate"
  | "gallop"
  | "bound-preload"
  | "bound-flight"
  | "landing"
  | "brake";

export type MediumPantherGait = "walk" | "trot" | "gallop";

export interface MediumPantherPoseSample {
  readonly current: MediumPantherPoseId;
  readonly next: MediumPantherPoseId;
  readonly blend: number;
  /** The cyclic gait owns planted-paw contact; one-shot actions do not. */
  readonly gait?: MediumPantherGait;
  /** Normalized travelled phase of the current stride. */
  readonly cyclePhase?: number;
}

export interface MediumPantherRuntime {
  x: number;
  z: number;
  groundY: number;
  airHeight: number;
  heading: number;
  speed: number;
  travelled: number;
  gaitDistance: number;
  mode: MediumPantherMotionMode;
  modeTime: number;
  targetIndex: number;
  previousAvoidanceYaw?: number;
  attentionX: number;
  attentionZ: number;
  attentionTime: number;
}

const WALK: readonly MediumPantherPoseId[] = [
  "walk-01-left-hind-lift",
  "walk-02-left-hind-place",
  "walk-03-left-fore-lift",
  "walk-04-left-fore-place",
  "walk-05-right-hind-lift",
  "walk-06-right-hind-place",
  "walk-07-right-fore-lift",
  "walk-08-right-fore-place",
];

const TROT: readonly MediumPantherPoseId[] = [
  "trot-01-left-diagonal",
  "trot-02-flight",
  "trot-03-right-diagonal",
  "trot-04-flight",
];

const GALLOP: readonly MediumPantherPoseId[] = [
  "gallop-01-extended-flight",
  "gallop-02-right-fore-contact",
  "gallop-03-left-fore-contact",
  "gallop-04-gathered-flight",
  "gallop-05-left-hind-contact",
  "gallop-06-right-hind-push",
  "gallop-07-spine-opening",
  "gallop-08-extended-flight",
];

const MODE_DURATION: Readonly<Partial<Record<MediumPantherMotionMode, number>>> = {
  observe: 2.8,
  walk: 4.8,
  trot: 4.2,
  accelerate: 0.7,
  gallop: 2.5,
  "bound-preload": 0.24,
  "bound-flight": 0.58,
  landing: 0.34,
  brake: 0.72,
};

const NEXT_MODE: Readonly<Record<MediumPantherMotionMode, MediumPantherMotionMode>> = {
  observe: "walk",
  walk: "trot",
  trot: "accelerate",
  accelerate: "gallop",
  gallop: "bound-preload",
  "bound-preload": "bound-flight",
  "bound-flight": "landing",
  landing: "brake",
  brake: "observe",
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function smoothstep(value: number): number {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function targetSpeed(runtime: MediumPantherRuntime): number {
  switch (runtime.mode) {
    case "observe":
      return 0;
    case "walk":
      return 0.9;
    case "trot":
      return 2.25;
    case "accelerate":
      return 2.25 + smoothstep(runtime.modeTime / MODE_DURATION.accelerate!) * 2.8;
    case "gallop":
      return 5.05;
    case "bound-preload":
      return 2.2;
    case "bound-flight":
      return 4.1;
    case "landing":
      return 2.6;
    case "brake":
      return 0;
  }
}

function gaitSample(
  gait: MediumPantherGait,
  poses: readonly MediumPantherPoseId[],
  gaitDistance: number,
  strideLength: number,
): MediumPantherPoseSample {
  const cycle = ((gaitDistance / strideLength) % 1 + 1) % 1;
  const frame = cycle * poses.length;
  const index = Math.floor(frame) % poses.length;
  return {
    current: poses[index],
    next: poses[(index + 1) % poses.length],
    blend: smoothstep(frame - Math.floor(frame)),
    gait,
    cyclePhase: cycle,
  };
}

export function sampleMediumPantherPose(
  runtime: MediumPantherRuntime,
): MediumPantherPoseSample {
  switch (runtime.mode) {
    case "observe":
      return { current: "stand-observe", next: "stand-observe", blend: 0 };
    case "walk":
      return gaitSample("walk", WALK, runtime.gaitDistance, 0.92);
    case "trot":
      return gaitSample("trot", TROT, runtime.gaitDistance, 1.2);
    case "accelerate":
      return { current: "accelerate-hind-drive", next: GALLOP[0], blend: smoothstep(runtime.modeTime / MODE_DURATION.accelerate!) };
    case "gallop":
      return gaitSample("gallop", GALLOP, runtime.gaitDistance, 2.35);
    case "bound-preload":
      return { current: "jump-preload", next: "jump-preload", blend: 0 };
    case "bound-flight":
      return { current: "jump-flight", next: "jump-flight", blend: 0 };
    case "landing":
      return { current: "landing-absorb", next: "brake-fore-absorb", blend: smoothstep(runtime.modeTime / MODE_DURATION.landing!) };
    case "brake":
      return { current: "brake-fore-absorb", next: "stand-observe", blend: smoothstep(runtime.modeTime / MODE_DURATION.brake!) };
  }
}

export function createMediumPantherRuntime(
  profile: MediumFelinePopulationProfile,
  individualIndex = 0,
): MediumPantherRuntime {
  const circuit = profile.territory.circuit;
  const startIndex = individualIndex === 0
    ? circuit.findIndex(
        (point) => point[0] === profile.territory.spawn[0] && point[1] === profile.territory.spawn[1],
      )
    : (individualIndex * 3) % circuit.length;
  const safeStartIndex = startIndex >= 0 ? startIndex : 0;
  const [x, z] = individualIndex === 0
    ? profile.territory.spawn
    : circuit[safeStartIndex];
  const targetIndex = (safeStartIndex + 1) % circuit.length;
  const target = circuit[targetIndex];
  return {
    x,
    z,
    groundY: 0,
    airHeight: 0,
    heading: Math.atan2(target[0] - x, target[1] - z),
    speed: 0,
    travelled: 0,
    gaitDistance: 0,
    mode: "observe",
    modeTime: 0,
    targetIndex,
    attentionX: target[0],
    attentionZ: target[1],
    attentionTime: 0,
  };
}

/** A sound or visible presence changes attention, never the feline body contract. */
export function drawMediumPantherAttention(
  runtime: MediumPantherRuntime,
  x: number,
  z: number,
  seconds = 2.4,
): void {
  runtime.attentionX = x;
  runtime.attentionZ = z;
  runtime.attentionTime = Math.max(runtime.attentionTime, seconds);
  if (runtime.mode === "observe" || runtime.mode === "walk") {
    runtime.mode = runtime.speed > 0.25 ? "brake" : "observe";
    runtime.modeTime = 0;
  }
}

function advanceMode(
  runtime: MediumPantherRuntime,
  profile: MediumFelinePopulationProfile,
): void {
  const duration = MODE_DURATION[runtime.mode];
  if (duration === undefined || runtime.modeTime < duration) {
    return;
  }
  const skills = new Set(profile.skills);
  let next = NEXT_MODE[runtime.mode];
  if (runtime.mode === "observe" && !skills.has("territory-roam")) {
    next = "observe";
  } else if (runtime.mode === "trot" && !skills.has("play-sprint")) {
    next = "brake";
  } else if (runtime.mode === "gallop" && !skills.has("ground-bound")) {
    next = "brake";
  } else if (runtime.mode === "brake" && !skills.has("observe")) {
    next = skills.has("territory-roam") ? "walk" : "brake";
  }
  runtime.mode = next;
  runtime.modeTime = 0;
  runtime.gaitDistance = 0;
}

function stepOnce(
  runtime: MediumPantherRuntime,
  profile: MediumFelinePopulationProfile,
  seconds: number,
  field: ObstacleField | null,
  broken: ReadonlySet<string>,
): void {
  runtime.modeTime += seconds;
  runtime.attentionTime = Math.max(0, runtime.attentionTime - seconds);
  advanceMode(runtime, profile);

  const circuit = profile.territory.circuit;
  let target = circuit[runtime.targetIndex];
  if (Math.hypot(target[0] - runtime.x, target[1] - runtime.z) < 1.25) {
    runtime.targetIndex = (runtime.targetIndex + 1) % circuit.length;
    target = circuit[runtime.targetIndex];
  }

  const observing = runtime.mode === "observe" && runtime.attentionTime > 0;
  const lookX = observing ? runtime.attentionX : target[0];
  const lookZ = observing ? runtime.attentionZ : target[1];
  const desiredYaw = Math.atan2(lookX - runtime.x, lookZ - runtime.z);
  let travelYaw = desiredYaw;
  if (field && runtime.mode !== "observe") {
    const lookAhead = clamp(1.3 + runtime.speed * 0.72, 1.5, 4.8);
    const choice = chooseFreeDirection(
      field,
      runtime.x,
      runtime.z,
      desiredYaw,
      runtime.heading,
      lookAhead,
      0.31,
      broken,
      runtime.previousAvoidanceYaw,
      runtime.groundY,
    );
    travelYaw = choice.wedged ? runtime.heading + Math.PI * 0.72 : choice.yaw;
    runtime.previousAvoidanceYaw = travelYaw;
    if (choice.wedged) {
      runtime.targetIndex = (runtime.targetIndex + 1) % circuit.length;
    }
  }

  const speedGoal = targetSpeed(runtime);
  const speedDelta = speedGoal - runtime.speed;
  const acceleration = speedDelta < 0 ? 7.2 : 4.8;
  runtime.speed += clamp(speedDelta, -acceleration * seconds, acceleration * seconds);

  const turnRate = runtime.mode === "observe"
    ? 1.25
    : 2.2 / (1 + runtime.speed * 0.35);
  const headingTarget = runtime.mode === "observe" ? desiredYaw : travelYaw;
  const headingStep = clamp(
    shortestAngle(runtime.heading, headingTarget),
    -turnRate * seconds,
    turnRate * seconds,
  );
  runtime.heading += headingStep;

  const distance = runtime.speed * seconds;
  runtime.x += Math.sin(runtime.heading) * distance;
  runtime.z += Math.cos(runtime.heading) * distance;
  runtime.travelled += distance;
  // A turn makes the paws cover an arc even when the centre advances slowly.
  // Counting that arc prevents an arcade pivot on one long planted step.
  runtime.gaitDistance += distance + Math.abs(headingStep) * 0.9;

  runtime.groundY = field
    ? surfaceHeightAt(field, runtime.x, runtime.z, runtime.groundY, broken)
    : 0;
  if (runtime.mode === "bound-flight") {
    const progress = clamp(runtime.modeTime / MODE_DURATION["bound-flight"]!, 0, 1);
    runtime.airHeight = Math.sin(progress * Math.PI) * 0.62;
  } else {
    runtime.airHeight = 0;
  }
}

export function stepMediumPanther(
  runtime: MediumPantherRuntime,
  profile: MediumFelinePopulationProfile,
  deltaSeconds: number,
  field: ObstacleField | null,
  broken: ReadonlySet<string> = new Set(),
): void {
  let remaining = clamp(deltaSeconds, 0, 0.2);
  while (remaining > 1e-6) {
    const step = Math.min(remaining, 1 / 30);
    stepOnce(runtime, profile, step, field, broken);
    remaining -= step;
  }
}
