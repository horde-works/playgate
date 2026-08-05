import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { Sky as SkyImpl } from "three-stdlib";
import {
  ATMOSPHERE,
  skyAir,
} from "../games/make-a-mess/src/game/skyWeatherModel.ts";
import { installSkyClouds } from "../games/make-a-mess/src/game/skyClouds.ts";

/**
 * What the dome actually puts on screen.
 *
 * The sky is the one surface in these worlds whose brightness we do not
 * author: it comes out of a third-party analytic shader that was written to
 * be drawn straight to an sRGB framebuffer, and our composer reads it as
 * scene-linear radiance and tone-maps it a second time. That mismatch does not
 * announce itself — it looks like weather. It cost a whole map's midtones once
 * already: at exposure 1, a quarter of the sky sat above the bloom high-pass
 * and was blurred back over the frame as veiling glare, and every direction
 * ten degrees up rendered between 215 and 243 with under ten levels of chroma.
 *
 * So the numbers below are evaluated, not eyeballed: the upstream Preetham
 * shader and our graft on it, ported here in double precision, then AgX at the
 * exposure the renderer really uses. A screenshot cannot fail; this can.
 */

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const mul3 = (m, v) => [
  m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
  m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
  m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
];

// ---------------------------------------------------------------------------
// The upstream sky, verbatim from three-stdlib/objects/Sky.js. We do not own
// these constants; they are pinned here so a package bump that moves the sky's
// level shows up as a failure instead of as a mood.
// ---------------------------------------------------------------------------
const totalRayleigh = [5.804542996261093e-6, 1.3562911419845635e-5, 3.0265902468824876e-5];
const MieConst = [1.8399918514433978e14, 2.7798023919660528e14, 4.0790479543861094e14];
const cutoffAngle = 1.6110731556870734;
const rayleighZenithLength = 8.4e3;
const mieZenithLength = 1.25e3;

const sunIntensity = (cosZenith) =>
  1000 * Math.max(0, 1 - Math.exp(-((cutoffAngle - Math.acos(clamp(cosZenith, -1, 1))) / 1.5)));
const totalMie = (T) => MieConst.map((k) => 0.434 * (0.2 * T * 10e-18) * k);
const rayleighPhase = (c) => 0.05968310365946075 * (1 + c * c);
const hgPhase = (c, g) => 0.07957747154594767 * ((1 - g * g) / Math.pow(1 - 2 * g * c + g * g, 1.5));

/** Linear radiance leaving the dome for one view direction, exposure included. */
function domeRadiance(direction, sun, air, exposure = ATMOSPHERE.exposure) {
  const sunE = sunIntensity(sun[1]);
  // sunPosition is tens of world units, so exp(y / 450000) is 1 and sunfade is 1.
  const sunfade = 1;
  const betaR = totalRayleigh.map((v) => v * air.rayleigh);
  const betaM = totalMie(air.turbidity).map((v) => v * air.mieCoefficient);

  const zenithAngle = Math.acos(Math.max(0, direction[1]));
  const inv = 1 / (Math.cos(zenithAngle)
    + 0.15 * Math.pow(93.885 - (zenithAngle * 180) / Math.PI, -1.253));
  const Fex = [0, 1, 2].map((i) =>
    Math.exp(-(betaR[i] * rayleighZenithLength * inv + betaM[i] * mieZenithLength * inv)));

  const cosTheta = direction[0] * sun[0] + direction[1] * sun[1] + direction[2] * sun[2];
  const rPhase = rayleighPhase(cosTheta * 0.5 + 0.5);
  const mPhase = hgPhase(cosTheta, air.mieDirectionalG);
  const ratio = [0, 1, 2].map((i) =>
    (betaR[i] * rPhase + betaM[i] * mPhase) / (betaR[i] + betaM[i]));
  let Lin = [0, 1, 2].map((i) => Math.pow(sunE * ratio[i] * (1 - Fex[i]), 1.5));
  const w = clamp(Math.pow(1 - sun[1], 5), 0, 1);
  Lin = Lin.map((v, i) => v * (1 - w + w * Math.pow(sunE * ratio[i] * Fex[i], 0.5)));

  // Our graft: a geometric disc with limb darkening, inside a two-term aureole.
  const sunAlt = (Math.asin(clamp(sun[1], -1, 1)) * 180) / Math.PI;
  const rayAlt = (Math.asin(clamp(direction[1], -1, 1)) * 180) / Math.PI;
  const flat = (v) => {
    const l = Math.hypot(v[0], v[2]) || 1e-9;
    return [v[0] / l, v[2] / l];
  };
  const [rx, rz] = flat(direction);
  const [sx, sz] = flat(sun);
  const bearing = ((Math.acos(clamp(rx * sx + rz * sz, -1, 1)) * 180) / Math.PI)
    * Math.cos((sunAlt * Math.PI) / 180);
  const discRadius = Math.hypot(bearing, rayAlt - sunAlt) / 0.2666;
  const aureole = 0.035 / (1 + Math.pow(discRadius / 1.9, 2.2))
    + 0.004 / (1 + Math.pow(discRadius / 11, 1.9));
  const limbCos = Math.sqrt(Math.max(0, 1 - discRadius * discRadius));
  const limb = 1 - 0.6 * (1 - limbCos) - 0.07 * (1 - limbCos * limbCos);
  const disc = discRadius <= 1 ? Math.max(limb, 0) : 0;

  const bias = [0, 0.0003, 0.00075];
  return [0, 1, 2].map((i) => {
    const L0 = 0.1 * Fex[i] + sunE * Fex[i] * (19000 * disc + aureole);
    const texColor = (Lin[i] + L0) * 0.04 + bias[i];
    return Math.pow(Math.max(texColor, 0), 1 / (1.2 + 1.2 * sunfade)) * exposure;
  });
}

