import { Euler, Quaternion, Vector3 } from "three";
import { MEDIUM_DRAGON_MORPHOLOGY } from "../content/objects/creatures/mediumDragonObject.ts";
import {
  computeMediumDragonAerodynamics,
  sampleMediumDragonWingState,
  type MediumDragonAerodynamicResult,
  type MediumDragonWingMode,
  type MediumDragonWingState,
} from "./mediumDragonAerodynamics.ts";
import type {
  MediumDragonPopulationProfile,
  MediumDragonSurfaceNode,
} from "./mediumDragonPopulationProfile.ts";

export type MediumDragonIntent =
  | "rest"
  | "observe"
  | "body-care"
  | "patrol"
  | "investigate"
  | "avoid";

export type MediumDragonMode =
  | "rest"
  | "observe"
  | "ground-walk"
  | "body-care"
  | "takeoff"
  | "powered-climb"
  | "patrol-flap"
  | "patrol-glide"
  | "return"
  | "approach"
  | "flare"
  | "touchdown"
  | "wing-unload"
  | "ground-recovery"
  | "emergency-glide";

export type MediumDragonTakeoffPhase =
  | "preload"
  | "hind-drive"
  | "manus-vault"
  | "clearance"
  | "unfold"
  | "first-downstroke";

export interface MediumDragonNeeds {
  energy: number;
  fatigue: number;
  flightReserve: number;
  thermalLoad: number;
  bodyCare: number;
  safety: number;
  information: number;
  territorialPressure: number;
}

export interface MediumDragonAttentionState {
  mode: "ambient-scan" | "acquire" | "verify" | "locked-track" | "relax";
  targetX: number | null;
  targetY: number | null;
  targetZ: number | null;
  urgency: number;
  confidence: number;
  headYaw: number;
  headPitch: number;
  nextScanAt: number;
  scanIndex: number;
}

export interface MediumDragonRuntime {
  x: number;
  y: number;
  z: number;
  velocityX: number;
  velocityY: number;
  velocityZ: number;
  heading: number;
  pitch: number;
  roll: number;
  pitchRate: number;
  yawRate: number;
  rollRate: number;
  mode: MediumDragonMode;
  modeTime: number;
  lifeTime: number;
  flightTime: number;
  gaitDistance: number;
  flapPhase: number;
  intent: MediumDragonIntent;
  intentReason: string;
  currentNodeId: string;
  targetNodeId: string | null;
  approachStage: "staging" | "turnaround" | "alignment" | "final";
  needs: MediumDragonNeeds;
  attention: MediumDragonAttentionState;
  lastWing: MediumDragonWingState;
  lastAerodynamics: MediumDragonAerodynamicResult;
  lastForce: readonly [number, number, number];
  lastMoment: readonly [number, number, number];
  grounded: boolean;
  firstFlightCompleted: boolean;
  decisionSerial: number;
}

export interface MediumDragonStepContext {
  readonly removedPieceIds?: ReadonlySet<string>;
  readonly dayFraction?: number;
  readonly night?: number;
}

export interface MediumDragonIntentScore {
  readonly intent: MediumDragonIntent;
  readonly score: number;
  readonly reason: string;
}

const MASS = MEDIUM_DRAGON_MORPHOLOGY.mass;
const GRAVITY = 9.81;
const PITCH_INERTIA = 620;
const YAW_INERTIA = 920;
const ROLL_INERTIA = 1080;
const EMPTY_AERO = computeMediumDragonAerodynamics({
  velocityBody: [0, 0, 0],
  wing: sampleMediumDragonWingState({
    mode: "folded",
    phase: 0,
    powerFraction: 0,
  }),
});

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function wrapAngle(value: number): number {
  return Math.atan2(Math.sin(value), Math.cos(value));
}

function shortestAngle(from: number, to: number): number {
  return wrapAngle(to - from);
}

function moveToward(current: number, target: number, maximumStep: number): number {
  return current + clamp(target - current, -maximumStep, maximumStep);
}

function nodeById(
  profile: MediumDragonPopulationProfile,
  id: string,
): MediumDragonSurfaceNode {
  const node = profile.territory.nodes.find((candidate) => candidate.id === id);
  if (!node) throw new Error(`Dragon profile ${profile.id}: unknown node ${id}`);
  return node;
}

export function mediumDragonNodeIsUsable(
  node: MediumDragonSurfaceNode,
  removed: ReadonlySet<string> = new Set(),
): boolean {
  const alive = node.supportPieceIds.filter((id) => !removed.has(id)).length;
  return alive >= Math.ceil(node.supportPieceIds.length * 0.75);
}

function nearestUsableLanding(
  runtime: MediumDragonRuntime,
  profile: MediumDragonPopulationProfile,
  removed: ReadonlySet<string>,
): MediumDragonSurfaceNode | null {
  const preferred = profile.territory.nodes
    .filter((node) => node.kind === "landing" && mediumDragonNodeIsUsable(node, removed));
  const emergency = profile.territory.nodes
    .filter((node) => node.kind === "emergency-landing" && mediumDragonNodeIsUsable(node, removed));
  return [...preferred, ...emergency].sort((a, b) => {
    const distanceA = Math.hypot(a.position[0] - runtime.x, a.position[2] - runtime.z);
    const distanceB = Math.hypot(b.position[0] - runtime.x, b.position[2] - runtime.z);
    const preferenceA = a.kind === "landing" ? 0 : 18;
    const preferenceB = b.kind === "landing" ? 0 : 18;
    return distanceA + preferenceA - distanceB - preferenceB;
  })[0] ?? null;
}

