import type {
  RigidBody,
  World,
} from "@dimforge/rapier3d-compat";

/**
 * True when one of this body's physical debris shapes still penetrates a
 * different dynamic debris body. Collision masks are intentionally ignored:
 * settling debris excludes siblings, which is exactly the state being tested.
 */
export function debrisBodyHasSiblingOverlap(
  world: World,
  body: RigidBody,
  dynamicBodyHandles: ReadonlySet<number>,
  ignoredColliderGroup: number,
): boolean {
  for (let index = 0; index < body.numColliders(); index += 1) {
    const ownCollider = body.collider(index);
    if (ownCollider.collisionGroups() === ignoredColliderGroup) {
      continue;
    }
    const hit = world.intersectionWithShape(
      ownCollider.translation(),
      ownCollider.rotation(),
      ownCollider.shape,
      undefined,
      undefined,
      ownCollider,
      body,
      (otherCollider) => {
        if (otherCollider.collisionGroups() === ignoredColliderGroup) {
          return false;
        }
        const otherBody = otherCollider.parent();
        return Boolean(
          otherBody &&
            otherBody.handle !== body.handle &&
            dynamicBodyHandles.has(otherBody.handle),
        );
      },
    );
    if (hit) {
      return true;
    }
  }
  return false;
}
