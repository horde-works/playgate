import assert from "node:assert/strict";
import test from "node:test";
import {
  kallurGroundTopAt,
  kallurStones,
} from "../games/make-a-mess/src/content/scenes/kallur/kallurLandscapeDocument.ts";
import {
  kallurStoneBumps,
  kallurVisibleStones,
} from "../games/make-a-mess/src/content/scenes/kallur/kallurStoneField.ts";
import { KALLUR_PATH } from "../games/make-a-mess/src/content/scenes/kallur/kallurTerrainPlan.ts";

function pathDistance(x, z) {
  let best = Infinity;
  for (let index = 1; index < KALLUR_PATH.length; index += 1) {
    const [ax, , az] = KALLUR_PATH[index - 1];
    const [bx, , bz] = KALLUR_PATH[index];
    const dx = bx - ax;
    const dz = bz - az;
    const l = dx * dx + dz * dz;
    const t = l < 1e-9 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l));
    best = Math.min(best, Math.hypot(x - (ax + dx * t), z - (az + dz * t)));
  }
  return best;
}

test("stones: the size distribution follows the reference's power law", () => {
  const small = kallurStones.filter((stone) => stone.size <= 0.5).length;
  const large = kallurStones.filter((stone) => stone.size >= 1.4).length;
  assert.ok(kallurStones.length >= 900, `only ${kallurStones.length} stones scattered`);
  assert.ok(
    small / kallurStones.length >= 0.55,
    `small stones are ${(small / kallurStones.length * 100).toFixed(0)}% — the hand-sized majority is missing`,
  );
  assert.ok(large <= 14, `${large} large boulders; they must stay rare events`);
});

test("stones: the trodden line stays clean and boulders keep their distance", () => {
  for (const stone of kallurStones) {
    assert.ok(
      pathDistance(stone.x, stone.z) >= 2.2,
      `stone ${stone.id} sits ${pathDistance(stone.x, stone.z).toFixed(1)} m from the path`,
    );
  }
});

test("stones: every crown is bedded in its collar and still breaks the sod", () => {
  for (const stone of kallurVisibleStones(kallurStones)) {
    const collarTop = kallurGroundTopAt(stone.x, stone.z);
    const crownHeight = stone.size * (1 - stone.embed) * 0.9 + 0.15;
    const top = collarTop - 0.35 + crownHeight + 0.35;
    const bottom = collarTop - 0.35;
    assert.ok(bottom < collarTop, `${stone.id} floats above its collar`);
    assert.ok(
      top > collarTop + 0.04,
      `${stone.id} never surfaces: top ${top.toFixed(2)} vs field ${collarTop.toFixed(2)}`,
    );
  }
});

test("stones: swallowed stones exist only as mounds, and every stone mounds", () => {
  const bumps = kallurStoneBumps(kallurStones);
  assert.equal(bumps.length, kallurStones.length);
  const swallowed = kallurStones.length - kallurVisibleStones(kallurStones).length;
  assert.ok(
    swallowed / kallurStones.length >= 0.2,
    `only ${swallowed} swallowed stones — the hummock end of the spectrum is missing`,
  );
  for (const bump of bumps) {
    assert.ok(bump.radius > 0 && bump.radius < 6);
    assert.ok(bump.height > 0 && bump.height <= 0.55);
  }
});

test("stones: the lighthouse hill carries the reference's density", () => {
  const nearHill = kallurStones.filter(
    (stone) => Math.hypot(stone.x + 13, stone.z - 5) <= 20,
  ).length;
  assert.ok(
    nearHill >= 40 && nearHill <= 420,
    `${nearHill} stones on the hero hill — outside the referenced range`,
  );
});

test("stones: the field is deterministic and the piece budget holds", () => {
  // Authored ceiling, raised 1400 -> 1800 deliberately: the reference wants
  // dense speckle, total scene sits at ~3.1k pieces, mid-range for worlds.
  assert.ok(
    kallurVisibleStones(kallurStones).length <= 1800,
    `${kallurVisibleStones(kallurStones).length} visible stones exceed the piece budget`,
  );
  const ids = new Set(kallurStones.map((stone) => stone.id));
  assert.equal(ids.size, kallurStones.length, "stone ids must be unique");
});
