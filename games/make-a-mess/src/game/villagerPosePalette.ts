import {
  DataTexture,
  FloatType,
  Matrix4,
  NearestFilter,
  RGBAFormat,
  Vector3,
} from "three";
import { VILLAGER_BODY, VILLAGER_SKELETON, type VillagerBone } from "./villagerBody.ts";
import { solveVillagerPose, type VillagerPoseInput } from "./villagerPose.ts";

export type VillagerRenderBone =
  | VillagerBone
  | "toolAttachment"
  | "spadeAttachment"
  | "carriedAttachment";

export const VILLAGER_RENDER_BONES: readonly VillagerRenderBone[] = [
  ...VILLAGER_SKELETON.map((bone) => bone.name),
  "toolAttachment",
  "spadeAttachment",
  "carriedAttachment",
];

export const VILLAGER_RENDER_BONE_INDEX = Object.fromEntries(
  VILLAGER_RENDER_BONES.map((bone, index) => [bone, index]),
) as Record<VillagerRenderBone, number>;

export interface VillagerPosePalette {
  readonly texture: DataTexture;
  readonly data: Float32Array;
  readonly count: number;
}

const IDENTITY = new Matrix4();
const HIP = new Vector3(0, VILLAGER_BODY.hipY, 0);
const NECK = new Vector3(0, 1.42, 0);
const TOOL_SHOULDER = new Vector3(0, VILLAGER_BODY.shoulderY, 0);
const TOOL_ELBOW = new Vector3(0, VILLAGER_BODY.elbowY, 0);
const CARRY_PIVOT = new Vector3(0, 1.22, 0.41);
const MATRIX_POOL: Matrix4[] = [];
const VECTOR_POOL: Vector3[] = [];
let matrixCursor = 0;
let vectorCursor = 0;

function pooledMatrix(): Matrix4 {
  const matrix = MATRIX_POOL[matrixCursor] ?? new Matrix4();
  MATRIX_POOL[matrixCursor] = matrix;
  matrixCursor += 1;
  return matrix.identity();
}

function pooledVector(x: number, y: number, z: number): Vector3 {
  const vector = VECTOR_POOL[vectorCursor] ?? new Vector3();
  VECTOR_POOL[vectorCursor] = vector;
  vectorCursor += 1;
  return vector.set(x, y, z);
}

function aroundX(angle: number, pivot: Vector3): Matrix4 {
  return pooledMatrix()
    .makeTranslation(pivot.x, pivot.y, pivot.z)
    .multiply(pooledMatrix().makeRotationX(angle))
    .multiply(pooledMatrix().makeTranslation(-pivot.x, -pivot.y, -pivot.z));
}

function aroundChest(pitch: number, yaw: number, pivot: Vector3): Matrix4 {
  return pooledMatrix()
    .makeTranslation(pivot.x, pivot.y, pivot.z)
    .multiply(pooledMatrix().makeRotationY(yaw))
    .multiply(pooledMatrix().makeRotationX(pitch))
    .multiply(pooledMatrix().makeTranslation(-pivot.x, -pivot.y, -pivot.z));
}

function aroundScale(scale: readonly [number, number, number], pivot: Vector3): Matrix4 {
  return pooledMatrix()
    .makeTranslation(pivot.x, pivot.y, pivot.z)
    .multiply(pooledMatrix().makeScale(scale[0], scale[1], scale[2]))
    .multiply(pooledMatrix().makeTranslation(-pivot.x, -pivot.y, -pivot.z));
}

function modifierTranslation(
  pose: ReturnType<typeof solveVillagerPose>,
  group:
    | "body"
    | "thigh"
    | "shin"
    | "foot"
    | "head"
    | "upperArm"
    | "forearm"
    | "tool",
  side: number,
): Matrix4 {
  let x = 0;
  let y = 0;
  let z = 0;

  if (pose.alarm > 0) {
    const sink = 0.085 * pose.alarm;
    if (group === "shin") y -= sink * 0.21;
    else if (group === "thigh") {
      y -= sink * 0.52;
      z += 0.02 * pose.alarm;
    } else if (group === "head") {
      y -= sink + 0.05 * pose.alarm;
      z -= 0.03 * pose.alarm;
    } else if (group === "upperArm" || group === "forearm" || group === "tool") {
      y -= sink - 0.032 * pose.alarm;
      x -= side * 0.04 * pose.alarm;
      z += 0.05 * pose.alarm;
    } else if (group !== "foot") {
      y -= sink;
      z += 0.03 * pose.alarm;
    }
  }

  if (pose.watch > 0) {
    if (group === "shin") y -= 0.008 * pose.watch;
    else if (group === "thigh") {
      y -= 0.019 * pose.watch;
      z += 0.012 * pose.watch;
    } else if (group === "head") {
      y -= 0.03 * pose.watch;
      z += 0.035 * pose.watch;
    } else if (group === "upperArm" || group === "forearm" || group === "tool") {
      y -= 0.022 * pose.watch;
      x -= side * 0.016 * pose.watch;
      z += 0.028 * pose.watch;
    } else if (group !== "foot") {
      y -= 0.036 * pose.watch;
      z += 0.024 * pose.watch;
    }
  }

  if (pose.duck > 0) {
    const drop = 0.13 * pose.duck;
    if (group === "shin") y -= drop * 0.22;
    else if (group === "thigh") {
      y -= drop * 0.55;
      z += 0.03 * pose.duck;
    } else if (group === "head") {
      y -= drop + 0.035 * pose.duck;
      z += 0.075 * pose.duck;
    } else if (group === "upperArm" || group === "forearm") {
      y -= drop - 0.2 * pose.duck * (group === "forearm" ? 1 : 0.55);
      x -= side * 0.05 * pose.duck;
      z += 0.12 * pose.duck * 0.5;
    } else if (group === "tool") {
      y -= drop;
      z += 0.05 * pose.duck;
    } else if (group !== "foot") {
      y -= drop;
      z += 0.07 * pose.duck;
    }
  }

  return pooledMatrix().makeTranslation(x, y, z);
}

