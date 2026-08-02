import assert from "node:assert/strict";
import test from "node:test";
import {
  BLOOM_THRESHOLD,
  EXPLOSION_FIRE_RAMP,
  EXPLOSION_LIGHT,
  EXPLOSION_POOL_CAPACITY,
  FIREBALL_CARVE_AMPLITUDE,
  LOBE_TIP_LIMIT,
  SECONDARY_COUNTS,
  computeBlastSurface,
  lobeStretch,
  planExplosionSecondaries,
  planFireball,
  selectFireballLobes,
} from "../games/make-a-mess/src/game/explosionFxModel.ts";

// Probe layout mirrors the visual-lobe sampling in MakeAMessGame: a golden
// spiral over the sphere, weight ≈ transmission along that direction.
function probeLobes(count, weightFor) {
  const lobes = [];
  for (let index = 0; index < count; index += 1) {
    const sample = (index + 0.5) / count;
    const y = 1 - sample * 2;
    const radius = Math.sqrt(Math.max(0, 1 - y * y));
    const angle = index * 2.399963229728653;
    const direction = [Math.cos(angle) * radius, y, Math.sin(angle) * radius];
    const weight = weightFor(direction);
    lobes.push({ direction, weight, delay: (1 - Math.min(1, weight)) * 0.11 });
  }
  return lobes;
}

const openAir = probeLobes(18, () => 0.98);
const groundBurst = probeLobes(18, (direction) =>
  direction[1] < -0.05 ? 0.015 : 0.98,
);
const facadeBurst = probeLobes(18, (direction) =>
  direction[0] > 0.1 ? 0.015 : 0.98,
);

function definitionWith(lobes, kind = "rocket") {
  return {
    id: 7,
    kind,
    position: [0, 1, 0],
    lobes,
    dustColor: [0.46, 0.4, 0.33],
  };
}

test("lobes escape the core: travel at least 1.8x their radius", () => {
  for (const seed of [0.6, 4.3, 11.7]) {
    const lobes = selectFireballLobes(openAir, seed);
    assert.ok(lobes.length >= 5, `open blast selected ${lobes.length} lobes`);
    for (const lobe of lobes) {
      const ratio = lobe.travel / lobe.radius;
      assert.ok(
        ratio >= 1.8,
        `lobe travel/radius ${ratio.toFixed(2)} reads as a bumpy sphere`,
      );
    }
  }
});

test("fully stretched, fully carved lobe tips stay inside the raymarch box", () => {
  for (const seed of [0.6, 4.3, 11.7, 29.1]) {
    for (const lobes of [openAir, groundBurst, facadeBurst]) {
      for (const lobe of selectFireballLobes(lobes, seed)) {
        const tip =
          lobe.travel +
          lobe.radius * lobeStretch(lobe.shape) * (1 + FIREBALL_CARVE_AMPLITUDE);
        assert.ok(
          tip <= LOBE_TIP_LIMIT + 1e-6,
          `lobe tip ${tip.toFixed(3)} clips the box face`,
        );
      }
    }
  }
});

test("selected open-air lobes point in genuinely different directions", () => {
  const lobes = selectFireballLobes(openAir, 4.3);
  for (let a = 0; a < lobes.length; a += 1) {
    for (let b = a + 1; b < lobes.length; b += 1) {
      const dot =
        lobes[a].direction[0] * lobes[b].direction[0] +
        lobes[a].direction[1] * lobes[b].direction[1] +
        lobes[a].direction[2] * lobes[b].direction[2];
      assert.ok(dot < 0.8, `lobes ${a}/${b} overlap (dot ${dot.toFixed(2)})`);
    }
  }
});

test("an enclosed blast with few vents keeps its remaining directions", () => {
  const enclosed = probeLobes(18, (direction) =>
    direction[1] > 0.6 ? 0.5 : 0.015,
  );
  const lobes = selectFireballLobes(enclosed, 4.3);
  assert.ok(lobes.length >= 3, `enclosed blast fell back to ${lobes.length}`);
});

