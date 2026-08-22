import assert from "node:assert/strict";
import test from "node:test";
import {
  KALLUR_CASCADE,
  NATURAL_SURFACE_PROFILES,
  VIKING_HEATH_CASCADE,
  VIKING_GRASS_MICRO,
  VIKING_MUD_MICRO,
  VIKING_MOSS_MICRO,
  kallurCascadeGlsl,
  vikingHeathCascadeGlsl,
} from "../games/make-a-mess/src/content/landscape/naturalSurfaceCascade.ts";

test("natural surface profiles share the carrier law without sharing a look", () => {
  const kallur = NATURAL_SURFACE_PROFILES["kallur-carpet"];
  const viking = NATURAL_SURFACE_PROFILES["viking-heath"];

  assert.equal(kallur.octaves, KALLUR_CASCADE);
  assert.equal(viking.octaves, VIKING_HEATH_CASCADE);
  assert.notDeepEqual(viking.palette, kallur.palette);
  assert.notDeepEqual(viking.octaves, kallur.octaves);
  assert.ok(
    viking.octaves.at(-1).wavelength < 0.03,
    "the Viking cascade must continue below a resolvable blade-sized scale",
  );
  assert.ok(
    viking.octaves[0].amplitude < kallur.octaves[0].amplitude * 0.5,
    "close-cropped heath must stay flatter than the Kallur carpet",
  );
});

test("the Kallur shader does not compile an unconnected Viking profile", () => {
  const glsl = kallurCascadeGlsl();

  assert.doesNotMatch(glsl, /nscViking/);
  assert.match(glsl, /nscFade\(float wavelength, float footprint\)/);
});

test("the Viking surface keeps material structure through the pixel footprint", () => {
  const glsl = vikingHeathCascadeGlsl();

  assert.match(glsl, /nsvHeathCascade/);
  assert.match(glsl, /fibreWarp/);
  assert.match(glsl, /fibreGuide/);
  assert.match(glsl, /fibreCrumb/);
  assert.match(glsl, /fibreCluster/);
  assert.doesNotMatch(glsl, /ridgeA|ridgeB|fibreFrame/);
  assert.match(glsl, /nsvHeathAlbedo/);
  assert.doesNotMatch(glsl, /float patch\b/);
  assert.match(glsl, /nsvMossVelvet/);
  assert.match(glsl, /nsvGrassNap/);
  assert.match(glsl, /nsvMudClose/);
  assert.match(glsl, /grassFrameA/);
  assert.match(glsl, /mudFrameA/);
  assert.doesNotMatch(glsl, /grassAngle|mudAngle/);
  assert.match(glsl, new RegExp(VIKING_MOSS_MICRO.fadeWavelength.toFixed(6)));
  assert.match(glsl, new RegExp(VIKING_GRASS_MICRO.bladeLength.toFixed(6)));
  assert.match(glsl, new RegExp(VIKING_MUD_MICRO.leafCell.toFixed(6)));
  assert.doesNotMatch(glsl, /tire|tyre|wheel/i);
  assert.doesNotMatch(glsl, /mossBlade|mossTuft|InstancedMesh/);
  for (const octave of VIKING_HEATH_CASCADE) {
    assert.match(glsl, new RegExp(octave.wavelength.toFixed(6)));
  }
});