function commonBodyTransform(
  pose: ReturnType<typeof solveVillagerPose>,
  local: Matrix4,
  group: Parameters<typeof modifierTranslation>[1],
  side: number,
): Matrix4 {
  const leg = group === "thigh" || group === "shin" || group === "foot";
  const bob = pooledMatrix().makeTranslation(
    leg ? pose.sway * 0.5 : pose.sway,
    leg ? pose.bob * 0.4 : pose.bob,
    0,
  );
  const rest = pooledMatrix()
    .makeTranslation(0, -pose.bodySink, 0)
    .multiply(aroundX(pose.bodyPitch, HIP))
    .multiply(bob)
    .multiply(local);
  return modifierTranslation(pose, group, side).multiply(rest);
}

function writeMatrix(
  palette: VillagerPosePalette,
  instance: number,
  bone: VillagerRenderBone,
  matrix: Matrix4,
): void {
  const offset =
    (instance * VILLAGER_RENDER_BONES.length + VILLAGER_RENDER_BONE_INDEX[bone]) * 16;
  palette.data.set(matrix.elements, offset);
}

/** Lowest point of the rigid boot box after its complete pose transform. */
export function villagerFootSoleY(matrix: Matrix4, side: -1 | 1): number {
  const centerX = side * 0.072;
  let lowest = Number.POSITIVE_INFINITY;
  for (const x of [centerX - 0.075, centerX + 0.075]) {
    for (const y of [0, VILLAGER_BODY.ankleY]) {
      for (const z of [-0.08, 0.18]) {
        const elements = matrix.elements;
        lowest = Math.min(
          lowest,
          elements[1] * x + elements[5] * y + elements[9] * z + elements[13],
        );
      }
    }
  }
  return lowest;
}

function keepLegAboveGround(
  side: -1 | 1,
  thigh: Matrix4,
  shin: Matrix4,
  foot: Matrix4,
): void {
  const penetration = Math.max(0, -villagerFootSoleY(foot, side));
  if (penetration <= 1e-5) return;

  // Correct the whole rigid chain, not the boot alone. This preserves knee
  // and ankle continuity. At a deeply seated pose the raised thigh overlaps
  // the lowered pelvis slightly; it never opens a visible gap or enters soil.
  const correction = pooledMatrix().makeTranslation(0, penetration, 0);
  thigh.premultiply(correction);
  shin.premultiply(correction);
  foot.premultiply(correction);
}

export function createVillagerPosePalette(count: number): VillagerPosePalette {
  const data = new Float32Array(count * VILLAGER_RENDER_BONES.length * 16);
  const texture = new DataTexture(
    data,
    VILLAGER_RENDER_BONES.length * 4,
    count,
    RGBAFormat,
    FloatType,
  );
  texture.minFilter = NearestFilter;
  texture.magFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return { texture, data, count };
}