export function scoreMediumDragonIntents(
  runtime: MediumDragonRuntime,
  profile: MediumDragonPopulationProfile,
): readonly MediumDragonIntentScore[] {
  const traits = profile.traits;
  const needs = runtime.needs;
  return ([
    {
      intent: "avoid",
      score: needs.safety * (1.15 - traits.boldness * 0.35),
      reason: `safety ${needs.safety.toFixed(2)} versus boldness ${traits.boldness.toFixed(2)}`,
    },
    {
      intent: "patrol",
      score: needs.information * traits.curiosity * 0.62
        + needs.territorialPressure * traits.territoriality * 0.58
        + needs.flightReserve * 0.18
        - needs.fatigue * 0.72,
      reason: `information ${needs.information.toFixed(2)}, territory ${needs.territorialPressure.toFixed(2)}, reserve ${needs.flightReserve.toFixed(2)}`,
    },
    {
      intent: "body-care",
      score: needs.bodyCare * 0.86 + (1 - needs.safety) * 0.08,
      reason: `body-care pressure ${needs.bodyCare.toFixed(2)}`,
    },
    {
      intent: "observe",
      score: needs.information * 0.58 + needs.safety * 0.32 + traits.patience * 0.12,
      reason: `uncertainty ${needs.information.toFixed(2)} with patience ${traits.patience.toFixed(2)}`,
    },
    {
      intent: "rest",
      score: needs.fatigue * 0.82 + (1 - needs.flightReserve) * 0.62 + (1 - needs.energy) * 0.25,
      reason: `fatigue ${needs.fatigue.toFixed(2)} and reserve ${needs.flightReserve.toFixed(2)}`,
    },
    {
      intent: "investigate",
      score: runtime.attention.urgency * traits.curiosity * 0.6
        + needs.information * traits.boldness * 0.2
        - needs.safety * 0.35,
      reason: `stimulus urgency ${runtime.attention.urgency.toFixed(2)}`,
    },
  ] satisfies MediumDragonIntentScore[]).sort((a, b) => b.score - a.score);
}

function setMode(
  runtime: MediumDragonRuntime,
  mode: MediumDragonMode,
  intent = runtime.intent,
  reason = runtime.intentReason,
): void {
  if (runtime.mode === mode) return;
  runtime.mode = mode;
  runtime.modeTime = 0;
  runtime.intent = intent;
  runtime.intentReason = reason;
}

export function createMediumDragonRuntime(
  profile: MediumDragonPopulationProfile,
  individualIndex = 0,
): MediumDragonRuntime {
  const spawn = nodeById(profile, profile.territory.spawnNodeId);
  const wing = sampleMediumDragonWingState({
    mode: "folded",
    phase: 0,
    powerFraction: 0,
  });
  return {
    x: spawn.position[0],
    y: spawn.position[1],
    z: spawn.position[2],
    velocityX: 0,
    velocityY: 0,
    velocityZ: 0,
    heading: spawn.heading,
    pitch: 0,
    roll: 0,
    pitchRate: 0,
    yawRate: 0,
    rollRate: 0,
    mode: "observe",
    modeTime: individualIndex * 0.37,
    lifeTime: 0,
    flightTime: 0,
    gaitDistance: 0,
    flapPhase: 0,
    intent: "observe",
    intentReason: "the roost and launch corridor are being verified after spawn",
    currentNodeId: spawn.id,
    targetNodeId: null,
    approachStage: "staging",
    needs: {
      energy: 0.88,
      fatigue: 0.08,
      flightReserve: 0.96,
      thermalLoad: 0.34,
      bodyCare: 0.36,
      safety: 0.12,
      information: 0.88,
      territorialPressure: 0.72,
    },
    attention: {
      mode: "ambient-scan",
      targetX: null,
      targetY: null,
      targetZ: null,
      urgency: 0,
      confidence: 0.5,
      headYaw: 0,
      headPitch: 0,
      nextScanAt: 1.4 + individualIndex * 0.23,
      scanIndex: individualIndex % 5,
    },
    lastWing: wing,
    lastAerodynamics: EMPTY_AERO,
    lastForce: [0, 0, 0],
    lastMoment: [0, 0, 0],
    grounded: true,
    firstFlightCompleted: false,
    decisionSerial: 0,
  };
}

export function drawMediumDragonAttention(
  runtime: MediumDragonRuntime,
  x: number,
  y: number,
  z: number,
  urgency: number,
): void {
  runtime.attention.targetX = x;
  runtime.attention.targetY = y;
  runtime.attention.targetZ = z;
  runtime.attention.urgency = clamp01(Math.max(runtime.attention.urgency, urgency));
  runtime.attention.confidence = 0.72;
  runtime.attention.mode = "acquire";
  runtime.needs.information = clamp01(runtime.needs.information + urgency * 0.16);
  runtime.needs.safety = clamp01(runtime.needs.safety + Math.max(0, urgency - 0.45) * 0.22);
}

function stepAttention(runtime: MediumDragonRuntime, dt: number): void {
  const attention = runtime.attention;
  const airborne = !runtime.grounded;
  const maximumYaw = airborne && ["powered-climb", "flare", "takeoff"].includes(runtime.mode)
    ? 0.34
    : airborne
      ? 0.72
      : 1.02;
  let desiredYaw = 0;
  let desiredPitch = 0;
  if (
    attention.targetX !== null
    && attention.targetY !== null
    && attention.targetZ !== null
    && attention.urgency > 0.02
  ) {
    const dx = attention.targetX - runtime.x;
    const dy = attention.targetY - (runtime.y + 1.45);
    const dz = attention.targetZ - runtime.z;
    desiredYaw = clamp(
      shortestAngle(runtime.heading, Math.atan2(dx, dz)),
      -maximumYaw,
      maximumYaw,
    );
    desiredPitch = clamp(Math.atan2(dy, Math.max(0.1, Math.hypot(dx, dz))), -0.42, 0.48);
    attention.mode = attention.mode === "acquire" ? "verify" : "locked-track";
    attention.urgency = Math.max(0, attention.urgency - dt * 0.055);
    attention.confidence = clamp01(attention.confidence + dt * 0.12);
  } else {
    const scanAngles = [-0.38, 0.16, 0.52, -0.12, 0.31] as const;
    if (runtime.lifeTime >= attention.nextScanAt) {
      attention.scanIndex = (attention.scanIndex + 1) % scanAngles.length;
      attention.nextScanAt = runtime.lifeTime
        + 2.8
        + (1 - runtime.needs.information) * 4.2
        + attention.scanIndex * 0.21;
      attention.mode = "ambient-scan";
    }
    desiredYaw = clamp(scanAngles[attention.scanIndex], -maximumYaw, maximumYaw)
      * (0.45 + runtime.needs.information * 0.55);
    desiredPitch = airborne ? -0.08 : 0.02;
  }
  const headRate = attention.mode === "verify" ? 4.8 : 2.1;
  attention.headYaw = moveToward(attention.headYaw, desiredYaw, headRate * dt);
  attention.headPitch = moveToward(attention.headPitch, desiredPitch, headRate * 0.7 * dt);
}