// ---------------------------------------------------------------------------
// AgX, verbatim from three/src/renderers/shaders/ShaderChunk. The OutputPass
// applies it; the exposure is read out of the renderer setup below so this
// test re-judges the sky whenever that number is touched.
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
// resolution, strength, radius, THRESHOLD — the threshold is the last of them,
// and strength may be a ternary, so take the final literal rather than a slot.
const bloomNumbers = bloomMatch[1].match(/[\d.]+/g) ?? [];
const BLOOM_THRESHOLD = Number(bloomNumbers[bloomNumbers.length - 1]);
assert.ok(
  BLOOM_THRESHOLD > 0 && BLOOM_THRESHOLD < 100,
  `read ${BLOOM_THRESHOLD} as the bloom threshold — the argument list moved`,
);

test("the exposure reaches the shader and multiplies what the dome emits", () => {
  const sky = new SkyImpl();
  const installed = installSkyClouds(sky.material);
  assert.ok(installed, "the graft found no anchor in the upstream sky shader");
  const source = sky.material.fragmentShader;
  assert.match(
    source,
    /gl_FragColor = vec4\(\s*retColor \* uSkyExposure,\s*1\.0\s*\)/,
    "the dome's output is no longer scaled by its exposure",
  );
  assert.equal(sky.material.uniforms.uSkyExposure.value, ATMOSPHERE.exposure);
  // Applied LAST, after the cloud decks and the beams, or air and cloud leave
  // the shader in different units.
  assert.ok(
    source.lastIndexOf("uSkyExposure") > source.indexOf("cloudBeams(skyRayOrigin"),
    "the exposure is applied before the sky is finished being drawn",
  );
});

test("a clear day sky lands where the tone mapper still holds colour", () => {
  const air = skyAir("town");
  for (const sunElevation of [20, 30, 45, 60]) {
    const sun = sunAt(sunElevation);
    const zenith = domeRadiance(dirAt(88, 0), sun, air);
    const level = luminance(zenith);
    // Middle grey is 0.18. A clear zenith belongs about a stop and a half over
    // it: below this it is a dull evening at noon, above it AgX is on its
    // shoulder and the blue starts leaving.
    assert.ok(
      level > 0.3 && level < 0.7,
      `zenith at sun ${sunElevation}° is ${level.toFixed(2)} linear, outside 0.30–0.70`,
    );
    // The bluest sky is not overhead, it is a right angle away from the sun —
    // and at a high sun the zenith is not that. Judge the colour where the
    // colour is, or the check drifts with the season.
    const pixel = screenPixel(domeRadiance(dirAt(45, 180), sun, air));
    assert.ok(
      chroma(pixel) >= 30,
      `the sky away from a sun at ${sunElevation}° renders ${pixel.join(",")}`
        + ` — only ${chroma(pixel)} levels of chroma`,
    );
    assert.ok(pixel[2] > pixel[0], "the sky away from the sun is no longer blue");
  }
});

/**
 * Glare belongs to the sun, and to the air immediately around it. Heavy air
 * with a low sun really does throw a bright circumsolar wash, and it should
 * bloom — that is what forward scattering looks like. What must never happen
 * again is the DOME becoming the source: at exposure 1 the sky stayed over the
 * high-pass 122° away from a noon sun, a fifth to a third of the whole
 * hemisphere, and UnrealBloom blurred all of it back down over the ground.
 */
const GLARE_REACH_DEGREES = 25;
const GLARE_DOME_FRACTION = 0.06;

test("the sky is not a light source: only the sun's own aureole blooms", () => {
  for (const [name, air] of [
    ["town", skyAir("town")],
    ["fortress", skyAir("fortress")],
    ["cinematic", skyAir("town", true)],
  ]) {
    for (const sunElevation of [2, 5, 10, 20, 40, 60]) {
      const sun = sunAt(sunElevation);
      let reach = 0;
      let blooming = 0;
      let dome = 0;
      for (let elevation = 1; elevation < 90; elevation += 1) {
        for (let azimuth = 0; azimuth < 360; azimuth += 3) {
          const direction = dirAt(elevation, azimuth);
          // Solid angle: a ring near the zenith is a great deal smaller than
          // one at the horizon, and counting samples instead of sky would let
          // a blown zenith hide behind an honest horizon.
          const solidAngle = Math.cos((elevation * Math.PI) / 180);
          dome += solidAngle;
          if (luminance(domeRadiance(direction, sun, air)) <= BLOOM_THRESHOLD) continue;
          blooming += solidAngle;
          reach = Math.max(reach, angleTo(direction, sun));
        }
      }
      assert.ok(
        reach <= GLARE_REACH_DEGREES,
        `${name} sky is still over the ${BLOOM_THRESHOLD} high-pass ${reach.toFixed(0)}° from a sun`
          + ` at ${sunElevation}° — that is a glowing dome, not an aureole`,
      );
      assert.ok(
        blooming / dome <= GLARE_DOME_FRACTION,
        `${name} at a sun of ${sunElevation}°: ${((100 * blooming) / dome).toFixed(1)}% of the sky`
          + " feeds the bloom pass, and every bit of it is veiling glare over the ground",
      );
    }
  }
});

