import {
  createStructuralSolver,
  type StructuralMaterialProfile,
  type StructuralPieceDefinition,
  type StructuralVector3,
} from "./structuralPhysics.ts";

export type StructuralQuaternion = readonly [
  x: number,
  y: number,
  z: number,
  w: number,
];

export interface RuntimeStructuralFragment<Material extends string> {
  readonly id: string;
  readonly parentId: string;
  readonly material: Material;
  readonly position: StructuralVector3;
  readonly size: StructuralVector3;
  readonly quaternion?: StructuralQuaternion;
  readonly detached: boolean;
}

export interface RuntimeStructuralResult {
  readonly brokenPieceIds: ReadonlySet<string>;
  readonly detachedFragmentIds: ReadonlySet<string>;
}

export function rotatedBoxAabbSize(
  size: StructuralVector3,
  quaternion: StructuralQuaternion | undefined,
): StructuralVector3 {
  if (!quaternion) {
    return size;
  }

  const [x, y, z, w] = quaternion;
  const xx = x * x;
  const yy = y * y;
  const zz = z * z;
  const xy = x * y;
  const xz = x * z;
  const yz = y * z;
  const wx = w * x;
  const wy = w * y;
  const wz = w * z;
  const matrix = [
    [1 - 2 * (yy + zz), 2 * (xy - wz), 2 * (xz + wy)],
    [2 * (xy + wz), 1 - 2 * (xx + zz), 2 * (yz - wx)],
    [2 * (xz - wy), 2 * (yz + wx), 1 - 2 * (xx + yy)],
  ];

  return [
    Math.abs(matrix[0][0]) * size[0] +
      Math.abs(matrix[0][1]) * size[1] +
      Math.abs(matrix[0][2]) * size[2],
    Math.abs(matrix[1][0]) * size[0] +
      Math.abs(matrix[1][1]) * size[1] +
      Math.abs(matrix[1][2]) * size[2],
    Math.abs(matrix[2][0]) * size[0] +
      Math.abs(matrix[2][1]) * size[1] +
      Math.abs(matrix[2][2]) * size[2],
  ];
}

export function resolveRuntimeStructure<Material extends string>(
  pieces: readonly StructuralPieceDefinition<Material>[],
  materialProfiles: Readonly<Record<Material, StructuralMaterialProfile>>,
  brokenPieceIds: ReadonlySet<string>,
  carvedPieceIds: ReadonlySet<string>,
  fragments: readonly RuntimeStructuralFragment<Material>[],
): RuntimeStructuralResult {
  const activePieces = pieces.filter((piece) => !carvedPieceIds.has(piece.id));
  const activePieceIds = new Set(activePieces.map((piece) => piece.id));
  const activeFragments = fragments.filter(
    (fragment) =>
      !fragment.detached && !brokenPieceIds.has(fragment.parentId),
  );
  const fragmentById = new Map(
    activeFragments.map((fragment) => [fragment.id, fragment]),
  );
  const structuralFragments: StructuralPieceDefinition<Material>[] =
    activeFragments.map((fragment) => ({
      id: fragment.id,
      material: fragment.material,
      position: fragment.position,
      size: rotatedBoxAabbSize(fragment.size, fragment.quaternion),
    }));
  const structuralPieces = [...activePieces, ...structuralFragments];
  const structuralBroken = new Set(
    [...brokenPieceIds].filter((id) => activePieceIds.has(id)),
  );
  const resolved = createStructuralSolver(
    structuralPieces,
    materialProfiles,
  ).resolve(structuralBroken);
  const nextBrokenPieces = new Set(brokenPieceIds);
  const detachedFragmentIds = new Set(
    fragments
      .filter(
        (fragment) =>
          fragment.detached || brokenPieceIds.has(fragment.parentId),
      )
      .map((fragment) => fragment.id),
  );

  for (const id of resolved) {
    if (activePieceIds.has(id)) {
      nextBrokenPieces.add(id);
    } else if (fragmentById.has(id)) {
      detachedFragmentIds.add(id);
    }
  }

  for (const parentId of carvedPieceIds) {
    if (nextBrokenPieces.has(parentId)) {
      continue;
    }

    const hasStableMaterial = fragments.some(
      (fragment) =>
        fragment.parentId === parentId &&
        !detachedFragmentIds.has(fragment.id),
    );
    if (!hasStableMaterial) {
      nextBrokenPieces.add(parentId);
    }
  }

  for (const fragment of fragments) {
    if (nextBrokenPieces.has(fragment.parentId)) {
      detachedFragmentIds.add(fragment.id);
    }
  }

  return {
    brokenPieceIds: nextBrokenPieces,
    detachedFragmentIds,
  };
}
