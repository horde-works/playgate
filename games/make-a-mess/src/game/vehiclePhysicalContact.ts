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
