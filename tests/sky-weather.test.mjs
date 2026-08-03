import assert from "node:assert/strict";
import test from "node:test";
import { Sky as SkyImpl } from "three-stdlib";
import {
  CLEAR_SKY,
  CLOUD_LAW,
  DUTCH_POLDER_SKY,
  SKY_FIELD_SIZE,
  cloudCoverAt,
  cloudDensityAt,
  cloudDrift,
  cloudEdgeFor,
  cloudMarchLod,
  cloudMarchSteps,
  cloudOpacityAlong,
  cloudReach,
  cloudSelfShadow,
  cloudSilhouetteAt,
  cloudSunEnergy,
  domeCoverage,
  getSkyFieldData,
  sampleCloudField,
  sampleCloudTops,
  shapeCloudField,
  sunOcclusionAt,
} from "../games/make-a-mess/src/game/skyWeatherModel.ts";
import { installSkyClouds } from "../games/make-a-mess/src/game/skyClouds.ts";

const field = getSkyFieldData();

function measureCoverage(coverage, samples = 200) {
  const weather = { ...DUTCH_POLDER_SKY, coverage };
  let covered = 0;
  for (let row = 0; row < samples; row += 1) {
    for (let column = 0; column < samples; column += 1) {
      const x = (column / samples) * 6.7 * weather.fieldScale;
      const z = (row / samples) * 6.7 * weather.fieldScale;
      if (cloudSilhouetteAt(field, weather, x, z, [0, 0]) >= 0.5) covered += 1;
    }
  }
  return covered / (samples * samples);
}

test("the field spans its whole range in every channel", () => {
  assert.equal(field.length, SKY_FIELD_SIZE * SKY_FIELD_SIZE * 4);
  for (const channel of [0, 1, 2, 3]) {
    let low = 255;
    let high = 0;
    for (let index = 0; index < SKY_FIELD_SIZE * SKY_FIELD_SIZE; index += 1) {
      const value = field[index * 4 + channel];
      low = Math.min(low, value);
      high = Math.max(high, value);
    }
    // A threshold on a field bunched around the middle produces a grey ramp
    // over the whole sky instead of heaps with gaps between them.
    assert.equal(low, 0, `channel ${channel} never reaches its floor`);
    assert.equal(high, 255, `channel ${channel} never reaches its ceiling`);
  }
});

test("the field crosses a tile edge without a seam", () => {
  // The field deliberately does NOT repeat with the tile: a rotated second
  // tap breaks the period so an open sky never shows the same cloud twice.
  // What must hold is continuity — a seam would be a hard line drawn across
  // the whole world. So: the step over a tile boundary may be no worse than
  // the roughest step anywhere inside a tile.
  const step = 1 / 1024;
  let interiorWorst = 0;
  for (let sample = 0; sample < 4000; sample += 1) {
    const u = 0.12 + (sample / 4000) * 0.7;
    const v = 0.37 + (sample / 4000) * 0.41;
    interiorWorst = Math.max(interiorWorst, Math.abs(
      sampleCloudField(field, u + step, v, 1) - sampleCloudField(field, u, v, 1),
    ));
  }
  for (let sample = 0; sample < 256; sample += 1) {
    const v = (sample / 256) * 3.3;
    for (const edge of [1, 2, -1]) {
      const across = Math.abs(
        sampleCloudField(field, edge + step * 0.5, v, 1)
          - sampleCloudField(field, edge - step * 0.5, v, 1),
      );
      assert.ok(
        across <= interiorWorst,
        `field steps ${across.toFixed(4)} across tile edge ${edge} at v=${v.toFixed(2)}`,
      );
    }
  }
});

test("coverage means the fraction of the deck's base it says it means", () => {
  // An authoring number that only correlates with cloudiness is a number an
  // author cannot use. Calibrating the threshold against the real field
  // distribution is what makes it an actual measurement.
  for (const requested of [0.2, 0.35, 0.5, 0.7]) {
    const measured = measureCoverage(requested);
    assert.ok(
      Math.abs(measured - requested) < 0.05,
      `asked for ${requested} of the base, measured ${measured.toFixed(3)}`,
    );
  }
});

