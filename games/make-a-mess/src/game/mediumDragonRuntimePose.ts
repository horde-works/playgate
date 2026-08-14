import { Euler, Matrix4, Quaternion, Vector3 } from "three";
import {
  MEDIUM_DRAGON_SKELETON,
  mediumDragonRigStates,
  type MediumDragonPoseId,
} from "../content/objects/creatures/mediumDragonRigObject.ts";
import type {
  CreatureRigState,
  CreatureRotationMatrix,
} from "../content/objects/creatures/creatureRig.ts";
import {
  createCreatureWholeBodyState,
  creatureContactWindow,
  solveCreatureWholeBodyPose,
  type CreatureWholeBodyState,
} from "./creatureWholeBodyMotion.ts";
import { mediumDragonVisibleWingArea } from "./mediumDragonAerodynamics.ts";
import type {
  MediumDragonPoseSample,
  MediumDragonRuntime,
} from "./mediumDragonSim.ts";

const UNIT_SCALE = new Vector3(1, 1, 1);
const X_AXIS = new Vector3(1, 0, 0);
const Y_AXIS = new Vector3(0, 1, 0);
const Z_AXIS = new Vector3(0, 0, 1);
const GROUND_REFERENCE = "ground-folded";
const BONE_INDEX = new Map(
  MEDIUM_DRAGON_SKELETON.bones.map((bone, index) => [bone.id, index]),
);
const PARENT_INDICES = MEDIUM_DRAGON_SKELETON.bones.map((bone) => {
  if (!bone.parent) return -1;
  const parent = BONE_INDEX.get(bone.parent);
  if (parent === undefined) throw new Error(`${bone.id}: missing parent ${bone.parent}`);
  return parent;
});
const DESCENDANTS = MEDIUM_DRAGON_SKELETON.bones.map((_, root) =>
  MEDIUM_DRAGON_SKELETON.bones.flatMap((__, candidate) => {
    let cursor = candidate;
    while (cursor >= 0) {
      if (cursor === root) return [candidate];
      cursor = PARENT_INDICES[cursor];
    }
    return [];
  }),
);
const GROUND_ROOT = new Vector3(...MEDIUM_DRAGON_SKELETON.bones[0].rest[GROUND_REFERENCE]);
const REFLECTION_X = new Matrix4().makeScale(-1, 1, 1);
const REFERENCE_ALIGNMENT = new Map<string, Quaternion>();

type SupportId =
  | "left-manus-pad"
  | "right-manus-pad"
  | "left-hind-pad"
  | "right-hind-pad";

interface SupportProbe {
  readonly id: SupportId;
  readonly bone: number;
  readonly point: Vector3;
}

interface SupportLock {
  active: boolean;
  x: number;
  y: number;
  z: number;
  weight: number;
}

interface LimbChain {
  readonly supportId: SupportId;
  readonly bones: readonly [number, number, number, number];
  readonly sagittalLimits: readonly [number, number, number];
}

export interface MediumDragonContactState {
  readonly supports: Map<SupportId, SupportLock>;
  readonly desiredPose: Matrix4[];
  readonly wholeBody: CreatureWholeBodyState;
  lastElapsed: number | null;
}

function boneIndex(id: string): number {
  const index = BONE_INDEX.get(id);
  if (index === undefined) throw new Error(`${id}: no medium dragon runtime bone`);
  return index;
}

const SUPPORTS: readonly SupportProbe[] = [
  { id: "left-manus-pad", bone: boneIndex("left-free-digit"), point: new Vector3(-0.72, 0.055, 0.87) },
  { id: "right-manus-pad", bone: boneIndex("right-free-digit"), point: new Vector3(0.72, 0.055, 0.87) },
  { id: "left-hind-pad", bone: boneIndex("left-hindfoot"), point: new Vector3(-0.39, 0.055, -0.45) },
  { id: "right-hind-pad", bone: boneIndex("right-hindfoot"), point: new Vector3(0.39, 0.055, -0.45) },
];

