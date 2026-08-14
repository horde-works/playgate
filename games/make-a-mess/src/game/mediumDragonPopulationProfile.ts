export type MediumDragonSkillId =
  | "observe"
  | "ground-roam"
  | "quadrupedal-vault-launch"
  | "powered-flight"
  | "glide-soar"
  | "territory-patrol"
  | "tower-roost"
  | "investigate";

export type MediumDragonPoint = readonly [x: number, y: number, z: number];

export type MediumDragonSurfaceKind =
  | "roost"
  | "launch"
  | "landing"
  | "lookout"
  | "emergency-landing";

export interface MediumDragonSurfaceNode {
  readonly id: string;
  readonly kind: MediumDragonSurfaceKind;
  /** Ground datum under the manus and hind pads, in world metres. */
  readonly position: MediumDragonPoint;
  /** Heading of the folded body in radians; local +Z is the muzzle direction. */
  readonly heading: number;
  readonly usableRadius: number;
  /** Optional oriented landing footprint for non-circular surfaces. */
  readonly touchdownFootprint?: {
    readonly halfWidth: number;
    readonly rearExtent: number;
    readonly forwardExtent: number;
  };
  /** Destruction removes the affordance when every named support is gone. */
  readonly supportPieceIds: readonly string[];
}

export interface MediumDragonPopulationProfile {
  readonly id: string;
  readonly bodyType: "medium-dragon";
  readonly genus: "Draco";
  readonly species: "Draco pterosauroides";
  readonly phenotype: string;
  readonly skills: readonly MediumDragonSkillId[];
  readonly appearance: {
    readonly skin: `#${string}`;
    readonly skinPlane: `#${string}`;
    readonly belly: `#${string}`;
    readonly membrane: `#${string}`;
    readonly claws: `#${string}`;
    readonly eyes: `#${string}`;
  };
  readonly traits: {
    readonly boldness: number;
    readonly curiosity: number;
    readonly patience: number;
    readonly territoriality: number;
    readonly playfulness: number;
    readonly flightSkill: number;
    readonly routeFamiliarity: number;
  };
  /**
   * World-owned places and airspace. The dragon adapter decides whether to
   * walk, launch, fly, wait or abort; these are not animation rails.
   */
  readonly territory: {
    readonly spawnNodeId: string;
    readonly nodes: readonly MediumDragonSurfaceNode[];
    readonly airspace: {
      readonly centre: MediumDragonPoint;
      readonly patrolRadius: number;
      readonly patrolHeight: number;
      readonly minimumHeight: number;
      readonly maximumHeight: number;
    };
    readonly minimumArrivalReserve: number;
  };
}

const COLOR = /^#[0-9a-f]{6}$/i;

function finitePoint(point: MediumDragonPoint): boolean {
  return point.every((coordinate) => Number.isFinite(coordinate));
}

function unitInterval(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

export function validateMediumDragonPopulationProfile(
  profile: MediumDragonPopulationProfile,
): MediumDragonPopulationProfile {
  if (profile.id.trim().length === 0) {
    throw new Error("Medium dragon profile id is empty");
  }
  if (
    profile.skills.length === 0
    || new Set(profile.skills).size !== profile.skills.length
  ) {
    throw new Error(
      `Medium dragon profile ${profile.id}: skills must be non-empty and unique`,
    );
  }
  for (const [label, color] of Object.entries(profile.appearance)) {
    if (!COLOR.test(color)) {
      throw new Error(
        `Medium dragon profile ${profile.id}: ${label} must be a six-digit hex color`,
      );
    }
  }
  for (const [label, value] of Object.entries(profile.traits)) {
    if (!unitInterval(value)) {
      throw new Error(
        `Medium dragon profile ${profile.id}: trait ${label} must be within 0..1`,
      );
    }
  }
  if (profile.territory.nodes.length < 3) {
    throw new Error(
      `Medium dragon profile ${profile.id}: territory needs at least three surface nodes`,
    );
  }
  const nodeIds = new Set<string>();
  for (const node of profile.territory.nodes) {
    if (node.id.trim().length === 0 || nodeIds.has(node.id)) {
      throw new Error(
        `Medium dragon profile ${profile.id}: surface node ids must be non-empty and unique`,
      );
    }
    nodeIds.add(node.id);
    if (!finitePoint(node.position) || !Number.isFinite(node.heading)) {
      throw new Error(
        `Medium dragon profile ${profile.id}: node ${node.id} has a non-finite pose`,
      );
    }
    if (!Number.isFinite(node.usableRadius) || node.usableRadius < 1.25) {
      throw new Error(
        `Medium dragon profile ${profile.id}: node ${node.id} has no usable landing footprint`,
      );
    }
    if (node.touchdownFootprint) {
      const { halfWidth, rearExtent, forwardExtent } = node.touchdownFootprint;
      if (
        ![halfWidth, rearExtent, forwardExtent].every(Number.isFinite)
        || halfWidth <= 0
        || rearExtent <= 0
        || forwardExtent <= 0
      ) {
        throw new Error(
          `Medium dragon profile ${profile.id}: node ${node.id} has an invalid touchdown footprint`,
        );
      }
    }
    if (node.supportPieceIds.length === 0) {
      throw new Error(
        `Medium dragon profile ${profile.id}: node ${node.id} has no world support`,
      );
    }
  }
  if (!nodeIds.has(profile.territory.spawnNodeId)) {
    throw new Error(
      `Medium dragon profile ${profile.id}: spawn node does not exist`,
    );
  }
  const airspace = profile.territory.airspace;
  if (!finitePoint(airspace.centre)) {
    throw new Error(
      `Medium dragon profile ${profile.id}: airspace centre is non-finite`,
    );
  }
  if (
    airspace.patrolRadius < 20
    || airspace.minimumHeight < 5
    || airspace.patrolHeight <= airspace.minimumHeight
    || airspace.maximumHeight <= airspace.patrolHeight
  ) {
    throw new Error(
      `Medium dragon profile ${profile.id}: airspace envelope is inconsistent`,
    );
  }
  if (!unitInterval(profile.territory.minimumArrivalReserve)) {
    throw new Error(
      `Medium dragon profile ${profile.id}: minimum arrival reserve must be within 0..1`,
    );
  }
  return profile;
}

export function defineMediumDragonPopulationProfile(
  profile: MediumDragonPopulationProfile,
): MediumDragonPopulationProfile {
  return validateMediumDragonPopulationProfile(profile);
}
