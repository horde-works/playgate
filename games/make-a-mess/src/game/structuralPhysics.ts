export type StructuralVector3 = readonly [x: number, y: number, z: number];

export interface StructuralPieceDefinition<Material extends string> {
  readonly id: string;
  readonly material: Material;
  readonly position: StructuralVector3;
  readonly size: StructuralVector3;
}

export interface StructuralMaterialProfile {
  readonly density: number;
  readonly compressionStrength: number;
  readonly cantilever: number;
  readonly maximumVerticalGap: number;
  readonly foundation?: boolean;
  readonly carriesAttachments?: boolean;
  readonly sideAttachmentReach?: number;
}

export interface StructuralSolver {
  resolve(broken: ReadonlySet<string>): ReadonlySet<string>;
}

type HorizontalAxis = 0 | 2;
type ContactInterval = readonly [minimum: number, maximum: number];

interface StableStructure {
  readonly stable: ReadonlySet<string>;
  readonly supportsByPiece: ReadonlyMap<string, readonly string[]>;
}

const CONTACT_TOLERANCE = 0.055;
const MINIMUM_VERTICAL_ORDER = 0.11;
const SAME_LEVEL_TOLERANCE = 0.1;
const MAXIMUM_OVERLOAD_PASSES = 8;

function lowerBound<Material extends string>(
  piece: StructuralPieceDefinition<Material>,
  axis: 0 | 1 | 2,
): number {
  return piece.position[axis] - piece.size[axis] / 2;
}

function upperBound<Material extends string>(
  piece: StructuralPieceDefinition<Material>,
  axis: 0 | 1 | 2,
): number {
  return piece.position[axis] + piece.size[axis] / 2;
}

function intervalOverlap<Material extends string>(
  left: StructuralPieceDefinition<Material>,
  right: StructuralPieceDefinition<Material>,
  axis: HorizontalAxis,
): ContactInterval | undefined {
  const minimum = Math.max(lowerBound(left, axis), lowerBound(right, axis));
  const maximum = Math.min(upperBound(left, axis), upperBound(right, axis));

  if (maximum + CONTACT_TOLERANCE < minimum) {
    return undefined;
  }

  return [minimum, maximum];
}

function geometryBearingRank<Material extends string>(
  piece: StructuralPieceDefinition<Material>,
  profile: StructuralMaterialProfile,
): number {
  const horizontalSize = Math.max(piece.size[0], piece.size[2]);
  const columnBonus = piece.size[1] > horizontalSize * 1.15 ? 8 : 0;
  const sectionBonus = Math.min(piece.size[1], 3) * 4;
  const materialBase = Math.log2(Math.max(1, profile.compressionStrength)) * 10;

  return materialBase + columnBonus + sectionBonus;
}

