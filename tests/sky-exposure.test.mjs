import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { Sky as SkyImpl } from "three-stdlib";
import {
  AIR_LAW,
  elevationDegrees,
  multiScatterAt,
  nightLevel,
  setAirHaze,
  skyFill,
  skyRadiance,
  sunBeam,
  transmittanceAt,
} from "../games/make-a-mess/src/game/atmosphereModel.ts";
import { ATMOSPHERE, skyHaze } from "../games/make-a-mess/src/game/skyWeatherModel.ts";
import { installSkyClouds } from "../games/make-a-mess/src/game/skyClouds.ts";

/**
 * What the dome actually puts on screen.
 *
 * The sky is the one surface in these worlds whose brightness is not authored,
 * and for a long time it was not even computed: it came out of a third-party
 * analytic fit written for a sun that is up. That fit does not announce where
 * it stops working — it just looks like weather. Measured through our own
 * exposure, twelve degrees above a sun on the horizon rendered 162,159,144,
 * eighteen levels of chroma, and twelve degrees behind the observer rendered
 * 94,100,93, which is grey to within rounding.
 *
 * So these are evaluated, not eyeballed: the same law the shader is generated
 * from, then AgX at the exposure the renderer really uses. A screenshot cannot
 * fail; this can.
 */

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const mul3 = (m, v) => [
  m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
  m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
  m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
];

// ---------------------------------------------------------------------------
// AgX, verbatim from three/src/renderers/shaders/ShaderChunk. The OutputPass
// applies it; the exposure is read out of the renderer setup so this re-judges
// the sky whenever that number is touched.
// ---------------------------------------------------------------------------
const L_SRGB_TO_R2020 = [[0.6274, 0.3293, 0.0433], [0.0691, 0.9195, 0.0113], [0.0164, 0.088, 0.8956]];
const R2020_TO_L_SRGB = [[1.6605, -0.5876, -0.0728], [-0.1246, 1.1329, -0.0083], [-0.0182, -0.1006, 1.1187]];
const AgXInset = [
  [0.856627153315983, 0.0951212405381588, 0.0482516061458583],
  [0.137318972929847, 0.761241990602591, 0.101439036467562],
  [0.11189821299995, 0.0767994186031903, 0.811302368396859],
];
const AgXOutset = [
  [1.1271005818144368, -0.11060664309660323, -0.016493938717834573],
  [-0.1413297634984383, 1.157823702216272, -0.016493938717834257],
  [-0.14132976349843826, -0.11060664309660294, 1.2519364065950405],
];
const agxContrast = (x) => {
  const x2 = x * x;
  const x4 = x2 * x2;
  return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x
    + 0.4298 * x2 + 0.1191 * x - 0.00232;
};

const gameSource = readFileSync(
  new URL("../games/make-a-mess/src/game/MakeAMessGame.tsx", import.meta.url),
  "utf8",
);
const exposureMatch = gameSource.match(/toneMappingExposure\s*=\s*([\d.]+)/);
assert.ok(exposureMatch, "the renderer no longer sets a tone mapping exposure");
const TONE_MAPPING_EXPOSURE = Number(exposureMatch[1]);

function screenPixel(linear) {
  let c = linear.map((v) => v * TONE_MAPPING_EXPOSURE);
  c = mul3(AgXInset, mul3(L_SRGB_TO_R2020, c));
  c = c.map((v) => clamp((Math.log2(Math.max(v, 1e-10)) + 12.47393) / 16.499999, 0, 1));
  c = mul3(AgXOutset, c.map(agxContrast));
  c = mul3(R2020_TO_L_SRGB, c.map((v) => Math.pow(Math.max(0, v), 2.2)));
  return c
    .map((v) => clamp(v, 0, 1))
    .map((v) => Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055)));
}

const luminance = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const chroma = (p) => Math.max(...p) - Math.min(...p);
const dirAt = (elevationDeg, azimuthDeg) => {
  const e = (elevationDeg * Math.PI) / 180;
  const a = (azimuthDeg * Math.PI) / 180;
  return [Math.cos(e) * Math.cos(a), Math.sin(e), Math.cos(e) * Math.sin(a)];
};
const sunAt = (elevationDeg) => dirAt(elevationDeg, 0);
const angleTo = (a, b) =>
  (Math.acos(clamp(a[0] * b[0] + a[1] * b[1] + a[2] * b[2], -1, 1)) * 180) / Math.PI;