function updateNeeds(
  runtime: MediumDragonRuntime,
  profile: MediumDragonPopulationProfile,
  dt: number,
  context: MediumDragonStepContext,
): void {
  const airborne = !runtime.grounded;
  const powered = ["powered-climb", "patrol-flap", "return", "approach", "flare"].includes(runtime.mode);
  runtime.needs.energy = clamp01(runtime.needs.energy - dt * (airborne ? 0.0012 : 0.00016));
  runtime.needs.information = clamp01(runtime.needs.information + dt * (airborne ? -0.012 : 0.006));
  runtime.needs.territorialPressure = clamp01(runtime.needs.territorialPressure + dt * (airborne ? -0.013 : 0.0032));
  runtime.needs.bodyCare = clamp01(runtime.needs.bodyCare + dt * (airborne ? 0.003 : 0.0011));
  runtime.needs.safety = clamp01(runtime.needs.safety - dt * (airborne ? 0.02 : 0.012));
  if (powered) {
    runtime.needs.fatigue = clamp01(runtime.needs.fatigue + dt * 0.008);
  } else if (runtime.grounded) {
    runtime.needs.fatigue = clamp01(runtime.needs.fatigue - dt * 0.013);
    runtime.needs.flightReserve = clamp01(runtime.needs.flightReserve + dt * 0.018);
  } else {
    runtime.needs.fatigue = clamp01(runtime.needs.fatigue - dt * 0.0015);
  }
  const night = context.night ?? 0;
  const dayFraction = context.dayFraction ?? 0.5;
  const middayHeat = Math.max(0, 1 - Math.abs(dayFraction - 0.5) * 4);
  runtime.needs.thermalLoad = clamp01(
    runtime.needs.thermalLoad + dt * (middayHeat * 0.0015 - night * 0.002),
  );
  if (profile.traits.routeFamiliarity < 0.5 && airborne) {
    runtime.needs.safety = clamp01(runtime.needs.safety + dt * 0.0025);
  }
}

function chooseGroundIntent(
  runtime: MediumDragonRuntime,
  profile: MediumDragonPopulationProfile,
  removed: ReadonlySet<string>,
): void {
  runtime.decisionSerial += 1;
  const scored = scoreMediumDragonIntents(runtime, profile);
  const launch = profile.territory.nodes.find(
    (node) => node.kind === "launch" && mediumDragonNodeIsUsable(node, removed),
  );
  const canPatrol = Boolean(launch)
    && runtime.needs.flightReserve >= profile.territory.minimumArrivalReserve + 0.34
    && runtime.needs.fatigue < 0.68;
  const preferred = scored.find((candidate) => candidate.intent !== "patrol" || canPatrol)
    ?? scored[0];
  runtime.intent = preferred.intent;
  runtime.intentReason = preferred.reason;
  if ((preferred.intent === "patrol" || preferred.intent === "avoid") && launch) {
    runtime.targetNodeId = launch.id;
    setMode(runtime, "ground-walk", preferred.intent, preferred.reason);
    return;
  }
  if (preferred.intent === "body-care") {
    setMode(runtime, "body-care", preferred.intent, preferred.reason);
    return;
  }
  if (preferred.intent === "rest") {
    setMode(runtime, "rest", preferred.intent, preferred.reason);
    return;
  }
  setMode(runtime, "observe", preferred.intent, preferred.reason);
}

function stepGroundWalk(
  runtime: MediumDragonRuntime,
  profile: MediumDragonPopulationProfile,
  dt: number,
): void {
  const target = runtime.targetNodeId
    ? nodeById(profile, runtime.targetNodeId)
    : nodeById(profile, runtime.currentNodeId);
  const dx = target.position[0] - runtime.x;
  const dz = target.position[2] - runtime.z;
  const distance = Math.hypot(dx, dz);
  const desiredHeading = distance > 0.22 ? Math.atan2(dx, dz) : target.heading;
  const headingStep = clamp(shortestAngle(runtime.heading, desiredHeading), -0.38 * dt, 0.38 * dt);
  const previousX = runtime.x;
  const previousZ = runtime.z;
  runtime.heading = wrapAngle(runtime.heading + headingStep);
  const headingError = Math.abs(shortestAngle(runtime.heading, desiredHeading));
  const speedTarget = distance > 0.18
    ? headingError > 0.55
      ? 0.12
      : 0.72
    : 0;
  const currentSpeed = Math.hypot(runtime.velocityX, runtime.velocityZ);
  const speed = moveToward(currentSpeed, speedTarget, dt * 0.82);
  runtime.velocityX = Math.sin(runtime.heading) * speed;
  runtime.velocityZ = Math.cos(runtime.heading) * speed;
  runtime.x += runtime.velocityX * dt;
  runtime.z += runtime.velocityZ * dt;
  runtime.y = moveToward(runtime.y, target.position[1], dt * 0.25);
  runtime.gaitDistance += Math.hypot(runtime.x - previousX, runtime.z - previousZ)
    + Math.abs(headingStep) * 1.18;
  if (distance < 0.16 && Math.abs(shortestAngle(runtime.heading, target.heading)) < 0.08) {
    runtime.x = target.position[0];
    runtime.y = target.position[1];
    runtime.z = target.position[2];
    runtime.velocityX = 0;
    runtime.velocityZ = 0;
    runtime.currentNodeId = target.id;
    if (target.kind === "launch") {
      setMode(runtime, "takeoff", runtime.intent, runtime.intentReason);
    } else {
      setMode(runtime, "observe", "observe", "the reached surface is being verified");
    }
  }
}

export function mediumDragonTakeoffPhase(
  runtime: Pick<MediumDragonRuntime, "mode" | "modeTime">,
): MediumDragonTakeoffPhase | null {
  if (runtime.mode !== "takeoff") return null;
  if (runtime.modeTime < 0.56) return "preload";
  if (runtime.modeTime < 0.8) return "hind-drive";
  if (runtime.modeTime < 1.06) return "manus-vault";
  if (runtime.modeTime < 1.24) return "clearance";
  if (runtime.modeTime < 1.52) return "unfold";
  return "first-downstroke";
}

