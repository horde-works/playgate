interface Vector3Like {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

interface ContactManifoldLike {
  numSolverContacts(): number;
  solverContactPoint(index: number): Vector3Like;
  normal(): Vector3Like;
}

interface NarrowPhaseLike {
  contactPairsWith(
    collider: number,
    callback: (other: number) => void,
  ): void;
  contactPair(
    first: number,
    second: number,
    callback: (manifold: ContactManifoldLike) => void,
  ): void;
}

interface ContactBodyLike {
  worldCom(): Vector3Like;
  numColliders(): number;
  collider(index: number): { readonly handle: number };
}

export interface ActivePhysicalContactRegistry {
  /** Record one real collider pair reported by Rapier. */
  enter(ownCollider: number, otherCollider: number): void;
  /** Remove a pair when Rapier reports that its contact ended. */
  exit(ownCollider: number, otherCollider: number): void;
  /** Iterate only pairs which are currently touching the carrier. */
  forEach(callback: (ownCollider: number, otherCollider: number) => void): void;
  size(): number;
  clear(): void;
}

/**
 * Event-driven support ledger for compound carriers.
 *
 * The former runtime path crossed the JS/Wasm boundary once for every
 * collider on every 60 Hz step (more than a thousand calls for the sky ram),
 * even while the vehicle was airborne. Rapier already emits exact pair
 * enter/exit events, so keep only those live pairs. Their current manifold is
 * still checked every step because a persistent contact can rotate from floor
 * to wall without exiting. Cost is therefore O(active contacts), not
 * O(carrier colliders). The full scanner below remains a diagnostic oracle.
 */
export function createActivePhysicalContactRegistry(): ActivePhysicalContactRegistry {
  const activePairs = new Map<string, readonly [number, number]>();
  const pairId = (ownCollider: number, otherCollider: number) =>
    ownCollider < otherCollider
      ? `${ownCollider}:${otherCollider}`
      : `${otherCollider}:${ownCollider}`;
  return {
    enter(ownCollider, otherCollider) {
      activePairs.set(pairId(ownCollider, otherCollider), [
        ownCollider,
        otherCollider,
      ]);
    },
    exit(ownCollider, otherCollider) {
      activePairs.delete(pairId(ownCollider, otherCollider));
    },
    forEach(callback) {
      activePairs.forEach(([ownCollider, otherCollider]) =>
        callback(ownCollider, otherCollider),
      );
    },
    size() {
      return activePairs.size;
    },
    clear() {
      activePairs.clear();
    },
  };
}

/** Count supports by refreshing only manifolds which are currently active. */
export function countActiveUpwardSupportContacts(
  narrowPhase: NarrowPhaseLike,
  body: ContactBodyLike,
  contacts: Pick<ActivePhysicalContactRegistry, "forEach">,
): number {
  const bodyCentre = body.worldCom();
  let supportCount = 0;
  contacts.forEach((ownCollider, otherCollider) => {
    narrowPhase.contactPair(ownCollider, otherCollider, (manifold) => {
      if (manifold.numSolverContacts() === 0) {
        return;
      }
      const point = manifold.solverContactPoint(0);
      const normal = manifold.normal();
      const towardBody =
        normal.x * (bodyCentre.x - point.x) +
        normal.y * (bodyCentre.y - point.y) +
        normal.z * (bodyCentre.z - point.z);
      const normalY = towardBody >= 0 ? normal.y : -normal.y;
      if (normalY > 0.35) {
        supportCount += 1;
      }
    });
  });
  return supportCount;
}

/**
 * Counts real Rapier manifolds whose surface normal carries the body upward.
 * Persistence and low-velocity landing criteria remain policy; this function
 * reports only physical contact and never invents a reaction force.
 */
export function countUpwardSupportContacts(
  narrowPhase: NarrowPhaseLike,
  body: ContactBodyLike,
): number {
  const bodyCentre = body.worldCom();
  const seenPairs = new Set<string>();
  let contacts = 0;
  for (let index = 0; index < body.numColliders(); index += 1) {
    const ownCollider = body.collider(index);
    narrowPhase.contactPairsWith(ownCollider.handle, (otherHandle) => {
      const pairKey = `${ownCollider.handle}:${otherHandle}`;
      if (seenPairs.has(pairKey)) {
        return;
      }
      seenPairs.add(pairKey);
      narrowPhase.contactPair(
        ownCollider.handle,
        otherHandle,
        (manifold) => {
          if (manifold.numSolverContacts() === 0) {
            return;
          }
          const point = manifold.solverContactPoint(0);
          const normal = manifold.normal();
          const towardBody =
            normal.x * (bodyCentre.x - point.x) +
            normal.y * (bodyCentre.y - point.y) +
            normal.z * (bodyCentre.z - point.z);
          const normalY = towardBody >= 0 ? normal.y : -normal.y;
          if (normalY > 0.35) {
            contacts += 1;
          }
        },
      );
    });
  }
  return contacts;
}
