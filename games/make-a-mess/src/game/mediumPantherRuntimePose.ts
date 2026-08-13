import { Euler, Matrix4, Quaternion, Vector3 } from "three";
import {
  MEDIUM_PANTHER_SKELETON,
  mediumPantherBoneForPart,
  mediumPantherRigStates,
  type MediumPantherPoseId,
} from "../content/objects/creatures/mediumPantherRigObject.ts";
import { mediumPantherCanonicalParts } from "../content/objects/creatures/mediumPantherObject.ts";
import type {
  CreatureRigState,
  CreatureRotationMatrix,
} from "../content/objects/creatures/creatureRig.ts";
import type {
  MediumPantherPoseSample,
  MediumPantherRuntime,
} from "./mediumPantherSim.ts";
import {
  articulatedSurfaceHeightAt,
  type ObstacleField,
} from "./villagerNavigation.ts";
import {
  createCreatureWholeBodyState,
  creatureContactWindow,
  solveCreatureWholeBodyPose,
  type CreatureWholeBodyState,
} from "./creatureWholeBodyMotion.ts";

const UNIT_SCALE = new Vector3(1, 1, 1);
const Y_AXIS = new Vector3(0, 1, 0);
const BONE_INDEX = new Map(
  MEDIUM_PANTHER_SKELETON.bones.map((bone, index) => [bone.id, index]),
);
const PARENT_INDICES = MEDIUM_PANTHER_SKELETON.bones.map((bone) => {
  if (!bone.parent) return -1;
  const parent = BONE_INDEX.get(bone.parent);
  if (parent === undefined) throw new Error(`${bone.id}: missing parent ${bone.parent}`);
  return parent;
});

type PawId =
  | "left-fore-paw"
  | "right-fore-paw"
  | "left-hind-paw"
  | "right-hind-paw";

interface PawContactProbe {
  readonly id: PawId;
  readonly bone: number;
  readonly point: Vector3;
  readonly supportPoints: readonly Vector3[];
}

interface PawContactLock {
  active: boolean;
  anchorX: number;
  anchorY: number;
  anchorZ: number;
  clearance: number;
  weight: number;
}

interface BodyFloorProbe {
  readonly bone: number;
  readonly point: Vector3;
  readonly radius: number;
}

export interface MediumPantherContactState {
  readonly paws: Map<PawId, PawContactLock>;
  readonly desiredPose: Matrix4[];
  readonly wholeBody: CreatureWholeBodyState;
  bodyOffsetX: number;
  bodyOffsetZ: number;
  bodyVelocityX: number;
  bodyVelocityZ: number;
  lastElapsed: number | null;
}

interface LegChain {
  readonly pawId: PawId;
  readonly boneIndices: readonly [number, number, number, number];
  readonly sagittalLimits: readonly [number, number, number];
}

function boneIndex(id: string): number {
  const index = BONE_INDEX.get(id);
  if (index === undefined) throw new Error(`${id}: no panther runtime bone`);
  return index;
}

const LEG_CHAINS: readonly LegChain[] = [
  {
    pawId: "left-fore-paw",
    boneIndices: [boneIndex("left-scapula"), boneIndex("left-forearm"), boneIndex("left-carpus"), boneIndex("left-forepaw")],
    sagittalLimits: [0.86, 1.28, 0.74],
  },
  {
    pawId: "right-fore-paw",
    boneIndices: [boneIndex("right-scapula"), boneIndex("right-forearm"), boneIndex("right-carpus"), boneIndex("right-forepaw")],
    sagittalLimits: [0.86, 1.28, 0.74],
  },
  {
    pawId: "left-hind-paw",
    boneIndices: [boneIndex("left-hip"), boneIndex("left-knee"), boneIndex("left-hock"), boneIndex("left-hindpaw")],
    sagittalLimits: [0.9, 1.34, 0.78],
  },
  {
    pawId: "right-hind-paw",
    boneIndices: [boneIndex("right-hip"), boneIndex("right-knee"), boneIndex("right-hock"), boneIndex("right-hindpaw")],
    sagittalLimits: [0.9, 1.34, 0.78],
  },
];