const LIMBS: readonly LimbChain[] = [
  {
    supportId: "left-manus-pad",
    bones: [boneIndex("left-shoulder"), boneIndex("left-elbow"), boneIndex("left-wrist"), boneIndex("left-free-digit")],
    sagittalLimits: [0.72, 1.05, 0.76],
  },
  {
    supportId: "right-manus-pad",
    bones: [boneIndex("right-shoulder"), boneIndex("right-elbow"), boneIndex("right-wrist"), boneIndex("right-free-digit")],
    sagittalLimits: [0.72, 1.05, 0.76],
  },
  {
    supportId: "left-hind-pad",
    bones: [boneIndex("left-hip"), boneIndex("left-knee"), boneIndex("left-ankle"), boneIndex("left-hindfoot")],
    sagittalLimits: [0.82, 1.12, 0.76],
  },
  {
    supportId: "right-hind-pad",
    bones: [boneIndex("right-hip"), boneIndex("right-knee"), boneIndex("right-ankle"), boneIndex("right-hindfoot")],
    sagittalLimits: [0.82, 1.12, 0.76],
  },
];

function matrixFromRotation(rotation: CreatureRotationMatrix): Matrix4 {
  return new Matrix4().set(
    rotation[0][0], rotation[0][1], rotation[0][2], 0,
    rotation[1][0], rotation[1][1], rotation[1][2], 0,
    rotation[2][0], rotation[2][1], rotation[2][2], 0,
    0, 0, 0, 1,
  );
}

function oppositeBone(id: string): string {
  if (id.startsWith("left-")) return `right-${id.slice(5)}`;
  if (id.startsWith("right-")) return `left-${id.slice(6)}`;
  return id;
}

function referenceAlignment(boneId: string, reference: string): Quaternion {
  if (reference === GROUND_REFERENCE) return new Quaternion();
  const key = `${boneId}:${reference}`;
  const existing = REFERENCE_ALIGNMENT.get(key);
  if (existing) return existing;
  const bone = MEDIUM_DRAGON_SKELETON.bones.find((candidate) => candidate.id === boneId);
  if (!bone) throw new Error(`${boneId}: no dragon bone for reference alignment`);
  const child = MEDIUM_DRAGON_SKELETON.bones.find((candidate) => candidate.parent === boneId);
  const other = child ?? MEDIUM_DRAGON_SKELETON.bones.find(
    (candidate) => candidate.id === bone.parent,
  );
  if (!other) {
    const identity = new Quaternion();
    REFERENCE_ALIGNMENT.set(key, identity);
    return identity;
  }
  const groundDirection = child
    ? new Vector3(...other.rest[GROUND_REFERENCE]).sub(new Vector3(...bone.rest[GROUND_REFERENCE]))
    : new Vector3(...bone.rest[GROUND_REFERENCE]).sub(new Vector3(...other.rest[GROUND_REFERENCE]));
  const referenceDirection = child
    ? new Vector3(...other.rest[reference]).sub(new Vector3(...bone.rest[reference]))
    : new Vector3(...bone.rest[reference]).sub(new Vector3(...other.rest[reference]));
  const alignment = groundDirection.lengthSq() > 1e-8 && referenceDirection.lengthSq() > 1e-8
    ? new Quaternion().setFromUnitVectors(
        groundDirection.normalize(),
        referenceDirection.normalize(),
      )
    : new Quaternion();
  REFERENCE_ALIGNMENT.set(key, alignment);
  return alignment;
}

/** Remove atlas camera-space root motion when physics owns the airborne body. */
function sampledTransform(
  state: CreatureRigState,
  boneId: string,
  mirror: boolean,
): { readonly pivot: Vector3; readonly rotation: Quaternion } {
  const sourceId = mirror ? oppositeBone(boneId) : boneId;
  const sourcePivot = new Vector3(...state.pivots[sourceId]);
  const sourceRotation = new Matrix4().makeRotationFromQuaternion(
    new Quaternion()
      .setFromRotationMatrix(matrixFromRotation(state.rotations[sourceId]))
      .multiply(referenceAlignment(sourceId, state.reference)),
  );
  if (mirror) {
    sourcePivot.x *= -1;
    sourceRotation.premultiply(REFLECTION_X).multiply(REFLECTION_X);
  }

  if (state.reference !== GROUND_REFERENCE) {
    const rootPivot = new Vector3(...state.pivots.root);
    const rootRotation = new Quaternion().setFromRotationMatrix(
      matrixFromRotation(state.rotations.root),
    );
    const inverseRoot = rootRotation.clone().invert();
    sourcePivot.sub(rootPivot).applyQuaternion(inverseRoot).add(GROUND_ROOT);
    const rotation = new Quaternion()
      .copy(inverseRoot)
      .multiply(new Quaternion().setFromRotationMatrix(sourceRotation));
    return { pivot: sourcePivot, rotation };
  }
  return {
    pivot: sourcePivot,
    rotation: new Quaternion().setFromRotationMatrix(sourceRotation),
  };
}

