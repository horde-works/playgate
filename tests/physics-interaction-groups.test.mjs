import assert from "node:assert/strict";
import test from "node:test";
import {
  ACTOR_ABOARD,
  ACTOR_NORMAL,
  ACTOR_SAFETY_FLOOR,
  DEBRIS_INSIDE_CARRIER,
  DEBRIS_LEAVING_CARRIER,
  DEBRIS_NORMAL,
  VEHICLE_ATTACHMENT,
  VEHICLE_CARRIER,
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
  assert.equal(interacts(VEHICLE_CONTACT_QUERY, DEBRIS_NORMAL), true);

  assert.equal(interacts(ACTOR_NORMAL, ACTOR_SAFETY_FLOOR), true);
  assert.equal(interacts(DEBRIS_NORMAL, ACTOR_SAFETY_FLOOR), false);
  assert.equal(interacts(VEHICLE_CONTACT_QUERY, ACTOR_SAFETY_FLOOR), false);

  // Ordinary scene colliders use Rapier's default all-to-all group.
  assert.equal(interacts(VEHICLE_CONTACT_QUERY, 0xffff_ffff), true);
  assert.equal(interacts(ACTOR_ABOARD, 0xffff_ffff), true);
});

test("a carrier never collides with its own attached pose bodies", () => {
  assert.equal(interacts(VEHICLE_CARRIER, VEHICLE_ATTACHMENT), false);
  assert.equal(interacts(VEHICLE_CARRIER, VEHICLE_CARRIER), true);
  assert.equal(interacts(VEHICLE_CARRIER, DEBRIS_NORMAL), true);
  assert.equal(interacts(VEHICLE_CARRIER, ACTOR_NORMAL), true);
  assert.equal(interacts(VEHICLE_ATTACHMENT, ACTOR_NORMAL), true);
  assert.equal(interacts(VEHICLE_CONTACT_QUERY, VEHICLE_ATTACHMENT), false);
  assert.equal(interacts(VEHICLE_CARRIER, 0xffff_ffff), true);
  assert.equal(interacts(VEHICLE_ATTACHMENT, 0xffff_ffff), true);
});

// Общей льготы на оседание больше нет: мировой обломок вооружён с рождения и
// с машинами сталкивается сразу. Льгота осталась ровно у куска самой машины —
// он рождается внутри её оболочки.
test("only a machine's own part gets a grace period from its carrier", () => {
  assert.equal(interacts(VEHICLE_CARRIER, DEBRIS_NORMAL), true);
  assert.equal(interacts(VEHICLE_CARRIER, DEBRIS_LEAVING_CARRIER), false);
  assert.equal(interacts(VEHICLE_CARRIER, DEBRIS_INSIDE_CARRIER), false);

  // Всё, кроме носителя, у льготных групп остаётся на месте.
  for (const group of [DEBRIS_LEAVING_CARRIER, DEBRIS_INSIDE_CARRIER]) {
    assert.equal(interacts(group, 0xffff_ffff), true, "world");
    assert.equal(interacts(group, ACTOR_NORMAL), true, "player");
    assert.equal(interacts(group, WORLD_BOUNDARY), true, "map edge");
    assert.equal(interacts(group, VEHICLE_CONTACT_QUERY), true, "sensors");
  }

  // Разница между двумя льготами ровно одна: оседающий кусок ещё и не
  // толкается с собратьями, а запертый в контуре — уже полноценный обломок.
  assert.equal(interacts(DEBRIS_LEAVING_CARRIER, DEBRIS_NORMAL), false);
  assert.equal(interacts(DEBRIS_INSIDE_CARRIER, DEBRIS_NORMAL), true);
  assert.equal(interacts(DEBRIS_INSIDE_CARRIER, DEBRIS_INSIDE_CARRIER), true);
});

test("falling debris is retired only below the shared fog depth", () => {
  assert.equal(worldDisappearY(-2.2), -12.2);
  assert.equal(isBelowWorldDisappearDepth(-12.19, -2.2), false);
  assert.equal(isBelowWorldDisappearDepth(-12.2, -2.2), true);
  assert.equal(isBelowWorldDisappearDepth(-30, -2.2), true);
});