const sky = (view, sun) => skyRadiance(view, sun);
const pixel = (view, sun) => screenPixel(sky(view, sun));

/**
 * The threshold UnrealBloom is built with. Its high pass does not pass the
 * EXCESS over this — it passes the whole colour of any pixel above it, so
 * anything the sky routinely exceeds becomes a full-brightness light source
 * smeared back over the frame.
 */
const postSource = readFileSync(
  new URL("../games/make-a-mess/src/game/CinematicPostProcessing.tsx", import.meta.url),
  "utf8",
);
const bloomMatch = postSource.match(/new UnrealBloomPass\(([\s\S]*?)\);/);
assert.ok(bloomMatch, "the bloom pass is no longer constructed here");
const bloomNumbers = bloomMatch[1].match(/[\d.]+/g) ?? [];
const BLOOM_THRESHOLD = Number(bloomNumbers[bloomNumbers.length - 1]);
assert.ok(
  BLOOM_THRESHOLD > 0 && BLOOM_THRESHOLD < 100,
  `read ${BLOOM_THRESHOLD} as the bloom threshold — the argument list moved`,
);

test.beforeEach(() => setAirHaze(skyHaze("town")));

// ---------------------------------------------------------------------------
// One law, two executions
// ---------------------------------------------------------------------------

test("the shader is generated from the law, and carries no second exposure", () => {
  const dome = new SkyImpl();
  const installed = installSkyClouds(dome.material);
  assert.ok(installed, "the graft found no anchor in the upstream sky shader");
  const source = dome.material.fragmentShader;

  // Every coefficient the air is made of has to reach the GPU from AIR_LAW.
  // Two hand-written copies of the same number is exactly how the cloud deck
  // and its own ground shadow once ended up describing different clouds.
  const perMm = (value) => value * 1e6;
  for (const [name, value] of [
    ["planet radius", AIR_LAW.planetRadius / 1e6],
    ["atmosphere radius", AIR_LAW.atmosphereRadius / 1e6],
    ["rayleigh red", perMm(AIR_LAW.rayleighScatter[0])],
    ["rayleigh green", perMm(AIR_LAW.rayleighScatter[1])],
    ["rayleigh blue", perMm(AIR_LAW.rayleighScatter[2])],
    ["ozone red", perMm(AIR_LAW.ozoneAbsorb[0])],
    ["ozone green", perMm(AIR_LAW.ozoneAbsorb[1])],
    ["ozone blue", perMm(AIR_LAW.ozoneAbsorb[2])],
    ["mie scatter", perMm(AIR_LAW.mieScatter)],
    ["rayleigh scale height", AIR_LAW.rayleighHeight / 1e6],
    ["mie scale height", AIR_LAW.mieHeight / 1e6],
    ["ozone centre", AIR_LAW.ozoneCentre / 1e6],
    ["solar irradiance", AIR_LAW.solarIrradiance],
  ]) {
    const literal = Number.isInteger(value) ? value.toFixed(1) : String(value);
    assert.ok(
      source.includes(literal),
      `${name} (${literal}) never reached the generated shader`,
    );
  }

  // The dome leaves the shader in scene-linear radiance. A trailing scale is
  // how the sky and the light falling on the ground drifted apart before.
  assert.match(
    source,
    /gl_FragColor = vec4\(\s*retColor,\s*1\.0\s*\)/,
    "something still scales the dome's output on its way out",
  );
  assert.ok(
    !source.includes("uSkyExposure"),
    "the old display-referred exposure is still in the shader",
  );
  // The march has to read both tables, or the air is single-scattering again.
  assert.ok(source.includes("uAirTransmittance"), "no transmittance table");
  assert.ok(source.includes("uAirMultiScatter"), "no multiple-scattering table");
  assert.ok(
    dome.material.uniforms.uAirHaze.value > 0,
    "the world's aerosol never reached the dome",
  );

  // The planet is measured in megametres on the GPU on purpose: at metres a
  // float32 quantises the ray-sphere discriminant to steps of four million.
  assert.ok(
    !source.includes("6360000"),
    "the shader is back on metre-scale planet arithmetic, which float32 cannot hold",
  );
});