const PAW_CONTACT_PROBES: readonly PawContactProbe[] = mediumPantherCanonicalParts
  .filter(
    (part) =>
      part.kind === "box" &&
      part.group === "paws" &&
      /-(fore|hind)-paw$/.test(part.id),
  )
  .map((part) => {
    if (part.kind !== "box") throw new Error(`${part.id}: contact probe must be a box`);
    const bone = BONE_INDEX.get(mediumPantherBoneForPart(part));
    if (bone === undefined) throw new Error(`${part.id}: no runtime contact bone`);
    const supportPoints: Vector3[] = [];
    for (const supportPart of mediumPantherCanonicalParts) {
      if (
        supportPart.kind !== "box"
        || supportPart.group !== "paws"
        || mediumPantherBoneForPart(supportPart) !== mediumPantherBoneForPart(part)
      ) continue;
      const half = supportPart.size.map((value) => value / 2);
      const rotation = new Euler(...(supportPart.rotation ?? [0, 0, 0]));
      for (const x of [-half[0], half[0]]) {
        for (const y of [-half[1], half[1]]) {
          for (const z of [-half[2], half[2]]) {
            supportPoints.push(
              new Vector3(x, y, z)
                .applyEuler(rotation)
                .add(new Vector3(...supportPart.center)),
            );
          }
        }
      }
    }
    return {
      id: part.id as PawId,
      bone,
      point: new Vector3(...part.center),
      supportPoints,
    };
  });

const BODY_FLOOR_PROBES: readonly BodyFloorProbe[] = mediumPantherCanonicalParts
  .flatMap((part): BodyFloorProbe[] => {
    const bone = boneIndex(mediumPantherBoneForPart(part));
    if (part.kind === "box") {
      const half = part.size.map((value) => value / 2);
      const rotation = new Euler(...(part.rotation ?? [0, 0, 0]));
      const points: BodyFloorProbe[] = [];
      for (const x of [-half[0], half[0]]) {
        for (const y of [-half[1], half[1]]) {
          for (const z of [-half[2], half[2]]) {
            points.push({
              bone,
              point: new Vector3(x, y, z)
                .applyEuler(rotation)
                .add(new Vector3(...part.center)),
              radius: 0,
            });
          }
        }
      }
      return points;
    }
    if (part.kind === "beam") {
      const radius = Math.max(part.width, part.depth) / 2;
      return [
        { bone, point: new Vector3(...part.from), radius },
        { bone, point: new Vector3(...part.to), radius },
      ];
    }
    if (part.kind === "cylinder") {
      return [
        { bone, point: new Vector3(...part.from), radius: part.radius },
        { bone, point: new Vector3(...part.to), radius: part.radius },
      ];
    }
    return part.vertices.map((point) => ({
      bone,
      point: new Vector3(...point),
      radius: 0,
    }));
  });

function matrixFromRotation(rotation: CreatureRotationMatrix): Matrix4 {
  return new Matrix4().set(
    rotation[0][0], rotation[0][1], rotation[0][2], 0,
    rotation[1][0], rotation[1][1], rotation[1][2], 0,
    rotation[2][0], rotation[2][1], rotation[2][2], 0,
    0, 0, 0, 1,
  );
}

function runtimeRootHeight(poseId: MediumPantherPoseId): number | null {
  // The lab frame raises the whole pose for display. Runtime keeps only enough
  // clearance for the folded hind paws; the separate ballistic root supplies
  // the actual arc through the world.
  if (poseId === "jump-flight") return 0.86;
  if (poseId.startsWith("trot-") && poseId.endsWith("flight")) return 0.56;
  if (poseId.includes("gathered-flight")) return 0.58;
  if (poseId.includes("spine-opening")) return 0.59;
  if (poseId.includes("extended-flight")) return 0.6;
  return null;
}