function bodyQuaternion(runtime: MediumDragonRuntime): Quaternion {
  return new Quaternion().setFromEuler(
    // Runtime pitch is positive nose-up; three.js positive X rotation points
    // local +Z downward, hence the deliberate sign inversion here.
    new Euler(-runtime.pitch, runtime.heading, runtime.roll, "YXZ"),
  );
}

function integrateLinearForce(
  runtime: MediumDragonRuntime,
  force: Vector3,
  dt: number,
): void {
  runtime.velocityX += force.x / MASS * dt;
  runtime.velocityY += (force.y / MASS - GRAVITY) * dt;
  runtime.velocityZ += force.z / MASS * dt;
  runtime.x += runtime.velocityX * dt;
  runtime.y += runtime.velocityY * dt;
  runtime.z += runtime.velocityZ * dt;
}

function stepTakeoff(
  runtime: MediumDragonRuntime,
  profile: MediumDragonPopulationProfile,
  dt: number,
): void {
  const launch = nodeById(profile, runtime.currentNodeId);
  const phase = mediumDragonTakeoffPhase(runtime);
  const forward = new Vector3(Math.sin(runtime.heading), 0, Math.cos(runtime.heading));
  const force = new Vector3();
  runtime.grounded = runtime.modeTime < 1.06;
  if (phase === "preload") {
    runtime.x = launch.position[0];
    runtime.y = launch.position[1];
    runtime.z = launch.position[2];
    runtime.velocityX = 0;
    runtime.velocityY = 0;
    runtime.velocityZ = 0;
  } else if (phase === "hind-drive") {
    force.copy(forward).multiplyScalar(2550);
    force.y = 4450;
    integrateLinearForce(runtime, force, dt);
  } else if (phase === "manus-vault") {
    force.copy(forward).multiplyScalar(2350);
    force.y = 5200;
    integrateLinearForce(runtime, force, dt);
  } else {
    runtime.grounded = false;
    stepFlightBody(runtime, profile, dt, phase === "clearance" ? "opening" : "flap");
  }
  if (runtime.grounded) runtime.lastForce = [force.x, force.y, force.z];
  if (runtime.modeTime >= 1.72) {
    runtime.flightTime = 0;
    runtime.targetNodeId = null;
    setMode(runtime, "powered-climb", "patrol", runtime.intentReason);
  }
}

function flightTarget(
  runtime: MediumDragonRuntime,
  profile: MediumDragonPopulationProfile,
): Vector3 {
  const airspace = profile.territory.airspace;
  if (runtime.mode === "takeoff" || runtime.mode === "powered-climb") {
    const forwardSpeed = Math.hypot(runtime.velocityX, runtime.velocityZ);
    const forwardX = forwardSpeed > 1
      ? runtime.velocityX / forwardSpeed
      : Math.sin(runtime.heading);
    const forwardZ = forwardSpeed > 1
      ? runtime.velocityZ / forwardSpeed
      : Math.cos(runtime.heading);
    return new Vector3(
      runtime.x + forwardX * 42,
      airspace.patrolHeight,
      runtime.z + forwardZ * 42,
    );
  }
  if (["patrol-flap", "patrol-glide"].includes(runtime.mode)) {
    const dx = runtime.x - airspace.centre[0];
    const dz = runtime.z - airspace.centre[2];
    const radius = Math.max(1, Math.hypot(dx, dz));
    const radialX = dx / radius;
    const radialZ = dz / radius;
    const tangentX = -radialZ;
    const tangentZ = radialX;
    const radiusError = airspace.patrolRadius - radius;
    return new Vector3(
      runtime.x + tangentX * 28 + radialX * radiusError * 0.7,
      airspace.patrolHeight,
      runtime.z + tangentZ * 28 + radialZ * radiusError * 0.7,
    );
  }
  const target = runtime.targetNodeId
    ? nodeById(profile, runtime.targetNodeId)
    : nodeById(profile, profile.territory.spawnNodeId);
  if (runtime.mode === "return" || runtime.mode === "emergency-glide") {
    const forwardX = Math.sin(target.heading);
    const forwardZ = Math.cos(target.heading);
    const rightX = Math.cos(target.heading);
    const rightZ = -Math.sin(target.heading);
    const staging = runtime.approachStage === "staging";
    const turnaround = runtime.approachStage === "turnaround";
    const offset = staging ? -140 : 30;
    const lateral = staging ? 35 : turnaround ? -160 : 0;
    return new Vector3(
      target.position[0] + forwardX * offset + rightX * lateral,
      target.kind === "emergency-landing"
        ? target.position[1] + 14
        : Math.max(target.position[1] + 14, profile.territory.airspace.minimumHeight),
      target.position[2] + forwardZ * offset + rightZ * lateral,
    );
  }
  const dx = target.position[0] - runtime.x;
  const dz = target.position[2] - runtime.z;
  const horizontal = Math.hypot(dx, dz);
  if (runtime.mode === "approach" || runtime.mode === "flare") {
    const rightX = Math.cos(target.heading);
    const rightZ = -Math.sin(target.heading);
    const crossTrack = (runtime.x - target.position[0]) * rightX
      + (runtime.z - target.position[2]) * rightZ;
    const correction = clamp(-crossTrack * 0.035, -0.65, 0.65);
    const runwayHeading = target.heading + correction;
    const runwayLookAhead = 60;
    return new Vector3(
      runtime.x + Math.sin(runwayHeading) * runwayLookAhead,
      target.position[1] + clamp(
        horizontal * (runtime.mode === "flare" ? 0.15 : 0.16),
        0.08,
        runtime.mode === "flare" ? 6 : 11.5,
      ),
      runtime.z + Math.cos(runwayHeading) * runwayLookAhead,
    );
  }
  return new Vector3(
    target.position[0],
    target.position[1] + clamp(horizontal * 0.27, 0.18, 11.5),
    target.position[2],
  );
}

function desiredFlightSpeed(runtime: MediumDragonRuntime): number {
  switch (runtime.mode) {
    case "powered-climb":
      return 12.2;
    case "patrol-flap":
      return 13.5;
    case "patrol-glide":
      return 12.7;
    case "return":
    case "emergency-glide":
      return 13;
    case "approach":
      return 11.4;
    case "flare":
      return 7.2;
    default:
      return 11;
  }
}