test("the sky dome reads fuller than the plan, and by how much is known", () => {
  // Coverage is the plan view. Every ray that is not straight up crosses the
  // deck at a slant, so an observer always sees more sky covered than the
  // author asked for — that is geometry, not a bug. What must not happen is
  // the deck reading as overcast: at 0.27 of the base it was covering 0.88 of
  // the sky at 25 degrees of elevation, because it was a slab of uniform
  // depth and a six-step march smeared it along every grazing ray.
  const dome = domeCoverage(field, DUTCH_POLDER_SKY);
  assert.ok(
    dome > DUTCH_POLDER_SKY.coverage,
    `dome ${dome.toFixed(3)} should exceed the plan ${DUTCH_POLDER_SKY.coverage}`,
  );
  assert.ok(
    dome > 0.3 && dome < 0.55,
    `fair-weather cumulus should read 3 to 4 oktas, measured ${dome.toFixed(3)}`,
  );
});

test("the deck is heaps of different depths, not a slab", () => {
  // Every column having the same top is what made the silhouette from below
  // identical to the silhouette from the side: a stamp extruded upward, with
  // no two clouds in the sky a different shape.
  let shallowest = Infinity;
  let deepest = -Infinity;
  for (let row = 0; row < 96; row += 1) {
    for (let column = 0; column < 96; column += 1) {
      const rise = CLOUD_LAW.topFloor + (1 - CLOUD_LAW.topFloor) * sampleCloudTops(
        field,
        (column / 96) * 4 * DUTCH_POLDER_SKY.fieldScale,
        (row / 96) * 4 * DUTCH_POLDER_SKY.fieldScale,
        DUTCH_POLDER_SKY.fieldScale,
      );
      shallowest = Math.min(shallowest, rise);
      deepest = Math.max(deepest, rise);
    }
  }
  assert.ok(
    deepest - shallowest > 0.6,
    `column depths span only ${(deepest - shallowest).toFixed(2)} of the deck`,
  );
});

test("a column narrows with height: a dome, not a prism", () => {
  const weather = DUTCH_POLDER_SKY;
  const edge = cloudEdgeFor(weather.coverage);
  const areaAt = (climb) => {
    let inside = 0;
    let total = 0;
    for (let row = 0; row < 128; row += 1) {
      for (let column = 0; column < 128; column += 1) {
        const x = (column / 128) * 5 * weather.fieldScale;
        const z = (row / 128) * 5 * weather.fieldScale;
        const over = sampleCloudField(field, x, z, weather.fieldScale)
          - edge - CLOUD_LAW.shoulder * climb * climb;
        if (over > CLOUD_LAW.edgeSoftness * 0.5) inside += 1;
        total += 1;
      }
    }
    return inside / total;
  };
  const base = areaAt(0);
  const shoulder = areaAt(0.75);
  assert.ok(
    shoulder < base * 0.7,
    `silhouette barely shrinks: ${base.toFixed(3)} at the base, ${shoulder.toFixed(3)} at 0.75`,
  );
});

test("no step of the march is coarser than the field it reads", () => {
  // Six fixed steps over a path that varies ninefold put more than a
  // kilometre of deck between samples near the horizon, against heaps a
  // hundred metres across. Whatever a step cannot resolve must be filtered
  // away by the mip it reads, not aliased into horizontal ribbons.
  const weather = DUTCH_POLDER_SKY;
  const texel = weather.fieldScale / SKY_FIELD_SIZE;
  for (const degrees of [80, 60, 40, 25, 15, 10, 7, 5, 3]) {
    const dirY = Math.sin((degrees * Math.PI) / 180);
    const through = Math.min(weather.thickness / dirY, cloudReach(weather));
    const [count, stepLength] = cloudMarchSteps(weather, through);
    assert.ok(
      count >= CLOUD_LAW.minSteps && count <= CLOUD_LAW.maxSteps,
      `${degrees} degrees walks ${count} steps`,
    );
    const resolved = texel * 2 ** cloudMarchLod(weather, stepLength);
    // Below three degrees the level clamp binds, and haze has taken 90% of
    // the deck by then; everywhere a cloud is still legible, this holds.
    if (degrees >= 5) {
      assert.ok(
        resolved >= stepLength * 0.98,
        `at ${degrees} degrees a ${stepLength.toFixed(0)} m step reads ${resolved.toFixed(0)} m texels`,
      );
    }
  }
});