test("the march budget is fixed and small", () => {
  // Two table reads per step, and the tables are what make that enough: the
  // expensive integral does not depend on the hour, so it is not paid per
  // pixel. The cloud deck above this is allowed 96 samples; the air must stay
  // a fraction of it or an open horizon costs more than the weather does.
  // Author ceiling is 16 (was 24): phase dither + elevation scale keep the
  // picture, gpuQuality can still descend further via qualityViewSteps.
  assert.equal(AIR_LAW.viewSteps, 16);
  assert.equal(AIR_LAW.qualityViewSteps[2], AIR_LAW.viewSteps);
  assert.ok(AIR_LAW.viewSteps * 2 <= 40, "the air march outgrew its budget");
  assert.ok(
    AIR_LAW.coarseViewSteps <= 8,
    "the environment bake draws this sky six times per relight",
  );
  assert.deepEqual(
    [...AIR_LAW.qualityViewSteps],
    [6, 10, 16],
    "live quality ceilings drifted without a documented budget change",
  );
});
// ---------------------------------------------------------------------------
// The anchor
// ---------------------------------------------------------------------------

test("a clear day sky lands where the tone mapper still holds colour", () => {
  for (const sunElevation of [20, 30, 45, 60]) {
    const sun = sunAt(sunElevation);
    const level = luminance(sky(dirAt(88, 0), sun));
    // Middle grey is 0.18. A clear zenith belongs about a stop and a half over
    // it: below this it is a dull evening at noon, above it AgX is on its
    // shoulder and the blue starts leaving.
    assert.ok(
      level > 0.3 && level < 0.7,
      `zenith at sun ${sunElevation}° is ${level.toFixed(2)} linear, outside 0.30–0.70`,
    );
    // The bluest sky is not overhead, it is a right angle away from the sun.
    const away = pixel(dirAt(45, 180), sun);
    assert.ok(
      chroma(away) >= 30,
      `the sky away from a sun at ${sunElevation}° renders ${away.join(",")}`
        + ` — only ${chroma(away)} levels of chroma`,
    );
    assert.ok(away[2] > away[0], "the sky away from the sun is no longer blue");
  }
});

// ---------------------------------------------------------------------------
// Dusk — the whole reason this model replaced a formula
// ---------------------------------------------------------------------------

test("the warm gradient is tall, not a five-degree band on a grey ceiling", () => {
  const sun = sunAt(0);
  // The fit this replaced gave 47, 18 and 13 levels of chroma at these three
  // heights: warm at the horizon and grey by twelve degrees up. Colour has to
  // survive the climb, because that climb is most of the frame.
  const heights = [6, 12, 20];
  const measured = heights.map((height) => chroma(pixel(dirAt(height, 0), sun)));
  assert.ok(
    measured[0] >= 50,
    `six degrees over a setting sun has only ${measured[0]} levels of chroma`,
  );
  assert.ok(
    measured[1] >= 28,
    `twelve degrees up has ${measured[1]} levels of chroma — the old fit gave 18`,
  );
  for (const [index, height] of heights.entries()) {
    const p = pixel(dirAt(height, 0), sun);
    assert.ok(
      p[0] > p[2],
      `${height}° over a setting sun renders ${p.join(",")} — not warm at all`,
    );
    if (index > 0) {
      assert.ok(
        measured[index] <= measured[index - 1],
        "the warm band has to fade upward, not grow",
      );
    }
  }
});

test("ozone keeps the zenith blue over an orange horizon", () => {
  // This is the term the old sky did not have, and the single reason a
  // twilight overhead is blue rather than the brown-grey that Rayleigh and
  // dust alone produce: ozone absorbs orange and green and almost no blue,
  // and at dusk the beam runs the length of its layer instead of across it.
  for (const sunElevation of [2, 0, -2]) {
    const sun = sunAt(sunElevation);
    const zenith = sky(dirAt(88, 0), sun);
    assert.ok(
      zenith[2] > zenith[0] * 1.25,
      `at a sun of ${sunElevation}° the zenith is ${zenith.map((v) => v.toFixed(3)).join(",")}`
        + " — that is a grey ceiling, not a twilight sky",
    );
    const horizon = sky(dirAt(2, 0), sun);
    assert.ok(
      horizon[0] > horizon[2],
      `the horizon under that zenith is not warm: ${horizon.map((v) => v.toFixed(3)).join(",")}`,
    );
  }
});

