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
  readonly volume?: number;
  readonly boxes?: readonly {
    readonly center: StructuralVector3;
    readonly size: StructuralVector3;
  }[];
}

export interface RuntimeStructuralResult {
  readonly brokenPieceIds: ReadonlySet<string>;
  readonly detachedFragmentIds: ReadonlySet<string>;
}

export function fragmentBearingArea<Material extends string>(
  fragment: RuntimeStructuralFragment<Material>,
): number {
  if (!fragment.boxes || fragment.boxes.length === 0) {
    return fragment.size[0] * fragment.size[2];
  }

  const bottom = -fragment.size[1] / 2;
  const tolerance = Math.max(0.025, fragment.size[1] * 0.03);
  const area = fragment.boxes
    .filter(
      (box) =>
        Math.abs(box.center[1] - box.size[1] / 2 - bottom) <=
        tolerance,
    )
    .reduce((total, box) => total + box.size[0] * box.size[2], 0);
  return Math.min(
    fragment.size[0] * fragment.size[2],
    Math.max(0.0001, area),
  );
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

function rotateStructuralVector(
  vector: StructuralVector3,
  quaternion: StructuralQuaternion | undefined,
): StructuralVector3 {
  if (!quaternion) {
    return vector;
  }

  const [x, y, z] = vector;
  const [qx, qy, qz, qw] = quaternion;
  const ix = qw * x + qy * z - qz * y;
  const iy = qw * y + qz * x - qx * z;
  const iz = qw * z + qx * y - qy * x;
  const iw = -qx * x - qy * y - qz * z;
  return [
    ix * qw + iw * -qx + iy * -qz - iz * -qy,
    iy * qw + iw * -qy + iz * -qx - ix * -qz,
    iz * qw + iw * -qz + ix * -qy - iy * -qx,
  ];
}

export function resolveRuntimeStructure<Material extends string>(
  pieces: readonly StructuralPieceDefinition<Material>[],
  materialProfiles: Readonly<Record<Material, StructuralMaterialProfile>>,
  brokenPieceIds: ReadonlySet<string>,
  carvedPieceIds: ReadonlySet<string>,
  fragments: readonly RuntimeStructuralFragment<Material>[],
  scopePieceIds?: ReadonlySet<string>,
): RuntimeStructuralResult {
  const activePieces = pieces.filter(
    (piece) =>
      (scopePieceIds === undefined || scopePieceIds.has(piece.id)) &&
      !carvedPieceIds.has(piece.id),
  );
  const activePieceIds = new Set(activePieces.map((piece) => piece.id));
  const activeFragments = fragments.filter(
    (fragment) =>
      (scopePieceIds === undefined ||
        scopePieceIds.has(fragment.parentId)) &&
      !fragment.detached && !brokenPieceIds.has(fragment.parentId),
  );
  const fragmentById = new Map(
    activeFragments.map((fragment) => [fragment.id, fragment]),
  );
  const structuralFragments: StructuralPieceDefinition<Material>[] =
    activeFragments.map((fragment) => {
      const size = rotatedBoxAabbSize(
        fragment.size,
        fragment.quaternion,
      );
      const bearingFill =
        fragmentBearingArea(fragment) /
        Math.max(1e-6, fragment.size[0] * fragment.size[2]);
      const contactBoxes = fragment.boxes?.map((box) => {
        const offset = rotateStructuralVector(
          box.center,
          fragment.quaternion,
        );
        return {
          position: [
            fragment.position[0] + offset[0],
            fragment.position[1] + offset[1],
            fragment.position[2] + offset[2],
          ] as const,
          size: rotatedBoxAabbSize(box.size, fragment.quaternion),
        };
      });
      return {
        id: fragment.id,
        material: fragment.material,
        position: fragment.position,
        size,
        volume: fragment.volume,
        bearingArea: size[0] * size[2] * bearingFill,
        contactBoxes,
      };
    });
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