test("sunlight inside a cloud never collapses, and never swings fiftyfold", () => {
  // Both halves of the old lighting were broken in the same direction. Beer
  // multiplied by the powder term peaks at 0.385 and falls to zero on either
  // side of it, so no cloud in the sky could be bright. A single raw phase
  // function on top of that made everything more than twenty degrees off the
  // sun a grey stain.
  const fringe = cloudSunEnergy(0.5, -0.6);
  for (const [depth, floor] of [[0, 0.3], [1, 0.2], [2, 0.15], [4, 0.08], [8, 0.04]]) {
    const away = cloudSunEnergy(depth, -0.6);
    assert.ok(
      away > floor,
      `a cloud at depth ${depth} away from the sun reads ${away.toFixed(3)}`,
    );
  }
  // The old law was Beer times powder: it peaked at 0.385 of full light and
  // fell to zero on BOTH sides of that peak, so the interior of a cloud was
  // four thousand times darker than its fringe and read as a flat grey stain.
  assert.ok(
    cloudSunEnergy(8, -0.6) / fringe > 0.04,
    "the middle of a cloud is still going black relative to its fringe",
  );
  for (const depth of [0.5, 1, 2, 4]) {
    const swing = cloudSunEnergy(depth, 0.99) / cloudSunEnergy(depth, -0.6);
    assert.ok(swing < 16, `brightness swings ${swing.toFixed(1)}x across the sky at depth ${depth}`);
    assert.ok(swing > 1.5, `nothing brightens toward the sun at depth ${depth}`);
  }
  assert.ok(
    cloudSunEnergy(0, 1) <= CLOUD_LAW.scatterCeiling,
    "the forward peak is unbounded",
  );
});

test("a heap is modelled by its own depth, not by its local density", () => {
  // Shading that follows only the density at a point makes a dense patch at
  // the top of a cloud exactly as dark as one at its base: a stain with no
  // form. What gives a heap volume is how much of ITSELF stands above the
  // point being lit, and that is geometry the march already knows.
  const weather = DUTCH_POLDER_SKY;
  const sun = Math.sin((40 * Math.PI) / 180);
  const read = (rise, climb, density) => cloudSunEnergy(
    cloudSelfShadow(weather, density, rise * weather.thickness * (1 - climb), sun),
    0,
  );
  const top = read(1, 0.9, 0.9);
  const belly = read(1, 0.05, 0.9);
  assert.ok(
    top / belly > 4,
    `top and belly of one heap differ by only ${(top / belly).toFixed(1)}x`,
  );
  // A shallow puff never had anything above it, so it stays bright all the
  // way down — which is what tells the eye the two are different clouds and
  // not the same stamp at two brightnesses.
  const puff = read(CLOUD_LAW.topFloor, 0.05, 0.9);
  assert.ok(
    puff > belly * 2.5,
    `a shallow puff reads ${puff.toFixed(3)} against a deep belly's ${belly.toFixed(3)}`,
  );
  assert.equal(cloudSelfShadow(weather, 0.9, 0, sun), 0, "a cloud top shadows itself");
});

