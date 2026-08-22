import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { Color } from "three";
import {
  MATERIAL_CLOUD_SHAFT_STEPS,
  airForwardScatterAmount,
  cloudShaftStrengthAmount,
  fogForwardScatterAmount,
  landHazeBand,
  materialAtmosphereGlsl,
  moonForwardScatterAmount,
  registerMaterialAtmosphereShader,
  setMaterialAtmosphere,
  worldHazeCharacter,
  edgeApproachAmount,
} from "../games/make-a-mess/src/game/materialAtmosphere.ts";

test("piece fog carries path-integrated scatter and deck-gap shafts", () => {
  const source = readFileSync(
    new URL("../games/make-a-mess/src/game/materialTextures.ts", import.meta.url),
    "utf8",
  );
  assert.ok(source.includes("materialAtmosphereGlsl"));
  assert.ok(source.includes("materialPathScatter"));
  assert.ok(source.includes("materialScatterRay"));
  assert.ok(source.includes("materialHazeShelf"));
  assert.ok(source.includes("materialLandHaze"));
  assert.ok(source.includes("uMatAirForwardScatter"));
  assert.ok(
    !source.includes("materialFarQuiet"),
    "far quiet erased the haze shelf that separates distant landforms",
  );
  assert.ok(source.includes("matCloudDeckGap"));
  assert.ok(source.includes("registerMaterialAtmosphereShader"));
});

test("atmosphere GLSL shares the deck edge law with the sky", () => {
  const glsl = materialAtmosphereGlsl();
  assert.ok(glsl.includes("matCloudDeckGap"));
  assert.ok(glsl.includes(String(MATERIAL_CLOUD_SHAFT_STEPS)));
  assert.ok(glsl.includes("0.14"));
});

test("twilight scatter fades when the sun is behind cloud", () => {
  assert.ok(fogForwardScatterAmount(1, 0) > fogForwardScatterAmount(1, 0.8));
  assert.equal(fogForwardScatterAmount(0, 0), 0);
});

test("day air scatter peaks under a high sun and fades when occluded", () => {
  const highSun = airForwardScatterAmount(1, 0.82, 0, 0);
  const lowSun = airForwardScatterAmount(1, 0.2, 0, 0);
  const occluded = airForwardScatterAmount(1, 0.82, 0, 0.9);
  assert.ok(highSun > lowSun + 0.02);
  assert.ok(highSun > occluded + 0.01);
  assert.ok(
    airForwardScatterAmount(1, 0.82, 0.8, 0)
      > airForwardScatterAmount(1, 0.82, 0, 0),
  );
});

test("night haze still scatters toward the moon, quieter than day", () => {
  assert.ok(moonForwardScatterAmount(1) > 0.05);
  assert.equal(moonForwardScatterAmount(0), 0);
  const night = airForwardScatterAmount(0, 0, 0, 0, 1);
  const day = airForwardScatterAmount(1, 0.82, 0, 0, 0);
  assert.ok(night > 0.05);
  assert.ok(night < day);
});

test("piece fog keeps shelf density without inventing white luminance", () => {
  const source = readFileSync(
    new URL("../games/make-a-mess/src/game/materialTextures.ts", import.meta.url),
    "utf8",
  );
  assert.ok(source.includes("materialLandHaze"));
  assert.ok(source.includes("materialSkyAlongView"));
  assert.ok(
    !source.includes("mix(1.12, 1.32"),
    "shelf must not multiply sky bake brighter than the air of the hour",
  );
  assert.ok(
    source.includes("materialSkyLum"),
    "shelf tint must ceiling against view-ray sky (dusk photo law)",
  );
});

test("deck shafts need beam strength, lit deck and daylight", () => {
  const lit = new Color(0.5, 0.4, 0.3);
  assert.ok(
    cloudShaftStrengthAmount(0.2, lit, 1, 0.8)
      > cloudShaftStrengthAmount(0, lit, 1, 0.8),
  );
  assert.equal(cloudShaftStrengthAmount(0.2, lit, 0, 0.8), 0);
});

test("land haze band fits inside an island, not continental kilometres", () => {
  const kallur = landHazeBand(118, "kallur");
  assert.ok(kallur.landHazeNear > 50, `near ${kallur.landHazeNear}`);
  assert.ok(kallur.landHazeFar < 180, `far ${kallur.landHazeFar}`);
  assert.ok(kallur.landHazeFar > kallur.landHazeNear + 28);
  assert.ok(kallur.nearHoldEnd < kallur.landHazeFar);
  // ×1.3 shelf: a wall at ~80 m is on the ramp, not already milk.
  const wallT =
    (80 - kallur.landHazeNear) / (kallur.landHazeFar - kallur.landHazeNear);
  assert.ok(wallT > 0.05 && wallT < 0.55, `wall shelf progress ${wallT}`);
  const polder = landHazeBand(79, "dutch-polder");
  assert.ok(polder.landHazeStrength > kallur.landHazeStrength);
  const town = landHazeBand(67, "open-house");
  assert.ok(town.landHazeFar < kallur.landHazeFar);
});

test("world haze character matches the place", () => {
  assert.ok(worldHazeCharacter("dutch-polder").shelfStrength > 1.3);
  assert.ok(worldHazeCharacter("kallur").distanceScale >= 1.25);
  assert.ok(worldHazeCharacter("astana").shelfStrength < 1);
});

test("edge approach rises only near the rim", () => {
  assert.equal(edgeApproachAmount(0, 0, 0, 0, 100), 0);
  assert.ok(edgeApproachAmount(95, 0, 0, 0, 100) > 0.6);
  assert.ok(edgeApproachAmount(100, 0, 0, 0, 100) >= 0.99);
});

test("WorldEnvironment publishes material atmosphere each frame", () => {
  const source = readFileSync(
    new URL("../games/make-a-mess/src/game/WorldEnvironment.tsx", import.meta.url),
    "utf8",
  );
  assert.ok(source.includes("setMaterialAtmosphere("));
  assert.ok(source.includes("airForwardScatterAmount"));
  assert.ok(source.includes("landHazeBand"));
  assert.ok(source.includes("cloudShaftStrengthAmount"));
  assert.ok(
    source.includes("keyLightDirection"),
    "haze Mie must aim at the active key (sun or moon), not geographic sun alone",
  );
});

test("setMaterialAtmosphere updates registered shader uniforms", () => {
  const shader = { uniforms: {} };
  registerMaterialAtmosphereShader(shader);
  setMaterialAtmosphere({
    sunDirection: [0, 1, 0],
    airForwardScatter: 0.42,
    cloudCoverage: 0.5,
  });
  assert.equal(shader.uniforms.uMatAirForwardScatter.value, 0.42);
  assert.equal(shader.uniforms.uMatCloudCoverage.value, 0.5);
});