function modeWing(
  runtime: MediumDragonRuntime,
  forcedMode?: MediumDragonWingMode,
): MediumDragonWingMode {
  if (forcedMode) return forcedMode;
  if (runtime.mode === "patrol-glide" || runtime.mode === "return" || runtime.mode === "emergency-glide") return "glide";
  if (runtime.mode === "flare" || runtime.mode === "touchdown") return "flare";
  if (runtime.mode === "approach") return "glide";
  return "flap";
}

function stepFlightBody(
  runtime: MediumDragonRuntime,
  profile: MediumDragonPopulationProfile,
  dt: number,
  forcedWingMode?: MediumDragonWingMode,
): void {
  const target = flightTarget(runtime, profile);
  const toTarget = target.clone().sub(new Vector3(runtime.x, runtime.y, runtime.z));
  const targetHeading = Math.atan2(toTarget.x, toTarget.z);
  const horizontalVelocityHeading = Math.hypot(runtime.velocityX, runtime.velocityZ) > 0.5
    ? Math.atan2(runtime.velocityX, runtime.velocityZ)
    : runtime.heading;
  const pathHeadingError = shortestAngle(horizontalVelocityHeading, targetHeading);
  const maximumBank = runtime.mode === "approach" || runtime.mode === "flare" ? 0.34 : 0.48;
  const desiredRoll = runtime.mode === "takeoff" || runtime.mode === "powered-climb"
    ? 0
    : -clamp(pathHeadingError * 0.72, -maximumBank, maximumBank);
  const horizontalSpeed = Math.max(0.1, Math.hypot(runtime.velocityX, runtime.velocityZ));
  const flightPathAngle = Math.atan2(runtime.velocityY, horizontalSpeed);
  const requestedClimbAngle = clamp(
    (target.y - runtime.y) * 0.014 - runtime.velocityY * 0.038,
    -0.16,
    0.18,
  );
  const desiredAngleOfAttack = runtime.mode === "flare" ? 0.29 : 0.18;
  const representativeWingIncidence = runtime.mode === "flare" ? 0.235 : 0.16;
  const lowSpeedRecovery = horizontalSpeed < 8.8 ? -0.12 : requestedClimbAngle;
  // Body pitch follows the achieved flight path plus the residual incidence
  // not already supplied by the wing. Asking the nose to point at a high
  // target directly would hold a stalled animal nose-high as it fell.
  const desiredPitch = clamp(
    moveToward(flightPathAngle, lowSpeedRecovery, 0.12)
      + desiredAngleOfAttack
      - representativeWingIncidence,
    -0.34,
    0.34,
  );
  const rollControl = clamp(
    (desiredRoll - runtime.roll) * -1.85 + runtime.rollRate * 0.42,
    -1,
    1,
  );
  const speed = Math.max(0.1, Math.hypot(runtime.velocityX, runtime.velocityY, runtime.velocityZ));
  const desiredSpeed = desiredFlightSpeed(runtime);
  const altitudeDemand = clamp((target.y - runtime.y) * 0.045 - runtime.velocityY * 0.055, -0.16, 0.25);
  const speedDemand = clamp((desiredSpeed - speed) * 0.055, -0.12, 0.24);
  let wingMode = modeWing(runtime, forcedWingMode);
  if (
    (runtime.mode === "return" || runtime.mode === "emergency-glide")
    && (runtime.y < target.y - 2.5 || speed < 10.4)
  ) {
    wingMode = "flap";
  }
  if (
    runtime.mode === "approach"
    && (runtime.y < target.y - 0.8 || speed < 11.2)
  ) {
    wingMode = "flap";
  }
  const power = wingMode === "flap"
    ? clamp(0.72 + altitudeDemand + speedDemand, 0.48, 1)
    : wingMode === "flare"
      ? 0.72
      : 0;
  const frequency = 0.92 + power * 0.36;
  runtime.flapPhase = (runtime.flapPhase + dt * frequency) % 1;
  const sampledWing = sampleMediumDragonWingState({
    mode: wingMode,
    phase: runtime.flapPhase,
    powerFraction: power,
    rollControl,
  });
  const liftDemand = wingMode === "flap"
    ? Math.max(0, altitudeDemand)
    : wingMode === "flare"
      ? clamp((-runtime.velocityY - 1.25) * 0.14, 0, 0.28)
      : 0;
  const descentUnload = runtime.mode === "approach" || runtime.mode === "flare"
    ? Math.max(0, -altitudeDemand - liftDemand)
    : 0;
  const wing: MediumDragonWingState = liftDemand > 0 || descentUnload > 0
    ? {
        ...sampledWing,
        panels: sampledWing.panels.map((panel) => ({
          ...panel,
          camber: panel.camber * (1 + liftDemand * 1.8 - descentUnload * 0.55),
          incidence: panel.incidence + liftDemand * 0.08 - descentUnload * 0.62,
        })),
      }
    : sampledWing;

  const orientation = bodyQuaternion(runtime);
  const inverseOrientation = orientation.clone().invert();
  const velocityBody = new Vector3(
    runtime.velocityX,
    runtime.velocityY,
    runtime.velocityZ,
  ).applyQuaternion(inverseOrientation);
  const aerodynamic = computeMediumDragonAerodynamics({
    velocityBody: [velocityBody.x, velocityBody.y, velocityBody.z],
    wing,
  });
  const aerodynamicForce = new Vector3(...aerodynamic.force).applyQuaternion(orientation);
  const worldVelocity = new Vector3(runtime.velocityX, runtime.velocityY, runtime.velocityZ);
  // Fully spread panels, legs and the raised chest make the flare a large
  // air-brake. This is still a force integrated through the same body; it is
  // not a scripted deceleration or a position correction.
  const bodyDragArea = runtime.mode === "flare" ? 8.5 : 1.65;
  const bodyDrag = worldVelocity.clone().multiplyScalar(
    -0.5 * 1.225 * worldVelocity.length() * 0.58 * bodyDragArea,
  );
  const totalForce = aerodynamicForce.add(bodyDrag).clampLength(
    0,
    MASS * GRAVITY * 3.45,
  );

  const localMoment = new Vector3(...aerodynamic.moment);
  const dynamicAuthority = clamp(speed / 11, 0.18, 1.35);
  const velocityAlignment = shortestAngle(runtime.heading, horizontalVelocityHeading);
  localMoment.x += ((desiredPitch - runtime.pitch) * 3200 - runtime.pitchRate * 1200)
    * dynamicAuthority;
  localMoment.y += (velocityAlignment * 720 - runtime.yawRate * 310)
    * dynamicAuthority;
  localMoment.z += -runtime.roll * 680 - runtime.rollRate * 720;
  localMoment.x = clamp(localMoment.x, -2600, 2600);
  localMoment.z = clamp(localMoment.z, -1900, 1900);

  runtime.pitchRate = clamp(
    runtime.pitchRate + localMoment.x / PITCH_INERTIA * dt,
    -0.72,
    0.72,
  );
  runtime.yawRate = clamp(
    runtime.yawRate + localMoment.y / YAW_INERTIA * dt,
    -0.62,
    0.62,
  );
  runtime.rollRate = clamp(
    runtime.rollRate + localMoment.z / ROLL_INERTIA * dt,
    -0.62,
    0.62,
  );
  runtime.pitch = clamp(runtime.pitch + runtime.pitchRate * dt, -0.62, 0.58);
  runtime.heading = wrapAngle(runtime.heading + runtime.yawRate * dt);
  runtime.roll = clamp(runtime.roll + runtime.rollRate * dt, -0.6, 0.6);
  integrateLinearForce(runtime, totalForce, dt);

  if (wingMode === "flap" || wingMode === "flare") {
    const reserveCost = 0.0018 + aerodynamic.mechanicalPower / 3_400_000;
    runtime.needs.flightReserve = clamp01(runtime.needs.flightReserve - reserveCost * dt);
  }
  runtime.lastWing = wing;
  runtime.lastAerodynamics = aerodynamic;
  runtime.lastForce = [totalForce.x, totalForce.y, totalForce.z];
  runtime.lastMoment = [localMoment.x, localMoment.y, localMoment.z];
}