export function createStructuralSolver<Material extends string>(
  pieces: readonly StructuralPieceDefinition<Material>[],
  materialProfiles: Readonly<Record<Material, StructuralMaterialProfile>>,
): StructuralSolver {
  const pieceById = new Map(pieces.map((piece) => [piece.id, piece]));

  const canSitOn = (
    piece: StructuralPieceDefinition<Material>,
    support: StructuralPieceDefinition<Material>,
  ): boolean => {
    if (
      piece.id === support.id ||
      !intervalOverlap(piece, support, 0) ||
      !intervalOverlap(piece, support, 2)
    ) {
      return false;
    }

    const pieceProfile = materialProfiles[piece.material];
    const supportProfile = materialProfiles[support.material];
    const verticalGap = lowerBound(piece, 1) - upperBound(support, 1);
    if (verticalGap > pieceProfile.maximumVerticalGap) {
      return false;
    }

    const centerDifference = piece.position[1] - support.position[1];
    return (
      centerDifference > MINIMUM_VERTICAL_ORDER ||
      (centerDifference > -SAME_LEVEL_TOLERANCE &&
        geometryBearingRank(support, supportProfile) >
          geometryBearingRank(piece, pieceProfile))
    );
  };

  const canAttachToSide = (
    piece: StructuralPieceDefinition<Material>,
    support: StructuralPieceDefinition<Material>,
  ): boolean => {
    const pieceProfile = materialProfiles[piece.material];
    const supportProfile = materialProfiles[support.material];
    const reach = pieceProfile.sideAttachmentReach;
    if (
      reach === undefined ||
      piece.id === support.id ||
      !supportProfile.carriesAttachments
    ) {
      return false;
    }

    // A piece can hang sideways only off something wall-like — noticeably
    // taller than itself. Two thin plates cannot carry each other's weight
    // through an edge weld.
    if (support.size[1] < piece.size[1] * 1.5) {
      return false;
    }

    const verticalOverlap =
      Math.min(upperBound(piece, 1), upperBound(support, 1)) -
      Math.max(lowerBound(piece, 1), lowerBound(support, 1));
    if (verticalOverlap < Math.min(piece.size[1], support.size[1]) * 0.18) {
      return false;
    }

    const gapX = Math.max(
      0,
      Math.abs(piece.position[0] - support.position[0]) -
        (piece.size[0] + support.size[0]) / 2,
    );
    const gapZ = Math.max(
      0,
      Math.abs(piece.position[2] - support.position[2]) -
        (piece.size[2] + support.size[2]) / 2,
    );

    return Math.hypot(gapX, gapZ) <= reach;
  };

  const verticalSupportCandidates = new Map<string, readonly string[]>();
  const sideAttachmentCandidates = new Map<string, readonly string[]>();

  for (const piece of pieces) {
    verticalSupportCandidates.set(
      piece.id,
      pieces
        .filter((candidate) => canSitOn(piece, candidate))
        .map((candidate) => candidate.id),
    );
    sideAttachmentCandidates.set(
      piece.id,
      pieces
        .filter((candidate) => canAttachToSide(piece, candidate))
        .map((candidate) => candidate.id),
    );
  }

  const supportsCenterOfMass = (
    piece: StructuralPieceDefinition<Material>,
    supports: readonly StructuralPieceDefinition<Material>[],
  ): boolean => {
    if (supports.length === 0) {
      return false;
    }

    const allowance = materialProfiles[piece.material].cantilever;

    for (const axis of [0, 2] as const) {
      const contacts = supports
        .map((support) => intervalOverlap(piece, support, axis))
        .filter(
          (contact): contact is ContactInterval => contact !== undefined,
        );
      if (contacts.length === 0) {
        return false;
      }

      const minimum = Math.min(...contacts.map((contact) => contact[0]));
      const maximum = Math.max(...contacts.map((contact) => contact[1]));
      const center = piece.position[axis];
      if (center < minimum - allowance || center > maximum + allowance) {
        return false;
      }
    }

    return true;
  };

  const findStableStructure = (
    broken: ReadonlySet<string>,
  ): StableStructure => {
    const stable = new Set(
      pieces
        .filter(
          (piece) =>
            materialProfiles[piece.material].foundation &&
            !broken.has(piece.id),
        )
        .map((piece) => piece.id),
    );
    const supportsByPiece = new Map<string, readonly string[]>();
    let changed = true;

    while (changed) {
      changed = false;

      for (const piece of pieces) {
        if (broken.has(piece.id) || stable.has(piece.id)) {
          continue;
        }

        const verticalSupports = (
          verticalSupportCandidates.get(piece.id) ?? []
        )
          .filter((id) => stable.has(id))
          .map((id) => pieceById.get(id))
          .filter(
            (
              support,
            ): support is StructuralPieceDefinition<Material> =>
              support !== undefined,
          );

        if (supportsCenterOfMass(piece, verticalSupports)) {
          stable.add(piece.id);
          supportsByPiece.set(
            piece.id,
            verticalSupports.map((support) => support.id),
          );
          changed = true;
          continue;
        }

        const attachedSupports = (
          sideAttachmentCandidates.get(piece.id) ?? []
        ).filter((id) => stable.has(id));
        if (attachedSupports.length > 0) {
          stable.add(piece.id);
          supportsByPiece.set(piece.id, attachedSupports);
          changed = true;
        }
      }
    }

    // Welded side attachments carry load alongside bearing contacts, so a
    // load path never funnels through a single weak member when the piece is
    // also tied into a wall. Resolved after the full stable set is known.
    for (const piece of pieces) {
      if (
        !stable.has(piece.id) ||
        materialProfiles[piece.material].foundation
      ) {
        continue;
      }

      const attached = (sideAttachmentCandidates.get(piece.id) ?? []).filter(
        (id) => stable.has(id),
      );
      if (attached.length === 0) {
        continue;
      }

      const existing = supportsByPiece.get(piece.id) ?? [];
      supportsByPiece.set(piece.id, [...new Set([...existing, ...attached])]);
    }

    return { stable, supportsByPiece };
  };

  const pieceWeight = (
    piece: StructuralPieceDefinition<Material>,
  ): number =>
    piece.size[0] *
    piece.size[1] *
    piece.size[2] *
    materialProfiles[piece.material].density;

  const supportCapacity = (
    piece: StructuralPieceDefinition<Material>,
  ): number => {
    const profile = materialProfiles[piece.material];
    if (profile.foundation) {
      return Number.POSITIVE_INFINITY;
    }

    const horizontalSize = Math.max(piece.size[0], piece.size[2]);
    const columnFactor = piece.size[1] > horizontalSize * 1.15 ? 2 : 1;
    return (
      piece.size[0] * piece.size[2] * profile.compressionStrength * columnFactor
    );
  };

  const findOverloadedPieces = (
    structure: StableStructure,
  ): readonly string[] => {
    const loadByPiece = new Map<string, number>();
    const ordered = pieces
      .filter(
        (piece) =>
          structure.stable.has(piece.id) &&
          !materialProfiles[piece.material].foundation,
      )
      .sort((left, right) => right.position[1] - left.position[1]);

    for (const piece of ordered) {
      const load = (loadByPiece.get(piece.id) ?? 0) + pieceWeight(piece);
      loadByPiece.set(piece.id, load);

      const supports = structure.supportsByPiece.get(piece.id) ?? [];
      if (supports.length === 0) {
        continue;
      }

      const share = load / supports.length;
      for (const supportId of supports) {
        loadByPiece.set(
          supportId,
          (loadByPiece.get(supportId) ?? 0) + share,
        );
      }
    }

    return ordered
      .filter(
        (piece) =>
          (loadByPiece.get(piece.id) ?? 0) > supportCapacity(piece),
      )
      .map((piece) => piece.id);
  };

  return {
    resolve(broken: ReadonlySet<string>): ReadonlySet<string> {
      const next = new Set(broken);
      let structure = findStableStructure(next);

      for (let pass = 0; pass < MAXIMUM_OVERLOAD_PASSES; pass += 1) {
        const overloaded = findOverloadedPieces(structure).filter(
          (id) => !next.has(id),
        );
        if (overloaded.length === 0) {
          break;
        }

        for (const id of overloaded) {
          next.add(id);
        }
        structure = findStableStructure(next);
      }

      for (const piece of pieces) {
        if (!structure.stable.has(piece.id)) {
          next.add(piece.id);
        }
      }

      return next;
    },
  };
}