test("a clear sky costs nothing and covers nothing", () => {
  assert.equal(CLEAR_SKY.coverage, 0);
  assert.equal(shapeCloudField(0.99, 0), 0);
  assert.equal(cloudCoverAt(field, CLEAR_SKY, 12, -40, [0, 0]), 0);
  assert.equal(cloudDensityAt(field, CLEAR_SKY, 0, 1200, 0, [0, 0]), 0);
  assert.equal(
    sunOcclusionAt(field, CLEAR_SKY, 0, 1.7, 0, [0.4, 0.7, 0.5], [0, 0]),
    0,
  );
  assert.ok(!Number.isFinite(cloudEdgeFor(0)));
});

test("the deck drifts along its own wind, at its own speed", () => {
  const [x, z] = cloudDrift(DUTCH_POLDER_SKY, 60);
  assert.ok(
    Math.abs(Math.hypot(x, z) - DUTCH_POLDER_SKY.windSpeed * 60) < 1e-6,
    "drift distance does not match wind speed",
  );
  assert.ok(
    Math.abs(Math.atan2(z, x) - DUTCH_POLDER_SKY.windBearing) < 1e-9,
    "drift bearing does not match the wind",
  );
  const [half] = cloudDrift(DUTCH_POLDER_SKY, 30);
  assert.ok(Math.abs(x - half * 2) < 1e-6, "drift is not linear in time");
});

test("shadow and sky read the same cloud", () => {
  // The whole point of one field: what darkens the ground is the cloud that
  // is actually overhead, at the same drift, shaped the same way.
  const drift = cloudDrift(DUTCH_POLDER_SKY, 137);
  const sun = [0, 1, 0];
  for (const [x, z] of [[0, 0], [40, -25], [-63, 18]]) {
    const overhead = cloudCoverAt(field, DUTCH_POLDER_SKY, x, z, drift);
    // Straight overhead, the occlusion query walks up and finds that cloud.
    const occluded = sunOcclusionAt(field, DUTCH_POLDER_SKY, x, 0, z, sun, drift);
    assert.ok(
      Math.abs(overhead - occluded) < 1e-9,
      `sky and shadow disagree at (${x}, ${z})`,
    );
    assert.ok(overhead >= 0 && overhead <= 1, "cover is not an opacity");
  }
});

test("a shallow puff shades the polder less than a deep one", () => {
  // Cover is the opacity of the whole column, so vertical development has to
  // reach the ground: a slab shaded everything the same.
  const weather = DUTCH_POLDER_SKY;
  const samples = [];
  for (let row = 0; row < 90; row += 1) {
    for (let column = 0; column < 90; column += 1) {
      const x = (column / 90) * 3 * weather.fieldScale;
      const z = (row / 90) * 3 * weather.fieldScale;
      if (cloudSilhouetteAt(field, weather, x, z, [0, 0]) < 0.95) continue;
      samples.push([
        sampleCloudTops(field, x, z, weather.fieldScale),
        cloudCoverAt(field, weather, x, z, [0, 0]),
      ]);
    }
  }
  assert.ok(samples.length > 200, `only ${samples.length} solidly covered points`);
  samples.sort((left, right) => left[0] - right[0]);
  const shallow = samples.slice(0, 40).reduce((sum, [, cover]) => sum + cover, 0) / 40;
  const deep = samples.slice(-40).reduce((sum, [, cover]) => sum + cover, 0) / 40;
  assert.ok(
    deep > shallow + 0.1,
    `deepest columns shade ${deep.toFixed(3)}, shallowest ${shallow.toFixed(3)}`,
  );
});

test("a low sun is occluded by the deck it has to cross", () => {
  // Kilometres of deck lie between a one-degree sun and the polder. The old
  // query gave up above three degrees of elevation and called it clear.
  const drift = [0, 0];
  const low = [0.9998, 0.02, 0];
  const crossing = cloudOpacityAlong(field, DUTCH_POLDER_SKY, [0, 1.7, 0], low, drift);
  assert.ok(crossing > 0.5, `a two-degree sun crosses the deck untouched: ${crossing}`);
  // Below the horizon there is nothing left to occlude.
  assert.equal(
    sunOcclusionAt(field, DUTCH_POLDER_SKY, 0, 1.7, 0, [0.99, -0.02, 0], drift),
    0,
  );
});

