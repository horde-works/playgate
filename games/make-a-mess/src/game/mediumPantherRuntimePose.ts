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

const UNIT_SCALE = new Vector3(1, 1, 1);
const Y_AXIS = new Vector3(0, 1, 0);
const BONE_INDEX = new Map(
  MEDIUM_PANTHER_SKELETON.bones.map((bone, index) => [bone.id, index]),
);

const PAW_SUPPORT_PROBES = mediumPantherCanonicalParts
  .filter((part) => part.kind === "box" && part.group === "paws")
  .flatMap((part) => {
    if (part.kind !== "box") return [];
    const bone = BONE_INDEX.get(mediumPantherBoneForPart(part));
    if (bone === undefined) throw new Error(`${part.id}: no runtime support bone`);
    const half = part.size.map((value) => value / 2);
    const rotation = new Euler(...(part.rotation ?? [0, 0, 0]));
    const points: Vector3[] = [];
    for (const x of [-half[0], half[0]]) {
      for (const y of [-half[1], half[1]]) {
        for (const z of [-half[2], half[2]]) {
          points.push(
            new Vector3(x, y, z)
              .applyEuler(rotation)
              .add(new Vector3(...part.center)),
          );
        }
      }
    }
    return points.map((point) => ({ bone, point }));
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

export function writeMediumPantherPose(
  target: readonly Matrix4[],
  sample: MediumPantherPoseSample,
  runtime: MediumPantherRuntime,
  elapsed: number,
): void {
  if (target.length !== MEDIUM_PANTHER_SKELETON.bones.length) {
    throw new Error(`Panther pose palette has ${target.length} matrices, expected ${MEDIUM_PANTHER_SKELETON.bones.length}`);
  }
  const from = mediumPantherRigStates[sample.current];
  const to = mediumPantherRigStates[sample.next];
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
    if (runtime.mode === "observe" && bone.id === "head") {
      rotation.multiply(
        new Quaternion().setFromAxisAngle(Y_AXIS, Math.sin(elapsed * 0.72) * 0.08),
      );
    }

    const rest = bone.rest[from.reference];
    if (!rest) {
      throw new Error(`${bone.id}: no ${from.reference} bind pivot`);
    }
    target[index]
      .compose(pivot, rotation, UNIT_SCALE)
      .multiply(new Matrix4().makeTranslation(-rest[0], -rest[1], -rest[2]));
  }

  // Quaternion interpolation between two individually grounded frames does
  // not itself preserve a planted pad. Solve the final few centimetres from
  // the canonical paw boxes, then translate the whole skeleton as one body.
  // This is the feline equivalent of the villagers' foot lock, not a second
  // geometry or a per-limb terrain cheat.
  let supportY = Infinity;
  const probe = new Vector3();
  for (const support of PAW_SUPPORT_PROBES) {
    probe.copy(support.point).applyMatrix4(target[support.bone]);
    supportY = Math.min(supportY, probe.y + runtime.airHeight);
  }
  const correction = Math.max(0, -supportY);
  if (correction > 1e-7) {
    const lift = new Matrix4().makeTranslation(0, correction, 0);
    for (const matrix of target) {
      matrix.premultiply(lift);
    }
  }
}
