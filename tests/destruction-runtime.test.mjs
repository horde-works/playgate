import assert from "node:assert/strict";
import test from "node:test";
import { Quaternion, Vector3 } from "three";

import {
  buildShards,
  classifyLandingDamage,
  distanceToOrientedBox,
} from "../games/make-a-mess/src/game/destructionRuntime.ts";

const still = new Vector3();
const identity = new Quaternion();

test("a blast reaches the end of a long board even when its centre is outside", () => {
  assert.equal(
    distanceToOrientedBox(
      new Vector3(),
      [3, 0, 0],
      [6, 0.2, 0.2],
    ),
    0,
  );
  assert.equal(
    distanceToOrientedBox(
      new Vector3(),
      [0, 0, 2],
      [4, 0.2, 0.2],
      [0, Math.PI / 2, 0],
    ) < 1e-6,
    true,
  );
});

test("a blast cross-cuts a long wooden board around the blast point", () => {
  const shards = buildShards(
    {
      id: "long-board",
      material: "wood",
      color: "#805332",
      size: [4.8, 0.18, 0.42],
    },
    "blast",
    new Vector3(),
    identity,
    still,
    still,
    new Vector3(1.15, 0, 0),
    8.5,
    "blast",
  );

  assert.ok(shards);
  assert.equal(shards.length, 4);
  assert.equal(
    shards.every(
      (shard) =>
        shard.size[0] < 4.8 &&
        shard.size[1] > 0.17 &&
        shard.size[2] > 0.4,
    ),
    true,
  );
  assert.equal(
    shards.some((shard) => Math.abs(shard.position[0] - 1.15) < 0.25),
    true,
  );
});

test("a concrete block landing hard splits into heavy chunks, not gravel", () => {
  const shards = buildShards(
    {
      id: "concrete-block",
      material: "concrete",
      color: "#aaa79f",
      size: [0.86, 0.38, 0.42],
    },
    "fall",
    new Vector3(),
    identity,
    still,
    still,
    new Vector3(),
    1.15,
    "fall",
  );

  assert.ok(shards);
  assert.equal(shards.length, 2);
  assert.equal(shards.every((shard) => shard.size[0] > 0.4), true);
});

test("landing damage follows material speed rather than one force spike", () => {
  assert.equal(classifyLandingDamage("concrete", 3.5, 2), "none");
  assert.equal(classifyLandingDamage("concrete", 7.5, 0.3), "chip");
  assert.equal(classifyLandingDamage("concrete", 12.5, 0.3), "shatter");
  assert.equal(classifyLandingDamage("concrete", 14, 0.05), "none");
  assert.equal(classifyLandingDamage("wood", 20, 2), "none");
});
