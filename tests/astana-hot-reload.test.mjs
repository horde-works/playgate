import assert from "node:assert/strict";
import test from "node:test";
import {
  collectGroups,
  group,
  resetGroups,
} from "../games/make-a-mess/src/content/scenes/astana/astanaAuthoring.ts";

test("Astana authoring state can be rebuilt cleanly after hot reload", () => {
  resetGroups();
  const stale = group("hmr-probe", "First build", "earth");
  stale.objects.push({ kind: "prefab", id: "old", prefab: "probe", transform: {} });
  assert.equal(collectGroups()[0].objects.length, 1);

  resetGroups();
  const fresh = group("hmr-probe", "Second build", "earth");
  assert.notEqual(fresh, stale);
  assert.deepEqual(fresh.objects, []);
  assert.equal(collectGroups().length, 1);

  resetGroups();
});