function normalizedPivot(state: CreatureRigState, boneId: string): Vector3 {
  const pivot = state.pivots[boneId];
  const targetRootY = runtimeRootHeight(state.poseId as MediumPantherPoseId);
  const correction = targetRootY === null ? 0 : targetRootY - state.pivots.root[1];
  return new Vector3(pivot[0], pivot[1] + correction, pivot[2]);
}

export function createMediumPantherPosePalette(): Matrix4[] {
  return MEDIUM_PANTHER_SKELETON.bones.map(() => new Matrix4());
}

export function createMediumPantherContactState(): MediumPantherContactState {
  return {
    paws: new Map(
      PAW_CONTACT_PROBES.map((paw) => [
        paw.id,
        { active: false, anchorX: 0, anchorY: 0, anchorZ: 0, clearance: 0, weight: 0 },
      ]),
    ),
    desiredPose: createMediumPantherPosePalette(),
    wholeBody: createCreatureWholeBodyState(
      MEDIUM_PANTHER_SKELETON.bones.length,
      PARENT_INDICES,
    ),
    bodyOffsetX: 0,
    bodyOffsetZ: 0,
    bodyVelocityX: 0,
    bodyVelocityZ: 0,
    lastElapsed: null,
  };
}

/**
 * Runtime duty factors are continuous time contracts. The review atlas only
 * says which paws touch at its discrete frames; treating every interpolation
 * between those frames as full support made the walk physically unreachable.
 */
export function mediumPantherPawSupportWeight(
  sample: MediumPantherPoseSample,
  pawId: PawId,
): number {
  if (!sample.gait || sample.cyclePhase === undefined) return 0;
  const phase = sample.cyclePhase;
  if (sample.gait === "walk") {
    const swingCentre: Readonly<Record<PawId, number>> = {
      "left-hind-paw": 0,
      "left-fore-paw": 0.25,
      "right-hind-paw": 0.5,
      "right-fore-paw": 0.75,
    };
    return 1 - creatureContactWindow(phase, swingCentre[pawId], 0.22, 0.08);
  }
  if (sample.gait === "trot") {
    if (pawId === "left-fore-paw" || pawId === "right-hind-paw") {
      return creatureContactWindow(phase, 0, 0.16, 0.1);
    }
    return creatureContactWindow(phase, 0.5, 0.16, 0.1);
  }
  const contactCentre: Readonly<Record<PawId, number>> = {
    "right-fore-paw": 0.125,
    "left-fore-paw": 0.25,
    "left-hind-paw": 0.5,
    "right-hind-paw": 0.625,
  };
  return creatureContactWindow(phase, contactCentre[pawId], 0.1, 0.07);
}

function stepCriticalScalar(
  value: number,
  velocity: number,
  target: number,
  halfLife: number,
  dt: number,
): readonly [number, number] {
  const angularFrequency = Math.LN2 / Math.max(1e-4, halfLife);
  const decay = Math.exp(-angularFrequency * dt);
  const error = value - target;
  const combined = velocity + angularFrequency * error;
  return [
    target + (error + combined * dt) * decay,
    (velocity - angularFrequency * combined * dt) * decay,
  ];
}

function poseHalfLife(runtime: MediumPantherRuntime): number {
  switch (runtime.mode) {
    case "walk":
      return 0.035;
    case "trot":
    case "perch-approach":
      return 0.032;
    case "accelerate":
    case "gallop":
      return 0.028;
    case "observe":
    case "perch-observe":
      return 0.05;
    default:
      return 0.04;
  }
}

function toWorld(
  local: Vector3,
  runtime: MediumPantherRuntime,
): Vector3 {
  const sine = Math.sin(runtime.heading);
  const cosine = Math.cos(runtime.heading);
  return new Vector3(
    runtime.x + cosine * local.x + sine * local.z,
    runtime.groundY + runtime.airHeight + local.y,
    runtime.z - sine * local.x + cosine * local.z,
  );
}

function toLocal(world: Vector3, runtime: MediumPantherRuntime): Vector3 {
  const sine = Math.sin(runtime.heading);
  const cosine = Math.cos(runtime.heading);
  const x = world.x - runtime.x;
  const z = world.z - runtime.z;
  return new Vector3(
    cosine * x - sine * z,
    world.y - runtime.groundY - runtime.airHeight,
    sine * x + cosine * z,
  );
}