function chooseLanding(
  runtime: MediumDragonRuntime,
  profile: MediumDragonPopulationProfile,
  removed: ReadonlySet<string>,
): boolean {
  const landing = nearestUsableLanding(runtime, profile, removed);
  if (!landing) return false;
  runtime.targetNodeId = landing.id;
  runtime.approachStage = "staging";
  setMode(runtime, landing.kind === "landing" ? "return" : "emergency-glide");
  return true;
}

function stepAirMode(
  runtime: MediumDragonRuntime,
  profile: MediumDragonPopulationProfile,
  dt: number,
  removed: ReadonlySet<string>,
): void {
  runtime.grounded = false;
  runtime.flightTime += dt;
  if (
    runtime.needs.flightReserve <= profile.territory.minimumArrivalReserve
    && !["return", "approach", "flare", "emergency-glide"].includes(runtime.mode)
  ) {
    chooseLanding(runtime, profile, removed);
  }

  if (runtime.mode === "powered-climb") {
    stepFlightBody(runtime, profile, dt);
    const airspace = profile.territory.airspace;
    const speed = Math.hypot(runtime.velocityX, runtime.velocityY, runtime.velocityZ);
    if (runtime.y >= airspace.patrolHeight - 4 && speed >= 9.5) {
      setMode(runtime, "patrol-flap");
    }
    return;
  }

  if (runtime.mode === "patrol-flap" || runtime.mode === "patrol-glide") {
    stepFlightBody(runtime, profile, dt);
    const airspace = profile.territory.airspace;
    const speed = Math.hypot(runtime.velocityX, runtime.velocityY, runtime.velocityZ);
    if (runtime.mode === "patrol-flap" && runtime.y > airspace.patrolHeight + 2 && speed > 11.8) {
      setMode(runtime, "patrol-glide");
    } else if (
      runtime.mode === "patrol-glide"
      && (runtime.y < airspace.patrolHeight - 3.5 || speed < 10.3)
    ) {
      setMode(runtime, "patrol-flap");
    }
    if (runtime.flightTime > 32 + profile.traits.patience * 10) {
      chooseLanding(runtime, profile, removed);
    }
    return;
  }

  if (runtime.mode === "return" || runtime.mode === "emergency-glide") {
    stepFlightBody(runtime, profile, dt);
    const landing = runtime.targetNodeId ? nodeById(profile, runtime.targetNodeId) : null;
    if (!landing) return;
    const forwardX = Math.sin(landing.heading);
    const forwardZ = Math.cos(landing.heading);
    const rightX = Math.cos(landing.heading);
    const rightZ = -Math.sin(landing.heading);
    const interceptX = landing.position[0] - forwardX * 140 + rightX * 35;
    const interceptZ = landing.position[2] - forwardZ * 140 + rightZ * 35;
    if (
      runtime.approachStage === "staging"
      && Math.hypot(interceptX - runtime.x, interceptZ - runtime.z) < 15
    ) {
      runtime.approachStage = "turnaround";
      runtime.modeTime = 0;
      return;
    }
    const stageX = landing.position[0] - forwardX * 80;
    const stageZ = landing.position[2] - forwardZ * 80;
    const relativeX = runtime.x - stageX;
    const relativeZ = runtime.z - stageZ;
    const along = relativeX * forwardX + relativeZ * forwardZ;
    const cross = Math.abs(relativeX * forwardZ - relativeZ * forwardX);
    const velocityHeading = Math.atan2(runtime.velocityX, runtime.velocityZ);
    const speed = Math.hypot(runtime.velocityX, runtime.velocityY, runtime.velocityZ);
    if (
      runtime.approachStage === "turnaround"
      && Math.abs(shortestAngle(velocityHeading, landing.heading)) < 0.55
    ) {
      runtime.approachStage = "alignment";
      runtime.modeTime = 0;
      return;
    }
    if (
      runtime.approachStage === "alignment"
      &&
      along >= -6
      && along <= 10
      && cross < 55
      && Math.abs(shortestAngle(velocityHeading, landing.heading)) < 0.55
      && speed >= 11.1
    ) {
      runtime.approachStage = "final";
      setMode(runtime, "approach");
    } else if (runtime.approachStage === "alignment" && along > 10) {
      runtime.approachStage = "staging";
      runtime.modeTime = 0;
    }
    return;
  }

  if (runtime.mode === "approach") {
    const landing = runtime.targetNodeId ? nodeById(profile, runtime.targetNodeId) : null;
    if (!landing || !mediumDragonNodeIsUsable(landing, removed)) {
      chooseLanding(runtime, profile, removed);
      return;
    }
    stepFlightBody(runtime, profile, dt);
    const horizontal = Math.hypot(landing.position[0] - runtime.x, landing.position[2] - runtime.z);
    const forwardX = Math.sin(landing.heading);
    const forwardZ = Math.cos(landing.heading);
    const rightX = Math.cos(landing.heading);
    const rightZ = -Math.sin(landing.heading);
    const relativeX = runtime.x - landing.position[0];
    const relativeZ = runtime.z - landing.position[2];
    const along = relativeX * forwardX + relativeZ * forwardZ;
    const cross = Math.abs(relativeX * rightX + relativeZ * rightZ);
    if (
      runtime.y < landing.position[1] + 1.5
      && horizontal > landing.usableRadius + 3
    ) {
      runtime.approachStage = "staging";
      setMode(runtime, "return", "patrol", "the final approach fell below the usable glide path");
    } else if (
      along >= -38
      && along <= -3
      && cross < 16
      && runtime.y >= landing.position[1]
      && runtime.y < landing.position[1] + 10.5
    ) {
      setMode(runtime, "flare");
    } else if (along > 5) {
      runtime.approachStage = "staging";
      setMode(runtime, "return", "patrol", "the runway centreline was missed before flare commitment");
    }
    return;
  }

  if (runtime.mode === "flare") {
    const landing = runtime.targetNodeId ? nodeById(profile, runtime.targetNodeId) : null;
    if (!landing || !mediumDragonNodeIsUsable(landing, removed)) {
      chooseLanding(runtime, profile, removed);
      return;
    }
    stepFlightBody(runtime, profile, dt);
    const horizontal = Math.hypot(landing.position[0] - runtime.x, landing.position[2] - runtime.z);
    const forwardX = Math.sin(landing.heading);
    const forwardZ = Math.cos(landing.heading);
    const rightX = Math.cos(landing.heading);
    const rightZ = -Math.sin(landing.heading);
    const relativeX = runtime.x - landing.position[0];
    const relativeZ = runtime.z - landing.position[2];
    const along = relativeX * forwardX + relativeZ * forwardZ;
    const cross = Math.abs(relativeX * rightX + relativeZ * rightZ);
    if (horizontal <= landing.usableRadius + 1.8 && runtime.y <= landing.position[1] + 0.12) {
      runtime.y = landing.position[1];
      runtime.velocityY = Math.max(0, -runtime.velocityY * 0.05);
      runtime.currentNodeId = landing.id;
      runtime.grounded = true;
      setMode(runtime, "touchdown");
    } else if (along > 9 || cross > 20) {
      runtime.approachStage = "staging";
      setMode(runtime, "return", "patrol", "the flare retained a go-around before physical contact");
    }
  }
}

