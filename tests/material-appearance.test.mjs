import assert from "node:assert/strict";
import test from "node:test";
import {
  materialAnchor,
  materialAnchorWithWeathering,
  materialAppearanceProfiles,
} from "../games/make-a-mess/src/game/materialAppearance.ts";
import { materialRuntimeProfiles } from "../games/make-a-mess/src/game/destructionScene.ts";

test("every physical material has one optical appearance profile", () => {
  assert.deepEqual(
    Object.keys(materialAppearanceProfiles).sort(),
    Object.keys(materialRuntimeProfiles).sort(),
  );

  for (const profile of Object.values(materialAppearanceProfiles)) {
    assert.equal(profile.textureScale > 0, true);
    assert.equal(profile.macroVariation >= 0, true);
    assert.equal(profile.roughnessVariation >= 0, true);
  }
});

test("fragment material coordinates inherit their original body position", () => {
  assert.deepEqual(materialAnchor([12, 3, -8], [0.5, -0.25, 1.5]), [
    12.5,
    2.75,
    -6.5,
  ]);
});

test("moving fragments retain the authored surface weathering", () => {
  assert.deepEqual(
    materialAnchorWithWeathering([12, 3, -8], [0.5, -0.25, 1.5], 0.82),
    [12.5, 2.75, -6.5, 0.82],
  );
});

test("ground surfaces vary more broadly than manufactured steel", () => {
  assert.equal(
    materialAppearanceProfiles.grass.macroVariation >
      materialAppearanceProfiles.steel.macroVariation,
    true,
  );
  assert.equal(materialAppearanceProfiles.wood.directionalGrain, true);
  assert.equal(materialAppearanceProfiles.steel.directionalGrain, true);
});