test("the Belt of Venus stands on the Earth's own shadow", () => {
  const sun = sunAt(0);
  const band = pixel(dirAt(4, 180), sun);
  // The old sky rendered this 98,84,59 at 39 levels of chroma — a dark brown
  // smear. It is a pink band, and it is there because the air four degrees up
  // behind you is still lit by a beam that has been reddened by its own path.
  assert.ok(
    chroma(band) >= 55,
    `the anti-solar band renders ${band.join(",")} — only ${chroma(band)} levels of chroma`,
  );
  assert.ok(band[0] > band[2], "the anti-solar band is not warm");
  // And it must SIT ON something darker: the planet's shadow, rising.
  const below = luminance(sky(dirAt(0.5, 180), sun));
  const inside = luminance(sky(dirAt(4, 180), sun));
  assert.ok(
    inside > below,
    `the band (${inside.toFixed(3)}) is no brighter than the shadow under it`
      + ` (${below.toFixed(3)}) — there is no shadow being cast`,
  );
});

test("multiple scattering carries the twilight, but never takes it over", () => {
  // A pure single-scattering dusk has no blue anywhere, because the beam that
  // lights it has already lost the blue. Overdo the correction and the whole
  // sky flattens: at 4π too large it washed a sunset back to 15 levels of
  // chroma and made a noon zenith three times too bright.
  for (const [sunElevation, view] of [[40, dirAt(88, 0)], [0, dirAt(88, 0)], [0, dirAt(25, 180)]]) {
    const sun = sunAt(sunElevation);
    const height = 2;
    const bounced = multiScatterAt(height, sun[1]);
    assert.ok(
      bounced.every((v) => v >= 0 && v < 0.05),
      `the bounced term at ${sunElevation}° left its range: ${bounced.join(",")}`,
    );
    const total = luminance(sky(view, sun));
    assert.ok(total > 0, "the sky went black");
  }
});

// ---------------------------------------------------------------------------
// The light that leaves the sky and lands on the world
// ---------------------------------------------------------------------------

test("the beam reddens because of the air, and then stops", () => {
  const table = [
    // elevation, green/red at most, green/red at least
    [30, 0.95, 0.78],
    [10, 0.72, 0.55],
    [4, 0.55, 0.30],
    [2, 0.38, 0.16],
    [0, 0.15, 0.0],
  ];
  let previous = Infinity;
  for (const [elevation, upper, lower] of table) {
    const beam = sunBeam(Math.sin((elevation * Math.PI) / 180));
    const ratio = beam.colour[1] / Math.max(beam.colour[0], 1e-9);
    assert.ok(
      ratio <= upper && ratio >= lower,
      `at ${elevation}° the beam is ${beam.colour.map((v) => v.toFixed(2)).join(",")}`
        + ` — green/red ${ratio.toFixed(2)}, outside ${lower}..${upper}`,
    );
    assert.ok(beam.level < previous, "the beam has to weaken as the sun drops");
    previous = beam.level;
  }
  // A sunset frame is lit by the SKY. A key light that stays strong to the
  // last moment is the loudest tell that a world's dusk was drawn, not lit.
  const noon = sunBeam(Math.sin((37.6 * Math.PI) / 180)).level;
  const horizon = sunBeam(0).level;
  assert.ok(
    horizon < noon * 0.15,
    `the beam still carries ${(100 * horizon / noon).toFixed(0)}% of its noon strength`
      + " with the sun on the horizon",
  );
  assert.equal(sunBeam(Math.sin((-2 * Math.PI) / 180)).level, 0);
});

test("the fill outlives the beam, and turns warm as it does", () => {
  const noon = skyFill(sunAt(37.6));
  const dusk = skyFill(sunAt(0));
  assert.ok(noon.colour[2] > noon.colour[0] * 2, "a midday fill is not blue");
  assert.ok(dusk.colour[0] > noon.colour[0] * 2, "the fill never warms at dusk");
  // At the moment the sun touches the horizon the sky is doing ALL of the
  // lighting: the fill must still be there when the beam has gone.
  const beam = sunBeam(0).level;
  assert.ok(
    dusk.level > beam,
    `the fill (${dusk.level.toFixed(3)}) died before the beam (${beam.toFixed(3)})`,
  );
  assert.ok(dusk.level < noon.level * 0.35, "the fill barely dims at dusk");
  assert.ok(skyFill(sunAt(-9)).level < noon.level * 0.01, "twilight never ends");
});

