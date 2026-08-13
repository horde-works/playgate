import assert from "node:assert/strict";
import test from "node:test";
import {
  defineHumanPopulationProfile,
} from "../games/make-a-mess/src/game/humanPopulationProfile.ts";
import { settlementResidentRoles } from "../games/make-a-mess/src/game/settlementPlan.ts";
import { createVillagerPopulation } from "../games/make-a-mess/src/game/villagerSim.ts";
import {
  firstIslandCityHumanProfile,
  humanPopulationProfiles,
  villageHumanProfile,
} from "../games/make-a-mess/src/content/populations/humanPopulationProfiles.ts";

test("only the village and first-island city human profiles are available", () => {
  assert.deepEqual(
    humanPopulationProfiles.map((profile) => profile.id),
    ["village", "first-island-city"],
  );
  for (const profile of humanPopulationProfiles) {
    assert.equal(profile.bodyType, "human");
    assert.equal(profile.species, "human");
    assert.equal(profile.appearance.variants.length > 0, true);
    assert.equal(profile.appearance.wardrobe.dyes.length > 0, true);

    const assigned = [...settlementResidentRoles(profile.settlement)].sort();
    const described = Object.keys(profile.professions).sort();
    assert.deepEqual(described, assigned, `${profile.id}: profession coverage drifted`);
    for (const profession of Object.values(profile.professions)) {
      assert.equal(profession.skills.length > 0, true);
    }
  }
});

test("profession skills, not a village role string, drive special behaviour", () => {
  assert.equal(
    villageHumanProfile.professions.elder.skills.includes("investigate-disturbance"),
    true,
  );
  assert.equal(villageHumanProfile.professions.smith.startleGain, 0.7);
  assert.equal(firstIslandCityHumanProfile.professions.driver.startleGain, 0.8);

  const population = createVillagerPopulation(villageHumanProfile, 34, null);
  const elder = population.villagers.find((villager) => villager.role === "elder");
  assert.ok(elder);
  assert.equal(elder.skills.includes("investigate-disturbance"), true);
  assert.equal(elder.startleGain < 1, true);
});

test("appearance uses its own deterministic stream and cannot move behaviour", () => {
  const alternateAppearance = {
    ...villageHumanProfile,
    appearance: {
      ...villageHumanProfile.appearance,
      variants: [
        { id: "test-look", skin: "#654321", hair: "#123456", weight: 1 },
      ],
    },
  };
  const baseline = createVillagerPopulation(villageHumanProfile, 12, null);
  const changed = createVillagerPopulation(alternateAppearance, 12, null);

  for (let index = 0; index < baseline.villagers.length; index += 1) {
    const before = baseline.villagers[index];
    const after = changed.villagers[index];
    assert.deepEqual(
      {
        id: after.id,
        role: after.role,
        skills: after.skills,
        x: after.x,
        z: after.z,
        build: after.build,
        strideLength: after.strideLength,
        baseSpeed: after.baseSpeed,
        startleGain: after.startleGain,
        seed: after.seed,
      },
      {
        id: before.id,
        role: before.role,
        skills: before.skills,
        x: before.x,
        z: before.z,
        build: before.build,
        strideLength: before.strideLength,
        baseSpeed: before.baseSpeed,
        startleGain: before.startleGain,
        seed: before.seed,
      },
    );
    assert.equal(after.appearanceId, "test-look");
  }
});

test("profiles reject missing and invented professions", () => {
  assert.throws(
    () =>
      defineHumanPopulationProfile({
        ...villageHumanProfile,
        professions: { ...villageHumanProfile.professions, elder: undefined },
      }),
    /resident role elder has no profession/,
  );
  assert.throws(
    () =>
      defineHumanPopulationProfile({
        ...villageHumanProfile,
        professions: {
          ...villageHumanProfile.professions,
          astronaut: { skills: ["spacewalk"] },
        },
      }),
    /profession astronaut has no resident role/,
  );
});