test("light plan: a dim flickering ember tail outlives the flash", () => {
  for (const kind of ["grenade", "rocket"]) {
    const plan = EXPLOSION_LIGHT[kind];
    assert.ok(
      plan.emberLife >= plan.life * 2,
      `${kind}: embers must light the dust well past the flash`,
    );
    assert.ok(
      plan.emberFraction >= 0.08 && plan.emberFraction <= 0.2,
      `${kind}: embers glow dimly, not as a second flash`,
    );
  }
});

test("charge reads as a different scale, not a recoloured rocket", () => {
  const rocket = planFireball(definitionWith(openAir, "rocket"), 4.3);
  const charge = planFireball(definitionWith(openAir, "charge"), 4.3);
  const rocketSecondaries = planExplosionSecondaries(
    definitionWith(groundBurst, "rocket"),
    rocket,
    2,
    4.3,
  );
  const chargeSecondaries = planExplosionSecondaries(
    definitionWith(groundBurst, "charge"),
    charge,
    2,
    4.3,
  );
  assert.ok(charge.diameter >= rocket.diameter * 1.65);
  assert.ok(charge.life > rocket.life * 1.3);
  assert.ok(chargeSecondaries.smoke.length > rocketSecondaries.smoke.length * 1.35);
  assert.ok(chargeSecondaries.trail.length > rocketSecondaries.trail.length * 1.25);
});

test("fire ramp punches through the bloom threshold, embers stay below", () => {
  assert.ok(
    Math.max(...EXPLOSION_FIRE_RAMP.whiteHot) >= BLOOM_THRESHOLD * 3,
    "white-hot core will not bloom",
  );
  assert.ok(
    Math.max(...EXPLOSION_FIRE_RAMP.ember) < BLOOM_THRESHOLD,
    "cooling embers must not bloom",
  );
});

test("blocked hemisphere yields a surge surface, open air yields none", () => {
  assert.equal(computeBlastSurface(openAir), null);

  const ground = computeBlastSurface(groundBurst);
  assert.ok(ground, "ground burst produced no surface");
  assert.ok(ground.normal[1] > 0.9, "ground surge normal must point up");
  assert.ok(ground.strength > 0.5, `weak ground surge ${ground.strength}`);

  const facade = computeBlastSurface(facadeBurst);
  assert.ok(facade, "facade burst produced no surface");
  assert.ok(
    facade.normal[0] < -0.85,
    "facade surge normal must point away from the wall",
  );
});

test("aftermath inventory: early, dense, long-lived smoke plus a surge ring", () => {
  const definition = definitionWith(groundBurst, "rocket");
  const plan = planFireball(definition, 4.3);
  const { smoke, trail } = planExplosionSecondaries(definition, plan, 2, 4.3);

  assert.ok(
    smoke.length >= SECONDARY_COUNTS.smoke[2],
    `smoke count ${smoke.length}`,
  );
  assert.ok(smoke.length <= EXPLOSION_POOL_CAPACITY.smoke, "smoke pool overrun");
  // kind 3 renders in the dedicated ribbon pool, the rest as flat billboards.
  const flat = trail.filter((p) => p.kind !== 3);
  const ribbon = trail.filter((p) => p.kind === 3);
  assert.ok(flat.length <= EXPLOSION_POOL_CAPACITY.trail, "trail pool overrun");
  assert.ok(
    ribbon.length <= EXPLOSION_POOL_CAPACITY.ribbon,
    "ribbon pool overrun",
  );

  const firstBirth = Math.min(...smoke.map((p) => p.birthOffset));
  assert.ok(
    firstBirth <= 0.1,
    `first smoke at ${firstBirth.toFixed(3)}s — flame is naked too long`,
  );
  const longestLife = Math.max(...smoke.map((p) => p.life));
  assert.ok(
    longestLife >= 5,
    `aftermath dies at ${longestLife.toFixed(2)}s — must linger for seconds`,
  );

  const surge = smoke.filter((p) => p.kind === 2);
  assert.ok(surge.length >= 20, `surge ring has ${surge.length} packets`);
  for (const packet of surge) {
    assert.ok(
      Math.abs(packet.velocity[1]) <
        Math.hypot(packet.velocity[0], packet.velocity[2]),
      "surge packets must run along the ground, not upward",
    );
  }
});

