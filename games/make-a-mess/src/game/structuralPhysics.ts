export type StructuralVector3 = readonly [x: number, y: number, z: number];

export interface StructuralContactBox {
  readonly position: StructuralVector3;
  readonly size: StructuralVector3;
}

export interface StructuralPieceDefinition<Material extends string> {
  readonly id: string;
  readonly material: Material;
  readonly position: StructuralVector3;
  readonly size: StructuralVector3;
  readonly volume?: number;
  readonly bearingArea?: number;
  readonly contactBoxes?: readonly StructuralContactBox[];
}

export interface StructuralMaterialProfile {
  readonly density: number;
  readonly compressionStrength: number;
  readonly cantilever: number;
  readonly maximumVerticalGap: number;
  readonly foundation?: boolean;
  readonly bearsLoad?: boolean;
  readonly carriesAttachments?: boolean;
  readonly sideAttachmentReach?: number;
}

export interface StructuralSolver {
  resolve(broken: ReadonlySet<string>): ReadonlySet<string>;
  connectedPieceIds(seedIds: Iterable<string>): ReadonlySet<string>;
}

type HorizontalAxis = 0 | 2;
type ContactInterval = readonly [minimum: number, maximum: number];

interface BearingContactPatch {
  readonly x: ContactInterval;
  readonly z: ContactInterval;
}

interface StableStructure {
  readonly stable: ReadonlySet<string>;
  readonly supportsByPiece: ReadonlyMap<string, readonly string[]>;
}

const CONTACT_TOLERANCE = 0.055;
const MINIMUM_VERTICAL_ORDER = 0.11;
const SAME_LEVEL_TOLERANCE = 0.1;
const MAXIMUM_OVERLOAD_PASSES = 8;
const SPATIAL_CELL_SIZE = 2.5;
const MAXIMUM_DETAILED_BEARING_OVERLAP = 0.12;

function lowerBound(
  piece: StructuralContactBox,
  axis: 0 | 1 | 2,
): number {
  return piece.position[axis] - piece.size[axis] / 2;
}

function upperBound(
  piece: StructuralContactBox,
  axis: 0 | 1 | 2,
): number {
  return piece.position[axis] + piece.size[axis] / 2;
}

function spatialCellRange(minimum: number, maximum: number): readonly number[] {
  const first = Math.floor(minimum / SPATIAL_CELL_SIZE);
  const last = Math.floor(maximum / SPATIAL_CELL_SIZE);
  const cells: number[] = [];

  for (let cell = first; cell <= last; cell += 1) {
    cells.push(cell);
  }

  return cells;
}

function spatialKey(x: number, y: number, z: number): string {
  return `${x}:${y}:${z}`;
}

function intervalOverlap(
  left: StructuralContactBox,
  right: StructuralContactBox,
  axis: HorizontalAxis,
): ContactInterval | undefined {
  const minimum = Math.max(lowerBound(left, axis), lowerBound(right, axis));
  const maximum = Math.min(upperBound(left, axis), upperBound(right, axis));

  if (maximum + CONTACT_TOLERANCE < minimum) {
    return undefined;
  }

  return [minimum, maximum];
}

function physicalContactBoxes(
  piece: StructuralContactBox & {
    readonly contactBoxes?: readonly StructuralContactBox[];
  },
): readonly StructuralContactBox[] {
  return piece.contactBoxes && piece.contactBoxes.length > 0
    ? piece.contactBoxes
    : [piece];
}

