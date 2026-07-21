import assert from "node:assert/strict";
import test from "node:test";
import {
  SILICATE_JOINT_EXPANSION,
  hasSilicateJoints,
  silicateJointBand,
  silicateJointTint,
} from "../games/make-a-mess/src/game/silicateJoints.ts";

test("silicate joints belong only to the dark tower masonry", () => {
  assert.equal(
    hasSilicateJoints("minas:dark-tower:wall:x:12", "graphiteStone"),
    true,
  );
  assert.equal(
    hasSilicateJoints("minas:dark-tower:floor:2:1:1", "basalt"),
    true,
  );
  assert.equal(hasSilicateJoints("minas:ridge:east:rock:2:1", "basalt"), false);
  assert.equal(hasSilicateJoints("minas:dark-tower:eye:0", "darkGlass"), false);
});

test("the joint skin closes the authored air gap without swallowing the stone", () => {
  assert.equal(SILICATE_JOINT_EXPANSION > 0.035, true);
  assert.equal(silicateJointBand([1.42, 0.72, 0.72]) > 0.008, true);
  assert.equal(silicateJointBand([4.46, 0.38, 4.56]) < 0.004, true);
});

test("the binder stays close to each block color", () => {
  assert.equal(silicateJointTint("#303437"), "#262b2f");
  assert.equal(silicateJointTint("#45494c"), "#2d3236");
});