function bonePivot(target: readonly Matrix4[], bone: number): Vector3 {
  const rest = MEDIUM_PANTHER_SKELETON.bones[bone].rest.neutral;
  return new Vector3(...rest).applyMatrix4(target[bone]);
}

function rotateLegSuffix(
  target: readonly Matrix4[],
  chain: LegChain,
  jointIndex: number,
  pivot: Vector3,
  angle: number,
): void {
  if (Math.abs(angle) <= 1e-7) return;
  const adjustment = new Matrix4()
    .makeTranslation(pivot.x, pivot.y, pivot.z)
    .multiply(new Matrix4().makeRotationX(angle))
    .multiply(new Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z));
  for (let index = jointIndex; index < chain.boneIndices.length; index += 1) {
    target[chain.boneIndices[index]].premultiply(adjustment);
  }
}

function rotateWholeLegLaterally(
  target: readonly Matrix4[],
  chain: LegChain,
  pivot: Vector3,
  angle: number,
): void {
  if (Math.abs(angle) <= 1e-7) return;
  const adjustment = new Matrix4()
    .makeTranslation(pivot.x, pivot.y, pivot.z)
    .multiply(new Matrix4().makeRotationZ(angle))
    .multiply(new Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z));
  for (const bone of chain.boneIndices) target[bone].premultiply(adjustment);
}

function shortestAngle(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

function solveLegContact(
  target: readonly Matrix4[],
  chain: LegChain,
  paw: PawContactProbe,
  desired: Vector3,
  allowShoulderSling = true,
): void {
  const applied = [0, 0, 0];
  let appliedLateral = 0;
  for (let iteration = 0; iteration < 20; iteration += 1) {
    const top = bonePivot(target, chain.boneIndices[0]);
    const lateralEffector = paw.point.clone().applyMatrix4(target[paw.bone]);
    const currentLateral = Math.atan2(
      lateralEffector.y - top.y,
      lateralEffector.x - top.x,
    );
    const desiredLateral = Math.atan2(desired.y - top.y, desired.x - top.x);
    const requestedLateral = shortestAngle(currentLateral, desiredLateral);
    const nextLateral = Math.max(-0.38, Math.min(0.38, appliedLateral + requestedLateral));
    rotateWholeLegLaterally(
      target,
      chain,
      top,
      nextLateral - appliedLateral,
    );
    appliedLateral = nextLateral;

    for (let jointIndex = 2; jointIndex >= 0; jointIndex -= 1) {
      const pivot = bonePivot(target, chain.boneIndices[jointIndex]);
      const effector = paw.point.clone().applyMatrix4(target[paw.bone]);
      const currentAngle = Math.atan2(effector.z - pivot.z, effector.y - pivot.y);
      const desiredAngle = Math.atan2(desired.z - pivot.z, desired.y - pivot.y);
      const requested = shortestAngle(currentAngle, desiredAngle);
      const limit = chain.sagittalLimits[jointIndex];
      const next = Math.max(-limit, Math.min(limit, applied[jointIndex] + requested));
      const correction = next - applied[jointIndex];
      applied[jointIndex] = next;
      rotateLegSuffix(target, chain, jointIndex, pivot, correction);
    }
  }
  if (allowShoulderSling && chain.pawId.includes("fore")) {
    const current = paw.point.clone().applyMatrix4(target[paw.bone]);
    translateShoulderSling(target, chain, desired.clone().sub(current));
  }
}

function keepPawsAboveSurface(
  target: readonly Matrix4[],
  runtime: MediumPantherRuntime,
  field: ObstacleField | null,
  broken: ReadonlySet<string>,
): void {
  for (const chain of LEG_CHAINS) {
    const paw = PAW_CONTACT_PROBES.find((candidate) => candidate.id === chain.pawId)!;
    // Raising the pad centre can rotate its toe box and reveal a different
    // lowest corner. Re-sample the rigid pad after each articulated solve;
    // never detach and translate the completed limb as a fallback.
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const centre = paw.point.clone().applyMatrix4(target[paw.bone]);
      let bottom = Infinity;
      for (const support of paw.supportPoints) {
        bottom = Math.min(bottom, support.clone().applyMatrix4(target[paw.bone]).y);
      }
      const world = toWorld(centre, runtime);
      const surface = field
        ? articulatedSurfaceHeightAt(field, world.x, world.z, runtime.groundY, broken)
        : runtime.groundY;
      const penetration = surface
        - (runtime.groundY + runtime.airHeight + bottom);
      if (penetration <= 1e-5) break;
      solveLegContact(
        target,
        chain,
        paw,
        centre.clone().setY(centre.y + penetration),
      );
    }
  }
}