test("open-air blast spawns no surge ring", () => {
  const definition = definitionWith(openAir, "grenade");
  const plan = planFireball(definition, 0.6);
  const { smoke, trail } = planExplosionSecondaries(definition, plan, 2, 0.6);
  assert.equal(smoke.filter((p) => p.kind === 2).length, 0);
  for (const packet of [...smoke, ...trail]) {
    assert.equal(packet.clampPlane, undefined, "no surface — nothing to clamp");
  }
});

// Smoke has no collision, so the one surface it must respect is the one the
// blast went off against: every packet and thread carries that clamp plane.
test("walled blasts clamp smoke and threads to the birth surface", () => {
  const definition = definitionWith(groundBurst, "rocket");
  const plan = planFireball(definition, 4.3);
  const { smoke, trail } = planExplosionSecondaries(definition, plan, 2, 4.3);

  for (const packet of smoke) {
    assert.ok(packet.clampPlane, "smoke packet without a clamp plane");
    assert.ok(
      packet.clampPlane[1] > 0.9,
      "ground-burst clamp normal must point up",
    );
  }
  const threads = trail.filter((p) => p.kind === 3);
  assert.ok(threads.length > 0);
  for (const thread of threads) {
    assert.ok(thread.clampPlane, "ribbon without a clamp plane");
  }
  // The plane passes just under the charge: dot(n, center) - w is small
  // and positive, so packets start legal and can only be pushed outward.
  const [nx, ny, nz, w] = smoke[0].clampPlane;
  const centerDepth =
    nx * definition.position[0] +
    ny * definition.position[1] +
    nz * definition.position[2] -
    w;
  assert.ok(
    centerDepth > 0 && centerDepth < 0.2,
    `charge sits ${centerDepth.toFixed(3)} in front of its surface plane`,
  );
});

// Contract evolved 2026-08-01: sparks became ballistic RIBBONS (kind 3,
// density = trail window seconds) and cooled fallers pull long smoke threads
// — the filament "hair" of the reference photos.
test("spark ribbons: many fine, fast, long-lived incandescent filaments", () => {
  const definition = definitionWith(groundBurst, "rocket");
  const plan = planFireball(definition, 4.3);
  const { trail } = planExplosionSecondaries(definition, plan, 2, 4.3);

  const sparks = trail.filter((p) => p.kind === 3 && p.heat >= 0.7);
  assert.equal(sparks.length, SECONDARY_COUNTS.sparks[2] + 8);
  for (const spark of sparks) {
    const speed = Math.hypot(...spark.velocity);
    assert.ok(speed >= 16, `spark speed ${speed.toFixed(1)} m/s`);
    assert.ok(
      spark.life >= 0.55 && spark.life <= 1.45,
      `spark life ${spark.life.toFixed(2)}s — must persist long enough to arc`,
    );
    assert.ok(
      spark.density >= 0.14 && spark.density <= 0.32,
      `spark trail window ${spark.density?.toFixed(2)}s`,
    );
    assert.ok(spark.size <= 0.04, "spark filaments must be hair-thin");
  }

  const fallers = trail.filter((p) => p.kind === 3 && p.heat < 0.1);
  assert.equal(fallers.length, SECONDARY_COUNTS.fallers[2] + 4);
  for (const faller of fallers) {
    assert.ok(
      faller.birthOffset >= 0.2,
      "fallers rain out only after the flash",
    );
    assert.ok(
      faller.density >= 0.8,
      `faller thread window ${faller.density?.toFixed(2)}s — threads are long`,
    );
    assert.ok(faller.life >= 1.7, "threads must hang for seconds");
  }

  const fragments = trail.filter((p) => p.kind === 1 && p.heat < 0.7);
  assert.ok(fragments.length >= SECONDARY_COUNTS.fragments[2]);
  for (const fragment of fragments) {
    assert.ok(
      fragment.size >= 0.1,
      `fragment ${fragment.size.toFixed(3)} m is invisible at 10 m`,
    );
  }
});
