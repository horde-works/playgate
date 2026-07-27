import assert from "node:assert/strict";
import test from "node:test";
import {
  ACTOR_ABOARD,
  ACTOR_NORMAL,
  DEBRIS_NORMAL,
  VEHICLE_CONTACT_QUERY,
  WORLD_BOUNDARY,
} from "../games/make-a-mess/src/game/physicsInteractionGroups.ts";

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

  // Ordinary scene colliders use Rapier's default all-to-all group.
  assert.equal(interacts(VEHICLE_CONTACT_QUERY, 0xffff_ffff), true);
  assert.equal(interacts(ACTOR_ABOARD, 0xffff_ffff), true);
});