function bearingContactPatches(
  piece: StructuralContactBox & {
    readonly contactBoxes?: readonly StructuralContactBox[];
  },
  support: StructuralContactBox & {
    readonly contactBoxes?: readonly StructuralContactBox[];
  },
  maximumVerticalGap: number,
): readonly BearingContactPatch[] {
  const patches: BearingContactPatch[] = [];
  const usesDetailedGeometry =
    (piece.contactBoxes?.length ?? 0) > 0 ||
    (support.contactBoxes?.length ?? 0) > 0;

  for (const pieceBox of physicalContactBoxes(piece)) {
    for (const supportBox of physicalContactBoxes(support)) {
      const x = intervalOverlap(pieceBox, supportBox, 0);
      const z = intervalOverlap(pieceBox, supportBox, 2);
      if (!x || !z) {
        continue;
      }

      const verticalGap =
        lowerBound(pieceBox, 1) - upperBound(supportBox, 1);
      if (
        verticalGap > maximumVerticalGap ||
        (usesDetailedGeometry &&
          verticalGap < -MAXIMUM_DETAILED_BEARING_OVERLAP)
      ) {
        continue;
      }
      patches.push({ x, z });
    }
  }

  return patches;
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
  const profiles = Object.values(
    materialProfiles,
  ) as StructuralMaterialProfile[];
  const maximumHorizontalReach = Math.max(
    CONTACT_TOLERANCE,
    ...profiles.map((profile) => profile.sideAttachmentReach ?? 0),
  );
  const maximumVerticalReach = Math.max(
    CONTACT_TOLERANCE,
    ...profiles.map((profile) => profile.maximumVerticalGap),
  );
  const spatialBuckets = new Map<string, StructuralPieceDefinition<Material>[]>();

  for (const piece of pieces) {
    const xCells = spatialCellRange(lowerBound(piece, 0), upperBound(piece, 0));
    const yCells = spatialCellRange(lowerBound(piece, 1), upperBound(piece, 1));
    const zCells = spatialCellRange(lowerBound(piece, 2), upperBound(piece, 2));

    for (const x of xCells) {
      for (const y of yCells) {
        for (const z of zCells) {
          const key = spatialKey(x, y, z);
          const bucket = spatialBuckets.get(key);
          if (bucket) {
            bucket.push(piece);
          } else {
            spatialBuckets.set(key, [piece]);
          }
        }
      }
    }
  }

  const nearbyPieces = (
    piece: StructuralPieceDefinition<Material>,
  ): readonly StructuralPieceDefinition<Material>[] => {
    const nearby = new Map<string, StructuralPieceDefinition<Material>>();
    const xCells = spatialCellRange(
      lowerBound(piece, 0) - maximumHorizontalReach,
      upperBound(piece, 0) + maximumHorizontalReach,
    );
    const yCells = spatialCellRange(
      lowerBound(piece, 1) - maximumVerticalReach,
      upperBound(piece, 1) + maximumVerticalReach,
    );
    const zCells = spatialCellRange(
      lowerBound(piece, 2) - maximumHorizontalReach,
      upperBound(piece, 2) + maximumHorizontalReach,
    );

    for (const x of xCells) {
      for (const y of yCells) {
        for (const z of zCells) {
          for (const candidate of spatialBuckets.get(spatialKey(x, y, z)) ?? []) {
            nearby.set(candidate.id, candidate);
          }
        }
      }
    }

    return [...nearby.values()];
  };

  const canSitOn = (
    piece: StructuralPieceDefinition<Material>,
    support: StructuralPieceDefinition<Material>,
  ): boolean => {
    if (piece.id === support.id) {
      return false;
    }

    const pieceProfile = materialProfiles[piece.material];
    const supportProfile = materialProfiles[support.material];
    if (supportProfile.bearsLoad === false) {
      return false;
    }
    if (
      bearingContactPatches(
        piece,
        support,
        pieceProfile.maximumVerticalGap,
      ).length === 0
    ) {
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

    for (const pieceBox of physicalContactBoxes(piece)) {
      for (const supportBox of physicalContactBoxes(support)) {
        const verticalOverlap =
          Math.min(upperBound(pieceBox, 1), upperBound(supportBox, 1)) -
          Math.max(lowerBound(pieceBox, 1), lowerBound(supportBox, 1));
        if (
          verticalOverlap <
          Math.min(pieceBox.size[1], supportBox.size[1]) * 0.18
        ) {
          continue;
        }

        const gapX = Math.max(
          0,
          Math.abs(pieceBox.position[0] - supportBox.position[0]) -
            (pieceBox.size[0] + supportBox.size[0]) / 2,
        );
        const gapZ = Math.max(
          0,
          Math.abs(pieceBox.position[2] - supportBox.position[2]) -
            (pieceBox.size[2] + supportBox.size[2]) / 2,
        );
        if (Math.hypot(gapX, gapZ) <= reach) {
          return true;
        }
      }
    }

    return false;
  };

  const verticalSupportCandidates = new Map<string, readonly string[]>();
  const sideAttachmentCandidates = new Map<string, readonly string[]>();

  for (const piece of pieces) {
    const candidates = nearbyPieces(piece);
    verticalSupportCandidates.set(
      piece.id,
      candidates
        .filter((candidate) => canSitOn(piece, candidate))
        .map((candidate) => candidate.id),
    );
    sideAttachmentCandidates.set(
      piece.id,
      candidates
        .filter((candidate) => canAttachToSide(piece, candidate))
        .map((candidate) => candidate.id),
    );
  }

  const structuralNeighbors = new Map<string, Set<string>>(
    pieces.map((piece) => [piece.id, new Set<string>()]),
  );
  for (const piece of pieces) {
    const neighbors = [
      ...(verticalSupportCandidates.get(piece.id) ?? []),
      ...(sideAttachmentCandidates.get(piece.id) ?? []),
    ];
    for (const neighborId of neighbors) {
      structuralNeighbors.get(piece.id)?.add(neighborId);
      structuralNeighbors.get(neighborId)?.add(piece.id);
    }
  }

  // Foundations are stable roots, not structural bridges. Two buildings may
  // touch the same continuous terrain without becoming one recalculation
  // island. Non-foundation load paths form the islands; the exact foundation
  // cells beneath each island are then attached to it.
  const componentIdsByPieceId = new Map<string, Set<number>>();
  const componentPieceIds = new Map<number, Set<string>>();
  let nextComponentId = 0;
  for (const piece of pieces) {
    if (
      materialProfiles[piece.material].foundation ||
      componentIdsByPieceId.has(piece.id)
    ) {
      continue;
    }

    const componentId = nextComponentId;
    nextComponentId += 1;
    const members = new Set<string>();
    const pending = [piece.id];
    componentIdsByPieceId.set(piece.id, new Set([componentId]));

    while (pending.length > 0) {
      const currentId = pending.pop();
      if (!currentId) {
        continue;
      }
      members.add(currentId);
      for (const neighborId of structuralNeighbors.get(currentId) ?? []) {
        const neighbor = pieceById.get(neighborId);
        if (
          !neighbor ||
          materialProfiles[neighbor.material].foundation ||
          componentIdsByPieceId.has(neighborId)
        ) {
          continue;
        }
        componentIdsByPieceId.set(neighborId, new Set([componentId]));
        pending.push(neighborId);
      }
    }
    componentPieceIds.set(componentId, members);
  }

  for (const piece of pieces) {
    if (!materialProfiles[piece.material].foundation) {
      continue;
    }

    const adjacentComponentIds = new Set<number>();
    for (const neighborId of structuralNeighbors.get(piece.id) ?? []) {
      for (const componentId of componentIdsByPieceId.get(neighborId) ?? []) {
        adjacentComponentIds.add(componentId);
      }
    }

    if (adjacentComponentIds.size === 0) {
      const componentId = nextComponentId;
      nextComponentId += 1;
      adjacentComponentIds.add(componentId);
      componentPieceIds.set(componentId, new Set());
    }

    componentIdsByPieceId.set(piece.id, adjacentComponentIds);
    for (const componentId of adjacentComponentIds) {
      componentPieceIds.get(componentId)?.add(piece.id);
    }
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
        .flatMap((support) =>
          bearingContactPatches(
            piece,
            support,
            materialProfiles[piece.material].maximumVerticalGap,
          ).map((patch) => patch[axis === 0 ? "x" : "z"]),
        );
      if (contacts.length === 0) {
        return false;
      }

      const minimum = Math.min(...contacts.map((contact) => contact[0]));
      const maximum = Math.max(...contacts.map((contact) => contact[1]));
      const center = piece.position[axis];
      // A moment connection is only as strong as its bearing patch: a plate
      // embedded 15+cm into a wall keeps its full cantilever, while a seat
      // balancing on a single slender leg gets almost none and tips over.
      const hullWidth = Math.max(0, maximum - minimum);
      const effectiveAllowance =
        allowance * Math.min(1, hullWidth / 0.15);
      if (
        center < minimum - effectiveAllowance ||
        center > maximum + effectiveAllowance
      ) {
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
    const supportDepthByPiece = new Map<string, number>(
      [...stable].map((id) => [id, 0]),
    );
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
          supportDepthByPiece.set(
            piece.id,
            1 +
              Math.min(
                ...verticalSupports.map(
                  (support) => supportDepthByPiece.get(support.id) ?? 0,
                ),
              ),
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
          supportDepthByPiece.set(
            piece.id,
            1 +
              Math.min(
                ...attachedSupports.map(
                  (id) => supportDepthByPiece.get(id) ?? 0,
                ),
              ),
          );
          changed = true;
        }
      }
    }

    // A side tie may share load only toward an already shorter path to the
    // foundation. This keeps useful wall bracing without allowing equal-level
    // pieces to form a self-supporting cycle.
    for (const piece of pieces) {
      const pieceDepth = supportDepthByPiece.get(piece.id);
      if (
        pieceDepth === undefined ||
        materialProfiles[piece.material].foundation
      ) {
        continue;
      }

      const attached = (sideAttachmentCandidates.get(piece.id) ?? []).filter(
        (id) => {
          const supportDepth = supportDepthByPiece.get(id);
          return supportDepth !== undefined && supportDepth < pieceDepth;
        },
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
    (piece.volume ??
      piece.size[0] * piece.size[1] * piece.size[2]) *
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
    const boundingVolume = piece.size[0] * piece.size[1] * piece.size[2];
    const fillFraction = Math.min(
      1,
      (piece.volume ?? boundingVolume) / Math.max(1e-6, boundingVolume),
    );
    return (
      (piece.bearingArea ?? piece.size[0] * piece.size[2]) *
      profile.compressionStrength *
      columnFactor *
      Math.pow(fillFraction, 0.72)
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

      const weightedSupports = supports.map((supportId) => {
        const support = pieceById.get(supportId);
        if (!support) {
          return { supportId, weight: 0 };
        }
        const contactArea = Math.max(
          0.01,
          bearingContactPatches(
            piece,
            support,
            materialProfiles[piece.material].maximumVerticalGap,
          ).reduce(
            (area, patch) =>
              area +
              Math.max(0.01, patch.x[1] - patch.x[0]) *
                Math.max(0.01, patch.z[1] - patch.z[0]),
            0,
          ),
        );
        const fill =
          (support.bearingArea ??
            support.size[0] * support.size[2]) /
          Math.max(1e-6, support.size[0] * support.size[2]);
        return {
          supportId,
          weight: contactArea * Math.max(0.04, Math.min(1, fill)),
        };
      });
      const totalWeight = weightedSupports.reduce(
        (total, support) => total + support.weight,
        0,
      );
      for (const { supportId, weight } of weightedSupports) {
        const share =
          totalWeight > 0
            ? (load * weight) / totalWeight
            : load / supports.length;
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
    connectedPieceIds(seedIds: Iterable<string>): ReadonlySet<string> {
      const componentIds = new Set<number>();
      for (const seedId of seedIds) {
        for (const componentId of componentIdsByPieceId.get(seedId) ?? []) {
          componentIds.add(componentId);
        }
      }

      const connected = new Set<string>();
      for (const componentId of componentIds) {
        for (const pieceId of componentPieceIds.get(componentId) ?? []) {
          connected.add(pieceId);
        }
      }
      return connected;
    },
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
