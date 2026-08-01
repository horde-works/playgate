import assert from "node:assert/strict";
import test from "node:test";
import { WorldLightingBake } from "../games/make-a-mess/src/game/worldLightingBake.ts";

const pieces = [
  {
    id: "ground",
    material: "concrete",
    position: [0, 0, 0],
    size: [4, 0.5, 4],
  },
  {
    id: "wall",
    material: "brick",
    position: [0, 1.25, 0],
    size: [2, 2, 0.4],
  },
];

test("world lighting defers initial rays instead of blocking construction", () => {
  const lighting = new WorldLightingBake(pieces);
  assert.equal(lighting.resultFor("ground"), undefined);
  assert.equal(lighting.processPending(Infinity), 2);
  assert.ok(lighting.resultFor("ground"));
  assert.ok(lighting.resultFor("wall"));
});

test("destroyed lighting updates are queued and converge to the final bake", () => {
  const lighting = new WorldLightingBake(pieces);
  lighting.processPending(Infinity);
  lighting.applyHidden(new Set(["wall"]));
  assert.ok(lighting.resultFor("wall"));
  assert.ok(lighting.processPending(Infinity) >= 1);
  assert.equal(lighting.resultFor("wall"), undefined);
  assert.ok(lighting.resultFor("ground"));
});