test("the sky shader is generated from the one law, and still grafts", () => {
  // Two implementations of the same cloud may differ in structure; they must
  // not differ in calibration. Every number the deck is shaped by is
  // interpolated into the GLSL from CLOUD_LAW, so there is nowhere to write
  // a second copy of one — which is exactly how a detail octave ended up in
  // the shader's silhouette and not in the model's.
  const sky = new SkyImpl();
  const before = sky.material.fragmentShader;
  const installed = installSkyClouds(sky.material);
  assert.ok(installed, "the graft found no anchor in the upstream sky shader");
  const source = sky.material.fragmentShader;
  assert.notEqual(source, before);
  for (const key of [
    "edgeSoftness", "topFloor", "shoulder", "coreFloor", "coreGain",
    "baseRamp", "topFade", "erosion", "erosionOnset", "stepSpan",
    "maxLod", "scatterFalloff", "scatterTransmit", "scatterSpread",
    "sunGain", "powder", "fillBase", "fillTop", "scatterCeiling",
  ]) {
    assert.ok(
      source.includes(String(CLOUD_LAW[key])),
      `${key} = ${CLOUD_LAW[key]} never reaches the shader`,
    );
  }
  assert.ok(source.includes("textureLod("), "the march still guesses its own mip level");
  assert.ok(!source.includes("texture2D(uCloudMap"), "a cloud tap is still derivative-driven");
  // A second graft onto the same material would double every uniform.
  assert.equal(installSkyClouds(sky.material), null);
});

/** The body of a GLSL function, by brace matching from its signature. */
function shaderFunction(source, signature) {
  const start = source.indexOf(signature);
  assert.ok(start >= 0, `${signature} is gone from the sky shader`);
  let depth = 0;
  for (let index = source.indexOf("{", start); index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`${signature} never closes`);
}

test("the march stays inside its lookup budget", () => {
  // Closing the aliasing with forty-eight steps, four lookups each and a full
  // second march toward the sun cost half the frame rate. What made twenty-four
  // steps and two lookups give the same picture — dome coverage moved by 0.003
  // — is that the mip level follows the step, and that the lean is applied
  // before anything is read, so shape, billow and column depth share a texel.
  const sky = new SkyImpl();
  installSkyClouds(sky.material);
  const source = sky.material.fragmentShader;
  const taps = (text) => (text.match(/textureLod\(uCloudMap/g) ?? []).length;

  const perSample = taps(shaderFunction(source, "vec3 cloudSample"))
    + taps(shaderFunction(source, "float cloudWideTap"));
  assert.equal(perSample, 2, `a density sample costs ${perSample} lookups, not 2`);

  const sunWalk = shaderFunction(source, "float cloudSunDepth");
  const sunSamples = (sunWalk.match(/cloudSample\(/g) ?? []).length;
  assert.equal(sunSamples, 1, `the walk toward the sun takes ${sunSamples} samples, not 1`);
  assert.equal(taps(sunWalk), 0, "the sun walk grew lookups of its own");

  // Every ray sampling at the same phase draws the sky in horizontal contour
  // bands: a heap gains or loses a whole sample as the elevation crosses a
  // threshold, and at two dozen samples that is a tenth of its brightness
  // stepping at once. The phase has to vary across the screen.
  const march = shaderFunction(source, "vec4 marchCumulus");
  assert.ok(march.includes("gl_FragCoord"), "the march samples every ray at one phase");

  const worst = CLOUD_LAW.maxSteps * perSample * (1 + sunSamples);
  assert.ok(worst <= 96, `a sky pixel can cost ${worst} lookups`);
  assert.ok(
    CLOUD_LAW.coarseSteps <= 6,
    "the environment bake is walking the deck at full detail six times over",
  );
});
