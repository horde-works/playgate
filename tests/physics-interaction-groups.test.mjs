import assert from "node:assert/strict";
import test from "node:test";
import {
  ACTOR_ABOARD,
  ACTOR_NORMAL,
  ACTOR_SAFETY_FLOOR,
  DEBRIS_NORMAL,
  DEBRIS_SETTLING,
  VEHICLE_CONTACT_QUERY,
  WORLD_BOUNDARY,
} from "../games/make-a-mess/src/game/physicsInteractionGroups.ts";
import {
  isBelowWorldDisappearDepth,
  worldDisappearY,
} from "../games/make-a-mess/src/game/worldFalloff.ts";

const membership = (groups) => (groups >>> 16) & 0xffff;
const filter = (groups) => groups & 0xffff;
const interacts = (left, right) =>
  (membership(left) & filter(right)) !== 0 &&
  (membership(right) & filter(left)) !== 0;

test("the map edge contains people and debris, not airborne carriers", () => {
  assert.equal(interacts(ACTOR_NORMAL, WORLD_BOUNDARY), true);
  assert.equal(interacts(DEBRIS_NORMAL, WORLD_BOUNDARY), true);
  assert.equal(interacts(ACTOR_ABOARD, WORLD_BOUNDARY), false);
  assert.equal(interacts(VEHICLE_CONTACT_QUERY, WORLD_BOUNDARY), false);
  assert.equal(interacts(VEHICLE_CONTACT_QUERY, DEBRIS_SETTLING), true);
  assert.equal(interacts(VEHICLE_CONTACT_QUERY, DEBRIS_NORMAL), true);

  assert.equal(interacts(ACTOR_NORMAL, ACTOR_SAFETY_FLOOR), true);
  assert.equal(interacts(DEBRIS_NORMAL, ACTOR_SAFETY_FLOOR), false);
  assert.equal(interacts(VEHICLE_CONTACT_QUERY, ACTOR_SAFETY_FLOOR), false);

  // Ordinary scene colliders use Rapier's default all-to-all group.
  assert.equal(interacts(VEHICLE_CONTACT_QUERY, 0xffff_ffff), true);
  assert.equal(interacts(ACTOR_ABOARD, 0xffff_ffff), true);
});

test("falling debris is retired only below the shared fog depth", () => {
  assert.equal(worldDisappearY(-2.2), -12.2);
  assert.equal(isBelowWorldDisappearDepth(-12.19, -2.2), false);
  assert.equal(isBelowWorldDisappearDepth(-12.2, -2.2), true);
  assert.equal(isBelowWorldDisappearDepth(-30, -2.2), true);
});
