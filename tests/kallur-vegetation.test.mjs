import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  kallurCascadeGlsl,
  kallurCascadeRidgeAt,
  kallurSpikeAt,
  kallurStemClusterAt,
  kallurStrandCarrier,
  KALLUR_NEAR_STEM,
  KALLUR_STRAND_LAW,
} from "../games/make-a-mess/src/content/landscape/naturalSurfaceCascade.ts";
import { kallurTurfStyleAt } from "../games/make-a-mess/src/game/kallurVegetation.ts";
import { kallurLandscapeSampler } from "../games/make-a-mess/src/content/scenes/kallur/kallurLandscapeDocument.ts";
import { KALLUR_PATH } from "../games/make-a-mess/src/content/scenes/kallur/kallurTerrainPlan.ts";

test("kallur turf: strands refuse the cliff face and accept meadow", () => {
  assert.equal(kallurTurfStyleAt(26, -88), null, "cliff face must carry no strands");
  let meadow = 0;
  let crests = 0;
  for (let x = 16; x <= 52; x += 1.4) {
    for (let z = 24; z <= 52; z += 1.4) {
      const style = kallurTurfStyleAt(x, z);
      if (!style) continue;
      meadow += 1;
      if (style.keep > 0.55) crests += 1;
    }
  }
  assert.ok(meadow > 40, `meadow carried too few strands: ${meadow}`);
  assert.ok(crests > 0, "crest keep never rose above 0.55");
});

test("kallur turf: the trodden line sheds strands onto its verges", () => {
  let pathKeep = 0;
  let vergeKeep = 0;
  let pathN = 0;
  let vergeN = 0;
  const offsets = [
    [5, 0],
    [-5, 0],
    [0, 5],
    [0, -5],
    [6, 2],
    [-4, 4],
  ];
  for (const [x, , z] of KALLUR_PATH) {
    const onPath = kallurTurfStyleAt(x, z);
    if (onPath) {
      pathKeep += onPath.keep;
      pathN += 1;
    }
    for (const [dx, dz] of offsets) {
      const offPath = kallurTurfStyleAt(x + dx, z + dz);
      if (!offPath) continue;
      vergeKeep += offPath.keep;
      vergeN += 1;
    }
  }
  assert.ok(vergeN > 3, `verge carried too few locks: ${vergeN}`);
  const pathMean = pathN ? pathKeep / pathN : 0;
  const vergeMean = vergeKeep / vergeN;
  assert.ok(
    pathMean < vergeMean * 0.45,
    `path keep ${pathMean.toFixed(2)} vs verge ${vergeMean.toFixed(2)}: strands must avoid the walked line`,
  );
});

test("kallur turf: keep is higher on cascade ridges than in hollows", () => {
  let hollowKeep = 0;
  let crestKeep = 0;
  let hollowN = 0;
  let crestN = 0;
  for (let x = 16; x <= 52; x += 1.7) {
    for (let z = 24; z <= 52; z += 1.7) {
      const ridge = kallurCascadeRidgeAt(x, z);
      const style = kallurTurfStyleAt(x, z);
      if (!style) continue;
      if (ridge < KALLUR_STRAND_LAW.ridgeStart + 0.08) {
        hollowKeep += style.keep;
        hollowN += 1;
      }
      if (ridge > KALLUR_STRAND_LAW.ridgeEnd) {
        crestKeep += style.keep;
        crestN += 1;
      }
    }
  }
  assert.ok(hollowN > 2, `no hollow locks: ${hollowN}`);
  assert.ok(crestN > 2, `no crest locks: ${crestN}`);
  const hollowMean = hollowKeep / hollowN;
  const crestMean = crestKeep / crestN;
  assert.ok(
    crestMean > hollowMean * 1.25,
    `crest keep ${crestMean.toFixed(2)} vs hollow ${hollowMean.toFixed(2)}: ridges must thicken`,
  );
});

test("kallur turf: strands sit on the field and dryness stays in range", () => {
  let checked = 0;
  for (let x = 18; x <= 48; x += 3) {
    for (let z = 26; z <= 48; z += 3) {
      const style = kallurTurfStyleAt(x, z);
      if (!style) continue;
      const ground = kallurLandscapeSampler.elevationAt(x, z);
      assert.ok(Math.abs(style.groundY - ground - 0.015) < 1e-9);
      assert.ok(style.dryness >= 0 && style.dryness <= 1);
      checked += 1;
    }
  }
  assert.ok(checked > 0, "no meadow strands to check seating");
});

test("kallur near stems live in the cascade band, not a GrassField metre fade", () => {
  const glsl = kallurCascadeGlsl();
  assert.ok(glsl.includes("nscSpike"));
  assert.ok(glsl.includes("nscStemCluster"));
  assert.ok(glsl.includes("511.000000"));
  assert.ok(glsl.includes("512.000000"));
  assert.equal(KALLUR_NEAR_STEM.fadeWavelength, 0.034);
  assert.equal(kallurStrandCarrier(0), 1);
  assert.equal(kallurStrandCarrier(KALLUR_NEAR_STEM.fadeWavelength), 0);
  const mid = kallurStrandCarrier(KALLUR_NEAR_STEM.fadeWavelength * 0.5);
  assert.ok(mid > 0.15 && mid < 0.85, `mid carrier ${mid} should be a blend`);
  let spikes = 0;
  let clusters = 0;
  for (let x = 16; x <= 40; x += 0.7) {
    for (let z = 24; z <= 40; z += 0.7) {
      if (kallurSpikeAt(x, z) > 0.4) spikes += 1;
      if (kallurStemClusterAt(x, z) > 0.4) clusters += 1;
    }
  }
  assert.ok(spikes > 8, `spike hatch never resolved: ${spikes}`);
  assert.ok(clusters > 4, `stem cluster never rose: ${clusters}`);
  assert.equal(KALLUR_STRAND_LAW.instanceCount, 0);
});

test("kallur does not mount a second grass species", () => {
  const source = readFileSync(
    new URL("../games/make-a-mess/src/game/MakeAMessGame.tsx", import.meta.url),
    "utf8",
  );
  assert.equal(
    source.includes('profile="kallur"'),
    false,
    "Kallur near is tile W in the ground cascade; GrassField is a second owner",
  );
});