test("a cumulus is lit at its own altitude, so it burns after the ground is dark", () => {
  // Cloud base for the polder deck. This lookup is the whole mechanism behind
  // a sky that is still on fire when the field below it has gone to shadow.
  const base = 680;
  for (const elevation of [4, 2, 0]) {
    const sine = Math.sin((elevation * Math.PI) / 180);
    const ground = transmittanceAt(0, sine);
    const cloud = transmittanceAt(base, sine);
    assert.ok(
      cloud[0] > ground[0],
      `at ${elevation}° the cloud base gets no more red than the ground`,
    );
  }
  // A degree past sunset the ground has nothing left and the deck still does.
  const after = Math.sin((-1 * Math.PI) / 180);
  assert.equal(transmittanceAt(0, after)[0], 0);
  assert.ok(
    transmittanceAt(base, after)[0] > 0.01,
    "the deck goes dark at the same instant the ground does",
  );
});

test("night arrives at civil twilight, not while the sun is still up", () => {
  // The old ramp had the lamps at full strength and the cloud deck painted in
  // night colours with the sun visibly on the horizon.
  assert.equal(nightLevel(Math.sin((5 * Math.PI) / 180)), 0);
  assert.ok(nightLevel(0) < 0.1, "it is night at the moment of sunset");
  assert.ok(nightLevel(Math.sin((-6 * Math.PI) / 180)) > 0.6, "civil twilight never darkens");
  assert.equal(nightLevel(Math.sin((-12 * Math.PI) / 180)), 1);
  assert.equal(elevationDegrees(0), 0);
});

// ---------------------------------------------------------------------------
// Glare keeps a physical source
// ---------------------------------------------------------------------------

const GLARE_REACH_DEGREES = 25;
const GLARE_DOME_FRACTION = 0.06;

test("the sky is not a light source: only the sun's own aureole blooms", () => {
  for (const theme of ["town", "fortress"]) {
    setAirHaze(skyHaze(theme));
    for (const sunElevation of [2, 5, 10, 20, 40, 60]) {
      const sun = sunAt(sunElevation);
      let reach = 0;
      let blooming = 0;
      let dome = 0;
      for (let elevation = 1; elevation < 90; elevation += 2) {
        for (let azimuth = 0; azimuth < 360; azimuth += 6) {
          const direction = dirAt(elevation, azimuth);
          // Solid angle: a ring near the zenith is a great deal smaller than
          // one at the horizon, and counting samples instead of sky would let
          // a blown zenith hide behind an honest horizon.
          const solidAngle = Math.cos((elevation * Math.PI) / 180);
          dome += solidAngle;
          if (luminance(sky(direction, sun)) <= BLOOM_THRESHOLD) continue;
          blooming += solidAngle;
          reach = Math.max(reach, angleTo(direction, sun));
        }
      }
      assert.ok(
        reach <= GLARE_REACH_DEGREES,
        `${theme} sky is over the ${BLOOM_THRESHOLD} high-pass ${reach.toFixed(0)}° from a sun`
          + ` at ${sunElevation}° — that is a glowing dome, not an aureole`,
      );
      assert.ok(
        blooming / dome <= GLARE_DOME_FRACTION,
        `${theme} at a sun of ${sunElevation}°: ${((100 * blooming) / dome).toFixed(1)}% of the sky`
          + " feeds the bloom pass, and every bit of it is veiling glare over the ground",
      );
    }
  }
});

test("every authored air stays inside the same calibration", () => {
  const sun = sunAt(40);
  for (const theme of ["town", "fortress"]) {
    for (const cinematic of [false, true]) {
      setAirHaze(skyHaze(theme, cinematic));
      const label = `${theme}${cinematic ? " cinematic" : ""}`;
      const zenith = luminance(sky(dirAt(88, 0), sun));
      const horizon = luminance(sky(dirAt(2, 180), sun));
      assert.ok(
        zenith > 0.25 && zenith < 0.8,
        `${label} zenith is ${zenith.toFixed(2)} linear`,
      );
      assert.ok(
        horizon < BLOOM_THRESHOLD,
        `${label} horizon is ${horizon.toFixed(2)} linear, over the bloom threshold`,
      );
      // Haze rises toward the horizon in every air we author; a dome that
      // does not is a painted ceiling.
      assert.ok(
        horizon > zenith,
        `${label} has no aerial perspective: horizon ${horizon.toFixed(2)} vs zenith ${zenith.toFixed(2)}`,
      );
    }
  }
});