function translateShoulderSling(
  target: readonly Matrix4[],
  chain: LegChain,
  requestedWorld: Vector3,
): void {
  if (!chain.pawId.includes("fore")) return;
  const chest = boneIndex("chest");
  const scapula = chain.boneIndices[0];
  const rest = new Vector3(...MEDIUM_PANTHER_SKELETON.bones[scapula].rest.neutral);
  const expected = rest.clone().applyMatrix4(target[chest]);
  const actual = bonePivot(target, scapula);
  const chestRotation = new Quaternion().setFromRotationMatrix(target[chest]);
  const inverseChestRotation = chestRotation.clone().invert();
  const currentLocal = actual.clone().sub(expected).applyQuaternion(inverseChestRotation);
  const requestedLocal = requestedWorld.clone().applyQuaternion(inverseChestRotation);
  const nextLocal = currentLocal.clone().add(requestedLocal);
  nextLocal.x = Math.max(-0.035, Math.min(0.035, nextLocal.x));
  nextLocal.y = Math.max(-0.08, Math.min(0.12, nextLocal.y));
  nextLocal.z = Math.max(-0.14, Math.min(0.14, nextLocal.z));
  if (nextLocal.length() > 0.12) nextLocal.setLength(0.12);
  const appliedWorld = nextLocal
    .sub(currentLocal)
    .applyQuaternion(chestRotation);
  if (appliedWorld.lengthSq() <= 1e-10) return;
  const translation = new Matrix4().makeTranslation(
    appliedWorld.x,
    appliedWorld.y,
    appliedWorld.z,
  );
  for (const bone of chain.boneIndices) target[bone].premultiply(translation);
}

function keepShoulderSlingsAboveBaseSurface(
  target: readonly Matrix4[],
  runtime: MediumPantherRuntime,
  state: MediumPantherContactState,
  field: ObstacleField | null,
  broken: ReadonlySet<string>,
): void {
  for (const chain of LEG_CHAINS.filter((candidate) => candidate.pawId.includes("fore"))) {
    const bones = new Set(chain.boneIndices);
    const paw = PAW_CONTACT_PROBES.find((candidate) => candidate.id === chain.pawId)!;
    const lock = state.paws.get(chain.pawId)!;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      let penetration = 0;
      for (const probe of BODY_FLOOR_PROBES) {
        if (!bones.has(probe.bone)) continue;
        const local = probe.point.clone().applyMatrix4(target[probe.bone]);
        const world = toWorld(local, runtime);
        const surface = field
          ? articulatedSurfaceHeightAt(field, world.x, world.z, runtime.groundY, broken)
          : runtime.groundY;
        if (surface > runtime.groundY + 1e-4) continue;
        penetration = Math.max(
          penetration,
          surface - (
            runtime.groundY
            + runtime.airHeight
            + local.y
            - probe.radius
          ),
        );
      }
      const correction = Math.max(0, penetration - 0.006);
      if (correction <= 1e-5) break;
      translateShoulderSling(target, chain, new Vector3(0, correction, 0));
      if (lock.active && lock.weight > 1e-5) {
        solveLegContact(
          target,
          chain,
          paw,
          toLocal(new Vector3(lock.anchorX, lock.anchorY, lock.anchorZ), runtime),
          false,
        );
      }
    }
  }
}

