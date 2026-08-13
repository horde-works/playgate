import type { ObjectLabPart, ObjectPoint } from "../dutchWindmills/objectModel.ts";
import { addBeam, addJoint, point } from "./creatureObjectHelpers.ts";

export type CreatureRigReference = string;

export type CreatureBoneContract = {
  readonly id: string;
  readonly parent?: string;
  readonly category: "axial" | "head" | "limb" | "wing" | "tail";
  readonly rest: Readonly<Record<CreatureRigReference, ObjectPoint>>;
};

export type CreatureSkeletonContract = {
  readonly id: string;
  readonly rootBone: string;
  readonly bones: readonly CreatureBoneContract[];
  readonly excludedSimulation: readonly string[];
};

export type CreaturePoseContract<PoseId extends string = string> = {
  readonly id: PoseId;
  readonly label: string;
  readonly reference: CreatureRigReference;
  readonly rootTranslation?: ObjectPoint;
  readonly rootRotation?: ObjectPoint;
  readonly boneRotations?: Readonly<Record<string, ObjectPoint>>;
  readonly contactPartIds: readonly string[];
  readonly grounded: boolean;
  readonly phase: "observe" | "ground" | "transition" | "air" | "impact";
  readonly intent: string;
  readonly force: string;
  readonly response: string;
};

export type CreatureRotationMatrix = readonly [
  readonly [number, number, number],
  readonly [number, number, number],
  readonly [number, number, number],
];

export type CreatureRigState = {
  readonly poseId: string;
  readonly reference: CreatureRigReference;
  readonly pivots: Readonly<Record<string, ObjectPoint>>;
  readonly rotations: Readonly<Record<string, CreatureRotationMatrix>>;
};

type PoseDerivativeOptions = {
  readonly skeleton: CreatureSkeletonContract;
  readonly pose: CreaturePoseContract;
  readonly sourceParts: readonly ObjectLabPart[];
  readonly group: string;
  readonly resolvePartBone: (part: ObjectLabPart, reference: CreatureRigReference) => string;
  readonly resolveVertexBone?: (
    part: ObjectLabPart,
    vertex: ObjectPoint,
    vertexIndex: number,
    reference: CreatureRigReference,
  ) => string | undefined;
};

const ZERO = point(0, 0, 0);

function add(a: ObjectPoint, b: ObjectPoint): ObjectPoint {
  return point(a[0] + b[0], a[1] + b[1], a[2] + b[2]);
}