test("the fortress keeps the heaviest air, and a flyover the thinnest", () => {
  const sun = sunAt(40);
  // Aerosol is not a whiter tint: it is forward scattering, so what it moves
  // is the ratio between the sky twenty degrees off the sun and overhead.
  const forwardRatio = (theme, cinematic) => {
    setAirHaze(skyHaze(theme, cinematic));
    return luminance(sky(dirAt(20, 0), sun)) / luminance(sky(dirAt(88, 0), sun));
  };
  const cinematic = forwardRatio("town", true);
  const town = forwardRatio("town", false);
  const fortress = forwardRatio("fortress", false);
  assert.ok(
    cinematic < town && town < fortress,
    `forward scatter is out of order: flyover ${cinematic.toFixed(2)},`
      + ` open country ${town.toFixed(2)}, volcanic ${fortress.toFixed(2)}`,
  );
  assert.ok(ATMOSPHERE.fortress.haze > ATMOSPHERE.town.haze);
  assert.ok(ATMOSPHERE.cinematic.haze < ATMOSPHERE.town.haze);
});

// ---------------------------------------------------------------------------
// Vegetation stands in the same day as the ground it grows out of
// ---------------------------------------------------------------------------

test("nothing hand-shaded lights itself by a curve of its own", () => {
  // Grass, reeds, ivy and weeds are hand-shaded blades: they take no part in
  // the scene's lighting and need a brightness handed to them. That brightness
  // used to be drawn as a curve of the old day/night ramp, and when the ramp
  // became a measurement the curve stayed put. The cost was exact — with the
  // sun 3.5° up the reeds stood at FULL midday brightness against the world's
  // 42%, and three degrees under the horizon the grass held 69% against
  // 0.7%. A hundredfold. It read as a field lit by nothing at all.
  for (const file of ["GrassField.tsx", "Undergrowth.tsx"]) {
    const source = readFileSync(
      new URL(`../games/make-a-mess/src/game/${file}`, import.meta.url),
      "utf8",
    );
    assert.ok(
      source.includes("environmentState.groundLight"),
      `${file} no longer lights itself from the measured ground light`,
    );
    assert.ok(
      !/1 - night \* 0\.\d/.test(source),
      `${file} has grown a hand-drawn brightness curve again`,
    );
    assert.ok(
      !source.includes("nightRef"),
      `${file} is back to shading itself off the night factor`,
    );
  }

  // And the measurement it reads has to actually fall off with the light.
  const level = (elevation) => {
    const beam = sunBeam(Math.sin((elevation * Math.PI) / 180));
    const fill = skyFill(sunAt(elevation));
    // Mirrors WorldEnvironment: the same gains the scene's own lights get.
    return (4.64 * beam.level + 0.3 * fill.level) / (4.64 * 0.906 + 0.3 * 1.532);
  };
  assert.ok(Math.abs(level(37.6) - 1) < 0.02, "a clear midday is no longer 1");
  const golden = level(3.5);
  assert.ok(
    golden > 0.3 && golden < 0.6,
    `the golden hour lands at ${golden.toFixed(2)} of midday`,
  );
  assert.ok(level(0) < 0.2, `a sun on the horizon still gives ${level(0).toFixed(2)}`);
  assert.ok(level(-3) < 0.02, `three degrees under gives ${level(-3).toFixed(3)}`);
});

test("the noon anchor every gain hangs from is still what the model says", () => {
  // WorldEnvironment converts a measured atmosphere into three's light units
  // against ONE moment: a clear polder midday. Those two numbers are written
  // down there rather than evaluated, because the model's tables are built per
  // world air and the anchor must not move with the world. Written down is
  // fine; written down and unchecked is the hardcode with nothing behind it.
  const source = readFileSync(
    new URL("../games/make-a-mess/src/game/WorldEnvironment.tsx", import.meta.url),
    "utf8",
  );
  const anchor = source.match(/const NOON = \{ beam: ([\d.]+), fill: ([\d.]+) \}/);
  assert.ok(anchor, "the noon anchor is no longer a single declaration");

  setAirHaze(skyHaze("town"));
  const noon = 37.6;
  const beam = sunBeam(Math.sin((noon * Math.PI) / 180)).level;
  const fill = skyFill(sunAt(noon)).level;
  assert.ok(
    Math.abs(Number(anchor[1]) - beam) < 0.005,
    `the anchored noon beam is ${anchor[1]}, the model now gives ${beam.toFixed(3)}`,
  );
  assert.ok(
    Math.abs(Number(anchor[2]) - fill) < 0.01,
    `the anchored noon fill is ${anchor[2]}, the model now gives ${fill.toFixed(3)}`,
  );
  // And it must be used everywhere the noon is referred to, not copied.
  assert.equal(
    (source.match(/0\.906|1\.532/g) ?? []).length,
    2,
    "the noon measurement has been copied out of the anchor again",
  );
});