export function mediumDragonSupportWeight(
  sample: MediumDragonPoseSample,
  runtime: MediumDragonRuntime,
  id: SupportId,
): number {
  if (runtime.mode === "ground-walk" && sample.gaitPhase !== undefined) {
    const swingCentre: Readonly<Record<SupportId, number>> = {
      "left-hind-pad": 0,
      "left-manus-pad": 0.25,
      "right-hind-pad": 0.5,
      "right-manus-pad": 0.75,
    };
    return 1 - creatureContactWindow(sample.gaitPhase, swingCentre[id], 0.18, 0.08);
  }
  if (runtime.mode === "takeoff") {
    if (runtime.modeTime < 0.8) return 1;
    if (runtime.modeTime < 1.06) return id.includes("manus") ? 1 : 0;
    return 0;
  }
  if (runtime.mode === "touchdown" || runtime.mode === "wing-unload") {
    return id.includes("hind") ? 1 : 0;
  }
  if (runtime.mode === "ground-recovery") {
    if (id.includes("hind")) return 1;
    return Math.max(0, Math.min(1, (runtime.modeTime - 0.42) / 0.48));
  }
  return runtime.grounded ? 1 : 0;
}

function gaitRotation(
  sample: MediumDragonPoseSample,
  boneId: string,
): Quaternion | null {
  if (sample.gaitPhase === undefined) return null;
  const centre: Readonly<Record<string, number>> = {
    "left-hip": 0,
    "left-shoulder": 0.25,
    "right-hip": 0.5,
    "right-shoulder": 0.75,
  };
  const phaseCentre = centre[boneId];
  if (phaseCentre === undefined) return null;
  const phase = (sample.gaitPhase - phaseCentre + 1) % 1;
  const foreAft = Math.sin(phase * Math.PI * 2) * 0.19;
  const swing = creatureContactWindow(sample.gaitPhase, phaseCentre, 0.18, 0.08);
  return new Quaternion().setFromAxisAngle(X_AXIS, foreAft - swing * 0.08);
}

function poseHalfLife(runtime: MediumDragonRuntime): number {
  if (!runtime.grounded) return runtime.mode === "flare" ? 0.024 : 0.032;
  if (runtime.mode === "takeoff" || runtime.mode === "touchdown") return 0.025;
  if (runtime.mode === "ground-walk") return 0.04;
  return 0.065;
}

function bodyQuaternion(runtime: MediumDragonRuntime): Quaternion {
  return new Quaternion().setFromEuler(
    new Euler(-runtime.pitch, runtime.heading, runtime.roll, "YXZ"),
  );
}

function toWorld(local: Vector3, runtime: MediumDragonRuntime): Vector3 {
  return local.clone()
    .applyQuaternion(bodyQuaternion(runtime))
    .add(new Vector3(runtime.x, runtime.y, runtime.z));
}

function toLocal(world: Vector3, runtime: MediumDragonRuntime): Vector3 {
  return world.clone()
    .sub(new Vector3(runtime.x, runtime.y, runtime.z))
    .applyQuaternion(bodyQuaternion(runtime).invert());
}

function bonePivot(target: readonly Matrix4[], bone: number): Vector3 {
  const rest = MEDIUM_DRAGON_SKELETON.bones[bone].rest[GROUND_REFERENCE];
  return new Vector3(...rest).applyMatrix4(target[bone]);
}

function rotateSuffix(
  target: readonly Matrix4[],
  chain: LimbChain,
  joint: number,
  pivot: Vector3,
  axis: "x" | "z",
  angle: number,
): void {
  if (Math.abs(angle) < 1e-7) return;
  const rotation = axis === "x"
    ? new Matrix4().makeRotationX(angle)
    : new Matrix4().makeRotationZ(angle);
  const adjustment = new Matrix4()
    .makeTranslation(pivot.x, pivot.y, pivot.z)
    .multiply(rotation)
    .multiply(new Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z));
  const rootBone = chain.bones[joint];
  for (const index of DESCENDANTS[rootBone]) {
    target[index].premultiply(adjustment);
  }
}