function subtract(a: ObjectPoint, b: ObjectPoint): ObjectPoint {
  return point(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function multiply(a: CreatureRotationMatrix, b: CreatureRotationMatrix): CreatureRotationMatrix {
  return [0, 1, 2].map((row) => [0, 1, 2].map((column) => (
    a[row][0] * b[0][column]
      + a[row][1] * b[1][column]
      + a[row][2] * b[2][column]
  ))) as unknown as CreatureRotationMatrix;
}

function rotate(matrix: CreatureRotationMatrix, vector: ObjectPoint): ObjectPoint {
  return point(
    matrix[0][0] * vector[0] + matrix[0][1] * vector[1] + matrix[0][2] * vector[2],
    matrix[1][0] * vector[0] + matrix[1][1] * vector[1] + matrix[1][2] * vector[2],
    matrix[2][0] * vector[0] + matrix[2][1] * vector[1] + matrix[2][2] * vector[2],
  );
}

// Matches Three.js' default Euler order (XYZ), used by Object Lab boxes.
function eulerMatrix([x, y, z]: ObjectPoint): CreatureRotationMatrix {
  const a = Math.cos(x);
  const b = Math.sin(x);
  const c = Math.cos(y);
  const d = Math.sin(y);
  const e = Math.cos(z);
  const f = Math.sin(z);
  return [
    [c * e, -c * f, d],
    [a * f + b * e * d, a * e - b * f * d, -b * c],
    [b * f - a * e * d, b * e + a * f * d, a * c],
  ];
}

function matrixEuler(matrix: CreatureRotationMatrix): ObjectPoint {
  const y = Math.asin(Math.max(-1, Math.min(1, matrix[0][2])));
  if (Math.abs(matrix[0][2]) < 0.9999999) {
    return point(
      Math.atan2(-matrix[1][2], matrix[2][2]),
      y,
      Math.atan2(-matrix[0][1], matrix[0][0]),
    );
  }
  return point(Math.atan2(matrix[2][1], matrix[1][1]), y, 0);
}

function restPivot(bone: CreatureBoneContract, reference: CreatureRigReference): ObjectPoint {
  const pivot = bone.rest[reference];
  if (!pivot) throw new Error(`${bone.id}: missing rest pivot for ${reference}`);
  return pivot;
}

export function solveCreatureRig(
  skeleton: CreatureSkeletonContract,
  pose: CreaturePoseContract,
): CreatureRigState {
  const byId = new Map(skeleton.bones.map((bone) => [bone.id, bone]));
  const pivots: Record<string, ObjectPoint> = {};
  const rotations: Record<string, CreatureRotationMatrix> = {};
  for (const bone of skeleton.bones) {
    const localRotation = eulerMatrix(pose.boneRotations?.[bone.id] ?? ZERO);
    if (!bone.parent) {
      if (bone.id !== skeleton.rootBone) throw new Error(`${bone.id}: second root bone`);
      pivots[bone.id] = add(restPivot(bone, pose.reference), pose.rootTranslation ?? ZERO);
      rotations[bone.id] = multiply(eulerMatrix(pose.rootRotation ?? ZERO), localRotation);
      continue;
    }
    const parent = byId.get(bone.parent);
    if (!parent || !pivots[parent.id] || !rotations[parent.id]) {
      throw new Error(`${bone.id}: parent ${bone.parent} must precede child`);
    }
    const localOffset = subtract(restPivot(bone, pose.reference), restPivot(parent, pose.reference));
    pivots[bone.id] = add(pivots[parent.id], rotate(rotations[parent.id], localOffset));
    rotations[bone.id] = multiply(rotations[parent.id], localRotation);
  }
  return { poseId: pose.id, reference: pose.reference, pivots, rotations };
}

function transformPoint(
  pointValue: ObjectPoint,
  boneId: string,
  skeleton: CreatureSkeletonContract,
  state: CreatureRigState,
): ObjectPoint {
  const bone = skeleton.bones.find((candidate) => candidate.id === boneId);
  if (!bone) throw new Error(`${state.poseId}: unknown bone ${boneId}`);
  const offset = subtract(pointValue, restPivot(bone, state.reference));
  return add(state.pivots[boneId], rotate(state.rotations[boneId], offset));
}

function transformPart(
  part: ObjectLabPart,
  boneId: string,
  options: PoseDerivativeOptions,
  state: CreatureRigState,
): ObjectLabPart {
  const common = { id: `${options.pose.id}--${part.id}`, group: options.group };
  if (part.kind === "box") {
    const rotation = multiply(state.rotations[boneId], eulerMatrix(part.rotation ?? ZERO));
    return {
      ...part,
      ...common,
      center: transformPoint(part.center, boneId, options.skeleton, state),
      rotation: matrixEuler(rotation),
    };
  }
  if (part.kind === "beam" || part.kind === "cylinder") {
    return {
      ...part,
      ...common,
      from: transformPoint(part.from, boneId, options.skeleton, state),
      to: transformPoint(part.to, boneId, options.skeleton, state),
    };
  }
  const vertices = part.vertices.map((vertex, vertexIndex) => {
    const vertexBone = options.resolveVertexBone?.(
      part,
      vertex,
      vertexIndex,
      state.reference,
    ) ?? boneId;
    return transformPoint(vertex, vertexBone, options.skeleton, state);
  });
  const normals = part.normals?.map((normal) => rotate(state.rotations[boneId], normal));
  return { ...part, ...common, vertices, normals };
}

function translatePart(part: ObjectLabPart, translation: ObjectPoint): ObjectLabPart {
  if (part.kind === "box") return { ...part, center: add(part.center, translation) };
  if (part.kind === "beam" || part.kind === "cylinder") {
    return { ...part, from: add(part.from, translation), to: add(part.to, translation) };
  }
  return { ...part, vertices: part.vertices.map((vertex) => add(vertex, translation)) };
}

function contactBottom(part: ObjectLabPart): number {
  if (part.kind !== "box") throw new Error(`${part.id}: contact must be a box`);
  const rotation = eulerMatrix(part.rotation ?? ZERO);
  const halfY = Math.abs(rotation[1][0]) * part.size[0] / 2
    + Math.abs(rotation[1][1]) * part.size[1] / 2
    + Math.abs(rotation[1][2]) * part.size[2] / 2;
  return part.center[1] - halfY;
}

export function buildCreaturePoseDerivative(options: PoseDerivativeOptions): {
  readonly parts: readonly ObjectLabPart[];
  readonly state: CreatureRigState;
} {
  let state = solveCreatureRig(options.skeleton, options.pose);
  let parts = options.sourceParts.map((part) => transformPart(
    part,
    options.resolvePartBone(part, options.pose.reference),
    options,
    state,
  ));
  if (options.pose.grounded) {
    const contacts = options.pose.contactPartIds.map((id) => {
      const part = parts.find((candidate) => candidate.id === `${options.pose.id}--${id}`);
      if (!part) throw new Error(`${options.pose.id}: missing contact part ${id}`);
      return part;
    });
    const floorCorrection = -Math.min(...contacts.map(contactBottom));
    const translation = point(0, floorCorrection, 0);
    parts = parts.map((part) => translatePart(part, translation));
    state = {
      ...state,
      pivots: Object.fromEntries(Object.entries(state.pivots).map(([id, pivot]) => [id, add(pivot, translation)])),
    };
  }
  return { parts, state };
}

export function buildCreatureRigParts(
  skeleton: CreatureSkeletonContract,
  state: CreatureRigState,
  group: string,
  thickness: number,
): readonly ObjectLabPart[] {
  const parts: ObjectLabPart[] = [];
  const byId = new Map(skeleton.bones.map((bone) => [bone.id, bone]));
  for (const bone of skeleton.bones) {
    addJoint(parts, `${state.poseId}--rig-joint-${bone.id}`, group, "flower-yellow", state.pivots[bone.id], thickness * 1.55);
    if (!bone.parent) continue;
    const parent = byId.get(bone.parent);
    if (!parent) throw new Error(`${bone.id}: missing parent ${bone.parent}`);
    addBeam(
      parts,
      `${state.poseId}--rig-bone-${bone.id}`,
      group,
      "metal",
      state.pivots[parent.id],
      state.pivots[bone.id],
      thickness,
      thickness,
    );
  }
  return parts;
}

export function distance(a: ObjectPoint, b: ObjectPoint): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