export function writeVillagerPose(
  palette: VillagerPosePalette,
  instance: number,
  input: VillagerPoseInput,
): void {
  if (instance < 0 || instance >= palette.count) {
    throw new RangeError(`Villager pose index ${instance} is outside palette`);
  }

  matrixCursor = 0;
  vectorCursor = 0;

  const pose = solveVillagerPose(input);
  const sidePose = {
    left: { pose: pose.left, sign: -1 },
    right: { pose: pose.right, sign: 1 },
  } as const;
  const matrices = new Map<VillagerRenderBone, Matrix4>();

  const body = commonBodyTransform(
    pose,
    aroundChest(pose.chestPitch, pose.chestYaw, HIP),
    "body",
    0,
  );
  const head = commonBodyTransform(
    pose,
    aroundChest(pose.headPitch, pose.headYaw, NECK),
    "head",
    0,
  );
  for (const bone of ["root", "pelvis", "lumbar", "chest", "neck"] as const) {
    matrices.set(bone, body);
  }
  matrices.set("head", head);

  for (const side of ["left", "right"] as const) {
    const limb = sidePose[side].pose;
    const sign = sidePose[side].sign;
    const hip = pooledVector(sign * VILLAGER_BODY.hipHalfWidth, VILLAGER_BODY.hipY, 0);
    const knee = pooledVector(sign * 0.088, VILLAGER_BODY.kneeY, 0);
    const ankle = pooledVector(sign * 0.072, VILLAGER_BODY.ankleY, 0);
    const shoulder = pooledVector(sign * 0.255, VILLAGER_BODY.shoulderY, 0);
    const elbow = pooledVector(sign * 0.255, VILLAGER_BODY.elbowY, 0);

    const thighLocal = aroundX(limb.hipX, hip);
    const shinLocal = pooledMatrix().copy(thighLocal).multiply(aroundX(limb.kneeX, knee));
    const footLocal = pooledMatrix().copy(shinLocal).multiply(aroundX(limb.ankleX, ankle));
    const torso = aroundX(pose.chestPitch, HIP);
    const upperLocal = pooledMatrix().copy(torso).multiply(aroundX(limb.shoulderX, shoulder));
    const foreLocal = pooledMatrix().copy(upperLocal).multiply(aroundX(limb.elbowX, elbow));

    const thigh = commonBodyTransform(pose, thighLocal, "thigh", sign);
    const shin = commonBodyTransform(pose, shinLocal, "shin", sign);
    const foot = commonBodyTransform(pose, footLocal, "foot", sign);
    const upper = commonBodyTransform(pose, upperLocal, "upperArm", sign);
    const fore = commonBodyTransform(pose, foreLocal, "forearm", sign);

    keepLegAboveGround(sign, thigh, shin, foot);

    matrices.set(`${side}Thigh`, thigh);
    matrices.set(`${side}Shin`, shin);
    matrices.set(`${side}Foot`, foot);
    matrices.set(`${side}Toe`, foot);
    matrices.set(`${side}Scapula`, upper);
    matrices.set(`${side}UpperArm`, upper);
    matrices.set(`${side}Forearm`, fore);
    matrices.set(`${side}Hand`, fore);
  }

  const toolLocal = aroundX(pose.chestPitch, HIP)
    .multiply(aroundX(pose.right.shoulderX, TOOL_SHOULDER))
    .multiply(aroundX(pose.right.elbowX, TOOL_ELBOW));
  const toolShape: readonly [number, number, number] =
    input.handKind === 5 ? [1, 0.62, 1] : [1, 1, 1];
  const showTool = input.handKind === 1 || input.handKind === 5;
  const showSpade = input.handKind === 6;
  matrices.set(
    "toolAttachment",
    commonBodyTransform(
      pose,
      aroundScale(showTool ? toolShape : [0, 0, 0], TOOL_SHOULDER).multiply(toolLocal),
      "tool",
      0,
    ),
  );
  matrices.set(
    "spadeAttachment",
    commonBodyTransform(
      pose,
      aroundScale(showSpade ? [1, 1, 1] : [0, 0, 0], TOOL_SHOULDER).multiply(toolLocal),
      "tool",
      0,
    ),
  );

  const carryDrop = Math.min(1, Math.max(0, input.carryRaw - 1));
  let carryScale: readonly [number, number, number] = [1, 1, 1];
  if (input.handKind === 2) carryScale = [3.4, 0.5, 0.55];
  else if (input.handKind === 3) carryScale = [1.45, 0.72, 0.85];
  else if (input.handKind >= 4) carryScale = [0.62, 0.92, 0.62];
  if (input.carryRaw < 0.5) carryScale = [0, 0, 0];
  carryScale = [carryScale[0] * 1.18, carryScale[1], carryScale[2]];

  const leftWrist = pooledVector(-0.255, VILLAGER_BODY.wristY, 0.01).applyMatrix4(
    matrices.get("leftForearm") ?? IDENTITY,
  );
  const rightWrist = pooledVector(0.255, VILLAGER_BODY.wristY, 0.01).applyMatrix4(
    matrices.get("rightForearm") ?? IDENTITY,
  );
  const carryCenter = pooledVector(
    (leftWrist.x + rightWrist.x) * 0.5,
    (leftWrist.y + rightWrist.y) * 0.5 -
      carryDrop * 1.06 -
      (input.handKind >= 4 ? 0.16 : 0),
    (leftWrist.z + rightWrist.z) * 0.5 + carryDrop * 0.16,
  );
  const carried = pooledMatrix()
    .makeTranslation(
      carryCenter.x - CARRY_PIVOT.x,
      carryCenter.y - CARRY_PIVOT.y,
      carryCenter.z - CARRY_PIVOT.z,
    )
    .multiply(aroundScale(carryScale, CARRY_PIVOT));
  matrices.set("carriedAttachment", carried);

  for (const bone of VILLAGER_RENDER_BONES) {
    writeMatrix(palette, instance, bone, matrices.get(bone) ?? IDENTITY);
  }
}
