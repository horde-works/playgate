import type { MediumFelinePopulationProfile } from "./mediumFelinePopulationProfile.ts";
import {
  articulatedSurfaceHeightAt,
  chooseFreeDirection,
  distanceToBox,
  shortestAngle,
  topSurfaceHeightAtBox,
  type ObstacleBox,
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
  | "brake"
  | "perch-approach"
  | "perch-observe";

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
  perchTarget?: MediumPantherPerchTarget;
  jump?: MediumPantherJump;
  perchCooldown: number;
  perchVisits: number;
  lastPerchId?: string;
}

export interface MediumPantherPerchTarget {
  readonly id: string;
  readonly landingX: number;
  readonly landingZ: number;
  readonly landingY: number;
  readonly launchX: number;
  readonly launchZ: number;
  readonly exitX: number;
  readonly exitZ: number;
}

interface MediumPantherJump {
  readonly kind: "perch-up" | "perch-down";
  readonly startX: number;
  readonly startZ: number;
  readonly startY: number;
  readonly targetX: number;
  readonly targetZ: number;
  readonly targetY: number;
  readonly peak: number;
  readonly duration: number;
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
  "perch-observe": 5.4,
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
  "perch-approach": "bound-preload",
  "perch-observe": "bound-preload",
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function smoothstep(value: number): number {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

const PERCH_MATERIALS = new Set(["stone", "basalt", "graphiteStone"]);

function isUsableNaturalPerch(box: ObstacleBox, groundY: number): boolean {
  const landingY = topSurfaceHeightAtBox(box, box.centerX, box.centerZ);
  if (landingY === null) return false;
  const rise = landingY - groundY;
  const narrowSpan = Math.min(box.halfX * 2, box.halfZ * 2);
  const longSpan = Math.max(box.halfX * 2, box.halfZ * 2);
  return PERCH_MATERIALS.has(box.material ?? "")
    && box.shape === "stoneBlock"
    && /(?:terrain|landscape|boulder|rock)/i.test(box.id)
    && !box.doorId
    && box.bottom <= groundY + 0.22
    && rise >= 0.5
    && rise <= 1.35
    && narrowSpan >= 0.82
    && longSpan >= 1.25;
}

function launchPointForBox(
  box: ObstacleBox,
  fromX: number,
  fromZ: number,
): readonly [number, number] {
  let outwardX = fromX - box.centerX;
  let outwardZ = fromZ - box.centerZ;
  const outwardLength = Math.hypot(outwardX, outwardZ);
  if (outwardLength < 1e-5) {
    outwardX = Math.sin(box.yaw);
    outwardZ = Math.cos(box.yaw);
  } else {
    outwardX /= outwardLength;
    outwardZ /= outwardLength;
  }
  const cosine = Math.cos(box.yaw);
  const sine = Math.sin(box.yaw);
  const localX = outwardX * cosine - outwardZ * sine;
  const localZ = outwardX * sine + outwardZ * cosine;
  const edgeX = Math.abs(localX) < 1e-6 ? Infinity : box.halfX / Math.abs(localX);
  const edgeZ = Math.abs(localZ) < 1e-6 ? Infinity : box.halfZ / Math.abs(localZ);
  const edge = Math.min(edgeX, edgeZ);
  const clearance = 0.62;
  return [
    box.centerX + outwardX * (edge + clearance),
    box.centerZ + outwardZ * (edge + clearance),
  ];
}

/** Resolve authored lookout interests against the current, destructible world. */
export function findMediumPantherPerches(
  profile: MediumFelinePopulationProfile,
  field: ObstacleField,
  fromX: number,
  fromZ: number,
  groundY: number,
  broken: ReadonlySet<string> = new Set(),
): readonly MediumPantherPerchTarget[] {
  const seen = new Set<string>();
  const targets: MediumPantherPerchTarget[] = [];
  for (const lookout of profile.territory.lookouts) {
    for (const box of field.query(lookout[0], lookout[1], 3.2, broken)) {
      if (seen.has(box.id) || !isUsableNaturalPerch(box, groundY)) continue;
      if (distanceToBox(box, lookout[0], lookout[1]) > 1.8) continue;
      const landingY = topSurfaceHeightAtBox(box, box.centerX, box.centerZ);
      if (landingY === null) continue;
      const [launchX, launchZ] = launchPointForBox(box, fromX, fromZ);
      seen.add(box.id);
      targets.push({
        id: box.id,
        landingX: box.centerX,
        landingZ: box.centerZ,
        landingY,
        launchX,
        launchZ,
        exitX: launchX,
        exitZ: launchZ,
      });
    }
  }
  return targets.sort((a, b) => (
    Math.hypot(a.launchX - fromX, a.launchZ - fromZ)
      - Math.hypot(b.launchX - fromX, b.launchZ - fromZ)
  ));
}

function selectPerch(
  runtime: MediumPantherRuntime,
  profile: MediumFelinePopulationProfile,
  field: ObstacleField | null,
  broken: ReadonlySet<string>,
): MediumPantherPerchTarget | undefined {
  if (!field) return undefined;
  const candidates = findMediumPantherPerches(
    profile,
    field,
    runtime.x,
    runtime.z,
    runtime.groundY,
    broken,
  );
  return candidates.find((candidate) => candidate.id !== runtime.lastPerchId)
    ?? candidates[0];
}

function beginTargetedJump(
  runtime: MediumPantherRuntime,
  kind: MediumPantherJump["kind"],
  targetX: number,
  targetZ: number,
  targetY: number,
): void {
  const horizontal = Math.hypot(targetX - runtime.x, targetZ - runtime.z);
  const rise = targetY - runtime.groundY;
  runtime.jump = {
    kind,
    startX: runtime.x,
    startZ: runtime.z,
    startY: runtime.groundY,
    targetX,
    targetZ,
    targetY,
    peak: 0.56 + Math.max(0, rise) * 0.28,
    duration: clamp(0.42 + horizontal * 0.12, 0.5, 0.78),
  };
  runtime.mode = "bound-preload";
  runtime.modeTime = 0;
  runtime.speed = 0;
  runtime.heading = Math.atan2(targetX - runtime.x, targetZ - runtime.z);
  runtime.gaitDistance = 0;
}

function bodySupportHeight(
  runtime: MediumPantherRuntime,
  field: ObstacleField,
  broken: ReadonlySet<string>,
): number {
  const sine = Math.sin(runtime.heading);
  const cosine = Math.cos(runtime.heading);
  const footprints = [
    [-0.155, 0.43], [0.155, 0.43],
    [-0.135, -0.3], [0.135, -0.3],
  ] as const;
  const surfaces = footprints.map(([localX, localZ]) => articulatedSurfaceHeightAt(
    field,
    runtime.x + cosine * localX + sine * localZ,
    runtime.z - sine * localX + cosine * localZ,
    runtime.groundY,
    broken,
  ));
  // One, two or three paws may already be on a stone while the last support
  // remains on the lower plane. The trunk follows only after all four agree.
  return Math.min(...surfaces);
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
      return runtime.jump ? 0 : 2.2;
    case "bound-flight":
      return 4.1;
    case "landing":
      return 2.6;
    case "brake":
      return 0;
    case "perch-approach": {
      const target = runtime.perchTarget;
      if (!target) return 0;
      const distance = Math.hypot(target.launchX - runtime.x, target.launchZ - runtime.z);
      const desiredHeading = Math.atan2(target.launchX - runtime.x, target.launchZ - runtime.z);
      if (Math.abs(shortestAngle(runtime.heading, desiredHeading)) > 0.24) return 0;
      return clamp(distance * 1.35, 0, 2.25);
    }
    case "perch-observe":
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
    case "perch-approach":
      return gaitSample("trot", TROT, runtime.gaitDistance, 1.2);
    case "perch-observe":
      return { current: "sit-observe", next: "sit-observe", blend: 0 };
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
    perchCooldown: 0,
    perchVisits: 0,
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
  field: ObstacleField | null,
  broken: ReadonlySet<string>,
): void {
  const duration = runtime.mode === "bound-flight" && runtime.jump
    ? runtime.jump.duration
    : MODE_DURATION[runtime.mode];
  if (duration === undefined || runtime.modeTime < duration) {
    return;
  }
  const skills = new Set(profile.skills);

  if (runtime.mode === "observe" && skills.has("terrain-perch") && runtime.perchCooldown <= 0) {
    const target = selectPerch(runtime, profile, field, broken);
    if (target) {
      runtime.perchTarget = target;
      runtime.mode = "perch-approach";
      runtime.modeTime = 0;
      runtime.gaitDistance = 0;
      return;
    }
  }

  if (runtime.mode === "perch-observe") {
    const target = runtime.perchTarget;
    if (target) {
      beginTargetedJump(runtime, "perch-down", target.exitX, target.exitZ, 0);
      return;
    }
    runtime.mode = "brake";
    runtime.modeTime = 0;
    return;
  }

  if (runtime.mode === "landing" && runtime.jump) {
    const jump = runtime.jump;
    runtime.x = jump.targetX;
    runtime.z = jump.targetZ;
    runtime.groundY = jump.targetY;
    runtime.airHeight = 0;
    runtime.speed = 0;
    runtime.jump = undefined;
    runtime.modeTime = 0;
    runtime.gaitDistance = 0;
    if (jump.kind === "perch-up") {
      runtime.mode = "perch-observe";
      runtime.perchVisits += 1;
      runtime.lastPerchId = runtime.perchTarget?.id;
    } else {
      runtime.mode = "brake";
      runtime.perchTarget = undefined;
      runtime.perchCooldown = 24;
    }
    return;
  }

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
  runtime.perchCooldown = Math.max(0, runtime.perchCooldown - seconds);
  advanceMode(runtime, profile, field, broken);

  if (runtime.mode === "perch-approach") {
    const perch = runtime.perchTarget;
    if (!perch || broken.has(perch.id)) {
      runtime.perchTarget = undefined;
      runtime.mode = "brake";
      runtime.modeTime = 0;
    } else if (Math.hypot(perch.launchX - runtime.x, perch.launchZ - runtime.z) <= 0.18) {
      runtime.x = perch.launchX;
      runtime.z = perch.launchZ;
      beginTargetedJump(
        runtime,
        "perch-up",
        perch.landingX,
        perch.landingZ,
        perch.landingY,
      );
    }
  }

  if (runtime.mode === "perch-observe" && runtime.perchTarget) {
    if (broken.has(runtime.perchTarget.id)) {
      beginTargetedJump(
        runtime,
        "perch-down",
        runtime.perchTarget.exitX,
        runtime.perchTarget.exitZ,
        0,
      );
    } else {
      runtime.x = runtime.perchTarget.landingX;
      runtime.z = runtime.perchTarget.landingZ;
      runtime.groundY = runtime.perchTarget.landingY;
      runtime.airHeight = 0;
    }
  }

  if (runtime.mode === "bound-preload" && runtime.jump) {
    runtime.airHeight = 0;
    runtime.speed = 0;
    return;
  }

  if (runtime.mode === "bound-flight" && runtime.jump) {
    const jump = runtime.jump;
    const progress = clamp(runtime.modeTime / jump.duration, 0, 1);
    const horizontal = smoothstep(progress);
    const worldY = jump.startY
      + (jump.targetY - jump.startY) * horizontal
      + Math.sin(progress * Math.PI) * jump.peak;
    runtime.x = jump.startX + (jump.targetX - jump.startX) * horizontal;
    runtime.z = jump.startZ + (jump.targetZ - jump.startZ) * horizontal;
    runtime.heading = Math.atan2(jump.targetX - jump.startX, jump.targetZ - jump.startZ);
    runtime.groundY = jump.startY + (jump.targetY - jump.startY) * horizontal;
    runtime.airHeight = worldY - runtime.groundY;
    runtime.speed = Math.hypot(jump.targetX - jump.startX, jump.targetZ - jump.startZ) / jump.duration;
    return;
  }


  if (runtime.mode === "landing" && runtime.jump) {
    runtime.x = runtime.jump.targetX;
    runtime.z = runtime.jump.targetZ;
    runtime.groundY = runtime.jump.targetY;
    runtime.airHeight = 0;
    runtime.speed = 0;
    return;
  }

  const circuit = profile.territory.circuit;
  let target = circuit[runtime.targetIndex];
  if (runtime.mode === "perch-approach" && runtime.perchTarget) {
    target = [runtime.perchTarget.launchX, runtime.perchTarget.launchZ];
  }
  if (
    runtime.mode !== "perch-approach"
    && Math.hypot(target[0] - runtime.x, target[1] - runtime.z) < 1.25
  ) {
    runtime.targetIndex = (runtime.targetIndex + 1) % circuit.length;
    target = circuit[runtime.targetIndex];
  }

  const observing = (runtime.mode === "observe" || runtime.mode === "perch-observe")
    && runtime.attentionTime > 0;
  const lookX = observing ? runtime.attentionX : target[0];
  const lookZ = observing ? runtime.attentionZ : target[1];
  const desiredYaw = runtime.mode === "perch-observe" && !observing
    ? runtime.heading
    : Math.atan2(lookX - runtime.x, lookZ - runtime.z);
  let travelYaw = desiredYaw;
  const distanceToTarget = Math.hypot(target[0] - runtime.x, target[1] - runtime.z);
  if (
    field
    && runtime.mode !== "observe"
    && runtime.mode !== "perch-observe"
    && !(runtime.mode === "perch-approach" && distanceToTarget < 1)
  ) {
    const desiredLookAhead = clamp(1.3 + runtime.speed * 0.72, 1.5, 4.8);
    const lookAhead = runtime.mode === "perch-approach"
      ? Math.max(0.35, Math.min(desiredLookAhead, distanceToTarget))
      : desiredLookAhead;
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

  const turnRate = runtime.mode === "observe" || runtime.mode === "perch-observe"
    ? 1.25
    : runtime.mode === "perch-approach"
      ? 2.8 / (1 + runtime.speed * 0.22)
      : 2.2 / (1 + runtime.speed * 0.35);
  const headingTarget = runtime.mode === "observe" || runtime.mode === "perch-observe"
    ? desiredYaw
    : travelYaw;
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

  if (field && !runtime.jump && runtime.mode !== "perch-observe") {
    const targetGround = bodySupportHeight(runtime, field, broken);
    const verticalRate = targetGround > runtime.groundY ? 0.72 : 1.4;
    runtime.groundY += clamp(
      targetGround - runtime.groundY,
      -verticalRate * seconds,
      verticalRate * seconds,
    );
  } else if (!field && !runtime.jump && runtime.mode !== "perch-observe") {
    runtime.groundY = 0;
  }
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