function solvePlantedPaws(
  target: readonly Matrix4[],
  sample: MediumPantherPoseSample,
  runtime: MediumPantherRuntime,
  elapsed: number,
  state: MediumPantherContactState,
  field: ObstacleField | null,
  broken: ReadonlySet<string>,
): void {
  const dt = state.lastElapsed === null
    ? 1 / 60
    : Math.max(0, Math.min(0.1, elapsed - state.lastElapsed));
  state.lastElapsed = elapsed;

  if (Math.hypot(state.bodyOffsetX, state.bodyOffsetZ) > 1e-6) {
    const bodyShift = new Matrix4().makeTranslation(state.bodyOffsetX, 0, state.bodyOffsetZ);
    for (const matrix of target) matrix.premultiply(bodyShift);
  }

  const tasks: Array<{
    chain: LegChain;
    paw: PawContactProbe;
    desired: Vector3;
    weight: number;
  }> = [];
  for (const chain of LEG_CHAINS) {
    const paw = PAW_CONTACT_PROBES.find((candidate) => candidate.id === chain.pawId)!;
    const lock = state.paws.get(paw.id)!;
    const requestedWeight = mediumPantherPawSupportWeight(sample, paw.id);
    const maximumWeightStep = dt * 10;
    lock.weight += Math.max(
      -maximumWeightStep,
      Math.min(maximumWeightStep, requestedWeight - lock.weight),
    );
    if (requestedWeight <= 1e-5 && lock.weight <= 1e-5) {
      lock.weight = 0;
      lock.active = false;
    }
    const weight = lock.weight;
    const base = paw.point.clone().applyMatrix4(target[paw.bone]);
    if (weight <= 1e-5) {
      continue;
    }
    if (!lock.active) {
      const anchor = toWorld(base, runtime);
      let bottom = Infinity;
      for (const point of paw.supportPoints) {
        bottom = Math.min(bottom, point.clone().applyMatrix4(target[paw.bone]).y);
      }
      lock.active = true;
      lock.anchorX = anchor.x;
      lock.anchorZ = anchor.z;
      lock.clearance = Math.max(0, base.y - bottom);
      lock.anchorY = field
        ? articulatedSurfaceHeightAt(
            field,
            anchor.x,
            anchor.z,
            runtime.groundY,
            broken,
          ) + lock.clearance
        : anchor.y;
    } else if (field) {
      const surface = articulatedSurfaceHeightAt(
        field,
        lock.anchorX,
        lock.anchorZ,
        runtime.groundY,
        broken,
      );
      lock.anchorY = surface + lock.clearance;
    }
    const anchor = toLocal(
      new Vector3(lock.anchorX, lock.anchorY, lock.anchorZ),
      runtime,
    );
    // Contact position and contact load are different quantities. Once the
    // pad has touched, it is geometrically stationary; `weight` only controls
    // how much of the resulting reaction reaches the body before toe-off.
    const desired = anchor;
    tasks.push({ chain, paw, desired, weight });
  }

  // A stance can reach the anatomical limit of one limb before another. Let
  // their remaining horizontal errors move the body between the supports,
  // then resolve the limbs. This is the visible propulsion step: legs do not
  // stretch past their chain merely to protect a perfectly smooth nav root.
  for (const task of tasks) {
    solveLegContact(target, task.chain, task.paw, task.desired);
  }
  let errorX = 0;
  let errorZ = 0;
  let totalWeight = 0;
  for (const task of tasks) {
    if (task.weight < 0.5) continue;
    const current = task.paw.point.clone().applyMatrix4(target[task.paw.bone]);
    const weight = task.weight * task.weight;
    errorX += (task.desired.x - current.x) * weight;
    errorZ += (task.desired.z - current.z) * weight;
    totalWeight += weight;
  }
  const requestedOffsetX = totalWeight > 1e-7
    ? Math.max(-0.22, Math.min(0.22, state.bodyOffsetX + errorX / totalWeight))
    : 0;
  const requestedOffsetZ = totalWeight > 1e-7
    ? Math.max(-0.22, Math.min(0.22, state.bodyOffsetZ + errorZ / totalWeight))
    : 0;
  const previousOffsetX = state.bodyOffsetX;
  const previousOffsetZ = state.bodyOffsetZ;
  [state.bodyOffsetX, state.bodyVelocityX] = stepCriticalScalar(
    state.bodyOffsetX,
    state.bodyVelocityX,
    requestedOffsetX,
    0.035,
    dt,
  );
  [state.bodyOffsetZ, state.bodyVelocityZ] = stepCriticalScalar(
    state.bodyOffsetZ,
    state.bodyVelocityZ,
    requestedOffsetZ,
    0.035,
    dt,
  );
  const shiftX = state.bodyOffsetX - previousOffsetX;
  const shiftZ = state.bodyOffsetZ - previousOffsetZ;
  if (Math.hypot(shiftX, shiftZ) > 1e-6) {
    const bodyShift = new Matrix4().makeTranslation(shiftX, 0, shiftZ);
    for (const matrix of target) matrix.premultiply(bodyShift);
    for (const task of tasks) {
      solveLegContact(target, task.chain, task.paw, task.desired);
    }
  }
  keepPawsAboveSurface(target, runtime, field, broken);
  keepShoulderSlingsAboveBaseSurface(
    target,
    runtime,
    state,
    field,
    broken,
  );
}