test("the sun still overexposes, so glare keeps a physical source", () => {
  const air = skyAir("town");
  for (const sunElevation of [15, 30, 55]) {
    const sun = sunAt(sunElevation);
    const disc = luminance(domeRadiance(sun, sun, air));
    // AgX reaches white at about 16 linear; the disc has to be far past it, or
    // the one thing in the frame that should blow out stops blowing out.
    assert.ok(
      disc > BLOOM_THRESHOLD * 8,
      `the solar disc is only ${disc.toFixed(0)} linear at ${sunElevation}°`,
    );
    assert.deepEqual(screenPixel(domeRadiance(sun, sun, air)), [255, 255, 255]);
    // And the aureole is a few degrees wide, not a quarter of the sky.
    const wide = luminance(domeRadiance(dirAt(sunElevation + 20, 0), sun, air));
    assert.ok(
      wide < BLOOM_THRESHOLD * 0.75,
      `20° off the disc is still ${wide.toFixed(2)} linear — that is a halo, not an aureole`,
    );
  }
});

test("dusk is red because the air is thin enough to redden", () => {
  const air = skyAir("town");
  const sun = sunAt(0.4);
  // Fifteen degrees along the horizon from the sun: clear of the aureole, which
  // is white whatever the air is made of, and inside the band of sky a sunset
  // is actually looked at. The old industrial turbidity gave 46 levels of
  // chroma here — a pale smear where the long red path belongs.
  const horizon = screenPixel(domeRadiance(dirAt(2, 15), sun, air));
  assert.ok(
    chroma(horizon) >= 55,
    `the setting sun's horizon renders ${horizon.join(",")} — only ${chroma(horizon)} levels of chroma`,
  );
  assert.ok(horizon[0] > horizon[2] + 40, "the low sun no longer reddens its own horizon");
  // Overhead at the same moment is still sky, not black.
  const overhead = luminance(domeRadiance(dirAt(70, 180), sun, air));
  assert.ok(overhead > 0.02 && overhead < 0.3, `dusk zenith is ${overhead.toFixed(3)} linear`);
});

test("every authored air stays inside the same calibration", () => {
  const sun = sunAt(40);
  for (const theme of ["town", "fortress"]) {
    for (const cinematic of [false, true]) {
      const air = skyAir(theme, cinematic);
      const zenith = luminance(domeRadiance(dirAt(88, 0), sun, air));
      const horizon = luminance(domeRadiance(dirAt(2, 180), sun, air));
      assert.ok(
        zenith > 0.25 && zenith < 0.8,
        `${theme}${cinematic ? " cinematic" : ""} zenith is ${zenith.toFixed(2)} linear`,
      );
      assert.ok(
        horizon < BLOOM_THRESHOLD,
        `${theme}${cinematic ? " cinematic" : ""} horizon is ${horizon.toFixed(2)} linear, over the bloom threshold`,
      );
      // Haze rises toward the horizon in every air we author; a dome that
      // does not is a painted ceiling.
      assert.ok(
        horizon > zenith,
        `${theme}${cinematic ? " cinematic" : ""} has no aerial perspective: horizon ${horizon.toFixed(2)} vs zenith ${zenith.toFixed(2)}`,
      );
    }
  }
});

test("the fortress keeps the heaviest air, and a flyover the thinnest", () => {
  const sun = sunAt(40);
  // Haze is forward scattering, not a whiter tint: the zenith hue barely moves
  // with turbidity, so measure what does — how much brighter the sky is twenty
  // degrees off the sun than it is overhead.
  const forwardRatio = (air) =>
    luminance(domeRadiance(dirAt(20, 0), sun, air))
    / luminance(domeRadiance(dirAt(88, 0), sun, air));
  const cinematic = forwardRatio(skyAir("town", true));
  const town = forwardRatio(skyAir("town"));
  const fortress = forwardRatio(skyAir("fortress"));
  assert.ok(
    cinematic < town && town < fortress,
    `forward scatter is out of order: flyover ${cinematic.toFixed(2)},`
      + ` open country ${town.toFixed(2)}, volcanic ${fortress.toFixed(2)}`,
  );
  assert.ok(fortress > 3.5, `the volcanic sky is only ${fortress.toFixed(2)} — that is open country`);
});