function stepLanding(
  runtime: MediumDragonRuntime,
  profile: MediumDragonPopulationProfile,
  dt: number,
): void {
  const landing = nodeById(profile, runtime.currentNodeId);
  runtime.grounded = true;
  runtime.y = landing.position[1];
  runtime.velocityY = 0;
  const speed = Math.hypot(runtime.velocityX, runtime.velocityZ);
  const braking = runtime.mode === "touchdown"
    ? 12
    : runtime.mode === "wing-unload"
      ? 8
      : 5;
  const nextSpeed = Math.max(0, speed - dt * braking);
  if (speed > 1e-5) {
    runtime.velocityX *= nextSpeed / speed;
    runtime.velocityZ *= nextSpeed / speed;
  }
  runtime.x += runtime.velocityX * dt;
  runtime.z += runtime.velocityZ * dt;
  runtime.pitch = moveToward(runtime.pitch, 0, dt * 0.75);
  runtime.roll = moveToward(runtime.roll, 0, dt * 0.9);
  runtime.pitchRate = moveToward(runtime.pitchRate, 0, dt * 1.5);
  runtime.rollRate = moveToward(runtime.rollRate, 0, dt * 1.5);
  runtime.yawRate = moveToward(runtime.yawRate, 0, dt * 1.2);
  if (runtime.mode === "touchdown" && runtime.modeTime >= 0.58) {
    setMode(runtime, "wing-unload");
  } else if (runtime.mode === "wing-unload" && runtime.modeTime >= 0.82) {
    setMode(runtime, "ground-recovery");
  } else if (runtime.mode === "ground-recovery" && runtime.modeTime >= 1.15) {
    runtime.velocityX = 0;
    runtime.velocityZ = 0;
    runtime.heading = landing.heading;
    runtime.pitch = 0;
    runtime.roll = 0;
    runtime.firstFlightCompleted = true;
    runtime.needs.information = clamp01(runtime.needs.information - 0.72);
    runtime.needs.territorialPressure = clamp01(runtime.needs.territorialPressure - 0.64);
    runtime.needs.bodyCare = clamp01(runtime.needs.bodyCare + 0.18);
    runtime.needs.fatigue = clamp01(runtime.needs.fatigue + 0.18);
    runtime.targetNodeId = null;
    setMode(runtime, "rest", "rest", "flight reserve and wing load now dominate");
  }
}