export function writeMediumPantherPose(
  target: readonly Matrix4[],
  sample: MediumPantherPoseSample,
  runtime: MediumPantherRuntime,
  elapsed: number,
  contactState: MediumPantherContactState,
  field: ObstacleField | null = null,
  broken: ReadonlySet<string> = new Set(),
): void {
  if (target.length !== MEDIUM_PANTHER_SKELETON.bones.length) {
    throw new Error(`Panther pose palette has ${target.length} matrices, expected ${MEDIUM_PANTHER_SKELETON.bones.length}`);
  }
  const from = mediumPantherRigStates[sample.current];
  const to = mediumPantherRigStates[sample.next];
  const desiredPose = contactState.desiredPose;
  for (const [index, bone] of MEDIUM_PANTHER_SKELETON.bones.entries()) {
    const pivot = normalizedPivot(from, bone.id).lerp(
      normalizedPivot(to, bone.id),
      sample.blend,
    );
    const rotation = new Quaternion()
      .setFromRotationMatrix(matrixFromRotation(from.rotations[bone.id]))
      .slerp(
        new Quaternion().setFromRotationMatrix(matrixFromRotation(to.rotations[bone.id])),
        sample.blend,
      );

    // Stillness is active: support remains fixed and only the head performs a
    // small secondary scan after the gaze has settled.
    if ((runtime.mode === "observe" || runtime.mode === "perch-observe") && bone.id === "head") {
      rotation.multiply(
        new Quaternion().setFromAxisAngle(Y_AXIS, Math.sin(elapsed * 0.72) * 0.08),
      );
    }

    const rest = bone.rest[from.reference];
    if (!rest) {
      throw new Error(`${bone.id}: no ${from.reference} bind pivot`);
    }
    desiredPose[index].compose(pivot, rotation, UNIT_SCALE);
  }

  solveCreatureWholeBodyPose(
    target,
    desiredPose,
    contactState.wholeBody,
    elapsed,
    poseHalfLife(runtime),
  );
  for (const [index, bone] of MEDIUM_PANTHER_SKELETON.bones.entries()) {
    const rest = bone.rest[from.reference];
    if (!rest) throw new Error(`${bone.id}: no ${from.reference} bind pivot`);
    target[index].multiply(
      new Matrix4().makeTranslation(-rest[0], -rest[1], -rest[2]),
    );
  }

  // The navigation root is deliberately smooth. During a declared stance,
  // the rendered skeleton is instead solved from paw anchors in world space:
  // the planted pads stay put and the body advances over them. This keeps
  // terrain/navigation ownership at the world root without turning the gait
  // into a visual treadmill.
  solvePlantedPaws(target, sample, runtime, elapsed, contactState, field, broken);

}
