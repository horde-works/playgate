import assert from "node:assert/strict";
import test from "node:test";
import { kallurTurfStyleAt } from "../games/make-a-mess/src/game/kallurVegetation.ts";
import { kallurLandscapeSampler } from "../games/make-a-mess/src/content/scenes/kallur/kallurLandscapeDocument.ts";
import { KALLUR_PATH } from "../games/make-a-mess/src/content/scenes/kallur/kallurTerrainPlan.ts";

test("kallur turf: blades refuse the cliff face and accept the meadow", () => {
  // The crown's seaward face is far past the walkable gradient.
  assert.equal(kallurTurfStyleAt(26, -88), null, "cliff face must carry no blades");
  const meadow = kallurTurfStyleAt(30, 36);
  assert.ok(meadow, "open turf must carry blades");
  assert.ok(meadow.keep > 0.1);
});

test("kallur turf: the trodden line sheds blades onto its verges", () => {
  // Compare keep on the path centreline against the open ground beside it.
  const [x, , z] = KALLUR_PATH[2];
  const onPath = kallurTurfStyleAt(x, z);
  const offPath = kallurTurfStyleAt(x + 6, z);
  assert.ok(onPath && offPath);
  assert.ok(
    onPath.keep < offPath.keep * 0.45,
    `path keep ${onPath.keep.toFixed(2)} vs verge ${offPath.keep.toFixed(2)}: blades must avoid the walked line`,
  );
});

test("kallur turf: scatter is clumped, not a uniform carpet", () => {
  let minKeep = Infinity;
  let maxKeep = 0;
  for (let x = 16; x <= 52; x += 1.7) {
    for (let z = 24; z <= 52; z += 1.7) {
      const style = kallurTurfStyleAt(x, z);
      if (!style) continue;
      minKeep = Math.min(minKeep, style.keep);
      maxKeep = Math.max(maxKeep, style.keep);
    }
  }
  assert.ok(
    maxKeep - minKeep >= 0.35,
    `keep spread ${(maxKeep - minKeep).toFixed(2)} reads uniform; clumps missing`,
  );
});

test("kallur turf: blades sit on the field and dryness stays in range", () => {
  for (const [x, z] of [[30, 36], [-30, 40], [10, -14]]) {
    const style = kallurTurfStyleAt(x, z);
    if (!style) continue;
    const ground = kallurLandscapeSampler.elevationAt(x, z);
    assert.ok(Math.abs(style.groundY - ground - 0.02) < 1e-9);
    assert.ok(style.dryness >= 0 && style.dryness <= 1);
  }
});