function shortestAngle(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

function solveSupport(
  target: readonly Matrix4[],
  chain: LimbChain,
  probe: SupportProbe,
  desired: Vector3,
): void {
  const sagittal = [0, 0, 0];
  let lateral = 0;
  for (let iteration = 0; iteration < 14; iteration += 1) {
    const top = bonePivot(target, chain.bones[0]);
    const effector = probe.point.clone().applyMatrix4(target[probe.bone]);
    const currentLateral = Math.atan2(effector.y - top.y, effector.x - top.x);
    const desiredLateral = Math.atan2(desired.y - top.y, desired.x - top.x);
    const nextLateral = Math.max(-0.34, Math.min(
      0.34,
      lateral + shortestAngle(currentLateral, desiredLateral),
    ));
    rotateSuffix(target, chain, 0, top, "z", nextLateral - lateral);
    lateral = nextLateral;

    for (let joint = 2; joint >= 0; joint -= 1) {
      const pivot = bonePivot(target, chain.bones[joint]);
      const current = probe.point.clone().applyMatrix4(target[probe.bone]);
      const currentAngle = Math.atan2(current.z - pivot.z, current.y - pivot.y);
      const desiredAngle = Math.atan2(desired.z - pivot.z, desired.y - pivot.y);
      const next = Math.max(-chain.sagittalLimits[joint], Math.min(
        chain.sagittalLimits[joint],
        sagittal[joint] + shortestAngle(currentAngle, desiredAngle),
      ));
      rotateSuffix(target, chain, joint, pivot, "x", next - sagittal[joint]);
      sagittal[joint] = next;
    }
  }
}

function solvePlantedSupports(
  target: readonly Matrix4[],
  sample: MediumDragonPoseSample,
  runtime: MediumDragonRuntime,
  elapsed: number,
  state: MediumDragonContactState,
): void {
  const dt = state.lastElapsed === null
    ? 1 / 60
    : Math.max(0, Math.min(0.1, elapsed - state.lastElapsed));
  state.lastElapsed = elapsed;
  for (const chain of LIMBS) {
    const probe = SUPPORTS.find((candidate) => candidate.id === chain.supportId)!;
    const lock = state.supports.get(chain.supportId)!;
    const requested = mediumDragonSupportWeight(sample, runtime, chain.supportId);
    const step = dt * 12;
    lock.weight += Math.max(-step, Math.min(step, requested - lock.weight));
    if (requested < 0.05 && lock.weight < 0.05) {
      lock.active = false;
      lock.weight = 0;
      continue;
    }
    const local = probe.point.clone().applyMatrix4(target[probe.bone]);
    if (!lock.active && requested >= 0.55) {
      const world = toWorld(local, runtime);
      lock.active = true;
      lock.x = world.x;
      lock.y = world.y;
      lock.z = world.z;
    }
    if (!lock.active) continue;
    solveSupport(
      target,
      chain,
      probe,
      toLocal(new Vector3(lock.x, lock.y, lock.z), runtime),
    );
  }
}

export function createMediumDragonPosePalette(): Matrix4[] {
  return MEDIUM_DRAGON_SKELETON.bones.map(() => new Matrix4());
}

export function createMediumDragonContactState(): MediumDragonContactState {
  return {
    supports: new Map(SUPPORTS.map((support) => [
      support.id,
      { active: false, x: 0, y: 0, z: 0, weight: 0 },
    ])),
    desiredPose: createMediumDragonPosePalette(),
    wholeBody: createCreatureWholeBodyState(
      MEDIUM_DRAGON_SKELETON.bones.length,
      PARENT_INDICES,
    ),
    lastElapsed: null,
  };
}

export function writeMediumDragonPose(
  target: readonly Matrix4[],
  sample: MediumDragonPoseSample,
  runtime: MediumDragonRuntime,
  elapsed: number,
  contactState: MediumDragonContactState,
): void {
  if (target.length !== MEDIUM_DRAGON_SKELETON.bones.length) {
    throw new Error(`Dragon pose palette has ${target.length} matrices, expected ${MEDIUM_DRAGON_SKELETON.bones.length}`);
  }
  const from = mediumDragonRigStates[sample.current as MediumDragonPoseId];
  const to = mediumDragonRigStates[sample.next as MediumDragonPoseId];
  const desired = contactState.desiredPose;
  const visibleWingArea = mediumDragonVisibleWingArea(runtime.lastWing);
  for (const [index, bone] of MEDIUM_DRAGON_SKELETON.bones.entries()) {
    const start = sampledTransform(from, bone.id, false);
    const end = sampledTransform(to, bone.id, Boolean(sample.mirrorBank));
    const pivot = start.pivot.clone().lerp(end.pivot, sample.blend);
    const rotation = start.rotation.clone().slerp(end.rotation, sample.blend);

    const gait = gaitRotation(sample, bone.id);
    if (gait) rotation.multiply(gait);

    const attentionShare = bone.id === "neck-3"
      ? 0.27
      : bone.id === "neck-4"
        ? 0.31
        : bone.id === "head"
          ? 0.42
          : bone.id === "chest" && Math.abs(runtime.attention.headYaw) > 0.78
            ? 0.08
            : 0;
    if (attentionShare > 0) {
      rotation
        .multiply(new Quaternion().setFromAxisAngle(
          Y_AXIS,
          runtime.attention.headYaw * attentionShare,
        ))
        .multiply(new Quaternion().setFromAxisAngle(
          X_AXIS,
          -runtime.attention.headPitch * attentionShare,
        ));
    }
    if (bone.id === "head" && runtime.mode === "observe") {
      rotation.multiply(new Quaternion().setFromAxisAngle(
        Y_AXIS,
        Math.sin(elapsed * 0.43) * 0.025,
      ));
    }
    const wingSide = bone.id.startsWith("left-")
      ? 0
      : bone.id.startsWith("right-")
        ? 1
        : -1;
    const wingControl = bone.id.split("-").slice(1).join("-");
    if (
      wingSide >= 0
      && ["shoulder", "elbow", "wrist", "metacarpal"].includes(wingControl)
    ) {
      const ownArea = wingSide === 0 ? visibleWingArea[0] : visibleWingArea[1];
      const otherArea = wingSide === 0 ? visibleWingArea[1] : visibleWingArea[0];
      const differentialFold = Math.max(
        0,
        Math.min(0.62, (otherArea - ownArea) * 1.9),
      );
      if (differentialFold > 0) {
        const sideSign = wingSide === 0 ? -1 : 1;
        const jointShare = wingControl === "shoulder"
          ? 0.34
          : wingControl === "elbow"
            ? 0.72
            : wingControl === "wrist"
              ? 0.86
              : 1;
        rotation.multiply(new Quaternion().setFromEuler(new Euler(
          0,
          sideSign * differentialFold * jointShare,
          sideSign * differentialFold * jointShare * 0.22,
        )));
      }
    }
    const tailMatch = /^tail-(\d+)$/.exec(bone.id);
    if (tailMatch) {
      const tailShare = 0.16 + Number(tailMatch[1]) * 0.025;
      rotation
        .multiply(new Quaternion().setFromAxisAngle(
          Y_AXIS,
          -runtime.yawRate * tailShare,
        ))
        .multiply(new Quaternion().setFromAxisAngle(
          Z_AXIS,
          -runtime.rollRate * tailShare * 0.7,
        ));
    }
    if (bone.id === "head" || bone.id === "neck-4") {
      rotation.multiply(new Quaternion().setFromAxisAngle(
        Z_AXIS,
        -runtime.roll * (bone.id === "head" ? 0.24 : 0.12),
      ));
    }
    desired[index].compose(pivot, rotation, UNIT_SCALE);
  }

  solveCreatureWholeBodyPose(
    target,
    desired,
    contactState.wholeBody,
    elapsed,
    poseHalfLife(runtime),
  );

  // Geometry is always the folded canonical body. Flight states reposition
  // the same joints; the inverse bind never changes with the action.
  for (const [index, bone] of MEDIUM_DRAGON_SKELETON.bones.entries()) {
    const rest = bone.rest[GROUND_REFERENCE];
    target[index].multiply(
      new Matrix4().makeTranslation(-rest[0], -rest[1], -rest[2]),
    );
  }
  solvePlantedSupports(target, sample, runtime, elapsed, contactState);
}
