import assert from "node:assert/strict";
import test from "node:test";
import {
  explosiveProfile,
  explosiveProfiles,
  blastEnergyAtDistance,
  fractureEnergyByMaterial,
} from "../games/make-a-mess/src/game/destructionRuntime.ts";

const STEEL_CARVE = fractureEnergyByMaterial.steel * 1.15;

/** На какой дальности боеприпас ещё вскрывает стальную деталь. */
function steelReach(kind) {
  const profile = explosiveProfile(kind);
  let reach = 0;
  for (let d = 0; d <= profile.blastRadius; d += 0.01) {
    if (
      blastEnergyAtDistance(d, profile.blastRadius, profile.damageEnergy) >
      STEEL_CARVE
    ) {
      reach = d;
    }
  }
  return reach;
}

function materialReach(kind, material) {
  const profile = explosiveProfile(kind);
  const threshold = fractureEnergyByMaterial[material] * 1.15;
  let reach = 0;
  for (let d = 0; d <= profile.blastRadius; d += 0.01) {
    if (
      blastEnergyAtDistance(d, profile.blastRadius, profile.damageEnergy) >
      threshold
    ) {
      reach = d;
    }
  }
  return reach;
}

test("каждый боеприпас — данные, а не ветка кода", () => {
  for (const [kind, profile] of Object.entries(explosiveProfiles)) {
    assert.equal(profile.kind, kind);
    assert.ok(profile.blastRadius > 0);
    assert.ok(profile.blastPushRadius >= profile.blastRadius);
    assert.ok(profile.damageEnergy > 0);
    assert.ok(profile.projectile.speed > 0);
  }
});

test("игла бьёт по стали заметно ближе тяжёлой ракеты", () => {
  const lance = steelReach("lance");
  const rocket = steelReach("rocket");
  // Тяжёлая накрывает машину целиком (размах гексакоптера 6.2 м),
  // игла — одно кольцо и край соседнего.
  assert.ok(rocket > 6.2, `тяжёлая должна накрывать машину, а даёт ${rocket}`);
  // Кольца гексакоптера разнесены на 2.15 м. Игла обязана уносить СВОЁ
  // кольцо и не доставать до соседнего: два соседних — это потеря стороны,
  // после которой машина физически не держит позу.
  assert.ok(
    lance > 0.7 && lance < 1.4,
    `игла должна вскрывать сталь на 0.7..1.4 м, а даёт ${lance.toFixed(2)}`,
  );
  assert.ok(lance * 2 < 2.15, "игла не должна доставать до соседнего кольца");
});

test("игла быстрее и легче тяжёлой ракеты", () => {
  const lance = explosiveProfile("lance").projectile;
  const rocket = explosiveProfile("rocket").projectile;
  assert.ok(lance.speed > rocket.speed * 1.6, "игла должна быть заметно быстрее");
  assert.ok(lance.density < rocket.density, "игла легче");
  assert.ok(
    explosiveProfile("lance").pressureImpulse <
      explosiveProfile("rocket").pressureImpulse / 2,
    "лёгкая боевая часть толкает соразмерно слабее",
  );
});

test("накладной заряд честно мощнее тяжёлой ракеты", () => {
  const charge = explosiveProfile("charge");
  const rocket = explosiveProfile("rocket");
  assert.equal(charge.blastRadius, rocket.blastRadius * 1.5);
  assert.ok(
    Math.abs(
      charge.damageEnergy / fractureEnergyByMaterial.concrete -
        rocket.damageEnergy / fractureEnergyByMaterial.wood,
    ) < 1e-9,
    "бетон для заряда должен быть тем же, чем дерево является для ракеты",
  );
  assert.ok(charge.carveRadiusMultiplier >= 1.5);
  assert.ok(charge.pressureImpulse > rocket.pressureImpulse * 2.5);
  assert.ok(
    materialReach("charge", "concrete") >=
      materialReach("rocket", "wood") * 1.48,
    "заряд должен сохранять ракетный урон по дереву на полуторном радиусе бетона",
  );
});