export function stepMediumDragon(
  runtime: MediumDragonRuntime,
  profile: MediumDragonPopulationProfile,
  dt: number,
  context: MediumDragonStepContext = {},
): void {
  const safeDt = Math.max(0, Math.min(0.05, dt));
  if (safeDt <= 0) return;
  const removed = context.removedPieceIds ?? new Set<string>();
  runtime.lifeTime += safeDt;
  runtime.modeTime += safeDt;
  updateNeeds(runtime, profile, safeDt, context);
  stepAttention(runtime, safeDt);

  if (runtime.grounded) {
    const support = nodeById(profile, runtime.currentNodeId);
    if (!mediumDragonNodeIsUsable(support, removed)) {
      runtime.grounded = false;
      runtime.velocityY = Math.min(runtime.velocityY, -0.8);
      runtime.targetNodeId = nearestUsableLanding(runtime, profile, removed)?.id ?? null;
      setMode(runtime, "emergency-glide", "avoid", "the supporting surface was destroyed");
    }
  }

  if (runtime.mode === "ground-walk") {
    stepGroundWalk(runtime, profile, safeDt);
  } else if (runtime.mode === "takeoff") {
    stepTakeoff(runtime, profile, safeDt);
  } else if ([
    "powered-climb",
    "patrol-flap",
    "patrol-glide",
    "return",
    "approach",
    "flare",
    "emergency-glide",
  ].includes(runtime.mode)) {
    stepAirMode(runtime, profile, safeDt, removed);
  } else if (["touchdown", "wing-unload", "ground-recovery"].includes(runtime.mode)) {
    stepLanding(runtime, profile, safeDt);
  } else if (runtime.mode === "body-care") {
    runtime.velocityX = 0;
    runtime.velocityZ = 0;
    if (runtime.modeTime >= 5.4) {
      runtime.needs.bodyCare = clamp01(runtime.needs.bodyCare - 0.62);
      setMode(runtime, "observe", "observe", "the opened membrane has been checked");
    }
  } else if (runtime.mode === "rest") {
    runtime.velocityX = 0;
    runtime.velocityZ = 0;
    if (runtime.modeTime >= 9 + profile.traits.patience * 6) {
      chooseGroundIntent(runtime, profile, removed);
    }
  } else if (runtime.mode === "observe") {
    runtime.velocityX = 0;
    runtime.velocityZ = 0;
    if (runtime.modeTime >= 6.5 + profile.traits.patience * 3) {
      runtime.needs.information = clamp01(runtime.needs.information - 0.12);
      chooseGroundIntent(runtime, profile, removed);
    }
  }
}

export interface MediumDragonPoseSample {
  readonly current:
    | "ground-observe"
    | "walk-support"
    | "takeoff-preload"
    | "takeoff-hind-drive"
    | "takeoff-manus-vault"
    | "takeoff-clearance"
    | "takeoff-unfold"
    | "takeoff-first-downstroke"
    | "flight-downstroke"
    | "flight-upstroke"
    | "glide"
    | "bank-turn"
    | "hover-brake"
    | "landing-flare"
    | "landing-touchdown"
    | "landing-wing-unload"
    | "ground-recovery";
  readonly next: MediumDragonPoseSample["current"];
  readonly blend: number;
  readonly gaitPhase?: number;
  readonly mirrorBank?: boolean;
  readonly wingCare?: number;
}

function pair(
  current: MediumDragonPoseSample["current"],
  next: MediumDragonPoseSample["current"],
  blend: number,
  extra: Omit<MediumDragonPoseSample, "current" | "next" | "blend"> = {},
): MediumDragonPoseSample {
  return { current, next, blend: clamp01(blend), ...extra };
}

export function sampleMediumDragonPose(
  runtime: MediumDragonRuntime,
): MediumDragonPoseSample {
  if (runtime.mode === "ground-walk") {
    return pair("ground-observe", "walk-support", 0.86, {
      gaitPhase: (runtime.gaitDistance / 1.36) % 1,
    });
  }
  if (runtime.mode === "body-care") {
    const open = Math.sin(clamp01(runtime.modeTime / 5.4) * Math.PI);
    return pair("ground-observe", "takeoff-unfold", open * 0.48, { wingCare: open });
  }
  if (runtime.mode === "takeoff") {
    const phase = mediumDragonTakeoffPhase(runtime);
    const map: Readonly<Record<NonNullable<MediumDragonTakeoffPhase>, MediumDragonPoseSample["current"]>> = {
      preload: "takeoff-preload",
      "hind-drive": "takeoff-hind-drive",
      "manus-vault": "takeoff-manus-vault",
      clearance: "takeoff-clearance",
      unfold: "takeoff-unfold",
      "first-downstroke": "takeoff-first-downstroke",
    };
    const order = [
      "preload",
      "hind-drive",
      "manus-vault",
      "clearance",
      "unfold",
      "first-downstroke",
    ] as const;
    const index = Math.max(0, order.indexOf(phase ?? "preload"));
    const next = order[Math.min(order.length - 1, index + 1)];
    return pair(map[order[index]], map[next], 0.18);
  }
  if (["powered-climb", "patrol-flap"].includes(runtime.mode)) {
    const downstroke = runtime.flapPhase >= 0.08 && runtime.flapPhase < 0.52;
    const local = downstroke
      ? (runtime.flapPhase - 0.08) / 0.44
      : runtime.flapPhase < 0.08
        ? (runtime.flapPhase + 0.48) / 0.56
        : (runtime.flapPhase - 0.52) / 0.56;
    return downstroke
      ? pair("flight-upstroke", "flight-downstroke", Math.sin(clamp01(local) * Math.PI * 0.5))
      : pair("flight-downstroke", "flight-upstroke", Math.sin(clamp01(local) * Math.PI * 0.5));
  }
  if (runtime.mode === "patrol-glide" || runtime.mode === "return" || runtime.mode === "emergency-glide") {
    const bank = Math.abs(runtime.roll) > 0.16;
    return bank
      ? pair("glide", "bank-turn", clamp01(Math.abs(runtime.roll) / 0.58), {
          mirrorBank: runtime.roll > 0,
        })
      : pair("glide", "glide", 0);
  }
  if (runtime.mode === "approach") return pair("glide", "landing-flare", clamp01(runtime.modeTime / 1.2));
  if (runtime.mode === "flare") return pair("landing-flare", "landing-flare", 0);
  if (runtime.mode === "touchdown") return pair("landing-flare", "landing-touchdown", clamp01(runtime.modeTime / 0.58));
  if (runtime.mode === "wing-unload") return pair("landing-touchdown", "landing-wing-unload", clamp01(runtime.modeTime / 0.82));
  if (runtime.mode === "ground-recovery") return pair("landing-wing-unload", "ground-recovery", clamp01(runtime.modeTime / 1.15));
  return pair("ground-observe", "ground-observe", 0);
}
